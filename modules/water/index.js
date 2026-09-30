/**
 * Module nhắc uống nước: nhắc trong giờ làm theo tần suất từng người chọn, đếm cốc,
 * tổng kết cuối ngày. Xem README.md cùng thư mục.
 *
 * Env:
 *   WATER_ENABLED=false   tắt cả module
 */
const store = require("./store");
const commands = require("./commands");
const { handleInteraction } = require("./interactions");
const { startSchedules } = require("./schedule");
const { PREFIX, buildPromoSection } = require("./cards");
const { PROMO_DAYS } = require("./texts");

// store cần thư mục dữ liệu trước khi lệnh / nút / hook đầu tiên chạy
let initialized = false;
function ensureStore(ctx) {
    if (initialized) return;
    store.init(ctx.dataDir("water"));
    initialized = true;
}

function withStore(handler) {
    return (interaction, ctx) => {
        ensureStore(ctx);
        return handler(interaction, ctx);
    };
}

/**
 * Dòng giới thiệu trong thẻ báo cơm 12h: cho người chưa bật, chưa từ chối, mỗi người
 * tối đa PROMO_DAYS ngày. /test-meal (test = true) luôn hiện, không tính ngày.
 */
function lunchCardExtras({ user, date, test }) {
    if (test) return buildPromoSection();
    const member = store.getMember(user.discordId);
    if (member?.subscribed || member?.declinedAt) return null;

    const today = store.dateKey(date);
    const seen = member?.promoDates || [];
    if (!seen.includes(today)) {
        if (seen.length >= PROMO_DAYS) return null;
        store.updateMember(user.discordId, (m) => {
            m.promoDates = [...seen, today];
        });
    }
    return buildPromoSection();
}

module.exports = {
    name: "water",
    enabled: () => process.env.WATER_ENABLED !== "false",

    commands: commands.map((command) => ({ ...command, execute: withStore(command.execute) })),
    interactionPrefix: PREFIX,
    handleInteraction: withStore(handleInteraction),

    start(ctx) {
        ensureStore(ctx);
        startSchedules(ctx);
    },

    hooks: {
        lunchCardExtras(args, ctx) {
            ensureStore(ctx);
            return lunchCardExtras(args);
        },
    },
};
