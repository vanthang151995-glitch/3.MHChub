import fs from "fs";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";
import { loadLocalEnv } from "../server/loadEnv.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

loadLocalEnv(rootDir);

if (!process.env.MHCHUB_MYSQL_HOST || !process.env.MHCHUB_MYSQL_DATABASE || !process.env.MHCHUB_MYSQL_USER) {
  console.error("MySQL config is missing. Check MHCHUB_MYSQL_* variables.");
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const databaseDir = path.join(rootDir, "database");
const sqlPath = path.join(databaseDir, `mhchub-data-${timestamp}.sql`);
const manifestPath = path.join(databaseDir, `mhchub-data-${timestamp}.manifest.json`);
const readmePath = path.join(databaseDir, `README_DATA_RESTORE-${timestamp}.md`);

const quoteIdentifier = (value) => `\`${String(value).replace(/`/g, "``")}\``;

const connection = await mysql.createConnection({
  host: process.env.MHCHUB_MYSQL_HOST,
  port: Number(process.env.MHCHUB_MYSQL_PORT || 3306),
  user: process.env.MHCHUB_MYSQL_USER,
  password: process.env.MHCHUB_MYSQL_PASSWORD || "",
  database: process.env.MHCHUB_MYSQL_DATABASE,
  dateStrings: true,
  timezone: "Z"
});

const databaseName = process.env.MHCHUB_MYSQL_DATABASE;
const [tableRows] = await connection.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
const tableNameKey = `Tables_in_${databaseName}`;
const tables = tableRows.map((row) => row[tableNameKey]).filter(Boolean).sort((a, b) => a.localeCompare(b));

const tableStats = [];
const chunks = [
  "-- MHChub MySQL data dump",
  `-- Generated at ${new Date().toISOString()}`,
  `-- Database: ${databaseName}`,
  "SET NAMES utf8mb4;",
  "SET FOREIGN_KEY_CHECKS=0;",
  "SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';",
  ""
];

for (const table of tables) {
  const quotedTable = quoteIdentifier(table);
  const [createRows] = await connection.query(`SHOW CREATE TABLE ${quotedTable}`);
  const createSql = createRows[0]?.["Create Table"];
  const [countRows] = await connection.query(`SELECT COUNT(*) AS total FROM ${quotedTable}`);
  const total = Number(countRows[0]?.total || 0);
  tableStats.push({ table, rows: total });

  chunks.push(`--`, `-- Table structure for ${quotedTable}`, `--`, `DROP TABLE IF EXISTS ${quotedTable};`, `${createSql};`, "");

  if (!total) continue;

  const [columnsRows] = await connection.query(`SHOW COLUMNS FROM ${quotedTable}`);
  const columns = columnsRows.map((row) => row.Field);
  const quotedColumns = columns.map(quoteIdentifier).join(", ");
  const [rows] = await connection.query(`SELECT * FROM ${quotedTable}`);
  const batchSize = 100;

  chunks.push(`--`, `-- Data for ${quotedTable}`, `--`);
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = batch.map((row) => `(${columns.map((column) => connection.escape(row[column])).join(", ")})`).join(",\n");
    chunks.push(`INSERT INTO ${quotedTable} (${quotedColumns}) VALUES\n${values};`);
  }
  chunks.push("");
}

chunks.push("SET FOREIGN_KEY_CHECKS=1;", "");
await fs.promises.writeFile(sqlPath, chunks.join("\n"), "utf8");

const manifest = {
  generatedAt: new Date().toISOString(),
  database: databaseName,
  host: process.env.MHCHUB_MYSQL_HOST,
  port: Number(process.env.MHCHUB_MYSQL_PORT || 3306),
  dumpCreated: true,
  dumpRelativePath: path.relative(rootDir, sqlPath).replace(/\\/g, "/"),
  tableCount: tables.length,
  tables: tableStats
};

await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
await fs.promises.writeFile(
  readmePath,
  [
    "# MHChub Data Restore",
    "",
    `Generated: ${manifest.generatedAt}`,
    "",
    "## Latest MySQL Dump",
    "",
    `- ${path.basename(sqlPath)} (${tables.length} tables)`,
    "",
    "## Restore",
    "",
    "```powershell",
    `mysql --default-character-set=utf8mb4 -h <host> -P <port> -u <user> -p ${databaseName} < database/${path.basename(sqlPath)}`,
    "```",
    "",
    "The dump includes schema and data. Keep the current filesystem documents/uploads together with this SQL file."
  ].join("\n"),
  "utf8"
);

await connection.end();

console.log(JSON.stringify({ sqlPath, manifestPath, readmePath, tableCount: tables.length }, null, 2));
