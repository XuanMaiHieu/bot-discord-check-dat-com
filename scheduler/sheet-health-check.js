const cron = require("node-cron");

// Gửi cảnh báo cho admin qua DM
async function notifyAdmin(client, adminDiscordId, message) {
    try {
        const admin = await client.users.fetch(adminDiscordId);
        await admin.send(`🚨 **Cảnh báo kết nối Google Sheet**\n\n${message}`);
    } catch (error) {
        console.error("❌ Không thể gửi cảnh báo cho admin:", error);
    }
}

// Khởi tạo scheduler kiểm tra kết nối Google Sheet mỗi ngày lúc 8h sáng
function startSheetHealthCheckScheduler(
    client,
    resolveSheetName,
    checkSheetConnection,
    adminDiscordId
) {
    const cronExpression = "0 8 * * *"; // 8h00 sáng hàng ngày

    cron.schedule(cronExpression, async () => {
        try {
            const resolved = await resolveSheetName();
            if (resolved.error) {
                await notifyAdmin(
                    client,
                    adminDiscordId,
                    `❌ Không xác định được sheet để kiểm tra:\n${resolved.error}`
                );
                return;
            }

            const result = await checkSheetConnection(resolved.sheetName);
            if (result.error) {
                await notifyAdmin(
                    client,
                    adminDiscordId,
                    `❌ Kiểm tra kết nối Google Sheet thất bại lúc ${new Date().toLocaleString(
                        "vi-VN"
                    )}\n` +
                        `Sheet: "${resolved.sheetName}"\n` +
                        `Lỗi: ${result.error}`
                );
            }
            // Kết nối OK, lấy được dữ liệu vài dòng => không cần làm gì thêm
        } catch (error) {
            await notifyAdmin(
                client,
                adminDiscordId,
                `❌ Lỗi không xác định khi kiểm tra Google Sheet:\n${error.message}`
            );
        }
    });
}

module.exports = { startSheetHealthCheckScheduler };
