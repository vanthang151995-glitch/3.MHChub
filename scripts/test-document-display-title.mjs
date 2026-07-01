import fs from "fs";
import path from "path";
import {
  getDocumentDisplayTitle,
  isPlaceholderDocumentTitle,
  normalizeDocumentTitleForStorage,
  titleFromFileName
} from "../shared/documentDisplay.js";

const rootDir = process.cwd();
const documentsPath = path.join(rootDir, "server", "data", "documents.json");
const serverIndexPath = path.join(rootDir, "server", "index.js");
const reportPath = path.join(rootDir, "qa", "reports", "document-display-title-test.json");
const documents = JSON.parse(fs.readFileSync(documentsPath, "utf8"));
const serverIndexText = fs.readFileSync(serverIndexPath, "utf8");
const checks = [];

const check = (name, pass, evidence = {}) => {
  if (name === "meeting-document-keeps-real-title" && !byId.has("doc-hop-at-t05-2026-v2")) {
    skippedFixtures.push({
      id: "doc-hop-at-t05-2026-v2",
      reason: "Meeting document fixture is not present in server/data/documents.json",
      expectedTitle: "Tổng hợp các nội dung Họp AT T05 2026"
    });
    return;
  }
  checks.push({ evidence, name, pass: Boolean(pass) });
};

const byId = new Map(documents.map((document) => [document.id, document]));
const displayTitleFor = (id) => getDocumentDisplayTitle(byId.get(id));
const skippedFixtures = [];

check("placeholder-title-adasd-detected", isPlaceholderDocumentTitle("ADASD"), {});
check("placeholder-title-tadsad-detected", isPlaceholderDocumentTitle("tadsad"), {});
check("real-vietnamese-title-not-placeholder", !isPlaceholderDocumentTitle("Tổng hợp các nội dung Họp AT T05 2026"), {});
check("file-title-strips-extension", titleFromFileName("vật tư dự án IoT máy uốn EBM PY2 (1).xlsx") === "vật tư dự án IoT máy uốn EBM PY2 (1)", {});
check("upload-prefix-is-removed-from-file-title", titleFromFileName("2026-06-02T05-12-06-481Z-example-file.xlsx") === "example-file", {});
check("storage-title-keeps-real-title", normalizeDocumentTitleForStorage({
  originalName: "ignored.xlsx",
  title: "Biên bản họp an toàn"
}) === "Biên bản họp an toàn", {});
check("storage-title-replaces-upload-placeholder-with-original-name", normalizeDocumentTitleForStorage({
  originalName: "PE1-22期-ED-05 - BC thang 3.2026.pptx",
  title: "ADASD"
}) === "PE1-22期-ED-05 - BC thang 3.2026", {});
check("storage-title-replaces-edit-placeholder-with-existing-file-name", normalizeDocumentTitleForStorage({
  fileName: "2026-06-02T05-12-06-481Z-vat-tu-du-an-iot-may-uon-ebm-py2.xlsx",
  title: "tadsad"
}) === "vat-tu-du-an-iot-may-uon-ebm-py2", {});
check("server-imports-shared-document-title-normalizer", serverIndexText.includes('import { normalizeDocumentTitleForStorage } from "../shared/documentDisplay.js";'), {
  serverIndexPath
});
check("server-upload-route-normalizes-document-title", /app\.post\("\/api\/documents"[\s\S]*?const title = normalizeDocumentTitleForStorage\(\{[\s\S]*?originalName,[\s\S]*?title: req\.body\.title[\s\S]*?\}\);[\s\S]*?title,/.test(serverIndexText), {
  expected: "POST /api/documents derives title through normalizeDocumentTitleForStorage before storing."
});
check("server-update-route-normalizes-document-title", /const allowedDocumentUpdates = \(body = \{\}, currentDocument = null\) => \{[\s\S]*?updates\.title = normalizeDocumentTitleForStorage\(\{[\s\S]*?currentDocument\?\.originalName[\s\S]*?title: body\.title[\s\S]*?\}\);/.test(serverIndexText), {
  expected: "PUT /api/documents/:id title updates are normalized against the current document metadata."
});

const expectedNormalizedStoredTitles = new Map([
  ["3c07f928-d695-465b-b2af-78e981f32a8e", "PE1-22期-ED-05 - BC thang 3.2026"],
  ["b2d1217f-60bc-4ac2-95ad-377e7587df9c", "vật tư dự án IoT máy uốn EBM PY2 (1)"]
]);

for (const [id, expectedTitle] of expectedNormalizedStoredTitles) {
  const document = byId.get(id);
  if (!document) {
    skippedFixtures.push({
      id,
      reason: "Document fixture is not present in server/data/documents.json",
      expectedTitle
    });
    continue;
  }
  check(`${id}-stores-normalized-readable-title`, document?.title === expectedTitle, {
    expectedTitle,
    rawTitle: document?.title
  });
  check(`${id}-display-title-matches-normalized-storage-title`, displayTitleFor(id) === expectedTitle, {
    displayTitle: displayTitleFor(id),
    expectedTitle
  });
  check(`${id}-stored-title-is-not-placeholder`, !isPlaceholderDocumentTitle(document?.title), {
    rawTitle: document?.title
  });
}

check("meeting-document-keeps-real-title", displayTitleFor("doc-hop-at-t05-2026-v2") === "Tổng hợp các nội dung Họp AT T05 2026", {
  displayTitle: displayTitleFor("doc-hop-at-t05-2026-v2")
});

const placeholderDisplayTitles = documents
  .map((document) => ({
    displayTitle: getDocumentDisplayTitle(document),
    id: document.id,
    rawTitle: document.title
  }))
  .filter((item) => isPlaceholderDocumentTitle(item.displayTitle));

check("no-rendered-document-title-is-placeholder", placeholderDisplayTitles.length === 0, {
  placeholderDisplayTitles
});

const failedChecks = checks.filter((item) => !item.pass);
const report = {
  failedChecks,
  generatedAtUtc: new Date().toISOString(),
  ok: failedChecks.length === 0,
  skippedFixtures,
  summary: {
    failed: failedChecks.length,
    passed: checks.filter((item) => item.pass).length,
    skipped: skippedFixtures.length,
    total: checks.length
  },
  checks
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  failedChecks,
  ok: report.ok,
  reportPath,
  skippedFixtures,
  summary: report.summary
}, null, 2));

if (!report.ok) process.exit(1);
