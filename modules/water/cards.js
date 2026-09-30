/**
 * Giao diện module nhắc uống nước (thẻ Components V2).
 * customId: "water:<hành động>", người bấm lấy từ tài khoản Discord nên nút trên tin cũ vẫn chạy.
 */
const {
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    SeparatorSpacingSize,
    StringSelectMenuBuilder,
    TextDisplayBuilder,
    SectionBuilder,
} = require("discord.js");
const { INTERVALS } = require("./store");
const { GOAL_CUPS, BUTTONS, REMINDER, summaryText, SETTINGS, INVITE, PROMO } = require("./texts");

const PREFIX = "water:";
const COLOR = 0x0ea5e9; // xanh nước

const ACTIONS = {
    drink: `${PREFIX}drink`,
    snooze: `${PREFIX}snooze`,
    off: `${PREFIX}off`,
    resume: `${PREFIX}resume`, // bật lại hôm nay, trên tin nhắc đã tắt
    resumeHere: `${PREFIX}resume-here`, // bật lại hôm nay, trên thẻ cài đặt
    subscribe: `${PREFIX}sub`, // trả lời riêng (dòng giới thiệu trong thẻ cơm, không được sửa thẻ cơm)
    subscribeHere: `${PREFIX}sub-here`, // sửa tại chỗ thẻ mời / thẻ cài đặt
    unsubscribe: `${PREFIX}unsub`,
    decline: `${PREFIX}decline`,
    interval: `${PREFIX}interval`,
};

function text(container, content) {
    container.addTextDisplayComponents((t) => t.setContent(content));
}

function button(customId, label, emoji, style = ButtonStyle.Secondary) {
    return new ButtonBuilder().setCustomId(customId).setLabel(label).setEmoji(emoji).setStyle(style);
}

// "💧💧💧▫️▫️▫️▫️▫️ Hôm nay: 3/8 cốc"
function cupsLine(cups) {
    const filled = Math.min(cups, GOAL_CUPS);
    const glasses = "💧".repeat(filled) + "▫️".repeat(GOAL_CUPS - filled);
    return `${glasses} ${REMINDER.today.replace("{cups}", cups).replace("{goal}", GOAL_CUPS)}`;
}

/**
 * Tin nhắc. `status` = câu thay cho câu nhắc sau khi bấm nút (vd "Ngoan! 💙");
 * `buttons: false` khi đã hoãn; `off: true` khi đã tắt hôm nay (chỉ còn nút Bật lại).
 */
function buildReminderCard({ message, cups, buttons = true, off = false }) {
    const container = new ContainerBuilder().setAccentColor(COLOR);
    text(container, `### ${message}`);
    text(container, cupsLine(cups));
    if (off) {
        container.addActionRowComponents((row) =>
            row.setComponents(button(ACTIONS.resume, BUTTONS.resume, "🔔", ButtonStyle.Primary))
        );
    } else if (buttons) {
        container.addActionRowComponents((row) =>
            row.setComponents(
                button(ACTIONS.drink, BUTTONS.drink, "💧", ButtonStyle.Primary),
                button(ACTIONS.snooze, BUTTONS.snooze, "⏰"),
                button(ACTIONS.off, BUTTONS.off, "🔕")
            )
        );
    }
    return container;
}

function buildSummaryCard(cups) {
    const container = new ContainerBuilder().setAccentColor(COLOR);
    text(container, summaryText(cups));
    text(container, cupsLine(cups));
    return container;
}

// Thẻ cài đặt (/uongnuoc và sau khi đăng ký): trạng thái, chọn tần suất, bật / tắt.
// `day` = số liệu hôm nay (store.today)
function buildSettingsCard(member, day) {
    const container = new ContainerBuilder().setAccentColor(COLOR);
    text(container, SETTINGS.title);
    text(container, member?.subscribed ? SETTINGS.on.replace("{interval}", member.interval) : SETTINGS.off);
    if (member?.subscribed) text(container, cupsLine(day.cups));
    if (member?.subscribed && day.off) {
        container.addSectionComponents((section) =>
            section
                .addTextDisplayComponents((t) => t.setContent(SETTINGS.offToday))
                .setButtonAccessory(button(ACTIONS.resumeHere, BUTTONS.resume, "🔔", ButtonStyle.Primary))
        );
    }
    text(container, SETTINGS.schedule);
    container.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    if (member?.subscribed) {
        container.addActionRowComponents((row) =>
            row.setComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(ACTIONS.interval)
                    .setPlaceholder(SETTINGS.intervalPlaceholder)
                    .setOptions(
                        INTERVALS.map((minutes) => ({
                            label: SETTINGS.intervalLabel.replace("{interval}", minutes),
                            value: String(minutes),
                            default: member.interval === minutes,
                        }))
                    )
            )
        );
        container.addActionRowComponents((row) =>
            row.setComponents(button(ACTIONS.unsubscribe, BUTTONS.unsubscribe, "⏸️", ButtonStyle.Danger))
        );
    } else {
        container.addActionRowComponents((row) =>
            row.setComponents(button(ACTIONS.subscribeHere, BUTTONS.subscribe, "💧", ButtonStyle.Success))
        );
    }
    return container;
}

function buildInviteCard() {
    const container = new ContainerBuilder().setAccentColor(COLOR);
    text(container, INVITE.title);
    text(container, INVITE.body);
    container.addActionRowComponents((row) =>
        row.setComponents(
            button(ACTIONS.subscribeHere, BUTTONS.subscribe, "💧", ButtonStyle.Success),
            button(ACTIONS.decline, BUTTONS.decline, "🙅")
        )
    );
    return container;
}

// Dòng giới thiệu chèn vào thẻ báo cơm 12h (chữ + nút Đăng ký bên phải)
function buildPromoSection() {
    return new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(PROMO))
        .setButtonAccessory(button(ACTIONS.subscribe, BUTTONS.subscribe, "💧", ButtonStyle.Success));
}

module.exports = {
    PREFIX,
    ACTIONS,
    buildReminderCard,
    buildSummaryCard,
    buildSettingsCard,
    buildInviteCard,
    buildPromoSection,
};
