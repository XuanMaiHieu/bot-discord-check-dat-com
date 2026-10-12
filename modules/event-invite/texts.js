// Toàn bộ câu chữ + thông tin buổi sinh hoạt của thiệp mời, sửa ở đây.
// Đổi POSTER thì chạy lại `node modules/event-invite/render-poster.js` để vẽ lại ảnh bìa.

// Mã sự kiện: đổi mã = sự kiện mới, danh sách "đã nhận thiệp" tính lại từ đầu
const EVENT_ID = "20-10-2026";

// 18:00 thứ Năm 15/10/2026 giờ Việt Nam, để Discord hiện đếm ngược
const START_AT = new Date("2026-10-15T18:00:00+07:00");

const MAP_URL = "https://maps.app.goo.gl/6zd6Nn4V5UcE6BRw9";

// Chữ trên ảnh bìa
const POSTER = {
    kicker: "THƯ MỜI",
    date: "20 · 10",
    title: "NGÀY PHỤ NỮ VIỆT NAM",
    subtitle: "Buổi sinh hoạt kỷ niệm của đại gia đình ABC",
    pills: ["18:00 · Thứ Năm, 15/10/2026", "577 Vũ Tông Phan"],
};

// {name} = họ tên người nhận, {countdown} = đếm ngược của Discord
const INVITE = {
    posterAlt: "Thư mời buổi sinh hoạt kỷ niệm 20/10, 18:00 thứ Năm 15/10/2026 tại 577 Vũ Tông Phan",
    title: "## 💌 Thư mời sinh hoạt kỷ niệm 20/10",
    greeting: "Thân mời **{name}** đến chung vui buổi sinh hoạt kỷ niệm **Ngày Phụ nữ Việt Nam 20/10** 🌸",
    message:
        "> Đây là dịp để anh chị em ABC có thời gian ngồi lại với nhau, trong không gian gần gũi thân thương, " +
        "để kể cho nhau nghe những kỷ niệm, tâm sự những cảm xúc mà bấy lâu nay tại văn phòng chưa có cơ hội được bày tỏ.",
    details:
        "🗓️ **Thời gian:** 18:00, thứ Năm ngày 15/10/2026 ({countdown})\n" +
        "📍 **Địa điểm:** 577 Vũ Tông Phan",
    mapButton: "Xem bản đồ",
    outro: "Sự có mặt của bạn là niềm vui của cả nhà. Hẹn gặp bạn tối thứ Năm nhé 💐",
};

module.exports = { EVENT_ID, START_AT, MAP_URL, POSTER, INVITE };
