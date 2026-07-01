import fs from "fs";
import mysql from "mysql2/promise";
import path from "path";

const hasMysqlConfig = () =>
  !!(process.env.MHCHUB_MYSQL_HOST && process.env.MHCHUB_MYSQL_DATABASE && process.env.MHCHUB_MYSQL_USER);

const envNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

export const createMysqlAuthStore = ({ rootDir }) => {
  if (!hasMysqlConfig()) return null;

  const pool = mysql.createPool({
    host: process.env.MHCHUB_MYSQL_HOST,
    port: envNumber("MHCHUB_MYSQL_PORT", 3306),
    user: process.env.MHCHUB_MYSQL_USER,
    password: process.env.MHCHUB_MYSQL_PASSWORD || "",
    database: process.env.MHCHUB_MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: envNumber("MHCHUB_MYSQL_CONNECTION_LIMIT", 10),
    namedPlaceholders: false
  });

  const ensureSchema = async () => {
    const sql = fs.readFileSync(path.join(rootDir, "database", "migrations", "001_auth_schema.sql"), "utf8");
    const statements = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await pool.query(statement);
    }
    try {
      await pool.query("ALTER TABLE users ADD COLUMN display_name VARCHAR(191) NULL AFTER username");
    } catch (error) {
      if (error?.code !== "ER_DUP_FIELDNAME") throw error;
    }
  };

  const normalizeUser = (row) =>
    row
      ? {
          id: String(row.id),
          username: String(row.username),
          displayName: row.display_name || null,
          passwordHash: String(row.password),
          role: String(row.role || "admin"),
          departmentId: row.department_id || null,
          activeSessionId: row.active_session_id || null,
          lastLoginAt: row.last_login_at || null,
          passwordUpdatedAt: row.password_updated_at || null,
          createdAt: row.created_at || null
        }
      : null;

  return {
    type: "mysql",
    ensureSchema,
    async countUsers() {
      await ensureSchema();
      const [rows] = await pool.query("SELECT COUNT(*) AS total FROM users");
      return Number(rows[0]?.total || 0);
    },
    async findUserByUsername(username) {
      await ensureSchema();
      const [rows] = await pool.query("SELECT * FROM users WHERE username = ? LIMIT 1", [username]);
      return normalizeUser(rows[0]);
    },
    async findUserById(id) {
      await ensureSchema();
      const [rows] = await pool.query("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
      return normalizeUser(rows[0]);
    },
    async upsertUser(user) {
      await ensureSchema();
      await pool.query(
        `INSERT INTO users (id, username, display_name, password, role, department_id, active_session_id, password_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NOW())
         ON DUPLICATE KEY UPDATE
           display_name = VALUES(display_name),
           password = VALUES(password),
           role = VALUES(role),
           department_id = VALUES(department_id),
           active_session_id = NULL,
           password_updated_at = NOW()`,
        [
          user.id,
          user.username,
          user.displayName || user.username,
          user.passwordHash,
          user.role || "admin",
          user.departmentId || null
        ]
      );
    },
    async listUsers() {
      await ensureSchema();
      const [rows] = await pool.query(
        `SELECT *
         FROM users
         ORDER BY created_at DESC, username ASC`
      );
      return rows.map(normalizeUser);
    },
    async createUser(user) {
      await ensureSchema();
      await pool.query(
        `INSERT INTO users (id, username, display_name, password, role, department_id, active_session_id, password_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NOW())`,
        [
          user.id,
          user.username,
          user.displayName || user.username,
          user.passwordHash,
          user.role || "viewer",
          user.departmentId || null
        ]
      );
      return this.findUserById(user.id);
    },
    async updateUser(id, updates) {
      await ensureSchema();
      const fields = [];
      const values = [];
      if (updates.displayName !== undefined) {
        fields.push("display_name = ?");
        values.push(updates.displayName || null);
      }
      if (updates.role !== undefined) {
        fields.push("role = ?");
        values.push(updates.role);
      }
      if (updates.departmentId !== undefined) {
        fields.push("department_id = ?");
        values.push(updates.departmentId || null);
      }
      if (!fields.length) return this.findUserById(id);
      values.push(id);
      await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ? LIMIT 1`, values);
      return this.findUserById(id);
    },
    async updateUserPassword(id, passwordHash) {
      await ensureSchema();
      await pool.query(
        "UPDATE users SET password = ?, password_updated_at = NOW(), active_session_id = NULL WHERE id = ? LIMIT 1",
        [passwordHash, id]
      );
      return this.findUserById(id);
    },
    async deleteUser(id) {
      await ensureSchema();
      await pool.query("DELETE FROM users WHERE id = ? LIMIT 1", [id]);
    },
    async setActiveSession(userId, sessionId) {
      await ensureSchema();
      const current = await this.findUserById(userId);
      await pool.query("UPDATE users SET active_session_id = ?, last_login_at = NOW() WHERE id = ? LIMIT 1", [
        sessionId,
        userId
      ]);
      return current?.activeSessionId || null;
    },
    async clearActiveSession(userId, sessionId) {
      await ensureSchema();
      await pool.query("UPDATE users SET active_session_id = NULL WHERE id = ? AND active_session_id = ? LIMIT 1", [
        userId,
        sessionId
      ]);
    },
    async isActiveSession(userId, sessionId) {
      const user = await this.findUserById(userId);
      return !!user && user.activeSessionId === sessionId;
    },
    async writeAudit(event) {
      await ensureSchema();
      await pool.query(
        `INSERT INTO auth_audit_log
          (username, user_id, event_type, success, reason, ip, user_agent, session_id, replaced_session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.username || null,
          event.userId || null,
          event.eventType,
          event.success ? 1 : 0,
          event.reason || null,
          event.ip ? String(event.ip).slice(0, 64) : null,
          event.userAgent ? String(event.userAgent).slice(0, 255) : null,
          event.sessionId || null,
          event.replacedSessionId || null
        ]
      );
    },
    async getAttempt(key) {
      await ensureSchema();
      const [rows] = await pool.query("SELECT * FROM auth_login_attempts WHERE attempt_key = ? LIMIT 1", [key]);
      return rows[0] || null;
    },
    async recordFailure({ key, username, ip, failures, firstFailureAt, blockedUntil }) {
      await ensureSchema();
      await pool.query(
        `INSERT INTO auth_login_attempts
          (attempt_key, username, ip, failures, first_failure_at, blocked_until)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          username = VALUES(username),
          ip = VALUES(ip),
          failures = VALUES(failures),
          first_failure_at = VALUES(first_failure_at),
          blocked_until = VALUES(blocked_until)`,
        [key, username.slice(0, 191), ip.slice(0, 64), failures, firstFailureAt, blockedUntil]
      );
    },
    async clearFailures(key) {
      await ensureSchema();
      await pool.query("DELETE FROM auth_login_attempts WHERE attempt_key = ?", [key]);
    }
  };
};
