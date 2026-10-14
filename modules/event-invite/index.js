/**
 * Module sự kiện: DM cho mọi người có Discord ID trong data/users.json 1 thẻ
 * (Components V2). Hiện là buổi sinh hoạt kỷ niệm 20/10, có 2 đợt gửi:
 *
 *   /thu-moi   thiệp mời (ảnh bìa + lời mời + nút bản đồ)
 *   /cho-ngoi  nhắc chỗ ngồi (sơ đồ bàn + chỗ của người nhận + giờ, địa điểm, lưu ý gửi xe)
 *
 * Mỗi lệnh (root) có:
 *   che-do:thu      gửi thử vào DM của root, không ghi nhận gì
 *   che-do:tat-ca   gửi thật cho mọi người chưa nhận đợt đó; chạy lại chỉ gửi
 *                   người còn thiếu / gửi lỗi
 *
 * Sửa chữ / ngày giờ / địa điểm / chỗ ngồi ở texts.js; ảnh vẽ lại bằng render-poster.js.
 */
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    InteractionContextType,
    ApplicationIntegrationType,
} = require("discord.js");
const store = require("./store");
const { buildInviteCard, buildSeatingCard, findSeat } = require("./cards");
const { EVENT_ID, SEATING_ID, SEATING_ABSENT } = require("./texts");

const MAX_REPLY_LENGTH = 1900;
const SEND_GAP_MS = 400; // giãn cách DM, tránh rate limit

// Các đợt gửi: build(user, allNames) -> { card, files }; user = { discordId, name }
// skip = họ tên không gửi đợt đó (không tham gia)
const CAMPAIGNS = [
    {
        command: "thu-moi",
        description: "[Root] Gửi thiệp mời buổi sinh hoạt kỷ niệm 20/10 qua DM",
        id: EVENT_ID,
        label: "💌 **Thiệp mời 20/10**",
        build: (user) => buildInviteCard({ name: user.name }),
    },
    {
        command: "cho-ngoi",
        description: "[Root] Gửi sơ đồ chỗ ngồi + nhắc giờ, địa điểm buổi sinh hoạt 20/10 qua DM",
        id: SEATING_ID,
        label: "🪑 **Sơ đồ chỗ ngồi 20/10**",
        skip: SEATING_ABSENT,
        build: (user, allNames) => buildSeatingCard({ name: user.name, seat: findSeat(user.name, allNames) }),
    },
];

function buildCommand(campaign) {
    return new SlashCommandBuilder()
        .setName(campaign.command)
        .setDescription(campaign.description)
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
}

function clip(content) {
    return content.length > MAX_REPLY_LENGTH ? `${content.slice(0, MAX_REPLY_LENGTH)}\n…` : content;
}

async function send(ctx, campaign, user, allNames) {
    const { card, files } = campaign.build(user, allNames);
    return ctx.sendCardToUser(user.discordId, card, { files });
}

async function handleCampaign(campaign, interaction, ctx) {
    if (await ctx.denyUnlessRoot(interaction)) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // 1 Discord ID chỉ nhận 1 thẻ dù xuất hiện 2 lần trong users.json
    const skip = new Set(campaign.skip || []);
    const recipients = [
        ...new Map(
            ctx
                .loadUsersWithDiscordId()
                .filter((user) => !skip.has(user.name))
                .map((user) => [user.discordId, user])
        ).values(),
    ];
    const allNames = recipients.map((user) => user.name);

    if (interaction.options.getString("che-do") === "thu") {
        const me = {
            discordId: interaction.user.id,
            name:
                ctx.findUserByDiscordId(interaction.user.id)?.name ||
                interaction.user.globalName ||
                interaction.user.username,
        };
        const result = await send(ctx, campaign, me, allNames);
        await interaction.editReply(
            result.success
                ? `🧪 Đã gửi thử vào DM của bạn. Gửi thật sẽ tới ${recipients.length} người trong \`data/users.json\`.`
                : `❌ Không gửi được: ${result.error}`
        );
        return;
    }

    const pending = recipients.filter((user) => !store.hasReceived(campaign.id, user.discordId));
    const lines = [];
    for (const user of pending) {
        const result = await send(ctx, campaign, user, allNames);
        if (result.success) {
            store.markSent(campaign.id, user.discordId);
            lines.push(`✅ ${user.name}`);
        } else {
            lines.push(`❌ ${user.name}: ${result.error}`);
        }
        await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
    }

    const sent = lines.filter((line) => line.startsWith("✅")).length;
    console.log(`💌 ${campaign.id}: gửi ${sent}/${pending.length} người`);
    // Người lỗi lên đầu để không bị cắt mất khi danh sách dài
    lines.sort((a, b) => a.startsWith("✅") - b.startsWith("✅"));
    await interaction.editReply(
        clip(
            [
                `${campaign.label}: gửi ${sent}/${pending.length} người` +
                    ` (đã nhận từ trước: ${recipients.length - pending.length})`,
                ...(lines.length ? lines : ["Không còn ai chưa nhận."]),
            ].join("\n")
        )
    );
}

module.exports = {
    name: "event-invite",
    commands: CAMPAIGNS.map((campaign) => ({
        data: buildCommand(campaign),
        execute: (interaction, ctx) => handleCampaign(campaign, interaction, ctx),
    })),
    start(ctx) {
        store.init(ctx.dataDir("event-invite"));
    },
};
