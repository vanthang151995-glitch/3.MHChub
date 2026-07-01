# Company Utility Hub / MHChub

mhchub01 / tniot

Web nội bộ cho công ty: cổng tiện ích, An toàn vệ sinh lao động - 6S, thư viện tài liệu và trang quản trị cấu hình.

## Chạy nhanh

```powershell
npm install
npm run build
npm run ops:secrets
npm start
```

Mở local:

```text
http://localhost:3333
```

Mở trong LAN:

```text
http://<IP-server>:3333
```

## Chức năng chính

- Cổng link IoT, Gateway, Ghi chép công việc, An toàn - 6S.
- Dashboard An toàn - 6S theo công ty và bộ phận.
- Trang chi tiết bộ phận với rủi ro, checklist, hành động và tài liệu.
- Thư viện tài liệu có upload, xóa, tìm kiếm, lọc và phân trang.
- Trang `/admin` để đăng nhập và quản trị link, bộ phận, hành động bằng tài khoản admin.
- Trang `/operations` để xem system status, runtime files, backup và activity log.
- Kiểm tra sẵn sàng vận hành qua `/api/ready`, cảnh báo cấu hình yếu và trạng thái file runtime.
- Lớp bảo vệ Express: request id, security headers, CORS allowlist, giới hạn dung lượng upload và chặn đuôi file không cho phép.
- Đa ngôn ngữ Việt / Anh / Nhật.

## Kiến trúc mạnh

- Backend core processor: `server/core/centralProcessor.js`
- Runtime supervisor: `server/core/runtimeSupervisor.js`
- Frontend core processor: `src/core/hubCore.ts`
- API service: `src/services/api.ts`
- Pages riêng: `src/pages/`
- UI dùng lại: `src/components/`
- Config runtime: `server/data/config.json`
- Activity log runtime: `server/data/activity.json`
- Backup runtime: `server/data/backups/`
- Config mặc định: `shared/defaultConfig.js`

## Cấu hình

- `ADMIN_PASSWORD`: mật khẩu đăng nhập admin. Khi chạy thật phải đặt mật khẩu riêng bằng `npm run ops:secrets`.
- `WEB_AUTH_SECRET`: secret ký session web, tối thiểu 32 ký tự; `npm run ops:secrets` sẽ tự tạo nếu đang thiếu/yếu.
- `PORT`: cổng server, mặc định `3333`.
- `VITE_API_BASE_URL`: để trống khi frontend và backend chạy cùng host.
- `APP_ENV`: môi trường chạy, ví dụ `lan`, `production`.
- `TRUST_PROXY`: bật khi chạy sau reverse proxy đáng tin cậy.
- `ALLOWED_ORIGINS`: danh sách origin được gọi API, phân tách bằng dấu phẩy.
- `MAX_UPLOAD_MB`: dung lượng upload tối đa, mặc định `50`.
- `ACTIVITY_LOG_LIMIT`: số dòng activity log giữ lại, mặc định `500`.

## Vận hành

- Mở `/operations` để xem trạng thái hệ thống, readiness, cảnh báo bảo mật, backup và activity log.
- Gọi `/api/ready` để kiểm tra server đã đủ điều kiện chạy LAN/production chưa.
- Chạy `npm run ops:preflight` để xem tóm tắt production còn thiếu gì; script chỉ đọc report trong `qa/reports`, không restart và không sửa cấu hình.
- Nếu `/api/ready` báo `admin-password (ADMIN_PASSWORD)`, chạy `npm run ops:secrets`, restart/reload MHChub rồi kiểm tra lại bằng `npm run ops:health -- -BaseUrl http://127.0.0.1:3333 -StrictReady`.
- Dọn file build cũ local: chạy `npm run ops:dist:cleanup-preview` trước; nếu cần xóa thật, mở PowerShell Administrator và chạy lệnh `clean-dist-stale-assets.ps1 -Apply -ConfirmStaleCount <số-file>` do preview gợi ý.

## Tài liệu

- `docs/STRUCTURE.md`: cấu trúc thư mục và quy ước phát triển.
- `docs/FUNCTIONAL_SPEC.md`: chức năng, API, core processor và tiêu chí nghiệm thu.
