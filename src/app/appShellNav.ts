import {
  AlertCircle,
  BookOpen,
  BriefcaseMedical,
  CalendarCheck2,
  CheckCircle2,
  CheckSquare,
  ClipboardList,
  FileBarChart,
  FileText,
  Flame,
  Folder,
  GraduationCap,
  HardHat,
  LayoutDashboard,
  ListChecks,
  MapPin,
  MonitorCog,
  Settings,
  ShieldAlert,
  Target,
  Users,
  Workflow
} from "lucide-react";
import type { ComponentType } from "react";
import type { HubModel } from "../core/hubCore";
import { getText } from "../i18n";
import type { HubLanguage, HubTranslate } from "../i18n-context";

export type IconComponent = ComponentType<{ size?: number | string; className?: string }>;

export type SidebarNavItem = {
  badge?: number | string | null;
  badgeTone?: string;
  end?: boolean;
  hideInSafetyFocus?: boolean;
  hideInSafetySidebar?: boolean;
  icon: IconComponent;
  label: string;
  to: string;
};

export type SidebarSection = {
  id: string;
  items: SidebarNavItem[];
  label: string;
};

type BuildSidebarSectionsOptions = {
  canManage: boolean;
  hotActionCount: number;
  model: HubModel;
  openWorkCount: number;
  t: HubTranslate;
};

export function buildSidebarSections({
  canManage,
  hotActionCount,
  model,
  openWorkCount,
  t
}: BuildSidebarSectionsOptions): SidebarSection[] {
  const copy = {
    overviewGroup: t("safetySidebarOverviewGroup"),
    workGroup: t("safetySidebarWorkGroup"),
    kpiGroup: t("safetySidebarKpiGroup"),
    recordsGroup: t("safetySidebarRecordsGroup"),
    manageGroup: t("safetySidebarManageGroup"),
    safetyOverview: t("safetySidebarOverview"),
    hotWarnings: t("safetySidebarHotWarnings"),
    incidents: t("safetySidebarIncidents"),
    checklist: t("safetySidebarChecklist"),
    audits: t("safetySidebarAudits"),
    actions: t("safetySidebarActions"),
    locations: t("safetySidebarLocations"),
    kyt: t("safetySidebarKyt"),
    pccc: t("safetySidebarPccc"),
    medical: t("safetySidebarMedical"),
    selfInspection: t("safetySidebarSelfInspection"),
    inspectionPlans: t("safetySidebarInspectionPlans"),
    safetyMeetings: t("safetySidebarSafetyMeetings"),
    kpi: t("safetySidebarKpi"),
    dataEntry: t("safetySidebarDataEntry"),
    approval: t("safetySidebarApproval"),
    safetyDocs: t("safetySidebarDocs"),
    reports: t("safetySidebarReports"),
    deptReport: t("safetySidebarDeptReport"),
    training: t("safetySidebarTraining"),
    settings: t("safetySidebarSettings"),
    sharedDocs: t("safetySidebarSharedDocs"),
    reference: t("safetySidebarReference")
  };

  return [
    {
      id: "overview",
      label: copy.overviewGroup || t("sidebarMainGroup"),
      items: [
        { to: "/", icon: LayoutDashboard, label: t("home"), end: true },
        {
          to: "/safety-6s",
          icon: HardHat,
          label: copy.safetyOverview || t("safety"),
          end: true,
          badge: hotActionCount || model?.watchCount || null,
          badgeTone: "alert"
        }
      ]
    },
    {
      id: "work",
      label: copy.workGroup || t("safety"),
      items: [
        {
          to: "/safety-6s/warnings",
          icon: AlertCircle,
          label: copy.hotWarnings,
          badge: hotActionCount || model?.watchCount || null,
          badgeTone: "alert"
        },
        { to: "/safety-6s/incidents", icon: ShieldAlert, label: copy.incidents },
        { to: "/safety-6s/checklist", icon: CheckSquare, label: copy.checklist, badge: model?.checklistOpenCount || null, badgeTone: "watch" },
        { to: "/safety-6s/audits", icon: ClipboardList, label: copy.audits },
        { to: "/safety-6s/inspection-plans", icon: CalendarCheck2, label: copy.inspectionPlans || "Kế hoạch kiểm tra 6S" },
        { to: "/safety-6s/safety-meetings", icon: Users, label: copy.safetyMeetings || "Họp an toàn" },
        { to: "/safety-6s/actions", icon: Workflow, label: copy.actions || "CAPA", badge: openWorkCount || null, badgeTone: "watch" },
        { to: "/safety-6s/locations", icon: MapPin, label: copy.locations, hideInSafetySidebar: true },
        { to: "/safety-6s/kyt", icon: Target, label: copy.kyt, hideInSafetySidebar: true },
        { to: "/safety-6s/pccc", icon: Flame, label: copy.pccc, hideInSafetySidebar: true },
        { to: "/safety-6s/medical", icon: BriefcaseMedical, label: copy.medical, hideInSafetySidebar: true },
        { to: "/safety-6s/self-inspection", icon: ListChecks, label: copy.selfInspection, hideInSafetySidebar: true }
      ]
    },
    {
      id: "kpi",
      label: copy.kpiGroup,
      items: [
        { to: "/safety-6s/kpi", icon: Target, label: copy.kpi },
        { to: "/safety-6s/data-entry", icon: ClipboardList, label: copy.dataEntry },
        { to: "/safety-6s/approval", icon: CheckCircle2, label: copy.approval, badge: model?.pendingKpiCount || null, badgeTone: "watch" }
      ]
    },
    {
      id: "records",
      label: copy.recordsGroup,
      items: [
        { to: "/documents", icon: FileText, label: copy.sharedDocs || t("documents"), hideInSafetySidebar: true },
        { to: "/safety-6s/documents", icon: Folder, label: copy.safetyDocs },
        { to: "/safety-6s/reports", icon: FileBarChart, label: copy.reports },
        { to: "/safety-6s/dept-report", icon: FileBarChart, label: copy.deptReport || "Báo cáo bộ phận" },
        { to: "/safety-6s/training", icon: GraduationCap, label: copy.training }
      ]
    },
    {
      id: "manage",
      label: copy.manageGroup || t("admin"),
      items: [
        { to: "/safety-6s/settings", icon: Settings, label: copy.settings },
        { to: "/safety-6s/reference", icon: BookOpen, label: copy.reference },
        ...(canManage
          ? [
              { to: "/operations", icon: MonitorCog, label: t("operations"), badge: openWorkCount || null, badgeTone: "watch", hideInSafetyFocus: true },
              { to: "/admin", icon: Settings, label: t("admin"), hideInSafetyFocus: true }
            ]
          : [])
      ]
    }
  ];
}

export function filterVisibleSidebarSections(sidebarSections: SidebarSection[], safetyRouteMode: boolean): SidebarSection[] {
  return sidebarSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !(safetyRouteMode && (item.hideInSafetyFocus || item.hideInSafetySidebar)))
    }))
    .filter((section) => section.items.length);
}

export function getActiveSidebarItem(sidebarSections: SidebarSection[], pathname: string): SidebarNavItem | undefined {
  return [...sidebarSections.flatMap((section) => section.items)]
    .reverse()
    .find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)));
}

export function getRouteTitle(options: {
  lang: HubLanguage;
  model: HubModel;
  normalizedPathname: string;
  t: HubTranslate;
}) {
  const { lang, model, normalizedPathname, t } = options;
  const routeTitleOverrides: Partial<Record<string, string>> = {
    "/safety-6s/warnings": t("safetyRouteWarnings"),
    "/safety-6s/incidents": t("safetyRouteIncidents"),
    "/safety-6s/checklist": t("safetyRouteChecklist"),
    "/safety-6s/audits": t("safetyRouteAudits"),
    "/safety-6s/actions": t("safetyRouteActions"),
    "/safety-6s/locations": t("safetyRouteLocations"),
    "/safety-6s/kyt": t("safetyRouteKyt"),
    "/safety-6s/pccc": t("safetyRoutePccc"),
    "/safety-6s/medical": t("safetyRouteMedical"),
    "/safety-6s/self-inspection": t("safetyRouteSelfInspection"),
    "/safety-6s/kpi": t("safetyRouteKpi"),
    "/safety-6s/data-entry": t("safetyRouteDataEntry"),
    "/safety-6s/approval": t("safetyRouteApproval"),
    "/safety-6s/documents": t("safetyRouteDocuments"),
    "/safety-6s/reports": t("safetyRouteReports"),
    "/safety-6s/training": t("safetyRouteTraining"),
    "/safety-6s/settings": t("safetyRouteSettings"),
    "/safety-6s/reference": t("safetyRouteReference"),
    "/safety-6s/inspection-plans": t("safetyRouteInspectionPlans") || "Kế hoạch kiểm tra 6S",
    "/safety-6s/safety-meetings": t("safetyRouteSafetyMeetings") || "Họp an toàn",
    "/safety-6s/dept-report": t("safetyRouteDeptReport") || "Báo cáo bộ phận"
  };

  const departmentRouteMatch = normalizedPathname.match(/^\/safety-6s\/departments\/([^/]+)$/);
  const departmentRouteId = departmentRouteMatch ? decodeURIComponent(departmentRouteMatch[1]) : null;
  const departmentRouteTitle = departmentRouteId
    ? getText(model?.departments?.find((item) => item.id === departmentRouteId)?.name, lang) || t("department")
    : null;
  const staticRouteTitleForPath = {
    "/": t("home"),
    "/documents": t("sharedDocumentLibrary"),
    "/operations": t("operationsTitle"),
    "/login": t("loginTitle"),
    "/admin": t("adminTitle"),
    "/safety-6s": t("safety")
  }[normalizedPathname];
  const documentPreviewRouteTitle = /^\/documents\/[^/]+\/preview$/.test(normalizedPathname) ? t("previewDocument") : null;

  return departmentRouteTitle || documentPreviewRouteTitle || staticRouteTitleForPath || routeTitleOverrides[normalizedPathname];
}
