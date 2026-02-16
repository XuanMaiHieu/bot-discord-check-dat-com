const { Client, GatewayIntentBits } = require("discord.js");
const cron = require("node-cron");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
});

const USERS_PATH = path.join(__dirname, "data", "users.json");

function getEnabledUsers() {
    try {
        const data = JSON.parse(fs.readFileSync(USERS_PATH, "utf8"));
        return data.users.filter((u) => u.enabled === true && u.discordId);
    } catch (error) {
        console.error("❌ Lỗi đọc users.json:", error);
        return [];
    }
}

async function sendNewYearWishes() {
    const users = getEnabledUsers();
    console.log(`🚀 Bắt đầu gửi lời chúc tới ${users.length} người dùng...`);

    for (const user of users) {
        try {
            const discordUser = await client.users.fetch(user.discordId);
            await discordUser.send(
                `🌸 Chúc mừng năm mới, thay mặt e Hiếu, bot check đặt cơm xin chúc anh em và gia đình năm mới an khang thịnh vượng, sức khoẻ dồi dào, công việc thuận lợi và,\n` +
                    `✨ Vạn sự như ý, tỉ sự như mơ 🏮\n` +
                    `🌈 Triệu triệu bất ngờ, hàng giờ hạnh phúc 🧧\n\n` +
                    `Xin chúc mừng năm mới 🌸🌸🌸 ✨🌟🎊`
            );
            console.log(`✅ Đã gửi tin nhắn tới ${user.name}`);
        } catch (error) {
            console.error(
                `❌ Lỗi gửi tin nhắn cho ${user.name} (${user.discordId}):`,
                error.message
            );
        }
    }
    console.log("🏁 Hoàn thành gửi lời chúc.");
    process.exit(0);
}

// Lên lịch vào 00:01 ngày 17/02/2026
// Cron format: minute hour day month day-of-week
// cron.schedule(
//     "1 0 17 2 *",
//     async () => {
//         console.log("⏰ Đã đến giờ! Đang gửi lời chúc năm mới...");
//         await sendNewYearWishes();
//     },
//     {
//         timezone: "Asia/Ho_Chi_Minh",
//     }
// );

cron.schedule(
    "50 13 16 2 *",
    async () => {
        console.log("⏰ Đã đến giờ! Đang gửi lời chúc năm mới...");
        await sendNewYearWishes();
    },
    {
        timezone: "Asia/Ho_Chi_Minh",
    }
);

client.once("ready", () => {
    console.log(`✅ Bot thông báo đã sẵn sàng! (${client.user.tag})`);
    console.log("⏳ Đang chờ đến 00:01 ngày 17/02/2026...");
});

client.login(process.env.DISCORD_TOKEN).catch((err) => {
    console.error("❌ Lỗi đăng nhập Discord:", err.message);
});
