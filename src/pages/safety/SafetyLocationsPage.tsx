import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Copy, Loader2, MapPin, Plus, QrCode, Save, Search, ShieldAlert, X } from "lucide-react";
import { apiFetch, apiFetchArray, postJson } from "./safety-api";
import { ErrorPanel, LoadingPanel, ModalShell } from "./safety-shared";
import { SafetyI18nRender } from "./safety-i18n-render";
type Department = {
    code: string;
    name: string;
    divisionCode: string;
    managerName?: string;
    headcount?: number;
};
type Location = {
    id: string;
    code: string;
    name: string;
    departmentCode: string;
    areaType: string;
    parentId?: string;
    qrCode: string;
    riskLevel: string;
    description?: string;
};
const DEFAULT_FORM = {
    areaType: "area",
    departmentCode: "EHS",
    description: "",
    name: "",
    qrCode: "",
    riskLevel: "medium"
};
function errorMessage(error: unknown, fallback: string) {
    return (error as Error)?.message || fallback;
}
const AREA_TYPES = [
    ["area", "Khu vực"],
    ["line", "Line"],
    ["machine", "Máy/thiết bị"],
    ["warehouse", "Kho"],
    ["pccc", "PCCC"],
    ["medical", "Y tế"]
];
const RISK_LABEL: Record<string, string> = {
    critical: "CRITICAL",
    high: "HIGH",
    low: "LOW",
    medium: "MEDIUM"
};
function riskClass(value: string) {
    if (value === "critical" || value === "high")
        return "border-red-200 bg-red-50 text-red-700";
    if (value === "medium")
        return "border-amber-200 bg-amber-50 text-amber-700";
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
}
export function SafetyLocationsPage() {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<unknown>(null);
    const [query, setQuery] = useState("");
    const [departmentFilter, setDepartmentFilter] = useState("all");
    const [createOpen, setCreateOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ ...DEFAULT_FORM });
    const [qrQuery, setQrQuery] = useState("");
    const [qrResult, setQrResult] = useState<Location | null>(null);
    const [qrError, setQrError] = useState("");
    const [copied, setCopied] = useState("");
    const [operationError, setOperationError] = useState("");
    const [operationSuccess, setOperationSuccess] = useState("");
    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [departmentRows, locationRows] = await Promise.all([
                apiFetchArray<Department>("/api/safety/departments"),
                apiFetchArray<Location>("/api/locations")
            ]);
            setDepartments(departmentRows);
            setLocations(locationRows);
            if (departmentRows[0]?.code) {
                setForm((current) => ({ ...current, departmentCode: current.departmentCode || departmentRows[0].code }));
            }
        }
        catch (requestError) {
            setError(requestError);
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        loadData();
    }, [loadData]);
    const filteredLocations = useMemo(() => {
        const q = query.trim().toLowerCase();
        return locations.filter((location) => {
            const matchesDepartment = departmentFilter === "all" || location.departmentCode === departmentFilter;
            const matchesQuery = !q ||
                [location.code, location.name, location.departmentCode, location.qrCode, location.areaType, location.description || ""]
                    .some((value) => String(value).toLowerCase().includes(q));
            return matchesDepartment && matchesQuery;
        });
    }, [departmentFilter, locations, query]);
    const stats = useMemo(() => {
        const highRisk = locations.filter((location) => location.riskLevel === "high" || location.riskLevel === "critical").length;
        const departmentCount = new Set(locations.map((location) => location.departmentCode)).size;
        return { departmentCount, highRisk, total: locations.length };
    }, [locations]);
    async function handleCreate(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);
        setOperationError("");
        setOperationSuccess("");
        try {
            const created = await postJson<Location>("/api/locations", {
                ...form,
                qrCode: form.qrCode || `MHC-6S-${form.departmentCode}-${form.name.trim().replace(/\s+/g, "-").toUpperCase()}`
            });
            setCreateOpen(false);
            setForm({ ...DEFAULT_FORM, departmentCode: departments[0]?.code || "EHS" });
            setOperationSuccess(`Đã tạo khu vực ${created.code || created.name}.`);
            await loadData();
        }
        catch (createError) {
            setOperationError(errorMessage(createError, "Không tạo được khu vực/QR. Kiểm tra đăng nhập, quyền hoặc mã QR trùng."));
        }
        finally {
            setSaving(false);
        }
    }
    async function lookupQr(event: React.FormEvent) {
        event.preventDefault();
        setQrError("");
        setQrResult(null);
        try {
            setQrResult(await apiFetch<Location>(`/api/qr/${encodeURIComponent(qrQuery.trim())}`));
        }
        catch {
            setQrError("Không tìm thấy QR hoặc bạn chưa có quyền xem khu vực này.");
        }
    }
    async function copyText(value: string) {
        await navigator.clipboard?.writeText(value);
        setCopied(value);
        window.setTimeout(() => setCopied(""), 1800);
    }
    if (loading)
        return <SafetyI18nRender>{<LoadingPanel label="Đang tải khu vực Safety"/>}</SafetyI18nRender>;
    if (error)
        return <SafetyI18nRender>{<ErrorPanel error={error}/>}</SafetyI18nRender>;
    return <SafetyI18nRender>{(<section className="mx-auto max-w-7xl space-y-5 pb-10">
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-lg border border-blue-200 bg-white p-4 text-blue-700 shadow-sm">
          <MapPin className="size-5"/>
          <strong className="mt-2 block font-mono text-3xl leading-none">{stats.total}</strong>
          <span className="mt-1 block text-xs font-black uppercase text-slate-500">Điểm/khu vực QR</span>
        </article>
        <article className="rounded-lg border border-emerald-200 bg-white p-4 text-emerald-700 shadow-sm">
          <Building2 className="size-5"/>
          <strong className="mt-2 block font-mono text-3xl leading-none">{stats.departmentCount}</strong>
          <span className="mt-1 block text-xs font-black uppercase text-slate-500">Bộ phận có QR</span>
        </article>
        <article className="rounded-lg border border-red-200 bg-white p-4 text-red-700 shadow-sm">
          <ShieldAlert className="size-5"/>
          <strong className="mt-2 block font-mono text-3xl leading-none">{stats.highRisk}</strong>
          <span className="mt-1 block text-xs font-black uppercase text-slate-500">Khu vực rủi ro cao</span>
        </article>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">Khu vực / QR Safety</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Master khu vực dùng cho cảnh báo, sự cố, audit, checklist và QR tại hiện trường.</p>
            </div>
            <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#f5c400] px-4 text-sm font-black text-[#0f2a15] shadow-sm hover:bg-[#e0b300]" onClick={() => setCreateOpen(true)} type="button">
              <Plus className="size-4"/>
              Tạo khu vực
            </button>
          </div>

          {operationError ? (<div className="safety-operation-feedback error" role="alert">
            <ShieldAlert className="size-4"/>
            <span>{operationError}</span>
          </div>) : null}
          {operationSuccess ? (<div className="safety-operation-feedback success" role="status">
            <CheckCircle2 className="size-4"/>
            <span>{operationSuccess}</span>
          </div>) : null}

          <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"/>
              <input className="min-h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm font-semibold" onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã, khu vực, QR..." value={query}/>
            </label>
            <select className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold" onChange={(event) => setDepartmentFilter(event.target.value)} value={departmentFilter}>
              <option value="all">Tất cả bộ phận</option>
              {departments.map((department) => <option key={department.code} value={department.code}>{department.code} - {department.name}</option>)}
            </select>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {filteredLocations.map((location) => (<article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={location.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-black text-blue-700">{location.code}</div>
                    <h3 className="mt-1 break-words text-base font-black leading-tight text-slate-950">{location.name}</h3>
                  </div>
                  <span className={`shrink-0 rounded-md border px-2 py-1 text-xs font-black ${riskClass(location.riskLevel)}`}>
                    {RISK_LABEL[location.riskLevel] || location.riskLevel}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-slate-50 px-2 py-1.5">
                    <span className="block font-black uppercase text-slate-400">Bộ phận</span>
                    <strong>{location.departmentCode}</strong>
                  </div>
                  <div className="rounded-md bg-slate-50 px-2 py-1.5">
                    <span className="block font-black uppercase text-slate-400">Loại</span>
                    <strong>{AREA_TYPES.find((item) => item[0] === location.areaType)?.[1] || location.areaType}</strong>
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                      <QrCode className="size-4"/>
                      QR code
                    </span>
                    <button className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-blue-700" onClick={() => copyText(location.qrCode)} title="Copy QR" type="button">
                      {copied === location.qrCode ? <CheckCircle2 className="size-4 text-emerald-600"/> : <Copy className="size-4"/>}
                    </button>
                  </div>
                  <code className="mt-2 block break-all rounded bg-white px-2 py-1.5 font-mono text-xs font-black text-slate-700">{location.qrCode}</code>
                </div>
                {location.description ? <p className="mt-3 text-sm font-medium leading-snug text-slate-500">{location.description}</p> : null}
              </article>))}
          </div>
        </div>

        <aside className="h-fit rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <QrCode className="size-5 text-blue-700"/>
            <h3 className="font-black text-slate-950">Tra cứu QR</h3>
          </div>
          <form className="mt-3 grid gap-3" onSubmit={lookupQr}>
            <input className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold" onChange={(event) => setQrQuery(event.target.value)} placeholder="VD: MHC-6S-EHS" required value={qrQuery}/>
            <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-black text-white" type="submit">
              <Search className="size-4"/>
              Tìm QR
            </button>
          </form>
          {qrError ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{qrError}</div> : null}
          {qrResult ? (<div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <strong>{qrResult.code} - {qrResult.name}</strong>
              <span className="mt-1 block">{qrResult.departmentCode} / {RISK_LABEL[qrResult.riskLevel] || qrResult.riskLevel}</span>
            </div>) : null}
        </aside>
      </div>

      <ModalShell description="Tạo điểm QR cho khu vực, line, máy, PCCC hoặc y tế." onClose={() => setCreateOpen(false)} open={createOpen} title="Tạo khu vực / QR">
        <form className="grid gap-4 p-5" onSubmit={handleCreate}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Tên khu vực</span>
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}/>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Bộ phận</span>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={form.departmentCode} onChange={(event) => setForm((current) => ({ ...current, departmentCode: event.target.value }))}>
                {departments.map((department) => <option key={department.code} value={department.code}>{department.code} - {department.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Loại khu vực</span>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={form.areaType} onChange={(event) => setForm((current) => ({ ...current, areaType: event.target.value }))}>
                {AREA_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Mức rủi ro</span>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={form.riskLevel} onChange={(event) => setForm((current) => ({ ...current, riskLevel: event.target.value }))}>
                <option value="low">Thấp</option>
                <option value="medium">Trung bình</option>
                <option value="high">Nghiêm trọng</option>
                <option value="critical">Cực kỳ nghiêm trọng</option>
              </select>
            </label>
          </div>
          <label className="grid gap-1.5">
            <span className="text-xs font-black uppercase text-slate-500">QR code tùy chỉnh</span>
            <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" onChange={(event) => setForm((current) => ({ ...current, qrCode: event.target.value }))} placeholder="Để trống sẽ tự tạo" value={form.qrCode}/>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-black uppercase text-slate-500">Mô tả</span>
            <textarea className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} value={form.description}/>
          </label>
          <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700" onClick={() => setCreateOpen(false)} type="button">
              <X className="size-4"/>
              Hủy
            </button>
            <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#f5c400] px-4 text-sm font-black text-[#0f2a15] disabled:opacity-60" disabled={saving} type="submit">
              {saving ? <Loader2 className="size-4 animate-spin"/> : <Save className="size-4"/>}
              Lưu khu vực
            </button>
          </footer>
        </form>
      </ModalShell>
    </section>)}</SafetyI18nRender>;
}
export default SafetyLocationsPage;
