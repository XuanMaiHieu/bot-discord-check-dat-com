const { Client, GatewayIntentBits } = require('discord.js');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Tạo client Discord
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', () => {
    console.log('Bot đã sẵn sàng!');
});

// Kết nối với Google Sheets API
const sheets = google.sheets({ version: 'v4', auth: process.env.SERVICE_ACCOUNT_KEY_PATH });

// Hàm để lấy dữ liệu từ Google Sheets
async function getSheetData(name, row) {
    const authClient = await google.auth.getClient({
        keyFile: process.env.SERVICE_ACCOUNT_KEY_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const request = {
        spreadsheetId: process.env.SHEET_ID,
        range: `C${row}:C${row}`,
        auth: authClient,
    };

    try {
        const response = await sheets.spreadsheets.values.get(request);
        const value = response.data.values[0] ? response.data.values[0][0] : 'Không có dữ liệu';
        return value;
    } catch (err) {
        console.error('Lỗi khi đọc dữ liệu từ Google Sheets:', err);
        return 'Lỗi kết nối';
    }
}

// Lắng nghe tin nhắn và tìm kiếm giá trị tương ứng
client.on('messageCreate', async (message) => {
    if (message.content.toLowerCase().startsWith('!getvalue')) {
        const name = message.content.split(' ')[1];
        const row = 4; // Dòng thứ 4, bạn có thể thay đổi nếu cần
        const value = await getSheetData(name, row);
        message.reply(`Giá trị của ${name} là: ${value}`);
    }
});

// Đăng nhập bot
client.login(process.env.DISCORD_TOKEN);
