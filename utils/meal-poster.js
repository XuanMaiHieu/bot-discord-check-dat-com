/**
 * Vẽ ảnh bìa (poster) cho thẻ báo cơm 12h: nền màu theo thứ, tên món cỡ lớn,
 * emoji món, dải "Ngày mai". Font và emoji: xem poster-kit.js.
 */
const { createCanvas } = require("@napi-rs/canvas");
const { WEEKDAY_LONG, WEEKDAY_SHORT, formatDayMonth, isWeekend } = require("./workdays");
const { isEmptyMeal } = require("./meal-sheet");
const { getDishEmoji } = require("./dish-emoji");
const { loadEmojiImage, truncateToWidth } = require("./poster-kit");

const WIDTH = 1200;
const HEIGHT = 520;
const PADDING_LEFT = 64;
const DISH_MAX_WIDTH = 800; // chừa chỗ cho emoji bên phải
const FOOTER_HEIGHT = 86;

// Nền gradient theo thứ: [màu sáng, màu tối] - cùng tông với màu viền thẻ
const WEEKDAY_GRADIENTS = [
    ["#94a3b8", "#475569"], // CN
    ["#3b82f6", "#1e40af"], // T2
    ["#22c55e", "#15803d"], // T3
    ["#eab308", "#a16207"], // T4
    ["#f97316", "#c2410c"], // T5
    ["#ec4899", "#be185d"], // T6
    ["#8b5cf6", "#6d28d9"], // T7 (làm bù)
];

// Chia chữ theo từ cho vừa `maxWidth` với font đang đặt trên ctx.
// Một từ dài hơn maxWidth vẫn nằm nguyên trên 1 dòng (nơi gọi tự cắt bớt).
function wrapWords(ctx, text, maxWidth) {
    const lines = [];
    let current = "";
    for (const word of text.split(/\s+/)) {
        const candidate = current ? `${current} ${word}` : word;
        if (!current || ctx.measureText(candidate).width <= maxWidth) {
            current = candidate;
        } else {
            lines.push(current);
            current = word;
        }
    }
    if (current) lines.push(current);
    return lines;
}

// Chia chữ thành tối đa `maxLines` dòng vừa `maxWidth`, tự giảm cỡ chữ.
// Trả về null nếu không vừa kể cả ở cỡ nhỏ nhất.
function fitLines(ctx, text, { maxWidth, maxLines, maxSize, minSize, font }) {
    for (let size = maxSize; size >= minSize; size -= 4) {
        ctx.font = `${size}px "${font}"`;
        const lines = wrapWords(ctx, text, maxWidth);

        if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) {
            return { size, lines };
        }
    }
    return null;
}

function drawBackground(ctx, date) {
    const [light, dark] = WEEKDAY_GRADIENTS[date.getDay()];
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, light);
    gradient.addColorStop(1, dark);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Vòng tròn trang trí
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.arc(WIDTH - 170, 170, 300, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(WIDTH - 60, HEIGHT + 40, 180, 0, Math.PI * 2);
    ctx.fill();
}

function drawHeader(ctx, date) {
    const label = "CƠM TRƯA HÔM NAY";
    ctx.font = '26px "BVP Bold"';
    ctx.textBaseline = "middle";
    const labelWidth = ctx.measureText(label).width;

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.roundRect(PADDING_LEFT, 50, labelWidth + 40, 50, 25);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(label, PADDING_LEFT + 20, 76);

    const dayText =
        `${WEEKDAY_LONG[date.getDay()].toLocaleUpperCase("vi-VN")} · ${formatDayMonth(date)}` +
        (isWeekend(date) ? " · LÀM BÙ" : "");
    ctx.font = '26px "BVP SemiBold"';
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(dayText, PADDING_LEFT + labelWidth + 64, 76);
}

function drawDish(ctx, dish) {
    // 1 dòng tối đa 104px; cần 2 dòng thì tối đa 80px để không đè tên người.
    // Khối chữ căn giữa theo chiều dọc trong vùng 118..350
    const font = "BVP ExtraBold";
    let fit =
        fitLines(ctx, dish, { maxWidth: DISH_MAX_WIDTH, maxLines: 1, maxSize: 104, minSize: 72, font }) ||
        fitLines(ctx, dish, { maxWidth: DISH_MAX_WIDTH, maxLines: 2, maxSize: 80, minSize: 44, font });

    // Tên món quá dài kể cả 2 dòng cỡ nhỏ nhất: xếp 2 dòng, dòng 2 cắt bớt
    if (!fit) {
        ctx.font = `44px "${font}"`;
        const [first, ...rest] = wrapWords(ctx, dish, DISH_MAX_WIDTH);
        const lines = [first, ...(rest.length ? [rest.join(" ")] : [])];
        fit = { size: 44, lines: lines.map((line) => truncateToWidth(ctx, line, DISH_MAX_WIDTH)) };
    }

    ctx.font = `${fit.size}px "${font}"`;
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    const lineHeight = fit.size * 1.15;
    const blockHeight = fit.size + (fit.lines.length - 1) * lineHeight;
    const firstBaseline = 118 + (232 - blockHeight) / 2 + fit.size * 0.92;
    fit.lines.forEach((line, i) => {
        ctx.fillText(line, PADDING_LEFT - 2, firstBaseline + i * lineHeight);
    });

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
}

function drawName(ctx, name) {
    ctx.font = '32px "BVP Medium"';
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.textBaseline = "middle";
    ctx.fillText(truncateToWidth(ctx, name, DISH_MAX_WIDTH), PADDING_LEFT, 388);
}

async function drawDishEmoji(ctx, dish) {
    const image = await loadEmojiImage(getDishEmoji(dish), 520);
    if (!image) return;

    ctx.save();
    ctx.translate(WIDTH - 190, 190);
    ctx.rotate(-0.12);
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 12;
    ctx.drawImage(image, -130, -130, 260, 260);
    ctx.restore();
}

async function drawTomorrow(ctx, tomorrow) {
    const centerY = HEIGHT - FOOTER_HEIGHT / 2;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(0, HEIGHT - FOOTER_HEIGHT, WIDTH, FOOTER_HEIGHT);

    const label = `NGÀY MAI · ${WEEKDAY_SHORT[tomorrow.date.getDay()]} ${formatDayMonth(tomorrow.date)}`;
    ctx.font = '26px "BVP Bold"';
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.textBaseline = "middle";
    ctx.fillText(label, PADDING_LEFT, centerY);

    let x = PADDING_LEFT + ctx.measureText(label).width + 30;
    const empty = isEmptyMeal(tomorrow.value);
    const icon = await loadEmojiImage(empty ? "⚪" : getDishEmoji(tomorrow.value), 80);
    if (icon) {
        ctx.drawImage(icon, x, centerY - 20, 40, 40);
        x += 56;
    }

    const text = empty
        ? "Chưa đặt cơm — nhớ đặt nhé!"
        : String(tomorrow.value).replace(/\s+/g, " ").trim();
    ctx.font = '30px "BVP Bold"';
    ctx.fillStyle = "#fff";
    ctx.fillText(truncateToWidth(ctx, text, WIDTH - x - 40), x, centerY + 1);
}

/**
 * Vẽ poster báo cơm, trả về Buffer PNG.
 * @param {object} p
 * @param {string} p.dish - Món hôm nay
 * @param {string} p.name - Tên người đặt
 * @param {Date} p.date - Ngày hôm nay
 * @param {{date: Date, value: string}|null} p.tomorrow - null = không vẽ dải Ngày mai
 */
async function renderMealPoster({ dish, name, date, tomorrow = null }) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");
    const dishText = String(dish ?? "").replace(/\s+/g, " ").trim();

    drawBackground(ctx, date);
    await drawDishEmoji(ctx, dishText);
    drawHeader(ctx, date);
    drawDish(ctx, dishText);
    drawName(ctx, String(name ?? "").trim());
    if (tomorrow) await drawTomorrow(ctx, tomorrow);

    return canvas.encode("png");
}

module.exports = {
    renderMealPoster,
};
