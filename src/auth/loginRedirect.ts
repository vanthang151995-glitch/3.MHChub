const DASHBOARD_ROUTE = "/";
const LOCAL_URL_BASE = "https://mhchub.local";
const ADMIN_ROLES = new Set(["admin", "ehs", "leader"]);
const ADMIN_ONLY_PATHS = ["/admin", "/operations"];

type LocationLike = {
  hash?: string;
  pathname?: string;
  search?: string;
  state?: {
    returnTo?: unknown;
  } | null;
} | null | undefined;

export type LoginTo = { pathname: string; search: string } | string;
export type LoginState = { returnTo: string } | undefined;
type LoginUser = { role?: string | null } | null | undefined;

const normalizePathname = (value: string) => value.replace(/\/+$/, "") || "/";

export function safeReturnTo(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || !text.startsWith("/") || text.startsWith("//") || text.startsWith("/\\")) return "";

  try {
    const parsed = new URL(text, LOCAL_URL_BASE);
    const pathname = normalizePathname(parsed.pathname);
    if (pathname === "/login") return "";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "";
  }
}

export function returnToFromLocation(location: LocationLike): string {
  return safeReturnTo(`${location?.pathname || "/"}${location?.search || ""}${location?.hash || ""}`);
}

export function returnToFromLoginLocation(location: LocationLike): string {
  const stateReturnTo = safeReturnTo(location?.state?.returnTo);
  if (stateReturnTo) return stateReturnTo;

  const queryReturnTo = new URLSearchParams(location?.search || "").get("returnTo");
  return safeReturnTo(queryReturnTo);
}

export function loginToForReturnTo(returnTo: unknown): LoginTo {
  const target = safeReturnTo(returnTo);
  return target ? { pathname: "/login", search: `?returnTo=${encodeURIComponent(target)}` } : "/login";
}

export function loginToForLocation(location: LocationLike): LoginTo {
  return loginToForReturnTo(returnToFromLocation(location));
}

export function loginStateForReturnTo(returnTo: unknown): LoginState {
  const target = safeReturnTo(returnTo);
  return target ? { returnTo: target } : undefined;
}

export function loginStateForLocation(location: LocationLike): LoginState {
  return loginStateForReturnTo(returnToFromLocation(location));
}

function isAdminOnlyPath(value: unknown): boolean {
  const target = safeReturnTo(value);
  if (!target) return false;

  try {
    const { pathname } = new URL(target, LOCAL_URL_BASE);
    const normalizedPathname = normalizePathname(pathname);
    return ADMIN_ONLY_PATHS.some((path) => normalizedPathname === path || normalizedPathname.startsWith(`${path}/`));
  } catch {
    return false;
  }
}

export function routeAfterLogin(returnTo: unknown, user: LoginUser): string {
  const target = safeReturnTo(returnTo);
  if (!target) return DASHBOARD_ROUTE;
  const role = user?.role;
  if (isAdminOnlyPath(target) && (typeof role !== "string" || !ADMIN_ROLES.has(role))) return DASHBOARD_ROUTE;
  return target;
}
