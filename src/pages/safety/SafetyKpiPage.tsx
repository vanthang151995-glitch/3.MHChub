import React, { useState, useEffect } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Building2, CheckCircle2, ChevronLeft, ChevronRight, Circle, Database, Factory, GraduationCap, ShieldCheck, Target, TrendingUp, XCircle, } from 'lucide-react';
import "./safety-kpi.css";
import { ALL_DEPARTMENTS, DEPT_BY_NAME, DIVISIONS, sampleArray } from './safety-sample-adapter';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, ReferenceLine, } from 'recharts';
import { SafetyI18nRender } from "./safety-i18n-render";
// ─── Types ───────────────────────────────────────────────────────────────────
interface KpiEntry {
    id: string;
    entryType: string;
    period: string;
    departmentCode: string;
    divisionCode: string;
    value: string;
    target: string | null;
    unit: string | null;
    approvalStatus: string;
    submittedByName?: string;
    createdByName?: string;
}
interface KPIRow {
    department: string;
    short: string;
    safetyScore: number;
    incidentCount: number;
    checklistPct: number;
    trainingPct: number;
    noDays: number;
    target: number;
    hasRealData: boolean;
}
type ChartPayloadItem = {
    color?: string;
    dataKey?: string;
    fill?: string;
    name?: React.ReactNode;
    value?: React.ReactNode;
};
type ChartTooltipProps = {
    active?: boolean;
    label?: React.ReactNode;
    payload?: ChartPayloadItem[];
};
// ─── Mock fallback data ───────────────────────────────────────────────────────
const MOCK_KPIS: KPIRow[] = [
    { department: 'PE1', short: 'PE1', safetyScore: 88, incidentCount: 1, checklistPct: 85, trainingPct: 92, noDays: 74, target: 90, hasRealData: false },
    { department: 'MP', short: 'MP', safetyScore: 82, incidentCount: 0, checklistPct: 80, trainingPct: 87, noDays: 110, target: 85, hasRealData: false },
    { department: 'MT', short: 'MT', safetyScore: 76, incidentCount: 2, checklistPct: 70, trainingPct: 78, noDays: 45, target: 85, hasRealData: false },
    { department: 'CM', short: 'CM', safetyScore: 91, incidentCount: 0, checklistPct: 90, trainingPct: 95, noDays: 148, target: 90, hasRealData: false },
    { department: 'WM', short: 'WM', safetyScore: 84, incidentCount: 0, checklistPct: 82, trainingPct: 88, noDays: 96, target: 85, hasRealData: false },
    { department: 'QA', short: 'QA', safetyScore: 94, incidentCount: 0, checklistPct: 93, trainingPct: 100, noDays: 180, target: 92, hasRealData: false },
    { department: 'GA', short: 'GA', safetyScore: 90, incidentCount: 0, checklistPct: 88, trainingPct: 95, noDays: 148, target: 90, hasRealData: false },
    { department: 'QC', short: 'QC', safetyScore: 87, incidentCount: 0, checklistPct: 86, trainingPct: 90, noDays: 120, target: 88, hasRealData: false },
    { department: 'CS', short: 'CS', safetyScore: 92, incidentCount: 0, checklistPct: 91, trainingPct: 98, noDays: 155, target: 90, hasRealData: false },
    { department: 'EHS', short: 'EHS', safetyScore: 98, incidentCount: 0, checklistPct: 99, trainingPct: 100, noDays: 240, target: 95, hasRealData: false },
    { department: 'OS', short: 'OS', safetyScore: 86, incidentCount: 0, checklistPct: 84, trainingPct: 90, noDays: 130, target: 85, hasRealData: false },
    { department: 'MR', short: 'MR', safetyScore: 79, incidentCount: 1, checklistPct: 75, trainingPct: 82, noDays: 60, target: 85, hasRealData: false },
    { department: 'RF', short: 'RF', safetyScore: 83, incidentCount: 0, checklistPct: 81, trainingPct: 86, noDays: 105, target: 85, hasRealData: false },
    { department: 'DB', short: 'DB', safetyScore: 71, incidentCount: 2, checklistPct: 68, trainingPct: 75, noDays: 30, target: 85, hasRealData: false },
    { department: 'DP1', short: 'DP1', safetyScore: 85, incidentCount: 0, checklistPct: 84, trainingPct: 88, noDays: 115, target: 85, hasRealData: false },
    { department: 'DP2', short: 'DP2', safetyScore: 88, incidentCount: 0, checklistPct: 87, trainingPct: 90, noDays: 130, target: 85, hasRealData: false },
    { department: 'OK1', short: 'OK1', safetyScore: 93, incidentCount: 0, checklistPct: 92, trainingPct: 97, noDays: 165, target: 90, hasRealData: false },
    { department: 'OK2', short: 'OK2', safetyScore: 89, incidentCount: 0, checklistPct: 88, trainingPct: 93, noDays: 140, target: 90, hasRealData: false },
    { department: 'SP1', short: 'SP1', safetyScore: 85, incidentCount: 1, checklistPct: 83, trainingPct: 88, noDays: 88, target: 88, hasRealData: false },
    { department: 'EBM', short: 'EBM', safetyScore: 90, incidentCount: 0, checklistPct: 89, trainingPct: 95, noDays: 148, target: 90, hasRealData: false },
    { department: 'ETR', short: 'ETR', safetyScore: 95, incidentCount: 0, checklistPct: 94, trainingPct: 100, noDays: 200, target: 92, hasRealData: false },
    { department: 'MS1', short: 'MS1', safetyScore: 88, incidentCount: 0, checklistPct: 86, trainingPct: 90, noDays: 135, target: 88, hasRealData: false },
    { department: 'SA', short: 'SA', safetyScore: 92, incidentCount: 0, checklistPct: 91, trainingPct: 95, noDays: 155, target: 90, hasRealData: false },
    { department: 'MS2', short: 'MS2', safetyScore: 87, incidentCount: 1, checklistPct: 84, trainingPct: 88, noDays: 95, target: 88, hasRealData: false },
];
const MOCK_MONTHLY_TREND = [
    { month: 'T1', score: 85, target: 88 },
    { month: 'T2', score: 87, target: 88 },
    { month: 'T3', score: 88, target: 90 },
    { month: 'T4', score: 91, target: 90 },
    { month: 'T5', score: 93, target: 92 },
    { month: 'T6', score: 96, target: 95 },
];
// ─── Data aggregation from KPI entries ───────────────────────────────────────
function aggregateEntries(entries: KpiEntry[]): KPIRow[] {
    // Group approved entries by dept + entryType, keep latest per group
    const byDeptType = new Map<string, KpiEntry>();
    for (const e of entries) {
        if (e.approvalStatus !== 'approved')
            continue;
        const key = `${e.departmentCode}__${e.entryType}`;
        const existing = byDeptType.get(key);
        if (!existing || e.period > existing.period) {
            byDeptType.set(key, e);
        }
    }
    // Merge real data onto mock base rows
    const result = MOCK_KPIS.map(mock => {
        const row: KPIRow = { ...mock };
        let hasReal = false;
        const safety = byDeptType.get(`${mock.department}__safety_score_monthly`);
        const noDays = byDeptType.get(`${mock.department}__no_accident_days`);
        const check = byDeptType.get(`${mock.department}__checklist_daily`);
        const train = byDeptType.get(`${mock.department}__training_monthly`);
        const violWarn = byDeptType.get(`${mock.department}__violation_warning`);
        if (safety) {
            row.safetyScore = parseFloat(safety.value);
            row.target = safety.target ? parseFloat(safety.target) : mock.target;
            hasReal = true;
        }
        if (noDays) {
            row.noDays = parseFloat(noDays.value);
            hasReal = true;
        }
        if (check) {
            row.checklistPct = parseFloat(check.value);
            hasReal = true;
        }
        if (train) {
            row.trainingPct = parseFloat(train.value);
            hasReal = true;
        }
        if (violWarn) {
            row.incidentCount = parseFloat(violWarn.value);
            hasReal = true;
        }
        row.hasRealData = hasReal;
        return row;
    });
    return result;
}
function buildMonthlyTrend(entries: KpiEntry[]): {
    month: string;
    score: number;
    target: number;
    fromDB: boolean;
}[] {
    const approved = entries.filter(e => e.approvalStatus === 'approved' && e.entryType === 'safety_score_monthly');
    if (approved.length === 0) {
        return MOCK_MONTHLY_TREND.map(m => ({ ...m, fromDB: false }));
    }
    // Group by month, average across departments
    const byMonth = new Map<string, {
        sum: number;
        count: number;
        target: number;
    }>();
    for (const e of approved) {
        const month = e.period; // YYYY-MM
        const cur = byMonth.get(month) ?? { sum: 0, count: 0, target: 90 };
        cur.sum += parseFloat(e.value);
        cur.count += 1;
        if (e.target)
            cur.target = parseFloat(e.target);
        byMonth.set(month, cur);
    }
    const months = Array.from(byMonth.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-6);
    return months.map(([period, v]) => {
        const [, mm] = period.split('-');
        return { month: `T${parseInt(mm, 10)}`, score: Math.round(v.sum / v.count), target: v.target, fromDB: true };
    });
}
// ─── Custom tooltip ───────────────────────────────────────────────────────────
const CustomBar = ({ active, payload, label }: ChartTooltipProps) => {
    if (!active || !payload?.length)
        return null;
    return (<div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl text-xs min-w-[140px]">
      <p className="font-bold mb-1.5 text-sm">{label}</p>
      {payload.map((p) => (<p key={p.dataKey} style={{ color: p.fill || p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span><strong>{p.value}{p.dataKey === 'incidentCount' ? '' : '%'}</strong>
        </p>))}
    </div>);
};
type SortKey = 'safetyScore' | 'incidentCount' | 'checklistPct' | 'trainingPct' | 'noDays';
const KPI_PAGE_SIZE = 12;
// ─── Component ───────────────────────────────────────────────────────────────
export function SafetyKpiPage() {
    const [sortKey, setSortKey] = useState<SortKey>('safetyScore');
    const [sortAsc, setSortAsc] = useState(false);
    const [selectedDept, setSelectedDept] = useState<string | null>(null);
    const [divisionFilter, setDivisionFilter] = useState<string | null>(null);
    const [kpis, setKpis] = useState<KPIRow[]>(MOCK_KPIS);
    const [trend, setTrend] = useState(MOCK_MONTHLY_TREND.map(m => ({ ...m, fromDB: false })));
    const [dataSource, setDataSource] = useState<'mock' | 'live' | 'mixed' | 'seeded'>('mock');
    const [hasChartSeed, setHasChartSeed] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [kpiPage, setKpiPage] = useState(1);
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/kpi-entries?approvalStatus=approved');
                if (!res.ok)
                    throw new Error('API error');
                const entries = sampleArray<KpiEntry>(await res.json());
                const merged = aggregateEntries(entries);
                const hasAny = merged.some(r => r.hasRealData);
                const hasSeed = entries.some(e => /^(CHART-|MOCK-)/i.test(e.id) ||
                    /seed|mock/i.test(`${e.submittedByName || ''} ${e.createdByName || ''}`));
                setKpis(merged);
                setTrend(buildMonthlyTrend(entries));
                setHasChartSeed(hasSeed);
                setDataSource(hasAny ? (merged.every(r => r.hasRealData) ? 'live' : 'mixed') : 'mock');
            }
            catch {
                setHasChartSeed(false);
                setLoadError(true);
            }
        })();
    }, []);
    const filtered = divisionFilter
        ? kpis.filter(k => DEPT_BY_NAME.get(k.department)?.divisionCode === divisionFilter)
        : kpis;
    const sorted = [...filtered].sort((a, b) => {
        const va = a[sortKey] as number, vb = b[sortKey] as number;
        return sortAsc ? va - vb : vb - va;
    });
    useEffect(() => {
        setKpiPage(1);
    }, [divisionFilter, sortKey, sortAsc, kpis.length]);
    const totalKpiPages = Math.max(1, Math.ceil(sorted.length / KPI_PAGE_SIZE));
    const currentKpiPage = Math.min(kpiPage, totalKpiPages);
    const kpiStartIndex = (currentKpiPage - 1) * KPI_PAGE_SIZE;
    const pagedSorted = sorted.slice(kpiStartIndex, kpiStartIndex + KPI_PAGE_SIZE);
    const kpiDisplayStart = sorted.length === 0 ? 0 : kpiStartIndex + 1;
    const kpiDisplayEnd = Math.min(kpiStartIndex + KPI_PAGE_SIZE, sorted.length);
    function handleSort(key: SortKey) {
        if (sortKey === key)
            setSortAsc(a => !a);
        else {
            setSortKey(key);
            setSortAsc(false);
        }
    }
    function toggleDept(dept: string) {
        setSelectedDept(d => d === dept ? null : dept);
    }
    function handleDeptKeyDown(event: React.KeyboardEvent<HTMLElement>, dept: string) {
        if (event.key !== 'Enter' && event.key !== ' ')
            return;
        event.preventDefault();
        toggleDept(dept);
    }
    const avg = Math.round(filtered.reduce((s, k) => s + k.safetyScore, 0) / (filtered.length || 1));
    const avgColor = avg >= 90 ? '#22a050' : '#f9a825';
    const activeDivision = DIVISIONS.find(d => d.code === divisionFilter);
    const deptCount = filtered.length;
    const realCount = filtered.filter(k => k.hasRealData).length;
    const metCount = filtered.filter(k => k.safetyScore >= k.target).length;
    const nearCount = filtered.filter(k => k.safetyScore < k.target && k.safetyScore >= k.target - 5).length;
    const riskRows = filtered.filter(k => k.safetyScore < k.target - 5);
    const incidentTotal = filtered.reduce((s, k) => s + k.incidentCount, 0);
    const checklistAvg = Math.round(filtered.reduce((s, k) => s + k.checklistPct, 0) / (deptCount || 1));
    const trainingAvg = Math.round(filtered.reduce((s, k) => s + k.trainingPct, 0) / (deptCount || 1));
    const bestKpi = [...filtered].sort((a, b) => b.safetyScore - a.safetyScore)[0];
    const lowestKpi = [...filtered].sort((a, b) => a.safetyScore - b.safetyScore)[0];
    const dataQualityTone = dataSource === 'live' ? '#22a050' : dataSource === 'mixed' ? '#f9a825' : dataSource === 'seeded' ? '#1565c0' : '#64748b';
    const dataQualityLabel = dataSource === 'live'
        ? 'Dữ liệu đã duyệt'
        : dataSource === 'mixed'
            ? 'Thật + ước tính'
            : dataSource === 'seeded'
                ? 'DB + seed chart'
                : 'Đang dùng ước tính';
    const insightCards = [
        { key: 'quality', label: 'Nguồn dữ liệu', value: `${realCount}/${deptCount}`, helper: dataQualityLabel, tone: dataQualityTone, icon: Database },
        { key: 'target', label: 'Đạt mục tiêu', value: `${metCount}/${deptCount}`, helper: `${nearCount} bộ phận sắp đạt`, tone: '#22a050', icon: Target },
        { key: 'risk', label: 'Cần theo dõi', value: riskRows.length, helper: lowestKpi ? `Thấp nhất: ${lowestKpi.short} ${lowestKpi.safetyScore}%` : 'Không có bộ phận rủi ro', tone: riskRows.length ? '#e53935' : '#22a050', icon: AlertTriangle },
        { key: 'training', label: 'Checklist / đào tạo', value: `${checklistAvg}% / ${trainingAvg}%`, helper: bestKpi ? `Tốt nhất: ${bestKpi.short} ${bestKpi.safetyScore}%` : 'Chưa có dữ liệu', tone: '#1565c0', icon: GraduationCap },
    ];
    const barData = filtered.map(k => ({
        name: k.short,
        dept: k.department,
        'Thực tế': k.safetyScore,
        'Mục tiêu': k.target,
        color: k.safetyScore >= k.target ? '#22a050' : k.safetyScore >= 80 ? '#f9a825' : '#e53935',
    }));
    return <SafetyI18nRender>{(<div className="safety-kpi-page space-y-6 max-w-7xl mx-auto pb-10">

      {/* Data source indicator */}
      <div className={`safety-kpi-source-pill flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg border ${dataSource === 'live' ? 'bg-[#22a050]/10 border-[#22a050]/30 text-[#22a050]' :
            dataSource === 'seeded' ? 'bg-[#1565c0]/10 border-[#1565c0]/30 text-[#1565c0]' :
                dataSource === 'mixed' ? 'bg-[#f9a825]/10 border-[#f9a825]/30 text-[#f9a825]' :
                    'bg-muted/40 border-border text-muted-foreground'}`}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dataSource === 'live' ? '#22a050' : dataSource === 'seeded' ? '#1565c0' : dataSource === 'mixed' ? '#f9a825' : '#94a3b8' }}/>
        <span>
          {dataSource === 'live' ? 'Dữ liệu thực từ database (tất cả đã duyệt)' :
            dataSource === 'mixed' ? 'Kết hợp: dữ liệu thực + ước tính (một số BP chưa có entry được duyệt)' :
                'Dữ liệu ước tính – chưa có KPI nào được phê duyệt trong database'}
        </span>
        {hasChartSeed && (<span className="inline-flex items-center rounded-md border border-[#1565c0]/25 bg-[#1565c0]/8 px-2 py-0.5 text-[11px] font-black text-[#1565c0]">
            DB + seed chart
          </span>)}
        {loadError && (<span className="inline-flex items-center gap-1 text-[#e53935] ml-2">
            <AlertTriangle className="h-3.5 w-3.5"/> Lỗi kết nối API
          </span>)}
      </div>

      <div className="safety-kpi-command">
        <div className="safety-kpi-command-copy">
          <span>KPI vận hành</span>
          <strong>{divisionFilter ? activeDivision?.name : 'Toàn công ty'} · {avg}%</strong>
          <p>
            Theo dõi điểm an toàn, checklist, đào tạo và số sự cố theo bộ phận.
            {incidentTotal > 0 ? ` Hiện có ${incidentTotal} sự cố trong phạm vi lọc.` : ' Chưa ghi nhận sự cố trong phạm vi lọc.'}
          </p>
        </div>
        <div className="safety-kpi-command-cards">
          {insightCards.map(card => {
            const Icon = card.icon;
            return (<div className="safety-kpi-command-card" key={card.key} style={{ borderTopColor: card.tone }}>
                <span className="safety-kpi-command-icon" style={{ color: card.tone, background: `${card.tone}12`, borderColor: `${card.tone}28` }}>
                  <Icon className="h-4 w-4"/>
                </span>
                <div>
                  <small>{card.label}</small>
                  <strong style={{ color: card.tone }}>{card.value}</strong>
                  <em>{card.helper}</em>
                </div>
              </div>);
        })}
        </div>
      </div>

      {/* Division filter tabs */}
      <div className="safety-kpi-filter-panel bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="safety-kpi-filter-head flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#1565c0]"/> Lọc theo khối
          </h3>
          {divisionFilter && (<span className="text-xs text-muted-foreground">Đang xem: <strong style={{ color: activeDivision?.color }}>{activeDivision?.name}</strong></span>)}
        </div>
        <div className="safety-kpi-filter-tabs flex flex-wrap gap-2" role="group" aria-label="Lọc KPI theo khối">
          <button type="button" aria-pressed={!divisionFilter} onClick={() => { setDivisionFilter(null); setSelectedDept(null); }} className={`safety-kpi-filter-tab inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${!divisionFilter ? 'active bg-foreground text-background' : 'border border-border hover:bg-muted'}`}>
            <Factory className="h-3.5 w-3.5"/> Toàn công ty ({kpis.length} BP)
          </button>
          {DIVISIONS.map(div => (<button key={div.code} type="button" aria-pressed={divisionFilter === div.code} onClick={() => { setDivisionFilter(div.code); setSelectedDept(null); }} className={`safety-kpi-filter-tab px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${divisionFilter === div.code ? 'active text-white' : 'border border-border hover:bg-muted'}`} style={divisionFilter === div.code ? { backgroundColor: div.color } : {}}>
              [{div.code}] {div.name} ({div.departments.length} BP)
            </button>))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="safety-kpi-stat-grid grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
            { label: divisionFilter ? `Điểm TB – ${activeDivision?.name}` : 'Điểm TB toàn công ty', val: `${avg}%`, color: avgColor, sub: 'Tháng hiện tại', icon: ShieldCheck },
            { label: 'Đạt mục tiêu', val: `${filtered.filter(k => k.safetyScore >= k.target).length}/${deptCount}`, color: '#22a050', sub: 'Bộ phận', icon: Target },
            { label: 'Tổng sự cố', val: `${filtered.reduce((s, k) => s + k.incidentCount, 0)}`, color: '#e53935', sub: 'Sự cố ghi nhận', icon: AlertTriangle },
            { label: 'Đào tạo TB', val: `${Math.round(filtered.reduce((s, k) => s + k.trainingPct, 0) / (deptCount || 1))}%`, color: '#1565c0', sub: 'Hoàn thành khóa', icon: GraduationCap },
        ].map(s => {
            const Icon = s.icon;
            return (<div key={s.label} className="safety-kpi-stat-card bg-card border border-border rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: s.color }}/>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground font-semibold mb-1">{s.label}</div>
                  <div className="text-4xl font-bold font-mono" style={{ color: s.color }}>{s.val}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.sub}</div>
                </div>
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ color: s.color, backgroundColor: `${s.color}14` }}>
                  <Icon className="h-5 w-5"/>
                </span>
              </div>
            </div>);
        })}
      </div>

      {/* Bar chart */}
      <div className="safety-kpi-chart-card safety-kpi-main-chart bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="safety-kpi-chart-title font-bold text-[15px] mb-1 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[#1565c0]"/> Điểm an toàn & mục tiêu
          {activeDivision
            ? <span className="text-sm font-normal text-muted-foreground">– {activeDivision.name} ({deptCount} bộ phận)</span>
            : <span className="text-sm font-normal text-muted-foreground">- {kpis.length} bộ phận</span>}
        </h3>
        <p className="safety-kpi-chart-note text-xs text-muted-foreground mb-4">Xanh = đạt mục tiêu · Vàng = sắp đạt · Đỏ = chưa đạt</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" vertical={false}/>
            <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 600 }} tickLine={false} axisLine={false}/>
            <YAxis domain={[60, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`}/>
            <Tooltip content={<CustomBar />}/>
            <ReferenceLine y={90} stroke="#F5C400" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: 'Mục tiêu', position: 'insideTopRight', fontSize: 10, fill: '#F5C400' }}/>
            <Bar dataKey="Thực tế" name="Điểm AT" radius={[3, 3, 0, 0]}>
              {barData.map((_, i) => {
            const row = filtered[i];
            const c = row.safetyScore >= row.target ? '#22a050' : row.safetyScore >= 80 ? '#f9a825' : '#e53935';
            return <Cell key={i} fill={c}/>;
        })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Trend + Checklist vs Training */}
      <div className="safety-kpi-chart-grid grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="safety-kpi-chart-card bg-card border border-border rounded-xl p-5 shadow-sm">
          <h3 className="safety-kpi-chart-title font-bold text-[15px] mb-1 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#22a050]"/> Xu hướng điểm an toàn
            {trend.some(t => t.fromDB) && <span className="text-xs font-normal text-[#22a050]">· Từ DB</span>}
          </h3>
          <p className="safety-kpi-chart-note text-xs text-muted-foreground mb-4">Điểm trung bình toàn công ty vs mục tiêu</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10"/>
              <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 600 }} tickLine={false} axisLine={false}/>
              <YAxis domain={[80, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`}/>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [`${v}%`]}/>
              <Line type="monotone" dataKey="score" name="Thực tế" stroke="#22a050" strokeWidth={2.5} dot={{ r: 5, fill: '#22a050', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 7 }}/>
              <Line type="monotone" dataKey="target" name="Mục tiêu" stroke="#F5C400" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4, fill: '#F5C400', strokeWidth: 2, stroke: '#fff' }}/>
              <Legend iconType="line" iconSize={16} wrapperStyle={{ fontSize: 12, paddingTop: 8 }}/>
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="safety-kpi-chart-card bg-card border border-border rounded-xl p-5 shadow-sm">
          <h3 className="safety-kpi-chart-title font-bold text-[15px] mb-1 flex items-center gap-2">
            <Target className="h-4 w-4 text-[#f9a825]"/> Checklist vs đào tạo - Top 8
          </h3>
          <p className="safety-kpi-chart-note text-xs text-muted-foreground mb-4">So sánh hoàn thành checklist và đào tạo (%)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={[...filtered].sort((a, b) => b.safetyScore - a.safetyScore).slice(0, 8).map(k => ({
            name: k.short,
            'Checklist': k.checklistPct,
            'Đào tạo': k.trainingPct,
        }))} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" vertical={false}/>
              <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 600 }} tickLine={false} axisLine={false}/>
              <YAxis domain={[60, 105]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`}/>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [`${v}%`]}/>
              <Bar dataKey="Checklist" fill="#1565c0" radius={[3, 3, 0, 0]}/>
              <Bar dataKey="Đào tạo" fill="#00a99d" radius={[3, 3, 0, 0]}/>
              <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 8 }}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detail table */}
      <div className="safety-kpi-table-card bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="safety-kpi-table-head p-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Database className="h-4 w-4 text-[#1565c0]"/> KPI chi tiết theo bộ phận
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
              Nhấn tiêu đề cột để sắp xếp
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#22a050]"/>
              dữ liệu thực từ DB
            </p>
          </div>
          <div className="safety-kpi-table-legend text-xs text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-sm bg-[#22a050] mr-1"/>Đạt &nbsp;
            <span className="inline-block w-2 h-2 rounded-sm bg-[#f9a825] mr-1"/>Sắp đạt &nbsp;
            <span className="inline-block w-2 h-2 rounded-sm bg-[#e53935] mr-1"/>Chưa đạt
          </div>
        </div>
        <div className="safety-kpi-mobile-list space-y-3 p-3 sm:hidden">
          {pagedSorted.length === 0 ? (<div className="rounded-lg border border-border bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
              Không có KPI phù hợp bộ lọc
            </div>) : pagedSorted.map((row, i) => {
            const met = row.safetyScore >= row.target;
            const near = !met && row.safetyScore >= row.target - 5;
            const sc = met ? '#22a050' : near ? '#f9a825' : '#e53935';
            return (<article key={row.department} className="safety-kpi-mobile-card rounded-lg border border-border bg-background p-3 shadow-sm" role="button" tabIndex={0} aria-pressed={selectedDept === row.department} onClick={() => toggleDept(row.department)} onKeyDown={event => handleDeptKeyDown(event, row.department)} style={{ background: selectedDept === row.department ? `${sc}08` : undefined }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-muted-foreground">#{kpiStartIndex + i + 1}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-base font-bold text-foreground">
                      {row.department}
                      {row.hasRealData ? (<span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#22a050]/10 text-[#22a050]" title="Dữ liệu thực từ DB">
                          <Database className="h-2.5 w-2.5"/>
                        </span>) : null}
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold" style={{ color: sc, background: `${sc}15` }}>
                    {met ? <CheckCircle2 className="h-3.5 w-3.5"/> : near ? <Circle className="h-3.5 w-3.5"/> : <XCircle className="h-3.5 w-3.5"/>}
                    {met ? 'Đạt' : near ? 'Sắp đạt' : 'Chưa đạt'}
                  </span>
                </div>

                <div className="mt-3 rounded-lg bg-muted/25 p-3">
                  <div className="mb-1 flex items-end justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase text-muted-foreground">Điểm an toàn</div>
                      <div className="font-mono text-2xl font-bold" style={{ color: sc }}>{row.safetyScore}%</div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      Mục tiêu <b className="font-mono text-foreground">{row.target}%</b>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-background">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, row.safetyScore)}%`, backgroundColor: sc }}/>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-muted/30 px-2 py-1.5">
                    <div className="text-[10px] font-semibold uppercase text-muted-foreground">Sự cố</div>
                    <div className="font-mono font-bold" style={{ color: row.incidentCount > 0 ? '#e53935' : '#22a050' }}>{row.incidentCount}</div>
                  </div>
                  <div className="rounded-md bg-muted/30 px-2 py-1.5">
                    <div className="text-[10px] font-semibold uppercase text-muted-foreground">Ngày KTN</div>
                    <div className="font-mono font-bold text-[#22a050]">{row.noDays}</div>
                  </div>
                  <div className="rounded-md bg-muted/30 px-2 py-1.5">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground">Checklist</span>
                      <span className="font-mono font-bold">{row.checklistPct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-background">
                      <div className="h-full rounded-full bg-[#1565c0]" style={{ width: `${row.checklistPct}%` }}/>
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/30 px-2 py-1.5">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground">Đào tạo</span>
                      <span className="font-mono font-bold">{row.trainingPct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-background">
                      <div className="h-full rounded-full bg-[#00a99d]" style={{ width: `${row.trainingPct}%` }}/>
                    </div>
                  </div>
                </div>
              </article>);
        })}
        </div>

        <div className="safety-kpi-table-wrap hidden overflow-x-auto sm:block">
          <table className="safety-kpi-table w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th scope="col" className="text-left px-4 py-3 font-semibold text-muted-foreground">#</th>
                <th scope="col" className="text-left px-4 py-3 font-semibold text-muted-foreground">Bộ phận</th>
                {[
            { key: 'safetyScore' as SortKey, label: 'Điểm AT' },
            { key: 'incidentCount' as SortKey, label: 'Sự cố' },
            { key: 'checklistPct' as SortKey, label: 'Checklist' },
            { key: 'trainingPct' as SortKey, label: 'Đào tạo' },
            { key: 'noDays' as SortKey, label: 'Ngày KTN' },
        ].map(col => (<th key={col.key} scope="col" aria-sort={sortKey === col.key ? (sortAsc ? 'ascending' : 'descending') : 'none'} className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                    <button type="button" onClick={() => handleSort(col.key)} className="inline-flex items-center gap-1.5 rounded-md text-left transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#1565c0]/30" aria-label={`Sắp xếp KPI theo ${col.label}`}>
                      {col.label}
                      {sortKey === col.key
                ? (sortAsc ? <ArrowUp className="h-3.5 w-3.5"/> : <ArrowDown className="h-3.5 w-3.5"/>)
                : <ArrowUpDown className="h-3.5 w-3.5 opacity-30"/>}
                    </button>
                  </th>))}
                <th scope="col" className="text-left px-4 py-3 font-semibold text-muted-foreground">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {pagedSorted.map((row, i) => {
            const met = row.safetyScore >= row.target;
            const near = !met && row.safetyScore >= row.target - 5;
            const sc = met ? '#22a050' : near ? '#f9a825' : '#e53935';
            return (<tr key={row.department} className="safety-kpi-row border-b border-border hover:bg-muted/20 cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#1565c0]/30" tabIndex={0} aria-selected={selectedDept === row.department} onClick={() => toggleDept(row.department)} onKeyDown={event => handleDeptKeyDown(event, row.department)} style={{ background: selectedDept === row.department ? `${sc}08` : undefined }}>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{kpiStartIndex + i + 1}</td>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap">
                      {row.department}
                      {row.hasRealData && (<span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#22a050]/10 align-middle text-[#22a050]" title="Dữ liệu thực từ DB">
                          <Database className="h-2.5 w-2.5"/>
                        </span>)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono text-base w-9" style={{ color: sc }}>{row.safetyScore}%</span>
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${row.safetyScore}%`, backgroundColor: sc }}/>
                        </div>
                        <span className="text-xs text-muted-foreground">/{row.target}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-mono font-bold text-base" style={{ color: row.incidentCount > 0 ? '#e53935' : '#22a050' }}>{row.incidentCount}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#1565c0]" style={{ width: `${row.checklistPct}%` }}/>
                        </div>
                        <span className="text-xs font-mono">{row.checklistPct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#00a99d]" style={{ width: `${row.trainingPct}%` }}/>
                        </div>
                        <span className="text-xs font-mono">{row.trainingPct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-[#22a050]">{row.noDays}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold" style={{ color: sc, background: `${sc}15` }}>
                        {met ? <CheckCircle2 className="h-3.5 w-3.5"/> : near ? <Circle className="h-3.5 w-3.5"/> : <XCircle className="h-3.5 w-3.5"/>}
                        {met ? 'Đạt' : near ? 'Sắp đạt' : 'Chưa đạt'}
                      </span>
                    </td>
                  </tr>);
        })}
            </tbody>
          </table>
          {sorted.length > 0 && (<div className="safety-kpi-pagination flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/10 px-4 py-3">
              <span className="text-xs font-semibold text-muted-foreground">
                Hiển thị {kpiDisplayStart}-{kpiDisplayEnd} / {sorted.length} bộ phận
              </span>
              <div className="flex items-center gap-2">
                <button aria-label="Trang KPI trước" className="safety-kpi-page-btn inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40" disabled={currentKpiPage <= 1} onClick={() => setKpiPage(page => Math.max(1, page - 1))} type="button">
                  <ChevronLeft className="h-4 w-4"/>
                </button>
                <span className="min-w-20 text-center text-xs font-bold text-foreground">
                  Trang {currentKpiPage}/{totalKpiPages}
                </span>
                <button aria-label="Trang KPI sau" className="safety-kpi-page-btn inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40" disabled={currentKpiPage >= totalKpiPages} onClick={() => setKpiPage(page => Math.min(totalKpiPages, page + 1))} type="button">
                  <ChevronRight className="h-4 w-4"/>
                </button>
              </div>
            </div>)}
        </div>
      </div>
    </div>)}</SafetyI18nRender>;
}
