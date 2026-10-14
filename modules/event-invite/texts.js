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

// ---------------------------------------------------------------------------
// Nhắc chỗ ngồi (/cho-ngoi)

// Mã đợt gửi nhắc chỗ ngồi, tách với thiệp mời để mỗi đợt ai cũng nhận 1 lần
const SEATING_ID = "20-10-2026-seating";

// Chỗ ngồi: mỗi bàn 2 dãy ghế 2 bên. Tên ghi đúng phần cuối họ tên trong
// data/users.json thì thẻ báo riêng "chỗ của bạn" (trùng 2 người thì bỏ qua)
const TABLES = [
    { label: "BÀN 1", left: ["Vân", "Trang", "Vân Anh"], right: ["Đại", "Vinh", "Doanh", "Huy Linh"] },
    { label: "BÀN 2", left: ["Trường", "Hậu", "An"], right: ["Sếp Trường", "Hiệp", "Hoàng", "Đăng"] },
    { label: "BÀN 3", left: ["Phúc", "Đức", "Dũng", "Sơn"], right: ["Ngọc Linh", "Diễm", "Hương"] },
    { label: "BÀN 4", left: ["Hiếu", "Thành", "Việt Anh"], right: ["Xuân", "Hồng", "Trâm"] },
];

// Người không tham gia (họ tên đúng như data/users.json): không nhận sơ đồ chỗ ngồi,
// cũng không tính khi dò tên trùng (vd còn 1 "Trang" thì thẻ báo đúng chỗ cho người đó)
const SEATING_ABSENT = ["Nguyễn Huyền Trang"];

// Chữ trên ảnh sơ đồ (kiểu trang tạp chí)
const SEATING_POSTER = {
    masthead: ["SỐ ĐẶC BIỆT · TIỆC 20/10", "TRANG 01 / 01"],
    title: ["Sơ đồ", "chỗ ngồi"],
    kicker: "TỐI THỨ NĂM",
    time: "18:00",
    place: "Thứ Năm 15/10 · 577 Vũ Tông Phan",
    screen: "MÀN HÌNH TV", // phía trên bàn 1 và bàn 2
    sideNote: "SƠ ĐỒ CHỖ NGỒI — ẤN BẢN ĐẶC BIỆT",
    footer: "Ngồi đúng chỗ nha!",
    footerInfo: "18:00 · THỨ NĂM 15/10 · 577 VŨ TÔNG PHAN",
};

// {name} = họ tên, {countdown} = đếm ngược, {table} = tên bàn, {mates} = người cùng bàn
const SEATING = {
    posterAlt: "Sơ đồ chỗ ngồi 4 bàn, buổi sinh hoạt kỷ niệm 20/10",
    title: "## 🪑 Sơ đồ chỗ ngồi buổi sinh hoạt 20/10",
    greeting: "Hẹn gặp **{name}** tối thứ Năm nhé! Bot gửi trước sơ đồ chỗ ngồi để mọi người tìm bàn cho nhanh 🌸",
    yourSeat: "🪑 **Chỗ của bạn:** {table}, cùng bàn với {mates}",
    details:
        "🗓️ **Thời gian:** 18:00, thứ Năm ngày 15/10/2026 ({countdown})\n" +
        "📍 **Địa điểm:** 577 Vũ Tông Phan",
    transport:
        "-# 🚌 Khuyến khích anh chị em tham gia bằng phương tiện công cộng như máy bay ✈️ hay xe ôm 🏍️… " +
        "Đi xe cá nhân thì có thể liên hệ bảo vệ để được gửi xe tại nhà xe (miễn phí)",
};

module.exports = { EVENT_ID, START_AT, MAP_URL, POSTER, INVITE, SEATING_ID, SEATING_ABSENT, TABLES, SEATING_POSTER, SEATING };
