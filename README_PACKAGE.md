MHChub packaged release
======================

This archive contains the application source, documentation, and database SQL dumps suitable for restoring a demo or production database.

Included files/folders (when present):
- `package.json`, `README.md`
- `src/`, `server/`, `public/`, `scripts/`
- `database/` (SQL dumps and migration files)
- `docs/` (project documentation)
- `PACKAGE_MANIFEST.txt` (list of included files)

How to create the package (Windows PowerShell):

```powershell
# from repository root
.\package_system.ps1
# to include a live database export (will prompt for credentials):
.\package_system.ps1 -IncludeDb
```

Output: `release/mhchub_package_YYYYMMDD_HHMMSS.zip`

How to restore the database (MySQL example):

1. Extract the zip and locate the SQL file(s) in the `database` folder.
2. Create the target database (if not exists):

```powershell
mysql -u <user> -p -e "CREATE DATABASE IF NOT EXISTS mhchub;"
```

3. Import the SQL dump:

```powershell
mysql -u <user> -p mhchub < path\to\database\mhchub-data-YYYYMMDD.sql
```

Notes and next steps:
- The packaging script copies files it finds; verify `database/` contains the SQL you want included.
 - If you need automated DB export from a live server, the packaging script can run an interactive export when called with `-IncludeDb`.
 - For unattended environments (CI) we can add support for environment variables or secrets to provide DB credentials, but that requires careful secret handling.
