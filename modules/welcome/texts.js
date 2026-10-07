// Toàn bộ câu chữ của thẻ chào mừng quay lại, sửa chữ ở đây. {name} = tên người nhận, {admin} = tag admin

const WELCOME = {
    title: "## 👋 Chào mừng {name} quay lại!",
    intro:
        "Lâu rồi không gặp, bot nhớ bạn ghê 🥹\n" +
        "Lúc bạn vắng bot vẫn đi làm đều và học thêm vài trò. Điểm nhanh để bạn bắt nhịp lại nha:",
    // `key` khớp với nút trong cards.js; không có nút thì chỉ hiện chữ
    features: [
        {
            key: "meal_week",
            title: "🍱 Báo cơm trưa",
            text: "12h ngày làm việc bot nhắn món hôm nay của bạn, khỏi mở sheet. Sáng thứ 2 nhắc nếu cả tuần chưa đặt",
            button: "Xem cả tuần",
        },
        { key: "gold", title: "💰 Giá vàng hôm nay", text: "Phú Quý / BTMC, bấm là có giá mới nhất" },
        { key: "fuel", title: "⛽ Giá xăng dầu", text: "Giá Petrolimex 2 vùng, bật báo là giá đổi bot nhắn liền" },
        { key: "football", title: "⚽ Lịch bóng đá trong tuần", text: "Trận nào đáng thức khuya, bot lọc sẵn rồi" },
        {
            key: "water",
            title: "💧 Nhắc uống nước",
            text: "Bot nhắc trong giờ làm, đếm ml giúp bạn, cuối ngày có tổng kết. Gõ `/uongnuoc` để bật",
        },
    ],
    seeButton: "Xem ngay",
    commandsHint: "-# Gõ /abcom · /giavang · /giaxang · /fbdate · /uongnuoc bất cứ lúc nào, hoặc /help để xem hướng dẫn",
    outro: "Có gì chưa ổn hoặc muốn tắt bớt tin nào thì nhắn {admin} nhé. Chúc bạn trở lại thật suôn sẻ 💪",
};

module.exports = { WELCOME };
