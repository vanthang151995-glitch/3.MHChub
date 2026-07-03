import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import "./safety-warnings.css";
import { WarningDetailModal } from './SafetyWarningDetailModal';
import { SafetyWarningCreateModal } from './SafetyWarningCreateModal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, } from 'recharts';
import { useAuth } from '../../auth/AuthContext';
import { useHubLanguage } from '../../i18n-context';
import { localizedText } from '../../i18n-localized';
import type { SafetyUser } from './safety-domain';
import { DEPARTMENTS, canApprove, canSeeAll, canSubmit, sampleArray, toSampleUser } from './safety-sample-adapter';
import { AlertTriangle, Activity, ArrowRight, BarChart3, BookOpen, Building2, Calendar, CalendarClock, ChevronDown, ClipboardList, ClipboardPen, Cog, Crosshair, Download, Eye, Factory, FileX, Filter, Flame, Flag, FlaskConical, Info, Leaf, Lightbulb, ListChecks, MapPin, MapPinned, Paperclip, Plus, Save, Search, Shield, ShieldAlert, ShieldCheck, Upload, UserRound, Users, X, CheckCircle2, XCircle, } from 'lucide-react';
import { SafetyI18nRender } from "./safety-i18n-render";
import { SafetyLocalizedTextField, emptySafetyLocalizedText, safetyLocalizedPayload, safetyLocalizedVi, type SafetyLocalizedText } from "./safety-localized-form";
type LocalizedContent = Record<string, string | undefined>;
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
/* ─── Types ───────────────────────────────────────────── */
type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type WStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'OVERDUE';
type WCategory = 'EQUIPMENT' | 'ENVIRONMENT' | 'HUMAN_BEHAVIOR' | 'FIRE_SAFETY' | 'CHEMICALS' | 'ERGONOMICS';
/* ─── Risk Matrix ─────────────────────────────────────── */
const calcRiskLevel = (prob: number, consequence: number): RiskLevel => {
    const score = prob * consequence;
    if (score >= 15)
        return 'CRITICAL';
    if (score >= 8)
        return 'HIGH';
    if (score >= 4)
        return 'MEDIUM';
    return 'LOW';
};
const calcDeadlineDays = (level: RiskLevel): number => {
    if (level === 'CRITICAL')
        return 1;
    if (level === 'HIGH')
        return 7;
    if (level === 'MEDIUM')
        return 30;
    return 90;
};
function addDays(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}
const RISK_COLORS: Record<RiskLevel, {
    bg: string;
    text: string;
}> = {
    'CRITICAL': { bg: '#7b000018', text: '#ff1744' },
    'HIGH': { bg: '#e5393518', text: '#e53935' },
    'MEDIUM': { bg: '#f9a82518', text: '#f9a825' },
    'LOW': { bg: '#22a05018', text: '#22a050' },
};
const DEFAULT_RISK_COLOR = { bg: '#80808018', text: '#808080' };
const getRiskColor = (level: string) => RISK_COLORS[level as RiskLevel] ?? DEFAULT_RISK_COLOR;
const WSTATUS_COLORS: Record<WStatus, string> = {
    'OPEN': '#1565c0', 'IN_PROGRESS': '#f9a825', 'DONE': '#22a050', 'OVERDUE': '#e53935',
};
/* ─── Categories ──────────────────────────────────────── */
const CATEGORIES: {
    value: WCategory;
    subs: string[];
    standards: string[];
}[] = [
    {
        value: 'EQUIPMENT',
        subs: ['Thiếu che chắn an toàn', 'Máy hỏng đang sử dụng', 'Áp suất vượt ngưỡng', 'Thiếu bảo trì định kỳ', 'Dây điện hở', 'Thiết bị cũ quá hạn thay'],
        standards: ['QCVN 26:2016/BLĐTBXH', 'TCVN 5179:2013', 'IEC 60204-1'],
    },
    {
        value: 'ENVIRONMENT',
        subs: ['Chiếu sáng không đủ', 'Tiếng ồn vượt ngưỡng', 'Nhiệt độ cao', 'Bụi vượt ngưỡng', 'Sàn trơn trượt', 'Lối đi bị chặn', 'Thông gió kém'],
        standards: ['QCVN 26:2016/BLĐTBXH', 'QCVN 24:2016', 'TCVN 3733:2002'],
    },
    {
        value: 'HUMAN_BEHAVIOR',
        subs: ['Không đeo PPE', 'Vi phạm quy trình', 'Làm việc không được phép', 'Chưa được đào tạo', 'Sử dụng điện thoại khi làm việc', 'Không khóa thiết bị trước bảo trì'],
        standards: ['Luật ATVSLĐ 2015', 'QCVN 04:2015/BLĐTBXH'],
    },
    {
        value: 'FIRE_SAFETY',
        subs: ['Bình PCCC hết hạn', 'Lối thoát hiểm bị chặn', 'Biển thoát hiểm hỏng', 'Thiếu bản đồ thoát hiểm', 'Hệ thống báo cháy lỗi', 'Thiếu diễn tập PCCC'],
        standards: ['QCVN 06:2021/BXD', 'TCVN 3890:2009', 'Luật PCCC 2001'],
    },
    {
        value: 'CHEMICALS',
        subs: ['Không có nhãn hóa chất', 'Thiếu SDS/MSDS', 'Bảo quản sai quy định', 'Không có PPE hóa chất', 'Rò rỉ nhỏ chưa xử lý', 'Hóa chất hết hạn'],
        standards: ['QCVN 05:2009/BCT', 'Thông tư 32/2017/TT-BCT', 'GHS/CLP'],
    },
    {
        value: 'ERGONOMICS',
        subs: ['Nâng hàng sai tư thế', 'Ghế làm việc không phù hợp', 'Màn hình quá cao/thấp', 'Đứng liên tục > 4 giờ', 'Rung động máy kéo dài', 'Thao tác lặp lại liên tục'],
        standards: ['ISO 9241', 'TCVN 7303:2003'],
    },
];
const CATEGORY_ICONS: Record<WCategory, React.ComponentType<{
    className?: string;
}>> = {
    'EQUIPMENT': Cog,
    'ENVIRONMENT': Leaf,
    'HUMAN_BEHAVIOR': UserRound,
    'FIRE_SAFETY': Flame,
    'CHEMICALS': FlaskConical,
    'ERGONOMICS': Activity,
};
const WARNING_PAGE_SIZE = 6;
const formatWarningCode = (code?: string) => {
    const raw = String(code || '').trim();
    const match = raw.match(/(\d{3,})$/);
    if (match)
        return `CB-${match[1].slice(-3)}`;
    return raw || 'CB';
};
const formatWarningDisplayDate = (value?: string, t?: any) => {
    if (!value)
        return t ? t('statusNotSet') : 'Chưa đặt';
    const date = new Date(`${value}`.includes('T') ? value : `${value}T00:00:00`);
    if (Number.isNaN(date.getTime()))
        return value;
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
/* ─── Warning interface ───────────────────────────────── */
interface Warning {
    id: string;
    code: string;
    title: string;
    category: WCategory;
    subcategory: string;
    titleI18n?: LocalizedContent;
    department: string;
    area: string;
    areaI18n?: LocalizedContent;
    riskProbability: number;
    riskConsequence: number;
    riskScore: number;
    riskLevel: RiskLevel;
    description: string;
    currentControl: string;
    proposedAction: string;
    descriptionI18n?: LocalizedContent;
    currentControlI18n?: LocalizedContent;
    proposedActionI18n?: LocalizedContent;
    responsiblePerson: string;
    deadline: string;
    reporterName: string;
    evidenceNotes: string;
    relatedStandard: string;
    evidenceNotesI18n?: LocalizedContent;
    relatedStandardI18n?: LocalizedContent;
    status: WStatus;
    createdDate?: string;
    createdAt?: string;
    attachmentNames?: string[];
    approvalStatus: ApprovalStatus;
    submittedByDept: string;
    submittedById: string;
    rejectionReason?: string;
    coordinator?: string;
    additionalNotes?: string;
    additionalNotesI18n?: SafetyLocalizedText;
    productionLine?: string;
    machineName?: string;
    locationDetail?: string;
    detectedAt?: string;
    capaId?:   string | null;
    capaCode?: string | null;
}
/* ─── Component ───────────────────────────────────────── */
export function SafetyWarningsPage() {
    const { lang, t } = useHubLanguage();
    const { user: authUser } = useAuth() as {
        user: SafetyUser | null;
    };
    const user = useMemo(() => toSampleUser(authUser), [authUser]);
    const addNotif = (_notification: unknown) => { };
    const queryClient = useQueryClient();
    const canUserSubmit = user ? canSubmit(user.role) : false;
    const canUserApprove = user ? canApprove(user.role) : false;
    const seeAll = user ? canSeeAll(user.role) : false;
    const dept = seeAll ? undefined : user?.department;
    const { data: warnings = [] } = useQuery<Warning[]>({
        queryKey: ['warnings', dept ?? 'all'],
        queryFn: async () => {
            const url = dept ? `/api/warnings?dept=${encodeURIComponent(dept)}` : '/api/warnings';
            const res = await fetch(url);
            if (!res.ok)
                throw new Error(t("errLoadData"));
            return sampleArray<Warning>(await res.json());
        },
        enabled: !!user,
    });
    const [showForm, setShowForm] = useState(false);
    const [filterStatus, setFilterStatus] = useState('Tất cả');
    const [filterRisk, setFilterRisk] = useState('Tất cả');
    const [filterDepartment, setFilterDepartment] = useState('Tất cả');
    const [searchTerm, setSearchTerm] = useState('');
    const [warningPage, setWarningPage] = useState(1);
    const [activeTab, setActiveTab] = useState<'list' | 'charts'>('list');
    const [viewWarning, setViewWarning] = useState<Warning | null>(null);
    const [rejectInputId, setRejectInputId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const warningText = (warning: Warning, key: keyof Warning) => localizedText(warning[`${String(key)}I18n` as keyof Warning] as LocalizedContent | undefined, lang, String(warning[key] || ''));
    const visibleWarnings = useMemo(() => {
        if (!user || seeAll)
            return warnings;
        return warnings.filter(w => w.submittedByDept === user.department || w.department === user.department);
    }, [warnings, user, seeAll]);
    const stats = useMemo(() => ({
        total: visibleWarnings.length,
        overdue: visibleWarnings.filter(w => w.status === 'OVERDUE').length,
        open: visibleWarnings.filter(w => w.status === 'OPEN').length,
        inprog: visibleWarnings.filter(w => w.status === 'IN_PROGRESS').length,
        done: visibleWarnings.filter(w => w.status === 'DONE').length,
        critical: visibleWarnings.filter(w => w.riskLevel === 'CRITICAL').length,
    }), [visibleWarnings]);
    const todayWarningCount = useMemo(() => {
        const todayKey = new Date().toISOString().slice(0, 10);
        return visibleWarnings.filter(w => String(w.createdDate || w.createdAt || '').slice(0, 10) === todayKey).length;
    }, [visibleWarnings]);
    const departmentOptions = useMemo(() => {
        const names = visibleWarnings.map(w => w.department).filter(Boolean);
        return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'vi'));
    }, [visibleWarnings]);
    const filtered = useMemo(() => visibleWarnings.filter(w => {
        const okS = filterStatus === 'Tất cả' || w.status === filterStatus;
        const okR = filterRisk === 'Tất cả' || w.riskLevel === filterRisk;
        const okD = filterDepartment === 'Tất cả' || w.department === filterDepartment;
        const query = searchTerm.trim().toLowerCase();
        const okQ = !query || [
            w.code,
            warningText(w, 'title'),
            w.category,
            w.subcategory,
            w.department,
            warningText(w, 'area'),
            w.responsiblePerson,
            w.reporterName,
        ].some(value => String(value || '').toLowerCase().includes(query));
        return okS && okR && okD && okQ;
    }), [visibleWarnings, filterStatus, filterRisk, filterDepartment, searchTerm, lang]);
    useEffect(() => {
        setWarningPage(1);
    }, [filterStatus, filterRisk, filterDepartment, searchTerm, visibleWarnings.length]);
    const totalWarningPages = Math.max(1, Math.ceil(filtered.length / WARNING_PAGE_SIZE));
    const currentWarningPage = Math.min(warningPage, totalWarningPages);
    const pagedWarnings = filtered.slice((currentWarningPage - 1) * WARNING_PAGE_SIZE, currentWarningPage * WARNING_PAGE_SIZE);
    const warningStart = filtered.length ? (currentWarningPage - 1) * WARNING_PAGE_SIZE + 1 : 0;
    const warningEnd = Math.min(currentWarningPage * WARNING_PAGE_SIZE, filtered.length);
    const pageButtons = useMemo(() => {
        if (totalWarningPages <= 5)
            return Array.from({ length: totalWarningPages }, (_, index) => index + 1);
        const base = new Set([1, totalWarningPages, currentWarningPage - 1, currentWarningPage, currentWarningPage + 1]);
        return Array.from(base)
            .filter(page => page >= 1 && page <= totalWarningPages)
            .sort((a, b) => a - b);
    }, [currentWarningPage, totalWarningPages]);
    const chartSource = visibleWarnings;
    const catChart = useMemo(() => {
        const map: Record<string, number> = {};
        chartSource.forEach(w => { map[w.category] = (map[w.category] || 0) + 1; });
        return Object.entries(map)
            .map(([name, value]) => ({ name: name.split(/[ /]/)[0] || name, full: name, value }))
            .sort((a, b) => b.value - a.value);
    }, [chartSource]);
    const riskChart = useMemo(() => ([
        { name: t('priorityVeryHigh'), value: chartSource.filter(w => w.riskLevel === 'CRITICAL').length, color: '#ff1744' },
        { name: t('priorityHigh'), value: chartSource.filter(w => w.riskLevel === 'HIGH').length, color: '#e53935' },
        { name: t('priorityMedium'), value: chartSource.filter(w => w.riskLevel === 'MEDIUM').length, color: '#f9a825' },
        { name: t('priorityLow'), value: chartSource.filter(w => w.riskLevel === 'LOW').length, color: '#22a050' },
    ].filter(d => d.value > 0)), [chartSource]);
    const statusChart = useMemo(() => ([
        { name: t('statusOpen'), value: chartSource.filter(w => w.status === 'OPEN').length, color: '#1565c0' },
        { name: t('statusProcessing'), value: chartSource.filter(w => w.status === 'IN_PROGRESS').length, color: '#f9a825' },
        { name: t('statusDone'), value: chartSource.filter(w => w.status === 'DONE').length, color: '#22a050' },
        { name: t('statusOverdue'), value: chartSource.filter(w => w.status === 'OVERDUE').length, color: '#e53935' },
    ].filter(d => d.value > 0)), [chartSource]);
    const departmentChart = useMemo(() => {
        const map: Record<string, {
            name: string;
            value: number;
            riskTotal: number;
        }> = {};
        chartSource.forEach(w => {
            const name = w.department || t('unknownAssignee');
            const current = map[name] || { name, value: 0, riskTotal: 0 };
            current.value += 1;
            current.riskTotal += Number(w.riskScore || 0);
            map[name] = current;
        });
        return Object.values(map)
            .map(item => ({ ...item, avgRisk: item.value ? Math.round(item.riskTotal / item.value) : 0 }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 7);
    }, [chartSource]);
    const timelineChart = useMemo(() => {
        const map: Record<string, {
            label: string;
            value: number;
            sortKey: string;
        }> = {};
        chartSource.forEach(w => {
            const raw = w.createdDate || w.createdAt || w.deadline;
            const date = raw ? new Date(`${raw}`.includes('T') ? raw : `${raw}T00:00:00`) : null;
            const safeDate = date && !Number.isNaN(date.getTime()) ? date : null;
            const sortKey = safeDate ? safeDate.toISOString().slice(0, 10) : 'unknown';
            const label = safeDate ? safeDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : 'N/A';
            const current = map[sortKey] || { label, value: 0, sortKey };
            current.value += 1;
            map[sortKey] = current;
        });
        return Object.values(map).sort((a, b) => a.sortKey.localeCompare(b.sortKey)).slice(-10);
    }, [chartSource]);
    const chartSummary = useMemo(() => ({
        scope: chartSource.length,
        pending: chartSource.filter(w => w.approvalStatus === 'PENDING').length,
        highRisk: chartSource.filter(w => w.riskLevel === 'CRITICAL' || w.riskLevel === 'HIGH').length,
        withEvidence: chartSource.filter(w => (w.attachmentNames?.length || 0) > 0 || w.evidenceNotes).length,
    }), [chartSource]);
    const maxCategoryValue = Math.max(...catChart.map(item => item.value), 1);
    const maxStatusValue = Math.max(...statusChart.map(item => item.value), 1);
    const maxTimelineValue = Math.max(...timelineChart.map(item => item.value), 1);
    const riskTotal = riskChart.reduce((sum, item) => sum + item.value, 0);
    const riskConic = riskChart.reduce((state, item) => {
        const start = state.offset;
        const end = state.offset + (riskTotal ? (item.value / riskTotal) * 100 : 0);
        return {
            offset: end,
            stops: [...state.stops, `${item.color} ${start}% ${end}%`],
        };
    }, { offset: 0, stops: [] as string[] }).stops.join(', ') || '#d9e4dc 0% 100%';
    const approveWarningMutation = useMutation({
        mutationFn: async ({ id, ...body }: {
            id: string;
            actorId: string;
            actorName: string;
            actorRole: string;
            actorDept?: string;
        }) => {
            const res = await fetch(`/api/warnings/${id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok)
                throw new Error(t('approveFailedMsg'));
            return res.json() as Promise<Warning>;
        },
        onSuccess: (w) => {
            queryClient.invalidateQueries({ queryKey: ['warnings'] });
            addNotif({
                type: 'approve',
                title: t('notifyApproved', { code: w.code }),
                message: t('notifyApprovedMessage', { user: user?.name, dept: w.submittedByDept }),
                forRoles: ['nhanvien', 'quanly', 'ehs'],
                forDept: w.submittedByDept,
                page: t('pageHotWarnings'),
            });
        },
    });
    const rejectWarningMutation = useMutation({
        mutationFn: async ({ id, reason, ...actor }: {
            id: string;
            reason: string;
            actorId: string;
            actorName: string;
            actorRole: string;
            actorDept?: string;
        }) => {
            const res = await fetch(`/api/warnings/${id}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason, ...actor }),
            });
            if (!res.ok)
                throw new Error(t('rejectFailedMsg'));
            return res.json() as Promise<Warning>;
        },
        onSuccess: (w, vars) => {
            queryClient.invalidateQueries({ queryKey: ['warnings'] });
            addNotif({
                type: 'reject',
                title: t('notifyRejected', { code: w.code }),
                message: t('notifyRejectedMessage', { user: user?.name, reason: vars.reason }),
                forRoles: ['nhanvien', 'quanly'],
                forDept: w.submittedByDept,
                page: t('pageHotWarnings'),
            });
            setRejectInputId(null);
            setRejectReason('');
        },
    });
    function handleApproveW(id: string) {
        approveWarningMutation.mutate({
            id,
            actorId: user?.id ?? 'unknown',
            actorName: user?.name ?? 'Unknown',
            actorRole: user?.role ?? 'ehs',
            actorDept: user?.department,
        });
    }
    function handleRejectW(id: string) {
        if (!rejectReason.trim())
            return;
        rejectWarningMutation.mutate({
            id,
            reason: rejectReason.trim(),
            actorId: user?.id ?? 'unknown',
            actorName: user?.name ?? 'Unknown',
            actorRole: user?.role ?? 'ehs',
            actorDept: user?.department,
        });
    }
    function handleStatusChange(id: string, status: WStatus) {
        fetch(`/api/warnings/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status,
                updatedByName: user?.name ?? 'Unknown',
                actorId: user?.id ?? 'unknown',
                actorRole: user?.role ?? 'unknown',
                actorDept: user?.department,
            }),
        }).then(() => queryClient.invalidateQueries({ queryKey: ['warnings'] }));
    }
    const formatWarningDate = (value?: string) => {
        if (!value)
            return t ? t('statusNotSet') : 'Chưa đặt';
        const date = new Date(`${value}`.includes('T') ? value : `${value}T00:00:00`);
        if (Number.isNaN(date.getTime()))
            return value;
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    const deadlineMeta = (warning: Warning) => {
        if (warning.status === 'DONE')
            return { label: t('statusClosed'), tone: 'done' };
        if (!warning.deadline)
            return { label: t('deadlineNotSet'), tone: 'muted' };
        const dueDate = new Date(`${warning.deadline}T00:00:00`);
        if (Number.isNaN(dueDate.getTime()))
            return { label: warning.deadline, tone: 'muted' };
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const days = Math.ceil((dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
        if (days < 0)
            return { label: t('overdueDays', { days: Math.abs(days) }), tone: 'danger' };
        if (days === 0)
            return { label: t('dueToday'), tone: 'danger' };
        if (days <= 3)
            return { label: t('daysLeft', { days }), tone: 'warning' };
        return { label: t('daysLeft', { days }), tone: 'ok' };
    };
    const verifyWarningMutation = useMutation({
        mutationFn: async ({ id }: { id: string }) => {
            const res = await fetch(`/api/warnings/${id}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actorId: user?.id ?? 'unknown',
                    actorName: user?.name ?? 'Unknown',
                    actorRole: user?.role ?? 'ehs',
                }),
            });
            if (!res.ok) throw new Error('Xác nhận thất bại');
            return res.json() as Promise<Warning>;
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['warnings'] }); },
    });
    const canApproveWarning = (warning: Warning) => canUserApprove &&
        warning.approvalStatus === 'PENDING' &&
        (seeAll || warning.submittedByDept === user?.department || warning.department === user?.department);
    return <SafetyI18nRender>{(<div className="safety-warning-page space-y-5 w-full pb-10">

      {/* Detail modal */}
      {viewWarning && createPortal(<WarningDetailModal
        lang={lang}
        warning={viewWarning}
        onClose={() => setViewWarning(null)}
        onStatusChange={handleStatusChange}
        user={user ? { id: user.id, name: user.name, role: user.role, department: user.department } : null}
        onApprove={canApproveWarning(viewWarning) ? () => handleApproveW(viewWarning.id) : undefined}
        onReject={canApproveWarning(viewWarning) ? (reason) => rejectWarningMutation.mutate({ id: viewWarning.id, reason, actorId: user?.id ?? 'unknown', actorName: user?.name ?? 'Unknown', actorRole: user?.role ?? 'ehs', actorDept: user?.department }) : undefined}
        onVerify={['admin','ehs'].includes(user?.role ?? '') ? () => verifyWarningMutation.mutate({ id: viewWarning.id }) : undefined}
      />, document.body)}

      {/* Stats */}
      <div className="safety-warning-sample-stats">
        {[
            { label: t('totalWarningsStats'), val: stats.total, note: t('todayWarningsNote', { count: todayWarningCount }), tone: 'blue', icon: ShieldAlert },
            { label: t('openStats'), val: stats.open + stats.inprog, note: t('needTrackingNote'), tone: 'amber', icon: AlertTriangle },
            { label: t('overdueStats'), val: stats.overdue, note: t('urgentNote'), tone: 'red', icon: CalendarClock },
            { label: t('doneStats'), val: stats.done, note: t('thisMonthNote'), tone: 'green', icon: CheckCircle2 },
        ].map(s => {
            const Icon = s.icon;
            return (<article key={s.label} className={`safety-warning-sample-stat ${s.tone}`}>
              <div>
                <span>{s.label}</span>
                <strong>{s.val}</strong>
                <small>{s.note}</small>
              </div>
              <em><Icon className="w-5 h-5"/></em>
            </article>);
        })}
      </div>

      {/* Toolbar */}
      <div className="safety-warning-toolbar sample">
        <div className="safety-warning-segmented" role="tablist" aria-label={t("hotWarningsAria")}>
          <button aria-selected={activeTab === 'list'} className={`safety-warning-tab-btn ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')} role="tab" type="button">
            <ListChecks className="w-4 h-4"/>
            {t("listViewTab")}
          </button>
          <button aria-selected={activeTab === 'charts'} className={`safety-warning-tab-btn ${activeTab === 'charts' ? 'active' : ''}`} onClick={() => setActiveTab('charts')} role="tab" type="button">
            <BarChart3 className="w-4 h-4"/>
            {t("chartViewTab")}
          </button>
        </div>

        {activeTab === 'list' && (<div className="safety-warning-select-filters" aria-label={t("filterAria")}>
            <span>
              <Filter className="w-4 h-4"/>
              {t("filterLabel")}
            </span>
            <label className="safety-warning-filter-search">
              <Search className="w-4 h-4"/>
              <input aria-label={t("searchWarningAria")} onChange={e => setSearchTerm(e.target.value)} placeholder={t("searchWarningPlaceholder")} type="search" value={searchTerm}/>
            </label>
            <select aria-label={t("filterRiskAria")} value={filterRisk} onChange={e => setFilterRisk(e.target.value)}>
              <option value="Tất cả">{t("filterAllRisks")}</option>
              <option value="CRITICAL">{t("priorityVeryHigh")}</option>
              <option value="HIGH">{t("priorityHigh")}</option>
              <option value="MEDIUM">{t("priorityMedium")}</option>
              <option value="LOW">{t("priorityLow")}</option>
            </select>
            <select aria-label={t("filterStatusAria")} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="Tất cả">{t("filterAllStatus")}</option>
              <option value="OPEN">{t("statusOpen")}</option>
              <option value="IN_PROGRESS">{t("statusProcessing")}</option>
              <option value="OVERDUE">{t("statusOverdue")}</option>
              <option value="DONE">{t("statusDone")}</option>
            </select>
            <select aria-label={t("filterDeptAria")} value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)}>
              <option value="Tất cả">{t("filterAllDept")}</option>
              {departmentOptions.map(department => (<option key={department} value={department}>{department}</option>))}
            </select>
          </div>)}

        {canUserSubmit && (<button onClick={() => setShowForm(v => !v)} className="safety-warning-add-btn sample" type="button">
            <Plus className="w-4 h-4"/> {t("createWarningBtn")}
          </button>)}
      </div>

      {/* Charts */}
      {activeTab === 'charts' && (<section className="safety-warning-chart-panel">
          <div className="safety-warning-chart-head">
            <div>
              <p>{t("chartAnalysisTitle")}</p>
              <h3>{t("hotWarningsChartTitle")}</h3>
            </div>
            <span>{t("warningsInScope", { scope: chartSummary.scope })}</span>
          </div>

          <div className="safety-warning-chart-stats">
            <article>
              <span>{t("totalDataLabel")}</span>
              <strong>{chartSummary.scope}</strong>
            </article>
            <article className="danger">
              <span>{t("highRiskLabel")}</span>
              <strong>{chartSummary.highRisk}</strong>
            </article>
            <article className="amber">
              <span>{t("pendingApprovalLabel")}</span>
              <strong>{chartSummary.pending}</strong>
            </article>
            <article className="blue">
              <span>{t("hasEvidenceLabel")}</span>
              <strong>{chartSummary.withEvidence}</strong>
            </article>
          </div>

          {chartSource.length === 0 ? (<div className="safety-warning-chart-empty">
              <AlertTriangle className="w-5 h-5"/>
              {t("noChartData")}
            </div>) : (<>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <article className="safety-warning-chart-card">
                <div className="safety-warning-chart-card-head">
                  <div>
                    <p>{t("categoryLabelStr")}</p>
                    <h4>{t("categoryChartTitle")}</h4>
                  </div>
                  <span>{t("groupsCount", { count: catChart.length })}</span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={catChart} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="currentColor" strokeDasharray="3 3" vertical={false} className="opacity-10"/>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false}/>
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fontWeight: 700 }} tickLine={false} axisLine={false}/>
                    <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, fontWeight: 700 }} labelFormatter={(label) => catChart.find((item) => item.name === label)?.full || label}/>
                    <Bar dataKey="value" name={t("warningCountLabel")} radius={[5, 5, 0, 0]}>
                      {catChart.map((_, index) => (<Cell fill={['#e53935', '#f9a825', '#1565c0', '#00a99d', '#9c27b0', '#22a050'][index % 6]} key={index}/>))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </article>

              <article className="safety-warning-chart-card">
                <div className="safety-warning-chart-card-head">
                  <div>
                    <p>{t("riskLabelStr")}</p>
                    <h4>{t("priorityDistribTitle")}</h4>
                  </div>
                  <span>{t("itemsCount", { count: riskTotal })}</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie cx="50%" cy="50%" data={riskChart} dataKey="value" innerRadius={54} label={({ percent = 0 }) => `${(Number(percent) * 100).toFixed(0)}%`} labelLine={false} outerRadius={88}>
                        {riskChart.map((item) => (<Cell fill={item.color} key={item.name}/>))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, fontWeight: 700 }}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="safety-warning-chart-legend">
                    {riskChart.map((item) => (<div key={item.name}>
                        <i style={{ backgroundColor: item.color }}/>
                        <span>{item.name}</span>
                        <strong style={{ color: item.color }}>{item.value}</strong>
                      </div>))}
                  </div>
                </div>
              </article>
            </div>

            <div className="safety-warning-chart-grid">
              <article className="safety-warning-chart-card wide">
                <div className="safety-warning-chart-card-head">
                  <div>
                    <p>{t("categoryLabelStr")}</p>
                    <h4>{t("categoryChartTitle")}</h4>
                  </div>
                  <span>{t("groupsCount", { count: catChart.length })}</span>
                </div>
                <div className="safety-warning-bar-list tall">
                  {catChart.map((item, i) => {
                    const color = ['#e53935', '#f9a825', '#1565c0', '#00a99d', '#9c27b0', '#22a050'][i % 6];
                    return (<div className="safety-warning-bar-row" key={item.full} style={{ '--bar-color': color, '--bar-width': `${Math.max(8, (item.value / maxCategoryValue) * 100)}%` } as React.CSSProperties}>
                        <div className="safety-warning-bar-label">
                          <strong>{item.full}</strong>
                          <span>{t("warningsCount", { count: item.value })}</span>
                        </div>
                        <div className="safety-warning-bar-track"><i /></div>
                        <b>{item.value}</b>
                      </div>);
                })}
                </div>
              </article>

              <article className="safety-warning-chart-card">
                <div className="safety-warning-chart-card-head">
                  <div>
                    <p>{t("riskLabelStr")}</p>
                    <h4>{t("priorityDistribTitle")}</h4>
                  </div>
                  <span>{t("itemsCount", { count: riskTotal })}</span>
                </div>
                <div className="safety-warning-donut-layout">
                  <div className="safety-warning-donut" style={{ '--donut-fill': riskConic } as React.CSSProperties}>
                    <div>
                      <strong>{riskTotal}</strong>
                      <span>{t("warningsCount", { count: "" }).trim()}</span>
                    </div>
                  </div>
                  <div className="safety-warning-chart-legend">
                    {riskChart.map(r => (<div key={r.name}>
                        <i style={{ backgroundColor: r.color }}/>
                        <span>{r.name}</span>
                        <strong style={{ color: r.color }}>{r.value}</strong>
                      </div>))}
                  </div>
                </div>
              </article>

              <article className="safety-warning-chart-card">
                <div className="safety-warning-chart-card-head">
                  <div>
                    <p>{t("statusLabelStr")}</p>
                    <h4>{t("processingProgressTitle")}</h4>
                  </div>
                  <span>{t("statusCount", { count: statusChart.length })}</span>
                </div>
                <div className="safety-warning-bar-list status">
                  {statusChart.map(item => (<div className="safety-warning-bar-row" key={item.name} style={{ '--bar-color': item.color, '--bar-width': `${Math.max(8, (item.value / maxStatusValue) * 100)}%` } as React.CSSProperties}>
                      <div className="safety-warning-bar-label">
                        <strong>{item.name}</strong>
                        <span>{t("warningsCount", { count: item.value })}</span>
                      </div>
                      <div className="safety-warning-bar-track"><i /></div>
                      <b>{item.value}</b>
                    </div>))}
                </div>
              </article>

              <article className="safety-warning-chart-card">
                <div className="safety-warning-chart-card-head">
                  <div>
                    <p>{t("deptLabelStr")}</p>
                    <h4>{t("topAreasTitle")}</h4>
                  </div>
                  <span>{t("deptCount", { count: departmentChart.length })}</span>
                </div>
                <div className="safety-warning-dept-list">
                  {departmentChart.map((item, index) => {
                    const max = Math.max(...departmentChart.map(d => d.value), 1);
                    return (<div key={item.name} className="safety-warning-dept-row">
                        <span>{index + 1}</span>
                        <div>
                          <strong>{item.name}</strong>
                          <em>Risk TB {item.avgRisk}</em>
                          <i style={{ width: `${Math.max(12, (item.value / max) * 100)}%` }}/>
                        </div>
                        <b>{item.value}</b>
                      </div>);
                })}
                </div>
              </article>

              <article className="safety-warning-chart-card wide">
                <div className="safety-warning-chart-card-head">
                  <div>
                    <span>{t("timeLabelStr")}</span>
                    <h4>{t("recentTrendsTitle")}</h4>
                  </div>
                  <span>{t("timepointsCount", { count: timelineChart.length })}</span>
                </div>
                <div className="safety-warning-timeline">
                  {timelineChart.map(item => (<div className="safety-warning-timeline-col" key={item.sortKey}>
                      <div className="safety-warning-timeline-track">
                        <i style={{ height: `${Math.max(12, (item.value / maxTimelineValue) * 100)}%` }}>
                          <b>{item.value}</b>
                        </i>
                      </div>
                      <span>{item.label}</span>
                    </div>))}
                </div>
              </article>
            </div>
            </>)}
        </section>)}

      {/* ── Add Warning Modal ── */}
      {showForm && <SafetyWarningCreateModal user={user} onClose={() => setShowForm(false)}/>}

      {/* Warning list */}
      {activeTab === 'list' && (<section className="safety-warning-board sample">
          <div className="safety-warning-board-head">
            <div className="safety-warning-board-title">
              <span className="safety-warning-board-icon">
                <ShieldAlert className="h-4 w-4"/>
              </span>
              <div>
                
                <h3>{t("trackingListTitle")}</h3>
              </div>
            </div>
            <div className="safety-warning-board-meta">
              <span>{t("filteredCount", { count: filtered.length })}</span>
              <strong>{t("highRiskAndOverdue", { highRisk: chartSummary.highRisk, overdue: stats.overdue })}</strong>
            </div>
          </div>
          <div className="space-y-3 p-3 sm:hidden">
            {filtered.length === 0 ? (<div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card p-6 text-center text-sm font-semibold text-muted-foreground">
                <AlertTriangle className="h-5 w-5"/>
                {t("noWarningsFound")}
              </div>) : (pagedWarnings.map(w => {
                const rc = getRiskColor(w.riskLevel);
                const due = deadlineMeta(w);
                const riskClass = w.riskLevel === 'CRITICAL' ? 'critical' :
                    w.riskLevel === 'HIGH' ? 'high' :
                        w.riskLevel === 'MEDIUM' ? 'medium' :
                            'low';
                const statusClass = w.status === 'OVERDUE' ? 'overdue' :
                    w.status === 'IN_PROGRESS' ? 'progress' :
                        w.status === 'DONE' ? 'done' :
                            'open';
                return (<article key={w.id} className="rounded-lg border border-border bg-background p-3 shadow-sm" style={{ '--warning-risk': rc.text } as React.CSSProperties}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-[11px] font-bold text-[#1565c0]">{formatWarningCode(w.code)}</div>
                        <button className="mt-1 block appearance-none border-0 bg-transparent p-0 text-left text-sm font-bold leading-snug text-foreground shadow-none transition-colors hover:text-[#1565c0]" onClick={() => setViewWarning(w)} type="button">
                          {warningText(w, 'title')}
                        </button>
                        <div className="mt-1 text-xs text-muted-foreground">{w.subcategory || w.category}</div>
                        <div className="safety-warning-mobile-meta">
                          <span>{warningText(w, 'area') || t('noAreaKnown')}</span>
                          <span>{w.reporterName || t('noReporterKnown')}</span>
                          {(w.attachmentNames?.length || 0) > 0 ? <span>{t('filesCount', { count: w.attachmentNames?.length })}</span> : null}
                        </div>
                      </div>
                      <span className={`safety-warning-status-pill ${statusClass} shrink-0`}>
                        {t(`enum${w.status}` as any) || w.status}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-muted/30 px-2 py-1.5">
                        <div className="text-[10px] font-semibold uppercase text-muted-foreground">{t("cardDeptLabel")}</div>
                        <div className="font-bold">{w.department || t('unknownDept')}</div>
                      </div>
                      <div className="rounded-md bg-muted/30 px-2 py-1.5">
                        <div className="text-[10px] font-semibold uppercase text-muted-foreground">{t("cardDeadlineLabel")}</div>
                        <div className={`font-mono font-bold ${due.tone === 'danger' ? 'text-[#e53935]' : due.tone === 'warning' ? 'text-[#f9a825]' : 'text-foreground'}`}>
                          {formatWarningDate(w.deadline)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{due.label}</div>
                      </div>
                      <div className="rounded-md bg-muted/30 px-2 py-1.5">
                        <div className="text-[10px] font-semibold uppercase text-muted-foreground">{t("cardRiskLabel")}</div>
                        <span className={`safety-warning-risk-pill ${riskClass} mt-1`}>
                          <i style={{ background: rc.text }}/>
                          {t(`enum${w.riskLevel}` as any) || w.riskLevel}
                        </span>
                        <div className="mt-1 text-[11px] font-mono text-muted-foreground">{t('scoreLabel', { score: w.riskScore })}</div>
                      </div>
                      <div className="rounded-md bg-muted/30 px-2 py-1.5">
                        <div className="text-[10px] font-semibold uppercase text-muted-foreground">{t("cardAssigneeLabel")}</div>
                        <div className="font-semibold">{w.responsiblePerson || t('unassigned')}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <button className="inline-flex items-center gap-1.5 rounded-md border border-[#1565c0]/20 bg-[#1565c0]/10 px-2.5 py-1.5 text-xs font-bold text-[#1565c0]" onClick={() => setViewWarning(w)} type="button">
                        <Eye className="h-3.5 w-3.5"/> {t("viewDetailBtn")}
                      </button>
                      {canApproveWarning(w) ? (<div className="flex items-center gap-2">
                          <button aria-label={t("approveAria", { code: w.code })} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#22a050]/25 bg-[#22a050]/10 text-[#22a050]" onClick={() => handleApproveW(w.id)} title={t("approveBtn")} type="button">
                            <CheckCircle2 className="h-4 w-4"/>
                          </button>
                          <button aria-label={t("rejectAria", { code: w.code })} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#e53935]/25 bg-[#e53935]/10 text-[#e53935]" onClick={() => { setRejectInputId(w.id); setRejectReason(''); }} title={t("rejectBtn")} type="button">
                            <XCircle className="h-4 w-4"/>
                          </button>
                        </div>) : null}
                    </div>

                    {rejectInputId === w.id ? (<div className="mt-3 rounded-lg border border-[#e53935]/25 bg-[#e53935]/5 p-2">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 shrink-0 text-[#e53935]"/>
                          <input aria-label={t("rejectReasonAria", { code: w.code })} autoFocus className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[#e53935]/20" onChange={e => setRejectReason(e.target.value)} placeholder={t("rejectReasonPlaceholder")} value={rejectReason}/>
                        </div>
                        <div className="mt-2 flex justify-end gap-2">
                          <button className="rounded-md bg-[#e53935] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" disabled={!rejectReason.trim()} onClick={() => handleRejectW(w.id)} type="button">
                            Xác nhận
                          </button>
                          <button className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold" onClick={() => { setRejectInputId(null); setRejectReason(''); }} type="button">
                            {t("btnCancel")}
                          </button>
                        </div>
                      </div>) : null}

                    {w.rejectionReason ? (<div className="mt-3 flex items-start gap-2 rounded-md bg-[#e53935]/10 px-2 py-1.5 text-xs text-[#e53935]">
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
                        <span><strong>{t("rejectedPrefix")}</strong> {w.rejectionReason}</span>
                      </div>) : null}
                  </article>);
            }))}
          </div>

          <div className="safety-warning-table-wrap hidden sm:block">
            <table className="safety-warning-table">
              <thead>
                <tr>
                  <th>{t("tableCode")}</th>
                  <th>{t("tableTitleCat")}</th>
                  <th>{t("tableDept")}</th>
                  <th>{t("tableRisk")}</th>
                  <th>{t("tableStatus")}</th>
                  <th>{t("tableDeadline")}</th>
                  <th>{t("tableAssignee")}</th>
                  <th>{t("tableActions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (<tr>
                    <td className="safety-warning-empty" colSpan={8}>
                      <AlertTriangle className="w-5 h-5"/>
                      {t("noWarningsFound")}
                    </td>
                  </tr>) : (pagedWarnings.map(w => {
                const rc = getRiskColor(w.riskLevel);
                const due = deadlineMeta(w);
                const riskClass = w.riskLevel === 'CRITICAL' ? 'critical' :
                    w.riskLevel === 'HIGH' ? 'high' :
                        w.riskLevel === 'MEDIUM' ? 'medium' :
                            'low';
                const statusClass = w.status === 'OVERDUE' ? 'overdue' :
                    w.status === 'IN_PROGRESS' ? 'progress' :
                        w.status === 'DONE' ? 'done' :
                            'open';
                return (<React.Fragment key={w.id}>
                        <tr className="safety-warning-row" style={{ '--warning-risk': rc.text } as React.CSSProperties}>
                          <td className="safety-warning-code-cell" title={w.code}>
                            {formatWarningCode(w.code)}
                          </td>

                          <td className="safety-warning-title-cell">
                            <button className="safety-warning-title-button" onClick={() => setViewWarning(w)} title={warningText(w, 'title')} type="button">
                              {warningText(w, 'title')}
                            </button>
                            <span title={w.subcategory || w.category}>{w.subcategory || w.category}</span>
                            <div className="safety-warning-title-meta">
                              <span>{warningText(w, 'area') || t('noAreaKnown')}</span>
                              <span>{w.reporterName || t('noReporterKnown')}</span>
                              {(w.attachmentNames?.length || 0) > 0 ? <span>{t('filesCount', { count: w.attachmentNames?.length })}</span> : null}
                            </div>
                          </td>

                          <td>
                            <span className="safety-warning-dept-pill" title={w.department || t('unknownDept')}>{w.department || t('unknownDept')}</span>
                          </td>

                          <td>
                            <span className={`safety-warning-risk-pill ${riskClass}`}>
                              <i style={{ background: rc.text }}/>
                              {t(`enum${w.riskLevel}` as any) || w.riskLevel}
                            </span>
                            <small className="safety-warning-score">{t('scoreLabel', { score: w.riskScore })}</small>
                          </td>

                          <td>
                            <span className={`safety-warning-status-pill ${statusClass}`}>
                              {t(`enum${w.status}` as any) || w.status}
                            </span>
                          </td>

                          <td className={`safety-warning-date-cell ${due.tone}`}>
                            <strong>{formatWarningDate(w.deadline)}</strong>
                            <span>{due.label}</span>
                          </td>

                          <td className="safety-warning-owner-cell" title={w.responsiblePerson || t('unassigned')}>
                            {w.responsiblePerson || t('unassigned')}
                          </td>

                          <td className="safety-warning-action-cell">
                            <div className="safety-warning-action-icons">
                              <button aria-label={t("viewDetailAria", { code: w.code })} className="safety-warning-action-icon view" onClick={() => setViewWarning(w)} title={t("viewDetailBtn")} type="button">
                                <Eye className="w-4 h-4"/>
                              </button>
                              {canApproveWarning(w) ? (<>
                                  <button aria-label={t("approveAria", { code: w.code })} className="safety-warning-action-icon approve" onClick={() => handleApproveW(w.id)} title={t("approveBtn")} type="button">
                                    <CheckCircle2 className="w-4 h-4"/>
                                  </button>
                                  <button aria-label={t("rejectAria", { code: w.code })} className="safety-warning-action-icon reject" onClick={() => { setRejectInputId(w.id); setRejectReason(''); }} title={t("rejectBtn")} type="button">
                                    <XCircle className="w-4 h-4"/>
                                  </button>
                                </>) : null}
                            </div>
                          </td>
                        </tr>

                        {rejectInputId === w.id ? (<tr className="safety-warning-inline-row">
                            <td colSpan={8}>
                              <div className="safety-warning-reject-panel">
                                <XCircle className="w-4 h-4"/>
                                <input aria-label={t("rejectReasonAria", { code: w.code })} autoFocus className="safety-warning-reject-input" onChange={e => setRejectReason(e.target.value)} placeholder={t("rejectReasonPlaceholderLong")} value={rejectReason}/>
                                <button className="safety-warning-action-btn reject" disabled={!rejectReason.trim()} onClick={() => handleRejectW(w.id)} type="button">
                                  Xác nhận
                                </button>
                                <button className="safety-warning-action-btn neutral" onClick={() => { setRejectInputId(null); setRejectReason(''); }} type="button">
                                  {t("btnCancel")}
                                </button>
                              </div>
                            </td>
                          </tr>) : null}

                        {w.rejectionReason ? (<tr className="safety-warning-inline-row rejection-note">
                            <td colSpan={8}>
                              <XCircle className="w-4 h-4"/>
                              <strong>{t("rejectedPrefix")}</strong>
                              <span>{w.rejectionReason}</span>
                            </td>
                          </tr>) : null}
                      </React.Fragment>);
            }))}
              </tbody>
            </table>
          </div>
          <div className="safety-warning-board-footer">
            <span>{t("paginationDisplay", { start: warningStart, end: warningEnd, total: filtered.length })}</span>
            <div className="safety-warning-pagination" aria-label={t("paginationAria")}>
              {pageButtons.map((page, index) => (<React.Fragment key={page}>
                  {index > 0 && page - pageButtons[index - 1] > 1 ? <span>...</span> : null}
                  <button aria-current={page === currentWarningPage ? 'page' : undefined} className={page === currentWarningPage ? 'active' : ''} onClick={() => setWarningPage(page)} type="button">
                    {page}
                  </button>
                </React.Fragment>))}
            </div>
          </div>
        </section>)}
    </div>)}</SafetyI18nRender>;
}



