import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { mojibakeScore } from "../server/core/textEncoding.js";

const readArg = (name, fallback) => {
  const index = process.argv.lastIndexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
};

const rootDir = process.cwd();
const baseUrl = readArg("--url", process.env.VERIFY_BASE_URL || "http://127.0.0.1:3333/");
const reportsDir = path.join(rootDir, "qa", "reports");
const reportPath = path.join(reportsDir, "text-integrity-audit.json");
const sharedDefaultConfigPath = path.join(rootDir, "shared", "defaultConfig.js");
const expectedDisplayName = "Nguyễn Văn Thắng - PE1";
const expectedIndexAuthor = "Nguyen Van Thang - PE1";
const expectedSchemaTypes = ["Organization", "WebSite", "SoftwareApplication", "BreadcrumbList", "FAQPage"];

const files = [
  { label: "config", path: path.join(rootDir, "server", "data", "config.json") },
  { label: "documents", path: path.join(rootDir, "server", "data", "documents.json") },
  { label: "users", path: path.join(rootDir, "server", "data", "auth", "users.json") }
];
const htmlFiles = [
  { label: "source-index", path: path.join(rootDir, "index.html"), required: true },
  { label: "dist-index", path: path.join(rootDir, "dist", "index.html"), required: false }
];
const sourceTextFiles = [
  {
    label: "home-page",
    path: path.join(rootDir, "src", "pages", "HomePage.tsx"),
    requiredSnippets: []
  },
  {
    label: "i18n",
    path: path.join(rootDir, "src", "i18n.ts"),
    requiredSnippets: [
      "Nguyễn Văn Thắng - PE1",
      "Danh sách hệ thống",
      "Nhật ký công việc",
      "Tổng quan hệ thống MHChub",
      "MHChub là cổng tiện ích nội bộ",
      "Tóm tắt thông báo chính",
      "Các điểm cần xử lý ngay",
      "Tài liệu mới ban hành"
    ]
  },
  {
    label: "shared-default-config",
    path: sharedDefaultConfigPath,
    requiredSnippets: [
      "Nhật ký ghi chép công việc",
      "An toàn - 6S",
      "Sản xuất"
    ]
  }
];

const personKeys = new Set(["displayName", "createdByName", "updatedByName"]);

const check = (name, pass, evidence = {}) => ({
  evidence,
  name,
  pass: Boolean(pass)
});

const ensureDir = (directory) => fs.mkdirSync(directory, { recursive: true });

const hasRawMojibakeMarker = (text) =>
  mojibakeScore(text) > 0 || /[\u0080-\u009F]/u.test(String(text || ""));

const hasScriptLeak = (text) =>
  /[\u3040-\u30FF\u3400-\u9FFF\uF900-\uFAFF\uFF61-\uFF9F]/u.test(text);

const hasHalfwidthKana = (text) =>
  /[\uFF61-\uFF9F]/u.test(String(text || ""));

const isVietnameseOrPersonPath = (pathParts) =>
  pathParts.includes("vi") || personKeys.has(pathParts.at(-1));

const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();

const htmlTitle = (html) => html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";

const htmlMeta = (html, keyName, keyValue, attr = "content") => {
  const escapedValue = keyValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<meta\\s+[^>]*${keyName}=["']${escapedValue}["'][^>]*\\b${attr}=["']([^"']*)["'][^>]*>`, "i");
  return html.match(pattern)?.[1] || "";
};

const extractJsonLdBlocks = (html) =>
  [...html.matchAll(/<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean);

const schemaGraph = (block) => {
  const parsed = JSON.parse(block);
  return Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
};

const readJson = (file) => {
  const text = fs.readFileSync(file.path, "utf8");
  return {
    data: JSON.parse(text),
    label: file.label,
    path: file.path
  };
};

function walkStrings(value, source, pathParts = [], findings = []) {
  if (typeof value === "string") {
    const valueText = compact(value);
    const rawMojibake = hasRawMojibakeMarker(valueText);
    const scriptLeak = isVietnameseOrPersonPath(pathParts) && hasScriptLeak(valueText);
    if (rawMojibake || scriptLeak) {
      findings.push({
        path: pathParts.length ? pathParts.join(".") : "$",
        reason: rawMojibake ? "raw-mojibake-marker" : "unexpected-cjk-or-katakana-in-vietnamese-field",
        source,
        value: valueText.slice(0, 180)
      });
    }
    return findings;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, source, [...pathParts, `[${index}]`], findings));
    return findings;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      walkStrings(child, source, [...pathParts, key], findings);
    }
  }

  return findings;
}

function auditHtmlMetadata(file) {
  const html = fs.readFileSync(file.path, "utf8").replace(/^\uFEFF/, "");
  const title = htmlTitle(html);
  const description = htmlMeta(html, "name", "description");
  const author = htmlMeta(html, "name", "author");
  const ogTitle = htmlMeta(html, "property", "og:title");
  const ogDescription = htmlMeta(html, "property", "og:description");
  const twitterTitle = htmlMeta(html, "name", "twitter:title");
  const twitterDescription = htmlMeta(html, "name", "twitter:description");
  const schemaErrors = [];
  const schemaEntries = [];

  for (const block of extractJsonLdBlocks(html)) {
    try {
      schemaEntries.push(...schemaGraph(block));
    } catch (error) {
      schemaErrors.push(error.message);
    }
  }

  const schemaTypes = schemaEntries.map((entry) => entry?.["@type"]).filter(Boolean);
  const metaStrings = {
    author,
    description,
    ogDescription,
    ogTitle,
    title,
    twitterDescription,
    twitterTitle
  };
  const metaFindings = Object.entries(metaStrings)
    .filter(([, value]) => hasRawMojibakeMarker(value))
    .map(([key, value]) => ({ key, value: compact(value).slice(0, 180) }));

  return {
    author,
    description,
    label: file.label,
    metaFindings,
    ogDescription,
    ogTitle,
    path: file.path,
    schemaErrors,
    schemaTypes,
    title,
    twitterDescription,
    twitterTitle
  };
}

function auditSourceText(file) {
  const text = fs.readFileSync(file.path, "utf8").replace(/^\uFEFF/, "");
  const lineFindings = text.split(/\r?\n/).flatMap((line, index) => {
    const reasons = [];
    if (hasRawMojibakeMarker(line)) reasons.push("raw-mojibake-marker");
    if (hasHalfwidthKana(line)) reasons.push("halfwidth-kana-mojibake-marker");
    if (!reasons.length) return [];
    return [{
      line: index + 1,
      reasons,
      sample: compact(line).slice(0, 180)
    }];
  });
  const missingSnippets = file.requiredSnippets.filter((snippet) => !text.includes(snippet));

  return {
    label: file.label,
    lineFindings,
    matchedSnippetCount: file.requiredSnippets.length - missingSnippets.length,
    missingSnippets,
    path: file.path,
    requiredSnippetCount: file.requiredSnippets.length
  };
}

async function fetchJson(route) {
  const url = new URL(route, baseUrl).toString();
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${route} returned HTTP ${response.status}: ${text.slice(0, 120)}`);
  }
  return {
    data: JSON.parse(text),
    url
  };
}

const checks = [];
const parsedFiles = [];
const findings = [];
const htmlAudits = [];
const sourceTextAudits = [];
let sharedDefaultConfig = null;

for (const file of files) {
  try {
    const parsed = readJson(file);
    parsedFiles.push(parsed);
    findings.push(...walkStrings(parsed.data, file.label));
    checks.push(check(`text-json-${file.label}-parseable`, true, { path: file.path }));
  } catch (error) {
    checks.push(check(`text-json-${file.label}-parseable`, false, { error: error.message, path: file.path }));
  }
}

for (const file of htmlFiles) {
  if (!fs.existsSync(file.path)) {
    checks.push(check(`text-html-${file.label}-present`, !file.required, {
      path: file.path,
      skipped: !file.required
    }));
    continue;
  }

  try {
    const audit = auditHtmlMetadata(file);
    htmlAudits.push({
      label: audit.label,
      path: audit.path,
      schemaTypes: audit.schemaTypes,
      title: audit.title
    });

    checks.push(check(`text-html-${file.label}-parseable`, true, { path: file.path }));
    checks.push(check(`text-html-${file.label}-meta-has-no-mojibake`, audit.metaFindings.length === 0, {
      findings: audit.metaFindings
    }));
    checks.push(check(`text-html-${file.label}-title-is-useful`, (
      audit.title.includes("MHChub")
      && audit.title.includes("IoT")
      && audit.title.includes("Gateway")
      && audit.title.includes("6S")
    ), {
      title: audit.title
    }));
    checks.push(check(`text-html-${file.label}-description-is-useful`, (
      audit.description.length >= 80
      && audit.description.includes("MHChub")
      && audit.description.includes("IoT Mani")
      && audit.description.includes("PLC Gateway Pro")
      && audit.description.includes("6S")
    ), {
      description: audit.description,
      length: audit.description.length
    }));
    checks.push(check(`text-html-${file.label}-author-credit-present`, audit.author === expectedIndexAuthor, {
      actual: audit.author,
      expected: expectedIndexAuthor
    }));
    checks.push(check(`text-html-${file.label}-social-meta-complete`, Boolean(
      audit.ogTitle
      && audit.ogDescription
      && audit.twitterTitle
      && audit.twitterDescription
      && audit.ogTitle === audit.twitterTitle
    ), {
      ogDescription: audit.ogDescription,
      ogTitle: audit.ogTitle,
      twitterDescription: audit.twitterDescription,
      twitterTitle: audit.twitterTitle
    }));
    checks.push(check(`text-html-${file.label}-jsonld-parseable`, audit.schemaErrors.length === 0 && audit.schemaTypes.length > 0, {
      schemaErrors: audit.schemaErrors,
      schemaTypes: audit.schemaTypes
    }));
    checks.push(check(`text-html-${file.label}-jsonld-core-types-present`, expectedSchemaTypes.every((type) => audit.schemaTypes.includes(type)), {
      expectedSchemaTypes,
      schemaTypes: audit.schemaTypes
    }));
  } catch (error) {
    checks.push(check(`text-html-${file.label}-parseable`, false, {
      error: error.message,
      path: file.path
    }));
  }
}

for (const file of sourceTextFiles) {
  if (!fs.existsSync(file.path)) {
    checks.push(check(`text-source-${file.label}-present`, false, { path: file.path }));
    continue;
  }

  try {
    const audit = auditSourceText(file);
    sourceTextAudits.push(audit);
    checks.push(check(`text-source-${file.label}-no-mojibake-markers`, audit.lineFindings.length === 0, {
      findings: audit.lineFindings.slice(0, 12),
      totalFindings: audit.lineFindings.length
    }));
    checks.push(check(`text-source-${file.label}-required-vietnamese-snippets`, audit.missingSnippets.length === 0, {
      matchedSnippetCount: audit.matchedSnippetCount,
      missingSnippets: audit.missingSnippets,
      requiredSnippetCount: audit.requiredSnippetCount
    }));
  } catch (error) {
    checks.push(check(`text-source-${file.label}-readable`, false, {
      error: error.message,
      path: file.path
    }));
  }
}

try {
  const imported = await import(pathToFileURL(sharedDefaultConfigPath).href);
  sharedDefaultConfig = imported.default || null;
  findings.push(...walkStrings(sharedDefaultConfig, "shared:defaultConfig"));
  checks.push(check("text-shared-default-config-loadable", Boolean(sharedDefaultConfig?.utilityLinks?.length), {
    path: sharedDefaultConfigPath,
    utilityLinks: sharedDefaultConfig?.utilityLinks?.length || 0
  }));
} catch (error) {
  checks.push(check("text-shared-default-config-loadable", false, {
    error: error.message,
    path: sharedDefaultConfigPath
  }));
}

const users = parsedFiles.find((file) => file.label === "users")?.data || [];
const config = parsedFiles.find((file) => file.label === "config")?.data || {};
const localUser = Array.isArray(users) ? users.find((item) => item.username === "thangiot") : null;
const localBulletins = Array.isArray(config.safetyBulletins) ? config.safetyBulletins : [];
const localUserName = localUser?.displayName || "";
const localBulletinEditorNames = localBulletins.map((item) => item.updatedByName).filter(Boolean);

checks.push(check("text-local-thangiot-display-name", localUserName === expectedDisplayName, {
  actual: localUserName,
  expected: expectedDisplayName
}));
checks.push(check("text-local-bulletin-editor-name", localBulletinEditorNames.includes(expectedDisplayName), {
  editorNames: localBulletinEditorNames,
  expected: expectedDisplayName
}));

const fallbackNotesTitle = sharedDefaultConfig?.utilityLinks?.find((item) => item.id === "notes")?.title?.vi || "";
const fallbackSafetyTitle = sharedDefaultConfig?.utilityLinks?.find((item) => item.id === "safety")?.title?.vi || "";
const fallbackProductionName = sharedDefaultConfig?.departments?.find((item) => item.id === "production")?.name?.vi || "";
checks.push(check("text-shared-default-config-core-vi-labels", (
  fallbackNotesTitle === "Nhật ký ghi chép công việc"
  && fallbackSafetyTitle === "An toàn - 6S"
  && fallbackProductionName === "Sản xuất"
), {
  fallbackNotesTitle,
  fallbackProductionName,
  fallbackSafetyTitle
}));

let apiConfig = null;
let apiBulletins = null;
try {
  apiConfig = await fetchJson("/api/config");
  findings.push(...walkStrings(apiConfig.data, "api:/api/config"));
  checks.push(check("text-api-config-readable", true, { url: apiConfig.url }));
} catch (error) {
  checks.push(check("text-api-config-readable", false, { error: error.message }));
}

try {
  apiBulletins = await fetchJson("/api/safety-bulletins");
  findings.push(...walkStrings(apiBulletins.data, "api:/api/safety-bulletins"));
  checks.push(check("text-api-bulletins-readable", true, { url: apiBulletins.url }));
} catch (error) {
  checks.push(check("text-api-bulletins-readable", false, { error: error.message }));
}

const apiBulletinRows = Array.isArray(apiBulletins?.data?.data) ? apiBulletins.data.data : [];
const apiBulletinEditorNames = apiBulletinRows.map((item) => item.updatedByName).filter(Boolean);
checks.push(check("text-api-bulletin-editor-name", apiBulletinEditorNames.length === 0 || apiBulletinEditorNames.includes(expectedDisplayName), {
  editorNames: apiBulletinEditorNames,
  expected: expectedDisplayName
}));

checks.push(check("text-no-mojibake-runtime-strings", findings.length === 0, {
  findings: findings.slice(0, 40),
  totalFindings: findings.length
}));

ensureDir(reportsDir);

const failedChecks = checks.filter((item) => !item.pass);
const summary = {
  failed: failedChecks.length,
  passed: checks.filter((item) => item.pass).length,
  total: checks.length
};
const report = {
  baseUrl,
  checks,
  failedChecks,
  findings,
  generatedAtUtc: new Date().toISOString(),
  htmlAudits,
  ok: failedChecks.length === 0,
  sourceTextAudits,
  summary
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  failedChecks,
  ok: report.ok,
  reportPath,
  sourceTextFindings: sourceTextAudits.reduce((sum, audit) => sum + audit.lineFindings.length, 0),
  summary,
  runtimeStringFindings: findings.length
}, null, 2));

if (!report.ok) process.exitCode = 1;
