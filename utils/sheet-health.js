/**
 * Kiểm tra sheet đăng ký cơm còn dùng được không (health check 8h sáng,
 * kiểm tra đầu tháng, /configsheet, /testsheetcheck). Đọc sheet 1 lần cho mọi kiểm tra.
 */
const { ADMIN_SHEET_NAME } = require("../config");
const { readCurrentSheet } = require("./google-sheets");
const { findNameInRows, findDateColumn } = require("./meal-sheet");
const { formatDayMonth } = require("./workdays");

// Tìm dòng của root trong cột C
function checkAdminRow(rows) {
    const found = findNameInRows(rows, ADMIN_SHEET_NAME);
    if (found.row) return { row: found.row };
    if (found.matches) return { error: `Có nhiều dòng khớp tên "${ADMIN_SHEET_NAME}" trong sheet` };
    return { error: `Không tìm thấy "${ADMIN_SHEET_NAME}" trong sheet` };
}

// Dòng 4 phải có đúng ngày hôm nay: đây chính là điều kiện /abcom và tin báo cơm
// dùng để tra cột. Dòng 4 là lịch theo tuần nên không thể chỉ so tháng của ngày
// đầu tiên (tuần có thể bắt đầu từ tháng trước)
function checkTodayColumn(rows, today = new Date()) {
    const label = formatDayMonth(today);
    if (findDateColumn(rows, today) !== -1) return { today: label };

    const hasAnyDate = (rows[3] || []).some((cell) => cell && cell.toString().trim());
    if (!hasAnyDate) return { error: "Không tìm thấy ngày nào trong dòng 4 của sheet" };
    return {
        error:
            `Không tìm thấy ngày hôm nay (${label}) trong dòng 4 của sheet. ` +
            `Có thể sheet chưa được cập nhật cho tháng/tuần mới, kiểm tra lại G_SHEET_ID.`,
    };
}

/**
 * Đọc sheet đang dùng rồi chạy các kiểm tra.
 * @returns {Promise<
 *   { error: string, sheetName?: string } |                     // không đọc được sheet
 *   { sheetName: string, adminRow: {row}|{error}, todayColumn: {today}|{error} }
 * >}
 */
async function inspectSheet() {
    const sheet = await readCurrentSheet();
    if (sheet.error) return sheet;
    return {
        sheetName: sheet.sheetName,
        adminRow: checkAdminRow(sheet.rows),
        todayColumn: checkTodayColumn(sheet.rows),
    };
}

// Báo cáo dạng chữ cho /testsheetcheck
async function buildManualCheckReport() {
    const result = await inspectSheet();
    if (result.error) {
        return result.sheetName
            ? `❌ Không đọc được sheet "${result.sheetName}":\n${result.error}`
            : `❌ Không xác định được sheet:\n${result.error}`;
    }

    const { sheetName, adminRow, todayColumn } = result;
    return (
        `🧪 **Kết quả test kiểm tra sheet**\n` +
        `Sheet đang dùng: "${sheetName}" (từ G_SHEET_ID)\n\n` +
        (adminRow.error
            ? `❌ Kiểm tra kết nối / dòng admin: ${adminRow.error}\n`
            : `✅ Kiểm tra kết nối / dòng admin: OK (dòng ${adminRow.row})\n`) +
        (todayColumn.error
            ? `❌ Kiểm tra ngày hôm nay trong sheet: ${todayColumn.error}`
            : `✅ Kiểm tra ngày hôm nay trong sheet: OK (${todayColumn.today})`)
    );
}

module.exports = {
    inspectSheet,
    buildManualCheckReport,
    checkAdminRow,
    checkTodayColumn,
};
