import { ChevronLeft, ChevronRight, Loader2, ShieldAlert, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { loginStateForLocation, loginToForLocation } from "../../auth/loginRedirect";
import type { PaginationMeta } from "./safety-api";

export function LoadingPanel({ label = "Đang tải dữ liệu" }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-sm text-slate-500">
      <Loader2 className="mr-2 size-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorPanel({ error }: { error: unknown }) {
  const location = useLocation();
  const status = (error as { status?: number })?.status;
  const loginTo = loginToForLocation(location);
  const loginState = loginStateForLocation(location);

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      {status === 401 ? (
        <>
          <strong>Cần đăng nhập.</strong> Safety operations dùng tài khoản MHChub hiện tại.
          <Link className="ml-2 font-semibold underline" state={loginState} to={loginTo}>
            Đăng nhập
          </Link>
        </>
      ) : (
        <span>{(error as Error)?.message || "Không tải được dữ liệu Safety."}</span>
      )}
    </div>
  );
}

export function CrudLayout({
  action,
  children,
  description,
  form,
  title
}: {
  action?: ReactNode;
  children?: ReactNode;
  description: string;
  form?: ReactNode;
  title: string;
}) {
  return (
    <section className={`grid gap-4 ${form ? "lg:grid-cols-[minmax(0,1fr)_360px]" : ""}`}>
      <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {children}
      </div>
      {form ? <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">{form}</aside> : null}
    </section>
  );
}

export function SafetyTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            {columns.map((column) => (
              <th className="border-b border-slate-200 px-3 py-2 font-bold" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr className="border-b border-slate-100 last:border-0" key={index}>
                {row.map((cell, cellIndex) => (
                  <td className="px-3 py-3 align-top text-slate-700" key={cellIndex}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-3 py-6 text-center text-slate-500" colSpan={columns.length}>
                Chưa có dữ liệu
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}


export function ModalShell({
  children,
  description,
  onClose,
  open,
  title,
  variant = "default"
}: {
  children: ReactNode;
  description?: string;
  onClose: () => void;
  open: boolean;
  title: string;
  variant?: "default" | "warning";
}) {
  if (!open) return null;
  const isWarning = variant === "warning";
  return createPortal(
    <div className="safety-modal-backdrop fixed inset-0 z-[1400] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-3 py-4 sm:items-center sm:py-6" role="presentation">
      <div
        aria-label={title}
        aria-modal="true"
        className={`safety-modal-shell ${isWarning ? "safety-warning-modal-shell" : ""} flex w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl`}
        role="dialog"
      >
        <header className={`safety-modal-header ${isWarning ? "safety-warning-modal-header" : ""} flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4`}>
          <div className={isWarning ? "safety-modal-title-row min-w-0" : "min-w-0"}>
            {isWarning ? (
              <span className="safety-warning-modal-icon" aria-hidden="true">
                <ShieldAlert className="size-5" />
              </span>
            ) : null}
            <div className="min-w-0">
            <h2 className="text-lg font-black leading-tight text-slate-950">{title}</h2>
            {description ? <p className="mt-1 text-sm font-medium text-slate-500">{description}</p> : null}
            </div>
          </div>
          <button
            aria-label="Đóng"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-950"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="safety-modal-body min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  , document.body);
}

export function FormSection({ children, index, title }: { children: ReactNode; index: number; title: string }) {
  return (
    <section className={`safety-form-section safety-form-section-${index} space-y-3`}>
      <div className="safety-form-section-head flex items-center gap-2 border-b border-slate-200 pb-2">
        <span className="safety-form-step inline-flex size-6 items-center justify-center rounded-full bg-blue-700 text-xs font-black text-white">{index}</span>
        <h3 className="safety-form-section-title text-xs font-black uppercase tracking-wide text-slate-500">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function FormField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function StatusBadge({ value }: { value?: string }) {
  const label = value || "Chưa cập nhật";
  const cls = label.includes("REJECTED")
    ? "bg-red-50 text-red-700"
    : label.includes("duyệt") || label.includes("DONE") || label.includes("Đã")
      ? "bg-emerald-50 text-emerald-700"
      : label.includes("Quá") || label.includes("Nghiêm")
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-700";
  return <span className={`rounded-md px-2 py-1 text-xs font-black ${cls}`}>{label}</span>;
}

export function MiniStat({ label, tone = "blue", value }: { label: string; tone?: "blue" | "red" | "amber" | "emerald" | "slate"; value: string | number }) {
  const cls =
    tone === "red"
      ? "border-red-200 text-red-700"
      : tone === "amber"
        ? "border-amber-200 text-amber-700"
        : tone === "emerald"
          ? "border-emerald-200 text-emerald-700"
          : tone === "slate"
            ? "border-slate-200 text-slate-700"
            : "border-blue-200 text-blue-700";
  return (
    <article className={`rounded-lg border bg-white p-4 shadow-sm ${cls}`}>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <strong className="mt-2 block text-3xl leading-none">{value}</strong>
    </article>
  );
}

export function ChoiceButton({
  active,
  children,
  onClick,
  tone = "blue"
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  tone?: "blue" | "red" | "amber" | "emerald";
}) {
  const activeClass =
    tone === "red"
      ? "border-red-600 bg-red-600 text-white"
      : tone === "amber"
        ? "border-amber-400 bg-amber-400 text-slate-950"
        : tone === "emerald"
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-blue-700 bg-blue-700 text-white";
  return (
    <button
      className={`safety-choice-button rounded-lg border px-3 py-2 text-left text-xs font-bold transition ${
        active ? activeClass : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function PaginationControls({
  loading = false,
  onPageChange,
  pagination
}: {
  loading?: boolean;
  onPageChange: (page: number) => void;
  pagination: PaginationMeta;
}) {
  const page = Math.max(1, pagination.page);
  const pageSize = Math.max(1, pagination.pageSize);
  const totalItems = Math.max(0, pagination.totalItems);
  const totalPages = Math.max(1, pagination.totalPages);
  const startItem = totalItems ? (page - 1) * pageSize + 1 : 0;
  const endItem = totalItems ? Math.min(totalItems, page * pageSize) : 0;
  const canPrevious = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <p className="font-semibold">
        Hiển thị <span className="font-black text-slate-950">{startItem}-{endItem}</span> /{" "}
        <span className="font-black text-slate-950">{totalItems}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          aria-label="Trang trước"
          className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canPrevious}
          onClick={() => onPageChange(page - 1)}
          type="button"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-[92px] text-center text-xs font-black uppercase text-slate-500">
          Trang {page}/{totalPages}
        </span>
        <button
          aria-label="Trang sau"
          className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
          type="button"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
