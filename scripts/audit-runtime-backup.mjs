import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const reportsDir = path.join(rootDir, "qa", "reports");
const reportPath = path.join(reportsDir, "runtime-backup-audit.json");

const backupDir = path.join(rootDir, "server", "data", "backups");
const docsFile = path.join(rootDir, "server", "data", "documents.json");
const uploadDir = path.join(rootDir, "server", "uploads");
const previewDir = path.join(rootDir, "server", "previews");

const checks = [];

const addCheck = (name, pass, evidence = {}) => {
  checks.push({ name, pass: Boolean(pass), evidence });
};

const readJson = (filePath, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
};

const isInside = (parent, child) => {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const fileSize = (filePath) => {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() ? stat.size : null;
  } catch {
    return null;
  }
};

const safeLabel = (value) => String(value || "unknown").replace(/[^a-zA-Z0-9._-]+/g, "-");

const listBackups = () => {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const backupPath = path.join(backupDir, entry.name);
      const manifestPath = path.join(backupPath, "manifest.json");
      return {
        id: entry.name,
        backupPath,
        manifestPath,
        manifest: readJson(manifestPath, null)
      };
    })
    .sort((a, b) =>
      String(b.manifest?.createdAt || b.manifest?.id || b.id).localeCompare(
        String(a.manifest?.createdAt || a.manifest?.id || a.id)
      )
    );
};

const currentDocuments = readJson(docsFile, []);
const backups = listBackups();
const latest = backups[0] || null;
const latestDocumentsPath = latest ? path.join(latest.backupPath, "documents.json") : "";
const latestDocuments = latestDocumentsPath ? readJson(latestDocumentsPath, []) : [];
const currentIds = new Set(Array.isArray(currentDocuments) ? currentDocuments.map((item) => item.id) : []);
const backupIds = new Set(Array.isArray(latestDocuments) ? latestDocuments.map((item) => item.id) : []);
const missingCurrentIdsInBackup = [...currentIds].filter((id) => !backupIds.has(id));

addCheck("backup-dir-exists", fs.existsSync(backupDir), { backupDir });
addCheck("backup-dir-has-at-least-one-backup", backups.length > 0, { count: backups.length });
addCheck("latest-backup-has-manifest", Boolean(latest?.manifest), { manifestPath: latest?.manifestPath || "" });
addCheck("latest-backup-has-config-json", Boolean(latest && fs.existsSync(path.join(latest.backupPath, "config.json"))), {
  backupPath: latest?.backupPath || ""
});
addCheck("latest-backup-has-documents-json", Boolean(latest && fs.existsSync(latestDocumentsPath)), {
  latestDocumentsPath
});
addCheck("latest-backup-documents-json-is-array", Array.isArray(latestDocuments), {
  latestDocumentsPath
});
addCheck("latest-backup-documents-cover-current-ids", missingCurrentIdsInBackup.length === 0, {
  currentCount: currentIds.size,
  backupCount: backupIds.size,
  missingCurrentIdsInBackup
});
addCheck("latest-backup-manifest-lists-uploads", Boolean(latest?.manifest?.copied?.includes("uploads/")), {
  copied: latest?.manifest?.copied || []
});
addCheck("latest-backup-manifest-lists-previews", Boolean(latest?.manifest?.copied?.includes("previews/")), {
  copied: latest?.manifest?.copied || []
});

const uploadedDocuments = Array.isArray(currentDocuments)
  ? currentDocuments.filter((document) => document.fileName || document.url)
  : [];
const previewDocuments = uploadedDocuments.filter((document) => document.previewStatus === "ready" && document.previewFileName);

for (const document of uploadedDocuments) {
  const label = safeLabel(document.id);
  const fileName = String(document.fileName || "");
  const currentPath = path.resolve(uploadDir, fileName);
  const backupPath = latest ? path.resolve(latest.backupPath, "uploads", fileName) : "";
  const currentSize = fileSize(currentPath);
  const backupSize = backupPath ? fileSize(backupPath) : null;

  addCheck(`backup-document-${label}-upload-path-safe`, fileName === path.basename(fileName) && isInside(uploadDir, currentPath), {
    fileName
  });
  addCheck(`backup-document-${label}-upload-exists`, backupSize !== null, {
    backupPath,
    currentPath
  });
  addCheck(`backup-document-${label}-upload-size-matches`, backupSize !== null && backupSize === currentSize && backupSize === Number(document.size || 0), {
    metadataSize: Number(document.size || 0),
    currentSize,
    backupSize
  });
}

for (const document of previewDocuments) {
  const label = safeLabel(document.id);
  const previewFileName = String(document.previewFileName || "");
  const currentPath = path.resolve(previewDir, previewFileName);
  const backupPath = latest ? path.resolve(latest.backupPath, "previews", previewFileName) : "";
  const currentSize = fileSize(currentPath);
  const backupSize = backupPath ? fileSize(backupPath) : null;

  addCheck(
    `backup-document-${label}-preview-path-safe`,
    previewFileName === path.basename(previewFileName) && isInside(previewDir, currentPath),
    {
      previewFileName
    }
  );
  addCheck(`backup-document-${label}-preview-exists`, backupSize !== null, {
    backupPath,
    currentPath
  });
  addCheck(
    `backup-document-${label}-preview-size-matches`,
    backupSize !== null && backupSize === currentSize && backupSize === Number(document.previewSize || 0),
    {
      metadataSize: Number(document.previewSize || 0),
      currentSize,
      backupSize
    }
  );
}

const failedChecks = checks.filter((check) => !check.pass);
const report = {
  generatedAtUtc: new Date().toISOString(),
  ok: failedChecks.length === 0,
  reportPath: path.relative(rootDir, reportPath).replace(/\\/g, "/"),
  backupDir,
  latestBackup: latest
    ? {
        id: latest.id,
        backupPath: latest.backupPath,
        createdAt: latest.manifest?.createdAt || null,
        copied: latest.manifest?.copied || []
      }
    : null,
  counts: {
    backups: backups.length,
    currentDocuments: Array.isArray(currentDocuments) ? currentDocuments.length : 0,
    backupDocuments: Array.isArray(latestDocuments) ? latestDocuments.length : 0,
    uploadedDocuments: uploadedDocuments.length,
    previewDocuments: previewDocuments.length
  },
  summary: {
    total: checks.length,
    passed: checks.length - failedChecks.length,
    failed: failedChecks.length
  },
  failedChecks,
  checks
};

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

if (failedChecks.length) {
  process.exit(1);
}
