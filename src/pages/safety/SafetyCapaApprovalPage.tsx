import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SafetyCapaNav } from "./SafetyCapaNav";
import { CapaExportModal, type CapaExportItem } from "./CapaExportModal";
import {
  BarChart, Bar, PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  XAxis, YAxis, CartesianGrid, Legend, FunnelChart, Funnel, LabelList,
  AreaChart, Area, LineChart, Line,
} from "recharts";
import {
  AlertTriangle, CheckCircle2, Clock, ExternalLink, RefreshCw,
  ShieldCheck, XCircle, Inbox, BarChart3, ListChecks,
  CircleDot, TrendingUp, MessageSquare, Send, Trash2, Loader2,
  Search, Download, FileText, Activity, X, Eye,
  ClipboardCheck, Filter, ChevronUp, ChevronDown, Bell,
} from "lucide-react";
import "./safety-capa-approval.css";

/* ═══════════════════════════════════════
   TYPES
═══════════════════════════════════════ */
interface CapaAction {
  id: string; code: string; title: string;
  description?: string; topic?: string;
  sourceType?: string; sourceCode?: string; sourceTitle?: string;
  departmentCode?: string; priority?: string; status: string;
  ownerName?: string; ownerId?: string;
  createdByName?: string; createdById?: string;
  dueDate?: string; rejectionNote?: string;
  createdAt?: string; updatedAt?: string;
  problemType?: string;
  actionPlan?: { step: string; responsible?: string; dueDate?: string }[] | null;
  evidenceNotes?: string;
  evidenceFiles?: { fileName: string; originalName?: string; mimeType?: string; size?: number }[] | null;
  verificationNote?: string; verifiedByName?: string; verifiedAt?: string;
  commentCount?: number;
}
interface CapaComment {
  id: string; actionId: string; text: string;
  authorName: string; authorId?: string;
  createdAt: string; updatedAt?: string;
  isOwn?: boolean; mentions?: string[];
}
interface MentionUser { id: string; username: string; displayName: string; role?: string; }
interface ActionLog {
  id: string; action: string;
  actorName?: string; actorRole?: string;
  summary: string; createdAt: string;
}

/* ═══════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════ */
const SOURCE_LABEL: Record<string, string> = {
  manual:"Thủ công", warning:"Cảnh báo nóng", incident:"Sự cố",
  iplan:"Kế hoạch KT", inspection:"Kế hoạch KT",
  audit:"Audit", pccc:"PCCC", kyt:"KYT",
};
const PRIORITY_LABEL: Record<string, string> = {
  critical:"Khẩn cấp", high:"Cao", medium:"Trung bình", low:"Thấp",
};
const PRIORITY_ORDER: Record<string, number> = { critical:0, high:1, medium:2, low:3 };
const STATUS_LABEL: Record<string, string> = {
  draft:"Chờ duyệt", pending_ehs:"Chờ duyệt EHS",
  open:"Đã duyệt", in_progress:"Đang làm",
  done_by_owner:"Chờ nghiệm thu", closed:"Hoàn thành",
  rejected:"Từ chối",
};
const PROBLEM_TYPE_MAP: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  MACH:   { icon:"⚙️",  label:"Máy móc / Thiết bị", color:"#7c3aed", bg:"#faf5ff", border:"#d8b4fe" },
  ELEC:   { icon:"⚡",  label:"Điện",               color:"#d97706", bg:"#fffbeb", border:"#fde68a" },
  CHEM:   { icon:"🧪",  label:"Hóa chất",           color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0" },
  FIRE:   { icon:"🔥",  label:"PCCC",               color:"#dc2626", bg:"#fef2f2", border:"#fecaca" },
  HEIGHT: { icon:"🪜",  label:"Làm việc trên cao",  color:"#0369a1", bg:"#f0f9ff", border:"#bae6fd" },
  VEHICLE:{ icon:"🚛",  label:"Phương tiện",        color:"#b45309", bg:"#fffbeb", border:"#fde68a" },
  PPE:    { icon:"🦺",  label:"PPE / Bảo hộ",      color:"#0891b2", bg:"#f0f9ff", border:"#bae6fd" },
  BEHAV:  { icon:"🧠",  label:"Hành vi",            color:"#6d28d9", bg:"#faf5ff", border:"#ddd6fe" },
  NEAR:   { icon:"⚠️",  label:"Cận nguy",           color:"#ca8a04", bg:"#fefce8", border:"#fde68a" },
  ENV:    { icon:"🌿",  label:"Môi trường",         color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0" },
  "6S":   { icon:"🧹",  label:"6S / Housekeeping",  color:"#0f766e", bg:"#f0fdfa", border:"#99f6e4" },
  ENRG:   { icon:"🔋",  label:"Năng lượng",         color:"#7c3aed", bg:"#faf5ff", border:"#ddd6fe" },
  OTHER:  { icon:"📋",  label:"Khác",               color:"#64748b", bg:"#f8fafc", border:"#e2e8f0" },
};
const SRC_COLORS: Record<string, string> = {
  warning:"#ef4444", incident:"#f97316", audit:"#8b5cf6",
  iplan:"#6366f1", inspection:"#6366f1", pccc:"#ec4899", kyt:"#14b8a6", manual:"#64748b",
};
const PRIORITY_COLORS: Record<string, string> = {
  critical:"#dc2626", high:"#f97316", medium:"#f59e0b", low:"#22c55e",
};
const FUNNEL_COLORS = ["#f97316","#eab308","#3b82f6","#22c55e","#6366f1"];
const PRIORITY_META_V2: Record<string, { label:string; color:string; bg:string; border:string }> = {
  critical:{ label:"Khẩn cấp",   color:"#dc2626", bg:"#fef2f2", border:"#fecaca" },
  high:    { label:"Cao",        color:"#ea580c", bg:"#fff7ed", border:"#fed7aa" },
  medium:  { label:"Trung bình", color:"#d97706", bg:"#fffbeb", border:"#fde68a" },
  low:     { label:"Thấp",       color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0" },
};
const SOURCE_META_V2: Record<string, { label:string; color:string }> = {
  warning:    { label:"Cảnh báo",    color:"#ef4444" },
  incident:   { label:"Sự cố",       color:"#f97316" },
  audit:      { label:"Audit",       color:"#8b5cf6" },
  iplan:      { label:"Kế hoạch KT", color:"#6366f1" },
  inspection: { label:"Kế hoạch KT", color:"#6366f1" },
  pccc:       { label:"PCCC",        color:"#ec4899" },
  kyt:        { label:"KYT",         color:"#14b8a6" },
  manual:     { label:"Thủ công",    color:"#64748b" },
};
const REJECT_PRESETS = [
  "Thiếu mô tả nguyên nhân",
  "Thiếu kế hoạch hành động cụ thể",
  "Người phụ trách chưa xác nhận",
  "Sai bộ phận phụ trách",
  "Hạn xử lý không phù hợp",
  "Cần bổ sung thêm thông tin",
];
const LOG_ACTION_META: Record<string, { icon: string; color: string }> = {
  "created":              { icon:"➕", color:"#16a34a" },
  "auto-created":         { icon:"🤖", color:"#6366f1" },
  "status-changed-to-open":          { icon:"✅", color:"#16a34a" },
  "status-changed-to-in_progress":   { icon:"🔄", color:"#3b82f6" },
  "status-changed-to-done_by_owner": { icon:"📬", color:"#f59e0b" },
  "status-changed-to-closed":        { icon:"🏁", color:"#22c55e" },
  "status-changed-to-rejected":      { icon:"❌", color:"#dc2626" },
  "approved":             { icon:"✅", color:"#16a34a" },
  "rejected":             { icon:"❌", color:"#dc2626" },
  "resubmitted":          { icon:"📤", color:"#6366f1" },
  "verified-closed":      { icon:"🏁", color:"#22c55e" },
  "rejected-reopen":      { icon:"↩️", color:"#d97706" },
  "note-added":           { icon:"📝", color:"#64748b" },
  "files-attached":       { icon:"📎", color:"#0891b2" },
};

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
const srcLabel = (s: string) => SOURCE_LABEL[s] ?? s;
const priLabel = (p: string) => PRIORITY_LABEL[p] ?? p;
const priClass = (p: string) =>
  p === "critical" || p === "high" ? `cap-priority-${p === "critical" ? "critical" : "high"}`
  : p === "medium" ? "cap-priority-medium" : "cap-priority-low";

function formatDate(iso?: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("vi-VN", { day:"2-digit", month:"2-digit", year:"numeric" }); }
  catch { return iso; }
}
function formatDateTime(iso?: string) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("vi-VN", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }); }
  catch { return iso; }
}
function isOverdue(dueDate?: string) {
  return !!dueDate && new Date(dueDate) < new Date();
}
function avatarInitials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(-2).join("").toUpperCase();
}
function avatarColor(name: string) {
  const colors = ["#3b82f6","#8b5cf6","#ec4899","#14b8a6","#f97316","#6366f1","#22c55e"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[h];
}
function dueRelative(dueDate?: string, status?: string): { text: string; urgent: boolean } | null {
  if (!dueDate || status === "closed" || status === "rejected") return null;
  const diff = Math.round((new Date(dueDate).getTime() - Date.now()) / 86400000);
  if (diff < 0)  return { text: `QH ${-diff} ngày`, urgent: true };
  if (diff === 0) return { text: "Hôm nay hết hạn!", urgent: true };
  if (diff <= 3)  return { text: `còn ${diff} ngày`, urgent: true };
  if (diff <= 7)  return { text: `còn ${diff} ngày`, urgent: false };
  return null;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials:"same-origin", ...options });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
async function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiFetch<T>(url, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
}

/* ═══════════════════════════════════════
   SMALL UI COMPONENTS
═══════════════════════════════════════ */
const CustomTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 12px", boxShadow:"0 4px 12px rgba(0,0,0,0.1)" }}>
      {label && <div style={{ fontSize:11, fontWeight:700, color:"#64748b", marginBottom:4 }}>{label}</div>}
      {payload.map((p: any) => (
        <div key={p.name} style={{ fontSize:12, color:p.color ?? "#0f172a", fontWeight:600 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};
function Toast({ message, ok }: { message: string; ok: boolean }) {
  return (
    <div className="cap-action-toast">
      {ok ? <CheckCircle2 style={{ width:16, height:16, color:"#4ade80" }} />
           : <XCircle style={{ width:16, height:16, color:"#f87171" }} />}
      {message}
    </div>
  );
}
function EmptyState({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return (
    <div className="cap-empty">
      <div className="cap-empty-icon">{icon}</div>
      <div className="cap-empty-title">{title}</div>
      {sub && <div className="cap-empty-sub">{sub}</div>}
    </div>
  );
}
function ProblemTypeBadge({ code }: { code?: string }) {
  if (!code) return null;
  const pt = PROBLEM_TYPE_MAP[code];
  if (!pt) return null;
  return (
    <span style={{ fontSize:10, fontWeight:700, color:pt.color, background:pt.bg, border:`1px solid ${pt.border}`, borderRadius:6, padding:"2px 8px", whiteSpace:"nowrap" }}>
      {pt.icon} {pt.label}
    </span>
  );
}
function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    draft:          { cls:"cap-status-draft",    label:"⏳ Chờ duyệt" },
    pending_ehs:    { cls:"cap-status-draft",    label:"⏳ Chờ EHS" },
    open:           { cls:"cap-status-open",     label:"✅ Đã duyệt" },
    in_progress:    { cls:"cap-status-inprog",   label:"🔄 Đang làm" },
    done_by_owner:  { cls:"cap-status-done",     label:"📬 Chờ nghiệm thu" },
    closed:         { cls:"cap-status-closed",   label:"🏁 Hoàn thành" },
    rejected:       { cls:"cap-status-rejected", label:"❌ Từ chối" },
  };
  const c = cfg[status] ?? { cls:"cap-status-draft", label:status };
  return <span className={`cap-status-pill ${c.cls}`}>{c.label}</span>;
}

/* ═══════════════════════════════════════
   COMMENT PANEL
═══════════════════════════════════════ */
function CommentPanel({ actionId, onClose, onCountChange }: { actionId: string; onClose: () => void; onCountChange?: (count: number) => void }) {
  const [comments, setComments] = useState<CapaComment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [text, setText]         = useState("");
  const [sending, setSending]   = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [users, setUsers]             = useState<MentionUser[]>([]);
  const [mentionedIds, setMentionedIds] = useState<Set<string>>(new Set());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const fetchComments = useCallback(async () => {
    try {
      const data = await apiFetch<CapaComment[]>(`/api/actions/${actionId}/comments`);
      const list = Array.isArray(data) ? data : [];
      setComments(list);
      onCountChange?.(list.length);
      setError(null);
    } catch { setError("Không tải được bình luận."); }
    finally { setLoading(false); }
  }, [actionId, onCountChange]);

  useEffect(() => { fetchComments(); }, [fetchComments]);
  useEffect(() => {
    apiFetch<{ data: MentionUser[] }>("/api/admin/users")
      .then((r) => setUsers(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setUsers([]));
  }, []);
  useEffect(() => { if (!loading) bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [comments, loading]);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return users.filter((u) => u.displayName?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, users]);

  const handleTextChange = (value: string, cursorPos: number) => {
    setText(value);
    const upToCursor = value.slice(0, cursorPos);
    const match = /@([^\s@]*)$/.exec(upToCursor);
    match ? (setMentionQuery(match[1]), setMentionIndex(0)) : setMentionQuery(null);
  };
  const applyMention = (user: MentionUser) => {
    const el = textareaRef.current;
    const cursorPos = el ? el.selectionStart : text.length;
    const upToCursor = text.slice(0, cursorPos);
    const match = /@([^\s@]*)$/.exec(upToCursor);
    if (!match) return;
    const inserted = `@${user.displayName} `;
    const newText = `${text.slice(0, match.index)}${inserted}${text.slice(cursorPos)}`;
    setText(newText);
    setMentionedIds((p) => new Set(p).add(user.id));
    setMentionQuery(null);
    requestAnimationFrame(() => {
      if (el) { const pos = match.index + inserted.length; el.focus(); el.setSelectionRange(pos, pos); }
    });
  };
  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const activeMentions = users.filter((u) => mentionedIds.has(u.id) && trimmed.includes(`@${u.displayName}`)).map((u) => u.id);
      const created = await postJson<CapaComment>(`/api/actions/${actionId}/comments`, { text: trimmed, mentions: activeMentions });
      setComments((p) => { const next = [...p, created]; onCountChange?.(next.length); return next; });
      setText(""); setMentionedIds(new Set()); setMentionQuery(null);
    } catch { setError("Không thể gửi bình luận."); }
    setSending(false);
  };
  const handleDelete = async (cid: string) => {
    if (!confirm("Xóa bình luận này?")) return;
    setDeleting(cid);
    try {
      await apiFetch(`/api/actions/${actionId}/comments/${cid}`, { method:"DELETE" });
      setComments((p) => { const next = p.filter((c) => c.id !== cid); onCountChange?.(next.length); return next; });
    } catch { setError("Không thể xóa bình luận."); }
    setDeleting(null);
  };
  function renderCommentText(t: string) {
    const names = users.map((u) => u.displayName).filter(Boolean).sort((a, b) => b.length - a.length);
    if (!names.length) return t;
    const pattern = new RegExp(`@(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
    const parts = t.split(pattern);
    return parts.map((part, i) =>
      i % 2 === 1 ? <span key={i} className="cap-comment-mention">@{part}</span> : <span key={i}>{part}</span>
    );
  }

  return (
    <div className="cap-comment-panel">
      <div className="cap-comment-header">
        <MessageSquare style={{ width:14, height:14, color:"#3b82f6" }} />
        <span>Bình luận nội bộ</span>
        <span className="cap-comment-count">{comments.length}</span>
        <button className="cap-comment-close-btn" onClick={onClose} title="Đóng">✕</button>
      </div>
      <div className="cap-comment-list">
        {loading && <div className="cap-comment-loading"><Loader2 style={{ width:16, height:16, animation:"spin 1s linear infinite", color:"#94a3b8" }} /> Đang tải…</div>}
        {!loading && comments.length === 0 && !error && (
          <div className="cap-comment-empty">
            <MessageSquare style={{ width:24, height:24, color:"#cbd5e1" }} />
            <div>Chưa có bình luận nào</div>
            <div style={{ fontSize:11, color:"#94a3b8" }}>Hãy bắt đầu cuộc trò chuyện về CAPA này</div>
          </div>
        )}
        {error && <div className="cap-comment-error">{error}</div>}
        {!loading && comments.map((c) => (
          <div key={c.id} className={`cap-comment-item${c.isOwn ? " own" : ""}`}>
            <div className="cap-comment-avatar" style={{ background:avatarColor(c.authorName) }} title={c.authorName}>
              {avatarInitials(c.authorName)}
            </div>
            <div className="cap-comment-bubble">
              <div className="cap-comment-meta-row">
                <span className="cap-comment-author">{c.authorName}</span>
                <span className="cap-comment-time">{formatDateTime(c.createdAt)}</span>
                {c.isOwn && (
                  <button className="cap-comment-delete-btn" onClick={() => handleDelete(c.id)} disabled={deleting === c.id} title="Xóa">
                    {deleting === c.id ? <Loader2 style={{ width:10, height:10, animation:"spin 1s linear infinite" }} /> : <Trash2 style={{ width:10, height:10 }} />}
                  </button>
                )}
              </div>
              <div className="cap-comment-text">{renderCommentText(c.text)}</div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="cap-comment-input-row" style={{ position:"relative" }}>
        {mentionQuery !== null && mentionMatches.length > 0 && (
          <div className="cap-mention-dropdown">
            {mentionMatches.map((u, i) => (
              <div key={u.id} className={`cap-mention-option${i === mentionIndex ? " active" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); applyMention(u); }}
                onMouseEnter={() => setMentionIndex(i)}>
                <span className="cap-mention-avatar" style={{ background:avatarColor(u.displayName) }}>{avatarInitials(u.displayName)}</span>
                <span className="cap-mention-name">{u.displayName}</span>
                {u.role && <span className="cap-mention-role">{u.role}</span>}
              </div>
            ))}
          </div>
        )}
        <textarea ref={textareaRef} className="cap-comment-textarea"
          placeholder="Nhập bình luận… @tên để nhắc đồng nghiệp (Enter gửi, Shift+Enter xuống dòng)"
          value={text} onChange={(e) => handleTextChange(e.target.value, e.target.selectionStart)}
          onKeyDown={(e) => {
            if (mentionQuery !== null && mentionMatches.length > 0) {
              if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i+1) % mentionMatches.length); return; }
              if (e.key === "ArrowUp")   { e.preventDefault(); setMentionIndex((i) => (i-1+mentionMatches.length) % mentionMatches.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applyMention(mentionMatches[mentionIndex]); return; }
              if (e.key === "Escape") { setMentionQuery(null); return; }
            }
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          rows={2} disabled={sending}
        />
        <button className="cap-comment-send-btn" onClick={handleSend} disabled={!text.trim() || sending} title="Gửi">
          {sending ? <Loader2 style={{ width:15, height:15, animation:"spin 1s linear infinite" }} /> : <Send style={{ width:15, height:15 }} />}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   ACTION LOG TIMELINE
═══════════════════════════════════════ */
function ActionLogTimeline({ actionId }: { actionId: string }) {
  const [logs, setLogs]       = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setLogs([]);
    apiFetch<ActionLog[]>(`/api/actions/${actionId}/logs`)
      .then((d) => setLogs(Array.isArray(d) ? d : []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [actionId]);

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"24px 0", color:"#94a3b8" }}>
      <Loader2 style={{ width:16, height:16, animation:"spin 1s linear infinite" }} /> Đang tải nhật ký…
    </div>
  );
  if (!logs.length) return (
    <div style={{ textAlign:"center", padding:"32px 0", color:"#94a3b8", fontSize:13 }}>
      <Activity style={{ width:24, height:24, marginBottom:8, opacity:0.4 }} />
      <div>Chưa có nhật ký hoạt động</div>
    </div>
  );

  return (
    <div className="cap-log-timeline">
      {logs.map((log, i) => {
        const meta = LOG_ACTION_META[log.action] ?? { icon:"📌", color:"#94a3b8" };
        return (
          <div key={log.id} className="cap-log-item">
            <div className="cap-log-dot-col">
              <div className="cap-log-dot" style={{ background:meta.color }}>{meta.icon}</div>
              {i < logs.length - 1 && <div className="cap-log-line" />}
            </div>
            <div className="cap-log-content">
              <div className="cap-log-summary">{log.summary}</div>
              <div className="cap-log-meta">
                {log.actorName && <span className="cap-log-actor">{log.actorName}</span>}
                {log.actorRole && <span className="cap-log-role">{log.actorRole}</span>}
                <span className="cap-log-time">{formatDateTime(log.createdAt)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════
   CAPA DETAIL MODAL
═══════════════════════════════════════ */
interface DetailPanelProps {
  action: CapaAction;
  onClose: () => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onVerify: (id: string, approved: boolean, note: string) => Promise<void>;
  submitting: string | null;
}

/* shared field-strip cell */
function FieldCell({ label, children, urgent }: { label: string; children: ReactNode; urgent?: boolean }) {
  return (
    <div style={{ padding:"10px 16px", borderRight:"1px solid #e2e8f0", minWidth:110, flex:"1 1 auto" }}>
      <div style={{ fontSize:9.5, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:12.5, fontWeight:600, color: urgent ? "#dc2626" : "#1e293b" }}>{children}</div>
    </div>
  );
}

/* section card */
function SectionCard({ icon, title, children, accent }: { icon: string; title: string; children: ReactNode; accent?: string }) {
  return (
    <div style={{ border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", background: accent ? `${accent}15` : "#f8fafc", borderBottom:"1px solid #e2e8f0" }}>
        <span style={{ fontSize:14 }}>{icon}</span>
        <span style={{ fontSize:12, fontWeight:700, color: accent ?? "#475569", textTransform:"uppercase", letterSpacing:"0.05em" }}>{title}</span>
      </div>
      <div style={{ padding:"12px 14px", background:"#fff" }}>{children}</div>
    </div>
  );
}

function CapaDetailPanel({ action, onClose, onApprove, onReject, onVerify, submitting }: DetailPanelProps) {
  const [detailTab, setDetailTab] = useState<"info" | "log" | "comment">("info");
  const [fullData, setFullData]   = useState<CapaAction | null>(null);
  const [loadingFull, setLoadingFull] = useState(true);
  const [rejectMode, setRejectMode]   = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [verifyMode, setVerifyMode]   = useState<"close" | "reopen" | null>(null);
  const [verifyNote, setVerifyNote]   = useState("");

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    setLoadingFull(true);
    setFullData(null);
    apiFetch<CapaAction>(`/api/actions/${action.id}`)
      .then((d) => setFullData(d))
      .catch(() => setFullData(null))
      .finally(() => setLoadingFull(false));
  }, [action.id]);

  const data = fullData ?? action;
  const isPending = data.status === "draft" || data.status === "pending_ehs";
  const isDoneByOwner = data.status === "done_by_owner";
  const pt = data.problemType ? PROBLEM_TYPE_MAP[data.problemType] : null;
  const priMeta = PRIORITY_META_V2[data.priority ?? "medium"] ?? PRIORITY_META_V2.medium;
  const srcMeta = SOURCE_META_V2[data.sourceType ?? "manual"] ?? SOURCE_META_V2.manual;
  const overdue = isOverdue(data.dueDate) && data.status !== "closed" && data.status !== "rejected";

  const handleRejectConfirm = async () => {
    await onReject(action.id, rejectReason || "Không đạt yêu cầu");
    setRejectMode(false); setRejectReason("");
  };
  const handleVerifyConfirm = async (approved: boolean) => {
    await onVerify(action.id, approved, verifyNote);
    setVerifyMode(null); setVerifyNote("");
  };

  const TABS = [
    { key:"info"    as const, label:"🗂 Tổng quan"       },
    { key:"log"     as const, label:"🕐 Nhật ký"         },
    { key:"comment" as const, label:"💬 Bình luận"       },
  ];

  return (
    <div
      className="safety-modal-backdrop fixed inset-0 z-[1400] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background:"#fff", borderRadius:16, width:"min(980px,96vw)", height:"clamp(560px, 88vh, 900px)", display:"flex", flexDirection:"column", boxShadow:"0 25px 50px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.06)", overflow:"hidden" }}>

        {/* ── accent bar ── */}
        <div style={{ height:4, background:"linear-gradient(90deg,#3b82f6,#6366f1)", flexShrink:0 }} />

        {/* ── HEADER ── */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", padding:"16px 24px 14px", borderBottom:"1px solid #e2e8f0", flexShrink:0 }}>
          <div style={{ minWidth:0, flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7, flexWrap:"wrap" }}>
              <span style={{ fontFamily:"'Courier New',monospace", fontSize:12, fontWeight:700, color:"#475569", background:"#f1f5f9", padding:"3px 9px", borderRadius:7, letterSpacing:"0.03em" }}>{data.code}</span>
              <StatusPill status={data.status} />
              {overdue && <span style={{ fontSize:11, fontWeight:700, color:"#dc2626", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:20, padding:"2px 10px" }}>⚠️ Quá hạn</span>}
              {loadingFull && <Loader2 style={{ width:13, height:13, color:"#94a3b8", animation:"spin 1s linear infinite" }} />}
            </div>
            <div style={{ fontSize:18, fontWeight:900, color:"#1e293b", lineHeight:1.35, maxWidth:720 }}>{data.title}</div>
          </div>
          <button
            onClick={onClose}
            style={{ flexShrink:0, width:32, height:32, borderRadius:"50%", background:"#f1f5f9", border:"none", color:"#64748b", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", marginLeft:16, transition:"background .15s" }} className="ehsp-icon-btn ehsp-icon-btn--close"
          >
            <X style={{ width:16, height:16 }} />
          </button>
        </div>

        {/* ── FIELD STRIP ── */}
        <div style={{ display:"flex", flexWrap:"wrap", background:"#f8fafc", borderBottom:"1px solid #e2e8f0", flexShrink:0 }}>
          <FieldCell label="Phụ trách">{data.ownerName || "—"}</FieldCell>
          <FieldCell label="Bộ phận">{data.departmentCode || "EHS"}</FieldCell>
          <FieldCell label="Tạo bởi">{data.createdByName || "—"}</FieldCell>
          <FieldCell label="Ưu tiên">
            <span style={{ fontSize:11.5, fontWeight:700, color:priMeta.color, background:priMeta.bg, border:`1px solid ${priMeta.border}`, borderRadius:20, padding:"1px 8px" }}>{priMeta.label}</span>
          </FieldCell>
          <FieldCell label="Nguồn">
            <span style={{ color:srcMeta.color, fontWeight:700 }}>{srcMeta.label}</span>
            {(data.sourceTitle || data.sourceCode) && <span style={{ color:"#64748b", fontWeight:400, marginLeft:4 }}>{data.sourceTitle ?? `#${data.sourceCode}`}</span>}
          </FieldCell>
          <FieldCell label="Hạn xử lý" urgent={overdue}>
            {overdue ? "⚠ " : ""}{formatDate(data.dueDate)}
          </FieldCell>
          <FieldCell label="Ngày tạo">{formatDate(data.createdAt)}</FieldCell>
        </div>

        {/* ── TABS ── */}
        <div style={{ display:"flex", gap:2, padding:"0 20px", background:"#fff", borderBottom:"1px solid #e2e8f0", flexShrink:0 }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setDetailTab(t.key)}
              style={{ padding:"11px 14px", border:"none", background:"none", fontSize:13, fontWeight: detailTab===t.key ? 800 : 500, color: detailTab===t.key ? "#2563eb" : "#64748b", borderBottom: detailTab===t.key ? "2px solid #2563eb" : "2px solid transparent", cursor:"pointer", whiteSpace:"nowrap", transition:"color .15s, background .15s", borderRadius:"6px 6px 0 0" }}
            >{t.label}</button>
          ))}
        </div>

        {/* ── BODY ── */}
        <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>

          {detailTab === "info" && (
            <div style={{ display:"grid", gridTemplateColumns:"3fr 2fr", gap:16 }}>

              {/* LEFT column */}
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

                {/* Problem type */}
                {pt && (
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:pt.bg, border:`1.5px solid ${pt.border}`, borderRadius:10 }}>
                    <span style={{ fontSize:22, lineHeight:1 }}>{pt.icon}</span>
                    <div>
                      <div style={{ fontSize:9.5, fontWeight:700, color:pt.color, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:2 }}>Loại vấn đề</div>
                      <div style={{ fontSize:13.5, fontWeight:700, color:pt.color }}>{pt.label}</div>
                    </div>
                  </div>
                )}

                {/* Description */}
                {data.description && (
                  <SectionCard icon="📝" title="Mô tả vấn đề">
                    <div style={{ fontSize:13.5, color:"#334155", lineHeight:1.65, whiteSpace:"pre-wrap" }}>{data.description}</div>
                  </SectionCard>
                )}

                {/* Action plan */}
                {Array.isArray(data.actionPlan) && data.actionPlan.length > 0 && (
                  <SectionCard icon="🗂️" title={`Kế hoạch hành động (${data.actionPlan.length} bước)`} accent="#2563eb">
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {data.actionPlan.map((step, i) => (
                        <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                          <div style={{ flexShrink:0, width:24, height:24, borderRadius:"50%", background:"linear-gradient(135deg,#2563eb,#6366f1)", color:"#fff", fontSize:11, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{i+1}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:600, fontSize:13, color:"#1e293b", lineHeight:1.4 }}>{step.step}</div>
                            <div style={{ fontSize:11, color:"#64748b", marginTop:3, display:"flex", gap:12, flexWrap:"wrap" }}>
                              {step.responsible && <span>👤 {step.responsible}</span>}
                              {step.dueDate && <span>📅 {formatDate(step.dueDate)}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                )}

                {/* Evidence notes */}
                {data.evidenceNotes && (
                  <SectionCard icon="📎" title="Ghi chú bằng chứng">
                    <div style={{ fontSize:13.5, color:"#334155", lineHeight:1.65, whiteSpace:"pre-wrap" }}>{data.evidenceNotes}</div>
                  </SectionCard>
                )}

                {/* Evidence files */}
                {Array.isArray(data.evidenceFiles) && data.evidenceFiles.length > 0 && (
                  <SectionCard icon="📁" title={`File bằng chứng (${data.evidenceFiles.length})`} accent="#0891b2">
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {data.evidenceFiles.map((f, i) => (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", background:"#f8fafc", borderRadius:8, border:"1px solid #e2e8f0", fontSize:12 }}>
                          <FileText style={{ width:14, height:14, color:"#64748b", flexShrink:0 }} />
                          <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"#334155", fontWeight:500 }}>{f.originalName || f.fileName}</span>
                          {f.size && <span style={{ color:"#94a3b8", whiteSpace:"nowrap" }}>{(f.size/1024).toFixed(0)} KB</span>}
                          <a href={`/uploads/${f.fileName}`} download={f.originalName || f.fileName} onClick={e => e.stopPropagation()}
                            style={{ display:"flex", alignItems:"center", gap:3, padding:"3px 9px", borderRadius:6, background:"#eff6ff", color:"#1d4ed8", fontSize:11, fontWeight:700, textDecoration:"none", flexShrink:0, border:"1px solid #bfdbfe" }}>
                            ⬇ Tải
                          </a>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                )}
              </div>

              {/* RIGHT column */}
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

                {/* Status card */}
                <div style={{ border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden" }}>
                  <div style={{ padding:"10px 14px", background:"#f8fafc", borderBottom:"1px solid #e2e8f0" }}>
                    <div style={{ fontSize:9.5, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.07em" }}>Trạng thái CAPA</div>
                  </div>
                  <div style={{ padding:"12px 14px", background:"#fff", display:"flex", flexDirection:"column", gap:10 }}>
                    {[
                      { st:"draft",         label:"Chờ duyệt",       c:"#ea580c", done: ["draft","pending_ehs","open","in_progress","done_by_owner","closed"].includes(data.status) },
                      { st:"open",          label:"Đã phê duyệt",    c:"#2563eb", done: ["open","in_progress","done_by_owner","closed"].includes(data.status) },
                      { st:"in_progress",   label:"Đang triển khai", c:"#7c3aed", done: ["in_progress","done_by_owner","closed"].includes(data.status) },
                      { st:"done_by_owner", label:"Chờ nghiệm thu",  c:"#d97706", done: ["done_by_owner","closed"].includes(data.status) },
                      { st:"closed",        label:"Hoàn thành",      c:"#16a34a", done: data.status === "closed" },
                    ].map((s, i) => {
                      const active = data.status === s.st;
                      return (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:22, height:22, borderRadius:"50%", border:`2px solid ${s.done ? s.c : "#e2e8f0"}`, background: s.done ? `${s.c}20` : "#f8fafc", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            {s.done && <div style={{ width:8, height:8, borderRadius:"50%", background:s.c }} />}
                          </div>
                          <span style={{ fontSize:12.5, fontWeight: active ? 800 : 500, color: active ? s.c : s.done ? "#475569" : "#cbd5e1" }}>{s.label}</span>
                          {active && <span style={{ fontSize:9.5, fontWeight:800, color:s.c, background:`${s.c}15`, borderRadius:20, padding:"1px 7px", marginLeft:"auto" }}>HIỆN TẠI</span>}
                        </div>
                      );
                    })}
                    {data.status === "rejected" && (
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:22, height:22, borderRadius:"50%", border:"2px solid #dc2626", background:"#fef2f2", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <div style={{ width:8, height:8, borderRadius:"50%", background:"#dc2626" }} />
                        </div>
                        <span style={{ fontSize:12.5, fontWeight:800, color:"#dc2626" }}>Từ chối</span>
                        <span style={{ fontSize:9.5, fontWeight:800, color:"#dc2626", background:"#fef2f2", borderRadius:20, padding:"1px 7px", marginLeft:"auto" }}>HIỆN TẠI</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Rejection note */}
                {data.rejectionNote && (
                  <div style={{ background:"#fef2f2", border:"1.5px solid #fecaca", borderRadius:12, padding:"12px 14px" }}>
                    <div style={{ fontSize:9.5, fontWeight:700, color:"#dc2626", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>❌ Lý do từ chối</div>
                    <div style={{ fontSize:13, color:"#991b1b", lineHeight:1.55 }}>{data.rejectionNote}</div>
                  </div>
                )}

                {/* Verification note */}
                {data.verificationNote && (
                  <div style={{ background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:12, padding:"12px 14px" }}>
                    <div style={{ fontSize:9.5, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>🏁 Ghi chú nghiệm thu</div>
                    <div style={{ fontSize:13, color:"#166534", lineHeight:1.55 }}>{data.verificationNote}</div>
                    {data.verifiedByName && <div style={{ fontSize:11, color:"#16a34a", marginTop:6, fontWeight:600 }}>Nghiệm thu bởi: {data.verifiedByName} · {formatDate(data.verifiedAt)}</div>}
                  </div>
                )}

                {/* Empty state for right column */}
                {!data.description && !data.rejectionNote && !data.verificationNote && !pt && (
                  <div style={{ textAlign:"center", padding:"24px 14px", color:"#94a3b8", fontSize:12 }}>
                    <div style={{ fontSize:28, marginBottom:6 }}>🗂</div>
                    Chưa có thêm thông tin
                  </div>
                )}
              </div>
            </div>
          )}

          {detailTab === "log" && <ActionLogTimeline actionId={action.id} />}
          {detailTab === "comment" && (
            <CommentPanel actionId={action.id} onClose={() => setDetailTab("info")} />
          )}
        </div>

        {/* ── FOOTER ── */}
        {(isPending || isDoneByOwner) && (
          <div style={{ borderTop:"1px solid #e2e8f0", padding:"14px 24px", background:"#f8fafc", flexShrink:0 }}>
            {/* Reject flow */}
            {rejectMode && (
              <div style={{ border:"1px solid #fca5a5", borderRadius:10, padding:"12px 14px", background:"#fff", marginBottom:0 }}>
                <div style={{ fontWeight:700, fontSize:12, color:"#dc2626", marginBottom:8 }}>Lý do từ chối:</div>
                <div className="cap-reject-presets">
                  {REJECT_PRESETS.map((p) => (
                    <button key={p} className={`cap-preset-chip${rejectReason === p ? " active" : ""}`} onClick={() => setRejectReason(rejectReason === p ? "" : p)}>{p}</button>
                  ))}
                </div>
                <input className="cap-reject-input" style={{ marginTop:8 }} placeholder="Hoặc nhập lý do tùy ý…" value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)} onKeyDown={e => e.key === "Enter" && handleRejectConfirm()} autoFocus />
                <div style={{ display:"flex", gap:8, marginTop:10 }}>
                  <button className="cap-reject-confirm" style={{ flex:1 }} disabled={submitting === action.id} onClick={handleRejectConfirm}>
                    {submitting === action.id ? "Đang xử lý…" : "✕ Xác nhận từ chối"}
                  </button>
                  <button className="cap-reject-cancel" onClick={() => { setRejectMode(false); setRejectReason(""); }}>Huỷ</button>
                </div>
              </div>
            )}

            {/* Verify flow */}
            {verifyMode && (
              <div style={{ border:"1px solid #bae6fd", borderRadius:10, padding:"12px 14px", background:"#fff" }}>
                <div style={{ fontWeight:700, fontSize:12, color: verifyMode==="close" ? "#16a34a" : "#d97706", marginBottom:8 }}>
                  {verifyMode==="close" ? "Ghi chú nghiệm thu (tuỳ chọn):" : "Lý do trả lại:"}
                </div>
                <input className="cap-reject-input" style={{ borderColor: verifyMode==="close" ? "#86efac" : "#fca5a5" }}
                  placeholder={verifyMode==="close" ? "Ghi chú khi đóng CAPA…" : "Nêu lý do chưa đạt…"}
                  value={verifyNote} onChange={e => setVerifyNote(e.target.value)}
                  onKeyDown={e => e.key==="Enter" && handleVerifyConfirm(verifyMode==="close")} autoFocus />
                <div style={{ display:"flex", gap:8, marginTop:10 }}>
                  <button style={{ flex:1, background: verifyMode==="close" ? "linear-gradient(135deg,#16a34a,#15803d)" : "linear-gradient(135deg,#d97706,#b45309)", border:"none", color:"#fff", padding:"9px 14px", borderRadius:9, fontWeight:700, fontSize:12.5, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
                    disabled={submitting === action.id} onClick={() => handleVerifyConfirm(verifyMode==="close")}>
                    {submitting===action.id ? "Đang xử lý…" : verifyMode==="close" ? "🏁 Xác nhận & Đóng CAPA" : "↩️ Xác nhận Trả lại"}
                  </button>
                  <button className="cap-reject-cancel" onClick={() => { setVerifyMode(null); setVerifyNote(""); }}>Huỷ</button>
                </div>
              </div>
            )}

            {/* Main action buttons */}
            {!rejectMode && !verifyMode && (
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                {isPending && (
                  <>
                    <button onClick={() => setRejectMode(true)}
                      style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 20px", borderRadius:9, border:"1.5px solid #fca5a5", background:"#fff", color:"#dc2626", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                      <XCircle style={{ width:14, height:14 }} /> Từ chối
                    </button>
                    <button onClick={() => onApprove(action.id)} disabled={submitting===action.id}
                      style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 24px", borderRadius:9, border:"none", background:"linear-gradient(135deg,#1e40af,#2563eb)", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", boxShadow:"0 4px 12px rgba(37,99,235,0.3)" }}>
                      {submitting===action.id ? <><Loader2 style={{ width:13, height:13, animation:"spin 1s linear infinite" }} /> Đang xử lý…</> : <><CheckCircle2 style={{ width:14, height:14 }} /> Phê duyệt</>}
                    </button>
                  </>
                )}
                {isDoneByOwner && (
                  <>
                    <button onClick={() => setVerifyMode("reopen")}
                      style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 20px", borderRadius:9, border:"1.5px solid #fcd34d", background:"#fffbeb", color:"#92400e", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                      ↩️ Trả lại
                    </button>
                    <button onClick={() => setVerifyMode("close")} disabled={submitting===action.id}
                      style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 24px", borderRadius:9, border:"none", background:"linear-gradient(135deg,#059669,#16a34a)", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", boxShadow:"0 4px 12px rgba(22,163,74,0.3)" }}>
                      <ClipboardCheck style={{ width:14, height:14 }} /> Nghiệm thu &amp; Đóng
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════ */
type ProcessedFilter = "all" | "open" | "in_progress" | "done_by_owner" | "closed" | "rejected";

export function SafetyCapaApprovalPage() {
  const [actions, setActions]     = useState<CapaAction[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [tab, setTab]             = useState<"pending" | "processed" | "charts">("pending");
  const [toast, setToast]         = useState<{ message: string; ok: boolean } | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  // Detail panel
  const [detailAction, setDetailAction] = useState<CapaAction | null>(null);

  // Pending tab
  const [openCommentId, setOpenCommentId]   = useState<string | null>(null);
  const [rejectingId, setRejectingId]       = useState<string | null>(null);
  const [rejectReason, setRejectReason]     = useState("");
  const [searchQuery, setSearchQuery]       = useState("");
  const [sortPriority, setSortPriority]     = useState(false);
  // 2-click approve confirmation
  const [confirmingApproveId, setConfirmingApproveId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Remind
  const [remindingId, setRemindingId] = useState<string | null>(null);

  // Export modal
  const [showExportModal, setShowExportModal] = useState(false);

  // Quick-assign (reassign owner)
  const [assigningId, setAssigningId]     = useState<string | null>(null);
  const [assignSearch, setAssignSearch]   = useState("");
  const [assignUsers, setAssignUsers]     = useState<MentionUser[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSubmitting, setAssignSubmitting] = useState<string | null>(null);
  const assignRef = useRef<HTMLDivElement | null>(null);

  // Processed tab
  const [processedFilter, setProcessedFilter] = useState<ProcessedFilter>("all");
  const [processedSearch, setProcessedSearch] = useState("");

  // Dept chart filter (click chart bar → filter all tabs)
  const [deptFilter, setDeptFilter] = useState<string | null>(null);

  // Owner filter (shared across pending + processed)
  const [ownerFilter, setOwnerFilter] = useState("");

  // Real-time refresh banner
  const [newDataBanner, setNewDataBanner] = useState<{ message: string; pulse: boolean } | null>(null);
  const tabRef = useRef<typeof tab>("pending");
  useEffect(() => { tabRef.current = tab; }, [tab]);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    setNewDataBanner(null);
    apiFetch<CapaAction[]>("/api/actions")
      .then((d) => { setActions(Array.isArray(d) ? d : []); setLoading(false); })
      .catch((e: unknown) => { setError((e as Error).message); setLoading(false); });
  }, []);
  useEffect(() => { load(); }, [load]);

  /* ── SSE: real-time CAPA event listener ── */
  useEffect(() => {
    const es = new EventSource("/api/notifications/stream", { withCredentials: true });
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type?: string; action?: string; code?: string };
        if (data.type !== "capa" || data.type === undefined) return;
        const action = data.action || "";
        if (!["created","approved","rejected","resubmitted","verified"].includes(action)) return;
        // If currently on charts tab → silently auto-refresh (no interruption)
        if (tabRef.current === "charts") { load(); return; }
        // Otherwise show banner
        const msgs: Record<string, string> = {
          created:    "⚡ Có CAPA mới cần xét duyệt",
          approved:   "✅ Một CAPA vừa được phê duyệt",
          rejected:   "❌ Một CAPA vừa bị từ chối",
          resubmitted:"📤 Một CAPA vừa được gửi lại",
          verified:   "🏁 Một CAPA vừa được nghiệm thu",
        };
        setNewDataBanner({ message: msgs[action] ?? "🔔 Dữ liệu CAPA đã thay đổi", pulse: action === "created" });
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => { /* silent reconnect handled by browser */ };
    return () => es.close();
  }, [load]);

  /* ── Remind handler ── */
  const handleRemind = async (actionId: string, ownerName?: string) => {
    setRemindingId(actionId);
    try {
      await apiFetch(`/api/actions/${actionId}/remind`, { method: "POST" });
      showToast(`Đã gửi nhắc nhở${ownerName ? ` đến ${ownerName}` : ""}`, true);
    } catch {
      showToast("Không thể gửi nhắc nhở. Thử lại sau.", false);
    }
    setRemindingId(null);
  };

  /* ── Quick-assign: lazy fetch users ── */
  const openAssignPanel = (id: string) => {
    if (assigningId === id) { setAssigningId(null); setAssignSearch(""); return; }
    setAssigningId(id);
    setAssignSearch("");
    if (assignUsers.length === 0) {
      setAssignLoading(true);
      apiFetch<{ data: MentionUser[] }>("/api/admin/users")
        .then(r => setAssignUsers(Array.isArray(r?.data) ? r.data : []))
        .catch(() => setAssignUsers([]))
        .finally(() => setAssignLoading(false));
    }
  };

  const handleReassign = async (actionId: string, user: MentionUser) => {
    setAssignSubmitting(actionId);
    try {
      const updated = await apiFetch<CapaAction>(`/api/actions/${actionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerName: user.displayName, ownerId: user.id }),
      });
      const newOwner = (updated as CapaAction).ownerName ?? user.displayName;
      const newOwnerID = (updated as CapaAction).ownerId ?? user.id;
      setActions(prev => prev.map(a => a.id === actionId ? { ...a, ownerName: newOwner, ownerId: newOwnerID } : a));
      if (detailAction?.id === actionId) setDetailAction(p => p ? { ...p, ownerName: newOwner, ownerId: newOwnerID } : p);
      setAssigningId(null); setAssignSearch("");
      showToast(`Đã bàn giao cho ${user.displayName}`, true);
    } catch {
      showToast("Không thể bàn giao. Thử lại sau.", false);
    }
    setAssignSubmitting(null);
  };

  /* ── Close assign panel on outside click ── */
  useEffect(() => {
    if (!assigningId) return;
    const handler = (e: MouseEvent) => {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) {
        setAssigningId(null); setAssignSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [assigningId]);

  /* ── ESC: close detail panel ─────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Don't interfere when user is typing in an input/textarea/contenteditable
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (detailAction) { setDetailAction(null); return; }
      if (assigningId) { setAssigningId(null); setAssignSearch(""); return; }
      if (rejectingId)  { setRejectingId(null); setRejectReason(""); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailAction, rejectingId, assigningId]);

  const showToast = (message: string, ok: boolean) => {
    setToast({ message, ok });
    setTimeout(() => setToast(null), 3200);
  };

  /* ── 2-CLICK APPROVE ─────────────── */
  const handleApproveClick = (id: string) => {
    if (confirmingApproveId === id) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmingApproveId(null);
      handleApprove(id);
    } else {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmingApproveId(id);
      confirmTimerRef.current = setTimeout(() => setConfirmingApproveId(null), 4500);
    }
  };

  /* ── ACTIONS ─────────────────────── */
  const handleApprove = async (id: string) => {
    setSubmitting(id);
    try {
      await postJson(`/api/actions/${id}/approve`, {});
      setActions((p) => p.map((a) => a.id === id ? { ...a, status:"open" } : a));
      if (detailAction?.id === id) setDetailAction((p) => p ? { ...p, status:"open" } : p);
      showToast("CAPA đã được phê duyệt!", true);
    } catch { showToast("Không thể phê duyệt. Thử lại sau.", false); }
    setSubmitting(null);
  };

  const handleReject = async (id: string, reason: string) => {
    setSubmitting(id);
    try {
      await postJson(`/api/actions/${id}/reject`, { reason: reason || "Không đạt yêu cầu" });
      setActions((p) => p.map((a) => a.id === id ? { ...a, status:"rejected", rejectionNote:reason || "Không đạt yêu cầu" } : a));
      if (detailAction?.id === id) setDetailAction((p) => p ? { ...p, status:"rejected", rejectionNote:reason } : p);
      setRejectingId(null); setRejectReason("");
      showToast("CAPA đã bị từ chối.", false);
    } catch { showToast("Không thể từ chối. Thử lại sau.", false); }
    setSubmitting(null);
  };

  const handleVerify = async (id: string, approved: boolean, note: string) => {
    setSubmitting(id);
    try {
      const updated = await postJson<CapaAction>(`/api/actions/${id}/verify`, { approved, note });
      setActions((p) => p.map((a) => a.id === id ? { ...a, ...updated } : a));
      if (detailAction?.id === id) setDetailAction((p) => p ? { ...p, ...updated } : p);
      showToast(approved ? "CAPA đã được nghiệm thu & đóng!" : "CAPA đã được trả lại để thực hiện lại.", approved);
    } catch { showToast("Không thể thực hiện. Thử lại sau.", false); }
    setSubmitting(null);
  };

  /* ── DERIVED DATA ────────────────── */
  const pending = useMemo(() => {
    let list = actions.filter((a) => a.status === "draft" || a.status === "pending_ehs");
    if (deptFilter) list = list.filter(a => (a.departmentCode || "EHS") === deptFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((a) =>
        a.title.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        (a.ownerName || "").toLowerCase().includes(q) ||
        (a.departmentCode || "").toLowerCase().includes(q)
      );
    }
    if (ownerFilter.trim()) {
      const oq = ownerFilter.toLowerCase();
      list = list.filter(a =>
        (a.ownerName || "").toLowerCase().includes(oq) ||
        ((a as any).assignees || []).some((n: string) => n.toLowerCase().includes(oq))
      );
    }
    if (sortPriority) {
      list = [...list].sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority || "medium"] ?? 2;
        const pb = PRIORITY_ORDER[b.priority || "medium"] ?? 2;
        if (pa !== pb) return pa - pb;
        // overdue first within same priority
        const oa = isOverdue(a.dueDate) ? 0 : 1;
        const ob = isOverdue(b.dueDate) ? 0 : 1;
        return oa - ob;
      });
    }
    return list;
  }, [actions, deptFilter, searchQuery, ownerFilter, sortPriority]);

  const processed = useMemo(() => {
    let base = actions.filter((a) => a.status !== "draft" && a.status !== "pending_ehs");
    if (deptFilter) base = base.filter(a => (a.departmentCode || "EHS") === deptFilter);
    if (processedFilter !== "all") base = base.filter((a) => a.status === processedFilter);
    if (processedSearch.trim()) {
      const q = processedSearch.toLowerCase();
      base = base.filter((a) =>
        a.title.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        (a.ownerName || "").toLowerCase().includes(q) ||
        (a.departmentCode || "").toLowerCase().includes(q)
      );
    }
    if (ownerFilter.trim()) {
      const oq = ownerFilter.toLowerCase();
      base = base.filter(a =>
        (a.ownerName || "").toLowerCase().includes(oq) ||
        ((a as any).assignees || []).some((n: string) => n.toLowerCase().includes(oq))
      );
    }
    return base;
  }, [actions, deptFilter, processedFilter, processedSearch, ownerFilter]);

  const pendingCount    = useMemo(() => actions.filter((a) => a.status === "draft" || a.status === "pending_ehs").length, [actions]);
  const inProgressCount = useMemo(() => actions.filter((a) => a.status === "open" || a.status === "in_progress").length, [actions]);
  const doneCount       = useMemo(() => actions.filter((a) => a.status === "done_by_owner").length, [actions]);
  const closedCount     = useMemo(() => actions.filter((a) => a.status === "closed").length, [actions]);

  /* processed filter counts */
  const processedBase = useMemo(() => actions.filter((a) => a.status !== "draft" && a.status !== "pending_ehs"), [actions]);
  const pfCount = (f: string) => f === "all" ? processedBase.length : processedBase.filter((a) => a.status === f).length;

  /* chart data */
  const sourceChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    actions.forEach((a) => { const k = a.sourceType || "manual"; counts[k] = (counts[k]||0) + 1; });
    return Object.entries(counts).map(([k,v]) => ({ name:srcLabel(k), value:v, color:SRC_COLORS[k]||"#94a3b8" }));
  }, [actions]);
  const priorityChartData = useMemo(() => {
    const ORDER = ["critical","high","medium","low"];
    const counts: Record<string,number> = {};
    actions.forEach((a) => { const k = a.priority||"medium"; counts[k]=(counts[k]||0)+1; });
    return ORDER.filter((k) => counts[k]).map((k) => ({ name:priLabel(k), value:counts[k], fill:PRIORITY_COLORS[k] }));
  }, [actions]);
  const deptChartData = useMemo(() => {
    const counts: Record<string, { open:number; closed:number; rejected:number; pending:number }> = {};
    actions.forEach((a) => {
      const dept = a.departmentCode || "EHS";
      if (!counts[dept]) counts[dept] = { open:0, closed:0, rejected:0, pending:0 };
      if (a.status === "draft" || a.status === "pending_ehs") counts[dept].pending++;
      else if (a.status === "closed") counts[dept].closed++;
      else if (a.status === "rejected") counts[dept].rejected++;
      else counts[dept].open++;
    });
    return Object.entries(counts).map(([dept,v]) => ({ dept, ...v, total:v.open+v.closed+v.rejected+v.pending }))
      .sort((a,b) => b.total-a.total).slice(0,10);
  }, [actions]);
  const statusFunnelData = useMemo(() => [
    { name:"Tổng CAPA",      value:actions.length,                                                              fill:FUNNEL_COLORS[0] },
    { name:"Chờ duyệt",      value:pendingCount,                                                                fill:FUNNEL_COLORS[1] },
    { name:"Đang thực hiện", value:inProgressCount,                                                            fill:FUNNEL_COLORS[2] },
    { name:"Chờ nghiệm thu", value:doneCount,                                                                  fill:FUNNEL_COLORS[3] },
    { name:"Hoàn thành",     value:closedCount,                                                                 fill:FUNNEL_COLORS[4] },
  ], [actions, pendingCount, inProgressCount, doneCount, closedCount]);

  /* aging heatmap: dept × priority — avg days open for non-closed CAPAs */
  const agingHeatData = useMemo(() => {
    const PRIS = ["critical","high","medium","low"] as const;
    const now = Date.now();
    const map: Record<string, Record<string, { total:number; count:number }>> = {};
    actions
      .filter(a => a.status !== "closed" && a.status !== "rejected")
      .forEach(a => {
        const dept = a.departmentCode || "EHS";
        const pri  = a.priority || "medium";
        const created = a.createdAt ? new Date(a.createdAt).getTime() : now;
        const days = Math.max(0, Math.round((now - created) / 86400000));
        if (!map[dept]) map[dept] = {};
        if (!map[dept][pri]) map[dept][pri] = { total:0, count:0 };
        map[dept][pri].total += days;
        map[dept][pri].count += 1;
      });
    const depts = Object.keys(map).sort();
    const cells = depts.map(dept => ({
      dept,
      vals: PRIS.map(pri => {
        const c = map[dept]?.[pri];
        return c && c.count > 0 ? { avg: Math.round(c.total / c.count), count: c.count } : null;
      }),
    }));
    // global max for scale
    let maxDays = 1;
    cells.forEach(row => row.vals.forEach(v => { if (v && v.avg > maxDays) maxDays = v.avg; }));
    return { depts, cells, maxDays };
  }, [actions]);

  /* ── Monthly trend: last 8 months ── */
  const monthlyTrendData = useMemo(() => {
    const now = new Date();
    const months: { label: string; opened: number; closed: number; rejected: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear(), m = d.getMonth();
      const label = d.toLocaleDateString("vi-VN", { month:"short", year:"2-digit" });
      let opened = 0, closed = 0, rejected = 0;
      actions.forEach(a => {
        if (a.createdAt) {
          const cd = new Date(a.createdAt);
          if (cd.getFullYear() === y && cd.getMonth() === m) opened++;
        }
        // closed: use verifiedAt (set when EHS verifies/closes), fall back to updatedAt for legacy
        if (a.status === "closed") {
          const closeDate = a.verifiedAt || a.updatedAt;
          if (closeDate) {
            const cd2 = new Date(closeDate);
            if (cd2.getFullYear() === y && cd2.getMonth() === m) closed++;
          }
        }
        // rejected: no dedicated field, updatedAt is the closest proxy
        if (a.status === "rejected" && a.updatedAt) {
          const cd3 = new Date(a.updatedAt);
          if (cd3.getFullYear() === y && cd3.getMonth() === m) rejected++;
        }
      });
      months.push({ label, opened, closed, rejected });
    }
    return months;
  }, [actions]);

  /* ── helpers for new UI ── */
  const totalActions = actions.length;
  const statCards = [
    { key:"pending",  label:"Chờ phê duyệt",   value:pendingCount,    sub:`${actions.filter(a=>isOverdue(a.dueDate)&&(a.status==="draft"||a.status==="pending_ehs")).length} quá hạn`, accent:"#ea580c", icon:Clock,          pct:totalActions?Math.round(pendingCount/totalActions*100):0 },
    { key:"active",   label:"Đang triển khai",  value:inProgressCount, sub:"đã duyệt, đang làm",   accent:"#2563eb", icon:TrendingUp,     pct:totalActions?Math.round(inProgressCount/totalActions*100):0 },
    { key:"verify",   label:"Chờ nghiệm thu",   value:doneCount,       sub:"chờ EHS xác minh",     accent:"#d97706", icon:ClipboardCheck, pct:totalActions?Math.round(doneCount/totalActions*100):0 },
    { key:"closed",   label:"Hoàn thành",        value:closedCount,     sub:"đã nghiệm thu & đóng", accent:"#16a34a", icon:CheckCircle2,   pct:totalActions?Math.round(closedCount/totalActions*100):0 },
  ];

  if (loading) return (
    <div className="ehsp-page cap2-root">
      <div className="cap-state-center">
        <RefreshCw style={{ width:28, height:28, color:"#1565c0", animation:"spin 1s linear infinite" }} />
        <span>Đang tải dữ liệu CAPA…</span>
      </div>
    </div>
  );
  if (error) return (
    <div className="ehsp-page cap2-root">
      <div className="cap-state-center">
        <AlertTriangle style={{ width:28, height:28, color:"#ef4444" }} />
        <span>Không tải được dữ liệu: {error}</span>
        <button className="cap-retry-btn" onClick={load}>Thử lại</button>
      </div>
    </div>
  );

  const overdueCount = actions.filter(a => isOverdue(a.dueDate) && (a.status === "draft" || a.status === "pending_ehs")).length;

  return (
    <>
    <div className="ehsp-page cap2-root">

      {/* ── HEADER ─────────────────────────── */}
      <div className="ehsp-header">
        <div className="ehsp-header-left">
          <div className="ehsp-header-icon">
            <ShieldCheck style={{ width:22, height:22, color:"#fff" }} />
          </div>
          <div style={{ minWidth:0 }}>
            <div className="ehsp-header-title">Phê duyệt CAPA</div>
            <div className="ehsp-header-sub">Xem xét · Phê duyệt · Từ chối · Nghiệm thu — EHS Admin</div>
          </div>
        </div>
        <div className="ehsp-header-right">
          {overdueCount > 0 && (
            <div className="ehsp-warn-pill">
              <AlertTriangle style={{ width:13, height:13 }} />
              {overdueCount} CAPA quá hạn!
            </div>
          )}
          <span className="ehsp-period">
            {new Date().toLocaleDateString("vi-VN", { month:"long", year:"numeric" })}
          </span>
          <button className="ehsp-btn-primary" onClick={() => setShowExportModal(true)} title="Xuất báo cáo CAPA">
            <Download style={{ width:13, height:13 }} /> Xuất báo cáo
          </button>
          <button className="ehsp-btn-refresh" onClick={load} title="Làm mới">
            <RefreshCw style={{ width:13, height:13 }} />
          </button>
        </div>
      </div>

      {/* ── CAPA Ecosystem Nav ───────────────── */}
      <SafetyCapaNav pendingCount={pendingCount} />

      {/* ── REAL-TIME BANNER ─────────────────── */}
      {newDataBanner && (
        <div className={`cap-rt-banner${newDataBanner.pulse ? " pulse" : ""}`} style={{ margin:"0 28px", borderRadius:10, marginTop:12 }}>
          <span className="cap-rt-banner-msg">{newDataBanner.message}</span>
          <button className="cap-rt-banner-btn" onClick={load}>
            <RefreshCw style={{ width:12, height:12 }} /> Tải lại ngay
          </button>
          <button className="cap-rt-banner-close" onClick={() => setNewDataBanner(null)} title="Đóng">✕</button>
        </div>
      )}

      {/* ── STAT CARDS ─────────────────────── */}
      <div className="cap2-stat-grid ehsp-stats-grid">
        {statCards.map((s) => {
          const Icon = s.icon;
          const isActive = (s.key === "pending" && tab === "pending") || (s.key !== "pending" && tab === "processed");
          return (
            <div key={s.key} className="cap2-stat-card ehsp-stat-card" onClick={() => { if (s.key === "pending") setTab("pending"); else { setTab("processed"); if (s.key === "verify") setProcessedFilter("done_by_owner"); else if (s.key === "closed") setProcessedFilter("closed"); else setProcessedFilter("all"); } }}
              style={{ borderColor:isActive ? s.accent : `${s.accent}33`, boxShadow:isActive ? `0 4px 16px ${s.accent}22` : "0 1px 4px rgba(0,0,0,0.05)", cursor:"pointer" }}>
              {isActive && <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:s.accent, borderRadius:"12px 12px 0 0" }}/>}
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                <Icon style={{ width:14, height:14, color:s.accent, flexShrink:0 }}/>
                <span style={{ fontSize:10.5, fontWeight:700, letterSpacing:"0.05em", color:"#64748b", textTransform:"uppercase" }}>{s.label}</span>
              </div>
              <div style={{ fontSize:36, fontWeight:900, color:s.accent, lineHeight:1, letterSpacing:"-0.04em" }}>{s.value}</div>
              <div style={{ fontSize:11, fontWeight:500, color:"#94a3b8", marginTop:4 }}>{s.sub}</div>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:10 }}>
                <div style={{ flex:1, height:3, borderRadius:99, background:"#f1f5f9", overflow:"hidden" }}>
                  <div style={{ width:`${s.pct}%`, height:"100%", background:s.accent, borderRadius:99, transition:"width .6s cubic-bezier(.2,.8,.4,1)" }}/>
                </div>
                <span style={{ fontSize:10, fontWeight:700, color:`${s.accent}99`, flexShrink:0 }}>{s.pct}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── TOOLBAR (Tabs + Search + Filters) ── */}
      <div className="cap2-toolbar ehsp-toolbar">
        {/* Segmented tabs */}
        <div className="cap2-seg-ctrl ehsp-seg">
          {([
            { key:"pending"   as const, label:"Chờ duyệt", badge:pendingCount, badgeColor:"#ea580c", Icon:ListChecks },
            { key:"processed" as const, label:"Đã xử lý",  badge:doneCount,    badgeColor:"#d97706", Icon:CheckCircle2 },
            { key:"charts"    as const, label:"Biểu đồ",   badge:0,            badgeColor:"",        Icon:BarChart3 },
          ]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`cap2-seg-btn ehsp-seg-btn${tab===t.key ? " ehsp-seg-btn--active" : ""}`}>
              <t.Icon style={{ width:14, height:14 }}/> {t.label}
              {t.badge>0 && <span style={{ fontSize:10, fontWeight:800, color:"#fff", background:t.badgeColor, borderRadius:10, padding:"1px 6px", lineHeight:1.4, marginLeft:2 }}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* Search */}
        {tab !== "charts" && (
          <div className="cap2-search ehsp-search">
            <Search style={{ width:14, height:14, color:"#94a3b8", flexShrink:0 }}/>
            <input
              className="ehsp-search-input"
              value={tab === "pending" ? searchQuery : processedSearch}
              onChange={(e) => tab === "pending" ? setSearchQuery(e.target.value) : setProcessedSearch(e.target.value)}
              placeholder="Tìm theo tiêu đề, mã CAPA, người phụ trách, bộ phận…"

            />
            {(tab === "pending" ? searchQuery : processedSearch) && (
              <button className="ehsp-filter-clear-btn" onClick={() => tab === "pending" ? setSearchQuery("") : setProcessedSearch("")}>
                <X style={{ width:13, height:13 }}/>
              </button>
            )}
          </div>
        )}

        {/* Sort button for pending */}
        {tab === "pending" && (
          <button className={`cap2-sort-btn${sortPriority ? " active" : ""}`} onClick={() => setSortPriority(p => !p)} title="Ưu tiên cao lên đầu">
            {sortPriority ? <ChevronUp style={{ width:13, height:13 }}/> : <ChevronDown style={{ width:13, height:13 }}/>}
            Ưu tiên cao nhất
          </button>
        )}

        {/* Dept filter chip — appears when user clicks a bar in the chart */}
        {deptFilter && (
          <div className="ehsp-filter-chip ehsp-filter-chip--animated">
            <span style={{ fontSize:11, flexShrink:0 }}>🏭</span>
            <span style={{ fontSize:12.5, fontWeight:700, color:"#1e40af", whiteSpace:"nowrap" }}>{deptFilter}</span>
            <button
              onClick={() => setDeptFilter(null)}
              className="ehsp-filter-clear-btn ehsp-filter-clear-btn--chip"
              title="Bỏ lọc bộ phận"
            >
              <X style={{ width:12, height:12 }}/>
            </button>
          </div>
        )}

        {/* Owner filter — shared across pending + processed */}
        {tab !== "charts" && (() => {
          const uniqueOwners = Array.from(
            new Set(actions.map(a => a.ownerName || "").filter(Boolean))
          ).sort();
          return (
            <div className={`ehsp-filter-input ehsp-filter-input--owner${ownerFilter ? " ehsp-filter-input--active" : ""}`}>
              <span style={{ fontSize:13, flexShrink:0 }}>👤</span>
              <input
                className="ehsp-search-input"
                list="cap2-owner-datalist"
                value={ownerFilter}
                onChange={e => setOwnerFilter(e.target.value)}
                placeholder="Lọc người phụ trách…"

              />
              <datalist id="cap2-owner-datalist">
                {uniqueOwners.map(n => <option key={n} value={n}/>)}
              </datalist>
              {ownerFilter && (
                <button type="button" className="ehsp-filter-clear-btn" onClick={() => setOwnerFilter("")}>
                  <X style={{ width:12, height:12 }}/>
                </button>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── TAB BODY ─────────────────────────── */}
      <div className="cap2-body">

        {/* ── TAB: PENDING ──────────────────── */}
        {tab === "pending" && (
          <>
            <div style={{ fontSize:12.5, color:"#64748b", fontWeight:500, marginBottom:10 }}>
              {pending.length < pendingCount
                ? <><b style={{ color:"#334155" }}>{pending.length}</b> kết quả lọc / <b>{pendingCount}</b> tổng</>
                : <><b style={{ color:"#334155" }}>{pendingCount}</b> CAPA đang chờ phê duyệt</>
              }
              {overdueCount > 0 && <span style={{ marginLeft:8, fontSize:11.5, fontWeight:700, color:"#dc2626" }}>({overdueCount} quá hạn)</span>}
            </div>

            {pending.length === 0
              ? <EmptyState icon={<Inbox style={{ width:28, height:28, color:"#94a3b8" }} />}
                  title={searchQuery ? "Không tìm thấy CAPA phù hợp" : "Không có CAPA nào chờ duyệt"}
                  sub={searchQuery ? "Thử từ khoá khác" : "Tất cả CAPA đã được xử lý. Tốt lắm! 🎉"} />
              : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {pending.map((action) => {
                    const pri = PRIORITY_META_V2[action.priority || "medium"] ?? PRIORITY_META_V2.medium;
                    const src = SOURCE_META_V2[action.sourceType || "manual"] ?? SOURCE_META_V2.manual;
                    const pt  = action.problemType ? PROBLEM_TYPE_MAP[action.problemType] : null;
                    const ov  = isOverdue(action.dueDate);

                    /* ── Deadline countdown computation ── */
                    const dueCd = (() => {
                      if (!action.dueDate) return null;
                      const now2    = Date.now();
                      const dueMs   = new Date(action.dueDate).getTime();
                      const createMs= action.createdAt ? new Date(action.createdAt).getTime() : now2 - 86400000 * 7;
                      const totalMs = dueMs - createMs;
                      const elapsedMs = now2 - createMs;
                      const daysLeft  = Math.round((dueMs - now2) / 86400000);
                      const pct       = totalMs > 0 ? Math.min(100, Math.max(0, Math.round(elapsedMs / totalMs * 100))) : 100;
                      const isOv2     = daysLeft < 0;
                      let barColor: string, bgColor: string, textColor: string, label: string;
                      if (isOv2) {
                        barColor="#dc2626"; bgColor="#fef2f2"; textColor="#dc2626";
                        label = `⚠️ Quá hạn ${Math.abs(daysLeft)} ngày`;
                      } else if (daysLeft <= 3) {
                        barColor="#ea580c"; bgColor="#fff7ed"; textColor="#ea580c";
                        label = `🔥 Còn ${daysLeft} ngày`;
                      } else if (daysLeft <= 7) {
                        barColor="#d97706"; bgColor="#fffbeb"; textColor="#d97706";
                        label = `⏰ Còn ${daysLeft} ngày`;
                      } else {
                        barColor="#16a34a"; bgColor="#f0fdf4"; textColor="#16a34a";
                        label = `✓ Còn ${daysLeft} ngày`;
                      }
                      return { pct, daysLeft, barColor, bgColor, textColor, label, isOv2 };
                    })();

                    return (
                      <div key={action.id} style={{ background:"#fff", borderRadius:14, border:"1.5px solid #e8edf3", borderLeft:`4px solid ${pri.color}`, boxShadow:"0 1px 4px rgba(0,0,0,0.05)", overflow:"hidden" }}>
                        <div style={{ display:"flex", alignItems:"flex-start", gap:14, padding:"14px 18px 12px", flexWrap:"wrap" }}>
                          {/* Priority icon */}
                          <div style={{ width:36, height:36, borderRadius:10, background:pri.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2 }}>
                            <AlertTriangle style={{ width:16, height:16, color:pri.color }}/>
                          </div>
                          {/* Main info */}
                          <div style={{ flex:1, minWidth:240 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:6 }}>
                              <span style={{ fontSize:11, fontWeight:700, color:"#1565c0", background:"#eff6ff", borderRadius:6, padding:"2px 8px" }}>{action.code}</span>
                              <span style={{ fontSize:10, fontWeight:700, color:pri.color, background:pri.bg, border:`1px solid ${pri.border}`, borderRadius:6, padding:"2px 7px" }}>{pri.label}</span>
                              <span style={{ fontSize:10, fontWeight:600, color:src.color, background:`${src.color}12`, border:`1px solid ${src.color}30`, borderRadius:6, padding:"2px 7px" }}>{src.label}</span>
                              {pt && <span style={{ fontSize:10, fontWeight:700, color:pt.color, background:pt.bg, borderRadius:6, padding:"2px 7px" }}>{pt.icon} {action.problemType}</span>}
                              {ov && <span style={{ fontSize:10, fontWeight:700, color:"#dc2626", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:6, padding:"2px 7px" }}>⚠️ Quá hạn</span>}
                            </div>
                            <div style={{ fontSize:14, fontWeight:700, color:"#0f172a", lineHeight:1.4, marginBottom:4 }}>{action.title}</div>
                            {action.description && (
                              <div style={{ fontSize:12, color:"#64748b", lineHeight:1.55, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as const, overflow:"hidden" }}>{action.description}</div>
                            )}
                            <div style={{ display:"flex", alignItems:"center", gap:14, marginTop:8, flexWrap:"wrap" }}>
                              <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:11.5, color:"#64748b" }}><CircleDot style={{ width:11, height:11 }}/> {action.departmentCode || "EHS"}</span>
                              {action.ownerName && (
                                <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:11.5, color:"#64748b" }}>
                                  <div style={{ width:18, height:18, borderRadius:"50%", background:avatarColor(action.ownerName), display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:700, color:"#fff", flexShrink:0 }}>{avatarInitials(action.ownerName)}</div>
                                  {action.ownerName}
                                </span>
                              )}
                              {action.dueDate && (
                                <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:11.5, color:ov?"#dc2626":"#64748b", fontWeight:ov?700:400 }}>
                                  <Clock style={{ width:11, height:11 }}/> Hạn: {formatDate(action.dueDate)}
                                </span>
                              )}
                            </div>

                            {/* ── Deadline countdown bar ── */}
                            {dueCd && (
                              <div style={{ marginTop:10 }}>
                                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
                                  <span style={{ fontSize:11, fontWeight:700, color:dueCd.textColor }}>{dueCd.label}</span>
                                  <span style={{ fontSize:10, fontWeight:500, color:"#94a3b8" }}>
                                    {dueCd.pct}% thời gian đã dùng
                                  </span>
                                </div>
                                {/* Track */}
                                <div style={{ height:6, borderRadius:99, background:"#f1f5f9", overflow:"hidden", position:"relative" }}>
                                  <div style={{
                                    position:"absolute", top:0, left:0,
                                    height:"100%", borderRadius:99,
                                    width:`${dueCd.pct}%`,
                                    background: dueCd.isOv2
                                      ? `repeating-linear-gradient(45deg,${dueCd.barColor},${dueCd.barColor} 4px,#fecaca 4px,#fecaca 8px)`
                                      : dueCd.barColor,
                                    transition:"width .5s cubic-bezier(.2,.8,.4,1)",
                                  }}/>
                                  {/* "now" tick */}
                                  {!dueCd.isOv2 && dueCd.pct < 98 && (
                                    <div style={{ position:"absolute", top:-2, left:`${dueCd.pct}%`, width:2, height:10, background:dueCd.barColor, borderRadius:2, transform:"translateX(-50%)" }}/>
                                  )}
                                </div>
                                {/* Milestone labels */}
                                <div style={{ display:"flex", justifyContent:"space-between", marginTop:3, fontSize:9.5, color:"#cbd5e1", fontWeight:600 }}>
                                  <span>Ngày tạo</span>
                                  <span style={{ color:dueCd.textColor }}>Hạn chót</span>
                                </div>
                              </div>
                            )}
                          </div>
                          {/* Action buttons */}
                          <div style={{ display:"flex", alignItems:"center", gap:7, flexShrink:0, flexWrap:"wrap", justifyContent:"flex-end" }}>
                            <button onClick={() => setDetailAction(action)} style={{ display:"flex", alignItems:"center", gap:5, height:34, padding:"0 12px", borderRadius:9, background:"#f8fafc", color:"#475569", border:"1.5px solid #e2e8f0", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                              <Eye style={{ width:13, height:13 }}/> Chi tiết
                            </button>
                            <button onClick={() => setOpenCommentId(p => p === action.id ? null : action.id)}
                              style={{ display:"flex", alignItems:"center", gap:5, height:34, padding:"0 12px", borderRadius:9, background:openCommentId===action.id?"#eff6ff":"#fff", color:"#3b82f6", border:`1.5px solid ${openCommentId===action.id?"#3b82f6":"#bfdbfe"}`, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                              <MessageSquare style={{ width:13, height:13 }}/> Bình luận
                              {(action.commentCount ?? 0) > 0 && <span style={{ minWidth:17, height:17, borderRadius:9, background:"#3b82f6", color:"#fff", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px" }}>{action.commentCount}</span>}
                            </button>
                            <button onClick={() => openAssignPanel(action.id)}
                              style={{ display:"flex", alignItems:"center", gap:5, height:34, padding:"0 12px", borderRadius:9, background:assigningId===action.id?"#f5f3ff":"#fff", color:"#7c3aed", border:`1.5px solid ${assigningId===action.id?"#7c3aed":"#ddd6fe"}`, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                              <Filter style={{ width:13, height:13 }}/> Bàn giao
                            </button>
                            <button onClick={() => rejectingId === action.id ? (setRejectingId(null), setRejectReason("")) : (setRejectingId(action.id), setRejectReason(""))}
                              style={{ display:"flex", alignItems:"center", gap:5, height:34, padding:"0 12px", borderRadius:9, background:rejectingId===action.id?"#fef2f2":"#fff", color:"#dc2626", border:`1.5px solid ${rejectingId===action.id?"#dc2626":"#fca5a5"}`, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                              <XCircle style={{ width:13, height:13 }}/> Từ chối
                            </button>
                            <button disabled={submitting === action.id} onClick={() => handleApproveClick(action.id)}
                              style={{ display:"flex", alignItems:"center", gap:5, height:34, padding:"0 14px", borderRadius:9, background:confirmingApproveId===action.id?"linear-gradient(135deg,#15803d,#166534)":"linear-gradient(135deg,#16a34a,#15803d)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer", boxShadow:"0 2px 6px rgba(22,163,74,0.35)", opacity:submitting===action.id?0.7:1 }}>
                              {submitting === action.id
                                ? <RefreshCw style={{ width:13, height:13, animation:"spin 1s linear infinite" }}/>
                                : <CheckCircle2 style={{ width:13, height:13 }}/>}
                              {confirmingApproveId === action.id ? "Xác nhận?" : "Phê duyệt"}
                            </button>
                          </div>
                        </div>

                        {/* ── Quick-assign panel ── */}
                        {assigningId === action.id && (
                          <div ref={assignRef} style={{ borderTop:"1px solid #ede9fe", background:"#faf5ff", padding:"12px 18px 14px" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                              <div style={{ width:24, height:24, borderRadius:7, background:"#7c3aed", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                <Filter style={{ width:13, height:13, color:"#fff" }}/>
                              </div>
                              <span style={{ fontSize:12.5, fontWeight:700, color:"#5b21b6" }}>Bàn giao nhanh cho người phụ trách mới</span>
                              {action.ownerName && (
                                <span style={{ fontSize:11, fontWeight:500, color:"#94a3b8", marginLeft:"auto" }}>
                                  Hiện tại: <b style={{ color:"#64748b" }}>{action.ownerName}</b>
                                </span>
                              )}
                            </div>

                            {/* Search input */}
                            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", background:"#fff", border:"1.5px solid #ddd6fe", borderRadius:9, marginBottom:8 }}>
                              <Search style={{ width:13, height:13, color:"#a78bfa", flexShrink:0 }}/>
                              <input
                                autoFocus
                                value={assignSearch}
                                onChange={e => setAssignSearch(e.target.value)}
                                placeholder="Tìm tên hoặc tên đăng nhập…"
                                style={{ flex:1, border:"none", outline:"none", fontSize:12.5, color:"#0f172a", background:"transparent", fontFamily:"inherit" }}
                              />
                              {assignSearch && <button onClick={() => setAssignSearch("")} style={{ background:"none", border:"none", cursor:"pointer", color:"#94a3b8", display:"flex", padding:0 }}><X style={{ width:12, height:12 }}/></button>}
                            </div>

                            {/* User list */}
                            {assignLoading ? (
                              <div style={{ padding:"10px 0", textAlign:"center", fontSize:12, color:"#94a3b8" }}>
                                <RefreshCw style={{ width:14, height:14, display:"inline-block", animation:"spin 1s linear infinite", marginRight:5 }}/>Đang tải danh sách…
                              </div>
                            ) : (() => {
                              const q = assignSearch.toLowerCase();
                              const filtered = assignUsers.filter(u =>
                                !q ||
                                u.displayName.toLowerCase().includes(q) ||
                                u.username.toLowerCase().includes(q)
                              );
                              if (filtered.length === 0) return (
                                <div style={{ padding:"10px 0", textAlign:"center", fontSize:12, color:"#94a3b8" }}>
                                  {assignSearch ? "Không tìm thấy người phù hợp" : "Chưa có người dùng nào"}
                                </div>
                              );
                              return (
                                <div style={{ display:"flex", flexDirection:"column", gap:3, maxHeight:220, overflowY:"auto" }}>
                                  {filtered.map(u => {
                                    const isCurrent = u.displayName === action.ownerName || u.id === action.ownerId;
                                    const isSubmitting = assignSubmitting === action.id;
                                    return (
                                      <button key={u.id} disabled={isCurrent || isSubmitting}
                                        onClick={() => handleReassign(action.id, u)} className={`ehsp-reassign-option${isCurrent ? " ehsp-reassign-option--current" : ""}`} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:9, border:isCurrent?"1.5px solid #7c3aed":"1.5px solid transparent", background:isCurrent?"#ede9fe":"#fff", cursor:isCurrent||isSubmitting?"default":"pointer", textAlign:"left", transition:"background .12s", opacity:isSubmitting&&!isCurrent?0.5:1 }}>
                                        <div style={{ width:30, height:30, borderRadius:"50%", background:avatarColor(u.displayName), display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff", flexShrink:0 }}>
                                          {avatarInitials(u.displayName)}
                                        </div>
                                        <div style={{ flex:1, minWidth:0 }}>
                                          <div style={{ fontSize:12.5, fontWeight:700, color: isCurrent?"#5b21b6":"#334155", display:"flex", alignItems:"center", gap:5 }}>
                                            {u.displayName}
                                            {isCurrent && <span style={{ fontSize:9.5, fontWeight:600, color:"#7c3aed", background:"#ede9fe", borderRadius:5, padding:"1px 6px" }}>Hiện tại</span>}
                                          </div>
                                          <div style={{ fontSize:10.5, color:"#94a3b8" }}>@{u.username}{u.role ? ` · ${u.role}` : ""}</div>
                                        </div>
                                        {!isCurrent && !isSubmitting && (
                                          <span style={{ fontSize:11, fontWeight:600, color:"#7c3aed", flexShrink:0 }}>Bàn giao →</span>
                                        )}
                                        {isSubmitting && assignSubmitting === action.id && (
                                          <RefreshCw style={{ width:13, height:13, color:"#7c3aed", animation:"spin 1s linear infinite", flexShrink:0 }}/>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* Inline reject panel */}
                        {rejectingId === action.id && (
                          <div style={{ borderTop:"1px solid #fecaca", background:"#fff9f9", padding:"10px 18px 12px" }}>
                            <div style={{ fontSize:11.5, fontWeight:700, color:"#dc2626", marginBottom:8 }}>Chọn lý do từ chối:</div>
                            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
                              {REJECT_PRESETS.map((p) => (
                                <span key={p} onClick={() => setRejectReason(rejectReason === p ? "" : p)}
                                  style={{ fontSize:11, fontWeight:600, color:"#dc2626", background:rejectReason===p?"#fecaca":"#fff", border:"1.5px solid #fca5a5", borderRadius:20, padding:"4px 10px", cursor:"pointer" }}>{p}</span>
                              ))}
                            </div>
                            <div style={{ display:"flex", gap:8 }}>
                              <input placeholder="Hoặc nhập lý do tùy ý…" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleReject(action.id, rejectReason)} autoFocus
                                style={{ flex:1, height:36, padding:"0 12px", border:"1.5px solid #fca5a5", borderRadius:9, fontSize:12.5, outline:"none", background:"#fff", fontFamily:"inherit" }}/>
                              <button disabled={submitting === action.id} onClick={() => handleReject(action.id, rejectReason)}
                                style={{ height:36, padding:"0 16px", background:"#dc2626", color:"#fff", border:"none", borderRadius:9, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                                {submitting === action.id ? "Đang xử lý…" : "Xác nhận từ chối"}
                              </button>
                              <button onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                style={{ height:36, padding:"0 12px", background:"transparent", color:"#64748b", border:"1px solid #e2e8f0", borderRadius:9, fontSize:12, cursor:"pointer" }}>Huỷ</button>
                            </div>
                          </div>
                        )}

                        {openCommentId === action.id && (
                          <CommentPanel
                            actionId={action.id}
                            onClose={() => setOpenCommentId(null)}
                            onCountChange={(count) => setActions((prev) => prev.map((a) => a.id === action.id ? { ...a, commentCount: count } : a))}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            }
          </>
        )}

        {/* ── TAB: PROCESSED ────────────────── */}
        {tab === "processed" && (
          <>
            {/* Status filter chips */}
            <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:14 }}>
              {([
                ["all",           "Tất cả"],
                ["open",          "✅ Đã duyệt"],
                ["in_progress",   "🔄 Đang làm"],
                ["done_by_owner", "📬 Chờ nghiệm thu"],
                ["closed",        "🏁 Hoàn thành"],
                ["rejected",      "❌ Từ chối"],
              ] as [ProcessedFilter, string][]).map(([f, label]) => {
                const cnt = pfCount(f);
                const isAct = processedFilter === f;
                return (
                  <button key={f} onClick={() => setProcessedFilter(f)}
                    style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 14px", borderRadius:20, border:isAct?"none":"1.5px solid #e2e8f0", background:isAct?"#1565c0":"#fff", color:isAct?"#fff":"#475569", fontSize:12, fontWeight:600, cursor:"pointer", transition:"all .15s" }}>
                    {label}
                    <span style={{ fontSize:10, fontWeight:700, opacity:.7, background:isAct?"rgba(255,255,255,0.25)":"#f1f5f9", borderRadius:10, padding:"1px 6px" }}>{cnt}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize:12.5, color:"#64748b", fontWeight:500, marginBottom:10 }}>
              <b style={{ color:"#334155" }}>{processed.length}</b> CAPA đã xử lý
            </div>

            {processed.length === 0
              ? <EmptyState icon={<CheckCircle2 style={{ width:28, height:28, color:"#94a3b8" }} />} title="Chưa có CAPA nào trong nhóm này" sub="Thử thay đổi bộ lọc hoặc từ khoá." />
              : (
                <div style={{ background:"#fff", borderRadius:14, border:"1.5px solid #e8edf3", overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                    <thead>
                      <tr style={{ background:"#f8fafc", borderBottom:"1px solid #e2e8f0" }}>
                        {["Mã CAPA","Tiêu đề","Bộ phận","Trạng thái","Ưu tiên","Hạn xử lý","Người phụ trách","Thao tác"].map(h => (
                          <th key={h} style={{ padding:"11px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.04em", whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {processed.map((action, ri) => {
                        const ov2 = isOverdue(action.dueDate) && action.status !== "closed" && action.status !== "rejected";
                        const pri2 = PRIORITY_META_V2[action.priority || "medium"] ?? PRIORITY_META_V2.medium;
                        return (
                          <tr key={action.id} style={{ borderBottom:ri < processed.length-1?"1px solid #f1f5f9":"none", cursor:"pointer", transition:"background .1s" }} className="ehsp-table-row-hoverable"
                            onClick={() => setDetailAction(action)}>
                            <td style={{ padding:"11px 14px" }}><span style={{ fontSize:11, fontWeight:700, color:"#1565c0", background:"#eff6ff", borderRadius:6, padding:"2px 8px" }}>{action.code}</span></td>
                            <td style={{ padding:"11px 14px", maxWidth:260 }}>
                              <div style={{ fontWeight:600, color:"#334155", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as const, overflow:"hidden", lineHeight:1.4 }}>{action.title}</div>
                              {action.rejectionNote && <div style={{ fontSize:11, color:"#dc2626", marginTop:2 }}>↩ {action.rejectionNote}</div>}
                            </td>
                            <td style={{ padding:"11px 14px", color:"#64748b", whiteSpace:"nowrap" }}>{action.departmentCode || "EHS"}</td>
                            <td style={{ padding:"11px 14px", whiteSpace:"nowrap" }}><StatusPill status={action.status} /></td>
                            <td style={{ padding:"11px 14px", whiteSpace:"nowrap" }}><span style={{ fontSize:10, fontWeight:700, color:pri2.color, background:pri2.bg, border:`1px solid ${pri2.border}`, borderRadius:6, padding:"2px 8px" }}>{pri2.label}</span></td>
                            <td style={{ padding:"11px 14px", color:ov2?"#dc2626":"#64748b", fontWeight:ov2?700:400, whiteSpace:"nowrap" }}>
                              {ov2 && <AlertTriangle style={{ width:11, height:11, display:"inline-block", marginRight:3, verticalAlign:"middle" }}/>}
                              {formatDate(action.dueDate)}
                            </td>
                            <td style={{ padding:"11px 14px", whiteSpace:"nowrap" }}>
                              {action.ownerName ? (
                                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                  <div style={{ width:20, height:20, borderRadius:"50%", background:avatarColor(action.ownerName), display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:700, color:"#fff", flexShrink:0 }}>{avatarInitials(action.ownerName)}</div>
                                  <span style={{ color:"#334155", fontSize:12.5 }}>{action.ownerName}</span>
                                </div>
                              ) : "—"}
                            </td>
                            <td style={{ padding:"11px 14px" }} onClick={e => e.stopPropagation()}>
                              <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                                <button onClick={() => setDetailAction(action)} style={{ display:"flex", alignItems:"center", gap:4, height:30, padding:"0 10px", borderRadius:8, background:"#f8fafc", color:"#475569", border:"1.5px solid #e2e8f0", fontSize:11, fontWeight:600, cursor:"pointer" }}>
                                  <Eye style={{ width:11, height:11 }}/> Chi tiết
                                </button>
                                {(action.status === "in_progress" || action.status === "done_by_owner") && (
                                  <button
                                    disabled={remindingId === action.id}
                                    onClick={() => handleRemind(action.id, action.ownerName)}
                                    title={`Gửi nhắc nhở hạn chót${action.ownerName ? " đến " + action.ownerName : ""}`}
                                    style={{ display:"flex", alignItems:"center", gap:4, height:30, padding:"0 10px", borderRadius:8, background:remindingId===action.id?"#f0fdf4":"#f0f9ff", color:"#0891b2", border:"1.5px solid #bae6fd", fontSize:11, fontWeight:700, cursor:remindingId===action.id?"not-allowed":"pointer", opacity:remindingId===action.id?0.7:1, transition:"all .15s" }}>
                                    {remindingId === action.id
                                      ? <RefreshCw style={{ width:11, height:11, animation:"spin 1s linear infinite" }}/>
                                      : <Bell style={{ width:11, height:11 }}/>}
                                    Nhắc nhở
                                  </button>
                                )}
                                {action.status === "done_by_owner" && (
                                  <button onClick={() => setDetailAction(action)} disabled={submitting === action.id}
                                    style={{ display:"flex", alignItems:"center", gap:4, height:30, padding:"0 10px", borderRadius:8, background:"#fffbeb", color:"#d97706", border:"1.5px solid #fde68a", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                                    <ClipboardCheck style={{ width:11, height:11 }}/> Nghiệm thu
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            }
          </>
        )}

        {/* ── TAB: CHARTS ───────────────────── */}
        {tab === "charts" && (
          actions.length === 0
            ? <EmptyState icon={<BarChart3 style={{ width:28, height:28, color:"#94a3b8" }} />} title="Chưa có dữ liệu" sub="Tạo CAPA đầu tiên để xem thống kê." />
            : (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

                {/* ── shared card style ── */}
                {/* background:#fff  border:1px solid #e2e8f0  borderRadius:12  padding:20px 22px  boxShadow:0 1px 4px rgba(0,0,0,0.05) */}

                {/* ══ ROW 1 — Trend chart ════════════════════════════ */}
                <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"20px 22px", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
                    <div>
                      <div style={{ fontSize:13.5, fontWeight:700, color:"#0f172a", marginBottom:3 }}>Xu hướng CAPA theo tháng</div>
                      <div style={{ fontSize:12, color:"#94a3b8" }}>Phát sinh · Hoàn thành · Từ chối — 8 tháng gần nhất</div>
                    </div>
                    {(() => {
                      const last = monthlyTrendData[monthlyTrendData.length - 1];
                      const prev = monthlyTrendData[monthlyTrendData.length - 2];
                      const delta = last && prev ? last.opened - prev.opened : 0;
                      const rate  = last && last.opened > 0 ? Math.round(last.closed / last.opened * 100) : 0;
                      const total8 = monthlyTrendData.reduce((s, m) => s + m.opened, 0);
                      return (
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", background:"#f8fafc", borderRadius:8, padding:"7px 14px", border:"1px solid #e2e8f0", minWidth:72 }}>
                            <span style={{ fontSize:20, fontWeight:800, color:"#ea580c", lineHeight:1 }}>{last?.opened ?? 0}</span>
                            <span style={{ fontSize:10, color:"#64748b", fontWeight:600, marginTop:3, textAlign:"center" }}>Phát sinh tháng này</span>
                            {delta !== 0 && <span style={{ fontSize:9.5, color:delta>0?"#dc2626":"#16a34a", fontWeight:700, marginTop:1 }}>{delta>0?`+${delta}`:delta} so trước</span>}
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", background:"#f8fafc", borderRadius:8, padding:"7px 14px", border:"1px solid #e2e8f0", minWidth:72 }}>
                            <span style={{ fontSize:20, fontWeight:800, color:"#16a34a", lineHeight:1 }}>{rate}%</span>
                            <span style={{ fontSize:10, color:"#64748b", fontWeight:600, marginTop:3, textAlign:"center" }}>Tỷ lệ đóng tháng này</span>
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", background:"#f8fafc", borderRadius:8, padding:"7px 14px", border:"1px solid #e2e8f0", minWidth:72 }}>
                            <span style={{ fontSize:20, fontWeight:800, color:"#1565c0", lineHeight:1 }}>{total8}</span>
                            <span style={{ fontSize:10, color:"#64748b", fontWeight:600, marginTop:3, textAlign:"center" }}>Tổng 8 tháng</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={monthlyTrendData} margin={{ top:8, right:24, bottom:4, left:0 }}>
                      <defs>
                        <linearGradient id="gradOpened" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#f97316" stopOpacity={0.65}/>
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0.10}/>
                        </linearGradient>
                        <linearGradient id="gradClosed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.65}/>
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0.10}/>
                        </linearGradient>
                        <linearGradient id="gradRejected" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#dc2626" stopOpacity={0.58}/>
                          <stop offset="95%" stopColor="#dc2626" stopOpacity={0.08}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/>
                      <XAxis dataKey="label" tick={{ fontSize:11, fill:"#64748b" }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fontSize:11, fill:"#94a3b8" }} axisLine={false} tickLine={false} width={24} allowDecimals={false}/>
                      <Tooltip content={<CustomTip />}/>
                      <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize:12, fontWeight:600, paddingTop:10 }}/>
                      <Area type="monotone" dataKey="opened"   name="Phát sinh"  stroke="#f97316" strokeWidth={2.5} fill="url(#gradOpened)"   dot={{ r:3, fill:"#f97316", strokeWidth:2, stroke:"#fff" }} activeDot={{ r:5, strokeWidth:2, stroke:"#fff" }}/>
                      <Area type="monotone" dataKey="closed"   name="Hoàn thành" stroke="#22c55e" strokeWidth={2.5} fill="url(#gradClosed)"   dot={{ r:3, fill:"#22c55e", strokeWidth:2, stroke:"#fff" }} activeDot={{ r:5, strokeWidth:2, stroke:"#fff" }}/>
                      <Area type="monotone" dataKey="rejected" name="Từ chối"    stroke="#dc2626" strokeWidth={2.5} fill="url(#gradRejected)" dot={{ r:3, fill:"#dc2626", strokeWidth:2, stroke:"#fff" }} activeDot={{ r:5, strokeWidth:2, stroke:"#fff" }}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* ══ ROW 2 — Source donut + Priority bar ══════════ */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>

                  {/* Source donut */}
                  <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"20px 22px", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                    <div style={{ fontSize:13.5, fontWeight:700, color:"#0f172a", marginBottom:3 }}>Phân bổ theo nguồn</div>
                    <div style={{ fontSize:12, color:"#94a3b8", marginBottom:16 }}>CAPA từ mỗi nguồn phát sinh</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, alignItems:"center" }}>
                      <ResponsiveContainer width="100%" height={170}>
                        <PieChart>
                          <Pie data={sourceChartData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                            innerRadius={48} outerRadius={76} paddingAngle={3} startAngle={90} endAngle={-270}>
                            {sourceChartData.map((e, i) => <Cell key={i} fill={e.color} stroke="#fff" strokeWidth={2} />)}
                          </Pie>
                          <Tooltip content={<CustomTip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {sourceChartData.map((e, i) => {
                          const pct = actions.length > 0 ? Math.round(e.value / actions.length * 100) : 0;
                          return (
                            <div key={i}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                  <div style={{ width:8, height:8, borderRadius:"50%", background:e.color, flexShrink:0 }}/>
                                  <span style={{ fontSize:11.5, fontWeight:600, color:"#334155" }}>{e.name}</span>
                                </div>
                                <span style={{ fontSize:12.5, fontWeight:800, color:"#0f172a" }}>{e.value}</span>
                              </div>
                              <div style={{ height:5, borderRadius:4, background:"#f1f5f9", overflow:"hidden" }}>
                                <div style={{ height:"100%", width:`${pct}%`, background:e.color, borderRadius:4 }}/>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Priority breakdown */}
                  <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"20px 22px", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                    <div style={{ fontSize:13.5, fontWeight:700, color:"#0f172a", marginBottom:3 }}>Theo mức độ ưu tiên</div>
                    <div style={{ fontSize:12, color:"#94a3b8", marginBottom:16 }}>Số lượng CAPA theo mức độ ưu tiên</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                      {(["critical","high","medium","low"] as const).map(pk => {
                        const meta = PRIORITY_META_V2[pk];
                        const cnt = actions.filter(a => (a.priority || "medium") === pk).length;
                        const pct = totalActions > 0 ? Math.round(cnt / totalActions * 100) : 0;
                        if (!cnt) return null;
                        return (
                          <div key={pk}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                              <span style={{ fontSize:11.5, fontWeight:700, color:meta.color, background:meta.bg, border:`1px solid ${meta.border}`, borderRadius:20, padding:"2px 10px" }}>{meta.label}</span>
                              <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                                <span style={{ fontSize:20, fontWeight:800, color:"#0f172a", lineHeight:1 }}>{cnt}</span>
                                <span style={{ fontSize:11, color:"#94a3b8", fontWeight:500 }}>{pct}%</span>
                              </div>
                            </div>
                            <div style={{ height:8, borderRadius:6, background:"#f1f5f9", overflow:"hidden" }}>
                              <div style={{ height:"100%", width:`${pct}%`, background:meta.color, borderRadius:6, transition:"width 0.6s ease", opacity:0.85 }}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* ══ ROW 3 — Dept stacked bar ════════════════════ */}
                <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"20px 22px", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:10 }}>
                    <div>
                      <div style={{ fontSize:13.5, fontWeight:700, color:"#0f172a", marginBottom:3 }}>Phân bổ CAPA theo bộ phận</div>
                      <div style={{ fontSize:12, color:"#94a3b8" }}>Click vào cột để lọc danh sách — Top 10 bộ phận</div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                      {[{c:"#ea580c",n:"Chờ duyệt"},{c:"#3b82f6",n:"Đang thực hiện"},{c:"#22c55e",n:"Hoàn thành"},{c:"#94a3b8",n:"Từ chối"}].map(l => (
                        <div key={l.n} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11.5, fontWeight:600, color:"#475569" }}>
                          <div style={{ width:9, height:9, borderRadius:2, background:l.c }}/>
                          {l.n}
                        </div>
                      ))}
                      {deptFilter && (
                        <button onClick={() => setDeptFilter(null)}
                          style={{ display:"flex", alignItems:"center", gap:5, background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:7, padding:"4px 10px", fontSize:11.5, fontWeight:700, color:"#1565c0", cursor:"pointer", whiteSpace:"nowrap" }}>
                          {deptFilter} <X style={{ width:11, height:11 }}/>
                        </button>
                      )}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={deptChartData} margin={{ top:4, right:16, bottom:4, left:0 }}
                      onClick={(chartData) => {
                        const clickedDept = chartData?.activePayload?.[0]?.payload?.dept;
                        if (!clickedDept) return;
                        if (deptFilter === clickedDept) { setDeptFilter(null); }
                        else { setDeptFilter(clickedDept); setTab("pending"); }
                      }}
                      style={{ cursor:"pointer" }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/>
                      <XAxis dataKey="dept" tick={{ fontSize:11, fill:"#64748b" }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fontSize:11, fill:"#94a3b8" }} axisLine={false} tickLine={false} width={24}/>
                      <Tooltip content={<CustomTip />} cursor={{ fill:"rgba(59,130,246,0.06)" }}/>
                      <Bar dataKey="pending"  name="Chờ duyệt"      stackId="a" radius={[0,0,0,0]}>
                        {deptChartData.map(e => <Cell key={e.dept} fill="#ea580c" fillOpacity={!deptFilter||deptFilter===e.dept?1:0.4}/>)}
                      </Bar>
                      <Bar dataKey="open"     name="Đang thực hiện" stackId="a" radius={[0,0,0,0]}>
                        {deptChartData.map(e => <Cell key={e.dept} fill="#3b82f6" fillOpacity={!deptFilter||deptFilter===e.dept?1:0.4}/>)}
                      </Bar>
                      <Bar dataKey="closed"   name="Hoàn thành"     stackId="a" radius={[0,0,0,0]}>
                        {deptChartData.map(e => <Cell key={e.dept} fill="#22c55e" fillOpacity={!deptFilter||deptFilter===e.dept?1:0.4}/>)}
                      </Bar>
                      <Bar dataKey="rejected" name="Từ chối"        stackId="a" radius={[5,5,0,0]}>
                        {deptChartData.map(e => <Cell key={e.dept} fill="#94a3b8" fillOpacity={!deptFilter||deptFilter===e.dept?1:0.4}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  {deptFilter && (
                    <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:10, background:"#f8fafc", borderRadius:8, padding:"8px 14px", border:"1px solid #e2e8f0" }}>
                      <span style={{ fontSize:12.5, color:"#1565c0", fontWeight:700 }}>Bộ phận <strong>{deptFilter}</strong>:</span>
                      <span style={{ fontSize:12, color:"#475569" }}>
                        {actions.filter(a => (a.departmentCode||"EHS")===deptFilter && (a.status==="draft"||a.status==="pending_ehs")).length} chờ duyệt
                        &nbsp;·&nbsp;
                        {actions.filter(a => (a.departmentCode||"EHS")===deptFilter && a.status!=="draft" && a.status!=="pending_ehs").length} đã xử lý
                      </span>
                      <button onClick={() => setDeptFilter(null)} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#1565c0", fontWeight:700, padding:0 }}>Bỏ lọc ×</button>
                    </div>
                  )}
                </div>

                {/* ══ ROW 4 — Heatmap + Pipeline ════════════════════ */}
                <div style={{ display:"grid", gridTemplateColumns: agingHeatData.depts.length > 0 ? "1.4fr 1fr" : "1fr", gap:14 }}>

                  {/* Heatmap */}
                  {agingHeatData.depts.length > 0 && (() => {
                    const PRI_COLS = [
                      { key:"critical", label:"Khẩn cấp",  color:"#dc2626" },
                      { key:"high",     label:"Cao",        color:"#ea580c" },
                      { key:"medium",   label:"Trung bình", color:"#d97706" },
                      { key:"low",      label:"Thấp",       color:"#16a34a" },
                    ];
                    const heatColor = (days: number, max: number) => {
                      const t = Math.min(1, days / Math.max(max, 30));
                      if (t < 0.25) return { bg:"#dcfce7", text:"#166534" };
                      if (t < 0.50) return { bg:"#fef9c3", text:"#92400e" };
                      if (t < 0.75) return { bg:"#fed7aa", text:"#9a3412" };
                      return { bg:"#fecaca", text:"#991b1b" };
                    };
                    const maxDays = agingHeatData.maxDays;
                    return (
                      <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"20px 22px", boxShadow:"0 1px 4px rgba(0,0,0,0.05)", overflowX:"auto" }}>
                        <div style={{ fontSize:13.5, fontWeight:700, color:"#0f172a", marginBottom:3 }}>Heatmap tuổi thọ CAPA</div>
                        <div style={{ fontSize:12, color:"#94a3b8", marginBottom:12 }}>Số ngày TB chưa đóng · Bộ phận × Ưu tiên</div>
                        <div style={{ display:"flex", gap:10, marginBottom:12, flexWrap:"wrap" }}>
                          {[{l:"≤7 ngày",bg:"#dcfce7",t:"#166534"},{l:"8–14 ngày",bg:"#fef9c3",t:"#92400e"},{l:"15–29 ngày",bg:"#fed7aa",t:"#9a3412"},{l:"≥30 ngày",bg:"#fecaca",t:"#991b1b"}].map(s => (
                            <div key={s.l} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, fontWeight:500 }}>
                              <div style={{ width:12, height:12, borderRadius:3, background:s.bg, border:"1px solid #e2e8f0" }}/>
                              <span style={{ color:"#64748b" }}>{s.l}</span>
                            </div>
                          ))}
                          <span style={{ marginLeft:"auto", fontSize:11, color:"#94a3b8" }}>Max: <strong style={{ color:"#dc2626" }}>{maxDays}d</strong></span>
                        </div>
                        <div style={{ minWidth:380, overflowX:"auto" }}>
                          <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:3 }}>
                            <thead>
                              <tr>
                                <th style={{ fontSize:11, fontWeight:600, color:"#64748b", textAlign:"left", padding:"4px 8px", background:"#f8fafc", borderRadius:5, width:100 }}>Bộ phận</th>
                                {PRI_COLS.map(p => (
                                  <th key={p.key} style={{ fontSize:11, fontWeight:700, color:p.color, textAlign:"center", padding:"4px 6px", background:"#f8fafc", borderRadius:5, width:90 }}>{p.label}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {agingHeatData.cells.map(row => (
                                <tr key={row.dept}>
                                  <td style={{ fontSize:11.5, fontWeight:600, color:"#334155", padding:"3px 8px", background:"#f8fafc", borderRadius:5, whiteSpace:"nowrap" }}>{row.dept}</td>
                                  {row.vals.map((v, ci) => {
                                    if (!v) return (
                                      <td key={ci} style={{ textAlign:"center", padding:3 }}>
                                        <div style={{ borderRadius:6, background:"#f8fafc", height:40, display:"flex", alignItems:"center", justifyContent:"center" }}>
                                          <span style={{ color:"#cbd5e1", fontSize:14 }}>—</span>
                                        </div>
                                      </td>
                                    );
                                    const { bg, text } = heatColor(v.avg, maxDays);
                                    return (
                                      <td key={ci} style={{ textAlign:"center", padding:3 }}>
                                        <div title={`${v.count} CAPA · TB ${v.avg} ngày`}
                                          style={{ borderRadius:6, background:bg, height:40, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:1 }}>
                                          <span style={{ fontSize:14, fontWeight:800, color:text, lineHeight:1 }}>{v.avg}<span style={{ fontSize:9, fontWeight:500 }}>d</span></span>
                                          <span style={{ fontSize:9, fontWeight:500, color:`${text}aa` }}>{v.count} CAPA</span>
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Pipeline funnel */}
                  <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"20px 22px", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                    <div style={{ fontSize:13.5, fontWeight:700, color:"#0f172a", marginBottom:3 }}>Pipeline trạng thái</div>
                    <div style={{ fontSize:12, color:"#94a3b8", marginBottom:16 }}>Dòng chảy từ tạo mới → hoàn thành</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      {statusFunnelData.map((s, i) => {
                        const maxVal = statusFunnelData[0]?.value || 1;
                        const pct = Math.round(s.value / maxVal * 100);
                        return (
                          <div key={i}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                              <span style={{ fontSize:12, fontWeight:600, color:"#334155" }}>{s.name}</span>
                              <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                                <span style={{ fontSize:18, fontWeight:800, color:"#0f172a", lineHeight:1 }}>{s.value}</span>
                                <span style={{ fontSize:10.5, fontWeight:500, color:"#94a3b8" }}>{pct}%</span>
                              </div>
                            </div>
                            <div style={{ height:10, borderRadius:6, background:"#f1f5f9", overflow:"hidden" }}>
                              <div style={{ height:"100%", width:`${pct}%`, background:s.fill, borderRadius:6, opacity:0.85, transition:"width 0.6s ease" }}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {totalActions > 0 && (
                      <div style={{ marginTop:16, padding:"12px 14px", background:"#f0fdf4", borderRadius:8, border:"1px solid #bbf7d0", textAlign:"center" }}>
                        <div style={{ fontSize:26, fontWeight:800, color:"#16a34a", lineHeight:1 }}>{Math.round(closedCount / totalActions * 100)}%</div>
                        <div style={{ fontSize:11.5, color:"#15803d", fontWeight:600, marginTop:3 }}>Tỷ lệ hoàn thành tổng thể</div>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )
        )}
      </div>

      {/* ── DETAIL PANEL ──────────────────────── */}
      {detailAction && createPortal(
        <CapaDetailPanel
          action={detailAction}
          onClose={() => setDetailAction(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onVerify={handleVerify}
          submitting={submitting}
        />,
        document.body
      )}

      {/* ── TOAST ─────────────────────────────── */}
      {toast && <Toast message={toast.message} ok={toast.ok} />}
    </div>

    {/* ── EXPORT MODAL ──────────────────── */}
    {showExportModal && (
      <CapaExportModal
        actions={actions as unknown as CapaExportItem[]}
        onClose={() => setShowExportModal(false)}
        pageTitle="Phê duyệt CAPA"
      />
    )}
    </>
  );
}

export default SafetyCapaApprovalPage;
