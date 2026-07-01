-- Migration 008: i18n hoàn chỉnh cho tất cả bảng còn thiếu.
-- Quy tắc: {"vi": "...", "ja": "...", "en": "..."}
-- vi = bắt buộc (fallback), ja = tiếng Nhật, en = tiếng Anh tuỳ chọn.
-- Legacy column (VARCHAR/TEXT) giữ nguyên làm nguồn FULLTEXT search.

-- ============================================================
-- safety_meetings
-- ============================================================
ALTER TABLE safety_meetings
  ADD COLUMN IF NOT EXISTS title_i18n_json          LONGTEXT NULL AFTER title,
  ADD COLUMN IF NOT EXISTS location_i18n_json        LONGTEXT NULL AFTER location,
  ADD COLUMN IF NOT EXISTS chairperson_i18n_json     LONGTEXT NULL AFTER chairperson,
  ADD COLUMN IF NOT EXISTS content_summary_i18n_json LONGTEXT NULL AFTER content_summary,
  ADD COLUMN IF NOT EXISTS decisions_i18n_json       LONGTEXT NULL AFTER decisions;

-- ============================================================
-- safety_actions
-- ============================================================
ALTER TABLE safety_actions
  ADD COLUMN IF NOT EXISTS title_i18n_json             LONGTEXT NULL AFTER title,
  ADD COLUMN IF NOT EXISTS description_i18n_json       LONGTEXT NULL AFTER description,
  ADD COLUMN IF NOT EXISTS evidence_notes_i18n_json    LONGTEXT NULL AFTER evidence_notes,
  ADD COLUMN IF NOT EXISTS verification_note_i18n_json LONGTEXT NULL AFTER verification_note;

-- ============================================================
-- safety_audit_templates
-- ============================================================
ALTER TABLE safety_audit_templates
  ADD COLUMN IF NOT EXISTS name_i18n_json        LONGTEXT NULL AFTER name,
  ADD COLUMN IF NOT EXISTS description_i18n_json LONGTEXT NULL AFTER description;

-- ============================================================
-- safety_audit_questions
-- ============================================================
ALTER TABLE safety_audit_questions
  ADD COLUMN IF NOT EXISTS question_i18n_json          LONGTEXT NULL AFTER question,
  ADD COLUMN IF NOT EXISTS expected_standard_i18n_json LONGTEXT NULL AFTER expected_standard;

-- ============================================================
-- safety_audit_answers
-- ============================================================
ALTER TABLE safety_audit_answers
  ADD COLUMN IF NOT EXISTS finding_i18n_json       LONGTEXT NULL AFTER finding,
  ADD COLUMN IF NOT EXISTS evidence_notes_i18n_json LONGTEXT NULL AFTER evidence_notes;

-- ============================================================
-- safety_audits
-- ============================================================
ALTER TABLE safety_audits
  ADD COLUMN IF NOT EXISTS title_i18n_json       LONGTEXT NULL AFTER title,
  ADD COLUMN IF NOT EXISTS review_note_i18n_json LONGTEXT NULL AFTER review_note;

-- ============================================================
-- safety_divisions
-- ============================================================
ALTER TABLE safety_divisions
  ADD COLUMN IF NOT EXISTS name_i18n_json        LONGTEXT NULL AFTER name,
  ADD COLUMN IF NOT EXISTS description_i18n_json LONGTEXT NULL AFTER description;

-- ============================================================
-- safety_departments
-- ============================================================
ALTER TABLE safety_departments
  ADD COLUMN IF NOT EXISTS name_i18n_json LONGTEXT NULL AFTER name;

-- ============================================================
-- safety_locations
-- ============================================================
ALTER TABLE safety_locations
  ADD COLUMN IF NOT EXISTS name_i18n_json        LONGTEXT NULL AFTER name,
  ADD COLUMN IF NOT EXISTS description_i18n_json LONGTEXT NULL AFTER description;

-- ============================================================
-- safety_training_requirements
-- ============================================================
ALTER TABLE safety_training_requirements
  ADD COLUMN IF NOT EXISTS title_i18n_json    LONGTEXT NULL AFTER title,
  ADD COLUMN IF NOT EXISTS category_i18n_json LONGTEXT NULL AFTER category;

-- ============================================================
-- safety_approval_actions
-- ============================================================
ALTER TABLE safety_approval_actions
  ADD COLUMN IF NOT EXISTS reason_i18n_json LONGTEXT NULL AFTER reason;

-- ============================================================
-- safety_checklist_submissions — thêm cột ghi chú còn thiếu
-- ============================================================
ALTER TABLE safety_checklist_submissions
  ADD COLUMN IF NOT EXISTS notes              TEXT NULL AFTER result_status,
  ADD COLUMN IF NOT EXISTS notes_i18n_json   LONGTEXT NULL AFTER notes;

-- ============================================================
-- documents — bổ sung description, category, tags
-- ============================================================
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS description            TEXT NULL,
  ADD COLUMN IF NOT EXISTS description_i18n_json  LONGTEXT NULL,
  ADD COLUMN IF NOT EXISTS category_i18n_json     LONGTEXT NULL,
  ADD COLUMN IF NOT EXISTS tags_i18n_json         LONGTEXT NULL;

-- ============================================================
-- safety_bulletins — thêm i18n cho action_label (nếu tồn tại)
-- ============================================================
ALTER TABLE safety_bulletins
  ADD COLUMN IF NOT EXISTS action_label_i18n_json LONGTEXT NULL;
