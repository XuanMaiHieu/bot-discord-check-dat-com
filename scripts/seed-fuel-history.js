/**
 * CHẠY TAY 1 LẦN (không phải code của bot): điền giá kỳ điều chỉnh trước vào
 * data/fuel-price-history.json, để /giaxang có ▲▼ ngay mà không phải đợi kỳ sau.
 *
 *   node scripts/seed-fuel-history.js           # bỏ qua nếu đã có kỳ trước
 *   node scripts/seed-fuel-history.js --force   # ghi đè kỳ trước
 *
 * API Petrolimex không có lịch sử, nên lấy giá cũ từ API lịch sử theo ngày của
 * giaxanghomnay.com (có sẵn mã sản phẩm Petrolimex). Chạy xong thì restart bot.
 */
const fs = require("fs");
const { getFuelPrices, HISTORY_FILE } = require("../utils/fuel-price");

const HISTORY_API = "https://giaxanghomnay.com/api/pvdate";
const MAX_DAYS_BACK = 21;

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Giá Petrolimex ngày `date` theo giaxanghomnay.com: [{ id, title, zone1, zone2 }]
async function fetchDay(date) {
    const response = await fetch(`${HISTORY_API}/${dayKey(date)}`, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!response.ok) throw new Error(`HTTP ${response.status} cho ngày ${dayKey(date)}`);
    const [petrolimex = []] = await response.json();
    return petrolimex.map((p) => ({ id: p.petrolimex_id, title: p.title, zone1: p.zone1_price, zone2: p.zone2_price }));
}

const samePrices = (a, b) =>
    a.length === b.length && a.every((p) => b.some((q) => q.id === p.id && q.zone1 === p.zone1 && q.zone2 === p.zone2));

async function main() {
    // Lấy giá hiện tại: lần đầu chạy sẽ tạo lịch sử với kỳ hiện tại
    const report = await getFuelPrices({ refresh: true });
    if (report.stale) throw new Error(`Không lấy được giá hiện tại từ Petrolimex: ${report.error}`);

    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    if (history.previous && !process.argv.includes("--force")) {
        console.log(`⏭️ Đã có kỳ trước (${history.previous.period}), bỏ qua. Dùng --force để ghi đè.`);
        return;
    }

    // Ngày trước kỳ hiện tại = giá kỳ trước; lùi tiếp đến khi giá khác để tìm ngày bắt đầu kỳ đó
    const currentStart = new Date(history.current.period);
    let day = addDays(currentStart, -1);
    const previous = await fetchDay(day);
    const currentIds = new Set(history.current.products.map((p) => p.id));
    const products = previous.filter((p) => currentIds.has(p.id));
    if (products.length === 0) throw new Error(`giaxanghomnay.com không có giá Petrolimex ngày ${dayKey(day)}`);
    if (products.some((p) => !(p.zone1 >= 5_000 && p.zone1 <= 100_000 && p.zone2 >= 5_000 && p.zone2 <= 100_000))) {
        throw new Error("giá kỳ trước không hợp lệ");
    }

    for (let i = 0; i < MAX_DAYS_BACK; i++) {
        const earlier = await fetchDay(addDays(day, -1));
        if (!samePrices(earlier.filter((p) => currentIds.has(p.id)), products)) break;
        day = addDays(day, -1);
    }

    history.previous = { period: day.toISOString(), products };
    const tmpFile = `${HISTORY_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(history, null, 2), "utf8");
    fs.renameSync(tmpFile, HISTORY_FILE);

    console.log(`✅ Đã điền kỳ trước (bắt đầu ${dayKey(day)}), so với kỳ hiện tại (${dayKey(currentStart)}):`);
    for (const p of history.current.products) {
        const before = products.find((q) => q.id === p.id);
        const diff = before ? p.zone1 - before.zone1 : null;
        console.log(`   ${p.title.padEnd(22)} ${before ? before.zone1 : "—"} → ${p.zone1}  ${diff === null ? "" : diff > 0 ? `▲${diff}` : diff < 0 ? `▼${-diff}` : "="}`);
    }
    console.log("👉 Restart bot để /giaxang hiện ▲▼.");
}

main().catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
});
