import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || process.env.API_PROXY_TARGET || "http://localhost:3333";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          const normalized = id.replace(/\\/g, "/");
          if (
            normalized.includes("/node_modules/recharts/") ||
            normalized.includes("/node_modules/d3-") ||
            normalized.includes("/node_modules/victory-vendor/")
          ) {
            return "vendor-recharts";
          }
          if (
            normalized.includes("/src/pages/safety/safety-api") ||
            normalized.includes("/src/pages/safety/safety-domain") ||
            normalized.includes("/src/pages/safety/safety-kpi-domain") ||
            normalized.includes("/src/pages/safety/safety-shared")
          ) {
            return "SafetyCore";
          }
        }
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  server: {
    port: Number(process.env.VITE_PORT) || 5173,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true
      },
      "/uploads": {
        target: apiProxyTarget,
        changeOrigin: true
      }
    }
  }
});
