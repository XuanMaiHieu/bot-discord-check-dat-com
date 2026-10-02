# Module nhắc uống nước

Bot nhắc uống nước qua DM trong giờ làm, mỗi người tự chọn tần suất, mục tiêu (ml/ngày) và dung tích mỗi lần uống, bấm **💧 Đã uống** để cộng ml, cuối ngày có tổng kết.
Ra đời từ đề xuất trong đợt feedback 2026-09. Chạy chung process với bot qua ổ cắm `modules/` (xem `modules/index.js`).

## Luồng

1. **User đặc thù:** root chạy `/nuoc-moi nguoi:"hong, linh"`. Bot DM **thẻ mời**, chưa nhắc gì cho tới khi người đó bấm **Đăng ký**. Bấm **Không, cảm ơn** thì thôi, không bị giới thiệu nữa.
2. **User khác:** gõ `/uongnuoc` để bật. Thẻ báo cơm 12h có dòng giới thiệu kèm nút **Đăng ký** cho người chưa bật, mỗi người thấy tối đa 3 ngày.
3. **Nhắc:** chỉ ngày làm việc (có tính ngày làm bù `/lam-bu`), 8:30–11:45 và 13:15–17:30. Lần đầu lúc 8:00 + tần suất (90' thì 9:30), sau đó cứ đủ tần suất kể từ lần nhắc hoặc lần bấm "Đã uống" gần nhất.
4. **Tin nhắc** có 3 nút: 💧 **Đã uống** (+ số ml người đó đã chọn cho mỗi lần uống, lần nhắc sau tính lại từ lúc bấm), ⏰ **Hoãn 30'**, 🔕 **Tắt hôm nay** (tin đổi thành nút 🔔 **Bật lại**; thẻ `/uongnuoc` cũng có nút này khi hôm nay đang tắt).
5. **17:35:** tổng kết số ml / mục tiêu cho người hôm nay có được nhắc hoặc có uống (trừ người đã tắt hôm nay).
6. Gửi tin mới thì bot **xóa tin cũ**, DM chỉ còn tin nhắc / tổng kết mới nhất.

## Lệnh

| Lệnh | Ai | Việc |
|---|---|---|
| `/uongnuoc` | Mọi người | Thẻ cài đặt: bật / tắt, chọn mỗi 60 / 90 / 120 phút, mục tiêu 1,5 / 2 / 2,5 / 3L (mặc định 2L), mỗi lần uống 200 / 250 / 330 / 500 / 750ml (mặc định 250ml), số ml hôm nay |
| `/nuoc-moi nguoi` | Root | Gửi thẻ mời. Gõ tên (có dấu / không dấu) hoặc Discord ID, nhiều người cách nhau dấu phẩy. Chỉ tìm trong người đang nhận báo cơm |
| `/nuoc-thong-bao che-do` | Root | Báo người đang bật biết đã chuyển sang ml (thẻ có sẵn 2 menu chọn + nút Giữ mặc định). `thu` gửi vào DM root; `tat-ca` gửi cho người chưa nhận (`announcedMlAt`), chạy lại chỉ gửi người còn thiếu / gửi lỗi |
| `/nuoc-danh-sach` | Root | Ai đang bật, tần suất, ml hôm nay / mục tiêu, số lần nhắc, ai đã mời chưa bấm, ai từ chối |
| `/nuoc-test loai` | Root | Gửi thử tin nhắc / tổng kết / thẻ mời vào DM root. Nút chạy thật trên dữ liệu của root |

`/test-meal` luôn hiện dòng giới thiệu trong thẻ cơm (không tính vào 3 ngày).

## Env

```
WATER_ENABLED=false   # tắt cả module (mặc định bật)
```

## Dữ liệu

`data/water/state.json`: người đăng ký, tần suất, `goalMl` / `cupMl`, số liệu hôm nay (`ml` là tổng, `cups` là số lần uống; dữ liệu cũ tự đổi `cups × 250`), tin gần nhất để xóa. Không ghi vào `users.json` (git theo dõi file đó, bot tự sửa sẽ làm `git pull` bị conflict).

## Sửa chữ / giờ

- Câu chữ, số ngày giới thiệu, số giọt thanh tiến độ: `texts.js`.
- Khung giờ nhắc, giờ tổng kết: `schedule.js`. Lựa chọn tần suất (mặc định 90'), mục tiêu, dung tích: `store.js`.

## Gỡ module

Xóa thư mục `modules/water/` hoặc đặt `WATER_ENABLED=false`. Nhớ bỏ dòng `/uongnuoc` trong `commands/help.js`.
