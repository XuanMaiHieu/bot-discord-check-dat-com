/**
 * Dữ liệu nhắc uống nước, lưu trong data/water/state.json:
 *
 * { users: { "<discordId>": Member } }
 *
 * Member: {
 *   subscribed, interval,          // đang bật không, nhắc mỗi bao nhiêu phút
 *   goalMl, cupMl,                 // mục tiêu mỗi ngày (ml), mỗi lần bấm "Đã uống" tính bao nhiêu ml
 *   announcedMlAt,                 // lúc gửi thông báo "đã chuyển sang ml" (/nuoc-thong-bao), null = chưa gửi
 *   invitedAt, declinedAt,          // admin mời (/nuoc-moi) / người đó bấm "Không, cảm ơn"
 *   subscribedAt,
 *   day: { date, cups, ml, reminders, lastSentAt, lastDrinkAt, snoozeUntil, off },   // số liệu hôm nay
 *   lastMessage: { channelId, messageId } | null,   // tin nhắc / tổng kết gần nhất, xóa khi gửi tin mới
 *   failCount,                    // số lần gửi nhắc lỗi liên tiếp (vd tắt DM), đủ MAX thì tự tắt
 *   promoDates: ["YYYY-MM-DD"]                    // những ngày đã thấy dòng giới thiệu ở thẻ 12h
 * }
 *
 * Giữ bản trong bộ nhớ, ghi đè file sau mỗi lần sửa. Hàm đồng bộ nên không có 2 lần sửa chen nhau.
 */
const fs = require("fs");
const path = require("path");

const DEFAULT_INTERVAL = 90;
const INTERVALS = [60, 90, 120];
const DEFAULT_GOAL_ML = 2000;
const GOALS_ML = [1500, 2000, 2500, 3000];
const DEFAULT_CUP_ML = 250;
const CUPS_ML = [200, 250, 330, 500, 750];

let filePath = null;
let state = null;

function init(dataDir) {
    filePath = path.join(dataDir, "state.json");
    state = null;
}

function load() {
    if (state) return state;
    try {
        state = { users: {}, ...JSON.parse(fs.readFileSync(filePath, "utf8")) };
        migrate(state);
    } catch (error) {
        if (error.code !== "ENOENT") console.error(`❌ Không đọc được ${filePath}, bắt đầu dữ liệu trống: ${error.message}`);
        state = { users: {} };
    }
    return state;
}

// Dữ liệu cũ đếm theo cốc 250ml: đổi sang ml, thêm mục tiêu / dung tích mặc định
function migrate(s) {
    for (const member of Object.values(s.users)) {
        member.goalMl ??= DEFAULT_GOAL_ML;
        member.cupMl ??= DEFAULT_CUP_ML;
        member.announcedMlAt ??= null;
        if (member.day && member.day.ml === undefined) member.day.ml = (member.day.cups || 0) * DEFAULT_CUP_ML;
    }
}

function save() {
    // Ghi ra file tạm rồi đổi tên, tránh hỏng file nếu bot tắt giữa chừng
    const tmpFile = `${filePath}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tmpFile, filePath);
}

// YYYY-MM-DD theo giờ máy (TZ=Asia/Ho_Chi_Minh)
function dateKey(date = new Date()) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function newDay(date) {
    return { date, cups: 0, ml: 0, reminders: 0, lastSentAt: null, lastDrinkAt: null, snoozeUntil: null, off: false };
}

function newMember() {
    return {
        subscribed: false,
        interval: DEFAULT_INTERVAL,
        goalMl: DEFAULT_GOAL_ML,
        cupMl: DEFAULT_CUP_ML,
        announcedMlAt: null,
        invitedAt: null,
        declinedAt: null,
        subscribedAt: null,
        day: newDay(dateKey()),
        lastMessage: null,
        failCount: 0,
        promoDates: [],
    };
}

// Số liệu hôm nay của 1 người (sang ngày mới / chưa có dữ liệu thì bắt đầu từ 0)
function today(member, now = new Date()) {
    const key = dateKey(now);
    return member?.day?.date === key ? member.day : newDay(key);
}

// Số liệu hiển thị: cups = số lần uống, ml = tổng hôm nay, goalMl = mục tiêu của người này
function progress(member, now = new Date()) {
    const day = today(member, now);
    return { cups: day.cups, ml: day.ml, goalMl: member?.goalMl || DEFAULT_GOAL_ML };
}

function getMember(discordId) {
    return load().users[discordId] || null;
}

function allMembers() {
    return Object.entries(load().users).map(([discordId, member]) => ({ discordId, member }));
}

/**
 * Sửa dữ liệu 1 người (tạo mới nếu chưa có). `change(member, day)` sửa trực tiếp;
 * `day` là số liệu hôm nay, đã gắn vào member. Trả về member sau khi sửa.
 */
function updateMember(discordId, change, now = new Date()) {
    const s = load();
    const member = s.users[discordId] || newMember();
    s.users[discordId] = member;
    member.day = today(member, now);
    change(member, member.day);
    save();
    return member;
}

module.exports = {
    DEFAULT_INTERVAL,
    INTERVALS,
    DEFAULT_GOAL_ML,
    GOALS_ML,
    DEFAULT_CUP_ML,
    CUPS_ML,
    init,
    dateKey,
    today,
    progress,
    getMember,
    allMembers,
    updateMember,
};
