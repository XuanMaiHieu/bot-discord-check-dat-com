/**
 * Module feedback: hỏi người dùng chấm điểm / góp ý về bot, giới thiệu tính năng,
 * và trang "donate" pháo tay qua QR. Xem README.md cùng thư mục.
 *
 * Env:
 *   FEEDBACK_ENABLED=false         tắt cả module
 *   FEEDBACK_CLAP_PORT=5968        cổng web pháo tay
 *   FEEDBACK_CLAP_PUBLIC_URL=...   link ngoài internet tới cổng trên (vd http://117.7.0.31:5968).
 *                                  Bỏ trống = không chạy web, thẻ cảm ơn không có QR
 */
const store = require("./store");
const { commands } = require("./campaign");
const { handleInteraction } = require("./interactions");
const { lunchCardExtras } = require("./nag");
const { setQrPng } = require("./thanks");
const { PREFIX } = require("./cards");

const DEFAULT_CLAP_PORT = 5968;

// store cần thư mục dữ liệu trước khi lệnh / nút / hook đầu tiên chạy
let initialized = false;
function ensureStore(ctx) {
    if (initialized) return;
    store.init(ctx.dataDir("feedback"));
    initialized = true;
}

function withStore(handler) {
    return (interaction, ctx) => {
        ensureStore(ctx);
        return handler(interaction, ctx);
    };
}

function startClap(ctx) {
    const publicUrl = process.env.FEEDBACK_CLAP_PUBLIC_URL?.trim();
    if (!publicUrl) {
        console.log("⏭️ Chưa đặt FEEDBACK_CLAP_PUBLIC_URL: không chạy web pháo tay, thẻ cảm ơn không có QR");
        return;
    }
    const port = Number(process.env.FEEDBACK_CLAP_PORT) || DEFAULT_CLAP_PORT;

    // Nạp muộn: không bật web thì không cần thư viện vẽ / QR
    const { startClapServer } = require("./clap/server");
    const { renderClapQr } = require("./clap/qr");
    const { url } = startClapServer(ctx, { port, publicUrl });
    try {
        setQrPng(renderClapQr(url, ctx.fontsDir));
    } catch (error) {
        console.error("❌ Không vẽ được QR pháo tay, thẻ cảm ơn sẽ không có QR:", error);
    }
}

module.exports = {
    name: "feedback",
    enabled: () => process.env.FEEDBACK_ENABLED !== "false",

    commands: commands.map((command) => ({ ...command, execute: withStore(command.execute) })),
    interactionPrefix: PREFIX,
    handleInteraction: withStore(handleInteraction),

    start(ctx) {
        ensureStore(ctx);
        startClap(ctx);
    },

    hooks: {
        lunchCardExtras(args, ctx) {
            ensureStore(ctx);
            return lunchCardExtras(args);
        },
    },
};
