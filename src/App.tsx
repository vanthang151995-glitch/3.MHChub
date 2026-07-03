import { Component, lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./app/AppShell";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { loginStateForLocation, loginToForLocation } from "./auth/loginRedirect";
import { buildHubModel, normalizeHubConfig } from "./core/hubCore";
import defaultConfig from "../shared/defaultConfig.js";
import { HubLanguageContext, normalizeLanguage, translateDictionary } from "./i18n-context";
import type { HubLanguage, HubTranslate } from "./i18n-context";
import { api } from "./services/api";
import { PageSkeleton } from "./components/PageSkeleton";
import { BuildUpdateNotifier } from "./components/BuildUpdateNotifier";
import { GlobalDropZone } from "./components/GlobalDropZone";
const AdminPage = lazy(() => import("./pages/AdminPage").then((module) => ({ default: module.AdminPage })));
const DepartmentPage = lazy(() => import("./pages/DepartmentPage").then((module) => ({ default: module.DepartmentPage })));
const DocumentPreviewPage = lazy(() =>
  import("./pages/DocumentPreviewPage").then((module) => ({ default: module.DocumentPreviewPage }))
);
const DocumentsPage = lazy(() => import("./pages/DocumentsPage").then((module) => ({ default: module.DocumentsPage })));
const HomePage = lazy(() => import("./pages/HomePage").then((module) => ({ default: module.HomePage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const OperationsPage = lazy(() => import("./pages/OperationsPage").then((module) => ({ default: module.OperationsPage })));
const SafetyOperationsModule = lazy(() =>
  import("./pages/safety/SafetyOperationsModule").then((module) => ({ default: module.SafetyOperationsModule }))
);

type ThemeMode = "light" | "dark";

function useLanguage() {
  const [lang, setLang] = useState<HubLanguage>(() => normalizeLanguage(localStorage.getItem("hub-lang")));

  useEffect(() => {
    localStorage.setItem("hub-lang", lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const t: HubTranslate = (key, params) => translateDictionary(lang, key, params);
  return { lang, setLang, t };
}

const THEME_DEFAULT_VERSION = "light-default-v1";
const THEME_DEFAULT_VERSION_KEY = "hub-theme-default-version";

function readInitialTheme(): ThemeMode {
  const storedTheme = localStorage.getItem("hub-theme");
  if (localStorage.getItem(THEME_DEFAULT_VERSION_KEY) !== THEME_DEFAULT_VERSION) {
    localStorage.setItem(THEME_DEFAULT_VERSION_KEY, THEME_DEFAULT_VERSION);
    localStorage.setItem("hub-theme", "light");
    return "light";
  }

  if (storedTheme === "dark" || storedTheme === "light") {
    return storedTheme;
  }

  localStorage.setItem("hub-theme", "light");
  return "light";
}

function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme);

  useEffect(() => {
    localStorage.setItem("hub-theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return { theme, setTheme };
}

const ADMIN_ROLES = new Set(["admin", "ehs", "leader"]);
const ROUTE_CHUNK_RELOAD_KEY = "mhchub-route-chunk-reload";
const ROUTE_REFRESH_PARAM = "mhchub_refresh";

function getErrorText(error: unknown) {
  if (!(error instanceof Error)) return String(error || "").toLowerCase();
  return `${error?.message || ""} ${error?.stack || ""}`.toLowerCase();
}

function isRouteChunkError(error: unknown) {
  const text = getErrorText(error);
  return [
    "chunkloaderror",
    "failed to fetch dynamically imported module",
    "error loading dynamically imported module",
    "importing a module script failed",
    "expected a javascript module script",
    "mime type",
    "module script"
  ].some((pattern) => text.includes(pattern));
}

function readSessionValue(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionValue(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage failures; manual reload remains available.
  }
}

function removeSessionValue(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures; hard navigation still refreshes the route.
  }
}

function refreshCurrentRoute({ clearReloadMarker = true }: { clearReloadMarker?: boolean } = {}) {
  if (typeof window === "undefined") return;
  if (clearReloadMarker) {
    removeSessionValue(`${ROUTE_CHUNK_RELOAD_KEY}:${window.location.pathname}`);
  }
  const url = new URL(window.location.href);
  url.searchParams.set(ROUTE_REFRESH_PARAM, String(Date.now()));
  window.location.replace(url.toString());
}

type RouteBoundaryLabels = {
  loading: string;
  refresh: string;
  routeLoadErrorCopy: string;
  routeLoadErrorTitle: string;
  routeLoadRetryCopy: string;
  routeLoadRetryTitle: string;
};

type RouteErrorBoundaryProps = {
  children: ReactNode;
  labels: RouteBoundaryLabels;
  locationKey: string;
};

type RouteErrorBoundaryState = {
  error: Error | null;
  reloading: boolean;
};

class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  private reloadTimer: number | null = null;

  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { error: null, reloading: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { error, reloading: false };
  }

  componentDidCatch(error: Error) {
    console.error("Route render failed", error);
    if (!isRouteChunkError(error) || typeof window === "undefined") return;

    const reloadKey = `${ROUTE_CHUNK_RELOAD_KEY}:${window.location.pathname}`;
    if (readSessionValue(reloadKey)) return;

    writeSessionValue(reloadKey, "1");
    this.setState({ reloading: true });
    this.reloadTimer = window.setTimeout(() => {
      refreshCurrentRoute({ clearReloadMarker: false });
    }, 120);
  }

  componentDidUpdate(prevProps: RouteErrorBoundaryProps) {
    if (prevProps.locationKey !== this.props.locationKey && this.state.error) {
      this.setState({ error: null, reloading: false });
    }
  }

  componentWillUnmount() {
    if (this.reloadTimer) window.clearTimeout(this.reloadTimer);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const { labels } = this.props;
    const chunkError = isRouteChunkError(this.state.error);
    const title = this.state.reloading || chunkError ? labels.routeLoadRetryTitle : labels.routeLoadErrorTitle;
    const message = this.state.reloading || chunkError ? labels.routeLoadRetryCopy : labels.routeLoadErrorCopy;

    return (
      <div className="page">
        <section className="panel-card">
          <div className="panel-header">
            <div>
              <p className="eyebrow">{labels.loading}</p>
              <h2>{title}</h2>
            </div>
            <button className="secondary-button small" onClick={() => refreshCurrentRoute()} type="button">
              {labels.refresh}
            </button>
          </div>
          <p className="empty-text">{message}</p>
        </section>
      </div>
    );
  }
}

function ProtectedRoute({ children, requireAdmin = false, loadingLabel }: { children: ReactNode; requireAdmin?: boolean; loadingLabel: string }) {
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <div className="page"><p className="empty-text">{loadingLabel}</p></div>;
  if (!user) return <Navigate to={loginToForLocation(location)} replace state={loginStateForLocation(location)} />;
  if (requireAdmin && !ADMIN_ROLES.has(user.role)) return <Navigate to="/" replace />;
  return children;
}

function AppContent() {
  const language = useLanguage();
  const theme = useTheme();
  const location = useLocation();
  const { user } = useAuth();
  const [config, setConfig] = useState(() => normalizeHubConfig(defaultConfig));

  useEffect(() => {
    api.fetchConfig().then((payload) => setConfig(normalizeHubConfig(payload))).catch(() => {});
  }, []);

  const model = useMemo(() => buildHubModel(config), [config]);
  const pageProps = { ...language, ...theme, config, setConfig, model, user };
  return (
    <HubLanguageContext.Provider value={language}>
      <AppShell {...language} {...theme} model={model}>
        <RouteErrorBoundary
          labels={{
            loading: language.t("loading"),
            refresh: language.t("refresh"),
            routeLoadErrorCopy: language.t("routeLoadErrorCopy"),
            routeLoadErrorTitle: language.t("routeLoadErrorTitle"),
            routeLoadRetryCopy: language.t("routeLoadRetryCopy"),
            routeLoadRetryTitle: language.t("routeLoadRetryTitle")
          }}
          locationKey={location.pathname}
        >
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route path="/" element={<HomePage {...pageProps} />} />
              <Route path="/safety-6s/*" element={<ProtectedRoute loadingLabel={language.t("loading")}><SafetyOperationsModule {...pageProps} /></ProtectedRoute>} />
              <Route path="/safety-6s/departments/:id" element={<ProtectedRoute loadingLabel={language.t("loading")}><DepartmentPage {...pageProps} /></ProtectedRoute>} />
              <Route path="/documents" element={<DocumentsPage {...pageProps} />} />
              <Route path="/documents/:id/preview" element={<DocumentPreviewPage {...pageProps} />} />
              <Route path="/operations" element={<ProtectedRoute requireAdmin loadingLabel={language.t("loading")}><OperationsPage {...pageProps} /></ProtectedRoute>} />
              <Route path="/login" element={<LoginPage {...pageProps} />} />
              <Route path="/admin" element={<ProtectedRoute requireAdmin loadingLabel={language.t("loading")}><AdminPage {...pageProps} /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </RouteErrorBoundary>
      </AppShell>
    </HubLanguageContext.Provider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
      <BuildUpdateNotifier />
      <GlobalDropZone />
    </AuthProvider>
  );
}

export default App;
