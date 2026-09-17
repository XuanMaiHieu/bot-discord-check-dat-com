const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const {
    addDays,
    formatDayMonth,
    isWeekend,
    isWorkingDay,
} = require("../utils/workdays");
const {
    findNameInRows,
    findDateColumn,
    getMealAt,
    isEmptyMeal,
} = require("../utils/meal-sheet");
const { AttachmentBuilder } = require("discord.js");
const { buildDailyMealCard } = require("../utils/meal-card");
const { sendCardToUser } = require("../utils/card-message");
const { renderPostersInChildProcess } = require("../utils/poster-renderer");

const POSTER_FILE_NAME = "com-trua.png";

// Hàm đọc danh sách users từ file JSON
function loadUsersFromFile() {
    try {
        const usersFilePath = path.join(__dirname, "../data/users.json");
        const usersData = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));

        // Lọc ra các user có enabled: true và có discordId
        return usersData.users.filter(
            (user) => user.enabled === true && user.discordId !== null
        );
    } catch (error) {
        return [];
    }
}

// Tìm user trong users.json theo Discord ID (kể cả user đang tắt, dùng khi test)
function findUserById(discordId) {
    try {
        const usersFilePath = path.join(__dirname, "../data/users.json");
        const usersData = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));
        return usersData.users.find((u) => u.discordId === discordId) || null;
    } catch (error) {
        return null;
    }
}

// Báo lỗi dạng chữ cho user (giữ như trước khi đổi sang thẻ)
async function sendErrorToUser(client, discordId, message) {
    try {
        const discordUser = await client.users.fetch(discordId);
        await discordUser.send(
            `⚠️ **Thông báo món ăn hôm nay**\n\n` +
            `❌ Không thể lấy thông tin món ăn:\n${message}\n\n` +
            `_Thời gian: ${new Date().toLocaleString("vi-VN")}_`
        );
    } catch (error) {
        // Silent fail
    }
}

async function notifyAdmin(client, adminDiscordId, message) {
    if (!adminDiscordId) return;
    try {
        const admin = await client.users.fetch(adminDiscordId);
        await admin.send(message);
    } catch (error) {
        console.error(`❌ Không gửi được cảnh báo cho admin: ${error.message}`);
    }
}

/**
 * Gửi thẻ báo cơm cho mọi người (hoặc danh sách chỉ định khi test).
 *
 * @param {object} client - Discord client
 * @param {object} deps
 * @param {Function} deps.resolveSheetName
 * @param {Function} deps.readSheetGrid - Đọc cả tab 1 lần: (sheetName) => { rows } | { error }
 * @param {string} deps.adminDiscordId
 * @param {object} options
 * @param {string[]|null} options.targetUserIds - Chỉ gửi cho các ID này (test)
 * @param {Date} options.date - Ngày cần báo (mặc định hôm nay; test có thể giả lập)
 * @param {string|null} options.deliverToId - Test: gửi thẻ về ID này thay vì chủ thẻ,
 *                                            và không DM báo lỗi cho chủ thẻ
 * @returns {object} { sent, skipped, failed, total, details, error }
 */
async function runDailyFoodNotification(
    client,
    { resolveSheetName, readSheetGrid, adminDiscordId },
    { targetUserIds = null, date = new Date(), deliverToId = null } = {}
) {
    const report = { sent: 0, skipped: 0, failed: 0, total: 0, details: [], error: null };
    const isTest = Boolean(targetUserIds);

    const resolvedSheet = await resolveSheetName();
    if (resolvedSheet.error) {
        report.error = `Không xác định được sheet: ${resolvedSheet.error}`;
        console.error(`❌ ${report.error}`);
        return report;
    }
    const sheetName = resolvedSheet.sheetName;

    const grid = await readSheetGrid(sheetName);
    if (grid.error) {
        report.error = `Không đọc được sheet "${sheetName}": ${grid.error}`;
        console.error(`❌ ${report.error}`);
        return report;
    }
    const rows = grid.rows;

    const todayColumn = findDateColumn(rows, date);

    // Ngày làm bù (thứ 7 / CN) mà HR chưa thêm cột vào sheet: chỉ báo admin,
    // không DM lỗi hàng loạt cho mọi người
    if (todayColumn === -1 && isWeekend(date)) {
        report.error =
            `Hôm nay (${formatDayMonth(date)}) được bật làm bù nhưng sheet "${sheetName}" ` +
            `chưa có cột ngày này, nên bỏ qua thông báo món ăn.`;
        console.error(`❌ ${report.error}`);
        if (!isTest) await notifyAdmin(client, adminDiscordId, `⚠️ ${report.error}`);
        return report;
    }

    // Dòng "Ngày mai" chỉ hiện khi ngày mai là ngày làm việc (T2-T5, hoặc thứ 6
    // khi thứ 7 được bật làm bù) VÀ sheet đã có cột ngày mai
    const tomorrow = addDays(date, 1);
    const tomorrowColumn = isWorkingDay(tomorrow) ? findDateColumn(rows, tomorrow) : -1;

    const recipients = isTest
        ? targetUserIds.map((id) => findUserById(id) || { discordId: id, name: null })
        : loadUsersFromFile();
    report.total = recipients.length;

    // Bước 1: tra món của từng người, bỏ qua / báo lỗi những người không gửi được
    const deliveries = [];
    for (const user of recipients) {
        const label = user.name || user.discordId;

        if (!user.name) {
            report.failed++;
            report.details.push(`❌ ${label}: chưa có trong data/users.json`);
            continue;
        }

        const nameResult = findNameInRows(rows, user.name);
        if (!nameResult.row) {
            report.failed++;
            report.details.push(`❌ ${label}: không tìm thấy tên trong sheet`);
            if (!isTest) await sendErrorToUser(client, user.discordId, `Không tìm thấy tên "${user.name}" trong sheet`);
            continue;
        }

        if (todayColumn === -1) {
            report.failed++;
            report.details.push(`❌ ${label}: sheet chưa có ngày ${formatDayMonth(date)}`);
            if (!isTest) await sendErrorToUser(client, user.discordId, `Không tìm thấy ngày "${formatDayMonth(date)}" trong sheet`);
            continue;
        }

        const food = getMealAt(rows, nameResult.row, todayColumn);

        // Không đặt cơm hôm nay thì không gửi
        if (isEmptyMeal(food)) {
            report.skipped++;
            report.details.push(`⏭️ ${label}: không đặt cơm`);
            continue;
        }

        deliveries.push({
            user,
            label,
            meal: {
                name: nameResult.name || user.name,
                date,
                food,
                tomorrow:
                    tomorrowColumn === -1
                        ? null
                        : { date: tomorrow, value: getMealAt(rows, nameResult.row, tomorrowColumn) },
            },
        });
    }

    // Bước 2: vẽ poster cho tất cả trong 1 tiến trình con. Lỗi thì dùng thẻ chữ,
    // không để lỗi vẽ ảnh làm mất tin báo cơm
    let posters = [];
    try {
        posters = await renderPostersInChildProcess(
            deliveries.map(({ meal }) => ({
                dish: meal.food,
                name: meal.name,
                date: meal.date,
                tomorrow: meal.tomorrow,
            }))
        );
    } catch (error) {
        console.error(`❌ Không vẽ được poster báo cơm, dùng thẻ chữ: ${error.message}`);
    }

    // Bước 3: gửi
    for (const [index, { user, label, meal }] of deliveries.entries()) {
        try {
            const png = posters[index];
            const card = buildDailyMealCard({ ...meal, posterFileName: png ? POSTER_FILE_NAME : null });
            const files = png ? [new AttachmentBuilder(png, { name: POSTER_FILE_NAME })] : [];

            const result = await sendCardToUser(client, deliverToId || user.discordId, card, { files });
            if (result.success) {
                report.sent++;
                report.details.push(`✅ ${label}${png ? "" : " (thẻ chữ)"}`);
            } else {
                report.failed++;
                report.details.push(`❌ ${label}: ${result.error}`);
            }

            // Delay nhỏ giữa các lần gửi để tránh rate limit
            await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
            report.failed++;
            report.details.push(`❌ ${label}: ${error.message}`);
        }
    }

    console.log(
        `🍽️ Thông báo món ăn ${formatDayMonth(date)}: gửi ${report.sent}, ` +
        `bỏ qua ${report.skipped}, lỗi ${report.failed} / ${report.total}`
    );
    return report;
}

// Hàm khởi tạo scheduler
function startDailyFoodScheduler(client, deps) {
    // 00 12 * * * = 12:00 mỗi ngày (chỉ gửi vào ngày làm việc)
    const cronExpression = "00 12 * * *";

    cron.schedule(cronExpression, async () => {
        if (!isWorkingDay(new Date())) {
            console.log(
                "⏭️ Hôm nay không phải ngày làm việc (T2-T6 hoặc ngày làm bù), bỏ qua gửi thông báo"
            );
            return;
        }

        try {
            await runDailyFoodNotification(client, deps);
        } catch (error) {
            console.error(`❌ Lỗi khi gửi thông báo món ăn: ${error.message}`);
        }
    });
}

module.exports = {
    startDailyFoodScheduler,
    runDailyFoodNotification,
    loadUsersFromFile,
};
