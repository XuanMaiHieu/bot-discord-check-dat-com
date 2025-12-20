# 📊 Hướng dẫn Setup Google Sheets API

## Lỗi: "Google Sheets API has not been used in project"

Nếu bạn gặp lỗi này, nghĩa là Google Sheets API chưa được bật trong Google Cloud Project của bạn.

## Cách khắc phục

### Bước 1: Vào Google Cloud Console

1. Mở link sau (thay `PROJECT_ID` bằng Project ID của bạn):

    ```
    https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=PROJECT_ID
    ```

    **Hoặc** làm theo cách sau:

    - Vào: https://console.cloud.google.com/
    - Chọn project của bạn (project ID thường có trong file `service-account-key.json`)

### Bước 2: Bật Google Sheets API

1. Vào **APIs & Services** > **Library** (hoặc dùng link trực tiếp ở trên)
2. Tìm kiếm "Google Sheets API"
3. Click vào **Google Sheets API**
4. Click nút **ENABLE** (Bật)
5. Đợi vài phút để API được kích hoạt

### Bước 3: Kiểm tra Service Account

1. Vào **APIs & Services** > **Credentials**
2. Kiểm tra Service Account của bạn có quyền truy cập
3. Đảm bảo Service Account đã được share quyền trong Google Sheets:
    - Mở Google Sheets của bạn
    - Click **Share** (Chia sẻ)
    - Thêm email của Service Account (có trong file `service-account-key.json`, field `client_email`)
    - Cấp quyền **Viewer** hoặc **Editor** tùy nhu cầu

### Bước 4: Chạy lại Bot

Sau khi bật API:

```bash
npm run dev
```

## Lưu ý

-   Sau khi bật API, có thể mất vài phút để hệ thống cập nhật
-   Đảm bảo Service Account có quyền truy cập Google Sheets
-   Kiểm tra file `.env` có đúng `SHEET_ID` và `SERVICE_ACCOUNT_KEY_PATH`

## Tìm Project ID

Project ID thường có trong:

-   File `service/service-account-key.json` (field `project_id`)
-   Hoặc trong URL lỗi: `project 776844616294` → Project ID là `776844616294`

## Link nhanh

-   **Google Cloud Console**: https://console.cloud.google.com/
-   **Google Sheets API Library**: https://console.developers.google.com/apis/library/sheets.googleapis.com
-   **Enable API cho project cụ thể**:
    ```
    https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=YOUR_PROJECT_ID
    ```
