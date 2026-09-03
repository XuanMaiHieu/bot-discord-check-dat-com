const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

// Đọc danh sách users được bật thông báo món ăn
function loadUsersFromFile() {
    try {
        const usersFilePath = path.join(__dirname, "../data/users.json");
        const usersData = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));

        return usersData.users.filter(
            (user) => user.enabled === true && user.discordId !== null
        );
    } catch (error) {
        return [];
    }
}

function formatDateDDMM(d) {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}`;
}

// Lấy 5 ngày Thứ 2 -> Thứ 6 của tuần hiện tại, dạng DD/MM
function getWeekdayDatesOfCurrentWeek() {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(new Date().setDate(diff));

    const dates = [];
    for (let i = 0; i < 5; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(formatDateDDMM(d));
    }
    return dates;
}

function isEmptyValue(value) {
    const v = value?.toString().trim() || "";
    return (
        v === "" ||
        v === "0" ||
        v === "(trống)" ||
        v === "null" ||
        v === "undefined"
    );
}

// Kiểm tra 1 user có bỏ trống cả tuần (T2-T6) không
async function checkUserWeekEmpty(
    sheetName,
    userName,
    findNameInColumn,
    findDateInRow,
    getCellValue
) {
    const nameResult = await findNameInColumn(sheetName, userName);
    if (nameResult.error || !nameResult.row) {
        return {
            error: nameResult.error || `Không tìm thấy tên "${userName}"`,
        };
    }

    const weekDates = getWeekdayDatesOfCurrentWeek();
    let hasAnyColumn = false;

    for (const date of weekDates) {
        const dateResult = await findDateInRow(sheetName, date);
        if (dateResult.error) continue; // không có cột cho ngày này thì bỏ qua

        hasAnyColumn = true;

        const cellResult = await getCellValue(
            sheetName,
            dateResult.column,
            nameResult.row
        );
        if (cellResult.error) continue;

        if (!isEmptyValue(cellResult.value)) {
            return { allEmpty: false };
        }
    }

    // Không có cột ngày nào trong tuần được tìm thấy -> không đủ dữ liệu để kết luận
    if (!hasAnyColumn) {
        return { allEmpty: false, noColumns: true };
    }

    return { allEmpty: true, weekDates };
}

// Khởi tạo scheduler: 8h sáng Thứ 2 hàng tuần, nhắc user chưa đăng ký cơm cả tuần
function startWeeklyEmptyReminderScheduler(
    client,
    resolveSheetName,
    findNameInColumn,
    findDateInRow,
    getCellValue
) {
    const cronExpression = "0 8 * * 1"; // 8h00 Thứ 2 hàng tuần

    cron.schedule(cronExpression, async () => {
        const resolved = await resolveSheetName();
        if (resolved.error) {
            console.error(
                `❌ Không xác định được sheet để check tuần trống: ${resolved.error}`
            );
            return;
        }

        const enabledUsers = loadUsersFromFile();
        if (enabledUsers.length === 0) return;

        for (const user of enabledUsers) {
            try {
                const result = await checkUserWeekEmpty(
                    resolved.sheetName,
                    user.name,
                    findNameInColumn,
                    findDateInRow,
                    getCellValue
                );

                if (result.error || result.noColumns || !result.allEmpty) {
                    continue;
                }

                try {
                    const discordUser = await client.users.fetch(
                        user.discordId
                    );
                    const sheetLink = `https://docs.google.com/spreadsheets/d/${process.env.SHEET_ID}/edit?gid=${process.env.G_SHEET_ID}`;
                    await discordUser.send(
                        `🍽️ **Nhắc đặt cơm tuần này**\n\n` +
                            `Chào ${user.name}, mình thấy bạn chưa đăng ký cơm trưa cho cả tuần này (${result.weekDates[0]} - ${result.weekDates[4]
                            }).\n` +
                            `Vui lòng vào sheet đăng ký cơm trưa để điền món ăn nhé!\n` +
                            `🔗 ${sheetLink}`
                    );
                } catch (error) {
                    // Silent fail
                }

                await new Promise((resolve) => setTimeout(resolve, 1000));
            } catch (error) {
                // Silent fail per user
            }
        }
    });
}

module.exports = {
    startWeeklyEmptyReminderScheduler,
    getWeekdayDatesOfCurrentWeek,
    checkUserWeekEmpty,
};
