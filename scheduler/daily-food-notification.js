const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

// Hàm lấy ngày hôm nay theo format DD/MM
function getTodayDate() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}`;
}

// Hàm kiểm tra xem hôm nay có phải là thứ 2-6 không
function isWeekday() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Chủ nhật, 1 = Thứ 2, ..., 6 = Thứ 7
    return dayOfWeek >= 1 && dayOfWeek <= 5; // Thứ 2 đến Thứ 6
}

// Hàm lấy món ăn của Mai Xuân Hiếu cho ngày hôm nay
async function getTodayFoodForUser(
    sheetName,
    userName,
    findNameInColumn,
    findDateInRow,
    getCellValue
) {
    try {
        // Lấy ngày hôm nay
        const today = getTodayDate();

        // Tìm tên trong cột C
        const nameResult = await findNameInColumn(sheetName, userName);
        if (nameResult.error || !nameResult.row) {
            return { error: `Không tìm thấy tên "${userName}" trong sheet` };
        }

        const foundRow = nameResult.row;
        const foundName = nameResult.name || userName;

        // Tìm ngày trong dòng 4
        const dateResult = await findDateInRow(sheetName, today);
        if (dateResult.error) {
            return { error: `Không tìm thấy ngày "${today}" trong sheet` };
        }

        // Lấy giá trị tại ô giao nhau
        const cellResult = await getCellValue(
            sheetName,
            dateResult.column,
            foundRow
        );

        if (cellResult.error) {
            return { error: cellResult.error };
        }

        return {
            success: true,
            name: foundName,
            date: today,
            food: cellResult.value || "(trống)",
            position: `${dateResult.column}${foundRow}`,
        };
    } catch (error) {
        return { error: error.message || "Lỗi không xác định" };
    }
}

// Hàm gửi tin nhắn cho user
async function sendDailyFoodNotification(client, userId, foodData) {
    try {
        const user = await client.users.fetch(userId);

        if (!user) {
            return false;
        }

        const message =
            `🍽️ **Thông báo món ăn hôm nay**\n\n` +
            `📅 **Ngày:** ${foodData.date}\n` +
            `👤 **Tên:** ${foodData.name}\n` +
            `🍛 **Món ăn:** ${foodData.food}\n` +
            `📍 **Vị trí:** ${foodData.position}\n\n` +
            `_Tự động gửi lúc 11:55 hàng ngày (Thứ 2 - Thứ 6)_`;

        await user.send(message);
        return true;
    } catch (error) {
        return false;
    }
}

// Hàm đọc danh sách users từ file JSON
function loadUsersFromFile() {
    try {
        const usersFilePath = path.join(__dirname, "../data/users.json");
        const usersData = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));

        // Lọc ra các user có enabled: true và có discordId
        const enabledUsers = usersData.users.filter(
            (user) => user.enabled === true && user.discordId !== null
        );

        return enabledUsers;
    } catch (error) {
        return [];
    }
}

// Hàm khởi tạo scheduler
function startDailyFoodScheduler(
    client,
    sheetName,
    findNameInColumn,
    findDateInRow,
    getCellValue
) {
    // Schedule chạy vào 11h55 mỗi ngày
    // Cron format: "phút giờ * * *" (phút giờ ngày tháng thứ)
    // 55 11 * * * = 11:55 mỗi ngày
    const cronExpression = "55 11 * * *";

    cron.schedule(cronExpression, async () => {
        // Kiểm tra xem hôm nay có phải là thứ 2-6 không
        // if (!isWeekday()) {
        //     console.log(
        //         `⏭️ Hôm nay không phải ngày làm việc (T2-T6), bỏ qua gửi thông báo`
        //     );
        //     return;
        // }

        // Đọc danh sách users từ file
        const enabledUsers = loadUsersFromFile();

        if (enabledUsers.length === 0) {
            return;
        }

        // Gửi thông báo cho từng user
        for (const user of enabledUsers) {
            try {
                const foodData = await getTodayFoodForUser(
                    sheetName,
                    user.name,
                    findNameInColumn,
                    findDateInRow,
                    getCellValue
                );

                if (foodData.error) {
                    // Vẫn gửi thông báo lỗi cho user
                    try {
                        const discordUser = await client.users.fetch(
                            user.discordId
                        );
                        await discordUser.send(
                            `⚠️ **Thông báo món ăn hôm nay**\n\n` +
                            `❌ Không thể lấy thông tin món ăn:\n${foodData.error}\n\n` +
                            `_Thời gian: ${new Date().toLocaleString(
                                "vi-VN"
                            )}_`
                        );
                    } catch (error) {
                        // Silent fail
                    }
                    continue;
                }

                // Gửi thông báo cho user
                await sendDailyFoodNotification(
                    client,
                    user.discordId,
                    foodData
                );

                // Delay nhỏ giữa các lần gửi để tránh rate limit
                await new Promise((resolve) => setTimeout(resolve, 1000));
            } catch (error) {
                // Silent fail
            }
        }
    });

    // Test ngay lập tức (tùy chọn - có thể comment lại)
    // setTimeout(async () => {
    //     const enabledUsers = loadUsersFromFile();

    //     if (enabledUsers.length === 0) {
    //         return;
    //     }

    //     for (const user of enabledUsers) {
    //         try {
    //             const foodData = await getTodayFoodForUser(
    //                 sheetName,
    //                 user.name,
    //                 findNameInColumn,
    //                 findDateInRow,
    //                 getCellValue
    //             );

    //             if (foodData.error) {
    //                 try {
    //                     const discordUser = await client.users.fetch(
    //                         user.discordId
    //                     );
    //                     await discordUser.send(
    //                         `⚠️ **Thông báo món ăn hôm nay**\n\n` +
    //                             `❌ Không thể lấy thông tin món ăn:\n${foodData.error}\n\n` +
    //                             `_Thời gian: ${new Date().toLocaleString(
    //                                 "vi-VN"
    //                             )}_`
    //                     );
    //                 } catch (error) {
    //                     // Silent fail
    //                 }
    //                 continue;
    //             }

    //             await sendDailyFoodNotification(
    //                 client,
    //                 user.discordId,
    //                 foodData
    //             );
    //             await new Promise((resolve) => setTimeout(resolve, 1000));
    //         } catch (error) {
    //             // Silent fail
    //         }
    //     }
    // }, 5000);
}

module.exports = {
    startDailyFoodScheduler,
    getTodayFoodForUser,
    sendDailyFoodNotification,
    getTodayDate,
    isWeekday,
    loadUsersFromFile,
};
