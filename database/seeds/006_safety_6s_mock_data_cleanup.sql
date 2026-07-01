-- Remove only the Safety - 6S mock rows created by 006_safety_6s_mock_data.sql.

SET NAMES utf8mb4;
START TRANSACTION;

DELETE FROM safety_training_courses
WHERE id LIKE 'mock-training-%';

DELETE FROM safety_reports
WHERE id LIKE 'mock-report-%';

DELETE FROM safety_checklist_submissions
WHERE period = '2026-06' AND submitted_by_id LIKE 'mock-user-%';

DELETE FROM safety_kpi_entries
WHERE id LIKE 'mock-kpi-%';

DELETE FROM safety_incidents
WHERE id LIKE 'mock-incident-%' OR code LIKE 'MOCK-INC-%';

DELETE FROM safety_warnings
WHERE id LIKE 'mock-warning-%' OR code LIKE 'MOCK-WARN-%';

COMMIT;
