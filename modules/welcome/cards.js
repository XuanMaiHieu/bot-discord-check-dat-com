/**
 * Thẻ chào mừng quay lại (Components V2).
 * customId: "welcome:see:<tính năng>", người bấm lấy từ tài khoản Discord.
 */
const {
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    SectionBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    escapeMarkdown,
} = require("discord.js");
const { WELCOME } = require("./texts");

const PREFIX = "welcome:";
const SEE_PREFIX = `${PREFIX}see:`;
const COLOR = 0x22c55e; // xanh lá

function text(container, content) {
    container.addTextDisplayComponents((t) => t.setContent(content));
}

function divider(container) {
    container.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));
}

/**
 * @param {object} p
 * @param {string} p.name - tên gọi người nhận
 * @param {string} p.adminId - Discord ID admin, để tag ở cuối thẻ
 * @param {string} p.mealWeekButtonId - customId nút "Xem cả tuần" của bot
 */
function buildWelcomeCard({ name, adminId, mealWeekButtonId }) {
    const container = new ContainerBuilder().setAccentColor(COLOR);
    text(container, WELCOME.title.replace("{name}", escapeMarkdown(name)));
    text(container, WELCOME.intro);
    divider(container);

    const buttonIds = {
        meal_week: mealWeekButtonId,
        gold: `${SEE_PREFIX}gold`,
        fuel: `${SEE_PREFIX}fuel`,
        football: `${SEE_PREFIX}football`,
    };
    for (const feature of WELCOME.features) {
        const content = `**${feature.title}**\n${feature.text}`;
        const buttonId = buttonIds[feature.key];
        if (!buttonId) {
            text(container, content);
            continue;
        }
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setCustomId(buttonId)
                        .setLabel(feature.button || WELCOME.seeButton)
                        .setStyle(ButtonStyle.Secondary)
                )
        );
    }
    text(container, WELCOME.commandsHint);

    divider(container);
    text(container, WELCOME.outro.replace("{admin}", `<@${adminId}>`));
    return container;
}

module.exports = { PREFIX, SEE_PREFIX, buildWelcomeCard };
