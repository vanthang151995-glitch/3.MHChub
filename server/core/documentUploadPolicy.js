import path from "path";

export const allowedDocumentUploadTypes = new Map([
  [".pdf", new Set(["application/pdf"])],
  [".doc", new Set(["application/msword"])],
  [".docx", new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"])],
  [".xls", new Set(["application/vnd.ms-excel"])],
  [".xlsx", new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"])],
  [".ppt", new Set(["application/vnd.ms-powerpoint"])],
  [".pptx", new Set(["application/vnd.openxmlformats-officedocument.presentationml.presentation"])],
  [".odt", new Set(["application/vnd.oasis.opendocument.text"])],
  [".ods", new Set(["application/vnd.oasis.opendocument.spreadsheet"])],
  [".odp", new Set(["application/vnd.oasis.opendocument.presentation"])],
  [".rtf", new Set(["application/rtf", "text/rtf"])],
  [".png", new Set(["image/png"])],
  [".jpg", new Set(["image/jpeg"])],
  [".jpeg", new Set(["image/jpeg"])],
  [".txt", new Set(["text/plain"])],
  [".csv", new Set(["text/csv", "application/vnd.ms-excel", "text/plain"])]
]);

export const allowedDocumentUploadExtensions = [...allowedDocumentUploadTypes.keys()].sort();

export const forbiddenDocumentUploadExtensions = [
  ".7z",
  ".bat",
  ".cmd",
  ".com",
  ".dll",
  ".exe",
  ".hta",
  ".html",
  ".jar",
  ".js",
  ".lnk",
  ".msi",
  ".ps1",
  ".rar",
  ".sh",
  ".svg",
  ".vbs",
  ".zip"
];

export const isAllowedDocumentUpload = (file = {}) => {
  const ext = path.extname(String(file.originalname || file.name || "")).toLowerCase();
  const mimeType = String(file.mimetype || file.mimeType || "").toLowerCase();
  const allowedMimeTypes = allowedDocumentUploadTypes.get(ext);
  return Boolean(allowedMimeTypes && allowedMimeTypes.has(mimeType));
};
