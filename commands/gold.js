const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { getTodayGoldPrices, getGoldPricesByDate } = require("../utils/gold-price");
const { buildGoldCard, GOLD_REFRESH_BUTTON_ID } = require("../utils/gold-card");
const { cardPayload } = require("../utils/card-message");
const { parseDayMonth, startOfDay, toDateKey } = require("../utils/workdays");
const { alertGoldSourceProblem } = require("../scheduler/gold-health-check");
const { renderGoldImage, imageAttachment } = require("../utils/price-image");

const IMAGE_FILE_NAME = "gia-vang.png";

// Thẻ giá vàng kèm ảnh bảng giá (vẽ lỗi thì thẻ chữ)
async function buildCardWithImage(report, options) {
    const { imageFileName, files } = imageAttachment(await renderGoldImage(report, options), IMAGE_FILE_NAME);
    return { card: buildGoldCard(report, { ...options, imageFileName }), files };
}

const giavangCommand = new SlashCommandBuilder()
    .setName("giavang")
    .setDescription("Xem giá vàng Phú Quý hôm nay (SJC, nhẫn tròn)")
    .addStringOption((option) =>
        option
            .setName("ngay")
            .setDescription("Xem giá ngày cũ DD/MM, vd 15/09 (bỏ trống = hôm nay)")
            .setRequired(false)
    )
    .toJSON();

// Giá hôm nay -> thẻ. Nguồn Phú Quý lỗi thì báo root (tối đa 1 lần/ngày)
async function buildTodayCard(interaction, { refresh = false } = {}) {
    const report = await getTodayGoldPrices({ refresh });
    if (report.primaryError) {
        alertGoldSourceProblem(interaction.client, report.primaryError);
    }
    if (!report.result) {
        return { error: `Không lấy được giá vàng lúc này, thử lại sau nhé.\n-# ${report.failures.join(" | ")}` };
    }
    return buildCardWithImage(report, { isToday: true });
}

/**
 * Xử lý /giavang (chỉ người gọi thấy).
 */
async function handleGiavangCommand(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const dayText = interaction.options.getString("ngay");
        const today = startOfDay(new Date());
        const date = dayText ? parseDayMonth(dayText, today) : today;
        if (!date) {
            await interaction.editReply(`❌ Ngày "${dayText}" không đúng định dạng DD/MM`);
            return;
        }
        if (date > today) {
            await interaction.editReply("❌ Chưa có giá vàng của ngày trong tương lai");
            return;
        }

        if (toDateKey(date) === toDateKey(today)) {
            const { card, files, error } = await buildTodayCard(interaction);
            await interaction.editReply(card ? cardPayload(card, { files }) : `❌ ${error}`);
            return;
        }

        let report;
        try {
            report = await getGoldPricesByDate(date);
        } catch (error) {
            await interaction.editReply(`❌ Không có giá vàng Phú Quý ngày ${dayText}: ${error.message}`);
            return;
        }
        const { card, files } = await buildCardWithImage(report, { isToday: false });
        await interaction.editReply(cardPayload(card, { files }));
    } catch (error) {
        console.error("❌ Lỗi khi xử lý /giavang:", error);
        await interaction.editReply(`❌ Có lỗi xảy ra: ${error.message}`);
    }
}

/**
 * Nút "🔄 Làm mới": cập nhật lại chính thẻ đang xem.
 */
async function handleGoldRefreshButton(interaction) {
    await interaction.deferUpdate();
    const { card, files, error } = await buildTodayCard(interaction, { refresh: true });
    if (card) {
        // attachments: [] bỏ ảnh cũ, chỉ giữ ảnh mới
        await interaction.editReply({ ...cardPayload(card, { files }), attachments: [] });
    } else {
        await interaction.followUp({ content: `❌ ${error}`, flags: MessageFlags.Ephemeral });
    }
}

module.exports = {
    commands: [{ data: giavangCommand, execute: handleGiavangCommand }],
    buildTodayCard,
    buttons: [{ customId: GOLD_REFRESH_BUTTON_ID, execute: handleGoldRefreshButton }],
};
