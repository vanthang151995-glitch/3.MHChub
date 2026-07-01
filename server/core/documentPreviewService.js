import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { inflateRawSync } from "zlib";
import { formatExcelDateTime, formatExcelNumber, resolveFormatKind } from "../../shared/xlsxPreviewCore.js";
import { createXlsxPreview } from "./xlsxPreview.js";

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

const zipDateTimeNow = () => {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  return { date, time };
};

const crc32Table = new Uint32Array(256).map((_value, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const readUInt16 = (buffer, offset) => buffer.readUInt16LE(offset);
const readUInt32 = (buffer, offset) => buffer.readUInt32LE(offset);

const readZipEntries = (filePath) => {
  const archive = fs.readFileSync(filePath);
  let eocdOffset = -1;
  for (let offset = archive.length - 22; offset >= 0; offset -= 1) {
    if (readUInt32(archive, offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Invalid XLSX archive");

  const entries = [];
  const entryCount = readUInt16(archive, eocdOffset + 10);
  let centralOffset = readUInt32(archive, eocdOffset + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32(archive, centralOffset) !== 0x02014b50) throw new Error("Invalid XLSX central directory");
    const method = readUInt16(archive, centralOffset + 10);
    const time = readUInt16(archive, centralOffset + 12);
    const date = readUInt16(archive, centralOffset + 14);
    const compressedSize = readUInt32(archive, centralOffset + 20);
    const nameLength = readUInt16(archive, centralOffset + 28);
    const extraLength = readUInt16(archive, centralOffset + 30);
    const commentLength = readUInt16(archive, centralOffset + 32);
    const localOffset = readUInt32(archive, centralOffset + 42);
    const name = archive.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString("utf8");

    if (readUInt32(archive, localOffset) !== 0x04034b50) throw new Error(`Invalid XLSX local header for ${name}`);
    const localNameLength = readUInt16(archive, localOffset + 26);
    const localExtraLength = readUInt16(archive, localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new Error(`Unsupported XLSX compression method ${method}`);

    entries.push({ data, date, name, time });
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

const writeStoredZip = (entries, targetPath) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const fallbackDateTime = zipDateTimeNow();

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.data);
    const checksum = crc32(data);
    const time = entry.time || fallbackDateTime.time;
    const date = entry.date || fallbackDateTime.date;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.writeFileSync(targetPath, Buffer.concat([...localParts, ...centralParts, eocd]));
};

const dateBuiltInFormatIds = new Set([14, 15, 16, 17, 27, 30, 36, 50, 57]);
const dateTimeBuiltInFormatIds = new Set([22]);
const spreadsheetPdfBuiltInFormatCodes = new Map([
  [14, "yyyy/mm/dd"],
  [15, "yyyy/mm/dd"],
  [16, "yyyy/mm/dd"],
  [17, "yyyy/mm/dd"],
  [18, "hh:mm AM/PM"],
  [19, "hh:mm:ss AM/PM"],
  [20, "hh:mm"],
  [21, "hh:mm:ss"],
  [22, "yyyy/mm/dd hh:mm"],
  [27, "yyyy/mm/dd"],
  [30, "yyyy/mm/dd"],
  [36, "yyyy/mm/dd"],
  [45, "mm:ss"],
  [46, "[h]:mm:ss"],
  [47, "mmss.0"],
  [50, "yyyy/mm/dd"],
  [57, "yyyy/mm/dd"]
]);

const attrValue = (attrs = "", name = "") => attrs.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1] || "";

const setXmlAttr = (attrs = "", name = "", value = "") => {
  if (new RegExp(`\\b${name}="`, "i").test(attrs)) {
    return attrs.replace(new RegExp(`\\b${name}="[^"]*"`, "i"), `${name}="${value}"`);
  }
  return `${attrs} ${name}="${value}"`;
};

const escapeXmlText = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const parseSpreadsheetPdfStyleInfo = (stylesXml = "") => {
  const customFormats = new Map();
  for (const match of stylesXml.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const attrs = match[1] || "";
    const numFmtId = Number(attrValue(attrs, "numFmtId"));
    if (!Number.isFinite(numFmtId)) continue;
    customFormats.set(numFmtId, attrValue(attrs, "formatCode"));
  }

  const cellFormats = [];
  const dateStyles = new Set();
  const cellXfs = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/i)?.[1] || "";
  let index = 0;

  for (const match of cellXfs.matchAll(/<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g)) {
    const attrs = match[1] || "";
    const numFmtId = Number(attrValue(attrs, "numFmtId"));
    const formatCode = customFormats.get(numFmtId) || spreadsheetPdfBuiltInFormatCodes.get(numFmtId) || "";
    const formatKind = resolveFormatKind(numFmtId, formatCode);
    if (formatKind === "date" || formatKind === "datetime" || formatKind === "time") {
      dateStyles.add(index);
    }
    cellFormats[index] = {
      formatCode,
      formatKind,
      numFmtId: Number.isFinite(numFmtId) ? numFmtId : undefined
    };
    index += 1;
  }

  return { cellFormats, dateStyles };
};

const normalizeSpreadsheetPdfWorksheet = (sheetXml = "", styleInfo = {}) => {
  const dateStyles = styleInfo.dateStyles || new Set();
  const cellFormats = styleInfo.cellFormats || [];
  const date1904 = Boolean(styleInfo.date1904);

  return String(sheetXml || "").replace(/<c\b([^>]*)>([\s\S]*?)<\/c>/g, (match, attrs, innerXml) => {
    const styleIndex = Number(attrValue(attrs, "s"));
    if (!dateStyles.has(styleIndex)) return match;

    const rawValue = innerXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] || "";
    if (!String(rawValue).trim()) return match;

    const format = cellFormats[styleIndex] || {};
    const text = formatExcelDateTime(rawValue, format.formatCode || "", date1904, format.formatKind || "date");
    if (!text) return match;

    const preservedAttrs = attrs
      .replace(/\s+t="[^"]*"/i, "")
      .replace(/\s+xml:space="[^"]*"/i, "")
      .trim();
    const xmlSpace = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : "";
    return `<c${preservedAttrs ? ` ${preservedAttrs}` : ""} t="inlineStr"><is><t${xmlSpace}>${escapeXmlText(text)}</t></is></c>`;
  });
};

const parseSpreadsheetPdfWorkbookSheets = (workbookXml = "") => {
  const sheetSection = workbookXml.match(/<sheets\b[^>]*>([\s\S]*?)<\/sheets>/i)?.[1] || "";
  const sheets = [];
  let index = 0;

  for (const match of sheetSection.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = match[1] || "";
    const state = attrValue(attrs, "state").toLowerCase();
    sheets.push({
      attrs,
      index,
      rId: attrValue(attrs, "r:id"),
      tag: match[0],
      visible: !state || state === "visible"
    });
    index += 1;
  }

  const workbookViewAttrs = workbookXml.match(/<workbookView\b([^>]*)\/?>/i)?.[1] || "";
  const activeTab = Number(attrValue(workbookViewAttrs, "activeTab"));
  return {
    activeTab: Number.isFinite(activeTab) ? activeTab : 0,
    sheets
  };
};

const normalizeSpreadsheetPdfWorkbookXml = (workbookXml = "", sheets = [], activeTab = 0) => {
  if (!workbookXml || !sheets.length) return workbookXml;
  const visibleSheets = sheets.filter((sheet) => sheet.visible);
  if (!visibleSheets.length) return workbookXml;
  const visibleSheetIndexMap = new Map(visibleSheets.map((sheet, index) => [sheet.index, index]));

  const activeVisibleSheet = sheets[activeTab] && sheets[activeTab].visible ? sheets[activeTab] : visibleSheets[0];
  const orderedVisibleSheets = [activeVisibleSheet, ...visibleSheets.filter((sheet) => sheet !== activeVisibleSheet)];
  const nextSheetsXml = orderedVisibleSheets.map((sheet) => sheet.tag).join("");

  let next = workbookXml.replace(/<sheets\b([^>]*)>/i, (_match, attrs) => `<sheets${setXmlAttr(attrs, "count", String(visibleSheets.length))}>`);
  next = next.replace(/(<sheets\b[^>]*>)([\s\S]*?)(<\/sheets>)/i, (_match, start, _body, end) => `${start}${nextSheetsXml}${end}`);
  next = next.replace(/(<workbookView\b[^>]*\bactiveTab=")(\d+)(")/i, (_match, start, _value, end) => `${start}0${end}`);
  next = next.replace(/(<workbookView\b[^>]*\bfirstSheet=")(\d+)(")/i, (_match, start, _value, end) => `${start}0${end}`);

  next = next.replace(/(<definedNames\b[^>]*>)([\s\S]*?)(<\/definedNames>)/i, (_match, start, body, end) => {
    const nextBody = body.replace(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g, (definedNameMatch, attrs, value) => {
      const localSheetId = Number(attrValue(attrs, "localSheetId"));
      if (!Number.isFinite(localSheetId)) return definedNameMatch;
      if (!visibleSheetIndexMap.has(localSheetId)) return "";
      const nextAttrs = setXmlAttr(attrs, "localSheetId", String(visibleSheetIndexMap.get(localSheetId)));
      return `<definedName${nextAttrs}>${value}</definedName>`;
    });
    return `${start}${nextBody}${end}`;
  });

  return next;
};

const normalizeSpreadsheetPdfWorkbookRelsXml = (relsXml = "", sheets = []) => {
  if (!relsXml || !sheets.length) return relsXml;
  const visibleIds = new Set(sheets.filter((sheet) => sheet.visible && sheet.rId).map((sheet) => sheet.rId));

  return relsXml.replace(/<Relationship\b([^>]*)\/?>/g, (match, attrs) => {
    const target = attrValue(attrs, "Target").replace(/\\/g, "/");
    const relationId = attrValue(attrs, "Id");
    const isWorksheetTarget = /(?:^|\/)worksheets\/sheet\d+\.xml$/i.test(target);
    if (isWorksheetTarget && relationId && !visibleIds.has(relationId)) {
      return "";
    }
    return match;
  });
};

const normalizeSpreadsheetPdfStyles = (stylesXml = "") => {
  if (!stylesXml || !/(?:numFmtId="(?:14|15|16|17|22|27|30|36|50|57)")/.test(stylesXml)) return stylesXml;
  const ids = [...stylesXml.matchAll(/\bnumFmtId="(\d+)"/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  const nextDateId = Math.max(164, ...ids) + 1;
  const nextDateTimeId = nextDateId + 1;
  const dateNumFmt = `<numFmt numFmtId="${nextDateId}" formatCode="yyyy/mm/dd"/>`;
  const dateTimeNumFmt = `<numFmt numFmtId="${nextDateTimeId}" formatCode="yyyy/mm/dd hh:mm"/>`;

  let next = stylesXml;
  if (/<numFmts\b/i.test(next)) {
    next = next.replace(/<numFmts\b([^>]*)>([\s\S]*?)<\/numFmts>/i, (match, attrs, body) => {
      const count = Number(attrValue(attrs, "count")) || 0;
      const updatedAttrs = setXmlAttr(attrs, "count", String(count + 2));
      return `<numFmts${updatedAttrs}>${body}${dateNumFmt}${dateTimeNumFmt}</numFmts>`;
    });
  } else {
    next = next.replace(/(<styleSheet\b[^>]*>)/i, `$1<numFmts count="2">${dateNumFmt}${dateTimeNumFmt}</numFmts>`);
  }

  return next.replace(/(<cellXfs\b[^>]*>)([\s\S]*?)(<\/cellXfs>)/i, (_match, start, body, end) => {
    const updatedBody = body.replace(/<xf\b([^>]*?)(\/>|>([\s\S]*?)<\/xf>)/gi, (xfMatch, attrs, close) => {
      const numFmtId = Number(attrValue(attrs, "numFmtId"));
      const replacementId = dateBuiltInFormatIds.has(numFmtId) ? nextDateId : dateTimeBuiltInFormatIds.has(numFmtId) ? nextDateTimeId : null;
      if (!replacementId) return xfMatch;
      let nextAttrs = setXmlAttr(attrs, "numFmtId", String(replacementId));
      nextAttrs = setXmlAttr(nextAttrs, "applyNumberFormat", "1");
      return `<xf${nextAttrs}${close}`;
    });
    return `${start}${updatedBody}${end}`;
  });
};

// IMPORTANT: keep this normalization path for spreadsheet PDF previews.
// It preserves visual fidelity against the source workbook, especially date formatting and sheet order,
// and should not be removed unless there is an equally faithful replacement.
const createSpreadsheetPdfSource = (sourcePath, workDir) => {
  if (path.extname(sourcePath || "").toLowerCase() !== ".xlsx") return sourcePath;
  const entries = readZipEntries(sourcePath);
  const stylesEntry = entries.find((entry) => entry.name === "xl/styles.xml");
  const workbookEntry = entries.find((entry) => entry.name === "xl/workbook.xml");
  const workbookRelsEntry = entries.find((entry) => entry.name === "xl/_rels/workbook.xml.rels");
  if (!stylesEntry || !workbookEntry || !workbookRelsEntry) return sourcePath;

  const beforeStyles = stylesEntry.data.toString("utf8");
  const afterStyles = normalizeSpreadsheetPdfStyles(beforeStyles);
  const workbookXml = workbookEntry.data.toString("utf8");
  const { activeTab, sheets } = parseSpreadsheetPdfWorkbookSheets(workbookXml);
  const date1904 = /<workbookPr\b[^>]*date1904="1"/i.test(workbookXml);
  const styleInfo = parseSpreadsheetPdfStyleInfo(afterStyles);
  styleInfo.date1904 = date1904;

  let changed = afterStyles !== beforeStyles;
  if (changed) {
    stylesEntry.data = Buffer.from(afterStyles, "utf8");
  }

  const beforeWorkbook = workbookXml;
  const afterWorkbook = normalizeSpreadsheetPdfWorkbookXml(beforeWorkbook, sheets, activeTab);
  if (afterWorkbook !== beforeWorkbook) {
    workbookEntry.data = Buffer.from(afterWorkbook, "utf8");
    changed = true;
  }

  const beforeRels = workbookRelsEntry.data.toString("utf8");
  const afterRels = normalizeSpreadsheetPdfWorkbookRelsXml(beforeRels, sheets);
  if (afterRels !== beforeRels) {
    workbookRelsEntry.data = Buffer.from(afterRels, "utf8");
    changed = true;
  }

  for (const entry of entries) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name)) continue;
    const beforeSheet = entry.data.toString("utf8");
    const afterSheet = normalizeSpreadsheetPdfWorksheet(beforeSheet, styleInfo);
    if (afterSheet !== beforeSheet) {
      entry.data = Buffer.from(afterSheet, "utf8");
      changed = true;
    }
  }

  if (!changed) return sourcePath;
  const normalizedPath = path.join(workDir, `${path.basename(sourcePath, path.extname(sourcePath))}.preview-normalized.xlsx`);
  writeStoredZip(entries, normalizedPath);
  return normalizedPath;
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

const excelSerialToYmd = (value = "") => {
  const serial = Number(value);
  if (!Number.isFinite(serial)) return "";
  const wholeDays = Math.trunc(serial);
  const fraction = serial - wholeDays;
  const adjustedDays = wholeDays >= 60 ? wholeDays - 1 : wholeDays;
  const epoch = Date.UTC(1899, 11, 31);
  const date = new Date(epoch + adjustedDays * 86400000 + Math.round(fraction * 86400000));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
};

const extractSpreadsheetFormatCode = (sdnum = "") => {
  const parts = String(sdnum || "").split(";");
  if (parts.length < 3) return "";
  return parts.slice(2).join(";");
};

const buildSpreadsheetFormatHints = (sourcePath = "") => {
  if (path.extname(sourcePath || "").toLowerCase() !== ".xlsx" || !fs.existsSync(sourcePath)) return [];

  try {
    const preview = createXlsxPreview({
      filePath: sourcePath,
      document: { title: path.basename(sourcePath) }
    });
    return (preview.sheets || []).map((sheet) =>
      (sheet.rows || []).flatMap((row) =>
        (row.cells || []).filter((cell) => {
          if (!cell || cell.hiddenByMerge) return false;
          return String(cell.rawValue ?? "").trim() !== "";
        }).map((cell) => ({
          formatCode: cell.formatCode || "",
          formatKind: cell.formatKind || "",
          rawValue: String(cell.rawValue ?? ""),
          value: cell.value
        }))
      )
    );
  } catch {
    return [];
  }
};

const normalizeSpreadsheetCellValue = (serial, sdnum = "", hint = null) => {
  const formatCode = extractSpreadsheetFormatCode(sdnum);
  const formatKind = resolveFormatKind(0, formatCode);
  const fallbackKind = hint?.formatKind || "";
  const fallbackCode = hint?.formatCode || "";
  const effectiveKind = ["date", "datetime", "time", "percent"].includes(formatKind) ? formatKind : fallbackKind;
  const effectiveCode = formatCode || fallbackCode;

  if (effectiveKind === "percent") return formatExcelNumber(serial, effectiveCode || "0%");
  if (effectiveKind === "date") return excelSerialToYmd(serial);
  if (effectiveKind === "datetime" || effectiveKind === "time") {
    return formatExcelDateTime(serial, effectiveCode, false, effectiveKind);
  }
  return "";
};

const normalizeSpreadsheetHtmlCellValues = (html = "", spreadsheetHints = []) => {
  const tablePattern = /<table\b[\s\S]*?<\/table>/gi;
  let tableIndex = 0;

  return String(html || "").replace(tablePattern, (tableHtml) => {
    const tableHints = spreadsheetHints[tableIndex] || [];
    tableIndex += 1;
    let cellIndex = 0;

    return tableHtml.replace(
      /(<td\b[^>]*\bsdval="(\d+(?:\.\d+)?)"[^>]*\bsdnum="([^"]*)"[^>]*>)([\s\S]*?)(<\/td>)/gi,
      (match, prefix, serial, format, innerHtml, suffix) => {
        const hint = tableHints[cellIndex] || null;
        cellIndex += 1;
        const replacement = normalizeSpreadsheetCellValue(serial, format, hint);
        if (!replacement) return match;
        const replacedInner = innerHtml.replace(/(<font\b[^>]*>)([\s\S]*?)(<\/font>)/i, (_fontMatch, start, _content, end) => `${start}${replacement}${end}`);
        return replacedInner === innerHtml ? `${prefix}${replacement}${suffix}` : `${prefix}${replacedInner}${suffix}`;
      }
    );
  });
};

export const sanitizeSpreadsheetHtml = (html = "", spreadsheetHints = []) => {
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

  const sanitized = next.replace(htmlAttrValuePattern, (match, rawName, _rawValue, doubleQuoted, singleQuoted) => {
    const name = String(rawName || "");
    const lowerName = name.toLowerCase();
    const attrValue = doubleQuoted ?? singleQuoted ?? String(_rawValue || "").replace(/^['"]|['"]$/g, "");
    if (/^on[a-z]/i.test(name) || isDangerousHtmlUrl(lowerName, attrValue)) {
      return "";
    }
    return match;
  });
  return normalizeSpreadsheetHtmlCellValues(sanitized, spreadsheetHints);
};

export const sanitizeSpreadsheetHtmlDirectory = (directory, spreadsheetHints = []) => {
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
      const after = sanitizeSpreadsheetHtml(before, spreadsheetHints);
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
    const conversionSourcePath = createSpreadsheetPdfSource(sourcePath, workDir);
    await runLibreOfficeConvert({ executable, sourcePath: conversionSourcePath, outputDir, profileDir, timeoutMs });
    const generated = findGeneratedPdf(outputDir);
    if (!generated) throw new Error("LibreOffice did not create a PDF preview");
    fs.copyFileSync(generated, targetPath);
    return targetPath;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
};

const convertSpreadsheetHtmlPreview = async ({ executable, sourcePath, targetDir, previewDir, timeoutMs, documentId, spreadsheetHints = [] }) => {
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
    sanitizeSpreadsheetHtmlDirectory(targetDir, spreadsheetHints);
    return findGeneratedHtml(targetDir) || generated;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
};

export const createDocumentPreviewService = ({ previewDir, timeoutMs = 90000 }) => {
  fs.mkdirSync(previewDir, { recursive: true });
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
    const spreadsheetHints = ext === ".xlsx" ? buildSpreadsheetFormatHints(sourcePath) : [];
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
      sanitizeSpreadsheetHtmlDirectory(targetDir, spreadsheetHints);
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
        documentId: document.id,
        spreadsheetHints
      });
      sanitizeSpreadsheetHtmlDirectory(targetDir, spreadsheetHints);
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
