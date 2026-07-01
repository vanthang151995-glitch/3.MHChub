-- MHChub Safety architecture extension.
-- Adds document intelligence, audit, CAPA, locations/QR, training matrix, and generic logs.

CREATE TABLE IF NOT EXISTS safety_divisions (
  code VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_safety_divisions_active (active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS safety_departments (
  code VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  division_code VARCHAR(32) NOT NULL,
  manager_name VARCHAR(191) NULL,
  headcount INT NOT NULL DEFAULT 0,
  safety_target DECIMAL(7,2) NOT NULL DEFAULT 90,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_safety_departments_division (division_code),
  KEY idx_safety_departments_active (active, division_code),
  CONSTRAINT fk_safety_departments_division
    FOREIGN KEY (division_code) REFERENCES safety_divisions(code)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS safety_document_text_chunks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  document_id VARCHAR(64) NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  source_page VARCHAR(64) NULL,
  text_content MEDIUMTEXT NOT NULL,
  extraction_method VARCHAR(64) NOT NULL DEFAULT 'manual',
  ocr_status VARCHAR(64) NOT NULL DEFAULT 'indexed',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_safety_document_chunk (document_id, chunk_index),
  FULLTEXT KEY ft_safety_document_text (text_content),
  KEY idx_safety_document_text_document (document_id),
  KEY idx_safety_document_text_status (ocr_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS safety_locations (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  department_code VARCHAR(32) NOT NULL,
  area_type VARCHAR(64) NOT NULL DEFAULT 'area',
  parent_id VARCHAR(64) NULL,
  qr_code VARCHAR(120) NOT NULL,
  risk_level VARCHAR(64) NOT NULL DEFAULT 'medium',
  description TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_id VARCHAR(64) NULL,
  created_by_name VARCHAR(191) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_safety_locations_code (code),
  UNIQUE KEY uq_safety_locations_qr (qr_code),
  KEY idx_safety_locations_department (department_code),
  KEY idx_safety_locations_parent (parent_id),
  KEY idx_safety_locations_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS safety_audit_templates (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  document_id VARCHAR(64) NULL,
  document_code VARCHAR(64) NULL,
  scope_level VARCHAR(32) NOT NULL DEFAULT 'department',
  template_type VARCHAR(64) NOT NULL DEFAULT '6s-audit',
  version VARCHAR(64) NOT NULL DEFAULT '1.0',
  status VARCHAR(64) NOT NULL DEFAULT 'active',
  owner_role VARCHAR(64) NOT NULL DEFAULT 'ehs',
  description TEXT NULL,
  created_by_id VARCHAR(64) NULL,
  created_by_name VARCHAR(191) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_safety_audit_template_code (code),
  KEY idx_safety_audit_template_status (status),
  KEY idx_safety_audit_template_scope (scope_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS safety_audit_questions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  template_id VARCHAR(64) NOT NULL,
  pillar VARCHAR(16) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  question TEXT NOT NULL,
  expected_standard TEXT NULL,
  max_score DECIMAL(7,2) NOT NULL DEFAULT 5,
  required_evidence TINYINT(1) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_safety_audit_questions_template (template_id, sort_order),
  KEY idx_safety_audit_questions_pillar (pillar),
  CONSTRAINT fk_safety_audit_questions_template
    FOREIGN KEY (template_id) REFERENCES safety_audit_templates(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS safety_audits (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  template_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  department_code VARCHAR(32) NOT NULL,
  location_id VARCHAR(64) NULL,
  scope_level VARCHAR(32) NOT NULL DEFAULT 'department',
  period VARCHAR(64) NULL,
  scheduled_date DATE NULL,
  performed_at DATETIME NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'draft',
  total_score DECIMAL(9,2) NOT NULL DEFAULT 0,
  max_score DECIMAL(9,2) NOT NULL DEFAULT 0,
  score_percent DECIMAL(7,2) NOT NULL DEFAULT 0,
  reviewer_id VARCHAR(64) NULL,
  reviewer_name VARCHAR(191) NULL,
  reviewed_at DATETIME NULL,
  review_note TEXT NULL,
  created_by_id VARCHAR(64) NULL,
  created_by_name VARCHAR(191) NULL,
  updated_by_name VARCHAR(191) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_safety_audits_code (code),
  KEY idx_safety_audits_department (department_code),
  KEY idx_safety_audits_template (template_id),
  KEY idx_safety_audits_status (status),
  KEY idx_safety_audits_period (period),
  KEY idx_safety_audits_schedule (scheduled_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS safety_audit_answers (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  audit_id VARCHAR(64) NOT NULL,
  question_id VARCHAR(64) NOT NULL,
  score DECIMAL(7,2) NOT NULL DEFAULT 0,
  result_status VARCHAR(64) NOT NULL DEFAULT 'pending',
  finding TEXT NULL,
  evidence_notes TEXT NULL,
  action_required TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_safety_audit_answer (audit_id, question_id),
  KEY idx_safety_audit_answers_audit (audit_id),
  KEY idx_safety_audit_answers_status (result_status),
  CONSTRAINT fk_safety_audit_answers_audit
    FOREIGN KEY (audit_id) REFERENCES safety_audits(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS safety_actions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  source_type VARCHAR(64) NOT NULL DEFAULT 'manual',
  source_id VARCHAR(64) NULL,
  source_code VARCHAR(64) NULL,
  department_code VARCHAR(32) NOT NULL,
  location_id VARCHAR(64) NULL,
  priority VARCHAR(64) NOT NULL DEFAULT 'medium',
  status VARCHAR(64) NOT NULL DEFAULT 'open',
  owner_id VARCHAR(64) NULL,
  owner_name VARCHAR(191) NULL,
  due_date DATE NULL,
  completed_at DATETIME NULL,
  verified_by_id VARCHAR(64) NULL,
  verified_by_name VARCHAR(191) NULL,
  verified_at DATETIME NULL,
  evidence_notes TEXT NULL,
  verification_note TEXT NULL,
  created_by_id VARCHAR(64) NULL,
  created_by_name VARCHAR(191) NULL,
  updated_by_name VARCHAR(191) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_safety_actions_code (code),
  KEY idx_safety_actions_department (department_code),
  KEY idx_safety_actions_status (status),
  KEY idx_safety_actions_priority (priority),
  KEY idx_safety_actions_due_date (due_date),
  KEY idx_safety_actions_source (source_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS safety_training_requirements (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(120) NOT NULL,
  required_for_scope VARCHAR(64) NOT NULL DEFAULT 'department',
  department_code VARCHAR(32) NULL,
  role_name VARCHAR(120) NULL,
  document_id VARCHAR(64) NULL,
  frequency_months INT NOT NULL DEFAULT 12,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_safety_training_requirement_code (code),
  KEY idx_safety_training_requirement_scope (required_for_scope, department_code),
  KEY idx_safety_training_requirement_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS safety_training_records (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  requirement_id VARCHAR(64) NOT NULL,
  employee_code VARCHAR(64) NULL,
  employee_name VARCHAR(191) NOT NULL,
  department_code VARCHAR(32) NOT NULL,
  completed_at DATE NULL,
  expires_at DATE NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'pending',
  evidence_document_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_safety_training_records_requirement (requirement_id),
  KEY idx_safety_training_records_department (department_code),
  KEY idx_safety_training_records_status (status),
  KEY idx_safety_training_records_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS safety_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  action VARCHAR(64) NOT NULL,
  actor_id VARCHAR(64) NULL,
  actor_name VARCHAR(191) NULL,
  actor_role VARCHAR(64) NULL,
  actor_dept VARCHAR(64) NULL,
  summary TEXT NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL,
  KEY idx_safety_audit_logs_entity (entity_type, entity_id),
  KEY idx_safety_audit_logs_created (created_at),
  KEY idx_safety_audit_logs_actor (actor_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
