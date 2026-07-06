import React, { useState, useCallback } from 'react';
import "./safety-approval.css";
import { useAuth } from '../../auth/AuthContext';
import type { SafetyUser } from './safety-domain';
import { authHeaders, sampleArray, toSampleUser } from './safety-sample-adapter';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, ArrowRight, BarChart2, CalendarDays, CheckCircle2, ClipboardCheck, Clock, FileClock, GraduationCap, Inbox, Layers3, Lock, RefreshCw, ShieldCheck, Square, CheckSquare, TrendingUp, UserCheck, XCircle, Zap } from 'lucide-react';
import { Button } from './safety-sample-adapter';
import { SafetyI18nRender } from "./safety-i18n-render";
import { useHubLanguage } from "../../i18n-context";
import { localizedText } from "../../i18n-localized";
const ENTRY_TYPES: Record<string, {
    label: string;
    unit: string;
}> = {
    safety_score_monthly: { label: 'Điểm an toàn', unit: 'điểm' },
    no_accident_days: { label: 'Ngày không tai nạn', unit: 'ngày' },
    checklist_daily: { label: 'Checklist 6S', unit: '%' },
    training_monthly: { label: 'Tỷ lệ đào tạo', unit: '%' },
    violation_warning: { label: 'Vi phạm / cảnh báo', unit: 'lần' },
};
const ENTRY_TYPE_ICONS: Record<string, LucideIcon> = {
    safety_score_monthly: ShieldCheck,
    no_accident_days: CalendarDays,
    checklist_daily: ClipboardCheck,
    training_monthly: GraduationCap,
    violation_warning: AlertTriangle,
};
const entryTypeIconFor = (entryType: string): LucideIcon => ENTRY_TYPE_ICONS[entryType] ?? BarChart2;
const STATUS_MAP: Record<string, {
    label: string;
    color: string;
}> = {
    pending_l1: { label: 'Chờ QL duyệt', color: '#f9a825' },
    pending_l2: { label: 'Chờ EHS duyệt', color: '#1565c0' },
    approved: { label: 'APPROVED', color: '#22a050' },
    rejected: { label: 'REJECTED', color: '#e53935' },
};
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

function formatApprovalTimestamp(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    const parts = new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Ho_Chi_Minh',
    }).formatToParts(date);
    const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
    return `${pick('day')}/${pick('month')}/${pick('year')} ${pick('hour')}:${pick('minute')}:${pick('second')}`;
}
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
    rejectedByLevel: string | null;
    submittedByName: string;
    submittedByDept: string;
    l1ApprovedByName: string | null;
    l1ApprovedAt: string | null;
    l2ApprovedByName: string | null;
    l2ApprovedAt: string | null;
    createdAt: string;
}
interface HistoryRow {
    id: string;
    action: string;
    actorName: string;
    actorRole: string;
    reason: string | null;
    createdAt: string;
}
// ─── Reject modal ────────────────────────────────────────────────────────────
function RejectModal({ onConfirm, onCancel }: {
    onConfirm: (reason: string) => void;
    onCancel: () => void;
}) {
    const [reason, setReason] = useState('');
    return (<div className="safety-reject-backdrop safety-modal-backdrop fixed inset-0 z-[1400] flex items-center justify-center" role="presentation">
      <div aria-labelledby="kpi-reject-title" aria-modal="true" className="safety-reject-modal bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-md mx-4" role="dialog">
        <h3 className="font-bold text-base mb-3 flex items-center gap-2" id="kpi-reject-title">
          <XCircle className="w-5 h-5 text-[#e53935]"/> Lý do từ chối
        </h3>
        <label htmlFor="kpi-reject-reason" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
          Nội dung từ chối
        </label>
        <textarea autoFocus id="kpi-reject-reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Nhập lý do từ chối..." className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[#e53935]/40 resize-none mb-4"/>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onCancel}>Huỷ</Button>
          <Button disabled={!reason.trim()} className="bg-[#e53935] hover:bg-[#c62828] text-white" onClick={() => reason.trim() && onConfirm(reason.trim())}>
            Xác nhận từ chối
          </Button>
        </div>
      </div>
    </div>);
}
// ─── Row detail panel ────────────────────────────────────────────────────────
function EntryDetail({ entry, history, onApprove, onReject, canApproveL1, canApproveL2, }: {
    entry: KpiEntry;
    history: HistoryRow[];
    onApprove: () => void;
    onReject: () => void;
    canApproveL1: boolean;
    canApproveL2: boolean;
}) {
    const { lang } = useHubLanguage();
    const et = ENTRY_TYPES[entry.entryType];
    const EntryIcon = entryTypeIconFor(entry.entryType);
    const val = parseFloat(entry.value);
    const tgt = entry.target ? parseFloat(entry.target) : null;
    const met = tgt !== null && val >= tgt;
    const st = STATUS_MAP[entry.approvalStatus];
    const notes = localizedText(entry.notesI18n, lang, entry.notes || "");
    const rejectionReason = localizedText(entry.rejectionReasonI18n, lang, entry.rejectionReason || "");
    const canAct = (canApproveL1 && entry.approvalStatus === 'pending_l1') ||
        (canApproveL2 && entry.approvalStatus === 'pending_l2');
    const approvalPipeline = [
        {
            key: 'submitted',
            label: 'Bộ phận nộp',
            Icon: ClipboardCheck,
            done: true,
            active: false,
            rejected: false,
        },
        {
            key: 'l1',
            label: 'QL kiểm tra',
            Icon: UserCheck,
            done: Boolean(entry.l1ApprovedAt) || entry.approvalStatus === 'pending_l2' || entry.approvalStatus === 'approved',
            active: entry.approvalStatus === 'pending_l1',
            rejected: entry.approvalStatus === 'rejected' && entry.rejectedByLevel === 'l1',
        },
        {
            key: 'l2',
            label: 'EHS xác nhận',
            Icon: ShieldCheck,
            done: entry.approvalStatus === 'approved',
            active: entry.approvalStatus === 'pending_l2',
            rejected: entry.approvalStatus === 'rejected' && entry.rejectedByLevel !== 'l1',
        },
    ];
    return (<div className="safety-approval-detail-card bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="safety-approval-detail-head px-5 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1565c0]/10 text-[#1565c0]">
            <EntryIcon className="h-4 w-4"/>
          </span>
          <div>
            <div className="font-bold text-sm">{et?.label ?? entry.entryType}</div>
            <div className="text-xs text-muted-foreground font-mono">{entry.code} · {entry.period}</div>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded text-xs font-bold" style={{ color: st?.color, background: `${st?.color}18` }}>
          {st?.label}
        </span>
      </div>

      <div className="safety-approval-pipeline" aria-label="Luồng duyệt KPI">
        {approvalPipeline.map((step, index) => {
            const StepIcon = step.Icon;
            return (<React.Fragment key={step.key}>
              <div className={`safety-approval-pipeline-step ${step.done ? 'done' : ''} ${step.active ? 'active' : ''} ${step.rejected ? 'rejected' : ''}`}>
                <span className="safety-approval-pipeline-icon">
                  <StepIcon className="h-4 w-4"/>
                </span>
                <span>{step.label}</span>
              </div>
              {index < approvalPipeline.length - 1 ? <ArrowRight className="safety-approval-pipeline-arrow h-4 w-4"/> : null}
            </React.Fragment>);
        })}
      </div>

      {/* Body */}
      <div className="safety-approval-detail-body p-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Bộ phận</div>
          <div className="font-bold">{entry.departmentCode}{entry.divisionCode ? <span className="font-normal text-muted-foreground"> ({entry.divisionCode})</span> : null}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Người nộp</div>
          <div className="font-semibold">{entry.submittedByName}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Giá trị</div>
          <div className="text-2xl font-bold font-mono" style={{ color: tgt !== null ? (met ? '#22a050' : '#e53935') : undefined }}>
            {entry.value} <span className="text-base font-normal text-muted-foreground">{entry.unit}</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Mục tiêu</div>
          <div className="text-xl font-bold font-mono text-muted-foreground">{entry.target ?? '—'}</div>
          {tgt !== null && (<div className="mt-1 inline-flex items-center gap-1 text-xs" style={{ color: met ? '#22a050' : '#e53935' }}>
              {met ? <CheckCircle2 className="h-3.5 w-3.5"/> : <XCircle className="h-3.5 w-3.5"/>}
              {met ? 'Đạt mục tiêu' : 'Chưa đạt'}
            </div>)}
        </div>
        {notes && (<div className="col-span-2">
            <div className="text-xs text-muted-foreground mb-1">Ghi chú</div>
            <div className="text-sm italic bg-muted/30 rounded-lg px-3 py-2">{notes}</div>
          </div>)}
        {entry.approvalStatus === 'rejected' && rejectionReason && (<div className="col-span-2">
            <div className="text-xs text-muted-foreground mb-1">Lý do từ chối</div>
            <div className="text-sm text-[#e53935] bg-[#e53935]/10 rounded-lg px-3 py-2">{rejectionReason}</div>
          </div>)}
      </div>

      {/* Approval trail */}
      <div className="safety-approval-history px-5 pb-4">
        <div className="text-xs font-semibold text-muted-foreground mb-2">Lịch sử duyệt</div>
        <div className="space-y-2">
          {history.length === 0 ? (<div className="text-xs text-muted-foreground italic">Chưa có hoạt động</div>) : history.map(h => {
            const actionLabels: Record<string, string> = {
                submit: 'Nộp dữ liệu',
                approve_l1: 'QL duyệt',
                approve_l2: 'EHS duyệt',
                reject: 'REJECTED',
            };
            return (<div key={h.id} className="flex items-start gap-2 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0"/>
                <div>
                  <span className="font-semibold">{actionLabels[h.action] ?? h.action}</span>
                  <span className="text-muted-foreground"> · {h.actorName}</span>
                  {h.reason && <span className="text-[#e53935] italic"> – {h.reason}</span>}
                  <div className="text-muted-foreground/60">{formatApprovalTimestamp(h.createdAt)}</div>
                </div>
              </div>);
        })}
        </div>
      </div>

      {/* Action buttons */}
      {canAct && (<div className="safety-approval-actions px-5 pb-5 flex gap-3 border-t border-border pt-4">
          <Button className="flex-1 bg-[#22a050] hover:bg-[#1a7a40] text-white gap-2" onClick={onApprove}>
            <CheckCircle2 className="w-4 h-4"/>
            {canApproveL1 && entry.approvalStatus === 'pending_l1' ? 'QL duyệt cho EHS' : 'EHS xác nhận'}
          </Button>
          <Button className="flex-1 bg-[#e53935] hover:bg-[#c62828] text-white gap-2" onClick={onReject}>
            <XCircle className="w-4 h-4"/> Từ chối
          </Button>
        </div>)}
    </div>);
}
// ─── Main component ──────────────────────────────────────────────────────────
export function SafetyApprovalPage() {
    const { user: authUser } = useAuth() as {
        user: SafetyUser | null;
    };
    const user = React.useMemo(() => toSampleUser(authUser), [authUser]);
    const token = '';
    const [entries, setEntries] = useState<KpiEntry[]>([]);
    const [historyMap, setHistoryMap] = useState<Record<string, HistoryRow[]>>({});
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [rejectTarget, setRejectTarget] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('pending');
    const [initialLoaded, setInitialLoaded] = useState(false);
    const [actionError, setActionError] = useState('');
    const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
    const [bulkApproving, setBulkApproving] = useState(false);
    const canApproveL1 = user?.role === 'quanly';
    const canApproveL2 = user?.role === 'ehs' || user?.role === 'admin';
    const loadEntries = useCallback(async () => {
        if (!user)
            return;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            // quanly sees only their dept; ehs sees all
            if (user.role === 'quanly') {
                params.set('dept', user.departmentCode);
            }
            const res = await fetch(`/api/kpi-entries?${params}`, {
                credentials: 'include',
                headers: authHeaders(token!),
            });
            if (!res.ok)
                throw new Error(await res.text());
            const data = sampleArray<KpiEntry>(await res.json());
            setEntries(data);
        }
        catch (e) {
            // ignore for now
        }
        finally {
            setLoading(false);
            setInitialLoaded(true);
        }
    }, [user]);
    React.useEffect(() => {
        loadEntries();
    }, [loadEntries]);
    async function loadHistory(entryId: string) {
        if (historyMap[entryId])
            return;
        try {
            const res = await fetch(`/api/kpi-entries/${entryId}/history`, {
                credentials: 'include',
                headers: authHeaders(token!),
            });
            if (!res.ok)
                return;
            const data = sampleArray<HistoryRow>(await res.json());
            setHistoryMap(m => ({ ...m, [entryId]: data }));
        }
        catch { }
    }
    async function selectEntry(id: string) {
        setSelectedId(id);
        await loadHistory(id);
    }
    async function handleApprove(id: string) {
        if (!user)
            return;
        setActionError('');
        const entry = entries.find(e => e.id === id);
        if (!entry)
            return;
        const endpoint = entry.approvalStatus === 'pending_l1'
            ? `/api/kpi-entries/${id}/approve-l1`
            : `/api/kpi-entries/${id}/approve-l2`;
        try {
            const res = await fetch(endpoint, {
                credentials: 'include',
                method: 'POST',
                headers: authHeaders(token!),
            });
            if (!res.ok)
                throw new Error(await res.text());
            const updated: KpiEntry = await res.json();
            setEntries(prev => prev.map(e => e.id === id ? updated : e));
            // refresh history
            const hRes = await fetch(`/api/kpi-entries/${id}/history`, {
                credentials: 'include',
                headers: authHeaders(token!),
            });
            if (hRes.ok) {
                const hData = sampleArray<HistoryRow>(await hRes.json());
                setHistoryMap(m => ({ ...m, [id]: hData }));
            }
        }
        catch (e: unknown) {
            setActionError(`Không duyệt được KPI: ${errorMessage(e, 'Vui lòng thử lại.')}`);
        }
    }
    async function handleBulkApprove() {
        if (!user || bulkSelected.size === 0) return;
        setBulkApproving(true);
        setActionError('');
        const ids = [...bulkSelected];
        const results = await Promise.allSettled(ids.map(async (id) => {
            const entry = entries.find(e => e.id === id);
            if (!entry) return null;
            const endpoint = entry.approvalStatus === 'pending_l1'
                ? `/api/kpi-entries/${id}/approve-l1`
                : `/api/kpi-entries/${id}/approve-l2`;
            const res = await fetch(endpoint, { credentials: 'include', method: 'POST', headers: authHeaders(token!) });
            if (!res.ok) throw new Error(await res.text());
            return (await res.json()) as KpiEntry;
        }));
        const succeeded: KpiEntry[] = [];
        const failed: string[] = [];
        results.forEach((r, i) => {
            if (r.status === 'fulfilled' && r.value) succeeded.push(r.value);
            else failed.push(ids[i]);
        });
        if (succeeded.length > 0) {
            setEntries(prev => prev.map(e => succeeded.find(u => u.id === e.id) || e));
        }
        if (failed.length > 0) {
            setActionError(`Duyệt thất bại cho ${failed.length} phiếu. Vui lòng thử lại.`);
        }
        setBulkSelected(new Set());
        setBulkApproving(false);
    }
    function toggleBulkSelect(id: string, e: React.MouseEvent) {
        e.stopPropagation();
        setBulkSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }
    function toggleSelectAll(ids: string[], e: React.MouseEvent) {
        e.stopPropagation();
        setBulkSelected(prev => {
            if (ids.every(id => prev.has(id))) return new Set();
            return new Set(ids);
        });
    }
    async function handleReject(id: string, reason: string) {
        if (!user)
            return;
        setActionError('');
        try {
            const entry = entries.find(e => e.id === id);
            const rejectEndpoint = entry?.approvalStatus === 'pending_l1'
                ? `/api/kpi-entries/${id}/reject-l1`
                : `/api/kpi-entries/${id}/reject-l2`;
            const res = await fetch(rejectEndpoint, {
                credentials: 'include',
                method: 'POST',
                headers: authHeaders(token!),
                body: JSON.stringify({ reason }),
            });
            if (!res.ok)
                throw new Error(await res.text());
            const updated: KpiEntry = await res.json();
            setEntries(prev => prev.map(e => e.id === id ? updated : e));
            const hRes = await fetch(`/api/kpi-entries/${id}/history`, {
                credentials: 'include',
                headers: authHeaders(token!),
            });
            if (hRes.ok) {
                const hData = sampleArray<HistoryRow>(await hRes.json());
                setHistoryMap(m => ({ ...m, [id]: hData }));
            }
        }
        catch (e: unknown) {
            setActionError(`Không từ chối được KPI: ${errorMessage(e, 'Vui lòng thử lại.')}`);
        }
        finally {
            setRejectTarget(null);
        }
    }
    const filtered = entries.filter(e => {
        if (filterStatus === 'pending')
            return e.approvalStatus === 'pending_l1' || e.approvalStatus === 'pending_l2';
        if (filterStatus === 'approved')
            return e.approvalStatus === 'approved';
        if (filterStatus === 'rejected')
            return e.approvalStatus === 'rejected';
        return true;
    });
    const pendingCount = entries.filter(e => e.approvalStatus === 'pending_l1' || e.approvalStatus === 'pending_l2').length;
    const pendingL1Count = entries.filter(e => e.approvalStatus === 'pending_l1').length;
    const pendingL2Count = entries.filter(e => e.approvalStatus === 'pending_l2').length;
    const approvedCount = entries.filter(e => e.approvalStatus === 'approved').length;
    const rejectedCount = entries.filter(e => e.approvalStatus === 'rejected').length;
    const totalCount = entries.length;
    const approvedRate = totalCount ? Math.round((approvedCount / totalCount) * 100) : 0;
    const activeQueueCount = canApproveL2 ? pendingL2Count : pendingL1Count;
    const reviewScope = canApproveL2 ? 'EHS / Admin' : `Quản lý ${user?.departmentCode ?? ''}`.trim();
    const roleGuide = canApproveL2
        ? 'Kiểm tra phiếu đã qua quản lý, đối chiếu mục tiêu và khóa kết quả cấp EHS cho toàn nhà máy.'
        : 'Kiểm tra dữ liệu bộ phận, đẩy phiếu đạt sang EHS và ghi rõ lý do khi cần trả về người nhập.';
    const approvalStats = [
        { key: 'pending_l1', label: 'Chờ QL', hint: 'Cấp 1', value: pendingL1Count, color: '#f9a825', Icon: UserCheck },
        { key: 'pending_l2', label: 'Chờ EHS', hint: 'Cấp 2', value: pendingL2Count, color: '#1565c0', Icon: ShieldCheck },
        { key: 'approved', label: 'APPROVED', hint: `${approvedRate}% đã khóa`, value: approvedCount, color: '#22a050', Icon: CheckCircle2 },
        { key: 'rejected', label: 'REJECTED', hint: 'Cần lý do rõ', value: rejectedCount, color: '#e53935', Icon: XCircle },
    ];
    const selectedEntry = entries.find(e => e.id === selectedId);
    React.useEffect(() => {
        if (!initialLoaded)
            return;
        if (filtered.length === 0) {
            if (selectedId)
                setSelectedId(null);
            return;
        }
        if (selectedId && filtered.some(entry => entry.id === selectedId))
            return;
        const nextId = filtered[0].id;
        setSelectedId(nextId);
        void loadHistory(nextId);
    }, [entries, filterStatus, initialLoaded, selectedId]);
    if (!user)
        return <SafetyI18nRender>{null}</SafetyI18nRender>;
    if (user.role !== 'quanly' && user.role !== 'ehs' && user.role !== 'admin') {
        return <SafetyI18nRender>{(<div className="safety-approval-noaccess max-w-2xl mx-auto mt-20 text-center">
        <Lock className="mx-auto mb-4 h-10 w-10 text-muted-foreground"/>
        <div className="font-bold text-lg mb-2">Không có quyền truy cập</div>
        <div className="text-sm text-muted-foreground">Trang này dành cho Quản lý bộ phận, EHS và Quản trị</div>
      </div>)}</SafetyI18nRender>;
    }
    return <SafetyI18nRender>{(<div className="safety-approval-page max-w-7xl mx-auto space-y-6 pb-10">
      {rejectTarget && (<RejectModal onConfirm={reason => handleReject(rejectTarget, reason)} onCancel={() => setRejectTarget(null)}/>)}

      {/* Header */}
      <div className="safety-approval-hero bg-card border border-border rounded-xl p-5 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#22a050]/10 flex items-center justify-center text-[#22a050]">
            <CheckCircle2 className="h-5 w-5"/>
          </div>
          <div>
            <div className="text-sm font-bold tracking-normal text-[#22a050] flex items-center gap-2">
              Luồng phê duyệt
              {pendingCount > 0 && (<span className="px-2 py-0.5 rounded text-xs font-bold bg-[#e53935] text-white">{pendingCount} chờ</span>)}
            </div>
            <p className="text-xs text-muted-foreground">
              {canApproveL2 ? 'EHS/Quản trị - xem và duyệt tất cả bộ phận' : `Quản lý - ${user.departmentCode}`}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => { setActionError(''); loadEntries(); }} className="safety-approval-refresh-btn gap-2 text-sm">
          <RefreshCw className="w-4 h-4"/> Làm mới
        </Button>
      </div>

      {actionError && (<div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>
          <span>{actionError}</span>
        </div>)}

      <div className="safety-approval-command">
        <div className="safety-approval-command-main">
          <div className="safety-approval-eyebrow">
            <Layers3 className="h-4 w-4"/>
            Bàn điều phối KPI
          </div>
          <h2>{reviewScope} đang xử lý {totalCount} phiếu KPI</h2>
          <p>{roleGuide}</p>
          <div className="safety-approval-flow">
            <span><ClipboardCheck className="h-4 w-4"/> Bộ phận nộp</span>
            <ArrowRight className="h-4 w-4"/>
            <span><UserCheck className="h-4 w-4"/> QL duyệt</span>
            <ArrowRight className="h-4 w-4"/>
            <span><ShieldCheck className="h-4 w-4"/> EHS khóa</span>
          </div>
        </div>
        <div className="safety-approval-command-metrics">
          <div className="safety-approval-command-metric urgent">
            <FileClock className="h-5 w-5"/>
            <strong>{activeQueueCount}</strong>
            <span>{canApproveL2 ? 'Cần EHS quyết định' : 'Cần QL quyết định'}</span>
          </div>
          <div className="safety-approval-command-metric">
            <TrendingUp className="h-5 w-5"/>
            <strong>{approvedRate}%</strong>
            <span>Tỷ lệ đã duyệt</span>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="safety-approval-stat-grid grid grid-cols-4 gap-3">
        {approvalStats.map(s => {
            const StatIcon = s.Icon;
            return (<div key={s.key} className="safety-approval-stat-card bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="safety-approval-stat-head">
              <span className="safety-approval-stat-label">{s.label}</span>
              <span className="safety-approval-stat-icon" style={{ color: s.color, background: `${s.color}14` }}>
                <StatIcon className="h-4 w-4"/>
              </span>
            </div>
            <div className="safety-approval-stat-value font-mono" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className="safety-approval-stat-hint">{s.hint}</div>
          </div>);
        })}
      </div>

      <div className="safety-approval-workspace grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* List */}
        <div>
          {/* Filter tabs */}
          <div aria-label="Bộ lọc duyệt KPI" className="safety-approval-tabs flex gap-2 mb-4" role="tablist">
            {[
            { value: 'pending', label: `Chờ duyệt (${pendingCount})` },
            { value: 'approved', label: 'APPROVED' },
            { value: 'rejected', label: 'REJECTED' },
            { value: 'all', label: 'Tất cả' },
        ].map(opt => (<button aria-controls="approval-kpi-list-panel" aria-selected={filterStatus === opt.value} key={opt.value} id={`approval-kpi-tab-${opt.value}`} onClick={() => setFilterStatus(opt.value)} role="tab" className={`safety-approval-tab px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterStatus === opt.value ? 'active bg-foreground text-background' : 'border border-border hover:bg-muted'}`} type="button">
                {opt.label}
              </button>))}
          </div>

          {/* Bulk action bar */}
          {filterStatus === 'pending' && filtered.length > 0 && (canApproveL1 || canApproveL2) && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <button
                type="button"
                onClick={(e) => toggleSelectAll(filtered.filter(en => (canApproveL1 && en.approvalStatus === 'pending_l1') || (canApproveL2 && en.approvalStatus === 'pending_l2')).map(en => en.id), e)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {filtered.filter(en => (canApproveL1 && en.approvalStatus === 'pending_l1') || (canApproveL2 && en.approvalStatus === 'pending_l2')).every(en => bulkSelected.has(en.id)) && bulkSelected.size > 0
                  ? <CheckSquare className="h-3.5 w-3.5 text-[#1565c0]" />
                  : <Square className="h-3.5 w-3.5" />}
                Chọn tất cả
              </button>
              {bulkSelected.size > 0 && (
                <button
                  type="button"
                  disabled={bulkApproving}
                  onClick={handleBulkApprove}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22a050] text-white text-xs font-bold hover:bg-[#1a7a40] disabled:opacity-60 transition-colors"
                >
                  <Zap className="h-3.5 w-3.5" />
                  {bulkApproving ? 'Đang duyệt...' : `Duyệt ${bulkSelected.size} phiếu`}
                </button>
              )}
            </div>
          )}

          {/* Entry list */}
          <div aria-labelledby={`approval-kpi-tab-${filterStatus}`} className="safety-approval-list space-y-2" id="approval-kpi-list-panel" role="tabpanel">
            {!initialLoaded && loading ? (<div className="text-center py-12 text-sm text-muted-foreground">Đang tải...</div>) : filtered.length === 0 ? (<div className="safety-approval-empty rounded-xl border border-dashed border-border bg-card px-5 py-10 text-center shadow-sm">
                <Inbox className="mx-auto mb-3 h-9 w-9 text-muted-foreground"/>
                <div className="text-sm font-bold text-foreground">
                  {filterStatus === 'pending' ? 'Không còn dữ liệu chờ duyệt' : 'Không có dữ liệu phù hợp'}
                </div>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
                  {filterStatus === 'pending' && entries.length
                ? 'Quy trình hiện tại đã sạch pending. Bạn vẫn có thể mở dữ liệu đã duyệt hoặc toàn bộ lịch sử để đối chiếu.'
                : 'Thử đổi bộ lọc hoặc bấm làm mới để tải lại dữ liệu KPI.'}
                </p>
                {filterStatus === 'pending' && entries.length ? (<div className="mt-4 flex flex-wrap justify-center gap-2">
                    {approvedCount > 0 ? (<Button className="gap-2 bg-[#22a050] text-white hover:bg-[#1a7a40]" onClick={() => setFilterStatus('approved')}>
                        <CheckCircle2 className="h-4 w-4"/>
                        Xem {approvedCount} đã duyệt
                      </Button>) : null}
                    <Button variant="outline" className="gap-2" onClick={() => setFilterStatus('all')}>
                      <BarChart2 className="h-4 w-4"/>
                      Xem tất cả {entries.length}
                    </Button>
                  </div>) : null}
              </div>) : filtered.map(entry => {
            const et = ENTRY_TYPES[entry.entryType];
            const EntryIcon = entryTypeIconFor(entry.entryType);
            const st = STATUS_MAP[entry.approvalStatus];
            const isSelected = selectedId === entry.id;
            const canAct = (canApproveL1 && entry.approvalStatus === 'pending_l1') ||
                (canApproveL2 && entry.approvalStatus === 'pending_l2');
            const targetText = entry.target ? `Mục tiêu ${entry.target}${entry.unit ? ` ${entry.unit}` : ''}` : 'Chưa đặt mục tiêu';
            const submittedAt = formatApprovalTimestamp(entry.createdAt);
            const deptLabel = entry.divisionCode ? `${entry.departmentCode} · ${entry.divisionCode}` : entry.departmentCode;
            const isBulkChecked = bulkSelected.has(entry.id);
            return (<div key={entry.id} className="relative">
                  {canAct && filterStatus === 'pending' && (
                    <button
                      type="button"
                      onClick={(e) => toggleBulkSelect(entry.id, e)}
                      className="absolute left-3 top-3 z-10 p-0.5 text-muted-foreground hover:text-[#1565c0] transition-colors"
                      title={isBulkChecked ? 'Bỏ chọn' : 'Chọn để duyệt hàng loạt'}
                    >
                      {isBulkChecked ? <CheckSquare className="h-4 w-4 text-[#1565c0]" /> : <Square className="h-4 w-4" />}
                    </button>
                  )}
                  <button onClick={() => selectEntry(entry.id)} aria-current={isSelected ? 'true' : undefined} className={`safety-approval-list-card w-full bg-card border rounded-xl p-4 shadow-sm cursor-pointer transition-all hover:shadow-md ${isBulkChecked ? 'border-[#1565c0] ring-1 ring-[#1565c0]/30 bg-[#1565c0]/5' : isSelected ? 'active border-[#1565c0] ring-1 ring-[#1565c0]/30' : 'border-border'} ${canAct && filterStatus === 'pending' ? 'pl-9' : ''}`} type="button">
                    <div className="safety-approval-list-top">
                      <div className="safety-approval-list-title">
                        <span className="safety-approval-list-icon">
                          <EntryIcon className="h-4 w-4"/>
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">{et?.label ?? entry.entryType}</div>
                          <div className="text-xs text-muted-foreground font-mono">{entry.code} · {entry.period}</div>
                        </div>
                      </div>
                      <div className="safety-approval-list-value">
                        <strong>{entry.value}</strong>
                        <span>{entry.unit}</span>
                        <em style={{ color: st?.color, background: `${st?.color}15` }}>{st?.label}</em>
                      </div>
                    </div>
                    <div className="safety-approval-list-meta">
                      <span>{deptLabel}</span>
                      <span>{entry.submittedByName}</span>
                      <span>{targetText}</span>
                    </div>
                    <div className="safety-approval-list-foot">
                      <span>Gửi lúc {submittedAt}</span>
                      {canAct && (<span className="inline-flex items-center gap-1.5 text-[#e53935] font-bold animate-pulse">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#e53935]"/>
                          Cần duyệt
                        </span>)}
                    </div>
                  </button>
                </div>);
        })}
          </div>
        </div>

        {/* Detail panel */}
        <div>
          {selectedEntry ? (<EntryDetail entry={selectedEntry} history={historyMap[selectedEntry.id] ?? []} onApprove={() => handleApprove(selectedEntry.id)} onReject={() => setRejectTarget(selectedEntry.id)} canApproveL1={canApproveL1} canApproveL2={canApproveL2}/>) : (<div className="safety-approval-detail-empty bg-card border border-border rounded-xl shadow-sm p-12 text-center">
              <Clock className="mx-auto mb-3 h-9 w-9 text-muted-foreground"/>
              <div className="text-sm font-bold text-foreground">
                {filtered.length === 0 && filterStatus === 'pending' ? 'Không có phiếu KPI cần duyệt' : 'Chọn một mục để xem chi tiết'}
              </div>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
                {filtered.length === 0 && filterStatus === 'pending'
                ? 'Danh sách chờ duyệt đang trống. Mở dữ liệu đã duyệt để kiểm tra lịch sử và trạng thái KPI.'
                : 'Panel này hiển thị giá trị, mục tiêu, ghi chú và lịch sử phê duyệt của bản ghi được chọn.'}
              </p>
              {filtered.length === 0 && filterStatus === 'pending' && entries.length ? (<div className="mt-4 flex flex-wrap justify-center gap-2">
                  {approvedCount > 0 ? (<Button className="gap-2 bg-[#22a050] text-white hover:bg-[#1a7a40]" onClick={() => setFilterStatus('approved')}>
                      <CheckCircle2 className="h-4 w-4"/>
                      Xem đã duyệt
                    </Button>) : null}
                  <Button variant="outline" className="gap-2" onClick={() => setFilterStatus('all')}>
                    <BarChart2 className="h-4 w-4"/>
                    Tất cả KPI
                  </Button>
                </div>) : null}
            </div>)}
        </div>
      </div>
    </div>)}</SafetyI18nRender>;
}
