// Toàn bộ câu chữ của module nhắc uống nước, sửa chữ ở đây

const DROPS = 8; // số giọt trên thanh tiến độ

// 1250 -> "1.250"
const formatMl = (ml) => String(ml).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
// 2000 -> "2L", 1500 -> "1,5L", 250 -> "250ml"
const formatVolume = (ml) => (ml >= 1000 ? `${ml / 1000}L`.replace(".", ",") : `${ml}ml`);

// Tin nhắc: mỗi lần bốc ngẫu nhiên 1 câu
const REMINDERS = [
    "💧 Uống nước đi bro, thận nhờ bot nhắn đấy",
    "💧 Ting ting! Cốc nước đang nhìn bạn đầy chờ mong",
    "💧 Da đẹp, đầu tỉnh, deadline trôi. Tất cả bắt đầu từ 1 cốc nước",
    "💧 Nhắc nhẹ: bạn là 70% nước, đừng để tụt pin",
    "💧 Đứng dậy, vươn vai, rót cốc nước. 30 giây thôi",
    "💧 Khát là đã hơi muộn rồi đó, uống trước đi",
    "💧 Cốc nước này bot mời, bạn chỉ cần uống",
    "💧 Code chạy bằng cafe, người chạy bằng nước. Nạp đi",
];

// Câu hiện sau khi bấm "Đã uống"
const PRAISES = ["Ngoan! 💙", "Thận cảm ơn bạn 🙏", "+1 cốc, bot tự hào ghê", "Ực ực ực ✅", "Tuyệt vời, giữ phong độ nha 💪"];

const BUTTONS = {
    drink: "Đã uống",
    snooze: "Hoãn 30'",
    off: "Tắt hôm nay",
    resume: "Bật lại",
    subscribe: "Đăng ký",
    unsubscribe: "Tắt nhắc",
    decline: "Không, cảm ơn",
};

const REMINDER = {
    today: "Hôm nay: {ml}/{goal} ml ({cups} lần uống)",
    snoozed: "⏰ Oke, 30 phút nữa bot nhắc lại.",
    off: "🔕 Hôm nay bot im lặng. Mai gặp lại nha.",
    resumed: "🔔 Bật lại rồi, bot nhắc tiếp theo lịch nha.",
    tooMany: "Hôm nay đủ nhiều rồi đó, uống từ từ thôi 😅",
};

// Tổng kết cuối ngày, theo ml so với mục tiêu của từng người
function summaryText({ ml, cups, goalMl }) {
    const head = `## 💧 Tổng kết hôm nay: ${formatMl(ml)}/${formatMl(goalMl)} ml (${cups} lần uống)`;
    if (ml === 0) return `${head}\n🌵 Hôm nay 0ml (hoặc bạn uống mà quên bấm). Mai bấm 💧 cho bot vui nha.`;
    if (ml >= goalMl) return `${head}\n🏆 Đạt chỉ tiêu! Thận bạn đang vỗ tay 👏`;
    if (ml * 2 >= goalMl) return `${head}\n👍 Gần tới rồi, mai cố thêm chút nha.`;
    return `${head}\n🥲 Hơi ít nha, mai bot nhắc nhiệt tình hơn.`;
}

const SETTINGS = {
    title: "## 💧 Nhắc uống nước",
    on: "✅ **Đang bật** · nhắc mỗi **{interval} phút**",
    off: "⏸️ **Đang tắt**",
    offToday: "🔕 Hôm nay đang tắt, mai tự nhắc lại",
    schedule: "-# Ngày làm việc, 8:30–11:45 và 13:15–17:30 (nghỉ trưa không nhắc). Tin nhắc cũ tự xóa khi có tin mới.",
    intervalPlaceholder: "Nhắc bao lâu 1 lần?",
    intervalLabel: "Mỗi {interval} phút",
    goalPlaceholder: "Mục tiêu mỗi ngày",
    goalLabel: "Mục tiêu {volume} / ngày",
    cupPlaceholder: "Mỗi lần bấm Đã uống là bao nhiêu?",
    cupLabel: "Mỗi lần uống {volume}",
    subscribed: "💧 Đã bật nhắc uống nước. Hẹn bạn ở cốc nước tiếp theo!",
    unsubscribed: "⏸️ Đã tắt nhắc uống nước. Muốn bật lại thì gõ `/uongnuoc`.",
    declined: "Oke, bot không làm phiền nữa. Đổi ý thì gõ `/uongnuoc` nhé.",
};

// Thẻ mời admin gửi cho user đặc thù (/nuoc-moi)
const INVITE = {
    title: "## 💧 Bot biết nhắc uống nước rồi!",
    body:
        "Tính năng mới ra đời từ đề xuất của các quý user trong đợt feedback vừa rồi 🎉\n" +
        "Bot sẽ nhắc bạn uống nước trong giờ làm, bấm **💧 Đã uống** để ghi lại lượng nước (ml), cuối ngày có tổng kết.\n" +
        "Bấm **Đăng ký** để bắt đầu, đổi tần suất hay tắt lúc nào cũng được bằng `/uongnuoc`.",
};

// Thông báo gửi người đã đăng ký khi chuyển sang đếm theo ml (/nuoc-thong-bao)
const ANNOUNCE = {
    title: "## 💧 Nhắc uống nước vừa nâng cấp",
    body:
        "Bot giờ đếm theo **ml** thay vì số cốc, để khớp với cốc / bình của từng người.\n" +
        "Mặc định: mục tiêu **2L** mỗi ngày, mỗi lần bấm **Đã uống** tính **250ml**. Số cốc hôm nay của bạn đã được đổi sang ml.\n" +
        "Chỉnh lại cho đúng cốc / bình của bạn ở 2 menu bên dưới, hoặc bấm **Giữ mặc định**. Sau này đổi bằng `/uongnuoc`.",
    keep: "Giữ mặc định",
};

// Dòng giới thiệu trong thẻ báo cơm 12h, mỗi người thấy tối đa PROMO_DAYS ngày
const PROMO = "💧 **Mới:** bot nhắc uống nước trong giờ làm, đếm lượng nước (ml) giúp bạn";
const PROMO_DAYS = 3;

module.exports = {
    DROPS,
    formatMl,
    formatVolume,
    ANNOUNCE,
    REMINDERS,
    PRAISES,
    BUTTONS,
    REMINDER,
    summaryText,
    SETTINGS,
    INVITE,
    PROMO,
    PROMO_DAYS,
};
