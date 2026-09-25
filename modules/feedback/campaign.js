/**
 * Lệnh root của module feedback:
 *   /feedback-test       gửi thẻ mời thử vào DM của root (dữ liệu test riêng)
 *   /feedback-moi        gửi thẻ mời cho mọi người (mặc định chỉ xem trước)
 *   /feedback-tong-hop   thống kê đợt hiện tại / gần nhất (ẩn danh)
 *   /feedback-chi-tiet   gửi vào DM bộ tin thống kê đầy đủ có tên + file CSV
 *   /feedback-dong       đóng đợt đang mở
 */
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    InteractionContextType,
    ApplicationIntegrationType,
    ContainerBuilder,
    SeparatorSpacingSize,
} = require("discord.js");
const store = require("./store");
const { RATINGS, FEATURES } = require("./texts");
const { COLORS, buildInviteCard, ratingLabel, bar } = require("./cards");
const { buildDetailMessages } = require("./report");

const SEND_DELAY_MS = 1000; // giãn cách giữa các DM, tránh rate limit
const DETAIL_SEND_DELAY_MS = 500; // giữa các tin thống kê gửi cho root, giữ đúng thứ tự
const MAX_REPLY_LENGTH = 1900;
const MAX_CARD_TEXT = 3500; // Discord giới hạn 4000 ký tự chữ / thẻ

// Lệnh root: ẩn với người không có quyền Administrator, chỉ dùng trong server
function rootCommand(name, description) {
    return new SlashCommandBuilder()
        .setName(name)
        .setDescription(description)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setContexts([InteractionContextType.Guild])
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall]);
}

const testCommand = rootCommand("feedback-test", "[Root] Gửi thẻ mời feedback thử vào DM của bạn (dữ liệu test riêng)").toJSON();

const inviteCommand = rootCommand("feedback-moi", "[Root] Gửi thẻ mời feedback cho mọi người đang nhận báo cơm")
    .addBooleanOption((option) =>
        option
            .setName("gui_that")
            .setDescription("TRUE = gửi thật. Mặc định chỉ xem trước danh sách người nhận")
            .setRequired(false)
    )
    .toJSON();

const summaryCommand = rootCommand("feedback-tong-hop", "[Root] Thống kê feedback (ẩn danh)")
    .addBooleanOption((option) =>
        option.setName("test").setDescription("TRUE = xem dữ liệu của /feedback-test").setRequired(false)
    )
    .toJSON();

const detailCommand = rootCommand("feedback-chi-tiet", "[Root] Gửi vào DM thống kê feedback đầy đủ: tên, điểm, góp ý, file CSV")
    .addStringOption((option) =>
        option.setName("dot").setDescription("Mã đợt, vd 2026-09. Bỏ trống = đợt đang mở / gần nhất").setRequired(false)
    )
    .addBooleanOption((option) =>
        option.setName("test").setDescription("TRUE = xem dữ liệu của /feedback-test").setRequired(false)
    )
    .toJSON();

const closeCommand = rootCommand("feedback-dong", "[Root] Đóng đợt feedback đang mở (hết nhắc, nút trên thẻ cũ ngừng nhận)").toJSON();

function clip(text, max) {
    return text.length > max ? `${text.slice(0, max - 20)}\n… (còn nữa)` : text;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------

async function handleTest(interaction, ctx) {
    if (await ctx.denyUnlessRoot(interaction)) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const participant = store.resetTestParticipant(interaction.user.id);
    const campaign = store.getCampaign(store.TEST_CAMPAIGN_ID);
    const result = await ctx.sendCardToUser(interaction.user.id, buildInviteCard(campaign, participant));
    await interaction.editReply(
        result.success
            ? "🧪 Đã gửi thẻ mời test vào DM của bạn (dữ liệu test đã reset).\n" +
                  "-# Chạy `/test-meal` để xem dòng nhắc nợ, mỗi lần chạy hiện câu kế tiếp."
            : `❌ Không gửi được: ${result.error}`
    );
}

async function handleInvite(interaction, ctx) {
    if (await ctx.denyUnlessRoot(interaction)) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sendForReal = interaction.options.getBoolean("gui_that") === true;
    let campaign = store.getCurrentCampaign();
    const alreadyInvited = (user) => Boolean(campaign?.participants[user.discordId]?.invitedAt);
    const recipients = ctx.loadEnabledUsers().filter((user) => !ctx.isRoot(user.discordId) && !alreadyInvited(user));

    if (!sendForReal) {
        const lines = [
            `👀 **Xem trước** · ${campaign ? `đợt **${campaign.id}** đang mở` : "sẽ mở đợt mới"}`,
            `Sẽ gửi thẻ mời cho **${recipients.length}** người (bỏ qua root và người đã được mời):`,
            ...recipients.map((user) => `• ${user.name || user.discordId}`),
            "",
            "Chạy lại với `gui_that: True` để gửi thật.",
        ];
        await interaction.editReply(clip(lines.join("\n"), MAX_REPLY_LENGTH));
        return;
    }

    if (recipients.length === 0) {
        await interaction.editReply("✅ Không còn ai cần mời.");
        return;
    }

    if (!campaign) campaign = store.openCampaign();
    const details = [];
    let sent = 0;
    for (const user of recipients) {
        const participant = store.updateParticipant(campaign.id, user.discordId, () => {});
        const result = await ctx.sendCardToUser(user.discordId, buildInviteCard(campaign, participant));
        if (result.success) {
            store.updateParticipant(campaign.id, user.discordId, (p) => {
                p.invitedAt = new Date().toISOString();
            });
            sent++;
            details.push(`✅ ${user.name}`);
        } else {
            details.push(`❌ ${user.name}: ${result.error}`);
        }
        await sleep(SEND_DELAY_MS);
    }

    await interaction.editReply(
        clip([`📣 Đợt **${campaign.id}**: đã gửi ${sent}/${recipients.length} thẻ mời`, "", ...details].join("\n"), MAX_REPLY_LENGTH)
    );
}

function buildSummaryCard(campaign) {
    const people = Object.values(campaign.participants);
    const invited = people.filter((p) => p.invitedAt);
    const rated = people.filter((p) => p.rating);
    const avg = rated.length ? rated.reduce((sum, p) => sum + p.rating, 0) / rated.length : 0;

    const container = new ContainerBuilder().setAccentColor(COLORS.admin);
    const text = (content) => container.addTextDisplayComponents((t) => t.setContent(content));
    const divider = () =>
        container.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    const status = campaign.test ? "🧪 test" : campaign.closedAt ? "đã đóng" : "đang mở";
    text(
        `## 📊 Feedback · đợt ${campaign.id} (${status})\n` +
            `Đã mời **${invited.length}** · đã chấm **${rated.length}** · ` +
            `điểm TB **${rated.length ? avg.toFixed(2) : "—"}** · 👏 tổng **${store.getClapTotal()}** pháo tay`
    );
    divider();

    const counts = [5, 4, 3, 2, 1].map((n) => ({ n, count: rated.filter((p) => p.rating === n).length }));
    const maxCount = Math.max(...counts.map((c) => c.count), 1);
    text(counts.map(({ n, count }) => `${RATINGS[n].emoji} ${n}  \`${bar(count, maxCount)}\` ${count}`).join("\n"));

    const featureCounts = FEATURES.map((f) => ({ ...f, count: people.filter((p) => p.features.includes(f.value)).length }))
        .filter((f) => f.count > 0)
        .sort((a, b) => b.count - a.count);
    if (featureCounts.length) {
        text(`**Hay xem:** ${featureCounts.map((f) => `${f.emoji} ${f.label} (${f.count})`).join(" · ")}`);
    }
    const snoozes = people.reduce((sum, p) => sum + p.snoozeCount, 0);
    const notYet = invited.filter((p) => !p.rating).length;
    text(`-# 🙈 Tổng "Để sau": ${snoozes} lần · chưa chấm: ${notYet} người`);

    // Góp ý theo "Người #N", xếp theo số (không theo thời gian gửi)
    const withText = people.filter((p) => p.submissions.length).sort((a, b) => a.number - b.number);
    if (withText.length) {
        divider();
        const blocks = withText.map((p) => {
            const lines = p.submissions.flatMap((s) =>
                [
                    s.liked && `💚 ${s.liked}`,
                    s.fix && `🔧 ${s.fix}`,
                    s.idea && `💡 ${s.idea}`,
                ].filter(Boolean)
            );
            return `**Người #${p.number}** · ${p.rating ? ratingLabel(p.rating) : "—"}\n${lines.join("\n")}`;
        });
        text(clip(blocks.join("\n\n"), MAX_CARD_TEXT - 600));
    }
    return container;
}

async function handleSummary(interaction, ctx) {
    if (await ctx.denyUnlessRoot(interaction)) return;
    const wantTest = interaction.options.getBoolean("test") === true;
    const campaign = wantTest
        ? store.getCampaign(store.TEST_CAMPAIGN_ID)
        : store.getCurrentCampaign() || store.getLatestCampaign();
    if (!campaign) {
        await interaction.reply({
            content: wantTest ? "Chưa có dữ liệu test, chạy `/feedback-test` trước." : "Chưa có đợt feedback nào.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    await interaction.reply(ctx.cardPayload(buildSummaryCard(campaign), { ephemeral: true }));
}

async function handleDetail(interaction, ctx) {
    if (await ctx.denyUnlessRoot(interaction)) return;
    const campaignId = interaction.options.getString("dot")?.trim();
    const wantTest = interaction.options.getBoolean("test") === true;
    const campaign = wantTest
        ? store.getCampaign(store.TEST_CAMPAIGN_ID)
        : campaignId
          ? store.getCampaign(campaignId)
          : store.getCurrentCampaign() || store.getLatestCampaign();
    if (!campaign) {
        const known = store.listCampaignIds().filter((id) => id !== store.TEST_CAMPAIGN_ID);
        await interaction.reply({
            content: wantTest
                ? "Chưa có dữ liệu test, chạy `/feedback-test` trước."
                : campaignId
                  ? `Không có đợt **${campaignId}**. Các đợt đã có: ${known.join(", ") || "chưa có"}`
                  : "Chưa có đợt feedback nào.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    // Lấy tên Discord của người không có trong users.json có thể mất vài giây
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const messages = await buildDetailMessages(ctx, campaign);
    for (let i = 0; i < messages.length; i++) {
        const { card, files } = messages[i];
        const result = await ctx.sendCardToUser(interaction.user.id, card, { files });
        if (!result.success) {
            await interaction.editReply(`❌ Gửi được ${i}/${messages.length} tin vào DM thì lỗi: ${result.error}`);
            return;
        }
        await sleep(DETAIL_SEND_DELAY_MS);
    }
    await interaction.editReply(`📬 Đã gửi ${messages.length} tin thống kê đợt **${campaign.id}** vào DM của bạn.`);
}

async function handleClose(interaction, ctx) {
    if (await ctx.denyUnlessRoot(interaction)) return;
    const campaign = store.closeCurrentCampaign();
    await interaction.reply({
        content: campaign
            ? `🔒 Đã đóng đợt **${campaign.id}**. Hết nhắc nợ, nút trên thẻ cũ sẽ báo "đợt đã đóng".`
            : "Không có đợt nào đang mở.",
        flags: MessageFlags.Ephemeral,
    });
}

module.exports = {
    commands: [
        { data: testCommand, execute: handleTest },
        { data: inviteCommand, execute: handleInvite },
        { data: summaryCommand, execute: handleSummary },
        { data: detailCommand, execute: handleDetail },
        { data: closeCommand, execute: handleClose },
    ],
};
