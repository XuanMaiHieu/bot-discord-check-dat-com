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

// Một GIF đã gửi thì phải cách ít nhất N ngày mới được gửi lại
function getNoRepeatDays() {
    const n = parseInt(process.env.STANDUP_GIF_NO_REPEAT_DAYS, 10);
    return Number.isInteger(n) && n >= 0 ? n : 5;
}

// Lịch sử GIF đã gửi, lưu ra file để không mất khi restart / deploy.
// data/ nằm trong .gitignore nên git pull không ghi đè file này.
const GIF_HISTORY_FILE = path.join(__dirname, "../data/standup-gif-history.json");
const GIF_HISTORY_MAX_ENTRIES = 100;

function loadGifHistory() {
    try {
        const data = JSON.parse(fs.readFileSync(GIF_HISTORY_FILE, "utf8"));
        return Array.isArray(data) ? data : [];
    } catch (error) {
        return []; // chưa có file (lần chạy đầu) hoặc file hỏng -> coi như chưa gửi gì
    }
}

function recordGifSent(url, date = new Date()) {
    try {
        const history = [...loadGifHistory(), { url, sentAt: date.toISOString() }]
            .slice(-GIF_HISTORY_MAX_ENTRIES);
        // Ghi ra file tạm rồi đổi tên, tránh hỏng file nếu bot tắt giữa chừng
        const tmpFile = `${GIF_HISTORY_FILE}.tmp`;
        fs.writeFileSync(tmpFile, JSON.stringify(history, null, 2), "utf8");
        fs.renameSync(tmpFile, GIF_HISTORY_FILE);
    } catch (error) {
        console.error(`❌ Không lưu được lịch sử GIF đứng dậy: ${error.message}`);
    }
}

// Số ngày lịch (theo giờ máy, TZ=Asia/Ho_Chi_Minh) giữa 2 thời điểm, bỏ qua giờ phút
function daysBetween(from, to) {
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((startOfDay(to) - startOfDay(from)) / (24 * 60 * 60 * 1000));
}

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

// Bốc ngẫu nhiên 1 GIF trong bộ chọn sẵn, bỏ qua GIF đã gửi trong N ngày gần đây
function pickCuratedStandupGif(now = new Date()) {
    const noRepeatDays = getNoRepeatDays();

    // Lần gửi gần nhất của từng GIF
    const lastSentAt = new Map();
    for (const entry of loadGifHistory()) {
        const sentAt = new Date(entry?.sentAt);
        if (!entry?.url || Number.isNaN(sentAt.getTime())) continue;
        const prev = lastSentAt.get(entry.url);
        if (!prev || sentAt > prev) lastSentAt.set(entry.url, sentAt);
    }

    let candidates = STANDUP_GIF_URLS.filter((url) => {
        const sentAt = lastSentAt.get(url);
        return !sentAt || daysBetween(sentAt, now) >= noRepeatDays;
    });

    // Bộ GIF quá ít so với N ngày thì không còn GIF nào hợp lệ:
    // lấy những GIF đã lâu nhất chưa gửi thay vì không gửi gì
    if (candidates.length === 0) {
        const oldest = Math.min(...STANDUP_GIF_URLS.map((url) => lastSentAt.get(url)?.getTime() ?? 0));
        candidates = STANDUP_GIF_URLS.filter(
            (url) => (lastSentAt.get(url)?.getTime() ?? 0) === oldest
        );
    }

    const url = candidates[Math.floor(Math.random() * candidates.length)];
    const index = STANDUP_GIF_URLS.indexOf(url) + 1;
    return {
        gif: {
            url,
            provider: "Bộ GIF chọn sẵn",
            title: null,
            pageUrl: null,
        },
        query: `bộ GIF chọn sẵn (#${index}/${STANDUP_GIF_URLS.length}, còn ${candidates.length} GIF chưa gửi trong ${noRepeatDays} ngày)`,
        curated: true,
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
    const { gif, query, curated } = await fetchStandupGif();

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

    // Chỉ ghi lịch sử khi gửi thật cho mọi người (cron 12h hoặc /test-standup all:True).
    // Test gửi riêng cho 1 người không tính, để khỏi "đốt" GIF của những ngày tới.
    if (curated && gif && sent > 0 && !targetUserIds) {
        recordGifSent(gif.url);
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
    GIF_HISTORY_FILE,
    pickCuratedStandupGif,
    STANDUP_GIF_SOURCES,
    STANDUP_GIF_EXCLUDE,
};
