/**
 * Bot Check Dat Com: báo cơm trưa từ Google Sheet, nhắc đứng dậy, lịch bóng đá,
 * giá vàng.
 *
 *   commands/   slash command + nút bấm (danh sách ở commands/index.js)
 *   scheduler/  tin gửi tự động theo giờ (danh sách ở scheduler/index.js)
 *   utils/      đọc sheet, dựng thẻ, gọi API ngoài...
 *   data/       users.json + trạng thái lưu lại (không bị git pull ghi đè)
 */
const dotenv = require("dotenv");
dotenv.config();

const { Client, GatewayIntentBits, MessageFlags, REST, Routes } = require("discord.js");
const { commandData, commandByName, buttonById } = require("./commands");
const { startSchedulers } = require("./scheduler");
const { initializeAuth, readSheetGrid, resolveSheetName } = require("./utils/google-sheets");
const { getUserNameByDiscordId } = require("./utils/users");

// Phụ thuộc dùng chung truyền cho mọi lệnh / scheduler
const deps = {
    resolveSheetName,
    readSheetGrid,
    getUserNameByDiscordId,
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages, // Cho phép bot nhận tin nhắn trực tiếp
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
    ],
});

// Đăng ký toàn bộ slash command (global). Lưu ý: bot dev và bot trên server dùng
// chung token, bot nào khởi động sau sẽ ghi đè danh sách lệnh của bot kia
async function registerCommands() {
    try {
        const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
        await rest.put(Routes.applicationCommands(client.user.id), { body: commandData });
        console.log(`✅ Đã đăng ký slash commands: ${commandData.map((c) => `/${c.name}`).join(", ")}`);
    } catch (error) {
        console.error("❌ Lỗi khi đăng ký slash commands:", error);
    }
}

client.once("clientReady", async () => {
    console.log(`✅ Bot đã sẵn sàng! (${client.user.tag})`);
    await registerCommands();
    startSchedulers(client, deps);
});

// Báo lỗi cho người dùng khi handler ném lỗi mà chưa tự xử lý
async function replyWithError(interaction, error) {
    const content = `❌ Có lỗi xảy ra: ${error.message}`;
    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        }
    } catch (replyError) {
        console.error("❌ Không gửi được thông báo lỗi cho người dùng:", replyError.message);
    }
}

client.on("interactionCreate", async (interaction) => {
    let handler = null;
    let label = null;
    if (interaction.isButton()) {
        handler = buttonById.get(interaction.customId);
        label = `nút ${interaction.customId}`;
    } else if (interaction.isChatInputCommand()) {
        handler = commandByName.get(interaction.commandName);
        label = `/${interaction.commandName}`;
    }
    if (!handler) return;

    try {
        await handler.execute(interaction, deps);
    } catch (error) {
        console.error(`❌ Lỗi khi xử lý ${label}:`, error);
        await replyWithError(interaction, error);
    }
});

// Khởi tạo bot với retry logic
async function startBot(retryCount = 0, maxRetries = 5) {
    try {
        // Khởi tạo Google Auth trước
        await initializeAuth();

        // Đăng nhập Discord bot
        await client.login(process.env.DISCORD_TOKEN);
        console.log("✅ Bot đã khởi động thành công!");
    } catch (error) {
        // Xử lý lỗi disallowed intents
        if (error.message && error.message.includes("disallowed intents")) {
            console.error("❌ Lỗi: Bot đang sử dụng intents chưa được bật!");
            console.error("📋 Cách khắc phục:");
            console.error("   1. Vào Discord Developer Portal: https://discord.com/developers/applications");
            console.error("   2. Chọn bot của bạn");
            console.error("   3. Vào mục 'Bot' ở sidebar");
            console.error("   4. Scroll xuống phần 'Privileged Gateway Intents'");
            console.error("   5. Bật các intents sau:");
            console.error("      ✅ MESSAGE CONTENT INTENT (bắt buộc)");
            console.error("      ✅ SERVER MEMBERS INTENT (nếu cần)");
            console.error("   6. Lưu thay đổi");
            console.error("   7. Chạy lại bot");
            process.exit(1);
        }

        // Xử lý lỗi rate limit của Discord
        if (error.message && error.message.includes("Not enough sessions remaining")) {
            const resetMatch = error.message.match(/resets at (.+)/);
            const resetTime = resetMatch ? new Date(resetMatch[1]) : null;

            if (resetTime) {
                const waitTime = Math.max(0, resetTime - new Date());
                const waitSeconds = Math.ceil(waitTime / 1000);

                console.error("❌ Discord Rate Limit!");
                console.error(`⏰ Cần đợi đến: ${resetTime.toLocaleString()}`);
                console.error(`⏳ Thời gian chờ: ${waitSeconds} giây (${Math.ceil(waitSeconds / 60)} phút)`);

                if (retryCount < maxRetries && waitSeconds < 3600) {
                    console.log(`🔄 Retry sau ${waitSeconds}s (${retryCount + 1}/${maxRetries})`);
                    setTimeout(() => startBot(retryCount + 1, maxRetries), waitTime);
                    return;
                }
                console.error("❌ Đã vượt quá số lần thử hoặc thời gian chờ quá lâu");
                process.exit(1);
            }
        }

        console.error("❌ Lỗi khởi động bot:", error);

        if (retryCount < maxRetries && !error.message?.includes("Not enough sessions")) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
            console.log(`🔄 Retry sau ${delay / 1000}s (${retryCount + 1}/${maxRetries})`);
            setTimeout(() => startBot(retryCount + 1, maxRetries), delay);
            return;
        }

        process.exit(1);
    }
}

// Xử lý lỗi không được bắt
process.on("unhandledRejection", (error) => {
    console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
    process.exit(1);
});

startBot();
