import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";
import { localizedTextJson, parseLocalizedText } from "../server/core/localizedText.js";
import { loadLocalEnv } from "../server/loadEnv.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

loadLocalEnv(rootDir);

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");

const hasMysqlConfig = () =>
  !!(process.env.MHCHUB_MYSQL_HOST && process.env.MHCHUB_MYSQL_DATABASE && process.env.MHCHUB_MYSQL_USER);

const envNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const tablePlans = [
  { table: "documents", fields: [["title", "title_i18n_json"]] },
  {
    table: "safety_warnings",
    fields: [
      ["title", "title_i18n_json"],
      ["area", "area_i18n_json"],
      ["description", "description_i18n_json"],
      ["current_control", "current_control_i18n_json"],
      ["proposed_action", "proposed_action_i18n_json"],
      ["evidence_notes", "evidence_notes_i18n_json"],
      ["related_standard", "related_standard_i18n_json"],
      ["rejection_reason", "rejection_reason_i18n_json"]
    ]
  },
  {
    table: "safety_incidents",
    fields: [
      ["area", "area_i18n_json"],
      ["description", "description_i18n_json"],
      ["witnesses", "witnesses_i18n_json"],
      ["root_cause_detail", "root_cause_detail_i18n_json"],
      ["immediate_action", "immediate_action_i18n_json"],
      ["corrective_action", "corrective_action_i18n_json"],
      ["preventive_action", "preventive_action_i18n_json"],
      ["rejection_reason", "rejection_reason_i18n_json"]
    ]
  },
  {
    table: "safety_kpi_entries",
    fields: [
      ["notes", "notes_i18n_json"],
      ["rejection_reason", "rejection_reason_i18n_json"]
    ]
  },
  {
    table: "safety_reports",
    fields: [
      ["title", "title_i18n_json"],
      ["notes", "notes_i18n_json"]
    ]
  },
  {
    table: "safety_training_courses",
    fields: [
      ["name", "name_i18n_json"],
      ["category", "category_i18n_json"],
      ["duration", "duration_i18n_json"],
      ["notes", "notes_i18n_json"]
    ]
  },
  {
    table: "safety_notifications",
    fields: [
      ["title", "title_i18n_json"],
      ["message", "message_i18n_json"]
    ]
  }
];

const columnDefinitionFor = (column) => `${column} LONGTEXT NULL`;

const ensureColumn = async (pool, table, column) => {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
  if (rows.length) return false;
  if (apply) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${columnDefinitionFor(column)}`);
  }
  return true;
};

const countPending = async (pool, table, legacyColumn, i18nColumn) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM ${table}
     WHERE (${i18nColumn} IS NULL OR ${i18nColumn} = '')
       AND ${legacyColumn} IS NOT NULL
       AND ${legacyColumn} <> ''`
  );
  return Number(rows[0]?.total || 0);
};

const backfillField = async (pool, table, legacyColumn, i18nColumn) => {
  const [rows] = await pool.query(
    `SELECT id, ${legacyColumn} AS legacy_value FROM ${table}
     WHERE (${i18nColumn} IS NULL OR ${i18nColumn} = '')
       AND ${legacyColumn} IS NOT NULL
       AND ${legacyColumn} <> ''
     LIMIT 10000`
  );
  for (const row of rows) {
    await pool.query(`UPDATE ${table} SET ${i18nColumn} = ? WHERE id = ?`, [
      localizedTextJson(parseLocalizedText(row.legacy_value, row.legacy_value)),
      row.id
    ]);
  }
  return rows.length;
};

if (!hasMysqlConfig()) {
  console.error("Missing MHChub MySQL configuration in environment/.env.");
  process.exit(1);
}

const pool = mysql.createPool({
  host: process.env.MHCHUB_MYSQL_HOST,
  port: envNumber("MHCHUB_MYSQL_PORT", 3306),
  user: process.env.MHCHUB_MYSQL_USER,
  password: process.env.MHCHUB_MYSQL_PASSWORD || "",
  database: process.env.MHCHUB_MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 2,
  timezone: "Z"
});

try {
  const summary = [];
  for (const plan of tablePlans) {
    for (const [legacyColumn, i18nColumn] of plan.fields) {
      const missingColumn = await ensureColumn(pool, plan.table, i18nColumn);
      const pending = missingColumn && !apply ? 0 : await countPending(pool, plan.table, legacyColumn, i18nColumn);
      const updated = apply && !missingColumn ? await backfillField(pool, plan.table, legacyColumn, i18nColumn) : 0;
      const createdAndUpdated = apply && missingColumn ? await backfillField(pool, plan.table, legacyColumn, i18nColumn) : 0;
      summary.push({
        table: plan.table,
        field: legacyColumn,
        i18nField: i18nColumn,
        columnCreated: missingColumn && apply,
        columnMissing: missingColumn && !apply,
        pending,
        updated: updated + createdAndUpdated
      });
    }
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", summary }, null, 2));
} finally {
  await pool.end();
}
