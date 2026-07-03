import { AlertTriangle, CheckCircle2, FileText, ShieldAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "./NotificationToast.css";

export type ToastItem = {
  id: string;
  type: "warning" | "incident" | "read-all" | string;
  action: "created" | "approved" | "rejected" | "read" | string;
  code?: string;
};

type ToastCardProps = {
  item: ToastItem;
  onDismiss: (id: string) => void;
};

const TONE_MAP: Record<string, "alert" | "good" | "watch"> = {
  "warning-created": "watch",
  "warning-approved": "good",
  "warning-rejected": "alert",
  "incident-created": "alert",
  "incident-approved": "good",
  "incident-rejected": "alert",
  "document-uploaded": "good",
};

const LABEL_VI: Record<string, string> = {
  "warning-created": "Cảnh báo mới",
  "warning-approved": "Cảnh báo được duyệt",
  "warning-rejected": "Cảnh báo bị từ chối",
  "incident-created": "Sự cố mới",
  "incident-approved": "Sự cố được duyệt",
  "incident-rejected": "Sự cố bị từ chối",
  "document-uploaded": "Tài liệu mới được tải lên",
};

const SUBLABEL_VI: Record<string, string> = {
  "warning-created": "Vừa được ghi nhận vào hệ thống",
  "warning-approved": "Đã được phê duyệt bởi EHS/Leader",
  "warning-rejected": "Đã bị từ chối, cần xem lại",
  "incident-created": "Báo cáo sự cố vừa được tạo",
  "incident-approved": "Điều tra sự cố đã được duyệt",
  "incident-rejected": "Điều tra sự cố bị từ chối",
  "document-uploaded": "Vừa được thêm vào thư viện tài liệu",
};

const ICON_MAP: Record<string, typeof FileText> = {
  "document-uploaded": FileText,
};

const DURATION_MS = 6000;
const PROGRESS_INTERVAL_MS = 50;

function ToastCard({ item, onDismiss }: ToastCardProps) {
  const key = `${item.type}-${item.action}`;
  const tone = TONE_MAP[key] || "watch";
  const label = LABEL_VI[key] || "Thông báo mới";
  const sublabel = SUBLABEL_VI[key] || "";
  const [progress, setProgress] = useState(100);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(Date.now());

  const Icon =
    ICON_MAP[key] ||
    (tone === "alert"
      ? ShieldAlert
      : tone === "good"
        ? CheckCircle2
        : AlertTriangle);

  useEffect(() => {
    startedRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startedRef.current;
      const remaining = Math.max(0, 100 - (elapsed / DURATION_MS) * 100);
      setProgress(remaining);
      if (remaining === 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        onDismiss(item.id);
      }
    }, PROGRESS_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [item.id, onDismiss]);

  return (
    <div className={`nt-card nt-${tone}`} role="status" aria-live="polite">
      <span className={`nt-icon-wrap nt-icon-${tone}`}>
        <Icon size={18} />
      </span>
      <div className="nt-body">
        <strong className="nt-label">{label}</strong>
        {item.code ? <code className="nt-code">{item.code}</code> : null}
        {sublabel ? <span className="nt-sub">{sublabel}</span> : null}
      </div>
      <button
        aria-label="Đóng thông báo"
        className="nt-close"
        onClick={() => onDismiss(item.id)}
        type="button"
      >
        <X size={14} />
      </button>
      <div className="nt-progress-track">
        <div className={`nt-progress-bar nt-bar-${tone}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

type NotificationToastProps = {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
};

export function NotificationToast({ toasts, onDismiss }: NotificationToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="nt-container" aria-label="Thông báo hệ thống">
      {toasts.map((item) => (
        <ToastCard item={item} key={item.id} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
