/**
 * Ai đã nhận thiệp, lưu trong data/event-invite/sent.json:
 *
 * { "<mã sự kiện>": { "<discordId>": "<lúc gửi, ISO>" } }
 *
 * Thư chúc lưu thêm ai đã bóc thư / trúng phiếu quà nào (xem /qua-20-10):
 * { "<mã>:opened": { "<discordId>": "<lúc bóc, ISO>" },
 *   "<mã>:gift":   { "<discordId>": { "voucher": <vị trí trong WISH_VOUCHERS>, "at": "<ISO>" } } }
 *
 * Nhờ đó chạy lại lệnh gửi thật chỉ gửi người còn thiếu / gửi lỗi, không ai nhận 2 lần.
 */
const fs = require("fs");
const path = require("path");

let filePath = null;

function init(dataDir) {
    filePath = path.join(dataDir, "sent.json");
}

function load() {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
        if (error.code !== "ENOENT") console.error(`❌ Không đọc được ${filePath}: ${error.message}`);
        return {};
    }
}

function hasReceived(eventId, discordId) {
    return Boolean(load()[eventId]?.[discordId]);
}

function markSent(eventId, discordId) {
    const state = load();
    state[eventId] = { ...state[eventId], [discordId]: new Date().toISOString() };
    fs.writeFileSync(filePath, JSON.stringify(state, null, 4));
}

// Ghi 1 mục bất kỳ (dùng cho bóc thư / phiếu quà)
function setEntry(key, discordId, value) {
    const state = load();
    state[key] = { ...state[key], [discordId]: value };
    fs.writeFileSync(filePath, JSON.stringify(state, null, 4));
}

// { "<discordId>": giá trị } của 1 mục, chưa có thì {}
function entries(key) {
    return load()[key] || {};
}

module.exports = { init, hasReceived, markSent, setEntry, entries };
