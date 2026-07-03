# Hướng Dẫn Xử Lý Lỗi Khi Lấy Code Mới Từ GitHub (Pull Mới)

Nếu bạn lấy code mới (`git pull` hoặc tải file) từ GitHub về và gặp lại các lỗi tương tự, dưới đây là nguyên nhân và cách xử lý nhanh.

## 1. Lỗi `500 Internal Server Error` ở trang Báo cáo (Dept / Company Report)
* **Triệu chứng:** Khi mở trang báo cáo hoặc gọi API `/api/safety/dept-report`, server bị sập hoặc trả về lỗi 500, trong log server có thể báo lỗi SQL liên quan đến cột `period`.
* **Nguyên nhân:** Code trên GitHub có thể đang truy vấn cột `period` (dùng `period LIKE ?`) cho bảng `safety_warnings` (cảnh báo) và `safety_incidents` (sự cố). Tuy nhiên, database MySQL thực tế của bạn không có cột này.
* **Cách xử lý:** 
  Mở file `server/core/mysqlSafetyOperationsStore.js` và tìm các đoạn query liên quan đến `safety_warnings` và `safety_incidents`.
  - Thay `period LIKE ?` của bảng `safety_warnings` thành `created_at LIKE ?`
  - Thay `period LIKE ?` của bảng `safety_incidents` thành `occurred_date LIKE ?`

## 2. Lỗi UI trắng trang / Blocked by Content Security Policy (CSP)
* **Triệu chứng:** Console trình duyệt báo lỗi màu đỏ: `Applying inline style violates the following Content Security Policy directive 'style-src 'self''...` và giao diện không render được.
* **Nguyên nhân:** Code mới trên GitHub thêm các style trực tiếp (inline style) dạng `style={{ color: 'red' }}` vào các component React. Tuy nhiên, cấu hình bảo mật CSP trên server của bạn chỉ cho phép load file CSS (`'self'`), chặn hoàn toàn inline CSS.
* **Cách xử lý:**
  Mở file `server/index.js`, tìm mảng cấu hình `appContentSecurityPolicy`.
  Ở dòng chứa `"style-src 'self'"`, sửa thành:
  `"style-src 'self' 'unsafe-inline'"`

## 3. Lỗi Build Frontend (Expected ")" but found "{")
* **Triệu chứng:** Chạy lệnh `npm run dev` hoặc `npm run build` báo lỗi đỏ ở file `.tsx` (ví dụ: `SafetyCapaApprovalPage.tsx`) với thông báo lỗi syntax (Expected ")" but found "{").
* **Nguyên nhân:** Lỗi cú pháp React JSX do code trên GitHub viết sai cấu trúc (ví dụ: đặt thêm phần tử HTML/Portal nằm bên ngoài thẻ `<div>` bao ngoài cùng của lệnh `return`). Trong React, một lệnh `return` chỉ được phép trả về một thẻ gốc duy nhất.
* **Cách xử lý:**
  Tìm đến file bị lỗi, bọc toàn bộ thẻ bên trong lệnh `return` bằng thẻ Fragment rỗng `<> ... </>`.
  Ví dụ:
  ```tsx
  return (
    <>
      <div className="root">...</div>
      {showPortal && createPortal(...)}
    </>
  );
  ```

---
*Lưu ý: Bạn nên tạo các commit trên Git ở máy bạn để lưu lại các thay đổi này. Khi có code mới, bạn dùng lệnh `git pull` để Git tự động gộp (merge) code mới với các sửa đổi của bạn, tránh bị mất code cũ.*
