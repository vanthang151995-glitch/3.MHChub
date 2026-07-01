import crypto from "crypto";
import fs from "fs";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";
import { loadLocalEnv } from "../server/loadEnv.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

loadLocalEnv(rootDir);

const authDir = path.join(rootDir, "server", "data", "auth");
const usersFile = path.join(authDir, "users.json");
const args = process.argv.slice(2);
const [usernameArg, passwordInputArg, passwordEnvNameArg, roleInputArg, displayNameInputArg, departmentIdInputArg] = args;
const usesPasswordEnv = passwordInputArg === "--password-env";
const passwordArg = usesPasswordEnv ? process.env[passwordEnvNameArg] || "" : passwordInputArg;
const roleArg = usesPasswordEnv ? roleInputArg : args[2];
const displayNameArg = usesPasswordEnv ? displayNameInputArg : args[3];
const departmentIdArg = usesPasswordEnv ? departmentIdInputArg : args[4];

if (!usernameArg || !passwordArg) {
  console.error("Usage: node scripts/ensure-admin-user.mjs <username> <password> [role]");
  console.error("   or: node scripts/ensure-admin-user.mjs <username> --password-env <ENV_NAME> [role]");
  process.exit(1);
}

const hashPassword = (password) => {
  const iterations = 210000;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
};

const readJson = (filePath, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
};

const hasMysqlConfig = () =>
  !!(process.env.MHCHUB_MYSQL_HOST && process.env.MHCHUB_MYSQL_DATABASE && process.env.MHCHUB_MYSQL_USER);

const envNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

fs.mkdirSync(authDir, { recursive: true });

const username = usernameArg.trim();
const role = ["admin", "ehs", "leader", "viewer"].includes(roleArg) ? roleArg : "admin";
const displayName = displayNameArg || username;
const departmentId = departmentIdArg || null;

if (hasMysqlConfig()) {
  const pool = mysql.createPool({
    host: process.env.MHCHUB_MYSQL_HOST,
    port: envNumber("MHCHUB_MYSQL_PORT", 3306),
    user: process.env.MHCHUB_MYSQL_USER,
    password: process.env.MHCHUB_MYSQL_PASSWORD || "",
    database: process.env.MHCHUB_MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 2
  });

  const sql = fs.readFileSync(path.join(rootDir, "database", "migrations", "001_auth_schema.sql"), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  for (const statement of sql.split(";").map((item) => item.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
  try {
    await pool.query("ALTER TABLE users ADD COLUMN display_name VARCHAR(191) NULL AFTER username");
  } catch (error) {
    if (error?.code !== "ER_DUP_FIELDNAME") throw error;
  }

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
    [crypto.randomUUID(), username, displayName, hashPassword(passwordArg), role, departmentId]
  );
  await pool.end();
  console.log(`Updated ${role} user in MySQL database ${process.env.MHCHUB_MYSQL_DATABASE}: ${username}`);
  process.exit(0);
}

const users = readJson(usersFile, []);
const existing = users.find((user) => String(user.username).toLowerCase() === username.toLowerCase());
const nextUser = {
  ...(existing || {}),
  id: existing?.id || crypto.randomUUID(),
  username,
  displayName,
  passwordHash: hashPassword(passwordArg),
  role,
  departmentId,
  activeSessionId: null,
  passwordUpdatedAt: new Date().toISOString(),
  createdAt: existing?.createdAt || new Date().toISOString()
};

const nextUsers = existing ? users.map((user) => (user.id === existing.id ? nextUser : user)) : [...users, nextUser];
fs.writeFileSync(usersFile, JSON.stringify(nextUsers, null, 2), "utf8");
console.log(`Updated ${role} user: ${username}`);
