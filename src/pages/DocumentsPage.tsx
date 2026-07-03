import { AlertTriangle, CalendarClock, CheckCircle2, Download, ExternalLink, Eye, FileText, FolderOpen, LoaderCircle, Pencil, Search, Tags, Trash2, Upload, UserRound, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { loginStateForLocation, loginToForLocation } from "../auth/loginRedirect";
import { categories } from "../data";
import { Button, Card, Field, Pagination } from "../components/ui";
import type { HubDepartment, HubModel } from "../core/hubCore";
import type { HubLanguage, HubTranslate } from "../i18n-context";
import { api } from "../services/api";
import type { DocumentRecord } from "../services/api";
import { getText, languages } from "../i18n";
import { normalizeLocalizedText } from "../i18n-localized";
import type { ContentLanguage, LocalizedText } from "../i18n-localized";
import { getDocumentDisplayTitle } from "../utils/documentDisplay";
import OfficeFileViewer from "../components/OfficeFileViewer";
import "./DocumentsPage.css";

type DocumentListRecord = DocumentRecord & {
  createdBy?: string;
  createdByName?: string;
  departmentName?: string | Record<string, string>;
  storagePath?: string;
  updatedBy?: string;
  updatedByName?: string;
};
type DocumentsPageProps = {
  lang: HubLanguage;
  model: HubModel;
  t: HubTranslate;
};
type DocumentsPagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};
type UploadStatus = "error" | "idle" | "processing" | "selected" | "success" | "uploading" | "validating";
type UploadState = {
  documentId: string;
  fileName: string;
  fileSize: number;
  message: string;
  previewStatus: string;
  progress: number;
  status: UploadStatus;
};
type UploadFormState = {
  category: string;
  departmentId: string;
  file: File | null;
  language: string;
  title: string;
  titleI18n: LocalizedText;
  version: string;
};
type EditFormState = Omit<UploadFormState, "file"> & {
  departmentName: string;
};
type DepartmentOption = {
  customName: string;
  id: string;
  label: ReactNode;
};

const errorMessage = (error: unknown): string =>
  typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
    ? error.message
    : "";
const errorCode = (error: unknown): string =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : "";

const localeFor = (lang: HubLanguage): string => (lang === "ja" ? "ja-JP" : lang === "en" ? "en-US" : "vi-VN");

const formatDateTime = (value: unknown, lang: HubLanguage, t: HubTranslate): string => {
  if (!value) return t("noData");
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return t("noData");
  return new Intl.DateTimeFormat(localeFor(lang), {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
};

const formatFileSize = (bytes: unknown, lang: HubLanguage, t: HubTranslate): string => {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return t("sample");
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

const getDepartmentLabel = (document: DocumentListRecord, departments: HubDepartment[], lang: HubLanguage, t: HubTranslate): ReactNode => {
  if (document.departmentId === "company") return t("companyLevel");
  const department = departments.find((item) => item.id === document.departmentId);
  if (department) return getText(department.name, lang);
  if (document.departmentName && typeof document.departmentName === "object") return getText(document.departmentName, lang);
  if (typeof document.departmentName === "string" && document.departmentName) return document.departmentName;
  return document.departmentId || t("companyLevel");
};

const getUserLabel = (name: unknown, username: unknown, t: HubTranslate): string =>
  (typeof name === "string" && name) || (typeof username === "string" && username) || t("unknownUser");

const documentDownloadUrl = (document: DocumentListRecord): string => (document?.id ? api.documentFileUrl(document.id, "attachment") : document?.url || "");
const initialUploadState: UploadState = {
  status: "idle",
  progress: 0,
  fileName: "",
  fileSize: 0,
  message: "",
  documentId: "",
  previewStatus: ""
};
const uploadPhaseIndex: Record<UploadStatus, number> = {
  idle: -1,
  selected: 0,
  validating: 0,
  uploading: 1,
  processing: 2,
  success: 3,
  error: -1
};
const busyUploadStatuses = new Set<UploadStatus>(["validating", "uploading", "processing"]);
const emptyTitleI18n = (): LocalizedText => ({ vi: "", en: "", ja: "" });

function LocalizedTitleField({
  activeLang,
  disabled = false,
  fallback = "",
  label,
  onActiveLangChange,
  onChange,
  value
}: {
  activeLang: ContentLanguage;
  disabled?: boolean;
  fallback?: string;
  label: ReactNode;
  onActiveLangChange: (lang: ContentLanguage) => void;
  onChange: (value: LocalizedText) => void;
  value: unknown;
}) {
  const normalized = normalizeLocalizedText(value, fallback);
  return (
    <Field label={label}>
      <div className="localized-field">
        <div className="localized-tabs" role="tablist">
          {languages.map((item) => (
            <button
              aria-selected={activeLang === item.id}
              className={activeLang === item.id ? "active" : ""}
              disabled={disabled}
              key={item.id}
              onClick={() => onActiveLangChange(item.id as ContentLanguage)}
              role="tab"
              type="button"
            >
              {item.id.toUpperCase()}
            </button>
          ))}
        </div>
        <input
          disabled={disabled}
          required={activeLang === "vi"}
          value={normalized[activeLang] || ""}
          onChange={(event) => {
            onChange({ ...normalized, [activeLang]: event.target.value });
          }}
        />
      </div>
    </Field>
  );
}

function DocumentRow({
  document,
  departments,
  lang,
  onDelete,
  onEdit,
  t
}: {
  departments: HubDepartment[];
  document: DocumentListRecord;
  lang: HubLanguage;
  onDelete?: ((document: DocumentListRecord) => void) | null;
  onEdit?: ((document: DocumentListRecord) => void) | null;
  t: HubTranslate;
}) {
  const category = categories.find((item) => item.id === document.category);
  const sizeLabel = formatFileSize(document.size, lang, t);
  const departmentLabel = getDepartmentLabel(document, departments, lang, t);
  const createdAt = document.createdAt || document.uploadedAt;
  const updatedAt = document.updatedAt || document.uploadedAt;
  const createdBy = getUserLabel(document.createdByName, document.createdBy, t);
  const updatedBy = getUserLabel(document.updatedByName, document.updatedBy, t);
  const storagePath = document.storagePath || document.url || document.originalName || t("sample");
  const displayTitle = getDocumentDisplayTitle(document, t("previewDocument"), lang);

  return (
    <Card as="article" className="document-row">
      <div className="document-icon">
        <FileText size={22} />
      </div>
      <div className="document-info">
        <h3>{displayTitle}</h3>
        <p className="document-meta">
          <span>{category ? getText(category.label, lang) : document.category}</span>
          <span>{departmentLabel}</span>
          <span>{document.language?.toUpperCase()}</span>
          <span>v{document.version || "1.0"}</span>
          <span>{sizeLabel}</span>
        </p>
        <div className="document-audit-grid">
          <span>
            <UserRound size={14} />
            <strong>{t("createdBy")}</strong>
            {createdBy}
          </span>
          <span>
            <CalendarClock size={14} />
            <strong>{t("uploadedAt")}</strong>
            {formatDateTime(createdAt, lang, t)}
          </span>
          <span>
            <UserRound size={14} />
            <strong>{t("updatedBy")}</strong>
            {updatedBy}
          </span>
          <span>
            <CalendarClock size={14} />
            <strong>{t("updatedAt")}</strong>
            {formatDateTime(updatedAt, lang, t)}
          </span>
          <span className="document-audit-path">
            <FolderOpen size={14} />
            <strong>{t("storagePath")}</strong>
            {storagePath}
          </span>
        </div>
      </div>
      <div className="document-actions">
        {document.url ? (
          <Button
            as={Link}
            className="secondary-button small document-view-button"
            size="sm"
            to={`/documents/${document.id}/preview`}
            variant="secondary"
          >
            <Eye size={16} />
            {t("viewOnWeb")}
          </Button>
        ) : null}
        {document.url ? (
          <Button
            as="a"
            className="secondary-button small"
            download={document.originalName || document.fileName || true}
            href={documentDownloadUrl(document)}
            rel="noreferrer"
            size="sm"
            variant="secondary"
          >
            <Download size={16} />
            {t("download")}
          </Button>
        ) : (
          <span className="sample-tag">{t("sample")}</span>
        )}
        {onEdit ? <Button aria-label={`${t("edit")}: ${displayTitle}`} className="icon-button" iconOnly onClick={() => onEdit(document)} title={t("edit")} variant="secondary">
          <Pencil size={17} />
        </Button> : null}
        {onDelete ? <Button aria-label={`${t("delete")}: ${displayTitle}`} className="icon-button danger" iconOnly onClick={() => onDelete(document)} title={t("delete")} variant="danger">
          <Trash2 size={17} />
        </Button> : null}
      </div>
    </Card>
  );
}

function DocumentHeroSummaryItem({
  icon: Icon,
  label,
  value,
  tone = "good"
}: {
  icon: LucideIcon;
  label: ReactNode;
  tone?: string;
  value: ReactNode;
}) {
  const valueKind = typeof value === "number" ? "number-value" : "text-value";

  return (
    <div className={`document-hero-summary-item ${tone} ${valueKind}`}>
      <Icon size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function UploadStatusPanel({
  lang,
  onCancel,
  state,
  t
}: {
  lang: HubLanguage;
  onCancel: () => void;
  state: UploadState;
  t: HubTranslate;
}) {
  if (!state || state.status === "idle") return null;

  const isBusy = busyUploadStatuses.has(state.status);
  const StatusIcon = state.status === "success" ? CheckCircle2 : state.status === "error" ? AlertTriangle : LoaderCircle;
  const activePhase = uploadPhaseIndex[state.status] ?? -1;
  const steps = [
    t("uploadStepSelected"),
    t("uploadStepSending"),
    t("uploadStepProcessing"),
    t("uploadStepDone")
  ];

  return (
    <section className={`upload-status-card ${state.status}`} aria-live="polite">
      <div className="upload-status-head">
        <span className="upload-status-icon">
          <StatusIcon size={18} />
        </span>
        <div>
          <strong>{t("uploadStatus")}</strong>
          <p>{state.message}</p>
        </div>
        {isBusy ? (
          <Button className="secondary-button small" onClick={onCancel} size="sm" variant="secondary">
            {t("cancelUpload")}
          </Button>
        ) : null}
      </div>
      {state.fileName ? (
        <div className="upload-file-chip">
          <FileText size={15} />
          <span>{state.fileName}</span>
          <strong>{formatFileSize(state.fileSize, lang, t)}</strong>
        </div>
      ) : null}
      <div
        aria-label={t("uploadProgress")}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={state.progress || 0}
        className="upload-progress"
        role="progressbar"
      >
        <span style={{ width: `${Math.min(100, Math.max(0, state.progress || 0))}%` }} />
      </div>
      <div className="upload-step-list">
        {steps.map((step, index) => {
          const complete = state.status === "success" || activePhase > index;
          const active = activePhase === index && state.status !== "error" && state.status !== "success";
          return (
            <span className={complete ? "complete" : active ? "active" : state.status === "error" && index === Math.max(0, activePhase) ? "error" : ""} key={step}>
              {step}
            </span>
          );
        })}
      </div>
      {state.documentId ? (
        <Button as={Link} className="secondary-button small" size="sm" to={`/documents/${state.documentId}/preview`} variant="secondary">
          <Eye size={15} />
          {t("viewOnWeb")}
        </Button>
      ) : null}
    </section>
  );
}

export function DocumentsPage({ lang, t, model }: DocumentsPageProps) {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const uploadAbortRef = useRef<AbortController | null>(null);
  const canManage = ["admin", "ehs", "leader"].includes(user?.role);
  const [documents, setDocuments] = useState<DocumentListRecord[]>([]);
  const [pagination, setPagination] = useState<DocumentsPagination>({ page: 1, pageSize: 8, totalItems: 0, totalPages: 1 });
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  const [category, setCategory] = useState("all");
  const [departmentId, setDepartmentId] = useState("all");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingDocument, setEditingDocument] = useState<DocumentListRecord | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [titleEditorLang, setTitleEditorLang] = useState<ContentLanguage>("vi");
  const [editTitleEditorLang, setEditTitleEditorLang] = useState<ContentLanguage>("vi");
  const [form, setForm] = useState<UploadFormState>({
    title: "",
    titleI18n: emptyTitleI18n(),
    category: "safety",
    departmentId: "company",
    language: lang,
    version: "1.0",
    file: null
  });
  const [uploadState, setUploadState] = useState<UploadState>(initialUploadState);
  const uploadBusy = busyUploadStatuses.has(uploadState.status);
  const [quickViewFile, setQuickViewFile] = useState<File | null>(null);
  const [quickViewDragOver, setQuickViewDragOver] = useState(false);
  const quickViewInputRef = useRef<HTMLInputElement>(null);
  const activeFilterCount = [query.trim(), category !== "all", departmentId !== "all"].filter(Boolean).length;
  const uploadAccessLabel = canManage ? t("statusGood") : user ? t("viewOnly") : t("login");
  const loginTo = loginToForLocation(location);
  const loginState = loginStateForLocation(location);
  const heroSummaryItems = [
    { icon: FileText, label: t("documents"), value: pagination.totalItems, tone: "good" },
    { icon: Search, label: t("category"), value: categories.length, tone: "search" },
    { icon: Upload, label: t("departments"), value: model.departments.length, tone: "watch" },
    { icon: ExternalLink, label: t("upload"), value: uploadAccessLabel, tone: canManage ? "good" : "locked" }
  ];
  const departmentOptions: DepartmentOption[] = [
    { id: "company", label: t("companyLevel"), customName: "" },
    ...model.departments.map((item) => ({ id: item.id, label: getText(item.name, lang), customName: "" })),
    ...documents
      .filter(
        (item) =>
          item.departmentId &&
          item.departmentId !== "company" &&
          !model.departments.some((department) => department.id === item.departmentId)
      )
      .reduce<DepartmentOption[]>((items, item) => {
        if (items.some((department) => department.id === item.departmentId)) return items;
        items.push({
          id: item.departmentId || "",
          label: getDepartmentLabel(item, model.departments, lang, t),
          customName: typeof item.departmentName === "string" ? item.departmentName : item.departmentId || ""
        });
        return items;
      }, [])
  ];

  const load = async (page = pagination.page): Promise<void> => {
    setLoading(true);
    setMessage("");
    try {
      const payload = await api.fetchDocuments({
        q: query,
        category,
        departmentId,
        page,
        pageSize: pagination.pageSize
      });
      setDocuments((payload.items || []) as DocumentListRecord[]);
      setPagination((payload.pagination || pagination) as DocumentsPagination);
    } catch (err: unknown) {
      setMessage(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, [query, category, departmentId]);

  useEffect(() => {
    const urlQuery = searchParams.get("q") || "";
    setQuery((current) => (current === urlQuery ? current : urlQuery));
  }, [searchParams]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    const nextParams = new URLSearchParams(searchParams);
    if (value.trim()) nextParams.set("q", value);
    else nextParams.delete("q");
    setSearchParams(nextParams, { replace: true });
  };

  const handleFileSelect = (file: File | null) => {
    setForm({ ...form, file });
    setMessage("");
    if (!file) {
      setUploadState(initialUploadState);
      return;
    }
    setUploadState({
      status: "selected",
      progress: 0,
      fileName: file.name,
      fileSize: file.size,
      message: t("uploadFileSelected"),
      documentId: "",
      previewStatus: ""
    });
  };

  const handleCancelUpload = () => {
    uploadAbortRef.current?.abort();
  };

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const uploadForm = event.currentTarget;
    if (uploadBusy) return;
    if (!form.file) {
      setMessage(t("fileRequired"));
      setUploadState({
        ...initialUploadState,
        status: "error",
        message: t("fileRequired")
      });
      return;
    }
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setMessage("");
    setUploadState({
      status: "validating",
      progress: 0,
      fileName: form.file.name,
      fileSize: form.file.size,
      message: t("uploadPreparing"),
      documentId: "",
      previewStatus: ""
    });
    try {
      const titleFallback = form.title || form.file?.name?.replace(/\.[^.]+$/, "") || t("previewDocument");
      const titleI18n = normalizeLocalizedText(form.titleI18n, titleFallback);
      const uploadPayload = {
        ...form,
        title: titleI18n.vi || titleFallback,
        titleI18n
      };
      const uploaded = await api.uploadDocument(uploadPayload, "", {
        signal: controller.signal,
        onProgress: ({ percent }) => {
          setUploadState((current) => ({
            ...current,
            status: percent >= 100 ? "processing" : "uploading",
            progress: percent ?? current.progress,
            message: percent >= 100 ? t("uploadProcessing") : t("uploadingNow")
          }));
        }
      });
      uploadForm?.reset();
      setForm({ title: "", titleI18n: emptyTitleI18n(), category: "safety", departmentId: "company", language: lang, version: "1.0", file: null });
      await load(1);
      setUploadState({
        status: "success",
        progress: 100,
        fileName: uploaded.originalName || uploaded.fileName || form.file.name,
        fileSize: uploaded.size || form.file.size,
        message: t("uploadComplete"),
        documentId: uploaded.id || "",
        previewStatus: uploaded.previewStatus || ""
      });
      setMessage(t("saved"));
    } catch (err: unknown) {
      const nextErrorMessage = errorCode(err) === "UPLOAD_ABORTED" ? t("uploadCancelled") : errorMessage(err) || t("uploadFailed");
      setUploadState((current) => ({
        ...current,
        status: "error",
        progress: current.progress || 0,
        message: nextErrorMessage
      }));
      setMessage(nextErrorMessage);
    } finally {
      uploadAbortRef.current = null;
    }
  };

  const handleDelete = async (document: DocumentListRecord): Promise<void> => {
    try {
      await api.deleteDocument(document.id);
      await load(pagination.page);
      setMessage(t("saved"));
    } catch (err: unknown) {
      setMessage(errorMessage(err));
    }
  };

  const openEdit = (document: DocumentListRecord) => {
    setMessage("");
    setEditingDocument(document);
    const titleI18n = normalizeLocalizedText(document.titleI18n, document.title || document.originalName || "");
    setEditTitleEditorLang(lang);
    setEditForm({
      title: titleI18n.vi || document.title || "",
      titleI18n,
      category: document.category || "safety",
      departmentId: document.departmentId || "company",
      departmentName: typeof document.departmentName === "string" ? document.departmentName : "",
      language: document.language || lang,
      version: document.version || "1.0"
    });
  };

  const QUICK_VIEW_EXTS = [".xlsx",".xls",".docx",".pdf",".png",".jpg",".jpeg",".gif",".webp"];
  const isQuickViewable = (f: File) => QUICK_VIEW_EXTS.some(ext => f.name.toLowerCase().endsWith(ext));

  const handleQuickViewDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setQuickViewDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && isQuickViewable(f)) setQuickViewFile(f);
  };
  const handleQuickViewInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setQuickViewFile(f);
    e.target.value = "";
  };

  const closeEdit = () => {
    setEditingDocument(null);
    setEditForm(null);
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingDocument || !editForm) return;
    try {
      const titleI18n = normalizeLocalizedText(editForm.titleI18n, editForm.title || editingDocument.title || "");
      await api.updateDocument(editingDocument.id, {
        ...editForm,
        title: titleI18n.vi || editForm.title || editingDocument.title || "",
        titleI18n
      });
      await load(pagination.page);
      setMessage(t("saved"));
      closeEdit();
    } catch (err: unknown) {
      setMessage(errorMessage(err));
    }
  };

  return (
    <div className="page documents-page">
      <section className="title-band documents-title-band">
        <div>
          <h1>{t("sharedDocumentLibrary")}</h1>
          <p>{t("documentSubtitle")}</p>
          <div className="document-hero-summary" aria-label={t("commandOverview")}>
            {heroSummaryItems.map((item) => (
              <DocumentHeroSummaryItem
                icon={item.icon}
                key={item.label}
                label={item.label}
                tone={item.tone}
                value={item.value}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="document-layout">
        <aside className={`upload-panel ${canManage ? "can-manage" : "access-limited"}`}>
          <div className="upload-panel-head">
            <h2>{t("uploadDocument")}</h2>
            <span>{t("acceptedFiles")}</span>
          </div>
          {canManage ? <form onSubmit={handleUpload}>
            <LocalizedTitleField
              activeLang={titleEditorLang}
              disabled={uploadBusy}
              fallback={form.title}
              label={t("title")}
              onActiveLangChange={setTitleEditorLang}
              value={form.titleI18n}
              onChange={(titleI18n) => setForm({ ...form, title: titleI18n.vi || form.title, titleI18n })}
            />
            <Field label={t("category")}>
              <select disabled={uploadBusy} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {getText(item.label, lang)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("department")}>
              <select
                disabled={uploadBusy}
                value={form.departmentId}
                onChange={(event) => setForm({ ...form, departmentId: event.target.value })}
              >
                <option value="company">{t("companyLevel")}</option>
                {departmentOptions.slice(1).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-row">
              <Field label={t("language")}>
                <select disabled={uploadBusy} value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })}>
                  {languages.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("version")}>
                <input disabled={uploadBusy} value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} />
              </Field>
            </div>
            <Field label={t("file")}>
              <input
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.csv,.png,.jpg,.jpeg"
                disabled={uploadBusy}
                onChange={(event) => handleFileSelect(event.target.files?.[0] || null)}
                type="file"
              />
            </Field>
            <UploadStatusPanel lang={lang} onCancel={handleCancelUpload} state={uploadState} t={t} />
            <Button className="primary-button full-width" disabled={uploadBusy} size="full" type="submit">
              <Upload size={18} />
              {uploadBusy ? t("uploadProcessing") : t("upload")}
            </Button>
            {message ? <p className="form-message">{message}</p> : null}
          </form> : (
            <div className="login-required-panel">
              <p>{user ? t("viewerReadOnlyDocuments") : t("loginRequiredForDocuments")}</p>
              {user ? null : (
                <Button as={Link} className="primary-button full-width" size="full" state={loginState} to={loginTo}>
                  {t("login")}
                </Button>
              )}
            </div>
          )}

          {/* ── Quick View Drop Zone ── */}
          <div
            onDragOver={e => { e.preventDefault(); setQuickViewDragOver(true); }}
            onDragLeave={() => setQuickViewDragOver(false)}
            onDrop={handleQuickViewDrop}
            onClick={() => quickViewInputRef.current?.click()}
            style={{
              marginTop: 16,
              border: `2px dashed ${quickViewDragOver ? "#217346" : "#cbd5e1"}`,
              borderRadius: 10,
              padding: "18px 12px",
              textAlign: "center",
              cursor: "pointer",
              background: quickViewDragOver ? "#f0fdf4" : "#f8fafc",
              transition: "all .15s",
              userSelect: "none"
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 6 }}>📂</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 3 }}>
              Xem nhanh không cần upload
            </div>
            <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
              Kéo thả hoặc click để chọn<br />
              <strong>Excel · Word · PDF · Ảnh</strong>
            </div>
            <input
              ref={quickViewInputRef}
              type="file"
              accept=".xlsx,.xls,.docx,.pdf,.png,.jpg,.jpeg,.gif,.webp"
              style={{ display: "none" }}
              onChange={handleQuickViewInput}
            />
          </div>
        </aside>

        <div className="documents-main">
          {editingDocument && editForm ? (
            <section className="document-edit-panel">
              <div className="document-edit-panel-head">
                <div>
                  <h2>{t("editDocument")}</h2>
                  <p>{editingDocument.originalName || editingDocument.fileName}</p>
                </div>
                <Button aria-label={t("close")} className="icon-button" iconOnly onClick={closeEdit} title={t("close")} variant="secondary">
                  <X size={18} />
                </Button>
              </div>
              <form onSubmit={handleUpdate}>
                <LocalizedTitleField
                  activeLang={editTitleEditorLang}
                  fallback={editForm.title}
                  label={t("title")}
                  onActiveLangChange={setEditTitleEditorLang}
                  value={editForm.titleI18n}
                  onChange={(titleI18n) => setEditForm({ ...editForm, title: titleI18n.vi || editForm.title, titleI18n })}
                />
                <div className="form-row">
                  <Field label={t("category")}>
                    <select value={editForm.category} onChange={(event) => setEditForm({ ...editForm, category: event.target.value })}>
                      {categories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {getText(item.label, lang)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("department")}>
                    <select
                      value={editForm.departmentId}
                      onChange={(event) => {
                        const selected = departmentOptions.find((item) => item.id === event.target.value);
                        setEditForm({
                          ...editForm,
                          departmentId: event.target.value,
                          departmentName: selected?.customName || ""
                        });
                      }}
                    >
                      {departmentOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="form-row">
                  <Field label={t("language")}>
                    <select value={editForm.language} onChange={(event) => setEditForm({ ...editForm, language: event.target.value })}>
                      {languages.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("version")}>
                    <input value={editForm.version} onChange={(event) => setEditForm({ ...editForm, version: event.target.value })} />
                  </Field>
                </div>
                <div className="document-edit-actions">
                  <Button className="secondary-button" onClick={closeEdit} variant="secondary">
                    {t("cancel")}
                  </Button>
                  <Button className="primary-button" type="submit">
                    {t("save")}
                  </Button>
                </div>
              </form>
            </section>
          ) : null}
          <div className="filter-bar">
            <div className="search-box">
              <Search size={18} />
              <input aria-label={t("search")} onChange={(event) => handleQueryChange(event.target.value)} placeholder={t("search")} value={query} />
            </div>
            <select aria-label={t("category")} value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">{t("all")}</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {getText(item.label, lang)}
                </option>
              ))}
            </select>
            <select aria-label={t("department")} value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
              <option value="all">{t("all")}</option>
              <option value="company">{t("companyLevel")}</option>
              {departmentOptions.slice(1).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <Button aria-label={t("search")} className="icon-button" iconOnly onClick={() => load(1)} title={t("search")} variant="secondary">
              <Search size={18} />
            </Button>
          </div>

          <div className="document-category-rail" aria-label={t("category")}>
            <button
              className={category === "all" ? "active" : ""}
              onClick={() => setCategory("all")}
              type="button"
            >
              <Tags size={15} />
              {t("all")}
            </button>
            {categories.map((item) => (
              <button
                className={category === item.id ? "active" : ""}
                key={item.id}
                onClick={() => setCategory(item.id)}
                type="button"
              >
                {getText(item.label, lang)}
              </button>
            ))}
          </div>

          <div className="document-results-heading">
            <div>
              <h2>{t("documentResults")}</h2>
              <p>
                {t("activeFilters")}: {activeFilterCount}
              </p>
            </div>
            <span>{pagination.totalItems}</span>
          </div>

          {loading ? <p className="empty-text">{t("loading")}</p> : null}
          {!loading && !documents.length ? <p className="empty-text">{t("noDocuments")}</p> : null}
          <div className="document-list">
            {documents.map((document) => (
              <DocumentRow
                departments={model.departments}
                document={document}
                key={document.id}
                lang={lang}
                onDelete={canManage ? handleDelete : null}
                onEdit={canManage ? openEdit : null}
                t={t}
              />
            ))}
          </div>
          <Pagination pagination={pagination} onPageChange={load} />
        </div>
      </section>

      {quickViewFile && (
        <OfficeFileViewer
          url=""
          fileName={quickViewFile.name}
          fileObj={quickViewFile}
          onClose={() => setQuickViewFile(null)}
        />
      )}
    </div>
  );
}
