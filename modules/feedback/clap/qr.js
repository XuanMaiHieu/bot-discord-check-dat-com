/**
 * Ảnh QR "donate" trên thẻ cảm ơn. Cố ý không có chữ nào: người dùng không biết
 * quét ra chuyển tiền hay vỗ tay, quét rồi mới biết.
 * Chỉ vẽ 1 lần mỗi lần bot chạy rồi giữ trong bộ nhớ (thư viện vẽ giữ RAM sau
 * mỗi lần vẽ, xem utils/poster-renderer.js, nên không vẽ lại liên tục).
 */
const QRCode = require("qrcode");
const { createCanvas } = require("@napi-rs/canvas");

const SIZE = 640;
const CARD_MARGIN = 56;
const QR_SIZE = 420;

const COLORS = {
    bgTop: "#ff8a3d",
    bgBottom: "#ff3d7f",
    card: "#ffffff",
    ink: "#1f2937",
    accentDark: "#c2410c", // cam đậm, đủ tương phản cho máy quét
};

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// Ô vuông QR bo góc nhẹ; 3 ô định vị vẽ riêng cho đẹp
function drawQr(ctx, url, x, y, size) {
    const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
    const count = qr.modules.size;
    const cell = size / count;
    const isFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= count - 7) || (r >= count - 7 && c < 7);

    ctx.fillStyle = COLORS.ink;
    for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
            if (!qr.modules.get(r, c) || isFinder(r, c)) continue;
            roundRect(ctx, x + c * cell + 0.5, y + r * cell + 0.5, cell - 1, cell - 1, cell * 0.3);
            ctx.fill();
        }
    }

    // Ô định vị phải đậm màu, màu cam nhạt làm máy quét đọc không ra
    for (const [r, c] of [[0, 0], [0, count - 7], [count - 7, 0]]) {
        const fx = x + c * cell;
        const fy = y + r * cell;
        ctx.fillStyle = COLORS.ink;
        roundRect(ctx, fx, fy, cell * 7, cell * 7, cell * 1.6);
        ctx.fill();
        ctx.fillStyle = COLORS.card;
        roundRect(ctx, fx + cell, fy + cell, cell * 5, cell * 5, cell * 1.1);
        ctx.fill();
        ctx.fillStyle = COLORS.accentDark;
        roundRect(ctx, fx + cell * 2, fy + cell * 2, cell * 3, cell * 3, cell * 0.8);
        ctx.fill();
    }
}

/**
 * @param {string} url - link trang pháo tay
 * @returns {Buffer} PNG
 */
function renderClapQr(url) {
    const canvas = createCanvas(SIZE, SIZE);
    const ctx = canvas.getContext("2d");

    const bg = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    bg.addColorStop(0, COLORS.bgTop);
    bg.addColorStop(1, COLORS.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Thẻ trắng, lề quanh QR đủ rộng cho máy quét
    ctx.fillStyle = COLORS.card;
    roundRect(ctx, CARD_MARGIN, CARD_MARGIN, SIZE - CARD_MARGIN * 2, SIZE - CARD_MARGIN * 2, 36);
    ctx.fill();

    drawQr(ctx, url, (SIZE - QR_SIZE) / 2, (SIZE - QR_SIZE) / 2, QR_SIZE);
    return canvas.toBuffer("image/png");
}

module.exports = { renderClapQr };
