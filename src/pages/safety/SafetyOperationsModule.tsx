import { lazy, Suspense, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import type { HubModel } from "../../core/hubCore";
import { SafetyFrame } from "./SafetyFrame";
import "./safety-shared.css";

const loadSafetyDashboardPage = () =>
  import("./SafetyDashboardPage").then((module) => ({ default: module.SafetyDashboardPage }));
const loadSafetyWarningsPage = () =>
  import("./SafetyWarningsPage").then((module) => ({ default: module.SafetyWarningsPage }));
const loadSafetyIncidentsPage = () =>
  import("./SafetyIncidentsPage").then((module) => ({ default: module.SafetyIncidentsPage }));
const loadSafetyChecklistPage = () =>
  import("./SafetyChecklistPage").then((module) => ({ default: module.SafetyChecklistPage }));
const loadSafetyAuditsPage = () =>
  import("./SafetyAuditsPage").then((module) => ({ default: module.SafetyAuditsPage }));
const loadSafetyActionsPage = () =>
  import("./SafetyActionsPage").then((module) => ({ default: module.SafetyActionsPage }));
const loadSafetyLocationsPage = () =>
  import("./SafetyLocationsPage").then((module) => ({ default: module.SafetyLocationsPage }));
const loadSafetySpecialProgramPage = () =>
  import("./SafetySpecialProgramPage").then((module) => ({ default: module.SafetySpecialProgramPage }));
const loadSafetyKpiPage = () =>
  import("./SafetyKpiPage").then((module) => ({ default: module.SafetyKpiPage }));
const loadSafetyDataEntryPage = () =>
  import("./SafetyDataEntryPage").then((module) => ({ default: module.SafetyDataEntryPage }));
const loadSafetyApprovalPage = () =>
  import("./SafetyApprovalPage").then((module) => ({ default: module.SafetyApprovalPage }));
const loadSafetyDocumentsPage = () =>
  import("./SafetyDocumentsPage").then((module) => ({ default: module.SafetyDocumentsPage }));
const loadSafetyReportsPage = () =>
  import("./SafetyReportsPage").then((module) => ({ default: module.SafetyReportsPage }));
const loadSafetyTrainingPage = () =>
  import("./SafetyTrainingPage").then((module) => ({ default: module.SafetyTrainingPage }));
const loadSafetyReferencePage = () =>
  import("./SafetyReferencePage").then((module) => ({ default: module.SafetyReferencePage }));
const loadSafetySettingsPage = () =>
  import("./SafetySettingsPage").then((module) => ({ default: module.SafetySettingsPage }));
const loadSafetyInspectionPlanPage = () =>
  import("./SafetyInspectionPlanPage").then((module) => ({ default: module.SafetyInspectionPlanPage }));
const loadSafetyMeetingPage = () =>
  import("./SafetyMeetingPage").then((module) => ({ default: module.SafetyMeetingPage }));
const loadSafetyDeptReportPage = () =>
  import("./SafetyDeptReportPage").then((module) => ({ default: module.SafetyDeptReportPage }));
const loadSafetyIntelPage = () =>
  import("./SafetyIntelPage").then((module) => ({ default: module.SafetyIntelPage }));
const loadSafetyCapaApprovalPage = () =>
  import("./SafetyCapaApprovalPage").then((module) => ({ default: module.SafetyCapaApprovalPage }));

const SafetyDashboardPage = lazy(loadSafetyDashboardPage);
const SafetyWarningsPage = lazy(loadSafetyWarningsPage);
const SafetyIncidentsPage = lazy(loadSafetyIncidentsPage);
const SafetyChecklistPage = lazy(loadSafetyChecklistPage);
const SafetyAuditsPage = lazy(loadSafetyAuditsPage);
const SafetyActionsPage = lazy(loadSafetyActionsPage);
const SafetyLocationsPage = lazy(loadSafetyLocationsPage);
const SafetySpecialProgramPage = lazy(loadSafetySpecialProgramPage);
const SafetyKpiPage = lazy(loadSafetyKpiPage);
const SafetyDataEntryPage = lazy(loadSafetyDataEntryPage);
const SafetyApprovalPage = lazy(loadSafetyApprovalPage);
const SafetyDocumentsPage = lazy(loadSafetyDocumentsPage);
const SafetyReportsPage = lazy(loadSafetyReportsPage);
const SafetyTrainingPage = lazy(loadSafetyTrainingPage);
const SafetyReferencePage = lazy(loadSafetyReferencePage);
const SafetySettingsPage = lazy(loadSafetySettingsPage);
const SafetyInspectionPlanPage = lazy(loadSafetyInspectionPlanPage);
const SafetyMeetingPage = lazy(loadSafetyMeetingPage);
const SafetyDeptReportPage = lazy(loadSafetyDeptReportPage);
const SafetyIntelPage = lazy(loadSafetyIntelPage);
const SafetyCapaApprovalPage = lazy(loadSafetyCapaApprovalPage);

const safetyRoutePreloaders = [
  loadSafetyDashboardPage,
  loadSafetyWarningsPage,
  loadSafetyIncidentsPage,
  loadSafetyChecklistPage,
  loadSafetyAuditsPage,
  loadSafetyActionsPage,
  loadSafetyLocationsPage,
  loadSafetySpecialProgramPage,
  loadSafetyKpiPage,
  loadSafetyDataEntryPage,
  loadSafetyApprovalPage,
  loadSafetyDocumentsPage,
  loadSafetyReportsPage,
  loadSafetyTrainingPage,
  loadSafetyReferencePage,
  loadSafetySettingsPage,
  loadSafetyInspectionPlanPage,
  loadSafetyMeetingPage,
  loadSafetyDeptReportPage,
  loadSafetyIntelPage,
  loadSafetyCapaApprovalPage
];

const specialProgramRoutes = new Set([
  "/safety-6s/kyt",
  "/safety-6s/pccc",
  "/safety-6s/medical",
  "/safety-6s/self-inspection"
]);

const safetyPreloadersByRoute = [
  { test: (path: string) => path === "/safety-6s", loader: loadSafetyDashboardPage },
  { test: (path: string) => path === "/safety-6s/warnings", loader: loadSafetyWarningsPage },
  { test: (path: string) => path === "/safety-6s/incidents", loader: loadSafetyIncidentsPage },
  { test: (path: string) => path === "/safety-6s/checklist", loader: loadSafetyChecklistPage },
  { test: (path: string) => path === "/safety-6s/audits", loader: loadSafetyAuditsPage },
  { test: (path: string) => path === "/safety-6s/actions", loader: loadSafetyActionsPage },
  { test: (path: string) => path === "/safety-6s/locations", loader: loadSafetyLocationsPage },
  { test: (path: string) => specialProgramRoutes.has(path), loader: loadSafetySpecialProgramPage },
  { test: (path: string) => path === "/safety-6s/kpi", loader: loadSafetyKpiPage },
  { test: (path: string) => path === "/safety-6s/data-entry", loader: loadSafetyDataEntryPage },
  { test: (path: string) => path === "/safety-6s/approval", loader: loadSafetyApprovalPage },
  { test: (path: string) => path === "/safety-6s/documents", loader: loadSafetyDocumentsPage },
  { test: (path: string) => path === "/safety-6s/reports", loader: loadSafetyReportsPage },
  { test: (path: string) => path === "/safety-6s/training", loader: loadSafetyTrainingPage },
  { test: (path: string) => path === "/safety-6s/reference", loader: loadSafetyReferencePage },
  { test: (path: string) => path === "/safety-6s/settings", loader: loadSafetySettingsPage },
  { test: (path: string) => path === "/safety-6s/inspection-plans", loader: loadSafetyInspectionPlanPage },
  { test: (path: string) => path === "/safety-6s/safety-meetings", loader: loadSafetyMeetingPage },
  { test: (path: string) => path === "/safety-6s/dept-report", loader: loadSafetyDeptReportPage },
  { test: (path: string) => path === "/safety-6s/intel", loader: loadSafetyIntelPage },
  { test: (path: string) => path === "/safety-6s/capa-approval", loader: loadSafetyCapaApprovalPage }
];

type IdleWindow = Window & typeof globalThis & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function preloadSafetyRouteChunks() {
  let index = 0;
  const runNext = () => {
    const loader = safetyRoutePreloaders[index];
    index += 1;
    if (!loader) return;
    loader().catch(() => {});
    globalThis.setTimeout(runNext, 400);
  };

  globalThis.setTimeout(runNext, 800);
}

function preloadSafetyRouteForPath(pathname: string) {
  const match = safetyPreloadersByRoute.find((item) => item.test(pathname));
  match?.loader().catch(() => {});
}

type ShellProps = {
  lang: string;
  t: (key: string) => string;
  model: HubModel;
  theme?: "light" | "dark";
  setTheme?: (theme: "light" | "dark") => void;
};

function SafetyRouteFallback({ label }: { label: string }) {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#64748b", fontSize: 13, fontWeight: 600, opacity: 0.7 }}>{label}</div>
    </div>
  );
}

export function SafetyOperationsModule({ model, t, theme, setTheme }: ShellProps) {
  const loadingLabel = t("loading") || "Đang tải...";

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const idleWindow = window as IdleWindow;
    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(preloadSafetyRouteChunks, { timeout: 1200 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timer = globalThis.setTimeout(preloadSafetyRouteChunks, 500);
    return () => globalThis.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return undefined;
    const preloadFromEvent = (event: MouseEvent | TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest?.("a[href]");
      if (!link) return;
      const href = link.getAttribute("href") || "";
      if (!href.startsWith("/safety-6s")) return;
      preloadSafetyRouteForPath(new URL(href, window.location.origin).pathname);
    };

    document.addEventListener("mouseover", preloadFromEvent, { passive: true });
    document.addEventListener("touchstart", preloadFromEvent, { passive: true });
    return () => {
      document.removeEventListener("mouseover", preloadFromEvent);
      document.removeEventListener("touchstart", preloadFromEvent);
    };
  }, []);

  return (
    <SafetyFrame model={model}>
      <Suspense fallback={<SafetyRouteFallback label={loadingLabel} />}>
        <Routes>
          <Route index element={<SafetyDashboardPage model={model} />} />
          <Route path="warnings" element={<SafetyWarningsPage />} />
          <Route path="incidents" element={<SafetyIncidentsPage />} />
          <Route path="checklist" element={<SafetyChecklistPage />} />
          <Route path="audits" element={<SafetyAuditsPage />} />
          <Route path="actions" element={<SafetyActionsPage />} />
          <Route path="locations" element={<SafetyLocationsPage />} />
          <Route path="kyt" element={<SafetySpecialProgramPage programId="kyt" />} />
          <Route path="pccc" element={<SafetySpecialProgramPage programId="pccc" />} />
          <Route path="medical" element={<SafetySpecialProgramPage programId="medical" />} />
          <Route path="self-inspection" element={<SafetySpecialProgramPage programId="self-inspection" />} />
          <Route path="kpi" element={<SafetyKpiPage />} />
          <Route path="data-entry" element={<SafetyDataEntryPage />} />
          <Route path="approval" element={<SafetyApprovalPage />} />
          <Route path="documents" element={<SafetyDocumentsPage />} />
          <Route path="reports" element={<SafetyReportsPage />} />
          <Route path="training" element={<SafetyTrainingPage />} />
          <Route path="reference" element={<SafetyReferencePage />} />
          <Route path="settings" element={<SafetySettingsPage theme={theme} setTheme={setTheme} />} />
          <Route path="inspection-plans" element={<SafetyInspectionPlanPage />} />
          <Route path="safety-meetings" element={<SafetyMeetingPage />} />
          <Route path="dept-report" element={<SafetyDeptReportPage />} />
          <Route path="intel" element={<SafetyIntelPage />} />
          <Route path="capa-approval" element={<SafetyCapaApprovalPage />} />
          <Route path="*" element={<SafetyDashboardPage model={model} />} />
        </Routes>
      </Suspense>
    </SafetyFrame>
  );
}

export default SafetyOperationsModule;
