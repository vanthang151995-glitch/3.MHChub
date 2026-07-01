import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

const wrongSha256 = "0".repeat(64);
const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), "mhchub-safety-source-baseline-"));
const reportPath = path.join(reportDir, "safety-meeting-source-audit.json");

const result = spawnSync(
  process.execPath,
  [
    path.join(rootDir, "scripts", "audit-safety-meeting-source.mjs"),
    "--report-dir",
    reportDir,
    "--expect-sha256",
    wrongSha256
  ],
  {
    cwd: rootDir,
    encoding: "utf8"
  }
);

const fail = (message, evidence = {}) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message,
        evidence
      },
      null,
      2
    )
  );
  process.exit(1);
};

if (result.status === 0) {
  let consoleJson = null;
  try {
    consoleJson = JSON.parse(result.stdout.replace(/^\uFEFF/, ""));
  } catch {
    consoleJson = null;
  }
  if (consoleJson?.skipped) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: consoleJson.reason,
          evidence: consoleJson.evidence,
          reportDir
        },
        null,
        2
      )
    );
    process.exit(0);
  }
  fail("Safety source audit accepted a wrong workbook SHA-256 baseline", {
    status: result.status,
    reportDir,
    stdoutTail: result.stdout.slice(-1000),
    stderrTail: result.stderr.slice(-1000)
  });
}

if (!fs.existsSync(reportPath)) {
  fail("Safety source audit did not write the expected rejection report", {
    status: result.status,
    reportPath,
    stdoutTail: result.stdout.slice(-1000),
    stderrTail: result.stderr.slice(-1000)
  });
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const rejectedCheck = Array.isArray(report.failedChecks)
  ? report.failedChecks.find((item) => item.name === "source-workbook-sha256-baseline")
  : null;

if (!rejectedCheck) {
  fail("Safety source audit failed, but not because of the SHA-256 baseline check", {
    status: result.status,
    failedChecks: report.failedChecks,
    reportPath
  });
}

if (rejectedCheck.evidence?.expectedSha256 !== wrongSha256) {
  fail("SHA-256 baseline rejection did not preserve the expected wrong hash in evidence", {
    rejectedCheck,
    reportPath
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      rejectedCheck: rejectedCheck.name,
      expectedSha256: rejectedCheck.evidence.expectedSha256,
      actualSha256: rejectedCheck.evidence.actualSha256,
      reportPath
    },
    null,
    2
  )
);
