-- Migration 012: Reporting Infrastructure.
-- Views tổng hợp phục vụ báo cáo đa cấp: bộ phận / phòng ban / công ty
-- × tháng / quý / năm.
-- Không dùng STORED PROCEDURES — chỉ dùng VIEWs + 1 bảng cache snapshot.

-- ============================================================
-- v_safety_kpi_by_dept_period
-- KPI An toàn theo bộ phận × kỳ (tháng/quý)
-- ============================================================
CREATE OR REPLACE VIEW v_safety_kpi_by_dept_period AS
SELECT
  k.department_code,
  d.name                              AS dept_name,
  d.name_i18n_json                    AS dept_name_i18n_json,
  d.division_code,
  dv.name                             AS division_name,
  dv.name_i18n_json                   AS division_name_i18n_json,
  k.period_type,
  k.period,
  k.entry_type,
  k.unit,
  COUNT(*)                            AS entry_count,
  SUM(k.value)                        AS total_value,
  AVG(k.value)                        AS avg_value,
  MAX(k.target)                       AS target,
  ROUND(
    100.0 * SUM(CASE WHEN k.value >= COALESCE(k.target, k.value) THEN 1 ELSE 0 END)
    / COUNT(*), 1
  )                                   AS target_hit_pct,
  SUM(CASE WHEN k.approval_status = 'approved' THEN 1 ELSE 0 END) AS approved_count,
  SUM(CASE WHEN k.approval_status LIKE 'pending%' THEN 1 ELSE 0 END) AS pending_count
FROM safety_kpi_entries k
LEFT JOIN safety_departments d  ON d.code = k.department_code
LEFT JOIN safety_divisions  dv  ON dv.code = d.division_code
WHERE k.deleted_at IS NULL
GROUP BY
  k.department_code, k.period_type, k.period, k.entry_type, k.unit,
  d.name, d.name_i18n_json, d.division_code, dv.name, dv.name_i18n_json;

-- ============================================================
-- v_safety_incidents_summary
-- Tổng hợp sự cố theo bộ phận × tháng + quy đổi quý/năm
-- ============================================================
CREATE OR REPLACE VIEW v_safety_incidents_summary AS
SELECT
  i.department,
  d.name                      AS dept_name,
  d.name_i18n_json            AS dept_name_i18n_json,
  d.division_code,
  dv.name                     AS division_name,
  DATE_FORMAT(i.occurred_date, '%Y-%m')       AS month_period,
  CONCAT(YEAR(i.occurred_date), '-Q',
         QUARTER(i.occurred_date))             AS quarter_period,
  YEAR(i.occurred_date)                        AS year_period,
  i.severity,
  i.type,
  i.root_cause_category,
  COUNT(*)                    AS incident_count,
  SUM(i.estimated_cost)       AS total_cost,
  SUM(i.first_aid_given)      AS first_aid_count,
  SUM(CASE WHEN i.approval_status = 'approved' THEN 1 ELSE 0 END) AS approved_count
FROM safety_incidents i
LEFT JOIN safety_departments d  ON d.code = i.department
LEFT JOIN safety_divisions  dv  ON dv.code = d.division_code
WHERE i.deleted_at IS NULL
  AND i.occurred_date IS NOT NULL
GROUP BY
  i.department, d.name, d.name_i18n_json, d.division_code, dv.name,
  month_period, quarter_period, year_period, i.severity, i.type, i.root_cause_category;

-- ============================================================
-- v_safety_warnings_open
-- Cảnh báo còn mở × bộ phận + tuổi thọ (ngày)
-- ============================================================
CREATE OR REPLACE VIEW v_safety_warnings_open AS
SELECT
  w.id,
  w.code,
  w.title,
  w.title_i18n_json,
  w.department,
  d.name                      AS dept_name,
  d.name_i18n_json            AS dept_name_i18n_json,
  d.division_code,
  w.category,
  w.risk_level,
  w.risk_score,
  w.approval_status,
  w.deadline,
  DATEDIFF(CURDATE(), w.created_at)           AS age_days,
  CASE WHEN w.deadline < CURDATE() THEN 1 ELSE 0 END AS is_overdue,
  DATEDIFF(w.deadline, CURDATE())             AS days_to_deadline,
  w.responsible_person,
  w.created_at
FROM safety_warnings w
LEFT JOIN safety_departments d ON d.code = w.department
WHERE w.deleted_at IS NULL
  AND w.status != 'Đóng';

-- ============================================================
-- v_safety_training_compliance
-- Tỷ lệ đào tạo hoàn thành × bộ phận × khóa
-- ============================================================
CREATE OR REPLACE VIEW v_safety_training_compliance AS
SELECT
  tc.department,
  d.name                      AS dept_name,
  d.name_i18n_json            AS dept_name_i18n_json,
  d.division_code,
  tc.id                       AS course_id,
  tc.code                     AS course_code,
  tc.name                     AS course_name,
  tc.name_i18n_json           AS course_name_i18n_json,
  tc.category,
  tc.enrolled,
  tc.completed,
  CASE WHEN tc.enrolled > 0
    THEN ROUND(100.0 * tc.completed / tc.enrolled, 1)
    ELSE NULL
  END                         AS completion_pct,
  tc.due_date,
  tc.status,
  CASE WHEN tc.due_date < CURDATE() AND tc.status != 'Hoàn thành'
    THEN 1 ELSE 0
  END                         AS is_overdue
FROM safety_training_courses tc
LEFT JOIN safety_departments d ON d.code = tc.department
WHERE tc.deleted_at IS NULL;

-- ============================================================
-- v_inspection_plan_results
-- Kết quả kiểm tra × kế hoạch × bộ phận
-- ============================================================
CREATE OR REPLACE VIEW v_inspection_plan_results AS
SELECT
  ip.id                       AS plan_id,
  ip.code                     AS plan_code,
  ip.title                    AS plan_title,
  ip.title_i18n_json          AS plan_title_i18n_json,
  ip.period,
  ip.plan_type,
  ip.scope_level,
  ip.status                   AS plan_status,
  ip.actual_date,
  ds.department_code,
  dept.name                   AS dept_name,
  dept.name_i18n_json         AS dept_name_i18n_json,
  dept.division_code,
  dv.name                     AS division_name,
  ds.total_score,
  ds.max_score,
  ds.score_percent,
  ds.nc_count,
  ds.critical_count,
  ds.ok_count,
  ds.open_actions,
  ds.rank_in_plan,
  -- Số hành động còn mở (real-time từ inspection_plan_actions)
  (SELECT COUNT(*) FROM inspection_plan_actions a
   WHERE a.plan_id = ip.id
     AND a.department_code = ds.department_code
     AND a.status IN ('open','in_progress')
     AND a.deleted_at IS NULL)  AS live_open_actions
FROM inspection_plans ip
JOIN inspection_plan_dept_scores ds ON ds.plan_id = ip.id
LEFT JOIN safety_departments dept    ON dept.code = ds.department_code
LEFT JOIN safety_divisions   dv      ON dv.code  = dept.division_code
WHERE ip.deleted_at IS NULL;

-- ============================================================
-- v_safety_score_dashboard
-- Điểm An toàn tổng hợp mỗi bộ phận (dùng cho dashboard KPI)
-- Tính từ: KPI entries đã approved (kỳ hiện tại)
-- ============================================================
CREATE OR REPLACE VIEW v_safety_score_dashboard AS
SELECT
  d.code                      AS department_code,
  d.name                      AS dept_name,
  d.name_i18n_json            AS dept_name_i18n_json,
  d.division_code,
  dv.name                     AS division_name,
  d.safety_target,
  d.headcount,
  -- KPI kỳ mới nhất đã approved
  (SELECT ROUND(AVG(k.value), 1)
   FROM safety_kpi_entries k
   WHERE k.department_code = d.code
     AND k.entry_type = 'safety_score'
     AND k.approval_status = 'approved'
     AND k.deleted_at IS NULL
   ORDER BY k.period DESC
   LIMIT 1
  )                           AS latest_safety_score,
  -- Cảnh báo đang mở
  (SELECT COUNT(*) FROM safety_warnings w
   WHERE w.department = d.code
     AND w.deleted_at IS NULL
     AND w.status != 'Đóng'
  )                           AS open_warnings,
  -- Sự cố tháng này
  (SELECT COUNT(*) FROM safety_incidents i
   WHERE i.department = d.code
     AND i.deleted_at IS NULL
     AND DATE_FORMAT(i.occurred_date,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')
  )                           AS incidents_this_month,
  -- Hành động quá hạn
  (SELECT COUNT(*) FROM safety_actions a
   WHERE a.department_code = d.code
     AND a.deleted_at IS NULL
     AND a.status IN ('open','in_progress')
     AND a.due_date < CURDATE()
  )                           AS overdue_actions,
  -- Đào tạo chưa hoàn thành
  (SELECT COUNT(*) FROM safety_training_courses tc
   WHERE tc.department = d.code
     AND tc.deleted_at IS NULL
     AND tc.status != 'Hoàn thành'
  )                           AS pending_trainings
FROM safety_departments d
LEFT JOIN safety_divisions dv ON dv.code = d.division_code
WHERE d.active = 1;

-- ============================================================
-- v_safety_score_company
-- Tổng hợp toàn công ty (aggregate lên từ v_safety_score_dashboard)
-- ============================================================
CREATE OR REPLACE VIEW v_safety_score_company AS
SELECT
  dv.code                     AS division_code,
  dv.name                     AS division_name,
  dv.name_i18n_json           AS division_name_i18n_json,
  COUNT(d.code)               AS dept_count,
  SUM(d.headcount)            AS total_headcount,
  ROUND(AVG(d.safety_target), 1) AS avg_target,
  (SELECT ROUND(AVG(k.value), 1)
   FROM safety_kpi_entries k
   JOIN safety_departments dd ON dd.code = k.department_code
   WHERE dd.division_code = dv.code
     AND k.entry_type = 'safety_score'
     AND k.approval_status = 'approved'
     AND k.deleted_at IS NULL
     AND k.period = DATE_FORMAT(CURDATE(),'%Y-%m')
  )                           AS division_avg_score,
  (SELECT COUNT(*) FROM safety_warnings w
   JOIN safety_departments dd2 ON dd2.code = w.department
   WHERE dd2.division_code = dv.code
     AND w.deleted_at IS NULL AND w.status != 'Đóng'
  )                           AS open_warnings,
  (SELECT COUNT(*) FROM safety_incidents i
   JOIN safety_departments dd3 ON dd3.code = i.department
   WHERE dd3.division_code = dv.code
     AND i.deleted_at IS NULL
     AND YEAR(i.occurred_date) = YEAR(CURDATE())
  )                           AS incidents_ytd
FROM safety_divisions dv
LEFT JOIN safety_departments d ON d.division_code = dv.code AND d.active = 1
WHERE dv.active = 1
GROUP BY dv.code, dv.name, dv.name_i18n_json;

-- ============================================================
-- report_snapshots — cache báo cáo tổng hợp
-- Application layer tính toán phức tạp rồi lưu JSON vào đây.
-- TTL = expired_at; consumer kiểm tra trước khi dùng.
-- ============================================================
CREATE TABLE IF NOT EXISTS report_snapshots (
  id                  VARCHAR(64)    NOT NULL PRIMARY KEY,
  report_key          VARCHAR(120)   NOT NULL,
  -- VD: "safety_score:company:2026-06" | "incidents:dept:PED:2026-Q2"
  report_type         VARCHAR(64)    NOT NULL,
  -- monthly | quarterly | annual | on_demand
  scope_type          VARCHAR(32)    NOT NULL DEFAULT 'company',
  -- company | division | department
  scope_code          VARCHAR(32)    NULL,
  period              VARCHAR(16)    NOT NULL,
  -- YYYY-MM | YYYY-QN | YYYY
  language            VARCHAR(8)     NOT NULL DEFAULT 'vi',
  -- vi | ja | en — ngôn ngữ render snapshot
  payload_json        LONGTEXT       NOT NULL,
  -- nội dung báo cáo đầy đủ dạng JSON
  generated_by_id     VARCHAR(64)    NULL,
  generated_by_name   VARCHAR(191)   NULL,
  generated_at        DATETIME       NOT NULL,
  expired_at          DATETIME       NOT NULL,
  -- TTL: thường +1h cho on_demand, +24h cho monthly
  checksum            VARCHAR(64)    NULL,
  -- SHA-256 của payload để detect stale

  UNIQUE KEY uq_snapshot_key_lang    (report_key, language),
  KEY idx_snapshot_type              (report_type, scope_type, period),
  KEY idx_snapshot_expired           (expired_at),
  KEY idx_snapshot_scope             (scope_code, period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- report_definitions — định nghĩa báo cáo tái sử dụng
-- ============================================================
CREATE TABLE IF NOT EXISTS report_definitions (
  id                  VARCHAR(64)    NOT NULL PRIMARY KEY,
  code                VARCHAR(64)    NOT NULL,
  name                VARCHAR(191)   NOT NULL,
  name_i18n_json      LONGTEXT       NULL,
  description         TEXT           NULL,
  description_i18n_json LONGTEXT     NULL,
  report_type         VARCHAR(64)    NOT NULL,
  -- safety_score | incident | warning | training | inspection | audit | custom
  scope_level         VARCHAR(32)    NOT NULL DEFAULT 'department',
  period_type         VARCHAR(32)    NOT NULL DEFAULT 'monthly',
  -- monthly | quarterly | annual
  query_template      LONGTEXT       NULL,
  -- Tên view hoặc query pattern
  output_format       VARCHAR(32)    NOT NULL DEFAULT 'table',
  -- table | chart | pdf | excel
  required_role       VARCHAR(64)    NOT NULL DEFAULT 'ehs',
  -- viewer | leader | ehs | admin
  active              TINYINT(1)     NOT NULL DEFAULT 1,
  created_by_id       VARCHAR(64)    NULL,
  created_by_name     VARCHAR(191)   NULL,
  created_at          DATETIME       NOT NULL,
  updated_at          DATETIME       NOT NULL,

  UNIQUE KEY uq_report_def_code (code),
  KEY idx_report_def_type       (report_type, scope_level),
  KEY idx_report_def_active     (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
