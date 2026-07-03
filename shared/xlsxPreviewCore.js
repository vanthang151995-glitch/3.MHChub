export function decodeXml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function parseXml(xml) {
  const result = {};
  const attrRegex = /([\w:]+)="([^"]*)"/g;
  const tagRegex = /<(\/?)([a-zA-Z][\w:]*)((?:\s+[\w:]+="[^"]*")*)\s*(\/?)>/g;

  let match;
  const stack = [result];
  let current = result;

  while ((match = tagRegex.exec(xml)) !== null) {
    const [, closing, tag, attrs, selfClose] = match;
    if (closing) {
      stack.pop();
      current = stack[stack.length - 1];
    } else {
      const node = { _attrs: {}, _children: [], _text: "" };
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrs)) !== null) {
        node._attrs[attrMatch[1]] = attrMatch[2];
      }
      attrRegex.lastIndex = 0;
      if (!current._children) current._children = [];
      if (!current[tag]) current[tag] = [];
      current[tag].push(node);
      current._children.push({ tag, node });
      if (!selfClose) {
        stack.push(current);
        current = node;
      }
    }
  }

  return result;
}

function extractSharedStrings(xml) {
  if (!xml) return [];
  const strings = [];
  const siRegex = /<si>([\s\S]*?)<\/si>/g;
  let siMatch;
  while ((siMatch = siRegex.exec(xml)) !== null) {
    const siContent = siMatch[1];
    const parts = [];
    const tRegex = /<t(?:\s[^>]*)?>([^<]*)<\/t>/g;
    let tMatch;
    while ((tMatch = tRegex.exec(siContent)) !== null) {
      parts.push(decodeXml(tMatch[1]));
    }
    strings.push(parts.join(""));
  }
  return strings;
}

function extractSheetNames(workbookXml) {
  if (!workbookXml) return [];
  const names = [];
  const sheetRegex = /<sheet\s[^>]*name="([^"]*)"[^>]*\/>/g;
  let m;
  while ((m = sheetRegex.exec(workbookXml)) !== null) {
    names.push(decodeXml(m[1]));
  }
  return names;
}

function extractMerges(sheetXml) {
  if (!sheetXml) return [];
  const merges = [];
  const mergeRegex = /<mergeCell\s+ref="([^"]+)"\s*\/>/g;
  let m;
  while ((m = mergeRegex.exec(sheetXml)) !== null) {
    merges.push(m[1]);
  }
  return merges;
}

function colLetterToIndex(col) {
  let index = 0;
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + (col.charCodeAt(i) - 64);
  }
  return index - 1;
}

function parseRef(ref) {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  return { col: colLetterToIndex(m[1]), row: parseInt(m[2], 10) - 1 };
}

function numToColLetter(n) {
  let s = "";
  n += 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function parseSheetData(sheetXml, sharedStrings) {
  if (!sheetXml) return { rows: [], columns: [] };

  const rows = [];
  let maxCol = 0;

  const rowRegex = /<row\s[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowIndex = parseInt(rowMatch[1], 10) - 1;
    const rowContent = rowMatch[2];
    const cells = [];

    const cellRegex = /<c\s([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const cellAttrs = cellMatch[1];
      const cellContent = cellMatch[2];

      const refMatch = cellAttrs.match(/r="([A-Z]+\d+)"/);
      const typeMatch = cellAttrs.match(/t="([^"]*)"/);
      if (!refMatch) continue;

      const pos = parseRef(refMatch[1]);
      if (!pos) continue;
      if (pos.col > maxCol) maxCol = pos.col;

      const vMatch = cellContent.match(/<v>([^<]*)<\/v>/);
      const fMatch = cellContent.match(/<f[^>]*>([^<]*)<\/f>/);
      const isMatch = cellContent.match(/<is>([\s\S]*?)<\/is>/);

      let value = "";
      let formula = null;
      let isFormula = false;

      if (fMatch) {
        formula = decodeXml(fMatch[1]);
        isFormula = true;
      }

      const type = typeMatch ? typeMatch[1] : "";
      if (isMatch) {
        const tRegex = /<t[^>]*>([^<]*)<\/t>/g;
        const parts = [];
        let tm;
        while ((tm = tRegex.exec(isMatch[1])) !== null) parts.push(decodeXml(tm[1]));
        value = parts.join("");
      } else if (vMatch) {
        const raw = decodeXml(vMatch[1]);
        if (type === "s") {
          value = sharedStrings[parseInt(raw, 10)] || "";
        } else if (type === "b") {
          value = raw === "1" ? true : false;
        } else {
          const num = parseFloat(raw);
          value = isNaN(num) ? raw : num;
        }
      }

      while (cells.length <= pos.col) cells.push({ value: "" });
      cells[pos.col] = { value, ...(isFormula ? { formula, isFormula: true } : {}) };
    }

    while (rows.length <= rowIndex) rows.push(null);
    rows[rowIndex] = { cells, values: cells.map((c) => (c ? c.value : "")) };
  }

  const filledRows = rows.map((r) => r || { cells: [], values: [] });

  const columns = [];
  for (let i = 0; i <= maxCol; i++) {
    columns.push(numToColLetter(i));
  }

  return { rows: filledRows, columns };
}

export function parseXlsxEntriesToPreview({ entries, document: doc } = {}) {
  try {
    if (!entries || entries.size === 0) {
      return { document: doc, supported: false, reason: "Empty XLSX file" };
    }

    const sharedStringsXml = entries.get("xl/sharedStrings.xml") || "";
    const workbookXml = entries.get("xl/workbook.xml") || "";
    const sharedStrings = extractSharedStrings(sharedStringsXml);
    const sheetNames = extractSheetNames(workbookXml);

    const sheets = [];
    let sheetIndex = 1;
    while (true) {
      const key = `xl/worksheets/sheet${sheetIndex}.xml`;
      const sheetXml = entries.get(key);
      if (!sheetXml) break;

      const { rows, columns } = parseSheetData(sheetXml, sharedStrings);
      const merges = extractMerges(sheetXml);
      const name = sheetNames[sheetIndex - 1] || `Sheet${sheetIndex}`;

      sheets.push({ name, rows, columns, merges });
      sheetIndex++;
    }

    if (!sheets.length) {
      return { document: doc, supported: false, reason: "No sheets found in XLSX" };
    }

    return { document: doc, supported: true, sheets };
  } catch (err) {
    return { document: doc, supported: false, reason: err.message || "Failed to parse XLSX" };
  }
}
