import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BarChart, Bar, PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  XAxis, YAxis, CartesianGrid, Legend, FunnelChart, Funnel, LabelList,
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
   CAPA DETAIL PANEL (slide-over)
═══════════════════════════════════════ */
interface DetailPanelProps {
  action: CapaAction;
  onClose: () => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onVerify: (id: string, approved: boolean, note: string) => Promise<void>;
  submitting: string | null;
}
function CapaDetailPanel({ action, onClose, onApprove, onReject, onVerify, submitting }: DetailPanelProps) {
  const [detailTab, setDetailTab] = useState<"info" | "log" | "comment">("info");
  const [fullData, setFullData]   = useState<CapaAction | null>(null);
  const [loadingFull, setLoadingFull] = useState(true);

  // Reject flow
  const [rejectMode, setRejectMode]   = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Verify flow
  const [verifyMode, setVerifyMode]   = useState<"close" | "reopen" | null>(null);
  const [verifyNote, setVerifyNote]   = useState("");

  useEffect(() => {
    setLoadingFull(true);
    setFullData(null); // clear stale data immediately on action change
    apiFetch<CapaAction>(`/api/actions/${action.id}`)
      .then((d) => setFullData(d))
      .catch(() => setFullData(null))
      .finally(() => setLoadingFull(false));
  }, [action.id]);

  const data = fullData ?? action;
  const isPending = data.status === "draft" || data.status === "pending_ehs";
  const isDoneByOwner = data.status === "done_by_owner";
  const pt = data.problemType ? PROBLEM_TYPE_MAP[data.problemType] : null;

  const handleRejectConfirm = async () => {
    await onReject(action.id, rejectReason || "Không đạt yêu cầu");
    setRejectMode(false);
    setRejectReason("");
  };
  const handleVerifyConfirm = async (approved: boolean) => {
    await onVerify(action.id, approved, verifyNote);
    setVerifyMode(null);
    setVerifyNote("");
  };

  return (
    <>
      {/* backdrop */}
      <div className="cap-panel-backdrop" onClick={onClose} />

      {/* panel */}
      <div className="cap-detail-panel">
        {/* Header */}
        <div className="cap-panel-header">
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <span className="cap-code">{data.code}</span>
              <StatusPill status={data.status} />
              {isOverdue(data.dueDate) && data.status !== "closed" && (
                <span style={{ fontSize:10, fontWeight:700, color:"#dc2626", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:6, padding:"2px 7px" }}>⚠️ Quá hạn</span>
              )}
            </div>
            <div className="cap-panel-title" title={data.title}>{data.title}</div>
          </div>
          <button className="cap-panel-close" onClick={onClose} title="Đóng">
            <X style={{ width:16, height:16 }} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="cap-panel-tabs">
          {([["info","Chi tiết","📋"],["log","Nhật ký","📜"],["comment","Bình luận","💬"]] as const).map(([key,label,icon]) => (
            <button key={key} className={`cap-panel-tab${detailTab === key ? " active" : ""}`} onClick={() => setDetailTab(key)}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="cap-panel-body">

          {detailTab === "info" && (
            <div className="cap-panel-info">
              {loadingFull && <div style={{ display:"flex", gap:8, alignItems:"center", color:"#94a3b8", padding:"12px 0" }}><Loader2 style={{ width:14, height:14, animation:"spin 1s linear infinite" }} /> Đang tải…</div>}

              {/* Basic meta grid */}
              <div className="cap-info-grid">
                <div className="cap-info-row"><span className="cap-info-label">Mã CAPA</span><span className="cap-info-val">{data.code}</span></div>
                <div className="cap-info-row"><span className="cap-info-label">Bộ phận</span><span className="cap-info-val">{data.departmentCode || "EHS"}</span></div>
                <div className="cap-info-row"><span className="cap-info-label">Người phụ trách</span><span className="cap-info-val">{data.ownerName || "—"}</span></div>
                <div className="cap-info-row"><span className="cap-info-label">Người tạo</span><span className="cap-info-val">{data.createdByName || "—"}</span></div>
                <div className="cap-info-row"><span className="cap-info-label">Ưu tiên</span>
                  <span><span className={`cap-priority-badge ${priClass(data.priority || "medium")}`}>{priLabel(data.priority || "medium")}</span></span>
                </div>
                <div className="cap-info-row"><span className="cap-info-label">Nguồn</span>
                  <span className="cap-source-badge">{srcLabel(data.sourceType || "manual")}{data.sourceTitle ? ` — ${data.sourceTitle}` : data.sourceCode ? ` #${data.sourceCode}` : ""}</span>
                </div>
                <div className="cap-info-row"><span className="cap-info-label">Hạn xử lý</span>
                  <span style={{ color: isOverdue(data.dueDate) && data.status !== "closed" ? "#dc2626" : undefined, fontWeight:600 }}>{formatDate(data.dueDate)}</span>
                </div>
                <div className="cap-info-row"><span className="cap-info-label">Ngày tạo</span><span className="cap-info-val">{formatDate(data.createdAt)}</span></div>
                {pt && (
                  <div className="cap-info-row" style={{ gridColumn:"1/-1" }}>
                    <span className="cap-info-label">Loại vấn đề</span>
                    <ProblemTypeBadge code={data.problemType} />
                  </div>
                )}
              </div>

              {/* Description */}
              {data.description && (
                <div className="cap-info-section">
                  <div className="cap-info-section-title">📝 Mô tả vấn đề</div>
                  <div className="cap-info-text">{data.description}</div>
                </div>
              )}

              {/* Action plan */}
              {Array.isArray(data.actionPlan) && data.actionPlan.length > 0 && (
                <div className="cap-info-section">
                  <div className="cap-info-section-title">🗂️ Kế hoạch hành động</div>
                  <div className="cap-action-plan-list">
                    {data.actionPlan.map((step, i) => (
                      <div key={i} className="cap-action-plan-item">
                        <div className="cap-action-plan-num">{i + 1}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:600, fontSize:13, color:"#0f172a" }}>{step.step}</div>
                          <div style={{ fontSize:11, color:"#64748b", marginTop:2, display:"flex", gap:12, flexWrap:"wrap" }}>
                            {step.responsible && <span>👤 {step.responsible}</span>}
                            {step.dueDate && <span>📅 {formatDate(step.dueDate)}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence notes */}
              {data.evidenceNotes && (
                <div className="cap-info-section">
                  <div className="cap-info-section-title">📎 Ghi chú bằng chứng</div>
                  <div className="cap-info-text">{data.evidenceNotes}</div>
                </div>
              )}

              {/* Evidence files */}
              {Array.isArray(data.evidenceFiles) && data.evidenceFiles.length > 0 && (
                <div className="cap-info-section">
                  <div className="cap-info-section-title">🗂️ File bằng chứng ({data.evidenceFiles.length})</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:6, marginTop:8 }}>
                    {data.evidenceFiles.map((f, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", background:"#f8fafc", borderRadius:8, border:"1px solid #e2e8f0", fontSize:12 }}>
                        <FileText style={{ width:14, height:14, color:"#64748b", flexShrink:0 }} />
                        <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"#334155" }}>{f.originalName || f.fileName}</span>
                        {f.size && <span style={{ color:"#94a3b8", whiteSpace:"nowrap" }}>{(f.size / 1024).toFixed(0)} KB</span>}
                        <a href={`/uploads/${f.fileName}`} download={f.originalName || f.fileName}
                          onClick={(e) => e.stopPropagation()}
                          style={{ display:"flex", alignItems:"center", gap:3, padding:"3px 8px", borderRadius:5, background:"#eff6ff", color:"#1d4ed8", fontSize:11, fontWeight:600, textDecoration:"none", flexShrink:0, border:"1px solid #bfdbfe" }}
                          title="Tải xuống">
                          ⬇ Tải
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rejection note */}
              {data.rejectionNote && (
                <div className="cap-info-section" style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:"12px 14px" }}>
                  <div className="cap-info-section-title" style={{ color:"#dc2626" }}>❌ Lý do từ chối trước đó</div>
                  <div style={{ fontSize:13, color:"#991b1b", marginTop:6 }}>{data.rejectionNote}</div>
                </div>
              )}

              {/* Verification note */}
              {data.verificationNote && (
                <div className="cap-info-section" style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"12px 14px" }}>
                  <div className="cap-info-section-title" style={{ color:"#16a34a" }}>🏁 Ghi chú nghiệm thu</div>
                  <div style={{ fontSize:13, color:"#166534", marginTop:6 }}>{data.verificationNote}</div>
                  {data.verifiedByName && <div style={{ fontSize:11, color:"#16a34a", marginTop:4 }}>Nghiệm thu bởi: {data.verifiedByName} — {formatDate(data.verifiedAt)}</div>}
                </div>
              )}
            </div>
          )}

          {detailTab === "log" && <ActionLogTimeline actionId={action.id} />}
          {detailTab === "comment" && (
            <CommentPanel
              actionId={action.id}
              onClose={() => setDetailTab("info")}
            />
          )}
        </div>

        {/* Footer actions */}
        {(isPending || isDoneByOwner) && (
          <div className="cap-panel-footer">
            {/* Reject / Reopen flow */}
            {rejectMode && (
              <div className="cap-panel-reject-flow">
                <div style={{ fontWeight:600, fontSize:12, color:"#dc2626", marginBottom:6 }}>Lý do từ chối:</div>
                <div className="cap-reject-presets">
                  {REJECT_PRESETS.map((p) => (
                    <button key={p} className={`cap-preset-chip${rejectReason === p ? " active" : ""}`} onClick={() => setRejectReason(rejectReason === p ? "" : p)}>{p}</button>
                  ))}
                </div>
                <input className="cap-reject-input" style={{ marginTop:6 }} placeholder="Hoặc nhập lý do tùy ý…" value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleRejectConfirm()} autoFocus />
                <div style={{ display:"flex", gap:8, marginTop:8 }}>
                  <button className="cap-reject-confirm" style={{ flex:1 }} disabled={submitting === action.id} onClick={handleRejectConfirm}>
                    {submitting === action.id ? "Đang xử lý…" : "✕ Xác nhận từ chối"}
                  </button>
                  <button className="cap-reject-cancel" onClick={() => { setRejectMode(false); setRejectReason(""); }}>Huỷ</button>
                </div>
              </div>
            )}

            {/* Verify flow */}
            {verifyMode && (
              <div className="cap-panel-reject-flow" style={{ borderColor:"#bae6fd" }}>
                <div style={{ fontWeight:600, fontSize:12, color: verifyMode === "close" ? "#16a34a" : "#d97706", marginBottom:6 }}>
                  {verifyMode === "close" ? "Ghi chú nghiệm thu (tuỳ chọn):" : "Lý do trả lại:"}
                </div>
                <input className="cap-reject-input" style={{ borderColor: verifyMode === "close" ? "#86efac" : "#fca5a5" }}
                  placeholder={verifyMode === "close" ? "Ghi chú khi đóng CAPA (không bắt buộc)…" : "Nêu lý do chưa đạt…"}
                  value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleVerifyConfirm(verifyMode === "close")} autoFocus />
                <div style={{ display:"flex", gap:8, marginTop:8 }}>
                  <button className="cap-btn-approve"
                    style={{ flex:1, background: verifyMode === "close" ? "#16a34a" : "#d97706", border:"none", color:"#fff", padding:"8px 14px", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer" }}
                    disabled={submitting === action.id} onClick={() => handleVerifyConfirm(verifyMode === "close")}>
                    {submitting === action.id ? "Đang xử lý…" : verifyMode === "close" ? "🏁 Xác nhận & Đóng CAPA" : "↩️ Xác nhận Trả lại"}
                  </button>
                  <button className="cap-reject-cancel" onClick={() => { setVerifyMode(null); setVerifyNote(""); }}>Huỷ</button>
                </div>
              </div>
            )}

            {/* Main action buttons */}
            {!rejectMode && !verifyMode && (
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {isPending && (
                  <>
                    <button className="cap-btn-reject" style={{ flex:1 }} onClick={() => setRejectMode(true)}>
                      <XCircle style={{ width:13, height:13 }} /> Từ chối
                    </button>
                    <button className="cap-btn-approve" style={{ flex:1 }} disabled={submitting === action.id} onClick={() => onApprove(action.id)}>
                      {submitting === action.id
                        ? <><Loader2 style={{ width:13, height:13, animation:"spin 1s linear infinite" }} /> Đang xử lý…</>
                        : <><CheckCircle2 style={{ width:13, height:13 }} /> Phê duyệt</>}
                    </button>
                  </>
                )}
                {isDoneByOwner && (
                  <>
                    <button className="cap-btn-verify-reopen" onClick={() => setVerifyMode("reopen")}>
                      ↩️ Trả lại
                    </button>
                    <button className="cap-btn-verify-close" disabled={submitting === action.id} onClick={() => setVerifyMode("close")}>
                      <ClipboardCheck style={{ width:13, height:13 }} /> Nghiệm thu & Đóng
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
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

  // Print / PDF report
  const [showPrintReport, setShowPrintReport]       = useState(false);
  const [reportPeriod, setReportPeriod]             = useState<"month"|"quarter"|"year"|"custom">("month");
  const [reportFrom, setReportFrom]                 = useState("");
  const [reportTo, setReportTo]                     = useState("");

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
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((a) =>
        a.title.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        (a.ownerName || "").toLowerCase().includes(q) ||
        (a.departmentCode || "").toLowerCase().includes(q)
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
  }, [actions, searchQuery, sortPriority]);

  const processed = useMemo(() => {
    let base = actions.filter((a) => a.status !== "draft" && a.status !== "pending_ehs");
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
    return base;
  }, [actions, processedFilter, processedSearch]);

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
    const counts: Record<string, { open:number; closed:number; pending:number }> = {};
    actions.forEach((a) => {
      const dept = a.departmentCode || "EHS";
      if (!counts[dept]) counts[dept] = { open:0, closed:0, pending:0 };
      if (a.status === "draft" || a.status === "pending_ehs") counts[dept].pending++;
      else if (a.status === "closed" || a.status === "rejected") counts[dept].closed++;
      else counts[dept].open++;
    });
    return Object.entries(counts).map(([dept,v]) => ({ dept, ...v, total:v.open+v.closed+v.pending }))
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

  /* export CSV */
  const handleExport = () => {
    window.open("/api/actions/export.csv", "_blank");
  };

  /* ── helpers for new UI ── */
  const totalActions = actions.length;
  const statCards = [
    { key:"pending",  label:"Chờ phê duyệt",   value:pendingCount,    sub:`${actions.filter(a=>isOverdue(a.dueDate)&&(a.status==="draft"||a.status==="pending_ehs")).length} quá hạn`, accent:"#ea580c", icon:Clock,          pct:totalActions?Math.round(pendingCount/totalActions*100):0 },
    { key:"active",   label:"Đang triển khai",  value:inProgressCount, sub:"đã duyệt, đang làm",   accent:"#2563eb", icon:TrendingUp,     pct:totalActions?Math.round(inProgressCount/totalActions*100):0 },
    { key:"verify",   label:"Chờ nghiệm thu",   value:doneCount,       sub:"chờ EHS xác minh",     accent:"#d97706", icon:ClipboardCheck, pct:totalActions?Math.round(doneCount/totalActions*100):0 },
    { key:"closed",   label:"Hoàn thành",        value:closedCount,     sub:"đã nghiệm thu & đóng", accent:"#16a34a", icon:CheckCircle2,   pct:totalActions?Math.round(closedCount/totalActions*100):0 },
  ];

  if (loading) return (
    <div className="cap2-root">
      <div className="cap-state-center">
        <RefreshCw style={{ width:28, height:28, color:"#1565c0", animation:"spin 1s linear infinite" }} />
        <span>Đang tải dữ liệu CAPA…</span>
      </div>
    </div>
  );
  if (error) return (
    <div className="cap2-root">
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
    <div className="cap2-root">

      {/* ── HEADER ─────────────────────────── */}
      <div className="cap2-header">
        <div style={{ display:"flex", alignItems:"center", gap:14, flex:1, minWidth:0 }}>
          <div className="cap2-header-icon">
            <ShieldCheck style={{ width:22, height:22, color:"#fff" }} />
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:20, fontWeight:900, color:"#0f172a", letterSpacing:"-0.02em", lineHeight:1.1 }}>Phê duyệt CAPA</div>
            <div style={{ fontSize:12, fontWeight:500, color:"#64748b", marginTop:2 }}>Xem xét · Phê duyệt · Từ chối · Nghiệm thu — EHS Admin</div>
            <a href="/safety-6s/intel" style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:11, fontWeight:700, color:"#1565c0", textDecoration:"none", marginTop:2, opacity:0.8 }}>
              ← EHS Intelligence Dashboard
            </a>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0, flexWrap:"wrap" }}>
          {overdueCount > 0 && (
            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:9, background:"#fef2f2", border:"1.5px solid #fecaca" }}>
              <AlertTriangle style={{ width:13, height:13, color:"#dc2626" }} />
              <span style={{ fontSize:12, fontWeight:700, color:"#dc2626" }}>{overdueCount} CAPA quá hạn!</span>
            </div>
          )}
          <span style={{ fontSize:11, fontWeight:600, color:"#64748b", background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:20, padding:"4px 12px" }}>
            {new Date().toLocaleDateString("vi-VN", { month:"long", year:"numeric" })}
          </span>
          <button className="cap2-btn-export" onClick={handleExport} title="Xuất CSV">
            <Download style={{ width:13, height:13 }} /> Xuất CSV
          </button>
          <button className="cap2-btn-export" onClick={() => setShowPrintReport(true)} title="Xuất báo cáo PDF" style={{ background:"linear-gradient(135deg,#1565c0,#1e40af)", color:"#fff", border:"none" }}>
            <FileText style={{ width:13, height:13 }} /> Xuất PDF
          </button>
          <button className="cap2-btn-refresh" onClick={load} title="Làm mới">
            <RefreshCw style={{ width:13, height:13 }} />
          </button>
        </div>
      </div>

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
      <div className="cap2-stat-grid">
        {statCards.map((s) => {
          const Icon = s.icon;
          const isActive = (s.key === "pending" && tab === "pending") || (s.key !== "pending" && tab === "processed");
          return (
            <div key={s.key} className="cap2-stat-card" onClick={() => { if (s.key === "pending") setTab("pending"); else { setTab("processed"); if (s.key === "verify") setProcessedFilter("done_by_owner"); else if (s.key === "closed") setProcessedFilter("closed"); else setProcessedFilter("all"); } }}
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
      <div className="cap2-toolbar">
        {/* Segmented tabs */}
        <div className="cap2-seg-ctrl">
          {([
            { key:"pending"   as const, label:"Chờ duyệt", badge:pendingCount, badgeColor:"#ea580c", Icon:ListChecks },
            { key:"processed" as const, label:"Đã xử lý",  badge:doneCount,    badgeColor:"#d97706", Icon:CheckCircle2 },
            { key:"charts"    as const, label:"Biểu đồ",   badge:0,            badgeColor:"",        Icon:BarChart3 },
          ]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className="cap2-seg-btn" style={{ background:tab===t.key?"#fff":"transparent", boxShadow:tab===t.key?"0 1px 4px rgba(0,0,0,0.10)":"none", color:tab===t.key?"#1e40af":"#64748b", fontWeight:tab===t.key?800:600 }}>
              <t.Icon style={{ width:14, height:14 }}/> {t.label}
              {t.badge>0 && <span style={{ fontSize:10, fontWeight:800, color:"#fff", background:t.badgeColor, borderRadius:10, padding:"1px 6px", lineHeight:1.4, marginLeft:2 }}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* Search */}
        {tab !== "charts" && (
          <div className="cap2-search">
            <Search style={{ width:14, height:14, color:"#94a3b8", flexShrink:0 }}/>
            <input
              value={tab === "pending" ? searchQuery : processedSearch}
              onChange={(e) => tab === "pending" ? setSearchQuery(e.target.value) : setProcessedSearch(e.target.value)}
              placeholder="Tìm theo tiêu đề, mã CAPA, người phụ trách, bộ phận…"
              style={{ flex:1, border:"none", outline:"none", fontSize:13, color:"#0f172a", background:"transparent", fontFamily:"inherit" }}
            />
            {(tab === "pending" ? searchQuery : processedSearch) && (
              <button onClick={() => tab === "pending" ? setSearchQuery("") : setProcessedSearch("")} style={{ background:"none", border:"none", cursor:"pointer", color:"#94a3b8", display:"flex" }}>
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
                                        onClick={() => handleReassign(action.id, u)}
                                        style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:9, border:isCurrent?"1.5px solid #7c3aed":"1px solid transparent", background:isCurrent?"#ede9fe":"#fff", cursor:isCurrent||isSubmitting?"default":"pointer", textAlign:"left", transition:"background .12s", opacity:isSubmitting&&!isCurrent?.5:1 }}
                                        onMouseEnter={e => { if (!isCurrent && !isSubmitting) (e.currentTarget as HTMLElement).style.background = "#f5f3ff"; }}
                                        onMouseLeave={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.background = isCurrent?"#ede9fe":"#fff"; }}>
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
                          <tr key={action.id} style={{ borderBottom:ri < processed.length-1?"1px solid #f1f5f9":"none", cursor:"pointer", transition:"background .1s" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#fafbfd")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
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
              <div className="cap-charts-grid">
                <div className="cap-chart-card">
                  <div className="cap-chart-title">🔍 Phân bổ theo nguồn</div>
                  <div className="cap-chart-sub">CAPA từ mỗi nguồn phát sinh</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={sourceChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3}>
                        {sourceChartData.map((e, i) => <Cell key={i} fill={e.color} stroke="none" />)}
                      </Pie>
                      <Tooltip content={<CustomTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="cap-legend">
                    {sourceChartData.map((e, i) => (
                      <div key={i} className="cap-legend-item"><div className="cap-legend-dot" style={{ background:e.color }} />{e.name} ({e.value})</div>
                    ))}
                  </div>
                </div>

                <div className="cap-chart-card">
                  <div className="cap-chart-title">⚡ Theo mức độ ưu tiên</div>
                  <div className="cap-chart-sub">Số lượng CAPA theo mức ưu tiên</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={priorityChartData} margin={{ top:4, right:8, bottom:4, left:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize:11, fill:"#64748b" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize:11, fill:"#94a3b8" }} axisLine={false} tickLine={false} width={24} />
                      <Tooltip content={<CustomTip />} />
                      <Bar dataKey="value" name="Số CAPA" radius={[6,6,0,0]}>
                        {priorityChartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="cap-chart-card wide">
                  <div className="cap-chart-title">🏭 Phân bổ CAPA theo bộ phận</div>
                  <div className="cap-chart-sub">Top 10 bộ phận theo số lượng CAPA</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={deptChartData} margin={{ top:4, right:16, bottom:4, left:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="dept" tick={{ fontSize:11, fill:"#64748b" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize:11, fill:"#94a3b8" }} axisLine={false} tickLine={false} width={24} />
                      <Tooltip content={<CustomTip />} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:11, paddingTop:8 }} />
                      <Bar dataKey="pending" name="Chờ duyệt"      fill="#f97316" radius={[4,4,0,0]} stackId="a" />
                      <Bar dataKey="open"    name="Đang thực hiện" fill="#3b82f6" radius={[0,0,0,0]} stackId="a" />
                      <Bar dataKey="closed"  name="Hoàn thành"     fill="#22c55e" radius={[4,4,0,0]} stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* ── AGING HEATMAP ── */}
                {agingHeatData.depts.length > 0 && (() => {
                  const PRI_COLS = [
                    { key:"critical", label:"Khẩn cấp", color:"#dc2626" },
                    { key:"high",     label:"Cao",       color:"#ea580c" },
                    { key:"medium",   label:"Trung bình",color:"#d97706" },
                    { key:"low",      label:"Thấp",      color:"#16a34a" },
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
                    <div className="cap-chart-card wide" style={{ overflowX:"auto" }}>
                      <div className="cap-chart-title">⏳ Heatmap tuổi thọ CAPA</div>
                      <div className="cap-chart-sub">Số ngày trung bình chưa đóng — theo bộ phận × mức ưu tiên (chỉ CAPA đang mở)</div>

                      {/* Legend scale */}
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
                        {[
                          { label:"0–7 ngày",  bg:"#dcfce7", text:"#166534" },
                          { label:"8–14 ngày", bg:"#fef9c3", text:"#92400e" },
                          { label:"15–29 ngày",bg:"#fed7aa", text:"#9a3412" },
                          { label:"≥30 ngày",  bg:"#fecaca", text:"#991b1b" },
                        ].map(s => (
                          <div key={s.label} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
                            <div style={{ width:16, height:16, borderRadius:4, background:s.bg, border:`1px solid ${s.text}40` }}/>
                            <span style={{ color:"#64748b", fontWeight:500 }}>{s.label}</span>
                          </div>
                        ))}
                        <div style={{ marginLeft:"auto", fontSize:11, color:"#94a3b8" }}>
                          Tối đa: <strong style={{ color:"#dc2626" }}>{maxDays} ngày</strong>
                        </div>
                      </div>

                      {/* Grid table */}
                      <div style={{ minWidth:480, overflowX:"auto" }}>
                        <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:4 }}>
                          <thead>
                            <tr>
                              <th style={{ fontSize:11, fontWeight:700, color:"#64748b", textAlign:"left", padding:"4px 10px", background:"#f8fafc", borderRadius:6, width:120 }}>Bộ phận</th>
                              {PRI_COLS.map(p => (
                                <th key={p.key} style={{ fontSize:11, fontWeight:700, color:p.color, textAlign:"center", padding:"6px 8px", background:`${p.color}10`, borderRadius:8, width:110 }}>
                                  {p.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {agingHeatData.cells.map(row => (
                              <tr key={row.dept}>
                                <td style={{ fontSize:12, fontWeight:700, color:"#334155", padding:"5px 10px", background:"#f8fafc", borderRadius:7, whiteSpace:"nowrap" }}>{row.dept}</td>
                                {row.vals.map((v, ci) => {
                                  if (!v) return (
                                    <td key={ci} style={{ textAlign:"center", padding:4 }}>
                                      <div style={{ borderRadius:8, background:"#f1f5f9", height:44, display:"flex", alignItems:"center", justifyContent:"center" }}>
                                        <span style={{ color:"#cbd5e1", fontSize:16 }}>—</span>
                                      </div>
                                    </td>
                                  );
                                  const { bg, text } = heatColor(v.avg, maxDays);
                                  return (
                                    <td key={ci} style={{ textAlign:"center", padding:4 }}>
                                      <div title={`${v.count} CAPA · TB ${v.avg} ngày`}
                                        style={{ borderRadius:8, background:bg, height:44, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:1, cursor:"default", border:`1px solid ${text}20` }}>
                                        <span style={{ fontSize:15, fontWeight:900, color:text, lineHeight:1 }}>{v.avg}<span style={{ fontSize:9, fontWeight:600 }}>d</span></span>
                                        <span style={{ fontSize:9.5, fontWeight:600, color:`${text}99`, lineHeight:1 }}>{v.count} CAPA</span>
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

                <div className="cap-chart-card wide">
                  <div className="cap-chart-title">🔄 Pipeline trạng thái CAPA</div>
                  <div className="cap-chart-sub">Dòng chảy từ tạo mới → hoàn thành</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <FunnelChart>
                      <Tooltip content={<CustomTip />} />
                      <Funnel dataKey="value" data={statusFunnelData} isAnimationActive>
                        <LabelList position="right" fill="#0f172a" stroke="none" dataKey="name" style={{ fontSize:12, fontWeight:600 }} />
                        <LabelList position="center" fill="#fff" stroke="none" dataKey="value" style={{ fontSize:13, fontWeight:800 }} />
                      </Funnel>
                    </FunnelChart>
                  </ResponsiveContainer>
                  <div className="cap-legend">
                    {statusFunnelData.map((e, i) => (
                      <div key={i} className="cap-legend-item">
                        <div className="cap-legend-dot" style={{ background:e.fill }} />
                        {e.name}: <strong>{e.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
        )}
      </div>

      {/* ── DETAIL PANEL ──────────────────────── */}
      {detailAction && (
        <CapaDetailPanel
          action={detailAction}
          onClose={() => setDetailAction(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onVerify={handleVerify}
          submitting={submitting}
        />
      )}

      {/* ── TOAST ─────────────────────────────── */}
      {toast && <Toast message={toast.message} ok={toast.ok} />}
    </div>

    {/* ── PDF REPORT PORTAL ──────────────────── */}

    {showPrintReport && createPortal(
      (() => {
        const now = new Date();
        const yr  = now.getFullYear();
        const mo  = now.getMonth();   // 0-indexed

        /* ── period bounds ── */
        let pFrom: Date | null = null;
        let pTo:   Date | null = null;
        let periodLabel = "";
        if (reportPeriod === "month") {
          pFrom = new Date(yr, mo, 1);
          pTo   = new Date(yr, mo + 1, 0, 23, 59, 59);
          periodLabel = now.toLocaleDateString("vi-VN", { month:"long", year:"numeric" });
        } else if (reportPeriod === "quarter") {
          const q = Math.floor(mo / 3);
          pFrom = new Date(yr, q * 3, 1);
          pTo   = new Date(yr, q * 3 + 3, 0, 23, 59, 59);
          periodLabel = `Quý ${q + 1}/${yr}`;
        } else if (reportPeriod === "year") {
          pFrom = new Date(yr, 0, 1);
          pTo   = new Date(yr, 11, 31, 23, 59, 59);
          periodLabel = `Năm ${yr}`;
        } else {
          /* custom */
          pFrom = reportFrom ? new Date(reportFrom) : null;
          pTo   = reportTo   ? new Date(reportTo + "T23:59:59") : null;
          periodLabel = (reportFrom && reportTo)
            ? `${new Date(reportFrom).toLocaleDateString("vi-VN")} – ${new Date(reportTo).toLocaleDateString("vi-VN")}`
            : "Tùy chỉnh";
        }

        /* ── filter actions by createdAt within bounds ── */
        const filteredActions = pFrom || pTo
          ? actions.filter(a => {
              if (!a.createdAt) return reportPeriod === "custom"; // no date → include only in custom
              const d = new Date(a.createdAt);
              if (pFrom && d < pFrom) return false;
              if (pTo   && d > pTo)   return false;
              return true;
            })
          : actions;

        const reportDate = now.toLocaleDateString("vi-VN", { day:"2-digit", month:"2-digit", year:"numeric" });
        const reportTime = now.toLocaleTimeString("vi-VN", { hour:"2-digit", minute:"2-digit" });
        const rejCount   = filteredActions.filter(a => a.status === "rejected").length;
        const totalOv    = filteredActions.filter(a => isOverdue(a.dueDate) && a.status !== "closed" && a.status !== "rejected").length;
        const fPending   = filteredActions.filter(a => a.status === "draft" || a.status === "pending_ehs").length;
        const fActive    = filteredActions.filter(a => a.status === "open"  || a.status === "in_progress").length;
        const fDone      = filteredActions.filter(a => a.status === "done_by_owner").length;
        const fClosed    = filteredActions.filter(a => a.status === "closed").length;

        /* dept summary */
        const deptSummary: Record<string, { pending:number; active:number; done:number; closed:number; rejected:number; overdue:number }> = {};
        filteredActions.forEach(a => {
          const d = a.departmentCode || "EHS";
          if (!deptSummary[d]) deptSummary[d] = { pending:0, active:0, done:0, closed:0, rejected:0, overdue:0 };
          if (a.status === "draft" || a.status === "pending_ehs") deptSummary[d].pending++;
          else if (a.status === "open" || a.status === "in_progress") deptSummary[d].active++;
          else if (a.status === "done_by_owner") deptSummary[d].done++;
          else if (a.status === "closed") deptSummary[d].closed++;
          else if (a.status === "rejected") deptSummary[d].rejected++;
          if (isOverdue(a.dueDate) && a.status !== "closed" && a.status !== "rejected") deptSummary[d].overdue++;
        });

        /* status label map */
        const statusLabel: Record<string, string> = {
          draft:"Nháp", pending_ehs:"Chờ duyệt EHS", open:"Đã mở", in_progress:"Đang triển khai",
          done_by_owner:"Chờ nghiệm thu", closed:"Hoàn thành", rejected:"Từ chối",
        };

        /* sorted by priority */
        const PRI_ORDER: Record<string, number> = { critical:0, high:1, medium:2, low:3 };
        const sortedActions = [...filteredActions].sort((a, b) =>
          (PRI_ORDER[a.priority ?? "medium"] ?? 2) - (PRI_ORDER[b.priority ?? "medium"] ?? 2)
        );

        const PERIOD_TABS: { key: "month"|"quarter"|"year"|"custom"; label: string }[] = [
          { key:"month",   label:"Tháng này" },
          { key:"quarter", label:"Quý này" },
          { key:"year",    label:"Năm này" },
          { key:"custom",  label:"Tùy chỉnh" },
        ];

        return (
          <div className="cap2-print-overlay" onClick={e => { if (e.target === e.currentTarget) setShowPrintReport(false); }}>
            <div className="cap2-print-report">
              {/* toolbar — hidden on print */}
              <div className="cap2-print-toolbar" style={{ flexDirection:"column", alignItems:"stretch", gap:10 }}>
                {/* top row: title + actions */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
                  <span className="cap2-print-toolbar-title">
                    📄 Xem trước báo cáo PDF — <span style={{ color:"#1565c0" }}>{periodLabel}</span>
                    <span style={{ fontWeight:400, color:"#94a3b8", marginLeft:8 }}>({filteredActions.length}/{actions.length} CAPA)</span>
                  </span>
                  <div className="cap2-print-toolbar-actions">
                    <button className="cap2-print-btn-print" onClick={() => window.print()}>
                      <FileText style={{ width:13, height:13 }}/> In / Lưu PDF
                    </button>
                    <button className="cap2-print-btn-close" onClick={() => setShowPrintReport(false)}>
                      <X style={{ width:12, height:12 }}/> Đóng
                    </button>
                  </div>
                </div>

                {/* period selector row */}
                <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                  <span style={{ fontSize:11.5, fontWeight:600, color:"#64748b", marginRight:2 }}>Kỳ báo cáo:</span>
                  {PERIOD_TABS.map(t => (
                    <button key={t.key} onClick={() => setReportPeriod(t.key)}
                      style={{ height:28, padding:"0 12px", borderRadius:7, border:`1.5px solid ${reportPeriod===t.key?"#1565c0":"#e2e8f0"}`, background:reportPeriod===t.key?"#1565c0":"#fff", color:reportPeriod===t.key?"#fff":"#475569", fontSize:11.5, fontWeight:700, cursor:"pointer", transition:"all .15s", fontFamily:"inherit" }}>
                      {t.label}
                    </button>
                  ))}
                  {reportPeriod === "custom" && (
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:6 }}>
                      <span style={{ fontSize:11, color:"#64748b" }}>Từ</span>
                      <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)}
                        style={{ height:28, padding:"0 8px", borderRadius:7, border:"1.5px solid #e2e8f0", fontSize:11.5, color:"#334155", fontFamily:"inherit", outline:"none", cursor:"pointer" }} />
                      <span style={{ fontSize:11, color:"#64748b" }}>đến</span>
                      <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)}
                        style={{ height:28, padding:"0 8px", borderRadius:7, border:"1.5px solid #e2e8f0", fontSize:11.5, color:"#334155", fontFamily:"inherit", outline:"none", cursor:"pointer" }} />
                    </div>
                  )}
                </div>
              </div>

              {/* printable body */}
              <div className="cap2-rpt-body">

                {/* header */}
                <div className="cap2-rpt-header">
                  <div>
                    <div className="cap2-rpt-title">BÁO CÁO CAPA — AN TOÀN & 6S</div>
                    <div className="cap2-rpt-sub">Tổng hợp trạng thái hành động khắc phục phòng ngừa · EHS Admin</div>
                  </div>
                  <div className="cap2-rpt-meta">
                    <div>Kỳ báo cáo: <b>{periodLabel}</b></div>
                    <div>Ngày xuất: <b>{reportDate}</b> lúc {reportTime}</div>
                    <div>Tổng CAPA: <b>{filteredActions.length}</b>{filteredActions.length < actions.length ? ` / ${actions.length} toàn bộ` : ""}</div>
                  </div>
                </div>

                {/* stat grid */}
                <div className="cap2-rpt-stats">
                  {[
                    { val: filteredActions.length, lbl:"Tổng CAPA",      c:"#1565c0", bg:"#eff6ff" },
                    { val: fPending,               lbl:"Chờ phê duyệt",  c:"#ea580c", bg:"#fff7ed" },
                    { val: fActive,                lbl:"Đang triển khai", c:"#2563eb", bg:"#eff6ff" },
                    { val: fDone,                  lbl:"Chờ nghiệm thu",  c:"#d97706", bg:"#fffbeb" },
                    { val: fClosed,                lbl:"Hoàn thành",      c:"#16a34a", bg:"#f0fdf4" },
                    { val: rejCount,               lbl:"Từ chối",          c:"#dc2626", bg:"#fef2f2" },
                    { val: totalOv,                lbl:"Quá hạn",          c:"#be123c", bg:"#fff1f2" },
                  ].map(s => (
                    <div key={s.lbl} className="cap2-rpt-stat" style={{ "--c":s.c, "--bg":s.bg } as React.CSSProperties}>
                      <div className="cap2-rpt-stat-val" style={{ color:s.c }}>{s.val}</div>
                      <div className="cap2-rpt-stat-lbl">{s.lbl}</div>
                    </div>
                  ))}
                </div>

                {/* dept table */}
                <div className="cap2-rpt-section-title">Tổng hợp theo bộ phận</div>
                <table className="cap2-rpt-table">
                  <thead>
                    <tr>
                      {["Bộ phận","Chờ duyệt","Đang triển khai","Chờ NT","Hoàn thành","Từ chối","Quá hạn","Tổng"].map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(deptSummary).sort((a,b) => {
                      const ta = a[1].pending+a[1].active+a[1].done+a[1].closed+a[1].rejected;
                      const tb = b[1].pending+b[1].active+b[1].done+b[1].closed+b[1].rejected;
                      return tb - ta;
                    }).map(([dept, s]) => (
                      <tr key={dept}>
                        <td><b>{dept}</b></td>
                        <td style={{ color: s.pending>0?"#ea580c":"#94a3b8", fontWeight:s.pending>0?700:400 }}>{s.pending}</td>
                        <td style={{ color: s.active>0?"#2563eb":"#94a3b8", fontWeight:s.active>0?700:400 }}>{s.active}</td>
                        <td style={{ color: s.done>0?"#d97706":"#94a3b8", fontWeight:s.done>0?700:400 }}>{s.done}</td>
                        <td style={{ color: s.closed>0?"#16a34a":"#94a3b8", fontWeight:s.closed>0?700:400 }}>{s.closed}</td>
                        <td style={{ color: s.rejected>0?"#dc2626":"#94a3b8", fontWeight:s.rejected>0?700:400 }}>{s.rejected}</td>
                        <td style={{ color: s.overdue>0?"#be123c":"#94a3b8", fontWeight:s.overdue>0?700:400 }}>{s.overdue}</td>
                        <td><b>{s.pending+s.active+s.done+s.closed+s.rejected}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* full CAPA list */}
                <div className="cap2-rpt-section-title">Danh sách chi tiết tất cả CAPA</div>
                <table className="cap2-rpt-table">
                  <thead>
                    <tr>
                      {["Mã","Tiêu đề","Bộ phận","Ưu tiên","Trạng thái","Người phụ trách","Hạn xử lý","Ghi chú"].map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedActions.map(a => {
                      const ov = isOverdue(a.dueDate) && a.status !== "closed" && a.status !== "rejected";
                      const pri = PRIORITY_META_V2[a.priority ?? "medium"] ?? PRIORITY_META_V2.medium;
                      return (
                        <tr key={a.id}>
                          <td style={{ whiteSpace:"nowrap", fontWeight:700, color:"#1565c0" }}>{a.code}</td>
                          <td style={{ maxWidth:260 }}>{a.title}</td>
                          <td style={{ whiteSpace:"nowrap" }}>{a.departmentCode || "EHS"}</td>
                          <td style={{ whiteSpace:"nowrap" }}>
                            <span style={{ fontSize:10, fontWeight:700, color:pri.color, background:pri.bg, border:`1px solid ${pri.border}`, borderRadius:5, padding:"1px 7px" }}>{pri.label}</span>
                          </td>
                          <td style={{ whiteSpace:"nowrap" }}>{statusLabel[a.status] ?? a.status}</td>
                          <td style={{ whiteSpace:"nowrap" }}>{a.ownerName || "—"}</td>
                          <td style={{ whiteSpace:"nowrap", color:ov?"#dc2626":"inherit", fontWeight:ov?700:400 }}>
                            {ov ? "⚠ " : ""}{formatDate(a.dueDate)}
                          </td>
                          <td style={{ fontSize:10.5, color:"#64748b" }}>{a.rejectionNote || ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* footer */}
                <div className="cap2-rpt-footer">
                  <span>Tài liệu nội bộ · MHChub Safety Module</span>
                  <span>Xuất ngày {reportDate} — {reportTime}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })(),
      document.body
    )}
    </>
  );
}

export default SafetyCapaApprovalPage;
