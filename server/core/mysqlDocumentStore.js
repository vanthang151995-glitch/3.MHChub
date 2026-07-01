import fs from "fs";
import mysql from "mysql2/promise";
import path from "path";
import { localizedTextJson, localizedTextValue, parseLocalizedText } from "./localizedText.js";
import { normalizeDocumentPatch, normalizeDocumentTextFields } from "./textEncoding.js";

const hasMysqlConfig = () =>
  !!(process.env.MHCHUB_MYSQL_HOST && process.env.MHCHUB_MYSQL_DATABASE && process.env.MHCHUB_MYSQL_USER);

const envNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

const toJson = (value) => {
  if (value === undefined || value === null || value === "") return null;
  return JSON.stringify(value);
};

const toMysqlDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
};

const toIso = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const parseMigration = (sql) =>
  sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);

const rowToDocument = (row) =>
  normalizeDocumentTextFields({
    id: String(row.id),
    title: row.title || "",
    titleI18n: parseLocalizedText(row.title_i18n_json, row.title || ""),
    category: row.category || "general",
    departmentId: row.department_id || "company",
    departmentName: row.department_name || "",
    language: row.language || "vi",
    version: row.version || "1.0",
    originalName: row.original_name || "",
    fileName: row.file_name || "",
    mimeType: row.mime_type || "",
    size: Number(row.size || 0),
    uploadedAt: toIso(row.uploaded_at),
    url: row.url || "",
    source: row.source || "",
    sourcePath: row.source_path || "",
    storagePath: row.storage_path || "",
    previewFileName: row.preview_file_name || "",
    previewMimeType: row.preview_mime_type || "",
    previewUrl: row.preview_url || "",
    previewStatus: row.preview_status || "",
    previewError: row.preview_error || "",
    previewGeneratedAt: toIso(row.preview_generated_at),
    previewSize: Number(row.preview_size || 0),
    documentCode: row.document_code || "",
    documentType: row.document_type || "",
    scopeLevel: row.scope_level || "",
    ownerRole: row.owner_role || "",
    section6s: row.section_6s || "",
    effectiveDate: row.effective_date || "",
    tags: parseJson(row.tags_json, []),
    checksum: row.checksum || "",
    ocrStatus: row.ocr_status || "",
    ocrError: row.ocr_error || "",
    ocrUpdatedAt: toIso(row.ocr_updated_at),
    supersedesDocumentId: row.supersedes_document_id || "",
    createdBy: row.created_by || "",
    createdByName: row.created_by_name || "",
    createdByRole: row.created_by_role || "",
    createdAt: toIso(row.created_at),
    updatedBy: row.updated_by || "",
    updatedByName: row.updated_by_name || "",
    updatedByRole: row.updated_by_role || "",
    updatedAt: toIso(row.updated_at)
  });

const DOCUMENT_KIND_TOKENS = {
  excel: ["spreadsheet", "excel", ".xls", ".xlsx", ".csv"],
  image: ["image", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"],
  pdf: ["pdf"],
  slide: ["presentation", "powerpoint", ".ppt", ".pptx"],
  video: ["video", ".mp4", ".mov", ".avi", ".webm"],
  word: ["word", ".doc", ".docx"]
};

const normalizeDocumentKind = (value = "") => {
  const kind = String(value || "").trim().toLowerCase();
  if (!kind || kind === "all" || kind === "tất cả") return "";
  if (kind === "powerpoint") return "slide";
  if (kind === "hình ảnh" || kind === "image") return "image";
  return DOCUMENT_KIND_TOKENS[kind] ? kind : "";
};

const appendDocumentKindWhere = ({ fileType, params, where }) => {
  const kind = normalizeDocumentKind(fileType);
  const tokens = DOCUMENT_KIND_TOKENS[kind] || [];
  if (!tokens.length) return;
  const fields = ["mime_type", "title", "title_i18n_json", "original_name", "file_name"];
  const clauses = [];
  tokens.forEach((token) => {
    fields.forEach((field) => {
      clauses.push(`LOWER(${field}) LIKE ?`);
      params.push(`%${token}%`);
    });
  });
  where.push(`(${clauses.join(" OR ")})`);
};

const documentParams = (input) => {
  const document = normalizeDocumentTextFields(input);
  const titleI18n = parseLocalizedText(document.titleI18n ?? document.title, document.title || document.originalName || "Document");
  return [
    document.id,
    localizedTextValue(titleI18n, "vi", document.title || document.originalName || "Document"),
    localizedTextJson(titleI18n),
    document.category || "general",
    document.departmentId || "company",
    document.departmentName || null,
    document.language || "vi",
    document.version || "1.0",
    document.originalName || null,
    document.fileName || null,
    document.mimeType || null,
    asNumber(document.size, 0),
    toMysqlDate(document.uploadedAt),
    document.url || null,
    document.source || null,
    document.sourcePath || null,
    document.storagePath || null,
    document.previewFileName || null,
    document.previewMimeType || null,
    document.previewUrl || null,
    document.previewStatus || null,
    document.previewError || null,
    toMysqlDate(document.previewGeneratedAt),
    document.previewSize == null ? null : asNumber(document.previewSize, 0),
    document.documentCode || null,
    document.documentType || null,
    document.scopeLevel || null,
    document.ownerRole || null,
    document.section6s || null,
    toMysqlDate(document.effectiveDate),
    toJson(document.tags),
    document.checksum || null,
    document.ocrStatus || null,
    document.ocrError || null,
    toMysqlDate(document.ocrUpdatedAt),
    document.supersedesDocumentId || null,
    document.createdBy || null,
    document.createdByName || null,
    document.createdByRole || null,
    toMysqlDate(document.createdAt || document.uploadedAt),
    document.updatedBy || null,
    document.updatedByName || null,
    document.updatedByRole || null,
    toMysqlDate(document.updatedAt || document.createdAt || document.uploadedAt)
  ];
};

const documentColumns = [
  "id",
  "title",
  "title_i18n_json",
  "category",
  "department_id",
  "department_name",
  "language",
  "version",
  "original_name",
  "file_name",
  "mime_type",
  "size",
  "uploaded_at",
  "url",
  "source",
  "source_path",
  "storage_path",
  "preview_file_name",
  "preview_mime_type",
  "preview_url",
  "preview_status",
  "preview_error",
  "preview_generated_at",
  "preview_size",
  "document_code",
  "document_type",
  "scope_level",
  "owner_role",
  "section_6s",
  "effective_date",
  "tags_json",
  "checksum",
  "ocr_status",
  "ocr_error",
  "ocr_updated_at",
  "supersedes_document_id",
  "created_by",
  "created_by_name",
  "created_by_role",
  "created_at",
  "updated_by",
  "updated_by_name",
  "updated_by_role",
  "updated_at"
];

const updateColumns = documentColumns.filter((column) => column !== "id");

const updateMap = {
  title: "title",
  titleI18n: "title_i18n_json",
  category: "category",
  departmentId: "department_id",
  departmentName: "department_name",
  language: "language",
  version: "version",
  previewFileName: "preview_file_name",
  previewMimeType: "preview_mime_type",
  previewUrl: "preview_url",
  previewStatus: "preview_status",
  previewError: "preview_error",
  previewGeneratedAt: "preview_generated_at",
  previewSize: "preview_size",
  documentCode: "document_code",
  documentType: "document_type",
  scopeLevel: "scope_level",
  ownerRole: "owner_role",
  section6s: "section_6s",
  effectiveDate: "effective_date",
  tags: "tags_json",
  checksum: "checksum",
  ocrStatus: "ocr_status",
  ocrError: "ocr_error",
  ocrUpdatedAt: "ocr_updated_at",
  supersedesDocumentId: "supersedes_document_id",
  updatedAt: "updated_at",
  updatedBy: "updated_by",
  updatedByName: "updated_by_name",
  updatedByRole: "updated_by_role"
};

export const createMysqlDocumentStore = ({ rootDir }) => {
  if (!hasMysqlConfig()) return null;

  const pool = mysql.createPool({
    host: process.env.MHCHUB_MYSQL_HOST,
    port: envNumber("MHCHUB_MYSQL_PORT", 3306),
    user: process.env.MHCHUB_MYSQL_USER,
    password: process.env.MHCHUB_MYSQL_PASSWORD || "",
    database: process.env.MHCHUB_MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: envNumber("MHCHUB_MYSQL_CONNECTION_LIMIT", 10),
    timezone: "Z"
  });

  const migrationPath = path.join(rootDir, "database", "migrations", "002_documents_schema.sql");
  let schemaReady = null;

  const ensureDocumentColumns = async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS safety_document_text_chunks (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        document_id VARCHAR(64) NOT NULL,
        chunk_index INT NOT NULL DEFAULT 0,
        source_page VARCHAR(64) NULL,
        text_content MEDIUMTEXT NOT NULL,
        extraction_method VARCHAR(64) NOT NULL DEFAULT 'manual',
        ocr_status VARCHAR(64) NOT NULL DEFAULT 'indexed',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        UNIQUE KEY uq_safety_document_chunk (document_id, chunk_index),
        FULLTEXT KEY ft_safety_document_text (text_content),
        KEY idx_safety_document_text_document (document_id),
        KEY idx_safety_document_text_status (ocr_status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const managedColumns = [
      ["title_i18n_json", "LONGTEXT NULL"],
      ["preview_file_name", "VARCHAR(255) NULL"],
      ["preview_mime_type", "VARCHAR(191) NULL"],
      ["preview_url", "VARCHAR(500) NULL"],
      ["preview_status", "VARCHAR(64) NULL"],
      ["preview_error", "VARCHAR(500) NULL"],
      ["preview_generated_at", "DATETIME NULL"],
      ["preview_size", "BIGINT NULL"],
      ["document_code", "VARCHAR(64) NULL"],
      ["document_type", "VARCHAR(64) NULL"],
      ["scope_level", "VARCHAR(32) NULL"],
      ["owner_role", "VARCHAR(64) NULL"],
      ["section_6s", "VARCHAR(120) NULL"],
      ["effective_date", "DATE NULL"],
      ["tags_json", "JSON NULL"],
      ["checksum", "VARCHAR(128) NULL"],
      ["ocr_status", "VARCHAR(64) NULL"],
      ["ocr_error", "VARCHAR(500) NULL"],
      ["ocr_updated_at", "DATETIME NULL"],
      ["supersedes_document_id", "VARCHAR(64) NULL"]
    ];

    for (const [column, definition] of managedColumns) {
      const [rows] = await pool.query("SHOW COLUMNS FROM documents LIKE ?", [column]);
      if (!rows.length) {
        await pool.query(`ALTER TABLE documents ADD COLUMN ${column} ${definition}`);
      }
    }
  };

  const ensureSchema = async () => {
    if (!schemaReady) {
      schemaReady = (async () => {
        const migration = fs.readFileSync(migrationPath, "utf8");
        for (const statement of parseMigration(migration)) {
          await pool.query(statement);
        }
        await ensureDocumentColumns();
      })();
    }
    return schemaReady;
  };

  const findById = async (id) => {
    await ensureSchema();
    const [rows] = await pool.query("SELECT * FROM documents WHERE id = ? LIMIT 1", [id]);
    return rows[0] ? rowToDocument(rows[0]) : null;
  };

  const upsertDocument = async (document) => {
    await ensureSchema();
    const placeholders = documentColumns.map(() => "?").join(", ");
    const updates = updateColumns.map((column) => `${column} = VALUES(${column})`).join(", ");
    await pool.query(
      `INSERT INTO documents (${documentColumns.join(", ")})
       VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE ${updates}`,
      documentParams(document)
    );
    return findById(document.id);
  };

  return {
    type: "mysql",
    ensureSchema,
    async countDocuments() {
      await ensureSchema();
      const [rows] = await pool.query("SELECT COUNT(*) AS total FROM documents");
      return Number(rows[0]?.total || 0);
    },
    async getDocument(id) {
      return findById(id);
    },
    async getDocuments(query = {}) {
      await ensureSchema();
      const where = [];
      const params = [];
      const q = String(query.q || query.search || "").trim().toLowerCase();
      const category = String(query.category || "all");
      const departmentId = String(query.departmentId || "all");
      const fileType = query.fileType || query.kind;

      if (q) {
        where.push(`(
          LOWER(title) LIKE ? OR LOWER(title_i18n_json) LIKE ? OR LOWER(original_name) LIKE ? OR LOWER(document_code) LIKE ? OR
          EXISTS (
            SELECT 1 FROM safety_document_text_chunks chunks
            WHERE chunks.document_id = documents.id AND LOWER(chunks.text_content) LIKE ?
          )
        )`);
        params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
      }
      if (category !== "all") {
        where.push("category = ?");
        params.push(category);
      }
      if (departmentId !== "all") {
        where.push("(department_id = ? OR department_id = 'company')");
        params.push(departmentId);
      }
      appendDocumentKindWhere({ fileType, params, where });
      if (query.documentType) {
        where.push("document_type = ?");
        params.push(String(query.documentType));
      }
      if (query.scopeLevel) {
        where.push("scope_level = ?");
        params.push(String(query.scopeLevel));
      }
      if (query.ocrStatus) {
        where.push("ocr_status = ?");
        params.push(String(query.ocrStatus));
      }

      const pageSize = Math.max(1, Math.min(100, asNumber(query.pageSize, 10)));
      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM documents ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
        params
      );
      const totalItems = Number(countRows[0]?.total || 0);
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const page = Math.max(1, Math.min(totalPages, asNumber(query.page, 1)));
      const offset = (page - 1) * pageSize;
      const [rows] = await pool.query(
        `SELECT * FROM documents
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY COALESCE(uploaded_at, created_at, updated_at) DESC, id DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      );

      return {
        items: rows.map(rowToDocument),
        pagination: { page, pageSize, totalItems, totalPages }
      };
    },
    async addDocument(document) {
      return upsertDocument(document);
    },
    async updateDocument(id, updates) {
      await ensureSchema();
      const normalizedUpdates = normalizeDocumentPatch(updates);
      if (normalizedUpdates.title !== undefined && normalizedUpdates.titleI18n === undefined) {
        normalizedUpdates.titleI18n = parseLocalizedText(normalizedUpdates.title, normalizedUpdates.title);
      }
      const assignments = [];
      const params = [];
      Object.entries(normalizedUpdates).forEach(([key, value]) => {
        const column = updateMap[key];
        if (!column) return;
        assignments.push(`${column} = ?`);
        if (key === "tags") {
          params.push(toJson(value));
        } else if (key === "titleI18n") {
          const localizedTitle = parseLocalizedText(value, normalizedUpdates.title || "");
          params.push(localizedTextJson(localizedTitle));
          if (normalizedUpdates.title === undefined) {
            assignments.push("title = ?");
            params.push(localizedTextValue(localizedTitle, "vi", ""));
          }
        } else {
          params.push(key.endsWith("At") || key === "effectiveDate" ? toMysqlDate(value) : value === undefined ? null : value);
        }
      });
      if (!assignments.length) return findById(id);
      params.push(id);
      const [result] = await pool.query(`UPDATE documents SET ${assignments.join(", ")} WHERE id = ?`, params);
      if (!result.affectedRows) return null;
      return findById(id);
    },
    async deleteDocument(id) {
      const target = await findById(id);
      if (!target) return null;
      await pool.query("DELETE FROM documents WHERE id = ?", [id]);
      return target;
    },
    async importDocuments(documents) {
      const imported = [];
      for (const document of documents) {
        imported.push(await upsertDocument(document));
      }
      return imported;
    }
  };
};
