export const XLSX_PREVIEW_LIMITS = {
  maxSheets: 24,
  maxRows: 250,
  maxColumns: 60
};

const builtInPercentFormats = new Set([9, 10]);
const builtInNumberFormats = new Set([1, 2, 3, 4, 11]);
const builtInDateFormats = new Set([14, 15, 16, 17, 27, 30, 36, 50, 57]);
const builtInDateTimeFormats = new Set([22]);
const builtInTimeFormats = new Set([18, 19, 20, 21, 45, 46, 47]);
const builtInFormatCodes = new Map([
  [1, "0"],
  [2, "0.00"],
  [3, "#,##0"],
  [4, "#,##0.00"],
  [9, "0%"],
  [10, "0.00%"],
  [11, "0.00E+00"],
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

const indexedColors = [
  "#000000",
  "#ffffff",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffff00",
  "#ff00ff",
  "#00ffff",
  "#000000",
  "#ffffff",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffff00",
  "#ff00ff",
  "#00ffff",
  "#800000",
  "#008000",
  "#000080",
  "#808000",
  "#800080",
  "#008080",
  "#c0c0c0",
  "#808080"
];

export const decodeXml = (value = "") =>
  String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_match, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

const parseAttrs = (value = "") => {
  const attrs = {};
  for (const match of value.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) {
    attrs[match[1]] = decodeXml(match[2]);
  }
  return attrs;
};

const stripTags = (value = "") => decodeXml(String(value).replace(/<[^>]+>/g, ""));

const compactObject = (value) =>
  Object.fromEntries(Object.entries(value).filter((entry) => entry[1] !== undefined && entry[1] !== null && entry[1] !== ""));

const cssTextAlign = (value) => {
  if (value === "centerContinuous") return "center";
  if (["left", "center", "right", "justify"].includes(value)) return value;
  return "";
};

const cssVerticalAlign = (value) => {
  if (value === "center") return "middle";
  if (["top", "middle", "bottom"].includes(value)) return value;
  return "";
};

const columnIndex = (cellRef = "") => {
  const letters = String(cellRef).match(/[A-Z]+/i)?.[0]?.toUpperCase() || "";
  let index = 0;
  for (const char of letters) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return Math.max(0, index - 1);
};

const rowNumberFromRef = (cellRef = "") => Number(String(cellRef).match(/\d+/)?.[0] || 0);

const cellKey = (row, column) => `${row}:${column}`;

const columnName = (index) => {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const mod = (value - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    value = Math.floor((value - mod) / 26);
  }
  return name;
};

const parseCellRef = (ref = "") => ({
  row: rowNumberFromRef(ref),
  column: columnIndex(ref)
});

const parseRangeRef = (ref = "") => {
  const [startRef, endRef = startRef] = String(ref).split(":");
  const start = parseCellRef(startRef);
  const end = parseCellRef(endRef);
  if (!start.row || !end.row) return null;
  return {
    ref,
    startRow: Math.min(start.row, end.row),
    endRow: Math.max(start.row, end.row),
    startColumn: Math.min(start.column, end.column),
    endColumn: Math.max(start.column, end.column)
  };
};

const normalizeZipPath = (base, target) => {
  const raw = String(target || "").replace(/\\/g, "/");
  const full = raw.startsWith("/") ? raw.slice(1) : `${base}/${raw}`;
  const parts = [];
  for (const part of full.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
};

const colorFromAttrs = (attrs = {}) => {
  if (attrs.rgb) {
    const raw = String(attrs.rgb).replace("#", "");
    const rgb = raw.length === 8 ? raw.slice(2) : raw;
    if (/^[0-9a-fA-F]{6}$/.test(rgb)) return `#${rgb.toLowerCase()}`;
  }
  if (attrs.indexed && indexedColors[Number(attrs.indexed)]) return indexedColors[Number(attrs.indexed)];
  return "";
};

const colorFromTag = (block = "", tagName) => {
  const match = block.match(new RegExp(`<${tagName}\\b([^>]*)\\/?>(?:</${tagName}>)?`, "i"));
  return match ? colorFromAttrs(parseAttrs(match[1])) : "";
};

const parseFontBlock = (block = "") =>
  compactObject({
    color: colorFromTag(block, "color"),
    fontWeight: /<b\b/i.test(block) ? "800" : "",
    fontStyle: /<i\b/i.test(block) ? "italic" : "",
    textDecoration: /<u\b/i.test(block) ? "underline" : ""
  });

const parseFillBlock = (block = "") => {
  const patternAttrs = parseAttrs(block.match(/<patternFill\b([^>]*)>/i)?.[1] || "");
  const color = colorFromTag(block, "fgColor") || colorFromTag(block, "bgColor");
  if (!color || patternAttrs.patternType === "none" || patternAttrs.patternType === "gray125") return {};
  return { backgroundColor: color };
};

const parseFonts = (xml = "") => [...xml.matchAll(/<font\b[^>]*>([\s\S]*?)<\/font>/g)].map((match) => parseFontBlock(match[1]));

const parseFills = (xml = "") => [...xml.matchAll(/<fill\b[^>]*>([\s\S]*?)<\/fill>/g)].map((match) => parseFillBlock(match[1]));

const parseDxfStyles = (xml = "") => {
  const dxfs = xml.match(/<dxfs\b[^>]*>([\s\S]*?)<\/dxfs>/)?.[1] || "";
  return [...dxfs.matchAll(/<dxf\b[^>]*>([\s\S]*?)<\/dxf>/g)].map((match) => {
    const block = match[1];
    return compactObject({
      ...parseFillBlock(block.match(/<fill\b[^>]*>([\s\S]*?)<\/fill>/i)?.[1] || ""),
      ...parseFontBlock(block.match(/<font\b[^>]*>([\s\S]*?)<\/font>/i)?.[1] || "")
    });
  });
};

const excelColumnWidthToPx = (width) => {
  const value = Number(width);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.max(0, Math.round(value * 7 + 5));
};

const EMU_PER_PIXEL = 9525;

const rowHeightToPx = (height) => {
  const value = Number(height);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, (value * 96) / 72);
};

const emuToPx = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return 0;
  return numeric / EMU_PER_PIXEL;
};

const bytesToBase64 = (bytes = new Uint8Array()) => {
  if (!bytes.length) return "";
  let binary = "";
  const chunkSize = 0x2000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  if (typeof btoa === "function") return btoa(binary);
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  return "";
};

const inferMimeType = (fileName = "") => {
  const extension = String(fileName).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "bmp") return "image/bmp";
  if (extension === "webp") return "image/webp";
  if (extension === "svg") return "image/svg+xml";
  return "application/octet-stream";
};

const getWorksheetRelsPath = (entryPath = "") => String(entryPath).replace(/\/([^/]+)$/, "/_rels/$1.rels");
const getDrawingRelsPath = (drawingPath = "") => String(drawingPath).replace(/\/([^/]+)$/, "/_rels/$1.rels");

const parseRelationshipTargets = (xml = "", basePath = "") => {
  const rels = new Map();
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = parseAttrs(match[1]);
    if (attrs.Id && attrs.Target) rels.set(attrs.Id, normalizeZipPath(basePath, attrs.Target));
  }
  return rels;
};

const parseDrawingAnchors = (xml = "") => {
  const anchors = [];
  for (const match of xml.matchAll(/<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[^>]*>([\s\S]*?)<\/xdr:\1>/g)) {
    const type = match[1];
    const block = match[0];
    const picBlock = block.match(/<xdr:pic\b[\s\S]*?<\/xdr:pic>/i)?.[0] || "";
    const embed = picBlock.match(/<a:blip\b[^>]*r:embed="([^"]+)"/i)?.[1] || "";
    if (!embed) continue;

    const pointFromSection = (section = "") => ({
      col: Number(section.match(/<xdr:col>(\d+)<\/xdr:col>/i)?.[1] || 0),
      colOff: Number(section.match(/<xdr:colOff>(-?\d+)<\/xdr:colOff>/i)?.[1] || 0),
      row: Number(section.match(/<xdr:row>(\d+)<\/xdr:row>/i)?.[1] || 0),
      rowOff: Number(section.match(/<xdr:rowOff>(-?\d+)<\/xdr:rowOff>/i)?.[1] || 0)
    });

    const from = pointFromSection(block.match(/<xdr:from\b[^>]*>([\s\S]*?)<\/xdr:from>/i)?.[1] || "");
    const to = pointFromSection(block.match(/<xdr:to\b[^>]*>([\s\S]*?)<\/xdr:to>/i)?.[1] || "");
    const pos = parseAttrs(block.match(/<xdr:pos\b([^>]*)\/?>/i)?.[1] || "");
    const ext = parseAttrs(block.match(/<xdr:ext\b([^>]*)\/?>/i)?.[1] || "");
    const name = picBlock.match(/<xdr:cNvPr\b[^>]*name="([^"]*)"/i)?.[1] || "";
    const descr = picBlock.match(/<xdr:cNvPr\b[^>]*descr="([^"]*)"/i)?.[1] || "";

    anchors.push(
      compactObject({
        descr,
        embed,
        ext: type === "absoluteAnchor" ? { cx: Number(ext.cx) || 0, cy: Number(ext.cy) || 0 } : null,
        from,
        name,
        pos: type === "absoluteAnchor" ? { x: Number(pos.x) || 0, y: Number(pos.y) || 0 } : null,
        to,
        type
      })
    );
  }
  return anchors;
};

const stripFormatDecorations = (value = "") => {
  const text = String(value);
  let result = "";
  let inQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "_") {
      index += 1;
      continue;
    }
    if (char === "*") {
      index += 1;
      continue;
    }
    if (char === "[") {
      const end = text.indexOf("]", index + 1);
      if (end < 0) continue;
      const content = text.slice(index + 1, end).trim();
      if (/^(?:h+|m+|s+)$/i.test(content)) {
        result += `[${content}]`;
      }
      index = end;
      continue;
    }

    result += char;
  }

  return result.trim();
};

const tokenizeExcelFormat = (formatCode = "") => {
  const section = String(formatCode || "").split(";")[0] || "";
  const tokens = [];

  for (let index = 0; index < section.length; index += 1) {
    const char = section[index];

    if (char === '"') {
      let literal = "";
      index += 1;
      while (index < section.length && section[index] !== '"') {
        literal += section[index];
        index += 1;
      }
      if (literal) tokens.push({ type: "literal", value: literal });
      continue;
    }
    if (char === "\\") {
      if (index + 1 < section.length) {
        tokens.push({ type: "literal", value: section[index + 1] });
        index += 1;
      }
      continue;
    }
    if (char === "_") {
      if (index + 1 < section.length) index += 1;
      continue;
    }
    if (char === "*") {
      if (index + 1 < section.length) index += 1;
      continue;
    }
    if (char === "[") {
      const end = section.indexOf("]", index + 1);
      if (end < 0) continue;
      const content = section.slice(index + 1, end).trim();
      if (/^(h+|m+|s+)$/i.test(content)) {
        const lower = content.toLowerCase();
        tokens.push({
          type: "elapsed",
          unit: lower[0],
          length: lower.length
        });
      }
      index = end;
      continue;
    }

    const upper = section.slice(index).toUpperCase();
    if (upper.startsWith("AM/PM")) {
      tokens.push({ type: "ampm" });
      index += 4;
      continue;
    }
    if (upper.startsWith("A/P")) {
      tokens.push({ type: "ampm" });
      index += 2;
      continue;
    }

    const lower = char.toLowerCase();
    if (/[ymdhs]/.test(lower)) {
      let length = 1;
      while (index + length < section.length && section[index + length].toLowerCase() === lower) {
        length += 1;
      }
      const tokenType =
        lower === "y"
          ? "year"
          : lower === "d"
            ? "day"
            : lower === "h"
              ? "hour"
              : lower === "s"
                ? "second"
                : "monthMinute";
      tokens.push({ length, type: tokenType });
      index += length - 1;
      continue;
    }

    tokens.push({ type: "literal", value: char });
  }

  return tokens;
};

const excelSerialToParts = (serial, date1904 = false) => {
  const numeric = Number(serial);
  if (!Number.isFinite(numeric)) return null;

  let wholeDays = Math.trunc(numeric);
  let fraction = numeric - wholeDays;
  if (fraction < 0) fraction += 1;

  let timeMilliseconds = Math.round(fraction * 86400000);
  if (timeMilliseconds >= 86400000) {
    wholeDays += 1;
    timeMilliseconds -= 86400000;
  }

  const has1900LeapBug = !date1904;
  const dateOffsetDays = has1900LeapBug && wholeDays >= 60 ? wholeDays - 1 : wholeDays;
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  const date = new Date(base + dateOffsetDays * 86400000 + timeMilliseconds);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();

  return {
    date,
    day: date.getUTCDate(),
    days: wholeDays,
    hour: hours,
    minute: minutes,
    month: date.getUTCMonth() + 1,
    second: seconds,
    totalHours: Math.floor((wholeDays * 86400000 + timeMilliseconds) / 3600000),
    totalMinutes: Math.floor((wholeDays * 86400000 + timeMilliseconds) / 60000),
    totalSeconds: Math.floor((wholeDays * 86400000 + timeMilliseconds) / 1000),
    year: date.getUTCFullYear()
  };
};

const formatWithDigits = (value, length = 1) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  const rounded = Math.trunc(Math.abs(numeric));
  const text = String(rounded).padStart(Math.max(1, length), "0");
  return numeric < 0 ? `-${text}` : text;
};

export const formatExcelNumber = (value, formatCode = "") => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  const section = stripFormatDecorations(String(formatCode || "")).split(";")[0] || "";
  const percent = /%/.test(section);
  const scientific = /E[+-]0+/i.test(section);
  const positiveValue = percent ? numeric * 100 : numeric;
  const decimalMatch = section.match(/\.([0#?]+)/);
  const maximumFractionDigits = decimalMatch ? decimalMatch[1].length : 0;
  const minimumFractionDigits = decimalMatch ? (decimalMatch[1].match(/0/g) || []).length : 0;
  const useGrouping = /#,##/.test(section);
  const absValue = Math.abs(positiveValue);

  if (scientific) {
    const fractionDigits = Math.max(0, maximumFractionDigits);
    const display = absValue.toExponential(fractionDigits).replace("e", "E");
    if (numeric < 0) return `-${display}`;
    return display;
  }

  const formatter = new Intl.NumberFormat("en-US", {
    useGrouping,
    minimumFractionDigits,
    maximumFractionDigits
  });
  const display = formatter.format(absValue);
  const signedDisplay = numeric < 0 ? `-${display}` : display;
  return percent ? `${signedDisplay}%` : signedDisplay;
};

export const formatExcelDateTime = (serial, formatCode = "", date1904 = false, kind = "date") => {
  const parts = excelSerialToParts(serial, date1904);
  if (!parts) return "";

  const section = String(formatCode || "").split(";")[0] || "";
  const tokens = tokenizeExcelFormat(section);
  const uses12HourClock = tokens.some((token) => token.type === "ampm");
  let seenTimeToken = false;

  return tokens
    .map((token) => {
      if (token.type === "literal") return token.value;
      if (token.type === "year") {
        return token.length === 2 ? String(parts.year).slice(-2) : String(parts.year).padStart(token.length, "0");
      }
      if (token.type === "day") {
        if (token.length >= 4) return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(parts.date);
        if (token.length === 3) return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(parts.date);
        return String(parts.day).padStart(token.length, "0");
      }
      if (token.type === "hour") {
        seenTimeToken = true;
        const hour = uses12HourClock ? ((parts.hour % 12) || 12) : parts.hour;
        return String(hour).padStart(token.length, "0");
      }
      if (token.type === "second") {
        seenTimeToken = true;
        return String(parts.second).padStart(token.length, "0");
      }
      if (token.type === "ampm") {
        seenTimeToken = true;
        return parts.hour >= 12 ? "PM" : "AM";
      }
      if (token.type === "elapsed") {
        seenTimeToken = true;
        if (token.unit === "h") return String(parts.totalHours).padStart(token.length, "0");
        if (token.unit === "m") return String(parts.totalMinutes).padStart(token.length, "0");
        return String(parts.totalSeconds).padStart(token.length, "0");
      }
      if (token.type === "monthMinute") {
        if (kind === "time" || kind === "duration" || (kind === "datetime" && seenTimeToken)) {
          return String(parts.minute).padStart(token.length, "0");
        }
        if (token.length >= 4) return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(parts.date);
        if (token.length === 3) return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(parts.date);
        return String(parts.month).padStart(token.length, "0");
      }
      return "";
    })
    .join("");
};

const resolveFormatCode = (numFmtId, customFormats) => customFormats.get(numFmtId) || builtInFormatCodes.get(numFmtId) || "";

export const resolveFormatKind = (numFmtId, formatCode) => {
  const normalized = stripFormatDecorations(formatCode).toLowerCase();
  if (!normalized || normalized === "general") return "general";
  if (builtInPercentFormats.has(numFmtId) || normalized.includes("%")) return "percent";
  if (builtInDateTimeFormats.has(numFmtId)) return "datetime";
  if (builtInTimeFormats.has(numFmtId)) return "time";
  if (builtInDateFormats.has(numFmtId)) return "date";

  const hasDate = /[yd]/.test(normalized);
  const hasTime = /(?:\[h+]|h|s|am\/pm|a\/p)/.test(normalized);
  if (hasDate && hasTime) return "datetime";
  if (hasDate) return "date";
  if (hasTime) return "time";
  if (builtInNumberFormats.has(numFmtId) || /[#0?]/.test(normalized)) return "number";
  return "text";
};

const parseCellStyles = (xml = "", date1904 = false) => {
  const customFormats = new Map();
  for (const match of xml.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const attrs = parseAttrs(match[1]);
    customFormats.set(Number(attrs.numFmtId), String(attrs.formatCode || ""));
  }

  const fonts = parseFonts(xml.match(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/)?.[1] || "");
  const fills = parseFills(xml.match(/<fills\b[^>]*>([\s\S]*?)<\/fills>/)?.[1] || "");
  const dxfStyles = parseDxfStyles(xml);
  const dateStyles = new Set();
  const cellFormats = [];
  const cellStyles = [];
  const cellXfs = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || "";
  let index = 0;

  for (const match of cellXfs.matchAll(/<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g)) {
    const attrs = parseAttrs(match[1]);
    const block = match[2] || "";
    const alignmentAttrs = parseAttrs(block.match(/<alignment\b([^>]*)\/?>/i)?.[1] || "");
    const numFmtId = Number(attrs.numFmtId);
    const formatCode = resolveFormatCode(numFmtId, customFormats);
    const formatKind = resolveFormatKind(numFmtId, formatCode);
    if (formatKind === "date" || formatKind === "datetime" || formatKind === "time") {
      dateStyles.add(index);
    }
    cellStyles[index] = compactObject({
      ...(fills[Number(attrs.fillId)] || {}),
      ...(fonts[Number(attrs.fontId)] || {}),
      textAlign: cssTextAlign(alignmentAttrs.horizontal),
      verticalAlign: cssVerticalAlign(alignmentAttrs.vertical),
      whiteSpace: alignmentAttrs.wrapText === "1" ? "pre-wrap" : ""
    });
    cellFormats[index] = compactObject({
      numFmtId: Number.isFinite(numFmtId) ? numFmtId : undefined,
      formatCode,
      formatKind
    });
    index += 1;
  }

  return { dateStyles, cellFormats, cellStyles, dxfStyles, date1904: Boolean(date1904) };
};

const excelDate = (serial) => formatExcelDateTime(serial, "yyyy/mm/dd");

const parseSharedStrings = (xml = "") => {
  const values = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const block = match[1];
    const parts = [...block.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decodeXml(item[1]));
    values.push(parts.length ? parts.join("") : stripTags(block));
  }
  return values;
};

const parseWorkbookSheets = (entries) => {
  const workbookXml = entries.get("xl/workbook.xml") || "";
  const relsXml = entries.get("xl/_rels/workbook.xml.rels") || "";
  const rels = parseRelationshipTargets(relsXml, "xl");

  const sheets = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = parseAttrs(match[1]);
    const entryPath = rels.get(attrs["r:id"]);
    const drawingPath = entryPath ? (() => {
      const sheetXml = entries.get(entryPath) || "";
      const sheetRelsXml = entries.get(getWorksheetRelsPath(entryPath)) || "";
      const sheetRels = parseRelationshipTargets(sheetRelsXml, "xl/worksheets");
      const drawingId = sheetXml.match(/<drawing\b[^>]*r:id="([^"]+)"/i)?.[1] || "";
      return drawingId ? sheetRels.get(drawingId) || "" : "";
    })() : "";
    if (entryPath) {
      sheets.push({
        name: attrs.name || `Sheet ${sheets.length + 1}`,
        drawingPath,
        entryPath
      });
    }
  }

  if (sheets.length) return sheets;
  return [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort()
    .map((entryPath, index) => ({ name: `Sheet ${index + 1}`, entryPath }));
};

const parseWorkbookSettings = (entries) => {
  const workbookXml = entries.get("xl/workbook.xml") || "";
  return {
    date1904: /<workbookPr\b[^>]*date1904="1"/i.test(workbookXml)
  };
};

const parseColumnWidths = (xml = "") => {
  const widths = [];
  const sheetFormatAttrs = parseAttrs(xml.match(/<sheetFormatPr\b([^>]*)\/?>/i)?.[1] || "");
  const defaultColumnWidth = excelColumnWidthToPx(sheetFormatAttrs.defaultColWidth || "");
  const defaultRowHeight = Number(sheetFormatAttrs.defaultRowHeight) || undefined;

  for (const colsBlock of xml.matchAll(/<cols\b[^>]*>([\s\S]*?)<\/cols>/g)) {
    for (const colMatch of colsBlock[1].matchAll(/<col\b([^>]*)\/?>/g)) {
      const attrs = parseAttrs(colMatch[1]);
      const min = Math.max(1, Number(attrs.min) || 0);
      const max = Math.max(min, Number(attrs.max) || min);
      const hidden = attrs.hidden === "1";
      const width = hidden ? 0 : excelColumnWidthToPx(attrs.width);
      for (let column = min - 1; column <= max - 1 && column < XLSX_PREVIEW_LIMITS.maxColumns; column += 1) {
        widths[column] = width;
      }
    }
  }

  return {
    defaultColumnWidth,
    defaultRowHeight,
    widths
  };
};

const parseWorksheetImages = ({
  binaryEntries = new Map(),
  columnWidths = {},
  defaultRowHeight,
  drawingPath,
  rows = [],
  xmlEntries
}) => {
  if (!drawingPath || !xmlEntries) {
    return {
      canvasHeight: 0,
      canvasWidth: 0,
      images: []
    };
  }

  const drawingXml = xmlEntries.get(drawingPath) || "";
  if (!drawingXml) {
    return {
      canvasHeight: 0,
      canvasWidth: 0,
      images: []
    };
  }

  const drawingRelsXml = xmlEntries.get(getDrawingRelsPath(drawingPath)) || "";
  const drawingRels = parseRelationshipTargets(drawingRelsXml, "xl/drawings");
  const anchors = parseDrawingAnchors(drawingXml).filter((anchor) => anchor.type && anchor.embed);
  if (!anchors.length) {
    return {
      canvasHeight: 0,
      canvasWidth: 0,
      images: []
    };
  }

  const columnWidthList = Array.isArray(columnWidths.widths) ? columnWidths.widths : [];
  const defaultColumnWidthPx = Number(columnWidths.defaultColumnWidth) || 92;
  const defaultRowHeightPx = rowHeightToPx(defaultRowHeight || 13.8) || 18.4;
  const rowHeightByNumber = new Map();
  let lastParsedRowNumber = 0;

  for (const row of rows) {
    lastParsedRowNumber = Math.max(lastParsedRowNumber, Number(row.number) || 0);
    rowHeightByNumber.set(Number(row.number) || 0, row.height != null ? rowHeightToPx(row.height) : defaultRowHeightPx);
  }

  const maxAnchorRow = anchors.reduce((max, anchor) => Math.max(max, anchor.to?.row ?? anchor.from?.row ?? 0), 0);
  const maxAnchorColumn = anchors.reduce((max, anchor) => Math.max(max, anchor.to?.col ?? anchor.from?.col ?? 0), 0);
  const maxColumns = Math.max(columnWidthList.length, maxAnchorColumn + 1);
  const maxRows = Math.max(lastParsedRowNumber, maxAnchorRow + 1);

  const getColumnWidthPx = (index) => {
    const value = columnWidthList[index];
    return Number.isFinite(Number(value)) ? Number(value) : defaultColumnWidthPx;
  };

  const getRowHeightPx = (rowNumber) => {
    const value = rowHeightByNumber.get(rowNumber);
    return Number.isFinite(Number(value)) ? Number(value) : defaultRowHeightPx;
  };

  const getColumnLeftPx = (columnIndex) => {
    let total = 0;
    for (let index = 0; index < columnIndex; index += 1) {
      total += getColumnWidthPx(index);
    }
    return total;
  };

  const getRowTopPx = (rowIndexZeroBased) => {
    let total = 0;
    for (let index = 0; index < rowIndexZeroBased; index += 1) {
      total += getRowHeightPx(index + 1);
    }
    return total;
  };

  const images = [];
  let canvasWidth = 0;
  let canvasHeight = 0;

  for (const anchor of anchors) {
    const targetPath = drawingRels.get(anchor.embed);
    const bytes = targetPath ? binaryEntries.get(targetPath) : null;
    if (!targetPath || !bytes) continue;

    let left = 0;
    let top = 0;
    let width = 0;
    let height = 0;

    if (anchor.type === "absoluteAnchor" && anchor.pos && anchor.ext) {
      left = emuToPx(anchor.pos.x);
      top = emuToPx(anchor.pos.y);
      width = emuToPx(anchor.ext.cx);
      height = emuToPx(anchor.ext.cy);
    } else {
      const from = anchor.from || {};
      const to = anchor.to || from;
      left = getColumnLeftPx(Number(from.col) || 0) + emuToPx(from.colOff || 0);
      top = getRowTopPx(Number(from.row) || 0) + emuToPx(from.rowOff || 0);
      const right = getColumnLeftPx(Number(to.col) || 0) + emuToPx(to.colOff || 0);
      const bottom = getRowTopPx(Number(to.row) || 0) + emuToPx(to.rowOff || 0);
      width = Math.max(1, right - left);
      height = Math.max(1, bottom - top);
    }

    const src = `data:${inferMimeType(targetPath)};base64,${bytesToBase64(bytes)}`;
    const image = compactObject({
      alt: anchor.descr || anchor.name || "",
      height,
      left,
      name: anchor.name || "",
      src,
      target: targetPath,
      top,
      width
    });
    images.push(image);
    canvasWidth = Math.max(canvasWidth, left + width);
    canvasHeight = Math.max(canvasHeight, top + height);
  }

  let contentWidth = 0;
  for (let index = 0; index < maxColumns; index += 1) contentWidth += getColumnWidthPx(index);

  let contentHeight = 0;
  for (let rowIndex = 1; rowIndex <= maxRows; rowIndex += 1) contentHeight += getRowHeightPx(rowIndex);

  return {
    canvasHeight: Math.max(contentHeight, canvasHeight),
    canvasWidth: Math.max(contentWidth, canvasWidth),
    images
  };
};

const parseMergeMaps = (xml = "") => {
  const ranges = [...xml.matchAll(/<mergeCell\b[^>]*ref="([^"]+)"/g)]
    .map((match) => parseRangeRef(match[1]))
    .filter(Boolean);
  const anchors = new Map();
  const covered = new Map();

  for (const range of ranges) {
    const rowSpan = range.endRow - range.startRow + 1;
    const colSpan = range.endColumn - range.startColumn + 1;
    anchors.set(cellKey(range.startRow, range.startColumn), { ref: range.ref, rowSpan, colSpan });
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      for (let column = range.startColumn; column <= range.endColumn; column += 1) {
        if (row === range.startRow && column === range.startColumn) continue;
        covered.set(cellKey(row, column), { ref: range.ref });
      }
    }
  }

  return { ranges, anchors, covered };
};

const parseConditionalFormatting = (xml = "") => {
  const blocks = [];
  for (const blockMatch of xml.matchAll(/<conditionalFormatting\b([^>]*)>([\s\S]*?)<\/conditionalFormatting>/g)) {
    const blockAttrs = parseAttrs(blockMatch[1]);
    const ranges = String(blockAttrs.sqref || "")
      .split(/\s+/)
      .map((ref) => parseRangeRef(ref))
      .filter(Boolean);
    for (const ruleMatch of blockMatch[2].matchAll(/<cfRule\b([^>]*?)(?:\/>|>([\s\S]*?)<\/cfRule>)/g)) {
      const ruleAttrs = parseAttrs(ruleMatch[1]);
      const formulas = [...(ruleMatch[2] || "").matchAll(/<formula\b[^>]*>([\s\S]*?)<\/formula>/g)].map((item) =>
        decodeXml(item[1])
      );
      blocks.push(
        compactObject({
          range: blockAttrs.sqref || "",
          ranges,
          type: ruleAttrs.type || "",
          operator: ruleAttrs.operator || "",
          priority: ruleAttrs.priority || "",
          dxfId: ruleAttrs.dxfId || "",
          text: ruleAttrs.text || "",
          formulas
        })
      );
    }
  }
  return blocks;
};

const parseComparableValue = (value) => {
  const raw = String(value ?? "").trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) && raw !== "" ? numeric : raw;
};

const compareValues = (cell, rule) => {
  const text = String(cell.value ?? "");
  const rawNumber = Number(cell.rawValue);
  const textNumber = Number(text);
  const cellNumber = Number.isFinite(rawNumber) ? rawNumber : text.trim() !== "" && Number.isFinite(textNumber) ? textNumber : null;
  const targets = (rule.formulas || []).map(parseComparableValue);
  const first = targets[0];
  const second = targets[1];

  switch (rule.type) {
    case "containsBlanks":
      return text.trim() === "";
    case "notContainsBlanks":
      return text.trim() !== "";
    case "containsErrors":
      return /^#(DIV\/0!|N\/A|NAME\?|NULL!|NUM!|REF!|VALUE!)$/i.test(text.trim());
    case "notContainsErrors":
      return !/^#(DIV\/0!|N\/A|NAME\?|NULL!|NUM!|REF!|VALUE!)$/i.test(text.trim());
    case "containsText":
      return text.toLowerCase().includes(String(rule.text || first || "").toLowerCase());
    case "notContainsText":
      return !text.toLowerCase().includes(String(rule.text || first || "").toLowerCase());
    case "beginsWith":
      return text.toLowerCase().startsWith(String(rule.text || first || "").toLowerCase());
    case "endsWith":
      return text.toLowerCase().endsWith(String(rule.text || first || "").toLowerCase());
    case "cellIs": {
      if (cellNumber !== null && typeof first === "number") {
        if (rule.operator === "between" && typeof second === "number") return cellNumber >= first && cellNumber <= second;
        if (rule.operator === "notBetween" && typeof second === "number") return cellNumber < first || cellNumber > second;
        if (rule.operator === "greaterThan") return cellNumber > first;
        if (rule.operator === "lessThan") return cellNumber < first;
        if (rule.operator === "greaterThanOrEqual") return cellNumber >= first;
        if (rule.operator === "lessThanOrEqual") return cellNumber <= first;
        if (rule.operator === "equal") return cellNumber === first;
        if (rule.operator === "notEqual") return cellNumber !== first;
      }
      if (rule.operator === "equal") return text === String(first ?? "");
      if (rule.operator === "notEqual") return text !== String(first ?? "");
      return false;
    }
    case "expression":
      return /^true$/i.test(String(first));
    default:
      return false;
  }
};

const rangeIncludesCell = (range, row, column) =>
  row >= range.startRow && row <= range.endRow && column >= range.startColumn && column <= range.endColumn;

const matchingConditionalRules = ({ cell, column, rowNumber, rules, dxfStyles }) =>
  rules
    .filter((rule) => (rule.ranges || []).some((range) => rangeIncludesCell(range, rowNumber, column)))
    .filter((rule) => compareValues(cell, rule))
    .map((rule) => ({
      range: rule.range,
      type: rule.type,
      operator: rule.operator,
      formulas: rule.formulas || [],
      style: dxfStyles[Number(rule.dxfId)] || {}
    }));

const cellValue = ({ attrs, cellXml, sharedStrings, formats, date1904 }) => {
  const type = attrs.t || "";
  const rawValue = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || "";
  const styleIndex = Number(attrs.s);
  const format = formats?.[styleIndex] || {};
  const formatKind = format.formatKind || "";
  const formatCode = format.formatCode || "";

  if (type === "inlineStr") {
    const inline = [...cellXml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decodeXml(item[1]));
    return inline.join("");
  }
  if (type === "s") return sharedStrings[Number(rawValue)] || "";
  if (type === "b") return rawValue === "1" ? "TRUE" : "FALSE";
  if (rawValue && (formatKind === "date" || formatKind === "datetime" || formatKind === "time")) {
    return formatExcelDateTime(rawValue, formatCode, date1904, formatKind);
  }
  if (rawValue && formatKind === "percent") return formatExcelNumber(rawValue, formatCode || "0%");
  if (rawValue && formatKind === "number") return formatExcelNumber(rawValue, formatCode);
  return decodeXml(rawValue);
};

const formulaValue = (cellXml = "") => {
  const formula = cellXml.match(/<f\b[^>]*>([\s\S]*?)<\/f>/)?.[1];
  return formula ? decodeXml(formula) : "";
};

const parseWorksheet = (xml, sharedStrings, workbookStyles, entries, binaryEntries, sheetMeta = {}) => {
  const rows = [];
  let maxColumns = 0;
  let truncatedRows = false;
  let truncatedColumns = false;
  let styledCells = 0;
  let formulaCells = 0;
  let conditionalMatches = 0;
  const columnWidths = parseColumnWidths(xml);
  const defaultRowHeight = columnWidths.defaultRowHeight || undefined;
  const mergeMaps = parseMergeMaps(xml);
  const conditionalFormatting = parseConditionalFormatting(xml);

  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    if (rows.length >= XLSX_PREVIEW_LIMITS.maxRows) {
      truncatedRows = true;
      break;
    }
    const rowAttrs = parseAttrs(rowMatch[1]);
    const rowNumber = Number(rowAttrs.r) || rows.length + 1;
    const values = [];
    const cells = [];

    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = parseAttrs(cellMatch[1] || cellMatch[2] || "");
      const cellXml = cellMatch[3] || "";
      const index = columnIndex(attrs.r);
      if (index >= XLSX_PREVIEW_LIMITS.maxColumns) {
        truncatedColumns = true;
        continue;
      }
      const styleIndex = Number(attrs.s);
      const style = workbookStyles.cellStyles[styleIndex] || {};
      const format = workbookStyles.cellFormats?.[styleIndex] || {};
      const formula = formulaValue(cellXml);
      const rawValue = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || "";
      const value = cellValue({
        attrs,
        cellXml,
        sharedStrings,
        formats: workbookStyles.cellFormats,
        date1904: workbookStyles.date1904
      });

      if (attrs.s) styledCells += 1;
      if (formula) formulaCells += 1;

      values[index] = value;
      cells[index] = compactObject({
        value,
        rawValue,
        formula,
        numFmtId: format.numFmtId,
        formatCode: format.formatCode,
        formatKind: format.formatKind,
        style,
        styleIndex: Number.isFinite(styleIndex) ? styleIndex : undefined,
        merge: mergeMaps.anchors.get(cellKey(rowNumber, index))
      });
      maxColumns = Math.max(maxColumns, index + 1);
    }

    rows.push({
      number: rowNumber,
      height: rowAttrs.hidden === "1" ? 0 : Number(rowAttrs.ht) || defaultRowHeight || undefined,
      values,
      cells
    });
  }

  maxColumns = Math.min(maxColumns, XLSX_PREVIEW_LIMITS.maxColumns);
  const drawing = parseWorksheetImages({
    binaryEntries,
    columnWidths,
    defaultRowHeight,
    drawingPath: sheetMeta.drawingPath,
    entryPath: sheetMeta.entryPath,
    rows,
    sheetXml: xml,
    xmlEntries: entries
  });
  return {
    columns: Array.from({ length: maxColumns }, (_item, index) => columnName(index)),
    columnWidths: Array.from({ length: maxColumns }, (_item, index) => columnWidths.widths[index] ?? columnWidths.defaultColumnWidth ?? 92),
    canvasHeight: drawing.canvasHeight,
    canvasWidth: drawing.canvasWidth,
    defaultRowHeight,
    images: drawing.images,
    rows: rows.map((row) => ({
      number: row.number,
      height: row.height,
      values: Array.from({ length: maxColumns }, (_item, index) => row.values[index] ?? ""),
      cells: Array.from({ length: maxColumns }, (_item, index) => {
        const base = row.cells[index] || { value: row.values[index] ?? "" };
        const conditionalRules = matchingConditionalRules({
          cell: base,
          column: index,
          rowNumber: row.number,
          rules: conditionalFormatting,
          dxfStyles: workbookStyles.dxfStyles || []
        });
        if (conditionalRules.length) conditionalMatches += conditionalRules.length;
        const conditionalStyle = conditionalRules.reduce((style, rule) => ({ ...style, ...(rule.style || {}) }), {});
        return {
          ...base,
          value: base.value ?? "",
          style: { ...(base.style || {}), ...conditionalStyle },
          conditionalRules,
          merge: base.merge || mergeMaps.anchors.get(cellKey(row.number, index)) || null,
          hiddenByMerge: Boolean(mergeMaps.covered.get(cellKey(row.number, index)))
        };
      })
    })),
    truncatedRows,
    truncatedColumns,
    conditionalFormatting,
    metadata: {
      mergedCells: mergeMaps.ranges.length,
      styledCells,
      formulaCells,
      conditionalRules: conditionalFormatting.length,
      conditionalMatches
    }
  };
};

export const parseXlsxEntriesToPreview = ({ binaryEntries = new Map(), document, entries }) => {
  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml") || "");
  const workbookSettings = parseWorkbookSettings(entries);
  const workbookStyles = parseCellStyles(entries.get("xl/styles.xml") || "", workbookSettings.date1904);
  const workbookSheets = parseWorkbookSheets(entries).slice(0, XLSX_PREVIEW_LIMITS.maxSheets);
  const sheets = workbookSheets.map((sheet) => {
    const preview = parseWorksheet(entries.get(sheet.entryPath) || "", sharedStrings, workbookStyles, entries, binaryEntries, sheet);
    return {
      name: sheet.name,
      ...preview
    };
  });

  return {
    document,
    supported: true,
    sheets,
    limits: XLSX_PREVIEW_LIMITS,
    metadata: sheets.reduce(
      (totals, sheet) => ({
        mergedCells: totals.mergedCells + (sheet.metadata?.mergedCells || 0),
        styledCells: totals.styledCells + (sheet.metadata?.styledCells || 0),
        formulaCells: totals.formulaCells + (sheet.metadata?.formulaCells || 0),
        conditionalRules: totals.conditionalRules + (sheet.metadata?.conditionalRules || 0)
        ,
        conditionalMatches: totals.conditionalMatches + (sheet.metadata?.conditionalMatches || 0)
      }),
      { mergedCells: 0, styledCells: 0, formulaCells: 0, conditionalRules: 0, conditionalMatches: 0 }
    )
  };
};
