/**
 * Đồ nghề chung để vẽ ảnh (poster báo cơm, bảng giá vàng / xăng):
 * font Be Vietnam Pro (SIL OFL, xem assets/fonts/OFL.txt) đăng ký với tên
 * "BVP <độ đậm>", emoji Twemoji (CC-BY 4.0) tải từ CDN jsDelivr.
 * Chỉ dùng trong tiến trình con vẽ ảnh (xem poster-renderer.js).
 */
const path = require("path");
const { GlobalFonts, Image } = require("@napi-rs/canvas");

const FONT_DIR = path.join(__dirname, "../assets/fonts");
for (const weight of ["ExtraBold", "Bold", "SemiBold", "Medium"]) {
    GlobalFonts.registerFromPath(path.join(FONT_DIR, `BeVietnamPro-${weight}.ttf`), `BVP ${weight}`);
}

const TWEMOJI_BASE_URL = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg";
const EMOJI_FETCH_TIMEOUT_MS = 5000;
const emojiSvgCache = new Map();

// "🍖" -> "1f356" (tên file Twemoji bỏ ký tự biến thể FE0F)
function emojiCodepoints(emoji) {
    return [...emoji]
        .map((ch) => ch.codePointAt(0).toString(16))
        .filter((hex) => hex !== "fe0f")
        .join("-");
}

async function fetchEmojiSvg(emoji) {
    const code = emojiCodepoints(emoji);
    if (emojiSvgCache.has(code)) return emojiSvgCache.get(code);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EMOJI_FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(`${TWEMOJI_BASE_URL}/${code}.svg`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const svg = Buffer.from(await response.arrayBuffer());
        emojiSvgCache.set(code, svg);
        return svg;
    } finally {
        clearTimeout(timer);
    }
}

// Ảnh emoji ở đúng kích thước cần vẽ. SVG phải đặt kích thước TRƯỚC khi nạp,
// nếu không sẽ bị vẽ ở 36px rồi phóng to -> nhòe. Lỗi mạng -> null (bỏ qua emoji).
async function loadEmojiImage(emoji, size) {
    try {
        const svg = await fetchEmojiSvg(emoji);
        const image = new Image();
        image.width = size;
        image.height = size;
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
            image.src = svg;
        });
        return image;
    } catch (error) {
        console.log(`⚠️ Không tải được emoji ${emoji} cho ảnh: ${error.message}`);
        return null;
    }
}

// Cắt chữ cho vừa chiều rộng (font đang đặt trên ctx), thêm "…"
function truncateToWidth(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let result = text;
    while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
        result = result.slice(0, -1);
    }
    return `${result.trimEnd()}…`;
}

module.exports = { loadEmojiImage, truncateToWidth };
