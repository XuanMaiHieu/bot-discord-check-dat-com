const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlags,
    InteractionContextType,
    ApplicationIntegrationType,
} = require("discord.js");
const { fetchGif, getActiveProviderName } = require("../utils/gif");

// Định nghĩa command /test-send-gif (chỉ root - Mai Xuân Hiếu - được dùng)
const testSendGifCommand = new SlashCommandBuilder()
    .setName("test-send-gif")
    .setDescription("[Root] Test gửi GIF cá nhân qua DM cho một người")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    // Chỉ dùng trong server: trong DM Discord không áp dụng quyền Administrator,
    // nên không giới hạn thì ai DM với bot cũng thấy lệnh này
    .setContexts([InteractionContextType.Guild])
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .addUserOption((option) =>
        option
            .setName("user")
            .setDescription("Người nhận GIF (bỏ trống = gửi cho chính bạn)")
            .setRequired(false)
    )
    .addStringOption((option) =>
        option
            .setName("query")
            .setDescription('Từ khóa GIF, vd: "dance", "ăn cơm", "chào" (bỏ trống = ngẫu nhiên)')
            .setRequired(false)
    )
    .addStringOption((option) =>
        option
            .setName("message")
            .setDescription("Lời nhắn gửi kèm GIF")
            .setRequired(false)
    )
    .addStringOption((option) =>
        option
            .setName("mode")
            .setDescription("Gửi qua DM riêng hay gửi ra channel hiện tại")
            .setRequired(false)
            .addChoices(
                { name: "DM (tin nhắn riêng)", value: "dm" },
                { name: "Channel (công khai)", value: "channel" }
            )
    )
    .toJSON();

// Dựng embed GIF dùng chung cho command và scheduler
function buildGifEmbed(gif, { message = "", footer = "" } = {}) {
    const embed = new EmbedBuilder()
        .setColor(0xff6b81)
        .setImage(gif.url)
        .setFooter({ text: footer || `Nguồn: ${gif.provider}` })
        .setTimestamp(new Date());

    if (message) embed.setDescription(message);
    if (gif.pageUrl) embed.setURL(gif.pageUrl).setTitle(gif.title || "GIF");

    return embed;
}

// Định nghĩa command /test-standup (chỉ root - Mai Xuân Hiếu - được dùng)
const testStandupCommand = new SlashCommandBuilder()
    .setName("test-standup")
    .setDescription("[Root] Test ngay thông báo 12h 'hãy đứng dậy' kèm GIF")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    // Chỉ dùng trong server: trong DM Discord không áp dụng quyền Administrator,
    // nên không giới hạn thì ai DM với bot cũng thấy lệnh này
    .setContexts([InteractionContextType.Guild])
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .addBooleanOption((option) =>
        option
            .setName("all")
            .setDescription(
                "TRUE = gửi thật cho toàn bộ user trong users.json. Mặc định chỉ gửi cho bạn."
            )
            .setRequired(false)
    )
    .addUserOption((option) =>
        option
            .setName("user")
            .setDescription("Chỉ gửi thử cho riêng người này")
            .setRequired(false)
    )
    .toJSON();

/**
 * Gửi GIF cá nhân cho 1 user qua DM.
 *
 * Truyền sẵn `gif` (kết quả fetchGif) nếu muốn gửi cùng 1 GIF cho nhiều người —
 * tránh gọi API mỗi người một lần (Giphy beta key chỉ 100 request/giờ).
 *
 * Trả về { success, error } để nơi gọi (command / scheduler) tự xử lý thông báo.
 */
async function sendGifToUser(
    client,
    discordId,
    { query = "", message = "", footer = "", gif: presetGif = null } = {}
) {
    const gif = presetGif || (await fetchGif(query));
    if (!gif) {
        return {
            success: false,
            error: "Không lấy được GIF từ bất kỳ nguồn nào (Tenor / Giphy / OtakuGIFs).",
        };
    }

    // Khai báo ngoài try để khi gửi lỗi vẫn trả về được thông tin user (tên hiển thị)
    let user = null;
    try {
        user = await client.users.fetch(discordId);
        const embed = buildGifEmbed(gif, { message, footer });

        await user.send({ embeds: [embed] });
        return { success: true, gif, user };
    } catch (error) {
        // 50007 = Cannot send messages to this user (chặn DM / không chung server)
        if (error.code === 50007) {
            return {
                success: false,
                gif,
                user,
                error:
                    "Người này đang tắt DM từ thành viên trong server, hoặc chưa chung server với bot.",
            };
        }
        return { success: false, gif, user, error: error.message };
    }
}

// Hàm xử lý command /test-send-gif
async function handleTestSendGifCommand(interaction, adminDiscordId) {
    if (interaction.user.id !== adminDiscordId) {
        await interaction.reply({
            content: "❌ Bạn không có quyền sử dụng lệnh này (chỉ root mới được dùng).",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser("user") || interaction.user;
    const query = interaction.options.getString("query") || "";
    const message = interaction.options.getString("message") || "";
    const mode = interaction.options.getString("mode") || "dm";

    try {
        if (mode === "channel") {
            const gif = await fetchGif(query);
            if (!gif) {
                await interaction.editReply(
                    "❌ Không lấy được GIF từ bất kỳ nguồn nào (Tenor / Giphy / OtakuGIFs)."
                );
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(0xff6b81)
                .setImage(gif.url)
                .setFooter({ text: `Nguồn: ${gif.provider}` })
                .setTimestamp(new Date());
            if (message) embed.setDescription(message);
            if (gif.pageUrl) embed.setURL(gif.pageUrl).setTitle(gif.title || "GIF");

            await interaction.channel.send({
                content: `${target}`,
                embeds: [embed],
            });

            await interaction.editReply(
                `✅ Đã gửi GIF ra channel cho ${target.tag}.\n` +
                `**Provider:** ${gif.provider}\n` +
                `**Từ khóa:** ${query || "(ngẫu nhiên)"}\n` +
                `**URL:** ${gif.url}` +
                (gif.note ? `\nℹ️ ${gif.note}` : "")
            );
            return;
        }

        const result = await sendGifToUser(interaction.client, target.id, {
            query,
            message,
        });

        if (!result.success) {
            await interaction.editReply(
                `❌ Không gửi được DM cho ${target.tag}.\n` +
                `**Lỗi:** ${result.error}` +
                (result.gif ? `\n**GIF lấy được:** ${result.gif.url}` : "")
            );
            return;
        }

        await interaction.editReply(
            `✅ Đã gửi GIF qua DM cho **${target.tag}**.\n` +
            `**Provider đang dùng:** ${getActiveProviderName()}\n` +
            `**Từ khóa:** ${query || "(ngẫu nhiên)"}\n` +
            `**URL:** ${result.gif.url}` +
            (result.gif.note ? `\nℹ️ ${result.gif.note}` : "")
        );
    } catch (error) {
        console.error("❌ Lỗi khi xử lý /test-send-gif:", error);
        await interaction.editReply(`❌ Có lỗi xảy ra: ${error.message}`);
    }
}

// Hàm xử lý command /test-standup
async function handleTestStandupCommand(interaction, adminDiscordId) {
    if (interaction.user.id !== adminDiscordId) {
        await interaction.reply({
            content: "❌ Bạn không có quyền sử dụng lệnh này (chỉ root mới được dùng).",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Nạp muộn để tránh vòng lặp require giữa commands/gif.js và scheduler
    const { runStandupNotification } = require("../scheduler/standup-notification");

    const sendToAll = interaction.options.getBoolean("all") === true;
    const singleUser = interaction.options.getUser("user");

    // Mặc định chỉ gửi cho chính root, tránh lỡ tay spam cả công ty khi test
    let targetUserIds = [interaction.user.id];
    if (sendToAll) {
        targetUserIds = null; // null = lấy toàn bộ từ users.json
    } else if (singleUser) {
        targetUserIds = [singleUser.id];
    }

    try {
        const result = await runStandupNotification(interaction.client, {
            targetUserIds,
        });

        const scope = sendToAll
            ? "TOÀN BỘ user trong users.json"
            : singleUser
                ? singleUser.tag
                : "chỉ mình bạn";

        await interaction.editReply(
            `🧍 **Đã chạy thử thông báo đứng dậy**\n` +
            `**Phạm vi:** ${scope}\n` +
            `**Kết quả:** ${result.sent} thành công / ${result.failed} thất bại (tổng ${result.total})\n` +
            `**Từ khóa GIF:** ${result.query}\n` +
            `**GIF:** ${result.gif ? result.gif.url : "(không lấy được)"}\n\n` +
            (result.details.length > 0
                ? result.details.slice(0, 20).join("\n")
                : "(không có người nhận nào)")
        );
    } catch (error) {
        console.error("❌ Lỗi khi xử lý /test-standup:", error);
        await interaction.editReply(`❌ Có lỗi xảy ra: ${error.message}`);
    }
}

module.exports = {
    testSendGifCommand,
    handleTestSendGifCommand,
    sendGifToUser,
    buildGifEmbed,
    testStandupCommand,
    handleTestStandupCommand,
};
