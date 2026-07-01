import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const auditScript = path.join(rootDir, "scripts", "audit-safety-meeting-source.mjs");
const maxDefaultStdoutChars = 8000;

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

const runAudit = (args = []) => {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), "mhchub-safety-source-console-"));
  const result = spawnSync(process.execPath, [auditScript, "--report-dir", reportDir, ...args], {
    cwd: rootDir,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    fail("Safety source audit command failed during console regression test", {
      args,
      status: result.status,
      reportDir,
      stdoutTail: result.stdout.slice(-1000),
      stderrTail: result.stderr.slice(-1000)
    });
  }

  let consoleJson;
  try {
    consoleJson = JSON.parse(result.stdout.replace(/^\uFEFF/, ""));
  } catch (error) {
    fail("Safety source audit stdout is not valid JSON", {
      args,
      reportDir,
      error: error.message,
      stdoutHead: result.stdout.slice(0, 300)
    });
  }

  const reportPath = path.join(reportDir, "safety-meeting-source-audit.json");
  const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, "utf8")) : null;

  return {
    args,
    reportDir,
    stdoutLength: result.stdout.length,
    consoleJson,
    report
  };
};

const assertPassSummary = (result, mode) => {
  const summary = result.consoleJson.summary;
  if (!summary || summary.failed !== 0 || summary.passed !== summary.total) {
    fail(`Safety source audit ${mode} console summary is not fully passing`, {
      summary,
      reportDir: result.reportDir
    });
  }
};

const compact = runAudit();
if (compact.consoleJson.skipped) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        skipped: true,
        reason: compact.consoleJson.reason,
        evidence: compact.consoleJson.evidence,
        reportDir: compact.reportDir
      },
      null,
      2
    )
  );
  process.exit(0);
}
assertPassSummary(compact, "compact");

if (compact.stdoutLength > maxDefaultStdoutChars) {
  fail("Safety source compact console output is too large", {
    stdoutLength: compact.stdoutLength,
    maxDefaultStdoutChars,
    reportDir: compact.reportDir
  });
}

if (Array.isArray(compact.consoleJson.sourceRowExtracts?.rows)) {
  fail("Safety source compact console output unexpectedly includes source row previews", {
    reportDir: compact.reportDir
  });
}

if (Array.isArray(compact.consoleJson.coverage)) {
  fail("Safety source compact console output unexpectedly includes full coverage rows", {
    reportDir: compact.reportDir
  });
}

if (compact.consoleJson.sourceRowExtracts?.count !== 35) {
  fail("Safety source compact console output does not summarize 35 source rows", {
    sourceRowExtracts: compact.consoleJson.sourceRowExtracts,
    reportDir: compact.reportDir
  });
}

if (
  compact.consoleJson.coverageSummary?.totalRows !== 35 ||
  compact.consoleJson.coverageSummary?.sourcePassedRows !== 35 ||
  compact.consoleJson.coverageSummary?.bulletinPassedRows !== 35 ||
  compact.consoleJson.coverageSummary?.failedRows?.length !== 0
) {
  fail("Safety source compact coverage summary is incomplete", {
    coverageSummary: compact.consoleJson.coverageSummary,
    reportDir: compact.reportDir
  });
}

if (!compact.report || compact.report.sourceRowExtracts?.length !== 35 || compact.report.coverage?.length !== 35) {
  fail("Safety source full JSON artifact does not keep detailed rows", {
    reportDir: compact.reportDir,
    sourceRowExtracts: compact.report?.sourceRowExtracts?.length,
    coverage: compact.report?.coverage?.length
  });
}

if (!fs.existsSync(compact.report.artifacts?.fullTextMarkdown || "")) {
  fail("Safety source compact run did not write full-text markdown artifact", {
    artifacts: compact.report.artifacts,
    reportDir: compact.reportDir
  });
}

const verbose = runAudit(["--verbose-source"]);
assertPassSummary(verbose, "verbose");

if (!Array.isArray(verbose.consoleJson.sourceRowExtracts?.rows) || verbose.consoleJson.sourceRowExtracts.rows.length !== 35) {
  fail("Safety source verbose console output does not include 35 source row previews", {
    sourceRowExtracts: verbose.consoleJson.sourceRowExtracts,
    reportDir: verbose.reportDir
  });
}

if (!Array.isArray(verbose.consoleJson.coverage) || verbose.consoleJson.coverage.length !== 35) {
  fail("Safety source verbose console output does not include 35 coverage rows", {
    coverageRows: verbose.consoleJson.coverage?.length,
    reportDir: verbose.reportDir
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      compact: {
        stdoutLength: compact.stdoutLength,
        sourceRows: compact.consoleJson.sourceRowExtracts.count,
        coverageRows: compact.consoleJson.coverageSummary.totalRows,
        fullTextMarkdown: compact.consoleJson.sourceRowExtracts.fullTextMarkdown
      },
      verbose: {
        stdoutLength: verbose.stdoutLength,
        sourceRowPreviewCount: verbose.consoleJson.sourceRowExtracts.rows.length,
        coverageRows: verbose.consoleJson.coverage.length
      }
    },
    null,
    2
  )
);
