/**
 * Thẻ Components V2 của sự kiện, ảnh vẽ sẵn bằng render-poster.js:
 *   thiệp mời     - poster.png + lời mời + nút mở bản đồ
 *   nhắc chỗ ngồi - seating.png + chỗ của người nhận + giờ, địa điểm, lưu ý gửi xe
 */
const path = require("path");
const {
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    SeparatorSpacingSize,
    escapeMarkdown,
} = require("discord.js");
const { START_AT, MAP_URL, INVITE, TABLES, SEATING } = require("./texts");

const COLOR = 0xe11d74; // hồng, cùng tông ảnh bìa
const SEATING_COLOR = 0xe63b2a; // đỏ, cùng tông ảnh sơ đồ chỗ ngồi
const POSTER_PATH = path.join(__dirname, "poster.png");
const POSTER_FILE_NAME = "thu-moi-20-10.png";
const SEATING_PATH = path.join(__dirname, "seating.png");
const SEATING_FILE_NAME = "so-do-cho-ngoi-20-10.png";

function text(container, content) {
    container.addTextDisplayComponents((t) => t.setContent(content));
}

function divider(container) {
    container.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));
}

/**
 * @param {object} p
 * @param {string} p.name - họ tên người nhận
 * @returns {{ card: ContainerBuilder, files: AttachmentBuilder[] }}
 */
function countdown() {
    return `<t:${Math.floor(START_AT.getTime() / 1000)}:R>`;
}

function mapButtonRow(container) {
    container.addActionRowComponents((row) =>
        row.setComponents(
            new ButtonBuilder().setLabel(INVITE.mapButton).setEmoji("📍").setStyle(ButtonStyle.Link).setURL(MAP_URL)
        )
    );
}

function buildInviteCard({ name }) {
    const container = new ContainerBuilder().setAccentColor(COLOR);
    container.addMediaGalleryComponents((g) =>
        g.addItems((item) => item.setURL(`attachment://${POSTER_FILE_NAME}`).setDescription(INVITE.posterAlt))
    );
    text(container, INVITE.title);
    text(container, INVITE.greeting.replace("{name}", escapeMarkdown(name)));
    text(container, INVITE.message);

    divider(container);
    text(container, INVITE.details.replace("{countdown}", countdown()));
    mapButtonRow(container);

    divider(container);
    text(container, INVITE.outro);

    return { card: container, files: [new AttachmentBuilder(POSTER_PATH, { name: POSTER_FILE_NAME })] };
}

// ---------------------------------------------------------------------------

const ALL_SEATS = TABLES.flatMap((table) => [...table.left, ...table.right].map((seat) => ({ seat, table })));

// "Nguyễn Thị Vân Anh" có đuôi "Vân Anh" (khớp nguyên từ, không khớp "Anh" vào "Thanh")
function endsWithName(fullName, seat) {
    const words = fullName.normalize("NFC").trim().split(/\s+/);
    const seatWords = seat.normalize("NFC").trim().split(/\s+/);
    return seatWords.length <= words.length && seatWords.every((w, i) => w === words[words.length - seatWords.length + i]);
}

/**
 * Bàn của 1 người theo họ tên trong users.json. Chỉ trả về khi chắc chắn: đúng 1
 * ghế khớp và ghế đó không khớp ai khác (vd 2 người tên Trang thì không đoán).
 * @param {string} fullName
 * @param {string[]} allNames - họ tên mọi người trong users.json
 * @returns {{ seat: string, table: object } | null}
 */
function findSeat(fullName, allNames) {
    if (!fullName) return null;
    const matches = ALL_SEATS.filter(({ seat }) => endsWithName(fullName, seat));
    if (matches.length !== 1) return null;
    const owners = allNames.filter((name) => endsWithName(name, matches[0].seat));
    return owners.length === 1 ? matches[0] : null;
}

/**
 * @param {object} p
 * @param {string} p.name - họ tên người nhận
 * @param {{ seat: string, table: object } | null} p.seat - chỗ của người nhận (findSeat)
 * @returns {{ card: ContainerBuilder, files: AttachmentBuilder[] }}
 */
function buildSeatingCard({ name, seat }) {
    const container = new ContainerBuilder().setAccentColor(SEATING_COLOR);
    container.addMediaGalleryComponents((g) =>
        g.addItems((item) => item.setURL(`attachment://${SEATING_FILE_NAME}`).setDescription(SEATING.posterAlt))
    );
    text(container, SEATING.title);
    text(container, SEATING.greeting.replace("{name}", escapeMarkdown(name)));
    if (seat) {
        const mates = [...seat.table.left, ...seat.table.right].filter((s) => s !== seat.seat);
        text(
            container,
            SEATING.yourSeat
                .replace("{table}", seat.table.label.charAt(0) + seat.table.label.slice(1).toLowerCase())
                .replace("{mates}", mates.join(", "))
        );
    }

    divider(container);
    text(container, SEATING.details.replace("{countdown}", countdown()));
    mapButtonRow(container);
    text(container, SEATING.transport);

    return { card: container, files: [new AttachmentBuilder(SEATING_PATH, { name: SEATING_FILE_NAME })] };
}

module.exports = { buildInviteCard, buildSeatingCard, findSeat };
