-- Migration 010: Normalize cấu trúc con của safety_meetings.
-- Chuyển participants/agenda/action_items từ JSON blob → bảng riêng.
-- Cột JSON cũ GIỮ NGUYÊN (đánh dấu deprecated) để backward compat.

-- ============================================================
-- safety_meeting_attendees — người tham dự từng cuộc họp
-- ============================================================
CREATE TABLE IF NOT EXISTS safety_meeting_attendees (
  id                        VARCHAR(64)    NOT NULL PRIMARY KEY,
  meeting_id                VARCHAR(64)    NOT NULL,
  employee_id               VARCHAR(64)    NULL,
  -- NULL nếu là người ngoài / chưa có tài khoản
  employee_name             VARCHAR(191)   NOT NULL,
  employee_name_i18n_json   LONGTEXT       NULL,
  -- {"vi":"Nguyễn Văn A","ja":"グエン・バン・エー","en":"Nguyen Van A"}
  department_code           VARCHAR(32)    NOT NULL,
  role_in_meeting           VARCHAR(64)    NOT NULL DEFAULT 'attendee',
  -- chairperson | secretary | attendee | guest
  attendance_status         VARCHAR(32)    NOT NULL DEFAULT 'present',
  -- present | absent | excused | late
  absence_reason            TEXT           NULL,
  absence_reason_i18n_json  LONGTEXT       NULL,
  signed_at                 DATETIME       NULL,
  -- thời điểm ký điểm danh
  created_at                DATETIME       NOT NULL,
  updated_at                DATETIME       NOT NULL,

  UNIQUE KEY uq_meeting_attendee    (meeting_id, employee_id, department_code),
  KEY idx_mta_meeting               (meeting_id),
  KEY idx_mta_department            (department_code),
  KEY idx_mta_status                (attendance_status),
  CONSTRAINT fk_mta_meeting
    FOREIGN KEY (meeting_id) REFERENCES safety_meetings(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- safety_meeting_agenda_items — chương trình họp từng mục
-- ============================================================
CREATE TABLE IF NOT EXISTS safety_meeting_agenda_items (
  id                        VARCHAR(64)    NOT NULL PRIMARY KEY,
  meeting_id                VARCHAR(64)    NOT NULL,
  sort_order                INT            NOT NULL DEFAULT 0,
  item_type                 VARCHAR(64)    NOT NULL DEFAULT 'topic',
  -- opening | review | topic | training | other | closing
  title                     VARCHAR(255)   NOT NULL,
  title_i18n_json           LONGTEXT       NULL,
  description               TEXT           NULL,
  description_i18n_json     LONGTEXT       NULL,
  presenter_name            VARCHAR(191)   NULL,
  presenter_name_i18n_json  LONGTEXT       NULL,
  duration_minutes          INT            NULL,
  -- thời lượng dự kiến (phút)
  actual_minutes            INT            NULL,
  -- thời lượng thực tế (phút)
  outcome                   TEXT           NULL,
  -- kết quả/nội dung thảo luận
  outcome_i18n_json         LONGTEXT       NULL,
  status                    VARCHAR(32)    NOT NULL DEFAULT 'planned',
  -- planned | completed | skipped
  created_at                DATETIME       NOT NULL,
  updated_at                DATETIME       NOT NULL,

  KEY idx_magi_meeting      (meeting_id, sort_order),
  KEY idx_magi_type         (item_type),
  CONSTRAINT fk_magi_meeting
    FOREIGN KEY (meeting_id) REFERENCES safety_meetings(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- safety_meeting_action_items — hành động sau họp
-- ============================================================
CREATE TABLE IF NOT EXISTS safety_meeting_action_items (
  id                        VARCHAR(64)    NOT NULL PRIMARY KEY,
  code                      VARCHAR(64)    NOT NULL,
  meeting_id                VARCHAR(64)    NOT NULL,
  agenda_item_id            VARCHAR(64)    NULL,
  -- NULL = hành động chung của cuộc họp
  title                     VARCHAR(255)   NOT NULL,
  title_i18n_json           LONGTEXT       NULL,
  description               TEXT           NULL,
  description_i18n_json     LONGTEXT       NULL,
  priority                  VARCHAR(32)    NOT NULL DEFAULT 'medium',
  -- low | medium | high | critical
  status                    VARCHAR(32)    NOT NULL DEFAULT 'open',
  -- open | in_progress | completed | overdue | cancelled
  owner_id                  VARCHAR(64)    NULL,
  owner_name                VARCHAR(191)   NULL,
  owner_name_i18n_json      LONGTEXT       NULL,
  owner_dept_code           VARCHAR(32)    NULL,
  due_date                  DATE           NULL,
  completed_at              DATETIME       NULL,
  evidence_notes            TEXT           NULL,
  evidence_notes_i18n_json  LONGTEXT       NULL,
  -- liên kết hành động này tới safety_actions nếu được tạo chính thức
  linked_action_id          VARCHAR(64)    NULL,
  created_by_id             VARCHAR(64)    NULL,
  created_by_name           VARCHAR(191)   NULL,
  updated_by_name           VARCHAR(191)   NULL,
  created_at                DATETIME       NOT NULL,
  updated_at                DATETIME       NOT NULL,
  deleted_at                DATETIME       NULL,

  UNIQUE KEY uq_mact_code           (code),
  KEY idx_mact_meeting              (meeting_id),
  KEY idx_mact_agenda_item          (agenda_item_id),
  KEY idx_mact_owner_dept           (owner_dept_code),
  KEY idx_mact_status               (status),
  KEY idx_mact_due_date             (due_date),
  KEY idx_mact_updated_at           (updated_at),
  CONSTRAINT fk_mact_meeting
    FOREIGN KEY (meeting_id) REFERENCES safety_meetings(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Đánh dấu cột JSON cũ deprecated (comment, không xoá)
-- ============================================================
-- Các cột sau trong safety_meetings vẫn tồn tại cho backward compat:
--   participants  JSON  → dùng safety_meeting_attendees thay thế
--   agenda        JSON  → dùng safety_meeting_agenda_items thay thế
--   action_items  JSON  → dùng safety_meeting_action_items thay thế
-- Application code mới chỉ đọc/ghi các bảng con trên.
-- Có thể xoá cột cũ ở migration 013+ sau khi migration data xong.
