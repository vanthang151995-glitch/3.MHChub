import fs from "fs";
import path from "path";

const readArg = (name, fallback) => {
  const index = process.argv.lastIndexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
};

const rootDir = process.cwd();
const baseUrl = readArg("--url", process.env.VERIFY_BASE_URL || "http://127.0.0.1:3333/");
const reportsDir = path.join(rootDir, "qa", "reports");
const reportPath = path.join(reportsDir, "security-headers-audit.json");
const documentsPath = path.join(rootDir, "server", "data", "documents.json");
const serverIndexPath = path.join(rootDir, "server", "index.js");
const normalizeHostname = (hostname = "") => String(hostname || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
const isLoopbackHostname = (hostname = "") => {
  const normalized = normalizeHostname(hostname);
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
};
const baseOrigin = new URL(baseUrl);
const expectsBrowserIsolationHeaders = baseOrigin.protocol === "https:" || isLoopbackHostname(baseOrigin.hostname);

const check = (name, pass, evidence = {}) => ({
  evidence,
  name,
  pass: Boolean(pass)
});

const readDocuments = () => {
  const raw = fs.readFileSync(documentsPath, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
};

const readServerIndex = () => fs.readFileSync(serverIndexPath, "utf8");

const extensionOf = (document) =>
  path.extname(String(document?.originalName || document?.fileName || "")).toLowerCase();

const pickDocument = (documents, extension, preferredIds = []) => {
  const candidates = documents.filter((document) => document.fileName && extensionOf(document) === extension);
  return preferredIds
    .map((id) => candidates.find((document) => document.id === id))
    .find(Boolean) || candidates[0] || null;
};

const preferredDocumentChecks = (label, document, preferredIds) => {
  const preferredAvailable = preferredIds.some((id) => documents.some((candidate) => candidate.id === id));
  return [
    check(`security-${label}-preferred-document-selected-when-available`, !preferredAvailable || preferredIds.includes(document?.id), {
      preferredAvailable,
      preferredIds,
      selectedId: document?.id || "",
      selectedOriginalName: document?.originalName || "",
      selectedTitle: document?.title || ""
    })
  ];
};

const headerObject = (headers) => Object.fromEntries([...headers.entries()].map(([key, value]) => [key.toLowerCase(), value]));

const request = async ({ route, method = "GET", headers = {}, body = null }) => {
  const url = new URL(route, baseUrl).toString();
  const normalizedHeaders = { ...headers };
  if (body !== null && !Object.keys(normalizedHeaders).some((key) => key.toLowerCase() === "content-type")) {
    normalizedHeaders["Content-Type"] = "application/json";
  }
  const response = await fetch(url, {
    body: body === null ? undefined : (typeof body === "string" ? body : JSON.stringify(body)),
    headers: normalizedHeaders,
    method,
    redirect: "manual"
  });
  const contentType = response.headers.get("content-type") || "";
  const text = /(?:json|html|text|xml|manifest)/i.test(contentType)
    ? await response.text().catch(() => "")
    : "";

  return {
    contentType,
    headers: headerObject(response.headers),
    ok: response.ok,
    route,
    status: response.status,
    textSample: text.slice(0, 240),
    url
  };
};

const corsRejectedChecks = (label, response) => [
  check(`security-${label}-cors-disallowed-origin-rejected`, response.status === 403, {
    status: response.status,
    textSample: response.textSample
  }),
  check(`security-${label}-cors-disallowed-origin-not-reflected`, !response.headers["access-control-allow-origin"], {
    accessControlAllowOrigin: response.headers["access-control-allow-origin"] || ""
  })
];

const hasAll = (value, tokens) => tokens.every((token) => String(value || "").includes(token));
const hasNone = (value, tokens) => tokens.every((token) => !String(value || "").includes(token));
const getDirective = (csp, directive) => {
  const normalizedDirective = String(directive || "").toLowerCase();
  return String(csp || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith(`${normalizedDirective} `)) || "";
};

const globalHeaderChecks = (label, response) => {
  const headers = response.headers;
  return [
    check(`security-${label}-request-id-present`, Boolean(headers["x-request-id"]), {
      requestId: headers["x-request-id"] || ""
    }),
    check(`security-${label}-powered-by-hidden`, !headers["x-powered-by"], {
      poweredBy: headers["x-powered-by"] || ""
    }),
    check(`security-${label}-nosniff`, headers["x-content-type-options"] === "nosniff", {
      value: headers["x-content-type-options"] || ""
    }),
    check(`security-${label}-frame-policy-sameorigin`, headers["x-frame-options"] === "SAMEORIGIN", {
      value: headers["x-frame-options"] || ""
    }),
    check(`security-${label}-referrer-policy-strict`, headers["referrer-policy"] === "no-referrer", {
      value: headers["referrer-policy"] || ""
    }),
    check(`security-${label}-permissions-policy-restricts-sensitive-devices`, hasAll(headers["permissions-policy"], [
      "camera=()",
      "microphone=()",
      "geolocation=()"
    ]), {
      value: headers["permissions-policy"] || ""
    }),
    check(`security-${label}-corp-same-origin`, headers["cross-origin-resource-policy"] === "same-origin", {
      value: headers["cross-origin-resource-policy"] || ""
    }),
    check(`security-${label}-browser-isolation-header-policy`, expectsBrowserIsolationHeaders
      ? headers["cross-origin-opener-policy"] === "same-origin" && headers["origin-agent-cluster"] === "?1"
      : !headers["cross-origin-opener-policy"] && !headers["origin-agent-cluster"], {
      expectedOnOrigin: expectsBrowserIsolationHeaders,
      originAgentCluster: headers["origin-agent-cluster"] || "",
      crossOriginOpenerPolicy: headers["cross-origin-opener-policy"] || ""
    })
  ];
};

const appCspChecks = (label, response) => {
  const csp = response.headers["content-security-policy"] || "";
  const scriptSrc = getDirective(csp, "script-src");
  const styleSrc = getDirective(csp, "style-src");
  return [
    check(`security-${label}-csp-present`, Boolean(csp), { csp }),
    check(`security-${label}-csp-core-directives`, hasAll(csp, [
      "default-src 'self'",
      "script-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'"
    ]), { csp }),
    check(`security-${label}-csp-no-unsafe-eval`, hasNone(csp, ["'unsafe-eval'"]), { csp }),
    check(`security-${label}-app-csp-no-unsafe-inline`, hasNone(csp, ["'unsafe-inline'"]), { csp }),
    check(`security-${label}-app-csp-script-src-self-only`, scriptSrc === "script-src 'self'", { scriptSrc }),
    check(`security-${label}-app-csp-style-src-self-only`, styleSrc === "style-src 'self'", { styleSrc })
  ];
};

const excelPreviewCspChecks = (label, response) => {
  const csp = response.headers["content-security-policy"] || "";
  const scriptSrc = getDirective(csp, "script-src");
  const connectSrc = getDirective(csp, "connect-src");
  const styleSrc = getDirective(csp, "style-src");
  const styleSrcElem = getDirective(csp, "style-src-elem");
  const styleSrcAttr = getDirective(csp, "style-src-attr");
  return [
    check(`security-${label}-excel-preview-csp-present`, Boolean(csp), { csp }),
    check(`security-${label}-excel-preview-csp-blocks-active-content`, hasAll(csp, [
      "default-src 'none'",
      "script-src 'none'",
      "connect-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-src 'none'",
      "frame-ancestors 'self'",
      "worker-src 'none'",
      "media-src 'none'"
    ]), { csp }),
    check(`security-${label}-excel-preview-csp-no-unsafe-eval`, hasNone(csp, ["'unsafe-eval'"]), { csp }),
    check(`security-${label}-excel-preview-csp-inline-css-only`, hasAll(csp, [
      "style-src 'none'",
      "style-src-elem 'unsafe-inline'",
      "style-src-attr 'unsafe-inline'"
    ]), { csp }),
    check(`security-${label}-excel-preview-csp-script-src-none`, scriptSrc === "script-src 'none'", { scriptSrc }),
    check(`security-${label}-excel-preview-csp-connect-src-none`, connectSrc === "connect-src 'none'", { connectSrc }),
    check(`security-${label}-excel-preview-csp-base-style-src-none`, styleSrc === "style-src 'none'", { styleSrc }),
    check(`security-${label}-excel-preview-csp-only-style-inline-exception`, (
      styleSrcElem === "style-src-elem 'unsafe-inline'"
      && styleSrcAttr === "style-src-attr 'unsafe-inline'"
      && !/script-src[^;]*'unsafe-inline'/.test(csp)
      && !/default-src[^;]*'unsafe-inline'/.test(csp)
    ), { csp, styleSrcAttr, styleSrcElem })
  ];
};

const contentDispositionChecks = (label, response, disposition) => {
  const value = response.headers["content-disposition"] || "";
  return [
    check(`security-${label}-content-disposition-${disposition}`, value.toLowerCase().startsWith(disposition), {
      disposition,
      value
    }),
    check(`security-${label}-content-disposition-has-utf8-filename`, /filename\*=UTF-8''/i.test(value), {
      value
    }),
    check(`security-${label}-content-disposition-no-crlf`, !/[\r\n]/.test(value), {
      value
    })
  ];
};

fs.mkdirSync(reportsDir, { recursive: true });

const serverIndexSource = readServerIndex();
const documents = readDocuments();
const placeholderOnlyDataset = documents.length > 0 && documents.every((document) => !document.fileName && !document.url);
const preferredExcelIds = ["doc-hop-at-t05-2026-v2"];
const preferredPdfIds = ["75456bb9-5602-4864-856b-9246cb01f458"];
const excelDocument = pickDocument(documents, ".xlsx", preferredExcelIds);
const pdfDocument = pickDocument(documents, ".pdf", preferredPdfIds);
const checks = [
  check("security-source-strict-public-hsts-configured", (
    /Strict-Transport-Security/.test(serverIndexSource)
    && /if\s*\(\s*strictSecurity\s*\)\s*\{[\s\S]{0,220}Strict-Transport-Security/.test(serverIndexSource)
    && /max-age=31536000;\s*includeSubDomains/.test(serverIndexSource)
    && !/max-age=31536000;\s*includeSubDomains;\s*preload/.test(serverIndexSource)
  ), {
    hasHstsHeader: /Strict-Transport-Security/.test(serverIndexSource),
    hasStrictSecurityGuard: /if\s*\(\s*strictSecurity\s*\)\s*\{[\s\S]{0,220}Strict-Transport-Security/.test(serverIndexSource),
    hasOneYearMaxAge: /max-age=31536000;\s*includeSubDomains/.test(serverIndexSource),
    preloadEnabled: /max-age=31536000;\s*includeSubDomains;\s*preload/.test(serverIndexSource)
  }),
  check("security-source-strict-public-csp-connect-src-self-only", (
    /const\s+appConnectSrc\s*=\s*strictSecurity\s*\?\s*"connect-src 'self'"\s*:\s*"connect-src 'self' http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\*"/.test(serverIndexSource)
    && /Content-Security-Policy",\s*appContentSecurityPolicy/.test(serverIndexSource)
    && !/Content-Security-Policy",\s*"[^"]*localhost:\*/.test(serverIndexSource)
  ), {
    hasStrictConnectSrcBranch: /const\s+appConnectSrc\s*=\s*strictSecurity\s*\?\s*"connect-src 'self'"\s*:\s*"connect-src 'self' http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\*"/.test(serverIndexSource),
    usesComposedCspHeader: /Content-Security-Policy",\s*appContentSecurityPolicy/.test(serverIndexSource),
    hasHardcodedLocalhostCspHeader: /Content-Security-Policy",\s*"[^"]*localhost:\*/.test(serverIndexSource)
  }),
  check("security-source-browser-isolation-headers-configured", (
    /Cross-Origin-Opener-Policy",\s*"same-origin"/.test(serverIndexSource)
    && /Origin-Agent-Cluster",\s*"\?1"/.test(serverIndexSource)
    && /const\s+allowsBrowserIsolationHeaders\s*=\s*\(req\)\s*=>\s*\{[\s\S]*?x-forwarded-proto[\s\S]*?isLoopbackHostname\(req\.hostname\)[\s\S]*?\};/.test(serverIndexSource)
    && /if\s*\(\s*allowsBrowserIsolationHeaders\(req\)\s*\)\s*\{[\s\S]{0,180}Origin-Agent-Cluster[\s\S]{0,180}Cross-Origin-Opener-Policy[\s\S]{0,80}\}/.test(serverIndexSource)
    && /X-Permitted-Cross-Domain-Policies",\s*"none"/.test(serverIndexSource)
    && /X-DNS-Prefetch-Control",\s*"off"/.test(serverIndexSource)
    && !/Cross-Origin-Embedder-Policy/.test(serverIndexSource)
  ), {
    hasConditionalIsolationHeaders: /if\s*\(\s*allowsBrowserIsolationHeaders\(req\)\s*\)\s*\{[\s\S]{0,180}Origin-Agent-Cluster[\s\S]{0,180}Cross-Origin-Opener-Policy[\s\S]{0,80}\}/.test(serverIndexSource),
    hasCoopSameOrigin: /Cross-Origin-Opener-Policy",\s*"same-origin"/.test(serverIndexSource),
    hasDnsPrefetchOff: /X-DNS-Prefetch-Control",\s*"off"/.test(serverIndexSource),
    hasNoCoep: !/Cross-Origin-Embedder-Policy/.test(serverIndexSource),
    hasOac: /Origin-Agent-Cluster",\s*"\?1"/.test(serverIndexSource),
    hasPermittedCrossDomainPoliciesNone: /X-Permitted-Cross-Domain-Policies",\s*"none"/.test(serverIndexSource),
    hasTrustworthyOriginGuard: /const\s+allowsBrowserIsolationHeaders\s*=\s*\(req\)\s*=>\s*\{[\s\S]*?x-forwarded-proto[\s\S]*?isLoopbackHostname\(req\.hostname\)[\s\S]*?\};/.test(serverIndexSource)
  }),
  check("security-source-api-default-no-store-cache-control", (
    /app\.use\(\s*"\/api"\s*,\s*\(_req,\s*res,\s*next\)\s*=>\s*\{[\s\S]*?res\.hasHeader\("Cache-Control"\)[\s\S]*?res\.setHeader\("Cache-Control",\s*"no-store"\)/.test(serverIndexSource)
  ), {
    hasApiNoStoreMiddleware: /app\.use\(\s*"\/api"\s*,\s*\(_req,\s*res,\s*next\)\s*=>\s*\{/.test(serverIndexSource),
    preservesExplicitCacheControl: /res\.hasHeader\("Cache-Control"\)/.test(serverIndexSource),
    setsNoStore: /res\.setHeader\("Cache-Control",\s*"no-store"\)/.test(serverIndexSource)
  }),
  check("security-documents-json-readable", documents.length > 0, {
    documentsPath,
    totalDocuments: documents.length
  }),
  check("security-excel-document-selected", placeholderOnlyDataset || Boolean(excelDocument), {
    placeholderOnlyDataset,
    selectedId: excelDocument?.id || "",
    selectedOriginalName: excelDocument?.originalName || "",
    selectedTitle: excelDocument?.title || ""
  }),
  check("security-pdf-document-selected", placeholderOnlyDataset || Boolean(pdfDocument), {
    placeholderOnlyDataset,
    selectedId: pdfDocument?.id || "",
    selectedOriginalName: pdfDocument?.originalName || "",
    selectedTitle: pdfDocument?.title || ""
  }),
  ...preferredDocumentChecks("excel", excelDocument, preferredExcelIds),
  ...preferredDocumentChecks("pdf", pdfDocument, preferredPdfIds)
];
const responses = [];

const routes = [
  { csp: "app", label: "home-html", route: "/" },
  { csp: "app", label: "health-json", route: "/api/health" },
  { csp: "app", label: "documents-json", route: "/api/documents?pageSize=1" },
  ...(pdfDocument ? [
    {
      csp: "app",
      disposition: "inline",
      label: "pdf-file-inline",
      route: `/api/documents/${encodeURIComponent(pdfDocument.id)}/file?disposition=inline`
    },
    {
      csp: "app",
      disposition: "inline",
      label: "pdf-preview-file",
      route: `/api/documents/${encodeURIComponent(pdfDocument.id)}/preview-file`
    },
    {
      csp: "app",
      disposition: "inline",
      label: "pdf-static-upload",
      route: pdfDocument.url
    }
  ] : []),
  ...(excelDocument ? [
    {
      csp: "excel",
      label: "excel-html-preview",
      route: `/api/documents/${encodeURIComponent(excelDocument.id)}/excel-html-preview/`
    },
    {
      csp: "app",
      disposition: "attachment",
      label: "excel-file-download",
      route: `/api/documents/${encodeURIComponent(excelDocument.id)}/file?disposition=attachment`
    }
  ] : [])
];

for (const route of routes) {
  const response = await request(route);
  responses.push({
    contentType: response.contentType,
    label: route.label,
    route: route.route,
    status: response.status
  });
  checks.push(check(`security-${route.label}-reachable`, response.ok, {
    contentType: response.contentType,
    route: route.route,
    status: response.status
  }));
  checks.push(...globalHeaderChecks(route.label, response));
  checks.push(...(route.csp === "excel" ? excelPreviewCspChecks(route.label, response) : appCspChecks(route.label, response)));
  if (route.disposition) {
    checks.push(...contentDispositionChecks(route.label, response, route.disposition));
  }
}

const disallowedCors = await request({
  headers: { Origin: "https://evil.example" },
  route: "/api/documents?pageSize=1"
});
responses.push({
  contentType: disallowedCors.contentType,
  label: "cors-disallowed-origin",
  route: "/api/documents?pageSize=1",
  status: disallowedCors.status
});
checks.push(...corsRejectedChecks("cors-disallowed-origin", disallowedCors));

const disallowedCorsMutations = [
  {
    body: { username: "blocked-by-cors", password: "blocked-by-cors" },
    label: "cors-disallowed-login-post",
    method: "POST",
    route: "/api/auth/login"
  },
  {
    body: { title: "blocked by CORS audit" },
    label: "cors-disallowed-bulletin-post",
    method: "POST",
    route: "/api/safety-bulletins"
  },
  {
    body: { companyName: "Blocked by CORS audit" },
    label: "cors-disallowed-config-put",
    method: "PUT",
    route: "/api/config"
  },
  {
    label: "cors-disallowed-document-delete",
    method: "DELETE",
    route: "/api/documents/cors-audit-nonexistent-document"
  },
  {
    headers: {
      "Access-Control-Request-Headers": "content-type",
      "Access-Control-Request-Method": "POST"
    },
    label: "cors-disallowed-preflight-post",
    method: "OPTIONS",
    route: "/api/safety-bulletins"
  }
];

for (const mutation of disallowedCorsMutations) {
  const response = await request({
    body: mutation.body ?? null,
    headers: {
      Origin: "https://evil.example",
      ...(mutation.headers || {})
    },
    method: mutation.method,
    route: mutation.route
  });
  responses.push({
    contentType: response.contentType,
    label: mutation.label,
    method: mutation.method,
    route: mutation.route,
    status: response.status
  });
  checks.push(...corsRejectedChecks(mutation.label, response));
}

const failedChecks = checks.filter((item) => !item.pass);
const report = {
  baseUrl,
  checks,
  failedChecks,
  generatedAtUtc: new Date().toISOString(),
  ok: failedChecks.length === 0,
  responses,
  summary: {
    failed: failedChecks.length,
    passed: checks.length - failedChecks.length,
    total: checks.length
  }
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  failedChecks,
  ok: report.ok,
  reportPath,
  responses,
  summary: report.summary
}, null, 2));

if (!report.ok) process.exit(1);
