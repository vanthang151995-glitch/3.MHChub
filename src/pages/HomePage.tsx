import {
  AlertTriangle,
  ArrowRight,
  ChartNoAxesColumnIncreasing,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  FolderOpen,
  GraduationCap,
  Megaphone,
  Network,
  NotebookTabs,
  Router,
  ShieldCheck,
  X
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { CSSProperties, ComponentType, FocusEvent, KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ActionItem, BulletinItem, Button, DocumentMini } from "../components/ui";
import type { FeedDetail } from "../components/FeedDetailModal";
import type { HubModel, SafetyAction, SafetyBulletin, UtilityLink } from "../core/hubCore";
import type { HubLanguage, HubTranslate } from "../i18n-context";
import { api } from "../services/api";
import type { AuthUser, DocumentRecord } from "../services/api";
import { getText } from "../i18n";
import "./HomePage.css";
import "./HomeSafetyKpiPanel.css";
import "../utils/heroHeightSync";

const FeedDetailModal = lazy(() =>
  import("../components/FeedDetailModal").then((module) => ({ default: module.FeedDetailModal }))
);
const ActionViewModal = lazy(() =>
  import("../components/ActionViewModal").then((module) => ({ default: module.ActionViewModal }))
);
const SafetyBulletinViewModal = lazy(() =>
  import("../components/SafetyBulletinViewModal").then((module) => ({ default: module.SafetyBulletinViewModal }))
);
const SafetyBulletinCreateModal = lazy(() =>
  import("../components/SafetyBulletinCreateModal").then((module) => ({ default: module.SafetyBulletinCreateModal }))
);

function WirelessHubIcon({ size = 24, strokeWidth = 2.2 }: { size?: number | string; strokeWidth?: number | string }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M7.8 11.1a6.1 6.1 0 0 1 8.4 0" stroke="currentColor" strokeLinecap="round" strokeWidth={strokeWidth} />
      <path d="M9.8 13.2a3.2 3.2 0 0 1 4.4 0" stroke="currentColor" strokeLinecap="round" strokeWidth={strokeWidth} />
      <circle cx="12" cy="15.5" fill="currentColor" r="1.25" />
    </svg>
  );
}

type IconComponent = ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
type LaunchMeta = {
  statusKey: string;
  StatusIcon: IconComponent;
};
type HomeFeedKey = "hotAlerts" | "latestNotices" | "newIssued" | "newUpdates" | "priorityActions";
type HomePagedFeedKey = "latestNotices" | "newIssued" | "priorityActions";
type HomeFeedPages = Record<HomePagedFeedKey, number>;
type HomeSafetyRecord = Record<string, unknown> & {
  approvalStatus?: string;
  createdAt?: string;
  deadline?: string;
  entryType?: string;
  occurredDate?: string;
  period?: string;
  status?: string;
  value?: number | string;
};
type HomeSafetySnapshot = {
  incidents: HomeSafetyRecord[];
  kpis: HomeSafetyRecord[];
  warnings: HomeSafetyRecord[];
};
type HomeModel = HubModel & {
  incidentCount?: number | string;
  monthIncidentCount?: number | string;
  openWarningCount?: number | string;
  overdueWarningCount?: number | string;
  totalIncidentCount?: number | string;
  warningCount?: number | string;
};
type HomePageProps = {
  lang: HubLanguage;
  model: HomeModel;
  t: HubTranslate;
  user?: AuthUser | null;
};
type SloganHeroSlide = {
  id: string;
  kind: "slogan";
  label: ReactNode;
};
type InfoHeroSlide = {
  Icon: IconComponent;
  id: string;
  kind: "alert" | "notice";
  label: ReactNode;
  meta?: ReactNode;
  onOpen?: () => void;
  summary?: ReactNode;
  title: ReactNode;
  tone: string;
};
type HeroSlide = InfoHeroSlide | SloganHeroSlide;
type HomeSafetyKpi = SystemKpiCardProps & {
  id: string;
};

const iconMap: Record<string, IconComponent> = {
  iot: WirelessHubIcon,
  gateway: Router,
  notes: NotebookTabs,
  safety: ShieldCheck
};

const moduleMetaByType: Record<string, LaunchMeta> = {
  iot: { statusKey: "launchSignalGood", StatusIcon: ChartNoAxesColumnIncreasing },
  gateway: { statusKey: "launchSignalStable", StatusIcon: ChartNoAxesColumnIncreasing },
  notes: { statusKey: "launchSignalUpdated", StatusIcon: Clock3 },
  safety: { statusKey: "launchSignalSafety", StatusIcon: ShieldCheck },
  internal: { statusKey: "launchSignalDocs", StatusIcon: FolderOpen }
};

function formatLaunchTarget(url: string | undefined): string {
  if (!url) return "";
  if (url.startsWith("/")) return url;

  try {
    const parsed = new URL(url);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return url;
  }
}

function LaunchStatus({ meta, t, action }: { action?: ReactNode; meta: LaunchMeta; t: HubTranslate }) {
  const StatusIcon = meta.StatusIcon;
  return (
    <div className="portal-link-status">
      <span className="status-chip online">
        <span className="online-dot" />
        <strong>{t("online")}</strong>
      </span>
      <span className="status-chip">
        <StatusIcon size={14} />
        <span>{t(meta.statusKey)}</span>
      </span>
      {action}
    </div>
  );
}

function UtilityCard({ item, lang, t }: { item: UtilityLink; lang: HubLanguage; t: HubTranslate }) {
  const Icon = iconMap[item.type] || Network;
  const isConfigured = Boolean(item.url);
  const title = item.id === "gateway" ? t("gatewayPro") : item.id === "notes" ? t("workLogShort") : getText(item.title, lang);
  const targetLabel = formatLaunchTarget(item.url);
  const meta = moduleMetaByType[item.type] || moduleMetaByType.iot;
  const cardClassName = `utility-card portal-link-card link-type-${item.type} ${isConfigured ? "" : "disabled"}`;
  const content = (
    <>
      <div className="utility-icon">
        <Icon size={34} />
      </div>
      <div className="portal-link-main">
        <h3>{title}</h3>
        {targetLabel ? <span className="portal-link-target">{targetLabel}</span> : null}
      </div>
      <LaunchStatus
        meta={meta}
        t={t}
        action={(
          <div className="utility-footer">
            <span className="launch-label">
              <span className="launch-text">{isConfigured ? t("enterSystem") : t("configureLink")}</span>
              {isConfigured ? <ArrowRight size={18} /> : null}
            </span>
          </div>
        )}
      />
    </>
  );

  if (item.url?.startsWith("/")) return <Link className={cardClassName} to={item.url}>{content}</Link>;
  if (item.url) {
    return (
      <a className={cardClassName} href={item.url} rel="noreferrer" target="_blank">
        {content}
      </a>
    );
  }
  return <div className={cardClassName}>{content}</div>;
}

function InternalModuleCard({
  icon: Icon,
  title,
  to,
  t,
  type = "internal"
}: {
  icon: IconComponent;
  title: ReactNode;
  to: string;
  t: HubTranslate;
  type?: string;
}) {
  const meta = moduleMetaByType[type] || moduleMetaByType.internal;
  return (
    <Link className={`utility-card portal-link-card internal-module link-type-${type}`} to={to}>
      <div className="utility-icon">
        <Icon size={34} />
      </div>
      <div className="portal-link-main">
        <h3>{title}</h3>
        <span className="portal-link-target">{to}</span>
      </div>
      <LaunchStatus
        meta={meta}
        t={t}
        action={(
          <div className="utility-footer">
            <span className="launch-label">
              <span className="launch-text">{t("enterSystem")}</span>
              <ArrowRight size={18} />
            </span>
          </div>
        )}
      />
    </Link>
  );
}

type KpiAccentStyle = CSSProperties & {
  "--kpi-accent"?: string;
  "--kpi-accent-strong"?: string;
};

type SystemKpiCardProps = {
  accent?: string;
  detail?: ReactNode;
  icon?: ReactNode;
  Icon?: ComponentType<{ size?: number | string }>;
  label?: ReactNode;
  sparkData?: number[];
  tone?: string;
  trend?: ReactNode;
  trendDir?: "up-good" | "down-good";
  value?: ReactNode;
};

function SystemKpiCard({ accent, detail, icon, Icon, label, sparkData, tone = "good", trend, trendDir = "up-good", value }: SystemKpiCardProps) {
  const points = Array.isArray(sparkData) && sparkData.length ? sparkData : null;
  const accentStyle: KpiAccentStyle | undefined = accent
    ? { "--kpi-accent": accent, "--kpi-accent-strong": accent }
    : undefined;
  const sparklinePoints = points
    ? points
        .map((point, index) => {
          const min = Math.min(...points);
          const max = Math.max(...points);
          const range = max - min || 1;
          const x = (index / Math.max(1, points.length - 1)) * 72;
          const y = 32 - ((Number(point) - min) / range) * 32;
          return `${x},${y}`;
        })
        .join(" ")
    : "";
  const autoTrend = (() => {
    if (trend !== null && trend !== undefined) return null;
    if (!points || points.length < 2) return null;
    const first = points[0];
    const last = points[points.length - 1];
    const delta = last - first;
    if (first === 0 && last === 0) return null;
    const pct = first !== 0 ? Math.round((delta / Math.abs(first)) * 100) : (last > 0 ? 100 : 0);
    if (Math.abs(pct) < 1) return null;
    return { up: delta > 0, pct: Math.abs(pct) };
  })();
  const trendEl = trend ?? (autoTrend ? (
    <span className={`kpi-trend-badge ${autoTrend.up ? "trend-positive" : "trend-negative"}`}>
      {autoTrend.up ? "↑" : "↓"} {autoTrend.pct}%
    </span>
  ) : null);
  return (
    <article className={`system-kpi-card ${tone}`} style={accentStyle}>
      <div className="system-kpi-top">
        <span className="system-kpi-icon inline-icon" aria-hidden="true">
          {icon || (Icon ? <Icon size={20} /> : null)}
        </span>
        <span className="system-kpi-label">{label}</span>
      </div>
      <strong className="system-kpi-value">{value}</strong>
      {detail ? <small className="system-kpi-detail">{detail}</small> : null}
      {trendEl ? <span className="system-kpi-trend">{trendEl}</span> : null}
      {points ? (
        <svg aria-hidden="true" className="system-kpi-sparkline" viewBox="0 0 72 32" preserveAspectRatio="none">
          <polyline fill="none" points={sparklinePoints} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
        </svg>
      ) : null}
    </article>
  );
}

function SystemLinksModal({ lang, model, onClose, t }: HomePageProps & { onClose: () => void }) {
  return (
    <div className="modal-backdrop system-links-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="system-links-modal-title"
        aria-modal="true"
        className="system-links-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="system-links-modal-header">
          <div>
            <h2 id="system-links-modal-title">{t("systemMenuTitle")}</h2>
            <p>{t("systemMenuSubtitle")}</p>
          </div>
          <Button aria-label={t("close")} className="icon-button" iconOnly onClick={onClose} variant="secondary">
            <X size={18} />
          </Button>
        </div>
        <div className="system-links-modal-grid">
          {model.utilityLinks.map((item, index) => (
            <UtilityCard item={item} key={`${index}-${item.id}-${item.url || ""}`} lang={lang} t={t} />
          ))}
          <InternalModuleCard icon={FileText} t={t} title={t("documentLibrary")} to="/documents" type="internal" />
        </div>
      </section>
    </div>
  );
}

function PortalHeroCarousel({
  activeIndex,
  onPauseChange,
  onSelect,
  slide,
  slides,
  t
}: {
  activeIndex: number;
  onPauseChange?: (paused: boolean) => void;
  onSelect?: (index: number) => void;
  slide: HeroSlide;
  slides: HeroSlide[];
  t: HubTranslate;
}) {
  const suppressSlideClickUntilRef = useRef(0);
  const swipeStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const capturePointer = (event: PointerEvent<HTMLElement>) => {
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Some synthetic pointer events do not create an active pointer capture target.
    }
  };
  const releasePointer = (event: PointerEvent<HTMLElement>) => {
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Ignore unmatched synthetic pointer releases.
    }
  };
  const setPaused = (paused: boolean) => {
    if (typeof onPauseChange === "function") onPauseChange(paused);
  };
  const selectSlide = (index: number) => {
    if (typeof onSelect === "function") onSelect(index);
  };
  const selectAdjacentSlide = (step: number) => {
    if (!slides.length) return;
    selectSlide((activeIndex + step + slides.length) % slides.length);
  };
  const handleCarouselKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectAdjacentSlide(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      selectAdjacentSlide(1);
    }
    if (event.key === "Home") {
      event.preventDefault();
      selectSlide(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      selectSlide(Math.max(slides.length - 1, 0));
    }
  };
  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    swipeStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY
    };
    capturePointer(event);
    setPaused(true);
  };
  const finishSwipe = (event: PointerEvent<HTMLElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || start.pointerId !== event.pointerId) {
      setPaused(false);
      return;
    }

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const isHorizontalSwipe = Math.abs(deltaX) >= 44 && Math.abs(deltaX) > Math.abs(deltaY) * 1.35;
    if (isHorizontalSwipe) {
      event.preventDefault();
      suppressSlideClickUntilRef.current = window.performance.now() + 650;
      selectAdjacentSlide(deltaX < 0 ? 1 : -1);
    }
    releasePointer(event);
    setPaused(false);
  };
  const cancelSwipe = (event: PointerEvent<HTMLElement>) => {
    swipeStartRef.current = null;
    releasePointer(event);
    setPaused(false);
  };
  const handleSlideClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (suppressSlideClickUntilRef.current > window.performance.now()) {
      suppressSlideClickUntilRef.current = 0;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (slide.kind !== "slogan") slide.onOpen?.();
  };
  const activeSlideTitle = slide.kind === "slogan" ? slide.label : slide.label || slide.title;
  const activeSlideLabel = `${activeIndex + 1}/${slides.length} - ${activeSlideTitle || t("companySafetyTitle")}`;
  const carouselInteractionProps = {
    "aria-describedby": "portal-hero-status",
    "aria-label": t("companySafetyTitle"),
    "aria-roledescription": "carousel",
    onBlur: (event: FocusEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
    },
    onFocus: () => setPaused(true),
    onKeyDown: handleCarouselKeyDown,
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
    onPointerCancel: cancelSwipe,
    onPointerDown: handlePointerDown,
    onPointerUp: finishSwipe,
    role: "region",
    tabIndex: 0
  };

  if (slide.kind === "slogan") {
    return (
      <div className="portal-hero-carousel" {...carouselInteractionProps}>
        <div className="portal-hero-slide" id="portal-hero-active-slide" key={slide.id}>
          <figure className="portal-hero-art slogan-hero-art" aria-label={t("companySafetyTitle")}>
            <picture>
              <source
                media="(min-width: 1200px)"
                sizes="3840px"
                srcSet="/images/safety-6s-hero-3840.webp 3840w, /images/safety-6s-hero-2400.webp 2400w, /images/safety-6s-hero-1600.webp 1600w"
                type="image/webp"
              />
              <source
                sizes="(max-width: 760px) calc(100vw - 32px), (max-width: 1100px) calc(100vw - 48px), (max-width: 1320px) 50vw, 707px"
                srcSet="/images/safety-6s-hero-960.webp 960w, /images/safety-6s-hero-1600.webp 1600w, /images/safety-6s-hero-2400.webp 2400w, /images/safety-6s-hero-3840.webp 3840w"
                type="image/webp"
              />
              <img
                alt={t("companySafetyTitle")}
                className="portal-hero-image"
                decoding="async"
                fetchPriority="high"
                height="1442"
                loading="eager"
                sizes="(max-width: 760px) calc(100vw - 32px), (max-width: 1100px) calc(100vw - 48px), (max-width: 1320px) 50vw, 707px"
                src="/images/safety-6s-hero-3840.webp"
                srcSet="/images/safety-6s-hero-3840.webp 3840w, /images/safety-6s-hero-2400.webp 2400w, /images/safety-6s-hero-1600.webp 1600w, /images/safety-6s-hero-960.webp 960w, /images/safety-6s-hero-web.png 1200w"
                width="3840"
              />
            </picture>
          </figure>
        </div>
        <span className="sr-only" id="portal-hero-status" aria-live="polite">
          {activeSlideLabel}
        </span>
        <HeroCarouselDots activeIndex={activeIndex} onSelect={selectSlide} slides={slides} t={t} />
      </div>
    );
  }

  const Icon = slide.Icon;
  return (
    <div className={`portal-hero-carousel info-slide ${slide.tone}`} {...carouselInteractionProps}>
      <div className="portal-hero-slide" id="portal-hero-active-slide" key={slide.id}>
        <button className="portal-info-hero" onClick={handleSlideClick} type="button">
          <span className="portal-info-icon">
            <Icon size={30} />
          </span>
          <span className="portal-info-kicker">{slide.label}</span>
          <strong>{slide.title}</strong>
          {slide.summary ? <p>{slide.summary}</p> : null}
          {slide.meta ? <small>{slide.meta}</small> : null}
          <span className="portal-info-action">
            {t("viewAll")}
            <ArrowRight size={18} />
          </span>
        </button>
      </div>
      <span className="sr-only" id="portal-hero-status" aria-live="polite">
        {activeSlideLabel}
      </span>
      <HeroCarouselDots activeIndex={activeIndex} onSelect={selectSlide} slides={slides} t={t} />
    </div>
  );
}

function HeroCarouselDots({
  activeIndex,
  onSelect,
  slides,
  t
}: {
  activeIndex: number;
  onSelect: (index: number) => void;
  slides: HeroSlide[];
  t: HubTranslate;
}) {
  if (slides.length <= 1) return null;
  return (
    <div
      className="hero-carousel-dots"
      aria-label={t("heroCarousel")}
      onPointerCancel={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      {slides.map((item, index) => (
        <button
          aria-controls="portal-hero-active-slide"
          aria-label={`${index + 1}/${slides.length} - ${item.label || item.id}`}
          aria-current={index === activeIndex ? "true" : undefined}
          className={index === activeIndex ? "active" : ""}
          key={item.id}
          onClick={() => onSelect(index)}
          type="button"
        />
      ))}
    </div>
  );
}

function CommandCard({
  action,
  className = "",
  icon: Icon,
  note,
  title,
  tone = "good",
  children
}: {
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  icon: IconComponent;
  note?: string;
  title: ReactNode;
  tone?: string;
}) {
  return (
    <div className={`directive-card ${tone} ${className}`.trim()}>
      <div className="directive-card-header">
        <span>
          <Icon size={18} />
        </span>
        <h3>{title}</h3>
        {action}
      </div>
      {note && (
        <div style={{ margin: "0 0 4px", padding: "5px 14px 6px", fontSize: 11.5, color: "#92400e", background: "#fefce8", borderBottom: "1px solid #fef08a", fontWeight: 500, letterSpacing: "0.01em" }}>
          {note}
        </div>
      )}
      {children}
    </div>
  );
}

function ViewMoreButton({ onClick, t }: { onClick: () => void; t: HubTranslate }) {
  return (
    <button className="bulletin-heading-more home-view-more" onClick={onClick} type="button">
      <span>{t("viewMore")}</span>
      <ArrowRight size={14} />
    </button>
  );
}

function ViewMoreLink({ to, label }: { to: string; label: string }) {
  return (
    <Link className="bulletin-heading-more home-view-more" to={to}>
      <span>{label}</span>
      <ArrowRight size={14} />
    </Link>
  );
}

const homeFeedPageSizes: Record<HomePagedFeedKey, number> = {
  latestNotices: 2,
  priorityActions: 3,
  newIssued: 5
};

function getVisiblePageNumbers(page: number, totalPages: number): number[] {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  return Array.from(
    new Set([1, page - 1, page, page + 1, totalPages].filter((item) => item >= 1 && item <= totalPages))
  ).sort((left, right) => left - right);
}

function HomeFeedPager({
  onPageChange,
  page,
  t,
  totalItems,
  totalPages
}: {
  onPageChange: (page: number) => void;
  page: number;
  t: HubTranslate;
  totalItems: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const pageNumbers = getVisiblePageNumbers(page, totalPages);

  return (
    <div className="home-feed-pager" aria-label={t("feedPages", { page, totalPages })}>
      <button
        aria-label={t("previousPage")}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        type="button"
      >
        <ChevronLeft size={14} />
      </button>
      <div className="home-feed-page-numbers" aria-label={t("itemCount", { count: totalItems })}>
        {pageNumbers.map((pageNumber, index) => (
          <span className="home-feed-page-token" key={pageNumber}>
            {index > 0 && pageNumber - pageNumbers[index - 1] > 1 ? <i aria-hidden="true">...</i> : null}
            <button
              aria-current={pageNumber === page ? "page" : undefined}
              aria-label={t("pageNumber", { page: pageNumber })}
              className={pageNumber === page ? "active" : ""}
              onClick={() => onPageChange(pageNumber)}
              type="button"
            >
              {pageNumber}
            </button>
          </span>
        ))}
      </div>
      <button
        aria-label={t("nextPage")}
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        type="button"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

const currentSafetyMonth = () => new Date().toISOString().slice(0, 7);

const normalizeSafetyText = (value: unknown = ""): string =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const asHomeSafetyArray = (payload: unknown): HomeSafetyRecord[] => {
  if (Array.isArray(payload)) return payload as HomeSafetyRecord[];
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.items)) return payload.items as HomeSafetyRecord[];
  if (Array.isArray(payload.data)) return payload.data as HomeSafetyRecord[];
  if (isRecord(payload.data) && Array.isArray(payload.data.items)) return payload.data.items as HomeSafetyRecord[];
  return [];
};

const fetchHomeSafetyArray = async (url: string): Promise<HomeSafetyRecord[]> => {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return asHomeSafetyArray(await response.json().catch(() => ({})));
};

const isApprovedHomeKpi = (item: HomeSafetyRecord): boolean => {
  const status = normalizeSafetyText(item?.approvalStatus);
  return status === "approved" || status.includes("duyet");
};

const isOpenHomeWarning = (item: HomeSafetyRecord): boolean => normalizeSafetyText(item?.status) !== "hoan thanh";

const isOverdueHomeWarning = (item: HomeSafetyRecord): boolean => {
  if (!item?.deadline) return false;
  const deadline = new Date(item.deadline);
  return !Number.isNaN(deadline.getTime()) && deadline < new Date();
};

const buildHomeSafetyTrendValues = (entries: HomeSafetyRecord[]): number[] => {
  const byPeriod = new Map<string, { count: number; sum: number }>();
  (Array.isArray(entries) ? entries : [])
    .filter((item) => isApprovedHomeKpi(item) && item.entryType === "safety_score_monthly")
    .forEach((item) => {
      const period = String(item.period || "");
      const current = byPeriod.get(period) || { sum: 0, count: 0 };
      current.sum += Number(item.value || 0);
      current.count += 1;
      byPeriod.set(period, current);
    });

  return Array.from(byPeriod.entries())
    .sort(([left], [right]) => String(left).localeCompare(String(right)))
    .slice(-6)
    .map(([, value]) => Math.round(value.sum / Math.max(1, value.count)));
};

function buildStructuredOverviewCopy(t: HubTranslate) {
  return {
    title: t("homeOverviewTitle"),
    lead: t("homeOverviewLead"),
    summary: t("homeOverviewSummary"),
    capabilitiesTitle: t("systemGuideNavigationTitle"),
    definitionsTitle: t("systemGuideDefinitionsTitle"),
    faqTitle: t("systemGuideFaqTitle"),
    ownerLabel: t("systemGuideOwnerLabel"),
    updatedLabel: t("systemGuideUpdatedLabel"),
    definitions: [
      ["IoT Mani", t("systemGuideIotDefinition")],
      ["PLC Gateway Pro", t("systemGuideGatewayDefinition")],
      [t("safety"), t("systemGuideSafetyDefinition")]
    ],
    faqs: [
      [t("systemGuidePurposeQuestion"), t("homeOverviewPurposeAnswer")],
      [t("systemGuideDocumentsQuestion"), t("homeOverviewDocumentsAnswer")]
    ]
  };
}

function StructuredOverview({ lang, model, t }: Pick<HomePageProps, "lang" | "model" | "t">) {
  const copy = buildStructuredOverviewCopy(t);
  const launchItems = [
    ...model.utilityLinks.map((item) => ({
      id: item.id,
      title: item.id === "gateway" ? t("gatewayPro") : item.id === "notes" ? t("workLogShort") : getText(item.title, lang),
      url: item.url,
      target: formatLaunchTarget(item.url)
    })),
    { id: "documents", title: t("documentLibrary"), url: "/documents", target: "/documents" }
  ];

  return (
    <section aria-labelledby="mhchub-summary-title" className="geo-summary-section sr-only">
      <div className="geo-summary-head">
        <div>
          <h2 id="mhchub-summary-title">{copy.title}</h2>
          <p className="geo-summary-answer">{copy.lead}</p>
          <p className="geo-summary-answer">{copy.summary}</p>
        </div>
        <div className="geo-summary-meta" aria-label={copy.updatedLabel}>
          <address>{copy.ownerLabel}: {t("siteCreditName")}</address>
          <time dateTime="2026-06-01">{copy.updatedLabel}: 2026-06-01</time>
        </div>
      </div>

      <div className="geo-summary-grid">
        <div className="geo-summary-panel" aria-labelledby="mhchub-capabilities-title">
          <h3 id="mhchub-capabilities-title">{copy.capabilitiesTitle}</h3>
          <ul className="geo-link-list">
            {launchItems.map((item, index) => {
              const body = (
                <>
                  <span>{item.title}</span>
                  <strong>{item.target}</strong>
                </>
              );
              return (
                <li key={`${index}-${item.id}-${item.url || item.target || ""}`}>
                  {item.url?.startsWith("/") ? (
                    <Link to={item.url}>{body}</Link>
                  ) : (
                    <a href={item.url} rel="noreferrer" target="_blank">{body}</a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="geo-summary-panel" aria-labelledby="mhchub-definitions-title">
          <h3 id="mhchub-definitions-title">{copy.definitionsTitle}</h3>
          <dl className="geo-definition-list">
            {copy.definitions.map(([term, description]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="geo-summary-panel geo-faq-panel" aria-labelledby="mhchub-faq-title">
          <h3 id="mhchub-faq-title">{copy.faqTitle}</h3>
          <div className="geo-faq-list">
            {copy.faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomePage({ lang, t, model, user }: HomePageProps) {
  const [latestDocuments, setLatestDocuments] = useState<DocumentRecord[]>([]);
  const [bulletins, setBulletins] = useState<SafetyBulletin[]>([]);
  const [selectedFeedKey, setSelectedFeedKey] = useState<HomeFeedKey | null>(null);
  const [selectedActionId, setSelectedActionId] = useState<string | undefined>(undefined);
  const [selectedBulletin, setSelectedBulletin] = useState<SafetyBulletin | null>(null);
  const [showBulletinCreate, setShowBulletinCreate] = useState(false);
  const [bulletinEditData, setBulletinEditData] = useState<unknown | null>(null);
  const [heroSlideIndex, setHeroSlideIndex] = useState(0);
  const [homeFeedPages, setHomeFeedPages] = useState<HomeFeedPages>({
    latestNotices: 1,
    priorityActions: 1,
    newIssued: 1
  });
  const [isHeroPaused, setIsHeroPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [safetyLiveSnapshot, setSafetyLiveSnapshot] = useState<HomeSafetySnapshot | null>(null);

  useEffect(() => {
    const isAdmin = !!user && ["admin", "ehs", "leader"].includes((user as { role?: string })?.role || "");
    api.fetchDocuments({ page: 1, pageSize: 5 }).then((payload) => setLatestDocuments(payload.items || []));
    api.fetchSafetyBulletins({ page: 1, pageSize: isAdmin ? 20 : 5, includeDrafts: isAdmin })
      .then((payload) => setBulletins(payload.items || []));
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSafetyLiveSnapshot(null);
      return undefined;
    }

    let active = true;
    Promise.all([
      fetchHomeSafetyArray("/api/warnings"),
      fetchHomeSafetyArray("/api/incidents"),
      fetchHomeSafetyArray("/api/kpi-entries")
    ])
      .then(([warnings, incidents, kpis]) => {
        if (active) setSafetyLiveSnapshot({ warnings, incidents, kpis });
      })
      .catch(() => {
        if (active) setSafetyLiveSnapshot(null);
      });

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setPrefersReducedMotion(motionQuery.matches);
    updateMotionPreference();

    if (typeof motionQuery.addEventListener === "function") {
      motionQuery.addEventListener("change", updateMotionPreference);
      return () => motionQuery.removeEventListener("change", updateMotionPreference);
    }
    motionQuery.addListener(updateMotionPreference);
    return () => motionQuery.removeListener(updateMotionPreference);
  }, []);

  const highActions = model.safetyActions.filter((action) => action.severity === "high");
  const priorityActionKeys = new Set<string>();
  const priorityActionFeed = [...highActions, ...model.safetyActions].filter((action) => {
    const actionKey = action.id || `${getText(action.title, lang)}-${action.due || ""}`;
    if (priorityActionKeys.has(actionKey)) return false;
    priorityActionKeys.add(actionKey);
    return true;
  });
  const allBulletins = bulletins.length ? bulletins : model.publishedBulletins || [];
  const featuredBulletin = allBulletins[0] || null;
  const featuredAction = highActions[0] || null;
  const setHomeFeedPage = (key: HomePagedFeedKey, page: number) => {
    setHomeFeedPages((current) => ({ ...current, [key]: Math.max(1, page) }));
  };
  const paginateHomeFeed = <T,>(key: HomePagedFeedKey, items: T[]) => {
    const pageSize = homeFeedPageSizes[key] || 3;
    const totalItems = Array.isArray(items) ? items.length : 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = Math.min(Math.max(1, homeFeedPages[key] || 1), totalPages);
    const start = (page - 1) * pageSize;
    return {
      items: (Array.isArray(items) ? items : []).slice(start, start + pageSize),
      page,
      pageSize,
      totalItems,
      totalPages
    };
  };
  const latestNoticePage = paginateHomeFeed("latestNotices", allBulletins);
  const priorityActionPage = paginateHomeFeed("priorityActions", priorityActionFeed);
  const newIssuedPage = paginateHomeFeed("newIssued", latestDocuments);
  const safetyTrainingRate = Math.round(
    Number(
      model.trainingAverage ||
        (model.departments.length
          ? model.departments.reduce((sum, department) => sum + Number(department.trainingRate || 0), 0) / model.departments.length
          : 0)
    )
  );
  const liveWarnings = Array.isArray(safetyLiveSnapshot?.warnings) ? safetyLiveSnapshot.warnings : null;
  const liveIncidents = Array.isArray(safetyLiveSnapshot?.incidents) ? safetyLiveSnapshot.incidents : null;
  const liveKpis = Array.isArray(safetyLiveSnapshot?.kpis) ? safetyLiveSnapshot.kpis : null;
  const liveApprovedKpis = liveKpis ? liveKpis.filter(isApprovedHomeKpi) : [];
  const liveSafetyScoreKpis = liveApprovedKpis.filter((item) => item.entryType === "safety_score_monthly");
  const liveAverageSafety = liveSafetyScoreKpis.length
    ? Math.round(liveSafetyScoreKpis.reduce((sum, item) => sum + Number(item.value || 0), 0) / liveSafetyScoreKpis.length)
    : null;
  const safetyAverage = liveAverageSafety ?? Math.round(Number(model.averageScore || 0));
  const safetyTrendValues = liveKpis ? buildHomeSafetyTrendValues(liveKpis) : [];
  const openWarnings = liveWarnings ? liveWarnings.filter(isOpenHomeWarning).length : Number(model.warningCount || model.openWarningCount || 0);
  const overdueWarnings = liveWarnings
    ? liveWarnings.filter((item) => isOpenHomeWarning(item) && isOverdueHomeWarning(item)).length
    : Number(model.overdueWarningCount || 0);
  const trackedWarnings = Math.max(0, openWarnings - overdueWarnings);
  const monthIncidents = liveIncidents
    ? liveIncidents.filter((item) => String(item.occurredDate || item.createdAt || "").startsWith(currentSafetyMonth())).length
    : Number(model.monthIncidentCount || model.incidentCount || 0);
  const totalIncidents = liveIncidents
    ? liveIncidents.length
    : Number(model.totalIncidentCount || model.incidentCount || monthIncidents || 0);
  const safetyKpis: HomeSafetyKpi[] = [
    {
      id: "score",
      icon: "🛡️",
      accent: "#22a050",
      tone: "good",
      trendDir: "up-good",
      value: `${safetyAverage || 96}%`,
      label: t("homeSafetyScore"),
      detail: liveApprovedKpis.length ? t("homeApprovedKpiAverage") : t("homeFallbackOverview"),
      sparkData: safetyTrendValues.length ? safetyTrendValues : [72, 76, 78, 84, 86, Number(safetyAverage || 89)],
      trend: null
    },
    {
      id: "training-rate",
      icon: "🎓",
      accent: "#1565c0",
      tone: "good",
      trendDir: "up-good",
      value: `${safetyTrainingRate}%`,
      label: t("homeSafetyTraining"),
      detail: `${t("homeTrainingTargetShort")} · ${safetyTrainingRate >= 100 ? t("homeTargetReached") : t("homeTargetNotReached")}`,
      sparkData: [0, 18, 34, 52, 71, safetyTrainingRate],
      trend: null
    },
    {
      id: "warnings",
      icon: "⚠️",
      accent: "#f9a825",
      tone: "watch",
      trendDir: "down-good",
      value: openWarnings,
      label: t("homeOpenWarnings"),
      detail: `${overdueWarnings} ${t("homeOverdue")} · ${trackedWarnings} ${t("homeTracked")}`,
      sparkData: [8, 9, 7, 6, 7, openWarnings],
      trend: null
    },
    {
      id: "incidents",
      icon: "📋",
      accent: "#ef4444",
      tone: "alert",
      trendDir: "down-good",
      value: monthIncidents,
      label: t("homeMonthIncidents"),
      detail: `${totalIncidents} ${t("homeIncidentData")}`,
      sparkData: [2, 4, 1, 3, 1, monthIncidents],
      trend: null
    }
  ];
  const featuredActionDepartment = featuredAction
    ? model.departments.find((department) => department.id === featuredAction.departmentId)
    : null;
  const openLatestBulletin = (bulletin: SafetyBulletin) => {
    setSelectedFeedKey("latestNotices");
    setSelectedBulletin(bulletin);
  };
  const heroSlides: HeroSlide[] = [
    { id: "slogan", kind: "slogan", label: t("companySafetyTitle") },
    ...(featuredBulletin
      ? [{
          id: `hero-notice-${featuredBulletin.id}`,
          kind: "notice" as const,
          Icon: Megaphone,
          label: t("latestNotices"),
          title: getText(featuredBulletin.title, lang),
          summary: getText(featuredBulletin.summary, lang),
          meta: [
            getText(featuredBulletin.audience, lang) || t("companyLevel"),
            featuredBulletin.date
          ].filter(Boolean).join(" - "),
          tone: "notice",
          onOpen: () => openLatestBulletin(featuredBulletin)
        }]
      : []),
    ...(featuredAction
      ? [{
          id: `hero-alert-${featuredAction.id}`,
          kind: "alert" as const,
          Icon: AlertTriangle,
          label: t("hotAlerts"),
          title: getText(featuredAction.title, lang),
          summary: t("safetyCommandSubtitle"),
          meta: [
            featuredActionDepartment ? getText(featuredActionDepartment.name, lang) : "",
            featuredAction.due ? `${t("dueDate")}: ${featuredAction.due}` : ""
          ].filter(Boolean).join(" - "),
          tone: "alert",
          onOpen: () => { setSelectedActionId(featuredAction.id); setSelectedFeedKey("hotAlerts"); }
        }]
      : [])
  ];
  const activeHeroIndex = heroSlides.length ? heroSlideIndex % heroSlides.length : 0;
  const activeHeroSlide = heroSlides[activeHeroIndex] || heroSlides[0];

  useEffect(() => {
    if (heroSlideIndex < heroSlides.length) return;
    setHeroSlideIndex(0);
  }, [heroSlideIndex, heroSlides.length]);

  useEffect(() => {
    if (heroSlides.length <= 1 || isHeroPaused || prefersReducedMotion) return undefined;
    const timer = window.setInterval(() => {
      setHeroSlideIndex((value) => (value + 1) % heroSlides.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [heroSlides.length, isHeroPaused, prefersReducedMotion]);

  const feedDescriptions: Record<HomeFeedKey, string> = {
    latestNotices: t("homeFeedLatestNoticesDescription"),
    priorityActions: t("homeFeedPriorityActionsDescription"),
    hotAlerts: t("homeFeedHotAlertsDescription"),
    newUpdates: t("homeFeedNewUpdatesDescription"),
    newIssued: t("homeFeedNewIssuedDescription")
  };
  const feedDetails: Record<HomeFeedKey, FeedDetail> = {
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
    priorityActions: {
      kind: "actions",
      title: t("safetyActionBoard"),
      description: feedDescriptions.priorityActions,
      tone: "alert",
      items: priorityActionFeed
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
  const updateBulletin = (saved: SafetyBulletin) => {
    setBulletins((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
  };
  const removeBulletin = (updated: SafetyBulletin) => {
    setBulletins((items) => items.filter((item) => item.id !== updated.id));
    setSelectedBulletin(null);
  };

  return (
    <div className="page home-page">
      <section className="portal-hero">
        <div className="portal-copy">
          <PortalHeroCarousel
            activeIndex={activeHeroIndex}
            onPauseChange={setIsHeroPaused}
            onSelect={setHeroSlideIndex}
            slide={activeHeroSlide}
            slides={heroSlides}
            t={t}
          />
          <h1 className="sr-only">{t("homeTitle")}</h1>
        </div>

        <div className="portal-menu-panel home-safety-kpi-panel" id="safety-snapshot">
          <div className="panel-header system-panel-header">
            <h2>{t("homeSafetySnapshot")}</h2>
            <Link className="view-all-link" to="/safety-6s">
              {t("homeViewSafetyDetail")}
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="system-kpi-grid home-safety-kpi-grid">
            {safetyKpis.map((item) => (
              <SystemKpiCard
                accent={item.accent}
                detail={item.detail}
                icon={item.icon}
                key={item.id}
                label={item.label}
                sparkData={item.sparkData}
                tone={item.tone}
                trend={item.trend}
                trendDir={item.trendDir}
                value={item.value}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="command-overview-grid home-command-grid metric-row">
        <CommandCard
          action={
            allBulletins.length ? (
              <ViewMoreButton onClick={() => setSelectedFeedKey("latestNotices")} t={t} />
            ) : null
          }
          icon={Megaphone}
          title={t("latestNotices")}
        >
          <div className="home-feed-body">
            <div className="feed-list home-paged-feed-list home-notice-list">
              {latestNoticePage.items.length ? (
                latestNoticePage.items.map((bulletin) => (
                  <BulletinItem
                    bulletin={bulletin}
                    compact
                    key={bulletin.id}
                    lang={lang}
                    onOpen={openLatestBulletin}
                    showDocumentActions={false}
                    showPoints={false}
                    t={t}
                  />
                ))
              ) : (
                <p className="empty-text compact">{t("noNewDocuments")}</p>
              )}
            </div>
            <HomeFeedPager
              onPageChange={(page) => setHomeFeedPage("latestNotices", page)}
              page={latestNoticePage.page}
              t={t}
              totalItems={latestNoticePage.totalItems}
              totalPages={latestNoticePage.totalPages}
            />
          </div>
        </CommandCard>

        <CommandCard
          action={<ViewMoreButton onClick={() => setSelectedFeedKey("priorityActions")} t={t} />}
          className="home-priority-card"
          icon={AlertTriangle}
          title={t("safetyActionBoard")}
          tone="alert"
          note={highActions.length > 0
            ? `🔥 ${highActions.length} mục ưu tiên cao đang hiển thị trên "Cảnh báo nóng"`
            : undefined}
        >
          <div className="home-feed-body">
            <div className="feed-list home-paged-feed-list home-priority-list">
              {priorityActionPage.items.length ? (
                priorityActionPage.items.map((action) => (
                  <ActionItem action={action} departments={model.departments} key={action.id || String(getText(action.title, lang))} lang={lang} onOpen={() => { setSelectedActionId(action.id); setSelectedFeedKey("priorityActions"); }} />
                ))
              ) : (
                <p className="empty-text compact">{t("noOpenActions")}</p>
              )}
            </div>
            <HomeFeedPager
              onPageChange={(page) => setHomeFeedPage("priorityActions", page)}
              page={priorityActionPage.page}
              t={t}
              totalItems={priorityActionPage.totalItems}
              totalPages={priorityActionPage.totalPages}
            />
          </div>
        </CommandCard>

        <CommandCard
          action={<ViewMoreButton onClick={() => setSelectedFeedKey("newIssued")} t={t} />}
          className="home-issued-card"
          icon={FileText}
          title={t("newIssued")}
        >
          <div className="home-feed-body">
            <div className="feed-list home-paged-feed-list home-issued-list">
              {newIssuedPage.items.length ? (
                newIssuedPage.items.map((document) => (
                  <DocumentMini
                    departments={model.departments}
                    document={document}
                    key={document.id}
                    lang={lang}
                    showDateStamp
                    t={t}
                  />
                ))
              ) : (
                <p className="empty-text compact">{t("noNewDocuments")}</p>
              )}
            </div>
            <HomeFeedPager
              onPageChange={(page) => setHomeFeedPage("newIssued", page)}
              page={newIssuedPage.page}
              t={t}
              totalItems={newIssuedPage.totalItems}
              totalPages={newIssuedPage.totalPages}
            />
          </div>
        </CommandCard>
      </section>

      <Suspense fallback={null}>
        {selectedFeed && selectedFeed.kind === "actions" ? (
          <ActionViewModal
            actions={(selectedFeed.items || []) as SafetyAction[]}
            departments={model.departments}
            initialId={selectedActionId}
            isEhsAdmin={!!user && ["admin","ehs","leader"].includes((user as { role?: string })?.role || "")}
            lang={lang}
            onClose={() => { setSelectedFeedKey(null); setSelectedActionId(undefined); }}
            onViewBulletins={() => {
              setSelectedFeedKey(null);
              setSelectedActionId(undefined);
              setTimeout(() => setSelectedFeedKey("latestNotices"), 0);
            }}
          />
        ) : selectedFeed && selectedFeed.kind !== "bulletins" ? (
          <FeedDetailModal
            departments={model.departments}
            feed={selectedFeed}
            lang={lang}
            onClose={() => setSelectedFeedKey(null)}
            onOpenBulletin={(bulletin: SafetyBulletin) => {
              setSelectedFeedKey(null);
              setSelectedBulletin(bulletin);
            }}
            t={t}
          />
        ) : null}

        {(selectedBulletin || selectedFeedKey === "latestNotices") && allBulletins.length > 0 && !showBulletinCreate ? (
          <SafetyBulletinViewModal
            bulletins={allBulletins}
            initialId={selectedBulletin?.id}
            openAsList={!selectedBulletin && selectedFeedKey === "latestNotices"}
            onClose={() => {
              setSelectedBulletin(null);
              if (selectedFeedKey === "latestNotices") setSelectedFeedKey(null);
            }}
            onCreateNew={() => setShowBulletinCreate(true)}
            onEdit={(rawBulletin) => {
              setBulletinEditData(rawBulletin);
              setShowBulletinCreate(true);
            }}
            onEdited={(updated) => {
              updateBulletin(updated as SafetyBulletin);
            }}
          />
        ) : null}
        {showBulletinCreate ? (
          <SafetyBulletinCreateModal
            initialData={bulletinEditData || undefined}
            editId={(bulletinEditData as SafetyBulletin | null)?.id}
            onClose={() => { setShowBulletinCreate(false); setBulletinEditData(null); }}
            onSaved={(b) => { updateBulletin(b as SafetyBulletin); setShowBulletinCreate(false); setBulletinEditData(null); }}
          />
        ) : null}
      </Suspense>

      <StructuredOverview lang={lang} model={model} t={t} />
    </div>
  );
}
