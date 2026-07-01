import { ArrowRight, Bell, Check, Info, LogIn, LogOut, Menu, Moon, Sun } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { LoginState, LoginTo } from "../auth/loginRedirect";
import { languages } from "../i18n";
import { normalizeLanguage, type HubLanguage, type HubTranslate } from "../i18n-context";
import type { AuthUser } from "../services/api";
import type { IconComponent } from "./appShellNav";
import { UserProfileDropdown } from "./UserProfileDropdown";

type ThemeMode = "light" | "dark";

export type TopNavNotificationItem = {
  detail: string;
  Icon: IconComponent;
  id: string;
  meta: string;
  title: string;
  to: string;
  tone: "alert" | "good" | "info" | "watch";
};

type AppTopNavProps = {
  activePageLabel: ReactNode;
  hideTopbarActions: boolean;
  lang: HubLanguage;
  languageOpen: boolean;
  loginState: LoginState;
  loginTo: LoginTo;
  logoUrl?: string | null;
  logout: () => void;
  notificationBadgeLabel: string;
  notificationCount: number;
  notificationItems: TopNavNotificationItem[];
  notificationsOpen: boolean;
  onDisplayNameChange: (name: string) => void;
  onNotificationClick: (item: TopNavNotificationItem) => void;
  onOpenHelp: () => void;
  setLang: (lang: HubLanguage) => void;
  setLanguageOpen: Dispatch<SetStateAction<boolean>>;
  setNotificationsOpen: Dispatch<SetStateAction<boolean>>;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setTheme: (theme: ThemeMode) => void;
  sidebarOpen: boolean;
  t: HubTranslate;
  theme: ThemeMode;
  urgentNotificationCount: number;
  user: AuthUser | null;
  userName: string;
};

export function AppTopNav({
  activePageLabel,
  hideTopbarActions,
  lang,
  languageOpen,
  loginState,
  loginTo,
  logoUrl,
  logout,
  notificationBadgeLabel,
  notificationCount,
  notificationItems,
  notificationsOpen,
  onDisplayNameChange,
  onNotificationClick,
  onOpenHelp,
  setLang,
  setLanguageOpen,
  setNotificationsOpen,
  setSidebarOpen,
  setTheme,
  sidebarOpen,
  t,
  theme,
  urgentNotificationCount,
  user,
  userName
}: AppTopNavProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const currentLanguage = languages.find((item) => item.id === lang) || languages[0];
  const nextTheme = theme === "dark" ? "light" : "dark";
  const ThemeIcon = theme === "dark" ? Moon : Sun;

  return (
    <header className="topbar">
      {logoUrl ? (
        <img
          alt="Logo"
          className="topbar-logo"
          onError={(event) => { event.currentTarget.style.display = "none"; }}
          src={logoUrl}
        />
      ) : null}
      <button
        aria-expanded={sidebarOpen}
        aria-label={t("openMenu")}
        className="sidebar-toggle"
        onClick={() => setSidebarOpen(true)}
        type="button"
      >
        <Menu size={20} />
      </button>
      <nav aria-label={t("breadcrumb")} className="page-crumb">
        <ol>
          <li>
            <Link to="/">{t("brand")}</Link>
          </li>
          <li aria-current="page">
            <strong>{activePageLabel}</strong>
          </li>
        </ol>
      </nav>
      {!hideTopbarActions ? (
        <div className="topbar-actions">
          <div className="topbar-action-cluster">
            <span className="system-pill topnav-status-pill">
              <span />
              <strong>{t("online")}</strong>
            </span>
            <button
              aria-label={t("helpNotes")}
              className="topnav-action-btn topnav-icon-btn topnav-help-btn"
              onClick={onOpenHelp}
              title={t("helpNotes")}
              type="button"
            >
              <Info size={18} />
            </button>
            <div className={`notification-menu ${notificationsOpen ? "open" : ""}`}>
              <button
                aria-expanded={notificationsOpen}
                aria-label={t("notificationCenter")}
                className="topnav-action-btn topnav-icon-btn notification-trigger"
                onClick={() => {
                  setNotificationsOpen((value) => !value);
                  setLanguageOpen(false);
                }}
                title={t("notificationCenter")}
                type="button"
              >
                <Bell size={18} />
                {notificationCount ? (
                  <span className={`notification-badge ${urgentNotificationCount ? "alert" : "watch"}`}>
                    {notificationBadgeLabel}
                  </span>
                ) : null}
              </button>
              <div className="topnav-menu notification-panel" role="menu">
                <div className="notification-panel-head">
                  <span>
                    <strong>{t("notificationCenter")}</strong>
                    <small>{t("notificationCenterSubtitle")}</small>
                  </span>
                  {notificationCount ? <em>{notificationBadgeLabel}</em> : null}
                </div>
                <div className="notification-list">
                  {notificationItems.length ? (
                    notificationItems.map((item) => {
                      const Icon = item.Icon;
                      return (
                        <Link
                          className={`notification-item ${item.tone}`}
                          key={item.id}
                          onClick={() => onNotificationClick(item)}
                          role="menuitem"
                          to={item.to}
                        >
                          <span className={`notification-item-icon ${item.tone}`}>
                            <Icon size={16} />
                          </span>
                          <span className="notification-item-copy">
                            <strong>{item.title}</strong>
                            <small>{item.meta}</small>
                            <span>{item.detail}</span>
                          </span>
                          <ArrowRight size={15} />
                        </Link>
                      );
                    })
                  ) : (
                    <span className="notification-empty">{t("notificationEmpty")}</span>
                  )}
                </div>
              </div>
            </div>
            <button
              aria-label={t("themeMode")}
              className="topnav-action-btn topnav-icon-btn topnav-theme-btn"
              onClick={() => setTheme(nextTheme)}
              title={theme === "dark" ? t("darkMode") : t("lightMode")}
              type="button"
            >
              <ThemeIcon size={18} />
            </button>
            <div className={`language-menu ${languageOpen ? "open" : ""}`}>
              <button
                aria-expanded={languageOpen}
                aria-label={t("language")}
                className="topnav-action-btn topnav-lang-btn language-trigger"
                onClick={() => {
                  setLanguageOpen((value) => !value);
                  setNotificationsOpen(false);
                }}
                title={t("language")}
                type="button"
              >
                <span>{currentLanguage.label}</span>
              </button>
              <div className="topnav-menu" role="menu">
                <span className="topnav-menu-label">{t("language")}</span>
                {languages.map((item) => (
                  <button
                    className={`topnav-menu-item ${lang === item.id ? "active" : ""}`}
                    key={item.id}
                    onClick={() => {
                      setLang(normalizeLanguage(item.id));
                      setLanguageOpen(false);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <span>{item.label}</span>
                    {lang === item.id ? <Check size={16} /> : null}
                  </button>
                ))}
              </div>
            </div>
            {user ? (
              <div className="topbar-user-wrapper">
                <button
                  aria-expanded={profileOpen}
                  aria-label={`${userName} — tài khoản`}
                  className={`topnav-action-btn topnav-auth-btn user-session-btn${profileOpen ? " active" : ""}`}
                  onClick={() => {
                    setProfileOpen((v) => !v);
                    setNotificationsOpen(false);
                    setLanguageOpen(false);
                  }}
                  title="Tài khoản"
                  type="button"
                >
                  <span className="user-display-name">{userName}</span>
                  <LogOut size={15} />
                </button>
                <UserProfileDropdown
                  isOpen={profileOpen}
                  logout={logout}
                  onClose={() => setProfileOpen(false)}
                  onDisplayNameChange={(name) => {
                    onDisplayNameChange(name);
                  }}
                  t={t}
                  user={user}
                  userName={userName}
                />
              </div>
            ) : (
              <Link
                aria-label={t("login")}
                className="topnav-action-btn topnav-auth-btn user-session-btn"
                state={loginState}
                title={t("login")}
                to={loginTo}
              >
                <span className="user-display-name">{t("login")}</span>
                <LogIn size={16} />
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
