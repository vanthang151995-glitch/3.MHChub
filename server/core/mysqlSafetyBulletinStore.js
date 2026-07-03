import fs from "fs";
import mysql from "mysql2/promise";
import path from "path";

const hasMysqlConfig = () =>
  !!(process.env.MHCHUB_MYSQL_HOST && process.env.MHCHUB_MYSQL_DATABASE && process.env.MHCHUB_MYSQL_USER);

const envNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const parseMigration = (sql) =>
  sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);

const toMysqlDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace("T", " ");
};

const toIso = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toDateOnly = (value) => {
  if (!value) return "";
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    if (year < 1900) return "";
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw || raw.startsWith("0000-00-00")) return "";
  const direct = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const parseJson = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const stringifyJson = (value, fallback) => JSON.stringify(value === undefined ? fallback : value);

const actorFields = (actor = {}) => ({
  username: actor.username || actor.id || "admin",
  displayName: actor.displayName || actor.username || actor.id || "admin",
  role: actor.role || "admin"
});

const rowToBulletin = (row) => ({
  id: String(row.id),
  date: toDateOnly(row.bulletin_date),
  tone: row.tone || "watch",
  title: parseJson(row.title_json, { vi: "", en: "", ja: "" }),
  summary: parseJson(row.summary_json, { vi: "", en: "", ja: "" }),
  points: parseJson(row.points_json, { vi: [], en: [], ja: [] }),
  audience: parseJson(row.audience_json, { vi: "", en: "", ja: "" }),
  groups: parseJson(row.groups_json, []),
  documentId: row.document_id || "",
  documentUrl: row.document_url || "",
  published: row.published !== 0,
  createdBy: row.created_by || "",
  createdByName: row.created_by_name || "",
  createdByRole: row.created_by_role || "",
  createdAt: toIso(row.created_at),
  updatedBy: row.updated_by || "",
  updatedByName: row.updated_by_name || "",
  updatedByRole: row.updated_by_role || "",
  updatedAt: toIso(row.updated_at)
});

const rowToLog = (row) => ({
  id: String(row.id),
  bulletinId: row.bulletin_id || "",
  action: row.action || "",
  actor: row.actor || "",
  actorName: row.actor_name || "",
  actorRole: row.actor_role || "",
  before: parseJson(row.before_json, null),
  after: parseJson(row.after_json, null),
  createdAt: toIso(row.created_at)
});

const bulletinParams = (bulletin) => [
  bulletin.id,
  bulletin.date || null,
  bulletin.tone || "watch",
  stringifyJson(bulletin.title, { vi: "", en: "", ja: "" }),
  stringifyJson(bulletin.summary, { vi: "", en: "", ja: "" }),
  stringifyJson(bulletin.points, { vi: [], en: [], ja: [] }),
  stringifyJson(bulletin.audience, { vi: "", en: "", ja: "" }),
  stringifyJson(Array.isArray(bulletin.groups) ? bulletin.groups : []),
  bulletin.documentId || null,
  bulletin.documentUrl || null,
  bulletin.published === false ? 0 : 1,
  bulletin.createdBy || null,
  bulletin.createdByName || null,
  bulletin.createdByRole || null,
  toMysqlDate(bulletin.createdAt || new Date()),
  bulletin.updatedBy || null,
  bulletin.updatedByName || null,
  bulletin.updatedByRole || null,
  toMysqlDate(bulletin.updatedAt || bulletin.createdAt || new Date())
];

const bulletinColumns = [
  "id",
  "bulletin_date",
  "tone",
  "title_json",
  "summary_json",
  "points_json",
  "audience_json",
  "groups_json",
  "document_id",
  "document_url",
  "published",
  "created_by",
  "created_by_name",
  "created_by_role",
  "created_at",
  "updated_by",
  "updated_by_name",
  "updated_by_role",
  "updated_at"
];

export const createMysqlSafetyBulletinStore = ({ rootDir }) => {
  if (!hasMysqlConfig()) return null;

  const pool = mysql.createPool({
    host: process.env.MHCHUB_MYSQL_HOST,
    port: envNumber("MHCHUB_MYSQL_PORT", 3306),
    user: process.env.MHCHUB_MYSQL_USER,
    password: process.env.MHCHUB_MYSQL_PASSWORD || "",
    database: process.env.MHCHUB_MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: envNumber("MHCHUB_MYSQL_CONNECTION_LIMIT", 10),
    dateStrings: true,
    timezone: "Z"
  });

  const migrationPath = path.join(rootDir, "database", "migrations", "004_safety_bulletins_schema.sql");
  let schemaReady = null;

  const ensureSchema = async () => {
    if (!schemaReady) {
      schemaReady = (async () => {
        const migration = fs.readFileSync(migrationPath, "utf8");
        for (const statement of parseMigration(migration)) {
          await pool.query(statement);
        }
      })();
    }
    return schemaReady;
  };

  const findById = async (id) => {
    await ensureSchema();
    const [rows] = await pool.query("SELECT * FROM safety_bulletins WHERE id = ? LIMIT 1", [id]);
    return rows[0] ? rowToBulletin(rows[0]) : null;
  };

  const logChange = async ({ bulletinId, action, actor, before = null, after = null }) => {
    const safeActor = actorFields(actor);
    await pool.query(
      `INSERT INTO safety_bulletin_logs
       (bulletin_id, action, actor, actor_name, actor_role, before_json, after_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bulletinId,
        action,
        safeActor.username,
        safeActor.displayName,
        safeActor.role,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        toMysqlDate()
      ]
    );
  };

  const upsertBulletin = async (bulletin) => {
    await ensureSchema();
    const placeholders = bulletinColumns.map(() => "?").join(", ");
    const updates = bulletinColumns
      .filter((column) => column !== "id" && !column.startsWith("created_"))
      .map((column) => `${column} = VALUES(${column})`)
      .join(", ");
    await pool.query(
      `INSERT INTO safety_bulletins (${bulletinColumns.join(", ")})
       VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE ${updates}`,
      bulletinParams(bulletin)
    );
    return findById(bulletin.id);
  };

  return {
    type: "mysql",
    ensureSchema,
    async countBulletins({ includeDrafts = true } = {}) {
      await ensureSchema();
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS total FROM safety_bulletins ${includeDrafts ? "" : "WHERE published = 1"}`
      );
      return Number(rows[0]?.total || 0);
    },
    async getBulletin(id) {
      return findById(id);
    },
    async getBulletins({ includeDrafts = false, page = 1, pageSize = 20 } = {}) {
      await ensureSchema();
      const safePageSize = Math.max(1, Math.min(100, Number(pageSize) || 20));
      const where = includeDrafts ? "" : "WHERE published = 1";
      const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM safety_bulletins ${where}`);
      const totalItems = Number(countRows[0]?.total || 0);
      const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
      const currentPage = Math.max(1, Math.min(totalPages, Number(page) || 1));
      const offset = (currentPage - 1) * safePageSize;
      const [rows] = await pool.query(
        `SELECT * FROM safety_bulletins
         ${where}
         ORDER BY COALESCE(bulletin_date, DATE(updated_at)) DESC, updated_at DESC, id DESC
         LIMIT ? OFFSET ?`,
        [safePageSize, offset]
      );
      return {
        items: rows.map(rowToBulletin),
        pagination: { page: currentPage, pageSize: safePageSize, totalItems, totalPages }
      };
    },
    async addBulletin(bulletin, actor) {
      const created = await upsertBulletin(bulletin);
      await logChange({ bulletinId: created.id, action: "created", actor, after: created });
      return created;
    },
    async updateBulletin(id, updates, actor) {
      const before = await findById(id);
      if (!before) return null;
      const safeActor = actorFields(actor);
      const next = {
        ...before,
        ...updates,
        id: before.id,
        createdBy: before.createdBy,
        createdByName: before.createdByName,
        createdByRole: before.createdByRole,
        createdAt: before.createdAt,
        updatedBy: safeActor.username,
        updatedByName: safeActor.displayName,
        updatedByRole: safeActor.role,
        updatedAt: new Date().toISOString()
      };
      const updated = await upsertBulletin(next);

      // Detect semantic action type
      let action = "edited";
      if (!before.published && updated.published) action = "published";
      else if (before.published && !updated.published) action = "unpublished";

      await logChange({ bulletinId: id, action, actor, before, after: updated });
      return updated;
    },
    async hideBulletin(id, actor) {
      const before = await findById(id);
      if (!before) return null;
      const safeActor = actorFields(actor);
      const next = {
        ...before,
        published: false,
        updatedBy: safeActor.username,
        updatedByName: safeActor.displayName,
        updatedByRole: safeActor.role,
        updatedAt: new Date().toISOString()
      };
      const updated = await upsertBulletin(next);
      await logChange({ bulletinId: id, action: "hidden", actor, before, after: updated });
      return updated;
    },
    async importBulletins(bulletins = [], actor = { username: "bootstrap-json", role: "system" }) {
      const imported = [];
      const safeActor = actorFields(actor);
      for (const bulletin of bulletins) {
        const existing = await findById(bulletin.id);
        if (existing) {
          imported.push(existing);
          continue;
        }
        const now = new Date().toISOString();
        imported.push(await this.addBulletin({
          ...bulletin,
          createdBy: bulletin.createdBy || safeActor.username,
          createdByName: bulletin.createdByName || safeActor.displayName,
          createdByRole: bulletin.createdByRole || safeActor.role,
          createdAt: bulletin.createdAt || now,
          updatedBy: bulletin.updatedBy || safeActor.username,
          updatedByName: bulletin.updatedByName || safeActor.displayName,
          updatedByRole: bulletin.updatedByRole || safeActor.role,
          updatedAt: bulletin.updatedAt || now
        }, safeActor));
      }
      return imported;
    },
    async getLogs(id, { page = 1, pageSize = 20 } = {}) {
      await ensureSchema();
      const safePageSize = Math.max(1, Math.min(100, Number(pageSize) || 20));
      const [countRows] = await pool.query("SELECT COUNT(*) AS total FROM safety_bulletin_logs WHERE bulletin_id = ?", [id]);
      const totalItems = Number(countRows[0]?.total || 0);
      const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
      const currentPage = Math.max(1, Math.min(totalPages, Number(page) || 1));
      const offset = (currentPage - 1) * safePageSize;
      const [rows] = await pool.query(
        `SELECT * FROM safety_bulletin_logs
         WHERE bulletin_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
        [id, safePageSize, offset]
      );
      return {
        items: rows.map(rowToLog),
        pagination: { page: currentPage, pageSize: safePageSize, totalItems, totalPages }
      };
    }
  };
};
