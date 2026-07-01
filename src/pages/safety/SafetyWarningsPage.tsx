import React, { useEffect, useState, useMemo, useRef } from 'react';
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
const OTHER_SUB = '__other__';
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
}
const EMPTY_FORM = {
    titleI18n: emptySafetyLocalizedText(),
    title: '', category: CATEGORIES[0].value as WCategory, subcategory: '',
    areaI18n: emptySafetyLocalizedText(),
    department: DEPARTMENTS[0], area: '',
    productionLine: '', machineName: '', locationDetail: '',
    descriptionI18n: emptySafetyLocalizedText(),
    currentControlI18n: emptySafetyLocalizedText(),
    proposedActionI18n: emptySafetyLocalizedText(),
    riskProbability: 3, riskConsequence: 3,
    description: '', currentControl: '', proposedAction: '',
    evidenceNotesI18n: emptySafetyLocalizedText(),
    relatedStandardI18n: emptySafetyLocalizedText(),
    responsiblePerson: '', deadline: '',
    reporterName: '', detectedAt: '', evidenceNotes: '', relatedStandard: '',
    coordinator: '', additionalNotes: '', additionalNotesI18n: emptySafetyLocalizedText(),
    status: 'OPEN' as WStatus,
    approvalStatus: 'PENDING' as ApprovalStatus,
    submittedByDept: '',
    submittedById: '',
};
const getWarningFormSteps = (t: any) => [
    { id: 1, title: t('step1Title'), desc: t('step1Desc') },
    { id: 2, title: t('step2Title'), desc: t('step2Desc') },
    { id: 3, title: t('step3Title'), desc: t('step3Desc') },
    { id: 4, title: t('step4Title'), desc: t('step4Desc') },
    { id: 5, title: t('step5Title'), desc: t('step5Desc') },
    { id: 6, title: t('step6Title'), desc: t('step6Desc') },
];
const WARNING_FORM_LAST_STEP = 6;
const getRiskProbabilityOptions = (t: any) => [
    { v: 5, label: t('riskProbAlmostCertain'), desc: t('riskProbAlmostCertainDesc') },
    { v: 4, label: t('riskProbLikely'), desc: t('riskProbLikelyDesc') },
    { v: 3, label: t('riskProbPossible'), desc: t('riskProbPossibleDesc') },
    { v: 2, label: t('riskProbUnlikely'), desc: t('riskProbUnlikelyDesc') },
    { v: 1, label: t('riskProbRare'), desc: t('riskProbRareDesc') },
];
const getRiskConsequenceOptions = (t: any) => [
    { v: 5, label: t('riskConsCatastrophic'), desc: t('riskConsCatastrophicDesc') },
    { v: 4, label: t('riskConsMajor'), desc: t('riskConsMajorDesc') },
    { v: 3, label: t('riskConsModerate'), desc: t('riskConsModerateDesc') },
    { v: 2, label: t('riskConsMinor'), desc: t('riskConsMinorDesc') },
    { v: 1, label: t('riskConsNegligible'), desc: t('riskConsNegligibleDesc') },
];
const getRiskBandForScore = (score: number, t: any) => {
    if (score >= 15)
        return { label: t('riskBandCritical'), className: 'critical', guide: t('riskBandCriticalGuide') };
    if (score >= 8)
        return { label: t('riskBandHigh'), className: 'high', guide: t('riskBandHighGuide') };
    if (score >= 4)
        return { label: t('riskBandMedium'), className: 'medium', guide: t('riskBandMediumGuide') };
    return { label: t('riskBandLow'), className: 'low', guide: t('riskBandLowGuide') };
};
/* ─── Risk Matrix visual ──────────────────────────────── */
function RiskMatrixViz({ prob, cons, onSelect, t }: {
    prob: number;
    cons: number;
    onSelect?: (probability: number, consequence: number) => void;
    t: any;
}) {
    const cellMeta = (r: number, c: number) => {
        const s = r * c;
        if (s >= 15)
            return { color: '#ff1f1f', band: 'critical' };
        if (s >= 8)
            return { color: '#f47c2b', band: 'high' };
        if (s >= 4)
            return { color: '#fff200', band: 'medium' };
        return { color: '#0fb45f', band: 'low' };
    };
    return (<div className="safety-warning-company-matrix">
      <div className="safety-warning-matrix-head">
        <strong>{t("riskMatrixTitle")}</strong>
        <span>{t("riskMatrixRef")}</span>
      </div>
      <div className="safety-warning-matrix-table" role="group" aria-label={t("riskMatrixAriaLabel")}>
        <div className="safety-warning-matrix-corner">{t("consequenceLabel")}</div>
        {[1, 2, 3, 4, 5].map(c => (<div className="safety-warning-matrix-axis top" key={c}>
          <strong>{c}</strong>
          <span>{getRiskConsequenceOptions(t).find(opt => opt.v === c)?.label}</span>
        </div>))}
        {[5, 4, 3, 2, 1].map(r => (<React.Fragment key={r}>
          <div className="safety-warning-matrix-axis left">
            <strong>{r}</strong>
            <span>{getRiskProbabilityOptions(t).find(opt => opt.v === r)?.label}</span>
          </div>
          {[1, 2, 3, 4, 5].map(c => {
                const score = r * c;
                const isActive = r === prob && c === cons;
                const meta = cellMeta(r, c);
                return (<button key={c} aria-label={`${t("probabilityLabel")} ${r}, ${t("consequenceLabel")} ${c}, ${t("riskScoreLabel")} ${score}`} aria-pressed={isActive} className={`safety-warning-matrix-cell ${meta.band} ${isActive ? 'active' : ''}`} onClick={() => onSelect?.(r, c)} style={{ backgroundColor: meta.color }} type="button">
                    {score}
                  </button>);
            })}
        </React.Fragment>))}
      </div>
      <div className="safety-warning-matrix-axis-caption">
        <span>{t("probabilityLabel")}</span>
        <span>{t("consequenceLabel")}</span>
      </div>
      <div className="safety-warning-matrix-legend" aria-label={t("riskLevelLabel")}>
        <span className="low">1-3 {t("priorityLow")}</span>
        <span className="medium">4-6 {t("priorityMedium")}</span>
        <span className="high">8-12 {t("priorityHigh")}</span>
        <span className="critical">15-25 {t("priorityVeryHigh")}</span>
      </div>
    </div>);
}
/* ─── Detail Field ────────────────────────────────────── */
function DField({ label, value, full }: {
    label: string;
    value: string;
    full?: boolean;
}) {
    return (<div className={`safety-warning-detail-field ${full ? 'col-span-full' : ''}`}>
      <div className="safety-warning-detail-label text-[11px] font-semibold uppercase tracking-wider text-foreground/50 mb-1">{label}</div>
      <div className="safety-warning-detail-value text-sm text-foreground leading-relaxed">{value || '—'}</div>
    </div>);
}
/* ─── Warning Detail Modal ────────────────────────────── */
function WarningDetailModal({ lang, warning, onClose, onStatusChange, }: {
    lang: string;
    warning: Warning;
    onClose: () => void;
    onStatusChange: (id: string, status: WStatus) => void;
}) {
    const rc = getRiskColor(warning.riskLevel);
    const { t } = useHubLanguage();
    const stColor = WSTATUS_COLORS[warning.status];
    const CategoryIcon = CATEGORY_ICONS[warning.category] || ShieldAlert;
    const wt = (key: keyof Warning) => localizedText(warning[`${String(key)}I18n` as keyof Warning] as LocalizedContent | undefined, lang, String(warning[key] || ''));
    return (<div className="fixed inset-0 z-[1400] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}/>
      <div aria-label={`Chi tiết cảnh báo ${warning.code}`} aria-modal="true" className="safety-warning-modal-shell relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" role="dialog">
        <div className="h-1 w-full shrink-0" style={{ background: `linear-gradient(90deg,${rc.text},${rc.text}80)` }}/>
        <div className="safety-warning-modal-header px-6 py-4 border-b border-border/60 flex items-start justify-between shrink-0 bg-muted/20">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-[#1565c0]">
              <CategoryIcon className="h-5 w-5"/>
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-mono font-bold text-xs text-[#1565c0]">{warning.code}</span>
                <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ color: rc.text, background: rc.bg }}>{t(`enum${warning.riskLevel}` as any) || warning.riskLevel} (×{warning.riskScore})</span>
                <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ color: stColor, background: `${stColor}18` }}>{t(`enum${warning.status}` as any) || warning.status}</span>
              </div>
              <h3 className="font-bold text-[15px] text-foreground leading-tight">{wt('title')}</h3>
              <p className="text-[12px] text-foreground/60 mt-0.5">{t(`cat${warning.category}` as any) || warning.category}{warning.subcategory ? ` · ${warning.subcategory ? t(`sub_${warning.subcategory}` as any) || warning.subcategory : ""}` : ''}</p>
            </div>
          </div>
          <button aria-label="Đóng chi tiết cảnh báo" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-muted transition-all shrink-0 ml-3" type="button">
            <X className="w-4 h-4"/>
          </button>
        </div>

        <div className="safety-modal-body overflow-y-auto flex-1 p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <DField label="Bộ phận" value={warning.department}/>
            <DField label="Khu vực" value={wt('area')}/>
            <DField label="Ngày tạo" value={formatWarningDisplayDate(warning.createdDate ?? warning.createdAt, t)}/>
            <DField label="Hạn xử lý" value={formatWarningDisplayDate(warning.deadline, t)}/>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground/50 mb-2">Đánh giá rủi ro</div>
            <div className="flex items-center gap-4 p-3 rounded-xl border-2" style={{ borderColor: rc.text, background: rc.bg }}>
              <div className="text-center shrink-0">
                <div className="text-3xl font-black font-mono" style={{ color: rc.text }}>{warning.riskScore}</div>
                <div className="text-[10px] font-semibold text-foreground/60">Điểm rủi ro</div>
              </div>
              <div>
                <div className="font-bold text-sm" style={{ color: rc.text }}>{t(`enum${warning.riskLevel}` as any) || warning.riskLevel}</div>
                <div className="text-xs text-foreground/60 mt-0.5">Xác suất {warning.riskProbability}/5 · Hậu quả {warning.riskConsequence}/5</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DField label={t("descriptionLabel")} value={wt('description')} full/>
            <DField label={t("currentControlLabel")} value={wt('currentControl')}/>
            <DField label={t("proposedActionLabel")} value={wt('proposedAction')}/>
            <DField label={t("relatedStandardLabel")} value={wt('relatedStandard')}/>
            <DField label={t("assigneeLabel")} value={warning.responsiblePerson}/>
            <DField label={t("reporterLabel")} value={warning.reporterName}/>
          </div>

          {wt('evidenceNotes') && (<DField label={t("evidenceNotesLabel")} value={wt('evidenceNotes')}/>)}

          {warning.attachmentNames && warning.attachmentNames.length > 0 && (<div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground/50 mb-2">Tệp đính kèm ({warning.attachmentNames.length})</div>
              <div className="flex flex-wrap gap-2">
                {warning.attachmentNames.map((name, i) => (<div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-lg text-xs font-medium text-foreground/80 border border-border">
                    <Paperclip className="w-3 h-3 text-foreground/50"/> {name}
                  </div>))}
              </div>
            </div>)}
        </div>

        <div className="px-6 py-4 border-t border-border/50 flex items-center gap-2 bg-muted/10 shrink-0">
          <span className="text-xs text-foreground/50 mr-auto">{t("updateStatusLabel")}</span>
          {(['OPEN', 'IN_PROGRESS', 'DONE'] as WStatus[]).map(s => (<button key={s} onClick={() => { onStatusChange(warning.id, s); onClose(); }} disabled={warning.status === s} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed`} type="button" style={{ color: WSTATUS_COLORS[s], borderColor: `${WSTATUS_COLORS[s]}40`, background: `${WSTATUS_COLORS[s]}12` }}>
              {t(`enum${s}` as any) || s}
            </button>))}
          <button onClick={onClose} className="px-4 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-muted transition-all text-foreground/70 ml-1" type="button">
            Đóng
          </button>
        </div>
      </div>
    </div>);
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
    const [warningFormStep, setWarningFormStep] = useState(1);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [subSelectVal, setSubSelectVal] = useState('');
    const [customSub, setCustomSub] = useState('');
    const [attachments, setAttachments] = useState<File[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const [filterStatus, setFilterStatus] = useState('Tất cả');
    const [filterRisk, setFilterRisk] = useState('Tất cả');
    const [filterDepartment, setFilterDepartment] = useState('Tất cả');
    const [searchTerm, setSearchTerm] = useState('');
    const [warningPage, setWarningPage] = useState(1);
    const [activeTab, setActiveTab] = useState<'list' | 'charts'>('list');
    const [viewWarning, setViewWarning] = useState<Warning | null>(null);
    const [rejectInputId, setRejectInputId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const riskLevel = calcRiskLevel(form.riskProbability, form.riskConsequence);
    const riskScore = form.riskProbability * form.riskConsequence;
    const riskColors = RISK_COLORS[riskLevel];
    const riskBand = getRiskBandForScore(riskScore, t);
    const suggestedDeadline = addDays(calcDeadlineDays(riskLevel));
    const activeCat = CATEGORIES.find(c => c.value === form.category)!;
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
    function handleCategoryChange(val: WCategory) {
        const cat = CATEGORIES.find(c => c.value === val)!;
        const relatedStandard = cat.standards[0] || '';
        setForm(p => ({
            ...p,
            category: val,
            relatedStandard,
            relatedStandardI18n: emptySafetyLocalizedText(relatedStandard),
        }));
        setSubSelectVal('');
        setCustomSub('');
    }
    function handleSubChange(val: string) {
        setSubSelectVal(val);
        if (val !== OTHER_SUB) {
            setForm(p => ({ ...p, subcategory: val }));
            setCustomSub('');
        }
        else {
            setForm(p => ({ ...p, subcategory: '' }));
        }
    }
    function handleFiles(files: FileList | null) {
        if (!files)
            return;
        const arr = Array.from(files);
        setAttachments(prev => [...prev, ...arr]);
    }
    function closeForm() {
        setShowForm(false);
        setWarningFormStep(1);
        setForm({ ...EMPTY_FORM });
        setSubSelectVal('');
        setCustomSub('');
        setAttachments([]);
    }
    const createWarningMutation = useMutation({
        mutationFn: async (body: Record<string, unknown>) => {
            const res = await fetch('/api/warnings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok)
                throw new Error(t('sendFailedMsg'));
            return res.json() as Promise<Warning>;
        },
        onSuccess: (w) => {
            queryClient.invalidateQueries({ queryKey: ['warnings'] });
            addNotif({
                type: 'submit',
                title: t('notifyPendingApproval', { code: w.code }),
                message: t('notifyPendingMessage', { user: user?.name ?? 'Nhân viên', dept: user?.department, title: warningText(w, 'title'), risk: w.riskLevel }),
                forRoles: ['quanly', 'ehs'],
                forDept: user?.department,
                page: t('pageHotWarnings'),
            });
            closeForm();
        },
    });
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
    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const finalSub = subSelectVal === OTHER_SUB ? customSub : (form.subcategory || subSelectVal);
        const requiredIssue = (() => {
            if (!safetyLocalizedVi(form.titleI18n, form.title).trim())
                return { step: 1, message: t('errEnterTitle') };
            if (!finalSub.trim())
                return { step: 1, message: t('errEnterSpecificProblem') };
            if (!form.department.trim())
                return { step: 2, message: t('errSelectDept') };
            if (!safetyLocalizedVi(form.descriptionI18n, form.description).trim())
                return { step: 4, message: t('errEnterDesc') };
            if (!safetyLocalizedVi(form.proposedActionI18n, form.proposedAction).trim())
                return { step: 4, message: t('errEnterAction') };
            if (!form.responsiblePerson.trim())
                return { step: 5, message: t('errAssignee') };
            return null;
        })();
        if (requiredIssue) {
            setWarningFormStep(requiredIssue.step);
            window.alert(requiredIssue.message);
            return;
        }
        const rL = calcRiskLevel(form.riskProbability, form.riskConsequence);
        const rS = form.riskProbability * form.riskConsequence;
        const titleI18n = safetyLocalizedPayload(form.titleI18n, form.title);
        const areaI18n = safetyLocalizedPayload(form.areaI18n, form.area);
        const descriptionI18n = safetyLocalizedPayload(form.descriptionI18n, form.description);
        const currentControlI18n = safetyLocalizedPayload(form.currentControlI18n, form.currentControl);
        const proposedActionI18n = safetyLocalizedPayload(form.proposedActionI18n, form.proposedAction);
        const evidenceNotesI18n = safetyLocalizedPayload(form.evidenceNotesI18n, form.evidenceNotes);
        const relatedStandardI18n = safetyLocalizedPayload(form.relatedStandardI18n, form.relatedStandard);
        createWarningMutation.mutate({
            ...form,
            title: safetyLocalizedVi(titleI18n, form.title),
            titleI18n,
            subcategory: finalSub,
            area: safetyLocalizedVi(areaI18n, form.area),
            areaI18n,
            riskLevel: rL,
            riskScore: rS,
            description: safetyLocalizedVi(descriptionI18n, form.description),
            descriptionI18n,
            currentControl: safetyLocalizedVi(currentControlI18n, form.currentControl),
            currentControlI18n,
            proposedAction: safetyLocalizedVi(proposedActionI18n, form.proposedAction),
            proposedActionI18n,
            evidenceNotes: safetyLocalizedVi(evidenceNotesI18n, form.evidenceNotes),
            evidenceNotesI18n,
            relatedStandard: safetyLocalizedVi(relatedStandardI18n, form.relatedStandard),
            relatedStandardI18n,
            deadline: form.deadline || suggestedDeadline,
            submittedByDept: user?.department ?? form.department,
            submittedById: user?.id ?? 'guest',
            submittedByName: user?.name ?? t('guestUser'),
            createdByName: user?.name ?? t('guestUser'),
        });
    }
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
    const fmtFileSize = (bytes: number) => bytes < 1024 ? `${bytes}B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(0)}KB` : `${(bytes / 1048576).toFixed(1)}MB`;
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
    const canApproveWarning = (warning: Warning) => canUserApprove &&
        warning.approvalStatus === 'PENDING' &&
        (seeAll || warning.submittedByDept === user?.department || warning.department === user?.department);
    return <SafetyI18nRender>{(<div className="safety-warning-page space-y-5 w-full pb-10">

      {/* Detail modal */}
      {viewWarning && (<WarningDetailModal lang={lang} warning={viewWarning} onClose={() => setViewWarning(null)} onStatusChange={handleStatusChange}/>)}

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
      {showForm && (<div className="safety-modal-backdrop fixed inset-0 z-[1400] flex items-center justify-center p-4" role="presentation">
          <div className="absolute inset-0" onClick={closeForm}/>
          <div aria-labelledby="warning-create-title" aria-modal="true" className="safety-modal-shell safety-warning-modal-shell safety-warning-redesign-shell relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" role="dialog">
            <div className="h-1 w-full shrink-0" style={{ background: 'linear-gradient(90deg,#F5C400,#f9a825,#e53935)' }}/>
            <div className="safety-modal-header safety-warning-modal-header safety-warning-redesign-header px-6 py-4 border-b border-border/60 flex items-center justify-between shrink-0 bg-muted/20">
              <div className="flex items-center gap-3 min-w-0">
                <div className="safety-warning-modal-icon safety-warning-redesign-icon w-9 h-9 rounded-xl bg-[#F5C400]/15 border border-[#F5C400]/30 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-[#e11d48]"/>
                </div>
                <div className="min-w-0">
                  <h3 id="warning-create-title" className="font-bold text-[15px] text-foreground leading-tight">{t("createWarningTitle")}</h3>
                  <p className="safety-warning-create-subtitle">{t("createWarningSubtitle")}</p>
                </div>
              </div>
              <div className="safety-warning-redesign-actions">
                <button type="button" className="safety-warning-redesign-action">
                  <Eye className="w-5 h-5"/>
                  <span>{t("trackBtn")}</span>
                </button>
                <button type="button" className="safety-warning-redesign-action">
                  <Download className="w-5 h-5"/>
                  <span>{t("exportPdfBtn")}</span>
                </button>
                <span className="safety-warning-redesign-divider" aria-hidden="true"/>
                <button aria-label={t("closeModalAriaLabel")} type="button" onClick={closeForm} className="safety-warning-redesign-close w-8 h-8 rounded-lg flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-muted transition-all">
                  <X className="w-6 h-6"/>
                </button>
              </div>
            </div>

            <div className="safety-modal-body overflow-y-auto flex-1">
              <form onSubmit={handleSubmit} noValidate className="safety-warning-entry-form safety-warning-create-form safety-warning-wizard-form safety-warning-redesign-form p-6 space-y-6">
                <div className="safety-warning-wizard-steps" aria-label={t("stepsAriaLabel")}>
                  {getWarningFormSteps(t).map(step => {
                const stateClass = step.id === warningFormStep ? 'active' : step.id < warningFormStep ? 'done' : '';
                return (<button
                    aria-current={step.id === warningFormStep ? 'step' : undefined}
                    className={`safety-warning-wizard-step ${stateClass}`}
                    key={step.id}
                    onClick={() => setWarningFormStep(step.id)}
                    type="button"
                  >
                    <span>{step.id}</span>
                    <strong>{step.title}</strong>
                    <small>{step.desc}</small>
                  </button>);
            })}
                </div>

                <div className="safety-warning-step-note safety-warning-redesign-note" role="note">
                  <ShieldCheck className="w-4 h-4"/>
                  <span>
                    {warningFormStep === 1 ? t("noteStep1") :
                    warningFormStep === 2 ? t("noteStep2") :
                    warningFormStep === 3 ? t("noteStep3") :
                    warningFormStep === 4 ? t("noteStep4") :
                    warningFormStep === 5 ? t("noteStep5") :
                    t("noteStep6")}
                  </span>
                </div>

                {/* Block 1 */}
                {warningFormStep === 1 && (<div className="safety-warning-form-step safety-warning-step-title safety-warning-redesign-step-title">
                  <h4 className="section-head"><span className="step-num">1</span> {t("block1Head")}</h4>
                  <div className="safety-warning-title-panel">
                    <SafetyLocalizedTextField
                      ariaLabel={t("warningTitleLabel")}
                      className="safety-warning-title-localized"
                      inputClassName="input-form safety-warning-redesign-title-input"
                      label={t("warningTitleLabel")}
                      onChange={value => setForm(p => ({ ...p, titleI18n: value, title: safetyLocalizedVi(value) }))}
                      placeholder={t("warningTitlePlaceholder")}
                      required
                      value={form.titleI18n}
                    />
                    <div className="safety-warning-redesign-grid">
                      <div className="safety-warning-redesign-field">
                        <label className="label-form">{t("categoryLabel")} *</label>
                        <div className="safety-warning-redesign-control has-icon">
                          <AlertTriangle className="safety-warning-field-icon danger"/>
                          <select aria-label={t("categoryLabel")} value={form.category} onChange={e => handleCategoryChange(e.target.value as WCategory)} className="input-form">
                            {CATEGORIES.map(cat => (<option key={cat.value} value={cat.value}>{t(`cat${cat.value}` as any) || cat.value}</option>))}
                          </select>
                          <ChevronDown className="safety-warning-field-chevron"/>
                        </div>
                      </div>
                      <div className="safety-warning-redesign-field">
                        <label className="label-form">{t("specificProblemLabel")}</label>
                        <div className="safety-warning-redesign-control">
                          <select aria-label={t("specificProblemLabel")} value={subSelectVal} onChange={e => handleSubChange(e.target.value)} className="input-form">
                            <option value="">{t("chooseSpecificProblem")}</option>
                            {activeCat.subs.map(s => (<option key={s} value={s}>{t(`sub_${s}` as any) || s}</option>))}
                            <option value={OTHER_SUB}>{t("otherSpecify")}</option>
                          </select>
                          <ChevronDown className="safety-warning-field-chevron"/>
                        </div>
                      </div>
                      <div className="safety-warning-redesign-field">
                        <label className="label-form">{t("departmentGroupLabel")}</label>
                        <div className="safety-warning-redesign-control has-icon">
                          <UserRound className="safety-warning-field-icon primary"/>
                          <select aria-label={t("departmentGroupLabel")} value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} className="input-form">
                            {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                          </select>
                          <ChevronDown className="safety-warning-field-chevron"/>
                        </div>
                      </div>
                      <div className="safety-warning-redesign-field">
                        <label className="label-form">{t("issueStatusLabel")}</label>
                        <div className="safety-warning-redesign-control has-icon">
                          <AlertTriangle className="safety-warning-field-icon warning"/>
                          <select aria-label={t("issueStatusLabel")} value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as WStatus }))} className="input-form">
                            <option value="OPEN">{t("statusOpen")}</option>
                            <option value="IN_PROGRESS">{t("statusProcessing")}</option>
                            <option value="DONE">{t("statusDone")}</option>
                            <option value="OVERDUE">{t("statusOverdue")}</option>
                          </select>
                          <ChevronDown className="safety-warning-field-chevron"/>
                        </div>
                      </div>
                      <div className="safety-warning-redesign-field">
                        <label className="label-form">{t("riskTrackingDeadlineLabel")}</label>
                        <div className="safety-warning-redesign-control has-icon">
                          <CalendarClock className="safety-warning-field-icon success"/>
                          <select aria-label={t("riskTrackingDeadlineLabel")} value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} className="input-form">
                            <option value="">{t("selectTrackingDeadline")}</option>
                            <option value={addDays(1)}>{t("deadlineOption1Day")}</option>
                            <option value={addDays(7)}>{t("deadlineOption7Days")}</option>
                            <option value={addDays(30)}>{t("deadlineOption30Days")}</option>
                            <option value={addDays(90)}>{t("deadlineOption90Days")}</option>
                            <option value={suggestedDeadline}>{t("deadlineSuggestByMatrix", { days: calcDeadlineDays(riskLevel) })}</option>
                          </select>
                          <ChevronDown className="safety-warning-field-chevron"/>
                        </div>
                      </div>
                    </div>
                    {subSelectVal === OTHER_SUB && (<div className="safety-warning-redesign-field safety-warning-custom-sub">
                        <label className="label-form">{t("enterSpecificProblemLabel")} *</label>
                        <input aria-label={t("enterSpecificProblemLabel")} required value={customSub} onChange={e => { setCustomSub(e.target.value); setForm(p => ({ ...p, subcategory: e.target.value })); }} className="input-form" placeholder={t("customProblemPlaceholder")}/>
                      </div>)}
                  </div>
                </div>)}

                {/* Block 2 */}
                {warningFormStep === 2 && (<div className="safety-warning-form-step safety-warning-step-location safety-warning-redesign-step-location">
                  <h4 className="section-head"><span className="step-num">2</span> {t("block2Head")}</h4>
                  <div className="safety-warning-location-panel">
                    <div className="safety-warning-location-grid top">
                      <div className="safety-warning-redesign-field">
                        <label className="label-form">{t("departmentLabel")} *</label>
                        <div className="safety-warning-redesign-control has-icon">
                          <Building2 className="safety-warning-field-icon primary"/>
                          <select aria-label={t("departmentLabel")} required value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} className="input-form">
                            {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                          </select>
                          <ChevronDown className="safety-warning-field-chevron"/>
                        </div>
                      </div>
                      <div className="safety-warning-redesign-field">
                        <label className="label-form">{t("specificAreaLabel")} *</label>
                        <div className="safety-warning-redesign-control has-icon">
                          <MapPin className="safety-warning-field-icon primary"/>
                          <input aria-label={t("specificAreaLabel")} value={form.area} onChange={e => setForm(p => ({ ...p, area: e.target.value, areaI18n: emptySafetyLocalizedText(e.target.value) }))} className="input-form" placeholder={t("specificAreaPlaceholder")}/>
                        </div>
                      </div>
                    </div>

                    <div className="safety-warning-location-grid middle">
                      <div className="safety-warning-redesign-field">
                        <label className="label-form">{t("lineCabinetLabel")}</label>
                        <div className="safety-warning-redesign-control has-icon">
                          <Factory className="safety-warning-field-icon primary"/>
                          <select aria-label={t("lineCabinetLabel")} value={form.productionLine} onChange={e => setForm(p => ({ ...p, productionLine: e.target.value }))} className="input-form">
                            <option value="">{t("chooseLineCabinet")}</option>
                            <option value="PE1 - Chuyền 1">{t("linePE1_1")}</option>
                            <option value="PE1 - Chuyền 2">{t("linePE1_2")}</option>
                            <option value="PE2 - Chuyền 1">{t("linePE2_1")}</option>
                            <option value="Kho / Logistics">{t("lineWarehouse")}</option>
                            <option value="Bảo trì">{t("lineMaintenance")}</option>
                          </select>
                          <ChevronDown className="safety-warning-field-chevron"/>
                        </div>
                      </div>
                      <div className="safety-warning-redesign-field">
                        <label className="label-form">{t("machineEquipmentLabel")}</label>
                        <div className="safety-warning-redesign-control has-icon">
                          <Cog className="safety-warning-field-icon primary"/>
                          <select aria-label={t("machineEquipmentLabel")} value={form.machineName} onChange={e => setForm(p => ({ ...p, machineName: e.target.value }))} className="input-form">
                            <option value="">{t("chooseMachineEquipment")}</option>
                            <option value="Máy ép">{t("machinePress")}</option>
                            <option value="Máy cắt">{t("machineCut")}</option>
                            <option value="Tủ điện">{t("machineCabinet")}</option>
                            <option value="Xe nâng">{t("machineForklift")}</option>
                            <option value="Băng tải">{t("machineConveyor")}</option>
                          </select>
                          <ChevronDown className="safety-warning-field-chevron"/>
                        </div>
                      </div>
                      <div className="safety-warning-redesign-field">
                        <label className="label-form">{t("detailLocationLabel")}</label>
                        <div className="safety-warning-redesign-control has-icon">
                          <Crosshair className="safety-warning-field-icon primary"/>
                          <input aria-label={t("detailLocationLabel")} value={form.locationDetail} onChange={e => setForm(p => ({ ...p, locationDetail: e.target.value }))} className="input-form" placeholder={t("detailLocationPlaceholder")}/>
                        </div>
                      </div>
                    </div>

                    <div className="safety-warning-location-summary" aria-label={t("locationSummaryAriaLabel")}>
                      <div className="safety-warning-location-summary-card">
                        <span>{t("departmentLabel")}</span>
                        <strong><Building2 className="safety-warning-summary-icon primary"/>{form.department || '—'}</strong>
                      </div>
                      <div className="safety-warning-location-summary-card">
                        <span>{t("specificAreaLabel")}</span>
                        <strong><MapPinned className="safety-warning-summary-icon primary"/>{form.area || form.productionLine || '—'}</strong>
                      </div>
                      <div className="safety-warning-location-summary-card">
                        <span>{t("discovererLabel")}</span>
                        <label className="safety-warning-inline-input">
                          <UserRound className="safety-warning-summary-icon primary"/>
                          <input aria-label={t("discovererLabel")} value={form.reporterName} onChange={e => setForm(p => ({ ...p, reporterName: e.target.value }))} placeholder={user?.name || t("discovererPlaceholder")}/>
                        </label>
                      </div>
                      <div className="safety-warning-location-summary-card">
                        <span>{t("discoverTimeLabel")}</span>
                        <label className="safety-warning-inline-input">
                          <CalendarClock className="safety-warning-summary-icon success"/>
                          <input aria-label={t("discoverTimeLabel")} type="datetime-local" value={form.detectedAt} onChange={e => setForm(p => ({ ...p, detectedAt: e.target.value }))}/>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>)}

                {/* Block 3 */}
                {warningFormStep === 3 && (<div className="safety-warning-form-step safety-warning-step-risk safety-warning-redesign-step-risk">
                  <h4 className="section-head"><span className="step-num">3</span> {t("block3Head")}</h4>
                  <div className="safety-warning-risk-layout">
                    <section className="safety-warning-risk-choices probability" aria-label={t("probAriaLabel")}>
                      <div className="safety-warning-risk-card-title">
                        <Activity className="w-5 h-5"/>
                        <div>
                          <strong>{t("probabilityLabel")}</strong>
                          <span>{t("probabilityDesc")}</span>
                        </div>
                      </div>
                      <div className="safety-warning-risk-options">
                        {getRiskProbabilityOptions(t).map(opt => (<button key={opt.v} aria-pressed={form.riskProbability === opt.v} type="button" onClick={() => setForm(p => ({ ...p, riskProbability: opt.v }))}>
                          <span className="risk-option-number">{opt.v}</span>
                          <span className="safety-warning-risk-option-copy">
                            <strong>{opt.label}</strong>
                            <small>{opt.desc}</small>
                          </span>
                        </button>))}
                      </div>
                    </section>

                    <section className="safety-warning-risk-matrix-card" aria-label={t("riskMatrixAriaLabel")}>
                      <RiskMatrixViz prob={form.riskProbability} cons={form.riskConsequence} onSelect={(riskProbability, riskConsequence) => setForm(p => ({ ...p, riskProbability, riskConsequence }))} t={t}/>
                      <div className="safety-warning-matrix-hint">
                        <ClipboardList className="w-4 h-4"/>
                        <span>{t("riskMatrixHint")}</span>
                      </div>
                    </section>

                    <section className="safety-warning-risk-choices consequence" aria-label={t("consAriaLabel")}>
                      <div className="safety-warning-risk-card-title">
                        <AlertTriangle className="w-5 h-5"/>
                        <div>
                          <strong>{t("consequenceLabel")}</strong>
                          <span>{t("consequenceDesc")}</span>
                        </div>
                      </div>
                      <div className="safety-warning-risk-options">
                        {getRiskConsequenceOptions(t).map(opt => (<button key={opt.v} aria-pressed={form.riskConsequence === opt.v} type="button" onClick={() => setForm(p => ({ ...p, riskConsequence: opt.v }))}>
                          <span className="risk-option-number">{opt.v}</span>
                          <span className="safety-warning-risk-option-copy">
                            <strong>{opt.label}</strong>
                            <small>{opt.desc}</small>
                          </span>
                        </button>))}
                      </div>
                    </section>

                    <aside className={`safety-warning-risk-result-panel ${riskBand.className}`}>
                      <div className="safety-warning-risk-card-title compact">
                        <ShieldAlert className="w-5 h-5"/>
                        <div>
                          <strong>{t("evalResultLabel")}</strong>
                          <span>{t("evalResultDesc")}</span>
                        </div>
                      </div>
                      <div className="safety-warning-risk-result-card" style={{ borderColor: riskColors.text, background: riskColors.bg }}>
                        <p>{t("riskScoreLabel")}</p>
                        <div className="safety-warning-risk-score-line">
                          <strong style={{ color: riskColors.text }}>{riskScore}</strong>
                          <span>/ 25</span>
                        </div>
                        <b className={`safety-warning-risk-band ${riskBand.className}`}>{t("riskLevelPrefix")}: {riskBand.label}</b>
                        <small className="safety-warning-risk-formula">{form.riskProbability} × {form.riskConsequence} = {riskScore}</small>
                      </div>
                      <div className="safety-warning-hierarchy-card">
                        <strong>Hierarchy of controls</strong>
                        {['Elimination', 'Substitution', 'Isolation', 'Engineering', 'Administrative', 'PPE'].map((item, index) => (<span key={item} className={index < 2 ? 'preferred' : index > 4 ? 'least' : ''}>{item}</span>))}
                      </div>
                      <div className="safety-warning-risk-advice">
                        <CalendarClock className="w-4 h-4"/>
                        <div>
                          <strong>{t("suggestedDeadlineLabel", { days: calcDeadlineDays(riskLevel) })}</strong>
                          <span>{riskBand.guide}</span>
                        </div>
                      </div>
                    </aside>
                  </div>
                </div>)}
                {/* Block 4 */}
                {warningFormStep === 4 && (<div className="safety-warning-form-step safety-warning-step-measures safety-warning-redesign-step-measures">
                  <h4 className="section-head"><span className="step-num">4</span> {t("block4Head")}</h4>
                  <div className="safety-warning-measures-panel">
                    <div className="safety-warning-measures-text-grid">
                      <div className="safety-warning-measure-box">
                        <ClipboardPen className="safety-warning-measure-icon primary"/>
                        <SafetyLocalizedTextField
                          ariaLabel={t("descriptionLabel")}
                          className="safety-warning-measure-localized"
                          inputClassName="input-form resize-none"
                          label={t("descriptionLabel")}
                          onChange={value => setForm(p => ({ ...p, descriptionI18n: value, description: safetyLocalizedVi(value) }))}
                          placeholder={t("descriptionPlaceholder")}
                          required
                          rows={4}
                          textarea
                          value={form.descriptionI18n}
                        />
                      </div>
                      <div className="safety-warning-measure-box">
                        <ShieldCheck className="safety-warning-measure-icon success"/>
                        <SafetyLocalizedTextField
                          ariaLabel={t("currentControlLabel")}
                          className="safety-warning-measure-localized"
                          inputClassName="input-form resize-none"
                          label={t("currentControlLabel")}
                          onChange={value => setForm(p => ({ ...p, currentControlI18n: value, currentControl: safetyLocalizedVi(value) }))}
                          placeholder={t("currentControlPlaceholder")}
                          rows={4}
                          textarea
                          value={form.currentControlI18n}
                        />
                      </div>
                      <div className="safety-warning-measure-box">
                        <Lightbulb className="safety-warning-measure-icon warning"/>
                        <SafetyLocalizedTextField
                          ariaLabel={t("proposedActionLabel")}
                          className="safety-warning-measure-localized"
                          inputClassName="input-form resize-none"
                          label={t("proposedActionLabel")}
                          onChange={value => setForm(p => ({ ...p, proposedActionI18n: value, proposedAction: safetyLocalizedVi(value) }))}
                          placeholder={t("proposedActionPlaceholder")}
                          required
                          rows={4}
                          textarea
                          value={form.proposedActionI18n}
                        />
                      </div>
                    </div>

                    <div className="safety-warning-measures-bottom-grid">
                      <section className="safety-warning-standard-panel">
                        <div className="safety-warning-panel-title">
                          <BookOpen className="w-4 h-4"/>
                          <span>{t("relatedStandardLabel")}</span>
                        </div>
                        <div className="safety-warning-standard-entry">
                          <div className="safety-warning-redesign-control has-icon">
                            <BookOpen className="safety-warning-field-icon primary"/>
                            <input aria-label={t("relatedStandardLabel")} value={form.relatedStandard} onChange={e => setForm(p => ({ ...p, relatedStandard: e.target.value, relatedStandardI18n: emptySafetyLocalizedText(e.target.value) }))} className="input-form" placeholder={t("relatedStandardPlaceholder")}/>
                          </div>
                          <button type="button" onClick={() => setForm(p => ({ ...p, relatedStandard: safetyLocalizedVi(p.relatedStandardI18n, p.relatedStandard), relatedStandardI18n: emptySafetyLocalizedText(safetyLocalizedVi(p.relatedStandardI18n, p.relatedStandard)) }))} className="safety-warning-standard-add-btn">
                            <Plus className="w-4 h-4"/> {t("addBtn")}
                          </button>
                        </div>
                        <div className="safety-warning-standard-chips">
                          {activeCat.standards.map(std => (<button key={std} type="button" onClick={() => setForm(p => ({ ...p, relatedStandard: std, relatedStandardI18n: emptySafetyLocalizedText(std) }))} className={form.relatedStandard === std ? 'active' : ''}>
                            {t(`std_${std}` as any) || std}
                            {form.relatedStandard === std ? <X className="w-3.5 h-3.5"/> : null}
                          </button>))}
                        </div>
                      </section>

                      <section className="safety-warning-priority-panel">
                        <div className="safety-warning-panel-title">
                          <Flag className="w-4 h-4"/>
                          <span>{t("priorityLabel")} *</span>
                        </div>
                        <div className="safety-warning-redesign-control has-icon">
                          <Flag className="safety-warning-field-icon danger"/>
                          <select aria-label={t("priorityLabel")} value={riskScore >= 15 ? t('priorityVeryHigh') : riskScore >= 8 ? t('priorityHigh') : riskScore >= 4 ? t('priorityMedium') : t('priorityLow')} onChange={e => setForm(p => ({ ...p, status: p.status }))} className="input-form">
                            <option>{t("priorityVeryHigh")}</option>
                            <option>{t("priorityHigh")}</option>
                            <option>{t("priorityMedium")}</option>
                            <option>{t("priorityLow")}</option>
                          </select>
                          <ChevronDown className="safety-warning-field-chevron"/>
                        </div>
                        <div className={`safety-warning-priority-summary ${riskBand.className}`}>
                          <strong>{riskBand.label}</strong>
                          <span>{riskScore}/25 · {t("processingInDays", { days: calcDeadlineDays(riskLevel) })}</span>
                        </div>
                      </section>
                    </div>
                  </div>
                </div>)}

                {/* Block 5: Phân công & Hạn xử lý - Redesigned */}
                {warningFormStep === 5 && (<div className="safety-warning-form-step safety-warning-step-assignment">
                  {/* Info banner */}
                  <div className="safety-warning-assign-info-banner">
                    <Info className="w-4 h-4 shrink-0"/>
                    <span>{t("noteStep5")}</span>
                  </div>

                  <div className="safety-warning-assign-card">
                    <h4 className="section-head"><span className="step-num bg-[#00a99d]">5</span> {t("block5Head")}</h4>

                    <div className="safety-warning-assign-grid">
                      {/* Left column */}
                      <div className="safety-warning-assign-left">
                        {/* Row 1: 3 inputs */}
                        <div className="safety-warning-assign-row-3">
                          <div className="safety-warning-assign-field">
                            <label className="label-form">{t("assigneeLabel")} *</label>
                            <div className="safety-warning-assign-input-wrap">
                              <UserRound className="safety-warning-assign-input-icon"/>
                              <input aria-label={t("assigneeLabel")} required value={form.responsiblePerson} onChange={e => setForm(p => ({ ...p, responsiblePerson: e.target.value }))} className="input-form" placeholder={t("assigneePlaceholder")}/>
                            </div>
                          </div>
                          <div className="safety-warning-assign-field">
                            <label className="label-form">{t("deadlineLabel")} *</label>
                            <div className="safety-warning-assign-input-wrap">
                              <Calendar className="safety-warning-assign-input-icon"/>
                              <input aria-label={t("deadlineLabel")} required type="date" value={form.deadline || suggestedDeadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} className="input-form"/>
                            </div>
                            <p className="text-[11px] text-foreground/55 mt-1">{t("suggestedDays", { days: calcDeadlineDays(riskLevel) })}</p>
                          </div>
                          <div className="safety-warning-assign-field">
                            <label className="label-form">{t("reporterLabel")}</label>
                            <div className="safety-warning-assign-input-wrap">
                              <UserRound className="safety-warning-assign-input-icon"/>
                              <input aria-label={t("reporterLabel")} value={form.reporterName} onChange={e => setForm(p => ({ ...p, reporterName: e.target.value }))} className="input-form" placeholder={t("reporterPlaceholder")}/>
                            </div>
                          </div>
                        </div>

                        {/* Row 2: coordinator + additional notes */}
                        <div className="safety-warning-assign-row-2">
                          <div className="safety-warning-assign-field">
                            <label className="label-form">{t("coordinatorLabel")}</label>
                            <div className="safety-warning-assign-input-wrap">
                              <Users className="safety-warning-assign-input-icon"/>
                              <input aria-label={t("coordinatorLabel")} value={form.coordinator || ''} onChange={e => setForm(p => ({ ...p, coordinator: e.target.value }))} className="input-form" placeholder={t("coordinatorPlaceholder")}/>
                            </div>
                          </div>
                          <div className="safety-warning-assign-field safety-warning-assign-notes-field">
                            <SafetyLocalizedTextField
                              ariaLabel={t("additionalNotesLabel")}
                              label={t("additionalNotesLabel")}
                              textarea={true}
                              rows={3}
                              onChange={value => {
                                const limit = (str: string | undefined) => (str || '').slice(0, 500);
                                const limited = {
                                  vi: limit(value.vi),
                                  en: limit(value.en),
                                  ja: limit(value.ja)
                                };
                                setForm(p => ({ ...p, additionalNotesI18n: limited, additionalNotes: limited.vi }));
                              }}
                              placeholder={t("additionalNotesPlaceholder")}
                              value={form.additionalNotesI18n}
                            />
                            <span className="safety-warning-assign-counter">{(form.additionalNotes || '').length}/500</span>
                          </div>
                        </div>
                      </div>

                      {/* Right sidebar */}
                      <div className="safety-warning-assign-right">
                        {/* Evidence notes */}
                        <div className="safety-warning-assign-evidence">
                          <SafetyLocalizedTextField
                            ariaLabel={t("evidenceNotesLabel")}
                            label={t("evidenceNotesLabel")}
                            onChange={value => setForm(p => ({ ...p, evidenceNotesI18n: value, evidenceNotes: safetyLocalizedVi(value) }))}
                            placeholder={t("evidenceNotesPlaceholder")}
                            value={form.evidenceNotesI18n}
                          />
                          <div className="safety-warning-assign-attach-btn-wrap">
                            <button type="button" onClick={() => document.getElementById('step5-attach')?.click()} className="safety-warning-assign-attach-btn">
                              <Paperclip className="w-3.5 h-3.5"/> {t("attachFileBtn")}
                            </button>
                            <input id="step5-attach" type="file" multiple className="hidden" aria-label={t("block6Head")} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={e => handleFiles(e.target.files)}/>
                          </div>
                          {attachments.length > 0 && (<div className="safety-warning-assign-files">
                            {attachments.map((file, i) => (<div key={i} className="safety-warning-assign-file-row">
                              <Paperclip className="w-3 h-3 text-foreground/50 shrink-0"/>
                              <span className="flex-1 truncate text-xs">{file.name}</span>
                            </div>))}
                          </div>)}
                        </div>

                        {/* Summary card */}
                        <div className="safety-warning-assign-summary">
                          <strong className="safety-warning-assign-summary-title">{t("warningSummaryLabel")}</strong>
                          <div className="safety-warning-assign-summary-row">
                            <span>{t("riskLevelLabel")}</span>
                            <span className={`safety-warning-assign-risk-pill ${riskBand.className}`}>{riskBand.label} ({riskScore}/25)</span>
                          </div>
                          <div className="safety-warning-assign-summary-row">
                            <span>{t("departmentLabel")}</span>
                            <strong>{form.department || '—'}</strong>
                          </div>
                          <div className="safety-warning-assign-summary-row">
                            <span>{t("specificAreaLabel")}</span>
                            <strong>{form.area || form.productionLine || '—'}</strong>
                          </div>
                          <div className="safety-warning-assign-summary-row">
                            <span>{t("deadlineLabel")}</span>
                            <strong className="safety-warning-assign-deadline-val">{formatWarningDisplayDate(form.deadline || suggestedDeadline)}</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom info banner */}
                  <div className="safety-warning-assign-info-banner">
                    <Info className="w-4 h-4 shrink-0"/>
                    <span>{t("afterSaveNote")}</span>
                  </div>
                </div>)}
                {/* Block 6: File upload */}
                {warningFormStep === 6 && (<div className="safety-warning-form-step safety-warning-step-attachments">
                  <h4 className="section-head"><span className="step-num bg-[#9c27b0]">6</span> {t("block6Head")}</h4>
                  <input ref={fileInputRef} type="file" multiple className="hidden" aria-label={t("block6Head")} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={e => handleFiles(e.target.files)}/>
                  <div onClick={() => fileInputRef.current?.click()} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }} className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${dragOver ? 'border-[#9c27b0] bg-[#9c27b0]/8' : 'border-border hover:border-[#9c27b0]/50 hover:bg-muted/30'}`}>
                    <Upload className="w-6 h-6 mx-auto mb-2 text-foreground/40"/>
                    <p className="text-sm font-semibold text-foreground/70">{t("dragDropText")}</p>
                    <p className="text-xs text-foreground/45 mt-1">{t("dragDropHint")}</p>
                  </div>
                  {attachments.length > 0 && (<div className="mt-2 space-y-1.5">
                      {attachments.map((file, i) => (<div key={i} className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-lg border border-border">
                          <Paperclip className="w-3.5 h-3.5 text-foreground/50 shrink-0"/>
                          <span className="text-sm text-foreground/80 flex-1 truncate">{file.name}</span>
                          <span className="text-xs text-foreground/45 shrink-0">{fmtFileSize(file.size)}</span>
                          <button type="button" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="p-0.5 rounded hover:bg-muted transition-all text-foreground/40 hover:text-foreground/70">
                            <FileX className="w-3.5 h-3.5"/>
                          </button>
                        </div>))}
                    </div>)}
                </div>)}

                {/* Footer */}
                <div className="safety-warning-form-footer safety-warning-redesign-footer flex items-center justify-between gap-3 pt-4 border-t border-border/50">
                  <p className="text-[11px] text-foreground/45">{t("stepProgressText", { current: warningFormStep, total: WARNING_FORM_LAST_STEP })}</p>
                  <div className="flex gap-2.5">
                    <button type="button" onClick={warningFormStep === 1 ? closeForm : () => setWarningFormStep(step => Math.max(1, step - 1))} className="px-5 py-2 border border-border rounded-lg font-semibold text-sm text-foreground/70 hover:text-foreground hover:bg-muted transition-all">
                      {warningFormStep === 1 ? t("btnCancel") : t("btnPrev")}
                    </button>
                    {warningFormStep < WARNING_FORM_LAST_STEP ? (<button type="button" onClick={() => setWarningFormStep(step => Math.min(WARNING_FORM_LAST_STEP, step + 1))} className="safety-primary-button px-8 py-2 bg-[#F5C400] text-[#0f2a15] rounded-lg font-bold text-sm hover:bg-[#e0b300] shadow-sm shadow-[#F5C400]/25 transition-all flex items-center gap-2">
                        {t("btnNext")} <ArrowRight className="w-4 h-4"/>
                      </button>) : null}
                    {warningFormStep === WARNING_FORM_LAST_STEP && (<button type="button" className="safety-warning-draft-btn px-5 py-2 border border-border rounded-lg font-semibold text-sm text-foreground/70 hover:text-foreground hover:bg-muted transition-all flex items-center gap-2">
                        <Save className="w-4 h-4"/> {t("btnSaveDraft")}
                      </button>)}
                    <button type="submit" disabled={warningFormStep < WARNING_FORM_LAST_STEP} className="safety-warning-save-btn safety-warning-save-final px-8 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4"/> {t("btnSaveWarning")}
                      </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>)}

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



