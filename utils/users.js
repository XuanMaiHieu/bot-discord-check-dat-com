/**
 * Danh sách người nhận tin trong data/users.json. Đọc lại file mỗi lần gọi nên
 * sửa file là có hiệu lực ngay, không cần restart bot.
 *
 * Các trường của 1 user:
 *   name            - họ tên đúng như cột C trên sheet
 *   discordId       - null = chưa có, bot bỏ qua người này
 *   enabled         - nhận tin cơm 12h + nhắc đứng dậy
 *   order_reminder  - nhận nhắc đặt cơm thứ 2 (thiếu = có nhận)
 *   standup_notify  - nhận nhắc đứng dậy (thiếu = có nhận)
 *   football_notify - nhận lịch bóng đá
 */
const fs = require("fs");
const path = require("path");

const USERS_FILE = path.join(__dirname, "../data/users.json");

// Ném lỗi nếu không đọc được file (dùng khi cần báo lỗi cho người gọi lệnh)
function readUsers() {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")).users;
}

// Như readUsers nhưng lỗi thì ghi log và trả về []
function loadUsers() {
    try {
        return readUsers();
    } catch (error) {
        console.error(`❌ Không đọc được data/users.json: ${error.message}`);
        return [];
    }
}

// Các user có Discord ID và thỏa điều kiện `filter`
function loadRecipients(filter) {
    return loadUsers().filter((user) => user.discordId !== null && user.discordId !== undefined && filter(user));
}

// Tìm theo Discord ID, kể cả user đang tắt (dùng khi test / tra tên)
function findUserByDiscordId(discordId) {
    return loadUsers().find((user) => user.discordId === discordId) || null;
}

// Tên đăng ký cơm của 1 Discord ID (dùng khi /abcom bỏ trống name)
function getUserNameByDiscordId(discordId) {
    return findUserByDiscordId(discordId)?.name || null;
}

// Người nhận khi test: user trong data nếu có, không thì chỉ có Discord ID
// (name = null, nơi gửi tự lấy tên Discord)
function recipientsFromIds(discordIds) {
    return discordIds.map((id) => findUserByDiscordId(id) || { discordId: id, name: null });
}

module.exports = {
    USERS_FILE,
    readUsers,
    loadUsers,
    loadRecipients,
    findUserByDiscordId,
    getUserNameByDiscordId,
    recipientsFromIds,
};
