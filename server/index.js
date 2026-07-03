import cors from "cors";
import compression from "compression";
import { randomUUID } from "crypto";
import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import defaultConfig from "../shared/defaultConfig.js";
import { normalizeDocumentTitleForStorage } from "../shared/documentDisplay.js";
import { createAuthService } from "./auth/authService.js";
import { createMysqlAuthStore } from "./auth/mysqlAuthStore.js";
import { createCentralProcessor } from "./core/centralProcessor.js";
import { isAllowedDocumentUpload } from "./core/documentUploadPolicy.js";
import { createMysqlConfigStore } from "./core/mysqlConfigStore.js";
import { createMysqlDocumentStore } from "./core/mysqlDocumentStore.js";
import { createMysqlSafetyBulletinStore } from "./core/mysqlSafetyBulletinStore.js";
import { createMysqlSafetyArchitectureStore } from "./core/mysqlSafetyArchitectureStore.js";
import { createMysqlSafetyOperationsStore } from "./core/mysqlSafetyOperationsStore.js";
import { createJsonSafetyArchitectureStore } from "./core/jsonSafetyArchitectureStore.js";
import { createJsonSafetyOperationsStore } from "./core/jsonSafetyOperationsStore.js";
import { createDocumentPreviewService } from "./core/documentPreviewService.js";
import { createRuntimeSupervisor } from "./core/runtimeSupervisor.js";
import { saveFileToDB, loadFileFromDB, restoreFilesToDisk } from "./core/fileStore.js";
import { repairMojibakeText } from "./core/textEncoding.js";
import { emitNotificationChange, notificationBus } from "./core/notificationBus.js";
import { isEmailConfigured, sendOverdueReminders, testSmtpConnection } from "./core/emailService.js";
import { createXlsxPreview } from "./core/xlsxPreview.js";
import { xlsxToHtml } from "./core/excelJsHtml.js";
import { loadLocalEnv } from "./loadEnv.js";
import { computeSafetyScores } from "./core/safetyScoreEngine.js";
import { generateSafetyScoreExcel, generateDeptReportExcel } from "./core/safetyExportService.js";
import { createGithubSyncService } from "./core/githubSyncService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

loadLocalEnv(rootDir);

const dataDir = path.join(__dirname, "data");
const uploadDir = path.join(__dirname, "uploads");
const previewDir = path.join(__dirname, "previews");
const authDir = path.join(dataDir, "auth");
const docsFile = path.join(dataDir, "documents.json");
const configFile = path.join(dataDir, "config.json");
const activityFile = path.join(dataDir, "activity.json");
const backupDir = path.join(dataDir, "backups");
const productionPreflightFile = path.join(rootDir, "qa", "reports", "production-preflight-summary.json");
const SERVER_START_TIME = Date.now();
const port = process.env.PORT || 3335;
const adminPin = process.env.ADMIN_PIN || "2468";
const appEnv = process.env.APP_ENV || "lan";
const isProduction = process.env.NODE_ENV === "production";
const isLanMode = appEnv === "lan";
const strictSecurity = isProduction && !isLanMode;
const maxUploadMb = Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 50);
const activityLogLimit = Math.max(100, Number(process.env.ACTIVITY_LOG_LIMIT) || 500);
const previewTimeoutMs = Math.max(15000, Number(process.env.PREVIEW_CONVERT_TIMEOUT_MS) || 90000);
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || `http://localhost:${port},http://localhost:5173,http://127.0.0.1:5173`)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const trustProxy = String(process.env.TRUST_PROXY || "false").toLowerCase() === "true";
const enableLegacyAdminPin = String(process.env.ENABLE_LEGACY_ADMIN_PIN || "false").toLowerCase() === "true";
const usesDefaultAdminPin = adminPin === "2468";
const weakAdminPasswords = new Set(["change_this_login_password", "admin", "password", "123456", "12345678"]);
const usesPlaceholderAdminPassword = weakAdminPasswords.has(String(process.env.ADMIN_PASSWORD || "").trim().toLowerCase());
const noindexClientRoutePrefixes = ["/admin", "/operations", "/login"];
const isNoindexClientRoute = (requestPath = "") =>
  noindexClientRoutePrefixes.some((route) => requestPath === route || requestPath.startsWith(`${route}/`));
const normalizeHostname = (hostname = "") => String(hostname || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
const isLoopbackHostname = (hostname = "") => {
  const normalized = normalizeHostname(hostname);
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
};
const requestOrigin = (req) => {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  const protocol = forwardedProto || (req.secure ? "https" : "http");
  const host = String(req.headers.host || "").trim();
  if (!host) return "";
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return "";
  }
};
const isSameRequestOrigin = (req, origin = "") => {
  if (!origin) return true;
  try {
    return new URL(origin).origin === requestOrigin(req);
  } catch {
    return false;
  }
};
const allowsBrowserIsolationHeaders = (req) => {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  return req.secure || forwardedProto === "https" || isLoopbackHostname(req.hostname);
};
// Spreadsheet HTML preview (SheetJS or LibreOffice). Allow inline CSS and safe inline scripts (tab switching).
// No network fetches, no external resources, no forms or objects.
const excelHtmlPreviewCsp = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "connect-src 'none'",
  "img-src 'self' data:",
  "style-src 'none'",
  "style-src-elem 'unsafe-inline'",
  "style-src-attr 'unsafe-inline'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'self'",
  "worker-src 'none'",
  "media-src 'none'"
].join("; ");
const strictTransportSecurityHeader = "max-age=31536000; includeSubDomains";
const appConnectSrc = strictSecurity ? "connect-src 'self'" : "connect-src 'self' http://localhost:* http://127.0.0.1:*";
const appContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  appConnectSrc,
  "font-src 'self' data:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'self'"
].join("; ");

if (strictSecurity && allowedOrigins.includes("*")) {
  throw new Error("ALLOWED_ORIGINS cannot include * in production public mode");
}

const core = createCentralProcessor({
  dataDir,
  docsFile,
  configFile,
  uploadDir,
  defaultConfig,
  documentStore: createMysqlDocumentStore({ rootDir }),
  configStore: createMysqlConfigStore({ rootDir }),
  bulletinStore: createMysqlSafetyBulletinStore({ rootDir })
});
const safetyArchitecture = createMysqlSafetyArchitectureStore({ rootDir }) || createJsonSafetyArchitectureStore({ rootDir });
const safetyOps = createMysqlSafetyOperationsStore({ rootDir, archStore: safetyArchitecture }) || createJsonSafetyOperationsStore({ rootDir, archStore: safetyArchitecture });

const supervisor = createRuntimeSupervisor({
  activityFile,
  backupDir,
  configFile,
  docsFile,
  previewDir,
  uploadDir,
  activityLimit: activityLogLimit
});

const createDocumentRuntimeBackup = (reason, metadata = {}) => {
  try {
    return supervisor.createBackup(reason);
  } catch (error) {
    supervisor.logActivity({
      type: "backup.failed",
      level: "warning",
      message: `Runtime backup failed (${reason})`,
      target: reason,
      metadata: { ...metadata, error: error.message }
    });
    return null;
  }
};

const previewService = createDocumentPreviewService({
  previewDir,
  timeoutMs: previewTimeoutMs
});

const auth = createAuthService({
  authDir,
  adminPin,
  appEnv,
  trustProxy,
  store: createMysqlAuthStore({ rootDir })
});

supervisor.logActivity({
  type: "service.started",
  message: "Company Utility Hub API started",
  metadata: { port, appEnv }
});

const githubSync = createGithubSyncService();

const safeName = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

const safeUploadName = (name) => safeName(name) || "document";
const safeHeaderFallbackName = (name) =>
  safeUploadName(name)
    .replace(/[^\x20-\x7E]/g, "-")
    .replace(/["\\;]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "document";
const encodeHeaderFilename = (name) =>
  encodeURIComponent(String(name || "document").replace(/[\r\n]/g, " ").trim() || "document").replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
const contentDispositionHeader = (disposition, name) => {
  const original = String(name || "document").replace(/[\r\n]/g, " ").trim() || "document";
  const fallback = safeHeaderFallbackName(original);
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeHeaderFilename(original)}`;
};
const decodeUploadFileName = (name = "") => {
  const value = String(name || "document");
  return repairMojibakeText(value) || value;
};
const sensitiveLogQueryPattern = /(token|secret|password|passwd|pwd|pin|api[-_]?key|apikey|auth|authorization|session|cookie)/i;
const redactRequestTarget = (value = "") => {
  const raw = String(value || "");
  try {
    const url = new URL(raw, "http://mhchub.local");
    for (const key of [...url.searchParams.keys()]) {
      if (sensitiveLogQueryPattern.test(key)) {
        url.searchParams.set(key, "REDACTED");
      }
    }
    const search = url.searchParams.toString();
    return `${url.pathname}${search ? `?${search}` : ""}`;
  } catch {
    return raw.replace(/([?&][^=]*(?:token|secret|password|passwd|pwd|pin|api[-_]?key|apikey|auth|authorization|session|cookie)[^=]*=)[^&#]*/gi, "$1REDACTED");
  }
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    cb(null, `${stamp}-${safeUploadName(decodeUploadFileName(file.originalname))}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, isAllowedDocumentUpload(file));
  }
});

const createRateLimiter = ({ windowMs, max, keyPrefix, skip = () => false }) => {
  const hits = new Map();
  // Periodic cleanup to prevent unbounded memory growth
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, val] of hits) {
      if (val.resetAt <= now) hits.delete(key);
    }
  }, Math.max(windowMs, 60_000)).unref();
  return (req, res, next) => {
    if (skip(req)) return next();
    const now = Date.now();
    const key = `${keyPrefix}:${req.ip || "unknown"}`;
    const current = hits.get(key);
    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    current.count += 1;
    if (current.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
      return res.status(429).json({ message: "Too many requests", code: "RATE_LIMITED" });
    }
    return next();
  };
};

const app = express();
app.disable("x-powered-by");

const SYNC_TRIGGER_PATHS = [
  { pattern: /^\/api\/safety-bulletins/, label: "bảng tin" },
  { pattern: /^\/api\/warnings/, label: "cảnh báo" },
  { pattern: /^\/api\/actions/, label: "CAPA/hành động" },
  { pattern: /^\/api\/documents/, label: "tài liệu" },
  { pattern: /^\/api\/inspection-plans/, label: "kế hoạch kiểm tra" },
  { pattern: /^\/api\/safety-meetings/, label: "họp an toàn" },
  { pattern: /^\/api\/config/, label: "cấu hình" },
];
const SYNC_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

app.use((req, res, next) => {
  if (!SYNC_METHODS.has(req.method)) return next();
  const matched = SYNC_TRIGGER_PATHS.find((p) => p.pattern.test(req.path));
  if (!matched) return next();
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    originalJson(body);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      githubSync.triggerSync(`${req.method} ${matched.label}`);
    }
  };
  next();
});

if (trustProxy) {
  app.set("trust proxy", 1);
}

app.use((req, res, next) => {
  const requestId = req.header("X-Request-ID") || randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (allowsBrowserIsolationHeaders(req)) {
    res.setHeader("Origin-Agent-Cluster", "?1");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  }
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (strictSecurity) {
    res.setHeader("Strict-Transport-Security", strictTransportSecurityHeader);
  }
  res.setHeader("Content-Security-Policy", appContentSecurityPolicy);
  next();
});

app.use(compression({
  filter(req, res) {
    if (String(req.headers.accept || "").includes("text/event-stream")) return false;
    return compression.filter(req, res);
  }
}));

app.use("/api", (_req, res, next) => {
  if (!res.hasHeader("Cache-Control")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

app.use(
  "/api",
  cors((req, callback) => {
    const origin = req.header("Origin");
    const originAllowed = !origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin) || isSameRequestOrigin(req, origin);

    callback(originAllowed ? null : new Error("Origin is not allowed"), {
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-Admin-PIN", "X-Request-ID", "Authorization"],
      origin: originAllowed
    });
  })
);
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(uploadDir, { fallthrough: true, index: false }));
app.get("/uploads/:filename", async (req, res) => {
  const filename = path.basename(req.params.filename);
  const row = await loadFileFromDB(filename);
  if (!row) return res.status(404).json({ message: "Not found" });
  const ext = path.extname(filename).toLowerCase();
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", row.mime_type || "application/octet-stream");
  res.setHeader("Content-Length", row.data.length);
  if (ext === ".pdf") {
    res.setHeader("Content-Disposition", contentDispositionHeader("inline", filename));
  } else if (![".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) {
    res.setHeader("Content-Disposition", contentDispositionHeader("attachment", row.original_name || filename));
  }
  const diskPath = path.join(uploadDir, filename);
  // Write-back to disk asynchronously so we never block the event loop
  if (!fs.existsSync(diskPath)) {
    fs.promises.writeFile(diskPath, row.data).catch(() => {});
  }
  res.send(row.data);
});

const RATE_LIMIT_SKIP_PATHS = new Set([
  "/api/build-stamp",
  "/api/presence/ping",
  "/api/admin/github-sync/status",
  "/api/ready",
]);

app.use(
  "/api",
  createRateLimiter({
    windowMs: 60 * 1000,
    max: Number(process.env.API_RATE_LIMIT_PER_MINUTE) || 600,
    keyPrefix: "api",
    skip: (req) => RATE_LIMIT_SKIP_PATHS.has(req.path),
  })
);

app.use(
  "/api/auth/login",
  createRateLimiter({
    windowMs: 60 * 1000,
    max: Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE) || 20,
    keyPrefix: "auth-login"
  })
);

app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    if (!req.path.startsWith("/api")) return;
    if (res.statusCode < 400 && req.method === "GET") return;
    const requestTarget = redactRequestTarget(req.originalUrl);
    supervisor.logActivity({
      type: "api.request",
      level: res.statusCode >= 400 ? "warning" : "info",
      actor: req.method,
      target: requestTarget,
      message: `${req.method} ${requestTarget} -> ${res.statusCode}`,
      metadata: {
        requestId: req.requestId,
        durationMs: Date.now() - started,
        statusCode: res.statusCode
      }
    });
  });
  next();
});

const requireAdminAccess = (req, res, next) => {
  const pin = req.header("X-Admin-PIN") || req.body?.pin;
  if (enableLegacyAdminPin && pin && pin === adminPin) {
    req.adminUser = { id: "legacy-pin", username: "legacy-pin", role: "admin", sessionId: "pin" };
    return next();
  }
  return auth.requireAdminSession(req, res, next);
};

const documentActor = (req) => ({
  id: req.adminUser?.id || null,
  username: req.adminUser?.username || "admin",
  displayName: req.adminUser?.displayName || req.adminUser?.username || "admin",
  role: req.adminUser?.role || "admin"
});

const SAFETY_REVIEW_ROLES = new Set(["admin", "ehs", "leader", "safety_officer"]);
const SAFETY_ADMIN_ROLES = new Set(["admin", "ehs"]);
const SAFETY_CREATE_ROLES = new Set(["admin", "ehs", "safety_officer"]);

const requireSafetyStore = (req, res, next) => {
  if (!safetyOps) {
    return res.status(503).json({
      message: "Safety operations store is not configured",
      code: "SAFETY_STORE_UNAVAILABLE"
    });
  }
  return next();
};

const requireSafetyArchitectureStore = (req, res, next) => {
  if (!safetyArchitecture) {
    return res.status(503).json({
      message: "Safety architecture store is not configured",
      code: "SAFETY_ARCHITECTURE_STORE_UNAVAILABLE"
    });
  }
  return next();
};

const requireSafetySession = (req, res, next) => auth.requireSession(req, res, () => requireSafetyStore(req, res, next));
const requireSafetyArchitectureSession = (req, res, next) =>
  auth.requireSession(req, res, () => requireSafetyArchitectureStore(req, res, next));

const requireSafetyReviewAccess = (req, res, next) =>
  requireSafetySession(req, res, () => {
    if (!SAFETY_REVIEW_ROLES.has(req.adminUser?.role)) {
      return res.status(403).json({ message: "Safety review permission required", code: "SAFETY_REVIEW_REQUIRED" });
    }
    return next();
  });

const requireSafetyAdminAccess = (req, res, next) =>
  requireSafetySession(req, res, () => {
    if (!SAFETY_ADMIN_ROLES.has(req.adminUser?.role)) {
      return res.status(403).json({ message: "Safety admin permission required", code: "SAFETY_ADMIN_REQUIRED" });
    }
    return next();
  });

const canSeeAllSafety = (user = {}) => SAFETY_ADMIN_ROLES.has(user.role);

const resolveChecklistDepartment = (req, requestedDept = "") => {
  const dept = String(requestedDept || req.adminUser?.departmentId || "company").trim();
  if (canSeeAllSafety(req.adminUser)) {
    return { dept: dept || "company" };
  }

  const userDept = String(req.adminUser?.departmentId || "").trim();
  if (!userDept) {
    return {
      error: {
        status: 403,
        body: {
          message: "Checklist department permission is not configured for this account",
          code: "CHECKLIST_DEPARTMENT_NOT_CONFIGURED"
        }
      }
    };
  }

  if (dept && dept !== userDept) {
    return {
      error: {
        status: 403,
        body: {
          message: "Checklist can only be updated by the assigned department",
          code: "CHECKLIST_DEPARTMENT_FORBIDDEN"
        }
      }
    };
  }

  return { dept: userDept };
};

const scopedSafetyQuery = (req) => {
  const query = { ...req.query };
  if (!canSeeAllSafety(req.adminUser) && !query.dept && !query.department && req.adminUser?.departmentId) {
    query.dept = req.adminUser.departmentId;
  }
  return query;
};

const scopedSafetyArchitectureQuery = (req) => {
  const query = { ...req.query };
  if (!canSeeAllSafety(req.adminUser) && !query.dept && !query.department && !query.departmentCode && req.adminUser?.departmentId) {
    query.dept = req.adminUser.departmentId;
  }
  return query;
};

const safetyActor = (req) => ({
  id: req.adminUser?.id || null,
  username: req.adminUser?.username || "user",
  displayName: req.adminUser?.displayName || req.adminUser?.username || "user",
  role: req.adminUser?.role || "viewer",
  departmentId: req.adminUser?.departmentId || ""
});

const sanitizePreflightAction = (item = {}) => ({
  action: String(item.action || ""),
  name: String(item.name || ""),
  status: String(item.status || "action_required")
});

const readProductionPreflight = () => {
  if (!fs.existsSync(productionPreflightFile)) {
    return {
      available: false,
      blockingActions: [
        {
          action: "Run npm run ops:preflight after npm run verify.",
          name: "preflight-report-missing",
          status: "missing_report"
        }
      ],
      generatedAtUtc: "",
      maintenanceActions: [],
      productionReady: false,
      summary: {
        actionRequired: 1,
        administratorActions: 0,
        blockingActions: 1,
        maintenanceActions: 0,
        missingReports: 1,
        passed: 0,
        total: 1,
        warnings: 0
      },
      warningActions: []
    };
  }

  try {
    const payload = JSON.parse(fs.readFileSync(productionPreflightFile, "utf8").replace(/^\uFEFF/, ""));
    const summary = payload.summary || {};
    return {
      administratorActions: Array.isArray(payload.administratorActions) ? payload.administratorActions.map(sanitizePreflightAction) : [],
      available: true,
      blockingActions: Array.isArray(payload.blockingActions) ? payload.blockingActions.map(sanitizePreflightAction) : [],
      generatedAtUtc: String(payload.generatedAtUtc || ""),
      maintenanceActions: Array.isArray(payload.maintenanceActions) ? payload.maintenanceActions.map(sanitizePreflightAction) : [],
      ok: Boolean(payload.ok),
      productionReady: Boolean(payload.productionReady),
      summary: {
        actionRequired: Number(summary.actionRequired || 0),
        administratorActions: Number(summary.administratorActions || 0),
        blockingActions: Number(summary.blockingActions || 0),
        maintenanceActions: Number(summary.maintenanceActions || 0),
        missingReports: Number(summary.missingReports || 0),
        passed: Number(summary.passed || 0),
        total: Number(summary.total || 0),
        warnings: Number(summary.warnings || 0)
      },
      warningActions: Array.isArray(payload.warningActions) ? payload.warningActions.map(sanitizePreflightAction) : []
    };
  } catch (error) {
    return {
      available: false,
      blockingActions: [
        {
          action: "Run npm run ops:preflight to regenerate the report.",
          name: "preflight-report-invalid",
          status: "missing_report"
        }
      ],
      error: "Preflight report is not readable JSON",
      generatedAtUtc: "",
      maintenanceActions: [],
      productionReady: false,
      summary: {
        actionRequired: 1,
        administratorActions: 0,
        blockingActions: 1,
        maintenanceActions: 0,
        missingReports: 1,
        passed: 0,
        total: 1,
        warnings: 0
      },
      warningActions: []
    };
  }
};

const parseLocalizedBodyField = (value) => {
  if (value === undefined) return undefined;
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!trimmed.startsWith("{")) return trimmed;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
};

const allowedDocumentUpdates = (body = {}, currentDocument = null) => {
  const updates = {};
  ["title", "category", "departmentId", "departmentName", "language", "version"].forEach((key) => {
    if (body[key] !== undefined) updates[key] = String(body[key]).trim();
  });
  if (body.titleI18n !== undefined) {
    updates.titleI18n = parseLocalizedBodyField(body.titleI18n);
  }
  if (body.title !== undefined) {
    updates.title = normalizeDocumentTitleForStorage({
      fallback: currentDocument?.title || currentDocument?.originalName || "Document",
      fileName: currentDocument?.fileName || "",
      originalName: currentDocument?.originalName || "",
      title: body.title
    });
  }
  return updates;
};

const resolveUploadedDocumentPath = (document) => {
  if (!document?.fileName) return "";
  const resolved = path.resolve(uploadDir, document.fileName);
  const root = path.resolve(uploadDir);
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : "";
};

const resolveDocumentFilePath = (document) => {
  const uploaded = resolveUploadedDocumentPath(document);
  if (uploaded) return uploaded;
  if (!document?.sourcePath) return "";
  const sourceRoot = path.resolve(rootDir, "tai lieu");
  const resolved = path.resolve(rootDir, document.sourcePath);
  return resolved === sourceRoot || resolved.startsWith(`${sourceRoot}${path.sep}`) ? resolved : "";
};

const ensureDocumentPreview = async (document, { force = false } = {}) => {
  if (!document?.fileName || !previewService.isPreviewable(document)) return document;
  const sourcePath = resolveUploadedDocumentPath(document);
  const now = new Date().toISOString();
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    const updates = {
      previewStatus: "missing_source",
      previewError: "Document file not found",
      previewGeneratedAt: now
    };
    return (await core.updateDocument(document.id, updates)) || { ...document, ...updates };
  }

  const currentPreviewPath = previewService.previewPathFor(document);
  if (!force && document.previewStatus === "ready" && currentPreviewPath && fs.existsSync(currentPreviewPath)) {
    return document;
  }

  const preview = await previewService.createPreview({ document, sourcePath, force });
  return (await core.updateDocument(document.id, preview)) || { ...document, ...preview };
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "Company Utility Hub API" });
});

app.get("/api/auth/me", (req, res) => auth.me(req, res));

app.patch("/api/auth/me", (req, res) => auth.updateMe(req, res));

app.post("/api/auth/change-password", (req, res) => auth.changePasswordSelf(req, res));

app.post("/api/auth/login", (req, res) => auth.login(req, res));

app.post("/api/auth/logout", (req, res) => auth.logout(req, res));

app.get("/api/admin/users", requireAdminAccess, async (_req, res) => {
  try {
    const users = await auth.listUsers();
    res.json({ data: users });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/admin/users", requireAdminAccess, async (req, res) => {
  try {
    const user = await auth.createUser(req.body);
    supervisor.logActivity({ type: "user.created", message: `Tạo tài khoản: ${user.username}`, actor: req.adminUser?.username || "admin", target: user.username });
    res.json({ data: user });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.put("/api/admin/users/:id", requireAdminAccess, async (req, res) => {
  try {
    const user = await auth.updateUser(req.params.id, req.body);
    supervisor.logActivity({ type: "user.updated", message: `Cập nhật tài khoản: ${user.username}`, actor: req.adminUser?.username || "admin", target: user.username });
    res.json({ data: user });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.post("/api/admin/users/:id/reset-password", requireAdminAccess, async (req, res) => {
  try {
    await auth.resetPassword(req.params.id, req.body?.password);
    supervisor.logActivity({ type: "user.password_reset", message: `Đặt lại mật khẩu tài khoản ID: ${req.params.id}`, actor: req.adminUser?.username || "admin", target: req.params.id });
    res.json({ data: { ok: true } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.delete("/api/admin/users/:id", requireAdminAccess, async (req, res) => {
  try {
    await auth.deleteUser(req.params.id, req.adminUser?.id);
    supervisor.logActivity({ type: "user.deleted", message: `Xóa tài khoản ID: ${req.params.id}`, actor: req.adminUser?.username || "admin", target: req.params.id });
    res.json({ data: { ok: true } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/ready", async (_req, res) => {
  const documentCount = await core.getDocumentCount();
  const status = supervisor.getStatus({
    summary: await core.getSafetySummary(),
    config: await core.readConfig(),
    documentCount,
    environment: {
      appEnv,
      allowedOrigins,
      maxUploadMb,
      activityLogLimit,
      documentPreview: previewService.getConverterStatus(),
      trustProxy,
      enableLegacyAdminPin,
      usesDefaultAdminPin,
      usesPlaceholderAdminPassword
    }
  });
  res.status(status.readiness.ready ? 200 : 503).json({ ...status.readiness, startTime: SERVER_START_TIME });
});

app.get("/api/config", async (_req, res) => {
  res.json(await core.readConfig());
});

app.put("/api/config", requireAdminAccess, async (req, res) => {
  supervisor.createBackup("before-config-update");
  const saved = await core.writeConfig(req.body, req.adminUser?.username || "admin");
  supervisor.logActivity({
    type: "config.updated",
    message: "System configuration updated",
    actor: req.adminUser?.username || "admin",
    target: "config"
  });
  res.json(saved);
});

// ── App Settings: Logo ────────────────────────────────────────────────────────
const logoExtensions = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"];
const logoMimeTypes = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

function findLogoFile() {
  for (const ext of logoExtensions) {
    const p = path.join(dataDir, `app-logo${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function deleteExistingLogo() {
  for (const ext of logoExtensions) {
    const p = path.join(dataDir, `app-logo${ext}`);
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
}

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dataDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `app-logo${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, logoExtensions.includes(ext));
  }
});

app.get("/api/app-settings", (_req, res) => {
  const logoFile = findLogoFile();
  res.json({ hasLogo: Boolean(logoFile), logoUrl: logoFile ? "/api/app-settings/logo" : null });
});

app.get("/api/app-settings/logo", (_req, res) => {
  const logoFile = findLogoFile();
  if (!logoFile) return res.status(404).json({ message: "Chưa có logo" });
  const ext = path.extname(logoFile).toLowerCase();
  res.setHeader("Content-Type", logoMimeTypes[ext] || "application/octet-stream");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(logoFile);
});

app.post("/api/app-settings/logo", requireAdminAccess, (req, res, next) => {
  deleteExistingLogo();
  logoUpload.single("logo")(req, res, next);
}, (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Không có file logo được gửi lên" });
  supervisor.logActivity({ type: "settings.logo.updated", message: "Logo công ty đã được cập nhật", actor: req.adminUser?.username || "admin", target: "app-logo" });
  res.json({ success: true, logoUrl: "/api/app-settings/logo" });
});

app.delete("/api/app-settings/logo", requireAdminAccess, (_req, res) => {
  const logoFile = findLogoFile();
  if (!logoFile) return res.status(404).json({ message: "Không có logo để xóa" });
  fs.unlinkSync(logoFile);
  supervisor.logActivity({ type: "settings.logo.deleted", message: "Logo công ty đã được xóa", actor: _req.adminUser?.username || "admin", target: "app-logo" });
  res.json({ success: true });
});
// ─────────────────────────────────────────────────────────────────────────────

const safetyReferenceCatalog = Object.freeze({
  formulas: [
    {
      id: "risk-score",
      title: "Điểm rủi ro cảnh báo",
      expression: "riskScore = riskProbability x riskConsequence",
      description: "Ma trận 5x5 dùng trong modal Cảnh Báo Nóng. Giá trị xác suất và hậu quả đều nằm trong thang 1 đến 5.",
      icon: "Calculator",
      notes: ["1-3: LOW", "4-8: MEDIUM", "9-15: HIGH", "16-25: CRITICAL"]
    },
    {
      id: "risk-deadline",
      title: "Hạn xử lý theo rủi ro",
      expression: "deadlineDays = 1 / 7 / 30 / 90 theo cấp rủi ro",
      description: "Cảnh báo càng nghiêm trọng càng cần hạn xử lý ngắn hơn khi người dùng chưa nhập hạn riêng.",
      icon: "AlertTriangle",
      notes: ["CRITICAL: 1 ngày", "HIGH: 7 ngày", "MEDIUM: 30 ngày", "LOW: 90 ngày"]
    },
    {
      id: "checklist-score",
      title: "Điểm checklist 6S",
      expression: "score = round(checkedCount / totalCount x 100)",
      description: "Dùng cho checklist bộ phận và vòng 6S theo pillar trên dashboard.",
      icon: "ClipboardCheck",
      notes: ["Tốt: từ 80%", "Cần cải thiện: 60-79%", "Yếu - ưu tiên: dưới 60%"]
    },
    {
      id: "kpi-target",
      title: "Đạt mục tiêu KPI",
      expression: "metTarget = value >= target; violation_warning dùng value <= target",
      description: "Các KPI tích cực cần đạt hoặc vượt mục tiêu; KPI vi phạm/cảnh báo cần bằng hoặc thấp hơn mục tiêu.",
      icon: "Target",
      notes: ["Điểm an toàn, checklist, đào tạo: càng cao càng tốt", "Vi phạm / cảnh báo: càng thấp càng tốt"]
    },
    {
      id: "kpi-approval",
      title: "Luồng duyệt KPI hai cấp",
      expression: "pending_l1 -> pending_l2 -> approved | rejected",
      description: "Quản lý bộ phận duyệt cấp 1, EHS/admin xác nhận cấp 2 hoặc từ chối kèm lý do.",
      icon: "Workflow",
      notes: ["pending_l1: chờ quản lý", "pending_l2: chờ EHS", "approved/rejected: trạng thái cuối"]
    },
    {
      id: "training-rate",
      title: "Tỷ lệ hoàn thành đào tạo",
      expression: "completionRate = round(completed / enrolled x 100)",
      description: "Dùng trên trang Đào Tạo để theo dõi số người đã hoàn thành so với số được giao.",
      icon: "GraduationCap",
      notes: ["Nếu enrolled = 0 thì hiển thị 0%", "Số liệu lấy từ /api/training-courses"]
    },
    {
      id: "safety-average",
      title: "Điểm an toàn kỳ mới nhất",
      expression: "averageSafety = round(sum(approved safety_score_monthly) / count)",
      description: "Trang KPI lấy các bản ghi đã duyệt của loại safety_score_monthly để tính điểm trung bình theo kỳ.",
      icon: "BadgeCheck",
      notes: ["Mục tiêu điều hành hiện tại: 95", "Chỉ tính bản ghi đã duyệt"]
    },
    {
      id: "audit-score",
      title: "Điểm audit 6S",
      expression: "scorePercent = round(totalScore / maxScore x 100)",
      description: "Tính từ câu hỏi audit theo template EHS-QT-11/EHS-QT-12, dùng cho cấp EHS và bộ phận.",
      icon: "ClipboardCheck",
      notes: [">= 90: tốt", "80-89: cần theo dõi", "< 80: tạo CAPA"]
    },
    {
      id: "action-on-time",
      title: "Tỷ lệ CAPA đúng hạn",
      expression: "onTimeRate = closedBeforeDue / closedActions x 100",
      description: "Theo dõi hành động khắc phục phát sinh từ cảnh báo, sự cố hoặc audit 6S.",
      icon: "Workflow",
      notes: ["done_by_owner cần EHS verify", "reopened quay lại người phụ trách"]
    }
  ],
  routes: [
    { label: "Tổng Quan", path: "/safety-6s", icon: "LayoutDashboard", page: "DashboardPage", api: ["/api/warnings", "/api/incidents", "/api/kpi-entries", "/api/checklists/pillar-summary"] },
    { label: "Cảnh Báo Nóng", path: "/safety-6s/warnings", icon: "AlertTriangle", page: "WarningsPage", api: ["/api/warnings", "/api/warnings/:id/approve", "/api/warnings/:id/reject"] },
    { label: "Báo Cáo Sự Cố", path: "/safety-6s/incidents", icon: "ShieldAlert", page: "IncidentsPage", api: ["/api/incidents", "/api/incidents/:id/approve", "/api/incidents/:id/reject"] },
    { label: "Checklist 6S", path: "/safety-6s/checklist", icon: "ClipboardCheck", page: "SafetyChecklistPage", api: ["/api/checklists", "/api/checklists/summary", "/api/checklists/pillar-summary"] },
    { label: "Audit 6S", path: "/safety-6s/audits", icon: "ClipboardCheck", page: "SafetyAuditsPage", api: ["/api/audits", "/api/audit-templates", "/api/audits/:id/submit", "/api/audits/:id/review"] },
    { label: "CAPA", path: "/safety-6s/actions", icon: "Workflow", page: "SafetyActionsPage", api: ["/api/actions", "/api/actions/:id/submit-evidence", "/api/actions/:id/verify"] },
    { label: "Khu Vực / QR", path: "/safety-6s/locations", icon: "MapPin", page: "SafetyLocationsPage", api: ["/api/locations", "/api/qr/:code"] },
    { label: "KYT", path: "/safety-6s/kyt", icon: "Target", page: "SafetySpecialProgramPage kyt", api: ["/api/safety/programs/kyt"] },
    { label: "PCCC & An Toàn Điện", path: "/safety-6s/pccc", icon: "Flame", page: "SafetySpecialProgramPage pccc", api: ["/api/safety/programs/pccc"] },
    { label: "Y Tế / Túi Sơ Cứu", path: "/safety-6s/medical", icon: "BriefcaseMedical", page: "SafetySpecialProgramPage medical", api: ["/api/safety/programs/medical"] },
    { label: "Tự Kiểm Tra ATVSLĐ", path: "/safety-6s/self-inspection", icon: "ListChecks", page: "SafetySpecialProgramPage self-inspection", api: ["/api/safety/programs/self-inspection"] },
    { label: "KPI & Mục Tiêu", path: "/safety-6s/kpi", icon: "Target", page: "SafetyKpiPage", api: ["/api/kpi-entries", "/api/kpi-entries/:id/history"] },
    { label: "Nhập Liệu KPI", path: "/safety-6s/data-entry", icon: "Upload", page: "SafetyDataEntryPage", api: ["/api/kpi-entries"] },
    { label: "Phê Duyệt KPI", path: "/safety-6s/approval", icon: "CheckCircle2", page: "SafetyKpiPage approvalOnly", api: ["/api/kpi-entries/:id/approve-l1", "/api/kpi-entries/:id/approve-l2", "/api/kpi-entries/:id/reject-l1", "/api/kpi-entries/:id/reject-l2"] },
    { label: "Tài Liệu", path: "/safety-6s/documents", icon: "FileText", page: "SafetyDocumentsPage", api: ["/api/documents"] },
    { label: "Báo Cáo", path: "/safety-6s/reports", icon: "FileBarChart", page: "SafetyReportsPage", api: ["/api/reports"] },
    { label: "Đào Tạo", path: "/safety-6s/training", icon: "GraduationCap", page: "SafetyTrainingPage", api: ["/api/training-courses"] },
    { label: "Tham Chiếu", path: "/safety-6s/reference", icon: "BookOpen", page: "SafetyReferencePage", api: ["/api/safety/reference"] },
    { label: "Cài Đặt", path: "/safety-6s/settings", icon: "Settings", page: "SafetySettingsPage", api: ["/api/config"] }
  ],
  modals: [
    {
      title: "Thêm Cảnh Báo An Toàn Mới",
      icon: "ShieldAlert",
      route: "/safety-6s/warnings",
      sections: ["Tiêu đề & danh mục", "Vị trí phát hiện", "Đánh giá rủi ro", "Mô tả & biện pháp", "Phân công & bằng chứng", "Tệp đính kèm"],
      primaryAction: "Gửi cảnh báo"
    },
    {
      title: "Lý Do Từ Chối Cảnh Báo",
      icon: "XCircle",
      route: "/safety-6s/warnings",
      sections: ["Cảnh báo", "Lý do từ chối", "Người review"],
      primaryAction: "Xác nhận từ chối cảnh báo"
    },
    {
      title: "Báo Cáo Sự Cố Mới",
      icon: "ShieldAlert",
      route: "/safety-6s/incidents",
      sections: ["Thời gian & vị trí", "Phân loại & mức độ", "Mô tả & nguyên nhân", "Thương vong & thiệt hại", "Hành động & liên hệ"],
      primaryAction: "Gửi báo cáo"
    },
    {
      title: "Lý Do Từ Chối Sự Cố",
      icon: "XCircle",
      route: "/safety-6s/incidents",
      sections: ["Sự cố", "Lý do từ chối", "Người review"],
      primaryAction: "Xác nhận từ chối sự cố"
    },
    {
      title: "Nhập KPI Mới",
      icon: "Upload",
      route: "/safety-6s/data-entry",
      sections: ["Loại chỉ số KPI", "Kỳ & bộ phận", "Giá trị & ghi chú", "Công thức & API"],
      primaryAction: "Nộp dữ liệu KPI"
    },
    {
      title: "Lý Do Từ Chối KPI",
      icon: "XCircle",
      route: "/safety-6s/approval",
      sections: ["Bản ghi KPI", "Lý do từ chối", "Cấp duyệt"],
      primaryAction: "Xác nhận từ chối"
    },
    {
      title: "Chi Tiết KPI",
      icon: "Eye",
      route: "/safety-6s/kpi",
      sections: ["Tổng quan KPI", "Giá trị & mục tiêu", "Ghi chú & lý do", "Mốc phê duyệt", "Lịch sử phê duyệt"],
      primaryAction: "Xem chi tiết"
    },
    {
      title: "Tạo Báo Cáo Mới",
      icon: "FileBarChart",
      route: "/safety-6s/reports",
      sections: ["Thông tin báo cáo", "Người lập & ghi chú"],
      primaryAction: "Lưu báo cáo"
    },
    {
      title: "Thêm Khóa Đào Tạo",
      icon: "GraduationCap",
      route: "/safety-6s/training",
      sections: ["Thông tin khóa", "Lịch & đối tượng"],
      primaryAction: "Lưu khóa đào tạo"
    }
  ],
  icons: [
    { group: "Navigation", icon: "LayoutDashboard", label: "Tổng Quan", usage: "Điểm vào dashboard Safety - 6S", route: "/safety-6s" },
    { group: "Navigation", icon: "AlertTriangle", label: "Cảnh Báo Nóng", usage: "Trang rủi ro/cảnh báo theo ma trận 5x5", route: "/safety-6s/warnings" },
    { group: "Navigation", icon: "ShieldAlert", label: "Báo Cáo Sự Cố", usage: "Trang điều tra sự cố, root cause và hành động", route: "/safety-6s/incidents" },
    { group: "Navigation", icon: "ClipboardCheck", label: "Checklist 6S", usage: "Checklist theo bộ phận/kỳ", route: "/safety-6s/checklist" },
    { group: "Navigation", icon: "ClipboardCheck", label: "Audit 6S", usage: "Lập lịch, chấm điểm và review audit 6S", route: "/safety-6s/audits" },
    { group: "Navigation", icon: "Workflow", label: "CAPA", usage: "Theo dõi hành động khắc phục/phòng ngừa", route: "/safety-6s/actions" },
    { group: "Navigation", icon: "MapPin", label: "Khu vực / QR", usage: "Quản lý khu vực, điểm QR và phạm vi bộ phận", route: "/safety-6s/locations" },
    { group: "Navigation", icon: "Target", label: "KYT", usage: "Lường trước nguy hiểm theo Step 1/Step 2 và mục tiêu hành động", route: "/safety-6s/kyt" },
    { group: "Navigation", icon: "Flame", label: "PCCC & An toàn điện", usage: "Kiểm tra PCCC, điện, lối thoát hiểm và bằng chứng khắc phục", route: "/safety-6s/pccc" },
    { group: "Navigation", icon: "BriefcaseMedical", label: "Y tế / Túi sơ cứu", usage: "Theo dõi phòng y tế, túi sơ cứu, vật tư và nhu cầu mua", route: "/safety-6s/medical" },
    { group: "Navigation", icon: "ListChecks", label: "Tự kiểm tra ATVSLĐ", usage: "Biên bản tự kiểm tra, đoàn kiểm tra, kết luận và CAPA", route: "/safety-6s/self-inspection" },
    { group: "Navigation", icon: "Target", label: "KPI & Mục Tiêu", usage: "Theo dõi KPI, mục tiêu và trạng thái duyệt", route: "/safety-6s/kpi" },
    { group: "Navigation", icon: "Upload", label: "Nhập Liệu KPI", usage: "Gửi bản ghi KPI mới", route: "/safety-6s/data-entry" },
    { group: "Navigation", icon: "CheckCircle2", label: "Phê Duyệt KPI", usage: "Duyệt KPI cấp QL/EHS", route: "/safety-6s/approval" },
    { group: "Navigation", icon: "FileText", label: "Tài Liệu", usage: "Liên kết thư viện tài liệu Safety", route: "/safety-6s/documents" },
    { group: "Navigation", icon: "FileBarChart", label: "Báo Cáo", usage: "Tạo và xem báo cáo Safety - 6S", route: "/safety-6s/reports" },
    { group: "Navigation", icon: "GraduationCap", label: "Đào Tạo", usage: "Theo dõi khóa đào tạo an toàn", route: "/safety-6s/training" },
    { group: "Navigation", icon: "BookOpen", label: "Tham Chiếu", usage: "Công thức, API, route, modal và icon", route: "/safety-6s/reference" },
    { group: "Navigation", icon: "Settings", label: "Cài Đặt", usage: "Thông tin cấu hình Safety", route: "/safety-6s/settings" },
    { group: "Action", icon: "Plus", label: "Tạo mới", usage: "Mở modal thêm cảnh báo, sự cố, báo cáo, đào tạo" },
    { group: "Action", icon: "Send", label: "Gửi/Nộp", usage: "Gửi cảnh báo, sự cố hoặc KPI" },
    { group: "Action", icon: "Loader2", label: "Đang xử lý", usage: "Spinner khi submit/create/reject đang pending" },
    { group: "Action", icon: "Eye", label: "Chi tiết", usage: "Mở khối details của cảnh báo/sự cố" },
    { group: "Action", icon: "Upload", label: "Đính kèm", usage: "Chọn tệp bằng chứng trong modal cảnh báo" },
    { group: "Action", icon: "XCircle", label: "Từ chối", usage: "Modal nhập lý do từ chối cảnh báo, sự cố, KPI" },
    { group: "Formula", icon: "Calculator", label: "Công thức", usage: "Điểm rủi ro và phép tính vận hành" },
    { group: "Formula", icon: "Sigma", label: "Tổng hợp", usage: "Danh sách công thức trên trang tham chiếu" },
    { group: "Data", icon: "Database", label: "API", usage: "Bảng endpoint Safety - 6S" },
    { group: "Data", icon: "Workflow", label: "Luồng", usage: "Luồng duyệt và modal liên quan" },
    { group: "Data", icon: "ExternalLink", label: "Link", usage: "Mở route phụ từ trang tham chiếu" }
  ],
  endpoints: [
    { method: "GET", path: "/api/safety/reference", module: "Reference", purpose: "Trả về công thức, route, modal, icon và endpoint Safety - 6S", auth: "Safety session" },
    { method: "GET", path: "/api/safety/architecture", module: "Architecture", purpose: "Tóm tắt 3 cấp công ty/EHS/bộ phận, tài liệu, audit và CAPA", auth: "Safety session" },
    { method: "GET", path: "/api/safety/document-architecture", module: "Architecture", purpose: "Mapping tài liệu ATVSLĐ - 6S đã index sang cấp công ty/EHS/bộ phận và module web đề xuất", auth: "Safety session" },
    { method: "GET", path: "/api/safety/programs", module: "Special Programs", purpose: "Danh sách chương trình chuyên đề KYT/PCCC/Y tế/Tự kiểm tra", auth: "Safety session" },
    { method: "GET", path: "/api/safety/programs/:id", module: "Special Programs", purpose: "Dữ liệu trang chuyên đề gồm tài liệu gốc, workflow, checklist, records và chart", auth: "Safety session" },
    { method: "GET", path: "/api/safety/departments", module: "Architecture", purpose: "Master 24 bộ phận Safety", auth: "Safety session" },
    { method: "POST", path: "/api/documents/import-manifest", module: "Documents", purpose: "Import tài liệu trong tai lieu, tạo metadata và text index", auth: "EHS/Admin" },
    { method: "GET", path: "/api/documents/:id/text", module: "Documents", purpose: "Đọc text chunks/OCR status của tài liệu Safety", auth: "Safety session" },
    { method: "POST", path: "/api/documents/:id/ocr", module: "Documents", purpose: "Chạy lại trích xuất text hoặc đưa PDF scan vào hàng OCR", auth: "EHS/Admin" },
    { method: "GET", path: "/api/audit-templates", module: "Audit", purpose: "Danh sách template và câu hỏi audit 6S", auth: "Safety session" },
    { method: "POST", path: "/api/audits", module: "Audit", purpose: "Tạo audit 6S theo bộ phận/khu vực", auth: "Safety session" },
    { method: "PATCH", path: "/api/audits/:id", module: "Audit", purpose: "Cập nhật câu trả lời, điểm và finding", auth: "Safety session" },
    { method: "POST", path: "/api/audits/:id/submit", module: "Audit", purpose: "Nộp audit và tự tạo CAPA từ điểm lỗi", auth: "Safety session" },
    { method: "POST", path: "/api/audits/:id/review", module: "Audit", purpose: "EHS review audit", auth: "EHS/Admin" },
    { method: "GET", path: "/api/actions", module: "CAPA", purpose: "Danh sách hành động khắc phục/phòng ngừa", auth: "Safety session" },
    { method: "POST", path: "/api/actions", module: "CAPA", purpose: "Tạo CAPA thủ công hoặc từ cảnh báo/sự cố/audit", auth: "Safety session" },
    { method: "PATCH", path: "/api/actions/:id", module: "CAPA", purpose: "Cập nhật owner, hạn xử lý, trạng thái", auth: "Safety session" },
    { method: "POST", path: "/api/actions/:id/submit-evidence", module: "CAPA", purpose: "Người phụ trách gửi bằng chứng hoàn thành", auth: "Safety session" },
    { method: "POST", path: "/api/actions/:id/verify", module: "CAPA", purpose: "EHS xác minh đóng/mở lại CAPA", auth: "EHS/Admin" },
    { method: "GET", path: "/api/locations", module: "Locations", purpose: "Danh sách khu vực/QR theo bộ phận", auth: "Safety session" },
    { method: "POST", path: "/api/locations", module: "Locations", purpose: "Tạo khu vực hoặc mã QR Safety", auth: "Safety session" },
    { method: "GET", path: "/api/qr/:code", module: "Locations", purpose: "Tra cứu khu vực từ mã QR", auth: "Safety session" },
    { method: "GET", path: "/api/warnings", module: "Warnings", purpose: "Danh sách cảnh báo theo quyền/bộ phận", auth: "Safety session" },
    { method: "POST", path: "/api/warnings", module: "Warnings", purpose: "Tạo cảnh báo mới từ modal Cảnh Báo Nóng", auth: "Safety session" },
    { method: "PUT", path: "/api/warnings/:id", module: "Warnings", purpose: "Cập nhật cảnh báo", auth: "Safety session" },
    { method: "POST", path: "/api/warnings/:id/approve", module: "Warnings", purpose: "Duyệt cảnh báo", auth: "Reviewer/EHS" },
    { method: "POST", path: "/api/warnings/:id/reject", module: "Warnings", purpose: "Từ chối cảnh báo kèm lý do", auth: "Reviewer/EHS" },
    { method: "GET", path: "/api/incidents", module: "Incidents", purpose: "Danh sách sự cố", auth: "Safety session" },
    { method: "POST", path: "/api/incidents", module: "Incidents", purpose: "Tạo báo cáo sự cố mới", auth: "Safety session" },
    { method: "PUT", path: "/api/incidents/:id", module: "Incidents", purpose: "Cập nhật sự cố", auth: "Safety session" },
    { method: "POST", path: "/api/incidents/:id/approve", module: "Incidents", purpose: "Duyệt điều tra sự cố", auth: "Reviewer/EHS" },
    { method: "POST", path: "/api/incidents/:id/reject", module: "Incidents", purpose: "Từ chối điều tra sự cố kèm lý do", auth: "Reviewer/EHS" },
    { method: "GET", path: "/api/incidents/:id/attachments", module: "Incidents", purpose: "Lấy tệp đính kèm sự cố", auth: "Safety session" },
    { method: "GET", path: "/api/kpi-entries", module: "KPI", purpose: "Danh sách bản ghi KPI", auth: "Safety session" },
    { method: "POST", path: "/api/kpi-entries", module: "KPI", purpose: "Nộp dữ liệu KPI", auth: "Safety session" },
    { method: "GET", path: "/api/kpi-entries/:id/history", module: "KPI", purpose: "Lịch sử duyệt KPI", auth: "Safety session" },
    { method: "POST", path: "/api/kpi-entries/:id/approve-l1", module: "KPI", purpose: "Quản lý bộ phận duyệt cấp 1", auth: "Reviewer/Leader" },
    { method: "POST", path: "/api/kpi-entries/:id/approve-l2", module: "KPI", purpose: "EHS/admin duyệt cấp 2", auth: "EHS/Admin" },
    { method: "POST", path: "/api/kpi-entries/:id/reject-l1", module: "KPI", purpose: "Từ chối KPI cấp 1 kèm lý do", auth: "Reviewer/Leader" },
    { method: "POST", path: "/api/kpi-entries/:id/reject-l2", module: "KPI", purpose: "Từ chối KPI cấp 2 kèm lý do", auth: "EHS/Admin" },
    { method: "GET", path: "/api/checklists", module: "Checklist", purpose: "Lấy checklist theo bộ phận/kỳ", auth: "Safety session" },
    { method: "POST", path: "/api/checklists", module: "Checklist", purpose: "Lưu checklist 6S", auth: "Safety session" },
    { method: "GET", path: "/api/checklists/template", module: "Checklist", purpose: "Lấy template biểu kiểm tra 6S hàng ngày", auth: "Safety session" },
    { method: "GET", path: "/api/checklists/summary", module: "Checklist", purpose: "Tổng hợp điểm checklist", auth: "Safety session" },
    { method: "GET", path: "/api/checklists/pillar-summary", module: "Checklist", purpose: "Tổng hợp 6 pillar cho dashboard 6S", auth: "Safety session" },
    { method: "GET", path: "/api/reports", module: "Reports", purpose: "Danh sách báo cáo Safety - 6S", auth: "Safety session" },
    { method: "POST", path: "/api/reports", module: "Reports", purpose: "Tạo báo cáo mới", auth: "Safety session" },
    { method: "PUT", path: "/api/reports/:id", module: "Reports", purpose: "Cập nhật báo cáo", auth: "Safety session" },
    { method: "DELETE", path: "/api/reports/:id", module: "Reports", purpose: "Xóa mềm báo cáo", auth: "Safety session" },
    { method: "GET", path: "/api/training-courses", module: "Training", purpose: "Danh sách khóa đào tạo", auth: "Safety session" },
    { method: "POST", path: "/api/training-courses", module: "Training", purpose: "Tạo khóa đào tạo", auth: "EHS/Admin" },
    { method: "PUT", path: "/api/training-courses/:id", module: "Training", purpose: "Cập nhật khóa đào tạo", auth: "EHS/Admin" },
    { method: "DELETE", path: "/api/training-courses/:id", module: "Training", purpose: "Xóa mềm khóa đào tạo", auth: "EHS/Admin" },
    { method: "GET", path: "/api/documents", module: "Documents", purpose: "Tài liệu Safety trong thư viện MHChub", auth: "Public/list policy hiện tại" }
  ]
});

app.get("/api/safety/summary", async (_req, res) => {
  res.json(await core.getSafetySummary());
});

app.get("/api/safety/score", requireSafetySession, async (req, res) => {
  try {
    const period = String(req.query.period || new Date().toISOString().slice(0, 7));
    const result = await computeSafetyScores(period, safetyOps);
    res.json(result);
  } catch (err) {
    console.error("[safety-score]", err);
    res.status(500).json({ error: "Không tính được điểm an toàn." });
  }
});

app.get("/api/safety/score/export.xlsx", requireSafetySession, async (req, res) => {
  try {
    const period = String(req.query.period || new Date().toISOString().slice(0, 7));
    const scoreResult = await computeSafetyScores(period, safetyOps);
    const buf = await generateSafetyScoreExcel(scoreResult, safetyOps);
    const filename = `BaoCaoAnToan_${period}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buf);
  } catch (err) {
    console.error("[safety-score-export]", err);
    res.status(500).json({ error: "Không xuất được file Excel." });
  }
});

app.post("/api/safety/dept-report/export.xlsx", requireSafetySession, async (req, res) => {
  try {
    const { reportData, tab, year } = req.body;
    const buf = await generateDeptReportExcel(reportData, tab, year);
    const scope = tab === "dept" ? (reportData?.dept || "BoPhan") : "CongTy";
    const filename = `BaoCaoAnToan_${scope}_${year || "all"}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buf);
  } catch (err) {
    console.error("[dept-report-export]", err);
    res.status(500).json({ error: "Không xuất được file Excel." });
  }
});

app.get("/api/safety/reference", requireSafetySession, async (_req, res) => {
  res.json({ ...safetyReferenceCatalog, generatedAt: new Date().toISOString() });
});

app.get("/api/safety/architecture", requireSafetyArchitectureSession, async (_req, res) => {
  res.json(await safetyArchitecture.architectureSummary());
});

app.get("/api/safety/document-architecture", requireSafetyArchitectureSession, async (_req, res) => {
  res.json(await safetyArchitecture.documentArchitecture());
});

app.get("/api/safety/programs", requireSafetyArchitectureSession, async (_req, res) => {
  res.json(await safetyArchitecture.listSafetyPrograms());
});

app.get("/api/safety/programs/:id", requireSafetyArchitectureSession, async (req, res) => {
  const program = await safetyArchitecture.safetyProgram(req.params.id);
  if (!program) {
    return res.status(404).json({ message: "Không tìm thấy chương trình Safety." });
  }
  res.json(program);
});

app.get("/api/safety/divisions", requireSafetyArchitectureSession, async (_req, res) => {
  res.json(await safetyArchitecture.listDivisions());
});

app.get("/api/safety/departments", requireSafetyArchitectureSession, async (_req, res) => {
  res.json(await safetyArchitecture.listDepartments());
});

app.get("/api/risk-register", requireSafetyArchitectureSession, async (req, res) => {
  res.json(await safetyArchitecture.riskRegister(scopedSafetyArchitectureQuery(req)));
});

app.post("/api/documents/import-manifest", requireSafetyAdminAccess, requireSafetyArchitectureStore, async (req, res) => {
  const result = await safetyArchitecture.importDocumentManifest(req.body || {}, safetyActor(req));
  supervisor.logActivity({
    type: "safety-documents.imported",
    actor: req.adminUser?.username || "user",
    target: "tai-lieu",
    message: `Safety documents import: ${result.stats.imported} files`
  });
  res.status(req.body?.dryRun ? 200 : 201).json(result);
});

app.get("/api/documents/:id/text", requireSafetyArchitectureSession, async (req, res) => {
  const payload = await safetyArchitecture.getDocumentText(req.params.id);
  if (!payload) return res.status(404).json({ message: "Document text not found" });
  res.json(payload);
});

app.post("/api/documents/:id/ocr", requireSafetyAdminAccess, requireSafetyArchitectureStore, async (req, res) => {
  const payload = await safetyArchitecture.runDocumentOcr(req.params.id, safetyActor(req), {
    ...req.query,
    ...(req.body || {})
  });
  if (!payload) return res.status(404).json({ message: "Document not found" });
  res.json(payload);
});

app.get("/api/audit-templates", requireSafetyArchitectureSession, async (_req, res) => {
  res.json(await safetyArchitecture.listAuditTemplates());
});

app.post("/api/audit-templates", requireSafetyAdminAccess, requireSafetyArchitectureStore, async (req, res) => {
  res.status(201).json(await safetyArchitecture.createAuditTemplate(req.body || {}, safetyActor(req)));
});

app.put("/api/audit-templates/:id", requireSafetyAdminAccess, requireSafetyArchitectureStore, async (req, res) => {
  const updated = await safetyArchitecture.updateAuditTemplate(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Audit template not found" });
  res.json(updated);
});

app.get("/api/audits", requireSafetyArchitectureSession, async (req, res) => {
  res.json(await safetyArchitecture.listAudits(scopedSafetyArchitectureQuery(req)));
});

app.post("/api/audits", requireSafetyArchitectureSession, async (req, res) => {
  res.status(201).json(await safetyArchitecture.createAudit(req.body || {}, safetyActor(req)));
});

app.patch("/api/audits/:id", requireSafetyArchitectureSession, async (req, res) => {
  const updated = await safetyArchitecture.updateAudit(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Audit not found" });
  res.json(updated);
});

app.post("/api/audits/:id/submit", requireSafetyArchitectureSession, async (req, res) => {
  const updated = await safetyArchitecture.submitAudit(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Audit not found" });
  res.json(updated);
});

app.post("/api/audits/:id/review", requireSafetyAdminAccess, requireSafetyArchitectureStore, async (req, res) => {
  const updated = await safetyArchitecture.reviewAudit(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Audit not found" });
  res.json(updated);
});

app.get("/api/actions", requireSafetyArchitectureSession, async (req, res) => {
  const [actions, commentCounts] = await Promise.all([
    safetyArchitecture.listActions(scopedSafetyArchitectureQuery(req)),
    typeof safetyArchitecture.getActionCommentCounts === "function"
      ? safetyArchitecture.getActionCommentCounts().catch(() => ({}))
      : Promise.resolve({}),
  ]);
  const list = Array.isArray(actions) ? actions : [];
  res.json(list.map((a) => ({ ...a, commentCount: commentCounts[a.id] || 0 })));
});
app.get("/api/actions/pending-count", requireSafetyAdminAccess, requireSafetyArchitectureStore, async (req, res) => {
  const all = await safetyArchitecture.listActions({});
  const pending = Array.isArray(all) ? all.filter((a) => a.status === "draft").length : 0;
  res.json({ count: pending });
});
app.get("/api/actions/export.csv", requireSafetyArchitectureSession, async (req, res) => {
  const csv = await safetyArchitecture.exportActionsCsv(req.query);
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="bao-cao-capa-${date}.csv"`);
  res.send("\uFEFF" + csv);
});
app.get("/api/actions/:id", requireSafetyArchitectureSession, async (req, res) => {
  const action = await safetyArchitecture.getAction(req.params.id);
  if (!action) return res.status(404).json({ message: "CAPA not found" });
  res.json(action);
});

app.post("/api/actions", requireSafetyArchitectureSession, async (req, res) => {
  const created = await safetyArchitecture.createAction(req.body || {}, safetyActor(req));
  emitNotificationChange({ type: "capa", action: "created", capaId: created?.id, code: created?.code });
  res.status(201).json(created);
});

app.patch("/api/actions/:id", requireSafetyArchitectureSession, async (req, res) => {
  const updated = await safetyArchitecture.updateAction(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Action not found" });
  res.json(updated);
});

app.delete("/api/actions/:id", requireSafetyAdminAccess, requireSafetyArchitectureStore, async (req, res) => {
  if (typeof safetyArchitecture.deleteAction !== "function")
    return res.status(501).json({ message: "Tính năng chưa được hỗ trợ" });
  const result = await safetyArchitecture.deleteAction(req.params.id, safetyActor(req));
  if (!result) return res.status(404).json({ message: "CAPA not found" });
  res.json(result);
});

app.post("/api/actions/:id/approve", requireSafetyAdminAccess, requireSafetyArchitectureStore, async (req, res) => {
  const action = await safetyArchitecture.getAction?.(req.params.id);
  if (!action) return res.status(404).json({ message: "Action not found" });
  if (!["draft","pending_ehs"].includes(action.status))
    return res.status(400).json({ message: "CAPA không ở trạng thái chờ phê duyệt" });
  const actor = safetyActor(req);
  const updated = await safetyArchitecture.updateAction(
    req.params.id,
    { status: "open", rejectionNote: null, _approveMode: true },
    actor
  );
  try {
    const capaCode = action.code || req.params.id;
    const capaTitle = action.title || "CAPA";
    const ownerIds = [action.ownerId, action.createdById].filter(Boolean);
    if (ownerIds.length > 0) {
      await safetyOps.addNotification({
        type: "capa",
        entityType: "action",
        title: `CAPA được phê duyệt: ${capaCode}`,
        titleI18n: { vi: `CAPA được phê duyệt: ${capaCode}`, en: `CAPA approved: ${capaCode}` },
        message: `"${capaTitle}" đã được EHS phê duyệt — bắt đầu thực hiện.`,
        messageI18n: {
          vi: `"${capaTitle}" đã được EHS phê duyệt — bắt đầu thực hiện.`,
          en: `"${capaTitle}" was approved by EHS — please proceed.`
        },
        page: "/safety-6s/actions",
        forRoles: "",
        forDept: "",
        forUsers: ownerIds.join(",")
      });
      emitNotificationChange({ type: "capa", action: "approved", capaId: req.params.id });
    }
  } catch {}
  res.json(updated);
});

app.post("/api/actions/:id/reject", requireSafetyAdminAccess, requireSafetyArchitectureStore, async (req, res) => {
  const { reason = "" } = req.body || {};
  const action = await safetyArchitecture.getAction?.(req.params.id);
  if (!action) return res.status(404).json({ message: "Action not found" });
  if (!["draft","pending_ehs"].includes(action.status))
    return res.status(400).json({ message: "CAPA không ở trạng thái chờ phê duyệt" });
  const actor = safetyActor(req);
  const rejectionNote = reason.trim() || "Không đạt yêu cầu";
  const updated = await safetyArchitecture.updateAction(
    req.params.id,
    { status: "rejected", rejectionNote, _rejectMode: true },
    actor
  );
  try {
    const capaCode = action.code || req.params.id;
    const capaTitle = action.title || "CAPA";
    const ownerIds = [action.ownerId, action.createdById].filter(Boolean);
    if (ownerIds.length > 0) {
      await safetyOps.addNotification({
        type: "capa",
        entityType: "action",
        title: `CAPA bị từ chối: ${capaCode}`,
        titleI18n: { vi: `CAPA bị từ chối: ${capaCode}`, en: `CAPA rejected: ${capaCode}` },
        message: `"${capaTitle}" bị từ chối — lý do: ${rejectionNote}`,
        messageI18n: {
          vi: `"${capaTitle}" bị từ chối — lý do: ${rejectionNote}`,
          en: `"${capaTitle}" was rejected — reason: ${rejectionNote}`
        },
        page: "/safety-6s/actions",
        forRoles: "",
        forDept: "",
        forUsers: ownerIds.join(",")
      });
      emitNotificationChange({ type: "capa", action: "rejected", capaId: req.params.id });
    }
  } catch {}
  res.json(updated);
});

app.post("/api/actions/:id/resubmit", requireSafetyArchitectureSession, async (req, res) => {
  const action = await safetyArchitecture.getAction?.(req.params.id);
  if (!action) return res.status(404).json({ message: "Action not found" });
  if (action.status !== "rejected")
    return res.status(400).json({ message: "CAPA không ở trạng thái bị từ chối" });
  const actor = safetyActor(req);
  const updated = await safetyArchitecture.updateAction(
    req.params.id,
    { status: "draft", rejectionNote: null, _resubmitMode: true },
    actor
  );
  try {
    const capaCode = action.code || req.params.id;
    const capaTitle = action.title || "CAPA";
    await safetyOps.addNotification({
      type: "capa",
      entityType: "action",
      title: `CAPA gửi lại xét duyệt: ${capaCode}`,
      titleI18n: { vi: `CAPA gửi lại xét duyệt: ${capaCode}`, en: `CAPA resubmitted: ${capaCode}` },
      message: `"${capaTitle}" đã được gửi lại để phê duyệt bởi ${actor.displayName || actor.id}.`,
      messageI18n: {
        vi: `"${capaTitle}" đã được gửi lại để phê duyệt bởi ${actor.displayName || actor.id}.`,
        en: `"${capaTitle}" was resubmitted for approval by ${actor.displayName || actor.id}.`
      },
      page: "/safety-6s/actions",
      forRoles: "ehs,admin",
      forDept: "",
      forUsers: ""
    });
    emitNotificationChange({ type: "capa", action: "resubmitted", capaId: req.params.id });
  } catch {}
  res.json(updated);
});

app.delete("/api/actions/:id/evidence/:idx", requireSafetyAdminAccess, requireSafetyArchitectureStore, async (req, res) => {
  const fileIdx = parseInt(req.params.idx, 10);
  const action = await safetyArchitecture.getAction?.(req.params.id);
  if (!action) return res.status(404).json({ message: "Action not found" });
  const files = Array.isArray(action.evidenceFiles) ? [...action.evidenceFiles] : [];
  if (isNaN(fileIdx) || fileIdx < 0 || fileIdx >= files.length)
    return res.status(400).json({ message: "Invalid file index" });
  files.splice(fileIdx, 1);
  const updated = await safetyArchitecture.updateAction(req.params.id, { evidenceFiles: files }, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Action not found" });
  res.json(updated);
});

app.post("/api/actions/:id/submit-evidence", requireSafetyArchitectureSession, async (req, res) => {
  const updated = await safetyArchitecture.submitActionEvidence(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Action not found" });
  res.json(updated);
});

app.post("/api/actions/:id/verify", requireSafetyAdminAccess, requireSafetyArchitectureStore, async (req, res) => {
  const updated = await safetyArchitecture.verifyAction(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Action not found" });
  emitNotificationChange({ type: "capa", action: "verified", capaId: req.params.id });
  res.json(updated);
});

const EVIDENCE_ALLOWED_MIMES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const EVIDENCE_ALLOWED_EXTS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf",
  ".xls", ".xlsx", ".doc", ".docx",
]);
const evidenceUpload = multer({
  storage,
  limits: { files: 5, fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = EVIDENCE_ALLOWED_MIMES.has(file.mimetype) && EVIDENCE_ALLOWED_EXTS.has(ext);
    cb(null, ok);
  }
});

/* Backfill problemType for existing CAPAs that lack it */
app.post("/api/admin/backfill-capa-problem-types", requireAdminAccess, async (_req, res) => {
  const WARNING_CATEGORY_TO_PROBLEM = {
    EQUIPMENT: "MACH", ELECTRICAL: "ELEC", CHEMICALS: "CHEM",
    HEIGHT: "HEIGHT", VEHICLE: "VEHICLE", PPE_ISSUE: "PPE",
    HUMAN_BEHAVIOR: "BEHAV", NEAR_MISS: "NEAR", FIRE_SAFETY: "FIRE",
    ENVIRONMENT: "ENV", HOUSEKEEPING: "6S", ENERGY: "ENRG",
    ERGONOMICS: "BEHAV",
  };
  const SOURCE_TYPE_FALLBACK = { pccc: "FIRE", fire: "FIRE", "6s": "6S" };
  const inferProblemType = (category = "") => {
    const c = String(category).toUpperCase();
    if (WARNING_CATEGORY_TO_PROBLEM[c]) return WARNING_CATEGORY_TO_PROBLEM[c];
    if (c.includes("FIRE") || c.includes("PCCC"))     return "FIRE";
    if (c.includes("CHEM") || c.includes("HOA_CHAT")) return "CHEM";
    if (c.includes("ELEC") || c.includes("DIEN"))     return "ELEC";
    if (c.includes("MACHINE") || c.includes("MAY"))   return "MACH";
    if (c.includes("HEIGHT") || c.includes("CAO"))    return "HEIGHT";
    if (c.includes("PPE") || c.includes("BAO_HO"))    return "PPE";
    if (c.includes("ERGO"))                           return "BEHAV";
    if (c.includes("HYGIENE") || c.includes("VE_SINH")) return "6S";
    if (c.includes("6S") || c.includes("5S"))         return "6S";
    return null;
  };
  try {
    const updated = await safetyArchitecture.backfillProblemTypes?.({
      inferFromCategory: inferProblemType,
      sourceTypeFallback: SOURCE_TYPE_FALLBACK,
    });
    res.json({ ok: true, updated: updated ?? 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* Backfill sourceTitle for existing CAPAs that lack it */
app.post("/api/admin/backfill-capa-source-titles", requireAdminAccess, async (_req, res) => {
  try {
    const updated = await safetyArchitecture.backfillSourceTitles?.();
    res.json({ ok: true, updated: updated ?? 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/actions/:id/logs", requireSafetyArchitectureSession, async (req, res) => {
  if (typeof safetyArchitecture.listActionLogs !== "function")
    return res.json([]);
  const logs = await safetyArchitecture.listActionLogs(req.params.id);
  res.json(logs);
});

app.get("/api/actions/:id/comments", requireSafetyArchitectureSession, async (req, res) => {
  if (typeof safetyArchitecture.listActionComments !== "function") return res.json([]);
  const comments = await safetyArchitecture.listActionComments(req.params.id);
  res.json(comments);
});

app.post("/api/actions/:id/comments", requireSafetyArchitectureSession, async (req, res) => {
  if (typeof safetyArchitecture.addActionComment !== "function")
    return res.status(501).json({ message: "Not supported" });
  const { text, mentions } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ message: "Nội dung comment không được trống" });
  const actor = safetyActor(req);
  const comment = await safetyArchitecture.addActionComment(req.params.id, { text, mentions }, actor);
  if (!comment) return res.status(404).json({ message: "CAPA not found" });

  const mentionIds = Array.isArray(mentions)
    ? [...new Set(mentions.map((m) => String(m || "").trim()).filter((m) => m && m !== actor.id))]
    : [];
  if (mentionIds.length && typeof safetyOps.addNotification === "function") {
    let action = null;
    try {
      action = typeof safetyArchitecture.getAction === "function" ? await safetyArchitecture.getAction(req.params.id) : null;
    } catch {}
    const code = action?.code || req.params.id;
    const title = action?.title || "";
    await safetyOps.addNotification({
      type: "capa",
      entityType: "action",
      title: `${actor.displayName} đã nhắc bạn trong bình luận CAPA ${code}`,
      titleI18n: {
        vi: `${actor.displayName} đã nhắc bạn trong bình luận CAPA ${code}`,
        en: `${actor.displayName} mentioned you in a comment on CAPA ${code}`,
      },
      message: title ? `${title} — "${String(text).trim().slice(0, 140)}"` : String(text).trim().slice(0, 140),
      messageI18n: {
        vi: title ? `${title} — "${String(text).trim().slice(0, 140)}"` : String(text).trim().slice(0, 140),
        en: title ? `${title} — "${String(text).trim().slice(0, 140)}"` : String(text).trim().slice(0, 140),
      },
      page: "/safety-6s/capa-approval",
      forUsers: mentionIds.join(","),
    });
    emitNotificationChange({ type: "capa", action: "mentioned", capaId: req.params.id });
  }

  res.json(comment);
});

app.patch("/api/actions/:id/comments/:cid", requireSafetyArchitectureSession, async (req, res) => {
  if (typeof safetyArchitecture.editActionComment !== "function")
    return res.status(501).json({ message: "Not supported" });
  const { text } = req.body || {};
  const updated = await safetyArchitecture.editActionComment(req.params.cid, { text }, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Comment not found or not allowed" });
  res.json(updated);
});

app.delete("/api/actions/:id/comments/:cid", requireSafetyArchitectureSession, async (req, res) => {
  if (typeof safetyArchitecture.deleteActionComment !== "function")
    return res.status(501).json({ message: "Not supported" });
  const ok = await safetyArchitecture.deleteActionComment(req.params.cid, safetyActor(req));
  if (!ok) return res.status(403).json({ message: "Không được phép xóa comment này" });
  res.json({ ok: true });
});

app.post("/api/actions/:id/upload-evidence", requireSafetyArchitectureSession, evidenceUpload.array("files", 5), async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ message: "Không có file nào được gửi lên. Chỉ chấp nhận ảnh (JPG/PNG/WEBP) và PDF, mỗi file tối đa 10MB." });
  if (typeof safetyArchitecture.addActionEvidenceFiles !== "function")
    return res.status(501).json({ message: "Tính năng chưa được hỗ trợ trong chế độ này" });
  const newFiles = req.files.map(f => ({
    fileName: f.filename,
    originalName: decodeUploadFileName(f.originalname),
    mimeType: f.mimetype,
    size: f.size,
    url: `/uploads/${f.filename}`,
    uploadedAt: new Date().toISOString()
  }));
  for (const f of req.files) {
    saveFileToDB(f.filename, decodeUploadFileName(f.originalname), f.mimetype, f.size, f.path).catch(() => {});
  }
  const updated = await safetyArchitecture.addActionEvidenceFiles(req.params.id, newFiles, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Action not found" });
  res.json(updated);
});

/* ── EHS INTEL SUMMARY ──────────────────────────────────────── */
app.get("/api/intel/summary", auth.requireSession, async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [actionsRaw, warningsRaw, incidentsRaw] = await Promise.all([
      safetyArchitecture?.listActions ? safetyArchitecture.listActions({ limit: 500 }) : Promise.resolve([]),
      safetyOps?.listWarnings ? safetyOps.listWarnings({ limit: 500 }) : Promise.resolve({ items: [] }),
      safetyOps?.listIncidents ? safetyOps.listIncidents({ limit: 500 }) : Promise.resolve({ items: [] }),
    ]);
    const actions = Array.isArray(actionsRaw) ? actionsRaw : (actionsRaw?.items || []);
    const warnings = Array.isArray(warningsRaw) ? warningsRaw : (warningsRaw?.items || []);
    const incidents = Array.isArray(incidentsRaw) ? incidentsRaw : (incidentsRaw?.items || []);

    const CLOSED_STATUSES = new Set(["closed", "verified"]);
    const isOpen = (a) => !CLOSED_STATUSES.has(a.status || "");
    const isOverdue = (a) => {
      if (CLOSED_STATUSES.has(a.status || "")) return false;
      const due = a.dueDate || a.deadline || null;
      if (!due) return false;
      return new Date(due) < now;
    };
    const isThisMonth = (dateStr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d >= monthStart && d < now;
    };
    const isPrevMonth = (dateStr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d >= prevMonthStart && d < monthStart;
    };

    /* KPI */
    const openActions = actions.filter(isOpen);
    const overdueActions = actions.filter(isOverdue);
    const closedThisMonth = actions.filter(a => CLOSED_STATUSES.has(a.status || "") && isThisMonth(a.updatedAt || a.createdAt));
    const closedLastMonth = actions.filter(a => CLOSED_STATUSES.has(a.status || "") && isPrevMonth(a.updatedAt || a.createdAt));
    const newThisMonth = actions.filter(a => isThisMonth(a.createdAt));
    const newLastMonth = actions.filter(a => isPrevMonth(a.createdAt));
    const closedOnTime = actions.filter(a => CLOSED_STATUSES.has(a.status || "") && isThisMonth(a.updatedAt || a.createdAt) && (!a.deadline || new Date(a.updatedAt || a.createdAt) <= new Date(a.deadline)));
    const onTimePct = closedThisMonth.length > 0 ? Math.round(closedOnTime.length / closedThisMonth.length * 100) : 0;
    const prevOnTimePct = closedLastMonth.length > 0 ? Math.round(closedLastMonth.filter(a => !a.deadline || new Date(a.updatedAt || a.createdAt) <= new Date(a.deadline)).length / closedLastMonth.length * 100) : 0;
    const totalFindings = warnings.length + incidents.length + actions.filter(a => (a.sourceType || "manual") === "manual").length;
    const totalFindingsPrev = warnings.filter(a => isPrevMonth(a.createdAt)).length + incidents.filter(a => isPrevMonth(a.createdAt)).length;
    const totalFindingsNow = warnings.filter(a => isThisMonth(a.createdAt)).length + incidents.filter(a => isThisMonth(a.createdAt)).length;

    /* Source breakdown */
    const sourceCount = {};
    for (const a of actions) {
      const src = a.sourceType || "manual";
      sourceCount[src] = (sourceCount[src] || 0) + 1;
    }
    const warningCount = warnings.length;
    const incidentCount = incidents.length;
    const sourceData = [
      { name: "Cảnh báo nóng",    value: warningCount,                          color: "#f97316", key: "warning"  },
      { name: "Báo cáo sự cố",    value: incidentCount,                         color: "#ef4444", key: "incident" },
      { name: "Kiểm tra 6S/KYT",  value: (sourceCount["audit"] || 0),           color: "#3b82f6", key: "audit"   },
      { name: "Quan sát an toàn", value: (sourceCount["observation"] || 0),      color: "#8b5cf6", key: "observation" },
      { name: "Thủ công",         value: (sourceCount["manual"] || 0),           color: "#94a3b8", key: "manual"  },
    ];

    /* Funnel */
    const capaCreated = actions.length;
    const capaInProgress = actions.filter(a => ["in_progress","done_by_owner"].includes(a.status || "")).length;
    const capaClosed = actions.filter(a => CLOSED_STATUSES.has(a.status || "")).length;
    const funnelData = [
      { name: "Phát hiện vấn đề", value: totalFindings || capaCreated, fill: "#3b82f6" },
      { name: "Đã tạo CAPA",      value: capaCreated,                  fill: "#8b5cf6" },
      { name: "Đang thực hiện",   value: capaInProgress,               fill: "#f97316" },
      { name: "Đã đóng",          value: capaClosed,                   fill: "#10b981" },
    ];

    /* Department breakdown */
    const deptMap = {};
    for (const a of actions) {
      const d = a.department || "Khác";
      if (!deptMap[d]) deptMap[d] = { dept: d, open: 0, closed: 0, overdue: 0, incidents: 0, warnings: 0 };
      if (CLOSED_STATUSES.has(a.status || "")) deptMap[d].closed++;
      else deptMap[d].open++;
      if (isOverdue(a)) deptMap[d].overdue++;
    }
    for (const w of warnings) {
      const d = w.department || "Khác";
      if (!deptMap[d]) deptMap[d] = { dept: d, open: 0, closed: 0, overdue: 0, incidents: 0, warnings: 0 };
      deptMap[d].warnings++;
    }
    for (const inc of incidents) {
      const d = inc.department || "Khác";
      if (!deptMap[d]) deptMap[d] = { dept: d, open: 0, closed: 0, overdue: 0, incidents: 0, warnings: 0 };
      deptMap[d].incidents++;
    }
    const topDepts = Object.values(deptMap)
      .sort((a, b) => (b.open + b.overdue * 2) - (a.open + a.overdue * 2))
      .slice(0, 8)
      .map(d => ({
        ...d,
        score: Math.min(10, Math.round((d.incidents * 3 + d.warnings * 1.5 + d.open * 1) * 10) / 10),
        level: d.incidents >= 2 || d.open >= 7 ? "Cao" : d.incidents >= 1 || d.open >= 4 ? "TB" : "Thấp",
      }));

    /* Topic breakdown */
    const topicMap = {};
    for (const a of actions) {
      const t = a.topic || a.category || "Khác";
      if (!topicMap[t]) topicMap[t] = { name: t, open: 0, closed: 0, overdue: 0 };
      if (CLOSED_STATUSES.has(a.status || "")) topicMap[t].closed++;
      else topicMap[t].open++;
      if (isOverdue(a)) topicMap[t].overdue++;
    }
    const topTopics = Object.values(topicMap)
      .sort((a, b) => (b.open + b.closed) - (a.open + a.closed))
      .slice(0, 8);

    /* Monthly trend (last 6 months) */
    const monthLabels = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthLabels.push({ key: `T${d.getMonth() + 1}`, start: d, end: new Date(d.getFullYear(), d.getMonth() + 1, 1) });
    }
    const trend = monthLabels.map(({ key, start, end }) => {
      const inRange = (dateStr) => { if (!dateStr) return false; const d = new Date(dateStr); return d >= start && d < end; };
      return {
        month: key,
        warning:  warnings.filter(w => inRange(w.createdAt)).length,
        incident: incidents.filter(i => inRange(i.createdAt)).length,
        audit:    actions.filter(a => (a.sourceType || "") === "audit" && inRange(a.createdAt)).length,
        manual:   actions.filter(a => (a.sourceType || "manual") === "manual" && inRange(a.createdAt)).length,
      };
    });

    /* Recent activity from actions + warnings */
    const recentActions = [...actions]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
      .slice(0, 4)
      .map(a => ({
        time: new Date(a.updatedAt || a.createdAt || now).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        type: CLOSED_STATUSES.has(a.status || "") ? "closed" : isOverdue(a) ? "overdue" : "created",
        text: `CAPA #${a.code || a.id?.slice(-6) || "???"} — ${a.title || a.description || ""}`.slice(0, 55),
        dept: a.department || "—",
        src:  a.sourceType || "manual",
      }));
    const recentWarnings = [...warnings]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 2)
      .map(w => ({
        time: new Date(w.createdAt || now).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        type: "warning",
        text: `Cảnh báo #${w.code || "???"} — ${w.title || w.description || ""}`.slice(0, 55),
        dept: w.department || "—",
        src: "warning",
      }));
    const activity = [...recentActions, ...recentWarnings]
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 6);

    /* Insights */
    const insights = [];
    const topOverdueDept = topDepts.find(d => d.overdue >= 2);
    if (topOverdueDept) insights.push({ icon: "🟠", text: `${topOverdueDept.dept} có ${topOverdueDept.overdue} CAPA quá hạn — cao nhất`, level: "med" });
    const topTopic = topTopics[0];
    if (topTopic && topTopic.open >= 3) insights.push({ icon: "🔴", text: `${topTopic.name} có ${topTopic.open} CAPA chưa đóng — cần chú ý`, level: "high" });
    if (onTimePct < 70) insights.push({ icon: "🟡", text: `Tỷ lệ đóng đúng hạn ${onTimePct}% — thấp hơn mục tiêu 80%`, level: "low" });
    if (onTimePct >= 80) insights.push({ icon: "✅", text: `Tỷ lệ đóng đúng hạn ${onTimePct}% — đạt mục tiêu tháng này`, level: "good" });
    if (insights.length === 0) insights.push({ icon: "✅", text: "Không có cảnh báo đặc biệt trong tháng này", level: "good" });

    /* Pending for approval */
    const pendingActionsArr = actions.filter(a => a.status === "draft" || a.status === "pending_ehs");

    /* Soon-due (within 7 days, not closed) */
    const sevenDaysOut = new Date(now.getTime() + 7 * 86400000);
    const soonDue = actions
      .filter(a => {
        if (CLOSED_STATUSES.has(a.status || "")) return false;
        const due = a.dueDate || a.deadline;
        if (!due) return false;
        const dueD = new Date(due);
        return dueD >= now && dueD <= sevenDaysOut;
      })
      .sort((a, b) => new Date(a.dueDate || a.deadline) - new Date(b.dueDate || b.deadline))
      .slice(0, 6)
      .map(a => {
        const due = a.dueDate || a.deadline;
        const daysLeft = Math.round((new Date(due) - now) / 86400000);
        return {
          id: a.id, code: a.code || a.id?.slice(-6),
          title: (a.title || a.description || "").slice(0, 60),
          dueDate: due, daysLeft,
          ownerName: a.ownerName || a.owner || "—",
          dept: a.department || a.departmentCode || "—",
          status: a.status, priority: a.priority || "medium",
        };
      });

    /* Dept on-time % */
    const deptOnTimePct = Object.keys(deptMap).map(dept => {
      const deptClosed = actions.filter(a => (a.department || "Khác") === dept && CLOSED_STATUSES.has(a.status || ""));
      const deptOnTime = deptClosed.filter(a => {
        const due = a.dueDate || a.deadline;
        if (!due) return true;
        return new Date(a.updatedAt || a.closedAt || now) <= new Date(due);
      });
      const pct = deptClosed.length > 0 ? Math.round(deptOnTime.length / deptClosed.length * 100) : null;
      return { dept, pct, closed: deptClosed.length, onTime: deptOnTime.length };
    }).filter(d => d.closed > 0).sort((a, b) => b.closed - a.closed).slice(0, 8);

    res.json({
      kpi: {
        totalFindings:   { value: totalFindings,       delta: totalFindingsNow - totalFindingsPrev },
        openActions:     { value: openActions.length,  delta: openActions.length - (actions.filter(a => isOpen(a) && isPrevMonth(a.createdAt)).length) },
        overdueActions:  { value: overdueActions.length, delta: 0 },
        closedThisMonth: { value: closedThisMonth.length, delta: closedThisMonth.length - closedLastMonth.length },
        onTimePct:       { value: onTimePct, delta: onTimePct - prevOnTimePct },
        pendingApproval: { value: pendingActionsArr.length, delta: 0 },
      },
      sourceData, funnelData, topDepts, topTopics, trend, activity, insights,
      soonDue, deptOnTimePct,
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    console.error("[intel/summary]", err);
    res.status(500).json({ message: "Lỗi tổng hợp dữ liệu EHS", error: err.message });
  }
});

app.get("/api/locations", requireSafetyArchitectureSession, async (req, res) => {
  res.json(await safetyArchitecture.listLocations(scopedSafetyArchitectureQuery(req)));
});

app.post("/api/locations", requireSafetyArchitectureSession, async (req, res) => {
  res.status(201).json(await safetyArchitecture.createLocation(req.body || {}, safetyActor(req)));
});

app.patch("/api/locations/:id", requireSafetyAdminAccess, requireSafetyArchitectureStore, async (req, res) => {
  if (typeof safetyArchitecture.updateLocation !== "function")
    return res.status(501).json({ message: "Tính năng chưa được hỗ trợ" });
  const updated = await safetyArchitecture.updateLocation(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Location not found" });
  res.json(updated);
});

app.delete("/api/locations/:id", requireSafetyAdminAccess, requireSafetyArchitectureStore, async (req, res) => {
  if (typeof safetyArchitecture.deleteLocation !== "function")
    return res.status(501).json({ message: "Tính năng chưa được hỗ trợ" });
  const result = await safetyArchitecture.deleteLocation(req.params.id, safetyActor(req));
  if (!result) return res.status(404).json({ message: "Location not found" });
  res.json(result);
});

app.get("/api/qr/:code", requireSafetyArchitectureSession, async (req, res) => {
  const location = await safetyArchitecture.findLocationByQr(req.params.code);
  if (!location) return res.status(404).json({ message: "QR location not found" });
  res.json(location);
});

app.get("/api/training-requirements", requireSafetyArchitectureSession, async (req, res) => {
  res.json(await safetyArchitecture.listTrainingRequirements(scopedSafetyArchitectureQuery(req)));
});

app.post("/api/training-requirements", requireSafetyAdminAccess, requireSafetyArchitectureStore, async (req, res) => {
  res.status(201).json(await safetyArchitecture.createTrainingRequirement(req.body || {}, safetyActor(req)));
});

app.patch("/api/training-requirements/:id", requireSafetyAdminAccess, requireSafetyArchitectureStore, async (req, res) => {
  if (typeof safetyArchitecture.updateTrainingRequirement !== "function")
    return res.status(501).json({ message: "Tính năng chưa được hỗ trợ" });
  const updated = await safetyArchitecture.updateTrainingRequirement(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Training requirement not found" });
  res.json(updated);
});

app.delete("/api/training-requirements/:id", requireSafetyAdminAccess, requireSafetyArchitectureStore, async (req, res) => {
  if (typeof safetyArchitecture.deleteTrainingRequirement !== "function")
    return res.status(501).json({ message: "Tính năng chưa được hỗ trợ" });
  const result = await safetyArchitecture.deleteTrainingRequirement(req.params.id, safetyActor(req));
  if (!result) return res.status(404).json({ message: "Training requirement not found" });
  res.json(result);
});

app.get("/api/training-records", requireSafetyArchitectureSession, async (req, res) => {
  res.json(await safetyArchitecture.listTrainingRecords(scopedSafetyArchitectureQuery(req)));
});

app.post("/api/training-records", requireSafetyArchitectureSession, async (req, res) => {
  res.status(201).json(await safetyArchitecture.createTrainingRecord(req.body || {}, safetyActor(req)));
});

app.get("/api/safety-bulletins", async (req, res) => {
  const includeDrafts = req.query.includeDrafts === "true";
  const includeDeleted = req.query.includeDeleted === "true";
  if (includeDrafts || includeDeleted) {
    return requireAdminAccess(req, res, async () => {
      if (includeDeleted && req.adminUser?.role !== "admin") {
        return res.status(403).json({ message: "Cần quyền admin cao nhất để xem bản đã xóa" });
      }
      res.json(await core.getSafetyBulletins({ ...req.query, includeDrafts, includeDeleted }));
    });
  }
  return res.json(await core.getSafetyBulletins(req.query));
});

app.get("/api/safety-bulletins/:id", async (req, res) => {
  const bulletin = await core.getSafetyBulletin(req.params.id);
  if (!bulletin || bulletin.published === false) {
    return requireAdminAccess(req, res, async () => {
      const b = await core.getSafetyBulletin(req.params.id);
      if (!b) return res.status(404).json({ message: "Safety bulletin not found" });
      return res.json(b);
    });
  }
  return res.json(bulletin);
});

app.post("/api/safety-bulletins", requireAdminAccess, async (req, res) => {
  const actor = documentActor(req);
  const created = await core.addSafetyBulletin(req.body || {}, actor);
  supervisor.logActivity({
    type: "safety-bulletin.created",
    message: `Safety bulletin created: ${created.id}`,
    actor: actor.username,
    target: created.id
  });
  res.status(201).json(created);
});

app.put("/api/safety-bulletins/:id", requireAdminAccess, async (req, res) => {
  const actor = documentActor(req);
  const updated = await core.updateSafetyBulletin(req.params.id, req.body || {}, actor);
  if (!updated) {
    return res.status(404).json({ message: "Safety bulletin not found" });
  }
  supervisor.logActivity({
    type: "safety-bulletin.updated",
    message: `Safety bulletin updated: ${updated.id}`,
    actor: actor.username,
    target: updated.id
  });
  res.json(updated);
});

app.delete("/api/safety-bulletins/:id", requireAdminAccess, async (req, res) => {
  if (req.adminUser?.role !== "admin") {
    return res.status(403).json({ message: "Chỉ admin cao nhất mới được xóa bảng tin" });
  }
  const actor = documentActor(req);
  const updated = await core.softDeleteBulletin(req.params.id, actor);
  if (!updated) {
    return res.status(404).json({ message: "Safety bulletin not found" });
  }
  supervisor.logActivity({
    type: "safety-bulletin.deleted",
    message: `Safety bulletin soft-deleted: ${updated.id}`,
    actor: actor.username,
    target: updated.id
  });
  res.json(updated);
});

app.post("/api/safety-bulletins/:id/restore", requireAdminAccess, async (req, res) => {
  if (req.adminUser?.role !== "admin") {
    return res.status(403).json({ message: "Chỉ admin cao nhất mới được khôi phục bảng tin" });
  }
  const actor = documentActor(req);
  const restored = await core.restoreBulletin(req.params.id, actor);
  if (!restored) {
    return res.status(404).json({ message: "Safety bulletin not found" });
  }
  supervisor.logActivity({
    type: "safety-bulletin.restored",
    message: `Safety bulletin restored: ${restored.id}`,
    actor: actor.username,
    target: restored.id
  });
  res.json(restored);
});

app.delete("/api/safety-bulletins/:id/purge", requireAdminAccess, async (req, res) => {
  if (req.adminUser?.role !== "admin") {
    return res.status(403).json({ message: "Chỉ admin cao nhất mới được xóa vĩnh viễn" });
  }
  const actor = documentActor(req);
  const result = await core.purgeBulletin(req.params.id, actor);
  if (!result) return res.status(404).json({ message: "Safety bulletin not found" });
  supervisor.logActivity({ type: "safety-bulletin.purged", message: `Safety bulletin permanently deleted: ${req.params.id}`, actor: actor.username, target: req.params.id });
  res.json(result);
});

app.put("/api/safety-bulletins/:id/hide", requireAdminAccess, async (req, res) => {
  const actor = documentActor(req);
  const updated = await core.hideSafetyBulletin(req.params.id, actor);
  if (!updated) return res.status(404).json({ message: "Safety bulletin not found" });
  supervisor.logActivity({ type: "safety-bulletin.hidden", message: `Safety bulletin hidden: ${updated.id}`, actor: actor.username, target: updated.id });
  res.json(updated);
});

app.get("/api/safety-bulletins/:id/logs", requireAdminAccess, async (req, res) => {
  res.json(await core.getSafetyBulletinLogs(req.params.id, req.query));
});

app.get("/api/warnings", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.listWarnings(scopedSafetyQuery(req)));
});

app.post("/api/warnings", requireSafetySession, async (req, res) => {
  const created = await safetyOps.createWarning(req.body || {}, safetyActor(req));
  supervisor.logActivity({
    type: "safety-warning.created",
    actor: req.adminUser?.username || "user",
    target: created.code,
    message: `Safety warning created: ${created.code}`
  });
  emitNotificationChange({ type: "warning", action: "created", code: created.code });
  res.status(201).json(created);
});

app.get("/api/warnings/:id", requireSafetySession, async (req, res) => {
  const item = typeof safetyOps.getWarning === "function"
    ? await safetyOps.getWarning(req.params.id)
    : (await safetyOps.listWarnings({ limit: 5000, id: req.params.id }))
        .find?.(w => w.id === req.params.id) ?? null;
  if (!item) return res.status(404).json({ message: "Safety warning not found" });
  res.json(item);
});

app.put("/api/warnings/:id", requireSafetySession, async (req, res) => {
  const updated = await safetyOps.updateWarning(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Safety warning not found" });
  res.json(updated);
});

app.post("/api/warnings/:id/approve", requireSafetyReviewAccess, async (req, res) => {
  const updated = await safetyOps.approveWarning(req.params.id, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Safety warning not found" });
  emitNotificationChange({ type: "warning", action: "approved", code: updated.code });
  res.json(updated);
});

app.post("/api/warnings/:id/verify", requireSafetyReviewAccess, async (req, res) => {
  const updated = await safetyOps.updateWarning(req.params.id, { status: "VERIFIED" }, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Warning not found" });
  res.json(updated);
});
app.post("/api/warnings/:id/reject", requireSafetyReviewAccess, async (req, res) => {
  const updated = await safetyOps.rejectWarning(req.params.id, req.body?.reason || "", safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Safety warning not found" });
  emitNotificationChange({ type: "warning", action: "rejected", code: updated.code });
  res.json(updated);
});

app.delete("/api/warnings/:id", requireSafetyAdminAccess, async (req, res) => {
  if (typeof safetyOps.deleteWarning !== "function")
    return res.status(501).json({ message: "Tính năng chưa được hỗ trợ" });
  const result = await safetyOps.deleteWarning(req.params.id, safetyActor(req));
  if (!result) return res.status(404).json({ message: "Safety warning not found" });
  supervisor.logActivity({ type: "safety-warning.deleted", actor: req.adminUser?.username || "admin", target: req.params.id });
  res.json(result);
});

// Tạo Việc Cần Làm (CAPA Action) từ Cảnh Báo - theo Maplogic
app.post("/api/warnings/:id/create-action", requireSafetyReviewAccess, async (req, res) => {
  try {
    const warning = typeof safetyOps.getWarning === "function"
      ? await safetyOps.getWarning(req.params.id)
      : (await safetyOps.listWarnings({ limit: 500 }))?.items?.find?.(w => w.id === req.params.id) ?? null;
    if (!warning) return res.status(404).json({ message: "Safety warning not found" });

    const actor = safetyActor(req);
    const actionInput = {
      title: req.body?.title || warning.title || "Khắc phục cảnh báo",
      description: req.body?.description || warning.description || "",
      sourceType: "warning",
      sourceId: warning.id,
      sourceCode: warning.code || "",
      sourceTitle: warning.title || "",
      departmentCode: req.body?.departmentCode || warning.department || actor.departmentId || "EHS",
      priority: req.body?.priority || (Number(warning.riskScore) >= 15 ? "high" : Number(warning.riskScore) >= 8 ? "medium" : "low"),
      status: "open",
      ownerId: req.body?.ownerId || "",
      ownerName: req.body?.ownerName || warning.responsiblePerson || "",
      dueDate: req.body?.dueDate || warning.deadline || null,
      evidenceNotes: req.body?.evidenceNotes || ""
    };

    const action = await safetyArchitecture.createAction(actionInput, actor);

    // Cập nhật trạng thái Warning thành IN_PROGRESS
    await safetyOps.updateWarning(warning.id, { status: "IN_PROGRESS" }, actor);

    supervisor.logActivity({
      type: "safety-warning.action-created",
      actor: req.adminUser?.username || "user",
      target: warning.code,
      message: `CAPA ${action.code} created from warning ${warning.code}`
    });

    res.status(201).json(action);
  } catch (error) {
    console.error("Create action from warning error:", error);
    res.status(500).json({ message: "Không thể tạo việc cần làm từ cảnh báo" });
  }
});

app.get("/api/incidents", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.listIncidents(scopedSafetyQuery(req)));
});

app.post("/api/incidents", requireSafetySession, async (req, res) => {
  const created = await safetyOps.createIncident(req.body || {}, safetyActor(req));
  supervisor.logActivity({
    type: "safety-incident.created",
    actor: req.adminUser?.username || "user",
    target: created.code,
    message: `Safety incident created: ${created.code}`
  });
  emitNotificationChange({ type: "incident", action: "created", code: created.code });
  res.status(201).json(created);
});

app.get("/api/incidents/:id", requireSafetySession, async (req, res) => {
  const item = typeof safetyOps.getIncident === "function"
    ? await safetyOps.getIncident(req.params.id)
    : (await safetyOps.listIncidents({ limit: 5000 }))
        .find?.(w => w.id === req.params.id) ?? null;
  if (!item) return res.status(404).json({ message: "Safety incident not found" });
  res.json(item);
});

app.put("/api/incidents/:id", requireSafetySession, async (req, res) => {
  const updated = await safetyOps.updateIncident(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Safety incident not found" });
  res.json(updated);
});

app.post("/api/incidents/:id/approve", requireSafetyReviewAccess, async (req, res) => {
  const updated = await safetyOps.approveIncident(req.params.id, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Safety incident not found" });
  emitNotificationChange({ type: "incident", action: "approved", code: updated.code });
  res.json(updated);
});

app.post("/api/incidents/:id/reject", requireSafetyReviewAccess, async (req, res) => {
  const updated = await safetyOps.rejectIncident(req.params.id, req.body?.reason || "", safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Safety incident not found" });
  emitNotificationChange({ type: "incident", action: "rejected", code: updated.code });
  res.json(updated);
});

app.delete("/api/incidents/:id", requireSafetyAdminAccess, async (req, res) => {
  if (typeof safetyOps.deleteIncident !== "function")
    return res.status(501).json({ message: "Tính năng chưa được hỗ trợ" });
  const result = await safetyOps.deleteIncident(req.params.id, safetyActor(req));
  if (!result) return res.status(404).json({ message: "Safety incident not found" });
  supervisor.logActivity({ type: "safety-incident.deleted", actor: req.adminUser?.username || "admin", target: req.params.id });
  res.json(result);
});

app.get("/api/incidents/:id/attachments", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.listIncidentAttachments(req.params.id));
});

app.get("/api/kpi-entries", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.listKpiEntries(scopedSafetyQuery(req)));
});

app.post("/api/kpi-entries", requireSafetySession, async (req, res) => {
  const created = await safetyOps.createKpiEntry(req.body || {}, safetyActor(req));
  res.status(201).json(created);
});

app.get("/api/kpi-entries/:id/history", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.kpiHistory(req.params.id));
});

app.post("/api/kpi-entries/:id/approve-l1", requireSafetyReviewAccess, async (req, res) => {
  const updated = await safetyOps.approveKpi(req.params.id, 1, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "KPI entry not found" });
  res.json(updated);
});

app.post("/api/kpi-entries/:id/approve-l2", requireSafetyAdminAccess, async (req, res) => {
  const updated = await safetyOps.approveKpi(req.params.id, 2, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "KPI entry not found" });
  res.json(updated);
});

app.post("/api/kpi-entries/:id/reject-l1", requireSafetyReviewAccess, async (req, res) => {
  const updated = await safetyOps.rejectKpi(req.params.id, 1, req.body?.reason || "", safetyActor(req));
  if (!updated) return res.status(404).json({ message: "KPI entry not found" });
  res.json(updated);
});

app.post("/api/kpi-entries/:id/reject-l2", requireSafetyAdminAccess, async (req, res) => {
  const updated = await safetyOps.rejectKpi(req.params.id, 2, req.body?.reason || "", safetyActor(req));
  if (!updated) return res.status(404).json({ message: "KPI entry not found" });
  res.json(updated);
});

app.get("/api/checklists", requireSafetySession, async (req, res) => {
  const department = resolveChecklistDepartment(req, req.query.dept || req.query.departmentCode);
  if (department.error) return res.status(department.error.status).json(department.error.body);
  const dept = department.dept;
  const period = String(req.query.period || new Date().toISOString().slice(0, 7));
  res.json(await safetyOps.listChecklist({ dept, period }));
});

app.post("/api/checklists", requireSafetySession, async (req, res) => {
  const department = resolveChecklistDepartment(req, req.body?.departmentCode || req.body?.dept);
  if (department.error) return res.status(department.error.status).json(department.error.body);
  res.status(201).json(await safetyOps.saveChecklist({ ...(req.body || {}), departmentCode: department.dept }, safetyActor(req)));
});

app.get("/api/checklists/template", requireSafetySession, async (_req, res) => {
  res.json(await safetyOps.checklistTemplate());
});

app.get("/api/checklists/summary", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.checklistSummary({ period: req.query.period }));
});

app.get("/api/checklists/pillar-summary", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.checklistPillarSummary({ period: req.query.period }));
});

app.get("/api/reports", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.listReports(scopedSafetyQuery(req)));
});

app.post("/api/reports", requireSafetySession, async (req, res) => {
  res.status(201).json(await safetyOps.createReport(req.body || {}, safetyActor(req)));
});

app.put("/api/reports/:id", requireSafetySession, async (req, res) => {
  const updated = await safetyOps.updateReport(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Safety report not found" });
  res.json(updated);
});

app.delete("/api/reports/:id", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.deleteReport(req.params.id, safetyActor(req)));
});

app.get("/api/training-courses", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.listTrainingCourses(scopedSafetyQuery(req)));
});

app.post("/api/training-courses", requireSafetyAdminAccess, async (req, res) => {
  res.status(201).json(await safetyOps.createTrainingCourse(req.body || {}, safetyActor(req)));
});

app.put("/api/training-courses/:id", requireSafetyAdminAccess, async (req, res) => {
  const updated = await safetyOps.updateTrainingCourse(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Training course not found" });
  res.json(updated);
});

app.delete("/api/training-courses/:id", requireSafetyAdminAccess, async (req, res) => {
  res.json(await safetyOps.deleteTrainingCourse(req.params.id, safetyActor(req)));
});

// ─── Safety Meetings ───────────────────────────────────────────────────────
app.get("/api/safety-meetings", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.listSafetyMeetings(req.query));
});

app.get("/api/safety-meetings/summary", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.safetyMeetingSummary(req.query));
});

app.get("/api/safety-meetings/export.csv", requireSafetySession, async (req, res) => {
  const csv = await safetyOps.exportSafetyMeetingsCsv(req.query);
  const year = req.query.year ? `-${req.query.year}` : "";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="hop-an-toan${year}.csv"`);
  res.send("\uFEFF" + csv);
});

app.get("/api/safety-meetings/:id", requireSafetySession, async (req, res) => {
  const meeting = await safetyOps.getSafetyMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ message: "Không tìm thấy cuộc họp" });
  res.json(meeting);
});

app.post("/api/safety-meetings", requireSafetyAdminAccess, async (req, res) => {
  const meeting = await safetyOps.createSafetyMeeting(req.body || {}, safetyActor(req));
  emitNotificationChange();
  res.status(201).json(meeting);
});

app.put("/api/safety-meetings/:id", requireSafetyAdminAccess, async (req, res) => {
  const updated = await safetyOps.updateSafetyMeeting(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Không tìm thấy cuộc họp" });
  res.json(updated);
});

app.post("/api/safety-meetings/:id/complete", requireSafetyAdminAccess, async (req, res) => {
  const meeting = await safetyOps.completeSafetyMeeting(req.params.id, req.body || {}, safetyActor(req));
  if (!meeting) return res.status(404).json({ message: "Không tìm thấy cuộc họp" });
  emitNotificationChange();
  res.json(meeting);
});

app.patch("/api/safety-meetings/:id/actions/:actionId", requireSafetySession, async (req, res) => {
  const meeting = await safetyOps.updateMeetingActionItem(req.params.id, req.params.actionId, req.body || {}, safetyActor(req));
  if (!meeting) return res.status(404).json({ message: "Không tìm thấy cuộc họp hoặc hành động" });
  res.json(meeting);
});

app.delete("/api/safety-meetings/:id", requireSafetyAdminAccess, async (req, res) => {
  res.json(await safetyOps.deleteSafetyMeeting(req.params.id, safetyActor(req)));
});

// ─── Inspection Plans ──────────────────────────────────────────────────────
app.get("/api/inspection-plans", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.listInspectionPlans(req.query));
});

app.get("/api/inspection-plans/summary", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.inspectionPlanSummary(req.query));
});

app.get("/api/inspection-plans/export.csv", requireSafetySession, async (req, res) => {
  const csv = await safetyOps.exportInspectionPlansCsv(req.query);
  const year = req.query.year ? `-${req.query.year}` : "";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="ke-hoach-kiem-tra${year}.csv"`);
  res.send("\uFEFF" + csv);
});

app.get("/api/inspection-plans/email-status", requireSafetyAdminAccess, async (req, res) => {
  res.json({ configured: isEmailConfigured() });
});

app.get("/api/inspection-plans/:id", requireSafetySession, async (req, res) => {
  const plan = await safetyOps.getInspectionPlan(req.params.id);
  if (!plan) return res.status(404).json({ message: "Không tìm thấy kế hoạch" });
  res.json(plan);
});

app.post("/api/inspection-plans", requireSafetyAdminAccess, async (req, res) => {
  const plan = await safetyOps.createInspectionPlan(req.body || {}, safetyActor(req));
  emitNotificationChange();
  res.status(201).json(plan);
});

app.put("/api/inspection-plans/:id", requireSafetyAdminAccess, async (req, res) => {
  const updated = await safetyOps.updateInspectionPlan(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Không tìm thấy kế hoạch" });
  res.json(updated);
});

app.post("/api/inspection-plans/:id/approve", requireSafetyAdminAccess, async (req, res) => {
  const plan = await safetyOps.approveInspectionPlan(req.params.id, safetyActor(req));
  if (!plan) return res.status(404).json({ message: "Không tìm thấy kế hoạch" });
  emitNotificationChange();
  res.json(plan);
});

app.post("/api/inspection-plans/:id/cancel", requireSafetyAdminAccess, async (req, res) => {
  const plan = await safetyOps.cancelInspectionPlan(req.params.id, safetyActor(req));
  if (!plan) return res.status(404).json({ message: "Không tìm thấy kế hoạch" });
  res.json(plan);
});

app.patch("/api/inspection-plans/:id/departments/:deptCode", requireSafetySession, async (req, res) => {
  const plan = await safetyOps.updatePlanDepartment(req.params.id, req.params.deptCode, req.body || {}, safetyActor(req));
  if (!plan) return res.status(404).json({ message: "Không tìm thấy kế hoạch hoặc bộ phận" });
  res.json(plan);
});

app.delete("/api/inspection-plans/:id", requireSafetyAdminAccess, async (req, res) => {
  res.json(await safetyOps.deleteInspectionPlan(req.params.id, safetyActor(req)));
});

app.post("/api/inspection-plans/test-smtp", requireSafetyAdminAccess, async (req, res) => {
  const result = await testSmtpConnection();
  res.json(result);
});

app.post("/api/inspection-plans/remind-overdue", requireSafetyAdminAccess, async (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Không có lỗi nào để gửi nhắc nhở" });
  }
  if (!isEmailConfigured()) {
    return res.status(503).json({
      message: "SMTP chưa được cấu hình. Vui lòng thiết lập SMTP_HOST, SMTP_USER, SMTP_PASS trong biến môi trường.",
      configured: false
    });
  }
  try {
    const result = await sendOverdueReminders(items);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Lỗi khi gửi email: " + err.message });
  }
});

// ─── Dept & Company Reports ────────────────────────────────────────────────
app.get("/api/safety/dept-report", requireSafetySession, async (req, res) => {
  if (!req.query.dept) return res.status(400).json({ message: "Thiếu tham số dept" });
  res.json(await safetyOps.deptReport(req.query));
});

app.get("/api/safety/company-report", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.companyReport(req.query));
});

// Violation + incident trend — last 8 weeks (real data)
app.get("/api/safety/violation-trend", requireSafetySession, async (req, res) => {
  try {
    res.json(await safetyOps.violationTrend());
  } catch (err) {
    console.error("[violation-trend]", err);
    res.status(500).json({ message: "Lỗi tải trend", error: err.message });
  }
});

// Incident category breakdown — current year (real data)
app.get("/api/safety/incident-categories", requireSafetySession, async (req, res) => {
  try {
    res.json(await safetyOps.incidentCategories(req.query));
  } catch (err) {
    console.error("[incident-categories]", err);
    res.status(500).json({ message: "Lỗi tải phân loại sự cố", error: err.message });
  }
});

app.get("/api/safety/score-engine/departments", requireSafetySession, async (req, res) => {
  try {
    const period = req.query.period || new Date().toISOString().slice(0, 7);
    const result = await computeSafetyScores(period, safetyOps);
    res.json({
      period: result.period,
      computedAt: result.computedAt,
      departments: result.departments,
      meta: result.meta,
    });
  } catch (err) {
    console.error("[score-engine/departments]", err);
    res.status(500).json({ message: "Lỗi tính điểm bộ phận", error: err.message });
  }
});

app.get("/api/safety/score-engine", requireSafetySession, async (req, res) => {
  try {
    const period = req.query.period || new Date().toISOString().slice(0, 7);
    const result = await computeSafetyScores(period, safetyOps);
    res.json(result);
  } catch (err) {
    console.error("[score-engine]", err);
    res.status(500).json({ message: "Lỗi tính điểm an toàn", error: err.message });
  }
});

app.get("/api/notifications", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.listNotifications(safetyActor(req)));
});

app.post("/api/notifications/:id/read", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.markNotificationRead(req.params.id, safetyActor(req)));
});

app.post("/api/notifications/read-all", requireSafetySession, async (req, res) => {
  const result = await safetyOps.markAllNotificationsRead(safetyActor(req));
  emitNotificationChange({ type: "read-all", action: "read" });
  res.json(result);
});

app.get("/api/notifications/stream", requireSafetySession, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (payload) => {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
    }
  };

  send({ type: "connected", ts: Date.now() });

  const handler = (payload) => send(payload);
  notificationBus.on("change", handler);

  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    notificationBus.off("change", handler);
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
});

app.get("/api/profile", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.getProfile(safetyActor(req)));
});

app.put("/api/profile", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.updateProfile(req.body || {}, safetyActor(req)));
});

app.get("/api/activity-feed", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.activityFeed(req.query));
});

app.get("/api/system/status", requireAdminAccess, async (_req, res) => {
  const documentCount = await core.getDocumentCount();
  res.json(
    supervisor.getStatus({
      summary: await core.getSafetySummary(),
      config: await core.readConfig(),
      documentCount,
      environment: {
        appEnv,
        allowedOrigins,
        maxUploadMb,
        activityLogLimit,
        documentPreview: previewService.getConverterStatus(),
        trustProxy,
        enableLegacyAdminPin,
        usesDefaultAdminPin,
        usesPlaceholderAdminPassword
      }
    })
  );
});

app.get("/api/system/preflight", requireAdminAccess, (_req, res) => {
  res.json(readProductionPreflight());
});

app.get("/api/activity", requireAdminAccess, (req, res) => {
  res.json(supervisor.readActivity(req.query));
});

app.get("/api/backups", requireAdminAccess, (_req, res) => {
  res.json(supervisor.listBackups());
});

app.post("/api/backups", requireAdminAccess, (req, res) => {
  res.status(201).json(supervisor.createBackup(req.body?.reason || "manual"));
});

app.get("/api/documents", async (_req, res) => {
  res.json(await core.getDocuments(_req.query));
});

const excelHtmlPreviewHandler = async (req, res) => {
  const document = await core.getDocument(req.params.id);
  if (!document) {
    return res.status(404).json({ message: "Document not found" });
  }
  const sourcePath = resolveDocumentFilePath(document);
  if (!sourcePath) {
    return res.status(422).json({ message: "This document has no uploaded file", document });
  }

  if (!fs.existsSync(sourcePath)) {
    return res.status(404).json({ message: "Document file not found", document });
  }

  const preview = await previewService.createSpreadsheetHtmlPreview({
    document,
    sourcePath,
    force: req.query.refresh === "true"
  });
  if (preview.htmlStatus !== "ready" || !preview.htmlDir || !fs.existsSync(preview.htmlDir)) {
    return res.status(422).json({
      message: "Excel HTML preview is not available",
      document,
      supported: false,
      reason: preview.htmlError || "HTML preview has not been generated",
      converter: previewService.getConverterStatus()
    });
  }

  const targetDir = path.resolve(preview.htmlDir);
  const assetName = String(req.params.asset || "").trim();
  const targetPath = assetName ? path.resolve(targetDir, assetName) : preview.htmlPath;
  if (!targetPath || !targetPath.startsWith(`${targetDir}${path.sep}`) || !fs.existsSync(targetPath)) {
    return res.status(404).json({ message: "Preview asset not found" });
  }

  const headers = {
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-cache"
  };
  if (!assetName) {
    headers["Content-Type"] = "text/html; charset=utf-8";
    headers["Content-Security-Policy"] = excelHtmlPreviewCsp;
  }
  res.sendFile(targetPath, { headers });
};

app.get("/api/documents/:id/excel-html-preview", excelHtmlPreviewHandler);
app.get("/api/documents/:id/excel-html-preview/", excelHtmlPreviewHandler);
app.get("/api/documents/:id/excel-html-preview/:asset", excelHtmlPreviewHandler);

app.get("/api/documents/:id/preview-file", async (req, res) => {
  let document = await core.getDocument(req.params.id);
  if (!document) {
    return res.status(404).json({ message: "Document not found" });
  }
  if (!resolveDocumentFilePath(document)) {
    return res.status(422).json({ message: "This document has no uploaded file", document });
  }

  document = await ensureDocumentPreview(document, { force: req.query.refresh === "true" });
  const previewPath = previewService.previewPathFor(document);
  if (document.previewStatus !== "ready" || !previewPath || !fs.existsSync(previewPath)) {
    return res.status(422).json({
      message: "Document preview is not available",
      document,
      supported: false,
      reason: document.previewError || "Preview PDF has not been generated",
      converter: previewService.getConverterStatus()
    });
  }

  const fileName = `${safeHeaderFallbackName(document.originalName || document.title || document.id).replace(/\.[a-z0-9]+$/i, "")}-preview.pdf`;
  res.sendFile(previewPath, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionHeader("inline", fileName),
      "X-Content-Type-Options": "nosniff"
    }
  });
});

app.get("/api/documents/:id/preview", async (req, res) => {
  const document = await core.getDocument(req.params.id);
  if (!document) {
    return res.status(404).json({ message: "Document not found" });
  }
  const resolved = resolveDocumentFilePath(document);
  if (!resolved) {
    return res.status(422).json({ message: "This document has no uploaded file", document });
  }

  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ message: "Document file not found", document });
  }

  try {
    res.json(createXlsxPreview({ filePath: resolved, document }));
  } catch (error) {
    res.status(422).json({
      message: "Document preview is not available",
      reason: error.message,
      document,
      supported: false
    });
  }
});

app.get("/api/documents/:id/file", async (req, res) => {
  const document = await core.getDocument(req.params.id);
  if (!document) {
    return res.status(404).json({ message: "Document not found" });
  }
  const resolved = resolveDocumentFilePath(document);
  if (!resolved) {
    return res.status(422).json({ message: "This document has no uploaded file", document });
  }

  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ message: "Document file not found", document });
  }

  const disposition = req.query.disposition === "attachment" ? "attachment" : "inline";
  const fileName = document.originalName || document.fileName || path.basename(resolved);
  res.sendFile(resolved, {
    headers: {
      "Content-Disposition": contentDispositionHeader(disposition, fileName),
      "X-Content-Type-Options": "nosniff"
    }
  });
});

app.post("/api/documents", requireAdminAccess, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "File is required" });
  }

  const now = new Date().toISOString();
  const actor = documentActor(req);
  const storagePath = path.relative(rootDir, path.join(uploadDir, req.file.filename)).replace(/\\/g, "/");
  const originalName = decodeUploadFileName(req.file.originalname);
  const title = normalizeDocumentTitleForStorage({
    fileName: req.file.filename,
    originalName,
    title: req.body.title
  });
  const document = {
    id: randomUUID(),
    title,
    titleI18n: parseLocalizedBodyField(req.body.titleI18n) ?? title,
    category: req.body.category || "general",
    departmentId: req.body.departmentId || "company",
    departmentName: req.body.departmentName || "",
    language: req.body.language || "vi",
    version: req.body.version || "1.0",
    originalName,
    fileName: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedAt: now,
    createdAt: now,
    createdBy: actor.username,
    createdByName: actor.displayName,
    createdByRole: actor.role,
    updatedAt: now,
    updatedBy: actor.username,
    updatedByName: actor.displayName,
    updatedByRole: actor.role,
    source: "web-upload",
    storagePath,
    url: `/uploads/${req.file.filename}`
  };

  saveFileToDB(req.file.filename, originalName, req.file.mimetype, req.file.size, req.file.path).catch(() => {});
  const created = await core.addDocument(document);
  const createdWithPreview = await ensureDocumentPreview(created);
  supervisor.logActivity({
    type: "document.uploaded",
    message: `Document uploaded: ${createdWithPreview.title}`,
    actor: req.adminUser?.username || "admin",
    target: createdWithPreview.id,
    metadata: {
      category: createdWithPreview.category,
      departmentId: createdWithPreview.departmentId,
      previewStatus: createdWithPreview.previewStatus || ""
    }
  });
  createDocumentRuntimeBackup("after-document-upload", { documentId: createdWithPreview.id });

  try {
    const docTitle = createdWithPreview.title || createdWithPreview.originalName || "Tài liệu mới";
    const uploader = createdWithPreview.createdByName || createdWithPreview.createdBy || "Admin";
    await safetyOps.addNotification({
      type: "document",
      entityType: "document",
      title: "Tài liệu mới được tải lên",
      titleI18n: { vi: "Tài liệu mới được tải lên", en: "New document uploaded" },
      message: `${docTitle} — ${uploader}`,
      messageI18n: { vi: `${docTitle} — tải lên bởi ${uploader}`, en: `${docTitle} — uploaded by ${uploader}` },
      page: "/safety-6s/documents",
      forRoles: "",
      forDept: ""
    });
    emitNotificationChange({ type: "document", action: "uploaded", documentId: createdWithPreview.id });
  } catch {
  }

  res.status(201).json(createdWithPreview);
});

app.put("/api/documents/:id", requireAdminAccess, async (req, res) => {
  const now = new Date().toISOString();
  const actor = documentActor(req);
  const current = await core.getDocument(req.params.id);
  if (!current) {
    return res.status(404).json({ message: "Document not found" });
  }

  const updates = {
    ...allowedDocumentUpdates(req.body, current),
    updatedAt: now,
    updatedBy: actor.username,
    updatedByName: actor.displayName,
    updatedByRole: actor.role
  };
  const updated = await core.updateDocument(req.params.id, updates);

  if (!updated) {
    return res.status(404).json({ message: "Document not found" });
  }

  supervisor.logActivity({
    type: "document.updated",
    message: `Document updated: ${updated.title}`,
    actor: actor.username,
    target: updated.id,
    metadata: { category: updated.category, departmentId: updated.departmentId }
  });
  createDocumentRuntimeBackup("after-document-update", { documentId: updated.id });
  res.json(updated);
});

app.delete("/api/documents/:id", requireAdminAccess, async (req, res) => {
  const target = await core.deleteDocument(req.params.id);

  if (!target) {
    return res.status(404).json({ message: "Document not found" });
  }

  if (target.fileName) {
    const resolved = path.resolve(uploadDir, target.fileName);
    if (resolved.startsWith(path.resolve(uploadDir) + path.sep)) {
      await fs.promises.rm(resolved, { force: true });
    }
  }
  const previewPath = previewService.previewPathFor(target);
  if (previewPath) {
    await fs.promises.rm(previewPath, { force: true });
  }
  supervisor.logActivity({
    type: "document.deleted",
    message: `Document deleted: ${target.title}`,
    actor: req.adminUser?.username || "admin",
    target: target.id
  });
  createDocumentRuntimeBackup("after-document-delete", { documentId: target.id });
  res.status(204).end();
});

// ── Presence system ───────────────────────────────────────────────────────────
const presenceMap = new Map(); // uuid → { username, displayName, role, page, lastSeen }
const PRESENCE_TTL = 70_000;

app.post("/api/presence/ping", (req, res) => {
  const { uuid, username, displayName, role, page } = req.body || {};
  if (!uuid) return res.status(400).json({ message: "uuid required" });
  presenceMap.set(uuid, { username: username || null, displayName: displayName || null, role: role || null, page: page || "/", lastSeen: Date.now() });
  const now = Date.now();
  let count = 0;
  for (const [k, v] of presenceMap) { if (now - v.lastSeen > PRESENCE_TTL) presenceMap.delete(k); else count++; }
  res.json({ count });
});

app.get("/api/admin/presence/users", requireAdminAccess, (_req, res) => {
  const now = Date.now();
  const users = [];
  for (const [, v] of presenceMap) {
    if (now - v.lastSeen <= PRESENCE_TTL) users.push({ ...v, secondsAgo: Math.round((now - v.lastSeen) / 1000) });
  }
  users.sort((a, b) => a.lastSeen - b.lastSeen);
  res.json(users);
});

// Auth audit log ───────────────────────────────────────────────────────────────
app.get("/api/admin/auth-audit", requireAdminAccess, async (_req, res) => {
  try {
    const auditFile = path.join(__dirname, "data", "auth", "auth_audit_log.json");
    let logs = [];
    try {
      const raw = await fs.promises.readFile(auditFile, "utf8");
      logs = JSON.parse(raw);
    } catch { /* file absent or unreadable — return empty */ }
    res.json(Array.isArray(logs) ? logs.slice(0, 200) : []);
  } catch { res.json([]); }
});

// Build stamp — dùng bởi BuildUpdateNotifier frontend để biết khi nào có bản mới
// Cached to avoid repeated disk reads on every poll (1-min TTL)
const buildStampFile = path.join(rootDir, "dist", "build-stamp.json");
let _buildStampCache = null;
let _buildStampCacheAt = 0;
app.get("/api/build-stamp", async (_req, res) => {
  try {
    const now = Date.now();
    if (!_buildStampCache || now - _buildStampCacheAt > 60_000) {
      try {
        const raw = await fs.promises.readFile(buildStampFile, "utf8");
        _buildStampCache = JSON.parse(raw);
      } catch {
        _buildStampCache = { ts: 0 };
      }
      _buildStampCacheAt = now;
    }
    res.json(_buildStampCache);
  } catch {
    res.json({ ts: 0 });
  }
});

app.get("/api/admin/github-sync/status", requireAdminAccess, (_req, res) => {
  res.json(githubSync.getStatus());
});

app.post("/api/admin/github-sync/run", requireAdminAccess, async (req, res) => {
  const triggeredBy = req.body?.triggeredBy || "manual";
  const result = await githubSync.runSync(triggeredBy);
  res.json(result);
});

app.use("/api", (req, res) => {
  res.status(404).json({
    code: "API_ROUTE_NOT_FOUND",
    message: "API route not found",
    path: req.originalUrl
  });
});

// Special route: luckysheet-viewer.html — allow Google Fonts for Vietnamese/Japanese support
const luckysheetViewerCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "connect-src 'none'",
  "font-src 'self' https://fonts.gstatic.com data:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'self'"
].join("; ");
app.get("/luckysheet-viewer.html", (req, res, next) => {
  res.setHeader("Content-Security-Policy", luckysheetViewerCsp);
  next();
});

const distDir = path.join(rootDir, "dist");
if (fs.existsSync(distDir)) {
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        const normalized = filePath.replace(/\\/g, "/");
        const ext = path.extname(filePath).toLowerCase();
        if (normalized.includes("/assets/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }
        if ([".png", ".jpg", ".jpeg", ".svg", ".webp", ".ico", ".woff", ".woff2"].includes(ext)) {
          res.setHeader("Cache-Control", "public, max-age=604800");
          return;
        }
        if ([".xml", ".txt", ".webmanifest"].includes(ext)) {
          res.setHeader("Cache-Control", "public, max-age=3600");
          return;
        }
        res.setHeader("Cache-Control", "no-cache");
      }
    })
  );
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    res.setHeader("Cache-Control", "no-cache");
    if (isNoindexClientRoute(req.path)) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.use((err, _req, res, next) => {
  if (!err) return next();
  const status = err.message === "Origin is not allowed" ? 403 : err.code === "LIMIT_FILE_SIZE" ? 413 : err.status || 500;
  res.status(status).json({
    message:
      status === 400
        ? "Invalid request payload"
        : status === 404
          ? "Not found"
        : status === 403
          ? "Origin is not allowed"
          : status === 413
            ? `File is larger than ${maxUploadMb} MB`
            : "Internal server error"
  });
});

// ─── CAPA Due-Date Reminder Scheduler ────────────────────────────────────────
const REMINDER_THRESHOLD_DAYS = [7, 3, 1];
const CAPA_CLOSED_STATUSES = new Set(["closed", "verified"]);
const SYSTEM_ACTOR = { id: "system", username: "system", displayName: "Hệ thống", role: "system", departmentId: "EHS" };

async function sendCapaDueReminderForAction(action, { daysLeft = null, manual = false } = {}) {
  if (!safetyArchitecture) return;
  const code  = action.code || action.id;
  const title = action.title || "CAPA";
  const due   = action.dueDate || action.due || "?";
  const daysText = daysLeft === 0 ? "Hôm nay là ngày đến hạn"
    : daysLeft === 1 ? "Còn 1 ngày đến hạn"
    : daysLeft != null ? `Còn ${daysLeft} ngày đến hạn`
    : "Sắp đến hạn";

  const notifTitle   = `⏰ Nhắc hạn CAPA: ${code}`;
  const notifMessage = `"${title}" — ${daysText}. Hạn: ${due}.`;
  const userIds = [action.ownerId, action.createdById].filter(Boolean);

  try {
    if (typeof safetyOps?.addNotification === "function") {
      await safetyOps.addNotification({
        type: "capa", entityType: "action",
        title: notifTitle,
        titleI18n: { vi: notifTitle, en: `⏰ CAPA Due Reminder: ${code}` },
        message: notifMessage,
        messageI18n: { vi: notifMessage, en: notifMessage },
        page: "/safety-6s/actions",
        forRoles: "",
        forDept: action.departmentCode || "",
        forUsers: userIds.join(","),
      });
    }
  } catch (err) {
    console.warn("[DueReminder] addNotification error:", err.message);
  }

  await safetyArchitecture.updateAction(action.id, {
    _reminderMode: true,
    _reminderDays: daysLeft,
    _reminderManual: manual,
    _reminderNote: manual ? "Nhắc thủ công bởi EHS" : `Nhắc tự động (${daysText})`,
  }, SYSTEM_ACTOR);

  emitNotificationChange({ type: "capa", action: "reminder", capaId: action.id });
}

async function runDueReminderSchedule() {
  if (typeof safetyArchitecture?.listActions !== "function") return;
  const todayStr = new Date().toISOString().slice(0, 10);
  try {
    const all    = await safetyArchitecture.listActions({ limit: 500 });
    const active = (Array.isArray(all) ? all : []).filter(a =>
      !CAPA_CLOSED_STATUSES.has(a.status) && (a.dueDate || a.due)
    );
    let sent = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const action of active) {
      const dueD = new Date(action.dueDate || action.due); dueD.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((dueD - today) / 86400000);
      if (!REMINDER_THRESHOLD_DAYS.includes(daysLeft)) continue;
      // Dedup: skip if already reminded today
      try {
        if (typeof safetyArchitecture.listActionLogs === "function") {
          const logs = await safetyArchitecture.listActionLogs(action.id);
          const alreadySent = (Array.isArray(logs) ? logs : []).some(l =>
            l.action === "due-date-reminder" && (l.createdAt || "").slice(0, 10) === todayStr
          );
          if (alreadySent) continue;
        }
      } catch {}
      await sendCapaDueReminderForAction(action, { daysLeft, manual: false });
      sent++;
    }
    console.log(`[DueReminder] ${todayStr}: checked ${active.length} active CAPAs, sent ${sent} reminder(s)`);
  } catch (err) {
    console.error("[DueReminder] Schedule error:", err.message);
  }
}

// First run after 90s (let DB/store initialise), then every 24h
setTimeout(() => {
  runDueReminderSchedule();
  setInterval(runDueReminderSchedule, 24 * 60 * 60 * 1000).unref();
}, 90_000).unref();

// Manual remind endpoint (EHS admin only)
app.post("/api/actions/:id/remind", requireSafetyAdminAccess, requireSafetyArchitectureStore, async (req, res) => {
  const action = await safetyArchitecture.getAction?.(req.params.id);
  if (!action) return res.status(404).json({ message: "CAPA not found" });
  if (CAPA_CLOSED_STATUSES.has(action.status))
    return res.status(400).json({ message: "CAPA đã đóng, không thể nhắc hạn" });
  const due = action.dueDate || action.due;
  let daysLeft = null;
  if (due) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dueD  = new Date(due);  dueD.setHours(0, 0, 0, 0);
    daysLeft = Math.round((dueD - today) / 86400000);
  }
  await sendCapaDueReminderForAction(action, { daysLeft, manual: true });
  res.json({ ok: true, message: "Đã gửi nhắc hạn thành công" });
});
// ─────────────────────────────────────────────────────────────────────────────

app.listen(port, "0.0.0.0", () => {
  console.log(`Company Utility Hub API listening on http://localhost:${port}`);
  restoreFilesToDisk(uploadDir).catch(() => {});
});
