import React, { CSSProperties } from "react";

// Helpers to parse and format bilingual strings
export function parseBilingual(text: string) {
  if (!text) return { vi: "", ja: "" };
  if (text.includes("|||")) {
    const [vi, ja] = text.split("|||");
    return { vi: vi.trim(), ja: ja.trim() };
  }
  return { vi: text.trim(), ja: "" };
}

export function formatBilingual(vi: string, ja: string) {
  if (ja.trim()) return `${vi.trim()} ||| ${ja.trim()}`;
  return vi.trim();
}

interface BilingualFieldProps {
  value: string;
  onChange: (val: string) => void;
  bilingualMode: boolean;
  placeholderVi?: string;
  placeholderJa?: string;
  style?: CSSProperties;
  autoFocus?: boolean;
}

const INP_DEFAULT: CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1.5px solid #cbd5e1",
  background: "#f8fafc",
  outline: "none",
  transition: "all .2s",
  color: "#0f172a"
};

export function BilingualInput({ value, onChange, bilingualMode, placeholderVi, placeholderJa, style, autoFocus }: BilingualFieldProps) {
  const { vi, ja } = parseBilingual(value);

  if (bilingualMode) {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#fff", border: "1.5px solid #cbd5e1", borderRadius: 8, paddingRight: 8, overflow: "hidden" }}>
          <div style={{ padding: "0 8px", fontSize: 18, borderRight: "1px solid #e2e8f0", background: "#f8fafc", alignSelf: "stretch", display: "flex", alignItems: "center", color: "#94a3b8" }}>🇻🇳</div>
          <input
            style={{ flex: 1, border: "none", outline: "none", padding: "10px 12px", fontSize: 14, fontWeight: 600, background: "transparent", minWidth: 0, ...style }}
            value={vi}
            onChange={(e) => onChange(formatBilingual(e.target.value, ja))}
            placeholder={placeholderVi || "Tiếng Việt..."}
            autoFocus={autoFocus}
          />
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#fff", border: "1.5px solid #cbd5e1", borderRadius: 8, paddingRight: 8, overflow: "hidden" }}>
          <div style={{ padding: "0 8px", fontSize: 18, borderRight: "1px solid #e2e8f0", background: "#f8fafc", alignSelf: "stretch", display: "flex", alignItems: "center", color: "#94a3b8" }}>🇯🇵</div>
          <input
            style={{ flex: 1, border: "none", outline: "none", padding: "10px 12px", fontSize: 14, fontWeight: 600, background: "transparent", minWidth: 0, ...style }}
            value={ja}
            onChange={(e) => onChange(formatBilingual(vi, e.target.value))}
            placeholder={placeholderJa || "日本語..."}
          />
        </div>
      </div>
    );
  }

  return (
    <input
      style={{ ...INP_DEFAULT, fontSize: 14, fontWeight: 600, ...style }}
      value={vi}
      onChange={(e) => onChange(formatBilingual(e.target.value, ja))}
      placeholder={placeholderVi}
      autoFocus={autoFocus}
    />
  );
}

interface BilingualTextareaProps extends BilingualFieldProps {
  rows?: number;
}

export function BilingualTextarea({ value, onChange, bilingualMode, placeholderVi, placeholderJa, style, rows = 3, autoFocus }: BilingualTextareaProps) {
  const { vi, ja } = parseBilingual(value);

  const autoGrow = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  return (
    <div>
      <div style={{ position: "relative" }}>
        {bilingualMode && <div style={{ position: "absolute", right: 8, top: 8, fontSize: 16 }}>🇻🇳</div>}
        <textarea
          rows={rows}
          style={{ ...INP_DEFAULT, fontSize: 14, resize: "vertical", lineHeight: 1.65, minHeight: rows * 30, ...style }}
          value={vi}
          onChange={(e) => onChange(formatBilingual(e.target.value, ja))}
          onInput={autoGrow}
          placeholder={placeholderVi}
          autoFocus={autoFocus}
        />
      </div>
      
      {bilingualMode && (
        <div style={{ marginTop: 8, position: "relative" }}>
          <div style={{ position: "absolute", right: 8, top: 8, fontSize: 16 }}>🇯🇵</div>
          <textarea
            rows={Math.max(2, rows - 1)}
            style={{ ...INP_DEFAULT, fontSize: 14, resize: "vertical", lineHeight: 1.65, minHeight: Math.max(2, rows - 1) * 30, ...style }}
            value={ja}
            onChange={(e) => onChange(formatBilingual(vi, e.target.value))}
            onInput={autoGrow}
            placeholder={placeholderJa || "日本語..."}
          />
        </div>
      )}
    </div>
  );
}

/** Read-only display for bilingual text (splits on "|||") */
export function BilingualText({ text, style, jaStyle }: { text?: string; style?: React.CSSProperties; jaStyle?: React.CSSProperties }) {
  if (!text) return null;
  if (!text.includes("|||")) return <>{text}</>;
  const parts = text.split("|||");
  return (
    <div style={{ display: "flex", flexDirection: "column", ...style }}>
      <div>{parts[0]}</div>
      <div style={{ fontSize: "0.9em", color: "#64748b", marginTop: 2, ...jaStyle }}>{parts[1]}</div>
    </div>
  );
}
