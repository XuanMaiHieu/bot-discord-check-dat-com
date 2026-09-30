/**
 * Hẹn giờ nhắc uống nước (chỉ ngày làm việc, giờ máy TZ=Asia/Ho_Chi_Minh):
 *   - Mỗi 5 phút: ai đến lượt thì gửi tin nhắc, xóa tin nhắc / tổng kết cũ.
 *     Đến lượt = đang trong giờ nhắc và đã qua `interval` phút kể từ mốc gần nhất
 *     (lần nhắc trước, lần bấm "Đã uống", hoặc DAY_START). Đang hoãn thì chờ hết hoãn.
 *   - 17:35: tổng kết số cốc cho người hôm nay có được nhắc / có uống.
 */
const cron = require("node-cron");
const store = require("./store");
const { REMINDERS } = require("./texts");
const { buildReminderCard, buildSummaryCard } = require("./cards");

const DAY_START = 8 * 60; // mốc tính lần nhắc đầu tiên: 8:00 + interval
// Giờ được nhắc, phút tính từ 0:00 (bỏ giờ ăn trưa: đã có thẻ cơm + GIF đứng dậy)
const WINDOWS = [
    [8 * 60 + 30, 11 * 60 + 45],
    [13 * 60 + 15, 17 * 60 + 30],
];
const SEND_DELAY_MS = 400; // giãn cách giữa các DM, tránh rate limit

const minutesOfDay = (date) => date.getHours() * 60 + date.getMinutes();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function inWindow(now) {
    const minutes = minutesOfDay(now);
    return WINDOWS.some(([start, end]) => minutes >= start && minutes < end);
}

function pickReminder() {
    return REMINDERS[Math.floor(Math.random() * REMINDERS.length)];
}

function isDue(member, now) {
    if (!member.subscribed) return false;
    const day = store.today(member, now);
    if (day.off) return false;
    if (day.snoozeUntil) return now >= new Date(day.snoozeUntil);

    const dayStart = new Date(now);
    dayStart.setHours(0, DAY_START, 0, 0);
    const marks = [dayStart, day.lastSentAt, day.lastDrinkAt].filter(Boolean).map((t) => new Date(t).getTime());
    return now.getTime() - Math.max(...marks) >= member.interval * 60 * 1000;
}

/**
 * Gửi 1 tin (nhắc / tổng kết) và xóa tin trước đó của người này, để DM chỉ còn tin mới nhất.
 * Trả về kết quả của sendCardToUser.
 */
async function sendReplacing(ctx, discordId, card) {
    const previous = store.getMember(discordId)?.lastMessage;
    const result = await ctx.sendCardToUser(discordId, card);
    if (!result.success) return result;

    store.updateMember(discordId, (m) => {
        m.lastMessage = { channelId: result.message.channelId, messageId: result.message.id };
    });
    if (previous) await ctx.deleteMessage(previous.channelId, previous.messageId);
    return result;
}

async function sendReminder(ctx, discordId, now = new Date()) {
    const cups = store.today(store.getMember(discordId) || {}, now).cups;
    const result = await sendReplacing(ctx, discordId, buildReminderCard({ message: pickReminder(), cups }));
    if (!result.success) {
        console.error(`❌ Không gửi được nhắc uống nước cho ${discordId}: ${result.error}`);
        return result;
    }
    store.updateMember(
        discordId,
        (m, day) => {
            day.reminders += 1;
            day.lastSentAt = now.toISOString();
            day.snoozeUntil = null;
        },
        now
    );
    return result;
}

async function sendSummary(ctx, discordId, now = new Date()) {
    const cups = store.today(store.getMember(discordId) || {}, now).cups;
    const result = await sendReplacing(ctx, discordId, buildSummaryCard(cups));
    if (!result.success) console.error(`❌ Không gửi được tổng kết uống nước cho ${discordId}: ${result.error}`);
    return result;
}

async function runReminders(ctx, now = new Date()) {
    if (!ctx.isWorkingDay(now) || !inWindow(now)) return;
    const due = store.allMembers().filter(({ member }) => isDue(member, now));
    for (const { discordId } of due) {
        await sendReminder(ctx, discordId, now);
        await sleep(SEND_DELAY_MS);
    }
    if (due.length) console.log(`💧 Đã nhắc uống nước ${due.length} người`);
}

async function runSummaries(ctx, now = new Date()) {
    if (!ctx.isWorkingDay(now)) return;
    const key = store.dateKey(now);
    const members = store.allMembers().filter(({ member }) => {
        const day = member.day;
        return member.subscribed && day?.date === key && !day.off && (day.reminders > 0 || day.cups > 0);
    });
    for (const { discordId } of members) {
        await sendSummary(ctx, discordId, now);
        await sleep(SEND_DELAY_MS);
    }
    if (members.length) console.log(`💧 Đã gửi tổng kết uống nước cho ${members.length} người`);
}

function startSchedules(ctx) {
    cron.schedule("*/5 * * * *", () =>
        runReminders(ctx).catch((error) => console.error("❌ Lỗi khi nhắc uống nước:", error))
    );
    cron.schedule("35 17 * * *", () =>
        runSummaries(ctx).catch((error) => console.error("❌ Lỗi khi tổng kết uống nước:", error))
    );
}

module.exports = { startSchedules, runReminders, runSummaries, sendReminder, sendSummary };
