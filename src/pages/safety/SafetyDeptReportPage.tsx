import React, { useState, useCallback, useEffect } from 'react';
import './safety-dept-report.css';
import {
  AlertCircle, AlertTriangle, BarChart2, Building2, CheckCircle2,
  Clock, Download, FileText, Loader2, Printer, RefreshCw, ShieldCheck, TrendingUp, Users,
} from 'lucide-react';
import { SAFETY_DEPARTMENTS } from './safety-domain';

// ─── Types ────────────────────────────────────────────────────────────────────
interface RiskMap { LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number; }

interface DeptIplanRow {
  planCode?: string; planPeriod?: string; planStatus?: string;
  planTitle?: string; status?: string;
}
interface DeptIplan {
  plansIncluded: number; deptRowsTotal: number; deptRowsDone: number;
  pct: number; openCapa: number; criticalCapa: number; rows: DeptIplanRow[];
}
interface DeptWarnings { total: number; open: number; approved: number; byRiskLevel: RiskMap; }
interface DeptIncidents { total: number; open: number; bySeverity: Record<string, number>; }
interface MeetingsStat { total: number; completed: number; }
interface KpiStat { total: number; approved: number; pending?: number; }

interface DeptReport {
  dept: string; year: string | null; generatedAt: string;
  inspectionPlans: DeptIplan; warnings: DeptWarnings; incidents: DeptIncidents;
  safetyMeetings: MeetingsStat; kpiEntries: KpiStat;
}

interface IplanSummary {
  total: number; draft: number; inProgress: number; completed: number;
  cancelled: number; approved: number; pctCompleted: number;
  openCapa: number; criticalCapa: number;
}
interface MeetingSummary {
  total: number; completed: number; upcoming: number; overdue: number;
  pctCompleted: number; openActions: number; overdueActions: number;
}
interface CompanyReport {
  year: string | null; generatedAt: string;
  inspectionPlans: IplanSummary; safetyMeetings: MeetingSummary;
  warnings: DeptWarnings; incidents: DeptIncidents;
  kpiEntries: KpiStat; training: { total: number; completed: number; };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CUR_YEAR = new Date().getFullYear();
const YEARS = [String(CUR_YEAR - 1), String(CUR_YEAR), String(CUR_YEAR + 1)];

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

const RISK_META: { key: keyof RiskMap; label: string; color: string }[] = [
  { key: 'CRITICAL', label: 'Nghiêm trọng', color: '#c62828' },
  { key: 'HIGH',     label: 'Cao',          color: '#e65100' },
  { key: 'MEDIUM',   label: 'Trung bình',   color: '#f57f17' },
  { key: 'LOW',      label: 'Thấp',         color: '#2e7d32' },
];

const STATUS_MAP: Record<string, { bg: string; color: string; label: string }> = {
  draft:       { bg: '#f5f5f5', color: '#616161', label: 'Nháp' },
  inProgress:  { bg: '#e3f2fd', color: '#1565c0', label: 'Đang KT' },
  done:        { bg: '#e8f5e9', color: '#2e7d32', label: 'Đã xong' },
  skipped:     { bg: '#fff8e1', color: '#f57f17', label: 'Bỏ qua' },
  approved:    { bg: '#e8f5e9', color: '#1b5e20', label: 'Phê duyệt' },
  completed:   { bg: '#e8f5e9', color: '#2e7d32', label: 'Hoàn thành' },
  cancelled:   { bg: '#fce4ec', color: '#b71c1c', label: 'Hủy' },
};

// ─── Shared atoms ─────────────────────────────────────────────────────────────
function StatCard({ icon, iconBg, iconColor, label, value, sub, sub2, alert }: {
  icon: React.ReactNode; iconBg: string; iconColor: string;
  label: string; value: React.ReactNode; sub?: string; sub2?: string; alert?: boolean;
}) {
  return (
    <div className={`sdept-stat-card${alert ? ' sdept-stat-alert' : ''}`}>
      <div className="sdept-stat-top">
        <span style={{ background: iconBg, color: iconColor }} className="sdept-stat-icon">{icon}</span>
        <span className="sdept-stat-label">{label}</span>
      </div>
      <div className="sdept-stat-value">{value}</div>
      {sub  && <div className="sdept-stat-sub">{sub}</div>}
      {sub2 && <div className="sdept-stat-sub2">{sub2}</div>}
    </div>
  );
}

function StatusBadge({ value }: { value?: string }) {
  const info = STATUS_MAP[value || ''] ?? { bg: '#f5f5f5', color: '#757575', label: value || '—' };
  return (
    <span style={{ background: info.bg, color: info.color }} className="sdept-badge">{info.label}</span>
  );
}

function RiskBar({ map }: { map: RiskMap }) {
  const total = RISK_META.reduce((s, m) => s + (map[m.key] || 0), 0);
  return (
    <div className="sdept-risk-wrap">
      {RISK_META.map(m => {
        const v = map[m.key] || 0;
        return (
          <div key={m.key} className="sdept-risk-row">
            <span style={{ color: m.color }} className="sdept-risk-label">{m.label}</span>
            <div className="sdept-risk-track">
              <div style={{ width: `${pct(v, total)}%`, background: m.color }} className="sdept-risk-fill"/>
            </div>
            <span className="sdept-risk-count">{v}</span>
          </div>
        );
      })}
    </div>
  );
}

function SeverityChips({ map }: { map: Record<string, number> }) {
  const entries = Object.entries(map).filter(([, v]) => v > 0);
  if (entries.length === 0) return <span className="sdept-none-text">Không có dữ liệu</span>;
  return (
    <div className="sdept-chips">
      {entries.map(([k, v]) => (
        <span key={k} className="sdept-chip">{k}: <strong>{v}</strong></span>
      ))}
    </div>
  );
}

// ─── Dept report ──────────────────────────────────────────────────────────────
function DeptReportView({ data }: { data: DeptReport }) {
  const ip = data.inspectionPlans;
  const w  = data.warnings;
  const i  = data.incidents;
  const m  = data.safetyMeetings;
  const k  = data.kpiEntries;

  return (
    <div className="sdept-content">
      <div className="sdept-stat-grid">
        <StatCard
          icon={<ShieldCheck size={15}/>} iconBg="#e8f5e9" iconColor="#2e7d32"
          label="Kế hoạch kiểm tra"
          value={<>{ip.pct}<span className="sdept-unit">%</span></>}
          sub={`${ip.deptRowsDone}/${ip.deptRowsTotal} hạng mục hoàn thành`}
          sub2={`${ip.plansIncluded} kế hoạch trong kỳ`}
        />
        <StatCard
          icon={<AlertCircle size={15}/>} iconBg="#fce4ec" iconColor="#c62828"
          label="CAPA còn mở" value={ip.openCapa}
          sub={ip.criticalCapa > 0 ? `${ip.criticalCapa} nghiêm trọng / quá hạn` : 'Không có CAPA nghiêm trọng'}
          alert={ip.criticalCapa > 0}
        />
        <StatCard
          icon={<AlertTriangle size={15}/>} iconBg="#fff3e0" iconColor="#e65100"
          label="Cảnh báo" value={w.total}
          sub={`Chờ duyệt: ${w.open}`} sub2={`Đã duyệt: ${w.approved}`}
        />
        <StatCard
          icon={<FileText size={15}/>} iconBg="#fbe9e7" iconColor="#bf360c"
          label="Sự cố" value={i.total}
          sub={i.open > 0 ? `${i.open} đang xử lý` : 'Không có sự cố đang xử lý'}
          alert={i.open > 0}
        />
        <StatCard
          icon={<Users size={15}/>} iconBg="#e3f2fd" iconColor="#1565c0"
          label="Họp an toàn" value={m.completed}
          sub={`${pct(m.completed, m.total)}% hoàn thành`}
          sub2={`Tổng ${m.total} cuộc họp`}
        />
        <StatCard
          icon={<TrendingUp size={15}/>} iconBg="#f3e5f5" iconColor="#6a1b9a"
          label="KPI entries" value={k.approved}
          sub={`${pct(k.approved, k.total)}% đã duyệt`}
          sub2={k.pending ? `${k.pending} chờ duyệt` : undefined}
        />
      </div>

      {w.total > 0 && (
        <div className="sdept-breakdown-card">
          <div className="sdept-breakdown-title">Phân loại cảnh báo theo mức rủi ro</div>
          <RiskBar map={w.byRiskLevel}/>
        </div>
      )}

      {i.total > 0 && (
        <div className="sdept-breakdown-card">
          <div className="sdept-breakdown-title">Phân loại sự cố theo mức độ</div>
          <SeverityChips map={i.bySeverity}/>
        </div>
      )}

      {ip.rows.length > 0 && (
        <div className="sdept-table-card">
          <div className="sdept-breakdown-title">Chi tiết hạng mục kiểm tra của bộ phận</div>
          <div className="sdept-table-wrap">
            <table className="sdept-table">
              <thead>
                <tr>
                  <th>Mã KH</th><th>Kỳ</th><th>Tiêu đề kế hoạch</th><th>Trạng thái KH</th><th>Trạng thái BP</th>
                </tr>
              </thead>
              <tbody>
                {ip.rows.map((r, idx) => (
                  <tr key={idx}>
                    <td className="sdept-td-code">{r.planCode || '—'}</td>
                    <td>{r.planPeriod || '—'}</td>
                    <td className="sdept-td-title">{r.planTitle || '—'}</td>
                    <td><StatusBadge value={r.planStatus}/></td>
                    <td><StatusBadge value={r.status}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ip.rows.length === 0 && ip.deptRowsTotal === 0 && (
        <div className="sdept-empty-info">
          <CheckCircle2 size={18}/> Bộ phận này chưa có hạng mục kiểm tra trong kỳ đã chọn.
        </div>
      )}
    </div>
  );
}

// ─── Company report ───────────────────────────────────────────────────────────
function CompanyReportView({ data }: { data: CompanyReport }) {
  const ip = data.inspectionPlans;
  const m  = data.safetyMeetings;
  const w  = data.warnings;
  const i  = data.incidents;
  const k  = data.kpiEntries;
  const tr = data.training;

  return (
    <div className="sdept-content">
      <div className="sdept-stat-grid">
        <StatCard
          icon={<ShieldCheck size={15}/>} iconBg="#e8f5e9" iconColor="#2e7d32"
          label="Kế hoạch kiểm tra"
          value={<>{ip.pctCompleted}<span className="sdept-unit">%</span></>}
          sub={`${ip.completed}/${ip.total} hoàn thành`}
          sub2={`CAPA mở: ${ip.openCapa}${ip.criticalCapa ? ` (${ip.criticalCapa} nghiêm trọng)` : ''}`}
        />
        <StatCard
          icon={<Users size={15}/>} iconBg="#e3f2fd" iconColor="#1565c0"
          label="Họp an toàn"
          value={<>{m.pctCompleted}<span className="sdept-unit">%</span></>}
          sub={`${m.completed}/${m.total} hoàn thành`}
          sub2={m.overdue ? `${m.overdue} quá hạn` : undefined}
          alert={m.overdue > 0}
        />
        <StatCard
          icon={<AlertTriangle size={15}/>} iconBg="#fff3e0" iconColor="#e65100"
          label="Cảnh báo" value={w.total}
          sub={`Chờ duyệt: ${w.open}`} sub2={`Đã duyệt: ${w.approved}`}
        />
        <StatCard
          icon={<FileText size={15}/>} iconBg="#fbe9e7" iconColor="#bf360c"
          label="Sự cố" value={i.total}
          sub={i.open > 0 ? `${i.open} đang xử lý` : 'Không có sự cố đang xử lý'}
          alert={i.open > 0}
        />
        <StatCard
          icon={<TrendingUp size={15}/>} iconBg="#f3e5f5" iconColor="#6a1b9a"
          label="KPI đã duyệt" value={k.approved}
          sub={`${pct(k.approved, k.total)}% tổng ${k.total} entries`}
        />
        <StatCard
          icon={<Clock size={15}/>} iconBg="#e0f2f1" iconColor="#00695c"
          label="Đào tạo" value={tr.completed}
          sub={`${pct(tr.completed, tr.total)}% hoàn thành`}
          sub2={`Tổng ${tr.total} khóa`}
        />
      </div>

      {w.total > 0 && (
        <div className="sdept-breakdown-card">
          <div className="sdept-breakdown-title">Phân loại cảnh báo theo mức rủi ro</div>
          <RiskBar map={w.byRiskLevel}/>
        </div>
      )}

      {i.total > 0 && (
        <div className="sdept-breakdown-card">
          <div className="sdept-breakdown-title">Phân loại sự cố theo mức độ</div>
          <SeverityChips map={i.bySeverity}/>
        </div>
      )}

      <div className="sdept-breakdown-card">
        <div className="sdept-breakdown-title">Trạng thái kế hoạch kiểm tra</div>
        <div className="sdept-chips">
          {ip.draft      > 0 && <span className="sdept-chip">Nháp: <strong>{ip.draft}</strong></span>}
          {ip.inProgress > 0 && <span className="sdept-chip">Đang KT: <strong>{ip.inProgress}</strong></span>}
          {ip.completed  > 0 && <span className="sdept-chip">Hoàn thành: <strong>{ip.completed}</strong></span>}
          {ip.approved   > 0 && <span className="sdept-chip">Phê duyệt: <strong>{ip.approved}</strong></span>}
          {ip.cancelled  > 0 && <span className="sdept-chip" style={{color:'#b71c1c'}}>Hủy: <strong>{ip.cancelled}</strong></span>}
          {ip.total === 0 && <span className="sdept-none-text">Chưa có kế hoạch nào trong kỳ</span>}
        </div>
      </div>

      <div className="sdept-breakdown-card">
        <div className="sdept-breakdown-title">Trạng thái họp an toàn</div>
        <div className="sdept-chips">
          <span className="sdept-chip">Sắp diễn ra: <strong>{m.upcoming}</strong></span>
          {m.overdue > 0 && <span className="sdept-chip" style={{color:'#b71c1c'}}>Quá hạn: <strong>{m.overdue}</strong></span>}
          <span className="sdept-chip">Actions mở: <strong>{m.openActions}</strong></span>
          {m.overdueActions > 0 && <span className="sdept-chip" style={{color:'#b71c1c'}}>Actions quá hạn: <strong>{m.overdueActions}</strong></span>}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function SafetyDeptReportPage() {
  const [tab, setTab]             = useState<'dept' | 'company'>('dept');
  const [dept, setDept]           = useState(SAFETY_DEPARTMENTS[0]);
  const [year, setYear]           = useState(String(CUR_YEAR));
  const [deptData, setDeptData]   = useState<DeptReport | null>(null);
  const [coData, setCoData]       = useState<CompanyReport | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [loaded, setLoaded]       = useState(false);

  const fetchDept = useCallback(async (d: string, y: string) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/safety/dept-report?dept=${encodeURIComponent(d)}&year=${encodeURIComponent(y)}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setDeptData(await r.json());
      setLoaded(true);
    } catch (e) {
      setError(`Không tải được báo cáo bộ phận. ${e instanceof Error ? e.message : ''}`);
    } finally { setLoading(false); }
  }, []);

  const fetchCompany = useCallback(async (y: string) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/safety/company-report?year=${encodeURIComponent(y)}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setCoData(await r.json());
      setLoaded(true);
    } catch (e) {
      setError(`Không tải được báo cáo công ty. ${e instanceof Error ? e.message : ''}`);
    } finally { setLoading(false); }
  }, []);

  const handleLoad = useCallback(() => {
    if (tab === 'dept') fetchDept(dept, year);
    else fetchCompany(year);
  }, [tab, dept, year, fetchDept, fetchCompany]);

  const handleTabChange = (t: 'dept' | 'company') => {
    setTab(t);
    setError(null);
    setLoaded(false);
  };

  // Auto-load on mount with current year
  useEffect(() => {
    fetchDept(dept, year);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleExportExcel = useCallback(async () => {
    const reportData = tab === 'dept' ? deptData : coData;
    if (!reportData) return;
    try {
      const res = await fetch('/api/safety/dept-report/export.xlsx', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportData, tab, year }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const scope = tab === 'dept' ? (deptData?.dept || 'BoPhan') : 'CongTy';
      a.href = url; a.download = `BaoCaoAnToan_${scope}_${year}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Không xuất được file Excel. Vui lòng thử lại.');
    }
  }, [tab, deptData, coData, year]);

  const handleExportCsv = useCallback(() => {
    const rows: string[][] = [];
    if (tab === 'dept' && deptData) {
      rows.push(['Bộ phận', 'Năm', 'Kế hoạch KT (%)', 'CAPA mở', 'CAPA nghiêm trọng',
        'Cảnh báo', 'Đã duyệt', 'Sự cố', 'Sự cố đang xử lý', 'Họp AT', 'Họp hoàn thành', 'KPI đã duyệt']);
      const d = deptData;
      rows.push([
        d.dept, d.year ?? '', String(d.inspectionPlans.pct),
        String(d.inspectionPlans.openCapa), String(d.inspectionPlans.criticalCapa),
        String(d.warnings.total), String(d.warnings.approved),
        String(d.incidents.total), String(d.incidents.open),
        String(d.safetyMeetings.total), String(d.safetyMeetings.completed),
        String(d.kpiEntries?.approved ?? ''),
      ]);
      if (d.inspectionPlans.rows.length > 0) {
        rows.push([]);
        rows.push(['Mã KH', 'Kỳ', 'Tiêu đề KH', 'TT kế hoạch', 'TT bộ phận']);
        for (const r of d.inspectionPlans.rows) {
          rows.push([r.planCode ?? '', r.planPeriod ?? '', r.planTitle ?? '', r.planStatus ?? '', r.status ?? '']);
        }
      }
    } else if (tab === 'company' && coData) {
      rows.push(['Năm', 'KH KT (%)', 'KH hoàn thành', 'CAPA mở',
        'Họp AT (%)', 'Họp hoàn thành', 'Cảnh báo', 'Sự cố', 'KPI đã duyệt', 'Đào tạo hoàn thành']);
      const c = coData;
      rows.push([
        c.year ?? '',
        String(c.inspectionPlans.pctCompleted), String(c.inspectionPlans.completed), String(c.inspectionPlans.openCapa),
        String(c.safetyMeetings.pctCompleted), String(c.safetyMeetings.completed),
        String(c.warnings.total), String(c.incidents.total),
        String(c.kpiEntries.approved),
        String(c.training?.completed ?? ''),
      ]);
    }
    if (rows.length === 0) return;
    const esc = (v: string) => v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
    const csv = rows.map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bao-cao-${tab}-${year}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [tab, deptData, coData, year]);

  const genAt = tab === 'dept' ? deptData?.generatedAt : coData?.generatedAt;

  const printTitle = tab === 'dept'
    ? `Báo cáo An toàn – ${dept} – Năm ${year}`
    : `Báo cáo An toàn Toàn công ty – Năm ${year}`;

  return (
    <div className="sdept-page">
      {/* Print-only header */}
      <div className="sdept-print-header">
        <div className="sdept-print-logo">MHChub Safety System</div>
        <div className="sdept-print-title">{printTitle}</div>
        <div className="sdept-print-meta">
          Ngày in: {new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          {genAt ? ` · Dữ liệu tại: ${new Date(genAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </div>
      </div>

      {/* Header */}
      <div className="sdept-header-card">
        <div className="sdept-eyebrow">
          <BarChart2 size={13}/> Báo cáo Safety tổng hợp
        </div>
        <h1 className="sdept-title">Báo cáo bộ phận &amp; công ty</h1>
        <p className="sdept-desc">
          Thống kê từ kế hoạch kiểm tra, cảnh báo, sự cố, họp an toàn và KPI theo kỳ lựa chọn.
        </p>
      </div>

      {/* Tabs */}
      <div className="sdept-tabs">
        <button
          className={`sdept-tab${tab === 'dept' ? ' active' : ''}`}
          onClick={() => handleTabChange('dept')}
        >
          <Building2 size={14}/> Theo bộ phận
        </button>
        <button
          className={`sdept-tab${tab === 'company' ? ' active' : ''}`}
          onClick={() => handleTabChange('company')}
        >
          <ShieldCheck size={14}/> Toàn công ty
        </button>
      </div>

      {/* Filter bar */}
      <div className="sdept-filter-bar">
        {tab === 'dept' && (
          <div className="sdept-filter-group">
            <label className="sdept-filter-label">Bộ phận</label>
            <select className="sdept-select" value={dept} onChange={e => setDept(e.target.value)}>
              {SAFETY_DEPARTMENTS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        )}
        <div className="sdept-filter-group">
          <label className="sdept-filter-label">Năm</label>
          <select className="sdept-select" value={year} onChange={e => setYear(e.target.value)}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button className="sdept-load-btn" onClick={handleLoad} disabled={loading}>
          {loading
            ? <Loader2 size={14} style={{ animation: 'sdept-spin 1s linear infinite' }}/>
            : <RefreshCw size={14}/>
          }
          Tải báo cáo
        </button>
        {loaded && !loading && (
          <>
            <button className="sdept-export-btn" onClick={handleExportExcel} title="Tải về Excel (.xlsx)">
              <Download size={14}/> Xuất Excel
            </button>
            <button className="sdept-export-btn sdept-print-btn" onClick={handlePrint} title="In / Xuất PDF">
              <Printer size={14}/> In PDF
            </button>
            <button className="sdept-export-btn" style={{ opacity: 0.6, fontSize: 11 }} onClick={handleExportCsv} title="Tải về CSV (cơ bản)">
              CSV
            </button>
          </>
        )}
        {genAt && !loading && (
          <span className="sdept-gen-at">
            Cập nhật lúc {new Date(genAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="sdept-error-box">
          <AlertCircle size={14}/> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="sdept-loading-box">
          <Loader2 size={18} style={{ animation: 'sdept-spin 1s linear infinite' }}/> Đang tải báo cáo…
        </div>
      )}

      {/* Content */}
      {!loading && !error && tab === 'dept'    && deptData && <DeptReportView data={deptData}/>}
      {!loading && !error && tab === 'company' && coData   && <CompanyReportView data={coData}/>}

      {/* Empty state */}
      {!loading && !error && !loaded && (
        <div className="sdept-empty-box">
          <BarChart2 size={30}/>
          <div>Chọn {tab === 'dept' ? 'bộ phận và ' : ''}năm rồi nhấn <strong>Tải báo cáo</strong> để xem số liệu.</div>
        </div>
      )}
    </div>
  );
}
