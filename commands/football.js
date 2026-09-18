const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    InteractionContextType,
    ApplicationIntegrationType,
} = require("discord.js");
const {
    FEATURED_TEAMS,
    getMatchesBetween,
    getWeekRange,
    isTeamInMatch,
} = require("../utils/football");
const { buildDayCard, buildWeekCard, matchLine } = require("../utils/football-card");
const { cardPayload } = require("../utils/card-message");
const { getTeamEmojis, teamsOfMatches } = require("../utils/team-emoji");
const { addDays, formatDayMonth, formatLongDay, startOfDay } = require("../utils/workdays");
const { denyUnlessRoot } = require("../utils/admin");

// Tìm trận kế tiếp của 1 đội trong khoảng này khi tuần hiện tại không có trận
const NEXT_MATCH_LOOKAHEAD_DAYS = 45;

const fbdateCommand = new SlashCommandBuilder()
    .setName("fbdate")
    .setDescription("Xem lịch thi đấu Ngoại hạng Anh theo ngày (giờ Việt Nam)")
    .addStringOption((option) =>
        option
            .setName("date")
            .setDescription("Chọn ngày xem lịch")
            .setRequired(true)
            .addChoices(
                { name: "Hôm qua", value: "yesterday" },
                { name: "Hôm nay", value: "today" },
                { name: "Ngày mai", value: "tomorrow" },
                { name: "Thứ 2 tuần này", value: "1" },
                { name: "Thứ 3 tuần này", value: "2" },
                { name: "Thứ 4 tuần này", value: "3" },
                { name: "Thứ 5 tuần này", value: "4" },
                { name: "Thứ 6 tuần này", value: "5" },
                { name: "Thứ 7 tuần này", value: "6" },
                { name: "Chủ nhật tuần này", value: "0" }
            )
    )
    .toJSON();

const fbnameCommand = new SlashCommandBuilder()
    .setName("fbname")
    .setDescription("Xem lịch thi đấu Ngoại hạng Anh của 1 đội trong tuần")
    .addStringOption((option) =>
        option
            .setName("team")
            .setDescription("Chọn đội bóng")
            .setRequired(true)
            .addChoices(...FEATURED_TEAMS.map((team) => ({ name: team, value: team })))
    )
    .toJSON();

// Định nghĩa command /test-football (chỉ root - Mai Xuân Hiếu - được dùng)
const testFootballCommand = new SlashCommandBuilder()
    .setName("test-football")
    .setDescription("[Root] Xem trước tin bóng đá tự động (thứ 2, thứ 6 lúc 10h) qua DM")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    // Chỉ dùng trong server: trong DM Discord không áp dụng quyền Administrator
    .setContexts([InteractionContextType.Guild])
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .toJSON();

// Ngày ứng với lựa chọn của /fbdate
function resolveDateChoice(value, today = new Date()) {
    if (value === "yesterday") return addDays(startOfDay(today), -1);
    if (value === "today") return startOfDay(today);
    if (value === "tomorrow") return addDays(startOfDay(today), 1);

    // Thứ trong tuần hiện tại (tuần tính từ thứ 2): 1 = thứ 2 ... 0 = chủ nhật
    const { monday } = getWeekRange(today);
    const weekday = Number(value);
    return addDays(monday, weekday === 0 ? 6 : weekday - 1);
}

function weekLabel({ monday, sunday }) {
    return `${formatDayMonth(monday)} – ${formatDayMonth(sunday)}`;
}

async function handleFbdate(interaction) {
    const date = resolveDateChoice(interaction.options.getString("date"));
    const matches = await getMatchesBetween(date, date);
    const emojis = await getTeamEmojis(interaction.client, teamsOfMatches(matches));
    await interaction.editReply(cardPayload(buildDayCard(date, matches, { emojis })));
}

async function handleFbname(interaction) {
    const team = interaction.options.getString("team");
    const week = getWeekRange(new Date());
    const matches = (await getMatchesBetween(week.monday, week.sunday)).filter((m) =>
        isTeamInMatch(m, team)
    );

    let emptyText = "Tuần này không có trận nào.";
    let emojis = await getTeamEmojis(interaction.client, teamsOfMatches(matches));
    if (matches.length === 0) {
        const from = addDays(week.sunday, 1);
        const upcoming = await getMatchesBetween(from, addDays(from, NEXT_MATCH_LOOKAHEAD_DAYS));
        const next = upcoming.find((m) => isTeamInMatch(m, team));
        if (next) {
            emojis = await getTeamEmojis(interaction.client, teamsOfMatches([next]));
            emptyText +=
                `\n⏭️ Trận tiếp theo · **${formatLongDay(next.kickoff)}**\n` +
                matchLine(next, { highlightTeam: team, emojis });
        }
    }

    const card = buildWeekCard({
        title: `🗓️ ${team}`,
        subtitle: `Tuần ${weekLabel(week)}`,
        matches,
        highlightTeam: team,
        emptyText,
        emojis,
    });
    await interaction.editReply(cardPayload(card));
}

async function handleFootballCommands(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        if (interaction.commandName === "fbdate") {
            await handleFbdate(interaction);
        } else if (interaction.commandName === "fbname") {
            await handleFbname(interaction);
        }
    } catch (error) {
        console.error(`❌ Lỗi khi xử lý /${interaction.commandName}:`, error);
        await interaction.editReply(`❌ Không lấy được lịch thi đấu từ ESPN: ${error.message}`);
    }
}

/**
 * Xử lý /test-football: gửi thử tin bóng đá tự động cho chính root.
 */
async function handleTestFootballCommand(interaction) {
    if (await denyUnlessRoot(interaction)) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Nạp muộn để tránh vòng lặp require với scheduler
    const { runFootballNotification } = require("../scheduler/football-notification");

    try {
        const report = await runFootballNotification(interaction.client, {
            targetUserIds: [interaction.user.id],
        });
        const lines = [
            "⚽ **Đã chạy thử tin bóng đá tự động**",
            `**Số trận của nhóm đội theo dõi:** ${report.matchCount}`,
            `**Kết quả:** ${report.sent} đã gửi / ${report.failed} lỗi`,
        ];
        if (report.error) lines.push(`**Lỗi:** ${report.error}`);
        if (report.details.length) lines.push("", ...report.details);
        await interaction.editReply(lines.join("\n"));
    } catch (error) {
        console.error("❌ Lỗi khi xử lý /test-football:", error);
        await interaction.editReply(`❌ Có lỗi xảy ra: ${error.message}`);
    }
}

module.exports = {
    commands: [
        { data: fbdateCommand, execute: handleFootballCommands },
        { data: fbnameCommand, execute: handleFootballCommands },
        { data: testFootballCommand, execute: handleTestFootballCommand },
    ],
};
