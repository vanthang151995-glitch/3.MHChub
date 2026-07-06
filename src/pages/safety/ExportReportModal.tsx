import React, { useState, useEffect, useRef } from "react";
import {
  X, Download, FileText, Table2, FileSpreadsheet,
  CheckSquare, Square, Eye, ChevronRight, Loader2,
  BarChart3, Activity, Clock, TrendingUp, Shield,
  AlertTriangle, CheckCircle2, Users, Tag, Zap,
} from "lucide-react";
import * as XLSX from "xlsx";
import "./export-report-modal.css";

/* ── TYPES ─────────────────────────── */
interface KpiMetric { value: number; delta: number }
interface IntelData {
  kpi: {
    totalFindings:   KpiMetric;
    openActions:     KpiMetric;
    overdueActions:  KpiMetric;
    closedThisMonth: KpiMetric;
    onTimePct:       KpiMetric;
    pendingApproval: KpiMetric;
  };
  sourceData:    { name: string; value: number; color: string }[];
  funnelData:    { name: string; value: number }[];
  topDepts:      { dept: string; open: number; closed: number; overdue: number; incidents: number; warnings: number; score: number; level: string }[];
  topTopics:     { name: string; open: number; closed: number; overdue: number }[];
  trend:         { month: string; warning: number; incident: number; audit: number; manual: number }[];
  activity:      { time: string; type: string; text: string; dept: string }[];
  insights:      { icon: string; text: string; level: string }[];
  soonDue:       { id: string; code: string; title: string; dueDate: string; daysLeft: number; ownerName: string; dept: string; priority: string }[];
  deptOnTimePct: { dept: string; pct: number | null; closed: number; onTime: number }[];
  generatedAt:   string;
}

export interface ExportReportModalProps {
  data: IntelData;
  onClose: () => void;
}

/* ── SECTION CONFIG ─────────────────── */
const SECTIONS = [
  { id: "kpi",      label: "Tổng hợp KPI",           icon: BarChart3,     desc: "6 chỉ số chính" },
  { id: "funnel",   label: "Phễu CAPA",               icon: TrendingUp,    desc: "Phát hiện → Đóng" },
  { id: "source",   label: "Nguồn phát sinh",         icon: Activity,      desc: "Cảnh báo, sự cố, audit…" },
  { id: "trend",    label: "Xu hướng 6 tháng",        icon: TrendingUp,    desc: "Biểu đồ theo tháng" },
  { id: "dept",     label: "Top bộ phận rủi ro",      icon: Users,         desc: "Điểm rủi ro & tình trạng" },
  { id: "topic",    label: "Chủ đề nổi bật",          icon: Tag,           desc: "Phân loại vấn đề" },
  { id: "activity", label: "Hoạt động gần đây",       icon: Zap,           desc: "6 sự kiện gần nhất" },
  { id: "soondue",  label: "CAPA sắp hết hạn",        icon: Clock,         desc: "Hạn trong 7 ngày" },
  { id: "ontime",   label: "Đúng hạn theo bộ phận",   icon: CheckCircle2,  desc: "Tỷ lệ % đóng đúng hạn" },
  { id: "insights", label: "EHS Insights",            icon: Shield,        desc: "Nhận xét tự động" },
] as const;

type SectionId = typeof SECTIONS[number]["id"];
type ExportFormat = "pdf" | "excel" | "csv";

/* ── HELPERS ────────────────────────── */
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("vi-VN");
const monthLabel = () => new Date().toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
const nowStr = () => new Date().toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

/* ── CSV BUILDER ──────────────────────── */
function buildCSV(data: IntelData, sections: Set<SectionId>, title: string): string {
  const rows: string[][] = [];
  const addRow = (...cells: (string|number)[]) => rows.push(cells.map(String));
  const addBlank = () => rows.push([]);
  const addHeader = (h: string) => { rows.push([h]); };

  addRow(title);
  addRow(`Xuất lúc: ${nowStr()}`);
  addBlank();

  if (sections.has("kpi")) {
    addHeader("TỔNG HỢP KPI");
    addRow("Chỉ số", "Giá trị");
    addRow("Tổng phát hiện",   data.kpi.totalFindings.value);
    addRow("CAPA đang mở",     data.kpi.openActions.value);
    addRow("Quá hạn",          data.kpi.overdueActions.value);
    addRow("Đóng tháng này",   data.kpi.closedThisMonth.value);
    addRow("Tỷ lệ đúng hạn %", data.kpi.onTimePct.value);
    addRow("Chờ phê duyệt",    data.kpi.pendingApproval?.value ?? 0);
    addBlank();
  }
  if (sections.has("source")) {
    addHeader("NGUỒN PHÁT SINH");
    addRow("Nguồn", "Số lượng");
    data.sourceData.forEach(s => addRow(s.name, s.value));
    addBlank();
  }
  if (sections.has("trend")) {
    addHeader("XU HƯỚNG 6 THÁNG");
    addRow("Tháng", "Cảnh báo", "Sự cố", "Audit", "Thủ công");
    data.trend.forEach(t => addRow(t.month, t.warning, t.incident, t.audit, t.manual));
    addBlank();
  }
  if (sections.has("dept")) {
    addHeader("TOP BỘ PHẬN RỦI RO");
    addRow("Bộ phận", "Mở", "Đóng", "Quá hạn", "Sự cố", "Cảnh báo", "Điểm", "Mức");
    data.topDepts.forEach(d => addRow(d.dept, d.open, d.closed, d.overdue, d.incidents, d.warnings, d.score, d.level));
    addBlank();
  }
  if (sections.has("topic")) {
    addHeader("CHỦ ĐỀ NỔI BẬT");
    addRow("Chủ đề", "Mở", "Đóng", "Quá hạn");
    data.topTopics.forEach(t => addRow(t.name, t.open, t.closed, t.overdue));
    addBlank();
  }
  if (sections.has("soondue")) {
    addHeader("CAPA SẮP HẾT HẠN");
    addRow("Mã CAPA", "Tiêu đề", "Hạn", "Còn (ngày)", "Bộ phận", "Người phụ trách", "Ưu tiên");
    data.soonDue.forEach(s => addRow(s.code, s.title, fmtDate(s.dueDate), s.daysLeft, s.dept, s.ownerName, s.priority));
    addBlank();
  }
  if (sections.has("ontime")) {
    addHeader("TỶ LỆ ĐÚNG HẠN THEO BỘ PHẬN");
    addRow("Bộ phận", "Đúng hạn", "Tổng đóng", "Tỷ lệ %");
    data.deptOnTimePct.forEach(d => addRow(d.dept, d.onTime, d.closed, d.pct ?? "N/A"));
    addBlank();
  }
  if (sections.has("insights")) {
    addHeader("EHS INSIGHTS");
    addRow("Mức", "Nội dung");
    data.insights.forEach(i => addRow(i.level, i.text));
    addBlank();
  }

  return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

/* ── EXCEL BUILDER ────────────────────── */
function buildExcel(data: IntelData, sections: Set<SectionId>, title: string) {
  const wb = XLSX.utils.book_new();

  /* Sheet 1: KPI Summary */
  if (sections.has("kpi")) {
    const ws = XLSX.utils.aoa_to_sheet([
      [title],
      [`Kỳ báo cáo: ${monthLabel()}  |  Xuất lúc: ${nowStr()}`],
      [],
      ["TỔNG HỢP KPI"],
      ["Chỉ số", "Giá trị", "Chênh lệch"],
      ["Tổng phát hiện",   data.kpi.totalFindings.value,    data.kpi.totalFindings.delta],
      ["CAPA đang mở",     data.kpi.openActions.value,      data.kpi.openActions.delta],
      ["Quá hạn",          data.kpi.overdueActions.value,   0],
      ["Đóng tháng này",   data.kpi.closedThisMonth.value,  data.kpi.closedThisMonth.delta],
      ["Tỷ lệ đúng hạn %", data.kpi.onTimePct.value,        data.kpi.onTimePct.delta],
      ["Chờ phê duyệt",    data.kpi.pendingApproval?.value ?? 0, 0],
    ]);
    ws["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "KPI");
  }

  /* Sheet 2: Dept */
  if (sections.has("dept")) {
    const ws = XLSX.utils.aoa_to_sheet([
      ["TOP BỘ PHẬN RỦI RO"],
      ["Bộ phận", "Mở", "Đóng", "Quá hạn", "Sự cố", "Cảnh báo", "Điểm", "Mức"],
      ...data.topDepts.map(d => [d.dept, d.open, d.closed, d.overdue, d.incidents, d.warnings, d.score, d.level]),
    ]);
    ws["!cols"] = [{ wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws, "Bộ phận");
  }

  /* Sheet 3: Xu hướng */
  if (sections.has("trend")) {
    const ws = XLSX.utils.aoa_to_sheet([
      ["XU HƯỚNG 6 THÁNG"],
      ["Tháng", "Cảnh báo", "Sự cố", "Audit", "Thủ công"],
      ...data.trend.map(t => [t.month, t.warning, t.incident, t.audit, t.manual]),
    ]);
    ws["!cols"] = [{ wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Xu hướng");
  }

  /* Sheet 4: CAPA sắp hết hạn */
  if (sections.has("soondue") && data.soonDue.length > 0) {
    const ws = XLSX.utils.aoa_to_sheet([
      ["CAPA SẮP HẾT HẠN (7 NGÀY TỚI)"],
      ["Mã CAPA", "Tiêu đề", "Hạn", "Còn (ngày)", "Bộ phận", "Người phụ trách", "Ưu tiên"],
      ...data.soonDue.map(s => [s.code, s.title, fmtDate(s.dueDate), s.daysLeft, s.dept, s.ownerName, s.priority]),
    ]);
    ws["!cols"] = [{ wch: 14 }, { wch: 36 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Sắp hết hạn");
  }

  /* Sheet 5: On-time by dept */
  if (sections.has("ontime") && data.deptOnTimePct.length > 0) {
    const ws = XLSX.utils.aoa_to_sheet([
      ["TỶ LỆ ĐÚNG HẠN THEO BỘ PHẬN"],
      ["Bộ phận", "Đúng hạn", "Tổng đóng", "Tỷ lệ %"],
      ...data.deptOnTimePct.map(d => [d.dept, d.onTime, d.closed, d.pct ?? "N/A"]),
    ]);
    ws["!cols"] = [{ wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Đúng hạn");
  }

  /* Sheet 6: Insights */
  if (sections.has("insights")) {
    const ws = XLSX.utils.aoa_to_sheet([
      ["EHS INSIGHTS"],
      ["Mức", "Nội dung"],
      ...data.insights.map(i => [i.level, i.text]),
    ]);
    ws["!cols"] = [{ wch: 10 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, ws, "Insights");
  }

  return wb;
}

/* ── PREVIEW CARD ─────────────────────── */
function PreviewCard({ section, data }: { section: SectionId; data: IntelData }) {
  const kpi = data.kpi;

  switch (section) {
    case "kpi": return (
      <div className="erm-prev-block">
        <div className="erm-prev-title">📊 Tổng hợp KPI</div>
        <div className="erm-prev-kpi-grid">
          <div className="erm-prev-kpi-item"><span className="erm-prev-kpi-val" style={{ color:"#3b82f6" }}>{kpi.totalFindings.value}</span><span>Phát hiện</span></div>
          <div className="erm-prev-kpi-item"><span className="erm-prev-kpi-val" style={{ color:"#f97316" }}>{kpi.openActions.value}</span><span>Đang mở</span></div>
          <div className="erm-prev-kpi-item"><span className="erm-prev-kpi-val" style={{ color:"#ef4444" }}>{kpi.overdueActions.value}</span><span>Quá hạn</span></div>
          <div className="erm-prev-kpi-item"><span className="erm-prev-kpi-val" style={{ color:"#10b981" }}>{kpi.closedThisMonth.value}</span><span>Đã đóng</span></div>
          <div className="erm-prev-kpi-item"><span className="erm-prev-kpi-val" style={{ color:"#8b5cf6" }}>{kpi.onTimePct.value}%</span><span>Đúng hạn</span></div>
          <div className="erm-prev-kpi-item"><span className="erm-prev-kpi-val" style={{ color:"#dc2626" }}>{kpi.pendingApproval?.value ?? 0}</span><span>Chờ duyệt</span></div>
        </div>
      </div>
    );
    case "funnel": return (
      <div className="erm-prev-block">
        <div className="erm-prev-title">🎯 Phễu CAPA</div>
        <div className="erm-prev-funnel">
          {data.funnelData.map(f => (
            <div key={f.name} className="erm-prev-funnel-row">
              <span className="erm-prev-funnel-name">{f.name}</span>
              <span className="erm-prev-funnel-val" style={{ color: f.fill }}>{f.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
    case "source": return (
      <div className="erm-prev-block">
        <div className="erm-prev-title">📋 Nguồn phát sinh</div>
        <div className="erm-prev-source">
          {data.sourceData.filter(s => s.value > 0).map(s => (
            <div key={s.name} className="erm-prev-source-row">
              <span className="erm-prev-source-dot" style={{ background: s.color }} />
              <span className="erm-prev-source-name">{s.name}</span>
              <span className="erm-prev-source-val">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
    case "trend": return (
      <div className="erm-prev-block">
        <div className="erm-prev-title">📈 Xu hướng 6 tháng</div>
        <div className="erm-prev-trend">
          {data.trend.map(t => (
            <div key={t.month} className="erm-prev-trend-col">
              <div className="erm-prev-trend-bar" style={{ height: Math.max(4, Math.min(40, (t.warning + t.incident + t.audit + t.manual) * 3)) }} />
              <span className="erm-prev-trend-month">{t.month}</span>
            </div>
          ))}
        </div>
      </div>
    );
    case "dept": return (
      <div className="erm-prev-block">
        <div className="erm-prev-title">🏭 Top bộ phận rủi ro</div>
        <div className="erm-prev-table">
          {data.topDepts.slice(0, 4).map(d => (
            <div key={d.dept} className="erm-prev-table-row">
              <span className="erm-prev-table-key">{d.dept}</span>
              <span className="erm-prev-table-val" style={{ color: d.level === "Cao" ? "#ef4444" : d.level === "TB" ? "#f97316" : "#10b981" }}>{d.level}</span>
              <span className="erm-prev-table-sub">{d.open} mở</span>
            </div>
          ))}
        </div>
      </div>
    );
    case "topic": return (
      <div className="erm-prev-block">
        <div className="erm-prev-title">🏷️ Chủ đề nổi bật</div>
        <div className="erm-prev-table">
          {data.topTopics.slice(0, 4).map(t => (
            <div key={t.name} className="erm-prev-table-row">
              <span className="erm-prev-table-key">{t.name}</span>
              <span className="erm-prev-table-val">{t.open + t.closed}</span>
              <span className="erm-prev-table-sub">{t.open} mở</span>
            </div>
          ))}
        </div>
      </div>
    );
    case "activity": return (
      <div className="erm-prev-block">
        <div className="erm-prev-title">⚡ Hoạt động gần đây</div>
        <div className="erm-prev-activity">
          {data.activity.slice(0, 4).map((a, i) => (
            <div key={i} className="erm-prev-activity-row">
              <span className="erm-prev-activity-time">{a.time}</span>
              <span className="erm-prev-activity-text">{a.text.slice(0, 36)}{a.text.length > 36 ? "…" : ""}</span>
            </div>
          ))}
        </div>
      </div>
    );
    case "soondue": return (
      <div className="erm-prev-block">
        <div className="erm-prev-title">⏰ CAPA sắp hết hạn</div>
        {data.soonDue.length === 0
          ? <div className="erm-prev-empty">Không có CAPA nào sắp hết hạn ✓</div>
          : <div className="erm-prev-table">
              {data.soonDue.slice(0, 4).map(s => (
                <div key={s.id} className="erm-prev-table-row">
                  <span className="erm-prev-table-key">{s.code}</span>
                  <span className="erm-prev-table-val" style={{ color: s.daysLeft <= 2 ? "#ef4444" : "#f97316" }}>{s.daysLeft}d</span>
                  <span className="erm-prev-table-sub">{s.dept}</span>
                </div>
              ))}
            </div>
        }
      </div>
    );
    case "ontime": return (
      <div className="erm-prev-block">
        <div className="erm-prev-title">✅ Đúng hạn theo bộ phận</div>
        {data.deptOnTimePct.length === 0
          ? <div className="erm-prev-empty">Chưa có dữ liệu đóng CAPA</div>
          : <div className="erm-prev-ontime">
              {data.deptOnTimePct.slice(0, 5).map(d => {
                const pct = d.pct ?? 0;
                return (
                  <div key={d.dept} className="erm-prev-ontime-row">
                    <span className="erm-prev-ontime-dept">{d.dept}</span>
                    <div className="erm-prev-ontime-bar-bg">
                      <div className="erm-prev-ontime-bar-fill" style={{ width:`${pct}%`, background: pct >= 80 ? "#10b981" : pct >= 50 ? "#f97316" : "#ef4444" }} />
                    </div>
                    <span className="erm-prev-ontime-pct" style={{ color: pct >= 80 ? "#10b981" : pct >= 50 ? "#f97316" : "#ef4444" }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
        }
      </div>
    );
    case "insights": return (
      <div className="erm-prev-block">
        <div className="erm-prev-title">💡 EHS Insights</div>
        <div className="erm-prev-activity">
          {data.insights.slice(0, 3).map((ins, i) => (
            <div key={i} className="erm-prev-activity-row">
              <span>{ins.icon}</span>
              <span className="erm-prev-activity-text">{ins.text.slice(0, 45)}{ins.text.length > 45 ? "…" : ""}</span>
            </div>
          ))}
        </div>
      </div>
    );
    default: return null;
  }
}

/* ── MAIN MODAL ──────────────────────── */
export function ExportReportModal({ data, onClose }: ExportReportModalProps) {
  const [format, setFormat]     = useState<ExportFormat>("excel");
  const [title, setTitle]       = useState(`Báo cáo EHS — ${monthLabel()}`);
  const [subtitle, setSubtitle] = useState(`Xuất ngày ${nowStr()}`);
  const [selected, setSelected] = useState<Set<SectionId>>(
    () => new Set(SECTIONS.map(s => s.id))
  );
  const [exporting, setExporting] = useState(false);
  const [done, setDone]           = useState(false);
  const bodyRef = useRef<HTMLBodyElement | null>(null);

  /* Lock body scroll */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* ESC to close */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const toggleSection = (id: SectionId) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selected.size === SECTIONS.length) setSelected(new Set());
    else setSelected(new Set(SECTIONS.map(s => s.id)));
  };

  const handleExport = async () => {
    if (selected.size === 0) return;
    setExporting(true);

    await new Promise(r => setTimeout(r, 300));

    try {
      if (format === "csv") {
        const csv = buildCSV(data, selected, title);
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `EHS_Report_${new Date().toISOString().slice(0,10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
      } else if (format === "excel") {
        const wb = buildExcel(data, selected, title);
        XLSX.writeFile(wb, `EHS_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
      } else {
        /* PDF: inject print-specific data attributes then print */
        const sectionsArr = Array.from(selected).join(",");
        document.documentElement.setAttribute("data-print-sections", sectionsArr);
        document.title = title;
        window.print();
        document.documentElement.removeAttribute("data-print-sections");
      }
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch (e) {
      console.error("Export failed", e);
    }
    setExporting(false);
  };

  const selectedArr = SECTIONS.filter(s => selected.has(s.id));

  return (
    <div className="erm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="erm-modal">

        {/* Header */}
        <div className="erm-header">
          <div className="erm-header-left">
            <div className="erm-header-icon">
              <FileText style={{ width: 18, height: 18, color: "#fff" }} />
            </div>
            <div>
              <div className="erm-header-title">Xuất báo cáo EHS</div>
              <div className="erm-header-sub">Tùy chọn nội dung và định dạng trước khi xuất</div>
            </div>
          </div>
          <button className="erm-close-btn" onClick={onClose} title="Đóng">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Body: 2 columns */}
        <div className="erm-body">

          {/* LEFT: Options */}
          <div className="erm-left">

            {/* Format picker */}
            <div className="erm-section">
              <div className="erm-section-label">Định dạng xuất</div>
              <div className="erm-format-tabs">
                {([
                  { id: "excel" as ExportFormat, icon: FileSpreadsheet, label: "Excel", sub: ".xlsx — nhiều sheet" },
                  { id: "csv"   as ExportFormat, icon: Table2,          label: "CSV",   sub: ".csv — mở bằng Excel" },
                  { id: "pdf"   as ExportFormat, icon: FileText,        label: "PDF",   sub: "In từ trình duyệt" },
                ] as { id: ExportFormat; icon: React.ElementType; label: string; sub: string }[]).map(f => (
                  <button
                    key={f.id}
                    className={`erm-format-tab${format === f.id ? " active" : ""}`}
                    onClick={() => setFormat(f.id)}
                  >
                    <f.icon style={{ width: 16, height: 16 }} />
                    <div>
                      <div className="erm-format-tab-label">{f.label}</div>
                      <div className="erm-format-tab-sub">{f.sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div className="erm-section">
              <div className="erm-section-label">Tiêu đề báo cáo</div>
              <input
                className="erm-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Tiêu đề báo cáo…"
              />
              <input
                className="erm-input erm-input-sm"
                value={subtitle}
                onChange={e => setSubtitle(e.target.value)}
                placeholder="Phụ đề (tuỳ chọn)…"
              />
            </div>

            {/* Section toggles */}
            <div className="erm-section">
              <div className="erm-section-label-row">
                <span className="erm-section-label">Nội dung xuất</span>
                <button className="erm-toggle-all-btn" onClick={toggleAll}>
                  {selected.size === SECTIONS.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                </button>
              </div>
              <div className="erm-sections-grid">
                {SECTIONS.map(s => {
                  const active = selected.has(s.id);
                  return (
                    <button
                      key={s.id}
                      className={`erm-section-btn${active ? " active" : ""}`}
                      onClick={() => toggleSection(s.id)}
                    >
                      <div className="erm-section-btn-check">
                        {active
                          ? <CheckSquare style={{ width: 14, height: 14, color: "#1565c0" }} />
                          : <Square     style={{ width: 14, height: 14, color: "#94a3b8" }} />
                        }
                      </div>
                      <s.icon style={{ width: 13, height: 13, color: active ? "#1565c0" : "#94a3b8", flexShrink: 0 }} />
                      <div className="erm-section-btn-text">
                        <span className="erm-section-btn-label">{s.label}</span>
                        <span className="erm-section-btn-desc">{s.desc}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* RIGHT: Preview */}
          <div className="erm-right">
            <div className="erm-preview-header">
              <Eye style={{ width: 13, height: 13, color: "#64748b" }} />
              <span>Xem trước nội dung</span>
              <span className="erm-preview-count">{selected.size} mục</span>
            </div>

            <div className="erm-preview-doc">
              <div className="erm-preview-doc-title">{title || "Báo cáo EHS"}</div>
              <div className="erm-preview-doc-sub">{subtitle}</div>
              <div className="erm-preview-doc-sep" />

              {selectedArr.length === 0 ? (
                <div className="erm-preview-empty">
                  <AlertTriangle style={{ width: 20, height: 20, color: "#94a3b8" }} />
                  <span>Chưa chọn mục nào</span>
                </div>
              ) : (
                <div className="erm-preview-blocks">
                  {selectedArr.map(s => (
                    <PreviewCard key={s.id} section={s.id} data={data} />
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="erm-footer">
          <div className="erm-footer-info">
            <span className="erm-footer-count">{selected.size} / {SECTIONS.length} mục</span>
            <span className="erm-footer-sep">·</span>
            <span>Định dạng: <strong>{format.toUpperCase()}</strong></span>
          </div>
          <div className="erm-footer-actions">
            <button className="erm-cancel-btn" onClick={onClose} disabled={exporting}>
              Hủy
            </button>
            <button
              className={`erm-export-btn${done ? " done" : ""}`}
              onClick={handleExport}
              disabled={exporting || selected.size === 0}
            >
              {exporting ? (
                <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Đang xuất…</>
              ) : done ? (
                <><CheckCircle2 style={{ width: 14, height: 14 }} /> Đã xuất thành công!</>
              ) : (
                <><Download style={{ width: 14, height: 14 }} /> Xuất {format.toUpperCase()} ngay<ChevronRight style={{ width: 13, height: 13 }} /></>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
