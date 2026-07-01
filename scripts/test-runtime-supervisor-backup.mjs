import fs from "fs";
import os from "os";
import path from "path";
import { createRuntimeSupervisor } from "../server/core/runtimeSupervisor.js";

const assert = (condition, message, evidence = {}) => {
  if (condition) return;
  const error = new Error(message);
  error.evidence = evidence;
  throw error;
};

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
};

const writeText = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mhchub-runtime-backup-"));
const dataDir = path.join(tempDir, "data");
const backupDir = path.join(dataDir, "backups");
const uploadDir = path.join(tempDir, "uploads");
const previewDir = path.join(tempDir, "previews");
const activityFile = path.join(dataDir, "activity.json");
const configFile = path.join(dataDir, "config.json");
const docsFile = path.join(dataDir, "documents.json");

writeJson(configFile, { utilityLinks: [], departments: [], safetyActions: [], safetyBulletins: [] });
writeJson(docsFile, [{ id: "doc-test", fileName: "doc-test.xlsx", previewFileName: "doc-test.pdf" }]);
writeText(path.join(uploadDir, "doc-test.xlsx"), "spreadsheet source");
writeText(path.join(uploadDir, "nested", "extra.txt"), "nested upload");
writeText(path.join(previewDir, "doc-test.pdf"), "preview source");

const supervisor = createRuntimeSupervisor({
  activityFile,
  backupDir,
  configFile,
  docsFile,
  previewDir,
  uploadDir
});

const manifest = supervisor.createBackup("runtime-backup-regression");
const backupPath = path.join(backupDir, manifest.id);
const manifestPath = path.join(backupPath, "manifest.json");
const savedManifest = readJson(manifestPath);

const expectedPaths = [
  "config.json",
  "documents.json",
  path.join("uploads", "doc-test.xlsx"),
  path.join("uploads", "nested", "extra.txt"),
  path.join("previews", "doc-test.pdf")
];

for (const relativePath of expectedPaths) {
  const targetPath = path.join(backupPath, relativePath);
  assert(fs.existsSync(targetPath), "Runtime backup is missing an expected file", {
    relativePath,
    targetPath,
    manifest: savedManifest
  });
}

const uploadsDetail = savedManifest.details?.find((item) => item.name === "uploads/");
const previewsDetail = savedManifest.details?.find((item) => item.name === "previews/");
assert(savedManifest.copied?.includes("config.json"), "Backup manifest is missing config.json", { savedManifest });
assert(savedManifest.copied?.includes("documents.json"), "Backup manifest is missing documents.json", { savedManifest });
assert(savedManifest.copied?.includes("uploads/"), "Backup manifest is missing uploads/", { savedManifest });
assert(savedManifest.copied?.includes("previews/"), "Backup manifest is missing previews/", { savedManifest });
assert(uploadsDetail?.files === 2, "Backup manifest has wrong upload file count", { uploadsDetail });
assert(previewsDetail?.files === 1, "Backup manifest has wrong preview file count", { previewsDetail });

const status = supervisor.getStatus({
  config: { utilityLinks: [], departments: [], safetyActions: [], safetyBulletins: [] },
  summary: {},
  documentCount: 1,
  environment: { allowedOrigins: ["http://localhost:3333"] }
});
assert(status.readiness.checks.some((item) => item.id === "previews" && item.ok), "Runtime status does not check previews/", {
  checks: status.readiness.checks
});
assert(status.counts.uploadedFiles === 2, "Runtime status has wrong upload count", { counts: status.counts });
assert(status.counts.previewFiles === 1, "Runtime status has wrong preview count", { counts: status.counts });

console.log(
  JSON.stringify(
    {
      ok: true,
      tempDir,
      backupPath,
      copied: savedManifest.copied,
      details: savedManifest.details,
      counts: status.counts
    },
    null,
    2
  )
);
