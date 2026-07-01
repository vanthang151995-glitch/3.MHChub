import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { createAuthService } from "../server/auth/authService.js";

const checks = [];

const addCheck = (name, pass, evidence = {}) => {
  checks.push({ name, pass: Boolean(pass), evidence });
};

const assertCheck = (name, pass, evidence = {}) => {
  addCheck(name, pass, evidence);
  if (!pass) {
    const error = new Error(`${name} failed`);
    error.evidence = evidence;
    throw error;
  }
};

const createResponse = () => ({
  statusCode: 200,
  headers: {},
  body: null,
  setHeader(name, value) {
    this.headers[name] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  }
});

const createRequest = ({ body = {}, cookie = "" } = {}) => ({
  body,
  headers: {
    ...(cookie ? { cookie } : {}),
    "user-agent": "mhchub-auth-role-test"
  },
  ip: "127.0.0.1",
  socket: {
    remoteAddress: "127.0.0.1"
  }
});

const cookieFromResponse = (response) => {
  const raw = response.headers["Set-Cookie"];
  const header = Array.isArray(raw) ? raw[0] : String(raw || "");
  return header.split(";")[0];
};

const setCookieHeader = (response) => {
  const raw = response.headers["Set-Cookie"];
  return Array.isArray(raw) ? raw[0] : String(raw || "");
};

const cookieFlagSet = (response) =>
  new Set(
    setCookieHeader(response)
      .split(";")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
  );

const hasAuthNoStoreHeaders = (response) => (
  String(response.headers["Cache-Control"] || "").includes("no-store")
  && String(response.headers.Pragma || "").toLowerCase() === "no-cache"
  && String(response.headers.Expires || "") === "0"
);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mhchub-auth-role-"));
const authDir = path.join(tempRoot, "auth");
const originalEnv = {
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME,
  NODE_ENV: process.env.NODE_ENV,
  WEB_AUTH_SECRET: process.env.WEB_AUTH_SECRET
};

try {
  process.env.NODE_ENV = "test";
  process.env.WEB_AUTH_SECRET = "test-only-web-auth-secret-32-characters-minimum";
  const auth = createAuthService({
    authDir,
    adminPin: "test-pin",
    appEnv: "lan",
    trustProxy: false,
    store: null
  });

  await auth.me(createRequest(), createResponse());

  const now = new Date().toISOString();
  const roles = ["admin", "ehs", "leader", "viewer"];
  const users = roles.map((role) => ({
    id: crypto.randomUUID(),
    username: `${role}-user`,
    displayName: `${role.toUpperCase()} Test User`,
    passwordHash: auth.hashPassword(`${role}-password`),
    role,
    departmentId: role === "viewer" ? "pe1" : null,
    activeSessionId: null,
    createdAt: now,
    passwordUpdatedAt: now
  }));

  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, "users.json"), JSON.stringify(users, null, 2), "utf8");

  const loginAs = async (role, label = role) => {
    const { cookie } = await loginWithResponse(role, label);
    return cookie;
  };

  const loginWithResponse = async (role, label = role) => {
    const response = createResponse();
    await auth.login(
      createRequest({
        body: {
          username: `${role}-user`,
          password: `${role}-password`
        }
      }),
      response
    );
    const cookie = cookieFromResponse(response);
    assertCheck(`login-${label}-succeeds`, response.statusCode === 200 && cookie.startsWith(`${auth.COOKIE_NAME}=`), {
      statusCode: response.statusCode,
      role,
      hasCookie: Boolean(cookie)
    });
    return { cookie, response };
  };

  const adminLogin = await loginWithResponse("admin", "admin-cookie-flags");
  const adminCookieFlags = cookieFlagSet(adminLogin.response);
  const adminLoginUser = adminLogin.response.body?.data?.user || {};
  addCheck("login-success-response-has-auth-no-store-headers", hasAuthNoStoreHeaders(adminLogin.response), {
    cacheControl: adminLogin.response.headers["Cache-Control"] || "",
    expires: adminLogin.response.headers.Expires || "",
    pragma: adminLogin.response.headers.Pragma || "",
    statusCode: adminLogin.response.statusCode
  });
  addCheck("login-response-user-does-not-expose-session-id", (
    adminLogin.response.statusCode === 200
    && adminLoginUser.role === "admin"
    && !Object.prototype.hasOwnProperty.call(adminLoginUser, "sessionId")
  ), {
    hasSessionId: Object.prototype.hasOwnProperty.call(adminLoginUser, "sessionId"),
    role: adminLoginUser.role || "",
    statusCode: adminLogin.response.statusCode
  });

  const adminMeResponse = createResponse();
  await auth.me(createRequest({ cookie: adminLogin.cookie }), adminMeResponse);
  const adminMeUser = adminMeResponse.body?.data?.user || {};
  addCheck("me-response-has-auth-no-store-headers", hasAuthNoStoreHeaders(adminMeResponse), {
    cacheControl: adminMeResponse.headers["Cache-Control"] || "",
    expires: adminMeResponse.headers.Expires || "",
    pragma: adminMeResponse.headers.Pragma || "",
    statusCode: adminMeResponse.statusCode
  });
  addCheck("me-response-user-does-not-expose-session-id", (
    adminMeResponse.statusCode === 200
    && adminMeUser.role === "admin"
    && !Object.prototype.hasOwnProperty.call(adminMeUser, "sessionId")
  ), {
    hasSessionId: Object.prototype.hasOwnProperty.call(adminMeUser, "sessionId"),
    role: adminMeUser.role || "",
    statusCode: adminMeResponse.statusCode
  });

  addCheck("lan-session-cookie-has-safe-flags", (
    adminCookieFlags.has("httponly")
    && adminCookieFlags.has("path=/")
    && adminCookieFlags.has("samesite=lax")
    && [...adminCookieFlags].some((flag) => flag.startsWith("max-age="))
    && !adminCookieFlags.has("secure")
  ), {
    hasHttpOnly: adminCookieFlags.has("httponly"),
    hasMaxAge: [...adminCookieFlags].some((flag) => flag.startsWith("max-age=")),
    hasPath: adminCookieFlags.has("path=/"),
    hasSameSiteLax: adminCookieFlags.has("samesite=lax"),
    hasSecure: adminCookieFlags.has("secure")
  });

  for (const role of ["admin", "ehs", "leader"]) {
    const cookie = await loginAs(role);
    const request = createRequest({ cookie });
    const response = createResponse();
    let nextCalled = false;
    await auth.requireAdminSession(request, response, () => {
      nextCalled = true;
    });
    addCheck(`admin-role-${role}-passes-admin-middleware`, nextCalled && request.adminUser?.role === role, {
      role,
      statusCode: response.statusCode,
      nextCalled,
      resolvedRole: request.adminUser?.role || ""
    });
  }

  const viewerCookie = await loginAs("viewer");
  const viewerSessionRequest = createRequest({ cookie: viewerCookie });
  const viewerSessionResponse = createResponse();
  let viewerSessionNext = false;
  await auth.requireSession(viewerSessionRequest, viewerSessionResponse, () => {
    viewerSessionNext = true;
  });
  addCheck("viewer-passes-authenticated-session-middleware", viewerSessionNext && viewerSessionRequest.adminUser?.role === "viewer", {
    statusCode: viewerSessionResponse.statusCode,
    nextCalled: viewerSessionNext,
    resolvedRole: viewerSessionRequest.adminUser?.role || ""
  });

  const viewerAdminRequest = createRequest({ cookie: viewerCookie });
  const viewerAdminResponse = createResponse();
  let viewerAdminNext = false;
  await auth.requireAdminSession(viewerAdminRequest, viewerAdminResponse, () => {
    viewerAdminNext = true;
  });
  addCheck("viewer-is-forbidden-by-admin-middleware", !viewerAdminNext && viewerAdminResponse.statusCode === 403 && viewerAdminResponse.body?.code === "ADMIN_REQUIRED", {
    statusCode: viewerAdminResponse.statusCode,
    code: viewerAdminResponse.body?.code || "",
    nextCalled: viewerAdminNext
  });

  const firstViewerCookie = await loginAs("viewer", "viewer-first-session");
  const secondViewerCookie = await loginAs("viewer", "viewer-second-session");
  const replacedRequest = createRequest({ cookie: firstViewerCookie });
  const replacedResponse = createResponse();
  let replacedNext = false;
  await auth.requireSession(replacedRequest, replacedResponse, () => {
    replacedNext = true;
  });
  addCheck("replaced-session-cookie-is-rejected", !replacedNext && replacedResponse.statusCode === 401 && replacedResponse.body?.code === "SESSION_REPLACED", {
    statusCode: replacedResponse.statusCode,
    code: replacedResponse.body?.code || "",
    nextCalled: replacedNext,
    clearCookieSent: Boolean(replacedResponse.headers["Set-Cookie"])
  });
  addCheck("replaced-session-response-has-auth-no-store-headers", hasAuthNoStoreHeaders(replacedResponse), {
    cacheControl: replacedResponse.headers["Cache-Control"] || "",
    expires: replacedResponse.headers.Expires || "",
    pragma: replacedResponse.headers.Pragma || "",
    statusCode: replacedResponse.statusCode
  });

  const currentViewerRequest = createRequest({ cookie: secondViewerCookie });
  const currentViewerResponse = createResponse();
  let currentViewerNext = false;
  await auth.requireAdminSession(currentViewerRequest, currentViewerResponse, () => {
    currentViewerNext = true;
  });
  addCheck("current-viewer-session-still-forbidden-not-replaced", !currentViewerNext && currentViewerResponse.statusCode === 403 && currentViewerResponse.body?.code === "ADMIN_REQUIRED", {
    statusCode: currentViewerResponse.statusCode,
    code: currentViewerResponse.body?.code || "",
    nextCalled: currentViewerNext
  });
  addCheck("admin-forbidden-response-has-auth-no-store-headers", hasAuthNoStoreHeaders(currentViewerResponse), {
    cacheControl: currentViewerResponse.headers["Cache-Control"] || "",
    expires: currentViewerResponse.headers.Expires || "",
    pragma: currentViewerResponse.headers.Pragma || "",
    statusCode: currentViewerResponse.statusCode
  });

  const malformedRequest = createRequest({ cookie: `${auth.COOKIE_NAME}=not-a-valid-token` });
  const malformedResponse = createResponse();
  let malformedNext = false;
  await auth.requireAdminSession(malformedRequest, malformedResponse, () => {
    malformedNext = true;
  });
  addCheck("malformed-admin-cookie-requires-login", !malformedNext && malformedResponse.statusCode === 401 && malformedResponse.body?.code === "LOGIN_REQUIRED", {
    statusCode: malformedResponse.statusCode,
    code: malformedResponse.body?.code || "",
    nextCalled: malformedNext
  });
  addCheck("login-required-response-has-auth-no-store-headers", hasAuthNoStoreHeaders(malformedResponse), {
    cacheControl: malformedResponse.headers["Cache-Control"] || "",
    expires: malformedResponse.headers.Expires || "",
    pragma: malformedResponse.headers.Pragma || "",
    statusCode: malformedResponse.statusCode
  });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = createResponse();
    await auth.login(
      createRequest({
        body: {
          username: "admin-user",
          password: `wrong-password-${attempt}`
        }
      }),
      response
    );
    addCheck(`bad-password-attempt-${attempt}-is-rejected`, response.statusCode === 401, {
      statusCode: response.statusCode
    });
  }

  const blockedResponse = createResponse();
  await auth.login(
    createRequest({
      body: {
        username: "admin-user",
        password: "wrong-password-blocked"
      }
    }),
    blockedResponse
  );
  addCheck("login-rate-limit-blocks-after-repeated-failures", blockedResponse.statusCode === 429 && blockedResponse.body?.code === "LOGIN_RATE_LIMITED", {
    code: blockedResponse.body?.code || "",
    statusCode: blockedResponse.statusCode
  });
  addCheck("login-rate-limit-response-has-auth-no-store-headers", hasAuthNoStoreHeaders(blockedResponse), {
    cacheControl: blockedResponse.headers["Cache-Control"] || "",
    expires: blockedResponse.headers.Expires || "",
    pragma: blockedResponse.headers.Pragma || "",
    statusCode: blockedResponse.statusCode
  });

  const logoutResponse = createResponse();
  await auth.logout(createRequest({ cookie: adminLogin.cookie }), logoutResponse);
  addCheck("logout-response-has-auth-no-store-headers", hasAuthNoStoreHeaders(logoutResponse), {
    cacheControl: logoutResponse.headers["Cache-Control"] || "",
    expires: logoutResponse.headers.Expires || "",
    pragma: logoutResponse.headers.Pragma || "",
    statusCode: logoutResponse.statusCode
  });

  process.env.NODE_ENV = "production";
  process.env.WEB_AUTH_SECRET = "short-secret";
  let weakSecretRejected = false;
  try {
    createAuthService({
      authDir: path.join(tempRoot, "weak-secret-auth"),
      adminPin: "weak-pin",
      appEnv: "public",
      trustProxy: false,
      store: null
    });
  } catch (error) {
    weakSecretRejected = /WEB_AUTH_SECRET/i.test(error.message);
  }
  addCheck("production-public-rejects-weak-web-auth-secret", weakSecretRejected, {});

  process.env.ADMIN_USERNAME = "secure-admin-test";
  process.env.ADMIN_PASSWORD = "secure-admin-password-for-cookie-test";
  process.env.WEB_AUTH_SECRET = "public-production-web-auth-secret-32-characters-minimum";
  const secureAuth = createAuthService({
    authDir: path.join(tempRoot, "secure-cookie-auth"),
    adminPin: "secure-pin",
    appEnv: "public",
    trustProxy: false,
    store: null
  });
  const secureCookieResponse = createResponse();
  await secureAuth.login(
    createRequest({
      body: {
        username: "secure-admin-test",
        password: "secure-admin-password-for-cookie-test"
      }
    }),
    secureCookieResponse
  );
  const secureCookieFlags = cookieFlagSet(secureCookieResponse);
  addCheck("production-public-session-cookie-is-secure", (
    secureCookieResponse.statusCode === 200
    && secureCookieFlags.has("secure")
    && secureCookieFlags.has("httponly")
    && secureCookieFlags.has("samesite=lax")
  ), {
    hasHttpOnly: secureCookieFlags.has("httponly"),
    hasSameSiteLax: secureCookieFlags.has("samesite=lax"),
    hasSecure: secureCookieFlags.has("secure"),
    statusCode: secureCookieResponse.statusCode
  });

  const failedChecks = checks.filter((check) => !check.pass);
  console.log(
    JSON.stringify(
      {
        ok: failedChecks.length === 0,
        tempRoot,
        summary: {
          total: checks.length,
          passed: checks.length - failedChecks.length,
          failed: failedChecks.length
        },
        failedChecks,
        checks
      },
      null,
      2
    )
  );

  if (failedChecks.length) {
    process.exit(1);
  }
} finally {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
