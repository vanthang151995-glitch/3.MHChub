import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const auditScript = path.join(rootDir, "scripts", "audit-document-storage.mjs");
const maxDefaultStdoutChars = 6000;

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

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const runAudit = (args = []) => {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), "mhchub-document-audit-console-"));
  const result = spawnSync(process.execPath, [auditScript, "--report-dir", reportDir, ...args], {
    cwd: rootDir,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    fail("Document audit command failed during console regression test", {
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
    fail("Document audit stdout is not valid JSON", {
      args,
      reportDir,
      error: error.message,
      stdoutHead: result.stdout.slice(0, 300)
    });
  }

  const reportPath = path.join(reportDir, "document-storage-audit.json");
  if (!fs.existsSync(reportPath)) {
    fail("Document audit did not write the expected full JSON artifact", {
      args,
      reportDir,
      reportPath
    });
  }

  return {
    args,
    reportDir,
    stdoutLength: result.stdout.length,
    consoleJson,
    report: readJson(reportPath)
  };
};

const assertPassSummary = (result, mode) => {
  const summary = result.consoleJson.summary;
  if (!summary || summary.failed !== 0 || summary.passed !== summary.total) {
    fail(`Document audit ${mode} console summary is not fully passing`, {
      summary,
      reportDir: result.reportDir
    });
  }
};

const hasOnlyPlaceholderDocuments = (report) =>
  Number(report.counts?.total || 0) > 0
  && Number(report.counts?.uploaded || 0) === 0
  && Number(report.counts?.placeholders || 0) === Number(report.counts?.total || 0);

const assertFullArtifact = (result, mode) => {
  if (!result.report.summary || result.report.summary.failed !== 0 || result.report.summary.passed !== result.report.summary.total) {
    fail(`Document audit ${mode} full artifact summary is not fully passing`, {
      summary: result.report.summary,
      reportDir: result.reportDir
    });
  }

  if (!Array.isArray(result.report.checks) || result.report.checks.length !== result.report.summary.total) {
    fail(`Document audit ${mode} full artifact does not keep all checks`, {
      checkCount: result.report.checks?.length,
      summary: result.report.summary,
      reportDir: result.reportDir
    });
  }

  const fileHeadCount = result.report.api?.fileHeads?.length || 0;
  if (result.report.counts?.uploaded && fileHeadCount !== result.report.counts.uploaded) {
    fail(`Document audit ${mode} full artifact does not keep file HEAD probe evidence`, {
      uploaded: result.report.counts.uploaded,
      fileHeadCount,
      reportDir: result.reportDir
    });
  }

  const requiresFileProbeEvidence = !hasOnlyPlaceholderDocuments(result.report);

  if (
    !Array.isArray(result.report.api?.previewFileHeads)
    || (requiresFileProbeEvidence && result.report.api.previewFileHeads.length < 1)
  ) {
    fail(`Document audit ${mode} full artifact does not keep preview-file HEAD probe evidence`, {
      previewFileHeads: result.report.api?.previewFileHeads,
      placeholderOnlyDataset: hasOnlyPlaceholderDocuments(result.report),
      reportDir: result.reportDir
    });
  }

  if (
    !Array.isArray(result.report.api?.fileRanges)
    || (requiresFileProbeEvidence && result.report.api.fileRanges.length < 1)
  ) {
    fail(`Document audit ${mode} full artifact does not keep original PDF range probe evidence`, {
      fileRanges: result.report.api?.fileRanges,
      placeholderOnlyDataset: hasOnlyPlaceholderDocuments(result.report),
      reportDir: result.reportDir
    });
  }

  if (
    !Array.isArray(result.report.api?.previewFileRanges)
    || (requiresFileProbeEvidence && result.report.api.previewFileRanges.length < 1)
  ) {
    fail(`Document audit ${mode} full artifact does not keep preview-file range probe evidence`, {
      previewFileRanges: result.report.api?.previewFileRanges,
      placeholderOnlyDataset: hasOnlyPlaceholderDocuments(result.report),
      reportDir: result.reportDir
    });
  }

  if (!Array.isArray(result.report.uploadPolicy?.allowedExtensions) || result.report.uploadPolicy.allowedExtensions.length < 10) {
    fail(`Document audit ${mode} full artifact does not keep upload policy extension evidence`, {
      uploadPolicy: result.report.uploadPolicy,
      reportDir: result.reportDir
    });
  }

  if ((result.report.uploadPolicy?.missingRequiredExtensions || []).length > 0) {
    fail(`Document audit ${mode} upload policy is missing supported document extensions`, {
      uploadPolicy: result.report.uploadPolicy,
      reportDir: result.reportDir
    });
  }

  if ((result.report.uploadPolicy?.forbiddenAllowedExtensions || []).length > 0) {
    fail(`Document audit ${mode} upload policy allows forbidden extensions`, {
      uploadPolicy: result.report.uploadPolicy,
      reportDir: result.reportDir
    });
  }

  if ((result.report.uploadPolicy?.uploadedExtensionsMissingFromPolicy || []).length > 0) {
    fail(`Document audit ${mode} upload policy does not cover existing uploads`, {
      uploadPolicy: result.report.uploadPolicy,
      reportDir: result.reportDir
    });
  }

  if (result.report.api) {
    const apiMetadataMismatches = result.report.api.metadataMismatches;
    if (!Array.isArray(apiMetadataMismatches)) {
      fail(`Document audit ${mode} full artifact does not keep API metadata mismatch evidence`, {
        api: result.report.api,
        reportDir: result.reportDir
      });
    }

    if (apiMetadataMismatches.length > 0) {
      fail(`Document audit ${mode} detected JSON/API document metadata mismatches`, {
        apiMetadataMismatches: apiMetadataMismatches.slice(0, 20),
        reportDir: result.reportDir
      });
    }

    if (
      !Number.isInteger(result.report.api.checkedFields)
      || (requiresFileProbeEvidence && result.report.api.checkedFields < 100)
    ) {
      fail(`Document audit ${mode} API metadata coverage is too narrow`, {
        api: result.report.api,
        placeholderOnlyDataset: hasOnlyPlaceholderDocuments(result.report),
        reportDir: result.reportDir
      });
    }
  }

  const manualImportCount = result.report.counts?.manualImported || 0;
  const manualImports = result.report.sourceFiles?.manualImports || [];
  if (manualImportCount > 0 && manualImports.length !== manualImportCount) {
    fail(`Document audit ${mode} full artifact does not keep manual-import source evidence`, {
      manualImportCount,
      manualImports: manualImports.length,
      reportDir: result.reportDir
    });
  }

  const failedManualImports = manualImports.filter((item) => !item.sizeMatches || !item.sha256Matches);
  if (failedManualImports.length > 0) {
    fail(`Document audit ${mode} detected manual-import source/upload mismatch`, {
      failedManualImports,
      reportDir: result.reportDir
    });
  }

  const invalidHashEvidence = manualImports.filter((item) =>
    !/^[a-f0-9]{64}$/.test(item.sourceSha256 || "") || !/^[a-f0-9]{64}$/.test(item.uploadedSha256 || "")
  );
  if (invalidHashEvidence.length > 0) {
    fail(`Document audit ${mode} manual-import hash evidence is incomplete`, {
      invalidHashEvidence,
      reportDir: result.reportDir
    });
  }

  if (result.report.mysql) {
    const metadataMismatches = result.report.mysql.metadataMismatches;
    if (!Array.isArray(metadataMismatches)) {
      fail(`Document audit ${mode} full artifact does not keep MySQL metadata mismatch evidence`, {
        mysql: result.report.mysql,
        reportDir: result.reportDir
      });
    }

    if (metadataMismatches.length > 0) {
      fail(`Document audit ${mode} detected JSON/MySQL document metadata mismatches`, {
        metadataMismatches: metadataMismatches.slice(0, 20),
        reportDir: result.reportDir
      });
    }

    if (!Number.isInteger(result.report.mysql.checkedColumns) || result.report.mysql.checkedColumns < 10) {
      fail(`Document audit ${mode} MySQL metadata coverage is too narrow`, {
        mysql: result.report.mysql,
        reportDir: result.reportDir
      });
    }
  }
};

const compact = runAudit();
assertPassSummary(compact, "compact");
assertFullArtifact(compact, "compact");

if (compact.stdoutLength > maxDefaultStdoutChars) {
  fail("Document audit compact console output is too large", {
    stdoutLength: compact.stdoutLength,
    maxDefaultStdoutChars,
    reportDir: compact.reportDir
  });
}

if (Array.isArray(compact.consoleJson.checks)) {
  fail("Document audit compact console output unexpectedly includes full checks", {
    reportDir: compact.reportDir
  });
}

if (Array.isArray(compact.consoleJson.api?.fileHeads)) {
  fail("Document audit compact console output unexpectedly includes full file HEAD details", {
    reportDir: compact.reportDir
  });
}

if (Array.isArray(compact.consoleJson.api?.previewFileHeads)) {
  fail("Document audit compact console output unexpectedly includes full preview-file HEAD details", {
    reportDir: compact.reportDir
  });
}

if (Array.isArray(compact.consoleJson.api?.fileRanges)) {
  fail("Document audit compact console output unexpectedly includes full original PDF range details", {
    reportDir: compact.reportDir
  });
}

if (Array.isArray(compact.consoleJson.api?.previewFileRanges)) {
  fail("Document audit compact console output unexpectedly includes full preview-file range details", {
    reportDir: compact.reportDir
  });
}

if (compact.consoleJson.counts?.total !== compact.report.counts?.total || compact.consoleJson.counts?.uploaded !== compact.report.counts?.uploaded) {
  fail("Document audit compact console counts do not match full artifact", {
    consoleCounts: compact.consoleJson.counts,
    artifactCounts: compact.report.counts,
    reportDir: compact.reportDir
  });
}

if (compact.consoleJson.api?.fileHeadCount !== compact.report.api?.fileHeads?.length) {
  fail("Document audit compact console file head count does not match full artifact", {
    consoleApi: compact.consoleJson.api,
    artifactFileHeads: compact.report.api?.fileHeads?.length,
    reportDir: compact.reportDir
  });
}

if (compact.consoleJson.uploadPolicy?.allowedExtensionCount !== compact.report.uploadPolicy?.allowedExtensions?.length) {
  fail("Document audit compact console upload policy extension count does not match full artifact", {
    consoleUploadPolicy: compact.consoleJson.uploadPolicy,
    artifactUploadPolicy: compact.report.uploadPolicy,
    reportDir: compact.reportDir
  });
}

if ((compact.consoleJson.uploadPolicy?.forbiddenAllowedExtensionCount || 0) !== (compact.report.uploadPolicy?.forbiddenAllowedExtensions?.length || 0)) {
  fail("Document audit compact console upload policy forbidden count does not match full artifact", {
    consoleUploadPolicy: compact.consoleJson.uploadPolicy,
    artifactUploadPolicy: compact.report.uploadPolicy,
    reportDir: compact.reportDir
  });
}

if ((compact.consoleJson.uploadPolicy?.missingRequiredExtensionCount || 0) !== (compact.report.uploadPolicy?.missingRequiredExtensions?.length || 0)) {
  fail("Document audit compact console upload policy missing-required count does not match full artifact", {
    consoleUploadPolicy: compact.consoleJson.uploadPolicy,
    artifactUploadPolicy: compact.report.uploadPolicy,
    reportDir: compact.reportDir
  });
}

if (compact.consoleJson.api?.fileRangeCount !== compact.report.api?.fileRanges?.length) {
  fail("Document audit compact console original PDF range count does not match full artifact", {
    consoleApi: compact.consoleJson.api,
    artifactFileRanges: compact.report.api?.fileRanges?.length,
    reportDir: compact.reportDir
  });
}

if (compact.consoleJson.api?.previewFileHeadCount !== compact.report.api?.previewFileHeads?.length) {
  fail("Document audit compact console preview-file head count does not match full artifact", {
    consoleApi: compact.consoleJson.api,
    artifactPreviewFileHeads: compact.report.api?.previewFileHeads?.length,
    reportDir: compact.reportDir
  });
}

if (compact.consoleJson.api?.previewFileRangeCount !== compact.report.api?.previewFileRanges?.length) {
  fail("Document audit compact console preview-file range count does not match full artifact", {
    consoleApi: compact.consoleJson.api,
    artifactPreviewFileRanges: compact.report.api?.previewFileRanges?.length,
    reportDir: compact.reportDir
  });
}

if (compact.consoleJson.api?.metadataMismatches !== compact.report.api?.metadataMismatches?.length) {
  fail("Document audit compact console API metadata mismatch count does not match full artifact", {
    consoleApi: compact.consoleJson.api,
    artifactApi: compact.report.api,
    reportDir: compact.reportDir
  });
}

if ((compact.consoleJson.api?.checkedFields || 0) !== (compact.report.api?.checkedFields || 0)) {
  fail("Document audit compact console API checked field count does not match full artifact", {
    consoleApi: compact.consoleJson.api,
    artifactApi: compact.report.api,
    reportDir: compact.reportDir
  });
}

if (compact.consoleJson.sourceFiles?.manualImportCount !== compact.report.sourceFiles?.manualImports?.length) {
  fail("Document audit compact console manual-import count does not match full artifact", {
    consoleSourceFiles: compact.consoleJson.sourceFiles,
    artifactManualImports: compact.report.sourceFiles?.manualImports?.length,
    reportDir: compact.reportDir
  });
}

if ((compact.consoleJson.sourceFiles?.failedHashMatches || []).length !== 0) {
  fail("Document audit compact console reports manual-import source/upload mismatches", {
    sourceFiles: compact.consoleJson.sourceFiles,
    reportDir: compact.reportDir
  });
}

if (compact.consoleJson.mysql?.metadataMismatches !== compact.report.mysql?.metadataMismatches?.length) {
  fail("Document audit compact console MySQL metadata mismatch count does not match full artifact", {
    consoleMysql: compact.consoleJson.mysql,
    artifactMysql: compact.report.mysql,
    reportDir: compact.reportDir
  });
}

if ((compact.consoleJson.mysql?.checkedColumns || 0) !== (compact.report.mysql?.checkedColumns || 0)) {
  fail("Document audit compact console MySQL checked column count does not match full artifact", {
    consoleMysql: compact.consoleJson.mysql,
    artifactMysql: compact.report.mysql,
    reportDir: compact.reportDir
  });
}

if (!fs.existsSync(compact.consoleJson.artifacts?.json || "")) {
  fail("Document audit compact console artifact path is missing or invalid", {
    artifacts: compact.consoleJson.artifacts,
    reportDir: compact.reportDir
  });
}

const verbose = runAudit(["--verbose"]);
assertPassSummary(verbose, "verbose");
assertFullArtifact(verbose, "verbose");

if (!Array.isArray(verbose.consoleJson.checks) || verbose.consoleJson.checks.length !== verbose.consoleJson.summary.total) {
  fail("Document audit verbose console output does not include all checks", {
    checkCount: verbose.consoleJson.checks?.length,
    summary: verbose.consoleJson.summary,
    reportDir: verbose.reportDir
  });
}

if (!Array.isArray(verbose.consoleJson.api?.fileHeads) || verbose.consoleJson.api.fileHeads.length !== verbose.report.api?.fileHeads?.length) {
  fail("Document audit verbose console output does not include file HEAD details", {
    consoleFileHeads: verbose.consoleJson.api?.fileHeads?.length,
    artifactFileHeads: verbose.report.api?.fileHeads?.length,
    reportDir: verbose.reportDir
  });
}

if (!Array.isArray(verbose.consoleJson.api?.fileRanges) || verbose.consoleJson.api.fileRanges.length !== verbose.report.api?.fileRanges?.length) {
  fail("Document audit verbose console output does not include original PDF range details", {
    artifactFileRanges: verbose.report.api?.fileRanges?.length,
    consoleFileRanges: verbose.consoleJson.api?.fileRanges?.length,
    reportDir: verbose.reportDir
  });
}

if (!Array.isArray(verbose.consoleJson.api?.previewFileHeads) || verbose.consoleJson.api.previewFileHeads.length !== verbose.report.api?.previewFileHeads?.length) {
  fail("Document audit verbose console output does not include preview-file HEAD details", {
    consolePreviewFileHeads: verbose.consoleJson.api?.previewFileHeads?.length,
    artifactPreviewFileHeads: verbose.report.api?.previewFileHeads?.length,
    reportDir: verbose.reportDir
  });
}

if (!Array.isArray(verbose.consoleJson.api?.previewFileRanges) || verbose.consoleJson.api.previewFileRanges.length !== verbose.report.api?.previewFileRanges?.length) {
  fail("Document audit verbose console output does not include preview-file range details", {
    artifactPreviewFileRanges: verbose.report.api?.previewFileRanges?.length,
    consolePreviewFileRanges: verbose.consoleJson.api?.previewFileRanges?.length,
    reportDir: verbose.reportDir
  });
}

if (!Array.isArray(verbose.consoleJson.sourceFiles?.manualImports) || verbose.consoleJson.sourceFiles.manualImports.length !== verbose.report.sourceFiles?.manualImports?.length) {
  fail("Document audit verbose console output does not include manual-import source details", {
    artifactManualImports: verbose.report.sourceFiles?.manualImports?.length,
    consoleManualImports: verbose.consoleJson.sourceFiles?.manualImports?.length,
    reportDir: verbose.reportDir
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      compact: {
        stdoutLength: compact.stdoutLength,
        documents: compact.consoleJson.counts,
        checks: compact.consoleJson.summary,
        uploadPolicy: compact.consoleJson.uploadPolicy,
        apiMetadataFieldCount: compact.consoleJson.api?.checkedFields || 0,
        fileHeadCount: compact.consoleJson.api?.fileHeadCount || 0,
        fileRangeCount: compact.consoleJson.api?.fileRangeCount || 0,
        manualImportHashCount: compact.consoleJson.sourceFiles?.hashMatchCount || 0,
        previewFileHeadCount: compact.consoleJson.api?.previewFileHeadCount || 0,
        previewFileRangeCount: compact.consoleJson.api?.previewFileRangeCount || 0,
        artifact: compact.consoleJson.artifacts?.json
      },
      verbose: {
        stdoutLength: verbose.stdoutLength,
        checks: verbose.consoleJson.checks.length,
        uploadPolicyExtensions: verbose.consoleJson.uploadPolicy?.allowedExtensions?.length || 0,
        apiMetadataFieldCount: verbose.consoleJson.api?.checkedFields || 0,
        fileHeads: verbose.consoleJson.api?.fileHeads?.length || 0,
        fileRanges: verbose.consoleJson.api?.fileRanges?.length || 0,
        manualImports: verbose.consoleJson.sourceFiles?.manualImports?.length || 0,
        previewFileHeads: verbose.consoleJson.api?.previewFileHeads?.length || 0,
        previewFileRanges: verbose.consoleJson.api?.previewFileRanges?.length || 0
      }
    },
    null,
    2
  )
);
