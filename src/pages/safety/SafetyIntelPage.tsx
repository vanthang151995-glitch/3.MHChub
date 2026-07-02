import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  FunnelChart, Funnel, LabelList,
} from "recharts";
import {
  AlertTriangle, TrendingDown, TrendingUp, ShieldCheck, Activity,
  CheckCircle2, Flame, Zap, ChevronRight, Download, RefreshCw, BarChart3,
  Clock, ClipboardCheck,
} from "lucide-react";
import { apiFetch } from "./safety-api";
import "./safety-intel.css";

/* ── TYPES ─────────────────────────────────────────────────── */
interface KpiMetric { value: number; delta: number }
interface SoonDueItem {
  id: string; code: string; title: string;
  dueDate: string; daysLeft: number;
  ownerName: string; dept: string;
  status: string; priority: string;
}
interface DeptOnTime { dept: string; pct: number | null; closed: number; onTime: number; }
interface IntelSummary {
  kpi: {
    totalFindings:   KpiMetric;
    openActions:     KpiMetric;
    overdueActions:  KpiMetric;
    closedThisMonth: KpiMetric;
    onTimePct:       KpiMetric;
    pendingApproval: KpiMetric;
  };
  sourceData:    { name: string; value: number; color: string; key: string }[];
  funnelData:    { name: string; value: number; fill: string }[];
  topDepts:      { dept: string; open: number; closed: number; overdue: number; incidents: number; warnings: number; score: number; level: string }[];
  topTopics:     { name: string; open: number; closed: number; overdue: number }[];
  trend:         { month: string; warning: number; incident: number; audit: number; manual: number }[];
  activity:      { time: string; type: string; text: string; dept: string; src: string }[];
  insights:      { icon: string; text: string; level: string }[];
  soonDue:       SoonDueItem[];
  deptOnTimePct: DeptOnTime[];
  generatedAt:   string;
}

/* ── HELPERS ───────────────────────────────────────────────── */
const riskColor = (level: string) =>
  level === "Cao" ? { bg: "#fef2f2", color: "#991b1b", dot: "#ef4444" }
  : level === "TB"  ? { bg: "#fff7ed", color: "#92400e", dot: "#f97316" }
  : { bg: "#f0fdf4", color: "#166534", dot: "#10b981" };

const srcIcon = (src: string) =>
  src === "warning" ? "🔥" : src === "incident" ? "🚨" : src === "audit" ? "📋" : "✏️";

const actColor = (type: string) =>
  type === "closed"  ? "#10b981"
  : type === "overdue" ? "#ef4444"
  : type === "warning" ? "#f97316"
  : "#3b82f6";

const CustomTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="si-tooltip">
      <div className="si-tooltip-label">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

const SectionHead = ({ title, sub }: { title: string; sub?: string }) => (
  <div className="si-section-head">
    <span className="si-section-title">{title}</span>
    {sub && <span className="si-section-sub">{sub}</span>}
  </div>
);

/* ── KPI CARD ──────────────────────────────────────────────── */
interface KpiCardProps {
  label: string; value: number; unit?: string; sub: string;
  delta: number; positiveGood: boolean;
  color: string; bg: string; border: string;
  Icon: React.ComponentType<{ style?: React.CSSProperties }>;
}
function KpiCard({ label, value, unit = "", sub, delta, positiveGood, color, bg, border, Icon }: KpiCardProps) {
  const isGood = positiveGood ? delta >= 0 : delta <= 0;
  return (
    <div className="si-kpi-card" style={{ borderColor: border }}>
      <div className="si-kpi-icon" style={{ background: bg }}>
        <Icon style={{ width: 16, height: 16, color }} />
      </div>
      <div className="si-kpi-label">{label}</div>
      <div className="si-kpi-value" style={{ color }}>
        {value}{unit}
      </div>
      <div className="si-kpi-delta">
        {isGood
          ? <TrendingUp style={{ width: 12, height: 12, color: "#10b981" }} />
          : <TrendingDown style={{ width: 12, height: 12, color: "#ef4444" }} />
        }
        <span style={{ color: isGood ? "#10b981" : "#ef4444" }}>
          {delta > 0 ? "+" : ""}{delta} so tháng trước
        </span>
      </div>
      <div className="si-kpi-sub">{sub}</div>
    </div>
  );
}

/* ── LOADING / ERROR ───────────────────────────────────────── */
function LoadingState() {
  return (
    <div className="si-state-center">
      <RefreshCw style={{ width: 32, height: 32, color: "#3b82f6", animation: "spin 1s linear infinite" }} />
      <p>Đang tổng hợp dữ liệu EHS…</p>
    </div>
  );
}
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="si-state-center">
      <AlertTriangle style={{ width: 32, height: 32, color: "#ef4444" }} />
      <p>Không thể tải dữ liệu tổng hợp</p>
      <button className="si-retry-btn" onClick={onRetry}>Thử lại</button>
    </div>
  );
}

/* ── EMPTY FALLBACK (no data yet) ───────────────────────────── */
function EmptyInsights() {
  return [{ icon: "📋", text: "Chưa có dữ liệu đủ để phân tích — hãy nhập cảnh báo và CAPA đầu tiên", level: "good" }];
}

/* ── MAIN PAGE ─────────────────────────────────────────────── */
export function SafetyIntelPage() {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<IntelSummary>({
    queryKey: ["intel-summary"],
    queryFn: () => apiFetch<IntelSummary>("/api/intel/summary"),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const now = new Date();
  const monthLabel = now.toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : null;

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState onRetry={refetch} />;

  const { kpi, sourceData, funnelData, topDepts, topTopics, trend, activity, insights, soonDue = [], deptOnTimePct = [] } = data;
  const displayInsights = insights?.length ? insights : EmptyInsights();

  /* Completion rate for funnel */
  const funnelPct = funnelData[0]?.value > 0 ? Math.round((funnelData[3]?.value || 0) / funnelData[0].value * 100) : 0;

  return (
    <div className="si-root">

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div className="si-header">
        <div className="si-header-left">
          <div className="si-header-icon">
            <ShieldCheck style={{ width: 20, height: 20, color: "#0f172a" }} />
          </div>
          <div>
            <div className="si-header-title">EHS Intelligence Dashboard</div>
            <div className="si-header-sub">
              Tổng hợp đa nguồn — Cảnh báo · Sự cố · Kiểm tra · CAPA
            </div>
          </div>
        </div>
        <div className="si-header-right">
          <span className="si-header-period">{monthLabel}</span>
          {lastUpdated && (
            <span className="si-header-updated">Cập nhật lúc {lastUpdated}</span>
          )}
          <button className="si-header-refresh" onClick={() => refetch()} title="Làm mới dữ liệu">
            <RefreshCw style={{ width: 13, height: 13 }} />
          </button>
          {(kpi.pendingApproval?.value ?? 0) > 0 && (
            <a href="/safety-6s/capa-approval" className="si-header-approve-btn">
              <ClipboardCheck style={{ width: 13, height: 13 }} />
              Phê duyệt CAPA
              <span className="si-header-approve-badge">{kpi.pendingApproval.value}</span>
            </a>
          )}
          <button className="si-header-export" onClick={() => window.print()}>
            <Download style={{ width: 13, height: 13 }} /> Xuất báo cáo
          </button>
        </div>
      </div>

      <div className="si-body">

        {/* ── KPI ROW ────────────────────────────────────────────── */}
        <div className="si-kpi-row">
          <KpiCard
            label="Tổng phát hiện" value={kpi.totalFindings.value} sub="tất cả nguồn"
            delta={kpi.totalFindings.delta} positiveGood={false}
            color="#3b82f6" bg="#eff6ff" border="#bfdbfe" Icon={Activity} />
          <KpiCard
            label="CAPA đang mở" value={kpi.openActions.value} sub="cần xử lý"
            delta={kpi.openActions.delta} positiveGood={false}
            color="#f97316" bg="#fff7ed" border="#fed7aa" Icon={Flame} />
          <KpiCard
            label="Quá hạn" value={kpi.overdueActions.value} sub="cần gấp"
            delta={kpi.overdueActions.delta} positiveGood={false}
            color="#ef4444" bg="#fef2f2" border="#fecaca" Icon={AlertTriangle} />
          <KpiCard
            label="Đóng tháng này" value={kpi.closedThisMonth.value} sub="hoàn thành"
            delta={kpi.closedThisMonth.delta} positiveGood={true}
            color="#10b981" bg="#f0fdf4" border="#a7f3d0" Icon={CheckCircle2} />
          <KpiCard
            label="Đúng hạn" value={kpi.onTimePct.value} unit="%" sub={monthLabel}
            delta={kpi.onTimePct.delta} positiveGood={true}
            color="#8b5cf6" bg="#f5f3ff" border="#c4b5fd" Icon={ShieldCheck} />
          {/* KPI 6: Chờ duyệt — clickable link */}
          <a href="/safety-6s/capa-approval" className="si-kpi-card si-kpi-card-link" style={{ borderColor: (kpi.pendingApproval?.value ?? 0) > 0 ? "#fca5a5" : "#e2e8f0", textDecoration: "none" }}>
            <div className="si-kpi-icon" style={{ background: "#fef2f2" }}>
              <ClipboardCheck style={{ width: 16, height: 16, color: "#dc2626" }} />
            </div>
            <div className="si-kpi-label">Chờ phê duyệt</div>
            <div className="si-kpi-value" style={{ color: (kpi.pendingApproval?.value ?? 0) > 0 ? "#dc2626" : "#94a3b8" }}>
              {kpi.pendingApproval?.value ?? 0}
            </div>
            <div className="si-kpi-delta" style={{ color: "#dc2626" }}>
              {(kpi.pendingApproval?.value ?? 0) > 0
                ? <><AlertTriangle style={{ width: 10, height: 10, color: "#dc2626" }} /> <span style={{ color: "#dc2626" }}>Cần xét duyệt</span></>
                : <span style={{ color: "#10b981" }}>✓ Không có</span>}
            </div>
            <div className="si-kpi-sub">→ Trang phê duyệt</div>
          </a>
        </div>

        {/* ── ROW 2: Funnel + Nguồn + Top bộ phận ─────────────── */}
        <div className="si-row si-row-3col">

          {/* Funnel */}
          <div className="si-card">
            <SectionHead title="Phễu xử lý CAPA" sub="Tất cả nguồn" />
            <ResponsiveContainer width="100%" height={180}>
              <FunnelChart>
                <Tooltip formatter={(v: any) => [`${v} vấn đề`]} />
                <Funnel dataKey="value" data={funnelData} isAnimationActive>
                  <LabelList position="center" fill="#fff" stroke="none" dataKey="name"
                    style={{ fontSize: 11, fontWeight: 700 }} />
                  <LabelList position="right" fill="#374151" stroke="none" dataKey="value"
                    style={{ fontSize: 12, fontWeight: 900 }} />
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
            <div className="si-funnel-footer">
              Tỷ lệ hoàn thành: <strong style={{ color: "#10b981" }}>{funnelPct}%</strong>
            </div>
          </div>

          {/* Nguồn donut */}
          <div className="si-card">
            <SectionHead title="Phân bổ theo nguồn" sub="tích lũy" />
            <div className="si-source-wrap">
              <ResponsiveContainer width={130} height={160}>
                <PieChart>
                  <Pie data={sourceData.filter(s => s.value > 0)} cx={60} cy={75}
                    innerRadius={40} outerRadius={62} dataKey="value" paddingAngle={3}>
                    {sourceData.map((s) => <Cell key={s.name} fill={s.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => [`${v} vấn đề`, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="si-source-legend">
                {sourceData.map((s) => (
                  <div key={s.name} className="si-source-row">
                    <span className="si-source-dot" style={{ background: s.color }} />
                    <span className="si-source-name">{s.name}</span>
                    <span className="si-source-count" style={{ color: s.color }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top bộ phận bar */}
          <div className="si-card">
            <SectionHead title="CAPA theo bộ phận" sub="mở / đóng / quá hạn" />
            <ResponsiveContainer width="100%" height={185}>
              <BarChart data={topDepts.slice(0, 6)} layout="vertical" barSize={10}
                margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="dept" tick={{ fontSize: 11, fontWeight: 700 }}
                  axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<CustomTip />} />
                <Bar dataKey="open"    name="Đang mở"  fill="#f97316" radius={[0, 3, 3, 0]} />
                <Bar dataKey="closed"  name="Đã đóng"  fill="#10b981" radius={[0, 3, 3, 0]} />
                <Bar dataKey="overdue" name="Quá hạn"  fill="#ef4444" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── ROW 3: Trend + Topic ─────────────────────────────── */}
        <div className="si-row si-row-2col-wide">

          {/* Area trend */}
          <div className="si-card">
            <SectionHead title="Xu hướng phát hiện theo tháng" sub="chia theo nguồn" />
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  {([["warning","#f97316"],["incident","#ef4444"],["audit","#3b82f6"],["manual","#94a3b8"]] as [string,string][]).map(([k,c]) => (
                    <linearGradient key={k} id={`si-g-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={c} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={c} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTip />} />
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700, paddingTop: 4 }} />
                <Area type="monotone" dataKey="warning"  name="Cảnh báo" stroke="#f97316" fill="url(#si-g-warning)"  strokeWidth={2} dot={{ r: 3, fill: "#f97316" }} />
                <Area type="monotone" dataKey="incident" name="Sự cố"    stroke="#ef4444" fill="url(#si-g-incident)" strokeWidth={2} dot={{ r: 3, fill: "#ef4444" }} />
                <Area type="monotone" dataKey="audit"    name="Kiểm tra" stroke="#3b82f6" fill="url(#si-g-audit)"    strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} />
                <Area type="monotone" dataKey="manual"   name="Thủ công" stroke="#94a3b8" fill="url(#si-g-manual)"   strokeWidth={1.5} dot={{ r: 2, fill: "#94a3b8" }} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Topic progress */}
          <div className="si-card">
            <SectionHead title="CAPA theo chuyên đề" sub="tích lũy" />
            <div className="si-topics">
              {(topTopics.length > 0 ? topTopics : [{ name: "Chưa có dữ liệu", open: 0, closed: 0, overdue: 0 }]).map((t) => {
                const total = t.open + t.closed;
                const pct = total > 0 ? Math.round(t.closed / total * 100) : 0;
                const barColor = pct >= 70 ? "#10b981" : pct >= 50 ? "#f97316" : "#ef4444";
                return (
                  <div key={t.name} className="si-topic-row">
                    <div className="si-topic-header">
                      <span className="si-topic-name">{t.name}</span>
                      <span className="si-topic-count">{t.closed}/{total}</span>
                      {t.overdue > 0 && (
                        <span className="si-topic-overdue">⚠️{t.overdue}</span>
                      )}
                    </div>
                    <div className="si-topic-bar-bg">
                      <div className="si-topic-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── ROW 4: Risk matrix + Activity ────────────────────── */}
        <div className="si-row si-row-2col-wide">

          {/* Risk matrix */}
          <div className="si-card">
            <SectionHead title="Ma trận rủi ro theo bộ phận" sub="tổng hợp: sự cố + cảnh báo + CAPA mở" />
            <table className="si-risk-table">
              <thead>
                <tr>
                  {["Bộ phận","Mức rủi ro","Điểm","Sự cố","Cảnh báo","CAPA mở"].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(topDepts.length > 0 ? topDepts : []).map((r, i) => {
                  const c = riskColor(r.level);
                  return (
                    <tr key={r.dept} style={{ background: i % 2 ? "#fafafa" : "#fff" }}>
                      <td className="si-risk-dept">{r.dept}</td>
                      <td>
                        <span className="si-risk-badge" style={{ background: c.bg, color: c.color }}>
                          <span className="si-risk-dot" style={{ background: c.dot }} />
                          {r.level}
                        </span>
                      </td>
                      <td className="si-risk-score" style={{ color: c.dot }}>{r.score}</td>
                      <td style={{ color: r.incidents > 0 ? "#ef4444" : "#94a3b8", fontWeight: 700 }}>{r.incidents}</td>
                      <td style={{ color: "#f97316", fontWeight: 700 }}>{r.warnings}</td>
                      <td style={{ fontWeight: 800, color: r.open >= 7 ? "#ef4444" : r.open >= 4 ? "#f97316" : "#10b981" }}>{r.open}</td>
                    </tr>
                  );
                })}
                {topDepts.length === 0 && (
                  <tr><td colSpan={6} className="si-risk-empty">Chưa có dữ liệu bộ phận</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Activity feed */}
          <div className="si-card">
            <div className="si-activity-head">
              <SectionHead title="Hoạt động gần đây" />
              <a className="si-activity-link" href="/safety-6s/actions">
                Xem tất cả <ChevronRight style={{ width: 12, height: 12 }} />
              </a>
            </div>
            <div className="si-activity-list">
              {(activity.length > 0 ? activity : [{ time: "--:--", type: "created", text: "Chưa có hoạt động nào", dept: "—", src: "manual" }]).map((a, i) => (
                <div key={i} className="si-activity-item">
                  <div className="si-activity-icon" style={{ background: actColor(a.type) + "18" }}>
                    {srcIcon(a.src)}
                  </div>
                  <div className="si-activity-content">
                    <div className="si-activity-text">{a.text}</div>
                    <div className="si-activity-meta">
                      <span className="si-activity-time">{a.time}</span>
                      <span className="si-activity-sep" />
                      <span className="si-activity-dept">{a.dept}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── ROW 5: Sắp hết hạn + Đúng hạn theo bộ phận ─────── */}
        {(soonDue.length > 0 || deptOnTimePct.length > 0) && (
          <div className="si-row si-row-2col-wide">

            {/* CAPA sắp hết hạn */}
            <div className="si-card">
              <div className="si-activity-head">
                <SectionHead title="CAPA sắp hết hạn" sub="trong 7 ngày tới" />
                <a className="si-activity-link" href="/safety-6s/capa-approval">
                  Xem tất cả <ChevronRight style={{ width: 12, height: 12 }} />
                </a>
              </div>
              {soonDue.length === 0 ? (
                <div className="si-soon-empty">
                  <CheckCircle2 style={{ width: 20, height: 20, color: "#10b981" }} />
                  <span>Không có CAPA nào sắp hết hạn</span>
                </div>
              ) : (
                <div className="si-soon-list">
                  {soonDue.slice(0, 6).map((item) => {
                    const urgent = item.daysLeft <= 2;
                    const warn   = item.daysLeft <= 5;
                    const dotColor = urgent ? "#ef4444" : warn ? "#f97316" : "#f59e0b";
                    return (
                      <div key={item.id} className="si-soon-row">
                        <span className="si-soon-dot" style={{ background: dotColor }} />
                        <div className="si-soon-info">
                          <div className="si-soon-title">{item.code} — {item.title}</div>
                          <div className="si-soon-meta">
                            <span className="si-soon-dept">{item.dept || item.ownerName}</span>
                            <span className="si-soon-sep" />
                            <span className="si-soon-days" style={{ color: dotColor, fontWeight: 800 }}>
                              {item.daysLeft === 0 ? "Hôm nay!" : item.daysLeft < 0 ? `QH ${-item.daysLeft} ngày` : `còn ${item.daysLeft} ngày`}
                            </span>
                          </div>
                        </div>
                        <Clock style={{ width: 13, height: 13, color: dotColor, flexShrink: 0 }} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tỷ lệ đúng hạn theo bộ phận */}
            <div className="si-card">
              <SectionHead title="Tỷ lệ đúng hạn theo bộ phận" sub="CAPA đã đóng" />
              {deptOnTimePct.length === 0 ? (
                <div className="si-soon-empty">
                  <Activity style={{ width: 20, height: 20, color: "#94a3b8" }} />
                  <span>Chưa có dữ liệu đóng CAPA</span>
                </div>
              ) : (
                <div className="si-ontime-list">
                  {deptOnTimePct.slice(0, 8).map((d) => {
                    const pct = d.pct ?? 0;
                    const barColor = pct >= 80 ? "#10b981" : pct >= 50 ? "#f97316" : "#ef4444";
                    return (
                      <div key={d.dept} className="si-ontime-row">
                        <div className="si-ontime-header">
                          <span className="si-ontime-dept">{d.dept}</span>
                          <span className="si-ontime-count">{d.onTime}/{d.closed}</span>
                          <span className="si-ontime-pct" style={{ color: barColor }}>{pct}%</span>
                        </div>
                        <div className="si-topic-bar-bg">
                          <div className="si-topic-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── INSIGHTS BAR ─────────────────────────────────────── */}
        <div className="si-insights">
          <div className="si-insights-label">
            <Zap style={{ width: 14, height: 14, color: "#f5c400" }} />
            <span>EHS INSIGHTS</span>
          </div>
          <div className="si-insights-sep" />
          <div className="si-insights-list">
            {displayInsights.map((ins, i) => (
              <div key={i} className={`si-insight-pill si-insight-${ins.level}`}>
                <span>{ins.icon}</span>
                <span>{ins.text}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
