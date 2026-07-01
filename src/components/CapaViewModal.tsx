import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  Flag,
  Send,
  ShieldCheck,
  Timer,
  UserRound,
  Workflow
} from "lucide-react";
import { ModalShell, StatusBadge } from "../pages/safety/safety-shared";

export type CapaEvidenceFile = {
  fileName?: string;
  originalName?: string;
  url?: string;
  mimeType?: string;
  uploadedAt?: string;
};

export type CapaAction = {
  id: string;
  code: string;
  title: string;
  description?: string;
  topic?: string;
  sourceType?: string;
  sourceCode?: string;
  problemType?: string;
  departmentCode: string;
  locationId?: string;
  priority: "low" | "medium" | "high" | "critical" | string;
  status: string;
  ownerName?: string;
  dueDate?: string;
  evidenceNotes?: string;
  evidenceFiles?: CapaEvidenceFile[];
  verificationNote?: string;
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  actionPlan?: Array<{
    action?: string;
    owner?: string;
    dueDate?: string;
    progress?: number;
    status?: string;
  }>;
  rootCause?: string;
  containmentAction?: string;
  correctiveAction?: string;
  preventiveAction?: string;
};

type CapaViewModalProps = {
  action: CapaAction | null;
  onClose: () => void;
  onMoveInProgress: (action: CapaAction) => void;
  onRequestEvidence: (action: CapaAction) => void;
  onRequestVerify: (action: CapaAction) => void;
  open: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  assigned: "Đã giao",
  blocked: "Đang vướng",
  closed: "Hoàn thành",
  done_by_owner: "Chờ nghiệm thu",
  draft: "Nháp",
  in_progress: "Đang xử lý",
  open: "Đang mở",
  pending_ehs: "Chờ EHS duyệt",
  reopened: "Mở lại",
  verified: "Đã xác minh"
};

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Khẩn",
  high: "Cao",
  low: "Thấp",
  medium: "Trung bình"
};

const SOURCE_LABEL: Record<string, string> = {
  audit: "Audit",
  incident: "Sự cố",
  iplan: "Kế hoạch KT",
  kyt: "KYT",
  manual: "Thủ công",
  pccc: "PCCC",
  warning: "Cảnh báo nóng"
};

const PROBLEM_TYPE_LABEL: Record<string, string> = {
  "6S": "6S / vệ sinh công nghiệp",
  BEHAV: "Hành vi không an toàn",
  CHEM: "Hóa chất nguy hiểm",
  ELEC: "An toàn điện",
  ENV: "Môi trường làm việc",
  ERGO: "Ergonomic / tư thế",
  FIRE: "PCCC & cháy nổ",
  HEIGHT: "Làm việc trên cao",
  MACH: "Máy móc & thiết bị",
  NEAR: "Tình huống cận nguy",
  PPE: "Bảo hộ lao động",
  VEHICLE: "Xe nâng / phương tiện"
};

const SOURCE_TONE: Record<string, string> = {
  audit: "bg-indigo-50 text-indigo-700 border-indigo-200",
  incident: "bg-red-50 text-red-700 border-red-200",
  iplan: "bg-blue-50 text-blue-700 border-blue-200",
  manual: "bg-slate-50 text-slate-700 border-slate-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200"
};

function sourceLabel(source?: string) {
  return SOURCE_LABEL[source || "manual"] || source || "Thủ công";
}

function normalStatus(status: string) {
  if (status === "verified") return "closed";
  if (status === "assigned" || status === "reopened" || status === "blocked") return "open";
  return status || "open";
}

function dueMeta(action: CapaAction) {
  if (!action.dueDate) return { label: "-", sub: "Chưa đặt hạn", tone: "text-slate-500", overdue: false };
  const closed = action.status === "closed" || action.status === "verified";
  const todayMs = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`).getTime();
  const dueMs = new Date(`${action.dueDate}T00:00:00`).getTime();
  const diff = Math.round((dueMs - todayMs) / 86400000);
  if (closed) return { label: action.dueDate, sub: "Đã xong", tone: "text-emerald-700", overdue: false };
  if (diff < 0) return { label: action.dueDate, sub: `Quá ${Math.abs(diff)} ngày`, tone: "text-red-700", overdue: true };
  if (diff === 0) return { label: action.dueDate, sub: "Hôm nay", tone: "text-amber-700", overdue: false };
  if (diff <= 3) return { label: action.dueDate, sub: `Còn ${diff} ngày`, tone: "text-orange-700", overdue: false };
  return { label: action.dueDate, sub: `Còn ${diff} ngày`, tone: "text-slate-600", overdue: false };
}

function priorityTone(priority: string) {
  if (priority === "critical") return "border-red-200 bg-red-50 text-red-800";
  if (priority === "high") return "border-orange-200 bg-orange-50 text-orange-700";
  if (priority === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function workflowIndex(status: string) {
  const normalized = normalStatus(status);
  if (normalized === "draft" || normalized === "pending_ehs") return 0;
  if (normalized === "open") return 1;
  if (normalized === "in_progress") return 2;
  if (normalized === "done_by_owner") return 3;
  if (normalized === "closed") return 4;
  return 1;
}

function formatDate(value?: string) {
  if (!value) return "-";
  return value.length > 10 ? value.slice(0, 16).replace("T", " ") : value;
}

function progressFromAction(action: CapaAction) {
  const status = normalStatus(action.status);
  if (status === "closed") return 100;
  if (status === "done_by_owner") return 80;
  if (status === "in_progress") return 55;
  if (status === "open") return 25;
  if (status === "pending_ehs") return 12;
  return 5;
}

function FileRow({ file }: { file: CapaEvidenceFile }) {
  const name = file.originalName || file.fileName || file.url || "File bằng chứng";
  return (
    <a
      className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      href={file.url || "#"}
      rel="noreferrer"
      target="_blank"
    >
      <FileText className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {file.uploadedAt ? <span className="shrink-0 text-xs text-slate-400">{formatDate(file.uploadedAt)}</span> : null}
    </a>
  );
}

export function CapaViewModal({
  action,
  onClose,
  onMoveInProgress,
  onRequestEvidence,
  onRequestVerify,
  open
}: CapaViewModalProps) {
  if (!action) {
    return (
      <ModalShell onClose={onClose} open={open} title="Chi tiết CAPA">
        <div className="p-5 text-sm font-semibold text-slate-500">Không có CAPA được chọn.</div>
      </ModalShell>
    );
  }

  const stepIndex = workflowIndex(action.status);
  const due = dueMeta(action);
  const progress = progressFromAction(action);
  const evidenceFiles = Array.isArray(action.evidenceFiles) ? action.evidenceFiles : [];
  const sourceTone = SOURCE_TONE[action.sourceType || "manual"] || "bg-slate-50 text-slate-700 border-slate-200";
  const canWork = !["closed", "verified", "done_by_owner"].includes(action.status);
  const canSubmitEvidence = !["closed", "verified"].includes(action.status);
  const canVerify = action.status === "done_by_owner";
  const workflow = [
    { icon: ClipboardList, label: "Tạo CAPA", sub: action.createdByName || "Hệ thống", time: formatDate(action.createdAt) },
    { icon: UserRound, label: "Giao xử lý", sub: action.ownerName || "Chưa giao", time: action.departmentCode || "-" },
    { icon: Timer, label: "Đang xử lý", sub: "Thực hiện CAPA", time: due.label },
    { icon: Send, label: "Nộp bằng chứng", sub: action.evidenceNotes ? "Đã có ghi chú" : "Chưa nộp", time: "" },
    { icon: ShieldCheck, label: "EHS xác minh", sub: action.verifiedByName || "EHS", time: formatDate(action.verifiedAt) }
  ];

  return (
    <ModalShell
      description="Xem vấn đề, tiến độ xử lý, bằng chứng và thao tác nghiệm thu CAPA."
      onClose={onClose}
      open={open}
      title={`${action.code} - ${action.title}`}
    >
      <div className="grid gap-4 bg-slate-50 p-5">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${sourceTone}`}>
                  {sourceLabel(action.sourceType)}
                </span>
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${priorityTone(action.priority)}`}>
                  {PRIORITY_LABEL[action.priority] || action.priority}
                </span>
                <StatusBadge value={STATUS_LABEL[action.status] || action.status} />
              </div>
              <h3 className="mt-3 text-xl font-black leading-snug text-slate-950">{action.title}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {action.departmentCode || "-"} {action.sourceCode ? `• ${action.sourceCode}` : ""} {action.problemType ? `• ${PROBLEM_TYPE_LABEL[action.problemType] || action.problemType}` : ""}
              </p>
            </div>
            <div className="min-w-[220px] rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-xs font-black uppercase text-slate-500">
                <span>Tiến độ</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-600 via-amber-500 to-emerald-500" style={{ width: `${progress}%` }} />
              </div>
              <div className={`mt-2 flex items-center gap-2 text-sm font-black ${due.tone}`}>
                {due.overdue ? <AlertTriangle className="size-4" /> : <CalendarClock className="size-4" />}
                {due.label} - {due.sub}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-5">
            {workflow.map((step, index) => {
              const done = index < stepIndex;
              const active = index === stepIndex;
              return (
                <div
                  className={`relative rounded-xl border p-3 ${
                    done
                      ? "border-emerald-200 bg-emerald-50"
                      : active
                        ? "border-blue-300 bg-blue-50 shadow-sm"
                        : "border-slate-200 bg-slate-50"
                  }`}
                  key={step.label}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex size-8 items-center justify-center rounded-full ${
                        done ? "bg-emerald-600 text-white" : active ? "bg-blue-700 text-white" : "bg-white text-slate-400"
                      }`}
                    >
                      {done ? <CheckCircle2 className="size-4" /> : <step.icon className="size-4" />}
                    </span>
                    <span className="min-w-0 text-sm font-black text-slate-900">{step.label}</span>
                  </div>
                  <p className="mt-2 truncate text-xs font-semibold text-slate-500">{step.sub}</p>
                  {step.time ? <p className="mt-1 truncate font-mono text-[11px] font-bold text-slate-400">{step.time}</p> : null}
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="grid gap-4">
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-slate-500">
                <Workflow className="size-4" />
                Vấn đề và phân tích
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-800">
                  {action.description || "Chưa có mô tả chi tiết."}
                </p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <InfoBlock label="Nguyên nhân gốc" value={action.rootCause || "Chưa cập nhật"} />
                <InfoBlock label="Hành động tạm thời" value={action.containmentAction || "Chưa cập nhật"} />
                <InfoBlock label="Phòng ngừa tái diễn" value={action.preventiveAction || "Chưa cập nhật"} />
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-slate-500">
                <Flag className="size-4" />
                Kế hoạch hành động
              </div>
              {action.actionPlan?.length ? (
                <div className="grid gap-2">
                  {action.actionPlan.map((item, index) => (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" key={`${item.action || "plan"}-${index}`}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <strong className="text-sm text-slate-900">{item.action || `Hành động ${index + 1}`}</strong>
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">
                          {Number.isFinite(Number(item.progress)) ? `${item.progress}%` : item.status || "Đang theo dõi"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        {item.owner || action.ownerName || "Chưa giao"} {item.dueDate ? `• hạn ${item.dueDate}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm font-semibold text-slate-500">
                  Chưa có kế hoạch chi tiết, đang dùng mô tả CAPA làm nội dung xử lý chính.
                </div>
              )}
            </article>
          </section>

          <aside className="grid content-start gap-4">
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black uppercase text-slate-500">Thông tin xử lý</h3>
              <dl className="mt-3 grid gap-3">
                <InfoLine label="Người phụ trách" value={action.ownerName || "Chưa giao"} />
                <InfoLine label="Bộ phận" value={action.departmentCode || "-"} />
                <InfoLine label="Hạn xử lý" value={`${due.label} - ${due.sub}`} valueClass={due.tone} />
                <InfoLine label="Tạo bởi" value={action.createdByName || "-"} />
                <InfoLine label="Ngày tạo" value={formatDate(action.createdAt)} />
                <InfoLine label="Cập nhật" value={formatDate(action.updatedAt)} />
              </dl>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black uppercase text-slate-500">Bằng chứng</h3>
              {action.evidenceNotes ? (
                <p className="mt-3 whitespace-pre-wrap rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold leading-6 text-emerald-800">
                  {action.evidenceNotes}
                </p>
              ) : (
                <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-500">
                  Chưa có ghi chú bằng chứng.
                </p>
              )}
              {evidenceFiles.length ? (
                <div className="mt-3 grid gap-2">
                  {evidenceFiles.map((file, index) => (
                    <FileRow file={file} key={`${file.url || file.fileName || "file"}-${index}`} />
                  ))}
                </div>
              ) : null}
            </article>
          </aside>
        </div>

        <footer className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-semibold text-slate-500">
            Modal này dùng API CAPA hiện tại. Nhật ký/comment/file upload nâng cao sẽ bật sau khi backend tương ứng được tích hợp.
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {canWork ? (
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-700"
                onClick={() => onMoveInProgress(action)}
                type="button"
              >
                <Timer className="size-4" />
                Chuyển đang xử lý
              </button>
            ) : null}
            {canSubmitEvidence ? (
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-700"
                onClick={() => onRequestEvidence(action)}
                type="button"
              >
                <Send className="size-4" />
                Nộp bằng chứng
              </button>
            ) : null}
            {canVerify ? (
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white"
                onClick={() => onRequestVerify(action)}
                type="button"
              >
                <ShieldCheck className="size-4" />
                EHS verify
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </ModalShell>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-black uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-5 text-slate-800">{value}</p>
    </div>
  );
}

function InfoLine({ label, value, valueClass = "text-slate-900" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <dt className="text-xs font-black uppercase text-slate-500">{label}</dt>
      <dd className={`mt-1 text-sm font-bold ${valueClass}`}>{value}</dd>
    </div>
  );
}

export default CapaViewModal;
