import { createContext, useContext } from "react";
import { dictionary } from "./i18n";

export type HubLanguage = "vi" | "en" | "ja";
export type TranslationParams = Record<string, string | number | null | undefined>;
export type HubTranslate = (key: string, params?: TranslationParams) => string;

export type HubLanguageContextValue = {
  lang: HubLanguage;
  setLang: (lang: HubLanguage) => void;
  t: HubTranslate;
};

export const supportedLanguages: HubLanguage[] = ["vi", "en", "ja"];

export function normalizeLanguage(value: unknown): HubLanguage {
  return supportedLanguages.includes(value as HubLanguage) ? (value as HubLanguage) : "vi";
}

export function interpolateText(template: string, params?: TranslationParams) {
  if (!params) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    const value = params[key];
    return value === null || value === undefined ? match : String(value);
  });
}

export function translateDictionary(lang: HubLanguage, key: string, params?: TranslationParams) {
  const normalized = normalizeLanguage(lang);
  const translations = dictionary as Record<HubLanguage, Record<string, string>>;
  const template = translations[normalized]?.[key] || translations.vi?.[key] || key;
  return interpolateText(template, params);
}

export const HubLanguageContext = createContext<HubLanguageContextValue>({
  lang: "vi",
  setLang: () => {},
  t: (key, params) => translateDictionary("vi", key, params)
});

export function useHubLanguage() {
  return useContext(HubLanguageContext);
}
