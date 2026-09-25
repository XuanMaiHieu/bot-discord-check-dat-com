/**
 * Ảnh QR "donate" pháo tay, nhại QR chuyển khoản ngân hàng.
 * Chỉ vẽ 1 lần mỗi lần bot chạy rồi giữ trong bộ nhớ (thư viện vẽ giữ RAM sau
 * mỗi lần vẽ, xem utils/poster-renderer.js, nên không vẽ lại liên tục).
 */
const path = require("path");
const QRCode = require("qrcode");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");

const WIDTH = 720;
const HEIGHT = 1020;

const COLORS = {
    bgTop: "#ff8a3d",
    bgBottom: "#ff3d7f",
    card: "#ffffff",
    ink: "#1f2937",
    muted: "#6b7280",
    accent: "#f97316",
    accentDark: "#c2410c", // cam đậm, đủ tương phản cho máy quét
    line: "#fde2cf",
};

let fontsReady = false;
function registerFonts(fontsDir) {
    if (fontsReady) return;
    for (const weight of ["Medium", "Bold", "ExtraBold"]) {
        GlobalFonts.registerFromPath(path.join(fontsDir, `BeVietnamPro-${weight}.ttf`), `Clap ${weight}`);
    }
    fontsReady = true;
}

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

    for (const [r, c] of [[0, 0], [0, count - 7], [count - 7, 0]]) {
        const fx = x + c * cell;
        const fy = y + r * cell;
        // Ô định vị phải đậm màu, màu cam nhạt làm máy quét đọc không ra
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

function drawRow(ctx, y, label, value) {
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.muted;
    ctx.font = "26px 'Clap Medium'";
    ctx.fillText(label, 110, y);
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.ink;
    ctx.font = "28px 'Clap Bold'";
    ctx.fillText(value, WIDTH - 110, y);
}

/**
 * @param {string} url - link trang pháo tay
 * @param {string} fontsDir
 * @returns {Buffer} PNG
 */
function renderClapQr(url, fontsDir) {
    registerFonts(fontsDir);
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bg.addColorStop(0, COLORS.bgTop);
    bg.addColorStop(1, COLORS.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Tiêu đề trên nền cam
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "44px 'Clap ExtraBold'";
    ctx.fillText("PHÁO TAY BANKING", WIDTH / 2, 92);
    ctx.font = "24px 'Clap Medium'";
    ctx.fillText("Chuyển khoản bằng… tiếng vỗ tay", WIDTH / 2, 134);

    // Thẻ trắng
    ctx.fillStyle = COLORS.card;
    roundRect(ctx, 60, 170, WIDTH - 120, HEIGHT - 230, 36);
    ctx.fill();

    const qrSize = 420;
    drawQr(ctx, url, (WIDTH - qrSize) / 2, 250, qrSize);

    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.accent;
    ctx.font = "26px 'Clap Bold'";
    ctx.fillText("Quét để vỗ tay cho admin", WIDTH / 2, 725);

    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(100, 760);
    ctx.lineTo(WIDTH - 100, 760);
    ctx.stroke();
    ctx.setLineDash([]);

    drawRow(ctx, 815, "Người nhận", "MAI XUÂN HIẾU");
    drawRow(ctx, 868, "Số tiền", "1 tràng pháo tay");
    drawRow(ctx, 921, "Nội dung", "bot xịn quá");

    return canvas.toBuffer("image/png");
}

module.exports = { renderClapQr };
