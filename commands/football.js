const { SlashCommandBuilder } = require("discord.js");

// Format ngày tháng cho ESPN API
const formatDateForESPN = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const d_ = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${d_}`;
};

// Hàm lấy trận đấu của 1 ngày
async function getMatchesByDate(dateString) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${dateString}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.events || data.events.length === 0) return [];
        
        const matches = [];
        data.events.forEach((event) => {
            const competitors = event.competitions[0].competitors;
            const homeTeam = competitors.find((c) => c.homeAway === "home");
            const awayTeam = competitors.find((c) => c.homeAway === "away");
            
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
                });
                resultText = `🕒 **${homeTeam.team.shortDisplayName} vs ${awayTeam.team.shortDisplayName}** - Lúc: ${time}`;
            }
            
            matches.push(resultText);
        });
        return matches;
    } catch (error) {
        console.error(error);
        return [];
    }
}

// Hàm lấy trận đấu của 1 đội trong tuần
async function getMatchesByTeam(teamName) {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(new Date().setDate(diff));
    const sunday = new Date(new Date().setDate(diff + 6));

    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${formatDateForESPN(monday)}-${formatDateForESPN(sunday)}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.events) return [];
        
        const matches = [];
        data.events.forEach((event) => {
            const competitors = event.competitions[0].competitors;
            const homeTeam = competitors.find((c) => c.homeAway === "home");
            const awayTeam = competitors.find((c) => c.homeAway === "away");
            
            if (homeTeam.team.displayName === teamName || awayTeam.team.displayName === teamName || 
                homeTeam.team.shortDisplayName === teamName || awayTeam.team.shortDisplayName === teamName) {
                
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
                        year: "numeric"
                    });
                    resultText = `🕒 **${homeTeam.team.shortDisplayName} vs ${awayTeam.team.shortDisplayName}** - Lúc: ${time}`;
                }
                
                matches.push(resultText);
            }
        });
        return matches;
    } catch (error) {
        console.error(error);
        return [];
    }
}

const fbdateCommand = new SlashCommandBuilder()
    .setName("fbdate")
    .setDescription("Xem lịch thi đấu Ngoại hạng Anh theo ngày")
    .addStringOption(option =>
        option.setName("date")
            .setDescription("Chọn ngày xem lịch")
            .setRequired(true)
            .addChoices(
                { name: "Hôm nay", value: "today" },
                { name: "Ngày mai", value: "tomorrow" },
                { name: "Thứ 2 tuần này", value: "1" },
                { name: "Thứ 3 tuần này", value: "2" },
                { name: "Thứ 4 tuần này", value: "3" },
                { name: "Thứ 5 tuần này", value: "4" },
                { name: "Thứ 6 tuần này", value: "5" },
                { name: "Thứ 7 tuần này", value: "6" },
                { name: "Chủ Nhật tuần này", value: "0" }
            )
    )
    .toJSON();

const fbnameCommand = new SlashCommandBuilder()
    .setName("fbname")
    .setDescription("Xem lịch thi đấu Ngoại hạng Anh theo đội (trong tuần)")
    .addStringOption(option =>
        option.setName("team")
            .setDescription("Chọn đội bóng")
            .setRequired(true)
            .addChoices(
                { name: "Arsenal", value: "Arsenal" },
                { name: "Manchester City", value: "Manchester City" },
                { name: "Manchester United", value: "Manchester United" },
                { name: "Liverpool", value: "Liverpool" },
                { name: "Chelsea", value: "Chelsea" },
                { name: "Tottenham Hotspur", value: "Tottenham Hotspur" },
                { name: "Aston Villa", value: "Aston Villa" }
            )
    )
    .toJSON();

async function handleFootballCommands(interaction) {
    await interaction.deferReply();
    
    if (interaction.commandName === "fbdate") {
        const dateVal = interaction.options.getString("date");
        let targetDate = new Date();
        
        if (dateVal === "today") {
            // Keep targetDate as today
        } else if (dateVal === "tomorrow") {
            targetDate.setDate(targetDate.getDate() + 1);
        } else {
            // It's a day of the week (0-6)
            const dayOfWeek = parseInt(dateVal);
            const currentDay = targetDate.getDay();
            // Find the date of that day in the CURRENT week (Mon-Sun)
            const diff = targetDate.getDate() - currentDay + (currentDay === 0 ? -6 : 1); // Monday of current week
            targetDate = new Date(targetDate.setDate(diff)); // Set to Monday
            
            if (dayOfWeek === 0) { // Sunday
                targetDate.setDate(targetDate.getDate() + 6);
            } else {
                targetDate.setDate(targetDate.getDate() + (dayOfWeek - 1));
            }
        }
        
        const dateString = formatDateForESPN(targetDate);
        const displayDate = targetDate.toLocaleDateString("vi-VN");
        
        const matches = await getMatchesByDate(dateString);
        
        if (matches.length === 0) {
            await interaction.editReply(`📅 Không có trận đấu Ngoại hạng Anh nào vào ngày ${displayDate}.`);
            return;
        }
        
        const output = `📅 **Lịch thi đấu Ngoại hạng Anh ngày ${displayDate}**\n\n` + matches.join("\n");
        await interaction.editReply(output);
        
    } else if (interaction.commandName === "fbname") {
        const teamName = interaction.options.getString("team");
        const matches = await getMatchesByTeam(teamName);
        
        if (matches.length === 0) {
            await interaction.editReply(`⚽ Không có lịch thi đấu của **${teamName}** trong tuần này.`);
            return;
        }
        
        const output = `⚽ **Lịch thi đấu của ${teamName} trong tuần này**\n\n` + matches.join("\n\n");
        await interaction.editReply(output);
    }
}

module.exports = {
    fbdateCommand,
    fbnameCommand,
    handleFootballCommands
};