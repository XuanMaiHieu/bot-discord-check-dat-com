/**
 * Lệnh của module nhắc uống nước:
 *   /uongnuoc          (mọi người) xem / bật / tắt / đổi tần suất
 *   /nuoc-moi          (root) gửi thẻ mời cho user đặc thù, bấm Đăng ký mới bắt đầu nhắc
 *   /nuoc-danh-sach    (root) ai đang bật, tần suất, số cốc hôm nay
 *   /nuoc-test         (root) gửi thử tin nhắc / tổng kết / thẻ mời vào DM của root
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
const { settingsPayload } = require("./interactions");
const { sendReminder, sendSummary } = require("./schedule");

const MAX_REPLY_LENGTH = 1900;

// Lệnh root: ẩn với người không có quyền Administrator, chỉ dùng trong server
function rootCommand(name, description) {
    return new SlashCommandBuilder()
        .setName(name)
        .setDescription(description)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setContexts([InteractionContextType.Guild])
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall]);
}

const userCommand = new SlashCommandBuilder()
    .setName("uongnuoc")
    .setDescription("Bot nhắc uống nước trong giờ làm: bật / tắt, đổi tần suất, xem số cốc hôm nay")
    .toJSON();

const inviteCommand = rootCommand("nuoc-moi", "[Root] Gửi thẻ mời nhắc uống nước (bấm Đăng ký mới bắt đầu nhắc)")
    .addStringOption((option) =>
        option
            .setName("nguoi")
            .setDescription("Tên (có dấu / không dấu) hoặc Discord ID, nhiều người cách nhau bằng dấu phẩy")
            .setRequired(true)
    )
    .toJSON();

const listCommand = rootCommand("nuoc-danh-sach", "[Root] Ai đang bật nhắc uống nước, số cốc hôm nay").toJSON();

const testCommand = rootCommand("nuoc-test", "[Root] Gửi thử vào DM của bạn")
    .addStringOption((option) =>
        option
            .setName("loai")
            .setDescription("Gửi thử cái gì")
            .addChoices(
                { name: "Tin nhắc", value: "nhac" },
                { name: "Tổng kết cuối ngày", value: "tong-ket" },
                { name: "Thẻ mời", value: "moi" }
            )
            .setRequired(true)
    )
    .toJSON();

// ---------------------------------------------------------------------------

function clip(text) {
    return text.length > MAX_REPLY_LENGTH ? `${text.slice(0, MAX_REPLY_LENGTH - 20)}\n… (còn nữa)` : text;
}

// "Hoàng Thị Tiên Diễm" -> "hoang thi tien diem", để gõ không dấu vẫn tìm được
function normalize(text) {
    return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
}

// Tên trong users.json, không có (người tự đăng ký /uongnuoc) thì tên Discord, cuối cùng là ID
async function nameOf(ctx, discordId) {
    const name = ctx.findUserByDiscordId(discordId)?.name;
    if (name) return name;
    try {
        const user = await ctx.client.users.fetch(discordId);
        return user.globalName || user.username;
    } catch (error) {
        return discordId;
    }
}

async function namesOf(ctx, entries) {
    return (await Promise.all(entries.map(({ discordId }) => nameOf(ctx, discordId)))).join(", ");
}

async function handleUser(interaction, ctx) {
    const member = store.getMember(interaction.user.id);
    await interaction.reply(settingsPayload(ctx, member, { ephemeral: true }));
}

async function handleInvite(interaction, ctx) {
    if (await ctx.denyUnlessRoot(interaction)) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const users = ctx.loadEnabledUsers();
    const lines = [];
    const queries = interaction.options.getString("nguoi").split(",").map((q) => q.trim()).filter(Boolean);
    for (const query of queries) {
        const matches = users.filter((u) => u.discordId === query || normalize(u.name || "").includes(normalize(query)));
        if (matches.length !== 1) {
            lines.push(
                matches.length
                    ? `❓ "${query}" khớp ${matches.length} người: ${matches.map((u) => u.name).join(", ")}`
                    : `❓ "${query}" không khớp ai đang nhận báo cơm`
            );
            continue;
        }
        const user = matches[0];
        if (store.getMember(user.discordId)?.subscribed) {
            lines.push(`⏭️ ${user.name}: đã bật rồi`);
            continue;
        }
        const result = await ctx.sendCardToUser(user.discordId, buildInviteCard());
        if (result.success) {
            store.updateMember(user.discordId, (m) => {
                m.invitedAt = new Date().toISOString();
            });
            lines.push(`✅ ${user.name}`);
        } else {
            lines.push(`❌ ${user.name}: ${result.error}`);
        }
    }
    await interaction.editReply(clip(["💧 **Gửi thẻ mời nhắc uống nước**", ...lines].join("\n")));
}

async function handleList(interaction, ctx) {
    if (await ctx.denyUnlessRoot(interaction)) return;
    // Lấy tên Discord của người không có trong users.json có thể mất vài giây
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const members = store.allMembers();
    const on = members.filter(({ member }) => member.subscribed);
    const waiting = members.filter(({ member }) => !member.subscribed && member.invitedAt && !member.declinedAt);
    const declined = members.filter(({ member }) => member.declinedAt);

    const lines = [
        `💧 **Nhắc uống nước** · đang bật **${on.length}** người`,
        ...(await Promise.all(
            on.map(async ({ discordId, member }) => {
                const day = store.today(member);
                const status = day.off ? " · 🔕 tắt hôm nay" : "";
                return `• ${await nameOf(ctx, discordId)} · mỗi ${member.interval}' · hôm nay ${day.cups} cốc / ${day.reminders} lần nhắc${status}`;
            })
        )),
    ];
    if (waiting.length) lines.push("", `⏳ Đã mời, chưa bấm: ${await namesOf(ctx, waiting)}`);
    if (declined.length) lines.push(`🙅 Từ chối: ${await namesOf(ctx, declined)}`);
    await interaction.editReply(clip(lines.join("\n")));
}

async function handleTest(interaction, ctx) {
    if (await ctx.denyUnlessRoot(interaction)) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const kind = interaction.options.getString("loai");
    const discordId = interaction.user.id;
    const result =
        kind === "nhac"
            ? await sendReminder(ctx, discordId)
            : kind === "tong-ket"
              ? await sendSummary(ctx, discordId)
              : await ctx.sendCardToUser(discordId, buildInviteCard());
    await interaction.editReply(
        result.success
            ? "🧪 Đã gửi vào DM của bạn. Nút bấm chạy thật (đếm cốc, bật / tắt) trên dữ liệu của chính bạn."
            : `❌ Không gửi được: ${result.error}`
    );
}

module.exports = [
    { data: userCommand, execute: handleUser },
    { data: inviteCommand, execute: handleInvite },
    { data: listCommand, execute: handleList },
    { data: testCommand, execute: handleTest },
];
