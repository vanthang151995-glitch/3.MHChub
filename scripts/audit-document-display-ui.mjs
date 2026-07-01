import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { loadLocalEnv } from "../server/loadEnv.js";
import { isPlaceholderDocumentTitle } from "../shared/documentDisplay.js";

loadLocalEnv(process.cwd());

const readArg = (name, fallback) => {
  const index = process.argv.lastIndexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
};

const canonicalizeBrowserBaseUrl = (value) => {
  const url = new URL(value);
  if (url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "[::1]") {
    url.hostname = "localhost";
  }
  return url.toString();
};

const baseUrl = canonicalizeBrowserBaseUrl(readArg("--url", process.env.VERIFY_BASE_URL || "http://127.0.0.1:3333/"));
const auditAuth = {
  password: process.env.AUDIT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || process.env.ADMIN_PIN || "thang123",
  username: process.env.AUDIT_ADMIN_USERNAME || process.env.ADMIN_USERNAME || "thangiot"
};
const reportsDir = path.join(process.cwd(), "qa", "reports");
const screenshotsDir = path.join(process.cwd(), "qa", "screenshots");
const reportPath = path.join(reportsDir, "document-display-ui-audit.json");

const viewports = [
  { deviceScaleFactor: 1, height: 900, name: "desktop", width: 1440 },
  { deviceScaleFactor: 2, height: 900, name: "mobile", width: 390 }
];

const pages = [
  {
    checkNewIssuedModal: true,
    name: "home",
    path: "/",
    requiresDocumentTitles: true,
    selectors: [".doc-mini strong"],
    waitSelector: ".doc-mini, .empty-text"
  },
  {
    name: "safety",
    path: "/safety-6s",
    requiresAuth: true,
    requiresDocumentTitles: false,
    selectors: [".doc-mini strong"],
    waitSelector: ".safety-polish-page"
  },
  {
    name: "documents",
    path: "/documents",
    requiresDocumentTitles: true,
    selectors: [".document-row h3"],
    waitSelector: ".document-row, .empty-text"
  }
];

const check = (name, pass, evidence = {}) => ({ evidence, name, pass: Boolean(pass) });
const ensureDir = (directory) => fs.mkdirSync(directory, { recursive: true });
const absoluteUrl = (route) => new URL(route, baseUrl).toString();
const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();

async function authenticateContext(context) {
  const response = await context.request.post(absoluteUrl("/api/auth/login"), {
    data: {
      password: auditAuth.password,
      username: auditAuth.username
    }
  });

  return {
    ok: response.ok(),
    status: response.status(),
    username: auditAuth.username
  };
}

async function collectVisibleTitles(page, selectors) {
  return page.evaluate(({ selectors }) => {
    const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const items = [];

    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (rect.width <= 0 || rect.height <= 0 || style.visibility === "hidden" || style.display === "none") continue;

        items.push({
          selector,
          text: compact(element.textContent)
        });
      }
    }

    return items.filter((item) => item.text);
  }, { selectors });
}

async function clickNewIssuedMore(page) {
  return page.evaluate(() => {
    const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const buttons = [...document.querySelectorAll(".bulletin-heading-more")];
    const target = buttons.find((button) => {
      const card = button.closest(".directive-card");
      const header = card?.querySelector(".directive-card-header");
      return compact(header?.textContent).includes("Mới ban hành");
    });

    if (!target) return false;
    target.click();
    return true;
  });
}

async function runCase(browser, pageSpec, viewport) {
  const context = await browser.newContext({
    deviceScaleFactor: viewport.deviceScaleFactor,
    viewport: { height: viewport.height, width: viewport.width }
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
  const screenshot = path.resolve(screenshotsDir, `document-display-ui-${pageSpec.name}-${viewport.name}.png`);

  if (pageSpec.requiresAuth) {
    const authResult = await authenticateContext(context);
    checks.push(check("auth-login", authResult.ok, {
      status: authResult.status,
      username: authResult.username
    }));

    if (!authResult.ok) {
      await context.close();
      return {
        checks,
        modal: null,
        name: `${pageSpec.name}-${viewport.name}`,
        page: pageSpec.name,
        path: pageSpec.path,
        screenshot,
        titles: [],
        viewport: viewport.name
      };
    }
  }

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("response", (response) => {
    const status = response.status();
    if (status >= 400 && !response.url().includes("/favicon") && !(status === 401 && response.url().includes("/api/auth/me"))) {
      badResponses.push({ status, url: response.url() });
    }
  });

  const url = absoluteUrl(pageSpec.path);
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.locator("body").waitFor({ state: "visible", timeout: 10000 });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => null);

  await page.locator(pageSpec.waitSelector).first().waitFor({ state: "visible", timeout: 15000 });

  const titles = await collectVisibleTitles(page, pageSpec.selectors);
  const placeholderTitles = titles.filter((item) => isPlaceholderDocumentTitle(item.text));
  const bodyText = await page.locator("body").innerText();
  const rawPlaceholderHits = ["ADASD", "tadsad"].filter((item) => bodyText.includes(item));
  const requiresDocumentTitles = pageSpec.requiresDocumentTitles !== false;
  await page.screenshot({ path: screenshot, fullPage: false });

  checks.push(
    check("page-loaded", Boolean(response?.ok()), { status: response?.status(), url }),
    check("document-title-elements-present", !requiresDocumentTitles || titles.length > 0, {
      required: requiresDocumentTitles,
      titles
    }),
    check("document-visible-titles-not-placeholder", placeholderTitles.length === 0, { placeholderTitles, titles }),
    check("document-raw-placeholder-title-not-visible", rawPlaceholderHits.length === 0, { rawPlaceholderHits }),
    check("console-clean", consoleErrors.length === 0, { consoleErrors }),
    check("network-clean", badResponses.length === 0, { badResponses }),
    check("screenshot-written", fs.existsSync(screenshot), { screenshot })
  );

  let modal = null;
  if (pageSpec.checkNewIssuedModal) {
    const clicked = await clickNewIssuedMore(page);
    if (clicked) {
      await page.locator(".feed-detail-modal").waitFor({ state: "visible", timeout: 12000 });
      const modalTitles = await collectVisibleTitles(page, [".feed-detail-row.document .feed-detail-row-title strong"]);
      const modalPlaceholderTitles = modalTitles.filter((item) => isPlaceholderDocumentTitle(item.text));
      const modalBodyText = await page.locator(".feed-detail-modal").innerText();
      const modalRawPlaceholderHits = ["ADASD", "tadsad"].filter((item) => modalBodyText.includes(item));
      const modalScreenshot = path.resolve(screenshotsDir, `document-display-ui-${pageSpec.name}-${viewport.name}-modal.png`);
      await page.screenshot({ path: modalScreenshot, fullPage: false });
      const modalChecks = [
        check("new-issued-modal-opened", true, {}),
        check("new-issued-modal-document-titles-present", modalTitles.length > 0, { modalTitles }),
        check("new-issued-modal-visible-titles-not-placeholder", modalPlaceholderTitles.length === 0, {
          modalPlaceholderTitles,
          modalTitles
        }),
        check("new-issued-modal-raw-placeholder-title-not-visible", modalRawPlaceholderHits.length === 0, {
          modalRawPlaceholderHits
        }),
        check("new-issued-modal-screenshot-written", fs.existsSync(modalScreenshot), { modalScreenshot })
      ];

      checks.push(...modalChecks);
      modal = { checks: modalChecks, modalScreenshot, modalTitles };
    } else {
      const modalCheck = check("new-issued-modal-opened", false, { reason: "Mới ban hành Xem thêm button was not found" });
      checks.push(modalCheck);
      modal = { checks: [modalCheck], modalScreenshot: "", modalTitles: [] };
    }
  }

  await context.close();

  return {
    checks,
    modal,
    name: `${pageSpec.name}-${viewport.name}`,
    page: pageSpec.name,
    path: pageSpec.path,
    screenshot,
    titles,
    viewport: viewport.name
  };
}

ensureDir(reportsDir);
ensureDir(screenshotsDir);

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    for (const pageSpec of pages) {
      results.push(await runCase(browser, pageSpec, viewport));
    }
  }
} finally {
  await browser.close();
}

const failedChecks = results.flatMap((result) =>
  result.checks
    .filter((item) => !item.pass)
    .map((item) => ({ check: item.name, evidence: item.evidence, page: result.page, viewport: result.viewport }))
);
const allChecks = results.flatMap((result) => result.checks);
const report = {
  baseUrl,
  failedChecks,
  generatedAtUtc: new Date().toISOString(),
  ok: failedChecks.length === 0,
  results,
  summary: {
    failed: failedChecks.length,
    passed: allChecks.filter((item) => item.pass).length,
    total: allChecks.length
  }
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  failedChecks,
  ok: report.ok,
  reportPath,
  summary: report.summary,
  tested: results.map((result) => ({
    checks: result.checks.length,
    name: result.name,
    screenshot: result.screenshot
  }))
}, null, 2));

if (!report.ok) process.exit(1);
