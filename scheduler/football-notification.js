const cron = require("node-cron");
const {
    FEATURED_TEAMS,
    getMatchesBetween,
    getWeekRange,
    isTeamInMatch,
} = require("../utils/football");
const { buildWeekCard } = require("../utils/football-card");
const { sendCardToUser } = require("../utils/card-message");
const { getTeamEmojis, teamsOfMatches } = require("../utils/team-emoji");
const { addDays, formatDayMonth } = require("../utils/workdays");
const { loadRecipients, recipientsFromIds } = require("../utils/users");

// Người nhận lịch bóng đá
function loadFootballUsers() {
    return loadRecipients((user) => user.football_notify === true);
}

// Các trận trong tuần hiện tại có ít nhất 1 đội thuộc nhóm theo dõi
async function getWeeklyMatches(date = new Date()) {
    const week = getWeekRange(date);
    const matches = await getMatchesBetween(week.monday, week.sunday);
    return {
        week,
        matches: matches.filter((m) => FEATURED_TEAMS.some((team) => isTeamInMatch(m, team))),
    };
}

/**
 * Gửi tin lịch thi đấu trong tuần của nhóm đội theo dõi.
 * @param {object} client - Discord client
 * @param {object} options
 * @param {string[]|null} options.targetUserIds - Chỉ gửi cho các ID này (test)
 * @returns {object} { sent, failed, total, matchCount, details, error }
 */
async function runFootballNotification(client, { targetUserIds = null } = {}) {
    const report = { sent: 0, failed: 0, total: 0, matchCount: 0, details: [], error: null };
    const isTest = Boolean(targetUserIds);

    const recipients = isTest ? recipientsFromIds(targetUserIds) : loadFootballUsers();
    report.total = recipients.length;

    if (recipients.length === 0) {
        console.log("Không có user nào đăng ký nhận thông báo bóng đá.");
        return report;
    }

    let week;
    let matches;
    try {
        ({ week, matches } = await getWeeklyMatches());
    } catch (error) {
        report.error = `Không lấy được lịch thi đấu từ ESPN: ${error.message}`;
        console.error(`❌ ${report.error}`);
        return report;
    }
    report.matchCount = matches.length;

    // Cron thật: tuần không có trận thì không gửi. Test vẫn gửi để xem thẻ trống
    if (matches.length === 0 && !isTest) {
        console.log("Không có trận đấu nào của Top 6 + Aston Villa trong tuần này.");
        return report;
    }

    const card = buildWeekCard({
        title: `🗓️ Lịch tuần ${formatDayMonth(week.monday)} – ${formatDayMonth(week.sunday)}`,
        subtitle: "Top 6 + Aston Villa",
        matches,
        emptyText: "Tuần này các đội theo dõi không có trận nào.",
        emojis: await getTeamEmojis(client, teamsOfMatches(matches)),
    });

    for (const user of recipients) {
        const result = await sendCardToUser(client, user.discordId, card);
        const displayName =
            user.name || result.user?.globalName || result.user?.username || user.discordId;

        if (result.success) {
            report.sent++;
            report.details.push(`✅ ${displayName}`);
        } else {
            report.failed++;
            report.details.push(`❌ ${displayName}: ${result.error}`);
        }

        // Delay 1 giây tránh rate limit
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(`⚽ Thông báo bóng đá: gửi ${report.sent}/${report.total} (${matches.length} trận)`);
    return report;
}

// Tạo sẵn emoji logo cho các đội có trận trong khoảng 45 ngày tới, để lệnh bóng
// đá đầu tiên không phải chờ tạo emoji. Chạy nền, lỗi chỉ ghi log.
async function warmUpTeamEmojis(client) {
    try {
        const today = new Date();
        const matches = await getMatchesBetween(today, addDays(today, 45));
        const emojis = await getTeamEmojis(client, teamsOfMatches(matches));
        console.log(`✅ Emoji logo đội bóng sẵn sàng: ${emojis.size} đội`);
    } catch (error) {
        console.error(`❌ Không chuẩn bị được emoji logo đội bóng: ${error.message}`);
    }
}

// Khởi tạo scheduler
function startFootballScheduler(client) {
    warmUpTeamEmojis(client);

    // Gửi thông báo vào 10h sáng Thứ 2 và Thứ 6 hàng tuần
    const cronExpression = "0 10 * * 1,5";

    cron.schedule(cronExpression, async () => {
        console.log("Đang chạy lịch thông báo bóng đá Ngoại hạng Anh...");
        try {
            await runFootballNotification(client);
        } catch (error) {
            console.error(`❌ Lỗi khi gửi thông báo bóng đá: ${error.message}`);
        }
    });
}

module.exports = {
    startFootballScheduler,
    runFootballNotification,
    getWeeklyMatches, // Export để test nếu cần
};
