export const SUPPORTED_CONTENT_LANGUAGES = ["vi", "en", "ja"];

const emptyLocalizedText = () => ({ vi: "", en: "", ja: "" });

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export const parseLocalizedText = (value, fallback = "") => {
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
        return parseLocalizedText(JSON.parse(trimmed), fallbackText);
      } catch {
        result.vi = trimmed;
        return result;
      }
    }
    result.vi = trimmed;
    return result;
  }

  if (isRecord(value)) {
    for (const lang of SUPPORTED_CONTENT_LANGUAGES) {
      result[lang] = String(value[lang] ?? "").trim();
    }
    if (!result.vi) result.vi = fallbackText;
    return result;
  }

  result.vi = String(value ?? fallbackText).trim();
  return result;
};

export const normalizeLocalizedText = (value, fallback = "") => parseLocalizedText(value, fallback);

export const localizedTextValue = (value, lang = "vi", fallback = "") => {
  const normalized = parseLocalizedText(value, fallback);
  const safeLang = SUPPORTED_CONTENT_LANGUAGES.includes(lang) ? lang : "vi";
  return normalized[safeLang] || normalized.vi || fallback || "";
};

export const localizedTextJson = (value, fallback = "") => {
  const normalized = parseLocalizedText(value, fallback);
  return JSON.stringify(normalized);
};

export const localizedTextJsonOrNull = (value, fallback = "") => {
  const normalized = parseLocalizedText(value, fallback);
  return normalized.vi || normalized.en || normalized.ja ? JSON.stringify(normalized) : null;
};

export const mergeLocalizedText = (nextValue, currentValue, fallback = "") => {
  if (nextValue === undefined) {
    return parseLocalizedText(currentValue, fallback);
  }
  const current = parseLocalizedText(currentValue, fallback);
  const next = parseLocalizedText(nextValue, current.vi || fallback);

  if (isRecord(nextValue)) {
    return {
      vi: next.vi || current.vi || String(fallback ?? "").trim(),
      en: next.en,
      ja: next.ja
    };
  }

  return {
    vi: next.vi || current.vi || String(fallback ?? "").trim(),
    en: current.en || next.en,
    ja: current.ja || next.ja
  };
};
