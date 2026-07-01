import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const npmExecPath = process.env.npm_execpath && fs.existsSync(process.env.npm_execpath) ? process.env.npm_execpath : "";
const npmCmdPath = process.platform === "win32" ? path.join(path.dirname(process.execPath), "npm.cmd") : "npm";
const npmRunner = npmExecPath
  ? { command: process.execPath, baseArgs: [npmExecPath] }
  : { command: npmCmdPath, baseArgs: [] };
const packageJsonPath = path.join(process.cwd(), "package.json");
const packageScripts = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).scripts || {};

const reportsDir = path.join(process.cwd(), "qa", "reports");
const reportPath = path.join(reportsDir, "quality-gates-report.json");
const fullLogPath = path.join(reportsDir, "quality-gates-full.log");
const stdoutTailLimit = 1500;
const failureTailLimit = 3000;

const gates = [
  {
    name: "Excel preview merged-cell regression",
    script: "test:xlsx-preview"
  },
  {
    name: "Excel HTML format regression",
    script: "test:excel-html-format-regression"
  },
  {
    name: "Excel HTML sanitizer regression",
    script: "test:excel-html-sanitizer"
  },
  {
    name: "Safety meeting source coverage",
    script: "audit:safety-source"
  },
  {
    name: "Safety source console output regression",
    script: "test:safety-source-console"
  },
  {
    name: "Safety source baseline rejection regression",
    script: "test:safety-source-baseline"
  },
  {
    name: "Safety page route registry audit",
    script: "audit:safety-pages"
  },
  {
    name: "Safety API endpoint contract audit",
    script: "audit:safety-api"
  },
  {
    name: "API JSON response contract audit",
    script: "audit:api-json-contract"
  },
  {
    name: "Current-source API runtime contract audit",
    script: "audit:current-source-api-runtime"
  },
  {
    name: "No runtime JSX source files",
    script: "audit:no-runtime-jsx"
  },
  {
    name: "Frontend JS migration allowlist",
    script: "audit:frontend-js-migration"
  },
  {
    name: "Safety bulletin mirror regression",
    script: "test:mirror"
  },
  {
    name: "Auth role access regression",
    script: "test:auth-roles"
  },
  {
    name: "Runtime backup includes uploads and previews",
    script: "test:runtime-backup"
  },
  {
    name: "Document storage and download audit",
    script: "audit:documents"
  },
  {
    name: "Document upload policy regression",
    script: "test:document-upload-policy"
  },
  {
    name: "Document text encoding regression",
    script: "test:document-text-encoding"
  },
  {
    name: "Document display title regression",
    script: "test:document-display-title"
  },
  {
    name: "Document storage title normalization audit",
    script: "audit:document-title-normalization"
  },
  {
    name: "Document display title UI audit",
    script: "audit:document-display-ui"
  },
  {
    name: "Document audit console output regression",
    script: "test:document-audit-console"
  },
  {
    name: "Latest runtime backup covers document files",
    script: "audit:runtime-backup"
  },
  {
    name: "Ops entrypoint safety audit",
    script: "audit:ops"
  },
  {
    name: "Windows service runtime diagnostic",
    script: "ops:service:diagnose"
  },
  {
    name: "Home install package artifact audit",
    script: "audit:home-package"
  },
  {
    name: "Production dependency vulnerability audit",
    script: "audit:dependencies"
  },
  {
    name: "Admin route access audit",
    script: "audit:admin-routes"
  },
  {
    name: "HTTP security headers audit",
    script: "audit:security-headers"
  },
  {
    name: "Data consistency across JSON/MySQL/API",
    script: "audit:data"
  },
  {
    name: "Production build",
    script: "build"
  },
  {
    name: "SEO, GEO, performance, and security readiness audit",
    script: "audit:seo"
  },
  {
    name: "Document preview browser rendering audit",
    script: "audit:document-preview-browser"
  },
  {
    name: "Dist asset budget and stale output audit",
    script: "audit:dist-assets"
  },
  {
    name: "Dist stale cleanup preview",
    script: "ops:dist:cleanup-preview"
  },
  {
    name: "Metadata UTF-8 and schema regression",
    script: "test:metadata-encoding"
  },
  {
    name: "Runtime text integrity and Vietnamese names",
    script: "audit:text-integrity"
  },
  {
    name: "Theme first paint and no dark flash",
    script: "audit:theme-first-paint"
  },
  {
    name: "Light background zoom stability",
    script: "audit:zoom-background"
  },
  {
    name: "Image asset sharpness and sizing",
    script: "audit:image-assets"
  },
  {
    name: "Accessibility and keyboard usability smoke",
    script: "audit:accessibility"
  },
  {
    name: "App shell responsive UI smoke",
    script: "audit:app-shell-ui"
  },
  {
    name: "Home carousel UI regression",
    script: "audit:home-carousel-ui"
  },
  {
    name: "Operations preflight UI smoke",
    script: "audit:operations-preflight-ui"
  },
  {
    name: "Scroll stability and rendering smoothness",
    script: "audit:scroll-stability"
  },
  {
    name: "Bulletin UI Playwright smoke",
    script: "audit:bulletin-ui"
  }
];

const gateArtifactReports = {
  "audit:safety-source": ["qa/reports/safety-meeting-source-audit.json"],
  "audit:safety-pages": ["qa/reports/safety-page-routes-audit.json"],
  "audit:safety-api": ["qa/reports/safety-api-endpoints-audit.json"],
  "audit:api-json-contract": ["qa/reports/api-json-contract-audit.json"],
  "audit:current-source-api-runtime": ["qa/reports/current-source-api-runtime-audit.json"],
  "audit:documents": ["qa/reports/document-storage-audit.json"],
  "audit:document-title-normalization": ["qa/reports/document-title-normalization-report.json"],
  "audit:document-preview-browser": ["qa/reports/document-preview-browser-audit.json"],
  "audit:runtime-backup": ["qa/reports/runtime-backup-audit.json"],
  "audit:ops": ["qa/reports/ops-entrypoints-audit.json"],
  "ops:service:diagnose": ["qa/reports/mhchub-service-check.json"],
  "audit:home-package": [
    "qa/reports/home-install-package-audit.json",
    "qa/reports/home-install-package-dist-asset-audit.json"
  ],
  "audit:dependencies": ["qa/reports/dependency-audit-report.json"],
  "audit:admin-routes": ["qa/reports/admin-route-access-audit.json"],
  "audit:security-headers": ["qa/reports/security-headers-audit.json"],
  "audit:no-runtime-jsx": ["qa/reports/no-runtime-jsx-audit.json"],
  "audit:frontend-js-migration": ["qa/reports/frontend-js-migration-audit.json"],
  "audit:data": ["qa/reports/data-consistency-audit.json"],
  "audit:seo": ["qa/reports/seo-geo-performance-audit.json"],
  "audit:dist-assets": ["qa/reports/dist-asset-audit.json"],
  "ops:dist:cleanup-preview": ["qa/reports/dist-asset-cleanup-preview-summary.json"],
  "audit:text-integrity": ["qa/reports/text-integrity-audit.json"],
  "audit:theme-first-paint": ["qa/reports/theme-first-paint-audit.json"],
  "audit:zoom-background": ["qa/reports/zoom-background-stability-audit.json"],
  "audit:image-assets": ["qa/reports/image-asset-quality-audit.json"],
  "audit:accessibility": ["qa/reports/accessibility-usability-audit.json"],
  "audit:app-shell-ui": ["qa/reports/app-shell-ui-audit.json"],
  "audit:home-carousel-ui": ["qa/reports/home-carousel-ui-audit.json"],
  "audit:operations-preflight-ui": ["qa/reports/operations-preflight-ui-audit.json"],
  "audit:scroll-stability": ["qa/reports/scroll-stability-audit.json"],
  "audit:bulletin-ui": ["qa/reports/bulletin-ui-audit.json"]
};

const startedAt = Date.now();
const startedAtIso = new Date().toISOString();
const results = [];

const relativeArtifactPath = (filePath) => path.relative(process.cwd(), filePath).replace(/\\/g, "/");

const textTail = (text, limit = stdoutTailLimit) => {
  if (!text) return "";
  if (text.length <= limit) return text;
  return `[trimmed ${text.length - limit} chars]\n${text.slice(-limit)}`;
};

const toOutputText = (chunks) => Buffer.concat(chunks).toString("utf8");

const readArtifactReport = (relativePath) => {
  const filePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      path: relativePath
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
    const diagnostics = buildArtifactDiagnostics(relativePath, parsed);
    const failedCount = Number(
      parsed.summary?.failed
        ?? parsed.failedCount
        ?? (Array.isArray(parsed.failedChecks) ? parsed.failedChecks.length : 0)
    ) || 0;
    const warningCount = Number(
      parsed.summary?.warnings
        ?? (Array.isArray(parsed.warnings) ? parsed.warnings.length : 0)
    ) || 0;

    return {
      exists: true,
      failedCount,
      ok: parsed.ok ?? failedCount === 0,
      path: relativePath,
      summary: parsed.summary || null,
      warningCount,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.slice(0, 8) : [],
      ...(diagnostics ? { diagnostics } : {})
    };
  } catch (error) {
    return {
      exists: true,
      error: error.message,
      failedCount: 0,
      ok: false,
      path: relativePath,
      warningCount: 0,
      warnings: []
    };
  }
};

const buildArtifactDiagnostics = (relativePath, parsed) => {
  if (
    relativePath === "qa/reports/current-source-api-runtime-audit.json" ||
    relativePath === "qa/reports/live-api-runtime-drift-audit.json" ||
    relativePath === "qa/reports/live-api-runtime-drift-current-source-audit.json"
  ) {
    return {
      type: relativePath.includes("current-source") ? "current-source-api-runtime" : "live-api-runtime-drift",
      authenticated: Boolean(parsed.liveRuntime?.authenticated),
      baseUrl: parsed.liveRuntime?.baseUrl || "",
      childAudits: Array.isArray(parsed.childAudits)
        ? parsed.childAudits.map((item) => ({
            code: item.code,
            durationMs: Number(item.durationMs || 0),
            script: item.script || ""
          }))
        : [],
      failedChecks: Array.isArray(parsed.failedChecks)
        ? parsed.failedChecks.map((item) => item.name || "").filter(Boolean).slice(0, 12)
        : [],
      restartRecommended: Boolean(parsed.restartRecommended),
      runtimePort: parsed.runtime?.port || null,
      staleSignals: Array.isArray(parsed.staleSignals) ? parsed.staleSignals.slice(0, 12) : [],
      summary: parsed.summary || null,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map((item) => item.code || item.message || "").slice(0, 8) : []
    };
  }

  if (relativePath === "qa/reports/mhchub-service-check.json") {
    return {
      type: "mhchub-service-diagnostic",
      diagnosticOnly: Boolean(parsed.diagnosticOnly),
      healthUrl: parsed.healthUrl || "",
      port: parsed.port || "",
      remediation: Array.isArray(parsed.remediation) ? parsed.remediation.slice(0, 8) : [],
      administratorActions: Array.isArray(parsed.administratorActions)
        ? parsed.administratorActions
            .map((item) => ({
              command: item.command || "",
              name: item.name || "",
              reason: item.reason || "",
              requiresAdministrator: Boolean(item.requiresAdministrator)
            }))
            .slice(0, 8)
        : [],
      currentUser: parsed.currentUser
        ? {
            isAdministrator: Boolean(parsed.currentUser.isAdministrator),
            name: parsed.currentUser.name || ""
          }
        : null,
      serviceName: parsed.serviceName || "",
      serviceOk: Boolean(parsed.serviceOk ?? parsed.ok),
      summary: parsed.summary || null,
      failedChecks: Array.isArray(parsed.checks)
        ? parsed.checks
            .filter((item) => item.level === "FAIL")
            .map((item) => item.message)
            .slice(0, 8)
        : [],
      warningChecks: Array.isArray(parsed.checks)
        ? parsed.checks
            .filter((item) => item.level === "WARN")
            .map((item) => item.message)
            .slice(0, 8)
        : []
    };
  }

  if (relativePath !== "qa/reports/dist-asset-cleanup-preview-summary.json") {
    return null;
  }

  return {
    type: "dist-cleanup-preview",
    applyCommand: parsed.applyCommand || "",
    administratorReason: parsed.administratorReason || "",
    currentUser: parsed.currentUser
      ? {
          isAdministrator: Boolean(parsed.currentUser.isAdministrator),
          name: parsed.currentUser.name || ""
        }
      : null,
    deleteProbe: parsed.deleteProbe
      ? {
          created: Boolean(parsed.deleteProbe.created),
          deleted: Boolean(parsed.deleteProbe.deleted),
          error: parsed.deleteProbe.error || "",
          existsAfter: Boolean(parsed.deleteProbe.existsAfter)
        }
      : null,
    requiresAdministratorForApply: Boolean(parsed.requiresAdministratorForApply),
    sampleDeleteDiagnostic: parsed.sampleDeleteDiagnostic
      ? {
          isReadOnly: Boolean(parsed.sampleDeleteDiagnostic.isReadOnly),
          likelyCause: parsed.sampleDeleteDiagnostic.likelyCause || "",
          owner: parsed.sampleDeleteDiagnostic.owner || "",
          sample: parsed.sampleDeleteDiagnostic.sample || ""
        }
      : null,
    staleBytes: Number(parsed.staleBytes) || 0,
    staleCount: Number(parsed.staleCount) || 0
  };
};

const readGateArtifactReports = (script) =>
  (gateArtifactReports[script] || []).map(readArtifactReport);

const splitCommandArgs = (commandLine) => {
  const args = [];
  let current = "";
  let quote = "";
  let escaping = false;

  for (const char of commandLine.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = "";
      } else {
        current += char;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaping) current += "\\";
  if (current) args.push(current);
  return args;
};

const resolveGateProcess = (script) => {
  const commandLine = packageScripts[script] || "";
  const parts = splitCommandArgs(commandLine);
  if (parts[0] === "node" && parts[1]) {
    return {
      runner: "node-direct",
      command: process.execPath,
      args: parts.slice(1)
    };
  }
  return {
    runner: "npm-run",
    command: npmRunner.command,
    args: [...npmRunner.baseArgs, "run", script]
  };
};

const summarizeResult = (result) => ({
  script: result.script,
  name: result.name,
  runner: result.runner,
  code: result.code,
  ok: result.code === 0 && !result.error,
  durationMs: result.durationMs,
  startedAt: result.startedAt,
  finishedAt: result.finishedAt,
  stdoutBytes: Buffer.byteLength(result.stdout || "", "utf8"),
  stderrBytes: Buffer.byteLength(result.stderr || "", "utf8"),
  artifactReports: result.artifactReports || [],
  stdoutTail: textTail(result.stdout || ""),
  stderrTail: textTail(result.stderr || ""),
  ...(result.error ? { error: result.error } : {})
});

const buildReport = ({ ok, failed = null, error = null }) => {
  const gatesSummary = results.map(summarizeResult);
  const warningReports = gatesSummary.flatMap((gate) =>
    (gate.artifactReports || [])
      .filter((artifact) => artifact.warningCount > 0)
      .map((artifact) => ({
        script: gate.script,
        name: gate.name,
        path: artifact.path,
        warningCount: artifact.warningCount,
        warnings: artifact.warnings || []
      }))
  );
  const diagnosticReports = gatesSummary.flatMap((gate) =>
    (gate.artifactReports || [])
      .filter((artifact) => artifact.diagnostics)
      .map((artifact) => ({
        script: gate.script,
        name: gate.name,
        path: artifact.path,
        diagnostics: artifact.diagnostics
      }))
  );

  return {
    ok,
    startedAt: startedAtIso,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    passed: results.filter((result) => result.code === 0 && !result.error).length,
    failedCount: results.filter((result) => result.code !== 0 || result.error).length,
    warningCount: warningReports.reduce((sum, item) => sum + item.warningCount, 0),
    failed,
    error,
    artifacts: {
      report: relativeArtifactPath(reportPath),
      fullLog: relativeArtifactPath(fullLogPath)
    },
    diagnosticReports,
    warningReports,
    gates: gatesSummary
  };
};

const toConsoleSummary = (report) => {
  const slowestGates = [...report.gates]
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 3)
    .map((gate) => ({
      script: gate.script,
      durationMs: gate.durationMs
    }));

  return {
    ok: report.ok,
    durationMs: report.durationMs,
    totalGates: report.gates.length,
    passed: report.passed,
    failedCount: report.failedCount,
    warningCount: report.warningCount,
    diagnosticReports: report.diagnosticReports.map((item) => ({
      script: item.script,
      path: item.path,
      diagnostics: item.diagnostics
    })),
    warningReports: report.warningReports.map((item) => ({
      script: item.script,
      path: item.path,
      warningCount: item.warningCount
    })),
    ...(report.failed
      ? {
          failed: {
            script: report.failed.script,
            name: report.failed.name,
            code: report.failed.code,
            durationMs: report.failed.durationMs
          }
        }
      : {}),
    ...(report.error ? { error: report.error } : {}),
    artifacts: report.artifacts,
    slowestGates
  };
};

const writeArtifacts = (report) => {
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const fullLog = [
    `[verify] startedAt=${report.startedAt}`,
    `[verify] finishedAt=${report.finishedAt}`,
    `[verify] ok=${report.ok}`,
    `[verify] durationMs=${report.durationMs}`,
    `[verify] warningCount=${report.warningCount}`,
    `[verify] report=${report.artifacts.report}`
  ];

  for (const result of results) {
    fullLog.push(
      "",
      `===== ${result.script} - ${result.name} =====`,
      `runner=${result.runner}`,
      `startedAt=${result.startedAt}`,
      `finishedAt=${result.finishedAt}`,
      `code=${result.code}`,
      `durationMs=${result.durationMs}`,
      `error=${result.error || ""}`,
      `artifactReports=${JSON.stringify(result.artifactReports || [])}`,
      "-- stdout --",
      result.stdout || "",
      "-- stderr --",
      result.stderr || ""
    );
  }

  fs.writeFileSync(fullLogPath, `${fullLog.join("\n")}\n`, "utf8");
};

const logFailureTail = (result) => {
  console.error(`[verify] FAIL ${result.script} - ${result.name}`);
  if (result.error) {
    console.error(`[verify] error: ${result.error}`);
  }
  if ((result.stdout || "").trim()) {
    console.error(`[verify] stdout tail:\n${textTail(result.stdout, failureTailLimit)}`);
  }
  if ((result.stderr || "").trim()) {
    console.error(`[verify] stderr tail:\n${textTail(result.stderr, failureTailLimit)}`);
  }
};

const runGate = (gate) =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const gateStartedAt = new Date().toISOString();
    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;
    const gateProcess = resolveGateProcess(gate.script);
    console.log(`\n[verify] START ${gate.script} - ${gate.name}`);
    const child = spawn(gateProcess.command, gateProcess.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout?.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

    const finish = ({ code, error }) => {
      if (settled) return;
      settled = true;
      const durationMs = Date.now() - start;
      const result = {
        script: gate.script,
        name: gate.name,
        runner: gateProcess.runner,
        code,
        durationMs,
        startedAt: gateStartedAt,
        finishedAt: new Date().toISOString(),
        artifactReports: readGateArtifactReports(gate.script),
        stdout: toOutputText(stdoutChunks),
        stderr: toOutputText(stderrChunks),
        ...(error ? { error: error.message } : {})
      };
      results.push(result);
      if (code === 0 && !error) {
        console.log(`[verify] PASS ${gate.script} in ${durationMs}ms`);
        resolve(result);
        return;
      }
      logFailureTail(result);
      reject(Object.assign(new Error(error?.message || `${gate.script} failed with exit code ${code}`), { result }));
    };

    child.on("error", (error) => {
      finish({ code: null, error });
    });

    child.on("close", (code) => {
      finish({ code });
    });
  });

try {
  for (const gate of gates) {
    await runGate(gate);
  }

  const report = buildReport({ ok: true });
  writeArtifacts(report);
  console.log(JSON.stringify(toConsoleSummary(report), null, 2));
} catch (error) {
  const report = buildReport({
    ok: false,
    failed: error.result ? summarizeResult(error.result) : null,
    error: error.message
  });
  writeArtifacts(report);
  console.error(JSON.stringify(toConsoleSummary(report), null, 2));
  process.exit(1);
}
