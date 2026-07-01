import fs from "fs";
import path from "path";

const readArg = (name, fallback) => {
  const index = process.argv.lastIndexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
};

const baseUrl = readArg("--url", process.env.VERIFY_BASE_URL || "http://127.0.0.1:3333/");
const reportsDir = path.join(process.cwd(), "qa", "reports");
const reportPath = path.join(reportsDir, "admin-route-access-audit.json");
const serverIndexPath = path.join(process.cwd(), "server", "index.js");

const checks = [];

const addCheck = (name, pass, evidence = {}) => {
  checks.push({ name, pass: Boolean(pass), evidence });
};

const requestJson = async ({ method = "GET", path, body = null, headers = {} }) => {
  const init = {
    method,
    headers: {
      ...headers
    }
  };
  if (body !== null) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const response = await fetch(new URL(path, baseUrl), init);
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text();
  return {
    status: response.status,
    ok: response.ok,
    code: payload?.code || "",
    message: payload?.message || "",
    contentType,
    payload
  };
};

const normalizeRoutePath = (routePath) => String(routePath || "").split("?")[0];

const routeKey = (method, routePath) => `${String(method || "GET").toUpperCase()} ${normalizeRoutePath(routePath)}`;

const readServerApiRoutes = () => {
  const source = fs.readFileSync(serverIndexPath, "utf8");
  const routes = [];
  const routePattern = /^\s*app\.(get|post|put|delete|patch)\(\s*"([^"]+)"\s*,(?<rest>.*)$/gm;
  let match;
  while ((match = routePattern.exec(source))) {
    const method = match[1].toUpperCase();
    const path = match[2];
    const rest = match.groups?.rest || "";
    if (!path.startsWith("/api/")) continue;
    const hasRequireAdminAccess = /\b(?:requireAdminAccess|requireRootAdminAccess)\b/.test(rest);
    const hasAuthenticatedAccess = /\b(?:requireAdminAccess|requireRootAdminAccess|requireSafetySession|requireSafetyReviewAccess|requireSafetyAdminAccess|requireSafetyArchitectureSession|auth\.requireSession)\b/.test(rest);
    routes.push({
      hasAuthenticatedAccess,
      hasRequireAdminAccess,
      key: routeKey(method, path),
      method,
      path
    });
  }
  return routes;
};

const protectedRoutes = [
  { name: "config-update", method: "PUT", path: "/api/config", body: {} },
  { name: "app-logo-upload", method: "POST", path: "/api/app-settings/logo", body: {} },
  { name: "app-logo-delete", method: "DELETE", path: "/api/app-settings/logo" },
  { name: "admin-users-list", method: "GET", path: "/api/admin/users" },
  { name: "admin-users-create", method: "POST", path: "/api/admin/users", body: {} },
  { name: "admin-users-update", method: "PUT", path: "/api/admin/users/admin-user-id", routePattern: "/api/admin/users/:id", body: {} },
  { name: "admin-users-reset-password", method: "POST", path: "/api/admin/users/admin-user-id/reset-password", routePattern: "/api/admin/users/:id/reset-password", body: {} },
  { name: "admin-users-delete", method: "DELETE", path: "/api/admin/users/admin-user-id", routePattern: "/api/admin/users/:id" },
  { name: "safety-bulletins-drafts", method: "GET", path: "/api/safety-bulletins?includeDrafts=true", protectsViaQuery: true },
  { name: "safety-bulletins-deleted", method: "GET", path: "/api/safety-bulletins?includeDeleted=true", protectsViaQuery: true },
  { name: "safety-bulletin-create", method: "POST", path: "/api/safety-bulletins", body: {} },
  {
    name: "safety-bulletin-update",
    method: "PUT",
    path: "/api/safety-bulletins/bulletin-safety-meeting-2026-05",
    routePattern: "/api/safety-bulletins/:id",
    body: {}
  },
  { name: "safety-bulletin-delete", method: "DELETE", path: "/api/safety-bulletins/bulletin-safety-meeting-2026-05", routePattern: "/api/safety-bulletins/:id" },
  { name: "safety-bulletin-restore", method: "POST", path: "/api/safety-bulletins/bulletin-safety-meeting-2026-05/restore", routePattern: "/api/safety-bulletins/:id/restore" },
  { name: "safety-bulletin-logs", method: "GET", path: "/api/safety-bulletins/bulletin-safety-meeting-2026-05/logs", routePattern: "/api/safety-bulletins/:id/logs" },
  { name: "system-status", method: "GET", path: "/api/system/status" },
  { name: "system-preflight", method: "GET", path: "/api/system/preflight" },
  { name: "activity-log", method: "GET", path: "/api/activity" },
  { name: "backup-list", method: "GET", path: "/api/backups" },
  { name: "backup-create", method: "POST", path: "/api/backups", body: {} },
  { name: "document-upload", method: "POST", path: "/api/documents" },
  { name: "document-update", method: "PUT", path: "/api/documents/doc-hop-at-t05-2026-v2", routePattern: "/api/documents/:id", body: {} },
  { name: "document-delete", method: "DELETE", path: "/api/documents/doc-hop-at-t05-2026-v2", routePattern: "/api/documents/:id" }
];

const publicRoutes = [
  { name: "health", path: "/api/health" },
  { name: "auth-me", path: "/api/auth/me" },
  { name: "config-read", path: "/api/config" },
  { name: "safety-bulletins-public", path: "/api/safety-bulletins" },
  { name: "documents-list", path: "/api/documents?pageSize=1" }
];

for (const route of protectedRoutes) {
  const unauthenticated = await requestJson(route);
  addCheck(`protected-${route.name}-rejects-missing-session`, unauthenticated.status === 401 && unauthenticated.code === "LOGIN_REQUIRED", {
    method: route.method,
    path: route.path,
    status: unauthenticated.status,
    code: unauthenticated.code,
    message: unauthenticated.message
  });

  const malformedCookie = await requestJson({
    ...route,
    headers: { Cookie: "mhchub_admin_auth=not-a-valid-token" }
  });
  addCheck(`protected-${route.name}-rejects-malformed-session-cookie`, malformedCookie.status === 401 && malformedCookie.code === "LOGIN_REQUIRED", {
    method: route.method,
    path: route.path,
    status: malformedCookie.status,
    code: malformedCookie.code,
    message: malformedCookie.message
  });
}

const serverApiRoutes = readServerApiRoutes();
const protectedRouteKeys = new Set(
  protectedRoutes
    .filter((route) => !route.protectsViaQuery)
    .map((route) => routeKey(route.method, route.routePattern || route.path))
);
const publicMutationKeys = new Set([
  "POST /api/auth/login",
  "POST /api/auth/logout"
]);
const adminRouteDefinitions = serverApiRoutes.filter((route) => route.hasRequireAdminAccess);
const adminRoutesMissingFromAudit = adminRouteDefinitions.filter((route) => !protectedRouteKeys.has(route.key));
const protectedAuditRoutesMissingDefinition = [...protectedRouteKeys].filter(
  (key) => !serverApiRoutes.some((route) => route.key === key)
);
const unprotectedMutatingRoutes = serverApiRoutes.filter(
  (route) => route.method !== "GET" && !route.hasAuthenticatedAccess && !publicMutationKeys.has(route.key)
);

addCheck("admin-route-audit-covers-all-require-admin-routes", adminRoutesMissingFromAudit.length === 0, {
  missing: adminRoutesMissingFromAudit,
  protectedRouteKeys: [...protectedRouteKeys].sort()
});
addCheck("admin-route-audit-protected-routes-match-server-definitions", protectedAuditRoutesMissingDefinition.length === 0, {
  missingDefinitions: protectedAuditRoutesMissingDefinition,
  serverRoutes: serverApiRoutes.map((route) => route.key).sort()
});
addCheck("admin-route-mutating-api-routes-require-authenticated-session", unprotectedMutatingRoutes.length === 0, {
  allowedPublicMutations: [...publicMutationKeys].sort(),
  unprotectedMutatingRoutes
});

const publicReady = await requestJson({ path: "/api/ready" });
const readyPayload = publicReady.payload && typeof publicReady.payload === "object" ? publicReady.payload : {};
const readyKeys = Object.keys(readyPayload).sort();
const sensitiveReadyKeys = ["environment", "host", "process", "runtimeFiles", "counts", "summary", "warnings"]
  .filter((key) => Object.prototype.hasOwnProperty.call(readyPayload, key));
addCheck("public-ready-exposes-readiness-only", (
  [200, 503].includes(publicReady.status)
  && publicReady.contentType.includes("application/json")
  && typeof readyPayload.ready === "boolean"
  && Array.isArray(readyPayload.checks)
  && readyPayload.checks.length > 0
  && sensitiveReadyKeys.length === 0
), {
  status: publicReady.status,
  contentType: publicReady.contentType,
  keys: readyKeys,
  sensitiveReadyKeys
});

for (const route of publicRoutes) {
  const response = await requestJson(route);
  addCheck(`public-${route.name}-remains-readable`, response.status >= 200 && response.status < 300, {
    path: route.path,
    status: response.status,
    contentType: response.contentType
  });
}

const failedChecks = checks.filter((check) => !check.pass);
const report = {
  generatedAtUtc: new Date().toISOString(),
  ok: failedChecks.length === 0,
  reportPath: path.relative(process.cwd(), reportPath).replace(/\\/g, "/"),
  baseUrl,
  summary: {
    total: checks.length,
    passed: checks.length - failedChecks.length,
    failed: failedChecks.length
  },
  failedChecks,
  checks
};

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

if (failedChecks.length) {
  process.exit(1);
}
