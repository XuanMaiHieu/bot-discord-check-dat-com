// Toàn bộ câu chữ của module nhắc uống nước, sửa chữ ở đây

const GOAL_CUPS = 8; // mục tiêu mỗi ngày, cốc 250ml (~2 lít)

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
    today: "Hôm nay: {cups}/{goal} cốc",
    snoozed: "⏰ Oke, 30 phút nữa bot nhắc lại.",
    off: "🔕 Hôm nay bot im lặng. Mai gặp lại nha.",
    resumed: "🔔 Bật lại rồi, bot nhắc tiếp theo lịch nha.",
    tooMany: "Hôm nay đủ nhiều rồi đó, uống từ từ thôi 😅",
};

// Tổng kết cuối ngày, theo số cốc
function summaryText(cups) {
    const head = `## 💧 Tổng kết hôm nay: ${cups}/${GOAL_CUPS} cốc`;
    if (cups === 0) return `${head}\n🌵 Hôm nay 0 cốc (hoặc bạn uống mà quên bấm). Mai bấm 💧 cho bot vui nha.`;
    if (cups >= GOAL_CUPS) return `${head}\n🏆 Đạt chỉ tiêu! Thận bạn đang vỗ tay 👏`;
    if (cups * 2 >= GOAL_CUPS) return `${head}\n👍 Gần tới rồi, mai cố thêm chút nha.`;
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
    subscribed: "💧 Đã bật nhắc uống nước. Hẹn bạn ở cốc nước tiếp theo!",
    unsubscribed: "⏸️ Đã tắt nhắc uống nước. Muốn bật lại thì gõ `/uongnuoc`.",
    declined: "Oke, bot không làm phiền nữa. Đổi ý thì gõ `/uongnuoc` nhé.",
};

// Thẻ mời admin gửi cho user đặc thù (/nuoc-moi)
const INVITE = {
    title: "## 💧 Bot biết nhắc uống nước rồi!",
    body:
        "Tính năng mới ra đời từ đề xuất của các quý user trong đợt feedback vừa rồi 🎉\n" +
        "Bot sẽ nhắc bạn uống nước trong giờ làm, bấm **💧 Đã uống** để đếm cốc, cuối ngày có tổng kết.\n" +
        "Bấm **Đăng ký** để bắt đầu, đổi tần suất hay tắt lúc nào cũng được bằng `/uongnuoc`.",
};

// Dòng giới thiệu trong thẻ báo cơm 12h, mỗi người thấy tối đa PROMO_DAYS ngày
const PROMO = "💧 **Mới:** bot nhắc uống nước trong giờ làm, đếm cốc giúp bạn";
const PROMO_DAYS = 3;

module.exports = { GOAL_CUPS, REMINDERS, PRAISES, BUTTONS, REMINDER, summaryText, SETTINGS, INVITE, PROMO, PROMO_DAYS };
