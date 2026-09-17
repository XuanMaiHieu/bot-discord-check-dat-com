/**
 * Thẻ lịch thi đấu bóng đá (Discord Components V2). Giờ đá hiển thị theo giờ
 * Việt Nam, kèm thứ trong tuần.
 */
const {
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder,
    SeparatorSpacingSize,
    escapeMarkdown,
} = require("discord.js");
const { LEAGUE } = require("./football");
const { formatLongDay, formatDayMonth, startOfDay } = require("./workdays");

const ACCENT_COLOR = 0xff2882; // hồng Premier League
const LIVE_ACCENT_COLOR = 0xef4444; // đỏ khi có trận đang đá

// Giới hạn Discord cho 1 tin V2 là 4000 ký tự chữ; chừa khoảng trống an toàn
const MAX_TEXT_LENGTH = 3800;

function formatTime(date) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// "<:fb_ars_359:...> Arsenal" (có logo) hoặc "Arsenal"; đội đang xem được gạch chân
function teamName(team, { highlightTeam = null, emojis = null } = {}) {
    const name = escapeMarkdown(team.name);
    const highlighted = highlightTeam && team.name.toLowerCase() === highlightTeam.toLowerCase();
    const logo = emojis?.get(team.id);
    const text = highlighted ? `__${name}__` : name;
    return logo ? `${logo} ${text}` : text;
}

// "Isak 6', 9' · Salah 30' (pen)"
function formatScorers(team) {
    const byPlayer = new Map();
    for (const goal of team.goals) {
        const minute = goal.note ? `${goal.minute} (${goal.note})` : goal.minute;
        byPlayer.set(goal.player, [...(byPlayer.get(goal.player) || []), minute]);
    }
    return [...byPlayer.entries()]
        .map(([player, minutes]) => `${escapeMarkdown(player)} ${minutes.join(", ")}`)
        .join(" · ");
}

// Dòng chữ nhỏ dưới trận: người ghi bàn, thẻ đỏ, sân
function matchSubline(match, { showVenue }) {
    const parts = [];

    if (match.phase === "finished" || match.phase === "live") {
        for (const team of [match.home, match.away]) {
            const scorers = formatScorers(team);
            if (scorers) parts.push(`⚽ ${escapeMarkdown(team.shortName)}: ${scorers}`);
        }
        const redCards = [match.home, match.away]
            .filter((team) => team.redCards)
            .map((team) => `${escapeMarkdown(team.shortName)}${team.redCards > 1 ? ` ×${team.redCards}` : ""}`);
        if (redCards.length) parts.push(`🟥 ${redCards.join(", ")}`);
    }
    if (showVenue && match.venue && match.phase === "upcoming") {
        parts.push(`🏟️ ${escapeMarkdown(match.venue)}`);
    }
    return parts.length ? `-# ${parts.join("  |  ")}` : "";
}

// Dòng chính của 1 trận
// options.emojis: Map id đội -> emoji logo (getTeamEmojis)
function matchLine(match, { highlightTeam = null, emojis = null, withDate = false } = {}) {
    const home = teamName(match.home, { highlightTeam, emojis });
    const away = teamName(match.away, { highlightTeam, emojis });
    const time = withDate
        ? `${formatTime(match.kickoff)} ${formatDayMonth(match.kickoff)}`
        : formatTime(match.kickoff);

    switch (match.phase) {
        case "live":
            return `🔴 **${escapeMarkdown(match.detail)}** · ${home} **${match.home.score} – ${match.away.score}** ${away}`;
        case "finished": {
            const h = match.home.winner ? `**${home}**` : home;
            const a = match.away.winner ? `**${away}**` : away;
            return `✅ \`${time}\` ${h} **${match.home.score} – ${match.away.score}** ${a}`;
        }
        case "postponed":
        case "canceled":
            return `⏸️ \`${time}\` ${home} 🆚 ${away} · **${match.detail}**`;
        default:
            return `🕒 \`${time}\` ${home} 🆚 ${away}`;
    }
}

function matchBlock(match, options) {
    const sub = options.compact ? "" : matchSubline(match, options);
    return sub ? `${matchLine(match, options)}\n${sub}` : matchLine(match, options);
}

function headerSection(lines) {
    return new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join("\n")))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(LEAGUE.logo).setDescription(LEAGUE.name));
}

function newContainer(matches) {
    const hasLive = matches.some((m) => m.phase === "live");
    return new ContainerBuilder().setAccentColor(hasLive ? LIVE_ACCENT_COLOR : ACCENT_COLOR);
}

function addDivider(container) {
    container.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));
}

function summaryLine(matches) {
    const count = (phase) => matches.filter((m) => m.phase === phase).length;
    const parts = [`${matches.length} trận`];
    if (count("live")) parts.push(`🔴 ${count("live")} đang đá`);
    if (count("finished")) parts.push(`✅ ${count("finished")} đã đá`);
    if (count("upcoming")) parts.push(`🕒 ${count("upcoming")} sắp đá`);
    parts.push("giờ Việt Nam");
    return parts.join(" · ");
}

/**
 * Thẻ lịch 1 ngày (/fbdate).
 * @param {Date} date
 * @param {Array} matches - Từ getMatchesBetween
 * @param {object} [options]
 * @param {Map} [options.emojis] - Logo đội (getTeamEmojis)
 */
function buildDayCard(date, matches, { emojis = null } = {}) {
    const container = newContainer(matches);
    container.addSectionComponents(
        headerSection([
            `-# ⚽ ${LEAGUE.name.toLocaleUpperCase("vi-VN")}`,
            `## 📅 ${formatLongDay(date)}`,
            `-# ${matches.length ? summaryLine(matches) : "Không có trận nào"}`,
        ])
    );

    if (matches.length) {
        addDivider(container);
        const options = fitOptions(matches, { showVenue: true, emojis });
        const text = matches.map((m) => matchBlock(m, options)).join("\n");
        container.addTextDisplayComponents((t) => t.setContent(text));
    }
    return container;
}

/**
 * Thẻ lịch theo tuần, nhóm theo thứ (/fbname, tin tự động).
 * @param {object} p
 * @param {string} p.title - Dòng tiêu đề lớn
 * @param {string} p.subtitle - Dòng chữ nhỏ dưới tiêu đề
 * @param {Array} p.matches
 * @param {string} [p.highlightTeam] - Gạch chân tên đội này
 * @param {string} [p.emptyText] - Nội dung khi không có trận
 * @param {Map} [p.emojis] - Logo đội (getTeamEmojis)
 */
function buildWeekCard({ title, subtitle, matches, highlightTeam = null, emptyText = "Không có trận nào", emojis = null }) {
    const container = newContainer(matches);
    container.addSectionComponents(
        headerSection([
            `-# ⚽ ${LEAGUE.name.toLocaleUpperCase("vi-VN")}`,
            `## ${title}`,
            `-# ${[subtitle, matches.length ? summaryLine(matches) : null].filter(Boolean).join(" · ")}`,
        ])
    );

    if (!matches.length) {
        addDivider(container);
        container.addTextDisplayComponents((t) => t.setContent(emptyText));
        return container;
    }

    // Nhóm theo ngày (giờ Việt Nam)
    const days = new Map();
    for (const match of matches) {
        const key = startOfDay(match.kickoff).getTime();
        days.set(key, [...(days.get(key) || []), match]);
    }

    const options = fitOptions(matches, { highlightTeam, emojis });
    for (const [key, dayMatches] of days) {
        addDivider(container);
        const text = dayMatches.map((m) => matchBlock(m, options)).join("\n");
        container.addTextDisplayComponents((t) => t.setContent(`### ${formatLongDay(new Date(key))}\n${text}`));
    }
    return container;
}

// Chọn mức hiển thị vừa giới hạn của Discord: đầy đủ -> bỏ dòng phụ (người ghi
// bàn, sân) -> bỏ luôn logo (mỗi emoji tốn ~35 ký tự). Mỗi ngày còn thêm dòng
// tiêu đề, nên tính dư 60 ký tự/trận cho an toàn
function fitOptions(matches, options) {
    const levels = [
        options,
        { ...options, compact: true },
        { ...options, compact: true, emojis: null },
    ];
    const fits = (level) =>
        matches.reduce((sum, m) => sum + matchBlock(m, level).length + 60, 0) <= MAX_TEXT_LENGTH;
    return levels.find(fits) || levels[levels.length - 1];
}

module.exports = {
    buildDayCard,
    buildWeekCard,
    matchLine,
    formatTime,
};
