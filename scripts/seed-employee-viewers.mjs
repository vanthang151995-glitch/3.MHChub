import crypto from "crypto";
import fs from "fs";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";
import { loadLocalEnv } from "../server/loadEnv.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

loadLocalEnv(rootDir);

const employees = [
  ["00044", "PE1", "Đồng Văn Công"],
  ["00060", "PE1", "Đồng Văn Giang"],
  ["00067", "PE1", "Tạ Quang Dũng"],
  ["00307", "PE1", "Nguyễn Văn Cương"],
  ["00884", "PE1", "Nguyễn Văn Hạnh"],
  ["01763", "PE1", "Vũ Thị Thúy Hạnh"],
  ["01896", "PE1", "Nguyễn Thanh Bình"],
  ["01990", "PE1", "Tạ Nam Tiến"],
  ["02081", "PE1", "Nguyễn Văn Dược"],
  ["02161", "PE1", "Trần Thị Minh Hải"],
  ["02640", "PE1", "Nguyễn Đức Dũng"],
  ["02643", "PE1", "Nguyễn Ngô Hòa"],
  ["02648", "PE1", "Mã Thế Dương"],
  ["03102", "PE1", "Nguyễn Phi Long"],
  ["03108", "PE1", "Nguyễn Quốc Hưng"],
  ["03128", "PE1", "Nguyễn Thị Thơm"],
  ["03148", "PE1", "Phạm Quốc Cường"],
  ["03162", "PE1", "Nguyễn Hồng Ngọc"],
  ["03332", "PE1", "Nguyễn Thị Liễu"],
  ["03335", "PE1", "Nguyễn Văn Thắng"],
  ["03348", "PE1", "Dương Thị Kim"],
  ["03430", "PE1", "Dương Văn Phương"],
  ["03434", "PE1", "Nguyễn Đức Trung"],
  ["03443", "PE1", "Nguyễn Thị Phúc"],
  ["03506", "PE1", "Phạm Thanh Hiền"],
  ["04891", "PE1", "Đồng Thị Kim Ánh"],
  ["04892", "PE1", "Nguyễn Trung Kiên"],
  ["04893", "PE1", "Đỗ Văn Hoàng"],
  ["05017", "PE1", "Nguyễn Thị Tâm"],
  ["00607", "PE1PY2", "Trần Văn Khoa"],
  ["01102", "PE1PY2", "Nguyễn Thị Hiệp"],
  ["02010", "PE1PY2", "Vũ Thị Ngọc"],
  ["02522", "PE1PY2", "Nguyễn Thị Huệ"],
  ["02526", "PE1PY2", "Lưu Lý Vương"],
  ["02534", "PE1PY2", "Nguyễn Xuân Trường"],
  ["02535", "PE1PY2", "Nguyễn Huy Hùng"],
  ["02638", "PE1PY2", "Lê Minh Thư"],
  ["03110", "PE1PY2", "Nguyễn Ngọc Anh"],
  ["03117", "PE1PY2", "Hoàng Thu Thảo"],
  ["03120", "PE1PY2", "Lưu Thị Hương"],
  ["03152", "PE1PY2", "Đỗ Hữu Hoàn"],
  ["03158", "PE1PY2", "Lê Thùy Linh"],
  ["03337", "PE1PY2", "Dương Văn Thiện"],
  ["03340", "PE1PY2", "Nguyễn Văn Tiến"],
  ["03351", "PE1PY2", "Dương Đức Anh"],
  ["03354", "PE1PY2", "Đồng Trung Hiếu"],
  ["02157", "PE1PY2", "Vũ Duy Hoàng"],
  ["05125", "PE1PY2", "Nguyễn Liên Hoàn"]
];

const hashPassword = (password) => {
  const iterations = 210000;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
};

const requiredEnv = ["MHCHUB_MYSQL_HOST", "MHCHUB_MYSQL_DATABASE", "MHCHUB_MYSQL_USER"];
const missing = requiredEnv.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing MySQL env: ${missing.join(", ")}`);
  process.exit(1);
}

const envNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const pool = mysql.createPool({
  host: process.env.MHCHUB_MYSQL_HOST,
  port: envNumber("MHCHUB_MYSQL_PORT", 3306),
  user: process.env.MHCHUB_MYSQL_USER,
  password: process.env.MHCHUB_MYSQL_PASSWORD || "",
  database: process.env.MHCHUB_MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 2
});

const migration = fs
  .readFileSync(path.join(rootDir, "database", "migrations", "001_auth_schema.sql"), "utf8")
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
for (const statement of migration.split(";").map((item) => item.trim()).filter(Boolean)) {
  await pool.query(statement);
}
try {
  await pool.query("ALTER TABLE users ADD COLUMN display_name VARCHAR(191) NULL AFTER username");
} catch (error) {
  if (error?.code !== "ER_DUP_FIELDNAME") throw error;
}

const passwordHash = hashPassword("1");
let upserted = 0;
for (const [username, departmentId, displayName] of employees) {
  await pool.query(
    `INSERT INTO users (id, username, display_name, password, role, department_id, active_session_id, password_updated_at)
     VALUES (?, ?, ?, ?, 'viewer', ?, NULL, NOW())
     ON DUPLICATE KEY UPDATE
       display_name = VALUES(display_name),
       password = VALUES(password),
       role = 'viewer',
       department_id = VALUES(department_id),
       active_session_id = NULL,
       password_updated_at = NOW()`,
    [crypto.randomUUID(), username, displayName, passwordHash, departmentId]
  );
  upserted += 1;
}

await pool.end();
console.log(`Seeded ${upserted} employee viewer users with default password 1.`);
