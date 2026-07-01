import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  FileDown,
  ListChecks,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  Workflow
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { addDaysDate, apiFetchArray, patchJson, postJson } from "./safety-api";
import { ErrorPanel, LoadingPanel, ModalShell, StatusBadge } from "./safety-shared";
import { SafetyI18nRender } from "./safety-i18n-render";
import { CapaViewModal } from "../../components/CapaViewModal";
import { CreateCapaModal } from "../../components/CreateCapaModal";

type EvidenceFile = {
  fileName?: string;
  originalName?: string;
  url?: string;
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
  priority: "low" | "medium" | "high" | "critical" | string;
  status: string;
  ownerName?: string;
  dueDate?: string;
  evidenceNotes?: string;
  evidenceFiles?: EvidenceFile[];
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

const PAGE_SIZE = 15;

const STATUS_OPTIONS = ["all", "draft", "pending_ehs", "open", "in_progress", "done_by_owner", "closed"];

const STATUS_LABEL: Record<string, string> = {
  all: "Tất cả",
  assigned: "Đã giao",
  blocked: "Đang vướng",
  closed: "Hoàn thành",
  done_by_owner: "Chờ nghiệm thu",
  draft: "Nháp",
  in_progress: "Đang xử lý",
  open: "Đang mở",
  pending_ehs: "Chờ EHS duyệt",
  reopened: "Mở lại",
  verified: "Đã xác minh"
};

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Khẩn",
  high: "Cao",
  low: "Thấp",
  medium: "Trung bình"
};

const SOURCE_LABEL: Record<string, string> = {
  audit: "Audit",
  incident: "Sự cố",
  iplan: "Kế hoạch KT",
  kyt: "KYT",
  manual: "Thủ công",
  pccc: "PCCC",
  warning: "Cảnh báo nóng"
};

const PROBLEM_TYPE_OPTIONS = [
  { value: "MACH", label: "Máy móc & thiết bị" },
  { value: "ELEC", label: "An toàn điện" },
  { value: "CHEM", label: "Hóa chất nguy hiểm" },
  { value: "HEIGHT", label: "Làm việc trên cao" },
  { value: "VEHICLE", label: "Xe nâng / phương tiện" },
  { value: "PPE", label: "Bảo hộ lao động" },
  { value: "BEHAV", label: "Hành vi không an toàn" },
  { value: "NEAR", label: "Tình huống cận nguy" },
  { value: "FIRE", label: "PCCC & cháy nổ" },
  { value: "ENV", label: "Môi trường làm việc" },
  { value: "6S", label: "6S / vệ sinh công nghiệp" },
  { value: "ERGO", label: "Ergonomic / tư thế" }
];

const DEFAULT_FORM = {
  departmentCode: "EHS",
  description: "",
  dueDate: addDaysDate(7),
  locationId: "",
  ownerName: "",
  priority: "medium",
  problemType: "",
  sourceType: "manual",
  status: "open",
  title: "",
  topic: ""
};

const CHART_COLORS = ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#7c3aed", "#0f766e", "#64748b"];

function errorMessage(error: unknown, fallback: string) {
  return (error as Error)?.message || fallback;
}

function sourceLabel(source?: string) {
  return SOURCE_LABEL[source || "manual"] || source || "Thủ công";
}

function statusTone(status: string) {
  if (status === "closed" || status === "verified") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (status === "done_by_owner") return "text-blue-700 bg-blue-50 border-blue-200";
  if (status === "blocked" || status === "reopened") return "text-red-700 bg-red-50 border-red-200";
  if (status === "draft" || status === "pending_ehs") return "text-purple-700 bg-purple-50 border-purple-200";
  if (status === "in_progress" || status === "assigned") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-slate-700 bg-slate-50 border-slate-200";
}

function priorityTone(priority: string) {
  if (priority === "critical") return "text-red-800 bg-red-50 border-red-200";
  if (priority === "high") return "text-orange-700 bg-orange-50 border-orange-200";
  if (priority === "medium") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-emerald-700 bg-emerald-50 border-emerald-200";
}

function dueMeta(action: SafetyAction) {
  if (!action.dueDate) return { label: "-", sub: "Chưa đặt hạn", tone: "text-slate-500", overdue: false };
  const closed = action.status === "closed" || action.status === "verified";
  const todayMs = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`).getTime();
  const dueMs = new Date(`${action.dueDate}T00:00:00`).getTime();
  const diff = Math.round((dueMs - todayMs) / 86400000);
  if (closed) return { label: action.dueDate, sub: "Đã xong", tone: "text-emerald-700", overdue: false };
  if (diff < 0) return { label: action.dueDate, sub: `Quá ${Math.abs(diff)} ngày`, tone: "text-red-700", overdue: true };
  if (diff === 0) return { label: action.dueDate, sub: "Hôm nay", tone: "text-amber-700", overdue: false };
  if (diff <= 3) return { label: action.dueDate, sub: `Còn ${diff} ngày`, tone: "text-orange-700", overdue: false };
  return { label: action.dueDate, sub: `Còn ${diff} ngày`, tone: "text-slate-600", overdue: false };
}

function csvValue(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""');
  return `"${text}"`;
}

function avatarInitials(name?: string) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function SafetyActionsPage() {
  const [actions, setActions] = useState<SafetyAction[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [problemTypeFilter, setProblemTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<"list" | "charts">("list");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<SafetyAction | null>(null);
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
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [deptFilter, overdueOnly, problemTypeFilter, search, sourceFilter, statusFilter]);

  const filteredActions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return actions
      .filter((item) => {
        const closed = item.status === "closed" || item.status === "verified";
        const today = new Date().toISOString().slice(0, 10);
        const overdue = Boolean(item.dueDate && !closed && !["draft", "pending_ehs"].includes(item.status) && item.dueDate < today);
        const searchable = [item.code, item.title, item.description, item.ownerName, item.departmentCode, item.sourceCode]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return (
          (statusFilter === "all" ||
            (statusFilter === "closed" ? closed : item.status === statusFilter)) &&
          (deptFilter === "all" || item.departmentCode === deptFilter) &&
          (sourceFilter === "all" || (item.sourceType || "manual") === sourceFilter) &&
          (problemTypeFilter === "all" || (item.problemType || "") === problemTypeFilter) &&
          (!overdueOnly || overdue) &&
          (!q || searchable.includes(q))
        );
      })
      .sort((a, b) => {
        const statusWeight: Record<string, number> = {
          draft: 1,
          pending_ehs: 2,
          open: 3,
          assigned: 4,
          in_progress: 5,
          blocked: 6,
          reopened: 7,
          done_by_owner: 8,
          closed: 9,
          verified: 10
        };
        const priorityWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
        const byStatus = (statusWeight[a.status] || 99) - (statusWeight[b.status] || 99);
        if (byStatus !== 0) return byStatus;
        const byPriority = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
        if (byPriority !== 0) return byPriority;
        return (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31");
      });
  }, [actions, deptFilter, overdueOnly, problemTypeFilter, search, sourceFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredActions.length / PAGE_SIZE));
  const pagedActions = filteredActions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => {
    const open = actions.filter((item) => ["open", "assigned", "in_progress", "reopened", "blocked"].includes(item.status)).length;
    const waiting = actions.filter((item) => item.status === "done_by_owner").length;
    const pending = actions.filter((item) => item.status === "draft" || item.status === "pending_ehs").length;
    const overdue = actions.filter((item) => dueMeta(item).overdue).length;
    const closed = actions.filter((item) => item.status === "closed" || item.status === "verified").length;
    return { closed, open, overdue, pending, total: actions.length, waiting };
  }, [actions]);

  const deptChartData = useMemo(() => {
    const map = new Map<string, { closed: number; name: string; open: number; overdue: number; total: number }>();
    actions.forEach((action) => {
      const name = departments.find((department) => department.code === action.departmentCode)?.name || action.departmentCode || "Khác";
      const row = map.get(action.departmentCode) || { closed: 0, name, open: 0, overdue: 0, total: 0 };
      row.total += 1;
      if (["closed", "verified"].includes(action.status)) row.closed += 1;
      else row.open += 1;
      if (dueMeta(action).overdue) row.overdue += 1;
      map.set(action.departmentCode, row);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [actions, departments]);

  const statusChartData = useMemo(() => {
    const map = new Map<string, number>();
    actions.forEach((action) => map.set(STATUS_LABEL[action.status] || action.status, (map.get(STATUS_LABEL[action.status] || action.status) || 0) + 1));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [actions]);

  const availableSources = useMemo(() => {
    const values = new Set(actions.map((item) => item.sourceType || "manual"));
    return Array.from(values).sort();
  }, [actions]);

  function exportCsv() {
    const headers = ["Mã CAPA", "Tiêu đề", "Bộ phận", "Nguồn", "Loại vấn đề", "Ưu tiên", "Trạng thái", "Hạn", "Người phụ trách", "Tạo bởi"];
    const rows = filteredActions.map((action) => [
      action.code,
      action.title,
      action.departmentCode,
      sourceLabel(action.sourceType),
      action.problemType || "",
      PRIORITY_LABEL[action.priority] || action.priority,
      STATUS_LABEL[action.status] || action.status,
      action.dueDate || "",
      action.ownerName || "",
      action.createdByName || ""
    ]);
    const csv = `\ufeff${[headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `CAPA_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

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
    } catch (createError) {
      setOperationError(errorMessage(createError, "Không tạo được CAPA. Vui lòng kiểm tra dữ liệu bắt buộc hoặc quyền đăng nhập."));
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(action: SafetyAction, status: string) {
    setOperationError("");
    setOperationSuccess("");
    try {
      const updated = await patchJson<SafetyAction>(`/api/actions/${encodeURIComponent(action.id)}`, { status });
      setOperationSuccess(`Đã cập nhật ${updated.code || action.code}.`);
      setDetailTarget((current) => (current?.id === action.id ? { ...current, ...updated } : current));
      await loadData();
    } catch (statusError) {
      setOperationError(errorMessage(statusError, "Không cập nhật được trạng thái CAPA."));
    }
  }

  async function submitEvidence(event: React.FormEvent) {
    event.preventDefault();
    if (!evidenceTarget) return;
    setSaving(true);
    setOperationError("");
    setOperationSuccess("");
    try {
      const updated = await postJson<SafetyAction>(`/api/actions/${encodeURIComponent(evidenceTarget.id)}/submit-evidence`, { evidenceNotes: note });
      setEvidenceTarget(null);
      setNote("");
      setOperationSuccess(`Đã gửi bằng chứng ${updated.code || evidenceTarget.code}.`);
      await loadData();
    } catch (evidenceError) {
      setOperationError(errorMessage(evidenceError, "Không gửi được bằng chứng CAPA."));
    } finally {
      setSaving(false);
    }
  }

  async function verifyAction(approved: boolean) {
    if (!verifyTarget) return;
    setSaving(true);
    setOperationError("");
    setOperationSuccess("");
    try {
      const updated = await postJson<SafetyAction>(`/api/actions/${encodeURIComponent(verifyTarget.id)}/verify`, { approved, note });
      setVerifyTarget(null);
      setNote("");
      setOperationSuccess(approved ? `Đã đóng CAPA ${updated.code || verifyTarget.code}.` : `Đã mở lại CAPA ${updated.code || verifyTarget.code}.`);
      await loadData();
    } catch (verifyError) {
      setOperationError(errorMessage(verifyError, "Không xác minh được CAPA. Tài khoản cần quyền EHS/Admin."));
    } finally {
      setSaving(false);
    }
  }

  const resetFilters = () => {
    setDeptFilter("all");
    setOverdueOnly(false);
    setProblemTypeFilter("all");
    setSearch("");
    setSourceFilter("all");
    setStatusFilter("all");
  };

  if (loading) return <SafetyI18nRender>{<LoadingPanel label="Đang tải CAPA" />}</SafetyI18nRender>;
  if (error) return <SafetyI18nRender>{<ErrorPanel error={error} />}</SafetyI18nRender>;

  return (
    <SafetyI18nRender>
      <section className="mx-auto max-w-7xl space-y-4 pb-10">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black uppercase text-emerald-700">
                <Workflow className="size-3.5" />
                Safety CAPA
              </div>
              <h2 className="mt-3 text-2xl font-black leading-tight text-slate-950">Hành động khắc phục và phòng ngừa</h2>
              <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-500">
                Theo dõi vấn đề, người phụ trách, hạn xử lý và trạng thái nghiệm thu từ cảnh báo, sự cố, audit 6S hoặc CAPA thủ công.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 hover:bg-slate-50"
                onClick={exportCsv}
                type="button"
              >
                <FileDown className="size-4" />
                Xuất CSV
              </button>
              <button
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#f5c400] px-4 text-sm font-black text-[#0f2a15] shadow-sm hover:bg-[#e0b300]"
                onClick={() => setCreateOpen(true)}
                type="button"
              >
                <Plus className="size-4" />
                Tạo CAPA
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            { icon: ClipboardCheck, label: "Tổng CAPA", value: stats.total, tone: "border-slate-200 text-slate-800" },
            { icon: Workflow, label: "Đang mở", value: stats.open, tone: "border-blue-200 text-blue-700" },
            { icon: Clock, label: "Chờ nghiệm thu", value: stats.waiting, tone: "border-amber-200 text-amber-700" },
            { icon: ShieldCheck, label: "Hoàn thành", value: stats.closed, tone: "border-emerald-200 text-emerald-700" },
            { icon: AlertTriangle, label: "Quá hạn", value: stats.overdue, tone: "border-red-200 text-red-700" },
            { icon: ListChecks, label: "Chờ duyệt", value: stats.pending, tone: "border-purple-200 text-purple-700" }
          ].map((item) => (
            <article className={`rounded-lg border bg-white p-4 shadow-sm ${item.tone}`} key={item.label}>
              <item.icon className="size-5" />
              <strong className="mt-2 block font-mono text-3xl leading-none">{item.value}</strong>
              <span className="mt-1 block text-xs font-black uppercase text-slate-500">{item.label}</span>
            </article>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1.1fr)_repeat(4,minmax(130px,0.6fr))_auto] lg:items-end">
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Tìm kiếm</span>
              <span className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="min-h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Mã, nội dung, phụ trách..."
                  value={search}
                />
              </span>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Bộ phận</span>
              <select className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold" onChange={(event) => setDeptFilter(event.target.value)} value={deptFilter}>
                <option value="all">Tất cả</option>
                {departments.map((department) => (
                  <option key={department.code} value={department.code}>
                    {department.code} - {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Nguồn</span>
              <select className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold" onChange={(event) => setSourceFilter(event.target.value)} value={sourceFilter}>
                <option value="all">Tất cả</option>
                {availableSources.map((source) => (
                  <option key={source} value={source}>
                    {sourceLabel(source)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Loại vấn đề</span>
              <select className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold" onChange={(event) => setProblemTypeFilter(event.target.value)} value={problemTypeFilter}>
                <option value="all">Tất cả</option>
                {PROBLEM_TYPE_OPTIONS.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase text-slate-500">Trạng thái</span>
              <select className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABEL[status] || status}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-black ${
                  overdueOnly ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-600"
                }`}
                onClick={() => setOverdueOnly((value) => !value)}
                type="button"
              >
                <AlertTriangle className="size-4" />
                Quá hạn
              </button>
              <button className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-slate-500 hover:bg-slate-50" onClick={resetFilters} type="button">
                <RotateCcw className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {operationError ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700" role="alert">
            <AlertTriangle className="size-4" />
            <span>{operationError}</span>
          </div>
        ) : null}
        {operationSuccess ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700" role="status">
            <CheckCircle2 className="size-4" />
            <span>{operationSuccess}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {[
            { key: "list", label: "Danh sách", icon: ListChecks },
            { key: "charts", label: "Biểu đồ", icon: BarChart3 }
          ].map((tab) => (
            <button
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-sm font-black ${
                activeTab === tab.key ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              key={tab.key}
              onClick={() => setActiveTab(tab.key as "list" | "charts")}
              type="button"
            >
              <tab.icon className="size-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "charts" ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)]">
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black uppercase text-slate-500">CAPA theo bộ phận</h3>
              <div className="mt-4 h-72">
                {deptChartData.length ? (
                  <ResponsiveContainer height="100%" minHeight={260} minWidth={260} width="100%">
                    <BarChart data={deptChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" fontSize={11} interval={0} tickLine={false} />
                      <YAxis allowDecimals={false} fontSize={11} tickLine={false} />
                      <Tooltip />
                      <Bar dataKey="open" fill="#2563eb" name="Đang mở" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="overdue" fill="#ef4444" name="Quá hạn" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="closed" fill="#10b981" name="Hoàn thành" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500">
                    Chưa có dữ liệu CAPA để vẽ biểu đồ.
                  </div>
                )}
              </div>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black uppercase text-slate-500">Tỷ lệ trạng thái</h3>
              <div className="mt-4 h-72">
                {statusChartData.length ? (
                  <ResponsiveContainer height="100%" minHeight={260} minWidth={260} width="100%">
                    <PieChart>
                      <Pie data={statusChartData} dataKey="value" innerRadius={62} nameKey="name" outerRadius={104} paddingAngle={2}>
                        {statusChartData.map((entry, index) => (
                          <Cell fill={CHART_COLORS[index % CHART_COLORS.length]} key={entry.name} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500">
                    Chưa có dữ liệu trạng thái.
                  </div>
                )}
              </div>
              <div className="mt-2 grid gap-2 text-xs font-semibold text-slate-600">
                {statusChartData.map((entry, index) => (
                  <div className="flex items-center justify-between gap-2" key={entry.name}>
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                      <span className="truncate">{entry.name}</span>
                    </span>
                    <strong>{entry.value}</strong>
                  </div>
                ))}
              </div>
            </article>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    {["Mã", "Nội dung", "Bộ phận", "Nguồn", "Ưu tiên", "Trạng thái", "Hạn", "Phụ trách", "Thao tác"].map((column) => (
                      <th className="border-b border-slate-200 px-3 py-3 font-black" key={column}>
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedActions.length ? (
                    pagedActions.map((action) => {
                      const due = dueMeta(action);
                      return (
                        <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70" key={action.id}>
                          <td className="px-3 py-3 align-top font-mono text-xs font-black text-blue-700">{action.code}</td>
                          <td className="px-3 py-3 align-top">
                            <button className="block max-w-[360px] text-left font-black text-slate-950 hover:text-blue-700" onClick={() => setDetailTarget(action)} type="button">
                              {action.title}
                            </button>
                            <span className="mt-1 block max-w-[440px] text-xs font-medium leading-snug text-slate-500">
                              {action.description || action.evidenceNotes || "Chưa có mô tả chi tiết."}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-top font-black text-slate-700">{action.departmentCode}</td>
                          <td className="px-3 py-3 align-top text-xs font-semibold text-slate-500">
                            {sourceLabel(action.sourceType)}
                            {action.sourceCode ? <span className="block font-mono text-slate-400">{action.sourceCode}</span> : null}
                          </td>
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
                          <td className={`px-3 py-3 align-top font-mono text-xs font-bold ${due.tone}`}>
                            <span className="block">{due.label}</span>
                            <span className="mt-1 block font-sans text-[11px]">{due.sub}</span>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-600">
                              {action.ownerName ? (
                                <span className="inline-flex size-7 items-center justify-center rounded-full bg-blue-700 text-[10px] font-black text-white">
                                  {avatarInitials(action.ownerName)}
                                </span>
                              ) : (
                                <span className="inline-flex size-7 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400">
                                  <UserRound className="size-3.5" />
                                </span>
                              )}
                              {action.ownerName || "Chưa giao"}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="flex flex-wrap gap-1.5">
                              <button className="inline-flex size-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-700" onClick={() => setDetailTarget(action)} title="Xem chi tiết" type="button">
                                <Eye className="size-4" />
                              </button>
                              {!["closed", "verified", "done_by_owner"].includes(action.status) ? (
                                <button className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-black text-amber-700" onClick={() => updateStatus(action, "in_progress")} type="button">
                                  Xử lý
                                </button>
                              ) : null}
                              {!["closed", "verified"].includes(action.status) ? (
                                <button
                                  className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700"
                                  onClick={() => {
                                    setEvidenceTarget(action);
                                    setNote(action.evidenceNotes || "");
                                  }}
                                  type="button"
                                >
                                  Bằng chứng
                                </button>
                              ) : null}
                              {action.status === "done_by_owner" ? (
                                <button
                                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-700"
                                  onClick={() => {
                                    setVerifyTarget(action);
                                    setNote(action.verificationNote || "");
                                  }}
                                  type="button"
                                >
                                  Verify
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className="px-3 py-12 text-center text-sm font-semibold text-slate-500" colSpan={9}>
                        Không tìm thấy CAPA phù hợp bộ lọc.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Hiển thị <strong className="text-slate-950">{filteredActions.length ? (page - 1) * PAGE_SIZE + 1 : 0}-{Math.min(page * PAGE_SIZE, filteredActions.length)}</strong> /{" "}
                <strong className="text-slate-950">{filteredActions.length}</strong> CAPA
              </span>
              <div className="flex items-center gap-2">
                <button className="rounded-md border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">
                  Trước
                </button>
                <span className="text-xs font-black uppercase text-slate-500">
                  Trang {page}/{totalPages}
                </span>
                <button className="rounded-md border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} type="button">
                  Sau
                </button>
              </div>
            </div>
          </div>
        )}

        <CreateCapaModal
          departments={departments}
          form={form}
          locations={locations}
          onChange={setForm}
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreate}
          open={createOpen}
          saving={saving}
        />

        <CapaViewModal
          action={detailTarget}
          onClose={() => setDetailTarget(null)}
          onMoveInProgress={(action) => updateStatus(action, "in_progress")}
          onRequestEvidence={(action) => {
            setEvidenceTarget(action);
            setNote(action.evidenceNotes || "");
          }}
          onRequestVerify={(action) => {
            setVerifyTarget(action);
            setNote(action.verificationNote || "");
          }}
          open={Boolean(detailTarget)}
        />

        <ModalShell onClose={() => setEvidenceTarget(null)} open={Boolean(evidenceTarget)} title="Nộp bằng chứng CAPA">
          <form className="grid gap-4 p-5" onSubmit={submitEvidence}>
            <StatusBadge value={evidenceTarget ? `${evidenceTarget.code} - ${evidenceTarget.title}` : ""} />
            <textarea className="min-h-36 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" required value={note} onChange={(event) => setNote(event.target.value)} placeholder="Mô tả bằng chứng sau khắc phục..." />
            <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-60" disabled={saving} type="submit">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Gửi bằng chứng
            </button>
          </form>
        </ModalShell>

        <ModalShell onClose={() => setVerifyTarget(null)} open={Boolean(verifyTarget)} title="EHS xác minh CAPA">
          <div className="grid gap-4 p-5">
            <StatusBadge value={verifyTarget ? `${verifyTarget.code} - ${verifyTarget.title}` : ""} />
            <textarea className="min-h-32 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú xác minh hoặc lý do mở lại..." />
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700" disabled={saving} onClick={() => verifyAction(false)} type="button">
                <AlertTriangle className="size-4" />
                Mở lại
              </button>
              <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white" disabled={saving} onClick={() => verifyAction(true)} type="button">
                <CheckCircle2 className="size-4" />
                Đóng CAPA
              </button>
            </div>
          </div>
        </ModalShell>
      </section>
    </SafetyI18nRender>
  );
}

export default SafetyActionsPage;
