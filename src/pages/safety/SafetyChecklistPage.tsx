import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, Check, CheckCircle2, ClipboardCheck, Loader2, Lock, RotateCcw, Save, ShieldCheck, UserCheck, X } from 'lucide-react';
import { DEPARTMENTS, sampleArray } from './safety-sample-adapter';
import { SafetyI18nRender } from "./safety-i18n-render";
type ChecklistStatus = 'pending' | 'pass' | 'repair' | 'replace' | 'day_off' | 'not_applicable';
type SafetyUser = {
    departmentId?: string | null;
    displayName?: string | null;
    role?: string | null;
    username?: string | null;
};
interface TemplateItem {
    id: number;
    category: string;
    item: string;
}
interface CheckItem extends TemplateItem {
    checked: boolean;
    status: ChecklistStatus;
}
type ResultOption = {
    code: ChecklistStatus;
    label: string;
    shortLabel: string;
    symbol: string;
    checked: boolean;
    excludedFromScore: boolean;
};
type DeptPct = {
    checked: number;
    total: number;
};
const FALLBACK_TEMPLATE = {
    id: 'ehs-qt-12-bieu-1-daily-6s',
    code: 'EHS-QT-12',
    title: 'Biểu kiểm tra 6S hàng ngày',
    revisedDate: '2026-03-18',
    items: [
        {
            id: 1,
            category: '6S hàng ngày - cấp bộ phận',
            item: 'Vật dụng, tài liệu, dụng cụ... được sắp xếp đúng vị trí đã quy định và có hiển thị rõ ràng để nhận biết.',
        },
        {
            id: 2,
            category: '6S hàng ngày - cấp bộ phận',
            item: 'Các vị trí đã được dán băng dính nền theo đúng tiêu chuẩn băng dính dán nền và không bị bong chóc, không rách...',
        },
        {
            id: 3,
            category: '6S hàng ngày - cấp bộ phận',
            item: 'Các khu vực làm việc như nền nhà, lối đi, giá kệ... sạch sẽ và không có bụi bẩn.',
        },
        {
            id: 4,
            category: '6S hàng ngày - cấp bộ phận',
            item: 'Các khu vực để chất thải, thùng rác, dụng cụ vệ sinh gọn gàng và được phân loại đúng quy định.',
        },
        {
            id: 5,
            category: '6S hàng ngày - cấp bộ phận',
            item: 'Các mục chỉ ra về 6S khi kiểm tra hàng ngày tại bộ phận được khắc phục nhanh chóng.',
        },
    ] satisfies TemplateItem[],
};
const RESULT_OPTIONS: ResultOption[] = [
    { code: 'pending', label: 'Chưa nhập', shortLabel: 'Chờ', symbol: '...', checked: false, excludedFromScore: true },
    { code: 'pass', label: 'Đạt', shortLabel: 'Đạt', symbol: 'O', checked: true, excludedFromScore: false },
    { code: 'repair', label: 'Sửa chữa', shortLabel: 'Sửa', symbol: '△', checked: false, excludedFromScore: false },
    { code: 'replace', label: 'Thay thế', shortLabel: 'Thay', symbol: '×', checked: false, excludedFromScore: false },
    { code: 'day_off', label: 'Ngày nghỉ', shortLabel: 'Nghỉ', symbol: '/', checked: false, excludedFromScore: true },
    { code: 'not_applicable', label: 'Không thực hiện', shortLabel: 'KTH', symbol: '-', checked: false, excludedFromScore: true },
];
const STATUS_COLORS: Record<ChecklistStatus, string> = {
    pending: '#64748b',
    pass: '#22a050',
    repair: '#f9a825',
    replace: '#e53935',
    day_off: '#1565c0',
    not_applicable: '#475569',
};
const catColors: Record<string, string> = {
    '6S hàng ngày - cấp bộ phận': '#1565c0',
};
const knownStatuses = new Set<ChecklistStatus>(RESULT_OPTIONS.map(option => option.code));
const excludedStatuses = new Set<ChecklistStatus>(RESULT_OPTIONS.filter(option => option.excludedFromScore).map(option => option.code));
const fullAccessRoles = new Set(['admin', 'ehs']);
function currentDateInput(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function formatDateLabel(value: string): string {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day)
        return value;
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}
function monthPeriod(dateValue: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue.slice(0, 7) : currentDateInput().slice(0, 7);
}
function normalizeStatus(value: unknown, checked?: boolean): ChecklistStatus {
    const status = String(value || '').trim() as ChecklistStatus;
    if (knownStatuses.has(status))
        return status;
    return checked ? 'pass' : 'pending';
}
function normalizeTemplateItems(items: TemplateItem[]): TemplateItem[] {
    return items
        .map((item, index) => ({
        id: Number(item.id || index + 1),
        category: String(item.category || '6S hàng ngày - cấp bộ phận'),
        item: String(item.item || '').trim(),
    }))
        .filter(item => item.id > 0 && item.item);
}
function buildEmptyItems(templateItems: TemplateItem[]): CheckItem[] {
    return templateItems.map(item => ({ ...item, checked: false, status: 'pending' }));
}
function authHeaders(): Record<string, string> {
    const tk = localStorage.getItem('mhc_session_token');
    return tk ? { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}
function canSeeAll(user: SafetyUser | null): boolean {
    return fullAccessRoles.has(String(user?.role || '').trim());
}
export function SafetyChecklistPage() {
    const [selectedDate, setSelectedDate] = useState(currentDateInput());
    const summaryPeriod = monthPeriod(selectedDate);
    const [activeDept, setActiveDept] = useState(DEPARTMENTS[0]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState<SafetyUser | null>(null);
    const [userLoaded, setUserLoaded] = useState(false);
    const [templateId, setTemplateId] = useState(FALLBACK_TEMPLATE.id);
    const [templateCode, setTemplateCode] = useState(FALLBACK_TEMPLATE.code);
    const [templateItems, setTemplateItems] = useState<TemplateItem[]>(FALLBACK_TEMPLATE.items);
    const [items, setItems] = useState<CheckItem[]>(buildEmptyItems(FALLBACK_TEMPLATE.items));
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
    const [deptPcts, setDeptPcts] = useState<Record<string, DeptPct>>({});
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasFullAccess = canSeeAll(currentUser);
    const assignedDept = String(currentUser?.departmentId || '').trim();
    const canAccessDept = useCallback((dept: string) => {
        if (!userLoaded)
            return false;
        if (hasFullAccess)
            return true;
        return Boolean(assignedDept) && assignedDept === dept;
    }, [assignedDept, hasFullAccess, userLoaded]);
    const loadCurrentUser = useCallback(async () => {
        try {
            const res = await fetch('/api/auth/me', { headers: authHeaders() });
            if (!res.ok)
                throw new Error('me failed');
            const payload = await res.json();
            setCurrentUser(payload?.data?.user || null);
        }
        catch {
            setCurrentUser(null);
        }
        finally {
            setUserLoaded(true);
        }
    }, []);
    const loadTemplate = useCallback(async () => {
        try {
            const res = await fetch('/api/checklists/template', { headers: authHeaders() });
            if (!res.ok)
                throw new Error('template failed');
            const payload = await res.json();
            const daily = payload?.dailyDepartmentChecklist || {};
            const nextItems = normalizeTemplateItems(sampleArray<TemplateItem>(daily.items));
            if (!nextItems.length)
                return;
            setTemplateId(String(daily.id || FALLBACK_TEMPLATE.id));
            setTemplateCode(String(daily.code || FALLBACK_TEMPLATE.code));
            setTemplateItems(nextItems);
            setItems(buildEmptyItems(nextItems));
        }
        catch {
            setTemplateId(FALLBACK_TEMPLATE.id);
            setTemplateCode(FALLBACK_TEMPLATE.code);
            setTemplateItems(FALLBACK_TEMPLATE.items);
        }
    }, []);
    const loadDeptChecklist = useCallback(async (dept: string, dateValue: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/checklists?dept=${encodeURIComponent(dept)}&period=${dateValue}`, {
                headers: authHeaders(),
            });
            if (!res.ok)
                throw new Error('fetch failed');
            const rows = sampleArray<{
                itemId?: number;
                item_id?: number;
                checked?: boolean;
                resultStatus?: string;
                status?: string;
            }>(await res.json());
            const rowMap = new Map(rows.map(row => [Number(row.itemId ?? row.item_id), row]));
            setItems(buildEmptyItems(templateItems).map(item => {
                const row = rowMap.get(item.id);
                const status = normalizeStatus(row?.resultStatus ?? row?.status, row?.checked);
                return { ...item, checked: status === 'pass', status };
            }));
        }
        catch {
            setItems(buildEmptyItems(templateItems));
            setSaveStatus('error');
        }
        finally {
            setLoading(false);
        }
    }, [templateItems]);
    const loadAllSummary = useCallback(async () => {
        try {
            const res = await fetch(`/api/checklists/summary?period=${summaryPeriod}`, { headers: authHeaders() });
            if (!res.ok)
                return;
            const rows = sampleArray<{
                checked?: number;
                checkedCount?: number;
                departmentCode?: string;
                department_code?: string;
                total?: number;
                totalCount?: number;
            }>(await res.json());
            const map: Record<string, DeptPct> = {};
            for (const row of rows) {
                const departmentCode = row.departmentCode ?? row.department_code;
                if (!departmentCode)
                    continue;
                map[departmentCode] = {
                    checked: Number(row.checkedCount ?? row.checked ?? 0),
                    total: Number(row.totalCount ?? row.total ?? 0),
                };
            }
            setDeptPcts(map);
        }
        catch {
            // Summary is non-blocking for daily entry.
        }
    }, [summaryPeriod]);
    useEffect(() => {
        loadCurrentUser();
        loadTemplate();
    }, [loadCurrentUser, loadTemplate]);
    useEffect(() => {
        loadAllSummary();
    }, [loadAllSummary]);
    useEffect(() => {
        if (!isModalOpen)
            return;
        loadDeptChecklist(activeDept, selectedDate);
    }, [activeDept, selectedDate, isModalOpen, loadDeptChecklist]);
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                setIsModalOpen(false);
        };
        if (isModalOpen)
            window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isModalOpen]);
    useEffect(() => {
        if (!isModalOpen)
            return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isModalOpen]);
    useEffect(() => {
        return () => {
            if (saveTimer.current)
                clearTimeout(saveTimer.current);
        };
    }, []);
    const saveItems = useCallback(async (currentItems: CheckItem[], dept: string, dateValue: string) => {
        setSaving(true);
        try {
            const res = await fetch('/api/checklists', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    departmentCode: dept,
                    period: dateValue,
                    templateId,
                    items: currentItems.map(item => ({
                        itemId: item.id,
                        checked: item.status === 'pass',
                        status: item.status,
                    })),
                }),
            });
            if (!res.ok)
                throw new Error('save failed');
            setSaveStatus('saved');
            loadAllSummary();
        }
        catch {
            setSaveStatus('error');
        }
        finally {
            setSaving(false);
            setTimeout(() => setSaveStatus('idle'), 2500);
        }
    }, [templateId, loadAllSummary]);
    const queueSave = useCallback((nextItems: CheckItem[]) => {
        if (saveTimer.current)
            clearTimeout(saveTimer.current);
        const dept = activeDept;
        const dateValue = selectedDate;
        saveTimer.current = setTimeout(() => saveItems(nextItems, dept, dateValue), 500);
    }, [activeDept, selectedDate, saveItems]);
    function openChecklist(dept: string) {
        if (!canAccessDept(dept))
            return;
        setActiveDept(dept);
        setSaveStatus('idle');
        setIsModalOpen(true);
    }
    function setItemStatus(id: number, status: ChecklistStatus) {
        setItems(prev => {
            const next = prev.map(item => {
                if (item.id !== id)
                    return item;
                const nextStatus = item.status === status ? 'pending' : status;
                return { ...item, status: nextStatus, checked: nextStatus === 'pass' };
            });
            queueSave(next);
            return next;
        });
        setSaveStatus('idle');
    }
    function checkAll() {
        setItems(prev => {
            const next = prev.map(item => ({ ...item, status: 'pass' as ChecklistStatus, checked: true }));
            queueSave(next);
            return next;
        });
    }
    function uncheckAll() {
        setItems(prev => {
            const next = prev.map(item => ({ ...item, status: 'pending' as ChecklistStatus, checked: false }));
            queueSave(next);
            return next;
        });
    }
    const checked = items.filter(item => item.status === 'pass').length;
    const completed = items.filter(item => item.status !== 'pending').length;
    const applicable = items.filter(item => !excludedStatuses.has(item.status)).length || items.length;
    const total = items.length;
    const pct = applicable ? Math.round((checked / applicable) * 100) : 0;
    const pctColor = pct >= 85 ? '#22a050' : pct >= 60 ? '#f9a825' : '#e53935';
    const categories = useMemo(() => Array.from(new Set(items.map(item => item.category))), [items]);
    const issueCount = items.filter(item => item.status === 'repair' || item.status === 'replace').length;
    const skippedCount = items.filter(item => item.status === 'day_off' || item.status === 'not_applicable').length;
    const pendingCount = items.filter(item => item.status === 'pending').length;
    const completionPct = total ? Math.round((completed / total) * 100) : 0;
    const remainingCount = Math.max(total - completed, 0);
    const operatorName = currentUser?.displayName || currentUser?.username || 'Tài khoản hiện tại';
    const permissionLabel = hasFullAccess ? 'EHS/Admin toàn quyền' : assignedDept ? `Chỉ ${assignedDept}` : 'Chưa gán bộ phận';
    const inspectionStateTone = loading ? '#64748b' : pendingCount > 0 ? '#f9a825' : issueCount > 0 ? '#e53935' : pct >= 85 ? '#22a050' : '#f9a825';
    const inspectionStateLabel = loading ? 'Đang tải' : pendingCount > 0 ? 'Còn mục chưa nhập' : issueCount > 0 ? 'Có điểm cần xử lý' : pct >= 85 ? 'Đạt yêu cầu' : 'Cần cải thiện';
    const inspectionStateMessage = loading
        ? 'Đang lấy dữ liệu checklist của bộ phận.'
        : pendingCount > 0
            ? `Còn ${remainingCount} mục cần nhập trước khi chốt phiên kiểm tra.`
            : issueCount > 0
                ? `${issueCount} mục cần sửa chữa hoặc thay thế, nên tạo hành động khắc phục sau khi lưu.`
                : 'Phiên kiểm tra đã nhập đủ, có thể đóng bảng hoặc chuyển ngày khác.';
    const inspectionMeta = [
        {
            key: 'department',
            icon: <ClipboardCheck className="h-4 w-4"/>,
            label: 'Bộ phận',
            value: activeDept,
            helper: `${formatDateLabel(selectedDate)} · ${templateCode}`,
        },
        {
            key: 'operator',
            icon: <UserCheck className="h-4 w-4"/>,
            label: 'Người nhập',
            value: operatorName,
            helper: currentUser?.role ? `Vai trò ${currentUser.role}` : 'Phiên đăng nhập hiện tại',
        },
        {
            key: 'permission',
            icon: <ShieldCheck className="h-4 w-4"/>,
            label: 'Phân quyền',
            value: permissionLabel,
            helper: hasFullAccess ? 'Có thể kiểm tra mọi bộ phận' : 'Không ghi chồng bộ phận khác',
        },
    ];
    const statusCards = [
        { key: 'pass', label: 'Đạt', value: checked, tone: '#22a050' },
        { key: 'issue', label: 'Cần xử lý', value: issueCount, tone: '#e53935' },
        { key: 'pending', label: 'Chờ nhập', value: pendingCount, tone: '#64748b' },
        { key: 'skip', label: 'Ngoại lệ', value: skippedCount, tone: '#1565c0' },
    ];
    function getDeptPct(dept: string): number {
        const data = deptPcts[dept];
        if (!data || data.total === 0)
            return 0;
        return Math.round((data.checked / data.total) * 100);
    }
    const deptScoreRows = DEPARTMENTS.map(dept => {
        const data = deptPcts[dept];
        const totalItems = data?.total ?? 0;
        const checkedItems = data?.checked ?? 0;
        const score = totalItems ? Math.round((checkedItems / totalItems) * 100) : 0;
        return { dept, totalItems, checkedItems, score };
    });
    const deptWithData = deptScoreRows.filter(row => row.totalItems > 0).length;
    const deptGood = deptScoreRows.filter(row => row.totalItems > 0 && row.score >= 85).length;
    const deptAttention = deptScoreRows.filter(row => row.totalItems > 0 && row.score < 85).length;
    const deptNoData = Math.max(DEPARTMENTS.length - deptWithData, 0);
    const averageScore = deptWithData
        ? Math.round(deptScoreRows.filter(row => row.totalItems > 0).reduce((sum, row) => sum + row.score, 0) / deptWithData)
        : 0;
    const bestDept = deptScoreRows.filter(row => row.totalItems > 0).sort((a, b) => b.score - a.score)[0];
    const pageSummaryCards = [
        { key: 'coverage', label: 'Đã có dữ liệu', value: `${deptWithData}/${DEPARTMENTS.length}`, helper: `${deptNoData} bộ phận chưa nhập`, tone: '#1565c0', icon: <ClipboardCheck className="h-4 w-4"/> },
        { key: 'average', label: 'Điểm trung bình', value: deptWithData ? `${averageScore}%` : '-', helper: bestDept ? `Cao nhất: ${bestDept.dept} ${bestDept.score}%` : 'Chưa có điểm tháng này', tone: averageScore >= 85 ? '#22a050' : averageScore >= 60 ? '#f9a825' : '#e53935', icon: <ShieldCheck className="h-4 w-4"/> },
        { key: 'passed', label: 'Đạt chuẩn', value: deptGood, helper: 'Mục tiêu >= 85%', tone: '#22a050', icon: <CheckCircle2 className="h-4 w-4"/> },
        { key: 'attention', label: 'Cần theo dõi', value: deptAttention, helper: 'Có dữ liệu nhưng dưới chuẩn', tone: '#f9a825', icon: <AlertTriangle className="h-4 w-4"/> },
    ];
    const monthLabel = (() => {
        const [year, month] = summaryPeriod.split('-');
        return `Tháng ${Number(month)}/${year}`;
    })();
    return <SafetyI18nRender>{(<div className="safety-checklist-page space-y-5 max-w-7xl mx-auto pb-10">
      <div className="safety-checklist-page-head">
        <div>
          <h3 className="safety-checklist-page-title">Checklist 6S bộ phận</h3>
          <p className="safety-checklist-overview-title">
            Tổng quan {DEPARTMENTS.length} bộ phận - {monthLabel}
          </p>
        </div>
        <label className="safety-checklist-page-date inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4"/>
          <input aria-label="Ngay checklist 6S" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value || currentDateInput())} data-testid="checklist-date-input"/>
        </label>
      </div>

      <div className="safety-checklist-command">
        <div className="safety-checklist-command-copy">
          <span>Ngày kiểm tra</span>
          <strong>{formatDateLabel(selectedDate)}</strong>
          <p>Chọn bộ phận để mở bảng EHS-QT-12, nhập kết quả theo từng mục và tự lưu vào dữ liệu checklist nội bộ.</p>
        </div>
        <div className="safety-checklist-command-stats">
          {pageSummaryCards.map(card => (<div className="safety-checklist-command-card" key={card.key} style={{ borderTopColor: card.tone }}>
              <span className="safety-checklist-command-icon" style={{ color: card.tone, background: `${card.tone}12`, borderColor: `${card.tone}28` }}>
                {card.icon}
              </span>
              <div>
                <small>{card.label}</small>
                <strong style={{ color: card.tone }}>{card.value}</strong>
                <em>{card.helper}</em>
              </div>
            </div>))}
        </div>
      </div>

      <div className="safety-checklist-overview">
        <div className="safety-checklist-dept-grid grid grid-cols-3 md:grid-cols-5 gap-2" role="group" aria-label="Chọn bộ phận checklist 6S">
          {DEPARTMENTS.map(dept => {
            const score = getDeptPct(dept);
            const color = score >= 85 ? '#22a050' : score >= 60 ? '#f9a825' : '#e53935';
            const hasData = !!deptPcts[dept]?.total;
            const allowed = canAccessDept(dept);
            const deptTotal = deptPcts[dept]?.total ?? 0;
            const deptChecked = deptPcts[dept]?.checked ?? 0;
            const deptStateLabel = !hasData ? 'Chưa có dữ liệu' : score >= 85 ? 'Đạt chuẩn' : score >= 60 ? 'Cần theo dõi' : 'Cần xử lý';
            return (<button key={dept} type="button" disabled={!allowed} aria-disabled={!allowed} aria-label={`${dept}: ${allowed ? 'mở checklist' : 'không có quyền checklist bộ phận này'}`} onClick={() => openChecklist(dept)} className={`safety-checklist-dept-card ${allowed ? 'can-open' : 'locked'} rounded-lg p-3 text-left border transition-all`} data-testid={`dept-tab-${dept}`}>
                <div className="safety-checklist-dept-card-top">
                  <div className="safety-checklist-dept-name text-xs font-semibold truncate">{dept}</div>
                  {!allowed && <Lock className="safety-checklist-dept-lock h-3.5 w-3.5" aria-hidden="true"/>}
                </div>
                <div className="safety-checklist-dept-score text-lg font-bold font-mono" style={{ color: hasData ? color : '#94a3b8' }}>
                  {hasData ? `${score}%` : '-'}
                </div>
                <div className="safety-checklist-dept-track mt-1 h-1 w-full bg-muted rounded-full overflow-hidden">
                  {hasData && <div className="safety-checklist-dept-fill h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }}/>}
                </div>
                <div className="safety-checklist-dept-meta">
                  <span>{hasData ? `${deptChecked}/${deptTotal} mục đạt` : 'Chưa nhập hôm nay'}</span>
                  <strong style={{ color: hasData ? color : '#64748b' }}>{deptStateLabel}</strong>
                </div>
                <div className={`safety-checklist-dept-badge ${allowed ? 'open' : 'locked'}`}>
                  {allowed ? 'Mở bảng' : 'Khóa'}
                </div>
              </button>);
        })}
        </div>
      </div>

      {isModalOpen && (<div className="safety-checklist-modal-backdrop" role="presentation" onMouseDown={(event) => {
                if (event.target === event.currentTarget)
                    setIsModalOpen(false);
            }}>
          <section aria-labelledby="safety-checklist-modal-title" aria-modal="true" className="safety-checklist-modal" role="dialog">
            <div className="safety-checklist-modal-head">
              <div className="safety-checklist-modal-title-wrap">
                <span className="safety-checklist-modal-eyebrow">{templateCode}</span>
                <h2 id="safety-checklist-modal-title">Checklist 6S - {activeDept}</h2>
                <p>{formatDateLabel(selectedDate)} · {completed}/{total} mục đã nhập · {checked} đạt</p>
              </div>
              <div className="safety-checklist-modal-head-actions">
                <div className="safety-checklist-modal-score" style={{ borderColor: pctColor }}>
                  <strong style={{ color: pctColor }}>{pct}%</strong>
                  <span>Điểm ngày</span>
                </div>
                <button aria-label="Đóng checklist" className="safety-checklist-close-btn" onClick={() => setIsModalOpen(false)} type="button">
                  <X className="h-5 w-5"/>
                </button>
              </div>
            </div>

            <div className="safety-checklist-modal-body">
              <div className="safety-checklist-board bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="safety-checklist-board-head p-4 border-b border-border bg-muted/30 flex items-center justify-between flex-wrap gap-3">
                  <div className="safety-checklist-board-title">
                    <h3 className="font-bold text-base">{activeDept}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {loading ? 'Đang tải...' : `${formatDateLabel(selectedDate)} · ${completed}/${total} mục đã nhập · ${checked} đạt`}
                    </p>
                    <p className="safety-checklist-template-code text-[11px] font-bold text-muted-foreground mt-1">{templateCode} · Biểu kiểm tra 6S hàng ngày</p>
                  </div>
                  <div className="safety-checklist-board-actions flex items-center gap-4">
                    <label className="safety-checklist-date-control inline-flex items-center gap-2 text-xs font-bold text-muted-foreground">
                      <span>Ngày</span>
                      <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value || currentDateInput())} className="h-9 rounded-lg border border-border bg-card px-2 text-xs font-bold text-foreground outline-none focus:border-[#1565c0]"/>
                    </label>
                    <div className="safety-checklist-score-box flex items-center gap-2">
                      <div className="safety-checklist-score text-2xl font-bold font-mono" style={{ color: loading ? '#94a3b8' : pctColor }}>
                        {loading ? '...' : `${pct}%`}
                      </div>
                      <div className="safety-checklist-score-track w-20 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="safety-checklist-score-fill h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: pctColor }}/>
                      </div>
                    </div>
                    {saveStatus === 'saved' && (<span className="safety-checklist-status saved inline-flex items-center gap-1 text-xs font-bold text-[#22a050]" role="status">
                        <CheckCircle2 className="h-3.5 w-3.5"/> Đã lưu
                      </span>)}
                    {saveStatus === 'error' && (<span className="safety-checklist-status error inline-flex items-center gap-1 text-xs font-bold text-[#e53935]" role="alert">
                        <AlertTriangle className="h-3.5 w-3.5"/> Lỗi lưu
                      </span>)}
                    {saving && saveStatus === 'idle' && (<span className="safety-checklist-status saving text-xs text-muted-foreground" role="status">Đang lưu...</span>)}
                    <div className="safety-checklist-action-group flex gap-2">
                      <button type="button" onClick={checkAll} disabled={loading} className="safety-checklist-action-btn check-all px-3 py-1.5 text-xs font-bold bg-[#22a050] text-white rounded-lg hover:bg-green-700 disabled:opacity-50" data-testid="button-check-all">
                        <CheckCircle2 className="h-3.5 w-3.5"/>
                        Đạt tất cả
                      </button>
                      <button type="button" onClick={uncheckAll} disabled={loading} className="safety-checklist-action-btn clear-all px-3 py-1.5 text-xs font-bold border border-border rounded-lg hover:bg-muted disabled:opacity-50" data-testid="button-clear-all">
                        <RotateCcw className="h-3.5 w-3.5"/>
                        Xóa kết quả
                      </button>
                    </div>
                  </div>
                </div>

                <div className="safety-checklist-inspection-panel">
                  <div className="safety-checklist-inspection-meta">
                    {inspectionMeta.map(card => (<div className="safety-checklist-inspection-card" key={card.key}>
                        <span className="safety-checklist-inspection-icon" style={{ color: pctColor }}>
                          {card.icon}
                        </span>
                        <div>
                          <small>{card.label}</small>
                          <strong>{card.value}</strong>
                          <span>{card.helper}</span>
                        </div>
                      </div>))}
                  </div>
                  <div className="safety-checklist-progress-panel">
                    <div className="safety-checklist-progress-head">
                      <span>Tiến độ nhập liệu</span>
                      <strong style={{ color: inspectionStateTone }}>{completionPct}%</strong>
                    </div>
                    <div className="safety-checklist-progress-track" aria-hidden="true">
                      <div style={{ width: `${completionPct}%`, backgroundColor: inspectionStateTone }}/>
                    </div>
                    <p>
                      <b style={{ color: inspectionStateTone }}>{inspectionStateLabel}</b>
                      <span>{inspectionStateMessage}</span>
                    </p>
                  </div>
                </div>

                <div className="safety-checklist-status-strip" aria-label="Tổng hợp trạng thái checklist">
                  {statusCards.map(card => (<div className="safety-checklist-status-card" key={card.key}>
                      <span style={{ backgroundColor: card.tone }}/>
                      <div>
                        <strong style={{ color: card.tone }}>{card.value}</strong>
                        <small>{card.label}</small>
                      </div>
                    </div>))}
                </div>

                <div className="safety-checklist-result-legend" aria-label="Ký hiệu kết quả checklist">
                  {RESULT_OPTIONS.slice(1).map(option => (<span key={option.code} style={{ borderColor: `${STATUS_COLORS[option.code]}55`, color: STATUS_COLORS[option.code] }}>
                      <b>{option.symbol}</b> {option.label}
                    </span>))}
                </div>

                {loading ? (<div className="safety-checklist-loading py-16 text-center text-muted-foreground text-sm">Đang tải checklist...</div>) : (<div className="safety-checklist-category-list divide-y divide-border">
                    {categories.map(category => {
                    const catItems = items.filter(item => item.category === category);
                    const catChecked = catItems.filter(item => item.status === 'pass').length;
                    const categoryColor = catColors[category] || '#1565c0';
                    return (<div key={category} className="safety-checklist-category">
                          <div className="safety-checklist-category-head px-4 py-2 flex items-center gap-2" style={{ background: `${categoryColor}10` }}>
                            <div className="safety-checklist-category-dot w-2 h-2 rounded-full" style={{ backgroundColor: categoryColor }}/>
                            <span className="safety-checklist-category-name text-xs font-bold" style={{ color: categoryColor }}>{category}</span>
                            <span className="safety-checklist-category-count ml-auto text-xs font-mono text-muted-foreground">{catChecked}/{catItems.length}</span>
                          </div>
                          {catItems.map(item => {
                            const activeOption = RESULT_OPTIONS.find(option => option.code === item.status) || RESULT_OPTIONS[0];
                            return (<div key={item.id} className={`safety-checklist-item-row status-${item.status} grid w-full items-center gap-3 px-4 py-3 text-left md:grid-cols-[minmax(0,1fr)_auto]`} data-testid={`checklist-item-${item.id}`}>
                                <div className="safety-checklist-item-main flex min-w-0 items-start gap-3">
                                  <div className={`safety-checklist-row-marker ${item.status}`}>
                                    {item.status === 'pass' ? <Check className="h-3.5 w-3.5"/> : item.id}
                                  </div>
                                  <div className="min-w-0">
                                    <span className={`safety-checklist-item-text block text-sm ${item.status === 'pass' ? 'checked' : 'text-foreground'}`}>
                                      {item.item}
                                    </span>
                                    <span className="safety-checklist-item-state mt-1 inline-flex text-[11px] font-bold" style={{ color: STATUS_COLORS[activeOption.code] }}>
                                      {activeOption.symbol} {activeOption.label}
                                    </span>
                                  </div>
                                </div>
                                <div className="safety-checklist-result-options flex flex-wrap justify-start gap-1.5 md:justify-end" role="group" aria-label={`Kết quả mục ${item.id}`}>
                                  {RESULT_OPTIONS.map(option => {
                                    const selected = item.status === option.code;
                                    return (<button key={option.code} type="button" aria-pressed={selected} aria-label={`${option.label}: ${item.item}`} onClick={() => setItemStatus(item.id, option.code)} className={`safety-checklist-result-btn inline-flex h-8 min-w-[54px] items-center justify-center gap-1 rounded-lg border px-2 text-[11px] font-black transition-all ${selected ? 'selected bg-white shadow-sm' : 'bg-white/80 hover:bg-white'}`} style={{
                                            borderColor: selected ? STATUS_COLORS[option.code] : 'rgba(203, 214, 231, 0.92)',
                                            color: selected ? STATUS_COLORS[option.code] : '#52657f',
                                        }} data-testid={`checklist-item-${item.id}-${option.code}`}>
                                        <span className="font-mono text-xs">{option.symbol}</span>
                                        <span>{option.shortLabel}</span>
                                      </button>);
                                })}
                                </div>
                              </div>);
                        })}
                        </div>);
                })}
                  </div>)}
              </div>
            </div>

            <div className="safety-checklist-modal-footer">
              <div className="safety-checklist-footer-note">
                <strong style={{ color: inspectionStateTone }}>{inspectionStateLabel}</strong>
                <span>{completed}/{total} mục đã nhập · {formatDateLabel(selectedDate)} · {activeDept}</span>
              </div>
              <button type="button" onClick={() => void saveItems(items, activeDept, selectedDate)} disabled={saving || loading} className="safety-checklist-action-btn save-modal inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#f5c400] px-4 text-sm font-black text-[#0f2a15] shadow-sm hover:bg-[#e0b300] disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>}
                Lưu checklist
              </button>
              <button type="button" onClick={() => setIsModalOpen(false)} className="safety-checklist-action-btn close-modal px-3 py-1.5 text-xs font-bold border border-border rounded-lg hover:bg-muted">
                Đóng
              </button>
            </div>
          </section>
        </div>)}
    </div>)}</SafetyI18nRender>;
}
