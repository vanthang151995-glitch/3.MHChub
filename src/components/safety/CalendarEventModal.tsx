/**
 * CalendarEventModal — event-detail modal mở từ Lịch An Toàn
 * Hỗ trợ 3 loại: audit | meeting | inspection
 * CSS isolation: dùng 100% inline styles bên trong modal
 */
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../pages/safety/safety-api";

// ─── types ────────────────────────────────────────────────────────────────────
export type EventKind = "audit" | "meeting" | "inspection";

export interface CalEvent {
  id: string;          // prefixed: "audit:123"
  date: string;
  title: string;
  kind: EventKind;
  status: string;
  subtitle?: string;
}

interface AuditDetail {
  id: string; title: string; status: string;
  departmentCode?: string; departmentName?: string;
  locationId?: string; locationName?: string;
  scheduledDate?: string; performedAt?: string; period?: string;
  totalScore?: number; maxScore?: number; scorePercent?: number;
  createdByName?: string; reviewerName?: string; reviewedAt?: string;
  answers?: AuditAnswer[];
}
interface AuditAnswer {
  id: string; questionText?: string; category?: string;
  resultStatus?: string; score?: number; maxScore?: number;
  finding?: string; evidenceNotes?: string;
  capaId?: string; capaCode?: string;
}

interface MeetingDetail {
  id: string; title: string; status: string;
  meetingDate?: string; startTime?: string; endTime?: string;
  location?: string; chairperson?: string; type?: string;
  participants?: { name: string; role?: string }[];
  agenda?: { topic: string; presenter?: string; duration?: string; notes?: string }[];
  actionItems?: { content: string; assignee?: string; dueDate?: string; status?: string }[];
  createdByName?: string;
}

interface PlanDetail {
  id: string; title: string; status: string; type?: string;
  period?: string; scheduledDate?: string; actualDate?: string;
  leadInspectorName?: string; overallScore?: number; scorePercent?: number;
  departments?: string[];
  approvalStatus?: string; approvedByName?: string;
  description?: string;
  createdByName?: string;
}

// ─── colour helpers ───────────────────────────────────────────────────────────
const KIND_COLOR: Record<EventKind, { accent: string; icon: string; label: string; route: string }> = {
  audit:      { accent: "#2563eb", icon: "📋", label: "Audit 6S",      route: "/safety-6s/audits"          },
  meeting:    { accent: "#059669", icon: "👥", label: "Họp An Toàn",   route: "/safety-6s/safety-meetings" },
  inspection: { accent: "#d97706", icon: "📅", label: "Kế Hoạch KT",  route: "/safety-6s/inspection-plans" },
};

const STATUS_VN: Record<string, { label: string; bg: string; fg: string; border: string }> = {
  approved:    { label: "Đã duyệt",        bg: "#dcfce7", fg: "#166534", border: "#86efac" },
  submitted:   { label: "Chờ duyệt",       bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" },
  draft:       { label: "Nháp",            bg: "#f1f5f9", fg: "#475569", border: "#cbd5e1" },
  rejected:    { label: "Từ chối",         bg: "#fee2e2", fg: "#991b1b", border: "#fca5a5" },
  completed:   { label: "Hoàn thành",      bg: "#dcfce7", fg: "#166534", border: "#86efac" },
  planned:     { label: "Đã lên lịch",     bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" },
  cancelled:   { label: "Đã hủy",         bg: "#f1f5f9", fg: "#475569", border: "#cbd5e1" },
  in_progress: { label: "Đang thực hiện", bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" },
  active:      { label: "Đang hoạt động", bg: "#d1fae5", fg: "#065f46", border: "#6ee7b7" },
};
function statusStyle(s: string) {
  return STATUS_VN[s] ?? { label: s, bg: "#f1f5f9", fg: "#475569", border: "#cbd5e1" };
}
function scoreColor(n: number) {
  return n >= 85 ? "#16a34a" : n >= 75 ? "#2563eb" : n >= 60 ? "#d97706" : "#dc2626";
}
function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("vi-VN");
}

// ─── shared UI atoms ──────────────────────────────────────────────────────────
function ScoreRing({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min(score / max, 1);
  const R = 44, C = 2 * Math.PI * R;
  const color = scoreColor(score);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={108} height={108} viewBox="0 0 108 108">
        <circle cx={54} cy={54} r={R} fill="none" stroke="#f1f5f9" strokeWidth={10} />
        <circle cx={54} cy={54} r={R} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${pct * C} ${C}`} strokeLinecap="round"
          transform="rotate(-90 54 54)" />
        <text x={54} y={50} textAnchor="middle" fontSize={26} fontWeight={800} fill={color}>{score}</text>
        <text x={54} y={65} textAnchor="middle" fontSize={11} fill="#94a3b8">/ {max}</text>
      </svg>
      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: -2 }}>Điểm tổng</div>
    </div>
  );
}

function MetaRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 11, alignItems: "flex-start" }}>
      <span style={{ color: "#94a3b8", minWidth: 72, flexShrink: 0 }}>{icon} {label}</span>
      <span style={{ color: "#374151", fontWeight: 600, lineHeight: 1.4 }}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "#f1f5f9", margin: "8px 0" }} />;
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 14px", fontSize: 12, fontWeight: 700,
      borderBottom: active ? "2px solid currentColor" : "2px solid transparent",
      marginBottom: -1, background: "none", border: "none",
      borderBottomWidth: 2, borderBottomStyle: "solid",
      borderBottomColor: active ? undefined : "transparent",
      color: active ? undefined : "#94a3b8",
      cursor: "pointer", whiteSpace: "nowrap",
      ...(active ? {} : {}),
    }}>
      {children}
    </button>
  );
}

// ─── AUDIT BODY ───────────────────────────────────────────────────────────────
type FindingStatus = "open" | "doing" | "fixed";
const FIX_ST: Record<FindingStatus, { label: string; dot: string; bg: string; fg: string; next: FindingStatus | null }> = {
  open:  { label: "Chưa xử lý",   dot: "#ef4444", bg: "#fee2e2", fg: "#991b1b", next: "doing" },
  doing: { label: "Đang xử lý",   dot: "#f59e0b", bg: "#fef3c7", fg: "#92400e", next: "fixed" },
  fixed: { label: "Đã khắc phục", dot: "#16a34a", bg: "#dcfce7", fg: "#166534", next: null    },
};

function FindingRow({
  ans, expanded, onToggle,
}: { ans: AuditAnswer; expanded: boolean; onToggle: () => void }) {
  const [fixStatus, setFixStatus] = useState<FindingStatus>("open");
  const st = FIX_ST[fixStatus];

  return (
    <div style={{ marginBottom: 6 }}>
      {/* row */}
      <button onClick={onToggle} style={{
        width: "100%", display: "flex", alignItems: "flex-start", gap: 10,
        padding: "10px 12px", borderRadius: 12, textAlign: "left", cursor: "pointer",
        border: `1px solid ${expanded ? "#bfdbfe" : "#f1f5f9"}`,
        background: expanded ? "#eff6ff" : "#fafafa",
        transition: "background .15s",
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: st.dot, flexShrink: 0, marginTop: 5 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", lineHeight: 1.4 }}>
            {ans.finding || ans.questionText || `Câu hỏi #${ans.id}`}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, fontWeight: 700,
              background: st.bg, color: st.fg, border: `1px solid ${st.dot}50` }}>
              {st.label}
            </span>
            {ans.capaCode && (
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, fontWeight: 700,
                background: "#dcfce7", color: "#166534", border: "1px solid #86efac" }}>
                ✓ {ans.capaCode}
              </span>
            )}
            {ans.evidenceNotes && (
              <span style={{ fontSize: 10, color: "#64748b" }}>📷 Có ghi chú</span>
            )}
          </div>
        </div>
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2.5}
          style={{ flexShrink: 0, marginTop: 4, transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* detail panel */}
      {expanded && (
        <div style={{ margin: "4px 0 0", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          {/* panel header */}
          <div style={{ padding: "10px 14px", background: "#f8fafc", borderBottom: "1px solid #f1f5f9",
            display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
              Chi tiết phát hiện
            </span>
            <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, fontWeight: 700,
              background: st.bg, color: st.fg, border: `1px solid ${st.dot}50` }}>
              {st.label}
            </span>
          </div>

          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* description */}
            {(ans.finding || ans.evidenceNotes) && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase",
                  letterSpacing: 1.2, marginBottom: 6 }}>Mô tả vấn đề</div>
                <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.6, margin: 0 }}>
                  {ans.finding || ans.evidenceNotes}
                </p>
              </div>
            )}

            {/* score */}
            {ans.score !== undefined && ans.maxScore !== undefined && (
              <div style={{ display: "flex", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>Điểm câu hỏi</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: scoreColor((ans.score / ans.maxScore) * 100) }}>
                    {ans.score}<span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8" }}>/{ans.maxScore}</span>
                  </div>
                </div>
              </div>
            )}

            {/* CAPA link */}
            {ans.capaCode && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1.2 }}>CAPA</span>
                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, fontWeight: 700,
                  background: "#dcfce7", color: "#166534", border: "1px solid #86efac", cursor: "pointer" }}>
                  ✓ {ans.capaCode} — xem CAPA →
                </span>
              </div>
            )}

            {/* before photos */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase",
                letterSpacing: 1.2, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <span>📷</span> Ảnh phát hiện vấn đề
              </div>
              <div style={{ border: "2px dashed #bae6fd", borderRadius: 10, background: "#f0f9ff",
                padding: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 20 }}>📁</span>
                <span style={{ fontSize: 11, color: "#7dd3fc", fontWeight: 600 }}>Kéo thả ảnh hoặc nhấn để chọn</span>
                <span style={{ fontSize: 10, color: "#bae6fd" }}>PNG, JPG — tối đa 6 ảnh</span>
              </div>
            </div>

            {/* after photos */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase",
                letterSpacing: 1.2, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <span>✅</span> Ảnh sau khi khắc phục
                <span style={{ fontSize: 9, fontWeight: 400, color: "#cbd5e1", textTransform: "none" }}>
                  (cập nhật khi đã xử lý xong)
                </span>
              </div>
              {fixStatus === "fixed" ? (
                <div style={{ border: "2px dashed #bbf7d0", borderRadius: 10, background: "#f0fdf4",
                  padding: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 20 }}>📁</span>
                  <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 600 }}>Thêm ảnh sau cải tiến</span>
                </div>
              ) : (
                <div style={{ borderRadius: 10, background: "#f8fafc", border: "1px solid #f1f5f9",
                  padding: "12px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>⏳</span>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>Chưa có ảnh cải tiến — cập nhật sau khi xử lý xong</span>
                </div>
              )}
            </div>

            {/* actions */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
              {ans.capaCode ? (
                <span style={{ fontSize: 11, color: "#64748b" }}>Đã liên kết: {ans.capaCode}</span>
              ) : (
                <button style={{ fontSize: 11, color: "#2563eb", fontWeight: 700,
                  background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  + Tạo CAPA từ phát hiện này
                </button>
              )}
              {st.next && (
                <button
                  onClick={(e) => { e.stopPropagation(); setFixStatus(st.next!); }}
                  style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 8,
                    background: FIX_ST[st.next].dot, color: "#fff", border: "none", cursor: "pointer" }}>
                  → {FIX_ST[st.next].label}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditBody({ audit, km, navigate }: { audit: AuditDetail; km: typeof KIND_COLOR[EventKind]; navigate: ReturnType<typeof useNavigate> }) {
  const [tab, setTab] = useState<"findings" | "log">("findings");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const findings = (audit.answers ?? []).filter(
    a => a.resultStatus === "fail" || a.resultStatus === "ng" || (a.finding && a.finding.trim())
  );
  const st = statusStyle(audit.status);
  const score = audit.scorePercent ?? (audit.totalScore && audit.maxScore
    ? Math.round((audit.totalScore / audit.maxScore) * 100) : null);
  const dateStr = fmtDate(audit.scheduledDate || audit.performedAt);

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* left */}
      <div style={{ width: 240, flexShrink: 0, padding: 18, display: "flex", flexDirection: "column", gap: 14,
        borderRight: "1px solid #f1f5f9", overflowY: "auto" }}>
        {score !== null ? (
          <ScoreRing score={score} />
        ) : (
          <div style={{ textAlign: "center", padding: "16px 0", color: "#94a3b8", fontSize: 12 }}>Chưa có điểm</div>
        )}
        <Divider />
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <MetaRow icon="📅" label="Ngày audit" value={dateStr} />
          {audit.departmentName && <MetaRow icon="🏭" label="Bộ phận" value={audit.departmentName} />}
          {audit.departmentCode && !audit.departmentName && <MetaRow icon="🏭" label="Bộ phận" value={audit.departmentCode} />}
          {audit.locationName && <MetaRow icon="📍" label="Khu vực" value={audit.locationName} />}
          {audit.createdByName && <MetaRow icon="👤" label="Thực hiện" value={audit.createdByName} />}
          {audit.reviewerName && <MetaRow icon="✅" label="Duyệt bởi" value={audit.reviewerName} />}
        </div>
      </div>

      {/* right */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", borderBottom: "1px solid #f1f5f9", padding: "0 16px" }}>
          <button onClick={() => setTab("findings")} style={{
            padding: "10px 14px", fontSize: 12, fontWeight: 700, background: "none", border: "none",
            borderBottom: `2px solid ${tab === "findings" ? km.accent : "transparent"}`,
            color: tab === "findings" ? km.accent : "#94a3b8", cursor: "pointer", marginBottom: -1,
          }}>
            ⚠ Phát hiện ({findings.length})
          </button>
          <button onClick={() => setTab("log")} style={{
            padding: "10px 14px", fontSize: 12, fontWeight: 700, background: "none", border: "none",
            borderBottom: `2px solid ${tab === "log" ? km.accent : "transparent"}`,
            color: tab === "log" ? km.accent : "#94a3b8", cursor: "pointer", marginBottom: -1,
          }}>
            📋 Lịch sử
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {tab === "findings" && (
            <div>
              {/* summary strip */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {[
                  { val: findings.filter(() => true).length, label: "Phát hiện", color: "#ef4444" },
                  { val: findings.filter(f => f.capaCode).length, label: "Đã có CAPA", color: "#16a34a" },
                  { val: findings.filter(f => !f.capaCode).length, label: "Chưa có CAPA", color: "#f59e0b" },
                ].map(s => (
                  <div key={s.label} style={{ flex: 1, background: "#f8fafc", borderRadius: 10,
                    border: "1px solid #f1f5f9", padding: "8px 6px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {findings.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: 13 }}>
                  <div style={{ fontSize: 32 }}>✅</div>
                  <div style={{ marginTop: 8, fontWeight: 600 }}>Không có phát hiện nào</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>Audit đạt toàn bộ tiêu chí</div>
                </div>
              ) : (
                findings.map(f => (
                  <FindingRow
                    key={f.id} ans={f}
                    expanded={expandedId === f.id}
                    onToggle={() => setExpandedId(expandedId === f.id ? null : f.id)}
                  />
                ))
              )}

              <button style={{ width: "100%", marginTop: 8, padding: "9px 0", fontSize: 11, fontWeight: 600,
                color: "#94a3b8", border: "2px dashed #e2e8f0", borderRadius: 12,
                background: "none", cursor: "pointer" }}>
                + Thêm phát hiện
              </button>
            </div>
          )}

          {tab === "log" && (
            <div>
              {[
                { icon: "📝", action: "Tạo audit",            by: audit.createdByName || "—",   time: fmtDate(audit.scheduledDate) },
                { icon: "✅", action: "Chấm điểm hoàn tất",  by: audit.createdByName || "—",   time: "—" },
                { icon: "📤", action: "Gửi duyệt",            by: "Hệ thống",                    time: "—" },
                ...(audit.reviewerName ? [{ icon: "🟢", action: "Đã duyệt", by: audit.reviewerName, time: fmtDate(audit.reviewedAt) }] : []),
              ].map((l, i, arr) => (
                <div key={i} style={{ display: "flex", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#f8fafc",
                      border: "1px solid #e2e8f0", display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 14 }}>{l.icon}</div>
                    {i < arr.length - 1 && <div style={{ width: 1, flex: 1, background: "#f1f5f9", minHeight: 16, margin: "2px 0" }} />}
                  </div>
                  <div style={{ paddingBottom: 16, paddingTop: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{l.action}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{l.by} · {l.time}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #f1f5f9", background: "#fafafa",
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 11, color: "#64748b" }}>
            {findings.length} phát hiện · {findings.filter(f => f.capaCode).length} CAPA đã tạo
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => navigate(`${km.route}/${audit.id}`)} style={{
              padding: "7px 14px", fontSize: 12, fontWeight: 700, color: "#374151",
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, cursor: "pointer" }}>
              Xem đầy đủ →
            </button>
            {audit.status === "submitted" && (
              <button style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, color: "#fff",
                background: km.accent, border: "none", borderRadius: 10, cursor: "pointer", boxShadow: "0 1px 4px #00000020" }}>
                Duyệt audit ✓
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MEETING BODY ─────────────────────────────────────────────────────────────
function MeetingBody({ m, km, navigate }: { m: MeetingDetail; km: typeof KIND_COLOR[EventKind]; navigate: ReturnType<typeof useNavigate> }) {
  const [tab, setTab] = useState<"agenda" | "actions">("agenda");
  const agenda = m.agenda ?? [];
  const actions = m.actionItems ?? [];
  const doneCount = actions.filter(a => a.status === "done" || a.status === "completed").length;

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* left */}
      <div style={{ width: 232, flexShrink: 0, padding: 18, borderRight: "1px solid #f1f5f9", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 14 }}>
        {/* time card */}
        <div style={{ borderRadius: 14, background: "#f0fdf4", border: "1px solid #bbf7d0", padding: 14 }}>
          {m.startTime ? (
            <>
              <div style={{ fontSize: 26, fontWeight: 900, color: "#065f46", lineHeight: 1 }}>{m.startTime}</div>
              <div style={{ fontSize: 12, color: "#4ade80", fontWeight: 600, marginTop: 2 }}>
                đến {m.endTime || "—"}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "#94a3b8" }}>Chưa có giờ</div>
          )}
          <Divider />
          <div style={{ fontSize: 11, color: "#166534", fontWeight: 600, lineHeight: 1.5 }}>
            📅 {fmtDate(m.meetingDate)}<br />
            <span style={{ fontWeight: 400, color: "#4ade80" }}>📍 {m.location || "—"}</span>
          </div>
        </div>

        {/* stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { val: m.participants?.length ?? 0, label: "Tham dự",     icon: "👥" },
            { val: agenda.length,               label: "Nội dung họp", icon: "📋" },
            { val: actions.length,              label: "Việc cần làm", icon: "✅" },
            { val: doneCount,                   label: "Đã hoàn thành",icon: "🎯" },
          ].map(s => (
            <div key={s.label} style={{ background: "#f8fafc", borderRadius: 10, border: "1px solid #f1f5f9",
              padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 16 }}>{s.icon}</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: "#1e293b" }}>{s.val}</div>
              <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600, lineHeight: 1.3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* chairperson */}
        {m.chairperson && (
          <div style={{ paddingTop: 4, borderTop: "1px solid #f1f5f9" }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase",
              letterSpacing: 1.2, marginBottom: 8 }}>Chủ trì</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#d1fae5",
                border: "2px solid #6ee7b7", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 13, fontWeight: 900, color: "#065f46" }}>
                {m.chairperson.split(" ").pop()![0]}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>{m.chairperson}</div>
                <div style={{ fontSize: 10, color: "#94a3b8" }}>{m.type === "monthly" ? "Họp định kỳ" : "Họp chuyên đề"}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* right */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", borderBottom: "1px solid #f1f5f9", padding: "0 16px" }}>
          {(["agenda", "actions"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "10px 14px", fontSize: 12, fontWeight: 700, background: "none", border: "none",
              borderBottom: `2px solid ${tab === t ? km.accent : "transparent"}`,
              color: tab === t ? km.accent : "#94a3b8", cursor: "pointer", marginBottom: -1,
            }}>
              {t === "agenda" ? `📋 Nội dung (${agenda.length})` : `✅ Việc cần làm (${actions.length})`}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {tab === "agenda" && (
            agenda.length === 0
              ? <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: 13 }}>Chưa có nội dung họp</div>
              : agenda.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "10px 12px", borderRadius: 10,
                  marginBottom: 4, border: "1px solid transparent", cursor: "default" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#d1fae5",
                    color: "#065f46", fontSize: 11, fontWeight: 900,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#374151", lineHeight: 1.4 }}>{a.topic}</div>
                    <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: "#94a3b8" }}>
                      {a.duration && <span>⏱ {a.duration}</span>}
                      {a.presenter && <span>👤 {a.presenter}</span>}
                    </div>
                  </div>
                </div>
              ))
          )}

          {tab === "actions" && (
            actions.length === 0
              ? <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: 13 }}>Chưa có việc cần làm</div>
              : actions.map((a, i) => {
                const done = a.status === "done" || a.status === "completed";
                return (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 12,
                    marginBottom: 6, border: `1px solid ${done ? "#bbf7d0" : "#f1f5f9"}`,
                    background: done ? "#f0fdf4" : "#fafafa" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                      border: `2px solid ${done ? "#22c55e" : "#cbd5e1"}`,
                      background: done ? "#22c55e" : "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                      {done && <span style={{ fontSize: 11, color: "#fff" }}>✓</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: done ? "#94a3b8" : "#374151",
                        textDecoration: done ? "line-through" : "none", lineHeight: 1.4 }}>
                        {a.content}
                      </div>
                      <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: "#94a3b8" }}>
                        {a.assignee && <span>👤 {a.assignee}</span>}
                        {a.dueDate && <span style={{ color: done ? "#94a3b8" : "#f59e0b", fontWeight: 600 }}>📅 {fmtDate(a.dueDate)}</span>}
                      </div>
                    </div>
                  </div>
                );
              })
          )}
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid #f1f5f9", background: "#fafafa",
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 11, color: "#64748b" }}>
            {doneCount}/{actions.length} việc hoàn thành
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => navigate(km.route)} style={{
              padding: "7px 14px", fontSize: 12, fontWeight: 700, color: "#374151",
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, cursor: "pointer" }}>
              Xem đầy đủ →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PLAN BODY ────────────────────────────────────────────────────────────────
function ProgressRing({ done, total, accent }: { done: number; total: number; accent: string }) {
  const pct = total > 0 ? done / total : 0;
  const R = 42, C = 2 * Math.PI * R;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={104} height={104} viewBox="0 0 104 104">
        <circle cx={52} cy={52} r={R} fill="none" stroke="#f1f5f9" strokeWidth={10} />
        <circle cx={52} cy={52} r={R} fill="none" stroke={accent} strokeWidth={10}
          strokeDasharray={`${pct * C} ${C}`} strokeLinecap="round"
          transform="rotate(-90 52 52)" />
        <text x={52} y={47} textAnchor="middle" fontSize={22} fontWeight={800} fill={accent}>{done}</text>
        <text x={52} y={61} textAnchor="middle" fontSize={11} fill="#94a3b8">/ {total} BP</text>
      </svg>
      <div style={{ fontSize: 10, color: "#94a3b8" }}>Hoàn thành</div>
    </div>
  );
}

function PlanBody({ plan, km, navigate }: { plan: PlanDetail; km: typeof KIND_COLOR[EventKind]; navigate: ReturnType<typeof useNavigate> }) {
  const depts = plan.departments ?? [];
  const pct = plan.scorePercent ?? null;

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* left */}
      <div style={{ width: 232, flexShrink: 0, padding: 18, borderRight: "1px solid #f1f5f9", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 14 }}>
        <ProgressRing done={depts.length} total={depts.length || 1} accent={km.accent} />

        {pct !== null && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}>
              <span style={{ color: "#64748b", fontWeight: 600 }}>Điểm trung bình</span>
              <span style={{ fontWeight: 800, color: km.accent }}>{pct}%</span>
            </div>
            <div style={{ height: 8, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 99, background: km.accent, width: `${pct}%` }} />
            </div>
          </div>
        )}

        <Divider />
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <MetaRow icon="📅" label="Kỳ"     value={plan.period || "—"} />
          <MetaRow icon="🗓" label="Bắt đầu" value={fmtDate(plan.scheduledDate)} />
          <MetaRow icon="📊" label="Loại"    value={plan.type || "—"} />
          {plan.leadInspectorName && <MetaRow icon="👤" label="Phụ trách" value={plan.leadInspectorName} />}
          <MetaRow icon="🏭" label="Tổng BP" value={`${depts.length} bộ phận`} />
        </div>

        {plan.description && (
          <>
            <Divider />
            <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>{plan.description}</div>
          </>
        )}
      </div>

      {/* right */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9",
          fontSize: 12, fontWeight: 700, color: "#64748b" }}>
          🏭 Danh sách bộ phận ({depts.length})
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {depts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: 13 }}>
              Chưa có bộ phận nào trong kế hoạch
            </div>
          ) : (
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                  <th style={{ textAlign: "left", padding: "9px 16px", fontSize: 10, fontWeight: 700,
                    color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>#</th>
                  <th style={{ textAlign: "left", padding: "9px 8px", fontSize: 10, fontWeight: 700,
                    color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>Bộ phận</th>
                </tr>
              </thead>
              <tbody>
                {depts.map((d, i) => (
                  <tr key={d} style={{ borderBottom: "1px solid #f8fafc" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#fafafa")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ padding: "9px 16px", color: "#94a3b8" }}>{i + 1}</td>
                    <td style={{ padding: "9px 8px", fontWeight: 700, color: "#1e293b" }}>{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid #f1f5f9", background: "#fafafa",
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 11, color: "#64748b" }}>
            {depts.length} bộ phận · {plan.approvedByName ? `Duyệt: ${plan.approvedByName}` : "Chưa duyệt"}
          </div>
          <button onClick={() => navigate(km.route)} style={{
            padding: "7px 14px", fontSize: 12, fontWeight: 700, color: "#374151",
            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, cursor: "pointer" }}>
            Xem đầy đủ →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LOADING SKELETON ─────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 12, color: "#94a3b8", fontSize: 13 }}>
      <div style={{ width: 32, height: 32, border: "3px solid #e2e8f0",
        borderTopColor: "#3b82f6", borderRadius: "50%",
        animation: "spin 0.8s linear infinite" }} />
      <span>Đang tải...</span>
    </div>
  );
}

// ─── MAIN MODAL ───────────────────────────────────────────────────────────────
interface Props {
  event: CalEvent | null;
  onClose: () => void;
}

export function CalendarEventModal({ event, onClose }: Props) {
  const navigate = useNavigate();
  const [auditData,   setAuditData]   = useState<AuditDetail   | null>(null);
  const [meetingData, setMeetingData] = useState<MeetingDetail  | null>(null);
  const [planData,    setPlanData]    = useState<PlanDetail     | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // body scroll lock
  useEffect(() => {
    if (!event) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [!!event]);

  // fetch data on open
  useEffect(() => {
    if (!event) {
      setAuditData(null); setMeetingData(null); setPlanData(null);
      setError(null); setLoading(false);
      return;
    }
    const [, rawId] = event.id.split(":");
    if (!rawId) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true); setError(null);
    setAuditData(null); setMeetingData(null); setPlanData(null);

    const endpoints: Record<EventKind, string> = {
      audit:      `/api/audits/${rawId}`,
      meeting:    `/api/safety-meetings/${rawId}`,
      inspection: `/api/inspection-plans/${rawId}`,
    };

    apiFetch<unknown>(endpoints[event.kind], { signal: ctrl.signal })
      .then(data => {
        if (ctrl.signal.aborted) return;
        if (event.kind === "audit")      setAuditData(data as AuditDetail);
        if (event.kind === "meeting")    setMeetingData(data as MeetingDetail);
        if (event.kind === "inspection") setPlanData(data as PlanDetail);
      })
      .catch(err => {
        if (ctrl.signal.aborted) return;
        setError(err?.message ?? "Không thể tải dữ liệu");
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });

    return () => ctrl.abort();
  }, [event?.id]);

  // close on Escape
  useEffect(() => {
    if (!event) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [!!event, onClose]);

  if (!event) return null;

  const km = KIND_COLOR[event.kind];
  const st = statusStyle(event.status);

  return createPortal(
    <>
      {/* spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* overlay */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
          backdropFilter: "blur(3px)", zIndex: 900, animation: "fadeIn .15s ease" }}
      />

      {/* modal */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 901,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        pointerEvents: "none",
      }}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            pointerEvents: "auto",
            background: "#fff", borderRadius: 20,
            boxShadow: "0 25px 80px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.06)",
            width: "100%", maxWidth: 860,
            maxHeight: "90vh",
            display: "flex", flexDirection: "column", overflow: "hidden",
            animation: "modalIn .18s cubic-bezier(.34,1.3,.64,1)",
          }}>

          {/* accent strip */}
          <div style={{ height: 3, background: `linear-gradient(90deg, ${km.accent}, ${km.accent}cc)`, flexShrink: 0 }} />

          {/* header */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 20px 12px",
            borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: km.accent,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 17, flexShrink: 0, marginTop: 1 }}>
              {km.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: km.accent, textTransform: "uppercase", letterSpacing: 1.5 }}>
                  {km.label}
                </span>
                <span style={{ color: "#e2e8f0" }}>·</span>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, fontWeight: 700,
                  background: st.bg, color: st.fg, border: `1px solid ${st.border}` }}>
                  {st.label}
                </span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>📅 {event.date}</span>
                {event.subtitle && (
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>· {event.subtitle}</span>
                )}
              </div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#0f172a", lineHeight: 1.3 }}>
                {event.title}
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Đóng"
              style={{ width: 32, height: 32, borderRadius: 8, background: "none", border: "none",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                color: "#94a3b8", flexShrink: 0, marginTop: 2,
                transition: "background .12s, color .12s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#f1f5f9"; (e.currentTarget as HTMLElement).style.color = "#374151"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; (e.currentTarget as HTMLElement).style.color = "#94a3b8"; }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* body */}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {loading && <Skeleton />}
            {error && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                flexDirection: "column", gap: 8, color: "#ef4444", fontSize: 13, padding: 24 }}>
                <span style={{ fontSize: 28 }}>⚠</span>
                <span style={{ fontWeight: 600 }}>Không thể tải dữ liệu</span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{error}</span>
              </div>
            )}
            {!loading && !error && event.kind === "audit"      && auditData   && (
              <AuditBody   audit={auditData}   km={km} navigate={navigate} />
            )}
            {!loading && !error && event.kind === "meeting"    && meetingData && (
              <MeetingBody m={meetingData}     km={km} navigate={navigate} />
            )}
            {!loading && !error && event.kind === "inspection" && planData    && (
              <PlanBody    plan={planData}     km={km} navigate={navigate} />
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes modalIn { from { opacity: 0; transform: scale(.96) translateY(8px) } to { opacity: 1; transform: none } }
      `}</style>
    </>,
    document.body
  );
}
