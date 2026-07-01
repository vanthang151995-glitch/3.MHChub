import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import defaultConfig from "../shared/defaultConfig.js";

const readArg = (name, fallback) => {
  const index = process.argv.lastIndexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
};

const rootDir = process.cwd();
const baseUrl = readArg("--url", process.env.VERIFY_BASE_URL || "http://127.0.0.1:3333/");
const screenshotDir = readArg("--screenshots", path.join("qa", "screenshots"));
const reportsDir = path.join(rootDir, "qa", "reports");
const reportPath = path.join(reportsDir, "operations-preflight-ui-audit.json");
const preflightSourcePath = path.join(reportsDir, "production-preflight-summary.json");

const viewports = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "tv-1920", width: 1920, height: 1080 },
  { name: "mobile-390", width: 390, height: 900, deviceScaleFactor: 2 }
];

const ensureDir = (directory) => {
  fs.mkdirSync(directory, { recursive: true });
};

const check = (name, pass, evidence = {}) => ({
  name,
  pass: Boolean(pass),
  evidence
});

const normalizePath = (value) => path.resolve(value);

const readJsonFile = (filePath, fallback = null) => {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
};

const fallbackLiveRuntimeAction = {
  action: "Restart/reload the live MHChub process so it loads the current server/index.js, then run npm run audit:live-api-runtime again.",
  evidence: {
    baseUrl: "http://localhost:4174",
    restartRecommended: true,
    staleSignals: [
      "live-unknown-api-route-is-json-404",
      "live-program-list-returns-json",
      "live-document-architecture-returns-json"
    ],
    summary: {
      failed: 13,
      passed: 5,
      total: 18,
      warnings: 0
    }
  },
  name: "live-runtime-api-contract-current",
  status: "action_required"
};

const fallbackPreflight = {
  generatedAtUtc: new Date().toISOString(),
  productionReady: false,
  summary: {
    actionRequired: 4,
    administratorActions: 1,
    blockingActions: 2,
    maintenanceActions: 1,
    missingReports: 0,
    passed: 11,
    total: 15,
    warnings: 1
  },
  blockingActions: [
    {
      action: "Run npm run ops:secrets, restart/reload MHChub, then run npm run ops:health -- -BaseUrl http://127.0.0.1:3333 -StrictReady.",
      name: "strict-readiness-green",
      status: "action_required"
    },
    fallbackLiveRuntimeAction
  ],
  administratorActions: [
    {
      action: "Run npm run ops:service:repair-apply from Administrator PowerShell.",
      evidence: {
        currentUser: {
          isAdministrator: false,
          name: "MANI\\MHC-ET49"
        }
      },
      name: "service-recovery-restart-enabled",
      status: "action_required"
    }
  ],
  maintenanceActions: [
    {
      action: ".\\scripts\\clean-dist-stale-assets.ps1 -Apply -ConfirmStaleCount 434 from Administrator PowerShell.",
      name: "local-dist-stale-cleanup",
      status: "warning"
    }
  ]
};

const firstOrFallback = (items, fallbackItems) => (
  Array.isArray(items) && items.length ? items : fallbackItems
);

const withNamedAction = (items, requiredItem) => {
  if (items.some((item) => item?.name === requiredItem.name)) return items;
  return [...items, requiredItem];
};

const buildPreflightFixture = () => {
  const source = readJsonFile(preflightSourcePath, fallbackPreflight) || fallbackPreflight;
  const blockingActions = withNamedAction(
    firstOrFallback(source.blockingActions, fallbackPreflight.blockingActions),
    fallbackLiveRuntimeAction
  );
  const administratorActions = firstOrFallback(source.administratorActions, fallbackPreflight.administratorActions);
  const maintenanceActions = firstOrFallback(source.maintenanceActions, fallbackPreflight.maintenanceActions);
  const fixture = {
    ...source,
    productionReady: false,
    blockingActions,
    administratorActions,
    maintenanceActions,
    summary: {
      ...fallbackPreflight.summary,
      ...(source.summary || {}),
      actionRequired: blockingActions.length + administratorActions.length + maintenanceActions.length,
      administratorActions: administratorActions.length,
      blockingActions: blockingActions.length,
      maintenanceActions: maintenanceActions.length
    }
  };

  return fixture;
};

const nowIso = new Date().toISOString();
const systemStatusFixture = {
  counts: {
    backups: 0,
    departments: 6,
    uploadedFiles: 0
  },
  environment: {
    allowedOrigins: ["http://127.0.0.1:3333"],
    enableLegacyAdminPin: false,
    maxUploadMb: 50,
    trustProxy: false,
    usesDefaultAdminPin: false
  },
  host: {
    name: "mhchub-audit"
  },
  node: process.version,
  readiness: {
    ready: false,
    checks: [
      { id: "server", label: "Web/API", ok: true },
      { id: "admin-password", label: "ADMIN_PASSWORD", ok: false }
    ]
  },
  runtimeFiles: {
    config: { bytes: 4096, exists: true, updatedAt: nowIso },
    documents: { bytes: 2048, exists: true, updatedAt: nowIso },
    uploads: { count: 0, exists: true, updatedAt: nowIso }
  },
  uptimeSeconds: 3661,
  warnings: ["ADMIN_PASSWORD is required for strict production readiness."]
};

const activityFixture = {
  items: [],
  pagination: {
    page: 1,
    pageSize: 8,
    totalItems: 0,
    totalPages: 1
  }
};

const routeJson = (route, payload) =>
  route.fulfill({
    body: JSON.stringify(payload),
    contentType: "application/json; charset=utf-8",
    status: 200
  });

const setupApiMocks = async (page, preflightFixture) => {
  await page.route("**/api/auth/me", (route) => routeJson(route, {
    data: {
      user: {
        displayName: "Nguyen Van Thang - PE1",
        role: "admin",
        username: "thangiot"
      }
    }
  }));
  await page.route("**/api/config", (route) => routeJson(route, defaultConfig));
  await page.route("**/api/system/status", (route) => routeJson(route, systemStatusFixture));
  await page.route("**/api/system/preflight", (route) => routeJson(route, preflightFixture));
  await page.route("**/api/activity**", (route) => routeJson(route, activityFixture));
  await page.route("**/api/backups", (route) => routeJson(route, []));
};

const screenshotPath = (viewportName) =>
  path.join(screenshotDir, `operations-preflight-${viewportName}.png`);

const compactRect = (rect) => {
  if (!rect) return null;
  const round = (value) => Math.round(value * 10) / 10;
  return {
    bottom: round(rect.bottom),
    height: round(rect.height),
    left: round(rect.left),
    right: round(rect.right),
    top: round(rect.top),
    width: round(rect.width)
  };
};

async function collectMetrics(page) {
  return page.evaluate(() => {
    const panel = document.querySelector(".preflight-panel");
    const panelRect = panel?.getBoundingClientRect();
    const summaryCards = [...document.querySelectorAll(".preflight-summary-grid > div")].map((item) => {
      const rect = item.getBoundingClientRect();
      const strong = item.querySelector("strong");
      const strongRect = strong?.getBoundingClientRect();
      return {
        height: rect.height,
        strongHeight: strongRect?.height || 0,
        text: item.textContent.trim().replace(/\s+/g, " "),
        width: rect.width
      };
    });
    const actionRows = [...document.querySelectorAll(".preflight-action-row")].map((row) => {
      const rect = row.getBoundingClientRect();
      const label = row.querySelector("span")?.getBoundingClientRect();
      const body = row.querySelector("strong")?.getBoundingClientRect();
      return {
        bodyHeight: body?.height || 0,
        height: rect.height,
        labelHeight: label?.height || 0,
        text: row.textContent.trim().replace(/\s+/g, " "),
        width: rect.width
      };
    });
    const badOverflowElements = [...document.querySelectorAll(".preflight-panel, .preflight-panel *")]
      .filter((item) => item.scrollWidth > item.clientWidth + 2)
      .slice(0, 12)
      .map((item) => ({
        className: item.className || item.tagName.toLowerCase(),
        clientWidth: item.clientWidth,
        scrollWidth: item.scrollWidth,
        text: item.textContent.trim().replace(/\s+/g, " ").slice(0, 120)
      }));

    return {
      actionRows,
      badOverflowElements,
      bodyTextLength: (document.body.innerText || "").trim().length,
      documentClientWidth: document.documentElement.clientWidth,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        || document.body.scrollWidth > document.documentElement.clientWidth + 1,
      operationPageVisible: Boolean(document.querySelector(".operations-page")),
      panel: panelRect
        ? {
            bottom: panelRect.bottom,
            height: panelRect.height,
            left: panelRect.left,
            right: panelRect.right,
            top: panelRect.top,
            width: panelRect.width
          }
        : null,
      panelText: panel?.textContent?.trim().replace(/\s+/g, " ") || "",
      statusPillText: panel?.querySelector(".status-pill")?.textContent?.trim() || "",
      summaryCards,
      viewport: {
        devicePixelRatio: window.devicePixelRatio,
        height: window.innerHeight,
        width: window.innerWidth
      }
    };
  });
}

const compactMetrics = (metrics) => ({
  ...metrics,
  actionRows: metrics.actionRows.map((row) => ({
    ...row,
    bodyHeight: Math.round(row.bodyHeight * 10) / 10,
    height: Math.round(row.height * 10) / 10,
    labelHeight: Math.round(row.labelHeight * 10) / 10,
    width: Math.round(row.width * 10) / 10
  })),
  panel: compactRect(metrics.panel),
  summaryCards: metrics.summaryCards.map((card) => ({
    ...card,
    height: Math.round(card.height * 10) / 10,
    strongHeight: Math.round(card.strongHeight * 10) / 10,
    width: Math.round(card.width * 10) / 10
  }))
});

async function runViewport(browser, viewport, preflightFixture) {
  const context = await browser.newContext({
    deviceScaleFactor: viewport.deviceScaleFactor || 1,
    viewport: { width: viewport.width, height: viewport.height }
  });
  await context.addInitScript(() => {
    localStorage.setItem("hub-lang", "vi");
    localStorage.setItem("hub-theme-default-version", "light-default-v1");
    localStorage.setItem("hub-theme", "light");
  });

  const page = await context.newPage();
  const consoleErrors = [];
  const badResponses = [];
  const checks = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });
  page.on("response", (response) => {
    const status = response.status();
    const responseUrl = response.url();
    if (status >= 400 && !responseUrl.includes("/favicon")) {
      badResponses.push({ status, url: responseUrl });
    }
  });

  await setupApiMocks(page, preflightFixture);

  const operationsUrl = new URL("/operations", baseUrl).toString();
  const response = await page.goto(operationsUrl, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator(".operations-page").waitFor({ state: "visible", timeout: 15000 });
  await page.locator(".preflight-panel").scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);

  const screenshot = normalizePath(screenshotPath(viewport.name));
  await page.screenshot({ path: screenshot, fullPage: false });

  const metrics = await collectMetrics(page);
  const actionText = metrics.actionRows.map((row) => row.text).join(" | ");
  const rawCommandLeak = /npm run ops:secrets|npm run ops:service:repair-apply|repair-mhchub-service-recovery-windows\.ps1|clean-dist-stale-assets\.ps1 -Apply|npm run audit:live-api-runtime|Restart\/reload the live MHChub process/i.test(actionText);
  const liveRuntimeActionVisible = /live MHChub/i.test(actionText) && /API runtime drift/i.test(actionText);
  const adminUserContextVisible = /User hiện tại|Current user/i.test(actionText)
    && /Administrator|quyền Admin|Admin/i.test(actionText);
  const readableActionRows = metrics.actionRows.every((row) => {
    const maxHeight = /User hiện tại|Current user/i.test(row.text) ? 132 : 112;
    return row.height >= 44 && row.height <= maxHeight;
  });

  checks.push(check("page-loaded", Boolean(response?.ok()), {
    status: response?.status(),
    url: page.url()
  }));
  checks.push(check("operations-route-rendered", metrics.operationPageVisible && metrics.bodyTextLength > 400, {
    bodyTextLength: metrics.bodyTextLength,
    operationPageVisible: metrics.operationPageVisible
  }));
  checks.push(check("preflight-panel-visible", Boolean(metrics.panel && metrics.panel.width > 260 && metrics.panel.height > 180), {
    panel: compactRect(metrics.panel)
  }));
  checks.push(check("preflight-summary-visible", metrics.summaryCards.length >= 2 && metrics.summaryCards.every((item) => item.text.length > 0), {
    summaryCards: metrics.summaryCards
  }));
  checks.push(check("preflight-action-rows-visible", metrics.actionRows.length >= 3, {
    actionRows: metrics.actionRows.map((row) => row.text)
  }));
  checks.push(check("preflight-action-copy-is-compact", !rawCommandLeak && actionText.includes("ADMIN_PASSWORD/WEB_AUTH_SECRET") && /recovery service/i.test(actionText) && /\bdist\b/i.test(actionText), {
    actionText,
    rawCommandLeak
  }));
  checks.push(check("preflight-live-runtime-drift-visible", liveRuntimeActionVisible, {
    actionText,
    liveRuntimeActionVisible
  }));
  checks.push(check("preflight-admin-user-context-visible", adminUserContextVisible, {
    actionText,
    adminUserContextVisible
  }));
  checks.push(check("preflight-text-does-not-overflow", !metrics.badOverflowElements.length, {
    badOverflowElements: metrics.badOverflowElements
  }));
  checks.push(check("summary-metric-height-stable", metrics.summaryCards.every((item) => item.strongHeight <= 44), {
    summaryCards: metrics.summaryCards
  }));
  checks.push(check("action-rows-touch-readable", readableActionRows, {
    actionRows: metrics.actionRows
  }));
  checks.push(check("no-horizontal-overflow", !metrics.horizontalOverflow, {
    documentClientWidth: metrics.documentClientWidth,
    viewport: metrics.viewport
  }));
  checks.push(check("no-console-errors", consoleErrors.length === 0, { consoleErrors }));
  checks.push(check("no-bad-network-responses", badResponses.length === 0, { badResponses }));
  checks.push(check("screenshot-written", fs.existsSync(screenshot), { screenshot }));

  await context.close();

  return {
    checks,
    metrics,
    name: viewport.name,
    ok: checks.every((item) => item.pass),
    screenshot,
    size: `${viewport.width}x${viewport.height}`
  };
}

ensureDir(reportsDir);
ensureDir(screenshotDir);

const preflightFixture = buildPreflightFixture();
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    results.push(await runViewport(browser, viewport, preflightFixture));
  }
} finally {
  await browser.close();
}

const failedChecks = results.flatMap((result) =>
  result.checks
    .filter((item) => !item.pass)
    .map((item) => ({ viewport: result.name, ...item }))
);
const allChecks = results.flatMap((result) => result.checks);
const payload = {
  ok: failedChecks.length === 0,
  baseUrl,
  failedChecks,
  generatedAtUtc: new Date().toISOString(),
  preflightSource: path.relative(rootDir, preflightSourcePath).replace(/\\/g, "/"),
  reportPath: path.relative(rootDir, reportPath).replace(/\\/g, "/"),
  results: results.map((result) => ({
    checks: result.checks,
    metrics: compactMetrics(result.metrics),
    name: result.name,
    ok: result.ok,
    screenshot: result.screenshot,
    size: result.size
  })),
  summary: {
    failed: failedChecks.length,
    passed: allChecks.filter((item) => item.pass).length,
    total: allChecks.length
  }
};

fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  failedChecks,
  ok: payload.ok,
  reportPath,
  summary: payload.summary,
  viewports: payload.results.map((result) => ({
    failed: result.checks.filter((item) => !item.pass).length,
    name: result.name,
    screenshot: result.screenshot,
    size: result.size
  }))
}, null, 2));

if (!payload.ok) {
  process.exit(1);
}
