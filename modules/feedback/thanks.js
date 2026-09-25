/**
 * Thẻ cảm ơn: gửi 1 lần khi người dùng chấm điểm lần đầu. Chạy hoạt hình
 * (sửa tin vài lần) rồi mới hiện thẻ có GIF pháo hoa, giới thiệu tính năng và QR.
 */
const { AttachmentBuilder } = require("discord.js");
const { FIREWORK_GIFS, LAUNCH_FRAMES } = require("./texts");
const { buildLaunchFrame, buildThanksCard } = require("./cards");

// Discord cho sửa tin ~5 lần / 5 giây, 3 khung cách nhau 0.9s là an toàn
const FRAME_DELAY_MS = 900;
const QR_FILE_NAME = "phao-tay.png";

// Ảnh QR (Buffer) do index.js đặt khi web pháo tay chạy; null = không có phần donate
let qrPng = null;
function setQrPng(png) {
    qrPng = png;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendThanks(ctx, discordId) {
    const first = await ctx.sendCardToUser(discordId, buildLaunchFrame(0));
    if (!first.success) {
        console.error(`❌ Không gửi được thẻ cảm ơn feedback: ${first.error}`);
        return;
    }
    const message = first.message;

    for (let i = 1; i < LAUNCH_FRAMES.length; i++) {
        await sleep(FRAME_DELAY_MS);
        await message.edit(ctx.cardPayload(buildLaunchFrame(i)));
    }
    await sleep(FRAME_DELAY_MS);

    const card = buildThanksCard({
        gifUrl: FIREWORK_GIFS[Math.floor(Math.random() * FIREWORK_GIFS.length)],
        mealWeekButtonId: ctx.features.mealWeekButtonId,
        qrFileName: qrPng ? QR_FILE_NAME : null,
    });
    const files = qrPng ? [new AttachmentBuilder(qrPng, { name: QR_FILE_NAME })] : [];
    await message.edit(ctx.cardPayload(card, { files }));
}

module.exports = { sendThanks, setQrPng };
