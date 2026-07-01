# MHChub home install package

Huong dan nay dung cho goi zip `MHChub-home-install-*.zip`.

## Goi zip co gi

- Ma nguon frontend/backend, `package.json`, `package-lock.json`.
- Ban build san trong `dist/`.
- Cau hinh runtime hien tai: `server/data/config.json`, `server/data/documents.json`.
- SQL tao database rieng `mhchub` va migration bang auth trong `database/`.
- Script cai dat va chay tren Windows trong `setup/home-install/`.

## Goi zip khong chua gi

- Khong chua `.env` that.
- Khong chua `node_modules`.
- Khong chua database MySQL, user auth runtime, log, backup, QA screenshot.
- Khong chua file upload tai lieu neu thu muc `server/uploads` dang rong.

## Yeu cau tren may nha

1. Windows 10/11.
2. Node.js LTS da cai san. Kiem tra bang:

   ```powershell
   node -v
   npm -v
   ```

3. MySQL hoac MariaDB neu muon dung database auth. Neu chon khong dung MySQL, app se dung auth JSON cuc bo trong `server/data/auth`.

## Cai dat nhanh

1. Giai nen zip vao thu muc mong muon, vi du `D:\MHChub`.
2. Mo PowerShell tai thu muc vua giai nen.
3. Cho phep chay script trong phien hien tai:

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   ```

4. Chay script cai dat:

   ```powershell
   .\setup\home-install\install-home-windows.ps1
   ```

5. Chay he thong:

   ```powershell
   .\setup\home-install\start-mhchub-windows.ps1
   ```

6. Mo trinh duyet:

   ```text
   http://localhost:3333
   ```

## Tu chay cung Windows bang service

Neu may bi mat dien va can web tu chay lai sau khi Windows boot, hay cai MHChub thanh Windows service bang NSSM.
Mo PowerShell bang quyen Administrator tai thu muc app, sau do chay:

```powershell
.\setup\home-install\install-mhchub-service-windows.ps1 -Start
```

Service mac dinh:

- Ten service: `MHChub`
- Che do khoi dong: `Automatic (Delayed Start)`
- Lenh chay: `node server/index.js`
- Thu muc lam viec: thu muc app hien tai
- Log: `logs\mhchub-service.out.log` va `logs\mhchub-service.err.log`
- Khi app Node thoat loi, NSSM tu restart sau 5 giay.
- Khi Windows service fail, SCM tu restart 3 lan voi do tre 60s/60s/120s.

Kiem tra service:

```powershell
Get-Service MHChub
npm run ops:service:check
.\setup\home-install\check-mhchub-service-windows.ps1
.\setup\home-install\health-check-windows.ps1
```

Script `check-mhchub-service-windows.ps1` chi doc trang thai, khong restart/stop service. Ket qua can thay: service dang chay, `Automatic (Delayed Start)`, co recovery restart, va `/api/health` tra loi dung cong `.env` hoac `3333`.

Neu chi muon ghi diagnostic vao QA report ma khong lam dung `npm run verify`, dung:

```powershell
npm run ops:service:diagnose
```

Lenh nay van ghi ro `serviceOk`, loi recovery/readiness va goi y khac phuc trong `qa\reports\mhchub-service-check.json`, nhung thoat thanh cong de verify tong co the tiep tuc.
Neu `/api/ready` tra `503`, report se parse noi dung JSON va hien dung check dang do, vi du `admin-password (ADMIN_PASSWORD)`, thay vi chi bao loi HTTP chung chung.

Neu check bao thieu recovery restart, chay preview truoc:

```powershell
npm run ops:service:repair-preview
```

Sau do mo PowerShell bang quyen Administrator va ap dung:

```powershell
npm run ops:service:repair-apply
```

Script repair chi bat recovery cua Windows service, khong restart service.

Go service neu can rollback:

```powershell
.\setup\home-install\uninstall-mhchub-service-windows.ps1 -Stop
```

## Kiem tra suc khoe

Sau khi server dang chay, mo PowerShell khac tai thu muc app va chay:

```powershell
.\setup\home-install\health-check-windows.ps1
```

Neu `/api/ready` bao `ADMIN_PASSWORD` chua dat, hay dat lai mat khau admin va secret web:

```powershell
npm run ops:secrets
.\scripts\restart-clean.ps1 -SkipBuild
npm run ops:health -- -BaseUrl http://127.0.0.1:3333 -StrictReady
```

Script `ops:secrets` se khong in mat khau ra man hinh, se backup `.env` vao `backups\ops\...`, dong bo lai user admin trong MySQL/JSON, va tu tao `WEB_AUTH_SECRET` manh neu secret hien tai bi thieu/yeu.

## Don file build cu trong dist/assets

Neu may tung build nhieu lan, `dist/assets` co the con file JS/CSS cu khong duoc web hien tai tham chieu. Day khong anh huong app, nhung co the lam thu muc local phinh ra.

Chay preview truoc:

```powershell
npm run ops:dist:cleanup-preview
```

Preview se ghi ro:

- user hien tai co phai Administrator khong
- file stale mau dang thuoc owner nao
- thu muc `dist/assets` co tao/xoa file probe duoc khong
- ly do vi sao apply can PowerShell Administrator

Neu preview bao co stale assets va muon xoa that, mo PowerShell bang quyen Administrator tai thu muc app, sau do chay dung lenh preview goi y, vi du:

```powershell
.\scripts\clean-dist-stale-assets.ps1 -Apply -ConfirmStaleCount 434
```

Script chi xoa cac file stale do `scripts\audit-dist-assets.mjs` xac dinh, bat buoc nam trong `dist\assets`, va bat buoc `ConfirmStaleCount` khop voi preview moi nhat.

## Ghi chu MySQL

Script cai dat se hoi co dung MySQL khong.

- Chon `N` neu chi can chay thu tren may nha. App se tao user admin tu `.env` vao file JSON cuc bo.
- Chon `Y` neu may nha co MySQL/MariaDB. Script se ghi bien `MHCHUB_MYSQL_*` vao `.env`. Neu co `mysql.exe` trong PATH, script se thu tao database va bang auth.

Database cua MHChub nen la database rieng `mhchub`; khong dung chung database PLC/IoT khac.

## Dong goi lai o may cong ty

Tai thu muc project, chay:

```powershell
.\scripts\package-home-install.ps1
```

Zip moi se nam trong thu muc `release/`.
