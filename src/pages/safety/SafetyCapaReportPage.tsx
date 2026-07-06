import React, { useState, useEffect, useMemo, useCallback } from "react";
import "./safety-capa-report.css";
import {
  AlertTriangle, BarChart2, CheckCircle2, Clock, Download,
  FileSpreadsheet, Filter, Loader2, RefreshCw, TrendingUp,
  XCircle, Zap, CalendarDays,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, AreaChart, Area,
} from "recharts";
import { CapaExportModal, type CapaExportItem } from "./CapaExportModal";
import { SafetyI18nRender } from "./safety-i18n-render";

/* ── types ──────────────────────────────────────────────────────── */
type PeriodKey = "month" | "quarter" | "year" | "custom";

interface CAPAAction extends CapaExportItem {
  verifiedAt?: string;
  updatedAt?: string;
  deadline?: string;
}

/* ── constants ──────────────────────────────────────────────────── */
const CLOSED = new Set(["closed", "verified"]);
const todayStr = () => new Date().toISOString().slice(0, 10);

const STATUS_COLOR: Record<string, string> = {
  draft: "#f97316", pending_ehs: "#ea580c",
  open: "#3b82f6", in_progress: "#2563eb",
  done_by_owner: "#d97706", closed: "#16a34a",
  rejected: "#dc2626",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Chờ duyệt", pending_ehs: "Chờ EHS",
  open: "Đã duyệt", in_progress: "Đang làm",
  done_by_owner: "Chờ nghiệm thu", closed: "Hoàn thành",
  rejected: "Từ chối",
};
const PRI_LABEL: Record<string, string> = {
  critical: "Khẩn cấp", high: "Cao", medium: "Trung bình", low: "Thấp",
};
const PRI_COLOR: Record<string, string> = {
  critical: "#dc2626", high: "#f97316", medium: "#f59e0b", low: "#10b981",
};

const PERIOD_TABS: { key: PeriodKey; label: string }[] = [
  { key: "month",   label: "Tháng này" },
  { key: "quarter", label: "Quý này"   },
  { key: "year",    label: "Năm này"   },
  { key: "custom",  label: "Tùy chỉnh" },
];

/* ── helpers ─────────────────────────────────────────────────────── */
function getPeriodBounds(p: PeriodKey, from: string, to: string) {
  const now = new Date();
  const yr = now.getFullYear(), mo = now.getMonth();
  if (p === "month") return { pFrom: new Date(yr, mo, 1), pTo: new Date(yr, mo + 1, 0, 23, 59, 59), label: now.toLocaleDateString("vi-VN", { month: "long", year: "numeric" }) };
  if (p === "quarter") { const q = Math.floor(mo / 3); return { pFrom: new Date(yr, q * 3, 1), pTo: new Date(yr, q * 3 + 3, 0, 23, 59, 59), label: `Quý ${q + 1}/${yr}` }; }
  if (p === "year") return { pFrom: new Date(yr, 0, 1), pTo: new Date(yr, 11, 31, 23, 59, 59), label: `Năm ${yr}` };
  return { pFrom: from ? new Date(from) : null, pTo: to ? new Date(to + "T23:59:59") : null, label: from && to ? `${new Date(from).toLocaleDateString("vi-VN")} – ${new Date(to).toLocaleDateString("vi-VN")}` : "Tùy chỉnh" };
}

function filterByPeriod(list: CAPAAction[], p: PeriodKey, from: string, to: string) {
  const { pFrom, pTo } = getPeriodBounds(p, from, to);
  if (!pFrom && !pTo) return list;
  return list.filter(a => {
    if (!a.createdAt) return false;
    const d = new Date(a.createdAt);
    if (pFrom && d < pFrom) return false;
    if (pTo && d > pTo) return false;
    return true;
  });
}

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("vi-VN");
}

function isOverdue(a: CAPAAction) {
  if (CLOSED.has(a.status)) return false;
  const due = a.dueDate || a.deadline;
  if (!due) return false;
  return due < todayStr();
}

function isSoonDue(a: CAPAAction) {
  if (CLOSED.has(a.status)) return false;
  const due = a.dueDate || a.deadline;
  if (!due) return false;
  const diff = (new Date(due).getTime() - Date.now()) / 86400000;
  return diff >= 0 && diff <= 7;
}

/* ── Trend chart — last 6 months ────────────────────────────────── */
function buildTrendData(all: CAPAAction[]) {
  const now = new Date();
  const result = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const mEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const created = all.filter(a => { const c = a.createdAt ? new Date(a.createdAt) : null; return c && c >= mStart && c <= mEnd; });
    const closed  = all.filter(a => {
      if (!CLOSED.has(a.status)) return false;
      const upd = a.verifiedAt || a.updatedAt || a.createdAt;
      if (!upd) return false;
      const u = new Date(upd);
      return u >= mStart && u <= mEnd;
    });
    result.push({
      month: d.toLocaleDateString("vi-VN", { month: "short", year: "2-digit" }),
      "Tạo mới": created.length,
      "Hoàn thành": closed.length,
    });
  }
  return result;
}

/* ── Dept breakdown ─────────────────────────────────────────────── */
function buildDeptData(filtered: CAPAAction[]) {
  const map: Record<string, { open: number; closed: number; overdue: number }> = {};
  for (const a of filtered) {
    const d = a.departmentCode || "EHS";
    if (!map[d]) map[d] = { open: 0, closed: 0, overdue: 0 };
    if (CLOSED.has(a.status)) map[d].closed++;
    else map[d].open++;
    if (isOverdue(a)) map[d].overdue++;
  }
  return Object.entries(map)
    .sort((a, b) => (b[1].open + b[1].overdue * 2) - (a[1].open + a[1].overdue * 2))
    .slice(0, 10)
    .map(([dept, v]) => ({ dept, ...v }));
}

/* ════════════════════════════════════════════
   PAGE COMPONENT
════════════════════════════════════════════ */
export function SafetyCapaReportPage() {
  const [all,      setAll]      = useState<CAPAAction[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [period,   setPeriod]   = useState<PeriodKey>("month");
  const [fromDate, setFromDate] = useState("");
  const [toDate,   setToDate]   = useState("");
  const [deptSel,  setDeptSel]  = useState("");
  const [showExport, setShowExport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/actions?limit=2000", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const raw = await res.json() as unknown;
      const items = Array.isArray(raw) ? raw : (Array.isArray((raw as { items?: unknown[] }).items) ? (raw as { items: CAPAAction[] }).items : []);
      setAll(items as CAPAAction[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* period-filtered list */
  const filtered = useMemo(() => {
    let list = filterByPeriod(all, period, fromDate, toDate);
    if (deptSel) list = list.filter(a => (a.departmentCode || "EHS") === deptSel);
    return list;
  }, [all, period, fromDate, toDate, deptSel]);

  const { label: periodLabel } = useMemo(() => getPeriodBounds(period, fromDate, toDate), [period, fromDate, toDate]);

  /* stats */
  const stats = useMemo(() => {
    const ov = filtered.filter(isOverdue);
    const sd = filtered.filter(isSoonDue);
    return {
      total:    filtered.length,
      pending:  filtered.filter(a => a.status === "draft" || a.status === "pending_ehs").length,
      active:   filtered.filter(a => a.status === "open"  || a.status === "in_progress").length,
      waitVerify: filtered.filter(a => a.status === "done_by_owner").length,
      closed:   filtered.filter(a => CLOSED.has(a.status)).length,
      rejected: filtered.filter(a => a.status === "rejected").length,
      overdue:  ov.length,
      soonDue:  sd.length,
    };
  }, [filtered]);

  /* charts */
  const trendData = useMemo(() => buildTrendData(all), [all]);
  const deptData  = useMemo(() => buildDeptData(filtered), [filtered]);

  /* unique depts */
  const depts = useMemo(() => Array.from(new Set(all.map(a => a.departmentCode || "EHS"))).sort(), [all]);

  /* overdue table (top 15, sorted by how late) */
  const overdueList = useMemo(() =>
    filtered
      .filter(isOverdue)
      .sort((a, b) => (a.dueDate || "9999") < (b.dueDate || "9999") ? -1 : 1)
      .slice(0, 15),
    [filtered]
  );

  /* soonDue list */
  const soonDueList = useMemo(() =>
    all
      .filter(isSoonDue)
      .filter(a => !deptSel || (a.departmentCode || "EHS") === deptSel)
      .sort((a, b) => (a.dueDate || "9999") < (b.dueDate || "9999") ? -1 : 1)
      .slice(0, 10),
    [all, deptSel]
  );

  /* completion rate */
  const closeRate = stats.total > 0 ? Math.round(stats.closed / stats.total * 100) : 0;

  return (
    <SafetyI18nRender>
      <div className="scr-page">

        {/* ── HEADER ── */}
        <div className="scr-header">
          <div className="scr-header-left">
            <div className="scr-header-icon"><BarChart2 className="scr-header-icon-svg" /></div>
            <div>
              <h1 className="scr-title">Báo cáo CAPA</h1>
              <p className="scr-subtitle">Tổng hợp theo kỳ · {periodLabel}{deptSel ? ` · ${deptSel}` : ""}</p>
            </div>
          </div>
          <div className="scr-header-actions">
            <button type="button" className="scr-btn-icon" onClick={load} title="Làm mới">
              <RefreshCw className={`scr-btn-icon-svg${loading ? " scr-spin" : ""}`} />
            </button>
            <button type="button" className="scr-btn-export" onClick={() => setShowExport(true)} disabled={filtered.length === 0}>
              <FileSpreadsheet className="scr-btn-export-icon" />
              Xuất báo cáo
            </button>
          </div>
        </div>

        {/* ── FILTERS ── */}
        <div className="scr-filters">
          <div className="scr-period-tabs">
            {PERIOD_TABS.map(pt => (
              <button key={pt.key} type="button" onClick={() => setPeriod(pt.key)}
                className={`scr-period-btn${period === pt.key ? " active" : ""}`}>
                {pt.label}
              </button>
            ))}
          </div>
          {period === "custom" && (
            <div className="scr-date-range">
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="scr-date-input" />
              <span className="scr-date-sep">→</span>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="scr-date-input" />
            </div>
          )}
          <div className="scr-filter-right">
            <Filter className="scr-filter-icon" />
            <select className="scr-dept-select" value={deptSel} onChange={e => setDeptSel(e.target.value)}>
              <option value="">Tất cả bộ phận</option>
              {depts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        {/* ── ERROR / LOADING ── */}
        {error && (
          <div className="scr-error">
            <AlertTriangle className="scr-error-icon" /> {error}
          </div>
        )}
        {loading && (
          <div className="scr-loading">
            <Loader2 className="scr-spin scr-loading-icon" /> Đang tải dữ liệu...
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── KPI CARDS ── */}
            <div className="scr-kpi-grid">
              <div className="scr-kpi-card">
                <div className="scr-kpi-label">Tổng CAPA trong kỳ</div>
                <div className="scr-kpi-value">{stats.total}</div>
                <div className="scr-kpi-sub">Tỷ lệ hoàn thành <strong>{closeRate}%</strong></div>
              </div>
              <div className="scr-kpi-card scr-kpi-blue">
                <div className="scr-kpi-label">Đang triển khai</div>
                <div className="scr-kpi-value" style={{ color: "#2563eb" }}>{stats.active}</div>
                <div className="scr-kpi-sub">Chờ nghiệm thu <strong>{stats.waitVerify}</strong></div>
              </div>
              <div className="scr-kpi-card scr-kpi-green">
                <div className="scr-kpi-label"><CheckCircle2 className="scr-kpi-icon" /> Hoàn thành</div>
                <div className="scr-kpi-value" style={{ color: "#16a34a" }}>{stats.closed}</div>
                <div className="scr-kpi-sub">Từ chối <strong>{stats.rejected}</strong></div>
              </div>
              <div className="scr-kpi-card scr-kpi-orange">
                <div className="scr-kpi-label"><Clock className="scr-kpi-icon" /> Chờ phê duyệt</div>
                <div className="scr-kpi-value" style={{ color: "#ea580c" }}>{stats.pending}</div>
                <div className="scr-kpi-sub">Cần EHS xem xét</div>
              </div>
              <div className="scr-kpi-card scr-kpi-red">
                <div className="scr-kpi-label"><AlertTriangle className="scr-kpi-icon" /> Quá hạn</div>
                <div className="scr-kpi-value" style={{ color: "#dc2626" }}>{stats.overdue}</div>
                <div className="scr-kpi-sub">Cần xử lý ngay</div>
              </div>
              <div className="scr-kpi-card scr-kpi-yellow">
                <div className="scr-kpi-label"><CalendarDays className="scr-kpi-icon" /> Sắp đến hạn</div>
                <div className="scr-kpi-value" style={{ color: "#d97706" }}>{stats.soonDue}</div>
                <div className="scr-kpi-sub">Trong 7 ngày tới</div>
              </div>
            </div>

            {/* ── CHARTS ── */}
            <div className="scr-charts-row">
              {/* Trend */}
              <div className="scr-chart-card">
                <div className="scr-chart-title">
                  <TrendingUp className="scr-chart-title-icon" /> Xu hướng 6 tháng gần nhất
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="scr-grad-new" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.18}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="scr-grad-done" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#16a34a" stopOpacity={0.18}/>
                        <stop offset="95%" stopColor="#16a34a" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="Tạo mới"    stroke="#3b82f6" fill="url(#scr-grad-new)"  strokeWidth={2} dot={{ r: 3 }} />
                    <Area type="monotone" dataKey="Hoàn thành" stroke="#16a34a" fill="url(#scr-grad-done)" strokeWidth={2} dot={{ r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Dept breakdown */}
              <div className="scr-chart-card">
                <div className="scr-chart-title">
                  <BarChart2 className="scr-chart-title-icon" /> Theo bộ phận (top 10)
                </div>
                {deptData.length === 0 ? (
                  <div className="scr-chart-empty">Không có dữ liệu</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={deptData} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} />
                      <YAxis type="category" dataKey="dept" tick={{ fontSize: 10, fill: "#475569" }} width={64} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="open"    name="Đang mở"  fill="#3b82f6" radius={[0,3,3,0]} maxBarSize={14} />
                      <Bar dataKey="closed"  name="Hoàn thành" fill="#16a34a" radius={[0,3,3,0]} maxBarSize={14} />
                      <Bar dataKey="overdue" name="Quá hạn"  fill="#dc2626" radius={[0,3,3,0]} maxBarSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* ── SOON-DUE + OVERDUE TABLES ── */}
            <div className="scr-tables-row">

              {/* Soon due */}
              {soonDueList.length > 0 && (
                <div className="scr-table-card">
                  <div className="scr-table-header scr-table-header--yellow">
                    <CalendarDays className="scr-table-header-icon" />
                    CAPA sắp đến hạn ({soonDueList.length})
                    <span className="scr-table-header-sub">≤ 7 ngày</span>
                  </div>
                  <div className="scr-table-wrap">
                    <table className="scr-table">
                      <thead>
                        <tr>
                          <th>Mã</th><th>Tiêu đề</th><th>Bộ phận</th>
                          <th>Hạn</th><th>Người PT</th><th>Ưu tiên</th>
                        </tr>
                      </thead>
                      <tbody>
                        {soonDueList.map(a => {
                          const daysLeft = Math.ceil((new Date(a.dueDate!).getTime() - Date.now()) / 86400000);
                          return (
                            <tr key={a.id}>
                              <td className="scr-code">{a.code}</td>
                              <td className="scr-title-cell" title={a.title}>{a.title}</td>
                              <td>{a.departmentCode || "EHS"}</td>
                              <td>
                                <span className="scr-badge scr-badge--yellow">
                                  {fmtDate(a.dueDate)} · {daysLeft}n
                                </span>
                              </td>
                              <td>{a.ownerName || "—"}</td>
                              <td>
                                <span className="scr-pri" style={{ color: PRI_COLOR[a.priority || "medium"] }}>
                                  {PRI_LABEL[a.priority || "medium"]}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Overdue */}
              {overdueList.length > 0 && (
                <div className="scr-table-card">
                  <div className="scr-table-header scr-table-header--red">
                    <AlertTriangle className="scr-table-header-icon" />
                    CAPA quá hạn ({overdueList.length}{overdueList.length === 15 ? "+" : ""})
                  </div>
                  <div className="scr-table-wrap">
                    <table className="scr-table">
                      <thead>
                        <tr>
                          <th>Mã</th><th>Tiêu đề</th><th>Bộ phận</th>
                          <th>Hạn xử lý</th><th>Người PT</th><th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overdueList.map(a => (
                          <tr key={a.id}>
                            <td className="scr-code">{a.code}</td>
                            <td className="scr-title-cell" title={a.title}>{a.title}</td>
                            <td>{a.departmentCode || "EHS"}</td>
                            <td><span className="scr-badge scr-badge--red">{fmtDate(a.dueDate)}</span></td>
                            <td>{a.ownerName || "—"}</td>
                            <td>
                              <span className="scr-status-dot" style={{ background: STATUS_COLOR[a.status] || "#94a3b8" }} />
                              {STATUS_LABEL[a.status] || a.status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {overdueList.length === 0 && soonDueList.length === 0 && (
                <div className="scr-all-good">
                  <CheckCircle2 className="scr-all-good-icon" />
                  <div className="scr-all-good-title">Tốt! Không có CAPA quá hạn hoặc sắp đến hạn</div>
                  <div className="scr-all-good-sub">Tất cả {stats.total} CAPA trong kỳ đang được xử lý đúng tiến độ.</div>
                </div>
              )}
            </div>

            {/* ── DEPT SUMMARY TABLE ── */}
            {deptData.length > 0 && (
              <div className="scr-table-card scr-table-card--full">
                <div className="scr-table-header">
                  <BarChart2 className="scr-table-header-icon" /> Tổng hợp theo bộ phận
                </div>
                <div className="scr-table-wrap">
                  <table className="scr-table scr-table--striped">
                    <thead>
                      <tr>
                        <th>Bộ phận</th><th>Tổng</th>
                        <th>Đang mở</th><th>Hoàn thành</th><th>Quá hạn</th>
                        <th>Tiến độ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deptData.map(d => {
                        const pct = d.open + d.closed > 0 ? Math.round(d.closed / (d.open + d.closed) * 100) : 0;
                        return (
                          <tr key={d.dept}>
                            <td className="scr-dept-name">{d.dept}</td>
                            <td className="scr-num">{d.open + d.closed}</td>
                            <td className="scr-num" style={{ color: "#2563eb" }}>{d.open}</td>
                            <td className="scr-num" style={{ color: "#16a34a" }}>{d.closed}</td>
                            <td className="scr-num" style={{ color: d.overdue > 0 ? "#dc2626" : undefined }}>{d.overdue || "—"}</td>
                            <td>
                              <div className="scr-progress-wrap">
                                <div className="scr-progress-bar">
                                  <div className="scr-progress-fill" style={{ width: `${pct}%`, background: pct >= 80 ? "#16a34a" : pct >= 50 ? "#f59e0b" : "#dc2626" }} />
                                </div>
                                <span className="scr-progress-pct">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="scr-tfoot">
                        <td>TỔNG CỘNG</td>
                        <td className="scr-num">{filtered.length}</td>
                        <td className="scr-num" style={{ color: "#2563eb" }}>{stats.active + stats.waitVerify + stats.pending}</td>
                        <td className="scr-num" style={{ color: "#16a34a" }}>{stats.closed}</td>
                        <td className="scr-num" style={{ color: stats.overdue > 0 ? "#dc2626" : undefined }}>{stats.overdue || "—"}</td>
                        <td>
                          <div className="scr-progress-wrap">
                            <div className="scr-progress-bar">
                              <div className="scr-progress-fill" style={{ width: `${closeRate}%`, background: closeRate >= 80 ? "#16a34a" : closeRate >= 50 ? "#f59e0b" : "#dc2626" }} />
                            </div>
                            <span className="scr-progress-pct">{closeRate}%</span>
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Empty page state */}
            {filtered.length === 0 && (
              <div className="scr-empty">
                <XCircle className="scr-empty-icon" />
                <div className="scr-empty-title">Không có dữ liệu CAPA trong kỳ này</div>
                <div className="scr-empty-sub">Thử chọn kỳ khác hoặc bỏ lọc bộ phận.</div>
              </div>
            )}
          </>
        )}

        {/* ── EXPORT MODAL ── */}
        {showExport && (
          <CapaExportModal
            actions={all as CapaExportItem[]}
            onClose={() => setShowExport(false)}
            initialDept={deptSel || null}
            pageTitle={`Báo cáo CAPA · ${periodLabel}`}
          />
        )}
      </div>
    </SafetyI18nRender>
  );
}
