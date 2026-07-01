import fs from "fs";
import mysql from "mysql2/promise";
import path from "path";

const SETTING_KEY = "main_config";

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

export const createMysqlConfigStore = ({ rootDir }) => {
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

  const migrationPath = path.join(rootDir, "database", "migrations", "003_app_settings_schema.sql");
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

  return {
    type: "mysql",
    ensureSchema,
    async readConfig() {
      await ensureSchema();
      const [rows] = await pool.query("SELECT value_json FROM app_settings WHERE setting_key = ? LIMIT 1", [
        SETTING_KEY
      ]);
      if (!rows[0]) return null;
      return JSON.parse(rows[0].value_json);
    },
    async writeConfig(config, actor = "system") {
      await ensureSchema();
      const valueJson = JSON.stringify(config);
      await pool.query(
        `INSERT INTO app_settings (setting_key, value_json, updated_by, updated_at)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           value_json = VALUES(value_json),
           updated_by = VALUES(updated_by),
           updated_at = VALUES(updated_at)`,
        [SETTING_KEY, valueJson, actor, toMysqlDate()]
      );
      return config;
    }
  };
};
