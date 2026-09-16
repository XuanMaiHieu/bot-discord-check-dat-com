const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const { fetchGif } = require("../utils/gif");
const { sendGifToUser } = require("../commands/gif");

// Nội dung thông báo đứng dậy
const STANDUP_MESSAGE =
    "🕛 **Thời điểm đã đến, kính mời quý user hãy đứng dậy**";

// Từ khóa GIF cho thông báo 12h - mỗi ngày bốc ngẫu nhiên 1 từ, chia 2 nhóm ý nghĩa.
// Đã test thực tế trên Giphy (top 10 kết quả).
const STANDUP_GIF_QUERIES = [
    // Nhóm 1: đứng dậy, rời bàn làm việc
    "rời bàn làm việc",   // 8/10 cảnh rời chỗ làm (Go Home, Leaving Work, Got To Go...)
    "the office leaving", // 9/10 cảnh bỏ đi trong phim The Office
    "leave work",         // cảnh chạy khỏi chỗ làm

    // Nhóm 2: kêu gọi mọi người cùng đứng lên
    "on your feet",       // 10/10 cảnh hô hào đứng dậy, khí thế "let's go"
    "get on your feet",   // "Get Up", "Stand Up Get On Your Feet"
    "lets go everyone",   // "Come Let's Go", "Join Us"
];
// Đã loại sau khi test:
//   "hãy đứng dậy" / "đứng dậy" / "get up stand up" -> ra cảnh ngủ dậy, good morning
//   "stand up" / "đứng lên" / "mọi người đứng lên" / "everybody stand up" -> dính stand-up comedy
//   "vươn vai" -> ra "reach out";  "all rise" -> bóng chày, tòa án

// Loại GIF có tiêu đề lệch ngữ cảnh 12h trưa ngày thường:
// ngủ dậy buổi sáng, hết tuần / nghỉ lễ, đang cắm mặt làm việc, hài độc thoại, quảng cáo tuyển dụng
const STANDUP_GIF_EXCLUDE =
    /good ?morning|wake ?up|sleep|good ?night|friday|weekend|labor day|vacation|holiday|working|happy hour|comedy|hiring/i;

// Hàm kiểm tra xem hôm nay có phải là thứ 2-6 không
function isWeekday() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Chủ nhật, 1 = Thứ 2, ..., 6 = Thứ 7
    return dayOfWeek >= 1 && dayOfWeek <= 5; // Thứ 2 đến Thứ 6
}

// Hàm đọc danh sách users nhận thông báo đứng dậy từ file JSON.
// Mặc định mọi user đang enabled đều nhận; muốn tắt cho ai thì thêm
// "standup_notify": false vào user đó trong data/users.json
function loadStandupUsers() {
    try {
        const usersFilePath = path.join(__dirname, "../data/users.json");
        const usersData = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));

        return usersData.users.filter(
            (user) =>
                user.enabled === true &&
                user.discordId !== null &&
                user.standup_notify !== false
        );
    } catch (error) {
        console.error(
            `❌ Không đọc được data/users.json cho thông báo đứng dậy: ${error.message}`
        );
        return [];
    }
}

function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

/**
 * Gửi thông báo "hãy đứng dậy" kèm GIF cho danh sách user.
 *
 * @param {object} client - Discord client
 * @param {object} options
 * @param {string[]} options.targetUserIds - Chỉ gửi cho các ID này (dùng khi test).
 *                                           Bỏ trống = gửi cho toàn bộ user trong users.json
 * @returns {object} { sent, failed, total, gif, details }
 */
async function runStandupNotification(client, { targetUserIds = null } = {}) {
    // Chỉ lấy GIF 1 lần rồi gửi chung cho mọi người, tránh đốt quota API
    const query = process.env.STANDUP_GIF_QUERY || pickRandom(STANDUP_GIF_QUERIES);
    const gif = await fetchGif(query, { excludeTitle: STANDUP_GIF_EXCLUDE });

    if (!gif) {
        console.error("❌ Không lấy được GIF đứng dậy, sẽ gửi tin nhắn không kèm GIF");
    }

    const recipients = targetUserIds
        ? targetUserIds.map((id) => ({ discordId: id, name: id }))
        : loadStandupUsers();

    const details = [];
    let sent = 0;
    let failed = 0;

    for (const user of recipients) {
        try {
            if (gif) {
                const result = await sendGifToUser(client, user.discordId, {
                    gif,
                    message: STANDUP_MESSAGE,
                    footer: `Nhắc đứng dậy 12:00 • Nguồn GIF: ${gif.provider}`,
                });

                if (result.success) {
                    sent++;
                    details.push(`✅ ${user.name}`);
                } else {
                    failed++;
                    details.push(`❌ ${user.name}: ${result.error}`);
                }
            } else {
                // Không có GIF thì vẫn phải gửi được chữ
                const discordUser = await client.users.fetch(user.discordId);
                await discordUser.send(STANDUP_MESSAGE);
                sent++;
                details.push(`✅ ${user.name} (không có GIF)`);
            }

            // Delay nhỏ giữa các lần gửi để tránh rate limit của Discord
            await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
            failed++;
            details.push(`❌ ${user.name}: ${error.message}`);
        }
    }

    console.log(
        `🧍 Thông báo đứng dậy: gửi thành công ${sent}/${recipients.length}` +
        (gif ? ` (GIF: ${query} - ${gif.provider})` : " (không có GIF)")
    );

    return { sent, failed, total: recipients.length, gif, query, details };
}

// Hàm khởi tạo scheduler: 12:00 mỗi ngày làm việc (T2-T6), chạy sau /báo cơm
function startStandupScheduler(client) {
    // 00 12 * * * = 12:00 mỗi ngày.
    // Scheduler báo cơm cũng chạy đúng 12:00, nên ở đây delay 30 giây để
    // tin "đứng dậy" luôn tới sau tin báo cơm, không chen ngang.
    const cronExpression = "00 12 * * *";

    cron.schedule(cronExpression, async () => {
        if (!isWeekday()) {
            console.log(
                "⏭️ Hôm nay không phải ngày làm việc (T2-T6), bỏ qua thông báo đứng dậy"
            );
            return;
        }

        setTimeout(async () => {
            try {
                await runStandupNotification(client);
            } catch (error) {
                console.error(`❌ Lỗi khi gửi thông báo đứng dậy: ${error.message}`);
            }
        }, 30 * 1000);
    });

    console.log("✅ Đã bật scheduler nhắc đứng dậy lúc 12:00 (T2-T6)");
}

module.exports = {
    startStandupScheduler,
    runStandupNotification,
    loadStandupUsers,
    isWeekday,
    STANDUP_MESSAGE,
};
