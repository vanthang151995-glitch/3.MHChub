import { Loader2, XCircle } from "lucide-react";
import { addDaysDate, currentDate } from "./safety-api";
import { ChoiceButton, ModalShell } from "./safety-shared";
import { departmentForUser, displayUserName } from "./safety-domain";
import type { SafetyUser } from "./safety-domain";

export type Warning = {
  id: string;
  code: string;
  title: string;
  category: string;
  subcategory?: string | null;
  department: string;
  area?: string | null;
  riskProbability?: number;
  riskConsequence?: number;
  riskScore: number;
  riskLevel: string;
  status: string;
  approvalStatus: string;
  deadline?: string;
  description?: string;
  currentControl?: string;
  responsiblePerson?: string;
  proposedAction?: string;
  evidenceNotes?: string;
  relatedStandard?: string;
  reporterName?: string;
  rejectionReason?: string | null;
  submittedByDept?: string;
  submittedById?: string;
  submittedByName?: string;
  createdByName?: string;
  updatedByName?: string;
  createdAt?: string;
};

export type Incident = {
  id: string;
  code: string;
  type: string;
  severity: string;
  status: string;
  department: string;
  area?: string;
  description: string;
  occurredDate?: string;
  occurredTime?: string;
  reporterPhone?: string;
  handlerName?: string;
  witnesses?: string;
  bodyPartsAffected?: string[];
  firstAidGiven?: boolean;
  rootCauseCategory?: string;
  rootCauseDetail?: string;
  immediateAction?: string;
  correctiveAction?: string;
  preventiveAction?: string;
  estimatedCost?: number | null;
  createdAt?: string;
  approvalStatus: string;
  rejectionReason?: string | null;
  submittedByDept?: string;
  submittedById?: string;
  reporterName?: string;
  submittedByName?: string;
  createdByName?: string;
  updatedByName?: string;
};

export const WARNING_CATEGORIES = [
  {
    value: "EQUIPMENT",
    subs: [
      "Thiếu che chắn an toàn",
      "Máy hỏng đang sử dụng",
      "Áp suất vượt ngưỡng",
      "Thiếu bảo trì định kỳ",
      "Dây điện hở",
      "Thiết bị cũ quá hạn thay"
    ],
    standards: ["QCVN 26:2016/BLĐTBXH", "TCVN 5179:2013", "IEC 60204-1"]
  },
  {
    value: "ENVIRONMENT",
    subs: [
      "Chiếu sáng không đủ",
      "Tiếng ồn vượt ngưỡng",
      "Nhiệt độ cao",
      "Bụi vượt ngưỡng",
      "Sàn trơn trượt",
      "Lối đi bị chặn",
      "Thông gió kém"
    ],
    standards: ["QCVN 26:2016/BLĐTBXH", "QCVN 24:2016", "TCVN 3733:2002"]
  },
  {
    value: "HUMAN_BEHAVIOR",
    subs: [
      "Không đeo PPE",
      "Vi phạm quy trình",
      "Làm việc không được phép",
      "Chưa được đào tạo",
      "Sử dụng điện thoại khi làm việc",
      "Không khóa thiết bị trước bảo trì"
    ],
    standards: ["Luật ATVSLĐ 2015", "QCVN 04:2015/BLĐTBXH"]
  },
  {
    value: "FIRE_SAFETY",
    subs: [
      "Bình PCCC hết hạn",
      "Lối thoát hiểm bị chặn",
      "Biển thoát hiểm hỏng",
      "Thiếu bản đồ thoát hiểm",
      "Hệ thống báo cháy lỗi",
      "Thiếu diễn tập PCCC"
    ],
    standards: ["QCVN 06:2021/BXD", "TCVN 3890:2009", "Luật PCCC 2001"]
  },
  {
    value: "CHEMICALS",
    subs: [
      "Không có nhãn hóa chất",
      "Thiếu SDS/MSDS",
      "Bảo quản sai quy định",
      "Không có PPE hóa chất",
      "Rò rỉ nhỏ chưa xử lý",
      "Hóa chất hết hạn"
    ],
    standards: ["QCVN 05:2009/BCT", "Thông tư 32/2017/TT-BCT", "GHS/CLP"]
  },
  {
    value: "ERGONOMICS",
    subs: [
      "Nâng hàng sai tư thế",
      "Ghế làm việc không phù hợp",
      "Màn hình quá cao/thấp",
      "Đứng liên tục > 4 giờ",
      "Rung động máy kéo dài",
      "Thao tác lặp lại liên tục"
    ],
    standards: ["ISO 9241", "TCVN 7303:2003"]
  }
];

export const WARNING_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "OVERDUE"];
export const RISK_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
export const CUSTOM_WARNING_SUBCATEGORY = "__custom__";
export const WARNING_ATTACHMENT_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx";
export const WARNING_ATTACHMENT_MAX_MB = 20;
const WARNING_CATEGORY_ICONS = ["\u2699\ufe0f", "\ud83c\udf3f", "\ud83d\udc64", "\ud83d\udd25", "\ud83e\uddea", "\u26d1\ufe0f"];
const RISK_TONES: Record<string, { border: string; bg: string; text: string }> = {
  "CRITICAL": { border: "border-red-700", bg: "bg-red-50", text: "text-red-700" },
  "HIGH": { border: "border-red-500", bg: "bg-red-50", text: "text-red-600" },
  "MEDIUM": { border: "border-amber-400", bg: "bg-amber-50", text: "text-amber-700" },
  "LOW": { border: "border-emerald-400", bg: "bg-emerald-50", text: "text-emerald-700" }
};

export const PROBABILITY_OPTIONS = [
  { value: 1, label: "Rất hiếm" },
  { value: 2, label: "Hiếm" },
  { value: 3, label: "Thỉnh thoảng" },
  { value: 4, label: "Thường xuyên" },
  { value: 5, label: "Chắc chắn" }
];

export const CONSEQUENCE_OPTIONS = [
  { value: 1, label: "Không đáng kể" },
  { value: 2, label: "Nhỏ" },
  { value: 3, label: "MEDIUM" },
  { value: 4, label: "HIGH" },
  { value: 5, label: "Thảm họa" }
];

export const INCIDENT_TYPES = [
  "Tai nạn lao động",
  "Sự cố thiết bị",
  "Cháy nổ",
  "Hóa chất",
  "Ngã/Va chạm",
  "Điện giật",
  "Chấn thương nhiệt",
  "Khác"
];
export const INCIDENT_SEVERITIES = ["Nhẹ", "MEDIUM", "HIGH", "Nguy hiểm"];
export const INCIDENT_STATUSES = ["IN_PROGRESS", "Đang điều tra", "PENDING", "Đã khắc phục", "Đóng"];
export const ROOT_CAUSE_OPTIONS = [
  { value: "Con người", hint: "Thao tác, đào tạo, mệt mỏi, tuân thủ quy trình" },
  { value: "Thiết bị", hint: "Hỏng hóc, bảo trì, thiết kế, che chắn" },
  { value: "Môi trường", hint: "Ánh sáng, tiếng ồn, nhiệt độ, vệ sinh" },
  { value: "Phương pháp", hint: "Quy trình, hướng dẫn, kiểm soát công việc" },
  { value: "Vật liệu", hint: "Nguyên liệu, hóa chất, bao bì, lưu trữ" }
];
export const BODY_PARTS = [
  "Đầu/Cổ",
  "Mắt",
  "Tai",
  "Mặt",
  "Vai/Cánh tay",
  "Bàn tay/Ngón tay",
  "Ngực/Lưng",
  "Bụng",
  "Hông/Đùi",
  "Đầu gối/Chân",
  "Bàn chân/Ngón chân",
  "Toàn thân"
];

export function canReview(user: SafetyUser | null) {
  return ["admin", "ehs", "leader"].includes(user?.role || "");
}

export const isOverdueDate = (value = "") => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
};

export type WarningFormState = {
  title: string;
  category: string;
  subcategory: string;
  customSubcategory: string;
  department: string;
  area: string;
  riskProbability: number;
  riskConsequence: number;
  description: string;
  currentControl: string;
  proposedAction: string;
  responsiblePerson: string;
  deadline: string;
  reporterName: string;
  evidenceNotes: string;
  relatedStandard: string;
  attachmentNames: string[];
  status: string;
};

export type IncidentFormState = {
  occurredDate: string;
  occurredTime: string;
  department: string;
  area: string;
  type: string;
  severity: string;
  description: string;
  rootCauseCategory: string;
  rootCauseDetail: string;
  injuredCount: number;
  bodyPartsAffected: string[];
  firstAidGiven: boolean;
  estimatedCost: string;
  immediateAction: string;
  correctiveAction: string;
  preventiveAction: string;
  reporterName: string;
  reporterPhone: string;
  handlerName: string;
  witnesses: string;
  status: string;
};

export type ReviewRejectTarget = {
  id: string;
  code?: string;
  title: string;
  moduleLabel: string;
};

export const warningCategoryIconFor = (category: string) => WARNING_CATEGORY_ICONS[Math.max(0, WARNING_CATEGORIES.findIndex((item) => item.value === category))] || "\u26a0\ufe0f";
export const riskLevelForForm = (probability: number, consequence: number) => {
  const score = probability * consequence;
  if (score >= 16) return "CRITICAL";
  if (score >= 9) return "HIGH";
  if (score >= 4) return "MEDIUM";
  return "LOW";
};
export const deadlineDaysForRisk = (level: string) => (level === "CRITICAL" ? 1 : level === "HIGH" ? 7 : level === "MEDIUM" ? 30 : 90);
export const riskToneFor = (level = "") => RISK_TONES[RISK_LEVELS.find((item) => level.includes(item)) || level] || RISK_TONES["LOW"];
const riskVisualToneFor = (level = "") => {
  if (level.includes(RISK_LEVELS[0])) return { text: "#ff1744", bg: "rgba(255, 23, 68, 0.08)" };
  if (level.includes(RISK_LEVELS[1])) return { text: "#e53935", bg: "rgba(229, 57, 53, 0.08)" };
  if (level.includes(RISK_LEVELS[2])) return { text: "#f9a825", bg: "rgba(249, 168, 37, 0.10)" };
  return { text: "#22a050", bg: "rgba(34, 160, 80, 0.10)" };
};
export const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function defaultWarningForm(user: SafetyUser | null): WarningFormState {
  const level = riskLevelForForm(3, 3);
  return {
    title: "",
    category: WARNING_CATEGORIES[0].value,
    subcategory: "",
    customSubcategory: "",
    department: departmentForUser(user),
    area: "",
    riskProbability: 3,
    riskConsequence: 3,
    description: "",
    currentControl: "",
    proposedAction: "",
    responsiblePerson: "",
    deadline: addDaysDate(deadlineDaysForRisk(level)),
    reporterName: displayUserName(user),
    evidenceNotes: "",
    relatedStandard: "",
    attachmentNames: [],
    status: "OPEN"
  };
}

export function defaultIncidentForm(user: SafetyUser | null): IncidentFormState {
  return {
    occurredDate: currentDate(),
    occurredTime: "",
    department: departmentForUser(user),
    area: "",
    type: INCIDENT_TYPES[0],
    severity: "Nhẹ",
    description: "",
    rootCauseCategory: ROOT_CAUSE_OPTIONS[0].value,
    rootCauseDetail: "",
    injuredCount: 0,
    bodyPartsAffected: [],
    firstAidGiven: false,
    estimatedCost: "",
    immediateAction: "",
    correctiveAction: "",
    preventiveAction: "",
    reporterName: displayUserName(user),
    reporterPhone: "",
    handlerName: "",
    witnesses: "",
    status: "IN_PROGRESS"
  };
}

export function RiskBadge({ level, score }: { level?: string; score?: number }) {
  const tone = riskToneFor(level);
  return <span className={`rounded-md px-2 py-1 text-xs font-black ${tone.bg} ${tone.text}`}>{level || "Chưa đánh giá"} {score ? `(x${score})` : ""}</span>;
}

export function RiskMatrixPreview({ consequence, probability }: { consequence: number; probability: number }) {
  const rows = [5, 4, 3, 2, 1];
  const columns = [1, 2, 3, 4, 5];
  const cellBackground = (row: number, column: number) => {
    const score = row * column;
    if (score >= 15) return "rgba(123, 0, 0, 0.38)";
    if (score >= 8) return "rgba(229, 57, 53, 0.25)";
    if (score >= 4) return "rgba(249, 168, 37, 0.25)";
    return "rgba(34, 160, 80, 0.25)";
  };
  const cellColor = (row: number, column: number) => riskVisualToneFor(riskLevelForForm(row, column)).text;
  const legendItems = [
    { color: "#ff1744", label: "C\u1ef1c k\u1ef3" },
    { color: "#e53935", label: "Nghi\u00eam tr\u1ecdng" },
    { color: "#f9a825", label: "Trung b\u00ecnh" },
    { color: "#22a050", label: "Th\u1ea5p" }
  ];
  return (
    <div className="safety-risk-preview">
      <div className="safety-risk-matrix-title">{"Ma Tr\u1eadn R\u1ee7i Ro (X\u00e1c su\u1ea5t \u00d7 H\u1eadu qu\u1ea3)"}</div>
      <div className="safety-risk-matrix-wrap">
        <div className="safety-risk-y-axis">
          <span />
          {rows.map((row) => (
            <span key={row}>{row}</span>
          ))}
        </div>
        <div className="safety-risk-grid-column">
          <div className="safety-risk-x-axis">
            {columns.map((column) => (
              <span key={column}>{column}</span>
            ))}
          </div>
          {rows.map((row) => (
            <div className="safety-risk-grid-row" key={row}>
              {columns.map((column) => {
                const selected = row === probability && column === consequence;
                return (
                  <span
                    className={`safety-risk-cell ${selected ? "is-selected" : ""}`}
                    key={`${row}-${column}`}
                    style={{
                      backgroundColor: cellBackground(row, column),
                      borderColor: selected ? cellColor(row, column) : "transparent"
                    }}
                    title={`${row} x ${column} = ${row * column}`}
                  >
                    {selected ? <span className="safety-risk-selected-dot" style={{ backgroundColor: cellColor(row, column) }} /> : null}
                  </span>
                );
              })}
            </div>
          ))}
          <div className="safety-risk-x-label">{"H\u1eadu qu\u1ea3 \u2192"}</div>
        </div>
        <div className="safety-risk-legend">
          {legendItems.map((item) => (
            <span key={item.label}>
              <i style={{ backgroundColor: `${item.color}55`, borderColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function RiskScoreCard({ consequence, probability }: { consequence: number; probability: number }) {
  const score = probability * consequence;
  const level = riskLevelForForm(probability, consequence);
  const tone = riskVisualToneFor(level);
  return (
    <div className="safety-risk-score-card" style={{ borderColor: tone.text, backgroundColor: tone.bg }}>
      <div className="safety-risk-score-number">
        <strong style={{ color: tone.text }}>{score}</strong>
        <span>{"\u0110i\u1ec3m r\u1ee7i ro"}</span>
      </div>
      <div className="safety-risk-score-copy">
        <strong style={{ color: tone.text }}>{level}</strong>
        <span>
          {"H\u1ea1n g\u1ee3i \u00fd: "}
          <b>{deadlineDaysForRisk(level)} ngày</b>
        </span>
      </div>
    </div>
  );
}

export function ReviewActions({
  canReview: allowReview,
  item,
  onApprove,
  onReject
}: {
  canReview: boolean;
  item: { approvalStatus: string };
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{item.approvalStatus}</span>
      {allowReview && item.approvalStatus === "PENDING" ? (
        <>
          <button className="safety-small-button" onClick={onApprove} type="button">
            Duyệt
          </button>
          <button className="safety-small-button danger" onClick={onReject} type="button">
            Từ chối
          </button>
        </>
      ) : null}
    </div>
  );
}

export function ReviewRejectModal({
  actionLabel,
  busy,
  description,
  onClose,
  onReasonChange,
  onSubmit,
  open,
  reason,
  target,
  title
}: {
  actionLabel: string;
  busy?: boolean;
  description: string;
  onClose: () => void;
  onReasonChange: (value: string) => void;
  onSubmit: () => void;
  open: boolean;
  reason: string;
  target: ReviewRejectTarget | null;
  title: string;
}) {
  return (
    <ModalShell description={description} onClose={onClose} open={open} title={title} variant="warning">
      <form
        className="space-y-5 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0">
              <strong className="block leading-tight">{target?.title || target?.moduleLabel || "Mục duyệt"}</strong>
              <span className="mt-1 block font-mono text-xs font-semibold">
                {target?.code || target?.id || "-"} · {target?.moduleLabel || "Safety 6S"}
              </span>
            </div>
          </div>
        </div>
        <label className="grid gap-1.5">
          <span className="text-xs font-black uppercase tracking-wide text-slate-500">Lý do từ chối *</span>
          <textarea
            className="safety-input min-h-[130px]"
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Nhập lý do cụ thể để người gửi biết cần bổ sung hoặc sửa thông tin nào..."
            required
            value={reason}
          />
        </label>
        <footer className="-mx-5 -mb-5 flex flex-col gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end">
          <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50" disabled={busy} onClick={onClose} type="button">
            Hủy
          </button>
          <button className="safety-primary-button inline-flex w-auto items-center justify-center gap-2 px-5" disabled={busy || !reason.trim()} type="submit">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
            {actionLabel}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}
