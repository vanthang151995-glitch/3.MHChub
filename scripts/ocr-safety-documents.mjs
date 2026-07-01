import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildSafetyDocumentManifestEntry,
  extractSafetyDocumentText,
  scanSafetyDocumentFiles
} from "../server/core/safetyDocumentIntelligence.js";
import { createMysqlSafetyArchitectureStore } from "../server/core/mysqlSafetyArchitectureStore.js";
import { loadLocalEnv } from "../server/loadEnv.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

loadLocalEnv(rootDir);

const args = process.argv.slice(2);
const getArg = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const hasArg = (name) => args.includes(`--${name}`);
const sourceRoot = getArg("source", "tai lieu");
const maxPages = Number(getArg("max-pages", "0"));
const languages = getArg("languages", "vie+eng");
const pageScale = Number(getArg("page-scale", "2"));
const updateDb = hasArg("update-db");
const pdfOnly = hasArg("pdf-only");
const outDir = path.resolve(rootDir, getArg("out", "output/safety-ocr"));
const textDir = path.join(outDir, "text");

await fs.promises.mkdir(textDir, { recursive: true });

const startedAt = Date.now();
const scan = await scanSafetyDocumentFiles({ rootDir, sourceRoot });
const files = pdfOnly ? scan.files.filter((file) => path.extname(file).toLowerCase() === ".pdf") : scan.files;

let store = null;
if (updateDb) {
  store = createMysqlSafetyArchitectureStore({ rootDir });
  if (!store) {
    console.error("MySQL safety architecture store is not configured. Cannot use --update-db.");
    process.exit(1);
  }
  await store.importDocumentManifest({ sourceRoot, dryRun: false }, {
    id: "script-safety-ocr",
    username: "script",
    displayName: "Safety OCR script",
    role: "ehs",
    departmentId: "EHS"
  });
}

const scriptActor = {
  id: "script-safety-ocr",
  username: "script",
  displayName: "Safety OCR script",
  role: "ehs",
  departmentId: "EHS"
};

const extractFromDatabase = async (entry) => {
  const payload = await store.runDocumentOcr(entry.id, scriptActor, { maxPages, languages, pageScale });
  if (!payload) throw new Error("Document not found after import");
  const chunks = payload.chunks.map((chunk) => ({
    sourcePage: chunk.sourcePage || "",
    text: chunk.text || "",
    chunkOffset: chunk.chunkIndex || 0,
    extractionMethod: chunk.extractionMethod || ""
  }));
  return {
    chunks,
    extractionMethod: chunks.find((chunk) => chunk.extractionMethod)?.extractionMethod || "database_ocr",
    ocrStatus: payload.document?.ocrStatus || chunks.find((chunk) => chunk.text)?.ocrStatus || "indexed",
    pageCount: null
  };
};

const report = {
  generatedAt: new Date().toISOString(),
  sourceRoot: path.relative(rootDir, scan.sourceRoot).replace(/\\/g, "/"),
  options: { languages, maxPages, pageScale, pdfOnly, updateDb },
  documents: []
};

for (const [fileIndex, filePath] of files.entries()) {
  const entry = await buildSafetyDocumentManifestEntry({ filePath, rootDir, sourceRoot: scan.sourceRoot });
  const label = path.relative(rootDir, filePath);
  console.log(`[${fileIndex + 1}/${files.length}] ${label}`);
  try {
    const extraction = updateDb && store
      ? await extractFromDatabase(entry)
      : await extractSafetyDocumentText(filePath, {
        ocr: true,
        maxOcrPages: maxPages,
        languages,
        pageScale
      });
    const fullText = extraction.chunks.map((chunk) => {
      const page = chunk.sourcePage ? `\n\n--- page ${chunk.sourcePage} ---\n` : "\n\n--- chunk ---\n";
      return `${page}${chunk.text}`;
    }).join("").trim();
    const textPath = path.join(textDir, `${entry.id}.txt`);
    await fs.promises.writeFile(
      textPath,
      [
        `Document: ${entry.originalName}`,
        `Source: ${label}`,
        `Category: ${entry.category}`,
        `Document type: ${entry.documentType}`,
        `OCR status: ${extraction.ocrStatus}`,
        `Extraction method: ${extraction.extractionMethod}`,
        "",
        fullText
      ].join("\n"),
      "utf8"
    );
    report.documents.push({
      id: entry.id,
      originalName: entry.originalName,
      relativePath: label.replace(/\\/g, "/"),
      category: entry.category,
      documentType: entry.documentType,
      scopeLevel: entry.scopeLevel,
      pageCount: extraction.pageCount || null,
      chunkCount: extraction.chunks.length,
      ocrStatus: extraction.ocrStatus,
      extractionMethod: extraction.extractionMethod,
      error: extraction.error || "",
      textPath: path.relative(rootDir, textPath).replace(/\\/g, "/"),
      sample: fullText.slice(0, 800)
    });
  } catch (error) {
    report.documents.push({
      id: entry.id,
      originalName: entry.originalName,
      relativePath: label.replace(/\\/g, "/"),
      category: entry.category,
      documentType: entry.documentType,
      scopeLevel: entry.scopeLevel,
      chunkCount: 0,
      ocrStatus: "failed",
      extractionMethod: "script",
      error: error.message,
      textPath: "",
      sample: ""
    });
  }
}

report.durationMs = Date.now() - startedAt;
report.stats = {
  total: report.documents.length,
  indexed: report.documents.filter((item) => item.ocrStatus === "indexed").length,
  failed: report.documents.filter((item) => item.ocrStatus === "failed").length,
  ocrRequired: report.documents.filter((item) => item.ocrStatus === "ocr_required").length,
  converterRequired: report.documents.filter((item) => item.ocrStatus === "converter_required").length,
  chunks: report.documents.reduce((sum, item) => sum + Number(item.chunkCount || 0), 0)
};

const reportPath = path.join(outDir, `manifest-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
await store?.close?.();

console.log(JSON.stringify({
  reportPath: path.relative(rootDir, reportPath).replace(/\\/g, "/"),
  durationMs: report.durationMs,
  stats: report.stats
}, null, 2));
