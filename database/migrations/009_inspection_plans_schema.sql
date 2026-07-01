-- Migration 009: Bảng Inspection Plans (MySQL).
-- Chuyển dữ liệu từ server/data/safety-operations.json → MySQL.
-- Cấu trúc 4 bảng: kế hoạch → hạng mục → phát hiện → hành động khắc phục.

-- ============================================================
-- inspection_plans — kế hoạch kiểm tra tổng thể
-- ============================================================
CREATE TABLE IF NOT EXISTS inspection_plans (
  id                    VARCHAR(64)    NOT NULL PRIMARY KEY,
  code                  VARCHAR(64)    NOT NULL,
  title                 VARCHAR(255)   NOT NULL,
  title_i18n_json       LONGTEXT       NULL,
  plan_type             VARCHAR(64)    NOT NULL DEFAULT 'periodic',
  -- periodic | unscheduled | special
  period                VARCHAR(8)     NOT NULL,
  -- YYYY-MM
  scope_level           VARCHAR(32)    NOT NULL DEFAULT 'company',
  -- company | division | department
  scope_code            VARCHAR(32)    NULL,
  -- division_code hoặc department_code nếu scope < company
  scheduled_date        DATE           NULL,
  actual_date           DATE           NULL,
  lead_inspector_id     VARCHAR(64)    NULL,
  lead_inspector_name   VARCHAR(191)   NULL,
  lead_inspector_name_i18n_json LONGTEXT NULL,
  description           TEXT           NULL,
  description_i18n_json LONGTEXT       NULL,
  objectives            TEXT           NULL,
  objectives_i18n_json  LONGTEXT       NULL,
  conclusion            TEXT           NULL,
  conclusion_i18n_json  LONGTEXT       NULL,
  overall_score         DECIMAL(7,2)   NOT NULL DEFAULT 0,
  max_score             DECIMAL(7,2)   NOT NULL DEFAULT 0,
  score_percent         DECIMAL(7,2)   NOT NULL DEFAULT 0,
  status                VARCHAR(32)    NOT NULL DEFAULT 'planned',
  -- planned | in_progress | completed | cancelled
  approval_status       VARCHAR(64)    NOT NULL DEFAULT 'pending',
  -- pending | approved | rejected
  approved_by_id        VARCHAR(64)    NULL,
  approved_by_name      VARCHAR(191)   NULL,
  approved_at           DATETIME       NULL,
  rejection_reason      TEXT           NULL,
  rejection_reason_i18n_json LONGTEXT  NULL,
  submitted_by_id       VARCHAR(64)    NULL,
  submitted_by_name     VARCHAR(191)   NULL,
  created_by_id         VARCHAR(64)    NULL,
  created_by_name       VARCHAR(191)   NULL,
  updated_by_name       VARCHAR(191)   NULL,
  deleted_by_name       VARCHAR(191)   NULL,
  created_at            DATETIME       NOT NULL,
  updated_at            DATETIME       NOT NULL,
  deleted_at            DATETIME       NULL,

  UNIQUE KEY uq_inspection_plans_code        (code),
  KEY idx_inspection_plans_period            (period),
  KEY idx_inspection_plans_status            (status),
  KEY idx_inspection_plans_approval          (approval_status),
  KEY idx_inspection_plans_scheduled_date    (scheduled_date),
  KEY idx_inspection_plans_scope             (scope_level, scope_code),
  KEY idx_inspection_plans_updated_at        (updated_at),
  KEY idx_inspection_plans_deleted_at        (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- inspection_plan_items — hạng mục kiểm tra (template/pillar)
-- Mỗi kế hoạch có nhiều hạng mục (6S pillars, ATVSLD items…).
-- ============================================================
CREATE TABLE IF NOT EXISTS inspection_plan_items (
  id                    VARCHAR(64)    NOT NULL PRIMARY KEY,
  plan_id               VARCHAR(64)    NOT NULL,
  sort_order            INT            NOT NULL DEFAULT 0,
  pillar                VARCHAR(32)    NOT NULL DEFAULT 'general',
  -- general | seiri | seiton | seiso | seiketsu | shitsuke | antoàn
  item_code             VARCHAR(64)    NULL,
  title                 VARCHAR(255)   NOT NULL,
  title_i18n_json       LONGTEXT       NULL,
  description           TEXT           NULL,
  description_i18n_json LONGTEXT       NULL,
  standard_ref          VARCHAR(255)   NULL,
  -- tiêu chuẩn tham chiếu (số hiệu QĐ, ISO, v.v.)
  standard_ref_i18n_json LONGTEXT      NULL,
  max_score             DECIMAL(7,2)   NOT NULL DEFAULT 5,
  required_evidence     TINYINT(1)     NOT NULL DEFAULT 0,
  active                TINYINT(1)     NOT NULL DEFAULT 1,
  created_at            DATETIME       NOT NULL,
  updated_at            DATETIME       NOT NULL,

  KEY idx_iplan_items_plan        (plan_id, sort_order),
  KEY idx_iplan_items_pillar      (pillar),
  CONSTRAINT fk_iplan_items_plan
    FOREIGN KEY (plan_id) REFERENCES inspection_plans(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- inspection_plan_findings — kết quả từng hạng mục × bộ phận
-- ============================================================
CREATE TABLE IF NOT EXISTS inspection_plan_findings (
  id                    VARCHAR(64)    NOT NULL PRIMARY KEY,
  plan_id               VARCHAR(64)    NOT NULL,
  item_id               VARCHAR(64)    NOT NULL,
  department_code       VARCHAR(32)    NOT NULL,
  inspector_id          VARCHAR(64)    NULL,
  inspector_name        VARCHAR(191)   NULL,
  score                 DECIMAL(7,2)   NOT NULL DEFAULT 0,
  result_status         VARCHAR(32)    NOT NULL DEFAULT 'nc',
  -- ok | nc | critical | na
  finding               TEXT           NULL,
  finding_i18n_json     LONGTEXT       NULL,
  -- mô tả phát hiện bằng VI/JA/EN
  evidence_notes        TEXT           NULL,
  evidence_notes_i18n_json LONGTEXT    NULL,
  photo_count           INT            NOT NULL DEFAULT 0,
  inspected_at          DATETIME       NULL,
  created_at            DATETIME       NOT NULL,
  updated_at            DATETIME       NOT NULL,

  UNIQUE KEY uq_iplan_finding        (plan_id, item_id, department_code),
  KEY idx_iplan_findings_plan        (plan_id),
  KEY idx_iplan_findings_dept        (department_code),
  KEY idx_iplan_findings_status      (result_status),
  KEY idx_iplan_findings_item        (item_id),
  CONSTRAINT fk_iplan_findings_plan
    FOREIGN KEY (plan_id) REFERENCES inspection_plans(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_iplan_findings_item
    FOREIGN KEY (item_id) REFERENCES inspection_plan_items(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- inspection_plan_actions — hành động khắc phục từ phát hiện
-- ============================================================
CREATE TABLE IF NOT EXISTS inspection_plan_actions (
  id                      VARCHAR(64)    NOT NULL PRIMARY KEY,
  code                    VARCHAR(64)    NOT NULL,
  plan_id                 VARCHAR(64)    NOT NULL,
  finding_id              VARCHAR(64)    NULL,
  -- NULL = hành động tổng hợp cấp kế hoạch
  department_code         VARCHAR(32)    NOT NULL,
  title                   VARCHAR(255)   NOT NULL,
  title_i18n_json         LONGTEXT       NULL,
  description             TEXT           NULL,
  description_i18n_json   LONGTEXT       NULL,
  priority                VARCHAR(32)    NOT NULL DEFAULT 'medium',
  -- low | medium | high | critical
  status                  VARCHAR(32)    NOT NULL DEFAULT 'open',
  -- open | in_progress | completed | verified | overdue
  owner_id                VARCHAR(64)    NULL,
  owner_name              VARCHAR(191)   NULL,
  owner_name_i18n_json    LONGTEXT       NULL,
  due_date                DATE           NULL,
  completed_at            DATETIME       NULL,
  evidence_notes          TEXT           NULL,
  evidence_notes_i18n_json LONGTEXT      NULL,
  verified_by_id          VARCHAR(64)    NULL,
  verified_by_name        VARCHAR(191)   NULL,
  verified_at             DATETIME       NULL,
  verification_note       TEXT           NULL,
  verification_note_i18n_json LONGTEXT   NULL,
  created_by_id           VARCHAR(64)    NULL,
  created_by_name         VARCHAR(191)   NULL,
  updated_by_name         VARCHAR(191)   NULL,
  created_at              DATETIME       NOT NULL,
  updated_at              DATETIME       NOT NULL,
  deleted_at              DATETIME       NULL,

  UNIQUE KEY uq_iplan_actions_code       (code),
  KEY idx_iplan_actions_plan             (plan_id),
  KEY idx_iplan_actions_finding          (finding_id),
  KEY idx_iplan_actions_dept             (department_code),
  KEY idx_iplan_actions_status           (status),
  KEY idx_iplan_actions_priority         (priority),
  KEY idx_iplan_actions_due_date         (due_date),
  KEY idx_iplan_actions_updated_at       (updated_at),
  CONSTRAINT fk_iplan_actions_plan
    FOREIGN KEY (plan_id) REFERENCES inspection_plans(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- inspection_plan_dept_scores — điểm tổng hợp theo bộ phận × kế hoạch
-- Bảng denormalized để truy vấn báo cáo nhanh.
-- ============================================================
CREATE TABLE IF NOT EXISTS inspection_plan_dept_scores (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  plan_id             VARCHAR(64)     NOT NULL,
  department_code     VARCHAR(32)     NOT NULL,
  total_score         DECIMAL(9,2)    NOT NULL DEFAULT 0,
  max_score           DECIMAL(9,2)    NOT NULL DEFAULT 0,
  score_percent       DECIMAL(7,2)    NOT NULL DEFAULT 0,
  nc_count            INT             NOT NULL DEFAULT 0,
  critical_count      INT             NOT NULL DEFAULT 0,
  ok_count            INT             NOT NULL DEFAULT 0,
  open_actions        INT             NOT NULL DEFAULT 0,
  rank_in_plan        INT             NULL,
  updated_at          DATETIME        NOT NULL,

  UNIQUE KEY uq_iplan_dept_score     (plan_id, department_code),
  KEY idx_iplan_dept_score_plan      (plan_id),
  KEY idx_iplan_dept_score_dept      (department_code),
  KEY idx_iplan_dept_score_percent   (score_percent),
  CONSTRAINT fk_iplan_dept_score_plan
    FOREIGN KEY (plan_id) REFERENCES inspection_plans(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
