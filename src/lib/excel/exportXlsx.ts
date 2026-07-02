// Convert current Luckysheet workbook into a downloadable .xlsx file.
// Preserves: values, formulas, merges, column widths, row heights and basic styles
// (font family/size/bold/italic/color, fill, alignment, wrap).
import * as XLSX from "xlsx-js-style";

type AnyObj = Record<string, any>;

const toHex = (v: any): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^[0-9a-f]{8}$/i.test(s)) return s.slice(2).toUpperCase();
  return undefined;
};

const HALIGN: Record<number, string> = { 0: "center", 1: "left", 2: "right" };
const VALIGN: Record<number, string> = { 0: "center", 1: "top", 2: "bottom" };

function cellToSheetJS(cell: AnyObj) {
  const out: AnyObj = {};
  // value / formula
  if (cell.f) {
    out.f = String(cell.f).replace(/^=/, "");
    if (cell.v !== undefined && cell.v !== null) out.v = cell.v;
  } else if (cell.v !== undefined && cell.v !== null) {
    out.v = cell.v;
  } else if (cell.m !== undefined && cell.m !== null) {
    out.v = cell.m;
  }
  if (typeof out.v === "number") out.t = "n";
  else if (typeof out.v === "boolean") out.t = "b";
  else if (out.v !== undefined) {
    out.v = String(out.v);
    out.t = "s";
  }
  // styles
  const style: AnyObj = {};
  const font: AnyObj = {};
  if (cell.ff) font.name = String(cell.ff);
  if (cell.fs) font.sz = Number(cell.fs);
  if (cell.bl) font.bold = true;
  if (cell.it) font.italic = true;
  if (cell.un) font.underline = true;
  if (cell.cl) font.strike = true;
  const fc = toHex(cell.fc);
  if (fc) font.color = { rgb: fc };
  if (Object.keys(font).length) style.font = font;

  const bg = toHex(cell.bg);
  if (bg) style.fill = { patternType: "solid", fgColor: { rgb: bg } };

  const align: AnyObj = {};
  if (cell.ht !== undefined) align.horizontal = HALIGN[cell.ht];
  if (cell.vt !== undefined) align.vertical = VALIGN[cell.vt];
  if (cell.tb === "2") align.wrapText = true;
  if (typeof cell.tr === "number") align.textRotation = cell.tr;
  if (Object.keys(align).length) style.alignment = align;

  if (Object.keys(style).length) out.s = style;
  return out;
}

function buildWorkbook() {
  const ls: any = (window as any).luckysheet;
  if (!ls) throw new Error("Luckysheet chưa sẵn sàng");
  const files: AnyObj[] = ls.getluckysheetfile?.() || [];
  if (!files.length) throw new Error("Không có dữ liệu");

  const wb = XLSX.utils.book_new();

  for (const sheet of files) {
    const ws: AnyObj = {};
    let maxR = 0;
    let maxC = 0;

    const cells: Array<{ r: number; c: number; v: AnyObj }> = [];
    if (Array.isArray(sheet.celldata) && sheet.celldata.length) {
      for (const it of sheet.celldata) {
        if (!it || !it.v) continue;
        cells.push({ r: it.r, c: it.c, v: it.v });
      }
    } else if (Array.isArray(sheet.data)) {
      for (let r = 0; r < sheet.data.length; r++) {
        const row = sheet.data[r];
        if (!Array.isArray(row)) continue;
        for (let c = 0; c < row.length; c++) {
          const v = row[c];
          if (v && typeof v === "object") cells.push({ r, c, v });
        }
      }
    }

    for (const { r, c, v } of cells) {
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
      const addr = XLSX.utils.encode_cell({ r, c });
      const obj = cellToSheetJS(v);
      if (obj.v !== undefined || obj.f) ws[addr] = obj;
    }

    ws["!ref"] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: maxR, c: maxC },
    });

    const merges: AnyObj[] = [];
    const mergeCfg = sheet.config?.merge || {};
    for (const key of Object.keys(mergeCfg)) {
      const m = mergeCfg[key];
      merges.push({
        s: { r: m.r, c: m.c },
        e: { r: m.r + (m.rs || 1) - 1, c: m.c + (m.cs || 1) - 1 },
      });
    }
    if (merges.length) ws["!merges"] = merges;

    const cwCfg = sheet.config?.columnlen || {};
    const cols: AnyObj[] = [];
    for (let c = 0; c <= maxC; c++) {
      const px = cwCfg[c];
      cols.push(px ? { wpx: px } : { wpx: 73 });
    }
    ws["!cols"] = cols;

    const rhCfg = sheet.config?.rowlen || {};
    const rows: AnyObj[] = [];
    for (let r = 0; r <= maxR; r++) {
      const px = rhCfg[r];
      rows.push(px ? { hpx: px } : {});
    }
    ws["!rows"] = rows;

    let name = (sheet.name || `Sheet${wb.SheetNames.length + 1}`).slice(0, 31);
    name = name.replace(/[\\\/\?\*\[\]:]/g, "_");
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return wb;
}

export function exportLuckysheetToXlsx(filename = "export.xlsx") {
  const wb = buildWorkbook();
  XLSX.writeFile(wb, filename, { bookType: "xlsx", cellStyles: true });
}

export function buildLuckysheetXlsxBlob(): Blob {
  const wb = buildWorkbook();
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true }) as ArrayBuffer;
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
