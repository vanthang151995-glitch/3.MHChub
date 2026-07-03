import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardCheck, Loader2, Plus, Save, Send, ShieldCheck, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { currentMonth, apiFetchArray, patchJson, postJson } from "./safety-api";
import { ErrorPanel, LoadingPanel, ModalShell } from "./safety-shared";
import { SafetyI18nRender } from "./safety-i18n-render";
type AuditQuestion = {
    id: string;
    pillar: string;
    sortOrder: number;
    question: string;
    expectedStandard: string;
    maxScore: number;
    requiredEvidence: boolean;
};
type AuditTemplate = {
    id: string;
    code: string;
    name: string;
    version: string;
    questions: AuditQuestion[];
};
type AuditAnswer = {
    id?: string;
    questionId: string;
    score: number;
    finding?: string;
    evidenceNotes?: string;
    actionRequired?: boolean;
};
type Audit = {
    id: string;
    code: string;
    templateId: string;
    title: string;
    departmentCode: string;
    locationId?: string;
    period?: string;
    scheduledDate?: string;
    status: string;
    totalScore: number;
    maxScore: number;
    scorePercent: number;
    reviewNote?: string;
    createdByName?: string;
    createdAt?: string;
};
type Department = {
    code: string;
    name: string;
};
type Location = {
    id: string;
    code: string;
    name: string;
    departmentCode: string;
};
const STATUS_LABEL: Record<string, string> = {
    closed: "Đã đóng",
    draft: "Nháp",
    reopened: "Mở lại",
    reviewed: "EHS đã review",
    submitted: "Chờ EHS review"
};
const DEFAULT_FORM = {
    departmentCode: "EHS",
    locationId: "",
    period: currentMonth(),
    scheduledDate: new Date().toISOString().slice(0, 10),
    templateId: "",
    title: ""
};
const PROGRAM_LABELS: Record<string, string> = {
    kyt: "KYT",
    pccc: "PCCC & Điện",
    medical: "Y tế / Sơ cứu",
    "self-inspection": "Tự kiểm tra ATVSLĐ"
};
function errorMessage(error: unknown, fallback: string) {
    return (error as Error)?.message || fallback;
}
function statusClass(status: string) {
    if (status === "reviewed" || status === "closed")
        return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (status === "submitted")
        return "border-blue-200 bg-blue-50 text-blue-700";
    if (status === "reopened")
        return "border-red-200 bg-red-50 text-red-700";
    return "border-slate-200 bg-slate-50 text-slate-700";
}
function scoreClass(score: number) {
    if (score > 97) return "text-emerald-700";
    if (score >= 91) return "text-green-700";
    if (score >= 71) return "text-lime-700";
    if (score >= 51) return "text-amber-700";
    if (score >= 31) return "text-orange-700";
    return "text-red-700";
}
function scoreLabel(score: number) {
    if (score > 97) return "Xuất sắc";
    if (score >= 91) return "Tốt";
    if (score >= 71) return "Khá";
    if (score >= 51) return "Trung bình";
    if (score >= 31) return "Yếu";
    return "Kém";
}
export function SafetyAuditsPage() {
    const location = useLocation();
    const autoOpenKey = useRef("");
    const [audits, setAudits] = useState<Audit[]>([]);
    const [templates, setTemplates] = useState<AuditTemplate[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<unknown>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ ...DEFAULT_FORM });
    const [answers, setAnswers] = useState<AuditAnswer[]>([]);
    const [reviewTarget, setReviewTarget] = useState<Audit | null>(null);
    const [reviewNote, setReviewNote] = useState("");
    const [operationError, setOperationError] = useState("");
    const [operationSuccess, setOperationSuccess] = useState("");
    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [auditRows, templateRows, departmentRows, locationRows] = await Promise.all([
                apiFetchArray<Audit>("/api/audits"),
                apiFetchArray<AuditTemplate>("/api/audit-templates"),
                apiFetchArray<Department>("/api/safety/departments"),
                apiFetchArray<Location>("/api/locations")
            ]);
            setAudits(auditRows);
            setTemplates(templateRows);
            setDepartments(departmentRows);
            setLocations(locationRows);
            const templateId = templateRows[0]?.id || "";
            const departmentCode = departmentRows[0]?.code || "EHS";
            setForm((current) => ({
                ...current,
                departmentCode: current.departmentCode || departmentCode,
                templateId: current.templateId || templateId,
                title: current.title || `Audit 6S ${departmentCode} ${current.period || currentMonth()}`
            }));
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
    const activeTemplate = useMemo(() => templates.find((item) => item.id === form.templateId) || templates[0], [form.templateId, templates]);
    useEffect(() => {
        if (!activeTemplate)
            return;
        setAnswers(activeTemplate.questions.map((question) => ({
            actionRequired: false,
            evidenceNotes: "",
            finding: "",
            questionId: question.id,
            score: question.maxScore
        })));
    }, [activeTemplate]);
    useEffect(() => {
        if (loading)
            return;
        const params = new URLSearchParams(location.search);
        if (params.get("create") !== "1")
            return;
        if (autoOpenKey.current === location.search)
            return;
        autoOpenKey.current = location.search;
        const programId = params.get("program") || "";
        const programLabel = PROGRAM_LABELS[programId] || "";
        setOperationError("");
        setOperationSuccess("");
        setCreateOpen(true);
        setForm((current) => ({
            ...current,
            title: programLabel
                ? `Audit chuyên đề ${programLabel} ${current.departmentCode || "EHS"} ${current.period || currentMonth()}`
                : current.title || `Audit 6S ${current.departmentCode || "EHS"} ${current.period || currentMonth()}`
        }));
    }, [loading, location.search]);
    const stats = useMemo(() => {
        const submitted = audits.filter((item) => item.status === "submitted").length;
        const reviewed = audits.filter((item) => item.status === "reviewed" || item.status === "closed").length;
        const lowScore = audits.filter((item) => Number(item.scorePercent || 0) < 80).length;
        const avg = audits.length ? Math.round(audits.reduce((sum, item) => sum + Number(item.scorePercent || 0), 0) / audits.length) : 0;
        return { avg, lowScore, reviewed, submitted };
    }, [audits]);
    function updateAnswer(questionId: string, patch: Partial<AuditAnswer>) {
        setAnswers((current) => current.map((answer) => {
            if (answer.questionId !== questionId)
                return answer;
            const next = { ...answer, ...patch };
            if (patch.score !== undefined && Number(patch.score) <= 1) {
                next.actionRequired = true;
            }
            return next;
        }));
    }
    async function handleCreate(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);
        setOperationError("");
        setOperationSuccess("");
        try {
            const created = await postJson<Audit>("/api/audits", { ...form, answers });
            setCreateOpen(false);
            setOperationSuccess(`Đã tạo audit ${created.code || form.title}.`);
            await loadData();
        }
        catch (createError) {
            setOperationError(errorMessage(createError, "Không lưu được audit. Kiểm tra đăng nhập, quyền hoặc dữ liệu bắt buộc."));
        }
        finally {
            setSaving(false);
        }
    }
    async function submitAudit(audit: Audit) {
        setOperationError("");
        setOperationSuccess("");
        try {
            const updated = await postJson<Audit>(`/api/audits/${encodeURIComponent(audit.id)}/submit`, {});
            setOperationSuccess(`Đã gửi ${updated.code || audit.code} sang EHS review.`);
            await loadData();
        }
        catch (submitError) {
            setOperationError(errorMessage(submitError, "Không submit được audit."));
        }
    }
    async function reviewAudit(approved: boolean) {
        if (!reviewTarget)
            return;
        setSaving(true);
        setOperationError("");
        setOperationSuccess("");
        try {
            const updated = await postJson<Audit>(`/api/audits/${encodeURIComponent(reviewTarget.id)}/review`, { approved, note: reviewNote });
            setReviewTarget(null);
            setReviewNote("");
            setOperationSuccess(approved ? `Đã duyệt audit ${updated.code || reviewTarget.code}.` : `Đã trả lại audit ${updated.code || reviewTarget.code}.`);
            await loadData();
        }
        catch (reviewError) {
            setOperationError(errorMessage(reviewError, "Không review được audit."));
        }
        finally {
            setSaving(false);
        }
    }
    async function markReopened(audit: Audit) {
        setOperationError("");
        setOperationSuccess("");
        try {
            const updated = await patchJson<Audit>(`/api/audits/${encodeURIComponent(audit.id)}`, { status: "reopened" });
            setOperationSuccess(`Đã mở lại audit ${updated.code || audit.code}.`);
            await loadData();
        }
        catch (reopenError) {
            setOperationError(errorMessage(reopenError, "Không mở lại được audit."));
        }
    }
    if (loading)
        return <SafetyI18nRender>{<LoadingPanel label="Đang tải audit 6S"/>}</SafetyI18nRender>;
    if (error)
        return <SafetyI18nRender>{<ErrorPanel error={error}/>}</SafetyI18nRender>;
    return <SafetyI18nRender>{(<section className="mx-auto max-w-7xl space-y-5 pb-10">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
            { icon: ClipboardCheck, label: "Audit trong kỳ", value: audits.length, tone: "border-blue-200 text-blue-700" },
            { icon: Send, label: "Chờ EHS review", value: stats.submitted, tone: "border-amber-200 text-amber-700" },
            { icon: ShieldCheck, label: "Đã review", value: stats.reviewed, tone: "border-emerald-200 text-emerald-700" },
            { icon: AlertTriangle, label: "Điểm dưới 80", value: stats.lowScore, tone: "border-red-200 text-red-700" }
        ].map((item) => (<article className={`rounded-lg border bg-white p-4 shadow-sm ${item.tone}`} key={item.label}>
            <item.icon className="size-5"/>
            <strong className="mt-2 block font-mono text-3xl leading-none">{item.value}</strong>
            <span className="mt-1 block text-xs font-black uppercase text-slate-500">{item.label}</span>
          </article>))}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-950">Audit 6S theo bộ phận</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">Template EHS-QT-11/EHS-QT-12, chấm điểm S1-S6, review EHS và tự sinh CAPA từ điểm lỗi.</p>
        </div>
        <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#f5c400] px-4 text-sm font-black text-[#0f2a15] shadow-sm hover:bg-[#e0b300]" onClick={() => setCreateOpen(true)} type="button">
          <Plus className="size-4"/>
          Tạo audit
        </button>
      </div>

      {operationError ? (<div className="safety-operation-feedback error" role="alert">
        <AlertTriangle className="size-4"/>
        <span>{operationError}</span>
      </div>) : null}
      {operationSuccess ? (<div className="safety-operation-feedback success" role="status">
        <CheckCircle2 className="size-4"/>
        <span>{operationSuccess}</span>
      </div>) : null}

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  {["Mã", "Audit", "Bộ phận", "Kỳ", "Lịch", "Điểm", "Trạng thái", "Thao tác"].map((column) => (<th className="border-b border-slate-200 px-3 py-3 font-black" key={column}>{column}</th>))}
                </tr>
              </thead>
              <tbody>
                {audits.length ? audits.map((audit) => (<tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60" key={audit.id}>
                    <td className="px-3 py-3 align-top font-mono text-xs font-black text-blue-700">{audit.code}</td>
                    <td className="px-3 py-3 align-top">
                      <strong className="block text-slate-950">{audit.title}</strong>
                      <span className="mt-1 block text-xs font-semibold text-slate-500">{audit.createdByName || "Safety"} tạo</span>
                    </td>
                    <td className="px-3 py-3 align-top font-black text-slate-700">{audit.departmentCode}</td>
                    <td className="px-3 py-3 align-top font-mono text-xs font-bold text-slate-600">{audit.period || "-"}</td>
                    <td className="px-3 py-3 align-top font-mono text-xs font-bold text-slate-600">{audit.scheduledDate || "-"}</td>
                    <td className="px-3 py-3 align-top">
                      <strong className={`font-mono text-lg ${scoreClass(Number(audit.scorePercent || 0))}`}>{Math.round(Number(audit.scorePercent || 0))}%</strong>
                      <span className="ml-1 text-xs text-slate-400">({audit.totalScore}/{audit.maxScore})</span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-black ${statusClass(audit.status)}`}>
                        {STATUS_LABEL[audit.status] || audit.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {audit.status === "draft" || audit.status === "reopened" ? (<button className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-black text-blue-700" onClick={() => submitAudit(audit)} type="button">
                            Submit
                          </button>) : null}
                        {audit.status === "submitted" ? (<button className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700" onClick={() => { setReviewTarget(audit); setReviewNote(audit.reviewNote || ""); }} type="button">
                            Review
                          </button>) : null}
                        {audit.status === "reviewed" ? (<button className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-black text-red-700" onClick={() => markReopened(audit)} type="button">
                            Mở lại
                          </button>) : null}
                      </div>
                    </td>
                  </tr>)) : (<tr>
                    <td className="px-3 py-10 text-center text-sm font-semibold text-slate-500" colSpan={8}>Chưa có audit nào.</td>
                  </tr>)}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-700"/>
            <h3 className="font-black text-slate-950">Template đang dùng</h3>
          </div>
          <div className="mt-3 grid gap-3">
            {templates.map((template) => (<article className="rounded-lg border border-slate-200 p-3" key={template.id}>
                <div className="font-mono text-xs font-black text-blue-700">{template.code}</div>
                <strong className="mt-1 block text-sm text-slate-950">{template.name}</strong>
                <span className="mt-1 block text-xs font-semibold text-slate-500">{template.questions.length} câu hỏi - v{template.version}</span>
              </article>))}
          </div>
          <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">
            Điểm trung bình hiện tại: <strong className="font-mono">{stats.avg}%</strong>
          </div>
        </aside>
      </div>

      <ModalShell description="Chấm nhanh theo template. Điểm dưới 4 sẽ tự đánh dấu cần CAPA." onClose={() => setCreateOpen(false)} open={createOpen} title="Tạo audit 6S">
        <form className="grid gap-4 p-5" onSubmit={handleCreate}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Template</span>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={form.templateId} onChange={(event) => setForm((current) => ({ ...current, templateId: event.target.value }))}>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.code} - {template.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Bộ phận</span>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={form.departmentCode} onChange={(event) => setForm((current) => ({ ...current, departmentCode: event.target.value, title: `Audit 6S ${event.target.value} ${current.period}` }))}>
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
              <span className="text-xs font-black uppercase text-slate-500">Ngày audit</span>
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" type="date" value={form.scheduledDate} onChange={(event) => setForm((current) => ({ ...current, scheduledDate: event.target.value }))}/>
            </label>
          </div>
          <label className="grid gap-1.5">
            <span className="text-xs font-black uppercase text-slate-500">Tiêu đề</span>
            <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}/>
          </label>
          <div className="max-h-[44vh] overflow-y-auto rounded-lg border border-slate-200">
            {(activeTemplate?.questions || []).map((question) => {
            const answer = answers.find((item) => item.questionId === question.id);
            return (<div className="grid gap-3 border-b border-slate-100 p-3 last:border-0 md:grid-cols-[64px_minmax(0,1fr)_120px]" key={question.id}>
                  <span className="inline-flex h-8 w-12 items-center justify-center rounded-md bg-slate-100 text-xs font-black text-slate-600">{question.pillar}</span>
                  <div className="min-w-0">
                    <strong className="block text-sm text-slate-950">{question.question}</strong>
                    <span className="mt-1 block text-xs font-medium leading-snug text-slate-500">{question.expectedStandard}</span>
                    <textarea className="mt-2 min-h-16 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onChange={(event) => updateAnswer(question.id, { finding: event.target.value })} placeholder="Finding/bằng chứng nếu có..." value={answer?.finding || ""}/>
                  </div>
                  <label className="grid gap-1">
                    <span className="text-xs font-black uppercase text-slate-500">Điểm</span>
                    <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black" max={question.maxScore} min={0} onChange={(event) => updateAnswer(question.id, { score: Number(event.target.value) })} type="number" value={answer?.score ?? question.maxScore}/>
                    <label className="mt-1 flex items-center gap-2 text-xs font-bold text-slate-600">
                      <input checked={Boolean(answer?.actionRequired)} onChange={(event) => updateAnswer(question.id, { actionRequired: event.target.checked })} type="checkbox"/>
                      Cần CAPA
                    </label>
                  </label>
                </div>);
        })}
          </div>
          <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700" onClick={() => setCreateOpen(false)} type="button">
              <X className="size-4"/>
              Hủy
            </button>
            <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#f5c400] px-4 text-sm font-black text-[#0f2a15] disabled:opacity-60" disabled={saving} type="submit">
              {saving ? <Loader2 className="size-4 animate-spin"/> : <Save className="size-4"/>}
              Lưu audit
            </button>
          </footer>
        </form>
      </ModalShell>

      <ModalShell onClose={() => setReviewTarget(null)} open={Boolean(reviewTarget)} title="EHS review audit">
        <div className="grid gap-4 p-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="font-mono text-xs font-black text-blue-700">{reviewTarget?.code}</div>
            <strong className="mt-1 block text-slate-950">{reviewTarget?.title}</strong>
            <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <CalendarDays className="size-3.5"/>
              {reviewTarget?.departmentCode} - {reviewTarget?.period}
            </span>
          </div>
          <textarea className="min-h-32 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Ghi chú review..."/>
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700" disabled={saving} onClick={() => reviewAudit(false)} type="button">
              <AlertTriangle className="size-4"/>
              Trả lại
            </button>
            <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white" disabled={saving} onClick={() => reviewAudit(true)} type="button">
              <CheckCircle2 className="size-4"/>
              Duyệt audit
            </button>
          </div>
        </div>
      </ModalShell>
    </section>)}</SafetyI18nRender>;
}
export default SafetyAuditsPage;
