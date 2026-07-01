import { AlertTriangle, ClipboardCheck, FileText, ShieldCheck, Target, UserRound, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Navigate, Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ActionItem, BackLink, CheckList, DocumentMini, EmptyState, StatusPill } from "../components/ui";
import { api } from "../services/api";
import type { DocumentRecord } from "../services/api";
import type { HubModel } from "../core/hubCore";
import type { HubLanguage, HubTranslate } from "../i18n-context";
import { getText } from "../i18n";
import "./DepartmentPage.css";

type DepartmentPageProps = {
  lang: HubLanguage;
  model: HubModel;
  t: HubTranslate;
};

type DepartmentHeroSummaryItemProps = {
  icon: LucideIcon;
  label: ReactNode;
  tone?: string;
  value: ReactNode;
};

type DepartmentMetricTileProps = DepartmentHeroSummaryItemProps & {
  helper?: ReactNode;
  unit?: ReactNode;
};

function DepartmentHeroSummaryItem({ icon: Icon, label, value, tone = "good" }: DepartmentHeroSummaryItemProps) {
  return (
    <div className={`department-hero-summary-item ${tone}`}>
      <Icon size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DepartmentMetricTile({
  helper,
  icon: Icon,
  label,
  tone = "good",
  unit = "",
  value
}: DepartmentMetricTileProps) {
  return (
    <article className={`department-metric-tile ${tone}`}>
      <div className="department-metric-head">
        <span className="department-metric-icon">
          <Icon size={18} />
        </span>
        <span className="department-metric-label">{label}</span>
      </div>
      <div className="department-metric-value-row">
        <strong>{value}</strong>
        {unit ? <small>{unit}</small> : null}
      </div>
      {helper ? <span className="department-metric-helper">{helper}</span> : null}
    </article>
  );
}

export function DepartmentPage({ lang, t, model }: DepartmentPageProps) {
  const { id } = useParams();
  const department = model.departments.find((item) => item.id === id);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);

  useEffect(() => {
    if (!department) return;
    api
      .fetchDocuments({ departmentId: department.id, page: 1, pageSize: 4 })
      .then((payload) => setDocuments(payload.items || []));
  }, [department]);

  if (!department) return <Navigate to="/safety-6s" replace />;

  const actions = model.safetyActions.filter((action) => action.departmentId === department.id);
  const localizedRisks = getText(department.risks, lang);
  const localizedChecklist = getText(department.checklist, lang);
  const risks = Array.isArray(localizedRisks) ? localizedRisks : [];
  const checklist = Array.isArray(localizedChecklist) ? localizedChecklist : [];
  const riskCount = risks.length;
  const checklistCount = checklist.length;
  const nextAction = [...actions].sort((left, right) => String(left.due).localeCompare(String(right.due)))[0];
  const trainingRateValue = Number(department.trainingRate) || 0;
  const riskStatusLabel = t(
    department.riskLevel === "good" ? "statusGood" : department.riskLevel === "watch" ? "statusWatch" : "statusAlert"
  );
  const heroSummaryItems = [
    { icon: ShieldCheck, label: t("riskLevel"), value: riskStatusLabel, tone: department.riskLevel },
    { icon: AlertTriangle, label: t("keyRisks"), value: riskCount, tone: riskCount ? "watch" : "good" },
    { icon: ClipboardCheck, label: t("checklist"), value: checklistCount, tone: "good" },
    { icon: FileText, label: t("documents"), value: documents.length, tone: "link" }
  ];

  return (
    <div className="page department-page">
      <section className="title-band department-title-band">
        <div>
          <BackLink to="/safety-6s">{t("safety")}</BackLink>
          <h1>{getText(department.name, lang)}</h1>
          <p>
            {t("owner")}: {department.owner}
          </p>
          <div className="department-hero-summary" aria-label={t("commandOverview")}>
            {heroSummaryItems.map((item) => (
              <DepartmentHeroSummaryItem
                icon={item.icon}
                key={item.label}
                label={item.label}
                tone={item.tone}
                value={item.value}
              />
            ))}
          </div>
        </div>
        <StatusPill status={department.riskLevel} t={t} />
      </section>

      <section className="department-metric-grid" aria-label={t("commandOverview")}>
        <DepartmentMetricTile
          helper={riskStatusLabel}
          icon={ClipboardCheck}
          label={t("auditScore")}
          tone={department.riskLevel}
          unit="%"
          value={department.score}
        />
        <DepartmentMetricTile
          helper={nextAction ? `${t("dueDate")}: ${nextAction.due}` : t("statusGood")}
          icon={AlertTriangle}
          label={t("openActions")}
          tone={department.openActions ? "alert" : "good"}
          value={department.openActions}
        />
        <DepartmentMetricTile
          helper={`${t("homeTrainingTarget")}: 100%`}
          icon={Users}
          label={t("training")}
          tone={trainingRateValue >= 95 ? "good" : "watch"}
          unit="%"
          value={department.trainingRate}
        />
      </section>

      <section className="department-command-strip">
        <div className="department-command-card">
          <UserRound size={18} />
          <span>{t("owner")}</span>
          <strong>{department.owner || "-"}</strong>
        </div>
        <div className="department-command-card warning">
          <Target size={18} />
          <span>{t("priorityFocus")}</span>
          <strong>{risks[0] || t("statusGood")}</strong>
        </div>
        <div className="department-command-card action">
          <ClipboardCheck size={18} />
          <span>{t("nextAction")}</span>
          <strong>{nextAction ? getText(nextAction.title, lang) : t("noOpenActions")}</strong>
          {nextAction ? <small>{t("dueDate")}: {nextAction.due}</small> : null}
        </div>
        <Link className="department-command-card link" to="/documents">
          <FileText size={18} />
          <span>{t("documents")}</span>
          <strong>{t("openDocs")}</strong>
        </Link>
      </section>

      <section className="department-detail">
        <div className="detail-panel">
          <h2>{t("keyRisks")}</h2>
          <CheckList items={risks} tone="risk" />
        </div>
        <div className="detail-panel">
          <h2>{t("checklist")}</h2>
          <CheckList items={checklist} />
        </div>
        <div className="detail-panel wide">
          <div className="panel-header">
            <h2>{t("openActions")}</h2>
            <Link to="/documents">{t("documents")}</Link>
          </div>
          <div className="action-stack">
            {actions.length ? (
              actions.map((action) => (
                <ActionItem action={action} departments={model.departments} key={action.id} lang={lang} />
              ))
            ) : (
              <EmptyState>{t("statusGood")}</EmptyState>
            )}
          </div>
          <div className="linked-documents">
            {documents.length ? (
              documents.map((document) => (
                <DocumentMini
                  departments={model.departments}
                  document={document}
                  key={document.id}
                  lang={lang}
                  t={t}
                />
              ))
            ) : (
              <EmptyState>{t("noDocuments")}</EmptyState>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
