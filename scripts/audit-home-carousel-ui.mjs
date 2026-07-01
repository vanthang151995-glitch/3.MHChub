import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const readArg = (name, fallback) => {
  const index = process.argv.lastIndexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
};

const baseUrl = readArg("--url", process.env.VERIFY_BASE_URL || "http://127.0.0.1:3333/");
const reportsDir = path.join(process.cwd(), "qa", "reports");
const screenshotsDir = readArg("--screenshots", path.join(process.cwd(), "qa", "screenshots"));
const reportPath = path.join(reportsDir, "home-carousel-ui-audit.json");

const ensureDir = (directory) => fs.mkdirSync(directory, { recursive: true });
const check = (name, pass, evidence = {}) => ({ evidence, name, pass: Boolean(pass) });
const absoluteUrl = (route = "/") => new URL(route, baseUrl).toString();
const screenshotPath = (name) => path.resolve(screenshotsDir, `home-carousel-ui-${name}.png`);

const activeDot = (page) =>
  page.locator(".hero-carousel-dots button").evaluateAll((buttons) =>
    buttons.findIndex((button) => button.classList.contains("active"))
  );

const hasHorizontalOverflow = (page) =>
  page.evaluate(() => {
    const body = document.body;
    const doc = document.documentElement;
    return Math.max(body.scrollWidth, doc.scrollWidth) > Math.max(body.clientWidth, doc.clientWidth) + 2;
  });

async function wirePage(page) {
  const consoleErrors = [];
  const badResponses = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if (status < 400) return;
    if (url.includes("/favicon")) return;
    if (status === 401 && url.includes("/api/auth/me")) return;
    badResponses.push({ status, url });
  });

  return { badResponses, consoleErrors };
}

async function gotoHome(page) {
  const response = await page.goto(absoluteUrl("/"), { timeout: 25000, waitUntil: "networkidle" });
  await page.locator(".portal-hero-carousel").first().waitFor({ state: "visible", timeout: 12000 });
  return response;
}

async function collectBaseMetrics(page) {
  return {
    activeIndex: await activeDot(page),
    carousel: await page.locator(".portal-hero-carousel").first().evaluate((element) => ({
      ariaDescribedBy: element.getAttribute("aria-describedby"),
      ariaLabel: element.getAttribute("aria-label"),
      role: element.getAttribute("role"),
      roleDescription: element.getAttribute("aria-roledescription"),
      tabIndex: element.tabIndex,
      touchAction: getComputedStyle(element).touchAction
    })),
    dotCount: await page.locator(".hero-carousel-dots button").count(),
    statusCount: await page.locator("#portal-hero-status").count(),
    statusText: (await page.locator("#portal-hero-status").textContent()).trim(),
    tickerCount: await page.locator(".system-feed-ticker").count()
  };
}

async function runNormalDesktop(browser) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    viewport: { height: 768, width: 1366 }
  });
  await context.addInitScript(() => {
    localStorage.setItem("hub-lang", "vi");
    localStorage.setItem("hub-theme-default-version", "light-default-v1");
    localStorage.setItem("hub-theme", "light");
  });

  const page = await context.newPage();
  const logs = await wirePage(page);
  const checks = [];
  const response = await gotoHome(page);
  const screenshot = screenshotPath("desktop-normal");
  await page.screenshot({ fullPage: false, path: screenshot });

  const metrics = await collectBaseMetrics(page);
  const initialIndex = metrics.activeIndex;
  await page.waitForTimeout(8500);
  const afterTimer = await activeDot(page);

  await page.locator(".portal-hero-carousel").first().focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(250);
  const afterEnd = await activeDot(page);
  const statusAfterEnd = (await page.locator("#portal-hero-status").textContent()).trim();
  await page.keyboard.press("Home");
  await page.waitForTimeout(250);
  const afterHome = await activeDot(page);
  const statusAfterHome = (await page.locator("#portal-hero-status").textContent()).trim();

  checks.push(
    check("page-loaded", Boolean(response?.ok()), { status: response?.status(), url: page.url() }),
    check("ticker-removed", metrics.tickerCount === 0, { tickerCount: metrics.tickerCount }),
    check("carousel-has-three-dots", metrics.dotCount === 3, { dotCount: metrics.dotCount }),
    check("carousel-region-accessible", metrics.carousel.role === "region" && metrics.carousel.tabIndex === 0, {
      carousel: metrics.carousel
    }),
    check("carousel-live-status-present", metrics.statusCount === 1 && metrics.statusText.startsWith("1/3"), {
      statusCount: metrics.statusCount,
      statusText: metrics.statusText
    }),
    check("normal-auto-rotates", initialIndex !== afterTimer, { afterTimer, initialIndex }),
    check("keyboard-end-selects-last-slide", afterEnd === 2 && statusAfterEnd.startsWith("3/3"), {
      afterEnd,
      statusAfterEnd
    }),
    check("keyboard-home-selects-first-slide", afterHome === 0 && statusAfterHome.startsWith("1/3"), {
      afterHome,
      statusAfterHome
    }),
    check("desktop-no-horizontal-overflow", !(await hasHorizontalOverflow(page)), {}),
    check("desktop-console-clean", logs.consoleErrors.length === 0, { consoleErrors: logs.consoleErrors }),
    check("desktop-network-clean", logs.badResponses.length === 0, { badResponses: logs.badResponses }),
    check("desktop-screenshot-written", fs.existsSync(screenshot), { screenshot })
  );

  await context.close();
  return { checks, metrics, name: "desktop-normal", screenshot };
}

async function runReducedMotion(browser) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    viewport: { height: 768, width: 1366 }
  });
  await context.addInitScript(() => {
    localStorage.setItem("hub-lang", "vi");
    localStorage.setItem("hub-theme-default-version", "light-default-v1");
    localStorage.setItem("hub-theme", "light");
  });

  const page = await context.newPage();
  const logs = await wirePage(page);
  const checks = [];
  await gotoHome(page);
  const screenshot = screenshotPath("desktop-reduced-motion");
  await page.screenshot({ fullPage: false, path: screenshot });

  const mediaMatches = await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const initialIndex = await activeDot(page);
  await page.waitForTimeout(8500);
  const afterTimer = await activeDot(page);
  await page.locator(".portal-hero-carousel").first().focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);
  const afterManual = await activeDot(page);

  checks.push(
    check("reduced-motion-media-matches", mediaMatches, { mediaMatches }),
    check("reduced-motion-does-not-auto-rotate", initialIndex === afterTimer, { afterTimer, initialIndex }),
    check("reduced-motion-manual-navigation-still-works", afterManual === (initialIndex + 1) % 3, {
      afterManual,
      initialIndex
    }),
    check("reduced-motion-console-clean", logs.consoleErrors.length === 0, { consoleErrors: logs.consoleErrors }),
    check("reduced-motion-network-clean", logs.badResponses.length === 0, { badResponses: logs.badResponses }),
    check("reduced-motion-screenshot-written", fs.existsSync(screenshot), { screenshot })
  );

  await context.close();
  return { checks, name: "desktop-reduced-motion", screenshot };
}

async function dispatchTouchSwipe(context, page, locator, startRatioX, endRatioX, ratioY = 0.5) {
  const client = await context.newCDPSession(page);
  const box = await locator.boundingBox();
  const y = box.y + box.height * ratioY;
  const startX = box.x + box.width * startRatioX;
  const midX = box.x + box.width * ((startRatioX + endRatioX) / 2);
  const endX = box.x + box.width * endRatioX;

  await client.send("Input.dispatchTouchEvent", {
    touchPoints: [{ id: 1, radiusX: 4, radiusY: 4, x: startX, y }],
    type: "touchStart"
  });
  await client.send("Input.dispatchTouchEvent", {
    touchPoints: [{ id: 1, radiusX: 4, radiusY: 4, x: midX, y }],
    type: "touchMove"
  });
  await client.send("Input.dispatchTouchEvent", {
    touchPoints: [{ id: 1, radiusX: 4, radiusY: 4, x: endX, y }],
    type: "touchMove"
  });
  await client.send("Input.dispatchTouchEvent", { touchPoints: [], type: "touchEnd" });
  await page.waitForTimeout(450);
}

async function dispatchTouchVertical(context, page, locator) {
  const client = await context.newCDPSession(page);
  const box = await locator.boundingBox();
  const x = box.x + box.width * 0.5;
  const startY = box.y + box.height * 0.28;
  const endY = box.y + box.height * 0.78;

  await client.send("Input.dispatchTouchEvent", {
    touchPoints: [{ id: 2, radiusX: 4, radiusY: 4, x, y: startY }],
    type: "touchStart"
  });
  await client.send("Input.dispatchTouchEvent", {
    touchPoints: [{ id: 2, radiusX: 4, radiusY: 4, x: x + 8, y: endY }],
    type: "touchMove"
  });
  await client.send("Input.dispatchTouchEvent", { touchPoints: [], type: "touchEnd" });
  await page.waitForTimeout(450);
}

async function runMobileTouch(browser) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    viewport: { height: 844, width: 390 }
  });
  await context.addInitScript(() => {
    localStorage.setItem("hub-lang", "vi");
    localStorage.setItem("hub-theme-default-version", "light-default-v1");
    localStorage.setItem("hub-theme", "light");
  });

  const page = await context.newPage();
  const logs = await wirePage(page);
  const checks = [];
  await gotoHome(page);
  const screenshot = screenshotPath("mobile-touch");
  await page.screenshot({ fullPage: false, path: screenshot });

  const carousel = page.locator(".portal-hero-carousel").first();
  const metrics = await collectBaseMetrics(page);
  const initialIndex = metrics.activeIndex;
  await dispatchTouchSwipe(context, page, carousel, 0.82, 0.18);
  const afterLeftSwipe = await activeDot(page);
  await dispatchTouchVertical(context, page, carousel);
  const afterVerticalDrag = await activeDot(page);
  await dispatchTouchSwipe(context, page, carousel, 0.82, 0.18);
  const afterSecondLeftSwipe = await activeDot(page);
  const modalCountAfterInfoSwipe = await page.locator(".safety-bulletin-modal, .feed-detail-modal, .modal-backdrop").count();
  await dispatchTouchSwipe(context, page, carousel, 0.18, 0.82);
  const afterRightSwipe = await activeDot(page);

  checks.push(
    check("mobile-ticker-removed", metrics.tickerCount === 0, { tickerCount: metrics.tickerCount }),
    check("mobile-dots-hidden-but-present", metrics.dotCount === 3 && (await page.locator(".hero-carousel-dots button:visible").count()) === 0, {
      dotCount: metrics.dotCount
    }),
    check("mobile-touch-action-pan-y", metrics.carousel.touchAction === "pan-y", { touchAction: metrics.carousel.touchAction }),
    check("mobile-left-swipe-advances", afterLeftSwipe === (initialIndex + 1) % 3, {
      afterLeftSwipe,
      initialIndex
    }),
    check("mobile-vertical-drag-does-not-change-slide", afterVerticalDrag === afterLeftSwipe, {
      afterLeftSwipe,
      afterVerticalDrag
    }),
    check("mobile-second-left-swipe-advances", afterSecondLeftSwipe === (afterLeftSwipe + 1) % 3, {
      afterLeftSwipe,
      afterSecondLeftSwipe
    }),
    check("mobile-right-swipe-goes-back", afterRightSwipe === afterLeftSwipe, {
      afterLeftSwipe,
      afterRightSwipe
    }),
    check("mobile-info-swipe-does-not-open-modal", modalCountAfterInfoSwipe === 0, { modalCountAfterInfoSwipe }),
    check("mobile-no-horizontal-overflow", !(await hasHorizontalOverflow(page)), {}),
    check("mobile-console-clean", logs.consoleErrors.length === 0, { consoleErrors: logs.consoleErrors }),
    check("mobile-network-clean", logs.badResponses.length === 0, { badResponses: logs.badResponses }),
    check("mobile-screenshot-written", fs.existsSync(screenshot), { screenshot })
  );

  await context.close();
  return { checks, metrics, name: "mobile-touch", screenshot };
}

ensureDir(reportsDir);
ensureDir(screenshotsDir);

const browser = await chromium.launch({ headless: true });
const cases = [];

try {
  cases.push(await runNormalDesktop(browser));
  cases.push(await runReducedMotion(browser));
  cases.push(await runMobileTouch(browser));
} finally {
  await browser.close();
}

const checks = cases.flatMap((item) => item.checks.map((result) => ({ ...result, case: item.name })));
const failed = checks.filter((item) => !item.pass);
const report = {
  baseUrl,
  checkedAt: new Date().toISOString(),
  checks,
  failed,
  ok: failed.length === 0,
  pass: failed.length === 0,
  summary: {
    failed: failed.length,
    passed: checks.length - failed.length,
    total: checks.length,
    warnings: 0
  },
  screenshots: cases.map((item) => ({ name: item.name, screenshot: item.screenshot }))
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (failed.length > 0) {
  console.error(`Home carousel UI audit failed: ${failed.length} failed check(s).`);
  console.error(JSON.stringify({ failed, reportPath }, null, 2));
  process.exit(1);
}

console.log(`Home carousel UI audit passed: ${checks.length} checks.`);
console.log(`Report: ${reportPath}`);
