import { useEffect, useRef } from "react";
import type { AuthUser } from "../services/api";

const PING_INTERVAL = 30_000;
const STORAGE_KEY = "mhchub_presence_uuid";

function getOrCreateUUID() {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export function usePresence(user: AuthUser | null, onCount?: (count: number) => void) {
  const onCountRef = useRef(onCount);
  onCountRef.current = onCount;

  useEffect(() => {
    const uuid = getOrCreateUUID();

    const ping = async () => {
      try {
        const response = await fetch("/api/presence/ping", {
          body: JSON.stringify({
            displayName: user?.displayName ?? null,
            page: window.location.pathname,
            role: user?.role ?? null,
            username: user?.username ?? null,
            uuid
          }),
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        if (!response.ok) return;
        const data = (await response.json()) as { count?: number };
        if (typeof data.count === "number") {
          onCountRef.current?.(data.count);
        }
      } catch {
        // Best-effort ping only.
      }
    };

    ping();
    const timer = window.setInterval(ping, PING_INTERVAL);
    return () => window.clearInterval(timer);
  }, [user?.displayName, user?.role, user?.username]);
}
