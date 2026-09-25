const cron = require("node-cron");
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
const { loadRecipients, recipientsFromIds } = require("../utils/users");
const { notifyAdmin } = require("../utils/admin");
const { runStandupNotification } = require("./standup-notification");
const { runHook } = require("../modules");

// Nhắc đứng dậy gửi sau thẻ báo cơm 30 giây, để 2 tin không chen nhau
const STANDUP_DELAY_MS = 30 * 1000;

const POSTER_FILE_NAME = "com-trua.png";

// Người nhận tin cơm 12h
function loadUsersFromFile() {
    return loadRecipients((user) => user.enabled === true);
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

/**
 * Gửi thẻ báo cơm cho mọi người (hoặc danh sách chỉ định khi test).
 *
 * @param {object} client - Discord client
 * @param {object} deps
 * @param {Function} deps.resolveSheetName
 * @param {Function} deps.readSheetGrid - Đọc cả tab 1 lần: (sheetName) => { rows } | { error }
 * @param {object} options
 * @param {string[]|null} options.targetUserIds - Chỉ gửi cho các ID này (test)
 * @param {Date} options.date - Ngày cần báo (mặc định hôm nay; test có thể giả lập)
 * @param {string|null} options.deliverToId - Test: gửi thẻ về ID này thay vì chủ thẻ,
 *                                            và không DM báo lỗi cho chủ thẻ
 * @returns {object} { sent, skipped, failed, total, details, error, sentIds }
 *          sentIds = Discord ID của những người đã nhận thẻ báo cơm
 */
async function runDailyFoodNotification(
    client,
    { resolveSheetName, readSheetGrid },
    { targetUserIds = null, date = new Date(), deliverToId = null } = {}
) {
    const report = { sent: 0, skipped: 0, failed: 0, total: 0, details: [], error: null, sentIds: [] };
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
        if (!isTest) await notifyAdmin(client, "Thông báo món ăn ngày làm bù", `⚠️ ${report.error}`);
        return report;
    }

    // Dòng "Ngày mai" chỉ hiện khi ngày mai là ngày làm việc (T2-T5, hoặc thứ 6
    // khi thứ 7 được bật làm bù) VÀ sheet đã có cột ngày mai
    const tomorrow = addDays(date, 1);
    const tomorrowColumn = isWorkingDay(tomorrow) ? findDateColumn(rows, tomorrow) : -1;

    const recipients = isTest
        ? recipientsFromIds(targetUserIds)
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
            // Phần module chèn thêm (vd nhắc feedback). Hook lỗi thì trả [] nên
            // không làm mất tin báo cơm
            const extras = await runHook("lunchCardExtras", { user, date, test: isTest });
            const card = buildDailyMealCard({ ...meal, posterFileName: png ? POSTER_FILE_NAME : null, extras });
            const files = png ? [new AttachmentBuilder(png, { name: POSTER_FILE_NAME })] : [];

            const result = await sendCardToUser(client, deliverToId || user.discordId, card, { files });
            if (result.success) {
                report.sent++;
                report.sentIds.push(user.discordId);
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

// 12:00 ngày làm việc: thẻ báo cơm, rồi nhắc đứng dậy cho đúng những người đã
// nhận thẻ báo cơm (có đặt cơm hôm nay). Không ai nhận thẻ thì không nhắc
async function runLunchNotifications(client, deps) {
    let report;
    try {
        report = await runDailyFoodNotification(client, deps);
    } catch (error) {
        console.error(`❌ Lỗi khi gửi thông báo món ăn: ${error.message}`);
        return;
    }

    if (report.sentIds.length === 0) {
        console.log("⏭️ Không ai nhận thẻ báo cơm hôm nay, bỏ qua nhắc đứng dậy");
        return;
    }

    await new Promise((resolve) => setTimeout(resolve, STANDUP_DELAY_MS));
    try {
        await runStandupNotification(client, { onlyUserIds: report.sentIds });
    } catch (error) {
        console.error(`❌ Lỗi khi gửi thông báo đứng dậy: ${error.message}`);
    }
}

// Hàm khởi tạo scheduler
function startDailyFoodScheduler(client, deps) {
    // 00 12 * * * = 12:00 mỗi ngày (chỉ gửi vào ngày làm việc)
    cron.schedule("00 12 * * *", async () => {
        if (!isWorkingDay(new Date())) {
            console.log("⏭️ Hôm nay không phải ngày làm việc (T2-T6 hoặc ngày làm bù), bỏ qua báo cơm + đứng dậy");
            return;
        }
        await runLunchNotifications(client, deps);
    });
}

module.exports = {
    startDailyFoodScheduler,
    runDailyFoodNotification,
    runLunchNotifications,
    loadUsersFromFile,
};
