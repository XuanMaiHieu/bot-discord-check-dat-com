const cron = require("node-cron");
const { readCurrentSheet } = require("../utils/google-sheets");
const { findNameInRows, findDateColumn, getMealAt, isEmptyMeal } = require("../utils/meal-sheet");
const { loadRecipients } = require("../utils/users");
const { addDays, formatDayMonth, getWeekRange } = require("../utils/workdays");

// Người nhận nhắc đặt cơm thứ 2. Tắt riêng cho ai thì đặt
// "order_reminder": false (thiếu trường này thì vẫn nhắc)
function loadReminderUsers() {
    return loadRecipients((user) => user.enabled === true && user.order_reminder !== false);
}

// Thứ 2 -> Thứ 6 của tuần chứa `date`
function getWorkWeekDates(date = new Date()) {
    const { monday } = getWeekRange(date);
    return [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
}

/**
 * 1 user có bỏ trống cả tuần (T2-T6) không, tra trên bảng đã đọc sẵn.
 * @returns {{ allEmpty: boolean, noColumns?: boolean, error?: string }}
 */
function checkUserWeekEmpty(rows, userName, weekDates) {
    const found = findNameInRows(rows, userName);
    if (!found.row) return { allEmpty: false, error: found.error || `Có nhiều dòng khớp tên "${userName}"` };

    const columns = weekDates.map((date) => findDateColumn(rows, date)).filter((index) => index !== -1);
    // Sheet không có cột ngày nào của tuần này -> không đủ dữ liệu để kết luận
    if (columns.length === 0) return { allEmpty: false, noColumns: true };

    return { allEmpty: columns.every((index) => isEmptyMeal(getMealAt(rows, found.row, index))) };
}

// 8h sáng Thứ 2: DM nhắc những ai chưa đăng ký cơm ngày nào trong tuần
async function runWeeklyEmptyReminder(client) {
    const users = loadReminderUsers();
    if (users.length === 0) return;

    const sheet = await readCurrentSheet();
    if (sheet.error) {
        console.error(`❌ Không đọc được sheet để check tuần trống: ${sheet.error}`);
        return;
    }

    const weekDates = getWorkWeekDates();
    const range = `${formatDayMonth(weekDates[0])} - ${formatDayMonth(weekDates[4])}`;
    const sheetLink = `https://docs.google.com/spreadsheets/d/${process.env.SHEET_ID}/edit?gid=${process.env.G_SHEET_ID}`;
    let reminded = 0;

    for (const user of users) {
        const result = checkUserWeekEmpty(sheet.rows, user.name, weekDates);
        if (!result.allEmpty) continue;

        try {
            const discordUser = await client.users.fetch(user.discordId);
            await discordUser.send(
                `🍽️ **Nhắc đặt cơm tuần này**\n\n` +
                    `Chào ${user.name}, mình thấy bạn chưa đăng ký cơm trưa cho cả tuần này (${range}).\n` +
                    `Vui lòng vào sheet đăng ký cơm trưa để điền món ăn nhé!\n` +
                    `🔗 ${sheetLink}`
            );
            reminded++;
        } catch (error) {
            console.error(`❌ Không gửi được nhắc đặt cơm cho ${user.name}: ${error.message}`);
        }

        // Delay 1 giây tránh rate limit
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(`⏰ Nhắc đặt cơm tuần ${range}: đã nhắc ${reminded}/${users.length} người`);
}

function startWeeklyEmptyReminderScheduler(client) {
    // 8h00 Thứ 2 hàng tuần
    cron.schedule("0 8 * * 1", async () => {
        try {
            await runWeeklyEmptyReminder(client);
        } catch (error) {
            console.error(`❌ Lỗi khi nhắc đặt cơm thứ 2: ${error.message}`);
        }
    });
}

module.exports = {
    startWeeklyEmptyReminderScheduler,
    runWeeklyEmptyReminder,
    checkUserWeekEmpty,
    getWorkWeekDates,
};
