import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X, Download, FileText, FileSpreadsheet, Printer,
  CheckSquare, Square, Calendar, Filter, Users,
  BarChart3, ListChecks, AlertTriangle, CheckCircle2,
  Clock, TrendingUp, Loader2,
} from "lucide-react";
import * as XLSX from "xlsx";
import "./capa-export-modal.css";

/* ── shared item shape (CapaAction & SafetyAction both satisfy this) ── */
export interface CapaExportItem {
  id: string; code: string; title: string;
  departmentCode?: string; priority?: string; status: string;
  ownerName?: string; createdByName?: string;
  dueDate?: string; createdAt?: string;
  sourceType?: string; problemType?: string;
  rejectionNote?: string;
}

export interface CapaExportModalProps {
  actions: CapaExportItem[];
  onClose: () => void;
  initialDept?: string | null;
  pageTitle?: string;
}

/* ── constants ─────────────────────────────────────────────── */
const STATUS_LABEL: Record<string, string> = {
  draft: "Chờ duyệt", pending_ehs: "Chờ duyệt EHS",
  open: "Đã duyệt", in_progress: "Đang làm",
  done_by_owner: "Chờ nghiệm thu", closed: "Hoàn thành",
  rejected: "Từ chối",
  assigned: "Đã phân công", reopened: "Mở lại", blocked: "Tạm dừng",
};
const PRI_LABEL: Record<string, string> = {
  critical: "Khẩn cấp", high: "Cao", medium: "Trung bình", low: "Thấp",
};
const PRI_ORDER: Record<string, number> = { critical:0, high:1, medium:2, low:3 };
const SRC_LABEL: Record<string, string> = {
  manual:"Thủ công", warning:"Cảnh báo nóng", incident:"Sự cố",
  iplan:"Kế hoạch KT", inspection:"Kế hoạch KT", audit:"Audit", pccc:"PCCC", kyt:"KYT",
};

type PeriodKey = "month" | "quarter" | "year" | "custom";
type FormatKey = "excel" | "csv" | "pdf";

const PERIOD_TABS: { key: PeriodKey; label: string }[] = [
  { key:"month",   label:"Tháng này" },
  { key:"quarter", label:"Quý này"   },
  { key:"year",    label:"Năm này"   },
  { key:"custom",  label:"Tùy chỉnh" },
];

const STATUS_OPTS = [
  { key:"draft",        label:"Chờ duyệt",       color:"#f97316" },
  { key:"pending_ehs",  label:"Chờ duyệt EHS",   color:"#ea580c" },
  { key:"open",         label:"Đã duyệt",         color:"#3b82f6" },
  { key:"in_progress",  label:"Đang làm",         color:"#2563eb" },
  { key:"done_by_owner",label:"Chờ nghiệm thu",   color:"#d97706" },
  { key:"closed",       label:"Hoàn thành",       color:"#16a34a" },
  { key:"rejected",     label:"Từ chối",           color:"#dc2626" },
];

const SECTION_OPTS = [
  { id:"stats",    label:"Thống kê tổng hợp",    icon:BarChart3,     desc:"7 chỉ số: tổng, quá hạn, trạng thái…" },
  { id:"dept",     label:"Tổng hợp theo bộ phận",icon:Users,         desc:"Bảng đầy đủ mỗi bộ phận" },
  { id:"overdue",  label:"CAPA quá hạn",          icon:AlertTriangle, desc:"Chỉ các CAPA đã quá hạn" },
  { id:"list",     label:"Danh sách chi tiết",    icon:ListChecks,    desc:"Tất cả CAPA khớp điều kiện" },
];

/* ── helpers ─────────────────────────────────────────────────── */
const today = () => new Date().toISOString().slice(0, 10);
const isOverdue = (d?: string) => !!d && d < today();

function getPeriodBounds(period: PeriodKey, from: string, to: string): { pFrom: Date | null; pTo: Date | null; label: string } {
  const now = new Date();
  const yr = now.getFullYear(), mo = now.getMonth();
  if (period === "month") {
    return { pFrom: new Date(yr, mo, 1), pTo: new Date(yr, mo + 1, 0, 23, 59, 59), label: now.toLocaleDateString("vi-VN", { month:"long", year:"numeric" }) };
  }
  if (period === "quarter") {
    const q = Math.floor(mo / 3);
    return { pFrom: new Date(yr, q * 3, 1), pTo: new Date(yr, q * 3 + 3, 0, 23, 59, 59), label: `Quý ${q+1}/${yr}` };
  }
  if (period === "year") {
    return { pFrom: new Date(yr, 0, 1), pTo: new Date(yr, 11, 31, 23, 59, 59), label: `Năm ${yr}` };
  }
  return {
    pFrom: from ? new Date(from) : null,
    pTo:   to   ? new Date(to + "T23:59:59") : null,
    label: (from && to) ? `${new Date(from).toLocaleDateString("vi-VN")} – ${new Date(to).toLocaleDateString("vi-VN")}` : "Tùy chỉnh",
  };
}

function filterByPeriod(actions: CapaExportItem[], period: PeriodKey, from: string, to: string) {
  const { pFrom, pTo } = getPeriodBounds(period, from, to);
  if (!pFrom && !pTo) return actions;
  return actions.filter(a => {
    if (!a.createdAt) return period === "custom";
    const d = new Date(a.createdAt);
    if (pFrom && d < pFrom) return false;
    if (pTo   && d > pTo)   return false;
    return true;
  });
}

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("vi-VN");
}

/* ── CSV builder ──────────────────────────────────────────────── */
function buildCSV(filtered: CapaExportItem[], sections: Set<string>, title: string, periodLabel: string): string {
  const rows: string[][] = [];
  const add = (...cells: (string|number)[]) => rows.push(cells.map(String));
  const sep = () => rows.push([]);

  add(title);
  add(`Kỳ báo cáo: ${periodLabel}`);
  add(`Xuất lúc: ${new Date().toLocaleDateString("vi-VN", { day:"2-digit", month:"2-digit", year:"numeric" })}`);
  sep();

  const ov = filtered.filter(a => isOverdue(a.dueDate) && a.status !== "closed" && a.status !== "rejected");

  if (sections.has("stats")) {
    add("THỐNG KÊ TỔNG HỢP");
    add("Chỉ số", "Giá trị");
    add("Tổng CAPA trong kỳ", filtered.length);
    add("Chờ phê duyệt", filtered.filter(a => a.status==="draft"||a.status==="pending_ehs").length);
    add("Đang triển khai", filtered.filter(a => a.status==="open"||a.status==="in_progress").length);
    add("Chờ nghiệm thu",  filtered.filter(a => a.status==="done_by_owner").length);
    add("Hoàn thành",      filtered.filter(a => a.status==="closed").length);
    add("Từ chối",          filtered.filter(a => a.status==="rejected").length);
    add("Quá hạn",          ov.length);
    sep();
  }

  if (sections.has("dept")) {
    add("TỔNG HỢP THEO BỘ PHẬN");
    add("Bộ phận","Tổng","Chờ duyệt","Đang TH","Chờ NT","Hoàn thành","Từ chối","Quá hạn");
    const deptMap: Record<string,number[]> = {};
    filtered.forEach(a => {
      const d = a.departmentCode || "EHS";
      if (!deptMap[d]) deptMap[d] = [0,0,0,0,0,0,0];
      deptMap[d][0]++;
      if (a.status==="draft"||a.status==="pending_ehs") deptMap[d][1]++;
      if (a.status==="open"||a.status==="in_progress") deptMap[d][2]++;
      if (a.status==="done_by_owner") deptMap[d][3]++;
      if (a.status==="closed") deptMap[d][4]++;
      if (a.status==="rejected") deptMap[d][5]++;
      if (isOverdue(a.dueDate) && a.status!=="closed" && a.status!=="rejected") deptMap[d][6]++;
    });
    Object.entries(deptMap).sort((a,b)=>b[1][0]-a[1][0]).forEach(([dept,v])=>add(dept,...v));
    sep();
  }

  if (sections.has("overdue") && ov.length > 0) {
    add("CAPA QUÁ HẠN");
    add("Mã","Tiêu đề","Bộ phận","Ưu tiên","Trạng thái","Người phụ trách","Hạn xử lý");
    ov.forEach(a => add(a.code, a.title, a.departmentCode||"EHS", PRI_LABEL[a.priority||"medium"]||"", STATUS_LABEL[a.status]||a.status, a.ownerName||"—", a.dueDate||""));
    sep();
  }

  if (sections.has("list")) {
    add("DANH SÁCH CHI TIẾT CAPA");
    add("Mã","Tiêu đề","Bộ phận","Ưu tiên","Trạng thái","Người phụ trách","Ngày tạo","Hạn xử lý","Nguồn","Ghi chú");
    filtered.forEach(a => add(
      a.code, a.title, a.departmentCode||"EHS",
      PRI_LABEL[a.priority||"medium"]||"",
      STATUS_LABEL[a.status]||a.status,
      a.ownerName||"—",
      fmtDate(a.createdAt), a.dueDate||"",
      SRC_LABEL[a.sourceType||"manual"]||"",
      a.rejectionNote||""
    ));
  }

  const BOM = "\uFEFF";
  return BOM + rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\r\n");
}

/* ── Excel builder ─────────────────────────────────────────────── */
function buildExcel(filtered: CapaExportItem[], sections: Set<string>, title: string, periodLabel: string) {
  const wb = XLSX.utils.book_new();
  const t = new Date().toLocaleDateString("vi-VN", { day:"2-digit", month:"2-digit", year:"numeric" });
  const ov = filtered.filter(a => isOverdue(a.dueDate) && a.status !== "closed" && a.status !== "rejected");

  /* Sheet 1: Chi tiết */
  if (sections.has("list")) {
    const rows = filtered
      .sort((a,b) => (PRI_ORDER[a.priority||"medium"]??2) - (PRI_ORDER[b.priority||"medium"]??2))
      .map(a => ({
        "Mã CAPA":         a.code,
        "Tiêu đề":         a.title,
        "Bộ phận":         a.departmentCode||"EHS",
        "Ưu tiên":         PRI_LABEL[a.priority||"medium"]||"",
        "Trạng thái":      STATUS_LABEL[a.status]||a.status,
        "Người phụ trách": a.ownerName||"—",
        "Tạo bởi":         a.createdByName||"—",
        "Ngày tạo":        a.createdAt ? a.createdAt.slice(0,10) : "",
        "Hạn xử lý":       a.dueDate||"",
        "Quá hạn":         isOverdue(a.dueDate) && a.status!=="closed" && a.status!=="rejected" ? "Có" : "",
        "Nguồn":           SRC_LABEL[a.sourceType||"manual"]||"",
        "Ghi chú":         a.rejectionNote||"",
      }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [14,44,10,12,18,20,18,12,12,8,16,20].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws, "Chi tiết CAPA");
  }

  /* Sheet 2: Tổng hợp */
  if (sections.has("dept") || sections.has("stats")) {
    const deptMap: Record<string,{total:number;pending:number;active:number;done:number;closed:number;rejected:number;overdue:number}> = {};
    filtered.forEach(a => {
      const d = a.departmentCode||"EHS";
      if (!deptMap[d]) deptMap[d]={total:0,pending:0,active:0,done:0,closed:0,rejected:0,overdue:0};
      deptMap[d].total++;
      if (a.status==="draft"||a.status==="pending_ehs") deptMap[d].pending++;
      else if (a.status==="open"||a.status==="in_progress") deptMap[d].active++;
      else if (a.status==="done_by_owner") deptMap[d].done++;
      else if (a.status==="closed") deptMap[d].closed++;
      else if (a.status==="rejected") deptMap[d].rejected++;
      if (isOverdue(a.dueDate) && a.status!=="closed" && a.status!=="rejected") deptMap[d].overdue++;
    });
    const summaryRows = Object.entries(deptMap).sort((a,b)=>b[1].total-a[1].total).map(([dept,v])=>({
      "Bộ phận":      dept,
      "Tổng CAPA":    v.total,
      "Chờ phê duyệt":v.pending,
      "Đang triển khai":v.active,
      "Chờ nghiệm thu":v.done,
      "Hoàn thành":   v.closed,
      "Từ chối":       v.rejected,
      "Quá hạn":      v.overdue,
    }));
    summaryRows.push({
      "Bộ phận":"TỔNG CỘNG",
      "Tổng CAPA":filtered.length,
      "Chờ phê duyệt":filtered.filter(a=>a.status==="draft"||a.status==="pending_ehs").length,
      "Đang triển khai":filtered.filter(a=>a.status==="open"||a.status==="in_progress").length,
      "Chờ nghiệm thu":filtered.filter(a=>a.status==="done_by_owner").length,
      "Hoàn thành":filtered.filter(a=>a.status==="closed").length,
      "Từ chối":filtered.filter(a=>a.status==="rejected").length,
      "Quá hạn":ov.length,
    });
    const ws2 = XLSX.utils.json_to_sheet(summaryRows);
    ws2["!cols"] = [16,12,16,18,16,12,10,10].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws2, "Tổng hợp theo BP");
  }

  /* Sheet 3: Quá hạn */
  if (sections.has("overdue") && ov.length > 0) {
    const ovRows = ov.map(a => ({
      "Mã CAPA":a.code,"Tiêu đề":a.title,"Bộ phận":a.departmentCode||"EHS",
      "Ưu tiên":PRI_LABEL[a.priority||"medium"]||"",
      "Trạng thái":STATUS_LABEL[a.status]||a.status,
      "Người phụ trách":a.ownerName||"—","Hạn xử lý":a.dueDate||"",
    }));
    const ws3 = XLSX.utils.json_to_sheet(ovRows);
    ws3["!cols"] = [14,44,10,12,18,20,12].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws3, "CAPA Quá hạn");
  }

  const fileName = `CAPA_${title.replace(/\s+/g,"_")}_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/* ════════════════════════════════════════════════════
   MODAL COMPONENT
════════════════════════════════════════════════════ */
export function CapaExportModal({ actions, onClose, initialDept, pageTitle = "Phê duyệt CAPA" }: CapaExportModalProps) {
  /* body scroll lock */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* ESC to close */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  /* ── state ── */
  const [format,   setFormat]   = useState<FormatKey>("excel");
  const [period,   setPeriod]   = useState<PeriodKey>("month");
  const [fromDate, setFromDate] = useState("");
  const [toDate,   setToDate]   = useState("");
  const [deptSel,  setDeptSel]  = useState<string>(initialDept || "");
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set(STATUS_OPTS.map(s => s.key)));
  const [sections, setSections] = useState<Set<string>>(new Set(["stats","dept","overdue","list"]));
  const [titleInput, setTitleInput] = useState(`Báo cáo CAPA – ${pageTitle}`);
  const [exporting, setExporting] = useState(false);

  /* ── unique depts ── */
  const depts = useMemo(() => Array.from(new Set(actions.map(a => a.departmentCode || "EHS"))).sort(), [actions]);

  /* ── filtered count ── */
  const filtered = useMemo(() => {
    let list = filterByPeriod(actions, period, fromDate, toDate);
    if (deptSel) list = list.filter(a => (a.departmentCode||"EHS") === deptSel);
    list = list.filter(a => statusSel.has(a.status));
    return list;
  }, [actions, period, fromDate, toDate, deptSel, statusSel]);

  const { label: periodLabel } = useMemo(() => getPeriodBounds(period, fromDate, toDate), [period, fromDate, toDate]);

  /* ── stats for preview ── */
  const previewStats = useMemo(() => {
    const ov = filtered.filter(a => isOverdue(a.dueDate) && a.status !== "closed" && a.status !== "rejected").length;
    return {
      total:   filtered.length,
      pending: filtered.filter(a => a.status==="draft"||a.status==="pending_ehs").length,
      active:  filtered.filter(a => a.status==="open"||a.status==="in_progress").length,
      done:    filtered.filter(a => a.status==="done_by_owner").length,
      closed:  filtered.filter(a => a.status==="closed").length,
      rejected:filtered.filter(a => a.status==="rejected").length,
      overdue: ov,
    };
  }, [filtered]);

  /* ── toggle helpers ── */
  const toggleStatus = (k: string) => setStatusSel(prev => {
    const n = new Set(prev);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });
  const toggleSection = (id: string) => setSections(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  /* ── export ── */
  const handleExport = async () => {
    if (filtered.length === 0) return;
    setExporting(true);
    await new Promise(r => setTimeout(r, 180));
    try {
      if (format === "excel") {
        buildExcel(filtered, sections, titleInput, periodLabel);
      } else if (format === "csv") {
        const csv = buildCSV(filtered, sections, titleInput, periodLabel);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url; a.download = `CAPA_${new Date().toISOString().slice(0,10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
      } else {
        window.print();
      }
    } finally {
      setExporting(false);
    }
  };

  /* ── FORMAT TABS ── */
  const FORMAT_TABS: { key: FormatKey; label: string; Icon: React.ElementType; color: string; desc: string }[] = [
    { key:"excel", label:"Excel",     Icon:FileSpreadsheet, color:"#16a34a", desc:"File .xlsx nhiều sheet" },
    { key:"csv",   label:"CSV",       Icon:Download,        color:"#2563eb", desc:"Mở được trong Excel" },
    { key:"pdf",   label:"In / PDF",  Icon:Printer,         color:"#dc2626", desc:"In hoặc lưu PDF" },
  ];

  return createPortal(
    <div className="cem-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cem-modal">

        {/* ── HEADER ── */}
        <div className="cem-header">
          <div className="cem-header-left">
            <div className="cem-header-icon">
              <Download style={{ width:18, height:18, color:"#0f172a" }} />
            </div>
            <div>
              <div className="cem-header-title">Xuất báo cáo CAPA</div>
              <div className="cem-header-sub">Chọn định dạng · lọc kỳ · tuỳ chỉnh nội dung · tải xuống</div>
            </div>
          </div>
          <button className="cem-close-btn" onClick={onClose}><X style={{ width:16, height:16 }}/></button>
        </div>

        {/* ── BODY ── */}
        <div className="cem-body">

          {/* LEFT: controls */}
          <div className="cem-left">
            <div className="cem-left-scroll">

              {/* Format tabs */}
              <div className="cem-section-label">Định dạng xuất</div>
              <div className="cem-format-tabs">
                {FORMAT_TABS.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFormat(f.key)}
                    className={`cem-format-btn${format === f.key ? " active" : ""}`}
                    style={{ "--fmt-color": f.color } as React.CSSProperties}
                  >
                    <f.Icon style={{ width:16, height:16 }}/>
                    <span className="cem-format-label">{f.label}</span>
                    <span className="cem-format-desc">{f.desc}</span>
                    {format === f.key && <div className="cem-format-check"><CheckSquare style={{ width:13, height:13 }}/></div>}
                  </button>
                ))}
              </div>

              {/* Title input */}
              <div className="cem-section-label" style={{ marginTop:16 }}>Tiêu đề báo cáo</div>
              <input
                className="cem-title-input"
                value={titleInput}
                onChange={e => setTitleInput(e.target.value)}
                placeholder="Tên báo cáo…"
              />

              {/* Period */}
              <div className="cem-section-label" style={{ marginTop:16 }}>
                <Calendar style={{ width:12, height:12 }}/> Kỳ báo cáo
              </div>
              <div className="cem-period-tabs">
                {PERIOD_TABS.map(p => (
                  <button key={p.key} onClick={() => setPeriod(p.key)} className={`cem-period-btn${period===p.key?" active":""}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              {period === "custom" && (
                <div className="cem-date-range">
                  <div className="cem-date-field">
                    <span className="cem-date-lbl">Từ</span>
                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="cem-date-input"/>
                  </div>
                  <div className="cem-date-field">
                    <span className="cem-date-lbl">Đến</span>
                    <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="cem-date-input"/>
                  </div>
                </div>
              )}

              {/* Dept filter */}
              <div className="cem-section-label" style={{ marginTop:16 }}>
                <Filter style={{ width:12, height:12 }}/> Lọc bộ phận
              </div>
              <select className="cem-select" value={deptSel} onChange={e => setDeptSel(e.target.value)}>
                <option value="">— Tất cả bộ phận —</option>
                {depts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>

              {/* Status filter */}
              <div className="cem-section-label" style={{ marginTop:16 }}>
                <Filter style={{ width:12, height:12 }}/> Lọc trạng thái
                <button className="cem-toggle-all" onClick={() => setStatusSel(prev => prev.size === STATUS_OPTS.length ? new Set() : new Set(STATUS_OPTS.map(s=>s.key)))}>
                  {statusSel.size === STATUS_OPTS.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                </button>
              </div>
              <div className="cem-status-list">
                {STATUS_OPTS.map(s => (
                  <label key={s.key} className={`cem-status-item${statusSel.has(s.key)?" checked":""}`} onClick={() => toggleStatus(s.key)}>
                    <span className="cem-status-check">
                      {statusSel.has(s.key) ? <CheckSquare style={{ width:14, height:14, color:s.color }}/> : <Square style={{ width:14, height:14, color:"#cbd5e1" }}/>}
                    </span>
                    <span className="cem-status-dot" style={{ background:s.color }}/>
                    <span className="cem-status-lbl">{s.label}</span>
                    <span className="cem-status-count">{actions.filter(a=>a.status===s.key).length}</span>
                  </label>
                ))}
              </div>

              {/* Sections */}
              <div className="cem-section-label" style={{ marginTop:16 }}>
                <ListChecks style={{ width:12, height:12 }}/> Nội dung xuất
              </div>
              <div className="cem-sections-list">
                {SECTION_OPTS.map(sec => (
                  <label key={sec.id} className={`cem-section-item${sections.has(sec.id)?" checked":""}`} onClick={() => toggleSection(sec.id)}>
                    <span className="cem-section-check">
                      {sections.has(sec.id) ? <CheckSquare style={{ width:14, height:14, color:"#1565c0" }}/> : <Square style={{ width:14, height:14, color:"#cbd5e1" }}/>}
                    </span>
                    <div className="cem-section-info">
                      <span className="cem-section-name">{sec.label}</span>
                      <span className="cem-section-desc">{sec.desc}</span>
                    </div>
                  </label>
                ))}
              </div>

            </div>
          </div>

          {/* RIGHT: preview */}
          <div className="cem-right">
            <div className="cem-preview-header">
              <span className="cem-preview-title">Xem trước</span>
              <span className="cem-preview-sub">{periodLabel} {deptSel ? `· ${deptSel}` : ""}</span>
            </div>

            {/* mini stat cards */}
            <div className="cem-preview-stats">
              {[
                { val:previewStats.total,    lbl:"Tổng CAPA",       c:"#1e40af", bg:"#eff6ff", border:"#bfdbfe" },
                { val:previewStats.pending,  lbl:"Chờ phê duyệt",   c:"#ea580c", bg:"#fff7ed", border:"#fed7aa" },
                { val:previewStats.active,   lbl:"Đang triển khai", c:"#2563eb", bg:"#eff6ff", border:"#bfdbfe" },
                { val:previewStats.done,     lbl:"Chờ nghiệm thu",  c:"#d97706", bg:"#fffbeb", border:"#fde68a" },
                { val:previewStats.closed,   lbl:"Hoàn thành",      c:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0" },
                { val:previewStats.rejected, lbl:"Từ chối",          c:"#dc2626", bg:"#fef2f2", border:"#fecaca" },
                { val:previewStats.overdue,  lbl:"Quá hạn",          c:"#be123c", bg:"#fff1f2", border:"#fecdd3" },
              ].map(s => (
                <div key={s.lbl} className="cem-stat-card" style={{ background:s.bg, borderColor:s.border }}>
                  <div className="cem-stat-val" style={{ color:s.c }}>{s.val}</div>
                  <div className="cem-stat-lbl">{s.lbl}</div>
                </div>
              ))}
            </div>

            {/* section preview cards */}
            <div className="cem-preview-sections">
              {SECTION_OPTS.filter(s => sections.has(s.id)).map(s => (
                <div key={s.id} className="cem-preview-section-card">
                  <s.icon style={{ width:14, height:14, color:"#1565c0", flexShrink:0 }}/>
                  <div>
                    <div className="cem-psc-name">{s.label}</div>
                    <div className="cem-psc-desc">{s.desc}</div>
                  </div>
                  {s.id === "list"    && <span className="cem-psc-badge">{filtered.length} dòng</span>}
                  {s.id === "overdue" && <span className="cem-psc-badge" style={{ background:"#fef2f2", color:"#dc2626", borderColor:"#fecaca" }}>{previewStats.overdue} CAPA</span>}
                  {s.id === "dept"    && <span className="cem-psc-badge">{Array.from(new Set(filtered.map(a=>a.departmentCode||"EHS"))).length} bộ phận</span>}
                </div>
              ))}
              {sections.size === 0 && (
                <div className="cem-preview-empty">Chọn ít nhất một nội dung để xuất</div>
              )}
            </div>

            {/* sample rows */}
            {sections.has("list") && filtered.length > 0 && (
              <div className="cem-preview-table-wrap">
                <div className="cem-preview-table-label">Xem trước 5 CAPA đầu</div>
                <table className="cem-preview-table">
                  <thead>
                    <tr>
                      <th>Mã</th><th>Tiêu đề</th><th>Bộ phận</th><th>Ưu tiên</th><th>Trạng thái</th><th>Hạn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 5).map(a => (
                      <tr key={a.id} className={isOverdue(a.dueDate) && a.status !== "closed" && a.status !== "rejected" ? "cem-row-overdue" : ""}>
                        <td className="cem-td-code">{a.code}</td>
                        <td className="cem-td-title">{a.title}</td>
                        <td>{a.departmentCode||"EHS"}</td>
                        <td>{PRI_LABEL[a.priority||"medium"]||""}</td>
                        <td>{STATUS_LABEL[a.status]||a.status}</td>
                        <td className={isOverdue(a.dueDate) && a.status!=="closed" && a.status!=="rejected" ? "cem-td-overdue" : ""}>{a.dueDate||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length > 5 && <div className="cem-preview-more">…và {filtered.length - 5} CAPA khác</div>}
              </div>
            )}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="cem-footer">
          <div className="cem-footer-info">
            <span className="cem-match-count">
              <strong>{filtered.length}</strong> / {actions.length} CAPA khớp điều kiện
            </span>
            {deptSel && <span className="cem-filter-chip">🏭 {deptSel}</span>}
          </div>
          <div className="cem-footer-actions">
            <button className="cem-btn-cancel" onClick={onClose}>Hủy</button>
            <button
              className="cem-btn-export"
              onClick={handleExport}
              disabled={filtered.length === 0 || sections.size === 0 || exporting}
            >
              {exporting
                ? <><Loader2 style={{ width:13, height:13, animation:"spin 1s linear infinite" }}/> Đang xuất…</>
                : format === "pdf"
                  ? <><Printer style={{ width:13, height:13 }}/> In / Lưu PDF</>
                  : format === "csv"
                    ? <><Download style={{ width:13, height:13 }}/> Tải CSV</>
                    : <><FileSpreadsheet style={{ width:13, height:13 }}/> Tải Excel</>
              }
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
