/**
 * Vẽ ảnh bảng giá xăng dầu / giá vàng (1200px ngang, cao theo số dòng).
 * Nhận "view" đã định dạng sẵn chữ (xem utils/price-image.js), ở đây chỉ vẽ.
 * Chạy trong tiến trình con (poster-worker.js).
 *
 * change = { dir: "up" | "down" | "same", text: "500" } | null
 */
const { createCanvas } = require("@napi-rs/canvas");
const { loadEmojiImage, truncateToWidth } = require("./poster-kit");

const WIDTH = 1200;
const MARGIN = 40;

const INK = "#1f2937";
const MUTED = "#6b7280";
const CHANGE_COLORS = { up: "#16a34a", down: "#dc2626", same: "#94a3b8" };

function background(ctx, height, [light, dark]) {
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, height);
    gradient.addColorStop(0, light);
    gradient.addColorStop(1, dark);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, height);

    // Vòng tròn trang trí góc phải trên
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.arc(WIDTH - 150, 90, 260, 0, Math.PI * 2);
    ctx.fill();
}

// Nhãn bo tròn, trả về chiều rộng đã vẽ
function pill(ctx, x, y, label, { bg = "rgba(255,255,255,0.22)", color = "#fff", size = 24 } = {}) {
    ctx.font = `${size}px "BVP Bold"`;
    ctx.textBaseline = "middle";
    const width = ctx.measureText(label).width + size * 1.4;
    const height = size * 1.9;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, height / 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(label, x + size * 0.7, y + height / 2 + 1);
    return width;
}

async function bigEmoji(ctx, emoji) {
    const image = await loadEmojiImage(emoji, 360);
    if (!image) return;
    ctx.save();
    ctx.translate(WIDTH - 150, 120);
    ctx.rotate(-0.12);
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(image, -90, -90, 180, 180);
    ctx.restore();
}

/**
 * Phần đầu: nhãn + cảnh báo, tên lớn, dòng giờ cập nhật. Trả về y kết thúc.
 */
async function header(ctx, { label, title, subtitle, emoji, warnings = [] }) {
    await bigEmoji(ctx, emoji);

    let x = MARGIN + 8;
    x += pill(ctx, x, 36, label) + 12;
    for (const warning of warnings) {
        x += pill(ctx, x, 36, warning, { bg: "#fde047", color: "#713f12", size: 22 }) + 12;
    }

    ctx.fillStyle = "#fff";
    ctx.textBaseline = "alphabetic";
    ctx.font = '64px "BVP ExtraBold"';
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.fillText(truncateToWidth(ctx, title, WIDTH - 360), MARGIN + 6, 160);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.font = '28px "BVP SemiBold"';
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(subtitle, MARGIN + 8, 206);
    return 236;
}

function panel(ctx, x, y, w, h, fill = "#fff") {
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.roundRect(x, y + 6, w, h, 28);
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 28);
    ctx.fill();
}

// Tam giác ▲ / ▼ vẽ bằng hình (font Be Vietnam Pro không có ký tự mũi tên).
// (x, baseline) là góc trái dưới vùng chữ cao `size`
function triangle(ctx, dir, x, baseline, size) {
    const w = size * 0.62;
    const h = size * 0.54;
    const top = baseline - size * 0.36 - h / 2;
    ctx.beginPath();
    if (dir === "up") {
        ctx.moveTo(x, top + h);
        ctx.lineTo(x + w, top + h);
        ctx.lineTo(x + w / 2, top);
    } else {
        ctx.moveTo(x, top);
        ctx.lineTo(x + w, top);
        ctx.lineTo(x + w / 2, top + h);
    }
    ctx.closePath();
    ctx.fill();
    return w;
}

// "▲ 500" màu theo chiều, căn phải tại xRight; không đổi thì "="
function changeText(ctx, change, xRight, y, size = 24) {
    if (!change) return;
    ctx.font = `${size}px "BVP Bold"`;
    ctx.textAlign = "right";
    ctx.fillStyle = CHANGE_COLORS[change.dir];
    if (change.dir === "same") {
        ctx.fillText("=", xRight, y);
    } else {
        ctx.fillText(change.text, xRight, y);
        const textWidth = ctx.measureText(change.text).width;
        triangle(ctx, change.dir, xRight - textWidth - size * 0.3 - size * 0.62, y, size);
    }
    ctx.textAlign = "left";
}

function footer(ctx, y, lines) {
    ctx.textBaseline = "alphabetic";
    lines.forEach((line, i) => {
        ctx.font = i === lines.length - 1 ? '22px "BVP Medium"' : '24px "BVP SemiBold"';
        ctx.fillStyle = i === lines.length - 1 ? "rgba(255,255,255,0.8)" : "#fff";
        ctx.fillText(line, MARGIN + 8, y + i * 36);
    });
}

// ---------------------------------------------------------------------------
// Giá xăng dầu
// ---------------------------------------------------------------------------

const FUEL_ROW_HEIGHT = 100;
const FUEL_COLUMNS = { name: MARGIN + 44, zone1: 850, zone2: WIDTH - MARGIN - 44 };

/**
 * @param {object} view
 * @param {boolean} view.alert - ảnh cho tin "giá vừa điều chỉnh"
 * @param {boolean} view.stale
 * @param {string} view.updatedText - "15:03 · 25/09"
 * @param {string|null} view.comparedText - "24/09"
 * @param {Array<{ icon, title, zone1, zone2, change1, change2 }>} view.rows
 */
async function renderFuelPoster(view) {
    const panelHeight = 76 + view.rows.length * FUEL_ROW_HEIGHT + 16;
    const height = 236 + 16 + panelHeight + 130;
    const canvas = createCanvas(WIDTH, height);
    const ctx = canvas.getContext("2d");

    background(ctx, height, ["#fb923c", "#c2410c"]);
    const top = await header(ctx, {
        label: view.alert ? "VỪA ĐIỀU CHỈNH GIÁ" : "GIÁ BÁN LẺ XĂNG DẦU",
        title: "Petrolimex",
        subtitle: `Cập nhật ${view.updatedText}  ·  đồng/lít`,
        emoji: "⛽",
        warnings: view.stale ? ["ĐANG HIỆN GIÁ CŨ"] : [],
    });

    const panelY = top + 16;
    panel(ctx, MARGIN, panelY, WIDTH - MARGIN * 2, panelHeight);

    // Tiêu đề cột
    ctx.font = '22px "BVP Bold"';
    ctx.fillStyle = MUTED;
    ctx.textBaseline = "alphabetic";
    ctx.fillText("SẢN PHẨM", FUEL_COLUMNS.name, panelY + 50);
    ctx.textAlign = "right";
    ctx.fillText("VÙNG 1", FUEL_COLUMNS.zone1, panelY + 50);
    ctx.fillText("VÙNG 2", FUEL_COLUMNS.zone2, panelY + 50);
    ctx.textAlign = "left";

    const icons = {};
    for (const icon of new Set(view.rows.map((r) => r.icon))) icons[icon] = await loadEmojiImage(icon, 88);

    view.rows.forEach((row, i) => {
        const y = panelY + 76 + i * FUEL_ROW_HEIGHT;
        if (i % 2 === 0) {
            ctx.fillStyle = "#fff7ed";
            ctx.fillRect(MARGIN + 16, y, WIDTH - MARGIN * 2 - 32, FUEL_ROW_HEIGHT);
        }
        if (icons[row.icon]) ctx.drawImage(icons[row.icon], FUEL_COLUMNS.name, y + 28, 44, 44);

        ctx.font = '32px "BVP Bold"';
        ctx.fillStyle = INK;
        ctx.textBaseline = "middle";
        ctx.fillText(truncateToWidth(ctx, row.title, FUEL_COLUMNS.zone1 - 260 - FUEL_COLUMNS.name), FUEL_COLUMNS.name + 62, y + FUEL_ROW_HEIGHT / 2);

        for (const [column, price, change] of [
            [FUEL_COLUMNS.zone1, row.zone1, row.change1],
            [FUEL_COLUMNS.zone2, row.zone2, row.change2],
        ]) {
            ctx.textBaseline = "alphabetic";
            ctx.textAlign = "right";
            ctx.font = '40px "BVP ExtraBold"';
            ctx.fillStyle = INK;
            ctx.fillText(price, column, y + (change ? 52 : 64));
            ctx.textAlign = "left";
            changeText(ctx, change, column, y + 84, 22);
        }
    });

    footer(ctx, panelY + panelHeight + 56, [
        "Vùng 1: nội thành Hà Nội (và các đô thị lớn)   ·   Vùng 2: nông thôn, miền núi",
        [view.comparedText ? `Tăng / giảm so với kỳ ${view.comparedText}` : null, "nguồn petrolimex.com.vn"].filter(Boolean).join("  ·  "),
    ]);
    return canvas.encode("png");
}

// ---------------------------------------------------------------------------
// Giá vàng
// ---------------------------------------------------------------------------

const GOLD_CARD_HEIGHT = 300;
const GOLD_EXTRA_ROW = 56;

function goldMainCard(ctx, icon, item, x, y, w) {
    panel(ctx, x, y, w, GOLD_CARD_HEIGHT);
    if (icon) ctx.drawImage(icon, x + 32, y + 28, 52, 52);

    ctx.font = '30px "BVP Bold"';
    ctx.fillStyle = INK;
    ctx.textBaseline = "middle";
    ctx.fillText(truncateToWidth(ctx, item.name, w - 130), x + 98, y + 55);

    [["MUA", item.buy, item.buyChange], ["BÁN", item.sell, item.sellChange]].forEach(([label, price, change], i) => {
        const rowY = y + 130 + i * 80;
        ctx.textBaseline = "alphabetic";
        ctx.font = '22px "BVP Bold"';
        ctx.fillStyle = MUTED;
        ctx.fillText(label, x + 34, rowY);
        ctx.font = '44px "BVP ExtraBold"';
        ctx.fillStyle = INK;
        ctx.fillText(price, x + 100, rowY + 4);
        changeText(ctx, change, x + w - 30, rowY, 24);
    });

    ctx.font = '22px "BVP Medium"';
    ctx.fillStyle = MUTED;
    ctx.fillText(`≈ ${item.perTael} triệu/lượng`, x + 34, y + GOLD_CARD_HEIGHT - 26);
}

/**
 * @param {object} view
 * @param {string} view.sourceLabel - "Phú Quý"
 * @param {string} view.site
 * @param {string} view.updatedText
 * @param {string[]} view.warnings
 * @param {Array<{ icon, name, buy, sell, buyChange, sellChange, perTael }>} view.main
 * @param {Array<{ name, buy, sell }>} view.extras
 * @param {string|null} view.comparedText
 */
async function renderGoldPoster(view) {
    const extrasHeight = view.extras.length ? 70 + view.extras.length * GOLD_EXTRA_ROW + 16 : 0;
    const height = 236 + 16 + GOLD_CARD_HEIGHT + (extrasHeight ? 24 + extrasHeight : 0) + 100;
    const canvas = createCanvas(WIDTH, height);
    const ctx = canvas.getContext("2d");

    background(ctx, height, ["#fbbf24", "#b45309"]);
    const top = await header(ctx, {
        label: "GIÁ VÀNG · VNĐ/CHỈ",
        title: view.sourceLabel,
        subtitle: view.updatedText,
        emoji: "💰",
        warnings: view.warnings,
    });

    let y = top + 16;
    const gap = 24;
    const count = Math.max(view.main.length, 1);
    const cardWidth = (WIDTH - MARGIN * 2 - gap * (count - 1)) / count;
    for (const [i, item] of view.main.entries()) {
        const icon = await loadEmojiImage(item.icon, 104);
        goldMainCard(ctx, icon, item, MARGIN + i * (cardWidth + gap), y, cardWidth);
    }
    y += GOLD_CARD_HEIGHT;

    if (view.extras.length) {
        y += 24;
        panel(ctx, MARGIN, y, WIDTH - MARGIN * 2, extrasHeight, "rgba(255,255,255,0.94)");
        const buyX = 880;
        const sellX = WIDTH - MARGIN - 44;
        ctx.font = '22px "BVP Bold"';
        ctx.fillStyle = MUTED;
        ctx.textBaseline = "alphabetic";
        ctx.fillText("LOẠI KHÁC", MARGIN + 44, y + 48);
        ctx.textAlign = "right";
        ctx.fillText("MUA", buyX, y + 48);
        ctx.fillText("BÁN", sellX, y + 48);
        ctx.textAlign = "left";

        view.extras.forEach((item, i) => {
            const rowY = y + 70 + i * GOLD_EXTRA_ROW;
            if (i % 2 === 0) {
                ctx.fillStyle = "#fef3c7";
                ctx.fillRect(MARGIN + 16, rowY, WIDTH - MARGIN * 2 - 32, GOLD_EXTRA_ROW);
            }
            ctx.textBaseline = "middle";
            ctx.font = '26px "BVP SemiBold"';
            ctx.fillStyle = INK;
            ctx.fillText(truncateToWidth(ctx, item.name, buyX - 260 - MARGIN - 44), MARGIN + 44, rowY + GOLD_EXTRA_ROW / 2);
            ctx.font = '28px "BVP Bold"';
            ctx.textAlign = "right";
            ctx.fillText(item.buy, buyX, rowY + GOLD_EXTRA_ROW / 2);
            ctx.fillText(item.sell, sellX, rowY + GOLD_EXTRA_ROW / 2);
            ctx.textAlign = "left";
        });
        y += extrasHeight;
    }

    footer(ctx, y + 60, [
        [view.comparedText ? `Tăng / giảm so với ${view.comparedText}` : null, `nguồn ${view.site}`].filter(Boolean).join("  ·  "),
    ]);
    return canvas.encode("png");
}

module.exports = { renderFuelPoster, renderGoldPoster };
