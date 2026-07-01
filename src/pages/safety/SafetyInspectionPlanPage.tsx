import {
  AlertCircle,
  Building2,
  Calendar,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Edit2,
  FileDown,
  Flame,
  Grid3x3,
  LayoutList,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Printer,
  Search,
  Shield,
  Star,
  ThumbsUp,
  Trash2,
  User,
  X,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, postJson, putJson, patchJson, deleteJson } from "./safety-api";
import { ErrorPanel, LoadingPanel } from "./safety-shared";
import "./safety-inspection-plan.css";

// ─── Types ──────────────────────────────────────────────────────────────────

type DeptStatus = "pending" | "in_progress" | "done" | "skipped";
type CorrectiveSeverity = "low" | "medium" | "high" | "critical";
type CorrectiveStatus   = "open" | "resolved" | "overdue";
type PlanPriority       = "normal" | "high" | "urgent";

/** Một lỗi phát hiện + hành động khắc phục (thay thế chuỗi findings phẳng) */
type CorrectiveAction = {
  id:          string;
  finding:     string;
  severity:    CorrectiveSeverity;
  action:      string;
  responsible: string;
  dueDate:     string | null;
  resolvedAt:  string | null;
  status:      CorrectiveStatus;
};

/** Một bộ phận trong kế hoạch — schema đầy đủ, dễ mở rộng */
type PlanDepartment = {
  deptCode:              string;
  deptName:              string;
  divisionCode?:         string;          // PED / QAD / DD / SD / ED
  scheduledDate:         string | null;
  actualDate:            string | null;
  timeStart?:            string | null;   // HH:mm khi bắt đầu kiểm tra
  timeEnd?:              string | null;   // HH:mm khi kết thúc
  inspectorNames:        string[];
  leadInspectorName?:    string | null;
  checklistSubmissionId: string | null;
  score:                 number | null;   // 0–100
  findings:              string;          // tóm tắt ngắn (backward-compat)
  corrective?:           CorrectiveAction[]; // chi tiết từng lỗi
  signedOffByName?:      string | null;
  signedOffAt?:          string | null;
  evidenceRefs?:         string[];        // tên file ảnh/tài liệu
  status:                DeptStatus;
};

/** Một bản ghi lịch sử thay đổi */
type AuditEntry = {
  at:     string;
  by:     string;
  action: string;
  note?:  string;
};

type PlanStatus = "draft" | "approved" | "in_progress" | "completed" | "cancelled";
type PlanType   = "6s-monthly" | "pccc-quarterly" | "comprehensive-annual" | "special";

/** Kế hoạch kiểm tra — schema đầy đủ, dễ mở rộng */
type InspectionPlan = {
  id:                string;
  code:              string;
  period:            string;
  type:              PlanType;
  title:             string;
  scope:             string;
  status:            PlanStatus;
  priority?:         PlanPriority;         // normal | high | urgent
  tags?:             string[];             // nhãn tự do
  leadInspector?:    string | null;        // người chủ trì
  plannedStartDate?: string | null;        // ngày bắt đầu kế hoạch
  plannedEndDate?:   string | null;        // ngày kết thúc kế hoạch
  departments:       PlanDepartment[];
  notes:             string;
  customFields?:     Record<string,string>; // trường mở rộng tùy ý
  auditTrail?:       AuditEntry[];          // lịch sử thay đổi
  approvedById:      string | null;
  approvedByName:    string | null;
  approvedAt:        string | null;
  createdById:       string;
  createdByName:     string;
  createdAt:         string;
  updatedAt:         string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const PLAN_TYPES: { value: PlanType; label: string; sub: string; icon: typeof ClipboardList; color: string; bg: string }[] = [
  { value: "6s-monthly", label: "Kiểm tra 6S tháng", sub: "Kiểm tra định kỳ hàng tháng tại các bộ phận", icon: ClipboardList, color: "#1565c0", bg: "#eff6ff" },
  { value: "pccc-quarterly", label: "Kiểm tra PCCC quý", sub: "Kiểm tra phòng cháy chữa cháy định kỳ quý", icon: Flame, color: "#c2410c", bg: "#fff7ed" },
  { value: "comprehensive-annual", label: "Đánh giá tổng hợp", sub: "Đánh giá toàn diện an toàn hàng năm", icon: Shield, color: "#15803d", bg: "#f0fdf4" },
  { value: "special", label: "Kiểm tra đột xuất", sub: "Kiểm tra chuyên đề hoặc đột xuất", icon: AlertCircle, color: "#7c3aed", bg: "#faf5ff" }
];

const TYPE_LABEL: Record<string, string> = {
  "6s-monthly": "6S tháng",
  "pccc-quarterly": "PCCC quý",
  "comprehensive-annual": "Tổng hợp năm",
  "special": "Đột xuất"
};

const STATUS_META: Record<PlanStatus, { label: string; className: string }> = {
  draft:       { label: "Bản nháp",      className: "draft" },
  approved:    { label: "Đã duyệt",      className: "approved" },
  in_progress: { label: "Đang thực hiện",className: "in_progress" },
  completed:   { label: "Hoàn thành",    className: "completed" },
  cancelled:   { label: "Đã hủy",        className: "cancelled" }
};

const DEPT_STATUS_META: Record<DeptStatus, { label: string; dot: string }> = {
  pending:     { label: "Chờ kiểm tra", dot: "pending" },
  in_progress: { label: "Đang kiểm",   dot: "in_progress" },
  done:        { label: "Hoàn thành",  dot: "done" },
  skipped:     { label: "Bỏ qua",      dot: "skipped" }
};

const DIVISIONS = [
  { code: "PED", name: "Khối PED", color: "#1565c0", depts: ["PE1", "MP", "MT", "CM", "WM"] },
  { code: "QAD", name: "Khối QAD", color: "#9c27b0", depts: ["QA", "GA", "QC", "CS", "EHS", "OS"] },
  { code: "DD",  name: "Khối DD",  color: "#00a99d", depts: ["MR", "RF", "DB", "DP1", "DP2"] },
  { code: "SD",  name: "Khối SD",  color: "#22a050", depts: ["OK1", "OK2", "SP1"] },
  { code: "ED",  name: "Khối ED",  color: "#f4511e", depts: ["EBM", "ETR", "MS1", "SA", "MS2"] }
];
const DEPT_TO_DIVISION = new Map<string, typeof DIVISIONS[0]>();
DIVISIONS.forEach((div) => div.depts.forEach((d) => DEPT_TO_DIVISION.set(d, div)));

// EHS-QT-12 Biểu 1 — 6S daily checklist items (static reference)
const CHECKLIST_6S_ITEMS = [
  { id: 1, s: "S2", item: "Vật dụng, tài liệu, dụng cụ... được sắp xếp đúng vị trí đã quy định và có hiển thị rõ ràng để nhận biết." },
  { id: 2, s: "S4", item: "Các vị trí đã được dán băng dính nền theo đúng tiêu chuẩn băng dính dán nền và không bị bong chóc, không rách..." },
  { id: 3, s: "S3", item: "Các khu vực làm việc như nền nhà, lối đi, giá kệ... sạch sẽ và không có bụi bẩn." },
  { id: 4, s: "S1", item: "Các khu vực để chất thải, thùng rác, dụng cụ vệ sinh gọn gàng và được phân loại đúng quy định." },
  { id: 5, s: "S5", item: "Các mục chỉ ra về 6S khi kiểm tra hàng ngày tại bộ phận được khắc phục nhanh chóng." },
];
const S_BADGE_COLOR: Record<string, { bg: string; color: string }> = {
  S1: { bg: "#fff7ed", color: "#c2410c" },
  S2: { bg: "#eff6ff", color: "#1d4ed8" },
  S3: { bg: "#ecfeff", color: "#0e7490" },
  S4: { bg: "#faf5ff", color: "#7e22ce" },
  S5: { bg: "#f0fdf4", color: "#15803d" },
};

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  try {
    return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(s));
  } catch {
    return s;
  }
};
const fmtPeriod = (s: string) => {
  if (!s) return "";
  const [y, m] = s.split("-");
  if (!m) return s;
  return `Tháng ${Number(m)}/${y}`;
};
const currentMonth = () => new Date().toISOString().slice(0, 7);
const currentYear  = () => new Date().getFullYear();

// ─── Helper: progress calc ────────────────────────────────────────────────────

function calcProgress(plan: InspectionPlan) {
  const total = plan.departments.length;
  const done  = plan.departments.filter((d) => d.status === "done" || d.status === "skipped").length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

// ─── Department chip ──────────────────────────────────────────────────────────

function DeptChip({ dept }: { dept: PlanDepartment }) {
  const cls = dept.status === "done" ? "done" : dept.status === "skipped" ? "skipped" : dept.status === "in_progress" ? "in_progress" : "pending";
  return <span className={`iplan-dept-chip ${cls}`}>{dept.deptCode}</span>;
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({ plan, selected, onSelect, onApprove, onDelete, canAdmin }: {
  plan: InspectionPlan;
  selected: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onDelete: () => void;
  canAdmin: boolean;
}) {
  const { total, done, pct } = calcProgress(plan);
  const typeMeta = PLAN_TYPES.find((t) => t.value === plan.type) || PLAN_TYPES[0];
  const Icon = typeMeta.icon;
  const sm = STATUS_META[plan.status] || STATUS_META.draft;

  const stopAndApprove = (e: React.MouseEvent) => { e.stopPropagation(); onApprove(); };
  const stopAndDelete  = (e: React.MouseEvent) => { e.stopPropagation(); onDelete(); };

  return (
    <div className={`iplan-card${selected ? " is-selected" : ""}`} onClick={onSelect}>
      <div className="iplan-card-header">
        <div className="iplan-card-type-badge" style={{ background: typeMeta.bg, color: typeMeta.color }}>
          <Icon size={20} />
        </div>
        <div className="iplan-card-meta">
          <div className="iplan-card-code">{plan.code}</div>
          <div className="iplan-card-title">{plan.title}</div>
          <div className="iplan-card-tags">
            <span className="iplan-tag period">
              <Calendar size={11} />{fmtPeriod(plan.period)}
            </span>
            <span className="iplan-tag type">{TYPE_LABEL[plan.type] || plan.type}</span>
          </div>
        </div>
        <span className={`iplan-status-badge ${sm.className}`}>{sm.label}</span>
      </div>

      <div className="iplan-card-body">
        <div className="iplan-progress-label">
          <span className="iplan-progress-text">Tiến độ bộ phận</span>
          <span className="iplan-progress-count">{done}/{total} ({pct}%)</span>
        </div>
        <div className="iplan-progress-bar-track">
          <div className="iplan-progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="iplan-dept-chips">
          {plan.departments.slice(0, 12).map((d) => <DeptChip key={d.deptCode} dept={d} />)}
          {plan.departments.length > 12 && (
            <span style={{ fontSize: 11, color: "var(--muted,#94a3b8)", fontWeight: 600 }}>
              +{plan.departments.length - 12} khác
            </span>
          )}
          {plan.departments.length === 0 && (
            <span style={{ fontSize: 12, color: "var(--muted,#94a3b8)" }}>Chưa có bộ phận</span>
          )}
        </div>
      </div>

      <div className="iplan-card-footer">
        <div className="iplan-card-info">
          <User size={12} />
          {plan.createdByName} · {fmtDate(plan.createdAt)}
        </div>
        <div className="iplan-card-actions">
          {canAdmin && plan.status === "draft" && (
            <button className="iplan-btn iplan-btn-approve" onClick={stopAndApprove}>
              <ThumbsUp size={13} /> Duyệt
            </button>
          )}
          <button className="iplan-btn iplan-btn-ghost" onClick={onSelect}>
            <ClipboardCheck size={13} /> Chi tiết
          </button>
          {canAdmin && (plan.status === "draft" || plan.status === "cancelled") && (
            <button className="iplan-btn iplan-btn-danger" onClick={stopAndDelete}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Create / Edit Modal ──────────────────────────────────────────────────────

type FormState = {
  period: string;
  type: PlanType;
  title: string;
  scope: string;
  notes: string;
  selectedDepts: string[];
  deptSchedules: Record<string, { scheduledDate: string; inspectorNames: string }>;
};

const defaultForm = (): FormState => ({
  period: currentMonth(),
  type: "6s-monthly",
  title: "",
  scope: "company",
  notes: "",
  selectedDepts: [],
  deptSchedules: {}
});

const formFromPlan = (plan: InspectionPlan): FormState => ({
  period: plan.period,
  type: plan.type,
  title: plan.title,
  scope: plan.scope,
  notes: plan.notes || "",
  selectedDepts: plan.departments.map((d) => d.deptCode),
  deptSchedules: Object.fromEntries(
    plan.departments.map((d) => [
      d.deptCode,
      { scheduledDate: d.scheduledDate || "", inspectorNames: d.inspectorNames.join(", ") }
    ])
  )
});

function PlanFormModal({
  onClose,
  onSaved,
  mode = "create",
  initialPlan
}: {
  onClose: () => void;
  onSaved: (plan: InspectionPlan) => void;
  mode?: "create" | "edit";
  initialPlan?: InspectionPlan;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<FormState>(
    mode === "edit" && initialPlan ? formFromPlan(initialPlan) : defaultForm()
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = mode === "edit";

  const toggleDept = (code: string) => {
    setForm((f) => {
      const sel = f.selectedDepts.includes(code)
        ? f.selectedDepts.filter((c) => c !== code)
        : [...f.selectedDepts, code];
      return { ...f, selectedDepts: sel };
    });
  };

  const toggleAll = () => {
    const all = DIVISIONS.flatMap((d) => d.depts);
    setForm((f) => ({
      ...f,
      selectedDepts: f.selectedDepts.length === all.length ? [] : all
    }));
  };

  const setDeptField = (code: string, field: "scheduledDate" | "inspectorNames", value: string) => {
    setForm((f) => ({
      ...f,
      deptSchedules: {
        ...f.deptSchedules,
        [code]: { ...(f.deptSchedules[code] || { scheduledDate: "", inspectorNames: "" }), [field]: value }
      }
    }));
  };

  const autoTitle = useMemo(() => {
    const label = TYPE_LABEL[form.type] || "Kiểm tra";
    return `Kế hoạch ${label} ${fmtPeriod(form.period)}`;
  }, [form.type, form.period]);

  const handleSubmit = async () => {
    if (!form.period) return setErr("Vui lòng chọn kỳ (tháng/năm).");
    if (form.selectedDepts.length === 0) return setErr("Vui lòng chọn ít nhất một bộ phận.");
    setSaving(true);
    setErr(null);
    try {
      const departments = form.selectedDepts.map((code) => {
        const sched = form.deptSchedules[code] || { scheduledDate: "", inspectorNames: "" };
        const div = DEPT_TO_DIVISION.get(code);
        return {
          deptCode: code,
          deptName: `${code}${div ? ` (${div.name})` : ""}`,
          scheduledDate: sched.scheduledDate || null,
          inspectorNames: sched.inspectorNames
            ? sched.inspectorNames.split(",").map((s) => s.trim()).filter(Boolean)
            : []
        };
      });
      const payload = {
        period: form.period,
        type: form.type,
        title: form.title || autoTitle,
        scope: form.scope,
        notes: form.notes,
        departments
      };
      const saved = isEdit && initialPlan
        ? await putJson<InspectionPlan>(`/api/inspection-plans/${initialPlan.id}`, payload)
        : await postJson<InspectionPlan>("/api/inspection-plans", payload);
      onSaved(saved);
    } catch (e) {
      setErr((e as Error).message || (isEdit ? "Lỗi cập nhật kế hoạch." : "Lỗi tạo kế hoạch."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="iplan-modal-backdrop" onClick={onClose}>
      <div className="iplan-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header (synced with smeet-modal) */}
        <div className="iplan-modal-header">
          <div className="iplan-modal-header-icon"><ClipboardCheck size={18} /></div>
          <div className="iplan-modal-header-info">
            <div className="iplan-modal-header-title">
              {isEdit ? "Sửa kế hoạch kiểm tra" : "Tạo kế hoạch kiểm tra 6S"}
            </div>
            <div className="iplan-modal-header-sub">
              {step === 1 ? "Bước 1 / 2 — Thông tin chung" : "Bước 2 / 2 — Lịch bộ phận"}
            </div>
          </div>
          <div className="iplan-modal-step-dots">
            <div className={`iplan-modal-step-dot${step >= 1 ? " on" : ""}`} />
            <div className={`iplan-modal-step-dot${step >= 2 ? " on" : ""}`} />
          </div>
          <button className="iplan-modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="iplan-modal-body">
          {err && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#dc2626", marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
              <AlertCircle size={15} /> {err}
            </div>
          )}

          {step === 1 && (
            <>
              {/* Type selector */}
              <div className="iplan-form-group">
                <label className="iplan-form-label">Loại kế hoạch <span>*</span></label>
                <div className="iplan-type-grid">
                  {PLAN_TYPES.map((t) => {
                    const TIcon = t.icon;
                    return (
                      <div key={t.value} className={`iplan-type-opt${form.type === t.value ? " selected" : ""}`} onClick={() => setForm((f) => ({ ...f, type: t.value }))}>
                        <div className="iplan-type-opt-icon" style={{ background: t.bg, color: t.color }}>
                          <TIcon size={18} />
                        </div>
                        <div>
                          <div className="iplan-type-opt-title">{t.label}</div>
                          <div className="iplan-type-opt-sub">{t.sub}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="iplan-form-row">
                <div className="iplan-form-group">
                  <label className="iplan-form-label">Kỳ kiểm tra <span>*</span></label>
                  <input
                    type="month"
                    className="iplan-form-input"
                    value={form.period}
                    onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
                  />
                </div>
                <div className="iplan-form-group">
                  <label className="iplan-form-label">Phạm vi</label>
                  <select className="iplan-form-select" value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}>
                    <option value="company">Toàn công ty</option>
                    <option value="division">Theo khối</option>
                    <option value="department">Theo bộ phận</option>
                  </select>
                </div>
              </div>

              <div className="iplan-form-group">
                <label className="iplan-form-label">Tiêu đề kế hoạch</label>
                <input
                  type="text"
                  className="iplan-form-input"
                  placeholder={autoTitle}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>

              <div className="iplan-form-group">
                <label className="iplan-form-label">Ghi chú</label>
                <textarea
                  className="iplan-form-textarea"
                  placeholder="Mục tiêu, yêu cầu đặc biệt của kỳ kiểm tra..."
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </>
          )}

          {step === 2 && (
            <div className="iplan-dept-picker">
              {/* Left — dept checklist */}
              <div className="iplan-dept-left">
                <div className="iplan-select-all-row" onClick={toggleAll}>
                  <input
                    type="checkbox"
                    readOnly
                    checked={form.selectedDepts.length === DIVISIONS.flatMap((d) => d.depts).length}
                    style={{ accentColor: "#1565c0", width: 15, height: 15, cursor: "pointer" }}
                  />
                  Tất cả bộ phận
                </div>
                {DIVISIONS.map((div) => (
                  <div key={div.code} className="iplan-division-group">
                    <div className="iplan-division-label">
                      <div className="iplan-division-dot" style={{ background: div.color }} />
                      {div.name}
                    </div>
                    {div.depts.map((dept) => (
                      <label key={dept} className={`iplan-dept-check-row${form.selectedDepts.includes(dept) ? " checked" : ""}`}>
                        <input
                          type="checkbox"
                          checked={form.selectedDepts.includes(dept)}
                          onChange={() => toggleDept(dept)}
                        />
                        {dept}
                      </label>
                    ))}
                  </div>
                ))}
              </div>

              {/* Right — schedule per selected dept */}
              <div className="iplan-dept-right">
                {form.selectedDepts.length === 0 ? (
                  <div className="iplan-no-dept-selected">
                    <Building2 size={36} strokeWidth={1.2} style={{ color: "#93c5fd" }} />
                    <div style={{ fontWeight: 700, color: "var(--fg,#1e293b)" }}>Chưa chọn bộ phận</div>
                    <div>Chọn bộ phận bên trái để đặt lịch kiểm tra</div>
                  </div>
                ) : (
                  <div className="iplan-dept-schedule-list">
                    {form.selectedDepts.map((code) => {
                      const div = DEPT_TO_DIVISION.get(code);
                      const sched = form.deptSchedules[code] || { scheduledDate: "", inspectorNames: "" };
                      return (
                        <div key={code} className="iplan-dept-schedule-item">
                          <div className="iplan-dept-schedule-name">
                            {div && <div className="div-dot" style={{ background: div.color }} />}
                            <strong>{code}</strong>
                            {div && <span style={{ fontSize: 11, fontWeight: 500, color: "var(--muted,#64748b)" }}>{div.name}</span>}
                          </div>
                          <div className="iplan-dept-fields">
                            <div>
                              <div className="iplan-dept-field-label">Ngày kiểm tra</div>
                              <input
                                type="date"
                                className="iplan-dept-field-input"
                                value={sched.scheduledDate}
                                onChange={(e) => setDeptField(code, "scheduledDate", e.target.value)}
                              />
                            </div>
                            <div>
                              <div className="iplan-dept-field-label">Kiểm tra viên</div>
                              <input
                                type="text"
                                className="iplan-dept-field-input"
                                placeholder="Nguyễn A, Trần B"
                                value={sched.inspectorNames}
                                onChange={(e) => setDeptField(code, "inspectorNames", e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="iplan-modal-footer">
          <button className="iplan-btn iplan-btn-ghost" onClick={step === 1 ? onClose : () => setStep(1)}>
            {step === 1 ? "Hủy" : "← Quay lại"}
          </button>
          <div className="iplan-modal-footer-right">
            {step === 1 ? (
              <button className="iplan-btn iplan-btn-primary" onClick={() => setStep(2)}>
                Tiếp theo → Chọn bộ phận
              </button>
            ) : (
              <button className="iplan-btn iplan-btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving
                  ? <><Loader2 size={14} className="animate-spin" /> Đang lưu...</>
                  : isEdit
                    ? <><CheckCircle2 size={14} /> Lưu thay đổi</>
                    : <><CheckCircle2 size={14} /> Tạo kế hoạch</>
                }
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({ plan: initialPlan, onClose, canAdmin, onUpdate }: {
  plan: InspectionPlan;
  onClose: () => void;
  canAdmin: boolean;
  onUpdate: (plan: InspectionPlan) => void;
}) {
  const [plan, setPlan] = useState<InspectionPlan>(initialPlan);
  const [deptEdits, setDeptEdits] = useState<Record<string, { actualDate: string; inspectorNames: string; score: string; findings: string }>>({});
  const [savingDept, setSavingDept] = useState<string | null>(null);
  const [approvingSaving, setApprovingSaving] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [deptTab, setDeptTab] = useState<"checklist" | "evidence">("checklist");

  // Default to first dept that has overdue/critical issues, else first dept
  const firstHot = plan.departments.find(d =>
    (d.corrective ?? []).some(c => c.status === "overdue" || c.severity === "critical" || c.severity === "high")
  );
  const [selectedDeptCode, setSelectedDeptCode] = useState<string>(
    firstHot?.deptCode || plan.departments[0]?.deptCode || ""
  );

  useEffect(() => { setPlan(initialPlan); }, [initialPlan.id, initialPlan.status, initialPlan.updatedAt]);

  const { total, done, pct } = calcProgress(plan);
  const sm = STATUS_META[plan.status] || STATUS_META.draft;
  const typeMeta = PLAN_TYPES.find((t) => t.value === plan.type) || PLAN_TYPES[0];
  const Icon = typeMeta.icon;

  // Hot-warning calculation
  const allCritical = plan.departments.flatMap(d =>
    (d.corrective ?? []).filter(c => c.severity === "critical" || c.severity === "high")
  );
  const allOverdue = plan.departments.flatMap(d =>
    (d.corrective ?? []).filter(c => c.status === "overdue")
  );
  const isHot = allCritical.length >= 2 || allOverdue.length >= 1;

  const selectedDept = plan.departments.find(d => d.deptCode === selectedDeptCode) ?? plan.departments[0];
  const canEdit = canAdmin || plan.status === "approved" || plan.status === "in_progress";

  const ensureDeptEdit = (code: string) => {
    setDeptEdits(e => {
      if (e[code]) return e;
      const dept = plan.departments.find(d => d.deptCode === code);
      if (!dept) return e;
      return { ...e, [code]: { actualDate: dept.actualDate || "", inspectorNames: dept.inspectorNames.join(", "), score: dept.score !== null ? String(dept.score) : "", findings: dept.findings || "" } };
    });
  };

  const setDeptEdit = (code: string, field: string, value: string) => {
    setDeptEdits(e => ({ ...e, [code]: { ...(e[code] || { actualDate: "", inspectorNames: "", score: "", findings: "" }), [field]: value } }));
  };

  const saveDept = async (code: string, status: DeptStatus) => {
    setSavingDept(code);
    try {
      const edit = deptEdits[code] || { actualDate: "", inspectorNames: selectedDept?.inspectorNames.join(", ") ?? "", score: "", findings: "" };
      const updated = await patchJson<InspectionPlan>(`/api/inspection-plans/${plan.id}/departments/${code}`, {
        status,
        actualDate: edit.actualDate || null,
        inspectorNames: edit.inspectorNames ? edit.inspectorNames.split(",").map(s => s.trim()).filter(Boolean) : [],
        score: edit.score ? Number(edit.score) : null,
        findings: edit.findings || ""
      });
      setPlan(updated);
      onUpdate(updated);
    } catch { /* silently ignore */ }
    finally { setSavingDept(null); }
  };

  const handleApprove = async () => {
    setApprovingSaving(true);
    try {
      const updated = await postJson<InspectionPlan>(`/api/inspection-plans/${plan.id}/approve`, {});
      setPlan(updated); onUpdate(updated);
    } catch { /* ignore */ }
    finally { setApprovingSaving(false); }
  };

  const selectDept = (code: string) => {
    setSelectedDeptCode(code);
    setDeptTab("checklist");
    ensureDeptEdit(code);
  };

  // On mount: init edit state for the default selected dept
  useEffect(() => { if (selectedDeptCode) ensureDeptEdit(selectedDeptCode); }, []); // eslint-disable-line

  const edit = deptEdits[selectedDept?.deptCode ?? ""] || {
    actualDate: selectedDept?.actualDate || "",
    inspectorNames: (selectedDept?.inspectorNames ?? []).join(", "),
    score: selectedDept?.score !== null && selectedDept?.score !== undefined ? String(selectedDept.score) : "",
    findings: selectedDept?.findings || ""
  };
  const isSavingSelected = savingDept === selectedDept?.deptCode;
  const div = selectedDept ? DEPT_TO_DIVISION.get(selectedDept.deptCode) : null;
  const dSm = selectedDept ? DEPT_STATUS_META[selectedDept.status] || DEPT_STATUS_META.pending : DEPT_STATUS_META.pending;

  return (
    <>
      <div className="iplan-detail-overlay" onClick={onClose} />
      <div className="iplan-detail-panel">

        {/* ── Blue gradient header ──────────────────────────── */}
        <div className="iplan-dm-header">
          <div className="iplan-dm-header-top">
            <div className="iplan-dm-header-icon">
              <Icon size={20} />
            </div>
            <div className="iplan-dm-header-info">
              <div className="iplan-dm-header-tags">
                <span className="iplan-dm-code">{plan.code}</span>
                <span className={`iplan-status-badge ${sm.className}`}>{sm.label}</span>
                <span className="iplan-tag period"><Calendar size={10} />{fmtPeriod(plan.period)}</span>
                {plan.priority && plan.priority !== "normal" && (
                  <span className={`iplan-priority-badge ${plan.priority}`} style={{ fontSize: 11 }}>
                    {plan.priority === "urgent" ? "🔴 Khẩn" : "🟠 Ưu tiên cao"}
                  </span>
                )}
              </div>
              <div className="iplan-dm-title">{plan.title}</div>
              <div className="iplan-dm-header-meta">
                {plan.leadInspector && <span><User size={11} /> {plan.leadInspector}</span>}
                {plan.plannedStartDate && <span><CalendarClock size={11} /> {fmtDate(plan.plannedStartDate)}{plan.plannedEndDate ? ` – ${fmtDate(plan.plannedEndDate)}` : ""}</span>}
                <span><Building2 size={11} /> {total} bộ phận</span>
              </div>
            </div>
            <button className="iplan-dm-close" onClick={onClose}><X size={15} /></button>
          </div>

          {/* Stat bar */}
          <div className="iplan-dm-stat-bar">
            {[
              { val: String(total), label: "Bộ phận",     hi: "" },
              { val: String(done),  label: "Hoàn thành",  hi: done > 0 ? "green" : "" },
              { val: String(total - done), label: "Còn lại", hi: total - done > 0 ? "orange" : "" },
              { val: `${pct}%`,    label: "Tiến độ",     hi: pct === 100 ? "green" : "" },
              { val: String(allCritical.length), label: "Lỗi nghiêm trọng", hi: allCritical.length > 0 ? "red" : "" },
              { val: String(allOverdue.length),  label: "Quá hạn",          hi: allOverdue.length  > 0 ? "red" : "" },
            ].map((s, i) => (
              <div key={i} className="iplan-dm-stat-item">
                <div className={`iplan-dm-stat-val ${s.hi}`}>{s.val}</div>
                <div className="iplan-dm-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Hot warning ───────────────────────────────────── */}
        {isHot && (
          <div className="iplan-dm-hotwarn">
            <div className="iplan-dm-hotwarn-bar">
              <Flame size={14} />
              <span>Cảnh báo nóng — Cần xử lý ngay!</span>
            </div>
            <div className="iplan-dm-hotwarn-body">
              <div className="iplan-dm-hotwarn-counts">
                <div className="iplan-dm-hotwarn-num red">{allCritical.length}</div>
                <div className="iplan-dm-hotwarn-lbl">Lỗi nghiêm trọng</div>
              </div>
              <div className="iplan-dm-hotwarn-div" />
              <div className="iplan-dm-hotwarn-counts">
                <div className="iplan-dm-hotwarn-num orange">{allOverdue.length}</div>
                <div className="iplan-dm-hotwarn-lbl">Quá hạn xử lý</div>
              </div>
              <div className="iplan-dm-hotwarn-div" />
              <p className="iplan-dm-hotwarn-msg">
                {allOverdue.length > 0
                  ? <>Có <strong>{allOverdue.length}</strong> lỗi chưa xử lý quá hạn. Yêu cầu trưởng bộ phận xác nhận trong <strong>24h</strong>.</>
                  : <>Phát hiện <strong>{allCritical.length}</strong> lỗi mức cao/nghiêm trọng cần khắc phục khẩn cấp.</>
                }
              </p>
            </div>
          </div>
        )}

        {/* ── Progress bar ──────────────────────────────────── */}
        <div className="iplan-dm-progress-wrap">
          <div className="iplan-progress-bar-track">
            <div className="iplan-progress-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* ── 2-column body ─────────────────────────────────── */}
        <div className="iplan-dm-body">

          {/* LEFT: dept list */}
          <div className="iplan-dm-left">
            <div className="iplan-dm-left-header">
              <Building2 size={11} /> Bộ phận ({total})
            </div>
            {plan.departments.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--muted,#94a3b8)", textAlign: "center", padding: "20px 8px" }}>Chưa có bộ phận nào.</div>
            )}
            {plan.departments.map(dept => {
              const dv = DEPT_TO_DIVISION.get(dept.deptCode);
              const isActive = dept.deptCode === selectedDeptCode;
              const hasIssue = (dept.corrective ?? []).some(c => c.status === "overdue" || c.severity === "high" || c.severity === "critical");
              const dsm = DEPT_STATUS_META[dept.status] || DEPT_STATUS_META.pending;
              return (
                <button
                  key={dept.deptCode}
                  className={`iplan-dm-left-item${isActive ? " active" : ""}`}
                  onClick={() => selectDept(dept.deptCode)}
                >
                  <div className="iplan-dm-left-dot" style={{ background: dv?.color || "#94a3b8" }} />
                  <div className="iplan-dm-left-text">
                    <span className="iplan-dm-left-code">{dept.deptCode}</span>
                    <span className="iplan-dm-left-sub">{dv?.code || ""} · {dept.scheduledDate ? fmtDate(dept.scheduledDate) : "—"}</span>
                  </div>
                  {hasIssue
                    ? <AlertCircle size={13} style={{ color: "#ef4444", flexShrink: 0 }} />
                    : dept.status === "done"
                      ? <CheckCircle2 size={13} style={{ color: "#22c55e", flexShrink: 0 }} />
                      : <span className={`iplan-dept-row-dot ${dsm.dot}`} style={{ flexShrink: 0 }} />
                  }
                </button>
              );
            })}
          </div>

          {/* RIGHT: selected dept detail */}
          <div className="iplan-dm-right">
            {selectedDept ? (
              <>
                {/* Dept header */}
                <div className="iplan-dm-dept-header">
                  <div className="iplan-dm-dept-title-row">
                    <div className="iplan-dm-dept-color-dot" style={{ background: div?.color || "#94a3b8" }} />
                    <div className="iplan-dm-dept-name">{selectedDept.deptCode} — {selectedDept.deptName}</div>
                    <span className={`iplan-dept-chip ${selectedDept.status === "done" ? "done" : selectedDept.status === "skipped" ? "skipped" : selectedDept.status === "in_progress" ? "in_progress" : "pending"}`}>
                      {dSm.label}
                    </span>
                    {selectedDept.score !== null && selectedDept.score !== undefined && (
                      <span className="iplan-score-pill"><Star size={11} />{selectedDept.score}</span>
                    )}
                  </div>
                  <div className="iplan-dm-dept-meta">
                    {selectedDept.timeStart && selectedDept.timeEnd && <span>🕐 {selectedDept.timeStart} – {selectedDept.timeEnd}</span>}
                    {(selectedDept.leadInspectorName || selectedDept.inspectorNames.length > 0) && (
                      <span><User size={11} /> {selectedDept.leadInspectorName || selectedDept.inspectorNames[0]}</span>
                    )}
                    {selectedDept.signedOffByName && (
                      <span className="iplan-dm-signed">✅ Ký: {selectedDept.signedOffByName}</span>
                    )}
                    {selectedDept.actualDate && <span><CalendarClock size={11} /> {fmtDate(selectedDept.actualDate)}</span>}
                  </div>
                </div>

                {/* Score progress bar */}
                {selectedDept.score !== null && selectedDept.score !== undefined && (
                  <div className="iplan-dm-score-wrap">
                    <div className="iplan-progress-bar-track" style={{ height: 8 }}>
                      <div className="iplan-progress-bar-fill" style={{ width: `${selectedDept.score}%` }} />
                    </div>
                    <span className="iplan-dm-score-label">{selectedDept.score}/100</span>
                  </div>
                )}

                {/* Tabs */}
                <div className="iplan-dm-tabs">
                  <button className={`iplan-dm-tab${deptTab === "checklist" ? " active" : ""}`} onClick={() => setDeptTab("checklist")}>
                    📋 Nội dung 6S
                  </button>
                  <button className={`iplan-dm-tab${deptTab === "evidence" ? " active" : ""}`} onClick={() => setDeptTab("evidence")}>
                    📎 Bằng chứng {(selectedDept.evidenceRefs?.length ?? 0) > 0 ? `(${selectedDept.evidenceRefs!.length})` : ""}
                  </button>
                </div>

                {/* Tab: Nội dung 6S */}
                {deptTab === "checklist" && (
                  <div className="iplan-dm-tab-body">

                    {/* EHS-QT-12 checklist items */}
                    <div className="iplan-dm-section-label">Biểu EHS-QT-12 · Kiểm tra 6S hàng ngày</div>
                    {CHECKLIST_6S_ITEMS.map(ci => {
                      const sc = S_BADGE_COLOR[ci.s] || { bg: "#f1f5f9", color: "#475569" };
                      const hasCorr = (selectedDept.corrective ?? []).some(ca =>
                        ca.finding.toLowerCase().includes(ci.s.toLowerCase()) || false
                      );
                      return (
                        <div key={ci.id} className={`iplan-6s-item${hasCorr ? " flagged" : ""}`}>
                          <span className="iplan-6s-badge" style={{ background: sc.bg, color: sc.color }}>{ci.s}</span>
                          <span className="iplan-6s-text">{ci.item}</span>
                          {selectedDept.status === "done" && !hasCorr
                            ? <CheckCircle2 size={14} style={{ color: "#22c55e", flexShrink: 0 }} />
                            : selectedDept.status !== "pending" && hasCorr
                              ? <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
                              : null
                          }
                        </div>
                      );
                    })}

                    <a
                      href="tai lieu/Biểu kiểm tra 6S hàng ngày/Bieu kiem tra 6S hang ngay.pdf"
                      target="_blank" rel="noopener noreferrer"
                      className="iplan-6s-link"
                    >
                      <Link2 size={12} /> Xem biểu mẫu gốc EHS-QT-12 (PDF)
                    </a>

                    {/* Corrective actions */}
                    {(selectedDept.corrective?.length ?? 0) > 0 && (
                      <div className="iplan-corrective-list" style={{ marginTop: 12 }}>
                        <div className="iplan-corrective-header">
                          <AlertCircle size={12} /> Lỗi phát hiện — cần khắc phục ({selectedDept.corrective!.length})
                        </div>
                        {selectedDept.corrective!.map(ca => (
                          <div key={ca.id} className="iplan-corrective-item">
                            <div className="iplan-corrective-top">
                              <span className={`iplan-sev ${ca.severity}`}>{
                                ca.severity === "critical" ? "Nguy hiểm" : ca.severity === "high" ? "Cao" : ca.severity === "medium" ? "TB" : "Thấp"
                              }</span>
                              <span className="iplan-corrective-finding">{ca.finding}</span>
                              <span className={`iplan-ca-status ${ca.status}`}>{
                                ca.status === "resolved" ? "✓ Xong" : ca.status === "overdue" ? "⚠ Quá hạn" : "Đang mở"
                              }</span>
                            </div>
                            <div className="iplan-corrective-action">→ {ca.action} · <em>{ca.responsible}</em>
                              {ca.dueDate && <span style={{ marginLeft: 8, color: "#94a3b8", fontSize: 11 }}>Hạn: {fmtDate(ca.dueDate)}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Edit fields */}
                    {canEdit && (
                      <div className="iplan-dm-edit-section">
                        <div className="iplan-dm-section-label" style={{ marginBottom: 8 }}>Cập nhật kết quả</div>
                        <div className="iplan-dept-row-fields">
                          <div className="iplan-dept-row-field">
                            <label>Ngày thực tế</label>
                            <input type="date" value={edit.actualDate} onChange={e => setDeptEdit(selectedDept.deptCode, "actualDate", e.target.value)} />
                          </div>
                          <div className="iplan-dept-row-field">
                            <label>Điểm (0-100)</label>
                            <input type="number" min={0} max={100} placeholder="—" value={edit.score} onChange={e => setDeptEdit(selectedDept.deptCode, "score", e.target.value)} />
                          </div>
                          <div className="iplan-dept-row-field" style={{ gridColumn: "1/-1" }}>
                            <label>Kiểm tra viên</label>
                            <input type="text" placeholder="Nguyễn A, Trần B" value={edit.inspectorNames} onChange={e => setDeptEdit(selectedDept.deptCode, "inspectorNames", e.target.value)} />
                          </div>
                          <div className="iplan-dept-row-field" style={{ gridColumn: "1/-1" }}>
                            <label>Phát hiện / Ghi chú</label>
                            <textarea rows={2} placeholder="Mô tả sai lỗi, điểm cần cải thiện..." value={edit.findings} onChange={e => setDeptEdit(selectedDept.deptCode, "findings", e.target.value)} style={{ resize: "vertical" }} />
                          </div>
                        </div>
                        <div className="iplan-dept-row-actions">
                          {selectedDept.status !== "done" && selectedDept.status !== "skipped" ? (
                            <>
                              <button className="iplan-dept-status-btn done-btn" onClick={() => saveDept(selectedDept.deptCode, "done")} disabled={isSavingSelected}>
                                {isSavingSelected ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Hoàn thành
                              </button>
                              <button className="iplan-dept-status-btn skip-btn" onClick={() => saveDept(selectedDept.deptCode, "skipped")} disabled={isSavingSelected}>
                                <XCircle size={12} /> Bỏ qua
                              </button>
                            </>
                          ) : (
                            <button className="iplan-dept-status-btn" style={{ background: "#f1f5f9", borderColor: "#cbd5e1", color: "#475569" }} onClick={() => saveDept(selectedDept.deptCode, "pending")} disabled={isSavingSelected}>
                              Đặt lại → Chờ
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Findings note (read-only display) */}
                    {selectedDept.findings && !canEdit && (
                      <div className="iplan-dm-findings-note">
                        <div className="iplan-dm-section-label">Nhận xét chung</div>
                        <p>{selectedDept.findings}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab: Bằng chứng */}
                {deptTab === "evidence" && (
                  <div className="iplan-dm-tab-body">
                    {(selectedDept.evidenceRefs?.length ?? 0) === 0 ? (
                      <div className="iplan-dm-evidence-empty">
                        <Paperclip size={28} />
                        <p>Chưa có bằng chứng đính kèm</p>
                        <span>Ảnh và tài liệu sẽ xuất hiện ở đây</span>
                      </div>
                    ) : (
                      <div className="iplan-ev-grid">
                        {selectedDept.evidenceRefs!.map((ref, i) => {
                          const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(ref);
                          return (
                            <div key={i} className="iplan-ev-cell">
                              <span style={{ fontSize: 22 }}>{isImg ? "🖼️" : "📄"}</span>
                              <span className="iplan-ev-name">{ref}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <button className="iplan-dm-upload-btn">
                      <Paperclip size={13} /> Đính kèm ảnh / tài liệu
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted,#94a3b8)", fontSize: 13 }}>
                Chọn bộ phận ở bên trái để xem chi tiết
              </div>
            )}
          </div>
        </div>

        {/* ── Audit trail (collapsible) ─────────────────────── */}
        {(plan.auditTrail?.length ?? 0) > 0 && (
          <div className="iplan-dm-audit">
            <button className="iplan-dm-audit-toggle" onClick={() => setShowAudit(v => !v)}>
              <ClipboardCheck size={12} />
              <span>Lịch sử thay đổi ({plan.auditTrail!.length})</span>
              {showAudit ? <ChevronDown size={13} style={{ marginLeft: "auto" }} /> : <ChevronRight size={13} style={{ marginLeft: "auto" }} />}
            </button>
            {showAudit && (
              <div className="iplan-dm-audit-rows">
                {plan.auditTrail!.slice().reverse().map((e, i) => (
                  <div key={i} className="iplan-audit-row">
                    <span className="iplan-audit-dot" />
                    <span className="iplan-audit-action">{e.action}</span>
                    <span className="iplan-audit-by">{e.by}</span>
                    <span className="iplan-audit-at">{fmtDate(e.at)}</span>
                    {e.note && <span className="iplan-audit-note">{e.note}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────── */}
        <div className="iplan-detail-footer">
          {plan.approvedByName && (
            <div style={{ fontSize: 12, color: "var(--muted,#64748b)", display: "flex", gap: 5, alignItems: "center" }}>
              <CalendarCheck2 size={13} />
              Duyệt bởi <strong>{plan.approvedByName}</strong> · {fmtDate(plan.approvedAt)}
            </div>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {canAdmin && plan.status === "draft" && (
              <>
                <button className="iplan-btn iplan-btn-approve" onClick={handleApprove} disabled={approvingSaving}>
                  {approvingSaving ? <Loader2 size={13} className="animate-spin" /> : <ThumbsUp size={13} />}
                  Duyệt
                </button>
                <button className="iplan-btn iplan-btn-ghost" onClick={() => setShowEdit(true)}>
                  <Edit2 size={13} /> Sửa
                </button>
              </>
            )}
            <button className="iplan-btn iplan-btn-ghost iplan-print-hide" onClick={() => window.print()}>
              <Printer size={13} /> In / PDF
            </button>
            <button className="iplan-btn iplan-btn-ghost iplan-print-hide" onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>
      </div>

      {showEdit && (
        <PlanFormModal
          mode="edit"
          initialPlan={plan}
          onClose={() => setShowEdit(false)}
          onSaved={updated => { setPlan(updated); onUpdate(updated); setShowEdit(false); }}
        />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SafetyInspectionPlanPage() {
  const [plans, setPlans]           = useState<InspectionPlan[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<unknown>(null);
  const [view, setView]             = useState<"list" | "grid">("list");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected]     = useState<InspectionPlan | null>(null);
  const [filterYear, setFilterYear] = useState<string>(String(currentYear()));
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterType, setFilterType]     = useState<string>("");
  const [filterDiv, setFilterDiv]       = useState<string>("ALL");
  const [search, setSearch]             = useState("");
  const [showDivStats, setShowDivStats] = useState(false);

  const canAdmin = true; // All logged-in safety users can see; restrict create/approve in UI

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filterYear) params.set("year", filterYear);
      if (filterStatus) params.set("status", filterStatus);
      if (filterType) params.set("type", filterType);
      const payload = await apiFetch<{ items: InspectionPlan[]; total: number }>(`/api/inspection-plans?${params}`);
      setPlans(Array.isArray(payload.items) ? payload.items : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [filterYear, filterStatus, filterType]);

  useEffect(() => { load(); }, [load]);

  const displayed = useMemo(() => {
    let result = plans;
    if (filterDiv !== "ALL") {
      const divDepts = new Set(DIVISIONS.find((d) => d.code === filterDiv)?.depts || []);
      result = result.filter((p) => p.departments.some((d) => divDepts.has(d.deptCode)));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.period.includes(q)
      );
    }
    return result;
  }, [plans, search, filterDiv]);

  const stats = useMemo(() => ({
    total:     plans.length,
    approved:  plans.filter((p) => p.status === "approved").length,
    inProgress:plans.filter((p) => p.status === "in_progress").length,
    completed: plans.filter((p) => p.status === "completed").length,
    deptsCovered: [...new Set(plans.flatMap((p) => p.departments.map((d) => d.deptCode)))].length
  }), [plans]);

  const divStats = useMemo(() => {
    return DIVISIONS.map((div) => {
      const divDeptSet = new Set(div.depts);
      const depts = plans.flatMap((p) => p.departments.filter((d) => divDeptSet.has(d.deptCode)));
      const total = depts.length;
      const done  = depts.filter((d) => d.status === "done" || d.status === "skipped").length;
      const scores = depts.map((d) => d.score).filter((s): s is number => s !== null);
      const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      const pct = total ? Math.round((done / total) * 100) : 0;
      return { ...div, total, done, pct, avg };
    });
  }, [plans]);

  const handleCreated = (plan: InspectionPlan) => {
    setShowCreate(false);
    setPlans((prev) => [plan, ...prev]);
    setSelected(plan);
  };

  const handleExportCSV = () => {
    const headers = ["Mã", "Tiêu đề", "Kỳ", "Loại", "Trạng thái", "Bộ phận", "Hoàn thành", "Tiến độ %", "Điểm TB", "Người tạo", "Ngày tạo"];
    const rows = displayed.map((p) => {
      const { total, done, pct } = calcProgress(p);
      const scores = p.departments.map((d) => d.score).filter((s): s is number => s !== null);
      const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : "";
      return [
        p.code,
        p.title,
        fmtPeriod(p.period),
        TYPE_LABEL[p.type] || p.type,
        STATUS_META[p.status]?.label || p.status,
        total,
        done,
        pct,
        avgScore,
        p.createdByName,
        fmtDate(p.createdAt)
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ke-hoach-kiem-tra-${filterYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpdate = (plan: InspectionPlan) => {
    setPlans((prev) => prev.map((p) => p.id === plan.id ? plan : p));
    if (selected?.id === plan.id) setSelected(plan);
  };

  const handleApprove = async (plan: InspectionPlan) => {
    try {
      const updated = await postJson<InspectionPlan>(`/api/inspection-plans/${plan.id}/approve`, {});
      handleUpdate(updated);
    } catch {
      // ignore
    }
  };

  const handleDelete = async (plan: InspectionPlan) => {
    if (!confirm(`Xóa kế hoạch "${plan.code}"?`)) return;
    try {
      await deleteJson(`/api/inspection-plans/${plan.id}`);
      setPlans((prev) => prev.filter((p) => p.id !== plan.id));
      if (selected?.id === plan.id) setSelected(null);
    } catch {
      // ignore
    }
  };

  const years = useMemo(() => {
    const y = currentYear();
    return [y - 1, y, y + 1].map(String);
  }, []);

  return (
    <div className="iplan-shell">
      {/* Hero */}
      <div className="iplan-hero">
        <div className="iplan-hero-top">
          <div className="iplan-hero-title-row">
            <div className="iplan-hero-icon"><ClipboardCheck size={24} /></div>
            <div>
              <h1 className="iplan-hero-title">Kế hoạch kiểm tra 6S</h1>
              <p className="iplan-hero-sub">Lập lịch, theo dõi và đánh giá tiến độ kiểm tra định kỳ toàn bộ phận</p>
            </div>
          </div>
          <button className="iplan-hero-btn" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Tạo kế hoạch mới
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="iplan-stats">
        <div className="iplan-stat-card">
          <div className="iplan-stat-icon blue"><ClipboardList size={20} /></div>
          <div>
            <div className="iplan-stat-val">{stats.total}</div>
            <div className="iplan-stat-label">Kế hoạch {filterYear}</div>
          </div>
        </div>
        <div className="iplan-stat-card">
          <div className="iplan-stat-icon orange"><CalendarClock size={20} /></div>
          <div>
            <div className="iplan-stat-val">{stats.inProgress}</div>
            <div className="iplan-stat-label">Đang thực hiện</div>
          </div>
        </div>
        <div className="iplan-stat-card">
          <div className="iplan-stat-icon green"><CheckCircle2 size={20} /></div>
          <div>
            <div className="iplan-stat-val">{stats.completed}</div>
            <div className="iplan-stat-label">Đã hoàn thành</div>
          </div>
        </div>
        <div className="iplan-stat-card" style={{ cursor: "pointer" }} onClick={() => setShowDivStats((v) => !v)}>
          <div className="iplan-stat-icon purple"><Building2 size={20} /></div>
          <div style={{ flex: 1 }}>
            <div className="iplan-stat-val">{stats.deptsCovered}</div>
            <div className="iplan-stat-label">Bộ phận · xem thống kê →</div>
          </div>
        </div>
      </div>

      {/* Division Stats Panel */}
      {showDivStats && plans.length > 0 && (
        <div className="iplan-div-stats-panel">
          <div className="iplan-div-stats-header">
            <Star size={13} />
            Thống kê tiến độ theo khối — {filterYear}
            <button className="iplan-div-stats-close" onClick={() => setShowDivStats(false)}><X size={13} /></button>
          </div>
          <div className="iplan-div-stats-grid">
            {divStats.map((div) => (
              <div
                key={div.code}
                className={`iplan-div-stat-row${filterDiv === div.code ? " active" : ""}`}
                style={{ "--div-color": div.color } as React.CSSProperties}
                onClick={() => setFilterDiv(filterDiv === div.code ? "ALL" : div.code)}
              >
                <div className="iplan-div-stat-top">
                  <div className="iplan-div-dot" style={{ background: div.color }} />
                  <span className="iplan-div-name">{div.name}</span>
                  <span className="iplan-div-count">{div.done}/{div.total}</span>
                  {div.avg !== null && (
                    <span className="iplan-div-score"><Star size={10} />{div.avg}</span>
                  )}
                  <span className="iplan-div-pct" style={{ color: div.pct === 100 ? "#16a34a" : div.pct >= 60 ? "#d97706" : "#64748b" }}>
                    {div.pct}%
                  </span>
                </div>
                <div className="iplan-div-bar-track">
                  <div className="iplan-div-bar-fill" style={{ width: `${div.pct}%`, background: div.color }} />
                </div>
                <div className="iplan-div-chips">
                  {div.depts.map((dc) => {
                    const dept = plans.flatMap((p) => p.departments).find((d) => d.deptCode === dc);
                    const s = dept?.status || "pending";
                    return (
                      <span key={dc} className={`iplan-dept-chip ${s === "done" || s === "skipped" ? "done" : s === "in_progress" ? "in_progress" : "pending"}`}>
                        {dc}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="iplan-toolbar">
        {/* Division filter pills */}
        <div className="iplan-div-filter-row iplan-print-hide">
          {[{ code: "ALL", name: "Tất cả", color: "#475569" }, ...DIVISIONS.map((d) => ({ code: d.code, name: d.code, color: d.color }))].map((d) => (
            <button
              key={d.code}
              className={`iplan-div-pill${filterDiv === d.code ? " active" : ""}`}
              style={{ "--pill-color": d.color } as React.CSSProperties}
              onClick={() => setFilterDiv(d.code)}
            >
              {d.name}
            </button>
          ))}
        </div>

        <div className="iplan-filter-row">
          <select className="iplan-select" value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="iplan-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            <option value="draft">Bản nháp</option>
            <option value="approved">Đã duyệt</option>
            <option value="in_progress">Đang thực hiện</option>
            <option value="completed">Hoàn thành</option>
            <option value="cancelled">Đã hủy</option>
          </select>
          <select className="iplan-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">Tất cả loại</option>
            <option value="6s-monthly">6S tháng</option>
            <option value="pccc-quarterly">PCCC quý</option>
            <option value="comprehensive-annual">Tổng hợp năm</option>
            <option value="special">Đột xuất</option>
          </select>
          <div className="iplan-search-wrap">
            <Search size={15} className="iplan-search-ico" />
            <input
              type="text"
              className="iplan-search"
              placeholder="Tìm kiếm mã, tiêu đề, kỳ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="iplan-view-btns">
          <button className={`iplan-view-btn${view === "list" ? " active" : ""}`} onClick={() => setView("list")} title="Danh sách">
            <LayoutList size={16} />
          </button>
          <button className={`iplan-view-btn${view === "grid" ? " active" : ""}`} onClick={() => setView("grid")} title="Lưới">
            <Grid3x3 size={16} />
          </button>
        </div>
        {displayed.length > 0 && (
          <button className="iplan-btn iplan-btn-ghost iplan-export-btn iplan-print-hide" onClick={handleExportCSV} title="Xuất CSV">
            <FileDown size={15} /> CSV
          </button>
        )}
      </div>

      {/* Content */}
      {loading && <LoadingPanel label="Đang tải kế hoạch kiểm tra..." />}
      {!loading && error && <ErrorPanel error={error} />}
      {!loading && !error && displayed.length === 0 && (
        <div className="iplan-empty">
          <ClipboardCheck size={52} className="iplan-empty-icon" strokeWidth={1.2} />
          <div className="iplan-empty-title">Chưa có kế hoạch kiểm tra</div>
          <div className="iplan-empty-sub">
            {search ? "Không tìm thấy kết quả phù hợp." : `Chưa có kế hoạch nào trong năm ${filterYear}. Nhấn "Tạo kế hoạch mới" để bắt đầu.`}
          </div>
          {!search && (
            <button className="iplan-btn iplan-btn-primary" style={{ marginTop: 4 }} onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Tạo kế hoạch đầu tiên
            </button>
          )}
        </div>
      )}

      {!loading && !error && displayed.length > 0 && (
        <div className={view === "grid" ? "iplan-grid" : "iplan-list"}>
          {displayed.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              selected={selected?.id === plan.id}
              onSelect={() => setSelected(selected?.id === plan.id ? null : plan)}
              onApprove={() => handleApprove(plan)}
              onDelete={() => handleDelete(plan)}
              canAdmin={canAdmin}
            />
          ))}
        </div>
      )}

      {/* Detail Panel */}
      {selected && (
        <DetailPanel
          plan={selected}
          onClose={() => setSelected(null)}
          canAdmin={canAdmin}
          onUpdate={handleUpdate}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <PlanFormModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={handleCreated}
        />
      )}
    </div>
  );
}

export default SafetyInspectionPlanPage;
