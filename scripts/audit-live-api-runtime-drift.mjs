import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const defaultReportPath = path.join("qa", "reports", "live-api-runtime-drift-audit.json");
const requestedReportPath = process.env.MHCHUB_LIVE_RUNTIME_REPORT || defaultReportPath;
const reportPath = path.isAbsolute(requestedReportPath) ? requestedReportPath : path.join(rootDir, requestedReportPath);
const baseUrl = (process.env.MHCHUB_LIVE_BASE_URL || process.env.MHCHUB_AUDIT_BASE_URL || "http://localhost:4174").replace(/\/$/, "");
const username = process.env.MHCHUB_AUDIT_USERNAME || process.env.MHCHUB_USERNAME || "";
const password = process.env.MHCHUB_AUDIT_PASSWORD || process.env.MHCHUB_PASSWORD || "";

const checks = [];
const warnings = [];

const toRelative = (filePath) => path.relative(rootDir, filePath).replace(/\\/g, "/");
const addCheck = (name, pass, evidence = {}) => checks.push({ evidence, name, pass: Boolean(pass) });
const isJsonContentType = (contentType = "") => /application\/json/i.test(contentType);
const isHtml = (text = "") => /^\s*<!doctype html/i.test(text) || /<html[\s>]/i.test(text);
const previewText = (text = "") => text.replace(/\s+/g, " ").slice(0, 180);
const objectKeys = (value) => (value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).slice(0, 16) : []);
const hasArray = (value, key) => Array.isArray(value?.[key]);

const parseCookies = (setCookieHeader = "") =>
  setCookieHeader
    .split(/,(?=[^;]+=)/)
    .map((item) => item.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");

const fetchProbe = async (urlPath, cookieHeader = "") => {
  try {
    const response = await fetch(`${baseUrl}${urlPath}`, {
      headers: {
        Accept: "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {})
      }
    });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    return {
      contentType,
      isHtml: isHtml(text),
      itemCount: Array.isArray(payload) ? payload.length : null,
      keys: objectKeys(payload),
      ok: response.ok,
      path: urlPath,
      payload,
      status: response.status,
      textPreview: previewText(text)
    };
  } catch (error) {
    return {
      contentType: "",
      error: error.message,
      isHtml: false,
      itemCount: null,
      keys: [],
      ok: false,
      path: urlPath,
      payload: null,
      status: 0,
      textPreview: ""
    };
  }
};

const evidenceWithoutPayload = (probe) => {
  const { payload: _payload, ...evidence } = probe;
  return evidence;
};

const assertJsonResponse = (name, probe, expectedStatus = null) => {
  const statusMatches = expectedStatus === null ? probe.status > 0 : probe.status === expectedStatus;
  addCheck(name, statusMatches && isJsonContentType(probe.contentType) && !probe.isHtml, evidenceWithoutPayload(probe));
};

const protectedEndpoints = [
  "/api/safety/reference",
  "/api/safety/programs",
  "/api/safety/programs/kyt",
  "/api/safety/document-architecture"
];

const health = await fetchProbe("/api/health");
assertJsonResponse("live-health-endpoint-is-json", health, 200);

const missingApi = await fetchProbe("/api/__mhchub_live_contract_missing__");
addCheck(
  "live-unknown-api-route-is-json-404",
  missingApi.status === 404 && isJsonContentType(missingApi.contentType) && missingApi.payload?.code === "API_ROUTE_NOT_FOUND" && !missingApi.isHtml,
  evidenceWithoutPayload(missingApi)
);

const clientFallback = await fetch(`${baseUrl}/__mhchub_live_client_route__`).catch((error) => ({
  headers: { get: () => "" },
  ok: false,
  status: 0,
  error
}));
addCheck(
  "live-client-route-fallback-is-html",
  clientFallback.status === 200 && /text\/html/i.test(clientFallback.headers.get("content-type") || ""),
  {
    contentType: clientFallback.headers.get("content-type") || "",
    error: clientFallback.error?.message || "",
    ok: Boolean(clientFallback.ok),
    status: clientFallback.status
  }
);

let cookieHeader = "";
if (username && password) {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  }).catch((error) => ({
    headers: { get: () => "" },
    ok: false,
    status: 0,
    error
  }));
  cookieHeader = parseCookies(login.headers.get("set-cookie") || "");
  addCheck("live-auth-login-succeeds", login.status === 200 && Boolean(cookieHeader), {
    contentType: login.headers.get("content-type") || "",
    error: login.error?.message || "",
    hasCookie: Boolean(cookieHeader),
    ok: Boolean(login.ok),
    status: login.status
  });
} else {
  warnings.push({
    code: "live-safety-payload-auth-skipped",
    message: "Set MHCHUB_AUDIT_USERNAME and MHCHUB_AUDIT_PASSWORD to verify authenticated Safety payloads on the live runtime."
  });
}

if (cookieHeader) {
  const reference = await fetchProbe("/api/safety/reference", cookieHeader);
  assertJsonResponse("live-reference-api-returns-json", reference, 200);
  addCheck(
    "live-reference-payload-shape",
    hasArray(reference.payload, "formulas") && hasArray(reference.payload, "routes") && hasArray(reference.payload, "icons") && hasArray(reference.payload, "endpoints"),
    {
      formulaCount: reference.payload?.formulas?.length ?? null,
      routeCount: reference.payload?.routes?.length ?? null,
      endpointCount: reference.payload?.endpoints?.length ?? null
    }
  );

  const requiredProgramIds = ["kyt", "pccc", "medical", "self-inspection"];
  const programs = await fetchProbe("/api/safety/programs", cookieHeader);
  assertJsonResponse("live-program-list-returns-json", programs, 200);
  const programIds = Array.isArray(programs.payload) ? programs.payload.map((item) => item?.id).filter(Boolean) : [];
  addCheck("live-program-list-has-required-programs", requiredProgramIds.every((id) => programIds.includes(id)), { programIds });

  for (const programId of requiredProgramIds) {
    const detail = await fetchProbe(`/api/safety/programs/${programId}`, cookieHeader);
    assertJsonResponse(`live-program-${programId}-returns-json`, detail, 200);
    addCheck(
      `live-program-${programId}-payload-shape`,
      detail.payload?.id === programId &&
        typeof detail.payload?.title === "string" &&
        hasArray(detail.payload, "stats") &&
        hasArray(detail.payload, "workflow") &&
        hasArray(detail.payload, "checkpoints") &&
        hasArray(detail.payload, "records") &&
        hasArray(detail.payload, "documents"),
      {
        id: detail.payload?.id || "",
        keys: detail.keys,
        route: detail.payload?.route || ""
      }
    );
  }

  const documentArchitecture = await fetchProbe("/api/safety/document-architecture", cookieHeader);
  assertJsonResponse("live-document-architecture-returns-json", documentArchitecture, 200);
  addCheck(
    "live-document-architecture-payload-shape",
    typeof documentArchitecture.payload?.summary === "object" && hasArray(documentArchitecture.payload, "levels") && hasArray(documentArchitecture.payload, "modules"),
    {
      keys: documentArchitecture.keys,
      levelCount: documentArchitecture.payload?.levels?.length ?? null,
      moduleCount: documentArchitecture.payload?.modules?.length ?? null
    }
  );
} else {
  for (const endpoint of protectedEndpoints) {
    const probe = await fetchProbe(endpoint);
    addCheck(
      `live-${endpoint.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-returns-json-auth-error`,
      probe.status >= 400 && probe.status < 500 && isJsonContentType(probe.contentType) && !probe.isHtml,
      evidenceWithoutPayload(probe)
    );
  }
}

const failedChecks = checks.filter((check) => !check.pass);
const staleSignals = failedChecks
  .filter((check) => /html|unknown-api|program|document-architecture|auth-error/i.test(check.name))
  .map((check) => check.name);
const report = {
  checkedAtUtc: new Date().toISOString(),
  checks,
  failedChecks,
  liveRuntime: {
    baseUrl,
    authenticated: Boolean(cookieHeader)
  },
  ok: failedChecks.length === 0,
  reportPath: toRelative(reportPath),
  restartRecommended: staleSignals.length > 0,
  staleSignals,
  summary: {
    failed: failedChecks.length,
    passed: checks.length - failedChecks.length,
    total: checks.length,
    warnings: warnings.length
  },
  warnings
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      failedChecks: failedChecks.map((check) => check.name),
      liveBaseUrl: baseUrl,
      ok: report.ok,
      reportPath: report.reportPath,
      restartRecommended: report.restartRecommended,
      summary: report.summary,
      warnings: warnings.map((warning) => warning.code)
    },
    null,
    2
  )
);

if (!report.ok) process.exit(1);
