// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ActionDetailModal.css";

/* ── Types ────────────────────────────────────────────────────────── */
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
  sourceType?: string;
  sourceCode?: string;
  departmentCode: string;
  locationId?: string;
  priority: string;
  status: string;
  ownerName?: string;
  dueDate?: string;
  evidenceNotes?: string;
  evidenceFiles?: EvidenceFile[];
  verificationNote?: string;
  createdByName?: string;
  createdBy?: string;
  createdAt?: string;
  updatedByName?: string;
  updatedBy?: string;
  updatedAt?: string;
};

type Department = { id: string; name: string };
type Location   = { id: string; code: string; name: string };

type LogEntry = {
  id?: string;
  action: string;
  actor?: string;
  actorName?: string;
  note?: string;
  createdAt?: string;
  timestamp?: string;
};

type Props = {
  actions: SafetyAction[];
  initialId: string;
  departments?: Department[];
  locations?: Location[];
  isEhsAdmin?: boolean;
  onClose: () => void;
};

/* ── Constants ────────────────────────────────────────────────────── */
const STATUS_LABEL: Record<string, string> = {
  open:          "Đang mở",
  assigned:      "Đã giao",
  in_progress:   "Đang xử lý",
  blocked:       "Đang vướng",
  done_by_owner: "Chờ EHS xác minh",
  reopened:      "Mở lại",
  closed:        "Đã đóng",
  verified:      "Đã xác minh",
};

const STATUS_COLOR: Record<string, { color: string; bg: string; border: string }> = {
  open:          { color:"#2563eb", bg:"#eff6ff",  border:"#bfdbfe" },
  assigned:      { color:"#7c3aed", bg:"#f5f3ff",  border:"#ddd6fe" },
  in_progress:   { color:"#d97706", bg:"#fffbeb",  border:"#fde68a" },
  blocked:       { color:"#dc2626", bg:"#fef2f2",  border:"#fecaca" },
  done_by_owner: { color:"#0891b2", bg:"#ecfeff",  border:"#a5f3fc" },
  reopened:      { color:"#be123c", bg:"#fff1f2",  border:"#fda4af" },
  closed:        { color:"#15803d", bg:"#f0fdf4",  border:"#a7f3d0" },
  verified:      { color:"#15803d", bg:"#f0fdf4",  border:"#a7f3d0" },
};

const PRIORITY_LABEL: Record<string, string> = {
  critical: "🔴 Khẩn cấp",
  high:     "🟠 Cao",
  medium:   "🟡 Trung bình",
  low:      "🟢 Thấp",
};

const PRIORITY_COLOR: Record<string, { color: string; bg: string; border: string }> = {
  critical: { color:"#dc2626", bg:"#fef2f2",  border:"#fecaca" },
  high:     { color:"#d97706", bg:"#fffbeb",  border:"#fde68a" },
  medium:   { color:"#ca8a04", bg:"#fefce8",  border:"#fef08a" },
  low:      { color:"#16a34a", bg:"#f0fdf4",  border:"#a7f3d0" },
};

const LOG_ICON: Record<string, string> = {
  created:            "✏️",
  published:          "📢",
  unpublished:        "🔕",
  edited:             "✏️",
  status_change:      "🔄",
  evidence_submitted: "📤",
  evidence_uploaded:  "📎",
  verified:           "✅",
  reopened:           "🔁",
  closed:             "🔒",
};

const TIMELINE_STEPS = [
  { label: "Tạo CAPA",        icon: "📝", doneStatus: ["open","assigned","in_progress","blocked","done_by_owner","reopened","closed","verified"] },
  { label: "Đang xử lý",      icon: "🔧", doneStatus: ["in_progress","blocked","done_by_owner","closed","verified"] },
  { label: "Nộp bằng chứng",  icon: "📤", doneStatus: ["done_by_owner","closed","verified"] },
  { label: "EHS xác minh",    icon: "🔍", doneStatus: ["closed","verified"] },
  { label: "Đã đóng",         icon: "✅", doneStatus: ["closed","verified"] },
];

/* ── Helpers ──────────────────────────────────────────────────────── */
function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif|bmp)(\?|$)/i.test(url);
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

function isOverdue(action: SafetyAction): boolean {
  if (!action.dueDate || action.status === "closed" || action.status === "verified") return false;
  return action.dueDate < new Date().toISOString().slice(0, 10);
}

function timelineStepState(status: string, stepIdx: number): "done" | "active" | "pending" {
  const step = TIMELINE_STEPS[stepIdx];
  if (step.doneStatus.includes(status)) {
    const nextStep = TIMELINE_STEPS[stepIdx + 1];
    if (!nextStep || !nextStep.doneStatus.includes(status)) return "active";
    return "done";
  }
  return "pending";
}

/* ── Component ────────────────────────────────────────────────────── */
export function ActionDetailModal({ actions, initialId, departments = [], locations = [], isEhsAdmin = false, onClose }: Props) {
  const [idx, setIdx]             = useState(() => Math.max(0, actions.findIndex(a => a.id === initialId)));
  const [tab, setTab]             = useState<"content" | "evidence" | "history">("content");
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState("");

  /* evidence upload */
  const [evNotes, setEvNotes]     = useState("");
  const [evFiles, setEvFiles]     = useState<File[]>([]);
  const [evSubmitting, setEvSubmitting] = useState(false);
  const [evSuccess, setEvSuccess] = useState(false);
  const [evError, setEvError]     = useState("");
  const fileInputRef              = useRef<HTMLInputElement>(null);

  /* Lock body scroll while modal is open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* verify */
  const [verifyNote, setVerifyNote]   = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);

  /* status change (e.g. open → in_progress) */
  const [statusChanging, setStatusChanging] = useState(false);
  const [statusMsg, setStatusMsg]           = useState("");

  /* source data (warning / incident) */
  const [sourceData, setSourceData]         = useState<any>(null);
  const [sourceLoading, setSourceLoading]   = useState(false);

  const action = actions[idx];

  /* Load logs on history tab */
  useEffect(() => {
    if (tab !== "history" || !action) return;
    setLogsLoading(true);
    fetch(`/api/actions/${action.id}/logs`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => setLogs(Array.isArray(data) ? data : []))
      .catch(() => setLogs([]))
      .finally(() => setLogsLoading(false));
  }, [tab, action?.id]);

  /* Reset state on action change */
  useEffect(() => {
    setTab("content");
    setEvNotes("");
    setEvFiles([]);
    setEvSuccess(false);
    setEvError("");
    setVerifyNote("");
    setVerifyError("");
    setSourceData(null);
  }, [idx]);

  /* Load source warning / incident data */
  useEffect(() => {
    if (!action) return;
    const { sourceType, sourceId } = action as any;
    if (!sourceId || !["warning", "incident"].includes(sourceType)) return;
    setSourceLoading(true);
    const endpoint = sourceType === "warning" ? `/api/warnings/${sourceId}` : `/api/incidents/${sourceId}`;
    fetch(endpoint, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => setSourceData(data))
      .catch(() => setSourceData(null))
      .finally(() => setSourceLoading(false));
  }, [action?.id]);

  /* Keyboard: Esc to close, arrow keys to navigate */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && idx > 0) setIdx(i => i - 1);
      if (e.key === "ArrowRight" && idx < actions.length - 1) setIdx(i => i + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, actions.length, onClose]);

  if (!action) return null;

  /* ── Derived ── */
  const statusMeta   = STATUS_COLOR[action.status]   || STATUS_COLOR.open;
  const priorityMeta = PRIORITY_COLOR[action.priority] || PRIORITY_COLOR.medium;
  const deptName     = departments.find(d => d.id === action.departmentCode)?.name || action.departmentCode;
  const locationName = locations.find(l => l.id === action.locationId || l.code === action.locationId)?.name || action.locationId;
  const overdue      = isOverdue(action);
  const isClosed     = action.status === "closed" || action.status === "verified";

  /* ── Submit evidence ── */
  async function submitEvidence() {
    if (!evNotes.trim() && evFiles.length === 0) return;
    setEvSubmitting(true);
    setEvError("");
    setEvSuccess(false);
    try {
      if (evFiles.length > 0) {
        const fd = new FormData();
        evFiles.forEach(f => fd.append("files", f));
        const r = await fetch(`/api/actions/${action.id}/upload-evidence`, {
          method: "POST", credentials: "include", body: fd,
        });
        if (!r.ok) throw new Error("Upload thất bại");
      }
      const r = await fetch(`/api/actions/${action.id}/submit-evidence`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: evNotes }),
      });
      if (!r.ok) throw new Error("Gửi bằng chứng thất bại");
      setEvSuccess(true);
      setEvNotes("");
      setEvFiles([]);
    } catch (err: any) {
      setEvError(err.message || "Có lỗi xảy ra");
    } finally {
      setEvSubmitting(false);
    }
  }

  /* ── Change status ── */
  async function callStatusChange(newStatus: string) {
    setStatusChanging(true);
    setStatusMsg("");
    try {
      const r = await fetch(`/api/actions/${action.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!r.ok) throw new Error("Cập nhật thất bại");
      setStatusMsg("✅ Đã cập nhật trạng thái!");
    } catch (err: any) {
      setStatusMsg("❌ " + (err.message || "Có lỗi xảy ra"));
    } finally {
      setStatusChanging(false);
    }
  }

  /* ── Verify CAPA ── */
  async function callVerify(approve: boolean) {
    setVerifyLoading(true);
    setVerifyError("");
    try {
      const r = await fetch(`/api/actions/${action.id}/verify`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve, note: verifyNote }),
      });
      if (!r.ok) throw new Error("Xác nhận thất bại");
      onClose();
    } catch (err: any) {
      setVerifyError(err.message || "Có lỗi xảy ra");
    } finally {
      setVerifyLoading(false);
    }
  }

  const evFileCount = Array.isArray(action.evidenceFiles) ? action.evidenceFiles.length : 0;

  /* ── Render ── */
  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="adm-overlay"
        onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="adm-modal">

          {/* ── Header ─────────────────────────────────────────── */}
          <div className="adm-header">
            <div className="adm-header-left">
              <div className="adm-header-meta">
                <span className="adm-code">{action.code}</span>
                <span className="adm-badge" style={{ color: statusMeta.color, background: statusMeta.bg, borderColor: statusMeta.border }}>
                  {STATUS_LABEL[action.status] || action.status}
                </span>
                <span className="adm-badge" style={{ color: priorityMeta.color, background: priorityMeta.bg, borderColor: priorityMeta.border }}>
                  {PRIORITY_LABEL[action.priority] || action.priority}
                </span>
                {overdue && (
                  <span className="adm-badge" style={{ color:"#dc2626", background:"#fef2f2", borderColor:"#fecaca" }}>
                    ⚠ Quá hạn
                  </span>
                )}
              </div>
              <h2 className="adm-title">{action.title}</h2>
            </div>
            <div className="adm-header-actions">
              <button className="adm-nav-btn" disabled={idx === 0} onClick={() => setIdx(i => i - 1)} title="Mục trước (←)">
                ‹
              </button>
              <span className="adm-nav-counter">{idx + 1}/{actions.length}</span>
              <button className="adm-nav-btn" disabled={idx === actions.length - 1} onClick={() => setIdx(i => i + 1)} title="Mục tiếp (→)">
                ›
              </button>
              <button className="adm-close-btn" onClick={onClose} title="Đóng (Esc)">✕</button>
            </div>
          </div>

          {/* ── Tabs ───────────────────────────────────────────── */}
          <div className="adm-tabs">
            <button className={`adm-tab${tab === "content" ? " adm-tab--active" : ""}`} onClick={() => setTab("content")}>
              📄 Nội dung
            </button>
            <button className={`adm-tab${tab === "evidence" ? " adm-tab--active" : ""}`} onClick={() => setTab("evidence")}>
              📎 Bằng chứng {evFileCount > 0 && `(${evFileCount})`}
            </button>
            <button className={`adm-tab${tab === "history" ? " adm-tab--active" : ""}`} onClick={() => setTab("history")}>
              🕐 Lịch sử
            </button>
          </div>

          {/* ── Body ───────────────────────────────────────────── */}
          <div className="adm-body">

            {/* ── CONTENT TAB ─────────────────────────────────── */}
            {tab === "content" && (
              <div className="adm-content-layout">

                {/* Main area */}
                <div className="adm-main">
                  {action.description ? (
                    <div className="adm-section">
                      <p className="adm-section-title">📋 Mô tả chi tiết</p>
                      <p className="adm-section-body">{action.description}</p>
                    </div>
                  ) : (
                    <div className="adm-section">
                      <p className="adm-section-title">📋 Mô tả</p>
                      <p className="adm-section-body" style={{ color:"#94a3b8", fontStyle:"italic" }}>
                        Chưa có mô tả chi tiết cho mục này.
                      </p>
                    </div>
                  )}

                  {/* Source warning / incident detail */}
                  {(action as any).sourceType && (action as any).sourceType !== "manual" && (
                    <div className="adm-section" style={{ background:"#faf5ff", borderColor:"#d8b4fe", padding:"14px 16px" }}>
                      <p className="adm-section-title" style={{ color:"#7c3aed", marginBottom:10 }}>
                        {(action as any).sourceType === "warning" ? "⚡ Cảnh báo gốc" : (action as any).sourceType === "incident" ? "🚨 Sự cố gốc" : "📋 Nguồn gốc"}
                        {(action as any).sourceCode && (
                          <span style={{ marginLeft:8, fontSize:"0.78rem", fontWeight:400, color:"#9333ea", background:"#f3e8ff", padding:"2px 8px", borderRadius:10 }}>
                            {(action as any).sourceCode}
                          </span>
                        )}
                      </p>
                      {sourceLoading && (
                        <p style={{ color:"#9333ea", fontSize:"0.85rem", margin:0 }}>Đang tải...</p>
                      )}
                      {!sourceLoading && sourceData && (() => {
                        const isWarning = (action as any).sourceType === "warning";
                        const RISK_LABEL: Record<string,string> = { LOW:"🟢 Thấp", MEDIUM:"🟡 Trung bình", HIGH:"🟠 Cao", CRITICAL:"🔴 Nghiêm trọng" };
                        const rows: { label: string; value: string | undefined }[] = isWarning ? [
                          { label: "Tiêu đề", value: sourceData.title },
                          { label: "Mô tả hiện trạng", value: sourceData.description },
                          { label: "Khu vực", value: sourceData.area },
                          { label: "Phân loại", value: sourceData.category },
                          { label: "Mức rủi ro", value: RISK_LABEL[sourceData.riskLevel] || sourceData.riskLevel },
                          { label: "Biện pháp hiện tại", value: sourceData.currentControl },
                          { label: "Người phát hiện", value: sourceData.reporterName },
                        ] : [
                          { label: "Tiêu đề", value: sourceData.title },
                          { label: "Mô tả sự cố", value: sourceData.description },
                          { label: "Khu vực", value: sourceData.area },
                          { label: "Loại sự cố", value: sourceData.incidentType },
                          { label: "Mức độ", value: sourceData.severity },
                          { label: "Nguyên nhân gốc", value: sourceData.rootCause },
                          { label: "Người báo cáo", value: sourceData.reporterName },
                        ];
                        return (
                          <div style={{ display:"grid", gap:6 }}>
                            {rows.filter(r => r.value).map((r, i) => (
                              <div key={i} style={{ display:"grid", gridTemplateColumns:"120px 1fr", gap:8, fontSize:"0.85rem", lineHeight:1.5 }}>
                                <span style={{ color:"#7c3aed", fontWeight:600, whiteSpace:"nowrap" }}>{r.label}</span>
                                <span style={{ color:"#3b0764" }}>{r.value}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      {!sourceLoading && !sourceData && (
                        <p style={{ color:"#9ca3af", fontSize:"0.82rem", margin:0, fontStyle:"italic" }}>Không tải được thông tin nguồn.</p>
                      )}
                    </div>
                  )}

                  {action.evidenceNotes && (
                    <div className="adm-section" style={{ background:"#f0fdf4", borderColor:"#a7f3d0" }}>
                      <p className="adm-section-title" style={{ color:"#065f46" }}>✅ Ghi chú bằng chứng đã gửi</p>
                      <p className="adm-section-body" style={{ color:"#166534" }}>{action.evidenceNotes}</p>
                    </div>
                  )}

                  {action.verificationNote && (
                    <div className="adm-section" style={{ background:"#eff6ff", borderColor:"#bfdbfe" }}>
                      <p className="adm-section-title" style={{ color:"#1e40af" }}>🔍 Ghi chú xác minh EHS</p>
                      <p className="adm-section-body" style={{ color:"#1e3a8a" }}>{action.verificationNote}</p>
                    </div>
                  )}
                </div>

                {/* Sidebar */}
                <div className="adm-sidebar">

                  {/* Meta card */}
                  <div className="adm-card">
                    {[
                      { icon:"👤", label:"Người phụ trách", value: action.ownerName || "Chưa giao" },
                      { icon:"🏢", label:"Bộ phận",          value: deptName },
                      ...(locationName ? [{ icon:"📍", label:"Khu vực", value: locationName }] : []),
                      { icon:"📅", label:"Hạn xử lý",        value: action.dueDate || "—", overdue },
                      ...(action.sourceType && action.sourceType !== "manual"
                        ? [{ icon:"🔗", label:"Nguồn phát sinh", value: action.sourceCode || action.sourceType }]
                        : []),
                    ].map((row, i, arr) => (
                      <div className="adm-card-row" key={i} style={{ borderBottom: i < arr.length-1 ? undefined : "none" }}>
                        <span className="adm-card-row-icon">{row.icon}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div className="adm-card-row-label">{row.label}</div>
                          <div className={`adm-card-row-value${(row as any).overdue ? " adm-card-row-value--overdue" : ""}`}>
                            {row.value}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Audit trail card */}
                  {(action.createdByName || action.createdBy || action.updatedByName || action.updatedBy) && (
                    <div className="adm-card">
                      <div className="adm-card-header">📋 Lịch sử tạo / cập nhật</div>
                      {(action.createdByName || action.createdBy) && (
                        <div className="adm-card-row" style={{ borderBottom: (action.updatedByName || action.updatedBy) ? undefined : "none" }}>
                          <span className="adm-card-row-icon">✏️</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div className="adm-card-row-label">Người tạo</div>
                            <div className="adm-card-row-value">{action.createdByName || action.createdBy}</div>
                            {action.createdAt && (
                              <div className="adm-card-row-sub">{fmtDate(action.createdAt)}</div>
                            )}
                          </div>
                        </div>
                      )}
                      {(action.updatedByName || action.updatedBy) && (
                        <div className="adm-card-row" style={{ borderBottom:"none" }}>
                          <span className="adm-card-row-icon">🔄</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div className="adm-card-row-label">Cập nhật lần cuối</div>
                            <div className="adm-card-row-value">{action.updatedByName || action.updatedBy}</div>
                            {action.updatedAt && (
                              <div className="adm-card-row-sub">{fmtDate(action.updatedAt)}</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Timeline card */}
                  <div className="adm-card">
                    <div className="adm-timeline">
                      <div className="adm-timeline-title">📊 Tiến trình xử lý</div>
                      {TIMELINE_STEPS.map((step, i) => {
                        const state = timelineStepState(action.status, i);
                        return (
                          <div className="adm-timeline-step" key={i}>
                            <div className="adm-timeline-track">
                              <div className={`adm-timeline-dot adm-timeline-dot--${state}`}>
                                {state === "done" ? "✓" : state === "active" ? "●" : "○"}
                              </div>
                              {i < TIMELINE_STEPS.length - 1 && (
                                <div className={`adm-timeline-line adm-timeline-line--${state === "done" ? "done" : "pending"}`} />
                              )}
                            </div>
                            <div className={`adm-timeline-label adm-timeline-label--${state}`}>
                              <div className="adm-timeline-label-text">
                                {step.icon} {step.label}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* ── EVIDENCE TAB ────────────────────────────────── */}
            {tab === "evidence" && (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

                {/* Existing evidence notes */}
                {action.evidenceNotes && (
                  <div className="adm-section" style={{ background:"#f0fdf4", borderColor:"#a7f3d0" }}>
                    <p className="adm-section-title" style={{ color:"#065f46" }}>📋 Ghi chú bằng chứng đã gửi</p>
                    <p className="adm-section-body" style={{ color:"#166534" }}>{action.evidenceNotes}</p>
                  </div>
                )}

                {/* Existing files */}
                {evFileCount > 0 && (
                  <div className="adm-section">
                    <p className="adm-section-title">📎 File đính kèm ({evFileCount})</p>
                    <div className="adm-evidence-grid">
                      {(action.evidenceFiles as EvidenceFile[]).map((f, i) =>
                        isImageUrl(f.url)
                          ? (
                            <button key={i} className="adm-evidence-img-btn" onClick={() => setLightboxUrl(f.url)}>
                              <img src={f.url} alt={f.originalName || f.fileName} className="adm-evidence-img" />
                              <div className="adm-evidence-file-name">{f.originalName || f.fileName}</div>
                            </button>
                          ) : (
                            <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="adm-evidence-doc-link">
                              <span className="adm-evidence-doc-icon">📄</span>
                              <span className="adm-evidence-doc-label">{f.originalName || f.fileName}</span>
                            </a>
                          )
                      )}
                    </div>
                  </div>
                )}

                {evFileCount === 0 && !action.evidenceNotes && (
                  <div className="adm-empty">Chưa có bằng chứng nào được nộp.</div>
                )}

                {/* Upload / submit form */}
                {!isClosed && (
                  <div className="adm-upload-form">
                    <p className="adm-upload-form-title">📤 Gửi bằng chứng hoàn thành</p>

                    {evSuccess && (
                      <div className="adm-alert adm-alert--success">
                        ✅ Đã gửi bằng chứng thành công! Trạng thái cập nhật sang "Chờ EHS xác minh".
                      </div>
                    )}

                    <label className="adm-label">
                      <span className="adm-label-text">Ghi chú bằng chứng</span>
                      <textarea
                        className="adm-textarea"
                        rows={3}
                        value={evNotes}
                        onChange={e => setEvNotes(e.target.value)}
                        placeholder="Mô tả ngắn những việc đã thực hiện, kết quả đạt được..."
                      />
                    </label>

                    <label className="adm-label">
                      <span className="adm-label-text">Đính kèm ảnh / PDF (tối đa 5 file, mỗi file &lt; 10MB)</span>
                      <div className="adm-drop-zone" onClick={() => fileInputRef.current?.click()}>
                        <div className="adm-drop-icon">📁</div>
                        <div className="adm-drop-label">
                          {evFiles.length ? `${evFiles.length} file đã chọn` : "Bấm để chọn file"}
                        </div>
                        <div className="adm-drop-hint">Ảnh (JPG, PNG) hoặc tài liệu PDF</div>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file" multiple
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        style={{ display:"none" }}
                        onChange={e => setEvFiles(Array.from(e.target.files || []).slice(0, 5))}
                      />
                    </label>

                    {evFiles.length > 0 && (
                      <div className="adm-file-pills">
                        {evFiles.map((f, i) => (
                          <div key={i} className="adm-file-pill">
                            <span>{f.type.startsWith("image/") ? "🖼️" : "📄"}</span>
                            <span className="adm-file-pill-name">
                              {f.name.length > 24 ? f.name.slice(0, 21) + "…" : f.name}
                            </span>
                            <button className="adm-file-pill-remove" onClick={() => setEvFiles(p => p.filter((_, j) => j !== i))}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {evError && <div className="adm-alert adm-alert--error">{evError}</div>}

                    <button
                      className="adm-btn adm-btn--primary"
                      disabled={evSubmitting || (!evNotes.trim() && evFiles.length === 0)}
                      onClick={submitEvidence}
                    >
                      {evSubmitting ? "Đang gửi…" : "Gửi bằng chứng"}
                    </button>
                  </div>
                )}

                {/* EHS verify panel */}
                {isEhsAdmin && action.status === "done_by_owner" && (
                  <div className="adm-verify-panel">
                    <div className="adm-verify-header">
                      <span style={{ fontSize:18 }}>🔍</span>
                      <div>
                        <div className="adm-verify-title">EHS xác nhận hoàn thành CAPA</div>
                        <div className="adm-verify-subtitle">Bộ phận đã nộp bằng chứng — xem xét và xác nhận đóng hoặc yêu cầu bổ sung</div>
                      </div>
                    </div>
                    <label className="adm-label">
                      <span className="adm-label-text" style={{ color:"#1e40af" }}>Ghi chú xác nhận (tuỳ chọn)</span>
                      <textarea
                        className="adm-textarea"
                        rows={2}
                        value={verifyNote}
                        onChange={e => setVerifyNote(e.target.value)}
                        placeholder="Đánh giá kết quả khắc phục, điều kiện đóng CAPA..."
                        style={{ borderColor:"#93c5fd" }}
                      />
                    </label>
                    {verifyError && <div className="adm-alert adm-alert--error">{verifyError}</div>}
                    <div className="adm-verify-actions">
                      <button
                        className="adm-btn adm-btn--verify"
                        disabled={verifyLoading}
                        onClick={() => callVerify(true)}
                      >
                        {verifyLoading ? "Đang xử lý…" : "✅ Đồng ý đóng CAPA"}
                      </button>
                      <button
                        className="adm-btn adm-btn--danger"
                        disabled={verifyLoading}
                        onClick={() => callVerify(false)}
                      >
                        🔁 Yêu cầu bổ sung
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── HISTORY TAB ─────────────────────────────────── */}
            {tab === "history" && (
              <div>
                {logsLoading && <div className="adm-loading">Đang tải lịch sử…</div>}
                {!logsLoading && logs.length === 0 && (
                  <div className="adm-empty">Chưa có lịch sử hoạt động nào.</div>
                )}
                {!logsLoading && logs.length > 0 && (
                  <div className="adm-history-list">
                    {logs.map((log, i) => (
                      <div key={log.id || i} className="adm-history-item">
                        <span className="adm-history-icon">
                          {LOG_ICON[log.action] || "📌"}
                        </span>
                        <div className="adm-history-content">
                          <div className="adm-history-action">
                            {log.action?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "Hoạt động"}
                          </div>
                          {(log.actorName || log.actor) && (
                            <div className="adm-history-by">
                              Bởi: {log.actorName || log.actor}
                            </div>
                          )}
                          {log.note && (
                            <div className="adm-history-note">{log.note}</div>
                          )}
                        </div>
                        <div className="adm-history-time">
                          {fmtDate(log.createdAt || log.timestamp)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ── Footer action bar ──────────────────────────────── */}
          <div className="adm-footer-bar">
            <div className="adm-footer-left">
              {/* Nhận xử lý — chỉ khi open/assigned */}
              {(action.status === "open" || action.status === "assigned") && (
                <button
                  className="adm-footer-btn adm-footer-btn--work"
                  disabled={statusChanging}
                  onClick={() => callStatusChange("in_progress")}
                >
                  🔧 {statusChanging ? "Đang cập nhật…" : "Nhận xử lý"}
                </button>
              )}
              {/* Nộp bằng chứng — khi chưa đóng */}
              {!isClosed && (
                <button
                  className="adm-footer-btn adm-footer-btn--evidence"
                  onClick={() => setTab("evidence")}
                >
                  📤 Bằng chứng
                </button>
              )}
              {/* Xác minh — EHS admin khi done_by_owner */}
              {isEhsAdmin && action.status === "done_by_owner" && (
                <button
                  className="adm-footer-btn adm-footer-btn--verify"
                  onClick={() => setTab("evidence")}
                >
                  ✅ Xác minh &amp; Đóng
                </button>
              )}
              {statusMsg && (
                <span className="adm-footer-msg">{statusMsg}</span>
              )}
            </div>
            <button className="adm-footer-btn adm-footer-btn--close" onClick={onClose}>
              Đóng
            </button>
          </div>

        </div>
      </div>

      {/* ── Lightbox ─────────────────────────────────────────── */}
      {lightboxUrl && (
        <div className="adm-lightbox" onMouseDown={() => setLightboxUrl("")}>
          <img
            src={lightboxUrl}
            alt="preview"
            className="adm-lightbox-img"
            onMouseDown={e => e.stopPropagation()}
          />
          <button className="adm-lightbox-close" onMouseDown={() => setLightboxUrl("")}>✕</button>
        </div>
      )}
    </>,
    document.body
  );
}
