import {
  AlertCircle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  ClipboardList,
  Database,
  FileText,
  Flame,
  ListChecks,
  Loader2,
  MapPin,
  Megaphone,
  MessageSquare,
  Plus,
  Printer,
  Search,
  Shield,
  Trash2,
  User,
  Users,
  X,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, postJson, putJson, patchJson, deleteJson } from "./safety-api";
import { ErrorPanel, LoadingPanel } from "./safety-shared";
import "./safety-meeting.css";

// ─── Types ───────────────────────────────────────────────────────────────────
type MeetingType = "monthly" | "quarterly" | "emergency" | "kyt-review";
type MeetingStatus = "planned" | "completed" | "cancelled";
type ActionStatus = "open" | "closed" | "overdue";

type AgendaItem = {
  id: string;
  order: number;
  topic: string;
  presenter: string;
  duration: number;
  notes: string;
};

type ActionItem = {
  id: string;
  order: number;
  content: string;
  assignee: string;
  dueDate: string | null;
  status: ActionStatus;
  completedAt: string | null;
};

type SafetyMeeting = {
  id: string;
  code: string;
  period: string;
  type: MeetingType;
  title: string;
  meetingDate: string | null;
  startTime: string;
  endTime: string;
  location: string;
  chairperson: string;
  participants: string[];
  agenda: AgendaItem[];
  contentSummary: string;
  decisions: string;
  actionItems: ActionItem[];
  attachedPlanId: string | null;
  status: MeetingStatus;
  approvedByName: string | null;
  approvedAt: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const MEETING_TYPES: {
  value: MeetingType; label: string; sub: string;
  icon: typeof Shield; color: string; bg: string; iconCls: string;
}[] = [
  { value: "monthly",    label: "Họp an toàn tháng",  sub: "Cuộc họp an toàn định kỳ hàng tháng",     icon: Shield,    color: "#2563eb", bg: "#eff6ff", iconCls: "monthly" },
  { value: "quarterly",  label: "Họp quý",             sub: "Họp tổng kết an toàn theo quý",           icon: BookOpen,  color: "#d97706", bg: "#fffbeb", iconCls: "quarterly" },
  { value: "emergency",  label: "Họp khẩn",            sub: "Họp xử lý sự cố hoặc vấn đề cấp bách",   icon: Flame,     color: "#dc2626", bg: "#fef2f2", iconCls: "emergency" },
  { value: "kyt-review", label: "Tổng kết KYT",        sub: "Họp đánh giá hoạt động KYT định kỳ",     icon: Megaphone, color: "#059669", bg: "#ecfdf5", iconCls: "kyt" }
];

const TYPE_MAP = new Map(MEETING_TYPES.map((t) => [t.value, t]));

const STATUS_META: Record<MeetingStatus, { label: string; cls: string }> = {
  planned:   { label: "Sắp diễn ra",  cls: "planned" },
  completed: { label: "Đã hoàn thành", cls: "completed" },
  cancelled: { label: "Đã hủy",        cls: "cancelled" }
};

const DEFAULT_AGENDA = (): AgendaItem[] => [
  { id: "a1", order: 1, topic: "Điểm danh, khai mạc", presenter: "EHS", duration: 5, notes: "" },
  { id: "a2", order: 2, topic: "Tổng kết an toàn tháng trước", presenter: "EHS", duration: 20, notes: "" },
  { id: "a3", order: 3, topic: "Kết quả kiểm tra 6S", presenter: "EHS", duration: 20, notes: "" },
  { id: "a4", order: 4, topic: "Tình hình sự cố, cảnh báo", presenter: "EHS", duration: 15, notes: "" },
  { id: "a5", order: 5, topic: "Kế hoạch an toàn tháng tới", presenter: "EHS", duration: 15, notes: "" },
  { id: "a6", order: 6, topic: "Ý kiến các bộ phận + Kết thúc", presenter: "Chủ tọa", duration: 10, notes: "" }
];

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  try { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(s)); }
  catch { return s; }
};
const fmtPeriod = (s: string) => {
  if (!s) return "";
  const [y, m] = s.split("-");
  return m ? `Tháng ${Number(m)}/${y}` : s;
};
const currentMonth = () => new Date().toISOString().slice(0, 7);
const currentYear  = () => new Date().getFullYear();

const isOverdue = (item: ActionItem) => {
  if (item.status === "closed") return false;
  if (!item.dueDate) return false;
  return new Date(item.dueDate) < new Date();
};
const actionStatusOf = (item: ActionItem): ActionStatus =>
  item.status === "closed" ? "closed" : isOverdue(item) ? "overdue" : "open";

// ─── Participants Tags Input ──────────────────────────────────────────────────
function ParticipantsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const add = () => {
    const name = input.trim();
    if (name && !value.includes(name)) onChange([...value, name]);
    setInput("");
  };
  const remove = (name: string) => onChange(value.filter((v) => v !== name));
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
    if (e.key === "Backspace" && !input && value.length) remove(value[value.length - 1]);
  };

  return (
    <div className="smeet-tags-input-wrap" onClick={() => ref.current?.focus()}>
      {value.map((name) => (
        <span key={name} className="smeet-part-chip">
          {name}
          <button type="button" onClick={() => remove(name)}><X size={10} /></button>
        </span>
      ))}
      <input
        ref={ref}
        className="smeet-tags-input"
        placeholder={value.length ? "" : "Nhập tên, Enter để thêm..."}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
      />
    </div>
  );
}

// ─── Import Source Picker ─────────────────────────────────────────────────────
type ImportTab = "preset" | "warnings" | "plans";

const IMPORT_PRESETS = [
  { id: "pre-1", topic: "Tổng kết tai nạn / sự cố tháng trước",      presenter: "EHS",      duration: 15 },
  { id: "pre-2", topic: "Kết quả kiểm tra 6S định kỳ",               presenter: "EHS",      duration: 15 },
  { id: "pre-3", topic: "Tình hình cảnh báo nguy hiểm đang mở",      presenter: "EHS",      duration: 10 },
  { id: "pre-4", topic: "Kế hoạch đào tạo ATVSLD / KYT",             presenter: "EHS",      duration: 10 },
  { id: "pre-5", topic: "Cập nhật quy trình / nội quy an toàn",      presenter: "EHS",      duration: 10 },
  { id: "pre-6", topic: "Thông báo kế hoạch kiểm tra PCCC",          presenter: "EHS",      duration: 10 },
  { id: "pre-7", topic: "Phân công hành động khắc phục",              presenter: "EHS",      duration: 15 },
  { id: "pre-8", topic: "Ý kiến các bộ phận + Kết thúc",             presenter: "Chủ tọa",  duration: 10 },
];

function ImportSourcePicker({ onClose, onImport }: {
  onClose: () => void;
  onImport: (items: AgendaItem[]) => void;
}) {
  const [tab, setTab]             = useState<ImportTab>("preset");
  const [selected, setSelected]   = useState<Record<string, boolean>>({});
  const [warnings, setWarnings]   = useState<any[]>([]);
  const [plans, setPlans]         = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [loadedTab, setLoadedTab] = useState<string | null>(null);

  const switchTab = async (t: ImportTab) => {
    setTab(t);
    if (t === "preset" || t === loadedTab) return;
    setLoading(true);
    try {
      if (t === "warnings") {
        const data = await apiFetch<any>("/api/warnings?limit=40");
        const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
        setWarnings(items.filter((w: any) => w.status !== "closed" && w.status !== "resolved"));
      } else {
        const data = await apiFetch<any>("/api/inspection-plans?limit=15");
        const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
        setPlans(items);
      }
      setLoadedTab(t);
    } catch {}
    finally { setLoading(false); }
  };

  const toggle = (id: string) => setSelected(s => ({ ...s, [id]: !s[id] }));
  const selectedCount = Object.values(selected).filter(Boolean).length;

  const doImport = () => {
    const result: AgendaItem[] = [];
    let order = 1;
    IMPORT_PRESETS.filter(p => selected[p.id]).forEach(p => {
      result.push({ id: `imp-${Date.now()}-${order}`, order: order++, topic: p.topic, presenter: p.presenter, duration: p.duration, notes: "" });
    });
    warnings.filter(w => selected[w.id]).forEach(w => {
      result.push({ id: `imp-${Date.now()}-${order}`, order: order++, topic: `Xử lý cảnh báo: ${w.title || w.description || w.id}`, presenter: "EHS", duration: 15, notes: "" });
    });
    plans.filter(p => selected[p.id]).forEach(p => {
      result.push({ id: `imp-${Date.now()}-${order}`, order: order++, topic: `Kết quả KT: ${p.title || p.code}`, presenter: "EHS", duration: 20, notes: "" });
    });
    onImport(result);
  };

  const TABS: { key: ImportTab; label: string; TIcon: typeof Database }[] = [
    { key: "preset",   label: "Danh mục chuẩn",   TIcon: ListChecks },
    { key: "warnings", label: "Cảnh báo nóng",    TIcon: Flame },
    { key: "plans",    label: "Kết quả 6S",        TIcon: ClipboardList },
  ];

  return (
    <div className="smeet-import-overlay" onClick={onClose}>
      <div className="smeet-import-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="smeet-import-header">
          <div className="smeet-import-header-icon"><Database size={17} /></div>
          <div style={{ flex: 1 }}>
            <div className="smeet-import-header-title">Nhập từ nguồn dữ liệu</div>
            <div className="smeet-import-header-sub">Chọn mục muốn thêm vào chương trình họp</div>
          </div>
          <button className="smeet-modal-close" onClick={onClose}><X size={14} /></button>
        </div>

        {/* Tabs */}
        <div className="smeet-import-tabs">
          {TABS.map(t => {
            const TI = t.TIcon;
            return (
              <button
                key={t.key}
                className={`smeet-import-tab${tab === t.key ? " active" : ""}`}
                onClick={() => switchTab(t.key)}
              >
                <TI size={13} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="smeet-import-body">
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 36 }}>
              <Loader2 size={22} className="animate-spin" style={{ color: "#1d4ed8" }} />
            </div>
          ) : tab === "preset" ? (
            <div className="smeet-import-list">
              {IMPORT_PRESETS.map(p => (
                <label key={p.id} className={`smeet-import-item${selected[p.id] ? " selected" : ""}`}>
                  <input type="checkbox" style={{ display: "none" }} checked={!!selected[p.id]} onChange={() => toggle(p.id)} />
                  <div className={`smeet-import-check${selected[p.id] ? " on" : ""}`}>
                    {selected[p.id] && <CheckCircle2 size={11} />}
                  </div>
                  <div className="smeet-import-item-info">
                    <div className="smeet-import-item-title">{p.topic}</div>
                    <div className="smeet-import-item-meta">
                      <span><User size={10} /> {p.presenter}</span>
                      <span><Clock size={10} /> {p.duration} ph</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          ) : tab === "warnings" ? (
            warnings.length === 0 ? (
              <div className="smeet-import-empty">
                <AlertCircle size={30} style={{ color: "#fca5a5" }} />
                <div>Không có cảnh báo nóng đang mở</div>
              </div>
            ) : (
              <div className="smeet-import-list">
                {warnings.map(w => (
                  <label key={w.id} className={`smeet-import-item${selected[w.id] ? " selected" : ""}`}>
                    <input type="checkbox" style={{ display: "none" }} checked={!!selected[w.id]} onChange={() => toggle(w.id)} />
                    <div className={`smeet-import-check${selected[w.id] ? " on" : ""}`}>
                      {selected[w.id] && <CheckCircle2 size={11} />}
                    </div>
                    <div className="smeet-import-item-info">
                      <div className="smeet-import-item-title">{w.title || w.description || `Cảnh báo #${w.id}`}</div>
                      <div className="smeet-import-item-meta">
                        {w.severity && <span className={`smeet-import-sev sev-${w.severity}`}>{w.severity === "high" ? "Khẩn" : w.severity === "medium" ? "Cảnh báo" : "Thấp"}</span>}
                        {w.department && <span>{w.department}</span>}
                        {(w.createdAt || w.date) && <span>{fmtDate(w.createdAt || w.date)}</span>}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )
          ) : (
            plans.length === 0 ? (
              <div className="smeet-import-empty">
                <Search size={30} style={{ color: "#cbd5e1" }} />
                <div>Không có kết quả kiểm tra để hiển thị</div>
              </div>
            ) : (
              <div className="smeet-import-list">
                {plans.map(p => (
                  <label key={p.id} className={`smeet-import-item${selected[p.id] ? " selected" : ""}`}>
                    <input type="checkbox" style={{ display: "none" }} checked={!!selected[p.id]} onChange={() => toggle(p.id)} />
                    <div className={`smeet-import-check${selected[p.id] ? " on" : ""}`}>
                      {selected[p.id] && <CheckCircle2 size={11} />}
                    </div>
                    <div className="smeet-import-item-info">
                      <div className="smeet-import-item-title">{p.title || p.code}</div>
                      <div className="smeet-import-item-meta">
                        {p.code && <span style={{ fontFamily: "monospace", fontSize: 10.5 }}>{p.code}</span>}
                        {p.status && <span>{p.status}</span>}
                        {(p.completedAt || p.period) && <span>{p.completedAt ? fmtDate(p.completedAt) : p.period}</span>}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="smeet-import-footer">
          <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
            {selectedCount > 0 ? `Đã chọn ${selectedCount} mục` : "Chưa chọn mục nào"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="smeet-btn smeet-btn-ghost" onClick={onClose}>Hủy</button>
            <button className="smeet-btn smeet-btn-primary" disabled={selectedCount === 0} onClick={doImport}>
              <Plus size={13} /> Thêm {selectedCount > 0 ? `${selectedCount} mục` : "vào chương trình"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Create Modal ─────────────────────────────────────────────────────────────
type FormState = {
  period: string; type: MeetingType; title: string;
  meetingDate: string; startTime: string; endTime: string;
  location: string; chairperson: string;
  participants: string[];
  agenda: AgendaItem[];
};

const defaultForm = (): FormState => ({
  period: currentMonth(), type: "monthly", title: "",
  meetingDate: "", startTime: "08:00", endTime: "09:30",
  location: "Phòng họp A", chairperson: "",
  participants: [],
  agenda: DEFAULT_AGENDA()
});

function CreateMeetingModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (m: SafetyMeeting) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copyingPrev, setCopyingPrev] = useState(false);
  const [prevCopied, setPrevCopied] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const autoTitle = useMemo(() => {
    const meta = TYPE_MAP.get(form.type);
    return `${meta?.label || "Họp an toàn"} ${fmtPeriod(form.period)}`;
  }, [form.type, form.period]);

  // Agenda helpers
  const addAgenda = () => setForm((f) => ({
    ...f, agenda: [...f.agenda, { id: `a${Date.now()}`, order: f.agenda.length + 1, topic: "", presenter: "", duration: 15, notes: "" }]
  }));
  const removeAgenda = (id: string) => setForm((f) => ({
    ...f, agenda: f.agenda.filter((a) => a.id !== id).map((a, i) => ({ ...a, order: i + 1 }))
  }));
  const updateAgenda = (id: string, field: keyof AgendaItem, val: string | number) =>
    setForm((f) => ({ ...f, agenda: f.agenda.map((a) => a.id === id ? { ...a, [field]: val } : a) }));

  // Copy agenda from most recent meeting of same type
  const copyPrevAgenda = async () => {
    setCopyingPrev(true);
    try {
      const params = new URLSearchParams({ type: form.type, limit: "5", status: "completed" });
      const payload = await apiFetch<{ items: SafetyMeeting[] }>(`/api/safety-meetings?${params}`);
      const prev = Array.isArray(payload.items) ? payload.items[0] : null;
      if (prev && prev.agenda.length > 0) {
        const copied: AgendaItem[] = prev.agenda.map((a, i) => ({
          ...a, id: `a${Date.now()}_${i}`, order: i + 1
        }));
        setForm((f) => ({ ...f, agenda: copied }));
        setPrevCopied(true);
      } else {
        setErr("Không tìm thấy cuộc họp cùng loại đã hoàn thành để copy.");
      }
    } catch {
      setErr("Không thể tải chương trình họp kỳ trước.");
    } finally {
      setCopyingPrev(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.period) return setErr("Vui lòng chọn kỳ họp.");
    setSaving(true); setErr(null);
    try {
      const meeting = await postJson<SafetyMeeting>("/api/safety-meetings", {
        period: form.period, type: form.type,
        title: form.title || autoTitle,
        meetingDate: form.meetingDate || null,
        startTime: form.startTime, endTime: form.endTime,
        location: form.location, chairperson: form.chairperson,
        participants: form.participants,
        agenda: form.agenda.filter((a) => a.topic)
      });
      onCreated(meeting);
    } catch (e) {
      setErr((e as Error).message || "Lỗi tạo cuộc họp.");
    } finally {
      setSaving(false);
    }
  };

  const typeMeta = TYPE_MAP.get(form.type)!;
  const totalDuration = form.agenda.reduce((s, a) => s + (a.duration || 0), 0);

  return (
    <div className="smeet-modal-backdrop" onClick={onClose}>
      <div className="smeet-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Header (light, synced with cảnh báo nóng modal) ── */}
        <div className="smeet-modal-header">
          <div className="smeet-modal-header-icon"><Users size={18} /></div>
          <div className="smeet-modal-header-info">
            <div className="smeet-modal-header-title">Tạo cuộc họp an toàn</div>
            <div className="smeet-modal-header-sub">
              {step === 1 ? "Bước 1 / 2 — Thông tin chung" : "Bước 2 / 2 — Chương trình họp"}
            </div>
          </div>
          <div className="smeet-modal-step-dots">
            <div className={`smeet-modal-step-dot${step >= 1 ? " on" : ""}`} />
            <div className={`smeet-modal-step-dot${step >= 2 ? " on" : ""}`} />
          </div>
          <button className="smeet-modal-close" onClick={onClose}><X size={15} /></button>
        </div>

        {/* ── Step bar ── */}
        <div className="smeet-stepbar">
          <button className={`smeet-stepbar-item${step >= 1 ? " active" : ""}`} onClick={() => setStep(1)}>
            <div className={`smeet-stepbar-dot${step > 1 ? " done" : step === 1 ? " current" : ""}`}>
              {step > 1 ? <CheckCircle2 size={13} /> : "1"}
            </div>
            <span>Thông tin chung</span>
          </button>
          <ChevronRight size={14} className="smeet-stepbar-arrow" />
          <div className={`smeet-stepbar-item${step >= 2 ? " active" : ""}`}>
            <div className={`smeet-stepbar-dot${step === 2 ? " current" : ""}`}>2</div>
            <span>Chương trình họp</span>
          </div>
          {step === 2 && (
            <span className="smeet-stepbar-duration">
              <Clock size={11} /> {totalDuration} phút
            </span>
          )}
        </div>

        <div className="smeet-modal-body">
          {err && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#dc2626", marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
              <AlertCircle size={14} /> {err}
            </div>
          )}

          {step === 1 && (
            <>
              {/* Type */}
              <div className="smeet-form-group">
                <label className="smeet-form-label">Loại cuộc họp <span>*</span></label>
                <div className="smeet-type-grid">
                  {MEETING_TYPES.map((t) => {
                    const TIcon = t.icon;
                    return (
                      <div key={t.value} className={`smeet-type-opt${form.type === t.value ? " selected" : ""}`} onClick={() => setField("type", t.value)}>
                        <div className="smeet-type-opt-icon" style={{ background: t.bg, color: t.color, border: `1px solid ${t.bg === "#eff6ff" ? "#bfdbfe" : t.bg === "#fffbeb" ? "#fde68a" : t.bg === "#fef2f2" ? "#fecaca" : "#a7f3d0"}` }}><TIcon size={16} /></div>
                        <div>
                          <div className="smeet-type-opt-title">{t.label}</div>
                          <div className="smeet-type-opt-sub">{t.sub}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="smeet-form-row">
                <div className="smeet-form-group">
                  <label className="smeet-form-label">Kỳ họp <span>*</span></label>
                  <input type="month" className="smeet-form-input" value={form.period} onChange={(e) => setField("period", e.target.value)} />
                </div>
                <div className="smeet-form-group">
                  <label className="smeet-form-label">Ngày họp</label>
                  <input type="date" className="smeet-form-input" value={form.meetingDate} onChange={(e) => setField("meetingDate", e.target.value)} />
                </div>
              </div>

              <div className="smeet-form-group">
                <label className="smeet-form-label">Tiêu đề cuộc họp</label>
                <input type="text" className="smeet-form-input" placeholder={autoTitle} value={form.title} onChange={(e) => setField("title", e.target.value)} />
              </div>

              <div className="smeet-form-row-3">
                <div className="smeet-form-group">
                  <label className="smeet-form-label"><Clock size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />Bắt đầu</label>
                  <input type="time" className="smeet-form-input" value={form.startTime} onChange={(e) => setField("startTime", e.target.value)} />
                </div>
                <div className="smeet-form-group">
                  <label className="smeet-form-label">Kết thúc</label>
                  <input type="time" className="smeet-form-input" value={form.endTime} onChange={(e) => setField("endTime", e.target.value)} />
                </div>
                <div className="smeet-form-group">
                  <label className="smeet-form-label"><MapPin size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />Địa điểm</label>
                  <input type="text" className="smeet-form-input" placeholder="Phòng họp A" value={form.location} onChange={(e) => setField("location", e.target.value)} />
                </div>
              </div>

              <div className="smeet-form-group">
                <label className="smeet-form-label"><User size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />Chủ tọa</label>
                <input type="text" className="smeet-form-input" placeholder="Tên người chủ trì" value={form.chairperson} onChange={(e) => setField("chairperson", e.target.value)} />
              </div>

              <div className="smeet-form-group">
                <label className="smeet-form-label"><Users size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />Thành phần tham dự</label>
                <ParticipantsInput value={form.participants} onChange={(v) => setField("participants", v)} />
                <div style={{ fontSize: 12, color: "var(--muted,#94a3b8)", marginTop: 5 }}>Nhập tên rồi nhấn Enter hoặc dấu phẩy để thêm</div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {/* Summary strip from step 1 */}
              <div className="smeet-modal-summary-strip" style={{ borderColor: typeMeta?.bg === "#eff6ff" ? "#bfdbfe" : typeMeta?.bg === "#fffbeb" ? "#fde68a" : typeMeta?.bg === "#fef2f2" ? "#fecaca" : "#a7f3d0", background: typeMeta?.bg }}>
                <div className="smeet-modal-summary-icon" style={{ color: typeMeta?.color, borderColor: typeMeta?.bg === "#eff6ff" ? "#bfdbfe" : typeMeta?.bg === "#fffbeb" ? "#fde68a" : typeMeta?.bg === "#fef2f2" ? "#fecaca" : "#a7f3d0" }}>
                  {typeMeta && (() => { const TIcon = typeMeta.icon; return <TIcon size={15} />; })()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{typeMeta?.label} — {fmtPeriod(form.period)}</div>
                  <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 1 }}>
                    {form.meetingDate && `${fmtDate(form.meetingDate)} · `}{form.startTime} – {form.endTime}
                    {form.location && ` · ${form.location}`}
                  </div>
                </div>
                <button className="smeet-btn smeet-btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setStep(1)}>Sửa</button>
              </div>

              {/* Copy from previous meeting */}
              {!prevCopied ? (
                <div className="smeet-copy-prev-banner">
                  <div className="smeet-copy-prev-left">
                    <CalendarClock size={14} />
                    <span>Copy chương trình họp từ <strong>{typeMeta?.label.toLowerCase()}</strong> kỳ trước?</span>
                  </div>
                  <button
                    className="smeet-copy-prev-btn"
                    onClick={copyPrevAgenda}
                    disabled={copyingPrev}
                  >
                    {copyingPrev
                      ? <><Loader2 size={12} className="animate-spin" /> Đang tải...</>
                      : "Copy agenda"}
                  </button>
                </div>
              ) : (
                <div className="smeet-copy-prev-done">
                  <CheckCircle2 size={13} />
                  Đã copy chương trình họp từ kỳ trước —
                  <button
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#059669", fontWeight: 700, fontSize: 12, padding: 0 }}
                    onClick={() => { setForm((f) => ({ ...f, agenda: DEFAULT_AGENDA() })); setPrevCopied(false); }}
                  >
                    Hoàn tác
                  </button>
                </div>
              )}

              {/* Import from data sources banner */}
              <div className="smeet-import-banner" onClick={() => setShowImport(true)}>
                <div className="smeet-import-banner-left">
                  <div className="smeet-import-banner-icon"><Database size={13} /></div>
                  <span>Nhập từ nguồn dữ liệu — cảnh báo nóng, kết quả 6S, danh mục chuẩn</span>
                </div>
                <button className="smeet-import-banner-btn" type="button">
                  <ListChecks size={12} /> Chọn mục
                </button>
              </div>

              <div className="smeet-agenda-header-row">
                <label className="smeet-form-label" style={{ margin: 0 }}>
                  Chương trình họp ({form.agenda.length} mục · {totalDuration} phút)
                </label>
              </div>
              <div className="smeet-agenda-list">
                {form.agenda.map((item) => (
                  <div key={item.id} className="smeet-agenda-item">
                    <div className="smeet-agenda-num">{item.order}</div>
                    <div className="smeet-agenda-fields">
                      <input className="smeet-agenda-field-input" placeholder="Nội dung / chủ đề..." value={item.topic} onChange={(e) => updateAgenda(item.id, "topic", e.target.value)} />
                      <input className="smeet-agenda-field-input" placeholder="Người trình bày" value={item.presenter} onChange={(e) => updateAgenda(item.id, "presenter", e.target.value)} />
                      <input className="smeet-agenda-field-input" type="number" min={1} placeholder="Phút" value={item.duration} onChange={(e) => updateAgenda(item.id, "duration", Number(e.target.value))} />
                    </div>
                    <button className="smeet-agenda-del" onClick={() => removeAgenda(item.id)} title="Xóa"><X size={13} /></button>
                  </div>
                ))}
              </div>
              <button className="smeet-add-row-btn" style={{ marginTop: 10 }} onClick={addAgenda}>
                <Plus size={14} /> Thêm mục chương trình
              </button>
            </>
          )}
        </div>

        <div className="smeet-modal-footer">
          <button className="smeet-btn smeet-btn-ghost" onClick={step === 1 ? onClose : () => setStep(1)}>
            {step === 1 ? "Hủy" : "← Quay lại"}
          </button>
          <div className="smeet-modal-footer-right">
            {step === 1
              ? <button className="smeet-btn smeet-btn-primary" onClick={() => setStep(2)}>
                  Tiếp theo — Chương trình họp <ChevronRight size={14} />
                </button>
              : <button className="smeet-btn smeet-btn-complete" onClick={handleSubmit} disabled={saving}>
                  {saving ? <><Loader2 size={13} className="animate-spin" /> Đang lưu...</> : <><CheckCircle2 size={13} /> Tạo cuộc họp</>}
                </button>
            }
          </div>
        </div>
      </div>

      {/* Import source picker portal */}
      {showImport && (
        <ImportSourcePicker
          onClose={() => setShowImport(false)}
          onImport={(items) => {
            setForm(f => {
              const nextOrder = f.agenda.length + 1;
              const reordered = items.map((it, i) => ({ ...it, order: nextOrder + i }));
              return { ...f, agenda: [...f.agenda, ...reordered] };
            });
            setShowImport(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Complete Meeting Modal ───────────────────────────────────────────────────
function CompleteMeetingModal({ meeting, onClose, onCompleted }: {
  meeting: SafetyMeeting;
  onClose: () => void;
  onCompleted: (m: SafetyMeeting) => void;
}) {
  const [summary, setSummary]   = useState(meeting.contentSummary || "");
  const [decisions, setDec]     = useState(meeting.decisions || "");
  const [saving, setSaving]     = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await postJson<SafetyMeeting>(`/api/safety-meetings/${meeting.id}/complete`, {
        contentSummary: summary, decisions
      });
      onCompleted(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="smeet-complete-modal" onClick={onClose}>
      <div className="smeet-complete-box" onClick={(e) => e.stopPropagation()}>
        <div className="smeet-complete-box-header">
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FileText size={20} />
          </div>
          <div>
            <div className="smeet-complete-box-title">Xác nhận hoàn thành cuộc họp</div>
            <div className="smeet-complete-box-sub">{meeting.code} · {fmtDate(meeting.meetingDate)}</div>
          </div>
        </div>
        <div className="smeet-complete-box-body">
          <div className="smeet-form-group">
            <label className="smeet-form-label">Nội dung tóm tắt biên bản</label>
            <textarea className="smeet-textarea-edit" rows={4} placeholder="Ghi tóm tắt những nội dung chính đã thảo luận trong cuộc họp..." value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="smeet-form-group">
            <label className="smeet-form-label">Kết luận / Quyết định</label>
            <textarea className="smeet-textarea-edit" rows={3} placeholder="Các quyết định, cam kết được đưa ra trong cuộc họp..." value={decisions} onChange={(e) => setDec(e.target.value)} />
          </div>
        </div>
        <div className="smeet-complete-box-footer">
          <button className="smeet-btn smeet-btn-ghost" onClick={onClose}>Hủy</button>
          <button className="smeet-btn smeet-btn-complete" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 size={13} className="animate-spin" /> Đang lưu...</> : <><CheckCircle2 size={13} /> Xác nhận hoàn thành</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Panel (wide centered modal) ───────────────────────────────────────
type DetailTab = "agenda" | "minutes" | "actions";

function DetailPanel({ meeting: init, onClose, onUpdate }: {
  meeting: SafetyMeeting;
  onClose: () => void;
  onUpdate: (m: SafetyMeeting) => void;
}) {
  const [meeting, setMeeting]           = useState<SafetyMeeting>(init);
  const [activeTab, setActiveTab]       = useState<DetailTab>("agenda");
  const [showComplete, setShowComplete] = useState(false);
  const [newAction, setNewAction]       = useState({ content: "", assignee: "", dueDate: "" });
  const [addingAction, setAddingAction] = useState(false);
  const [savingAction, setSavingAction] = useState<string | null>(null);

  // Compute panel height from actual window.innerHeight to bypass CSS 100vh iframe quirks.
  // Overlay covers full viewport (top:0). PAD=36 (18 top+bottom), MIN=560, MAX=920.
  const calcPanelH = () => Math.min(Math.max(window.innerHeight - 36, 560), 920);
  const [panelH, setPanelH] = useState(calcPanelH);
  useEffect(() => {
    const onResize = () => setPanelH(calcPanelH());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => { setMeeting(init); }, [init.id, init.status, init.updatedAt]);

  const typeMeta   = TYPE_MAP.get(meeting.type) || MEETING_TYPES[0];
  const Icon       = typeMeta.icon;
  const sm         = STATUS_META[meeting.status];
  const totalDur   = meeting.agenda.reduce((s, a) => s + (a.duration || 0), 0);
  const openCount   = meeting.actionItems.filter((a) => a.status !== "closed" && !isOverdue(a)).length;
  const closedCount = meeting.actionItems.filter((a) => a.status === "closed").length;
  const overdueCount= meeting.actionItems.filter(isOverdue).length;

  const [y, m] = meeting.period ? meeting.period.split("-") : ["", ""];
  const periodLabel = m ? `Tháng ${Number(m)}/${y}` : meeting.period;

  const exportToPDF = () => {
    const typeName = typeMeta.label;
    const statusLabel = sm.label;
    const agendaRows = meeting.agenda.map((a, i) => `
      <tr>
        <td style="text-align:center;width:40px;font-weight:700;color:#1d4ed8">${a.order}</td>
        <td style="font-weight:600">${a.topic}${a.notes ? `<div style="font-size:11px;color:#64748b;font-style:italic;margin-top:2px">${a.notes}</div>` : ""}</td>
        <td style="text-align:center;width:130px">${a.presenter || "—"}</td>
        <td style="text-align:center;width:80px;font-weight:700;color:#475569">${a.duration} ph</td>
      </tr>`).join("");

    const participantList = meeting.participants.length
      ? meeting.participants.map(n => `<span style="display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;font-size:12px;font-weight:600;padding:3px 10px;border-radius:20px;margin:2px 4px 2px 0">${n}</span>`).join("")
      : '<em style="color:#94a3b8">Chưa ghi nhận</em>';

    const actionRows = meeting.actionItems.length ? meeting.actionItems.map((a) => {
      const done = a.status === "closed";
      const over = isOverdue(a);
      const badgeColor = done ? "#16a34a" : over ? "#dc2626" : "#1d4ed8";
      const badgeBg = done ? "#dcfce7" : over ? "#fee2e2" : "#dbeafe";
      const badge = done ? "Xong" : over ? "Quá hạn" : "Mở";
      return `<tr style="${done ? "opacity:0.7" : ""}">
        <td style="padding:8px 10px;font-weight:600;${done ? "text-decoration:line-through;color:#94a3b8" : ""}">${a.content}</td>
        <td style="padding:8px 10px;text-align:center;font-size:12px">${a.assignee || "—"}</td>
        <td style="padding:8px 10px;text-align:center;font-size:12px">${a.dueDate ? fmtDate(a.dueDate) : "—"}</td>
        <td style="padding:8px 10px;text-align:center"><span style="background:${badgeBg};color:${badgeColor};font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">${badge}</span></td>
      </tr>`;
    }).join("") : `<tr><td colspan="4" style="text-align:center;color:#94a3b8;font-style:italic;padding:16px">Không có hành động</td></tr>`;

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8"/>
<title>Biên bản cuộc họp — ${meeting.code}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", "Noto Sans", Arial, sans-serif; font-size: 13px; color: #0f172a; background: #fff; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
  .wrap { max-width: 780px; margin: 0 auto; padding: 32px 28px; }
  .logo-bar { display: flex; align-items: center; justify-content: space-between; border-bottom: 2.5px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 20px; }
  .company { font-size: 11px; font-weight: 700; color: #1e3a5f; text-transform: uppercase; letter-spacing: 0.06em; }
  .doc-type { font-size: 11px; font-weight: 700; color: #64748b; }
  .title-block { text-align: center; margin-bottom: 24px; }
  .title-main { font-size: 20px; font-weight: 800; color: #1e3a5f; margin-bottom: 6px; }
  .title-code { font-size: 12px; color: #64748b; font-weight: 600; letter-spacing: 0.05em; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; }
  .info-row { display: flex; align-items: baseline; gap: 6px; }
  .info-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
  .info-val { font-size: 13px; font-weight: 600; color: #1e293b; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 12px; font-weight: 800; color: #1e3a5f; text-transform: uppercase; letter-spacing: 0.06em; padding-bottom: 7px; border-bottom: 1.5px solid #e2e8f0; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  table thead th { background: #1e3a5f; color: #fff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 10px; text-align: left; }
  table tbody tr { border-bottom: 1px solid #f1f5f9; }
  table tbody tr:nth-child(even) { background: #f8fafc; }
  table tbody td { padding: 9px 10px; vertical-align: top; font-size: 13px; }
  table tfoot td { padding: 8px 10px; background: #eff6ff; font-weight: 700; font-size: 12.5px; border-top: 1.5px solid #e2e8f0; }
  .text-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 13px 16px; font-size: 13px; line-height: 1.7; white-space: pre-wrap; min-height: 60px; }
  .decision-block { background: #f0fdf4; border-color: #bbf7d0; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 32px; }
  .sig-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px 18px; text-align: center; }
  .sig-title { font-size: 11.5px; font-weight: 700; color: #1e3a5f; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 50px; }
  .sig-name { font-size: 12px; color: #64748b; }
  .footer-note { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 28px; padding-top: 14px; border-top: 1px solid #e2e8f0; }
  .badge { display: inline-block; padding: 2px 9px; border-radius: 10px; font-size: 11px; font-weight: 700; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: #1d4ed8; color: #fff; border: none; border-radius: 8px; padding: 9px 18px; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 7px; box-shadow: 0 4px 14px rgba(29,78,216,0.3); z-index: 999; }
  .print-btn:hover { background: #1e40af; }
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">🖨️ In / Xuất PDF</button>
<div class="wrap">
  <div class="logo-bar">
    <div>
      <div class="company">MHC Hub — An toàn lao động</div>
      <div class="doc-type">Biên bản cuộc họp an toàn</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;color:#64748b">Mã số: <strong>${meeting.code}</strong></div>
      <div style="font-size:11px;color:#64748b">Trạng thái: <strong>${statusLabel}</strong></div>
    </div>
  </div>

  <div class="title-block">
    <div class="title-main">${meeting.title}</div>
    <div class="title-code">${meeting.code} · ${typeName} · ${periodLabel}</div>
  </div>

  <div class="info-grid">
    <div class="info-row"><span class="info-label">Ngày họp</span><span class="info-val">${fmtDate(meeting.meetingDate)}</span></div>
    <div class="info-row"><span class="info-label">Thời gian</span><span class="info-val">${meeting.startTime} – ${meeting.endTime}</span></div>
    <div class="info-row"><span class="info-label">Địa điểm</span><span class="info-val">${meeting.location || "—"}</span></div>
    <div class="info-row"><span class="info-label">Chủ tọa</span><span class="info-val">${meeting.chairperson || "—"}</span></div>
    <div class="info-row" style="grid-column:1/-1"><span class="info-label">Thành phần tham dự (${meeting.participants.length} người)</span></div>
    <div style="grid-column:1/-1">${participantList}</div>
  </div>

  <div class="section">
    <div class="section-title">Chương trình họp</div>
    <table>
      <thead><tr><th style="width:40px">#</th><th>Nội dung</th><th style="width:130px;text-align:center">Người trình bày</th><th style="width:80px;text-align:center">Thời lượng</th></tr></thead>
      <tbody>${agendaRows || '<tr><td colspan="4" style="text-align:center;color:#94a3b8;font-style:italic;padding:14px">Chưa có chương trình</td></tr>'}</tbody>
      ${meeting.agenda.length > 0 ? `<tfoot><tr><td colspan="3" style="text-align:right;color:#475569">Tổng thời gian:</td><td style="text-align:center;color:#1d4ed8">${meeting.agenda.reduce((s,a)=>s+(a.duration||0),0)} phút</td></tr></tfoot>` : ""}
    </table>
  </div>

  ${meeting.status === "completed" ? `
  <div class="section">
    <div class="section-title">Nội dung tóm tắt biên bản</div>
    <div class="text-block">${meeting.contentSummary || '<em style="color:#94a3b8">Chưa ghi nhận</em>'}</div>
  </div>
  <div class="section">
    <div class="section-title">Kết luận / Quyết nghị</div>
    <div class="text-block decision-block">${meeting.decisions || '<em style="color:#94a3b8">Chưa ghi nhận</em>'}</div>
  </div>` : `
  <div class="section">
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 16px;font-size:13px;color:#92400e;font-weight:500">
      ⚠️ Cuộc họp chưa hoàn thành — Biên bản và kết luận sẽ được cập nhật sau khi kết thúc.
    </div>
  </div>`}

  <div class="section">
    <div class="section-title">Danh sách hành động (${meeting.actionItems.length} mục)</div>
    <table>
      <thead><tr><th>Nội dung hành động</th><th style="width:130px;text-align:center">Người chịu trách nhiệm</th><th style="width:110px;text-align:center">Hạn hoàn thành</th><th style="width:90px;text-align:center">Trạng thái</th></tr></thead>
      <tbody>${actionRows}</tbody>
    </table>
  </div>

  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-title">Chủ tọa</div>
      <div class="sig-name">${meeting.chairperson || "—"}</div>
    </div>
    <div class="sig-box">
      <div class="sig-title">Người lập biên bản</div>
      <div class="sig-name">${meeting.createdByName}</div>
    </div>
  </div>

  <div class="footer-note">
    Tạo bởi ${meeting.createdByName} · ${fmtDate(meeting.createdAt)} · MHC Hub — Hệ thống quản lý an toàn lao động
  </div>
</div>
</body>
</html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
  };

  const toggleAction = async (item: ActionItem) => {
    const newStatus = item.status === "closed" ? "open" : "closed";
    setSavingAction(item.id);
    try {
      const updated = await patchJson<SafetyMeeting>(`/api/safety-meetings/${meeting.id}/actions/${item.id}`, { status: newStatus });
      setMeeting(updated); onUpdate(updated);
    } finally { setSavingAction(null); }
  };

  const addAction = async () => {
    if (!newAction.content.trim()) return;
    setSavingAction("new");
    try {
      const updated = await putJson<SafetyMeeting>(`/api/safety-meetings/${meeting.id}`, {
        ...meeting,
        actionItems: [...meeting.actionItems, {
          id: `tmp-${Date.now()}`, order: meeting.actionItems.length + 1,
          content: newAction.content.trim(), assignee: newAction.assignee.trim(),
          dueDate: newAction.dueDate || null, status: "open", completedAt: null
        }]
      });
      setMeeting(updated); onUpdate(updated);
      setNewAction({ content: "", assignee: "", dueDate: "" });
      setAddingAction(false);
    } finally { setSavingAction(null); }
  };

  const TABS: { key: DetailTab; label: string; TIcon: typeof Shield; count?: number }[] = [
    { key: "agenda",  label: "Chương trình họp",      TIcon: ListChecks },
    { key: "minutes", label: "Biên bản / Quyết nghị", TIcon: FileText },
    { key: "actions", label: "Hành động",              TIcon: CheckCircle2, count: meeting.actionItems.length },
  ];

  return (
    <>
      {/* Overlay — click outside to close */}
      <div className="smeet-detail-overlay" onClick={onClose}>
        <div className="smeet-detail-panel" style={{ height: panelH }} onClick={(e) => e.stopPropagation()}>

          {/* ── HEADER ── */}
          <div className="smeet-detail-header">
            <div className="smeet-detail-header-top">
              <div className="smeet-detail-header-left">
                <div className="smeet-detail-header-icon"><Icon size={22} /></div>
                <div className="smeet-detail-header-info">
                  <div className="smeet-detail-code">{meeting.code}</div>
                  <div className="smeet-detail-title">{meeting.title}</div>
                  <div className="smeet-detail-tags">
                    <span className={`smeet-detail-badge ${sm.cls}`}>{sm.label}</span>
                    <span className="smeet-detail-badge type-badge">{typeMeta.label}</span>
                    <span className="smeet-detail-badge period-badge">{periodLabel}</span>
                  </div>
                </div>
              </div>
              <button className="smeet-detail-close" onClick={onClose}><X size={16} /></button>
            </div>

            {/* Info strip */}
            <div className="smeet-info-strip">
              <div className="smeet-info-item">
                <div className="smeet-info-val"><CalendarClock size={13} />{fmtDate(meeting.meetingDate)}</div>
              </div>
              <div className="smeet-info-item">
                <div className="smeet-info-val"><Clock size={13} />{meeting.startTime} – {meeting.endTime}</div>
              </div>
              {meeting.location && (
                <div className="smeet-info-item">
                  <div className="smeet-info-val"><MapPin size={13} />{meeting.location}</div>
                </div>
              )}
              <div className="smeet-info-item">
                <div className="smeet-info-val"><User size={13} />Chủ tọa: <strong>{meeting.chairperson || "—"}</strong></div>
              </div>
              <div className="smeet-info-item">
                <div className="smeet-info-val"><Users size={13} />{meeting.participants.length} người tham dự</div>
              </div>
            </div>
          </div>

          {/* ── STATS ROW ── */}
          <div className="smeet-detail-stats">
            <div className="smeet-detail-stat">
              <div className="smeet-stat-icon-box blue"><ListChecks size={12} /></div>
              <span className="smeet-detail-stat-num">{meeting.agenda.length}</span>
              <span className="smeet-detail-stat-label">Chương trình</span>
            </div>
            <div className="smeet-detail-stat-divider" />
            <div className="smeet-detail-stat">
              <div className="smeet-stat-icon-box indigo"><Clock size={12} /></div>
              <span className="smeet-detail-stat-num">{totalDur}<span style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>ph</span></span>
              <span className="smeet-detail-stat-label">Thời lượng</span>
            </div>
            <div className="smeet-detail-stat-divider" />
            <div className="smeet-detail-stat">
              <div className="smeet-stat-icon-box slate"><Users size={12} /></div>
              <span className="smeet-detail-stat-num">{meeting.participants.length}</span>
              <span className="smeet-detail-stat-label">Tham dự</span>
            </div>
            <div className="smeet-detail-stat-divider" />
            <div className="smeet-detail-stat">
              <div className={`smeet-stat-icon-box${overdueCount > 0 ? " red" : " slate"}`}><AlertCircle size={12} /></div>
              <span className={`smeet-detail-stat-num${overdueCount > 0 ? " red" : ""}`}>{overdueCount}</span>
              <span className="smeet-detail-stat-label">Quá hạn</span>
            </div>
            <div className="smeet-detail-stat-divider" />
            <div className="smeet-detail-stat">
              <div className={`smeet-stat-icon-box${openCount > 0 ? " amber" : " slate"}`}><MessageSquare size={12} /></div>
              <span className={`smeet-detail-stat-num${openCount > 0 ? " amber" : ""}`}>{openCount}</span>
              <span className="smeet-detail-stat-label">Hành động mở</span>
            </div>
            <div className="smeet-detail-stat-divider" />
            <div className="smeet-detail-stat">
              <div className={`smeet-stat-icon-box${closedCount > 0 ? " green" : " slate"}`}><CheckCircle2 size={12} /></div>
              <span className={`smeet-detail-stat-num${closedCount > 0 ? " green" : ""}`}>{closedCount}</span>
              <span className="smeet-detail-stat-label">Đã xong</span>
            </div>
          </div>

          {/* ── TABS ── */}
          <div className="smeet-detail-tabs">
            {TABS.map((t) => {
              const TI = t.TIcon;
              return (
                <button
                  key={t.key}
                  className={`smeet-detail-tab${activeTab === t.key ? " active" : ""}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  <TI size={14} strokeWidth={2} />
                  {t.label}
                  {t.count !== undefined && (
                    <span className="smeet-tab-badge">{t.count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── BODY ── */}
          <div className="smeet-detail-body">

            {/* TAB: Chương trình họp */}
            {activeTab === "agenda" && (
              <>
                <div className="smeet-section">
                  <div className="smeet-section-title">
                    Chương trình họp
                    <span className="smeet-section-sub">Tổng: {totalDur} phút</span>
                  </div>
                  {meeting.agenda.length > 0 ? (
                    <div className="smeet-detail-agenda-wrap">
                      <table className="smeet-agenda-table">
                        <thead>
                          <tr>
                            <th style={{ width: 44 }}>#</th>
                            <th>Nội dung</th>
                            <th style={{ width: 150 }}>Người trình bày</th>
                            <th style={{ width: 90 }}>Thời lượng</th>
                          </tr>
                        </thead>
                        <tbody>
                          {meeting.agenda.map((item) => (
                            <tr key={item.id}>
                              <td style={{ textAlign: "center" }}>
                                <div className="smeet-agenda-order">{item.order}</div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, color: "var(--fg,#1e293b)", marginBottom: item.notes ? 2 : 0 }}>{item.topic}</div>
                                {item.notes && <div style={{ fontSize: 12, color: "#64748b", fontStyle: "italic" }}>{item.notes}</div>}
                              </td>
                              <td><span className="smeet-agenda-presenter">{item.presenter || "—"}</span></td>
                              <td><span className="smeet-agenda-duration">{item.duration} ph</span></td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={3} style={{ textAlign: "right", fontWeight: 700, fontSize: 12.5, color: "#64748b" }}>Tổng thời gian:</td>
                            <td><span className="smeet-agenda-total">{totalDur} ph</span></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div style={{ color: "#94a3b8", fontSize: 13, fontStyle: "italic" }}>Chưa có chương trình họp.</div>
                  )}
                </div>

                {/* Participants */}
                {meeting.participants.length > 0 && (
                  <div className="smeet-section">
                    <div className="smeet-section-title">
                      Danh sách tham dự
                      <span className="smeet-section-sub">{meeting.participants.length} người</span>
                    </div>
                    <div className="smeet-participants-grid">
                      {meeting.participants.map((name) => (
                        <div key={name} className="smeet-participant-tag">
                          <div className="smeet-participant-avatar">{name.charAt(0).toUpperCase()}</div>
                          {name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* TAB: Biên bản / Quyết nghị */}
            {activeTab === "minutes" && (
              <>
                <div className="smeet-minutes-two-col">
                  <div>
                    <div className="smeet-minutes-col-title"><FileText size={13} /> Tóm tắt nội dung</div>
                    <div className="smeet-text-block">
                      {meeting.contentSummary || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Chưa có tóm tắt nội dung.</span>}
                    </div>
                  </div>
                  <div>
                    <div className="smeet-minutes-col-title"><CheckCircle2 size={13} style={{ color: "#16a34a" }} /> Kết luận / Quyết nghị</div>
                    <div className="smeet-text-block decisions-block">
                      {meeting.decisions
                        ? meeting.decisions.split("\n").map((line, i) => (
                            <div key={i} style={{ color: "#15803d", fontWeight: 500, padding: "2px 0" }}>{line}</div>
                          ))
                        : <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Chưa có kết luận.</span>
                      }
                    </div>
                  </div>
                </div>

                {meeting.approvedByName && (
                  <div style={{ marginTop: 16, display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "#64748b", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 12px" }}>
                    <CheckCircle2 size={13} style={{ color: "#16a34a", flexShrink: 0 }} />
                    Đã hoàn thành bởi <strong style={{ color: "#15803d" }}>{meeting.approvedByName}</strong> · {fmtDate(meeting.approvedAt)}
                  </div>
                )}

                {meeting.status === "planned" && (
                  <div className="smeet-minutes-placeholder">
                    <p>Cuộc họp chưa hoàn thành — Ghi biên bản sau khi kết thúc</p>
                    <button className="smeet-btn smeet-btn-complete" onClick={() => setShowComplete(true)}>
                      <CheckCircle2 size={13} /> Ghi biên bản &amp; hoàn thành
                    </button>
                  </div>
                )}
              </>
            )}

            {/* TAB: Hành động */}
            {activeTab === "actions" && (
              <>
                <div className="smeet-section-title" style={{ marginBottom: 14 }}>
                  Hành động cần thực hiện
                  <div className="smeet-action-legend">
                    <span className="smeet-action-dot open" />Mở ({openCount})
                    <span className="smeet-action-dot overdue" />Quá hạn ({overdueCount})
                    <span className="smeet-action-dot closed" />Xong ({closedCount})
                  </div>
                </div>

                <div className="smeet-action-list">
                  {meeting.actionItems.map((item) => {
                    const overdue  = isOverdue(item);
                    const closed   = item.status === "closed";
                    const rowCls   = closed ? "closed-item" : overdue ? "overdue-item" : "open-item";
                    const isSaving = savingAction === item.id;
                    const badge    = closed ? "closed" : overdue ? "overdue" : "open";
                    const badgeLabel = closed ? "Xong" : overdue ? "Quá hạn" : "Mở";
                    return (
                      <div key={item.id} className={`smeet-action-item ${rowCls}`}>
                        <div className="smeet-action-row">
                          <button
                            className={`smeet-action-status-btn ${closed ? "checked" : "unchecked"}`}
                            onClick={() => toggleAction(item)}
                            disabled={isSaving}
                          >
                            {isSaving ? <Loader2 size={11} className="animate-spin" /> : closed ? <CheckCircle2 size={12} /> : null}
                          </button>
                          <div style={{ flex: 1 }}>
                            <div className="smeet-action-content" style={closed ? { textDecoration: "line-through", color: "#94a3b8" } : {}}>
                              {item.content}
                            </div>
                            <div className="smeet-action-meta">
                              {item.assignee && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><User size={10} />{item.assignee}</span>}
                              {item.dueDate && (
                                <span className={overdue && !closed ? "smeet-action-overdue" : ""} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                  <CalendarClock size={10} />{fmtDate(item.dueDate)}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`smeet-action-badge ${badge}`}>{badgeLabel}</span>
                        </div>
                      </div>
                    );
                  })}

                  {addingAction ? (
                    <div className="smeet-action-add-form">
                      <input className="smeet-action-add-input" placeholder="Nội dung hành động..." value={newAction.content} onChange={(e) => setNewAction((a) => ({ ...a, content: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addAction()} autoFocus />
                      <input className="smeet-action-add-input" placeholder="Người chịu trách nhiệm" value={newAction.assignee} onChange={(e) => setNewAction((a) => ({ ...a, assignee: e.target.value }))} style={{ maxWidth: 160 }} />
                      <input type="date" className="smeet-action-add-input" value={newAction.dueDate} onChange={(e) => setNewAction((a) => ({ ...a, dueDate: e.target.value }))} style={{ maxWidth: 140 }} />
                      <button className="smeet-btn smeet-btn-primary" onClick={addAction} disabled={savingAction === "new"} style={{ flexShrink: 0 }}>
                        {savingAction === "new" ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      </button>
                      <button className="smeet-btn smeet-btn-ghost" onClick={() => setAddingAction(false)} style={{ flexShrink: 0 }}><X size={12} /></button>
                    </div>
                  ) : (
                    <button className="smeet-add-row-btn" onClick={() => setAddingAction(true)}>
                      <Plus size={13} /> Thêm hành động
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── FOOTER ── */}
          <div className="smeet-detail-footer">
            <div className="smeet-detail-footer-left">
              Tạo bởi {meeting.createdByName} · {fmtDate(meeting.createdAt)}
            </div>
            <div className="smeet-detail-footer-right">
              <button className="smeet-btn smeet-btn-ghost" onClick={exportToPDF} title="Xuất biên bản ra PDF">
                <Printer size={13} /> Xuất PDF
              </button>
              {meeting.status === "planned" && (
                <button className="smeet-btn smeet-btn-complete" onClick={() => setShowComplete(true)}>
                  <CheckCircle2 size={13} /> Ghi biên bản &amp; hoàn thành
                </button>
              )}
              <button className="smeet-btn smeet-btn-ghost" onClick={onClose}>Đóng</button>
            </div>
          </div>
        </div>
      </div>

      {showComplete && (
        <CompleteMeetingModal
          meeting={meeting}
          onClose={() => setShowComplete(false)}
          onCompleted={(m) => { setMeeting(m); onUpdate(m); setShowComplete(false); }}
        />
      )}
    </>
  );
}

// ─── Meeting Card ─────────────────────────────────────────────────────────────
function MeetingCard({ meeting, selected, onSelect, onDelete }: {
  meeting: SafetyMeeting; selected: boolean;
  onSelect: () => void; onDelete: () => void;
}) {
  const typeMeta = TYPE_MAP.get(meeting.type) || MEETING_TYPES[0];
  const Icon = typeMeta.icon;
  const sm = STATUS_META[meeting.status];
  const open    = meeting.actionItems.filter((a) => a.status !== "closed" && !isOverdue(a)).length;
  const closed  = meeting.actionItems.filter((a) => a.status === "closed").length;
  const overdue = meeting.actionItems.filter(isOverdue).length;

  return (
    <div className={`smeet-card${selected ? " is-selected" : ""}`} onClick={onSelect}>
      <div className="smeet-card-header">
        <div className={`smeet-card-type-icon ${typeMeta.iconCls}`}><Icon size={20} /></div>
        <div className="smeet-card-meta">
          <div className="smeet-card-code">{meeting.code}</div>
          <div className="smeet-card-title">{meeting.title}</div>
          <div className="smeet-card-tags">
            <span className="smeet-tag date"><CalendarClock size={11} />{fmtDate(meeting.meetingDate) !== "—" ? fmtDate(meeting.meetingDate) : fmtPeriod(meeting.period)}</span>
            {meeting.startTime && <span className="smeet-tag time"><Clock size={11} />{meeting.startTime} – {meeting.endTime}</span>}
            {meeting.location && <span className="smeet-tag location"><MapPin size={11} />{meeting.location}</span>}
          </div>
        </div>
        <span className={`smeet-status-badge ${sm.cls}`}>{sm.label}</span>
      </div>

      <div className="smeet-card-body">
        {meeting.chairperson && (
          <div className="smeet-card-info-item"><User size={13} /><span>Chủ tọa: <strong>{meeting.chairperson}</strong></span></div>
        )}
        {meeting.participants.length > 0 && (
          <div className="smeet-card-info-item"><Users size={13} /><strong>{meeting.participants.length}</strong>&nbsp;người tham dự</div>
        )}
        {meeting.agenda.length > 0 && (
          <div className="smeet-card-info-item"><BookOpen size={13} /><strong>{meeting.agenda.length}</strong>&nbsp;mục chương trình</div>
        )}
        {meeting.actionItems.length > 0 && (
          <div className="smeet-action-pills">
            {overdue > 0 && <span className="smeet-action-pill overdue">{overdue} trễ hạn</span>}
            {open > 0    && <span className="smeet-action-pill open">{open} đang mở</span>}
            {closed > 0  && <span className="smeet-action-pill closed">{closed} hoàn thành</span>}
          </div>
        )}
      </div>

      <div className="smeet-card-footer">
        <div className="smeet-card-creator"><User size={12} />{meeting.createdByName} · {fmtDate(meeting.createdAt)}</div>
        <div className="smeet-card-btns">
          <button className="smeet-btn smeet-btn-ghost" onClick={onSelect}><FileText size={12} /> Xem chi tiết</button>
          {meeting.status !== "completed" && (
            <button className="smeet-btn smeet-btn-danger" onClick={(e) => { e.stopPropagation(); onDelete(); }}><Trash2 size={12} /></button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function SafetyMeetingPage() {
  const [meetings, setMeetings]     = useState<SafetyMeeting[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<unknown>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected]     = useState<SafetyMeeting | null>(null);
  const [filterYear, setFilterYear] = useState(String(currentYear()));
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType]     = useState("");
  const [search, setSearch]             = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filterYear) params.set("year", filterYear);
      if (filterStatus) params.set("status", filterStatus);
      if (filterType) params.set("type", filterType);
      const payload = await apiFetch<{ items: SafetyMeeting[]; total: number }>(`/api/safety-meetings?${params}`);
      setMeetings(Array.isArray(payload.items) ? payload.items : []);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [filterYear, filterStatus, filterType]);

  useEffect(() => { load(); }, [load]);

  const displayed = useMemo(() => {
    if (!search.trim()) return meetings;
    const q = search.toLowerCase();
    return meetings.filter((m) => m.title.toLowerCase().includes(q) || m.code.toLowerCase().includes(q) || m.period.includes(q) || m.chairperson.toLowerCase().includes(q));
  }, [meetings, search]);

  const stats = useMemo(() => ({
    total:     meetings.length,
    planned:   meetings.filter((m) => m.status === "planned").length,
    completed: meetings.filter((m) => m.status === "completed").length,
    openActions: meetings.flatMap((m) => m.actionItems).filter((a) => a.status !== "closed").length
  }), [meetings]);

  const handleCreated = (m: SafetyMeeting) => { setShowCreate(false); setMeetings((prev) => [m, ...prev]); setSelected(m); };
  const handleUpdate  = (m: SafetyMeeting) => { setMeetings((prev) => prev.map((x) => x.id === m.id ? m : x)); if (selected?.id === m.id) setSelected(m); };
  const handleDelete  = async (m: SafetyMeeting) => {
    if (!confirm(`Xóa cuộc họp "${m.code}"?`)) return;
    try {
      await deleteJson(`/api/safety-meetings/${m.id}`);
      setMeetings((prev) => prev.filter((x) => x.id !== m.id));
      if (selected?.id === m.id) setSelected(null);
    } catch {}
  };

  const years = useMemo(() => [currentYear() - 1, currentYear(), currentYear() + 1].map(String), []);

  return (
    <div className="smeet-shell">
      {/* Hero + Stats */}
      <div className="smeet-hero">
        <div className="smeet-hero-top">
          <div className="smeet-hero-title-row">
            <div className="smeet-hero-icon"><Users size={22} /></div>
            <div>
              <h1 className="smeet-hero-title" style={{ color: "#ffffff" }}>Họp an toàn</h1>
              <p className="smeet-hero-sub" style={{ color: "rgba(255,255,255,0.9)" }}>Lập lịch · Ghi biên bản · Theo dõi hành động</p>
            </div>
          </div>
          <button className="smeet-hero-btn" onClick={() => setShowCreate(true)}>
            <Plus size={15} /> Tạo cuộc họp
          </button>
        </div>
        <div className="smeet-hero-stats">
          <div className="smeet-hero-stat">
            <div className="smeet-hero-stat-header">
              <CalendarClock size={13} color="#60a5fa" strokeWidth={2} />
              <span className="smeet-hero-stat-label">Sắp diễn ra</span>
            </div>
            <div className="smeet-hero-stat-val">{stats.planned}</div>
          </div>
          <div className="smeet-hero-stat">
            <div className="smeet-hero-stat-header">
              <CheckCircle2 size={13} color="#34d399" strokeWidth={2} />
              <span className="smeet-hero-stat-label">Đã hoàn thành</span>
            </div>
            <div className="smeet-hero-stat-val">{stats.completed}</div>
          </div>
          <div className="smeet-hero-stat">
            <div className="smeet-hero-stat-header">
              <Users size={13} color="#93c5fd" strokeWidth={2} />
              <span className="smeet-hero-stat-label">Cuộc họp {filterYear}</span>
            </div>
            <div className="smeet-hero-stat-val">{stats.total}</div>
          </div>
          <div className="smeet-hero-stat">
            <div className="smeet-hero-stat-header">
              <AlertCircle size={13} color="#f87171" strokeWidth={2} />
              <span className="smeet-hero-stat-label">Hành động còn mở</span>
            </div>
            <div className="smeet-hero-stat-val">{stats.openActions}</div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="smeet-toolbar">
        <div className="smeet-filter-row">
          <select className="smeet-select" value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="smeet-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            <option value="planned">Sắp diễn ra</option>
            <option value="completed">Đã hoàn thành</option>
            <option value="cancelled">Đã hủy</option>
          </select>
          <div className="smeet-search-wrap">
            <Search size={14} className="smeet-search-ico" />
            <input type="text" className="smeet-search" placeholder="Tìm mã, tiêu đề, chủ tọa..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Type legend */}
      <div className="smeet-type-legend">
        {MEETING_TYPES.map((t) => {
          const TIcon = t.icon;
          const isActive = filterType === t.value;
          return (
            <button
              key={t.value}
              className={`smeet-type-legend-btn${isActive ? ` active-${t.iconCls}` : ""}`}
              onClick={() => setFilterType(isActive ? "" : t.value)}
            >
              <TIcon size={11} strokeWidth={2} /> {t.label}
            </button>
          );
        })}
        <span className="smeet-type-legend-count">{displayed.length} cuộc họp</span>
      </div>

      {/* Content */}
      {loading && <LoadingPanel label="Đang tải danh sách cuộc họp..." />}
      {!loading && error && <ErrorPanel error={error} />}
      {!loading && !error && displayed.length === 0 && (
        <div className="smeet-empty">
          <Users size={52} className="smeet-empty-icon" strokeWidth={1.2} />
          <div className="smeet-empty-title">Chưa có cuộc họp nào</div>
          <div className="smeet-empty-sub">
            {search ? "Không tìm thấy kết quả." : `Chưa có cuộc họp trong năm ${filterYear}. Nhấn "Tạo cuộc họp mới" để bắt đầu.`}
          </div>
          {!search && (
            <button className="smeet-btn smeet-btn-primary" style={{ marginTop: 4 }} onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Tạo cuộc họp đầu tiên
            </button>
          )}
        </div>
      )}

      {!loading && !error && displayed.length > 0 && (
        <div className="smeet-list">
          {displayed.map((m) => (
            <MeetingCard key={m.id} meeting={m} selected={selected?.id === m.id}
              onSelect={() => setSelected(selected?.id === m.id ? null : m)}
              onDelete={() => handleDelete(m)}
            />
          ))}
        </div>
      )}

      {selected && createPortal(
        <DetailPanel meeting={selected} onClose={() => setSelected(null)} onUpdate={handleUpdate} />,
        document.body
      )}
      {showCreate && createPortal(
        <CreateMeetingModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />,
        document.body
      )}
    </div>
  );
}

export default SafetyMeetingPage;
