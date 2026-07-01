import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { useHubLanguage } from '../../i18n-context';
import { localizedText } from '../../i18n-localized';
import type { SafetyUser } from './safety-domain';
import { DEPARTMENTS, canApprove, canSeeAll, canSubmit, sampleArray, toSampleUser } from './safety-sample-adapter';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, } from 'recharts';
import { AlertTriangle, Banknote, BarChart3, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, ClipboardList, Factory, Eye, Leaf, ListChecks, Package, Plus, User, Wrench, X, XCircle, } from 'lucide-react';
import { SafetyI18nRender } from "./safety-i18n-render";
import { SafetyLocalizedTextField, emptySafetyLocalizedText, safetyLocalizedPayload, safetyLocalizedVi } from "./safety-localized-form";
/* ─── Types ───────────────────────────────────────────── */
type Severity = 'Nguy hiểm' | 'HIGH' | 'MEDIUM' | 'Nhẹ';
type IStatus = 'Đang điều tra' | 'PENDING' | 'Đã khắc phục' | 'Đóng';
type RootCause = 'Con người' | 'Thiết bị' | 'Môi trường' | 'Phương pháp' | 'Vật liệu';
type IType = 'Tai nạn lao động' | 'Sự cố thiết bị' | 'Cháy nổ' | 'Hóa chất' | 'Ngã/Va chạm' | 'Điện giật' | 'Chấn thương nhiệt' | 'Khác';
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type LocalizedContent = Record<string, string | undefined>;
interface Incident {
    /* Định danh */
    id: string;
    code: string;
    /* Thời gian */
    occurredDate: string;
    occurredTime: string;
    reportedDate?: string;
    /* Địa điểm */
    department: string;
    area: string;
    areaI18n?: LocalizedContent;
    /* Phân loại */
    type: IType;
    severity: Severity;
    /* Mô tả */
    description: string;
    descriptionI18n?: LocalizedContent;
    /* Phân tích nguyên nhân */
    rootCauseCategory: RootCause;
    rootCauseDetail: string;
    rootCauseDetailI18n?: LocalizedContent;
    /* Thương vong & thiệt hại */
    injuredCount?: number;
    bodyPartsAffected: string[];
    firstAidGiven: boolean;
    propertyDamage?: boolean;
    propertyDamageVND?: number;
    estimatedCost?: number;
    /* Hành động */
    immediateAction: string;
    correctiveAction: string;
    preventiveAction: string;
    immediateActionI18n?: LocalizedContent;
    correctiveActionI18n?: LocalizedContent;
    preventiveActionI18n?: LocalizedContent;
    /* Nhân sự */
    reporterName: string;
    reporterPhone: string;
    handlerName: string;
    witnesses: string;
    witnessesI18n?: LocalizedContent;
    /* Trạng thái */
    status: IStatus;
    approvalStatus: ApprovalStatus;
    submittedByDept: string;
    submittedById: string;
    rejectionReason?: string;
}
/* ─── Constants / lookup data ─────────────────────────── */
const INCIDENT_TYPES: IType[] = [
    'Tai nạn lao động', 'Sự cố thiết bị', 'Cháy nổ', 'Hóa chất',
    'Ngã/Va chạm', 'Điện giật', 'Chấn thương nhiệt', 'Khác',
];
const ROOT_CAUSE_OPTIONS: {
    value: RootCause;
    label: string;
    hint: string;
}[] = [
    { value: 'Con người', label: 'Con người', hint: 'Lỗi thao tác, thiếu đào tạo, mệt mỏi, vi phạm quy trình' },
    { value: 'Thiết bị', label: 'Thiết bị', hint: 'Hỏng hóc, thiếu bảo trì, thiết kế không an toàn' },
    { value: 'Môi trường', label: 'Môi trường', hint: 'Chiếu sáng, tiếng ồn, nhiệt độ, trật tự vệ sinh' },
    { value: 'Phương pháp', label: 'Phương pháp', hint: 'Quy trình không rõ, hướng dẫn thiếu, kiểm soát kém' },
    { value: 'Vật liệu', label: 'Vật liệu', hint: 'Chất lượng nguyên liệu, hóa chất nguy hiểm, bao bì' },
];
const ROOT_CAUSE_ICONS: Record<RootCause, React.ComponentType<{
    className?: string;
}>> = {
    'Con người': User,
    'Thiết bị': Wrench,
    'Môi trường': Leaf,
    'Phương pháp': ClipboardList,
    'Vật liệu': Package,
};
const BODY_PARTS = [
    'Đầu/Cổ', 'Mắt', 'Tai', 'Mặt', 'Vai/Cánh tay', 'Bàn tay/Ngón tay',
    'Ngực/Lưng', 'Bụng', 'Hông/Đùi', 'Đầu gối/Chân', 'Bàn chân/Ngón chân', 'Toàn thân',
];
const AREA_SUGGESTIONS: Record<string, string[]> = {
    'Sản Xuất A': ['Chuyền 1', 'Chuyền 2', 'Chuyền 3', 'Khu kiểm tra', 'Lối đi'],
    'Sản Xuất B': ['Chuyền 4', 'Chuyền 5', 'Khu đóng gói', 'Kho bán thành phẩm'],
    'Sản Xuất C': ['Khu ép nhựa', 'Khu hàn', 'Khu lắp ráp', 'Phòng kiểm tra'],
    'Kỹ Thuật': ['Phòng máy', 'Xưởng sửa chữa', 'Khu thử nghiệm'],
    'Kho Vận': ['Kho A', 'Kho B', 'Khu xe nâng', 'Cổng xuất nhập', 'Sân bãi'],
    'Bảo Trì': ['Xưởng hàn', 'Khu điện', 'Khu cơ khí'],
};
const SEV_COLORS: Record<Severity, {
    bg: string;
    text: string;
    border: string;
}> = {
    'Nguy hiểm': { bg: '#7b0000', text: '#ff5252', border: '#ff5252' },
    'HIGH': { bg: '#e5393518', text: '#e53935', border: '#e53935' },
    'MEDIUM': { bg: '#f9a82518', text: '#f9a825', border: '#f9a825' },
    'Nhẹ': { bg: '#22a05018', text: '#22a050', border: '#22a050' },
};
const ST_COLOR: Record<IStatus, string> = {
    'Đang điều tra': '#1565c0', 'PENDING': '#f9a825',
    'Đã khắc phục': '#22a050', 'Đóng': '#6b7280',
};
const TYPE_COLORS = ['#e53935', '#f9a825', '#f4511e', '#1565c0', '#00a99d', '#9c27b0', '#ff6f00', '#607d8b'];
const INCIDENT_PAGE_SIZE = 10;
const INCIDENT_FORM_STEPS = [
    { id: 1, label: 'Thời gian' },
    { id: 2, label: 'Phân loại' },
    { id: 3, label: 'Nguyên nhân' },
    { id: 4, label: 'Thiệt hại' },
    { id: 5, label: 'Hành động' },
    { id: 6, label: 'Nhân sự' },
] as const;
/* ─── Empty form ──────────────────────────────────────── */
const EMPTY: Omit<Incident, 'id' | 'code'> = {
    occurredDate: '', occurredTime: '', reportedDate: '',
    areaI18n: emptySafetyLocalizedText(),
    department: DEPARTMENTS[0], area: '',
    type: 'Tai nạn lao động', severity: 'Nhẹ',
    descriptionI18n: emptySafetyLocalizedText(),
    description: '',
    rootCauseDetailI18n: emptySafetyLocalizedText(),
    rootCauseCategory: 'Con người', rootCauseDetail: '',
    injuredCount: 0, bodyPartsAffected: [], firstAidGiven: false,
    propertyDamage: false, propertyDamageVND: 0,
    immediateActionI18n: emptySafetyLocalizedText(),
    correctiveActionI18n: emptySafetyLocalizedText(),
    preventiveActionI18n: emptySafetyLocalizedText(),
    immediateAction: '', correctiveAction: '', preventiveAction: '',
    witnessesI18n: emptySafetyLocalizedText(),
    reporterName: '', reporterPhone: '', handlerName: '', witnesses: '',
    status: 'Đang điều tra',
    approvalStatus: 'PENDING',
    submittedByDept: '',
    submittedById: '',
};
/* ─── Helper: format currency ─────────────────────────── */
function fmtVND(n: number) {
    if (n === 0)
        return '—';
    return n.toLocaleString('vi-VN') + ' ₫';
}
function normalizeIncident(item: Incident): Incident {
    const severity = (SEV_COLORS as Record<string, {
        bg: string;
        text: string;
        border: string;
    }>)[item.severity] ? item.severity : 'MEDIUM';
    const status = (ST_COLOR as Record<string, string>)[item.status] ? item.status : 'Đang điều tra';
    return {
        ...item,
        bodyPartsAffected: Array.isArray(item.bodyPartsAffected) ? item.bodyPartsAffected : [],
        firstAidGiven: Boolean(item.firstAidGiven),
        propertyDamage: Boolean(item.propertyDamage ?? item.propertyDamageVND ?? item.estimatedCost),
        propertyDamageVND: item.propertyDamageVND ?? item.estimatedCost ?? 0,
        rootCauseCategory: item.rootCauseCategory || 'Con người',
        rootCauseDetail: item.rootCauseDetail || '—',
        severity: severity as Severity,
        status: status as IStatus
    };
}
/* ─── Component ───────────────────────────────────────── */
export function SafetyIncidentsPage() {
    const { lang } = useHubLanguage();
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
    const incidentText = (incident: Incident, key: keyof Incident) => localizedText(incident[`${String(key)}I18n` as keyof Incident] as LocalizedContent | undefined, lang, String(incident[key] || ''));
    const { data: incidents = [] } = useQuery<Incident[]>({
        queryKey: ['incidents', dept ?? 'all'],
        queryFn: async () => {
            const url = dept ? `/api/incidents?dept=${encodeURIComponent(dept)}` : '/api/incidents';
            const res = await fetch(url);
            if (!res.ok)
                throw new Error('Lỗi tải dữ liệu');
            return sampleArray<Incident>(await res.json()).map(normalizeIncident);
        },
        enabled: !!user,
    });
    const [showForm, setShowForm] = useState(false);
    const [incidentFormStep, setIncidentFormStep] = useState(1);
    const incidentFormRef = useRef<HTMLFormElement | null>(null);
    const [viewIncident, setViewIncident] = useState<Incident | null>(null);
    const [form, setForm] = useState({ ...EMPTY });
    const [filterStatus, setFilterStatus] = useState('Tất cả');
    const [activeTab, setActiveTab] = useState<'list' | 'charts'>('list');
    const [incidentPage, setIncidentPage] = useState(1);
    const [rejectInputId, setRejectInputId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    /* ── Stats ── */
    const stats = useMemo(() => ({
        total: incidents.length,
        open: incidents.filter(i => i.status === 'Đang điều tra').length,
        pending: incidents.filter(i => i.approvalStatus === 'PENDING').length,
        fixed: incidents.filter(i => i.status === 'Đã khắc phục').length,
        injured: incidents.reduce((s, i) => s + (i.injuredCount ?? 0), 0),
        damage: incidents.reduce((s, i) => s + (i.propertyDamageVND ?? i.estimatedCost ?? 0), 0),
    }), [incidents]);
    /* ── Chart data ── */
    const typeChart = useMemo(() => {
        const map: Record<string, number> = {};
        incidents.forEach(i => { map[i.type] = (map[i.type] || 0) + 1; });
        return Object.entries(map).map(([name, value]) => ({ name, value }));
    }, [incidents]);
    const causeChart = useMemo(() => {
        const map: Record<string, number> = {};
        incidents.forEach(i => { map[i.rootCauseCategory] = (map[i.rootCauseCategory] || 0) + 1; });
        return Object.entries(map).map(([name, value]) => ({ name, value }));
    }, [incidents]);
    const deptChart = useMemo(() => {
        const map: Record<string, number> = {};
        incidents.forEach(i => { map[i.department] = (map[i.department] || 0) + 1; });
        return Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, value]) => ({ name: name.split(' ').slice(-1)[0], full: name, value }));
    }, [incidents]);
    const sevChart = useMemo(() => [
        { name: 'Nguy hiểm', value: incidents.filter(i => i.severity === 'Nguy hiểm').length, color: '#7b0000' },
        { name: 'HIGH', value: incidents.filter(i => i.severity === 'HIGH').length, color: '#e53935' },
        { name: 'MEDIUM', value: incidents.filter(i => i.severity === 'MEDIUM').length, color: '#f9a825' },
        { name: 'Nhẹ', value: incidents.filter(i => i.severity === 'Nhẹ').length, color: '#22a050' },
    ].filter(d => d.value > 0), [incidents]);
    /* ── Visible by role ── */
    const visibleIncidents = useMemo(() => {
        if (!user || seeAll)
            return incidents;
        return incidents.filter(i => i.submittedByDept === user.department || i.department === user.department);
    }, [incidents, user, seeAll]);
    /* ── Filtered list ── */
    const filtered = filterStatus === 'Tất cả' ? visibleIncidents : visibleIncidents.filter(i => i.status === filterStatus);
    React.useEffect(() => {
        setIncidentPage(1);
        setViewIncident(null);
    }, [filterStatus, visibleIncidents.length]);
    const totalIncidentPages = Math.max(1, Math.ceil(filtered.length / INCIDENT_PAGE_SIZE));
    const currentIncidentPage = Math.min(incidentPage, totalIncidentPages);
    const incidentStartIndex = (currentIncidentPage - 1) * INCIDENT_PAGE_SIZE;
    const pagedIncidents = filtered.slice(incidentStartIndex, incidentStartIndex + INCIDENT_PAGE_SIZE);
    const displayStart = filtered.length ? incidentStartIndex + 1 : 0;
    const displayEnd = Math.min(incidentStartIndex + INCIDENT_PAGE_SIZE, filtered.length);
    /* ── Suggest severity based on type ── */
    function suggestSeverity(type: IType): Severity {
        if (type === 'Cháy nổ' || type === 'Điện giật')
            return 'Nguy hiểm';
        if (type === 'Hóa chất' || type === 'Sự cố thiết bị')
            return 'HIGH';
        if (type === 'Tai nạn lao động' || type === 'Chấn thương nhiệt')
            return 'MEDIUM';
        return 'Nhẹ';
    }
    function handleTypeChange(type: IType) {
        setForm(p => ({ ...p, type, severity: suggestSeverity(type) }));
    }
    function toggleBodyPart(bp: string) {
        setForm(p => ({
            ...p,
            bodyPartsAffected: p.bodyPartsAffected.includes(bp)
                ? p.bodyPartsAffected.filter(b => b !== bp)
                : [...p.bodyPartsAffected, bp],
        }));
    }
    function closeIncidentForm() {
        setShowForm(false);
        setIncidentFormStep(1);
        setForm({ ...EMPTY });
    }
    function nextIncidentFormStep() {
        if (!incidentFormRef.current?.reportValidity())
            return;
        setIncidentFormStep(step => Math.min(INCIDENT_FORM_STEPS.length, step + 1));
    }
    function previousIncidentFormStep() {
        setIncidentFormStep(step => Math.max(1, step - 1));
    }
    const createMutation = useMutation({
        mutationFn: async (body: Record<string, unknown>) => {
            const res = await fetch('/api/incidents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok)
                throw new Error('Gửi thất bại');
            return res.json() as Promise<Incident>;
        },
        onSuccess: (inc) => {
            queryClient.invalidateQueries({ queryKey: ['incidents'] });
            setViewIncident(null);
            addNotif({
                type: 'submit',
                title: `Sự cố ${inc.code} chờ phê duyệt`,
                message: `${user?.name ?? 'Nhân viên'} (${user?.department}) gửi báo cáo sự cố ${inc.type}. Mức độ: ${inc.severity}.`,
                forRoles: ['quanly', 'ehs'],
                forDept: user?.department,
                page: 'Báo Cáo Sự Cố',
            });
            setShowForm(false);
            setIncidentFormStep(1);
            setForm({ ...EMPTY });
        },
    });
    const approveMutation = useMutation({
        mutationFn: async ({ id, ...body }: {
            id: string;
            actorId: string;
            actorName: string;
            actorRole: string;
            actorDept?: string;
        }) => {
            const res = await fetch(`/api/incidents/${id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok)
                throw new Error('Phê duyệt thất bại');
            return res.json() as Promise<Incident>;
        },
        onSuccess: (inc) => {
            queryClient.invalidateQueries({ queryKey: ['incidents'] });
            addNotif({
                type: 'approve',
                title: `Sự cố ${inc.code} đã được phê duyệt`,
                message: `${user?.name} đã phê duyệt báo cáo sự cố của bộ phận ${inc.submittedByDept}.`,
                forRoles: ['nhanvien', 'quanly', 'ehs'],
                forDept: inc.submittedByDept,
                page: 'Báo Cáo Sự Cố',
            });
        },
    });
    const rejectMutation = useMutation({
        mutationFn: async ({ id, reason, ...actor }: {
            id: string;
            reason: string;
            actorId: string;
            actorName: string;
            actorRole: string;
            actorDept?: string;
        }) => {
            const res = await fetch(`/api/incidents/${id}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason, ...actor }),
            });
            if (!res.ok)
                throw new Error('Từ chối thất bại');
            return res.json() as Promise<Incident>;
        },
        onSuccess: (inc, vars) => {
            queryClient.invalidateQueries({ queryKey: ['incidents'] });
            addNotif({
                type: 'reject',
                title: `Sự cố ${inc.code} bị từ chối`,
                message: `${user?.name} từ chối: "${vars.reason}". Vui lòng cập nhật và gửi lại.`,
                forRoles: ['nhanvien', 'quanly'],
                forDept: inc.submittedByDept,
                page: 'Báo Cáo Sự Cố',
            });
            setRejectInputId(null);
            setRejectReason('');
            setViewIncident(null);
        },
    });
    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const areaI18n = safetyLocalizedPayload(form.areaI18n, form.area);
        const descriptionI18n = safetyLocalizedPayload(form.descriptionI18n, form.description);
        const rootCauseDetailI18n = safetyLocalizedPayload(form.rootCauseDetailI18n, form.rootCauseDetail);
        const immediateActionI18n = safetyLocalizedPayload(form.immediateActionI18n, form.immediateAction);
        const correctiveActionI18n = safetyLocalizedPayload(form.correctiveActionI18n, form.correctiveAction);
        const preventiveActionI18n = safetyLocalizedPayload(form.preventiveActionI18n, form.preventiveAction);
        const witnessesI18n = safetyLocalizedPayload(form.witnessesI18n, form.witnesses);
        createMutation.mutate({
            ...form,
            area: safetyLocalizedVi(areaI18n, form.area),
            areaI18n,
            description: safetyLocalizedVi(descriptionI18n, form.description),
            descriptionI18n,
            rootCauseDetail: safetyLocalizedVi(rootCauseDetailI18n, form.rootCauseDetail),
            rootCauseDetailI18n,
            immediateAction: safetyLocalizedVi(immediateActionI18n, form.immediateAction),
            immediateActionI18n,
            correctiveAction: safetyLocalizedVi(correctiveActionI18n, form.correctiveAction),
            correctiveActionI18n,
            preventiveAction: safetyLocalizedVi(preventiveActionI18n, form.preventiveAction),
            preventiveActionI18n,
            witnesses: safetyLocalizedVi(witnessesI18n, form.witnesses),
            witnessesI18n,
            submittedByDept: user?.department ?? form.department,
            submittedById: user?.id ?? 'guest',
            submittedByName: user?.name ?? 'Khách',
            createdByName: user?.name ?? 'Khách',
        });
    }
    function handleApprove(id: string) {
        approveMutation.mutate({
            id,
            actorId: user?.id ?? 'unknown',
            actorName: user?.name ?? 'Unknown',
            actorRole: user?.role ?? 'ehs',
            actorDept: user?.department,
        });
    }
    function handleReject(id: string) {
        if (!rejectReason.trim())
            return;
        rejectMutation.mutate({
            id,
            reason: rejectReason.trim(),
            actorId: user?.id ?? 'unknown',
            actorName: user?.name ?? 'Unknown',
            actorRole: user?.role ?? 'ehs',
            actorDept: user?.department,
        });
    }
    const canApproveIncident = (inc: Incident) => canUserApprove &&
        inc.approvalStatus === EMPTY.approvalStatus &&
        (seeAll || inc.submittedByDept === user?.department || inc.department === user?.department);
    const areaSuggestions = AREA_SUGGESTIONS[form.department] || [];
    return <SafetyI18nRender>{(<div className="safety-incidents-page space-y-5 max-w-7xl mx-auto pb-10">

      {/* ── Stat cards ─────────────────────────────────────── */}
      <div className="safety-incidents-stats grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
            { label: 'Tổng sự cố', val: stats.total, color: '#1565c0' },
            { label: 'Đang điều tra', val: stats.open, color: '#f9a825' },
            { label: 'PENDING', val: stats.pending, color: '#f4511e' },
            { label: 'Đã khắc phục', val: stats.fixed, color: '#22a050' },
            { label: 'Người bị thương', val: stats.injured, color: '#e53935' },
            { label: 'Thiệt hại TS', val: fmtVND(stats.damage), color: '#9c27b0' },
        ].map((s, index) => {
            const StatIcon = [ClipboardList, Clock, AlertTriangle, CheckCircle2, User, Banknote][index] ?? ClipboardList;
            const statNotes = [
                `${visibleIncidents.length} trong phạm vi xem`,
                'Cần cập nhật nguyên nhân',
                'Chờ Leader/EHS',
                'Đã có biện pháp',
                'Theo báo cáo',
                'Ước tính tài sản',
            ];
            return (<div key={s.label} className="safety-incidents-stat bg-card border border-border rounded-xl p-3.5 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: s.color }}/>
            <div className="safety-incidents-stat-main">
              <div className="min-w-0">
                <div className="text-[11px] text-muted-foreground font-semibold mb-1">{s.label}</div>
                <div className={`font-bold font-mono ${typeof s.val === 'number' ? 'text-2xl' : 'text-base'}`} style={{ color: s.color }}>{s.val}</div>
                <p className="safety-incidents-stat-note">{statNotes[index]}</p>
              </div>
              <span className="safety-incidents-stat-icon" style={{ color: s.color, background: `${s.color}12`, borderColor: `${s.color}26` }}>
                <StatIcon className="h-4 w-4"/>
              </span>
            </div>
          </div>);
        })}
      </div>

      {/* ── Toolbar ────────────────────────────────────────── */}
      <div className="safety-incidents-toolbar flex flex-wrap items-center justify-between gap-3">
        {/* Status filter + chart toggle */}
        <div className="safety-incidents-toolbar-left flex gap-2 flex-wrap">
          <div aria-label="Báo cáo sự cố" className="safety-incidents-segmented flex rounded-lg overflow-hidden border border-border text-xs" role="tablist">
            <button aria-controls="incident-list-panel" aria-selected={activeTab === 'list'} className={`safety-incidents-tab-btn inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold transition-all ${activeTab === 'list' ? 'active bg-[#1565c0] text-white' : 'hover:bg-muted'}`} id="incident-list-tab" onClick={() => setActiveTab('list')} role="tab" type="button">
              <ListChecks className="h-3.5 w-3.5"/> Danh sách
            </button>
            <button aria-controls="incident-charts-panel" aria-selected={activeTab === 'charts'} className={`safety-incidents-tab-btn inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold transition-all ${activeTab === 'charts' ? 'active bg-[#1565c0] text-white' : 'hover:bg-muted'}`} id="incident-charts-tab" onClick={() => setActiveTab('charts')} role="tab" type="button">
              <BarChart3 className="h-3.5 w-3.5"/> Biểu đồ
            </button>
          </div>
          {activeTab === 'list' && ['Tất cả', 'Đang điều tra', 'PENDING', 'Đã khắc phục'].map(f => (<button key={f} type="button" aria-pressed={filterStatus === f} onClick={() => setFilterStatus(f)} className={`safety-incidents-filter-chip px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${filterStatus === f ? 'active bg-[#F5C400] text-[#0f2a15] border-[#F5C400]' : 'bg-card border-border hover:border-[#F5C400]'}`}>
              {f}
            </button>))}
        </div>
        {canUserSubmit && (<button type="button" aria-expanded={showForm} aria-controls="incident-create-dialog" onClick={() => {
                if (showForm) {
                    closeIncidentForm();
                    return;
                }
                setIncidentFormStep(1);
                setShowForm(true);
            }} className="safety-incidents-add-btn flex items-center gap-2 px-4 py-2 bg-[#e53935] text-white rounded-lg font-bold text-sm hover:bg-red-700 transition-all">
            {showForm ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>}
            {showForm ? 'Hủy' : 'Báo cáo sự cố mới'}
          </button>)}
      </div>

      {/* ── Charts tab ─────────────────────────────────────── */}
      {activeTab === 'charts' && (<div id="incident-charts-panel" aria-labelledby="incident-charts-tab" className="safety-incidents-chart-panel grid grid-cols-1 lg:grid-cols-2 gap-5" role="tabpanel">
          <div className="safety-incidents-chart-head lg:col-span-2">
            <div>
              <span>Phân tích sự cố</span>
              <strong>{stats.total} hồ sơ · {causeChart.length || 0} nhóm 5M · {deptChart.length || 0} bộ phận</strong>
            </div>
            <p>{causeChart[0] ? `Nhóm nguyên nhân nổi bật hiện tại là ${causeChart[0].name}, cần ưu tiên kiểm chứng hành động khắc phục.` : 'Chưa có đủ dữ liệu để phân tích xu hướng.'}</p>
          </div>
          {/* Type breakdown */}
          <div className="safety-incidents-chart-card bg-card border border-border rounded-xl p-5 shadow-sm">
            <h3 className="font-bold text-sm mb-4">Phân Loại Sự Cố</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={typeChart} cx="45%" cy="50%" outerRadius={80} innerRadius={35} dataKey="value" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {typeChart.map((_, i) => <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]}/>)}
                </Pie>
                <Tooltip formatter={(v: number, n: string) => [`${v} sự cố`, n]} contentStyle={{ fontSize: 12, borderRadius: 8 }}/>
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }}/>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Root cause */}
          <div className="safety-incidents-chart-card bg-card border border-border rounded-xl p-5 shadow-sm">
            <h3 className="font-bold text-sm mb-4">Nguyên Nhân Gốc Rễ (Ishikawa)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={causeChart} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="opacity-10"/>
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false}/>
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={70}/>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}/>
                <Bar dataKey="value" name="Số sự cố" radius={[0, 4, 4, 0]}>
                  {causeChart.map((_, i) => <Cell key={i} fill={['#e53935', '#f9a825', '#22a050', '#1565c0', '#f4511e'][i]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* By department */}
          <div className="safety-incidents-chart-card bg-card border border-border rounded-xl p-5 shadow-sm">
            <h3 className="font-bold text-sm mb-4">Sự Cố Theo Bộ Phận</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={deptChart} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10"/>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false}/>
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}/>
                <Tooltip labelFormatter={(l) => deptChart.find(d => d.name === l)?.full || l} contentStyle={{ fontSize: 12, borderRadius: 8 }}/>
                <Bar dataKey="value" name="Số sự cố" fill="#e53935" radius={[3, 3, 0, 0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Severity */}
          <div className="safety-incidents-chart-card bg-card border border-border rounded-xl p-5 shadow-sm">
            <h3 className="font-bold text-sm mb-4">Phân Bố Mức Độ Nghiêm Trọng</h3>
            <div className="space-y-3 mt-2">
              {sevChart.map(s => (<div key={s.name} className="flex items-center gap-3">
                  <div className="w-24 text-sm font-semibold">{s.name}</div>
                  <div className="flex-1 h-6 bg-muted rounded overflow-hidden relative">
                    <div className="h-full rounded flex items-center px-2" style={{ width: `${Math.max((s.value / stats.total) * 100, 6)}%`, backgroundColor: s.color }}>
                      <span className="text-white text-xs font-bold">{s.value}</span>
                    </div>
                  </div>
                  <div className="w-12 text-right text-xs font-mono font-bold" style={{ color: s.color }}>
                    {Math.round((s.value / stats.total) * 100)}%
                  </div>
                </div>))}
            </div>
          </div>
        </div>)}

      {/* ── Modal – Báo cáo sự cố ─────────────────────────── */}
      {showForm && (<div className="safety-create-modal-backdrop safety-incidents-modal-backdrop fixed inset-0 z-[1400] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="presentation">
          <div aria-labelledby="incident-create-title" aria-modal="true" className="safety-create-modal safety-create-modal-wide safety-incidents-modal bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl" id="incident-create-dialog" role="dialog">
            {/* Modal header */}
            <div className="safety-create-modal-head safety-incidents-modal-head sticky top-0 bg-[#e53935]/10 border-b border-[#e53935]/25 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h3 id="incident-create-title" className="font-bold text-lg text-[#e53935] flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5"/> Báo Cáo Sự Cố Mới
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Điền đầy đủ thông tin để phân tích và phòng ngừa hiệu quả</p>
              </div>
              <button aria-label="Đóng modal báo cáo sự cố" type="button" onClick={closeIncidentForm} className="p-2 rounded-lg hover:bg-[#e53935]/10 text-muted-foreground hover:text-[#e53935] transition-colors">
                <X className="w-5 h-5"/>
              </button>
            </div>
          <form ref={incidentFormRef} onSubmit={handleSubmit} className="safety-create-modal-body safety-create-modal-form safety-incident-wizard-form p-6 space-y-6">

            <div className="safety-incident-wizard-steps" aria-label="Tiến trình báo cáo sự cố">
              {INCIDENT_FORM_STEPS.map(step => (
                <button
                  key={step.id}
                  type="button"
                  className={`safety-incident-wizard-step ${incidentFormStep === step.id ? 'is-active' : ''} ${incidentFormStep > step.id ? 'is-done' : ''}`}
                  onClick={() => setIncidentFormStep(step.id)}
                >
                  <span className="safety-incident-wizard-number">{step.id}</span>
                  <span className="safety-incident-wizard-label">{step.label}</span>
                </button>
              ))}
            </div>

            {/* Block 1: Thời gian & Địa điểm */}
            <fieldset className="safety-incident-form-panel" disabled={incidentFormStep !== 1} hidden={incidentFormStep !== 1}>
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-[#1565c0] text-white flex items-center justify-center text-[10px] font-bold">1</span>
                Thời Gian & Địa Điểm
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="label-form">Ngày xảy ra *</label>
                  <input aria-label="Ngày xảy ra" required type="date" value={form.occurredDate} onChange={e => setForm(p => ({ ...p, occurredDate: e.target.value }))} className="input-form"/>
                </div>
                <div>
                  <label className="label-form">Giờ xảy ra *</label>
                  <input aria-label="Giờ xảy ra" required type="time" value={form.occurredTime} onChange={e => setForm(p => ({ ...p, occurredTime: e.target.value }))} className="input-form"/>
                </div>
                <div>
                  <label className="label-form">Ngày báo cáo</label>
                  <input aria-label="Ngày báo cáo" type="date" value={form.reportedDate} onChange={e => setForm(p => ({ ...p, reportedDate: e.target.value }))} className="input-form"/>
                </div>
                <div>
                  <label className="label-form">Bộ phận *</label>
                  <select aria-label="Bộ phận" required value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value, area: '', areaI18n: emptySafetyLocalizedText() }))} className="input-form">
                    {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <SafetyLocalizedTextField
                    ariaLabel="Khu vực cụ thể"
                    label="Khu vực cụ thể"
                    onChange={value => setForm(p => ({ ...p, areaI18n: value, area: safetyLocalizedVi(value) }))}
                    placeholder="Nhập hoặc chọn gợi ý..."
                    required
                    value={form.areaI18n}
                  />
                  <datalist id="area-list">
                    {areaSuggestions.map(a => <option key={a} value={a}/>)}
                  </datalist>
                  {areaSuggestions.length > 0 && (<div className="flex gap-1.5 mt-1.5 flex-wrap">
                      {areaSuggestions.map(a => (<button key={a} type="button" aria-pressed={form.area === a} onClick={() => setForm(p => ({ ...p, area: a, areaI18n: emptySafetyLocalizedText(a) }))} className={`text-[11px] px-2 py-0.5 rounded border transition-all ${form.area === a ? 'bg-[#1565c0] text-white border-[#1565c0]' : 'border-border hover:border-[#1565c0]'}`}>
                          {a}
                        </button>))}
                    </div>)}
                </div>
              </div>
            </fieldset>

            {/* Block 2: Phân loại */}
            <fieldset className="safety-incident-form-panel" disabled={incidentFormStep !== 2} hidden={incidentFormStep !== 2}>
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-[#e53935] text-white flex items-center justify-center text-[10px] font-bold">2</span>
                Phân Loại Sự Cố
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label-form">Loại sự cố *</label>
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label="Chọn loại sự cố">
                    {INCIDENT_TYPES.map(t => (<button key={t} type="button" aria-pressed={form.type === t} onClick={() => handleTypeChange(t)} className={`text-xs px-2.5 py-2 rounded-lg border font-semibold text-left transition-all ${form.type === t ? 'bg-[#e53935] text-white border-[#e53935]' : 'border-border hover:border-[#e53935]/50'}`}>
                        {t}
                      </button>))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Gợi ý mức độ: <span className="font-bold" style={{ color: SEV_COLORS[form.severity].text }}>{form.severity}</span>
                  </p>
                </div>
                <div>
                  <label className="label-form">Mức độ nghiêm trọng *</label>
                  <div className="space-y-2" role="group" aria-label="Chọn mức độ nghiêm trọng">
                    {(['Nguy hiểm', 'HIGH', 'MEDIUM', 'Nhẹ'] as Severity[]).map(s => {
                const c = SEV_COLORS[s];
                return (<button key={s} type="button" aria-pressed={form.severity === s} onClick={() => setForm(p => ({ ...p, severity: s }))} className={`w-full text-xs px-3 py-2 rounded-lg border font-semibold text-left transition-all ${form.severity === s ? 'text-white' : 'border-border hover:opacity-80'}`} style={form.severity === s ? { backgroundColor: c.text, borderColor: c.text } : { borderColor: c.border, color: c.text, backgroundColor: c.bg }}>
                          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle ring-1 ring-black/20" style={{ backgroundColor: form.severity === s ? '#fff' : c.text }}/>
                          {s}
                        </button>);
            })}
                  </div>
                </div>
              </div>
            </fieldset>

            {/* Block 3: Mô tả & Nguyên nhân */}
            <fieldset className="safety-incident-form-panel" disabled={incidentFormStep !== 3} hidden={incidentFormStep !== 3}>
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-[#f9a825] text-white flex items-center justify-center text-[10px] font-bold">3</span>
                Mô Tả & Phân Tích Nguyên Nhân
              </h4>
              <div className="space-y-3">
                <SafetyLocalizedTextField
                  ariaLabel="Mô tả sự cố"
                  inputClassName="input-form resize-none"
                  label="Mô tả chi tiết sự cố"
                  onChange={value => setForm(p => ({ ...p, descriptionI18n: value, description: safetyLocalizedVi(value) }))}
                  placeholder="Mô tả đầy đủ: diễn biến, điều kiện lúc xảy ra, người liên quan..."
                  required
                  rows={3}
                  textarea
                  value={form.descriptionI18n}
                />
                <div>
                  <label className="label-form">Nguyên nhân gốc rễ (theo Ishikawa 5M) *</label>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-2" role="group" aria-label="Chọn nhóm nguyên nhân gốc rễ">
                    {ROOT_CAUSE_OPTIONS.map(opt => (<button key={opt.value} type="button" aria-pressed={form.rootCauseCategory === opt.value} onClick={() => setForm(p => ({ ...p, rootCauseCategory: opt.value }))} className={`text-xs px-2.5 py-2 rounded-lg border font-semibold text-left transition-all ${form.rootCauseCategory === opt.value ? 'bg-[#f9a825] text-[#0f2a15] border-[#f9a825]' : 'border-border hover:border-[#f9a825]/50'}`}>
                        <span className="mb-1 flex items-center gap-1.5">
                          {React.createElement(ROOT_CAUSE_ICONS[opt.value], { className: 'h-3.5 w-3.5 shrink-0' })}
                          {opt.label}
                        </span>
                        <div className={`mt-0.5 font-normal ${form.rootCauseCategory === opt.value ? 'text-[#0f2a15]/70' : 'text-muted-foreground'} text-[10px] leading-snug`}>{opt.hint}</div>
                      </button>))}
                  </div>
                  <SafetyLocalizedTextField
                    ariaLabel="Chi tiết nguyên nhân gốc rễ"
                    inputClassName="input-form resize-none"
                    label="Chi tiết nguyên nhân gốc rễ"
                    onChange={value => setForm(p => ({ ...p, rootCauseDetailI18n: value, rootCauseDetail: safetyLocalizedVi(value) }))}
                    placeholder="Mô tả chi tiết nguyên nhân cụ thể..."
                    rows={2}
                    textarea
                    value={form.rootCauseDetailI18n}
                  />
                </div>
              </div>
            </fieldset>

            {/* Block 4: Thương vong & Thiệt hại */}
            <fieldset className="safety-incident-form-panel" disabled={incidentFormStep !== 4} hidden={incidentFormStep !== 4}>
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-[#9c27b0] text-white flex items-center justify-center text-[10px] font-bold">4</span>
                Thương Vong & Thiệt Hại Tài Sản
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="label-form">Số người bị thương</label>
                  <input aria-label="Số người bị thương" type="number" min={0} value={form.injuredCount} onChange={e => setForm(p => ({ ...p, injuredCount: parseInt(e.target.value) || 0 }))} className="input-form"/>
                </div>
                <div className="flex items-end gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.firstAidGiven} onChange={e => setForm(p => ({ ...p, firstAidGiven: e.target.checked }))} className="w-4 h-4 accent-[#22a050]"/>
                    <span className="text-sm font-medium">Đã sơ cấp cứu</span>
                  </label>
                </div>
                <div className="flex items-end gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.propertyDamage} onChange={e => setForm(p => ({ ...p, propertyDamage: e.target.checked, propertyDamageVND: e.target.checked ? p.propertyDamageVND : 0 }))} className="w-4 h-4 accent-[#e53935]"/>
                    <span className="text-sm font-medium">Thiệt hại TS</span>
                  </label>
                </div>
                {form.propertyDamage && (<div>
                    <label className="label-form">Thiệt hại ước tính (VNĐ)</label>
                    <input aria-label="Thiệt hại tài sản VND" type="number" min={0} value={form.propertyDamageVND || ''} onChange={e => setForm(p => ({ ...p, propertyDamageVND: parseInt(e.target.value) || 0 }))} className="input-form" placeholder="0"/>
                  </div>)}
              </div>
              {(form.injuredCount ?? 0) > 0 && (<div className="mt-3">
                  <label className="label-form">Bộ phận cơ thể bị ảnh hưởng</label>
                  <div className="flex flex-wrap gap-2 mt-1" role="group" aria-label="Chọn bộ phận cơ thể bị ảnh hưởng">
                    {BODY_PARTS.map(bp => (<button key={bp} type="button" aria-pressed={form.bodyPartsAffected.includes(bp)} onClick={() => toggleBodyPart(bp)} className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold transition-all ${form.bodyPartsAffected.includes(bp) ? 'bg-[#e53935] text-white border-[#e53935]' : 'border-border hover:border-[#e53935]/50'}`}>
                        {bp}
                      </button>))}
                  </div>
                </div>)}
            </fieldset>

            {/* Block 5: Hành động */}
            <fieldset className="safety-incident-form-panel" disabled={incidentFormStep !== 5} hidden={incidentFormStep !== 5}>
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-[#22a050] text-white flex items-center justify-center text-[10px] font-bold">5</span>
                Hành Động Xử Lý & Phòng Ngừa
              </h4>
              <div className="space-y-3">
                <SafetyLocalizedTextField
                  ariaLabel="Hành động xử lý ngay"
                  inputClassName="input-form resize-none"
                  label="Hành động tức thời đã thực hiện"
                  onChange={value => setForm(p => ({ ...p, immediateActionI18n: value, immediateAction: safetyLocalizedVi(value) }))}
                  placeholder="Mô tả hành động xử lý ngay tại hiện trường..."
                  required
                  rows={2}
                  textarea
                  value={form.immediateActionI18n}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SafetyLocalizedTextField
                    ariaLabel="Hành động khắc phục"
                    inputClassName="input-form resize-none"
                    label="Hành động khắc phục"
                    onChange={value => setForm(p => ({ ...p, correctiveActionI18n: value, correctiveAction: safetyLocalizedVi(value) }))}
                    placeholder="Sửa chữa, thay thế, cập nhật quy trình..."
                    rows={2}
                    textarea
                    value={form.correctiveActionI18n}
                  />
                  <SafetyLocalizedTextField
                    ariaLabel="Hành động phòng ngừa"
                    inputClassName="input-form resize-none"
                    label="Hành động phòng ngừa tái diễn"
                    onChange={value => setForm(p => ({ ...p, preventiveActionI18n: value, preventiveAction: safetyLocalizedVi(value) }))}
                    placeholder="Đào tạo, biển báo, kiểm soát thiết bị..."
                    rows={2}
                    textarea
                    value={form.preventiveActionI18n}
                  />
                </div>
              </div>
            </fieldset>

            {/* Block 6: Nhân sự */}
            <fieldset className="safety-incident-form-panel" disabled={incidentFormStep !== 6} hidden={incidentFormStep !== 6}>
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-[#00a99d] text-white flex items-center justify-center text-[10px] font-bold">6</span>
                Thông Tin Nhân Sự
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="label-form">Người báo cáo *</label>
                  <input aria-label="Người báo cáo" required value={form.reporterName} onChange={e => setForm(p => ({ ...p, reporterName: e.target.value }))} className="input-form" placeholder="Họ và tên..."/>
                </div>
                <div>
                  <label className="label-form">Số điện thoại</label>
                  <input aria-label="Số điện thoại người báo cáo" value={form.reporterPhone} onChange={e => setForm(p => ({ ...p, reporterPhone: e.target.value }))} className="input-form" placeholder="09xx..."/>
                </div>
                <div>
                  <label className="label-form">Người xử lý</label>
                  <input aria-label="Người xử lý" value={form.handlerName} onChange={e => setForm(p => ({ ...p, handlerName: e.target.value }))} className="input-form" placeholder="Họ và tên..."/>
                </div>
                <SafetyLocalizedTextField
                  ariaLabel="Nhân chứng"
                  label="Nhân chứng"
                  onChange={value => setForm(p => ({ ...p, witnessesI18n: value, witnesses: safetyLocalizedVi(value) }))}
                  placeholder="Tên nhân chứng, phân cách bởi dấu phẩy..."
                  value={form.witnessesI18n}
                />
              </div>
            </fieldset>

            <div className="safety-incident-form-footer flex gap-3 pt-2 border-t border-border">
              <button type="button" onClick={closeIncidentForm} className="px-6 py-2.5 border border-border rounded-lg font-semibold text-sm hover:bg-muted">
                Hủy
              </button>
              <div className="safety-incident-form-footer-spacer" />
              {incidentFormStep > 1 && (
                <button type="button" onClick={previousIncidentFormStep} className="px-6 py-2.5 border border-border rounded-lg font-semibold text-sm hover:bg-muted">
                  Trước
                </button>
              )}
              {incidentFormStep < INCIDENT_FORM_STEPS.length ? (
                <button type="button" onClick={nextIncidentFormStep} className="flex items-center justify-center gap-2 px-7 py-2.5 bg-[#2563eb] text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition-all">
                  Tiếp tục <ChevronRight className="h-4 w-4"/>
                </button>
              ) : (
                <button type="submit" className="flex items-center justify-center gap-2 px-8 py-2.5 bg-[#e53935] text-white rounded-lg font-bold text-sm hover:bg-red-700 transition-all">
                  <AlertTriangle className="h-4 w-4"/> Lưu báo cáo
                </button>
              )}
            </div>
          </form>
          </div>
        </div>)}

      {/* ── Incident list ───────────────────────────────────── */}
      {viewIncident && (() => {
            const inc = viewIncident;
            const sev = SEV_COLORS[inc.severity] || SEV_COLORS['MEDIUM'];
            const stColor = ST_COLOR[inc.status] || '#1565c0';
            const RootIcon = ROOT_CAUSE_ICONS[inc.rootCauseCategory] || ClipboardList;
            return (<div aria-labelledby="incident-detail-title" aria-modal="true" className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" role="dialog">
            <button aria-label="Đóng chi tiết sự cố" className="absolute inset-0 cursor-default" onClick={() => { setViewIncident(null); setRejectInputId(null); setRejectReason(''); }} type="button"/>
            <section className="safety-incidents-detail-modal relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
              <header className="safety-incidents-detail-modal-head flex shrink-0 items-start justify-between gap-4 border-b border-border bg-muted/20 px-5 py-4">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-black text-[#1565c0]">{inc.code}</span>
                    <span className="rounded-md px-2 py-0.5 text-xs font-bold" style={{ color: sev.text, background: sev.bg }}>{inc.severity}</span>
                    <span className="rounded-md px-2 py-0.5 text-xs font-bold" style={{ color: stColor, background: `${stColor}18` }}>{inc.status}</span>
                    <span className="rounded-md bg-[#f9a825]/10 px-2 py-0.5 text-xs font-bold text-[#a46a00]">{inc.approvalStatus}</span>
                  </div>
                  <h3 id="incident-detail-title" className="text-base font-black leading-tight text-foreground">{inc.type}</h3>
                  <p className="mt-1 text-sm font-semibold leading-snug text-foreground/75">{incidentText(inc, 'description')}</p>
                </div>
                <button aria-label="Đóng chi tiết sự cố" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" onClick={() => { setViewIncident(null); setRejectInputId(null); setRejectReason(''); }} type="button">
                  <X className="h-4 w-4"/>
                </button>
              </header>

              <div className="safety-incidents-detail-modal-body min-h-0 flex-1 overflow-y-auto p-5">
                <div className="safety-incidents-detail-summary">
                  <div>
                    <span>Nhóm 5M</span>
                    <strong>{inc.rootCauseCategory}</strong>
                  </div>
                  <div>
                    <span>Bộ phận / khu vực</span>
                    <strong>{inc.department} · {incidentText(inc, 'area')}</strong>
                  </div>
                  <div>
                    <span>Thương vong</span>
                    <strong>{inc.injuredCount ?? 0} người</strong>
                  </div>
                  <div>
                    <span>Người xử lý</span>
                    <strong>{inc.handlerName || inc.reporterName || 'Chưa phân công'}</strong>
                  </div>
                </div>
                <div className="safety-incidents-detail-modal-grid">
                  <section className="safety-incidents-detail-section">
                    <h4><CalendarDays className="h-4 w-4"/> Thời gian & địa điểm</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Detail label="Ngày xảy ra" value={`${inc.occurredDate} ${inc.occurredTime}`}/>
                      <Detail label="Ngày báo cáo" value={inc.reportedDate || '—'}/>
                      <Detail label="Bộ phận" value={inc.department}/>
                      <Detail label="Khu vực" value={incidentText(inc, 'area')}/>
                    </div>
                  </section>

                  <section className="safety-incidents-detail-section">
                    <h4><AlertTriangle className="h-4 w-4"/> Phân loại sự cố</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Detail label="Loại sự cố" value={inc.type}/>
                      <Detail label="Mức độ" value={inc.severity}/>
                      <Detail label="Trạng thái xử lý" value={inc.status}/>
                      <Detail label="Trạng thái duyệt" value={inc.approvalStatus}/>
                    </div>
                  </section>

                  <section className="safety-incidents-detail-section wide">
                    <h4><RootIcon className="h-4 w-4"/> Nguyên nhân gốc rễ - Ishikawa 5M</h4>
                    <div className="safety-incidents-rootcause-grid">
                      {ROOT_CAUSE_OPTIONS.map(opt => {
                    const Icon = ROOT_CAUSE_ICONS[opt.value];
                    const active = opt.value === inc.rootCauseCategory;
                    return (<div key={opt.value} className={`safety-incidents-rootcause-card ${active ? 'active' : ''}`}>
                            <span><Icon className="h-4 w-4"/> {opt.label}</span>
                            <small>{active ? incidentText(inc, 'rootCauseDetail') : opt.hint}</small>
                          </div>);
                })}
                    </div>
                  </section>

                  <section className="safety-incidents-detail-section">
                    <h4><Banknote className="h-4 w-4"/> Thương vong & thiệt hại</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Detail label="Số người bị thương" value={`${inc.injuredCount ?? 0}`}/>
                      <Detail label="Bộ phận bị thương" value={inc.bodyPartsAffected.length ? inc.bodyPartsAffected.join(', ') : '—'}/>
                      <Detail label="Sơ cấp cứu" value={inc.firstAidGiven ? 'Đã thực hiện' : 'Không ghi nhận'}/>
                      <Detail label="Thiệt hại tài sản" value={inc.propertyDamage ? fmtVND(inc.propertyDamageVND ?? inc.estimatedCost ?? 0) : 'Không ghi nhận'}/>
                    </div>
                  </section>

                  <section className="safety-incidents-detail-section">
                    <h4><ClipboardList className="h-4 w-4"/> Hành động xử lý</h4>
                    <div className="grid gap-3">
                      <Detail label="Hành động tức thời" value={incidentText(inc, 'immediateAction') || '—'}/>
                      <Detail label="Hành động khắc phục" value={incidentText(inc, 'correctiveAction') || '—'}/>
                      <Detail label="Phòng ngừa tái diễn" value={incidentText(inc, 'preventiveAction') || '—'}/>
                    </div>
                  </section>

                  <section className="safety-incidents-detail-section">
                    <h4><User className="h-4 w-4"/> Nhân sự liên quan</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Detail label="Người báo cáo" value={`${inc.reporterName || '—'} ${inc.reporterPhone ? '(' + inc.reporterPhone + ')' : ''}`}/>
                      <Detail label="Người xử lý" value={inc.handlerName || '—'}/>
                      <Detail label="Nhân chứng" value={incidentText(inc, 'witnesses') || '—'}/>
                      <Detail label="Bộ phận gửi" value={inc.submittedByDept || inc.department}/>
                    </div>
                  </section>
                </div>

                {inc.rejectionReason && (<div className="mt-4 rounded-lg border border-[#e53935]/25 bg-[#e53935]/8 px-3 py-2 text-sm">
                    <span className="font-bold text-[#e53935]">Lý do từ chối: </span>
                    <span className="text-foreground">{inc.rejectionReason}</span>
                  </div>)}
              </div>

              {canApproveIncident(inc) && (<footer className="safety-incidents-detail-modal-foot shrink-0 border-t border-border bg-background px-5 py-4">
                  {rejectInputId === inc.id ? (<div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                      <input aria-label={`Lý do từ chối sự cố ${inc.code}`} autoFocus className="min-h-10 flex-1 rounded-lg border border-[#e53935]/40 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e53935]/30" onChange={e => setRejectReason(e.target.value)} placeholder="Nhập lý do từ chối..." value={rejectReason}/>
                      <button aria-label={`Xác nhận từ chối sự cố ${inc.code}`} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#e53935] px-4 py-2 text-xs font-black text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40" disabled={!rejectReason.trim()} onClick={() => handleReject(inc.id)} type="button">
                        Xác nhận
                      </button>
                      <button className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 py-2 text-xs font-bold transition-colors hover:bg-muted" onClick={() => { setRejectInputId(null); setRejectReason(''); }} type="button">
                        Hủy
                      </button>
                    </div>) : (<div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <button aria-label={`Phê duyệt sự cố ${inc.code}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#22a050] px-5 py-2 text-xs font-black text-white transition-colors hover:bg-green-700" onClick={() => handleApprove(inc.id)} type="button">
                        <CheckCircle2 className="h-4 w-4"/> Phê duyệt
                      </button>
                      <button aria-label={`Từ chối sự cố ${inc.code}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#e53935] px-5 py-2 text-xs font-black text-white transition-colors hover:bg-red-700" onClick={() => { setRejectInputId(inc.id); setRejectReason(''); }} type="button">
                        <XCircle className="h-4 w-4"/> Từ chối
                      </button>
                    </div>)}
                </footer>)}
            </section>
          </div>);
        })()}

      {activeTab === 'list' && (<div id="incident-list-panel" aria-labelledby="incident-list-tab" className="safety-incidents-list space-y-3" role="tabpanel">
          <div className="safety-incidents-board-head">
            <div className="safety-incidents-board-title">
              <span className="safety-incidents-board-icon"><AlertTriangle className="h-4 w-4"/></span>
              <div>
                <span>Điều tra sự cố</span>
                <strong>Sự cố cần theo dõi</strong>
              </div>
            </div>
            <div className="safety-incidents-board-meta">
              <span>{filtered.length} sự cố sau lọc</span>
              <span>{stats.open} đang điều tra · {stats.injured} người bị thương</span>
              {causeChart[0] && <span>5M nổi bật: {causeChart[0].name}</span>}
            </div>
          </div>
          {pagedIncidents.map(inc => {
                const sev = SEV_COLORS[inc.severity] || SEV_COLORS['MEDIUM'];
                const stColor = ST_COLOR[inc.status] || '#1565c0';
                const RootIcon = ROOT_CAUSE_ICONS[inc.rootCauseCategory] || ClipboardList;
                return (<div key={inc.id} className="safety-incidents-card bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <button type="button" aria-label={`Xem chi tiết sự cố ${inc.code}`} className="safety-incidents-card-trigger w-full text-left px-4 py-4 flex items-start gap-4 hover:bg-muted/20 transition-colors" onClick={() => { setViewIncident(inc); setRejectInputId(null); setRejectReason(''); }} title={`Xem chi tiết sự cố ${inc.code}`}>
                  {/* Severity indicator */}
                  <div className="safety-incidents-severity-bar w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: sev.text }}/>
                  <div className="safety-incidents-card-copy flex-1 min-w-0">
                    <div className="safety-incidents-card-meta flex items-center gap-3 flex-wrap">
                      <span className="safety-incidents-code font-mono font-bold text-xs" style={{ color: '#1565c0' }}>{inc.code}</span>
                      <span className="safety-incidents-pill severity px-2 py-0.5 rounded text-xs font-bold" style={{ color: sev.text, background: sev.bg }}>{inc.severity}</span>
                      <span className="safety-incidents-pill status px-2 py-0.5 rounded text-xs font-bold" style={{ color: stColor, background: `${stColor}18` }}>{inc.status}</span>
                      {inc.approvalStatus === 'PENDING' && <span className="safety-incidents-pill approval pending inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border" style={{ color: '#f9a825', borderColor: '#f9a82540', background: '#f9a82512' }}><Clock className="h-3 w-3"/> Chờ duyệt</span>}
                      {inc.approvalStatus === 'APPROVED' && <span className="safety-incidents-pill approval approved inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold" style={{ color: '#22a050', background: '#22a05012' }}><CheckCircle2 className="h-3 w-3"/> Đã duyệt</span>}
                      {inc.approvalStatus === 'REJECTED' && <span className="safety-incidents-pill approval rejected inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold" style={{ color: '#e53935', background: '#e5393512' }}><XCircle className="h-3 w-3"/> Từ chối</span>}
                      <span className="safety-incidents-type text-xs text-muted-foreground">{inc.type}</span>
                    </div>
                    <div className="safety-incidents-card-title-row">
                      <p className="safety-incidents-description text-sm font-semibold mt-2 leading-snug text-foreground break-words">{incidentText(inc, 'description')}</p>
                      <span className="safety-incidents-card-owner">{inc.handlerName || inc.reporterName || 'Chưa phân công'}</span>
                    </div>
                    <div className="safety-incidents-card-cause">
                      <span><RootIcon className="h-3.5 w-3.5"/> 5M: {inc.rootCauseCategory}</span>
                      <strong>{incidentText(inc, 'rootCauseDetail')}</strong>
                    </div>
                    <div className="safety-incidents-card-ops">
                      <span>{inc.firstAidGiven ? 'Đã sơ cấp cứu' : 'Chưa ghi nhận sơ cấp cứu'}</span>
                      <span>{inc.propertyDamage ? `Thiệt hại ${fmtVND(inc.propertyDamageVND ?? inc.estimatedCost ?? 0)}` : 'Không ghi nhận thiệt hại tài sản'}</span>
                      <span>{incidentText(inc, 'immediateAction') || 'Chưa có hành động tức thời'}</span>
                    </div>
                    <div className="safety-incidents-card-facts flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5"/> {inc.occurredDate} {inc.occurredTime}</span>
                      <span className="inline-flex items-center gap-1"><Factory className="h-3.5 w-3.5"/> {inc.department} – {incidentText(inc, 'area')}</span>
                      {(inc.injuredCount ?? 0) > 0 && <span className="inline-flex items-center gap-1 text-[#e53935] font-semibold"><AlertTriangle className="h-3.5 w-3.5"/> {inc.injuredCount} người bị thương</span>}
                      {inc.propertyDamage && <span className="inline-flex items-center gap-1 text-[#9c27b0] font-semibold"><Banknote className="h-3.5 w-3.5"/> {fmtVND(inc.propertyDamageVND ?? 0)}</span>}
                    </div>
                  </div>
                  <span className="safety-incidents-view-icon inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors">
                    <Eye className="h-4 w-4"/>
                  </span>
                </button>
              </div>);
            })}
          {filtered.length === 0 && (<div className="safety-incidents-empty text-center py-12 text-muted-foreground">Không có sự cố nào</div>)}
          {filtered.length > 0 && (<div className="safety-incidents-footer flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
              <span className="text-xs font-semibold text-muted-foreground">
                Hiển thị {displayStart}-{displayEnd} / {filtered.length} sự cố
              </span>
              <div className="flex items-center gap-2">
                <button aria-label="Trang sự cố trước" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40" disabled={currentIncidentPage <= 1} onClick={() => setIncidentPage(page => Math.max(1, page - 1))} type="button">
                  <ChevronLeft className="h-4 w-4"/>
                </button>
                <span className="min-w-20 text-center text-xs font-bold text-foreground">
                  Trang {currentIncidentPage}/{totalIncidentPages}
                </span>
                <button aria-label="Trang sự cố sau" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40" disabled={currentIncidentPage >= totalIncidentPages} onClick={() => setIncidentPage(page => Math.min(totalIncidentPages, page + 1))} type="button">
                  <ChevronRight className="h-4 w-4"/>
                </button>
              </div>
            </div>)}
        </div>)}
    </div>)}</SafetyI18nRender>;
}
function Detail({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div className="safety-incidents-detail-item">
      <div className="safety-incidents-detail-label text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">{label}</div>
      <div className="safety-incidents-detail-value text-sm">{value}</div>
    </div>);
}
