/**
 * Thiệp mời buổi sinh hoạt (Components V2): ảnh bìa + lời mời + nút mở bản đồ.
 * Ảnh bìa là file poster.png vẽ sẵn (xem render-poster.js).
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
const { START_AT, MAP_URL, INVITE } = require("./texts");

const COLOR = 0xe11d74; // hồng, cùng tông ảnh bìa
const POSTER_PATH = path.join(__dirname, "poster.png");
const POSTER_FILE_NAME = "thu-moi-20-10.png";

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
function buildInviteCard({ name }) {
    const countdown = `<t:${Math.floor(START_AT.getTime() / 1000)}:R>`;

    const container = new ContainerBuilder().setAccentColor(COLOR);
    container.addMediaGalleryComponents((g) =>
        g.addItems((item) => item.setURL(`attachment://${POSTER_FILE_NAME}`).setDescription(INVITE.posterAlt))
    );
    text(container, INVITE.title);
    text(container, INVITE.greeting.replace("{name}", escapeMarkdown(name)));
    text(container, INVITE.message);

    divider(container);
    text(container, INVITE.details.replace("{countdown}", countdown));
    container.addActionRowComponents((row) =>
        row.setComponents(
            new ButtonBuilder().setLabel(INVITE.mapButton).setEmoji("📍").setStyle(ButtonStyle.Link).setURL(MAP_URL)
        )
    );

    divider(container);
    text(container, INVITE.outro);

    return { card: container, files: [new AttachmentBuilder(POSTER_PATH, { name: POSTER_FILE_NAME })] };
}

module.exports = { buildInviteCard };
