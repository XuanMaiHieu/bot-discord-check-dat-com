const cron = require("node-cron");
const { inspectSheet } = require("../utils/sheet-health");
const { notifyAdmin } = require("../utils/admin");

function sheetLine(result) {
    return result.sheetName ? `Sheet: "${result.sheetName}"\n` : "";
}

// 8h sáng hằng ngày: đọc được sheet và tìm thấy dòng của root
async function runDailyCheck(client) {
    const title = "Cảnh báo kết nối Google Sheet";
    try {
        const result = await inspectSheet();
        if (result.error) {
            await notifyAdmin(client, title, `❌ Không đọc được sheet để kiểm tra:\n${sheetLine(result)}${result.error}`);
        } else if (result.adminRow.error) {
            await notifyAdmin(
                client,
                title,
                `❌ Kiểm tra kết nối Google Sheet thất bại lúc ${new Date().toLocaleString("vi-VN")}\n` +
                    `${sheetLine(result)}Lỗi: ${result.adminRow.error}`
            );
        }
    } catch (error) {
        await notifyAdmin(client, title, `❌ Lỗi không xác định khi kiểm tra Google Sheet:\n${error.message}`);
    }
}

// 8h sáng ngày 1 hằng tháng: sheet đã có đúng ngày hôm nay (đã sang tab tháng mới)
// và vẫn tìm thấy dòng của root
async function runMonthlyCheck(client) {
    const title = "Cảnh báo kiểm tra sheet đầu tháng";
    try {
        const result = await inspectSheet();
        if (result.error) {
            await notifyAdmin(
                client,
                title,
                `❌ Không đọc được sheet để kiểm tra đầu tháng:\n${sheetLine(result)}${result.error}`
            );
            return;
        }
        const problem = result.todayColumn.error || result.adminRow.error;
        if (problem) {
            await notifyAdmin(
                client,
                title,
                `❌ Kiểm tra sheet đầu tháng thất bại lúc ${new Date().toLocaleString("vi-VN")}\n` +
                    `${sheetLine(result)}Lỗi: ${problem}`
            );
        }
    } catch (error) {
        await notifyAdmin(client, title, `❌ Lỗi không xác định khi kiểm tra sheet đầu tháng:\n${error.message}`);
    }
}

function startSheetHealthCheckScheduler(client) {
    cron.schedule("0 8 * * *", () => runDailyCheck(client)); // 8h00 hằng ngày
    cron.schedule("0 8 1 * *", () => runMonthlyCheck(client)); // 8h00 ngày 1 hằng tháng
}

module.exports = { startSheetHealthCheckScheduler };
