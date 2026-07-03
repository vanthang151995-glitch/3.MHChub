-- MHChub app settings schema.
-- Stores system configuration JSON in the dedicated `mhchub` database.

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
  value_json LONGTEXT NOT NULL,
  updated_by VARCHAR(191) NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_app_settings_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
