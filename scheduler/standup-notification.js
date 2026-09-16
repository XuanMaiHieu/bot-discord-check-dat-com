const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const { fetchGif } = require("../utils/gif");
const { sendGifToUser } = require("../commands/gif");

// Nội dung thông báo đứng dậy
const STANDUP_MESSAGE =
    "🕛 **Thời điểm đã đến, kính mời quý user hãy đứng dậy**";

// Bộ GIF chọn sẵn cho thông báo 12h - mặc định bốc ngẫu nhiên trong bộ này,
// KHÔNG gọi API. Thêm / bớt GIF: sửa danh sách link bên dưới.
// Link phải trỏ THẲNG tới file .gif (embed Discord không hiện được link trang web):
//   - Giphy: https://media.giphy.com/media/<ID>/giphy.gif
//     (ID là đoạn ngay trước "/giphy.gif" trong link)
//   - Tenor: mở trang tenor.com/view/..., lấy link trong thẻ <meta property="og:image">
//     rồi bỏ "1" và "/m" -> https://media.tenor.com/<ID>/<tên>.gif
const STANDUP_GIF_URLS = [
    // Giphy
    "https://media.giphy.com/media/duh9qIgB0Ghfif8uPE/giphy.gif",
    "https://media.giphy.com/media/u90ft7uupHIuKtj9AL/giphy.gif",
    "https://media.giphy.com/media/npTGejyoQ5A5EiovTN/giphy.gif",
    "https://media.giphy.com/media/vgPptRu3quuHYFQ1GH/giphy.gif",
    "https://media.giphy.com/media/7r9auGSIwLenoIKei4/giphy.gif",
    "https://media.giphy.com/media/Xxaf0PmrUooWQ/giphy.gif",
    "https://media.giphy.com/media/uRbZXz3NIpFrDxs8tX/giphy.gif",
    "https://media.giphy.com/media/F7Tu1QLkU5qAVn2eND/giphy.gif",
    "https://media.giphy.com/media/QVs6OmwbbGvWPJJ75m/giphy.gif",
    "https://media.giphy.com/media/5UDHI0QDazoDqGv5AI/giphy.gif",
    "https://media.giphy.com/media/R312C3MEVg4SCYAber/giphy.gif",
    "https://media.giphy.com/media/WOfGnDJ2MAiSoYjbXT/giphy.gif",

    // Tenor
    "https://media.tenor.com/IEvPm07TFdsAAAAC/looney-tunes-loony-toons.gif", // Looney Tunes chạy vụt đi
    "https://media.tenor.com/Syqnvnr2DRAAAAAC/judge-judy-times-up.gif", // Judge Judy: hết giờ
    "https://media.tenor.com/qb7SyyFARFkAAAAC/lunch-time-happy-lunch-time.gif", // Lunch time
    "https://media.tenor.com/gIfXVDEePiIAAAAC/friends-joey-tribbiani.gif", // Joey (Friends) đứng dậy
    "https://media.tenor.com/cF1TJIrubaMAAAAC/jidu.gif",
    "https://media.tenor.com/ciL2-lUPetEAAAAC/nom.gif", // Nom
    "https://media.tenor.com/vuOR748h-6cAAAAC/despicable-me-animation.gif", // Minions
    "https://media.tenor.com/hMdFNbG4CEoAAAAC/confusing-rush.gif", // Bận rối đầu
    "https://media.tenor.com/DGGFZlQLsuEAAAAC/xuan-nghi-doi-qua.gif", // Xuân Nghị: đói quá
];

// Nhớ GIF lần trước để hôm sau không bốc trùng
let lastStandupGifUrl = null;

// ---------------------------------------------------------------------------
// Chế độ API (đang TẮT). Bật lại bằng STANDUP_GIF_MODE=api trong .env.
// ---------------------------------------------------------------------------
// Nguồn GIF cho thông báo 12h, chia 2 nhóm ý nghĩa. Mỗi lần chạy thử lần lượt
// theo thứ tự ngẫu nhiên, nguồn nào không còn GIF hợp lệ thì sang nguồn kế.
//
// includeTitle là danh sách trắng: GIF chỉ được chọn khi TIÊU ĐỀ chứa đúng ý.
// Chỉ chặn bằng danh sách đen là không đủ - từng lọt "Lets Go Hello GIF by
// Marvel Studios" (Rogue X-Men nháy mắt) vì tiêu đề không dính từ cấm nào.
const STANDUP_GIF_SOURCES = [
    // Nhóm 1: đứng dậy, rời bàn làm việc
    {
        query: "rời bàn làm việc",
        includeTitle: /leav|go home|going home|got to go|exit/i,
    },
    { query: "the office leaving", includeTitle: /leav|run away/i },
    { query: "leave work", includeTitle: /leav|run away/i },

    // Nhóm 2: kêu gọi mọi người cùng đứng lên
    { query: "on your feet", includeTitle: /on your feet/i },
    {
        query: "get on your feet",
        includeTitle: /on your feet|get up|stand up/i,
    },
];
// Đã loại sau khi test:
//   "hãy đứng dậy" / "đứng dậy" / "get up stand up" -> ra cảnh ngủ dậy, good morning
//   "stand up" / "đứng lên" / "mọi người đứng lên" / "everybody stand up" -> dính stand-up comedy
//   "lets go everyone" -> lẫn Marvel, Real Madrid, quảng cáo tuyển dụng
//   "vươn vai" -> ra "reach out";  "all rise" -> bóng chày, tòa án

// Danh sách đen áp dụng chung: ngủ dậy buổi sáng, hết tuần / nghỉ lễ,
// hài độc thoại, quảng cáo tuyển dụng, đuổi người khác đi ("leave me alone", "go away")
const STANDUP_GIF_EXCLUDE =
    /good ?morning|wake ?up|sleep|good ?night|friday|weekend|labor day|vacation|holiday|working|happy hour|comedy|hiring|leave me alone|go away/i;

// Hàm kiểm tra xem hôm nay có phải là thứ 2-6 không
function isWeekday() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Chủ nhật, 1 = Thứ 2, ..., 6 = Thứ 7
    return dayOfWeek >= 1 && dayOfWeek <= 5; // Thứ 2 đến Thứ 6
}

// Hàm đọc danh sách users nhận thông báo đứng dậy từ file JSON.
// Mặc định mọi user đang enabled đều nhận; muốn tắt cho ai thì thêm
// "standup_notify": false vào user đó trong data/users.json
function loadStandupUsers() {
    try {
        const usersFilePath = path.join(__dirname, "../data/users.json");
        const usersData = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));

        return usersData.users.filter(
            (user) =>
                user.enabled === true &&
                user.discordId !== null &&
                user.standup_notify !== false
        );
    } catch (error) {
        console.error(
            `❌ Không đọc được data/users.json cho thông báo đứng dậy: ${error.message}`
        );
        return [];
    }
}

function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// Bốc ngẫu nhiên 1 GIF trong bộ chọn sẵn (không trùng với lần trước)
function pickCuratedStandupGif() {
    const candidates =
        STANDUP_GIF_URLS.length > 1
            ? STANDUP_GIF_URLS.filter((url) => url !== lastStandupGifUrl)
            : STANDUP_GIF_URLS;
    const url = candidates[Math.floor(Math.random() * candidates.length)];
    lastStandupGifUrl = url;

    const index = STANDUP_GIF_URLS.indexOf(url) + 1;
    return {
        gif: {
            url,
            provider: "Bộ GIF chọn sẵn",
            title: null,
            pageUrl: null,
        },
        query: `bộ GIF chọn sẵn (#${index}/${STANDUP_GIF_URLS.length})`,
    };
}

// Lấy GIF cho thông báo 12h: mặc định dùng bộ chọn sẵn, chỉ gọi API khi
// STANDUP_GIF_MODE=api
async function fetchStandupGif() {
    if (process.env.STANDUP_GIF_MODE === "api") {
        return fetchStandupGifFromApi();
    }
    return pickCuratedStandupGif();
}

// Lấy 1 GIF đúng chủ đề qua API: thử lần lượt các nguồn đến khi có GIF qua được bộ lọc
async function fetchStandupGifFromApi() {
    // Cho phép ép 1 từ khóa cố định qua .env (khi đó chỉ dùng danh sách đen)
    const sources = process.env.STANDUP_GIF_QUERY
        ? [{ query: process.env.STANDUP_GIF_QUERY, includeTitle: null }]
        : shuffle(STANDUP_GIF_SOURCES);

    for (const source of sources) {
        const gif = await fetchGif(source.query, {
            includeTitle: source.includeTitle,
            excludeTitle: STANDUP_GIF_EXCLUDE,
            strict: true,
            // Lọc theo tiêu đề đã đảm bảo đúng ý nên lấy rộng hơn top 10 cho đa dạng
            limit: 25,
        });
        if (gif) return { gif, query: source.query };
    }

    return { gif: null, query: sources.map((s) => s.query).join(", ") };
}

// Tra tên hiển thị của 1 Discord ID: ưu tiên tên trong users.json
function findUserNameById(discordId) {
    try {
        const usersFilePath = path.join(__dirname, "../data/users.json");
        const usersData = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));
        return usersData.users.find((u) => u.discordId === discordId)?.name || null;
    } catch (error) {
        return null;
    }
}

/**
 * Gửi thông báo "hãy đứng dậy" kèm GIF cho danh sách user.
 *
 * @param {object} client - Discord client
 * @param {object} options
 * @param {string[]} options.targetUserIds - Chỉ gửi cho các ID này (dùng khi test).
 *                                           Bỏ trống = gửi cho toàn bộ user trong users.json
 * @returns {object} { sent, failed, total, gif, details }
 */
async function runStandupNotification(client, { targetUserIds = null } = {}) {
    // Chỉ lấy GIF 1 lần rồi gửi chung cho mọi người, tránh đốt quota API
    const { gif, query } = await fetchStandupGif();

    if (!gif) {
        console.error("❌ Không lấy được GIF đứng dậy, sẽ gửi tin nhắn không kèm GIF");
    }

    // name = null nghĩa là chưa có trong users.json, sẽ lấy tên Discord khi gửi
    const recipients = targetUserIds
        ? targetUserIds.map((id) => ({ discordId: id, name: findUserNameById(id) }))
        : loadStandupUsers();

    const details = [];
    let sent = 0;
    let failed = 0;

    for (const user of recipients) {
        try {
            if (gif) {
                const result = await sendGifToUser(client, user.discordId, {
                    gif,
                    message: STANDUP_MESSAGE,
                    footer: `Nhắc đứng dậy 12:00 • Nguồn GIF: ${gif.provider}`,
                });

                const displayName =
                    user.name ||
                    result.user?.globalName ||
                    result.user?.username ||
                    user.discordId;

                if (result.success) {
                    sent++;
                    details.push(`✅ ${displayName}`);
                } else {
                    failed++;
                    details.push(`❌ ${displayName}: ${result.error}`);
                }
            } else {
                // Không có GIF thì vẫn phải gửi được chữ
                const discordUser = await client.users.fetch(user.discordId);
                await discordUser.send(STANDUP_MESSAGE);
                sent++;
                details.push(
                    `✅ ${user.name || discordUser.globalName || discordUser.username} (không có GIF)`
                );
            }

            // Delay nhỏ giữa các lần gửi để tránh rate limit của Discord
            await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
            failed++;
            details.push(`❌ ${user.name || user.discordId}: ${error.message}`);
        }
    }

    console.log(
        `🧍 Thông báo đứng dậy: gửi thành công ${sent}/${recipients.length}` +
        (gif ? ` (GIF: ${query} - ${gif.provider})` : " (không có GIF)")
    );

    return { sent, failed, total: recipients.length, gif, query, details };
}

// Hàm khởi tạo scheduler: 12:00 mỗi ngày làm việc (T2-T6), chạy sau /báo cơm
function startStandupScheduler(client) {
    // 00 12 * * * = 12:00 mỗi ngày.
    // Scheduler báo cơm cũng chạy đúng 12:00, nên ở đây delay 30 giây để
    // tin "đứng dậy" luôn tới sau tin báo cơm, không chen ngang.
    const cronExpression = "00 12 * * *";

    cron.schedule(cronExpression, async () => {
        if (!isWeekday()) {
            console.log(
                "⏭️ Hôm nay không phải ngày làm việc (T2-T6), bỏ qua thông báo đứng dậy"
            );
            return;
        }

        setTimeout(async () => {
            try {
                await runStandupNotification(client);
            } catch (error) {
                console.error(`❌ Lỗi khi gửi thông báo đứng dậy: ${error.message}`);
            }
        }, 30 * 1000);
    });

    console.log("✅ Đã bật scheduler nhắc đứng dậy lúc 12:00 (T2-T6)");
}

module.exports = {
    startStandupScheduler,
    runStandupNotification,
    loadStandupUsers,
    isWeekday,
    STANDUP_MESSAGE,
    STANDUP_GIF_URLS,
    STANDUP_GIF_SOURCES,
    STANDUP_GIF_EXCLUDE,
};
