# 🔧 Khắc phục: Bot không nhận tin nhắn DM

## Vấn đề: Bot không phản hồi khi nhắn tin trực tiếp

Nếu bot không nhận được tin nhắn DM, có thể do các nguyên nhân sau:

## ✅ Kiểm tra từng bước

### 1. Bot phải được add vào ít nhất 1 server trước

**Quan trọng:** Để nhắn tin trực tiếp cho bot, bạn **PHẢI** add bot vào ít nhất 1 server trước (dù chỉ là server test).

**Cách làm:**

1. Lấy Client ID từ Discord Developer Portal
2. Tạo invite link: `https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=0&scope=bot`
3. Add bot vào server của bạn
4. Sau đó mới có thể tìm bot để nhắn tin trực tiếp

### 2. Kiểm tra bot đang chạy

```bash
# Kiểm tra bot có đang chạy không
npm run dev
```

Bot phải hiển thị:

```
Bot đã sẵn sàng!
✅ Bot có thể nhận tin nhắn trực tiếp (DM) và tin nhắn trong server
Bot đang online với tên: YourBot#1234
Bot ID: 123456789
```

### 3. Tìm bot trong Discord

**Trên máy tính:**

1. Click vào danh sách bạn bè (icon Discord ở bên trái)
2. Tìm tên bot trong danh sách
3. Hoặc dùng thanh tìm kiếm (Ctrl+K) và gõ tên bot
4. Click vào tên bot để mở DM

**Trên mobile:**

1. Mở Discord app
2. Tap vào icon tin nhắn (hình 2 bong bóng)
3. Tap vào icon "+" hoặc "Tin nhắn mới"
4. Tìm và chọn bot

### 4. Kiểm tra logs khi gửi tin nhắn

Khi bạn gửi tin nhắn cho bot, console phải hiển thị:

```
=== NEW MESSAGE ===
Author: YourName#1234
Content: !getvalue "Mai Xuân Hiếu"
Channel type: 1
Is DM: true
Guild: DM
==================
```

**Nếu KHÔNG thấy log này:**

-   Bot không nhận được tin nhắn
-   Có thể do bot chưa được add vào server
-   Hoặc bạn đang nhắn tin cho bot khác

### 5. Kiểm tra intents trong Discord Developer Portal

1. Vào https://discord.com/developers/applications
2. Chọn bot của bạn
3. Vào tab **"Bot"**
4. Scroll xuống **"Privileged Gateway Intents"**
5. Đảm bảo đã bật:
    - ✅ **MESSAGE CONTENT INTENT** (bắt buộc)
    - ✅ **SERVER MEMBERS INTENT** (nếu cần)

### 6. Kiểm tra bot có thể nhận DM không

Thử gửi tin nhắn trong server trước để xem bot có hoạt động không:

```
!help
```

Nếu bot phản hồi trong server nhưng không phản hồi trong DM, có thể do:

-   Bot chưa được add vào server (cần add để có thể tìm bot)
-   User chưa tìm đúng bot

## 🔍 Debug chi tiết

### Kiểm tra bot có online không

Trong console, bạn sẽ thấy:

```
Bot đang online với tên: YourBot#1234
Bot ID: 123456789
```

Nếu không thấy, bot chưa kết nối thành công.

### Kiểm tra event listener

Code đã có debug logs. Khi nhận được tin nhắn, bạn sẽ thấy log chi tiết.

Nếu **KHÔNG** thấy log khi gửi tin nhắn:

-   Bot không nhận được event
-   Có thể do intents chưa đúng
-   Hoặc bot chưa được add vào server

## 💡 Giải pháp nhanh

1. **Add bot vào server:**

    ```bash
    node invite.js YOUR_CLIENT_ID
    ```

    Copy link và add bot vào server

2. **Tìm bot trong Discord:**

    - Click vào danh sách bạn bè
    - Tìm tên bot
    - Click để mở DM

3. **Gửi tin nhắn test:**

    ```
    !help
    ```

4. **Kiểm tra console:**
    - Phải thấy log "=== NEW MESSAGE ==="
    - Nếu không thấy, bot không nhận được tin nhắn

## ⚠️ Lưu ý quan trọng

-   **Bot PHẢI được add vào ít nhất 1 server** trước khi có thể nhắn tin trực tiếp
-   Bot phải đang chạy (`npm run dev`)
-   Bot phải có **MESSAGE CONTENT INTENT** được bật
-   User phải tìm đúng bot (có thể có nhiều bot cùng tên)

## 🆘 Vẫn không được?

1. Kiểm tra bot có đang chạy không
2. Kiểm tra console có log gì không
3. Thử nhắn tin trong server trước
4. Đảm bảo đã add bot vào server
5. Kiểm tra intents trong Developer Portal
