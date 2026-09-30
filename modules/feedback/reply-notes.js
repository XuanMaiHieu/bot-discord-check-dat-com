/**
 * Câu riêng trong tin trả lời feedback, theo đợt: { "<mã đợt>": { "<discordId>": { ... } } }
 *   liked / fix / idea  câu riêng cho khối đó, hiện ngay dưới câu rep chung của khối
 *   generic             (tùy chọn) khối nào hiện câu rep chung: ["idea"], ["fix"], ["idea", "fix"],
 *                       [] = không khối nào. Bỏ trống = mọi khối có câu chung (đề xuất, cần sửa)
 *   note                (tùy chọn) câu riêng không thuộc khối nào, hiện trước câu kết
 * Khối user có viết mà không có câu rep nào (không câu chung, không câu riêng) thì ẩn.
 */
module.exports = {
    "2026-09": {
        // Đào Thúy An: ô đề xuất là lời khen, không cần câu chung của khối đề xuất
        "885092693649276968": { generic: [], idea: "User tích cực là vui rồi ạ." },
        // Đỗ Thị Hồng
        "888033511532027944": {
            idea: "Tính năng hay nhé, có hơn 1 phiếu nên admin đang cân nhắc, bot sẽ hối admin sớm.",
        },
        // Nguyễn Văn Đức
        "711211764653752341": { idea: "Anh bạn à?" },
        // Trần Ngọc Linh: ô cần sửa là "tin nhắn ít", không hợp câu chung của khối cần sửa
        "745967087352152075": {
            generic: ["idea"],
            liked: "Cám ơn bài thơ tuyệt vời của quý user.",
            idea: "Nhắc uống nước có hơn 1 phiếu nên admin đang cân nhắc, bot sẽ hối admin.",
        },
        // Hoàng Thị Tiên Diễm
        "1531111809900220439": {
            fix:
                "Bot đã xem và đọc thông tin đặt cơm hôm đó thật của Diễm mà không thấy Diễm đặt món nên thật " +
                "bot không biết gửi tới Diễm món gì. Hôm tới Diễm đặt trước rồi bot sẽ nhắc mình vào 12h nhé.",
        },
    },
};
