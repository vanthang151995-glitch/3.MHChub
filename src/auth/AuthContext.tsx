import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../services/api";
import type { AuthUser } from "../services/api";

type AuthContextValue = {
  clearMessage: () => void;
  isAuthenticated: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<AuthUser | null>;
  logout: () => Promise<void>;
  message: string;
  refresh: () => Promise<void>;
  user: AuthUser | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const errorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await api.fetchCurrentUser();
      setUser(payload.data?.user || null);
      setMessage("");
    } catch (err: unknown) {
      if (errorCode(err) === "SESSION_REPLACED") {
        setMessage("sessionReplaced");
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (username: string, password: string) => {
      const payload = await api.login(username, password);
      const authenticatedUser = payload.data?.user || null;
      setUser(authenticatedUser);
      setMessage("");
      await refresh();
      return authenticatedUser;
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setMessage("");
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      message,
      isAuthenticated: !!user,
      login,
      logout,
      refresh,
      clearMessage: () => setMessage("")
    }),
    [loading, login, logout, message, refresh, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
