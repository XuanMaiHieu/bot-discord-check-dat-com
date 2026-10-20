/**
 * Bù dữ liệu thư chúc 20/10 từ log cho người bóc thư / mở quà khi bot còn bản
 * chưa lưu (trước khi có /qua-20-10). Đọc các dòng bot ghi trong logs/out.log:
 *
 *   💌 <họ tên> vừa bóc thư 20/10
 *   🎁 <họ tên> vừa mở quà 20/10: phiếu số <N>
 *
 * rồi điền vào data/event-invite/sent.json những người chưa có (không ghi đè ai).
 * Giờ bóc / mở không có trong log nên ghi giờ chạy script.
 *
 *   node scripts/backfill-wish-gifts.js [file log] [--ghi]
 *
 * Mặc định đọc logs/out.log, thiếu --ghi thì chỉ xem trước. Bot chạy pm2 không
 * qua ecosystem.config.js thì log ở chỗ khác, tìm bằng:
 *   pm2 describe bot-check-dat-com | grep "out log path"
 *
 * Bot đang chạy cũng ghi file này, nên ghi xong không cần restart.
 */
const fs = require("fs");
const path = require("path");
const { loadUsers } = require("../utils/users");
const { WISH_ID, WISH_VOUCHERS } = require("../modules/event-invite/texts");

const LOG_FILE = process.argv.slice(2).find((arg) => arg !== "--ghi") || path.join(__dirname, "../logs/out.log");
const STORE_FILE = path.join(__dirname, "../data/event-invite/sent.json");
const OPENED_KEY = `${WISH_ID}:opened`;
const GIFT_KEY = `${WISH_ID}:gift`;

const write = process.argv.includes("--ghi");
const state = fs.existsSync(STORE_FILE) ? JSON.parse(fs.readFileSync(STORE_FILE, "utf8")) : {};
state[OPENED_KEY] ||= {};
state[GIFT_KEY] ||= {};

// Họ tên -> Discord ID (log ghi họ tên trong users.json)
const idByName = new Map(loadUsers().filter((u) => u.discordId).map((u) => [u.name, u.discordId]));
const now = new Date().toISOString();
const notes = [];
let changes = 0;

// Mỗi người lấy dòng mở quà đầu tiên (bot cũ có thể ghi nhiều lần nếu gửi thử nhiều thư)
for (const line of fs.readFileSync(LOG_FILE, "utf8").split("\n")) {
    const opened = line.match(/💌 (.+) vừa bóc thư 20\/10/);
    const gift = line.match(/🎁 (.+) vừa mở quà 20\/10: phiếu số (\d+)/);
    const name = (opened || gift)?.[1];
    if (!name) continue;
    const discordId = idByName.get(name);
    if (!discordId) {
        notes.push(`⚠️ ${name}: không có trong users.json, bỏ qua`);
        continue;
    }
    if (!state[OPENED_KEY][discordId]) {
        state[OPENED_KEY][discordId] = now;
        notes.push(`💌 ${name}: thêm đã bóc thư`);
        changes += 1;
    }
    if (gift && !state[GIFT_KEY][discordId]) {
        const voucher = Number(gift[2]) - 1;
        state[GIFT_KEY][discordId] = { voucher, at: now, fromLog: true };
        notes.push(`🎁 ${name}: thêm phiếu số ${voucher + 1} (${WISH_VOUCHERS[voucher]?.title || "?"})`);
        changes += 1;
    }
}

console.log(notes.length ? notes.join("\n") : "Không có ai cần bù.");
if (write && changes) {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(state, null, 4));
    console.log(`✅ Đã ghi ${path.relative(process.cwd(), STORE_FILE)}`);
} else if (changes) {
    console.log("\n👀 Xem trước, thêm --ghi để ghi thật");
}
