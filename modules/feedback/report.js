/**
 * Thống kê feedback đầy đủ cho root (/feedback-chi-tiet), gửi thành 1 bộ tin
 * vào DM, không cắt bớt gì:
 *   1. Tổng quan: điểm TB, NPS, phân bố điểm, tính năng hay xem, pháo tay
 *   2. Bảng tên thật: điểm, số lần né / bị nhắc / góp ý (dài thì chia nhiều tin)
 *   3. Chi tiết từng người: giờ chấm, hay xem, toàn bộ góp ý (chia nhiều tin)
 *   4. File CSV để mở bằng Excel
 *
 * Mỗi tin là 1 thẻ Components V2: tối đa 4000 ký tự chữ và 40 thành phần.
 * Khác /feedback-tong-hop (ẩn danh, chỉ "Người #N").
 */
const { AttachmentBuilder, ContainerBuilder, SeparatorSpacingSize } = require("discord.js");
const store = require("./store");
const { RATINGS, FEATURES } = require("./texts");
const { COLORS, ratingLabel, featureLabels, bar } = require("./cards");

const MAX_CARD_TEXT = 3800; // chừa chỗ cho tiêu đề "(1/3)"
const MAX_BLOCKS_PER_CARD = 15; // mỗi khối = 1 chữ + 1 vạch kẻ, dưới giới hạn 40 thành phần
const NAME_WIDTH = 18; // cột tên trong bảng, vừa màn hình điện thoại
const TABLE_ROWS_PER_CARD = 60; // ~2400 ký tự / tin

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

// Bảng gọn trong khối code (không dùng emoji để cột thẳng hàng), mỗi phần tối
// đa TABLE_ROWS_PER_CARD dòng
function buildTableChunks(rows) {
    const numberWidth = String(rows.length).length;
    const header = `${"#".padStart(numberWidth)} ${fit("Tên", NAME_WIDTH)} Điểm Né Nhắc Góp ý`;
    const lines = rows.map(
        (r, i) =>
            `${String(i + 1).padStart(numberWidth)} ${fit(r.name, NAME_WIDTH)} ` +
            `${String(r.rating || "—").padStart(4)} ${String(r.snoozeCount).padStart(2)} ` +
            `${String(r.nagCount).padStart(4)} ${String(r.submissions.length).padStart(5)}`
    );
    const chunks = [];
    for (let i = 0; i < lines.length; i += TABLE_ROWS_PER_CARD) {
        chunks.push(["```", header, ...lines.slice(i, i + TABLE_ROWS_PER_CARD), "```"].join("\n"));
    }
    return chunks;
}

// Chia 1 khối chữ quá dài thành nhiều khối, cắt ở chỗ xuống dòng. Khối sau mở
// đầu bằng `continuation` để biết đang đọc của ai
function splitLongBlock(lines, continuation) {
    const blocks = [];
    let current = [];
    for (const line of lines) {
        if (current.length && [...current, line].join("\n").length > MAX_CARD_TEXT) {
            blocks.push(current.join("\n"));
            current = [continuation];
        }
        current.push(line);
    }
    blocks.push(current.join("\n"));
    return blocks;
}

// Chi tiết từng người có chọn "hay xem" hoặc có góp ý
function buildDetailBlocks(rows) {
    return rows
        .filter((r) => r.features.length || r.submissions.length)
        .flatMap((r) => {
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
            return splitLongBlock(lines, `**${r.name}** (tiếp)`);
        });
}

// Xếp các khối vào ít tin nhất, mỗi tin không quá số ký tự / số khối cho phép
function packBlocks(blocks) {
    const pages = [];
    let page = [];
    let used = 0;
    for (const block of blocks) {
        if (page.length && (used + block.length > MAX_CARD_TEXT || page.length >= MAX_BLOCKS_PER_CARD)) {
            pages.push(page);
            page = [];
            used = 0;
        }
        page.push(block);
        used += block.length;
    }
    if (page.length) pages.push(page);
    return pages;
}

function newCard() {
    const container = new ContainerBuilder().setAccentColor(COLORS.admin);
    return {
        container,
        text: (content) => container.addTextDisplayComponents((t) => t.setContent(content)),
        divider: () => container.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small)),
    };
}

// "Tiêu đề" hoặc "Tiêu đề (2/3)" khi phần đó chia nhiều tin
const pageTitle = (title, index, total) => (total > 1 ? `${title} (${index + 1}/${total})` : title);

function buildOverviewCard(campaign, rows) {
    const rated = rows.filter((r) => r.rating);
    const avg = rated.length ? rated.reduce((sum, r) => sum + r.rating, 0) / rated.length : null;
    const nps = computeNps(rated);
    const commented = rows.filter((r) => r.submissions.length).length;
    const status = campaign.test ? "🧪 test" : campaign.closedAt ? "đã đóng" : "đang mở";

    const { container, text, divider } = newCard();
    text(
        `## 📋 Feedback đầy đủ · đợt ${campaign.id} (${status})\n` +
            `Đã mời **${rows.length}** · đã chấm **${rated.length}** · góp ý **${commented}** người\n` +
            `Điểm TB **${avg === null ? "—" : avg.toFixed(2)}** · NPS **${nps === null ? "—" : `${nps > 0 ? "+" : ""}${nps}`}**` +
            ` · 👏 **${store.getClapTotal()}** pháo tay\n` +
            "-# NPS quy đổi thang 5: 5 = ủng hộ, 4 = trung lập, 1–3 = chê"
    );
    if (rows.length === 0) {
        text("Chưa mời ai trong đợt này.");
        return container;
    }

    divider();
    const counts = [5, 4, 3, 2, 1].map((n) => ({ n, count: rated.filter((r) => r.rating === n).length }));
    const maxCount = Math.max(...counts.map((c) => c.count), 1);
    text(counts.map(({ n, count }) => `${RATINGS[n].emoji} ${n}  \`${bar(count, maxCount)}\` ${count}`).join("\n"));

    const featureCounts = FEATURES.map((f) => ({ ...f, count: rows.filter((r) => r.features.includes(f.value)).length }))
        .filter((f) => f.count > 0)
        .sort((a, b) => b.count - a.count);
    if (featureCounts.length) {
        text(`**Hay xem:** ${featureCounts.map((f) => `${f.emoji} ${f.label} (${f.count})`).join(" · ")}`);
    }

    const notRated = rows.filter((r) => !r.rating);
    if (notRated.length) {
        divider();
        text(`⏳ **Chưa chấm (${notRated.length}):** ${notRated.map((r) => r.name).join(", ")}`.slice(0, 2000));
    }
    return container;
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
    return "\uFEFF" + lines.map((cols) => cols.map(csvCell).join(",")).join("\r\n");
}

// ---------------------------------------------------------------------------

/**
 * Bộ tin thống kê, gửi lần lượt theo thứ tự.
 * @returns {Promise<Array<{ card, files }>>}
 */
async function buildDetailMessages(ctx, campaign) {
    const rows = await loadRows(ctx, campaign);
    const messages = [{ card: buildOverviewCard(campaign, rows), files: [] }];
    if (rows.length === 0) return messages;

    const tables = buildTableChunks(rows);
    tables.forEach((table, i) => {
        const { container, text } = newCard();
        text(`### ${pageTitle("📊 Bảng điểm", i, tables.length)}\n${table}`);
        if (i === tables.length - 1) text('-# Né = số lần bấm "Để sau" · Nhắc = số lần bị nhắc ở thẻ cơm 12h');
        messages.push({ card: container, files: [] });
    });

    const pages = packBlocks(buildDetailBlocks(rows));
    pages.forEach((page, i) => {
        const { container, text, divider } = newCard();
        text(`### ${pageTitle("✍️ Góp ý & chi tiết", i, pages.length)}`);
        for (const block of page) {
            divider();
            text(block);
        }
        messages.push({ card: container, files: [] });
    });

    const fileName = `feedback-${campaign.id}.csv`;
    const { container, text } = newCard();
    text("### 📎 File CSV đầy đủ\n-# Mở bằng Excel / Google Sheets. Mỗi lần góp ý là 1 dòng");
    container.addFileComponents((f) => f.setURL(`attachment://${fileName}`));
    messages.push({ card: container, files: [new AttachmentBuilder(Buffer.from(buildCsv(rows), "utf8"), { name: fileName })] });
    return messages;
}

module.exports = { buildDetailMessages, buildCsv, computeNps };
