import fs from "fs";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeDocumentTextFields, repairMojibakeText } from "../server/core/textEncoding.js";
import { loadLocalEnv } from "../server/loadEnv.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

loadLocalEnv(rootDir);

const apply = process.argv.includes("--apply");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(rootDir, "backups", "ops", `${stamp}-document-font-repair`);
const docsFile = path.join(rootDir, "server", "data", "documents.json");

const mysqlTextColumns = [
  ["title", "title"],
  ["department_name", "departmentName"],
  ["original_name", "originalName"],
  ["source_path", "sourcePath"],
  ["preview_error", "previewError"],
  ["created_by_name", "createdByName"],
  ["updated_by_name", "updatedByName"]
];

const hasMysqlConfig = () =>
  !!(process.env.MHCHUB_MYSQL_HOST && process.env.MHCHUB_MYSQL_DATABASE && process.env.MHCHUB_MYSQL_USER);

const ensureBackupDir = () => {
  if (apply) fs.mkdirSync(backupDir, { recursive: true });
};

const changedObjectFields = (before, after, keys) =>
  keys
    .filter((key) => before[key] !== after[key])
    .map((key) => ({ key, before: before[key], after: after[key] }));

const repairJsonMirror = () => {
  if (!fs.existsSync(docsFile)) return { checked: 0, changed: 0 };
  const documents = JSON.parse(fs.readFileSync(docsFile, "utf8"));
  const normalized = documents.map(normalizeDocumentTextFields);
  const changes = documents
    .map((document, index) => ({
      id: document.id,
      fields: changedObjectFields(document, normalized[index], [
        "title",
        "departmentName",
        "originalName",
        "sourcePath",
        "previewError",
        "createdByName",
        "updatedByName"
      ])
    }))
    .filter((item) => item.fields.length);

  if (apply && changes.length) {
    ensureBackupDir();
    fs.copyFileSync(docsFile, path.join(backupDir, "documents.json"));
    fs.writeFileSync(docsFile, JSON.stringify(normalized, null, 2), "utf8");
  }

  for (const change of changes) {
    console.log(`[json] ${change.id}: ${change.fields.map((field) => field.key).join(", ")}`);
  }

  return { checked: documents.length, changed: changes.length };
};

const repairMysql = async () => {
  if (!hasMysqlConfig()) return { checked: 0, changed: 0, skipped: true };

  const pool = mysql.createPool({
    host: process.env.MHCHUB_MYSQL_HOST,
    port: Number(process.env.MHCHUB_MYSQL_PORT || 3306),
    user: process.env.MHCHUB_MYSQL_USER,
    password: process.env.MHCHUB_MYSQL_PASSWORD || "",
    database: process.env.MHCHUB_MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 2,
    timezone: "Z"
  });

  try {
    const columns = ["id", ...mysqlTextColumns.map(([column]) => column)];
    const [rows] = await pool.query(`SELECT ${columns.join(", ")} FROM documents ORDER BY id`);
    let changed = 0;

    if (apply) {
      ensureBackupDir();
      fs.writeFileSync(path.join(backupDir, "mysql-documents-text-before.json"), JSON.stringify(rows, null, 2), "utf8");
    }

    for (const row of rows) {
      const assignments = [];
      const params = [];
      const fieldNames = [];

      for (const [column, key] of mysqlTextColumns) {
        const value = row[column];
        if (typeof value !== "string") continue;
        const repaired = repairMojibakeText(value);
        if (repaired === value) continue;
        assignments.push(`${column} = ?`);
        params.push(repaired);
        fieldNames.push(key);
      }

      if (!assignments.length) continue;
      changed += 1;
      console.log(`[mysql] ${row.id}: ${fieldNames.join(", ")}`);

      if (apply) {
        params.push(row.id);
        await pool.query(`UPDATE documents SET ${assignments.join(", ")} WHERE id = ?`, params);
      }
    }

    return { checked: rows.length, changed };
  } finally {
    await pool.end();
  }
};

const jsonResult = repairJsonMirror();
const mysqlResult = await repairMysql();

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      backupDir: apply ? backupDir : null,
      json: jsonResult,
      mysql: mysqlResult
    },
    null,
    2
  )
);
