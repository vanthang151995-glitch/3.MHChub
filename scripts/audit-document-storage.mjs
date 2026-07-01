import crypto from "crypto";
import fs from "fs";
import http from "http";
import https from "https";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";
import {
  allowedDocumentUploadExtensions,
  forbiddenDocumentUploadExtensions
} from "../server/core/documentUploadPolicy.js";
import { mojibakeScore } from "../server/core/textEncoding.js";
import { loadLocalEnv } from "../server/loadEnv.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

loadLocalEnv(rootDir);

const readArg = (name, fallback) => {
  const index = process.argv.lastIndexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
};

const hasFlag = (name) => process.argv.includes(name);

const baseUrl = readArg("--url", process.env.VERIFY_BASE_URL || "http://127.0.0.1:3333/");
const skipApi = hasFlag("--skip-api");
const skipMysql = hasFlag("--skip-mysql");
const verboseConsole = hasFlag("--verbose");
const reportDir = path.resolve(rootDir, readArg("--report-dir", path.join("qa", "reports")));
const reportJsonPath = path.join(reportDir, "document-storage-audit.json");
const maxUploadMb = Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 50);

const docsFile = path.join(rootDir, "server", "data", "documents.json");
const uploadDir = path.join(rootDir, "server", "uploads");
const previewDir = path.join(rootDir, "server", "previews");
const htmlPreviewDir = path.join(previewDir, "html");
const serverIndexFile = path.join(rootDir, "server", "index.js");
const frontendDownloadFiles = [
  path.join(rootDir, "src", "pages", "DocumentsPage.tsx"),
  path.join(rootDir, "src", "pages", "DocumentPreviewPage.tsx"),
  path.join(rootDir, "src", "components", "ui.tsx"),
  path.join(rootDir, "src", "components", "FeedDetailModal.tsx")
];
const allowedMimePrefixes = ["application/", "image/", "text/"];
const requiredUploadExtensions = allowedDocumentUploadExtensions;
const forbiddenUploadExtensions = forbiddenDocumentUploadExtensions;
const mysqlStringFieldMap = [
  ["title", "title"],
  ["category", "category"],
  ["departmentId", "department_id"],
  ["departmentName", "department_name"],
  ["language", "language"],
  ["version", "version"],
  ["originalName", "original_name"],
  ["fileName", "file_name"],
  ["mimeType", "mime_type"],
  ["url", "url"],
  ["source", "source"],
  ["sourcePath", "source_path"],
  ["storagePath", "storage_path"],
  ["previewFileName", "preview_file_name"],
  ["previewMimeType", "preview_mime_type"],
  ["previewUrl", "preview_url"],
  ["previewStatus", "preview_status"],
  ["previewError", "preview_error"],
  ["createdBy", "created_by"],
  ["createdByName", "created_by_name"],
  ["createdByRole", "created_by_role"],
  ["updatedBy", "updated_by"],
  ["updatedByName", "updated_by_name"],
  ["updatedByRole", "updated_by_role"]
];
const mysqlNumberFieldMap = [
  ["size", "size"],
  ["previewSize", "preview_size"]
];
const mysqlDateFieldMap = [
  ["uploadedAt", "uploaded_at"],
  ["previewGeneratedAt", "preview_generated_at"],
  ["createdAt", "created_at"],
  ["updatedAt", "updated_at"]
];
const apiStringFields = mysqlStringFieldMap.map(([jsonKey]) => jsonKey);
const apiNumberFields = mysqlNumberFieldMap.map(([jsonKey]) => jsonKey);
const apiDateFields = mysqlDateFieldMap.map(([jsonKey]) => jsonKey);
const mysqlDocumentColumns = [
  "id",
  ...mysqlStringFieldMap.map(([, column]) => column),
  ...mysqlNumberFieldMap.map(([, column]) => column),
  ...mysqlDateFieldMap.map(([, column]) => column)
];
const badTokens = [
  ["Nguy", "n"].join("?"),
  String.fromCodePoint(0xfffd),
  String.fromCodePoint(0x76fb),
  String.fromCodePoint(0x862f),
  String.fromCodePoint(0xff83),
  String.fromCodePoint(0x9edb)
];
const badCodepoints = new Set([0xfffd, 0x76fb, 0x862f, 0x9edb, 0xff83, 0xff86, 0xff84, 0xff70, 0xff61, 0xff6d, 0xff9e]);
const pdfSignature = "%PDF";

const checks = [];

const addCheck = (name, pass, evidence = {}) => {
  checks.push({ name, pass: Boolean(pass), evidence });
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const readAsciiPrefix = (filePath, length = 5) => {
  try {
    const handle = fs.openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(length);
      const bytesRead = fs.readSync(handle, buffer, 0, length, 0);
      return buffer.subarray(0, bytesRead).toString("ascii");
    } finally {
      fs.closeSync(handle);
    }
  } catch {
    return "";
  }
};

const sha256File = (filePath) => {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  } catch {
    return "";
  }
};

const isPdfDocument = (document) =>
  path.extname(String(document?.originalName || document?.fileName || "")).toLowerCase() === ".pdf"
  || String(document?.mimeType || "").toLowerCase() === "application/pdf";

const isPdfPreview = (document) =>
  path.extname(String(document?.previewFileName || "")).toLowerCase() === ".pdf"
  || String(document?.previewMimeType || "").toLowerCase() === "application/pdf";

const isInside = (parent, child) => {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const hasBadText = (value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return (
    mojibakeScore(text) > 0 ||
    badTokens.some((token) => text.includes(token)) ||
    [...text].some((char) => {
      const codepoint = char.codePointAt(0);
      return badCodepoints.has(codepoint) || (codepoint >= 0x80 && codepoint <= 0x9f) || (codepoint >= 0xff61 && codepoint <= 0xff9f);
    })
  );
};

const decodeDispositionFilenameStar = (disposition = "") => {
  const match = String(disposition || "").match(/filename\*=UTF-8''([^;]+)/i);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1].trim());
  } catch {
    return "";
  }
};

const dispositionFallbackFilename = (disposition = "") => {
  const match = String(disposition || "").match(/filename="([^"]*)"/i);
  return match?.[1] || "";
};

const safeUrlPath = (value) => {
  try {
    const parsed = new URL(value, "http://local.test");
    return parsed.pathname;
  } catch {
    return "";
  }
};

const normalizeIsoSecond = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value).replace(" ", "T").replace(/Z?$/, "Z"));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 19);
};

const compareDocumentToMysqlRow = (document, row) => {
  const mismatches = [];

  for (const [jsonKey, column] of mysqlStringFieldMap) {
    const jsonValue = String(document[jsonKey] ?? "");
    const mysqlValue = String(row[column] ?? "");
    if (jsonValue !== mysqlValue) {
      mismatches.push({
        column,
        id: document.id,
        jsonKey,
        jsonLength: jsonValue.length,
        mysqlLength: mysqlValue.length,
        type: "string"
      });
    }
  }

  for (const [jsonKey, column] of mysqlNumberFieldMap) {
    const jsonValue = Number(document[jsonKey] ?? 0);
    const mysqlValue = Number(row[column] ?? 0);
    if (jsonValue !== mysqlValue) {
      mismatches.push({
        column,
        id: document.id,
        jsonKey,
        jsonValue,
        mysqlValue,
        type: "number"
      });
    }
  }

  for (const [jsonKey, column] of mysqlDateFieldMap) {
    const jsonValue = normalizeIsoSecond(document[jsonKey]);
    const mysqlValue = normalizeIsoSecond(row[column]);
    if (jsonValue !== mysqlValue) {
      mismatches.push({
        column,
        id: document.id,
        jsonKey,
        jsonValue,
        mysqlValue,
        type: "datetime"
      });
    }
  }

  return mismatches;
};

const compareDocumentToApiItem = (document, item) => {
  const mismatches = [];

  for (const jsonKey of apiStringFields) {
    const jsonValue = String(document[jsonKey] ?? "");
    const apiValue = String(item[jsonKey] ?? "");
    if (jsonValue !== apiValue) {
      mismatches.push({
        id: document.id,
        jsonKey,
        jsonLength: jsonValue.length,
        apiLength: apiValue.length,
        type: "string"
      });
    }
  }

  for (const jsonKey of apiNumberFields) {
    const jsonValue = Number(document[jsonKey] ?? 0);
    const apiValue = Number(item[jsonKey] ?? 0);
    if (jsonValue !== apiValue) {
      mismatches.push({
        id: document.id,
        jsonKey,
        jsonValue,
        apiValue,
        type: "number"
      });
    }
  }

  for (const jsonKey of apiDateFields) {
    const jsonValue = normalizeIsoSecond(document[jsonKey]);
    const apiValue = normalizeIsoSecond(item[jsonKey]);
    if (jsonValue !== apiValue) {
      mismatches.push({
        id: document.id,
        jsonKey,
        jsonValue,
        apiValue,
        type: "datetime"
      });
    }
  }

  return mismatches;
};

const walkFiles = (dir, predicate = () => true) => {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(filePath);
      } else if (entry.isFile() && predicate(filePath)) {
        result.push(filePath);
      }
    }
  };
  walk(dir);
  return result;
};

const cspHasAll = (policy, values) => values.every((value) => String(policy || "").includes(value));

const pickPreferredDocument = (candidates, preferredIds = []) =>
  preferredIds
    .map((id) => candidates.find((document) => document.id === id))
    .find(Boolean) || candidates[0] || null;

const htmlAttrValuePattern = /\s+([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+)/g;

const decodeHtmlProtocolText = (value = "") =>
  String(value)
    .replace(/&#x([0-9a-fA-F]+);?/g, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#([0-9]+);?/g, (_match, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&colon;/gi, ":")
    .replace(/&tab;/gi, "\t")
    .replace(/&newline;/gi, "\n")
    .replace(/&amp;/gi, "&");

const normalizeUrlProtocol = (value = "") =>
  decodeHtmlProtocolText(value)
    .replace(/[\u0000-\u0020\u007f]+/g, "")
    .toLowerCase();

const hasDangerousHtmlPreviewUrl = (text = "") => {
  for (const match of String(text).matchAll(htmlAttrValuePattern)) {
    const name = String(match[1] || "").toLowerCase();
    const value = match[3] ?? match[4] ?? String(match[2] || "").replace(/^['"]|['"]$/g, "");
    if (name === "srcdoc" || name === "action" || name === "formaction") return true;
    const normalized = normalizeUrlProtocol(value);
    if (normalized.startsWith("javascript:") || normalized.startsWith("vbscript:")) return true;
    if ((name === "href" || name === "xlink:href") && normalized.startsWith("data:")) return true;
    if (name === "srcset" && (normalized.includes("javascript:") || normalized.includes("vbscript:") || normalized.includes("data:"))) {
      return true;
    }
    if (name === "src" && normalized.startsWith("data:") && !normalized.startsWith("data:image/")) {
      return true;
    }
  }
  return false;
};

const lengthFromHeaders = (headers) => {
  const contentRange = headers.get("content-range") || "";
  const total = Number(contentRange.match(/\/(\d+)$/)?.[1]);
  if (Number.isFinite(total) && total > 0) return total;
  return Number(headers.get("content-length")) || 0;
};

const headerValue = (headers, name) => {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(", ") : value || "";
};

const requestProbe = (url, { method = "HEAD", headers = {} } = {}) =>
  new Promise((resolve) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.request(
      parsed,
      {
        method,
        headers,
        timeout: 8000
      },
      (response) => {
        response.on("data", () => {});
        response.on("end", () => {
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode || 0,
            length: lengthFromHeaders({
              get: (name) => headerValue(response.headers, name)
            }),
            contentType: headerValue(response.headers, "content-type"),
            csp: headerValue(response.headers, "content-security-policy"),
            disposition: headerValue(response.headers, "content-disposition"),
            method,
            error: ""
          });
        });
        response.resume();
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("request timeout"));
    });
    request.on("error", (error) => {
      resolve({
        ok: false,
        status: 0,
        length: 0,
        contentType: "",
        csp: "",
        disposition: "",
        method,
        error: error.message
      });
    });
    request.end();
  });

const fetchHead = async (url) => {
  const head = await requestProbe(url);
  if (head.ok) return head;

  const fallback = await requestProbe(url, { method: "GET", headers: { Range: "bytes=0-0" } });
  if (fallback.error) {
    return {
      ...fallback,
      method: "HEAD + GET range",
      error: `${head.error || `HEAD status ${head.status}`}; fallback: ${fallback.error}`
    };
  }
  return { ...fallback, method: "GET range", error: head.error || `HEAD status ${head.status}` };
};

const fetchRangePrefix = async (url, length = 5) => {
  try {
    const response = await fetch(url, {
      headers: {
        Range: `bytes=0-${Math.max(0, length - 1)}`
      }
    });
    const buffer = Buffer.from(await response.arrayBuffer()).subarray(0, length);
    return {
      bytesRead: buffer.length,
      contentRange: response.headers.get("content-range") || "",
      contentType: response.headers.get("content-type") || "",
      disposition: response.headers.get("content-disposition") || "",
      error: "",
      ok: response.ok,
      prefix: buffer.toString("ascii"),
      status: response.status
    };
  } catch (error) {
    return {
      bytesRead: 0,
      contentRange: "",
      contentType: "",
      disposition: "",
      error: error.message,
      ok: false,
      prefix: "",
      status: 0
    };
  }
};

const hasMysqlConfig = () =>
  !!(process.env.MHCHUB_MYSQL_HOST && process.env.MHCHUB_MYSQL_DATABASE && process.env.MHCHUB_MYSQL_USER);

const envNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const connectMysql = () =>
  mysql.createPool({
    host: process.env.MHCHUB_MYSQL_HOST,
    port: envNumber("MHCHUB_MYSQL_PORT", 3306),
    user: process.env.MHCHUB_MYSQL_USER,
    password: process.env.MHCHUB_MYSQL_PASSWORD || "",
    database: process.env.MHCHUB_MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 2,
    dateStrings: true,
    charset: "utf8mb4"
  });

const documents = readJson(docsFile);
const serverIndexText = fs.existsSync(serverIndexFile) ? fs.readFileSync(serverIndexFile, "utf8") : "";
const unsafeInlineToken = ["unsafe", "inline"].join("-");
const htmlPreviewFiles = walkFiles(htmlPreviewDir, (filePath) => filePath.toLowerCase().endsWith(".html"));
const ids = documents.map((item) => String(item.id || ""));
const uniqueIds = new Set(ids);
const uploadedDocuments = documents.filter((document) => document.fileName || document.url);
const manualImportDocuments = documents.filter((document) => document.source === "manual-import");
const placeholders = documents.filter((document) => !document.fileName && !document.url);
const placeholderOnlyDataset = documents.length > 0 && placeholders.length === documents.length;
const warnings = [];
const manualSourceEvidence = [];
const htmlPreviewDocuments = documents.filter((document) => {
  if (!document.fileName) return false;
  const extension = path.extname(String(document.originalName || document.fileName || "")).toLowerCase();
  return [".xlsx", ".xlsm", ".xls"].includes(extension);
});
const preferredHtmlPreviewDocumentIds = ["doc-hop-at-t05-2026-v2"];
const htmlPreviewProbeDocument = pickPreferredDocument(htmlPreviewDocuments, preferredHtmlPreviewDocumentIds);
const preferredHtmlPreviewDocumentAvailable = preferredHtmlPreviewDocumentIds.some((id) =>
  htmlPreviewDocuments.some((document) => document.id === id)
);
const htmlPreviewScriptFiles = htmlPreviewFiles
  .filter((filePath) => /<script\b/i.test(fs.readFileSync(filePath, "utf8")))
  .map((filePath) => path.relative(rootDir, filePath).replace(/\\/g, "/"));
const htmlPreviewEventHandlerFiles = htmlPreviewFiles
  .filter((filePath) => /\son[a-z]+\s*=/i.test(fs.readFileSync(filePath, "utf8")))
  .map((filePath) => path.relative(rootDir, filePath).replace(/\\/g, "/"));
const htmlPreviewDangerousElementFiles = htmlPreviewFiles
  .filter((filePath) => /<(?:iframe|object|embed|applet|form|input|button|select|textarea|base)\b/i.test(fs.readFileSync(filePath, "utf8")))
  .map((filePath) => path.relative(rootDir, filePath).replace(/\\/g, "/"));
const htmlPreviewMetaRefreshFiles = htmlPreviewFiles
  .filter((filePath) => /<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(?:"refresh"|'refresh'|refresh))[^>]*>/i.test(fs.readFileSync(filePath, "utf8")))
  .map((filePath) => path.relative(rootDir, filePath).replace(/\\/g, "/"));
const htmlPreviewDangerousUrlFiles = htmlPreviewFiles
  .filter((filePath) => hasDangerousHtmlPreviewUrl(fs.readFileSync(filePath, "utf8")))
  .map((filePath) => path.relative(rootDir, filePath).replace(/\\/g, "/"));
const uploadPolicyExtensions = allowedDocumentUploadExtensions;
const uploadPolicyMissingExtensions = requiredUploadExtensions.filter((extension) => !uploadPolicyExtensions.includes(extension));
const uploadPolicyForbiddenExtensions = forbiddenUploadExtensions.filter((extension) => uploadPolicyExtensions.includes(extension));
const uploadedExtensions = [...new Set(uploadedDocuments.map((document) =>
  path.extname(String(document.originalName || document.fileName || "")).toLowerCase()
).filter(Boolean))].sort();
const uploadedExtensionsMissingFromPolicy = uploadedExtensions.filter((extension) => !uploadPolicyExtensions.includes(extension));

addCheck("documents-json-is-array", Array.isArray(documents), { docsFile });
addCheck("documents-have-unique-ids", uniqueIds.size === ids.length && !ids.includes(""), {
  total: ids.length,
  unique: uniqueIds.size,
  emptyIds: ids.filter((id) => !id).length
});
addCheck("documents-have-no-known-mojibake", !hasBadText(documents), { total: documents.length });
addCheck("documents-json-file-inside-root", isInside(rootDir, docsFile), { docsFile });
addCheck("upload-dir-exists", fs.existsSync(uploadDir), { uploadDir });
addCheck("preview-dir-exists", fs.existsSync(previewDir), { previewDir });
addCheck("excel-html-preview-dir-exists", placeholderOnlyDataset || fs.existsSync(htmlPreviewDir), { htmlPreviewDir, placeholderOnlyDataset });
addCheck("excel-html-preview-files-present", placeholderOnlyDataset || htmlPreviewFiles.length > 0, { count: htmlPreviewFiles.length, placeholderOnlyDataset });
addCheck("excel-html-preview-spreadsheet-document-present", placeholderOnlyDataset || Boolean(htmlPreviewProbeDocument), {
  placeholderOnlyDataset,
  spreadsheetDocuments: htmlPreviewDocuments.length
});
addCheck("excel-html-preview-preferred-document-selected-when-available", !preferredHtmlPreviewDocumentAvailable || preferredHtmlPreviewDocumentIds.includes(htmlPreviewProbeDocument?.id), {
  preferredAvailable: preferredHtmlPreviewDocumentAvailable,
  preferredIds: preferredHtmlPreviewDocumentIds,
  selectedId: htmlPreviewProbeDocument?.id || "",
  selectedOriginalName: htmlPreviewProbeDocument?.originalName || "",
  selectedTitle: htmlPreviewProbeDocument?.title || ""
});
addCheck("excel-html-preview-files-have-no-script-tags", htmlPreviewScriptFiles.length === 0, { htmlPreviewScriptFiles });
addCheck("excel-html-preview-files-have-no-inline-event-handlers", htmlPreviewEventHandlerFiles.length === 0, {
  htmlPreviewEventHandlerFiles
});
addCheck("excel-html-preview-files-have-no-dangerous-elements", htmlPreviewDangerousElementFiles.length === 0, {
  htmlPreviewDangerousElementFiles
});
addCheck("excel-html-preview-files-have-no-meta-refresh", htmlPreviewMetaRefreshFiles.length === 0, {
  htmlPreviewMetaRefreshFiles
});
addCheck("excel-html-preview-files-have-no-dangerous-url-attrs", htmlPreviewDangerousUrlFiles.length === 0, {
  htmlPreviewDangerousUrlFiles
});
addCheck(
  "server-excel-html-preview-csp-locks-active-content",
  cspHasAll(serverIndexText, [
    "excelHtmlPreviewCsp",
    "script-src 'none'",
    "connect-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
    `style-src-elem '${unsafeInlineToken}'`,
    `style-src-attr '${unsafeInlineToken}'`
  ]),
  {}
);
addCheck("uploaded-documents-present", placeholderOnlyDataset || uploadedDocuments.length > 0, { placeholderOnlyDataset, uploaded: uploadedDocuments.length });
addCheck("manual-import-documents-source-tracking-present", placeholderOnlyDataset || manualImportDocuments.length > 0, {
  placeholderOnlyDataset,
  manualImported: manualImportDocuments.length
});
addCheck("server-document-upload-policy-is-extension-whitelist", uploadPolicyExtensions.length >= requiredUploadExtensions.length, {
  allowedExtensions: uploadPolicyExtensions
});
addCheck("server-document-upload-policy-uses-shared-policy-module", /isAllowedDocumentUpload\(file\)/.test(serverIndexText), {});
addCheck("server-document-upload-policy-covers-supported-document-formats", uploadPolicyMissingExtensions.length === 0, {
  missingExtensions: uploadPolicyMissingExtensions,
  requiredExtensions: requiredUploadExtensions
});
addCheck("server-document-upload-policy-rejects-dangerous-extensions", uploadPolicyForbiddenExtensions.length === 0, {
  forbiddenAllowedExtensions: uploadPolicyForbiddenExtensions
});
addCheck("server-document-upload-policy-covers-existing-uploads", uploadedExtensionsMissingFromPolicy.length === 0, {
  uploadedExtensions,
  missingExtensions: uploadedExtensionsMissingFromPolicy
});
addCheck("server-document-upload-policy-enforces-mime-per-extension", /allowedDocumentUploadTypes\.get\(ext\)[\s\S]*allowedMimeTypes\.has\(mimeType\)/.test(fs.readFileSync(path.join(rootDir, "server", "core", "documentUploadPolicy.js"), "utf8")), {});
addCheck("server-document-upload-policy-uses-multer-file-filter", /fileFilter\s*:\s*\([^)]*\)\s*=>/.test(serverIndexText), {});
addCheck("server-document-upload-policy-has-file-size-limit", /limits\s*:\s*\{\s*fileSize\s*:\s*maxUploadMb\s*\*\s*1024\s*\*\s*1024\s*\}/.test(serverIndexText), {
  maxUploadMb
});

const directDownloadMatches = frontendDownloadFiles.flatMap((filePath) => {
  const text = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  return [...text.matchAll(/href=\{document\.url\}/g)].map((match) => ({
    file: path.relative(rootDir, filePath).replace(/\\/g, "/"),
    index: match.index
  }));
});
addCheck("frontend-download-links-use-file-api-route", directDownloadMatches.length === 0, { directDownloadMatches });

for (const document of documents) {
  const label = document.id || document.originalName || "unknown";
  addCheck(`document-${label}-has-basic-metadata`, Boolean(document.id && document.title && document.category && document.language), {
    id: document.id,
    title: document.title,
    category: document.category,
    language: document.language
  });

  addCheck(`document-${label}-mime-is-known-family`, !document.mimeType || allowedMimePrefixes.some((prefix) => document.mimeType.startsWith(prefix)), {
    mimeType: document.mimeType
  });

  if (!document.fileName && !document.url) {
    addCheck(`document-${label}-placeholder-shape`, document.source === "seed" && Number(document.size || 0) === 0, {
      source: document.source,
      size: document.size,
      storagePath: document.storagePath || ""
    });
    continue;
  }

  const fileName = String(document.fileName || "");
  const uploadedPath = path.resolve(uploadDir, fileName);
  const storagePath = path.resolve(rootDir, document.storagePath || "");
  const sourcePath = document.sourcePath ? path.resolve(rootDir, document.sourcePath) : "";
  const expectedUrl = `/uploads/${fileName}`;
  const stat = fs.existsSync(uploadedPath) ? fs.statSync(uploadedPath) : null;
  const urlPath = safeUrlPath(document.url || "");

  addCheck(`document-${label}-filename-is-basename`, fileName === path.basename(fileName), { fileName });
  addCheck(`document-${label}-url-matches-upload`, document.url === expectedUrl && urlPath === expectedUrl, {
    expectedUrl,
    actualUrl: document.url || ""
  });
  addCheck(`document-${label}-storage-path-inside-upload-dir`, isInside(uploadDir, storagePath), {
    storagePath: document.storagePath || "",
    uploadDir
  });
  addCheck(`document-${label}-uploaded-file-exists`, Boolean(stat?.isFile()), {
    fileName,
    uploadedPath
  });
  addCheck(`document-${label}-size-matches-file`, Boolean(stat) && Number(document.size) === stat.size, {
    metadataSize: document.size,
    fileSize: stat?.size || 0
  });
  if (isPdfDocument(document)) {
    const pdfPrefix = stat ? readAsciiPrefix(uploadedPath) : "";
    addCheck(`document-${label}-pdf-upload-starts-with-pdf-signature`, Boolean(stat) && pdfPrefix.startsWith(pdfSignature), {
      fileName,
      prefix: pdfPrefix
    });
  }

  if (document.source === "manual-import") {
    const sourceExistsInRoot = Boolean(sourcePath && fs.existsSync(sourcePath) && isInside(rootDir, sourcePath));
    const sourceStat = sourceExistsInRoot ? fs.statSync(sourcePath) : null;
    const sourceFileExists = Boolean(sourceStat?.isFile());
    const uploadedFileExists = Boolean(stat?.isFile());
    const sourceSha256 = sourceFileExists ? sha256File(sourcePath) : "";
    const uploadedSha256 = uploadedFileExists ? sha256File(uploadedPath) : "";
    const sizeMatches = sourceFileExists && uploadedFileExists && sourceStat.size === stat.size;
    const sha256Matches = Boolean(sourceSha256 && uploadedSha256 && sourceSha256 === uploadedSha256);

    manualSourceEvidence.push({
      id: document.id,
      fileName,
      sourcePath: document.sourcePath || "",
      sourceSize: sourceStat?.size || 0,
      uploadedSize: stat?.size || 0,
      sourceSha256,
      uploadedSha256,
      sizeMatches,
      sha256Matches
    });

    addCheck(`document-${label}-manual-source-exists`, sourceFileExists, {
      sourcePath: document.sourcePath || ""
    });
    addCheck(`document-${label}-manual-source-size-matches-upload`, sizeMatches, {
      sourceSize: sourceStat?.size || 0,
      uploadedSize: stat?.size || 0
    });
    addCheck(`document-${label}-manual-source-sha256-matches-upload`, sha256Matches, {
      sourceSha256,
      uploadedSha256
    });
  }

  if (document.previewStatus === "ready") {
    const previewFileName = String(document.previewFileName || "");
    const previewPath = path.resolve(previewDir, previewFileName);
    const previewStat = fs.existsSync(previewPath) ? fs.statSync(previewPath) : null;
    addCheck(`document-${label}-preview-path-inside-preview-dir`, previewFileName === path.basename(previewFileName) && isInside(previewDir, previewPath), {
      previewFileName
    });
    addCheck(`document-${label}-preview-file-exists`, Boolean(previewStat?.isFile()), {
      previewFileName,
      previewPath
    });
    addCheck(`document-${label}-preview-size-matches-file`, Boolean(previewStat) && Number(document.previewSize || 0) === previewStat.size, {
      metadataSize: document.previewSize || 0,
      fileSize: previewStat?.size || 0
    });
    if (isPdfPreview(document)) {
      const previewPrefix = previewStat ? readAsciiPrefix(previewPath) : "";
      addCheck(`document-${label}-preview-mime-is-pdf`, document.previewMimeType === "application/pdf", {
        previewMimeType: document.previewMimeType || ""
      });
      addCheck(`document-${label}-preview-pdf-starts-with-pdf-signature`, Boolean(previewStat) && previewPrefix.startsWith(pdfSignature), {
        previewFileName,
        prefix: previewPrefix
      });
    }
  }
}

let mysqlEvidence = null;
if (!skipMysql) {
  if (!hasMysqlConfig()) {
    addCheck("mysql-env-present", false, {
      missing: ["MHCHUB_MYSQL_HOST", "MHCHUB_MYSQL_DATABASE", "MHCHUB_MYSQL_USER"].filter((name) => !process.env[name])
    });
  } else {
    const pool = connectMysql();
    try {
      const [rows] = await pool.query(`SELECT ${mysqlDocumentColumns.join(", ")} FROM documents`);
      const mysqlById = new Map(rows.map((row) => [row.id, row]));
      const missingInMysql = documents.map((item) => item.id).filter((id) => !mysqlById.has(id));
      const uploadedFieldMismatches = uploadedDocuments
        .map((document) => {
          const row = mysqlById.get(document.id);
          if (!row) return null;
          const pass =
            String(row.file_name || "") === String(document.fileName || "") &&
            String(row.url || "") === String(document.url || "") &&
            String(row.storage_path || "") === String(document.storagePath || "") &&
            Number(row.size || 0) === Number(document.size || 0);
          return pass ? null : { id: document.id, json: document.size, mysql: row.size };
        })
        .filter(Boolean);
      const metadataMismatches = documents.flatMap((document) => {
        const row = mysqlById.get(document.id);
        return row ? compareDocumentToMysqlRow(document, row) : [];
      });

      mysqlEvidence = {
        count: rows.length,
        missingInMysql,
        checkedColumns: mysqlDocumentColumns.length,
        checkedFields: documents.length * (mysqlStringFieldMap.length + mysqlNumberFieldMap.length + mysqlDateFieldMap.length),
        runtimeUploadedCount: rows.filter((row) => row.file_name || row.url).length,
        mismatches: uploadedFieldMismatches,
        metadataMismatches
      };
      const placeholderJsonWithMysqlRuntime = placeholderOnlyDataset && rows.length >= documents.length;
      addCheck("mysql-documents-match-json-count", rows.length === documents.length || placeholderJsonWithMysqlRuntime, {
        acceptedRuntimeSource: placeholderJsonWithMysqlRuntime ? "mysql" : "json",
        jsonCount: documents.length,
        mysqlCount: rows.length,
        placeholderOnlyDataset
      });
      addCheck("mysql-documents-contain-json-ids", missingInMysql.length === 0, { missingInMysql });
      addCheck("mysql-uploaded-document-fields-match-json", uploadedFieldMismatches.length === 0, { mismatches: uploadedFieldMismatches });
      addCheck("mysql-document-metadata-fields-match-json", metadataMismatches.length === 0, {
        checkedColumns: mysqlDocumentColumns.length,
        checkedFields: mysqlEvidence.checkedFields,
        mismatches: metadataMismatches.slice(0, 20)
      });
    } finally {
      await pool.end();
    }
  }
}

let apiEvidence = null;
if (!skipApi) {
  const documentsUrl = new URL("/api/documents?pageSize=100", baseUrl).toString();
  const response = await fetch(documentsUrl);
  const body = response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text();
  const apiItems = Array.isArray(body?.items) ? body.items : [];
  const apiIds = new Set(apiItems.map((item) => item.id));
  const apiById = new Map(apiItems.map((item) => [item.id, item]));
  const missingInApi = documents.map((item) => item.id).filter((id) => !apiIds.has(id));
  const apiMetadataMismatches = documents.flatMap((document) => {
    const item = apiById.get(document.id);
    return item ? compareDocumentToApiItem(document, item) : [];
  });

  apiEvidence = {
    documentsStatus: response.status,
    totalItems: body?.pagination?.totalItems ?? null,
    returnedItems: apiItems.length,
    runtimeUploadedCount: apiItems.filter((item) => item.fileName || item.url).length,
    missingInApi,
    checkedFields: documents.length * (apiStringFields.length + apiNumberFields.length + apiDateFields.length),
    metadataMismatches: apiMetadataMismatches,
    fileHeads: [],
    fileRanges: [],
    previewFileHeads: [],
    previewFileRanges: [],
    excelHtmlPreviewCsp: null
  };

  addCheck("api-documents-reachable", response.ok, { status: response.status });
  const expectedRuntimeDocumentCount = mysqlEvidence?.count ?? documents.length;
  const expectedRuntimeDocumentSource = mysqlEvidence ? "mysql" : "json";
  const apiCountMatchesJson = Number(body?.pagination?.totalItems) === documents.length;
  const apiCountMatchesRuntimeSource = Number(body?.pagination?.totalItems) === expectedRuntimeDocumentCount;
  addCheck("api-documents-count-matches-json", apiCountMatchesJson || (placeholderOnlyDataset && apiCountMatchesRuntimeSource), {
    acceptedRuntimeSource: placeholderOnlyDataset && apiCountMatchesRuntimeSource ? expectedRuntimeDocumentSource : "json",
    apiTotalItems: body?.pagination?.totalItems ?? null,
    expectedRuntimeDocumentCount,
    expectedRuntimeDocumentSource,
    jsonCount: documents.length,
    placeholderOnlyDataset
  });
  addCheck("api-documents-contain-json-ids", missingInApi.length === 0, { missingInApi });
  addCheck("api-documents-metadata-fields-match-json", apiMetadataMismatches.length === 0, {
    checkedFields: apiEvidence.checkedFields,
    mismatches: apiMetadataMismatches.slice(0, 20)
  });

  for (const document of uploadedDocuments) {
    const staticHead = await fetchHead(new URL(document.url, baseUrl).toString());
    const fileHead = await fetchHead(
      new URL(`/api/documents/${encodeURIComponent(document.id)}/file?disposition=attachment`, baseUrl).toString()
    );
    apiEvidence.fileHeads.push({
      id: document.id,
      staticStatus: staticHead.status,
      fileStatus: fileHead.status,
      staticLength: staticHead.length,
      fileLength: fileHead.length,
      staticMethod: staticHead.method,
      fileMethod: fileHead.method,
      staticError: staticHead.error,
      fileError: fileHead.error,
      fileDisposition: fileHead.disposition
    });
    addCheck(`api-document-${document.id}-static-url-head-ok`, staticHead.ok, {
      status: staticHead.status,
      url: document.url
    });
    addCheck(`api-document-${document.id}-file-route-head-ok`, fileHead.ok, {
      status: fileHead.status,
      route: `/api/documents/${document.id}/file`,
      method: fileHead.method,
      error: fileHead.error
    });
    addCheck(`api-document-${document.id}-head-length-matches-size`, staticHead.length === Number(document.size) && fileHead.length === Number(document.size), {
      expectedSize: Number(document.size),
      staticLength: staticHead.length,
      fileLength: fileHead.length
    });
    addCheck(
      `api-document-${document.id}-file-route-content-disposition-is-download-safe`,
      /filename="[^"]+"/i.test(fileHead.disposition) && /filename\*=UTF-8''/i.test(fileHead.disposition),
      {
        disposition: fileHead.disposition
      }
    );
    const decodedFilename = decodeDispositionFilenameStar(fileHead.disposition);
    const fallbackFilename = dispositionFallbackFilename(fileHead.disposition);
    addCheck(`api-document-${document.id}-file-route-filename-star-decodes-original-name`, decodedFilename === document.originalName, {
      expectedOriginalName: document.originalName || "",
      decodedFilename,
      disposition: fileHead.disposition
    });
    addCheck(`api-document-${document.id}-file-route-fallback-filename-is-ascii-safe`, /^[\x20-\x7e]+$/.test(fallbackFilename), {
      fallbackFilename,
      disposition: fileHead.disposition
    });

    if (isPdfDocument(document)) {
      const fileRange = await fetchRangePrefix(
        new URL(`/api/documents/${encodeURIComponent(document.id)}/file?disposition=inline`, baseUrl).toString()
      );
      apiEvidence.fileRanges.push({
        contentRange: fileRange.contentRange,
        fileDisposition: fileRange.disposition,
        fileError: fileRange.error,
        filePrefix: fileRange.prefix,
        fileStatus: fileRange.status,
        fileType: fileRange.contentType,
        id: document.id
      });
      addCheck(`api-document-${document.id}-file-route-inline-range-ok`, fileRange.ok, {
        route: `/api/documents/${document.id}/file?disposition=inline`,
        status: fileRange.status,
        error: fileRange.error
      });
      addCheck(`api-document-${document.id}-file-route-inline-range-content-type-is-pdf`, /^application\/pdf\b/i.test(fileRange.contentType), {
        contentType: fileRange.contentType
      });
      addCheck(`api-document-${document.id}-file-route-inline-range-starts-with-pdf-signature`, fileRange.prefix.startsWith(pdfSignature), {
        bytesRead: fileRange.bytesRead,
        contentRange: fileRange.contentRange,
        prefix: fileRange.prefix
      });
      addCheck(`api-document-${document.id}-file-route-inline-range-disposition-is-inline`, /^inline\b/i.test(fileRange.disposition), {
        disposition: fileRange.disposition
      });
    }

    if (document.previewStatus === "ready" && isPdfPreview(document)) {
      const previewFileHead = await fetchHead(
        new URL(`/api/documents/${encodeURIComponent(document.id)}/preview-file`, baseUrl).toString()
      );
      const previewFileRange = await fetchRangePrefix(
        new URL(`/api/documents/${encodeURIComponent(document.id)}/preview-file`, baseUrl).toString()
      );
      apiEvidence.previewFileHeads.push({
        id: document.id,
        previewDisposition: previewFileHead.disposition,
        previewError: previewFileHead.error,
        previewLength: previewFileHead.length,
        previewMethod: previewFileHead.method,
        previewStatus: previewFileHead.status,
        previewType: previewFileHead.contentType
      });
      apiEvidence.previewFileRanges.push({
        contentRange: previewFileRange.contentRange,
        id: document.id,
        previewDisposition: previewFileRange.disposition,
        previewError: previewFileRange.error,
        previewPrefix: previewFileRange.prefix,
        previewStatus: previewFileRange.status,
        previewType: previewFileRange.contentType
      });
      addCheck(`api-document-${document.id}-preview-file-route-head-ok`, previewFileHead.ok, {
        method: previewFileHead.method,
        route: `/api/documents/${document.id}/preview-file`,
        status: previewFileHead.status,
        error: previewFileHead.error
      });
      addCheck(`api-document-${document.id}-preview-file-route-content-type-is-pdf`, /^application\/pdf\b/i.test(previewFileHead.contentType), {
        contentType: previewFileHead.contentType
      });
      addCheck(`api-document-${document.id}-preview-file-route-length-matches-preview-size`, previewFileHead.length === Number(document.previewSize || 0), {
        expectedPreviewSize: Number(document.previewSize || 0),
        previewLength: previewFileHead.length
      });
      addCheck(
        `api-document-${document.id}-preview-file-route-content-disposition-is-inline-safe`,
        /^inline\b/i.test(previewFileHead.disposition)
          && /filename="[^"]+"/i.test(previewFileHead.disposition)
          && /filename\*=UTF-8''/i.test(previewFileHead.disposition)
          && !/[\r\n]/.test(previewFileHead.disposition),
        {
          disposition: previewFileHead.disposition
        }
      );
      addCheck(`api-document-${document.id}-preview-file-route-range-ok`, previewFileRange.ok, {
        route: `/api/documents/${document.id}/preview-file`,
        status: previewFileRange.status,
        error: previewFileRange.error
      });
      addCheck(`api-document-${document.id}-preview-file-route-range-content-type-is-pdf`, /^application\/pdf\b/i.test(previewFileRange.contentType), {
        contentType: previewFileRange.contentType
      });
      addCheck(`api-document-${document.id}-preview-file-route-range-starts-with-pdf-signature`, previewFileRange.prefix.startsWith(pdfSignature), {
        bytesRead: previewFileRange.bytesRead,
        contentRange: previewFileRange.contentRange,
        prefix: previewFileRange.prefix
      });
    }
  }

  const htmlPreviewDocument = htmlPreviewProbeDocument;
  if (htmlPreviewDocument) {
    const previewHead = await fetchHead(new URL(`/api/documents/${encodeURIComponent(htmlPreviewDocument.id)}/excel-html-preview/`, baseUrl).toString());
    apiEvidence.excelHtmlPreviewCsp = {
      contentType: previewHead.contentType,
      csp: previewHead.csp,
      documentId: htmlPreviewDocument.id,
      error: previewHead.error,
      method: previewHead.method,
      status: previewHead.status
    };
    addCheck("api-excel-html-preview-route-head-ok", previewHead.ok && /^text\/html/i.test(previewHead.contentType), {
      contentType: previewHead.contentType,
      documentId: htmlPreviewDocument.id,
      method: previewHead.method,
      status: previewHead.status
    });
    addCheck(
      "api-excel-html-preview-response-csp-locks-active-content",
      cspHasAll(previewHead.csp, [
        "default-src 'none'",
        "script-src 'none'",
        "connect-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-src 'none'",
        "worker-src 'none'",
        "media-src 'none'",
        `style-src-elem '${unsafeInlineToken}'`,
        `style-src-attr '${unsafeInlineToken}'`
      ]),
      {
        csp: previewHead.csp,
        documentId: htmlPreviewDocument.id
      }
    );
  } else {
    addCheck("api-excel-html-preview-document-present", placeholderOnlyDataset, {
      placeholderOnlyDataset,
      reason: "No spreadsheet document metadata was available for HTML preview CSP probing."
    });
  }
}

const mysqlRuntimeCoversPlaceholderDataset =
  placeholderOnlyDataset &&
  mysqlEvidence &&
  mysqlEvidence.missingInMysql.length === 0 &&
  mysqlEvidence.metadataMismatches.length === 0 &&
  (mysqlEvidence.count > documents.length || mysqlEvidence.runtimeUploadedCount > 0);
const apiRuntimeCoversPlaceholderDataset =
  placeholderOnlyDataset &&
  apiEvidence &&
  apiEvidence.documentsStatus >= 200 &&
  apiEvidence.documentsStatus < 300 &&
  apiEvidence.missingInApi.length === 0 &&
  apiEvidence.metadataMismatches.length === 0 &&
  (Number(apiEvidence.totalItems || 0) > documents.length || apiEvidence.runtimeUploadedCount > 0);

if (placeholderOnlyDataset && !mysqlRuntimeCoversPlaceholderDataset && !apiRuntimeCoversPlaceholderDataset) {
  warnings.push({
    name: "document-fixtures-placeholder-only",
    message: "Document storage contains only seed placeholders, so upload/manual-import/preview file presence checks are treated as not applicable.",
    evidence: {
      apiRuntimeCoversPlaceholderDataset: Boolean(apiRuntimeCoversPlaceholderDataset),
      mysqlRuntimeCoversPlaceholderDataset: Boolean(mysqlRuntimeCoversPlaceholderDataset),
      placeholders: placeholders.length,
      total: documents.length
    }
  });
}

const failedChecks = checks.filter((check) => !check.pass);
const report = {
  generatedAtUtc: new Date().toISOString(),
  docsFile,
  counts: {
    total: documents.length,
    uploaded: uploadedDocuments.length,
    manualImported: manualImportDocuments.length,
    placeholders: placeholders.length
  },
  uploadPolicy: {
    allowedExtensions: uploadPolicyExtensions,
    forbiddenAllowedExtensions: uploadPolicyForbiddenExtensions,
    maxUploadMb,
    missingRequiredExtensions: uploadPolicyMissingExtensions,
    uploadedExtensions,
    uploadedExtensionsMissingFromPolicy
  },
  sourceFiles: {
    manualImports: manualSourceEvidence
  },
  mysql: mysqlEvidence,
  api: apiEvidence,
  warnings,
  summary: {
    total: checks.length,
    passed: checks.length - failedChecks.length,
    failed: failedChecks.length
  },
  failedChecks,
  checks
};

const writeReportArtifact = (payload) => {
  fs.mkdirSync(reportDir, { recursive: true });
  const reportWithArtifacts = {
    ...payload,
    artifacts: {
      json: reportJsonPath
    }
  };
  fs.writeFileSync(reportJsonPath, `${JSON.stringify(reportWithArtifacts, null, 2)}\n`, "utf8");
  return reportWithArtifacts;
};

const reportWithArtifacts = writeReportArtifact(report);
const failedFileHeads = (apiEvidence?.fileHeads || []).filter((item) => item.staticStatus < 200 || item.staticStatus >= 300 || item.fileStatus < 200 || item.fileStatus >= 300);
const failedFileRanges = (apiEvidence?.fileRanges || []).filter((item) => item.fileStatus < 200 || item.fileStatus >= 300);
const failedPreviewFileHeads = (apiEvidence?.previewFileHeads || []).filter((item) => item.previewStatus < 200 || item.previewStatus >= 300);
const failedPreviewFileRanges = (apiEvidence?.previewFileRanges || []).filter((item) => item.previewStatus < 200 || item.previewStatus >= 300);
const consoleReport = verboseConsole
  ? reportWithArtifacts
  : {
      generatedAtUtc: reportWithArtifacts.generatedAtUtc,
      docsFile: reportWithArtifacts.docsFile,
      counts: reportWithArtifacts.counts,
      uploadPolicy: {
        allowedExtensionCount: uploadPolicyExtensions.length,
        forbiddenAllowedExtensionCount: uploadPolicyForbiddenExtensions.length,
        maxUploadMb,
        missingRequiredExtensionCount: uploadPolicyMissingExtensions.length,
        uploadedExtensionsMissingFromPolicy: uploadedExtensionsMissingFromPolicy.length
      },
      sourceFiles: {
        manualImportCount: manualSourceEvidence.length,
        hashMatchCount: manualSourceEvidence.filter((item) => item.sha256Matches).length,
        failedHashMatches: manualSourceEvidence
          .filter((item) => !item.sha256Matches || !item.sizeMatches)
          .map((item) => ({
            id: item.id,
            sizeMatches: item.sizeMatches,
            sha256Matches: item.sha256Matches
          }))
      },
      mysql: mysqlEvidence
        ? {
            count: mysqlEvidence.count,
            checkedColumns: mysqlEvidence.checkedColumns,
            checkedFields: mysqlEvidence.checkedFields,
            missingInMysql: mysqlEvidence.missingInMysql.length,
            mismatches: mysqlEvidence.mismatches.length,
            metadataMismatches: mysqlEvidence.metadataMismatches.length
          }
        : mysqlEvidence,
      api: apiEvidence
        ? {
            documentsStatus: apiEvidence.documentsStatus,
            totalItems: apiEvidence.totalItems,
            returnedItems: apiEvidence.returnedItems,
            missingInApi: apiEvidence.missingInApi.length,
            checkedFields: apiEvidence.checkedFields,
            metadataMismatches: apiEvidence.metadataMismatches.length,
            excelHtmlPreviewCsp: apiEvidence.excelHtmlPreviewCsp
              ? {
                  documentId: apiEvidence.excelHtmlPreviewCsp.documentId,
                  status: apiEvidence.excelHtmlPreviewCsp.status,
                  contentType: apiEvidence.excelHtmlPreviewCsp.contentType,
                  hasCsp: Boolean(apiEvidence.excelHtmlPreviewCsp.csp)
                }
              : null,
            fileHeadCount: apiEvidence.fileHeads.length,
            failedFileHeads,
            fileRangeCount: apiEvidence.fileRanges.length,
            failedFileRanges,
            previewFileHeadCount: apiEvidence.previewFileHeads.length,
            failedPreviewFileHeads,
            previewFileRangeCount: apiEvidence.previewFileRanges.length,
            failedPreviewFileRanges
          }
        : apiEvidence,
      summary: reportWithArtifacts.summary,
      warningCount: reportWithArtifacts.warnings.length,
      warnings: reportWithArtifacts.warnings,
      failedChecks: reportWithArtifacts.failedChecks,
      artifacts: reportWithArtifacts.artifacts
    };

console.log(JSON.stringify(consoleReport, null, 2));

if (failedChecks.length) {
  process.exit(1);
}
