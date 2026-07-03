/**
 * dev-watch.mjs — Tự động rebuild frontend khi code thay đổi
 * Chạy: node scripts/dev-watch.mjs
 *
 * - Watch src/, shared/, public/ cho thay đổi
 * - Debounce 600ms (gom nhiều thay đổi cùng lúc)
 * - Sau mỗi build thành công: ghi build-stamp.json
 * - Express (chạy riêng) tự detect stamp mới qua /api/build-stamp
 */

import chokidar from "chokidar";
import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const stampFile = path.join(rootDir, "dist", "build-stamp.json");

function log(msg) {
  const now = new Date().toLocaleTimeString("vi-VN", { hour12: false });
  console.log(`[WATCH ${now}] ${msg}`);
}

function writeStamp() {
  try {
    fs.mkdirSync(path.join(rootDir, "dist"), { recursive: true });
    fs.writeFileSync(stampFile, JSON.stringify({ ts: Date.now() }));
  } catch {}
}

writeStamp();
log("Khởi động dev-watch — đang theo dõi src/, shared/, public/");

let buildTimer = null;
let isBuilding = false;

function scheduleRebuild(filePath) {
  if (buildTimer) clearTimeout(buildTimer);
  buildTimer = setTimeout(() => {
    if (isBuilding) {
      log("⏳ Đang build — bỏ qua thay đổi mới...");
      return;
    }
    isBuilding = true;
    log(`🔨 Phát hiện thay đổi (${path.relative(rootDir, filePath)}) — đang build...`);
    try {
      execSync("npx vite build --emptyOutDir=false", { cwd: rootDir, stdio: "inherit" });
      try { execSync("node scripts/audit-dist-assets.mjs --apply --strict-stale --quiet", { cwd: rootDir, stdio: "inherit" }); } catch { /* audit lỗi nhỏ, không fail build */ }
      writeStamp();
      log("✅ Build xong — trang sẽ tải lại file mới nhất khi refresh.");
    } catch {
      log("❌ Build thất bại — kiểm tra lỗi ở trên.");
    } finally {
      isBuilding = false;
    }
  }, 600);
}

const watcher = chokidar.watch(
  [
    path.join(rootDir, "src"),
    path.join(rootDir, "shared"),
    path.join(rootDir, "public"),
  ],
  {
    ignored: /(node_modules|dist|\.git)/,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  }
);

watcher.on("change", scheduleRebuild);
watcher.on("add", scheduleRebuild);
watcher.on("unlink", scheduleRebuild);

process.on("SIGINT", () => {
  log("Dừng dev-watch.");
  watcher.close();
  process.exit(0);
});
