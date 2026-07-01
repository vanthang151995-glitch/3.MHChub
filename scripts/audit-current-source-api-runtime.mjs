import { spawn } from "child_process";
import fs from "fs";
import net from "net";
import path from "path";

const rootDir = process.cwd();
const reportsDir = path.join(rootDir, "qa", "reports");
const reportPath = path.join(reportsDir, "current-source-api-runtime-audit.json");
const portStart = Math.max(1024, Number(process.env.MHCHUB_CURRENT_SOURCE_AUDIT_PORT_START) || 4175);
const portEnd = Math.max(portStart, Number(process.env.MHCHUB_CURRENT_SOURCE_AUDIT_PORT_END) || portStart + 20);
const username = process.env.MHCHUB_AUDIT_USERNAME || process.env.MHCHUB_USERNAME || "";
const password = process.env.MHCHUB_AUDIT_PASSWORD || process.env.MHCHUB_PASSWORD || "";

const checks = [];
const warnings = [];
const childAudits = [];
const startedAt = Date.now();
let serverProcess = null;
let serverStdout = "";
let serverStderr = "";
let selectedPort = null;

const toRelative = (filePath) => path.relative(rootDir, filePath).replace(/\\/g, "/");
const addCheck = (name, pass, evidence = {}) => checks.push({ evidence, name, pass: Boolean(pass) });
const textTail = (text = "", limit = 2000) => (text.length > limit ? `[trimmed ${text.length - limit} chars]\n${text.slice(-limit)}` : text);
const isJsonContentType = (contentType = "") => /application\/json/i.test(contentType);
const isHtml = (text = "") => /^\s*<!doctype html/i.test(text) || /<html[\s>]/i.test(text);
const previewText = (text = "") => text.replace(/\s+/g, " ").slice(0, 180);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const portIsFree = (port) =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "0.0.0.0");
  });

const findFreePort = async () => {
  for (let port = portStart; port <= portEnd; port += 1) {
    if (await portIsFree(port)) return port;
  }
  throw new Error(`No free audit port found in ${portStart}-${portEnd}`);
};

const fetchProbe = async (baseUrl, urlPath, cookieHeader = "") => {
  const response = await fetch(`${baseUrl}${urlPath}`, {
    headers: {
      Accept: "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {})
    }
  });
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  return {
    contentType,
    isHtml: isHtml(text),
    ok: response.ok,
    path: urlPath,
    payloadKeys: payload && typeof payload === "object" && !Array.isArray(payload) ? Object.keys(payload).slice(0, 12) : [],
    status: response.status,
    textPreview: previewText(text)
  };
};

const waitForHealth = async (baseUrl) => {
  let lastError = "";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (serverProcess?.exitCode !== null) {
      throw new Error(`Temporary server exited early with code ${serverProcess.exitCode}`);
    }
    try {
      const probe = await fetchProbe(baseUrl, "/api/health");
      if (probe.status === 200 && isJsonContentType(probe.contentType) && !probe.isHtml) return probe;
      lastError = `${probe.status} ${probe.contentType}`;
    } catch (error) {
      lastError = error.message;
    }
    await sleep(250);
  }
  throw new Error(`Temporary server did not become healthy: ${lastError}`);
};

const runNodeScript = (scriptRelativePath, env) =>
  new Promise((resolve) => {
    const started = Date.now();
    const stdoutChunks = [];
    const stderrChunks = [];
    const child = spawn(process.execPath, [scriptRelativePath], {
      cwd: rootDir,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout?.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      resolve({
        code: null,
        durationMs: Date.now() - started,
        error: error.message,
        script: scriptRelativePath,
        stderrTail: "",
        stdoutTail: ""
      });
    });
    child.on("close", (code) => {
      resolve({
        code,
        durationMs: Date.now() - started,
        script: scriptRelativePath,
        stderrTail: textTail(Buffer.concat(stderrChunks).toString("utf8")),
        stdoutTail: textTail(Buffer.concat(stdoutChunks).toString("utf8"))
      });
    });
  });

const parseCookies = (setCookieHeader = "") =>
  setCookieHeader
    .split(/,(?=[^;]+=)/)
    .map((item) => item.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");

const runUnauthenticatedSafetyJsonChecks = async (baseUrl) => {
  const protectedEndpoints = [
    "/api/safety/reference",
    "/api/safety/programs",
    "/api/safety/programs/kyt",
    "/api/safety/document-architecture"
  ];
  for (const endpoint of protectedEndpoints) {
    const probe = await fetchProbe(baseUrl, endpoint);
    addCheck(`current-source-${endpoint.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-returns-json-auth-error`, probe.status >= 400 && probe.status < 500 && isJsonContentType(probe.contentType) && !probe.isHtml, probe);
  }
};

const waitForPortClosed = async (port) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await portIsFree(port)) return true;
    await sleep(100);
  }
  return false;
};

let fatalError = null;
try {
  selectedPort = await findFreePort();
  const baseUrl = `http://127.0.0.1:${selectedPort}`;
  serverProcess = spawn(process.execPath, ["server/index.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(selectedPort)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  serverProcess.stdout?.on("data", (chunk) => {
    serverStdout += Buffer.from(chunk).toString("utf8");
  });
  serverProcess.stderr?.on("data", (chunk) => {
    serverStderr += Buffer.from(chunk).toString("utf8");
  });

  const healthProbe = await waitForHealth(baseUrl);
  addCheck("current-source-temp-server-health-json", true, {
    contentType: healthProbe.contentType,
    port: selectedPort,
    status: healthProbe.status
  });

  const childEnv = {
    ...process.env,
    MHCHUB_AUDIT_BASE_URL: baseUrl,
    MHCHUB_API_CONTRACT_BASE_URL: baseUrl,
    MHCHUB_SAFETY_API_BASE_URL: baseUrl
  };

  const apiContractAudit = await runNodeScript("scripts/audit-api-json-contract.mjs", childEnv);
  childAudits.push(apiContractAudit);
  addCheck("current-source-api-json-contract-audit-passes", apiContractAudit.code === 0 && !apiContractAudit.error, {
    durationMs: apiContractAudit.durationMs,
    script: apiContractAudit.script,
    stderrTail: apiContractAudit.stderrTail,
    stdoutTail: apiContractAudit.stdoutTail
  });

  if (username && password) {
    const safetyApiAudit = await runNodeScript("scripts/audit-safety-api-endpoints.mjs", childEnv);
    childAudits.push(safetyApiAudit);
    addCheck("current-source-safety-api-payload-audit-passes", safetyApiAudit.code === 0 && !safetyApiAudit.error, {
      durationMs: safetyApiAudit.durationMs,
      script: safetyApiAudit.script,
      stderrTail: safetyApiAudit.stderrTail,
      stdoutTail: safetyApiAudit.stdoutTail
    });
  } else {
    warnings.push({
      code: "current-source-safety-api-payload-skipped",
      message: "Set MHCHUB_AUDIT_USERNAME and MHCHUB_AUDIT_PASSWORD to run authenticated Safety payload checks against the temporary current-source server."
    });
    await runUnauthenticatedSafetyJsonChecks(baseUrl);
  }

  const unknownApiProbe = await fetchProbe(baseUrl, "/api/__mhchub_current_source_missing__");
  addCheck(
    "current-source-unknown-api-route-is-json-404",
    unknownApiProbe.status === 404 && isJsonContentType(unknownApiProbe.contentType) && !unknownApiProbe.isHtml,
    unknownApiProbe
  );
} catch (error) {
  fatalError = error;
  addCheck("current-source-runtime-audit-finished", false, {
    message: error.message
  });
} finally {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill();
  }
  if (serverProcess) {
    await new Promise((resolve) => {
      if (serverProcess.exitCode !== null) return resolve();
      const timer = setTimeout(resolve, 5000);
      serverProcess.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  if (selectedPort) {
    const closed = await waitForPortClosed(selectedPort);
    addCheck("current-source-temp-server-port-cleaned-up", closed, {
      port: selectedPort
    });
  }
}

const failedChecks = checks.filter((check) => !check.pass);
const report = {
  checkedAtUtc: new Date().toISOString(),
  childAudits,
  checks,
  durationMs: Date.now() - startedAt,
  failedChecks,
  ok: failedChecks.length === 0,
  reportPath: toRelative(reportPath),
  runtime: {
    port: selectedPort,
    serverPid: serverProcess?.pid || null,
    serverStderrTail: textTail(serverStderr),
    serverStdoutTail: textTail(serverStdout)
  },
  summary: {
    failed: failedChecks.length,
    passed: checks.length - failedChecks.length,
    total: checks.length,
    warnings: warnings.length
  },
  warnings
};

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      failedChecks: failedChecks.map((check) => check.name),
      ok: report.ok,
      reportPath: report.reportPath,
      runtimePort: selectedPort,
      summary: report.summary,
      warnings: warnings.map((warning) => warning.code)
    },
    null,
    2
  )
);

if (fatalError || !report.ok) process.exit(1);
