import { useCallback, useEffect, useMemo, useState } from "react";
import { SafetyCapaNav } from "./SafetyCapaNav";
import { CapaExportModal, type CapaExportItem } from "./CapaExportModal";
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardCheck, Clock, FileDown, ListChecks, Loader2, Plus, Save, Search, Send, ShieldCheck, UserRound, Workflow, X } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area } from "recharts";
import { addDaysDate, apiFetch, apiFetchArray, patchJson, postJson } from "./safety-api";
import { ErrorPanel, LoadingPanel, ModalShell, StatusBadge } from "./safety-shared";
import { SafetyI18nRender } from "./safety-i18n-render";
import { useHubLanguage } from "../../i18n-context";
import { BilingualText } from "../../components/BilingualField";
import { CapaViewModal } from "../../components/CapaViewModal";
import { EditCapaModal } from "../../components/EditCapaModal";
import { CreateCapaModal } from "../../components/CreateCapaModal";
type EvidenceFile = {
    fileName: string;
    originalName?: string;
    url: string;
    mimeType?: string;
    uploadedAt?: string;
};
type SafetyAction = {
    id: string;
    code: string;
    title: string;
    description?: string;
    topic?: string;
    sourceType?: string;
    sourceCode?: string;
    problemType?: string;
    departmentCode: string;
    locationId?: string;
    area?: string;
    occurLocation?: string;
    priority: "low" | "medium" | "high" | "critical" | string;
    status: string;
    ownerName?: string;
    dueDate?: string;
    evidenceNotes?: string;
    evidenceFiles?: EvidenceFile[];
    verificationNote?: string;
    createdByName?: string;
    createdAt?: string;
    updatedAt?: string;
    verifiedAt?: string;
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
    "draft",
    "pending_ehs",
    "open",
    "in_progress",
    "done_by_owner",
    "closed"
];
const STATUS_LABEL: Record<string, string> = {
    all: "Tất cả",
    assigned: "Đã giao",
    blocked: "Đang vướng",
    closed: "Hoàn thành",
    done_by_owner: "Chờ nghiệm thu",
    draft: "Nháp — chờ QĐ duyệt",
    in_progress: "Đang xử lý",
    open: "Đang mở",
    pending_ehs: "Chờ EHS duyệt",
    rejected: "Bị từ chối",
    reopened: "Mở lại",
    verified: "Đã xác minh"
};
const EHS_APPROVE_ROLES = new Set(["admin", "ehs"]);
const QD_APPROVE_ROLES = new Set(["admin", "ehs", "leader", "safety_officer"]);
const PRIORITY_LABEL: Record<string, string> = {
    critical: "🔴 Khẩn",
    high: "🟠 Cao",
    low: "🟢 Thấp",
    medium: "🟡 TB"
};
const SOURCE_LABEL: Record<string, string> = {
    manual:     "Thủ công",
    warning:    "Cảnh báo nóng",
    incident:   "Sự cố",
    iplan:      "Kế hoạch KT",
    inspection: "Kế hoạch KT",
    audit:      "Audit",
    pccc:       "PCCC",
    kyt:        "KYT",
};
const srcLabel = (s: string, tFn: any) => tFn(SOURCE_LABEL[s] ?? s);
const CAPA_TOPICS = [
    { value: "hoa_chat",   label: "🧪 Hóa chất — an toàn sử dụng & bảo quản" },
    { value: "dien",       label: "⚡ An toàn điện" },
    { value: "may_moc",    label: "⚙️ An toàn máy móc & thiết bị cơ khí" },
    { value: "tren_cao",   label: "🪜 Làm việc trên cao / xe nâng" },
    { value: "pccc",       label: "🔥 Phòng cháy chữa cháy (PCCC)" },
    { value: "ppe",        label: "🦺 PPE / Trang bị bảo hộ lao động" },
    { value: "ergonomics", label: "🪑 Ergonomics / Tư thế lao động" },
    { value: "ve_sinh",    label: "🌿 Vệ sinh môi trường lao động" },
    { value: "6s",         label: "🏭 6S (Sàng lọc, Sắp xếp, Sạch sẽ…)" },
    { value: "khac",       label: "✏️ Khác — tự nhập" },
];
const PROBLEM_TYPE_OPTIONS: { value: string; label: string }[] = [
    { value: "MACH",    label: "⚙️ Máy móc & Thiết bị" },
    { value: "ELEC",    label: "⚡ An toàn điện" },
    { value: "CHEM",    label: "🧪 Hóa chất nguy hiểm" },
    { value: "HEIGHT",  label: "🪜 Làm việc trên cao" },
    { value: "VEHICLE", label: "🚜 Xe nâng / Phương tiện" },
    { value: "PPE",     label: "🦺 BHLD / Bảo hộ lao động" },
    { value: "BEHAV",   label: "🙅 Hành vi không an toàn" },
    { value: "NEAR",    label: "⚠️ Tình huống cận nguy" },
    { value: "FIRE",    label: "🔥 PCCC & Cháy nổ" },
    { value: "ENV",     label: "🌡️ Môi trường làm việc" },
    { value: "6S",      label: "🧹 6S / Vệ sinh công nghiệp" },
    { value: "ENRG",    label: "💡 Năng lượng / Tiết kiệm" },
    { value: "ERGO",    label: "🧘 Ergonomic / Tư thế" },
];
const DEFAULT_FORM = {
    departmentCode: "EHS",
    description: "",
    dueDate: addDaysDate(7),
    locationId: "",
    ownerName: "",
    priority: "medium",
    status: "open",
    title: "",
    topic: "",
    topicCustom: ""
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
    const { lang, setLang, t } = useHubLanguage();
    const [actions, setActions] = useState<SafetyAction[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<unknown>(null);
    const [currentUserRole, setCurrentUserRole] = useState<string>("viewer");
    const [currentUser, setCurrentUser] = useState<{ id?: string; username: string; displayName: string; departmentId: string; role: string } | null>(null);
    const [statusFilter, setStatusFilter] = useState("all");
    const [sourceFilter, setSourceFilter] = useState("all");
    const [overdueOnly, setOverdueOnly] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [evidenceTarget, setEvidenceTarget] = useState<SafetyAction | null>(null);
    const [verifyTarget, setVerifyTarget] = useState<SafetyAction | null>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ ...DEFAULT_FORM });
    const [note, setNote] = useState("");
    const [operationError, setOperationError] = useState("");
    const [operationSuccess, setOperationSuccess] = useState("");
    const [fileTarget, setFileTarget] = useState<SafetyAction | null>(null);
    const [lightboxUrl, setLightboxUrl] = useState("");
    const [viewId, setViewId] = useState<string | null>(null);
    const [editAction, setEditAction] = useState<any | null>(null);
    const [search, setSearch] = useState("");
    const [deptFilter, setDeptFilter] = useState("all");
    const [dateFilter, setDateFilter] = useState("all");
    const [customMonth, setCustomMonth] = useState(""); // "YYYY-MM"
    const [topicFilter, setTopicFilter] = useState("all");
    const [problemTypeFilter, setProblemTypeFilter] = useState("all");
    const [locationFilter, setLocationFilter] = useState("all");
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15;
    const [chartFilterOpen, setChartFilterOpen] = useState(false);
    const [hoveredCard, setHoveredCard] = useState<string|null>(null);
    const [sortCol, setSortCol] = useState<string>("createdAt");
    const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
    const [chartFMonth, setChartFMonth] = useState("all");
    const [chartFCustomMonth, setChartFCustomMonth] = useState("");
    const [chartFDept, setChartFDept] = useState("all");
    const [chartFDivision, setChartFDivision] = useState("all");
    const [chartFSource, setChartFSource] = useState("all");
    const [activeTab, setActiveTab] = useState<'list'|'charts'>('list');
    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [actionRows, departmentRows, locationRows, meData] = await Promise.all([
                apiFetchArray<SafetyAction>("/api/actions"),
                apiFetchArray<Department>("/api/safety/departments"),
                apiFetchArray<Location>("/api/locations"),
                apiFetch<{ role?: string }>("/api/auth/me").catch(() => ({ role: "viewer" }))
            ]);
            setActions(actionRows);
            setDepartments(departmentRows);
            setLocations(locationRows);
            const userData = (meData as any)?.data?.user;
            const role = userData?.role || (meData as any)?.role || "viewer";
            setCurrentUserRole(role);
            if (userData) {
                setCurrentUser({
                    id: userData.id,
                    username: userData.username || "",
                    displayName: userData.displayName || userData.username || "",
                    departmentId: userData.departmentId || "",
                    role: userData.role || "viewer",
                });
            }
            if (departmentRows[0]?.code) {
                const defaultStatus = role === "safety_officer" ? "draft" : "open";
                setForm((current) => ({ ...current, departmentCode: current.departmentCode || departmentRows[0].code, status: current.status === "open" ? defaultStatus : current.status }));
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
    const filteredActions = useMemo(() => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth(); // 0-indexed
        return actions.filter((item) => {
            const matchStatus      = statusFilter === "all"
                || (statusFilter === "pending" ? (item.status === "draft" || item.status === "pending_ehs")
                : statusFilter === "closed"   ? (item.status === "closed"  || item.status === "verified")
                : item.status === statusFilter);
            const matchDept        = deptFilter === "all" || item.departmentCode === deptFilter;
            const matchSource      = sourceFilter === "all" || (item.sourceType || "manual") === sourceFilter;
            const matchTopic       = topicFilter === "all" || (item.topic || "") === topicFilter;
            const matchProblemType = problemTypeFilter === "all" || (item.problemType || "") === problemTypeFilter;
            const itemLoc = item.area || item.occurLocation || "";
            const matchLocation = locationFilter === "all" || itemLoc === locationFilter;
            const today2 = new Date().toISOString().slice(0,10);
            const matchOverdue = !overdueOnly || (!!item.dueDate && !["closed","verified","draft","pending_ehs"].includes(item.status) && item.dueDate < today2);
            const q           = search.toLowerCase();
            const matchSearch = !q || item.title.toLowerCase().includes(q) || item.code.toLowerCase().includes(q) || (item.ownerName || "").toLowerCase().includes(q);
            let matchDate = true;
            const dateStr = item.dueDate || item.createdAt || "";
            if (dateFilter !== "all" && dateStr) {
                const d = new Date(dateStr);
                if (dateFilter === "thisMonth") matchDate = d.getFullYear()===y && d.getMonth()===m;
                else if (dateFilter === "last3") matchDate = d >= new Date(y, m-2, 1);
                else if (dateFilter === "last6") matchDate = d >= new Date(y, m-5, 1);
                else if (dateFilter === "thisYear") matchDate = d.getFullYear()===y;
                else if (dateFilter === "custom" && customMonth) {
                    const [cy, cm] = customMonth.split("-").map(Number);
                    matchDate = d.getFullYear()===cy && d.getMonth()===(cm-1);
                }
            }
            return matchStatus && matchDept && matchSource && matchTopic && matchProblemType && matchLocation && matchOverdue && matchSearch && matchDate;
        }).sort((a, b) => {
            const PRIO_ORDER: Record<string,number> = { critical:4, high:3, medium:2, low:1 };
            const STATUS_ORDER: Record<string,number> = { draft:1, pending_ehs:2, open:3, assigned:4, in_progress:5, blocked:6, reopened:7, done_by_owner:8, verified:9, closed:10 };
            let va: string|number = "", vb: string|number = "";
            if (sortCol === "priority") { va = PRIO_ORDER[a.priority]??0; vb = PRIO_ORDER[b.priority]??0; }
            else if (sortCol === "status") { va = STATUS_ORDER[a.status]??0; vb = STATUS_ORDER[b.status]??0; }
            else if (sortCol === "dueDate") { va = a.dueDate||""; vb = b.dueDate||""; }
            else if (sortCol === "ownerName") { va = (a.ownerName||"").toLowerCase(); vb = (b.ownerName||"").toLowerCase(); }
            else if (sortCol === "code") { va = a.code||""; vb = b.code||""; }
            else if (sortCol === "departmentCode") { va = a.departmentCode||""; vb = b.departmentCode||""; }
            else { va = a.createdAt||""; vb = b.createdAt||""; }
            if (va < vb) return sortDir === "asc" ? -1 : 1;
            if (va > vb) return sortDir === "asc" ? 1 : -1;
            return 0;
        });
    }, [actions, statusFilter, deptFilter, sourceFilter, topicFilter, problemTypeFilter, locationFilter, overdueOnly, search, dateFilter, customMonth, sortCol, sortDir]);
    const stats = useMemo(() => {
        const open = actions.filter((item) => ["open", "assigned", "in_progress", "reopened", "blocked"].includes(item.status)).length;
        const waiting = actions.filter((item) => item.status === "done_by_owner").length;
        const pending = actions.filter((item) => item.status === "draft" || item.status === "pending_ehs").length;
        const today = new Date().toISOString().slice(0, 10);
        const overdue = actions.filter((item) => item.dueDate && !["closed","verified","draft","pending_ehs"].includes(item.status) && item.dueDate < today).length;
        const closed = actions.filter((item) => item.status === "closed" || item.status === "verified").length;
        return { closed, open, overdue, waiting, pending, total: actions.length };
    }, [actions]);
    const deptBreakdown = useMemo(() => {
        const today = new Date().toISOString().slice(0,10);
        const groups: Record<string, (a: SafetyAction) => boolean> = {
            all:           () => true,
            pending:       a => a.status === "draft" || a.status === "pending_ehs",
            open:          a => ["open","assigned","in_progress","reopened","blocked"].includes(a.status),
            done_by_owner: a => a.status === "done_by_owner",
            closed:        a => a.status === "closed" || a.status === "verified",
        };
        const result: Record<string, {code:string; name:string; count:number}[]> = {};
        for (const [key, pred] of Object.entries(groups)) {
            const counts: Record<string, number> = {};
            actions.filter(pred).forEach(a => { counts[a.departmentCode] = (counts[a.departmentCode]||0)+1; });
            result[key] = Object.entries(counts)
                .map(([code, count]) => ({ code, name: departments.find(d=>d.code===code)?.name || code, count }))
                .sort((a,b) => b.count - a.count)
                .slice(0, 8);
        }
        void today;
        return result;
    }, [actions, departments]);
    // Pre-status filtered: all filters except status/overdue — used for chip counts
    const preStatusFiltered = useMemo(() => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        return actions.filter((item) => {
            const matchDept        = deptFilter === "all" || item.departmentCode === deptFilter;
            const matchSource      = sourceFilter === "all" || (item.sourceType || "manual") === sourceFilter;
            const matchProblemType = problemTypeFilter === "all" || (item.problemType || "") === problemTypeFilter;
            const matchTopic       = topicFilter === "all" || (item.topic || "") === topicFilter;
            const q           = search.toLowerCase();
            const matchSearch = !q || item.title.toLowerCase().includes(q) || item.code.toLowerCase().includes(q) || (item.ownerName || "").toLowerCase().includes(q);
            let matchDate = true;
            const dateStr = item.dueDate || item.createdAt || "";
            if (dateFilter !== "all" && dateStr) {
                const d = new Date(dateStr);
                if (dateFilter === "thisMonth") matchDate = d.getFullYear()===y && d.getMonth()===m;
                else if (dateFilter === "last3") matchDate = d >= new Date(y, m-2, 1);
                else if (dateFilter === "last6") matchDate = d >= new Date(y, m-5, 1);
                else if (dateFilter === "thisYear") matchDate = d.getFullYear()===y;
                else if (dateFilter === "custom" && customMonth) {
                    const [cy, cm] = customMonth.split("-").map(Number);
                    matchDate = d.getFullYear()===cy && d.getMonth()===(cm-1);
                }
            }
            return matchDept && matchSource && matchProblemType && matchTopic && matchSearch && matchDate;
        });
    }, [actions, deptFilter, sourceFilter, problemTypeFilter, topicFilter, search, dateFilter, customMonth]);
    const chipCounts = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10);
        const src = preStatusFiltered;
        return {
            all:            src.length,
            pending:        src.filter(a => a.status === "draft" || a.status === "pending_ehs").length,
            open:           src.filter(a => a.status === "open").length,
            in_progress:    src.filter(a => a.status === "in_progress").length,
            done_by_owner:  src.filter(a => a.status === "done_by_owner").length,
            closed:         src.filter(a => a.status === "closed" || a.status === "verified").length,
            overdue:        src.filter(a => a.dueDate && !["closed","verified","draft","pending_ehs"].includes(a.status) && a.dueDate < today).length,
        };
    }, [preStatusFiltered]);
    const chartFilteredActions = useMemo(() => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const divDepts = chartFDivision !== "all"
            ? departments.filter(d => d.divisionCode === chartFDivision).map(d => d.code)
            : null;
        return actions.filter(a => {
            if (chartFDept !== "all" && a.departmentCode !== chartFDept) return false;
            if (divDepts && !divDepts.includes(a.departmentCode)) return false;
            if (chartFSource !== "all" && (a.sourceType || "manual") !== chartFSource) return false;
            if (chartFMonth !== "all") {
                const dateStr = a.createdAt || "";
                if (!dateStr) return false;
                const d = new Date(dateStr);
                if (chartFMonth === "thisMonth" && !(d.getFullYear()===y && d.getMonth()===m)) return false;
                else if (chartFMonth === "last3" && d < new Date(y, m-2, 1)) return false;
                else if (chartFMonth === "last6" && d < new Date(y, m-5, 1)) return false;
                else if (chartFMonth === "thisYear" && d.getFullYear()!==y) return false;
                else if (chartFMonth === "custom" && chartFCustomMonth) {
                    const [cy, cm] = chartFCustomMonth.split("-").map(Number);
                    if (!(d.getFullYear()===cy && d.getMonth()===(cm-1))) return false;
                }
            }
            return true;
        });
    }, [actions, departments, chartFDept, chartFDivision, chartFSource, chartFMonth, chartFCustomMonth]);
    const chartPie = useMemo(() => {
        const today = new Date().toISOString().slice(0,10);
        const src = chartFilteredActions;
        const hoanThanh = src.filter(a => a.status === "closed" || a.status === "verified").length;
        const dangXuLy  = src.filter(a => ["open","assigned","in_progress","reopened","blocked","done_by_owner"].includes(a.status)).length;
        const quaHan    = src.filter(a => a.dueDate && a.status !== "closed" && a.status !== "verified" && a.dueDate < today).length;
        return [
            { name:"Hoàn thành", value:hoanThanh, color:"#16a34a" },
            { name:"Đang xử lý", value:dangXuLy,  color:"#2563eb" },
            { name:"Quá hạn",    value:quaHan,    color:"#dc2626" },
        ];
    }, [chartFilteredActions]);
    const chartBar = useMemo(() => [
        { name:"Khẩn", count:actions.filter(a=>a.priority==="critical").length, fill:"#dc2626" },
        { name:"Cao",  count:actions.filter(a=>a.priority==="high").length,     fill:"#f97316" },
        { name:"TB",   count:actions.filter(a=>a.priority==="medium").length,   fill:"#eab308" },
        { name:"Thấp", count:actions.filter(a=>a.priority==="low").length,      fill:"#22c55e" },
    ], [actions]);
    const chartTrend = useMemo(() => {
        const months: { month:string; open:number; closed:number }[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
            const label = `T${d.getMonth()+1}`;
            const open   = actions.filter(a => (a.createdAt||"").startsWith(key)).length;
            const closed = actions.filter(a => (a.status==="closed"||a.status==="verified") && (a.updatedAt||"").startsWith(key)).length;
            months.push({ month:label, open, closed });
        }
        return months;
    }, [actions]);
    const chartProblemType = useMemo(() => {
        const src = chartFilteredActions;
        const total = src.length || 1;
        return PROBLEM_TYPE_OPTIONS.map(pt => {
            const count = src.filter(a => (a.problemType || "") === pt.value).length;
            return { ...pt, count, pct: Math.round((count / total) * 100) };
        }).filter(pt => pt.count > 0).sort((a, b) => b.count - a.count);
    }, [chartFilteredActions]);

    const chartDept = useMemo(() => {
        const today = new Date().toISOString().slice(0,10);
        const src = chartFilteredActions;
        const deptMap = new Map<string,{open:number;inProgress:number;waiting:number;closed:number;overdue:number}>();
        src.forEach(a => {
            const d = a.departmentCode || "—";
            if (!deptMap.has(d)) deptMap.set(d,{open:0,inProgress:0,waiting:0,closed:0,overdue:0});
            const e = deptMap.get(d)!;
            const s = a.status;
            const isOver = !!a.dueDate && !["closed","verified","draft","pending_ehs"].includes(s) && a.dueDate < today;
            if (s === "closed" || s === "verified") e.closed++;
            else if (s === "done_by_owner") e.waiting++;
            else if (s === "in_progress") e.inProgress++;
            else if (["open","assigned","reopened","blocked"].includes(s)) e.open++;
            if (isOver) e.overdue++;
        });
        return Array.from(deptMap.entries())
            .map(([dept, v]) => ({ dept, ...v, total: v.open + v.inProgress + v.waiting + v.closed }))
            .filter(r => r.total > 0)
            .sort((a,b) => b.total - a.total)
            .slice(0, 12);
    }, [chartFilteredActions]);

    const chartClosureRate = useMemo(() => {
        const total = actions.length;
        if (!total) return { rate: 0, avgDays: null };
        const closed = actions.filter(a => a.status === "closed" || a.status === "verified");
        const rate = Math.round((closed.length / total) * 100);
        const withTime = closed.filter(a => a.createdAt && (a.updatedAt || a.verifiedAt));
        const avgMs = withTime.length > 0
            ? withTime.reduce((sum, a) => {
                const end = new Date(a.verifiedAt || a.updatedAt || "").getTime();
                const start = new Date(a.createdAt || "").getTime();
                return sum + (end - start);
            }, 0) / withTime.length
            : null;
        const avgDays = avgMs !== null ? Math.round(avgMs / 86400000) : null;
        return { rate, avgDays };
    }, [actions]);

    async function handleCreate(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);
        setOperationError("");
        setOperationSuccess("");
        try {
            const resolvedTopic = form.topic === "khac" ? (form.topicCustom.trim() || "Khác") : form.topic;
            const created = await postJson<SafetyAction>("/api/actions", { ...form, topic: resolvedTopic });
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
    if (error)
        return <SafetyI18nRender>{<ErrorPanel error={error}/>}</SafetyI18nRender>;
    return <SafetyI18nRender>{(<div className="ehsp-page">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="ehsp-header">
        <div className="ehsp-header-left">
          <div className="ehsp-header-icon">
            <ShieldCheck style={{ width:22, height:22, color:"#fff" }} />
          </div>
          <div style={{ minWidth:0 }}>
            <div className="ehsp-header-title">Quản lý CAPA</div>
            <div className="ehsp-header-sub">
              Corrective Action / Preventive Action — An toàn &amp; 6S
            </div>
          </div>
        </div>
        <div className="ehsp-header-right">
          <button type="button" onClick={() => setShowExportModal(true)} className="ehsp-btn-outline"
            title="Xuất báo cáo CAPA">
            <FileDown style={{ width:14, height:14 }}/> Xuất báo cáo
          </button>
          <button type="button" onClick={() => setCreateOpen(true)} className="ehsp-btn-capa">
            <Plus style={{ width:14, height:14 }}/> Tạo CAPA
          </button>
          
          <div className="ehsp-lang-switcher" style={{ marginLeft: "12px", display: "flex", gap: "4px" }}>
            <button 
              onClick={() => setLang("vi")}
              style={{ padding: "4px 8px", background: lang === "vi" ? "#3b82f6" : "#f1f5f9", color: lang === "vi" ? "#fff" : "#64748b", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}
            >🇻🇳 VI</button>
            <button 
              onClick={() => setLang("ja")}
              style={{ padding: "4px 8px", background: lang === "ja" ? "#3b82f6" : "#f1f5f9", color: lang === "ja" ? "#fff" : "#64748b", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}
            >🇯🇵 JA</button>
          </div>
        </div>
      </div>

      {/* ── CAPA Ecosystem Nav ─────────────────────────────────────────── */}
      <SafetyCapaNav pendingCount={stats.pending} />

      <div className="ehsp-body">

      {/* ── 5 Stat cards ─────────────────────────────────────────────── */}
      <div className="ehsp-stats-grid ehsp-stats-grid--five">
        {([
          { label:"Tổng CAPA",      value:stats.total,   sub:"đang theo dõi",     accent:"#475569", Icon:ClipboardCheck, filterKey:"all",           pct:100 },
          { label:"Chờ phê duyệt", value:stats.pending, sub:"nháp / chờ EHS",    accent:"#ea580c", Icon:Clock,          filterKey:"pending",
            pct:stats.total?Math.round(stats.pending/stats.total*100):0 },
          { label:"Đang mở",       value:stats.open,    sub:"cần xử lý ngay",    accent:"#2563eb", Icon:Workflow,       filterKey:"open",
            pct:stats.total?Math.round(stats.open/stats.total*100):0 },
          { label:"Chờ nghiệm thu",value:stats.waiting, sub:"đã nộp bằng chứng", accent:"#d97706", Icon:Clock,          filterKey:"done_by_owner",
            pct:stats.total?Math.round(stats.waiting/stats.total*100):0 },
          { label:"Đã đóng",       value:stats.closed,  sub:"hoàn thành",        accent:"#16a34a", Icon:CheckCircle2,   filterKey:"closed",
            pct:stats.total?Math.round(stats.closed/stats.total*100):0 },
        ] as const).map((item) => {
          const isActive  = statusFilter === item.filterKey && !overdueOnly;
          const isHovered = hoveredCard === item.filterKey;
          const depts     = deptBreakdown[item.filterKey] || [];
          const maxCount  = depts[0]?.count || 1;
          return (
            <div
              key={item.label}
              className="ehsp-stat-card ehsp-stat-card--metric"
              data-active={isActive ? "true" : "false"}
              onClick={() => { setStatusFilter(item.filterKey); setOverdueOnly(false); setPage(1); }}
              onMouseEnter={() => setHoveredCard(item.filterKey)}
              onMouseLeave={() => setHoveredCard(null)}
              style={{ ["--ehsp-accent" as any]: item.accent }}
            >
              {isActive && (<div className="ehsp-stat-card-accent" />)}
              <div className="ehsp-stat-card-body">
                <div className="ehsp-stat-card-head">
                  <item.Icon style={{ width:14, height:14, color:item.accent, flexShrink:0 }}/>
                  <span className="ehsp-stat-card-kicker">{item.label}</span>
                </div>
                <div className="ehsp-stat-card-value">{item.value}</div>
                <div className="ehsp-stat-card-sub">{item.sub}</div>
                <div className="ehsp-stat-card-meter">
                  <div className="ehsp-stat-card-meter-track">
                    <div style={{ width:`${item.pct}%`, height:"100%", background:"var(--ehsp-accent)", borderRadius:99, transition:"width .6s cubic-bezier(.2,.8,.4,1)" }}/>
                  </div>
                  <span style={{ fontSize:10, fontWeight:700, color:item.accent, opacity:0.62, flexShrink:0, minWidth:30, textAlign:"right" }}>{item.pct}%</span>
                </div>
              </div>

              {/* Tooltip */}
              {isHovered && depts.length > 0 && (
                <div className="ehsp-stat-card-tooltip">
                  <div className="ehsp-stat-card-tooltip-title">
                    Theo bộ phận
                  </div>
                  {depts.map(d => (
                    <div key={d.code} className="ehsp-stat-card-tooltip-row">
                      <span className="ehsp-stat-card-tooltip-code">{d.code}</span>
                      <div className="ehsp-stat-card-tooltip-track">
                        <div style={{ width:`${Math.round(d.count/maxCount*100)}%`, height:"100%", background:item.accent, borderRadius:99 }}/>
                      </div>
                      <span className="ehsp-stat-card-tooltip-count">{d.count}</span>
                    </div>
                  ))}
                  <div className="ehsp-stat-card-tooltip-caret">
                    <div className="ehsp-stat-card-tooltip-caret-inner" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Toolbar: Segmented tabs + Filters + Actions ─────────────── */}
      <div className="ehsp-toolbar">
        {/* Segmented control */}
        <div className="ehsp-seg" role="tablist">
          {([
            { key:'list'   as const, label:'Danh sách' },
            { key:'charts' as const, label:'Biểu đồ'   },
          ]).map(tab => (
            <button key={tab.key} type="button" role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`ehsp-seg-btn${activeTab === tab.key ? " ehsp-seg-btn--active" : ""}`}>
              {tab.key === 'list'
                ? <ListChecks style={{width:15,height:15}}/>
                : <BarChart3  style={{width:15,height:15}}/>}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters — list view only */}
        {activeTab === 'list' && (
          <div className="ehsp-toolbar-row">
            <div className="ehsp-search-wrap">
              <Search className="ehsp-search-icon" />
              <input className="ehsp-search-input" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder={t("Tìm mã, tên, người phụ trách...")}
              />
            </div>
            <select className="ehsp-select ehsp-select--dept" value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1); }}>
              <option value="all">🏭 {t("Tất cả BP")}</option>
              {departments.map(d => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
            </select>
            <select className="ehsp-select ehsp-select--date" value={dateFilter} onChange={e => { setDateFilter(e.target.value); setPage(1); }}>
              <option value="all">📅 Thời gian</option>
              <option value="thisMonth">Tháng này</option>
              <option value="last3">3 tháng gần đây</option>
              <option value="last6">6 tháng gần đây</option>
              <option value="thisYear">Năm nay</option>
              <option value="custom">Chọn tháng…</option>
            </select>
            {dateFilter === "custom" && (
              <input className="ehsp-month-input" type="month" value={customMonth} max={new Date().toISOString().slice(0,7)}
                onChange={e => { setCustomMonth(e.target.value); setPage(1); }}
              />
            )}
            <select className="ehsp-select ehsp-select--source" value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }}>
              <option value="all">🔍 Nguồn</option>
              {Array.from(new Set(actions.map(a => a.sourceType || "manual"))).sort().map(src => (
                <option key={src} value={src}>{srcLabel(src, t)}</option>
              ))}
            </select>
            <select className={`ehsp-select ehsp-select--problem${problemTypeFilter !== "all" ? " ehsp-select--active" : ""}`} value={problemTypeFilter} onChange={e => { setProblemTypeFilter(e.target.value); setPage(1); }}>
              <option value="all">🏷️ Loại vấn đề</option>
              {PROBLEM_TYPE_OPTIONS.map(pt => <option key={pt.value} value={pt.value}>{t(pt.label)}</option>)}
            </select>
            {(() => {
              const locOpts = Array.from(new Set(
                actions.map(a => a.area || a.occurLocation || "").filter(Boolean)
              )).sort();
              if (locOpts.length === 0) return null;
              return (
                <select className={`ehsp-select ehsp-select--location${locationFilter !== "all" ? " ehsp-select--location-active" : ""}`} value={locationFilter} onChange={e => { setLocationFilter(e.target.value); setPage(1); }}>
                  <option value="all">📍 Địa điểm</option>
                  {locOpts.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>
              );
            })()}
            {(deptFilter!=="all"||statusFilter!=="all"||sourceFilter!=="all"||problemTypeFilter!=="all"||locationFilter!=="all"||overdueOnly||dateFilter!=="all"||search!=="") && (
              <button type="button"
                onClick={() => { setDeptFilter("all"); setStatusFilter("all"); setSourceFilter("all"); setTopicFilter("all"); setProblemTypeFilter("all"); setLocationFilter("all"); setOverdueOnly(false); setDateFilter("all"); setCustomMonth(""); setSearch(""); setPage(1); }}
                className="ehsp-reset-btn">
                ✕ Xóa bộ lọc
              </button>
            )}
          </div>
        )}

      </div>

      {/* ── Charts view ──────────────────────────────────────────────── */}
      {activeTab === 'charts' && (
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.5fr]">
        {/* V2 Minimal — by status */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm" style={{ position:"relative" }}>
          {(() => {
            const total = chartPie.reduce((s, e) => s + e.value, 0) || 1;
            const chartActiveFilters = [chartFMonth, chartFDept, chartFDivision, chartFSource].filter(v => v !== "all").length + (chartFMonth === "custom" && chartFCustomMonth ? 0 : 0);
            const uniqueDivisions = [...new Set(departments.map(d => d.divisionCode).filter(Boolean))];
            const uniqueSources = [...new Set(actions.map(a => a.sourceType || "manual"))];
            return (
              <>
                {/* Header */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 16px 0" }}>
                  <div style={{ fontSize:13, fontWeight:900, color:"#1e40af", letterSpacing:"0.01em" }}>CAPA Status</div>
                  {/* Filter icon button */}
                  <button
                    onClick={() => setChartFilterOpen(o => !o)}
                    title="Bộ lọc biểu đồ"
                    style={{
                      display:"flex", alignItems:"center", gap:5,
                      background: chartFilterOpen ? "#2563eb" : chartActiveFilters > 0 ? "#eff6ff" : "#f8fafc",
                      border: chartFilterOpen ? "1.5px solid #2563eb" : chartActiveFilters > 0 ? "1.5px solid #93c5fd" : "1.5px solid #e2e8f0",
                      borderRadius:8, padding:"4px 9px", cursor:"pointer",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                      <path d="M3 5h14M6 10h8M9 15h2" stroke={chartFilterOpen ? "#fff" : chartActiveFilters > 0 ? "#2563eb" : "#64748b"} strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <span style={{ fontSize:11, fontWeight:700, color: chartFilterOpen ? "#fff" : chartActiveFilters > 0 ? "#2563eb" : "#64748b" }}>
                      Lọc{chartActiveFilters > 0 ? ` (${chartActiveFilters})` : ""}
                    </span>
                  </button>
                </div>
                {/* Filter panel dropdown */}
                {chartFilterOpen && (
                  <div style={{
                    margin:"10px 16px 0",
                    background:"#f8fafc", border:"1px solid #e2e8f0",
                    borderRadius:10, padding:"12px 12px 10px",
                    display:"grid", gridTemplateColumns:"1fr 1fr", gap:8,
                  }}>
                    {/* Tháng */}
                    <div style={{ gridColumn: chartFMonth === "custom" ? "1/-1" : undefined }}>
                      <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", marginBottom:4 }}>THÁNG</div>
                      <select value={chartFMonth} onChange={e => { setChartFMonth(e.target.value); if (e.target.value !== "custom") setChartFCustomMonth(""); }}
                        style={{ width:"100%", fontSize:12, padding:"4px 6px", border:"1px solid #e2e8f0", borderRadius:6, background:"#fff", color:"#0f172a" }}>
                        <option value="all">Tất cả</option>
                        <option value="thisMonth">Tháng này</option>
                        <option value="last3">3 tháng gần</option>
                        <option value="last6">6 tháng gần</option>
                        <option value="thisYear">Năm nay</option>
                        <option value="custom">Tháng chỉ định...</option>
                      </select>
                      {chartFMonth === "custom" && (
                        <input
                          type="month"
                          value={chartFCustomMonth}
                          onChange={e => setChartFCustomMonth(e.target.value)}
                          style={{ width:"100%", marginTop:6, fontSize:12, padding:"4px 6px", border:"1.5px solid #93c5fd", borderRadius:6, background:"#eff6ff", color:"#1e40af", boxSizing:"border-box" }}
                        />
                      )}
                    </div>
                    {/* Bộ phận */}
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", marginBottom:4 }}>BỘ PHẬN</div>
                      <select value={chartFDept} onChange={e => setChartFDept(e.target.value)}
                        style={{ width:"100%", fontSize:12, padding:"4px 6px", border:"1px solid #e2e8f0", borderRadius:6, background:"#fff", color:"#0f172a" }}>
                        <option value="all">Tất cả</option>
                        {departments.map(d => <option key={d.code} value={d.code}>{d.name || d.code}</option>)}
                      </select>
                    </div>
                    {/* Khối */}
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", marginBottom:4 }}>KHỐI</div>
                      <select value={chartFDivision} onChange={e => setChartFDivision(e.target.value)}
                        style={{ width:"100%", fontSize:12, padding:"4px 6px", border:"1px solid #e2e8f0", borderRadius:6, background:"#fff", color:"#0f172a" }}>
                        <option value="all">Tất cả</option>
                        {uniqueDivisions.map(div => <option key={div} value={div}>{div}</option>)}
                      </select>
                    </div>
                    {/* Nguồn */}
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", marginBottom:4 }}>NGUỒN</div>
                      <select value={chartFSource} onChange={e => setChartFSource(e.target.value)}
                        style={{ width:"100%", fontSize:12, padding:"4px 6px", border:"1px solid #e2e8f0", borderRadius:6, background:"#fff", color:"#0f172a" }}>
                        <option value="all">Tất cả</option>
                        {uniqueSources.map(s => <option key={s} value={s}>{srcLabel(s, t)}</option>)}
                      </select>
                    </div>
                    {chartActiveFilters > 0 && (
                      <div style={{ gridColumn:"1/-1", textAlign:"right" }}>
                        <button onClick={() => { setChartFMonth("all"); setChartFCustomMonth(""); setChartFDept("all"); setChartFDivision("all"); setChartFSource("all"); }}
                          style={{ fontSize:11, fontWeight:700, color:"#dc2626", background:"none", border:"none", cursor:"pointer", padding:0 }}>
                          ✕ Xoá bộ lọc
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ padding:"14px 16px 16px" }}>
                {/* Slim rows */}
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {chartPie.map((e, i) => {
                    const pct = Math.round((e.value / total) * 100);
                    return (
                      <div key={i}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                            <span style={{ width:8, height:8, borderRadius:"50%", background:e.color, flexShrink:0, display:"inline-block" }}/>
                            <span style={{ fontSize:12.5, fontWeight:600, color:"#334155" }}>{e.name}</span>
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ fontSize:12, fontWeight:700, color:e.color }}>{e.value}</span>
                            <span style={{ fontSize:11.5, fontWeight:700, color:e.color, minWidth:30, textAlign:"right" }}>{pct}%</span>
                          </div>
                        </div>
                        <div style={{ height:7, background:"#f1f5f9", borderRadius:99, overflow:"hidden" }}>
                          <div style={{
                            width:`${Math.max(pct, e.value > 0 ? 3 : 0)}%`,
                            height:"100%",
                            background:`linear-gradient(90deg, ${e.color}bb, ${e.color})`,
                            borderRadius:99, transition:"width 0.5s ease",
                          }}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Stacked legend bar */}
                <div style={{ marginTop:14, paddingTop:12, borderTop:"1px solid #f1f5f9" }}>
                  <div style={{ height:8, borderRadius:99, overflow:"hidden", display:"flex", gap:2 }}>
                    {chartPie.map((e, i) => {
                      const pct = Math.round((e.value / total) * 100);
                      return <div key={i} style={{ flex:pct, background:e.color, minWidth:e.value>0?4:0 }}/>;
                    })}
                  </div>
                  <div style={{ display:"flex", gap:12, marginTop:8, flexWrap:"wrap" }}>
                    {chartPie.map((e, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <span style={{ width:8, height:8, borderRadius:2, background:e.color, flexShrink:0, display:"inline-block" }}/>
                        <span style={{ fontSize:11, color:"#64748b" }}>{e.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                </div>{/* end padding wrapper */}
              </>
            );
          })()}
        </div>

        {/* Bar — by priority */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[13px] font-black text-slate-900">Theo ưu tiên</p>
          <p className="mb-3 text-[12px] text-slate-500">Số lượng theo cấp độ</p>
          <ResponsiveContainer width="100%" height={168}>
            <BarChart data={chartBar} barSize={28} margin={{ top:4, right:8, left:-20, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
              <XAxis dataKey="name" tick={{ fontSize:12, fontWeight:600, fill:"#64748b" }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize:12, fill:"#64748b" }} axisLine={false} tickLine={false} allowDecimals={false}/>
              <Tooltip formatter={(v:any) => [v, "Số CAPA"]}/>
              <Bar dataKey="count" radius={[5,5,0,0]}>
                {chartBar.map((e, i) => <Cell key={i} fill={e.fill}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Area — trend 6 tháng */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between mb-1">
            <div>
              <p className="text-[13px] font-black text-slate-900">Xu hướng 6 tháng</p>
              <p className="text-[12px] text-slate-500">Phát sinh vs đã đóng</p>
            </div>
            <div className="flex gap-3 text-[12px] font-semibold mt-0.5">
              <span className="text-blue-600">● Phát sinh</span>
              <span className="text-emerald-600">● Đã đóng</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={172}>
            <AreaChart data={chartTrend} margin={{ top:8, right:8, left:-20, bottom:0 }}>
              <defs>
                <linearGradient id="gO" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.55}/>
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.07}/>
                </linearGradient>
                <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#16a34a" stopOpacity={0.55}/>
                  <stop offset="95%" stopColor="#16a34a" stopOpacity={0.07}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
              <XAxis dataKey="month" tick={{ fontSize:12, fill:"#64748b" }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize:12, fill:"#64748b" }} axisLine={false} tickLine={false} allowDecimals={false}/>
              <Tooltip formatter={(v:any, n:any) => [v, n==="open"?"Phát sinh":"Đã đóng"]}/>
              <Area type="monotone" dataKey="open" name="open" stroke="#2563eb" strokeWidth={2}
                fill="url(#gO)" dot={{ r:3, fill:"#2563eb" }} activeDot={{ r:5 }}/>
              <Area type="monotone" dataKey="closed" name="closed" stroke="#16a34a" strokeWidth={2}
                fill="url(#gC)" dot={{ r:3, fill:"#16a34a" }} activeDot={{ r:5 }}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Phân bổ + 3 KPI cards ────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:12, alignItems:"stretch" }}>

        {/* LEFT: Phân bổ theo Loại vấn đề */}
        <div style={{ borderRadius:12, border:"1px solid #e2e8f0", background:"#fff", overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ padding:"14px 16px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontSize:13.5, fontWeight:700, color:"#0f172a" }}>Phân bổ theo Loại vấn đề</div>
              <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>
                {chartFilteredActions.length} CAPA · sắp theo số lượng
              </div>
            </div>
            <div style={{ fontSize:11.5, fontWeight:700, color:"#475569", background:"#f1f5f9", borderRadius:20, padding:"3px 10px" }}>
              {chartProblemType.length} loại
            </div>
          </div>
          <div style={{ padding:"14px 16px" }}>
          {chartProblemType.length > 0 ? (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {chartProblemType.map((pt, i) => {
                const barColors = ["#6366f1","#3b82f6","#0ea5e9","#8b5cf6","#ec4899","#f59e0b"];
                const barColor = barColors[i % barColors.length];
                return (
                  <div key={pt.value} style={{ display:"flex", alignItems:"center", gap:10 }}>
                    {/* Icon */}
                    <div style={{
                      width:28, height:28, borderRadius:7, flexShrink:0,
                      background:`${barColor}18`,
                      display:"flex", alignItems:"center", justifyContent:"center", fontSize:14,
                    }}>{pt.label.split(" ")[0]}</div>
                    {/* Name */}
                    <div style={{ width:145, flexShrink:0 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:"#1e293b",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {pt.label.slice(pt.label.indexOf(" ")+1)}
                      </div>
                    </div>
                    {/* Bar */}
                    <div style={{ flex:1, height:13, background:"#e2e8f0", borderRadius:99, overflow:"hidden", minWidth:40 }}>
                      <div style={{
                        width:`${Math.max(pt.pct, pt.count > 0 ? 4 : 0)}%`, height:"100%",
                        background:barColor,
                        borderRadius:99, transition:"width 0.6s cubic-bezier(.2,.8,.4,1)",
                      }}/>
                    </div>
                    {/* Count + % */}
                    <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0, minWidth:56, justifyContent:"flex-end" }}>
                      <span style={{ fontSize:15, fontWeight:800, color:"#0f172a" }}>{pt.count}</span>
                      <span style={{ fontSize:11, fontWeight:700, color:barColor,
                        background:`${barColor}18`,
                        borderRadius:99, padding:"2px 7px" }}>
                        {pt.pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding:"28px 0", textAlign:"center" }}>
              <div style={{ fontSize:28, marginBottom:8 }}>🏷️</div>
              <div style={{ fontSize:13, fontWeight:700, color:"#94a3b8" }}>Chưa có dữ liệu loại vấn đề</div>
            </div>
          )}
          </div>
        </div>

        {/* RIGHT: 3 KPI cards — redesigned */}
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>

          {/* 1. Tỷ lệ hoàn thành */}
          {(() => {
            const rate = chartClosureRate.rate;
            const clr = rate >= 80 ? { main:"#16a34a", border:"#bbf7d0", text:"#14532d" }
              : rate >= 50 ? { main:"#d97706", border:"#fde68a", text:"#78350f" }
              : { main:"#dc2626", border:"#fca5a5", text:"#991b1b" };
            const r = 26; const circ = 2 * Math.PI * r;
            return (
              <div style={{ flex:1, borderRadius:12, border:`1px solid ${clr.border}`,
                background:"#fff",
                padding:"14px 16px", display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ position:"relative", flexShrink:0 }}>
                  <svg width="62" height="62" viewBox="0 0 64 64" style={{ transform:"rotate(-90deg)" }}>
                    <circle cx="32" cy="32" r={r} fill="none" stroke="#e2e8f0" strokeWidth="7"/>
                    <circle cx="32" cy="32" r={r} fill="none"
                      stroke={clr.main} strokeWidth="7"
                      strokeDasharray={`${(rate/100)*circ} ${circ}`}
                      strokeLinecap="round"/>
                  </svg>
                  <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <span style={{ fontSize:12, fontWeight:800, color:clr.main }}>{rate}%</span>
                  </div>
                </div>
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#64748b", marginBottom:3 }}>Tỷ lệ hoàn thành</div>
                  <div style={{ fontSize:26, fontWeight:800, color:"#0f172a", lineHeight:1 }}>
                    {stats.closed}<span style={{ fontSize:13, color:"#94a3b8", fontWeight:600 }}>/{stats.total}</span>
                  </div>
                  <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>CAPA đã đóng / tổng</div>
                  <div style={{ marginTop:6, height:5, background:"#e2e8f0", borderRadius:99, overflow:"hidden" }}>
                    <div style={{ width:`${rate}%`, height:"100%", background:clr.main, borderRadius:99, transition:"width .5s" }}/>
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, color:clr.main, marginTop:4 }}>
                    {rate >= 80 ? "✅ Đạt mục tiêu ≥80%" : rate >= 50 ? "⚠️ Cần tăng tốc" : "🔴 Dưới mức yêu cầu"}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 2. Thời gian xử lý TB */}
          <div style={{ flex:1, borderRadius:12, border:"1px solid #e2e8f0", background:"#fff",
            padding:"14px 16px", display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:10, flexShrink:0,
              background:"#eff6ff", border:"1px solid #bfdbfe",
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>⏱️</div>
            <div style={{ minWidth:0, flex:1 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#64748b", marginBottom:3 }}>Thời gian xử lý TB</div>
              {chartClosureRate.avgDays !== null ? (
                <>
                  <div style={{ fontSize:26, fontWeight:800, color:"#0f172a", lineHeight:1 }}>
                    {chartClosureRate.avgDays}<span style={{ fontSize:13, fontWeight:600, color:"#94a3b8" }}> ngày</span>
                  </div>
                  <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>trung bình từ tạo → đóng</div>
                  <div style={{ fontSize:11, fontWeight:700, marginTop:4,
                    color: chartClosureRate.avgDays <= 7 ? "#16a34a" : chartClosureRate.avgDays <= 14 ? "#d97706" : "#dc2626" }}>
                    {chartClosureRate.avgDays <= 7 ? "✅ Dưới 1 tuần" : chartClosureRate.avgDays <= 14 ? "⚠️ Trong 2 tuần" : "🔴 Trên 2 tuần"}
                  </div>
                </>
              ) : (
                <div style={{ fontSize:12, color:"#94a3b8", fontStyle:"italic", marginTop:4 }}>Chưa có CAPA đóng</div>
              )}
            </div>
          </div>

          {/* 3. CAPA quá hạn */}
          {(() => {
            const hasOver = stats.overdue > 0;
            return (
              <div style={{ flex:1, borderRadius:12,
                border:`1px solid ${hasOver ? "#fca5a5" : "#e2e8f0"}`,
                background:"#fff",
                padding:"14px 16px", display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:44, height:44, borderRadius:10, flexShrink:0,
                  background: hasOver ? "#fef2f2" : "#f8fafc",
                  border: hasOver ? "1px solid #fca5a5" : "1px solid #e2e8f0",
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>
                  {hasOver ? "🔥" : "✅"}
                </div>
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#64748b", marginBottom:3 }}>CAPA quá hạn</div>
                  <div style={{ fontSize:26, fontWeight:800, lineHeight:1, color: hasOver ? "#991b1b" : "#0f172a" }}>
                    {stats.overdue}
                    {stats.total > 0 && <span style={{ fontSize:13, fontWeight:600, color:"#94a3b8" }}>/{stats.total}</span>}
                  </div>
                  <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>
                    {hasOver ? "vượt hạn xử lý" : "chưa có quá hạn"}
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, marginTop:4,
                    color: hasOver ? "#dc2626" : "#16a34a" }}>
                    {hasOver ? "🚨 Xử lý ngay!" : "✅ Đúng tiến độ"}
                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      </div>

      {/* ── Tình trạng CAPA theo Bộ phận — redesigned ─────────────────── */}
      {chartDept.length > 0 && (
        <div style={{ borderRadius:12, border:"1px solid #e2e8f0", background:"#fff", overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
          {/* Header */}
          <div style={{ padding:"14px 18px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontSize:13.5, fontWeight:700, color:"#0f172a" }}>Tình trạng CAPA theo Bộ phận</div>
              <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>
                {chartDept.length} bộ phận có CAPA · sắp xếp theo tổng số
              </div>
            </div>
            {/* Legend */}
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              {[
                { color:"#3b82f6", label:"Đang mở" },
                { color:"#f59e0b", label:"Đang xử lý" },
                { color:"#06b6d4", label:"Chờ NT" },
                { color:"#22c55e", label:"Đã đóng" },
              ].map(l => (
                <div key={l.label} style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <span style={{ width:10, height:10, borderRadius:3, background:l.color, display:"inline-block", flexShrink:0 }}/>
                  <span style={{ fontSize:11.5, color:"#475569", fontWeight:600 }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Rows */}
          <div style={{ padding:"14px 18px", display:"flex", flexDirection:"column", gap:10 }}>
            {chartDept.map((row, i) => {
              const maxTotal = chartDept[0]?.total || 1;
              const totalPct = Math.round((row.total / maxTotal) * 100);
              const segs = [
                { val:row.open,       color:"#3b82f6", label:"Đang mở" },
                { val:row.inProgress, color:"#f59e0b", label:"Đang xử lý" },
                { val:row.waiting,    color:"#06b6d4", label:"Chờ NT" },
                { val:row.closed,     color:"#22c55e", label:"Đã đóng" },
              ].filter(s => s.val > 0);
              return (
                <div key={row.dept} style={{ display:"flex", alignItems:"center", gap:12 }}>
                  {/* Dept pill */}
                  <div style={{
                    width:56, flexShrink:0,
                    fontSize:12, fontWeight:800, color: i===0?"#0369a1":"#334155",
                    textAlign:"right", letterSpacing:"0.01em",
                  }}>{row.dept}</div>
                  {/* Bar track */}
                  <div style={{ flex:1, height:24, borderRadius:8, background:"#e2e8f0", display:"flex", overflow:"hidden", gap:2, padding:2 }}>
                    {segs.map((seg, si) => (
                      <div key={si}
                        title={`${seg.label}: ${seg.val}`}
                        style={{
                          width:`${Math.max(Math.round(seg.val/maxTotal*100), 3)}%`,
                          background:seg.color, borderRadius:6,
                          minWidth:seg.val>0?8:0, transition:"width .5s cubic-bezier(.2,.8,.4,1)",
                          display:"flex", alignItems:"center", justifyContent:"center",
                        }}>
                        {seg.val >= 2 && (
                          <span style={{ fontSize:10, fontWeight:900, color:"rgba(255,255,255,.9)" }}>{seg.val}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Right: total + overdue */}
                  <div style={{ display:"flex", alignItems:"center", gap:6, width:80, flexShrink:0, justifyContent:"flex-end" }}>
                    <span style={{ fontSize:13.5, fontWeight:900, color: i===0?"#0369a1":"#1e293b" }}>{row.total}</span>
                    {row.overdue > 0 && (
                      <span style={{ fontSize:11, fontWeight:800, color:"#dc2626",
                        background:"#fef2f2", border:"1.5px solid #fca5a5",
                        padding:"2px 6px", borderRadius:6, whiteSpace:"nowrap" }}>
                        ⚠️{row.overdue}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Footer summary */}
          {(() => {
            const withOverdue = chartDept.filter(d => d.overdue > 0);
            const topDept = chartDept[0];
            const totalClosed = chartDept.reduce((s,d)=>s+d.closed,0);
            const totalAll = chartDept.reduce((s,d)=>s+d.total,0);
            return (
              <div style={{ padding:"10px 18px 14px", borderTop:"1px solid #f1f5f9", display:"flex", gap:14, flexWrap:"wrap", alignItems:"center" }}>
                {topDept && (
                  <span style={{ fontSize:12, color:"#64748b", display:"flex", alignItems:"center", gap:5 }}>
                    <span style={{ fontSize:14 }}>📊</span>
                    <span>Nhiều nhất: <b style={{ color:"#0369a1" }}>{topDept.dept}</b> ({topDept.total} CAPA)</span>
                  </span>
                )}
                {withOverdue.length > 0 && (
                  <span style={{ fontSize:12, color:"#dc2626", fontWeight:700, display:"flex", alignItems:"center", gap:4,
                    background:"#fef2f2", borderRadius:20, padding:"2px 10px", border:"1px solid #fecaca" }}>
                    ⚠️ {withOverdue.length} bộ phận quá hạn
                  </span>
                )}
                <span style={{ fontSize:12, color:"#64748b", display:"flex", alignItems:"center", gap:4,
                  background:"#f0fdf4", borderRadius:20, padding:"2px 10px", border:"1px solid #bbf7d0" }}>
                  ✅ Đã đóng: <b style={{ color:"#15803d" }}>{totalClosed}</b>/{totalAll}
                </span>
              </div>
            );
          })()}
        </div>
      )}
      </div>
      )}

      {/* ── List view ────────────────────────────────────────────────── */}
      {activeTab === 'list' && (<>

      {/* ── Status chip tabs ──────────────────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap",
        background:"#fff", borderRadius:12, border:"1.5px solid #e8edf3",
        padding:"8px 12px", boxShadow:"0 1px 4px rgba(15,42,92,0.04)" }}>
        {(
          [
            { key:"all",           label:"Tất cả",         icon:"🗂️",  iconBg:"#f1f5f9",  iconBgA:"#dbeafe",  count: chipCounts.all },
            { key:"pending",       label:"Chờ duyệt",      icon:"⏳",  iconBg:"#fef9ee",  iconBgA:"#fef3c7",  count: chipCounts.pending },
            { key:"open",          label:"Đang mở",        icon:"🔵",  iconBg:"#f0f9ff",  iconBgA:"#e0f2fe",  count: chipCounts.open },
            { key:"in_progress",   label:"Đang xử lý",     icon:"⚡",  iconBg:"#fefce8",  iconBgA:"#fef08a",  count: chipCounts.in_progress },
            { key:"done_by_owner", label:"Chờ nghiệm thu", icon:"🟣",  iconBg:"#f5f3ff",  iconBgA:"#ede9fe",  count: chipCounts.done_by_owner },
            { key:"closed",        label:"Đã đóng",        icon:"✅",  iconBg:"#f0fdf4",  iconBgA:"#dcfce7",  count: chipCounts.closed },
            { key:"__overdue__",   label:"Quá hạn",        icon:"🔴",  iconBg:"#fff1f1",  iconBgA:"#fee2e2",  count: chipCounts.overdue },
          ] as const
        ).map(chip => {
          const isOverdue = chip.key === "__overdue__";
          const isActive = isOverdue ? overdueOnly : (statusFilter === chip.key && !overdueOnly);
          const activePalette: Record<string, { bg: string; border: string; text: string; badge: string }> = {
            all:            { bg:"#dbeafe", border:"#93c5fd", text:"#1d4ed8", badge:"#1d4ed8" },
            pending:        { bg:"#fef3c7", border:"#fbbf24", text:"#92400e", badge:"#b45309" },
            open:           { bg:"#e0f2fe", border:"#7dd3fc", text:"#075985", badge:"#0369a1" },
            in_progress:    { bg:"#fefce8", border:"#fde047", text:"#713f12", badge:"#a16207" },
            done_by_owner:  { bg:"#ede9fe", border:"#c4b5fd", text:"#5b21b6", badge:"#6d28d9" },
            closed:         { bg:"#dcfce7", border:"#86efac", text:"#14532d", badge:"#15803d" },
            __overdue__:    { bg:"#fee2e2", border:"#fca5a5", text:"#7f1d1d", badge:"#dc2626" },
          };
          const p = activePalette[chip.key as keyof typeof activePalette];
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                if (isOverdue) { setOverdueOnly(true); setStatusFilter("all"); }
                else { setOverdueOnly(false); setStatusFilter(chip.key as string); }
                setPage(1);
              }}
              style={{
                display:"inline-flex", alignItems:"center", gap:7,
                padding:"5px 10px 5px 5px", borderRadius:20,
                border: isActive ? `1.5px solid ${p.border}` : "1.5px solid #e2e8f0",
                background: isActive ? p.bg : "#f8fafc",
                color: isActive ? p.text : "#475569",
                fontSize:12.5, fontWeight: isActive ? 800 : 600,
                cursor:"pointer", whiteSpace:"nowrap",
                boxShadow: isActive ? `0 2px 8px ${p.badge}22` : "none",
                transition:"all 0.15s",
              }} className={`ehsp-kpi-card-btn${isActive ? " ehsp-kpi-card-btn--active" : ""}`}
            >
              {/* Icon trong vòng tròn màu */}
              <span style={{
                display:"inline-flex", alignItems:"center", justifyContent:"center",
                width:24, height:24, borderRadius:"50%", flexShrink:0,
                background: isActive ? chip.iconBgA : chip.iconBg,
                fontSize:13, lineHeight:1,
                boxShadow: isActive ? `0 0 0 2px ${p.border}` : "none",
                transition:"all 0.15s",
              }}>
                {chip.icon}
              </span>
              {chip.label}
              {/* Badge số đếm */}
              <span style={{
                display:"inline-flex", alignItems:"center", justifyContent:"center",
                minWidth:22, height:20, padding:"0 6px",
                borderRadius:10,
                background: isActive ? p.badge : "#e2e8f0",
                color: isActive ? "#fff" : "#64748b",
                fontSize:11.5, fontWeight:900, lineHeight:1,
                boxShadow: isActive ? `0 1px 4px ${p.badge}44` : "none",
                transition:"all 0.15s",
              }}>
                {chip.count}
              </span>
            </button>
          );
        })}
        {/* Reset status/overdue only */}
        {(statusFilter !== "all" || overdueOnly) && (
          <button
            type="button"
            onClick={() => { setStatusFilter("all"); setOverdueOnly(false); setPage(1); }}
            style={{
              display:"inline-flex", alignItems:"center", gap:4,
              padding:"5px 10px", borderRadius:20,
              border:"1.5px solid #fecaca", background:"#fef2f2",
              color:"#dc2626", fontSize:11.5, fontWeight:700,
              cursor:"pointer",
            }}
          >
            ✕ Bỏ lọc trạng thái
          </button>
        )}

        {/* Overdue pill — compact, right-aligned */}
        {stats.overdue > 0 && !overdueOnly && (
          <>
            <div style={{ flex:1 }}/>
            <style>{`@keyframes capa-pulse{0%,100%{opacity:1}50%{opacity:0.55}}`}</style>
            <button
              type="button"
              onClick={() => { setOverdueOnly(true); setStatusFilter("all"); setPage(1); }}
              style={{
                display:"inline-flex", alignItems:"center", gap:6,
                padding:"5px 13px 5px 9px", borderRadius:20,
                background:"#dc2626", color:"#fff",
                fontSize:12, fontWeight:800,
                border:"none", cursor:"pointer",
                boxShadow:"0 2px 8px rgba(220,38,38,0.30)",
                animation:"capa-pulse 2s ease-in-out infinite",
                whiteSpace:"nowrap",
              }}
              title="Click để lọc các CAPA đã quá hạn"
            >
              <AlertTriangle style={{ width:13, height:13, flexShrink:0 }}/>
              {stats.overdue} quá hạn · Lọc ngay
            </button>
          </>
        )}
      </div>{/* end chip tabs row */}

      {operationError ? (<div className="safety-operation-feedback error" role="alert">
        <AlertTriangle className="size-4"/>
        <span>{operationError}</span>
      </div>) : null}
      {operationSuccess ? (<div className="safety-operation-feedback success" role="status">
        <CheckCircle2 className="size-4"/>
        <span>{operationSuccess}</span>
      </div>) : null}

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <div style={{ overflow:"hidden", borderRadius:14, border:"1.5px solid #e8edf3", background:"#fff", boxShadow:"0 2px 8px rgba(15,42,21,0.06)" }}>
        <div style={{ overflow:"auto", height:820 }}>
          <style>{`
            .capa-tbl td, .capa-tbl th { border-right: 1.5px solid #dde3ee; }
            .capa-tbl td:last-child, .capa-tbl th:last-child { border-right: none; }
            .capa-tbl thead th { border-bottom: 2px solid #c7d0e2; }
          `}</style>
          <table className="capa-tbl" style={{ minWidth:1020, width:"100%", borderCollapse:"collapse", fontSize:13, tableLayout:"fixed" }}>
            <colgroup>
              <col style={{ width:118 }}/>
              <col/>
              <col style={{ width:76 }}/>
              <col style={{ width:126 }}/>
              <col style={{ width:82 }}/>
              <col style={{ width:112 }}/>
              <col style={{ width:140 }}/>
              <col style={{ width:110 }}/>
            </colgroup>
            <thead>
              <tr style={{ background:"linear-gradient(90deg,#1e3a8a 0%,#1d4ed8 100%)", position:"sticky", top:0, zIndex:2 }}>
                {([
                  { label:"Mã CAPA",               key:"code" },
                  { label:"Nội dung / Loại vấn đề",key:null },
                  { label:"BP",                    key:"departmentCode" },
                  { label:"Nguồn",                 key:null },
                  { label:"Ưu tiên",               key:"priority" },
                  { label:"Trạng thái",             key:"status" },
                  { label:"Hạn xử lý",             key:"dueDate",  center:true },
                  { label:"Thao tác",               key:null },
                ] as {label:string;key:string|null;center?:boolean}[]).map(col => {
                  const active = sortCol === col.key;
                  const sortable = col.key !== null;
                  return (
                    <th key={col.label ? t(col.label) : ""}
                      onClick={() => {
                        if (!sortable) return;
                        if (active) setSortDir(d => d === "asc" ? "desc" : "asc");
                        else { setSortCol(col.key as string); setSortDir("asc"); }
                        setPage(1);
                      }}
                      style={{
                        padding:"7px 8px", textAlign: col.center ? "center" : "left",
                        fontSize:12, fontWeight:800, letterSpacing:"0.04em",
                        textTransform:"uppercase",
                        color: active ? "#fde047" : "#fbbf24",
                        borderBottom:"none", whiteSpace:"nowrap",
                        cursor: sortable ? "pointer" : "default",
                        userSelect:"none",
                      }}
                    >
                      <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
                        {col.label ? t(col.label) : ""}
                        {sortable && (
                          <span style={{ display:"inline-flex", flexDirection:"column", gap:1, lineHeight:1, opacity: active ? 1 : 0.4 }}>
                            <span style={{ fontSize:7, color: active && sortDir==="asc" ? "#fde047" : "rgba(255,255,255,0.6)", lineHeight:1 }}>▲</span>
                            <span style={{ fontSize:7, color: active && sortDir==="desc" ? "#fde047" : "rgba(255,255,255,0.6)", lineHeight:1 }}>▼</span>
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 15 }).map((_, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc", borderLeft:"4px solid #e2e8f0", borderBottom:"1.5px solid #dde3ee" }}>
                  {[92, 260, 76, 126, 82, 112, 106, 110].map((w, ci) => (
                    <td key={ci} style={{ padding:"7px 8px", verticalAlign:"middle" }}>
                      <div style={{
                        height: ci === 1 ? 14 : 12,
                        width: `${55 + ((i * 7 + ci * 13) % 35)}%`,
                        borderRadius: 6,
                        background: "linear-gradient(90deg,#f0f4fa 25%,#e2e8f0 50%,#f0f4fa 75%)",
                        backgroundSize: "200% 100%",
                        animation: `skeletonShimmer 1.4s ease-in-out ${(i * 0.05 + ci * 0.03).toFixed(2)}s infinite`,
                      }} />
                      {ci === 1 && (
                        <div style={{
                          marginTop: 6, height: 10, width: "45%", borderRadius: 6,
                          background: "linear-gradient(90deg,#f0f4fa 25%,#e2e8f0 50%,#f0f4fa 75%)",
                          backgroundSize: "200% 100%",
                          animation: `skeletonShimmer 1.4s ease-in-out ${(i * 0.05 + 0.1).toFixed(2)}s infinite`,
                        }} />
                      )}
                    </td>
                  ))}
                </tr>
              )) : filteredActions.length ? filteredActions.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map((action, idx) => {
                  const today = new Date().toISOString().slice(0,10);
                  const isOverdue = action.dueDate && action.status !== "closed" && action.status !== "verified" && action.dueDate < today;
                  const PRIO_COLOR: Record<string,string> = { critical:"#dc2626", high:"#f97316", medium:"#eab308", low:"#22c55e" };
                  const closed = action.status === "closed" || action.status === "verified";
                  const leftColor = closed ? "#16a34a"
                    : isOverdue ? "#dc2626"
                    : PRIO_COLOR[action.priority] || "#e2e8f0";
                  const rowBg = isOverdue
                    ? (idx % 2 === 0 ? "rgba(254,226,226,0.28)" : "rgba(254,202,202,0.22)")
                    : (idx % 2 === 0 ? "#fff" : "#f8fafc");
                  /* status badge config */
                  const STATUS_STYLE: Record<string,{bg:string,color:string,border:string}> = {
                    draft:         { bg:"#f8fafc", color:"#64748b", border:"#cbd5e1" },
                    pending_ehs:   { bg:"#fff7ed", color:"#c2410c", border:"#fed7aa" },
                    rejected:      { bg:"#fef2f2", color:"#dc2626", border:"#fca5a5" },
                    open:          { bg:"#f0f9ff", color:"#0369a1", border:"#bae6fd" },
                    assigned:      { bg:"#fefce8", color:"#854d0e", border:"#fde68a" },
                    in_progress:   { bg:"#fff7ed", color:"#c2410c", border:"#fed7aa" },
                    done_by_owner: { bg:"#eff6ff", color:"#1d4ed8", border:"#bfdbfe" },
                    blocked:       { bg:"#fef2f2", color:"#b91c1c", border:"#fecaca" },
                    reopened:      { bg:"#fef2f2", color:"#b91c1c", border:"#fecaca" },
                    closed:        { bg:"#f0fdf4", color:"#15803d", border:"#a7f3d0" },
                    verified:      { bg:"#f0fdf4", color:"#15803d", border:"#a7f3d0" },
                  };
                  const ss = STATUS_STYLE[action.status] || { bg:"#f8fafc", color:"#475569", border:"#e2e8f0" };
                  return (
                    <tr key={action.id} className="ehsp-action-row-hoverable" style={{ background: rowBg, borderLeft:`4px solid ${leftColor}`, borderBottom:"1.5px solid #dde3ee", cursor:"pointer", transition:"background 0.12s", ["--ehsp-row-hover-bg" as any]: isOverdue ? "rgba(254,202,202,0.45)" : "#f0f5ff" }}
                      onClick={() => setViewId(action.id)}
                    >
                    {/* MÃ CAPA */}
                    <td style={{ padding:"7px 8px", verticalAlign:"middle", whiteSpace:"nowrap", textAlign:"center" }}>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                        <span
                          title={action.code}
                          style={{
                            display:"inline-block", fontFamily:"monospace",
                            fontSize:12, fontWeight:900, letterSpacing:0.5,
                            background:"linear-gradient(135deg,#eff6ff,#dbeafe)",
                            color:"#1d4ed8", border:"1px solid #bfdbfe",
                            borderRadius:6, padding:"2px 8px", whiteSpace:"nowrap",
                            maxWidth:"100%", overflow:"hidden", textOverflow:"ellipsis",
                          }}>
                          {/* Bỏ prefix CAPA- để hiện gọn hơn */}
                          {action.code?.replace(/^CAPA-\d{4}/, "") || action.code}
                        </span>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:4, flexWrap:"nowrap" }}>
                          {action.createdAt && (
                            <span style={{ fontSize:11, color:"#64748b", fontWeight:500 }}>
                              {action.createdAt.slice(0,10)}
                            </span>
                          )}
                          {isOverdue && (
                            <span title="Đã quá hạn" style={{ display:"inline-flex", alignItems:"center",
                              color:"#dc2626", cursor:"default" }}>
                              <AlertTriangle style={{ width:12, height:12 }}/>
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* NỘI DUNG */}
                    <td style={{ padding:"7px 8px", verticalAlign:"middle", overflow:"hidden" }}>
                      <div title={action.title?.replace("|||", " / ") || ""} style={{
                        fontSize:13, fontWeight:700, color:"#0f172a",
                        whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                        lineHeight:1.35,
                      }}>
                        <BilingualText text={action.title} />
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:3, flexWrap:"wrap" }}>
                        {action.problemType ? (() => {
                          const pt = PROBLEM_TYPE_OPTIONS.find(p => p.value === action.problemType);
                          const icon = pt?.label.split(" ")[0] ?? "🏷️";
                          const name = pt ? pt.label.slice(pt.label.indexOf(" ")+1) : action.problemType;
                          return (
                            <span style={{ display:"inline-flex", alignItems:"center", gap:2,
                              fontSize:10.5, fontWeight:700, color:"#6d28d9",
                              background:"#f5f3ff", border:"1px solid #ddd6fe",
                              borderRadius:4, padding:"0px 5px", lineHeight:"16px", whiteSpace:"nowrap",
                            }}>
                              <span style={{ fontSize:10.5 }}>{icon}</span>{t(name)}
                            </span>
                          );
                        })() : null}
                        {(action.area || action.occurLocation) && (
                          <span style={{ display:"inline-flex", alignItems:"center", gap:2,
                            fontSize:10.5, fontWeight:600, color:"#0369a1",
                            background:"#f0f9ff", border:"1px solid #bae6fd",
                            borderRadius:4, padding:"0px 5px", lineHeight:"16px", whiteSpace:"nowrap",
                            maxWidth:120, overflow:"hidden", textOverflow:"ellipsis",
                          }} title={action.area || action.occurLocation}>
                            📍 {action.area || action.occurLocation}
                          </span>
                        )}
                        {Array.isArray(action.evidenceFiles) && action.evidenceFiles.length > 0 && (
                          <button type="button" onClick={e => { e.stopPropagation(); setFileTarget(action); }}
                            style={{ display:"inline-flex", alignItems:"center", gap:2, borderRadius:5,
                              border:"1px solid #bfdbfe", background:"#eff6ff",
                              padding:"1px 7px", fontSize:12, fontWeight:700, color:"#1d4ed8", cursor:"pointer",
                              lineHeight:"18px", whiteSpace:"nowrap",
                            }}>
                            📎 {action.evidenceFiles.length} file
                          </button>
                        )}
                      </div>
                    </td>
                    {/* BỘ PHẬN */}
                    <td style={{ padding:"7px 8px", verticalAlign:"middle" }}>
                      <span style={{
                        display:"inline-block", fontSize:12, fontWeight:800,
                        color:"#0f2460", background:"#eef4ff",
                        border:"1px solid #c7d8f8", borderRadius:6,
                        padding:"2px 7px", whiteSpace:"nowrap",
                      }}>{action.departmentCode}</span>
                    </td>
                    {/* NGUỒN */}
                    <td style={{ padding:"7px 8px", verticalAlign:"middle" }}>
                      {(() => {
                        const src = action.sourceType || "manual";
                        const SRC_STYLE: Record<string,{bg:string;color:string;border:string}> = {
                          warning:    { bg:"#fff7ed", color:"#c2410c", border:"#fed7aa" },
                          incident:   { bg:"#fef2f2", color:"#b91c1c", border:"#fecaca" },
                          iplan:      { bg:"#eff6ff", color:"#1d4ed8", border:"#bfdbfe" },
                          inspection: { bg:"#eff6ff", color:"#1d4ed8", border:"#bfdbfe" },
                          audit:      { bg:"#f0fdf4", color:"#15803d", border:"#a7f3d0" },
                          pccc:       { bg:"#fdf4ff", color:"#86198f", border:"#f0abfc" },
                          kyt:        { bg:"#f5f3ff", color:"#6d28d9", border:"#ddd6fe" },
                          manual:     { bg:"#f8fafc", color:"#475569", border:"#e2e8f0" },
                        };
                        const st = SRC_STYLE[src] || SRC_STYLE.manual;
                        return (
                          <span style={{
                            fontSize:12, fontWeight:600, color:st.color,
                            background:st.bg, border:`1px solid ${st.border}`,
                            borderRadius:5, padding:"2px 7px",
                            whiteSpace:"nowrap", display:"inline-block",
                          }}>
                            {srcLabel(src, t)}
                          </span>
                        );
                      })()}
                    </td>
                    {/* ƯU TIÊN */}
                    <td style={{ padding:"7px 8px", verticalAlign:"middle" }}>
                      <span style={{
                        display:"inline-flex", alignItems:"center", gap:5,
                        borderRadius:20, padding:"3px 10px", fontSize:12, fontWeight:700,
                        border:`1.5px solid ${PRIO_COLOR[action.priority]||"#e2e8f0"}40`,
                        background: PRIO_COLOR[action.priority] ? PRIO_COLOR[action.priority]+"18" : "#f1f5f9",
                        color: PRIO_COLOR[action.priority] || "#64748b",
                        whiteSpace:"nowrap",
                      }}>
                        <span style={{ width:7, height:7, borderRadius:"50%", background:PRIO_COLOR[action.priority]||"#94a3b8", flexShrink:0, boxShadow:`0 0 0 2px ${PRIO_COLOR[action.priority]||"#94a3b8"}30` }}/>
                        {PRIORITY_LABEL[action.priority]?.replace(/^[^\s]+\s/,"") || action.priority}
                      </span>
                    </td>
                    {/* TRẠNG THÁI */}
                    <td style={{ padding:"7px 8px", verticalAlign:"middle" }}>
                      <span style={{
                        display:"inline-flex", alignItems:"center", gap:5,
                        borderRadius:10, border:`1.5px solid ${ss.border}`,
                        padding:"3px 8px", fontSize:11.5, fontWeight:700,
                        background:ss.bg, color:ss.color,
                        whiteSpace:"normal", lineHeight:1.3, maxWidth:96,
                      }}>
                        <span style={{ width:6, height:6, borderRadius:"50%", background:ss.color, flexShrink:0 }}/>
                        {t(STATUS_LABEL[action.status] || action.status)}
                      </span>
                    </td>
                    {/* HẠN */}
                    <td style={{ padding:"7px 12px", verticalAlign:"middle", whiteSpace:"nowrap", textAlign:"center" }}>
                      {(() => {
                        const closed = action.status === "closed" || action.status === "verified";
                        if (!action.dueDate) return <span style={{ fontSize:12, color:"#cbd5e1" }}>—</span>;

                        const todayMs  = new Date(today + "T00:00:00").getTime();
                        const dueMs    = new Date(action.dueDate + "T00:00:00").getTime();
                        const diffDays = Math.round((dueMs - todayMs) / 86400000);

                        /* date colour */
                        const dateColor = closed ? "#16a34a"
                          : isOverdue ? "#dc2626"
                          : diffDays === 0 ? "#b45309"
                          : diffDays <= 3 ? "#c2410c"
                          : diffDays <= 7 ? "#b45309"
                          : "#24415f";

                        /* sub-line text + colour */
                        const subText = closed ? "Đã xong"
                          : isOverdue ? `Quá ${Math.abs(diffDays)} ngày`
                          : diffDays === 0 ? "Hôm nay!"
                          : diffDays <= 14 ? `Còn ${diffDays} ngày`
                          : null;

                        const subColor = closed ? "#16a34a"
                          : isOverdue ? "#dc2626"
                          : diffDays === 0 ? "#92400e"
                          : diffDays <= 3 ? "#be123c"
                          : diffDays <= 7 ? "#c2410c"
                          : "#667795";

                        return (
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                            <strong style={{ fontSize:13, fontWeight:700, color:dateColor, display:"block", lineHeight:1.3,
                              animation: isOverdue ? "capa-pulse 1.8s ease-in-out infinite" : undefined }}>
                              {action.dueDate}
                            </strong>
                            {subText && (
                              <span style={{ fontSize:11.5, fontWeight:600, color:subColor, display:"block", lineHeight:1.2,
                                whiteSpace:"nowrap" }}>
                                {isOverdue && <AlertTriangle style={{ width:9, height:9, flexShrink:0, marginRight:2, display:"inline", verticalAlign:"middle" }}/>}
                                {subText}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    {/* PHỤ TRÁCH + THAO TÁC */}
                    <td style={{ padding:"7px 8px", verticalAlign:"middle", whiteSpace:"nowrap" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        {/* avatar */}
                        {(() => {
                          const colors = ["#1d4ed8","#7c3aed","#0891b2","#15803d","#b45309","#be185d"];
                          if (action.ownerName) {
                            const parts = action.ownerName.trim().split(" ");
                            const initials = parts.length >= 2
                              ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase()
                              : action.ownerName.slice(0,2).toUpperCase();
                            const ci = action.ownerName.charCodeAt(0) % colors.length;
                            return (
                              <span title={action.ownerName} style={{
                                display:"inline-flex", alignItems:"center", justifyContent:"center",
                                width:28, height:28, borderRadius:"50%", flexShrink:0,
                                background:colors[ci],
                                fontSize:11, fontWeight:900, color:"#fff", letterSpacing:0,
                                cursor:"default", boxShadow:"0 1px 3px rgba(0,0,0,0.18)",
                              }}>{initials}</span>
                            );
                          }
                          return (
                            <span title="Chưa giao" style={{
                              display:"inline-flex", alignItems:"center", justifyContent:"center",
                              width:28, height:28, borderRadius:"50%", flexShrink:0,
                              background:"#f1f5f9", border:"1.5px dashed #cbd5e1",
                              color:"#94a3b8",
                            }}>
                              <UserRound size={13} />
                            </span>
                          );
                        })()}
                        {/* divider */}
                        <span style={{ width:1, height:20, background:"#e2e8f0", flexShrink:0 }} />
                        {/* action buttons */}
                        <button
                          type="button"
                          onClick={() => setViewId(action.id)}
                          title="Xem chi tiết CAPA"
                          style={{
                            display:"inline-flex", alignItems:"center", justifyContent:"center",
                            width:30, height:30, borderRadius:8, cursor:"pointer",
                            background:"linear-gradient(135deg,#eff6ff,#dbeafe)",
                            color:"#1d4ed8", border:"1.5px solid #bfdbfe",
                            fontSize:14, transition:"all 0.12s",
                          }} className="ehsp-icon-btn ehsp-icon-btn--view"
                        >
                          👁
                        </button>
                        {action.status === "draft" && QD_APPROVE_ROLES.has(currentUserRole) && (
                          <button
                            type="button"
                            title="QĐ phê duyệt → Chờ EHS"
                            onClick={() => updateStatus(action, "pending_ehs")}
                            style={{
                              display:"inline-flex", alignItems:"center", justifyContent:"center",
                              width:30, height:30, borderRadius:8, cursor:"pointer",
                              background:"#fff7ed", color:"#c2410c",
                              border:"1.5px solid #fed7aa", fontSize:14,
                            }}
                          >
                            ✅
                          </button>
                        )}
                        {action.status === "pending_ehs" && EHS_APPROVE_ROLES.has(currentUserRole) && (
                          <button
                            type="button"
                            title="EHS phê duyệt → Mở CAPA"
                            onClick={() => updateStatus(action, "open")}
                            style={{
                              display:"inline-flex", alignItems:"center", justifyContent:"center",
                              width:30, height:30, borderRadius:8, cursor:"pointer",
                              background:"#f0fdf4", color:"#15803d",
                              border:"1.5px solid #a7f3d0", fontSize:14,
                            }}
                          >
                            ✅
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>);
              }) : (<tr>
                  <td colSpan={8} style={{ padding:"56px 12px", textAlign:"center" }}>
                    <div style={{ display:"inline-flex", flexDirection:"column", alignItems:"center", gap:12 }}>
                      <div style={{ fontSize:48, lineHeight:1 }}>🔍</div>
                      <div style={{ fontSize:15, fontWeight:800, color:"#334155" }}>Không tìm thấy CAPA nào</div>
                      <div style={{ fontSize:13, color:"#94a3b8", maxWidth:320, textAlign:"center", lineHeight:1.5 }}>
                        Thử điều chỉnh bộ lọc hoặc tìm kiếm với từ khóa khác
                      </div>
                      <button type="button"
                        onClick={() => { setDeptFilter("all"); setStatusFilter("all"); setSourceFilter("all"); setProblemTypeFilter("all"); setOverdueOnly(false); setDateFilter("all"); setCustomMonth(""); setSearch(""); setPage(1); }}
                        style={{
                          display:"inline-flex", alignItems:"center", gap:6,
                          padding:"8px 18px", borderRadius:20,
                          background:"#0f2460", color:"#fff",
                          border:"none", cursor:"pointer",
                          fontSize:13, fontWeight:700,
                        }}>
                        ✕ Xóa bộ lọc
                      </button>
                    </div>
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Table footer: count + pagination ──────────────────────────── */}
      {(() => {
        const total = filteredActions.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
        const end   = Math.min(page * PAGE_SIZE, total);
        const btnStyle = (active: boolean, disabled?: boolean): React.CSSProperties => ({
          display:"inline-flex", alignItems:"center", justifyContent:"center",
          minWidth:32, height:32, padding:"0 10px",
          borderRadius:8, fontSize:12.5, fontWeight:700,
          border:"1.5px solid",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.4 : 1,
          transition:"all 0.12s",
          background: active ? "#0f2a15" : "#fff",
          borderColor: active ? "#0f2a15" : "#e2e8f0",
          color: active ? "#f5c400" : "#64748b",
        });
        return (
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"10px 16px",
            background:"#f8fafc", borderRadius:12,
            border:"1.5px solid #e8edf3",
          }}>
            <span style={{ fontSize:13, fontWeight:700, color:"#475569" }}>
              Hiển thị <strong style={{ color:"#0f2a15" }}>{start}–{end}</strong> / <strong style={{ color:"#0f2a15" }}>{total}</strong> CAPA
              {dateFilter !== "all" || statusFilter !== "all" || deptFilter !== "all"
                ? <span style={{ marginLeft:6, fontSize:11.5, fontWeight:600, color:"#94a3b8" }}>(đang lọc)</span>
                : null}
            </span>
            {totalPages > 1 && (
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <button style={btnStyle(false, page===1)} disabled={page===1}
                  onClick={() => setPage(p => Math.max(1, p-1))}>‹</button>
                {Array.from({ length: totalPages }, (_,i) => i+1)
                  .filter(p => p===1 || p===totalPages || Math.abs(p-page)<=1)
                  .reduce<(number|"…")[]>((acc, p, i, arr) => {
                    if (i>0 && p-(arr[i-1] as number)>1) acc.push("…");
                    acc.push(p); return acc;
                  }, [])
                  .map((p, i) =>
                    p === "…"
                      ? <span key={`e${i}`} style={{ padding:"0 4px", color:"#94a3b8", fontSize:12 }}>…</span>
                      : <button key={p} style={btnStyle(p===page)} onClick={() => setPage(p as number)}>{p}</button>
                  )
                }
                <button style={btnStyle(false, page===totalPages)} disabled={page===totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p+1))}>›</button>
              </div>
            )}
          </div>
        );
      })()}

      </>)}
      {/* end list view */}

      </div>{/* /ehsp-body */}

      {createOpen && (
        <CreateCapaModal
          departments={departments}
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            setCreateOpen(false);
            setActions(prev => [created, ...prev]);
            setOperationSuccess(`Đã tạo CAPA ${created.code || created.title || ""}.`);
          }}
        />
      )}

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

      {/* ── Modal xem file bằng chứng ─────────────────────────────────── */}
      <ModalShell onClose={() => setFileTarget(null)} open={Boolean(fileTarget)} title={`Bằng chứng: ${fileTarget?.code || ""}`}>
        <div className="flex flex-col gap-3 p-5">
          <p className="text-sm font-semibold text-slate-600">{fileTarget?.title}</p>
          {fileTarget?.evidenceNotes && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
              {fileTarget.evidenceNotes}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(fileTarget?.evidenceFiles || []).map((file, index) => {
              const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.url || "");
              return (
                <div key={index} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  {isImage ? (
                    <button
                      type="button"
                      className="group relative block w-full"
                      onClick={() => setLightboxUrl(file.url)}
                    >
                      <img
                        src={file.url}
                        alt={file.originalName || file.fileName}
                        className="h-32 w-full object-cover transition group-hover:brightness-90"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                        <span className="rounded-lg bg-black/60 px-2 py-1 text-xs font-black text-white">Xem lớn</span>
                      </div>
                    </button>
                  ) : (
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-32 w-full flex-col items-center justify-center gap-2 bg-slate-50 text-blue-600 hover:bg-blue-50"
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                        <polyline points="13 2 13 9 20 9"/>
                      </svg>
                      <span className="text-xs font-black">Mở file</span>
                    </a>
                  )}
                  <div className="border-t border-slate-100 px-2 py-1.5">
                    <p className="truncate text-xs font-semibold text-slate-700">{file.originalName || file.fileName}</p>
                    {file.uploadedAt && (
                      <p className="mt-0.5 text-xs text-slate-400">{file.uploadedAt.slice(0, 10)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {(!fileTarget?.evidenceFiles || fileTarget.evidenceFiles.length === 0) && (
            <p className="py-6 text-center text-sm font-semibold text-slate-400">Chưa có file bằng chứng.</p>
          )}
        </div>
      </ModalShell>

      {/* ── Lightbox ───────────────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          role="presentation"
          onMouseDown={() => setLightboxUrl("")}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)",
            display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000 }}>
          <img
            src={lightboxUrl}
            alt="preview"
            onMouseDown={e => e.stopPropagation()}
            style={{ maxWidth:"92vw", maxHeight:"88vh", borderRadius:12,
              boxShadow:"0 8px 40px rgba(0,0,0,0.6)" }}
          />
          <button
            onMouseDown={() => setLightboxUrl("")}
            style={{ position:"absolute", top:20, right:24, background:"rgba(255,255,255,0.15)",
              border:"none", color:"#fff", borderRadius:"50%", width:40, height:40,
              fontSize:20, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            ✕
          </button>
        </div>
      )}
      {/* ── CapaViewModal ───────────────────────────────────────────── */}
      {viewId && (() => {
        const viewAction = actions.find(a => a.id === viewId);
        if (!viewAction) return null;
        return (
          <CapaViewModal
            action={viewAction as any}
            isEhsAdmin={true}
            currentUser={currentUser || undefined}
            onClose={() => setViewId(null)}
            onUpdated={(updated) => {
              setActions(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
            }}
            onEdit={(a) => { setViewId(null); setEditAction(a); }}
          />
        );
      })()}

      {/* ── EditCapaModal (replaces CapaViewModal, no stacking) ─── */}
      {editAction && (
        <EditCapaModal
          action={editAction}
          onClose={() => setEditAction(null)}
          onSaved={(updated) => {
            setActions(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
            setEditAction(null);
            setViewId(updated.id);
          }}
        />
      )}
    </div>)}
    {showExportModal && (
      <CapaExportModal
        actions={filteredActions as unknown as CapaExportItem[]}
        onClose={() => setShowExportModal(false)}
        pageTitle="Quản lý CAPA"
      />
    )}
    </SafetyI18nRender>;
}
export default SafetyActionsPage;
