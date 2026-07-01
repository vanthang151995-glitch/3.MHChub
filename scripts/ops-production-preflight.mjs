import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const reportsDir = path.join(rootDir, "qa", "reports");
const jsonReportPath = path.join(reportsDir, "production-preflight-summary.json");
const markdownReportPath = path.join(reportsDir, "production-preflight-summary.md");
const strict = process.argv.includes("--strict");

const normalize = (value) => String(value || "").replace(/\\/g, "/");
const relative = (filePath) => normalize(path.relative(rootDir, filePath));

const reportDefinitions = {
  distAssets: {
    action: "Run npm run verify, then run npm run ops:preflight again.",
    label: "Dist asset audit",
    path: "qa/reports/dist-asset-audit.json",
    required: true
  },
  distCleanup: {
    action: "Run npm run ops:dist:cleanup-preview, then run npm run ops:preflight again.",
    label: "Dist cleanup preview",
    path: "qa/reports/dist-asset-cleanup-preview-summary.json",
    required: true
  },
  homePackage: {
    action: "Run npm run audit:home-package, then run npm run ops:preflight again.",
    label: "Home install package audit",
    path: "qa/reports/home-install-package-audit.json",
    required: true
  },
  liveRuntime: {
    action: "Run npm run audit:live-api-runtime against the intended live URL, then run npm run ops:preflight again.",
    label: "Live API runtime drift audit",
    path: "qa/reports/live-api-runtime-drift-audit.json",
    required: true
  },
  quality: {
    action: "Run npm run verify, then run npm run ops:preflight again.",
    label: "Quality gates",
    path: "qa/reports/quality-gates-report.json",
    required: true
  },
  securityHeaders: {
    action: "Run npm run audit:security-headers, then run npm run ops:preflight again.",
    label: "Security headers audit",
    path: "qa/reports/security-headers-audit.json",
    required: true
  },
  service: {
    action: "Run npm run ops:service:diagnose, then run npm run ops:preflight again.",
    label: "Windows service diagnostic",
    path: "qa/reports/mhchub-service-check.json",
    required: true
  }
};

const readJsonReport = (relativePath) => {
  const filePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(filePath)) {
    return {
      data: null,
      exists: false,
      path: relativePath
    };
  }

  try {
    return {
      data: JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")),
      exists: true,
      path: relativePath
    };
  } catch (error) {
    return {
      data: null,
      error: error.message,
      exists: true,
      path: relativePath
    };
  }
};

const reportRefs = Object.fromEntries(
  Object.entries(reportDefinitions).map(([name, definition]) => [
    name,
    {
      ...definition,
      ...readJsonReport(definition.path)
    }
  ])
);

const checks = [];

const statusFor = ({ pass, severity }) => {
  if (pass) return "pass";
  if (severity === "missing_report") return "missing_report";
  if (severity === "warning" || severity === "maintenance") return "warning";
  return "action_required";
};

const addCheck = ({ action = "", evidence = {}, name, pass, severity = "blocking" }) => {
  checks.push({
    action,
    evidence,
    name,
    pass: Boolean(pass),
    severity,
    status: statusFor({ pass, severity })
  });
};

const serviceMessages = (report, level) =>
  Array.isArray(report?.checks)
    ? report.checks
      .filter((item) => String(item.level || "").toUpperCase() === level)
      .map((item) => String(item.message || ""))
    : [];

const hasServiceMessage = (report, level, text) =>
  serviceMessages(report, level).some((message) => message.includes(text));

for (const [name, ref] of Object.entries(reportRefs)) {
  if (!ref.required) continue;

  addCheck({
    action: "Run npm run verify, then run npm run ops:preflight again.",
    evidence: {
      error: ref.error || "",
      label: ref.label,
      path: ref.path
    },
    name: `report-available-${name}`,
    pass: ref.exists && !ref.error,
    severity: ref.exists && !ref.error ? "info" : "missing_report",
    action: ref.action || "Run npm run verify, then run npm run ops:preflight again."
  });
}

const quality = reportRefs.quality.data;
const service = reportRefs.service.data;
const distCleanup = reportRefs.distCleanup.data;
const distAssets = reportRefs.distAssets.data;
const securityHeaders = reportRefs.securityHeaders.data;
const homePackage = reportRefs.homePackage.data;
const liveRuntime = reportRefs.liveRuntime.data;
const serviceCurrentUser = service?.currentUser
  ? {
      isAdministrator: Boolean(service.currentUser.isAdministrator),
      name: service.currentUser.name || ""
    }
  : null;
const serviceAdministratorActions = Array.isArray(service?.administratorActions)
  ? service.administratorActions.map((item) => ({
      command: item.command || "",
      name: item.name || "",
      reason: item.reason || "",
      requiresAdministrator: Boolean(item.requiresAdministrator)
    }))
  : [];

if (quality) {
  addCheck({
    action: "Fix failed quality gates before production use.",
    evidence: {
      failedCount: Number(quality.failedCount || 0),
      passed: Number(quality.passed || 0),
      warningCount: Number(quality.warningCount || 0)
    },
    name: "quality-gates-pass",
    pass: quality.ok === true && Number(quality.failedCount || 0) === 0,
    severity: "blocking"
  });

  addCheck({
    action: "Review the grouped actions in this preflight; source detail is qa/reports/quality-gates-report.json.",
    evidence: {
      warningCount: Number(quality.warningCount || 0),
      warningReports: Array.isArray(quality.warningReports)
        ? quality.warningReports.map((item) => ({
          path: item.path || "",
          script: item.script || "",
          warningCount: Number(item.warningCount || 0)
        }))
        : []
    },
    name: "quality-warnings-reviewed",
    pass: Number(quality.warningCount || 0) === 0,
    severity: "warning"
  });
}

if (service) {
  addCheck({
    action: "Start the MHChub Windows service before production use.",
    evidence: {
      okMessages: serviceMessages(service, "OK").filter((message) => message.includes("Service")),
      serviceName: service.serviceName
    },
    name: "service-running",
    pass: hasServiceMessage(service, "OK", "Service is running."),
    severity: "blocking"
  });

  addCheck({
    action: "Run npm run ops:service:repair-apply from Administrator PowerShell.",
    evidence: {
      administratorActions: serviceAdministratorActions,
      currentUser: serviceCurrentUser,
      failedChecks: serviceMessages(service, "FAIL")
    },
    name: "service-recovery-restart-enabled",
    pass: hasServiceMessage(service, "OK", "SCM failure recovery includes restart actions."),
    severity: "admin_action"
  });

  addCheck({
    action: "Run npm run ops:secrets, restart/reload MHChub, then run npm run ops:health -- -BaseUrl http://127.0.0.1:3333 -StrictReady.",
    evidence: {
      warningChecks: serviceMessages(service, "WARN")
    },
    name: "strict-readiness-green",
    pass: hasServiceMessage(service, "OK", "Readiness endpoint reports ready=true."),
    severity: "blocking"
  });
}

if (homePackage) {
  addCheck({
    action: "Fix home install package audit before copying the release zip.",
    evidence: {
      summary: homePackage.summary || {},
      zipRelativePath: homePackage.generated?.zipRelativePath || "",
      zipSize: homePackage.generated?.zipSize || 0
    },
    name: "home-install-package-clean",
    pass: homePackage.ok === true,
    severity: "blocking"
  });
}

if (securityHeaders) {
  addCheck({
    action: "Fix security header audit before production use.",
    evidence: {
      summary: securityHeaders.summary || {}
    },
    name: "security-headers-pass",
    pass: securityHeaders.ok === true,
    severity: "blocking"
  });
}

if (liveRuntime) {
  addCheck({
    action: "Restart/reload the live MHChub process so it loads the current server/index.js, then run npm run audit:live-api-runtime again.",
    evidence: {
      authenticated: Boolean(liveRuntime.liveRuntime?.authenticated),
      baseUrl: liveRuntime.liveRuntime?.baseUrl || "",
      failedChecks: Array.isArray(liveRuntime.failedChecks)
        ? liveRuntime.failedChecks.map((item) => item.name || "").filter(Boolean).slice(0, 12)
        : [],
      restartRecommended: Boolean(liveRuntime.restartRecommended),
      staleSignals: Array.isArray(liveRuntime.staleSignals) ? liveRuntime.staleSignals.slice(0, 12) : [],
      summary: liveRuntime.summary || {}
    },
    name: "live-runtime-api-contract-current",
    pass: liveRuntime.ok === true && !liveRuntime.restartRecommended,
    severity: "blocking"
  });
}

if (distAssets) {
  const reachableBytes = Number(distAssets.totals?.reachableTotalBytes || 0);
  const budgetBytes = 4 * 1024 * 1024;

  addCheck({
    action: "Keep only optimized runtime images in public/images and run npm run build before packaging.",
    evidence: {
      budgetBytes,
      reachableTotalBytes: reachableBytes,
      reachableRuntimeImageCount: Number(distAssets.totals?.reachableRuntimeImageCount || 0),
      warningCount: Number(distAssets.summary?.warnings || 0)
    },
    name: "runtime-assets-within-budget",
    pass: distAssets.ok === true && reachableBytes <= budgetBytes,
    severity: "blocking"
  });
}

if (distCleanup) {
  const staleCount = Number(distCleanup.staleCount || 0);

  addCheck({
    action: distCleanup.requiresAdministratorForApply
      ? `${distCleanup.applyCommand || ".\\scripts\\clean-dist-stale-assets.ps1 -Apply"} from Administrator PowerShell.`
      : "Run npm run ops:dist:cleanup-preview and follow the reported apply command.",
    evidence: {
      applyCommand: distCleanup.applyCommand || "",
      requiresAdministratorForApply: Boolean(distCleanup.requiresAdministratorForApply),
      staleBytes: Number(distCleanup.staleBytes || 0),
      staleCount
    },
    name: "local-dist-stale-cleanup",
    pass: staleCount === 0,
    severity: "maintenance"
  });
}

const notPassed = checks.filter((item) => !item.pass);
const groups = {
  administrator: notPassed.filter((item) => item.severity === "admin_action"),
  blocking: notPassed.filter((item) => item.severity === "blocking" || item.severity === "missing_report"),
  maintenance: notPassed.filter((item) => item.severity === "maintenance"),
  warnings: notPassed.filter((item) => item.severity === "warning")
};

const toAction = (item) => ({
  action: item.action,
  evidence: item.evidence,
  name: item.name,
  status: item.status
});

const productionReady = groups.blocking.length === 0 && groups.administrator.length === 0;
const ok = groups.blocking.length === 0;

const report = {
  administratorActions: groups.administrator.map(toAction),
  blockingActions: groups.blocking.map(toAction),
  checks,
  generatedAtUtc: new Date().toISOString(),
  maintenanceActions: groups.maintenance.map(toAction),
  ok,
  productionReady,
  reportSources: Object.fromEntries(
    Object.entries(reportRefs).map(([name, value]) => [
      name,
      {
        exists: value.exists,
        label: value.label,
        path: value.path,
        ...(value.error ? { error: value.error } : {})
      }
    ])
  ),
  summary: {
    actionRequired: checks.filter((item) => item.status === "action_required").length,
    administratorActions: groups.administrator.length,
    blockingActions: groups.blocking.length,
    maintenanceActions: groups.maintenance.length,
    missingReports: checks.filter((item) => item.status === "missing_report").length,
    passed: checks.filter((item) => item.pass).length,
    total: checks.length,
    warnings: groups.warnings.length
  },
  warningActions: groups.warnings.map(toAction)
};

const renderSection = (title, rows) => [
  `## ${title}`,
  ...(rows.length ? rows.map((item) => `- ${item.name}: ${item.action}`) : ["- None"]),
  ""
];

const markdownLines = [
  "# MHChub Production Preflight",
  "",
  `Generated: ${report.generatedAtUtc}`,
  `Production ready: ${productionReady ? "YES" : "NO"}`,
  "",
  ...renderSection("Blocking", report.blockingActions),
  ...renderSection("Administrator Action", report.administratorActions),
  ...renderSection("Maintenance", report.maintenanceActions),
  ...renderSection("Warnings", report.warningActions),
  "## Passed",
  ...checks.filter((item) => item.pass).map((item) => `- ${item.name}`)
];

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(markdownReportPath, `${markdownLines.join("\n")}\n`, "utf8");

console.log(JSON.stringify({
  ok,
  productionReady,
  reports: {
    json: relative(jsonReportPath),
    markdown: relative(markdownReportPath)
  },
  summary: report.summary
}, null, 2));

if (strict && !productionReady) process.exit(1);
