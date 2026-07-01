import {
  allowedDocumentUploadExtensions,
  forbiddenDocumentUploadExtensions,
  isAllowedDocumentUpload
} from "../server/core/documentUploadPolicy.js";

const checks = [];

const addCheck = (name, pass, evidence = {}) => {
  checks.push({ name, pass: Boolean(pass), evidence });
};

const validCases = [
  ["pdf", "report.pdf", "application/pdf"],
  ["docx", "procedure.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xlsx", "audit.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["pptx", "training.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ["png", "photo.png", "image/png"],
  ["csv", "export.csv", "text/csv"],
  ["txt", "notes.txt", "text/plain"]
];

const invalidCases = [
  ["exe", "tool.exe", "application/x-msdownload"],
  ["powershell", "script.ps1", "text/plain"],
  ["javascript", "payload.js", "application/javascript"],
  ["html", "preview.html", "text/html"],
  ["svg", "image.svg", "image/svg+xml"],
  ["zip", "archive.zip", "application/zip"],
  ["mime-mismatch", "report.pdf", "text/plain"],
  ["extension-mismatch", "report.txt", "application/pdf"],
  ["no-extension", "document", "application/pdf"]
];

for (const [label, originalname, mimetype] of validCases) {
  addCheck(`upload-policy-allows-${label}`, isAllowedDocumentUpload({ originalname, mimetype }), {
    extension: originalname.slice(originalname.lastIndexOf(".")),
    mimetype
  });
}

for (const [label, originalname, mimetype] of invalidCases) {
  addCheck(`upload-policy-rejects-${label}`, !isAllowedDocumentUpload({ originalname, mimetype }), {
    originalname,
    mimetype
  });
}

const forbiddenAllowed = forbiddenDocumentUploadExtensions.filter((extension) =>
  allowedDocumentUploadExtensions.includes(extension)
);
addCheck("upload-policy-has-supported-document-set", allowedDocumentUploadExtensions.length >= 16, {
  allowedDocumentUploadExtensions
});
addCheck("upload-policy-forbidden-extensions-not-allowed", forbiddenAllowed.length === 0, {
  forbiddenAllowed
});

const failedChecks = checks.filter((check) => !check.pass);
const report = {
  ok: failedChecks.length === 0,
  summary: {
    total: checks.length,
    passed: checks.length - failedChecks.length,
    failed: failedChecks.length
  },
  allowedExtensionCount: allowedDocumentUploadExtensions.length,
  forbiddenExtensionCount: forbiddenDocumentUploadExtensions.length,
  failedChecks,
  checks
};

console.log(JSON.stringify(report, null, 2));

if (!report.ok) process.exit(1);
