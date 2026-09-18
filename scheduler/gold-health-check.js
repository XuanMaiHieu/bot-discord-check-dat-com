const cron = require("node-cron");
const { checkPhuQuy, PHU_QUY_URL } = require("../utils/gold-price");
const { isWorkingDay, toDateKey } = require("../utils/workdays");
const { notifyAdmin } = require("../utils/admin");

// Ngày đã báo lỗi giá vàng cho root: mỗi ngày báo tối đa 1 lần
let alertedDateKey = null;

/**
 * DM root khi nguồn giá Phú Quý lỗi, tối đa 1 lần/ngày.
 */
async function alertGoldSourceProblem(client, reason) {
    const today = toDateKey(new Date());
    if (alertedDateKey === today) return;
    alertedDateKey = today;

    await notifyAdmin(
        client,
        "Không đọc được giá vàng Phú Quý",
        `Lỗi: ${reason}\n` +
            `Trang: ${PHU_QUY_URL}\n\n` +
            `/giavang đang tạm dùng nguồn dự phòng (PNJ / Bảo Tín Minh Châu) hoặc giá lưu gần nhất. ` +
            `Nếu trang đã đổi giao diện thì cần sửa \`utils/gold-price.js\`.`
    );
}

// Mỗi sáng ngày làm việc (8h30) đọc thử trang Phú Quý, lỗi thì báo root
function startGoldHealthCheckScheduler(client) {
    cron.schedule("30 8 * * *", async () => {
        if (!isWorkingDay()) return;
        const problem = await checkPhuQuy();
        if (problem) {
            console.error(`❌ Kiểm tra giá vàng Phú Quý thất bại: ${problem}`);
            await alertGoldSourceProblem(client, problem);
        }
    });
}

module.exports = {
    startGoldHealthCheckScheduler,
    alertGoldSourceProblem,
};
