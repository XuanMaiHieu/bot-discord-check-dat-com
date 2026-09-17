/**
 * Chọn emoji theo tên món. Tách riêng (không phụ thuộc discord.js) để tiến trình
 * vẽ poster dùng được mà không phải nạp cả thư viện Discord.
 */

// Emoji theo món: so khớp nguyên từ, CÓ DẤU để phân biệt "cá" với "cà" (cà chua, cà ri).
// Thứ tự quan trọng: quy tắc trên được ưu tiên ("Bò xào rau muống" -> bò, không phải rau).
const DISH_EMOJI_RULES = [
    { emoji: "🍜", words: ["bún", "phở", "miến", "mì", "mỳ", "hủ tiếu", "bánh canh", "cao lầu"] },
    { emoji: "🥣", words: ["cháo", "lẩu", "súp"] },
    { emoji: "🍛", words: ["cơm rang", "cơm chiên", "cà ri"] },
    { emoji: "🦐", words: ["tôm"] },
    { emoji: "🦑", words: ["mực"] },
    { emoji: "🐟", words: ["cá"] },
    { emoji: "🍗", words: ["gà", "ngan", "vịt"] },
    { emoji: "🥩", words: ["bò"] },
    { emoji: "🍖", words: ["sườn", "thịt", "ba chỉ", "lợn", "heo", "giò", "thăn", "nem"] },
    { emoji: "🍳", words: ["trứng"] },
    { emoji: "🥗", words: ["chay", "rau", "đậu", "nấm", "salad"] },
];
const DEFAULT_DISH_EMOJI = "🍱";

const DISH_EMOJI_REGEXES = DISH_EMOJI_RULES.map(({ emoji, words }) => ({
    emoji,
    // \p{L} = chữ cái bất kỳ (kể cả có dấu) -> ranh giới từ đúng với tiếng Việt
    regex: new RegExp(`(?<!\\p{L})(?:${words.join("|")})(?!\\p{L})`, "u"),
}));

function getDishEmoji(dish) {
    const text = String(dish ?? "").normalize("NFC").toLocaleLowerCase("vi-VN");
    return DISH_EMOJI_REGEXES.find(({ regex }) => regex.test(text))?.emoji || DEFAULT_DISH_EMOJI;
}

module.exports = { getDishEmoji };
