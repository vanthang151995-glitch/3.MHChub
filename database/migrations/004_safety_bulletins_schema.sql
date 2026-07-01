-- MHChub safety bulletin schema.
-- Stores bulletin content and edit history in the dedicated `mhchub` database.

CREATE TABLE IF NOT EXISTS safety_bulletins (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  bulletin_date DATE NULL,
  tone VARCHAR(16) NOT NULL DEFAULT 'watch',
  title_json LONGTEXT NOT NULL,
  summary_json LONGTEXT NULL,
  points_json LONGTEXT NULL,
  audience_json LONGTEXT NULL,
  groups_json LONGTEXT NULL,
  document_id VARCHAR(64) NULL,
  document_url VARCHAR(500) NULL,
  published TINYINT(1) NOT NULL DEFAULT 1,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_by VARCHAR(191) NULL,
  deleted_by_name VARCHAR(191) NULL,
  deleted_by_role VARCHAR(32) NULL,
  deleted_at DATETIME NULL,
  created_by VARCHAR(191) NULL,
  created_by_name VARCHAR(191) NULL,
  created_by_role VARCHAR(32) NULL,
  created_at DATETIME NOT NULL,
  updated_by VARCHAR(191) NULL,
  updated_by_name VARCHAR(191) NULL,
  updated_by_role VARCHAR(32) NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_safety_bulletins_date (bulletin_date),
  KEY idx_safety_bulletins_published (published),
  KEY idx_safety_bulletins_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS safety_bulletin_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bulletin_id VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL,
  actor VARCHAR(191) NULL,
  actor_name VARCHAR(191) NULL,
  actor_role VARCHAR(32) NULL,
  before_json LONGTEXT NULL,
  after_json LONGTEXT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_safety_bulletin_logs_bulletin (bulletin_id),
  KEY idx_safety_bulletin_logs_created_at (created_at),
  CONSTRAINT fk_safety_bulletin_logs_bulletin
    FOREIGN KEY (bulletin_id) REFERENCES safety_bulletins (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
