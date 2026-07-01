# Dinh huong san pham va bao mat cho MHChub Safety - 6S

Ngay lap: 2026-05-27

## 1. Ket luan ngan

MHChub hien da co nen MVP dung duoc cho LAN noi bo: dashboard tong quan, trang bo phan, thu vien tai lieu, upload/xoa bang PIN va trang admin cau hinh. Huong dung cho cong ty nen la web app noi bo quan ly ATVSLD - 6S, khong nen lam website gioi thieu.

Phan nen uu tien tiep theo:

1. Bien checklist 6S tu noi dung tinh thanh lich su audit co diem, anh bang chung va nguoi phu trach.
2. Bien "viec can xu ly" thanh workflow CAPA: tao viec, giao nguoi, deadline, qua han, dong viec, anh truoc/sau.
3. Them bao cao nguy co/su co bang QR theo khu vuc de nhan vien bao nhanh tren dien thoai.
4. Thay PIN admin bang dang nhap va phan quyen toi thieu: Admin, EHS, Truong bo phan, Auditor, Nhan vien.
5. Them audit trail cho moi hanh dong quan trong: upload, xoa, sua cau hinh, dong hanh dong khac phuc.

## 2. Hien trang repo

Stack:

- Frontend: React + Vite.
- Backend: Node.js + Express.
- Luu tru MVP: JSON trong `server/data`, file upload trong `server/uploads`.
- Module hien co:
  - `/`: cong tien ich noi bo.
  - `/safety-6s`: tong quan ATVSLD - 6S.
  - `/safety-6s/departments/:id`: chi tiet bo phan.
  - `/documents`: thu vien tai lieu.
  - `/admin`: sua link, bo phan, hanh dong an toan.

Kiem tra ky thuat ngay 2026-05-27:

- `npm run build`: dat.
- `npm audit --json`: 0 vulnerability.
- Runtime API:
  - `GET /api/health`: dat, tra `ok: true`.
  - `GET /api/documents`: dat.
  - `PUT /api/config` chua dang nhap: tra 401.

## 3. Mau san pham nen hoc tu thi truong

Cac he thong 5S/EHS tot thuong co chung mot mau:

- Checklist audit so hoa, co diem tung muc.
- Bang chung anh/video cho loi 5S va nguy co.
- Corrective action gan ngay tai cau hoi bi fail.
- Nguoi phu trach, deadline, trang thai, chu ky nhac viec.
- Luu lich su audit va xuat PDF/Excel.
- Dashboard theo khu vuc, bo phan, muc do rui ro, qua han.
- Dao tao va chung nhan an toan theo nhan vien.

Nguon tham khao:

- SafetyCulture 5S Audit Checklist: checklist so, anh bang chung, corrective action, timestamp, chu ky audit.
- OSHA Safety and Health Program: nhan dien hazard, danh gia severity/likelihood, uu tien corrective action.
- ISO 45001: khung quan ly OH&S theo policy, objective, planning, operation, audit, review va continual improvement.
- VelocityEHS Safety Software: incident, audit, inspection, observation, action management, training, reporting.

## 4. Kien truc san pham de xay rieng cho cong ty

### 4.1 Nguoi dung

- Nhan vien: quet QR, bao nguy co/su co, xem tai lieu va thong bao an toan.
- Auditor: thuc hien audit 6S, ghi diem, chup anh, tao corrective action.
- Truong bo phan: nhan viec, cap nhat tien do, dong viec khac phuc.
- EHS: quan ly checklist, risk register, phe duyet dong viec, bao cao KPI.
- Admin he thong: quan ly user, role, bo phan, cau hinh.

### 4.2 Module nen co

MVP thuc chien truong:

- Dashboard KPI: diem 6S, so hazard moi, so action qua han, bo phan can theo doi.
- Audit 6S: checklist theo Sort, Set in order, Shine, Standardize, Sustain, Safety.
- CAPA/action: viec khac phuc co owner, due date, severity, status, evidence.
- Bao cao nguy co/su co: QR theo khu vuc, form mobile, anh hien truong.
- Tai lieu: SOP, SDS/MSDS, PPE, emergency, training, version.

Mo rong sau:

- Dao tao: ma tran dao tao, ngay het han, nhac tai dao tao.
- Risk register: hazard, risk score, control hien co, control can bo sung.
- Bao cao PDF/Excel: audit report, action overdue, monthly EHS report.
- Tich hop: email/Teams/Zalo, IoT alert, HR employee master, SSO noi bo.

## 5. Data model de tranh bi lac huong

Bang/toa do du lieu toi thieu:

- `users`: ho ten, bo phan, role, trang thai.
- `departments`: ten, owner, khu vuc, risk level.
- `locations`: line/may/khu vuc, QR code, department id.
- `audit_templates`: phien ban checklist.
- `audit_questions`: nhom 6S, cau hoi, diem toi da, muc bat buoc chup anh.
- `audits`: template, bo phan/khu vuc, auditor, ngay audit, tong diem, trang thai.
- `audit_answers`: cau hoi, diem, ghi chu, anh bang chung.
- `hazard_reports`: nguoi bao, vi tri, mo ta, anh, severity, likelihood, status.
- `actions`: nguon tao, owner, due date, severity, status, evidence before/after.
- `documents`: title, category, department, version, file, effective date.
- `audit_logs`: ai lam gi, luc nao, truoc/sau, IP thiet bi.

## 6. Ranh gioi bao mat quan trong

Tai san can bao ve:

- Tai lieu noi bo, SOP, SDS/MSDS, file audit, anh hien truong.
- Quyen sua cau hinh, xoa tai lieu, upload file.
- Du lieu nguy co/su co, lich su khac phuc, KPI bo phan.
- Neu sau nay co thong tin nhan vien: ten, bo phan, dao tao, chung nhan.

Nguon input khong tin cay:

- Body JSON cua `/api/config`.
- Multipart upload cua `/api/documents`.
- Query filter cua `/api/documents`.
- Ten file, MIME type va noi dung file upload.
- Noi dung title/category/department/language/version.

Trust boundary:

- Browser nguoi dung -> Express API.
- Nhan vien xem -> admin/EHS co quyen sua/xoa.
- File upload -> file public qua `/uploads`.
- JSON config/document metadata -> UI render.
- LAN noi bo -> khong dong nghia an toan neu may client bi nhiem malware hoac PIN bi lo.

## 7. Phat hien bao mat tu code hien tai

### S1. Cau hinh admin/secret yeu

Bang chung:

- He thong hien dung dang nhap admin voi `ADMIN_PASSWORD` va session cookie.
- `WEB_AUTH_SECRET` ky session phai du manh.
- Luong `X-Admin-PIN` chi la legacy fallback va mac dinh tat bang `ENABLE_LEGACY_ADMIN_PIN=false`.

Rui ro:

- Neu deploy quen dat `ADMIN_PASSWORD`/`WEB_AUTH_SECRET` manh, tai khoan admin va session co the bi doan hoac bi gia mao trong LAN.
- Neu bat lai legacy PIN trong production, PIN bi lo co the cho phep sua cau hinh, upload/xoa tai lieu.

Muc uu tien:

- Cao cho production LAN.

Khuyen nghi:

- Dat `ADMIN_PASSWORD` manh va `WEB_AUTH_SECRET` toi thieu 32 ky tu bang `npm run ops:secrets`.
- Giu `ENABLE_LEGACY_ADMIN_PIN=false`; chi bat tam thoi khi can chuyen doi.
- Chay `npm run ops:health -- -BaseUrl http://127.0.0.1:3333 -StrictReady` truoc khi dung production.

### S2. CORS mo rong toan bo origin

Bang chung:

- `server/index.js`: `app.use(cors());`

Rui ro:

- Website khac co the goi API tu trinh duyet nguoi dung. Hien tai API dung header PIN nen rui ro phu thuoc viec lo PIN, nhung khi co login/cookie sau nay se thanh CSRF/CORS risk.

Muc uu tien:

- Trung binh hien tai, cao khi them dang nhap cookie/session.

Khuyen nghi:

- Restrict origin theo domain/IP noi bo.
- Neu dung cookie/session: them CSRF token va SameSite.

### S3. Upload file public qua `/uploads`

Bang chung:

- `app.use("/uploads", express.static(uploadDir));`
- Upload khong co allowlist MIME/extension.

Rui ro:

- File noi bo sau upload co URL public trong LAN.
- Co the upload HTML/SVG/script-like content. Tuy Express static khong tu render trong app, nhung nguoi dung click mo file tren cung origin co the gap content-type confusion/stored active content tuy theo browser/MIME.

Muc uu tien:

- Cao neu tai lieu co noi dung nhay cam hoac LAN co nhieu user.

Khuyen nghi:

- Allowlist file type: PDF, DOCX, XLSX, PPTX, PNG/JPG neu can.
- Gan `X-Content-Type-Options: nosniff`.
- Phuc vu file qua endpoint download co authz/log thay vi static public.
- Luu file bang id khong doan duoc va khong tin MIME do client gui.

### S4. Khong co audit trail

Bang chung:

- Upload, delete, save config chi cap nhat JSON, khong log nguoi/nguon/du lieu truoc-sau.

Rui ro:

- Khong truy vet duoc ai xoa tai lieu, ai sua diem/rui ro/action.

Muc uu tien:

- Cao cho EHS/6S vi can bang chung audit.

Khuyen nghi:

- Them `audit_logs` gom actor, action, entity, entityId, before/after hash, timestamp, IP/user-agent.

### S5. Luu JSON file cho du lieu nghiep vu

Bang chung:

- `server/core/centralProcessor.js` doc/ghi `documents.json`, `config.json` bang sync fs.

Rui ro:

- Mat/corrupt du lieu neu ghi dong thoi, server crash khi dang ghi, kho backup/phan quyen.

Muc uu tien:

- Trung binh MVP, cao khi co nhieu user.

Khuyen nghi:

- Chuyen sang MySQL/Postgres khi bat dau audit/action that.
- Neu tam thoi giu JSON: atomic write file tam + rename, backup theo ngay.

## 8. Roadmap de lam dung thu tu

### Sprint 1: Lam san pham co gia tri ngay

- Tao audit 6S that: template, audit session, answer, score, note, photo.
- Tao action tu cau hoi fail.
- Filter action theo bo phan, severity, qua han.
- Them trang mobile report hazard bang QR location.

Ket qua mong muon:

- EHS co the di audit bang dien thoai va tao viec khac phuc ngay tren hien truong.

### Sprint 2: Lam chuan van hanh

- Login va role.
- Audit trail.
- Chuyen DB sang MySQL/Postgres.
- Download file qua endpoint co quyen, khong public static.
- Bao cao Excel/PDF.

Ket qua mong muon:

- Co the dung that trong LAN voi du lieu nhay cam noi bo.

### Sprint 3: Lam thanh he thong EHS noi bo

- Training matrix.
- Risk register.
- Dashboard trend theo thang/quy.
- Notification qua Teams/Zalo/email.
- Tich hop IoT alert neu can lien ket may/line.

## 9. Tieu chi nghiem thu phien ban tiep theo

- Auditor tao audit moi, cham diem tung cau hoi, them anh va submit duoc.
- Cau hoi fail tao action co owner va deadline.
- Truong bo phan cap nhat action, them anh sau khac phuc va yeu cau dong viec.
- EHS phe duyet dong action.
- Dashboard tinh dung diem trung binh, action open, action overdue.
- Sai quyen khong the sua/xoa/upload.
- Moi thao tac sua/xoa/upload/dong action co audit log.
- File upload sai type bi tu choi.
- Build dat va API smoke test dat.

## 10. Quyet dinh kien truc de chot som

De tranh lam lai, nen chot 5 quyet dinh nay truoc khi code lon:

1. Chay LAN noi bo hay co truy cap tu ngoai qua Cloudflare/VPN?
2. Dung tai khoan rieng hay SSO/AD noi bo?
3. Database chon MySQL hay Postgres?
4. File luu local server, NAS, SharePoint hay S3-compatible storage?
5. Doi tuong su dung chinh la EHS audit tren desktop hay auditor/nhan vien dung dien thoai tai hien truong?

Khuyen nghi mac dinh cho nha may:

- LAN/VPN truoc, khong public internet.
- Postgres hoac MySQL deu duoc; neu ha tang da co MySQL thi dung MySQL cho don gian van hanh.
- File luu NAS/server folder nhung download qua API co authz.
- UI mobile-first cho audit/hazard, desktop-first cho dashboard/admin.

## 11. Phan con thieu nen bo sung vao ke hoach

Tai lieu ban dau da co huong san pham va bao mat, nhung de trien khai that trong cong ty can bo sung cac lop sau:

- Quy trinh nghiep vu chi tiet: ai tao, ai xu ly, ai phe duyet, trang thai nao la ket thuc.
- Ma tran phan quyen: moi vai tro duoc xem/sua/xoa/phe duyet cai gi.
- KPI va cong thuc tinh: diem 6S, ty le hoan thanh, qua han, dao tao, hazard closure.
- Bo man hinh toi thieu: mobile audit, mobile hazard, desktop dashboard, action board, report export.
- Ho so phap ly/audit: tai lieu nao can luu, thoi gian luu, ai duoc xem, ai duoc sua.
- Van hanh he thong: backup, restore, log, update phien ban, xu ly khi mat mang/server.
- Chien luoc du lieu: khi nao con dung JSON, khi nao bat buoc chuyen database.

## 12. Quy trinh nghiep vu de thiet ke man hinh

### 12.1 Audit 6S

Trang thai de xuat:

1. `draft`: auditor tao lich/audit moi.
2. `in_progress`: dang audit tai hien truong.
3. `submitted`: da nop ket qua, chua phe duyet.
4. `reviewed`: EHS hoac truong bo phan da xem.
5. `closed`: da tao/gan xong cac action can thiet.

Luon nen co:

- Thoi gian bat dau/ket thuc.
- Auditor.
- Bo phan/khu vuc/line/may.
- Template va version checklist.
- Cau hoi, diem, ghi chu, anh bang chung.
- Dieu kien tao action tu cau hoi fail.

### 12.2 Bao cao nguy co/su co

Trang thai de xuat:

1. `new`: nhan vien vua bao cao.
2. `triaged`: EHS da phan loai severity/likelihood.
3. `assigned`: da giao nguoi xu ly.
4. `in_progress`: dang khac phuc.
5. `pending_review`: cho EHS kiem tra.
6. `closed`: dong sau khi co bang chung.
7. `rejected`: bao cao trung lap/khong hop le.

Truong du lieu can co:

- Loai: hazard, near miss, incident, unsafe act, unsafe condition.
- Vi tri: department, location, QR code.
- Mo ta ngan, anh hien truong, muc do nghiem trong.
- Tam dung khan cap hay khong.
- Action lien quan.

### 12.3 CAPA/action khac phuc

Trang thai de xuat:

1. `open`: moi tao.
2. `assigned`: da co owner.
3. `in_progress`: dang xu ly.
4. `blocked`: bi chan, can escalation.
5. `done_by_owner`: owner bao da xong.
6. `verified`: EHS/leader xac minh.
7. `closed`: dong viec.
8. `reopened`: mo lai do khong dat.

Quy tac:

- Action high severity phai co due date ngan hon.
- Qua han phai hien tren dashboard va danh sach uu tien.
- Dong viec phai co bang chung sau khac phuc.
- Nen luu anh truoc/sau neu action sinh tu audit hoac hazard.

## 13. Ma tran phan quyen de trien khai role

| Chuc nang | Nhan vien | Auditor | Truong bo phan | EHS | Admin |
| --- | --- | --- | --- | --- | --- |
| Xem dashboard tong quan | Xem gioi han | Xem | Xem bo phan | Xem tat ca | Xem tat ca |
| Bao cao hazard/su co | Tao | Tao | Tao | Tao | Tao |
| Sua hazard/su co | Khong | Khong | Cap nhat bo phan | Phan loai/phe duyet | Tat ca |
| Tao audit 6S | Khong | Co | Co gioi han | Co | Co |
| Phe duyet audit | Khong | Khong | Bo phan minh | Co | Co |
| Tao action | Khong | Co tu audit | Co | Co | Co |
| Cap nhat action | Neu la owner | Neu la owner | Bo phan minh | Tat ca | Tat ca |
| Dong action | Khong | Khong | De nghi dong | Phe duyet dong | Phe duyet dong |
| Upload tai lieu | Khong | Khong | De xuat | Co | Co |
| Xoa tai lieu | Khong | Khong | Khong | Co gioi han | Co |
| Sua cau hinh he thong | Khong | Khong | Khong | Gioi han | Co |

Ghi chu:

- "Nhan vien" nen khong can thay thong tin nhay cam cua bo phan khac.
- "Truong bo phan" nen chi thay va xu ly du lieu thuoc bo phan minh.
- "EHS" la role nghiep vu chinh, khong nhat thiet co quyen cau hinh server.
- "Admin" la role ky thuat, khong nen thay the EHS trong phe duyet nghiep vu.

## 14. KPI va cong thuc nen chot som

KPI dashboard cap cong ty:

- Diem 6S trung binh = tong diem audit hop le / so audit hop le.
- Ty le action dung han = action dong truoc/vao due date / tong action da dong.
- Action qua han = action chua closed va due date < hom nay.
- Hazard closure rate = hazard closed / hazard da triage.
- Thoi gian dong hazard trung binh = trung binh `closedAt - createdAt`.
- Ty le dao tao hop le = nhan vien con han dao tao / tong nhan vien can dao tao.
- So audit hoan thanh theo lich = audit da submit / audit da len lich.

Can quy dinh:

- Audit nhap nhap/`draft` co tinh KPI khong: khuyen nghi khong.
- Audit bi huy co tinh KPI khong: khuyen nghi tach rieng.
- Action reopened tinh nhu qua han nhu the nao: khuyen nghi tinh theo due date goc va co lich su reopen.
- Diem 6S hien thi theo audit moi nhat hay trung binh thang: dashboard nen co ca hai.

## 15. Bo man hinh toi thieu nen thiet ke

Mobile-first:

- Quet QR khu vuc.
- Form bao cao hazard/su co.
- Man hinh lam audit 6S tai hien truong.
- Chup/gan anh bang chung.
- Cap nhat action cua toi.

Desktop-first:

- Dashboard cong ty.
- Dashboard bo phan.
- Action board theo trang thai.
- Audit history va detail report.
- Quan ly checklist template.
- Quan ly tai lieu va version.
- Admin user/role/department/location.

Report/export:

- PDF audit report theo bo phan/khu vuc.
- Excel action overdue.
- Monthly EHS/6S summary.
- Training expiry report.

## 16. Yeu cau ho so va audit compliance

Nen luu duoc cac loai ho so sau:

- Quy dinh ATVSLD noi bo.
- Checklist audit 6S theo version.
- Bien ban audit da submit.
- Anh bang chung truoc/sau.
- Danh sach action va lich su xu ly.
- Bao cao hazard/near miss/incident.
- Tai lieu SDS/MSDS hoa chat neu co.
- Tai lieu PPE theo khu vuc.
- Ho so dao tao va ngay het han.
- Bien ban dien tap khan cap neu co.

Chinh sach luu tru de xuat:

- Audit report va action: toi thieu 3 nam hoac theo quy dinh cong ty.
- Incident/near miss nghiem trong: luu dai han hon, khong cho xoa vat ly boi user thuong.
- Tai lieu version cu: khong xoa ngay, chuyen sang archived.
- Moi file/tai lieu/action can co audit log khi tao, sua, xoa, phe duyet.

## 17. Van hanh, backup va phuc hoi

Can co truoc khi dung production:

- Backup database hang ngay.
- Backup file upload hang ngay.
- Kiem tra restore dinh ky, khong chi backup.
- Log loi server va log thao tac nguoi dung.
- Health check API.
- Ke hoach update version: backup truoc khi deploy, rollback neu build loi.
- Tai khoan admin du phong nhung phai co log.

Neu van chay JSON trong MVP:

- Backup `server/data` va `server/uploads` moi ngay.
- Dung atomic write de giam nguy co hong JSON.
- Gioi han so nguoi sua admin cung luc.
- Chuyen database ngay khi co audit/action that tu nhieu bo phan.

## 18. Rui ro san pham neu lam thieu

- Chi lam dashboard ma khong co workflow action: he thong dep nhung khong giai quyet viec.
- Chi upload tai lieu ma khong co version/owner: sau vai thang kho biet file nao con hieu luc.
- Chi dung mot co che admin don gian khong phan role/audit log: de lo quyen sua/xoa va khong truy vet duoc.
- Chi tinh diem 6S hien tai: khong thay xu huong cai tien hay bo phan lap lai loi.
- Khong co mobile: EHS van phai ghi giay/chup anh rieng roi nhap lai.
- Khong co audit log: kho dung khi bi hoi "ai sua, sua luc nao, vi sao".

## 19. De xuat bo sung vao backlog gan nhat

Nen them cac task nay truoc khi code lon:

1. Tao schema database nhap: users, roles, departments, locations, audits, audit_answers, hazard_reports, actions, documents, audit_logs.
2. Thiet ke flow audit 6S mobile: select location -> answer checklist -> attach photo -> submit -> create action.
3. Thiet ke flow hazard QR: scan -> form -> triage -> action -> verify -> close.
4. Them auth/role thay cho PIN.
5. Doi file download tu static `/uploads` sang endpoint co authz.
6. Them audit log cho `PUT /api/config`, `POST /api/documents`, `DELETE /api/documents/:id`.
7. Them KPI action overdue va dashboard theo thang.
8. Them export Excel/PDF cho audit va action.
