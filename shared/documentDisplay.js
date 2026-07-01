const PLACEHOLDER_TITLES = new Set([
  "adasd",
  "asdf",
  "asd",
  "demo",
  "document",
  "file",
  "new document",
  "sample",
  "tadsad",
  "test",
  "title",
  "untitled"
]);

const cleanText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const localizedText = (value, lang = "vi") => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const safeLang = ["vi", "en", "ja"].includes(lang) ? lang : "vi";
  return cleanText(value[safeLang]) || cleanText(value.vi) || cleanText(value.en) || cleanText(value.ja);
};

export function isPlaceholderDocumentTitle(title) {
  const normalized = cleanText(title).normalize("NFKC").toLowerCase();
  if (!normalized) return true;
  if (PLACEHOLDER_TITLES.has(normalized)) return true;
  if (/^(a+|x+|z+|\d+)$/.test(normalized) && normalized.length <= 10) return true;
  return false;
}

export function titleFromFileName(fileName) {
  const cleaned = cleanText(fileName);
  if (!cleaned) return "";

  const withoutExtension = cleaned.replace(/\.[a-z0-9]{1,8}$/i, "");
  const withoutUploadPrefix = withoutExtension.replace(/^\d{4}-\d{2}-\d{2}t\d{2}-\d{2}-\d{2}-\d{3}z[-_ ]*/i, "");
  return cleanText(withoutUploadPrefix.replace(/[_]+/g, " "));
}

export function getDocumentDisplayTitle(document, fallback = "Document", lang = "vi") {
  const localizedTitle = localizedText(document?.titleI18n, lang);
  if (!isPlaceholderDocumentTitle(localizedTitle)) return localizedTitle;

  const title = cleanText(document?.title);
  if (!isPlaceholderDocumentTitle(title)) return title;

  const originalTitle = titleFromFileName(document?.originalName);
  if (originalTitle) return originalTitle;

  const fileTitle = titleFromFileName(document?.fileName);
  if (fileTitle) return fileTitle;

  return title || fallback;
}

export function normalizeDocumentTitleForStorage({ fileName = "", fallback = "Document", originalName = "", title = "" } = {}) {
  const candidate = cleanText(title);
  if (!isPlaceholderDocumentTitle(candidate)) return candidate;

  const originalTitle = titleFromFileName(originalName);
  if (originalTitle) return originalTitle;

  const fileTitle = titleFromFileName(fileName);
  if (fileTitle) return fileTitle;

  return candidate || fallback;
}
