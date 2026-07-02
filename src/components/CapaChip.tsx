import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Link2, Loader2, X } from 'lucide-react';

type CapaAction = {
  id: string;
  code: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  ownerName?: string;
  dueDate?: string;
  departmentCode?: string;
  sourceType?: string;
  sourceCode?: string;
  createdByName?: string;
  createdAt?: string;
  problemType?: string | null;
};

const PROBLEM_TYPE_MAP: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  MACH:    { icon: '🔧', label: 'Máy móc & TB',      color: '#7c3aed', bg: '#faf5ff', border: '#ddd6fe' },
  ELEC:    { icon: '⚡', label: 'An toàn điện',      color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  CHEM:    { icon: '☣️', label: 'Hóa chất',          color: '#065f46', bg: '#f0fdf4', border: '#a7f3d0' },
  HEIGHT:  { icon: '🪜', label: 'Làm việc trên cao', color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
  VEHICLE: { icon: '🚜', label: 'Xe nâng / PT',      color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
  PPE:     { icon: '👷', label: 'BHLD / Bảo hộ',    color: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' },
  BEHAV:   { icon: '🧠', label: 'Hành vi/Thao tác',  color: '#9333ea', bg: '#fdf4ff', border: '#e9d5ff' },
  NEAR:    { icon: '⚠️', label: 'Cận nguy',          color: '#92400e', bg: '#fef9c3', border: '#fde68a' },
  ACC:     { icon: '🚑', label: 'Tai nạn LĐ',        color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  FIRE:    { icon: '🔥', label: 'PCCC / Cháy nổ',   color: '#b91c1c', bg: '#fff1f2', border: '#fecdd3' },
  '6S':    { icon: '🧹', label: '6S / Vệ sinh CN',   color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
  ENV:     { icon: '🌿', label: 'Môi trường',        color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
  ENRG:    { icon: '💡', label: 'Năng lượng',        color: '#a16207', bg: '#fefce8', border: '#fef08a' },
};

const STATUS_LABEL: Record<string, string> = {
  open:          'Đang mở',
  assigned:      'Đã giao',
  in_progress:   'Đang xử lý',
  blocked:       'Đang vướng',
  done_by_owner: 'Chờ xác minh',
  reopened:      'Mở lại',
  closed:        'Đã đóng',
  verified:      'Đã xác minh',
};

const STATUS_COLOR: Record<string, { color: string; bg: string }> = {
  open:          { color: '#2563eb', bg: '#eff6ff' },
  assigned:      { color: '#7c3aed', bg: '#f5f3ff' },
  in_progress:   { color: '#d97706', bg: '#fffbeb' },
  blocked:       { color: '#dc2626', bg: '#fef2f2' },
  done_by_owner: { color: '#0891b2', bg: '#ecfeff' },
  reopened:      { color: '#be123c', bg: '#fff1f2' },
  closed:        { color: '#15803d', bg: '#f0fdf4' },
  verified:      { color: '#15803d', bg: '#f0fdf4' },
};

const PRIORITY_LABEL: Record<string, string> = {
  critical: '🔴 Khẩn cấp',
  high:     '🟠 Cao',
  medium:   '🟡 Trung bình',
  low:      '🟢 Thấp',
};

const SOURCE_LABEL: Record<string, string> = {
  warning:  '⚡ Cảnh báo nóng',
  incident: '🚨 Báo cáo sự cố',
  iplan:    '📋 Kế hoạch kiểm tra',
  audit:    '🔍 Kết quả audit',
  manual:   '✏️ Tạo thủ công',
};

function fmtDate(val?: string | null) {
  if (!val) return '—';
  const d = new Date(val.includes('T') ? val : `${val}T00:00:00`);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isOverdue(dueDate?: string | null, status?: string) {
  if (!dueDate || status === 'closed' || status === 'verified') return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

interface CapaChipProps {
  capaId:   string | null | undefined;
  capaCode: string | null | undefined;
  label?:   string;
  onNavigate?: (capaId: string, capaCode: string) => void;
}

export function CapaChip({ capaId, capaCode, label, onNavigate }: CapaChipProps) {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [action, setAction]   = useState<CapaAction | null>(null);
  const [error, setError]     = useState('');
  const chipRef               = useRef<HTMLButtonElement>(null);
  const popupRef              = useRef<HTMLDivElement>(null);
  const [pos, setPos]         = useState({ top: 0, left: 0, above: false });

  if (!capaId || !capaCode) return null;

  const fetchCapa = async () => {
    if (action) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/actions/${encodeURIComponent(capaId)}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: CapaAction = await res.json();
      setAction(data);
    } catch (e: any) {
      setError('Không tải được CAPA.');
    } finally {
      setLoading(false);
    }
  };

  const handleChipClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open) {
      const rect = chipRef.current?.getBoundingClientRect();
      if (rect) {
        const spaceBelow = window.innerHeight - rect.bottom;
        const above = spaceBelow < 340;
        setPos({
          top:   above ? rect.top + window.scrollY - 8 : rect.bottom + window.scrollY + 8,
          left:  Math.min(rect.left + window.scrollX, window.innerWidth - 380),
          above,
        });
      }
      fetchCapa();
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        !chipRef.current?.contains(e.target as Node) &&
        !popupRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const sc = STATUS_COLOR[action?.status ?? ''] ?? { color: '#64748b', bg: '#f1f5f9' };
  const overdue = isOverdue(action?.dueDate, action?.status);

  const popup = open ? createPortal(
    <div
      ref={popupRef}
      style={{
        position:     'absolute',
        top:          pos.above ? undefined : pos.top,
        bottom:       pos.above ? window.innerHeight - pos.top + 8 : undefined,
        left:         Math.max(8, pos.left),
        width:        360,
        zIndex:       9999,
        background:   '#fff',
        border:       '1px solid #e2e8f0',
        borderRadius: 14,
        boxShadow:    '0 12px 40px rgba(0,0,0,0.16)',
        fontFamily:   'inherit',
        overflow:     'hidden',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        gap:            8,
        padding:        '12px 14px 10px',
        background:     'linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 100%)',
        color:          '#fff',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.75, flex: 1 }}>CHI TIẾT CAPA</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, letterSpacing: 0.5 }}>
          {capaCode}
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 2, lineHeight: 1, opacity: 0.8 }}
          type="button"
        >
          <X size={14}/>
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px', maxHeight: 360, overflowY: 'auto' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13, padding: '16px 0' }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/>
            Đang tải...
          </div>
        )}
        {error && !loading && (
          <div style={{ color: '#dc2626', fontSize: 13, padding: '12px 0' }}>{error}</div>
        )}
        {action && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Title */}
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', lineHeight: 1.4 }}>
              {action.title}
            </div>

            {/* Badges row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span style={{
                padding: '2px 9px', borderRadius: 20,
                background: sc.bg, color: sc.color,
                fontSize: 11, fontWeight: 700, border: `1px solid ${sc.color}30`,
              }}>
                {STATUS_LABEL[action.status] ?? action.status}
              </span>
              {action.priority && (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                  {PRIORITY_LABEL[action.priority] ?? action.priority}
                </span>
              )}
              {action.problemType && (() => {
                const pt = PROBLEM_TYPE_MAP[String(action.problemType).toUpperCase()];
                if (!pt) return null;
                return (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    padding: '2px 8px', borderRadius: 20,
                    background: pt.bg, color: pt.color,
                    fontSize: 11, fontWeight: 700, border: `1px solid ${pt.border}`,
                  }}>
                    <span style={{ fontSize: 12 }}>{pt.icon}</span>{pt.label}
                  </span>
                );
              })()}
              {action.sourceType && action.sourceType !== 'manual' && (
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  {SOURCE_LABEL[action.sourceType] ?? action.sourceType}
                </span>
              )}
            </div>

            {/* Details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px' }}>
              <Row label="Người phụ trách" value={action.ownerName}/>
              <Row label="Bộ phận" value={action.departmentCode}/>
              <Row
                label="Hạn xử lý"
                value={fmtDate(action.dueDate)}
                valueColor={overdue ? '#dc2626' : undefined}
                suffix={overdue ? ' ⚠ Quá hạn' : ''}
              />
              <Row label="Tạo bởi" value={action.createdByName}/>
            </div>

            {/* Description */}
            {action.description && (
              <div style={{
                background: '#f8fafc', borderRadius: 8, padding: '8px 10px',
                fontSize: 12, color: '#374151', lineHeight: 1.6,
                borderLeft: '3px solid #2563eb',
              }}>
                {action.description.length > 200
                  ? `${action.description.slice(0, 200)}…`
                  : action.description}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 14px',
        borderTop: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 8,
      }}>
        {onNavigate && capaId && (
          <button
            onClick={() => { setOpen(false); onNavigate(capaId, capaCode!); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', borderRadius: 8,
              background: '#2563eb', color: '#fff',
              border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            }}
            type="button"
          >
            <ExternalLink size={12}/> Xem đầy đủ
          </button>
        )}
        {!onNavigate && (
          <button
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new CustomEvent('navigate-to-capa', { detail: { capaId, capaCode } }));
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', borderRadius: 8,
              background: '#2563eb', color: '#fff',
              border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            }}
            type="button"
          >
            <ExternalLink size={12}/> Đến trang CAPA
          </button>
        )}
        <button
          onClick={() => setOpen(false)}
          style={{
            padding: '5px 10px', borderRadius: 8,
            background: '#f1f5f9', color: '#64748b',
            border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
          }}
          type="button"
        >
          Đóng
        </button>
      </div>

      {/* CSS for spinner */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={chipRef}
        onClick={handleChipClick}
        title={`Xem CAPA: ${capaCode}`}
        type="button"
        style={{
          display:       'inline-flex',
          alignItems:    'center',
          gap:           4,
          padding:       '2px 9px',
          borderRadius:  20,
          background:    open ? 'rgba(37,99,235,0.15)' : 'rgba(37,99,235,0.08)',
          color:         '#1d4ed8',
          border:        `1px solid ${open ? 'rgba(37,99,235,0.45)' : 'rgba(37,99,235,0.25)'}`,
          fontSize:      11,
          fontWeight:    700,
          cursor:        'pointer',
          fontFamily:    'inherit',
          letterSpacing: 0.2,
          lineHeight:    1.6,
          whiteSpace:    'nowrap',
          transition:    'background 0.15s, border-color 0.15s',
        }}
      >
        <Link2 size={10} strokeWidth={2.5}/>
        {label ? `${label}: ` : 'CAPA: '}{capaCode}
      </button>
      {popup}
    </>
  );
}

function Row({
  label, value, valueColor, suffix,
}: {
  label: string; value?: string | null; valueColor?: string; suffix?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: valueColor ?? '#0f172a' }}>
        {value || '—'}{suffix}
      </div>
    </div>
  );
}
