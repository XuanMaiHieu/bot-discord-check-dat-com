/**
 * Xử lý nút / menu / form của module (customId bắt đầu bằng "fb:", xem cards.js).
 */
const { MessageFlags } = require("discord.js");
const store = require("./store");
const notify = require("./notify");
const { sendThanks } = require("./thanks");
const { RATINGS, SNOOZE_REPLIES, FORM, CLOSED } = require("./texts");
const { parseCustomId, buildInviteCard, buildFeedbackModal } = require("./cards");

function replyPrivately(interaction, content) {
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

/**
 * Ghi điểm. Lần đầu chấm (chưa gửi thẻ cảm ơn) thì trả về firstTime = true.
 */
function saveRating(campaignId, discordId, rating) {
    let previousRating = null;
    let firstTime = false;
    const participant = store.updateParticipant(campaignId, discordId, (p, campaign) => {
        previousRating = p.rating;
        p.rating = rating;
        if (!p.ratedAt) p.ratedAt = new Date().toISOString();
        if (!p.thanksSentAt) {
            p.thanksSentAt = new Date().toISOString();
            firstTime = true;
        }
        store.ensureNumber(p, campaign);
    });
    return { participant, previousRating, firstTime };
}

// Gửi thẻ cảm ơn chạy nền: hoạt hình mất vài giây, không bắt người dùng chờ
function sendThanksInBackground(ctx, discordId) {
    sendThanks(ctx, discordId).catch((error) => console.error("❌ Lỗi khi gửi thẻ cảm ơn feedback:", error));
}

async function handleRate(interaction, ctx, campaign, rating) {
    if (!RATINGS[rating]) return;
    const discordId = interaction.user.id;
    const { participant, previousRating, firstTime } = saveRating(campaign.id, discordId, rating);
    await interaction.update(ctx.cardPayload(buildInviteCard(campaign, participant)));
    notify.scheduleRatingNotice(ctx, campaign.id, discordId, previousRating);
    if (firstTime) sendThanksInBackground(ctx, discordId);
}

async function handleFeatures(interaction, ctx, campaign) {
    const participant = store.updateParticipant(campaign.id, interaction.user.id, (p) => {
        p.features = [...interaction.values];
    });
    await interaction.update(ctx.cardPayload(buildInviteCard(campaign, participant)));
}

async function handleSnooze(interaction, campaign) {
    const participant = store.updateParticipant(campaign.id, interaction.user.id, (p) => {
        p.snoozeCount += 1;
    });
    const index = Math.min(participant.snoozeCount, SNOOZE_REPLIES.length) - 1;
    await replyPrivately(interaction, `🙈 ${SNOOZE_REPLIES[index]}`);
}

async function handleWrite(interaction, campaign) {
    const participant = store.getParticipant(campaign.id, interaction.user.id);
    await interaction.showModal(buildFeedbackModal(campaign.id, !participant?.rating));
}

// Nút "Feedback ngay" trong thẻ báo cơm: mở lại thẻ mời (chỉ người bấm thấy)
async function handleOpen(interaction, ctx, campaign) {
    const participant = store.updateParticipant(campaign.id, interaction.user.id, () => {});
    await interaction.reply(ctx.cardPayload(buildInviteCard(campaign, participant), { ephemeral: true }));
}

function readField(interaction, customId) {
    try {
        return interaction.fields.getTextInputValue(customId).trim();
    } catch (error) {
        return "";
    }
}

async function handleForm(interaction, ctx, campaign) {
    const discordId = interaction.user.id;

    let rating = null;
    try {
        rating = Number(interaction.fields.getStringSelectValues("rating")[0]) || null;
    } catch (error) {
        // form không có ô chọn điểm (đã chấm trên thẻ)
    }

    const submission = {
        at: new Date().toISOString(),
        liked: readField(interaction, "liked"),
        fix: readField(interaction, "fix"),
        idea: readField(interaction, "idea"),
    };
    const hasText = Boolean(submission.liked || submission.fix || submission.idea);

    let ratingResult = null;
    if (rating) ratingResult = saveRating(campaign.id, discordId, rating);
    if (hasText) {
        store.updateParticipant(campaign.id, discordId, (p, c) => {
            p.submissions.push(submission);
            store.ensureNumber(p, c);
        });
    }

    const reply = hasText ? FORM.received : FORM.empty;
    // Form mở từ thẻ mời và vừa chấm điểm trong form: cập nhật luôn nút điểm trên thẻ
    if (ratingResult && interaction.isFromMessage()) {
        await interaction.update(ctx.cardPayload(buildInviteCard(campaign, ratingResult.participant)));
        await interaction.followUp({ content: reply, flags: MessageFlags.Ephemeral });
    } else {
        await replyPrivately(interaction, reply);
    }

    if (hasText) {
        await notify.sendSubmissionNotice(ctx, campaign, discordId, submission);
    } else if (ratingResult) {
        notify.scheduleRatingNotice(ctx, campaign.id, discordId, ratingResult.previousRating);
    }
    if (ratingResult?.firstTime) sendThanksInBackground(ctx, discordId);
}

async function handleInteraction(interaction, ctx) {
    const { campaignId, action, arg } = parseCustomId(interaction.customId);

    // Nút "Xem ngay" trên thẻ cảm ơn: không phụ thuộc đợt
    if (action === "see") {
        if (arg === "gold") return ctx.features.showGold(interaction);
        if (arg === "football") return ctx.features.showFootball(interaction);
        return;
    }

    const campaign = store.getCampaign(campaignId);
    if (!store.isOpen(campaign)) return replyPrivately(interaction, CLOSED);

    if (action === "rate") return handleRate(interaction, ctx, campaign, Number(arg));
    if (action === "features") return handleFeatures(interaction, ctx, campaign);
    if (action === "snooze") return handleSnooze(interaction, campaign);
    if (action === "write") return handleWrite(interaction, campaign);
    if (action === "open") return handleOpen(interaction, ctx, campaign);
    if (action === "form") return handleForm(interaction, ctx, campaign);
}

module.exports = { handleInteraction };
