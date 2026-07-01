# MHChub Handover Package

Created: 2026-07-01 09:23:23

## Included

- Application source and build configuration
- Server/API code and startup scripts
- Database schema, migrations, seeds, and SQL data dumps
- Project documentation under `docs/`
- Original Vietnamese source documents under `tai lieu/`
- Restore helper: `restore_db.ps1`

## Database

- Latest non-empty dump in this package: `database\mhchub-data-20260627084328.sql` (964.5 KB)

Restore example:

```powershell
powershell -ExecutionPolicy Bypass -File .\restore_db.ps1
```

## Run

```powershell
npm ci
npm run build
npm start
```

Create `.env` from `.env.example` on the target machine before starting the app.
