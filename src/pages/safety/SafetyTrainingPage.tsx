import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, BookOpen, Building2, CalendarClock, CheckCircle2, ClipboardCheck, GraduationCap, Loader2, Plus, Save, ShieldCheck, Users, X } from "lucide-react";
import { apiFetchArray, postJson } from "./safety-api";
import { ErrorPanel, LoadingPanel, ModalShell } from "./safety-shared";
import { useHubLanguage } from "../../i18n-context";
import { localizedText } from "../../i18n-localized";
import { SafetyI18nRender } from "./safety-i18n-render";
import { SafetyLocalizedTextField, emptySafetyLocalizedText, safetyLocalizedPayload, safetyLocalizedVi } from "./safety-localized-form";
type LocalizedContent = Record<string, string | undefined>;
type Course = {
    id: string;
    code: string;
    name: string;
    nameI18n?: LocalizedContent;
    category: string;
    categoryI18n?: LocalizedContent;
    trainer: string;
    duration?: string;
    durationI18n?: LocalizedContent;
    notes?: string;
    notesI18n?: LocalizedContent;
    department: string;
    enrolled: number;
    completed: number;
    dueDate?: string;
    status: string;
};
type Department = {
    code: string;
    name: string;
};
type Requirement = {
    id: string;
    code: string;
    title: string;
    category: string;
    requiredForScope: string;
    departmentCode?: string;
    roleName?: string;
    documentId?: string;
    frequencyMonths: number;
};
type TrainingRecord = {
    id: string;
    requirementId: string;
    employeeCode?: string;
    employeeName: string;
    departmentCode: string;
    completedAt?: string;
    expiresAt?: string;
    status: string;
};
const DEFAULT_REQUIREMENT = {
    category: "6S",
    departmentCode: "",
    frequencyMonths: 12,
    requiredForScope: "company",
    roleName: "Toàn bộ nhân viên",
    title: ""
};
const DEFAULT_RECORD = {
    completedAt: new Date().toISOString().slice(0, 10),
    departmentCode: "EHS",
    employeeCode: "",
    employeeName: "",
    expiresAt: "",
    requirementId: "",
    status: "valid"
};
const DEFAULT_COURSE = {
    category: "6S",
    categoryI18n: emptySafetyLocalizedText("6S"),
    completed: 0,
    department: "company",
    dueDate: "",
    duration: "",
    durationI18n: emptySafetyLocalizedText(),
    enrolled: 0,
    name: "",
    nameI18n: emptySafetyLocalizedText(),
    notes: "",
    notesI18n: emptySafetyLocalizedText(),
    status: "Chưa bắt đầu",
    trainer: ""
};
function statusClass(status = "") {
    if (status === "valid" || status.includes("hoàn") || status.includes("Hoàn"))
        return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (status === "expired" || status === "overdue")
        return "border-red-200 bg-red-50 text-red-700";
    return "border-amber-200 bg-amber-50 text-amber-700";
}
function daysUntil(value = "") {
    if (!value)
        return null;
    const diff = new Date(value).getTime() - Date.now();
    if (!Number.isFinite(diff))
        return null;
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
}
function recordState(record: TrainingRecord) {
    const days = daysUntil(record.expiresAt);
    if (record.status === "expired" || record.status === "overdue" || (record.expiresAt && days !== null && days < 0))
        return "expired";
    if (days !== null && days >= 0 && days <= 30)
        return "expiring";
    if (record.status === "valid" || (record.expiresAt && days !== null && days >= 0))
        return "valid";
    return "pending";
}
function recordStateLabel(state: string) {
    if (state === "expired")
        return "Hết hạn";
    if (state === "expiring")
        return "Sắp hết hạn";
    if (state === "valid")
        return "Còn hiệu lực";
    return "Chờ bổ sung";
}
export function SafetyTrainingPage() {
    const { lang } = useHubLanguage();
    const [courses, setCourses] = useState<Course[]>([]);
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [records, setRecords] = useState<TrainingRecord[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<unknown>(null);
    const [requirementOpen, setRequirementOpen] = useState(false);
    const [recordOpen, setRecordOpen] = useState(false);
    const [courseOpen, setCourseOpen] = useState(false);
    const [recordFilter, setRecordFilter] = useState("all");
    const [saving, setSaving] = useState(false);
    const [requirementForm, setRequirementForm] = useState({ ...DEFAULT_REQUIREMENT });
    const [recordForm, setRecordForm] = useState({ ...DEFAULT_RECORD });
    const [courseForm, setCourseForm] = useState({ ...DEFAULT_COURSE });
    const courseText = useCallback((course: Course, key: keyof Course) => localizedText(course[`${String(key)}I18n` as keyof Course] as LocalizedContent | undefined, lang, String(course[key] || "")), [lang]);
    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [courseRows, requirementRows, recordRows, departmentRows] = await Promise.all([
                apiFetchArray<Course>("/api/training-courses"),
                apiFetchArray<Requirement>("/api/training-requirements"),
                apiFetchArray<TrainingRecord>("/api/training-records"),
                apiFetchArray<Department>("/api/safety/departments")
            ]);
            setCourses(courseRows);
            setRequirements(requirementRows);
            setRecords(recordRows);
            setDepartments(departmentRows);
            setRecordForm((current) => ({
                ...current,
                departmentCode: current.departmentCode || departmentRows[0]?.code || "EHS",
                requirementId: current.requirementId || requirementRows[0]?.id || ""
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
    const stats = useMemo(() => {
        const expired = records.filter((item) => item.status === "expired" || (item.expiresAt && item.expiresAt < new Date().toISOString().slice(0, 10))).length;
        const expiring = records.filter((item) => {
            const days = daysUntil(item.expiresAt);
            return days !== null && days >= 0 && days <= 30;
        }).length;
        const valid = records.filter((item) => item.status === "valid" || (item.expiresAt && item.expiresAt >= new Date().toISOString().slice(0, 10))).length;
        const courseRate = courses.reduce((sum, course) => sum + course.completed, 0) / Math.max(1, courses.reduce((sum, course) => sum + course.enrolled, 0));
        return { courseRate: Math.round(courseRate * 100), expired, expiring, valid };
    }, [courses, records]);
    const matrix = useMemo(() => {
        return departments.slice(0, 24).map((department) => {
            const deptRecords = records.filter((record) => record.departmentCode === department.code);
            const valid = deptRecords.filter((record) => record.status === "valid" || (record.expiresAt && record.expiresAt >= new Date().toISOString().slice(0, 10))).length;
            const required = requirements.filter((requirement) => !requirement.departmentCode || requirement.departmentCode === department.code).length;
            return {
                ...department,
                pct: required ? Math.round((valid / required) * 100) : 0,
                required,
                valid
            };
        });
    }, [departments, records, requirements]);
    const matrixAverage = matrix.length ? Math.round(matrix.reduce((sum, item) => sum + item.pct, 0) / matrix.length) : 0;
    const coveredDepartments = matrix.filter((item) => item.required > 0 && item.valid > 0).length;
    const scopeBreakdown = [
        { icon: ShieldCheck, label: "Cấp công ty", value: requirements.filter((item) => item.requiredForScope === "company").length, helper: "Đào tạo bắt buộc toàn nhà máy" },
        { icon: BadgeCheck, label: "Cấp EHS", value: requirements.filter((item) => item.requiredForScope === "ehs").length, helper: "Quy trình, audit, PCCC, y tế" },
        { icon: Building2, label: "Cấp bộ phận", value: requirements.filter((item) => item.requiredForScope === "department" || item.departmentCode).length, helper: "Theo vị trí, khu vực và rủi ro" }
    ];
    const filteredRecords = records.filter((record) => recordFilter === "all" || recordState(record) === recordFilter);
    const recordFilterItems = [
        { key: "all", label: "Tất cả", count: records.length },
        { key: "valid", label: "Còn hiệu lực", count: records.filter((record) => recordState(record) === "valid").length },
        { key: "expiring", label: "Sắp hết hạn", count: records.filter((record) => recordState(record) === "expiring").length },
        { key: "expired", label: "Hết hạn", count: records.filter((record) => recordState(record) === "expired").length }
    ];
    async function createRequirement(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);
        try {
            await postJson<Requirement>("/api/training-requirements", requirementForm);
            setRequirementOpen(false);
            setRequirementForm({ ...DEFAULT_REQUIREMENT });
            await loadData();
        }
        finally {
            setSaving(false);
        }
    }
    async function createRecord(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);
        try {
            await postJson<TrainingRecord>("/api/training-records", recordForm);
            setRecordOpen(false);
            setRecordForm({ ...DEFAULT_RECORD, departmentCode: departments[0]?.code || "EHS", requirementId: requirements[0]?.id || "" });
            await loadData();
        }
        finally {
            setSaving(false);
        }
    }
    async function createCourse(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);
        try {
            const nameI18n = safetyLocalizedPayload(courseForm.nameI18n, courseForm.name);
            const categoryI18n = safetyLocalizedPayload(courseForm.categoryI18n, courseForm.category);
            const durationI18n = safetyLocalizedPayload(courseForm.durationI18n, courseForm.duration);
            const notesI18n = safetyLocalizedPayload(courseForm.notesI18n, courseForm.notes);
            await postJson<Course>("/api/training-courses", {
                ...courseForm,
                category: safetyLocalizedVi(categoryI18n, courseForm.category),
                categoryI18n,
                completed: Number(courseForm.completed) || 0,
                duration: safetyLocalizedVi(durationI18n, courseForm.duration),
                durationI18n,
                enrolled: Number(courseForm.enrolled) || 0,
                name: safetyLocalizedVi(nameI18n, courseForm.name),
                nameI18n,
                notes: safetyLocalizedVi(notesI18n, courseForm.notes),
                notesI18n
            });
            setCourseOpen(false);
            setCourseForm({ ...DEFAULT_COURSE });
            await loadData();
        }
        finally {
            setSaving(false);
        }
    }
    if (loading)
        return <SafetyI18nRender>{<LoadingPanel label="Đang tải ma trận đào tạo"/>}</SafetyI18nRender>;
    if (error)
        return <SafetyI18nRender>{<ErrorPanel error={error}/>}</SafetyI18nRender>;
    return <SafetyI18nRender>{(<section className="safety-training-page mx-auto max-w-7xl space-y-5 pb-10">
      <div className="safety-training-stat-grid grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
            { icon: BookOpen, label: "Yêu cầu đào tạo", value: requirements.length, tone: "border-blue-200 text-blue-700" },
            { icon: CheckCircle2, label: "Hồ sơ còn hiệu lực", value: stats.valid, tone: "border-emerald-200 text-emerald-700" },
            { icon: CalendarClock, label: "Sắp hết hạn 30 ngày", value: stats.expiring, tone: "border-amber-200 text-amber-700" },
            { icon: AlertTriangle, label: "Hết hạn/quá hạn", value: stats.expired, tone: "border-red-200 text-red-700" }
        ].map((item) => (<article className={`safety-training-stat-card rounded-lg border bg-white p-4 shadow-sm ${item.tone}`} key={item.label}>
            <item.icon className="size-5"/>
            <strong className="mt-2 block font-mono text-3xl leading-none">{item.value}</strong>
            <span className="mt-1 block text-xs font-black uppercase text-slate-500">{item.label}</span>
          </article>))}
      </div>

      <div className="safety-training-command flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-950">Đào tạo Safety - Training Matrix</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">Theo dõi yêu cầu đào tạo theo công ty/EHS/bộ phận, hồ sơ hết hạn và tỷ lệ hoàn thành khóa học.</p>
        </div>
        <div className="safety-training-actions flex flex-wrap gap-2">
          <button className="safety-training-action-btn inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50" onClick={() => setCourseOpen(true)} type="button">
            <GraduationCap className="size-4"/>
            Thêm khóa
          </button>
          <button className="safety-training-action-btn inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50" onClick={() => setRecordOpen(true)} type="button">
            <Users className="size-4"/>
            Thêm hồ sơ
          </button>
          <button className="safety-training-create-btn inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#f5c400] px-4 text-sm font-black text-[#0f2a15]" onClick={() => setRequirementOpen(true)} type="button">
            <Plus className="size-4"/>
            Thêm yêu cầu
          </button>
        </div>
      </div>

      <div className="safety-training-scope-grid grid gap-3 md:grid-cols-3">
        {scopeBreakdown.map((item) => (<article className="safety-training-scope-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={item.label}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-xs font-black text-slate-500">{item.label}</span>
                <strong className="mt-2 block font-mono text-3xl leading-none text-blue-700">{item.value}</strong>
                <small className="mt-2 block text-xs font-semibold leading-relaxed text-slate-500">{item.helper}</small>
              </div>
              <span className="safety-training-scope-icon"><item.icon className="size-5"/></span>
            </div>
          </article>))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="safety-training-matrix-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardCheck className="size-5 text-blue-700"/>
            <h3 className="font-black text-slate-950">Ma trận theo bộ phận</h3>
          </div>
          <div className="safety-training-matrix-grid grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
            {matrix.map((item) => (<article className="safety-training-matrix-item rounded-lg border border-slate-200 p-3" key={item.code}>
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-slate-950">{item.code}</strong>
                  <span className={`rounded-md border px-2 py-1 text-xs font-black ${item.pct >= 90 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : item.pct >= 70 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-red-200 bg-red-50 text-red-700"}`}>{item.pct}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-700" style={{ width: `${Math.min(100, item.pct)}%` }}/>
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">{item.valid}/{item.required} yêu cầu còn hiệu lực</p>
              </article>))}
          </div>
        </div>

        <aside className="space-y-4">
          <section className="safety-training-course-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-black text-slate-950">Khóa đào tạo hiện có</h3>
            <div className="safety-training-course-rate mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-blue-800">
              <strong className="font-mono text-3xl">{stats.courseRate}%</strong>
              <span className="ml-2 text-sm font-bold">tỷ lệ hoàn thành khóa</span>
            </div>
            <div className="mt-3 grid gap-2">
              {courses.slice(0, 5).map((course) => (<article className="safety-training-course-row rounded-lg border border-slate-200 p-3" key={course.id}>
                  <div className="font-mono text-xs font-black text-blue-700">{course.code}</div>
                  <strong className="mt-1 block text-sm leading-snug text-slate-950">{courseText(course, "name")}</strong>
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    {[course.department, courseText(course, "category"), courseText(course, "duration")]
                .filter(Boolean)
                .join(" - ")} - {course.completed}/{course.enrolled}
                  </span>
                </article>))}
            </div>
          </section>
        </aside>
      </div>

      <div className="safety-training-table-card overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 font-black text-slate-950">Hồ sơ đào tạo</div>
        <div className="safety-training-toolbar border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold text-slate-500">Lọc nhanh hồ sơ cần nhắc học lại hoặc đã hết hạn.</p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Lọc hồ sơ đào tạo">
            {recordFilterItems.map((item) => (<button aria-pressed={recordFilter === item.key} className={`safety-training-filter-chip rounded-lg border px-3 py-1.5 text-xs font-black ${recordFilter === item.key ? "active border-[#f5c400] bg-[#f5c400] text-[#0f2a15]" : "border-slate-200 bg-white text-slate-600"}`} key={item.key} onClick={() => setRecordFilter(item.key)} type="button">
                {item.label} <span className="font-mono">{item.count}</span>
              </button>))}
          </div>
        </div>
        {filteredRecords.length ? (<div className="safety-training-mobile-list grid gap-3 p-3 sm:hidden">
          {filteredRecords.map((record) => {
            const requirement = requirements.find((item) => item.id === record.requirementId);
            const state = recordState(record);
            const tone = state === "valid" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : state === "expiring" ? "border-amber-200 bg-amber-50 text-amber-700" : state === "expired" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-700";
            return (<article className="safety-training-mobile-card rounded-lg border border-slate-200 bg-white p-3 shadow-sm" key={record.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <strong className="block text-sm text-slate-950">{record.employeeName}</strong>
                  <span className="font-mono text-xs font-bold text-blue-700">{record.employeeCode || "N/A"}</span>
                </div>
                <span className={`rounded-md border px-2 py-1 text-xs font-black ${tone}`}>{recordStateLabel(state)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-slate-50 p-2"><span className="block font-black text-slate-400">Bộ phận</span><strong>{record.departmentCode}</strong></div>
                <div className="rounded-md bg-slate-50 p-2"><span className="block font-black text-slate-400">Hoàn thành</span><strong>{record.completedAt || "-"}</strong></div>
                <div className="rounded-md bg-slate-50 p-2"><span className="block font-black text-slate-400">Hết hạn</span><strong>{record.expiresAt || "-"}</strong></div>
                <div className="rounded-md bg-slate-50 p-2"><span className="block font-black text-slate-400">Trạng thái</span><strong>{record.status}</strong></div>
              </div>
              <p className="mt-3 text-xs font-semibold leading-relaxed text-slate-600">{requirement?.title || record.requirementId}</p>
            </article>);
          })}
        </div>) : null}
        <div className="safety-training-table-wrap hidden overflow-x-auto sm:block">
          <table className="safety-training-table min-w-[900px] w-full text-left text-sm">
            <thead className="bg-white text-xs text-slate-500">
              <tr>
                {["Nhân viên", "Bộ phận", "Yêu cầu", "DONE", "Hết hạn", "Trạng thái"].map((column) => (<th className="border-b border-slate-200 px-3 py-3 font-black" key={column}>{column}</th>))}
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length ? filteredRecords.map((record) => {
            const requirement = requirements.find((item) => item.id === record.requirementId);
            const state = recordState(record);
            const tone = state === "valid" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : state === "expiring" ? "border-amber-200 bg-amber-50 text-amber-700" : state === "expired" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-700";
            return (<tr className="safety-training-row border-b border-slate-100 last:border-0" key={record.id}>
                    <td className="px-3 py-3"><strong>{record.employeeName}</strong><span className="ml-2 font-mono text-xs text-slate-400">{record.employeeCode}</span></td>
                    <td className="px-3 py-3 font-black text-slate-700">{record.departmentCode}</td>
                    <td className="safety-training-title-cell px-3 py-3">{requirement?.title || record.requirementId}</td>
                    <td className="px-3 py-3 font-mono text-xs font-bold text-slate-600">{record.completedAt || "-"}</td>
                    <td className="px-3 py-3 font-mono text-xs font-bold text-slate-600">{record.expiresAt || "-"}</td>
                    <td className="px-3 py-3"><span className={`rounded-md border px-2 py-1 text-xs font-black ${tone}`}>{recordStateLabel(state)}</span></td>
                  </tr>);
        }) : (<tr><td className="px-3 py-8 text-center text-sm font-semibold text-slate-500" colSpan={6}>Chưa có hồ sơ đào tạo chi tiết.</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <ModalShell onClose={() => setCourseOpen(false)} open={courseOpen} title="Thêm khóa đào tạo">
        <form className="grid gap-4 p-5" onSubmit={createCourse}>
          <SafetyLocalizedTextField
            ariaLabel="Tên khóa đào tạo"
            inputClassName="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
            label="Tên khóa đào tạo"
            onChange={(value) => setCourseForm((current) => ({ ...current, nameI18n: value, name: safetyLocalizedVi(value) }))}
            placeholder="VD: Đào tạo 6S cơ bản"
            required
            value={courseForm.nameI18n}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <SafetyLocalizedTextField
              ariaLabel="Danh mục khóa đào tạo"
              inputClassName="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
              label="Danh mục"
              onChange={(value) => setCourseForm((current) => ({ ...current, categoryI18n: value, category: safetyLocalizedVi(value) }))}
              placeholder="6S, PCCC, KYT..."
              value={courseForm.categoryI18n}
            />
            <SafetyLocalizedTextField
              ariaLabel="Thời lượng khóa đào tạo"
              inputClassName="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
              label="Thời lượng"
              onChange={(value) => setCourseForm((current) => ({ ...current, durationI18n: value, duration: safetyLocalizedVi(value) }))}
              placeholder="2 giờ"
              value={courseForm.durationI18n}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Giảng viên</span>
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={courseForm.trainer} onChange={(event) => setCourseForm((current) => ({ ...current, trainer: event.target.value }))}/>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Bộ phận</span>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={courseForm.department} onChange={(event) => setCourseForm((current) => ({ ...current, department: event.target.value }))}>
                <option value="company">Công ty</option>
                {departments.map((department) => <option key={department.code} value={department.code}>{department.code}</option>)}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Đăng ký</span>
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" min={0} type="number" value={courseForm.enrolled} onChange={(event) => setCourseForm((current) => ({ ...current, enrolled: Number(event.target.value) }))}/>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Hoàn thành</span>
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" min={0} type="number" value={courseForm.completed} onChange={(event) => setCourseForm((current) => ({ ...current, completed: Number(event.target.value) }))}/>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Hạn hoàn thành</span>
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" type="date" value={courseForm.dueDate} onChange={(event) => setCourseForm((current) => ({ ...current, dueDate: event.target.value }))}/>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Trạng thái</span>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={courseForm.status} onChange={(event) => setCourseForm((current) => ({ ...current, status: event.target.value }))}>
                <option value="Chưa bắt đầu">Chưa bắt đầu</option>
                <option value="Đang học">Đang học</option>
                <option value="DONE">Hoàn thành</option>
              </select>
            </label>
          </div>
          <SafetyLocalizedTextField
            ariaLabel="Ghi chú khóa đào tạo"
            inputClassName="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold resize-none"
            label="Ghi chú"
            onChange={(value) => setCourseForm((current) => ({ ...current, notesI18n: value, notes: safetyLocalizedVi(value) }))}
            placeholder="Tài liệu kèm theo, nhóm cần ưu tiên..."
            rows={3}
            textarea
            value={courseForm.notesI18n}
          />
          <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700" onClick={() => setCourseOpen(false)} type="button"><X className="size-4"/>Hủy</button>
            <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#f5c400] px-4 text-sm font-black text-[#0f2a15]" disabled={saving} type="submit">{saving ? <Loader2 className="size-4 animate-spin"/> : <Save className="size-4"/>}Lưu</button>
          </footer>
        </form>
      </ModalShell>

      <ModalShell onClose={() => setRequirementOpen(false)} open={requirementOpen} title="Thêm yêu cầu đào tạo">
        <form className="grid gap-4 p-5" onSubmit={createRequirement}>
          <label className="grid gap-1.5">
            <span className="text-xs font-black uppercase text-slate-500">Tên yêu cầu</span>
            <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" required value={requirementForm.title} onChange={(event) => setRequirementForm((current) => ({ ...current, title: event.target.value }))}/>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Danh mục</span>
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={requirementForm.category} onChange={(event) => setRequirementForm((current) => ({ ...current, category: event.target.value }))}/>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Chu kỳ tháng</span>
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" min={1} type="number" value={requirementForm.frequencyMonths} onChange={(event) => setRequirementForm((current) => ({ ...current, frequencyMonths: Number(event.target.value) }))}/>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Cấp áp dụng</span>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={requirementForm.requiredForScope} onChange={(event) => setRequirementForm((current) => ({ ...current, requiredForScope: event.target.value }))}>
                <option value="company">Công ty</option>
                <option value="ehs">EHS</option>
                <option value="department">Bộ phận</option>
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Bộ phận riêng</span>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={requirementForm.departmentCode} onChange={(event) => setRequirementForm((current) => ({ ...current, departmentCode: event.target.value }))}>
                <option value="">Tất cả</option>
                {departments.map((department) => <option key={department.code} value={department.code}>{department.code}</option>)}
              </select>
            </label>
          </div>
          <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700" onClick={() => setRequirementOpen(false)} type="button"><X className="size-4"/>Hủy</button>
            <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#f5c400] px-4 text-sm font-black text-[#0f2a15]" disabled={saving} type="submit">{saving ? <Loader2 className="size-4 animate-spin"/> : <Save className="size-4"/>}Lưu</button>
          </footer>
        </form>
      </ModalShell>

      <ModalShell onClose={() => setRecordOpen(false)} open={recordOpen} title="Thêm hồ sơ đào tạo">
        <form className="grid gap-4 p-5" onSubmit={createRecord}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Nhân viên</span>
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" required value={recordForm.employeeName} onChange={(event) => setRecordForm((current) => ({ ...current, employeeName: event.target.value }))}/>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Mã nhân viên</span>
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={recordForm.employeeCode} onChange={(event) => setRecordForm((current) => ({ ...current, employeeCode: event.target.value }))}/>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Yêu cầu</span>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={recordForm.requirementId} onChange={(event) => setRecordForm((current) => ({ ...current, requirementId: event.target.value }))}>
                {requirements.map((requirement) => <option key={requirement.id} value={requirement.id}>{requirement.code} - {requirement.title}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Bộ phận</span>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={recordForm.departmentCode} onChange={(event) => setRecordForm((current) => ({ ...current, departmentCode: event.target.value }))}>
                {departments.map((department) => <option key={department.code} value={department.code}>{department.code}</option>)}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5"><span className="text-xs font-black uppercase text-slate-500">Hoàn thành</span><input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" type="date" value={recordForm.completedAt} onChange={(event) => setRecordForm((current) => ({ ...current, completedAt: event.target.value }))}/></label>
            <label className="grid gap-1.5"><span className="text-xs font-black uppercase text-slate-500">Hết hạn</span><input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" type="date" value={recordForm.expiresAt} onChange={(event) => setRecordForm((current) => ({ ...current, expiresAt: event.target.value }))}/></label>
            <label className="grid gap-1.5"><span className="text-xs font-black uppercase text-slate-500">Trạng thái</span><select className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={recordForm.status} onChange={(event) => setRecordForm((current) => ({ ...current, status: event.target.value }))}><option value="valid">valid</option><option value="pending">pending</option><option value="expired">expired</option></select></label>
          </div>
          <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700" onClick={() => setRecordOpen(false)} type="button"><X className="size-4"/>Hủy</button>
            <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#f5c400] px-4 text-sm font-black text-[#0f2a15]" disabled={saving} type="submit">{saving ? <Loader2 className="size-4 animate-spin"/> : <Save className="size-4"/>}Lưu</button>
          </footer>
        </form>
      </ModalShell>
    </section>)}</SafetyI18nRender>;
}
export default SafetyTrainingPage;
