import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock, Loader2, Plus, Save, Send, ShieldCheck, UserRound, Workflow, X } from "lucide-react";
import { addDaysDate, apiFetchArray, patchJson, postJson } from "./safety-api";
import { ErrorPanel, LoadingPanel, ModalShell, StatusBadge } from "./safety-shared";
import { SafetyI18nRender } from "./safety-i18n-render";
type SafetyAction = {
    id: string;
    code: string;
    title: string;
    description?: string;
    sourceType?: string;
    sourceCode?: string;
    departmentCode: string;
    locationId?: string;
    priority: "low" | "medium" | "high" | "critical" | string;
    status: string;
    ownerName?: string;
    dueDate?: string;
    evidenceNotes?: string;
    verificationNote?: string;
    createdByName?: string;
    createdAt?: string;
};
type Department = {
    code: string;
    name: string;
    divisionCode: string;
};
type Location = {
    id: string;
    code: string;
    name: string;
    departmentCode: string;
};
const STATUS_OPTIONS = [
    "all",
    "open",
    "assigned",
    "in_progress",
    "blocked",
    "done_by_owner",
    "reopened",
    "closed"
];
const STATUS_LABEL: Record<string, string> = {
    all: "Tất cả",
    assigned: "Đã giao",
    blocked: "Đang vướng",
    closed: "Đã đóng",
    done_by_owner: "Chờ EHS xác minh",
    in_progress: "IN_PROGRESS",
    open: "OPEN",
    reopened: "Mở lại",
    verified: "Đã xác minh"
};
const PRIORITY_LABEL: Record<string, string> = {
    critical: "CRITICAL",
    high: "HIGH",
    low: "LOW",
    medium: "MEDIUM"
};
const DEFAULT_FORM = {
    departmentCode: "EHS",
    description: "",
    dueDate: addDaysDate(7),
    locationId: "",
    ownerName: "",
    priority: "medium",
    status: "open",
    title: ""
};
function errorMessage(error: unknown, fallback: string) {
    return (error as Error)?.message || fallback;
}
function statusTone(status: string) {
    if (status === "closed" || status === "verified")
        return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (status === "done_by_owner")
        return "text-blue-700 bg-blue-50 border-blue-200";
    if (status === "blocked" || status === "reopened")
        return "text-red-700 bg-red-50 border-red-200";
    if (status === "in_progress" || status === "assigned")
        return "text-amber-700 bg-amber-50 border-amber-200";
    return "text-slate-700 bg-slate-50 border-slate-200";
}
function priorityTone(priority: string) {
    if (priority === "critical" || priority === "high")
        return "text-red-700 bg-red-50 border-red-200";
    if (priority === "medium")
        return "text-amber-700 bg-amber-50 border-amber-200";
    return "text-emerald-700 bg-emerald-50 border-emerald-200";
}
export function SafetyActionsPage() {
    const [actions, setActions] = useState<SafetyAction[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<unknown>(null);
    const [statusFilter, setStatusFilter] = useState("all");
    const [createOpen, setCreateOpen] = useState(false);
    const [evidenceTarget, setEvidenceTarget] = useState<SafetyAction | null>(null);
    const [verifyTarget, setVerifyTarget] = useState<SafetyAction | null>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ ...DEFAULT_FORM });
    const [note, setNote] = useState("");
    const [operationError, setOperationError] = useState("");
    const [operationSuccess, setOperationSuccess] = useState("");
    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [actionRows, departmentRows, locationRows] = await Promise.all([
                apiFetchArray<SafetyAction>("/api/actions"),
                apiFetchArray<Department>("/api/safety/departments"),
                apiFetchArray<Location>("/api/locations")
            ]);
            setActions(actionRows);
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
    const filteredActions = useMemo(() => actions.filter((item) => statusFilter === "all" || item.status === statusFilter), [actions, statusFilter]);
    const stats = useMemo(() => {
        const open = actions.filter((item) => ["open", "assigned", "in_progress", "reopened", "blocked"].includes(item.status)).length;
        const waiting = actions.filter((item) => item.status === "done_by_owner").length;
        const overdue = actions.filter((item) => item.dueDate && item.status !== "closed" && item.dueDate < new Date().toISOString().slice(0, 10)).length;
        const closed = actions.filter((item) => item.status === "closed" || item.status === "verified").length;
        return { closed, open, overdue, waiting };
    }, [actions]);
    async function handleCreate(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);
        setOperationError("");
        setOperationSuccess("");
        try {
            const created = await postJson<SafetyAction>("/api/actions", form);
            setCreateOpen(false);
            setForm({ ...DEFAULT_FORM, departmentCode: departments[0]?.code || "EHS" });
            setOperationSuccess(`Đã tạo CAPA ${created.code || form.title}.`);
            await loadData();
        }
        catch (createError) {
            setOperationError(errorMessage(createError, "Không tạo được CAPA. Kiểm tra đăng nhập, quyền hoặc dữ liệu bắt buộc."));
        }
        finally {
            setSaving(false);
        }
    }
    async function updateStatus(action: SafetyAction, status: string) {
        setOperationError("");
        setOperationSuccess("");
        try {
            const updated = await patchJson<SafetyAction>(`/api/actions/${encodeURIComponent(action.id)}`, { status });
            setOperationSuccess(`Đã cập nhật ${updated.code || action.code}.`);
            await loadData();
        }
        catch (statusError) {
            setOperationError(errorMessage(statusError, "Không cập nhật được trạng thái CAPA."));
        }
    }
    async function submitEvidence(event: React.FormEvent) {
        event.preventDefault();
        if (!evidenceTarget)
            return;
        setSaving(true);
        setOperationError("");
        setOperationSuccess("");
        try {
            const updated = await postJson<SafetyAction>(`/api/actions/${encodeURIComponent(evidenceTarget.id)}/submit-evidence`, { evidenceNotes: note });
            setEvidenceTarget(null);
            setNote("");
            setOperationSuccess(`Đã gửi bằng chứng ${updated.code || evidenceTarget.code}.`);
            await loadData();
        }
        catch (evidenceError) {
            setOperationError(errorMessage(evidenceError, "Không gửi được bằng chứng CAPA."));
        }
        finally {
            setSaving(false);
        }
    }
    async function verifyAction(approved: boolean) {
        if (!verifyTarget)
            return;
        setSaving(true);
        setOperationError("");
        setOperationSuccess("");
        try {
            const updated = await postJson<SafetyAction>(`/api/actions/${encodeURIComponent(verifyTarget.id)}/verify`, { approved, note });
            setVerifyTarget(null);
            setNote("");
            setOperationSuccess(approved ? `Đã đóng CAPA ${updated.code || verifyTarget.code}.` : `Đã mở lại CAPA ${updated.code || verifyTarget.code}.`);
            await loadData();
        }
        catch (verifyError) {
            setOperationError(errorMessage(verifyError, "Không xác minh được CAPA."));
        }
        finally {
            setSaving(false);
        }
    }
    if (loading)
        return <SafetyI18nRender>{<LoadingPanel label="Đang tải CAPA"/>}</SafetyI18nRender>;
    if (error)
        return <SafetyI18nRender>{<ErrorPanel error={error}/>}</SafetyI18nRender>;
    return <SafetyI18nRender>{(<section className="mx-auto max-w-7xl space-y-5 pb-10">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
            { icon: Workflow, label: "CAPA đang mở", value: stats.open, tone: "border-blue-200 text-blue-700" },
            { icon: Clock, label: "Chờ EHS xác minh", value: stats.waiting, tone: "border-amber-200 text-amber-700" },
            { icon: AlertTriangle, label: "OVERDUE", value: stats.overdue, tone: "border-red-200 text-red-700" },
            { icon: ShieldCheck, label: "Đã đóng", value: stats.closed, tone: "border-emerald-200 text-emerald-700" }
        ].map((item) => (<article className={`rounded-lg border bg-white p-4 shadow-sm ${item.tone}`} key={item.label}>
            <item.icon className="size-5"/>
            <strong className="mt-2 block font-mono text-3xl leading-none">{item.value}</strong>
            <span className="mt-1 block text-xs font-black uppercase text-slate-500">{item.label}</span>
          </article>))}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-black text-slate-950">CAPA - Hành động khắc phục</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">Theo dõi việc phát sinh từ cảnh báo, sự cố, audit 6S và cải tiến an toàn.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((status) => (<button className={`rounded-lg border px-3 py-2 text-xs font-black transition ${statusFilter === status ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`} key={status} onClick={() => setStatusFilter(status)} type="button">
                {STATUS_LABEL[status] || status}
              </button>))}
          </div>
          <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#f5c400] px-4 text-sm font-black text-[#0f2a15] shadow-sm hover:bg-[#e0b300]" onClick={() => setCreateOpen(true)} type="button">
            <Plus className="size-4"/>
            Tạo CAPA
          </button>
        </div>
      </div>

      {operationError ? (<div className="safety-operation-feedback error" role="alert">
        <AlertTriangle className="size-4"/>
        <span>{operationError}</span>
      </div>) : null}
      {operationSuccess ? (<div className="safety-operation-feedback success" role="status">
        <CheckCircle2 className="size-4"/>
        <span>{operationSuccess}</span>
      </div>) : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1060px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {["Mã", "Nội dung", "Bộ phận", "Nguồn", "Ưu tiên", "Trạng thái", "Hạn", "Phụ trách", "Thao tác"].map((column) => (<th className="border-b border-slate-200 px-3 py-3 font-black" key={column}>{column}</th>))}
              </tr>
            </thead>
            <tbody>
              {filteredActions.length ? filteredActions.map((action) => (<tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60" key={action.id}>
                  <td className="px-3 py-3 align-top font-mono text-xs font-black text-blue-700">{action.code}</td>
                  <td className="px-3 py-3 align-top">
                    <strong className="block max-w-[320px] text-slate-950">{action.title}</strong>
                    <span className="mt-1 block max-w-[380px] text-xs font-medium leading-snug text-slate-500">{action.description || action.evidenceNotes || "Chưa có mô tả chi tiết."}</span>
                  </td>
                  <td className="px-3 py-3 align-top font-black text-slate-700">{action.departmentCode}</td>
                  <td className="px-3 py-3 align-top text-xs font-semibold text-slate-500">{action.sourceType || "manual"} {action.sourceCode ? `- ${action.sourceCode}` : ""}</td>
                  <td className="px-3 py-3 align-top">
                    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-black ${priorityTone(action.priority)}`}>
                      {PRIORITY_LABEL[action.priority] || action.priority}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-black ${statusTone(action.status)}`}>
                      {STATUS_LABEL[action.status] || action.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-top font-mono text-xs font-bold text-slate-600">{action.dueDate || "-"}</td>
                  <td className="px-3 py-3 align-top">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
                      <UserRound className="size-3.5"/>
                      {action.ownerName || "Chưa giao"}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex flex-wrap gap-1.5">
                      {action.status !== "closed" && action.status !== "done_by_owner" ? (<button className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-black text-blue-700" onClick={() => updateStatus(action, "in_progress")} type="button">
                          Xử lý
                        </button>) : null}
                      {action.status !== "closed" ? (<button className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700" onClick={() => { setEvidenceTarget(action); setNote(action.evidenceNotes || ""); }} type="button">
                          Bằng chứng
                        </button>) : null}
                      {action.status === "done_by_owner" ? (<button className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-700" onClick={() => { setVerifyTarget(action); setNote(action.verificationNote || ""); }} type="button">
                          Verify
                        </button>) : null}
                    </div>
                  </td>
                </tr>)) : (<tr>
                  <td className="px-3 py-10 text-center text-sm font-semibold text-slate-500" colSpan={9}>Chưa có CAPA phù hợp bộ lọc.</td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <ModalShell description="Tạo hành động khắc phục/phòng ngừa, có thể liên kết nguồn cảnh báo, sự cố hoặc audit." onClose={() => setCreateOpen(false)} open={createOpen} title="Tạo CAPA">
        <form className="grid gap-4 p-5" onSubmit={handleCreate}>
          <label className="grid gap-1.5">
            <span className="text-xs font-black uppercase text-slate-500">Tiêu đề</span>
            <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}/>
          </label>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Bộ phận</span>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={form.departmentCode} onChange={(event) => setForm((current) => ({ ...current, departmentCode: event.target.value }))}>
                {departments.map((department) => <option key={department.code} value={department.code}>{department.code} - {department.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Khu vực</span>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={form.locationId} onChange={(event) => setForm((current) => ({ ...current, locationId: event.target.value }))}>
                <option value="">Không chọn</option>
                {locations.filter((location) => location.departmentCode === form.departmentCode).map((location) => <option key={location.id} value={location.id}>{location.code} - {location.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Ưu tiên</span>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>
                <option value="low">Thấp</option>
                <option value="medium">Trung bình</option>
                <option value="high">Nghiêm trọng</option>
                <option value="critical">Cực kỳ nghiêm trọng</option>
              </select>
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Người phụ trách</span>
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={form.ownerName} onChange={(event) => setForm((current) => ({ ...current, ownerName: event.target.value }))}/>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Hạn xử lý</span>
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}/>
            </label>
          </div>
          <label className="grid gap-1.5">
            <span className="text-xs font-black uppercase text-slate-500">Mô tả</span>
            <textarea className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}/>
          </label>
          <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700" onClick={() => setCreateOpen(false)} type="button">
              <X className="size-4"/>
              Hủy
            </button>
            <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#f5c400] px-4 text-sm font-black text-[#0f2a15] disabled:opacity-60" disabled={saving} type="submit">
              {saving ? <Loader2 className="size-4 animate-spin"/> : <Save className="size-4"/>}
              Lưu CAPA
            </button>
          </footer>
        </form>
      </ModalShell>

      <ModalShell onClose={() => setEvidenceTarget(null)} open={Boolean(evidenceTarget)} title="Nộp bằng chứng CAPA">
        <form className="grid gap-4 p-5" onSubmit={submitEvidence}>
          <StatusBadge value={evidenceTarget ? `${evidenceTarget.code} - ${evidenceTarget.title}` : ""}/>
          <textarea className="min-h-36 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" required value={note} onChange={(event) => setNote(event.target.value)} placeholder="Mô tả bằng chứng sau khắc phục..."/>
          <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-60" disabled={saving} type="submit">
            {saving ? <Loader2 className="size-4 animate-spin"/> : <Send className="size-4"/>}
            Gửi bằng chứng
          </button>
        </form>
      </ModalShell>

      <ModalShell onClose={() => setVerifyTarget(null)} open={Boolean(verifyTarget)} title="EHS xác minh CAPA">
        <div className="grid gap-4 p-5">
          <StatusBadge value={verifyTarget ? `${verifyTarget.code} - ${verifyTarget.title}` : ""}/>
          <textarea className="min-h-32 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú xác minh hoặc lý do mở lại..."/>
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700" disabled={saving} onClick={() => verifyAction(false)} type="button">
              <AlertTriangle className="size-4"/>
              Mở lại
            </button>
            <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white" disabled={saving} onClick={() => verifyAction(true)} type="button">
              <CheckCircle2 className="size-4"/>
              Đóng CAPA
            </button>
          </div>
        </div>
      </ModalShell>
    </section>)}</SafetyI18nRender>;
}
export default SafetyActionsPage;
