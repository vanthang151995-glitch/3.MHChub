import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, Download, Eye, FileBarChart, FileCheck2, FileSearch, FileText, Folder, Layers3, Loader2, Paperclip, RefreshCw, Search, UploadCloud, X } from "lucide-react";
import { apiFetch, asArray } from "./safety-api";
import { ErrorPanel, LoadingPanel, ModalShell } from "./safety-shared";
import { SafetyI18nRender } from "./safety-i18n-render";
import { useHubLanguage } from "../../i18n-context";
import { localizedText } from "../../i18n-localized";
import { SafetyLocalizedTextField, emptySafetyLocalizedText, safetyLocalizedPayload, safetyLocalizedVi } from "./safety-localized-form";
type SafetyDocument = {
    id: string;
    title: string;
    titleI18n?: Record<string, string | undefined>;
    category: string;
    departmentId: string;
    departmentName?: string;
    version?: string;
    originalName?: string;
    fileName?: string;
    mimeType?: string;
    size?: number;
    uploadedAt?: string;
    url?: string;
    source?: string;
    sourcePath?: string;
    documentCode?: string;
    documentType?: string;
    scopeLevel?: string;
    ownerRole?: string;
    section6s?: string;
    effectiveDate?: string;
    tags?: string[];
    checksum?: string;
    ocrStatus?: string;
    ocrError?: string;
};
type DocumentTextPayload = {
    document: SafetyDocument;
    chunks: Array<{
        chunkIndex: number;
        sourcePage?: string;
        text: string;
        extractionMethod?: string;
        ocrStatus?: string;
    }>;
};
const CATEGORY_LABEL: Record<string, string> = {
    "kyt": "KYT",
    "medical-first-aid": "Y tế / sơ cứu",
    "pccc": "PCCC",
    "safety-improvement": "Cải tiến / CAPA",
    "safety-meeting": "Họp an toàn",
    "safety-overview": "Tổng quan ATVSLĐ",
    "safety-roster": "Danh sách ATV",
    "self-inspection": "Tự kiểm tra ATVSLĐ",
    "sixs-daily-checklist": "Checklist 6S",
    "sixs-scoring": "Chấm điểm 6S",
    "sixs-standard": "Tiêu chuẩn 3S"
};
const OCR_LABEL: Record<string, string> = {
    converter_required: "Cần converter",
    indexed: "Đã index",
    ocr_required: "Cần OCR",
    queued: "Đang chờ OCR",
    text_empty: "Không có text",
    unsupported: "Chưa hỗ trợ"
};
function formatSize(bytes = 0) {
    if (!bytes)
        return "-";
    if (bytes >= 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
}
function formatDate(value = "") {
    if (!value)
        return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value.slice(0, 10);
    return date.toISOString().slice(0, 10);
}
function docIcon(document: SafetyDocument) {
    const mime = `${document.mimeType || ""} ${document.originalName || ""}`.toLowerCase();
    if (mime.includes("sheet") || mime.includes(".xls"))
        return FileBarChart;
    return FileText;
}
function documentTitle(document: SafetyDocument | null | undefined, lang = "vi") {
    if (!document)
        return "Tài liệu";
    return localizedText(document.titleI18n, lang, document.title || document.originalName || document.fileName || "Tài liệu") ||
        document.title ||
        document.originalName ||
        document.fileName ||
        "Tài liệu";
}
function ocrClass(status = "") {
    if (status === "indexed")
        return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (status === "ocr_required" || status === "converter_required")
        return "border-amber-200 bg-amber-50 text-amber-700";
    if (status === "queued")
        return "border-blue-200 bg-blue-50 text-blue-700";
    return "border-slate-200 bg-slate-50 text-slate-600";
}
export function SafetyDocumentsPage() {
    const { lang } = useHubLanguage();
    const [documents, setDocuments] = useState<SafetyDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<unknown>(null);
    const [query, setQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [scopeFilter, setScopeFilter] = useState("all");
    const [ocrFilter, setOcrFilter] = useState("all");
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<string>("");
    const [textTarget, setTextTarget] = useState<DocumentTextPayload | null>(null);
    const [textLoading, setTextLoading] = useState(false);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [uploadCategory, setUploadCategory] = useState("safety-general");
    const [uploadTitleI18n, setUploadTitleI18n] = useState(emptySafetyLocalizedText());
    const [uploadVersion, setUploadVersion] = useState("1.0");
    const inputRef = useRef<HTMLInputElement>(null);
    const loadDocuments = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const payload = await apiFetch<unknown>("/api/documents?pageSize=200");
            setDocuments(asArray<SafetyDocument>(payload));
        }
        catch (requestError) {
            setError(requestError);
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        loadDocuments();
    }, [loadDocuments]);
    const filteredDocuments = useMemo(() => {
        const q = query.trim().toLowerCase();
        return documents.filter((document) => {
            const displayTitle = documentTitle(document, lang);
            const matchesQuery = !q ||
                [displayTitle, document.title, document.originalName, document.documentCode, document.category, document.sourcePath, ...(document.tags || [])]
                    .some((value) => String(value || "").toLowerCase().includes(q));
            const matchesCategory = categoryFilter === "all" || document.category === categoryFilter;
            const matchesScope = scopeFilter === "all" || document.scopeLevel === scopeFilter;
            const matchesOcr = ocrFilter === "all" || document.ocrStatus === ocrFilter;
            return matchesQuery && matchesCategory && matchesScope && matchesOcr;
        });
    }, [categoryFilter, documents, lang, ocrFilter, query, scopeFilter]);
    const categories = useMemo(() => Array.from(new Set(documents.map((document) => document.category).filter(Boolean))).sort(), [documents]);
    const stats = useMemo(() => {
        const imported = documents.filter((document) => document.source === "safety-document-import").length;
        return {
            converter: documents.filter((document) => document.ocrStatus === "converter_required").length,
            imported,
            indexed: documents.filter((document) => document.ocrStatus === "indexed").length,
            ocrRequired: documents.filter((document) => document.ocrStatus === "ocr_required").length,
            total: documents.length
        };
    }, [documents]);
    const indexedRate = stats.total ? Math.round((stats.indexed / stats.total) * 100) : 0;
    const sourcePathCount = documents.filter((document) => Boolean(document.sourcePath)).length;
    const categoryGroups = useMemo(() => [
        {
            label: "6S",
            hint: "Tiêu chuẩn, checklist, chấm điểm",
            value: documents.filter((document) => document.category?.startsWith("sixs")).length,
            Icon: CheckCircle2
        },
        {
            label: "PCCC",
            hint: "Điện, cháy nổ, ứng phó",
            value: documents.filter((document) => document.category === "pccc").length,
            Icon: AlertTriangle
        },
        {
            label: "Y tế / KYT",
            hint: "Sơ cứu, dự đoán nguy cơ",
            value: documents.filter((document) => document.category === "medical-first-aid" || document.category === "kyt").length,
            Icon: FileCheck2
        },
        {
            label: "Text index",
            hint: `${indexedRate}% sẵn sàng tìm kiếm`,
            value: stats.indexed,
            Icon: FileSearch
        }
    ], [documents, indexedRate, stats.indexed]);
    async function importManifest(dryRun = false) {
        setImporting(true);
        setImportResult("");
        try {
            const result = await apiFetch<{
                stats: Record<string, number>;
            }>("/api/documents/import-manifest", {
                method: "POST",
                body: JSON.stringify({ dryRun, sourceRoot: "tai lieu" })
            });
            setImportResult(`${dryRun ? "Preview" : "Đã import"}: ${result.stats.imported || 0} file, ${result.stats.indexed || 0} đã index, ${result.stats.ocrRequired || 0} cần OCR.`);
            if (!dryRun)
                await loadDocuments();
        }
        catch (requestError) {
            setImportResult((requestError as Error)?.message || "Không import được tài liệu.");
        }
        finally {
            setImporting(false);
        }
    }
    async function openDocumentText(document: SafetyDocument) {
        setTextLoading(true);
        try {
            setTextTarget(await apiFetch<DocumentTextPayload>(`/api/documents/${encodeURIComponent(document.id)}/text`));
        }
        finally {
            setTextLoading(false);
        }
    }
    async function runOcr(document: SafetyDocument) {
        setTextLoading(true);
        try {
            const payload = await apiFetch<DocumentTextPayload>(`/api/documents/${encodeURIComponent(document.id)}/ocr`, { method: "POST" });
            setTextTarget(payload);
            await loadDocuments();
        }
        finally {
            setTextLoading(false);
        }
    }
    function addFiles(files: FileList | File[]) {
        const next = Array.from(files);
        if (!next.length)
            return;
        setPendingFiles((current) => [...current, ...next]);
        setUploadOpen(true);
    }
    function closeUpload() {
        setUploadOpen(false);
        setUploadTitleI18n(emptySafetyLocalizedText());
    }
    async function uploadFiles() {
        if (!pendingFiles.length) {
            inputRef.current?.click();
            return;
        }
        setUploading(true);
        try {
            for (const file of pendingFiles) {
                const title = file.name.replace(/\.[^.]+$/, "");
                const titleI18n = safetyLocalizedPayload(pendingFiles.length === 1 ? uploadTitleI18n : undefined, title);
                const form = new FormData();
                form.append("file", file);
                form.append("title", safetyLocalizedVi(titleI18n, title));
                form.append("titleI18n", JSON.stringify(titleI18n));
                form.append("category", uploadCategory);
                form.append("departmentId", "company");
                form.append("departmentName", "Safety - 6S");
                form.append("language", "vi");
                form.append("version", uploadVersion);
                await apiFetch<SafetyDocument>("/api/documents", { method: "POST", body: form });
            }
            setPendingFiles([]);
            setUploadTitleI18n(emptySafetyLocalizedText());
            setUploadOpen(false);
            await loadDocuments();
        }
        finally {
            setUploading(false);
        }
    }
    if (loading)
        return <SafetyI18nRender>{<LoadingPanel label="Đang tải kho tài liệu Safety"/>}</SafetyI18nRender>;
    if (error)
        return <SafetyI18nRender>{<ErrorPanel error={error}/>}</SafetyI18nRender>;
    return <SafetyI18nRender>{(<section className="safety-documents-page mx-auto max-w-7xl space-y-5 pb-10">
      <div className="safety-documents-stat-grid grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
            { label: "Tổng tài liệu", value: stats.total, tone: "border-blue-200 text-blue-700", icon: Folder },
            { label: "Import từ tai lieu", value: stats.imported, tone: "border-slate-200 text-slate-700", icon: BookOpen },
            { label: "Đã index", value: stats.indexed, tone: "border-emerald-200 text-emerald-700", icon: CheckCircle2 },
            { label: "Cần OCR", value: stats.ocrRequired, tone: "border-amber-200 text-amber-700", icon: AlertTriangle },
            { label: "Cần converter", value: stats.converter, tone: "border-red-200 text-red-700", icon: Paperclip }
        ].map((item) => (<article className={`safety-documents-stat-card rounded-lg border bg-white p-4 shadow-sm ${item.tone}`} key={item.label}>
            <div className="safety-documents-stat-head">
              <span>{item.label}</span>
              <item.icon className="size-5"/>
            </div>
            <strong className="mt-2 block font-mono text-3xl leading-none">{item.value}</strong>
            <span className="mt-1 block text-xs font-black text-slate-500">{item.label === "Đã index" ? `${indexedRate}% sẵn sàng tìm kiếm` : item.label}</span>
          </article>))}
      </div>

      <div className="safety-documents-command">
        <div className="safety-documents-command-main">
          <div className="safety-documents-eyebrow">
            <Layers3 className="size-4"/>
            Thư viện vận hành 3 cấp
          </div>
          <h2>Kho tài liệu 6S/ATVSLĐ liên kết Công ty - EHS - Bộ phận</h2>
          <p>Ưu tiên tài liệu gốc trong thư mục <strong>tai lieu</strong>, giữ metadata, version, OCR/text index và đường dẫn nguồn để phục vụ checklist, audit, CAPA, đào tạo và báo cáo.</p>
          <div className="safety-documents-command-note">
            <FileSearch className="size-4"/>
            {sourcePathCount} tài liệu có đường dẫn nguồn · {stats.indexed} tài liệu đã có text index
          </div>
        </div>
        <div className="safety-documents-command-grid">
          {categoryGroups.map((group) => (
            <div className="safety-documents-command-card" key={group.label}>
              <group.Icon className="size-5"/>
              <strong>{group.value}</strong>
              <span>{group.label}</span>
              <small>{group.hint}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="safety-documents-hero rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">Kho tài liệu ATVSLĐ - 6S</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Quy trình, biểu mẫu, PCCC, y tế, KYT, tự kiểm tra và họp an toàn. PDF scan và Word .DOC có thể chạy OCR/index trực tiếp.</p>
          </div>
          <div className="safety-documents-hero-actions flex flex-wrap gap-2">
            <button className="safety-documents-action-wide inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50" disabled={importing || loading} onClick={loadDocuments} type="button">
              {loading ? <Loader2 className="size-4 animate-spin"/> : <RefreshCw className="size-4"/>}
              Làm mới
            </button>
            <button className="safety-documents-action-wide inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50" disabled={importing} onClick={() => importManifest(true)} type="button">
              {importing ? <Loader2 className="size-4 animate-spin"/> : <Eye className="size-4"/>}
              Preview import
            </button>
            <button className="safety-documents-action-wide inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#f5c400] px-4 text-sm font-black text-[#0f2a15] disabled:opacity-60" disabled={importing} onClick={() => importManifest(false)} type="button">
              {importing ? <Loader2 className="size-4 animate-spin"/> : <BookOpen className="size-4"/>}
              Import tai lieu
            </button>
            <button className="safety-documents-action-wide safety-documents-upload-btn inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-black text-white" onClick={() => setUploadOpen(true)} type="button">
              <UploadCloud className="size-4"/>
              Upload
            </button>
          </div>
        </div>
        {importResult ? <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800">{importResult}</div> : null}
      </div>

      <div className="safety-documents-filter-bar grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:grid-cols-[minmax(0,1fr)_190px_170px_170px]">
        <label className="safety-documents-search relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"/>
          <input className="min-h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm font-semibold" onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên, mã, tag, đường dẫn..." value={query}/>
        </label>
        <select className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold" onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}>
          <option value="all">Tất cả nhóm</option>
          {categories.map((category) => <option key={category} value={category}>{CATEGORY_LABEL[category] || category}</option>)}
        </select>
        <select className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold" onChange={(event) => setScopeFilter(event.target.value)} value={scopeFilter}>
          <option value="all">Tất cả cấp</option>
          <option value="company">Công ty</option>
          <option value="ehs">EHS</option>
          <option value="department">Bộ phận</option>
        </select>
        <select className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold" onChange={(event) => setOcrFilter(event.target.value)} value={ocrFilter}>
          <option value="all">Tất cả OCR</option>
          <option value="indexed">Đã index</option>
          <option value="ocr_required">Cần OCR</option>
          <option value="converter_required">Cần converter</option>
        </select>
      </div>

      <div className="safety-documents-grid grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {filteredDocuments.map((document) => {
            const Icon = docIcon(document);
            return (<article className="safety-documents-list-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={document.id}>
              <div className="flex items-start gap-3">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <Icon className="size-5"/>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] font-black text-blue-700">{document.documentCode || document.id.slice(0, 8)}</div>
                  <h3 className="mt-1 break-words text-sm font-black leading-snug text-slate-950">{documentTitle(document, lang)}</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">{CATEGORY_LABEL[document.category] || document.category || "general"}</span>
                    <span className={`rounded-md border px-2 py-1 text-xs font-black ${ocrClass(document.ocrStatus)}`}>{OCR_LABEL[document.ocrStatus || ""] || document.ocrStatus || "Chưa index"}</span>
                  </div>
                </div>
              </div>
              <div className="safety-documents-meta-grid mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-slate-50 px-2 py-1.5">
                  <span className="block font-black uppercase text-slate-400">Cấp</span>
                  <strong>{document.scopeLevel || "company"}</strong>
                </div>
                <div className="rounded-md bg-slate-50 px-2 py-1.5">
                  <span className="block font-black uppercase text-slate-400">Ngày hiệu lực</span>
                  <strong>{formatDate(document.effectiveDate || document.uploadedAt)}</strong>
                </div>
                <div className="rounded-md bg-slate-50 px-2 py-1.5">
                  <span className="block font-black uppercase text-slate-400">Dung lượng</span>
                  <strong>{formatSize(document.size)}</strong>
                </div>
                <div className="rounded-md bg-slate-50 px-2 py-1.5">
                  <span className="block font-black uppercase text-slate-400">Phiên bản</span>
                  <strong>{document.version || "1.0"}</strong>
                </div>
              </div>
              {document.sourcePath ? <code className="safety-documents-source-path mt-3 block break-all rounded bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-500">{document.sourcePath}</code> : null}
              <div className="safety-documents-card-actions mt-3 flex flex-wrap gap-2">
                <button className="safety-documents-card-action inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50" disabled={textLoading} onClick={() => openDocumentText(document)} type="button">
                  <Eye className="size-3.5"/>
                  Text
                </button>
                <button className="safety-documents-card-action inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-700" disabled={textLoading} onClick={() => runOcr(document)} type="button">
                  <BookOpen className="size-3.5"/>
                  OCR/index
                </button>
                <a className="safety-documents-card-action inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-blue-700 px-3 text-xs font-black text-white" href={`/api/documents/${encodeURIComponent(document.id)}/file?disposition=attachment`} rel="noreferrer" target="_blank">
                  <Download className="size-3.5"/>
                  Tải
                </a>
              </div>
            </article>);
        })}
        {!filteredDocuments.length ? (
          <div className="safety-documents-empty">
            <Folder className="size-9"/>
            <strong>Không tìm thấy tài liệu phù hợp</strong>
            <span>Thử đổi nhóm, cấp áp dụng, trạng thái OCR hoặc bấm làm mới/import lại từ thư mục tai lieu.</span>
          </div>
        ) : null}
      </div>

      <ModalShell onClose={() => setTextTarget(null)} open={Boolean(textTarget)} title={documentTitle(textTarget?.document, lang) || "Text tài liệu"}>
        <div className="safety-documents-text-modal grid gap-3 p-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <strong>{textTarget?.document.documentCode || textTarget?.document.id}</strong>
            <span className="ml-2 text-slate-500">{OCR_LABEL[textTarget?.document.ocrStatus || ""] || textTarget?.document.ocrStatus}</span>
          </div>
          {textTarget?.chunks.length ? (<div className="max-h-[58vh] overflow-y-auto rounded-lg border border-slate-200">
              {textTarget.chunks.map((chunk) => (<article className="border-b border-slate-100 p-3 last:border-0" key={chunk.chunkIndex}>
                  <div className="mb-2 text-xs font-black uppercase text-slate-400">Chunk {chunk.chunkIndex + 1} {chunk.sourcePage ? `- ${chunk.sourcePage}` : ""}</div>
                  <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-slate-700">{chunk.text}</p>
                </article>))}
            </div>) : (<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              Tài liệu này chưa có text index. Nếu là PDF scan hoặc Word .DOC hãy bấm OCR/index để trích nội dung.
            </div>)}
        </div>
      </ModalShell>

      <ModalShell onClose={closeUpload} open={uploadOpen} title="Upload tài liệu Safety">
        <div className="safety-documents-upload-modal grid gap-4 p-5">
          <button className="safety-documents-modal-dropzone rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center hover:border-blue-300 hover:bg-blue-50" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
            event.preventDefault();
            addFiles(event.dataTransfer.files);
        }} type="button">
            <UploadCloud className="mx-auto size-9 text-blue-700"/>
            <span className="mt-2 block text-sm font-black text-slate-950">Kéo thả hoặc bấm để chọn file</span>
            <span className="mt-1 block text-xs font-semibold text-slate-500">PDF, Word, Excel, PowerPoint, hình ảnh</span>
          </button>
          <input className="hidden" multiple onChange={(event) => event.target.files && addFiles(event.target.files)} ref={inputRef} type="file"/>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Nhóm tài liệu</span>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" onChange={(event) => setUploadCategory(event.target.value)} value={uploadCategory}>
                <option value="safety-general">Safety chung</option>
                <option value="sixs-daily-checklist">Checklist 6S</option>
                <option value="sixs-scoring">Chấm điểm 6S</option>
                <option value="pccc">PCCC</option>
                <option value="medical-first-aid">Y tế / sơ cứu</option>
                <option value="kyt">KYT</option>
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Phiên bản</span>
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" onChange={(event) => setUploadVersion(event.target.value)} value={uploadVersion}/>
            </label>
          </div>
          {pendingFiles.length === 1 ? (
            <SafetyLocalizedTextField
              ariaLabel="Tên tài liệu"
              inputClassName="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
              label="Tên tài liệu"
              onChange={setUploadTitleI18n}
              placeholder={pendingFiles[0].name.replace(/\.[^.]+$/, "")}
              value={uploadTitleI18n}
            />
          ) : null}
          <div className="safety-documents-pending-panel rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 px-3 py-2 text-sm font-black text-slate-950">File chờ upload: {pendingFiles.length}</div>
            <div className="max-h-44 overflow-y-auto">
              {pendingFiles.map((file, index) => (<div className="safety-documents-pending-row flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0" key={`${file.name}-${file.size}-${index}`}>
                  <Paperclip className="size-4 text-blue-700"/>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{file.name}</span>
                  <span className="font-mono text-xs text-slate-500">{formatSize(file.size)}</span>
                  <button className="rounded p-1 text-slate-400 hover:text-red-600" onClick={() => setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button">
                    <X className="size-4"/>
                  </button>
                </div>))}
              {!pendingFiles.length ? <div className="px-3 py-5 text-sm font-semibold text-slate-500">Chưa chọn file.</div> : null}
            </div>
          </div>
          <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#f5c400] px-4 text-sm font-black text-[#0f2a15] disabled:opacity-60" disabled={uploading} onClick={uploadFiles} type="button">
            {uploading ? <Loader2 className="size-4 animate-spin"/> : <UploadCloud className="size-4"/>}
            Upload {pendingFiles.length || ""}
          </button>
        </div>
      </ModalShell>
    </section>)}</SafetyI18nRender>;
}
export default SafetyDocumentsPage;
