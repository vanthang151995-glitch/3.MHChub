import { ArrowRight, Bell, Check, ChevronDown, Info, LogIn, LogOut, Menu, Moon, MoreHorizontal, Sun, X } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import type { LoginState, LoginTo } from "../auth/loginRedirect";
import { languages } from "../i18n";
import { normalizeLanguage, type HubLanguage, type HubTranslate } from "../i18n-context";
import type { AuthUser } from "../services/api";
import type { IconComponent } from "./appShellNav";
import { UserProfileDropdown } from "./UserProfileDropdown";

type ThemeMode = "light" | "dark";

function useIsMobile(breakpoint = 768) {
  const getSnapshot = () => typeof window !== "undefined" && window.innerWidth <= breakpoint;
  const subscribe = (cb: () => void) => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    mql.addEventListener("change", cb);
    return () => mql.removeEventListener("change", cb);
  };
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

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
  onlineCount?: number;
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
  onlineCount,
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
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile(900);

  const currentLanguage = languages.find((item) => item.id === lang) || languages[0];
  const nextTheme = theme === "dark" ? "light" : "dark";
  const ThemeIcon = theme === "dark" ? Moon : Sun;
  const onlineLabel = onlineCount != null && onlineCount > 0 ? `${onlineCount} Online` : t("online");

  useEffect(() => {
    if (!overflowOpen) return;
    function handleClick(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [overflowOpen]);

  function closeAll() {
    setOverflowOpen(false);
    setNotificationsOpen(false);
    setLanguageOpen(false);
    setProfileOpen(false);
  }

  return (
    <header className="topbar">
      <img
        alt="Mani Logo"
        className="topbar-logo"
        onError={(event) => { event.currentTarget.style.display = "none"; }}
        src={logoUrl || "/images/mani-wordmark.svg"}
      />
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

          {/* ── Desktop cluster — chỉ render khi không phải mobile ── */}
          {!isMobile && (
            <div className="topbar-action-cluster topbar-desktop-cluster">
              <span className="system-pill topnav-status-pill">
                <span />
                <strong>{onlineLabel}</strong>
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
                    title="Tài khoản & đổi mật khẩu"
                    type="button"
                  >
                    <span className="user-display-name">{userName}</span>
                    <ChevronDown size={14} style={{ opacity: 0.7, transition: "transform .2s", transform: profileOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
                  </button>
                  <UserProfileDropdown
                    isOpen={profileOpen}
                    logout={logout}
                    onClose={() => setProfileOpen(false)}
                    onDisplayNameChange={(name) => { onDisplayNameChange(name); }}
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
          )}

          {/* ── Mobile overflow button — chỉ render khi là mobile ── */}
          {isMobile && (
            <div className="topbar-overflow-wrapper" ref={overflowRef}>
              <button
                aria-label="Thêm"
                className={`topnav-action-btn topnav-icon-btn topbar-overflow-btn${overflowOpen ? " active" : ""}${notificationCount ? " has-badge" : ""}`}
                onClick={() => setOverflowOpen((v) => !v)}
                title="Thêm"
                type="button"
              >
                {overflowOpen ? <X size={18} /> : <MoreHorizontal size={18} />}
                {notificationCount && !overflowOpen ? (
                  <span className={`notification-badge ${urgentNotificationCount ? "alert" : "watch"}`}>
                    {notificationBadgeLabel}
                  </span>
                ) : null}
              </button>

              {overflowOpen ? (
                <div className="topbar-overflow-panel" role="menu">
                  <div className="tov-row tov-status">
                    <span className="tov-dot" />
                    <span className="tov-label">{onlineLabel}</span>
                  </div>

                  <div className="tov-divider" />

                  <button
                    className="tov-row tov-btn"
                    onClick={() => { setNotificationsOpen(true); setOverflowOpen(false); }}
                    type="button"
                  >
                    <Bell size={16} />
                    <span className="tov-label">{t("notificationCenter")}</span>
                    {notificationCount ? (
                      <span className={`tov-badge ${urgentNotificationCount ? "alert" : "watch"}`}>
                        {notificationBadgeLabel}
                      </span>
                    ) : null}
                  </button>

                  <button
                    className="tov-row tov-btn"
                    onClick={() => { onOpenHelp(); closeAll(); }}
                    type="button"
                  >
                    <Info size={16} />
                    <span className="tov-label">{t("helpNotes")}</span>
                  </button>

                  <button
                    className="tov-row tov-btn"
                    onClick={() => { setTheme(nextTheme); closeAll(); }}
                    type="button"
                  >
                    <ThemeIcon size={16} />
                    <span className="tov-label">{theme === "dark" ? t("darkMode") : t("lightMode")}</span>
                  </button>

                  <div className="tov-divider" />

                  <div className="tov-lang-group">
                    <span className="tov-group-label">{t("language")}</span>
                    {languages.map((item) => (
                      <button
                        className={`tov-row tov-btn tov-lang-item${lang === item.id ? " active" : ""}`}
                        key={item.id}
                        onClick={() => { setLang(normalizeLanguage(item.id)); closeAll(); }}
                        type="button"
                      >
                        <span className="tov-label">{item.label}</span>
                        {lang === item.id ? <Check size={14} /> : null}
                      </button>
                    ))}
                  </div>

                  <div className="tov-divider" />

                  {user ? (
                    <>
                      <div className="tov-row tov-user-info">
                        <span className="tov-label tov-username">{userName}</span>
                      </div>
                      <button
                        className="tov-row tov-btn tov-logout"
                        onClick={() => { logout(); closeAll(); }}
                        type="button"
                      >
                        <LogOut size={16} />
                        <span className="tov-label">{t("logout") || "Đăng xuất"}</span>
                      </button>
                    </>
                  ) : (
                    <Link
                      className="tov-row tov-btn tov-login"
                      state={loginState}
                      to={loginTo}
                      onClick={closeAll}
                    >
                      <LogIn size={16} />
                      <span className="tov-label">{t("login")}</span>
                    </Link>
                  )}
                </div>
              ) : null}
            </div>
          )}

        </div>
      ) : null}
    </header>
  );
}
