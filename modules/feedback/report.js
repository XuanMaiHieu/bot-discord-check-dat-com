/**
 * Bảng feedback đầy đủ cho root (/feedback-chi-tiet): tên thật, điểm, tính năng
 * hay xem, số lần né / bị nhắc, toàn bộ góp ý. Kèm file CSV mở bằng Excel, vì
 * thẻ Discord chỉ chứa được 4000 ký tự chữ.
 *
 * Khác /feedback-tong-hop (ẩn danh, chỉ "Người #N").
 */
const { AttachmentBuilder, ContainerBuilder, SeparatorSpacingSize } = require("discord.js");
const { FEATURES } = require("./texts");
const { COLORS, ratingLabel, featureLabels } = require("./cards");

const MAX_CARD_TEXT = 3800; // Discord giới hạn 4000 ký tự chữ / thẻ
const NAME_WIDTH = 18; // cột tên trong bảng, vừa màn hình điện thoại
const MAX_TABLE_ROWS = 60; // ~2400 ký tự, còn chỗ cho phần góp ý

// "2026-09-25T07:03:00Z" -> "25/09 14:03" (giờ Việt Nam)
function formatTime(iso) {
    if (!iso) return "";
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Ho_Chi_Minh",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(new Date(iso));
    const get = (type) => parts.find((p) => p.type === type).value;
    return `${get("day")}/${get("month")} ${get("hour")}:${get("minute")}`;
}

// Tên trong users.json, không có thì tên Discord, cuối cùng là ID
async function resolveName(ctx, discordId) {
    const name = ctx.findUserByDiscordId(discordId)?.name;
    if (name) return name.normalize("NFC");
    try {
        const user = await ctx.client.users.fetch(discordId);
        return user.globalName || user.username;
    } catch (error) {
        return discordId;
    }
}

/**
 * Người đã nhận thẻ mời (hoặc đã chấm), kèm tên, xếp điểm cao trước, chưa chấm
 * xuống cuối, cùng điểm thì theo tên.
 */
async function loadRows(ctx, campaign) {
    const entries = Object.entries(campaign.participants).filter(([, p]) => p.invitedAt || p.rating);
    const rows = await Promise.all(
        entries.map(async ([discordId, p]) => ({ discordId, name: await resolveName(ctx, discordId), ...p }))
    );
    return rows.sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name, "vi"));
}

// NPS quy đổi sang thang 5: 5 = ủng hộ, 4 = trung lập, 1–3 = chê
function computeNps(rated) {
    if (!rated.length) return null;
    const promoters = rated.filter((r) => r.rating === 5).length;
    const detractors = rated.filter((r) => r.rating <= 3).length;
    return Math.round(((promoters - detractors) / rated.length) * 100);
}

function fit(value, width) {
    const text = String(value);
    return text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width);
}

// Bảng gọn trong khối code (không dùng emoji để cột thẳng hàng)
function buildTable(rows) {
    const numberWidth = String(rows.length).length;
    const header = `${"#".padStart(numberWidth)} ${fit("Tên", NAME_WIDTH)} Điểm Né Nhắc Góp ý`;
    const lines = rows.slice(0, MAX_TABLE_ROWS).map(
        (r, i) =>
            `${String(i + 1).padStart(numberWidth)} ${fit(r.name, NAME_WIDTH)} ` +
            `${String(r.rating || "—").padStart(4)} ${String(r.snoozeCount).padStart(2)} ` +
            `${String(r.nagCount).padStart(4)} ${String(r.submissions.length).padStart(5)}`
    );
    const more = rows.length > MAX_TABLE_ROWS ? `\n-# … còn ${rows.length - MAX_TABLE_ROWS} người nữa, xem đủ trong file CSV` : "";
    return ["```", header, ...lines, "```"].join("\n") + more;
}

// Chi tiết từng người có chọn "hay xem" hoặc có góp ý
function buildDetailBlocks(rows) {
    return rows
        .filter((r) => r.features.length || r.submissions.length)
        .map((r) => {
            const head = [`**${r.name}**`, r.rating ? ratingLabel(r.rating) : "chưa chấm", r.ratedAt && `chấm ${formatTime(r.ratedAt)}`];
            const lines = [head.filter(Boolean).join(" · ")];
            const features = featureLabels(r.features);
            if (features.length) lines.push(`-# Hay xem: ${features.join(", ")}`);
            for (const s of r.submissions) {
                lines.push(`-# ✍️ Góp ý lúc ${formatTime(s.at)}`);
                if (s.liked) lines.push(`💚 ${s.liked}`);
                if (s.fix) lines.push(`🔧 ${s.fix}`);
                if (s.idea) lines.push(`💡 ${s.idea}`);
            }
            return lines.join("\n");
        });
}

// Lấy các khối chi tiết vừa với số ký tự còn lại, thừa thì ghi chú xem file
function fitBlocks(blocks, budget) {
    const kept = [];
    let used = 0;
    for (const block of blocks) {
        if (used + block.length + 2 > budget) {
            kept.push(`-# … còn ${blocks.length - kept.length} người nữa, xem đủ trong file CSV bên dưới`);
            break;
        }
        kept.push(block);
        used += block.length + 2;
    }
    return kept.join("\n\n");
}

// ---------------------------------------------------------------------------
// CSV: mỗi lần góp ý 1 dòng (người chưa góp ý vẫn có 1 dòng)
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
    "STT",
    "Tên",
    "Discord ID",
    "Người #N",
    "Điểm",
    "Chấm lúc",
    "Hay xem",
    'Số lần "Để sau"',
    "Số lần bị nhắc",
    "Được mời lúc",
    "Góp ý lúc",
    "Thích",
    "Cần sửa",
    "Đề xuất",
];

function csvCell(value) {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(rows) {
    const featureName = (value) => FEATURES.find((f) => f.value === value)?.label || value;
    const lines = [CSV_COLUMNS];
    rows.forEach((r, i) => {
        const person = [
            i + 1,
            r.name,
            r.discordId,
            r.number ?? "",
            r.rating ?? "",
            formatTime(r.ratedAt),
            r.features.map(featureName).join(", "),
            r.snoozeCount,
            r.nagCount,
            formatTime(r.invitedAt),
        ];
        const submissions = r.submissions.length ? r.submissions : [null];
        for (const s of submissions) {
            lines.push([...person, formatTime(s?.at), s?.liked, s?.fix, s?.idea]);
        }
    });
    // BOM để Excel đọc đúng tiếng Việt
    return "﻿" + lines.map((cols) => cols.map(csvCell).join(",")).join("\r\n");
}

// ---------------------------------------------------------------------------

/**
 * @returns {Promise<{ card, files }>}
 */
async function buildDetailReport(ctx, campaign) {
    const rows = await loadRows(ctx, campaign);
    const rated = rows.filter((r) => r.rating);
    const avg = rated.length ? rated.reduce((sum, r) => sum + r.rating, 0) / rated.length : null;
    const nps = computeNps(rated);
    const commented = rows.filter((r) => r.submissions.length).length;

    const container = new ContainerBuilder().setAccentColor(COLORS.admin);
    const sections = [];
    const text = (content) => {
        sections.push(content);
        container.addTextDisplayComponents((t) => t.setContent(content));
    };
    const divider = () => container.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    const status = campaign.test ? "🧪 test" : campaign.closedAt ? "đã đóng" : "đang mở";
    text(
        `## 📋 Feedback chi tiết · đợt ${campaign.id} (${status})\n` +
            `Đã mời **${rows.length}** · đã chấm **${rated.length}** · góp ý **${commented}** người\n` +
            `Điểm TB **${avg === null ? "—" : avg.toFixed(2)}** · NPS **${nps === null ? "—" : `${nps > 0 ? "+" : ""}${nps}`}**\n` +
            "-# NPS quy đổi thang 5: 5 = ủng hộ, 4 = trung lập, 1–3 = chê. Né = bấm \"Để sau\", Nhắc = số lần bị nhắc ở thẻ 12h"
    );

    if (rows.length === 0) {
        text("Chưa mời ai trong đợt này.");
        return { card: container, files: [] };
    }

    divider();
    text(buildTable(rows));

    const detailBlocks = buildDetailBlocks(rows);
    const notRated = rows.filter((r) => !r.rating);
    const notRatedNames = notRated.map((r) => r.name).join(", ");
    const footer = notRated.length
        ? `-# ⏳ Chưa chấm (${notRated.length}): ${notRatedNames.length > 600 ? `${notRatedNames.slice(0, 600)}…` : notRatedNames}`
        : null;

    if (detailBlocks.length) {
        divider();
        const used = sections.join("").length + (footer?.length || 0);
        text(fitBlocks(detailBlocks, MAX_CARD_TEXT - used));
    }
    if (footer) {
        divider();
        text(footer);
    }

    const fileName = `feedback-${campaign.id}.csv`;
    container.addFileComponents((f) => f.setURL(`attachment://${fileName}`));
    const files = [new AttachmentBuilder(Buffer.from(buildCsv(rows), "utf8"), { name: fileName })];
    return { card: container, files };
}

module.exports = { buildDetailReport, buildCsv, computeNps };
