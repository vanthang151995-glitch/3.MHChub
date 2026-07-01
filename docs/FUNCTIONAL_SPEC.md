# Đặc tả chức năng MHChub

## Mục tiêu

MHChub là cổng tiện ích nội bộ cho công ty, tập trung vào An toàn vệ sinh lao động - 6S và liên kết tới các hệ thống như IoT, Gateway, Ghi chép công việc.

Mục tiêu phiên bản hiện tại:

- Chạy được trên server LAN.
- Có phân page rõ ràng.
- Có bộ xử lý trung tâm backend/frontend.
- Có quản trị cấu hình bằng đăng nhập admin và session cookie.
- Có tìm kiếm, lọc và phân trang.
- Có readiness check, activity log và lớp hardening API cho chạy nội bộ/LAN.
- Chuẩn bị đa ngôn ngữ Việt / Anh / Nhật.

## Pages

### `/`

Trang cổng tiện ích:

- Link IoT, Gateway, Ghi chép công việc, An toàn - 6S.
- KPI tổng quan: số bộ phận, điểm audit 6S, việc cần xử lý, đào tạo.
- Tài liệu mới nhất.

### `/safety-6s`

Trang tổng quan An toàn - 6S:

- KPI toàn công ty.
- Danh sách bộ phận.
- Hành động cần xử lý.
- Nhóm tiêu chuẩn: quy định, đào tạo, kiểm tra, khẩn cấp.

### `/safety-6s/departments/:id`

Trang chi tiết bộ phận:

- Điểm audit, số việc, tỷ lệ đào tạo.
- Rủi ro trọng yếu.
- Checklist 6S.
- Hành động liên quan.
- Tài liệu liên quan.

### `/documents`

Thư viện tài liệu:

- Upload bằng session admin.
- Xóa bằng session admin.
- Tìm kiếm theo tiêu đề/tên file.
- Lọc theo hạng mục và bộ phận.
- Phân trang từ backend.

### `/admin`

Quản trị cấu hình:

- Đăng nhập bằng tài khoản admin.
- Sửa link hệ thống.
- Sửa bộ phận, điểm, trạng thái, rủi ro, checklist.
- Sửa hành động An toàn - 6S.
- Thêm/xóa link, bộ phận, hành động.
- Các danh sách quản trị có phân trang riêng.
- Lưu vào `server/data/config.json`.

### `/operations`

Trung tâm vận hành hệ thống:

- Xem trạng thái online, uptime, Node version, host, memory.
- Xem số lượng link, bộ phận, action, tài liệu, file upload và backup.
- Xem trạng thái file runtime: `config.json`, `documents.json`, `uploads/`.
- Xem backup gần đây.
- Tạo backup thủ công bằng session admin.
- Xem activity log có phân trang.
- Xem readiness, cảnh báo cấu hình, security headers, CORS allowlist, upload limit và trạng thái mật khẩu/secret admin.

## Core processor

### Backend

File: `server/core/centralProcessor.js`

Chịu trách nhiệm:

- Tạo file runtime nếu chưa có.
- Chuẩn hóa config.
- Đọc/ghi `config.json` và `documents.json`.
- Tính summary An toàn - 6S.
- Lọc và phân trang tài liệu.
- Thêm/xóa document metadata.

File: `server/core/runtimeSupervisor.js`

Chịu trách nhiệm:

- Ghi activity log vào `server/data/activity.json`.
- Tạo backup runtime vào `server/data/backups/`.
- Xuất system status cho trang `/operations`.
- Xuất readiness checks cho `config.json`, `documents.json`, `uploads/`, `ADMIN_PASSWORD`, `WEB_AUTH_SECRET`, legacy PIN và `ALLOWED_ORIGINS`.
- Sinh cảnh báo vận hành khi cấu hình chưa đạt điều kiện production.
- Chuẩn hóa lỗi API JSON khi payload sai.

### Frontend

File: `src/core/hubCore.ts`

Chịu trách nhiệm:

- Chuẩn hóa config nhận từ API.
- Tính view model cho dashboard.
- Tạo object mới cho Admin.
- Phân trang local cho các nhóm quản trị.
- Chuyển textarea thành list rủi ro/checklist.

## API

```text
GET    /api/health
GET    /api/ready
GET    /api/config
PUT    /api/config
GET    /api/safety/summary
GET    /api/system/status
GET    /api/activity?page=1&pageSize=8
GET    /api/backups
POST   /api/backups
GET    /api/documents?page=1&pageSize=8&q=&category=all&departmentId=all
POST   /api/documents
DELETE /api/documents/:id
```

Các API ghi dữ liệu cần session cookie admin:

```text
Cookie: mhchub_session=<httpOnly-session>
```

Header `X-Admin-PIN` chỉ là legacy fallback, mặc định tắt bằng `ENABLE_LEGACY_ADMIN_PIN=false`.

## Tiêu chí nghiệm thu

- `npm run build` pass.
- `/`, `/safety-6s`, `/safety-6s/departments/production`, `/documents`, `/admin` trả `200`.
- `/operations` trả `200`.
- `/api/config` trả config.
- `/api/safety/summary` trả KPI.
- `/api/system/status` trả trạng thái runtime.
- `/api/ready` trả readiness; nếu `ADMIN_PASSWORD` còn placeholder, `WEB_AUTH_SECRET` yếu hoặc bật PIN legacy mặc định thì trả `503` để cảnh báo chưa sẵn sàng production.
- `/api/activity` trả activity log có phân trang.
- `/api/backups` trả danh sách backup.
- `POST /api/backups` chưa đăng nhập trả `401`, session admin hợp lệ tạo backup.
- `/api/documents?page=1&pageSize=1` trả `items` và `pagination`.
- Lưu config chưa đăng nhập trả `401`, session admin hợp lệ trả `200`.
- Upload chưa đăng nhập trả `401`, session admin hợp lệ upload được.
- Xóa tài liệu bằng session admin hợp lệ trả `204`.
- UI desktop/mobile không trang trắng, không chồng layout chính.
