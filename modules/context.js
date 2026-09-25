/**
 * `ctx` bot đưa cho các module: mọi thứ module được dùng từ bot nằm ở đây.
 * Module không require thẳng utils/ của bot, nên bot đổi bên trong thì chỉ
 * cần giữ nguyên các hàm này.
 */
const fs = require("fs");
const path = require("path");
const { ADMIN_DISCORD_ID } = require("../config");
const { denyUnlessRoot, notifyAdmin } = require("../utils/admin");
const { cardPayload, sendCardToUser } = require("../utils/card-message");
const { loadRecipients, findUserByDiscordId } = require("../utils/users");

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
