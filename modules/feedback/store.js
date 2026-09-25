/**
 * Dữ liệu feedback lưu trong data/feedback/state.json:
 *
 * {
 *   currentCampaignId: "2026-09" | null,     // đợt đang mở
 *   campaigns: {
 *     "<id>": {
 *       id, createdAt, closedAt, test,
 *       nextNumber,                           // số "Người #N" tiếp theo
 *       participants: { "<discordId>": Participant }
 *     }
 *   },
 *   claps: { total }
 * }
 *
 * Participant: { invitedAt, number, rating, ratedAt, features[], snoozeCount,
 *                nagCount, lastNagDate, thanksSentAt, submissions[{ at, liked, fix, idea }] }
 *
 * Giữ bản trong bộ nhớ và ghi đè file sau mỗi lần sửa. Mọi hàm đều đồng bộ nên
 * không có 2 lần sửa chen nhau (Node chạy 1 luồng).
 */
const fs = require("fs");
const path = require("path");

// Đợt test của /feedback-test: chỉ admin, không tính vào thống kê, không nhắc nợ thật
const TEST_CAMPAIGN_ID = "test";

let filePath = null;
let state = null;

function init(dataDir) {
    filePath = path.join(dataDir, "state.json");
    state = null;
}

function emptyState() {
    return { currentCampaignId: null, campaigns: {}, claps: { total: 0 } };
}

function load() {
    if (state) return state;
    try {
        state = { ...emptyState(), ...JSON.parse(fs.readFileSync(filePath, "utf8")) };
    } catch (error) {
        if (error.code !== "ENOENT") console.error(`❌ Không đọc được ${filePath}, bắt đầu dữ liệu trống: ${error.message}`);
        state = emptyState();
    }
    return state;
}

function save() {
    // Ghi ra file tạm rồi đổi tên, tránh hỏng file nếu bot tắt giữa chừng
    const tmpFile = `${filePath}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tmpFile, filePath);
}

function newCampaign(id, { test = false } = {}) {
    return { id, createdAt: new Date().toISOString(), closedAt: null, test, nextNumber: 1, participants: {} };
}

function newParticipant() {
    return {
        invitedAt: null,
        number: null,
        rating: null,
        ratedAt: null,
        features: [],
        snoozeCount: 0,
        nagCount: 0,
        lastNagDate: null,
        thanksSentAt: null,
        submissions: [],
    };
}

function getCampaign(id) {
    return load().campaigns[id] || null;
}

function listCampaignIds() {
    return Object.keys(load().campaigns);
}

function getCurrentCampaign() {
    const { currentCampaignId } = load();
    return currentCampaignId ? getCampaign(currentCampaignId) : null;
}

// Đợt gần nhất (đang mở hoặc đã đóng), bỏ qua đợt test
function getLatestCampaign() {
    const real = Object.values(load().campaigns).filter((c) => !c.test);
    return real.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
}

// Mở đợt mới, mã theo tháng: "2026-09", trùng thì "2026-09-2"...
function openCampaign(now = new Date()) {
    const s = load();
    const base = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let id = base;
    for (let n = 2; s.campaigns[id]; n++) id = `${base}-${n}`;
    s.campaigns[id] = newCampaign(id);
    s.currentCampaignId = id;
    save();
    return s.campaigns[id];
}

function closeCurrentCampaign() {
    const campaign = getCurrentCampaign();
    if (!campaign) return null;
    campaign.closedAt = new Date().toISOString();
    load().currentCampaignId = null;
    save();
    return campaign;
}

// Đợt còn nhận phản hồi không (đợt test luôn mở)
function isOpen(campaign) {
    return Boolean(campaign) && !campaign.closedAt;
}

// Xóa dữ liệu test của 1 người rồi tạo lại như vừa được mời
function resetTestParticipant(discordId) {
    const s = load();
    if (!s.campaigns[TEST_CAMPAIGN_ID]) s.campaigns[TEST_CAMPAIGN_ID] = newCampaign(TEST_CAMPAIGN_ID, { test: true });
    const campaign = s.campaigns[TEST_CAMPAIGN_ID];
    campaign.participants[discordId] = { ...newParticipant(), invitedAt: new Date().toISOString() };
    save();
    return campaign.participants[discordId];
}

function getParticipant(campaignId, discordId) {
    return getCampaign(campaignId)?.participants[discordId] || null;
}

/**
 * Sửa dữ liệu 1 người (tạo mới nếu chưa có). `change(participant, campaign)`
 * sửa trực tiếp object. Trả về participant sau khi sửa, null nếu không có đợt.
 */
function updateParticipant(campaignId, discordId, change) {
    const campaign = getCampaign(campaignId);
    if (!campaign) return null;
    const participant = campaign.participants[discordId] || newParticipant();
    campaign.participants[discordId] = participant;
    change(participant, campaign);
    save();
    return participant;
}

// Cấp số "Người #N" lần đầu người này phản hồi. Cấp theo thứ tự phản hồi
// (không theo thứ tự trong users.json) để số không lộ ra là ai
function ensureNumber(participant, campaign) {
    if (participant.number === null) participant.number = campaign.nextNumber++;
    return participant.number;
}

function addClaps(count) {
    const s = load();
    s.claps.total += count;
    save();
    return s.claps.total;
}

function getClapTotal() {
    return load().claps.total;
}

module.exports = {
    TEST_CAMPAIGN_ID,
    init,
    getCampaign,
    listCampaignIds,
    getCurrentCampaign,
    getLatestCampaign,
    openCampaign,
    closeCurrentCampaign,
    isOpen,
    resetTestParticipant,
    getParticipant,
    updateParticipant,
    ensureNumber,
    addClaps,
    getClapTotal,
};
