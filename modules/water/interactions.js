/**
 * Nút / menu của module (customId bắt đầu bằng "water:", xem cards.js).
 */
const { MessageFlags, ContainerBuilder } = require("discord.js");
const store = require("./store");
const { PRAISES, REMINDER, SETTINGS } = require("./texts");
const { ACTIONS, buildReminderCard, buildSettingsCard } = require("./cards");

const SNOOZE_MINUTES = 30;
const MAX_CUPS_PER_DAY = 20; // chặn bấm liên tục cho vui

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function settingsPayload(ctx, member, { ephemeral = false } = {}) {
    return ctx.cardPayload(buildSettingsCard(member, store.today(member).cups), { ephemeral });
}

function subscribe(discordId) {
    return store.updateMember(discordId, (m) => {
        m.subscribed = true;
        m.subscribedAt = new Date().toISOString();
        m.declinedAt = null;
    });
}

async function handleDrink(interaction, ctx) {
    const current = store.today(store.getMember(interaction.user.id) || {});
    if (current.cups >= MAX_CUPS_PER_DAY) {
        await interaction.reply({ content: REMINDER.tooMany, flags: MessageFlags.Ephemeral });
        return;
    }
    const member = store.updateMember(interaction.user.id, (m, day) => {
        day.cups += 1;
        day.lastDrinkAt = new Date().toISOString();
        day.snoozeUntil = null;
    });
    await interaction.update(ctx.cardPayload(buildReminderCard({ message: pick(PRAISES), cups: member.day.cups })));
}

async function handleSnooze(interaction, ctx) {
    const member = store.updateMember(interaction.user.id, (m, day) => {
        day.snoozeUntil = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000).toISOString();
    });
    await interaction.update(
        ctx.cardPayload(buildReminderCard({ message: REMINDER.snoozed, cups: member.day.cups, buttons: false }))
    );
}

async function handleOff(interaction, ctx) {
    const member = store.updateMember(interaction.user.id, (m, day) => {
        day.off = true;
    });
    await interaction.update(
        ctx.cardPayload(buildReminderCard({ message: REMINDER.off, cups: member.day.cups, buttons: false }))
    );
}

// Nút Đăng ký trên dòng giới thiệu ở thẻ cơm: trả lời riêng, không đụng thẻ cơm
async function handleSubscribe(interaction, ctx) {
    const member = subscribe(interaction.user.id);
    await interaction.reply(settingsPayload(ctx, member, { ephemeral: true }));
    await interaction.followUp({ content: SETTINGS.subscribed, flags: MessageFlags.Ephemeral });
}

// Nút Đăng ký trên thẻ mời / thẻ cài đặt: đổi luôn thẻ đó thành thẻ cài đặt
async function handleSubscribeHere(interaction, ctx) {
    const member = subscribe(interaction.user.id);
    await interaction.update(settingsPayload(ctx, member));
    await interaction.followUp({ content: SETTINGS.subscribed, flags: MessageFlags.Ephemeral });
}

async function handleUnsubscribe(interaction, ctx) {
    const member = store.updateMember(interaction.user.id, (m) => {
        m.subscribed = false;
    });
    await interaction.update(settingsPayload(ctx, member));
    await interaction.followUp({ content: SETTINGS.unsubscribed, flags: MessageFlags.Ephemeral });
}

async function handleDecline(interaction, ctx) {
    store.updateMember(interaction.user.id, (m) => {
        m.declinedAt = new Date().toISOString();
    });
    const card = new ContainerBuilder().addTextDisplayComponents((t) => t.setContent(`💧 ${SETTINGS.declined}`));
    await interaction.update(ctx.cardPayload(card));
}

async function handleInterval(interaction, ctx) {
    const minutes = Number(interaction.values[0]);
    if (!store.INTERVALS.includes(minutes)) return;
    const member = store.updateMember(interaction.user.id, (m) => {
        m.interval = minutes;
    });
    await interaction.update(settingsPayload(ctx, member));
}

const HANDLERS = {
    [ACTIONS.drink]: handleDrink,
    [ACTIONS.snooze]: handleSnooze,
    [ACTIONS.off]: handleOff,
    [ACTIONS.subscribe]: handleSubscribe,
    [ACTIONS.subscribeHere]: handleSubscribeHere,
    [ACTIONS.unsubscribe]: handleUnsubscribe,
    [ACTIONS.decline]: handleDecline,
    [ACTIONS.interval]: handleInterval,
};

async function handleInteraction(interaction, ctx) {
    const handler = HANDLERS[interaction.customId];
    if (handler) await handler(interaction, ctx);
}

module.exports = { handleInteraction, settingsPayload };
