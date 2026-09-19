/**
 * Tra cứu dữ liệu cơm trên bảng đã đọc sẵn (mảng 2 chiều từ Google Sheets).
 * Đọc cả bảng 1 lần rồi tra trong bộ nhớ, thay vì gọi API cho từng người -
 * Google Sheets giới hạn 60 lần đọc/phút.
 *
 * Bố cục sheet: cột C = họ tên, 1 dòng tiêu đề chứa ngày (DD/MM), các tuần cách nhau
 * bởi 1 cột trống, ô món ăn để trống hoặc "0" nghĩa là không đặt.
 */
const { parseDayMonth, startOfDay } = require("./workdays");

const NAME_COLUMN_INDEX = 2; // cột C
// HR hay chèn / xóa dòng ở phần tiêu đề nên không cố định dòng ngày,
// mà tìm trong vài dòng đầu dòng có nhiều ô DD/MM nhất
const DATE_ROW_SCAN_LIMIT = 10;

// Chuẩn hóa tên (bỏ dấu, lowercase, trim)
function normalizeName(name) {
    if (!name) return "";
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "d")
        .trim();
}

/**
 * Tìm tên trong cột C:
 * ưu tiên khớp chính xác, sau đó khớp một phần.
 * Trả về { row, name } | { matches: [{ row, name }] } | { error }
 * (row đánh số từ 1 như trên sheet)
 */
function findNameInRows(rows, searchQuery) {
    const normalizedQuery = normalizeName(searchQuery);
    const exactMatches = [];
    const partialMatches = [];

    rows.forEach((row, i) => {
        const cellValue = (row?.[NAME_COLUMN_INDEX] ?? "").toString().trim();
        if (!cellValue) return;

        const normalizedCell = normalizeName(cellValue);
        if (normalizedCell === normalizedQuery) {
            exactMatches.push({ row: i + 1, name: cellValue });
        } else if (
            normalizedCell.includes(normalizedQuery) ||
            normalizedQuery.includes(normalizedCell)
        ) {
            partialMatches.push({ row: i + 1, name: cellValue });
        }
    });

    for (const found of [exactMatches, partialMatches]) {
        if (found.length === 1) return found[0];
        if (found.length > 1) return { matches: found };
    }

    return { error: `Không tìm thấy tên phù hợp với "${searchQuery}" trong cột C` };
}

// Chỉ số (từ 0) của dòng chứa ngày, -1 nếu không tìm thấy
function findDateRowIndex(rows) {
    let bestIndex = -1;
    let bestCount = 0;
    rows.slice(0, DATE_ROW_SCAN_LIMIT).forEach((row, i) => {
        const count = (row || []).filter((text) => parseDayMonth(text)).length;
        if (count > bestCount) {
            bestIndex = i;
            bestCount = count;
        }
    });
    return bestIndex;
}

// Các cột có ngày hợp lệ ở dòng ngày, theo thứ tự trên sheet
function getDateColumns(rows, reference = new Date()) {
    const header = rows[findDateRowIndex(rows)] || [];
    const columns = [];
    header.forEach((text, columnIndex) => {
        const date = parseDayMonth(text, reference);
        if (date) columns.push({ columnIndex, date, label: text.toString().trim() });
    });
    return columns;
}

// Chỉ số cột của 1 ngày, -1 nếu sheet chưa có ngày đó
function findDateColumn(rows, date) {
    const target = startOfDay(date).getTime();
    const found = getDateColumns(rows, date).find((c) => c.date.getTime() === target);
    return found ? found.columnIndex : -1;
}

function getMealAt(rows, rowNumber, columnIndex) {
    return (rows[rowNumber - 1]?.[columnIndex] ?? "").toString().trim();
}

// Ô trống / "0" = không đặt cơm
function isEmptyMeal(value) {
    const text = (value ?? "").toString().trim().toLowerCase();
    return ["", "0", "(trống)", "null", "undefined"].includes(text);
}

/**
 * Các bữa từ `fromDate` trở đi (bỏ qua cột trống ngăn tuần).
 * Trả về [{ date, value, columnIndex }] tối đa `count` phần tử.
 */
function getUpcomingMeals(rows, rowNumber, fromDate = new Date(), count = 5) {
    const from = startOfDay(fromDate).getTime();
    return getDateColumns(rows, fromDate)
        .filter((c) => c.date.getTime() >= from)
        .slice(0, count)
        .map((c) => ({
            date: c.date,
            value: getMealAt(rows, rowNumber, c.columnIndex),
            columnIndex: c.columnIndex,
        }));
}

// Các bữa gần nhất trên sheet (dùng khi sheet không còn ngày nào từ hôm nay trở đi,
// vd đầu tháng mà chưa đổi sang tab tháng mới)
function getLatestMeals(rows, rowNumber, reference = new Date(), count = 5) {
    return getDateColumns(rows, reference)
        .slice(-count)
        .map((c) => ({
            date: c.date,
            value: getMealAt(rows, rowNumber, c.columnIndex),
            columnIndex: c.columnIndex,
        }));
}

// A, B, ..., Z, AA, AB...
function columnLetter(index) {
    let n = index;
    let result = "";
    while (n >= 0) {
        result = String.fromCharCode(65 + (n % 26)) + result;
        n = Math.floor(n / 26) - 1;
    }
    return result;
}

module.exports = {
    normalizeName,
    findNameInRows,
    findDateRowIndex,
    getDateColumns,
    findDateColumn,
    getMealAt,
    isEmptyMeal,
    getUpcomingMeals,
    getLatestMeals,
    columnLetter,
};
