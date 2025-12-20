const { SlashCommandBuilder } = require("discord.js");

// Định nghĩa command /abc
const commandData = new SlashCommandBuilder()
    .setName("abc")
    .setDescription("Gửi tin nhắn tự động cho user")
    .addStringOption((option) =>
        option
            .setName("aa")
            .setDescription("Nội dung tin nhắn")
            .setRequired(true)
    )
    .toJSON();

// Hàm xử lý command /abc
async function handleAbcCommand(interaction) {
    const aa = interaction.options.getString("aa");

    try {
        // Gửi tin nhắn cho user (trong channel hiện tại)
        await interaction.reply({
            content: `📨 **Tin nhắn tự động:**\n${aa}`,
            ephemeral: false, // Hiển thị công khai trong channel
        });

        // Gửi thêm DM cho user nếu có thể
        try {
            await interaction.user.send(
                `📨 **Tin nhắn tự động từ bot:**\n${aa}`
            );
        } catch (dmError) {
            // Nếu không gửi được DM (user chặn DM hoặc không cho phép), bỏ qua
            console.log(
                `⚠️ Không thể gửi DM cho ${interaction.user.tag}: ${dmError.message}`
            );
        }
    } catch (error) {
        console.error("❌ Lỗi khi xử lý command /abc:", error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: "❌ Có lỗi xảy ra khi gửi tin nhắn!",
                ephemeral: true,
            });
        }
    }
}

module.exports = {
    commandData,
    handleAbcCommand,
};
