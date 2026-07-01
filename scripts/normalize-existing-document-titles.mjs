import fs from "fs";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";
import {
  isPlaceholderDocumentTitle,
  normalizeDocumentTitleForStorage
} from "../shared/documentDisplay.js";
import { loadLocalEnv } from "../server/loadEnv.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

loadLocalEnv(rootDir);

const hasFlag = (name) => process.argv.includes(name);
const applyMode = hasFlag("--apply");
const checkMode = hasFlag("--check");
const mode = applyMode ? "apply" : checkMode ? "check" : "dry-run";

const docsFile = path.join(rootDir, "server", "data", "documents.json");
const reportPath = path.join(rootDir, "qa", "reports", "document-title-normalization-report.json");
const mysqlRequiredEnv = ["MHCHUB_MYSQL_HOST", "MHCHUB_MYSQL_DATABASE", "MHCHUB_MYSQL_USER"];

const cleanText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const envNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const hasMysqlConfig = () => mysqlRequiredEnv.every((name) => Boolean(process.env[name]));

const connectMysql = () =>
  mysql.createPool({
    host: process.env.MHCHUB_MYSQL_HOST,
    port: envNumber("MHCHUB_MYSQL_PORT", 3306),
    user: process.env.MHCHUB_MYSQL_USER,
    password: process.env.MHCHUB_MYSQL_PASSWORD || "",
    database: process.env.MHCHUB_MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 2,
    dateStrings: true,
    charset: "utf8mb4"
  });

const toSafeTimestamp = (date = new Date()) => date.toISOString().replace(/[:.]/g, "-");

const readDocuments = () => JSON.parse(fs.readFileSync(docsFile, "utf8"));

const writeDocuments = (documents) => {
  fs.writeFileSync(docsFile, `${JSON.stringify(documents, null, 2)}\n`, "utf8");
};

const rowToDocumentLike = (row) => ({
  fileName: row.file_name || "",
  id: String(row.id || ""),
  originalName: row.original_name || "",
  title: row.title || ""
});

const buildTitleChange = (document, source) => {
  const oldTitle = cleanText(document.title);
  if (!isPlaceholderDocumentTitle(oldTitle)) return null;

  const newTitle = normalizeDocumentTitleForStorage({
    fallback: oldTitle || document.originalName || document.fileName || document.id || "Document",
    fileName: document.fileName || "",
    originalName: document.originalName || "",
    title: oldTitle
  });

  if (!newTitle || isPlaceholderDocumentTitle(newTitle) || newTitle === oldTitle) return null;

  return {
    fileName: document.fileName || "",
    id: String(document.id || ""),
    newTitle,
    oldTitle,
    originalName: document.originalName || "",
    source
  };
};

const inspectMysqlDocuments = async () => {
  if (!hasMysqlConfig()) {
    return {
      available: false,
      changes: [],
      error: "",
      missingEnv: mysqlRequiredEnv.filter((name) => !process.env[name]),
      rows: []
    };
  }

  const pool = connectMysql();
  try {
    const [rows] = await pool.query("SELECT id, title, original_name, file_name FROM documents ORDER BY id");
    const documents = rows.map(rowToDocumentLike);
    return {
      available: true,
      changes: documents.map((document) => buildTitleChange(document, "mysql")).filter(Boolean),
      error: "",
      missingEnv: [],
      rows
    };
  } catch (error) {
    return {
      available: true,
      changes: [],
      error: error.message,
      missingEnv: [],
      rows: []
    };
  } finally {
    await pool.end();
  }
};

const createApplyBackup = ({ documents, mysqlRows, titleChanges }) => {
  const backupDir = path.join(rootDir, "backups", "data", `${toSafeTimestamp()}-document-title-normalization`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(docsFile, path.join(backupDir, "documents.json"));
  fs.writeFileSync(path.join(backupDir, "mysql-documents-before.json"), `${JSON.stringify(mysqlRows, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(backupDir, "manifest.json"),
    `${JSON.stringify(
      {
        generatedAtUtc: new Date().toISOString(),
        documentsFile: docsFile,
        jsonDocumentCount: documents.length,
        mysqlRowCount: mysqlRows.length,
        titleChanges
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return backupDir;
};

const applyJsonChanges = (documents, changes) => {
  if (!changes.length) return 0;
  const nextTitleById = new Map(changes.map((change) => [change.id, change.newTitle]));
  const nextDocuments = documents.map((document) => {
    const nextTitle = nextTitleById.get(String(document.id || ""));
    return nextTitle ? { ...document, title: nextTitle } : document;
  });
  writeDocuments(nextDocuments);
  return changes.length;
};

const applyMysqlChanges = async (changes) => {
  if (!changes.length) return 0;
  const pool = connectMysql();
  try {
    let applied = 0;
    for (const change of changes) {
      const [result] = await pool.query("UPDATE documents SET title = ? WHERE id = ?", [change.newTitle, change.id]);
      if (result.affectedRows) applied += 1;
    }
    return applied;
  } finally {
    await pool.end();
  }
};

const writeReport = (report) => {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
};

const main = async () => {
  const failedChecks = [];
  const warnings = [];
  const documents = readDocuments();
  const jsonChanges = documents.map((document) => buildTitleChange(document, "json")).filter(Boolean);
  const mysqlInspection = await inspectMysqlDocuments();
  const mysqlChanges = mysqlInspection.changes;
  const plannedChanges = [...jsonChanges, ...mysqlChanges];

  if (mysqlInspection.error) {
    failedChecks.push({
      evidence: { message: mysqlInspection.error },
      name: "mysql-documents-readable",
      pass: false
    });
  }

  if (!mysqlInspection.available) {
    warnings.push({
      evidence: { missingEnv: mysqlInspection.missingEnv },
      name: "mysql-not-configured-json-only"
    });
  }

  if (checkMode && jsonChanges.length) {
    failedChecks.push({
      evidence: { changes: jsonChanges },
      name: "documents-json-has-no-placeholder-storage-titles",
      pass: false
    });
  }

  if (checkMode && mysqlChanges.length) {
    failedChecks.push({
      evidence: { changes: mysqlChanges },
      name: "mysql-documents-have-no-placeholder-storage-titles",
      pass: false
    });
  }

  if (!checkMode && plannedChanges.length) {
    warnings.push({
      evidence: { plannedChanges },
      name: "placeholder-storage-titles-pending"
    });
  }

  let applied = { json: 0, mysql: 0 };
  let backupDir = "";

  if (applyMode && !failedChecks.length) {
    if (plannedChanges.length) {
      backupDir = createApplyBackup({
        documents,
        mysqlRows: mysqlInspection.rows,
        titleChanges: plannedChanges
      });
    }
    applied = {
      json: applyJsonChanges(documents, jsonChanges),
      mysql: mysqlInspection.available ? await applyMysqlChanges(mysqlChanges) : 0
    };
  }

  const summary = {
    appliedJson: applied.json,
    appliedMysql: applied.mysql,
    failed: failedChecks.length,
    jsonDocuments: documents.length,
    jsonPlannedChanges: jsonChanges.length,
    mysqlPlannedChanges: mysqlChanges.length,
    mysqlRows: mysqlInspection.rows.length,
    passed: failedChecks.length ? 0 : 1,
    total: failedChecks.length ? failedChecks.length : 1,
    warnings: warnings.length
  };

  const report = {
    backupDir,
    failedChecks,
    generatedAtUtc: new Date().toISOString(),
    mode,
    ok: failedChecks.length === 0,
    plannedChanges: {
      json: jsonChanges,
      mysql: mysqlChanges
    },
    reportPath,
    summary,
    warnings
  };

  writeReport(report);

  console.log(
    JSON.stringify(
      {
        backupDir,
        mode,
        ok: report.ok,
        reportPath,
        summary
      },
      null,
      2
    )
  );

  if (!report.ok) process.exit(1);
};

main().catch((error) => {
  const report = {
    failedChecks: [{ evidence: { message: error.message }, name: "document-title-normalization-script", pass: false }],
    generatedAtUtc: new Date().toISOString(),
    mode,
    ok: false,
    reportPath,
    summary: { failed: 1, passed: 0, total: 1, warnings: 0 },
    warnings: []
  };
  writeReport(report);
  console.error(JSON.stringify({ mode, ok: false, reportPath, error: error.message }, null, 2));
  process.exit(1);
});
