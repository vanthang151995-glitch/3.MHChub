# Safety - 6S Mock Data Guide

Ngay tao: 2026-06-06

Bo du lieu nay dung de gia lap cac van de nong, su co, KPI va checklist An toan - 6S phuc vu tong hop du lieu va ve bieu do.

## File trong bo du lieu

- `docs/mock-data/safety-6s-mock-issues.csv`: danh sach 18 van de/canh bao nong, co bo phan, khu vuc, tru cot 6S, muc do rui ro, deadline, owner va bien phap.
- `docs/mock-data/safety-6s-chart-series.csv`: chuoi so lieu theo thang va bo phan de ve line chart, bar chart, heatmap hoac KPI cards.
- `database/seeds/006_safety_6s_mock_data.sql`: seed MySQL cho cac bang `safety_warnings`, `safety_incidents`, `safety_kpi_entries`, `safety_checklist_submissions`, `safety_reports`, `safety_training_courses`.
- `database/seeds/006_safety_6s_mock_data_cleanup.sql`: xoa rieng cac dong mock theo prefix `mock-*` neu can lam sach sau khi test.

## Nhom van de nong de tong hop

1. An toan co khi/may moc: day deo the gan co cau quay, jig sac canh, thieu LOTO khi ve sinh cam bien.
2. Loi di va PCCC: pallet che thiet bi PCCC, loi thoat hiem bi chan, vach xe nang mo.
3. Hoa chat va moi truong: chai hoa chat thieu nhan/SDS, dau bao tri khong co khay chong tran.
4. 6S hien truong: dung cu khong ve dung vi tri, lan mau NG/OK, FIFO sai nhan.
5. Quan tri he thong: TBM chua cap nhat, pho bien noi dung hop an toan chua du bang chung.

## Goi y bieu do

- KPI tong quan: `safety_score`, `sixs_completion_rate`, `training_rate`, `action_completion_rate`.
- Bieu do duong 6 thang: lay `safety_score` theo `period`, loc theo `department`.
- Bar chart bo phan: so sanh `open_warnings`, `overdue_warnings`, `incidents`, `near_miss_count`.
- Heatmap 6S: dung `sixs_completion_rate` theo `department` va `period`.
- Pareto van de: gom nhom `safety-6s-mock-issues.csv` theo `sixs_pillar`, `category`, `risk_level`.

## Import vao MySQL

Chay migration Safety truoc, sau do import seed:

```powershell
mysql --default-character-set=utf8mb4 -u <user> -p <database> < database/seeds/006_safety_6s_mock_data.sql
```

Seed dung key co dinh va `ON DUPLICATE KEY UPDATE`, nen co the chay lai khi can lam moi du lieu mau.

Neu muon xoa du lieu mock sau khi test:

```powershell
mysql --default-character-set=utf8mb4 -u <user> -p <database> < database/seeds/006_safety_6s_mock_data_cleanup.sql
```
