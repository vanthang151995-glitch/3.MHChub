import React, { useState, useEffect, useCallback, useRef } from 'react';
import "./safety-reports.css";
import { AlertCircle, BarChart2, Building2, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, FileText, Loader2, Plus, Printer, Save, ShieldCheck, Trash2, User, X, } from 'lucide-react';
import { DEPARTMENTS, sampleArray } from './safety-sample-adapter';
import { AreaChart, Area, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, } from 'recharts';
import { useHubLanguage } from '../../i18n-context';
import { localizedText } from '../../i18n-localized';
import { SafetyI18nRender } from "./safety-i18n-render";
import { SafetyLocalizedTextField, emptySafetyLocalizedText, safetyLocalizedPayload, safetyLocalizedVi } from "./safety-localized-form";
type RType = 'Tuần' | 'Tháng' | 'Quý';
type LocalizedContent = Record<string, string | undefined>;
interface Report {
    id: string;
    code: string;
    title: string;
    titleI18n?: LocalizedContent;
    notes?: string;
    notesI18n?: LocalizedContent;
    type: RType;
    period: string;
    department: string;
    creator: string;
    date: string;
    status: 'APPROVED' | 'PENDING' | 'Nháp';
    createdAt: string;
}
type ChartPayloadItem = {
    dataKey?: string;
    fill?: string;
    name?: React.ReactNode;
    stroke?: string;
    value?: React.ReactNode;
};
type ChartTooltipProps = {
    active?: boolean;
    label?: React.ReactNode;
    payload?: ChartPayloadItem[];
};
/* ─── Types for chart aggregation ─────────────────────────────── */
interface RptIncident {
    id?: string;
    code?: string;
    occurredDate?: string;
    createdAt: string;
    createdByName?: string;
    submittedByName?: string;
}
interface RptWarning {
    id?: string;
    code?: string;
    createdAt: string;
    createdByName?: string;
    submittedByName?: string;
}
interface RptKpiEntry {
    id?: string;
    code?: string;
    entryType: string;
    period: string;
    value: string;
    approvalStatus: string;
    createdByName?: string;
    submittedByName?: string;
}
type MonthPoint = {
    month: string;
    incidents: number;
    violations: number;
    checklist: number;
    training: number;
    safetyScore: number;
};
interface IplanSummary {
    year: string | null;
    totalPlans: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    deptProgress: Array<{ deptCode: string; divisionCode: string; total: number; done: number; pct: number }>;
    divisionProgress: Array<{ divisionCode: string; total: number; done: number; pct: number }>;
    openCorrectiveActions: number;
    criticalCorrectiveActions: number;
}
interface MeetingSummary {
    year: string | null;
    total: number;
    completed: number;
    planned: number;
    cancelled: number;
    completionRate: number;
    byType: Record<string, number>;
    totalActionItems: number;
    openActionItems: number;
    overdueActionItems: number;
}
function buildMonthlyData(incidents: RptIncident[], warnings: RptWarning[], entries: RptKpiEntry[]): MonthPoint[] {
    type Acc = {
        incidents: number;
        violations: number;
        scoreSum: number;
        scoreN: number;
        clSum: number;
        clN: number;
        trSum: number;
        trN: number;
    };
    const m = new Map<string, Acc>();
    const get = (k: string): Acc => {
        if (!m.has(k))
            m.set(k, { incidents: 0, violations: 0, scoreSum: 0, scoreN: 0, clSum: 0, clN: 0, trSum: 0, trN: 0 });
        return m.get(k)!;
    };
    for (const inc of incidents) {
        const k = (inc.occurredDate || inc.createdAt).slice(0, 7);
        if (k)
            get(k).incidents++;
    }
    for (const w of warnings) {
        const k = w.createdAt?.slice(0, 7);
        if (k)
            get(k).violations++;
    }
    for (const e of entries.filter(e => e.approvalStatus === 'approved')) {
        const k = e.period.length >= 7 ? e.period.slice(0, 7) : null;
        if (!k)
            continue;
        const a = get(k);
        const v = parseFloat(e.value);
        if (e.entryType === 'safety_score_monthly') {
            a.scoreSum += v;
            a.scoreN++;
        }
        if (e.entryType === 'checklist_daily' || e.entryType === 'checklist_monthly') {
            a.clSum += v;
            a.clN++;
        }
        if (e.entryType === 'training_monthly') {
            a.trSum += v;
            a.trN++;
        }
    }
    const sorted = Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
    return sorted.map(([period, a]) => ({
        month: `T${parseInt(period.split('-')[1], 10)}`,
        incidents: a.incidents,
        violations: a.violations,
        safetyScore: a.scoreN ? Math.round(a.scoreSum / a.scoreN) : 0,
        checklist: a.clN ? Math.round(a.clSum / a.clN) : 0,
        training: a.trN ? Math.round(a.trSum / a.trN) : 0,
    }));
}
const MOCK_MONTHLY_DATA: MonthPoint[] = [
    { month: 'T1', incidents: 5, violations: 12, checklist: 72, training: 65, safetyScore: 85 },
    { month: 'T2', incidents: 7, violations: 15, checklist: 75, training: 70, safetyScore: 87 },
    { month: 'T3', incidents: 4, violations: 9, checklist: 79, training: 75, safetyScore: 88 },
    { month: 'T4', incidents: 6, violations: 11, checklist: 83, training: 80, safetyScore: 91 },
    { month: 'T5', incidents: 4, violations: 7, checklist: 88, training: 87, safetyScore: 93 },
    { month: 'T6', incidents: 2, violations: 4, checklist: 93, training: 92, safetyScore: 96 },
];
const stColor: Record<string, string> = { 'APPROVED': '#22a050', 'PENDING': '#f9a825', 'Nháp': '#1565c0' };
const typeColor: Record<string, string> = { 'Tuần': '#00a99d', 'Tháng': '#1565c0', 'Quý': '#f4511e' };
const REPORT_PAGE_SIZE = 12;
const EMPTY_REPORT_FORM = {
    creator: '',
    department: DEPARTMENTS[0],
    notes: '',
    notesI18n: emptySafetyLocalizedText(),
    period: '',
    title: '',
    titleI18n: emptySafetyLocalizedText(),
    type: 'Tuần' as RType,
};
const CustomTooltip = ({ active, payload, label }: ChartTooltipProps) => {
    if (!active || !payload?.length)
        return null;
    return (<div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl text-xs min-w-[150px]">
      <p className="font-bold mb-1.5">{label}</p>
      {payload.map((p) => (<p key={p.dataKey} style={{ color: p.stroke || p.fill }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <strong>{p.value}{['checklist', 'training', 'safetyScore'].includes(p.dataKey) ? '%' : ''}</strong>
        </p>))}
    </div>);
};
function authHeaders(): Record<string, string> {
    const tk = localStorage.getItem('mhc_session_token');
    return { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) };
}
function normalizeReport(raw: unknown): Report {
    const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const createdAt = String(record.createdAt || record.updatedAt || new Date().toISOString());
    return {
        id: String(record.id || ''),
        code: String(record.code || ''),
        title: String(record.title || 'Báo cáo'),
        titleI18n: record.titleI18n as LocalizedContent | undefined,
        notes: String(record.notes || ''),
        notesI18n: record.notesI18n as LocalizedContent | undefined,
        type: (record.type || 'Tháng') as RType,
        period: String(record.period || ''),
        department: String(record.department || ''),
        creator: String(record.creator || record.createdByName || ''),
        date: String(record.date || createdAt.slice(0, 10)),
        status: (record.status || 'Nháp') as Report['status'],
        createdAt,
    };
}
export function SafetyReportsPage() {
    const { lang } = useHubLanguage();
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('Tất cả');
    const [filterDept, setFilterDept] = useState('Tất cả');
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Report | null>(null);
    const [formError, setFormError] = useState('');
    const [form, setForm] = useState({ ...EMPTY_REPORT_FORM });
    const [activeChart, setActiveChart] = useState<'overview' | 'incidents' | 'checklist'>('overview');
    const [monthlyData, setMonthlyData] = useState<MonthPoint[]>(MOCK_MONTHLY_DATA);
    const [chartSource, setChartSource] = useState<'mock' | 'live' | 'seeded'>('mock');
    const [reportPage, setReportPage] = useState(1);
    const [iplanSummary, setIplanSummary] = useState<IplanSummary | null>(null);
    const [meetingSummary, setMeetingSummary] = useState<MeetingSummary | null>(null);
    const [exportingIplan, setExportingIplan] = useState(false);
    const [exportingMeeting, setExportingMeeting] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);
    const reportTitle = useCallback((report: Report) => localizedText(report.titleI18n, lang, report.title || 'Báo cáo'), [lang]);
    const loadReports = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/reports', { headers: authHeaders() });
            if (!res.ok)
                throw new Error('fetch failed');
            const rows = sampleArray<Report>(await res.json());
            setReports(rows.map(normalizeReport));
        }
        catch {
            setReports([]);
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        loadReports();
        (async () => {
            try {
                const [incRes, warnRes, kpiRes, iplanRes, meetingRes] = await Promise.all([
                    fetch('/api/incidents', { headers: authHeaders() }),
                    fetch('/api/warnings', { headers: authHeaders() }),
                    fetch('/api/kpi-entries?approvalStatus=approved', { headers: authHeaders() }),
                    fetch(`/api/inspection-plans/summary?year=${new Date().getFullYear()}`, { headers: authHeaders() }),
                    fetch(`/api/safety-meetings/summary?year=${new Date().getFullYear()}`, { headers: authHeaders() }),
                ]);
                if (incRes.ok && warnRes.ok && kpiRes.ok) {
                    const [incPayload, warnPayload, kpiPayload] = await Promise.all([incRes.json(), warnRes.json(), kpiRes.json()]);
                    const incidents = sampleArray<RptIncident>(incPayload);
                    const warnings = sampleArray<RptWarning>(warnPayload);
                    const kpiEntries = sampleArray<RptKpiEntry>(kpiPayload);
                    const built = buildMonthlyData(incidents, warnings, kpiEntries);
                    if (built.length > 0) {
                        const hasSeed = [...incidents, ...warnings, ...kpiEntries].some(item => /^(CHART-|MOCK-)/i.test(String(item.id || item.code || '')) ||
                            /seed|mock/i.test(`${item.createdByName || ''} ${item.submittedByName || ''}`));
                        setMonthlyData(built);
                        setChartSource(hasSeed ? 'seeded' : 'live');
                    }
                }
                if (iplanRes.ok) setIplanSummary(await iplanRes.json());
                if (meetingRes.ok) setMeetingSummary(await meetingRes.json());
            }
            catch {
                setChartSource('mock');
            }
        })();
    }, [loadReports]);

    async function handleExportIplan() {
        setExportingIplan(true);
        try {
            const year = new Date().getFullYear();
            const res = await fetch(`/api/inspection-plans/export.csv?year=${year}`, { headers: authHeaders() });
            if (!res.ok) return;
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `ke-hoach-kiem-tra-${year}.csv`; a.click();
            URL.revokeObjectURL(url);
        } catch { /* ignore */ } finally { setExportingIplan(false); }
    }

    async function handleExportMeeting() {
        setExportingMeeting(true);
        try {
            const year = new Date().getFullYear();
            const res = await fetch(`/api/safety-meetings/export.csv?year=${year}`, { headers: authHeaders() });
            if (!res.ok) return;
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `hop-an-toan-${year}.csv`; a.click();
            URL.revokeObjectURL(url);
        } catch { /* ignore */ } finally { setExportingMeeting(false); }
    }
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setFormError('');
        try {
            const titleI18n = safetyLocalizedPayload(form.titleI18n, form.title);
            const notesI18n = safetyLocalizedPayload(form.notesI18n, form.notes);
            const payload = {
                ...form,
                title: safetyLocalizedVi(titleI18n, form.title),
                titleI18n,
                notes: safetyLocalizedVi(notesI18n, form.notes),
                notesI18n,
            };
            const res = await fetch('/api/reports', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(payload),
            });
            if (!res.ok)
                throw new Error('save failed');
            await loadReports();
            setShowForm(false);
            setForm({ ...EMPTY_REPORT_FORM });
        }
        catch {
            setFormError('Không tạo được báo cáo. Vui lòng thử lại.');
        }
        finally {
            setSaving(false);
        }
    }
    async function handleUpdateStatus(id: string, status: string) {
        try {
            const res = await fetch(`/api/reports/${id}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ status }),
            });
            if (!res.ok)
                return;
            setReports(prev => prev.map(r => r.id === id ? { ...r, status: status as Report['status'] } : r));
        }
        catch { /* ignore */ }
    }
    async function handleDelete(id: string) {
        setDeleting(true);
        try {
            const res = await fetch(`/api/reports/${id}`, { method: 'DELETE', headers: authHeaders() });
            if (!res.ok)
                return;
            setReports(prev => prev.filter(r => r.id !== id));
            setDeleteTarget(null);
        }
        catch { /* ignore */ }
        finally {
            setDeleting(false);
        }
    }
    function handlePrint(report: Report) {
        const win = window.open('', '_blank', 'width=800,height=600');
        if (!win)
            return;
        const title = reportTitle(report);
        win.document.write(`
      <html><head><title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #222; }
        h1 { color: #1565c0; font-size: 22px; margin-bottom: 8px; }
        .meta { color: #555; font-size: 13px; margin-bottom: 24px; }
        .meta span { margin-right: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; font-size: 13px; text-align: left; }
        th { background: #f5f5f5; font-weight: 700; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 700; }
        @media print { button { display: none; } }
      </style>
      </head><body>
      <h1>${title}</h1>
      <div class="meta">
        <span>Mã: <strong>${report.code}</strong></span>
        <span>Loại: <strong>${report.type}</strong></span>
        <span>Kỳ: <strong>${report.period || '—'}</strong></span>
        <span>Bộ phận: <strong>${report.department}</strong></span>
        <span>Người lập: <strong>${report.creator}</strong></span>
        <span>Ngày: <strong>${report.date}</strong></span>
        <span>Trạng thái: <strong>${report.status}</strong></span>
      </div>
      <hr/>
      <p style="color:#777;font-size:13px;">Nội dung báo cáo sẽ được bổ sung khi tích hợp mẫu báo cáo chi tiết.</p>
      <button onclick="window.print()" style="margin-top:20px;padding:10px 24px;background:#1565c0;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;">In báo cáo</button>
      </body></html>
    `);
        win.document.close();
    }
    const filtered = reports.filter(r => (filterType === 'Tất cả' || r.type === filterType) &&
        (filterDept === 'Tất cả' || r.department === filterDept));
    useEffect(() => {
        setReportPage(1);
    }, [filterType, filterDept, reports.length]);
    const totalReportPages = Math.max(1, Math.ceil(filtered.length / REPORT_PAGE_SIZE));
    const currentReportPage = Math.min(reportPage, totalReportPages);
    const reportStartIndex = (currentReportPage - 1) * REPORT_PAGE_SIZE;
    const pagedReports = filtered.slice(reportStartIndex, reportStartIndex + REPORT_PAGE_SIZE);
    const displayStart = filtered.length ? reportStartIndex + 1 : 0;
    const displayEnd = Math.min(reportStartIndex + REPORT_PAGE_SIZE, filtered.length);
    const approved = reports.filter(r => r.status === 'APPROVED').length;
    const pending = reports.filter(r => r.status === 'PENDING').length;
    const incidentTotal = monthlyData.reduce((sum, item) => sum + item.incidents + item.violations, 0);
    const latestScore = [...monthlyData].reverse().find(item => item.safetyScore > 0)?.safetyScore || 0;
    const departmentCoverage = new Set(reports.map(report => report.department).filter(Boolean)).size;
    const chartSourceLabel = chartSource === 'live' ? 'DB live' : chartSource === 'seeded' ? 'DB + seed chart' : 'Fallback mẫu';
    const iplanDone = (iplanSummary?.byStatus?.completed ?? 0) + (iplanSummary?.byStatus?.approved ?? 0);
    const iplanPct  = iplanSummary?.totalPlans ? Math.round((iplanDone / iplanSummary.totalPlans) * 100) : 0;
    const reportStats = [
        { label: 'Tổng báo cáo', val: loading ? '…' : reports.length, color: '#1565c0', sub: 'Từ đầu năm', Icon: FileText },
        { label: 'APPROVED', val: loading ? '…' : approved, color: '#22a050', sub: reports.length > 0 ? `${Math.round(approved / reports.length * 100)}% tỷ lệ` : '—', Icon: CheckCircle2 },
        { label: 'Kế hoạch KT', val: iplanSummary ? `${iplanPct}%` : '…', color: '#7b1fa2', sub: iplanSummary ? `${iplanSummary.totalPlans} kế hoạch năm ${new Date().getFullYear()}` : 'Đang tải…', Icon: ShieldCheck },
        { label: 'Họp an toàn', val: meetingSummary ? meetingSummary.completed : '…', color: '#00838f', sub: meetingSummary ? `${meetingSummary.completionRate}% hoàn thành / ${meetingSummary.total} cuộc` : 'Đang tải…', Icon: Calendar },
        { label: 'Sự cố ghi nhận', val: incidentTotal, color: '#e53935', sub: 'Sự cố + vi phạm', Icon: AlertCircle },
        { label: 'PENDING', val: loading ? '…' : pending, color: '#f9a825', sub: 'Báo cáo chờ duyệt', Icon: Clock },
    ];
    return <SafetyI18nRender>{(<div className="safety-reports-page space-y-6 max-w-7xl mx-auto pb-10">
      {/* Summary cards */}
      <div className="safety-reports-stat-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {reportStats.map(s => {
            const StatIcon = s.Icon;
            return (<div key={s.label} className="safety-reports-stat-card bg-card border border-border rounded-xl p-4 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: s.color }}/>
            <div className="safety-reports-stat-head">
              <div className="text-xs text-muted-foreground font-semibold mb-1">{s.label}</div>
              <span className="safety-reports-stat-icon" style={{ color: s.color, background: `${s.color}14` }}>
                <StatIcon className="h-4 w-4"/>
              </span>
            </div>
            <div className="text-4xl font-bold font-mono" style={{ color: s.color }}>{s.val}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.sub}</div>
          </div>);
        })}
      </div>

      <div className="safety-reports-command">
        <div className="safety-reports-command-main">
          <div className="safety-reports-eyebrow">
            <BarChart2 className="h-4 w-4"/>
            Trung tâm báo cáo Safety
          </div>
          <h2>Đọc nhanh xu hướng, hồ sơ và trạng thái phê duyệt theo kỳ</h2>
          <p>Biểu đồ ưu tiên dữ liệu API local từ sự cố, cảnh báo và KPI đã duyệt. Khi thiếu dữ liệu thật, hệ thống giữ fallback rõ nguồn để chart không bị trống.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={handleExportIplan}
              disabled={exportingIplan}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#7b1fa2]/30 bg-[#7b1fa2]/8 text-[#7b1fa2] text-xs font-semibold hover:bg-[#7b1fa2]/15 disabled:opacity-50 transition-colors"
            >
              {exportingIplan ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Download className="h-3.5 w-3.5"/>}
              Xuất kế hoạch KT (.csv)
            </button>
            <button
              onClick={handleExportMeeting}
              disabled={exportingMeeting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#00838f]/30 bg-[#00838f]/8 text-[#00838f] text-xs font-semibold hover:bg-[#00838f]/15 disabled:opacity-50 transition-colors"
            >
              {exportingMeeting ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Download className="h-3.5 w-3.5"/>}
              Xuất cuộc họp (.csv)
            </button>
          </div>
        </div>
        <div className="safety-reports-command-grid">
          <div className="safety-reports-command-card">
            <ShieldCheck className="h-5 w-5"/>
            <strong>{latestScore}%</strong>
            <span>Điểm AT mới nhất</span>
          </div>
          <div className="safety-reports-command-card">
            <Building2 className="h-5 w-5"/>
            <strong>{departmentCoverage}</strong>
            <span>Bộ phận có báo cáo</span>
          </div>
          <div className="safety-reports-command-card">
            <BarChart2 className="h-5 w-5"/>
            <strong>{chartSourceLabel}</strong>
            <span>Nguồn biểu đồ</span>
          </div>
        </div>
      </div>

      {/* Chart tabs */}
      <div className="safety-reports-chart-card bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 pt-4">
          <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-black ${chartSource === 'live' ? 'border-[#22a050]/25 bg-[#22a050]/8 text-[#16823f]' :
            chartSource === 'seeded' ? 'border-[#1565c0]/25 bg-[#1565c0]/8 text-[#1565c0]' :
                'border-slate-300 bg-slate-100 text-slate-600'}`}>
            {chartSource === 'live' ? 'DB live' : chartSource === 'seeded' ? 'DB + seed chart' : 'Fallback mẫu'}
          </span>
        </div>
        <div className="safety-reports-chart-head px-5 pt-5 pb-0 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-bold text-[15px]">Phân tích xu hướng - 2026</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Dữ liệu theo từng tháng</p>
          </div>
          <div aria-label="Phân tích xu hướng báo cáo" className="safety-reports-chart-tabs flex rounded-lg overflow-hidden border border-border text-xs" role="tablist">
            {[{ key: 'overview', label: 'Tổng quan' }, { key: 'incidents', label: 'Sự cố & Vi phạm' }, { key: 'checklist', label: 'Checklist & Đào tạo' }].map(tab => (<button aria-controls={`reports-chart-panel-${tab.key}`} aria-selected={activeChart === tab.key} className={`safety-reports-chart-tab px-3 py-1.5 font-semibold transition-all ${activeChart === tab.key ? 'active bg-[#1565c0] text-white' : 'hover:bg-muted'}`} id={`reports-chart-tab-${tab.key}`} key={tab.key} onClick={() => setActiveChart(tab.key as typeof activeChart)} role="tab" type="button">
                {tab.label}
              </button>))}
          </div>
        </div>
        <div className="p-5">
          {activeChart === 'overview' && (<div aria-labelledby="reports-chart-tab-overview" id="reports-chart-panel-overview" role="tabpanel">
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={monthlyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="safetyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22a050" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22a050" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10"/>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 600 }} tickLine={false} axisLine={false}/>
                  <YAxis yAxisId="left" domain={[60, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`}/>
                  <YAxis yAxisId="right" orientation="right" domain={[0, 20]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false}/>
                  <Tooltip content={<CustomTooltip />}/>
                  <Area yAxisId="left" type="monotone" dataKey="safetyScore" name="Điểm AT" stroke="#22a050" strokeWidth={2.5} fill="url(#safetyGrad)" dot={{ r: 4, fill: '#22a050' }}/>
                  <Bar yAxisId="right" dataKey="incidents" name="Sự cố" fill="#e53935" radius={[3, 3, 0, 0]} opacity={0.8}/>
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 8 }}/>
                </ComposedChart>
              </ResponsiveContainer>
            </div>)}
          {activeChart === 'incidents' && (<div aria-labelledby="reports-chart-tab-incidents" id="reports-chart-panel-incidents" role="tabpanel">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" vertical={false}/>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 600 }} tickLine={false} axisLine={false}/>
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}/>
                  <Tooltip content={<CustomTooltip />}/>
                  <Bar dataKey="violations" name="Vi phạm" fill="#f9a825" radius={[3, 3, 0, 0]}/>
                  <Bar dataKey="incidents" name="Sự cố" fill="#e53935" radius={[3, 3, 0, 0]}/>
                  <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 8 }}/>
                </BarChart>
              </ResponsiveContainer>
            </div>)}
          {activeChart === 'checklist' && (<div aria-labelledby="reports-chart-tab-checklist" id="reports-chart-panel-checklist" role="tabpanel">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={monthlyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="clGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1565c0" stopOpacity={0.3}/><stop offset="95%" stopColor="#1565c0" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="trGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00a99d" stopOpacity={0.3}/><stop offset="95%" stopColor="#00a99d" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10"/>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 600 }} tickLine={false} axisLine={false}/>
                  <YAxis domain={[60, 105]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`}/>
                  <Tooltip content={<CustomTooltip />}/>
                  <ReferenceLine y={100} stroke="#F5C400" strokeDasharray="4 3" strokeWidth={1.5}/>
                  <Area type="monotone" dataKey="checklist" name="Checklist" stroke="#1565c0" strokeWidth={2.5} fill="url(#clGrad)" dot={{ r: 4, fill: '#1565c0' }}/>
                  <Area type="monotone" dataKey="training" name="Đào tạo" stroke="#00a99d" strokeWidth={2.5} fill="url(#trGrad)" dot={{ r: 4, fill: '#00a99d' }}/>
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 8 }}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>)}
        </div>
      </div>

      {/* Dept filter grid */}
      <div className="safety-reports-dept-card bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="font-bold text-sm mb-3">Báo cáo theo bộ phận - nhấn để lọc</h3>
        <div className="safety-reports-dept-grid grid grid-cols-3 md:grid-cols-5 gap-2">
          <button aria-pressed={filterDept === 'Tất cả'} onClick={() => setFilterDept('Tất cả')} className={`safety-reports-dept-filter rounded-lg p-2.5 border text-left transition-all ${filterDept === 'Tất cả' ? 'active border-[#F5C400] bg-[#F5C400]/10' : 'border-border bg-muted/20 hover:border-[#F5C400]/50'}`} type="button">
            <div className="text-xs text-muted-foreground font-semibold">Tất cả</div>
            <div className="text-xl font-bold font-mono text-[#1565c0]">{loading ? '…' : reports.length}</div>
          </button>
          {DEPARTMENTS.map(d => {
            const count = reports.filter(r => r.department === d).length;
            if (count === 0)
                return null;
            return (<button aria-pressed={filterDept === d} key={d} onClick={() => setFilterDept(filterDept === d ? 'Tất cả' : d)} className={`safety-reports-dept-filter rounded-lg p-2.5 border text-left transition-all ${filterDept === d ? 'active border-[#F5C400] bg-[#F5C400]/10' : 'border-border hover:border-[#F5C400]/50'}`} type="button">
                <div className="text-xs text-muted-foreground font-semibold truncate">{d}</div>
                <div className="text-xl font-bold font-mono text-[#1565c0]">{count}</div>
              </button>);
        })}
        </div>
      </div>

      {/* Toolbar */}
      <div className="safety-reports-toolbar flex flex-wrap items-center justify-between gap-3">
        <div className="safety-reports-type-filters flex gap-2 flex-wrap">
          {['Tất cả', 'Tuần', 'Tháng', 'Quý'].map(t => (<button aria-pressed={filterType === t} key={t} onClick={() => setFilterType(t)} className={`safety-reports-filter-chip px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${filterType === t ? 'active bg-[#F5C400] text-[#0f2a15] border-[#F5C400]' : 'bg-card border-border hover:border-[#F5C400]'}`} type="button">
              {t}
            </button>))}
          {filterDept !== 'Tất cả' && (<span className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-[#1565c0] text-[#1565c0] bg-[#1565c0]/10 flex items-center gap-1">
              {filterDept}
              <button aria-label="Bỏ lọc bộ phận" onClick={() => setFilterDept('Tất cả')} className="ml-1 font-bold hover:text-[#e53935]" title="Bỏ lọc bộ phận" type="button">×</button>
            </span>)}
        </div>
        <button onClick={() => { setFormError(''); setShowForm(true); }} className="safety-reports-create-btn inline-flex items-center gap-2 px-4 py-2 bg-[#F5C400] text-[#0f2a15] rounded-lg font-bold text-sm hover:bg-[#e0b300] transition-all" type="button">
          <Plus className="h-4 w-4"/> Tạo báo cáo
        </button>
      </div>

      {/* Modal – Tạo báo cáo */}
      {showForm && (<div className="safety-create-modal-backdrop safety-reports-modal-backdrop fixed inset-0 z-[1400]" role="presentation">
          <div aria-describedby="report-create-description" aria-labelledby="report-create-title" aria-modal="true" className="safety-create-modal safety-create-modal-compact safety-reports-modal flex flex-col bg-card border border-border rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden shadow-2xl" role="dialog">

            {/* Header */}
            <div className="safety-create-modal-head safety-reports-modal-head bg-[#F5C400]/10 border-b border-[#F5C400]/30 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h3 id="report-create-title" className="font-bold text-lg text-[#c49b00] flex items-center gap-2">
                  <FileText className="w-5 h-5"/> Tạo báo cáo mới
                </h3>
                <p id="report-create-description" className="text-xs text-muted-foreground mt-0.5">Tạo báo cáo định kỳ an toàn lao động</p>
              </div>
              <button aria-label="Đóng" onClick={() => { setShowForm(false); setFormError(''); }} className="safety-reports-modal-close p-2 rounded-lg hover:bg-[#F5C400]/10 text-muted-foreground hover:text-[#c49b00] transition-colors" type="button">
                <X className="w-5 h-5"/>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="safety-create-modal-body safety-create-modal-form safety-reports-modal-form min-h-0 flex-1 overflow-y-auto p-6 space-y-6">

              {/* Block 1: Tên & Loại */}
              <div>
                <h4 className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-[#1565c0] text-white flex items-center justify-center text-[10px] font-bold">1</span>
                  Thông tin báo cáo
                </h4>
                <div className="space-y-3">
                  <SafetyLocalizedTextField
                    ariaLabel="Tên báo cáo"
                    inputClassName="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[#F5C400]/40 focus:border-[#F5C400]"
                    label="Tên báo cáo"
                    onChange={value => setForm(p => ({ ...p, titleI18n: value, title: safetyLocalizedVi(value) }))}
                    placeholder="VD: Báo cáo ATVSLD tháng 6/2026 - Bộ phận Sản xuất A"
                    required
                    value={form.titleI18n}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5" htmlFor="safety-report-period">
                        <BarChart2 className="w-3.5 h-3.5"/> Loại báo cáo
                      </label>
                      <div className="flex gap-2">
                        {(['Tuần', 'Tháng', 'Quý'] as RType[]).map(t => (<button aria-pressed={form.type === t} key={t} type="button" onClick={() => setForm(p => ({ ...p, type: t }))} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${form.type === t ? 'bg-[#F5C400] text-[#0f2a15] border-[#F5C400]' : 'border-border hover:border-[#F5C400]/60 hover:bg-[#F5C400]/5'}`}>
                            {t}
                          </button>))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5"/> Kỳ báo cáo
                      </label>
                      <input id="safety-report-period" value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[#F5C400]/40" placeholder={form.type === 'Tuần' ? 'VD: Tuần 23/2026' : form.type === 'Tháng' ? 'VD: Tháng 6/2026' : 'VD: Q2/2026'}/>
                    </div>
                  </div>
                  <SafetyLocalizedTextField
                    ariaLabel="Ghi chú báo cáo"
                    inputClassName="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[#F5C400]/40 resize-none"
                    label="Ghi chú"
                    onChange={value => setForm(p => ({ ...p, notesI18n: value, notes: safetyLocalizedVi(value) }))}
                    placeholder="Tóm tắt phạm vi, dữ liệu nguồn hoặc điểm cần theo dõi..."
                    rows={3}
                    textarea
                    value={form.notesI18n}
                  />
                </div>
              </div>

              {/* Block 2: Bộ phận & Người lập */}
              <div>
                <h4 className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-[#22a050] text-white flex items-center justify-center text-[10px] font-bold">2</span>
                  Phụ trách & bộ phận
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5" htmlFor="safety-report-department">
                      <Building2 className="w-3.5 h-3.5"/> Bộ phận
                    </label>
                    <select id="safety-report-department" value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[#22a050]/30">
                      {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5" htmlFor="safety-report-creator">
                      <User className="w-3.5 h-3.5"/> Người lập báo cáo
                    </label>
                    <input id="safety-report-creator" value={form.creator} onChange={e => setForm(p => ({ ...p, creator: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[#22a050]/30" placeholder="Họ và tên..."/>
                  </div>
                </div>
              </div>

              {formError && (<div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>
                  <span>{formError}</span>
                </div>)}

              {/* Footer */}
              <div className="flex gap-3 pt-2 border-t border-border">
                <button type="submit" disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 py-2.5 bg-[#F5C400] text-[#0f2a15] rounded-lg font-bold text-sm hover:bg-[#e0b300] disabled:opacity-60 transition-all">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>}
                  {saving ? 'Đang lưu…' : 'Tạo báo cáo'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setFormError(''); }} className="px-6 py-2.5 border border-border rounded-lg font-semibold text-sm hover:bg-muted transition-all">
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>)}

      {/* Modal – Xác nhận xoá báo cáo */}
      {deleteTarget && (<div className="safety-reports-delete-backdrop safety-modal-backdrop fixed inset-0 z-[1400] flex items-center justify-center p-4" role="presentation">
          <div aria-labelledby="report-delete-title" aria-modal="true" className="safety-reports-delete-modal w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" role="dialog">
            <div className="h-1 bg-gradient-to-r from-[#f9a825] via-[#e53935] to-[#b91c1c]"/>
            <div className="p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e53935]/10 text-[#e53935]">
                  <Trash2 className="h-5 w-5"/>
                </span>
                <div className="min-w-0">
                  <h3 id="report-delete-title" className="text-base font-bold text-foreground">
                    Xoá báo cáo?
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Báo cáo sẽ bị xoá khỏi danh sách Safety - 6S hiện tại.
                  </p>
                </div>
                <button aria-label="Đóng" className="safety-reports-delete-close ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" disabled={deleting} onClick={() => setDeleteTarget(null)} type="button">
                  <X className="h-4 w-4"/>
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-[#e53935]/20 bg-[#e53935]/5 p-3">
                <div className="font-mono text-xs font-bold text-[#e53935]">{deleteTarget.code}</div>
                <div className="mt-1 text-sm font-bold leading-snug text-foreground">{reportTitle(deleteTarget)}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-md bg-background px-2 py-1">{deleteTarget.type}</span>
                  <span className="rounded-md bg-background px-2 py-1">{deleteTarget.period || 'Chưa có kỳ'}</span>
                  <span className="rounded-md bg-background px-2 py-1">{deleteTarget.department}</span>
                  <span className="rounded-md bg-background px-2 py-1">{deleteTarget.creator || 'Chưa có người lập'}</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60" disabled={deleting} onClick={() => setDeleteTarget(null)} type="button">
                  Hủy
                </button>
                <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#e53935] px-4 text-sm font-bold text-white shadow-sm shadow-[#e53935]/20 transition-colors hover:bg-[#c62828] disabled:opacity-60" disabled={deleting} onClick={() => handleDelete(deleteTarget.id)} type="button">
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4"/>}
                  {deleting ? 'Đang xoá...' : 'Xoá báo cáo'}
                </button>
              </div>
            </div>
          </div>
        </div>)}

      {/* Table */}
      <div className="safety-reports-table-card bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {loading ? (<div className="py-16 text-center text-muted-foreground text-sm">Đang tải danh sách báo cáo…</div>) : (<>
          {filtered.length === 0 ? (<div className="p-10 text-center text-sm text-muted-foreground sm:hidden">
              {reports.length === 0 ? 'Chưa có báo cáo nào. Nhấn "+ Tạo báo cáo" để bắt đầu.' : 'Không có báo cáo phù hợp bộ lọc.'}
            </div>) : (<div className="safety-reports-mobile-list space-y-3 p-3 sm:hidden">
              {pagedReports.map(r => (<article key={r.id} className="safety-reports-mobile-card rounded-lg border border-border bg-background p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] font-bold text-[#1565c0]">{r.code}</div>
                      <h3 className="mt-1 text-sm font-bold leading-snug text-foreground">{reportTitle(r)}</h3>
                    </div>
                    <span className="shrink-0 rounded-md px-2 py-1 text-[11px] font-bold" style={{ color: typeColor[r.type], background: `${typeColor[r.type]}18` }}>
                      {r.type}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-muted/30 px-2 py-1.5">
                      <div className="text-[10px] font-semibold text-muted-foreground">Kỳ</div>
                      <div className="font-mono font-bold">{r.period}</div>
                    </div>
                    <div className="rounded-md bg-muted/30 px-2 py-1.5">
                      <div className="text-[10px] font-semibold text-muted-foreground">Bộ phận</div>
                      <div className="font-bold">{r.department}</div>
                    </div>
                    <div className="rounded-md bg-muted/30 px-2 py-1.5">
                      <div className="text-[10px] font-semibold text-muted-foreground">Người lập</div>
                      <div className="font-semibold">{r.creator}</div>
                    </div>
                    <div className="rounded-md bg-muted/30 px-2 py-1.5">
                      <div className="text-[10px] font-semibold text-muted-foreground">Ngày tạo</div>
                      <div className="font-mono font-semibold">{r.date}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <select aria-label={`Cập nhật trạng thái báo cáo ${r.code}`} value={r.status} onChange={e => handleUpdateStatus(r.id, e.target.value)} className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs font-bold outline-none" style={{ color: stColor[r.status], background: `${stColor[r.status]}18` }}>
                      <option value="Nháp">Nháp</option>
                      <option value="PENDING">Chờ duyệt</option>
                      <option value="APPROVED">Đã duyệt</option>
                    </select>
                    <button aria-label={`In báo cáo ${r.code}`} onClick={() => handlePrint(r)} title="In báo cáo" className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#1565c0]/20 bg-[#1565c0]/10 px-2 py-1.5 text-xs font-bold text-[#1565c0] transition-colors hover:bg-[#1565c0]/20">
                      <Printer className="h-3.5 w-3.5"/> In
                    </button>
                    <button aria-label={`Xoá báo cáo ${r.code}`} onClick={() => setDeleteTarget(r)} title="Xoá" className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-[#e53935]">
                      <Trash2 className="h-3.5 w-3.5"/> Xoá
                    </button>
                  </div>
                </article>))}
            </div>)}
          <div className="safety-reports-table-wrap hidden overflow-x-auto sm:block">
            <table className="safety-reports-table w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {['Mã BC', 'Tên báo cáo', 'Loại', 'Kỳ', 'Bộ phận', 'Người lập', 'Ngày tạo', 'Trạng thái', 'In PDF', ''].map(h => (<th key={h} className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>))}
                </tr>
              </thead>
              <tbody>
                {pagedReports.map(r => (<tr key={r.id} className="safety-reports-row border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-xs text-[#1565c0]">{r.code}</td>
                    <td className="safety-report-title-cell px-4 py-3 font-medium">{reportTitle(r)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ color: typeColor[r.type], background: `${typeColor[r.type]}18` }}>{r.type}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{r.period}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.department}</td>
                    <td className="px-4 py-3">{r.creator}</td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{r.date}</td>
                    <td className="px-4 py-3">
                      <select aria-label={`Cập nhật trạng thái báo cáo ${r.code}`} value={r.status} onChange={e => handleUpdateStatus(r.id, e.target.value)} className="text-xs font-bold rounded px-2 py-0.5 border-none outline-none cursor-pointer" style={{ color: stColor[r.status], background: `${stColor[r.status]}18` }}>
                        <option value="Nháp">Nháp</option>
                        <option value="PENDING">Chờ duyệt</option>
                        <option value="APPROVED">Đã duyệt</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button aria-label={`In báo cáo ${r.code}`} onClick={() => handlePrint(r)} title="In báo cáo" className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-bold bg-[#1565c0]/10 text-[#1565c0] border border-[#1565c0]/20 rounded hover:bg-[#1565c0]/20 transition-colors">
                        <Printer className="h-3.5 w-3.5"/> In
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button aria-label={`Xoá báo cáo ${r.code}`} onClick={() => setDeleteTarget(r)} title="Xoá" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-[#e53935] transition-colors">
                        <Trash2 className="h-3.5 w-3.5"/> Xoá
                      </button>
                    </td>
                  </tr>))}
                {filtered.length === 0 && (<tr><td colSpan={10} className="text-center py-10 text-muted-foreground text-sm">
                    {reports.length === 0 ? 'Chưa có báo cáo nào. Nhấn "+ Tạo báo cáo" để bắt đầu.' : 'Không có báo cáo phù hợp bộ lọc.'}
                  </td></tr>)}
              </tbody>
            </table>
          </div>
            {filtered.length > 0 && (<div className="safety-reports-pagination flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/10 px-4 py-3">
                <span className="text-xs font-semibold text-muted-foreground">
                  Hiển thị {displayStart}-{displayEnd} / {filtered.length} báo cáo
                </span>
                <div className="flex items-center gap-2">
                  <button aria-label="Trang báo cáo trước" className="safety-reports-page-btn inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40" disabled={currentReportPage <= 1} onClick={() => setReportPage(page => Math.max(1, page - 1))} type="button">
                    <ChevronLeft className="h-4 w-4"/>
                  </button>
                  <span className="min-w-20 text-center text-xs font-bold text-foreground">
                    Trang {currentReportPage}/{totalReportPages}
                  </span>
                  <button aria-label="Trang báo cáo sau" className="safety-reports-page-btn inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40" disabled={currentReportPage >= totalReportPages} onClick={() => setReportPage(page => Math.min(totalReportPages, page + 1))} type="button">
                    <ChevronRight className="h-4 w-4"/>
                  </button>
                </div>
              </div>)}
          </>)}
      </div>
    </div>)}</SafetyI18nRender>;
}
