const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    InteractionContextType,
    ApplicationIntegrationType,
    ContainerBuilder,
    SeparatorSpacingSize,
    escapeMarkdown,
} = require("discord.js");
const { findNameInRows, normalizeName } = require("../utils/meal-sheet");
const { cardPayload } = require("../utils/card-message");
const { readUsers } = require("../utils/users");
const { denyUnlessRoot } = require("../utils/admin");

// Họ tên bắt đầu từ dòng 5 của sheet (dòng 1-4 là tiêu đề và ngày)
const FIRST_NAME_ROW = 5;
const NAME_COLUMN_INDEX = 2; // cột C

// Giới hạn chữ của 1 tin V2 là 4000 ký tự; chừa khoảng trống an toàn
const MAX_TEXT_LENGTH = 3800;

// Định nghĩa command /check-users (chỉ root - Mai Xuân Hiếu - được dùng)
const checkUsersCommand = new SlashCommandBuilder()
    .setName("check-users")
    .setDescription("[Root] Kiểm tra user trong data có nhận được tin của bot không (không gửi tin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    // Chỉ dùng trong server: trong DM Discord không áp dụng quyền Administrator
    .setContexts([InteractionContextType.Guild])
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .addUserOption((option) =>
        option.setName("user").setDescription("Chỉ kiểm tra 1 người (bỏ trống = tất cả)").setRequired(false)
    )
    .toJSON();

// Kiểm tra Discord cho 1 user mà không gửi tin: ID có thật, ở chung server với
// bot, mở được kênh DM. Riêng việc người đó chặn DM thì chỉ biết khi gửi thật.
async function checkDiscord(client, discordId) {
    if (!discordId) return { problem: "chưa có Discord ID" };

    let discordUser;
    try {
        discordUser = await client.users.fetch(discordId);
    } catch (error) {
        return { problem: `ID không hợp lệ (${error.message})` };
    }

    let inGuild = false;
    for (const guild of client.guilds.cache.values()) {
        try {
            await guild.members.fetch(discordId);
            inGuild = true;
            break;
        } catch (error) {
            // không ở server này, thử server tiếp theo
        }
    }
    if (!inGuild) return { discordUser, problem: "không ở chung server với bot" };

    try {
        await discordUser.createDM();
    } catch (error) {
        return { discordUser, problem: `không mở được DM (${error.message})` };
    }
    return { discordUser };
}

// Tên trong data có tìm được trên sheet không
function checkSheet(rows, name) {
    if (!rows) return null;
    const found = findNameInRows(rows, name);
    if (found.row) return { row: found.row };
    if (found.matches) {
        return { problem: `trùng nhiều tên trên sheet (${found.matches.map((m) => m.name).join(", ")})` };
    }
    return { problem: "không có tên trên sheet" };
}

// Tên trên sheet mà data chưa có ai khớp. Chỉ xét khối tên liền nhau từ dòng 5,
// dừng ở ô trống đầu tiên (bên dưới sheet còn ghi chú / ô rác)
function sheetNamesMissingFromData(rows, users) {
    const known = new Set(users.map((u) => normalizeName(u.name)));
    const names = [];
    for (let i = FIRST_NAME_ROW - 1; i < rows.length; i++) {
        const name = (rows[i]?.[NAME_COLUMN_INDEX] ?? "").toString().trim();
        if (!name) break;
        names.push({ row: i + 1, name });
    }
    return names.filter((x) => !known.has(normalizeName(x.name)));
}

// "🍱 ⏰ ⚽": các loại tin user đang bật
function subscriptionIcons(user) {
    return [
        user.enabled === true ? "🍱" : null,
        user.enabled === true && user.order_reminder !== false ? "⏰" : null,
        user.football_notify === true ? "⚽" : null,
    ]
        .filter(Boolean)
        .join("");
}

function userLine(result, { compact }) {
    const { user, discord, sheet } = result;
    const problems = [discord.problem, sheet?.problem].filter(Boolean);
    const icon = !user.enabled ? "💤" : problems.length ? "❌" : "✅";
    const name = `**${escapeMarkdown(user.name)}**`;

    const parts = [`${icon} ${name}`];
    if (discord.discordUser && !compact) parts.push(`@${escapeMarkdown(discord.discordUser.username)}`);
    if (sheet?.row && !compact) parts.push(`dòng ${sheet.row}`);
    const icons = subscriptionIcons(user);
    if (icons) parts.push(icons);
    if (problems.length) parts.push(`⚠️ ${problems.join("; ")}`);
    return parts.join(" · ");
}

function buildReport({ results, missingFromSheet, sheetName, sheetError }) {
    const failed = results.filter((r) => r.user.enabled && (r.discord.problem || r.sheet?.problem));
    const disabled = results.filter((r) => !r.user.enabled);
    const ok = results.length - failed.length - disabled.length;

    const container = new ContainerBuilder().setAccentColor(failed.length ? 0xef4444 : 0x22c55e);
    container.addTextDisplayComponents((t) =>
        t.setContent(
            [
                "## 🩺 Kiểm tra user",
                `-# ✅ ${ok} ổn · ❌ ${failed.length} có vấn đề · 💤 ${disabled.length} đang tắt · không gửi tin nào`,
                `-# Sheet: ${sheetName ? `**${escapeMarkdown(sheetName)}**` : `không đọc được (${sheetError})`}`,
            ].join("\n")
        )
    );

    // Người có vấn đề lên đầu, rồi tới người ổn, cuối cùng người đang tắt
    const ordered = [...failed, ...results.filter((r) => !failed.includes(r) && r.user.enabled), ...disabled];
    let list = ordered.map((r) => userLine(r, { compact: false })).join("\n");
    if (list.length > MAX_TEXT_LENGTH - 600) {
        list = ordered.map((r) => userLine(r, { compact: true })).join("\n");
    }
    container.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents((t) => t.setContent(list));

    if (missingFromSheet.length) {
        container.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents((t) =>
            t.setContent(
                "**🆕 Có trên sheet nhưng chưa có trong data**\n" +
                    missingFromSheet.map((x) => `- dòng ${x.row}: ${escapeMarkdown(x.name)}`).join("\n")
            )
        );
    }

    container.addTextDisplayComponents((t) =>
        t.setContent(
            "-# 🍱 cơm 12h + nhắc đứng dậy · ⏰ nhắc đặt cơm thứ 2 · ⚽ bóng đá\n" +
                "-# Người đã tắt nhận DM từ thành viên server thì chỉ biết khi bot gửi thật"
        )
    );
    return container;
}

/**
 * Xử lý /check-users: kiểm tra Discord + sheet cho từng user, không gửi tin.
 */
async function handleCheckUsersCommand(interaction, deps) {
    if (await denyUnlessRoot(interaction)) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const allUsers = readUsers();
        const target = interaction.options.getUser("user");
        const users = target ? allUsers.filter((u) => u.discordId === target.id) : allUsers;
        if (target && users.length === 0) {
            await interaction.editReply(`❌ <@${target.id}> chưa có trong data/users.json`);
            return;
        }

        const resolved = await deps.resolveSheetName();
        const grid = resolved.error ? { error: resolved.error } : await deps.readSheetGrid(resolved.sheetName);
        const rows = grid.rows || null;

        const results = [];
        for (const user of users) {
            results.push({
                user,
                discord: await checkDiscord(interaction.client, user.discordId),
                sheet: checkSheet(rows, user.name),
            });
        }

        const container = buildReport({
            results,
            // Chỉ liệt kê người thiếu khi kiểm tra tất cả
            missingFromSheet: rows && !target ? sheetNamesMissingFromData(rows, allUsers) : [],
            sheetName: rows ? resolved.sheetName : null,
            sheetError: grid.error,
        });
        await interaction.editReply(cardPayload(container));
    } catch (error) {
        console.error("❌ Lỗi khi xử lý /check-users:", error);
        await interaction.editReply(`❌ Có lỗi xảy ra: ${error.message}`);
    }
}

module.exports = {
    commands: [{ data: checkUsersCommand, execute: handleCheckUsersCommand }],
};
