const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const TARGET_TEAMS = [
    "Arsenal",
    "Manchester City",
    "Manchester United",
    "Liverpool",
    "Chelsea",
    "Tottenham Hotspur",
    "Aston Villa",
];

// Lấy danh sách user có football_notify = true
function loadFootballUsers() {
    try {
        const usersFilePath = path.join(__dirname, "../data/users.json");
        const usersData = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));

        const enabledUsers = usersData.users.filter(
            (user) => user.football_notify === true && user.discordId !== null
        );

        return enabledUsers;
    } catch (error) {
        console.error("Lỗi khi đọc data/users.json:", error);
        return [];
    }
}

// Format ngày tháng cho ESPN API
const formatDateForESPN = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const d_ = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${d_}`;
};

// Lấy trận đấu của các đội top trong tuần hiện tại
async function getWeeklyMatches() {
    try {
        const today = new Date();
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(new Date().setDate(diff));
        const sunday = new Date(new Date().setDate(diff + 6));

        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${formatDateForESPN(
            monday
        )}-${formatDateForESPN(sunday)}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!data.events) return [];

        const matches = [];

        data.events.forEach((event) => {
            const competitors = event.competitions[0].competitors;
            const homeTeam = competitors.find((c) => c.homeAway === "home");
            const awayTeam = competitors.find((c) => c.homeAway === "away");

            const homeName = homeTeam.team.displayName;
            const awayName = awayTeam.team.displayName;

            // Kiểm tra xem trận này có đội trong top 6 + Aston Villa không
            const isTargetMatch =
                TARGET_TEAMS.includes(homeName) ||
                TARGET_TEAMS.includes(awayName);

            if (isTargetMatch) {
                const isCompleted = event.status.type.completed;
                let resultText = "";

                if (isCompleted) {
                    const homeScore = homeTeam.score;
                    const awayScore = awayTeam.score;
                    resultText = `✅ **${homeTeam.team.shortDisplayName} ${homeScore} - ${awayScore} ${awayTeam.team.shortDisplayName}**`;
                } else {
                    const time = new Date(event.date).toLocaleString("vi-VN", {
                        timeZone: "Asia/Ho_Chi_Minh",
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                    });
                    resultText = `🕒 **${homeTeam.team.shortDisplayName} vs ${awayTeam.team.shortDisplayName}** - Lúc: ${time}`;
                }

                matches.push(resultText);
            }
        });

        return matches;
    } catch (error) {
        console.error("Lỗi khi lấy dữ liệu bóng đá:", error);
        return [];
    }
}

// Khởi tạo scheduler
function startFootballScheduler(client) {
    // Gửi thông báo vào 10h sáng Thứ 2 và Thứ 6 hàng tuần
    const cronExpression = "0 10 * * 1,5";

    cron.schedule(cronExpression, async () => {
        console.log("Đang chạy lịch thông báo bóng đá Ngoại hạng Anh...");
        const users = loadFootballUsers();

        if (users.length === 0) {
            console.log("Không có user nào đăng ký nhận thông báo bóng đá.");
            return;
        }

        const matches = await getWeeklyMatches();

        if (matches.length === 0) {
            console.log("Không có trận đấu nào của Top 6 + Aston Villa trong tuần này.");
            return;
        }

        const message =
            `⚽ **Cập nhật Ngoại hạng Anh trong tuần (Top 6 + Aston Villa)** ⚽\n\n` +
            matches.join("\n\n");

        for (const user of users) {
            try {
                const discordUser = await client.users.fetch(user.discordId);
                await discordUser.send(message);
                // Delay 1 giây tránh rate limit
                await new Promise((resolve) => setTimeout(resolve, 1000));
            } catch (err) {
                console.error(`Không thể gửi tin nhắn bóng đá cho ${user.name}:`, err);
            }
        }
        console.log("Đã gửi xong thông báo bóng đá.");
    });
}

module.exports = {
    startFootballScheduler,
    getWeeklyMatches, // Export để test nếu cần
};
