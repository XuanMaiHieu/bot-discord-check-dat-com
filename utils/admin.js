const { MessageFlags } = require("discord.js");
const { ADMIN_DISCORD_ID } = require("../config");

/**
 * Chặn người không phải root. Trả về true nếu đã từ chối (nơi gọi return luôn).
 * Lệnh admin còn được ẩn với người không có quyền Administrator (xem
 * setDefaultMemberPermissions), đây là lớp chặn thứ 2 cho admin khác của server.
 */
async function denyUnlessRoot(interaction) {
    if (interaction.user.id === ADMIN_DISCORD_ID) return false;
    await interaction.reply({
        content: "❌ Bạn không có quyền sử dụng lệnh này (chỉ root mới được dùng).",
        flags: MessageFlags.Ephemeral,
    });
    return true;
}

// DM cảnh báo cho root. Lỗi gửi chỉ ghi log
async function notifyAdmin(client, title, message) {
    try {
        const admin = await client.users.fetch(ADMIN_DISCORD_ID);
        await admin.send(`🚨 **${title}**\n\n${message}`);
    } catch (error) {
        console.error("❌ Không thể gửi cảnh báo cho admin:", error);
    }
}

module.exports = {
    denyUnlessRoot,
    notifyAdmin,
};
