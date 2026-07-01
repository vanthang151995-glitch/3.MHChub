import { useMemo, useState } from "react";
import { normalizeLocalizedText } from "../../i18n-localized";

export type SafetyLocalizedLanguage = "vi" | "en" | "ja";
export type SafetyLocalizedText = Record<SafetyLocalizedLanguage, string>;

const LANGUAGE_TABS: Array<{ code: SafetyLocalizedLanguage; label: string }> = [
  { code: "vi", label: "VI" },
  { code: "en", label: "EN" },
  { code: "ja", label: "JA" },
];

export const emptySafetyLocalizedText = (vi = ""): SafetyLocalizedText => ({
  vi,
  en: "",
  ja: "",
});

export const normalizeSafetyLocalizedText = (
  value?: Partial<SafetyLocalizedText> | string | null,
  fallback = ""
): SafetyLocalizedText => {
  const normalized = normalizeLocalizedText(value, fallback);
  return {
    vi: normalized.vi || "",
    en: normalized.en || "",
    ja: normalized.ja || "",
  };
};

export const safetyLocalizedVi = (value?: Partial<SafetyLocalizedText> | string | null, fallback = "") =>
  normalizeSafetyLocalizedText(value, fallback).vi.trim();

export const safetyLocalizedPayload = (value?: Partial<SafetyLocalizedText> | string | null, fallback = "") =>
  normalizeSafetyLocalizedText(value, fallback);

type LocalizedTextFieldProps = {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  inputClassName?: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  rows?: number;
  textarea?: boolean;
  value?: Partial<SafetyLocalizedText> | string | null;
  onChange: (value: SafetyLocalizedText) => void;
};

export function SafetyLocalizedTextField({
  ariaLabel,
  className = "",
  disabled = false,
  inputClassName = "input-form",
  label,
  placeholder = "",
  required = false,
  rows = 2,
  textarea = false,
  value,
  onChange,
}: LocalizedTextFieldProps) {
  const [activeLang, setActiveLang] = useState<SafetyLocalizedLanguage>("vi");
  const normalized = useMemo(() => normalizeSafetyLocalizedText(value), [value]);

  const updateText = (text: string) => {
    onChange({ ...normalized, [activeLang]: text });
  };

  return (
    <div className={`safety-localized-field ${className}`.trim()}>
      <div className="safety-localized-field-head">
        <label className="label-form">
          {label}
          {required ? " *" : ""}
        </label>
        <div className="safety-localized-tabs" role="tablist" aria-label={label}>
          {LANGUAGE_TABS.map((tab) => (
            <button
              aria-pressed={activeLang === tab.code}
              className={activeLang === tab.code ? "active" : ""}
              disabled={disabled}
              key={tab.code}
              onClick={() => setActiveLang(tab.code)}
              type="button"
            >
              {tab.label}
              {tab.code === "vi" && required ? <span aria-hidden="true">*</span> : null}
            </button>
          ))}
        </div>
      </div>
      {textarea ? (
        <textarea
          aria-label={ariaLabel || label}
          className={inputClassName}
          disabled={disabled}
          onChange={(event) => updateText(event.target.value)}
          placeholder={placeholder}
          required={required && activeLang === "vi"}
          rows={rows}
          value={normalized[activeLang]}
        />
      ) : (
        <input
          aria-label={ariaLabel || label}
          className={inputClassName}
          disabled={disabled}
          onChange={(event) => updateText(event.target.value)}
          placeholder={placeholder}
          required={required && activeLang === "vi"}
          value={normalized[activeLang]}
        />
      )}
    </div>
  );
}
