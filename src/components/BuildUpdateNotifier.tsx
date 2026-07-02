import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL = 30_000;

export function BuildUpdateNotifier() {
  const knownStart = useRef<number | null>(null);
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function check() {
    try {
      const res = await fetch("/api/ready", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const ts: number = data.startTime;
      if (!ts) return;

      if (knownStart.current === null) {
        knownStart.current = ts;
      } else if (knownStart.current !== ts) {
        knownStart.current = ts;
        setShow(true);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    } catch {
    }
  }

  useEffect(() => {
    check();
    timerRef.current = setInterval(check, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  if (!show) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 99999,
      display: "flex",
      alignItems: "center",
      gap: 12,
      background: "#1e293b",
      color: "#f8fafc",
      padding: "11px 14px 11px 16px",
      borderRadius: 14,
      boxShadow: "0 8px 32px rgba(0,0,0,.30), 0 2px 8px rgba(0,0,0,.15)",
      fontSize: 14,
      fontWeight: 600,
      fontFamily: "inherit",
      whiteSpace: "nowrap",
      borderLeft: "4px solid #3b82f6",
      animation: "bun-up .3s cubic-bezier(.34,1.56,.64,1) both",
    }}>
      <style>{`
        @keyframes bun-up {
          from { opacity:0; transform:translateX(-50%) translateY(18px); }
          to   { opacity:1; transform:translateX(-50%) translateY(0); }
        }
      `}</style>
      <span style={{ fontSize: 18, lineHeight: 1 }}>🔄</span>
      <span style={{ color: "#cbd5e1", fontWeight: 500 }}>
        Hệ thống vừa được cập nhật
      </span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: "#3b82f6",
          border: "none",
          borderRadius: 8,
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
          padding: "5px 14px",
          cursor: "pointer",
          boxShadow: "0 1px 4px rgba(59,130,246,.4)",
          flexShrink: 0,
        }}>
        Tải lại ngay
      </button>
      <button
        onClick={() => setShow(false)}
        style={{
          background: "rgba(255,255,255,.08)",
          border: "none",
          borderRadius: 6,
          color: "#94a3b8",
          fontSize: 16,
          fontWeight: 700,
          width: 26,
          height: 26,
          cursor: "pointer",
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>✕</button>
    </div>
  );
}
