/**
 * /feedback-tra-loi (chỉ root): bot DM tin trả lời cho từng người sau đợt feedback,
 * gồm phần chung và câu riêng trong 1 lần chạy. Mặc định chỉ xem trước.
 *
 * Tin ghép từ texts.js (REPLY): mở đầu → mỗi khối thích / cần sửa / đề xuất mà user có viết
 * (trích lại feedback của user, rồi bot rep: câu chung của khối + câu riêng) → câu riêng chung → kết.
 * Câu riêng nằm trong reply-notes.js.
 * Mỗi người nhận 1 lần: gửi xong lưu reply.sentAt, chạy lại chỉ gửi người còn lại.
 * Test (vd trong server không có người đó): `xem` tìm theo tên, `thu` gửi mọi tin vào DM root.
 */
const { MessageFlags, ContainerBuilder, SeparatorSpacingSize } = require("discord.js");
const store = require("./store");
const { REPLY } = require("./texts");
const REPLY_NOTES = require("./reply-notes");
const { COLORS, ratingLabel } = require("./cards");
const { rootCommand, clip, sleep, SEND_DELAY_MS, MAX_REPLY_LENGTH } = require("./campaign");
const { resolveName } = require("./report");

const SECTION_KEYS = ["liked", "fix", "idea"];
const MAX_QUOTE_LENGTH = 900; // mỗi khối; cả thẻ tối đa 4000 ký tự chữ

const sendCommand = rootCommand("feedback-tra-loi", "[Root] Gửi tin trả lời feedback (chung + riêng) cho từng người")
    .addBooleanOption((option) =>
        option
            .setName("gui_that")
            .setDescription("TRUE = gửi thật. Mặc định chỉ xem trước danh sách")
            .setRequired(false)
    )
    .addStringOption((option) =>
        option
            .setName("xem")
            .setDescription("Xem trước nguyên tin của 1 người: gõ tên (có dấu / không dấu) hoặc Discord ID")
            .setRequired(false)
    )
    .addBooleanOption((option) =>
        option
            .setName("thu")
            .setDescription("TRUE = gửi thử toàn bộ tin vào DM của bạn, không ai khác nhận, không tính là đã gửi")
            .setRequired(false)
    )
    .toJSON();

// ---------------------------------------------------------------------------

function noteFor(campaign, discordId) {
    return REPLY_NOTES[campaign.id]?.[discordId] || {};
}

/**
 * Các khối sẽ hiện: user có viết ô đó và bot có câu rep (câu chung của khối, câu riêng, hoặc cả hai).
 * @returns {Array<{ key, quote, replies: string[] }>}
 */
function buildSections(participant, custom, adminId) {
    const sections = [];
    for (const key of SECTION_KEYS) {
        const written = participant.submissions.map((s) => s[key]).filter(Boolean);
        if (!written.length) continue;
        const generic = REPLY.sections[key].reply;
        const useGeneric = generic && (!custom.generic || custom.generic.includes(key));
        const replies = [useGeneric && generic.replace("{admin}", `<@${adminId}>`), custom[key]].filter(Boolean);
        if (!replies.length) continue;
        sections.push({ key, quote: clip(written.join("\n"), MAX_QUOTE_LENGTH), replies });
    }
    return sections;
}

function buildReplyCard(participant, custom, adminId) {
    const container = new ContainerBuilder().setAccentColor(COLORS.thanks);
    const text = (content) => container.addTextDisplayComponents((t) => t.setContent(content));
    const divider = () =>
        container.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    text(REPLY.title);
    if (participant.rating || participant.submissions.length) text(REPLY.opening);
    for (const section of buildSections(participant, custom, adminId)) {
        divider();
        // ">>> " trích dẫn đến hết khối chữ, nên feedback của user tách riêng 1 khối chữ
        text(`${REPLY.sections[section.key].title}\n>>> ${section.quote}`);
        text(`${REPLY.botLabel} ${section.replies.join("\n")}`);
    }
    if (custom.note) {
        divider();
        text(`✉️ ${custom.note}`);
    }
    divider();
    text(REPLY.closing);
    return container;
}

function describeSections(participant, custom) {
    const names = { liked: "💚 thích", fix: "🔧 cần sửa", idea: "💡 đề xuất" };
    const sections = buildSections(participant, custom, "").map((section) => names[section.key]);
    return sections.length ? sections.join(" + ") : "chỉ mở đầu + kết";
}

// Người có tin: đã chấm / góp ý / có câu riêng, trừ root. Mặc định bỏ người đã nhận. Xếp theo tên
async function loadRecipients(ctx, campaign, { includeSent = false } = {}) {
    const ids = new Set([...Object.keys(campaign.participants), ...Object.keys(REPLY_NOTES[campaign.id] || {})]);
    const rows = [];
    for (const discordId of ids) {
        const participant = campaign.participants[discordId] || store.newParticipant();
        const custom = noteFor(campaign, discordId);
        if (ctx.isRoot(discordId) || (participant.reply?.sentAt && !includeSent)) continue;
        const hasCustom = custom.note || SECTION_KEYS.some((key) => custom[key]);
        if (!participant.rating && !participant.submissions.length && !hasCustom) continue;
        rows.push({ discordId, participant, custom, name: await resolveName(ctx, discordId) });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

// "Hoàng Thị Tiên Diễm" -> "hoang thi tien diem", để gõ không dấu vẫn tìm được
function normalize(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
}

function previewLabel(row) {
    return `-# 👀 Xem trước tin cho **${row.name}** · ${row.participant.reply?.sentAt ? "đã nhận rồi, sẽ không gửi lại" : "chưa gửi"}`;
}

async function handlePreview(interaction, ctx, campaign, query) {
    // Lấy tên Discord của người không có trong users.json có thể mất vài giây
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const rows = await loadRecipients(ctx, campaign, { includeSent: true });
    const matches = rows.filter((row) => row.discordId === query || normalize(row.name).includes(normalize(query)));
    if (matches.length !== 1) {
        const names = (matches.length ? matches : rows).map((row) => row.name).join(", ");
        await interaction.editReply(
            clip(
                matches.length
                    ? `Khớp ${matches.length} người, gõ rõ hơn: ${names}`
                    : `Không ai có tin trả lời khớp "${query}". Những người có tin: ${names || "chưa có"}`,
                MAX_REPLY_LENGTH
            )
        );
        return;
    }
    const row = matches[0];
    const card = buildReplyCard(row.participant, row.custom, ctx.adminId).addTextDisplayComponents((t) =>
        t.setContent(`${previewLabel(row)} · đợt ${campaign.id}`)
    );
    await interaction.editReply(ctx.cardPayload(card));
}

// Gửi mọi tin (kể cả người đã nhận) vào DM root, mỗi tin ghi tên người nhận. Không lưu gì
async function handleTrial(interaction, ctx, campaign) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const rows = await loadRecipients(ctx, campaign, { includeSent: true });
    for (let i = 0; i < rows.length; i++) {
        const card = buildReplyCard(rows[i].participant, rows[i].custom, ctx.adminId).addTextDisplayComponents((t) =>
            t.setContent(`-# 🧪 TIN THỬ ${i + 1}/${rows.length} · gửi cho **${rows[i].name}** · chỉ bạn thấy`)
        );
        const result = await ctx.sendCardToUser(interaction.user.id, card);
        if (!result.success) {
            await interaction.editReply(`❌ Gửi được ${i}/${rows.length} tin thử vào DM thì lỗi: ${result.error}`);
            return;
        }
        await sleep(SEND_DELAY_MS);
    }
    await interaction.editReply(`🧪 Đã gửi ${rows.length} tin thử vào DM của bạn. Chưa ai khác nhận gì.`);
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

    const query = interaction.options.getString("xem")?.trim();
    if (query) return handlePreview(interaction, ctx, campaign, query);
    if (interaction.options.getBoolean("thu") === true) return handleTrial(interaction, ctx, campaign);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sendForReal = interaction.options.getBoolean("gui_that") === true;
    const rows = await loadRecipients(ctx, campaign);

    if (!sendForReal) {
        const lines = [
            `👀 **Xem trước** · đợt **${campaign.id}** · sẽ gửi **${rows.length}** người (bỏ qua người đã nhận):`,
            ...rows.map(({ name, participant: p, custom }) => {
                const rating = p.rating ? ratingLabel(p.rating) : "chưa chấm";
                const note = custom.note || SECTION_KEYS.some((key) => custom[key]) ? " · ✉️ có câu riêng" : "";
                return `• **${name}** · ${rating} · ${describeSections(p, custom)}${note}`;
            }),
            "",
            "Xem nguyên tin 1 người: `xem: <tên>`. Gửi thử mọi tin vào DM của bạn: `thu: True`. Gửi thật: `gui_that: True`.",
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
