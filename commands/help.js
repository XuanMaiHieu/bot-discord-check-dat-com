const { SlashCommandBuilder, MessageFlags } = require("discord.js");

const helpCommand = new SlashCommandBuilder()
    .setName("help")
    .setDescription("Xem hướng dẫn sử dụng bot")
    .toJSON();

const HELP_FIELDS = [
    {
        name: "📋 Lệnh chính",
        value:
            "• `/abcom` - Tra cứu thông tin đăng ký cơm trưa\n" +
            "• `/giavang` - Xem giá vàng Phú Quý hôm nay\n" +
            "• `/giaxang` - Xem giá xăng dầu Petrolimex, bật báo khi giá đổi\n" +
            "• `/fbdate`, `/fbname` - Lịch thi đấu Ngoại hạng Anh\n" +
            "• `/help` - Xem hướng dẫn này",
    },
    {
        name: "📝 Cách sử dụng /abcom",
        value:
            "1. Gõ `/abcom`\n" +
            "2. Điền **name:** (tùy chọn) - bỏ trống để xem của chính bạn, có thể nhập một phần tên\n" +
            "3. Điền **day:** (tùy chọn) - ví dụ: 23/12\n" +
            "4. Enter để gửi",
    },
    {
        name: "🔍 Tìm kiếm thông minh",
        value:
            "• Nhập đầy đủ: `Mai Xuân Hiếu` → Tìm chính xác\n" +
            "• Nhập một phần: `Hiếu` hoặc `Xuân Hiếu` → Tìm tất cả có chứa\n" +
            "• Nhập không dấu: `mai xuan hieu` → Tự động nhận diện\n" +
            "• Nhập không hoa: `MAI XUAN HIEU` → Tự động nhận diện",
    },
    {
        name: "💡 Ví dụ",
        value:
            "• `/abcom`\n" +
            "• `/abcom name: Hiếu`\n" +
            "• `/abcom name: mai xuan hieu`\n" +
            "• `/abcom name: Mai Xuân Hiếu day: 23/12`",
    },
];

async function handleHelpCommand(interaction) {
    await interaction.reply({
        embeds: [
            {
                color: 0x0099ff,
                title: "🤖 Bot Check Dat Com - Hướng dẫn",
                fields: HELP_FIELDS.map((field) => ({ ...field, inline: false })),
                timestamp: new Date().toISOString(),
            },
        ],
        flags: MessageFlags.Ephemeral,
    });
}

module.exports = {
    commands: [{ data: helpCommand, execute: handleHelpCommand }],
};
