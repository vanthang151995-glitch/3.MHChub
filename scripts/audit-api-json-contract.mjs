import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const reportsDir = path.join(rootDir, "qa", "reports");
const reportPath = path.join(reportsDir, "api-json-contract-audit.json");
const baseUrl = (
  process.env.MHCHUB_AUDIT_BASE_URL ||
  process.env.MHCHUB_API_CONTRACT_BASE_URL ||
  process.env.VERIFY_BASE_URL ||
  ""
).replace(/\/$/, "");

const toRelative = (filePath) => path.relative(rootDir, filePath).replace(/\\/g, "/");
const readText = (filePath) => fs.readFileSync(filePath, "utf8");
const checks = [];
const warnings = [];
const addCheck = (name, pass, evidence = {}) => checks.push({ evidence, name, pass: Boolean(pass) });

const serverPath = path.join(rootDir, "server", "index.js");
const safetyApiPath = path.join(rootDir, "src", "pages", "safety", "safety-api.ts");
const appApiPath = path.join(rootDir, "src", "services", "api.ts");

const serverSource = readText(serverPath);
const safetyApiSource = readText(safetyApiPath);
const appApiSource = readText(appApiPath);
const apiCatchAllMatch = serverSource.match(
  /app\.use\("\/api",\s*\([^)]*req[^)]*res[^)]*\)\s*=>\s*{[\s\S]{0,500}?res\.status\(404\)\.json\(\{[\s\S]{0,500}?code:\s*"API_ROUTE_NOT_FOUND"/
);
const apiCatchAllIndex = apiCatchAllMatch?.index ?? -1;
const staticIndex = serverSource.indexOf("express.static(distDir");

addCheck("server-api-catch-all-before-spa-fallback", apiCatchAllIndex >= 0 && staticIndex >= 0 && apiCatchAllIndex < staticIndex, {
  apiCatchAllIndex,
  file: toRelative(serverPath),
  staticIndex
});
addCheck("server-api-catch-all-returns-json-404", Boolean(apiCatchAllMatch), {
  file: toRelative(serverPath)
});
addCheck("safety-api-rejects-non-json", /Expected JSON response from/.test(safetyApiSource) && /content-type/.test(safetyApiSource), {
  file: toRelative(safetyApiPath)
});
addCheck("app-api-rejects-non-json", /Expected JSON response/.test(appApiSource) && /content-type/.test(appApiSource), {
  file: toRelative(appApiPath)
});

const requestJsonProbe = async (urlPath) => {
  const response = await fetch(`${baseUrl}${urlPath}`, { headers: { Accept: "application/json" } });
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  return {
    code: payload?.code || "",
    contentType,
    isHtml: /^\s*<!doctype html/i.test(text) || /<html[\s>]/i.test(text),
    message: payload?.message || "",
    ok: response.ok,
    path: urlPath,
    status: response.status,
    textPreview: text.slice(0, 120)
  };
};

const runtime = { baseUrl, skipped: !baseUrl };
if (baseUrl) {
  const missingApi = await requestJsonProbe("/api/__mhchub_contract_missing__");
  runtime.missingApi = missingApi;
  addCheck("runtime-unknown-api-route-is-json-404", missingApi.status === 404 && /application\/json/i.test(missingApi.contentType) && missingApi.code === "API_ROUTE_NOT_FOUND" && !missingApi.isHtml, missingApi);

  const missingClientRoute = await fetch(`${baseUrl}/__mhchub_contract_client_route__`);
  runtime.clientFallback = {
    contentType: missingClientRoute.headers.get("content-type") || "",
    ok: missingClientRoute.ok,
    status: missingClientRoute.status
  };
  addCheck("runtime-client-route-fallback-remains-readable", missingClientRoute.status === 200 && /text\/html/i.test(runtime.clientFallback.contentType), runtime.clientFallback);
} else {
  warnings.push({
    code: "runtime-api-json-contract-skipped",
    message: "Set MHCHUB_AUDIT_BASE_URL to verify the running API process returns JSON for unknown /api routes."
  });
}

const failedChecks = checks.filter((check) => !check.pass);
const report = {
  checkedAtUtc: new Date().toISOString(),
  failedChecks,
  ok: failedChecks.length === 0,
  reportPath: toRelative(reportPath),
  runtime,
  warnings,
  summary: {
    failed: failedChecks.length,
    passed: checks.length - failedChecks.length,
    total: checks.length,
    warnings: warnings.length
  },
  checks
};

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      failedChecks: failedChecks.map((check) => check.name),
      ok: report.ok,
      reportPath: report.reportPath,
      runtimeBaseUrl: baseUrl || null,
      summary: report.summary
    },
    null,
    2
  )
);

if (!report.ok) process.exit(1);
