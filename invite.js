#!/usr/bin/env node

/**
 * Script tạo Discord Bot Invite Link
 *
 * Cách sử dụng:
 * 1. Lấy Client ID từ Discord Developer Portal
 * 2. Chạy: node invite.js YOUR_CLIENT_ID
 * 3. Hoặc set CLIENT_ID trong .env
 */

const dotenv = require("dotenv");
dotenv.config();

// Lấy Client ID từ argument hoặc .env
const clientId = process.argv[2] || process.env.CLIENT_ID;

if (!clientId) {
    console.error("❌ Chưa có Client ID!");
    console.log("\n📋 Cách lấy Client ID:");
    console.log("   1. Vào https://discord.com/developers/applications");
    console.log("   2. Chọn bot của bạn");
    console.log('   3. Vào tab "General Information"');
    console.log('   4. Copy "Application ID"');
    console.log("\n💡 Cách sử dụng:");
    console.log("   node invite.js YOUR_CLIENT_ID");
    console.log("   hoặc thêm CLIENT_ID vào file .env");
    process.exit(1);
}

// Permissions cần thiết:
// - Send Messages (2048)
// - Read Message History (65536)
// - Use Slash Commands (0) - không cần quyền này cho message commands
const permissions = 2048 + 65536; // Send Messages + Read Message History
const scopes = "bot";

const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=${scopes}`;

console.log("\n🤖 Discord Bot Invite Link:\n");
console.log(inviteUrl);
console.log("\n📋 Các bước tiếp theo:");
console.log("   1. Copy link ở trên");
console.log("   2. Mở link trong trình duyệt");
console.log("   3. Chọn server Discord bạn muốn thêm bot");
console.log('   4. Click "Authorize"');
console.log("   5. Đảm bảo bot đang chạy (npm run dev)\n");
