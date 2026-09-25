/**
 * Giao diện của module feedback: thẻ Components V2 và form (modal).
 *
 * customId: "fb:<mã đợt>:<hành động>[:tham số]", vd "fb:2026-09:rate:5".
 * Nút chỉ mang mã đợt, người bấm lấy từ tài khoản Discord, nên thẻ cũ vẫn bấm được.
 */
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    LabelBuilder,
    ModalBuilder,
    SectionBuilder,
    SeparatorSpacingSize,
    StringSelectMenuBuilder,
    TextDisplayBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require("discord.js");
const { INVITE, RATINGS, FEATURES, FORM, LAUNCH_FRAMES, THANKS, NAGS, NAG_BUTTON } = require("./texts");

const PREFIX = "fb:";

const COLORS = {
    invite: 0xf97316, // cam, cùng tông thẻ báo cơm
    thanks: 0x22c55e, // xanh lá
    launch: 0x8b5cf6, // tím
    admin: 0x3b82f6, // xanh dương
};

const id = (campaignId, action, arg) => [PREFIX + campaignId, action, arg].filter((x) => x !== undefined).join(":");

// "fb:2026-09:rate:5" -> { campaignId: "2026-09", action: "rate", arg: "5" }
// "fb:see:gold"       -> { campaignId: null, action: "see", arg: "gold" }
function parseCustomId(customId) {
    const [scope, action, arg] = customId.slice(PREFIX.length).split(":");
    if (scope === "see") return { campaignId: null, action: "see", arg: action };
    return { campaignId: scope, action, arg };
}

function divider(container) {
    container.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));
}

function text(container, content) {
    container.addTextDisplayComponents((t) => t.setContent(content));
}

function ratingLabel(rating) {
    return `${RATINGS[rating].emoji} ${rating}`;
}

function featureLabels(values) {
    return FEATURES.filter((f) => values.includes(f.value)).map((f) => `${f.emoji} ${f.label}`);
}

// ---------------------------------------------------------------------------
// Thẻ mời
// ---------------------------------------------------------------------------

/**
 * @param {object} campaign - đợt (campaign.test = thẻ test)
 * @param {object} participant - dữ liệu người nhận (rating, features)
 */
function buildInviteCard(campaign, participant) {
    const cid = campaign.id;
    const container = new ContainerBuilder().setAccentColor(COLORS.invite);

    if (campaign.test) text(container, INVITE.testBadge);
    text(container, INVITE.title);
    if (INVITE.greeting) text(container, INVITE.greeting);
    text(container, INVITE.intro);
    divider(container);

    text(container, INVITE.ratingQuestion);
    container.addActionRowComponents((row) =>
        row.setComponents(
            [1, 2, 3, 4, 5].map((n) =>
                new ButtonBuilder()
                    .setCustomId(id(cid, "rate", n))
                    .setLabel(String(n))
                    .setEmoji(RATINGS[n].emoji)
                    .setStyle(participant.rating === n ? ButtonStyle.Success : ButtonStyle.Secondary)
            )
        )
    );
    if (participant.rating) text(container, `### ${RATINGS[participant.rating].reply}`);

    text(container, INVITE.featuresQuestion);
    container.addActionRowComponents((row) =>
        row.setComponents(
            new StringSelectMenuBuilder()
                .setCustomId(id(cid, "features"))
                .setPlaceholder(INVITE.featuresPlaceholder)
                .setMinValues(0)
                .setMaxValues(FEATURES.length)
                .setOptions(
                    FEATURES.map((f) => ({
                        label: f.label,
                        value: f.value,
                        emoji: f.emoji,
                        default: participant.features.includes(f.value),
                    }))
                )
        )
    );
    divider(container);

    container.addActionRowComponents((row) =>
        row.setComponents(
            new ButtonBuilder()
                .setCustomId(id(cid, "write"))
                .setLabel(INVITE.writeButton)
                .setEmoji("✍️")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(id(cid, "snooze"))
                .setLabel(INVITE.snoozeButton)
                .setEmoji("🙈")
                .setStyle(ButtonStyle.Secondary)
        )
    );
    text(container, INVITE.anonymous);
    return container;
}

// ---------------------------------------------------------------------------
// Form góp ý
// ---------------------------------------------------------------------------

function textField(customId, { label, description, placeholder }) {
    const label_ = new LabelBuilder().setLabel(label).setTextInputComponent(
        new TextInputBuilder()
            .setCustomId(customId)
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder(placeholder)
            .setMaxLength(FORM.maxLength)
            .setRequired(false)
    );
    if (description) label_.setDescription(description);
    return label_;
}

/**
 * @param {string} campaignId
 * @param {boolean} needRating - chưa chấm điểm thì form có thêm ô chọn điểm (bắt buộc)
 */
function buildFeedbackModal(campaignId, needRating) {
    const modal = new ModalBuilder().setCustomId(id(campaignId, "form")).setTitle(FORM.title);
    if (needRating) {
        modal.addLabelComponents(
            new LabelBuilder().setLabel(FORM.ratingLabel).setStringSelectMenuComponent(
                new StringSelectMenuBuilder()
                    .setCustomId("rating")
                    .setPlaceholder(FORM.ratingPlaceholder)
                    .setRequired(true)
                    .setOptions(
                        [5, 4, 3, 2, 1].map((n) => ({ label: String(n), value: String(n), emoji: RATINGS[n].emoji }))
                    )
            )
        );
    }
    modal.addLabelComponents(textField("liked", FORM.liked), textField("fix", FORM.fix), textField("idea", FORM.idea));
    return modal;
}

// ---------------------------------------------------------------------------
// Hoạt hình + thẻ cảm ơn
// ---------------------------------------------------------------------------

function buildLaunchFrame(index) {
    const container = new ContainerBuilder().setAccentColor(COLORS.launch);
    text(container, LAUNCH_FRAMES[index]);
    return container;
}

/**
 * @param {object} p
 * @param {string} p.gifUrl - GIF pháo hoa đầu thẻ
 * @param {string} p.mealWeekButtonId - customId nút "Xem cả tuần" của bot
 * @param {string|null} p.qrFileName - ảnh QR đính kèm; null = không có phần donate
 */
function buildThanksCard({ gifUrl, mealWeekButtonId, qrFileName }) {
    const container = new ContainerBuilder().setAccentColor(COLORS.thanks);
    container.addMediaGalleryComponents((g) => g.addItems((item) => item.setURL(gifUrl).setDescription("Pháo hoa")));
    text(container, THANKS.title);
    divider(container);

    text(container, THANKS.featuresIntro);
    const buttonIds = { meal_week: mealWeekButtonId, gold: `${PREFIX}see:gold`, football: `${PREFIX}see:football` };
    for (const feature of THANKS.features) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${feature.title}**\n${feature.text}`))
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setCustomId(buttonIds[feature.key])
                        .setLabel(THANKS.seeButton)
                        .setStyle(ButtonStyle.Secondary)
                )
        );
    }
    text(container, THANKS.commandsHint);

    if (qrFileName) {
        divider(container);
        text(container, THANKS.donate);
        container.addMediaGalleryComponents((g) =>
            g.addItems((item) => item.setURL(`attachment://${qrFileName}`).setDescription("QR"))
        );
    }
    return container;
}

// ---------------------------------------------------------------------------
// Nhắc nợ trong thẻ báo cơm 12h (hook lunchCardExtras)
// ---------------------------------------------------------------------------

function buildNagComponents(campaignId, nagIndex) {
    return [
        new TextDisplayBuilder().setContent(`**${NAGS[nagIndex]}**`),
        new ActionRowBuilder().setComponents(
            new ButtonBuilder()
                .setCustomId(id(campaignId, "open"))
                .setLabel(NAG_BUTTON)
                .setEmoji("📝")
                .setStyle(ButtonStyle.Primary)
        ),
    ];
}

// ---------------------------------------------------------------------------
// Tin báo cho admin (ẩn danh: chỉ "Người #N")
// ---------------------------------------------------------------------------

function testTag(campaign) {
    return campaign.test ? "[TEST] " : "";
}

function buildRatingNotice(campaign, participant, previousRating) {
    const container = new ContainerBuilder().setAccentColor(COLORS.admin);
    const change = previousRating && previousRating !== participant.rating ? ` (đổi từ ${ratingLabel(previousRating)})` : "";
    const lines = [`⭐ ${testTag(campaign)}**Người #${participant.number}** chấm **${ratingLabel(participant.rating)}**${change}`];
    const features = featureLabels(participant.features);
    if (features.length) lines.push(`-# Hay xem: ${features.join(", ")}`);
    text(container, lines.join("\n"));
    return container;
}

function buildSubmissionNotice(campaign, participant, submission) {
    const container = new ContainerBuilder().setAccentColor(COLORS.admin);
    const count = participant.submissions.length;
    const features = featureLabels(participant.features);
    text(
        container,
        `### 📝 ${testTag(campaign)}Feedback mới · Người #${participant.number}${count > 1 ? ` (lần ${count})` : ""}\n` +
            `Điểm: ${participant.rating ? ratingLabel(participant.rating) : "—"}` +
            (features.length ? ` · Hay xem: ${features.join(", ")}` : "")
    );
    divider(container);
    text(
        container,
        [
            `💚 **Thích:** ${submission.liked || "—"}`,
            `🔧 **Cần sửa:** ${submission.fix || "—"}`,
            `💡 **Đề xuất:** ${submission.idea || "—"}`,
        ].join("\n")
    );
    return container;
}

module.exports = {
    PREFIX,
    COLORS,
    parseCustomId,
    ratingLabel,
    featureLabels,
    buildInviteCard,
    buildFeedbackModal,
    buildLaunchFrame,
    buildThanksCard,
    buildNagComponents,
    buildRatingNotice,
    buildSubmissionNotice,
};
