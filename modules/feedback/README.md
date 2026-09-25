# Module feedback

Hỏi người dùng chấm điểm và góp ý về bot, giới thiệu tính năng, kèm trang "donate" pháo tay qua QR.
Code nằm riêng trong thư mục này, chạy chung process với bot qua ổ cắm `modules/` (xem `modules/index.js`).

## Luồng

1. Root chạy `/feedback-moi`. Bot DM **thẻ mời** cho mọi user `enabled` (trừ root).
2. User bấm điểm 😭1 … 😍5. Tính là **xong**, từ hôm sau hết bị nhắc.
   - Lần chấm đầu tiên: thẻ "phóng tên lửa" 🚀💥🎆 rồi hiện **thẻ cảm ơn** (GIF pháo hoa, 3 tính năng có nút Xem ngay, QR pháo tay).
   - Root nhận DM "⭐ Người #N chấm …". Nếu user đổi điểm liên tục, bot chờ 1 phút sau lần bấm cuối rồi mới báo.
3. **✍️ Viết góp ý & đề xuất** mở form 3 ô (không bắt buộc), có thêm ô điểm nếu chưa chấm. Root nhận DM ngay khi có góp ý.
4. Chưa chấm thì thẻ báo cơm 12h có dòng nhắc nợ, bắt đầu từ ngày sau ngày mời, tối đa 5 lần (câu cuối: "bot bỏ cuộc").
5. `/feedback-dong` đóng đợt: hết nhắc, nút trên thẻ cũ trả lời "đợt đã đóng".

**Ẩn danh:** mọi tin báo và thống kê cho root chỉ ghi "Người #N". Số N được cấp theo thứ tự phản hồi. Bot vẫn lưu Discord ID, nhưng chỉ để biết ai đã xong và dừng nhắc.

## Lệnh (chỉ root)

| Lệnh | Việc |
|---|---|
| `/feedback-test` | Gửi thẻ mời thử vào DM root. Dữ liệu test lưu riêng, chạy lại là reset. Sau đó `/test-meal` hiện dòng nhắc nợ, mỗi lần chạy hiện câu kế tiếp |
| `/feedback-moi [gui_that]` | Mặc định chỉ xem trước danh sách, `gui_that: True` mới gửi thật. Chỉ gửi cho người chưa được mời trong đợt đang mở, chưa có đợt thì tự mở đợt mới (mã theo tháng, vd `2026-09`) |
| `/feedback-tong-hop [test]` | Điểm TB, phân bố điểm, tính năng hay xem, số lần "Để sau", tổng pháo tay, góp ý theo Người #N |
| `/feedback-dong` | Đóng đợt đang mở |

## Env

```
FEEDBACK_ENABLED=false                          # tắt cả module (mặc định bật)
FEEDBACK_CLAP_PORT=5968                         # cổng web pháo tay (mặc định 5968)
FEEDBACK_CLAP_PUBLIC_URL=http://117.7.0.31:5968 # link ngoài internet tới cổng trên
```

Không đặt `FEEDBACK_CLAP_PUBLIC_URL` thì không chạy web, và thẻ cảm ơn không có phần QR.

## Web pháo tay

- `GET /c/<mã>`: trang vỗ tay (pháo hoa, confetti, rung). `POST /c/<mã>/clap`: gửi số lần vỗ.
- `<mã>` ngẫu nhiên, lưu trong `data/feedback/clap-secret.txt`. Xóa file này sẽ đổi link, nên QR trên các thẻ cũ không dùng được nữa.
- Mỗi IP tối đa 200 cú vỗ/phút. Server không lưu IP. Root nhận tối đa 1 DM/phút: "👏 Có người vừa gửi N tràng pháo tay".

## Dữ liệu

`data/feedback/state.json` (các đợt, người tham gia, tổng pháo tay) và `data/feedback/clap-secret.txt`.

## Sửa chữ

Toàn bộ câu chữ nằm trong `texts.js`.

## Gỡ module

Xóa thư mục `modules/feedback/` hoặc đặt `FEEDBACK_ENABLED=false`. Bot không cần sửa gì.
