import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  Info,
  ListFilter,
  Megaphone,
  Search,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { BulletinPointTone } from "./bulletinPointView";
import { buildBulletinPointView, truncateBulletinText } from "./bulletinPointView";
import { Button } from "./ui";
import { getText } from "../i18n";
import type { LocalizedTextValue } from "../i18n";
import type { HubDepartment, SafetyAction, SafetyBulletin } from "../core/hubCore";
import type { HubLanguage, HubTranslate } from "../i18n-context";
import { api } from "../services/api";
import type { DocumentRecord } from "../services/api";
import { getDocumentDisplayTitle } from "../utils/documentDisplay";
import "./FeedDetailModal.css";

type BulletinLevel = "alert" | "good" | "watch";
type ActionLevel = "good" | "high" | "low" | "medium";
type FeedKind = "actions" | "bulletins" | "documents";
type FeedLevel = ActionLevel | BulletinLevel;
type FilterLevel = "all" | FeedLevel;
type FeedItem = DocumentRecord | SafetyAction | SafetyBulletin;

export type FeedDetail = {
  description?: string;
  items?: FeedItem[];
  kind?: FeedKind | string;
  title?: ReactNode;
  tone?: string;
};

type FeedDetailModalProps = {
  departments?: HubDepartment[];
  feed?: FeedDetail | null;
  lang: HubLanguage;
  onClose?: () => void;
  onOpenBulletin?: (bulletin: SafetyBulletin) => void;
  t: HubTranslate;
};

type FeedLabels = ReturnType<typeof buildFeedDetailLabels>;
type FilterOption = {
  count: number;
  id: FilterLevel;
  label: string;
};
type EnrichedFeedEntry = {
  item: FeedItem;
  level: FeedLevel;
  originalIndex: number;
  priority: number;
  searchText: string;
};
type FeedStatIcon = "departments" | "documents" | "important" | "showing" | "total";
type FeedStat = {
  icon: FeedStatIcon;
  label: string;
  value: number;
};
type ActionBoardView = "detail" | "list" | "overview";
type DocumentBoardView = "detail" | "list" | "overview";

const bulletinLevelOrder: BulletinLevel[] = ["alert", "watch", "good"];
const actionLevelOrder: ActionLevel[] = ["high", "medium", "low", "good"];

function buildFeedDetailLabels(t: HubTranslate) {
  return {
    close: t("close"),
    empty: t("noData"),
    noMatches: t("feedNoMatches"),
    headerEyebrow: t("feedHeaderEyebrow"),
    openDetail: t("feedOpenDetail"),
    scope: t("feedScope"),
    date: t("date"),
    department: t("department"),
    due: t("dueDate"),
    version: t("version"),
    viewOnWeb: t("viewOnWeb"),
    download: t("download"),
    searchPlaceholder: t("feedSearchPlaceholder"),
    filters: t("feedFilters"),
    all: t("all"),
    total: t("feedTotal"),
    showing: t("feedShowing"),
    important: t("feedImportant"),
    departments: t("departments"),
    documents: t("documents"),
    pointCount: t("feedPointCount"),
    pointToneLabels: {
      critical: t("feedPointToneCritical"),
      warning: t("feedPointToneWarning"),
      good: t("feedPointToneGood"),
      info: t("feedPointToneInfo")
    },
    levels: {
      high: t("feedLevelHigh"),
      medium: t("feedLevelMedium"),
      low: t("feedLevelLow"),
      good: t("feedLevelGood"),
      watch: t("feedLevelWatch"),
      alert: t("feedLevelAlert")
    }
  };
}

const bulletinPointToneMeta: Record<BulletinPointTone, { Icon: LucideIcon }> = {
  critical: { Icon: AlertTriangle },
  warning: { Icon: Clock3 },
  good: { Icon: CheckCircle2 },
  info: { Icon: Info }
};

const statIconMap: Record<FeedStatIcon, LucideIcon> = {
  total: FileText,
  showing: Eye,
  documents: FileText,
  important: AlertTriangle,
  departments: Building2
};

const normalizeFeedKind = (kind: unknown): FeedKind =>
  kind === "bulletins" || kind === "actions" || kind === "documents" ? kind : "documents";

const normalizeTone = (tone: unknown): BulletinLevel => (
  tone === "good" || tone === "watch" || tone === "alert" ? tone : "watch"
);
const normalizeSeverity = (severity: unknown): ActionLevel => (
  severity === "high" ? "high" : severity === "medium" ? "medium" : severity === "low" ? "low" : "good"
);

function AccentTitle({ title }: { title?: ReactNode }) {
  const text = String(title || "");
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return <>{text}</>;

  const accent = parts.pop();
  return (
    <>
      {parts.join(" ")} <span>{accent}</span>
    </>
  );
}

function levelIcon(level: FeedLevel): LucideIcon {
  if (level === "alert" || level === "high") return AlertTriangle;
  if (level === "watch" || level === "medium" || level === "low") return Clock3;
  return CheckCircle2;
}

function findDepartment(departments: HubDepartment[], id: unknown): HubDepartment | undefined {
  return departments.find((department) => department.id === id);
}

function textValue(value: LocalizedTextValue, lang: HubLanguage): string {
  const text = getText(value, lang);
  if (Array.isArray(text)) return text.join(" ");
  return String(text || "");
}

function itemLevel(kind: FeedKind, item: FeedItem): FeedLevel {
  if (kind === "bulletins") return normalizeTone((item as SafetyBulletin).tone);
  if (kind === "actions") return normalizeSeverity((item as SafetyAction).severity);
  return "good";
}

function levelPriority(kind: FeedKind, level: FeedLevel): number {
  const order = kind === "bulletins" ? bulletinLevelOrder : kind === "actions" ? actionLevelOrder : ["good"];
  const index = order.indexOf(level);
  return index === -1 ? order.length : index;
}

function departmentIdForItem(item: FeedItem): string | undefined {
  const departmentId = "departmentId" in item ? item.departmentId : undefined;
  return typeof departmentId === "string" ? departmentId : undefined;
}

function itemSearchText(
  kind: FeedKind,
  item: FeedItem,
  departments: HubDepartment[],
  lang: HubLanguage,
  t: HubTranslate
): string {
  if (kind === "bulletins") {
    const bulletin = item as SafetyBulletin;
    return [
      textValue(bulletin.title, lang),
      textValue(bulletin.summary, lang),
      textValue(bulletin.points, lang),
      textValue(bulletin.audience, lang),
      bulletin.date
    ].join(" ");
  }

  if (kind === "actions") {
    const action = item as SafetyAction;
    const department = findDepartment(departments, action.departmentId);
    return [
      textValue(action.title, lang),
      department ? textValue(department.name, lang) : "",
      action.due,
      action.severity
    ].join(" ");
  }

  const document = item as DocumentRecord;
  const department = findDepartment(departments, document.departmentId);
  return [
    document.title,
    department ? textValue(department.name, lang) : t("companyLevel"),
    document.version,
    document.originalName,
    document.fileName
  ].join(" ");
}

function levelOptions(kind: FeedKind, enrichedItems: EnrichedFeedEntry[], labels: FeedLabels): FilterOption[] {
  if (kind === "documents") return [];

  const counts = enrichedItems.reduce<Partial<Record<FeedLevel, number>>>((acc, entry) => {
    acc[entry.level] = (acc[entry.level] || 0) + 1;
    return acc;
  }, {});
  const order = kind === "bulletins" ? bulletinLevelOrder : actionLevelOrder;

  return [
    { id: "all", label: labels.all, count: enrichedItems.length },
    ...order
      .filter((level) => counts[level])
      .map((level) => ({ id: level, label: labels.levels[level] || level, count: counts[level] }))
  ];
}

function statsForFeed(
  kind: FeedKind,
  items: FeedItem[],
  filteredCount: number,
  departments: HubDepartment[],
  labels: FeedLabels
): FeedStat[] {
  const importantCount = items.filter((item) => {
    const level = itemLevel(kind, item);
    return level === "alert" || level === "high";
  }).length;
  const departmentCount = new Set(
    items
      .map((item) => departmentIdForItem(item))
      .filter(Boolean)
  ).size;

  const stats: FeedStat[] = [
    { icon: "total", label: labels.total, value: items.length },
    { icon: "showing", label: labels.showing, value: filteredCount }
  ];

  if (kind === "documents") {
    stats.push({ icon: "documents", label: labels.documents, value: items.length });
  } else {
    stats.push({ icon: "important", label: labels.important, value: importantCount });
  }

  if (departmentCount) {
    stats.push({ icon: "departments", label: labels.departments, value: departmentCount });
  } else if (kind === "actions") {
    stats.push({ icon: "departments", label: labels.departments, value: departments.length });
  }

  return stats;
}

function BulletinRow({
  bulletin,
  lang,
  labels,
  onOpenBulletin,
  t
}: {
  bulletin: SafetyBulletin;
  labels: FeedLabels;
  lang: HubLanguage;
  onOpenBulletin?: (bulletin: SafetyBulletin) => void;
  t: HubTranslate;
}) {
  const tone = normalizeTone(bulletin.tone);
  const title = getText(bulletin.title, lang);
  const summary = getText(bulletin.summary, lang);
  const audience = getText(bulletin.audience, lang) || t("companyLevel");
  const rawPoints = getText(bulletin.points, lang);
  const points = Array.isArray(rawPoints) ? rawPoints : [];
  const pointViews = points.map((point, index) => buildBulletinPointView(point, index)).slice(0, 5);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpenBulletin?.(bulletin);
  };

  return (
    <article
      className={`feed-detail-row feed-detail-row-button ${tone}`}
      onClick={() => onOpenBulletin?.(bulletin)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <span className={`feed-detail-row-icon ${tone}`} aria-hidden="true">
        {(() => {
          const Icon = levelIcon(tone);
          return <Icon size={18} />;
        })()}
      </span>
      <div className="feed-detail-row-main">
        <div className="feed-detail-row-title">
          <strong>{title}</strong>
          <div className="feed-detail-row-title-actions">
            <span className={`feed-detail-level ${tone}`}>{labels.levels[tone]}</span>
            <span className="feed-detail-open-cue">
              <Eye size={13} />
              {labels.openDetail}
            </span>
          </div>
        </div>
        <div className="feed-detail-meta">
          <span>
            <Building2 size={14} />
            {labels.scope}: {audience}
          </span>
          {bulletin.date ? (
            <span>
              <CalendarDays size={14} />
              {labels.date}: {bulletin.date}
            </span>
          ) : null}
          {points.length ? (
            <span>
              <ListFilter size={14} />
              {points.length} {labels.pointCount}
            </span>
          ) : null}
        </div>
        {summary ? <p className="feed-detail-summary">{truncateBulletinText(summary, 220)}</p> : null}
        {pointViews.length ? (
          <ol className="feed-detail-points feed-detail-points-structured">
            {pointViews.map((point) => {
              const toneMeta = bulletinPointToneMeta[point.tone] || bulletinPointToneMeta.info;
              const ToneIcon = toneMeta.Icon;
              const toneLabel = labels.pointToneLabels?.[point.tone] || point.tone;
              return (
                <li className={`feed-detail-point ${point.tone}`} key={`${point.number}-${point.body}`}>
                  <span className="feed-detail-point-index">{point.number}</span>
                  <div>
                    <strong>{point.label || truncateBulletinText(point.body, 54)}</strong>
                    <span>{point.label ? truncateBulletinText(point.body, 168) : truncateBulletinText(point.body, 190)}</span>
                  </div>
                  <em aria-label={toneLabel}>
                    <ToneIcon size={13} />
                    {toneLabel}
                  </em>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </article>
  );
}

function ActionRow({
  action,
  departments,
  lang,
  labels
}: {
  action: SafetyAction;
  departments: HubDepartment[];
  labels: FeedLabels;
  lang: HubLanguage;
}) {
  const severity = normalizeSeverity(action.severity);
  const department = findDepartment(departments, action.departmentId);
  const departmentName = department ? getText(department.name, lang) : "";
  const Icon = levelIcon(severity);

  return (
    <article className={`feed-detail-row action ${severity}`}>
      <span className={`feed-detail-row-icon ${severity}`} aria-hidden="true">
        <Icon size={18} />
      </span>
      <div className="feed-detail-row-main">
        <div className="feed-detail-row-title">
          <strong>{getText(action.title, lang)}</strong>
          <span className={`feed-detail-level ${severity}`}>{labels.levels[severity]}</span>
        </div>
        <div className="feed-detail-meta">
          {department ? (
            <Link to={`/safety-6s/departments/${department.id}`}>
              <Building2 size={14} />
              {labels.department}: {departmentName}
            </Link>
          ) : null}
          {action.due ? (
            <span>
              <CalendarDays size={14} />
              {labels.due}: {action.due}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function actionCode(action: SafetyAction, index: number): string {
  const rawCode = typeof action.code === "string" ? action.code : "";
  return rawCode || `AT6S-${String(index + 1).padStart(3, "0")}`;
}

function actionStatus(action: SafetyAction): "closed" | "done" | "open" {
  const rawStatus = typeof action.status === "string" ? action.status : "";
  if (["closed", "verified"].includes(rawStatus)) return "closed";
  if (["done", "done_by_owner", "resolved"].includes(rawStatus)) return "done";
  return "open";
}

function actionStatusLabel(status: ReturnType<typeof actionStatus>): string {
  if (status === "closed") return "Đã đóng";
  if (status === "done") return "Đã khắc phục";
  return "Đang xử lý";
}

function actionUpdatedAt(action: SafetyAction): string {
  const rawUpdatedAt = typeof action.updatedAt === "string" ? action.updatedAt : "";
  const rawCreatedAt = typeof action.createdAt === "string" ? action.createdAt : "";
  const value = rawUpdatedAt || rawCreatedAt || action.due || "";
  if (!value) return "-";
  if (value.includes("T")) {
    const [datePart, timePart = ""] = value.split("T");
    const time = timePart.slice(0, 5);
    return time ? `${time}, ${datePart}` : datePart;
  }
  return value;
}

function ActionBoard({
  activeLevel,
  departments,
  entries,
  filterOptions,
  lang,
  labels,
  onLevelChange,
  onQueryChange,
  query,
  searchInputRef,
  title
}: {
  activeLevel: FilterLevel;
  departments: HubDepartment[];
  entries: EnrichedFeedEntry[];
  filterOptions: FilterOption[];
  labels: FeedLabels;
  lang: HubLanguage;
  onLevelChange: (level: FilterLevel) => void;
  onQueryChange: (value: string) => void;
  query: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  title?: ReactNode;
}) {
  const actionEntries = entries.filter((entry): entry is EnrichedFeedEntry & { item: SafetyAction } => true);
  const highCount = actionEntries.filter((entry) => entry.level === "high").length;
  const watchCount = actionEntries.filter((entry) => entry.level === "medium" || entry.level === "low").length;
  const normalCount = Math.max(0, actionEntries.length - highCount - watchCount);

  return (
    <div className="feed-action-board">
      <div className="feed-action-alert">
        <span aria-hidden="true">
          <AlertTriangle size={26} />
        </span>
        <div>
          <strong>Thông báo nóng cần xử lý trong ngày</strong>
          <p>{highCount} mục ưu tiên cao · {watchCount} mục cần theo dõi · Yêu cầu phổ biến tới toàn bộ CBCNV</p>
        </div>
      </div>

      <div className="feed-action-stepper" aria-label="Luồng xem việc cần xử lý">
        <span className="active"><b>1</b> Tổng quan nhóm</span>
        <i aria-hidden="true" />
        <span className="active"><b>2</b> Danh sách mục</span>
        <i aria-hidden="true" />
        <span><b>3</b> Chi tiết mục</span>
      </div>

      <div className="feed-action-list-head">
        <span className="feed-action-group-icon" aria-hidden="true">
          <AlertTriangle size={25} />
        </span>
        <div>
          <h3>{title || "Cảnh báo nóng"}</h3>
          <p>{actionEntries.length} mục · {highCount} ưu tiên cao · cập nhật 08:10</p>
        </div>
        <label className="feed-action-search">
          <Search size={16} />
          <input
            aria-label={labels.searchPlaceholder}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={labels.searchPlaceholder}
            ref={searchInputRef}
            type="search"
            value={query}
          />
        </label>
        <button className="feed-action-export" type="button">
          <Download size={16} />
          Xuất danh sách
        </button>
      </div>

      <div className="feed-action-filter-pills" aria-label={labels.filters}>
        {filterOptions.map((option) => (
          <button
            className={`${option.id === activeLevel ? "active" : ""} ${option.id === "high" || option.id === "alert" ? "critical" : option.id === "medium" || option.id === "low" || option.id === "watch" ? "warning" : option.id === "good" ? "good" : ""}`}
            key={option.id}
            onClick={() => onLevelChange(option.id)}
            type="button"
          >
            {option.label} ({option.count})
          </button>
        ))}
        {!filterOptions.length ? (
          <>
            <button className="active" type="button">Tất cả ({actionEntries.length})</button>
            <button className="critical" type="button">Ưu tiên cao ({highCount})</button>
            <button className="warning" type="button">Cần theo dõi ({watchCount})</button>
            <button className="good" type="button">Bình thường ({normalCount})</button>
          </>
        ) : null}
      </div>

      <div className="feed-action-table" role="table" aria-label="Danh sách việc cần xử lý">
        <div className="feed-action-table-row head" role="row">
          <span role="columnheader">Mã mục</span>
          <span role="columnheader">Tiêu đề</span>
          <span role="columnheader">Mức độ</span>
          <span role="columnheader">Trạng thái</span>
          <span role="columnheader">Cập nhật</span>
          <span role="columnheader">Thao tác</span>
        </div>
        {actionEntries.map((entry, rowIndex) => {
          const action = entry.item;
          const severity = normalizeSeverity(action.severity);
          const department = findDepartment(departments, action.departmentId);
          const departmentName = department ? getText(department.name, lang) : "";
          const status = actionStatus(action);
          return (
            <article className="feed-action-table-row" key={action.id} role="row">
              <span className="feed-action-code" role="cell">{actionCode(action, rowIndex)}</span>
              <span className="feed-action-title-cell" role="cell">
                <strong>{getText(action.title, lang)}</strong>
                <small>{departmentName || "Tất cả bộ phận"}</small>
              </span>
              <span role="cell">
                <em className={`feed-action-pill ${severity}`}>
                  {severity === "high" ? <AlertTriangle size={13} /> : severity === "good" ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
                  {labels.levels[severity]}
                </em>
              </span>
              <span role="cell">
                <em className={`feed-action-pill status ${status}`}>
                  {status === "open" ? <Clock3 size={13} /> : <CheckCircle2 size={13} />}
                  {actionStatusLabel(status)}
                </em>
              </span>
              <span className="feed-action-date" role="cell">{actionUpdatedAt(action)}</span>
              <span className="feed-action-open" role="cell" aria-label={labels.openDetail}>
                <Eye size={17} />
              </span>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ActionBoardV2({
  activeLevel,
  departments,
  entries,
  filterOptions,
  lang,
  labels,
  onLevelChange,
  onQueryChange,
  query,
  searchInputRef,
  title
}: {
  activeLevel: FilterLevel;
  departments: HubDepartment[];
  entries: EnrichedFeedEntry[];
  filterOptions: FilterOption[];
  labels: FeedLabels;
  lang: HubLanguage;
  onLevelChange: (level: FilterLevel) => void;
  onQueryChange: (value: string) => void;
  query: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  title?: ReactNode;
}) {
  const actionEntries = entries.filter((entry): entry is EnrichedFeedEntry & { item: SafetyAction } => true);
  const highCount = actionEntries.filter((entry) => entry.level === "high").length;
  const watchCount = actionEntries.filter((entry) => entry.level === "medium" || entry.level === "low").length;
  const normalCount = Math.max(0, actionEntries.length - highCount - watchCount);
  const [activeView, setActiveView] = useState<ActionBoardView>("overview");
  const [selectedActionId, setSelectedActionId] = useState(actionEntries[0]?.item.id || "");
  const selectedEntry = actionEntries.find((entry) => entry.item.id === selectedActionId) || actionEntries[0] || null;
  const selectedAction = selectedEntry?.item || null;
  const selectedSeverity = selectedAction ? normalizeSeverity(selectedAction.severity) : "good";
  const selectedDepartment = selectedAction ? findDepartment(departments, selectedAction.departmentId) : undefined;
  const selectedStatus = selectedAction ? actionStatus(selectedAction) : "open";

  const openList = (level: FilterLevel = "all") => {
    onLevelChange(level);
    setActiveView("list");
  };
  const openDetail = (action: SafetyAction) => {
    setSelectedActionId(action.id);
    setActiveView("detail");
  };

  return (
    <div className="feed-action-board">
      <div className="feed-action-alert">
        <span aria-hidden="true"><AlertTriangle size={26} /></span>
        <div>
          <strong>Thông báo nóng cần xử lý trong ngày</strong>
          <p>{highCount} mục ưu tiên cao · {watchCount} mục cần theo dõi · Yêu cầu phổ biến tới toàn bộ CBCNV</p>
        </div>
      </div>

      <div className="feed-action-stepper" aria-label="Luồng xem việc cần xử lý" role="tablist">
        <button className={activeView === "overview" ? "active" : ""} onClick={() => setActiveView("overview")} type="button"><b>1</b> Tổng quan nhóm</button>
        <i aria-hidden="true" />
        <button className={activeView === "list" ? "active" : ""} onClick={() => setActiveView("list")} type="button"><b>2</b> Danh sách mục</button>
        <i aria-hidden="true" />
        <button className={activeView === "detail" ? "active" : ""} disabled={!selectedAction} onClick={() => selectedAction && setActiveView("detail")} type="button"><b>3</b> Chi tiết mục</button>
      </div>

      {activeView === "overview" ? (
        <div className="feed-action-overview">
          <div className="feed-action-overview-stats">
            <button onClick={() => openList("all")} type="button"><span><FileText size={24} /></span><small>Tổng số mục</small><strong>{actionEntries.length}</strong></button>
            <button className="critical" onClick={() => openList("high")} type="button"><span><AlertTriangle size={24} /></span><small>Ưu tiên cao</small><strong>{highCount}</strong></button>
            <button className="warning" onClick={() => openList("medium")} type="button"><span><Clock3 size={24} /></span><small>Cần theo dõi</small><strong>{watchCount}</strong></button>
            <button className="good" onClick={() => openList("good")} type="button"><span><CheckCircle2 size={24} /></span><small>Bình thường</small><strong>{normalCount}</strong></button>
          </div>
          <div className="feed-action-overview-groups">
            <button className="critical" onClick={() => openList("high")} type="button"><span><AlertTriangle size={28} /></span><strong>Mục ưu tiên cao</strong><small>Cần xử lý sớm, theo dõi tiến độ hằng ngày.</small><em>{highCount} mục</em></button>
            <button className="warning" onClick={() => openList("medium")} type="button"><span><Clock3 size={28} /></span><strong>Danh sách cần theo dõi</strong><small>Các việc đang mở hoặc sắp đến hạn.</small><em>{watchCount} mục</em></button>
            <button className="good" onClick={() => openList("good")} type="button"><span><CheckCircle2 size={28} /></span><strong>Mục bình thường</strong><small>Các việc đã ổn định hoặc không phân loại cao.</small><em>{normalCount} mục</em></button>
          </div>
        </div>
      ) : null}

      {activeView === "list" ? (
        <>
          <div className="feed-action-list-head">
            <span className="feed-action-group-icon" aria-hidden="true"><AlertTriangle size={25} /></span>
            <div>
              <h3>{title || "Cảnh báo nóng"}</h3>
              <p>{actionEntries.length} mục · {highCount} ưu tiên cao · cập nhật 08:10</p>
            </div>
            <label className="feed-action-search">
              <Search size={16} />
              <input aria-label={labels.searchPlaceholder} onChange={(event) => onQueryChange(event.target.value)} placeholder={labels.searchPlaceholder} ref={searchInputRef} type="search" value={query} />
            </label>
            <button className="feed-action-export" type="button"><Download size={16} />Xuất danh sách</button>
          </div>

          <div className="feed-action-filter-pills" aria-label={labels.filters}>
            {filterOptions.map((option) => (
              <button
                className={`${option.id === activeLevel ? "active" : ""} ${option.id === "high" || option.id === "alert" ? "critical" : option.id === "medium" || option.id === "low" || option.id === "watch" ? "warning" : option.id === "good" ? "good" : ""}`}
                key={option.id}
                onClick={() => onLevelChange(option.id)}
                type="button"
              >
                {option.label} ({option.count})
              </button>
            ))}
          </div>

          <div className="feed-action-table" role="table" aria-label="Danh sách việc cần xử lý">
            <div className="feed-action-table-row head" role="row">
              <span role="columnheader">Mã mục</span>
              <span role="columnheader">Tiêu đề</span>
              <span role="columnheader">Mức độ</span>
              <span role="columnheader">Trạng thái</span>
              <span role="columnheader">Cập nhật</span>
              <span role="columnheader">Thao tác</span>
            </div>
            {actionEntries.map((entry, rowIndex) => {
              const action = entry.item;
              const severity = normalizeSeverity(action.severity);
              const department = findDepartment(departments, action.departmentId);
              const departmentName = department ? getText(department.name, lang) : "";
              const status = actionStatus(action);
              return (
                <button className="feed-action-table-row" key={action.id} onClick={() => openDetail(action)} role="row" type="button">
                  <span className="feed-action-code" role="cell">{actionCode(action, rowIndex)}</span>
                  <span className="feed-action-title-cell" role="cell"><strong>{getText(action.title, lang)}</strong><small>{departmentName || "Tất cả bộ phận"}</small></span>
                  <span role="cell"><em className={`feed-action-pill ${severity}`}>{severity === "high" ? <AlertTriangle size={13} /> : severity === "good" ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}{labels.levels[severity]}</em></span>
                  <span role="cell"><em className={`feed-action-pill status ${status}`}>{status === "open" ? <Clock3 size={13} /> : <CheckCircle2 size={13} />}{actionStatusLabel(status)}</em></span>
                  <span className="feed-action-date" role="cell">{actionUpdatedAt(action)}</span>
                  <span className="feed-action-open" role="cell" aria-label={labels.openDetail}><Eye size={17} /></span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {activeView === "detail" && selectedAction ? (
        <article className={`feed-action-detail ${selectedSeverity}`}>
          <div className="feed-action-detail-title">
            <small>{actionCode(selectedAction, Math.max(0, actionEntries.findIndex((entry) => entry.item.id === selectedAction.id)))}</small>
            <h3>{getText(selectedAction.title, lang)}</h3>
            <div>
              <em className={`feed-action-pill ${selectedSeverity}`}>{selectedSeverity === "high" ? <AlertTriangle size={13} /> : <Clock3 size={13} />}{labels.levels[selectedSeverity]}</em>
              <em className={`feed-action-pill status ${selectedStatus}`}>{selectedStatus === "open" ? <Clock3 size={13} /> : <CheckCircle2 size={13} />}{actionStatusLabel(selectedStatus)}</em>
            </div>
          </div>
          <div className="feed-action-detail-grid">
            <section className="feed-action-info-card">
              <h4>Thông tin chung</h4>
              <p><Building2 size={15} /><span>Bộ phận</span><strong>{selectedDepartment ? getText(selectedDepartment.name, lang) : "Tất cả bộ phận"}</strong></p>
              <p><CalendarDays size={15} /><span>Hạn xử lý</span><strong>{selectedAction.due || "-"}</strong></p>
              <p><Clock3 size={15} /><span>Cập nhật</span><strong>{actionUpdatedAt(selectedAction)}</strong></p>
              <p><Info size={15} /><span>Trạng thái</span><strong>{actionStatusLabel(selectedStatus)}</strong></p>
            </section>
            <section className="feed-action-detail-content">
              <h4>1. Mô tả chi tiết</h4>
              <p>{typeof selectedAction.description === "string" ? selectedAction.description : getText(selectedAction.title, lang)}</p>
              <h4>2. Hành động đã thực hiện</h4>
              <ul>
                <li>Đã ghi nhận và phân loại mức độ ưu tiên.</li>
                <li>Đã giao bộ phận phụ trách theo dõi.</li>
                <li>Đang theo dõi hạn hoàn thành trong bảng cảnh báo.</li>
              </ul>
              <h4>3. Hành động tiếp theo</h4>
              <ul className="pending">
                <li>Cập nhật kết quả thực hiện trước hạn.</li>
                <li>Xác nhận bằng chứng và đóng mục khi hoàn tất.</li>
              </ul>
              <div className="feed-action-note"><AlertTriangle size={16} />Lưu ý: Mục này cần được theo dõi sát và báo cáo tiến độ đúng hạn.</div>
            </section>
          </div>
        </article>
      ) : null}
    </div>
  );
}

function documentUpdatedAt(document: DocumentRecord): string {
  const value = document.updatedAt || document.uploadedAt || document.createdAt;
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return date.toLocaleDateString("vi-VN");
}

function documentCategory(document: DocumentRecord): string {
  const raw = typeof document.category === "string" ? document.category.trim() : "";
  return raw || "Tài liệu";
}

function documentSize(document: DocumentRecord): string {
  const size = typeof document.size === "number" ? document.size : 0;
  if (!size) return "-";
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function documentCode(document: DocumentRecord, index: number): string {
  const prefix = documentCategory(document).toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 4) || "DOC";
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function DocumentBoard({
  departments,
  entries,
  labels,
  lang,
  onQueryChange,
  query,
  searchInputRef,
  t,
  title
}: {
  departments: HubDepartment[];
  entries: EnrichedFeedEntry[];
  labels: FeedLabels;
  lang: HubLanguage;
  onQueryChange: (value: string) => void;
  query: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  t: HubTranslate;
  title?: ReactNode;
}) {
  const documentEntries = entries.filter((entry): entry is EnrichedFeedEntry & { item: DocumentRecord } => true);
  const [activeView, setActiveView] = useState<DocumentBoardView>("overview");
  const [selectedDocumentId, setSelectedDocumentId] = useState(documentEntries[0]?.item.id || documentEntries[0]?.item.fileName || "");
  const categories = Array.from(new Set(documentEntries.map((entry) => documentCategory(entry.item))));
  const webCount = documentEntries.filter((entry) => entry.item.url || entry.item.id).length;
  const pdfCount = documentEntries.filter((entry) => /pdf/i.test(String(entry.item.fileName || entry.item.originalName || ""))).length;
  const selectedEntry = documentEntries.find((entry) => (entry.item.id || entry.item.fileName) === selectedDocumentId) || documentEntries[0] || null;
  const selectedDocument = selectedEntry?.item || null;
  const selectedIndex = Math.max(0, documentEntries.findIndex((entry) => entry.item === selectedDocument));

  const openDetail = (document: DocumentRecord) => {
    setSelectedDocumentId(document.id || document.fileName || "");
    setActiveView("detail");
  };

  return (
    <div className="feed-action-board feed-document-board">
      <div className="feed-document-hero">
        <span aria-hidden="true"><FileText size={26} /></span>
        <div>
          <strong>Tài liệu mới ban hành</strong>
          <p>{documentEntries.length} tài liệu • {categories.length || 1} nhóm • {webCount} có thể xem/tải</p>
        </div>
        <button onClick={() => setActiveView("list")} type="button">
          Xem danh sách
        </button>
      </div>

      <div className="feed-action-stepper" aria-label="Luồng xem tài liệu mới ban hành" role="tablist">
        <button className={activeView === "overview" ? "active" : ""} onClick={() => setActiveView("overview")} type="button"><b>1</b> Tổng quan nhóm</button>
        <i aria-hidden="true" />
        <button className={activeView === "list" ? "active" : ""} onClick={() => setActiveView("list")} type="button"><b>2</b> Danh sách mục</button>
        <i aria-hidden="true" />
        <button className={activeView === "detail" ? "active" : ""} disabled={!selectedDocument} onClick={() => selectedDocument && setActiveView("detail")} type="button"><b>3</b> Chi tiết mục</button>
      </div>

      {activeView === "overview" ? (
        <div className="feed-action-overview feed-document-overview">
          <div className="feed-action-overview-stats">
            <button onClick={() => setActiveView("list")} type="button"><span><FileText size={24} /></span><small>Tổng tài liệu</small><strong>{documentEntries.length}</strong></button>
            <button className="good" onClick={() => setActiveView("list")} type="button"><span><Eye size={24} /></span><small>Xem/tải được</small><strong>{webCount}</strong></button>
            <button className="warning" onClick={() => setActiveView("list")} type="button"><span><Download size={24} /></span><small>PDF/File</small><strong>{pdfCount}</strong></button>
            <button onClick={() => setActiveView("list")} type="button"><span><Building2 size={24} /></span><small>Nhóm tài liệu</small><strong>{categories.length || 1}</strong></button>
          </div>
          <div className="feed-action-overview-groups">
            {categories.slice(0, 6).map((category) => {
              const categoryEntries = documentEntries.filter((entry) => documentCategory(entry.item) === category);
              return (
                <button key={category} onClick={() => setActiveView("list")} type="button">
                  <span><FileText size={28} /></span>
                  <strong>{category}</strong>
                  <small>Tài liệu ban hành mới nhất, có thể xem trước hoặc tải file gốc.</small>
                  <em>{categoryEntries.length} mục</em>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeView === "list" ? (
        <>
          <div className="feed-action-list-head feed-document-list-head">
            <span className="feed-action-group-icon" aria-hidden="true"><FileText size={25} /></span>
            <div>
              <h3>{title || "Tài liệu mới ban hành"}</h3>
              <p>{documentEntries.length} mục • cập nhật mới nhất • sẵn sàng xem trên web</p>
            </div>
            <label className="feed-action-search">
              <Search size={16} />
              <input aria-label={labels.searchPlaceholder} onChange={(event) => onQueryChange(event.target.value)} placeholder={labels.searchPlaceholder} ref={searchInputRef} type="search" value={query} />
            </label>
            <button className="feed-action-export" type="button"><Download size={16} />Xuất danh sách</button>
          </div>

          <div className="feed-action-table feed-document-table" role="table" aria-label="Danh sách tài liệu mới ban hành">
            <div className="feed-action-table-row head" role="row">
              <span role="columnheader">Mã mục</span>
              <span role="columnheader">Tiêu đề</span>
              <span role="columnheader">Nhóm</span>
              <span role="columnheader">Phiên bản</span>
              <span role="columnheader">Cập nhật</span>
              <span role="columnheader">Thao tác</span>
            </div>
            {documentEntries.map((entry, rowIndex) => {
              const document = entry.item;
              return (
                <button className="feed-action-table-row" key={document.id || document.fileName || rowIndex} onClick={() => openDetail(document)} role="row" type="button">
                  <span className="feed-action-code" role="cell">{documentCode(document, rowIndex)}</span>
                  <span className="feed-action-title-cell" role="cell"><strong>{getDocumentDisplayTitle(document, t("documents"), lang)}</strong><small>{document.originalName || document.fileName || "Tài liệu nội bộ"}</small></span>
                  <span role="cell"><em className="feed-action-pill good"><FileText size={13} />{documentCategory(document)}</em></span>
                  <span role="cell"><em className="feed-action-pill status open">v{document.version || "1.0"}</em></span>
                  <span className="feed-action-date" role="cell">{documentUpdatedAt(document)}</span>
                  <span className="feed-action-open" role="cell" aria-label={labels.openDetail}><Eye size={17} /></span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {activeView === "detail" && selectedDocument ? (
        <article className="feed-action-detail feed-document-detail">
          <div className="feed-action-detail-title">
            <small>{documentCode(selectedDocument, selectedIndex)}</small>
            <h3>{getDocumentDisplayTitle(selectedDocument, t("documents"), lang)}</h3>
            <div>
              <em className="feed-action-pill good"><FileText size={13} />{documentCategory(selectedDocument)}</em>
              <em className="feed-action-pill status open">v{selectedDocument.version || "1.0"}</em>
            </div>
          </div>
          <div className="feed-action-detail-grid">
            <section className="feed-action-info-card">
              <h4>Thông tin chung</h4>
              <p><Building2 size={15} /><span>Bộ phận</span><strong>{findDepartment(departments, selectedDocument.departmentId) ? getText(findDepartment(departments, selectedDocument.departmentId)!.name, lang) : t("companyLevel")}</strong></p>
              <p><FileText size={15} /><span>File</span><strong>{selectedDocument.originalName || selectedDocument.fileName || "-"}</strong></p>
              <p><Download size={15} /><span>Dung lượng</span><strong>{documentSize(selectedDocument)}</strong></p>
              <p><Clock3 size={15} /><span>Cập nhật</span><strong>{documentUpdatedAt(selectedDocument)}</strong></p>
            </section>
            <section className="feed-action-detail-content">
              <h4>1. Nội dung tài liệu</h4>
              <p>{getDocumentDisplayTitle(selectedDocument, t("documents"), lang)} đã được ban hành trên hệ thống. Người dùng có thể xem trước trên web hoặc tải file gốc nếu được phân quyền.</p>
              <h4>2. Trạng thái phát hành</h4>
              <ul>
                <li>Đã ghi nhận trong danh sách tài liệu mới ban hành.</li>
                <li>Đã gắn phiên bản và thông tin bộ phận liên quan.</li>
                <li>Đã sẵn sàng để tra cứu trong cổng nội bộ.</li>
              </ul>
              <div className="feed-document-detail-actions">
                {selectedDocument.id ? (
                  <Link to={`/documents/${selectedDocument.id}/preview`}><Eye size={15} />{labels.viewOnWeb}</Link>
                ) : null}
                {selectedDocument.url || selectedDocument.id ? (
                  <a download={selectedDocument.originalName || selectedDocument.fileName || true} href={selectedDocument.id ? api.documentFileUrl(selectedDocument.id, "attachment") : selectedDocument.url} rel="noreferrer">
                    <Download size={15} />{labels.download}
                  </a>
                ) : null}
              </div>
            </section>
          </div>
        </article>
      ) : null}
    </div>
  );
}

function DocumentRow({
  document,
  departments,
  lang,
  labels,
  t
}: {
  departments: HubDepartment[];
  document: DocumentRecord;
  labels: FeedLabels;
  lang: HubLanguage;
  t: HubTranslate;
}) {
  const department = findDepartment(departments, document.departmentId);
  const departmentName = department ? getText(department.name, lang) : t("companyLevel");
  const downloadUrl = document?.id ? api.documentFileUrl(document.id, "attachment") : document?.url || "";
  const displayTitle = getDocumentDisplayTitle(document, t("documents"), lang);

  return (
    <article className="feed-detail-row document">
      <span className="feed-detail-doc-icon">
        <FileText size={19} />
      </span>
      <div className="feed-detail-row-main">
        <div className="feed-detail-row-title">
          <strong>{displayTitle}</strong>
        </div>
        <div className="feed-detail-meta">
          <span>
            <Building2 size={14} />
            {departmentName}
          </span>
          <span>
            <FileText size={14} />
            {labels.version}: v{document.version || "1.0"}
          </span>
        </div>
        {document.url ? (
          <div className="feed-detail-actions">
            <Link to={`/documents/${document.id}/preview`}>
              <Eye size={15} />
              {labels.viewOnWeb}
            </Link>
            <a download={document.originalName || document.fileName || true} href={downloadUrl} rel="noreferrer">
              <Download size={15} />
              {labels.download}
            </a>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function FeedDetailModal({ departments = [], feed, lang, onClose, onOpenBulletin, t }: FeedDetailModalProps) {
  const labels = useMemo(() => buildFeedDetailLabels(t), [t]);
  const feedKind = normalizeFeedKind(feed?.kind);
  const items = useMemo<FeedItem[]>(() => feed?.items || [], [feed?.items]);
  const HeaderIcon = feedKind === "documents" ? FileText : feedKind === "actions" ? AlertTriangle : Megaphone;
  const modalRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeLevel, setActiveLevel] = useState<FilterLevel>("all");
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    setQuery("");
    setActiveLevel("all");
  }, [feed?.kind, feed?.title]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus({ preventScroll: true });
    }, 0);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  const enrichedItems = useMemo<EnrichedFeedEntry[]>(() => (
    items.map((item, index) => {
      const level = itemLevel(feedKind, item);
      return {
        item,
        level,
        priority: levelPriority(feedKind, level),
        originalIndex: index,
        searchText: itemSearchText(feedKind, item, departments, lang, t).toLowerCase()
      };
    }).sort((a, b) => a.priority - b.priority || a.originalIndex - b.originalIndex)
  ), [departments, feedKind, items, lang, t]);

  const filterOptions = useMemo(() => levelOptions(feedKind, enrichedItems, labels), [enrichedItems, feedKind, labels]);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const filteredItems = useMemo(() => enrichedItems.filter((entry) => {
    const levelMatches = activeLevel === "all" || entry.level === activeLevel;
    const queryMatches = !normalizedQuery || entry.searchText.includes(normalizedQuery);
    return levelMatches && queryMatches;
  }), [activeLevel, enrichedItems, normalizedQuery]);
  const stats = useMemo(
    () => statsForFeed(feedKind, items, filteredItems.length, departments, labels),
    [departments, feedKind, filteredItems.length, items, labels]
  );

  if (!feed) return null;

  const handleModalKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;

    const focusable = modalRef.current
      ? (Array.from(
          modalRef.current.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ) as HTMLElement[]).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true")
      : [];

    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop iot-modal-backdrop feed-detail-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="feed-detail-title"
        aria-modal="true"
        className={`iot-responsive-modal feed-detail-modal ${feed.tone || "good"} ${feedKind}`}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleModalKeyDown}
        ref={modalRef}
        role="dialog"
      >
        <header className="feed-detail-header">
          <div className="feed-detail-header-main">
            <span className="feed-detail-header-icon" aria-hidden="true">
              <HeaderIcon size={22} />
            </span>
            <div className="feed-detail-header-copy">
            <span className="feed-detail-count">
              {labels.headerEyebrow} · {filteredItems.length} / {items.length}
            </span>
            <h2 id="feed-detail-title"><AccentTitle title={feed.title} /></h2>
            {feed.description ? <p>{feed.description}</p> : null}
            </div>
          </div>
          <div className="feed-detail-header-actions">
            {feedKind === "actions" ? (
              <>
                <button className="feed-detail-header-button" type="button">
                  <Clock3 size={16} />
                  Theo dõi
                </button>
                <button className="feed-detail-header-button primary" type="button">
                  <Download size={16} />
                  Xuất PDF
                </button>
              </>
            ) : null}
            <Button aria-label={t("close") || labels.close} className="icon-button" iconOnly onClick={onClose} variant="secondary">
              <X size={18} />
            </Button>
          </div>
        </header>

        <div className="feed-detail-body">
          {feedKind !== "actions" && feedKind !== "documents" ? (
          <div className="feed-detail-stats" aria-label={labels.showing}>
            {stats.map((stat) => {
              const StatIcon = statIconMap[stat.icon] || Info;
              return (
                <span className={`feed-detail-stat feed-detail-stat-${stat.icon || "default"}`} key={stat.label}>
                  <i aria-hidden="true">
                    <StatIcon size={18} />
                  </i>
                  <strong>{stat.value}</strong>
                  <small>{stat.label}</small>
                </span>
              );
            })}
          </div>
          ) : null}

          {feedKind !== "actions" && feedKind !== "documents" ? (
          <div className="feed-detail-tools">
            <label className="feed-detail-search">
              <Search size={16} />
              <input
                aria-label={labels.searchPlaceholder}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={labels.searchPlaceholder}
                ref={searchInputRef}
                type="search"
                value={query}
              />
            </label>

            {filterOptions.length > 2 ? (
              <div aria-label={labels.filters} className="feed-detail-filter">
                <ListFilter size={15} />
                {filterOptions.map((option) => (
                  <button
                    className={option.id === activeLevel ? "active" : ""}
                    key={option.id}
                    onClick={() => setActiveLevel(option.id)}
                    type="button"
                  >
                    {option.label}
                    <span>{option.count}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          ) : null}

          {filteredItems.length && feedKind === "actions" ? (
            <ActionBoardV2
              activeLevel={activeLevel}
              departments={departments}
              entries={filteredItems}
              filterOptions={filterOptions}
              labels={labels}
              lang={lang}
              onLevelChange={setActiveLevel}
              onQueryChange={setQuery}
              query={query}
              searchInputRef={searchInputRef}
              title={feed.title}
            />
          ) : filteredItems.length && feedKind === "documents" ? (
            <DocumentBoard
              departments={departments}
              entries={filteredItems}
              labels={labels}
              lang={lang}
              onQueryChange={setQuery}
              query={query}
              searchInputRef={searchInputRef}
              t={t}
              title={feed.title}
            />
          ) : filteredItems.length ? (
            <div className="feed-detail-list">
              {feedKind === "bulletins"
                ? filteredItems.map(({ item }) => {
                    const bulletin = item as SafetyBulletin;
                    return (
                      <BulletinRow
                        bulletin={bulletin}
                        key={bulletin.id}
                        labels={labels}
                        lang={lang}
                        onOpenBulletin={onOpenBulletin}
                        t={t}
                      />
                    );
                  })
                : null}
              {feedKind === "documents"
                ? filteredItems.map(({ item }, index) => {
                    const document = item as DocumentRecord;
                    return (
                      <DocumentRow
                        departments={departments}
                        document={document}
                        key={document.id || document.fileName || index}
                        labels={labels}
                        lang={lang}
                        t={t}
                      />
                    );
                  })
                : null}
            </div>
          ) : (
            <p className="feed-detail-empty">{items.length ? labels.noMatches : labels.empty}</p>
          )}
        </div>
      </section>
    </div>
  );
}
