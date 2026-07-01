import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createXlsxPreview } from "../server/core/xlsxPreview.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[＆]/g, "&")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const assert = (condition, message, evidence = {}) => {
  if (condition) return;
  const error = new Error(message);
  error.evidence = evidence;
  throw error;
};

const sourceDir = path.join(rootDir, "setup", "Tai lieu");
if (!fs.existsSync(sourceDir)) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        skipped: true,
        reason: "Safety meeting workbook fixture directory was not found",
        sourceDir
      },
      null,
      2
    )
  );
  process.exit(0);
}

const workbookName = fs
  .readdirSync(sourceDir)
  .find((item) => item.includes("(V2)") && item.toLowerCase().endsWith(".xlsx"));

if (!workbookName) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        skipped: true,
        reason: "Safety meeting V2 workbook fixture was not found",
        sourceDir
      },
      null,
      2
    )
  );
  process.exit(0);
}

assert(Boolean(workbookName), "Safety meeting V2 workbook was not found", { sourceDir });

const workbookPath = path.join(sourceDir, workbookName);
const preview = createXlsxPreview({
  filePath: workbookPath,
  document: { title: workbookName }
});
const sheet = preview.sheets.find((item) => item.name === "VN");

assert(Boolean(sheet), "VN sheet was not parsed", { sheets: preview.sheets.map((item) => item.name) });
assert(sheet.metadata?.mergedCells === 23, "Unexpected merged-cell count in VN sheet", {
  expected: 23,
  actual: sheet.metadata?.mergedCells
});

const cellValue = (rowNumber, columnIndex) => {
  const row = sheet.rows.find((item) => item.number === rowNumber);
  assert(Boolean(row), `Row ${rowNumber} was not parsed`);
  return row.values[columnIndex] || "";
};

const expectCellIncludes = (rowNumber, columnIndex, needles) => {
  const value = cellValue(rowNumber, columnIndex);
  const normalizedValue = normalizeText(value);
  const missing = needles.filter((needle) => !normalizedValue.includes(normalizeText(needle)));
  assert(missing.length === 0, `Cell ${rowNumber}:${columnIndex} is missing expected text`, {
    rowNumber,
    columnIndex,
    missing,
    valuePreview: String(value).slice(0, 220)
  });
};

const expectBlank = (rowNumber, columnIndex) => {
  const value = cellValue(rowNumber, columnIndex);
  assert(String(value).trim() === "", `Cell ${rowNumber}:${columnIndex} should be blank`, {
    rowNumber,
    columnIndex,
    value
  });
};

const noLeakedSharedStringIndexes = [8, 9, 10, 13, 14, 15, 16, 17, 28, 29, 30, 35, 37, 39].map((rowNumber) => ({
  rowNumber,
  a: cellValue(rowNumber, 0),
  b: cellValue(rowNumber, 1),
  c: cellValue(rowNumber, 2)
}));

for (const row of noLeakedSharedStringIndexes) {
  assert(!/^\d+$/.test(String(row.a).trim()), "Merged column A leaked a shared-string index", row);
  assert(!/^\d+$/.test(String(row.b).trim()), "Merged column B leaked a shared-string index", row);
  assert(!/^\d+$/.test(String(row.c).trim()), "Detail column C leaked a shared-string index", row);
}

expectBlank(8, 0);
expectBlank(8, 1);
expectCellIncludes(8, 2, ["Nha may PY2", "72 truong hop", "20,8%"]);
expectCellIncludes(9, 2, ["Kham suc khoe", "39 truong hop", "Ykao"]);
expectCellIncludes(10, 2, ["khoi ED", "bieu do so sanh", "bat thuong"]);
expectCellIncludes(13, 2, ["GD Nakamura", "cong viec khong thuong xuyen", "TBM"]);
expectCellIncludes(17, 2, ["MANI", "MYL", "Hanaoka", "axit phosphoric"]);
expectCellIncludes(29, 2, ["dao tao", "3 lop", "thang 6 va thang 7/2026"]);
expectCellIncludes(35, 2, ["So muc chi ra ra 7", "da khac phuc 7", "chua khac phuc 0"]);
expectCellIncludes(37, 2, ["set danh", "EBM", "PGD Hung"]);
expectCellIncludes(39, 2, ["Day deo the", "van hanh may", "GA"]);

console.log(
  JSON.stringify(
    {
      ok: true,
      workbookPath,
      sheet: sheet.name,
      mergedCells: sheet.metadata?.mergedCells,
      checkedRows: noLeakedSharedStringIndexes.map((item) => item.rowNumber)
    },
    null,
    2
  )
);
