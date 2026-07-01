import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const reportsDir = path.join(rootDir, "qa", "reports");
const reportPath = path.join(reportsDir, "safety-api-endpoints-audit.json");
const baseUrl = (
  process.env.MHCHUB_AUDIT_BASE_URL ||
  process.env.MHCHUB_SAFETY_API_BASE_URL ||
  process.env.VERIFY_BASE_URL ||
  ""
).replace(/\/$/, "");
const username = process.env.MHCHUB_AUDIT_USERNAME || process.env.MHCHUB_USERNAME || "";
const password = process.env.MHCHUB_AUDIT_PASSWORD || process.env.MHCHUB_PASSWORD || "";

const toRelative = (filePath) => path.relative(rootDir, filePath).replace(/\\/g, "/");
const readText = (filePath) => fs.readFileSync(filePath, "utf8");
const checks = [];
const warnings = [];
const addCheck = (name, pass, evidence = {}) => checks.push({ evidence, name, pass: Boolean(pass) });

const serverPath = path.join(rootDir, "server", "index.js");
const referencePagePath = path.join(rootDir, "src", "pages", "safety", "SafetyReferencePage.tsx");
const programPagePath = path.join(rootDir, "src", "pages", "safety", "SafetySpecialProgramPage.tsx");

const serverSource = readText(serverPath);
const referencePageSource = readText(referencePagePath);
const programPageSource = readText(programPagePath);

const requiredServerRoutes = [
  'app.get("/api/safety/reference"',
  'app.get("/api/safety/document-architecture"',
  'app.get("/api/safety/programs"',
  'app.get("/api/safety/programs/:id"'
];

for (const route of requiredServerRoutes) {
  addCheck(`server-defines-${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`, serverSource.includes(route), {
    file: toRelative(serverPath),
    route
  });
}

addCheck("reference-page-fetches-reference-api", referencePageSource.includes('"/api/safety/reference"'), {
  file: toRelative(referencePagePath)
});
addCheck("reference-page-fetches-document-architecture-api", referencePageSource.includes('"/api/safety/document-architecture"'), {
  file: toRelative(referencePagePath)
});
addCheck("special-program-page-fetches-program-api", programPageSource.includes("/api/safety/programs/"), {
  file: toRelative(programPagePath)
});

const parseCookies = (setCookieHeader = "") =>
  setCookieHeader
    .split(/,(?=[^;]+=)/)
    .map((item) => item.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");

const previewText = (text = "") => text.replace(/\s+/g, " ").slice(0, 180);
const isJsonContentType = (contentType = "") => /application\/json/i.test(contentType);
const isHtml = (text = "") => /^\s*<!doctype html/i.test(text) || /<html[\s>]/i.test(text);
const objectKeys = (value) => (value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).slice(0, 16) : []);
const hasArray = (value, key) => Array.isArray(value?.[key]);

const fetchJsonProbe = async (urlPath, cookieHeader) => {
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
};

const runtime = { baseUrl, skipped: !baseUrl };
if (baseUrl) {
  let cookieHeader = "";
  if (username && password) {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    cookieHeader = parseCookies(login.headers.get("set-cookie") || "");
    runtime.login = {
      contentType: login.headers.get("content-type") || "",
      hasCookie: Boolean(cookieHeader),
      ok: login.ok,
      status: login.status
    };
    addCheck("runtime-auth-login-succeeds", login.status === 200 && Boolean(cookieHeader), runtime.login);
  } else {
    runtime.login = { skipped: true };
    addCheck("runtime-auth-credentials-provided", false, {
      reason: "Set MHCHUB_AUDIT_USERNAME and MHCHUB_AUDIT_PASSWORD when MHCHUB_AUDIT_BASE_URL is set."
    });
  }

  const reference = await fetchJsonProbe("/api/safety/reference", cookieHeader);
  runtime.reference = { ...reference, payload: undefined };
  addCheck("runtime-reference-api-returns-json", reference.status === 200 && isJsonContentType(reference.contentType) && !reference.isHtml, runtime.reference);
  addCheck(
    "runtime-reference-payload-shape",
    hasArray(reference.payload, "formulas") &&
      hasArray(reference.payload, "routes") &&
      hasArray(reference.payload, "icons") &&
      hasArray(reference.payload, "endpoints") &&
      reference.payload.routes.some((item) => item?.path === "/safety-6s/reference"),
    {
      formulaCount: reference.payload?.formulas?.length ?? null,
      routeCount: reference.payload?.routes?.length ?? null,
      endpointCount: reference.payload?.endpoints?.length ?? null
    }
  );

  const requiredProgramIds = ["kyt", "pccc", "medical", "self-inspection"];
  const programs = await fetchJsonProbe("/api/safety/programs", cookieHeader);
  runtime.programs = { ...programs, payload: undefined };
  const programIds = Array.isArray(programs.payload) ? programs.payload.map((item) => item?.id).filter(Boolean) : [];
  addCheck("runtime-program-list-returns-json", programs.status === 200 && isJsonContentType(programs.contentType) && !programs.isHtml, runtime.programs);
  addCheck("runtime-program-list-has-required-programs", requiredProgramIds.every((id) => programIds.includes(id)), {
    programIds
  });

  runtime.programDetails = [];
  for (const programId of requiredProgramIds) {
    const detail = await fetchJsonProbe(`/api/safety/programs/${programId}`, cookieHeader);
    runtime.programDetails.push({ ...detail, payload: undefined });
    addCheck(`runtime-program-${programId}-returns-json`, detail.status === 200 && isJsonContentType(detail.contentType) && !detail.isHtml, {
      contentType: detail.contentType,
      keys: detail.keys,
      path: detail.path,
      status: detail.status,
      textPreview: detail.textPreview
    });
    addCheck(
      `runtime-program-${programId}-payload-shape`,
      detail.payload?.id === programId &&
        typeof detail.payload?.title === "string" &&
        hasArray(detail.payload, "stats") &&
        hasArray(detail.payload, "workflow") &&
        hasArray(detail.payload, "checkpoints") &&
        hasArray(detail.payload, "records") &&
        hasArray(detail.payload, "documents") &&
        typeof detail.payload?.summary === "object",
      {
        id: detail.payload?.id || "",
        keys: detail.keys,
        route: detail.payload?.route || ""
      }
    );
  }

  const documentArchitecture = await fetchJsonProbe("/api/safety/document-architecture", cookieHeader);
  runtime.documentArchitecture = { ...documentArchitecture, payload: undefined };
  addCheck(
    "runtime-document-architecture-returns-json",
    documentArchitecture.status === 200 && isJsonContentType(documentArchitecture.contentType) && !documentArchitecture.isHtml,
    runtime.documentArchitecture
  );
  addCheck(
    "runtime-document-architecture-payload-shape",
    typeof documentArchitecture.payload?.summary === "object" && hasArray(documentArchitecture.payload, "levels") && hasArray(documentArchitecture.payload, "modules"),
    {
      keys: documentArchitecture.keys,
      levelCount: documentArchitecture.payload?.levels?.length ?? null,
      moduleCount: documentArchitecture.payload?.modules?.length ?? null
    }
  );

  const missingApi = await fetchJsonProbe("/api/__mhchub_safety_api_missing__", cookieHeader);
  runtime.missingApi = { ...missingApi, payload: undefined };
  addCheck(
    "runtime-unknown-api-route-is-json-404",
    missingApi.status === 404 && isJsonContentType(missingApi.contentType) && missingApi.payload?.code === "API_ROUTE_NOT_FOUND" && !missingApi.isHtml,
    runtime.missingApi
  );
} else {
  warnings.push({
    code: "runtime-safety-api-skipped",
    message: "Set MHCHUB_AUDIT_BASE_URL plus MHCHUB_AUDIT_USERNAME/MHCHUB_AUDIT_PASSWORD to verify the running Safety API process."
  });
}

const failedChecks = checks.filter((check) => !check.pass);
const report = {
  checkedAtUtc: new Date().toISOString(),
  checks,
  failedChecks,
  ok: failedChecks.length === 0,
  reportPath: toRelative(reportPath),
  runtime,
  warnings,
  summary: {
    failed: failedChecks.length,
    passed: checks.length - failedChecks.length,
    total: checks.length,
    warnings: warnings.length
  }
};

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      failedChecks: failedChecks.map((check) => check.name),
      ok: report.ok,
      reportPath: report.reportPath,
      runtimeBaseUrl: baseUrl || null,
      summary: report.summary
    },
    null,
    2
  )
);

if (!report.ok) process.exit(1);
