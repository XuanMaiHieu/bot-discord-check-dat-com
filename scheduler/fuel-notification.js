const cron = require("node-cron");
const { getFuelPrices, takeUnnotifiedPeriod } = require("../utils/fuel-price");
const { sendCardToUser } = require("../utils/card-message");
const { recipientsFromIds } = require("../utils/users");
const { loadFuelSubscriberIds } = require("../utils/fuel-subscribers");
const { notifyAdmin } = require("../utils/admin");
const { toDateKey } = require("../utils/workdays");

// API lỗi liên tục quá số lần này (mỗi lần cách 30 phút) thì báo root, tối đa 1 lần/ngày
const FAILURES_BEFORE_ALERT = 6;

let consecutiveFailures = 0;
let alertedDateKey = null;

// Người bật "báo khi giá đổi" (data/fuel-subscribers.json), kèm tên nếu có trong users.json
function loadFuelUsers() {
    return recipientsFromIds(loadFuelSubscriberIds());
}

async function alertApiProblem(client, reason) {
    const today = toDateKey(new Date());
    if (alertedDateKey === today) return;
    alertedDateKey = today;
    await notifyAdmin(
        client,
        "Không lấy được giá xăng Petrolimex",
        `API lỗi ${consecutiveFailures} lần liên tiếp (mỗi lần cách 30 phút).\nLỗi: ${reason}\n\n` +
            "/giaxang đang hiện giá lưu gần nhất. Nếu API đã đổi thì cần sửa `utils/fuel-price.js`."
    );
}

/**
 * Lấy giá mới. Nếu vừa chốt 1 kỳ giá mới thì DM thẻ giá cho người bật báo.
 * @returns {object} { changed, sent, failed, total }
 */
async function runFuelPriceCheck(client) {
    const report = await getFuelPrices({ refresh: true });
    if (report.stale) {
        consecutiveFailures++;
        if (consecutiveFailures >= FAILURES_BEFORE_ALERT) await alertApiProblem(client, report.error);
        return { changed: false, sent: 0, failed: 0, total: 0 };
    }
    consecutiveFailures = 0;

    if (!takeUnnotifiedPeriod()) return { changed: false, sent: 0, failed: 0, total: 0 };

    const recipients = loadFuelUsers();
    // Nạp muộn để tránh vòng lặp require commands <-> scheduler
    const { buildCardWithImage } = require("../commands/fuel");
    // Vẽ ảnh 1 lần, gửi chung cho mọi người
    const { card, files } = await buildCardWithImage(report, { subscribed: true, alert: true });
    let sent = 0;
    let failed = 0;
    for (const user of recipients) {
        const result = await sendCardToUser(client, user.discordId, card, { files });
        if (result.success) {
            sent++;
        } else {
            failed++;
            console.error(`❌ Không gửi được báo giá xăng cho ${user.name || user.discordId}: ${result.error}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.log(`⛽ Giá xăng dầu vừa đổi: đã báo ${sent}/${recipients.length} người`);
    return { changed: true, sent, failed, total: recipients.length };
}

// Cứ 30 phút kiểm tra 1 lần. Kỳ điều hành thường chiều thứ 5 nhưng có thể dời
// ngày (lễ, Tết) nên kiểm tra cả tuần; API nhẹ, 48 lần/ngày không đáng kể
function startFuelPriceScheduler(client) {
    cron.schedule("*/30 * * * *", async () => {
        try {
            await runFuelPriceCheck(client);
        } catch (error) {
            console.error(`❌ Lỗi khi kiểm tra giá xăng: ${error.message}`);
        }
    });
}

module.exports = { startFuelPriceScheduler, runFuelPriceCheck, loadFuelUsers };
