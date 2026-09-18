/**
 * Đọc sheet đăng ký cơm qua Google Sheets API (service account, chỉ đọc).
 *
 * Luôn đọc cả tab trong 1 lần gọi rồi tra trong bộ nhớ (utils/meal-sheet.js),
 * không gọi API cho từng ô - Google Sheets giới hạn 60 lần đọc/phút.
 *
 * Tab đang dùng xác định theo G_SHEET_ID (gid trên URL, vd .../edit?gid=750327783).
 */
const { google } = require("googleapis");

const sheets = google.sheets({ version: "v4" });
let authClient = null;

async function initializeAuth() {
    try {
        authClient = await google.auth.getClient({
            keyFile: process.env.SERVICE_ACCOUNT_KEY_PATH || "./service/service-account-key.json",
            scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
        });
        console.log("✅ Google Sheets API đã được khởi tạo");
    } catch (error) {
        console.error("❌ Lỗi khởi tạo Google Auth:", error);
    }
}

// Lỗi API -> câu báo lỗi dễ hiểu (API chưa bật thì kèm hướng dẫn bật)
function describeApiError(error) {
    const message = error?.message || "";
    if (message.includes("has not been used") || message.includes("is disabled")) {
        const projectId = (message.match(/project (\d+)/) || [])[1];
        const apiUrl = projectId
            ? `https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=${projectId}`
            : "https://console.developers.google.com/apis/library/sheets.googleapis.com";
        return (
            `Google Sheets API chưa được bật!\n\n🔧 Cách khắc phục:\n1. Vào: ${apiUrl}\n` +
            `2. Click "Enable" để bật API\n3. Đợi vài phút để API được kích hoạt\n4. Chạy lại bot`
        );
    }
    return "Lỗi kết nối Google Sheets";
}

/**
 * Đọc toàn bộ 1 tab.
 * @returns {Promise<{ rows: string[][] } | { error: string }>}
 */
async function readSheetGrid(sheetName) {
    if (!authClient) return { error: "Google Auth chưa được khởi tạo" };

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.SHEET_ID,
            range: `'${sheetName.replace(/'/g, "''")}'`,
            auth: authClient,
        });
        return { rows: response.data.values || [] };
    } catch (error) {
        console.error("❌ Lỗi khi đọc toàn bộ sheet:", error);
        return { error: describeApiError(error) };
    }
}

/**
 * Tên tab ứng với G_SHEET_ID.
 * @returns {Promise<{ sheetName: string, source: string } | { error: string }>}
 */
async function resolveSheetName() {
    const gid = process.env.G_SHEET_ID?.trim();
    if (!gid) return { error: "Chưa cấu hình G_SHEET_ID" };
    if (!authClient) return { error: "Google Auth chưa được khởi tạo" };

    try {
        const response = await sheets.spreadsheets.get({
            spreadsheetId: process.env.SHEET_ID,
            fields: "sheets.properties",
            auth: authClient,
        });
        const sheet = (response.data.sheets || []).find((s) => String(s.properties.sheetId) === gid);
        if (!sheet) return { error: `Không tìm thấy tab nào có gid=${gid} trong spreadsheet` };
        return { sheetName: sheet.properties.title, source: "G_SHEET_ID" };
    } catch (error) {
        return { error: `Lỗi khi tra cứu gid: ${error.message}` };
    }
}

/**
 * Tab đang dùng + toàn bộ dữ liệu của nó.
 * @returns {Promise<{ sheetName: string, rows: string[][] } | { error: string, sheetName?: string }>}
 */
async function readCurrentSheet() {
    const resolved = await resolveSheetName();
    if (resolved.error) return { error: resolved.error };

    const grid = await readSheetGrid(resolved.sheetName);
    if (grid.error) return { error: grid.error, sheetName: resolved.sheetName };
    return { sheetName: resolved.sheetName, rows: grid.rows };
}

module.exports = {
    initializeAuth,
    readSheetGrid,
    resolveSheetName,
    readCurrentSheet,
};
