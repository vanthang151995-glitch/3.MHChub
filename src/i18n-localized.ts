export const CONTENT_LANGUAGES = ["vi", "en", "ja"] as const;

export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];
export type LocalizedText = Record<ContentLanguage, string>;

export const emptyLocalizedText = (): LocalizedText => ({ vi: "", en: "", ja: "" });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const normalizeLocalizedText = (value: unknown, fallback = ""): LocalizedText => {
  const result = emptyLocalizedText();
  const fallbackText = String(fallback ?? "").trim();

  if (value === undefined || value === null || value === "") {
    result.vi = fallbackText;
    return result;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      result.vi = fallbackText;
      return result;
    }
    if (trimmed.startsWith("{")) {
      try {
        return normalizeLocalizedText(JSON.parse(trimmed), fallbackText);
      } catch {
        result.vi = trimmed;
        return result;
      }
    }
    result.vi = trimmed;
    return result;
  }

  if (isRecord(value)) {
    for (const lang of CONTENT_LANGUAGES) {
      result[lang] = String(value[lang] ?? "");
    }
    if (!result.vi) result.vi = fallbackText;
    return result;
  }

  result.vi = String(value ?? fallbackText).trim();
  return result;
};

export const localizedText = (value: unknown, lang: unknown = "vi", fallback = ""): string => {
  const normalized = normalizeLocalizedText(value, fallback);
  const safeLang = CONTENT_LANGUAGES.includes(lang as ContentLanguage) ? (lang as ContentLanguage) : "vi";
  return normalized[safeLang] || normalized.vi || fallback || "";
};
