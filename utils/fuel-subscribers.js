/**
 * Người bật "báo khi giá xăng dầu đổi", lưu riêng trong data/fuel-subscribers.json
 * ({ discordIds: [...] }). Không ghi vào data/users.json vì file đó được git theo
 * dõi: bot tự sửa sẽ làm git pull trên server bị conflict.
 *
 * Chưa có file thì mặc định chỉ root nhận.
 */
const fs = require("fs");
const path = require("path");
const { ADMIN_DISCORD_ID } = require("../config");

const SUBSCRIBERS_FILE = path.join(__dirname, "../data/fuel-subscribers.json");

function loadFuelSubscriberIds() {
    try {
        const data = JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, "utf8"));
        return Array.isArray(data.discordIds) ? data.discordIds : [];
    } catch (error) {
        if (error.code !== "ENOENT") console.error(`❌ Không đọc được ${path.basename(SUBSCRIBERS_FILE)}: ${error.message}`);
        return [ADMIN_DISCORD_ID];
    }
}

function isFuelSubscriber(discordId) {
    return loadFuelSubscriberIds().includes(discordId);
}

// Bật / tắt cho 1 người. Ném lỗi nếu không ghi được file
function setFuelSubscriber(discordId, subscribed) {
    const ids = loadFuelSubscriberIds().filter((id) => id !== discordId);
    if (subscribed) ids.push(discordId);

    // Ghi ra file tạm rồi đổi tên, tránh hỏng file nếu bot tắt giữa chừng
    fs.mkdirSync(path.dirname(SUBSCRIBERS_FILE), { recursive: true });
    const tmpFile = `${SUBSCRIBERS_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify({ discordIds: ids }, null, 2), "utf8");
    fs.renameSync(tmpFile, SUBSCRIBERS_FILE);
}

module.exports = { loadFuelSubscriberIds, isFuelSubscriber, setFuelSubscriber, SUBSCRIBERS_FILE };
