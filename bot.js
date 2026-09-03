const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
} = require("discord.js");
const { google } = require("googleapis");
const dotenv = require("dotenv");
const {
    commandData: abcCommandData,
    handleAbcCommand,
} = require("./commands/abc");
const {
    fbdateCommand,
    fbnameCommand,
    handleFootballCommands,
} = require("./commands/football");
const {
    startDailyFoodScheduler,
} = require("./scheduler/daily-food-notification");
const { startFootballScheduler } = require("./scheduler/football-notification");
const {
    startSheetHealthCheckScheduler,
} = require("./scheduler/sheet-health-check");
const {
    startMonthlySheetCheckScheduler,
} = require("./scheduler/monthly-sheet-check");
const { updateEnvFile } = require("./utils/env-store");

// Load environment variables
dotenv.config();

// Discord ID của quản trị viên (Mai Xuân Hiếu) - người duy nhất được setup env và nhận cảnh báo
const ADMIN_DISCORD_ID = "747134485946171403";

// Tạo client Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages, // Cho phép bot nhận tin nhắn trực tiếp
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
    ],
});

client.once("ready", async () => {
    console.log(`✅ Bot đã sẵn sàng! (${client.user.tag})`);

    try {
        const rest = new REST({ version: "10" }).setToken(
            process.env.DISCORD_TOKEN
        );

        const commands = [
            new SlashCommandBuilder()
                .setName("abcom")
                .setDescription("Tra cứu thông tin đăng ký cơm trưa")
                .addStringOption((option) =>
                    option
                        .setName("name")
                        .setDescription(
                            "Tên cần tìm (bắt buộc, có thể nhập một phần tên)"
                        )
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("day")
                        .setDescription("Ngày cần tìm (tùy chọn, ví dụ: 23/12)")
                        .setRequired(false)
                )
                .toJSON(),
            new SlashCommandBuilder()
                .setName("help")
                .setDescription("Xem hướng dẫn sử dụng bot")
                .toJSON(),
            abcCommandData, // Thêm command /abc
            fbdateCommand, // Thêm command /fbdate
            fbnameCommand, // Thêm command /fbname
            new SlashCommandBuilder()
                .setName("configsheet")
                .setDescription(
                    "[Admin] Cấu hình SHEET_ID / G_SHEET_ID (gid) cho bot"
                )
                .addStringOption((option) =>
                    option
                        .setName("sheet_id")
                        .setDescription("ID của Google Spreadsheet (SHEET_ID)")
                        .setRequired(false)
                )
                .addStringOption((option) =>
                    option
                        .setName("gid")
                        .setDescription(
                            "GID của tab trong URL, vd: .../edit?gid=750327783 (G_SHEET_ID)"
                        )
                        .setRequired(false)
                )
                .toJSON(),
            new SlashCommandBuilder()
                .setName("testsheetcheck")
                .setDescription(
                    "[Admin] Chạy thử kiểm tra sheet ngay và gửi kết quả qua DM"
                )
                .toJSON(),
        ];

        await rest.put(Routes.applicationCommands(client.user.id), {
            body: commands,
        });

        console.log(
            "✅ Đã đăng ký slash commands: /abcom, /abc, /help, /configsheet, /testsheetcheck"
        );
    } catch (error) {
        console.error("❌ Lỗi khi đăng ký slash commands:", error);
    }

    // Khởi động scheduler gửi thông báo món ăn hàng ngày
    startDailyFoodScheduler(
        client,
        resolveSheetName,
        findNameInColumn,
        findDateInRow,
        getCellValue
    );

    // Khởi động scheduler gửi thông báo bóng đá
    startFootballScheduler(client);

    // Khởi động scheduler kiểm tra kết nối Google Sheet mỗi ngày 8h sáng
    startSheetHealthCheckScheduler(
        client,
        resolveSheetName,
        checkSheetConnection,
        ADMIN_DISCORD_ID
    );

    // Khởi động scheduler kiểm tra đầu tháng (ngày 1, 8h sáng): sheet có đúng
    // ngày hôm nay chưa và lấy được dữ liệu dòng của admin không
    startMonthlySheetCheckScheduler(
        client,
        resolveSheetName,
        checkMonthlySheetHealth,
        ADMIN_DISCORD_ID
    );
});

// Khởi tạo Google Auth Client
let authClient;
async function initializeAuth() {
    try {
        authClient = await google.auth.getClient({
            keyFile:
                process.env.SERVICE_ACCOUNT_KEY_PATH ||
                "./service/service-account-key.json",
            scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
        });
        console.log("✅ Google Sheets API đã được khởi tạo");
    } catch (error) {
        console.error("❌ Lỗi khởi tạo Google Auth:", error);
    }
}

// Kết nối với Google Sheets API
const sheets = google.sheets({ version: "v4" });

// Lấy danh sách các tab (sheets.properties) của spreadsheet hiện tại
async function getSpreadsheetSheetsMetadata() {
    if (!authClient) {
        throw new Error("Google Auth chưa được khởi tạo");
    }

    const response = await sheets.spreadsheets.get({
        spreadsheetId: process.env.SHEET_ID,
        fields: "sheets.properties",
        auth: authClient,
    });

    return response.data.sheets || [];
}

function findSheetByGid(sheetsList, gid) {
    return sheetsList.find((s) => String(s.properties.sheetId) === gid);
}

// Xác định tên tab (sheet) sẽ dùng: luôn tra theo G_SHEET_ID (gid trên URL,
// vd: .../edit?gid=750327783), không dùng tên sheet nữa.
async function resolveSheetName() {
    const gid = process.env.G_SHEET_ID?.trim();
    if (!gid) {
        return { error: "Chưa cấu hình G_SHEET_ID" };
    }

    try {
        const sheetsList = await getSpreadsheetSheetsMetadata();
        const sheet = findSheetByGid(sheetsList, gid);

        if (!sheet) {
            return {
                error: `Không tìm thấy tab nào có gid=${gid} trong spreadsheet`,
            };
        }

        return { sheetName: sheet.properties.title, source: "G_SHEET_ID" };
    } catch (err) {
        return { error: `Lỗi khi tra cứu gid: ${err.message}` };
    }
}

// Kiểm tra kết nối Google Sheet bằng cách tìm dòng của "Mai Xuân Hiếu" và
// đọc thử vài giá trị trong dòng đó (đúng như case kiểm tra hàng ngày 8h sáng)
async function checkSheetConnection(sheetName) {
    if (!authClient) {
        return { error: "Google Auth chưa được khởi tạo" };
    }

    const nameResult = await findNameInColumn(sheetName, "Mai Xuân Hiếu");
    if (nameResult.error) {
        return { error: nameResult.error };
    }
    if (!nameResult.row) {
        return { error: 'Không tìm thấy "Mai Xuân Hiếu" trong sheet' };
    }

    const rowResult = await getLast5ValuesInRow(sheetName, nameResult.row);
    if (rowResult.error) {
        return { error: rowResult.error };
    }

    return {
        success: true,
        row: nameResult.row,
        valuesWithDates: rowResult.valuesWithDates || [],
    };
}

// Kiểm tra dòng 4 của sheet có chứa đúng ngày hôm nay không. Dòng 4 là lịch theo
// tuần nên không thể chỉ so tháng của ngày đầu tiên (tuần có thể bắt đầu từ
// tháng trước) - phải kiểm tra chính xác ngày hôm nay có nằm trong đó không,
// vì đây chính là điều kiện /abcom và job gửi món ăn dùng để tra cột.
async function checkSheetHasTodayDate(sheetName) {
    const datesResult = await getRow4Dates(sheetName);
    if (datesResult.error) {
        return { error: datesResult.error };
    }

    const dates = (datesResult.dates || []).filter(
        (d) => d && d.toString().trim()
    );
    if (dates.length === 0) {
        return { error: "Không tìm thấy ngày nào trong dòng 4 của sheet" };
    }

    const today = getTodayDate();
    const hasToday = dates.some((d) => normalizeDateText(d) === today);

    if (!hasToday) {
        return {
            error:
                `Không tìm thấy ngày hôm nay (${today}) trong dòng 4 của sheet. ` +
                `Có thể sheet chưa được cập nhật cho tháng/tuần mới, kiểm tra lại G_SHEET_ID.`,
        };
    }

    return { success: true, today };
}

// Kiểm tra đầu tháng: sheet có đúng ngày hôm nay + lấy được dữ liệu dòng của admin
async function checkMonthlySheetHealth(sheetName) {
    const dateResult = await checkSheetHasTodayDate(sheetName);
    if (dateResult.error) {
        return { error: dateResult.error };
    }

    const rowResult = await checkSheetConnection(sheetName);
    if (rowResult.error) {
        return { error: rowResult.error };
    }

    return { success: true, today: dateResult.today, row: rowResult.row };
}

// Chạy thử cả 2 loại kiểm tra (kết nối/dòng admin + đúng tháng) và trả về báo cáo dạng text
async function buildManualCheckReport() {
    const resolvedSheet = await resolveSheetName();
    if (resolvedSheet.error) {
        return `❌ Không xác định được sheet:\n${resolvedSheet.error}`;
    }

    const dailyCheck = await checkSheetConnection(resolvedSheet.sheetName);
    const dateCheck = await checkSheetHasTodayDate(resolvedSheet.sheetName);

    return (
        `🧪 **Kết quả test kiểm tra sheet**\n` +
        `Sheet đang dùng: "${resolvedSheet.sheetName}" (từ ${resolvedSheet.source})\n\n` +
        (dailyCheck.error
            ? `❌ Kiểm tra kết nối / dòng admin: ${dailyCheck.error}\n`
            : `✅ Kiểm tra kết nối / dòng admin: OK (dòng ${dailyCheck.row})\n`) +
        (dateCheck.error
            ? `❌ Kiểm tra ngày hôm nay trong sheet: ${dateCheck.error}`
            : `✅ Kiểm tra ngày hôm nay trong sheet: OK (${dateCheck.today})`)
    );
}

// Hàm chuẩn hóa tên (bỏ dấu, lowercase, trim)
function normalizeName(name) {
    if (!name) return "";
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "d")
        .trim();
}

// Hàm tìm kiếm thông minh trong cột C
async function findNameInColumn(sheetName, searchQuery) {
    if (!authClient) {
        return { error: "Google Auth chưa được khởi tạo" };
    }

    try {
        const request = {
            spreadsheetId: process.env.SHEET_ID,
            range: `${sheetName}!C:C`, // Đọc toàn bộ cột C
            auth: authClient,
        };

        const response = await sheets.spreadsheets.values.get(request);
        const values = response.data.values || [];

        const normalizedQuery = normalizeName(searchQuery);
        const exactMatches = [];
        const partialMatches = [];

        for (let i = 0; i < values.length; i++) {
            if (!values[i] || !values[i][0]) continue;

            const cellValue = values[i][0].toString().trim();
            if (!cellValue) continue;

            const normalizedCell = normalizeName(cellValue);

            if (normalizedCell === normalizedQuery) {
                exactMatches.push({ row: i + 1, name: cellValue });
            } else if (
                normalizedCell.includes(normalizedQuery) ||
                normalizedQuery.includes(normalizedCell)
            ) {
                partialMatches.push({ row: i + 1, name: cellValue });
            }
        }

        if (exactMatches.length > 0) {
            if (exactMatches.length === 1) {
                return { row: exactMatches[0].row, name: exactMatches[0].name };
            } else {
                return { matches: exactMatches, type: "exact" };
            }
        }

        if (partialMatches.length > 0) {
            if (partialMatches.length === 1) {
                return {
                    row: partialMatches[0].row,
                    name: partialMatches[0].name,
                };
            } else {
                return { matches: partialMatches, type: "partial" };
            }
        }

        return {
            error: `Không tìm thấy tên phù hợp với "${searchQuery}" trong cột C`,
        };
    } catch (err) {
        console.error("❌ Lỗi khi tìm tên trong cột C:", err);

        // Kiểm tra lỗi API chưa được bật
        if (
            (err.message && err.message.includes("has not been used")) ||
            err.message.includes("is disabled")
        ) {
            const projectMatch = err.message.match(/project (\d+)/);
            const projectId = projectMatch ? projectMatch[1] : null;
            const apiUrl = projectId
                ? `https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=${projectId}`
                : "https://console.developers.google.com/apis/library/sheets.googleapis.com";

            return {
                error: `Google Sheets API chưa được bật!\n\n🔧 Cách khắc phục:\n1. Vào: ${apiUrl}\n2. Click "Enable" để bật API\n3. Đợi vài phút để API được kích hoạt\n4. Chạy lại bot`,
            };
        }

        return { error: "Lỗi kết nối Google Sheets" };
    }
}

// Hàm chuyển số cột thành chữ cái (0=A, 1=B, 26=AA, ...)
function numberToColumnLetter(n) {
    let result = "";
    while (n >= 0) {
        result = String.fromCharCode(65 + (n % 26)) + result;
        n = Math.floor(n / 26) - 1;
    }
    return result;
}

// Hàm tìm ngày trong dòng 4 và trả về số cột
async function findDateInRow(sheetName, date) {
    if (!authClient) {
        return { error: "Google Auth chưa được khởi tạo" };
    }

    try {
        const request = {
            spreadsheetId: process.env.SHEET_ID,
            range: `${sheetName}!4:4`, // Đọc toàn bộ dòng 4
            auth: authClient,
        };

        const response = await sheets.spreadsheets.values.get(request);
        const values =
            response.data.values && response.data.values[0]
                ? response.data.values[0]
                : [];

        // Tìm cột có giá trị khớp với ngày
        for (let i = 0; i < values.length; i++) {
            if (values[i] && values[i].toString().trim() === date.trim()) {
                const columnLetter = numberToColumnLetter(i);
                return { column: columnLetter, columnIndex: i };
            }
        }

        return { error: `Không tìm thấy ngày "${date}" trong dòng 4` };
    } catch (err) {
        console.error("❌ Lỗi khi tìm ngày trong dòng 4:", err);

        // Kiểm tra lỗi API chưa được bật
        if (
            err.message &&
            (err.message.includes("has not been used") ||
                err.message.includes("is disabled"))
        ) {
            const projectMatch = err.message.match(/project (\d+)/);
            const projectId = projectMatch ? projectMatch[1] : null;
            const apiUrl = projectId
                ? `https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=${projectId}`
                : "https://console.developers.google.com/apis/library/sheets.googleapis.com";

            return {
                error: `Google Sheets API chưa được bật!\n\n🔧 Cách khắc phục:\n1. Vào: ${apiUrl}\n2. Click "Enable" để bật API\n3. Đợi vài phút để API được kích hoạt\n4. Chạy lại bot`,
            };
        }

        return { error: "Lỗi kết nối Google Sheets" };
    }
}

// Hàm lấy giá trị tại ô cụ thể
async function getCellValue(sheetName, column, row) {
    if (!authClient) {
        return { error: "Google Auth chưa được khởi tạo" };
    }

    try {
        const request = {
            spreadsheetId: process.env.SHEET_ID,
            range: `${sheetName}!${column}${row}:${column}${row}`,
            auth: authClient,
        };

        const response = await sheets.spreadsheets.values.get(request);
        const value =
            response.data.values &&
                response.data.values[0] &&
                response.data.values[0][0]
                ? response.data.values[0][0]
                : "";

        return { value };
    } catch (err) {
        console.error("❌ Lỗi khi lấy giá trị ô:", err);

        // Kiểm tra lỗi API chưa được bật
        if (
            err.message &&
            (err.message.includes("has not been used") ||
                err.message.includes("is disabled"))
        ) {
            const projectMatch = err.message.match(/project (\d+)/);
            const projectId = projectMatch ? projectMatch[1] : null;
            const apiUrl = projectId
                ? `https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=${projectId}`
                : "https://console.developers.google.com/apis/library/sheets.googleapis.com";

            return {
                error: `Google Sheets API chưa được bật!\n\n🔧 Cách khắc phục:\n1. Vào: ${apiUrl}\n2. Click "Enable" để bật API\n3. Đợi vài phút để API được kích hoạt\n4. Chạy lại bot`,
            };
        }

        return { error: "Lỗi kết nối Google Sheets" };
    }
}

// Hàm lấy dòng 4 (header với các ngày)
async function getRow4Dates(sheetName) {
    if (!authClient) {
        return { error: "Google Auth chưa được khởi tạo" };
    }

    try {
        const request = {
            spreadsheetId: process.env.SHEET_ID,
            range: `${sheetName}!4:4`, // Đọc dòng 4
            auth: authClient,
        };

        const response = await sheets.spreadsheets.values.get(request);
        const dates =
            response.data.values && response.data.values[0]
                ? response.data.values[0]
                : [];

        return { dates: dates };
    } catch (err) {
        console.error("❌ Lỗi khi lấy dòng 4:", err);
        return { error: "Lỗi kết nối Google Sheets" };
    }
}

// Hàm lấy ngày hôm nay theo format DD/MM
function getTodayDate() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}`;
}

function normalizeDateText(dateText) {
    const match = dateText?.toString().trim().match(/^(\d{1,2})\/(\d{1,2})$/);
    if (!match) return "";

    const day = String(Number(match[1])).padStart(2, "0");
    const month = String(Number(match[2])).padStart(2, "0");
    return `${day}/${month}`;
}

function isTodayDate(dateText) {
    return normalizeDateText(dateText) === getTodayDate();
}

function formatValueWithDate(valueWithDate, indent = "") {
    const value = valueWithDate.value || "(trống)";
    const line = `${indent}${valueWithDate.date}: ${value}`;

    if (!isTodayDate(valueWithDate.date)) {
        return line;
    }

    return `${indent}👉 **${valueWithDate.date} (Hôm nay): ${value}**`;
}

// Hàm lấy toàn bộ dòng và trả về 5 giá trị cuối cùng kèm ngày
async function getLast5ValuesInRow(sheetName, row) {
    if (!authClient) {
        return { error: "Google Auth chưa được khởi tạo" };
    }

    try {
        // Đọc dòng 4 để lấy ngày
        const datesResult = await getRow4Dates(sheetName);
        if (datesResult.error) {
            return { error: datesResult.error };
        }
        const dates = datesResult.dates || [];

        // Đọc dòng cần tìm
        const request = {
            spreadsheetId: process.env.SHEET_ID,
            range: `${sheetName}!${row}:${row}`, // Đọc toàn bộ dòng
            auth: authClient,
        };

        const response = await sheets.spreadsheets.values.get(request);
        const values =
            response.data.values && response.data.values[0]
                ? response.data.values[0]
                : [];

        // Tìm các cột có giá trị (bỏ qua các ô trống ở cuối)
        const valueWithDates = [];
        for (let i = 0; i < values.length; i++) {
            if (
                values[i] !== undefined &&
                values[i] !== null &&
                values[i] !== ""
            ) {
                const date = dates[i] || `Cột ${numberToColumnLetter(i)}`;
                valueWithDates.push({
                    date: date,
                    value: values[i],
                    columnIndex: i,
                });
            }
        }

        // Lấy 5 giá trị cuối cùng
        const last5 = valueWithDates.slice(-5);

        return { valuesWithDates: last5, totalColumns: values.length };
    } catch (err) {
        console.error("❌ Lỗi khi lấy dữ liệu dòng:", err);

        // Kiểm tra lỗi API chưa được bật
        if (
            err.message &&
            (err.message.includes("has not been used") ||
                err.message.includes("is disabled"))
        ) {
            const projectMatch = err.message.match(/project (\d+)/);
            const projectId = projectMatch ? projectMatch[1] : null;
            const apiUrl = projectId
                ? `https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=${projectId}`
                : "https://console.developers.google.com/apis/library/sheets.googleapis.com";

            return {
                error: `Google Sheets API chưa được bật!\n\n🔧 Cách khắc phục:\n1. Vào: ${apiUrl}\n2. Click "Enable" để bật API\n3. Đợi vài phút để API được kích hoạt\n4. Chạy lại bot`,
            };
        }

        return { error: "Lỗi kết nối Google Sheets" };
    }
}

// Hàm xử lý kết quả tìm kiếm (nhiều matches hoặc một match)
async function processSearchResult(
    nameResult,
    day,
    DEFAULT_SHEET_NAME,
    searchQuery
) {
    // Nếu có nhiều matches, xử lý tất cả
    if (nameResult.matches) {
        const results = [];

        for (const match of nameResult.matches) {
            if (day) {
                const dateResult = await findDateInRow(DEFAULT_SHEET_NAME, day);
                if (!dateResult.error) {
                    const cellResult = await getCellValue(
                        DEFAULT_SHEET_NAME,
                        dateResult.column,
                        match.row
                    );
                    if (!cellResult.error) {
                        results.push({
                            name: match.name,
                            row: match.row,
                            day: day,
                            position: `${dateResult.column}${match.row}`,
                            value: cellResult.value || "(trống)",
                        });
                    }
                }
            } else {
                const rowResult = await getLast5ValuesInRow(
                    DEFAULT_SHEET_NAME,
                    match.row
                );
                if (!rowResult.error) {
                    results.push({
                        name: match.name,
                        row: match.row,
                        valuesWithDates: rowResult.valuesWithDates || [],
                    });
                }
            }
        }

        return {
            success: true,
            multiple: true,
            data: results,
            count: nameResult.matches.length,
        };
    }

    // Xử lý một kết quả duy nhất
    const foundRow = nameResult.row;
    const foundName = nameResult.name || searchQuery;

    if (day) {
        const dateResult = await findDateInRow(DEFAULT_SHEET_NAME, day);
        if (dateResult.error) {
            return { error: dateResult.error };
        }

        const cellResult = await getCellValue(
            DEFAULT_SHEET_NAME,
            dateResult.column,
            foundRow
        );

        if (cellResult.error) {
            return { error: cellResult.error };
        }

        return {
            success: true,
            multiple: false,
            data: {
                name: foundName,
                day: day,
                position: `${dateResult.column}${foundRow}`,
                value: cellResult.value || "(trống)",
            },
        };
    } else {
        const rowResult = await getLast5ValuesInRow(
            DEFAULT_SHEET_NAME,
            foundRow
        );
        if (rowResult.error) {
            return { error: rowResult.error };
        }

        return {
            success: true,
            multiple: false,
            data: {
                name: foundName,
                row: foundRow,
                valuesWithDates: rowResult.valuesWithDates || [],
            },
        };
    }
}

client.on("interactionCreate", async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "abcom") {
            await interaction.deferReply();

            const name = interaction.options.getString("name");
            const day = interaction.options.getString("day");

            if (!name) {
                await interaction.editReply("❌ Vui lòng nhập tên");
                return;
            }

            const resolvedSheet = await resolveSheetName();
            if (resolvedSheet.error) {
                await interaction.editReply(`❌ ${resolvedSheet.error}`);
                return;
            }
            const DEFAULT_SHEET_NAME = resolvedSheet.sheetName;

            const nameResult = await findNameInColumn(DEFAULT_SHEET_NAME, name);
            if (nameResult.error) {
                await interaction.editReply(`❌ ${nameResult.error}`);
                return;
            }

            const result = await processSearchResult(
                nameResult,
                day,
                DEFAULT_SHEET_NAME,
                name
            );
            if (result.error) {
                await interaction.editReply(`❌ ${result.error}`);
                return;
            }

            // Xử lý nhiều kết quả
            if (result.multiple) {
                let output = `📊 Tìm thấy **${result.count}** kết quả phù hợp với "${name}":\n\n`;

                for (let i = 0; i < result.data.length; i++) {
                    const item = result.data[i];
                    if (item.value !== undefined) {
                        // Có ngày
                        output += `**${i + 1}. ${item.name}** (dòng ${item.row
                            })\n`;
                        output += `   📅 Ngày: ${item.day} | Vị trí: ${item.position}\n`;
                        output += `   🍽️ Món ăn: ${item.value}\n\n`;
                    } else {
                        // Không có ngày
                        output += `**${i + 1}. ${item.name}** (dòng ${item.row
                            })\n`;
                        if (
                            item.valuesWithDates &&
                            item.valuesWithDates.length > 0
                        ) {
                            const valuesText = item.valuesWithDates
                                .map((v) => formatValueWithDate(v, "   "))
                                .join("\n");
                            output += `   5 giá trị cuối cùng:\n${valuesText}\n\n`;
                        } else {
                            output += `   Không có dữ liệu\n\n`;
                        }
                    }
                }

                await interaction.editReply(output);
                return;
            }

            // Xử lý một kết quả
            if (result.data.value !== undefined) {
                await interaction.editReply(
                    `📊**Món ăn:** ${result.data.value}\n **Tên:** ${result.data.name}\n**Ngày:** ${result.data.day}\n**Vị trí:** ${result.data.position}\n`
                );
            } else {
                if (
                    !result?.data?.valuesWithDates ||
                    result.data.valuesWithDates.length === 0
                ) {
                    await interaction.editReply(
                        `📊 **Tên:** ${result.data.name}\n**Dòng:** ${result.data.row}\n**Kết quả:** Không có dữ liệu`
                    );
                } else {
                    const valuesText = result.data.valuesWithDates
                        .map((v) => formatValueWithDate(v))
                        .join("\n");
                    await interaction.editReply(
                        `📊 **Tên:** ${result.data.name}\n**Dòng:** ${result.data.row}\n**5 giá trị cuối cùng:**\n${valuesText}`
                    );
                }
            }
        } else if (interaction.commandName === "abc") {
            await handleAbcCommand(interaction);
        } else if (interaction.commandName === "help") {
            const helpEmbed = {
                color: 0x0099ff,
                title: "🤖 Bot Check Dat Com - Hướng dẫn",
                fields: [
                    {
                        name: "📋 Lệnh chính",
                        value: "• `/abcom` - Tra cứu thông tin đăng ký cơm trưa\n• `/help` - Xem hướng dẫn này",
                        inline: false,
                    },
                    {
                        name: "📝 Cách sử dụng /abcom",
                        value: "1. Gõ `/abcom`\n2. Điền **name:** (bắt buộc) - có thể nhập một phần tên\n3. Điền **day:** (tùy chọn) - ví dụ: 23/12\n4. Enter để gửi",
                        inline: false,
                    },
                    {
                        name: "🔍 Tìm kiếm thông minh",
                        value: "• Nhập đầy đủ: `Mai Xuân Hiếu` → Tìm chính xác\n• Nhập một phần: `Hiếu` hoặc `Xuân Hiếu` → Tìm tất cả có chứa\n• Nhập không dấu: `mai xuan hieu` → Tự động nhận diện\n• Nhập không hoa: `MAI XUAN HIEU` → Tự động nhận diện",
                        inline: false,
                    },
                    {
                        name: "💡 Ví dụ",
                        value: "• `/abcom name: Mai Xuân Hiếu`\n• `/abcom name: Hiếu`\n• `/abcom name: mai xuan hieu`\n• `/abcom name: Mai Xuân Hiếu day: 23/12`",
                        inline: false,
                    },
                    {
                        name: "⚙️ Thông tin",
                        value: '• **Sheet mặc định**: "ĐĂNG KÝ CƠM TRƯA ABC T12"\n• Bot tự động tìm kiếm không phân biệt hoa thường và dấu',
                        inline: false,
                    },
                ],
                timestamp: new Date(),
            };
            await interaction.reply({ embeds: [helpEmbed] });
        } else if (
            interaction.commandName === "fbdate" ||
            interaction.commandName === "fbname"
        ) {
            await handleFootballCommands(interaction);
        } else if (interaction.commandName === "configsheet") {
            if (interaction.user.id !== ADMIN_DISCORD_ID) {
                await interaction.reply({
                    content: "❌ Bạn không có quyền sử dụng lệnh này.",
                    ephemeral: true,
                });
                return;
            }

            await interaction.deferReply({ ephemeral: true });

            const sheetIdInput = interaction.options.getString("sheet_id");
            const gidInput = interaction.options.getString("gid");

            if (!sheetIdInput && !gidInput) {
                await interaction.editReply(
                    "❌ Vui lòng nhập ít nhất một trong: sheet_id, gid"
                );
                return;
            }

            const updates = {};
            if (sheetIdInput) updates.SHEET_ID = sheetIdInput.trim();
            if (gidInput) updates.G_SHEET_ID = gidInput.trim();

            try {
                updateEnvFile(updates);
            } catch (error) {
                await interaction.editReply(
                    `❌ Lỗi khi lưu cấu hình: ${error.message}`
                );
                return;
            }

            const resolvedSheet = await resolveSheetName();
            if (resolvedSheet.error) {
                await interaction.editReply(
                    `⚠️ Đã lưu cấu hình nhưng không xác định được sheet:\n${resolvedSheet.error}\n\n` +
                        `Vui lòng kiểm tra lại SHEET_ID / G_SHEET_ID (gid).`
                );
                return;
            }

            const checkResult = await checkSheetConnection(
                resolvedSheet.sheetName
            );
            if (checkResult.error) {
                await interaction.editReply(
                    `⚠️ Đã lưu cấu hình nhưng kiểm tra không thành công.\n` +
                        `Sheet đang dùng: "${resolvedSheet.sheetName}" (từ ${resolvedSheet.source
                        })\n` +
                        `Lỗi: ${checkResult.error}\n\n` +
                        `Vui lòng kiểm tra lại cấu hình sheet.`
                );
                return;
            }

            await interaction.editReply(
                `✅ Đã lưu cấu hình thành công!\n` +
                    `**SHEET_ID:** ${process.env.SHEET_ID}\n` +
                    `**Sheet đang dùng:** "${resolvedSheet.sheetName}" (từ ${resolvedSheet.source})\n` +
                    `**Kiểm tra:** Tìm thấy "Mai Xuân Hiếu" tại dòng ${checkResult.row} ✅`
            );
        } else if (interaction.commandName === "testsheetcheck") {
            if (interaction.user.id !== ADMIN_DISCORD_ID) {
                await interaction.reply({
                    content: "❌ Bạn không có quyền sử dụng lệnh này.",
                    ephemeral: true,
                });
                return;
            }

            await interaction.deferReply({ ephemeral: true });

            const report = await buildManualCheckReport();

            try {
                const admin = await interaction.client.users.fetch(
                    ADMIN_DISCORD_ID
                );
                await admin.send(report);
            } catch (error) {
                console.error("❌ Không thể gửi DM test cho admin:", error);
            }

            await interaction.editReply(
                `Đã chạy test và gửi kết quả qua DM.\n\n${report}`
            );
        }
    }
});

// Khởi tạo bot với retry logic
async function startBot(retryCount = 0, maxRetries = 5) {
    try {
        // Khởi tạo Google Auth trước
        await initializeAuth();

        // Đăng nhập Discord bot
        await client.login(process.env.DISCORD_TOKEN);
        console.log("✅ Bot đã khởi động thành công!");
    } catch (error) {
        // Xử lý lỗi disallowed intents
        if (error.message && error.message.includes("disallowed intents")) {
            console.error("❌ Lỗi: Bot đang sử dụng intents chưa được bật!");
            console.error("📋 Cách khắc phục:");
            console.error(
                "   1. Vào Discord Developer Portal: https://discord.com/developers/applications"
            );
            console.error("   2. Chọn bot của bạn");
            console.error("   3. Vào mục 'Bot' ở sidebar");
            console.error(
                "   4. Scroll xuống phần 'Privileged Gateway Intents'"
            );
            console.error("   5. Bật các intents sau:");
            console.error("      ✅ MESSAGE CONTENT INTENT (bắt buộc)");
            console.error("      ✅ SERVER MEMBERS INTENT (nếu cần)");
            console.error("   6. Lưu thay đổi");
            console.error("   7. Chạy lại bot");
            process.exit(1);
        }

        // Xử lý lỗi rate limit của Discord
        if (
            error.message &&
            error.message.includes("Not enough sessions remaining")
        ) {
            const resetMatch = error.message.match(/resets at (.+)/);
            const resetTime = resetMatch ? new Date(resetMatch[1]) : null;

            if (resetTime) {
                const now = new Date();
                const waitTime = Math.max(0, resetTime - now);
                const waitSeconds = Math.ceil(waitTime / 1000);

                console.error("❌ Discord Rate Limit!");
                console.error(`⏰ Cần đợi đến: ${resetTime.toLocaleString()}`);
                console.error(
                    `⏳ Thời gian chờ: ${waitSeconds} giây (${Math.ceil(
                        waitSeconds / 60
                    )} phút)`
                );

                if (retryCount < maxRetries && waitSeconds < 3600) {
                    console.log(
                        `🔄 Retry sau ${waitSeconds}s (${retryCount + 1
                        }/${maxRetries})`
                    );
                    setTimeout(() => {
                        startBot(retryCount + 1, maxRetries);
                    }, waitTime);
                    return;
                } else {
                    console.error(
                        "❌ Đã vượt quá số lần thử hoặc thời gian chờ quá lâu"
                    );
                    process.exit(1);
                }
            }
        }

        console.error("❌ Lỗi khởi động bot:", error);

        if (
            retryCount < maxRetries &&
            !error.message?.includes("Not enough sessions")
        ) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
            console.log(
                `🔄 Retry sau ${delay / 1000}s (${retryCount + 1
                }/${maxRetries})`
            );
            setTimeout(() => {
                startBot(retryCount + 1, maxRetries);
            }, delay);
            return;
        }

        process.exit(1);
    }
}

// Xử lý lỗi không được bắt
process.on("unhandledRejection", (error) => {
    console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
    process.exit(1);
});

// Khởi động bot
startBot();
