/**
 * Module lấy GIF từ các server GIF miễn phí.
 *
 * Thứ tự ưu tiên provider:
 *   1. Tenor v2   - cần TENOR_API_KEY (miễn phí, tìm kiếm theo từ khóa tự do)
 *   2. Giphy      - cần GIPHY_API_KEY (miễn phí, tìm kiếm theo từ khóa tự do)
 *   3. OtakuGIFs  - KHÔNG cần key, nhưng chỉ có sẵn ~70 "reaction" cố định
 *
 * Nếu chưa cấu hình key nào thì bot vẫn chạy được nhờ OtakuGIFs.
 */

// Cache danh sách reaction của OtakuGIFs để không phải gọi lại API mỗi lần
let otakuReactionsCache = null;
let otakuReactionsCachedAt = 0;
const OTAKU_CACHE_TTL_MS = 60 * 60 * 1000; // 1 giờ

// Danh sách dự phòng nếu không gọi được endpoint /gif/allreactions
const OTAKU_FALLBACK_REACTIONS = [
    "airkiss", "angrystare", "bite", "bleh", "blush", "brofist", "celebrate",
    "cheers", "clap", "confused", "cool", "cry", "cuddle", "dance", "drool",
    "evillaugh", "facepalm", "handhold", "happy", "headbang", "hug", "huh",
    "kiss", "laugh", "lick", "love", "mad", "nervous", "no", "nom", "nosebleed",
    "nuzzle", "nyah", "pat", "peek", "pinch", "poke", "pout", "punch", "roll",
    "run", "sad", "scared", "shout", "shrug", "shy", "sigh", "sing", "sip",
    "slap", "sleep", "slowclap", "smack", "smile", "smug", "sneeze", "sorry",
    "stare", "stop", "surprised", "sweat", "thumbsup", "tickle", "tired",
    "wave", "wink", "woah", "yawn", "yay", "yes",
];

// Map từ khóa tiếng Việt / tiếng Anh thông dụng sang reaction của OtakuGIFs
const KEYWORD_TO_REACTION = {
    "chao": "wave", "hello": "wave", "hi": "wave", "xin chao": "wave",
    "tam biet": "wave", "bye": "wave",
    "om": "hug", "hug": "hug", "abc": "hug",
    "hon": "kiss", "kiss": "kiss",
    "vui": "happy", "happy": "happy", "hehe": "happy",
    "cuoi": "laugh", "laugh": "laugh", "haha": "laugh",
    "buon": "sad", "sad": "sad",
    "khoc": "cry", "cry": "cry",
    "gian": "mad", "tuc": "mad", "angry": "mad", "mad": "mad",
    "nhay": "dance", "dance": "dance", "quay": "dance",
    "an": "nom", "com": "nom", "an com": "nom", "food": "nom", "eat": "nom",
    "ngu": "sleep", "sleep": "sleep", "buon ngu": "yawn",
    "met": "tired", "tired": "tired",
    "vo tay": "clap", "clap": "clap",
    "ok": "thumbsup", "good": "thumbsup", "like": "thumbsup", "tot": "thumbsup",
    "an mung": "celebrate", "celebrate": "celebrate", "chuc mung": "celebrate",
    "yeu": "love", "love": "love", "thuong": "love",
    "ngac nhien": "surprised", "surprised": "surprised", "wow": "woah",
    "xin loi": "sorry", "sorry": "sorry",
    "cham cham": "poke", "poke": "poke", "chao hoi": "wave",
    "tat": "slap", "slap": "slap", "danh": "punch",
    "ngai": "shy", "shy": "shy", "xau ho": "blush",
    "cool": "cool", "ngau": "cool",
    "bo tay": "shrug", "shrug": "shrug", "chiu": "facepalm",
};

// Bỏ dấu tiếng Việt + đưa về chữ thường để so khớp từ khóa
function normalizeText(text) {
    return String(text || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase()
        .trim();
}

function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

// Lấy danh sách reaction hợp lệ của OtakuGIFs (có cache)
async function getOtakuReactions() {
    const now = Date.now();
    if (otakuReactionsCache && now - otakuReactionsCachedAt < OTAKU_CACHE_TTL_MS) {
        return otakuReactionsCache;
    }

    try {
        const res = await fetchJson("https://api.otakugifs.xyz/gif/allreactions");
        if (Array.isArray(res?.reactions) && res.reactions.length > 0) {
            otakuReactionsCache = res.reactions;
            otakuReactionsCachedAt = now;
            return otakuReactionsCache;
        }
    } catch (error) {
        console.log(`⚠️ Không lấy được danh sách reaction OtakuGIFs: ${error.message}`);
    }

    otakuReactionsCache = OTAKU_FALLBACK_REACTIONS;
    otakuReactionsCachedAt = now;
    return otakuReactionsCache;
}

// Gọi API trả JSON, có timeout để không treo bot
async function fetchJson(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

// Provider 1: Tenor v2 (cần key miễn phí từ Google Cloud console)
async function fetchFromTenor(query, { random = true } = {}) {
    const apiKey = process.env.TENOR_API_KEY;
    if (!apiKey) return null;

    const params = new URLSearchParams({
        q: query,
        key: apiKey,
        client_key: process.env.TENOR_CLIENT_KEY || "bot_check_dat_com",
        limit: "20",
        media_filter: "gif,tinygif",
        contentfilter: process.env.TENOR_CONTENT_FILTER || "high",
        random: random ? "true" : "false",
    });

    const data = await fetchJson(`https://tenor.googleapis.com/v2/search?${params}`);
    const results = Array.isArray(data?.results) ? data.results : [];
    if (results.length === 0) return null;

    const item = pickRandom(results);
    const url =
        item?.media_formats?.gif?.url ||
        item?.media_formats?.tinygif?.url ||
        item?.url;
    if (!url) return null;

    return {
        url,
        provider: "Tenor",
        title: item?.content_description || query,
        pageUrl: item?.itemurl || item?.url || null,
    };
}

// Provider 2: Giphy (cần key miễn phí từ developers.giphy.com)
async function fetchFromGiphy(query) {
    const apiKey = process.env.GIPHY_API_KEY;
    if (!apiKey) return null;

    const params = new URLSearchParams({
        api_key: apiKey,
        q: query,
        limit: "25",
        rating: process.env.GIPHY_RATING || "g",
        lang: "en",
    });

    const data = await fetchJson(`https://api.giphy.com/v1/gifs/search?${params}`);
    const results = Array.isArray(data?.data) ? data.data : [];
    if (results.length === 0) return null;

    const item = pickRandom(results);
    const url = item?.images?.original?.url || item?.images?.downsized?.url;
    if (!url) return null;

    return {
        url,
        provider: "Giphy",
        title: item?.title || query,
        pageUrl: item?.url || null,
    };
}

// Chuyển từ khóa bất kỳ về 1 reaction hợp lệ của OtakuGIFs
async function resolveOtakuReaction(query) {
    const reactions = await getOtakuReactions();
    const normalized = normalizeText(query);

    if (!normalized) return pickRandom(reactions);

    // 1. Khớp chính xác tên reaction
    if (reactions.includes(normalized)) return normalized;

    // 2. Khớp qua bảng từ khóa tiếng Việt / tiếng Anh
    if (KEYWORD_TO_REACTION[normalized] && reactions.includes(KEYWORD_TO_REACTION[normalized])) {
        return KEYWORD_TO_REACTION[normalized];
    }

    // 3. Khớp từng từ trong câu
    for (const word of normalized.split(/\s+/)) {
        if (reactions.includes(word)) return word;
        const mapped = KEYWORD_TO_REACTION[word];
        if (mapped && reactions.includes(mapped)) return mapped;
    }

    // 4. Khớp một phần (substring)
    const partial = reactions.find(
        (r) => normalized.includes(r) || r.includes(normalized)
    );
    if (partial) return partial;

    // 5. Không khớp gì thì lấy ngẫu nhiên
    return pickRandom(reactions);
}

// Provider 3: OtakuGIFs - miễn phí, không cần key
async function fetchFromOtakuGifs(query) {
    const reaction = await resolveOtakuReaction(query);
    const data = await fetchJson(
        `https://api.otakugifs.xyz/gif?reaction=${encodeURIComponent(reaction)}&format=gif`
    );
    if (!data?.url) return null;

    return {
        url: data.url,
        provider: "OtakuGIFs",
        title: reaction,
        pageUrl: null,
        note:
            normalizeText(query) && normalizeText(query) !== reaction
                ? `Không có key Tenor/Giphy nên dùng nguồn miễn phí OtakuGIFs, từ khóa "${query}" được quy về reaction "${reaction}".`
                : null,
    };
}

const PROVIDERS = [
    { name: "Tenor", fn: fetchFromTenor },
    { name: "Giphy", fn: fetchFromGiphy },
    { name: "OtakuGIFs", fn: fetchFromOtakuGifs },
];

/**
 * Lấy 1 GIF theo từ khóa, tự động thử lần lượt các provider.
 * Trả về { url, provider, title, pageUrl, note } hoặc null nếu không nguồn nào chạy được.
 */
async function fetchGif(query = "") {
    const errors = [];

    for (const provider of PROVIDERS) {
        try {
            const result = await provider.fn(query);
            if (result?.url) return result;
        } catch (error) {
            errors.push(`${provider.name}: ${error.message}`);
            console.log(`⚠️ Provider GIF ${provider.name} lỗi: ${error.message}`);
        }
    }

    if (errors.length > 0) {
        console.error(`❌ Không lấy được GIF. Chi tiết: ${errors.join(" | ")}`);
    }
    return null;
}

// Cho biết provider nào đang được cấu hình (dùng để hiển thị trong /help, /test-send-gif)
function getActiveProviderName() {
    if (process.env.TENOR_API_KEY) return "Tenor";
    if (process.env.GIPHY_API_KEY) return "Giphy";
    return "OtakuGIFs (miễn phí, không cần key)";
}

module.exports = {
    fetchGif,
    getActiveProviderName,
    getOtakuReactions,
    normalizeText,
};
