# MHChub Login/Auth Design

Ngay cap nhat: 2026-05-28

## Muc tieu

Ap dung thiet ke dang nhap tu `setup/login-auth-setup-package` vao MHChub theo stack hien tai:

- Backend hien tai: Node.js ESM JavaScript.
- Frontend hien tai: React/Vite.
- Luu tru MVP: JSON trong `server/data`.
- Huong production: database MySQL rieng `mhchub`, khong dung chung database IoT/PLC `plc_monitoring`.

## Cau truc da them vao MHChub

- `server/auth/authService.js`: hash password, login/logout/me, signed cookie, single active session, rate limit, auth audit log.
- `server/auth/mysqlAuthStore.js`: MySQL auth store dung rieng database `mhchub` khi co `MHCHUB_MYSQL_*`.
- `server/data/auth/users.json`: fallback dev/local neu chua cau hinh MySQL rieng.
- `server/data/auth/auth_audit_log.json`: fallback audit log dev/local.
- `server/data/auth/auth_login_attempts.json`: fallback rate limit dev/local.
- `src/auth/AuthContext.tsx`: context dang nhap frontend.
- `src/pages/LoginPage.tsx`: trang `/login`.
- `database/create_mhchub_database.sql`: tao database rieng `mhchub`.
- `database/migrations/001_auth_schema.sql`: schema database auth cho MySQL rieng cua MHChub.
- `scripts/ensure-admin-user.mjs`: tao/cap nhat admin user trong JSON store MVP.

## API auth

- `GET /api/auth/me`: tra user hien tai hoac null.
- `POST /api/auth/login`: nhan `username`, `password`, set cookie `mhchub_admin_auth`.
- `POST /api/auth/logout`: xoa active session va clear cookie.

API can quyen admin:

- `PUT /api/config`
- `GET /api/system/status`
- `GET /api/activity`
- `GET /api/backups`
- `POST /api/documents`
- `DELETE /api/documents/:id`
- `POST /api/backups`

Mac dinh cac API nay chi chap nhan session cookie dang nhap.

Luong `X-Admin-PIN` legacy da tat mac dinh. Chi bat tam thoi khi can van hanh cu bang:

```env
ENABLE_LEGACY_ADMIN_PIN=true
ADMIN_PIN=<pin_manh_khong_dung_2468>
```

Frontend da chuyen sang cach 1 va khong con yeu cau nhap PIN tren man hinh admin/documents/operations.

## Tai khoan bootstrap

Neu `server/data/auth/users.json` chua ton tai hoac rong, server tao user dau tien:

- Username: `ADMIN_USERNAME` hoac `admin`.
- Password: `ADMIN_PASSWORD`; chi fallback sang `ADMIN_PIN` khi legacy PIN duoc bat ro rang trong thoi gian chuyen doi.

Khuyen nghi production:

- Dat `ADMIN_USERNAME`.
- Dat `ADMIN_PASSWORD` manh.
- Dat `WEB_AUTH_SECRET` toi thieu 32 ky tu.
- Giu `ENABLE_LEGACY_ADMIN_PIN=false`; chi bat legacy PIN trong thoi gian chuyen doi ngan.
- Khong dung `ALLOWED_ORIGINS=*` khi `NODE_ENV=production` va `APP_ENV` khac `lan`.

Hardening dang ap dung:

- Cookie auth `HttpOnly`, `SameSite=Lax`, co `Secure` khi chay production public.
- Login co rate limit theo tai khoan/IP trong auth store, va server co rate limit rieng cho `/api` va `/api/auth/login`.
- Header bao mat: `nosniff`, `SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, CSP.
- Upload chi cho phep danh sach duoi file/MIME hop le; file tai lieu tai ve qua `/uploads` duoc set `Content-Disposition: attachment`.
- Trang/endpoint van hanh chi mo khi da dang nhap de tranh lo host, process, activity log va danh sach backup.
- Audit log ghi IP truc tiep theo socket/Express; neu chay sau proxy thi bat `TRUST_PROXY=true` de lay `CF-Connecting-IP`, `X-Real-IP`, hoac IP dau tien trong `X-Forwarded-For`.

Tao hoac reset admin user thu cong trong MySQL `mhchub` khi co `MHCHUB_MYSQL_*`; neu khong co MySQL config thi script fallback ve JSON:

```powershell
npm run auth:ensure-admin -- admin "mat_khau_manh"
```

## Huong chuyen database

Database cho MHChub phai tach rieng voi IoT/PLC. Khong dung `MYSQL_DATABASE=plc_monitoring` cho du an nay.

Bien moi truong dung rieng cho MHChub:

```env
MHCHUB_MYSQL_HOST=127.0.0.1
MHCHUB_MYSQL_PORT=3308
MHCHUB_MYSQL_USER=root
MHCHUB_MYSQL_PASSWORD=
MHCHUB_MYSQL_DATABASE=mhchub
MHCHUB_MYSQL_CONNECTION_LIMIT=10
```

Tao database rieng:

```powershell
mysql -h 127.0.0.1 -P 3308 -u root < database/create_mhchub_database.sql
mysql -h 127.0.0.1 -P 3308 -u root mhchub < database/migrations/001_auth_schema.sql
```

Auth runtime uu tien MySQL `mhchub` khi co du cac bien `MHCHUB_MYSQL_HOST`, `MHCHUB_MYSQL_DATABASE`, `MHCHUB_MYSQL_USER`. JSON chi la fallback dev/local.

Ngay 2026-05-28 da tao database rieng `mhchub` tren MySQL local va tao 3 bang:

- `users`
- `auth_audit_log`
- `auth_login_attempts`

Tai khoan admin da tao trong MySQL:

- Username: `thangiot`
- Role: `admin`

Schema chinh: `database/migrations/001_auth_schema.sql`.

Nguyen tac:

- `users` la source of truth tai khoan.
- `auth_audit_log` chi append, khong sua/xoa tay.
- `auth_login_attempts` la runtime security state, co the cleanup row cu.
- `active_session_id` giup chi cho phep mot phien dang nhap active cho moi user.
