import { useEffect, useRef } from "react";
import type { AuthUser } from "../services/api";

const PING_INTERVAL = 30_000;
const STORAGE_KEY = "mhchub_presence_uuid";

function getOrCreateUUID(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(STORAGE_KEY, id); }
  return id;
}

export function usePresence(user: AuthUser | null, onCount?: (n: number) => void) {
  const onCountRef = useRef(onCount);
  onCountRef.current = onCount;

  useEffect(() => {
    const uuid = getOrCreateUUID();

    async function ping() {
      try {
        const res = await fetch("/api/presence/ping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            uuid,
            username: user?.username ?? null,
            displayName: user?.displayName ?? null,
            role: user?.role ?? null,
            page: window.location.pathname,
          }),
        });
        if (res.ok) {
          const data = await res.json() as { count?: number };
          if (typeof data.count === "number") onCountRef.current?.(data.count);
        }
      } catch {}
    }

    ping();
    const timer = setInterval(ping, PING_INTERVAL);
    return () => clearInterval(timer);
  }, [user?.username]);
}
