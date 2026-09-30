/**
 * Câu riêng trong tin trả lời feedback, theo đợt: { "<mã đợt>": { "<discordId>": { note, blocks } } }
 *   note    câu riêng, hiện sau các khối
 *   blocks  (tùy chọn) khối nào hiện: ["idea"], ["fix"], ["idea", "fix"], [] = không khối nào.
 *           Bỏ trống = tự chọn theo góp ý (có ô 💡 thì khối đề xuất, có ô 🔧 thì khối lỗi)
 * Người chưa chấm / góp ý mà có câu riêng ở đây vẫn được gửi.
 */
module.exports = {
    "2026-09": {
        // Đào Thúy An: ô đề xuất là lời khen, không cần khối đề xuất
        "885092693649276968": { blocks: [], note: "User tích cực là vui rồi ạ." },
        // Đỗ Thị Hồng
        "888033511532027944": {
            note: "Tính năng hay nhé, có hơn 1 phiếu nên admin đang cân nhắc, bot sẽ hối admin sớm.",
        },
        // Nguyễn Văn Đức
        "711211764653752341": { note: "Anh bạn à?" },
        // Trần Ngọc Linh: ô cần sửa là "tin nhắn ít", không hợp khối lỗi
        "745967087352152075": {
            blocks: ["idea"],
            note:
                "Cám ơn bài thơ tuyệt vời của quý user, nhắc uống nước có hơn 1 phiếu nên admin đang cân nhắc, " +
                "bot sẽ hối admin.",
        },
        // Hoàng Thị Tiên Diễm
        "1531111809900220439": {
            note:
                "Bot đã xem và đọc thông tin đặt cơm hôm đó thật của Diễm mà không thấy Diễm đặt món nên thật " +
                "bot không biết gửi tới Diễm món gì. Hôm tới Diễm đặt trước rồi bot sẽ nhắc mình vào 12h nhé.",
        },
    },
};
