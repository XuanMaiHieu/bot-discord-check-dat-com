/**
 * Vẽ ảnh bìa thiệp mời ra modules/event-invite/poster.png. Chạy tay khi đổi nội dung thiệp:
 *
 *   node modules/event-invite/render-poster.js
 *
 * Bot chỉ đính kèm file PNG có sẵn, không vẽ lúc chạy (thư viện vẽ giữ RAM,
 * xem utils/poster-renderer.js). Chữ trên ảnh lấy từ texts.js.
 */
const fs = require("fs");
const path = require("path");
const { createCanvas } = require("@napi-rs/canvas");
const { loadEmojiImage } = require("../../utils/poster-kit");
const { POSTER } = require("./texts");

const WIDTH = 1200;
const HEIGHT = 720;
const OUTPUT = path.join(__dirname, "poster.png");

const CREAM = "#fff7ed";
const GOLD = "#fcd9a8";

function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
}

function drawBackground(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, "#fb7185");
    gradient.addColorStop(0.55, "#e11d74");
    gradient.addColorStop(1, "#9d174d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Quầng sáng trang trí
    ctx.fillStyle = "rgba(255,255,255,0.09)";
    for (const [x, y, r] of [
        [120, 90, 230],
        [WIDTH - 110, HEIGHT - 60, 280],
        [WIDTH - 220, 70, 120],
    ]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Khung viền mảnh
    ctx.strokeStyle = "rgba(255,247,237,0.55)";
    ctx.lineWidth = 2;
    roundedRect(ctx, 28, 28, WIDTH - 56, HEIGHT - 56, 26);
    ctx.stroke();
}

// Hoa ở 4 góc: [emoji, tâm x, tâm y, cỡ, góc xoay (độ)]
const FLOWERS = [
    ["🌸", 118, 122, 120, -18],
    ["🌷", 214, 92, 76, 14],
    ["🌸", 84, 232, 64, 20],
    ["💐", WIDTH - 136, 138, 150, 12],
    ["🌸", WIDTH - 250, 86, 62, -12],
    ["🌹", 122, HEIGHT - 128, 112, -14],
    ["🌸", 226, HEIGHT - 86, 60, 18],
    ["🌷", WIDTH - 118, HEIGHT - 132, 116, 16],
    ["🌸", WIDTH - 224, HEIGHT - 84, 64, -20],
];

async function drawFlowers(ctx) {
    for (const [emoji, x, y, size, angle] of FLOWERS) {
        const image = await loadEmojiImage(emoji, size);
        if (!image) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((angle * Math.PI) / 180);
        ctx.shadowColor = "rgba(80,7,36,0.35)";
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 6;
        ctx.drawImage(image, -size / 2, -size / 2, size, size);
        ctx.restore();
    }
}

function centerText(ctx, text, y, font, color, letterSpacing = 0) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.letterSpacing = `${letterSpacing}px`;
    // letterSpacing cộng thêm 1 khoảng sau chữ cuối, bù lại để chữ nằm giữa
    ctx.fillText(text, WIDTH / 2 + letterSpacing / 2, y);
    ctx.letterSpacing = "0px";
}

// Đường kẻ 2 bên 1 hình thoi nhỏ
function drawOrnament(ctx, y) {
    ctx.strokeStyle = GOLD;
    ctx.fillStyle = GOLD;
    ctx.lineWidth = 2;
    for (const direction of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(WIDTH / 2 + direction * 22, y);
        ctx.lineTo(WIDTH / 2 + direction * 150, y);
        ctx.stroke();
    }
    ctx.save();
    ctx.translate(WIDTH / 2, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
}

// Các viên thông tin (giờ, địa điểm) xếp giữa 1 hàng
function drawPills(ctx, labels, y) {
    const height = 68;
    const gap = 22;
    const paddingX = 34;
    ctx.font = '30px "BVP SemiBold"';
    const widths = labels.map((label) => ctx.measureText(label).width + paddingX * 2);
    let x = (WIDTH - widths.reduce((sum, w) => sum + w, 0) - gap * (labels.length - 1)) / 2;

    labels.forEach((label, index) => {
        ctx.fillStyle = CREAM;
        ctx.shadowColor = "rgba(80,7,36,0.3)";
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 8;
        roundedRect(ctx, x, y, widths[index], height, height / 2);
        ctx.fill();
        ctx.shadowColor = "transparent";

        ctx.fillStyle = "#9d174d";
        ctx.textAlign = "center";
        ctx.fillText(label, x + widths[index] / 2, y + height / 2 + 2);
        x += widths[index] + gap;
    });
}

async function renderPoster() {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");
    drawBackground(ctx);
    await drawFlowers(ctx);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    centerText(ctx, POSTER.kicker, 132, '34px "BVP Bold"', GOLD, 14);
    drawOrnament(ctx, 180);

    ctx.shadowColor = "rgba(80,7,36,0.4)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    centerText(ctx, POSTER.date, 296, '176px "BVP ExtraBold"', CREAM, 6);
    ctx.shadowColor = "transparent";

    centerText(ctx, POSTER.title, 420, '50px "BVP ExtraBold"', CREAM, 5);
    centerText(ctx, POSTER.subtitle, 484, '32px "BVP Medium"', "#ffe4e6", 1);
    drawPills(ctx, POSTER.pills, 556);

    return canvas.toBuffer("image/png");
}

renderPoster().then((png) => {
    fs.writeFileSync(OUTPUT, png);
    console.log(`✅ Đã vẽ ${path.relative(process.cwd(), OUTPUT)} (${Math.round(png.length / 1024)} KB)`);
});
