/**
 * Ảnh bảng giá xăng dầu / giá vàng cho thẻ Discord.
 *
 * Dựng "view" (chữ đã định dạng) từ report rồi vẽ trong tiến trình con
 * (poster-renderer.js). Ảnh giữ trong bộ nhớ theo nội dung view: giá chưa đổi
 * thì dùng lại ảnh cũ, không vẽ lại. Vẽ lỗi trả về null để nơi gọi dùng thẻ chữ.
 */
const { AttachmentBuilder } = require("discord.js");
const { renderPostersInChildProcess } = require("./poster-renderer");
const { SOURCES } = require("./gold-price");
const { formatDayMonth, isWeekend, toDateKey } = require("./workdays");

const CACHE_SIZE = 8;
const cache = new Map(); // key -> PNG Buffer
const pending = new Map(); // key -> Promise: nhiều người cùng xem ảnh chưa có thì vẽ 1 lần

const pad = (n) => String(n).padStart(2, "0");
const formatTime = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())} · ${formatDayMonth(date)}`;
const formatVnd = (value) => (value === null || value === undefined ? "—" : value.toLocaleString("vi-VN"));

function change(diff, format = formatVnd) {
    if (diff === null || diff === undefined || Number.isNaN(diff)) return null;
    if (diff === 0) return { dir: "same", text: "" };
    return { dir: diff > 0 ? "up" : "down", text: format(Math.abs(diff)) };
}

// ---------------------------------------------------------------------------

function fuelIcon(title) {
    const t = title.toLowerCase();
    if (t.includes("xăng")) return "⛽";
    if (t.startsWith("do ") || t.includes("diesel")) return "🛢️";
    if (t.includes("dầu hỏa")) return "🔥";
    return "🔸";
}

function fuelView(report, { alert = false } = {}) {
    return {
        type: "fuel",
        alert,
        stale: report.stale,
        updatedText: formatTime(report.updatedAt),
        comparedText: report.comparedTo ? formatDayMonth(report.comparedTo) : null,
        rows: report.products.map((p) => ({
            icon: fuelIcon(p.title),
            title: p.title,
            zone1: formatVnd(p.zone1),
            zone2: formatVnd(p.zone2),
            change1: change(p.change1),
            change2: change(p.change2),
        })),
    };
}

// ---------------------------------------------------------------------------

const GOLD_MAIN = [
    { key: "sjc", icon: "🥇" },
    { key: "ring", icon: "💍" },
];
const GOLD_MAX_EXTRAS = 6;

// Chênh giá vàng: 120000 -> "120k", 1200000 -> "1,2tr"
const formatGoldDiff = (abs) =>
    abs >= 1_000_000
        ? `${(abs / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}tr`
        : `${Math.round(abs / 1000).toLocaleString("vi-VN")}k`;

// 1 chỉ -> triệu/lượng (10 chỉ): 14400000 -> "144,0"
const perTael = (value) =>
    value ? (value * 10 / 1_000_000).toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—";

function goldWarnings(report, { isToday, now }) {
    if (!isToday) return [];
    const { result, stale } = report;
    if (stale) return ["ĐANG HIỆN GIÁ CŨ"];
    const warnings = [];
    if (result.source !== "phuquy") warnings.push(`DỰ PHÒNG: ${SOURCES[result.source].label.toLocaleUpperCase("vi-VN")}`);
    if (result.updatedAt && !isWeekend(now) && toDateKey(result.updatedAt) !== toDateKey(now)) warnings.push("CHƯA CÓ GIÁ HÔM NAY");
    return warnings;
}

function goldView(report, { isToday = true, now = new Date() } = {}) {
    const { result, previous } = report;
    const source = SOURCES[result.source];
    const updatedText = !result.updatedAt
        ? "Không rõ giờ cập nhật"
        : result.hasTime
          ? `Cập nhật ${formatTime(result.updatedAt)}`
          : `Ngày ${formatDayMonth(result.updatedAt)}`;

    const main = GOLD_MAIN.map(({ key, icon }) => {
        const item = result.items.find((i) => i.key === key);
        if (!item) return null;
        const before = previous?.items.find((i) => i.key === key);
        const diff = (now, old) => (now && old ? now - old : null);
        return {
            icon,
            name: item.name,
            buy: formatVnd(item.buy),
            sell: formatVnd(item.sell),
            buyChange: change(diff(item.buy, before?.buy), formatGoldDiff),
            sellChange: change(diff(item.sell, before?.sell), formatGoldDiff),
            perTael: `${perTael(item.buy)} / ${perTael(item.sell)}`,
        };
    }).filter(Boolean);

    const extras = result.items
        .filter((i) => !i.key && (i.buy || i.sell))
        .slice(0, GOLD_MAX_EXTRAS)
        .map((i) => ({ name: i.name, buy: formatVnd(i.buy), sell: formatVnd(i.sell) }));

    return {
        type: "gold",
        sourceLabel: source.label,
        site: source.site,
        updatedText,
        warnings: goldWarnings(report, { isToday, now }),
        main,
        extras,
        comparedText: previous?.updatedAt ? formatDayMonth(previous.updatedAt) : null,
    };
}

// ---------------------------------------------------------------------------

async function renderUncached(key, view) {
    try {
        const [png] = await renderPostersInChildProcess([view]);
        if (!png) return null;
        cache.set(key, png);
        if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
        return png;
    } catch (error) {
        console.error(`❌ Không vẽ được ảnh bảng giá ${view.type}, dùng thẻ chữ: ${error.message}`);
        return null;
    } finally {
        pending.delete(key);
    }
}

function render(view) {
    const key = JSON.stringify(view);
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (!pending.has(key)) pending.set(key, renderUncached(key, view));
    return pending.get(key);
}

/** Ảnh giá xăng (PNG) hoặc null. Không vẽ khi chưa có giá nào. */
function renderFuelImage(report, options) {
    if (!report.products.length || !report.updatedAt) return Promise.resolve(null);
    return render(fuelView(report, options));
}

/** Ảnh giá vàng (PNG) hoặc null. */
function renderGoldImage(report, options) {
    if (!report.result) return Promise.resolve(null);
    return render(goldView(report, options));
}

/**
 * Ảnh -> { imageFileName, files } để truyền vào build*Card và cardPayload.
 * png = null -> không có ảnh (thẻ chữ).
 */
function imageAttachment(png, fileName) {
    if (!png) return { imageFileName: null, files: [] };
    return { imageFileName: fileName, files: [new AttachmentBuilder(png, { name: fileName })] };
}

module.exports = { renderFuelImage, renderGoldImage, imageAttachment, fuelView, goldView };
