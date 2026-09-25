const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { getFuelPrices } = require("../utils/fuel-price");
const { buildFuelCard, FUEL_NOTIFY_BUTTON_ID, FUEL_NOTIFY_ALERT_BUTTON_ID } = require("../utils/fuel-card");
const { cardPayload } = require("../utils/card-message");
const { isFuelSubscriber, setFuelSubscriber } = require("../utils/fuel-subscribers");

const giaxangCommand = new SlashCommandBuilder()
    .setName("giaxang")
    .setDescription("Xem giá bán lẻ xăng dầu Petrolimex hiện tại (vùng 1, vùng 2)")
    .toJSON();

// Thẻ giá hiện tại cho người bấm / gọi lệnh (dùng cả cho nút "Xem ngay" của module)
async function buildFuelCardFor(interaction) {
    const report = await getFuelPrices();
    return { card: buildFuelCard(report, { subscribed: isFuelSubscriber(interaction.user.id) }) };
}

/**
 * Xử lý /giaxang (chỉ người gọi thấy).
 */
async function handleGiaxangCommand(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { card } = await buildFuelCardFor(interaction);
    await interaction.editReply(cardPayload(card));
}

/**
 * Nút "🔔 Bật / 🔕 Tắt báo khi giá đổi": đổi đăng ký của người bấm (lưu trong
 * data/fuel-subscribers.json), rồi dựng lại chính thẻ đó với nhãn nút mới.
 */
async function handleNotifyButton(interaction) {
    const discordId = interaction.user.id;
    const subscribed = !isFuelSubscriber(discordId);
    try {
        setFuelSubscriber(discordId, subscribed);
    } catch (error) {
        console.error("❌ Không lưu được đăng ký báo giá xăng:", error);
        await interaction.reply({ content: `❌ Không lưu được: ${error.message}`, flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferUpdate();
    const alert = interaction.customId === FUEL_NOTIFY_ALERT_BUTTON_ID;
    const report = await getFuelPrices();
    await interaction.editReply(cardPayload(buildFuelCard(report, { subscribed, alert })));
    await interaction.followUp({
        content: subscribed
            ? "🔔 Đã bật: giá xăng dầu đổi là bot nhắn bạn ngay."
            : "🔕 Đã tắt báo giá xăng dầu. Muốn bật lại thì gõ `/giaxang` và bấm nút nhé.",
        flags: MessageFlags.Ephemeral,
    });
}

module.exports = {
    commands: [{ data: giaxangCommand, execute: handleGiaxangCommand }],
    buttons: [
        { customId: FUEL_NOTIFY_BUTTON_ID, execute: handleNotifyButton },
        { customId: FUEL_NOTIFY_ALERT_BUTTON_ID, execute: handleNotifyButton },
    ],
    buildFuelCardFor,
};
