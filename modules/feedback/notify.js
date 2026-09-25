/**
 * DM báo admin khi có phản hồi (ẩn danh, chỉ "Người #N").
 *   - Góp ý bằng chữ: báo ngay.
 *   - Chấm / đổi điểm: chờ người đó ngừng bấm RATING_SETTLE_MS rồi mới báo 1 lần,
 *     để đổi điểm liên tục không thành spam.
 */
const store = require("./store");
const { buildRatingNotice, buildSubmissionNotice } = require("./cards");

const RATING_SETTLE_MS = 60 * 1000;

// "<mã đợt>:<discordId>" -> { timer, previousRating }
const pendingRatings = new Map();

async function sendToAdmin(ctx, card) {
    const result = await ctx.sendCardToUser(ctx.adminId, card);
    if (!result.success) console.error(`❌ Không DM được admin về feedback: ${result.error}`);
}

/**
 * Hẹn báo điểm. `previousRating` = điểm trước lần bấm này (null = lần đầu chấm).
 */
function scheduleRatingNotice(ctx, campaignId, discordId, previousRating) {
    const key = `${campaignId}:${discordId}`;
    const pending = pendingRatings.get(key);
    if (pending) clearTimeout(pending.timer);

    // Giữ điểm từ trước lúc bắt đầu bấm, để tin báo "đổi từ X" đúng
    const fromRating = pending ? pending.previousRating : previousRating;
    const timer = setTimeout(async () => {
        pendingRatings.delete(key);
        const campaign = store.getCampaign(campaignId);
        const participant = store.getParticipant(campaignId, discordId);
        if (!campaign || !participant?.rating) return;
        if (fromRating === participant.rating) return; // bấm qua lại rồi quay về điểm cũ
        try {
            await sendToAdmin(ctx, buildRatingNotice(campaign, participant, fromRating));
        } catch (error) {
            console.error("❌ Lỗi khi báo điểm feedback cho admin:", error);
        }
    }, RATING_SETTLE_MS);
    timer.unref?.();
    pendingRatings.set(key, { timer, previousRating: fromRating });
}

/**
 * Báo ngay 1 lần gửi form. Tin này đã có điểm hiện tại nên bỏ tin báo điểm
 * đang chờ (nếu có) của người này.
 */
async function sendSubmissionNotice(ctx, campaign, discordId, submission) {
    const key = `${campaign.id}:${discordId}`;
    const pending = pendingRatings.get(key);
    if (pending) {
        clearTimeout(pending.timer);
        pendingRatings.delete(key);
    }
    const participant = store.getParticipant(campaign.id, discordId);
    await sendToAdmin(ctx, buildSubmissionNotice(campaign, participant, submission));
}

module.exports = { scheduleRatingNotice, sendSubmissionNotice };
