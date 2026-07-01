import crypto from "crypto";
import fs from "fs";
import path from "path";

const HASH_PREFIX = "pbkdf2_sha256";
const ITERATIONS = 210000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_BLOCK_MS = 2 * 60 * 1000;
const COOKIE_NAME = "mhchub_admin_auth";
const AUTH_ROLES = new Set(["admin", "ehs", "leader", "viewer"]);
const ADMIN_ROLES = new Set(["admin", "ehs", "leader"]);

const readJson = (filePath, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
};

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
};

const base64Url = (input) => Buffer.from(input).toString("base64url");

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return `${HASH_PREFIX}$${ITERATIONS}$${salt}$${hash}`;
};

const verifyPassword = (password, storedHash) => {
  const [prefix, iterationsRaw, salt, expectedHash] = String(storedHash || "").split("$");
  if (prefix !== HASH_PREFIX || !salt || !expectedHash) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations < 100000) return false;

  const actual = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST);
  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
};

const parseCookies = (header) => {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
};

const normalizeIp = (value) => {
  const first = String(value || "").split(",")[0].trim();
  if (!first) return "";
  if (first === "::1") return "127.0.0.1";
  if (first.startsWith("::ffff:")) return first.slice(7);
  return first;
};

export const createAuthService = ({ authDir, adminPin, appEnv, trustProxy = false, store = null }) => {
  const usersFile = path.join(authDir, "users.json");
  const auditFile = path.join(authDir, "auth_audit_log.json");
  const attemptsFile = path.join(authDir, "auth_login_attempts.json");
  const rawSecret = String(process.env.WEB_AUTH_SECRET || "").trim();
  const strictSecretRequired = process.env.NODE_ENV === "production" && appEnv !== "lan";
  const secret =
    rawSecret || crypto.createHash("sha256").update(`mhchub:${adminPin}:local-secret`).digest("hex");

  if (strictSecretRequired && rawSecret.length < 32) {
    throw new Error("WEB_AUTH_SECRET must be at least 32 characters in production public mode");
  }

  fs.mkdirSync(authDir, { recursive: true });

  const readUsers = () => readJson(usersFile, []);
  const writeUsers = (users) => writeJson(usersFile, users);
  const readAttempts = () => readJson(attemptsFile, {});
  const writeAttempts = (attempts) => writeJson(attemptsFile, attempts);

  const writeAudit = (event) => {
    const logs = readJson(auditFile, []);
    logs.unshift({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...event
    });
    writeJson(auditFile, logs.slice(0, 1000));
  };

  const ensureBootstrapUser = async () => {
    if (store) {
      if ((await store.countUsers()) > 0) return;
      const username = process.env.ADMIN_USERNAME || "admin";
      const password = process.env.ADMIN_PASSWORD || adminPin;
      await store.upsertUser({
        id: crypto.randomUUID(),
        username,
        displayName: username,
        passwordHash: hashPassword(password),
        role: "admin"
      });
      await store.writeAudit({
        username,
        eventType: "bootstrap_admin_created",
        success: true,
        reason: process.env.ADMIN_PASSWORD ? "env_password" : "legacy_admin_pin_password"
      });
      return;
    }

    const users = readUsers();
    if (users.length) return;
    const username = process.env.ADMIN_USERNAME || "admin";
    const password = process.env.ADMIN_PASSWORD || adminPin;
    users.push({
      id: crypto.randomUUID(),
      username,
      displayName: username,
      passwordHash: hashPassword(password),
      role: "admin",
      activeSessionId: null,
      createdAt: new Date().toISOString(),
      passwordUpdatedAt: new Date().toISOString()
    });
    writeUsers(users);
    writeAudit({
      username,
      eventType: "bootstrap_admin_created",
      success: true,
      reason: process.env.ADMIN_PASSWORD ? "env_password" : "legacy_admin_pin_password"
    });
  };

  const sign = (payload) => crypto.createHmac("sha256", secret).update(payload).digest("base64url");

  const createToken = (user) => {
    const payload = base64Url(
      JSON.stringify({
        id: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        departmentId: user.departmentId || null,
        role: user.role,
        sessionId: user.sessionId,
        exp: Date.now() + SESSION_TTL_MS
      })
    );
    return `${payload}.${sign(payload)}`;
  };

  const readTokenUser = (req) => {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (!token) return null;
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = sign(payload);
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
    try {
      const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (Number(parsed.exp || 0) < Date.now()) return null;
      if (!AUTH_ROLES.has(parsed.role)) return null;
      return {
        id: String(parsed.id),
        username: String(parsed.username),
        displayName: String(parsed.displayName || parsed.username),
        departmentId: parsed.departmentId ? String(parsed.departmentId) : null,
        role: String(parsed.role),
        sessionId: String(parsed.sessionId || "")
      };
    } catch {
      return null;
    }
  };

  const isActiveSession = async (user) => {
    if (store) return store.isActiveSession(user.id, user.sessionId);
    const stored = readUsers().find((item) => item.id === user.id);
    return !!stored && stored.activeSessionId === user.sessionId;
  };

  const usesSecureCookie = process.env.NODE_ENV === "production" && appEnv !== "lan";
  const cookieFlags = () => [
    `${COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    usesSecureCookie ? "Secure" : ""
  ].filter(Boolean);

  const setCookie = (res, token) => {
    res.setHeader("Set-Cookie", [`${COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieFlags().slice(1).join("; ")}`]);
  };

  const clearCookie = (res) => {
    res.setHeader(
      "Set-Cookie",
      [`${COOKIE_NAME}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0", usesSecureCookie ? "Secure" : ""]
        .filter(Boolean)
        .join("; ")
    );
  };

  const attemptKey = (ip, username) =>
    crypto.createHash("sha256").update(`${ip || "unknown"}:${String(username || "").toLowerCase()}`).digest("hex");

  const getClientIp = (req) => {
    const proxyIp = trustProxy
      ? req.headers["cf-connecting-ip"] || req.headers["x-real-ip"] || req.headers["x-forwarded-for"]
      : "";
    return normalizeIp(proxyIp || req.ip || req.socket?.remoteAddress);
  };

  const isBlocked = async (key) => {
    if (store) {
      const attempt = await store.getAttempt(key);
      return attempt?.blocked_until && new Date(attempt.blocked_until).getTime() > Date.now();
    }
    const attempt = readAttempts()[key];
    return attempt?.blockedUntil && new Date(attempt.blockedUntil).getTime() > Date.now();
  };

  const recordFailure = async (key, username, ip) => {
    if (store) {
      const old = await store.getAttempt(key);
      const now = Date.now();
      const firstMs = old?.first_failure_at ? new Date(old.first_failure_at).getTime() : 0;
      const withinWindow = firstMs > 0 && now - firstMs <= LOGIN_WINDOW_MS;
      const failures = withinWindow ? Number(old.failures || 0) + 1 : 1;
      await store.recordFailure({
        key,
        username,
        ip,
        failures,
        firstFailureAt: new Date(withinWindow ? firstMs : now),
        blockedUntil: failures >= MAX_LOGIN_FAILURES ? new Date(now + LOGIN_BLOCK_MS) : null
      });
      return;
    }

    const attempts = readAttempts();
    const now = Date.now();
    const old = attempts[key];
    const firstMs = old?.firstFailureAt ? new Date(old.firstFailureAt).getTime() : 0;
    const withinWindow = firstMs > 0 && now - firstMs <= LOGIN_WINDOW_MS;
    const failures = withinWindow ? Number(old.failures || 0) + 1 : 1;
    attempts[key] = {
      username,
      ip,
      failures,
      firstFailureAt: new Date(withinWindow ? firstMs : now).toISOString(),
      blockedUntil: failures >= MAX_LOGIN_FAILURES ? new Date(now + LOGIN_BLOCK_MS).toISOString() : null,
      updatedAt: new Date().toISOString()
    };
    writeAttempts(attempts);
  };

  const clearFailures = async (key) => {
    if (store) {
      await store.clearFailures(key);
      return;
    }
    const attempts = readAttempts();
    delete attempts[key];
    writeAttempts(attempts);
  };

  const setAuthNoStoreHeaders = (res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  };

  const publicUser = (user, sessionId = user.activeSessionId) => ({
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    departmentId: user.departmentId || null,
    role: user.role || "admin",
    sessionId
  });

  const publicResponseUser = (user) => ({
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    departmentId: user.departmentId || null,
    role: user.role || "admin"
  });

  const ready = ensureBootstrapUser();

  const findUserByUsername = async (username) => {
    if (store) return store.findUserByUsername(username);
    return readUsers().find((item) => item.username.toLowerCase() === username.toLowerCase()) || null;
  };

  const findUserById = async (id) => {
    if (store) return store.findUserById(id);
    return readUsers().find((item) => item.id === id) || null;
  };

  const setActiveSession = async (userId, sessionId) => {
    if (store) return store.setActiveSession(userId, sessionId);
    const users = readUsers();
    const user = users.find((item) => item.id === userId);
    writeUsers(users.map((item) => (item.id === userId ? { ...item, activeSessionId: sessionId, lastLoginAt: new Date().toISOString() } : item)));
    return user?.activeSessionId || null;
  };

  const clearActiveSession = async (userId, sessionId) => {
    if (store) {
      await store.clearActiveSession(userId, sessionId);
      return;
    }
    const users = readUsers();
    writeUsers(users.map((item) => (item.id === userId && item.activeSessionId === sessionId ? { ...item, activeSessionId: null } : item)));
  };

  const writeAuthAudit = async (event) => {
    if (store) {
      await store.writeAudit(event);
      return;
    }
    writeAudit(event);
  };

  const publicAdminUser = (user) => ({
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role || "viewer",
    departmentId: user.departmentId || null,
    createdAt: user.createdAt || null,
    lastLoginAt: user.lastLoginAt || null,
    activeSessionId: user.activeSessionId || null
  });

  const normalizeRole = (role) => (AUTH_ROLES.has(String(role || "")) ? String(role) : "viewer");

  const listUsers = async () => {
    if (store?.listUsers) return store.listUsers();
    return readUsers();
  };

  const createUser = async ({ username, displayName, password, role, departmentId }) => {
    const user = {
      id: crypto.randomUUID(),
      username,
      displayName: displayName || username,
      passwordHash: hashPassword(password),
      role: normalizeRole(role),
      departmentId: departmentId || null,
      activeSessionId: null,
      createdAt: new Date().toISOString(),
      passwordUpdatedAt: new Date().toISOString()
    };

    if (store?.createUser) return store.createUser(user);
    const users = readUsers();
    if (users.some((item) => item.username.toLowerCase() === username.toLowerCase())) {
      const error = new Error("Username already exists");
      error.code = "USER_EXISTS";
      throw error;
    }
    users.unshift(user);
    writeUsers(users);
    return user;
  };

  const updateUser = async (id, updates) => {
    if (store?.updateUser) return store.updateUser(id, updates);
    const users = readUsers();
    const user = users.find((item) => item.id === id);
    if (!user) return null;
    const next = {
      ...user,
      ...(updates.displayName !== undefined ? { displayName: updates.displayName || user.username } : {}),
      ...(updates.role !== undefined ? { role: normalizeRole(updates.role) } : {}),
      ...(updates.departmentId !== undefined ? { departmentId: updates.departmentId || null } : {})
    };
    writeUsers(users.map((item) => (item.id === id ? next : item)));
    return next;
  };

  const updateUserPassword = async (id, passwordHash) => {
    if (store?.updateUserPassword) return store.updateUserPassword(id, passwordHash);
    const users = readUsers();
    const user = users.find((item) => item.id === id);
    if (!user) return null;
    const next = {
      ...user,
      passwordHash,
      activeSessionId: null,
      passwordUpdatedAt: new Date().toISOString()
    };
    writeUsers(users.map((item) => (item.id === id ? next : item)));
    return next;
  };

  const deleteUser = async (id) => {
    if (store?.deleteUser) {
      await store.deleteUser(id);
      return;
    }
    writeUsers(readUsers().filter((item) => item.id !== id));
  };

  return {
    COOKIE_NAME,
    hashPassword,
    readUsers,
    writeAudit: writeAuthAudit,
    readTokenUser,
    isActiveSession,
    clearCookie,
    async requireSession(req, res, next) {
      await ready;
      setAuthNoStoreHeaders(res);
      const user = readTokenUser(req);
      if (!user?.sessionId) {
        return res.status(401).json({ message: "Admin login required", code: "LOGIN_REQUIRED" });
      }
      if (!(await isActiveSession(user))) {
        clearCookie(res);
        await writeAuthAudit({
          username: user.username,
          userId: user.id,
          eventType: "session_replaced_detected",
          success: false,
          reason: "active_session_mismatch",
          ip: getClientIp(req),
          userAgent: req.headers["user-agent"],
          sessionId: user.sessionId
        });
        return res.status(401).json({ message: "Admin session replaced", code: "SESSION_REPLACED" });
      }
      req.adminUser = user;
      next();
    },
    async requireAdminSession(req, res, next) {
      return this.requireSession(req, res, () => {
        if (!ADMIN_ROLES.has(req.adminUser?.role)) {
          return res.status(403).json({ message: "Admin permission required", code: "ADMIN_REQUIRED" });
        }
        return next();
      });
    },
    async login(req, res) {
      await ready;
      setAuthNoStoreHeaders(res);
      const username = String(req.body?.username || "").trim();
      const password = String(req.body?.password || "");
      const ip = getClientIp(req);
      const userAgent = String(req.headers["user-agent"] || "");
      if (!username || !password) {
        await writeAuthAudit({ username, eventType: "login_failed", success: false, reason: "missing_credentials", ip, userAgent });
        return res.status(400).json({ message: "Username and password are required" });
      }

      const key = attemptKey(ip, username);
      if (await isBlocked(key)) {
        await writeAuthAudit({ username, eventType: "login_rate_limited", success: false, reason: "too_many_failures", ip, userAgent });
        return res.status(429).json({ message: "Too many login attempts", code: "LOGIN_RATE_LIMITED" });
      }

      const user = await findUserByUsername(username);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        await recordFailure(key, username, ip);
        await writeAuthAudit({
          username,
          userId: user?.id || null,
          eventType: "login_failed",
          success: false,
          reason: user ? "bad_password" : "unknown_user",
          ip,
          userAgent
        });
        return res.status(401).json({ message: "Invalid username or password" });
      }

      await clearFailures(key);
      const sessionId = crypto.randomBytes(32).toString("base64url");
      const previousSessionId = await setActiveSession(user.id, sessionId);
      const signedUser = publicUser(user, sessionId);
      setCookie(res, createToken(signedUser));
      await writeAuthAudit({
        username,
        userId: user.id,
        eventType: "login_success",
        success: true,
        reason: previousSessionId ? "replaced_existing_session" : "password_ok",
        ip,
        userAgent,
        sessionId,
        replacedSessionId: previousSessionId
      });
      return res.json({ data: { user: publicResponseUser(signedUser) } });
    },
    async logout(req, res) {
      await ready;
      setAuthNoStoreHeaders(res);
      const user = readTokenUser(req);
      if (user?.sessionId) {
        await clearActiveSession(user.id, user.sessionId);
        await writeAuthAudit({
          username: user.username,
          userId: user.id,
          eventType: "logout",
          success: true,
          reason: "user_logout",
          ip: getClientIp(req),
          userAgent: req.headers["user-agent"],
          sessionId: user.sessionId
        });
      }
      clearCookie(res);
      return res.json({ data: { ok: true } });
    },
    async me(req, res) {
      await ready;
      setAuthNoStoreHeaders(res);
      const user = readTokenUser(req);
      if (!user?.sessionId) return res.json({ data: { user: null } });
      if (!(await isActiveSession(user))) {
        clearCookie(res);
        return res.status(401).json({ message: "Admin session replaced", code: "SESSION_REPLACED" });
      }
      return res.json({ data: { user: publicResponseUser(user) } });
    },
    async updateProfile(req, res) {
      await ready;
      setAuthNoStoreHeaders(res);
      const current = req.adminUser || readTokenUser(req);
      if (!current?.id) return res.status(401).json({ message: "Login required", code: "LOGIN_REQUIRED" });
      const displayName = String(req.body?.displayName || "").trim();
      if (!displayName) return res.status(400).json({ message: "Display name is required", code: "DISPLAY_NAME_REQUIRED" });
      if (displayName.length > 80) return res.status(400).json({ message: "Display name is too long", code: "DISPLAY_NAME_TOO_LONG" });
      const updated = await updateUser(current.id, { displayName });
      if (!updated) return res.status(404).json({ message: "User not found", code: "USER_NOT_FOUND" });
      const signedUser = publicUser({ ...updated, sessionId: current.sessionId }, current.sessionId);
      setCookie(res, createToken(signedUser));
      await writeAuthAudit({
        username: current.username,
        userId: current.id,
        eventType: "profile_updated",
        success: true,
        reason: "display_name_updated",
        ip: getClientIp(req),
        userAgent: req.headers["user-agent"],
        sessionId: current.sessionId
      });
      return res.json({ data: { user: publicResponseUser(signedUser) } });
    },
    async changePassword(req, res) {
      await ready;
      setAuthNoStoreHeaders(res);
      const current = req.adminUser || readTokenUser(req);
      if (!current?.id) return res.status(401).json({ message: "Login required", code: "LOGIN_REQUIRED" });
      const currentPassword = String(req.body?.currentPassword || "");
      const newPassword = String(req.body?.newPassword || "");
      if (!currentPassword || !newPassword) return res.status(400).json({ message: "Current and new password are required" });
      if (newPassword.length < 6) return res.status(400).json({ message: "New password must be at least 6 characters" });
      const user = await findUserById(current.id);
      if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
        await writeAuthAudit({
          username: current.username,
          userId: current.id,
          eventType: "password_change_failed",
          success: false,
          reason: "bad_current_password",
          ip: getClientIp(req),
          userAgent: req.headers["user-agent"],
          sessionId: current.sessionId
        });
        return res.status(401).json({ message: "Current password is not correct", code: "BAD_CURRENT_PASSWORD" });
      }
      const updated = await updateUserPassword(current.id, hashPassword(newPassword));
      const sessionId = crypto.randomBytes(32).toString("base64url");
      await setActiveSession(current.id, sessionId);
      const signedUser = publicUser({ ...(updated || user), sessionId }, sessionId);
      setCookie(res, createToken(signedUser));
      await writeAuthAudit({
        username: current.username,
        userId: current.id,
        eventType: "password_changed",
        success: true,
        reason: "self_service",
        ip: getClientIp(req),
        userAgent: req.headers["user-agent"],
        sessionId
      });
      return res.json({ data: { ok: true } });
    },
    async listAdminUsers(_req, res) {
      await ready;
      setAuthNoStoreHeaders(res);
      const users = await listUsers();
      return res.json({ data: users.map(publicAdminUser) });
    },
    async createAdminUser(req, res) {
      await ready;
      setAuthNoStoreHeaders(res);
      const username = String(req.body?.username || "").trim();
      const displayName = String(req.body?.displayName || "").trim();
      const password = String(req.body?.password || "");
      const role = normalizeRole(req.body?.role);
      const departmentId = String(req.body?.departmentId || "").trim();
      if (!username || !password) return res.status(400).json({ message: "Username and password are required" });
      if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) {
        return res.status(400).json({ message: "Username must be 3-64 characters and use letters, numbers, dot, underscore, or dash" });
      }
      if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
      if (await findUserByUsername(username)) return res.status(409).json({ message: "Username already exists", code: "USER_EXISTS" });
      const created = await createUser({ username, displayName, password, role, departmentId });
      await writeAuthAudit({
        username: req.adminUser?.username,
        userId: req.adminUser?.id,
        eventType: "admin_user_created",
        success: true,
        reason: username,
        ip: getClientIp(req),
        userAgent: req.headers["user-agent"],
        sessionId: req.adminUser?.sessionId
      });
      return res.status(201).json({ data: publicAdminUser(created) });
    },
    async updateAdminUser(req, res) {
      await ready;
      setAuthNoStoreHeaders(res);
      const id = String(req.params.id || "");
      const updates = {
        displayName: req.body?.displayName !== undefined ? String(req.body.displayName || "").trim() : undefined,
        role: req.body?.role !== undefined ? normalizeRole(req.body.role) : undefined,
        departmentId: req.body?.departmentId !== undefined ? String(req.body.departmentId || "").trim() : undefined
      };
      const updated = await updateUser(id, updates);
      if (!updated) return res.status(404).json({ message: "User not found", code: "USER_NOT_FOUND" });
      return res.json({ data: publicAdminUser(updated) });
    },
    async resetAdminUserPassword(req, res) {
      await ready;
      setAuthNoStoreHeaders(res);
      const id = String(req.params.id || "");
      const password = String(req.body?.password || "");
      if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
      const updated = await updateUserPassword(id, hashPassword(password));
      if (!updated) return res.status(404).json({ message: "User not found", code: "USER_NOT_FOUND" });
      return res.json({ data: { ok: true } });
    },
    async deleteAdminUser(req, res) {
      await ready;
      setAuthNoStoreHeaders(res);
      const id = String(req.params.id || "");
      if (id === req.adminUser?.id) {
        return res.status(400).json({ message: "You cannot delete your current account", code: "SELF_DELETE_FORBIDDEN" });
      }
      if (!(await findUserById(id))) return res.status(404).json({ message: "User not found", code: "USER_NOT_FOUND" });
      await deleteUser(id);
      return res.json({ data: { ok: true } });
    }
  };
};
