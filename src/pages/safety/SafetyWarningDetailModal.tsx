import React, { useState } from 'react';
import { X, Paperclip, ShieldAlert, Activity, Cog, Leaf, UserRound, Flame, FlaskConical,
         CheckCircle2, Clock, Wrench, ShieldCheck, XCircle, AlertCircle } from 'lucide-react';
import { useHubLanguage } from '../../i18n-context';
import { localizedText } from '../../i18n-localized';
import { CapaChip } from '../../components/CapaChip';
import "./safety-warning-detail-modal.css";

type LocalizedContent = Record<string, string | undefined>;
type WStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'VERIFIED' | 'OVERDUE';
type WCategory = 'EQUIPMENT' | 'ENVIRONMENT' | 'HUMAN_BEHAVIOR' | 'FIRE_SAFETY' | 'CHEMICALS' | 'ERGONOMICS';
type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Warning {
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
  productionLine?: string;
  machineName?: string;
  locationDetail?: string;
  detectedAt?: string;
  capaId?:   string | null;
  capaCode?: string | null;
}

type ModalUser = { id?: string; name?: string; role?: string; department?: string } | null;

const RISK_COLORS: Record<RiskLevel, { text: string; bg: string }> = {
  CRITICAL: { text: '#ff1f1f', bg: 'rgba(255,31,31,0.07)' },
  HIGH:     { text: '#f47c2b', bg: 'rgba(244,124,43,0.08)' },
  MEDIUM:   { text: '#d4a017', bg: 'rgba(212,160,23,0.09)' },
  LOW:      { text: '#0fb45f', bg: 'rgba(15,180,95,0.07)'  },
};
const DEFAULT_RISK_COLOR = { text: '#64748b', bg: 'rgba(100,116,139,0.07)' };
const getRiskColor = (level: string) => RISK_COLORS[level as RiskLevel] ?? DEFAULT_RISK_COLOR;

const STATUS_COLOR: Record<string, string> = {
  OPEN:        '#1565c0',
  IN_PROGRESS: '#f9a825',
  DONE:        '#22a050',
  VERIFIED:    '#15803d',
  OVERDUE:     '#e53935',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN:        'Đang mở',
  IN_PROGRESS: 'Đang xử lý',
  DONE:        'Đã hoàn thành',
  VERIFIED:    'EHS xác nhận',
  OVERDUE:     'Quá hạn',
};

const CATEGORY_ICONS: Record<WCategory, React.ComponentType<{ className?: string }>> = {
  'EQUIPMENT':      Cog,
  'ENVIRONMENT':    Leaf,
  'HUMAN_BEHAVIOR': UserRound,
  'FIRE_SAFETY':    Flame,
  'CHEMICALS':      FlaskConical,
  'ERGONOMICS':     Activity,
};

const fmtDate = (value?: string, fallback = '—') => {
  if (!value) return fallback;
  const d = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

function DField({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={`safety-warning-detail-field ${full ? 'col-span-full' : ''}`}>
      <div className="safety-warning-detail-label text-[11px] font-semibold uppercase tracking-wider text-foreground/50 mb-1">{label}</div>
      <div className="safety-warning-detail-value text-sm text-foreground leading-relaxed">{value || '—'}</div>
    </div>
  );
}

/* ── 4-Step Workflow Stepper ───────────────────────────── */
type StepState = 'done' | 'active' | 'rejected' | 'pending';

function computeSteps(warning: Warning): { label: string; icon: React.ReactNode; state: StepState; note?: string }[] {
  const approved = warning.approvalStatus === 'APPROVED';
  const rejected = warning.approvalStatus === 'REJECTED';
  const done     = warning.status === 'DONE' || warning.status === 'VERIFIED';
  const verified = warning.status === 'VERIFIED';

  return [
    {
      label: 'Tạo cảnh báo',
      icon: <CheckCircle2 size={14}/>,
      state: 'done',
      note: fmtDate(warning.createdDate ?? warning.createdAt),
    },
    {
      label: 'Phê duyệt',
      icon: <ShieldCheck size={14}/>,
      state: rejected ? 'rejected' : approved ? 'done' : 'active',
      note: rejected ? 'Đã từ chối' : approved ? 'Đã duyệt' : 'Chờ duyệt',
    },
    {
      label: 'Thực hiện',
      icon: <Wrench size={14}/>,
      state: !approved ? 'pending'
        : verified || done ? 'done'
        : warning.status === 'IN_PROGRESS' ? 'active'
        : 'active',
      note: !approved ? '' : done ? 'Đã hoàn thành' : warning.status === 'IN_PROGRESS' ? 'Đang xử lý' : 'Bắt đầu xử lý',
    },
    {
      label: 'EHS xác nhận',
      icon: <CheckCircle2 size={14}/>,
      state: verified ? 'done' : done && approved ? 'active' : 'pending',
      note: verified ? 'Đã xác nhận' : done && approved ? 'Chờ EHS' : '',
    },
  ];
}

const STEP_COLORS: Record<StepState, { bg: string; border: string; text: string; dot: string }> = {
  done:     { bg: '#f0fdf4', border: '#22c55e', text: '#15803d', dot: '#22c55e' },
  active:   { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8', dot: '#3b82f6' },
  rejected: { bg: '#fef2f2', border: '#ef4444', text: '#dc2626', dot: '#ef4444' },
  pending:  { bg: '#f8fafc', border: '#e2e8f0', text: '#94a3b8', dot: '#cbd5e1' },
};

function WorkflowStepper({ warning }: { warning: Warning }) {
  const steps = computeSteps(warning);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
      {steps.map((step, i) => {
        const c = STEP_COLORS[step.state];
        const isLast = i === steps.length - 1;
        return (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80, flex: 1 }}>
              {/* Dot + icon */}
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: c.bg, border: `2px solid ${c.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: c.text, flexShrink: 0,
              }}>
                {step.icon}
              </div>
              {/* Label */}
              <div style={{ marginTop: 5, fontSize: 11, fontWeight: 700, color: c.text, textAlign: 'center', lineHeight: 1.3 }}>
                {step.label}
              </div>
              {/* Note */}
              {step.note && (
                <div style={{ fontSize: 10, color: c.text, opacity: 0.75, textAlign: 'center', marginTop: 2 }}>
                  {step.note}
                </div>
              )}
            </div>
            {/* Connector line */}
            {!isLast && (
              <div style={{
                flex: 'none', width: 24, height: 2,
                background: step.state === 'done' ? '#22c55e' : '#e2e8f0',
                alignSelf: 'flex-start', marginTop: 15, flexShrink: 0,
              }}/>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── Role helpers ───────────────────────────────────────── */
const canApproveRole = (role?: string) =>
  ['admin', 'ehs', 'leader', 'quanly', 'giamdoc'].includes(role || '');
const canVerifyRole = (role?: string) =>
  ['admin', 'ehs'].includes(role || '');

/* ── Footer actions ────────────────────────────────────── */
function WorkflowFooter({
  warning, user, onStatusChange, onApprove, onReject, onVerify, onClose,
}: {
  warning: Warning;
  user: ModalUser;
  onStatusChange: (id: string, status: WStatus) => void;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
  onVerify?: () => void;
  onClose: () => void;
}) {
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const { approvalStatus, status } = warning;
  const isApproved = approvalStatus === 'APPROVED';
  const isRejected = approvalStatus === 'REJECTED';
  const isPending  = approvalStatus === 'PENDING';
  const canApprove = canApproveRole(user?.role) && onApprove;
  const canVerify  = canVerifyRole(user?.role) && onVerify;

  const btn = (label: string, onClick: () => void, opts: {
    color?: string; bg?: string; border?: string; disabled?: boolean
  } = {}) => (
    <button
      type="button"
      onClick={onClick}
      disabled={opts.disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
        fontFamily: 'inherit', cursor: opts.disabled ? 'not-allowed' : 'pointer',
        opacity: opts.disabled ? 0.5 : 1,
        color: opts.color ?? '#fff',
        background: opts.bg ?? '#2563eb',
        border: `1.5px solid ${opts.border ?? (opts.bg ?? '#2563eb')}`,
        transition: 'opacity 0.15s',
      }}
    >
      {label}
    </button>
  );

  /* REJECTED */
  if (isRejected) return (
    <div style={{ padding: '10px 24px 10px', borderTop: '1px solid #f1f5f9', background: '#fef2f2' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: canApprove ? 10 : 0 }}>
        <XCircle size={14} style={{ color: '#dc2626', flexShrink: 0, marginTop: 2 }}/>
        <div style={{ fontSize: 12, color: '#dc2626' }}>
          <strong>Lý do từ chối:</strong> {warning.rejectionReason || '(không có ghi chú)'}
        </div>
      </div>
      {canApprove && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {btn('✅ Phê duyệt lại', () => { onApprove!(); onClose(); }, { bg: '#16a34a', border: '#16a34a' })}
          {btn('Đóng', onClose, { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' })}
        </div>
      )}
      {!canApprove && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          {btn('Đóng', onClose, { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' })}
        </div>
      )}
    </div>
  );

  /* PENDING - waiting approval */
  if (isPending) return (
    <div style={{ padding: '10px 24px', borderTop: '1px solid #f1f5f9', background: '#fffbeb' }}>
      {showReject ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', marginBottom: 4 }}>Lý do từ chối:</div>
          <input
            autoFocus
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="Nhập lý do từ chối..."
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: 12,
              border: '1.5px solid #fca5a5', outline: 'none', fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Clock size={13} style={{ color: '#d97706' }}/>
          <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>Chờ phê duyệt bởi Trưởng BP / EHS</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {canApprove && !showReject && btn('✅ Phê duyệt', () => { onApprove!(); onClose(); }, { bg: '#16a34a', border: '#16a34a' })}
        {canApprove && !showReject && btn('❌ Từ chối', () => setShowReject(true), { bg: '#dc2626', border: '#dc2626' })}
        {canApprove && showReject && btn('Xác nhận từ chối', () => {
          if (!rejectReason.trim()) return;
          onReject!(rejectReason.trim()); onClose();
        }, { bg: '#dc2626', border: '#dc2626', disabled: !rejectReason.trim() })}
        {showReject && btn('Hủy', () => { setShowReject(false); setRejectReason(''); }, { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' })}
        {!showReject && btn('Đóng', onClose, { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' })}
      </div>
    </div>
  );

  /* APPROVED + VERIFIED (fully done) */
  if (isApproved && status === 'VERIFIED') return (
    <div style={{ padding: '10px 24px', borderTop: '1px solid #f1f5f9', background: '#f0fdf4' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle2 size={14} style={{ color: '#16a34a' }}/>
          <span style={{ fontSize: 12, color: '#15803d', fontWeight: 700 }}>Đã hoàn tất — EHS xác nhận đóng</span>
        </div>
        {btn('Đóng', onClose, { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' })}
      </div>
    </div>
  );

  /* APPROVED + DONE → waiting EHS verify */
  if (isApproved && status === 'DONE') return (
    <div style={{ padding: '10px 24px', borderTop: '1px solid #f1f5f9', background: '#ecfeff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <AlertCircle size={13} style={{ color: '#0891b2' }}/>
        <span style={{ fontSize: 12, color: '#0e7490', fontWeight: 600 }}>
          Người thực hiện đã báo hoàn thành — Chờ EHS kiểm tra & xác nhận đóng
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {canVerify && btn('✅ Xác nhận đóng (EHS)', () => { onVerify!(); onClose(); }, { bg: '#0891b2', border: '#0891b2' })}
        {!canVerify && <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Chỉ EHS / Admin mới xác nhận được</span>}
        {btn('Đóng', onClose, { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' })}
      </div>
    </div>
  );

  /* APPROVED + OPEN or IN_PROGRESS → implementer actions */
  return (
    <div style={{ padding: '10px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>Cập nhật tiến độ thực hiện:</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {status === 'OPEN' && btn('▶ Bắt đầu xử lý', () => { onStatusChange(warning.id, 'IN_PROGRESS'); onClose(); }, { bg: '#d97706', border: '#d97706' })}
          {status === 'IN_PROGRESS' && btn('✓ Báo hoàn thành', () => { onStatusChange(warning.id, 'DONE'); onClose(); }, { bg: '#16a34a', border: '#16a34a' })}
          {status === 'DONE' && !canVerify && btn('↩ Mở lại', () => { onStatusChange(warning.id, 'IN_PROGRESS'); onClose(); }, { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' })}
          {btn('Đóng', onClose, { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' })}
        </div>
      </div>
    </div>
  );
}

/* ── Main Modal ─────────────────────────────────────────── */
export function WarningDetailModal({
  lang, warning, onClose, onStatusChange, user, onApprove, onReject, onVerify,
}: {
  lang: string;
  warning: Warning;
  onClose: () => void;
  onStatusChange: (id: string, status: WStatus) => void;
  user?: ModalUser;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
  onVerify?: () => void;
}) {
  const rc = getRiskColor(warning.riskLevel);
  const { t } = useHubLanguage();
  const stColor = STATUS_COLOR[warning.status] ?? '#64748b';
  const CategoryIcon = CATEGORY_ICONS[warning.category] || ShieldAlert;
  const wt = (key: keyof Warning) =>
    localizedText(warning[`${String(key)}I18n` as keyof Warning] as LocalizedContent | undefined, lang, String(warning[key] || ''));

  return (
    <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}/>
      <div
        aria-label={`Chi tiết cảnh báo ${warning.code}`}
        aria-modal="true"
        className="safety-warning-modal-shell relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        role="dialog"
      >
        {/* Risk color bar */}
        <div className="h-1 w-full shrink-0" style={{ background: `linear-gradient(90deg,${rc.text},${rc.text}80)` }}/>

        {/* Header */}
        <div className="safety-warning-modal-header px-6 py-4 border-b border-border/60 flex items-start justify-between shrink-0 bg-muted/20">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-[#1565c0]">
              <CategoryIcon className="h-5 w-5"/>
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-mono font-bold text-xs text-[#1565c0]">{warning.code}</span>
                <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ color: rc.text, background: rc.bg }}>
                  {t(`enum${warning.riskLevel}` as any) || warning.riskLevel} (×{warning.riskScore})
                </span>
                <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ color: stColor, background: `${stColor}18` }}>
                  {STATUS_LABEL[warning.status] ?? warning.status}
                </span>
              </div>
              <h3 className="font-bold text-[15px] text-foreground leading-tight">{wt('title')}</h3>
              <p className="text-[12px] text-foreground/60 mt-0.5">
                {t(`cat${warning.category}` as any) || warning.category}
                {warning.subcategory ? ` · ${t(`sub_${warning.subcategory}` as any) || warning.subcategory}` : ''}
              </p>
            </div>
          </div>
          <button
            aria-label="Đóng chi tiết cảnh báo"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-muted transition-all shrink-0 ml-3"
            type="button"
          >
            <X className="w-4 h-4"/>
          </button>
        </div>

        {/* Workflow stepper */}
        <div style={{ padding: '14px 24px 10px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
            Quy trình xử lý
          </div>
          <WorkflowStepper warning={warning}/>
        </div>

        {/* Body */}
        <div className="safety-modal-body overflow-y-auto flex-1 p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <DField label="Bộ phận" value={warning.department}/>
            <DField label="Khu vực" value={wt('area')}/>
            <DField label="Ngày tạo" value={fmtDate(warning.createdDate ?? warning.createdAt, '—')}/>
            <DField label="Hạn xử lý" value={fmtDate(warning.deadline, '—')}/>
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
            <div className="safety-warning-detail-field">
              <div className="safety-warning-detail-label text-[11px] font-semibold uppercase tracking-wider text-foreground/50 mb-1">{t("proposedActionLabel")}</div>
              <div className="safety-warning-detail-value text-sm text-foreground leading-relaxed">{wt('proposedAction') || '—'}</div>
              {warning.capaId && (
                <div style={{ marginTop: 6 }}>
                  <CapaChip capaId={warning.capaId} capaCode={warning.capaCode}/>
                </div>
              )}
            </div>
            <DField label={t("relatedStandardLabel")} value={wt('relatedStandard')}/>
            <DField label={t("assigneeLabel")} value={warning.responsiblePerson}/>
            <DField label={t("reporterLabel")} value={warning.reporterName}/>
          </div>

          {wt('evidenceNotes') && <DField label={t("evidenceNotesLabel")} value={wt('evidenceNotes')}/>}

          {warning.attachmentNames && warning.attachmentNames.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground/50 mb-2">
                Tệp đính kèm ({warning.attachmentNames.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {warning.attachmentNames.map((name, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-lg text-xs font-medium text-foreground/80 border border-border">
                    <Paperclip className="w-3 h-3 text-foreground/50"/> {name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer: role-based workflow actions */}
        <WorkflowFooter
          warning={warning}
          user={user ?? null}
          onStatusChange={onStatusChange}
          onApprove={onApprove}
          onReject={onReject}
          onVerify={onVerify}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
