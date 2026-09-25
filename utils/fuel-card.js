/**
 * Thẻ giá xăng dầu Petrolimex (Discord Components V2): cả 2 vùng giá, ▲▼ so
 * với kỳ điều hành trước, nút bật / tắt tự báo khi giá đổi.
 */
const { ContainerBuilder, ButtonBuilder, ButtonStyle, SeparatorSpacingSize, escapeMarkdown } = require("discord.js");
const { SITE } = require("./fuel-price");
const { formatDayMonth } = require("./workdays");

// Nút bật / tắt báo giá (đăng ký trong commands/fuel.js). Thẻ tự báo dùng id
// riêng để khi bấm, thẻ được dựng lại đúng tiêu đề "vừa điều chỉnh"
const FUEL_NOTIFY_BUTTON_ID = "fuel:notify";
const FUEL_NOTIFY_ALERT_BUTTON_ID = "fuel:notify:alert";

const ACCENT_COLOR = 0xf88126; // cam Petrolimex
const WARNING_ACCENT_COLOR = 0x94a3b8; // xám khi đang hiện giá cũ

// Icon theo loại: xăng / dầu diesel / dầu hỏa / còn lại
function productIcon(title) {
    const t = title.toLowerCase();
    if (t.includes("xăng")) return "⛽";
    if (t.startsWith("do ") || t.includes("diesel")) return "🛢️";
    if (t.includes("dầu hỏa")) return "🔥";
    return "🔸";
}

// 28080 -> "28.080"
const formatVnd = (value) => value.toLocaleString("vi-VN");

// Chênh lệch so với kỳ trước: " `▲450`", " `▼120`", " `=`"; chưa có kỳ trước thì ""
function formatChange(diff) {
    if (diff === null || diff === undefined) return "";
    if (diff === 0) return " `=`";
    return diff > 0 ? ` \`▲${formatVnd(diff)}\`` : ` \`▼${formatVnd(-diff)}\``;
}

function formatTime(date) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")} ${formatDayMonth(date)}`;
}

function divider(container) {
    container.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));
}

function text(container, content) {
    container.addTextDisplayComponents((t) => t.setContent(content));
}

function notifyButton(subscribed, alert) {
    return new ButtonBuilder()
        .setCustomId(alert ? FUEL_NOTIFY_ALERT_BUTTON_ID : FUEL_NOTIFY_BUTTON_ID)
        .setLabel(subscribed ? "Tắt báo khi giá đổi" : "Bật báo khi giá đổi")
        .setEmoji(subscribed ? "🔕" : "🔔")
        .setStyle(subscribed ? ButtonStyle.Secondary : ButtonStyle.Primary);
}

// Mô tả ảnh (hiện khi ảnh chưa tải / trình đọc màn hình)
function imageDescription(report) {
    return report.products.map((p) => `${p.title}: ${formatVnd(p.zone1)} / ${formatVnd(p.zone2)}`).join("; ").slice(0, 1000);
}

/**
 * @param {object} report - từ getFuelPrices
 * @param {object} [options]
 * @param {boolean} [options.subscribed] - người xem đang bật tự báo giá
 * @param {boolean} [options.alert] - thẻ tự báo khi giá vừa đổi
 * @param {string|null} [options.imageFileName] - ảnh bảng giá đính kèm (price-image.js);
 *        null = thẻ chữ (khi vẽ ảnh lỗi)
 */
function buildFuelCard(report, { subscribed = false, alert = false, imageFileName = null } = {}) {
    const container = new ContainerBuilder().setAccentColor(report.stale ? WARNING_ACCENT_COLOR : ACCENT_COLOR);

    if (imageFileName) {
        container.addMediaGalleryComponents((g) =>
            g.addItems((item) => item.setURL(`attachment://${imageFileName}`).setDescription(imageDescription(report)))
        );
        container.addActionRowComponents((row) => row.setComponents(notifyButton(subscribed, alert)));
        return container;
    }

    const header = [
        alert ? "-# 🔔 GIÁ XĂNG DẦU VỪA ĐIỀU CHỈNH · PETROLIMEX" : "-# ⛽ GIÁ BÁN LẺ XĂNG DẦU PETROLIMEX · đồng/lít",
        report.updatedAt ? `### 🕒 Cập nhật ${formatTime(report.updatedAt)}` : "### 🕒 Chưa có giá",
    ];
    if (report.stale) header.push("-# ⚠️ Hiện không lấy được giá mới, đang hiện giá lấy được gần nhất.");
    text(container, header.join("\n"));
    divider(container);

    if (report.products.length === 0) {
        text(container, `❌ Không lấy được giá xăng dầu lúc này, thử lại sau nhé.\n-# ${report.error || ""}`);
    } else {
        const lines = report.products.map(
            (p) =>
                `${productIcon(p.title)} **${escapeMarkdown(p.title)}**\n` +
                `Vùng 1 **${formatVnd(p.zone1)}**${formatChange(p.change1)}` +
                `  ·  Vùng 2 **${formatVnd(p.zone2)}**${formatChange(p.change2)}`
        );
        text(container, lines.join("\n"));
        divider(container);
        text(
            container,
            [
                "-# 🏙️ Vùng 1: nội thành Hà Nội (và các đô thị lớn)",
                "-# 🌾 Vùng 2: nông thôn, miền núi",
                `-# ${[report.comparedTo ? `▲▼ so với kỳ ${formatDayMonth(report.comparedTo)}` : null, `nguồn ${SITE}`]
                    .filter(Boolean)
                    .join(" · ")}`,
            ].join("\n")
        );
    }

    container.addActionRowComponents((row) => row.setComponents(notifyButton(subscribed, alert)));
    return container;
}

module.exports = {
    FUEL_NOTIFY_BUTTON_ID,
    FUEL_NOTIFY_ALERT_BUTTON_ID,
    buildFuelCard,
};
