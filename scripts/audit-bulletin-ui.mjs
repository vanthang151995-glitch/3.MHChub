import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { mojibakeScore } from "../server/core/textEncoding.js";

const readArg = (name, fallback) => {
  const index = process.argv.lastIndexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
};

const baseUrl = readArg("--url", process.env.VERIFY_BASE_URL || "http://127.0.0.1:3333/");
const screenshotDir = readArg("--screenshots", path.join("qa", "screenshots"));
const reportsDir = path.join(process.cwd(), "qa", "reports");
const reportPath = path.join(reportsDir, "bulletin-ui-audit.json");
const expectedPointCount = Number(readArg("--expected-points", process.env.EXPECTED_BULLETIN_POINTS || "38"));
const targetText = readArg("--target", "T05/2026");
const expectedUpdatedByName = String.fromCodePoint(
  0x4e, 0x67, 0x75, 0x79, 0x1ec5, 0x6e, 0x20, 0x56, 0x103, 0x6e, 0x20,
  0x54, 0x68, 0x1eaf, 0x6e, 0x67, 0x20, 0x2d, 0x20, 0x50, 0x45, 0x31
);
const auditSourceText = fs.readFileSync(new URL(import.meta.url), "utf8");

const viewports = [
  { name: "tv-light", theme: "light", width: 1920, height: 1080 },
  { name: "desktop-light", theme: "light", width: 1440, height: 900 },
  { name: "laptop-light", theme: "light", width: 1366, height: 768 },
  { name: "mobile-light", theme: "light", width: 390, height: 900, deviceScaleFactor: 2, mobile: true },
  { name: "desktop-dark", theme: "dark", width: 1440, height: 900 },
  { name: "mobile-dark", theme: "dark", width: 390, height: 900, deviceScaleFactor: 2, mobile: true }
];

const ensureDir = (directory) => {
  fs.mkdirSync(directory, { recursive: true });
};

const check = (name, pass, evidence = {}) => ({
  name,
  pass: Boolean(pass),
  evidence
});

const brokenGlyphCodepoints = new Set([
  0xfffd, 0x76fb, 0x862f, 0x9edb, 0xff61, 0xff6f, 0xff70, 0xff84, 0xff8a, 0xff9e
]);

const hasKnownMojibake = (text) => {
  const value = String(text || "");
  return mojibakeScore(value) > 0
    || /Nguy\?|Th\?ng|V\?n/i.test(value)
    || [...value].some((char) => brokenGlyphCodepoints.has(char.codePointAt(0)));
};

const normalizePath = (value) => path.resolve(value);

const screenshotPath = (viewportName, state) =>
  path.join(screenshotDir, `bulletin-ui-${state}-${viewportName}.png`);

async function runViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor || 1
  });

  await context.addInitScript((theme) => {
    localStorage.setItem("hub-lang", "vi");
    localStorage.setItem("hub-theme-default-version", "light-default-v1");
    localStorage.setItem("hub-theme", theme);
  }, viewport.theme || "light");

  const page = await context.newPage();
  const consoleErrors = [];
  const badResponses = [];
  const checks = [];

  checks.push(check("audit-source-has-no-known-mojibake", !hasKnownMojibake(auditSourceText), {}));

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
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

  const mainResponse = await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 25000 });
  const pageTitle = await page.title();
  const bodyTextBefore = await page.locator("body").innerText();
  const homeScreenshot = normalizePath(screenshotPath(viewport.name, "home"));
  await page.screenshot({ path: homeScreenshot, fullPage: false });

  checks.push(check("page-loaded", mainResponse?.ok(), {
    status: mainResponse?.status(),
    title: pageTitle,
    url: page.url()
  }));
  checks.push(check("home-not-blank", bodyTextBefore.trim().length > 200, {
    textLength: bodyTextBefore.trim().length
  }));
  checks.push(check("no-framework-overlay-before-interaction", !(await page.locator("vite-error-overlay, .vite-error-overlay, [data-nextjs-dialog-overlay]").count()), {}));

  await page.locator(".bulletin-heading-more").first().click();
  await page.locator(".feed-detail-modal").waitFor({ state: "visible", timeout: 12000 });
  const feedScreenshot = normalizePath(screenshotPath(viewport.name, "feed"));
  await page.screenshot({ path: feedScreenshot, fullPage: false });

  const targetRow = page.locator(".feed-detail-row-button").filter({ hasText: targetText }).first();
  const targetRows = await targetRow.count();
  checks.push(check("target-bulletin-row-visible", targetRows > 0, { targetText, targetRows }));
  if (targetRows <= 0) {
    throw Object.assign(new Error(`Target bulletin row not found: ${targetText}`), { checks });
  }

  const feedMetrics = await page.evaluate(({ targetText }) => {
    const row = [...document.querySelectorAll(".feed-detail-row-button")]
      .find((element) => element.innerText.includes(targetText));
    const points = row ? [...row.querySelectorAll(".feed-detail-point")] : [];
    const pointMetrics = points.map((point) => ({
      className: point.className,
      index: point.querySelector(".feed-detail-point-index")?.textContent?.trim() || "",
      status: point.querySelector("em")?.textContent?.trim() || "",
      title: point.querySelector("strong")?.textContent?.trim() || ""
    }));

    return {
      hasOpenDetailCue: Boolean(row?.querySelector(".feed-detail-row-title span svg")),
      levelText: row?.querySelector(".feed-detail-level")?.textContent?.trim() || "",
      pointMetrics,
      rowTextLength: row?.innerText?.trim().length || 0,
      summaryLength: row?.querySelector(".feed-detail-summary")?.textContent?.trim().length || 0
    };
  }, { targetText });

  await targetRow.click();
  await page.locator(".safety-bulletin-modal").waitFor({ state: "visible", timeout: 12000 });
  await page.locator(".bulletin-point-card").first().waitFor({ state: "visible", timeout: 12000 });

  const modalScreenshot = normalizePath(screenshotPath(viewport.name, "modal"));
  await page.screenshot({ path: modalScreenshot, fullPage: false });

  const bodyTextAfter = await page.locator("body").innerText();
  const pointCards = await page.locator(".bulletin-point-card").count();
  const focusItems = await page.locator(".bulletin-focus-item").count();
  const metaCards = await page.locator(".bulletin-meta-card").count();
  const priorityChips = await page.locator(".bulletin-point-priority").count();
  const visibleModalTitle = await page.locator(".safety-bulletin-modal h2").innerText();
  const modalMetrics = await page.evaluate(() => {
    const getRect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        bottom: Math.round(rect.bottom * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        top: Math.round(rect.top * 10) / 10,
        width: Math.round(rect.width * 10) / 10
      };
    };
    const body = document.querySelector(".bulletin-modal-body");
    const firstPoint = document.querySelector(".bulletin-point-card");
    const bodyRect = body?.getBoundingClientRect();
    const firstPointRect = firstPoint?.getBoundingClientRect();
    const pointCards = [...document.querySelectorAll(".bulletin-point-card")];
    const priorityChips = [...document.querySelectorAll(".bulletin-point-priority")].map((chip) => {
      const rect = chip.getBoundingClientRect();
      return {
        className: chip.className,
        height: Math.round(rect.height * 10) / 10,
        text: chip.textContent.trim(),
        width: Math.round(rect.width * 10) / 10
      };
    });
    const focusStatuses = [...document.querySelectorAll(".bulletin-focus-status")].map((item) => item.textContent.trim());
    const pointToneCounts = pointCards.reduce((acc, point) => {
      const tone = ["critical", "warning", "good", "info"].find((item) => point.classList.contains(item)) || "other";
      acc[tone] = (acc[tone] || 0) + 1;
      return acc;
    }, {});

    return {
      body: getRect(".bulletin-modal-body"),
      bodyClientHeight: body?.clientHeight || 0,
      bodyScrollHeight: body?.scrollHeight || 0,
      firstFocus: getRect(".bulletin-focus-item"),
      firstPoint: getRect(".bulletin-point-card"),
      firstPointVisible:
        Boolean(bodyRect && firstPointRect && firstPointRect.top < bodyRect.bottom && firstPointRect.bottom > bodyRect.top),
      focusPanel: getRect(".bulletin-focus-panel"),
      focusStatuses,
      header: getRect(".bulletin-modal-header"),
      modal: getRect(".safety-bulletin-modal"),
      pointNumbers: [...document.querySelectorAll(".bulletin-point-index b")].map((element) => element.textContent.trim()),
      pointSections: [...document.querySelectorAll(".bulletin-point-section")].map((section) => ({
        className: section.className,
        count: section.querySelectorAll(".bulletin-point-card").length,
        label: section.querySelector(".bulletin-section-header strong")?.textContent?.trim() || "",
        numbers: [...section.querySelectorAll(".bulletin-point-index b")].map((element) => element.textContent.trim())
      })),
      pointToneCounts,
      priorityChips,
      searchInputVisible: Boolean(document.querySelector(".bulletin-point-search input")),
      sectionButtons: [...document.querySelectorAll(".bulletin-section-nav button")].map((button) => ({
        count: button.querySelector("b")?.textContent?.trim() || "",
        label: button.querySelector("span")?.textContent?.trim() || ""
      })),
      summary: getRect(".bulletin-modal-summary")
    };
  });
  const userNameVisible = bodyTextAfter.includes(expectedUpdatedByName);
  const expectedNumbers = Array.from({ length: expectedPointCount }, (_, index) => String(index + 1).padStart(2, "0"));
  const sortedPointNumbers = [...modalMetrics.pointNumbers].sort((a, b) => Number(a) - Number(b));
  const pointNumbersComplete = expectedNumbers.every((number, index) => sortedPointNumbers[index] === number);
  const sectionNumbersAscending = modalMetrics.pointSections.every((section) =>
    section.numbers.every((number, index, numbers) => index === 0 || Number(numbers[index - 1]) < Number(number))
  );
  const priorityChipsReadable = modalMetrics.priorityChips.length === expectedPointCount
    && modalMetrics.priorityChips.every((chip) => chip.text && chip.width >= 42 && chip.height >= 18);
  const feedToneKinds = new Set(feedMetrics.pointMetrics.flatMap((point) =>
    ["critical", "warning", "good", "info"].filter((tone) => point.className.includes(tone))
  ));

  checks.push(check("modal-title-is-target-bulletin", visibleModalTitle.includes(targetText), {
    visibleModalTitle,
    targetText
  }));
  checks.push(check("full-point-count-visible", pointCards === expectedPointCount, {
    expectedPointCount,
    pointCards
  }));
  checks.push(check("focus-points-visible", focusItems >= 1, { focusItems }));
  checks.push(check("priority-chip-per-point", priorityChips === expectedPointCount, {
    expectedPointCount,
    priorityChips
  }));
  checks.push(check("feed-row-structured-points", feedMetrics.pointMetrics.length >= 5 && feedMetrics.pointMetrics[0]?.index === "01", {
    feedMetrics
  }));
  checks.push(check("feed-row-has-level-and-open-cue", Boolean(feedMetrics.levelText) && feedMetrics.hasOpenDetailCue, {
    feedMetrics
  }));
  checks.push(check("feed-row-point-tones-visible", feedToneKinds.size >= 2, {
    feedToneKinds: [...feedToneKinds],
    pointMetrics: feedMetrics.pointMetrics
  }));
  checks.push(check("modal-point-numbering-complete", pointCards === expectedPointCount && pointNumbersComplete, {
    expectedNumbers,
    pointNumbers: modalMetrics.pointNumbers,
    sortedPointNumbers
  }));
  checks.push(check("modal-section-numbering-ascending", sectionNumbersAscending, {
    pointSections: modalMetrics.pointSections
  }));
  checks.push(check("modal-content-groups-visible", modalMetrics.sectionButtons.length >= 4 && modalMetrics.pointSections.length >= 4, {
    pointSections: modalMetrics.pointSections,
    sectionButtons: modalMetrics.sectionButtons
  }));
  checks.push(check("modal-point-tones-varied", (
    (modalMetrics.pointToneCounts.critical || 0) > 0 &&
    (modalMetrics.pointToneCounts.warning || 0) > 0 &&
    (modalMetrics.pointToneCounts.good || 0) > 0
  ), {
    pointToneCounts: modalMetrics.pointToneCounts
  }));
  checks.push(check("modal-priority-chips-readable", priorityChipsReadable, {
    priorityChips: modalMetrics.priorityChips.slice(0, 6),
    total: modalMetrics.priorityChips.length
  }));
  checks.push(check("modal-search-available", modalMetrics.searchInputVisible, {}));
  checks.push(check("focus-priority-status-visible", modalMetrics.focusStatuses.length >= focusItems && modalMetrics.focusStatuses.every(Boolean), {
    focusItems,
    focusStatuses: modalMetrics.focusStatuses
  }));
  checks.push(check("mobile-modal-focus-panel-compact", !viewport.mobile || (
    (modalMetrics.focusPanel?.height || 0) <= 360 &&
    (modalMetrics.firstFocus?.height || 0) <= 76
  ), {
    firstFocus: modalMetrics.firstFocus,
    focusPanel: modalMetrics.focusPanel,
    viewport: viewport.name
  }));
  checks.push(check("mobile-modal-first-point-visible-without-scroll", !viewport.mobile || modalMetrics.firstPointVisible, {
    body: modalMetrics.body,
    firstPoint: modalMetrics.firstPoint,
    firstPointVisible: modalMetrics.firstPointVisible,
    viewport: viewport.name
  }));
  checks.push(check("meta-cards-visible", metaCards >= 2, { metaCards }));
  checks.push(check("updated-by-name-readable", userNameVisible, {
    expected: expectedUpdatedByName
  }));
  checks.push(check("no-known-mojibake", !hasKnownMojibake(bodyTextAfter), {}));
  checks.push(check("no-console-errors", consoleErrors.length === 0, { consoleErrors }));
  checks.push(check("no-bad-network-responses", badResponses.length === 0, { badResponses }));
  checks.push(check("no-framework-overlay-after-interaction", !(await page.locator("vite-error-overlay, .vite-error-overlay, [data-nextjs-dialog-overlay]").count()), {}));

  await context.close();

  return {
    viewport: viewport.name,
    size: `${viewport.width}x${viewport.height}`,
    ok: checks.every((item) => item.pass),
    checks,
    screenshots: {
      home: homeScreenshot,
      feed: feedScreenshot,
      modal: modalScreenshot
    },
    feedMetrics,
    modalMetrics
  };
}

ensureDir(screenshotDir);

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    results.push(await runViewport(browser, viewport));
  }
} finally {
  await browser.close();
}

const failedChecks = results.flatMap((result) =>
  result.checks
    .filter((item) => !item.pass)
    .map((item) => ({ viewport: result.viewport, ...item }))
);

const payload = {
  ok: failedChecks.length === 0,
  generatedAtUtc: new Date().toISOString(),
  reportPath: path.relative(process.cwd(), reportPath).replace(/\\/g, "/"),
  baseUrl,
  targetText,
  expectedPointCount,
  summary: {
    total: results.reduce((sum, result) => sum + result.checks.length, 0),
    passed: results.reduce((sum, result) => sum + result.checks.filter((item) => item.pass).length, 0),
    failed: failedChecks.length
  },
  results,
  failedChecks
};

ensureDir(reportsDir);
fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify(payload, null, 2));

if (!payload.ok) {
  process.exit(1);
}
