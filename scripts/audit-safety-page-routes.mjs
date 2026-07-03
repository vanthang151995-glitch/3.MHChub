import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const reportsDir = path.join(rootDir, "qa", "reports");
const reportPath = path.join(reportsDir, "safety-page-routes-audit.json");
const safetyDir = path.join(rootDir, "src", "pages", "safety");
const modulePath = path.join(safetyDir, "SafetyOperationsModule.tsx");
const appPath = path.join(rootDir, "src", "App.tsx");
const appShellPath = path.join(rootDir, "src", "app", "AppShell.tsx");
const departmentPagePath = path.join(rootDir, "src", "pages", "DepartmentPage.tsx");

const expectedPages = [
  { path: "", module: "SafetyDashboardPage", component: "SafetyDashboardPage", nav: "/safety-6s" },
  { path: "warnings", module: "SafetyWarningsPage", component: "SafetyWarningsPage", nav: "/safety-6s/warnings" },
  { path: "incidents", module: "SafetyIncidentsPage", component: "SafetyIncidentsPage", nav: "/safety-6s/incidents" },
  { path: "checklist", module: "SafetyChecklistPage", component: "SafetyChecklistPage", nav: "/safety-6s/checklist" },
  { path: "audits", module: "SafetyAuditsPage", component: "SafetyAuditsPage", nav: "/safety-6s/audits" },
  { path: "actions", module: "SafetyActionsPage", component: "SafetyActionsPage", nav: "/safety-6s/actions" },
  { path: "locations", module: "SafetyLocationsPage", component: "SafetyLocationsPage", nav: "/safety-6s/locations" },
  { path: "kyt", module: "SafetySpecialProgramPage", component: "SafetySpecialProgramPage", nav: "/safety-6s/kyt" },
  { path: "pccc", module: "SafetySpecialProgramPage", component: "SafetySpecialProgramPage", nav: "/safety-6s/pccc" },
  { path: "medical", module: "SafetySpecialProgramPage", component: "SafetySpecialProgramPage", nav: "/safety-6s/medical" },
  { path: "self-inspection", module: "SafetySpecialProgramPage", component: "SafetySpecialProgramPage", nav: "/safety-6s/self-inspection" },
  { path: "kpi", module: "SafetyKpiPage", component: "SafetyKpiPage", nav: "/safety-6s/kpi" },
  { path: "data-entry", module: "SafetyDataEntryPage", component: "SafetyDataEntryPage", nav: "/safety-6s/data-entry" },
  { path: "approval", module: "SafetyApprovalPage", component: "SafetyApprovalPage", nav: "/safety-6s/approval" },
  { path: "documents", module: "SafetyDocumentsPage", component: "SafetyDocumentsPage", nav: "/safety-6s/documents" },
  { path: "reports", module: "SafetyReportsPage", component: "SafetyReportsPage", nav: "/safety-6s/reports" },
  { path: "training", module: "SafetyTrainingPage", component: "SafetyTrainingPage", nav: "/safety-6s/training" },
  { path: "reference", module: "SafetyReferencePage", component: "SafetyReferencePage", nav: "/safety-6s/reference" },
  { path: "settings", module: "SafetySettingsPage", component: "SafetySettingsPage", nav: "/safety-6s/settings" }
];

const expectedModulePaths = new Set(expectedPages.map((page) => page.path).filter(Boolean));
const expectedStaticSafetyRoutes = new Set(expectedPages.map((page) => page.nav));
const intentionallyHiddenSafetySidebarRoutes = new Set([
  "/safety-6s/locations",
  "/safety-6s/kyt",
  "/safety-6s/pccc",
  "/safety-6s/medical",
  "/safety-6s/self-inspection"
]);
const intentionallyUnroutedPageFiles = new Set(["SafetyWarningsIncidentsPage.tsx"]);
const normalize = (value) => value.replace(/\\/g, "/");
const toRelative = (filePath) => normalize(path.relative(rootDir, filePath));
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const readText = (filePath) => fs.readFileSync(filePath, "utf8");
const uniqueSorted = (items) => Array.from(new Set(items)).sort();
const extractStaticSafetyRoutes = (source) =>
  uniqueSorted(
    Array.from(String(source || "").matchAll(/["'](\/safety-6s(?:\/[a-z0-9-]+)*)["']/gi))
      .map((match) => match[1])
  );
const moduleSource = readText(modulePath);
const appSource = readText(appPath);
const appShellSource = readText(appShellPath);
const departmentPageSource = readText(departmentPagePath);
const sidebarStart = appShellSource.indexOf("const sidebarSections");
const sidebarEndCandidates = [
  appShellSource.indexOf("const visibleSidebarSections", sidebarStart),
  appShellSource.indexOf("const allNavItems", sidebarStart),
  appShellSource.indexOf("const routeTitleOverrides", sidebarStart)
].filter((index) => index > sidebarStart);
const sidebarEnd = sidebarEndCandidates.length ? Math.min(...sidebarEndCandidates) : -1;
const titleStart = appShellSource.indexOf("const routeTitleOverrides");
const departmentTitleStart = appShellSource.indexOf("const departmentRouteMatch", titleStart);
const sidebarSource = sidebarStart >= 0 && sidebarEnd > sidebarStart ? appShellSource.slice(sidebarStart, sidebarEnd) : "";
const titleSource = titleStart >= 0 && departmentTitleStart > titleStart ? appShellSource.slice(titleStart, departmentTitleStart) : "";
const sidebarEntryHasFlag = (route, flag) => {
  const routePattern = escapeRegExp(route);
  const flagPattern = escapeRegExp(flag);
  return new RegExp(`\\{[^{}]*to:\\s*["']${routePattern}["'][^{}]*${flagPattern}:\\s*true[^{}]*\\}`).test(sidebarSource);
};

const checks = [];
const addCheck = (name, pass, evidence = {}) => {
  checks.push({ evidence, name, pass: Boolean(pass) });
};

addCheck("safety-operations-module-exists", fs.existsSync(modulePath), { file: toRelative(modulePath) });
addCheck("app-shell-exists", fs.existsSync(appShellPath), { file: toRelative(appShellPath) });
addCheck("app-router-exists", fs.existsSync(appPath), { file: toRelative(appPath) });
addCheck("safety-frame-wraps-routes", moduleSource.includes("<SafetyFrame model={model}>"), {
  file: toRelative(modulePath)
});
addCheck("safety-routes-have-wildcard-dashboard-fallback", moduleSource.includes('path="*"') && moduleSource.includes("<SafetyDashboardPage model={model} />"), {
  file: toRelative(modulePath)
});
addCheck(
  "safety-dynamic-department-route-complete",
  fs.existsSync(departmentPagePath) &&
    departmentPageSource.includes("export function DepartmentPage") &&
    appSource.includes('const DepartmentPage = lazy') &&
    appSource.includes('import("./pages/DepartmentPage")') &&
    appSource.includes('path="/safety-6s/departments/:id"') &&
    appSource.includes("<ProtectedRoute") &&
    appSource.includes("<DepartmentPage") &&
    appShellSource.includes("departmentRouteMatch") &&
    appShellSource.includes("/^\\/safety-6s\\/departments\\/([^/]+)$/"),
  {
    appFile: toRelative(appPath),
    departmentFile: toRelative(departmentPagePath),
    titleSource: toRelative(appShellPath)
  }
);

const pageResults = expectedPages.map((page) => {
  const filePath = path.join(safetyDir, `${page.module}.tsx`);
  const source = fs.existsSync(filePath) ? readText(filePath) : "";
  const lazyDeclared = moduleSource.includes(`const ${page.component} = lazy`);
  const lazyImport = moduleSource.includes(`import("./${page.module}")`) && moduleSource.includes(`default: module.${page.component}`);
  const routeDeclared = page.path
    ? moduleSource.includes(`path="${page.path}"`) && moduleSource.includes(`element={<${page.component}`)
    : moduleSource.includes("<Route index") && moduleSource.includes(`element={<${page.component}`);
  const pageExists = fs.existsSync(filePath);
  const componentExported =
    source.includes(`export function ${page.component}`) ||
    source.includes(`export const ${page.component}`) ||
    source.includes(`export default ${page.component}`);
  const sidebarLinked = sidebarSource.includes(`to: "${page.nav}"`);
  const intentionallyHiddenInSafetySidebar = intentionallyHiddenSafetySidebarRoutes.has(page.nav);
  const sidebarHiddenInSafetyMode = sidebarEntryHasFlag(page.nav, "hideInSafetySidebar");
  const sidebarVisibleInSafetyMode = sidebarLinked && !sidebarHiddenInSafetyMode;
  const sidebarMatchesExpectedVisibility = intentionallyHiddenInSafetySidebar ? sidebarHiddenInSafetyMode : sidebarVisibleInSafetyMode;
  const titleMapped = page.path ? titleSource.includes(`"${page.nav}"`) : appShellSource.includes(`{ to: "${page.nav}"`);

  return {
    component: page.component,
    componentExported,
    file: toRelative(filePath),
    lazyDeclared,
    lazyImport,
    nav: page.nav,
    pageExists,
    path: page.path || "(index)",
    routeDeclared,
    sidebarHiddenInSafetyMode,
    sidebarLinked,
    sidebarMatchesExpectedVisibility,
    sidebarVisibleInSafetyMode,
    titleMapped,
    ok: pageExists && componentExported && lazyDeclared && lazyImport && routeDeclared && sidebarLinked && sidebarMatchesExpectedVisibility && titleMapped
  };
});

for (const result of pageResults) {
  addCheck(`safety-page-route-complete:${result.path}`, result.ok, result);
}

const expectedPageFiles = new Set(expectedPages.map((page) => `${page.module}.tsx`));
const pageFiles = fs
  .readdirSync(safetyDir)
  .filter((fileName) => /^Safety[A-Za-z0-9]+Page\.tsx$/.test(fileName))
  .sort();
const unroutedPageFiles = pageFiles.filter((fileName) => !expectedPageFiles.has(fileName) && !intentionallyUnroutedPageFiles.has(fileName));

addCheck("safety-page-files-all-routed-or-intentional", unroutedPageFiles.length === 0, {
  expectedPageFiles: Array.from(expectedPageFiles).sort(),
  intentionallyUnroutedPageFiles: Array.from(intentionallyUnroutedPageFiles).sort(),
  pageFiles,
  unroutedPageFiles
});

const primarySidebarRoutes = expectedPages
  .map((page) => page.nav)
  .filter((route) => route !== "/safety-6s" && !intentionallyHiddenSafetySidebarRoutes.has(route));
const sidebarRouteOrder = primarySidebarRoutes
  .map((route) => ({ route, index: sidebarSource.indexOf(`to: "${route}"`) }));
const missingSidebarOrder = sidebarRouteOrder.filter((item) => item.index < 0);
addCheck("safety-sidebar-covers-primary-subpages", missingSidebarOrder.length === 0, { sidebarRouteOrder, missingSidebarOrder });

const hiddenSidebarRoutes = expectedPages
  .map((page) => page.nav)
  .filter((route) => intentionallyHiddenSafetySidebarRoutes.has(route))
  .map((route) => ({
    route,
    linked: sidebarSource.includes(`to: "${route}"`),
    hiddenInSafetySidebar: sidebarEntryHasFlag(route, "hideInSafetySidebar")
  }));
const invalidHiddenSidebarRoutes = hiddenSidebarRoutes.filter((item) => !item.linked || !item.hiddenInSafetySidebar);
addCheck("safety-sidebar-secondary-routes-intentionally-hidden", invalidHiddenSidebarRoutes.length === 0, {
  hiddenSidebarRoutes,
  invalidHiddenSidebarRoutes
});

const moduleRoutePaths = uniqueSorted(
  Array.from(moduleSource.matchAll(/<Route\b[^>]*\bpath="([^"]+)"/g)).map((match) => match[1])
);
const unexpectedModuleRoutePaths = moduleRoutePaths.filter((routePath) => routePath !== "*" && !expectedModulePaths.has(routePath));
addCheck("safety-module-has-no-unexpected-static-routes", unexpectedModuleRoutePaths.length === 0, {
  expectedModulePaths: Array.from(expectedModulePaths).sort(),
  moduleRoutePaths,
  unexpectedModuleRoutePaths
});

const sidebarStaticSafetyRoutes = extractStaticSafetyRoutes(sidebarSource);
const unexpectedSidebarSafetyRoutes = sidebarStaticSafetyRoutes.filter((route) => !expectedStaticSafetyRoutes.has(route));
addCheck("safety-sidebar-has-no-unexpected-static-routes", unexpectedSidebarSafetyRoutes.length === 0, {
  expectedStaticSafetyRoutes: Array.from(expectedStaticSafetyRoutes).sort(),
  sidebarStaticSafetyRoutes,
  unexpectedSidebarSafetyRoutes
});

const titleStaticSafetyRoutes = extractStaticSafetyRoutes(titleSource);
const unexpectedTitleSafetyRoutes = titleStaticSafetyRoutes.filter((route) => !expectedStaticSafetyRoutes.has(route));
addCheck("safety-title-map-has-no-unexpected-static-routes", unexpectedTitleSafetyRoutes.length === 0, {
  expectedStaticSafetyRoutes: Array.from(expectedStaticSafetyRoutes).sort(),
  titleStaticSafetyRoutes,
  unexpectedTitleSafetyRoutes
});

const failedChecks = checks.filter((item) => !item.pass);
const report = {
  checkedAtUtc: new Date().toISOString(),
  failedChecks,
  ok: failedChecks.length === 0,
  pageResults,
  reportPath: toRelative(reportPath),
  summary: {
    failed: failedChecks.length,
    passed: checks.length - failedChecks.length,
    total: checks.length
  },
  checks
};

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      failedChecks: failedChecks.map((item) => item.name),
      ok: report.ok,
      pageCount: expectedPages.length,
      reportPath: report.reportPath,
      summary: report.summary
    },
    null,
    2
  )
);

if (!report.ok) process.exit(1);
