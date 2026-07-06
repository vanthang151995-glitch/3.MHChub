# Quy Tắc Dự Án MHChub

## 1. Cập nhật nhật ký hàng ngày (BẮT BUỘC)
- **PHẢI cập nhật `DAILY_LOG.md`** vào đầu hoặc cuối mỗi phiên làm việc.
- Ghi lại: tính năng kéo từ GitHub, lỗi đã fix, thay đổi code, quyết định kỹ thuật.
- Không được kết thúc phiên làm việc mà không cập nhật nhật ký nếu có thay đổi code.

## 2. Quy trình lấy code từ GitHub
Khi user yêu cầu lấy code từ GitHub (template/thang), luôn thực hiện theo thứ tự:
1. `git fetch template`
2. Xem commit mới: `git log <old_hash>..<new_hash> --oneline`
3. Xem file thay đổi: `git diff --stat <old_hash>..<new_hash>`
4. Checkout file nguồn (`.tsx`, `.ts`, `.css`, `.js`), bỏ qua `dist/`, `server/data/auth/`, `attached_assets/`
5. Kiểm tra syntax: `node -e "transformSync(...)"` cho tất cả file `.tsx` mới
6. Kiểm tra file CSS đi kèm — **không được bỏ sót CSS**
7. Khởi động lại server
8. **Cập nhật `DAILY_LOG.md`** ghi lại các commit vừa kéo

## 3. Các lỗi hay gặp khi lấy code mới
Xem chi tiết trong `PULL_TROUBLESHOOTING.md`. Tóm tắt:
- **Lỗi 500 API báo cáo**: sửa SQL trong `mysqlSafetyOperationsStore.js` dùng `YEAR(created_at)` thay vì `period LIKE ?`
- **CSP block inline style**: thêm `'unsafe-inline'` vào `style-src` trong `server/index.js`
- **Lỗi build JSX syntax**: bọc `return(...)` trong `<>...</>` nếu có nhiều root element

## 4. Các file KHÔNG được overwrite khi kéo code
- `server/index.js` — đã sửa CSP `style-src 'unsafe-inline'`
- `src/app/AppTopNav.tsx` — đã thêm logo Mani (`src={logoUrl || "/images/mani-wordmark.svg"}`)
- `package.json` — đã khóa `xlsx` ở version `0.18.5`

> **Lưu ý:** Sau mỗi lần kéo code mới có `AppTopNav.tsx`, phải kiểm tra logo bằng lệnh:
> `node -e "const c=require('fs').readFileSync('src/app/AppTopNav.tsx','utf8');console.log(c.match(/src=\{[^}]+\}/)?.[0])"`
> Nếu kết quả là `src={logoUrl}` (không có fallback SVG) → phải sửa lại ngay.

## 5. Phụ thuộc cần theo dõi
- `xlsx` bị khóa ở `0.18.5` (Apache 2.0, không tự động update)
- Không upgrade `xlsx` lên `>=0.20.x` vì license không còn free cho doanh nghiệp
