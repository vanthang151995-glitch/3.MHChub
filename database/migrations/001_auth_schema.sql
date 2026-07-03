-- MHChub MySQL auth schema.
-- Compatible with the login-auth setup package design.

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  username TEXT NOT NULL,
  display_name VARCHAR(191) NULL,
  password TEXT NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'admin',
  department_id VARCHAR(64) NULL,
  active_session_id VARCHAR(64) NULL,
  last_login_at DATETIME NULL,
  password_updated_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY username (username(191)),
  KEY idx_users_role (role),
  KEY idx_users_department (department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_audit_log (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(191) DEFAULT NULL,
  user_id VARCHAR(36) DEFAULT NULL,
  event_type VARCHAR(64) NOT NULL,
  success TINYINT NOT NULL DEFAULT 0,
  reason VARCHAR(120) DEFAULT NULL,
  ip VARCHAR(64) DEFAULT NULL,
  user_agent VARCHAR(255) DEFAULT NULL,
  session_id VARCHAR(64) DEFAULT NULL,
  replaced_session_id VARCHAR(64) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_auth_audit_user_time (username, created_at),
  KEY idx_auth_audit_event_time (event_type, created_at),
  KEY idx_auth_audit_ip_time (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_login_attempts (
  attempt_key VARCHAR(64) NOT NULL PRIMARY KEY,
  username VARCHAR(191) NOT NULL,
  ip VARCHAR(64) NOT NULL,
  failures INT NOT NULL DEFAULT 0,
  first_failure_at DATETIME NOT NULL,
  blocked_until DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_auth_login_attempts_user_time (username, updated_at),
  KEY idx_auth_login_attempts_ip_time (ip, updated_at),
  KEY idx_auth_login_attempts_blocked_until (blocked_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
