import ExcelJS from "exceljs";

function argbToHex(argb) {
  if (!argb || argb.length < 6) return null;
  const hex = argb.slice(-6).toUpperCase();
  if (hex === "FFFFFF" || hex === "000000") return null;
  return `#${hex}`;
}

function argbToHexRaw(argb) {
  if (!argb || argb.length < 6) return null;
  return `#${argb.slice(-6).toUpperCase()}`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function borderSide(side) {
  if (!side?.style) return null;
  const w = side.style === "hair" ? "1px"
    : side.style === "thin" ? "1px"
    : side.style === "medium" ? "2px"
    : side.style === "thick" ? "3px"
    : side.style === "double" ? "3px"
    : "1px";
  const styleType = side.style === "double" ? "double" : "solid";
  const color = argbToHexRaw(side.color?.argb) || "#999999";
  return `${w} ${styleType} ${color}`;
}

function renderSheet(worksheet, options = {}) {
  const { fontScale = 0.75, defaultColWidth = 90 } = options;

  const mergedCells = new Set();
  const mergeMap = new Map();

  worksheet.mergeCells && worksheet.model?.merges?.forEach?.((range) => {
    const decoded = worksheet.workbook?.model ? null : null;
    return;
  });

  const actualMerges = worksheet._merges ?? {};
  Object.keys(actualMerges).forEach((key) => {
    const m = actualMerges[key];
    if (!m) return;
    const master = m.master;
    if (master) {
      mergedCells.add(key);
    }
  });

  const rows = [];
  let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;

  worksheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum < minRow) minRow = rowNum;
    if (rowNum > maxRow) maxRow = rowNum;
    row.eachCell({ includeEmpty: false }, (_cell, colNum) => {
      if (colNum < minCol) minCol = colNum;
      if (colNum > maxCol) maxCol = colNum;
    });
  });

  if (minRow === Infinity) {
    return "<p style='padding:32px;color:#94a3b8;text-align:center;font-family:sans-serif'>Sheet này không có dữ liệu.</p>";
  }

  const mergeSpan = new Map();
  const mergeHide = new Set();

  worksheet.model?.merges?.forEach?.((rangeStr) => {
    const [tl, br] = rangeStr.split(":");
    if (!tl || !br) return;
    const tlCell = worksheet.getCell(tl);
    const brCell = worksheet.getCell(br);
    const cs = brCell.col - tlCell.col + 1;
    const rs = brCell.row - tlCell.row + 1;
    mergeSpan.set(`${tlCell.row}_${tlCell.col}`, { cs, rs });
    for (let r = tlCell.row; r <= brCell.row; r++) {
      for (let c = tlCell.col; c <= brCell.col; c++) {
        if (r !== tlCell.row || c !== tlCell.col) {
          mergeHide.add(`${r}_${c}`);
        }
      }
    }
  });

  let colgroup = '<colgroup><col style="width:44px">';
  for (let c = minCol; c <= maxCol; c++) {
    const col = worksheet.getColumn(c);
    let w = defaultColWidth;
    if (col.hidden) { w = 0; }
    else if (col.width) { w = Math.round(col.width * 7); }
    colgroup += `<col style="width:${w}px">`;
  }
  colgroup += "</colgroup>";

  const alpha = (n) => {
    let s = "";
    while (n > 0) {
      s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };

  let header = '<thead><tr class="col-hdr"><th class="corner"></th>';
  for (let c = minCol; c <= maxCol; c++) {
    header += `<th>${alpha(c)}</th>`;
  }
  header += "</tr></thead>";

  let body = "<tbody>";
  for (let r = minRow; r <= maxRow; r++) {
    const row = worksheet.getRow(r);
    const rh = row.hidden ? ' style="display:none"' : row.height ? ` style="height:${Math.round(row.height * 1.33)}px"` : "";
    body += `<tr${rh}><td class="rnum">${r}</td>`;

    for (let c = minCol; c <= maxCol; c++) {
      const key = `${r}_${c}`;
      if (mergeHide.has(key)) continue;

      const cell = worksheet.getCell(r, c);
      const span = mergeSpan.get(key);
      const csAttr = span && span.cs > 1 ? ` colspan="${span.cs}"` : "";
      const rsAttr = span && span.rs > 1 ? ` rowspan="${span.rs}"` : "";

      let display = "";
      if (cell.value !== null && cell.value !== undefined) {
        if (typeof cell.value === "object") {
          if (cell.value instanceof Date) {
            display = cell.value.toLocaleDateString("vi-VN");
          } else if (cell.value.richText) {
            display = cell.value.richText.map((rt) => rt.text || "").join("");
          } else if (cell.value.result !== undefined) {
            display = String(cell.value.result ?? "");
          } else if (cell.value.text !== undefined) {
            display = String(cell.value.text || "");
          } else {
            display = String(cell.value);
          }
        } else {
          display = cell.text ?? String(cell.value);
        }
      }

      const styles = [];

      const fill = cell.fill;
      if (fill && fill.type === "pattern" && fill.pattern !== "none") {
        const bg = argbToHex(fill.fgColor?.argb);
        if (bg) styles.push(`background:${bg}`);
      }

      const font = cell.font || {};
      if (font.bold) styles.push("font-weight:700");
      if (font.italic) styles.push("font-style:italic");
      if (font.underline) styles.push("text-decoration:underline");
      const fc = argbToHex(font.color?.argb);
      if (fc) styles.push(`color:${fc}`);
      if (font.size) styles.push(`font-size:${Math.max(9, Math.round(font.size * fontScale))}px`);
      if (font.name) styles.push(`font-family:"${font.name}",Arial,sans-serif`);

      const align = cell.alignment || {};
      const ha = align.horizontal;
      if (ha) styles.push(`text-align:${ha === "centerContinuous" ? "center" : ha}`);
      const va = align.vertical;
      if (va === "middle") styles.push("vertical-align:middle");
      else if (va === "top") styles.push("vertical-align:top");
      if (align.wrapText) styles.push("white-space:pre-wrap;overflow:visible;text-overflow:clip");

      const border = cell.border || {};
      const bl = borderSide(border.left);   if (bl) styles.push(`border-left:${bl}`);
      const br2 = borderSide(border.right);  if (br2) styles.push(`border-right:${br2}`);
      const bt = borderSide(border.top);    if (bt) styles.push(`border-top:${bt}`);
      const bb = borderSide(border.bottom); if (bb) styles.push(`border-bottom:${bb}`);

      const styleAttr = styles.length ? ` style="${styles.join(";")}"` : "";
      const titleAttr = display ? ` title="${esc(display)}"` : "";
      body += `<td${csAttr}${rsAttr}${styleAttr}${titleAttr}>${esc(display)}</td>`;
    }
    body += "</tr>";
  }
  body += "</tbody>";

  return `<table>${colgroup}${header}${body}</table>`;
}

export async function xlsxToHtml(buffer, sheetName) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
  if (!ws) throw new Error(`Sheet "${sheetName}" không tồn tại.`);

  const html = renderSheet(ws);
  const allSheets = wb.worksheets.map((s) => s.name);
  return { html, allSheets };
}
