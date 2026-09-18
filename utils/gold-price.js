/**
 * Giá vàng hôm nay. Chưa có API chính thức nên đọc trang giá của Phú Quý, và có
 * 2 nguồn dự phòng khi trang đó lỗi / đổi giao diện:
 *
 *   1. Phú Quý   https://phuquygroup.vn/giavang       (HTML, VNĐ/chỉ) - nguồn chính
 *   2. PNJ       API JSON mà web PNJ đang dùng         (nghìn đồng/chỉ)
 *   3. BTMC      API công khai của Bảo Tín Minh Châu   (VNĐ/chỉ)
 *
 * Mọi nguồn được chuẩn hóa về VNĐ/chỉ và phải qua validate() mới được dùng.
 * Giá lấy được gần nhất lưu ra file để khi cả 3 nguồn lỗi vẫn còn giá để hiện.
 *
 * Giá ngày cũ chỉ có ở Phú Quý (trang /XemLai?date=YYYY-MM-DD).
 */
const fs = require("fs");
const path = require("path");
const { startOfDay, addDays, toDateKey } = require("./workdays");

const PHU_QUY_URL = "https://phuquygroup.vn/giavang";
const PHU_QUY_HISTORY_URL = "https://phuquygroup.vn/XemLai";
const PNJ_URL = "https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00";
// Key công khai trong tài liệu API của BTMC, ai cũng dùng chung
const BTMC_URL = "http://api.btmc.vn/api/BTMCAPI/getpricebtmc?key=3kd8ub1llcg9t45hnoh8hmn7t5kc2v";

const FETCH_TIMEOUT_MS = 8 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
// Nút "Làm mới" chỉ gọi lại nguồn khi giá trong cache cũ hơn mức này
const MIN_REFRESH_MS = 60 * 1000;

// Khoảng giá hợp lý cho 1 chỉ vàng, và mức chênh tối đa so với lần lấy trước.
// Ngoài khoảng này coi như đọc sai (trang đổi giao diện, đổi đơn vị...)
const MIN_PRICE = 1_000_000;
const MAX_PRICE = 100_000_000;
const MAX_JUMP_RATIO = 0.15;

// data/ nằm trong .gitignore nên git pull không ghi đè
const LAST_FILE = path.join(__dirname, "../data/gold-price-last.json");
const HISTORY_FILE = path.join(__dirname, "../data/gold-price-history.json");
const HISTORY_KEEP_DAYS = 40;

const SOURCES = {
    phuquy: { label: "Phú Quý", site: "phuquygroup.vn" },
    pnj: { label: "PNJ", site: "pnj.com.vn" },
    btmc: { label: "Bảo Tín Minh Châu", site: "btmc.vn" },
};

let todayCache = null; // { report, fetchedAt }
let inFlight = null; // lần lấy giá đang chạy: nhiều người gọi cùng lúc thì dùng chung

function normalize(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/đ/g, "d")
        .replace(/\s+/g, " ")
        .trim();
}

// Loại vàng chính: "sjc" (vàng miếng SJC), "ring" (nhẫn tròn / nhẫn trơn 999.9)
// "trơn" và "tròn" bỏ dấu đều thành "tron"
function classify(name) {
    const n = normalize(name);
    if (/\bsjc\b/.test(n) && /mieng/.test(n) && !/phi sjc/.test(n)) return "sjc";
    if (/nhan tron/.test(n)) return "ring";
    return null;
}

function decodeEntities(text) {
    return String(text || "")
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&nbsp;/g, " ")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
}

// "14,400,000" -> 14400000; ô trống -> null
function parsePrice(text) {
    const digits = String(text ?? "").replace(/[^\d]/g, "");
    return digits ? Number(digits) : null;
}

// "DD/MM/YYYY" + "HH:MM" (tùy chọn) -> Date giờ máy (TZ Việt Nam)
function parseVnDateTime(dateText, timeText = null) {
    const d = String(dateText).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!d) return null;
    const t = timeText ? String(timeText).match(/(\d{1,2}):(\d{2})/) : null;
    return new Date(Number(d[3]), Number(d[2]) - 1, Number(d[1]), t ? Number(t[1]) : 0, t ? Number(t[2]) : 0);
}

async function fetchText(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { "user-agent": "Mozilla/5.0 (bot-check-dat-com; gia vang cho nhom noi bo)" },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
    } catch (error) {
        if (error.name === "AbortError") throw new Error(`quá ${FETCH_TIMEOUT_MS / 1000}s không phản hồi`);
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

// ----- Phú Quý (HTML) -----

// Đọc bảng giá theo class buy-price / sell-price chứ không theo vị trí cột,
// nên trang thêm / bớt / đổi thứ tự dòng vẫn đọc đúng
function parsePhuQuyHtml(html) {
    const items = [];
    for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)].map(([, attrs, inner]) => ({
            attrs,
            text: decodeEntities(inner.replace(/<[^>]+>/g, " ")),
        }));
        const buyCell = cells.find((c) => /\bbuy-price\b/.test(c.attrs));
        const sellCell = cells.find((c) => /\bsell-price\b/.test(c.attrs));
        const nameCell = cells.find((c) => c !== buyCell && c !== sellCell && c.text);
        if (!nameCell || (!buyCell && !sellCell)) continue;

        items.push({
            key: classify(nameCell.text),
            name: nameCell.text,
            buy: parsePrice(buyCell?.text),
            sell: parsePrice(sellCell?.text),
        });
    }

    // "Giá vàng cập nhật lần cuối lúc 11:43 18/09/2026" hoặc "Giá vàng ngày 17/09/2026"
    const heading = decodeEntities((html.match(/class="update-time"[^>]*>([^<]*)</) || [])[1] || "");
    const time = heading.match(/\d{1,2}:\d{2}/);
    return {
        items,
        updatedAt: parseVnDateTime(heading, time ? time[0] : null),
        hasTime: Boolean(time),
    };
}

async function fetchPhuQuy() {
    const parsed = parsePhuQuyHtml(await fetchText(PHU_QUY_URL));
    return { source: "phuquy", ...parsed };
}

// Giá Phú Quý của 1 ngày đã qua. Ngày chưa có dữ liệu (tương lai) thì trang trả
// về giá hôm nay, nên phải so ngày ghi trên trang với ngày hỏi
async function fetchPhuQuyByDate(date) {
    const url = `${PHU_QUY_HISTORY_URL}?date=${toDateKey(date)}`;
    const parsed = parsePhuQuyHtml(await fetchText(url));
    if (!parsed.updatedAt || toDateKey(parsed.updatedAt) !== toDateKey(date)) {
        throw new Error(`Phú Quý không có giá ngày ${toDateKey(date)}`);
    }
    return { source: "phuquy", ...parsed };
}

// ----- PNJ (JSON, nghìn đồng/chỉ) -----

async function fetchPnj() {
    const data = JSON.parse(await fetchText(PNJ_URL));
    if (!Array.isArray(data.data)) throw new Error("dữ liệu PNJ không có danh sách giá");

    const [date, time] = String(data.updateDate || "").split(" ");
    return {
        source: "pnj",
        items: data.data.map((item) => ({
            key: classify(item.tensp),
            name: String(item.tensp || item.masp),
            buy: Number.isFinite(item.giamua) ? item.giamua * 1000 : null,
            sell: Number.isFinite(item.giaban) ? item.giaban * 1000 : null,
        })),
        updatedAt: date ? parseVnDateTime(date, time) : null,
        hasTime: Boolean(time),
    };
}

// ----- Bảo Tín Minh Châu (JSON, VNĐ/chỉ) -----

async function fetchBtmc() {
    const data = JSON.parse(await fetchText(BTMC_URL));
    const rows = data?.DataList?.Data;
    if (!Array.isArray(rows)) throw new Error("dữ liệu BTMC không có danh sách giá");

    // Mỗi sản phẩm có nhiều dòng theo các lần cập nhật: giữ dòng mới nhất
    const latest = new Map();
    for (const row of rows) {
        const i = row["@row"];
        const name = row[`@n_${i}`];
        const [date, time] = String(row[`@d_${i}`] || "").split(" ");
        const updatedAt = parseVnDateTime(date, time);
        if (!name || !updatedAt) continue;
        if (!latest.has(name) || latest.get(name).updatedAt < updatedAt) {
            latest.set(name, {
                key: classify(name),
                name,
                buy: parsePrice(row[`@pb_${i}`]),
                sell: parsePrice(row[`@ps_${i}`]),
                updatedAt,
            });
        }
    }

    const items = [...latest.values()];
    const main = items.filter((item) => item.key);
    return {
        source: "btmc",
        items: items.map(({ updatedAt, ...item }) => item),
        updatedAt: main.length ? new Date(Math.max(...main.map((item) => item.updatedAt))) : null,
        hasTime: true,
    };
}

// ----- Kiểm tra dữ liệu -----

/**
 * Trả về danh sách lỗi (rỗng = hợp lệ). Bắt buộc có SJC + nhẫn tròn, giá là số
 * trong khoảng hợp lý, mua <= bán, và không chênh quá 15% so với lần trước.
 */
function validate(result, previous = null) {
    const problems = [];
    if (!result.items.length) return ["không đọc được dòng giá nào (có thể trang đã đổi giao diện)"];

    for (const key of ["sjc", "ring"]) {
        const item = result.items.find((i) => i.key === key);
        const label = key === "sjc" ? "vàng miếng SJC" : "nhẫn tròn";
        if (!item) {
            problems.push(`không thấy dòng ${label}`);
            continue;
        }
        for (const [field, value] of [["mua", item.buy], ["bán", item.sell]]) {
            if (value === null) problems.push(`${label}: thiếu giá ${field}`);
            else if (value < MIN_PRICE || value > MAX_PRICE) {
                problems.push(`${label}: giá ${field} ${value.toLocaleString("vi-VN")} ngoài khoảng hợp lý`);
            }
        }
        if (item.buy !== null && item.sell !== null && item.buy > item.sell) {
            problems.push(`${label}: giá mua lớn hơn giá bán`);
        }

        const before = previous?.items?.find((i) => i.key === key);
        if (before?.sell && item.sell && Math.abs(item.sell - before.sell) / before.sell > MAX_JUMP_RATIO) {
            problems.push(
                `${label}: giá bán chênh hơn ${MAX_JUMP_RATIO * 100}% so với lần trước ` +
                    `(${before.sell.toLocaleString("vi-VN")} → ${item.sell.toLocaleString("vi-VN")})`
            );
        }
    }
    return problems;
}

// ----- Lưu file -----

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        return fallback;
    }
}

function writeJson(file, data) {
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`❌ Không lưu được ${path.basename(file)}: ${error.message}`);
    }
}

// JSON không giữ được Date
function serialize(result) {
    return { ...result, updatedAt: result.updatedAt ? result.updatedAt.toISOString() : null };
}

function deserialize(saved) {
    return saved ? { ...saved, updatedAt: saved.updatedAt ? new Date(saved.updatedAt) : null } : null;
}

function loadLast() {
    return deserialize(readJson(LAST_FILE, null));
}

// Giá Phú Quý của 1 ngày đã qua: lấy 1 lần rồi lưu mãi (giá ngày cũ không đổi)
async function getPhuQuyDay(date) {
    const key = toDateKey(date);
    const history = readJson(HISTORY_FILE, {});
    if (history[key]) return deserialize(history[key]);

    const result = await fetchPhuQuyByDate(date);
    const problems = validate(result);
    if (problems.length) throw new Error(problems.join("; "));

    history[key] = serialize(result);
    const keep = toDateKey(addDays(new Date(), -HISTORY_KEEP_DAYS));
    for (const oldKey of Object.keys(history)) if (oldKey < keep) delete history[oldKey];
    writeJson(HISTORY_FILE, history);
    return result;
}

// Giá hôm trước để tính tăng / giảm. Lỗi thì bỏ qua (thẻ chỉ không có mũi tên)
async function getPreviousDay(date) {
    try {
        return await getPhuQuyDay(addDays(startOfDay(date), -1));
    } catch (error) {
        console.error(`⚠️ Không lấy được giá vàng hôm trước: ${error.message}`);
        return null;
    }
}

// ----- API cho lệnh / scheduler -----

/**
 * Giá hôm nay: Phú Quý -> PNJ -> BTMC -> giá lưu gần nhất.
 * @param {object} [options]
 * @param {boolean} [options.refresh] - Bấm "Làm mới": bỏ cache nếu cache đã quá 60s
 * @returns {Promise<{
 *   result: object|null,     // { source, items, updatedAt, hasTime }
 *   previous: object|null,   // giá Phú Quý hôm trước (chỉ khi nguồn là Phú Quý)
 *   primaryError: string|null, // lý do Phú Quý lỗi (để báo root)
 *   failures: string[],      // lỗi của từng nguồn đã thử
 *   stale: boolean,          // true = mọi nguồn lỗi, đang hiện giá lưu gần nhất
 *   fetchedAt: Date|null,
 * }>}
 */
async function getTodayGoldPrices({ refresh = false } = {}) {
    const age = todayCache ? Date.now() - todayCache.fetchedAt : Infinity;
    if (age < (refresh ? MIN_REFRESH_MS : CACHE_TTL_MS)) return todayCache.report;

    if (!inFlight) inFlight = fetchTodayReport().finally(() => (inFlight = null));
    return inFlight;
}

async function fetchTodayReport() {
    const last = loadLast();
    const failures = [];
    let primaryError = null;
    let result = null;

    for (const [name, fetcher] of [["phuquy", fetchPhuQuy], ["pnj", fetchPnj], ["btmc", fetchBtmc]]) {
        try {
            const candidate = await fetcher();
            // Chỉ so với lần trước cùng nguồn: mỗi hãng giá nhẫn khác nhau
            const problems = validate(candidate, last?.source === name ? last : null);
            if (problems.length) throw new Error(problems.join("; "));
            result = candidate;
            break;
        } catch (error) {
            failures.push(`${SOURCES[name].label}: ${error.message}`);
            if (name === "phuquy") primaryError = error.message;
        }
    }

    let report;
    if (result) {
        writeJson(LAST_FILE, serialize(result));
        const previous = result.source === "phuquy" ? await getPreviousDay(result.updatedAt || new Date()) : null;
        report = { result, previous, primaryError, failures, stale: false, fetchedAt: new Date() };
    } else {
        console.error(`❌ Không lấy được giá vàng từ nguồn nào: ${failures.join(" | ")}`);
        report = { result: last, previous: null, primaryError, failures, stale: true, fetchedAt: new Date() };
    }

    // Lỗi hết thì chỉ cache 1 phút để lần gọi sau thử lại sớm
    todayCache = {
        report,
        fetchedAt: report.stale ? Date.now() - CACHE_TTL_MS + MIN_REFRESH_MS : Date.now(),
    };
    return report;
}

/**
 * Giá Phú Quý của 1 ngày đã qua (chỉ Phú Quý có lịch sử).
 * @returns {Promise<{ result, previous }>} - ném lỗi nếu không có dữ liệu
 */
async function getGoldPricesByDate(date) {
    const result = await getPhuQuyDay(date);
    return { result, previous: await getPreviousDay(date) };
}

// Kiểm tra riêng nguồn Phú Quý (health check buổi sáng). Trả về lỗi hoặc null
async function checkPhuQuy() {
    try {
        const problems = validate(await fetchPhuQuy());
        return problems.length ? problems.join("; ") : null;
    } catch (error) {
        return error.message;
    }
}

module.exports = {
    SOURCES,
    PHU_QUY_URL,
    getTodayGoldPrices,
    getGoldPricesByDate,
    checkPhuQuy,
    // Export để test
    parsePhuQuyHtml,
    validate,
    classify,
};
