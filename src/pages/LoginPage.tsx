import { AlertTriangle, Archive, FileText, KeyRound, LogIn, Settings2, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { returnToFromLoginLocation, routeAfterLogin } from "../auth/loginRedirect";
import { Button, Field } from "../components/ui";
import type { HubTranslate } from "../i18n-context";
import "./LoginPage.css";

const getErrorCode = (error: unknown): string =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : "";

export function LoginPage({ t }: { t: HubTranslate }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, login, message, clearMessage } = useAuth();
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const initialFocusDoneRef = useRef(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const returnTo = returnToFromLoginLocation(location);

  useEffect(() => {
    if (loading || initialFocusDoneRef.current) return;
    initialFocusDoneRef.current = true;
    usernameRef.current?.focus();
  }, [loading]);

  if (!loading && user) {
    return <Navigate to={routeAfterLogin(returnTo, user)} replace />;
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedUsername = username.trim();
    setError("");
    clearMessage();

    if (!normalizedUsername) {
      usernameRef.current?.focus();
      return;
    }
    if (!password) {
      passwordRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const authenticatedUser = await login(normalizedUsername, password);
      setPassword("");
      navigate(routeAfterLogin(returnTo, authenticatedUser), { replace: true });
    } catch (err: unknown) {
      setPassword("");
      setError(getErrorCode(err) === "LOGIN_RATE_LIMITED" ? t("loginRateLimited") : t("loginInvalid"));
      window.requestAnimationFrame(() => passwordRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  };

  const moveToPassword = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    setError("");
    clearMessage();
    if (!username.trim()) {
      usernameRef.current?.focus();
      return;
    }
    passwordRef.current?.focus();
  };

  return (
    <div className="page login-page">
      <section className="login-shell">
        <div className="login-card">
          <div className="login-hero">
            <span className="login-mark">
              <ShieldCheck size={30} />
            </span>
            <div>
              <h1>{t("loginTitle")}</h1>
              <p>{t("loginSubtitle")}</p>
            </div>
          </div>

          <div className="login-access-grid">
            <span>
              <Settings2 size={16} />
              {t("systemConfig")}
            </span>
            <span>
              <FileText size={16} />
              {t("documentControl")}
            </span>
            <span>
              <Archive size={16} />
              {t("backupControl")}
            </span>
          </div>

          <form className="login-form" onSubmit={submit}>
            <Field label={t("username")}>
              <span className="input-with-icon">
                <UserRound size={18} />
                <input
                  autoComplete="username"
                  autoFocus
                  disabled={loading || submitting}
                  name="username"
                  onKeyDown={moveToPassword}
                  onChange={(event) => setUsername(event.target.value)}
                  ref={usernameRef}
                  spellCheck={false}
                  value={username}
                />
              </span>
            </Field>
            <Field label={t("password")}>
              <span className="input-with-icon">
                <KeyRound size={18} />
                <input
                  autoComplete="current-password"
                  disabled={loading || submitting}
                  name="password"
                  onChange={(event) => setPassword(event.target.value)}
                  ref={passwordRef}
                  type="password"
                  value={password}
                />
              </span>
            </Field>

            {error ? (
              <div className="form-alert">
                <AlertTriangle size={18} />
                <span>{error}</span>
              </div>
            ) : null}
            {message ? (
              <div className="form-alert warning">
                <AlertTriangle size={18} />
                <span>{t(message)}</span>
              </div>
            ) : null}

            <Button
              className="primary-button full-width"
              disabled={!username.trim() || !password || loading || submitting}
              size="full"
              type="submit"
            >
              <LogIn size={18} />
              {submitting ? t("signingIn") : t("login")}
            </Button>
          </form>
        </div>

        <aside className="login-scope-panel">
          <div>
            <span className="login-scope-kicker">{t("accessScopeTitle")}</span>
            <h2>{t("accessScopeSubtitle")}</h2>
          </div>
          <div className="login-scope-list">
            <div>
              <Settings2 size={18} />
              <span>{t("systemConfig")}</span>
              <p>{t("accessConfigDetail")}</p>
            </div>
            <div>
              <FileText size={18} />
              <span>{t("documentControl")}</span>
              <p>{t("accessDocumentsDetail")}</p>
            </div>
            <div>
              <Archive size={18} />
              <span>{t("backupControl")}</span>
              <p>{t("accessBackupDetail")}</p>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
