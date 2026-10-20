/**
 * Vẽ ảnh bìa thiệp mời (poster.png), sơ đồ chỗ ngồi (seating.png) và ảnh thư
 * chúc 20/10 (wish-*.png) trong modules/event-invite/. Chạy tay khi đổi nội dung:
 *
 *   node modules/event-invite/render-poster.js
 *
 * Bot chỉ đính kèm file PNG có sẵn, không vẽ lúc chạy (thư viện vẽ giữ RAM,
 * xem utils/poster-renderer.js). Chữ trên ảnh + chỗ ngồi lấy từ texts.js.
 */
const fs = require("fs");
const path = require("path");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const { loadEmojiImage } = require("../../utils/poster-kit");
const { POSTER, SEATING_POSTER, TABLES, WISH_POSTER, WISH_VOUCHERS, WISH_VOUCHER_FOOTER } = require("./texts");

const WIDTH = 1200;
const HEIGHT = 720;

const CREAM = "#fff7ed";
const GOLD = "#fcd9a8";

function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
}

function drawBackground(ctx, height = HEIGHT) {
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, height);
    gradient.addColorStop(0, "#fb7185");
    gradient.addColorStop(0.55, "#e11d74");
    gradient.addColorStop(1, "#9d174d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, height);

    // Quầng sáng trang trí
    ctx.fillStyle = "rgba(255,255,255,0.09)";
    for (const [x, y, r] of [
        [120, 90, 230],
        [WIDTH - 110, height - 60, 280],
        [WIDTH - 220, 70, 120],
    ]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Khung viền mảnh
    ctx.strokeStyle = "rgba(255,247,237,0.55)";
    ctx.lineWidth = 2;
    roundedRect(ctx, 28, 28, WIDTH - 56, height - 56, 26);
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

async function drawFlowers(ctx, flowers = FLOWERS) {
    for (const [emoji, x, y, size, angle] of flowers) {
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

async function renderInvitePoster() {
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

// ---------------------------------------------------------------------------
// Sơ đồ chỗ ngồi kiểu trang tạp chí: tiêu đề Playfair Display, mỗi bàn 1 khối
// màu với số bàn to; màn hình TV phía trên bàn 1, 2 (bàn 1, 3 bên trái, 2, 4 bên phải)

for (const [file, family] of [
    ["PlayfairDisplay-Black.ttf", "Playfair Black"],
    ["PlayfairDisplay-BlackItalic.ttf", "Playfair Black Italic"],
    ["PlayfairDisplay-BoldItalic.ttf", "Playfair Bold Italic"],
]) {
    GlobalFonts.registerFromPath(path.join(__dirname, "../../assets/fonts", file), family);
}

const MAG = {
    paper: "#f6f2ea",
    ink: "#141414",
    margin: 64,
    columnX: [64, 640],
    tablesTop: 740,
    tableStep: 490, // hàng bàn trên -> hàng bàn dưới
    block: 200, // khối màu số bàn
    blockHeight: 210,
    nameRow: 44,
    nameFont: '33px "Playfair Bold Italic"',
    stagger: 70, // cột phải thấp hơn cột trái 1 chút cho so le
};
const RED = "#e63b2a";
const BLUE = "#2340d6";
const BUTTER = "#f2cf45";
// Theo thứ tự bàn: màu khối, màu phần số lọt trong khối, màu chữ "DÃY TRÁI / PHẢI"
const TABLE_STYLES = [
    { block: RED, knockout: "#fff", label: RED },
    { block: BLUE, knockout: "#fff", label: BLUE },
    { block: MAG.ink, knockout: BUTTER, label: RED },
    { block: BUTTER, knockout: MAG.ink, label: "#b88a00" },
];
const NUMBER_WORDS = ["một", "hai", "ba", "bốn", "năm", "sáu"];

// Chữ giãn cách, căn trái / phải / giữa theo x
function spacedText(ctx, text, x, y, spacing, align = "left") {
    const chars = [...text];
    const width = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width + spacing, -spacing);
    let cursor = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
    ctx.textAlign = "left";
    for (const ch of chars) {
        ctx.fillText(ch, cursor, y);
        cursor += ctx.measureText(ch).width + spacing;
    }
}

// Màn hình TV: khung đen viền mảnh + chân đế, giữa 2 cột bàn
function drawScreen(ctx, y) {
    const width = 520;
    const height = 74;
    const x = (WIDTH - width) / 2;
    ctx.fillStyle = MAG.ink;
    roundedRect(ctx, x, y, width, height, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(246,242,234,0.35)";
    ctx.lineWidth = 1.5;
    roundedRect(ctx, x + 8, y + 8, width - 16, height - 16, 4);
    ctx.stroke();
    ctx.fillRect(WIDTH / 2 - 6, y + height, 12, 16);
    ctx.fillRect(WIDTH / 2 - 60, y + height + 16, 120, 5);

    ctx.fillStyle = MAG.paper;
    ctx.font = '22px "BVP Bold"';
    ctx.textBaseline = "middle";
    spacedText(ctx, SEATING_POSTER.screen, WIDTH / 2, y + height / 2 + 1, 8, "center");
    ctx.textBaseline = "alphabetic";

    // Vạch đỏ 2 bên: hướng màn hình về 2 bàn đầu
    ctx.fillStyle = RED;
    ctx.fillRect(MAG.margin, y + height / 2 - 1.5, x - MAG.margin - 24, 3);
    ctx.fillRect(x + width + 24, y + height / 2 - 1.5, WIDTH - MAG.margin - x - width - 24, 3);
}

function drawMagTable(ctx, table, index, x, y) {
    const style = TABLE_STYLES[index % TABLE_STYLES.length];
    const number = String(index + 1);
    ctx.fillStyle = style.block;
    ctx.fillRect(x, y, MAG.block, MAG.blockHeight);

    // Số bàn to tràn ra ngoài khối, phần nằm trong khối đổi màu
    ctx.font = '300px "Playfair Black"';
    ctx.textAlign = "left";
    const metrics = ctx.measureText(number);
    const numberX = x + 70;
    const numberY = y + MAG.blockHeight + 34 - metrics.actualBoundingBoxDescent;
    ctx.fillStyle = MAG.ink;
    ctx.fillText(number, numberX, numberY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, MAG.block, MAG.blockHeight);
    ctx.clip();
    ctx.fillStyle = style.knockout;
    ctx.fillText(number, numberX, numberY);
    ctx.restore();

    const labelX = Math.max(numberX + metrics.actualBoundingBoxRight + 26, x + MAG.block + 26);
    ctx.fillStyle = MAG.ink;
    ctx.font = '15px "BVP Bold"';
    spacedText(ctx, "BÀN SỐ", labelX, y + 100, 4);
    ctx.font = '50px "Playfair Black Italic"';
    ctx.fillStyle = style.block === BUTTER ? MAG.ink : style.block;
    ctx.fillText(`${NUMBER_WORDS[index] || number}.`, labelX - 2, y + 178);
    ctx.fillStyle = MAG.ink;
    ctx.fillRect(labelX, y + 196, 496 - (labelX - x), 2);

    // 2 dãy tên 2 bên bàn
    const namesTop = y + MAG.blockHeight + 84;
    const columns = [x, x + 250];
    ctx.fillStyle = style.label;
    ctx.font = '14px "BVP Bold"';
    spacedText(ctx, "DÃY TRÁI", columns[0], namesTop - 22, 4);
    spacedText(ctx, "DÃY PHẢI", columns[1], namesTop - 22, 4);
    ctx.fillStyle = MAG.ink;
    ctx.font = MAG.nameFont;
    [table.left, table.right].forEach((names, side) => {
        names.forEach((name, row) => ctx.fillText(name, columns[side], namesTop + 28 + row * MAG.nameRow));
    });
    const rows = Math.max(table.left.length, table.right.length);
    ctx.fillStyle = "rgba(20,20,20,0.25)";
    ctx.fillRect(x + 228, namesTop - 34, 1, MAG.nameRow * rows + 20);
}

async function renderSeatingPoster() {
    const P = SEATING_POSTER;
    const tableRows = Math.ceil(TABLES.length / 2);
    const lastRowNames = Math.max(...TABLES.slice((tableRows - 1) * 2).flatMap((t) => [t.left.length, t.right.length]));
    const height =
        MAG.tablesTop + (tableRows - 1) * MAG.tableStep + MAG.stagger + MAG.blockHeight + 84 + MAG.nameRow * lastRowNames + 130;

    const canvas = createCanvas(WIDTH, height);
    const ctx = canvas.getContext("2d");
    const M = MAG.margin;
    ctx.fillStyle = MAG.paper;
    ctx.fillRect(0, 0, WIDTH, height);

    // Đầu trang
    ctx.fillStyle = MAG.ink;
    ctx.font = '17px "BVP Bold"';
    spacedText(ctx, P.masthead[0], M, 70, 3);
    spacedText(ctx, P.masthead[1], WIDTH - M, 70, 3, "right");
    ctx.fillRect(M, 88, WIDTH - 2 * M, 2);
    ctx.fillRect(M, 94, WIDTH - 2 * M, 1);

    // Tiêu đề 2 dòng
    ctx.textAlign = "left";
    ctx.font = '184px "Playfair Black"';
    ctx.fillText(P.title[0], M - 8, 318);
    ctx.fillStyle = RED;
    ctx.font = '168px "Playfair Black Italic"';
    ctx.fillText(P.title[1], 270, 486);

    // Cột giờ, địa điểm
    const infoX = 700;
    ctx.fillRect(infoX, 140, 6, 140);
    ctx.fillStyle = MAG.ink;
    ctx.font = '16px "BVP Bold"';
    spacedText(ctx, P.kicker, infoX + 28, 160, 4);
    ctx.font = '68px "Playfair Black"';
    ctx.fillText(P.time, infoX + 26, 228);
    ctx.font = '24px "BVP SemiBold"';
    ctx.fillText(P.place, infoX + 28, 270);

    ctx.fillRect(M, 530, WIDTH - 2 * M, 1);
    drawScreen(ctx, 580);

    TABLES.forEach((table, index) => {
        const x = MAG.columnX[index % 2];
        const y = MAG.tablesTop + Math.floor(index / 2) * MAG.tableStep + (index % 2) * MAG.stagger;
        drawMagTable(ctx, table, index, x, y);
    });

    // Chữ dọc mép phải
    ctx.save();
    ctx.translate(WIDTH - 26, height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = MAG.ink;
    ctx.font = '13px "BVP Bold"';
    spacedText(ctx, P.sideNote, 0, 0, 5, "center");
    ctx.restore();

    // Chân trang
    ctx.fillStyle = MAG.ink;
    ctx.fillRect(M, height - 110, WIDTH - 2 * M, 2);
    ctx.font = '40px "Playfair Black Italic"';
    ctx.textAlign = "left";
    ctx.fillText(P.footer, M, height - 52);
    ctx.font = '16px "BVP Bold"';
    spacedText(ctx, P.footerInfo, WIDTH - M, height - 62, 3, "right");
    return canvas.toBuffer("image/png");
}

// ---------------------------------------------------------------------------
// Thư chúc 20/10 kiểu bưu thiếp máy bay: phong bì, bưu thiếp, phiếu quà

const KRAFT = "#f4e4c1";
const AIR_RED = "#c1121f";
const AIR_BLUE = "#1d4e89";
const BROWN = "#3d2b1f";
const POSTMARK = "rgba(29,78,137,0.75)";

function linear(ctx, x0, y0, x1, y1, colors) {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    colors.forEach((color, i) => gradient.addColorStop(i / (colors.length - 1), color));
    return gradient;
}

function label(ctx, text, x, y, font, color, align = "left", spacing = 0) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(text, align === "center" ? x + spacing / 2 : x, y);
    ctx.letterSpacing = "0px";
}

async function drawEmoji(ctx, emoji, x, y, size, angle = 0) {
    await drawFlowers(ctx, [[emoji, x, y, size, angle]]);
}

// Giấy kraft lấm tấm (random cố định để vẽ lại ra y hệt)
function drawKraft(ctx, x, y, width, height) {
    ctx.fillStyle = KRAFT;
    ctx.fillRect(x, y, width, height);
    let seed = 17;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < (width * height) / 200; i++) {
        ctx.fillStyle = `rgba(120,80,30,${random() * 0.08})`;
        ctx.fillRect(x + random() * width, y + random() * height, 2, 2);
    }
}

// Viền sọc đỏ xanh của thư máy bay quanh khung (x, y, width, height)
function drawAirmailBorder(ctx, x, y, width, height, stripe = 26) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.rect(x + stripe, y + stripe, width - stripe * 2, height - stripe * 2);
    ctx.clip("evenodd");
    for (let i = x - height, n = 0; i < x + width + height; i += 30, n++) {
        ctx.fillStyle = n % 2 ? AIR_RED : AIR_BLUE;
        ctx.beginPath();
        ctx.moveTo(i, y);
        ctx.lineTo(i + 30, y);
        ctx.lineTo(i + 30 - height, y + height);
        ctx.lineTo(i - height, y + height);
        ctx.fill();
    }
    ctx.restore();
}

// Tem răng cưa: hoa tulip + chữ 20·10, góc trên trái tại (x, y)
async function drawStamp(ctx, x, y, width = 200, height = 240) {
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(60,30,0,0.25)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillRect(x, y, width, height);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = KRAFT;
    const tooth = (cx, cy) => {
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fill();
    };
    for (let i = x; i <= x + width; i += 20) [y, y + height].forEach((cy) => tooth(i, cy));
    for (let i = y; i <= y + height; i += 20) [x, x + width].forEach((cx) => tooth(cx, i));
    ctx.fillStyle = linear(ctx, 0, y, 0, y + height, ["#ff8fab", "#e5383b"]);
    ctx.fillRect(x + 16, y + 16, width - 32, height - 32);
    await drawEmoji(ctx, "🌷", x + width / 2, y + height * 0.42, width * 0.6);
    label(ctx, WISH_POSTER.stamp, x + width / 2, y + height - 44, '36px "BVP ExtraBold"', "#fff", "center", 2);
}

// Dấu bưu điện tròn + các đường lượn sóng kéo sang phải
function drawPostmark(ctx, cx, cy, waveWidth = 200) {
    ctx.strokeStyle = POSTMARK;
    ctx.lineWidth = 3;
    for (const r of [70, 58]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
    }
    label(ctx, WISH_POSTER.postmark[0], cx, cy - 18, '18px "BVP Bold"', POSTMARK, "center", 2);
    label(ctx, WISH_POSTER.postmark[1], cx, cy + 12, '18px "BVP Bold"', POSTMARK, "center", 1);
    for (let row = 0; row < 4; row++) {
        ctx.beginPath();
        for (let x = cx + 80; x < cx + 80 + waveWidth; x += 4) {
            const y = cy - 18 + row * 14 + Math.sin(x / 12) * 5;
            x === cx + 80 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
}

// Mấy dòng địa chỉ viết tay có kẻ dòng
function drawAddressLines(ctx, lines, x, y, width, step = 70, font = '30px "Playfair Bold Italic"') {
    lines.forEach((line, i) => {
        label(ctx, line, x, y + i * step, font, BROWN);
        ctx.fillStyle = "rgba(90,60,20,0.45)";
        ctx.fillRect(x, y + i * step + 26, width, 1.5);
    });
}

async function renderWishEnvelope() {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");
    // Nền hồng rực + tim nhỏ rải rác
    ctx.fillStyle = linear(ctx, 0, 0, WIDTH, HEIGHT, ["#ff8fab", "#ff4d6d", "#c9184a"]);
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (const [emoji, x, y, size, angle] of [
        ["💗", 60, 80, 54, -14],
        ["🌸", 1140, 90, 60, 16],
        ["💕", 70, 640, 58, 10],
        ["🌷", 1130, 630, 66, -12],
        ["✨", 600, 40, 40, 0],
        ["✨", 610, 690, 36, 0],
    ])
        await drawEmoji(ctx, emoji, x, y, size, angle);

    // Phong bì
    const x = 110;
    const y = 70;
    const width = WIDTH - 220;
    const height = HEIGHT - 140;
    ctx.save();
    ctx.shadowColor = "rgba(89,13,34,0.45)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = KRAFT;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
    drawKraft(ctx, x, y, width, height);
    drawAirmailBorder(ctx, x, y, width, height, 22);

    // Nắp phong bì hình chữ V, đầu V là dấu sáp
    const tipY = y + 300;
    ctx.fillStyle = "rgba(120,80,30,0.08)";
    ctx.beginPath();
    ctx.moveTo(x + 22, y + 22);
    ctx.lineTo(WIDTH / 2, tipY);
    ctx.lineTo(x + width - 22, y + 22);
    ctx.fill();
    ctx.strokeStyle = "rgba(90,60,20,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Sáp niêm phong: viền gợn + tim giữa
    ctx.save();
    ctx.translate(WIDTH / 2, tipY);
    ctx.shadowColor = "rgba(60,0,10,0.45)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * Math.PI * 2;
        const r = 78 + Math.sin(angle * 9) * 5;
        i ? ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r) : ctx.moveTo(r, 0);
    }
    const wax = ctx.createRadialGradient(-20, -24, 6, 0, 0, 84);
    wax.addColorStop(0, "#ff4d5e");
    wax.addColorStop(1, "#8d0016");
    ctx.fillStyle = wax;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(255,200,200,0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 56, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    label(ctx, WISH_POSTER.seal, WIDTH / 2, tipY + 2, '34px "Playfair Black Italic"', "#ffe0e0", "center");

    await drawStamp(ctx, x + width - 210, y + 46, 160, 192);
    drawPostmark(ctx, x + width - 290, y + 250, 120);
    label(ctx, WISH_POSTER.from, x + 60, y + 80, '26px "Playfair Bold Italic"', "#7f5539");
    drawAddressLines(ctx, WISH_POSTER.to, x + 520, y + 420, 380, 66, '34px "Playfair Bold Italic"');
    return canvas.toBuffer("image/png");
}

async function renderWishPostcard() {
    const P = WISH_POSTER.postcard;
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");
    drawKraft(ctx, 0, 0, WIDTH, HEIGHT);
    drawAirmailBorder(ctx, 0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "rgba(90,60,20,0.35)";
    ctx.fillRect(760, 90, 2, 540);

    await drawStamp(ctx, 900, 80);
    drawPostmark(ctx, 830, 330);
    drawAddressLines(ctx, P.lines, 800, 430, 320);

    label(ctx, P.hello, 80, 150, '64px "Playfair Black Italic"', AIR_RED);
    label(ctx, P.date, 72, 290, '190px "Playfair Black"', AIR_BLUE);
    label(ctx, P.title, 82, 430, '40px "BVP ExtraBold"', BROWN, "left", 3);
    label(ctx, P.subtitle, 82, 484, '26px "BVP SemiBold"', "#7f5539");
    label(ctx, P.fromLabel, 82, 570, '26px "Playfair Bold Italic"', "#7f5539");
    label(ctx, P.from, 82, 614, '34px "Playfair Bold Italic"', AIR_RED);
    await drawEmoji(ctx, "🌹", 640, 600, 110, 18);
    return canvas.toBuffer("image/png");
}

// Phiếu quà dạng vé: 2 khuyết tròn 2 bên + đường đục lỗ tách cuống vé
async function renderWishVoucher(voucher, index) {
    const width = 1000;
    const height = 420;
    const stub = 250;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = linear(ctx, 0, 0, width, height, ["#ff4d6d", "#c9184a", "#800f2f"]);
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 28);
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    for (const cy of [0, height]) {
        ctx.beginPath();
        ctx.arc(stub, cy, 26, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(255,240,243,0.7)";
    ctx.setLineDash([10, 10]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(stub, 36);
    ctx.lineTo(stub, height - 36);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,214,122,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(stub + 24, 24, width - stub - 48, height - 48, 16);
    ctx.stroke();

    // Cuống vé: emoji to + số phiếu
    await drawEmoji(ctx, voucher.emoji, stub / 2, 170, 150);
    label(ctx, `SỐ ${String(index + 1).padStart(2, "0")}`, stub / 2, 320, '26px "BVP Bold"', "#ffd67a", "center", 6);

    const x = stub + 60;
    label(ctx, "PHIẾU QUÀ 20·10", x, 92, '24px "BVP Bold"', "#ffd67a", "left", 8);
    label(ctx, voucher.title, x - 2, 178, '64px "Playfair Black Italic"', "#fff7ed");
    label(ctx, voucher.detail, x, 252, '30px "BVP SemiBold"', "#ffe5ec");
    ctx.fillStyle = "rgba(255,214,122,0.6)";
    ctx.fillRect(x, 300, width - x - 60, 1.5);
    label(ctx, WISH_VOUCHER_FOOTER, x, 340, '20px "BVP Medium"', "#ffccd5");
    return canvas.toBuffer("image/png");
}

async function main() {
    for (const [file, render] of [
        ["poster.png", renderInvitePoster],
        ["seating.png", renderSeatingPoster],
        ["wish-envelope.png", renderWishEnvelope],
        ["wish-postcard.png", renderWishPostcard],
        ...WISH_VOUCHERS.map((voucher, i) => [`wish-voucher-${i + 1}.png`, () => renderWishVoucher(voucher, i)]),
    ]) {
        const png = await render();
        const output = path.join(__dirname, file);
        fs.writeFileSync(output, png);
        console.log(`✅ Đã vẽ ${path.relative(process.cwd(), output)} (${Math.round(png.length / 1024)} KB)`);
    }
}

main();
