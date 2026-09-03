const cron = require("node-cron");

// Gửi cảnh báo cho admin qua DM
async function notifyAdmin(client, adminDiscordId, message) {
    try {
        const admin = await client.users.fetch(adminDiscordId);
        await admin.send(
            `🚨 **Cảnh báo kiểm tra sheet đầu tháng**\n\n${message}`
        );
    } catch (error) {
        console.error("❌ Không thể gửi cảnh báo cho admin:", error);
    }
}

// Khởi tạo scheduler kiểm tra đầu tháng (ngày 1, 8h sáng): sheet đang dùng có
// chứa đúng ngày hôm nay không, và có lấy được dữ liệu dòng của admin không
function startMonthlySheetCheckScheduler(
    client,
    resolveSheetName,
    checkMonthlySheetHealth,
    adminDiscordId
) {
    const cronExpression = "0 8 1 * *"; // 8h00 ngày 1 hàng tháng

    cron.schedule(cronExpression, async () => {
        try {
            const resolved = await resolveSheetName();
            if (resolved.error) {
                await notifyAdmin(
                    client,
                    adminDiscordId,
                    `❌ Không xác định được sheet để kiểm tra đầu tháng:\n${resolved.error}`
                );
                return;
            }

            const result = await checkMonthlySheetHealth(resolved.sheetName);
            if (result.error) {
                await notifyAdmin(
                    client,
                    adminDiscordId,
                    `❌ Kiểm tra sheet đầu tháng thất bại lúc ${new Date().toLocaleString(
                        "vi-VN"
                    )}\n` +
                        `Sheet: "${resolved.sheetName}"\n` +
                        `Lỗi: ${result.error}`
                );
            }
            // Đúng tháng và lấy được dữ liệu => không cần làm gì thêm
        } catch (error) {
            await notifyAdmin(
                client,
                adminDiscordId,
                `❌ Lỗi không xác định khi kiểm tra sheet đầu tháng:\n${error.message}`
            );
        }
    });
}

module.exports = { startMonthlySheetCheckScheduler };
