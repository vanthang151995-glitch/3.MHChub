Exporting the MySQL database
===========================

This document explains how to export your MySQL database to a SQL dump suitable for restoring on another machine.

Prerequisites:
- `mysqldump` must be installed and available on `PATH` (part of MySQL client tools).
- Run commands on the machine that has network access to the MySQL server.

Quick export (interactive password prompt):

```powershell
# from repository root
powershell -ExecutionPolicy Bypass -File scripts\export_mysql_local.ps1
```

The script will prompt for host, port, user, database name, and output file path. You will then be prompted for the MySQL password.

Result: a `.sql` file under `database/` (e.g. `database/mhchub-export-YYYYMMDD_HHMMSS.sql`).

Restore example (on the new machine):

```powershell
mysql -u <user> -p <database_name> < path\to\mhchub-export.sql
```

Security notes:
- Do not transmit SQL dumps containing private data over insecure channels. Use encrypted transfer (SCP/SFTP over SSH, or a secure file share).
- If you need me to include the latest dump into the repository package, run the export locally and then commit or place the SQL file into the `database/` folder; the packaging script will include it.

If you want, I can add an automated step to `package_system.ps1` to include a fresh export when run — I will need explicit permission and the method you prefer for authentication (interactive, env var, or CI secret).
