const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    InteractionContextType,
    ApplicationIntegrationType,
} = require("discord.js");
const { denyUnlessRoot } = require("../utils/admin");
const { loadUsers } = require("../utils/users");
const { loadLastMessages, saveLastMessages } = require("../scheduler/standup-notification");

// Đoạn chữ có trong mọi phiên bản tin nhắc đứng dậy (tin chữ, embed cũ, thẻ V2)
const STANDUP_MARKER = "kính mời quý user hãy đứng dậy";

const DEFAULT_SCAN_LIMIT = 500;
const MAX_SCAN_LIMIT = 2000;
const DELETE_DELAY_MS = 400; // xóa từ từ, discord.js tự chờ thêm nếu chạm rate limit

let running = false;

// Định nghĩa command /don-standup (chỉ root - Mai Xuân Hiếu - được dùng)
const cleanStandupCommand = new SlashCommandBuilder()
    .setName("don-standup")
    .setDescription("[Root] Xóa các tin nhắc đứng dậy cũ trong DM, mỗi người chỉ giữ tin mới nhất")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    // Chỉ dùng trong server: trong DM Discord không áp dụng quyền Administrator
    .setContexts([InteractionContextType.Guild])
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .addBooleanOption((option) =>
        option
            .setName("xoa_that")
            .setDescription("TRUE = xóa thật. Mặc định chỉ xem trước sẽ xóa bao nhiêu tin")
            .setRequired(false)
    )
    .addUserOption((option) =>
        option.setName("user").setDescription("Chỉ dọn DM của 1 người (bỏ trống = tất cả)").setRequired(false)
    )
    .addIntegerOption((option) =>
        option
            .setName("so_tin")
            .setDescription(`Số tin gần nhất cần quét trong mỗi DM (mặc định ${DEFAULT_SCAN_LIMIT})`)
            .setMinValue(50)
            .setMaxValue(MAX_SCAN_LIMIT)
            .setRequired(false)
    )
    .toJSON();

// Toàn bộ chữ của 1 tin: nội dung, embed và thẻ V2 (lồng nhiều tầng)
function messageText(message) {
    return [
        message.content || "",
        JSON.stringify(message.embeds.map((e) => e.toJSON())),
        JSON.stringify(message.components.map((c) => c.toJSON())),
    ].join("\n");
}

function isStandupMessage(message, botId) {
    return message.author?.id === botId && messageText(message).includes(STANDUP_MARKER);
}

// Các tin nhắc đứng dậy của bot trong DM, mới nhất trước
async function findStandupMessages(dmChannel, botId, scanLimit) {
    const found = [];
    let before;
    let scanned = 0;
    while (scanned < scanLimit) {
        const batch = await dmChannel.messages.fetch({ limit: Math.min(100, scanLimit - scanned), before });
        if (batch.size === 0) break;
        for (const message of batch.values()) {
            if (isStandupMessage(message, botId)) found.push(message);
        }
        scanned += batch.size;
        before = batch.last().id;
        if (batch.size < 100) break;
    }
    return { found: found.sort((a, b) => b.createdTimestamp - a.createdTimestamp), scanned };
}

/**
 * Dọn DM của từng người: giữ tin nhắc đứng dậy mới nhất, xóa phần còn lại.
 * @returns {Promise<{ lines: string[], totalFound: number, totalDeleted: number }>}
 */
async function cleanStandupMessages(client, users, { dryRun, scanLimit }) {
    const lastMessages = loadLastMessages();
    const lines = [];
    let totalFound = 0;
    let totalDeleted = 0;

    for (const user of users) {
        const label = user.name || user.discordId;
        try {
            const discordUser = await client.users.fetch(user.discordId);
            const dmChannel = await discordUser.createDM();
            const { found, scanned } = await findStandupMessages(dmChannel, client.user.id, scanLimit);
            const [keep, ...old] = found;
            totalFound += old.length;

            if (keep) {
                lastMessages[user.discordId] = {
                    channelId: keep.channelId,
                    messageId: keep.id,
                    sentAt: keep.createdAt.toISOString(),
                };
            }
            if (old.length === 0) {
                lines.push(`✅ ${label}: không có tin cũ (quét ${scanned} tin)`);
                continue;
            }
            if (dryRun) {
                lines.push(`🗑️ ${label}: sẽ xóa ${old.length} tin (quét ${scanned} tin)`);
                continue;
            }

            let deleted = 0;
            for (const message of old) {
                try {
                    await message.delete();
                    deleted++;
                } catch (error) {
                    // 10008 = tin đã bị xóa rồi
                    if (error.code !== 10008) console.error(`⚠️ Không xóa được tin ${message.id} của ${label}: ${error.message}`);
                }
                await new Promise((resolve) => setTimeout(resolve, DELETE_DELAY_MS));
            }
            totalDeleted += deleted;
            lines.push(`🗑️ ${label}: đã xóa ${deleted}/${old.length} tin`);
        } catch (error) {
            lines.push(`❌ ${label}: ${error.message}`);
        }
    }

    // Ghi lại tin đang giữ để lần gửi 12h sau tự xóa đúng tin này
    if (!dryRun) saveLastMessages(lastMessages);
    return { lines, totalFound, totalDeleted };
}

/**
 * Xử lý /don-standup. Việc xóa có thể mất vài phút nên chạy nền, xong thì DM
 * báo cáo cho root.
 */
async function handleCleanStandupCommand(interaction) {
    if (await denyUnlessRoot(interaction)) return;

    if (running) {
        await interaction.reply({ content: "⏳ Đang dọn tin rồi, chờ xong lượt trước nhé.", flags: MessageFlags.Ephemeral });
        return;
    }

    const dryRun = interaction.options.getBoolean("xoa_that") !== true;
    const target = interaction.options.getUser("user");
    const scanLimit = interaction.options.getInteger("so_tin") || DEFAULT_SCAN_LIMIT;

    const users = target
        ? [loadUsers().find((u) => u.discordId === target.id) || { discordId: target.id, name: target.username }]
        : loadUsers().filter((u) => u.discordId);

    await interaction.reply({
        content:
            `${dryRun ? "🔍 Đang xem trước" : "🧹 Đang dọn"} tin nhắc đứng dậy cũ trong DM của ${users.length} người ` +
            `(quét tối đa ${scanLimit} tin/người). Xong sẽ báo kết quả qua DM.`,
        flags: MessageFlags.Ephemeral,
    });

    running = true;
    let report;
    try {
        const result = await cleanStandupMessages(interaction.client, users, { dryRun, scanLimit });
        const header = dryRun
            ? `🔍 **Xem trước dọn tin đứng dậy**: sẽ xóa ${result.totalFound} tin, mỗi người giữ lại tin mới nhất.\n` +
              `Chạy \`/don-standup xoa_that:True\` để xóa thật.`
            : `🧹 **Đã dọn tin đứng dậy**: xóa ${result.totalDeleted}/${result.totalFound} tin, mỗi người giữ lại tin mới nhất.`;
        report = `${header}\n\n${result.lines.join("\n")}`;
    } catch (error) {
        console.error("❌ Lỗi khi dọn tin đứng dậy:", error);
        report = `❌ Lỗi khi dọn tin đứng dậy: ${error.message}`;
    } finally {
        running = false;
    }

    // DM giới hạn 2000 ký tự/tin
    const chunks = report.match(/[\s\S]{1,1900}(\n|$)/g) || [report];
    try {
        for (const chunk of chunks) await interaction.user.send(chunk);
    } catch (error) {
        console.error("❌ Không gửi được báo cáo dọn tin đứng dậy:", error.message);
    }
}

module.exports = {
    commands: [{ data: cleanStandupCommand, execute: handleCleanStandupCommand }],
    // Export để test
    isStandupMessage,
    cleanStandupMessages,
};
