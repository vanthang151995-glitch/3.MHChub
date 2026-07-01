import {
  ArrowRight,
  Bell,
  Check,
  Info,
  LogIn,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Sun
} from "lucide-react";
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
  onlineCount?: number;
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

const MOBILE_BREAKPOINT = 900;

function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  const query = `(max-width: ${breakpoint}px)`;
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const mediaQuery = window.matchMedia(query);
      const handler = () => onStoreChange();
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handler);
        return () => mediaQuery.removeEventListener("change", handler);
      }
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    },
    () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false),
    () => false
  );
}

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
  onlineCount,
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
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  const currentLanguage = languages.find((item) => item.id === lang) || languages[0];
  const nextTheme = theme === "dark" ? "light" : "dark";
  const ThemeIcon = theme === "dark" ? Moon : Sun;
  const onlineLabel = onlineCount != null && onlineCount > 0 ? `${onlineCount} ${t("online")}` : t("online");

  useEffect(() => {
    if (!overflowOpen) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (overflowRef.current && target && !overflowRef.current.contains(target)) {
        closeDesktopMenus();
        setOverflowOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOverflowOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [overflowOpen]);

  useEffect(() => {
    if (!isMobile) {
      closeDesktopMenus();
      setOverflowOpen(false);
    }
  }, [isMobile]);

  const closeDesktopMenus = () => {
    setNotificationsOpen(false);
    setLanguageOpen(false);
    setProfileOpen(false);
  };

  const openHelp = () => {
    closeDesktopMenus();
    setOverflowOpen(false);
    onOpenHelp();
  };

  const toggleNotifications = () => {
    setLanguageOpen(false);
    setProfileOpen(false);
    setNotificationsOpen((value) => !value);
  };

  const renderNotificationPanel = (closeOverflowAfterSelect: boolean) => (
    <div className="notification-panel" role="menu">
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
                onClick={() => {
                  onNotificationClick(item);
                  if (closeOverflowAfterSelect) {
                    closeDesktopMenus();
                    setOverflowOpen(false);
                  }
                }}
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
  );

  return (
    <header className="topbar">
      {logoUrl ? (
        <img
          alt="Logo"
          className="topbar-logo"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
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
          {isMobile ? (
            <div className={`language-menu topbar-overflow-wrapper ${overflowOpen ? "open" : ""}`} ref={overflowRef}>
              <button
                aria-expanded={overflowOpen}
                aria-label={t("moreActions")}
                className="topnav-action-btn topnav-icon-btn topbar-overflow-btn"
                onClick={() => {
                  closeDesktopMenus();
                  setOverflowOpen((value) => !value);
                }}
                title={t("moreActions")}
                type="button"
              >
                <MoreHorizontal size={18} />
                {notificationCount ? <span className={`notification-badge ${urgentNotificationCount ? "alert" : "watch"}`}>{notificationBadgeLabel}</span> : null}
              </button>

              <div className={`topnav-menu topbar-overflow-panel ${overflowOpen ? "open" : ""}`} role="menu">
                <button
                  className="topnav-menu-item topbar-overflow-item"
                  onClick={openHelp}
                  role="menuitem"
                  type="button"
                >
                  <span className="topbar-overflow-left">
                    <Info size={16} />
                    <span>{t("helpNotes")}</span>
                  </span>
                </button>

                <button
                  className="topnav-menu-item topbar-overflow-item"
                  onClick={toggleNotifications}
                  role="menuitem"
                  type="button"
                >
                  <span className="topbar-overflow-left">
                    <Bell size={16} />
                    <span>{t("notificationCenter")}</span>
                  </span>
                  {notificationCount ? <em className="topbar-overflow-badge">{notificationBadgeLabel}</em> : null}
                </button>

                <button
                  className="topnav-menu-item topbar-overflow-item"
                  onClick={() => {
                    closeDesktopMenus();
                    setOverflowOpen(false);
                    setTheme(nextTheme);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <span className="topbar-overflow-left">
                    <ThemeIcon size={16} />
                    <span>{theme === "dark" ? t("lightMode") : t("darkMode")}</span>
                  </span>
                </button>

                <span className="topnav-menu-label">{t("language")}</span>
                {languages.map((item) => (
                  <button
                    className={`topnav-menu-item topbar-overflow-item ${lang === item.id ? "active" : ""}`}
                    key={item.id}
                    onClick={() => {
                      closeDesktopMenus();
                      setLang(normalizeLanguage(item.id));
                      setOverflowOpen(false);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <span className="topbar-overflow-left">
                      <span>{item.label}</span>
                    </span>
                    {lang === item.id ? <Check className="topbar-overflow-check" size={16} /> : null}
                  </button>
                ))}

                {user ? (
                  <div className="topbar-user-wrapper topbar-overflow-user">
                    <button
                      aria-expanded={profileOpen}
                      aria-label={`${userName} - ${t("account")}`}
                      className={`topnav-action-btn topnav-auth-btn user-session-btn${profileOpen ? " active" : ""}`}
                      onClick={() => {
                        setProfileOpen((value) => !value);
                        setNotificationsOpen(false);
                        setLanguageOpen(false);
                      }}
                      title={t("account")}
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
                    className="topnav-menu-item topbar-overflow-item topbar-overflow-login"
                    onClick={() => {
                      closeDesktopMenus();
                      setOverflowOpen(false);
                    }}
                    state={loginState}
                    to={loginTo}
                  >
                    <span className="topbar-overflow-left">
                      <LogIn size={16} />
                      <span>{t("login")}</span>
                    </span>
                  </Link>
                )}

                {notificationsOpen ? (
                  <div className="notification-menu open topbar-mobile-notifications">
                    {renderNotificationPanel(true)}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="topbar-desktop-cluster topbar-action-cluster">
              <span className="system-pill topnav-status-pill">
                <span />
                <strong>{onlineLabel}</strong>
              </span>
              <button
                aria-label={t("helpNotes")}
                className="topnav-action-btn topnav-icon-btn topnav-help-btn"
                onClick={openHelp}
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
                    setProfileOpen(false);
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
                {renderNotificationPanel(false)}
              </div>
              <button
                aria-label={t("themeMode")}
                className="topnav-action-btn topnav-icon-btn topnav-theme-btn"
                onClick={() => {
                  closeDesktopMenus();
                  setTheme(nextTheme);
                }}
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
                    setProfileOpen(false);
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
                    aria-label={`${userName} - ${t("account")}`}
                    className={`topnav-action-btn topnav-auth-btn user-session-btn${profileOpen ? " active" : ""}`}
                    onClick={() => {
                      setProfileOpen((value) => !value);
                      setNotificationsOpen(false);
                      setLanguageOpen(false);
                    }}
                    title={t("account")}
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
          )}
        </div>
      ) : null}
    </header>
  );
}
