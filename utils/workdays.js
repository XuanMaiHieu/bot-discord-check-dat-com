const fs = require("fs");
const path = require("path");

// Ngày làm bù (thứ 7 / chủ nhật được bật thông báo như ngày làm việc).
// data/ nằm trong .gitignore nên git pull không ghi đè file này.
const MAKEUP_DAYS_FILE = path.join(__dirname, "../data/makeup-days.json");

const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WEEKDAY_LONG = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

// Màu viền thẻ theo thứ trong tuần
const WEEKDAY_COLORS = [
    0x94a3b8, // CN - xám
    0x3b82f6, // T2 - xanh dương
    0x22c55e, // T3 - xanh lá
    0xeab308, // T4 - vàng
    0xf97316, // T5 - cam
    0xec4899, // T6 - hồng
    0x8b5cf6, // T7 - tím (ngày làm bù)
];

function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// Khóa ngày dạng YYYY-MM-DD theo giờ máy (TZ=Asia/Ho_Chi_Minh), dùng để lưu file
function toDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

// DD/MM như trên dòng ngày của sheet
function formatDayMonth(date) {
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    return `${d}/${m}`;
}

// "T5 17/09"
function formatShortDay(date) {
    return `${WEEKDAY_SHORT[date.getDay()]} ${formatDayMonth(date)}`;
}

// "Thứ 5, 17/09"
function formatLongDay(date) {
    return `${WEEKDAY_LONG[date.getDay()]}, ${formatDayMonth(date)}`;
}

function getWeekdayColor(date) {
    return WEEKDAY_COLORS[date.getDay()];
}

/**
 * Chuyển "DD/MM" thành Date. Sheet không ghi năm nên chọn năm gần `reference`
 * nhất (vd tháng 12 tra "05/01" sẽ hiểu là tháng 1 năm sau).
 * Trả về null nếu không đúng định dạng / không phải ngày hợp lệ.
 */
function parseDayMonth(text, reference = new Date()) {
    const match = String(text ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})$/);
    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]);
    const ref = startOfDay(reference);

    let best = null;
    for (const year of [ref.getFullYear() - 1, ref.getFullYear(), ref.getFullYear() + 1]) {
        const date = new Date(year, month - 1, day);
        // Loại ngày không tồn tại (vd 31/02 bị JS tự đẩy sang tháng 3)
        if (date.getMonth() !== month - 1 || date.getDate() !== day) continue;
        if (!best || Math.abs(date - ref) < Math.abs(best - ref)) best = date;
    }
    return best;
}

function isWeekend(date) {
    return date.getDay() === 0 || date.getDay() === 6;
}

function loadMakeupDays() {
    try {
        const data = JSON.parse(fs.readFileSync(MAKEUP_DAYS_FILE, "utf8"));
        return Array.isArray(data) ? data.filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)) : [];
    } catch (error) {
        return []; // chưa có file = chưa có ngày làm bù nào
    }
}

function saveMakeupDays(keys) {
    // Bỏ các ngày đã qua hơn 30 ngày cho file khỏi phình
    const cutoff = toDateKey(addDays(new Date(), -30));
    const cleaned = [...new Set(keys)].filter((k) => k >= cutoff).sort();

    const tmpFile = `${MAKEUP_DAYS_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(cleaned, null, 2), "utf8");
    fs.renameSync(tmpFile, MAKEUP_DAYS_FILE);
    return cleaned;
}

function isMakeupDay(date) {
    return loadMakeupDays().includes(toDateKey(date));
}

function addMakeupDay(date) {
    return saveMakeupDays([...loadMakeupDays(), toDateKey(date)]);
}

function removeMakeupDay(date) {
    const key = toDateKey(date);
    return saveMakeupDays(loadMakeupDays().filter((k) => k !== key));
}

// Ngày làm việc = T2-T6, hoặc thứ 7 / CN đã được admin bật làm bù
function isWorkingDay(date = new Date()) {
    return !isWeekend(date) || isMakeupDay(date);
}

// Thứ 7 gần nhất tính từ `date` (chính nó nếu hôm nay là thứ 7)
// Thứ 2 và Chủ nhật của tuần chứa `date` (tuần tính từ thứ 2)
function getWeekRange(date = new Date()) {
    const monday = addDays(startOfDay(date), -((date.getDay() + 6) % 7));
    return { monday, sunday: addDays(monday, 6) };
}

function getUpcomingSaturday(date = new Date()) {
    return addDays(date, (6 - date.getDay() + 7) % 7);
}

module.exports = {
    getWeekRange,
    MAKEUP_DAYS_FILE,
    WEEKDAY_SHORT,
    WEEKDAY_LONG,
    startOfDay,
    addDays,
    toDateKey,
    formatDayMonth,
    formatShortDay,
    formatLongDay,
    getWeekdayColor,
    parseDayMonth,
    isWeekend,
    loadMakeupDays,
    isMakeupDay,
    addMakeupDay,
    removeMakeupDay,
    isWorkingDay,
    getUpcomingSaturday,
};
