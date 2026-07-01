import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const reportsDir = path.join(rootDir, "qa", "reports");
const tempRoot = path.join(rootDir, "qa", "tmp", "home-install-package-audit");
const packageOutputDir = path.join(tempRoot, "release");
const extractDir = path.join(tempRoot, "extract");
const reportPath = path.join(reportsDir, "home-install-package-audit.json");
const extractedDistReportPath = path.join(reportsDir, "home-install-package-dist-asset-audit.json");

const normalize = (value) => value.replace(/\\/g, "/");
const psQuote = (value) => `'${String(value).replace(/'/g, "''")}'`;

const ensureUnder = (target, parent) => {
  const targetPath = path.resolve(target);
  const parentPath = path.resolve(parent);
  if (targetPath !== parentPath && !targetPath.startsWith(`${parentPath}${path.sep}`)) {
    throw new Error(`Refusing to operate outside expected directory: ${targetPath}`);
  }
};

const ensureDir = (directory) => fs.mkdirSync(directory, { recursive: true });

const rmSafe = (target) => {
  ensureUnder(target, rootDir);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { force: true, recursive: true });
  }
};

const runPowerShell = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", ...args], {
      cwd: rootDir,
      windowsHide: true
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = {
        code,
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8")
      };
      if (code === 0) {
        resolve(result);
      } else {
        reject(new Error(`PowerShell failed with exit code ${code}\n${result.stdout}\n${result.stderr}`));
      }
    });
  });

const runNode = (args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: rootDir,
      windowsHide: true
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      resolve({
        code: null,
        errorMessage: error.message,
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8")
      });
    });
    child.on("close", (code) => {
      resolve({
        code,
        errorMessage: "",
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8")
      });
    });
  });

const check = (name, pass, evidence = {}) => ({
  evidence,
  name,
  pass: Boolean(pass)
});

const listFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        files.push(normalize(path.relative(directory, fullPath)));
      }
    }
  };
  walk(directory);
  return files.sort();
};

const read = (base, relativePath) => fs.readFileSync(path.join(base, relativePath), "utf8");
const readJson = (base, relativePath) => JSON.parse(read(base, relativePath).replace(/^\uFEFF/, ""));
const exists = (base, relativePath) => Boolean(base) && fs.existsSync(path.join(base, relativePath));

const requiredFiles = [
  "package.json",
  "package-lock.json",
  "index.html",
  "README.md",
  ".env.example",
  "dist/index.html",
  "server/index.js",
  "server/loadEnv.js",
  "server/data/config.json",
  "server/data/documents.json",
  "server/data/activity.json",
  "setup/home-install/install-home-windows.ps1",
  "setup/home-install/install-mhchub-service-windows.ps1",
  "setup/home-install/check-mhchub-service-windows.ps1",
  "setup/home-install/repair-mhchub-service-recovery-windows.ps1",
  "setup/home-install/health-check-windows.ps1",
  "setup/home-install/start-mhchub-windows.ps1",
  "setup/home-install/uninstall-mhchub-service-windows.ps1",
  "setup/home-install/README_HOME_INSTALL.md",
  "scripts/clean-dist-stale-assets.ps1",
  "scripts/startup-guard.ps1",
  "scripts/package-home-install.ps1",
  "release-manifest.json"
];

const forbiddenFiles = [
  ".env",
  ".env.local",
  "server/data/auth/users.json",
  "server/data/auth/auth_audit_log.json",
  "server/data/auth/auth_login_attempts.json"
];

const findPackageRuntimeArtifacts = (files) =>
  files.filter((file) => {
    const normalized = normalize(file).toLowerCase();
    return normalized.endsWith(".log")
      || normalized === "server/data/.env"
      || normalized.startsWith("server/data/backups/")
      || normalized.startsWith("server/data/auth/")
      || normalized.startsWith("server/uploads/")
      || normalized.startsWith("server/previews/");
  });

ensureDir(reportsDir);

let cleanupOk = false;
let generated = {};
let checks = [];

try {
  rmSafe(tempRoot);
  ensureDir(packageOutputDir);
  ensureDir(extractDir);

  const packageResult = await runPowerShell([
    "-File",
    "scripts/package-home-install.ps1",
    "-SkipBuild",
    "-OutputDir",
    packageOutputDir
  ]);

  const zipFiles = fs.readdirSync(packageOutputDir)
    .filter((name) => /^MHChub-home-install-\d{8}-\d{6}\.zip$/i.test(name))
    .sort();
  const stageDirs = fs.readdirSync(packageOutputDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^MHChub-home-install-\d{8}-\d{6}$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const zipName = zipFiles.at(-1) || "";
  const stageName = stageDirs.at(-1) || "";
  const zipPath = zipName ? path.join(packageOutputDir, zipName) : "";
  const stageDir = stageName ? path.join(packageOutputDir, stageName) : "";
  const zipSize = zipPath && fs.existsSync(zipPath) ? fs.statSync(zipPath).size : 0;

  generated = {
    packageStdoutTail: packageResult.stdout.slice(-1200),
    stageName,
    stageRelativePath: stageDir ? normalize(path.relative(rootDir, stageDir)) : "",
    zipName,
    zipRelativePath: zipPath ? normalize(path.relative(rootDir, zipPath)) : "",
    zipSize
  };

  checks.push(check("home-package-created-one-zip", zipFiles.length === 1 && Boolean(zipName), { zipFiles }));
  checks.push(check("home-package-created-one-stage-dir", stageDirs.length === 1 && Boolean(stageName), { stageDirs }));
  checks.push(check("home-package-zip-has-content", zipSize > 1024 * 1024, { zipSize }));

  if (zipPath) {
    await runPowerShell([
      "-Command",
      `Expand-Archive -LiteralPath ${psQuote(zipPath)} -DestinationPath ${psQuote(extractDir)} -Force`
    ]);
  }

  const extractedEntries = fs.existsSync(extractDir) ? fs.readdirSync(extractDir, { withFileTypes: true }) : [];
  const extractedRootEntry = extractedEntries.find((entry) => entry.isDirectory() && /^MHChub-home-install-\d{8}-\d{6}$/i.test(entry.name));
  const extractedRoot = extractedRootEntry ? path.join(extractDir, extractedRootEntry.name) : "";
  const extractedFiles = extractedRoot ? listFiles(extractedRoot) : [];

  generated.extractedRootRelativePath = extractedRoot ? normalize(path.relative(rootDir, extractedRoot)) : "";
  generated.extractedFileCount = extractedFiles.length;

  checks.push(check("home-package-extracts-root-folder", Boolean(extractedRoot), {
    extractedEntries: extractedEntries.map((entry) => entry.name)
  }));
  checks.push(check("home-package-required-files-present", requiredFiles.every((file) => exists(extractedRoot, file)), {
    missing: requiredFiles.filter((file) => !exists(extractedRoot, file))
  }));
  checks.push(check("home-package-runtime-secrets-absent", forbiddenFiles.every((file) => !exists(extractedRoot, file)), {
    present: forbiddenFiles.filter((file) => exists(extractedRoot, file))
  }));
  const runtimeArtifacts = findPackageRuntimeArtifacts(extractedFiles);
  checks.push(check("home-package-runtime-artifacts-absent", runtimeArtifacts.length === 0, {
    runtimeArtifacts
  }));
  checks.push(check("home-package-forbidden-directories-absent", ["node_modules", "backups", "qa", "release", "test-results", "logs"].every((dir) => !fs.existsSync(path.join(extractedRoot, dir))), {
    present: ["node_modules", "backups", "qa", "release", "test-results", "logs"].filter((dir) => fs.existsSync(path.join(extractedRoot, dir)))
  }));

  let extractedDistAudit = {};
  const extractedDistDir = extractedRoot ? path.join(extractedRoot, "dist") : "";
  if (extractedDistDir) {
    const distAuditResult = await runNode([
      "scripts/audit-dist-assets.mjs",
      "--dist",
      extractedDistDir,
      "--strict-stale",
      "--report",
      extractedDistReportPath
    ]);
    generated.extractedDistAssetReport = normalize(path.relative(rootDir, extractedDistReportPath));
    generated.extractedDistAuditStdoutTail = distAuditResult.stdout.slice(-1200);
    generated.extractedDistAuditStderrTail = distAuditResult.stderr.slice(-1200);
    generated.extractedDistAuditExitCode = distAuditResult.code;
    generated.extractedDistAuditError = distAuditResult.errorMessage || "";
    if (fs.existsSync(extractedDistReportPath)) {
      extractedDistAudit = JSON.parse(fs.readFileSync(extractedDistReportPath, "utf8"));
    }
  }

  checks.push(check("home-package-dist-assets-strict-clean", extractedDistAudit.ok === true
    && extractedDistAudit.summary?.warnings === 0
    && extractedDistAudit.totals?.reachableAssetCount > 0
    && extractedDistAudit.totals?.reachableTotalBytes <= 4 * 1024 * 1024, {
    auditOk: extractedDistAudit.ok || false,
    cleanableAssetCount: extractedDistAudit.totals?.cleanableAssetCount || 0,
    failedChecks: extractedDistAudit.failedChecks || [],
    report: normalize(path.relative(rootDir, extractedDistReportPath)),
    reachableAssetCount: extractedDistAudit.totals?.reachableAssetCount || 0,
    reachableTotalBytes: extractedDistAudit.totals?.reachableTotalBytes || 0,
    staleWarnings: extractedDistAudit.warnings || [],
    warningCount: extractedDistAudit.summary?.warnings ?? null
  }));

  const envExample = exists(extractedRoot, ".env.example") ? read(extractedRoot, ".env.example") : "";
  checks.push(check("home-package-env-defaults-to-3333", /(^|\n)PORT=3333(\n|$)/.test(envExample) && !envExample.includes(":4174") && !envExample.includes("PORT=4174"), {
    portLine: envExample.split(/\r?\n/).find((line) => line.startsWith("PORT=")) || ""
  }));

  const manifest = exists(extractedRoot, "release-manifest.json")
    ? readJson(extractedRoot, "release-manifest.json")
    : {};
  checks.push(check("home-package-manifest-points-to-installer", manifest.runAfterUnzip === ".\\setup\\home-install\\install-home-windows.ps1", {
    runAfterUnzip: manifest.runAfterUnzip || ""
  }));
  checks.push(check("home-package-manifest-documents-exclusions", Array.isArray(manifest.excluded)
    && [".env", ".env.local", "node_modules", "server/data/backups", "server/uploads content", "qa"].every((item) => manifest.excluded.includes(item)), {
    excluded: manifest.excluded || []
  }));

  const uploadsDir = path.join(extractedRoot, "server", "uploads");
  const uploadFiles = listFiles(uploadsDir);
  checks.push(check("home-package-uploads-directory-empty", fs.existsSync(uploadsDir) && uploadFiles.length === 0, {
    uploadFiles
  }));

  const serviceReadme = exists(extractedRoot, "setup/home-install/README_HOME_INSTALL.md")
    ? read(extractedRoot, "setup/home-install/README_HOME_INSTALL.md")
    : "";
  checks.push(check("home-package-readme-documents-service-check-repair-and-dist-cleanup", [
    "check-mhchub-service-windows.ps1",
    "npm run ops:service:repair-preview",
    "npm run ops:service:repair-apply",
    "clean-dist-stale-assets.ps1",
    "ConfirmStaleCount",
    "http://localhost:3333"
  ].every((needle) => serviceReadme.includes(needle)), {}));
} catch (error) {
  checks.push(check("home-package-audit-completed-without-exception", false, {
    errorMessage: error instanceof Error ? error.message : String(error)
  }));
} finally {
  try {
    rmSafe(tempRoot);
    cleanupOk = true;
  } catch (cleanupError) {
    cleanupOk = false;
    checks.push(check("home-package-temp-cleanup", false, {
      errorMessage: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
    }));
  }
}

checks.push(check("home-package-temp-cleanup", cleanupOk, {
  tempRoot: normalize(path.relative(rootDir, tempRoot))
}));

const failedChecks = checks.filter((item) => !item.pass);
const report = {
  cleanupOk,
  failedChecks,
  generated,
  generatedAtUtc: new Date().toISOString(),
  ok: failedChecks.length === 0,
  summary: {
    failed: failedChecks.length,
    passed: checks.length - failedChecks.length,
    total: checks.length
  },
  checks
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  cleanupOk,
  failedChecks,
  generated,
  ok: report.ok,
  reportPath,
  summary: report.summary
}, null, 2));

if (!report.ok) process.exit(1);
