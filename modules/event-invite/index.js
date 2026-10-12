/**
 * Module thiệp mời sự kiện: DM cho mọi người có Discord ID trong data/users.json
 * 1 thiệp mời (ảnh bìa + lời mời + nút bản đồ). Hiện là buổi sinh hoạt kỷ niệm 20/10.
 *
 *   /thu-moi che-do:thu      (root) gửi thử vào DM của root, không ghi nhận gì
 *   /thu-moi che-do:tat-ca   (root) gửi thật cho mọi người chưa nhận; chạy lại chỉ
 *                            gửi người còn thiếu / gửi lỗi
 *
 * Sửa chữ / ngày giờ / địa điểm ở texts.js; ảnh bìa vẽ lại bằng render-poster.js.
 */
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    InteractionContextType,
    ApplicationIntegrationType,
} = require("discord.js");
const store = require("./store");
const { buildInviteCard } = require("./cards");
const { EVENT_ID } = require("./texts");

const MAX_REPLY_LENGTH = 1900;
const SEND_GAP_MS = 400; // giãn cách DM, tránh rate limit

const inviteCommand = new SlashCommandBuilder()
    .setName("thu-moi")
    .setDescription("[Root] Gửi thiệp mời buổi sinh hoạt kỷ niệm 20/10 qua DM")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([InteractionContextType.Guild])
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .addStringOption((option) =>
        option
            .setName("che-do")
            .setDescription("Gửi cho ai")
            .addChoices(
                { name: "Gửi thử vào DM của tôi", value: "thu" },
                { name: "Gửi thật cho mọi người có Discord ID, chưa nhận", value: "tat-ca" }
            )
            .setRequired(true)
    )
    .toJSON();

function clip(content) {
    return content.length > MAX_REPLY_LENGTH ? `${content.slice(0, MAX_REPLY_LENGTH)}\n…` : content;
}

async function sendInvite(ctx, discordId, name) {
    const { card, files } = buildInviteCard({ name });
    return ctx.sendCardToUser(discordId, card, { files });
}

async function handleInvite(interaction, ctx) {
    if (await ctx.denyUnlessRoot(interaction)) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (interaction.options.getString("che-do") === "thu") {
        const name =
            ctx.findUserByDiscordId(interaction.user.id)?.name || interaction.user.globalName || interaction.user.username;
        const result = await sendInvite(ctx, interaction.user.id, name);
        await interaction.editReply(
            result.success
                ? `🧪 Đã gửi thử vào DM của bạn. Gửi thật sẽ tới ${ctx.loadUsersWithDiscordId().length} người trong \`data/users.json\`.`
                : `❌ Không gửi được: ${result.error}`
        );
        return;
    }

    // 1 Discord ID chỉ nhận 1 thiệp dù xuất hiện 2 lần trong users.json
    const recipients = [...new Map(ctx.loadUsersWithDiscordId().map((user) => [user.discordId, user])).values()];
    const pending = recipients.filter((user) => !store.hasReceived(EVENT_ID, user.discordId));
    const lines = [];
    for (const user of pending) {
        const result = await sendInvite(ctx, user.discordId, user.name);
        if (result.success) {
            store.markSent(EVENT_ID, user.discordId);
            lines.push(`✅ ${user.name}`);
        } else {
            lines.push(`❌ ${user.name}: ${result.error}`);
        }
        await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
    }

    const sent = lines.filter((line) => line.startsWith("✅")).length;
    console.log(`💌 Thiệp mời ${EVENT_ID}: gửi ${sent}/${pending.length} người`);
    // Người lỗi lên đầu để không bị cắt mất khi danh sách dài
    lines.sort((a, b) => a.startsWith("✅") - b.startsWith("✅"));
    await interaction.editReply(
        clip(
            [
                `💌 **Thiệp mời 20/10**: gửi ${sent}/${pending.length} người` +
                    ` (đã nhận từ trước: ${recipients.length - pending.length})`,
                ...(lines.length ? lines : ["Không còn ai chưa nhận."]),
            ].join("\n")
        )
    );
}

module.exports = {
    name: "event-invite",
    commands: [{ data: inviteCommand, execute: handleInvite }],
    start(ctx) {
        store.init(ctx.dataDir("event-invite"));
    },
};
