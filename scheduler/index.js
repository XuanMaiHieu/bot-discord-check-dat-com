const { startDailyFoodScheduler } = require("./daily-food-notification");
const { startFootballScheduler } = require("./football-notification");
const { startGoldHealthCheckScheduler } = require("./gold-health-check");
const { startSheetHealthCheckScheduler } = require("./sheet-health-check");
const { startWeeklyEmptyReminderScheduler } = require("./weekly-empty-reminder");

/**
 * Bật mọi lịch chạy tự động (giờ theo TZ, xem ecosystem.config.js):
 *   08:00 hằng ngày      kiểm tra kết nối sheet (+ ngày 1: kiểm tra sheet tháng mới)
 *   08:00 thứ 2          nhắc ai chưa đặt cơm cả tuần
 *   08:30 ngày làm việc  kiểm tra trang giá vàng Phú Quý
 *   10:00 thứ 2, thứ 6   lịch bóng đá trong tuần
 *   12:00 ngày làm việc  thẻ báo cơm, 30 giây sau nhắc đứng dậy cho những người
 *                        đã nhận thẻ báo cơm (xem runLunchNotifications)
 */
function startSchedulers(client, deps) {
    startDailyFoodScheduler(client, deps);
    startFootballScheduler(client);
    startGoldHealthCheckScheduler(client);
    startSheetHealthCheckScheduler(client);
    startWeeklyEmptyReminderScheduler(client);
}

module.exports = { startSchedulers };
