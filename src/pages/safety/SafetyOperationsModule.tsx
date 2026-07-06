import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { HubModel } from "../../core/hubCore";
import { SafetyFrame } from "./SafetyFrame";
import { useAuth } from "../../auth/AuthContext";
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
const loadSafetyCapaReportPage = () =>
  import("./SafetyCapaReportPage").then((module) => ({ default: module.SafetyCapaReportPage }));
const loadSafetyOfficersPage = () =>
  import("./SafetyOfficersPage").then((module) => ({ default: module.SafetyOfficersPage }));
const loadSafetyCalendarPage = () =>
  import("./SafetyCalendarPage").then((module) => ({ default: module.SafetyCalendarPage }));

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
const SafetyCapaReportPage = lazy(loadSafetyCapaReportPage);
const SafetyOfficersPage   = lazy(loadSafetyOfficersPage);
const SafetyCalendarPage  = lazy(loadSafetyCalendarPage);

const safetyRoutePreloaders = [
  loadSafetyDashboardPage,
  loadSafetyCalendarPage,
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
  loadSafetyCapaApprovalPage,
  loadSafetyCapaReportPage,
  loadSafetyOfficersPage
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
  { test: (path: string) => path === "/safety-6s/capa-approval", loader: loadSafetyCapaApprovalPage },
  { test: (path: string) => path === "/safety-6s/capa-report", loader: loadSafetyCapaReportPage },
  { test: (path: string) => path === "/safety-6s/officers",  loader: loadSafetyOfficersPage  },
  { test: (path: string) => path === "/safety-6s/calendar",  loader: loadSafetyCalendarPage  }
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

/** Danh sách role được phép — nếu user không thuộc, hiện màn hình từ chối */
function RoleGuard({ allowed, children }: { allowed: string[]; children: ReactNode }) {
  const { user } = useAuth() as { user: { role?: string } | null };
  const navigate  = useNavigate();
  const role = user?.role || "viewer";

  if (allowed.includes(role)) return <>{children}</>;

  const ROLE_LABEL: Record<string, string> = {
    admin: "Quản trị hệ thống", ehs: "EHS Officer", leader: "Lãnh đạo",
    safety_officer: "Cán bộ ATLĐ", dept: "Bộ phận", manager: "Quản lý",
    viewer: "Xem báo cáo", user: "Người dùng",
  };

  return (
    <div style={{
      minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: "40px 24px",
    }}>
      <div style={{
        maxWidth: 420, width: "100%", textAlign: "center",
        background: "#fff", border: "1.5px solid #fecaca",
        borderRadius: 16, padding: "40px 32px",
        boxShadow: "0 4px 24px rgba(220,38,38,0.08)",
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a", marginBottom: 8 }}>
          Không có quyền truy cập
        </div>
        <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, marginBottom: 8 }}>
          Trang này yêu cầu quyền:{" "}
          <strong style={{ color: "#1e40af" }}>
            {allowed.map(r => ROLE_LABEL[r] || r).join(", ")}
          </strong>
        </div>
        <div style={{
          display: "inline-block", fontSize: 11, fontWeight: 600,
          color: "#64748b", background: "#f1f5f9", border: "1px solid #e2e8f0",
          borderRadius: 20, padding: "3px 12px", marginBottom: 24,
        }}>
          Vai trò hiện tại: {ROLE_LABEL[role] || role}
        </div>
        <br />
        <button
          onClick={() => navigate("/safety-6s/actions")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            height: 38, padding: "0 20px", borderRadius: 10,
            background: "linear-gradient(135deg,#1565c0,#1e40af)",
            color: "#fff", fontSize: 13, fontWeight: 700,
            border: "none", cursor: "pointer",
          }}
        >
          ← Quay về CAPA
        </button>
      </div>
    </div>
  );
}

export function SafetyOperationsModule({ model, t, theme, setTheme }: ShellProps) {
  const loadingLabel = t("loading") || "Đang tải...";
  const location = useLocation();

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
        <div key={location.pathname}>
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
          <Route path="intel" element={
            <RoleGuard allowed={["admin","ehs","leader","safety_officer"]}>
              <SafetyIntelPage />
            </RoleGuard>
          } />
          <Route path="capa-approval" element={
            <RoleGuard allowed={["admin","ehs"]}>
              <SafetyCapaApprovalPage />
            </RoleGuard>
          } />
          <Route path="capa-report" element={
            <RoleGuard allowed={["admin","ehs","leader","safety_officer"]}>
              <SafetyCapaReportPage />
            </RoleGuard>
          } />
          <Route path="officers"  element={<SafetyOfficersPage />} />
          <Route path="calendar"  element={<SafetyCalendarPage />} />
          <Route path="*" element={<SafetyDashboardPage model={model} />} />
        </Routes>
        </div>
      </Suspense>
    </SafetyFrame>
  );
}

export default SafetyOperationsModule;
