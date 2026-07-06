import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import "./safety-data-entry.css";
import { useAuth } from '../../auth/AuthContext';
import { useHubLanguage } from '../../i18n-context';
import { localizedText } from '../../i18n-localized';
import type { SafetyUser } from './safety-domain';
import { DIVISIONS, DEPT_BY_NAME, authHeaders, getDivisionForDept, sampleArray, toSampleUser } from './safety-sample-adapter';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, BarChart2, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, Clock, Database, GraduationCap, Plus, RefreshCw, Send, ShieldCheck, X, XCircle, } from 'lucide-react';
import { Button } from './safety-sample-adapter';
import { SafetyI18nRender } from "./safety-i18n-render";
import { SafetyLocalizedTextField, emptySafetyLocalizedText, safetyLocalizedPayload, safetyLocalizedVi } from "./safety-localized-form";
// ─── Entry type config ───────────────────────────────────────────────────────
const ENTRY_TYPES = [
    {
        value: 'safety_score_monthly',
        label: 'Điểm an toàn',
        unit: 'điểm',
        periodType: 'monthly',
        placeholder: 'VD: 92',
        description: 'Điểm ATVSLD tháng',
        defaultTarget: '90',
    },
    {
        value: 'no_accident_days',
        label: 'Ngày không tai nạn',
        unit: 'ngày',
        periodType: 'daily',
        placeholder: 'VD: 148',
        description: 'Số ngày tích lũy không tai nạn',
        defaultTarget: '',
    },
    {
        value: 'checklist_daily',
        label: 'Checklist 6S',
        unit: '%',
        periodType: 'daily',
        placeholder: 'VD: 85',
        description: 'Tỷ lệ hoàn thành checklist hôm nay',
        defaultTarget: '80',
    },
    {
        value: 'training_monthly',
        label: 'Tỷ lệ đào tạo',
        unit: '%',
        periodType: 'monthly',
        placeholder: 'VD: 95',
        description: 'Hoàn thành đào tạo AT tháng',
        defaultTarget: '100',
    },
    {
        value: 'violation_warning',
        label: 'Vi phạm / cảnh báo',
        unit: 'lần',
        periodType: 'daily',
        placeholder: 'VD: 2',
        description: 'Số vi phạm/cảnh báo ghi nhận',
        defaultTarget: '0',
    },
];
const ENTRY_TYPE_ICONS: Record<string, LucideIcon> = {
    safety_score_monthly: ShieldCheck,
    no_accident_days: CalendarDays,
    checklist_daily: ClipboardCheck,
    training_monthly: GraduationCap,
    violation_warning: AlertTriangle,
};
const entryTypeIconFor = (entryType: string): LucideIcon => ENTRY_TYPE_ICONS[entryType] ?? BarChart2;
const ENTRY_PAGE_SIZE = 20;
const STATUS_MAP: Record<string, {
    label: string;
    color: string;
    icon: React.ReactNode;
}> = {
    pending_l1: { label: 'Chờ QL duyệt', color: '#f9a825', icon: <Clock className="w-3.5 h-3.5"/> },
    pending_l2: { label: 'Chờ EHS duyệt', color: '#1565c0', icon: <Clock className="w-3.5 h-3.5"/> },
    approved: { label: 'APPROVED', color: '#22a050', icon: <CheckCircle2 className="w-3.5 h-3.5"/> },
    rejected: { label: 'REJECTED', color: '#e53935', icon: <XCircle className="w-3.5 h-3.5"/> },
};
const errorMessage = (error: unknown, fallback = 'Lỗi không xác định') => error instanceof Error ? error.message : fallback;

function todayStr() {
    return new Date().toISOString().split('T')[0];
}
function thisMonthStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
// ─── Types ───────────────────────────────────────────────────────────────────
type LocalizedContent = Record<string, string | undefined>;
interface KpiEntry {
    id: string;
    code: string;
    entryType: string;
    periodType: string;
    period: string;
    departmentCode: string;
    divisionCode: string;
    value: string;
    target: string | null;
    unit: string | null;
    notes: string | null;
    notesI18n?: LocalizedContent;
    approvalStatus: string;
    rejectionReason: string | null;
    rejectionReasonI18n?: LocalizedContent;
    submittedByName: string;
    createdAt: string;
}
interface FormState {
    entryType: string;
    period: string;
    value: string;
    target: string;
    notes: string;
    notesI18n: ReturnType<typeof emptySafetyLocalizedText>;
}
const BLANK_FORM: FormState = {
    entryType: 'safety_score_monthly',
    period: thisMonthStr(),
    value: '',
    target: '90',
    notes: '',
    notesI18n: emptySafetyLocalizedText(),
};
// ─── Component ───────────────────────────────────────────────────────────────
export function SafetyDataEntryPage() {
    const { lang } = useHubLanguage();
    const { user: authUser } = useAuth() as {
        user: SafetyUser | null;
    };
    const user = React.useMemo(() => toSampleUser(authUser), [authUser]);
    const token = '';
    const [form, setForm] = useState<FormState>(BLANK_FORM);
    const [entries, setEntries] = useState<KpiEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [initialLoaded, setInitialLoaded] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [entryPage, setEntryPage] = useState(1);
    const typeConfig = ENTRY_TYPES.find(t => t.value === form.entryType) ?? ENTRY_TYPES[0];
    React.useEffect(() => {
        if (!user)
            return;
        loadEntries();
    }, [user]);
    React.useEffect(() => {
        const cfg = ENTRY_TYPES.find(t => t.value === form.entryType);
        if (!cfg)
            return;
        const newPeriod = cfg.periodType === 'monthly' ? thisMonthStr() : todayStr();
        setForm(f => ({ ...f, period: newPeriod, target: cfg.defaultTarget }));
    }, [form.entryType]);
    async function loadEntries() {
        if (!user)
            return;
        setLoading(true);
        try {
            const res = await fetch('/api/kpi-entries', {
                headers: authHeaders(token!),
            });
            if (!res.ok)
                throw new Error(await res.text());
            const data = sampleArray<KpiEntry>(await res.json());
            setEntries(data);
        }
        catch (e: unknown) {
            setError('Không tải được dữ liệu: ' + errorMessage(e));
        }
        finally {
            setLoading(false);
            setInitialLoaded(true);
        }
    }
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user)
            return;
        if (!form.value || isNaN(Number(form.value))) {
            setError('Vui lòng nhập giá trị hợp lệ');
            return;
        }
        setSubmitting(true);
        setError(null);
        setSuccess(null);
        try {
            const divInfo = getDivisionForDept(user.departmentCode);
            const notesI18n = safetyLocalizedPayload(form.notesI18n, form.notes);
            const body = {
                entryType: form.entryType,
                periodType: typeConfig.periodType,
                period: form.period,
                divisionCode: user.divisionCode || divInfo?.code || '',
                value: Number(form.value),
                target: form.target ? Number(form.target) : null,
                unit: typeConfig.unit,
                notes: safetyLocalizedVi(notesI18n, form.notes) || null,
                notesI18n,
            };
            const res = await fetch('/api/kpi-entries', {
                method: 'POST',
                headers: authHeaders(token!),
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Lỗi không xác định');
            }
            const created = await res.json();
            setEntries(prev => [created, ...prev]);
            setEntryPage(1);
            setForm(f => ({ ...f, value: '', notes: '', notesI18n: emptySafetyLocalizedText() }));
            setSuccess(`Đã nộp ${created.code} thành công – chờ Quản lý duyệt`);
            setShowForm(false);
            setTimeout(() => setSuccess(null), 5000);
        }
        catch (e: unknown) {
            setError(errorMessage(e));
        }
        finally {
            setSubmitting(false);
        }
    }
    const filtered = entries.filter(e => {
        if (filterType !== 'all' && e.entryType !== filterType)
            return false;
        if (filterStatus !== 'all' && e.approvalStatus !== filterStatus)
            return false;
        return true;
    });
    React.useEffect(() => {
        setEntryPage(1);
    }, [filterType, filterStatus, entries.length]);
    const totalEntryPages = Math.max(1, Math.ceil(filtered.length / ENTRY_PAGE_SIZE));
    const currentEntryPage = Math.min(entryPage, totalEntryPages);
    const pageStartIndex = (currentEntryPage - 1) * ENTRY_PAGE_SIZE;
    const pagedEntries = filtered.slice(pageStartIndex, pageStartIndex + ENTRY_PAGE_SIZE);
    const displayStart = filtered.length ? pageStartIndex + 1 : 0;
    const displayEnd = Math.min(pageStartIndex + ENTRY_PAGE_SIZE, filtered.length);
    const pendingL1 = entries.filter(e => e.approvalStatus === 'pending_l1').length;
    const pendingL2 = entries.filter(e => e.approvalStatus === 'pending_l2').length;
    const approvedCount = entries.filter(e => e.approvalStatus === 'approved').length;
    const rejectedCount = entries.filter(e => e.approvalStatus === 'rejected').length;
    const latestEntry = entries[0];
    const approvedRate = entries.length ? Math.round((approvedCount / entries.length) * 100) : 0;
    const entrySummaryCards = [
        { key: 'total', label: 'Tổng bản ghi', value: entries.length, helper: latestEntry ? `Mới nhất: ${latestEntry.code}` : 'Chưa có dữ liệu KPI', tone: '#1565c0', icon: Database },
        { key: 'l1', label: 'Chờ QL duyệt', value: pendingL1, helper: 'Cấp duyệt bộ phận', tone: '#f9a825', icon: Clock },
        { key: 'l2', label: 'Chờ EHS duyệt', value: pendingL2, helper: 'Cấp duyệt EHS/Admin', tone: '#1565c0', icon: ShieldCheck },
        { key: 'approved', label: 'Tỷ lệ đã duyệt', value: `${approvedRate}%`, helper: `${approvedCount} duyệt · ${rejectedCount} từ chối`, tone: approvedRate >= 80 ? '#22a050' : '#f9a825', icon: CheckCircle2 },
    ];
    if (!user)
        return <SafetyI18nRender>{null}</SafetyI18nRender>;
    const canSubmitEntry = user.role !== 'giamdoc';
    return <SafetyI18nRender>{(<div className="safety-data-entry-page max-w-7xl mx-auto space-y-6 pb-10">

      {/* Header + toolbar */}
      <div className="safety-entry-hero bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="safety-entry-hero-row flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="safety-entry-hero-icon w-10 h-10 rounded-xl bg-[#1565c0]/10 flex items-center justify-center text-[#1565c0]">
              <BarChart2 className="h-5 w-5"/>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#1565c0]">Bộ phận hiện tại</p>
              <p className="text-xs text-muted-foreground">
                Bộ phận: <strong>{user.departmentCode}</strong> · {user.roleLabel}
              </p>
            </div>
          </div>
          {canSubmitEntry && (<button type="button" onClick={() => setShowForm(true)} className="safety-entry-create-btn flex items-center gap-2 px-4 py-2.5 bg-[#1565c0] text-white rounded-lg font-bold text-sm hover:bg-[#1254a0] transition-all shadow-sm">
              <Plus className="w-4 h-4"/> Nhập KPI mới
            </button>)}
        </div>
      </div>

      {/* Modal – Nhập KPI */}
      <div className="safety-entry-command">
        <div className="safety-entry-command-copy">
          <span>Luồng nhập KPI</span>
          <strong>{user.departmentCode} · {entries.length} bản ghi</strong>
          <p>Nộp dữ liệu KPI theo kỳ, quản lý bộ phận duyệt cấp 1, sau đó EHS/Admin duyệt cấp 2 trước khi đưa vào báo cáo KPI.</p>
        </div>
        <div className="safety-entry-command-cards">
          {entrySummaryCards.map(card => {
            const Icon = card.icon;
            return (<div className="safety-entry-command-card" key={card.key} style={{ borderTopColor: card.tone }}>
                <span className="safety-entry-command-icon" style={{ color: card.tone, background: `${card.tone}12`, borderColor: `${card.tone}28` }}>
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

      {showForm && createPortal(<div className="safety-create-modal-backdrop safety-entry-modal-backdrop fixed inset-0 z-[1400]" role="presentation">
          <div aria-labelledby="kpi-entry-create-title" aria-modal="true" className="safety-create-modal safety-create-modal-compact safety-entry-modal bg-card border border-border rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl" role="dialog">

            {/* Header */}
            <div className="safety-create-modal-head safety-entry-modal-head sticky top-0 bg-[#1565c0]/10 border-b border-[#1565c0]/25 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h3 id="kpi-entry-create-title" className="font-bold text-lg text-[#1565c0] flex items-center gap-2">
                  <BarChart2 className="w-5 h-5"/> Nhập KPI mới
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Bộ phận: <strong>{user.departmentCode}</strong> · Sẽ gửi cho Quản lý duyệt
                </p>
              </div>
              <button aria-label="Đóng form nhập KPI" onClick={() => { setShowForm(false); setError(null); }} type="button" className="safety-entry-modal-close p-2 rounded-lg hover:bg-[#1565c0]/10 text-muted-foreground hover:text-[#1565c0] transition-colors">
                <X className="w-5 h-5"/>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="safety-create-modal-body safety-create-modal-form safety-entry-form p-6 space-y-6">

              {/* Block 1: Loại chỉ số */}
              <div>
                <h4 className="text-xs font-bold tracking-normal text-muted-foreground mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-[#1565c0] text-white flex items-center justify-center text-[10px] font-bold">1</span>
                  Loại chỉ số KPI
                </h4>
                <div className="grid grid-cols-1 gap-2">
                  {ENTRY_TYPES.map(t => ((() => {
                const TypeIcon = entryTypeIconFor(t.value);
                return (<button key={t.value} type="button" aria-pressed={form.entryType === t.value} onClick={() => setForm(f => ({ ...f, entryType: t.value }))} className={`safety-entry-type-card w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-3 ${form.entryType === t.value
                        ? 'border-[#1565c0] bg-[#1565c0]/8 ring-1 ring-[#1565c0]/30'
                        : 'border-border hover:bg-muted/40 hover:border-[#1565c0]/40'}`}>
                          <span className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${form.entryType === t.value ? 'bg-[#1565c0] text-white' : 'bg-muted text-muted-foreground'}`}>
                            <TypeIcon className="h-4 w-4"/>
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className={`font-semibold text-sm ${form.entryType === t.value ? 'text-[#1565c0]' : ''}`}>{t.label}</div>
                            <div className="text-[11px] text-muted-foreground">{t.description} · Đơn vị: {t.unit}</div>
                          </div>
                          {form.entryType === t.value && (<div className="w-5 h-5 rounded-full bg-[#1565c0] flex items-center justify-center shrink-0">
                              <CheckCircle2 className="w-3 h-3 text-white"/>
                            </div>)}
                        </button>);
            })()))}
                </div>
              </div>

              {/* Block 2: Kỳ & Giá trị */}
              <div>
                <h4 className="text-xs font-bold tracking-normal text-muted-foreground mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-[#22a050] text-white flex items-center justify-center text-[10px] font-bold">2</span>
                  Kỳ báo cáo & giá trị
                </h4>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="kpi-entry-period" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1.5">
                      <CalendarDays className="h-3.5 w-3.5"/>
                      {typeConfig.periodType === 'monthly' ? 'Tháng báo cáo' : 'Ngày báo cáo'}
                    </label>
                    <input id="kpi-entry-period" type={typeConfig.periodType === 'monthly' ? 'month' : 'date'} value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[#22a050]/30" required/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="kpi-entry-value" className="block text-xs font-semibold text-muted-foreground mb-1.5">
                        Giá trị ({typeConfig.unit}) *
                      </label>
                      <input id="kpi-entry-value" type="number" step="0.01" required value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder={typeConfig.placeholder} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[#22a050]/30"/>
                    </div>
                    <div>
                      <label htmlFor="kpi-entry-target" className="block text-xs font-semibold text-muted-foreground mb-1.5">
                        Mục tiêu ({typeConfig.unit})
                      </label>
                      <input id="kpi-entry-target" type="number" step="0.01" value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} placeholder={typeConfig.defaultTarget || 'Không bắt buộc'} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[#22a050]/30"/>
                    </div>
                  </div>
                  <SafetyLocalizedTextField
                    ariaLabel="Ghi chú KPI"
                    inputClassName="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[#22a050]/30 resize-none"
                    label="Ghi chú"
                    onChange={value => setForm(f => ({ ...f, notesI18n: value, notes: safetyLocalizedVi(value) }))}
                    placeholder="Ghi chú thêm về số liệu này..."
                    rows={2}
                    textarea
                    value={form.notesI18n}
                  />
                </div>
              </div>

              {/* Feedback */}
              {error && <div className="text-xs text-[#e53935] bg-[#e53935]/10 rounded-lg px-3 py-2">{error}</div>}

              {/* Footer */}
              <div className="flex gap-3 pt-2 border-t border-border">
                <Button type="submit" disabled={submitting} className="safety-entry-submit-btn flex-1 bg-[#1565c0] hover:bg-[#1254a0] text-white gap-2 py-2.5">
                  <Send className="w-4 h-4"/>
                  {submitting ? 'Đang nộp...' : 'Nộp dữ liệu KPI'}
                </Button>
                <button type="button" onClick={() => { setShowForm(false); setError(null); }} className="safety-entry-cancel-btn px-6 py-2.5 border border-border rounded-lg font-semibold text-sm hover:bg-muted transition-all">
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>, document.body)}

      {/* ── Entry list (full width) ── */}
      <div className="space-y-4">

          {/* Filters */}
          <div className="safety-entry-filter-panel bg-card border border-border rounded-xl p-4 shadow-sm mb-4 flex flex-wrap gap-3 items-center">
            <span className="text-xs font-semibold text-muted-foreground shrink-0">Lọc:</span>
            <div className="safety-entry-filter-group flex gap-2 flex-wrap" role="group" aria-label="Lọc theo loại KPI">
              {[
            { value: 'all', label: 'Tất cả loại' },
            ...ENTRY_TYPES.map(t => ({ value: t.value, label: t.label })),
        ].map(opt => (<button key={opt.value} type="button" aria-pressed={filterType === opt.value} onClick={() => setFilterType(opt.value)} className={`safety-entry-filter-chip px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${filterType === opt.value ? 'active bg-[#1565c0] text-white' : 'border border-border hover:bg-muted'}`}>
                  {opt.label}
                </button>))}
            </div>
            <div className="safety-entry-filter-group status flex gap-2 flex-wrap ml-auto" role="group" aria-label="Lọc trạng thái duyệt KPI">
              {[
            { value: 'all', label: 'Mọi trạng thái' },
            { value: 'pending_l1', label: 'Chờ QL' },
            { value: 'pending_l2', label: 'Chờ EHS' },
            { value: 'approved', label: 'APPROVED' },
            { value: 'rejected', label: 'REJECTED' },
        ].map(opt => (<button key={opt.value} type="button" aria-pressed={filterStatus === opt.value} onClick={() => setFilterStatus(opt.value)} className={`safety-entry-filter-chip px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${filterStatus === opt.value ? 'active bg-foreground text-background' : 'border border-border hover:bg-muted'}`}>
                  {opt.label}
                </button>))}
            </div>
            <button type="button" onClick={loadEntries} className="safety-entry-refresh-btn inline-flex items-center gap-1.5 text-xs font-bold text-[#1565c0] hover:underline shrink-0">
              <RefreshCw className="h-3.5 w-3.5"/> Làm mới
            </button>
          </div>

          {/* Summary badges */}
          <div className="safety-entry-status-grid grid grid-cols-4 gap-3 mb-4">
            {[
            { key: 'pending_l1', label: 'Chờ QL', color: '#f9a825' },
            { key: 'pending_l2', label: 'Chờ EHS', color: '#1565c0' },
            { key: 'approved', label: 'APPROVED', color: '#22a050' },
            { key: 'rejected', label: 'REJECTED', color: '#e53935' },
        ].map(s => (<div key={s.key} className="safety-entry-status-card bg-card border border-border rounded-xl p-3 shadow-sm text-center">
                <div className="text-2xl font-bold font-mono" style={{ color: s.color }}>
                  {entries.filter(e => e.approvalStatus === s.key).length}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{s.label}</div>
              </div>))}
          </div>

          {/* Table */}
          <div className="safety-entry-table-card bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            {loading && !initialLoaded ? (<div className="p-12 text-center text-muted-foreground text-sm">Đang tải...</div>) : filtered.length === 0 ? (<div className="p-12 text-center">
                <ClipboardList className="mx-auto mb-3 h-9 w-9 text-muted-foreground"/>
                <div className="text-sm text-muted-foreground">Chưa có dữ liệu KPI nào</div>
                {canSubmitEntry && <div className="text-xs text-muted-foreground mt-1">Sử dụng form bên trái để nhập dữ liệu đầu tiên</div>}
              </div>) : (<>
                <div className="safety-entry-mobile-list space-y-3 p-3 sm:hidden">
                  {pagedEntries.map(entry => {
                const st = STATUS_MAP[entry.approvalStatus] ?? STATUS_MAP.pending_l1;
                const et = ENTRY_TYPES.find(t => t.value === entry.entryType);
                const EntryIcon = entryTypeIconFor(entry.entryType);
                const val = parseFloat(entry.value);
                const tgt = entry.target ? parseFloat(entry.target) : null;
                const met = tgt !== null && val >= tgt;
                const rejectionReason = localizedText(entry.rejectionReasonI18n, lang, entry.rejectionReason || "");
                return (<article key={entry.id} className="safety-entry-mobile-card rounded-lg border border-border bg-background p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-mono text-[11px] font-bold text-[#1565c0]">{entry.code}</div>
                            <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-foreground">
                              <EntryIcon className="h-4 w-4 shrink-0 text-[#1565c0]"/>
                              <span>{et?.label ?? entry.entryType}</span>
                            </div>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold" style={{ color: st.color, background: `${st.color}15` }}>
                            {st.icon}{st.label}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-md bg-muted/30 px-2 py-1.5">
                            <div className="text-[10px] font-semibold text-muted-foreground">Kỳ</div>
                            <div className="font-mono font-bold">{entry.period}</div>
                          </div>
                          <div className="rounded-md bg-muted/30 px-2 py-1.5">
                            <div className="text-[10px] font-semibold text-muted-foreground">Bộ phận</div>
                            <div className="font-bold">{entry.departmentCode}</div>
                          </div>
                          <div className="rounded-md bg-muted/30 px-2 py-1.5">
                            <div className="text-[10px] font-semibold text-muted-foreground">Giá trị</div>
                            <div className="font-mono font-bold" style={{ color: tgt !== null ? (met ? '#22a050' : '#e53935') : undefined }}>
                              {entry.value}{entry.unit ? <span className="ml-1 text-muted-foreground">{entry.unit}</span> : null}
                            </div>
                          </div>
                          <div className="rounded-md bg-muted/30 px-2 py-1.5">
                            <div className="text-[10px] font-semibold text-muted-foreground">Mục tiêu</div>
                            <div className="font-mono font-bold">{entry.target ?? '-'}</div>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span>Người nộp: <b className="text-foreground">{entry.submittedByName}</b></span>
                          {rejectionReason ? <span className="font-semibold text-[#e53935]">{rejectionReason}</span> : null}
                        </div>
                      </article>);
            })}
                </div>
                <div className="safety-entry-table-wrap hidden overflow-x-auto sm:block">
                <table className="safety-entry-table w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Mã</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Loại</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Kỳ</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Bộ phận</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Giá trị</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Mục tiêu</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Trạng thái</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Người nộp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedEntries.map(entry => {
                const st = STATUS_MAP[entry.approvalStatus] ?? STATUS_MAP.pending_l1;
                const et = ENTRY_TYPES.find(t => t.value === entry.entryType);
                const EntryIcon = entryTypeIconFor(entry.entryType);
                const val = parseFloat(entry.value);
                const tgt = entry.target ? parseFloat(entry.target) : null;
                const met = tgt !== null && val >= tgt;
                const rejectionReason = localizedText(entry.rejectionReasonI18n, lang, entry.rejectionReason || "");
                return (<tr key={entry.id} className="safety-entry-row border-b border-border hover:bg-muted/20">
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{entry.code}</td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1.5 text-xs font-semibold">
                              <EntryIcon className="h-3.5 w-3.5 text-[#1565c0]"/>
                              {et?.label ?? entry.entryType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-mono">{entry.period}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-muted">{entry.departmentCode}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-bold font-mono text-sm" style={{ color: tgt !== null ? (met ? '#22a050' : '#e53935') : undefined }}>
                              {entry.value}
                            </span>
                            {entry.unit && <span className="text-xs text-muted-foreground ml-1">{entry.unit}</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-mono text-muted-foreground">
                            {entry.target ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold" style={{ color: st.color, background: `${st.color}15` }}>
                              {st.icon}{st.label}
                            </span>
                            {entry.approvalStatus === 'rejected' && rejectionReason && (<div className="text-[11px] text-[#e53935] mt-0.5 italic truncate max-w-[120px]">{rejectionReason}</div>)}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{entry.submittedByName}</td>
                        </tr>);
            })}
                  </tbody>
                </table>
                </div>
                <div className="safety-entry-pagination flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/10 px-4 py-3">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Hiển thị {displayStart}-{displayEnd} / {filtered.length} dòng KPI
                  </span>
                  <div className="flex items-center gap-2">
                    <button aria-label="Trang nhập KPI trước" className="safety-entry-page-btn inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40" disabled={currentEntryPage <= 1} onClick={() => setEntryPage(page => Math.max(1, page - 1))} type="button">
                      <ChevronLeft className="h-4 w-4"/>
                    </button>
                    <span className="min-w-20 text-center text-xs font-bold text-foreground">
                      Trang {currentEntryPage}/{totalEntryPages}
                    </span>
                    <button aria-label="Trang nhập KPI sau" className="safety-entry-page-btn inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40" disabled={currentEntryPage >= totalEntryPages} onClick={() => setEntryPage(page => Math.min(totalEntryPages, page + 1))} type="button">
                      <ChevronRight className="h-4 w-4"/>
                    </button>
                  </div>
                </div>
              </>)}
          </div>
        </div>
    </div>)}</SafetyI18nRender>;
}
