import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const reportsDir = path.join(rootDir, "qa", "reports");
const reportPath = path.join(reportsDir, "ops-entrypoints-audit.json");

const readText = (relativePath) => {
  const filePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
};

const exists = (relativePath) => fs.existsSync(path.join(rootDir, relativePath));
const normalize = (value) => value.replace(/\\/g, "/");

const checks = [];

const addCheck = (name, pass, evidence = {}) => {
  checks.push({ name, pass: Boolean(pass), evidence });
};

const includesAll = (text, values) => {
  const value = String(text || "");
  return values.every((item) => value.includes(item));
};

const hasDangerousKill = (text) => /\b(taskkill|Stop-Process)\b/i.test(String(text || ""));

const packageJson = JSON.parse(readText("package.json"));
const scripts = packageJson.scripts || {};

for (const [name, command] of Object.entries({
  "dev:client": "vite --host 0.0.0.0",
  "dev:server": "node server/index.js",
  "start:cluster": "node server/index.js",
  "ops:health": "scripts/utils/health-check.ps1",
  "ops:ports": "scripts/verify-critical-ports.ps1",
  "ops:secrets": "scripts/set-mhchub-secrets.ps1",
  "ops:startup": "scripts/startup-guard.ps1",
  "ops:dist:cleanup-preview": "scripts/clean-dist-stale-assets.ps1",
  "ops:service:check": "setup/home-install/check-mhchub-service-windows.ps1",
  "ops:service:diagnose": "setup/home-install/check-mhchub-service-windows.ps1",
  "ops:service:repair-preview": "setup/home-install/repair-mhchub-service-recovery-windows.ps1",
  "ops:service:repair-apply": "setup/home-install/repair-mhchub-service-recovery-windows.ps1 -Apply",
  "ops:preflight": "scripts/ops-production-preflight.mjs",
  "audit:image-assets": "scripts/audit-image-asset-quality.mjs",
  "audit:operations-preflight-ui": "scripts/audit-operations-preflight-ui.mjs",
  "audit:live-api-runtime": "scripts/audit-live-api-runtime-drift.mjs",
  "audit:current-source-api-runtime": "scripts/audit-current-source-api-runtime.mjs",
  "audit:api-json-contract": "scripts/audit-api-json-contract.mjs",
  "audit:safety-api": "scripts/audit-safety-api-endpoints.mjs",
  "audit:safety-pages": "scripts/audit-safety-page-routes.mjs",
  "audit:frontend-js-migration": "scripts/audit-frontend-js-migration.mjs",
  "audit:no-runtime-jsx": "scripts/audit-no-runtime-jsx.mjs",
  "audit:home-package": "scripts/audit-home-install-package.mjs",
  "audit:dependencies": "scripts/audit-dependencies.mjs",
  "audit:dist-assets": "scripts/audit-dist-assets.mjs",
  "deploy:restart": "scripts/restart-mhchub-service.ps1"
})) {
  addCheck(`package-script-${name}`, String(scripts[name] || "").includes(command), {
    expected: command,
    actual: scripts[name] || ""
  });
}

addCheck("mqtt-bridge-explicitly-not-owned", String(scripts["mqtt:bridge"] || "").includes("does not include an MQTT bridge"), {
  actual: scripts["mqtt:bridge"] || ""
});

for (const file of [
  "startup.bat",
  "start_all.bat",
  "stop-all.bat",
  "scripts/startup-guard.ps1",
  "scripts/restart-clean.ps1",
  "scripts/shutdown-iot-system.ps1",
  "scripts/verify-critical-ports.ps1",
  "scripts/set-mhchub-secrets.ps1",
  "scripts/utils/health-check.ps1",
  "scripts/audit-home-install-package.mjs",
  "scripts/audit-dependencies.mjs",
  "scripts/audit-dist-assets.mjs",
  "scripts/ops-production-preflight.mjs",
  "scripts/audit-image-asset-quality.mjs",
  "scripts/audit-operations-preflight-ui.mjs",
  "scripts/audit-live-api-runtime-drift.mjs",
  "scripts/audit-current-source-api-runtime.mjs",
  "scripts/audit-api-json-contract.mjs",
  "scripts/audit-safety-api-endpoints.mjs",
  "scripts/audit-safety-page-routes.mjs",
  "scripts/audit-frontend-js-migration.mjs",
  "scripts/audit-no-runtime-jsx.mjs",
  "vite.config.ts",
  "scripts/clean-dist-stale-assets.ps1",
  "scripts/run-quality-gates.mjs",
  "setup/home-install/install-mhchub-service-windows.ps1",
  "setup/home-install/check-mhchub-service-windows.ps1",
  "setup/home-install/repair-mhchub-service-recovery-windows.ps1",
  "setup/home-install/health-check-windows.ps1",
  "setup/home-install/start-mhchub-windows.ps1",
  "cloudflare/README.md",
  "docs/OPERATIONS_BOUNDARY.md",
  "docs/SAFETY_API_RUNTIME_AUDIT_RUNBOOK.md"
]) {
  addCheck(`file-exists-${file}`, exists(file), { file });
}

addCheck("vite-config-is-typescript-only", exists("vite.config.ts") && !exists("vite.config.js"), {
  hasJavaScriptConfig: exists("vite.config.js"),
  hasTypeScriptConfig: exists("vite.config.ts")
});

const safetyPageRoutesAudit = readText("scripts/audit-safety-page-routes.mjs");
addCheck(
  "safety-page-route-audit-blocks-unexpected-static-routes",
  includesAll(safetyPageRoutesAudit, [
    "extractStaticSafetyRoutes",
    "safety-module-has-no-unexpected-static-routes",
    "safety-sidebar-has-no-unexpected-static-routes",
    "safety-title-map-has-no-unexpected-static-routes",
    "expectedStaticSafetyRoutes"
  ]),
  {}
);

const frontendJsMigrationAudit = readText("scripts/audit-frontend-js-migration.mjs");
addCheck(
  "frontend-js-migration-audit-blocks-js-ts-suppressions-and-explicit-any",
  includesAll(frontendJsMigrationAudit, [
    "allowedJsFiles",
    "allowedTypeScriptSuppressions",
    "allowedExplicitAnyTypes",
    "typeScriptSuppressionPattern",
    "typeScriptSuppressionCount",
    "typeScriptSuppressions",
    "completedAllowedTypeScriptSuppressions",
    "findExplicitAnyTypes",
    "ts.SyntaxKind.AnyKeyword",
    "explicitAnyCount",
    "explicitAnyTypes",
    "completedAllowedExplicitAnyTypes",
    "allowJsDisabled",
    "noImplicitAnyGuardEnabled",
    "typeScriptConfigFindings",
    "viteConfigFindings",
    "vite.config.ts",
    "vite.config.js",
    "includesViteConfigTs"
  ]),
  {}
);

const safetyInteractionsAudit = readText("scripts/audit-safety-interactions.mjs");
addCheck(
  "safety-interactions-audit-clicks-sidebar-navigation",
  includesAll(safetyInteractionsAudit, [
    "sidebarNavigationRoutes",
    "sidebarOnly",
    "--sidebar-only",
    "mockApi",
    "--mock-api",
    "setupMockApi",
    "/api/auth/me",
    "hasStableRouteHealth",
    "waitForSidebarClosed",
    "includeSidebarNavigation",
    "--include-sidebar-navigation",
    "scrollSidebarLinkIntoView",
    "runSidebarNavigation",
    ".main-nav a[href=",
    "sidebarNavigation",
    "sidebarFailureCount",
    "sidebarNavigationCount"
  ]),
  {}
);

const appStyles = readText("src/styles.css");
addCheck(
  "safety-subpage-sidebar-drawer-layering-is-locked",
  includesAll(appStyles, [
    ".app-shell.safety-subpage-shell.sidebar-open .workspace",
    "pointer-events: none !important",
    ".app-shell.safety-subpage-shell.sidebar-open .side-rail",
    "z-index: 1600 !important"
  ]),
  {}
);

const safetyApprovalPage = readText("src/pages/safety/SafetyApprovalPage.tsx");
addCheck(
  "safety-approval-kpi-fetches-include-session",
  includesAll(safetyApprovalPage, [
    "credentials: 'include'",
    "/api/kpi-entries/${entryId}/history",
    "/api/kpi-entries/${id}/history",
    "approve-l1",
    "reject-l1"
  ]),
  {}
);

const startupBat = readText("startup.bat");
addCheck("startup-bat-calls-startup-guard", includesAll(startupBat, ["powershell.exe", "scripts\\startup-guard.ps1"]), {
  preview: startupBat?.slice(0, 160) || ""
});
addCheck("startup-bat-has-no-kill", !hasDangerousKill(startupBat), {});

const startAllBat = readText("start_all.bat");
addCheck("start-all-bat-calls-startup-guard", includesAll(startAllBat, ["powershell.exe", "scripts\\startup-guard.ps1"]), {
  preview: startAllBat?.slice(0, 160) || ""
});
addCheck("start-all-bat-has-no-kill", !hasDangerousKill(startAllBat), {});

const stopAllBat = readText("stop-all.bat");
addCheck("stop-all-bat-calls-confirmed-shutdown", includesAll(stopAllBat, ["scripts\\shutdown-iot-system.ps1", "-ConfirmStop"]), {
  preview: stopAllBat?.slice(0, 180) || ""
});

const startupGuard = readText("scripts/startup-guard.ps1");
addCheck("startup-guard-has-checkonly", includesAll(startupGuard, ["CheckOnly", "AllowProcessFallback", "SkipHealth"]), {});
addCheck("startup-guard-has-no-kill", !hasDangerousKill(startupGuard), {});

const restartClean = readText("scripts/restart-clean.ps1");
addCheck("restart-clean-has-preview-and-port-check", includesAll(restartClean, ["PreviewOnly", "SkipPreview", "VerifyPortsScript"]), {});
addCheck("restart-clean-does-not-kill-process-tree", !hasDangerousKill(restartClean), {});

const shutdown = readText("scripts/shutdown-iot-system.ps1");
addCheck("shutdown-requires-confirmation", includesAll(shutdown, ["ConfirmStop", "PreviewOnly", "Stop-Service"]), {});
addCheck("shutdown-uses-service-not-force-kill", !hasDangerousKill(shutdown), {});

const distCleanup = readText("scripts/clean-dist-stale-assets.ps1");
addCheck(
  "dist-cleanup-is-preview-first-and-confirmed",
  includesAll(distCleanup, [
    "ConfirmStaleCount",
    "requiresAdministratorForApply",
    "Get-CurrentUserContext",
    "Get-AssetDeleteDiagnostic",
    "Test-DirectoryDeleteProbe",
    "sampleDeleteDiagnostic",
    "--full-stale-list",
    "Assert-UnderPath",
    "Remove-Item"
  ]) && !hasDangerousKill(distCleanup),
  {}
);

const qualityGates = readText("scripts/run-quality-gates.mjs");
addCheck(
  "quality-gates-summarizes-cleanup-diagnostics",
  includesAll(qualityGates, [
    "buildArtifactDiagnostics",
    "diagnosticReports",
    "dist-asset-cleanup-preview-summary.json",
    "sampleDeleteDiagnostic",
    "requiresAdministratorForApply",
    "administratorReason"
  ]),
  {}
);

addCheck(
  "quality-gates-runs-service-diagnostic-nonblocking",
  includesAll(qualityGates, [
    "ops:service:diagnose",
    "mhchub-service-check.json",
    "mhchub-service-diagnostic",
    "serviceOk",
    "currentUser",
    "administratorActions",
    "failedChecks",
    "warningChecks"
  ]),
  {}
);

addCheck(
  "quality-gates-summarizes-api-runtime-diagnostics",
  includesAll(qualityGates, [
    "current-source-api-runtime-audit.json",
    "live-api-runtime-drift-audit.json",
    "restartRecommended",
    "staleSignals",
    "childAudits",
    "runtimePort"
  ]),
  {}
);

const productionPreflight = readText("scripts/ops-production-preflight.mjs");
addCheck(
  "production-preflight-summarizes-readiness-reports",
  includesAll(productionPreflight, [
    "production-preflight-summary.json",
    "production-preflight-summary.md",
    "quality-gates-report.json",
    "mhchub-service-check.json",
    "dist-asset-audit.json",
    "dist-asset-cleanup-preview-summary.json",
    "security-headers-audit.json",
    "home-install-package-audit.json",
    "live-api-runtime-drift-audit.json",
    "serviceCurrentUser",
    "serviceAdministratorActions",
    "blockingActions",
    "administratorActions",
    "maintenanceActions",
    "--strict"
  ]),
  {}
);

addCheck(
  "production-preflight-blocks-live-runtime-drift",
  includesAll(productionPreflight, [
    "liveRuntime",
    "live-runtime-api-contract-current",
    "restartRecommended",
    "staleSignals",
    "Restart/reload the live MHChub process",
    "npm run audit:live-api-runtime"
  ]),
  {}
);

addCheck(
  "production-preflight-is-readonly-and-actionable",
  includesAll(productionPreflight, [
    "npm run verify",
    "npm run ops:secrets",
    "npm run ops:service:repair-apply",
    "clean-dist-stale-assets.ps1 -Apply",
    "fs.writeFileSync"
  ])
    && !includesAll(productionPreflight, [".env"])
    && !hasDangerousKill(productionPreflight),
  {}
);

const serverIndex = readText("server/index.js");
const operationsApi = readText("src/services/api.ts");
const operationsPage = readText("src/pages/OperationsPage.tsx");
const translations = readText("src/i18n.ts");
addCheck(
  "production-preflight-api-is-admin-only-and-sanitized",
  includesAll(serverIndex, [
    "productionPreflightFile",
    "readProductionPreflight",
    "sanitizePreflightAction",
    'app.get("/api/system/preflight", requireAdminAccess',
    "production-preflight-summary.json"
  ])
    && !hasDangerousKill(serverIndex),
  {}
);

addCheck(
  "api-activity-log-redacts-sensitive-query-values",
  includesAll(serverIndex, [
    "sensitiveLogQueryPattern",
    "redactRequestTarget",
    "const requestTarget = redactRequestTarget(req.originalUrl)",
    "target: requestTarget",
    "message: `${req.method} ${requestTarget} -> ${res.statusCode}`"
  ])
    && !/target:\s*req\.originalUrl/.test(serverIndex || "")
    && !/message:\s*`\$\{req\.method\}\s+\$\{req\.originalUrl\}/.test(serverIndex || ""),
  {}
);

addCheck(
  "operations-page-surfaces-production-preflight",
  includesAll(`${operationsApi || ""}\n${operationsPage || ""}`, [
    "fetchSystemPreflight",
    "/api/system/preflight",
    "productionPreflight",
    "preflight-summary-grid",
    "preflight-action-list",
    "preflightActionDetail",
    "preflight-action-copy",
    "blockingActions",
    "administratorActions",
    "maintenanceActions",
    "audit:live-api-runtime",
    "live MHChub process",
    "opsPreflightLiveRuntimeAction"
  ]),
  {}
);

addCheck(
  "operations-preflight-live-runtime-copy-is-localized",
  includesAll(translations, [
    "opsPreflightLiveRuntimeAction",
    "live MHChub",
    "API runtime drift"
  ]),
  {}
);

const operationsPreflightUiAudit = readText("scripts/audit-operations-preflight-ui.mjs");
addCheck(
  "operations-preflight-ui-audit-covers-compact-admin-panel",
  includesAll(`${qualityGates || ""}\n${operationsPreflightUiAudit || ""}`, [
    "audit:operations-preflight-ui",
    "operations-preflight-ui-audit.json",
    "/api/system/preflight",
    ".preflight-panel",
    "operations-preflight-",
    "desktop-1440",
    "mobile-390",
    "tv-1920",
    "ADMIN_PASSWORD/WEB_AUTH_SECRET",
    "preflight-admin-user-context-visible",
    "currentUser",
    "rawCommandLeak",
    "fallbackLiveRuntimeAction",
    "live-runtime-api-contract-current",
    "preflight-live-runtime-drift-visible",
    "npm run audit:live-api-runtime",
    "API runtime drift"
  ]),
  {}
);

const documentStorageAudit = readText("scripts/audit-document-storage.mjs");
addCheck(
  "document-storage-audit-supports-db-backed-runtime-source",
  includesAll(documentStorageAudit, [
    "placeholderJsonWithMysqlRuntime",
    "expectedRuntimeDocumentCount",
    "expectedRuntimeDocumentSource",
    "acceptedRuntimeSource",
    "placeholderOnlyDataset"
  ]),
  {}
);

const adminRouteAccessAudit = readText("scripts/audit-admin-route-access.mjs");
addCheck(
  "admin-route-audit-recognizes-safety-architecture-session-guard",
  includesAll(adminRouteAccessAudit, [
    "requireSafetyArchitectureSession",
    "admin-route-mutating-api-routes-require-authenticated-session"
  ]),
  {}
);

const currentSourceApiRuntime = readText("scripts/audit-current-source-api-runtime.mjs");
addCheck(
  "current-source-api-runtime-audit-self-hosts-and-cleans-up",
  includesAll(currentSourceApiRuntime, [
    "findFreePort",
    "server/index.js",
    "PORT: String(selectedPort)",
    "waitForHealth",
    "audit-api-json-contract.mjs",
    "audit-safety-api-endpoints.mjs",
    "current-source-temp-server-port-cleaned-up",
    "current-source-api-runtime-audit.json"
  ]),
  {}
);

const liveApiRuntimeDrift = readText("scripts/audit-live-api-runtime-drift.mjs");
addCheck(
  "live-api-runtime-drift-audit-is-readonly-and-actionable",
  includesAll(liveApiRuntimeDrift, [
    "MHCHUB_LIVE_BASE_URL",
    "live-api-runtime-drift-audit.json",
    "restartRecommended",
    "staleSignals",
    "live-unknown-api-route-is-json-404",
    "live-program-list-returns-json",
    "live-document-architecture-returns-json"
  ]) && !hasDangerousKill(liveApiRuntimeDrift),
  {}
);

const imageAssetAudit = readText("scripts/audit-image-asset-quality.mjs");
const homePage = readText("src/pages/HomePage.tsx");
addCheck(
  "image-asset-audit-locks-4k-background-and-hero-srcset",
  includesAll(`${qualityGates || ""}\n${imageAssetAudit || ""}\n${homePage || ""}`, [
    "audit:image-assets",
    "image-asset-quality-audit.json",
    "light-mode-background-4k.webp",
    "safety-6s-hero-2400.webp",
    "desktop-3840-4k",
    "src/pages/HomePage.css",
    "/images/safety-6s-hero-2400.webp 2400w",
    "hero-browser-has-enough-source-pixels",
    "hero-browser-object-fit-contain",
    "heroCoverRule",
    "heroScaleRule",
    "currentSrc",
    "sourcePixelWidth"
  ]),
  {}
);

const secrets = readText("scripts/set-mhchub-secrets.ps1");
addCheck("secrets-script-has-dryrun-and-backup", includesAll(secrets, ["DryRun", "backupRoot", "Read-Host", "AsSecureString"]), {});
addCheck("secrets-script-does-not-write-password-to-host", !/Write-Host.*password/i.test(secrets || ""), {});

const health = readText("scripts/utils/health-check.ps1");
addCheck("health-check-covers-core-runtime", includesAll(health, ["api/health", "api/ready", "api/documents", "excel-html-preview"]), {});
addCheck(
  "health-check-explains-readiness-remediation",
  includesAll(health, ["Get-ReadinessAdvice", "admin-password", "npm run ops:secrets", "-StrictReady"]),
  {}
);

const installService = readText("setup/home-install/install-mhchub-service-windows.ps1");
addCheck(
  "install-service-auto-starts-and-recovers",
  includesAll(installService, [
    "SERVICE_AUTO_START",
    "delayed-auto",
    "AppExit",
    "Default",
    "Restart",
    "failure",
    "restart/60000/restart/60000/restart/120000",
    "failureflag"
  ]),
  {}
);
addCheck("install-service-uses-nssm-log-rotation", includesAll(installService, ["AppRotateFiles", "AppRotateOnline", "AppRotateBytes"]), {});

const checkService = readText("setup/home-install/check-mhchub-service-windows.ps1");
addCheck(
  "home-service-check-validates-startup-recovery-health",
  includesAll(checkService, [
    "Get-Service",
    "Win32_Service",
    "qfailure",
    "qfailureflag",
    "DiagnosticOnly",
    "Get-ReadinessMessage",
    "Read-ReadinessErrorBody",
    "admin-password",
    "npm run ops:secrets",
    "api/health",
    "StrictReady",
    'return "3333"',
    "Get-CurrentUserContext",
    "AdministratorActions",
    "currentUser",
    "administratorActions",
    "mhchub-service-check.json",
    "Remediation"
  ]) && !hasDangerousKill(checkService),
  {}
);

const repairService = readText("setup/home-install/repair-mhchub-service-recovery-windows.ps1");
addCheck(
  "home-service-repair-previews-and-applies-recovery-only",
  includesAll(repairService, [
    "Apply",
    "Assert-Admin",
    "Get-Service",
    "failure",
    "failureflag",
    "restart/60000/restart/60000/restart/120000",
    "No service configuration was changed",
    "This did not restart the service"
  ]) && !hasDangerousKill(repairService),
  {}
);

const envExample = readText(".env.example");
addCheck(
  "env-example-default-port-is-company-port",
  includesAll(envExample, ["PORT=3333", "http://localhost:3333", "http://127.0.0.1:3333"]) && !String(envExample || "").includes(":4174") && !String(envExample || "").includes("PORT=4174"),
  {}
);

const rootReadme = readText("README.md");
const homeInstallReadme = readText("setup/home-install/README_HOME_INSTALL.md");
const structureDoc = readText("docs/STRUCTURE.md");
const functionalSpec = readText("docs/FUNCTIONAL_SPEC.md");
const securityReview = readText("docs/SAFETY_6S_PRODUCT_SECURITY_REVIEW.md");
addCheck(
  "readmes-use-company-port",
  includesAll(`${rootReadme || ""}\n${homeInstallReadme || ""}`, [
    "http://localhost:3333",
    "check-mhchub-service-windows.ps1",
    "npm run ops:service:repair-preview",
    "npm run ops:service:repair-apply"
  ]) && !String(rootReadme || "").includes(":4174") && !String(homeInstallReadme || "").includes(":4174"),
  {}
);
addCheck(
  "root-readme-uses-current-admin-secret-readiness",
  includesAll(rootReadme, [
    "ADMIN_PASSWORD",
    "WEB_AUTH_SECRET",
    "npm run ops:secrets",
    "admin-password (ADMIN_PASSWORD)",
    "npm run ops:health"
  ]) && !String(rootReadme || "").includes("ADMIN_PIN"),
  {}
);
addCheck(
  "docs-use-current-admin-session-readiness",
  includesAll(`${structureDoc || ""}\n${functionalSpec || ""}\n${securityReview || ""}`, [
    "ADMIN_PASSWORD",
    "WEB_AUTH_SECRET",
    "ENABLE_LEGACY_ADMIN_PIN=false",
    "session admin",
    "session cookie"
  ])
    && !/ADMIN_PIN\s*=\s*2468/i.test(`${structureDoc || ""}\n${functionalSpec || ""}\n${securityReview || ""}`)
    && !/(bằng|bang)\s+`?ADMIN_PIN`?/i.test(functionalSpec || "")
    && !/(sai|đúng|dung)\s+PIN/i.test(functionalSpec || "")
    && !/dùng PIN mặc định/i.test(functionalSpec || "")
    && !/(sai|đúng|dung)\s+PIN/i.test(securityReview || "")
    && !/Chi dung PIN admin/i.test(securityReview || ""),
  {}
);

const installHome = readText("setup/home-install/install-home-windows.ps1");
addCheck(
  "home-install-default-port-is-company-port",
  includesAll(installHome, ['Read-Default -Prompt "Web port" -Default "3333"', "ALLOWED_ORIGINS"]) && !String(installHome || "").includes('"4174"'),
  {}
);

const homeStart = readText("setup/home-install/start-mhchub-windows.ps1");
const homeHealth = readText("setup/home-install/health-check-windows.ps1");
addCheck(
  "home-install-start-health-fallback-port-is-company-port",
  includesAll(`${homeStart || ""}\n${homeHealth || ""}`, ['return "3333"']) && !String(homeStart || "").includes('"4174"') && !String(homeHealth || "").includes('"4174"'),
  {}
);

const packageHomeInstall = readText("scripts/package-home-install.ps1");
addCheck(
  "package-home-install-includes-root-entrypoints",
  includesAll(packageHomeInstall, ["startup.bat", "start_all.bat", "stop-all.bat"]),
  {}
);
addCheck(
  "package-home-install-includes-home-install-scripts",
  includesAll(packageHomeInstall, ["setup\\home-install"]),
  {}
);
addCheck(
  "package-home-install-includes-cloudflare-readme-only",
  includesAll(packageHomeInstall, ["cloudflare\\README.md"]) && !/Copy-OptionalDirectory\s+\(Join-Path\s+\$ProjectRoot\s+["']cloudflare["']\)/i.test(packageHomeInstall || ""),
  {}
);
addCheck(
  "package-home-install-excludes-secrets-and-runtime",
  includesAll(packageHomeInstall, [
    ".env",
    ".env.local",
    "node_modules",
    "server\\data\\auth\\users.json",
    "server\\data\\auth\\auth_audit_log.json",
    "server\\data\\auth\\auth_login_attempts.json",
    "server\\data\\backups",
    "server/uploads content"
  ]),
  {}
);
addCheck(
  "package-home-install-asserts-output-under-project",
  includesAll(packageHomeInstall, ["Assert-UnderPath", "$OutputDir", "$stageDir", "$zipPath"]),
  {}
);

const gitignore = readText(".gitignore");
for (const pattern of [".env", ".env.*", "logs/", "*.log", "server/uploads/*", "server/previews/*", "server/data/auth/*", "server/data/backups/*", "server/data/*.log"]) {
  addCheck(`gitignore-runtime-${pattern}`, String(gitignore || "").includes(pattern), { pattern });
}

const cloudflareReadme = readText("cloudflare/README.md");
addCheck("cloudflare-readme-states-not-configured", includesAll(cloudflareReadme, ["not configured", "Do not expose"]), {});

const boundary = readText("docs/OPERATIONS_BOUNDARY.md");
addCheck(
  "boundary-doc-defines-non-owned-systems",
  includesAll(boundary, ["Node-RED", "MQTT bridge", "Cloudflare Tunnel", "PM2 cluster", "Linux systemd"]),
  {}
);
addCheck("boundary-doc-defines-owned-service", includesAll(boundary, ["node server/index.js", "MHChub web/API", "3333"]), {});
addCheck(
  "boundary-doc-links-safety-api-runtime-runbook",
  includesAll(boundary, [
    "SAFETY_API_RUNTIME_AUDIT_RUNBOOK.md",
    "npm run audit:current-source-api-runtime",
    "npm run audit:live-api-runtime",
    "restartRecommended"
  ]),
  {}
);

const runtimeRunbook = readText("docs/SAFETY_API_RUNTIME_AUDIT_RUNBOOK.md");
addCheck(
  "safety-api-runtime-runbook-covers-current-live-and-recovery",
  includesAll(runtimeRunbook, [
    "Current-source runtime",
    "Live runtime drift",
    "MHCHUB_LIVE_BASE_URL",
    "npm run audit:current-source-api-runtime",
    "npm run audit:live-api-runtime",
    "restartRecommended: true",
    "npm run ops:preflight",
    "npm run audit:safety-interactions",
    "Do not treat a passing browser smoke as proof"
  ]),
  {}
);

const failedChecks = checks.filter((check) => !check.pass);
const report = {
  generatedAtUtc: new Date().toISOString(),
  ok: failedChecks.length === 0,
  reportPath: normalize(path.relative(rootDir, reportPath)),
  summary: {
    total: checks.length,
    passed: checks.length - failedChecks.length,
    failed: failedChecks.length
  },
  failedChecks,
  checks
};

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (failedChecks.length) {
  process.exit(1);
}
