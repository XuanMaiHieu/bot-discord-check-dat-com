// Toàn bộ câu chữ của module feedback (đã duyệt với admin), sửa chữ ở đây

const INVITE = {
    title: "## 👋 Yoh! what's up? Hôm nay bro thế nào?",
    // Câu chúc theo dịp, hết dịp thì để "" là ẩn
    greeting: "🥮🏮 Chúc quý user Tết Trung thu vui vẻ, bánh nướng bánh dẻo đầy đủ, feedback cũng đầy đủ luôn nha!",
    intro: 'Sau gần hoặc hơn 1 tuần quý user mình sử dụng bot, hãy gửi tới admin những phản hồi "TÍCH CỰC" về bot nhé!',
    ratingQuestion: "**Bạn chấm bot mấy điểm?**",
    featuresQuestion: "**Bạn hay xem gì nhất?**",
    featuresPlaceholder: "Chọn (được nhiều mục)…",
    writeButton: "Viết góp ý & đề xuất",
    snoozeButton: "Để sau",
    anonymous:
        "-# 🤫 Xin lưu ý tất cả là ẩn danh. Với phương châm luôn luôn lắng nghe, lâu lâu mới hiểu. " +
        "Mọi phản hồi của bạn là phương tiện để chúng tôi xem và không làm gì cả.",
    testBadge: "-# 🧪 THẺ TEST · chỉ admin thấy, không tính vào đợt thật",
};

// 5 mức điểm: emoji trên nút + câu phản hồi khi bấm
const RATINGS = {
    1: { emoji: "😭", reply: "Chắc không? - tý về gặp nhau ở nhà xe 😡" },
    2: { emoji: "😕", reply: "Không khác 1 là mấy, tý về gặp nhau ở cổng nghe 😠" },
    3: { emoji: "😐", reply: "Gụt admin sẽ liên hệ bạn sớm 📞" },
    4: { emoji: "🙂", reply: "Gần hoàn hảo! Còn 1 điểm kia bạn giữ làm gì vậy? 🤔" },
    5: { emoji: "😍", reply: "Yêu thí! Xứng đáng 10 người yêu ❤️" },
};

// Nút "Để sau": câu theo số lần né, từ lần thứ 6 lặp lại câu cuối
const SNOOZE_REPLIES = [
    "hmm chắc fen đang bận, oke gặp lại sau",
    "Lần trước bận rồi lần này bận nữa à?",
    "Cũng đã gần 3 năm mà me vẫn nhớ U nhiều lắm, gửi feedback đê",
    "Feedback là 1 cái nút bạn có thể nhấn vào và ... thử là biết",
    "Lần cuối đi bên nhau, cay đắng như không đau...",
];

// Menu "Bạn hay xem gì nhất?"
const FEATURES = [
    { value: "lunch_card", label: "Thẻ báo cơm 12h", emoji: "🍱" },
    { value: "standup_gif", label: "GIF đứng dậy", emoji: "🕺" },
    { value: "meal_week", label: "Xem cả tuần", emoji: "📅" },
    { value: "abcom", label: "/abcom", emoji: "🔎" },
    { value: "gold", label: "Giá vàng", emoji: "💰" },
    { value: "football", label: "Lịch bóng đá", emoji: "⚽" },
    { value: "just_eat", label: "Chỉ đọc món rồi đi ăn", emoji: "🤷" },
];

// Form góp ý (Discord giới hạn tiêu đề form / tên ô 45 ký tự, mô tả 100 ký tự)
const FORM = {
    title: "Góp ý & đề xuất cho bot 💌",
    ratingLabel: "Bạn chấm bot mấy điểm?",
    ratingPlaceholder: "Chọn điểm…",
    liked: { label: "💚 Bạn thích gì ở bot?", placeholder: "Vd: GIF 12h làm mình cười cả buổi chiều…" },
    fix: { label: "🔧 Có gì làm bạn khó chịu / cần sửa?", placeholder: "Vd: tin nhắn nhiều quá… (admin chịu được)" },
    idea: {
        label: "💡 Đề xuất ý tưởng",
        description: "Đề xuất thôi, làm hay không là do admin hehe",
        placeholder: "Vd: báo thời tiết, nhắc uống nước…",
    },
    maxLength: 1000,
    received: "💌 Đã nhận góp ý, admin sẽ… xem 👀",
    empty: "Form trống trơn luôn à? Thôi cũng được, điểm của bạn đã được ghi nhận rồi 😌",
};

// Hoạt hình trước khi hiện thẻ cảm ơn (mỗi khung là 1 lần sửa tin)
const LAUNCH_FRAMES = ["# 🚀\nĐang phóng feedback lên admin…", "# 💥", "# 🎆 🎇 🎆"];

const THANKS = {
    title: "## 🎉 Cảm ơn bro! Admin đã nhận được tín hiệu",
    featuresIntro: "🎁 Nhân tiện, bot còn mấy món có thể bạn chưa biết:",
    features: [
        { key: "meal_week", title: "📅 Thực đơn cả tuần", text: "Xem hết món T2–T6 của bạn, khỏi mở sheet" },
        { key: "gold", title: "💰 Giá vàng hôm nay", text: "Phú Quý / BTMC, bấm là có giá mới nhất" },
        { key: "football", title: "⚽ Lịch bóng đá trong tuần", text: "Trận nào đáng thức khuya, bot lọc sẵn rồi" },
    ],
    seeButton: "Xem ngay",
    commandsHint: "-# Hoặc gõ /abcom · /giavang · /fbdate bất cứ lúc nào",
    donate: "### Donate (quẹt đi, quẹt đi)",
};

// GIF pháo hoa đầu thẻ cảm ơn (bốc ngẫu nhiên 1)
const FIREWORK_GIFS = [
    "https://media.giphy.com/media/26tOZ42Mg6pbTUPHW/giphy.gif", // pháo hoa
    "https://media.giphy.com/media/g9582DNuQppxC/giphy.gif", // Leo DiCaprio nâng ly
    "https://media.giphy.com/media/5jT0jaNDsM6Ik7X9yq/giphy.gif", // confetti
];

// Dòng nhắc nợ trong thẻ báo cơm 12h, theo số lần đã nhắc. Câu cuối là lần nhắc
// cuối cùng, sau đó không nhắc nữa
const NAGS = [
    "📝 Bạn còn nợ admin 1 feedback. Không gấp, nhưng admin đang nhìn 👀",
    "📝 Món hôm nay ngon đấy. Feedback của bạn thì chưa thấy đâu 🙂",
    "📝 Bot báo cơm cho bạn mỗi ngày. Bạn feedback cho bot 0 lần. Công bằng không?",
    "📝 Admin bắt đầu buồn. Một nút bấm thôi mà 🥺",
    "😢 Bot bỏ cuộc rồi. Nút feedback vẫn ở đây nếu bạn đổi ý.",
];
const NAG_BUTTON = "Feedback ngay";

const CLOSED = "Đợt feedback này đã đóng, cảm ơn bạn 🙏";

module.exports = {
    INVITE,
    RATINGS,
    SNOOZE_REPLIES,
    FEATURES,
    FORM,
    LAUNCH_FRAMES,
    THANKS,
    FIREWORK_GIFS,
    NAGS,
    NAG_BUTTON,
    CLOSED,
};
