import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Database,
  FileArchive,
  HardDrive,
  RefreshCw,
  Save,
  Server,
  ShieldCheck
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { loginStateForLocation, loginToForLocation } from "../auth/loginRedirect";
import { Button, Card, MetricCard, Pagination, StatusPill } from "../components/ui";
import type { HubLanguage, HubTranslate } from "../i18n-context";
import { api } from "../services/api";
import "./operations-admin.css";

type RuntimeFileStatus = {
  bytes?: number | string;
  count?: number;
  exists?: boolean;
  updatedAt?: string;
};
type ReadinessCheck = {
  id: string;
  label: string;
  ok: boolean;
};
type SystemStatus = {
  counts?: {
    backups?: number;
    departments?: number;
    uploadedFiles?: number;
  };
  environment?: {
    allowedOrigins?: string[];
    enableLegacyAdminPin?: boolean;
    maxUploadMb?: number;
    trustProxy?: boolean;
    usesDefaultAdminPin?: boolean;
  };
  host?: {
    name?: string;
  };
  node?: string;
  readiness?: {
    checks?: ReadinessCheck[];
    ready?: boolean;
  };
  runtimeFiles?: {
    config?: RuntimeFileStatus;
    documents?: RuntimeFileStatus;
    uploads?: RuntimeFileStatus;
  };
  uptimeSeconds?: number;
  warnings?: string[];
};
type PreflightActionEvidence = {
  currentUser?: {
    isAdministrator?: boolean;
    name?: string;
  };
};
type PreflightActionItem = {
  action?: string;
  detail?: string;
  evidence?: PreflightActionEvidence;
  group?: string;
  name?: string;
  tone?: string;
};
type SystemPreflight = {
  administratorActions?: PreflightActionItem[];
  blockingActions?: PreflightActionItem[];
  generatedAtUtc?: string;
  maintenanceActions?: PreflightActionItem[];
  productionReady?: boolean;
  summary?: {
    administratorActions?: number;
    blockingActions?: number;
    maintenanceActions?: number;
  };
};
type ActivityItem = {
  actor?: string;
  id: string;
  level?: string;
  message?: string;
  target?: string;
  ts?: string;
  type?: string;
};
type BackupItem = {
  copied?: string[];
  id: string;
};
type ActivityPagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

const errorMessage = (error: unknown): string =>
  typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
    ? error.message
    : "";

const localeFor = (lang: HubLanguage): string => (lang === "ja" ? "ja-JP" : lang === "en" ? "en-US" : "vi-VN");

const formatDate = (value: unknown, lang: HubLanguage): string => {
  if (!value) return "-";
  return new Intl.DateTimeFormat(localeFor(lang), {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(new Date(String(value)));
};

const formatBytes = (bytes: unknown, lang: HubLanguage, t: HubTranslate): string => {
  const value = Number(bytes);
  if (!Number.isFinite(value)) return "-";
  if (value < 1024) return `${new Intl.NumberFormat(localeFor(lang)).format(value)} ${t("bytesUnit")}`;

  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${new Intl.NumberFormat(localeFor(lang), {
    maximumFractionDigits: size >= 10 ? 1 : 2
  }).format(size)} ${units[unitIndex]}`;
};

const formatUptime = (seconds = 0) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

const compactPreflightAction = (action: unknown = "", t: HubTranslate): string => {
  const text = String(action || "");
  if (text.includes("ops:secrets")) {
    return t("opsPreflightSecretsAction");
  }

  if (text.includes("ops:service:repair-apply") || text.includes("repair-mhchub-service-recovery-windows.ps1")) {
    return t("opsPreflightServiceRepairAction");
  }

  if (text.includes("clean-dist-stale-assets.ps1")) {
    const count = text.match(/ConfirmStaleCount\s+(\d+)/)?.[1] || "";
    return t("opsPreflightCleanDistAction", {
      countText: count ? t("opsPreflightCleanDistCount", { count }) : ""
    });
  }

  if (text.includes("audit:live-api-runtime") || text.includes("live MHChub process")) {
    return t("opsPreflightLiveRuntimeAction");
  }

  return text;
};

const preflightActionDetail = (item: PreflightActionItem = {}, t: HubTranslate): string => {
  const currentUser = item.evidence?.currentUser;
  if (!currentUser?.name) return "";

  if (currentUser.isAdministrator) {
    return t("opsCurrentUserAdmin", { name: currentUser.name });
  }

  return t("opsCurrentUserNotAdmin", { name: currentUser.name });
};

function RuntimeFileCard({
  label,
  value,
  lang,
  t
}: {
  label: ReactNode;
  lang: HubLanguage;
  t: HubTranslate;
  value?: RuntimeFileStatus;
}) {
  return (
    <Card className="runtime-file-card">
      <Database size={18} />
      <div>
        <strong>{label}</strong>
        <span>
          {value?.exists ? `${formatBytes(value.bytes, lang, t)} · ${formatDate(value.updatedAt, lang)}` : "-"}
        </span>
      </div>
    </Card>
  );
}

function OperationsHeroSummaryItem({
  icon: Icon,
  label,
  value,
  tone = "blue"
}: {
  icon: LucideIcon;
  label: ReactNode;
  tone?: string;
  value: ReactNode;
}) {
  return (
    <div className={`control-summary-card ${tone}`}>
      <Icon size={16} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function PreflightActionList({ actions, emptyLabel }: { actions: PreflightActionItem[]; emptyLabel: ReactNode }) {
  if (!actions.length) return <p className="empty-text compact">{emptyLabel}</p>;

  return (
    <div className="preflight-action-list">
      {actions.map((item) => (
        <div className={`preflight-action-row ${item.tone}`} key={`${item.group}-${item.name}`}>
          <span>{item.group}</span>
          <div className="preflight-action-copy">
            <strong>{item.action}</strong>
            {item.detail ? <small>{item.detail}</small> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function OperationsPage({ lang, t }: { lang: HubLanguage; t: HubTranslate }) {
  const { user } = useAuth();
  const location = useLocation();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [preflight, setPreflight] = useState<SystemPreflight | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityPagination, setActivityPagination] = useState<ActivityPagination>({ page: 1, pageSize: 8, totalItems: 0, totalPages: 1 });
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");

  const load = async (page = activityPagination.page): Promise<void> => {
    setIsLoading(true);
    try {
      const [nextStatus, nextPreflight, nextActivity, nextBackups] = await Promise.all([
        api.fetchSystemStatus(),
        api.fetchSystemPreflight().catch((): null => null),
        api.fetchActivity({ page, pageSize: activityPagination.pageSize }),
        api.fetchBackups()
      ]);
      setStatus(nextStatus as SystemStatus);
      setPreflight(nextPreflight as SystemPreflight | null);
      setActivity((nextActivity.items || []) as ActivityItem[]);
      setActivityPagination((nextActivity.pagination || activityPagination) as ActivityPagination);
      setBackups((nextBackups || []) as BackupItem[]);
      setLastUpdatedAt(new Date().toISOString());
      setMessage("");
    } catch (err: unknown) {
      setMessage(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  const handleBackup = async () => {
    setMessage("");
    try {
      await api.createBackup("", "manual-from-operations-page");
      await load(1);
      setMessage(t("saved"));
    } catch (err: unknown) {
      setMessage(errorMessage(err));
    }
  };

  const readinessChecks = status?.readiness?.checks || [];
  const readyCheckCount = readinessChecks.filter((check) => check.ok).length;
  const warningCount = status?.warnings?.length ?? 0;
  const runtimeFileCount = status
    ? [status.runtimeFiles?.config, status.runtimeFiles?.documents, status.runtimeFiles?.uploads].filter(
        (item) => item?.exists
      ).length
    : 0;
  const commandTone = !status ? "loading" : status.readiness?.ready ? "good" : "watch";
  const commandTitle = !status
    ? t("operationsLoading")
    : status.readiness?.ready
      ? t("operationsHealthy")
      : t("operationsNeedsAttention");
  const preflightActions = preflight
    ? [
        ...(preflight.blockingActions || []).map((item): PreflightActionItem => ({ ...item, group: t("blockingActions"), tone: "alert" })),
        ...(preflight.administratorActions || []).map((item): PreflightActionItem => ({ ...item, group: t("administratorActions"), tone: "watch" })),
        ...(preflight.maintenanceActions || []).map((item): PreflightActionItem => ({ ...item, group: t("maintenanceActions"), tone: "blue" }))
      ].map((item) => ({
        ...item,
        action: compactPreflightAction(item.action, t),
        detail: preflightActionDetail(item, t)
      }))
    : [];
  const preflightOpenCount = preflight
    ? Number(preflight.summary?.blockingActions || 0)
      + Number(preflight.summary?.administratorActions || 0)
      + Number(preflight.summary?.maintenanceActions || 0)
    : 0;
  const preflightTone = preflight?.productionReady ? "good" : "watch";
  const loginTo = loginToForLocation(location);
  const loginState = loginStateForLocation(location);

  return (
    <div className="page operations-page">
      <section className="title-band operations-title-band">
        <div className="operations-title-copy">
          <h1>{t("operationsTitle")}</h1>
          <p>{t("operationsSubtitle")}</p>
        </div>
        <div className="operations-title-panel">
          <Button className="secondary-button" disabled={isLoading} onClick={() => load(1)} variant="secondary">
            <RefreshCw size={18} />
            {isLoading ? t("refreshing") : t("refresh")}
          </Button>
          <div className="control-hero-summary operations-hero-summary">
            <OperationsHeroSummaryItem
              icon={ShieldCheck}
              label={t("readyChecks")}
              tone={status?.readiness?.ready ? "good" : "watch"}
              value={status ? `${readyCheckCount}/${readinessChecks.length}` : "-"}
            />
            <OperationsHeroSummaryItem
              icon={AlertTriangle}
              label={t("warningsOpen")}
              tone={warningCount ? "alert" : "good"}
              value={status ? warningCount : "-"}
            />
            <OperationsHeroSummaryItem
              icon={Database}
              label={t("runtimeFiles")}
              tone="blue"
              value={status ? runtimeFileCount : "-"}
            />
            <OperationsHeroSummaryItem
              icon={Activity}
              label={t("activityLog")}
              tone="violet"
              value={activityPagination.totalItems}
            />
          </div>
        </div>
      </section>

      <section className={`operations-command-strip ${commandTone}`}>
        <div className="ops-command-main">
          <span className="ops-command-icon">
            {status?.readiness?.ready ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          </span>
          <div>
            <strong>{message && !status ? message : commandTitle}</strong>
            <p>{t("operationsHealthDetail")}</p>
          </div>
        </div>
        <div className="ops-command-meta">
          <span>{t("lastUpdated")}</span>
          <strong>{lastUpdatedAt ? formatDate(lastUpdatedAt, lang) : "-"}</strong>
        </div>
      </section>

      <section className="metric-row">
        <MetricCard icon={Server} label={t("systemStatus")} value={status ? t("online") : t("loadingShort")} />
        <MetricCard
          icon={status?.readiness?.ready ? CheckCircle2 : AlertTriangle}
          label={t("readiness")}
          value={!status ? t("loadingShort") : status.readiness?.ready ? t("ready") : t("notReady")}
          tone={status?.readiness?.ready ? "good" : "alert"}
        />
        <MetricCard icon={Clock} label={t("uptime")} value={status ? formatUptime(status.uptimeSeconds) : "-"} />
        <MetricCard icon={Archive} label={t("backups")} value={status?.counts?.backups ?? "-"} />
      </section>

      <section className="operations-grid">
        <div className="detail-panel">
          <div className="panel-header">
            <h2>{t("systemStatus")}</h2>
            <StatusPill status={status?.readiness?.ready ? "good" : "watch"} t={t} />
          </div>
          <div className="ops-status-grid">
            <div>
              <span>{t("hostName")}</span>
              <strong>{status?.host?.name || "-"}</strong>
            </div>
            <div>
              <span>{t("nodeRuntime")}</span>
              <strong>{status?.node || "-"}</strong>
            </div>
            <div>
              <span>{t("uploadedFiles")}</span>
              <strong>{status?.counts?.uploadedFiles ?? "-"}</strong>
            </div>
            <div>
              <span>{t("departments")}</span>
              <strong>{status?.counts?.departments ?? "-"}</strong>
            </div>
          </div>
        </div>

        <div className="detail-panel">
          <div className="panel-header">
            <h2>{t("readiness")}</h2>
            <ShieldCheck size={20} />
          </div>
          <div className="readiness-list">
            {readinessChecks.length ? (
              readinessChecks.map((check) => (
                <div className={`readiness-row ${check.ok ? "ok" : "fail"}`} key={check.id}>
                  {check.ok ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                  <span>{check.label}</span>
                </div>
              ))
            ) : (
              <p className="empty-text compact">{isLoading ? t("loading") : t("noData")}</p>
            )}
          </div>
        </div>

        <div className={`detail-panel preflight-panel ${preflightTone}`}>
          <div className="panel-header">
            <h2>{t("productionPreflight")}</h2>
            <StatusPill status={preflight?.productionReady ? "good" : "watch"} t={t} />
          </div>
          <div className="preflight-summary-grid">
            <div>
              <ClipboardCheck size={17} />
              <span>{t("productionReady")}</span>
              <strong>{preflight ? (preflight.productionReady ? t("ready") : t("notReady")) : t("loadingShort")}</strong>
            </div>
            <div>
              <AlertTriangle size={17} />
              <span>{t("actionRequired")}</span>
              <strong>{preflight ? preflightOpenCount : "-"}</strong>
            </div>
          </div>
          <PreflightActionList actions={preflightActions} emptyLabel={preflight ? t("preflightNoActions") : t("loading")} />
          <p className="preflight-footnote">
            {preflight?.generatedAtUtc ? `${t("lastUpdated")}: ${formatDate(preflight.generatedAtUtc, lang)}` : t("preflightRunHint")}
          </p>
        </div>
      </section>

      <section className="two-column-section">
        <div className="detail-panel">
          <div className="panel-header">
            <h2>{t("runtimeFiles")}</h2>
            <HardDrive size={20} />
          </div>
          <div className="runtime-file-list">
            <RuntimeFileCard label="config.json" lang={lang} t={t} value={status?.runtimeFiles?.config} />
            <RuntimeFileCard label="documents.json" lang={lang} t={t} value={status?.runtimeFiles?.documents} />
            <Card className="runtime-file-card">
              <Database size={18} />
              <div>
                <strong>{t("uploadsFolder")}</strong>
                <span>
                  {new Intl.NumberFormat(localeFor(lang)).format(status?.runtimeFiles?.uploads?.count ?? 0)}{" "}
                  {t("filesUnit")}
                </span>
              </div>
            </Card>
          </div>
        </div>

        <div className="detail-panel">
          <div className="panel-header">
            <h2>{t("backupCenter")}</h2>
            <FileArchive size={20} />
          </div>
          <div className="backup-form">
            {user ? (
              <>
                <p className="admin-auth-note">{t("adminLoginActive")}</p>
                <Button className="primary-button" onClick={handleBackup}>
                  <Save size={18} />
                  {t("createBackup")}
                </Button>
              </>
            ) : (
              <div className="login-required-panel">
                <p>{t("loginRequiredForBackup")}</p>
                <Button as={Link} className="primary-button full-width" size="full" state={loginState} to={loginTo}>
                  {t("login")}
                </Button>
              </div>
            )}
            {message ? <p className="form-message">{message}</p> : null}
          </div>
        </div>
      </section>

      <section className="two-column-section">
        <div className="detail-panel">
          <div className="panel-header">
            <h2>{t("warnings")}</h2>
            <AlertTriangle size={20} />
          </div>
          <div className="warning-list">
            {status?.warnings?.length ? (
              status.warnings.map((warning) => (
                <div className="warning-row" key={warning}>
                  <AlertTriangle size={17} />
                  <span>{warning}</span>
                </div>
              ))
            ) : isLoading && !status ? (
              <p className="empty-text">{t("loading")}</p>
            ) : (
              <p className="empty-text">{t("noWarnings")}</p>
            )}
          </div>
        </div>

        <div className="detail-panel">
          <div className="panel-header">
            <h2>{t("security")}</h2>
            <ShieldCheck size={20} />
          </div>
          <div className="ops-status-grid">
            <div>
              <span>{t("maxUpload")}</span>
              <strong>{status?.environment?.maxUploadMb ?? "-"} MB</strong>
            </div>
            <div>
              <span>{t("trustProxy")}</span>
              <strong>{String(status?.environment?.trustProxy ?? false)}</strong>
            </div>
            <div>
              <span>{t("allowedOrigins")}</span>
              <strong>{status?.environment?.allowedOrigins?.length ?? "-"}</strong>
            </div>
            <div>
              <span>{t("legacyPin")}</span>
              <strong>
                {status?.environment?.enableLegacyAdminPin
                  ? status?.environment?.usesDefaultAdminPin
                    ? t("statusAlert")
                    : t("statusGood")
                  : t("statusGood")}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <section className="two-column-section">
        <div className="detail-panel">
          <div className="panel-header">
            <h2>{t("latestBackups")}</h2>
            <Archive size={20} />
          </div>
          <div className="backup-list">
            {backups.length ? (
              backups.slice(0, 5).map((backup) => (
                <Card className="backup-row" key={backup.id}>
                  <strong>{backup.id}</strong>
                  <span>{backup.copied?.join(", ") || "-"}</span>
                </Card>
              ))
            ) : (
              <p className="empty-text">{isLoading ? t("loading") : t("noData")}</p>
            )}
          </div>
        </div>
      </section>

      <section className="admin-section">
        <div className="panel-header">
          <h2>{t("activityLog")}</h2>
          <Activity size={20} />
        </div>
        <div className="activity-list">
          {activity.length ? (
            activity.map((item) => (
              <article className="activity-row" key={item.id}>
                <span className={`activity-level ${item.level}`}>{item.type}</span>
                <div>
                  <strong>{item.message}</strong>
                  <small>
                    {formatDate(item.ts, lang)} - {item.actor} - {item.target || "-"}
                  </small>
                </div>
              </article>
            ))
          ) : (
            <p className="empty-text">{isLoading ? t("loading") : t("noData")}</p>
          )}
        </div>
        <Pagination pagination={activityPagination} onPageChange={(page) => load(page)} />
      </section>
    </div>
  );
}
