// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import PdfJsViewer from "./PdfJsViewer";
import OfficeFileViewer from "./OfficeFileViewer";

/* ─── Evidence upload helpers ─────────────────────────────── */
function evFmtBytes(b: number): string {
  if (b < 1024) return b + "B";
  if (b < 1048576) return (b / 1024).toFixed(1) + "KB";
  return (b / 1048576).toFixed(1) + "MB";
}

type EvPhotoEntry = { id: string; file: File; originalUrl: string; previewUrl: string; originalSize: number; compressedSize: number; name: string; blob: Blob; };
async function evCompressImage(file: File, maxPx = 1400, quality = 0.82): Promise<EvPhotoEntry | null> {
  return new Promise(resolve => {
    const origUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(origUrl); resolve(null); };
    img.onload = () => {
      try {
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxPx || h > maxPx) { if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; } else { w = Math.round(w * maxPx / h); h = maxPx; } }
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d")!.drawImage(img, 0, 0, w, h);
        cv.toBlob(blob => {
          if (!blob) { URL.revokeObjectURL(origUrl); resolve(null); return; }
          resolve({ id: crypto.randomUUID(), file, originalUrl: origUrl, previewUrl: URL.createObjectURL(blob), originalSize: file.size, compressedSize: blob.size, name: file.name, blob });
        }, "image/jpeg", quality);
      } catch { URL.revokeObjectURL(origUrl); resolve(null); }
    };
    img.src = origUrl;
  });
}

function EvLightbox({ photos, startIndex, onClose }: { photos: EvPhotoEntry[]; startIndex: number; onClose: () => void }) {
  const [idx, setIdx] = useState(startIndex);
  const p = photos[idx];
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "ArrowLeft") setIdx(i => (i - 1 + photos.length) % photos.length); if (e.key === "ArrowRight") setIdx(i => (i + 1) % photos.length); if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn); return () => window.removeEventListener("keydown", fn);
  }, [photos.length, onClose]);
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.9)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "rgba(0,0,0,.45)" }}>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,.7)" }}>{idx + 1}/{photos.length} · {p.name}</span>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,.12)", border: "none", borderRadius: 6, color: "#fff", fontSize: 16, cursor: "pointer", padding: "5px 10px" }}>✕</button>
      </div>
      <img onClick={e => e.stopPropagation()} src={p.previewUrl} style={{ maxWidth: "90vw", maxHeight: "80vh", objectFit: "contain", borderRadius: 8 }} alt={p.name} />
      {photos.length > 1 && (<>
        <button onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + photos.length) % photos.length); }} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,.15)", border: "none", borderRadius: "50%", width: 40, height: 40, color: "#fff", fontSize: 20, cursor: "pointer" }}>‹</button>
        <button onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % photos.length); }} style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,.15)", border: "none", borderRadius: "50%", width: 40, height: 40, color: "#fff", fontSize: 20, cursor: "pointer" }}>›</button>
      </>)}
    </div>, document.body
  );
}

function EvImageZone({ photos, onAdd, onRemove, maxFiles = 6 }: { photos: EvPhotoEntry[]; onAdd: (e: EvPhotoEntry[]) => void; onRemove: (id: string) => void; maxFiles?: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [lbIdx, setLbIdx] = useState<number | null>(null);
  // Revoke blob URLs for all staged photos when zone unmounts
  const photosRef = useRef(photos);
  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => { photosRef.current.forEach(p => { URL.revokeObjectURL(p.previewUrl); URL.revokeObjectURL(p.originalUrl); }); }, []);
  const handleRemove = useCallback((id: string) => {
    const p = photos.find(x => x.id === id);
    if (p) { URL.revokeObjectURL(p.previewUrl); URL.revokeObjectURL(p.originalUrl); }
    onRemove(id);
  }, [photos, onRemove]);
  const process = useCallback(async (files: File[]) => {
    const imgs = files.filter(f => f.type.startsWith("image/")).slice(0, maxFiles - photos.length);
    if (!imgs.length) return;
    setProcessing(true);
    try {
      const results = (await Promise.all(imgs.map(f => evCompressImage(f)))).filter((e): e is EvPhotoEntry => e !== null);
      if (results.length) onAdd(results);
    } finally { setProcessing(false); }
  }, [photos.length, maxFiles, onAdd]);
  const remaining = maxFiles - photos.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {lbIdx !== null && <EvLightbox photos={photos} startIndex={lbIdx} onClose={() => setLbIdx(null)} />}
      <div style={{ fontSize: 11, fontWeight: 700, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6 }}>
        🖼️ Ảnh bằng chứng
        <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>(không bắt buộc) · {photos.length}/{maxFiles}</span>
      </div>
      {photos.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {photos.map((p, i) => (
            <div key={p.id} style={{ position: "relative", flexShrink: 0 }}>
              <button onClick={() => setLbIdx(i)} style={{ padding: 0, border: "2px solid #bae6fd", borderRadius: 7, cursor: "pointer", background: "none", overflow: "hidden", display: "block" }} title={p.name}>
                <img src={p.previewUrl} style={{ width: 64, height: 64, objectFit: "cover", display: "block" }} alt={p.name} />
              </button>
              <div style={{ position: "absolute", bottom: 3, left: 2, right: 2, background: "rgba(0,0,0,.55)", borderRadius: 3, fontSize: 9, color: "#fff", textAlign: "center", padding: "1px 2px", pointerEvents: "none" }}>{evFmtBytes(p.compressedSize)}</div>
              <button onClick={() => handleRemove(p.id)} style={{ position: "absolute", top: -5, right: -5, width: 17, height: 17, borderRadius: "50%", background: "#ef4444", border: "2px solid #fff", color: "#fff", fontSize: 11, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>✕</button>
            </div>
          ))}
          {remaining > 0 && !processing && (
            <button onClick={() => inputRef.current?.click()} style={{ width: 64, height: 64, borderRadius: 7, border: "2px dashed #bae6fd", background: "#f0f9ff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, color: "#0369a1", flexShrink: 0 }}>
              <span style={{ fontSize: 18 }}>+</span><span style={{ fontSize: 11, fontWeight: 600 }}>thêm</span>
            </button>
          )}
        </div>
      )}
      {photos.length === 0 && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); process(Array.from(e.dataTransfer.files)); }}
          onClick={() => remaining > 0 && inputRef.current?.click()}
          style={{ border: `2px dashed ${dragging ? "#0369a1" : "#bae6fd"}`, borderRadius: 9, background: dragging ? "#e0f2fe" : "#f0f9ff", padding: "14px 12px", textAlign: "center", cursor: "pointer", transition: "all .15s" }}>
          {processing
            ? <div style={{ fontSize: 13, color: "#0369a1", fontWeight: 600 }}>Đang xử lý…</div>
            : <>
              <div style={{ fontSize: 26, marginBottom: 4, lineHeight: 1 }}>🖼️</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: dragging ? "#0369a1" : "#334155", marginBottom: 2 }}>Kéo thả ảnh hoặc nhấn để chọn</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>JPG, PNG, WEBP · Tự động nén · Tối đa {maxFiles} ảnh</div>
            </>
          }
        </div>
      )}
      <input ref={inputRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files) process(Array.from(e.target.files)); e.target.value = ""; }} />
    </div>
  );
}

type EvDocEntry = { id: string; name: string; size: number; fileType: 'pdf' | 'excel' | 'word'; url: string; file: File; };
function evDocTypeOf(f: File): 'pdf' | 'excel' | 'word' | null {
  const n = f.name.toLowerCase();
  if (f.type === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.xlsx') || n.endsWith('.xls') || f.type.includes('spreadsheet') || f.type.includes('excel')) return 'excel';
  if (n.endsWith('.docx') || n.endsWith('.doc') || f.type.includes('wordprocessingml') || f.type.includes('msword')) return 'word';
  return null;
}
const EV_DOC_META = {
  pdf:   { icon: "📕", label: "PDF",   color: "#b91c1c", bg: "#fff5f5", border: "#fca5a5", btnBg: "#fef2f2" },
  excel: { icon: "📗", label: "Excel", color: "#166534", bg: "#f0fdf4", border: "#86efac", btnBg: "#dcfce7" },
  word:  { icon: "📘", label: "Word",  color: "#1d4ed8", bg: "#eff6ff", border: "#93c5fd", btnBg: "#dbeafe" },
};

/* ─── EvDocChip — chip với tooltip portal & xem file ──────── */
function EvDocChip({ d, idx, onPreview, onRemove }: { d: EvDocEntry; idx: number; onPreview: (d: EvDocEntry) => void; onRemove: (id: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null);
  function handleEnter() {
    if (wrapRef.current) { const r = wrapRef.current.getBoundingClientRect(); setTipPos({ x: r.left + r.width / 2, y: r.top - 8 }); }
  }
  const m = EV_DOC_META[d.fileType];
  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}
      onMouseEnter={handleEnter} onMouseLeave={() => setTipPos(null)}>
      {tipPos && createPortal(
        <div style={{ position: "fixed", top: tipPos.y, left: tipPos.x,
          transform: "translate(-50%,-100%)", zIndex: 99999,
          background: "#1e293b", color: "#fff", borderRadius: 9,
          padding: "8px 12px", fontSize: 11.5, pointerEvents: "none",
          boxShadow: "0 6px 20px rgba(0,0,0,.32)",
          minWidth: 160, maxWidth: 240, whiteSpace: "normal", wordBreak: "break-all", lineHeight: 1.4 }}>
          <div style={{ fontWeight: 800, marginBottom: 3, fontSize: 12 }}>{d.name}</div>
          <div style={{ color: "#94a3b8", fontSize: 10.5 }}>{m.label} · {evFmtBytes(d.size)}</div>
          <div style={{ marginTop: 4, fontSize: 10, color: "#60a5fa", fontWeight: 700 }}>👁 Nhấn để xem</div>
          <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0, borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent", borderTop: "5px solid #1e293b" }} />
        </div>, document.body
      )}
      <button onClick={() => onPreview(d)} title={d.name}
        style={{ width: 60, height: 70, borderRadius: 11,
          border: `2px solid ${tipPos ? m.color : m.border}`,
          background: m.bg, cursor: "pointer",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 3, padding: "4px 3px", transition: "all .13s",
          boxShadow: tipPos ? `0 4px 14px ${m.color}30` : "0 1px 4px rgba(0,0,0,.07)",
          position: "relative" }}>
        <span style={{ position: "absolute", top: -5, right: -5,
          width: 17, height: 17, borderRadius: "50%",
          background: m.color, color: "#fff", fontSize: 9, fontWeight: 900,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "2px solid #fff", lineHeight: 1 }}>{idx + 1}</span>
        <span style={{ fontSize: 28, lineHeight: 1 }}>{m.icon}</span>
        <span style={{ fontSize: 8.5, fontWeight: 800, color: m.color,
          textTransform: "uppercase", letterSpacing: "0.05em", lineHeight: 1 }}>{m.label}</span>
      </button>
      <button onClick={e => { e.stopPropagation(); onRemove(d.id); }} title="Xóa file"
        style={{ position: "absolute", top: -5, left: -5,
          width: 17, height: 17, borderRadius: "50%",
          background: "#ef4444", border: "2px solid #fff",
          color: "#fff", fontSize: 9, fontWeight: 900, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0, lineHeight: 1 }}>✕</button>
    </div>
  );
}

function EvDocZone({ docs, onChange }: { docs: EvDocEntry[]; onChange: (d: EvDocEntry[]) => void }) {
  const inp = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<EvDocEntry | null>(null);
  // Revoke all staged doc blob URLs on unmount
  const docsRef = useRef(docs);
  useEffect(() => { docsRef.current = docs; }, [docs]);
  useEffect(() => () => { docsRef.current.forEach(d => URL.revokeObjectURL(d.url)); }, []);
  function process(raw: File[]) {
    const entries: EvDocEntry[] = [];
    for (const f of raw) { const t = evDocTypeOf(f); if (!t) continue; entries.push({ id: crypto.randomUUID(), name: f.name, size: f.size, fileType: t, url: URL.createObjectURL(f), file: f }); }
    if (entries.length) onChange([...docs, ...entries]);
  }
  function remove(id: string) { const e = docs.find(d => d.id === id); if (e) URL.revokeObjectURL(e.url); onChange(docs.filter(d => d.id !== id)); }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Preview modal cho staged doc */}
      {preview && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.78)", zIndex: 9998, display: "flex", flexDirection: "column" }}
          onClick={e => { if (e.target === e.currentTarget) setPreview(null); }}>
          <div style={{ background: "#1e293b", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 18 }}>{EV_DOC_META[preview.fileType].icon}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview.name}</span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>{evFmtBytes(preview.size)}</span>
            <a href={preview.url} download={preview.name} style={{ padding: "4px 10px", borderRadius: 6, background: "#334155", color: "#94a3b8", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>⬇️ Tải</a>
            <button onClick={() => setPreview(null)} style={{ padding: "4px 12px", borderRadius: 6, background: "#ef4444", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>✕ Đóng</button>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            {(preview.fileType === "excel" || preview.fileType === "word")
              ? <OfficeFileViewer url={preview.url} fileName={preview.name} onClose={() => setPreview(null)} fileObj={preview.file} />
              : <PdfJsViewer url={preview.url} file={preview.file} style={{ width: "100%", height: "100%" }} />}
          </div>
        </div>, document.body
      )}
      <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        📎 Tài liệu bằng chứng <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>(không bắt buộc)</span>
      </div>
      {docs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "6px 4px",
          background: "#fafbfc", borderRadius: 10, border: "1px solid #f1f5f9" }}>
          {docs.map((d, idx) => (
            <EvDocChip key={d.id} d={d} idx={idx} onPreview={setPreview} onRemove={remove} />
          ))}
        </div>
      )}
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); process(Array.from(e.dataTransfer.files)); }}
        onClick={() => inp.current?.click()}
        style={{ border: `2px dashed ${drag ? "#3b82f6" : "#cbd5e1"}`, borderRadius: 9, background: drag ? "#eff6ff" : "#fafbfc", padding: "12px 14px", textAlign: "center", cursor: "pointer", transition: "all .15s", boxShadow: drag ? "0 0 0 3px #bfdbfe" : "none" }}>
        <div style={{ fontSize: 22, marginBottom: 4, lineHeight: 1 }}>{drag ? "📂" : "📎"}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: drag ? "#2563eb" : "#334155", marginBottom: 3 }}>{drag ? "Thả file vào đây…" : docs.length > 0 ? `+ Thêm (đã có ${docs.length} file)` : "Kéo thả hoặc nhấn để chọn"}</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 5, flexWrap: "wrap" }}>
          {[{ icon: "📕", l: "PDF" }, { icon: "📗", l: "Excel" }, { icon: "📘", l: "Word" }].map(t => (
            <span key={t.l} style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 4, padding: "1px 7px", fontWeight: 600 }}>{t.icon} {t.l}</span>
          ))}
        </div>
      </div>
      <input ref={inp} type="file" multiple
        accept=".pdf,.xlsx,.xls,.doc,.docx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: "none" }} onChange={e => { if (e.target.files) process(Array.from(e.target.files)); e.target.value = ""; }} />
    </div>
  );
}

// ─── Status / Priority maps ─────────────────────────────────────────────────
const STATUS_FLOW = [
  { id:"draft",         label:"Chờ phê duyệt",    step:-1, color:"#64748b", bg:"#f8fafc" },
  { id:"rejected",      label:"Bị từ chối",       step:-1, color:"#dc2626", bg:"#fef2f2" },
  { id:"open",          label:"Đang mở",          step:0, color:"#3b82f6", bg:"#eff6ff" },
  { id:"in_progress",   label:"Đang xử lý",       step:1, color:"#f59e0b", bg:"#fffbeb" },
  { id:"done_by_owner", label:"Chờ EHS xác minh", step:2, color:"#06b6d4", bg:"#ecfeff" },
  { id:"closed",        label:"Đã đóng",           step:3, color:"#22c55e", bg:"#f0fdf4" },
];

const PRIORITY_META = {
  critical: { label:"Khẩn cấp",   color:"#dc2626", bg:"#fef2f2", border:"#fecaca" },
  high:     { label:"Cao",         color:"#dc2626", bg:"#fef2f2", border:"#fecaca" },
  medium:   { label:"Trung bình",  color:"#d97706", bg:"#fefce8", border:"#fde68a" },
  low:      { label:"Thấp",        color:"#059669", bg:"#f0fdf4", border:"#a7f3d0" },
};

const SOURCE_LABELS = {
  manual:"Thủ công", warning:"Cảnh báo nóng", incident:"Sự cố",
  audit:"Kiểm tra", kyt:"KYT", pccc:"PCCC",
  iplan:"Kế hoạch KT", inspection:"Kế hoạch KT",
};

const LOG_ICONS = {
  "created":              "📋", "auto-created":          "🤖",
  "status-changed-to-in_progress":   "✋", "status-changed-to-done_by_owner":"🏁",
  "status-changed-to-closed":        "✅", "status-changed-to-open":          "🔄",
  "files-attached":       "📎", "note-added":            "💬",
  "verified-closed":      "✅", "rejected-reopen":       "↩",
  "due-date-extended":    "📅", "edited":                "✏️",
  "approved":             "✅", "rejected-draft":        "❌", "resubmitted": "🔁",
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function normStatus(s) {
  if (["closed","verified"].includes(s)) return "closed";
  if (["done_by_owner","submitted"].includes(s)) return "done_by_owner";
  if (s === "in_progress") return "in_progress";
  if (["draft","pending_ehs"].includes(s)) return "draft";
  if (s === "rejected") return "rejected";
  if (s === "reopened") return "in_progress";
  return "open";
}
function normPriority(p) {
  if (p === "critical") return "critical";
  if (p === "high")     return "high";
  if (p === "low")      return "low";
  return "medium";
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = iso.slice(0,10);
  const t = iso.length > 10 ? " " + iso.slice(11,16) : "";
  return d + t;
}
function daysLeft(due) {
  if (!due) return null;
  const diff = Math.round((new Date(due).getTime() - Date.now()) / 86400000);
  return diff;
}
function isImage(url)  { return /\.(jpg|jpeg|png|gif|webp)/i.test(url||""); }
function isPdf(url)    { return /\.pdf(\?|$)/i.test(url||""); }
function isOffice(url) { return /\.(xlsx|docx|xls|doc|pptx|ppt)(\?|$)/i.test(url||""); }
function officeFileName(f) {
  const name = f.originalName || f.fileName || f.name || "";
  const url  = f.url || "";
  if (name) return name;
  const m = url.match(/[^/?#]+\.(xlsx|docx|xls|doc|pptx|ppt)/i);
  return m ? m[0] : "file.xlsx";
}

// ─── Small UI atoms ─────────────────────────────────────────────────────────
const Sep = () => <div style={{ height:1, background:"#f1f5f9", margin:"4px 0" }} />;

function SectionHead({ label, action }: any) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
      padding:"10px 16px", background:"#f8fafc", borderBottom:"1px solid #e2e8f0" }}>
      <span style={{ fontSize:12, fontWeight:800, color:"#1e293b", letterSpacing:"0.07em" }}>{label}</span>
      {action}
    </div>
  );
}

function Field({ label, val, color, full }: any) {
  return (
    <div style={{ gridColumn:full?"1/-1":undefined,
      padding:"10px 12px", borderRadius:8, background:"#f8fafc", border:"1px solid #e2e8f0" }}>
      <div style={{ fontSize:11, fontWeight:700, color:"#475569", letterSpacing:"0.04em", marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:14, fontWeight:600, color:color||"#0f172a", lineHeight:1.4 }}>{val||"—"}</div>
    </div>
  );
}

// ─── Props ──────────────────────────────────────────────────────────────────
interface CurrentUser {
  id?: string;
  username: string;
  displayName: string;
  departmentId: string;
  role?: string;
}

interface Props {
  action: any;
  isEhsAdmin?: boolean;
  currentUser?: CurrentUser;
  onClose: () => void;
  onUpdated?: (a: any) => void;
  onEdit?: (a: any) => void;
}

// ─── Workflow chain ──────────────────────────────────────────────────────────
function buildWfNodes(action, logs) {
  const ns = normStatus(action.status);
  const stepIdx = STATUS_FLOW.findIndex(s => s.id === ns);

  const logByAction = (key) => logs.find(l => l.action === key);

  const acceptLog  = logByAction("status-changed-to-in_progress");
  const submitLog  = logByAction("status-changed-to-done_by_owner");
  const closeLog   = logByAction("verified-closed") || logByAction("status-changed-to-closed");

  return [
    { role:"Bộ phận tạo",  person: action.createdByName||"—",     dept:"",              time: fmtDate(action.createdAt) },
    { role:"Tạo CAPA",     person: action.sourceType !== "manual" ? "Tự động" : (action.createdByName||"—"), dept: SOURCE_LABELS[action.sourceType]||"", time: fmtDate(action.createdAt) },
    { role:"Nhận xử lý",  person: action.ownerName||"—",           dept: action.departmentCode||"", time: acceptLog ? fmtDate(acceptLog.createdAt) : (ns !== "open" ? fmtDate(action.updatedAt) : null) },
    { role:"Nộp BC",       person: action.ownerName||"—",           dept:"",              time: submitLog ? fmtDate(submitLog.createdAt) : (["done_by_owner","closed"].includes(ns) ? fmtDate(action.updatedAt) : null) },
    { role:"EHS xác minh", person: action.verifiedByName||"—",      dept:"EHS",           time: closeLog ? fmtDate(closeLog.createdAt) : (ns === "closed" ? fmtDate(action.verifiedAt||action.updatedAt) : null) },
    { role:"Đóng CAPA",    person: action.verifiedByName||"—",      dept:"",              time: closeLog ? fmtDate(closeLog.createdAt) : (ns === "closed" ? fmtDate(action.updatedAt) : null) },
  ];
}

// ─── Main component ──────────────────────────────────────────────────────────
export function CapaViewModal({ action: initialAction, isEhsAdmin = false, currentUser, onClose, onUpdated, onEdit }: Props) {
  const [action, setAction]         = useState(initialAction);
  const [logs, setLogs]             = useState([]);
  const [logsLoaded, setLogsLoaded] = useState(false);

  const [note, setNote]             = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSent, setNoteSent]     = useState(false);

  const [evPhotos, setEvPhotos]     = useState<EvPhotoEntry[]>([]);
  const [evDocs, setEvDocs]         = useState<EvDocEntry[]>([]);
  const [evNotes, setEvNotes]       = useState("");
  const [evSubmitting, setEvSubmitting] = useState(false);
  const [evError, setEvError]       = useState("");
  const [evSuccess, setEvSuccess]   = useState(false);

  const [verifyNote, setVerifyNote] = useState("");
  const [verifying, setVerifying]   = useState(false);
  const [verifyError, setVerifyError] = useState("");

  const [accepting, setAccepting]   = useState(false);

  /* ── Approve / Reject / Resubmit ── */
  const [approving, setApproving]       = useState(false);
  const [rejecting, setRejecting]       = useState(false);
  const [rejectMode, setRejectMode]     = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [resubmitting, setResubmitting] = useState(false);

  const approveAction = async () => {
    setApproving(true);
    try {
      const r = await fetch(`/api/actions/${action.id}/approve`, {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      refreshAction(data);
      setLogsLoaded(false);
    } catch(e: any) { alert(e.message || "Lỗi khi phê duyệt"); }
    finally { setApproving(false); }
  };

  const rejectAction = async () => {
    if (!rejectReason.trim()) { alert("Vui lòng nhập lý do từ chối"); return; }
    setRejecting(true);
    try {
      const r = await fetch(`/api/actions/${action.id}/reject`, {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      refreshAction(data);
      setLogsLoaded(false);
      setRejectMode(false);
      setRejectReason("");
    } catch(e: any) { alert(e.message || "Lỗi khi từ chối"); }
    finally { setRejecting(false); }
  };

  const resubmitAction = async () => {
    setResubmitting(true);
    try {
      const r = await fetch(`/api/actions/${action.id}/resubmit`, {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      refreshAction(data);
      setLogsLoaded(false);
    } catch(e: any) { alert(e.message || "Lỗi khi gửi lại"); }
    finally { setResubmitting(false); }
  };
  const [lightboxUrl, setLightboxUrl]       = useState("");
  const [pdfViewUrl, setPdfViewUrl]         = useState("");
  const [officeViewFile, setOfficeViewFile] = useState<{url:string,name:string}|null>(null);

  const [activeTab, setActiveTab] = useState(0);
  const TABS = ["🗂 Tổng quan","🔍 Phân tích & KH","📎 Bằng chứng","🕐 Nhật ký & Trao đổi","📅 Gia hạn"];

  /* ── Inline progress edit (action plan) ── */
  const [editingProgress, setEditingProgress] = useState<{idx:number, val:string}|null>(null);

  const saveProgress = async (idx: number, pct: number) => {
    if (!Array.isArray(action.actionPlan)) return;
    const updated = action.actionPlan.map((item: any, i: number) =>
      i === idx ? { ...item, progress: String(Math.min(100, Math.max(0, pct))) } : item
    );
    try {
      const r = await fetch(`/api/actions/${action.id}`, {
        method:"PATCH", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ actionPlan: updated }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      refreshAction(data);
    } catch(e: any) { alert(e.message || "Lỗi cập nhật tiến độ"); }
    setEditingProgress(null);
  };

  /* ── Evidence file delete ── */
  const deleteEvidenceFile = async (idx: number) => {
    if (!confirm("Xóa file bằng chứng này?")) return;
    try {
      const r = await fetch(`/api/actions/${action.id}/evidence/${idx}`, {
        method:"DELETE", credentials:"include",
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      refreshAction(data);
    } catch(e: any) { alert(e.message || "Lỗi khi xóa file"); }
  };

  /* ── Gia hạn (extend due date) ── */
  const [extDate, setExtDate]   = useState("");
  const [extReason, setExtReason] = useState("");
  const [extSaving, setExtSaving] = useState(false);
  const [extError, setExtError]   = useState("");
  const [extDone, setExtDone]     = useState(false);

  /* ── Nhắc hạn (due-date reminder) ── */
  const [reminding, setReminding]   = useState(false);
  const [remindDone, setRemindDone] = useState(false);
  const [remindError, setRemindError] = useState("");

  const submitExtend = async () => {
    if (!extDate) { setExtError("Vui lòng chọn ngày hạn mới"); return; }
    if (!extReason.trim()) { setExtError("Lý do gia hạn là bắt buộc"); return; }
    if (extDate === due) { setExtError("Ngày mới phải khác ngày hạn hiện tại"); return; }
    setExtSaving(true); setExtError("");
    try {
      const r = await fetch(`/api/actions/${action.id}`, {
        method:"PATCH", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ dueDate: extDate, _extendMode: true, _extendReason: extReason.trim(), _prevDueDate: due }),
      });
      if (!r.ok) throw new Error(await r.text());
      const updated = await r.json();
      setExtDone(true);
      setTimeout(() => { refreshAction(updated); setLogsLoaded(false); setExtDone(false); setExtReason(""); setExtDate(updated.dueDate || updated.due_date || ""); }, 1200);
    } catch(e: any) { setExtError(e.message || "Lỗi khi gia hạn"); }
    finally { setExtSaving(false); }
  };

  const submitReminder = async () => {
    setReminding(true); setRemindError(""); setRemindDone(false);
    try {
      const r = await fetch(`/api/actions/${action.id}/remind`, {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error(await r.text());
      setRemindDone(true);
      setLogsLoaded(false);
      setTimeout(() => setRemindDone(false), 3000);
    } catch(e: any) { setRemindError(e.message || "Lỗi khi gửi nhắc hạn"); }
    finally { setReminding(false); }
  };

  /* ── Comment / Trao đổi nội bộ ── */
  const [comments, setComments]           = useState<any[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [cmtOpen, setCmtOpen]             = useState(false);
  const [cmtText, setCmtText]             = useState("");
  const [cmtSending, setCmtSending]       = useState(false);
  const [cmtError, setCmtError]           = useState("");
  const [mentionOpen, setMentionOpen]     = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [editCmtId, setEditCmtId]         = useState<string|null>(null);
  const [editCmtText, setEditCmtText]     = useState("");
  const cmtRef = useRef<HTMLTextAreaElement>(null);
  const cmtEndRef = useRef<HTMLDivElement>(null);


  /* Lock body scroll while modal is open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* Fetch fresh detail from API on mount so nested fields (actionPlan, whys, etc.)
     are always complete regardless of what the list endpoint returned */
  useEffect(() => {
    fetch(`/api/actions/${initialAction.id}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setAction(data); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction.id]);

  const ns     = normStatus(action.status);
  const st     = STATUS_FLOW.find(s => s.id === ns) ?? STATUS_FLOW[0];
  const pm     = PRIORITY_META[normPriority(action.priority || action.severity)] ?? PRIORITY_META.medium;
  const wfNodes = buildWfNodes(action, logs);
  const due    = action.dueDate || action.due;
  const dl     = daysLeft(due);
  const overallProgress = action.actionPlan?.length
    ? Math.min(100, Math.max(0, Math.round(
        action.actionPlan.reduce((sum: number, p: any) => sum + Math.min(100, Math.max(0, Number(p.progress) || 0)), 0)
        / action.actionPlan.length
      )))
    : -1;
  const evidenceFiles = Array.isArray(action.evidenceFiles) ? action.evidenceFiles : [];
  const sourceFiles   = Array.isArray(action.sourceFiles)   ? action.sourceFiles   : [];

  /* ── Phân quyền gia hạn ──────────────────────────────────────────────────
     EHS admin: luôn được.
     Người khác: phải là owner, người báo cáo, người thực hiện, hoặc cùng bộ phận
     với CAPA (departmentCode hoặc departments[]).
  ── */
  const canExtendDueDate: boolean = (() => {
    if (isEhsAdmin) return true;
    if (!currentUser) return false;
    const { displayName = "", username = "", departmentId = "" } = currentUser;
    const idents = [displayName, username].filter(Boolean).map(s => s.trim().toLowerCase());
    if (!idents.length) return false;
    const matchName = (name: string) => !!name && idents.some(u => u === name.trim().toLowerCase());

    if (matchName(action.ownerName || ""))      return true;
    if (matchName(action.createdByName || ""))   return true;

    if (Array.isArray(action.persons) && action.persons.some((p: string) => matchName(p || ""))) return true;

    if (Array.isArray(action.actionPlan)) {
      for (const item of action.actionPlan) {
        if (Array.isArray(item.persons) && item.persons.some((p: string) => matchName(p || ""))) return true;
        if (matchName(item.person || "")) return true;
      }
    }

    if (Array.isArray(action.reviewers)) {
      for (const r of action.reviewers) {
        const rName = typeof r === "string" ? r : (r?.name || r?.displayName || "");
        if (matchName(rName)) return true;
      }
    }

    if (departmentId) {
      const dept = departmentId.trim().toLowerCase();
      if (action.departmentCode && action.departmentCode.trim().toLowerCase() === dept) return true;
      if (Array.isArray(action.departments)) {
        for (const d of action.departments) {
          const code = (typeof d === "string" ? d : (d?.code || d?.departmentCode || "")).trim().toLowerCase();
          if (code && code === dept) return true;
        }
      }
    }

    return false;
  })();

  const refreshAction = (updated) => {
    setAction(updated);
    onUpdated?.(updated);
    setLogsLoaded(false);
  };

  useEffect(() => {
    if (logsLoaded) return;
    fetch(`/api/actions/${action.id}/logs`, { credentials:"include" })
      .then(r => r.ok ? r.json() : [])
      .then(l => { setLogs(l); setLogsLoaded(true); })
      .catch(() => setLogsLoaded(true));
  }, [action.id, logsLoaded]);

  useEffect(() => {
    if (commentsLoaded) return;
    fetch(`/api/actions/${action.id}/comments`, { credentials:"include" })
      .then(r => r.ok ? r.json() : [])
      .then(c => { setComments(c); setCommentsLoaded(true); })
      .catch(() => setCommentsLoaded(true));
  }, [action.id, commentsLoaded]);

  const sendComment = async () => {
    const text = cmtText.trim();
    if (!text || cmtSending) return;
    setCmtSending(true); setCmtError("");
    const mentions = [...text.matchAll(/@([\w.-]+)/g)].map(m => m[1]);
    try {
      const r = await fetch(`/api/actions/${action.id}/comments`, {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ text, mentions }),
      });
      if (!r.ok) throw new Error((await r.json()).message || "Lỗi");
      const cmt = await r.json();
      setComments(prev => [...prev, cmt]);
      setCmtText("");
      setTimeout(() => cmtEndRef.current?.scrollIntoView({ behavior:"smooth" }), 80);
    } catch(e: any) { setCmtError(e.message || "Không gửi được"); }
    finally { setCmtSending(false); }
  };

  const saveEditComment = async (id: string) => {
    const text = editCmtText.trim();
    if (!text) return;
    try {
      const r = await fetch(`/api/actions/${action.id}/comments/${id}`, {
        method:"PATCH", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error("Lỗi");
      const updated = await r.json();
      setComments(prev => prev.map(c => c.id === id ? updated : c));
      setEditCmtId(null); setEditCmtText("");
    } catch(e: any) { alert(e.message); }
  };

  const deleteComment = async (id: string) => {
    if (!confirm("Xóa comment này?")) return;
    try {
      const r = await fetch(`/api/actions/${action.id}/comments/${id}`, {
        method:"DELETE", credentials:"include",
      });
      if (!r.ok) { const d = await r.json(); alert(d.message||"Lỗi"); return; }
      setComments(prev => prev.filter(c => c.id !== id));
    } catch {}
  };

  const MENTION_PEOPLE = [
    "EHS", "GA", "QA", "QC", "PE1", "MP", "MT", "CM", "WM",
    "MR", "RF", "DB", "DP1", "DP2", "OK1", "OK2", "SP1", "EBM", "ETR", "MS1", "SA",
  ];

  const handleCmtKeydown = (e) => {
    if (mentionOpen) {
      const filtered = MENTION_PEOPLE.filter(p => p.toLowerCase().startsWith(mentionFilter.toLowerCase()));
      if (e.key === "Escape") { setMentionOpen(false); e.preventDefault(); return; }
      if (e.key === "Enter" && filtered.length) { insertMention(filtered[0]); e.preventDefault(); return; }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { sendComment(); e.preventDefault(); }
  };

  const handleCmtChange = (val: string) => {
    setCmtText(val);
    const atIdx = val.lastIndexOf("@");
    if (atIdx !== -1) {
      const after = val.slice(atIdx + 1);
      if (/^[\w.-]*$/.test(after) && !after.includes(" ")) {
        setMentionFilter(after); setMentionOpen(true); return;
      }
    }
    setMentionOpen(false);
  };

  const insertMention = (name: string) => {
    const atIdx = cmtText.lastIndexOf("@");
    const newText = cmtText.slice(0, atIdx) + `@${name} `;
    setCmtText(newText); setMentionOpen(false); setMentionFilter("");
    cmtRef.current?.focus();
  };

  const renderCommentText = (text: string) =>
    text.split(/(@[\w.-]+)/g).map((part, i) =>
      part.startsWith("@")
        ? <span key={i} style={{ color:"#2563eb", fontWeight:700, background:"#dbeafe", padding:"0 3px", borderRadius:3 }}>{part}</span>
        : <span key={i}>{part}</span>
    );

  const avatarColor = (name: string) => {
    const colors = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ec4899","#06b6d4","#ef4444","#84cc16"];
    let h = 0; for (const c of (name||"?")) h = (h * 31 + c.charCodeAt(0)) % colors.length;
    return colors[h];
  };

  const acceptAction = async () => {
    setAccepting(true);
    try {
      const r = await fetch(`/api/actions/${action.id}`, {
        method:"PATCH", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ status:"in_progress" }),
      });
      if (!r.ok) throw new Error(await r.text());
      refreshAction(await r.json());
    } finally { setAccepting(false); }
  };

  const submitEvidence = async () => {
    setEvSubmitting(true);
    setEvError("");
    try {
      const hasFiles = evPhotos.length > 0 || evDocs.length > 0;
      if (hasFiles) {
        const fd = new FormData();
        // Append compressed photo blobs
        for (const p of evPhotos) {
          fd.append("files", p.blob, p.name.replace(/\.[^.]+$/, ".jpg"));
        }
        // Append document files
        for (const d of evDocs) {
          fd.append("files", d.file, d.name);
        }
        const r = await fetch(`/api/actions/${action.id}/upload-evidence`, { method:"POST", credentials:"include", body:fd });
        if (!r.ok) throw new Error(await r.text());
        setAction(await r.json());
      }
      const r2 = await fetch(`/api/actions/${action.id}/submit-evidence`, {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ evidenceNotes: evNotes.trim() || "Đã hoàn thành xử lý" }),
      });
      if (!r2.ok) throw new Error(await r2.text());
      refreshAction(await r2.json());
      // Revoke blob URLs before clearing
      evPhotos.forEach(p => { URL.revokeObjectURL(p.previewUrl); URL.revokeObjectURL(p.originalUrl); });
      evDocs.forEach(d => URL.revokeObjectURL(d.url));
      setEvPhotos([]); setEvDocs([]); setEvNotes(""); setEvSuccess(true);
    } catch (e: any) { setEvError(e.message || "Lỗi khi gửi"); }
    finally { setEvSubmitting(false); }
  };

  const callVerify = async (approved: boolean) => {
    setVerifying(true);
    setVerifyError("");
    try {
      const r = await fetch(`/api/actions/${action.id}/verify`, {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ approved, note: verifyNote || undefined }),
      });
      if (!r.ok) throw new Error(await r.text());
      refreshAction(await r.json());
      setVerifyNote("");
    } catch (e: any) { setVerifyError(e.message || "Lỗi xác minh"); }
    finally { setVerifying(false); }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setNoteLoading(true);
    try {
      const r = await fetch(`/api/actions/${action.id}`, {
        method:"PATCH", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ progressNote: note.trim() }),
      });
      if (r.ok) { setNote(""); setNoteSent(true); setLogsLoaded(false); setTimeout(() => setNoteSent(false), 3000); }
    } finally { setNoteLoading(false); }
  };

  // active workflow step index (0-5 nodes, mapped to status steps 0-3)
  const stIdx = st.step;
  const wfDone   = (i) => i < stIdx + 2;
  const wfActive = (i) => i === stIdx + 1;

  /* ── Print / Export PDF ─────────────────────────────────────────────── */
  const printCapaToPdf = () => {
    const a = action;
    const priorityLabel = pm.label.replace(/[🔴🟡🟢]/g,"").trim();
    const statusLabel   = st.label;
    const dueLabel      = due ? `${due}${dl !== null ? (dl < 0 ? ` — quá hạn ${-dl} ngày` : ` — còn ${dl} ngày`) : ""}` : "Chưa có";
    const srcLabel      = { manual:"Thủ công", warning:"Cảnh báo nóng", incident:"Sự cố", audit:"Kiểm tra", kyt:"KYT", pccc:"PCCC" }[a.sourceType] || a.sourceType || "—";

    /* ── Parse risk scores from description text ── */
    const desc = a.description || "";
    const riskBeforeMatch = desc.match(/\[Điểm rủi ro ban đầu\]\s*(\d+)\/25/);
    const riskAfterMatch  = desc.match(/\[Điểm rủi ro sau KP\]\s*(\d+)\/25/);
    const riskBefore = riskBeforeMatch ? parseInt(riskBeforeMatch[1]) : 0;
    const riskAfter  = riskAfterMatch  ? parseInt(riskAfterMatch[1])  : 0;
    const bothRisk   = riskBefore > 0 && riskAfter > 0;
    const riskImproved = bothRisk && riskAfter < riskBefore;
    const riskPct = bothRisk ? Math.round((1 - riskAfter/riskBefore)*100) : 0;

    function rBand(s) { return s>=15?"Rất cao":s>=8?"Cao":s>=4?"Trung bình":"Thấp"; }
    function rColor(s) { return s>=15?"#dc2626":s>=8?"#ea580c":s>=4?"#d97706":"#16a34a"; }
    function rBg(s)   { return s>=15?"#fef2f2":s>=8?"#fff7ed":s>=4?"#fefce8":"#f0fdf4"; }
    function rCellBg(s) {
      if(s>=20) return "#991b1b";if(s>=15) return "#dc2626";if(s>=10) return "#ef4444";
      if(s>=8)  return "#f97316";if(s>=6)  return "#fb923c";if(s>=4)  return "#fbbf24";
      if(s>=3)  return "#a3e635";return "#22c55e";
    }
    function rCellText(s) { return s>=6?"#fff":"#14532d"; }
    function rEmoji(s)    { return s>=15?"🔴":s>=8?"🟠":s>=4?"🟡":"🟢"; }

    /* ── Risk matrix HTML ── */
    const riskHtml = bothRisk ? `
      <div class="section" style="margin-bottom:14px;">
        <div class="section-head" style="background:#fffbeb;border-bottom-color:#fde68a;color:#92400e;">📊 MA TRẬN RỦI RO — TRƯỚC & SAU KHẮC PHỤC</div>
        <div style="padding:14px 16px;">
          <div style="display:grid;grid-template-columns:1fr 56px 1fr;gap:0;border-radius:10px;overflow:hidden;border:1.5px solid ${riskImproved?"#86efac":"#fca5a5"};">
            <!-- Before -->
            <div style="padding:14px;background:${rBg(riskBefore)};display:flex;flex-direction:column;align-items:center;gap:7px;">
              <div style="font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">TRƯỚC KHẮC PHỤC</div>
              <div style="width:54px;height:54px;border-radius:13px;background:${rCellBg(riskBefore)};display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px ${rCellBg(riskBefore)}66;">
                <span style="font-size:26px;font-weight:900;color:${rCellText(riskBefore)};">${riskBefore}</span>
              </div>
              <div style="font-size:13px;font-weight:800;color:${rColor(riskBefore)};">${rEmoji(riskBefore)} ${rBand(riskBefore)}</div>
              <div style="width:100%;height:6px;border-radius:3px;background:#e2e8f0;overflow:hidden;">
                <div style="height:100%;width:${riskBefore/25*100}%;background:${rCellBg(riskBefore)};border-radius:3px;"></div>
              </div>
            </div>
            <!-- Arrow -->
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;background:#fff;border-left:1px solid rgba(0,0,0,.06);border-right:1px solid rgba(0,0,0,.06);">
              <div style="font-size:18px;">${riskImproved?"↘":"↗"}</div>
              <div style="padding:3px 5px;border-radius:6px;font-size:10px;font-weight:800;background:${riskImproved?"#dcfce7":"#fef2f2"};color:${riskImproved?"#15803d":"#dc2626"};white-space:nowrap;">${riskImproved?`−${riskPct}%`:riskBefore===riskAfter?"=":"+"+Math.round((riskAfter/riskBefore-1)*100)+"%"}</div>
            </div>
            <!-- After -->
            <div style="padding:14px;background:${rBg(riskAfter)};display:flex;flex-direction:column;align-items:center;gap:7px;">
              <div style="font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">SAU KHẮC PHỤC</div>
              <div style="width:54px;height:54px;border-radius:13px;background:${rCellBg(riskAfter)};display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px ${rCellBg(riskAfter)}66;">
                <span style="font-size:26px;font-weight:900;color:${rCellText(riskAfter)};">${riskAfter}</span>
              </div>
              <div style="font-size:13px;font-weight:800;color:${rColor(riskAfter)};">${rEmoji(riskAfter)} ${rBand(riskAfter)}</div>
              <div style="width:100%;height:6px;border-radius:3px;background:#e2e8f0;overflow:hidden;">
                <div style="height:100%;width:${riskAfter/25*100}%;background:${rCellBg(riskAfter)};border-radius:3px;"></div>
              </div>
            </div>
          </div>
          <!-- Verdict -->
          <div style="margin-top:10px;padding:8px 12px;border-radius:8px;background:${riskImproved?"#f0fdf4":"#fff5f5"};border:1px solid ${riskImproved?"#86efac":"#fca5a5"};display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:12px;font-weight:700;color:${riskImproved?"#15803d":"#dc2626"};">${riskImproved?"✅ Biện pháp khắc phục hiệu quả":"⚠️ Rủi ro chưa được cải thiện"}</span>
            <span style="font-size:11px;color:#64748b;font-weight:600;">${riskBefore} → ${riskAfter} / 25 điểm</span>
          </div>
        </div>
      </div>` : "";

    /* ── Problem type label ── */
    const PROBLEM_LABELS: Record<string,string> = {
      FALL:"Té ngã / Ngã cao",HEIGHT:"Làm việc trên cao",ELECTRICAL:"Điện",
      FIRE:"Cháy nổ",CHEMICAL:"Hóa chất",VEHICLE:"Phương tiện / Xe cộ",
      ERGONOMIC:"Công thái học",PPE:"PPE / Trang bị BHLĐ",HOUSEKEEPING:"5S / Vệ sinh",
      PROCEDURE:"Quy trình / Thủ tục",EQUIPMENT:"Thiết bị / Máy móc",ENVIRONMENT:"Môi trường",OTHER:"Khác",
      /* aliases used by CreateCapaModal */
      MACH:"Máy móc / Thiết bị",ELEC:"Điện",CHEM:"Hóa chất",FIRE_:"PCCC",
      HEIGHT_:"Làm việc trên cao",VEHICLE_:"Phương tiện",PPE_:"PPE / Bảo hộ",
      BEHAV:"Hành vi con người",NEAR:"Cận nguy",ENV:"Môi trường","6S":"6S / Housekeeping",ENRG:"Năng lượng",
    };
    const problemLabel = a.problemType ? (PROBLEM_LABELS[a.problemType] || a.problemType) : null;

    /* ── Strip embedded tags from description for clean display ── */
    const cleanDesc = (desc)
      .replace(/\[Điểm rủi ro ban đầu\][^\n]*/g,"")
      .replace(/\[Điểm rủi ro sau KP\][^\n]*/g,"")
      .replace(/\[Ảnh \/ Tài liệu\][^\n]*/g,"")
      .replace(/\n{3,}/g,"\n\n")
      .trim();

    /* ── Action plan table rows ── */
    const actionPlanRows = Array.isArray(a.actionPlan) && a.actionPlan.length > 0
      ? a.actionPlan.map((it, i) => {
          const typeColor = it.type==="CA"?"#1d4ed8":it.type==="PA"?"#15803d":"#7c3aed";
          const typeBg    = it.type==="CA"?"#dbeafe":it.type==="PA"?"#dcfce7":"#ede9fe";
          const prog = it.progress !== undefined ? +it.progress : 0;
          const progColor = prog>=100?"#16a34a":prog>=50?"#d97706":"#64748b";
          return `<tr>
            <td style="width:28px;text-align:center;color:#94a3b8;font-weight:700;">${i+1}</td>
            <td style="font-weight:500;">${it.action || "—"}</td>
            <td style="width:42px;text-align:center;"><span style="padding:2px 7px;border-radius:12px;font-size:10px;font-weight:700;color:${typeColor};background:${typeBg};">${it.type || "—"}</span></td>
            <td style="width:120px;">${Array.isArray(it.persons) ? it.persons.join(", ") : (it.person||"—")}</td>
            <td style="width:84px;white-space:nowrap;">${it.deadline ? it.deadline.slice(0,10) : "—"}</td>
            <td style="width:52px;text-align:center;font-weight:700;color:${progColor};">${prog}%</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="6" style="color:#94a3b8;font-style:italic;text-align:center;padding:14px;">Chưa có kế hoạch hành động</td></tr>`;

    /* ── People chips ── */
    const personChips = (arr, cls, bg, border, textColor) =>
      Array.isArray(arr) && arr.length > 0
        ? arr.map(p=>`<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;background:${bg};color:${textColor};border:1.5px solid ${border};margin:2px 3px 2px 0;">${p}</span>`).join("") : "";
    const personsHtml   = personChips(a.persons,   "", "#f0fdf4","#86efac","#14532d");
    const reviewersHtml = personChips(a.reviewers, "", "#faf5ff","#c4b5fd","#3b0764");

    /* ── Root cause section ── */
    const RCA_LABELS: Record<string,string> = {
      "5why":"5-Why","fishbone":"Fishbone","gap":"Gap Analysis","free":"Tự do","risk":"Rủi ro"
    };
    const rcaLabel = a.rcaMethod ? (RCA_LABELS[a.rcaMethod] || a.rcaMethod) : "5-Why";
    const rcaHtml = a.rootCause ? `
      <div class="section">
        <div class="section-head">🔍 NGUYÊN NHÂN GỐC RỄ (${rcaLabel})</div>
        <div class="section-body">
          <p class="prose" style="margin-bottom:${Array.isArray(a.whys)&&a.whys.filter(w=>w).length>0?8:0}px;">${a.rootCause}</p>
          ${Array.isArray(a.whys) && a.whys.filter(w=>w).length > 0 ? `
            <div style="border-left:3px solid #fde68a;padding-left:10px;margin-top:8px;">
              ${a.whys.filter(w=>w).map((w,i) => `<div style="font-size:11.5px;color:#374151;padding:4px 0;border-bottom:1px dashed #f1f5f9;"><b style="color:#b45309;">Tại sao ${i+1}:</b> ${w}</div>`).join("")}
            </div>` : ""}
        </div>
      </div>` : "";

    /* ── Status color map ── */
    const stColorMap = { open:"#3b82f6",in_progress:"#f59e0b",done_by_owner:"#06b6d4",closed:"#22c55e" };
    const stBgMap    = { open:"#eff6ff",in_progress:"#fffbeb",done_by_owner:"#ecfeff",closed:"#f0fdf4" };
    const stBdrMap   = { open:"#bfdbfe",in_progress:"#fde68a",done_by_owner:"#a5f3fc",closed:"#bbf7d0" };

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8"/>
<title>CAPA ${a.code || a.id?.slice(0,12) || ""} — ${a.title || ""}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:12px;color:#1e293b;background:#fff;padding:24px 30px;}
  /* ── Header ── */
  .page-header{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;margin-bottom:16px;border-bottom:3px solid #1e3a8a;}
  .logo-area{display:flex;align-items:center;gap:12px;}
  .logo-box{width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#1e3a8a,#312e81);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:900;flex-shrink:0;letter-spacing:-.02em;}
  .logo-text{font-size:15px;font-weight:900;color:#1e3a8a;letter-spacing:.04em;line-height:1.2;}
  .logo-sub{font-size:10.5px;color:#64748b;margin-top:2px;font-weight:500;}
  .meta-right{text-align:right;font-size:11px;color:#64748b;line-height:1.6;}
  .code-badge{display:inline-block;padding:2px 10px;background:#1e3a8a;color:#fff;border-radius:6px;font-size:13px;font-weight:900;font-family:monospace;letter-spacing:.04em;margin-bottom:3px;}
  /* ── Title bar ── */
  .title-bar{background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 60%,#312e81 100%);color:#fff;padding:14px 18px 12px;border-radius:10px;margin-bottom:15px;position:relative;overflow:hidden;}
  .title-bar::after{content:"CAPA";position:absolute;right:12px;bottom:-10px;font-size:72px;font-weight:900;color:rgba(255,255,255,.06);pointer-events:none;line-height:1;}
  .title-bar h1{font-size:17px;font-weight:900;margin-bottom:9px;line-height:1.4;position:relative;}
  .tags{display:flex;gap:7px;flex-wrap:wrap;position:relative;}
  .tag{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:10.5px;font-weight:700;border:1px solid currentColor;white-space:nowrap;}
  /* ── Grid layout ── */
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-bottom:13px;}
  .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:13px;margin-bottom:13px;}
  /* ── Section card ── */
  .section{border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:13px;page-break-inside:avoid;}
  .section-head{background:#f8fafc;padding:8px 14px;font-size:10.5px;font-weight:800;color:#334155;letter-spacing:.06em;text-transform:uppercase;border-bottom:1.5px solid #e2e8f0;}
  .section-body{padding:12px 14px;}
  /* ── Field rows ── */
  .field-row{display:flex;gap:8px;margin-bottom:8px;align-items:baseline;}
  .field-row:last-child{margin-bottom:0;}
  .field-label{flex-shrink:0;width:155px;font-size:10.5px;font-weight:700;color:#64748b;padding-top:1px;line-height:1.4;}
  .field-val{font-size:12px;color:#0f172a;font-weight:500;line-height:1.5;flex:1;}
  /* ── Highlight stat box ── */
  .stat-box{border-radius:9px;padding:11px 13px;border:1.5px solid #e2e8f0;background:#f8fafc;}
  .stat-label{font-size:9.5px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;}
  .stat-val{font-size:15px;font-weight:900;color:#0f172a;line-height:1.2;}
  .stat-sub{font-size:10px;color:#64748b;margin-top:3px;}
  /* ── Prose ── */
  .prose{font-size:12.5px;line-height:1.8;color:#1e293b;white-space:pre-wrap;}
  /* ── Action plan table ── */
  table{width:100%;border-collapse:collapse;font-size:11px;}
  th{background:#f1f5f9;padding:7px 10px;text-align:left;font-weight:800;color:#475569;border-bottom:2px solid #e2e8f0;font-size:10px;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;}
  td{padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#1e293b;vertical-align:top;line-height:1.5;}
  tr:last-child td{border-bottom:none;}
  tbody tr:nth-child(odd) td{background:#fafbfe;}
  /* ── Signature ── */
  .sign-row{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:18px;page-break-inside:avoid;}
  .sign-box{border:1.5px solid #e2e8f0;border-radius:10px;padding:12px 14px;text-align:center;}
  .sign-title{font-size:10px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:.04em;margin-bottom:36px;}
  .sign-line{height:1px;background:#94a3b8;margin-bottom:6px;}
  .sign-name{font-size:11.5px;font-weight:700;color:#1e293b;}
  /* ── Footer ── */
  .footer{margin-top:20px;padding-top:11px;border-top:2px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#94a3b8;}
  .footer-brand{font-weight:700;color:#64748b;}
  /* ── Print ── */
  @media print{
    body{padding:10px 16px;}
    @page{margin:.8cm 1.2cm;size:A4;}
    .section{page-break-inside:avoid;}
    .sign-row{page-break-inside:avoid;}
  }
</style>
</head>
<body>

  <!-- ══ HEADER ══ -->
  <div class="page-header">
    <div class="logo-area">
      <div class="logo-box">M</div>
      <div>
        <div class="logo-text">MHChub · Hệ thống CAPA</div>
        <div class="logo-sub">Corrective Action &amp; Preventive Action — An toàn 6S</div>
      </div>
    </div>
    <div class="meta-right">
      <div><span class="code-badge">${a.code || "CAPA-????"}</span></div>
      <div>Ngày tạo: <b>${fmtDate(a.createdAt)}</b></div>
      <div>Xuất lúc: ${new Date().toLocaleString("vi-VN")}</div>
    </div>
  </div>

  <!-- ══ TITLE BAR ══ -->
  <div class="title-bar">
    <h1>${a.title || "Không có tiêu đề"}</h1>
    <div class="tags">
      <span class="tag" style="color:${stColorMap[ns]||"#3b82f6"};background:${stBgMap[ns]||"#eff6ff"};border-color:${stBdrMap[ns]||"#bfdbfe"};">${statusLabel}</span>
      ${a.priority ? `<span class="tag" style="color:${pm.color};background:${pm.bg};border-color:${pm.border};">${priorityLabel}</span>` : ""}
      ${a.capaType==="ca"?`<span class="tag" style="color:#1d4ed8;background:#dbeafe;border-color:#bfdbfe;">CA — Khắc phục</span>`:a.capaType==="pa"?`<span class="tag" style="color:#15803d;background:#dcfce7;border-color:#bbf7d0;">PA — Phòng ngừa</span>`:a.capaType==="both"?`<span class="tag" style="color:#7c3aed;background:#ede9fe;border-color:#ddd6fe;">CA + PA</span>`:""}
      ${a.topic?`<span class="tag" style="color:#7c3aed;background:#ede9fe;border-color:#ddd6fe;">${a.topic}</span>`:""}
      ${problemLabel?`<span class="tag" style="color:#0369a1;background:#e0f2fe;border-color:#bae6fd;">${problemLabel}</span>`:""}
    </div>
  </div>

  <!-- ══ KPI ROW ══ -->
  <div class="grid-3" style="margin-bottom:14px;">
    <div class="stat-box">
      <div class="stat-label">Người phụ trách</div>
      <div class="stat-val" style="font-size:13px;">${a.ownerName||"—"}</div>
      <div class="stat-sub">${a.departmentCode||""}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Hạn xử lý</div>
      <div class="stat-val" style="font-size:13px;color:${dl!==null&&dl<0?"#dc2626":"#0f172a"};">${due||"Chưa có"}</div>
      <div class="stat-sub">${dl!==null?(dl<0?`Quá hạn ${-dl} ngày`:`Còn ${dl} ngày`):"—"}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Nguồn phát sinh</div>
      <div class="stat-val" style="font-size:13px;">${srcLabel}</div>
      <div class="stat-sub">${a.sourceCode||a.occurDate||""}</div>
    </div>
  </div>

  <!-- ══ RISK MATRIX ══ -->
  ${riskHtml}

  <!-- ══ THÔNG TIN + NHÂN SỰ ══ -->
  <div class="grid-2">
    <div class="section">
      <div class="section-head">📋 Thông tin CAPA</div>
      <div class="section-body">
        ${a.locationId?`<div class="field-row"><span class="field-label">Khu vực</span><span class="field-val">${a.locationId}</span></div>`:""}
        ${a.verifyDate?`<div class="field-row"><span class="field-label">Ngày KT hiệu lực</span><span class="field-val">${a.verifyDate}</span></div>`:""}
        ${a.rcaMethod?`<div class="field-row"><span class="field-label">Phương pháp RCA</span><span class="field-val">${a.rcaMethod}</span></div>`:""}
        ${a.containment?`<div class="field-row"><span class="field-label">Biện pháp ngăn chặn</span><span class="field-val">${a.containment}</span></div>`:""}
        ${a.ncSeverity?`<div class="field-row"><span class="field-label">NC</span><span class="field-val">${a.ncSeverity}</span></div>`:""}
        ${a.verifiedByName?`<div class="field-row"><span class="field-label">Xác minh bởi</span><span class="field-val">${a.verifiedByName}</span></div>`:""}
      </div>
    </div>
    <div class="section">
      <div class="section-head">👥 Phân công nhân sự</div>
      <div class="section-body">
        ${Array.isArray(a.departments)&&a.departments.length>0?`<div class="field-row"><span class="field-label">Bộ phận thực hiện</span><span class="field-val">${a.departments.join(", ")}</span></div>`:""}
        <div class="field-row"><span class="field-label">Người thực hiện</span><span class="field-val">${personsHtml||(a.ownerName?`<span style="padding:3px 10px;border-radius:6px;background:#f0fdf4;color:#14532d;border:1.5px solid #86efac;font-weight:600;">${a.ownerName}</span>`:"—")}</span></div>
        ${reviewersHtml?`<div class="field-row"><span class="field-label">Người kiểm tra</span><span class="field-val">${reviewersHtml}</span></div>`:""}
        ${a.verifyMethod?`<div class="field-row"><span class="field-label">Phương pháp KT</span><span class="field-val">${a.verifyMethod}</span></div>`:""}
      </div>
    </div>
  </div>

  <!-- ══ MÔ TẢ VẤN ĐỀ ══ -->
  ${cleanDesc ? `
  <div class="section">
    <div class="section-head">📝 Mô tả vấn đề &amp; phân tích</div>
    <div class="section-body">
      <p class="prose">${cleanDesc}</p>
    </div>
  </div>` : ""}

  <!-- ══ NGUYÊN NHÂN GỐC RỄ ══ -->
  ${rcaHtml}

  <!-- ══ KẾ HOẠCH HÀNH ĐỘNG ══ -->
  <div class="section">
    <div class="section-head">🗂 Kế hoạch hành động</div>
    <table>
      <thead>
        <tr>
          <th style="width:28px;">#</th>
          <th>Hành động / Biện pháp</th>
          <th style="width:46px;text-align:center;">Loại</th>
          <th style="width:120px;">Người thực hiện</th>
          <th style="width:86px;">Hạn</th>
          <th style="width:52px;text-align:center;">% TĐ</th>
        </tr>
      </thead>
      <tbody>${actionPlanRows}</tbody>
    </table>
  </div>

  <!-- ══ KÝ TÊN ══ -->
  <div class="sign-row">
    <div class="sign-box">
      <div class="sign-title">Người thực hiện</div>
      <div class="sign-line"></div>
      <div class="sign-name">${a.ownerName||"________________________"}</div>
    </div>
    <div class="sign-box">
      <div class="sign-title">Người kiểm tra (EHS)</div>
      <div class="sign-line"></div>
      <div class="sign-name">${Array.isArray(a.reviewers)&&a.reviewers.length>0?a.reviewers[0]:"________________________"}</div>
    </div>
    <div class="sign-box">
      <div class="sign-title">Người phê duyệt</div>
      <div class="sign-line"></div>
      <div class="sign-name">${a.verifiedByName||"________________________"}</div>
    </div>
  </div>

  <!-- ══ FOOTER ══ -->
  <div class="footer">
    <span class="footer-brand">MHChub — Hệ thống quản lý An toàn 6S</span>
    <span>Mã CAPA: <b>${a.code||a.id?.slice(0,12)||"—"}</b></span>
    <span>Xuất ngày ${new Date().toLocaleDateString("vi-VN")}</span>
  </div>

</body>
</html>`;

    const win = window.open("", "_blank", "width=960,height=760");
    if (!win) { alert("Trình duyệt đã chặn popup. Vui lòng cho phép popup cho trang này."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 700);
  };


  /* ── PROBLEM TYPE LABELS ── */
  const PLABELS: Record<string,string> = {
    FALL:"Té ngã",HEIGHT:"Trên cao",ELECTRICAL:"Điện",FIRE:"Cháy nổ",
    CHEMICAL:"Hóa chất",VEHICLE:"Xe cộ",ERGONOMIC:"Công thái học",
    PPE:"PPE/BHLĐ",HOUSEKEEPING:"5S",PROCEDURE:"Quy trình",
    EQUIPMENT:"Thiết bị",ENVIRONMENT:"Môi trường",OTHER:"Khác",
    /* aliases from CreateCapaModal */
    MACH:"Máy móc",ELEC:"Điện",CHEM:"Hóa chất",BEHAV:"Hành vi",
    NEAR:"Cận nguy",ENV:"Môi trường","6S":"6S/Housekeeping",ENRG:"Năng lượng",
  };

  /* ── SOURCE TYPE meta ── */
  const SRC_META: Record<string,{icon:string,label:string,color:string,bg:string,border:string}> = {
    warning:    { icon:"⚡",  label:"Cảnh báo nóng",  color:"#d97706", bg:"#fffbeb", border:"#fde68a" },
    incident:   { icon:"🚨", label:"Sự cố",           color:"#dc2626", bg:"#fef2f2", border:"#fecaca" },
    inspection: { icon:"📋", label:"Kế hoạch KT",     color:"#7c3aed", bg:"#faf5ff", border:"#d8b4fe" },
    iplan:      { icon:"📋", label:"Kế hoạch KT",     color:"#7c3aed", bg:"#faf5ff", border:"#d8b4fe" },
    audit:      { icon:"🔍", label:"Audit",           color:"#0369a1", bg:"#f0f9ff", border:"#bae6fd" },
    pccc:       { icon:"🔥", label:"PCCC",            color:"#b91c1c", bg:"#fff1f2", border:"#fecdd3" },
    manual:     { icon:"✏️", label:"Thủ công",        color:"#475569", bg:"#f8fafc", border:"#e2e8f0" },
  };
  const srcMeta = SRC_META[action.sourceType] || SRC_META.manual;

  return createPortal(
    <>
      {lightboxUrl && (
        <div onMouseDown={() => setLightboxUrl("")} style={{ position:"fixed", inset:0,
          background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center",
          justifyContent:"center", zIndex:1800 }}>
          <img src={lightboxUrl} onMouseDown={e => e.stopPropagation()} alt="preview"
            style={{ maxWidth:"92vw", maxHeight:"88vh", borderRadius:12, boxShadow:"0 8px 40px rgba(0,0,0,0.6)" }} />
          <button onMouseDown={() => setLightboxUrl("")} style={{ position:"absolute", top:20, right:24,
            background:"rgba(255,255,255,0.15)", border:"none", color:"#fff",
            borderRadius:"50%", width:40, height:40, fontSize:20, cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>
      )}

      <div role="presentation" onMouseDown={onClose}
        style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)",
          display:"flex", alignItems:"center", justifyContent:"center", zIndex:1700,
          fontFamily:"'Inter','Segoe UI',system-ui,sans-serif" }}>

        <div role="dialog" aria-modal="true" aria-label="Chi tiết CAPA"
          onMouseDown={e => e.stopPropagation()}
          style={{ width:1120, maxWidth:"calc(100vw - 20px)", height:900,
            maxHeight:"calc(100vh - 20px)", background:"#f0f4fa", borderRadius:20,
            overflow:"hidden", boxShadow:"0 24px 80px rgba(0,0,0,0.22)",
            display:"flex", flexDirection:"column" }}>

          {/* ══════ HEADER — white, đồng bộ với Create/Edit CAPA ══════ */}
          <div style={{ background:"#fff", padding:"13px 24px 0", flexShrink:0, borderBottom:"1px solid transparent" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:11 }}>
              {/* Logo icon — SVG shield-check */}
              <div style={{ width:38, height:38, borderRadius:11,
                background:"linear-gradient(135deg,#1e3a8a,#1d4ed8)",
                display:"flex", alignItems:"center", justifyContent:"center",
                color:"#fff", flexShrink:0,
                boxShadow:"0 4px 12px rgba(30,58,138,.28)" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <path d="M9 12l2 2 4-4"/>
                </svg>
              </div>

              {/* Title + code + status inline */}
              <div style={{ flex:1, minWidth:0, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <div style={{ fontSize:16, fontWeight:800, color:"#0f172a", letterSpacing:"-0.01em",
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", lineHeight:1.35,
                  flex:1, minWidth:0 }}>
                  {action.title || "Không có tiêu đề"}
                </div>
                <code style={{ fontSize:11, fontWeight:900, color:"#7c3aed",
                  background:"#faf5ff", border:"1px solid #e9d5ff",
                  padding:"1px 7px", borderRadius:4, letterSpacing:"0.04em", flexShrink:0 }}>
                  {action.code || action.id?.slice(0,12) || "CAPA"}
                </code>
                <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, flexShrink:0,
                  background:st.bg, color:st.color, border:`1px solid ${st.color}44`, whiteSpace:"nowrap" }}>
                  ● {st.label}
                </span>
              </div>

              {/* Action buttons */}
              <button onClick={printCapaToPdf}
                style={{ display:"flex", alignItems:"center", gap:4, padding:"5px 12px", borderRadius:7, cursor:"pointer",
                  background:"#f1f5f9", border:"1.5px solid #e2e8f0",
                  fontSize:12, fontWeight:700, color:"#475569", whiteSpace:"nowrap", flexShrink:0, transition:"all .12s" }}
                onMouseEnter={e=>(e.currentTarget.style.background="#e0f2fe",e.currentTarget.style.color="#0369a1",e.currentTarget.style.borderColor="#bae6fd")}
                onMouseLeave={e=>(e.currentTarget.style.background="#f1f5f9",e.currentTarget.style.color="#475569",e.currentTarget.style.borderColor="#e2e8f0")}>
                🖨️ PDF
              </button>
              {onEdit && isEhsAdmin && (
                <button onClick={() => onEdit(action)}
                  style={{ display:"flex", alignItems:"center", gap:4, padding:"5px 12px", borderRadius:7, cursor:"pointer",
                    background:"#f1f5f9", border:"1.5px solid #e2e8f0",
                    fontSize:12, fontWeight:700, color:"#475569", whiteSpace:"nowrap", flexShrink:0, transition:"all .12s" }}
                  onMouseEnter={e=>(e.currentTarget.style.background="#faf5ff",e.currentTarget.style.color="#7c3aed",e.currentTarget.style.borderColor="#d8b4fe")}
                  onMouseLeave={e=>(e.currentTarget.style.background="#f1f5f9",e.currentTarget.style.color="#475569",e.currentTarget.style.borderColor="#e2e8f0")}>
                  ✏️ Sửa
                </button>
              )}
              <button onClick={onClose}
                style={{ width:32, height:32, borderRadius:8, cursor:"pointer", flexShrink:0,
                  background:"#f1f5f9", border:"1.5px solid #e2e8f0",
                  fontSize:14, display:"flex", alignItems:"center", justifyContent:"center",
                  color:"#64748b", transition:"all .12s" }}
                onMouseEnter={e=>(e.currentTarget.style.background="#fee2e2",e.currentTarget.style.color="#dc2626")}
                onMouseLeave={e=>(e.currentTarget.style.background="#f1f5f9",e.currentTarget.style.color="#64748b")}>✕</button>
            </div>

          </div>

          {/* ══════ TAB BAR ══════ */}
          <div style={{ display:"flex", gap:0, background:"#fff", borderBottom:"2px solid #e8edf5", flexShrink:0,
            padding:"0 20px", overflowX:"auto", scrollbarWidth:"none" }}>
            {TABS.map((t, i) => (
              <button key={i} onClick={() => setActiveTab(i)}
                style={{ padding:"11px 18px", border:"none", cursor:"pointer",
                  fontSize:13.5, fontWeight: activeTab===i ? 800 : 500,
                  color: activeTab===i ? "#1e3a8a" : "#64748b",
                  borderBottom: activeTab===i ? "3px solid #1e3a8a" : "3px solid transparent",
                  marginBottom:-2, transition:"all .15s", whiteSpace:"nowrap",
                  background:"transparent", letterSpacing:"0.01em" }}>
                {t}
                {i === 2 && evidenceFiles.length > 0 && (
                  <span style={{ marginLeft:6, fontSize:11, fontWeight:800, padding:"1px 7px", borderRadius:10,
                    background: activeTab===2 ? "#1e3a8a" : "#e2e8f0",
                    color: activeTab===2 ? "#fff" : "#64748b" }}>{evidenceFiles.length}</span>
                )}
                {i === 3 && commentsLoaded && comments.length > 0 && (
                  <span style={{ marginLeft:6, fontSize:11, fontWeight:800, padding:"1px 7px", borderRadius:10,
                    background: activeTab===3 ? "#1e3a8a" : "#e2e8f0",
                    color: activeTab===3 ? "#fff" : "#64748b" }}>{comments.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* ══════ TAB BODY ══════ */}
          <div style={{ flex:1, overflowY:"auto", padding:"20px 24px", background:"#f0f4fa" }}>

            {/* ── Rejection note banner ── */}
            {ns === "rejected" && action.rejectionNote && (
              <div style={{ padding:"10px 16px", borderRadius:10, background:"#fef2f2",
                border:"1.5px solid #fca5a5", display:"flex", alignItems:"center", gap:10,
                marginBottom:16 }}>
                <span style={{ fontSize:20, flexShrink:0 }}>❌</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:"#dc2626" }}>CAPA bị từ chối</div>
                  <div style={{ fontSize:12.5, color:"#991b1b" }}>Lý do: {action.rejectionNote}</div>
                </div>
              </div>
            )}

            {/* ── Overdue banner (always visible) ── */}
            {dl !== null && dl < 0 && !["closed","verified","draft","rejected"].includes(action.status) && (
              <div style={{ padding:"10px 16px", borderRadius:10, background:"#fef2f2",
                border:"1.5px solid #fca5a5", display:"flex", alignItems:"center", gap:10,
                marginBottom:16 }}>
                <span style={{ fontSize:20, flexShrink:0 }}>🔴</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:"#dc2626" }}>CAPA đã quá hạn {-dl} ngày!</div>
                  <div style={{ fontSize:12.5, color:"#991b1b" }}>Hạn xử lý: {due} — Cần xử lý và nộp bằng chứng ngay</div>
                </div>
                <span style={{ fontSize:12, fontWeight:700, padding:"4px 10px", borderRadius:8, background:"#dc2626", color:"#fff", flexShrink:0 }}>Quá hạn {-dl} ngày</span>
              </div>
            )}

            {/* ════ TAB 0: TỔNG QUAN ════ */}
            {activeTab === 0 && (() => {
              /* helpers */
              const PLABELS_FULL: Record<string,string> = {
                FALL:"Té ngã / Ngã cao",HEIGHT:"Làm việc trên cao",ELECTRICAL:"Điện",
                FIRE:"Cháy nổ",CHEMICAL:"Hóa chất",VEHICLE:"Phương tiện / Xe cộ",
                ERGONOMIC:"Công thái học",PPE:"PPE / Trang bị BHLĐ",HOUSEKEEPING:"5S / Vệ sinh",
                PROCEDURE:"Quy trình / Thủ tục",EQUIPMENT:"Thiết bị / Máy móc",ENVIRONMENT:"Môi trường",OTHER:"Khác",
                /* aliases from CreateCapaModal */
                MACH:"Máy móc / Thiết bị",ELEC:"Điện",CHEM:"Hóa chất",
                BEHAV:"Hành vi con người",NEAR:"Cận nguy",ENV:"Môi trường",
                "6S":"6S / Housekeeping",ENRG:"Năng lượng",
              };
              const pLabel = action.problemType ? (PLABELS_FULL[action.problemType] || action.problemType) : null;
              const rawDesc0 = action.description || "";
              const cDesc0 = rawDesc0
                .replace(/\[Điểm rủi ro ban đầu\][^\n]*/g,"")
                .replace(/\[Điểm rủi ro sau KP\][^\n]*/g,"")
                .replace(/\[Ảnh \/ Tài liệu\][^\n]*/g,"")
                .replace(/\n{3,}/g,"\n\n")
                .trim();
              const doneAP = Array.isArray(action.actionPlan) ? action.actionPlan.filter((p:any)=>(Number(p.progress)||0)>=100).length : 0;
              const totalAP = Array.isArray(action.actionPlan) ? action.actionPlan.length : 0;
              const avgProg0 = totalAP > 0
                ? Math.round(action.actionPlan.reduce((s:number,p:any)=>s+Math.min(100,Number(p.progress)||0),0)/totalAP)
                : -1;
              const stIdx0 = STATUS_FLOW.findIndex(s => s.id === ns);
              const avCol = (name:string) => {
                const c=["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ec4899","#06b6d4","#ef4444","#84cc16"];
                let h=0; for(const ch of (name||"?")) h=(h*31+ch.charCodeAt(0))%c.length; return c[h];
              };
              const initials2 = (name:string) =>
                (name||"?").split(/\s+/).map((w:string)=>w[0]||"").join("").slice(0,2).toUpperCase();
              return (
                <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:12, alignItems:"start" }}>

                  {/* ═══════ CỘT TRÁI 2/3: NỘI DUNG VẤN ĐỀ ═══════ */}
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

                    {/* ── PROBLEM CARD ── */}
                    <div style={{ borderRadius:12, overflow:"hidden", background:"#fff",
                      border:"1px solid #e2e8f0",
                      boxShadow:"0 1px 8px rgba(0,0,0,.06)" }}>

                      {/* Top accent line */}
                      <div style={{ height:3, background:"linear-gradient(90deg,#3b82f6,#6366f1)", flexShrink:0 }} />

                      {/* Header row: label left + badges right */}
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                        gap:8, padding:"12px 16px 0", flexWrap:"wrap" }}>
                        <span style={{ fontSize:11, fontWeight:800, color:"#475569", letterSpacing:"0.08em",
                          textTransform:"uppercase", flexShrink:0 }}>
                          MÔ TẢ VẤN ĐỀ
                        </span>
                        {/* Badges — same pill style as header, with tooltips */}
                        <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap", justifyContent:"flex-end" }}>
                        {/* Source */}
                        <span title={`Nguồn phát sinh CAPA: ${srcMeta.label}${action.sourceCode ? ` (mã #${action.sourceCode})` : ""}`}
                          style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, flexShrink:0,
                            background:srcMeta.bg, color:srcMeta.color, border:`1px solid ${srcMeta.border}`,
                            whiteSpace:"nowrap", cursor:"default" }}>
                          {srcMeta.icon} {srcMeta.label}{action.sourceCode ? ` #${action.sourceCode}` : ""}
                        </span>
                        {/* Priority */}
                        <span title={`Mức độ ưu tiên: ${pm.label}`}
                          style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, flexShrink:0,
                            background:pm.bg, color:pm.color, border:`1px solid ${pm.border}`,
                            whiteSpace:"nowrap", cursor:"default" }}>
                          {pm.label}
                        </span>
                        {/* CA/PA type */}
                        {action.capaType && (
                          <span title={action.capaType==="ca"?"CA — Corrective Action: hành động khắc phục sự cố đã xảy ra":action.capaType==="pa"?"PA — Preventive Action: hành động ngăn ngừa tái phát":"CA+PA — Kết hợp khắc phục và phòng ngừa"}
                            style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, flexShrink:0,
                              background:action.capaType==="ca"?"#dbeafe":action.capaType==="pa"?"#dcfce7":"#ede9fe",
                              color:action.capaType==="ca"?"#1d4ed8":action.capaType==="pa"?"#15803d":"#7c3aed",
                              border:`1px solid ${action.capaType==="ca"?"#bfdbfe":action.capaType==="pa"?"#bbf7d0":"#ddd6fe"}`,
                              whiteSpace:"nowrap", cursor:"default" }}>
                            {action.capaType==="ca"?"CA":action.capaType==="pa"?"PA":"CA+PA"}
                          </span>
                        )}
                        {/* Topic */}
                        {action.topic && (
                          <span title={`Chủ đề / lĩnh vực: ${action.topic}`}
                            style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, flexShrink:0,
                              background:"#faf5ff", color:"#7c3aed", border:"1px solid #e9d5ff",
                              whiteSpace:"nowrap", cursor:"default" }}>
                            {action.topic}
                          </span>
                        )}
                        {/* Problem type */}
                        {pLabel && (
                          <span title={`Loại vấn đề an toàn: ${pLabel}`}
                            style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, flexShrink:0,
                              background:"#f0f9ff", color:"#0369a1", border:"1px solid #bae6fd",
                              whiteSpace:"nowrap", cursor:"default" }}>
                            {pLabel}
                          </span>
                        )}
                        </div>{/* end badges inner div */}
                      </div>{/* end header row */}

                      {/* Description */}
                      <div style={{ padding:"12px 16px 14px" }}>
                        <div style={{ fontSize:14, fontWeight:500, color:"#1e293b",
                          lineHeight:1.8, whiteSpace:"pre-wrap",
                          minHeight:80, overflowY:"auto",
                          background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8,
                          padding:"10px 13px", resize:"vertical", overflow:"auto" }}>
                          {cDesc0 || (
                            <span style={{ color:"#94a3b8", fontStyle:"italic", fontWeight:400 }}>
                              Chưa có mô tả vấn đề
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Info strip — clean, uniform */}
                      <div style={{ borderTop:"1px solid #f1f5f9", background:"#f8fafc",
                        display:"flex", flexWrap:"wrap" }}>
                        {([
                          { icon:"👤", label:"Phụ trách", val:action.ownerName||"—",
                            valColor:"#1e40af" },
                          { icon:"🏢", label:"Bộ phận", val:action.departmentCode||"—",
                            valColor:"#0f172a" },
                          ...(action.sourceArea ? [{ icon:"📍", label:"Khu vực", val:action.sourceArea,
                            valColor:"#0f172a" }] : []),
                          ...(action.occurDate ? [{ icon:"📅", label:"Ngày xảy ra", val:action.occurDate,
                            valColor:"#0f172a" }] : []),
                          { icon:"⏰", label:"Hạn xử lý",
                            val: ["closed","verified"].includes(action.status) ? "Đã đóng ✓"
                              : due ? `${due}${dl!==null?(dl<0?` · Quá ${-dl}n`:dl<7?` · Còn ${dl}n`:""):""}` : "Chưa có",
                            valColor: ["closed","verified"].includes(action.status)?"#15803d"
                              : dl!==null&&dl<0?"#dc2626":dl!==null&&dl<7?"#d97706":"#0f172a" },
                        ] as any[]).map((item:any, i:number, arr:any[]) => (
                          <div key={i} style={{ display:"flex", flexDirection:"column", gap:1,
                            padding:"9px 14px",
                            borderRight: i < arr.length-1 ? "1px solid #e2e8f0" : "none" }}>
                            <div style={{ fontSize:9.5, fontWeight:700, color:"#94a3b8",
                              letterSpacing:"0.07em", textTransform:"uppercase" }}>
                              {item.icon} {item.label}
                            </div>
                            <div style={{ fontSize:12.5, fontWeight:700, color:item.valColor,
                              whiteSpace:"nowrap", marginTop:1 }}>{item.val}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── NGUYÊN NHÂN BAN ĐẦU ── */}
                    {action.initialCause && (
                      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0",
                        borderLeft:"4px solid #d97706", boxShadow:"0 1px 6px rgba(0,0,0,.05)", overflow:"hidden" }}>
                        <div style={{ padding:"9px 14px", background:"#fffbeb", borderBottom:"1px solid #fde68a",
                          display:"flex", alignItems:"center", gap:7 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                          </svg>
                          <span style={{ fontSize:11, fontWeight:800, color:"#92400e", letterSpacing:"0.07em" }}>
                            NGUYÊN NHÂN BAN ĐẦU — NHẬN ĐỊNH
                          </span>
                        </div>
                        <div style={{ padding:"12px 14px 14px" }}>
                          <div style={{ fontSize:13.5, fontWeight:500, color:"#1e293b",
                            lineHeight:1.78, whiteSpace:"pre-wrap",
                            minHeight:72, overflowY:"auto",
                            background:"#fffdf5", border:"1px solid #fde68a", borderRadius:8,
                            padding:"9px 13px", resize:"vertical", overflow:"auto" }}>
                            {action.initialCause}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── BIỆN PHÁP NGĂN CHẶN ── */}
                    {action.containment && (
                      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0",
                        borderLeft:"4px solid #ea580c", boxShadow:"0 1px 6px rgba(0,0,0,.05)", overflow:"hidden" }}>
                        <div style={{ padding:"9px 14px", background:"#fff7ed", borderBottom:"1px solid #fed7aa",
                          display:"flex", alignItems:"center", gap:7 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                          </svg>
                          <span style={{ fontSize:11, fontWeight:800, color:"#9a3412", letterSpacing:"0.07em" }}>
                            BIỆN PHÁP NGĂN CHẶN TỨC THỜI
                          </span>
                        </div>
                        <div style={{ padding:"13px 16px", fontSize:13.5, fontWeight:500,
                          color:"#1e293b", lineHeight:1.78 }}>
                          {action.containment}
                        </div>
                      </div>
                    )}

                    {/* ── NHÂN SỰ ── */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                      {/* Owner */}
                      <div style={{ background:"#fff", borderRadius:13, border:"1px solid #e2e8f0",
                        padding:"12px 14px", display:"flex", alignItems:"center", gap:12,
                        boxShadow:"0 1px 6px rgba(0,0,0,.04)" }}>
                        <div style={{ width:44, height:44, borderRadius:"50%", flexShrink:0,
                          background:`linear-gradient(135deg,${avCol(action.ownerName||"?")}cc,${avCol(action.ownerName||"?")})`,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize:15, fontWeight:900, color:"#fff",
                          boxShadow:`0 3px 10px ${avCol(action.ownerName||"?")}44` }}>
                          {initials2(action.ownerName||"?")}
                        </div>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:"#3b82f6", textTransform:"uppercase",
                            letterSpacing:"0.08em", marginBottom:3 }}>Phụ trách</div>
                          <div style={{ fontSize:13.5, fontWeight:800, color:"#0f172a",
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{action.ownerName||"—"}</div>
                          {action.departmentCode && (
                            <div style={{ fontSize:11.5, color:"#64748b", fontWeight:600, marginTop:2 }}>{action.departmentCode}</div>
                          )}
                        </div>
                      </div>
                      {/* Persons / Reviewers */}
                      <div style={{ background:"#fff", borderRadius:13, border:"1px solid #e2e8f0",
                        padding:"12px 14px", boxShadow:"0 1px 6px rgba(0,0,0,.04)" }}>
                        <div style={{ fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase",
                          letterSpacing:"0.08em", marginBottom:8 }}>Nhân sự tham gia</div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                          {(action.persons?.length ? action.persons : []).map((p:string, i:number) => (
                            <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:4,
                              padding:"3px 9px", borderRadius:8,
                              background:"#f0fdf4", color:"#14532d", border:"1.5px solid #86efac",
                              fontSize:12, fontWeight:700 }}>
                              <span style={{ width:18, height:18, borderRadius:"50%",
                                background:avCol(p), display:"inline-flex", alignItems:"center",
                                justifyContent:"center", fontSize:8, fontWeight:900, color:"#fff" }}>{initials2(p)}</span>
                              {p}
                            </span>
                          ))}
                          {(action.reviewers||[]).map((p:string, i:number) => (
                            <span key={"r"+i} style={{ display:"inline-flex", alignItems:"center", gap:4,
                              padding:"3px 9px", borderRadius:8,
                              background:"#faf5ff", color:"#6d28d9", border:"1.5px solid #c4b5fd",
                              fontSize:12, fontWeight:700 }}>
                              <span style={{ width:18, height:18, borderRadius:"50%",
                                background:avCol(p), display:"inline-flex", alignItems:"center",
                                justifyContent:"center", fontSize:8, fontWeight:900, color:"#fff" }}>{initials2(p)}</span>
                              {p}
                            </span>
                          ))}
                          {(!action.persons?.length && !action.reviewers?.length) && (
                            <span style={{ fontSize:12, color:"#94a3b8", fontStyle:"italic" }}>Chưa phân công</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bộ phận phối hợp */}
                    {action.departments?.length > 0 && (
                      <div style={{ background:"#fff", borderRadius:13, border:"1px solid #e2e8f0",
                        padding:"12px 14px", boxShadow:"0 1px 6px rgba(0,0,0,.04)" }}>
                        <div style={{ fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase",
                          letterSpacing:"0.08em", marginBottom:8 }}>Bộ phận phối hợp</div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                          {action.departments.map((d:string,i:number) => (
                            <span key={i} style={{ padding:"4px 12px", borderRadius:8,
                              background:"#e0f2fe", color:"#0369a1", border:"1.5px solid #bae6fd",
                              fontSize:12, fontWeight:700 }}>{d}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Ghi chú tiến độ */}
                    <div style={{ background:"#fff", borderRadius:13, border:"1px solid #e8edf5", overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                      <div style={{ padding:"10px 16px", background:"#f8fafc", borderBottom:"1px solid #e8edf5",
                        fontSize:12, fontWeight:800, color:"#334155", letterSpacing:"0.06em" }}>GHI CHÚ / CẬP NHẬT TIẾN ĐỘ</div>
                      <div style={{ padding:"14px 16px" }}>
                        {noteSent && (
                          <div style={{ marginBottom:10, padding:"8px 12px", borderRadius:8,
                            background:"#f0fdf4", border:"1px solid #bbf7d0", fontSize:13, color:"#15803d", fontWeight:600 }}>
                            ✅ Đã ghi nhận
                          </div>
                        )}
                        <textarea rows={3} value={note} onChange={e => setNote(e.target.value)}
                          placeholder="Nhập cập nhật tiến độ, vướng mắc, hoặc cần hỗ trợ..."
                          style={{ width:"100%", padding:"10px 12px", fontSize:14, lineHeight:1.65,
                            border:"1.5px solid #e2e8f0", borderRadius:9, outline:"none",
                            fontFamily:"inherit", resize:"none", boxSizing:"border-box", color:"#1e293b",
                            background:"#f8fafc", transition:"border-color .15s" }}
                          onFocus={e => e.target.style.borderColor="#3b82f6"}
                          onBlur={e => e.target.style.borderColor="#e2e8f0"} />
                        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
                          <button disabled={!note.trim() || noteLoading} onClick={addNote}
                            style={{ padding:"8px 22px", borderRadius:8, cursor:note.trim()?"pointer":"not-allowed", border:"none",
                              background:note.trim()?"linear-gradient(135deg,#1e40af,#2563eb)":"#e2e8f0",
                              fontSize:13, fontWeight:700, color:note.trim()?"#fff":"#94a3b8" }}>
                            {noteLoading ? "Đang gửi..." : "💾 Gửi ghi chú"}
                          </button>
                        </div>
                      </div>
                    </div>

                  </div>{/* end LEFT */}

                  {/* ═══════ CỘT PHẢI 1/3: TIẾN TRÌNH ═══════ */}
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

                    {/* Tiến trình xử lý – vertical SVG timeline */}
                    <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e2e8f0",
                      overflow:"hidden", boxShadow:"0 1px 8px rgba(0,0,0,.04)" }}>
                      <div style={{ padding:"10px 16px", background:"linear-gradient(135deg,#f8fafc,#f1f5f9)",
                        borderBottom:"1px solid #e8edf5", display:"flex", alignItems:"center", gap:8 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                        </svg>
                        <span style={{ fontSize:11.5, fontWeight:800, color:"#334155", letterSpacing:"0.07em" }}>TIẾN TRÌNH XỬ LÝ</span>
                      </div>
                      <div style={{ padding:"16px 14px 10px" }}>
                        {(() => {
                          const allClosed = ns === "closed" || ns === "verified";
                          const visCurrentStep = ({draft:0, rejected:0, open:1, in_progress:2, done_by_owner:3} as Record<string,number>)[ns] ?? 1;
                          type VisStep = { label:string; sub:string; icon:(c:string)=>JSX.Element };
                          const VIS_STEPS: VisStep[] = [
                            { label:"Tạo CAPA", sub:"Ghi nhận vấn đề",
                              icon:(c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg> },
                            { label:"Nhận xử lý", sub:"Bắt đầu khắc phục",
                              icon:(c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg> },
                            { label:"Nộp bằng chứng", sub:"Hoàn thành & nộp KQ",
                              icon:(c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> },
                            { label:"EHS xác minh", sub:"Kiểm tra hiệu lực",
                              icon:(c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> },
                            { label:"Đã đóng", sub:"CAPA hoàn tất",
                              icon:(c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg> },
                          ];
                          return VIS_STEPS.map((step, i) => {
                            const isDone   = allClosed || i < visCurrentStep;
                            const isActive = !allClosed && i === visCurrentStep;
                            const dotBg    = isDone ? "linear-gradient(135deg,#16a34a,#22c55e)"
                                           : isActive ? "linear-gradient(135deg,#2563eb,#3b82f6)" : "#f1f5f9";
                            const dotBorder = isDone ? "#16a34a" : isActive ? "#2563eb" : "#d1d5db";
                            const cardBg    = isDone ? "#f0fdf4" : isActive ? "#eff6ff" : "#f9fafb";
                            const cardBorder = isDone ? "#86efac" : isActive ? "#bfdbfe" : "#e5e7eb";
                            const labelColor = isDone ? "#15803d" : isActive ? "#1d4ed8" : "#9ca3af";
                            const subColor   = isDone ? "#4ade80" : isActive ? "#60a5fa" : "#cbd5e1";
                            return (
                              <div key={i} style={{ display:"flex", gap:0 }}>
                                {/* connector column */}
                                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:30, flexShrink:0 }}>
                                  {i > 0 && (
                                    <div style={{ width:2, height:10, background:i <= visCurrentStep || allClosed ? "#22c55e" : "#e5e7eb", borderRadius:1 }} />
                                  )}
                                  <div style={{ width:28, height:28, borderRadius:"50%",
                                    background:dotBg, border:`2px solid ${dotBorder}`,
                                    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                                    boxShadow: isActive ? "0 0 0 4px #dbeafe, 0 2px 8px rgba(37,99,235,.3)"
                                             : isDone ? "0 2px 6px rgba(22,163,74,.2)" : "none" }}>
                                    {isDone
                                      ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                      : step.icon(isActive ? "#fff" : "#b0b8c9")
                                    }
                                  </div>
                                  {i < VIS_STEPS.length - 1 && (
                                    <div style={{ width:2, flex:1, minHeight:16,
                                      background:(i < visCurrentStep || allClosed) ? "linear-gradient(#22c55e,#d1fae5)" : "#e5e7eb",
                                      borderRadius:1 }} />
                                  )}
                                </div>
                                {/* card */}
                                <div style={{ flex:1, paddingLeft:10, paddingBottom: i < VIS_STEPS.length-1 ? 6 : 0,
                                  paddingTop: i > 0 ? 10 : 0 }}>
                                  <div style={{ background:cardBg, border:`1px solid ${cardBorder}`,
                                    borderRadius:10, padding:"7px 11px" }}>
                                    <div style={{ fontSize:12.5, fontWeight:isActive?800:isDone?700:500,
                                      color:labelColor, lineHeight:1.2 }}>{step.label}</div>
                                    <div style={{ fontSize:11, color:subColor, marginTop:2, fontWeight:500 }}>{step.sub}</div>
                                    {isActive && (
                                      <div style={{ display:"inline-flex", alignItems:"center", gap:5, marginTop:5,
                                        padding:"2px 9px", borderRadius:20, background:"#dbeafe", border:"1px solid #bfdbfe" }}>
                                        <div style={{ width:6, height:6, borderRadius:"50%", background:"#2563eb",
                                          animation:"pulse 1.5s ease-in-out infinite" }} />
                                        <span style={{ fontSize:10.5, fontWeight:700, color:"#1d4ed8" }}>Đang ở bước này</span>
                                      </div>
                                    )}
                                    {isDone && i === 0 && action.createdAt && (
                                      <div style={{ fontSize:10.5, color:"#86efac", marginTop:3 }}>{fmtDate(action.createdAt)}</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                      {/* footer: hạn xử lý */}
                      <div style={{ padding:"9px 16px", borderTop:"1px solid #f1f5f9", background:"#fafbfc",
                        display:"flex", alignItems:"center", gap:7 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span style={{ fontSize:11, color:"#64748b", fontWeight:600 }}>Hạn xử lý:</span>
                        <span style={{ fontSize:12, fontWeight:800,
                          color:["closed","verified"].includes(action.status)?"#22c55e":dl!==null&&dl<0?"#dc2626":dl!==null&&dl<7?"#d97706":"#1e293b" }}>
                          {["closed","verified"].includes(action.status)
                            ? "Đã đóng"
                            : due ? `${due}${dl!==null?(dl<0?` · Quá ${-dl}ngày`:dl<7?` · Còn ${dl}n`:""):""}` : "Chưa có hạn"}
                        </span>
                      </div>
                    </div>

                    {/* Kế hoạch tiến độ */}
                    <div style={{ background:"#fff", borderRadius:13, border:"1px solid #e2e8f0",
                      padding:"12px 14px", boxShadow:"0 1px 6px rgba(0,0,0,.04)" }}>
                      <div style={{ fontSize:10.5, fontWeight:700, color:"#64748b", textTransform:"uppercase",
                        letterSpacing:"0.08em", marginBottom:10 }}>Kế hoạch hành động</div>
                      {totalAP > 0 ? (
                        <>
                          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                            <svg width="52" height="52" style={{ flexShrink:0 }}>
                              <circle cx="26" cy="26" r="20" fill="none" stroke="#e2e8f0" strokeWidth="5"/>
                              <circle cx="26" cy="26" r="20" fill="none"
                                stroke={avgProg0===100?"#22c55e":avgProg0>=50?"#3b82f6":"#f59e0b"}
                                strokeWidth="5" strokeLinecap="round"
                                strokeDasharray={`${2*Math.PI*20*avgProg0/100} ${2*Math.PI*20*(1-avgProg0/100)}`}
                                strokeDashoffset={2*Math.PI*20*0.25}
                                transform="rotate(-90 26 26)"/>
                              <text x="26" y="31" textAnchor="middle"
                                style={{ fontSize:11, fontWeight:900, fill:avgProg0===100?"#15803d":avgProg0>=50?"#1d4ed8":"#d97706" }}>
                                {avgProg0}%
                              </text>
                            </svg>
                            <div>
                              <div style={{ fontSize:16, fontWeight:900, color:"#0f172a" }}>{doneAP}/{totalAP}</div>
                              <div style={{ fontSize:11, color:"#64748b" }}>hành động xong</div>
                              <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>
                                {(["CA","PA","Both"] as const).map(type => {
                                  const cnt = Array.isArray(action.actionPlan) ? action.actionPlan.filter((p:any)=>p.type===type).length : 0;
                                  if (!cnt) return null;
                                  const meta = type==="CA"?{c:"#1d4ed8",bg:"#dbeafe",bd:"#bfdbfe"}
                                             :type==="PA"?{c:"#15803d",bg:"#dcfce7",bd:"#86efac"}
                                                         :{c:"#7c3aed",bg:"#ede9fe",bd:"#c4b5fd"};
                                  return (
                                    <span key={type} style={{ fontSize:10, fontWeight:700, padding:"2px 7px",
                                      borderRadius:12, background:meta.bg, color:meta.c, border:`1px solid ${meta.bd}` }}>
                                      {type}×{cnt}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                            {(action.actionPlan||[]).map((item:any, idx:number) => {
                              const pct = Math.min(100, Number(item.progress)||0);
                              const tc = item.type==="CA"?{c:"#1d4ed8",bg:"#dbeafe",bd:"#bfdbfe"}
                                        :item.type==="PA"?{c:"#15803d",bg:"#dcfce7",bd:"#86efac"}
                                                         :{c:"#7c3aed",bg:"#ede9fe",bd:"#c4b5fd"};
                              const barC = pct===100?"#22c55e":pct>=50?"#3b82f6":"#f59e0b";
                              return (
                                <div key={idx} style={{ padding:"6px 9px", borderRadius:8,
                                  background:idx%2===0?"#f8fafc":"#fff", border:"1px solid #f1f5f9" }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:3 }}>
                                    {item.type && (
                                      <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:6,
                                        background:tc.bg, color:tc.c, border:`1px solid ${tc.bd}`, flexShrink:0 }}>{item.type}</span>
                                    )}
                                    <div style={{ fontSize:11.5, color:"#1e293b", lineHeight:1.3, flex:1,
                                      overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>{item.action||"—"}</div>
                                    <span style={{ fontSize:11, fontWeight:800, color:barC, flexShrink:0 }}>{pct}%</span>
                                  </div>
                                  <div style={{ height:3, borderRadius:2, background:"#e2e8f0", overflow:"hidden" }}>
                                    <div style={{ height:"100%", width:`${pct}%`, borderRadius:2, background:barC }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize:13, color:"#94a3b8", fontStyle:"italic" }}>Chưa có kế hoạch</div>
                      )}
                    </div>

                    {/* Hoạt động gần nhất */}
                    {logsLoaded && logs.length > 0 && (
                      <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e2e8f0",
                        overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,.04)" }}>
                        <div style={{ padding:"9px 16px", background:"linear-gradient(135deg,#f8fafc,#f1f5f9)",
                          borderBottom:"1px solid #e8edf5", display:"flex", alignItems:"center", gap:10 }}>
                          <span style={{ fontSize:11.5, fontWeight:800, color:"#334155", letterSpacing:"0.07em", flex:1 }}>HOẠT ĐỘNG GẦN NHẤT</span>
                          <button onClick={() => setActiveTab(3)}
                            style={{ fontSize:11, fontWeight:700, color:"#3b82f6", background:"none",
                              border:"1px solid #bfdbfe", borderRadius:6, padding:"2px 10px", cursor:"pointer" }}>
                            Xem tất cả →
                          </button>
                        </div>
                        <div style={{ padding:"6px 12px 8px" }}>
                          {logs.slice(0,3).map((l:any, i:number) => (
                            <div key={i} style={{ display:"flex", alignItems:"center", gap:10,
                              padding:"7px 6px", borderBottom:i<Math.min(2,logs.length-1)?"1px dashed #f1f5f9":"none" }}>
                              <span style={{ fontSize:16, flexShrink:0 }}>{LOG_ICONS[l.action] || "📌"}</span>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:11.5, color:"#1e293b", fontWeight:600,
                                  overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>
                                  <span style={{ fontWeight:800, color:"#1d4ed8" }}>{l.createdByName || l.user || "—"}</span>
                                  {" · "}{l.note || l.action?.replace(/-/g," ") || ""}
                                </div>
                              </div>
                              <div style={{ fontSize:10.5, color:"#94a3b8", fontWeight:600, flexShrink:0, whiteSpace:"nowrap" }}>{fmtDate(l.createdAt)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>{/* end RIGHT */}

                </div>
              );
            })()}

            {/* ════ TAB 1: PHÂN TÍCH & KẾ HOẠCH ════ */}
            {activeTab === 1 && (() => {
              const AP_COLORS = {
                CA:   { label:"CA",    color:"#1d4ed8", bg:"#dbeafe", border:"#bfdbfe" },
                PA:   { label:"PA",    color:"#15803d", bg:"#dcfce7", border:"#bbf7d0" },
                Both: { label:"CA+PA", color:"#7c3aed", bg:"#ede9fe", border:"#ddd6fe" },
              };
              const cleanDesc = (action.description || "")
                .replace(/\[Điểm rủi ro ban đầu\][^\n]*/g,"")
                .replace(/\[Điểm rủi ro sau KP\][^\n]*/g,"")
                .replace(/\[Ảnh \/ Tài liệu\][^\n]*/g,"")
                .replace(/\n{3,}/g,"\n\n").trim();
              const caCount   = Array.isArray(action.actionPlan) ? action.actionPlan.filter(i => i.type==="CA").length : 0;
              const paCount   = Array.isArray(action.actionPlan) ? action.actionPlan.filter(i => i.type==="PA").length : 0;
              const bothCount = Array.isArray(action.actionPlan) ? action.actionPlan.filter(i => i.type==="Both").length : 0;
              const today2 = new Date(); today2.setHours(0,0,0,0);
              return (
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

                  {/* Mô tả vấn đề */}
                  <div style={{ background:"#fff", borderRadius:13, border:"1px solid #e8edf5", overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                    <div style={{ padding:"10px 16px", background:"#f8fafc", borderBottom:"1px solid #e8edf5",
                      fontSize:12, fontWeight:800, color:"#334155", letterSpacing:"0.06em" }}>📝 MÔ TẢ VẤN ĐỀ & HÀNH ĐỘNG KHẮC PHỤC</div>
                    <div style={{ padding:"16px" }}>
                      <p style={{ margin:0, fontSize:14.5, color:"#1e293b", lineHeight:1.75, whiteSpace:"pre-wrap" }}>
                        {cleanDesc || <span style={{ color:"#94a3b8", fontStyle:"italic" }}>Chưa có mô tả</span>}
                      </p>
                    </div>
                  </div>

                  {/* Phân tích nguyên nhân gốc rễ */}
                  {(action.rootCause || (Array.isArray(action.whys) && action.whys.some(w => w))) && (
                    <div style={{ background:"#fff", borderRadius:13, border:"1.5px solid #fde68a", overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                      <div style={{ padding:"10px 16px", background:"linear-gradient(135deg,#78350f,#92400e)",
                        display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:14 }}>🎯</span>
                        <span style={{ fontSize:12, fontWeight:800, color:"#fff", letterSpacing:"0.06em" }}>NGUYÊN NHÂN GỐC RỄ</span>
                        {action.rcaMethod && (
                          <span style={{ marginLeft:"auto", fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:8,
                            background:"rgba(255,255,255,0.2)", color:"rgba(255,255,255,0.9)" }}>{action.rcaMethod}</span>
                        )}
                      </div>
                      <div style={{ padding:"16px", display:"flex", flexDirection:"column", gap:12 }}>
                        {action.rootCause && (
                          <div style={{ padding:"12px 14px", borderRadius:10, background:"#fefce8", border:"1.5px solid #fde68a" }}>
                            <div style={{ fontSize:11, fontWeight:800, color:"#92400e", letterSpacing:"0.05em", marginBottom:6 }}>KẾT LUẬN NGUYÊN NHÂN</div>
                            <p style={{ margin:0, fontSize:14, color:"#1e293b", lineHeight:1.65, whiteSpace:"pre-wrap" }}>{action.rootCause}</p>
                          </div>
                        )}
                        {Array.isArray(action.whys) && action.whys.filter(w => w).length > 0 && (
                          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                            <div style={{ fontSize:11, fontWeight:800, color:"#64748b", letterSpacing:"0.05em" }}>CHUỖI 5 WHY</div>
                            {action.whys.filter(w => w).map((w, i) => (
                              <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                                <div style={{ width:28, height:28, borderRadius:8, background:"#f59e0b",
                                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                                  fontSize:12, fontWeight:900, color:"#fff" }}>W{i+1}</div>
                                <div style={{ flex:1, padding:"6px 12px", borderRadius:9, background:"#fffbeb", border:"1px solid #fde68a",
                                  fontSize:13.5, color:"#1e293b", lineHeight:1.55 }}>{w}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Fishbone (freeAnalysis) */}
                        {action.freeAnalysis && (
                          <div style={{ padding:"12px 14px", borderRadius:10, background:"#f8fafc", border:"1px solid #e2e8f0" }}>
                            <div style={{ fontSize:11, fontWeight:800, color:"#64748b", letterSpacing:"0.05em", marginBottom:6 }}>PHÂN TÍCH TỰ DO</div>
                            <p style={{ margin:0, fontSize:13.5, color:"#1e293b", lineHeight:1.65, whiteSpace:"pre-wrap" }}>{action.freeAnalysis}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Kế hoạch hành động */}
                  <div style={{ background:"#fff", borderRadius:13, border:"1px solid #e8edf5", overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                    <div style={{ padding:"10px 16px", background:"#f8fafc", borderBottom:"1px solid #e8edf5",
                      display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontSize:12, fontWeight:800, color:"#334155", letterSpacing:"0.06em" }}>📊 KẾ HOẠCH HÀNH ĐỘNG</span>
                      <div style={{ display:"flex", gap:5 }}>
                        {caCount > 0 && <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, background:"#dbeafe", color:"#1d4ed8", border:"1px solid #bfdbfe" }}>CA×{caCount}</span>}
                        {paCount > 0 && <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, background:"#dcfce7", color:"#15803d", border:"1px solid #bbf7d0" }}>PA×{paCount}</span>}
                        {bothCount > 0 && <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, background:"#ede9fe", color:"#7c3aed", border:"1px solid #ddd6fe" }}>CA+PA×{bothCount}</span>}
                      </div>
                    </div>
                    {Array.isArray(action.actionPlan) && action.actionPlan.length > 0 ? (
                      <div style={{ overflowX:"auto" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                          <thead>
                            <tr style={{ background:"#f8fafc" }}>
                              {["#","Hành động / Biện pháp","Loại","Người thực hiện","Hạn","% TĐ","Ghi chú"].map((h, hi) => (
                                <th key={hi} style={{ padding:"8px 10px", borderBottom:"1.5px solid #e2e8f0",
                                  fontWeight:700, fontSize:11, color:"#475569", textAlign:"left", whiteSpace:"nowrap", letterSpacing:"0.03em" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {action.actionPlan.map((item, idx) => {
                              const tc = AP_COLORS[item.type] || { label:item.type||"—", color:"#64748b", bg:"#f1f5f9", border:"#e2e8f0" };
                              const pct2 = Math.min(100, Math.max(0, +(item.progress||0)));
                              const barColor = pct2 >= 100 ? "#22c55e" : pct2 >= 50 ? "#3b82f6" : "#f59e0b";
                              let dlColor2 = "#0f172a";
                              if (item.deadline) {
                                const d2 = new Date(item.deadline); d2.setHours(0,0,0,0);
                                const diff2 = Math.round((d2.getTime() - today2.getTime()) / 86400000);
                                if (diff2 < 0) dlColor2 = "#dc2626";
                                else if (diff2 <= 3) dlColor2 = "#d97706";
                              }
                              return (
                                <tr key={idx} style={{ borderBottom:"1px solid #f1f5f9", background:idx%2===0?"#fff":"#fafbfd" }}>
                                  <td style={{ padding:"9px 10px", color:"#94a3b8", fontWeight:700, fontSize:12 }}>{idx+1}</td>
                                  <td style={{ padding:"9px 10px", color:"#0f172a", fontWeight:500, maxWidth:220 }}>
                                    <div style={{ lineHeight:1.5 }}>{item.action||"—"}</div>
                                  </td>
                                  <td style={{ padding:"9px 10px" }}>
                                    {item.type
                                      ? <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20,
                                          background:tc.bg, color:tc.color, border:`1px solid ${tc.border}`, whiteSpace:"nowrap" }}>{tc.label}</span>
                                      : <span style={{ color:"#94a3b8" }}>—</span>
                                    }
                                  </td>
                                  <td style={{ padding:"9px 10px", color:"#334155", whiteSpace:"nowrap" }}>
                                    {Array.isArray(item.persons) ? item.persons.join(", ") : (item.person||"—")}
                                  </td>
                                  <td style={{ padding:"9px 10px", color:dlColor2, fontWeight:600, whiteSpace:"nowrap" }}>
                                    {item.deadline ? item.deadline.slice(0,10) : "—"}
                                  </td>
                                  <td style={{ padding:"9px 14px", minWidth:110 }}>
                                    {editingProgress?.idx === idx ? (
                                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                                        <input type="number" min={0} max={100} step={5}
                                          autoFocus
                                          value={editingProgress.val}
                                          onChange={e => setEditingProgress({ idx, val: e.target.value })}
                                          onKeyDown={e => {
                                            if (e.key === "Enter") saveProgress(idx, Number(editingProgress.val));
                                            if (e.key === "Escape") setEditingProgress(null);
                                          }}
                                          style={{ width:52, padding:"3px 6px", fontSize:13, fontWeight:700,
                                            border:"1.5px solid #3b82f6", borderRadius:6, outline:"none", textAlign:"center" }} />
                                        <button onClick={() => saveProgress(idx, Number(editingProgress.val))}
                                          style={{ padding:"3px 7px", fontSize:12, borderRadius:5, border:"none",
                                            background:"#3b82f6", color:"#fff", cursor:"pointer", fontWeight:700 }}>✓</button>
                                        <button onClick={() => setEditingProgress(null)}
                                          style={{ padding:"3px 6px", fontSize:12, borderRadius:5, border:"none",
                                            background:"#f1f5f9", color:"#64748b", cursor:"pointer" }}>✕</button>
                                      </div>
                                    ) : (
                                      <div style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}
                                        title="Click để cập nhật tiến độ"
                                        onClick={() => setEditingProgress({ idx, val: String(pct2) })}>
                                        <div style={{ flex:1, height:6, borderRadius:3, background:"#e2e8f0", overflow:"hidden" }}>
                                          <div style={{ height:"100%", width:`${pct2}%`, borderRadius:3, background:barColor }} />
                                        </div>
                                        <span style={{ fontSize:11, fontWeight:700, color:barColor, minWidth:28, textAlign:"right" }}>{pct2}%</span>
                                        <span style={{ fontSize:10, color:"#cbd5e1" }}>✎</span>
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding:"9px 10px", color:"#64748b", fontSize:12 }}>{item.note||""}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ padding:"32px", textAlign:"center" }}>
                        <div style={{ fontSize:28, marginBottom:8 }}>📋</div>
                        <div style={{ fontSize:14, color:"#94a3b8", fontWeight:600 }}>Chưa có kế hoạch hành động</div>
                      </div>
                    )}
                  </div>

                </div>
              );
            })()}

            {/* ════ TAB 2: BẰNG CHỨNG ════ */}
            {activeTab === 2 && (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

                {/* Source files */}
                {sourceFiles.length > 0 && (
                  <div style={{ background:"#fff", borderRadius:13, border:"1.5px solid #d8b4fe", overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                    <div style={{ padding:"10px 16px", background:"linear-gradient(135deg,#7c3aed,#6d28d9)",
                      fontSize:12, fontWeight:800, color:"#fff", letterSpacing:"0.06em" }}>
                      📂 TÀI LIỆU TỪ NGUỒN GỐC · {sourceFiles.length} file
                    </div>
                    <div style={{ padding:"12px 14px", display:"flex", flexWrap:"wrap", gap:10 }}>
                      {sourceFiles.map((f, i) => (
                        <FileRow key={i} f={f} purple
                          onView={() => isImage(f.url) && setLightboxUrl(f.url)}
                          onViewPdf={() => setPdfViewUrl(f.url)}
                          onViewOffice={() => setOfficeViewFile({ url:f.url, name:officeFileName(f) })} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Evidence files */}
                <div style={{ background:"#fff", borderRadius:13, border:"1px solid #e8edf5", overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                  <div style={{ padding:"10px 16px", background:"#f8fafc", borderBottom:"1px solid #e8edf5",
                    display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span style={{ fontSize:12, fontWeight:800, color:"#334155", letterSpacing:"0.06em" }}>
                      📎 BẰNG CHỨNG CAPA · {evidenceFiles.length} file đã lưu
                    </span>
                  </div>
                  <div style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:8 }}>
                    {/* Already-saved evidence files */}
                    {evidenceFiles.length > 0
                      ? <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                          {evidenceFiles.map((f, i) => (
                            <FileRow key={i} f={f} green
                              onView={() => isImage(f.url) && setLightboxUrl(f.url)}
                              onViewPdf={() => setPdfViewUrl(f.url)}
                              onViewOffice={() => setOfficeViewFile({ url:f.url, name:officeFileName(f) })}
                              onDelete={isEhsAdmin ? () => deleteEvidenceFile(i) : undefined} />
                          ))}
                        </div>
                      : !ns.match(/in_progress/) && (
                          <div style={{ padding:"20px", borderRadius:10, border:"2px dashed #e2e8f0", background:"#fafbfc", textAlign:"center" }}>
                            <div style={{ fontSize:26, marginBottom:4 }}>📎</div>
                            <div style={{ fontSize:13, color:"#64748b", fontWeight:600 }}>Chưa có bằng chứng</div>
                          </div>
                        )
                    }

                    {/* ── Upload zones — visible for all non-closed statuses ── */}
                    {ns !== "closed" && (
                      <div style={{ display:"flex", flexDirection:"column", gap:10, padding:"12px 14px", borderRadius:11, background:"#f0f4fa", border:"1.5px solid #dde3ee" }}>
                        <div style={{ fontSize:12, fontWeight:800, color:"#334155", letterSpacing:"0.06em", marginBottom:2 }}>
                          📤 ĐÍNH KÈM BẰNG CHỨNG MỚI
                        </div>

                        {/* Image drop zone */}
                        <EvImageZone
                          photos={evPhotos}
                          onAdd={items => setEvPhotos(p => [...p, ...items])}
                          onRemove={id => setEvPhotos(p => p.filter(x => x.id !== id))}
                          maxFiles={6}
                        />

                        {/* Document drop zone */}
                        <EvDocZone docs={evDocs} onChange={setEvDocs} />

                        {/* Summary badge when files staged */}
                        {(evPhotos.length > 0 || evDocs.length > 0) && (
                          <div style={{ padding:"7px 11px", borderRadius:8, background:"#dbeafe", border:"1.5px solid #93c5fd", fontSize:13, fontWeight:700, color:"#1d4ed8", display:"flex", alignItems:"center", gap:6 }}>
                            ✅ Đã chọn: {evPhotos.length > 0 && `${evPhotos.length} ảnh`}{evPhotos.length > 0 && evDocs.length > 0 && " · "}{evDocs.length > 0 && `${evDocs.length} tài liệu`} — sẽ được tải lên khi lưu
                          </div>
                        )}
                      </div>
                    )}

                    {/* Submit evidence — in_progress: full flow (notes + báo hoàn thành) */}
                    {ns === "in_progress" && (
                      <div style={{ paddingTop:4, borderTop:"1px solid #f1f5f9" }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"#64748b", marginBottom:6 }}>GHI CHÚ BẰNG CHỨNG (tuỳ chọn)</div>
                        <textarea rows={2} value={evNotes} onChange={e => setEvNotes(e.target.value)}
                          placeholder="Mô tả bằng chứng, kết quả xử lý..."
                          style={{ width:"100%", padding:"9px 12px", fontSize:13.5, lineHeight:1.5,
                            border:"1.5px solid #e2e8f0", borderRadius:8, outline:"none",
                            fontFamily:"inherit", resize:"none", boxSizing:"border-box", color:"#1e293b", marginBottom:8 }} />
                        {evError && <div style={{ fontSize:12, color:"#dc2626", marginBottom:8 }}>{evError}</div>}
                        {evSuccess && <div style={{ fontSize:13, color:"#15803d", marginBottom:8, fontWeight:600 }}>✅ Đã nộp thành công</div>}
                        <button onClick={submitEvidence} disabled={evSubmitting}
                          style={{ width:"100%", padding:"11px", borderRadius:9, border:"none", cursor:"pointer",
                            background:"linear-gradient(135deg,#0369a1,#0891b2)",
                            fontSize:14, fontWeight:700, color:"#fff",
                            boxShadow:"0 4px 16px rgba(8,145,178,.3)",
                            opacity: evSubmitting ? 0.7 : 1 }}>
                          {evSubmitting ? "Đang tải lên & gửi..." : "🏁 Báo hoàn thành & Nộp bằng chứng"}
                        </button>
                      </div>
                    )}

                    {/* Save files only — for open / draft / done_by_owner / rejected statuses */}
                    {ns !== "in_progress" && ns !== "closed" && (
                      <div style={{ paddingTop:4, borderTop:"1px solid #f1f5f9" }}>
                        {evError && <div style={{ fontSize:12, color:"#dc2626", marginBottom:8 }}>{evError}</div>}
                        {evSuccess && <div style={{ fontSize:13, color:"#15803d", marginBottom:8, fontWeight:600 }}>✅ Đã lưu bằng chứng</div>}
                        <button
                          disabled={evSubmitting || (evPhotos.length === 0 && evDocs.length === 0)}
                          onClick={async () => {
                            if (evPhotos.length === 0 && evDocs.length === 0) return;
                            setEvSubmitting(true); setEvError(""); setEvSuccess(false);
                            try {
                              const fd = new FormData();
                              for (const p of evPhotos) fd.append("files", p.blob, p.name.replace(/\.[^.]+$/, ".jpg"));
                              for (const d of evDocs) fd.append("files", d.file, d.name);
                              const r = await fetch(`/api/actions/${action.id}/upload-evidence`, { method:"POST", credentials:"include", body:fd });
                              if (!r.ok) throw new Error(await r.text());
                              setAction(await r.json());
                              evPhotos.forEach(p => { URL.revokeObjectURL(p.previewUrl); URL.revokeObjectURL(p.originalUrl); });
                              evDocs.forEach(d => URL.revokeObjectURL(d.url));
                              setEvPhotos([]); setEvDocs([]); setEvSuccess(true);
                            } catch(e: any) { setEvError(e.message || "Lỗi khi lưu"); }
                            finally { setEvSubmitting(false); }
                          }}
                          style={{ width:"100%", padding:"10px", borderRadius:9, border:"none", cursor: (evPhotos.length === 0 && evDocs.length === 0) ? "default" : "pointer",
                            background: (evPhotos.length === 0 && evDocs.length === 0) ? "#e2e8f0" : "linear-gradient(135deg,#059669,#10b981)",
                            fontSize:13, fontWeight:700, color: (evPhotos.length === 0 && evDocs.length === 0) ? "#94a3b8" : "#fff",
                            opacity: evSubmitting ? 0.7 : 1 }}>
                          {evSubmitting ? "Đang lưu..." : (evPhotos.length === 0 && evDocs.length === 0) ? "💾 Chọn ảnh hoặc file để lưu" : `💾 Lưu bằng chứng (${evPhotos.length + evDocs.length} file)`}
                        </button>
                      </div>
                    )}

                    {/* EHS verify (done_by_owner + isEhsAdmin) */}
                    {ns === "done_by_owner" && isEhsAdmin && (
                      <div style={{ marginTop:14, paddingTop:14, borderTop:"1px solid #f1f5f9" }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"#64748b", marginBottom:6 }}>GHI CHÚ XÁC MINH (tuỳ chọn)</div>
                        <textarea rows={2} value={verifyNote} onChange={e => setVerifyNote(e.target.value)}
                          placeholder="Ghi chú kết quả xác minh..."
                          style={{ width:"100%", padding:"9px 12px", fontSize:13.5, lineHeight:1.5,
                            border:"1.5px solid #e2e8f0", borderRadius:8, outline:"none",
                            fontFamily:"inherit", resize:"none", boxSizing:"border-box", color:"#1e293b", marginBottom:8 }} />
                        {verifyError && <div style={{ fontSize:12, color:"#dc2626", marginBottom:8 }}>{verifyError}</div>}
                        <div style={{ display:"flex", gap:8 }}>
                          <button onClick={() => callVerify(false)} disabled={verifying}
                            style={{ flex:1, padding:"10px", borderRadius:9, cursor:"pointer",
                              border:"1.5px solid #fde68a", background:"#fffbeb",
                              fontSize:13.5, fontWeight:700, color:"#d97706" }}>
                            ↩ Trả lại
                          </button>
                          <button onClick={() => callVerify(true)} disabled={verifying}
                            style={{ flex:2, padding:"10px", borderRadius:9, cursor:"pointer", border:"none",
                              background:"linear-gradient(135deg,#15803d,#22c55e)",
                              fontSize:13.5, fontWeight:700, color:"#fff",
                              boxShadow:"0 4px 16px rgba(21,128,61,.3)" }}>
                            {verifying ? "Đang xử lý..." : "✅ Xác minh & Đóng CAPA"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ════ TAB 3: NHẬT KÝ & TRAO ĐỔI ════ */}
            {activeTab === 3 && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>

                {/* Activity log */}
                <div style={{ background:"#fff", borderRadius:13, border:"1px solid #e8edf5", overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                  <div style={{ padding:"10px 16px", background:"#f8fafc", borderBottom:"1px solid #e8edf5",
                    fontSize:12, fontWeight:800, color:"#334155", letterSpacing:"0.06em" }}>
                    🕐 NHẬT KÝ HOẠT ĐỘNG {logsLoaded && logs.length > 0 ? `(${logs.length})` : ""}
                  </div>
                  <div style={{ padding:"14px 16px", maxHeight:560, overflowY:"auto" }}>
                    {!logsLoaded && (
                      <div style={{ textAlign:"center", color:"#64748b", fontSize:13, padding:"24px 0" }}>⏳ Đang tải nhật ký...</div>
                    )}
                    {logsLoaded && logs.length === 0 && (
                      <div style={{ textAlign:"center", color:"#94a3b8", fontSize:13, padding:"32px 0" }}>
                        <div style={{ fontSize:28, marginBottom:8 }}>📋</div>Chưa có hoạt động nào
                      </div>
                    )}
                    {logsLoaded && logs.length > 0 && (
                      <div style={{ position:"relative" }}>
                        <div style={{ position:"absolute", left:15, top:16, bottom:8, width:2,
                          background:"linear-gradient(180deg,#e2e8f0,#f8fafc)", borderRadius:2 }} />
                        <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                          {[...logs].reverse().map((l, i) => {
                            const icon = LOG_ICONS[l.action] || "📌";
                            const isFirst = i === 0;
                            const dotColor =
                              l.action?.includes("closed") || l.action?.includes("verified") ? "#22c55e" :
                              l.action?.includes("done_by_owner") ? "#06b6d4" :
                              l.action?.includes("in_progress") ? "#f59e0b" :
                              l.action?.includes("rejected") ? "#dc2626" :
                              l.action?.includes("created") ? "#8b5cf6" : "#64748b";
                            return (
                              <div key={l.id||i} style={{ display:"flex", gap:12, paddingBottom: i < logs.length-1 ? 14 : 0, alignItems:"flex-start", position:"relative" }}>
                                <div style={{ width:32, height:32, borderRadius:"50%", flexShrink:0,
                                  background: isFirst ? dotColor : "#fff",
                                  border:`2.5px solid ${dotColor}`,
                                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:isFirst?15:13, zIndex:1, position:"relative",
                                  boxShadow: isFirst ? `0 0 0 4px ${dotColor}22` : "none" }}>
                                  {icon}
                                </div>
                                <div style={{ flex:1, minWidth:0, paddingTop:4 }}>
                                  <div style={{ fontSize:13, fontWeight:isFirst?700:600,
                                    color: isFirst ? "#0f172a" : "#374151", lineHeight:1.4 }}>
                                    {l.message || l.action || "—"}
                                  </div>
                                  <div style={{ fontSize:11.5, color:"#64748b", marginTop:2 }}>
                                    {l.actorName||"Hệ thống"} · {fmtDate(l.createdAt)}
                                  </div>
                                  {l.note && (
                                    <div style={{ marginTop:5, padding:"6px 10px", borderRadius:7, background:"#f8fafc",
                                      border:"1px solid #e2e8f0", fontSize:12.5, color:"#475569", lineHeight:1.5 }}>{l.note}</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Comments / Trao đổi nội bộ */}
                <div style={{ background:"#fff", borderRadius:13, border:"1px solid #e8edf5", overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,.05)", display:"flex", flexDirection:"column" }}>
                  <div style={{ padding:"10px 16px", background:"#f8fafc", borderBottom:"1px solid #e8edf5",
                    fontSize:12, fontWeight:800, color:"#334155", letterSpacing:"0.06em", flexShrink:0 }}>
                    💬 TRAO ĐỔI NỘI BỘ {commentsLoaded && comments.length > 0 ? `(${comments.length})` : ""}
                  </div>

                  {/* Comment list */}
                  <div style={{ flex:1, padding:"12px 14px 8px", display:"flex", flexDirection:"column", gap:10,
                    maxHeight:440, overflowY:"auto" }}>
                    {!commentsLoaded && (
                      <div style={{ textAlign:"center", color:"#94a3b8", fontSize:13, padding:"24px 0" }}>⏳ Đang tải...</div>
                    )}
                    {commentsLoaded && comments.length === 0 && (
                      <div style={{ textAlign:"center", color:"#94a3b8", fontSize:13, padding:"32px 0" }}>
                        <div style={{ fontSize:28, marginBottom:8 }}>💬</div>
                        Chưa có trao đổi — hãy bắt đầu cuộc thảo luận
                      </div>
                    )}
                    {commentsLoaded && comments.map((c, i) => {
                      const initials = (c.actorName||"?").split(/\s+/).map(w => w[0]).join("").slice(0,2).toUpperCase();
                      const bg = avatarColor(c.actorName||"");
                      const isEditing = editCmtId === c.id;
                      return (
                        <div key={c.id||i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                          <div style={{ width:34, height:34, borderRadius:"50%", background:bg,
                            display:"flex", alignItems:"center", justifyContent:"center",
                            fontSize:12, fontWeight:800, color:"#fff", flexShrink:0 }}>
                            {initials}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:3, flexWrap:"wrap" }}>
                              <span style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{c.actorName||"—"}</span>
                              {c.actorRole && <span style={{ fontSize:11, color:"#64748b" }}>{c.actorRole}</span>}
                              <span style={{ fontSize:11, color:"#94a3b8" }}>{fmtDate(c.createdAt)}</span>
                              {c.edited && <span style={{ fontSize:10.5, color:"#94a3b8", fontStyle:"italic" }}>(đã sửa)</span>}
                              <div style={{ marginLeft:"auto", display:"flex", gap:3 }}>
                                <button onClick={() => { setEditCmtId(c.id); setEditCmtText(c.text); }}
                                  style={{ background:"none", border:"none", cursor:"pointer", color:"#94a3b8", padding:"2px 5px", borderRadius:4, fontSize:12 }}>✏️</button>
                                <button onClick={() => deleteComment(c.id)}
                                  style={{ background:"none", border:"none", cursor:"pointer", color:"#fca5a5", padding:"2px 5px", borderRadius:4, fontSize:12 }}>🗑️</button>
                              </div>
                            </div>
                            {isEditing ? (
                              <div style={{ display:"flex", gap:6, alignItems:"flex-start" }}>
                                <textarea autoFocus value={editCmtText}
                                  onChange={e => setEditCmtText(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key==="Enter"&&(e.ctrlKey||e.metaKey)) { saveEditComment(c.id); e.preventDefault(); }
                                    if (e.key==="Escape") { setEditCmtId(null); setEditCmtText(""); }
                                  }}
                                  rows={2}
                                  style={{ flex:1, padding:"7px 10px", fontSize:13.5, borderRadius:7,
                                    border:"1.5px solid #3b82f6", outline:"none", fontFamily:"inherit", resize:"none", lineHeight:1.5, color:"#1e293b" }} />
                                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                                  <button onClick={() => saveEditComment(c.id)}
                                    style={{ padding:"6px 12px", borderRadius:7, border:"none", cursor:"pointer", background:"#3b82f6", color:"#fff", fontSize:12, fontWeight:700 }}>Lưu</button>
                                  <button onClick={() => { setEditCmtId(null); setEditCmtText(""); }}
                                    style={{ padding:"6px 12px", borderRadius:7, cursor:"pointer", border:"1px solid #e2e8f0", background:"#fff", fontSize:12, color:"#64748b" }}>Hủy</button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ padding:"8px 12px", borderRadius:9, background:"#f8fafc",
                                border:"1px solid #e2e8f0", fontSize:13.5, color:"#1e293b", lineHeight:1.55, wordBreak:"break-word" }}>
                                {renderCommentText(c.text)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={cmtEndRef} />
                  </div>

                  {/* Input area */}
                  <div style={{ padding:"8px 14px 12px", borderTop:"1px solid #f1f5f9", position:"relative", flexShrink:0 }}>
                    {mentionOpen && (() => {
                      const filtered = MENTION_PEOPLE.filter(p => p.toLowerCase().startsWith(mentionFilter.toLowerCase())).slice(0, 8);
                      if (!filtered.length) return null;
                      return (
                        <div style={{ position:"absolute", bottom:"100%", left:14, right:14, marginBottom:4,
                          background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:10,
                          boxShadow:"0 8px 32px rgba(0,0,0,0.12)", zIndex:10, overflow:"hidden" }}>
                          <div style={{ padding:"6px 12px 4px", fontSize:11, fontWeight:700, color:"#64748b", letterSpacing:"0.06em" }}>NHẮC TỚI BỘ PHẬN</div>
                          {filtered.map(p => (
                            <button key={p} onClick={() => insertMention(p)}
                              style={{ display:"block", width:"100%", textAlign:"left", padding:"8px 14px",
                                border:"none", background:"none", cursor:"pointer", fontSize:13.5, fontWeight:600, color:"#1e293b" }}
                              onMouseEnter={e => { (e.target as any).style.background="#f0f4fa"; }}
                              onMouseLeave={e => { (e.target as any).style.background="none"; }}>
                              @{p}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                    <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
                      <textarea ref={cmtRef} rows={2} value={cmtText}
                        onChange={e => handleCmtChange(e.target.value)}
                        onKeyDown={handleCmtKeydown}
                        placeholder="Nhập trao đổi... (@ để nhắc bộ phận, Ctrl+Enter gửi)"
                        style={{ flex:1, padding:"9px 12px", fontSize:13.5, lineHeight:1.5,
                          border:"1.5px solid #e2e8f0", borderRadius:9, outline:"none",
                          fontFamily:"inherit", resize:"none", color:"#1e293b",
                          boxSizing:"border-box", transition:"border-color 0.15s" }}
                        onFocus={e => { e.target.style.borderColor="#3b82f6"; }}
                        onBlur={e => { e.target.style.borderColor="#e2e8f0"; }} />
                      <button onClick={sendComment} disabled={cmtSending || !cmtText.trim()}
                        style={{ padding:"10px 20px", borderRadius:9, border:"none", cursor:"pointer",
                          background: cmtText.trim() ? "linear-gradient(135deg,#2563eb,#3b82f6)" : "#e2e8f0",
                          color: cmtText.trim() ? "#fff" : "#94a3b8",
                          fontSize:13.5, fontWeight:700, flexShrink:0, minWidth:80 }}>
                        {cmtSending ? "..." : "Gửi ↵"}
                      </button>
                    </div>
                    {cmtError && <div style={{ fontSize:12, color:"#dc2626", marginTop:5 }}>⚠ {cmtError}</div>}
                  </div>
                </div>
              </div>
            )}

            {/* ════ TAB 4: GIA HẠN ════ */}
            {activeTab === 4 && (() => {
              const extLogs = logs.filter(l => l.action === "due-date-extended");
              const canExtend = ns !== "closed" && canExtendDueDate;
              const capaIsClosed = ns === "closed";
              return (
                <div style={{ display:"grid", gridTemplateColumns:"340px 1fr", gap:16, alignItems:"start" }}>

                  {/* LEFT — Form gia hạn */}
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    {/* Trạng thái hạn hiện tại */}
                    <div style={{ background:"#fff", borderRadius:13, border:"1.5px solid #fde68a",
                      overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                      <div style={{ padding:"10px 16px", background:"linear-gradient(135deg,#fffbeb,#fef3c7)",
                        borderBottom:"1px solid #fde68a", display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:18 }}>📅</span>
                        <span style={{ fontSize:12, fontWeight:800, color:"#92400e", letterSpacing:"0.06em" }}>THỜI HẠN XỬ LÝ</span>
                      </div>
                      <div style={{ padding:"14px 16px", display:"flex", flexDirection:"column", gap:6 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                          <span style={{ fontSize:12, color:"#92400e", fontWeight:600 }}>Hạn hiện tại</span>
                          <span style={{ fontSize:16, fontWeight:800, color: due && due < new Date().toISOString().slice(0,10) && ns !== "closed" ? "#dc2626" : "#78350f" }}>
                            {due || "Chưa đặt"}
                            {due && due < new Date().toISOString().slice(0,10) && ns !== "closed" && (
                              <span style={{ fontSize:11, fontWeight:700, color:"#dc2626", marginLeft:6,
                                background:"#fef2f2", padding:"1px 6px", borderRadius:5 }}>Quá hạn</span>
                            )}
                          </span>
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                          <span style={{ fontSize:12, color:"#92400e", fontWeight:600 }}>Số lần gia hạn</span>
                          <span style={{ fontSize:14, fontWeight:800, color: extLogs.length > 0 ? "#d97706" : "#94a3b8" }}>
                            {extLogs.length > 0 ? `${extLogs.length} lần` : "Chưa gia hạn"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Form gia hạn */}
                    {canExtend ? (
                      <div style={{ background:"#fff", borderRadius:13, border:"1px solid #e8edf5",
                        overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                        <div style={{ padding:"10px 16px", background:"#f8fafc", borderBottom:"1px solid #e8edf5",
                          fontSize:12, fontWeight:800, color:"#334155", letterSpacing:"0.06em" }}>
                          ✏️ TẠO YÊU CẦU GIA HẠN
                        </div>
                        <div style={{ padding:"16px", display:"flex", flexDirection:"column", gap:13 }}>
                          {/* Ngày mới */}
                          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                            <label style={{ fontSize:11, fontWeight:800, color:"#475569", letterSpacing:"0.05em" }}>
                              NGÀY HẠN MỚI *
                            </label>
                            <input type="date" value={extDate} min={new Date().toISOString().slice(0,10)}
                              onChange={e => { setExtDate(e.target.value); setExtError(""); }}
                              style={{ padding:"9px 12px", fontSize:14, fontWeight:700, borderRadius:9,
                                border:`2px solid ${extDate ? "#f59e0b" : "#e2e8f0"}`,
                                background:"#fff", outline:"none", color:"#78350f", fontFamily:"inherit",
                                boxShadow: extDate ? "0 0 0 3px rgba(245,158,11,0.12)" : "none",
                                transition:"all .15s" }} />
                            {due && extDate && extDate !== due && (
                              <div style={{ fontSize:12, fontWeight:700, padding:"5px 10px", borderRadius:7,
                                background: extDate > due ? "#fffbeb" : "#fef2f2",
                                border: `1px solid ${extDate > due ? "#fde68a" : "#fecaca"}`,
                                color: extDate > due ? "#d97706" : "#dc2626" }}>
                                {extDate > due
                                  ? `📅 Gia hạn thêm ${Math.round((new Date(extDate).getTime()-new Date(due).getTime())/86400000)} ngày`
                                  : `⚠️ Rút ngắn ${Math.round((new Date(due).getTime()-new Date(extDate).getTime())/86400000)} ngày`}
                              </div>
                            )}
                          </div>

                          {/* Lý do */}
                          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                            <label style={{ fontSize:11, fontWeight:800, color:"#475569", letterSpacing:"0.05em" }}>
                              LÝ DO GIA HẠN * <span style={{ color:"#94a3b8", fontWeight:500 }}>(bắt buộc)</span>
                            </label>
                            <textarea rows={4} value={extReason} onChange={e => { setExtReason(e.target.value); setExtError(""); }}
                              placeholder={"Mô tả lý do cần thêm thời gian...\n\nVD: Đang chờ thiết bị từ nhà cung cấp,\ndự kiến giao 05/07. Cần thêm 10 ngày để\nlắp đặt và nghiệm thu."}
                              style={{ padding:"9px 12px", fontSize:13, lineHeight:1.6, borderRadius:9,
                                border:`2px solid ${extReason.trim() ? "#f59e0b" : "#e2e8f0"}`,
                                background:"#fff", outline:"none", color:"#1e293b", fontFamily:"inherit",
                                resize:"vertical", width:"100%", boxSizing:"border-box",
                                boxShadow: extReason.trim() ? "0 0 0 3px rgba(245,158,11,0.12)" : "none",
                                transition:"all .15s" }} />
                            <div style={{ fontSize:11, color: extReason.length > 20 ? "#22c55e" : "#94a3b8",
                              fontWeight:600, textAlign:"right" }}>
                              {extReason.length} ký tự {extReason.length < 10 ? "(nên viết ≥10 ký tự)" : "✓"}
                            </div>
                          </div>

                          {/* Error / Success */}
                          {extError && (
                            <div style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 12px",
                              borderRadius:9, background:"#fef2f2", border:"1px solid #fecaca" }}>
                              <span>⚠️</span>
                              <span style={{ fontSize:13, fontWeight:600, color:"#dc2626" }}>{extError}</span>
                            </div>
                          )}
                          {extDone && (
                            <div style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 12px",
                              borderRadius:9, background:"#f0fdf4", border:"1px solid #bbf7d0" }}>
                              <span>✅</span>
                              <span style={{ fontSize:13, fontWeight:700, color:"#15803d" }}>Đã gia hạn thành công!</span>
                            </div>
                          )}

                          {/* Submit */}
                          <button onClick={submitExtend}
                            disabled={extSaving || extDone || !extDate || !extReason.trim()}
                            style={{ padding:"11px 0", borderRadius:10, cursor: (extSaving||extDone||!extDate||!extReason.trim()) ? "not-allowed" : "pointer",
                              border:"none", width:"100%", fontSize:13.5, fontWeight:800, letterSpacing:"0.02em",
                              background: extDone ? "#dcfce7"
                                : (extSaving||!extDate||!extReason.trim()) ? "#f1f5f9"
                                : "linear-gradient(135deg,#d97706,#f59e0b)",
                              color: extDone ? "#15803d"
                                : (extSaving||!extDate||!extReason.trim()) ? "#94a3b8"
                                : "#fff",
                              boxShadow: (extDate&&extReason.trim()&&!extSaving&&!extDone) ? "0 4px 16px rgba(217,119,6,.35)" : "none",
                              transition:"all .18s" }}>
                            {extDone ? "✅ Đã gia hạn thành công" : extSaving ? "Đang lưu..." : "📅 Xác nhận gia hạn"}
                          </button>
                        </div>
                      </div>
                    ) : capaIsClosed ? (
                      <div style={{ padding:"20px 16px", textAlign:"center", borderRadius:13,
                        border:"1px solid #e2e8f0", background:"#f8fafc",
                        color:"#64748b", fontSize:13.5 }}>
                        🔒 CAPA đã đóng, không thể gia hạn
                      </div>
                    ) : (
                      <div style={{ padding:"20px 16px", borderRadius:13,
                        border:"1.5px solid #fecaca", background:"#fef2f2" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                          <span style={{ fontSize:22 }}>🚫</span>
                          <span style={{ fontSize:13.5, fontWeight:800, color:"#991b1b" }}>Không có quyền gia hạn</span>
                        </div>
                        <div style={{ fontSize:12.5, color:"#7f1d1d", lineHeight:1.7 }}>
                          Chỉ những người sau mới được gia hạn CAPA này:
                        </div>
                        <ul style={{ margin:"8px 0 0 0", padding:"0 0 0 18px", fontSize:12, color:"#7f1d1d", lineHeight:1.9 }}>
                          <li>EHS / Safety Officer</li>
                          <li>Người đảm nhận (Owner): <strong>{action.ownerName || "—"}</strong></li>
                          <li>Người tạo CAPA: <strong>{action.createdByName || "—"}</strong></li>
                          <li>Người thực hiện trong danh sách</li>
                          <li>Thành viên cùng bộ phận: <strong>{action.departmentCode || "—"}</strong></li>
                        </ul>
                      </div>
                    )}

                    {/* EHS admin — nút nhắc hạn thủ công (bên trong LEFT column) */}
                    {isEhsAdmin && !capaIsClosed && (
                      <div style={{ background:"#fff", borderRadius:13, border:"1px solid #e8edf5",
                        overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                        <div style={{ padding:"10px 16px", background:"#f0f9ff", borderBottom:"1px solid #bae6fd",
                          fontSize:12, fontWeight:800, color:"#075985", letterSpacing:"0.06em" }}>
                          🔔 GỬI NHẮC HẠN THỦ CÔNG
                        </div>
                        <div style={{ padding:"14px 16px", display:"flex", flexDirection:"column", gap:10 }}>
                          <div style={{ fontSize:12.5, color:"#334155", lineHeight:1.6 }}>
                            Gửi thông báo nhắc hạn ngay đến <strong>Owner</strong> và <strong>người tạo CAPA</strong>
                            {action.departmentCode ? ` (Bộ phận ${action.departmentCode})` : ""}.
                          </div>
                          {remindError && (
                            <div style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 12px",
                              borderRadius:8, background:"#fef2f2", border:"1px solid #fecaca" }}>
                              <span>⚠️</span>
                              <span style={{ fontSize:12.5, fontWeight:600, color:"#dc2626" }}>{remindError}</span>
                            </div>
                          )}
                          {remindDone && (
                            <div style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 12px",
                              borderRadius:8, background:"#f0fdf4", border:"1px solid #bbf7d0" }}>
                              <span>✅</span>
                              <span style={{ fontSize:12.5, fontWeight:700, color:"#15803d" }}>Đã gửi nhắc hạn thành công!</span>
                            </div>
                          )}
                          <button onClick={submitReminder} disabled={reminding || remindDone}
                            style={{ padding:"10px 0", borderRadius:9, border:"none", width:"100%",
                              cursor: (reminding||remindDone) ? "not-allowed" : "pointer",
                              fontSize:13, fontWeight:800, letterSpacing:"0.02em",
                              background: remindDone ? "#dcfce7"
                                : reminding ? "#e0f2fe"
                                : "linear-gradient(135deg,#0284c7,#38bdf8)",
                              color: remindDone ? "#15803d" : reminding ? "#0369a1" : "#fff",
                              boxShadow: (!reminding&&!remindDone) ? "0 4px 14px rgba(2,132,199,.3)" : "none",
                              transition:"all .18s" }}>
                            {remindDone ? "✅ Đã gửi nhắc hạn" : reminding ? "Đang gửi..." : "🔔 Gửi nhắc hạn ngay"}
                          </button>
                          <div style={{ fontSize:11, color:"#94a3b8", lineHeight:1.5 }}>
                            ℹ️ Hệ thống cũng tự động nhắc hạn khi còn <strong>7, 3, 1 ngày</strong> đến deadline.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>{/* end LEFT column */}

                  {/* RIGHT — Lịch sử gia hạn + nhắc hạn */}
                  {(() => {
                    const remindLogs = logs.filter(l => l.action === "due-date-reminder");
                    const allExtLogs = extLogs; // already computed above
                    return (
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    {/* Lịch sử gia hạn */}
                    <div style={{ background:"#fff", borderRadius:13, border:"1px solid #e8edf5",
                      overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                      <div style={{ padding:"10px 16px", background:"#f8fafc", borderBottom:"1px solid #e8edf5" }}>
                        <span style={{ fontSize:12, fontWeight:800, color:"#334155", letterSpacing:"0.06em" }}>
                          📋 LỊCH SỬ GIA HẠN {allExtLogs.length > 0 ? `(${allExtLogs.length} lần)` : ""}
                        </span>
                      </div>
                      <div style={{ padding:"14px 16px", maxHeight:280, overflowY:"auto" }}>
                        {!logsLoaded && (
                          <div style={{ textAlign:"center", color:"#64748b", padding:"20px 0", fontSize:13 }}>⏳ Đang tải...</div>
                        )}
                        {logsLoaded && allExtLogs.length === 0 && (
                          <div style={{ textAlign:"center", padding:"24px 16px", color:"#94a3b8" }}>
                            <div style={{ fontSize:28, marginBottom:6 }}>📅</div>
                            <div style={{ fontSize:13, fontWeight:600 }}>Chưa có lần gia hạn nào</div>
                          </div>
                        )}
                        {logsLoaded && allExtLogs.length > 0 && (
                          <div style={{ display:"flex", flexDirection:"column", gap:0, position:"relative" }}>
                            <div style={{ position:"absolute", left:15, top:16, bottom:8, width:2,
                              background:"linear-gradient(180deg,#fde68a,#f8fafc)", borderRadius:2 }} />
                            {[...allExtLogs].reverse().map((l, i) => {
                              const meta = l.meta || {};
                              const reason = meta.reason || (l.summary?.split("| Lý do: ")[1] || "");
                              const prevDue = meta.prevDueDate || (l.summary?.match(/(\S+) → /)?.[1] || "");
                              const newDue  = meta.newDueDate  || (l.summary?.match(/→ (\S+)/)?.[1] || "");
                              const isFirst = i === 0;
                              const ts = l.createdAt ? new Date(l.createdAt).toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "";
                              return (
                                <div key={l.id||i} style={{ display:"flex", gap:12, paddingBottom: i < allExtLogs.length-1 ? 14 : 0, alignItems:"flex-start", position:"relative" }}>
                                  <div style={{ width:30, height:30, borderRadius:"50%", flexShrink:0,
                                    background: isFirst ? "#f59e0b" : "#fff", border:"2.5px solid #f59e0b",
                                    display:"flex", alignItems:"center", justifyContent:"center",
                                    fontSize:14, zIndex:1, position:"relative" }}>📅</div>
                                  <div style={{ flex:1, paddingTop:3 }}>
                                    <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:4 }}>
                                      <span style={{ fontSize:12, fontWeight:800, color:"#78350f" }}>Lần {allExtLogs.length - i}</span>
                                      {prevDue && newDue && (
                                        <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                                          <span style={{ fontSize:11, padding:"1px 6px", borderRadius:5, background:"#fef3c7", color:"#92400e", fontWeight:700 }}>{prevDue}</span>
                                          <span style={{ fontSize:10, color:"#94a3b8" }}>→</span>
                                          <span style={{ fontSize:11, padding:"1px 6px", borderRadius:5, background:"#dcfce7", color:"#15803d", fontWeight:800 }}>{newDue}</span>
                                        </div>
                                      )}
                                    </div>
                                    {reason && (
                                      <div style={{ padding:"6px 10px", borderRadius:7, background:"#fffbeb", border:"1px solid #fde68a",
                                        fontSize:12, color:"#1e293b", lineHeight:1.5, marginBottom:4 }}>
                                        <span style={{ fontWeight:700, color:"#92400e", marginRight:5 }}>Lý do:</span>{reason}
                                      </div>
                                    )}
                                    <div style={{ display:"flex", gap:6, fontSize:11, color:"#94a3b8", flexWrap:"wrap" }}>
                                      {l.actorName && <span>👤 {l.actorName}</span>}
                                      {ts && <span>🕐 {ts}</span>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Lịch sử nhắc hạn */}
                    <div style={{ background:"#fff", borderRadius:13, border:"1px solid #e8edf5",
                      overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                      <div style={{ padding:"10px 16px", background:"#f0f9ff", borderBottom:"1px solid #bae6fd" }}>
                        <span style={{ fontSize:12, fontWeight:800, color:"#075985", letterSpacing:"0.06em" }}>
                          🔔 LỊCH SỬ NHẮC HẠN {remindLogs.length > 0 ? `(${remindLogs.length} lần)` : ""}
                        </span>
                      </div>
                      <div style={{ padding:"14px 16px", maxHeight:220, overflowY:"auto" }}>
                        {!logsLoaded && (
                          <div style={{ textAlign:"center", color:"#64748b", padding:"20px 0", fontSize:13 }}>⏳ Đang tải...</div>
                        )}
                        {logsLoaded && remindLogs.length === 0 && (
                          <div style={{ textAlign:"center", padding:"20px 16px", color:"#94a3b8" }}>
                            <div style={{ fontSize:26, marginBottom:6 }}>🔔</div>
                            <div style={{ fontSize:12.5, fontWeight:600, marginBottom:3 }}>Chưa có lần nhắc hạn nào</div>
                            <div style={{ fontSize:11 }}>Hệ thống tự nhắc khi còn 7, 3, 1 ngày</div>
                          </div>
                        )}
                        {logsLoaded && remindLogs.length > 0 && (
                          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                            {[...remindLogs].reverse().map((l, i) => {
                              const meta  = l.meta || {};
                              const isManual = meta.manual === true || l.summary?.includes("thủ công");
                              const days  = meta.daysLeft ?? (l.summary?.match(/còn (\d+) ngày/)?.[1] ? Number(l.summary?.match(/còn (\d+) ngày/)?.[1]) : null);
                              const ts = l.createdAt ? new Date(l.createdAt).toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "";
                              return (
                                <div key={l.id||i} style={{ padding:"9px 12px", borderRadius:10,
                                  background: isManual ? "#f0f9ff" : "#f8fafc",
                                  border:`1px solid ${isManual ? "#bae6fd" : "#e2e8f0"}` }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4, flexWrap:"wrap" }}>
                                    <span style={{ fontSize:13 }}>{isManual ? "👆" : "🤖"}</span>
                                    <span style={{ fontSize:12, fontWeight:800, color: isManual ? "#0369a1" : "#475569" }}>
                                      {isManual ? "Nhắc thủ công" : "Nhắc tự động"}
                                    </span>
                                    {days != null && (
                                      <span style={{ fontSize:11, padding:"1px 7px", borderRadius:5,
                                        background: days <= 1 ? "#fef2f2" : days <= 3 ? "#fff7ed" : "#f0fdf4",
                                        color: days <= 1 ? "#dc2626" : days <= 3 ? "#d97706" : "#15803d",
                                        fontWeight:700 }}>
                                        {days === 0 ? "Đến hạn hôm nay" : `Còn ${days} ngày`}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display:"flex", gap:6, fontSize:11, color:"#94a3b8", flexWrap:"wrap" }}>
                                    {l.actorName && <span>👤 {l.actorName}</span>}
                                    {ts && <span>🕐 {ts}</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                    );
                  })()}

                </div>
              );
            })()}


          </div>

          {/* ══════ FOOTER ══════ */}
          <div style={{ padding:"13px 24px", borderTop:"1.5px solid #e8edf5",
            display:"flex", justifyContent:"space-between", alignItems:"center",
            background:"#fff", flexShrink:0 }}>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              {ns === "draft" && !isEhsAdmin && (
                <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 18px", borderRadius:9,
                  background:"#f8fafc", border:"1.5px solid #cbd5e1", fontSize:13.5, color:"#64748b", fontWeight:600 }}>
                  <span style={{ fontSize:16 }}>⏳</span> CAPA đang chờ phê duyệt từ EHS...
                </div>
              )}
              {ns === "draft" && isEhsAdmin && (
                rejectMode ? (
                  <div style={{ display:"flex", alignItems:"center", gap:8, flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"#dc2626", whiteSpace:"nowrap" }}>Lý do từ chối:</div>
                    <input
                      autoFocus
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      onKeyDown={e => { if(e.key==="Enter") rejectAction(); if(e.key==="Escape") setRejectMode(false); }}
                      placeholder="Nhập lý do cụ thể..."
                      style={{ flex:1, padding:"8px 12px", borderRadius:8, border:"1.5px solid #fca5a5",
                        fontSize:13, outline:"none", fontFamily:"inherit", color:"#0f172a" }} />
                    <button onClick={rejectAction} disabled={rejecting}
                      style={{ padding:"9px 16px", borderRadius:8, border:"none", cursor:"pointer",
                        background:"#dc2626", color:"#fff", fontSize:13, fontWeight:700, whiteSpace:"nowrap",
                        opacity: rejecting ? 0.6 : 1 }}>
                      {rejecting ? "..." : "❌ Xác nhận từ chối"}
                    </button>
                    <button onClick={() => { setRejectMode(false); setRejectReason(""); }}
                      style={{ padding:"9px 14px", borderRadius:8, border:"1.5px solid #e2e8f0",
                        background:"#fff", color:"#475569", fontSize:13, fontWeight:600, cursor:"pointer" }}>Hủy</button>
                  </div>
                ) : (
                  <>
                    <button onClick={approveAction} disabled={approving}
                      style={{ padding:"10px 22px", borderRadius:9, cursor:"pointer", border:"none",
                        background:"linear-gradient(135deg,#15803d,#22c55e)",
                        fontSize:14, fontWeight:800, color:"#fff",
                        boxShadow:"0 4px 14px rgba(21,128,61,.3)",
                        opacity: approving ? 0.6 : 1 }}>
                      {approving ? "Đang xử lý..." : "✅ Phê duyệt"}
                    </button>
                    <button onClick={() => setRejectMode(true)}
                      style={{ padding:"10px 20px", borderRadius:9, cursor:"pointer",
                        border:"1.5px solid #fca5a5", background:"#fef2f2",
                        fontSize:13.5, fontWeight:700, color:"#dc2626" }}>
                      ❌ Từ chối
                    </button>
                  </>
                )
              )}
              {ns === "rejected" && !isEhsAdmin && (
                <button onClick={resubmitAction} disabled={resubmitting}
                  style={{ padding:"10px 22px", borderRadius:9, cursor:"pointer", border:"none",
                    background:"linear-gradient(135deg,#7c3aed,#8b5cf6)",
                    fontSize:13.5, fontWeight:700, color:"#fff",
                    boxShadow:"0 4px 14px rgba(124,58,237,.3)",
                    opacity: resubmitting ? 0.6 : 1 }}>
                  {resubmitting ? "Đang gửi..." : "🔁 Gửi lại để phê duyệt"}
                </button>
              )}
              {ns === "rejected" && isEhsAdmin && (
                <button onClick={approveAction} disabled={approving}
                  style={{ padding:"10px 22px", borderRadius:9, cursor:"pointer", border:"none",
                    background:"linear-gradient(135deg,#15803d,#22c55e)",
                    fontSize:13.5, fontWeight:700, color:"#fff",
                    boxShadow:"0 4px 14px rgba(21,128,61,.3)",
                    opacity: approving ? 0.6 : 1 }}>
                  {approving ? "Đang xử lý..." : "✅ Phê duyệt (lần này)"}
                </button>
              )}
              {ns === "open" && (
                <button onClick={acceptAction} disabled={accepting}
                  style={{ padding:"10px 28px", borderRadius:9, cursor:"pointer", border:"none",
                    background:"linear-gradient(135deg,#1e3a8a,#1d4ed8)",
                    fontSize:14, fontWeight:800, color:"#fff",
                    boxShadow:"0 4px 18px rgba(30,64,175,.35)" }}>
                  {accepting ? "Đang xử lý..." : "✋ Nhận xử lý"}
                </button>
              )}
              {ns === "in_progress" && (
                <button onClick={() => setActiveTab(2)}
                  style={{ padding:"10px 22px", borderRadius:9, cursor:"pointer", border:"none",
                    background:"linear-gradient(135deg,#0369a1,#0891b2)",
                    fontSize:13.5, fontWeight:700, color:"#fff",
                    boxShadow:"0 4px 14px rgba(3,105,161,.3)" }}>
                  🏁 Nộp bằng chứng →
                </button>
              )}
              {ns === "done_by_owner" && !isEhsAdmin && (
                <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 18px", borderRadius:9,
                  background:"#ecfeff", border:"1.5px solid #a5f3fc", fontSize:13.5, color:"#0e7490", fontWeight:600 }}>
                  <span style={{ fontSize:16 }}>🔷</span> Đang chờ EHS xác minh...
                </div>
              )}
              {ns === "done_by_owner" && isEhsAdmin && (
                <button onClick={() => setActiveTab(2)}
                  style={{ padding:"10px 22px", borderRadius:9, cursor:"pointer", border:"none",
                    background:"linear-gradient(135deg,#15803d,#22c55e)",
                    fontSize:13.5, fontWeight:700, color:"#fff",
                    boxShadow:"0 4px 14px rgba(21,128,61,.3)" }}>
                  ✅ Xác minh CAPA →
                </button>
              )}
              {ns === "closed" && (
                <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 18px", borderRadius:9,
                  background:"#f0fdf4", border:"1.5px solid #86efac", fontSize:13.5, color:"#15803d", fontWeight:700 }}>
                  ✅ CAPA đã đóng thành công
                </div>
              )}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              {ns !== "closed" && (
                <button onClick={() => { setActiveTab(4); setExtDate(due || ""); setExtReason(""); setExtError(""); setExtDone(false); }}
                  style={{ padding:"9px 18px", borderRadius:9, cursor:"pointer",
                    border:`1.5px solid ${activeTab===4 ? "#f59e0b" : "#fde68a"}`,
                    background: activeTab===4 ? "#fef9c3" : "#fffbeb",
                    fontSize:13, fontWeight:700, color:"#d97706",
                    transition:"all .15s" }}>
                  📅 Gia hạn
                </button>
              )}
              {ns !== "closed" && onEdit && isEhsAdmin && (
                <button onClick={() => onEdit(action)}
                  style={{ padding:"9px 18px", borderRadius:9, cursor:"pointer",
                    border:"1.5px solid #e9d5ff", background:"#faf5ff",
                    fontSize:13, fontWeight:700, color:"#7c3aed",
                    transition:"all .15s" }}
                  onMouseEnter={e => { e.currentTarget.style.background="#ede9fe"; e.currentTarget.style.borderColor="#c4b5fd"; }}
                  onMouseLeave={e => { e.currentTarget.style.background="#faf5ff"; e.currentTarget.style.borderColor="#e9d5ff"; }}>
                  ✏️ Chỉnh sửa
                </button>
              )}
              <button onClick={printCapaToPdf}
                style={{ padding:"9px 18px", borderRadius:9, cursor:"pointer",
                  border:"1.5px solid #bfdbfe", background:"#eff6ff",
                  fontSize:13, fontWeight:700, color:"#1d4ed8" }}>
                🖨️ Xuất PDF
              </button>
              <button onClick={onClose}
                style={{ padding:"9px 22px", borderRadius:9, cursor:"pointer",
                  border:"1.5px solid #e2e8f0", background:"#fff",
                  fontSize:13, fontWeight:600, color:"#475569" }}>Đóng</button>
            </div>
          </div>

        </div>
      </div>

      {/* ── PDF Viewer Modal ── */}
      {officeViewFile && (
        <OfficeFileViewer
          url={officeViewFile.url}
          fileName={officeViewFile.name}
          onClose={() => setOfficeViewFile(null)}
        />
      )}

      {pdfViewUrl && (
        <div style={{ position:"fixed", inset:0, zIndex:1200, background:"rgba(0,0,0,0.82)", display:"flex", flexDirection:"column" }}>
          <div style={{ flexShrink:0, height:48, background:"#0f172a",
            display:"flex", alignItems:"center", padding:"0 16px", gap:12 }}>
            <span style={{ fontSize:14, fontWeight:700, color:"#f1f5f9", flex:1,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>📕 Xem PDF</span>
            <a href={pdfViewUrl} target="_blank" rel="noopener noreferrer"
              style={{ padding:"5px 14px", borderRadius:6, textDecoration:"none",
                background:"#1e3a5f", border:"1px solid #334155", fontSize:12, color:"#93c5fd", fontWeight:700 }}>
              🔗 Tab mới
            </a>
            <button onClick={() => setPdfViewUrl("")}
              style={{ padding:"5px 14px", borderRadius:6, cursor:"pointer",
                background:"#dc2626", border:"none", fontSize:12, fontWeight:700, color:"#fff" }}>✕ Đóng</button>
          </div>
          <div style={{ flex:1, overflow:"hidden" }}>
            <PdfJsViewer url={pdfViewUrl} style={{ width:"100%", height:"100%" }} />
          </div>
        </div>
      )}
    </>
  , document.body);
}

// ─── FileRow helper — chip icon với tooltip portal & click-to-view ───────────
function FileRow({ f, purple = false, green = false, onView, onViewPdf, onViewOffice, onDelete }: any) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null);
  function handleEnter() {
    if (wrapRef.current) { const r = wrapRef.current.getBoundingClientRect(); setTipPos({ x: r.left + r.width / 2, y: r.top - 8 }); }
  }
  const name = f.originalName || f.fileName || f.name || "file";
  // Ưu tiên tên file (originalName/fileName/name) để xác định loại — URL có thể không có đuôi mở rộng
  const extFromName = name.split(".").pop()?.toUpperCase() || "";
  const extFromUrl  = (f.url||"").split(".").pop()?.split("?")[0]?.toUpperCase() || "";
  const ext = extFromName || extFromUrl;
  const isImg        = ["JPG","JPEG","PNG","GIF","WEBP","BMP","SVG"].includes(ext) || isImage(f.url || "");
  const isPdfFile    = !isImg && (ext === "PDF" || isPdf(f.url || ""));
  const isOfficeFile = !isImg && !isPdfFile && (["XLSX","XLS","DOC","DOCX"].includes(ext) || isOffice(f.url || ""));
  const icon      = isImg ? "🖼️" : isPdfFile ? "📕" : ["XLSX","XLS"].includes(ext) ? "📗" : ["DOCX","DOC"].includes(ext) ? "📘" : "📄";
  const typeLabel = isImg ? "IMG"  : isPdfFile ? "PDF"  : ["XLSX","XLS"].includes(ext) ? "XLSX" : ["DOCX","DOC"].includes(ext) ? "DOCX" : (ext || "FILE");
  const chipColor  = purple ? "#7c3aed" : green ? "#15803d" : "#475569";
  const chipBorder = purple ? "#d8b4fe" : green ? "#86efac" : "#e2e8f0";
  const chipBg     = purple ? "#f5f3ff" : green ? "#f0fdf4" : "#f8fafc";
  function handleClick() {
    if (isImg && onView) onView();
    else if (isPdfFile && onViewPdf) onViewPdf();
    else if (isOfficeFile && onViewOffice) onViewOffice();
    else if (f.url) window.open(f.url, "_blank");
  }
  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}
      onMouseEnter={handleEnter} onMouseLeave={() => setTipPos(null)}>
      {tipPos && createPortal(
        <div style={{ position: "fixed", top: tipPos.y, left: tipPos.x,
          transform: "translate(-50%,-100%)", zIndex: 99999,
          background: "#1e293b", color: "#fff", borderRadius: 9,
          padding: "8px 12px", fontSize: 11.5, pointerEvents: "none",
          boxShadow: "0 6px 20px rgba(0,0,0,.32)",
          minWidth: 160, maxWidth: 240, whiteSpace: "normal", wordBreak: "break-all", lineHeight: 1.4 }}>
          <div style={{ fontWeight: 800, marginBottom: 3, fontSize: 12 }}>{name}</div>
          <div style={{ color: "#94a3b8", fontSize: 10.5 }}>{typeLabel}</div>
          <div style={{ marginTop: 4, fontSize: 10, color: "#60a5fa", fontWeight: 700 }}>👁 Nhấn để xem</div>
          <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0, borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent", borderTop: "5px solid #1e293b" }} />
        </div>, document.body
      )}
      <button onClick={handleClick} title={name}
        style={{ width: 60, height: 70, borderRadius: 11,
          border: `2px solid ${tipPos ? chipColor : chipBorder}`,
          background: chipBg, cursor: "pointer",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 3, padding: "4px 3px", transition: "all .13s",
          boxShadow: tipPos ? `0 4px 14px ${chipColor}30` : "0 1px 4px rgba(0,0,0,.07)" }}>
        <span style={{ fontSize: 28, lineHeight: 1 }}>{icon}</span>
        <span style={{ fontSize: 8.5, fontWeight: 800, color: chipColor,
          textTransform: "uppercase", letterSpacing: "0.05em", lineHeight: 1 }}>{typeLabel}</span>
      </button>
      {onDelete && (
        <button onClick={e => { e.stopPropagation(); onDelete(); }} title="Xóa file"
          style={{ position: "absolute", top: -5, right: -5,
            width: 17, height: 17, borderRadius: "50%",
            background: "#ef4444", border: "2px solid #fff",
            color: "#fff", fontSize: 9, fontWeight: 900, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 0, lineHeight: 1 }}>🗑</button>
      )}
      {!onDelete && f.url && (
        <a href={f.url} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()} title="Mở tab mới"
          style={{ position: "absolute", top: -5, right: -5,
            width: 17, height: 17, borderRadius: "50%",
            background: "#3b82f6", border: "2px solid #fff",
            color: "#fff", fontSize: 10, display: "flex",
            alignItems: "center", justifyContent: "center",
            textDecoration: "none", lineHeight: 1 }}>↗</a>
      )}
    </div>
  );
}
