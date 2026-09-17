/**
 * Lấy lịch thi đấu Ngoại hạng Anh từ ESPN và chuẩn hóa dữ liệu.
 *
 * Lưu ý về API ESPN (kiểm tra 09/2026):
 * - Truy vấn theo khoảng ngày (dates=YYYYMMDD-YYYYMMDD) bị từ chối (HTTP 400),
 *   chỉ còn truy vấn 1 ngày hoặc cả tháng (dates=YYYYMM) chạy được.
 * - Ngày trong truy vấn tính theo giờ UTC. Trận 19:00 UTC thứ Hai là 02:00 thứ Ba
 *   giờ Việt Nam, nên phải lấy cả tháng rồi tự lọc theo giờ Việt Nam.
 */
const { addDays, startOfDay } = require("./workdays");

const LEAGUE = {
    slug: "eng.1",
    name: "Ngoại hạng Anh",
    logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png",
};

// Top 6 + Aston Villa: nhóm đội nhận tin tự động và có sẵn trong /fbname
const FEATURED_TEAMS = [
    "Arsenal",
    "Manchester City",
    "Manchester United",
    "Liverpool",
    "Chelsea",
    "Tottenham Hotspur",
    "Aston Villa",
];

const FETCH_TIMEOUT_MS = 10 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000; // tỉ số trận đang đá vẫn đủ mới
const monthCache = new Map();

// "202609"
function monthKey(date) {
    return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function fetchMonthEvents(key) {
    const cached = monthCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.events;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUE.slug}/scoreboard?dates=${key}`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`ESPN trả về HTTP ${response.status}`);

        const data = await response.json();
        if (!Array.isArray(data.events)) {
            throw new Error(`ESPN trả về dữ liệu lạ: ${JSON.stringify(data).slice(0, 100)}`);
        }

        monthCache.set(key, { events: data.events, fetchedAt: Date.now() });
        return data.events;
    } finally {
        clearTimeout(timer);
    }
}

// Bàn thắng / thẻ đỏ của 1 trận, gom theo đội
function extractHighlights(competition, teamId) {
    const goals = [];
    let redCards = 0;

    for (const detail of competition.details || []) {
        if (detail.redCard && detail.team?.id === teamId) redCards++;
        if (!detail.scoringPlay || detail.shootout) continue;

        // Bàn phản lưới được ESPN ghi cho đội hưởng bàn thắng
        if (detail.team?.id !== teamId) continue;

        const player = detail.athletesInvolved?.[0];
        const name = player?.shortName || player?.displayName || "?";
        const tags = [detail.penaltyKick ? "pen" : null, detail.ownGoal ? "phản lưới" : null].filter(Boolean);
        goals.push({
            player: name,
            minute: detail.clock?.displayValue || "",
            note: tags.join(", "),
        });
    }
    return { goals, redCards };
}

function normalizeTeam(competitor, competition) {
    const team = competitor.team || {};
    return {
        id: team.id,
        name: team.displayName || team.shortDisplayName || "?",
        shortName: team.shortDisplayName || team.displayName || "?",
        abbreviation: team.abbreviation || "",
        logo: team.logo || null,
        score: competitor.score ?? null,
        winner: competitor.winner === true,
        ...extractHighlights(competition, team.id),
    };
}

// Trạng thái trận: upcoming | live | finished | postponed | canceled
function normalizeStatus(status) {
    const type = status?.type || {};
    const name = type.name || "";

    if (/POSTPONED|DELAYED/.test(name)) return { phase: "postponed", detail: "Hoãn" };
    if (/CANCELED|CANCELLED|ABANDONED|FORFEIT/.test(name)) return { phase: "canceled", detail: "Hủy" };
    if (type.state === "in") {
        const detail = /HALFTIME/.test(name) ? "Nghỉ giữa hiệp" : status.displayClock || type.shortDetail || "Đang đá";
        return { phase: "live", detail };
    }
    if (type.state === "post" || type.completed) {
        const detail = /AET|EXTRA/.test(name) ? "Sau hiệp phụ" : /PEN/.test(name) ? "Sau luân lưu" : "Kết thúc";
        return { phase: "finished", detail };
    }
    return { phase: "upcoming", detail: "" };
}

function normalizeEvent(event) {
    const competition = event.competitions?.[0] || {};
    const competitors = competition.competitors || [];
    const home = competitors.find((c) => c.homeAway === "home") || competitors[0];
    const away = competitors.find((c) => c.homeAway === "away") || competitors[1];

    return {
        id: event.id,
        kickoff: new Date(event.date),
        ...normalizeStatus(event.status || competition.status),
        venue: competition.venue?.fullName || null,
        home: normalizeTeam(home || {}, competition),
        away: normalizeTeam(away || {}, competition),
    };
}

/**
 * Các trận có giờ đá (giờ Việt Nam) nằm trong [from, to], sắp theo giờ đá.
 * @param {Date} from - Tính từ đầu ngày
 * @param {Date} to - Tính hết ngày
 */
async function getMatchesBetween(from, to) {
    const start = startOfDay(from);
    const end = addDays(startOfDay(to), 1); // hết ngày `to`

    // Tháng UTC cần lấy: từ tháng của `start` tới tháng của `end`
    const keys = new Set();
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) keys.add(monthKey(d));
    keys.add(monthKey(end));

    const results = await Promise.all([...keys].map(fetchMonthEvents));
    const seen = new Set();
    return results
        .flat()
        .filter((event) => (seen.has(event.id) ? false : seen.add(event.id)))
        .map(normalizeEvent)
        .filter((m) => m.kickoff >= start && m.kickoff < end)
        .sort((a, b) => a.kickoff - b.kickoff);
}

// Thứ 2 và Chủ nhật của tuần chứa `date`
function getWeekRange(date = new Date()) {
    const monday = addDays(startOfDay(date), -((date.getDay() + 6) % 7));
    return { monday, sunday: addDays(monday, 6) };
}

function isTeamInMatch(match, teamName) {
    const target = String(teamName).toLowerCase();
    return [match.home, match.away].some(
        (t) => t.name.toLowerCase() === target || t.shortName.toLowerCase() === target
    );
}

module.exports = {
    LEAGUE,
    FEATURED_TEAMS,
    getMatchesBetween,
    getWeekRange,
    isTeamInMatch,
    normalizeEvent,
};
