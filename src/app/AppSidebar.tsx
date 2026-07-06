import { KeyRound, LogIn, LogOut, UserRound, X } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import type { LoginState, LoginTo } from "../auth/loginRedirect";
import type { AuthUser } from "../services/api";
import type { HubTranslate } from "../i18n-context";
import type { SidebarSection } from "./appShellNav";

type AppSidebarProps = {
  loginState: LoginState;
  loginTo: LoginTo;
  logout: () => void;
  onClose: () => void;
  onNavigate: () => void;
  t: HubTranslate;
  user: AuthUser | null;
  userInitials: string;
  userName: string;
  userRole: string;
  visibleSidebarSections: SidebarSection[];
};

export function AppSidebar({
  loginState,
  loginTo,
  logout,
  onClose,
  onNavigate,
  t,
  user,
  userInitials,
  userName,
  userRole,
  visibleSidebarSections
}: AppSidebarProps) {
  return (
    <aside className="side-rail">
      <div className="side-rail-head">
        <Link className="brand" to="/">
          <span className="brand-mark safety-brand-mark">
            <strong>MHC</strong>
            <small>6S</small>
          </span>
          <span className="brand-copy">
            <strong>{t("sidebarBrandTitle")}</strong>
            <small>{t("sidebarBrandSubtitle")}</small>
          </span>
        </Link>
        <button aria-label={t("closeMenu")} className="sidebar-close" onClick={onClose} type="button">
          <X size={18} />
        </button>
      </div>

      <nav className="main-nav" aria-label={t("mainNavigation")}>
        {visibleSidebarSections.map((section) => (
          <section className="sidebar-section" key={section.id}>
            <span className="sidebar-section-label">{section.label}</span>
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink end={item.end} key={item.to} title={item.label} to={item.to} onClick={onNavigate}>
                  <Icon size={18} />
                  <span>{item.label}</span>
                  {item.badge ? <em className={`sidebar-nav-badge ${item.badgeTone || ""}`}>{item.badge}</em> : null}
                </NavLink>
              );
            })}
          </section>
        ))}
      </nav>

      <div className="sidebar-user-card">
        {user ? (
          <div className="sidebar-user-info">
            <span className="sidebar-user-avatar">{userInitials}</span>
            <span className="sidebar-user-copy">
              <strong>{userName}</strong>
              <small>{userRole}</small>
            </span>
            <div className="sidebar-user-actions">
              <button
                className="sidebar-user-action-btn"
                onClick={() => {
                  const el = document.querySelector<HTMLButtonElement>(".user-session-btn");
                  if (el) { el.click(); }
                }}
                title="Đổi mật khẩu / Tài khoản"
                type="button"
              >
                <KeyRound size={14} />
              </button>
              <button
                className="sidebar-user-action-btn sidebar-user-logout-btn"
                onClick={logout}
                title={t("logout")}
                type="button"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        ) : (
          <Link state={loginState} to={loginTo}>
            <span className="sidebar-user-avatar">
              <UserRound size={16} />
            </span>
            <span className="sidebar-user-copy">
              <strong>{t("login")}</strong>
              <small>{userRole}</small>
            </span>
            <LogIn size={16} />
          </Link>
        )}
      </div>
    </aside>
  );
}
