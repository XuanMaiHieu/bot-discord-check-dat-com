/**
 * Giá bán lẻ xăng dầu Petrolimex, lấy từ API JSON mà chính web petrolimex.com.vn
 * dùng cho bảng "Giá bán lẻ xăng dầu" (không cần key). Đơn vị đồng/lít.
 *
 * Giá chỉ đổi theo kỳ điều hành (thường chiều thứ 5). Mỗi kỳ lưu vào
 * data/fuel-price-history.json để tính ▲▼ so với kỳ trước:
 *   { current: Period, previous: Period | null, notifiedPeriod }
 *   Period = { period, products: [{ id, title, zone1, zone2 }] }
 *   period = giờ cập nhật mới nhất (ISO) của kỳ đó
 *
 * Petrolimex sửa giá từng mặt hàng, cách nhau vài phút. Chỉ chốt 1 kỳ mới khi
 * lần sửa cuối đã qua SETTLE_MS, để không chốt nhầm lúc mới sửa được một nửa.
 */
const fs = require("fs");
const path = require("path");

const API_URL = "https://portals.petrolimex.com.vn/~apis/portals/cms.item/search";
const SITE = "petrolimex.com.vn";

// Bộ lọc của bảng giá trên web Petrolimex (lấy từ _themes/sunrise/js/all.js)
const PRICE_QUERY = {
    FilterBy: {
        And: [
            { SystemID: { Equals: "6783dc1271ff449e95b74a9520964169" } },
            { RepositoryID: { Equals: "a95451e23b474fe5886bfb7cf843f53c" } },
            { RepositoryEntityID: { Equals: "3801378fe1e045b1afa10de7c5776124" } },
            { Status: { Equals: "Published" } },
        ],
    },
    SortBy: { LastModified: "Descending" },
    Pagination: { TotalRecords: -1, TotalPages: 0, PageSize: 0, PageNumber: 0 },
};

const FETCH_TIMEOUT_MS = 8 * 1000;
const CACHE_TTL_MS = 30 * 60 * 1000;
const SETTLE_MS = 20 * 60 * 1000;

// Khoảng giá hợp lý (đồng/lít). Ngoài khoảng này coi như API trả sai
const MIN_PRICE = 5_000;
const MAX_PRICE = 100_000;
const MIN_PRODUCTS = 3;

// data/ nằm trong .gitignore nên git pull không ghi đè
const HISTORY_FILE = path.join(__dirname, "../data/fuel-price-history.json");

let cache = null; // { report, fetchedAt }
let inFlight = null; // nhiều người gọi cùng lúc thì dùng chung 1 lần gọi API

function readHistory() {
    try {
        return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    } catch (error) {
        return { current: null, previous: null, notifiedPeriod: null };
    }
}

function writeHistory(history) {
    try {
        fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
        const tmpFile = `${HISTORY_FILE}.tmp`;
        fs.writeFileSync(tmpFile, JSON.stringify(history, null, 2), "utf8");
        fs.renameSync(tmpFile, HISTORY_FILE);
    } catch (error) {
        console.error(`❌ Không lưu được lịch sử giá xăng: ${error.message}`);
    }
}

async function fetchFromApi() {
    const url = `${API_URL}?x-request=${Buffer.from(JSON.stringify(PRICE_QUERY)).toString("base64url")}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { "user-agent": "Mozilla/5.0 (bot-check-dat-com; gia xang cho nhom noi bo)" },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        if (error.name === "AbortError") throw new Error(`quá ${FETCH_TIMEOUT_MS / 1000}s không phản hồi`);
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

// JSON của API -> { products, updatedAt }; ném lỗi nếu dữ liệu không hợp lệ
function parseApi(data) {
    const products = (data?.Objects || [])
        .map((item) => ({
            id: String(item.ID || item.Title),
            title: String(item.Title || "").trim(),
            zone1: Number(item.Zone1Price),
            zone2: Number(item.Zone2Price),
            order: Number(item.DIsplayOrder ?? item.OrderIndex ?? 0),
            modifiedAt: new Date(item.LastModified),
        }))
        .filter((p) => p.title)
        .sort((a, b) => a.order - b.order);

    const invalid = products.filter(
        (p) => ![p.zone1, p.zone2].every((v) => Number.isFinite(v) && v >= MIN_PRICE && v <= MAX_PRICE)
    );
    if (products.length < MIN_PRODUCTS) throw new Error(`API chỉ trả ${products.length} mặt hàng`);
    if (invalid.length) throw new Error(`giá không hợp lệ: ${invalid.map((p) => `${p.title} ${p.zone1}/${p.zone2}`).join(", ")}`);

    const updatedAt = new Date(Math.max(...products.map((p) => p.modifiedAt.getTime())));
    return { products, updatedAt };
}

const samePrice = (a, b) => Boolean(a && b) && a.zone1 === b.zone1 && a.zone2 === b.zone2;
const findProduct = (period, product) => period?.products.find((p) => p.id === product.id || p.title === product.title);

function toPeriod({ products, updatedAt }) {
    return {
        period: updatedAt.toISOString(),
        products: products.map(({ id, title, zone1, zone2 }) => ({ id, title, zone1, zone2 })),
    };
}

/**
 * Chốt kỳ mới vào lịch sử nếu giá khác kỳ đang lưu và Petrolimex đã sửa xong.
 * Lần đầu chạy (chưa có lịch sử) chỉ lưu làm mốc, không tính là "giá vừa đổi".
 */
function commitPeriod(fresh, now = new Date()) {
    const history = readHistory();
    if (!history.current) {
        const current = toPeriod(fresh);
        writeHistory({ current, previous: null, notifiedPeriod: current.period });
        return;
    }

    const changed = fresh.products.some((p) => !samePrice(p, findProduct(history.current, p)));
    const settled = now - fresh.updatedAt >= SETTLE_MS;
    if (!changed || !settled) return;

    writeHistory({ ...history, previous: history.current, current: toPeriod(fresh) });
}

/**
 * Giá kèm chênh lệch. Mặt hàng chưa đổi so với kỳ đã chốt thì so với kỳ trước
 * đó; đã đổi (kỳ mới chưa chốt) thì so với kỳ đã chốt.
 */
function buildReport(fresh, { stale = false, error = null } = {}) {
    const history = readHistory();
    let comparedTo = null;
    const products = fresh.products.map((p) => {
        const committed = findProduct(history.current, p);
        const base = samePrice(p, committed) ? findProduct(history.previous, p) : committed;
        if (base) comparedTo = samePrice(p, committed) ? history.previous.period : history.current.period;
        return {
            ...p,
            change1: base ? p.zone1 - base.zone1 : null,
            change2: base ? p.zone2 - base.zone2 : null,
        };
    });
    return {
        products,
        updatedAt: fresh.updatedAt,
        comparedTo: comparedTo ? new Date(comparedTo) : null,
        stale,
        error,
    };
}

// Kỳ đã chốt gần nhất, dùng khi API lỗi
function lastSaved() {
    const { current } = readHistory();
    if (!current) return null;
    return { products: current.products, updatedAt: new Date(current.period) };
}

async function load() {
    try {
        const fresh = parseApi(await fetchFromApi());
        commitPeriod(fresh);
        return buildReport(fresh);
    } catch (error) {
        console.error(`❌ Không lấy được giá xăng Petrolimex: ${error.message}`);
        const saved = lastSaved();
        if (!saved) return { products: [], updatedAt: null, comparedTo: null, stale: true, error: error.message };
        return buildReport(saved, { stale: true, error: error.message });
    }
}

/**
 * @param {object} [options]
 * @param {boolean} [options.refresh] - bỏ qua cache (scheduler)
 * @returns {Promise<{ products, updatedAt, comparedTo, stale, error }>}
 *          products: [{ id, title, zone1, zone2, change1, change2 }]
 *          products rỗng = API lỗi và chưa từng lưu được giá
 */
async function getFuelPrices({ refresh = false } = {}) {
    if (!refresh && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.report;
    if (!inFlight) {
        inFlight = load()
            .then((report) => {
                if (!report.stale) cache = { report, fetchedAt: Date.now() };
                return report;
            })
            .finally(() => {
                inFlight = null;
            });
    }
    return inFlight;
}

/**
 * Kỳ giá mới đã chốt mà chưa báo cho ai. Đánh dấu đã báo luôn, để 2 lần kiểm
 * tra liên tiếp không báo trùng.
 * @returns {boolean}
 */
function takeUnnotifiedPeriod() {
    const history = readHistory();
    if (!history.current || !history.previous || history.notifiedPeriod === history.current.period) return false;
    writeHistory({ ...history, notifiedPeriod: history.current.period });
    return true;
}

module.exports = {
    SITE,
    getFuelPrices,
    takeUnnotifiedPeriod,
    // test
    parseApi,
    commitPeriod,
    buildReport,
    HISTORY_FILE,
    SETTLE_MS,
};
