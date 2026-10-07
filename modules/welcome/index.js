/**
 * Module chào mừng nhân viên quay lại sau thời gian nghỉ: DM 1 thẻ chào + giới thiệu
 * các tính năng của bot, có nút mở nhanh từng tính năng.
 *
 *   /welcome-back che-do:thu [id]    (root) gửi thử vào DM của root; có id thì thẻ ghi tên người đó
 *   /welcome-back che-do:that id     (root) gửi thật cho Discord ID đã nhập
 *
 * Không lưu dữ liệu: chạy lại là gửi lại. Sửa chữ ở texts.js.
 */
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    InteractionContextType,
    ApplicationIntegrationType,
} = require("discord.js");
const { PREFIX, SEE_PREFIX, buildWelcomeCard } = require("./cards");

const DISCORD_ID_PATTERN = /^\d{17,20}$/;

const welcomeBackCommand = new SlashCommandBuilder()
    .setName("welcome-back")
    .setDescription("[Root] Gửi thẻ chào mừng quay lại + giới thiệu tính năng của bot")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([InteractionContextType.Guild])
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .addStringOption((option) =>
        option
            .setName("che-do")
            .setDescription("Gửi cho ai")
            .addChoices(
                { name: "Gửi thử vào DM của tôi", value: "thu" },
                { name: "Gửi thật cho người có Discord ID bên dưới", value: "that" }
            )
            .setRequired(true)
    )
    .addStringOption((option) =>
        option
            .setName("id")
            .setDescription("Discord ID người quay lại (bắt buộc khi gửi thật; gửi thử thì chỉ để lấy tên)")
            .setRequired(false)
    )
    .toJSON();

// "Mai Xuân Hiếu" -> "Hiếu"
function givenName(fullName) {
    return fullName.trim().split(/\s+/).pop();
}

// Tên gọi trong thẻ: tên trong users.json, không có thì tên Discord
function displayName(ctx, discordUser) {
    const name = ctx.findUserByDiscordId(discordUser.id)?.name;
    return name ? givenName(name) : discordUser.globalName || discordUser.username;
}

// Người này có đang nhận tin tự động không, để root biết cần sửa users.json
function dataNote(ctx, discordId) {
    const user = ctx.findUserByDiscordId(discordId);
    if (!user) return "⚠️ Người này chưa có trong `data/users.json` nên chưa nhận thẻ báo cơm 12h.";
    if (user.enabled !== true) {
        return `⚠️ **${user.name}** đang \`enabled: false\` trong \`data/users.json\` nên chưa nhận thẻ báo cơm 12h.`;
    }
    return `📋 **${user.name}** đang bật nhận thẻ báo cơm 12h.`;
}

async function handleWelcomeBack(interaction, ctx) {
    if (await ctx.denyUnlessRoot(interaction)) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const real = interaction.options.getString("che-do") === "that";
    const targetId = interaction.options.getString("id")?.trim() || null;
    if (real && !targetId) {
        await interaction.editReply("❌ Gửi thật thì phải nhập `id` (Discord ID của người quay lại).");
        return;
    }
    if (targetId && !DISCORD_ID_PATTERN.test(targetId)) {
        await interaction.editReply(`❌ "${targetId}" không phải Discord ID (chỉ gồm 17-20 chữ số).`);
        return;
    }

    let target = interaction.user;
    if (targetId) {
        try {
            target = await ctx.client.users.fetch(targetId);
        } catch (error) {
            await interaction.editReply(`❌ Không tìm thấy Discord ID ${targetId}: ${error.message}`);
            return;
        }
        if (target.bot) {
            await interaction.editReply(`❌ ${target.tag} là bot, không gửi.`);
            return;
        }
    }

    const card = buildWelcomeCard({
        name: displayName(ctx, target),
        adminId: ctx.adminId,
        mealWeekButtonId: ctx.features.mealWeekButtonId,
    });
    const result = await ctx.sendCardToUser(real ? target.id : interaction.user.id, card);
    if (!result.success) {
        await interaction.editReply(`❌ Không gửi được: ${result.error}`);
        return;
    }

    if (!real) {
        await interaction.editReply(
            "🧪 Đã gửi thử vào DM của bạn" +
                (targetId ? ` (thẻ ghi tên của ${target.tag}).` : ".") +
                " Nút bấm chạy thật trên tài khoản của bạn."
        );
        return;
    }
    console.log(`👋 Đã gửi thẻ chào mừng quay lại cho ${target.tag} (${target.id})`);
    await interaction.editReply(`✅ Đã gửi thẻ chào mừng quay lại cho <@${target.id}> (${target.tag}).\n${dataNote(ctx, target.id)}`);
}

// Nút "Xem ngay" trên thẻ: trả lời riêng người bấm
async function handleInteraction(interaction, ctx) {
    if (!interaction.customId.startsWith(SEE_PREFIX)) return;
    const feature = interaction.customId.slice(SEE_PREFIX.length);
    if (feature === "gold") return ctx.features.showGold(interaction);
    if (feature === "fuel") return ctx.features.showFuel(interaction);
    if (feature === "football") return ctx.features.showFootball(interaction);
}

module.exports = {
    name: "welcome",
    commands: [{ data: welcomeBackCommand, execute: handleWelcomeBack }],
    interactionPrefix: PREFIX,
    handleInteraction,
};
