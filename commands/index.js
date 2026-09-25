/**
 * Danh sách mọi slash command và nút bấm của bot.
 *
 * Mỗi module lệnh export:
 *   commands: [{ data, execute(interaction, deps) }]  - data là JSON của SlashCommandBuilder
 *   buttons:  [{ customId, execute(interaction, deps) }]
 *
 * Thêm lệnh mới: viết module theo mẫu trên rồi thêm vào MODULES.
 */
const MODULES = [
    require("./meal"), // /abcom, /test-meal, nút Xem cả tuần
    require("./help"), // /help
    require("./abc"), // /abc
    require("./football"), // /fbdate, /fbname, /test-football
    require("./gold"), // /giavang, nút Làm mới
    require("./fuel"), // /giaxang, nút bật / tắt báo giá
    require("./makeup-day"), // /lam-bu
    require("./gif"), // /test-send-gif, /test-standup
    require("./clean-standup"), // /don-standup
    require("./check-users"), // /check-users
    require("./sheet-admin"), // /configsheet, /testsheetcheck
];

const commands = MODULES.flatMap((m) => m.commands || []);
const buttons = MODULES.flatMap((m) => m.buttons || []);

const commandByName = new Map(commands.map((c) => [c.data.name, c]));
const buttonById = new Map(buttons.map((b) => [b.customId, b]));

if (commandByName.size !== commands.length) throw new Error("Có 2 lệnh trùng tên trong commands/");
if (buttonById.size !== buttons.length) throw new Error("Có 2 nút trùng customId trong commands/");

module.exports = {
    commandData: commands.map((c) => c.data),
    commandByName,
    buttonById,
};
