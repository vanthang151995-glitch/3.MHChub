-- Migration 013: Thêm cột departments_json và các trường mở rộng cho inspection_plans.
-- Cho phép MySQL store lưu mảng departments giống JSON store.

ALTER TABLE inspection_plans
  ADD COLUMN IF NOT EXISTS departments_json    LONGTEXT NULL       AFTER scope_code,
  ADD COLUMN IF NOT EXISTS notes               TEXT     NULL       AFTER departments_json,
  ADD COLUMN IF NOT EXISTS priority            VARCHAR(32) NOT NULL DEFAULT 'normal' AFTER notes,
  ADD COLUMN IF NOT EXISTS lead_inspector      VARCHAR(191) NULL   AFTER priority,
  ADD COLUMN IF NOT EXISTS planned_start_date  DATE     NULL       AFTER lead_inspector,
  ADD COLUMN IF NOT EXISTS planned_end_date    DATE     NULL       AFTER planned_start_date,
  ADD COLUMN IF NOT EXISTS tags_json           LONGTEXT NULL       AFTER planned_end_date,
  ADD COLUMN IF NOT EXISTS audit_trail_json    LONGTEXT NULL       AFTER tags_json,
  ADD COLUMN IF NOT EXISTS custom_fields_json  LONGTEXT NULL       AFTER audit_trail_json;
