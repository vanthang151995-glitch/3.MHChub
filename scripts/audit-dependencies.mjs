import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const reportsDir = path.join(rootDir, "qa", "reports");
const reportPath = path.join(reportsDir, "dependency-audit-report.json");
const packagePath = path.join(rootDir, "package.json");
const lockPath = path.join(rootDir, "package-lock.json");
const auditMaxAttempts = Math.max(1, Number(process.env.MHCHUB_NPM_AUDIT_RETRIES) || 3);
const auditRetryDelayMs = Math.max(250, Number(process.env.MHCHUB_NPM_AUDIT_RETRY_DELAY_MS) || 1200);
const transientAuditErrorPattern =
  /(ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket hang up|fetch failed|network|timeout|audit endpoint returned an error|registry\.npmjs\.org|502|503|504)/i;

const ensureDir = (directory) => fs.mkdirSync(directory, { recursive: true });

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const check = (name, pass, evidence = {}) => ({
  evidence,
  name,
  pass: Boolean(pass)
});

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath && fs.existsSync(process.env.npm_execpath) ? process.env.npm_execpath : "";
const npmRunner = npmExecPath
  ? { command: process.execPath, args: [npmExecPath] }
  : { command: npmCommand, args: [] };

const runNpmAudit = () =>
  new Promise((resolve) => {
    const child = spawn(npmRunner.command, [...npmRunner.args, "audit", "--omit=dev", "--json"], {
      cwd: rootDir,
      windowsHide: true
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      resolve({
        error: error.message,
        status: 1,
        stderr: "",
        stdout: ""
      });
    });
    child.on("close", (status) => {
      resolve({
        status,
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8")
      });
    });
  });

const parseAuditJson = (stdout) => {
  try {
    return {
      auditJson: JSON.parse(String(stdout || "").replace(/^\uFEFF/, "")),
      auditParseError: ""
    };
  } catch (error) {
    return {
      auditJson: {},
      auditParseError: error instanceof Error ? error.message : String(error)
    };
  }
};

const isTransientAuditFailure = ({ auditParseError, result }) =>
  Boolean(auditParseError)
  && Number(result.status || 0) !== 0
  && transientAuditErrorPattern.test(`${result.error || ""}\n${result.stderr || ""}\n${result.stdout || ""}`);

const runNpmAuditWithRetry = async () => {
  const attempts = [];
  let finalResult = null;
  let finalAuditJson = {};
  let finalParseError = "";

  for (let attempt = 1; attempt <= auditMaxAttempts; attempt += 1) {
    const result = await runNpmAudit();
    const { auditJson, auditParseError } = parseAuditJson(result.stdout);
    const transient = isTransientAuditFailure({ auditParseError, result });

    attempts.push({
      attempt,
      auditJsonParsed: Boolean(auditJson.metadata),
      exitCode: result.status,
      retryableTransientError: transient,
      stderrTail: String(result.stderr || "").slice(-240)
    });

    finalResult = result;
    finalAuditJson = auditJson;
    finalParseError = auditParseError;

    if (auditJson.metadata || !transient || attempt === auditMaxAttempts) break;
    await wait(auditRetryDelayMs * attempt);
  }

  return {
    attempts,
    auditJson: finalAuditJson,
    auditParseError: finalParseError,
    result: finalResult
  };
};

const packageJson = fs.existsSync(packagePath) ? readJson(packagePath) : {};
const lockJson = fs.existsSync(lockPath) ? readJson(lockPath) : {};
const rootLockPackage = lockJson.packages?.[""] || {};
const rootDependencies = packageJson.dependencies || {};
const lockDependencies = rootLockPackage.dependencies || {};
const lockPackages = lockJson.packages || {};

ensureDir(reportsDir);

const checks = [
  check("dependency-package-json-exists", fs.existsSync(packagePath), {}),
  check("dependency-lockfile-exists", fs.existsSync(lockPath), {}),
  check("dependency-lockfile-version-3", lockJson.lockfileVersion === 3, {
    lockfileVersion: lockJson.lockfileVersion
  }),
  check("dependency-lock-root-matches-package", rootLockPackage.name === packageJson.name && rootLockPackage.version === packageJson.version, {
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    rootLockName: rootLockPackage.name,
    rootLockVersion: rootLockPackage.version
  }),
  check("dependency-lock-root-dependencies-match-package", JSON.stringify(rootDependencies) === JSON.stringify(lockDependencies), {
    packageDependencies: Object.keys(rootDependencies).sort(),
    lockDependencies: Object.keys(lockDependencies).sort()
  })
];

const missingRootDependencyPackages = Object.keys(rootDependencies)
  .map((name) => `node_modules/${name}`)
  .filter((lockPackagePath) => !lockPackages[lockPackagePath]);
checks.push(check("dependency-root-packages-present-in-lock", missingRootDependencyPackages.length === 0, {
  missingRootDependencyPackages
}));

const nonRegistryResolved = Object.entries(lockPackages)
  .filter(([packageName, entry]) => packageName && entry?.resolved)
  .filter(([, entry]) => !String(entry.resolved).startsWith("https://registry.npmjs.org/"))
  .map(([packageName, entry]) => ({ packageName, resolved: entry.resolved }));
checks.push(check("dependency-lock-uses-registry-https-artifacts", nonRegistryResolved.length === 0, {
  nonRegistryResolved: nonRegistryResolved.slice(0, 20),
  total: nonRegistryResolved.length
}));

const auditRun = await runNpmAuditWithRetry();
const auditResult = auditRun.result || { status: 1, stderr: "", stdout: "" };
const auditJson = auditRun.auditJson;
const auditParseError = auditRun.auditParseError;

const vulnerabilitySummary = auditJson.metadata?.vulnerabilities || {};
const totalVulnerabilities = Number(vulnerabilitySummary.total || 0);
checks.push(check("dependency-npm-audit-json-parsed", Boolean(auditJson.metadata), {
  attempts: auditRun.attempts,
  auditParseError,
  exitCode: auditResult.status,
  stderr: auditResult.stderr.slice(-800)
}));
checks.push(check("dependency-production-vulnerabilities-zero", totalVulnerabilities === 0, {
  vulnerabilitySummary
}));
checks.push(check("dependency-npm-audit-exit-code-clean", auditResult.status === 0, {
  exitCode: auditResult.status
}));

const failedChecks = checks.filter((item) => !item.pass);
const report = {
  audit: {
    attempts: auditRun.attempts,
    metadata: auditJson.metadata || {},
    vulnerabilityNames: Object.keys(auditJson.vulnerabilities || {}).sort()
  },
  failedChecks,
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
  failedChecks,
  ok: report.ok,
  reportPath,
  summary: report.summary,
  vulnerabilitySummary
}, null, 2));

if (!report.ok) process.exit(1);
