import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5050,
    allowedHosts: true,
    hmr: false,
    proxy: {
      "/api": {
        target: "http://localhost:3333",
        changeOrigin: true,
        headers: { origin: "http://localhost:5050" },
      },
      "/uploads": {
        target: "http://localhost:3333",
        changeOrigin: true,
        headers: { origin: "http://localhost:5050" },
      },
      "/previews": {
        target: "http://localhost:3333",
        changeOrigin: true,
        headers: { origin: "http://localhost:5050" },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "stream": "stream-browserify"
    },
  },
});
