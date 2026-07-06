import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..", "..");

const SCHEDULE_HOURS = 6;
const DEBOUNCE_MS = 60_000;

let lastSyncTime = null;
let lastSyncStatus = null;
let syncTimer = null;
let debounceTimer = null;
let pendingReason = null;
let isSyncing = false;

function getRepoUrl() {
  return process.env.GITHUB_REPO_URL || "https://github.com/thang0105199509-netizen/mhchub.git";
}

function getAuthUrl() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  const repo = getRepoUrl().replace(/^https?:\/\//, "");
  return `https://x-access-token:${token}@${repo}`;
}

async function runSync(triggeredBy = "auto") {
  if (isSyncing) return { ok: false, message: "Đang sync, vui lòng chờ..." };

  const authUrl = getAuthUrl();
  if (!authUrl) {
    return { ok: false, message: "Chưa cấu hình GITHUB_TOKEN" };
  }

  isSyncing = true;
  const startedAt = new Date().toISOString();

  try {
    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: "MHChub Auto Sync",
      GIT_AUTHOR_EMAIL: "auto@mhchub.local",
      GIT_COMMITTER_NAME: "MHChub Auto Sync",
      GIT_COMMITTER_EMAIL: "auto@mhchub.local",
    };

    const { stdout: statusOut } = await execAsync("git status --porcelain", { cwd: rootDir, env: gitEnv });
    const hasChanges = statusOut.trim().length > 0;

    let committed = false;
    if (hasChanges) {
      await execAsync("git add -A", { cwd: rootDir, env: gitEnv });
      const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
      const msg = `auto-sync: ${now} (${triggeredBy})`;
      await execAsync(`git commit -m "${msg}"`, { cwd: rootDir, env: gitEnv });
      committed = true;
    }

    const { stdout: branchOut } = await execAsync("git branch --show-current", { cwd: rootDir });
    const currentBranch = branchOut.trim() || "thang";
    const { stdout: pushOut, stderr: pushErr } = await execAsync(
      `git push ${authUrl} ${currentBranch}`,
      { cwd: rootDir, env: gitEnv, timeout: 60000 }
    );

    const output = (pushOut + pushErr).trim();
    lastSyncTime = startedAt;
    lastSyncStatus = { ok: true, committed, changes: hasChanges, output, triggeredBy, at: startedAt };
    return { ok: true, committed, changes: hasChanges, output, message: hasChanges ? "Đã commit và push thành công" : "Không có thay đổi mới, đã push thành công" };
  } catch (err) {
    const message = err.stderr || err.stdout || err.message || "Lỗi không xác định";
    lastSyncStatus = { ok: false, message, triggeredBy, at: startedAt };
    return { ok: false, message };
  } finally {
    isSyncing = false;
  }
}

function triggerSync(reason = "event") {
  if (!process.env.GITHUB_TOKEN) return;
  pendingReason = pendingReason ? `${pendingReason}, ${reason}` : reason;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const why = pendingReason || reason;
    pendingReason = null;
    runSync(why).then((result) => {
      if (result.ok) console.log(`[github-sync] Event-sync OK (${why}): ${result.message}`);
      else console.warn(`[github-sync] Event-sync FAILED (${why}): ${result.message}`);
    }).catch((err) => console.error("[github-sync] Event-sync error:", err));
  }, DEBOUNCE_MS);
}

function startScheduler() {
  if (syncTimer) clearInterval(syncTimer);
  const intervalMs = SCHEDULE_HOURS * 60 * 60 * 1000;
  syncTimer = setInterval(() => {
    runSync("scheduler").then((result) => {
      if (result.ok) console.log(`[github-sync] Auto-sync OK: ${result.message}`);
      else console.warn(`[github-sync] Auto-sync FAILED: ${result.message}`);
    }).catch((err) => console.error("[github-sync] Scheduler error:", err));
  }, intervalMs);
  console.log(`[github-sync] Scheduler started — every ${SCHEDULE_HOURS}h`);
}

function getStatus() {
  return {
    configured: !!process.env.GITHUB_TOKEN,
    repo: getRepoUrl(),
    scheduleHours: SCHEDULE_HOURS,
    debounceSeconds: DEBOUNCE_MS / 1000,
    isSyncing,
    pendingSync: !!debounceTimer && !!pendingReason,
    pendingReason,
    lastSyncTime,
    lastSyncStatus,
  };
}

export function createGithubSyncService() {
  if (process.env.GITHUB_TOKEN) {
    startScheduler();
  }
  return { runSync, triggerSync, getStatus };
}
