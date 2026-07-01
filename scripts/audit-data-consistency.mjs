import fs from "fs";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";
import { loadLocalEnv } from "../server/loadEnv.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const reportsDir = path.join(rootDir, "qa", "reports");
const reportPath = path.join(reportsDir, "data-consistency-audit.json");

loadLocalEnv(rootDir);

const readArg = (name, fallback) => {
  const index = process.argv.lastIndexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
};

const hasFlag = (name) => process.argv.includes(name);

const targetBulletinId = readArg("--bulletin", "bulletin-safety-meeting-2026-05");
const baseUrl = readArg("--url", process.env.VERIFY_BASE_URL || "http://127.0.0.1:3333/");
const skipApi = hasFlag("--skip-api");
const skipMysql = hasFlag("--skip-mysql");
const expectedViPoints = Number(readArg("--expect-vi-points", targetBulletinId === "bulletin-safety-meeting-2026-05" ? "38" : "0"));
const defaultRequiredPointNeedles =
  targetBulletinId === "bulletin-safety-meeting-2026-05"
    ? [
        "\u0110\u00e0o t\u1ea1o h\u00f3a ch\u1ea5t/m\u00f4i tr\u01b0\u1eddng OS",
        "b\u00e1c s\u0129 ph\u1ea3n h\u1ed3i",
        "1 mm",
        "EHS-QT-08",
        "PC giao h\u00e0ng"
      ]
    : [];
const requiredPointNeedles = process.argv.includes("--require-point")
  ? [readArg("--require-point", "")].filter(Boolean)
  : defaultRequiredPointNeedles;

const badTokens = [
  ["Nguy", "n"].join("?"),
  String.fromCodePoint(0xfffd),
  String.fromCodePoint(0x76fb),
  String.fromCodePoint(0x862f),
  String.fromCodePoint(0xff83),
  String.fromCodePoint(0x9edb)
];

const checks = [];

const addCheck = (name, pass, evidence = {}) => {
  checks.push({ name, pass: Boolean(pass), evidence });
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const pointCounts = (bulletin) => {
  const points = bulletin?.points || {};
  return {
    vi: Array.isArray(points.vi) ? points.vi.length : 0,
    en: Array.isArray(points.en) ? points.en.length : 0,
    ja: Array.isArray(points.ja) ? points.ja.length : 0
  };
};

const findBulletin = (config, id) => (Array.isArray(config?.safetyBulletins) ? config.safetyBulletins : []).find((item) => item.id === id) || null;

const hasBadText = (value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return badTokens.some((token) => text.includes(token));
};

const hasRequiredPoint = (bulletin, needle) => {
  if (!needle) return true;
  const points = bulletin?.points?.vi;
  return Array.isArray(points) && points.some((point) => String(point).includes(needle));
};

const hasRequiredPoints = (bulletin, needles = []) => needles.every((needle) => hasRequiredPoint(bulletin, needle));

const fetchJson = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
};

const hasMysqlConfig = () =>
  !!(process.env.MHCHUB_MYSQL_HOST && process.env.MHCHUB_MYSQL_DATABASE && process.env.MHCHUB_MYSQL_USER);

const envNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

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

const compareCounts = (left, right) =>
  left.vi === right.vi && left.en === right.en && left.ja === right.ja;

const configPath = path.join(rootDir, "server", "data", "config.json");
const jsonConfig = readJson(configPath);
const jsonBulletin = findBulletin(jsonConfig, targetBulletinId);
const jsonCounts = pointCounts(jsonBulletin);

addCheck("json-fallback-has-target-bulletin", !!jsonBulletin, { targetBulletinId });
addCheck("json-fallback-has-no-known-mojibake", !hasBadText(jsonBulletin), { targetBulletinId });
if (expectedViPoints > 0) {
  addCheck("json-fallback-expected-vi-point-count", jsonCounts.vi === expectedViPoints, { expectedViPoints, jsonCounts });
}
addCheck("json-fallback-required-point-present", hasRequiredPoints(jsonBulletin, requiredPointNeedles), {
  targetBulletinId,
  requiredPoints: requiredPointNeedles
});

let mysqlEvidence = null;
if (!skipMysql) {
  if (!hasMysqlConfig()) {
    addCheck("mysql-env-present", false, {
      missing: ["MHCHUB_MYSQL_HOST", "MHCHUB_MYSQL_DATABASE", "MHCHUB_MYSQL_USER"].filter((name) => !process.env[name])
    });
  } else {
    const pool = connectMysql();
    try {
      const [settingRows] = await pool.query("SELECT value_json, updated_by FROM app_settings WHERE setting_key = ? LIMIT 1", [
        "main_config"
      ]);
      const appConfig = settingRows[0]?.value_json ? JSON.parse(settingRows[0].value_json) : null;
      const appBulletin = findBulletin(appConfig, targetBulletinId);
      const appCounts = pointCounts(appBulletin);

      const [bulletinRows] = await pool.query(
        "SELECT title_json, summary_json, points_json, audience_json, updated_by_name FROM safety_bulletins WHERE id = ? LIMIT 1",
        [targetBulletinId]
      );
      const safetyBulletin = bulletinRows[0]
        ? {
            title: JSON.parse(bulletinRows[0].title_json || "{}"),
            summary: JSON.parse(bulletinRows[0].summary_json || "{}"),
            points: JSON.parse(bulletinRows[0].points_json || "{}"),
            audience: JSON.parse(bulletinRows[0].audience_json || "{}"),
            updatedByName: bulletinRows[0].updated_by_name || ""
          }
        : null;
      const safetyCounts = pointCounts(safetyBulletin);

      mysqlEvidence = {
        appSettingsUpdatedBy: settingRows[0]?.updated_by || "",
        appCounts,
        safetyCounts,
        safetyUpdatedByName: safetyBulletin?.updatedByName || ""
      };

      addCheck("mysql-app-settings-has-target-bulletin", !!appBulletin, { targetBulletinId });
      addCheck("mysql-safety-table-has-target-bulletin", !!safetyBulletin, { targetBulletinId });
      addCheck("mysql-app-settings-matches-json-counts", compareCounts(appCounts, jsonCounts), { appCounts, jsonCounts });
      addCheck("mysql-safety-table-matches-json-counts", compareCounts(safetyCounts, jsonCounts), { safetyCounts, jsonCounts });
      addCheck("mysql-app-settings-required-point-present", hasRequiredPoints(appBulletin, requiredPointNeedles), {
        requiredPoints: requiredPointNeedles
      });
      addCheck("mysql-safety-table-required-point-present", hasRequiredPoints(safetyBulletin, requiredPointNeedles), {
        requiredPoints: requiredPointNeedles
      });
      addCheck("mysql-records-have-no-known-mojibake", !hasBadText({ appBulletin, safetyBulletin }), { targetBulletinId });
    } finally {
      await pool.end();
    }
  }
}

let apiEvidence = null;
if (!skipApi) {
  const configUrl = new URL("/api/config", baseUrl).toString();
  const bulletinUrl = new URL(`/api/safety-bulletins/${encodeURIComponent(targetBulletinId)}`, baseUrl).toString();
  const configResponse = await fetchJson(configUrl);
  const bulletinResponse = await fetchJson(bulletinUrl);
  const apiConfigBulletin = configResponse.ok ? findBulletin(configResponse.body, targetBulletinId) : null;
  const apiBulletin = bulletinResponse.ok ? (bulletinResponse.body?.bulletin || bulletinResponse.body) : null;
  const apiConfigCounts = pointCounts(apiConfigBulletin);
  const apiBulletinCounts = pointCounts(apiBulletin);
  apiEvidence = {
    configStatus: configResponse.status,
    bulletinStatus: bulletinResponse.status,
    apiConfigCounts,
    apiBulletinCounts,
    apiBulletinUpdatedByName: apiBulletin?.updatedByName || ""
  };

  addCheck("api-config-reachable", configResponse.ok, { status: configResponse.status });
  addCheck("api-bulletin-reachable", bulletinResponse.ok, { status: bulletinResponse.status });
  addCheck("api-config-matches-json-counts", compareCounts(apiConfigCounts, jsonCounts), { apiConfigCounts, jsonCounts });
  addCheck("api-bulletin-matches-json-counts", compareCounts(apiBulletinCounts, jsonCounts), { apiBulletinCounts, jsonCounts });
  addCheck("api-config-required-point-present", hasRequiredPoints(apiConfigBulletin, requiredPointNeedles), {
    requiredPoints: requiredPointNeedles
  });
  addCheck("api-bulletin-required-point-present", hasRequiredPoints(apiBulletin, requiredPointNeedles), {
    requiredPoints: requiredPointNeedles
  });
  addCheck("api-records-have-no-known-mojibake", !hasBadText({ apiConfigBulletin, apiBulletin }), { targetBulletinId });
}

const failedChecks = checks.filter((check) => !check.pass);
const report = {
  generatedAtUtc: new Date().toISOString(),
  ok: failedChecks.length === 0,
  reportPath: path.relative(rootDir, reportPath).replace(/\\/g, "/"),
  targetBulletinId,
  jsonCounts,
  mysql: mysqlEvidence,
  api: apiEvidence,
  summary: {
    total: checks.length,
    passed: checks.length - failedChecks.length,
    failed: failedChecks.length
  },
  failedChecks,
  checks
};

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

if (failedChecks.length) {
  process.exit(1);
}
