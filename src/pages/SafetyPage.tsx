import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Flame,
  FolderOpen,
  Gauge,
  HardHat,
  LineChart,
  Megaphone,
  PieChart,
  ShieldCheck,
  TrendingUp,
  Trophy,
  Upload,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { FeedDetailModal } from "../components/FeedDetailModal";
import type { FeedDetail } from "../components/FeedDetailModal";
import { SafetyBulletinModal } from "../components/SafetyBulletinModal";
import { ActionItem, BulletinItem, Button, DocumentMini, MetricCard, StatusPill } from "../components/ui";
import type { HubDepartment, HubModel, SafetyAction, SafetyBulletin } from "../core/hubCore";
import type { HubLanguage, HubTranslate } from "../i18n-context";
import { api } from "../services/api";
import type { DocumentRecord } from "../services/api";
import { getText } from "../i18n";
import { getDocumentDisplayTitle } from "../utils/documentDisplay";
import "./SafetyPage.css";

type CustomCssVars = CSSProperties & Record<`--${string}`, string | number>;
type SafetyFeedKey = "hotAlerts" | "latestNotices" | "newIssued" | "newUpdates";
type SafetyBoardFeedKey = "all" | SafetyFeedKey;
type SafetyDashboardModel = HubModel & {
  daysWithoutAccident?: number | string;
  safeDays?: number | string;
};
type SafetyPageProps = {
  lang: HubLanguage;
  model: SafetyDashboardModel;
  t: HubTranslate;
};
type ToneName = string;
type IconSummaryItemProps = {
  icon: LucideIcon;
  label: ReactNode;
  tone?: ToneName;
  value: ReactNode;
};
type DepartmentAwareProps = {
  departments: HubDepartment[];
  lang: HubLanguage;
};
type SafetyDashboardLabelSet = {
  actionRequired: string;
  department: string;
  departmentScore: string;
  important: string;
  latestActivity: string;
  notice: string;
  overdue: string;
  score: string;
  status: string;
};
type SafetyIndexLabelSet = {
  alertOpen: string;
  checklistOpen: string;
  currentMonthIncidents: string;
  documents: string;
  good: string;
  greetingAfternoon: string;
  greetingEvening: string;
  greetingMorning: string;
  guest: string;
  incidentMeta: string;
  live: string;
  needsImprovement: string;
  noAccidentDays: string;
  openAlertMeta: string;
  overallScore: string;
  priority: string;
  safeDayRecord: string;
  sixSProgress: string;
  target: string;
  updatePrefix: string;
  viewAlerts: string;
};
type SafetyGreetingKey = "greetingAfternoon" | "greetingEvening" | "greetingMorning";
type SafetyFeedTab = {
  count: number;
  key: SafetyBoardFeedKey;
  label: string;
  tone: ToneName;
};
type SafetyBoardEntry =
  | {
      feedKey: "latestNotices";
      id: string;
      item: SafetyBulletin;
      kind: "bulletin";
      label: string;
      tone: ToneName;
    }
  | {
      feedKey: "hotAlerts" | "newUpdates";
      id: string;
      item: SafetyAction;
      kind: "action";
      label: string;
      tone: ToneName;
    }
  | {
      feedKey: "newIssued";
      id: string;
      item: DocumentRecord;
      kind: "document";
      label: string;
      tone: ToneName;
    };
type RecentActivityItem = {
  id: string;
  meta: ReactNode;
  title: ReactNode;
  tone: ToneName;
};

function DepartmentCard({ department, lang, t }: { department: HubDepartment; lang: HubLanguage; t: HubTranslate }) {
  const score = Math.max(0, Math.min(100, Number(department.score) || 0));
  const scoreBucket = Math.round(score / 5) * 5;

  return (
    <Link className="department-card" to={`/safety-6s/departments/${department.id}`}>
      <div className="department-card-top">
        <h3>{getText(department.name, lang)}</h3>
        <StatusPill status={department.riskLevel} t={t} />
      </div>
      <div className={`score-bar score-${scoreBucket}`}>
        <span />
      </div>
      <div className="department-stats">
        <span>
          {t("auditScore")}
          <strong>{department.score}%</strong>
        </span>
        <span>
          {t("openActions")}
          <strong>{department.openActions}</strong>
        </span>
      </div>
      <div className="card-link">
        {t("departmentView")}
        <ChevronRight size={16} />
      </div>
    </Link>
  );
}

function DepartmentQuickRail({ departments, lang, t }: DepartmentAwareProps & { t: HubTranslate }) {
  return (
    <section className="safety-department-rail" aria-label={t("departmentCommand")}>
      {departments.map((department) => (
        <Link
          className={`safety-dept-chip ${department.riskLevel}`}
          key={department.id}
          to={`/safety-6s/departments/${department.id}`}
        >
          <Building2 size={16} />
          <span>
            <strong>{getText(department.name, lang)}</strong>
            <small>
              {department.score}% - {department.openActions} {t("openActions")}
            </small>
          </span>
          <ChevronRight size={15} />
        </Link>
      ))}
    </section>
  );
}

function SafetyFeedCard({
  action = null,
  icon: Icon,
  title,
  tone = "good",
  children
}: {
  action?: ReactNode;
  children?: ReactNode;
  icon: LucideIcon;
  title: ReactNode;
  tone?: ToneName;
}) {
  return (
    <section className={`directive-card safety-feed-card ${tone}`}>
      <div className="directive-card-header">
        <span>
          <Icon size={18} />
        </span>
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function HeroSummaryItem({ icon: Icon, label, value, tone = "good" }: IconSummaryItemProps) {
  return (
    <div className={`safety-hero-summary-item ${tone}`}>
      <Icon size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StandardsPanel({ t }: { t: HubTranslate }) {
  const standards = [
    { icon: ShieldCheck, label: t("policy"), value: "12" },
    { icon: BookOpen, label: t("training"), value: "28" },
    { icon: ClipboardCheck, label: t("inspection"), value: "16" },
    { icon: AlertTriangle, label: t("emergency"), value: "04" }
  ];

  return (
    <div className="standards-panel">
      {standards.map((item) => (
        <div className="standard-row" key={item.label}>
          <item.icon size={20} />
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

const safetyBoardIcons: Record<SafetyBoardFeedKey, LucideIcon> = {
  all: ClipboardCheck,
  latestNotices: Megaphone,
  hotAlerts: AlertTriangle,
  newUpdates: ClipboardCheck,
  newIssued: FileText
};

const safetyDashboardLabels: Record<HubLanguage, SafetyDashboardLabelSet> = {
  vi: {
    actionRequired: "Cáº§n xá»­ lÃ½",
    departmentScore: "Äiá»ƒm 6S theo bá»™ pháº­n",
    department: "Bá»™ pháº­n",
    important: "Quan trá»ng",
    latestActivity: "Hoáº¡t Ä‘á»™ng gáº§n Ä‘Ã¢y",
    notice: "ThÃ´ng bÃ¡o",
    overdue: "QuÃ¡ háº¡n",
    score: "Äiá»ƒm",
    status: "Tráº¡ng thÃ¡i"
  },
  en: {
    actionRequired: "Action required",
    departmentScore: "6S score by department",
    department: "Department",
    important: "Important",
    latestActivity: "Recent activity",
    notice: "Notice",
    overdue: "Overdue",
    score: "Score",
    status: "Status"
  },
  ja: {
    actionRequired: "å¯¾å¿œå¿…è¦",
    departmentScore: "éƒ¨é–€åˆ¥6Sã‚¹ã‚³ã‚¢",
    department: "éƒ¨é–€",
    important: "é‡è¦",
    latestActivity: "æœ€è¿‘ã®æ´»å‹•",
    notice: "é€šçŸ¥",
    overdue: "æœŸé™è¶…éŽ",
    score: "ç‚¹æ•°",
    status: "çŠ¶æ…‹"
  }
};

const getDashboardLabels = (lang: HubLanguage): SafetyDashboardLabelSet => safetyDashboardLabels[lang] || safetyDashboardLabels.vi;

const safetyIndexLabels: Record<HubLanguage, SafetyIndexLabelSet> = {
  vi: {
    alertOpen: "Cáº£nh bÃ¡o Ä‘ang má»Ÿ",
    checklistOpen: "checklist chÆ°a hoÃ n thÃ nh",
    currentMonthIncidents: "Sá»± cá»‘ thÃ¡ng 6",
    documents: "TÃ i liá»‡u",
    good: "Tá»‘t",
    greetingAfternoon: "ChÃ o buá»•i chiá»u",
    greetingEvening: "ChÃ o buá»•i tá»‘i",
    greetingMorning: "ChÃ o buá»•i sÃ¡ng",
    guest: "KhÃ¡ch truy cáº­p",
    incidentMeta: "ÄÃ£ kháº¯c phá»¥c",
    live: "Live",
    needsImprovement: "Cáº§n cáº£i thiá»‡n",
    noAccidentDays: "NgÃ y khÃ´ng tai náº¡n",
    openAlertMeta: "quÃ¡ háº¡n",
    overallScore: "Äiá»ƒm an toÃ n tá»•ng thá»ƒ",
    priority: "Yáº¿u - Æ¯u tiÃªn",
    safeDayRecord: "Ká»· lá»¥c: 210 ngÃ y",
    sixSProgress: "Tiáº¿n Ä‘á»™ 6S - ThÃ¡ng 6/2026",
    target: "Má»¥c tiÃªu: 95%",
    updatePrefix: "Cáº­p nháº­t",
    viewAlerts: "Xem cáº£nh bÃ¡o"
  },
  en: {
    alertOpen: "Open alerts",
    checklistOpen: "checklists unfinished",
    currentMonthIncidents: "June incidents",
    documents: "Documents",
    good: "Good",
    greetingAfternoon: "Good afternoon",
    greetingEvening: "Good evening",
    greetingMorning: "Good morning",
    guest: "Guest",
    incidentMeta: "Resolved",
    live: "Live",
    needsImprovement: "Needs improvement",
    noAccidentDays: "Days without accident",
    openAlertMeta: "overdue",
    overallScore: "Overall safety score",
    priority: "Weak - Priority",
    safeDayRecord: "Record: 210 days",
    sixSProgress: "6S progress - June 2026",
    target: "Target: 95%",
    updatePrefix: "Updated",
    viewAlerts: "View alerts"
  },
  ja: {
    alertOpen: "æœªå¯¾å¿œã‚¢ãƒ©ãƒ¼ãƒˆ",
    checklistOpen: "æœªå®Œäº†ãƒã‚§ãƒƒã‚¯ãƒªã‚¹ãƒˆ",
    currentMonthIncidents: "6æœˆã®äº‹æ•…",
    documents: "è³‡æ–™",
    good: "è‰¯å¥½",
    greetingAfternoon: "ã“ã‚“ã«ã¡ã¯",
    greetingEvening: "ã“ã‚“ã°ã‚“ã¯",
    greetingMorning: "ãŠã¯ã‚ˆã†ã”ã–ã„ã¾ã™",
    guest: "ã‚²ã‚¹ãƒˆ",
    incidentMeta: "æ˜¯æ­£æ¸ˆã¿",
    live: "Live",
    needsImprovement: "æ”¹å–„å¿…è¦",
    noAccidentDays: "ç„¡ç½å®³æ—¥æ•°",
    openAlertMeta: "æœŸé™è¶…éŽ",
    overallScore: "ç·åˆå®‰å…¨ã‚¹ã‚³ã‚¢",
    priority: "å¼±ã„ - å„ªå…ˆ",
    safeDayRecord: "è¨˜éŒ²: 210æ—¥",
    sixSProgress: "6Sé€²æ— - 2026å¹´6æœˆ",
    target: "ç›®æ¨™: 95%",
    updatePrefix: "æ›´æ–°",
    viewAlerts: "ã‚¢ãƒ©ãƒ¼ãƒˆè¡¨ç¤º"
  }
};

const sixSProgressItems = [
  { code: "S1", key: "sort", label: { vi: "SÃ ng lá»c", en: "Sort", ja: "æ•´ç†" }, score: 90 },
  { code: "S2", key: "set", label: { vi: "Sáº¯p xáº¿p", en: "Set in order", ja: "æ•´é “" }, score: 84 },
  { code: "S3", key: "shine", label: { vi: "Sáº¡ch sáº½", en: "Shine", ja: "æ¸…æŽƒ" }, score: 85 },
  { code: "S4", key: "standardize", label: { vi: "SÄƒn sÃ³c", en: "Standardize", ja: "æ¸…æ½”" }, score: 68 },
  { code: "S5", key: "sustain", label: { vi: "Sáºµn sÃ ng", en: "Sustain", ja: "ã—ã¤ã‘" }, score: 44 },
  { code: "S6", key: "safety", label: { vi: "An toÃ n", en: "Safety", ja: "å®‰å…¨" }, score: 75 }
];

const safetyTrendData = [
  { label: "T1", actual: 85, target: 90 },
  { label: "T2", actual: 87, target: 90 },
  { label: "T3", actual: 88, target: 90 },
  { label: "T4", actual: 91, target: 92 },
  { label: "T5", actual: 93, target: 92 },
  { label: "T6", actual: 96, target: 95 }
];

const violationTrendData = [
  { label: "T4", violations: 12, incidents: 3 },
  { label: "T5", violations: 15, incidents: 4 },
  { label: "T6", violations: 9, incidents: 2 },
  { label: "T7", violations: 11, incidents: 3 },
  { label: "T8", violations: 7, incidents: 1 },
  { label: "T9", violations: 5, incidents: 1 },
  { label: "T10", violations: 4, incidents: 0 },
  { label: "T11", violations: 2, incidents: 0 }
];

const incidentCategoryData = [
  { label: "Tai náº¡n LÄ", value: 5, color: "#ef4444" },
  { label: "Sá»± cá»‘ TB", value: 8, color: "#f59e0b" },
  { label: "HÃ³a cháº¥t", value: 3, color: "#f97316" },
  { label: "NgÃ£/Va cháº¡m", value: 7, color: "#0d6efd" },
  { label: "KhÃ¡c", value: 4, color: "#14b8a6" }
];

const getSafetyIndexLabels = (lang: HubLanguage): SafetyIndexLabelSet => safetyIndexLabels[lang] || safetyIndexLabels.vi;

const getScoreTone = (score: number): ToneName => {
  if (score >= 85) return "good";
  if (score >= 70) return "watch";
  return "alert";
};

const getGreetingKey = (): SafetyGreetingKey => {
  const hour = new Date().getHours();
  if (hour < 12) return "greetingMorning";
  if (hour < 18) return "greetingAfternoon";
  return "greetingEvening";
};

const formatIndexTimestamp = (lang: HubLanguage, labels: SafetyIndexLabelSet): string => {
  const locale = lang === "en" ? "en-US" : lang === "ja" ? "ja-JP" : "vi-VN";
  const now = new Date();
  const date = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    weekday: "long",
    year: "numeric"
  }).format(now);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(now);
  return `${date} - ${labels.updatePrefix} ${time}`;
};

const getPolylinePoints = (
  values: number[],
  { height = 64, max = 100, min = 0, width = 150 }: { height?: number; max?: number; min?: number; width?: number } = {}
): string => {
  const spread = Math.max(1, max - min);
  return values
    .map((value, index) => {
      const x = values.length <= 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((Number(value) - min) / spread) * height;
      return `${x.toFixed(1)},${Math.max(0, Math.min(height, y)).toFixed(1)}`;
    })
    .join(" ");
};

function MiniSparkline({ points = [], tone = "good" }: { points?: number[]; tone?: ToneName }) {
  if (!points.length) return null;
  const min = Math.min(...points) - 2;
  const max = Math.max(...points) + 2;
  const lastY = 52 - ((points[points.length - 1] - min) / Math.max(1, max - min)) * 52;

  return (
    <svg className={`safety-mini-sparkline ${tone}`} viewBox="0 0 150 64" aria-hidden="true">
      <polyline points={getPolylinePoints(points, { height: 52, max, min, width: 140 })} />
      <circle cx="140" cy={lastY} r="3.5" />
    </svg>
  );
}

function SafetyIndexCard({
  icon: Icon,
  label,
  meta,
  tone = "good",
  trend,
  trendPoints = [],
  value
}: IconSummaryItemProps & { meta: ReactNode; trend?: ReactNode; trendPoints?: number[] }) {
  return (
    <article className={`safety-index-card ${tone}`}>
      <div className="safety-index-card-top">
        <span className="safety-index-icon">
          <Icon size={20} />
        </span>
        {trend ? <em>{trend}</em> : null}
      </div>
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{meta}</small>
      <MiniSparkline points={trendPoints} tone={tone} />
    </article>
  );
}

function SafetySixSCard({
  item,
  labels,
  lang
}: {
  item: (typeof sixSProgressItems)[number];
  labels: SafetyIndexLabelSet;
  lang: HubLanguage;
}) {
  const tone = getScoreTone(item.score);
  const status = tone === "good" ? labels.good : tone === "watch" ? labels.needsImprovement : labels.priority;

  return (
    <article className={`safety-sixs-card ${tone}`}>
      <strong>{item.code}</strong>
      <span>{getText(item.label, lang)}</span>
      <div className="safety-sixs-ring" style={{ "--score": item.score } as CustomCssVars}>
        <b>{item.score}%</b>
      </div>
      <em>{status}</em>
    </article>
  );
}

function SafetyIndexBoard({
  highActions,
  latestDocuments,
  lang,
  model,
  onOpenFeed,
  t
}: {
  highActions: SafetyAction[];
  latestDocuments: DocumentRecord[];
  lang: HubLanguage;
  model: SafetyDashboardModel;
  onOpenFeed: (key: SafetyFeedKey) => void;
  t: HubTranslate;
}) {
  const { user } = useAuth();
  const labels = getSafetyIndexLabels(lang);
  const userName = user?.displayName || user?.username || labels.guest;
  const safeDays = Number(model.safeDays || model.daysWithoutAccident || 148);
  const overdueHighActions = highActions.filter((action) => isPastDate(action.due));
  const incidentCount = overdueHighActions.length;
  const resolvedIncidentCount = Math.max(0, Math.min(incidentCount, model.watchCount || 0));
  const checklistOpenCount = Number(model.actionCount || 0);
  const averageScore = Number(model.averageScore || 0);
  const scoreTone = getScoreTone(averageScore);

  const stats = [
    {
      icon: ShieldCheck,
      label: labels.overallScore,
      meta: `${labels.target} âœ“`,
      tone: scoreTone,
      trend: "â–² +3%",
      trendPoints: [84, 86, 87, 90, 92, averageScore],
      value: `${averageScore}%`
    },
    {
      icon: CalendarDays,
      label: labels.noAccidentDays,
      meta: labels.safeDayRecord,
      tone: "good",
      trend: "â–² +12",
      trendPoints: [96, 112, 124, 139, safeDays],
      value: safeDays
    },
    {
      icon: AlertTriangle,
      label: labels.alertOpen,
      meta: `${overdueHighActions.length} ${labels.openAlertMeta} Â· ${Math.max(0, highActions.length - overdueHighActions.length)} ${t("statusWatch")}`,
      tone: highActions.length ? "watch" : "good",
      trend: "= khÃ´ng má»›i",
      trendPoints: [6, 5, 4, 5, highActions.length],
      value: highActions.length
    },
    {
      icon: Flame,
      label: labels.currentMonthIncidents,
      meta: `${labels.incidentMeta}: ${resolvedIncidentCount}/${incidentCount || 0}`,
      tone: incidentCount ? "alert" : "good",
      trend: "â–¼ -2",
      trendPoints: [3, 2, 3, 2, incidentCount],
      value: incidentCount
    }
  ];

  return (
    <section className="safety-index-board" aria-label={t("commandOverview")}>
      <div className="safety-welcome-panel">
        <div className="safety-welcome-copy">
          <span className="safety-welcome-icon">
            <HardHat size={28} />
          </span>
          <div>
            <h2>
              {labels[getGreetingKey()]}, {userName}!
            </h2>
            <p>
              CÃ³ <strong>{highActions.length} cáº£nh bÃ¡o nÃ³ng</strong> cáº§n xá»­ lÃ½ Â· <strong>{checklistOpenCount} {labels.checklistOpen}</strong> Â· <strong>{safeDays} {labels.noAccidentDays.toLowerCase()}</strong>
            </p>
          </div>
        </div>
        <div className="safety-welcome-actions">
          <Button className="secondary-button small" onClick={() => onOpenFeed("hotAlerts")} size="sm" variant="secondary">
            <Gauge size={16} />
            {labels.viewAlerts}
          </Button>
          <Button as={Link} className="primary-button compact" to="/documents">
            <FolderOpen size={16} />
            {labels.documents}
          </Button>
        </div>
      </div>

      <div className="safety-index-grid">
        {stats.map((item) => (
          <SafetyIndexCard
            icon={item.icon}
            key={item.label}
            label={item.label}
            meta={item.meta}
            tone={item.tone}
            trend={item.trend}
            trendPoints={item.trendPoints}
            value={item.value}
          />
        ))}
      </div>

      <div className="safety-sixs-panel">
        <div className="safety-sixs-heading">
          <h2>
            <BarChart3 size={18} />
            {labels.sixSProgress}
          </h2>
          <Link to="/documents">
            {t("viewAll")}
            <ChevronRight size={14} />
          </Link>
        </div>
        <div className="safety-sixs-grid">
          {sixSProgressItems.map((item) => (
            <SafetySixSCard item={item} key={item.key} labels={labels} lang={lang} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SafetyInsightPanel({
  children,
  icon: Icon,
  subtitle = "",
  title
}: {
  children?: ReactNode;
  icon?: LucideIcon;
  subtitle?: ReactNode;
  title: ReactNode;
}) {
  return (
    <section className="safety-insight-panel">
      <div className="safety-insight-header">
        <div>
          <h2>
            {Icon ? <Icon size={17} /> : null}
            {title}
          </h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function SafetyScoreTrendPanel() {
  const actualPoints = getPolylinePoints(safetyTrendData.map((item) => item.actual), { height: 150, max: 100, min: 80, width: 500 });
  const targetPoints = getPolylinePoints(safetyTrendData.map((item) => item.target), { height: 150, max: 100, min: 80, width: 500 });
  const movePoints = (points: string) =>
    points
      .split(" ")
      .map((point) => {
        const [x, y] = point.split(",").map(Number);
        return `${x + 44},${y + 20}`;
      })
      .join(" ");

  return (
    <SafetyInsightPanel icon={LineChart} subtitle="So sÃ¡nh thá»±c táº¿ vá»›i má»¥c tiÃªu" title="Äiá»ƒm An ToÃ n - 6 ThÃ¡ng Äáº§u 2026">
      <div className="safety-line-chart">
        <svg viewBox="0 0 560 210" role="img" aria-label="Xu hÆ°á»›ng Ä‘iá»ƒm an toÃ n 6 thÃ¡ng Ä‘áº§u 2026">
          {[80, 85, 90, 95, 100].map((value) => {
            const y = 170 - ((value - 80) / 20) * 150;
            return (
              <g key={value}>
                <line x1="44" x2="544" y1={y} y2={y} />
                <text x="12" y={y + 4}>{value}%</text>
              </g>
            );
          })}
          {safetyTrendData.map((item, index) => {
            const x = 44 + (index / (safetyTrendData.length - 1)) * 500;
            return <text key={item.label} x={x - 8} y="195">{item.label}</text>;
          })}
          <polyline className="target" points={movePoints(targetPoints)} />
          <polyline className="actual" points={movePoints(actualPoints)} />
          {safetyTrendData.map((item, index) => {
            const x = 44 + (index / (safetyTrendData.length - 1)) * 500;
            const y = 170 - ((item.actual - 80) / 20) * 150;
            return <circle className="actual-dot" cx={x} cy={y} key={item.label} r="4" />;
          })}
        </svg>
        <div className="safety-chart-legend">
          <span className="actual">Thá»±c táº¿</span>
          <span className="target">Má»¥c tiÃªu</span>
        </div>
        <div className="safety-chart-note good">
          <TrendingUp size={14} />
          TÄƒng 11 Ä‘iá»ƒm so vá»›i thÃ¡ng 1 - xu hÆ°á»›ng tÃ­ch cá»±c
        </div>
      </div>
    </SafetyInsightPanel>
  );
}

function SafetyViolationTrendPanel() {
  const maxValue = Math.max(...violationTrendData.flatMap((item) => [item.violations, item.incidents]), 1);

  return (
    <SafetyInsightPanel icon={BarChart3} subtitle="Sá»‘ lÆ°á»£ng vi pháº¡m vÃ  sá»± cá»‘ theo tuáº§n" title="Vi Pháº¡m & Sá»± Cá»‘ - 8 Tuáº§n Qua">
      <div className="safety-bar-chart">
        <div className="safety-bar-plot" aria-label="Biá»ƒu Ä‘á»“ vi pháº¡m vÃ  sá»± cá»‘ 8 tuáº§n qua">
          {violationTrendData.map((item) => (
            <div className="safety-bar-group" key={item.label}>
              <span className="violation" style={{ "--bar-height": `${Math.max(8, (item.violations / maxValue) * 150)}px` } as CustomCssVars} />
              <span className="incident" style={{ "--bar-height": `${Math.max(4, (item.incidents / maxValue) * 150)}px` } as CustomCssVars} />
              <em>{item.label}</em>
            </div>
          ))}
        </div>
        <div className="safety-chart-legend">
          <span className="violation">Vi pháº¡m</span>
          <span className="incident">Sá»± cá»‘</span>
        </div>
        <div className="safety-chart-note good">
          <TrendingUp size={14} />
          Giáº£m 67% vi pháº¡m trong 8 tuáº§n - xu hÆ°á»›ng tá»‘t
        </div>
      </div>
    </SafetyInsightPanel>
  );
}

function SafetyIncidentCategoryPanel() {
  const total = incidentCategoryData.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const gradient = incidentCategoryData
    .map((item) => {
      const start = cursor;
      const end = cursor + (item.value / total) * 100;
      cursor = end;
      return `${item.color} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <SafetyInsightPanel icon={PieChart} subtitle={`Tá»•ng ${total} sá»± cá»‘ tá»« Ä‘áº§u nÄƒm Ä‘áº¿n nay`} title="PhÃ¢n Loáº¡i Sá»± Cá»‘ - 2026">
      <div className="safety-donut-wrap">
        <div className="safety-donut" style={{ "--donut-gradient": gradient } as CustomCssVars} aria-label="PhÃ¢n loáº¡i sá»± cá»‘" />
        <div className="safety-donut-legend">
          {incidentCategoryData.map((item) => (
            <div key={item.label}>
              <span style={{ "--legend-color": item.color } as CustomCssVars} />
              <strong>{item.label}</strong>
              <em>{item.value}</em>
            </div>
          ))}
        </div>
      </div>
    </SafetyInsightPanel>
  );
}

function SafetyDepartmentRankingPanel({ departments, lang }: DepartmentAwareProps) {
  const sortedDepartments = [...departments].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  const targetCount = sortedDepartments.filter((item) => Number(item.score) >= 90).length;
  const improveCount = Math.max(0, sortedDepartments.length - targetCount);

  return (
    <SafetyInsightPanel icon={Trophy} title="Xáº¿p Háº¡ng Bá»™ Pháº­n - Äiá»ƒm An ToÃ n">
      <div className="safety-ranking-panel">
        <div className="safety-ranking-tabs">
          <span>Top 5 â†‘</span>
          <em>Tháº¥p nháº¥t â†“</em>
        </div>
        <div className="safety-ranking-list">
          {sortedDepartments.slice(0, 5).map((department, index) => (
            <Link className="safety-ranking-row" key={department.id} to={`/safety-6s/departments/${department.id}`}>
              <span>{index + 1}</span>
              <strong>{getText(department.name, lang)}</strong>
              <i><b style={{ width: `${Math.max(0, Math.min(100, Number(department.score) || 0))}%` }} /></i>
              <em>{department.score}%</em>
            </Link>
          ))}
        </div>
        <div className="safety-ranking-summary">
          <span>
            <strong>{targetCount}/{sortedDepartments.length}</strong>
            Bá»™ pháº­n Ä‘áº¡t má»¥c tiÃªu
          </span>
          <span className="alert">
            <strong>{improveCount}/{sortedDepartments.length}</strong>
            Cáº§n cáº£i thiá»‡n
          </span>
        </div>
      </div>
    </SafetyInsightPanel>
  );
}

function SafetyAnalyticsGrid({ departments, lang }: DepartmentAwareProps) {
  return (
    <section className="safety-analytics-grid" aria-label="PhÃ¢n tÃ­ch An toÃ n - 6S">
      <SafetyScoreTrendPanel />
      <SafetyViolationTrendPanel />
      <SafetyIncidentCategoryPanel />
      <SafetyDepartmentRankingPanel departments={departments} lang={lang} />
    </section>
  );
}

const getDepartmentName = (departments: HubDepartment[], departmentId: string | undefined, lang: HubLanguage): string => {
  const department = departments.find((item) => item.id === departmentId);
  const text = department ? getText(department.name, lang) : "";
  return Array.isArray(text) ? text.join(" ") : String(text || "");
};

const dateOnly = (value: unknown): string => {
  const text = String(value || "").trim();
  return text.match(/\d{4}-\d{2}-\d{2}/)?.[0] || text.slice(0, 10);
};

const isPastDate = (value: unknown): boolean => {
  const iso = dateOnly(value);
  if (!iso) return false;
  const date = new Date(`${iso}T23:59:59`);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
};

function SafetyPanel({
  action = null,
  children,
  className = "",
  icon: Icon,
  title
}: {
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  icon?: LucideIcon;
  title: ReactNode;
}) {
  return (
    <section className={`safety-dashboard-panel ${className}`.trim()}>
      <div className="safety-dashboard-panel-header">
        <h2>
          {Icon ? <Icon size={17} /> : null}
          <span>{title}</span>
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function SafetyAlertList({
  actions,
  departments,
  labels,
  lang,
  onOpen,
  t
}: {
  actions: SafetyAction[];
  departments: HubDepartment[];
  labels: SafetyDashboardLabelSet;
  lang: HubLanguage;
  onOpen: (key: SafetyFeedKey) => void;
  t: HubTranslate;
}) {
  return (
    <SafetyPanel
      action={
        <button className="safety-panel-link" onClick={() => onOpen("hotAlerts")} type="button">
          {t("viewAll")}
          <ChevronRight size={14} />
        </button>
      }
      className="safety-alert-panel"
      icon={AlertTriangle}
      title={t("hotAlerts")}
    >
      <div className="safety-alert-list">
        {actions.length ? (
          actions.slice(0, 4).map((action) => {
            const overdue = isPastDate(action.due);
            return (
              <button className={`safety-alert-row ${overdue ? "overdue" : ""}`} key={action.id} onClick={() => onOpen("hotAlerts")} type="button">
                <span className="safety-alert-accent" aria-hidden="true" />
                <span className="safety-alert-icon" aria-hidden="true" />
                <span className="safety-alert-copy">
                  <strong>{getText(action.title, lang)}</strong>
                  <small>
                    {getDepartmentName(departments, action.departmentId, lang)}
                    {" - "}
                    {dateOnly(action.due)}
                  </small>
                </span>
                <span className={`safety-alert-badge ${overdue ? "overdue" : ""}`}>
                  {overdue ? labels.overdue : labels.important}
                </span>
              </button>
            );
          })
        ) : (
          <p className="empty-text compact">{t("noHotAlerts")}</p>
        )}
      </div>
    </SafetyPanel>
  );
}

function SafetyNoticeList({
  bulletins,
  labels,
  lang,
  onOpen,
  onOpenFeed,
  t
}: {
  bulletins: SafetyBulletin[];
  labels: SafetyDashboardLabelSet;
  lang: HubLanguage;
  onOpen: (bulletin: SafetyBulletin) => void;
  onOpenFeed: (key: SafetyFeedKey) => void;
  t: HubTranslate;
}) {
  return (
    <SafetyPanel
      action={
        <button className="safety-panel-link" onClick={() => onOpenFeed("latestNotices")} type="button">
          {t("viewAll")}
          <ChevronRight size={14} />
        </button>
      }
      className="safety-notice-panel"
      icon={Megaphone}
      title={t("latestNotices")}
    >
      <div className="safety-notice-list">
        {bulletins.length ? (
          bulletins.slice(0, 4).map((bulletin) => (
            <button className="safety-notice-row" key={bulletin.id} onClick={() => onOpen(bulletin)} type="button">
              <span>
                <strong>{getText(bulletin.title, lang)}</strong>
                <small>
                  {getText(bulletin.audience, lang) || t("companyLevel")}
                  {" - "}
                  {dateOnly(bulletin.date || bulletin.createdAt || bulletin.updatedAt)}
                </small>
              </span>
              <em>{labels.notice}</em>
            </button>
          ))
        ) : (
          <p className="empty-text compact">{t("noNewDocuments")}</p>
        )}
      </div>
    </SafetyPanel>
  );
}

function DepartmentScorePanel({
  departments,
  labels,
  lang,
  t
}: DepartmentAwareProps & { labels: SafetyDashboardLabelSet; t: HubTranslate }) {
  const sortedDepartments = [...departments].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

  return (
    <SafetyPanel className="safety-score-panel" icon={Building2} title={labels.departmentScore}>
      <div className="safety-score-table">
        <div className="safety-score-head">
          <span>{labels.department}</span>
          <span>{labels.score}</span>
          <span>{labels.status}</span>
        </div>
        {sortedDepartments.slice(0, 6).map((department) => (
          <Link className="safety-score-row" key={department.id} to={`/safety-6s/departments/${department.id}`}>
            <span>{getText(department.name, lang)}</span>
            <strong>{department.score}</strong>
            <em className={department.riskLevel}>{department.riskLevel === "good" ? t("statusGood") : department.riskLevel === "watch" ? t("statusWatch") : t("statusAlert")}</em>
          </Link>
        ))}
      </div>
    </SafetyPanel>
  );
}

function RecentActivityPanel({ items, labels }: { items: RecentActivityItem[]; labels: SafetyDashboardLabelSet }) {
  return (
    <SafetyPanel className="safety-recent-panel" icon={ClipboardCheck} title={labels.latestActivity}>
      <div className="safety-recent-list">
        {items.map((item) => (
          <div className={`safety-recent-row ${item.tone}`} key={item.id}>
            <span aria-hidden="true" />
            <div>
              <strong>{item.title}</strong>
              <small>{item.meta}</small>
            </div>
          </div>
        ))}
      </div>
    </SafetyPanel>
  );
}

function SafetyDashboardBlocks({
  bulletins,
  departments,
  highActions,
  labels,
  lang,
  onOpenBulletin,
  onOpenFeed,
  recentItems,
  t
}: {
  bulletins: SafetyBulletin[];
  departments: HubDepartment[];
  highActions: SafetyAction[];
  labels: SafetyDashboardLabelSet;
  lang: HubLanguage;
  onOpenBulletin: (bulletin: SafetyBulletin) => void;
  onOpenFeed: (key: SafetyFeedKey) => void;
  recentItems: RecentActivityItem[];
  t: HubTranslate;
}) {
  return (
    <section className="safety-dashboard-layout">
      <div className="safety-dashboard-main">
        <SafetyAlertList actions={highActions} departments={departments} labels={labels} lang={lang} onOpen={onOpenFeed} t={t} />
        <SafetyNoticeList bulletins={bulletins} labels={labels} lang={lang} onOpen={onOpenBulletin} onOpenFeed={onOpenFeed} t={t} />
      </div>
      <div className="safety-dashboard-aside">
        <DepartmentScorePanel departments={departments} labels={labels} lang={lang} t={t} />
        <RecentActivityPanel items={recentItems} labels={labels} />
      </div>
    </section>
  );
}

function SafetyBoardRow({
  departments,
  entry,
  lang,
  onOpenBulletin,
  onOpenFeed,
  t
}: {
  departments: HubDepartment[];
  entry: SafetyBoardEntry;
  lang: HubLanguage;
  onOpenBulletin: (bulletin: SafetyBulletin) => void;
  onOpenFeed: (key: SafetyFeedKey) => void;
  t: HubTranslate;
}) {
  const Icon = safetyBoardIcons[entry.feedKey] || ClipboardCheck;

  return (
    <article className={`safety-board-row ${entry.tone || "good"}`}>
      <span className="safety-board-row-label">
        <Icon size={13} />
        <span>{entry.label}</span>
      </span>
      {entry.kind === "bulletin" ? (
        <BulletinItem
          bulletin={entry.item}
          compact
          lang={lang}
          onOpen={onOpenBulletin}
          showInlineMore
          showPoints={false}
          t={t}
        />
      ) : null}
      {entry.kind === "action" ? (
        <ActionItem
          action={entry.item}
          departments={departments}
          lang={lang}
          onOpen={() => onOpenFeed(entry.feedKey)}
        />
      ) : null}
      {entry.kind === "document" ? (
        <DocumentMini
          departments={departments}
          document={entry.item}
          lang={lang}
          showDateStamp
          t={t}
        />
      ) : null}
    </article>
  );
}

function SafetyCommandBoard({
  activeFeedKey,
  departments,
  emptyText,
  entries,
  feedTabs,
  lang,
  onOpenBulletin,
  onOpenFeed,
  onSelectFeed,
  t
}: {
  activeFeedKey: SafetyBoardFeedKey;
  departments: HubDepartment[];
  emptyText: ReactNode;
  entries: SafetyBoardEntry[];
  feedTabs: SafetyFeedTab[];
  lang: HubLanguage;
  onOpenBulletin: (bulletin: SafetyBulletin) => void;
  onOpenFeed: (key: SafetyFeedKey) => void;
  onSelectFeed: (key: SafetyBoardFeedKey) => void;
  t: HubTranslate;
}) {
  const activeTab = feedTabs.find((item) => item.key === activeFeedKey) || feedTabs[0];
  const ActiveIcon = safetyBoardIcons[activeTab?.key] || ClipboardCheck;

  return (
    <section className={`safety-command-board ${activeTab?.tone || "good"}`}>
      <div className="safety-board-heading">
        <div>
          <span className="safety-board-kicker">
            <ActiveIcon size={15} />
            {activeTab?.label || t("commandOverview")}
          </span>
          <h2>{t("commandOverview")}</h2>
        </div>
        {activeFeedKey !== "all" ? (
          <button className="view-all-link" onClick={() => onOpenFeed(activeFeedKey)} type="button">
            {t("viewAll")}
            <ChevronRight size={16} />
          </button>
        ) : null}
      </div>

      <div className="safety-board-tabs" role="tablist" aria-label={t("commandOverview")}>
        {feedTabs.map((tab) => {
          const TabIcon = safetyBoardIcons[tab.key] || ClipboardCheck;
          return (
            <button
              aria-selected={activeFeedKey === tab.key}
              className={`safety-board-tab ${tab.tone || "good"} ${activeFeedKey === tab.key ? "active" : ""}`}
              key={tab.key}
              onClick={() => onSelectFeed(tab.key)}
              role="tab"
              type="button"
            >
              <TabIcon size={16} />
              <span>{tab.label}</span>
              <strong>{tab.count}</strong>
            </button>
          );
        })}
      </div>

      <div className={`safety-board-list ${entries.length ? "" : "empty"}`}>
        {entries.length ? (
          entries.map((entry) => (
            <SafetyBoardRow
              departments={departments}
              entry={entry}
              key={entry.id}
              lang={lang}
              onOpenBulletin={onOpenBulletin}
              onOpenFeed={onOpenFeed}
              t={t}
            />
          ))
        ) : (
          <p className="empty-text compact">{emptyText}</p>
        )}
      </div>
    </section>
  );
}

export function SafetyPage({ lang, t, model }: SafetyPageProps) {
  const [latestDocuments, setLatestDocuments] = useState<DocumentRecord[]>([]);
  const [bulletins, setBulletins] = useState<SafetyBulletin[]>([]);
  const [activeSafetyFeedKey, setActiveSafetyFeedKey] = useState<SafetyBoardFeedKey>("all");
  const [selectedFeedKey, setSelectedFeedKey] = useState<SafetyFeedKey | null>(null);
  const [selectedBulletin, setSelectedBulletin] = useState<SafetyBulletin | null>(null);

  useEffect(() => {
    api.fetchDocuments({ page: 1, pageSize: 8 }).then((payload) => setLatestDocuments(payload.items || []));
    api.fetchSafetyBulletins({ page: 1, pageSize: 10 }).then((payload) => setBulletins(payload.items || []));
  }, []);

  const highActions = model.safetyActions.filter((action) => action.severity === "high");
  const watchDepartments = model.departments.filter((department) => department.riskLevel !== "good");
  const newestActions = model.safetyActions.slice(0, 4);
  const allBulletins = bulletins.length ? bulletins : model.publishedBulletins || [];
  const latestBulletins = allBulletins.slice(0, 3);
  const feedDescriptions: Record<SafetyFeedKey, string> = {
    latestNotices: "TÃ³m táº¯t thÃ´ng bÃ¡o chÃ­nh; báº¥m tá»«ng dÃ²ng Ä‘á»ƒ xem Ä‘áº§y Ä‘á»§ ná»™i dung há»p.",
    hotAlerts: "CÃ¡c Ä‘iá»ƒm cáº§n xá»­ lÃ½ ngay, cÃ³ bá»™ pháº­n phá»¥ trÃ¡ch vÃ  háº¡n hoÃ n thÃ nh.",
    newUpdates: "Danh sÃ¡ch váº¥n Ä‘á» Ä‘ang theo dÃµi, Æ°u tiÃªn ná»™i dung ngáº¯n gá»n dá»… nháº­n biáº¿t.",
    newIssued: "TÃ i liá»‡u má»›i ban hÃ nh, cÃ³ thá»ƒ xem trÃªn web hoáº·c táº£i file gá»‘c."
  };
  const feedDetails: Record<SafetyFeedKey, FeedDetail> = {
    latestNotices: {
      kind: "bulletins",
      title: t("latestNotices"),
      description: feedDescriptions.latestNotices,
      tone: "good",
      items: allBulletins
    },
    hotAlerts: {
      kind: "actions",
      title: t("hotAlerts"),
      description: feedDescriptions.hotAlerts,
      tone: "alert",
      items: highActions
    },
    newUpdates: {
      kind: "actions",
      title: t("newUpdates"),
      description: feedDescriptions.newUpdates,
      tone: "watch",
      items: model.safetyActions
    },
    newIssued: {
      kind: "documents",
      title: t("newIssued"),
      description: feedDescriptions.newIssued,
      tone: "good",
      items: latestDocuments
    }
  };
  const selectedFeed = selectedFeedKey ? feedDetails[selectedFeedKey] : null;
  const highActionIds = new Set(highActions.map((action) => action.id));
  const boardEntriesByFeed: Record<SafetyFeedKey, SafetyBoardEntry[]> = {
    latestNotices: latestBulletins.slice(0, 6).map((bulletin): SafetyBoardEntry => ({
      feedKey: "latestNotices",
      id: `notice-${bulletin.id}`,
      item: bulletin,
      kind: "bulletin",
      label: t("latestNotices"),
      tone: bulletin.tone || "good"
    })),
    hotAlerts: highActions.slice(0, 8).map((action): SafetyBoardEntry => ({
      feedKey: "hotAlerts",
      id: `hot-${action.id}`,
      item: action,
      kind: "action",
      label: t("hotAlerts"),
      tone: "alert"
    })),
    newUpdates: model.safetyActions.slice(0, 8).map((action): SafetyBoardEntry => ({
      feedKey: "newUpdates",
      id: `update-${action.id}`,
      item: action,
      kind: "action",
      label: t("newUpdates"),
      tone: action.severity === "high" ? "alert" : "watch"
    })),
    newIssued: latestDocuments.slice(0, 8).map((document): SafetyBoardEntry => ({
      feedKey: "newIssued",
      id: `doc-${document.id}`,
      item: document,
      kind: "document",
      label: t("newIssued"),
      tone: "good"
    }))
  };
  const combinedBoardEntries: SafetyBoardEntry[] = [
    ...boardEntriesByFeed.latestNotices.slice(0, 1),
    ...boardEntriesByFeed.hotAlerts.slice(0, 2),
    ...model.safetyActions
      .filter((action) => !highActionIds.has(action.id))
      .slice(0, 2)
      .map((action): SafetyBoardEntry => ({
        feedKey: "newUpdates",
        id: `all-update-${action.id}`,
        item: action,
        kind: "action",
        label: t("newUpdates"),
        tone: action.severity === "high" ? "alert" : "watch"
      })),
    ...boardEntriesByFeed.newIssued.slice(0, 1)
  ];
  const safetyBoardEntries =
    activeSafetyFeedKey === "all"
      ? combinedBoardEntries
      : boardEntriesByFeed[activeSafetyFeedKey] || combinedBoardEntries;
  const feedTabs: SafetyFeedTab[] = [
    {
      count: combinedBoardEntries.length,
      key: "all",
      label: t("all"),
      tone: "good"
    },
    {
      count: allBulletins.length,
      key: "latestNotices",
      label: t("latestNotices"),
      tone: "good"
    },
    {
      count: highActions.length,
      key: "hotAlerts",
      label: t("hotAlerts"),
      tone: "alert"
    },
    {
      count: model.safetyActions.length,
      key: "newUpdates",
      label: t("newUpdates"),
      tone: "watch"
    },
    {
      count: latestDocuments.length,
      key: "newIssued",
      label: t("newIssued"),
      tone: "good"
    }
  ];
  const safetyBoardEmptyText = activeSafetyFeedKey === "hotAlerts" ? t("noHotAlerts") : t("noNewDocuments");
  const updateBulletin = (saved: SafetyBulletin) => {
    setBulletins((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
    setSelectedBulletin(saved);
  };
  const removeBulletin = (updated: SafetyBulletin) => {
    setBulletins((items) => items.filter((item) => item.id !== updated.id));
    setSelectedBulletin(null);
  };
  const openLatestBulletin = (bulletin: SafetyBulletin) => {
    setSelectedFeedKey("latestNotices");
    setSelectedBulletin(bulletin);
  };
  const heroSummaryItems = [
    { icon: AlertTriangle, label: t("hotAlerts"), value: highActions.length, tone: highActions.length ? "alert" : "good" },
    { icon: Building2, label: t("statusWatch"), value: watchDepartments.length, tone: watchDepartments.length ? "watch" : "good" },
    { icon: ClipboardCheck, label: t("newUpdates"), value: newestActions.length, tone: "watch" },
    { icon: FileText, label: t("newIssued"), value: latestDocuments.length, tone: "good" }
  ];
  const dashboardLabels = getDashboardLabels(lang);
  const recentActivityItems: RecentActivityItem[] = [
    ...highActions.slice(0, 2).map((action) => ({
      id: `recent-action-${action.id}`,
      meta: `${getDepartmentName(model.departments, action.departmentId, lang)} - ${dateOnly(action.due)}`,
      title: getText(action.title, lang),
      tone: "alert"
    })),
    ...allBulletins.slice(0, 2).map((bulletin) => ({
      id: `recent-bulletin-${bulletin.id}`,
      meta: `${getText(bulletin.audience, lang) || t("companyLevel")} - ${dateOnly(bulletin.date || bulletin.createdAt || bulletin.updatedAt)}`,
      title: getText(bulletin.title, lang),
      tone: "notice"
    })),
    ...latestDocuments.slice(0, 2).map((document) => ({
      id: `recent-document-${document.id}`,
      meta: `${getDepartmentName(model.departments, document.departmentId, lang) || t("companyLevel")} - ${dateOnly(document.createdAt || document.uploadedAt || document.updatedAt)}`,
      title: getDocumentDisplayTitle(document, t("newIssued"), lang),
      tone: "document"
    }))
  ].slice(0, 4);

  return (
    <div className="page safety-command-page">
      <SafetyIndexBoard
        highActions={highActions}
        latestDocuments={latestDocuments}
        lang={lang}
        model={model}
        onOpenFeed={setSelectedFeedKey}
        t={t}
      />

      <SafetyAnalyticsGrid departments={model.departments} lang={lang} />

      <SafetyDashboardBlocks
        bulletins={allBulletins}
        departments={model.departments}
        highActions={highActions}
        labels={dashboardLabels}
        lang={lang}
        onOpenBulletin={openLatestBulletin}
        onOpenFeed={setSelectedFeedKey}
        recentItems={recentActivityItems}
        t={t}
      />


      {selectedFeed && selectedFeed.kind !== "bulletins" ? (
        <FeedDetailModal
          departments={model.departments}
          feed={selectedFeed}
          lang={lang}
          onClose={() => setSelectedFeedKey(null)}
          onOpenBulletin={(bulletin: SafetyBulletin) => {
            openLatestBulletin(bulletin);
          }}
          t={t}
        />
      ) : null}

      {selectedBulletin || (selectedFeedKey === "latestNotices" && allBulletins[0]) ? (
        <SafetyBulletinModal
          bulletin={selectedBulletin || allBulletins[0]}
          bulletins={allBulletins}
          lang={lang}
          variant={selectedFeedKey === "latestNotices" ? "latest" : "hot"}
          onClose={() => {
            setSelectedBulletin(null);
            if (selectedFeedKey === "latestNotices") setSelectedFeedKey(null);
          }}
          onDeleted={removeBulletin}
          onSaved={updateBulletin}
          t={t}
        />
      ) : null}

      <section className="section-band">
        <div className="section-heading">
          <h2>{t("departments")}</h2>
          <p>{t("companySafetySubtitle")}</p>
        </div>
        <div className="department-grid">
          {model.departments.map((department) => (
            <DepartmentCard department={department} key={department.id} lang={lang} t={t} />
          ))}
        </div>
      </section>

      <section className="two-column-section">
        <div className="detail-panel">
          <div className="panel-header">
            <h2>{t("issueBoard")}</h2>
            <span>{model.safetyActions.length}</span>
          </div>
          <div className="action-stack">
            {model.safetyActions.map((action) => (
              <ActionItem action={action} departments={model.departments} key={action.id} lang={lang} />
            ))}
          </div>
        </div>
        <div className="safety-side-stack">
          <SafetyFeedCard icon={Users} title={t("departmentCommand")} tone={watchDepartments.length ? "watch" : "good"}>
            <div className="feed-list">
              {(watchDepartments.length ? watchDepartments : model.departments).slice(0, 3).map((department) => (
                <Link className="feed-item linked" key={department.id} to={`/safety-6s/departments/${department.id}`}>
                  <strong>{getText(department.name, lang)}</strong>
                  <span>
                    {department.openActions} {t("openActions")} Â· {department.score}%
                  </span>
                </Link>
              ))}
            </div>
          </SafetyFeedCard>
          <StandardsPanel t={t} />
        </div>
      </section>
    </div>
  );
}
