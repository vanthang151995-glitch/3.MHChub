import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createXlsxPreview } from "../server/core/xlsxPreview.js";
import { mojibakeScore } from "../server/core/textEncoding.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const verboseConsole = process.argv.includes("--verbose-source");

const readArg = (name, fallback = "") => {
  const index = process.argv.lastIndexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
};

const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[＆]/g, "&")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const compactText = (value) => String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim();

const badEncodingTokens = [
  ["Nguy", "n"].join("?"),
  String.fromCodePoint(0xfffd),
  String.fromCodePoint(0x76fb),
  String.fromCodePoint(0x862f),
  String.fromCodePoint(0xff83),
  String.fromCodePoint(0x9edb)
];

const encodingEvidence = (value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return {
    score: mojibakeScore(text),
    badTokens: badEncodingTokens.filter((token) => text.includes(token))
  };
};

const hasCleanEncoding = (value) => {
  const evidence = encodingEvidence(value);
  return evidence.score === 0 && evidence.badTokens.length === 0;
};

const sha256File = (filePath) =>
  crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

const defaultWorkbookBaseline = {
  fileName: "Tổng hợp các nội dung Họp AT T05 2026 (V2).xlsx",
  sizeBytes: 72181,
  sha256: "de9a0bf0e45a1256fb87c17bdb06c02af549163c00aafde57f4a475d63c02f6d"
};

const requestedSourceArg = readArg("--source", "");
const reportDir = path.resolve(rootDir, readArg("--report-dir", path.join("qa", "reports")));
const reportJsonPath = path.join(reportDir, "safety-meeting-source-audit.json");
const reportMarkdownPath = path.join(reportDir, "safety-meeting-source-audit.md");
const reportFullTextPath = path.join(reportDir, "safety-meeting-source-fulltext.md");

const writeSkippedReportAndExit = (reason, evidence = {}) => {
  const generatedAtUtc = new Date().toISOString();
  const report = {
    ok: true,
    skipped: true,
    generatedAtUtc,
    reason,
    evidence,
    summary: {
      total: 0,
      passed: 0,
      failed: 0
    },
    failedChecks: []
  };
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    reportMarkdownPath,
    [`# Safety Meeting Source Audit`, "", `Skipped: ${reason}`, "", "```json", JSON.stringify(evidence, null, 2), "```", ""].join("\n"),
    "utf8"
  );
  fs.writeFileSync(reportFullTextPath, `Safety meeting source audit skipped: ${reason}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
};

const findWorkbook = () => {
  const requested = requestedSourceArg;
  if (requested) return path.isAbsolute(requested) ? requested : path.resolve(rootDir, requested);

  const sourceDir = path.join(rootDir, "setup", "Tai lieu");
  if (!fs.existsSync(sourceDir)) {
    writeSkippedReportAndExit("Default safety meeting workbook fixture directory was not found", { sourceDir });
  }
  const fileName = fs
    .readdirSync(sourceDir)
    .find((item) => item.includes("(V2)") && item.toLowerCase().endsWith(".xlsx"));
  if (!fileName) {
    writeSkippedReportAndExit("Default safety meeting V2 workbook fixture was not found", { sourceDir });
  }
  return path.join(sourceDir, fileName);
};

const targetBulletinId = readArg("--bulletin", "bulletin-safety-meeting-2026-05");
const workbookPath = findWorkbook();
const configPath = path.join(rootDir, "server", "data", "config.json");
const expectedFileName = readArg(
  "--expect-file-name",
  process.env.EXPECTED_SAFETY_SOURCE_FILE_NAME || (requestedSourceArg ? "" : defaultWorkbookBaseline.fileName)
);
const expectedSizeBytes = Number(
  readArg(
    "--expect-size-bytes",
    process.env.EXPECTED_SAFETY_SOURCE_SIZE_BYTES || (requestedSourceArg ? "0" : String(defaultWorkbookBaseline.sizeBytes))
  )
);
const expectedSha256 = readArg(
  "--expect-sha256",
  process.env.EXPECTED_SAFETY_SOURCE_SHA256 || (requestedSourceArg ? "" : defaultWorkbookBaseline.sha256)
);
const workbookStat = fs.existsSync(workbookPath) ? fs.statSync(workbookPath) : null;
const workbookMetadata = {
  path: workbookPath,
  fileName: path.basename(workbookPath),
  sizeBytes: workbookStat?.size ?? 0,
  modifiedAtUtc: workbookStat ? workbookStat.mtime.toISOString() : "",
  sha256: workbookStat ? sha256File(workbookPath) : ""
};

const preview = createXlsxPreview({
  filePath: workbookPath,
  document: { title: path.basename(workbookPath) }
});
const sheet = preview.sheets.find((item) => item.name === "VN");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const bulletin = (Array.isArray(config.safetyBulletins) ? config.safetyBulletins : []).find((item) => item.id === targetBulletinId);
const bulletinPoints = Array.isArray(bulletin?.points?.vi) ? bulletin.points.vi : [];
const bulletinText = normalizeText(bulletinPoints.join("\n"));

const rowText = (row) => compactText([row.stt, row.topic, row.detail, row.note].filter(Boolean).join(" "));

const sourceRows = sheet
  ? sheet.rows
      .filter((row) => row.number >= 7 && row.number <= 41)
      .map((row) => ({
        row: row.number,
        stt: compactText(row.values[0]),
        topic: compactText(row.values[1]),
        detail: compactText(row.values[2]),
        note: compactText(row.values[3])
      }))
      .filter((row) => rowText(row))
  : [];

const sourceByRow = new Map(sourceRows.map((row) => [row.row, row]));

const expectations = [
  {
    row: 7,
    label: "Y tế PY",
    source: ["Nhà máy PY", "50 trường hợp", "32%"],
    bulletin: ["Y tế PY", "50", "hô hấp 32%", "ngón 5"]
  },
  {
    row: 8,
    label: "Y tế PY2",
    source: ["Nhà máy PY2", "72 trường hợp", "20,8%"],
    bulletin: ["Y tế PY2", "72", "20,8%"]
  },
  {
    row: 9,
    label: "Khám bổ sung bệnh nghề nghiệp",
    source: ["39 trường hợp", "05/05/2026", "Ykao"],
    bulletin: ["Khám bổ sung BNN", "39", "Ykao"]
  },
  {
    row: 10,
    label: "Ý kiến khối ED về báo cáo y tế",
    source: ["khối ED", "biểu đồ so sánh", "bất thường"],
    bulletin: ["Báo cáo y tế", "khối ED", "biểu đồ", "bác sĩ", "phức tạp", "điều kiện hạn chế"]
  },
  {
    row: 11,
    label: "Cận nguy GA",
    source: ["cận nguy", "Ngày 3/4", "tủ điện", "link quy định"],
    bulletin: ["Cận nguy GA", "03/04", "tủ điện", "link"]
  },
  {
    row: 12,
    label: "TNLĐ MT và MS1/PY2",
    source: ["Phạm Hồng Hạnh", "Nguyễn Văn Long", "5/5/2026"],
    bulletin: ["Phạm Hồng Hạnh", "Nguyễn Văn Long", "MS1/PY2"]
  },
  {
    row: 13,
    label: "Chỉ đạo GĐ Nakamura",
    source: ["GĐ Nakamura", "công việc không thường xuyên", "TBM"],
    bulletin: ["GĐ Nakamura", "công việc không thường xuyên", "TBM"]
  },
  {
    row: 14,
    label: "Lan tỏa văn hóa an toàn",
    source: ["văn hóa an toàn", "16, 19", "TBP"],
    bulletin: ["Văn hóa an toàn", "16, 19, 20/05", "TBP"]
  },
  {
    row: 15,
    label: "Ý kiến PGĐ Hùng về cảnh báo an toàn",
    source: ["PGĐ Hùng", "cảnh báo an toàn", "QA"],
    bulletin: ["PGĐ Hùng", "thiếu cảnh báo", "QA"]
  },
  {
    row: 16,
    label: "Ý kiến OK2 về cống thoát nước mưa",
    source: ["Quản đốc Lụa", "cống thoát nước mưa"],
    bulletin: ["Ý kiến OK2", "cống thoát nước mưa"]
  },
  {
    row: 17,
    label: "Chia sẻ tai nạn MANI/MYL và cận nguy Hanaoka",
    source: ["MANI", "MYL", "Hanaoka", "axit phosphoric"],
    bulletin: ["MANI", "MYL", "Hanaoka", "axit phosphoric", "1 mm", "4 tháng"]
  },
  {
    row: 18,
    label: "Tai nạn giao thông",
    source: ["không xảy ra tai nạn giao thông"],
    bulletin: ["không xảy ra tai nạn giao thông"]
  },
  {
    row: 19,
    label: "Kiểm tra phương tiện đi lại",
    source: ["không phát hiện", "phương tiện"],
    bulletin: ["không phát hiện", "phương tiện"]
  },
  {
    row: 20,
    label: "Cải tiến an toàn 6S",
    source: ["27/05/2026", "29/05/2026", "hộp kỹ thuật"],
    bulletin: ["27/05", "29/05", "hộp kỹ thuật"]
  },
  {
    row: 21,
    label: "Đào tạo ATVSLĐ",
    source: ["Chuyển đổi văn hóa an toàn", "16, 19&20/05/2026", "EHS, OS"],
    bulletin: ["chuyển đổi văn hóa an toàn", "trưởng bộ phận", "EHS và OS"]
  },
  {
    row: 22,
    label: "Văn bản EHS",
    source: ["QC-04-01", "EHS-QT-06", "EHS-QT-15", "TBM"],
    bulletin: ["QC-04-01", "EHS-QT-06", "EHS-QT-08", "EHS-QT-12", "EHS-QT-15", "TBM"]
  },
  {
    row: 23,
    label: "PCCC",
    source: ["21/05/2026", "báo cháy", "10 số điện thoại"],
    bulletin: ["21/05", "báo cháy", "10 số"]
  },
  {
    row: 24,
    label: "Đánh giá rủi ro ATVSLĐ",
    source: ["4, 5, 6/2026", "Murai", "Ishida"],
    bulletin: ["04-06/2026", "Murai", "Ishida"]
  },
  {
    row: 25,
    label: "Tiến độ đánh giá rủi ro",
    source: ["khối ED", "đôn đốc", "EHS cần"],
    bulletin: ["đôn đốc", "EHS kiểm tra tiến độ"]
  },
  {
    row: 26,
    label: "Duy trì kiểm tra an toàn 6S",
    source: ["nhà vệ sinh", "hàng ngày"],
    bulletin: ["nhà vệ sinh", "hàng ngày"]
  },
  {
    row: 27,
    label: "An toàn hóa chất định kỳ",
    source: ["san chiết", "SA", "SDS"],
    bulletin: ["san chiết", "SA", "SDS"]
  },
  {
    row: 28,
    label: "Bồn rửa mắt",
    source: ["bồn rửa mắt", "nước sạch", "bàn giao"],
    bulletin: ["bồn rửa mắt", "nước RO", "bàn giao", "PC giao hàng"]
  },
  {
    row: 29,
    label: "Kế hoạch đào tạo hóa chất tháng 6-7",
    source: ["đào tạo", "3 lớp", "tháng 6 và tháng 7/2026"],
    bulletin: ["đào tạo", "3 lớp", "tháng 6-7"]
  },
  {
    row: 30,
    label: "Quản lý môi trường",
    source: ["QCVN 40:2011", "QCVN 14:2008", "TSS", "quan trắc"],
    bulletin: ["QCVN 40:2011", "QCVN 14:2008", "TSS", "quan trắc"]
  },
  {
    row: 31,
    label: "Đào tạo hóa chất/môi trường OS",
    source: ["Về Đào tạo", "Không thực hiện"],
    bulletin: ["Đào tạo hóa chất/môi trường OS", "không thực hiện"]
  },
  {
    row: 32,
    label: "Quy trình OS",
    source: ["OS-QT-01", "tháng 8/2026", "OS-QT-02"],
    bulletin: ["OS-QT-01", "08/2026", "OS-QT-02"]
  },
  {
    row: 33,
    label: "Medline 12/2025",
    source: ["Medline", "EHS & SP", "CR3", "kiểm định"],
    bulletin: ["Medline", "EHS & SP", "CR3", "kiểm định"]
  },
  {
    row: 34,
    label: "Báo cáo AT-PCCC-6S dòng 6/6/0",
    source: ["Số mục chỉ ra ra 6", "đã khắc phục 6", "chưa khắc phục 0"],
    bulletin: ["6/6/0"]
  },
  {
    row: 35,
    label: "Báo cáo AT-PCCC-6S dòng 7/7/0",
    source: ["Số mục chỉ ra ra 7", "đã khắc phục 7", "chưa khắc phục 0"],
    bulletin: ["7/7/0", "cần xác nhận lại nhãn"]
  },
  {
    row: 36,
    label: "Tiểu ban ATVSLĐ",
    source: ["QAD", "PED", "DD", "ED"],
    bulletin: ["QAD", "PED", "DD", "ED"]
  },
  {
    row: 37,
    label: "Sét đánh EBM",
    source: ["sét đánh", "EBM", "PGĐ Hùng"],
    bulletin: ["sét đánh", "EBM", "PGĐ Hùng"]
  },
  {
    row: 38,
    label: "Bấm móng tay",
    source: ["bấm móng tay", "nhà vệ sinh", "con lăn dính"],
    bulletin: ["bấm móng tay", "nhà vệ sinh", "con lăn dính"]
  },
  {
    row: 39,
    label: "Dây đeo thẻ",
    source: ["Dây đeo thẻ", "vận hành máy", "GA"],
    bulletin: ["Dây đeo thẻ", "vận hành máy", "GA"]
  },
  {
    row: 40,
    label: "Lịch họp tháng 06/2026",
    source: ["23/06/2026", "PY2", "Teams"],
    bulletin: ["23/06/2026", "PY2", "Teams"]
  },
  {
    row: 41,
    label: "Bắt buộc phổ biến",
    source: ["toàn thể CB CNV", "checklist kiểm tra an toàn"],
    bulletin: ["Bắt buộc phổ biến", "CBCNV", "checklist"]
  }
];

const includesAll = (haystack, needles = []) => {
  const normalized = normalizeText(haystack);
  const missing = needles.filter((needle) => !normalized.includes(normalizeText(needle)));
  return { pass: missing.length === 0, missing };
};

const checks = [];
const addCheck = (name, pass, evidence = {}) => {
  checks.push({ name, pass: Boolean(pass), evidence });
};

const singleLine = (value) => compactText(value).replace(/\|/g, "\\|");
const statusText = (pass) => (pass ? "PASS" : "FAIL");

const renderMarkdownReport = (report) => {
  const rowLines = report.coverage
    .map((item) => {
      const missingSource = item.missingInSource.length ? item.missingInSource.join(", ") : "None";
      const missingBulletin = item.missingInBulletin.length ? item.missingInBulletin.join(", ") : "None";
      return [
        `### Row ${item.row} - ${item.label}`,
        "",
        `| Check | Result | Missing |`,
        `| --- | --- | --- |`,
        `| Source readable | ${statusText(item.sourcePass)} | ${singleLine(missingSource)} |`,
        `| Bulletin coverage | ${statusText(item.bulletinPass)} | ${singleLine(missingBulletin)} |`,
        "",
        "Source text read from Excel:",
        "",
        `> ${singleLine(item.sourceText)}`,
        "",
        "Expected source tokens:",
        "",
        item.expectedSourceTokens.map((token) => `- ${token}`).join("\n"),
        "",
        "Expected bulletin tokens:",
        "",
        item.expectedBulletinTokens.map((token) => `- ${token}`).join("\n")
      ].join("\n");
    })
    .join("\n\n");

  return [
    "# Safety Meeting Source Audit",
    "",
    `- Generated UTC: ${report.generatedAtUtc}`,
    `- Workbook: ${report.workbookPath}`,
    `- Workbook file: ${report.workbook.fileName}`,
    `- Workbook size: ${report.workbook.sizeBytes} bytes`,
    `- Workbook modified UTC: ${report.workbook.modifiedAtUtc}`,
    `- Workbook SHA-256: ${report.workbook.sha256}`,
    `- Expected workbook file: ${report.workbookBaseline.expectedFileName || "Not enforced"}`,
    `- Expected workbook size: ${report.workbookBaseline.expectedSizeBytes || "Not enforced"}`,
    `- Expected workbook SHA-256: ${report.workbookBaseline.expectedSha256 || "Not enforced"}`,
    `- Sheet: ${report.source.sheet}`,
    `- Source rows: ${report.source.rows}`,
    `- Merged cells: ${report.source.mergedCells}`,
    `- Target bulletin: ${report.targetBulletinId}`,
    `- Bulletin VI points: ${report.bulletin.viPoints}`,
    `- Checks: ${report.summary.passed}/${report.summary.total} passed`,
    "",
    "## Row Coverage",
    "",
    rowLines
  ].join("\n");
};

const renderFullTextReport = (report) => {
  const rows = report.sourceRowExtracts
    .map((item) =>
      [
        `## Row ${item.row}`,
        "",
        `- STT: ${item.stt || "None"}`,
        `- Topic: ${item.topic || "None"}`,
        "",
        "Detail:",
        "",
        item.detail || "None",
        "",
        "Note:",
        "",
        item.note || "None",
        "",
        "Combined text:",
        "",
        item.text || "None"
      ].join("\n")
    )
    .join("\n\n");

  return [
    "# Safety Meeting Source Full Text",
    "",
    "This file is generated by the safety-source audit so merged Excel cells can be reviewed without relying on the web preview.",
    "",
    `- Generated UTC: ${report.generatedAtUtc}`,
    `- Workbook file: ${report.workbook.fileName}`,
    `- Workbook SHA-256: ${report.workbook.sha256}`,
    `- Sheet: ${report.source.sheet}`,
    `- Extracted source rows: ${report.sourceRowExtracts.length}`,
    `- Merged cells detected: ${report.source.mergedCells}`,
    `- Coverage checks: ${report.summary.passed}/${report.summary.total} passed`,
    "",
    rows
  ].join("\n");
};

const writeReportArtifacts = (report) => {
  fs.mkdirSync(reportDir, { recursive: true });
  const artifacts = {
    json: reportJsonPath,
    markdown: reportMarkdownPath,
    fullTextMarkdown: reportFullTextPath
  };
  const reportWithArtifacts = {
    ...report,
    artifacts
  };
  fs.writeFileSync(reportJsonPath, `${JSON.stringify(reportWithArtifacts, null, 2)}\n`, "utf8");
  fs.writeFileSync(reportMarkdownPath, `${renderMarkdownReport(reportWithArtifacts)}\n`, "utf8");
  fs.writeFileSync(reportFullTextPath, `${renderFullTextReport(reportWithArtifacts)}\n`, "utf8");
  return artifacts;
};

addCheck("source-workbook-exists", fs.existsSync(workbookPath), { workbookPath });
addCheck("source-workbook-file-name-baseline", !expectedFileName || workbookMetadata.fileName === expectedFileName, {
  expectedFileName,
  actualFileName: workbookMetadata.fileName,
  override: "--expect-file-name or EXPECTED_SAFETY_SOURCE_FILE_NAME"
});
addCheck("source-workbook-size-baseline", !expectedSizeBytes || workbookMetadata.sizeBytes === expectedSizeBytes, {
  expectedSizeBytes,
  actualSizeBytes: workbookMetadata.sizeBytes,
  override: "--expect-size-bytes or EXPECTED_SAFETY_SOURCE_SIZE_BYTES"
});
addCheck("source-workbook-sha256-baseline", !expectedSha256 || workbookMetadata.sha256 === expectedSha256, {
  expectedSha256,
  actualSha256: workbookMetadata.sha256,
  override: "--expect-sha256 or EXPECTED_SAFETY_SOURCE_SHA256"
});
addCheck("source-has-vn-sheet", Boolean(sheet), { sheets: preview.sheets.map((item) => item.name) });
addCheck("source-vn-merged-cell-count", sheet?.metadata?.mergedCells === 23, {
  expectedMergedCells: 23,
  actualMergedCells: sheet?.metadata?.mergedCells ?? 0
});
addCheck("source-vn-row-count", sourceRows.length === 35, { expectedRows: 35, actualRows: sourceRows.length });
addCheck("bulletin-exists", Boolean(bulletin), { targetBulletinId });
addCheck("bulletin-vi-point-count", bulletinPoints.length === 38, { expectedPoints: 38, actualPoints: bulletinPoints.length });

const sourceEncodingEvidence = encodingEvidence(sourceRows.map((row) => rowText(row)).join("\n"));
addCheck("source-rows-have-no-known-mojibake", hasCleanEncoding(sourceRows.map((row) => rowText(row)).join("\n")), {
  ...sourceEncodingEvidence,
  rowCount: sourceRows.length
});
const bulletinEncodingEvidence = encodingEvidence(bulletin);
addCheck("bulletin-record-has-no-known-mojibake", hasCleanEncoding(bulletin), {
  ...bulletinEncodingEvidence,
  targetBulletinId
});

const leakedSharedStringRows = sourceRows
  .filter((row) => row.row >= 7 && row.row <= 41)
  .filter((row) => /^\d+$/.test(row.detail) || (row.row > 7 && row.row <= 10 && /^\d+$/.test(row.stt)));
addCheck("source-parser-has-no-leaked-shared-string-indexes", leakedSharedStringRows.length === 0, {
  leakedRows: leakedSharedStringRows.map((row) => ({ row: row.row, stt: row.stt, detail: row.detail }))
});

const coverage = expectations.map((item) => {
  const sourceRow = sourceByRow.get(item.row);
  const sourceText = rowText(sourceRow || {});
  const sourceCheck = includesAll(sourceText, item.source);
  const bulletinCheck = includesAll(bulletinText, item.bulletin);
  return {
    row: item.row,
    label: item.label,
    sourcePass: Boolean(sourceRow) && sourceCheck.pass,
    bulletinPass: bulletinCheck.pass,
    expectedSourceTokens: item.source,
    expectedBulletinTokens: item.bulletin,
    missingInSource: sourceCheck.missing,
    missingInBulletin: bulletinCheck.missing,
    sourceText,
    sourcePreview: sourceText.slice(0, 180)
  };
});

for (const item of coverage) {
  addCheck(`source-row-${item.row}-${item.label}-readable`, item.sourcePass, {
    row: item.row,
    label: item.label,
    missingInSource: item.missingInSource,
    sourcePreview: item.sourcePreview
  });
  addCheck(`bulletin-covers-row-${item.row}-${item.label}`, item.bulletinPass, {
    row: item.row,
    label: item.label,
    missingInBulletin: item.missingInBulletin
  });
}

const failedChecks = checks.filter((check) => !check.pass);
const report = {
  generatedAtUtc: new Date().toISOString(),
  workbookPath,
  workbook: workbookMetadata,
  workbookBaseline: {
    expectedFileName,
    expectedSizeBytes,
    expectedSha256,
    enforced: Boolean(expectedFileName || expectedSizeBytes || expectedSha256),
    overrideArgs: ["--expect-file-name", "--expect-size-bytes", "--expect-sha256"],
    overrideEnv: [
      "EXPECTED_SAFETY_SOURCE_FILE_NAME",
      "EXPECTED_SAFETY_SOURCE_SIZE_BYTES",
      "EXPECTED_SAFETY_SOURCE_SHA256"
    ]
  },
  targetBulletinId,
  source: {
    sheet: sheet?.name || "",
    rows: sourceRows.length,
    mergedCells: sheet?.metadata?.mergedCells ?? 0
  },
  bulletin: {
    viPoints: bulletinPoints.length
  },
  sourceRowExtracts: sourceRows.map((row) => ({
    ...row,
    text: rowText(row)
  })),
  summary: {
    total: checks.length,
    passed: checks.length - failedChecks.length,
    failed: failedChecks.length
  },
  failedChecks,
  coverage
};

report.artifacts = writeReportArtifacts(report);

const consoleReport = {
  generatedAtUtc: report.generatedAtUtc,
  workbookPath: report.workbookPath,
  workbook: report.workbook,
  workbookBaseline: report.workbookBaseline,
  targetBulletinId: report.targetBulletinId,
  source: report.source,
  bulletin: report.bulletin,
  sourceRowExtracts: {
    count: report.sourceRowExtracts.length,
    fullTextMarkdown: report.artifacts.fullTextMarkdown
  },
  summary: report.summary,
  failedChecks: report.failedChecks,
  coverageSummary: {
    totalRows: report.coverage.length,
    sourcePassedRows: report.coverage.filter((item) => item.sourcePass).length,
    bulletinPassedRows: report.coverage.filter((item) => item.bulletinPass).length,
    failedRows: report.coverage
      .filter((item) => !item.sourcePass || !item.bulletinPass)
      .map(({ row, label, sourcePass, bulletinPass, missingInSource, missingInBulletin }) => ({
        row,
        label,
        sourcePass,
        bulletinPass,
        missingInSource,
        missingInBulletin
      }))
  },
  artifacts: report.artifacts
};

if (verboseConsole) {
  consoleReport.sourceRowExtracts.rows = report.sourceRowExtracts.map(({ detail, note, text, ...item }) => ({
    ...item,
    detailPreview: detail.slice(0, 180),
    notePreview: note.slice(0, 180),
    textPreview: text.slice(0, 180)
  }));
  consoleReport.coverage = report.coverage.map(({ sourceText, expectedSourceTokens, expectedBulletinTokens, ...item }) => item);
}

console.log(JSON.stringify(consoleReport, null, 2));

if (failedChecks.length) {
  process.exit(1);
}
