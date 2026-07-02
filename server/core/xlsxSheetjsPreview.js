import fs from "fs";
import path from "path";
import XLSX from "xlsx";

const DEFAULT_COL_WIDTH_PX = 80;
const DEFAULT_ROW_HEIGHT_PX = 20;
const CHAR_WIDTH_PX = 7;

const escapeHtml = (str) =>
  String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const rgbToHex = (rgb) => {
  if (!rgb) return "";
  const clean = String(rgb).replace(/^FF/i, "");
  return clean.length === 6 ? `#${clean}` : "";
};

const themeColors = [
  "#FFFFFF", "#000000", "#E7E6E6", "#44546A", "#4472C4", "#ED7D31",
  "#A5A5A5", "#FFC000", "#4472C4", "#ED7D31"
];

const resolveColor = (colorObj) => {
  if (!colorObj) return "";
  if (colorObj.rgb) return rgbToHex(colorObj.rgb);
  if (colorObj.theme !== undefined) return themeColors[colorObj.theme] || "";
  return "";
};

const borderCss = (border) => {
  if (!border) return {};
  const css = {};
  const mapStyle = (s) => {
    if (!s) return "";
    if (s === "thin") return "1px solid";
    if (s === "medium") return "2px solid";
    if (s === "thick") return "3px solid";
    if (s === "dashed") return "1px dashed";
    if (s === "dotted") return "1px dotted";
    if (s === "double") return "3px double";
    return "1px solid";
  };
  for (const side of ["top", "bottom", "left", "right"]) {
    const b = border[side];
    if (b && b.style) {
      const color = resolveColor(b.color) || "#000000";
      css[`border-${side}`] = `${mapStyle(b.style)} ${color}`;
    }
  }
  return css;
};

const cellStyleToCss = (style, numFmt) => {
  if (!style) return "";
  const css = {};

  if (style.fill) {
    const fg = resolveColor(style.fill.fgColor);
    if (fg && fg !== "#FFFFFF" && fg !== "#000000") css["background-color"] = fg;
  }

  if (style.font) {
    const f = style.font;
    const color = resolveColor(f.color);
    if (color) css["color"] = color;
    if (f.bold) css["font-weight"] = "bold";
    if (f.italic) css["font-style"] = "italic";
    if (f.underline) css["text-decoration"] = "underline";
    if (f.sz) css["font-size"] = `${Math.round(f.sz * 1.33)}px`;
    if (f.name) css["font-family"] = `"${f.name}", sans-serif`;
  }

  if (style.alignment) {
    const a = style.alignment;
    if (a.horizontal) {
      const hMap = { center: "center", right: "right", left: "left", fill: "left", justify: "justify", distributed: "center" };
      css["text-align"] = hMap[a.horizontal] || "left";
    }
    if (a.vertical) {
      const vMap = { top: "top", center: "middle", bottom: "bottom", distributed: "middle" };
      css["vertical-align"] = vMap[a.vertical] || "bottom";
    }
    if (a.wrapText) css["white-space"] = "pre-wrap";
  }

  const borders = borderCss(style.border);
  Object.assign(css, borders);

  return Object.entries(css)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
};

const formatCellValue = (cell, numFmts) => {
  if (!cell) return "";
  if (cell.t === "e") return cell.w || "";

  if (cell.w !== undefined && cell.w !== null && String(cell.w).trim() !== "") {
    return String(cell.w);
  }

  const v = cell.v;
  if (v === undefined || v === null) return "";

  if (cell.t === "b") return v ? "TRUE" : "FALSE";
  if (cell.t === "n") {
    const fmt = numFmts && cell.s !== undefined ? numFmts[cell.s] : null;
    if (fmt && (fmt.includes("d") || fmt.includes("m") || fmt.includes("y"))) {
      const date = XLSX.SSF.parse_date_code(v);
      if (date) {
        const pad = (n) => String(n).padStart(2, "0");
        return `${date.d}/${pad(date.m)}/${date.y}`;
      }
    }
    return String(v);
  }
  return String(v);
};

const parseMerges = (sheet) => {
  const merges = sheet["!merges"] || [];
  const spanMap = new Map();
  const hiddenMap = new Set();
  for (const m of merges) {
    const { s, e } = m;
    const key = XLSX.utils.encode_cell(s);
    const rs = e.r - s.r + 1;
    const cs = e.c - s.c + 1;
    spanMap.set(key, { rowspan: rs, colspan: cs });
    for (let r = s.r; r <= e.r; r++) {
      for (let c = s.c; c <= e.c; c++) {
        if (r !== s.r || c !== s.c) hiddenMap.add(XLSX.utils.encode_cell({ r, c }));
      }
    }
  }
  return { spanMap, hiddenMap };
};

const buildSheetHtml = (wb, sheetName) => {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return "<p>Không có dữ liệu</p>";

  const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
  if (!range) return "<p>Sheet trống</p>";

  const colInfo = sheet["!cols"] || [];
  const rowInfo = sheet["!rows"] || [];
  const { spanMap, hiddenMap } = parseMerges(sheet);

  const numFmts = {};
  if (wb.SSF) {
    Object.assign(numFmts, wb.SSF);
  }

  const colWidths = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const info = colInfo[c];
    const px = info ? (info.hidden ? 0 : Math.round((info.wch || info.width || 10) * CHAR_WIDTH_PX)) : DEFAULT_COL_WIDTH_PX;
    colWidths.push(px);
  }

  let html = `<table class="xl-sheet" style="border-collapse:collapse;table-layout:fixed;width:max-content;min-width:100%"><colgroup>`;
  for (const w of colWidths) {
    html += `<col style="width:${w}px">`;
  }
  html += `</colgroup><tbody>`;

  for (let r = range.s.r; r <= range.e.r; r++) {
    const rowMeta = rowInfo[r] || {};
    const rowH = rowMeta.hidden ? 0 : (rowMeta.hpt ? Math.round(rowMeta.hpt * 1.33) : DEFAULT_ROW_HEIGHT_PX);
    html += `<tr style="height:${rowH}px">`;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddr = XLSX.utils.encode_cell({ r, c });
      if (hiddenMap.has(cellAddr)) continue;

      const cell = sheet[cellAddr];
      const span = spanMap.get(cellAddr);
      const style = cell && cell.s ? cellStyleToCss(cell.s, numFmts) : "";
      const value = escapeHtml(formatCellValue(cell, numFmts));

      let tdAttrs = `style="padding:2px 4px;overflow:hidden;${style}"`;
      if (span) {
        if (span.rowspan > 1) tdAttrs += ` rowspan="${span.rowspan}"`;
        if (span.colspan > 1) tdAttrs += ` colspan="${span.colspan}"`;
      }

      html += `<td ${tdAttrs}>${value}</td>`;
    }
    html += `</tr>`;
  }

  html += `</tbody></table>`;
  return html;
};

const buildFullHtml = (wb) => {
  const sheetNames = wb.SheetNames || [];
  if (!sheetNames.length) return "<p>File không có sheet nào</p>";

  const tabs = sheetNames
    .map((name, i) => `<button class="tab${i === 0 ? " active" : ""}" data-idx="${i}" onclick="switchTab(${i})">${escapeHtml(name)}</button>`)
    .join("");

  const sheets = sheetNames.map((name) => buildSheetHtml(wb, name)).join("\n");
  const panels = sheetNames
    .map((_, i) => `<div class="panel${i === 0 ? "" : " hidden"}" id="panel-${i}"></div>`)
    .join("\n");

  const sheetDataJson = JSON.stringify(
    sheetNames.map((_, i) => `panel-${i}`)
  );

  const sheetsHtmlJson = JSON.stringify(
    sheetNames.map((name) => buildSheetHtml(wb, name))
  );

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Excel Preview</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Calibri","Segoe UI",Arial,sans-serif;font-size:12px;background:#f5f5f5}
.tabs{display:flex;flex-wrap:wrap;gap:2px;background:#d0d0d0;padding:4px 6px 0}
.tab{padding:5px 14px;border:1px solid #bbb;border-bottom:none;background:#e8e8e8;cursor:pointer;border-radius:3px 3px 0 0;font-size:12px}
.tab.active{background:#fff;border-bottom:1px solid #fff;margin-bottom:-1px;z-index:1;position:relative}
.sheet-area{background:#fff;border:1px solid #ccc;overflow:auto;padding:4px}
.xl-sheet td{font-family:"Calibri","Segoe UI",Arial,sans-serif;font-size:12px;min-width:20px}
</style>
</head>
<body>
<div class="tabs">${tabs}</div>
<div class="sheet-area" id="sheet-area"></div>
<script>
var SHEETS=${sheetsHtmlJson};
var current=0;
function switchTab(idx){
  document.querySelectorAll('.tab').forEach(function(t,i){t.classList.toggle('active',i===idx)});
  document.getElementById('sheet-area').innerHTML=SHEETS[idx];
  current=idx;
}
switchTab(0);
</script>
</body>
</html>`;
};

export const generateXlsxHtmlPreview = ({ filePath, targetDir }) => {
  const wb = XLSX.readFile(filePath, {
    cellStyles: true,
    cellDates: false,
    cellHTML: false,
    cellNF: true
  });

  const html = buildFullHtml(wb);

  fs.mkdirSync(targetDir, { recursive: true });
  const outPath = path.join(targetDir, "preview.html");
  fs.writeFileSync(outPath, html, "utf8");
  return outPath;
};
