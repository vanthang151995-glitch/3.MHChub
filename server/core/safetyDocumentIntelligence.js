import crypto from "crypto";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import zlib from "zlib";

const PDF_EXTENSIONS = new Set([".pdf"]);
const WORD_EXTENSIONS = new Set([".docx"]);
const LEGACY_WORD_EXTENSIONS = new Set([".doc"]);
const EXCEL_EXTENSIONS = new Set([".xlsx", ".xlsm"]);
const LEGACY_EXCEL_EXTENSIONS = new Set([".xls"]);

const MIME_BY_EXT = {
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

const nowIso = () => new Date().toISOString();

const stripExtension = (name = "") => String(name).replace(/\.[^.]+$/, "");

const toPosix = (value = "") => String(value).replace(/\\/g, "/");

const normalizeKey = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();

const hasAny = (value, needles = []) => needles.some((needle) => value.includes(needle));

const normalizeText = (value = "") =>
  String(value)
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const xmlDecode = (value = "") =>
  String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const sha256File = async (filePath) => {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
};

const hashId = (prefix, value) => `${prefix}-${crypto.createHash("sha1").update(value).digest("hex").slice(0, 16)}`;

const safeCode = (value, fallback) => {
  const raw = String(value || "").trim();
  const match = raw.match(/EHS[-\s]*QT[-\s]*\d+/i)?.[0];
  if (match) return `EHS-QT-${match.match(/\d+/)?.[0] || ""}`;
  return fallback;
};

const classifySafetyDocumentNormalized = ({ filePath, rootDir }) => {
  const relativePath = toPosix(path.relative(rootDir, filePath));
  const key = normalizeKey(relativePath);
  const originalName = path.basename(filePath);
  const title = stripExtension(originalName).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const fallbackCode = `DOC-${crypto.createHash("sha1").update(relativePath).digest("hex").slice(0, 8).toUpperCase()}`;

  const result = {
    category: "safety-general",
    departmentId: "company",
    departmentName: "Toan cong ty",
    documentCode: safeCode(originalName, fallbackCode),
    documentType: "record",
    ownerRole: "ehs",
    scopeLevel: "company",
    section6s: "",
    tags: ["ATVSLD", "6S"],
    title
  };

  const tag = (...items) => {
    result.tags.push(...items.filter(Boolean));
  };

  if (hasAny(key, ["cham diem 6s", "qt-11", "phieu cham diem 6s", "kiem tra an toan, 6s"])) {
    result.category = "sixs-scoring";
    result.documentType = "procedure";
    result.scopeLevel = "ehs";
    result.section6s = "S1,S2,S3,S4,S5,S6";
    tag("Cham diem 6S", "Audit 6S", key.includes("qt-11") ? "EHS-QT-11" : "");
  }
  if (hasAny(key, ["qt-12", "bieu kiem tra 6s hang ngay", "bieu kiem tra 6s"])) {
    result.category = "sixs-daily-checklist";
    result.documentType = "checklist";
    result.scopeLevel = "department";
    result.section6s = "S1,S2,S3,S4,S5,S6";
    tag("Checklist hang ngay", "EHS-QT-12");
  }
  if (hasAny(key, ["qt-14", "cai tien an toan"])) {
    result.category = "safety-improvement";
    result.documentType = "procedure";
    result.scopeLevel = "ehs";
    tag("CAPA", "Cai tien an toan", "EHS-QT-14");
  }
  if (key.includes("pccc")) {
    result.category = "pccc";
    result.documentType = hasAny(key, ["noi quy", "quy dinh"]) ? "standard" : "checklist";
    result.scopeLevel = "company";
    tag("PCCC", "An toan dien");
  }
  if (hasAny(key, ["vat_tu_y_te", "y te", "so cuu", "phac do"])) {
    result.category = "medical-first-aid";
    result.documentType = hasAny(key, ["quy dinh", "huong dan"]) ? "standard" : "checklist";
    result.scopeLevel = "company";
    tag("Y te", "So cuu", "Tui so cuu");
  }
  if (key.includes("kyt")) {
    result.category = "kyt";
    result.documentType = key.endsWith(".docx") ? "report" : "worksheet";
    result.scopeLevel = "department";
    result.departmentId = "RF";
    result.departmentName = "RF";
    tag("KYT", "Nhan dien nguy co");
  }
  if (hasAny(key, ["cuoc hop an toan", "安全衛生委員", "hoi dong an toan"])) {
    result.category = "safety-meeting";
    result.documentType = "meeting-minutes";
    result.scopeLevel = "company";
    tag("Hop an toan", "Uy ban an toan ve sinh");
  }
  if (hasAny(key, ["ds atv", "atv t3"])) {
    result.category = "safety-roster";
    result.documentType = "record";
    result.scopeLevel = "company";
    tag("Danh sach ATV", "An toan vien");
  }
  if (hasAny(key, ["tieu chuan 3s", "3s 18.11.2023"])) {
    result.category = "sixs-standard";
    result.documentType = "standard";
    result.scopeLevel = "company";
    result.section6s = "S1,S2,S3";
    tag("Tieu chuan 3S");
  }
  if (hasAny(key, ["tong quan atvsld", "tong quan"])) {
    result.category = "safety-overview";
    result.documentType = "overview";
    result.scopeLevel = "company";
    tag("Tong quan ATVSLD", "6S");
  }
  if (hasAny(key, ["tu kiem tra", "qt-06"])) {
    result.category = "self-inspection";
    result.documentType = hasAny(key, ["bieu", "mau bien ban"]) ? "form" : "procedure";
    result.scopeLevel = "department";
    tag("Tu kiem tra ATVSLD", "EHS-QT-06");
  }

  result.tags = Array.from(new Set(result.tags));
  return result;
};

const classifySafetyDocument = ({ filePath, rootDir }) => {
  return classifySafetyDocumentNormalized({ filePath, rootDir });

  const relativePath = toPosix(path.relative(rootDir, filePath));
  const lower = relativePath.toLowerCase();
  const originalName = path.basename(filePath);
  const title = stripExtension(originalName).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const fallbackCode = `DOC-${crypto.createHash("sha1").update(relativePath).digest("hex").slice(0, 8).toUpperCase()}`;

  let category = "safety-general";
  let documentType = "record";
  let scopeLevel = "company";
  let ownerRole = "ehs";
  let section6s = "";
  let departmentId = "company";
  let departmentName = "Toàn công ty";
  const tags = ["ATVSLD", "6S"];

  if (lower.includes("chấm điểm 6s") || lower.includes("cham diem 6s")) {
    category = "sixs-scoring";
    documentType = "procedure";
    scopeLevel = "ehs";
    section6s = "S1,S2,S3,S4,S5,S6";
    tags.push("Chấm điểm 6S", "Audit 6S");
  }
  if (lower.includes("qt-12") || lower.includes("biểu kiểm tra 6s") || lower.includes("bieu kiem tra 6s")) {
    category = "sixs-daily-checklist";
    documentType = "checklist";
    scopeLevel = "department";
    tags.push("Checklist hằng ngày", "EHS-QT-12");
  }
  if (lower.includes("qt-11")) {
    category = "sixs-scoring";
    documentType = "procedure";
    scopeLevel = "ehs";
    tags.push("EHS-QT-11", "Quy trình chấm điểm");
  }
  if (lower.includes("qt-14") || lower.includes("cải tiến") || lower.includes("cai tien")) {
    category = "safety-improvement";
    documentType = "procedure";
    scopeLevel = "ehs";
    tags.push("CAPA", "Cải tiến an toàn", "EHS-QT-14");
  }
  if (lower.includes("pccc")) {
    category = "pccc";
    documentType = lower.includes("nội quy") || lower.includes("noi quy") ? "standard" : "checklist";
    scopeLevel = "company";
    tags.push("PCCC", "Điện");
  }
  if (lower.includes("vat_tu_y_te") || lower.includes("y tế") || lower.includes("y te") || lower.includes("sơ cứu") || lower.includes("so cuu")) {
    category = "medical-first-aid";
    documentType = lower.includes("quy định") || lower.includes("quy dinh") ? "standard" : "checklist";
    scopeLevel = "company";
    tags.push("Y tế", "Sơ cứu", "Túi sơ cứu");
  }
  if (lower.includes("kyt")) {
    category = "kyt";
    documentType = lower.endsWith(".docx") ? "report" : "worksheet";
    scopeLevel = "department";
    departmentId = "RF";
    departmentName = "RF";
    tags.push("KYT", "Nhận diện nguy cơ");
  }
  if (lower.includes("cuoc hop") || lower.includes("安全衛生委員")) {
    category = "safety-meeting";
    documentType = "meeting-minutes";
    scopeLevel = "company";
    tags.push("Họp an toàn", "Ủy ban an toàn vệ sinh");
  }
  if (lower.includes("ds atv")) {
    category = "safety-roster";
    documentType = "record";
    scopeLevel = "company";
    tags.push("Danh sách ATV", "Đào tạo");
  }
  if (lower.includes("tiêu chuẩn 3s") || lower.includes("tieu chuan 3s")) {
    category = "sixs-standard";
    documentType = "standard";
    scopeLevel = "company";
    section6s = "S1,S2,S3";
    tags.push("Tiêu chuẩn 3S");
  }
  if (lower.includes("tong quan atvsld") || lower.includes("tổng quan")) {
    category = "safety-overview";
    documentType = "overview";
    scopeLevel = "company";
    tags.push("Tổng quan ATVSLĐ", "6S");
  }
  if (lower.includes("tự kiểm tra") || lower.includes("tu kiem tra") || lower.includes("qt-06")) {
    category = "self-inspection";
    documentType = lower.includes("biểu") || lower.includes("bieu") ? "form" : "procedure";
    scopeLevel = "department";
    tags.push("Tự kiểm tra ATVSLĐ", "EHS-QT-06");
  }

  return {
    category,
    departmentId,
    departmentName,
    documentCode: safeCode(originalName, fallbackCode),
    documentType,
    ownerRole,
    scopeLevel,
    section6s,
    tags: Array.from(new Set(tags)),
    title
  };
};

const readZipEntries = (buffer, predicate) => {
  const entries = [];
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 66000); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) return entries;

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(centralOffset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const fileNameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(centralOffset + 42);
    const name = buffer.slice(centralOffset + 46, centralOffset + 46 + fileNameLength).toString("utf8");
    centralOffset += 46 + fileNameLength + extraLength + commentLength;

    if (!predicate(name)) continue;
    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) continue;
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    let data = Buffer.alloc(0);
    if (method === 0) data = compressed;
    if (method === 8) data = zlib.inflateRawSync(compressed);
    if (data.length) entries.push({ name, text: data.toString("utf8") });
  }
  return entries;
};

const extractDocxText = (buffer) => {
  const entries = readZipEntries(buffer, (name) =>
    name === "word/document.xml" || name.startsWith("word/header") || name.startsWith("word/footer")
  );
  const parts = [];
  for (const entry of entries) {
    for (const match of entry.text.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)) {
      parts.push(xmlDecode(match[1]));
    }
    parts.push("\n");
  }
  return normalizeText(parts.join(" "));
};

const extractXlsxText = (buffer) => {
  const entries = readZipEntries(buffer, (name) => name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  const parts = [];
  for (const entry of entries) {
    for (const match of entry.text.matchAll(/<t[^>]*>([^<]*)<\/t>/g)) {
      parts.push(xmlDecode(match[1]));
    }
    for (const match of entry.text.matchAll(/<v>([^<]*)<\/v>/g)) {
      parts.push(xmlDecode(match[1]));
    }
    parts.push("\n");
  }
  return normalizeText(parts.join(" "));
};

const extractLegacyDocText = async (buffer) => {
  const imported = await import("word-extractor");
  const WordExtractor = imported.default || imported;
  const extractor = new WordExtractor();
  const document = await extractor.extract(buffer);
  const parts = [
    document.getHeaders?.(),
    document.getBody?.(),
    document.getFooters?.(),
    document.getTextboxes?.()
  ].filter(Boolean);
  return normalizeText(parts.join("\n"));
};

const PDF_TEXT_EXTRACTION_TIMEOUT_MS = 12000;

const withTimeout = (promise, timeoutMs, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const extractPdfText = async (buffer) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    disableWorker: true,
    wasmUrl: pathToFileURL(path.resolve(process.cwd(), "node_modules", "pdfjs-dist", "wasm") + path.sep).href,
    isEvalSupported: false,
    useSystemFonts: true
  });
  const pdf = await loadingTask.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = normalizeText(content.items.map((item) => item.str || "").join(" "));
    if (text) {
      pages.push({ sourcePage: String(pageNumber), text });
    }
  }
  return { pages, pageCount: pdf.numPages };
};

const renderSafetyPdfPageToPng = async ({ page, scale = 2 }) => {
  const { createCanvas } = await import("@napi-rs/canvas");
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toBuffer("image/png");
};

const ocrSafetyPdfDocument = async (filePath, options = {}) => {
  const {
    cachePath = path.resolve(process.cwd(), "tmp", "tesseract-cache"),
    languages = "vie+eng",
    maxPages = 0,
    pageScale = 2,
    progress
  } = options;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createWorker } = await import("tesseract.js");
  const buffer = await fs.promises.readFile(filePath);
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
    wasmUrl: pathToFileURL(path.resolve(process.cwd(), "node_modules", "pdfjs-dist", "wasm") + path.sep).href
  });
  const pdf = await loadingTask.promise;
  const pagesToRead = maxPages > 0 ? Math.min(pdf.numPages, Number(maxPages)) : pdf.numPages;
  await fs.promises.mkdir(cachePath, { recursive: true });
  const tempDir = path.resolve(
    process.cwd(),
    "tmp",
    "safety-ocr-pages",
    `${crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 12)}-${Date.now()}`
  );
  await fs.promises.mkdir(tempDir, { recursive: true });

  const chunks = [];
  const worker = await createWorker(languages, 1, {
    cachePath,
    logger: (message) => {
      if (typeof progress === "function") progress(message);
    }
  });

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      user_defined_dpi: "180"
    });

    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const png = await renderSafetyPdfPageToPng({ page, scale: pageScale });
      const imagePath = path.join(tempDir, `page-${String(pageNumber).padStart(3, "0")}.png`);
      await fs.promises.writeFile(imagePath, png);
      const result = await worker.recognize(imagePath);
      const text = normalizeText(result.data?.text || "");
      chunkText(text).forEach((chunk, index) => {
        chunks.push({ sourcePage: String(pageNumber), text: chunk, chunkOffset: index });
      });
      page.cleanup?.();
    }
  } finally {
    await worker.terminate().catch(() => {});
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }

  return {
    chunks,
    extractionMethod: `pdfjs_render_tesseract_${String(languages).replace(/[^a-z0-9+_-]/gi, "_")}`,
    ocrStatus: chunks.length ? "indexed" : "ocr_required",
    pageCount: pdf.numPages
  };
};

const chunkText = (text, size = 2800) => {
  const safe = normalizeText(text);
  if (!safe) return [];
  const chunks = [];
  for (let offset = 0; offset < safe.length; offset += size) {
    chunks.push(safe.slice(offset, offset + size).trim());
  }
  return chunks.filter(Boolean);
};

export const extractSafetyDocumentText = async (filePath, options = {}) => {
  const shouldOcr = Boolean(options.ocr);
  const maxOcrPages = Number(options.maxOcrPages || options.maxPages || 0);
  const ocrLanguages = options.ocrLanguages || options.languages || "vie+eng";
  const ext = path.extname(filePath).toLowerCase();
  const buffer = await fs.promises.readFile(filePath);

  if (PDF_EXTENSIONS.has(ext)) {
    let textLayerError = "";
    try {
      const pdf = await withTimeout(extractPdfText(buffer), PDF_TEXT_EXTRACTION_TIMEOUT_MS, "PDF text extraction");
      const chunks = [];
      for (const page of pdf.pages) {
        chunkText(page.text).forEach((text, index) => {
          chunks.push({ sourcePage: page.sourcePage, text, chunkOffset: index });
        });
      }
      const textResult = {
        chunks,
        extractionMethod: "pdfjs_text",
        ocrStatus: chunks.length ? "indexed" : "ocr_required",
        pageCount: pdf.pageCount
      };
      if (chunks.length || !shouldOcr) return textResult;
    } catch (error) {
      textLayerError = error.message;
      if (shouldOcr) {
        try {
          const ocrResult = await ocrSafetyPdfDocument(filePath, {
            languages: ocrLanguages,
            maxPages: maxOcrPages,
            pageScale: Number(options.pageScale || 2),
            cachePath: options.cachePath
          });
          return { ...ocrResult, error: textLayerError || ocrResult.error || "" };
        } catch (ocrError) {
          return {
            chunks: [],
            error: `${textLayerError}; OCR failed: ${ocrError.message}`,
            extractionMethod: "pdfjs_render_tesseract",
            ocrStatus: "ocr_required"
          };
        }
      }
      return {
        chunks: [],
        error: error.message,
        extractionMethod: "pdfjs_text",
        ocrStatus: "ocr_required"
      };
    }

    try {
      const ocrResult = await ocrSafetyPdfDocument(filePath, {
        languages: ocrLanguages,
        maxPages: maxOcrPages,
        pageScale: Number(options.pageScale || 2),
        cachePath: options.cachePath
      });
      return { ...ocrResult, error: textLayerError || ocrResult.error || "" };
    } catch (error) {
      return {
        chunks: [],
        error: error.message,
        extractionMethod: "pdfjs_render_tesseract",
        ocrStatus: "ocr_required"
      };
    }
  }

  if (WORD_EXTENSIONS.has(ext)) {
    const text = extractDocxText(buffer);
    return {
      chunks: chunkText(text).map((chunk) => ({ sourcePage: "docx", text: chunk })),
      extractionMethod: "docx_zip_text",
      ocrStatus: text ? "indexed" : "text_empty"
    };
  }

  if (EXCEL_EXTENSIONS.has(ext)) {
    const text = extractXlsxText(buffer);
    return {
      chunks: chunkText(text).map((chunk) => ({ sourcePage: "xlsx", text: chunk })),
      extractionMethod: "xlsx_zip_text",
      ocrStatus: text ? "indexed" : "text_empty"
    };
  }

  if (LEGACY_WORD_EXTENSIONS.has(ext)) {
    try {
      const text = await extractLegacyDocText(buffer);
      return {
        chunks: chunkText(text).map((chunk) => ({ sourcePage: "doc", text: chunk })),
        extractionMethod: "word_extractor_ole_text",
        ocrStatus: text ? "indexed" : "text_empty"
      };
    } catch (error) {
      return {
        chunks: [],
        error: error.message,
        extractionMethod: "word_extractor_ole_text",
        ocrStatus: "converter_required"
      };
    }
  }

  if (LEGACY_EXCEL_EXTENSIONS.has(ext)) {
    return {
      chunks: [],
      extractionMethod: "legacy_office",
      ocrStatus: "converter_required"
    };
  }

  return {
    chunks: [],
    extractionMethod: "unsupported",
    ocrStatus: "unsupported"
  };
};

export const scanSafetyDocumentFiles = async ({ rootDir, sourceRoot = "tai lieu" }) => {
  const absoluteSourceRoot = path.resolve(rootDir, sourceRoot);
  const sourceRootResolved = path.resolve(absoluteSourceRoot);
  const files = [];

  const walk = async (dir) => {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  };

  if (!fs.existsSync(sourceRootResolved)) {
    return { files: [], sourceRoot: sourceRootResolved };
  }
  await walk(sourceRootResolved);
  files.sort((a, b) => toPosix(a).localeCompare(toPosix(b), "vi"));
  return { files, sourceRoot: sourceRootResolved };
};

export const buildSafetyDocumentManifestEntry = async ({ filePath, rootDir, sourceRoot }) => {
  const stat = await fs.promises.stat(filePath);
  const relativePath = toPosix(path.relative(rootDir, filePath));
  const sourceRelativePath = toPosix(path.relative(sourceRoot, filePath));
  const ext = path.extname(filePath).toLowerCase();
  const classification = classifySafetyDocument({ filePath, rootDir: sourceRoot });
  const checksum = await sha256File(filePath);
  const id = hashId("safety-doc", relativePath);
  const now = nowIso();

  return {
    ...classification,
    id,
    checksum,
    effectiveDate: stat.mtime.toISOString().slice(0, 10),
    fileName: null,
    language: "vi",
    mimeType: MIME_BY_EXT[ext] || "application/octet-stream",
    originalName: path.basename(filePath),
    relativePath,
    size: stat.size,
    source: "safety-document-import",
    sourcePath: relativePath,
    sourceRelativePath,
    storagePath: relativePath,
    uploadedAt: stat.mtime.toISOString(),
    url: `/api/documents/${encodeURIComponent(id)}/file`,
    version: "1.0",
    createdAt: now,
    updatedAt: now
  };
};
