import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Activity, ArrowRight, BookOpen, Building2, Calendar, CalendarClock,
  ChevronDown, ClipboardList, ClipboardPen, Cog, Crosshair, Download, Eye, Factory,
  FileX, Flag, FlaskConical, Info, Leaf, Lightbulb, MapPin, MapPinned, Paperclip,
  Plus, Save, Search, Shield, ShieldAlert, ShieldCheck, Upload, UserRound, Users, X,
} from 'lucide-react';
import { useHubLanguage } from '../../i18n-context';
import type { SafetyUser } from './safety-domain';
import { DEPARTMENTS } from './safety-sample-adapter';
import {
  SafetyLocalizedTextField,
  emptySafetyLocalizedText,
  safetyLocalizedPayload,
  safetyLocalizedVi,
  type SafetyLocalizedText,
} from './safety-localized-form';
import "./safety-warning-create-modal.css";

/* ─── Types ────────────────────────────────────────────── */
type LocalizedContent = Record<string, string | undefined>;
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type WStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'OVERDUE';
type WCategory = 'EQUIPMENT' | 'ELECTRICAL' | 'CHEMICALS' | 'HEIGHT' | 'VEHICLE' | 'PPE_ISSUE'
  | 'HUMAN_BEHAVIOR' | 'NEAR_MISS' | 'FIRE_SAFETY' | 'ENVIRONMENT' | 'HOUSEKEEPING' | 'ENERGY' | 'ERGONOMICS';

interface Warning {
  id: string; code: string; title: string; category: WCategory; subcategory: string;
  titleI18n?: LocalizedContent; department: string; area: string; areaI18n?: LocalizedContent;
  riskProbability: number; riskConsequence: number; riskScore: number; riskLevel: RiskLevel;
  description: string; currentControl: string; proposedAction: string;
  descriptionI18n?: LocalizedContent; currentControlI18n?: LocalizedContent; proposedActionI18n?: LocalizedContent;
  responsiblePerson: string; deadline: string; reporterName: string; evidenceNotes: string;
  relatedStandard: string; evidenceNotesI18n?: LocalizedContent; relatedStandardI18n?: LocalizedContent;
  status: WStatus; createdDate?: string; createdAt?: string; attachmentNames?: string[];
  approvalStatus: ApprovalStatus; submittedByDept: string; submittedById: string;
}

/* ─── Constants ────────────────────────────────────────── */
const RISK_COLORS: Record<RiskLevel, { text: string; bg: string }> = {
  CRITICAL: { text: '#ff1f1f', bg: 'rgba(255,31,31,0.07)' },
  HIGH:     { text: '#f47c2b', bg: 'rgba(244,124,43,0.08)' },
  MEDIUM:   { text: '#d4a017', bg: 'rgba(212,160,23,0.09)' },
  LOW:      { text: '#0fb45f', bg: 'rgba(15,180,95,0.07)'  },
};

const calcRiskLevel = (prob: number, consequence: number): RiskLevel => {
  const score = prob * consequence;
  if (score >= 15) return 'CRITICAL';
  if (score >= 8)  return 'HIGH';
  if (score >= 4)  return 'MEDIUM';
  return 'LOW';
};
const calcDeadlineDays = (level: RiskLevel): number => ({ CRITICAL: 1, HIGH: 7, MEDIUM: 30, LOW: 90 }[level]);
function addDays(days: number) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
const getRiskBandForScore = (score: number, t: any) => {
  if (score >= 15) return { label: t('riskBandCritical'), className: 'critical', guide: t('riskBandCriticalGuide') };
  if (score >= 8)  return { label: t('riskBandHigh'),     className: 'high',     guide: t('riskBandHighGuide')     };
  if (score >= 4)  return { label: t('riskBandMedium'),   className: 'medium',   guide: t('riskBandMediumGuide')   };
  return { label: t('riskBandLow'), className: 'low', guide: t('riskBandLowGuide') };
};

const formatWarningDisplayDate = (value?: string, t?: any) => {
  if (!value) return t ? t('statusNotSet') : 'Chưa đặt';
  const date = new Date(`${value}`.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const OTHER_SUB = '__other__';
const WARNING_FORM_LAST_STEP = 6;
const fmtFileSize = (bytes: number) =>
  bytes < 1024 ? `${bytes}B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(0)}KB` : `${(bytes / 1048576).toFixed(1)}MB`;

const CATEGORY_ICON: Record<WCategory, string> = {
  EQUIPMENT:      '⚙️',
  ELECTRICAL:     '⚡',
  CHEMICALS:      '🧪',
  HEIGHT:         '🪜',
  VEHICLE:        '🚜',
  PPE_ISSUE:      '🦺',
  HUMAN_BEHAVIOR: '🙅',
  NEAR_MISS:      '⚠️',
  FIRE_SAFETY:    '🔥',
  ENVIRONMENT:    '🌡️',
  HOUSEKEEPING:   '🧹',
  ENERGY:         '💡',
  ERGONOMICS:     '🧘',
};

const CATEGORIES: { value: WCategory; subs: string[]; standards: string[] }[] = [
  { value: 'EQUIPMENT',      subs: ['Thiếu che chắn an toàn','Máy hỏng đang sử dụng','Áp suất vượt ngưỡng','Thiếu bảo trì định kỳ','Thiết bị cũ quá hạn thay','Bộ phận chuyển động không có bảo vệ'], standards: ['ISO 45001:2018','TCVN 4744:2017','QCVN 26:2016/BLĐTBXH'] },
  { value: 'ELECTRICAL',     subs: ['Dây điện hở không che chắn','Tủ điện không khóa','Thiếu cầu dao bảo vệ','Dây nối đất không đảm bảo','Thiết bị điện bị ẩm ướt','Sửa điện không tắt nguồn'], standards: ['QCVN 01:2008/BCT','TCVN 9358:2012','IEC 60364'] },
  { value: 'CHEMICALS',      subs: ['Không có nhãn hóa chất','Thiếu SDS/MSDS','Bảo quản sai quy định','Không có PPE hóa chất','Rò rỉ nhỏ chưa xử lý','Hóa chất hết hạn'], standards: ['QCVN 05-MT:2023','Thông tư 32/2017/TT-BCT','GHS/CLP'] },
  { value: 'HEIGHT',         subs: ['Không đeo dây an toàn','Giàn giáo không ổn định','Sàn làm việc trên cao thiếu lan can','Thang không cố định','Làm việc gần mép cao > 2m không rào chắn','Không kiểm tra thiết bị trèo trước khi dùng'], standards: ['Thông tư 06/2020/TT-BLĐTBXH','TCVN 5308:1991'] },
  { value: 'VEHICLE',        subs: ['Xe nâng chạy quá tốc độ','Tài xế không có chứng chỉ','Không có tín hiệu cảnh báo','Tải trọng vượt mức cho phép','Không kiểm tra xe trước ca','Xe nâng di chuyển trong vùng người đi bộ'], standards: ['QCVN 7:2012/BLĐTBXH','TCVN 5865:2009'] },
  { value: 'PPE_ISSUE',      subs: ['Không đội mũ bảo hộ','Không đeo kính bảo hộ','Không mang găng tay','Không mang giày bảo hộ','PPE hết hạn sử dụng','PPE bị hỏng đang dùng'], standards: ['Thông tư 25/2014/TT-BLĐTBXH','TCVN 6407:1998'] },
  { value: 'HUMAN_BEHAVIOR', subs: ['Vi phạm quy trình','Làm việc không được phép','Chưa được đào tạo','Sử dụng điện thoại khi làm việc','Không khóa thiết bị trước bảo trì','Bỏ qua biển cảnh báo'], standards: ['Luật ATVSLĐ 2015','QCVN 04:2015/BLĐTBXH'] },
  { value: 'NEAR_MISS',      subs: ['Suýt ngã từ độ cao','Suýt bị cuốn vào máy','Suýt va chạm xe nâng','Tia lửa điện gần vật liệu cháy','Vật rơi suýt trúng người','Rò rỉ hóa chất phát hiện kịp thời'], standards: ['ISO 45001:2018 cl.9.1','Luật ATVSLĐ 2015 Điều 14'] },
  { value: 'FIRE_SAFETY',    subs: ['Bình PCCC hết hạn','Lối thoát hiểm bị chặn','Biển thoát hiểm hỏng','Thiếu bản đồ thoát hiểm','Hệ thống báo cháy lỗi','Thiếu diễn tập PCCC'], standards: ['QCVN 06:2021/BXD','TCVN 3890:2009','Nghị định 136/2020/NĐ-CP'] },
  { value: 'ENVIRONMENT',    subs: ['Chiếu sáng không đủ','Tiếng ồn vượt ngưỡng','Nhiệt độ cao','Bụi vượt ngưỡng','Sàn trơn trượt','Thông gió kém'], standards: ['QCVN 26:2016/BLĐTBXH','QCVN 24:2016','TCVN 3733:2002'] },
  { value: 'HOUSEKEEPING',   subs: ['Lối đi bừa bộn','Vật liệu không đúng nơi quy định','Dụng cụ để bừa sau khi dùng','Sàn dính dầu mỡ chưa lau','Bảng thông tin bẩn/hỏng','Không dán nhãn khu vực'], standards: ['Tiêu chuẩn 5S/6S Kaizen','TCVN 12827:2019'] },
  { value: 'ENERGY',         subs: ['Thiết bị điện bật không cần thiết','Rò rỉ khí nén','Hệ thống chiếu sáng không tắt','Máy chạy không tải kéo dài','Không tắt điện khi nghỉ','Dùng thiết bị tiêu hao điện cao'], standards: ['ISO 50001:2018','QCVN 09:2017/BXD'] },
  { value: 'ERGONOMICS',     subs: ['Nâng hàng sai tư thế','Ghế làm việc không phù hợp','Màn hình quá cao/thấp','Đứng liên tục > 4 giờ','Rung động máy kéo dài','Thao tác lặp lại liên tục'], standards: ['ISO 9241','TCVN 7303:2003'] },
];

const EMPTY_FORM = {
  titleI18n: emptySafetyLocalizedText(), title: '', category: CATEGORIES[0].value as WCategory, subcategory: '',
  areaI18n: emptySafetyLocalizedText(), department: DEPARTMENTS[0], area: '',
  productionLine: '', machineName: '', locationDetail: '',
  descriptionI18n: emptySafetyLocalizedText(), currentControlI18n: emptySafetyLocalizedText(), proposedActionI18n: emptySafetyLocalizedText(),
  riskProbability: 3, riskConsequence: 3,
  description: '', currentControl: '', proposedAction: '',
  evidenceNotesI18n: emptySafetyLocalizedText(), relatedStandardI18n: emptySafetyLocalizedText(),
  responsiblePerson: '', deadline: '', reporterName: '', detectedAt: '', evidenceNotes: '', relatedStandard: '',
  coordinator: '', additionalNotes: '', additionalNotesI18n: emptySafetyLocalizedText(),
  status: 'OPEN' as WStatus, approvalStatus: 'PENDING' as ApprovalStatus,
  submittedByDept: '', submittedById: '',
};

const getWarningFormSteps = (t: any) => [
  { id: 1, title: t('step1Title'), desc: t('step1Desc') },
  { id: 2, title: t('step2Title'), desc: t('step2Desc') },
  { id: 3, title: t('step3Title'), desc: t('step3Desc') },
  { id: 4, title: t('step4Title'), desc: t('step4Desc') },
  { id: 5, title: t('step5Title'), desc: t('step5Desc') },
  { id: 6, title: t('step6Title'), desc: t('step6Desc') },
];

const getRiskProbabilityOptions = (t: any) => [
  { v: 5, label: t('riskProbAlmostCertain'), desc: t('riskProbAlmostCertainDesc') },
  { v: 4, label: t('riskProbLikely'),        desc: t('riskProbLikelyDesc') },
  { v: 3, label: t('riskProbPossible'),      desc: t('riskProbPossibleDesc') },
  { v: 2, label: t('riskProbUnlikely'),      desc: t('riskProbUnlikelyDesc') },
  { v: 1, label: t('riskProbRare'),          desc: t('riskProbRareDesc') },
];

const getRiskConsequenceOptions = (t: any) => [
  { v: 5, label: t('riskConsCatastrophic'), desc: t('riskConsCatastrophicDesc') },
  { v: 4, label: t('riskConsMajor'),        desc: t('riskConsMajorDesc') },
  { v: 3, label: t('riskConsModerate'),     desc: t('riskConsModerateDesc') },
  { v: 2, label: t('riskConsMinor'),        desc: t('riskConsMinorDesc') },
  { v: 1, label: t('riskConsNegligible'),   desc: t('riskConsNegligibleDesc') },
];

/* ─── Risk Matrix ─────────────────────────────────────── */
function RiskMatrixViz({ prob, cons, onSelect, t }: { prob: number; cons: number; onSelect?: (p: number, c: number) => void; t: any }) {
  const cellMeta = (r: number, c: number) => {
    const s = r * c;
    if (s >= 15) return { color: '#ff1f1f', band: 'critical' };
    if (s >= 8)  return { color: '#f47c2b', band: 'high' };
    if (s >= 4)  return { color: '#fff200', band: 'medium' };
    return { color: '#0fb45f', band: 'low' };
  };
  return (
    <div className="safety-warning-company-matrix">
      <div className="safety-warning-matrix-head">
        <strong>{t("riskMatrixTitle")}</strong>
        <span>{t("riskMatrixRef")}</span>
      </div>
      <div className="safety-warning-matrix-table" role="group" aria-label={t("riskMatrixAriaLabel")}>
        <div className="safety-warning-matrix-corner">{t("consequenceLabel")}</div>
        {[1,2,3,4,5].map(c => (
          <div className="safety-warning-matrix-axis top" key={c}>
            <strong>{c}</strong>
            <span>{getRiskConsequenceOptions(t).find(o => o.v === c)?.label}</span>
          </div>
        ))}
        {[5,4,3,2,1].map(r => (
          <React.Fragment key={r}>
            <div className="safety-warning-matrix-axis left">
              <strong>{r}</strong>
              <span>{getRiskProbabilityOptions(t).find(o => o.v === r)?.label}</span>
            </div>
            {[1,2,3,4,5].map(c => {
              const score = r * c;
              const isActive = r === prob && c === cons;
              const meta = cellMeta(r, c);
              return (
                <button key={c} aria-label={`${t("probabilityLabel")} ${r}, ${t("consequenceLabel")} ${c}, ${t("riskScoreLabel")} ${score}`}
                  aria-pressed={isActive} className={`safety-warning-matrix-cell ${meta.band} ${isActive ? 'active' : ''}`}
                  onClick={() => onSelect?.(r, c)} style={{ backgroundColor: meta.color }} type="button">
                  {score}
                </button>
              );
            })}
          </React.Fragment>
        ))}
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
    </div>
  );
}

/* ─── Props ────────────────────────────────────────────── */
interface SafetyWarningCreateModalProps {
  user: SafetyUser | null;
  onClose: () => void;
  onSaved?: () => void;
}

/* ─── Component ────────────────────────────────────────── */
export function SafetyWarningCreateModal({ user, onClose, onSaved }: SafetyWarningCreateModalProps) {
  const { t } = useHubLanguage();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [warningFormStep, setWarningFormStep] = useState(1);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [subSelectVal, setSubSelectVal] = useState('');
  const [customSub, setCustomSub] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);

  /* Lock body scroll while modal is open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const riskLevel = calcRiskLevel(form.riskProbability, form.riskConsequence);
  const riskScore = form.riskProbability * form.riskConsequence;
  const riskColors = RISK_COLORS[riskLevel];
  const riskBand = getRiskBandForScore(riskScore, t);
  const suggestedDeadline = addDays(calcDeadlineDays(riskLevel));
  const activeCat = CATEGORIES.find(c => c.value === form.category)!;

  function handleCategoryChange(val: WCategory) {
    const cat = CATEGORIES.find(c => c.value === val)!;
    const relatedStandard = cat.standards[0] || '';
    setForm(p => ({ ...p, category: val, relatedStandard, relatedStandardI18n: emptySafetyLocalizedText(relatedStandard) }));
    setSubSelectVal('');
    setCustomSub('');
  }
  function handleSubChange(val: string) {
    setSubSelectVal(val);
    if (val !== OTHER_SUB) { setForm(p => ({ ...p, subcategory: val })); setCustomSub(''); }
    else { setForm(p => ({ ...p, subcategory: '' })); }
  }
  function handleFiles(files: FileList | null) {
    if (!files) return;
    setAttachments(prev => [...prev, ...Array.from(files)]);
  }
  function closeModal() {
    setWarningFormStep(1);
    setForm({ ...EMPTY_FORM });
    setSubSelectVal('');
    setCustomSub('');
    setAttachments([]);
    onClose();
  }

  const createWarningMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/warnings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(t('sendFailedMsg'));
      return res.json() as Promise<Warning>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warnings'] });
      onSaved?.();
      closeModal();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalSub = subSelectVal === OTHER_SUB ? customSub : (form.subcategory || subSelectVal);
    const issue = (() => {
      if (!safetyLocalizedVi(form.titleI18n, form.title).trim()) return { step: 1, message: t('errEnterTitle') };
      if (!finalSub.trim()) return { step: 1, message: t('errEnterSpecificProblem') };
      if (!form.department.trim()) return { step: 2, message: t('errSelectDept') };
      if (!safetyLocalizedVi(form.descriptionI18n, form.description).trim()) return { step: 4, message: t('errEnterDesc') };
      if (!safetyLocalizedVi(form.proposedActionI18n, form.proposedAction).trim()) return { step: 4, message: t('errEnterAction') };
      if (!form.responsiblePerson.trim()) return { step: 5, message: t('errAssignee') };
      return null;
    })();
    if (issue) { setWarningFormStep(issue.step); window.alert(issue.message); return; }
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
      title: safetyLocalizedVi(titleI18n, form.title), titleI18n,
      subcategory: finalSub,
      area: safetyLocalizedVi(areaI18n, form.area), areaI18n,
      riskLevel: rL, riskScore: rS,
      description: safetyLocalizedVi(descriptionI18n, form.description), descriptionI18n,
      currentControl: safetyLocalizedVi(currentControlI18n, form.currentControl), currentControlI18n,
      proposedAction: safetyLocalizedVi(proposedActionI18n, form.proposedAction), proposedActionI18n,
      evidenceNotes: safetyLocalizedVi(evidenceNotesI18n, form.evidenceNotes), evidenceNotesI18n,
      relatedStandard: safetyLocalizedVi(relatedStandardI18n, form.relatedStandard), relatedStandardI18n,
      deadline: form.deadline || suggestedDeadline,
      submittedByDept: user?.departmentId ?? form.department,
      submittedById: user?.id ?? 'guest',
      submittedByName: (user?.displayName || user?.username) ?? t('guestUser'),
      createdByName: (user?.displayName || user?.username) ?? t('guestUser'),
    });
  }

  return createPortal(
    <div className="safety-modal-backdrop fixed inset-0 z-[1400] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0" onClick={closeModal}/>
      <div
        aria-labelledby="warning-create-title" aria-modal="true"
        className="safety-modal-shell safety-warning-modal-shell safety-warning-redesign-shell relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        role="dialog"
      >
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
            <button type="button" className="safety-warning-redesign-action"><Eye className="w-5 h-5"/><span>{t("trackBtn")}</span></button>
            <button type="button" className="safety-warning-redesign-action"><Download className="w-5 h-5"/><span>{t("exportPdfBtn")}</span></button>
            <span className="safety-warning-redesign-divider" aria-hidden="true"/>
            <button aria-label={t("closeModalAriaLabel")} type="button" onClick={closeModal}
              className="safety-warning-redesign-close w-8 h-8 rounded-lg flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-muted transition-all">
              <X className="w-6 h-6"/>
            </button>
          </div>
        </div>

        <div className="safety-modal-body overflow-y-auto flex-1">
          <form onSubmit={handleSubmit} noValidate className="safety-warning-entry-form safety-warning-create-form safety-warning-wizard-form safety-warning-redesign-form p-6 space-y-6">
            {/* Step indicators */}
            <div className="safety-warning-wizard-steps" aria-label={t("stepsAriaLabel")}>
              {getWarningFormSteps(t).map(step => {
                const stateClass = step.id === warningFormStep ? 'active' : step.id < warningFormStep ? 'done' : '';
                return (
                  <button aria-current={step.id === warningFormStep ? 'step' : undefined}
                    className={`safety-warning-wizard-step ${stateClass}`} key={step.id}
                    onClick={() => setWarningFormStep(step.id)} type="button">
                    <span>{step.id}</span><strong>{step.title}</strong><small>{step.desc}</small>
                  </button>
                );
              })}
            </div>

            <div className="safety-warning-step-note safety-warning-redesign-note" role="note">
              <ShieldCheck className="w-4 h-4"/>
              <span>
                {warningFormStep === 1 ? t("noteStep1") : warningFormStep === 2 ? t("noteStep2") :
                 warningFormStep === 3 ? t("noteStep3") : warningFormStep === 4 ? t("noteStep4") :
                 warningFormStep === 5 ? t("noteStep5") : t("noteStep6")}
              </span>
            </div>

            {/* Block 1: Title & Category */}
            {warningFormStep === 1 && (
              <div className="safety-warning-form-step safety-warning-step-title safety-warning-redesign-step-title">
                <h4 className="section-head"><span className="step-num">1</span> {t("block1Head")}</h4>
                <div className="safety-warning-title-panel">
                  <SafetyLocalizedTextField ariaLabel={t("warningTitleLabel")} className="safety-warning-title-localized"
                    inputClassName="input-form safety-warning-redesign-title-input" label={t("warningTitleLabel")}
                    onChange={value => setForm(p => ({ ...p, titleI18n: value, title: safetyLocalizedVi(value) }))}
                    placeholder={t("warningTitlePlaceholder")} required value={form.titleI18n}/>
                  <div className="safety-warning-redesign-grid">
                    <div className="safety-warning-redesign-field">
                      <label className="label-form">{t("categoryLabel")} *</label>
                      <div className="safety-warning-redesign-control has-icon">
                        <AlertTriangle className="safety-warning-field-icon danger"/>
                        <select aria-label={t("categoryLabel")} value={form.category} onChange={e => handleCategoryChange(e.target.value as WCategory)} className="input-form">
                          {CATEGORIES.map(cat => <option key={cat.value} value={cat.value}>{CATEGORY_ICON[cat.value]} {t(`cat${cat.value}` as any) || cat.value}</option>)}
                        </select>
                        <ChevronDown className="safety-warning-field-chevron"/>
                      </div>
                    </div>
                    <div className="safety-warning-redesign-field">
                      <label className="label-form">{t("specificProblemLabel")}</label>
                      <div className="safety-warning-redesign-control">
                        <select aria-label={t("specificProblemLabel")} value={subSelectVal} onChange={e => handleSubChange(e.target.value)} className="input-form">
                          <option value="">{t("chooseSpecificProblem")}</option>
                          {activeCat.subs.map(s => <option key={s} value={s}>{t(`sub_${s}` as any) || s}</option>)}
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
                  {subSelectVal === OTHER_SUB && (
                    <div className="safety-warning-redesign-field safety-warning-custom-sub">
                      <label className="label-form">{t("enterSpecificProblemLabel")} *</label>
                      <input aria-label={t("enterSpecificProblemLabel")} required value={customSub}
                        onChange={e => { setCustomSub(e.target.value); setForm(p => ({ ...p, subcategory: e.target.value })); }}
                        className="input-form" placeholder={t("customProblemPlaceholder")}/>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Block 2: Location */}
            {warningFormStep === 2 && (
              <div className="safety-warning-form-step safety-warning-step-location safety-warning-redesign-step-location">
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
                        <input aria-label={t("specificAreaLabel")} value={form.area}
                          onChange={e => setForm(p => ({ ...p, area: e.target.value, areaI18n: emptySafetyLocalizedText(e.target.value) }))}
                          className="input-form" placeholder={t("specificAreaPlaceholder")}/>
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
                        <input aria-label={t("discovererLabel")} value={form.reporterName} onChange={e => setForm(p => ({ ...p, reporterName: e.target.value }))} placeholder={(user?.displayName || user?.username) || t("discovererPlaceholder")}/>
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
              </div>
            )}

            {/* Block 3: Risk Matrix */}
            {warningFormStep === 3 && (
              <div className="safety-warning-form-step safety-warning-step-risk safety-warning-redesign-step-risk">
                <h4 className="section-head"><span className="step-num">3</span> {t("block3Head")}</h4>
                <div className="safety-warning-risk-layout">
                  <section className="safety-warning-risk-choices probability" aria-label={t("probAriaLabel")}>
                    <div className="safety-warning-risk-card-title">
                      <Activity className="w-5 h-5"/>
                      <div><strong>{t("probabilityLabel")}</strong><span>{t("probabilityDesc")}</span></div>
                    </div>
                    <div className="safety-warning-risk-options">
                      {getRiskProbabilityOptions(t).map(opt => (
                        <button key={opt.v} aria-pressed={form.riskProbability === opt.v} type="button" onClick={() => setForm(p => ({ ...p, riskProbability: opt.v }))}>
                          <span className="risk-option-number">{opt.v}</span>
                          <span className="safety-warning-risk-option-copy"><strong>{opt.label}</strong><small>{opt.desc}</small></span>
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="safety-warning-risk-matrix-card" aria-label={t("riskMatrixAriaLabel")}>
                    <RiskMatrixViz prob={form.riskProbability} cons={form.riskConsequence}
                      onSelect={(p, c) => setForm(prev => ({ ...prev, riskProbability: p, riskConsequence: c }))} t={t}/>
                    <div className="safety-warning-matrix-hint">
                      <ClipboardList className="w-4 h-4"/><span>{t("riskMatrixHint")}</span>
                    </div>
                  </section>
                  <section className="safety-warning-risk-choices consequence" aria-label={t("consAriaLabel")}>
                    <div className="safety-warning-risk-card-title">
                      <AlertTriangle className="w-5 h-5"/>
                      <div><strong>{t("consequenceLabel")}</strong><span>{t("consequenceDesc")}</span></div>
                    </div>
                    <div className="safety-warning-risk-options">
                      {getRiskConsequenceOptions(t).map(opt => (
                        <button key={opt.v} aria-pressed={form.riskConsequence === opt.v} type="button" onClick={() => setForm(p => ({ ...p, riskConsequence: opt.v }))}>
                          <span className="risk-option-number">{opt.v}</span>
                          <span className="safety-warning-risk-option-copy"><strong>{opt.label}</strong><small>{opt.desc}</small></span>
                        </button>
                      ))}
                    </div>
                  </section>
                  <aside className={`safety-warning-risk-result-panel ${riskBand.className}`}>
                    <div className="safety-warning-risk-card-title compact">
                      <ShieldAlert className="w-5 h-5"/>
                      <div><strong>{t("evalResultLabel")}</strong><span>{t("evalResultDesc")}</span></div>
                    </div>
                    <div className="safety-warning-risk-result-card" style={{ borderColor: riskColors.text, background: riskColors.bg }}>
                      <p>{t("riskScoreLabel")}</p>
                      <div className="safety-warning-risk-score-line">
                        <strong style={{ color: riskColors.text }}>{riskScore}</strong><span>/ 25</span>
                      </div>
                      <b className={`safety-warning-risk-band ${riskBand.className}`}>{t("riskLevelPrefix")}: {riskBand.label}</b>
                      <small className="safety-warning-risk-formula">{form.riskProbability} × {form.riskConsequence} = {riskScore}</small>
                    </div>
                    <div className="safety-warning-hierarchy-card">
                      <strong>Hierarchy of controls</strong>
                      {['Elimination','Substitution','Isolation','Engineering','Administrative','PPE'].map((item, i) => (
                        <span key={item} className={i < 2 ? 'preferred' : i > 4 ? 'least' : ''}>{item}</span>
                      ))}
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
              </div>
            )}

            {/* Block 4: Measures */}
            {warningFormStep === 4 && (
              <div className="safety-warning-form-step safety-warning-step-measures safety-warning-redesign-step-measures">
                <h4 className="section-head"><span className="step-num">4</span> {t("block4Head")}</h4>
                <div className="safety-warning-measures-panel">
                  <div className="safety-warning-measures-text-grid">
                    <div className="safety-warning-measure-box">
                      <ClipboardPen className="safety-warning-measure-icon primary"/>
                      <SafetyLocalizedTextField ariaLabel={t("descriptionLabel")} className="safety-warning-measure-localized" inputClassName="input-form resize-none"
                        label={t("descriptionLabel")} onChange={value => setForm(p => ({ ...p, descriptionI18n: value, description: safetyLocalizedVi(value) }))}
                        placeholder={t("descriptionPlaceholder")} required rows={4} textarea value={form.descriptionI18n}/>
                    </div>
                    <div className="safety-warning-measure-box">
                      <ShieldCheck className="safety-warning-measure-icon success"/>
                      <SafetyLocalizedTextField ariaLabel={t("currentControlLabel")} className="safety-warning-measure-localized" inputClassName="input-form resize-none"
                        label={t("currentControlLabel")} onChange={value => setForm(p => ({ ...p, currentControlI18n: value, currentControl: safetyLocalizedVi(value) }))}
                        placeholder={t("currentControlPlaceholder")} rows={4} textarea value={form.currentControlI18n}/>
                    </div>
                    <div className="safety-warning-measure-box">
                      <Lightbulb className="safety-warning-measure-icon warning"/>
                      <SafetyLocalizedTextField ariaLabel={t("proposedActionLabel")} className="safety-warning-measure-localized" inputClassName="input-form resize-none"
                        label={t("proposedActionLabel")} onChange={value => setForm(p => ({ ...p, proposedActionI18n: value, proposedAction: safetyLocalizedVi(value) }))}
                        placeholder={t("proposedActionPlaceholder")} required rows={4} textarea value={form.proposedActionI18n}/>
                    </div>
                  </div>
                  <div className="safety-warning-measures-bottom-grid">
                    <section className="safety-warning-standard-panel">
                      <div className="safety-warning-panel-title"><BookOpen className="w-4 h-4"/><span>{t("relatedStandardLabel")}</span></div>
                      <div className="safety-warning-standard-entry">
                        <div className="safety-warning-redesign-control has-icon">
                          <BookOpen className="safety-warning-field-icon primary"/>
                          <input aria-label={t("relatedStandardLabel")} value={form.relatedStandard}
                            onChange={e => setForm(p => ({ ...p, relatedStandard: e.target.value, relatedStandardI18n: emptySafetyLocalizedText(e.target.value) }))}
                            className="input-form" placeholder={t("relatedStandardPlaceholder")}/>
                        </div>
                        <button type="button" className="safety-warning-standard-add-btn"><Plus className="w-4 h-4"/> {t("addBtn")}</button>
                      </div>
                      <div className="safety-warning-standard-chips">
                        {activeCat.standards.map(std => (
                          <button key={std} type="button" onClick={() => setForm(p => ({ ...p, relatedStandard: std, relatedStandardI18n: emptySafetyLocalizedText(std) }))} className={form.relatedStandard === std ? 'active' : ''}>
                            {t(`std_${std}` as any) || std}{form.relatedStandard === std ? <X className="w-3.5 h-3.5"/> : null}
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="safety-warning-priority-panel">
                      <div className="safety-warning-panel-title"><Flag className="w-4 h-4"/><span>{t("priorityLabel")} *</span></div>
                      <div className="safety-warning-redesign-control has-icon">
                        <Flag className="safety-warning-field-icon danger"/>
                        <select aria-label={t("priorityLabel")} value={riskScore >= 15 ? t('priorityVeryHigh') : riskScore >= 8 ? t('priorityHigh') : riskScore >= 4 ? t('priorityMedium') : t('priorityLow')}
                          onChange={() => {}} className="input-form">
                          <option>{t("priorityVeryHigh")}</option><option>{t("priorityHigh")}</option>
                          <option>{t("priorityMedium")}</option><option>{t("priorityLow")}</option>
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
              </div>
            )}

            {/* Block 5: Assignment */}
            {warningFormStep === 5 && (
              <div className="safety-warning-form-step safety-warning-step-assignment">
                <div className="safety-warning-assign-info-banner"><Info className="w-4 h-4 shrink-0"/><span>{t("noteStep5")}</span></div>
                <div className="safety-warning-assign-card">
                  <h4 className="section-head"><span className="step-num bg-[#00a99d]">5</span> {t("block5Head")}</h4>
                  <div className="safety-warning-assign-grid">
                    <div className="safety-warning-assign-left">
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
                      <div className="safety-warning-assign-row-2">
                        <div className="safety-warning-assign-field">
                          <label className="label-form">{t("coordinatorLabel")}</label>
                          <div className="safety-warning-assign-input-wrap">
                            <Users className="safety-warning-assign-input-icon"/>
                            <input aria-label={t("coordinatorLabel")} value={form.coordinator || ''} onChange={e => setForm(p => ({ ...p, coordinator: e.target.value }))} className="input-form" placeholder={t("coordinatorPlaceholder")}/>
                          </div>
                        </div>
                        <div className="safety-warning-assign-field safety-warning-assign-notes-field">
                          <SafetyLocalizedTextField ariaLabel={t("additionalNotesLabel")} label={t("additionalNotesLabel")} textarea rows={3}
                            onChange={value => {
                              const limit = (s: string | undefined) => (s || '').slice(0, 500);
                              const limited = { vi: limit(value.vi), en: limit(value.en), ja: limit(value.ja) };
                              setForm(p => ({ ...p, additionalNotesI18n: limited, additionalNotes: limited.vi }));
                            }}
                            placeholder={t("additionalNotesPlaceholder")} value={form.additionalNotesI18n}/>
                          <span className="safety-warning-assign-counter">{(form.additionalNotes || '').length}/500</span>
                        </div>
                      </div>
                    </div>
                    <div className="safety-warning-assign-right">
                      <div className="safety-warning-assign-evidence">
                        <SafetyLocalizedTextField ariaLabel={t("evidenceNotesLabel")} label={t("evidenceNotesLabel")}
                          onChange={value => setForm(p => ({ ...p, evidenceNotesI18n: value, evidenceNotes: safetyLocalizedVi(value) }))}
                          placeholder={t("evidenceNotesPlaceholder")} value={form.evidenceNotesI18n}/>
                        <div className="safety-warning-assign-attach-btn-wrap">
                          <button type="button" onClick={() => document.getElementById('step5-attach')?.click()} className="safety-warning-assign-attach-btn">
                            <Paperclip className="w-3.5 h-3.5"/> {t("attachFileBtn")}
                          </button>
                          <input id="step5-attach" type="file" multiple className="hidden" aria-label={t("block6Head")}
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={e => handleFiles(e.target.files)}/>
                        </div>
                        {attachments.length > 0 && (
                          <div className="safety-warning-assign-files">
                            {attachments.map((file, i) => (
                              <div key={i} className="safety-warning-assign-file-row">
                                <Paperclip className="w-3 h-3 text-foreground/50 shrink-0"/>
                                <span className="flex-1 truncate text-xs">{file.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="safety-warning-assign-summary">
                        <strong className="safety-warning-assign-summary-title">{t("warningSummaryLabel")}</strong>
                        <div className="safety-warning-assign-summary-row">
                          <span>{t("riskLevelLabel")}</span>
                          <span className={`safety-warning-assign-risk-pill ${riskBand.className}`}>{riskBand.label} ({riskScore}/25)</span>
                        </div>
                        <div className="safety-warning-assign-summary-row">
                          <span>{t("departmentLabel")}</span><strong>{form.department || '—'}</strong>
                        </div>
                        <div className="safety-warning-assign-summary-row">
                          <span>{t("specificAreaLabel")}</span><strong>{form.area || form.productionLine || '—'}</strong>
                        </div>
                        <div className="safety-warning-assign-summary-row">
                          <span>{t("deadlineLabel")}</span>
                          <strong className="safety-warning-assign-deadline-val">{formatWarningDisplayDate(form.deadline || suggestedDeadline)}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="safety-warning-assign-info-banner"><Info className="w-4 h-4 shrink-0"/><span>{t("afterSaveNote")}</span></div>
              </div>
            )}

            {/* Block 6: Attachments */}
            {warningFormStep === 6 && (
              <div className="safety-warning-form-step safety-warning-step-attachments">
                <h4 className="section-head"><span className="step-num bg-[#9c27b0]">6</span> {t("block6Head")}</h4>
                <input ref={fileInputRef} type="file" multiple className="hidden" aria-label={t("block6Head")}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={e => handleFiles(e.target.files)}/>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${dragOver ? 'border-[#9c27b0] bg-[#9c27b0]/8' : 'border-border hover:border-[#9c27b0]/50 hover:bg-muted/30'}`}
                >
                  <Upload className="w-6 h-6 mx-auto mb-2 text-foreground/40"/>
                  <p className="text-sm font-semibold text-foreground/70">{t("dragDropText")}</p>
                  <p className="text-xs text-foreground/45 mt-1">{t("dragDropHint")}</p>
                </div>
                {attachments.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {attachments.map((file, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-lg border border-border">
                        <Paperclip className="w-3.5 h-3.5 text-foreground/50 shrink-0"/>
                        <span className="text-sm text-foreground/80 flex-1 truncate">{file.name}</span>
                        <span className="text-xs text-foreground/45 shrink-0">{fmtFileSize(file.size)}</span>
                        <button type="button" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                          className="p-0.5 rounded hover:bg-muted transition-all text-foreground/40 hover:text-foreground/70">
                          <FileX className="w-3.5 h-3.5"/>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="safety-warning-form-footer safety-warning-redesign-footer flex items-center justify-between gap-3 pt-4 border-t border-border/50">
              <p className="text-[11px] text-foreground/45">{t("stepProgressText", { current: warningFormStep, total: WARNING_FORM_LAST_STEP })}</p>
              <div className="flex gap-2.5">
                <button type="button"
                  onClick={warningFormStep === 1 ? closeModal : () => setWarningFormStep(s => Math.max(1, s - 1))}
                  className="px-5 py-2 border border-border rounded-lg font-semibold text-sm text-foreground/70 hover:text-foreground hover:bg-muted transition-all">
                  {warningFormStep === 1 ? t("btnCancel") : t("btnPrev")}
                </button>
                {warningFormStep < WARNING_FORM_LAST_STEP && (
                  <button type="button" onClick={() => setWarningFormStep(s => Math.min(WARNING_FORM_LAST_STEP, s + 1))}
                    className="safety-primary-button px-8 py-2 bg-[#F5C400] text-[#0f2a15] rounded-lg font-bold text-sm hover:bg-[#e0b300] shadow-sm shadow-[#F5C400]/25 transition-all flex items-center gap-2">
                    {t("btnNext")} <ArrowRight className="w-4 h-4"/>
                  </button>
                )}
                {warningFormStep === WARNING_FORM_LAST_STEP && (
                  <button type="button" className="safety-warning-draft-btn px-5 py-2 border border-border rounded-lg font-semibold text-sm text-foreground/70 hover:text-foreground hover:bg-muted transition-all flex items-center gap-2">
                    <Save className="w-4 h-4"/> {t("btnSaveDraft")}
                  </button>
                )}
                <button type="submit" disabled={warningFormStep < WARNING_FORM_LAST_STEP}
                  className="safety-warning-save-btn safety-warning-save-final px-8 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4"/> {t("btnSaveWarning")}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
