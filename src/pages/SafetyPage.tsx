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
import { SafetyBulletinViewModal } from "../components/SafetyBulletinViewModal";
import { SafetyBulletinCreateModal } from "../components/SafetyBulletinCreateModal";
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
  type TrendPoint = { label: string; month: string; actual: number; target: number };
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);

  useEffect(() => {
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().slice(0, 7));
    }
    Promise.all(
      months.map((m) =>
        fetch(`/api/safety/score-engine?period=${m}`, { credentials: "include" })
          .then((r) => r.ok ? r.json() : null)
          .catch(() => null)
      )
    ).then((results) => {
      const points: TrendPoint[] = results.map((res, i) => ({
        month: months[i],
        label: "T" + String(Number(months[i].slice(5, 7))),
        actual: res?.company?.total ?? 0,
        target: 90,
      }));
      setTrendData(points);
    }).finally(() => setTrendLoading(false));
  }, []);

  const displayData = trendData.length >= 2 ? trendData : [
    { label: "T1", month: "", actual: 85, target: 90 },
    { label: "T2", month: "", actual: 87, target: 90 },
    { label: "T3", month: "", actual: 88, target: 90 },
    { label: "T4", month: "", actual: 91, target: 90 },
    { label: "T5", month: "", actual: 93, target: 90 },
    { label: "T6", month: "", actual: 96, target: 90 },
  ];

  const hasReal = trendData.some((p) => p.actual > 0);
  const first = displayData[0]?.actual ?? 0;
  const last = displayData[displayData.length - 1]?.actual ?? 0;
  const diff = last - first;
  const trendGood = diff >= 0;
  const trendNote = !hasReal
    ? "Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u th\u1ef1c t\u1ebf t\u1eeb score engine"
    : diff === 0
    ? "Gi\u1eef nguy\u00ean - \u0111i\u1ec3m \u1ed5n \u0111\u1ecbnh trong 6 th\u00e1ng"
    : `${trendGood ? "T\u0103ng" : "Gi\u1ea3m"} ${Math.abs(diff)} \u0111i\u1ec3m so v\u1edbi th\u00e1ng \u0111\u1ea7u - xu h\u01b0\u1edbng ${trendGood ? "t\u00edch c\u1ef1c" : "c\u1ea7n ch\u00fa \u00fd"}`;

  const minVal = Math.max(0, Math.min(...displayData.map(d => d.actual), ...displayData.map(d => d.target)) - 5);
  const maxVal = Math.min(100, Math.max(...displayData.map(d => d.actual), ...displayData.map(d => d.target)) + 5);
  const range = maxVal - minVal || 20;

  const toPoints = (vals: number[]) =>
    vals.map((v, i) => {
      const x = 44 + (i / Math.max(1, displayData.length - 1)) * 500;
      const y = 170 - ((v - minVal) / range) * 150;
      return `${x + 44},${y + 20}`;
    }).join(" ");

  const gridLines = [minVal, minVal + range * 0.25, minVal + range * 0.5, minVal + range * 0.75, maxVal].map(Math.round);

  const periodLabel = trendData.length
    ? `${trendData[0].month} \u2013 ${trendData[trendData.length - 1].month}`
    : "6 th\u00e1ng g\u1ea7n nh\u1ea5t";

  return (
    <SafetyInsightPanel icon={LineChart} subtitle={`So s\u00e1nh th\u1ef1c t\u1ebf v\u1edbi m\u1ee5c ti\u00eau \u00b7 ${periodLabel}`} title="\u0110i\u1ec3m An To\u00e0n - Xu H\u01b0\u1edbng">
      {trendLoading ? (
        <div style={{ padding: "32px", color: "#94a3b8", textAlign: "center", fontSize: "0.85rem" }}>\u0110ang t\u1ea3i d\u1eef li\u1ec7u...</div>
      ) : (
      <div className="safety-line-chart">
        <svg viewBox="0 0 560 210" role="img" aria-label="Xu h\u01b0\u1edbng \u0111i\u1ec3m an to\u00e0n">
          {gridLines.map((value) => {
            const y = 170 - ((value - minVal) / range) * 150;
            return (
              <g key={value}>
                <line x1="44" x2="544" y1={y + 20} y2={y + 20} stroke="#e2e8f0" strokeDasharray="4 3" />
                <text x="12" y={y + 24} fontSize="11" fill="#94a3b8">{value}</text>
              </g>
            );
          })}
          {displayData.map((item, index) => {
            const x = 44 + (index / Math.max(1, displayData.length - 1)) * 500;
            return <text key={item.label} x={x + 36} y="205" fontSize="11" fill="#64748b" textAnchor="middle">{item.label}</text>;
          })}
          <polyline className="target" points={toPoints(displayData.map(d => d.target))} />
          <polyline className="actual" points={toPoints(displayData.map(d => d.actual))} />
          {displayData.map((item, index) => {
            const x = 44 + (index / Math.max(1, displayData.length - 1)) * 500;
            const y = 170 - ((item.actual - minVal) / range) * 150;
            return (
              <g key={item.label}>
                <circle className="actual-dot" cx={x + 44} cy={y + 20} r="5" />
                <text x={x + 44} y={y + 14} fontSize="10" fill="#0284c7" textAnchor="middle" fontWeight="700">
                  {item.actual > 0 ? item.actual : ""}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="safety-chart-legend">
          <span className="actual">Th\u1ef1c t\u1ebf</span>
          <span className="target">M\u1ee5c ti\u00eau (90)</span>
        </div>
        <div className={`safety-chart-note ${trendGood ? "good" : "watch"}`}>
          <TrendingUp size={14} />
          {trendNote}
        </div>
      </div>
      )}
    </SafetyInsightPanel>
  );
}
function SafetyViolationTrendPanel() {
  const [data, setData] = useState<{ label: string; violations: number; incidents: number }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/safety/violation-trend", { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(rows => { setData(rows); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const displayData = data.length > 0 ? data : [];
  const maxValue = Math.max(...displayData.flatMap(item => [item.violations, item.incidents]), 1);
  const totalVio = displayData.reduce((s, d) => s + d.violations, 0);
  const firstHalf = displayData.slice(0, Math.ceil(displayData.length / 2));
  const secondHalf = displayData.slice(Math.ceil(displayData.length / 2));
  const firstVio = firstHalf.reduce((s, d) => s + d.violations, 0);
  const secondVio = secondHalf.reduce((s, d) => s + d.violations, 0);
  const trendGood = secondVio <= firstVio;
  const trendNote = !loaded
    ? "Đang tải..."
    : totalVio === 0
      ? "Không có vi phạm trong 8 tuần qua — tốt"
      : trendGood
        ? `Xu hướng giảm — ${totalVio} vi phạm tổng cộng`
        : `Xu hướng tăng — ${totalVio} vi phạm tổng cộng`;

  return (
    <SafetyInsightPanel icon={BarChart3} subtitle="Số lượng vi phạm và sự cố theo tuần" title="Vi Phạm &amp; Sự Cố - 8 Tuần Qua">
      {!loaded ? (
        <div style={{ padding: "24px", textAlign: "center", color: "#8a9bb5", fontSize: "0.85rem" }}>Đang tải...</div>
      ) : displayData.length === 0 ? (
        <div style={{ padding: "24px", textAlign: "center", color: "#8a9bb5", fontSize: "0.85rem" }}>Chưa có dữ liệu trong 8 tuần qua</div>
      ) : (
        <div className="safety-bar-chart">
          <div className="safety-bar-plot" aria-label="Biểu đồ vi phạm và sự cố 8 tuần qua">
            {displayData.map((item) => (
              <div className="safety-bar-group" key={item.label}>
                <span className="violation" style={{ "--bar-height": `${Math.max(8, (item.violations / maxValue) * 150)}px` } as CustomCssVars} />
                <span className="incident" style={{ "--bar-height": `${Math.max(4, (item.incidents / maxValue) * 150)}px` } as CustomCssVars} />
                <em>{item.label}</em>
              </div>
            ))}
          </div>
          <div className="safety-chart-legend">
            <span className="violation">Vi phạm</span>
            <span className="incident">Sự cố</span>
          </div>
          <div className={`safety-chart-note ${trendGood ? "good" : "watch"}`}>
            <TrendingUp size={14} />
            {trendNote}
          </div>
        </div>
      )}
    </SafetyInsightPanel>
  );
}

function SafetyIncidentCategoryPanel() {
  const curYear = new Date().getFullYear();
  const [data, setData] = useState<{ label: string; value: number; color: string }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/safety/incident-categories?year=${curYear}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(rows => { setData(rows); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const total = data.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const gradient = data.length > 0
    ? data.map((item) => {
        const start = cursor;
        const end = cursor + (item.value / Math.max(1, total)) * 100;
        cursor = end;
        return `${item.color} ${start}% ${end}%`;
      }).join(", ")
    : "#e2e8f0 0% 100%";

  return (
    <SafetyInsightPanel icon={PieChart} subtitle={total > 0 ? `Tổng ${total} sự cố từ đầu năm đến nay` : `Năm ${curYear}`} title={`Phân Loại Sự Cố - ${curYear}`}>
      {!loaded ? (
        <div style={{ padding: "24px", textAlign: "center", color: "#8a9bb5", fontSize: "0.85rem" }}>Đang tải...</div>
      ) : data.length === 0 ? (
        <div style={{ padding: "24px", textAlign: "center", color: "#8a9bb5", fontSize: "0.85rem" }}>Chưa có sự cố nào được ghi nhận năm {curYear}</div>
      ) : (
        <div className="safety-donut-wrap">
          <div className="safety-donut" style={{ "--donut-gradient": gradient } as CustomCssVars} aria-label="Phân loại sự cố" />
          <div className="safety-donut-legend">
            {data.map((item) => (
              <div key={item.label}>
                <span style={{ "--legend-color": item.color } as CustomCssVars} />
                <strong>{item.label}</strong>
                <em>{item.value}</em>
              </div>
            ))}
          </div>
        </div>
      )}
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

type ScoreEngineResult = {
  period: string;
  computedAt: string;
  company: {
    total: number;
    level: { label: string; tier: string; color: string };
    components: { sixS: number; daily: number; pccc: number; kyt: number; meeting: number; noBadEvent: number };
    deptsWithData: number;
    totalDepts: number;
  };
  departments: Array<{
    dept: string;
    total: number;
    level: { label: string; tier: string; color: string };
    components: { sixS: number; daily: number; pccc: number; kyt: number; meeting: number; noBadEvent: number };
    hasRealData: boolean;
  }>;
  meta: { weights: Record<string, number>; meetingHeld: boolean; kytScore: number; monthIncidentCount: number };
};

const SCORE_COMPONENT_LABELS: Record<string, string> = {
  sixS: "6S",
  daily: "Checklist h\u00e0ng ng\u00e0y",
  pccc: "PCCC",
  kyt: "KYT",
  meeting: "H\u1ecfp ATVSL\u0110",
  noBadEvent: "Kh\u00f4ng s\u1ef1 c\u1ed1",
};

const SCORE_WEIGHTS: Record<string, number> = {
  sixS: 35, daily: 25, pccc: 20, kyt: 10, meeting: 5, noBadEvent: 5,
};

function SafetyScoreEnginePanel() {
  const [data, setData] = useState<ScoreEngineResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));

  useEffect(() => {
    setLoading(true);
    fetch(`/api/safety/score-engine?period=${period}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((r: ScoreEngineResult) => setData(r))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }

  const comp = data?.company;
  const tierColor = comp?.level.color || "#64748b";
  const top5 = (data?.departments || []).filter(d => d.hasRealData).slice(0, 5);
  const bottom3 = (data?.departments || []).filter(d => d.hasRealData).slice(-3).reverse();

  return (
    <section className="sse-panel" aria-label="\u0110i\u1ec3m An To\u00e0n T\u1ed5ng H\u1ee3p">
      <div className="sse-header">
        <div className="sse-title-row">
          <Gauge size={20} />
          <h2>\u0110i\u1ec3m An To\u00e0n T\u1ed5ng H\u1ee3p</h2>
          <span className="sse-subtitle">Engine t\u00ednh to\u00e1n theo c\u00f4ng th\u1ee9c MapLogic \u00a75.1</span>
        </div>
        <select
          className="sse-period-select"
          value={period}
          onChange={e => setPeriod(e.target.value)}
        >
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="sse-loading">\u0110ang t\u00ednh \u0111i\u1ec3m...</div>
      ) : !data ? (
        <div className="sse-loading">Kh\u00f4ng th\u1ec3 t\u1ea3i d\u1eef li\u1ec7u \u0111i\u1ec3m an to\u00e0n.</div>
      ) : (
        <div className="sse-body">
          <div className="sse-company-score">
            <div className="sse-big-score" style={{ color: tierColor }}>
              {comp!.total}
              <span>/ 100</span>
            </div>
            <div className="sse-level-badge" style={{ background: tierColor }}>
              {comp!.level.label}
            </div>
            <div className="sse-depts-note">
              {comp!.deptsWithData}/{comp!.totalDepts} b\u1ed9 ph\u1eadn c\u00f3 d\u1eef li\u1ec7u th\u1ef1c
            </div>
          </div>

          <div className="sse-components">
            {Object.entries(comp!.components).map(([key, val]) => (
              <div className="sse-comp-row" key={key}>
                <span className="sse-comp-label">{SCORE_COMPONENT_LABELS[key] || key}</span>
                <div className="sse-comp-bar-wrap">
                  <div
                    className="sse-comp-bar"
                    style={{ width: `${val}%`, background: val >= 85 ? "#16a34a" : val >= 70 ? "#ca8a04" : "#dc2626" }}
                  />
                </div>
                <span className="sse-comp-val">{val}</span>
                <span className="sse-comp-weight">\u00d7{SCORE_WEIGHTS[key]}%</span>
              </div>
            ))}
          </div>

          <div className="sse-dept-cols">
            <div className="sse-dept-col">
              <div className="sse-dept-col-title good">
                <Trophy size={13} /> Top b\u1ed9 ph\u1eadn
              </div>
              {top5.map((d, i) => (
                <div className="sse-dept-row" key={d.dept}>
                  <span className="sse-dept-rank">{i + 1}</span>
                  <strong>{d.dept}</strong>
                  <span className="sse-dept-score" style={{ color: d.level.color }}>{d.total}</span>
                </div>
              ))}
            </div>
            <div className="sse-dept-col">
              <div className="sse-dept-col-title alert">
                <AlertTriangle size={13} /> C\u1ea7n c\u1ea3i thi\u1ec7n
              </div>
              {bottom3.map((d) => (
                <div className="sse-dept-row" key={d.dept}>
                  <strong>{d.dept}</strong>
                  <span className="sse-dept-score" style={{ color: d.level.color }}>{d.total}</span>
                </div>
              ))}
              {data.meta.monthIncidentCount > 0 && (
                <div className="sse-meta-note alert">
                  <AlertTriangle size={12} /> {data.meta.monthIncidentCount} s\u1ef1 c\u1ed1 trong k\u1ef3
                </div>
              )}
              {!data.meta.meetingHeld && (
                <div className="sse-meta-note watch">
                  Ch\u01b0a c\u00f3 h\u1ecfp ATVSL\u0110 th\u00e1ng n\u00e0y
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
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

type DeptScoreRow = {
  dept: string;
  total: number;
  level: { label: string; tier: string; color: string };
  components: { sixS: number; daily: number; pccc: number; kyt: number; meeting: number; noBadEvent: number };
  hasRealData: boolean;
};

type SortKey = "dept" | "total" | "sixS" | "daily" | "pccc" | "kyt";

function DepartmentScoreTable() {
  const [rows, setRows] = useState<DeptScoreRow[]>([]);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedDept, setExpandedDept] = useState<string | null>(null);

  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }

  useEffect(() => {
    setLoading(true);
    setExpandedDept(null);
    fetch(`/api/safety/score-engine/departments?period=${period}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data) => setRows(data.departments || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [period]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "dept"); }
  };

  const getVal = (row: DeptScoreRow, key: SortKey): number | string => {
    if (key === "dept") return row.dept;
    if (key === "total") return row.total;
    return row.components[key as keyof typeof row.components] ?? 0;
  };

  const sorted = [...rows].sort((a, b) => {
    const av = getVal(a, sortKey), bv = getVal(b, sortKey);
    if (typeof av === "string") return sortAsc ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
    return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const SortIcon = ({ k }: { k: SortKey }) => sortKey !== k ? null : (
    <span style={{ fontSize: "10px", marginLeft: 2 }}>{sortAsc ? "\u25b2" : "\u25bc"}</span>
  );

  const colStyle = (active: boolean): CSSProperties => ({
    cursor: "pointer", userSelect: "none",
    color: active ? "#0284c7" : undefined, fontWeight: active ? 700 : undefined,
  });

  const barColor = (v: number) => v >= 85 ? "#16a34a" : v >= 70 ? "#ca8a04" : "#dc2626";

  return (
    <section className="dst-panel">
      <div className="dst-header">
        <div className="dst-title-row">
          <Trophy size={18} />
          <h2>X\u1ebfp h\u1ea1ng \u0110i\u1ec3m An To\u00e0n - T\u1ea5t c\u1ea3 B\u1ed9 ph\u1eadn</h2>
          <span className="dst-subtitle">Drill-down theo 6 th\u00e0nh ph\u1ea7n \u00b7 MapLogic \u00a75.1</span>
        </div>
        <select className="dst-period-select" value={period} onChange={e => setPeriod(e.target.value)}>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="dst-loading">\u0110ang t\u00ednh \u0111i\u1ec3m b\u1ed9 ph\u1eadn...</div>
      ) : rows.length === 0 ? (
        <div className="dst-loading">Kh\u00f4ng c\u00f3 d\u1eef li\u1ec7u.</div>
      ) : (
        <div className="dst-scroll">
          <table className="dst-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th style={colStyle(sortKey === "dept")} onClick={() => handleSort("dept")}>
                  B\u1ed9 ph\u1eadn <SortIcon k="dept" />
                </th>
                <th style={colStyle(sortKey === "total")} onClick={() => handleSort("total")}>
                  T\u1ed5ng <SortIcon k="total" />
                </th>
                <th style={colStyle(sortKey === "sixS")} onClick={() => handleSort("sixS")}>
                  6S<span className="dst-weight">35%</span> <SortIcon k="sixS" />
                </th>
                <th style={colStyle(sortKey === "daily")} onClick={() => handleSort("daily")}>
                  Daily<span className="dst-weight">25%</span> <SortIcon k="daily" />
                </th>
                <th style={colStyle(sortKey === "pccc")} onClick={() => handleSort("pccc")}>
                  PCCC<span className="dst-weight">20%</span> <SortIcon k="pccc" />
                </th>
                <th style={colStyle(sortKey === "kyt")} onClick={() => handleSort("kyt")}>
                  KYT<span className="dst-weight">10%</span> <SortIcon k="kyt" />
                </th>
                <th>M\u1ee9c</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <>
                  <tr
                    key={row.dept}
                    className={`dst-row${!row.hasRealData ? " dst-row--est" : ""}${expandedDept === row.dept ? " dst-row--open" : ""}`}
                    onClick={() => setExpandedDept(expandedDept === row.dept ? null : row.dept)}
                  >
                    <td className="dst-rank">{i + 1}</td>
                    <td className="dst-dept-name">
                      <span>{row.dept}</span>
                      {!row.hasRealData && <em className="dst-est-tag">*\u01b0\u1edbc t\u00ednh</em>}
                    </td>
                    <td>
                      <span className="dst-total" style={{ color: row.level.color }}>{row.total}</span>
                    </td>
                    <td><div className="dst-mini-bar"><div style={{ width: `${row.components.sixS}%`, background: barColor(row.components.sixS) }} /><span>{row.components.sixS}</span></div></td>
                    <td><div className="dst-mini-bar"><div style={{ width: `${row.components.daily}%`, background: barColor(row.components.daily) }} /><span>{row.components.daily}</span></div></td>
                    <td><div className="dst-mini-bar"><div style={{ width: `${row.components.pccc}%`, background: barColor(row.components.pccc) }} /><span>{row.components.pccc}</span></div></td>
                    <td><div className="dst-mini-bar"><div style={{ width: `${row.components.kyt}%`, background: barColor(row.components.kyt) }} /><span>{row.components.kyt}</span></div></td>
                    <td><span className="dst-badge" style={{ background: row.level.color }}>{row.level.label}</span></td>
                  </tr>
                  {expandedDept === row.dept && (
                    <tr key={`${row.dept}-expand`} className="dst-expand-row">
                      <td colSpan={8}>
                        <div className="dst-expand-body">
                          {Object.entries(row.components).map(([key, val]) => (
                            <div className="dst-expand-item" key={key}>
                              <span>{SCORE_COMPONENT_LABELS[key] || key}</span>
                              <div className="dst-expand-bar-wrap">
                                <div className="dst-expand-bar" style={{ width: `${val}%`, background: barColor(val) }} />
                              </div>
                              <strong style={{ color: barColor(val) }}>{val}</strong>
                              <em>\u00d7{SCORE_WEIGHTS[key]}%</em>
                              <em className="dst-contrib">= {Math.round(val * (SCORE_WEIGHTS[key] || 0) / 100)} \u0111i\u1ec3m</em>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const ALL_DEPT_CODES = [
  "PE1","MP","MT","CM","WM","QA","GA","QC","CS","EHS",
  "OS","MR","RF","DB","DP1","DP2","OK1","OK2","SP1","EBM","ETR","MS1","SA","MS2",
];

const RADAR_AXES = [
  { key: "sixS",       label: "6S",      weight: 35 },
  { key: "daily",      label: "Daily",   weight: 25 },
  { key: "pccc",       label: "PCCC",    weight: 20 },
  { key: "kyt",        label: "KYT",     weight: 10 },
  { key: "meeting",    label: "Họp",     weight: 5  },
  { key: "noBadEvent", label: "An toàn", weight: 5  },
];

type RadarComponents = { sixS: number; daily: number; pccc: number; kyt: number; meeting: number; noBadEvent: number };

function radarPolygon(components: RadarComponents, cx: number, cy: number, r: number): string {
  const n = RADAR_AXES.length;
  return RADAR_AXES.map(({ key }, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const val = (components[key as keyof RadarComponents] ?? 0) / 100;
    const x = cx + r * val * Math.cos(angle);
    const y = cy + r * val * Math.sin(angle);
    return `${x},${y}`;
  }).join(" ");
}

function radarGrid(cx: number, cy: number, r: number, level: number): string {
  const n = RADAR_AXES.length;
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const x = cx + r * level * Math.cos(angle);
    const y = cy + r * level * Math.sin(angle);
    return `${x},${y}`;
  }).join(" ");
}

/** Returns "YYYY-MM" in local time to avoid UTC shift at month boundaries. */
function localYearMonth(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function DepartmentComparePanel() {
  const [deptA, setDeptA] = useState(ALL_DEPT_CODES[0]);
  const [deptB, setDeptB] = useState(ALL_DEPT_CODES[4]);
  const [period, setPeriod] = useState(() => localYearMonth(new Date()));
  const [allDepts, setAllDepts] = useState<DeptScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push(localYearMonth(d));
  }

  useEffect(() => {
    setLoading(true);
    setFetchError(false);
    fetch(`/api/safety/score-engine/departments?period=${period}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data) => { setAllDepts(data.departments || []); })
      .catch(() => { setFetchError(true); setAllDepts([]); })
      .finally(() => setLoading(false));
  }, [period]);

  const rowA = allDepts.find((d) => d.dept === deptA);
  const rowB = allDepts.find((d) => d.dept === deptB);
  const missingA = !loading && !fetchError && allDepts.length > 0 && !rowA;
  const missingB = !loading && !fetchError && allDepts.length > 0 && !rowB;

  const cx = 140, cy = 140, r = 110;
  const levels = [0.2, 0.4, 0.6, 0.8, 1.0];
  const COLOR_A = "#0284c7";
  const COLOR_B = "#f59e0b";

  return (
    <section className="dcp-panel">
      <div className="dcp-header">
        <div className="dcp-title-row">
          <BarChart3 size={18} />
          <h2>So Sánh Bộ Phận — Radar Chart</h2>
          <span className="dcp-subtitle">Chọn 2 bộ phận để so sánh chi tiết từng thành phần điểm</span>
        </div>
        <div className="dcp-controls">
          <select className="dcp-select dcp-select--a" value={deptA} onChange={e => setDeptA(e.target.value)}>
            {ALL_DEPT_CODES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="dcp-vs">VS</span>
          <select className="dcp-select dcp-select--b" value={deptB} onChange={e => setDeptB(e.target.value)}>
            {ALL_DEPT_CODES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="dcp-period" value={period} onChange={e => setPeriod(e.target.value)}>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="dcp-loading">Đang tải dữ liệu...</div>
      ) : fetchError ? (
        <div className="dcp-loading dcp-error">Không thể tải dữ liệu điểm. Vui lòng thử lại sau.</div>
      ) : allDepts.length === 0 ? (
        <div className="dcp-loading">Không có dữ liệu điểm cho tháng {period}.</div>
      ) : (
        <div className="dcp-body">
          {/* Missing-dept warnings */}
          {(missingA || missingB) && (
            <div className="dcp-missing-warn">
              {missingA && <span>{deptA}: không có điểm trong tháng {period}</span>}
              {missingB && <span>{deptB}: không có điểm trong tháng {period}</span>}
            </div>
          )}
          <div className="dcp-radar-wrap">
            <svg viewBox="0 0 280 280" className="dcp-radar-svg" role="img" aria-label="Radar chart so sánh bộ phận">
              {levels.map((lv) => (
                <polygon
                  key={lv}
                  points={radarGrid(cx, cy, r, lv)}
                  fill="none"
                  stroke={lv === 1 ? "#cbd5e1" : "#e2e8f0"}
                  strokeWidth={lv === 1 ? 1.5 : 1}
                />
              ))}
              {RADAR_AXES.map((_, i) => {
                const n = RADAR_AXES.length;
                const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
                return (
                  <line key={i} x1={cx} y1={cy}
                    x2={cx + r * Math.cos(angle)}
                    y2={cy + r * Math.sin(angle)}
                    stroke="#e2e8f0" strokeWidth="1"
                  />
                );
              })}
              {RADAR_AXES.map(({ label }, i) => {
                const n = RADAR_AXES.length;
                const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
                const lx = cx + (r + 20) * Math.cos(angle);
                const ly = cy + (r + 20) * Math.sin(angle);
                const anchor = Math.abs(Math.cos(angle)) < 0.1 ? "middle" : Math.cos(angle) > 0 ? "start" : "end";
                return (
                  <text key={label} x={lx} y={ly + 4}
                    textAnchor={anchor as "start" | "middle" | "end"}
                    fontSize="11" fill="#64748b" fontWeight="600">
                    {label}
                  </text>
                );
              })}
              {rowA && (
                <polygon
                  points={radarPolygon(rowA.components, cx, cy, r)}
                  fill={COLOR_A} fillOpacity="0.18"
                  stroke={COLOR_A} strokeWidth="2.5"
                />
              )}
              {rowB && (
                <polygon
                  points={radarPolygon(rowB.components, cx, cy, r)}
                  fill={COLOR_B} fillOpacity="0.18"
                  stroke={COLOR_B} strokeWidth="2.5"
                />
              )}
              {[0.4, 0.6, 0.8, 1.0].map((lv) => {
                const angle = -Math.PI / 2;
                const lx = cx + r * lv * Math.cos(angle) + 3;
                const ly = cy + r * lv * Math.sin(angle) - 3;
                return <text key={lv} x={lx} y={ly} fontSize="9" fill="#94a3b8">{Math.round(lv * 100)}</text>;
              })}
            </svg>
            <div className="dcp-legend">
              <span style={{ color: COLOR_A }}><em style={{ background: COLOR_A }} />{deptA}</span>
              <span style={{ color: COLOR_B }}><em style={{ background: COLOR_B }} />{deptB}</span>
            </div>
          </div>

          <div className="dcp-table">
            <div className="dcp-table-head">
              <span>Thành phần</span>
              <span style={{ color: COLOR_A }}>{deptA}</span>
              <span style={{ color: COLOR_B }}>{deptB}</span>
              <span>Hơn</span>
            </div>
            {RADAR_AXES.map(({ key, label, weight }) => {
              const va = rowA ? rowA.components[key as keyof RadarComponents] : null;
              const vb = rowB ? rowB.components[key as keyof RadarComponents] : null;
              const canDiff = va !== null && vb !== null;
              const diff = canDiff ? (va as number) - (vb as number) : null;
              return (
                <div className="dcp-table-row" key={key}>
                  <span className="dcp-axis-label">
                    {label}<em>×{weight}%</em>
                  </span>
                  <div className="dcp-bar-pair">
                    {va !== null
                      ? <><div className="dcp-bar" style={{ width: `${va}%`, background: COLOR_A }} /><span style={{ color: COLOR_A }}>{va}</span></>
                      : <span className="dcp-nodata">–</span>}
                  </div>
                  <div className="dcp-bar-pair">
                    {vb !== null
                      ? <><div className="dcp-bar" style={{ width: `${vb}%`, background: COLOR_B }} /><span style={{ color: COLOR_B }}>{vb}</span></>
                      : <span className="dcp-nodata">–</span>}
                  </div>
                  <span className={"dcp-diff " + (diff === null ? "zero" : diff > 0 ? "pos" : diff < 0 ? "neg" : "zero")}>
                    {diff === null ? "–" : diff > 0 ? "+" + diff : diff < 0 ? String(diff) : "–"}
                  </span>
                </div>
              );
            })}
            <div className="dcp-table-total">
              <span>Tổng điểm</span>
              <span style={{ color: rowA?.level.color }}>{rowA?.total ?? "–"}</span>
              <span style={{ color: rowB?.level.color }}>{rowB?.total ?? "–"}</span>
              <span className={"dcp-diff " + (rowA && rowB
                ? rowA.total > rowB.total ? "pos" : rowA.total < rowB.total ? "neg" : "zero"
                : "zero")}>
                {rowA && rowB
                  ? rowA.total - rowB.total > 0 ? "+" + (rowA.total - rowB.total)
                    : rowA.total === rowB.total ? "–"
                    : String(rowA.total - rowB.total)
                  : "–"}
              </span>
            </div>
          </div>
        </div>
      )}
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
  const [showBulletinCreate, setShowBulletinCreate] = useState(false);

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

      <SafetyScoreEnginePanel />

      <DepartmentScoreTable />

      <DepartmentComparePanel />

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

      {(selectedBulletin || (selectedFeedKey === "latestNotices" && allBulletins[0])) && !showBulletinCreate ? (
        <SafetyBulletinViewModal
          bulletins={allBulletins}
          initialId={(selectedBulletin || allBulletins[0])?.id}
          onClose={() => {
            setSelectedBulletin(null);
            if (selectedFeedKey === "latestNotices") setSelectedFeedKey(null);
          }}
          onCreateNew={() => setShowBulletinCreate(true)}
        />
      ) : null}

      {showBulletinCreate ? (
        <SafetyBulletinCreateModal
          onClose={() => setShowBulletinCreate(false)}
          onSaved={(b: any) => { updateBulletin(b as SafetyBulletin); setShowBulletinCreate(false); }}
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
