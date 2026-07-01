import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useHubLanguage } from "../../i18n-context";
import { getText } from "../../i18n";
import type { HubModel } from "../../core/hubCore";
import type { SafetyUser } from "./safety-domain";
import { SafetyI18nRender } from "./safety-i18n-render";

export function SafetyFrame({ children, model }: { children: ReactNode; model: HubModel }) {
  const { user } = useAuth() as { user: SafetyUser | null };
  const { lang } = useHubLanguage();
  const location = useLocation();
  const isDashboard = location.pathname.replace(/\/+$/, "") === "/safety-6s";

  if (!isDashboard) {
    return (
      <div className="page safety-command-page safety-polish-page safety-unified-page">
        <div className="safety-content-wrap">{children}</div>
      </div>
    );
  }

  return (
    <SafetyI18nRender>
      <div className="page safety-command-page safety-polish-page">
        <section className="hidden">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-bold leading-tight md:text-3xl">Safety - 6S Command Center</h1>
              <p className="mt-2 max-w-3xl text-sm text-emerald-50">
                Điều hành cảnh báo, sự cố, checklist, KPI, đào tạo và báo cáo an toàn trên nền dữ liệu MHChub.
              </p>
            </div>
            <div className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-sm">
              <strong>{user?.displayName || user?.username || "Guest"}</strong>
              <span className="ml-2 text-emerald-50">{user?.role || "viewer"}</span>
            </div>
          </div>
        </section>
        <div className="safety-content-wrap">{children}</div>
        <section className="safety-department-links mt-4 grid gap-3 md:grid-cols-3">
          {(model?.departments || []).slice(0, 3).map((department) => (
            <Link
              className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm hover:border-emerald-300"
              key={department.id}
              to={`/safety-6s/departments/${department.id}`}
            >
              <strong>{getText(department.name, lang) || department.id}</strong>
              <span className="mt-1 block text-slate-500">{department.openActions || 0} hành động mở</span>
            </Link>
          ))}
        </section>
      </div>
    </SafetyI18nRender>
  );
}
