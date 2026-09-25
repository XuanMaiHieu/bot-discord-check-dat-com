/**
 * `ctx` bot đưa cho các module: mọi thứ module được dùng từ bot nằm ở đây.
 * Module không require thẳng utils/ của bot, nên bot đổi bên trong thì chỉ
 * cần giữ nguyên các hàm này.
 */
const fs = require("fs");
const path = require("path");
const { MessageFlags } = require("discord.js");
const { ADMIN_DISCORD_ID } = require("../config");
const { denyUnlessRoot, notifyAdmin } = require("../utils/admin");
const { cardPayload, sendCardToUser } = require("../utils/card-message");
const { loadRecipients, findUserByDiscordId } = require("../utils/users");
const { MEAL_WEEK_BUTTON_ID } = require("../utils/meal-card");

// Trả lời riêng người bấm bằng 1 thẻ dựng bất đồng bộ; lỗi thì báo chữ
async function replyWithCard(interaction, buildCard, errorPrefix) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        const { card, error } = await buildCard();
        await interaction.editReply(card ? cardPayload(card) : `❌ ${error}`);
    } catch (error) {
        await interaction.editReply(`❌ ${errorPrefix}: ${error.message}`);
    }
}

const DATA_ROOT = path.join(__dirname, "../data");

function createModuleContext(client, deps) {
    return {
        client,
        // Đọc sheet: { resolveSheetName, readSheetGrid, getUserNameByDiscordId }
        deps,

        adminId: ADMIN_DISCORD_ID,
        isRoot: (discordId) => discordId === ADMIN_DISCORD_ID,
        denyUnlessRoot,
        notifyAdmin: (title, message) => notifyAdmin(client, title, message),

        cardPayload,
        sendCardToUser: (discordId, container, options) => sendCardToUser(client, discordId, container, options),

        // Người đang nhận tin cơm 12h (enabled, có Discord ID)
        loadEnabledUsers: () => loadRecipients((user) => user.enabled === true),
        findUserByDiscordId,

        // Tính năng có sẵn của bot, để module giới thiệu / mở nhanh
        features: {
            // Nút "📅 Xem cả tuần": đặt customId này vào nút, bot tự xử lý
            mealWeekButtonId: MEAL_WEEK_BUTTON_ID,
            // Trả lời riêng người bấm: giá vàng hôm nay
            showGold: (interaction) =>
                replyWithCard(
                    interaction,
                    () => require("../commands/gold").buildTodayCard(interaction),
                    "Không lấy được giá vàng"
                ),
            // Trả lời riêng người bấm: lịch bóng đá tuần này
            showFootball: (interaction) =>
                replyWithCard(
                    interaction,
                    () => require("../scheduler/football-notification").buildWeeklyFootballCard(client),
                    "Không lấy được lịch thi đấu từ ESPN"
                ),
        },

        // Thư mục lưu dữ liệu riêng của module: data/<name>/ (data/ nằm trong
        // .gitignore nên git pull không ghi đè)
        dataDir(name) {
            const dir = path.join(DATA_ROOT, name);
            fs.mkdirSync(dir, { recursive: true });
            return dir;
        },
    };
}

module.exports = { createModuleContext };
