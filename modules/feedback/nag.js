/**
 * Dòng nhắc nợ feedback trong thẻ báo cơm 12h (hook lunchCardExtras).
 *
 * Nhắc người đã được mời mà chưa chấm điểm, bắt đầu từ ngày sau ngày mời, mỗi
 * ngày 1 lần (chỉ những ngày có thẻ báo cơm). Câu nhắc theo số lần đã nhắc,
 * không theo ngày lịch: nghỉ phép quay lại vẫn gặp câu số 1. Nhắc đủ NAGS.length
 * lần (câu cuối là "bot bỏ cuộc") thì thôi.
 */
const store = require("./store");
const { NAGS } = require("./texts");
const { buildNagComponents } = require("./cards");

// YYYY-MM-DD theo giờ máy (TZ=Asia/Ho_Chi_Minh)
function dateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * /test-meal (test = true): dùng dữ liệu của /feedback-test, bỏ qua điều kiện
 * ngày, mỗi lần chạy hiện câu kế tiếp (hết thì quay lại câu 1) để xem đủ 5 câu.
 */
function testNag(discordId) {
    const participant = store.getParticipant(store.TEST_CAMPAIGN_ID, discordId);
    if (!participant || participant.rating) return null;

    const index = participant.nagCount % NAGS.length;
    store.updateParticipant(store.TEST_CAMPAIGN_ID, discordId, (p) => {
        p.nagCount = index + 1;
    });
    return buildNagComponents(store.TEST_CAMPAIGN_ID, index);
}

function lunchCardExtras({ user, date, test }) {
    if (test) return testNag(user.discordId);

    const campaign = store.getCurrentCampaign();
    if (!store.isOpen(campaign)) return null;
    const participant = campaign.participants[user.discordId];
    if (!participant?.invitedAt || participant.rating) return null;

    const today = dateKey(date);
    if (dateKey(participant.invitedAt) >= today) return null; // chưa qua ngày mời

    // Thẻ hôm nay đã dựng rồi (vd gửi lại): hiện lại đúng câu hôm nay, không đếm thêm
    if (participant.lastNagDate === today) return buildNagComponents(campaign.id, participant.nagCount - 1);
    if (participant.nagCount >= NAGS.length) return null;

    const updated = store.updateParticipant(campaign.id, user.discordId, (p) => {
        p.nagCount += 1;
        p.lastNagDate = today;
    });
    return buildNagComponents(campaign.id, updated.nagCount - 1);
}

module.exports = { lunchCardExtras };
