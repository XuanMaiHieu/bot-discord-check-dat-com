/**
 * Thẻ giá vàng (Discord Components V2): nổi bật vàng miếng SJC + nhẫn tròn,
 * các loại còn lại gom thành dòng chữ nhỏ.
 */
const {
    ContainerBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    SeparatorSpacingSize,
    escapeMarkdown,
} = require("discord.js");
const { SOURCES } = require("./gold-price");
const { formatDayMonth, isWeekend, toDateKey } = require("./workdays");

const GOLD_REFRESH_BUTTON_ID = "gold:refresh";

const ACCENT_COLOR = 0xeab308; // vàng
const WARNING_ACCENT_COLOR = 0xf97316; // cam khi đang dùng nguồn dự phòng / giá cũ

const MAIN_ITEMS = [
    { key: "sjc", icon: "🥇" },
    { key: "ring", icon: "💍" },
];
const MAX_EXTRA_ITEMS = 6;

// 14400000 -> "14.400.000"
function formatVnd(value) {
    return value === null || value === undefined ? "—" : value.toLocaleString("vi-VN");
}

// 1 chỉ -> 1 lượng (10 chỉ), đơn vị triệu: 14400000 -> "144,0"
function formatMillionPerTael(value) {
    return value ? (value * 10 / 1_000_000).toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—";
}

// Chênh lệch so với hôm trước: "▲120k", "▼1,2tr", "="
function formatChange(now, before) {
    if (!now || !before) return "";
    const diff = now - before;
    if (diff === 0) return " `=`";
    const abs = Math.abs(diff);
    const text = abs >= 1_000_000
        ? `${(abs / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}tr`
        : `${Math.round(abs / 1000).toLocaleString("vi-VN")}k`;
    return diff > 0 ? ` \`▲${text}\`` : ` \`▼${text}\``;
}

function formatUpdatedAt(result) {
    if (!result.updatedAt) return "không rõ giờ cập nhật";
    const d = result.updatedAt;
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return result.hasTime ? `cập nhật ${time} ${formatDayMonth(d)}` : `ngày ${formatDayMonth(d)}`;
}

function mainItemBlock(item, icon, previousItem) {
    return [
        `## ${icon} ${escapeMarkdown(item.name)}`,
        `Mua **${formatVnd(item.buy)}**${formatChange(item.buy, previousItem?.buy)}` +
            `  ·  Bán **${formatVnd(item.sell)}**${formatChange(item.sell, previousItem?.sell)}`,
        `-# ≈ ${formatMillionPerTael(item.buy)} / ${formatMillionPerTael(item.sell)} triệu/lượng`,
    ].join("\n");
}

// Cảnh báo hiện ngay dưới tiêu đề
function warningLines(report, { isToday, now }) {
    const lines = [];
    const { result, stale } = report;
    if (stale) {
        lines.push("⚠️ Hiện không lấy được giá mới, đang hiện giá lấy được gần nhất.");
    } else if (result.source !== "phuquy") {
        lines.push(`⚠️ Trang Phú Quý đang lỗi, tạm dùng giá của **${SOURCES[result.source].label}**.`);
    }
    // Ngày làm việc mà nguồn chưa cập nhật giá hôm nay
    if (isToday && !stale && result.updatedAt && !isWeekend(now) && toDateKey(result.updatedAt) !== toDateKey(now)) {
        lines.push(`⚠️ ${SOURCES[result.source].label} chưa cập nhật giá hôm nay.`);
    }
    return lines;
}

function refreshButtonRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(GOLD_REFRESH_BUTTON_ID)
            .setLabel("Làm mới")
            .setEmoji("🔄")
            .setStyle(ButtonStyle.Secondary)
    );
}

// Mô tả ảnh (hiện khi ảnh chưa tải / trình đọc màn hình)
function imageDescription(result) {
    return result.items
        .filter((i) => i.key)
        .map((i) => `${i.name}: mua ${formatVnd(i.buy)}, bán ${formatVnd(i.sell)}`)
        .join("; ")
        .slice(0, 1000);
}

/**
 * @param {object} report - Từ getTodayGoldPrices / getGoldPricesByDate
 * @param {object} [options]
 * @param {boolean} [options.isToday] - true: có nút Làm mới + kiểm tra giá cũ
 * @param {Date} [options.now]
 * @param {string|null} [options.imageFileName] - ảnh bảng giá đính kèm (price-image.js);
 *        null = thẻ chữ (khi vẽ ảnh lỗi)
 */
function buildGoldCard(report, { isToday = true, now = new Date(), imageFileName = null } = {}) {
    const { result, previous } = report;
    const warnings = isToday ? warningLines(report, { isToday, now }) : [];
    const container = new ContainerBuilder().setAccentColor(warnings.length ? WARNING_ACCENT_COLOR : ACCENT_COLOR);

    if (imageFileName) {
        container.addMediaGalleryComponents((g) =>
            g.addItems((item) => item.setURL(`attachment://${imageFileName}`).setDescription(imageDescription(result)))
        );
        if (isToday) container.addActionRowComponents(refreshButtonRow());
        return container;
    }

    const source = SOURCES[result.source];
    container.addTextDisplayComponents((t) =>
        t.setContent(
            [
                `-# 💰 GIÁ VÀNG ${source.label.toLocaleUpperCase("vi-VN")} · VNĐ/chỉ`,
                `### 🕒 ${formatUpdatedAt(result)}`,
                ...warnings.map((w) => `-# ${w}`),
            ].join("\n")
        )
    );
    container.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    for (const { key, icon } of MAIN_ITEMS) {
        const item = result.items.find((i) => i.key === key);
        if (!item) continue;
        const previousItem = previous?.items.find((i) => i.key === key);
        container.addTextDisplayComponents((t) => t.setContent(mainItemBlock(item, icon, previousItem)));
    }

    // Các loại khác: "Vàng trang sức 999.9 14.150.000 / 14.650.000"
    const extras = result.items
        .filter((i) => !i.key && (i.buy || i.sell))
        .slice(0, MAX_EXTRA_ITEMS)
        .map((i) => `-# ${escapeMarkdown(i.name)}: ${formatVnd(i.buy)} / ${formatVnd(i.sell)}`);
    if (extras.length) {
        container.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents((t) => t.setContent(extras.join("\n")));
    }

    const footer = [
        previous?.updatedAt ? `▲▼ so với ${formatDayMonth(previous.updatedAt)}` : null,
        `nguồn ${source.site}`,
    ].filter(Boolean);
    container.addTextDisplayComponents((t) => t.setContent(`-# ${footer.join(" · ")}`));

    if (isToday) container.addActionRowComponents(refreshButtonRow());
    return container;
}

module.exports = {
    GOLD_REFRESH_BUTTON_ID,
    buildGoldCard,
    formatChange,
};
