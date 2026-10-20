/**
 * Module sự kiện: DM cho mọi người có Discord ID trong data/users.json 1 thẻ
 * (Components V2). Hiện là buổi sinh hoạt kỷ niệm 20/10, có 3 đợt gửi:
 *
 *   /thu-moi   thiệp mời (ảnh bìa + lời mời + nút bản đồ)
 *   /cho-ngoi  nhắc chỗ ngồi (sơ đồ bàn + chỗ của người nhận + giờ, địa điểm, lưu ý gửi xe)
 *   /loi-chuc  thư chúc 20/10, chỉ gửi người có gender "female": phong bì -> bóc thư
 *              ra bưu thiếp + lời chúc -> mở quà ra phiếu quà ngẫu nhiên (nút "ev:")
 *   /qua-20-10 ai đã nhận thư chúc / bóc thư / trúng phiếu quà nào (root, trả lời ẩn)
 *   /doi-phieu-qua  ai đang giữ phiếu đã bỏ (replacedBy trong texts.js) thì sửa tin
 *              trong DM sang phiếu thay thế
 *
 * Mỗi lệnh (root) có:
 *   che-do:thu      gửi thử vào DM của root, không ghi nhận gì
 *   che-do:tat-ca   gửi thật cho mọi người chưa nhận đợt đó; chạy lại chỉ gửi
 *                   người còn thiếu / gửi lỗi
 *
 * Sửa chữ / ngày giờ / địa điểm / chỗ ngồi ở texts.js; ảnh vẽ lại bằng render-poster.js.
 */
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    InteractionContextType,
    ApplicationIntegrationType,
} = require("discord.js");
const store = require("./store");
const {
    PREFIX,
    WISH_OPEN_ID,
    WISH_GIFT_ID,
    WISH_VOUCHER_FILE,
    buildInviteCard,
    buildSeatingCard,
    buildWishEnvelopeCard,
    buildWishLetterCard,
    findSeat,
} = require("./cards");
const { EVENT_ID, SEATING_ID, SEATING_ABSENT, WISH_ID, WISH_VOUCHERS } = require("./texts");

const MAX_REPLY_LENGTH = 1900;
const SEND_GAP_MS = 400; // giãn cách DM, tránh rate limit

// Các đợt gửi: build(user, allNames) -> { card, files }; user = { discordId, name }
// skip = họ tên không gửi đợt đó (không tham gia), only(user) = chỉ gửi người thỏa điều kiện
const CAMPAIGNS = [
    {
        command: "thu-moi",
        description: "[Root] Gửi thiệp mời buổi sinh hoạt kỷ niệm 20/10 qua DM",
        id: EVENT_ID,
        label: "💌 **Thiệp mời 20/10**",
        build: (user) => buildInviteCard({ name: user.name }),
    },
    {
        command: "cho-ngoi",
        description: "[Root] Gửi sơ đồ chỗ ngồi + nhắc giờ, địa điểm buổi sinh hoạt 20/10 qua DM",
        id: SEATING_ID,
        label: "🪑 **Sơ đồ chỗ ngồi 20/10**",
        skip: SEATING_ABSENT,
        build: (user, allNames) => buildSeatingCard({ name: user.name, seat: findSeat(user.name, allNames) }),
    },
    {
        command: "loi-chuc",
        description: "[Root] Gửi thư chúc 20/10 qua DM cho chị em (gender female trong users.json)",
        id: WISH_ID,
        label: "💐 **Thư chúc 20/10**",
        only: (user) => user.gender === "female",
        build: (user) => buildWishEnvelopeCard({ name: user.name }),
    },
];

function buildCommand(campaign) {
    return new SlashCommandBuilder()
        .setName(campaign.command)
        .setDescription(campaign.description)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setContexts([InteractionContextType.Guild])
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
        .addStringOption((option) =>
            option
                .setName("che-do")
                .setDescription("Gửi cho ai")
                .addChoices(
                    { name: "Gửi thử vào DM của tôi", value: "thu" },
                    { name: "Gửi thật cho mọi người có Discord ID, chưa nhận", value: "tat-ca" }
                )
                .setRequired(true)
        )
        .toJSON();
}

function clip(content) {
    return content.length > MAX_REPLY_LENGTH ? `${content.slice(0, MAX_REPLY_LENGTH)}\n…` : content;
}

async function send(ctx, campaign, user, allNames) {
    const { card, files } = campaign.build(user, allNames);
    return ctx.sendCardToUser(user.discordId, card, { files });
}

async function handleCampaign(campaign, interaction, ctx) {
    if (await ctx.denyUnlessRoot(interaction)) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // 1 Discord ID chỉ nhận 1 thẻ dù xuất hiện 2 lần trong users.json
    const skip = new Set(campaign.skip || []);
    const recipients = [
        ...new Map(
            ctx
                .loadUsersWithDiscordId()
                .filter((user) => !skip.has(user.name) && (!campaign.only || campaign.only(user)))
                .map((user) => [user.discordId, user])
        ).values(),
    ];
    const allNames = recipients.map((user) => user.name);

    if (interaction.options.getString("che-do") === "thu") {
        const me = {
            discordId: interaction.user.id,
            name:
                ctx.findUserByDiscordId(interaction.user.id)?.name ||
                interaction.user.globalName ||
                interaction.user.username,
        };
        const result = await send(ctx, campaign, me, allNames);
        await interaction.editReply(
            result.success
                ? `🧪 Đã gửi thử vào DM của bạn. Gửi thật sẽ tới ${recipients.length} người trong \`data/users.json\`.`
                : `❌ Không gửi được: ${result.error}`
        );
        return;
    }

    const pending = recipients.filter((user) => !store.hasReceived(campaign.id, user.discordId));
    const lines = [];
    for (const user of pending) {
        const result = await send(ctx, campaign, user, allNames);
        if (result.success) {
            store.markSent(campaign.id, user.discordId);
            lines.push(`✅ ${user.name}`);
        } else {
            lines.push(`❌ ${user.name}: ${result.error}`);
        }
        await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
    }

    const sent = lines.filter((line) => line.startsWith("✅")).length;
    console.log(`💌 ${campaign.id}: gửi ${sent}/${pending.length} người`);
    // Người lỗi lên đầu để không bị cắt mất khi danh sách dài
    lines.sort((a, b) => a.startsWith("✅") - b.startsWith("✅"));
    await interaction.editReply(
        clip(
            [
                `${campaign.label}: gửi ${sent}/${pending.length} người` +
                    ` (đã nhận từ trước: ${recipients.length - pending.length})`,
                ...(lines.length ? lines : ["Không còn ai chưa nhận."]),
            ].join("\n")
        )
    );
}

// ---------------------------------------------------------------------------
// Nút trong thư chúc: bóc thư, mở quà. Sửa luôn tin đang có (thay ảnh đính kèm)

function wishRecipientName(interaction, ctx) {
    return (
        ctx.findUserByDiscordId(interaction.user.id)?.name || interaction.user.globalName || interaction.user.username
    );
}

// Anh em đồng ký tên: mọi người có gender "male", mỗi tên 1 lần
function wishSigners(ctx) {
    return [...new Set(ctx.loadUsersWithDiscordId().filter((user) => user.gender === "male").map((user) => user.name))];
}

const WISH_OPENED_KEY = `${WISH_ID}:opened`;
const WISH_GIFT_KEY = `${WISH_ID}:gift`;

// Phiếu còn bốc được (bỏ phiếu có replacedBy)
const ACTIVE_VOUCHERS = WISH_VOUCHERS.map((voucher, index) => index).filter(
    (index) => WISH_VOUCHERS[index].replacedBy === undefined
);

// Phiếu quà của người bấm: đã bốc rồi thì giữ phiếu cũ (phiếu đã bỏ thì lấy phiếu
// thay thế), chưa thì bốc ngẫu nhiên và lưu lại
function drawVoucher(discordId) {
    const existing = store.entries(WISH_GIFT_KEY)[discordId];
    if (existing && WISH_VOUCHERS[existing.voucher]) return WISH_VOUCHERS[existing.voucher].replacedBy ?? existing.voucher;
    const voucher = ACTIVE_VOUCHERS[Math.floor(Math.random() * ACTIVE_VOUCHERS.length)];
    store.setEntry(WISH_GIFT_KEY, discordId, { voucher, at: new Date().toISOString() });
    return voucher;
}

async function handleInteraction(interaction, ctx) {
    if (interaction.customId !== WISH_OPEN_ID && interaction.customId !== WISH_GIFT_ID) return;
    const discordId = interaction.user.id;
    let voucherIndex = null;
    if (interaction.customId === WISH_OPEN_ID) {
        if (!store.entries(WISH_OPENED_KEY)[discordId]) store.setEntry(WISH_OPENED_KEY, discordId, new Date().toISOString());
    } else {
        voucherIndex = drawVoucher(discordId);
    }

    const name = wishRecipientName(interaction, ctx);
    const { card, files } = buildWishLetterCard({ name, signers: wishSigners(ctx), voucherIndex });
    // attachments: [] bỏ ảnh cũ, chỉ giữ các ảnh trong files
    await interaction.update({ ...ctx.cardPayload(card, { files }), attachments: [] });
    console.log(
        voucherIndex === null ? `💌 ${name} vừa bóc thư 20/10` : `🎁 ${name} vừa mở quà 20/10: phiếu số ${voucherIndex + 1}`
    );
}

// ---------------------------------------------------------------------------
// /qua-20-10: ai đã nhận thư chúc, bóc thư, trúng phiếu gì

const giftReportCommand = new SlashCommandBuilder()
    .setName("qua-20-10")
    .setDescription("[Root] Xem ai đã nhận thư chúc 20/10, bóc thư, trúng phiếu quà nào")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([InteractionContextType.Guild])
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .toJSON();

function formatTime(iso) {
    return `<t:${Math.floor(new Date(iso).getTime() / 1000)}:f>`;
}

function voucherLabel(index) {
    const voucher = WISH_VOUCHERS[index];
    return voucher ? `${voucher.emoji} ${voucher.title}` : `phiếu số ${index + 1}`;
}

async function handleGiftReport(interaction, ctx) {
    if (await ctx.denyUnlessRoot(interaction)) return;

    const opened = store.entries(WISH_OPENED_KEY);
    const gifts = store.entries(WISH_GIFT_KEY);
    const wishCampaign = CAMPAIGNS.find((campaign) => campaign.id === WISH_ID);
    const recipients = [
        ...new Map(
            ctx
                .loadUsersWithDiscordId()
                .filter(wishCampaign.only)
                .map((user) => [user.discordId, user])
        ).values(),
    ];
    // Người bấm nhưng không nằm trong danh sách nhận (vd root gửi thử)
    const recipientIds = new Set(recipients.map((user) => user.discordId));
    const others = [...new Set([...Object.keys(opened), ...Object.keys(gifts)])]
        .filter((id) => !recipientIds.has(id))
        .map((id) => ({ discordId: id, name: ctx.findUserByDiscordId(id)?.name || `<@${id}>` }));

    const line = (user) => {
        const gift = gifts[user.discordId];
        if (gift) return `🎁 **${user.name}**: ${voucherLabel(gift.voucher)} (${formatTime(gift.at)})`;
        if (opened[user.discordId]) return `💌 **${user.name}**: đã bóc thư, chưa mở quà`;
        if (store.hasReceived(WISH_ID, user.discordId)) return `📮 **${user.name}**: đã nhận, chưa bóc thư`;
        return `⏳ **${user.name}**: chưa gửi`;
    };

    const tally = new Map();
    for (const user of recipients) {
        const gift = gifts[user.discordId];
        if (gift) tally.set(gift.voucher, (tally.get(gift.voucher) || 0) + 1);
    }
    const lines = [
        `🎁 **Quà 20/10:** ${recipients.filter((u) => gifts[u.discordId]).length}/${recipients.length} chị em đã mở quà`,
        ...recipients.map(line),
    ];
    if (tally.size) {
        lines.push("", "**Tổng phiếu cần đổi:**");
        lines.push(...[...tally].sort((a, b) => a[0] - b[0]).map(([index, count]) => `• ${voucherLabel(index)}: ${count}`));
    }
    if (others.length) lines.push("", "-# Ngoài danh sách (gửi thử):", ...others.map((user) => `-# ${line(user)}`));

    await interaction.reply({ content: clip(lines.join("\n")), flags: MessageFlags.Ephemeral });
}

// ---------------------------------------------------------------------------
// /doi-phieu-qua: người đang giữ phiếu đã bỏ -> sửa tin trong DM sang phiếu thay
// thế + cập nhật dữ liệu. Không lưu mã tin nên dò trong các tin gần nhất của DM

const SWAP_SCAN_LIMIT = 50; // số tin gần nhất trong DM để dò

const swapCommand = new SlashCommandBuilder()
    .setName("doi-phieu-qua")
    .setDescription("[Root] Đổi phiếu quà 20/10 đã bỏ sang phiếu thay thế, sửa luôn tin trong DM")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([InteractionContextType.Guild])
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .addStringOption((option) =>
        option
            .setName("che-do")
            .setDescription("Xem trước hay đổi thật")
            .addChoices(
                { name: "Xem trước ai sẽ được đổi phiếu", value: "xem" },
                { name: "Đổi thật, sửa tin trong DM", value: "doi" }
            )
            .setRequired(true)
    )
    .toJSON();

// Tin thư chúc đã mở quà (có ảnh phiếu) của bot trong 1 DM
async function findGiftMessages(ctx, discordId) {
    const user = await ctx.client.users.fetch(discordId);
    const channel = await user.createDM();
    const messages = await channel.messages.fetch({ limit: SWAP_SCAN_LIMIT });
    return [...messages.values()].filter(
        (message) =>
            message.author.id === ctx.client.user.id &&
            // Gửi xong Discord đổi attachment://<tên> thành link CDN .../<tên>?...
            message.components.some((c) => JSON.stringify(c.toJSON()).includes(`/${WISH_VOUCHER_FILE}?`))
    );
}

async function handleSwap(interaction, ctx) {
    if (await ctx.denyUnlessRoot(interaction)) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const dryRun = interaction.options.getString("che-do") === "xem";

    const gifts = store.entries(WISH_GIFT_KEY);
    const targets = Object.entries(gifts).filter(([, gift]) => WISH_VOUCHERS[gift.voucher]?.replacedBy !== undefined);
    const signers = wishSigners(ctx);
    const lines = [];
    let swapped = 0;
    for (const [discordId, gift] of targets) {
        const name = ctx.findUserByDiscordId(discordId)?.name || `<@${discordId}>`;
        const voucher = WISH_VOUCHERS[gift.voucher].replacedBy;
        const change = `${voucherLabel(gift.voucher)} → ${voucherLabel(voucher)}`;
        try {
            const messages = await findGiftMessages(ctx, discordId);
            if (!messages.length) {
                lines.push(`⚠️ ${name}: ${change}, không tìm thấy tin trong DM`);
                continue;
            }
            if (!dryRun) {
                const { card, files } = buildWishLetterCard({ name, signers, voucherIndex: voucher });
                for (const message of messages) await message.edit({ components: [card], files, attachments: [] });
                store.setEntry(WISH_GIFT_KEY, discordId, { ...gift, voucher, replaced: gift.voucher });
            }
            swapped += 1;
            lines.push(`${dryRun ? "🔁" : "✅"} ${name}: ${change}`);
        } catch (error) {
            lines.push(`❌ ${name}: ${error.message}`);
        }
    }

    console.log(`🔁 Đổi phiếu quà 20/10: ${swapped} người${dryRun ? " (xem trước)" : ""}`);
    const header = dryRun
        ? `👀 **Xem trước:** ${swapped} người sẽ được đổi phiếu, chọn \`doi\` để đổi thật`
        : `🔁 **Đã đổi phiếu** cho ${swapped} người`;
    await interaction.editReply(clip([header, ...(lines.length ? lines : ["Không ai đang giữ phiếu đã bỏ."])].join("\n")));
}

module.exports = {
    name: "event-invite",
    interactionPrefix: PREFIX,
    handleInteraction,
    commands: [
        ...CAMPAIGNS.map((campaign) => ({
            data: buildCommand(campaign),
            execute: (interaction, ctx) => handleCampaign(campaign, interaction, ctx),
        })),
        { data: giftReportCommand, execute: handleGiftReport },
        { data: swapCommand, execute: handleSwap },
    ],
    start(ctx) {
        store.init(ctx.dataDir("event-invite"));
    },
};
