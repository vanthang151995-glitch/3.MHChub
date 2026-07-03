import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./styles.css";
import "./design-system.css";
import "./app/AppShell/styles/index.css";

// ── Polyfill crypto.randomUUID for HTTP (non-secure) contexts ──────────────
// crypto.randomUUID() is only available in secure contexts (HTTPS / localhost).
// When the app is accessed via plain HTTP over LAN IP, we need a fallback.
if (typeof crypto !== "undefined" && typeof crypto.randomUUID !== "function") {
  (crypto as unknown as Record<string, unknown>).randomUUID = function randomUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    }) as `${string}-${string}-${string}-${string}-${string}`;
  };
}


const LOOPBACK_HOSTS_TO_CANONICALIZE = new Set(["127.0.0.1", "::1"]);

function redirectLoopbackHostToLocalhost() {
  if (typeof window === "undefined") return false;
  if (!LOOPBACK_HOSTS_TO_CANONICALIZE.has(window.location.hostname)) return false;

  const target = new URL(window.location.href);
  target.hostname = "localhost";
  window.location.replace(target.toString());
  return true;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000
    }
  }
});

if (!redirectLoopbackHostToLocalhost()) {
  const root = document.getElementById("root");

  if (!root) {
    throw new Error("Root element #root was not found");
  }

  createRoot(root).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>
  );
}
