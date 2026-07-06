// @ts-nocheck
import { useState, useMemo, useEffect, useRef } from "react";
import { getText } from "../i18n";
import type { HubDepartment, SafetyAction } from "../core/hubCore";
import type { HubLanguage } from "../i18n-context";

// ── Types ──────────────────────────────────────────────────────────────────
type Sev      = "high" | "medium" | "low";
type Status   = "open" | "done" | "closed";
type Step     = "overview" | "list" | "detail";
type DetailTab = "content" | "evidence" | "history";

interface EvidenceFile {
  fileName: string;
  originalName?: string;
  url: string;
  mimeType?: string;
  uploadedAt?: string;
}
interface ActionLog {
  id: string;
  action: string;
  actorName: string;
  actorRole?: string;
  summary?: string;
  createdAt: string;
}

// ── Meta ────────────────────────────────────────────────────────────────────
const SEV_META: Record<Sev, { label:string; color:string; bg:string; border:string; dot:string }> = {
  high:   { label:"Ưu tiên cao",  color:"#dc2626", bg:"#fef2f2", border:"#fecaca", dot:"#dc2626" },
  medium: { label:"Cần theo dõi", color:"#d97706", bg:"#fffbeb", border:"#fde68a", dot:"#d97706" },
  low:    { label:"Bình thường",  color:"#059669", bg:"#ecfdf5", border:"#a7f3d0", dot:"#059669" },
};
const STS_META: Record<Status, { label:string; color:string; bg:string; border:string }> = {
  open:   { label:"Đang xử lý",   color:"#d97706", bg:"#fffbeb", border:"#fde68a" },
  done:   { label:"Đã khắc phục", color:"#059669", bg:"#ecfdf5", border:"#a7f3d0" },
  closed: { label:"Đã đóng",      color:"#64748b", bg:"#f8fafc", border:"#e2e8f0" },
};
const SEV_ORDER: Sev[] = ["high", "medium", "low"];

const LOG_META: Record<string, { icon: string; label: string; color: string }> = {
  "created":          { icon:"✨", label:"Tạo mục",          color:"#2563eb" },
  "updated":          { icon:"✏️", label:"Cập nhật thông tin", color:"#7c3aed" },
  "evidence-submitted":{ icon:"📋", label:"Nộp bằng chứng",   color:"#059669" },
  "files-attached":   { icon:"📎", label:"Đính kèm file",     color:"#0891b2" },
  "verified":         { icon:"✅", label:"EHS xác nhận",       color:"#059669" },
  "reopened":         { icon:"🔄", label:"Mở lại",            color:"#d97706" },
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function normSev(raw: unknown): Sev {
  if (raw === "high")   return "high";
  if (raw === "medium") return "medium";
  if (raw === "low")    return "low";
  return "medium";
}
function normStatus(raw: unknown): Status {
  const s = String(raw || "").toLowerCase();
  if (["closed","verified"].includes(s)) return "closed";
  if (["done","done_by_owner","resolved"].includes(s)) return "done";
  return "open";
}
function actionCode(action: SafetyAction, idx: number): string {
  const c = typeof action.code === "string" ? action.code : "";
  return c || `AT6S-${String(idx + 1).padStart(3, "0")}`;
}
function actionUpdatedAt(action: SafetyAction): string {
  const v = (action.updatedAt || action.createdAt || action.due || "") as string;
  if (!v) return "-";
  if (v.includes("T")) {
    const [d, t = ""] = v.split("T");
    return t.slice(0, 5) ? `${t.slice(0, 5)}, ${d}` : d;
  }
  return v;
}
function isOverdue(action: SafetyAction): boolean {
  if (normStatus(action.status) !== "open") return false;
  const due = String(action.due || "");
  if (!due) return false;
  return new Date(due) < new Date();
}
function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ngày trước`;
  return iso.slice(0, 10);
}
function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
}

// ── Shared small components ─────────────────────────────────────────────────
function Badge({ label, color, bg, border }: { label:string; color:string; bg:string; border:string }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", padding:"2px 9px", borderRadius:20,
      background:bg, color, border:`1px solid ${border}`, fontSize:11.5, fontWeight:700, whiteSpace:"nowrap" }}>
      {label}
    </span>
  );
}
function CodeBadge({ code }: { code:string }) {
  return (
    <span style={{ fontSize:11, fontFamily:"monospace", fontWeight:700, flexShrink:0,
      background:"#eff6ff", color:"#2563eb", border:"1px solid #bfdbfe",
      padding:"2px 7px", borderRadius:6, whiteSpace:"nowrap" }}>
      {code}
    </span>
  );
}
function StatCard({ n, label, sub, icon, color, bg, border }: { n:number; label:string; sub?:string; icon?:string; color:string; bg:string; border:string }) {
  return (
    <div style={{ flex:1, minWidth:100, padding:"10px 14px", borderRadius:12, background:bg,
      border:`1.5px solid ${border}`, display:"flex", alignItems:"center", gap:10 }}>
      {icon && <span style={{ fontSize:18, flexShrink:0 }}>{icon}</span>}
      <div style={{ minWidth:0 }}>
        <span style={{ fontSize:24, fontWeight:800, color, lineHeight:1, display:"block" }}>{n}</span>
        <span style={{ fontSize:12, fontWeight:700, color:"#334155", lineHeight:1.3, display:"block" }}>{label}</span>
        {sub && <span style={{ fontSize:10.5, color:"#94a3b8", lineHeight:1.3, display:"block", marginTop:1 }}>{sub}</span>}
      </div>
    </div>
  );
}
function NavBtn({ dir, disabled, onClick }: { dir:"left"|"right"; disabled:boolean; onClick:()=>void }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width:28, height:28, borderRadius:7, border:"1px solid #e2e8f0",
      background: disabled ? "#f8fafc" : "#fff",
      color: disabled ? "#cbd5e1" : "#475569",
      display:"flex", alignItems:"center", justifyContent:"center", cursor: disabled ? "default" : "pointer",
    }}>
      {dir === "left"
        ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      }
    </button>
  );
}
function ChevronRight({ color="#94a3b8" }: { color?:string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink:0 }}>
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}
function DeptTag({ name }: { name:string }) {
  const COLORS: Record<string, string> = {
    "Sản xuất":"#7c3aed","EHS/6S":"#0891b2","Kỹ thuật":"#0284c7","Văn phòng":"#4f46e5",
    "Hành chính":"#6d28d9","Nhân sự":"#db2777","Kho vận":"#059669","Cơ khí":"#d97706",
  };
  const c = COLORS[name] || "#64748b";
  return (
    <span style={{ display:"inline-flex", alignItems:"center", padding:"2px 8px", borderRadius:6,
      background:`${c}14`, color:c, fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>
      {name}
    </span>
  );
}
function SecHead({ n, title, done }: { n:number; title:string; done:boolean }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
      <span style={{ width:20, height:20, borderRadius:"50%", flexShrink:0, display:"flex",
        alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800,
        background: done ? "#059669" : "#f59e0b", color:"#fff" }}>
        {done
          ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          : n}
      </span>
      <span style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{title}</span>
    </div>
  );
}

// ── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ url, onClose }: { url:string; onClose:()=>void }) {
  return (
    <div onMouseDown={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:1800 }}>
      <img src={url} onMouseDown={e => e.stopPropagation()} alt="preview"
        style={{ maxWidth:"92vw", maxHeight:"88vh", borderRadius:12,
          boxShadow:"0 8px 40px rgba(0,0,0,0.6)" }} />
      <button onMouseDown={onClose} style={{ position:"absolute", top:20, right:24,
        background:"rgba(255,255,255,0.15)", border:"none", color:"#fff",
        borderRadius:"50%", width:40, height:40, fontSize:20, cursor:"pointer",
        display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  actions: SafetyAction[];
  departments?: HubDepartment[];
  initialId?: string;
  isEhsAdmin?: boolean;
  lang: HubLanguage;
  onClose: () => void;
  onViewBulletins?: () => void;
}

// ── Main component ───────────────────────────────────────────────────────────
export function ActionViewModal({ actions: initialActions, departments = [], initialId, isEhsAdmin = false, lang, onClose, onViewBulletins }: Props) {
  const [step, setStep]             = useState<Step>(initialId ? "detail" : "overview");
  const [selectedId, setSelectedId] = useState(initialId || initialActions[0]?.id || "");
  const [sevFilter, setSevFilter]   = useState<Sev | "">("");
  const [query, setQuery]           = useState("");
  const [detailTab, setDetailTab]   = useState<DetailTab>("content");

  const [localActions, setLocalActions] = useState<SafetyAction[]>(initialActions);

  const [editMode, setEditMode]     = useState(false);
  const [editForm, setEditForm]     = useState({ title:"", description:"", ownerName:"", dueDate:"" });
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState("");

  const [evNotes, setEvNotes]       = useState("");
  const [evFiles, setEvFiles]       = useState<File[]>([]);
  const [evSubmitting, setEvSubmitting] = useState(false);
  const [evError, setEvError]       = useState("");
  const [evSuccess, setEvSuccess]   = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState("");

  const [logs, setLogs]             = useState<ActionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsLoaded, setLogsLoaded] = useState(false);

  const [verifyNote, setVerifyNote]   = useState("");
  const [verifying, setVerifying]     = useState(false);
  const [verifyError, setVerifyError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const actions = localActions;
  const selected = actions.find(a => a.id === selectedId) || actions[0];
  const idx      = actions.findIndex(a => a.id === selectedId);

  const highCount    = actions.filter(a => normSev(a.severity) === "high").length;
  const medCount     = actions.filter(a => normSev(a.severity) === "medium").length;
  const openCount    = actions.filter(a => normStatus(a.status) === "open").length;
  const overdueCount = actions.filter(isOverdue).length;

  const listItems = useMemo(() => actions.filter(a => {
    const matchS = !sevFilter || normSev(a.severity) === sevFilter;
    const matchQ = !query || getText(a.title, lang).toLowerCase().includes(query.toLowerCase());
    return matchS && matchQ;
  }), [actions, sevFilter, query, lang]);

  const openDetail = (a: SafetyAction) => {
    setSelectedId(a.id);
    setStep("detail");
    setDetailTab("content");
    setEditMode(false);
    setEvSuccess(false);
    setEvNotes("");
    setEvFiles([]);
    setLogsLoaded(false);
    setLogs([]);
  };

  const deptName = (deptId: unknown) => {
    const d = departments.find(d => d.id === deptId);
    return d ? getText(d.name, lang) : String(deptId || "—");
  };

  const sm = selected ? SEV_META[normSev(selected.severity)] : SEV_META.medium;
  const st = selected ? STS_META[normStatus(selected.status)] : STS_META.open;

  const updateLocal = (updated: SafetyAction) => {
    setLocalActions(prev => prev.map(a => a.id === updated.id ? updated : a));
  };

  const startEdit = () => {
    if (!selected) return;
    setEditForm({
      title:       getText(selected.title, lang) || String(selected.title || ""),
      description: String(selected.description || ""),
      ownerName:   String(selected.ownerName || selected.owner || ""),
      dueDate:     String(selected.dueDate || selected.due || ""),
    });
    setEditMode(true);
    setSaveError("");
  };

  const saveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/actions/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type":"application/json" },
        credentials: "include",
        body: JSON.stringify({
          title:       editForm.title || undefined,
          description: editForm.description || undefined,
          ownerName:   editForm.ownerName || undefined,
          dueDate:     editForm.dueDate || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      updateLocal({ ...selected, ...updated });
      setEditMode(false);
    } catch (err: any) {
      setSaveError(err.message || "Lỗi khi lưu");
    } finally {
      setSaving(false);
    }
  };

  const submitEvidence = async () => {
    if (!selected) return;
    setEvSubmitting(true);
    setEvError("");
    setEvSuccess(false);
    try {
      let updatedAction = selected;
      if (evFiles.length) {
        const fd = new FormData();
        evFiles.forEach(f => fd.append("files", f));
        const upRes = await fetch(`/api/actions/${selected.id}/upload-evidence`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        if (!upRes.ok) throw new Error(await upRes.text());
        updatedAction = await upRes.json();
        updateLocal(updatedAction);
      }
      if (evNotes.trim() || normStatus(selected.status) === "open") {
        const evRes = await fetch(`/api/actions/${selected.id}/submit-evidence`, {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          credentials: "include",
          body: JSON.stringify({ evidenceNotes: evNotes || "Đã gửi bằng chứng hoàn thành" }),
        });
        if (!evRes.ok) throw new Error(await evRes.text());
        updatedAction = await evRes.json();
        updateLocal(updatedAction);
      }
      setEvSuccess(true);
      setEvNotes("");
      setEvFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setLogsLoaded(false);
    } catch (err: any) {
      setEvError(err.message || "Lỗi khi gửi bằng chứng");
    } finally {
      setEvSubmitting(false);
    }
  };

  const callVerify = async (approved: boolean) => {
    if (!selected) return;
    setVerifying(true);
    setVerifyError("");
    try {
      const res = await fetch(`/api/actions/${selected.id}/verify`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        credentials: "include",
        body: JSON.stringify({ approved, note: verifyNote || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      updateLocal({ ...selected, ...updated });
      setVerifyNote("");
      setLogsLoaded(false);
    } catch (err: any) {
      setVerifyError(err.message || "Lỗi khi gọi API");
    } finally {
      setVerifying(false);
    }
  };

  const loadLogs = async () => {
    if (!selected || logsLoaded || logsLoading) return;
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/actions/${selected.id}/logs`, { credentials:"include" });
      if (res.ok) setLogs(await res.json());
    } catch {}
    setLogsLoading(false);
    setLogsLoaded(true);
  };

  useEffect(() => {
    if (detailTab === "history" && !logsLoaded) loadLogs();
  }, [detailTab, selectedId]);

  if (!actions.length) return null;

  return (
    <>
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl("")} />}

      <div
        role="presentation"
        onMouseDown={onClose}
        style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)", display:"flex",
          alignItems:"center", justifyContent:"center", zIndex:1200,
          fontFamily:"system-ui,-apple-system,'Segoe UI',sans-serif" }}>

        <div
          role="dialog"
          aria-modal="true"
          aria-label="Việc an toàn cần xử lý"
          onMouseDown={e => e.stopPropagation()}
          style={{ width:1100, maxWidth:"calc(100vw - 24px)", height:820, maxHeight:"calc(100vh - 24px)",
            background:"#ffffff", borderRadius:18, overflow:"hidden",
            boxShadow:"0 32px 80px rgba(15,30,60,0.25), 0 4px 20px rgba(15,30,60,0.1)",
            border:"1px solid #e2e8f0", display:"flex", flexDirection:"column" }}>

          {/* ── TOPBAR ────────────────────────────────────────────────────── */}
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 32px",
            borderBottom:"1px solid #e8edf3", background:"#fff", flexShrink:0 }}>

            <div style={{ width:34, height:34, borderRadius:9,
              background:"linear-gradient(135deg,#fef2f2,#fee2e2)",
              border:"1.5px solid #fecaca", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.4" strokeLinecap="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>

            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:10.5, fontWeight:700, color:"#94a3b8", letterSpacing:"0.8px", textTransform:"uppercase", marginBottom:1 }}>
                An toàn lao động · MHChub
              </div>
              <div style={{ fontSize:15, fontWeight:800, color:"#0f172a" }}>
                Việc an toàn cần xử lý
              </div>
            </div>

            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              {highCount > 0 && (
                <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:20,
                  background:"#fef2f2", border:"1px solid #fecaca", fontSize:12, fontWeight:700, color:"#dc2626" }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:"#dc2626", flexShrink:0 }} />
                  {highCount} ưu tiên cao
                </span>
              )}
              <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:20,
                background:"#fffbeb", border:"1px solid #fde68a", fontSize:12, fontWeight:700, color:"#d97706" }}>
                {openCount} đang mở
              </span>
            </div>

            <div style={{ width:1, height:22, background:"#e2e8f0", margin:"0 4px" }} />

            <button onClick={onClose} title="Đóng" style={{ width:32, height:32, borderRadius:8, border:"1px solid #e2e8f0",
              background:"#f8fafc", display:"flex", alignItems:"center", justifyContent:"center",
              color:"#94a3b8", cursor:"pointer", flexShrink:0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* ── NAV TABS ──────────────────────────────────────────────────── */}
          <div style={{ display:"flex", alignItems:"center", borderBottom:"1px solid #e8edf3",
            background:"#fafbfc", padding:"0 32px", flexShrink:0 }}>
            {(["overview","list","detail"] as Step[]).map((s, i) => {
              const labels = ["Tổng quan","Danh sách","Chi tiết"];
              const done = (s === "overview" && (step === "list" || step === "detail"))
                        || (s === "list" && step === "detail");
              const active = s === step;
              const canClick = s !== "detail" || step === "detail";
              const clickable = done || active || s === "list";
              return (
                <button key={s}
                  onClick={() => canClick && clickable && (s === "list"
                    ? (setSevFilter(""), setStep("list"))
                    : (setStep(s), s === "detail" && setDetailTab("content")))}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"11px 16px",
                    background:"none", border:"none",
                    borderBottom: active ? "2.5px solid #f59e0b" : "2.5px solid transparent",
                    cursor: (canClick && clickable) ? "pointer" : "default",
                    marginBottom:-1, opacity: s === "detail" && step !== "detail" ? 0.4 : 1 }}>
                  <span style={{ width:19, height:19, borderRadius:"50%", flexShrink:0,
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800,
                    background: done ? "#059669" : active ? "#f59e0b" : "#e2e8f0",
                    color: (done||active) ? "#fff" : "#94a3b8" }}>
                    {done
                      ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      : i+1}
                  </span>
                  <span style={{ fontSize:13, fontWeight: active ? 700 : 500,
                    color: active ? "#b45309" : done ? "#475569" : "#94a3b8" }}>
                    {labels[i]}
                  </span>
                </button>
              );
            })}
            <div style={{ flex:1 }} />
            <span style={{ fontSize:12, color:"#94a3b8", paddingRight:4 }}>{actions.length} mục cần xử lý</span>
          </div>

          {/* ── CONTENT ───────────────────────────────────────────────────── */}
          <div style={{ flex:1, minHeight:0, overflowY:"auto", background:"#f8fafc" }}>

            {/* ── TỔNG QUAN ──────────────────────────────────────────────── */}
            {step === "overview" && (
              <div style={{ padding:"20px 36px", display:"flex", flexDirection:"column", gap:16 }}>
                {highCount > 0 && (
                  <div style={{ display:"flex", alignItems:"center", gap:12, background:"#fef2f2",
                    border:"1.5px solid #fecaca", borderRadius:12, padding:"12px 16px", borderLeft:"4px solid #dc2626" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink:0 }}>
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <div style={{ flex:1 }}>
                      <span style={{ fontSize:13.5, color:"#991b1b", fontWeight:700 }}>{highCount} mục ưu tiên cao đang chờ xử lý</span>
                      <span style={{ fontSize:13, color:"#b91c1c", fontWeight:500 }}>{" "}· {openCount} mục đang mở</span>
                    </div>
                    <button onClick={() => { setSevFilter("high"); setStep("list"); }}
                      style={{ display:"flex", alignItems:"center", gap:4, padding:"5px 11px", borderRadius:7,
                        background:"#dc2626", border:"none", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                      Xem ngay <ChevronRight color="#fff" />
                    </button>
                  </div>
                )}
                <div style={{ display:"flex", gap:10 }}>
                  <StatCard n={actions.length} label="Tổng CAPA" sub="đang theo dõi" icon="◈" color="#2563eb" bg="#eff6ff" border="#bfdbfe" />
                  {highCount > 0 && <StatCard n={highCount} label="Ưu tiên cao" sub="cần xử lý ngay" icon="▲" color="#dc2626" bg="#fef2f2" border="#fecaca" />}
                  {medCount > 0 && <StatCard n={medCount} label="Cần theo dõi" sub="theo dõi thường xuyên" icon="◎" color="#d97706" bg="#fffbeb" border="#fde68a" />}
                  <StatCard n={openCount} label="Đang mở" sub="chưa hoàn thành" icon="⊙" color="#64748b" bg="#f8fafc" border="#e2e8f0" />
                  {overdueCount > 0 && <StatCard n={overdueCount} label="Quá hạn" sub="cần xử lý gấp" icon="⚠" color="#be123c" bg="#fff1f2" border="#fda4af" />}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {SEV_ORDER.map(sev => {
                    const items = actions.filter(a => normSev(a.severity) === sev);
                    if (!items.length) return null;
                    const m = SEV_META[sev];
                    const openN = items.filter(a => normStatus(a.status) === "open").length;
                    return (
                      <div key={sev} style={{ background:"#fff", borderRadius:14, border:"1.5px solid #e8edf3",
                        overflow:"hidden", boxShadow:"0 1px 4px rgba(15,30,60,0.05)" }}>
                        <button onClick={() => { setSevFilter(sev); setStep("list"); }}
                          style={{ display:"flex", alignItems:"center", gap:10, width:"100%",
                            padding:"12px 18px", background:`${m.color}10`, border:"none",
                            borderBottom:"1.5px solid #e8edf3", cursor:"pointer", textAlign:"left" }}>
                          <span style={{ width:10, height:10, borderRadius:"50%", background:m.dot, flexShrink:0 }} />
                          <span style={{ flex:1, fontSize:13.5, fontWeight:800, color:"#0f172a" }}>{m.label}</span>
                          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                            {openN > 0 && (
                              <span style={{ padding:"2px 9px", borderRadius:20, background:m.bg,
                                border:`1px solid ${m.border}`, color:m.color, fontSize:11.5, fontWeight:700 }}>
                                {openN} đang mở
                              </span>
                            )}
                            <span style={{ padding:"2px 9px", borderRadius:20, background:`${m.color}20`,
                              color:m.color, fontSize:11.5, fontWeight:700 }}>{items.length} mục</span>
                            <ChevronRight color={m.color} />
                          </div>
                        </button>
                        <div>
                          {items.map((a, ii) => {
                            const sts = STS_META[normStatus(a.status)];
                            const overdue = isOverdue(a);
                            const aidx = actions.indexOf(a);
                            return (
                              <button key={a.id} onClick={() => openDetail(a)}
                                style={{ display:"flex", alignItems:"center", gap:12, width:"100%",
                                  padding:"14px 18px 14px 24px", background:"#fff", border:"none",
                                  borderBottom: ii < items.length-1 ? "1px solid #f1f5f9" : "none",
                                  cursor:"pointer", textAlign:"left" }}>
                                <span style={{ width:7, height:7, borderRadius:"50%", background:m.dot, flexShrink:0 }} />
                                <CodeBadge code={actionCode(a, aidx)} />
                                <span style={{ flex:1, fontSize:13, fontWeight:600, color:"#0f172a",
                                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                  {getText(a.title, lang)}
                                </span>
                                <DeptTag name={deptName(a.departmentId)} />
                                <Badge label={sts.label} color={sts.color} bg={sts.bg} border={sts.border} />
                                <span style={{ fontSize:11.5, color: overdue ? "#dc2626" : "#475569",
                                  fontWeight: overdue ? 700 : 500, flexShrink:0, minWidth:90, textAlign:"right" }}>
                                  Hạn: {String(a.due || "—")}
                                </span>
                                <ChevronRight />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── DANH SÁCH ─────────────────────────────────────────────── */}
            {step === "list" && (
              <div style={{ padding:"16px 36px", display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ display:"flex", gap:8, alignItems:"center", background:"#fff",
                  padding:"10px 14px", borderRadius:12, border:"1.5px solid #e8edf3" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm kiếm theo tên, bộ phận..."
                    style={{ flex:1, border:"none", outline:"none", fontSize:13, color:"#0f172a", background:"transparent" }} />
                  {query && <button onClick={() => setQuery("")} style={{ background:"none", border:"none", color:"#94a3b8", cursor:"pointer", fontSize:13 }}>✕</button>}
                  <div style={{ width:1, height:16, background:"#e2e8f0" }} />
                  {(["","high","medium","low"] as (Sev|"")[]).map(sev => {
                    const m   = sev ? SEV_META[sev] : null;
                    const cnt = sev ? actions.filter(a => normSev(a.severity) === sev).length : actions.length;
                    const isAct = sevFilter === sev;
                    return (
                      <button key={sev} onClick={() => setSevFilter(sev as Sev|"")}
                        style={{ padding:"4px 10px", borderRadius:8,
                          border:`1.5px solid ${isAct ? (m?.color||"#2563eb") : "#e2e8f0"}`,
                          background: isAct ? (m?.bg||"#eff6ff") : "#fff",
                          color: isAct ? (m?.color||"#2563eb") : "#64748b",
                          fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
                        {sev ? m!.label : "Tất cả"} ({cnt})
                      </button>
                    );
                  })}
                </div>
                <div style={{ background:"#fff", borderRadius:14, border:"1.5px solid #e8edf3",
                  overflow:"hidden", boxShadow:"0 1px 4px rgba(15,30,60,0.05)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 18px",
                    background:"#f8fafc", borderBottom:"1.5px solid #e8edf3" }}>
                    {["Mã","Nội dung","Bộ phận","Mức độ","Trạng thái","Người tạo","Hạn xử lý",""].map((h, i) => (
                      <span key={i} style={{ fontSize:11, fontWeight:700, color:"#94a3b8",
                        textTransform:"uppercase", letterSpacing:"0.5px",
                        flex: i === 1 ? 1 : undefined,
                        minWidth: [70,0,90,100,110,110,95,20][i] || undefined }}>{h}</span>
                    ))}
                  </div>
                  {!listItems.length && (
                    <div style={{ padding:"32px", textAlign:"center", color:"#94a3b8", fontSize:13 }}>Không có mục nào phù hợp</div>
                  )}
                  {listItems.map((a, i) => {
                    const m   = SEV_META[normSev(a.severity)];
                    const sts = STS_META[normStatus(a.status)];
                    const overdue = isOverdue(a);
                    const aidx = actions.indexOf(a);
                    const evCount = Array.isArray(a.evidenceFiles) ? (a.evidenceFiles as any[]).length : 0;
                    return (
                      <button key={a.id} onClick={() => openDetail(a)}
                        style={{ display:"flex", alignItems:"center", gap:12, width:"100%", padding:"14px 18px",
                          background: i % 2 === 0 ? "#fff" : "#fafbfc", border:"none",
                          borderBottom: i < listItems.length-1 ? "1px solid #f1f5f9" : "none",
                          cursor:"pointer", textAlign:"left" }}>
                        <CodeBadge code={actionCode(a, aidx)} />
                        <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:2 }}>
                          <span style={{ fontSize:13, fontWeight:600, color:"#0f172a",
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {getText(a.title, lang)}
                          </span>
                          {evCount > 0 && (
                            <span style={{ fontSize:11, color:"#2563eb", fontWeight:600 }}>📎 {evCount} file</span>
                          )}
                        </div>
                        <div style={{ minWidth:90 }}><DeptTag name={deptName(a.departmentId)} /></div>
                        <div style={{ minWidth:100, display:"flex", alignItems:"center", gap:5 }}>
                          <span style={{ width:7, height:7, borderRadius:"50%", background:m.dot }} />
                          <span style={{ fontSize:12, fontWeight:700, color:m.color }}>{m.label}</span>
                        </div>
                        <div style={{ minWidth:110 }}>
                          <Badge label={sts.label} color={sts.color} bg={sts.bg} border={sts.border} />
                        </div>
                        <div style={{ minWidth:110, display:"flex", flexDirection:"column", gap:1 }}>
                          <span style={{ fontSize:12, fontWeight:600, color:"#334155", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {String((a as any).createdByName || (a as any).createdBy || "—")}
                          </span>
                          {(a as any).createdAt && (
                            <span style={{ fontSize:10.5, color:"#94a3b8" }}>
                              {String((a as any).createdAt).slice(0,10)}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize:12, color: overdue ? "#dc2626" : "#475569",
                          fontWeight: overdue ? 700 : 500, minWidth:95, textAlign:"right" }}>
                          {String(a.due || "—")}
                        </span>
                        <ChevronRight />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── CHI TIẾT ──────────────────────────────────────────────── */}
            {step === "detail" && selected && (
              <div style={{ padding:"20px 36px", display:"flex", flexDirection:"column", gap:14 }}>

                {/* Header */}
                <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                  <button onClick={() => setStep("list")}
                    style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:8,
                      border:"1.5px solid #e2e8f0", background:"#fff", color:"#475569",
                      fontSize:12, fontWeight:600, cursor:"pointer", flexShrink:0, marginTop:2 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                    Danh sách
                  </button>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                      <CodeBadge code={actionCode(selected, idx)} />
                      <Badge label={sm.label} color={sm.color} bg={sm.bg} border={sm.border} />
                      <Badge label={st.label} color={st.color} bg={st.bg} border={st.border} />
                      <DeptTag name={deptName(selected.departmentId)} />
                    </div>
                    <h2 style={{ margin:0, fontSize:17, fontWeight:800, color:"#0f172a", lineHeight:1.35 }}>
                      {editMode ? editForm.title : getText(selected.title, lang)}
                    </h2>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                    {!editMode && (
                      <button onClick={startEdit}
                        title="Sửa thông tin"
                        style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:8,
                          border:"1.5px solid #e2e8f0", background:"#fff", color:"#475569",
                          fontSize:12, fontWeight:600, cursor:"pointer" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        Sửa
                      </button>
                    )}
                    <NavBtn dir="left" disabled={idx <= 0} onClick={() => { setSelectedId(actions[idx-1].id); setEditMode(false); setEvSuccess(false); setLogsLoaded(false); setLogs([]); }} />
                    <span style={{ fontSize:12, fontWeight:700, color:"#64748b", padding:"0 4px" }}>{idx+1}/{actions.length}</span>
                    <NavBtn dir="right" disabled={idx >= actions.length-1} onClick={() => { setSelectedId(actions[idx+1].id); setEditMode(false); setEvSuccess(false); setLogsLoaded(false); setLogs([]); }} />
                  </div>
                </div>

                {/* ── EDIT FORM ────────────────────────────────────────── */}
                {editMode && (
                  <div style={{ background:"#fffbeb", border:"2px solid #fde68a", borderRadius:14, padding:"18px 20px" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"#92400e", marginBottom:14 }}>✏️ Chỉnh sửa thông tin</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                      <label style={{ display:"flex", flexDirection:"column", gap:5 }}>
                        <span style={{ fontSize:11.5, fontWeight:700, color:"#64748b" }}>Tiêu đề</span>
                        <input value={editForm.title} onChange={e => setEditForm(f => ({...f, title:e.target.value}))}
                          style={{ border:"1.5px solid #fcd34d", borderRadius:8, padding:"7px 10px",
                            fontSize:13, color:"#0f172a", outline:"none", background:"#fff" }} />
                      </label>
                      <label style={{ display:"flex", flexDirection:"column", gap:5 }}>
                        <span style={{ fontSize:11.5, fontWeight:700, color:"#64748b" }}>Người phụ trách</span>
                        <input value={editForm.ownerName} onChange={e => setEditForm(f => ({...f, ownerName:e.target.value}))}
                          placeholder="Họ tên người phụ trách"
                          style={{ border:"1.5px solid #fcd34d", borderRadius:8, padding:"7px 10px",
                            fontSize:13, color:"#0f172a", outline:"none", background:"#fff" }} />
                      </label>
                    </div>
                    <label style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:12 }}>
                      <span style={{ fontSize:11.5, fontWeight:700, color:"#64748b" }}>Hạn xử lý</span>
                      <input type="date" value={editForm.dueDate} onChange={e => setEditForm(f => ({...f, dueDate:e.target.value}))}
                        style={{ border:"1.5px solid #fcd34d", borderRadius:8, padding:"7px 10px",
                          fontSize:13, color:"#0f172a", outline:"none", background:"#fff", maxWidth:200 }} />
                    </label>
                    <label style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:14 }}>
                      <span style={{ fontSize:11.5, fontWeight:700, color:"#64748b" }}>Mô tả / Yêu cầu</span>
                      <textarea value={editForm.description} onChange={e => setEditForm(f => ({...f, description:e.target.value}))}
                        rows={3}
                        style={{ border:"1.5px solid #fcd34d", borderRadius:8, padding:"7px 10px",
                          fontSize:13, color:"#0f172a", outline:"none", resize:"vertical", background:"#fff",
                          fontFamily:"inherit" }} />
                    </label>
                    {saveError && <div style={{ color:"#dc2626", fontSize:12, marginBottom:10 }}>{saveError}</div>}
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={saveEdit} disabled={saving}
                        style={{ padding:"7px 18px", borderRadius:8, background:"#d97706", border:"none",
                          color:"#fff", fontSize:13, fontWeight:700, cursor: saving ? "wait" : "pointer" }}>
                        {saving ? "Đang lưu…" : "Lưu thay đổi"}
                      </button>
                      <button onClick={() => setEditMode(false)}
                        style={{ padding:"7px 14px", borderRadius:8, background:"#f8fafc",
                          border:"1.5px solid #e2e8f0", color:"#475569", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                        Huỷ
                      </button>
                    </div>
                  </div>
                )}

                {/* ── DETAIL SUB-TABS ───────────────────────────────────── */}
                <div style={{ display:"flex", gap:2, borderBottom:"1.5px solid #e8edf3", paddingBottom:-1 }}>
                  {([
                    { id:"content",  label:"📄 Nội dung" },
                    { id:"evidence", label:"📎 Bằng chứng" },
                    { id:"history",  label:"📋 Lịch sử" },
                  ] as { id:DetailTab; label:string }[]).map(tab => (
                    <button key={tab.id}
                      onClick={() => { setDetailTab(tab.id); if (tab.id === "history") setLogsLoaded(false); }}
                      style={{ padding:"8px 16px", borderRadius:"8px 8px 0 0", border:"1.5px solid",
                        borderColor: detailTab === tab.id ? "#e8edf3" : "transparent",
                        borderBottom: detailTab === tab.id ? "2px solid #fff" : "2px solid transparent",
                        background: detailTab === tab.id ? "#fff" : "transparent",
                        color: detailTab === tab.id ? "#0f172a" : "#64748b",
                        fontSize:13, fontWeight: detailTab === tab.id ? 700 : 500,
                        cursor:"pointer", marginBottom:-2 }}>
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* ── NỘI DUNG ─────────────────────────────────────────── */}
                {detailTab === "content" && (
                  <div style={{ display:"flex", gap:14 }}>
                    <div style={{ flex:3, display:"flex", flexDirection:"column", gap:12 }}>
                      <div style={{ background:"#fff", borderRadius:14, border:"1.5px solid #e8edf3",
                        padding:"16px 18px", boxShadow:"0 1px 4px rgba(15,30,60,0.04)" }}>
                        <SecHead n={1} title="Mô tả / Yêu cầu" done={false} />
                        <p style={{ margin:0, fontSize:13.5, color:"#334155", lineHeight:1.7 }}>
                          {typeof selected.description === "string" && selected.description
                            ? selected.description
                            : getText(selected.title, lang)}
                        </p>
                      </div>
                      {Array.isArray(selected.actionsDone) && selected.actionsDone.length > 0 && (
                        <div style={{ background:"#f0fdf4", borderRadius:14, border:"1.5px solid #a7f3d0", padding:"14px 18px" }}>
                          <SecHead n={2} title="Đã thực hiện" done={true} />
                          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                            {(selected.actionsDone as string[]).map((item, i) => (
                              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                                <span style={{ width:18, height:18, borderRadius:"50%", background:"#059669", flexShrink:0,
                                  display:"flex", alignItems:"center", justifyContent:"center", marginTop:1 }}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                                </span>
                                <span style={{ fontSize:13, color:"#166534", lineHeight:1.5 }}>{item}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {Array.isArray(selected.nextSteps) && selected.nextSteps.length > 0 && (
                        <div style={{ background:"#fffbeb", borderRadius:14, border:"1.5px solid #fde68a", padding:"14px 18px" }}>
                          <SecHead n={3} title="Bước tiếp theo" done={false} />
                          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                            {(selected.nextSteps as string[]).map((item, i) => (
                              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                                <span style={{ width:18, height:18, borderRadius:"50%", background:"#d97706", flexShrink:0,
                                  display:"flex", alignItems:"center", justifyContent:"center",
                                  color:"#fff", fontSize:10, fontWeight:800, marginTop:1 }}>{i+1}</span>
                                <span style={{ fontSize:13, color:"#92400e", lineHeight:1.5 }}>{item}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:10 }}>
                      {/* Cross-link to bulletins */}
                      {onViewBulletins && (
                        <button onClick={onViewBulletins}
                          style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 13px",
                            background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:10,
                            cursor:"pointer", textAlign:"left", width:"100%" }}>
                          <span style={{ fontSize:15, lineHeight:1 }}>📰</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:700, color:"#1d4ed8" }}>Bảng tin liên quan</div>
                            <div style={{ fontSize:11, color:"#64748b", marginTop:1 }}>Xem thông báo ATLĐ cùng kỳ</div>
                          </div>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                        </button>
                      )}
                      {/* Meta card */}
                      <div style={{ background:"#fff", borderRadius:14, border:"1.5px solid #e8edf3",
                        overflow:"hidden", boxShadow:"0 1px 4px rgba(15,30,60,0.04)" }}>
                        {[
                          { label:"Người phụ trách", value: String(selected.ownerName || selected.owner || ""), icon:"👤" },
                          { label:"Bộ phận",          value: deptName(selected.departmentId), icon:"🏢" },
                          ...(((selected as any).locationId || (selected as any).location)
                            ? [{ label:"Khu vực", value: String((selected as any).locationId || (selected as any).location || ""), icon:"📍" }]
                            : []),
                          { label:"Hạn xử lý",        value: String(selected.dueDate || selected.due || "—"), icon:"📅", overdue: isOverdue(selected) },
                          ...(((selected as any).sourceType && (selected as any).sourceType !== "manual")
                            ? [{ label:"Nguồn phát sinh", value: String((selected as any).sourceCode || (selected as any).sourceType || ""), icon:"🔗" }]
                            : []),
                        ].filter(r => r.value && r.value !== "—").map((row, i, arr) => (
                          <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"12px 16px",
                            borderBottom: i < arr.length-1 ? "1px solid #f1f5f9" : "none" }}>
                            <span style={{ fontSize:15, flexShrink:0, marginTop:1 }}>{row.icon}</span>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", marginBottom:2 }}>{row.label}</div>
                              <div style={{ fontSize:13, fontWeight:600,
                                color: (row as any).overdue ? "#dc2626" : "#0f172a",
                                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                {row.value}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Audit trail card */}
                      {((selected as any).createdByName || (selected as any).createdBy || (selected as any).updatedByName) && (
                        <div style={{ background:"#fff", borderRadius:14, border:"1.5px solid #e8edf3",
                          overflow:"hidden", boxShadow:"0 1px 4px rgba(15,30,60,0.04)" }}>
                          <div style={{ padding:"10px 16px 8px", background:"#f8fafc",
                            borderBottom:"1px solid #f1f5f9", fontSize:11, fontWeight:700, color:"#94a3b8",
                            textTransform:"uppercase", letterSpacing:"0.5px" }}>
                            📋 Lịch sử tạo / cập nhật
                          </div>
                          {((selected as any).createdByName || (selected as any).createdBy) && (
                            <div style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"11px 16px",
                              borderBottom:(selected as any).updatedByName ? "1px solid #f1f5f9" : "none" }}>
                              <span style={{ fontSize:13, flexShrink:0, marginTop:1 }}>✏️</span>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", marginBottom:2 }}>Người tạo</div>
                                <div style={{ fontSize:13, fontWeight:600, color:"#0f172a" }}>
                                  {String((selected as any).createdByName || (selected as any).createdBy)}
                                </div>
                                {(selected as any).createdAt && (
                                  <div style={{ fontSize:11.5, color:"#64748b", marginTop:2 }}>
                                    {String((selected as any).createdAt).slice(0,16).replace("T"," ")}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          {((selected as any).updatedByName || (selected as any).updatedBy) && (
                            <div style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"11px 16px" }}>
                              <span style={{ fontSize:13, flexShrink:0, marginTop:1 }}>🔄</span>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", marginBottom:2 }}>Cập nhật lần cuối</div>
                                <div style={{ fontSize:13, fontWeight:600, color:"#0f172a" }}>
                                  {String((selected as any).updatedByName || (selected as any).updatedBy)}
                                </div>
                                {(selected as any).updatedAt && (
                                  <div style={{ fontSize:11.5, color:"#64748b", marginTop:2 }}>
                                    {String((selected as any).updatedAt).slice(0,16).replace("T"," ")}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Progress timeline card */}
                      {(() => {
                        const st = normStatus(selected.status);
                        const steps = [
                          { key:"open",   label:"Tạo CAPA",      icon:"📝" },
                          { key:"open",   label:"Đang xử lý",    icon:"🔧" },
                          { key:"done",   label:"Nộp bằng chứng",icon:"📤" },
                          { key:"done",   label:"EHS xác minh",  icon:"🔍" },
                          { key:"closed", label:"Đã đóng",       icon:"✅" },
                        ];
                        const stepIdx = st === "closed" ? 4 : st === "done" ? 2 : 1;
                        return (
                          <div style={{ background:"#fff", borderRadius:14, border:"1.5px solid #e8edf3",
                            overflow:"hidden", boxShadow:"0 1px 4px rgba(15,30,60,0.04)", padding:"14px 16px" }}>
                            <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase",
                              letterSpacing:"0.5px", marginBottom:12 }}>
                              📊 Tiến trình xử lý
                            </div>
                            {steps.map((s, i) => {
                              const done = i <= stepIdx;
                              const active = i === stepIdx;
                              return (
                                <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom: i < steps.length-1 ? 0 : 0 }}>
                                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0 }}>
                                    <div style={{ width:24, height:24, borderRadius:"50%", display:"flex",
                                      alignItems:"center", justifyContent:"center", fontSize:11,
                                      background: done ? (active ? "#2563eb" : "#22c55e") : "#f1f5f9",
                                      border: `2px solid ${done ? (active ? "#2563eb" : "#22c55e") : "#e2e8f0"}` }}>
                                      {done ? (active ? <span style={{ color:"#fff",fontSize:11 }}>●</span> : <span style={{ color:"#fff",fontSize:11 }}>✓</span>) : <span style={{ color:"#94a3b8",fontSize:10 }}>○</span>}
                                    </div>
                                    {i < steps.length-1 && (
                                      <div style={{ width:2, height:18, background: i < stepIdx ? "#22c55e" : "#e2e8f0", margin:"2px 0" }} />
                                    )}
                                  </div>
                                  <div style={{ paddingBottom: i < steps.length-1 ? 16 : 0, paddingTop:2 }}>
                                    <div style={{ fontSize:12, fontWeight: active ? 700 : 600,
                                      color: done ? (active ? "#2563eb" : "#15803d") : "#94a3b8" }}>
                                      {s.icon} {s.label}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* ── BẰNG CHỨNG ───────────────────────────────────────── */}
                {detailTab === "evidence" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

                    {/* Existing evidence */}
                    {selected.evidenceNotes && (
                      <div style={{ background:"#f0fdf4", borderRadius:12, border:"1.5px solid #a7f3d0", padding:"12px 16px" }}>
                        <div style={{ fontSize:11.5, fontWeight:700, color:"#065f46", marginBottom:6 }}>📋 Ghi chú bằng chứng đã gửi</div>
                        <p style={{ margin:0, fontSize:13.5, color:"#166534", lineHeight:1.6 }}>{String(selected.evidenceNotes)}</p>
                      </div>
                    )}

                    {/* Existing files */}
                    {Array.isArray(selected.evidenceFiles) && selected.evidenceFiles.length > 0 && (
                      <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e8edf3", padding:"14px 16px" }}>
                        <div style={{ fontSize:12, fontWeight:700, color:"#0f172a", marginBottom:12 }}>
                          📎 File đính kèm ({selected.evidenceFiles.length})
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(130px, 1fr))", gap:10 }}>
                          {(selected.evidenceFiles as EvidenceFile[]).map((f, i) => (
                            isImageUrl(f.url)
                              ? <button key={i} onClick={() => setLightboxUrl(f.url)}
                                  style={{ border:"2px solid #e2e8f0", borderRadius:10, overflow:"hidden",
                                    background:"#f8fafc", cursor:"zoom-in", padding:0, textAlign:"left" }}>
                                  <img src={f.url} alt={f.originalName || f.fileName}
                                    style={{ width:"100%", height:90, objectFit:"cover", display:"block" }} />
                                  <div style={{ padding:"5px 8px", fontSize:11, color:"#64748b",
                                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                    {f.originalName || f.fileName}
                                  </div>
                                </button>
                              : <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                                  style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                                    border:"2px solid #e2e8f0", borderRadius:10, background:"#f8fafc",
                                    padding:"16px 8px", textDecoration:"none", gap:6 }}>
                                  <span style={{ fontSize:28 }}>📄</span>
                                  <span style={{ fontSize:11, color:"#2563eb", textAlign:"center",
                                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"100%" }}>
                                    {f.originalName || f.fileName}
                                  </span>
                                </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Upload form */}
                    {normStatus(selected.status) !== "closed" && (
                      <div style={{ background:"#fff", borderRadius:14, border:"1.5px solid #e8edf3", padding:"16px 18px" }}>
                        <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:14 }}>
                          📤 Gửi bằng chứng hoàn thành
                        </div>

                        {evSuccess && (
                          <div style={{ background:"#f0fdf4", border:"1.5px solid #a7f3d0", borderRadius:10,
                            padding:"10px 14px", marginBottom:14, fontSize:13, color:"#059669", fontWeight:600 }}>
                            ✅ Đã gửi bằng chứng thành công! Trạng thái cập nhật sang "Đã khắc phục".
                          </div>
                        )}

                        <label style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:12 }}>
                          <span style={{ fontSize:11.5, fontWeight:700, color:"#64748b" }}>Ghi chú bằng chứng</span>
                          <textarea value={evNotes} onChange={e => setEvNotes(e.target.value)}
                            placeholder="Mô tả ngắn những việc đã thực hiện, kết quả đạt được..."
                            rows={3}
                            style={{ border:"1.5px solid #e2e8f0", borderRadius:8, padding:"8px 12px",
                              fontSize:13, color:"#0f172a", outline:"none", resize:"vertical",
                              fontFamily:"inherit", background:"#f8fafc" }} />
                        </label>

                        <label style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:14 }}>
                          <span style={{ fontSize:11.5, fontWeight:700, color:"#64748b" }}>
                            Đính kèm ảnh / PDF (tối đa 5 file, mỗi file &lt; 10MB)
                          </span>
                          <div style={{ border:"2px dashed #bfdbfe", borderRadius:10, padding:"16px",
                            background:"#f0f9ff", textAlign:"center", cursor:"pointer" }}
                            onClick={() => fileInputRef.current?.click()}>
                            <div style={{ fontSize:24, marginBottom:6 }}>📁</div>
                            <div style={{ fontSize:13, color:"#2563eb", fontWeight:600 }}>
                              {evFiles.length ? `${evFiles.length} file đã chọn` : "Bấm để chọn file"}
                            </div>
                            <div style={{ fontSize:11.5, color:"#94a3b8", marginTop:4 }}>
                              Ảnh (JPG, PNG) hoặc tài liệu PDF
                            </div>
                          </div>
                          <input ref={fileInputRef} type="file" multiple
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            style={{ display:"none" }}
                            onChange={e => setEvFiles(Array.from(e.target.files || []).slice(0, 5))} />
                        </label>

                        {evFiles.length > 0 && (
                          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>
                            {evFiles.map((f, i) => (
                              <div key={i} style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 10px",
                                background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:20, fontSize:12 }}>
                                <span>{f.type.startsWith("image/") ? "🖼️" : "📄"}</span>
                                <span style={{ color:"#1d4ed8", fontWeight:600 }}>
                                  {f.name.length > 24 ? f.name.slice(0,21)+"…" : f.name}
                                </span>
                                <button onClick={() => setEvFiles(prev => prev.filter((_, j) => j !== i))}
                                  style={{ background:"none", border:"none", color:"#94a3b8", cursor:"pointer", fontSize:12 }}>✕</button>
                              </div>
                            ))}
                          </div>
                        )}

                        {evError && <div style={{ color:"#dc2626", fontSize:12, marginBottom:10 }}>{evError}</div>}

                        <button onClick={submitEvidence} disabled={evSubmitting || (!evNotes.trim() && !evFiles.length)}
                          style={{ padding:"9px 22px", borderRadius:9, fontSize:13, fontWeight:700, cursor:"pointer",
                            border:"none", background: evSubmitting ? "#94a3b8" : "#059669", color:"#fff",
                            opacity: (!evNotes.trim() && !evFiles.length) ? 0.5 : 1 }}>
                          {evSubmitting ? "Đang gửi…" : "Gửi bằng chứng"}
                        </button>
                      </div>
                    )}

                    {/* EHS verify panel — chỉ hiện khi action ở trạng thái "done" và user là EHS/Admin */}
                    {isEhsAdmin && normStatus(selected.status) === "done" && (
                      <div style={{ background:"#eff6ff", border:"2px solid #93c5fd", borderRadius:14, padding:"18px 20px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                          <span style={{ fontSize:18 }}>🔍</span>
                          <div>
                            <div style={{ fontSize:13.5, fontWeight:800, color:"#1e40af" }}>EHS xác nhận hoàn thành CAPA</div>
                            <div style={{ fontSize:12, color:"#3b82f6", marginTop:2 }}>
                              Bộ phận đã nộp bằng chứng — EHS xem xét và xác nhận đóng hoặc yêu cầu bổ sung
                            </div>
                          </div>
                        </div>
                        <label style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:12 }}>
                          <span style={{ fontSize:11.5, fontWeight:700, color:"#1e40af" }}>Ghi chú xác nhận (tuỳ chọn)</span>
                          <textarea value={verifyNote} onChange={e => setVerifyNote(e.target.value)}
                            placeholder="Đánh giá kết quả khắc phục, điều kiện đóng CAPA..."
                            rows={2}
                            style={{ border:"1.5px solid #93c5fd", borderRadius:8, padding:"7px 10px",
                              fontSize:13, color:"#0f172a", outline:"none", resize:"vertical",
                              fontFamily:"inherit", background:"#fff" }} />
                        </label>
                        {verifyError && <div style={{ color:"#dc2626", fontSize:12, marginBottom:10 }}>{verifyError}</div>}
                        <div style={{ display:"flex", gap:8 }}>
                          <button onClick={() => callVerify(true)} disabled={verifying}
                            style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 18px",
                              borderRadius:9, background: verifying ? "#94a3b8" : "#059669",
                              border:"none", color:"#fff", fontSize:13, fontWeight:700,
                              cursor: verifying ? "wait" : "pointer" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            {verifying ? "Đang xử lý…" : "Xác nhận đóng CAPA"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Closed info + EHS reopen button */}
                    {normStatus(selected.status) === "closed" && (
                      <div style={{ background:"#f0fdf4", border:"1.5px solid #a7f3d0", borderRadius:12, padding:"16px" }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                          <div style={{ fontSize:13, color:"#059669", fontWeight:600 }}>
                            ✅ Mục này đã được EHS xác nhận đóng. Không thể gửi thêm bằng chứng.
                          </div>
                          {isEhsAdmin && (
                            <button onClick={() => { if (window.confirm("Mở lại mục này? Trạng thái sẽ chuyển về 'Đang xử lý'.")) callVerify(false); }}
                              disabled={verifying}
                              style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 14px",
                                borderRadius:8, background:"#fff", border:"1.5px solid #d97706",
                                color:"#b45309", fontSize:12, fontWeight:700, cursor: verifying ? "wait" : "pointer",
                                flexShrink:0, whiteSpace:"nowrap" }}>
                              🔄 Mở lại
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── LỊCH SỬ ──────────────────────────────────────────── */}
                {detailTab === "history" && (
                  <div style={{ background:"#fff", borderRadius:14, border:"1.5px solid #e8edf3",
                    padding:"16px 20px", boxShadow:"0 1px 4px rgba(15,30,60,0.04)" }}>
                    {logsLoading && (
                      <div style={{ textAlign:"center", padding:"24px", color:"#94a3b8", fontSize:13 }}>
                        Đang tải lịch sử…
                      </div>
                    )}
                    {!logsLoading && logs.length === 0 && (
                      <div style={{ textAlign:"center", padding:"24px", color:"#94a3b8", fontSize:13 }}>
                        Chưa có lịch sử ghi nhận cho mục này.
                      </div>
                    )}
                    {!logsLoading && logs.length > 0 && (
                      <div style={{ display:"flex", flexDirection:"column" }}>
                        {logs.map((log, i) => {
                          const meta = LOG_META[log.action] || { icon:"📌", label:log.action, color:"#64748b" };
                          return (
                            <div key={log.id || i} style={{ display:"flex", gap:14, paddingBottom:16,
                              borderLeft: i < logs.length-1 ? "2px solid #e2e8f0" : "none",
                              marginLeft:10, paddingLeft:20, position:"relative" }}>
                              <div style={{ position:"absolute", left:-10, top:2, width:20, height:20,
                                borderRadius:"50%", background:"#fff", border:`2px solid ${meta.color}`,
                                display:"flex", alignItems:"center", justifyContent:"center", fontSize:11 }}>
                                {meta.icon}
                              </div>
                              <div style={{ flex:1 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                                  <span style={{ fontSize:13, fontWeight:700, color:meta.color }}>{meta.label}</span>
                                  {log.actorName && (
                                    <span style={{ fontSize:12, color:"#475569" }}>· {log.actorName}</span>
                                  )}
                                  {log.actorRole && (
                                    <span style={{ fontSize:11, color:"#94a3b8", fontStyle:"italic" }}>({log.actorRole})</span>
                                  )}
                                </div>
                                {log.summary && (
                                  <div style={{ fontSize:12.5, color:"#334155", lineHeight:1.5, marginBottom:3 }}>
                                    {log.summary}
                                  </div>
                                )}
                                <div style={{ fontSize:11, color:"#94a3b8" }} title={log.createdAt}>
                                  {relativeTime(log.createdAt)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
