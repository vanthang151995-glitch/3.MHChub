-- Create a database dedicated to MHChub.
-- Do not reuse the IoT/PLC database such as `plc_monitoring`.

CREATE DATABASE IF NOT EXISTS mhchub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Run the auth migration against this database:
-- mysql -h 127.0.0.1 -P 3308 -u root mhchub < database/migrations/001_auth_schema.sql
-- mysql -h 127.0.0.1 -P 3308 -u root mhchub < database/migrations/002_documents_schema.sql
-- mysql -h 127.0.0.1 -P 3308 -u root mhchub < database/migrations/003_app_settings_schema.sql
