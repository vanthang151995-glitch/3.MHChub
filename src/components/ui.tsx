import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileText,
  Info
} from "lucide-react";
import { forwardRef } from "react";
import type { ComponentType, ElementType, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { HubDepartment, LocalizedString, SafetyAction, SafetyBulletin } from "../core/hubCore";
import { cn } from "../lib/cn";
import type { BulletinPointTone } from "./bulletinPointView";
import { buildBulletinPointView, truncateBulletinText } from "./bulletinPointView";
import { getText } from "../i18n";
import { normalizeLanguage, translateDictionary } from "../i18n-context";
import type { HubLanguage, HubTranslate } from "../i18n-context";
import { api } from "../services/api";
import { getDocumentDisplayTitle } from "../utils/documentDisplay";

const translateWithFallback = (lang: unknown, t?: HubTranslate): HubTranslate => (key, params) =>
  typeof t === "function" ? t(key, params) : translateDictionary(normalizeLanguage(lang), key, params);

const buildActionSeverityLabels = (t: HubTranslate) => ({
  high: t("uiActionSeverityHigh"),
  medium: t("uiActionSeverityMedium"),
  good: t("uiActionSeverityGood")
});

const buildBulletinCardLabels = (t: HubTranslate) => ({
  pointCount: t("feedPointCount"),
  pointToneLabels: {
    critical: t("feedPointToneCritical"),
    warning: t("feedPointToneWarning"),
    good: t("feedPointToneGood"),
    info: t("feedPointToneInfo")
  }
});

const bulletinPointToneMeta: Record<BulletinPointTone, { Icon: ComponentType<{ size?: number | string }> }> = {
  critical: { Icon: AlertTriangle },
  warning: { Icon: Clock3 },
  good: { Icon: CheckCircle2 },
  info: { Icon: Info }
};

type LooseProps = Record<string, unknown>;

type ButtonProps = LooseProps & {
  as?: ElementType;
  children?: ReactNode;
  className?: string;
  iconOnly?: boolean;
  size?: string;
  type?: string;
  variant?: string;
};

type CardProps = LooseProps & {
  as?: ElementType;
  children?: ReactNode;
  className?: string;
  interactive?: boolean;
};

type PaginationProps = {
  labels?: {
    nextPage?: string;
    previousPage?: string;
  };
  onPageChange: (page: number) => void;
  pagination?: {
    page: number;
    pageSize?: number;
    totalItems: number;
    totalPages: number;
  };
};

type MetricCardProps = {
  icon: ComponentType<{ size?: number | string }>;
  label: ReactNode;
  tone?: string;
  value: ReactNode;
};

type StatusPillProps = {
  lang?: unknown;
  status?: string;
  t?: HubTranslate;
};

type DocumentSummary = {
  createdAt?: string;
  departmentId?: string;
  fileName?: string;
  id?: string;
  originalName?: string;
  updatedAt?: string;
  uploadedAt?: string;
  url?: string;
  version?: string | number;
  [key: string]: unknown;
};

type ActionItemProps = {
  action: SafetyAction;
  departments: HubDepartment[];
  lang: HubLanguage;
  onOpen?: (action: SafetyAction) => void;
  t?: HubTranslate;
};

type DocumentMiniProps = {
  departments: HubDepartment[];
  document: DocumentSummary;
  lang: HubLanguage;
  showDateStamp?: boolean;
  t: HubTranslate;
};

type BulletinItemProps = {
  bulletin: SafetyBulletin;
  compact?: boolean;
  lang: HubLanguage;
  onOpen?: (bulletin: SafetyBulletin) => void;
  showDocumentActions?: boolean;
  showInlineMore?: boolean;
  showPoints?: boolean;
  t?: HubTranslate;
};

type CheckListProps = {
  items: string[];
  tone?: "good" | "risk" | string;
};

type BackLinkProps = {
  children?: ReactNode;
  to: string;
};

const formatItemDateStamp = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const isoDate = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return raw.length > 12 ? raw.slice(0, 12) : raw;
};

export const Button = forwardRef<HTMLElement, ButtonProps>(function Button({
  as: Component = "button",
  children,
  className = "",
  iconOnly = false,
  size = "default",
  type,
  variant = "primary",
  ...props
}, ref) {
  const isNativeButton = Component === "button";
  const ComponentElement = Component as ElementType;
  return (
    <ComponentElement
      className={cn(
        "ui-button",
        `ui-button-${variant}`,
        size !== "default" && `ui-button-${size}`,
        iconOnly && "ui-button-icon",
        className
      )}
      ref={ref}
      type={isNativeButton ? type || "button" : type}
      {...props}
    >
      {children}
    </ComponentElement>
  );
});

export function Card({ as: Component = "div", children, className = "", interactive = false, ...props }: CardProps) {
  return (
    <Component className={cn("ui-card", interactive && "ui-card-interactive", className)} {...props}>
      {children}
    </Component>
  );
}

export function Badge({ children, className = "", tone = "neutral", ...props }: LooseProps & { children?: ReactNode; className?: string; tone?: string }) {
  return (
    <span className={cn("ui-badge", `ui-badge-${tone}`, className)} {...props}>
      {children}
    </span>
  );
}

export function MetricCard({ icon: Icon, label, value, tone = "good" }: MetricCardProps) {
  return (
    <Card className={cn("metric-card", tone)}>
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </Card>
  );
}

export function StatusPill({ lang = "vi", status = "alert", t }: StatusPillProps) {
  const tx = translateWithFallback(lang, t);
  const label =
    status === "good" ? tx("statusGood") : status === "watch" ? tx("statusWatch") : tx("statusAlert");
  return (
    <Badge className={cn("status-pill", status)} tone={status}>
      {label}
    </Badge>
  );
}

export function Field({ children, label }: { children?: ReactNode; label: ReactNode }) {
  return (
    <label className="field ui-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Pagination({ labels = {}, pagination, onPageChange }: PaginationProps) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const previousPageLabel = labels.previousPage || "Previous page";
  const nextPageLabel = labels.nextPage || "Next page";

  return (
    <div className="pagination ui-pagination">
      <Button
        aria-label={previousPageLabel}
        className="icon-button"
        disabled={pagination.page <= 1}
        iconOnly
        onClick={() => onPageChange(pagination.page - 1)}
        variant="secondary"
      >
        <ChevronLeft size={17} />
      </Button>
      <span>
        {pagination.page} / {pagination.totalPages} · {pagination.totalItems}
      </span>
      <Button
        aria-label={nextPageLabel}
        className="icon-button"
        disabled={pagination.page >= pagination.totalPages}
        iconOnly
        onClick={() => onPageChange(pagination.page + 1)}
        variant="secondary"
      >
        <ChevronRight size={17} />
      </Button>
    </div>
  );
}

export function ActionItem({ action, departments, lang, onOpen, t }: ActionItemProps) {
  const department = departments.find((item) => item.id === action.departmentId);
  const severity = action.severity === "high" ? "high" : action.severity === "medium" ? "medium" : "good";
  const tx = translateWithFallback(lang, t);
  const labels = buildActionSeverityLabels(tx);
  const departmentName = department ? getText(department.name, lang) : "";
  const SeverityIcon = severity === "high" ? AlertTriangle : severity === "medium" ? Clock3 : CheckCircle2;
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!onOpen || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onOpen(action);
  };

  return (
    <Card
      className={cn("action-item action-item-structured", severity, onOpen && "clickable")}
      onClick={onOpen ? () => onOpen(action) : undefined}
      onKeyDown={handleKeyDown}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
    >
      <span className="action-severity-dot" aria-hidden="true" />
      <div className="action-content">
        <div className="action-title-row">
          <strong>{getText(action.title, lang)}</strong>
          <em aria-label={labels[severity]} title={labels[severity]}>
            <SeverityIcon size={14} />
            <span className="sr-only">{labels[severity]}</span>
          </em>
        </div>
        <div className="action-meta-row">
          {department ? (
            <Link
              className="action-meta-chip action-meta-link"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              to={`/safety-6s/departments/${department.id}`}
            >
              <Building2 size={13} />
              <span>{departmentName}</span>
            </Link>
          ) : null}
          <span className="action-meta-chip">
            <CalendarDays size={13} />
            <span>{action.due}</span>
          </span>
        </div>
      </div>
    </Card>
  );
}

export function DocumentMini({ document, departments, lang, showDateStamp = false, t }: DocumentMiniProps) {
  const department = departments.find((item) => item.id === document.departmentId);
  const downloadUrl = document?.id ? api.documentFileUrl(document.id, "attachment") : document?.url || "";
  const displayTitle = getDocumentDisplayTitle(document, t("previewDocument"), lang);
  const dateStamp = showDateStamp
    ? formatItemDateStamp(document.createdAt || document.uploadedAt || document.updatedAt)
    : "";
  return (
    <Card className="doc-mini">
      <FileText size={18} />
      <div>
        <strong>{displayTitle}</strong>
        <span>
          {department ? getText(department.name, lang) : t("companyLevel")} · v{document.version || "1.0"}
        </span>
      </div>
      {document.url ? (
        <div className="doc-mini-actions">
          <Link aria-label={t("viewOnWeb")} to={`/documents/${document.id}/preview`}>
            <Eye size={16} />
            <span className="sr-only">{t("viewOnWeb")}</span>
          </Link>
          <a
            aria-label={t("download")}
            download={document.originalName || document.fileName || true}
            href={downloadUrl}
            rel="noreferrer"
          >
            <Download size={16} />
            <span className="sr-only">{t("download")}</span>
          </a>
        </div>
      ) : (
        <small>{t("sample")}</small>
      )}
      {dateStamp ? (
        <time className="item-date-stamp" dateTime={dateStamp}>
          <CalendarDays aria-hidden="true" size={12} />
          <span>{dateStamp}</span>
        </time>
      ) : null}
    </Card>
  );
}

export function BulletinItem({
  bulletin,
  compact = false,
  lang,
  onOpen,
  showDocumentActions = true,
  showInlineMore = false,
  showPoints = true,
  t
}: BulletinItemProps) {
  const title = getText(bulletin.title, lang);
  const summary = getText(bulletin.summary, lang);
  const tx = translateWithFallback(lang, t);
  const audience = getText(bulletin.audience, lang) || tx("companyLevel");
  const pointList = getText(bulletin.points, lang);
  const points = Array.isArray(pointList) ? pointList : [];
  const pointViews = points.map((point, index) => buildBulletinPointView(point, index));
  const visiblePoints = compact ? pointViews.slice(0, 2) : pointViews.slice(0, 3);
  const labels = buildBulletinCardLabels(tx);
  const tone = ["good", "watch", "alert"].includes(bulletin.tone) ? bulletin.tone : "watch";
  const summaryText = truncateBulletinText(summary, compact ? 92 : 190);
  const dateStamp = compact ? formatItemDateStamp(bulletin.date || bulletin.createdAt || bulletin.updatedAt) : "";
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!onOpen || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onOpen(bulletin);
  };

  return (
    <Card
      as="article"
      className={cn("bulletin-item", tone, compact && "compact", onOpen && "clickable")}
      onClick={onOpen ? () => onOpen(bulletin) : undefined}
      onKeyDown={handleKeyDown}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
    >
      <div className="bulletin-topline">
        <div>
          <strong>{title}</strong>
          <span>
            {audience}
            {!compact && bulletin.date ? ` - ${bulletin.date}` : ""}
          </span>
        </div>
        <div className="bulletin-top-actions">
          <StatusPill status={tone} t={tx} />
          {onOpen && showInlineMore ? (
            <Button
              className="bulletin-more-button"
              onClick={(event: MouseEvent<HTMLElement>) => {
                event.stopPropagation();
                onOpen(bulletin);
              }}
              size="sm"
              variant="ghost"
            >
              <Eye size={14} />
              <span>{tx("viewAll")}</span>
            </Button>
          ) : null}
        </div>
      </div>
      {summaryText ? <p>{summaryText}</p> : null}
      {points.length ? (
        <div className="bulletin-mini-count">
          <ClipboardCheck size={14} />
          <span>
            {points.length} {labels.pointCount}
          </span>
        </div>
      ) : null}
      {dateStamp ? (
        <time className="item-date-stamp" dateTime={dateStamp}>
          <CalendarDays aria-hidden="true" size={12} />
          <span>{dateStamp}</span>
        </time>
      ) : null}
      {showPoints && visiblePoints.length ? (
        <ol className="bulletin-key-list">
          {visiblePoints.map((point) => {
            const toneMeta = bulletinPointToneMeta[point.tone] || bulletinPointToneMeta.info;
            const ToneIcon = toneMeta.Icon;
            const toneLabel = labels.pointToneLabels[point.tone] || point.tone;
            return (
              <li className={`bulletin-key-point ${point.tone}`} key={`${point.number}-${point.body}`}>
                <span className="bulletin-key-index">{point.number}</span>
                <div className="bulletin-key-copy">
                  <span className="bulletin-key-title">
                    {point.label || truncateBulletinText(point.body, 42)}
                  </span>
                  <span className="bulletin-key-body">
                    {point.label ? truncateBulletinText(point.body, compact ? 96 : 132) : truncateBulletinText(point.body, compact ? 112 : 148)}
                  </span>
                </div>
                <span className={`bulletin-key-status ${point.tone}`} aria-label={toneLabel}>
                  <ToneIcon size={12} />
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      {showPoints && points.length > visiblePoints.length ? (
        <div className="bulletin-key-more">
          +{points.length - visiblePoints.length} {labels.pointCount}
        </div>
      ) : null}
      {showDocumentActions && (bulletin.documentId || bulletin.documentUrl) ? (
        <div
          className="bulletin-actions"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {bulletin.documentId ? (
            <Link to={`/documents/${bulletin.documentId}/preview`}>
              <Eye size={15} />
              {tx("viewOnWeb")}
            </Link>
          ) : null}
          {bulletin.documentUrl ? (
            <a download href={bulletin.documentUrl} rel="noreferrer">
              <Download size={15} />
              {tx("download")}
            </a>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export function EmptyState({ children }: { children?: ReactNode }) {
  return <p className="empty-text">{children}</p>;
}

export function CheckList({ items, tone = "good" }: CheckListProps) {
  const Icon = tone === "risk" ? AlertTriangle : CheckCircle2;
  return (
    <ul className={`check-list ${tone === "risk" ? "risk-list" : ""}`}>
      {items.map((item) => (
        <li key={item}>
          <Icon size={18} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function BackLink({ children, to }: BackLinkProps) {
  return (
    <Link className="back-link" to={to}>
      <ChevronRight size={16} />
      {children}
    </Link>
  );
}
