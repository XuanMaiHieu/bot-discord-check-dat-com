const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    InteractionContextType,
    ApplicationIntegrationType,
} = require("discord.js");
const {
    findNameInRows,
    findDateColumn,
    getMealAt,
    getUpcomingMeals,
    getLatestMeals,
    columnLetter,
} = require("../utils/meal-sheet");
const {
    buildUpcomingMealsCard,
    buildSingleDayMealCard,
    buildMultipleMealsCard,
} = require("../utils/meal-card");
const { cardPayload } = require("../utils/card-message");
const { parseDayMonth, formatLongDay, isWorkingDay } = require("../utils/workdays");

// Định nghĩa command /test-meal (chỉ root - Mai Xuân Hiếu - được dùng)
const testMealCommand = new SlashCommandBuilder()
    .setName("test-meal")
    .setDescription("[Root] Xem trước thẻ báo cơm 12h (gửi qua DM)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    // Chỉ dùng trong server: trong DM Discord không áp dụng quyền Administrator,
    // nên không giới hạn thì ai DM với bot cũng thấy lệnh này
    .setContexts([InteractionContextType.Guild])
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .addUserOption((option) =>
        option
            .setName("user")
            .setDescription("Xem thẻ của người này, thẻ gửi về DM của bạn (bỏ trống = của bạn)")
            .setRequired(false)
    )
    .addStringOption((option) =>
        option
            .setName("ngay")
            .setDescription("Giả lập ngày DD/MM, vd 18/09 để xem thẻ thứ 6 (bỏ trống = hôm nay)")
            .setRequired(false)
    )
    .toJSON();

// Đọc sheet đang cấu hình. Trả về { sheetName, rows } hoặc { error }
async function loadMealSheet({ resolveSheetName, readSheetGrid }) {
    const resolvedSheet = await resolveSheetName();
    if (resolvedSheet.error) return { error: resolvedSheet.error };

    const grid = await readSheetGrid(resolvedSheet.sheetName);
    if (grid.error) return { error: grid.error };

    return { sheetName: resolvedSheet.sheetName, rows: grid.rows };
}

// Các bữa từ hôm nay; sheet đã hết ngày thì lấy các ngày gần nhất
function getMealsForCard(rows, rowNumber, today) {
    const upcoming = getUpcomingMeals(rows, rowNumber, today, 5);
    return upcoming.length > 0 ? upcoming : getLatestMeals(rows, rowNumber, today, 5);
}

/**
 * Dựng thẻ /abcom. Trả về { card } hoặc { error } (chuỗi báo lỗi).
 * @param {object} deps - { resolveSheetName, readSheetGrid }
 * @param {string} name - Tên cần tìm
 * @param {string|null} day - Ngày người dùng nhập (DD/MM)
 */
async function buildAbcomCard(deps, name, day) {
    const sheet = await loadMealSheet(deps);
    if (sheet.error) return { error: sheet.error };
    const { rows, sheetName } = sheet;
    const today = new Date();

    const nameResult = findNameInRows(rows, name);
    if (nameResult.error) return { error: nameResult.error };

    const people = nameResult.matches || [nameResult];

    if (day) {
        const date = parseDayMonth(day, today);
        const column = date ? findDateColumn(rows, date) : -1;
        if (column === -1) {
            return { error: `Không tìm thấy ngày "${day}" trong dòng 4` };
        }

        if (!nameResult.matches) {
            return {
                card: buildSingleDayMealCard({
                    name: nameResult.name,
                    date,
                    dayLabel: day,
                    value: getMealAt(rows, nameResult.row, column),
                    position: `${columnLetter(column)}${nameResult.row}`,
                }),
            };
        }

        return {
            card: buildMultipleMealsCard({
                query: name,
                today,
                people: people.map((p) => ({
                    name: p.name,
                    date,
                    dayLabel: day,
                    value: getMealAt(rows, p.row, column),
                })),
            }),
        };
    }

    if (!nameResult.matches) {
        return {
            card: buildUpcomingMealsCard({
                name: nameResult.name,
                meals: getMealsForCard(rows, nameResult.row, today),
                today,
                sheetName,
                rowNumber: nameResult.row,
            }),
        };
    }

    return {
        card: buildMultipleMealsCard({
            query: name,
            today,
            people: people.map((p) => ({
                name: p.name,
                meals: getMealsForCard(rows, p.row, today),
            })),
        }),
    };
}

/**
 * Xử lý /abcom.
 * @param {object} deps - { resolveSheetName, readSheetGrid, getUserNameByDiscordId }
 */
async function handleAbcomCommand(interaction, deps) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let name = interaction.options.getString("name");
    const day = interaction.options.getString("day");

    if (!name) {
        name = deps.getUserNameByDiscordId(interaction.user.id);
        if (!name) {
            await interaction.editReply(
                "❌ Không tìm thấy tên của bạn trong hệ thống, vui lòng nhập tên thủ công"
            );
            return;
        }
    }

    const result = await buildAbcomCard(deps, name, day);
    if (result.error) {
        await interaction.editReply(`❌ ${result.error}`);
        return;
    }

    await interaction.editReply(cardPayload(result.card));
}

/**
 * Xử lý nút "📅 Xem cả tuần" trên thẻ báo cơm: hiện thực đơn các ngày tới
 * của chính người bấm (chỉ người đó thấy).
 */
async function handleMealWeekButton(interaction, deps) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const name = deps.getUserNameByDiscordId(interaction.user.id);
    if (!name) {
        await interaction.editReply(
            "❌ Không tìm thấy tên của bạn trong hệ thống, hãy dùng `/abcom name:<tên bạn>`"
        );
        return;
    }

    const result = await buildAbcomCard(deps, name, null);
    if (result.error) {
        await interaction.editReply(`❌ ${result.error}`);
        return;
    }

    await interaction.editReply(cardPayload(result.card));
}

/**
 * Xử lý /test-meal: chạy thử luồng báo cơm 12h cho 1 người.
 * @param {object} deps - { resolveSheetName, readSheetGrid, adminDiscordId }
 */
async function handleTestMealCommand(interaction, deps) {
    if (interaction.user.id !== deps.adminDiscordId) {
        await interaction.reply({
            content: "❌ Bạn không có quyền sử dụng lệnh này (chỉ root mới được dùng).",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Nạp muộn để tránh vòng lặp require với scheduler
    const { runDailyFoodNotification } = require("../scheduler/daily-food-notification");

    const target = interaction.options.getUser("user") || interaction.user;
    const dayText = interaction.options.getString("ngay");

    let date = new Date();
    if (dayText) {
        date = parseDayMonth(dayText, date);
        if (!date) {
            await interaction.editReply(`❌ Ngày "${dayText}" không đúng định dạng DD/MM`);
            return;
        }
    }

    try {
        const report = await runDailyFoodNotification(interaction.client, deps, {
            targetUserIds: [target.id],
            date,
            deliverToId: interaction.user.id,
        });

        const lines = [
            `🍽️ **Đã chạy thử thẻ báo cơm**`,
            `**Ngày giả lập:** ${formatLongDay(date)}` +
            (isWorkingDay(date) ? "" : " _(không phải ngày làm việc, cron thật sẽ bỏ qua)_"),
            `**Thẻ của:** ${target.tag} (gửi về DM của bạn)`,
            `**Kết quả:** ${report.sent} đã gửi / ${report.skipped} bỏ qua / ${report.failed} lỗi`,
        ];
        if (report.error) lines.push(`**Lỗi:** ${report.error}`);
        if (report.details.length > 0) lines.push("", ...report.details);

        await interaction.editReply(lines.join("\n"));
    } catch (error) {
        console.error("❌ Lỗi khi xử lý /test-meal:", error);
        await interaction.editReply(`❌ Có lỗi xảy ra: ${error.message}`);
    }
}

module.exports = {
    testMealCommand,
    handleAbcomCommand,
    handleMealWeekButton,
    handleTestMealCommand,
    buildAbcomCard,
};
