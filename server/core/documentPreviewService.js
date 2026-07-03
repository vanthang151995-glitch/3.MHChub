import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { generateXlsxHtmlPreview } from "./xlsxSheetjsPreview.js";

const OFFICE_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".odt",
  ".ods",
  ".odp",
  ".rtf",
  ".txt",
  ".csv"
]);

const PDF_EXTENSIONS = new Set([".pdf"]);
const SPREADSHEET_EXTENSIONS = new Set([".xls", ".xlsx", ".ods", ".csv"]);

const PREVIEWABLE_EXTENSIONS = new Set([...PDF_EXTENSIONS, ...OFFICE_EXTENSIONS]);

const commonWindowsCandidates = [
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files\\LibreOffice 7\\program\\soffice.exe",
  "C:\\Program Files\\LibreOffice 24\\program\\soffice.exe",
  "C:\\Program Files\\LibreOffice 25\\program\\soffice.exe"
];

const commonUnixCandidates = ["/usr/bin/libreoffice", "/usr/bin/soffice", "/snap/bin/libreoffice"];

const safePreviewName = (value = "") =>
  String(value || "document")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "document";

const commandWorks = (command) => {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 8000
  });
  return !result.error && result.status === 0;
};

export const findLibreOfficeExecutable = () => {
  const configured = [process.env.LIBREOFFICE_PATH, process.env.SOFFICE_PATH].filter(Boolean);
  const pathCandidates = process.platform === "win32" ? ["soffice.exe", "soffice", "libreoffice"] : ["libreoffice", "soffice"];
  const candidates = [
    ...configured,
    ...(process.platform === "win32" ? commonWindowsCandidates : commonUnixCandidates),
    ...pathCandidates
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) return candidate;
    if (!path.isAbsolute(candidate) && commandWorks(candidate)) return candidate;
  }
  return "";
};

const copyPdfPreview = ({ sourcePath, targetPath }) => {
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
};

const runLibreOfficeConvert = ({ executable, sourcePath, outputDir, profileDir, timeoutMs, convertTo = "pdf" }) =>
  new Promise((resolve, reject) => {
    const args = [
      "--headless",
      "--nologo",
      "--nodefault",
      "--nofirststartwizard",
      "--nolockcheck",
      `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
      "--convert-to",
      convertTo,
      "--outdir",
      outputDir,
      sourcePath
    ];
    const child = spawn(executable, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("LibreOffice conversion timed out"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `LibreOffice exited with code ${code}`));
    });
  });

const findGeneratedFile = (directory, extension) =>
  fs
    .readdirSync(directory)
    .filter((fileName) => fileName.toLowerCase().endsWith(extension))
    .map((fileName) => path.join(directory, fileName))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || "";

const findGeneratedPdf = (directory) => findGeneratedFile(directory, ".pdf");
const findGeneratedHtml = (directory) => findGeneratedFile(directory, ".html");

const htmlAttrValuePattern = /\s+([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+)/g;
const dangerousPairedHtmlTags = ["script", "iframe", "object", "embed", "applet"];
const dangerousStandaloneHtmlTags = ["input", "button", "select", "textarea"];

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

const isDangerousHtmlUrl = (attributeName = "", value = "") => {
  const name = attributeName.toLowerCase();
  if (name === "srcdoc" || name === "action" || name === "formaction") return true;
  const normalized = normalizeUrlProtocol(value);
  if (normalized.startsWith("javascript:") || normalized.startsWith("vbscript:")) return true;
  if (name === "href" || name === "xlink:href") return normalized.startsWith("data:");
  if (name === "srcset") return normalized.includes("javascript:") || normalized.includes("vbscript:") || normalized.includes("data:");
  if (name === "src") {
    return normalized.startsWith("data:") && !normalized.startsWith("data:image/");
  }
  return false;
};

export const sanitizeSpreadsheetHtml = (html = "") => {
  let next = String(html || "");

  for (const tag of dangerousPairedHtmlTags) {
    next = next.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    next = next.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
  }

  next = next
    .replace(/<form\b[^>]*>/gi, "")
    .replace(/<\/form\s*>/gi, "")
    .replace(/<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(?:"refresh"|'refresh'|refresh))[^>]*>/gi, "")
    .replace(/<base\b[^>]*>/gi, "");

  for (const tag of dangerousStandaloneHtmlTags) {
    next = next.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    next = next.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
  }

  return next.replace(htmlAttrValuePattern, (match, rawName, _rawValue, doubleQuoted, singleQuoted) => {
    const name = String(rawName || "");
    const lowerName = name.toLowerCase();
    const attrValue = doubleQuoted ?? singleQuoted ?? String(_rawValue || "").replace(/^['"]|['"]$/g, "");
    if (/^on[a-z]/i.test(name) || isDangerousHtmlUrl(lowerName, attrValue)) {
      return "";
    }
    return match;
  });
};

export const sanitizeSpreadsheetHtmlDirectory = (directory) => {
  if (!fs.existsSync(directory)) return { files: 0, changed: 0 };
  let files = 0;
  let changed = 0;
  const walk = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const filePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(filePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".html")) continue;
      files += 1;
      const before = fs.readFileSync(filePath, "utf8");
      const after = sanitizeSpreadsheetHtml(before);
      if (after !== before) {
        fs.writeFileSync(filePath, after, "utf8");
        changed += 1;
      }
    }
  };
  walk(directory);
  return { files, changed };
};

const convertOfficePreview = async ({ executable, sourcePath, targetPath, previewDir, timeoutMs, documentId }) => {
  const workDir = path.join(previewDir, `.work-${safePreviewName(documentId)}-${Date.now()}`);
  const profileDir = path.join(workDir, "profile");
  const outputDir = path.join(workDir, "out");
  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    await runLibreOfficeConvert({ executable, sourcePath, outputDir, profileDir, timeoutMs });
    const generated = findGeneratedPdf(outputDir);
    if (!generated) throw new Error("LibreOffice did not create a PDF preview");
    fs.copyFileSync(generated, targetPath);
    return targetPath;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
};

const convertSpreadsheetHtmlPreview = async ({ executable, sourcePath, targetDir, previewDir, timeoutMs, documentId }) => {
  const workDir = path.join(previewDir, `.work-html-${safePreviewName(documentId)}-${Date.now()}`);
  const profileDir = path.join(workDir, "profile");
  const outputDir = path.join(workDir, "out");
  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    await runLibreOfficeConvert({ executable, sourcePath, outputDir, profileDir, timeoutMs, convertTo: "html" });
    const generated = findGeneratedHtml(outputDir);
    if (!generated) throw new Error("LibreOffice did not create an HTML preview");
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });
    for (const fileName of fs.readdirSync(outputDir)) {
      fs.copyFileSync(path.join(outputDir, fileName), path.join(targetDir, fileName));
    }
    sanitizeSpreadsheetHtmlDirectory(targetDir);
    return findGeneratedHtml(targetDir) || generated;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
};

export const createDocumentPreviewService = ({ previewDir, timeoutMs = 90000 }) => {
  fs.mkdirSync(previewDir, { recursive: true });
  try { fs.chmodSync(previewDir, 0o755); } catch { /* ignore */ }
  const htmlPreviewRoot = path.join(previewDir, "html");
  fs.mkdirSync(htmlPreviewRoot, { recursive: true });
  try { fs.chmodSync(htmlPreviewRoot, 0o755); } catch { /* ignore */ }
  let cachedExecutable;

  const executable = () => {
    if (cachedExecutable === undefined) cachedExecutable = findLibreOfficeExecutable();
    return cachedExecutable;
  };

  const previewFileNameFor = (document) => `${safePreviewName(document?.id || document?.fileName || "document")}.pdf`;
  const htmlPreviewDirFor = (document) => path.join(previewDir, "html", safePreviewName(document?.id || document?.fileName || "document"));

  const createPreview = async ({ document, sourcePath, force = false }) => {
    const ext = path.extname(sourcePath || document?.fileName || document?.originalName || "").toLowerCase();
    const now = new Date().toISOString();
    if (!PREVIEWABLE_EXTENSIONS.has(ext)) {
      return {
        previewStatus: "unsupported",
        previewError: `Preview is not supported for ${ext || "this file type"}`,
        previewGeneratedAt: now
      };
    }

    const targetFileName = previewFileNameFor(document);
    const targetPath = path.join(previewDir, targetFileName);
    if (!force && fs.existsSync(targetPath) && fs.statSync(targetPath).mtimeMs >= fs.statSync(sourcePath).mtimeMs) {
      return {
        previewFileName: targetFileName,
        previewMimeType: "application/pdf",
        previewUrl: `/api/documents/${encodeURIComponent(document.id)}/preview-file`,
        previewStatus: "ready",
        previewError: "",
        previewGeneratedAt: now,
        previewSize: fs.statSync(targetPath).size
      };
    }

    try {
      if (PDF_EXTENSIONS.has(ext)) {
        copyPdfPreview({ sourcePath, targetPath });
      } else {
        const soffice = executable();
        if (!soffice) {
          return {
            previewStatus: "missing_converter",
            previewError: "LibreOffice is not installed or LIBREOFFICE_PATH is not configured",
            previewGeneratedAt: now
          };
        }
        await convertOfficePreview({
          executable: soffice,
          sourcePath,
          targetPath,
          previewDir,
          timeoutMs,
          documentId: document.id
        });
      }

      return {
        previewFileName: targetFileName,
        previewMimeType: "application/pdf",
        previewUrl: `/api/documents/${encodeURIComponent(document.id)}/preview-file`,
        previewStatus: "ready",
        previewError: "",
        previewGeneratedAt: now,
        previewSize: fs.statSync(targetPath).size
      };
    } catch (error) {
      fs.rmSync(targetPath, { force: true });
      return {
        previewStatus: "error",
        previewError: error.message,
        previewGeneratedAt: now
      };
    }
  };

  const previewPathFor = (document) => {
    const fileName = document?.previewFileName || previewFileNameFor(document);
    const resolved = path.resolve(previewDir, fileName);
    const root = path.resolve(previewDir);
    if (!resolved.startsWith(`${root}${path.sep}`)) return "";
    return resolved;
  };

  const createSpreadsheetHtmlPreview = async ({ document, sourcePath, force = false }) => {
    const ext = path.extname(sourcePath || document?.fileName || document?.originalName || "").toLowerCase();
    const now = new Date().toISOString();
    if (!SPREADSHEET_EXTENSIONS.has(ext)) {
      return {
        htmlStatus: "unsupported",
        htmlError: `Excel HTML preview is not supported for ${ext || "this file type"}`,
        htmlGeneratedAt: now
      };
    }

    const targetDir = htmlPreviewDirFor(document);
    const existingHtml = fs.existsSync(targetDir) ? findGeneratedHtml(targetDir) : "";
    if (!force && existingHtml && fs.statSync(existingHtml).mtimeMs >= fs.statSync(sourcePath).mtimeMs) {
      sanitizeSpreadsheetHtmlDirectory(targetDir);
      return {
        htmlStatus: "ready",
        htmlError: "",
        htmlGeneratedAt: now,
        htmlPath: existingHtml,
        htmlDir: targetDir
      };
    }

    const soffice = executable();
    if (!soffice) {
      if (ext === ".xlsx") {
        try {
          const htmlPath = generateXlsxHtmlPreview({ filePath: sourcePath, targetDir });
          return {
            htmlStatus: "ready",
            htmlError: "",
            htmlGeneratedAt: now,
            htmlPath,
            htmlDir: targetDir,
            htmlSource: "sheetjs"
          };
        } catch (sheetjsError) {
          return {
            htmlStatus: "error",
            htmlError: sheetjsError.message,
            htmlGeneratedAt: now
          };
        }
      }
      return {
        htmlStatus: "missing_converter",
        htmlError: "LibreOffice is not installed or LIBREOFFICE_PATH is not configured",
        htmlGeneratedAt: now
      };
    }

    try {
      await convertSpreadsheetHtmlPreview({
        executable: soffice,
        sourcePath,
        targetDir,
        previewDir,
        timeoutMs,
        documentId: document.id
      });
      sanitizeSpreadsheetHtmlDirectory(targetDir);
      const htmlPath = findGeneratedHtml(targetDir);
      return {
        htmlStatus: "ready",
        htmlError: "",
        htmlGeneratedAt: now,
        htmlPath,
        htmlDir: targetDir
      };
    } catch (error) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      return {
        htmlStatus: "error",
        htmlError: error.message,
        htmlGeneratedAt: now
      };
    }
  };

  return {
    getConverterStatus() {
      const soffice = executable();
      return {
        available: Boolean(soffice),
        executable: soffice || "",
        previewDir,
        supportedExtensions: [...PREVIEWABLE_EXTENSIONS].sort()
      };
    },
    createPreview,
    createSpreadsheetHtmlPreview,
    previewPathFor,
    htmlPreviewDirFor,
    isPreviewable(document) {
      const ext = path.extname(document?.fileName || document?.originalName || "").toLowerCase();
      return PREVIEWABLE_EXTENSIONS.has(ext);
    }
  };
};
