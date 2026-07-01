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
import { createDocumentPreviewService } from "./core/documentPreviewService.js";
import { createRuntimeSupervisor } from "./core/runtimeSupervisor.js";
import { repairMojibakeText } from "./core/textEncoding.js";
import { loadLocalEnv } from "./loadEnv.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

loadLocalEnv(rootDir);

const dataDir = path.join(__dirname, "data");
const uploadDir = path.join(__dirname, "uploads");
const previewDir = path.join(__dirname, "previews");
const authDir = path.join(dataDir, "auth");
const appSettingsDir = path.join(dataDir, "app-settings");
const appSettingsFile = path.join(appSettingsDir, "settings.json");
const appLogoFile = path.join(appSettingsDir, "logo");
const defaultLogoFile = path.join(rootDir, "public", "images", "mani-logo-main.png");
const docsFile = path.join(dataDir, "documents.json");
const configFile = path.join(dataDir, "config.json");
const activityFile = path.join(dataDir, "activity.json");
const backupDir = path.join(dataDir, "backups");
const productionPreflightFile = path.join(rootDir, "qa", "reports", "production-preflight-summary.json");
const port = process.env.PORT || 3333;
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
// LibreOffice spreadsheet HTML uses <style> blocks and style attributes for cell borders/layout.
// Keep inline CSS narrowly scoped here while disabling scripts, forms, frames, objects, and network fetches.
const excelHtmlPreviewCsp = [
  "default-src 'none'",
  "script-src 'none'",
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
  "style-src 'self'",
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
const safetyOps = createMysqlSafetyOperationsStore({ rootDir });
const safetyArchitecture = createMysqlSafetyArchitectureStore({ rootDir });

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

const allowedLogoMimeTypes = new Set(["image/png", "image/jpeg", "image/svg+xml", "image/webp", "image/gif"]);
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, allowedLogoMimeTypes.has(String(file.mimetype || "").toLowerCase()));
  }
});

const createRateLimiter = ({ windowMs, max, keyPrefix, skip = () => false }) => {
  const hits = new Map();
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
app.use(
  "/uploads",
  express.static(uploadDir, {
    fallthrough: false,
    index: false,
    setHeaders(res, filePath) {
      const ext = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath);
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (ext === ".pdf") {
        res.setHeader("Content-Disposition", contentDispositionHeader("inline", fileName));
      } else if (![".png", ".jpg", ".jpeg"].includes(ext)) {
        res.setHeader("Content-Disposition", contentDispositionHeader("attachment", fileName));
      }
    }
  })
);

app.use(
  "/api",
  createRateLimiter({
    windowMs: 60 * 1000,
    max: Number(process.env.API_RATE_LIMIT_PER_MINUTE) || 300,
    keyPrefix: "api"
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

const requireRootAdminAccess = (req, res, next) =>
  requireAdminAccess(req, res, () => {
    if (req.adminUser?.role !== "admin") {
      return res.status(403).json({ message: "Root admin permission required", code: "ROOT_ADMIN_REQUIRED" });
    }
    return next();
  });

const documentActor = (req) => ({
  id: req.adminUser?.id || null,
  username: req.adminUser?.username || "admin",
  displayName: req.adminUser?.displayName || req.adminUser?.username || "admin",
  role: req.adminUser?.role || "admin"
});

const SAFETY_REVIEW_ROLES = new Set(["admin", "ehs", "leader"]);
const SAFETY_ADMIN_ROLES = new Set(["admin", "ehs"]);

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

const readAppSettings = () => {
  try {
    return JSON.parse(fs.readFileSync(appSettingsFile, "utf8"));
  } catch {
    return {};
  }
};

const writeAppSettings = (settings) => {
  fs.mkdirSync(appSettingsDir, { recursive: true });
  fs.writeFileSync(appSettingsFile, JSON.stringify(settings, null, 2), "utf8");
};

const appLogoContentType = (mimeType) =>
  allowedLogoMimeTypes.has(String(mimeType || "").toLowerCase()) ? String(mimeType).toLowerCase() : "image/png";

const currentLogoResponse = () => {
  const settings = readAppSettings();
  if (settings.logoMimeType && fs.existsSync(appLogoFile)) {
    return {
      hasCustomLogo: true,
      logoUrl: "/api/app-settings/logo",
      filePath: appLogoFile,
      mimeType: appLogoContentType(settings.logoMimeType)
    };
  }
  return {
    hasCustomLogo: false,
    logoUrl: fs.existsSync(defaultLogoFile) ? "/api/app-settings/logo" : null,
    filePath: defaultLogoFile,
    mimeType: "image/png"
  };
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "Company Utility Hub API" });
});

app.get("/api/auth/me", (req, res) => auth.me(req, res));

app.patch("/api/auth/me", (req, res) => auth.requireSession(req, res, () => auth.updateProfile(req, res)));

app.post("/api/auth/login", (req, res) => auth.login(req, res));

app.post("/api/auth/logout", (req, res) => auth.logout(req, res));

app.post("/api/auth/change-password", (req, res) => auth.requireSession(req, res, () => auth.changePassword(req, res)));

app.get("/api/app-settings", (_req, res) => {
  const logo = currentLogoResponse();
  res.json({ hasLogo: Boolean(logo.logoUrl), hasCustomLogo: logo.hasCustomLogo, logoUrl: logo.logoUrl });
});

app.get("/api/app-settings/logo", (_req, res) => {
  const logo = currentLogoResponse();
  if (!logo.logoUrl || !fs.existsSync(logo.filePath)) {
    return res.status(404).json({ message: "Logo not found", code: "LOGO_NOT_FOUND" });
  }
  res.setHeader("Content-Type", logo.mimeType);
  res.setHeader("Cache-Control", logo.hasCustomLogo ? "no-cache" : "public, max-age=3600");
  return res.sendFile(logo.filePath);
});

app.post("/api/app-settings/logo", requireAdminAccess, logoUpload.single("logo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Logo file is required", code: "LOGO_REQUIRED" });
  fs.mkdirSync(appSettingsDir, { recursive: true });
  fs.writeFileSync(appLogoFile, req.file.buffer);
  writeAppSettings({
    logoMimeType: appLogoContentType(req.file.mimetype),
    logoOriginalName: safeUploadName(decodeUploadFileName(req.file.originalname)),
    logoUpdatedAt: new Date().toISOString(),
    logoUpdatedBy: req.adminUser?.username || "admin"
  });
  res.json({ success: true, logoUrl: "/api/app-settings/logo" });
});

app.delete("/api/app-settings/logo", requireAdminAccess, (_req, res) => {
  if (fs.existsSync(appLogoFile)) fs.unlinkSync(appLogoFile);
  writeAppSettings({ logoDeletedAt: new Date().toISOString() });
  res.json({ success: true });
});

app.get("/api/admin/users", requireAdminAccess, (req, res) => auth.listAdminUsers(req, res));

app.post("/api/admin/users", requireAdminAccess, (req, res) => auth.createAdminUser(req, res));

app.put("/api/admin/users/:id", requireAdminAccess, (req, res) => auth.updateAdminUser(req, res));

app.post("/api/admin/users/:id/reset-password", requireAdminAccess, (req, res) => auth.resetAdminUserPassword(req, res));

app.delete("/api/admin/users/:id", requireAdminAccess, (req, res) => auth.deleteAdminUser(req, res));

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
  res.status(status.readiness.ready ? 200 : 503).json(status.readiness);
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

const safetyReferenceCatalog = Object.freeze({
  formulas: [
    {
      id: "risk-score",
      title: "Äiá»ƒm rá»§i ro cáº£nh bÃ¡o",
      expression: "riskScore = riskProbability x riskConsequence",
      description: "Ma tráº­n 5x5 dÃ¹ng trong modal Cáº£nh BÃ¡o NÃ³ng. GiÃ¡ trá»‹ xÃ¡c suáº¥t vÃ  háº­u quáº£ Ä‘á»u náº±m trong thang 1 Ä‘áº¿n 5.",
      icon: "Calculator",
      notes: ["1-3: LOW", "4-8: MEDIUM", "9-15: HIGH", "16-25: CRITICAL"]
    },
    {
      id: "risk-deadline",
      title: "Háº¡n xá»­ lÃ½ theo rá»§i ro",
      expression: "deadlineDays = 1 / 7 / 30 / 90 theo cáº¥p rá»§i ro",
      description: "Cáº£nh bÃ¡o cÃ ng nghiÃªm trá»ng cÃ ng cáº§n háº¡n xá»­ lÃ½ ngáº¯n hÆ¡n khi ngÆ°á»i dÃ¹ng chÆ°a nháº­p háº¡n riÃªng.",
      icon: "AlertTriangle",
      notes: ["CRITICAL: 1 ngÃ y", "HIGH: 7 ngÃ y", "MEDIUM: 30 ngÃ y", "LOW: 90 ngÃ y"]
    },
    {
      id: "checklist-score",
      title: "Äiá»ƒm checklist 6S",
      expression: "score = round(checkedCount / totalCount x 100)",
      description: "DÃ¹ng cho checklist bá»™ pháº­n vÃ  vÃ²ng 6S theo pillar trÃªn dashboard.",
      icon: "ClipboardCheck",
      notes: ["Tá»‘t: tá»« 80%", "Cáº§n cáº£i thiá»‡n: 60-79%", "Yáº¿u - Æ°u tiÃªn: dÆ°á»›i 60%"]
    },
    {
      id: "kpi-target",
      title: "Äáº¡t má»¥c tiÃªu KPI",
      expression: "metTarget = value >= target; violation_warning dÃ¹ng value <= target",
      description: "CÃ¡c KPI tÃ­ch cá»±c cáº§n Ä‘áº¡t hoáº·c vÆ°á»£t má»¥c tiÃªu; KPI vi pháº¡m/cáº£nh bÃ¡o cáº§n báº±ng hoáº·c tháº¥p hÆ¡n má»¥c tiÃªu.",
      icon: "Target",
      notes: ["Äiá»ƒm an toÃ n, checklist, Ä‘Ã o táº¡o: cÃ ng cao cÃ ng tá»‘t", "Vi pháº¡m / cáº£nh bÃ¡o: cÃ ng tháº¥p cÃ ng tá»‘t"]
    },
    {
      id: "kpi-approval",
      title: "Luá»“ng duyá»‡t KPI hai cáº¥p",
      expression: "pending_l1 -> pending_l2 -> approved | rejected",
      description: "Quáº£n lÃ½ bá»™ pháº­n duyá»‡t cáº¥p 1, EHS/admin xÃ¡c nháº­n cáº¥p 2 hoáº·c tá»« chá»‘i kÃ¨m lÃ½ do.",
      icon: "Workflow",
      notes: ["pending_l1: chá» quáº£n lÃ½", "pending_l2: chá» EHS", "approved/rejected: tráº¡ng thÃ¡i cuá»‘i"]
    },
    {
      id: "training-rate",
      title: "Tá»· lá»‡ hoÃ n thÃ nh Ä‘Ã o táº¡o",
      expression: "completionRate = round(completed / enrolled x 100)",
      description: "DÃ¹ng trÃªn trang ÄÃ o Táº¡o Ä‘á»ƒ theo dÃµi sá»‘ ngÆ°á»i Ä‘Ã£ hoÃ n thÃ nh so vá»›i sá»‘ Ä‘Æ°á»£c giao.",
      icon: "GraduationCap",
      notes: ["Náº¿u enrolled = 0 thÃ¬ hiá»ƒn thá»‹ 0%", "Sá»‘ liá»‡u láº¥y tá»« /api/training-courses"]
    },
    {
      id: "safety-average",
      title: "Äiá»ƒm an toÃ n ká»³ má»›i nháº¥t",
      expression: "averageSafety = round(sum(approved safety_score_monthly) / count)",
      description: "Trang KPI láº¥y cÃ¡c báº£n ghi Ä‘Ã£ duyá»‡t cá»§a loáº¡i safety_score_monthly Ä‘á»ƒ tÃ­nh Ä‘iá»ƒm trung bÃ¬nh theo ká»³.",
      icon: "BadgeCheck",
      notes: ["Má»¥c tiÃªu Ä‘iá»u hÃ nh hiá»‡n táº¡i: 95", "Chá»‰ tÃ­nh báº£n ghi Ä‘Ã£ duyá»‡t"]
    },
    {
      id: "audit-score",
      title: "Äiá»ƒm audit 6S",
      expression: "scorePercent = round(totalScore / maxScore x 100)",
      description: "TÃ­nh tá»« cÃ¢u há»i audit theo template EHS-QT-11/EHS-QT-12, dÃ¹ng cho cáº¥p EHS vÃ  bá»™ pháº­n.",
      icon: "ClipboardCheck",
      notes: [">= 90: tá»‘t", "80-89: cáº§n theo dÃµi", "< 80: táº¡o CAPA"]
    },
    {
      id: "action-on-time",
      title: "Tá»· lá»‡ CAPA Ä‘Ãºng háº¡n",
      expression: "onTimeRate = closedBeforeDue / closedActions x 100",
      description: "Theo dÃµi hÃ nh Ä‘á»™ng kháº¯c phá»¥c phÃ¡t sinh tá»« cáº£nh bÃ¡o, sá»± cá»‘ hoáº·c audit 6S.",
      icon: "Workflow",
      notes: ["done_by_owner cáº§n EHS verify", "reopened quay láº¡i ngÆ°á»i phá»¥ trÃ¡ch"]
    }
  ],
  routes: [
    { label: "Tá»•ng Quan", path: "/safety-6s", icon: "LayoutDashboard", page: "DashboardPage", api: ["/api/warnings", "/api/incidents", "/api/kpi-entries", "/api/checklists/pillar-summary"] },
    { label: "Cáº£nh BÃ¡o NÃ³ng", path: "/safety-6s/warnings", icon: "AlertTriangle", page: "WarningsPage", api: ["/api/warnings", "/api/warnings/:id/approve", "/api/warnings/:id/reject"] },
    { label: "BÃ¡o CÃ¡o Sá»± Cá»‘", path: "/safety-6s/incidents", icon: "ShieldAlert", page: "IncidentsPage", api: ["/api/incidents", "/api/incidents/:id/approve", "/api/incidents/:id/reject"] },
    { label: "Checklist 6S", path: "/safety-6s/checklist", icon: "ClipboardCheck", page: "SafetyChecklistPage", api: ["/api/checklists", "/api/checklists/summary", "/api/checklists/pillar-summary"] },
    { label: "Audit 6S", path: "/safety-6s/audits", icon: "ClipboardCheck", page: "SafetyAuditsPage", api: ["/api/audits", "/api/audit-templates", "/api/audits/:id/submit", "/api/audits/:id/review"] },
    { label: "CAPA", path: "/safety-6s/actions", icon: "Workflow", page: "SafetyActionsPage", api: ["/api/actions", "/api/actions/:id/submit-evidence", "/api/actions/:id/verify"] },
    { label: "Khu Vá»±c / QR", path: "/safety-6s/locations", icon: "MapPin", page: "SafetyLocationsPage", api: ["/api/locations", "/api/qr/:code"] },
    { label: "KYT", path: "/safety-6s/kyt", icon: "Target", page: "SafetySpecialProgramPage kyt", api: ["/api/safety/programs/kyt"] },
    { label: "PCCC & An ToÃ n Äiá»‡n", path: "/safety-6s/pccc", icon: "Flame", page: "SafetySpecialProgramPage pccc", api: ["/api/safety/programs/pccc"] },
    { label: "Y Táº¿ / TÃºi SÆ¡ Cá»©u", path: "/safety-6s/medical", icon: "BriefcaseMedical", page: "SafetySpecialProgramPage medical", api: ["/api/safety/programs/medical"] },
    { label: "Tá»± Kiá»ƒm Tra ATVSLÄ", path: "/safety-6s/self-inspection", icon: "ListChecks", page: "SafetySpecialProgramPage self-inspection", api: ["/api/safety/programs/self-inspection"] },
    { label: "KPI & Má»¥c TiÃªu", path: "/safety-6s/kpi", icon: "Target", page: "SafetyKpiPage", api: ["/api/kpi-entries", "/api/kpi-entries/:id/history"] },
    { label: "Nháº­p Liá»‡u KPI", path: "/safety-6s/data-entry", icon: "Upload", page: "SafetyDataEntryPage", api: ["/api/kpi-entries"] },
    { label: "PhÃª Duyá»‡t KPI", path: "/safety-6s/approval", icon: "CheckCircle2", page: "SafetyKpiPage approvalOnly", api: ["/api/kpi-entries/:id/approve-l1", "/api/kpi-entries/:id/approve-l2", "/api/kpi-entries/:id/reject-l1", "/api/kpi-entries/:id/reject-l2"] },
    { label: "TÃ i Liá»‡u", path: "/safety-6s/documents", icon: "FileText", page: "SafetyDocumentsPage", api: ["/api/documents"] },
    { label: "BÃ¡o CÃ¡o", path: "/safety-6s/reports", icon: "FileBarChart", page: "SafetyReportsPage", api: ["/api/reports"] },
    { label: "ÄÃ o Táº¡o", path: "/safety-6s/training", icon: "GraduationCap", page: "SafetyTrainingPage", api: ["/api/training-courses"] },
    { label: "Tham Chiáº¿u", path: "/safety-6s/reference", icon: "BookOpen", page: "SafetyReferencePage", api: ["/api/safety/reference"] },
    { label: "CÃ i Äáº·t", path: "/safety-6s/settings", icon: "Settings", page: "SafetySettingsPage", api: ["/api/config"] }
  ],
  modals: [
    {
      title: "ThÃªm Cáº£nh BÃ¡o An ToÃ n Má»›i",
      icon: "ShieldAlert",
      route: "/safety-6s/warnings",
      sections: ["TiÃªu Ä‘á» & danh má»¥c", "Vá»‹ trÃ­ phÃ¡t hiá»‡n", "ÄÃ¡nh giÃ¡ rá»§i ro", "MÃ´ táº£ & biá»‡n phÃ¡p", "PhÃ¢n cÃ´ng & báº±ng chá»©ng", "Tá»‡p Ä‘Ã­nh kÃ¨m"],
      primaryAction: "Gá»­i cáº£nh bÃ¡o"
    },
    {
      title: "LÃ½ Do Tá»« Chá»‘i Cáº£nh BÃ¡o",
      icon: "XCircle",
      route: "/safety-6s/warnings",
      sections: ["Cáº£nh bÃ¡o", "LÃ½ do tá»« chá»‘i", "NgÆ°á»i review"],
      primaryAction: "XÃ¡c nháº­n tá»« chá»‘i cáº£nh bÃ¡o"
    },
    {
      title: "BÃ¡o CÃ¡o Sá»± Cá»‘ Má»›i",
      icon: "ShieldAlert",
      route: "/safety-6s/incidents",
      sections: ["Thá»i gian & vá»‹ trÃ­", "PhÃ¢n loáº¡i & má»©c Ä‘á»™", "MÃ´ táº£ & nguyÃªn nhÃ¢n", "ThÆ°Æ¡ng vong & thiá»‡t háº¡i", "HÃ nh Ä‘á»™ng & liÃªn há»‡"],
      primaryAction: "Gá»­i bÃ¡o cÃ¡o"
    },
    {
      title: "LÃ½ Do Tá»« Chá»‘i Sá»± Cá»‘",
      icon: "XCircle",
      route: "/safety-6s/incidents",
      sections: ["Sá»± cá»‘", "LÃ½ do tá»« chá»‘i", "NgÆ°á»i review"],
      primaryAction: "XÃ¡c nháº­n tá»« chá»‘i sá»± cá»‘"
    },
    {
      title: "Nháº­p KPI Má»›i",
      icon: "Upload",
      route: "/safety-6s/data-entry",
      sections: ["Loáº¡i chá»‰ sá»‘ KPI", "Ká»³ & bá»™ pháº­n", "GiÃ¡ trá»‹ & ghi chÃº", "CÃ´ng thá»©c & API"],
      primaryAction: "Ná»™p dá»¯ liá»‡u KPI"
    },
    {
      title: "LÃ½ Do Tá»« Chá»‘i KPI",
      icon: "XCircle",
      route: "/safety-6s/approval",
      sections: ["Báº£n ghi KPI", "LÃ½ do tá»« chá»‘i", "Cáº¥p duyá»‡t"],
      primaryAction: "XÃ¡c nháº­n tá»« chá»‘i"
    },
    {
      title: "Chi Tiáº¿t KPI",
      icon: "Eye",
      route: "/safety-6s/kpi",
      sections: ["Tá»•ng quan KPI", "GiÃ¡ trá»‹ & má»¥c tiÃªu", "Ghi chÃº & lÃ½ do", "Má»‘c phÃª duyá»‡t", "Lá»‹ch sá»­ phÃª duyá»‡t"],
      primaryAction: "Xem chi tiáº¿t"
    },
    {
      title: "Táº¡o BÃ¡o CÃ¡o Má»›i",
      icon: "FileBarChart",
      route: "/safety-6s/reports",
      sections: ["ThÃ´ng tin bÃ¡o cÃ¡o", "NgÆ°á»i láº­p & ghi chÃº"],
      primaryAction: "LÆ°u bÃ¡o cÃ¡o"
    },
    {
      title: "ThÃªm KhÃ³a ÄÃ o Táº¡o",
      icon: "GraduationCap",
      route: "/safety-6s/training",
      sections: ["ThÃ´ng tin khÃ³a", "Lá»‹ch & Ä‘á»‘i tÆ°á»£ng"],
      primaryAction: "LÆ°u khÃ³a Ä‘Ã o táº¡o"
    }
  ],
  icons: [
    { group: "Navigation", icon: "LayoutDashboard", label: "Tá»•ng Quan", usage: "Äiá»ƒm vÃ o dashboard Safety - 6S", route: "/safety-6s" },
    { group: "Navigation", icon: "AlertTriangle", label: "Cáº£nh BÃ¡o NÃ³ng", usage: "Trang rá»§i ro/cáº£nh bÃ¡o theo ma tráº­n 5x5", route: "/safety-6s/warnings" },
    { group: "Navigation", icon: "ShieldAlert", label: "BÃ¡o CÃ¡o Sá»± Cá»‘", usage: "Trang Ä‘iá»u tra sá»± cá»‘, root cause vÃ  hÃ nh Ä‘á»™ng", route: "/safety-6s/incidents" },
    { group: "Navigation", icon: "ClipboardCheck", label: "Checklist 6S", usage: "Checklist theo bá»™ pháº­n/ká»³", route: "/safety-6s/checklist" },
    { group: "Navigation", icon: "ClipboardCheck", label: "Audit 6S", usage: "Láº­p lá»‹ch, cháº¥m Ä‘iá»ƒm vÃ  review audit 6S", route: "/safety-6s/audits" },
    { group: "Navigation", icon: "Workflow", label: "CAPA", usage: "Theo dÃµi hÃ nh Ä‘á»™ng kháº¯c phá»¥c/phÃ²ng ngá»«a", route: "/safety-6s/actions" },
    { group: "Navigation", icon: "MapPin", label: "Khu vá»±c / QR", usage: "Quáº£n lÃ½ khu vá»±c, Ä‘iá»ƒm QR vÃ  pháº¡m vi bá»™ pháº­n", route: "/safety-6s/locations" },
    { group: "Navigation", icon: "Target", label: "KYT", usage: "LÆ°á»ng trÆ°á»›c nguy hiá»ƒm theo Step 1/Step 2 vÃ  má»¥c tiÃªu hÃ nh Ä‘á»™ng", route: "/safety-6s/kyt" },
    { group: "Navigation", icon: "Flame", label: "PCCC & An toÃ n Ä‘iá»‡n", usage: "Kiá»ƒm tra PCCC, Ä‘iá»‡n, lá»‘i thoÃ¡t hiá»ƒm vÃ  báº±ng chá»©ng kháº¯c phá»¥c", route: "/safety-6s/pccc" },
    { group: "Navigation", icon: "BriefcaseMedical", label: "Y táº¿ / TÃºi sÆ¡ cá»©u", usage: "Theo dÃµi phÃ²ng y táº¿, tÃºi sÆ¡ cá»©u, váº­t tÆ° vÃ  nhu cáº§u mua", route: "/safety-6s/medical" },
    { group: "Navigation", icon: "ListChecks", label: "Tá»± kiá»ƒm tra ATVSLÄ", usage: "BiÃªn báº£n tá»± kiá»ƒm tra, Ä‘oÃ n kiá»ƒm tra, káº¿t luáº­n vÃ  CAPA", route: "/safety-6s/self-inspection" },
    { group: "Navigation", icon: "Target", label: "KPI & Má»¥c TiÃªu", usage: "Theo dÃµi KPI, má»¥c tiÃªu vÃ  tráº¡ng thÃ¡i duyá»‡t", route: "/safety-6s/kpi" },
    { group: "Navigation", icon: "Upload", label: "Nháº­p Liá»‡u KPI", usage: "Gá»­i báº£n ghi KPI má»›i", route: "/safety-6s/data-entry" },
    { group: "Navigation", icon: "CheckCircle2", label: "PhÃª Duyá»‡t KPI", usage: "Duyá»‡t KPI cáº¥p QL/EHS", route: "/safety-6s/approval" },
    { group: "Navigation", icon: "FileText", label: "TÃ i Liá»‡u", usage: "LiÃªn káº¿t thÆ° viá»‡n tÃ i liá»‡u Safety", route: "/safety-6s/documents" },
    { group: "Navigation", icon: "FileBarChart", label: "BÃ¡o CÃ¡o", usage: "Táº¡o vÃ  xem bÃ¡o cÃ¡o Safety - 6S", route: "/safety-6s/reports" },
    { group: "Navigation", icon: "GraduationCap", label: "ÄÃ o Táº¡o", usage: "Theo dÃµi khÃ³a Ä‘Ã o táº¡o an toÃ n", route: "/safety-6s/training" },
    { group: "Navigation", icon: "BookOpen", label: "Tham Chiáº¿u", usage: "CÃ´ng thá»©c, API, route, modal vÃ  icon", route: "/safety-6s/reference" },
    { group: "Navigation", icon: "Settings", label: "CÃ i Äáº·t", usage: "ThÃ´ng tin cáº¥u hÃ¬nh Safety", route: "/safety-6s/settings" },
    { group: "Action", icon: "Plus", label: "Táº¡o má»›i", usage: "Má»Ÿ modal thÃªm cáº£nh bÃ¡o, sá»± cá»‘, bÃ¡o cÃ¡o, Ä‘Ã o táº¡o" },
    { group: "Action", icon: "Send", label: "Gá»­i/Ná»™p", usage: "Gá»­i cáº£nh bÃ¡o, sá»± cá»‘ hoáº·c KPI" },
    { group: "Action", icon: "Loader2", label: "Äang xá»­ lÃ½", usage: "Spinner khi submit/create/reject Ä‘ang pending" },
    { group: "Action", icon: "Eye", label: "Chi tiáº¿t", usage: "Má»Ÿ khá»‘i details cá»§a cáº£nh bÃ¡o/sá»± cá»‘" },
    { group: "Action", icon: "Upload", label: "ÄÃ­nh kÃ¨m", usage: "Chá»n tá»‡p báº±ng chá»©ng trong modal cáº£nh bÃ¡o" },
    { group: "Action", icon: "XCircle", label: "Tá»« chá»‘i", usage: "Modal nháº­p lÃ½ do tá»« chá»‘i cáº£nh bÃ¡o, sá»± cá»‘, KPI" },
    { group: "Formula", icon: "Calculator", label: "CÃ´ng thá»©c", usage: "Äiá»ƒm rá»§i ro vÃ  phÃ©p tÃ­nh váº­n hÃ nh" },
    { group: "Formula", icon: "Sigma", label: "Tá»•ng há»£p", usage: "Danh sÃ¡ch cÃ´ng thá»©c trÃªn trang tham chiáº¿u" },
    { group: "Data", icon: "Database", label: "API", usage: "Báº£ng endpoint Safety - 6S" },
    { group: "Data", icon: "Workflow", label: "Luá»“ng", usage: "Luá»“ng duyá»‡t vÃ  modal liÃªn quan" },
    { group: "Data", icon: "ExternalLink", label: "Link", usage: "Má»Ÿ route phá»¥ tá»« trang tham chiáº¿u" }
  ],
  endpoints: [
    { method: "GET", path: "/api/safety/reference", module: "Reference", purpose: "Tráº£ vá» cÃ´ng thá»©c, route, modal, icon vÃ  endpoint Safety - 6S", auth: "Safety session" },
    { method: "GET", path: "/api/safety/architecture", module: "Architecture", purpose: "TÃ³m táº¯t 3 cáº¥p cÃ´ng ty/EHS/bá»™ pháº­n, tÃ i liá»‡u, audit vÃ  CAPA", auth: "Safety session" },
    { method: "GET", path: "/api/safety/document-architecture", module: "Architecture", purpose: "Mapping tÃ i liá»‡u ATVSLÄ - 6S Ä‘Ã£ index sang cáº¥p cÃ´ng ty/EHS/bá»™ pháº­n vÃ  module web Ä‘á» xuáº¥t", auth: "Safety session" },
    { method: "GET", path: "/api/safety/programs", module: "Special Programs", purpose: "Danh sÃ¡ch chÆ°Æ¡ng trÃ¬nh chuyÃªn Ä‘á» KYT/PCCC/Y táº¿/Tá»± kiá»ƒm tra", auth: "Safety session" },
    { method: "GET", path: "/api/safety/programs/:id", module: "Special Programs", purpose: "Dá»¯ liá»‡u trang chuyÃªn Ä‘á» gá»“m tÃ i liá»‡u gá»‘c, workflow, checklist, records vÃ  chart", auth: "Safety session" },
    { method: "GET", path: "/api/safety/departments", module: "Architecture", purpose: "Master 24 bá»™ pháº­n Safety", auth: "Safety session" },
    { method: "POST", path: "/api/documents/import-manifest", module: "Documents", purpose: "Import tÃ i liá»‡u trong tai lieu, táº¡o metadata vÃ  text index", auth: "EHS/Admin" },
    { method: "GET", path: "/api/documents/:id/text", module: "Documents", purpose: "Äá»c text chunks/OCR status cá»§a tÃ i liá»‡u Safety", auth: "Safety session" },
    { method: "POST", path: "/api/documents/:id/ocr", module: "Documents", purpose: "Cháº¡y láº¡i trÃ­ch xuáº¥t text hoáº·c Ä‘Æ°a PDF scan vÃ o hÃ ng OCR", auth: "EHS/Admin" },
    { method: "GET", path: "/api/audit-templates", module: "Audit", purpose: "Danh sÃ¡ch template vÃ  cÃ¢u há»i audit 6S", auth: "Safety session" },
    { method: "POST", path: "/api/audits", module: "Audit", purpose: "Táº¡o audit 6S theo bá»™ pháº­n/khu vá»±c", auth: "Safety session" },
    { method: "PATCH", path: "/api/audits/:id", module: "Audit", purpose: "Cáº­p nháº­t cÃ¢u tráº£ lá»i, Ä‘iá»ƒm vÃ  finding", auth: "Safety session" },
    { method: "POST", path: "/api/audits/:id/submit", module: "Audit", purpose: "Ná»™p audit vÃ  tá»± táº¡o CAPA tá»« Ä‘iá»ƒm lá»—i", auth: "Safety session" },
    { method: "POST", path: "/api/audits/:id/review", module: "Audit", purpose: "EHS review audit", auth: "EHS/Admin" },
    { method: "GET", path: "/api/actions", module: "CAPA", purpose: "Danh sÃ¡ch hÃ nh Ä‘á»™ng kháº¯c phá»¥c/phÃ²ng ngá»«a", auth: "Safety session" },
    { method: "POST", path: "/api/actions", module: "CAPA", purpose: "Táº¡o CAPA thá»§ cÃ´ng hoáº·c tá»« cáº£nh bÃ¡o/sá»± cá»‘/audit", auth: "Safety session" },
    { method: "PATCH", path: "/api/actions/:id", module: "CAPA", purpose: "Cáº­p nháº­t owner, háº¡n xá»­ lÃ½, tráº¡ng thÃ¡i", auth: "Safety session" },
    { method: "POST", path: "/api/actions/:id/submit-evidence", module: "CAPA", purpose: "NgÆ°á»i phá»¥ trÃ¡ch gá»­i báº±ng chá»©ng hoÃ n thÃ nh", auth: "Safety session" },
    { method: "POST", path: "/api/actions/:id/verify", module: "CAPA", purpose: "EHS xÃ¡c minh Ä‘Ã³ng/má»Ÿ láº¡i CAPA", auth: "EHS/Admin" },
    { method: "GET", path: "/api/locations", module: "Locations", purpose: "Danh sÃ¡ch khu vá»±c/QR theo bá»™ pháº­n", auth: "Safety session" },
    { method: "POST", path: "/api/locations", module: "Locations", purpose: "Táº¡o khu vá»±c hoáº·c mÃ£ QR Safety", auth: "Safety session" },
    { method: "GET", path: "/api/qr/:code", module: "Locations", purpose: "Tra cá»©u khu vá»±c tá»« mÃ£ QR", auth: "Safety session" },
    { method: "GET", path: "/api/warnings", module: "Warnings", purpose: "Danh sÃ¡ch cáº£nh bÃ¡o theo quyá»n/bá»™ pháº­n", auth: "Safety session" },
    { method: "POST", path: "/api/warnings", module: "Warnings", purpose: "Táº¡o cáº£nh bÃ¡o má»›i tá»« modal Cáº£nh BÃ¡o NÃ³ng", auth: "Safety session" },
    { method: "PUT", path: "/api/warnings/:id", module: "Warnings", purpose: "Cáº­p nháº­t cáº£nh bÃ¡o", auth: "Safety session" },
    { method: "POST", path: "/api/warnings/:id/approve", module: "Warnings", purpose: "Duyá»‡t cáº£nh bÃ¡o", auth: "Reviewer/EHS" },
    { method: "POST", path: "/api/warnings/:id/reject", module: "Warnings", purpose: "Tá»« chá»‘i cáº£nh bÃ¡o kÃ¨m lÃ½ do", auth: "Reviewer/EHS" },
    { method: "GET", path: "/api/incidents", module: "Incidents", purpose: "Danh sÃ¡ch sá»± cá»‘", auth: "Safety session" },
    { method: "POST", path: "/api/incidents", module: "Incidents", purpose: "Táº¡o bÃ¡o cÃ¡o sá»± cá»‘ má»›i", auth: "Safety session" },
    { method: "PUT", path: "/api/incidents/:id", module: "Incidents", purpose: "Cáº­p nháº­t sá»± cá»‘", auth: "Safety session" },
    { method: "POST", path: "/api/incidents/:id/approve", module: "Incidents", purpose: "Duyá»‡t Ä‘iá»u tra sá»± cá»‘", auth: "Reviewer/EHS" },
    { method: "POST", path: "/api/incidents/:id/reject", module: "Incidents", purpose: "Tá»« chá»‘i Ä‘iá»u tra sá»± cá»‘ kÃ¨m lÃ½ do", auth: "Reviewer/EHS" },
    { method: "GET", path: "/api/incidents/:id/attachments", module: "Incidents", purpose: "Láº¥y tá»‡p Ä‘Ã­nh kÃ¨m sá»± cá»‘", auth: "Safety session" },
    { method: "GET", path: "/api/kpi-entries", module: "KPI", purpose: "Danh sÃ¡ch báº£n ghi KPI", auth: "Safety session" },
    { method: "POST", path: "/api/kpi-entries", module: "KPI", purpose: "Ná»™p dá»¯ liá»‡u KPI", auth: "Safety session" },
    { method: "GET", path: "/api/kpi-entries/:id/history", module: "KPI", purpose: "Lá»‹ch sá»­ duyá»‡t KPI", auth: "Safety session" },
    { method: "POST", path: "/api/kpi-entries/:id/approve-l1", module: "KPI", purpose: "Quáº£n lÃ½ bá»™ pháº­n duyá»‡t cáº¥p 1", auth: "Reviewer/Leader" },
    { method: "POST", path: "/api/kpi-entries/:id/approve-l2", module: "KPI", purpose: "EHS/admin duyá»‡t cáº¥p 2", auth: "EHS/Admin" },
    { method: "POST", path: "/api/kpi-entries/:id/reject-l1", module: "KPI", purpose: "Tá»« chá»‘i KPI cáº¥p 1 kÃ¨m lÃ½ do", auth: "Reviewer/Leader" },
    { method: "POST", path: "/api/kpi-entries/:id/reject-l2", module: "KPI", purpose: "Tá»« chá»‘i KPI cáº¥p 2 kÃ¨m lÃ½ do", auth: "EHS/Admin" },
    { method: "GET", path: "/api/checklists", module: "Checklist", purpose: "Láº¥y checklist theo bá»™ pháº­n/ká»³", auth: "Safety session" },
    { method: "POST", path: "/api/checklists", module: "Checklist", purpose: "LÆ°u checklist 6S", auth: "Safety session" },
    { method: "GET", path: "/api/checklists/template", module: "Checklist", purpose: "Láº¥y template biá»ƒu kiá»ƒm tra 6S hÃ ng ngÃ y", auth: "Safety session" },
    { method: "GET", path: "/api/checklists/summary", module: "Checklist", purpose: "Tá»•ng há»£p Ä‘iá»ƒm checklist", auth: "Safety session" },
    { method: "GET", path: "/api/checklists/pillar-summary", module: "Checklist", purpose: "Tá»•ng há»£p 6 pillar cho dashboard 6S", auth: "Safety session" },
    { method: "GET", path: "/api/reports", module: "Reports", purpose: "Danh sÃ¡ch bÃ¡o cÃ¡o Safety - 6S", auth: "Safety session" },
    { method: "POST", path: "/api/reports", module: "Reports", purpose: "Táº¡o bÃ¡o cÃ¡o má»›i", auth: "Safety session" },
    { method: "PUT", path: "/api/reports/:id", module: "Reports", purpose: "Cáº­p nháº­t bÃ¡o cÃ¡o", auth: "Safety session" },
    { method: "DELETE", path: "/api/reports/:id", module: "Reports", purpose: "XÃ³a má»m bÃ¡o cÃ¡o", auth: "Safety session" },
    { method: "GET", path: "/api/training-courses", module: "Training", purpose: "Danh sÃ¡ch khÃ³a Ä‘Ã o táº¡o", auth: "Safety session" },
    { method: "POST", path: "/api/training-courses", module: "Training", purpose: "Táº¡o khÃ³a Ä‘Ã o táº¡o", auth: "EHS/Admin" },
    { method: "PUT", path: "/api/training-courses/:id", module: "Training", purpose: "Cáº­p nháº­t khÃ³a Ä‘Ã o táº¡o", auth: "EHS/Admin" },
    { method: "DELETE", path: "/api/training-courses/:id", module: "Training", purpose: "XÃ³a má»m khÃ³a Ä‘Ã o táº¡o", auth: "EHS/Admin" },
    { method: "GET", path: "/api/documents", module: "Documents", purpose: "TÃ i liá»‡u Safety trong thÆ° viá»‡n MHChub", auth: "Public/list policy hiá»‡n táº¡i" }
  ]
});

app.get("/api/safety/summary", async (_req, res) => {
  res.json(await core.getSafetySummary());
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
    return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y chÆ°Æ¡ng trÃ¬nh Safety." });
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
  res.json(await safetyArchitecture.listActions(scopedSafetyArchitectureQuery(req)));
});

app.post("/api/actions", requireSafetyArchitectureSession, async (req, res) => {
  res.status(201).json(await safetyArchitecture.createAction(req.body || {}, safetyActor(req)));
});

app.patch("/api/actions/:id", requireSafetyArchitectureSession, async (req, res) => {
  const updated = await safetyArchitecture.updateAction(req.params.id, req.body || {}, safetyActor(req));
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
  res.json(updated);
});

app.get("/api/locations", requireSafetyArchitectureSession, async (req, res) => {
  res.json(await safetyArchitecture.listLocations(scopedSafetyArchitectureQuery(req)));
});

app.post("/api/locations", requireSafetyArchitectureSession, async (req, res) => {
  res.status(201).json(await safetyArchitecture.createLocation(req.body || {}, safetyActor(req)));
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

app.get("/api/training-records", requireSafetyArchitectureSession, async (req, res) => {
  res.json(await safetyArchitecture.listTrainingRecords(scopedSafetyArchitectureQuery(req)));
});

app.post("/api/training-records", requireSafetyArchitectureSession, async (req, res) => {
  res.status(201).json(await safetyArchitecture.createTrainingRecord(req.body || {}, safetyActor(req)));
});

const isTruthyQueryFlag = (value) => {
  if (Array.isArray(value)) return value.some(isTruthyQueryFlag);
  return value === true || String(value || "").toLowerCase() === "true";
};

app.get("/api/safety-bulletins", async (req, res) => {
  const includeDrafts = isTruthyQueryFlag(req.query.includeDrafts);
  const includeDeleted = isTruthyQueryFlag(req.query.includeDeleted);
  if (includeDeleted) {
    return requireRootAdminAccess(req, res, async () => {
      res.json(await core.getSafetyBulletins({ ...req.query, includeDrafts: true, includeDeleted: true }));
    });
  }
  if (includeDrafts) {
    return requireAdminAccess(req, res, async () => {
      res.json(await core.getSafetyBulletins({ ...req.query, includeDrafts: true, includeDeleted: false }));
    });
  }
  return res.json(await core.getSafetyBulletins({ ...req.query, includeDeleted: false }));
});

app.get("/api/safety-bulletins/:id", async (req, res) => {
  const bulletin = await core.getSafetyBulletin(req.params.id);
  if (!bulletin || bulletin.deleted === true || bulletin.published === false) {
    return res.status(404).json({ message: "Safety bulletin not found" });
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

app.delete("/api/safety-bulletins/:id", requireRootAdminAccess, async (req, res) => {
  const actor = documentActor(req);
  const updated = await core.deleteSafetyBulletin(req.params.id, actor);
  if (!updated) {
    return res.status(404).json({ message: "Safety bulletin not found" });
  }
  supervisor.logActivity({
    type: "safety-bulletin.deleted",
    message: `Safety bulletin deleted: ${updated.id}`,
    actor: actor.username,
    target: updated.id
  });
  res.json(updated);
});

app.post("/api/safety-bulletins/:id/restore", requireRootAdminAccess, async (req, res) => {
  const actor = documentActor(req);
  const updated = await core.restoreSafetyBulletin(req.params.id, actor);
  if (!updated) {
    return res.status(404).json({ message: "Safety bulletin not found" });
  }
  supervisor.logActivity({
    type: "safety-bulletin.restored",
    message: `Safety bulletin restored: ${updated.id}`,
    actor: actor.username,
    target: updated.id
  });
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
  res.status(201).json(created);
});

app.put("/api/warnings/:id", requireSafetySession, async (req, res) => {
  const updated = await safetyOps.updateWarning(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Safety warning not found" });
  res.json(updated);
});

app.post("/api/warnings/:id/approve", requireSafetyReviewAccess, async (req, res) => {
  const updated = await safetyOps.approveWarning(req.params.id, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Safety warning not found" });
  res.json(updated);
});

app.post("/api/warnings/:id/reject", requireSafetyReviewAccess, async (req, res) => {
  const updated = await safetyOps.rejectWarning(req.params.id, req.body?.reason || "", safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Safety warning not found" });
  res.json(updated);
});

// Táº¡o Viá»‡c Cáº§n LÃ m (CAPA Action) tá»« Cáº£nh BÃ¡o - theo Maplogic
app.post("/api/warnings/:id/create-action", requireSafetyReviewAccess, async (req, res) => {
  try {
    const warning = (await safetyOps.listWarnings({ id: req.params.id }))?.[0];
    if (!warning) return res.status(404).json({ message: "Safety warning not found" });

    const actor = safetyActor(req);
    const actionInput = {
      title: req.body?.title || warning.title || "Kháº¯c phá»¥c cáº£nh bÃ¡o",
      description: req.body?.description || warning.description || "",
      sourceType: "warning",
      sourceId: warning.id,
      sourceCode: warning.code || "",
      departmentCode: req.body?.departmentCode || warning.department || actor.departmentId || "EHS",
      priority: req.body?.priority || (Number(warning.riskScore) >= 15 ? "high" : Number(warning.riskScore) >= 8 ? "medium" : "low"),
      status: "open",
      ownerId: req.body?.ownerId || "",
      ownerName: req.body?.ownerName || warning.responsiblePerson || "",
      dueDate: req.body?.dueDate || warning.deadline || null,
      evidenceNotes: req.body?.evidenceNotes || ""
    };

    const action = await safetyArchitecture.createAction(actionInput, actor);

    // Cáº­p nháº­t tráº¡ng thÃ¡i Warning thÃ nh IN_PROGRESS
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
    res.status(500).json({ message: "KhÃ´ng thá»ƒ táº¡o viá»‡c cáº§n lÃ m tá»« cáº£nh bÃ¡o" });
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
  res.status(201).json(created);
});

app.put("/api/incidents/:id", requireSafetySession, async (req, res) => {
  const updated = await safetyOps.updateIncident(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Safety incident not found" });
  res.json(updated);
});

app.post("/api/incidents/:id/approve", requireSafetyReviewAccess, async (req, res) => {
  const updated = await safetyOps.approveIncident(req.params.id, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Safety incident not found" });
  res.json(updated);
});

app.post("/api/incidents/:id/reject", requireSafetyReviewAccess, async (req, res) => {
  const updated = await safetyOps.rejectIncident(req.params.id, req.body?.reason || "", safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Safety incident not found" });
  res.json(updated);
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

app.get("/api/notifications", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.listNotifications(safetyActor(req)));
});

app.get("/api/notifications/stream", requireSafetySession, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const writeEvent = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  writeEvent({ type: "connected" });
  const heartbeat = setInterval(() => writeEvent({ type: "connected" }), 25000);
  req.on("close", () => {
    clearInterval(heartbeat);
    res.end();
  });
});

app.post("/api/notifications/:id/read", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.markNotificationRead(req.params.id, safetyActor(req)));
});

app.post("/api/notifications/read-all", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.markAllNotificationsRead(safetyActor(req)));
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
  res.setHeader("Content-Disposition", `attachment; filename="safety-meetings${year}.csv"`);
  res.send("\uFEFF" + csv);
});

app.get("/api/safety-meetings/:id", requireSafetySession, async (req, res) => {
  const meeting = await safetyOps.getSafetyMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ message: "Safety meeting not found" });
  res.json(meeting);
});

app.post("/api/safety-meetings", requireSafetyAdminAccess, async (req, res) => {
  const meeting = await safetyOps.createSafetyMeeting(req.body || {}, safetyActor(req));
  res.status(201).json(meeting);
});

app.put("/api/safety-meetings/:id", requireSafetyAdminAccess, async (req, res) => {
  const updated = await safetyOps.updateSafetyMeeting(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Safety meeting not found" });
  res.json(updated);
});

app.post("/api/safety-meetings/:id/complete", requireSafetyAdminAccess, async (req, res) => {
  const meeting = await safetyOps.completeSafetyMeeting(req.params.id, req.body || {}, safetyActor(req));
  if (!meeting) return res.status(404).json({ message: "Safety meeting not found" });
  res.json(meeting);
});

app.patch("/api/safety-meetings/:id/actions/:actionId", requireSafetySession, async (req, res) => {
  const meeting = await safetyOps.updateMeetingActionItem(req.params.id, req.params.actionId, req.body || {}, safetyActor(req));
  if (!meeting) return res.status(404).json({ message: "Safety meeting or action not found" });
  res.json(meeting);
});

app.delete("/api/safety-meetings/:id", requireSafetyAdminAccess, async (req, res) => {
  res.json(await safetyOps.deleteSafetyMeeting(req.params.id, safetyActor(req)));
});

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
  res.setHeader("Content-Disposition", `attachment; filename="inspection-plans${year}.csv"`);
  res.send("\uFEFF" + csv);
});

app.get("/api/inspection-plans/:id", requireSafetySession, async (req, res) => {
  const plan = await safetyOps.getInspectionPlan(req.params.id);
  if (!plan) return res.status(404).json({ message: "Inspection plan not found" });
  res.json(plan);
});

app.post("/api/inspection-plans", requireSafetyAdminAccess, async (req, res) => {
  const plan = await safetyOps.createInspectionPlan(req.body || {}, safetyActor(req));
  res.status(201).json(plan);
});

app.put("/api/inspection-plans/:id", requireSafetyAdminAccess, async (req, res) => {
  const updated = await safetyOps.updateInspectionPlan(req.params.id, req.body || {}, safetyActor(req));
  if (!updated) return res.status(404).json({ message: "Inspection plan not found" });
  res.json(updated);
});

app.post("/api/inspection-plans/:id/approve", requireSafetyAdminAccess, async (req, res) => {
  const plan = await safetyOps.approveInspectionPlan(req.params.id, safetyActor(req));
  if (!plan) return res.status(404).json({ message: "Inspection plan not found" });
  res.json(plan);
});

app.post("/api/inspection-plans/:id/cancel", requireSafetyAdminAccess, async (req, res) => {
  const plan = await safetyOps.cancelInspectionPlan(req.params.id, safetyActor(req));
  if (!plan) return res.status(404).json({ message: "Inspection plan not found" });
  res.json(plan);
});

app.patch("/api/inspection-plans/:id/departments/:deptCode", requireSafetySession, async (req, res) => {
  const plan = await safetyOps.updatePlanDepartment(req.params.id, req.params.deptCode, req.body || {}, safetyActor(req));
  if (!plan) return res.status(404).json({ message: "Inspection plan or department not found" });
  res.json(plan);
});

app.delete("/api/inspection-plans/:id", requireSafetyAdminAccess, async (req, res) => {
  res.json(await safetyOps.deleteInspectionPlan(req.params.id, safetyActor(req)));
});

app.get("/api/safety/dept-report", requireSafetySession, async (req, res) => {
  if (!req.query.dept) return res.status(400).json({ message: "Missing dept" });
  res.json(await safetyOps.deptReport(req.query));
});

app.get("/api/safety/company-report", requireSafetySession, async (req, res) => {
  res.json(await safetyOps.companyReport(req.query));
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

  const ext = path.extname(resolved).toLowerCase();
  const refresh = req.query.refresh === "true";
  if (![".xls", ".xlsx", ".ods", ".csv"].includes(ext)) {
    return res.status(422).json({
      message: "LibreOffice HTML preview is only available for spreadsheet documents",
      document,
      supported: false,
      reason: "LibreOffice HTML preview is only available for spreadsheet documents",
      converter: previewService.getConverterStatus()
    });
  }

  try {
    const preview = await previewService.createSpreadsheetHtmlPreview({
      document,
      sourcePath: resolved,
      force: refresh
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

    res.json({
      document,
      kind: "excel-html",
      supported: true,
      source: "libreoffice-html",
      url: `/api/documents/${encodeURIComponent(document.id)}/excel-html-preview${refresh ? "?refresh=true" : ""}`,
      fallbackUrl: `/api/documents/${encodeURIComponent(document.id)}/preview-file${refresh ? "?refresh=true" : ""}`
    });
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

app.use("/api", (req, res) => {
  res.status(404).json({
    code: "API_ROUTE_NOT_FOUND",
    message: "API route not found",
    path: req.originalUrl
  });
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

app.listen(port, "0.0.0.0", () => {
  console.log(`Company Utility Hub API listening on http://localhost:${port}`);
});

