import React, { useState, useEffect, useRef } from "react";

interface Place { id: string; name: string; factoryCode?: string; }

interface PlaceComboProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
}

let cachedPlaces: Place[] | null = null;
let fetchPromise: Promise<Place[]> | null = null;

function fetchPlaces(): Promise<Place[]> {
  if (cachedPlaces) return Promise.resolve(cachedPlaces);
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch("/api/places", { credentials: "include" })
    .then(r => r.ok ? r.json() : [])
    .then((data: Place[]) => { cachedPlaces = Array.isArray(data) ? data : []; return cachedPlaces!; })
    .catch(() => { fetchPromise = null; return []; });
  return fetchPromise;
}

/** Gọi sau khi submit form để tự động lưu địa điểm mới */
export async function suggestPlace(name: string): Promise<void> {
  if (!name || !name.trim()) return;
  try {
    await fetch("/api/places/suggest", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    cachedPlaces = null;
    fetchPromise = null;
  } catch { /* silent */ }
}

export function PlaceCombo({ value, onChange, placeholder, style, inputStyle }: PlaceComboProps) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen]     = useState(false);
  const [q, setQ]           = useState(value || "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQ(value || ""); }, [value]);

  useEffect(() => {
    fetchPlaces().then(setPlaces);
  }, []);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const names = places.map(p => p.name);
  const filtered = q
    ? names.filter(n => n.toLowerCase().includes(q.toLowerCase()))
    : names;
  const showNew = q.trim().length > 0 && !names.some(n => n.toLowerCase() === q.trim().toLowerCase());

  function pick(v: string) { onChange(v); setQ(v); setOpen(false); }
  function clear() { onChange(""); setQ(""); }

  const BASE_INPUT: React.CSSProperties = {
    height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid #e2e8f0",
    fontSize: 13, width: "100%", boxSizing: "border-box", background: "#fff",
    ...inputStyle,
  };

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <div style={{ position: "relative" }}>
        <input
          style={{ ...BASE_INPUT, paddingRight: q ? 30 : 10 }}
          value={q}
          onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? "📍 Chọn hoặc nhập địa điểm..."}
          autoComplete="off"
        />
        {q && (
          <button
            onMouseDown={e => { e.preventDefault(); clear(); }}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 14, lineHeight: 1, padding: 0 }}>
            ✕
          </button>
        )}
      </div>
      {open && (filtered.length > 0 || showNew) && (
        <div style={{
          position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0,
          background: "#fff", border: "1.5px solid #bae6fd", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,.12)", maxHeight: 200, overflowY: "auto", zIndex: 400,
        }}>
          {filtered.slice(0, 12).map(n => (
            <button key={n} onMouseDown={e => { e.preventDefault(); pick(n); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px", border: "none", background: n === value ? "#f0f9ff" : "transparent", cursor: "pointer", textAlign: "left" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f0f9ff")}
              onMouseLeave={e => (e.currentTarget.style.background = n === value ? "#f0f9ff" : "transparent")}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>📍</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#1e293b" }}>{n}</span>
              {n === value && <span style={{ fontSize: 12, color: "#3b82f6", fontWeight: 800 }}>✓</span>}
            </button>
          ))}
          {showNew && (
            <button onMouseDown={e => { e.preventDefault(); pick(q.trim()); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px", border: "none", borderTop: "1px solid #f1f5f9", background: "#f8fafc", cursor: "pointer", textAlign: "left" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#eff6ff")}
              onMouseLeave={e => (e.currentTarget.style.background = "#f8fafc")}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>➕</span>
              <span style={{ flex: 1, fontSize: 13, color: "#2563eb", fontWeight: 700 }}>Dùng &ldquo;{q.trim()}&rdquo; <span style={{ fontWeight: 400, color: "#64748b" }}>(tự động lưu)</span></span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
