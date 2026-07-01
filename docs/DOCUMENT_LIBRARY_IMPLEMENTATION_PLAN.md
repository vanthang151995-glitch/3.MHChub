# Document Library Implementation Plan

## Muc tieu

Xay dung thu vien tai lieu 6S/Safety lam noi luu tru, tim kiem, xem thong tin va tai ve cac file PDF, Word, Excel, PowerPoint, anh va CSV. He thong can phu hop giai doan dau gom file thu cong vao mot folder, nhung van du kha nang nang cap ve sau sang MySQL/NAS/object storage.

## Trang thai hien tai

- Frontend da co trang `/documents` de upload, loc, tim kiem, hien thi danh sach va tai file.
- Backend da co API:
  - `GET /api/documents`
  - `POST /api/documents`
  - `DELETE /api/documents/:id`
- File upload dang luu trong `server/uploads`.
- Metadata dang luu trong `server/data/documents.json`.
- Upload hien ho tro: `pdf`, `doc`, `docx`, `xls`, `xlsx`, `ppt`, `pptx`, `png`, `jpg`, `jpeg`, `txt`, `csv`.
- Quyen quan ly upload/xoa dang theo role: `admin`, `ehs`, `leader`; nhan vien xem/tai.

## Nguyen tac luu tru

Khong nen chi copy file vao `server/uploads` vi app can metadata de tim kiem, loc, gan bo phan, version va tao link tai ve. File vat ly va metadata phai di cung nhau.

Mo hinh dung cho giai doan dau:

```text
server/uploads/                 # file vat ly da import/upload
server/data/documents.json       # metadata tai lieu
```

Mo hinh gom file truoc khi import:

```text
_incoming-documents/
  6s/
    00-company/
    01-sang-loc/
    02-sap-xep/
    03-sach-se/
    04-san-soc/
    05-san-sang/
    06-an-toan/
    departments/
      production/
      warehouse/
      maintenance/
  safety/
    quy-dinh/
    huong-dan/
    dao-tao/
  forms/
    checklist/
    bieu-mau/
```

Quy tac dat ten file staging:

```text
<category>__<department>__<title-slug>__v<version>__<language>__<yyyymmdd>.<ext>
```

Vi du:

```text
6s__production__checklist-khu-vuc-san-xuat__v1.0__vi__20260529.xlsx
safety__company__quy-dinh-an-toan-co-ban__v1.0__vi__20260529.pdf
training__maintenance__huong-dan-kiem-tra-6s__v1.0__vi__20260529.pptx
```

## Metadata can chuan hoa

Moi tai lieu nen co cac truong toi thieu:

```json
{
  "id": "uuid",
  "title": "6S checklist - khu vuc san xuat",
  "category": "6s",
  "departmentId": "production",
  "language": "vi",
  "version": "1.0",
  "originalName": "6s__production__checklist-khu-vuc-san-xuat__v1.0__vi__20260529.xlsx",
  "fileName": "2026-05-29T...-6s-production-checklist.xlsx",
  "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "size": 123456,
  "uploadedAt": "2026-05-29T00:00:00.000Z",
  "url": "/uploads/2026-05-29T...-6s-production-checklist.xlsx"
}
```

Nen bo sung o giai doan 2:

- `documentType`: `procedure`, `checklist`, `form`, `training`, `report`, `image`, `other`
- `section6s`: `sang-loc`, `sap-xep`, `sach-se`, `san-soc`, `san-sang`, `an-toan`
- `effectiveDate`
- `ownerRole`
- `tags`
- `checksum`
- `isActive`
- `supersedesDocumentId`

## Ke hoach trien khai

### Phase 1 - Gom file va import co kiem soat

Muc tieu: dua tai lieu dang co vao he thong ma khong lam hong file goc.

Viec can lam:

1. Tao folder `_incoming-documents/` de anh copy file vao.
2. Tao file manifest `docs/document-import-template.csv` hoac Excel voi cac cot:
   - `sourcePath`
   - `title`
   - `category`
   - `departmentId`
   - `language`
   - `version`
   - `documentType`
   - `section6s`
   - `tags`
3. Viet script import:
   - Doc manifest.
   - Kiem tra file ton tai.
   - Kiem tra dinh dang hop le.
   - Copy file vao `server/uploads`.
   - Tao metadata vao `server/data/documents.json`.
   - Khong xoa file goc trong `_incoming-documents`.
4. Tao log import de biet file nao thanh cong/loi.

Ket qua mong muon:

- Danh sach tai lieu hien trong `/documents`.
- Co the loc theo category/department.
- Co nut tai file ve.

### Phase 2 - Nang cap giao dien thu vien 6S

Muc tieu: trang tai lieu dung tot cho nhan vien san xuat, EHS va leader.

Viec can lam:

1. Them bo loc:
   - Nhom 6S.
   - Loai file.
   - Bo phan.
   - Version/hieu luc.
   - Ngon ngu.
2. Hien thi icon theo loai file:
   - PDF, Word, Excel, PowerPoint, Image.
3. Them trang chi tiet tai lieu:
   - Thong tin file.
   - Version.
   - Bo phan ap dung.
   - Tai ve.
   - Tai lieu lien quan.
4. Preview:
   - PDF va anh co the xem nhanh trong trinh duyet.
   - Word/Excel/PowerPoint truoc mat uu tien tai ve; preview de giai doan sau.

### Phase 3 - Bao tri version va phan quyen

Muc tieu: khong bi nham tai lieu cu/moi.

Viec can lam:

1. Them trang thai `active/archived`.
2. Khi upload version moi, tai lieu cu duoc archive hoac lien ket bang `supersedesDocumentId`.
3. Phan quyen:
   - `viewer`: xem/tai.
   - `leader`: upload tai lieu bo phan minh.
   - `ehs`: upload/sua/xoa tai lieu 6S/Safety.
   - `admin`: toan quyen.
4. Ghi audit log upload/delete/update.

### Phase 4 - Chuyen metadata sang MySQL

Muc tieu: tim kiem nhanh, quan ly version tot, backup/restore chuan hon.

Bang de xuat:

```sql
documents (
  id varchar(64) primary key,
  title varchar(255) not null,
  category varchar(64) not null,
  department_id varchar(64) not null,
  language varchar(16) not null,
  version varchar(32) not null,
  document_type varchar(64),
  section_6s varchar(64),
  original_name varchar(255) not null,
  file_name varchar(255) not null,
  mime_type varchar(160) not null,
  size_bytes bigint not null,
  checksum_sha256 varchar(64),
  url varchar(512) not null,
  tags json,
  is_active boolean not null default true,
  uploaded_by varchar(64),
  uploaded_at datetime not null,
  updated_at datetime null
)
```

File vat ly van nen o filesystem/NAS, khong nen luu file PDF/Word/Excel truc tiep trong database.

### Phase 5 - Backup va van hanh

Muc tieu: tai lieu khong mat du lieu va phuc hoi duoc.

Viec can lam:

1. Backup hang ngay:
   - `server/uploads`
   - `server/data/documents.json` hoac bang MySQL `documents`
2. Tao job health check:
   - Metadata co file vat ly khong.
   - File vat ly co metadata khong.
   - Tong dung luong upload.
   - File trung checksum.
3. Tao chuc nang export manifest.
4. Gioi han upload theo dung luong va dinh dang.

## De xuat uu tien gan nhat

Lam theo thu tu:

1. Tao `_incoming-documents/` va template manifest.
2. Viet script import hang loat.
3. Nang cap metadata `documents.json` them `documentType`, `section6s`, `tags`, `checksum`.
4. Nang cap UI `/documents` de loc theo 6S va loai file.
5. Them trang chi tiet tai lieu va preview PDF/image.
6. Sau khi dung on dinh, chuyen metadata sang MySQL.

## Kiem thu can co

- Upload thu PDF, Word, Excel, PowerPoint thanh cong.
- File sai dinh dang bi tu choi.
- Danh sach tai lieu loc dung theo category/department.
- Link tai ve hoat dong.
- Xoa tai lieu xoa ca metadata va file vat ly.
- Import hang loat khong lam mat file goc.
- Backup co du metadata va file upload.

## Quyet dinh hien tai

Giai doan dau nen dung filesystem + JSON metadata vi nhanh va phu hop app hien tai. Khong can dua file vao database. Khi tai lieu nhieu, can audit version va tim kiem manh hon thi chuyen metadata sang MySQL, file vat ly de tren server/NAS.
