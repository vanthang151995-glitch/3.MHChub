# Cấu trúc thư mục MHChub

MHChub được tổ chức theo hướng hệ thống nội bộ mạnh, giống các hệ thống IoT: tách rõ app shell, page, service API, core processor và dữ liệu runtime.

## Cây thư mục chính

```text
3.MHChub/
├─ src/
│  ├─ app/                  # App shell, navigation, layout cấp hệ thống
│  ├─ components/           # UI dùng lại: metric, status, pagination, field
│  ├─ core/                 # Bộ xử lý trung tâm phía frontend
│  ├─ pages/                # Các page chức năng độc lập
│  ├─ services/             # API client, giao tiếp backend
│  ├─ App.tsx               # Router cấp cao
│  ├─ main.tsx              # Điểm mount React vào HTML
│  ├─ styles.css            # Design system CSS
│  ├─ data.js               # Category và fallback data
│  └─ i18n.js               # Từ điển Việt / Anh / Nhật
├─ server/
│  ├─ core/
│  │  ├─ centralProcessor.js # Bộ xử lý trung tâm backend
│  │  └─ runtimeSupervisor.js # Trạng thái vận hành, readiness, backup, activity log
│  ├─ data/
│  │  ├─ config.json        # Config hệ thống lưu từ trang Quản trị
│  │  ├─ documents.json     # Metadata tài liệu
│  │  ├─ activity.json      # Nhật ký thao tác runtime
│  │  └─ backups/           # Backup config/documents runtime
│  ├─ uploads/              # File người dùng upload
│  └─ index.js              # Express API và static server
├─ shared/
│  └─ defaultConfig.js      # Config mặc định dùng chung frontend/backend
├─ docs/
│  ├─ STRUCTURE.md
│  └─ FUNCTIONAL_SPEC.md
├─ package.json
├─ vite.config.ts
└─ README.md
```

## Phân lớp chức năng

- `server/index.js`: lớp API Express, security headers, CORS allowlist, upload policy, static build và chuẩn hóa lỗi.
- `server/core/centralProcessor.js`: đọc/ghi JSON, chuẩn hóa config, tính safety summary, lọc/phân trang tài liệu.
- `server/core/runtimeSupervisor.js`: theo dõi status, readiness, cảnh báo cấu hình, ghi activity log, tạo/list backup runtime.
- `src/core/hubCore.ts`: dựng view model dashboard, tính KPI, phân trang local cho Admin, tạo link/bộ phận/action mới.
- `src/services/api.ts`: tập trung toàn bộ request API; page không gọi `fetch` trực tiếp.
- `src/pages/`: mỗi màn hình là một page riêng: Home, Safety, Department, Documents, Admin.
- `src/components/`: UI dùng lại, tránh copy layout nhiều nơi.

## Quy ước phát triển

- Logic xử lý nghiệp vụ đặt trong `core/`, không đặt rải rác trong JSX.
- API gọi qua `src/services/api.ts`.
- Dữ liệu vận hành sửa trong `/admin`, lưu vào `server/data/config.json`.
- Trạng thái vận hành xem trong `/operations`; backup và log lưu dưới `server/data/`.
- Readiness chạy qua `/api/ready`; production phải có `ADMIN_PASSWORD` mạnh, `WEB_AUTH_SECRET` tối thiểu 32 ký tự và `ENABLE_LEGACY_ADMIN_PIN=false`.
- Upload tài liệu phải đi qua allowlist đuôi file và giới hạn `MAX_UPLOAD_MB`.
- Config mặc định đặt trong `shared/defaultConfig.js`.
- File upload chỉ lưu trong `server/uploads/`.
- Danh sách có khả năng tăng dữ liệu phải có tìm kiếm/lọc/phân trang.
- Nội dung đa ngôn ngữ đặt trong `src/i18n.js` hoặc object `{ vi, en, ja }`.

## Hướng mở rộng

Khi cần mở rộng giống hệ thống IoT production, nên thêm:

- `server/modules/`: tách route documents, config, safety.
- `server/storage/`: thay JSON bằng MySQL/Postgres.
- `src/features/`: tách feature lớn như safety-6s, documents, utility-links.
- `src/auth/`: đăng nhập và phân quyền.
- `src/jobs/`: đồng bộ KPI từ IoT hoặc hệ thống sản xuất.
