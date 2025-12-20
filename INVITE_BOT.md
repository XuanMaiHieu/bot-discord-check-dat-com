# 🤖 Hướng dẫn mời Bot vào Discord Server

## Bước 1: Lấy Client ID của Bot

1. Vào Discord Developer Portal: https://discord.com/developers/applications
2. Chọn bot của bạn
3. Vào tab **"General Information"**
4. Copy **Application ID** (Client ID)

## Bước 2: Tạo Invite Link

Thay `YOUR_CLIENT_ID` bằng Client ID của bạn trong link sau:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2048&scope=bot
```

**Hoặc** chạy script để tự động tạo link:

```bash
node invite.js
```

## Bước 3: Mời Bot vào Server

1. Click vào invite link ở trên
2. Chọn server Discord bạn muốn thêm bot
3. Chọn các quyền cần thiết:
    - ✅ **Send Messages** - Để bot trả lời
    - ✅ **Read Message History** - Để bot đọc tin nhắn
    - ✅ **Use Slash Commands** (nếu có)
4. Click **Authorize**

## Bước 4: Kiểm tra Bot đã Online

1. Vào server Discord của bạn
2. Kiểm tra danh sách members bên phải
3. Bot sẽ hiển thị với status **"Online"** (màu xanh) nếu đang chạy

## Bước 5: Sử dụng Bot

### Cách 1: Nhắn tin trực tiếp (DM) - Không cần add vào server

1. **Tìm bot trong Discord:**

    - Trên máy tính: Click vào biểu tượng Discord (danh sách bạn bè) ở bên trái
    - Tìm tên bot trong danh sách hoặc dùng thanh tìm kiếm
    - Click vào tên bot để mở cửa sổ tin nhắn trực tiếp

2. **Gửi tin nhắn cho bot:**
    - Gõ lệnh và gửi tin nhắn
    - Bot sẽ tự động trả lời trong DM

### Cách 2: Sử dụng trong Server

Bot sẽ phản hồi các lệnh sau trong cả DM và server:

-   `!getvalue "Tên"` - Tìm tên và lấy 5 giá trị cuối cùng
-   `!getvalue "Tên" "Ngày"` - Tìm tên và ngày, lấy giá trị tại giao điểm
-   `!help` - Xem hướng dẫn

**Ví dụ:**

```
!getvalue "Mai Xuân Hiếu"
!getvalue "Mai Xuân Hiếu" "23/12"
!help
```

**Lưu ý:** Nếu bạn nhắn tin không phải lệnh trong DM, bot sẽ tự động gửi hướng dẫn!

## Lưu ý

-   **DM (Tin nhắn trực tiếp):** Không cần add bot vào server, chỉ cần tìm bot và nhắn tin
-   **Server:** Bot cần có quyền **Read Message History** để đọc tin nhắn
-   **Server:** Bot cần có quyền **Send Messages** để trả lời
-   Đảm bảo bot đang chạy (`npm run dev` hoặc `npm start`)
