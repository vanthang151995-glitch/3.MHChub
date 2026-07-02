import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  XAxis, YAxis, CartesianGrid, Legend, FunnelChart, Funnel, LabelList,
} from "recharts";
import {
  AlertTriangle, CheckCircle2, Clock, ExternalLink, RefreshCw,
  ShieldCheck, XCircle, Inbox, BarChart3, ListChecks,
  CircleDot, TrendingUp, MessageSquare, Send, Trash2, Loader2,
  Search, Download, FileText, Activity, X, Eye,
  ClipboardCheck, Filter, ChevronUp, ChevronDown,
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

  /* ── ESC: close detail panel ─────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Don't interfere when user is typing in an input/textarea/contenteditable
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (detailAction) { setDetailAction(null); return; }
      if (rejectingId)  { setRejectingId(null); setRejectReason(""); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailAction, rejectingId]);

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

  /* export CSV */
  const handleExport = () => {
    window.open("/api/actions/export.csv", "_blank");
  };

  if (loading) return (
    <div className="cap-root">
      <div className="cap-state-center">
        <RefreshCw style={{ width:28, height:28, color:"#1565c0", animation:"spin 1s linear infinite" }} />
        <span>Đang tải dữ liệu CAPA…</span>
      </div>
    </div>
  );
  if (error) return (
    <div className="cap-root">
      <div className="cap-state-center">
        <AlertTriangle style={{ width:28, height:28, color:"#ef4444" }} />
        <span>Không tải được dữ liệu: {error}</span>
        <button className="cap-retry-btn" onClick={load}>Thử lại</button>
      </div>
    </div>
  );

  return (
    <div className="cap-root">

      {/* ── HEADER ───────────────────────────── */}
      <div className="cap-header">
        <div className="cap-header-left">
          <div className="cap-header-icon">
            <ShieldCheck style={{ width:22, height:22, color:"#fff" }} />
          </div>
          <div>
            <div className="cap-header-title">Phê duyệt CAPA</div>
            <div className="cap-header-sub">Xem xét · Phê duyệt · Từ chối · Nghiệm thu — EHS Admin</div>
            <a href="/safety-6s/intel" className="cap-back-intel-link">
              ← EHS Intelligence Dashboard
            </a>
          </div>
        </div>
        <div className="cap-header-right">
          <span className="cap-period-badge">{new Date().toLocaleDateString("vi-VN", { month:"long", year:"numeric" })}</span>
          <button className="cap-export-btn" onClick={handleExport} title="Xuất CSV">
            <Download style={{ width:13, height:13 }} /> Xuất CSV
          </button>
          <button className="cap-refresh-btn" onClick={load} title="Làm mới">
            <RefreshCw style={{ width:13, height:13 }} />
          </button>
        </div>
      </div>

      {/* ── REAL-TIME BANNER ─────────────────── */}
      {newDataBanner && (
        <div className={`cap-rt-banner${newDataBanner.pulse ? " pulse" : ""}`}>
          <span className="cap-rt-banner-msg">{newDataBanner.message}</span>
          <button className="cap-rt-banner-btn" onClick={load}>
            <RefreshCw style={{ width:12, height:12 }} /> Tải lại ngay
          </button>
          <button className="cap-rt-banner-close" onClick={() => setNewDataBanner(null)} title="Đóng">✕</button>
        </div>
      )}

      {/* ── KPI CARDS ────────────────────────── */}
      <div className="cap-kpi-row">
        <div className="cap-kpi-card" style={{ borderColor:"#fca5a5" }}>
          <div className="cap-kpi-icon" style={{ background:"#fef2f2" }}><Clock style={{ width:16, height:16, color:"#dc2626" }} /></div>
          <div className="cap-kpi-label">Chờ phê duyệt</div>
          <div className="cap-kpi-value" style={{ color:"#dc2626" }}>{pendingCount}</div>
          <div className="cap-kpi-sub">CAPA đang chờ xét duyệt</div>
        </div>
        <div className="cap-kpi-card" style={{ borderColor:"#93c5fd" }}>
          <div className="cap-kpi-icon" style={{ background:"#eff6ff" }}><TrendingUp style={{ width:16, height:16, color:"#1565c0" }} /></div>
          <div className="cap-kpi-label">Đang thực hiện</div>
          <div className="cap-kpi-value" style={{ color:"#1565c0" }}>{inProgressCount}</div>
          <div className="cap-kpi-sub">Đã duyệt, đang triển khai</div>
        </div>
        <div className="cap-kpi-card" style={{ borderColor:"#fde68a" }}>
          <div className="cap-kpi-icon" style={{ background:"#fffbeb" }}><ClipboardCheck style={{ width:16, height:16, color:"#d97706" }} /></div>
          <div className="cap-kpi-label">Chờ nghiệm thu</div>
          <div className="cap-kpi-value" style={{ color:"#d97706" }}>{doneCount}</div>
          <div className="cap-kpi-sub">Chờ EHS xác minh & đóng</div>
        </div>
        <div className="cap-kpi-card" style={{ borderColor:"#86efac" }}>
          <div className="cap-kpi-icon" style={{ background:"#f0fdf4" }}><CheckCircle2 style={{ width:16, height:16, color:"#16a34a" }} /></div>
          <div className="cap-kpi-label">Hoàn thành</div>
          <div className="cap-kpi-value" style={{ color:"#16a34a" }}>{closedCount}</div>
          <div className="cap-kpi-sub">Đã nghiệm thu & đóng</div>
        </div>
      </div>

      {/* ── TABS ─────────────────────────────── */}
      <div className="cap-tabs-bar">
        <button className={`cap-tab-btn${tab === "pending" ? " active" : ""}`} onClick={() => setTab("pending")}>
          <ListChecks style={{ width:14, height:14 }} /> Chờ duyệt
          {pendingCount > 0 && <span className="cap-tab-badge">{pendingCount}</span>}
        </button>
        <button className={`cap-tab-btn${tab === "processed" ? " active" : ""}`} onClick={() => setTab("processed")}>
          <CheckCircle2 style={{ width:14, height:14 }} /> Đã xử lý
          {doneCount > 0 && <span className="cap-tab-badge" style={{ background:"#d97706" }}>{doneCount}</span>}
        </button>
        <button className={`cap-tab-btn${tab === "charts" ? " active" : ""}`} onClick={() => setTab("charts")}>
          <BarChart3 style={{ width:14, height:14 }} /> Biểu đồ
        </button>
      </div>

      {/* ── TAB BODY ─────────────────────────── */}
      <div className="cap-body">

        {/* ── TAB: PENDING ──────────────────── */}
        {tab === "pending" && (
          <>
            {/* Search & sort toolbar */}
            <div className="cap-pending-toolbar">
              <div className="cap-search-wrap">
                <Search style={{ width:14, height:14, color:"#94a3b8", flexShrink:0 }} />
                <input className="cap-search-input" placeholder="Tìm theo tiêu đề, mã, người phụ trách, bộ phận…"
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                {searchQuery && <button className="cap-search-clear" onClick={() => setSearchQuery("")}><X style={{ width:12, height:12 }} /></button>}
              </div>
              <button className={`cap-sort-btn${sortPriority ? " active" : ""}`} onClick={() => setSortPriority((p) => !p)} title="Ưu tiên cao lên đầu">
                {sortPriority ? <ChevronUp style={{ width:13, height:13 }} /> : <ChevronDown style={{ width:13, height:13 }} />}
                Ưu tiên cao nhất
              </button>
            </div>

            {pending.length === 0
              ? <EmptyState icon={<Inbox style={{ width:28, height:28, color:"#94a3b8" }} />}
                  title={searchQuery ? "Không tìm thấy CAPA phù hợp" : "Không có CAPA nào chờ duyệt"}
                  sub={searchQuery ? "Thử từ khoá khác" : "Tất cả CAPA đã được xử lý."} />
              : (
                <div className="cap-pending-list">
                  {pending.map((action) => (
                    <div key={action.id} className="cap-card">
                      <div className="cap-card-header">
                        <div className="cap-card-main">
                          <div className="cap-card-code-row">
                            <span className="cap-code">{action.code}</span>
                            <span className={`cap-priority-badge ${priClass(action.priority || "medium")}`}>{priLabel(action.priority || "medium")}</span>
                            <span className="cap-source-badge">{srcLabel(action.sourceType || "manual")}</span>
                            {action.problemType && <ProblemTypeBadge code={action.problemType} />}
                            {isOverdue(action.dueDate) && (
                              <span style={{ fontSize:10, fontWeight:700, color:"#dc2626", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:6, padding:"2px 8px" }}>⚠️ Quá hạn</span>
                            )}
                          </div>
                          <div className="cap-card-title">{action.title}</div>
                          {action.description && (
                            <div style={{ fontSize:12, color:"#64748b", marginTop:3, lineHeight:1.5, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
                              {action.description}
                            </div>
                          )}
                          <div className="cap-card-meta" style={{ marginTop:5 }}>
                            <span className="cap-card-meta-item"><CircleDot style={{ width:12, height:12 }} />{action.departmentCode || "EHS"}</span>
                            {action.ownerName && <span className="cap-card-meta-item"><ShieldCheck style={{ width:12, height:12 }} />{action.ownerName}</span>}
                            {action.dueDate && (
                              <span className="cap-card-meta-item" style={{ color:isOverdue(action.dueDate) ? "#dc2626" : "#64748b" }}>
                                <Clock style={{ width:12, height:12 }} /> Hạn: {formatDate(action.dueDate)}
                              </span>
                            )}
                            {action.createdByName && <span className="cap-card-meta-item">Tạo bởi: {action.createdByName}</span>}
                          </div>
                        </div>
                        <div className="cap-card-actions">
                          <button className="cap-btn-view" onClick={() => setDetailAction(action)} title="Xem chi tiết đầy đủ">
                            <Eye style={{ width:13, height:13 }} /> Chi tiết
                          </button>
                          <button className={`cap-btn-comment${openCommentId === action.id ? " active" : ""}`}
                            onClick={() => setOpenCommentId((p) => p === action.id ? null : action.id)} title="Bình luận nội bộ">
                            <MessageSquare style={{ width:13, height:13 }} /> Bình luận
                            {(action.commentCount ?? 0) > 0 && (
                              <span className="cap-comment-count-badge">{action.commentCount}</span>
                            )}
                          </button>
                          <button className="cap-btn-reject" disabled={submitting === action.id}
                            onClick={() => rejectingId === action.id ? (setRejectingId(null), setRejectReason("")) : (setRejectingId(action.id), setRejectReason(""))}>
                            <XCircle style={{ width:13, height:13 }} /> Từ chối
                          </button>
                          <button className="cap-btn-approve" disabled={submitting === action.id} onClick={() => handleApprove(action.id)}>
                            {submitting === action.id
                              ? <RefreshCw style={{ width:13, height:13, animation:"spin 1s linear infinite" }} />
                              : <CheckCircle2 style={{ width:13, height:13 }} />}
                            Phê duyệt
                          </button>
                        </div>
                      </div>

                      {/* Inline reject flow */}
                      {rejectingId === action.id && (
                        <div className="cap-reject-row">
                          <div style={{ flex:1 }}>
                            <div className="cap-reject-presets">
                              {REJECT_PRESETS.map((p) => (
                                <button key={p} className={`cap-preset-chip${rejectReason === p ? " active" : ""}`}
                                  onClick={() => setRejectReason(rejectReason === p ? "" : p)}>{p}</button>
                              ))}
                            </div>
                            <div style={{ display:"flex", gap:8, marginTop:8 }}>
                              <input className="cap-reject-input" style={{ flex:1 }}
                                placeholder="Hoặc nhập lý do tùy ý…"
                                value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleReject(action.id, rejectReason)} autoFocus />
                              <button className="cap-reject-confirm" disabled={submitting === action.id}
                                onClick={() => handleReject(action.id, rejectReason)}>
                                {submitting === action.id ? "Đang xử lý…" : "Xác nhận từ chối"}
                              </button>
                              <button className="cap-reject-cancel" onClick={() => { setRejectingId(null); setRejectReason(""); }}>Huỷ</button>
                            </div>
                          </div>
                        </div>
                      )}

                      {openCommentId === action.id && (
                        <CommentPanel
                          actionId={action.id}
                          onClose={() => setOpenCommentId(null)}
                          onCountChange={(count) =>
                            setActions((prev) => prev.map((a) => a.id === action.id ? { ...a, commentCount: count } : a))
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              )
            }
          </>
        )}

        {/* ── TAB: PROCESSED ────────────────── */}
        {tab === "processed" && (
          <>
            <div className="cap-processed-filters">
              {([
                ["all",           "Tất cả"],
                ["open",          "✅ Đã duyệt"],
                ["in_progress",   "🔄 Đang làm"],
                ["done_by_owner", "📬 Chờ nghiệm thu"],
                ["closed",        "🏁 Hoàn thành"],
                ["rejected",      "❌ Từ chối"],
              ] as [ProcessedFilter, string][]).map(([f, label]) => {
                const cnt = pfCount(f);
                return (
                  <button key={f} className={`cap-filter-btn${processedFilter === f ? " active" : ""}`}
                    onClick={() => setProcessedFilter(f)}>
                    {label}
                    {cnt > 0 && <span className="cap-filter-count">{cnt}</span>}
                  </button>
                );
              })}
            </div>

            {/* Processed search bar */}
            <div className="cap-pending-toolbar" style={{ marginBottom:10 }}>
              <div className="cap-search-wrap">
                <Search style={{ width:14, height:14, color:"#94a3b8", flexShrink:0 }} />
                <input className="cap-search-input" placeholder="Tìm theo tiêu đề, mã, người phụ trách, bộ phận…"
                  value={processedSearch} onChange={(e) => setProcessedSearch(e.target.value)} />
                {processedSearch && <button className="cap-search-clear" onClick={() => setProcessedSearch("")}><X style={{ width:12, height:12 }} /></button>}
              </div>
            </div>

            {processed.length === 0
              ? <EmptyState icon={<CheckCircle2 style={{ width:28, height:28, color:"#94a3b8" }} />} title="Chưa có CAPA nào trong nhóm này" />
              : (
                <div className="cap-table-wrap">
                  <table className="cap-table">
                    <thead>
                      <tr>
                        <th>Mã CAPA</th>
                        <th>Tiêu đề</th>
                        <th>Loại vấn đề</th>
                        <th>Bộ phận</th>
                        <th>Người phụ trách</th>
                        <th>Ưu tiên</th>
                        <th>Hạn xử lý</th>
                        <th>Trạng thái</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {processed.map((action) => (
                        <tr key={action.id} className="cap-table-row-clickable" onClick={() => setDetailAction(action)}>
                          <td><span style={{ fontSize:11, fontWeight:700, color:"#1565c0", background:"#eff6ff", borderRadius:6, padding:"2px 8px" }}>{action.code}</span></td>
                          <td style={{ maxWidth:240 }}>
                            <span style={{ fontWeight:600, color:"#0f172a", display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={action.title}>{action.title}</span>
                            {action.rejectionNote && <span style={{ fontSize:11, color:"#dc2626", display:"block", marginTop:2 }}>↩ {action.rejectionNote}</span>}
                          </td>
                          <td><ProblemTypeBadge code={action.problemType} /></td>
                          <td>{action.departmentCode || "EHS"}</td>
                          <td>{action.ownerName || "—"}</td>
                          <td><span className={`cap-priority-badge ${priClass(action.priority || "medium")}`} style={{ fontSize:10 }}>{priLabel(action.priority || "medium")}</span></td>
                          <td style={{ color:isOverdue(action.dueDate) && action.status !== "closed" ? "#dc2626" : undefined, fontWeight:isOverdue(action.dueDate) && action.status !== "closed" ? 600 : undefined }}>
                            {formatDate(action.dueDate)}
                          </td>
                          <td><StatusPill status={action.status} /></td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                              <button className="cap-btn-view" style={{ padding:"5px 8px", fontSize:11 }} onClick={() => setDetailAction(action)}>
                                <Eye style={{ width:11, height:11 }} /> Chi tiết
                              </button>
                              {action.status === "done_by_owner" && (
                                <button className="cap-btn-verify-close" style={{ padding:"5px 10px", fontSize:11 }}
                                  disabled={submitting === action.id} onClick={() => setDetailAction(action)}>
                                  <ClipboardCheck style={{ width:11, height:11 }} /> Nghiệm thu
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
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
  );
}

export default SafetyCapaApprovalPage;
