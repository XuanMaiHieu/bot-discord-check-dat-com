const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

// Format ngày tháng cho ESPN API
const formatDateForESPN = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const d_ = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${d_}`;
};

// Hàm tạo Embed cho 1 trận đấu
function createMatchEmbed(event) {
    const competitors = event.competitions[0].competitors;
    const homeTeam = competitors.find((c) => c.homeAway === "home");
    const awayTeam = competitors.find((c) => c.homeAway === "away");
    
    const homeName = homeTeam.team.displayName;
    const awayName = awayTeam.team.displayName;
    const homeLogo = homeTeam.team.logo;
    const awayLogo = awayTeam.team.logo;
    
    const isCompleted = event.status.type.completed;
    
    const embed = new EmbedBuilder()
        .setAuthor({ 
            name: "Ngoại hạng Anh", 
            iconURL: "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png" 
        })
        .setTitle(`${homeName}  ⚔️  ${awayName}`)
        .setThumbnail(homeLogo) // Logo đội nhà ở góc phải trên
        .setFooter({ text: `Đội khách: ${awayName}`, iconURL: awayLogo }); // Logo đội khách ở dưới cùng
        
    if (isCompleted) {
        const homeScore = homeTeam.score;
        const awayScore = awayTeam.score;
        embed.setColor(0x00FF00); // Xanh lá - Đã kết thúc
        embed.addFields(
            { name: "🏆 Tỉ số", value: `**${homeScore} - ${awayScore}**`, inline: true },
            { name: "📌 Trạng thái", value: "Đã kết thúc", inline: true }
        );
    } else {
        const time = new Date(event.date).toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });
        embed.setColor(0x0099FF); // Xanh dương - Chưa đá
        embed.addFields(
            { name: "🕒 Thời gian", value: time, inline: true },
            { name: "📌 Trạng thái", value: "Sắp diễn ra", inline: true }
        );
    }

    return embed;
}

// Hàm lấy trận đấu của 1 ngày
async function getMatchesByDate(dateString) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${dateString}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.events || data.events.length === 0) return [];
        
        const embeds = [];
        data.events.forEach((event) => {
            embeds.push(createMatchEmbed(event));
        });
        return embeds;
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
        
        const embeds = [];
        data.events.forEach((event) => {
            const competitors = event.competitions[0].competitors;
            const homeTeam = competitors.find((c) => c.homeAway === "home");
            const awayTeam = competitors.find((c) => c.homeAway === "away");
            
            if (homeTeam.team.displayName === teamName || awayTeam.team.displayName === teamName || 
                homeTeam.team.shortDisplayName === teamName || awayTeam.team.shortDisplayName === teamName) {
                embeds.push(createMatchEmbed(event));
            }
        });
        return embeds;
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
            const diff = targetDate.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
            targetDate = new Date(targetDate.setDate(diff));
            
            if (dayOfWeek === 0) { // Sunday
                targetDate.setDate(targetDate.getDate() + 6);
            } else {
                targetDate.setDate(targetDate.getDate() + (dayOfWeek - 1));
            }
        }
        
        const dateString = formatDateForESPN(targetDate);
        const displayDate = targetDate.toLocaleDateString("vi-VN");
        
        const embeds = await getMatchesByDate(dateString);
        
        if (embeds.length === 0) {
            await interaction.editReply(`📅 Không có trận đấu Ngoại hạng Anh nào vào ngày ${displayDate}.`);
            return;
        }
        
        await interaction.editReply({ 
            content: `📅 **Lịch thi đấu Ngoại hạng Anh ngày ${displayDate}**`,
            embeds: embeds.slice(0, 10) 
        });
        
        if (embeds.length > 10) {
            await interaction.followUp({ embeds: embeds.slice(10, 20) });
        }
        
    } else if (interaction.commandName === "fbname") {
        const teamName = interaction.options.getString("team");
        const embeds = await getMatchesByTeam(teamName);
        
        if (embeds.length === 0) {
            await interaction.editReply(`⚽ Không có lịch thi đấu của **${teamName}** trong tuần này.`);
            return;
        }
        
        await interaction.editReply({ 
            content: `⚽ **Lịch thi đấu của ${teamName} trong tuần này**`,
            embeds: embeds.slice(0, 10) 
        });
        
        if (embeds.length > 10) {
            await interaction.followUp({ embeds: embeds.slice(10, 20) });
        }
    }
}

module.exports = {
    fbdateCommand,
    fbnameCommand,
    handleFootballCommands
};