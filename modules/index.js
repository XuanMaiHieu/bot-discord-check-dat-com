/**
 * Nạp các module cắm thêm (mỗi thư mục con trong modules/ là 1 module).
 * Module chạy chung process với bot nhưng code tách riêng: chỉ nói chuyện với
 * bot qua `ctx` (xem modules/context.js) và các hook bên dưới.
 *
 * Mỗi module export (modules/<tên>/index.js):
 *   name               - tên module, không trùng
 *   enabled()          - false = bỏ qua module (vd đọc env FEEDBACK_ENABLED)
 *   commands           - [{ data, execute(interaction, ctx) }] như lệnh của bot
 *   interactionPrefix  - vd "fb:": mọi nút / menu / modal có customId bắt đầu
 *                        bằng prefix này được chuyển cho handleInteraction
 *   handleInteraction(interaction, ctx)
 *   start(ctx)         - chạy 1 lần khi bot sẵn sàng (cron, web server...)
 *   hooks              - { tênHook(args, ctx) } bot gọi ở những chỗ cố định:
 *       lunchCardExtras({ user, date, test }) -> component V2 | component[] | null
 *           chèn thêm vào cuối thẻ báo cơm 12h (trước hàng nút)
 *
 * Gỡ 1 module: xóa thư mục của nó. Lỗi trong module chỉ ghi log, không làm
 * sập bot hay mất tin báo cơm.
 */
const fs = require("fs");
const path = require("path");

function loadModuleFolders() {
    const loaded = [];
    const entries = fs.readdirSync(__dirname, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!fs.existsSync(path.join(__dirname, entry.name, "index.js"))) continue;

        try {
            const mod = require(`./${entry.name}`);
            if (typeof mod.enabled === "function" && !mod.enabled()) {
                console.log(`⏭️ Module "${mod.name || entry.name}" đang tắt`);
                continue;
            }
            loaded.push({ name: entry.name, commands: [], hooks: {}, ...mod });
        } catch (error) {
            console.error(`❌ Không nạp được module "${entry.name}", bỏ qua:`, error);
        }
    }
    return loaded;
}

const modules = loadModuleFolders();

const commands = modules.flatMap((mod) => mod.commands.map((command) => ({ ...command, module: mod.name })));
const commandByName = new Map(commands.map((c) => [c.data.name, c]));

if (new Set(modules.map((m) => m.name)).size !== modules.length) {
    throw new Error("Có 2 module trùng tên trong modules/");
}
if (commandByName.size !== commands.length) {
    throw new Error("Có 2 lệnh trùng tên giữa các module");
}
const prefixes = modules.map((m) => m.interactionPrefix).filter(Boolean);
if (prefixes.some((a, i) => prefixes.some((b, j) => i !== j && a.startsWith(b)))) {
    throw new Error(`Prefix customId của các module bị chồng nhau: ${prefixes.join(", ")}`);
}

/**
 * Kiểm tra module không đụng lệnh / nút có sẵn của bot. Gọi 1 lần khi khởi động.
 */
function assertNoConflicts(coreCommandNames, coreButtonIds) {
    for (const name of commandByName.keys()) {
        if (coreCommandNames.includes(name)) throw new Error(`Module định nghĩa lại lệnh /${name} của bot`);
    }
    for (const id of coreButtonIds) {
        const owner = modules.find((m) => m.interactionPrefix && id.startsWith(m.interactionPrefix));
        if (owner) throw new Error(`Nút "${id}" của bot trùng prefix của module "${owner.name}"`);
    }
}

// Module xử lý nút / menu / modal này (theo prefix customId), null nếu không có
function findInteractionModule(customId) {
    return (
        modules.find(
            (m) => m.interactionPrefix && typeof m.handleInteraction === "function" && customId.startsWith(m.interactionPrefix)
        ) || null
    );
}

async function startModules(ctx) {
    for (const mod of modules) {
        if (typeof mod.start !== "function") continue;
        try {
            await mod.start(ctx);
            console.log(`🧩 Đã bật module "${mod.name}"`);
        } catch (error) {
            console.error(`❌ Module "${mod.name}" lỗi khi khởi động:`, error);
        }
    }
}

// ctx do bot tạo khi khởi động (setHookContext), để nơi gọi hook không phải truyền
let hookContext = null;
function setHookContext(ctx) {
    hookContext = ctx;
}

/**
 * Gọi 1 hook trên mọi module, gộp kết quả thành 1 mảng (bỏ null).
 * Module nào lỗi thì chỉ ghi log và bỏ qua phần của module đó.
 */
async function runHook(hookName, args) {
    const results = [];
    for (const mod of modules) {
        const hook = mod.hooks?.[hookName];
        if (typeof hook !== "function") continue;
        try {
            const result = await hook(args, hookContext);
            if (result === null || result === undefined) continue;
            results.push(...(Array.isArray(result) ? result : [result]));
        } catch (error) {
            console.error(`❌ Hook "${hookName}" của module "${mod.name}" lỗi, bỏ qua:`, error);
        }
    }
    return results;
}

module.exports = {
    modules,
    commandData: commands.map((c) => c.data),
    commandByName,
    assertNoConflicts,
    findInteractionModule,
    startModules,
    setHookContext,
    runHook,
};
