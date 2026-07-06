import {
  ArrowRight,
  AlertTriangle,
  Bell,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  FileText,
  GraduationCap,
  Info,
  MonitorCog,
  Moon,
  Network,
  NotebookTabs,
  Router,
  ShieldAlert,
  ShieldCheck,
  Sun,
  TrendingUp,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { usePresence } from "./usePresence";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { loginStateForLocation, loginToForLocation } from "../auth/loginRedirect";
import { Button } from "../components/ui";
import type { HubLanguage, HubTranslate } from "../i18n-context";
import { getText, languages, type LocalizedTextValue } from "../i18n";
import type { HubModel, SafetyAction, SafetyBulletin, UtilityLink } from "../core/hubCore";
import {
  buildSidebarSections,
  filterVisibleSidebarSections,
  getActiveSidebarItem,
  getRouteTitle,
  type IconComponent
} from "./appShellNav";
import { AppSidebar } from "./AppSidebar";
import { AppTopNav } from "./AppTopNav";
import { NotificationToast, type ToastItem } from "./NotificationToast";


type ThemeMode = "light" | "dark";
type NotificationTone = "alert" | "watch" | "info" | "good";

type NotificationItem = {
  id: string;
  Icon: IconComponent;
  tone: NotificationTone;
  title: string;
  meta: string;
  detail: string;
  to: string;
  source?: "model" | "safety-db";
  originalId?: string;
};

type SafetyNotificationRecord = {
  id: string;
  type?: string;
  title?: string;
  titleI18n?: LocalizedTextValue;
  message?: string;
  messageI18n?: LocalizedTextValue;
  page?: string;
  entityType?: string;
  entityCode?: string;
  readByUserIds?: string;
  createdAt?: string | null;
};

type AppShellProps = {
  children: ReactNode;
  lang: HubLanguage;
  model: HubModel;
  setLang: (lang: HubLanguage) => void;
  setTheme: (theme: ThemeMode) => void;
  t: HubTranslate;
  theme: ThemeMode;
};

const systemGuideIconByType: Record<string, IconComponent> = {
  iot: Network,
  gateway: Router,
  notes: NotebookTabs,
  safety: ShieldCheck,
  internal: FileText
};

function formatSystemGuideTarget(url: string) {
  if (!url) return "";
  if (url.startsWith("/")) return url;

  try {
    const parsed = new URL(url);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return url;
  }
}

function buildSystemGuideCopy(t: HubTranslate) {
  return {
    overviewKicker: t("systemGuideOverviewKicker"),
    overviewTitle: "MHChub",
    overviewLead: t("systemGuideOverviewLead"),
    navigationTitle: t("systemGuideNavigationTitle"),
    definitionsTitle: t("systemGuideDefinitionsTitle"),
    faqTitle: t("systemGuideFaqTitle"),
    controlsTitle: t("systemGuideControlsTitle"),
    ownerLabel: t("systemGuideOwnerLabel"),
    updatedLabel: t("systemGuideUpdatedLabel"),
    definitions: [
      ["IoT Mani", t("systemGuideIotDefinition")],
      ["PLC Gateway Pro", t("systemGuideGatewayDefinition")],
      [t("safety"), t("systemGuideSafetyDefinition")]
    ],
    faqs: [
      [t("systemGuidePurposeQuestion"), t("systemGuidePurposeAnswer")],
      [t("systemGuideDocumentsQuestion"), t("systemGuideDocumentsAnswer")]
    ]
  };
}

function buildSystemGuideLinks(model: HubModel, lang: HubLanguage, t: HubTranslate, canManage: boolean) {
  const utilityLinks: UtilityLink[] = Array.isArray(model?.utilityLinks) ? model.utilityLinks : [];
  const configuredLinks = utilityLinks.map((item) => {
    const Icon = systemGuideIconByType[item.type] || Network;
    const title = item.id === "gateway" ? t("gatewayPro") : item.id === "notes" ? t("workLogShort") : getText(item.title, lang);
    return {
      id: item.id,
      Icon,
      title,
      target: formatSystemGuideTarget(item.url),
      url: item.url
    };
  });

  const seen = new Set(
    configuredLinks.flatMap((item) => [item.id, item.url, item.target].filter(Boolean).map((value) => String(value).toLowerCase()))
  );
  const extras = [
    { id: "safety-6s", Icon: ShieldCheck, title: t("safety"), target: "/safety-6s", url: "/safety-6s" },
    { id: "documents", Icon: FileText, title: t("documentLibrary"), target: "/documents", url: "/documents" },
    ...(canManage ? [{ id: "operations", Icon: MonitorCog, title: t("operations"), target: "/operations", url: "/operations" }] : [])
  ].filter((item) => {
    if (!item.url) return false;
    const keys = [item.id, item.url, item.target].filter(Boolean).map((value) => String(value).toLowerCase());
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });

  return [...configuredLinks, ...extras];
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function getInitials(value = "") {
  const parts = String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "AN";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function parseDateOnly(value: unknown) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value: unknown) {
  const target = parseDateOnly(value);
  if (!target) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((target.getTime() - today.getTime()) / DAY_IN_MS);
}

function formatShortDate(value: unknown) {
  const date = parseDateOnly(value);
  if (!date) return value || "";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function localizedText(value: LocalizedTextValue, lang: HubLanguage, fallback = "") {
  const text = getText(value, lang);
  if (Array.isArray(text)) return text.filter(Boolean).join(" ");
  return text || fallback;
}

function localeForLanguage(lang: HubLanguage) {
  if (lang === "ja") return "ja-JP";
  if (lang === "en") return "en-US";
  return "vi-VN";
}

function formatNotificationDate(value: unknown, lang: HubLanguage, t: HubTranslate) {
  const date = value ? new Date(String(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return t("notificationNewTitle");
  return `${t("updatedAt")} ${new Intl.DateTimeFormat(localeForLanguage(lang), {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit"
  }).format(date)}`;
}

function notificationRouteFor(item: SafetyNotificationRecord) {
  const page = String(item.page || "").trim();
  if (page.startsWith("/")) return page;

  const routeHint = `${page} ${item.entityType || ""} ${item.type || ""}`.toLowerCase();
  if (routeHint.includes("incident")) return "/safety-6s/incidents";
  if (routeHint.includes("training")) return "/safety-6s/training";
  if (routeHint.includes("report")) return "/safety-6s/reports";
  if (routeHint.includes("document")) return "/safety-6s/documents";
  if (routeHint.includes("kpi") || routeHint.includes("approval")) return "/safety-6s/approval";
  if (routeHint.includes("checklist")) return "/safety-6s/checklist";
  if (routeHint.includes("warning") || routeHint.includes("alert")) return "/safety-6s/warnings";
  return "/safety-6s";
}

function notificationToneFor(item: SafetyNotificationRecord): NotificationTone {
  const text = `${item.type || ""} ${item.title || ""} ${item.message || ""}`.toLowerCase();
  if (/(critical|urgent|warning|alert|danger|overdue|high|khẩn|nóng|cảnh báo)/i.test(text)) return "alert";
  if (/(approval|pending|review|deadline|watch|chờ|duyệt|hạn)/i.test(text)) return "watch";
  if (/(done|closed|approved|resolved|complete|hoàn tất|đã duyệt)/i.test(text)) return "good";
  return "info";
}

function notificationIconFor(item: SafetyNotificationRecord): IconComponent {
  const text = `${item.entityType || ""} ${item.type || ""}`.toLowerCase();
  if (text.includes("incident")) return ShieldAlert;
  if (text.includes("training")) return GraduationCap;
  if (text.includes("document") || text.includes("report")) return FileText;
  if (text.includes("kpi") || text.includes("approval")) return CheckCircle2;
  if (text.includes("warning") || text.includes("alert")) return AlertTriangle;
  return Bell;
}

function readUserIds(value: unknown) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeReadUserIds(value: unknown, userId: string) {
  const ids = new Set(readUserIds(value));
  if (userId) ids.add(userId);
  return [...ids].join(",");
}

function isSafetyNotificationRecord(value: unknown): value is SafetyNotificationRecord {
  return Boolean(value && typeof value === "object" && "id" in value);
}

function isNotificationRead(item: SafetyNotificationRecord, userId: string) {
  return Boolean(userId && readUserIds(item.readByUserIds).includes(userId));
}

async function markSafetyNotificationRead(id: string) {
  const response = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
    credentials: "same-origin",
    method: "POST"
  });
  if (!response.ok) throw new Error(`Failed to mark notification ${id} as read`);
}

function buildSafetyNotificationItems(
  notifications: SafetyNotificationRecord[],
  lang: HubLanguage,
  t: HubTranslate,
  userId: string
): NotificationItem[] {
  return notifications
    .filter((item) => !isNotificationRead(item, userId))
    .slice(0, 4)
    .map((item) => ({
      id: `safety-db-${item.id}`,
      Icon: notificationIconFor(item),
      tone: notificationToneFor(item),
      title: localizedText(item.titleI18n, lang, item.title || t("notificationNewTitle")),
      meta: formatNotificationDate(item.createdAt, lang, t),
      detail: localizedText(item.messageI18n, lang, item.message || item.entityCode || t("notificationCenter")),
      to: notificationRouteFor(item),
      source: "safety-db",
      originalId: item.id
    }));
}

function buildNotificationItems(model: HubModel, lang: HubLanguage, t: HubTranslate): NotificationItem[] {
  const actions: SafetyAction[] = Array.isArray(model?.safetyActions) ? model.safetyActions : [];
  const bulletins: SafetyBulletin[] = Array.isArray(model?.publishedBulletins)
    ? model.publishedBulletins
    : Array.isArray(model?.safetyBulletins)
      ? model.safetyBulletins.filter((item) => item.published !== false)
      : [];
  const highActions = actions.filter((action) => action.severity === "high");
  const datedActions = actions
    .map((action) => ({ ...action, daysLeft: daysUntil(action.due) }))
    .filter((action) => action.daysLeft !== null)
    .sort((left, right) => left.daysLeft - right.daysLeft);
  const overdueAction = datedActions.find((action) => action.daysLeft < 0);
  const dueSoonAction = datedActions.find((action) => action.daysLeft >= 0 && action.daysLeft <= 7) || datedActions[0];
  const latestBulletin = [...bulletins].sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")))[0];
  const openActionCount = Number(model?.departmentActionCount || model?.actionCount || actions.length || 0);
  const averageScore = Number(model?.averageScore || 0);
  const items: NotificationItem[] = [];

  if (highActions.length) {
    const action = highActions[0];
    items.push({
      id: "level",
      Icon: AlertTriangle,
      tone: "alert",
      title: t("notificationLevelTitle"),
      meta: `${highActions.length} ${t("notificationHighItems")}`,
      detail: localizedText(action.title, lang),
      to: "/safety-6s"
    });
  }

  if (overdueAction || dueSoonAction) {
    const action = overdueAction || dueSoonAction;
    const state = action.daysLeft < 0
      ? t("notificationOverdue")
      : action.daysLeft === 0
        ? t("today")
        : `${t("notificationDueIn")} ${action.daysLeft} ${t("days")}`;
    items.push({
      id: "deadline",
      Icon: CalendarClock,
      tone: action.daysLeft < 0 ? "alert" : "watch",
      title: t("notificationDeadlineTitle"),
      meta: `${state} - ${formatShortDate(action.due)}`,
      detail: localizedText(action.title, lang),
      to: "/safety-6s"
    });
  }

  if (latestBulletin) {
    items.push({
      id: "new",
      Icon: Bell,
      tone: latestBulletin.tone === "alert" ? "alert" : "info",
      title: t("notificationNewTitle"),
      meta: `${t("updatedAt")} ${formatShortDate(latestBulletin.date)}`,
      detail: localizedText(latestBulletin.title, lang),
      to: "/safety-6s"
    });
  }

  if (averageScore || openActionCount) {
    items.push({
      id: "progress",
      Icon: TrendingUp,
      tone: openActionCount ? "watch" : "good",
      title: t("notificationProgressTitle"),
      meta: `${t("homeSafetyScore")} ${averageScore || 0}%`,
      detail: openActionCount ? `${openActionCount} ${t("openActions")}` : t("allChangesSaved"),
      to: "/safety-6s"
    });
  }

  return items.slice(0, 4);
}

const PAGE_CHUNK_PRELOADERS = [
  () => import("../pages/HomePage"),
  () => import("../pages/DocumentsPage"),
  () => import("../pages/DocumentPreviewPage"),
  () => import("../pages/LoginPage"),
  () => import("../pages/OperationsPage"),
  () => import("../pages/AdminPage"),
  () => import("../pages/DepartmentPage"),
  () => import("../pages/safety/SafetyOperationsModule"),
];

function schedulePageChunkPreload() {
  const run = (index: number) => {
    if (index >= PAGE_CHUNK_PRELOADERS.length) return;
    PAGE_CHUNK_PRELOADERS[index]().catch(() => {}).finally(() => {
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(() => run(index + 1), { timeout: 5000 });
      } else {
        setTimeout(() => run(index + 1), 800);
      }
    });
  };
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(() => run(0), { timeout: 8000 });
  } else {
    setTimeout(() => run(0), 3000);
  }
}

export function AppShell({ children, lang, setLang, theme, setTheme, t, model }: AppShellProps) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const canManage = ["admin", "ehs", "leader"].includes(user?.role);
  const isEhsAdmin = ["admin", "ehs"].includes(user?.role);
  // Sidebar always starts closed; opens only via manual toggle (hamburger button).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [safetyNotifications, setSafetyNotifications] = useState<SafetyNotificationRecord[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [displayNameOverride, setDisplayNameOverride] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [pendingCapaCount, setPendingCapaCount] = useState<number>(0);
  usePresence(user, setOnlineCount);
  const hotActionCount = Array.isArray(model?.safetyActions)
    ? model.safetyActions.filter((action) => action.severity === "high").length
    : 0;
  const openWorkCount = model?.departmentActionCount || model?.actionCount || 0;
  const normalizedPathname = location.pathname.replace(/\/+$/, "") || "/";
  const homeShellMode = normalizedPathname === "/";
  const safetyRouteMode = normalizedPathname === "/safety-6s" || normalizedPathname.startsWith("/safety-6s/");
  const safetyFocusMode = normalizedPathname === "/safety-6s";
  const safetySubpageMode = safetyRouteMode && normalizedPathname !== "/safety-6s";
  const sidebarSections = buildSidebarSections({ canManage, hotActionCount, isEhsAdmin, model, openWorkCount, pendingCapaCount, soonDueCount: 0, t });
  const visibleSidebarSections = filterVisibleSidebarSections(sidebarSections, safetyRouteMode);
  const activeItem = getActiveSidebarItem(sidebarSections, location.pathname);
  const routeTitleForPath = getRouteTitle({ lang, model, normalizedPathname, t });
  const activePageLabel = routeTitleForPath || activeItem?.label || t("home");
  const topnavTitleVisible = Boolean(activePageLabel);
  const hideTopbarActions = false;
  const currentLanguage = languages.find((item) => item.id === lang) || languages[0];
  const nextTheme = theme === "dark" ? "light" : "dark";
  const ThemeIcon = theme === "dark" ? Moon : Sun;
  const guideCopy = buildSystemGuideCopy(t);
  const guideLinks = buildSystemGuideLinks(model, lang, t, canManage);
  const userName = displayNameOverride || user?.displayName || user?.username || t("login");
  const userRole = user?.role ? t(`role${user.role[0].toUpperCase()}${user.role.slice(1)}`) : t("sidebarGuestRole");
  const safetyNotificationActorId = String(user?.id || user?.username || "");
  const safetyDbNotificationItems = buildSafetyNotificationItems(safetyNotifications, lang, t, safetyNotificationActorId);
  const modelNotificationItems = buildNotificationItems(model, lang, t);
  const notificationItems = [...safetyDbNotificationItems, ...modelNotificationItems].slice(0, 6);
  const notificationCount = safetyDbNotificationItems.length + modelNotificationItems.length;
  const notificationBadgeLabel = notificationCount > 99 ? "99+" : String(notificationCount);
  const urgentNotificationCount = notificationItems.filter((item) => item.tone === "alert").length;
  const loginTo = loginToForLocation(location);
  const loginState = loginStateForLocation(location);

  useEffect(() => {
    if (!user) {
      setSafetyNotifications([]);
      return undefined;
    }

    const controller = new AbortController();

    const loadNotifications = () => {
      fetch("/api/notifications", {
        credentials: "same-origin",
        signal: controller.signal
      })
        .then(async (response): Promise<unknown> => (response.ok ? response.json() : []))
        .then((payload: unknown) => {
          if (controller.signal.aborted) return;
          const items = Array.isArray(payload)
            ? payload
            : Array.isArray((payload as { items?: unknown })?.items)
              ? (payload as { items: unknown[] }).items
              : [];
          setSafetyNotifications(items.filter(isSafetyNotificationRecord));
        })
        .catch((error: unknown) => {
          if ((error as { name?: string })?.name !== "AbortError") setSafetyNotifications([]);
        });
    };

    loadNotifications();

    const es = new EventSource("/api/notifications/stream", { withCredentials: true });
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type?: string; action?: string; code?: string };
        if (data.type !== "connected") {
          loadNotifications();
          if (data.type === "capa") {
            fetch("/api/actions/pending-count", { credentials: "same-origin" })
              .then((r) => r.ok ? r.json() : null)
              .then((d) => { if (d && typeof d.count === "number") setPendingCapaCount(d.count); })
              .catch(() => {});
          }
          if (
            data.action === "created" ||
            data.action === "approved" ||
            data.action === "rejected" ||
            data.action === "uploaded"
          ) {
            const toast: ToastItem = {
              id: `toast-${Date.now()}-${Math.random()}`,
              type: data.type || "info",
              action: data.action,
              code: data.code
            };
            setToasts((prev) => [toast, ...prev].slice(0, 4));
          }
        }
      } catch {
      }
    };
    es.onerror = () => {
    };

    return () => {
      controller.abort();
      es.close();
    };
  }, [user?.departmentId, user?.id, user?.role, user?.username]);

  useEffect(() => {
    if (!isEhsAdmin || !user) {
      setPendingCapaCount(0);
      return;
    }
    fetch("/api/actions/pending-count", { credentials: "same-origin" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d && typeof d.count === "number") setPendingCapaCount(d.count); })
      .catch(() => {});
  }, [isEhsAdmin, user?.id, user?.role]);

  useEffect(() => {
    // Preload all page chunks in idle time to avoid lazy-load lag on navigation
    schedulePageChunkPreload();
  }, []);

  useEffect(() => {
    const fetchLogo = () => {
      fetch("/api/app-settings")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          setLogoUrl(data?.logoUrl ? `/api/app-settings/logo?v=${Date.now()}` : null);
        })
        .catch(() => {});
    };
    fetchLogo();
    window.addEventListener("logo-updated", fetchLogo);
    return () => window.removeEventListener("logo-updated", fetchLogo);
  }, []);


  useEffect(() => {
    setLanguageOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  // Apply will-change ONLY during the open/close transition, then remove it
  // so the sidebar is NOT kept on a permanent GPU layer (which blurs text).
  useEffect(() => {
    const shell = document.querySelector('.app-shell') as HTMLElement | null;
    const rail = document.querySelector('.side-rail') as HTMLElement | null;
    if (!shell || !rail) return undefined;
    shell.classList.add('sidebar-transitioning');
    const handler = (e: TransitionEvent) => {
      if (e.target === rail) shell.classList.remove('sidebar-transitioning');
    };
    rail.addEventListener('transitionend', handler);
    return () => {
      rail.removeEventListener('transitionend', handler);
      shell.classList.remove('sidebar-transitioning');
    };
  }, [sidebarOpen]);
  useEffect(() => {
    if (!sidebarOpen) return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverscroll = body.style.overscrollBehavior;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";

    const sidebar = document.querySelector(".side-rail") as HTMLElement | null;
    const lockBackgroundScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && sidebar?.contains(target)) return;
      event.preventDefault();
    };

    document.addEventListener("wheel", lockBackgroundScroll, { capture: true, passive: false });
    document.addEventListener("touchmove", lockBackgroundScroll, { capture: true, passive: false });

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overscrollBehavior = prevBodyOverscroll;
      document.removeEventListener("wheel", lockBackgroundScroll, true);
      document.removeEventListener("touchmove", lockBackgroundScroll, true);
    };
  }, [sidebarOpen]);


  const handleToastDismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleNotificationClick = (item: NotificationItem) => {
    setNotificationsOpen(false);
    if (item.source !== "safety-db" || !item.originalId) return;

    setSafetyNotifications((current) =>
      current.map((record) =>
        record.id === item.originalId
          ? { ...record, readByUserIds: mergeReadUserIds(record.readByUserIds, safetyNotificationActorId) }
          : record
      )
    );
    markSafetyNotificationRead(item.originalId).catch(() => {});
  };

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : ""} ${homeShellMode ? "home-shell" : ""} ${safetyFocusMode ? "safety-focus-shell" : ""} ${safetySubpageMode ? "safety-subpage-shell" : ""} ${topnavTitleVisible ? "topnav-title-visible" : ""}`}>
      <button
        aria-label={t("closeMenu")}
        className="sidebar-backdrop"
        onClick={() => requestAnimationFrame(() => setSidebarOpen(false))}
        type="button"
      />
      <AppSidebar
        loginState={loginState}
        loginTo={loginTo}
        logout={logout}
        onClose={() => requestAnimationFrame(() => setSidebarOpen(false))}
        onNavigate={() => {
          // Sidebar is always a manual drawer: close it on navigate regardless of viewport width.
          requestAnimationFrame(() => setSidebarOpen(false));
        }}
        t={t}
        user={user}
        userInitials={getInitials(userName)}
        userName={userName}
        userRole={userRole}
        visibleSidebarSections={visibleSidebarSections}
      />

      <div className="workspace">
        <AppTopNav
          activePageLabel={activePageLabel}
          hideTopbarActions={hideTopbarActions}
          lang={lang}
          languageOpen={languageOpen}
          loginState={loginState}
          loginTo={loginTo}
          logoUrl={logoUrl}
          logout={logout}
          notificationBadgeLabel={notificationBadgeLabel}
          notificationCount={notificationCount}
          notificationItems={notificationItems}
          notificationsOpen={notificationsOpen}
          onDisplayNameChange={setDisplayNameOverride}
          onNotificationClick={handleNotificationClick}
          onOpenHelp={() => {
            setHelpOpen(true);
            setNotificationsOpen(false);
          }}
          setLang={setLang}
          setLanguageOpen={setLanguageOpen}
          setNotificationsOpen={setNotificationsOpen}
          setSidebarOpen={setSidebarOpen}
          setTheme={setTheme}
          sidebarOpen={sidebarOpen}
          t={t}
          theme={theme}
          urgentNotificationCount={urgentNotificationCount}
          onlineCount={onlineCount}
          user={user}
          userName={userName}
        />
        {helpOpen ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setHelpOpen(false)}>
            <section
              aria-modal="true"
              className="help-modal"
              onMouseDown={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="help-modal-header">
                <div>
                  <h2>{t("helpNotes")}</h2>
                  <p>{t("helpSubtitle")}</p>
                </div>
                <Button aria-label={t("close")} className="icon-button" iconOnly onClick={() => setHelpOpen(false)} variant="secondary">
                  <X size={18} />
                </Button>
              </div>
              <div className="help-modal-body">
                <section className="help-system-overview" aria-labelledby="help-system-overview-title">
                  <span>{guideCopy.overviewKicker}</span>
                  <h3 id="help-system-overview-title">{guideCopy.overviewTitle}</h3>
                  <p>{guideCopy.overviewLead}</p>
                  <div className="help-system-meta">
                    <strong>{guideCopy.ownerLabel}: {t("siteCreditName")}</strong>
                    <time dateTime="2026-06-01">{guideCopy.updatedLabel}: 2026-06-01</time>
                  </div>
                </section>

                <div className="help-system-grid">
                  <section className="help-guide-panel" aria-labelledby="help-navigation-title">
                    <h3 id="help-navigation-title">
                      <BookOpen size={16} />
                      {guideCopy.navigationTitle}
                    </h3>
                    <div className="help-nav-list">
                      {guideLinks.map((item) => {
                        const Icon = item.Icon;
                        const body = (
                          <>
                            <Icon size={17} />
                            <span>{item.title}</span>
                            <strong>{item.target}</strong>
                            <ArrowRight size={15} />
                          </>
                        );

                        return item.url.startsWith("/") ? (
                          <Link className="help-nav-link" key={item.id} onClick={() => setHelpOpen(false)} to={item.url}>
                            {body}
                          </Link>
                        ) : (
                          <a className="help-nav-link" href={item.url} key={item.id} rel="noreferrer" target="_blank">
                            {body}
                          </a>
                        );
                      })}
                    </div>
                  </section>

                  <section className="help-guide-panel" aria-labelledby="help-definitions-title">
                    <h3 id="help-definitions-title">
                      <Info size={16} />
                      {guideCopy.definitionsTitle}
                    </h3>
                    <dl className="help-definition-list">
                      {guideCopy.definitions.map(([term, description]) => (
                        <div key={term}>
                          <dt>{term}</dt>
                          <dd>{description}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>

                  <section className="help-guide-panel" aria-labelledby="help-faq-title">
                    <h3 id="help-faq-title">
                      <ShieldCheck size={16} />
                      {guideCopy.faqTitle}
                    </h3>
                    <div className="help-faq-list">
                      {guideCopy.faqs.map(([question, answer]) => (
                        <details key={question}>
                          <summary>{question}</summary>
                          <p>{answer}</p>
                        </details>
                      ))}
                    </div>
                  </section>
                </div>

                <section className="help-controls-panel" aria-labelledby="help-controls-title">
                  <h3 id="help-controls-title">{guideCopy.controlsTitle}</h3>
                  <div className="help-list">
                    <div>
                      <CheckCircle2 size={18} style={{ color: "#31d4a1" }} />
                      <strong>{t("online")}</strong>
                      <p>{t("helpOnline")}</p>
                    </div>
                    <div>
                      <Info size={18} />
                      <strong>{t("helpInfoTitle")}</strong>
                      <p>{t("helpInfo")}</p>
                    </div>
                    <div>
                      <ThemeIcon size={18} />
                      <strong>{t("themeMode")}</strong>
                      <p>{t("helpTheme")}</p>
                    </div>
                    <div>
                      <strong className="help-lang">{currentLanguage.label}</strong>
                      <strong>{t("language")}</strong>
                      <p>{t("helpLanguage")}</p>
                    </div>
                  </div>
                </section>
              </div>
            </section>
          </div>
        ) : null}
        <NotificationToast toasts={toasts} onDismiss={handleToastDismiss} />
        <main>{children}</main>
        <footer className="site-credit" aria-label={`${t("siteCreditLabel")} ${t("siteCreditName")}`}>
          <span>{`${t("siteCreditLabel")} `}</span>
          <strong>{t("siteCreditName")}</strong>
        </footer>
      </div>
    </div>
  );
}
