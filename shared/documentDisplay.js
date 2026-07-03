const PLACEHOLDER_PATTERNS = [
  /^document$/i,
  /^untitled$/i,
  /^no[\s_-]?title$/i,
  /^unknown$/i,
  /^\s*$/
];

export function isPlaceholderDocumentTitle(title) {
  if (!title) return true;
  const trimmed = String(title).trim();
  if (!trimmed) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(trimmed));
}

export function titleFromFileName(fileName) {
  if (!fileName) return "";
  const base = String(fileName).replace(/\.[^.]+$/, "");
  return base.replace(/[-_]+/g, " ").trim();
}

export function getDocumentDisplayTitle(document, fallback, _lang) {
  if (!document) return fallback || "Document";
  const title = document.title;
  if (title && !isPlaceholderDocumentTitle(title)) return title;
  const fromFile = titleFromFileName(document.originalName || document.fileName);
  if (fromFile) return fromFile;
  return fallback || "Document";
}

export function normalizeDocumentTitleForStorage({ title, fileName, originalName, fallback } = {}) {
  const raw = title ? String(title).trim() : "";
  if (raw && !isPlaceholderDocumentTitle(raw)) return raw;
  const fromFile = titleFromFileName(originalName || fileName);
  if (fromFile) return fromFile;
  return fallback || titleFromFileName(fileName) || "Document";
}
