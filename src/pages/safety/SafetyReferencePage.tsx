import { AlertTriangle, BadgeCheck, BookOpen, BriefcaseMedical, Calculator, CalendarCheck, CheckCircle2, ClipboardCheck, ClipboardList, Code2, Database, ExternalLink, Eye, Factory, FileBarChart, FileText, Flame, GraduationCap, HardHat, LayoutDashboard, Link2, ListChecks, Loader2, MapPin, Plus, Route, Send, Settings, ShieldAlert, Sigma, Target, Upload, Users, Workflow, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./safety-api";
import { ErrorPanel, LoadingPanel } from "./safety-shared";
import { SafetyI18nRender } from "./safety-i18n-render";
type ReferenceFormula = {
    id: string;
    title: string;
    expression: string;
    description: string;
    icon: string;
    notes?: string[];
};
type ReferenceEndpoint = {
    method: string;
    path: string;
    module: string;
    purpose: string;
    auth: string;
};
type ReferenceRoute = {
    label: string;
    path: string;
    icon: string;
    page: string;
    api: string[];
};
type ReferenceModal = {
    title: string;
    icon: string;
    route: string;
    sections: string[];
    primaryAction: string;
};
type ReferenceIcon = {
    group: string;
    icon: string;
    label: string;
    usage: string;
    route?: string;
};
type ReferencePayload = {
    formulas: ReferenceFormula[];
    endpoints: ReferenceEndpoint[];
    routes: ReferenceRoute[];
    modals: ReferenceModal[];
    icons?: ReferenceIcon[];
};
type DocumentArchitectureLevel = {
    id: string;
    title: string;
    icon: string;
    focus: string;
    responsibilities: string[];
};
type DocumentArchitectureDocument = {
    id: string;
    name: string;
    documentCode: string;
    category: string;
    documentType: string;
    scopeLevel: string;
    ocrStatus: string;
    effectiveDate: string | null;
    sourcePath: string;
    chunkCount: number;
    extractionMethod: string;
};
type DocumentArchitectureModule = {
    id: string;
    title: string;
    status: string;
    path: string;
    icon: string;
    levels: string[];
    sourceCategories: string[];
    outcome: string;
    documentCount: number;
    indexedCount: number;
    chunkCount: number;
    sourceDocuments: DocumentArchitectureDocument[];
};
type DocumentArchitecturePayload = {
    generatedAt: string;
    summary: {
        totalDocuments: number;
        indexedDocuments: number;
        totalChunks: number;
        existingModules: number;
        extendModules: number;
        proposedModules: number;
    };
    levels: DocumentArchitectureLevel[];
    modules: DocumentArchitectureModule[];
};
const emptyReferencePayload: ReferencePayload = {
    endpoints: [],
    formulas: [],
    icons: [],
    modals: [],
    routes: []
};
const ICONS = {
    AlertTriangle,
    BadgeCheck,
    BookOpen,
    BriefcaseMedical,
    Calculator,
    CalendarCheck,
    CheckCircle2,
    ClipboardCheck,
    ClipboardList,
    Code2,
    Database,
    Eye,
    Factory,
    FileBarChart,
    FileText,
    Flame,
    GraduationCap,
    HardHat,
    LayoutDashboard,
    Link2,
    ListChecks,
    Loader2,
    MapPin,
    Plus,
    Route,
    Send,
    Settings,
    ShieldAlert,
    Sigma,
    Target,
    Upload,
    Users,
    Workflow,
    XCircle
};
const methodClass = (method: string) => {
    if (method === "GET")
        return "border-blue-200 bg-blue-50 text-blue-700";
    if (method === "POST")
        return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (method === "PUT")
        return "border-amber-200 bg-amber-50 text-amber-700";
    if (method === "DELETE")
        return "border-red-200 bg-red-50 text-red-700";
    return "border-slate-200 bg-slate-50 text-slate-700";
};
function iconFor(name: string) {
    return ICONS[name as keyof typeof ICONS] || BookOpen;
}
const asStringList = (value: unknown): string[] => Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
function asReferencePayload(payload?: ReferencePayload): ReferencePayload {
    const record = payload && typeof payload === "object" ? payload : emptyReferencePayload;
    return {
        endpoints: Array.isArray(record.endpoints) ? record.endpoints : [],
        formulas: Array.isArray(record.formulas) ? record.formulas : [],
        icons: Array.isArray(record.icons) ? record.icons : [],
        modals: Array.isArray(record.modals) ? record.modals : [],
        routes: Array.isArray(record.routes) ? record.routes : []
    };
}
function isDocumentArchitecturePayload(payload?: DocumentArchitecturePayload): payload is DocumentArchitecturePayload {
    const record = payload && typeof payload === "object" ? payload : null;
    return Boolean(record?.summary && Array.isArray(record.levels) && Array.isArray(record.modules));
}
function normalizeArchitectureLevel(level: DocumentArchitectureLevel): DocumentArchitectureLevel {
    return {
        ...level,
        focus: level.focus || "",
        responsibilities: asStringList(level.responsibilities)
    };
}
function normalizeArchitectureModule(module: DocumentArchitectureModule): DocumentArchitectureModule {
    return {
        ...module,
        chunkCount: Number(module.chunkCount || 0),
        documentCount: Number(module.documentCount || 0),
        indexedCount: Number(module.indexedCount || 0),
        levels: asStringList(module.levels),
        outcome: module.outcome || "",
        sourceCategories: asStringList(module.sourceCategories),
        sourceDocuments: Array.isArray(module.sourceDocuments) ? module.sourceDocuments : []
    };
}
function IconTile({ icon, label }: {
    icon: string;
    label: string;
}) {
    const Icon = iconFor(icon);
    return (<span className="inline-flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-700">
      <Icon className="size-4 shrink-0 text-blue-700"/>
      <span className="truncate">{label}</span>
      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">{icon}</code>
    </span>);
}
const statusMeta = (status: string) => {
    if (status === "existing")
        return { label: "Đang có", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
    if (status === "extend")
        return { label: "Nên mở rộng", className: "border-amber-200 bg-amber-50 text-amber-700" };
    if (status === "proposed-tab")
        return { label: "Đề xuất tab", className: "border-blue-200 bg-blue-50 text-blue-700" };
    return { label: "Đề xuất mới", className: "border-slate-200 bg-slate-50 text-slate-700" };
};
function ArchitectureLevelCard({ level }: { level: DocumentArchitectureLevel }) {
    const responsibilities = asStringList(level.responsibilities);
    const Icon = iconFor(level.icon);
    return (<article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <Icon className="size-5"/>
        </span>
        <div className="min-w-0">
          <h4 className="text-sm font-black text-slate-950">{level.title}</h4>
          <p className="mt-1 text-sm font-medium leading-snug text-slate-600">{level.focus}</p>
        </div>
      </div>
      <ul className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-xs font-semibold leading-snug text-slate-500">
        {responsibilities.map((item) => (<li className="flex gap-2" key={item}>
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600"/>
            <span>{item}</span>
          </li>))}
      </ul>
    </article>);
}
function ArchitectureModuleCard({ module, levels }: { module: DocumentArchitectureModule; levels: DocumentArchitectureLevel[] }) {
    const moduleLevels = asStringList(module.levels);
    const sourceDocuments = Array.isArray(module.sourceDocuments) ? module.sourceDocuments : [];
    const Icon = iconFor(module.icon);
    const meta = statusMeta(module.status);
    const levelMap = new Map(levels.map((level) => [level.id, level.title]));
    const canOpenRoute = module.status === "existing" || module.status === "extend";
    const previewDocuments = sourceDocuments.slice(0, 3);
    return (<article className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Icon className="size-5"/>
          </span>
          <div className="min-w-0">
            <h4 className="text-sm font-black leading-tight text-slate-950">{module.title}</h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {moduleLevels.map((level) => (<span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600" key={`${module.id}-${level}`}>
                  {levelMap.get(level) || level}
                </span>))}
            </div>
          </div>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-black ${meta.className}`}>{meta.label}</span>
      </div>
      <p className="mt-3 text-sm font-medium leading-snug text-slate-600">{module.outcome}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2 text-center">
        <div>
          <strong className="block font-mono text-lg leading-none text-slate-950">{module.documentCount}</strong>
          <span className="text-[11px] font-bold text-slate-500">tài liệu</span>
        </div>
        <div>
          <strong className="block font-mono text-lg leading-none text-emerald-700">{module.indexedCount}</strong>
          <span className="text-[11px] font-bold text-slate-500">đã index</span>
        </div>
        <div>
          <strong className="block font-mono text-lg leading-none text-blue-700">{module.chunkCount}</strong>
          <span className="text-[11px] font-bold text-slate-500">chunks</span>
        </div>
      </div>
      {previewDocuments.length ? (<div className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">Tài liệu gốc</p>
          <div className="grid gap-1.5">
            {previewDocuments.map((document) => (<div className="min-w-0 rounded-md bg-slate-50 px-2.5 py-2" key={`${module.id}-${document.id}`}>
                <p className="truncate text-xs font-bold text-slate-800" title={document.name}>{document.name}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{document.category} · {document.chunkCount} chunks</p>
              </div>))}
          </div>
          {sourceDocuments.length > previewDocuments.length ? (<p className="mt-2 text-[11px] font-bold text-slate-400">+{sourceDocuments.length - previewDocuments.length} tài liệu khác</p>) : null}
        </div>) : null}
      <div className="mt-auto pt-3">
        {canOpenRoute ? (<Link className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-blue-700 hover:underline" to={module.path}>
            {module.path}
            <ExternalLink className="size-3.5"/>
          </Link>) : (<code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-600">{module.path}</code>)}
      </div>
    </article>);
}
function SectionHeader({ icon, subtitle, title }: {
    icon: string;
    subtitle: string;
    title: string;
}) {
    const Icon = iconFor(icon);
    return (<div className="mb-3 flex items-start gap-3">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
        <Icon className="size-5"/>
      </span>
      <div className="min-w-0">
        <h3 className="text-base font-black leading-tight text-slate-950">{title}</h3>
        <p className="mt-1 text-sm font-medium leading-snug text-slate-500">{subtitle}</p>
      </div>
    </div>);
}
export function SafetyReferencePage() {
    const reference = useQuery({
        queryKey: ["safety", "reference"],
        queryFn: () => apiFetch<ReferencePayload>("/api/safety/reference")
    });
    const architecture = useQuery({
        queryKey: ["safety", "document-architecture"],
        queryFn: () => apiFetch<DocumentArchitecturePayload>("/api/safety/document-architecture")
    });
    if (reference.isLoading)
        return <SafetyI18nRender>{<LoadingPanel />}</SafetyI18nRender>;
    if (reference.error)
        return <SafetyI18nRender>{<ErrorPanel error={reference.error}/>}</SafetyI18nRender>;
    const data = asReferencePayload(reference.data);
    const rawDocumentArchitecture = isDocumentArchitecturePayload(architecture.data) ? architecture.data : null;
    const documentArchitecture = rawDocumentArchitecture
        ? {
            ...rawDocumentArchitecture,
            levels: rawDocumentArchitecture.levels.map(normalizeArchitectureLevel),
            modules: rawDocumentArchitecture.modules.map(normalizeArchitectureModule)
        }
        : null;
    const iconCatalog = data.icons || [];
    const routeIconSet = Array.from(new Set(data.routes.map((item) => item.icon)));
    const modalIconSet = Array.from(new Set(data.modals.map((item) => item.icon)));
    return <SafetyI18nRender>{(<section className="mx-auto max-w-7xl space-y-5 pb-10">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <BookOpen className="size-5"/>
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-black leading-tight text-slate-950">Bản đồ trang phụ, API và icon</h2>
              <p className="mt-1 max-w-3xl text-sm font-medium leading-snug text-slate-500">
                Công thức tính, API, route, modal và icon dùng cho các trang phụ Safety - 6S.
              </p>
            </div>
          </div>
          <Link className="inline-flex w-fit items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50" to="/safety-6s">
            <LayoutDashboard className="size-4"/>
            Về dashboard 6S
          </Link>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <article className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-800">
          <Route className="size-5"/>
          <strong className="mt-2 block font-mono text-3xl leading-none">{data.routes.length}</strong>
          <span className="text-xs font-black uppercase tracking-wide">Route phụ</span>
        </article>
        <article className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <Database className="size-5"/>
          <strong className="mt-2 block font-mono text-3xl leading-none">{data.endpoints.length}</strong>
          <span className="text-xs font-black uppercase tracking-wide">Endpoint</span>
        </article>
        <article className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <Sigma className="size-5"/>
          <strong className="mt-2 block font-mono text-3xl leading-none">{data.formulas.length}</strong>
          <span className="text-xs font-black uppercase tracking-wide">Công thức</span>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-4 text-slate-800 shadow-sm">
          <Workflow className="size-5 text-slate-600"/>
          <strong className="mt-2 block font-mono text-3xl leading-none">{data.modals.length}</strong>
          <span className="text-xs font-black uppercase tracking-wide text-slate-500">Modal</span>
        </article>
      </div>

      {documentArchitecture ? (<section className="min-w-0 rounded-lg border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
        <SectionHeader icon="Factory" subtitle="Đề xuất này sinh từ 24 tài liệu trong thư mục tai lieu, dùng dữ liệu index trong MySQL và giữ tên file gốc." title="Kiến Trúc Tài Liệu ATVSLĐ - 6S"/>
        <div className="grid gap-3 md:grid-cols-4">
          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <FileText className="size-5 text-blue-700"/>
            <strong className="mt-2 block font-mono text-3xl leading-none text-slate-950">{documentArchitecture.summary.totalDocuments}</strong>
            <span className="text-xs font-black uppercase tracking-wide text-slate-500">Tài liệu gốc</span>
          </article>
          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <CheckCircle2 className="size-5 text-emerald-700"/>
            <strong className="mt-2 block font-mono text-3xl leading-none text-slate-950">{documentArchitecture.summary.indexedDocuments}</strong>
            <span className="text-xs font-black uppercase tracking-wide text-slate-500">Đã index</span>
          </article>
          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <Database className="size-5 text-indigo-700"/>
            <strong className="mt-2 block font-mono text-3xl leading-none text-slate-950">{documentArchitecture.summary.totalChunks}</strong>
            <span className="text-xs font-black uppercase tracking-wide text-slate-500">Text chunks</span>
          </article>
          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <Plus className="size-5 text-amber-700"/>
            <strong className="mt-2 block font-mono text-3xl leading-none text-slate-950">{documentArchitecture.summary.proposedModules}</strong>
            <span className="text-xs font-black uppercase tracking-wide text-slate-500">Module đề xuất</span>
          </article>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {documentArchitecture.levels.map((level) => (<ArchitectureLevelCard key={level.id} level={level}/>))}
        </div>

        <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))" }}>
          {documentArchitecture.modules.map((module) => (<ArchitectureModuleCard key={module.id} levels={documentArchitecture.levels} module={module}/>))}
        </div>
      </section>) : null}

      <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <SectionHeader icon="Sigma" subtitle="Các phép tính đang dùng trong form, dashboard 6S và trang KPI." title="Công Thức Vận Hành"/>
        <div className="grid gap-3 lg:grid-cols-2">
          {data.formulas.map((formula) => {
            const Icon = iconFor(formula.icon);
            const notes = asStringList(formula.notes);
            return (<article className="rounded-lg border border-slate-200 p-4" key={formula.id}>
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-700">
                    <Icon className="size-5"/>
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-slate-950">{formula.title}</h4>
                    <code className="mt-2 block rounded-md bg-slate-950 px-3 py-2 font-mono text-xs font-semibold text-white">{formula.expression}</code>
                    <p className="mt-2 text-sm leading-snug text-slate-600">{formula.description}</p>
                  </div>
                </div>
                {notes.length ? (<ul className="mt-3 grid gap-1 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500">
                    {notes.map((note) => (<li className="flex gap-2" key={note}>
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600"/>
                        <span>{note}</span>
                      </li>))}
                  </ul>) : null}
              </article>);
        })}
        </div>
      </section>

      <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <SectionHeader icon="Route" subtitle="Từng trang phụ, icon hiển thị và API chính đi kèm." title="Route, Icon Và Link"/>
          <div className="w-full max-w-full overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[860px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  {["Trang", "Icon", "Đường dẫn", "API dùng chính"].map((column) => (<th className="border-b border-slate-200 px-3 py-2 font-bold" key={column}>
                      {column}
                    </th>))}
                </tr>
              </thead>
              <tbody>
                {data.routes.map((route) => {
            const Icon = iconFor(route.icon);
            const apiPaths = asStringList(route.api);
            return (<tr className="border-b border-slate-100 last:border-0" key={route.path}>
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <Icon className="size-4 text-blue-700"/>
                          <strong className="text-slate-900">{route.label}</strong>
                        </div>
                        <span className="mt-1 block text-xs text-slate-500">{route.page}</span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{route.icon}</code>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Link className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-blue-700 hover:underline" to={route.path}>
                          {route.path}
                          <ExternalLink className="size-3.5"/>
                        </Link>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          {apiPaths.map((path) => (<code className="rounded bg-slate-100 px-2 py-1 font-mono text-[11px] font-semibold text-slate-600" key={`${route.path}-${path}`}>
                              {path}
                            </code>))}
                        </div>
                      </td>
                    </tr>);
        })}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <SectionHeader icon="BookOpen" subtitle="Danh sách icon xuất hiện trong nav và modal phụ." title="Catalog Icon"/>
          <div className="grid gap-2">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Navigation</p>
              <div className="flex flex-wrap gap-2">
                {routeIconSet.map((icon) => (<IconTile icon={icon} key={icon} label="Nav"/>))}
              </div>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Modal</p>
              <div className="flex flex-wrap gap-2">
                {modalIconSet.map((icon) => (<IconTile icon={icon} key={icon} label="Modal"/>))}
              </div>
            </div>
          </div>
        </aside>
      </section>

      {iconCatalog.length ? (<section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <SectionHeader icon="BookOpen" subtitle="Từng icon đang dùng trong navigation, nút thao tác, modal, công thức và bảng API." title="Icon Chi Tiết"/>
          <div className="w-full max-w-full overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  {["Nhóm", "Icon", "Label", "Công dụng", "Link"].map((column) => (<th className="border-b border-slate-200 px-3 py-2 font-bold" key={column}>
                      {column}
                    </th>))}
                </tr>
              </thead>
              <tbody>
                {iconCatalog.map((item) => {
                const Icon = iconFor(item.icon);
                return (<tr className="border-b border-slate-100 last:border-0" key={`${item.group}-${item.icon}-${item.label}`}>
                      <td className="px-3 py-3 align-top">
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">{item.group}</span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className="inline-flex items-center gap-2">
                          <Icon className="size-4 text-blue-700"/>
                          <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{item.icon}</code>
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top font-black text-slate-900">{item.label}</td>
                      <td className="px-3 py-3 align-top text-slate-600">{item.usage}</td>
                      <td className="px-3 py-3 align-top">
                        {item.route ? (<Link className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-blue-700 hover:underline" to={item.route}>
                            {item.route}
                            <ExternalLink className="size-3.5"/>
                          </Link>) : (<span className="text-xs font-semibold text-slate-400">Không áp dụng</span>)}
                      </td>
                    </tr>);
            })}
              </tbody>
            </table>
          </div>
        </section>) : null}

      <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <SectionHeader icon="Workflow" subtitle="Các popup/form phụ đã nối với API thật, không dùng dữ liệu tĩnh thay thế." title="Modal Và Trường Chính"/>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.modals.map((modal) => {
            const Icon = iconFor(modal.icon);
            const sections = asStringList(modal.sections);
            return (<article className="rounded-lg border border-slate-200 p-4" key={modal.title}>
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-700">
                    <Icon className="size-5"/>
                  </span>
                  <div className="min-w-0">
                    <h4 className="font-black leading-tight text-slate-950">{modal.title}</h4>
                    <Link className="mt-1 inline-flex items-center gap-1.5 font-mono text-xs font-bold text-blue-700 hover:underline" to={modal.route}>
                      {modal.route}
                      <ExternalLink className="size-3.5"/>
                    </Link>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {sections.map((section) => (<span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600" key={section}>
                      {section}
                    </span>))}
                </div>
                <p className="mt-3 border-t border-slate-100 pt-3 text-xs font-black uppercase tracking-wide text-slate-500">
                  Action: <span className="text-slate-800">{modal.primaryAction}</span>
                </p>
              </article>);
        })}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <SectionHeader icon="Database" subtitle="Endpoint đang dùng cho trang phụ, modal tạo mới và luồng duyệt." title="API Safety - 6S"/>
        <div className="w-full max-w-full overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[960px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {["Method", "Endpoint", "Module", "Mục đích", "Quyền"].map((column) => (<th className="border-b border-slate-200 px-3 py-2 font-bold" key={column}>
                    {column}
                  </th>))}
              </tr>
            </thead>
            <tbody>
              {data.endpoints.map((endpoint) => (<tr className="border-b border-slate-100 last:border-0" key={`${endpoint.method}-${endpoint.path}`}>
                  <td className="px-3 py-3 align-top">
                    <span className={`inline-flex rounded-md border px-2 py-1 font-mono text-xs font-black ${methodClass(endpoint.method)}`}>{endpoint.method}</span>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <code className="font-mono text-xs font-semibold text-slate-800">{endpoint.path}</code>
                  </td>
                  <td className="px-3 py-3 align-top font-semibold text-slate-700">{endpoint.module}</td>
                  <td className="px-3 py-3 align-top text-slate-600">{endpoint.purpose}</td>
                  <td className="px-3 py-3 align-top text-xs font-bold text-slate-500">{endpoint.auth}</td>
                </tr>))}
            </tbody>
          </table>
        </div>
      </section>
    </section>)}</SafetyI18nRender>;
}
export default SafetyReferencePage;
