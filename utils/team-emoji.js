/**
 * Logo đội bóng dạng emoji riêng của bot (application emoji) để chèn ngay trong
 * dòng chữ: "<:fb_ars_359:...> Arsenal". Lần đầu gặp 1 đội thì tải logo từ ESPN
 * và tạo emoji, những lần sau dùng lại. Mỗi bot giữ được tối đa 2000 emoji.
 */
const LOGO_SIZE = 128;
const MAX_EMOJI_BYTES = 256 * 1024; // giới hạn của Discord
const FETCH_TIMEOUT_MS = 10 * 1000;

const emojiByName = new Map(); // tên emoji -> "<:tên:id>"
const pendingCreates = new Map(); // tên emoji -> Promise đang tạo (tránh tạo trùng)
let existingLoaded = null;

// "fb_ars_359": viết tắt để dễ đọc, id đội để không bao giờ trùng
function emojiNameFor(team) {
    const abbreviation = String(team.abbreviation || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const id = String(team.id || "").replace(/[^0-9]/g, "");
    if (!id) return null;
    return `fb_${abbreviation ? `${abbreviation}_` : ""}${id}`.slice(0, 32);
}

// Logo ESPN gốc 500px -> dịch vụ resize của ESPN để ra ảnh 128px nhẹ
function resizedLogoUrl(logoUrl) {
    const match = String(logoUrl).match(/^https:\/\/a\.espncdn\.com(\/i\/teamlogos\/[^?]+\.png)$/);
    return match
        ? `https://a.espncdn.com/combiner/i?img=${match[1]}&h=${LOGO_SIZE}&w=${LOGO_SIZE}`
        : logoUrl;
}

async function loadExistingEmojis(client) {
    if (!existingLoaded) {
        existingLoaded = client.application.emojis
            .fetch()
            .then((emojis) => {
                for (const emoji of emojis.values()) emojiByName.set(emoji.name, emoji.toString());
            })
            .catch((error) => {
                existingLoaded = null; // lần sau thử lại
                throw error;
            });
    }
    return existingLoaded;
}

async function createTeamEmoji(client, name, logoUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let image;
    try {
        const response = await fetch(resizedLogoUrl(logoUrl), { signal: controller.signal });
        if (!response.ok) throw new Error(`tải logo lỗi HTTP ${response.status}`);
        image = Buffer.from(await response.arrayBuffer());
    } finally {
        clearTimeout(timer);
    }
    if (image.length > MAX_EMOJI_BYTES) {
        throw new Error(`logo ${Math.round(image.length / 1024)}KB vượt giới hạn 256KB`);
    }

    const emoji = await client.application.emojis.create({ attachment: image, name });
    emojiByName.set(name, emoji.toString());
    console.log(`✅ Đã tạo emoji logo ${name}`);
}

/**
 * Emoji logo cho các đội. Đội nào lỗi thì không có trong kết quả (hiện tên không logo).
 * @param {object} client - Discord client (đã sẵn sàng)
 * @param {Array<{id, abbreviation, logo}>} teams
 * @returns {Promise<Map<string, string>>} id đội -> chuỗi emoji
 */
async function getTeamEmojis(client, teams) {
    const result = new Map();
    try {
        await loadExistingEmojis(client);
    } catch (error) {
        console.error(`❌ Không tải được danh sách emoji của bot: ${error.message}`);
        return result;
    }

    const uniqueTeams = [...new Map(teams.map((t) => [t.id, t])).values()];
    // Tạo lần lượt từng emoji để không dồn request lên Discord
    for (const team of uniqueTeams) {
        const name = emojiNameFor(team);
        if (!name) continue;

        if (!emojiByName.has(name) && team.logo) {
            if (!pendingCreates.has(name)) {
                pendingCreates.set(
                    name,
                    createTeamEmoji(client, name, team.logo).finally(() => pendingCreates.delete(name))
                );
            }
            try {
                await pendingCreates.get(name);
            } catch (error) {
                console.error(`❌ Không tạo được emoji logo ${team.name || name}: ${error.message}`);
            }
        }

        if (emojiByName.has(name)) result.set(team.id, emojiByName.get(name));
    }
    return result;
}

// Tất cả đội xuất hiện trong danh sách trận
function teamsOfMatches(matches) {
    return matches.flatMap((m) => [m.home, m.away]);
}

module.exports = {
    getTeamEmojis,
    teamsOfMatches,
    emojiNameFor,
};
