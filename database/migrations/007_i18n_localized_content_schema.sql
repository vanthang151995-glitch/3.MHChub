-- Adds localized content columns for VI/EN/JA payloads.
-- Existing legacy text columns remain the Vietnamese fallback and search source.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS title_i18n_json LONGTEXT NULL AFTER title;

ALTER TABLE safety_warnings
  ADD COLUMN IF NOT EXISTS title_i18n_json LONGTEXT NULL AFTER title,
  ADD COLUMN IF NOT EXISTS area_i18n_json LONGTEXT NULL AFTER area,
  ADD COLUMN IF NOT EXISTS description_i18n_json LONGTEXT NULL AFTER description,
  ADD COLUMN IF NOT EXISTS current_control_i18n_json LONGTEXT NULL AFTER current_control,
  ADD COLUMN IF NOT EXISTS proposed_action_i18n_json LONGTEXT NULL AFTER proposed_action,
  ADD COLUMN IF NOT EXISTS evidence_notes_i18n_json LONGTEXT NULL AFTER evidence_notes,
  ADD COLUMN IF NOT EXISTS related_standard_i18n_json LONGTEXT NULL AFTER related_standard,
  ADD COLUMN IF NOT EXISTS rejection_reason_i18n_json LONGTEXT NULL AFTER rejection_reason;

ALTER TABLE safety_incidents
  ADD COLUMN IF NOT EXISTS area_i18n_json LONGTEXT NULL AFTER area,
  ADD COLUMN IF NOT EXISTS description_i18n_json LONGTEXT NULL AFTER description,
  ADD COLUMN IF NOT EXISTS witnesses_i18n_json LONGTEXT NULL AFTER witnesses,
  ADD COLUMN IF NOT EXISTS root_cause_detail_i18n_json LONGTEXT NULL AFTER root_cause_detail,
  ADD COLUMN IF NOT EXISTS immediate_action_i18n_json LONGTEXT NULL AFTER immediate_action,
  ADD COLUMN IF NOT EXISTS corrective_action_i18n_json LONGTEXT NULL AFTER corrective_action,
  ADD COLUMN IF NOT EXISTS preventive_action_i18n_json LONGTEXT NULL AFTER preventive_action,
  ADD COLUMN IF NOT EXISTS rejection_reason_i18n_json LONGTEXT NULL AFTER rejection_reason;

ALTER TABLE safety_kpi_entries
  ADD COLUMN IF NOT EXISTS notes_i18n_json LONGTEXT NULL AFTER notes,
  ADD COLUMN IF NOT EXISTS rejection_reason_i18n_json LONGTEXT NULL AFTER rejection_reason;

ALTER TABLE safety_reports
  ADD COLUMN IF NOT EXISTS title_i18n_json LONGTEXT NULL AFTER title,
  ADD COLUMN IF NOT EXISTS notes_i18n_json LONGTEXT NULL AFTER notes;

ALTER TABLE safety_training_courses
  ADD COLUMN IF NOT EXISTS name_i18n_json LONGTEXT NULL AFTER name,
  ADD COLUMN IF NOT EXISTS category_i18n_json LONGTEXT NULL AFTER category,
  ADD COLUMN IF NOT EXISTS duration_i18n_json LONGTEXT NULL AFTER duration,
  ADD COLUMN IF NOT EXISTS notes_i18n_json LONGTEXT NULL AFTER notes;

ALTER TABLE safety_notifications
  ADD COLUMN IF NOT EXISTS title_i18n_json LONGTEXT NULL AFTER title,
  ADD COLUMN IF NOT EXISTS message_i18n_json LONGTEXT NULL AFTER message;
