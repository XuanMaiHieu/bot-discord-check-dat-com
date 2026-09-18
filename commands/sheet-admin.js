const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    InteractionContextType,
    ApplicationIntegrationType,
} = require("discord.js");
const { ADMIN_SHEET_NAME } = require("../config");
const { denyUnlessRoot } = require("../utils/admin");
const { updateEnvFile } = require("../utils/env-store");
const { inspectSheet, buildManualCheckReport } = require("../utils/sheet-health");

// Định nghĩa command /configsheet (chỉ root)
const configSheetCommand = new SlashCommandBuilder()
    .setName("configsheet")
    .setDescription("[Admin] Cấu hình SHEET_ID / G_SHEET_ID (gid) cho bot")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([InteractionContextType.Guild])
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .addStringOption((option) =>
        option.setName("sheet_id").setDescription("ID của Google Spreadsheet (SHEET_ID)").setRequired(false)
    )
    .addStringOption((option) =>
        option
            .setName("gid")
            .setDescription("GID của tab trong URL, vd: .../edit?gid=750327783 (G_SHEET_ID)")
            .setRequired(false)
    )
    .toJSON();

// Định nghĩa command /testsheetcheck (chỉ root)
const testSheetCheckCommand = new SlashCommandBuilder()
    .setName("testsheetcheck")
    .setDescription("[Admin] Chạy thử kiểm tra sheet ngay và gửi kết quả qua DM")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([InteractionContextType.Guild])
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .toJSON();

// /configsheet: lưu SHEET_ID / G_SHEET_ID vào .env rồi kiểm tra đọc được sheet mới
async function handleConfigSheetCommand(interaction) {
    if (await denyUnlessRoot(interaction)) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sheetIdInput = interaction.options.getString("sheet_id");
    const gidInput = interaction.options.getString("gid");
    if (!sheetIdInput && !gidInput) {
        await interaction.editReply("❌ Vui lòng nhập ít nhất một trong: sheet_id, gid");
        return;
    }

    const updates = {};
    if (sheetIdInput) updates.SHEET_ID = sheetIdInput.trim();
    if (gidInput) updates.G_SHEET_ID = gidInput.trim();

    try {
        updateEnvFile(updates);
    } catch (error) {
        await interaction.editReply(`❌ Lỗi khi lưu cấu hình: ${error.message}`);
        return;
    }

    const result = await inspectSheet();
    if (result.error) {
        await interaction.editReply(
            `⚠️ Đã lưu cấu hình nhưng không đọc được sheet:\n${result.error}\n\n` +
                `Vui lòng kiểm tra lại SHEET_ID / G_SHEET_ID (gid).`
        );
        return;
    }
    if (result.adminRow.error) {
        await interaction.editReply(
            `⚠️ Đã lưu cấu hình nhưng kiểm tra không thành công.\n` +
                `Sheet đang dùng: "${result.sheetName}" (từ G_SHEET_ID)\n` +
                `Lỗi: ${result.adminRow.error}\n\n` +
                `Vui lòng kiểm tra lại cấu hình sheet.`
        );
        return;
    }

    await interaction.editReply(
        `✅ Đã lưu cấu hình thành công!\n` +
            `**SHEET_ID:** ${process.env.SHEET_ID}\n` +
            `**Sheet đang dùng:** "${result.sheetName}" (từ G_SHEET_ID)\n` +
            `**Kiểm tra:** Tìm thấy "${ADMIN_SHEET_NAME}" tại dòng ${result.adminRow.row} ✅`
    );
}

// /testsheetcheck: chạy các kiểm tra sheet ngay, gửi kết quả qua DM và trả lời luôn
async function handleTestSheetCheckCommand(interaction) {
    if (await denyUnlessRoot(interaction)) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const report = await buildManualCheckReport();
    try {
        await interaction.user.send(report);
    } catch (error) {
        console.error("❌ Không thể gửi DM test cho admin:", error);
    }
    await interaction.editReply(`Đã chạy test và gửi kết quả qua DM.\n\n${report}`);
}

module.exports = {
    commands: [
        { data: configSheetCommand, execute: handleConfigSheetCommand },
        { data: testSheetCheckCommand, execute: handleTestSheetCheckCommand },
    ],
};
