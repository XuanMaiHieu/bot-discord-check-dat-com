const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    InteractionContextType,
    ApplicationIntegrationType,
} = require("discord.js");
const {
    parseDayMonth,
    formatLongDay,
    startOfDay,
    isWeekend,
    loadMakeupDays,
    addMakeupDay,
    removeMakeupDay,
    getUpcomingSaturday,
} = require("../utils/workdays");
const { findDateColumn } = require("../utils/meal-sheet");
const { denyUnlessRoot } = require("../utils/admin");

const DATE_OPTION_DESCRIPTION = "Ngày DD/MM, vd 26/09 (bỏ trống = thứ 7 tuần này)";

// Định nghĩa command /lam-bu (chỉ admin - Mai Xuân Hiếu - được dùng)
const lamBuCommand = new SlashCommandBuilder()
    .setName("lam-bu")
    .setDescription("[Admin] Bật / tắt thông báo 12h vào thứ 7 (CN) khi tuần đó làm bù")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    // Chỉ dùng trong server: trong DM Discord không áp dụng quyền Administrator,
    // nên không giới hạn thì ai DM với bot cũng thấy lệnh này
    .setContexts([InteractionContextType.Guild])
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .addSubcommand((sub) =>
        sub
            .setName("bat")
            .setDescription("Bật báo cơm + nhắc đứng dậy cho 1 ngày làm bù")
            .addStringOption((option) =>
                option.setName("ngay").setDescription(DATE_OPTION_DESCRIPTION).setRequired(false)
            )
    )
    .addSubcommand((sub) =>
        sub
            .setName("tat")
            .setDescription("Tắt một ngày làm bù đã bật")
            .addStringOption((option) =>
                option.setName("ngay").setDescription(DATE_OPTION_DESCRIPTION).setRequired(false)
            )
    )
    .addSubcommand((sub) =>
        sub.setName("xem").setDescription("Xem các ngày làm bù sắp tới")
    )
    .toJSON();

// Ngày từ option (hoặc thứ 7 tuần này). Trả về { date } hoặc { error }
function resolveDateOption(interaction) {
    const text = interaction.options.getString("ngay");
    if (!text) return { date: getUpcomingSaturday(new Date()) };

    const date = parseDayMonth(text, new Date());
    if (!date) return { error: `Ngày "${text}" không đúng định dạng DD/MM` };
    return { date };
}

function listUpcomingMakeupDays() {
    const todayKey = startOfDay(new Date()).getTime();
    return loadMakeupDays()
        .map((key) => {
            const [y, m, d] = key.split("-").map(Number);
            return new Date(y, m - 1, d);
        })
        .filter((date) => date.getTime() >= todayKey);
}

/**
 * Xử lý /lam-bu.
 * @param {object} deps - { resolveSheetName, readSheetGrid }
 */
async function handleLamBuCommand(interaction, deps) {
    if (await denyUnlessRoot(interaction)) return;

    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        if (subcommand === "xem") {
            const days = listUpcomingMakeupDays();
            await interaction.editReply(
                days.length
                    ? `🛠️ **Ngày làm bù sắp tới:**\n${days.map((d) => `• ${formatLongDay(d)}`).join("\n")}`
                    : "📭 Chưa bật ngày làm bù nào sắp tới."
            );
            return;
        }

        const { date, error } = resolveDateOption(interaction);
        if (error) {
            await interaction.editReply(`❌ ${error}`);
            return;
        }
        const label = formatLongDay(date);

        if (subcommand === "tat") {
            const exists = listUpcomingMakeupDays().some(
                (d) => d.getTime() === startOfDay(date).getTime()
            );
            if (!exists) {
                await interaction.editReply(`ℹ️ ${label} chưa được bật làm bù, không có gì để tắt.`);
                return;
            }
            removeMakeupDay(date);
            await interaction.editReply(`✅ Đã tắt làm bù ${label}. Hôm đó bot sẽ không gửi thông báo 12h.`);
            return;
        }

        // subcommand === "bat"
        if (!isWeekend(date)) {
            await interaction.editReply(
                `❌ ${label} là ngày thường, bot vốn đã gửi thông báo. Chỉ cần bật cho thứ 7 hoặc chủ nhật.`
            );
            return;
        }
        if (startOfDay(date) < startOfDay(new Date())) {
            await interaction.editReply(`❌ ${label} đã qua rồi.`);
            return;
        }

        addMakeupDay(date);

        const lines = [
            `✅ Đã bật làm bù **${label}**.`,
            "• 12:00 hôm đó bot gửi thẻ báo cơm + nhắc đứng dậy như ngày thường.",
            "• Thẻ báo cơm hôm trước sẽ có dòng \"Ngày mai\" cho ngày này.",
        ];

        // Cảnh báo sớm nếu sheet chưa có cột ngày này (tới ngày vẫn chưa có thì
        // bot bỏ qua báo cơm và chỉ báo cho admin)
        const resolvedSheet = await deps.resolveSheetName();
        const grid = resolvedSheet.error ? null : await deps.readSheetGrid(resolvedSheet.sheetName);
        if (!grid || grid.error) {
            lines.push("", "⚠️ Không đọc được sheet để kiểm tra cột ngày này.");
        } else if (findDateColumn(grid.rows, date) === -1) {
            lines.push(
                "",
                `⚠️ Sheet "${resolvedSheet.sheetName}" **chưa có cột ${label}**. ` +
                "Nếu tới hôm đó HR vẫn chưa thêm cột, bot chỉ gửi nhắc đứng dậy và báo cho bạn, không gửi báo cơm."
            );
        }

        await interaction.editReply(lines.join("\n"));
    } catch (error) {
        console.error("❌ Lỗi khi xử lý /lam-bu:", error);
        await interaction.editReply(`❌ Có lỗi xảy ra: ${error.message}`);
    }
}

module.exports = {
    commands: [{ data: lamBuCommand, execute: handleLamBuCommand }],
};
