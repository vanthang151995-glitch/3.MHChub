-- Migration 011: Employee Master Table.
-- Danh bạ nhân viên chuẩn hoá — thay thế việc lưu tên rải rác khắp bảng.
-- Các bảng khác vẫn giữ *_name VARCHAR làm denormalized cache (không xoá);
-- employee_id được thêm để join về bảng này khi cần thông tin đầy đủ.

-- ============================================================
-- employees — danh bạ nhân viên
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  id                        VARCHAR(64)    NOT NULL PRIMARY KEY,
  code                      VARCHAR(64)    NOT NULL,
  -- mã nhân viên nội bộ (VD: NV-001, MHC-2024-001)

  -- Họ tên đa ngôn ngữ
  full_name                 VARCHAR(191)   NOT NULL,
  -- tiếng Việt (chính)
  full_name_i18n_json       LONGTEXT       NULL,
  -- {"vi":"Nguyễn Văn A","ja":"グエン・バン・エー","en":"Nguyen Van A"}
  display_name              VARCHAR(191)   NULL,
  -- tên hiển thị ngắn (nickname / tên gọi)
  display_name_i18n_json    LONGTEXT       NULL,

  -- Liên kết tài khoản hệ thống (nullable — người ngoài không có tài khoản)
  user_id                   VARCHAR(64)    NULL,

  -- Phân công bộ phận hiện tại
  department_code           VARCHAR(32)    NOT NULL,
  division_code             VARCHAR(32)    NULL,
  job_title                 VARCHAR(191)   NULL,
  job_title_i18n_json       LONGTEXT       NULL,
  -- {"vi":"Trưởng bộ phận EHS","ja":"EHSセクションマネージャー","en":"EHS Section Manager"}

  -- Thông tin liên lạc
  email                     VARCHAR(191)   NULL,
  phone                     VARCHAR(64)    NULL,
  internal_phone            VARCHAR(32)    NULL,

  -- Ngày làm việc
  join_date                 DATE           NULL,
  leave_date                DATE           NULL,
  -- NULL = vẫn đang làm việc

  -- Thông tin thêm
  gender                    VARCHAR(16)    NULL,
  -- male | female | other
  nationality               VARCHAR(64)    NULL,
  -- VN | JP | KR | ...
  primary_language          VARCHAR(8)     NOT NULL DEFAULT 'vi',
  -- ngôn ngữ ưu tiên: vi | ja | en
  photo_path                VARCHAR(500)   NULL,

  -- Trạng thái
  status                    VARCHAR(32)    NOT NULL DEFAULT 'active',
  -- active | on_leave | resigned | terminated
  active                    TINYINT(1)     NOT NULL DEFAULT 1,

  -- Audit
  created_by_id             VARCHAR(64)    NULL,
  created_by_name           VARCHAR(191)   NULL,
  updated_by_name           VARCHAR(191)   NULL,
  created_at                DATETIME       NOT NULL,
  updated_at                DATETIME       NOT NULL,
  deleted_at                DATETIME       NULL,

  UNIQUE KEY uq_employees_code         (code),
  KEY idx_employees_user_id            (user_id),
  KEY idx_employees_department         (department_code),
  KEY idx_employees_division           (division_code),
  KEY idx_employees_status             (status, active),
  KEY idx_employees_nationality        (nationality),
  KEY idx_employees_join_date          (join_date),
  KEY idx_employees_updated_at         (updated_at),
  FULLTEXT KEY ft_employees_name       (full_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- employee_dept_assignments — lịch sử điều chuyển bộ phận
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_dept_assignments (
  id                  BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  employee_id         VARCHAR(64)      NOT NULL,
  department_code     VARCHAR(32)      NOT NULL,
  division_code       VARCHAR(32)      NULL,
  job_title           VARCHAR(191)     NULL,
  job_title_i18n_json LONGTEXT         NULL,
  effective_from      DATE             NOT NULL,
  effective_to        DATE             NULL,
  -- NULL = hiện tại
  reason              TEXT             NULL,
  reason_i18n_json    LONGTEXT         NULL,
  created_by_id       VARCHAR(64)      NULL,
  created_at          DATETIME         NOT NULL,

  KEY idx_emp_assign_employee   (employee_id, effective_from),
  KEY idx_emp_assign_department (department_code, effective_from),
  CONSTRAINT fk_emp_assign_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- employee_training_matrix — ma trận đào tạo bắt buộc × nhân viên
-- (liên kết employees ↔ safety_training_requirements)
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_training_matrix (
  id                    BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  employee_id           VARCHAR(64)      NOT NULL,
  requirement_id        VARCHAR(64)      NOT NULL,
  due_date              DATE             NULL,
  -- hạn hoàn thành (tính từ join_date + frequency_months)
  status                VARCHAR(32)      NOT NULL DEFAULT 'pending',
  -- pending | completed | overdue | waived
  last_completed_at     DATE             NULL,
  next_due_at           DATE             NULL,
  training_record_id    VARCHAR(64)      NULL,
  -- FK → safety_training_records.id
  notes                 TEXT             NULL,
  notes_i18n_json       LONGTEXT         NULL,
  updated_at            DATETIME         NOT NULL,

  UNIQUE KEY uq_emp_training_matrix     (employee_id, requirement_id),
  KEY idx_emp_matrix_employee           (employee_id),
  KEY idx_emp_matrix_requirement        (requirement_id),
  KEY idx_emp_matrix_status             (status),
  KEY idx_emp_matrix_next_due           (next_due_at),
  CONSTRAINT fk_emp_matrix_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
