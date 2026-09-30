/**
 * /feedback-tra-loi (chỉ root): bot DM tin trả lời cho từng người sau đợt feedback,
 * gồm phần chung và câu riêng trong 1 lần chạy. Mặc định chỉ xem trước.
 *
 * Tin ghép từ các khối trong texts.js (REPLY): mở đầu → đề xuất → lỗi → câu riêng → kết.
 * Câu riêng và khối chọn tay nằm trong reply-notes.js. Không chọn tay thì khối đề xuất /
 * lỗi tự bật theo góp ý của người đó (có ô 💡 / 🔧).
 * Mỗi người nhận 1 lần: gửi xong lưu reply.sentAt, chạy lại chỉ gửi người còn lại.
 */
const { MessageFlags, ContainerBuilder, SeparatorSpacingSize } = require("discord.js");
const store = require("./store");
const { REPLY } = require("./texts");
const REPLY_NOTES = require("./reply-notes");
const { COLORS, ratingLabel } = require("./cards");
const { rootCommand, clip, sleep, SEND_DELAY_MS, MAX_REPLY_LENGTH } = require("./campaign");
const { resolveName } = require("./report");

const sendCommand = rootCommand("feedback-tra-loi", "[Root] Gửi tin trả lời feedback (chung + riêng) cho từng người")
    .addBooleanOption((option) =>
        option
            .setName("gui_that")
            .setDescription("TRUE = gửi thật. Mặc định chỉ xem trước danh sách")
            .setRequired(false)
    )
    .addUserOption((option) =>
        option.setName("xem").setDescription("Xem trước nguyên tin sẽ gửi cho 1 người").setRequired(false)
    )
    .toJSON();

// ---------------------------------------------------------------------------

function noteFor(campaign, discordId) {
    return REPLY_NOTES[campaign.id]?.[discordId] || {};
}

// Khối đề xuất / lỗi: chọn tay trong reply-notes.js, không thì theo góp ý
function replyBlocks(participant, custom) {
    if (custom.blocks) return custom.blocks;
    const blocks = [];
    if (participant.submissions.some((s) => s.idea)) blocks.push("idea");
    if (participant.submissions.some((s) => s.fix)) blocks.push("fix");
    return blocks;
}

function buildReplyCard(participant, custom, adminId) {
    const container = new ContainerBuilder().setAccentColor(COLORS.thanks);
    const text = (content) => container.addTextDisplayComponents((t) => t.setContent(content));
    const blocks = replyBlocks(participant, custom);

    text(REPLY.title);
    if (participant.rating || participant.submissions.length) text(REPLY.opening);
    if (blocks.includes("idea")) text(REPLY.idea);
    if (blocks.includes("fix")) text(REPLY.fix.replace("{admin}", `<@${adminId}>`));
    if (custom.note) text(`✉️ ${custom.note}`);
    container.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    text(REPLY.closing);
    return container;
}

function describeBlocks(participant, custom) {
    const names = { idea: "💡 đề xuất", fix: "🔧 lỗi" };
    const blocks = replyBlocks(participant, custom).map((b) => names[b]);
    return blocks.length ? blocks.join(" + ") : "chỉ mở đầu";
}

// Người sẽ nhận: đã chấm / góp ý / có câu riêng, chưa nhận lần nào, trừ root. Xếp theo tên
async function loadRecipients(ctx, campaign) {
    const ids = new Set([...Object.keys(campaign.participants), ...Object.keys(REPLY_NOTES[campaign.id] || {})]);
    const rows = [];
    for (const discordId of ids) {
        const participant = campaign.participants[discordId] || store.newParticipant();
        const custom = noteFor(campaign, discordId);
        if (ctx.isRoot(discordId) || participant.reply?.sentAt) continue;
        if (!participant.rating && !participant.submissions.length && !custom.note) continue;
        rows.push({ discordId, participant, custom, name: await resolveName(ctx, discordId) });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

// ---------------------------------------------------------------------------

async function handleSend(interaction, ctx) {
    if (await ctx.denyUnlessRoot(interaction)) return;
    // Trả lời đợt đang mở, không thì đợt gần nhất
    const campaign = store.getCurrentCampaign() || store.getLatestCampaign();
    if (!campaign) {
        await interaction.reply({ content: "Chưa có đợt feedback nào.", flags: MessageFlags.Ephemeral });
        return;
    }

    const previewUser = interaction.options.getUser("xem");
    if (previewUser) {
        const participant = campaign.participants[previewUser.id] || store.newParticipant();
        const status = participant.reply?.sentAt ? "đã nhận rồi, sẽ không gửi lại" : "chưa gửi";
        const card = buildReplyCard(participant, noteFor(campaign, previewUser.id), ctx.adminId).addTextDisplayComponents(
            (t) => t.setContent(`-# 👀 Xem trước tin cho **${previewUser.globalName || previewUser.username}** · đợt ${campaign.id} · ${status}`)
        );
        await interaction.reply(ctx.cardPayload(card, { ephemeral: true }));
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sendForReal = interaction.options.getBoolean("gui_that") === true;
    const rows = await loadRecipients(ctx, campaign);

    if (!sendForReal) {
        const lines = [
            `👀 **Xem trước** · đợt **${campaign.id}** · sẽ gửi **${rows.length}** người (bỏ qua người đã nhận):`,
            ...rows.map(({ name, participant: p, custom }) => {
                const rating = p.rating ? ratingLabel(p.rating) : "chưa chấm";
                const shortNote = custom.note?.length > 50 ? `${custom.note.slice(0, 50)}…` : custom.note;
                const note = custom.note ? ` · ✉️ ${shortNote}` : "";
                return `• **${name}** · ${rating} · ${describeBlocks(p, custom)}${note}`;
            }),
            "",
            "Xem nguyên tin 1 người: `xem:@...`. Chạy lại với `gui_that: True` để gửi thật.",
        ];
        await interaction.editReply(clip(lines.join("\n"), MAX_REPLY_LENGTH));
        return;
    }

    if (rows.length === 0) {
        await interaction.editReply("✅ Không còn ai cần trả lời.");
        return;
    }

    const details = [];
    let sent = 0;
    for (const { discordId, participant, custom, name } of rows) {
        const result = await ctx.sendCardToUser(discordId, buildReplyCard(participant, custom, ctx.adminId));
        if (result.success) {
            store.updateParticipant(campaign.id, discordId, (p) => {
                p.reply = { sentAt: new Date().toISOString() };
            });
            sent++;
            details.push(`✅ ${name}`);
        } else {
            details.push(`❌ ${name}: ${result.error}`);
        }
        await sleep(SEND_DELAY_MS);
    }

    await interaction.editReply(
        clip([`💌 Đợt **${campaign.id}**: đã gửi ${sent}/${rows.length} tin trả lời`, "", ...details].join("\n"), MAX_REPLY_LENGTH)
    );
}

module.exports = {
    commands: [{ data: sendCommand, execute: handleSend }],
};
