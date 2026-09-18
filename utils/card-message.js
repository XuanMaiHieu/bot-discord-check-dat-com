/**
 * Gửi / trả lời bằng thẻ Discord Components V2. Tin V2 phải có cờ
 * MessageFlags.IsComponentsV2 và không được có `content`.
 */
const { MessageFlags } = require("discord.js");

// Nội dung gửi / trả lời cho 1 thẻ Components V2. `files` là ảnh đính kèm được
// thẻ tham chiếu qua attachment://<tên file>
function cardPayload(container, { ephemeral = false, files = [] } = {}) {
    return {
        components: [container],
        files,
        flags: ephemeral
            ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            : MessageFlags.IsComponentsV2,
    };
}

/**
 * Gửi thẻ qua DM. Trả về { success, user, message, error } để nơi gọi tự báo cáo
 * (message = tin vừa gửi, dùng khi cần xóa tin sau này).
 */
async function sendCardToUser(client, discordId, container, { files = [] } = {}) {
    let user = null;
    try {
        user = await client.users.fetch(discordId);
        const message = await user.send(cardPayload(container, { files }));
        return { success: true, user, message };
    } catch (error) {
        // 50007 = Cannot send messages to this user (chặn DM / không chung server)
        if (error.code === 50007) {
            return {
                success: false,
                user,
                error: "Người này đang tắt DM từ thành viên trong server, hoặc chưa chung server với bot.",
            };
        }
        return { success: false, user, error: error.message };
    }
}

module.exports = { cardPayload, sendCardToUser };
