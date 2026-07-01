import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const readArg = (name, fallback) => {
  const index = process.argv.lastIndexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
};

const baseUrl = readArg("--url", process.env.VERIFY_BASE_URL || "http://127.0.0.1:3333/");
const canonicalizeBrowserBaseUrl = (value) => {
  const url = new URL(value);
  if (url.hostname === "127.0.0.1" || url.hostname === "::1") {
    url.hostname = "localhost";
  }
  return url.toString();
};

const browserBaseUrl = canonicalizeBrowserBaseUrl(baseUrl);
const reportsDir = path.join(process.cwd(), "qa", "reports");
const screenshotsDir = path.join(process.cwd(), "qa", "screenshots");
const reportPath = path.join(reportsDir, "scroll-stability-audit.json");
const auditUsername = process.env.MHCHUB_AUDIT_USERNAME || process.env.AUDIT_ADMIN_USERNAME || process.env.ADMIN_USERNAME || "";
const auditPassword = process.env.MHCHUB_AUDIT_PASSWORD || process.env.AUDIT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || process.env.ADMIN_PIN || "";
const authCookieName = "mhchub_admin_auth";

const homeSectionTargets = [
  { label: "command overview", selector: ".page > .command-overview-grid" },
  { label: "metric row", selector: ".page > .metric-row" }
];

const testCases = [
  { allowShortPage: true, name: "home-light-1440", path: "/", routeName: "home", sectionTargets: homeSectionTargets, theme: "light", width: 1440, height: 900 },
  { name: "home-light-1366", path: "/", routeName: "home", sectionTargets: homeSectionTargets, theme: "light", width: 1366, height: 768 },
  { name: "home-dark-1366", path: "/", routeName: "home", sectionTargets: homeSectionTargets, theme: "dark", width: 1366, height: 768 },
  { name: "home-light-390-mobile", path: "/", routeName: "home", sectionTargets: homeSectionTargets, theme: "light", width: 390, height: 900, deviceScaleFactor: 2 },
  { name: "safety-light-1366", path: "/safety-6s", routeName: "safety", theme: "light", width: 1366, height: 768 },
  { name: "safety-dark-1366", path: "/safety-6s", routeName: "safety", theme: "dark", width: 1366, height: 768 },
  { name: "safety-light-390-mobile", path: "/safety-6s", routeName: "safety", theme: "light", width: 390, height: 900, deviceScaleFactor: 2 },
  { name: "documents-light-1366", path: "/documents", routeName: "documents", theme: "light", width: 1366, height: 768 },
  { name: "documents-dark-1366", path: "/documents", routeName: "documents", theme: "dark", width: 1366, height: 768 },
  { name: "documents-light-390-mobile", path: "/documents", routeName: "documents", theme: "light", width: 390, height: 900, deviceScaleFactor: 2 },
  { allowShortPage: true, name: "login-light-390-mobile", path: "/login", routeName: "login", theme: "light", width: 390, height: 900, deviceScaleFactor: 2 },
  { allowShortPage: true, name: "login-dark-390-mobile", path: "/login", routeName: "login", theme: "dark", width: 390, height: 900, deviceScaleFactor: 2 }
];

const ensureDir = (directory) => fs.mkdirSync(directory, { recursive: true });

const check = (name, pass, evidence = {}) => ({
  evidence,
  name,
  pass: Boolean(pass)
});

const routeUrl = (routePath) => new URL(routePath, browserBaseUrl).toString();

const loopbackCookieOrigins = (...values) => {
  const origins = [];
  for (const value of values) {
    const url = new URL(value);
    origins.push(url.origin);
    if (url.hostname === "localhost") {
      const alternate = new URL(url);
      alternate.hostname = "127.0.0.1";
      origins.push(alternate.origin);
    } else if (url.hostname === "127.0.0.1" || url.hostname === "::1") {
      const alternate = new URL(url);
      alternate.hostname = "localhost";
      origins.push(alternate.origin);
    }
  }
  return [...new Set(origins)];
};

const readSetCookieValue = (header, name) => {
  for (const entry of String(header || "").split(/,(?=[^;,]+=)/)) {
    const firstPart = entry.split(";")[0] || "";
    const separatorIndex = firstPart.indexOf("=");
    if (separatorIndex <= 0) continue;
    if (firstPart.slice(0, separatorIndex).trim() !== name) continue;
    return decodeURIComponent(firstPart.slice(separatorIndex + 1).trim());
  }
  return "";
};

async function loginForProtectedRoute(page, testCase) {
  if (testCase.routeName !== "safety") return null;
  if (!auditUsername || !auditPassword) {
    return { ok: false, reason: "missing-credentials" };
  }

  const context = page.context();
  const response = await context.request.post(routeUrl("/api/auth/login"), {
    data: {
      password: auditPassword,
      username: auditUsername
    }
  });
  const setCookie = response.headers()["set-cookie"] || "";
  const authCookieValue = readSetCookieValue(setCookie, authCookieName);

  if (authCookieValue) {
    await context.addCookies(loopbackCookieOrigins(baseUrl, browserBaseUrl).map((url) => ({
      httpOnly: true,
      name: authCookieName,
      sameSite: "Lax",
      url,
      value: authCookieValue
    })));
  }

  const meResponse = response.ok() ? await context.request.get(routeUrl("/api/auth/me")) : null;

  return {
    hasCookie: Boolean(authCookieValue),
    meOk: meResponse ? meResponse.ok() : false,
    meStatus: meResponse ? meResponse.status() : null,
    ok: response.ok() && (meResponse ? meResponse.ok() : true),
    status: response.status()
  };
}

async function collectScrollMetrics(page, sectionTargets = []) {
  return page.evaluate(async ({ sectionTargets }) => {
    const styleOf = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        bottom: rect.bottom,
        contentVisibility: style.contentVisibility,
        containIntrinsicSize: style.containIntrinsicSize,
        height: rect.height,
        selector,
        top: rect.top
      };
    };

    const documentStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const scrollingElement = document.scrollingElement || document.documentElement;
    const maxY = Math.max(0, scrollingElement.scrollHeight - window.innerHeight);
    const frameDeltas = [];
    const topbarSamples = [];
    window.__mhchubLayoutShiftScore = 0;

    const animatedScrollTo = (targetY, durationMs = 220) =>
      new Promise((resolve) => {
        const startY = window.scrollY;
        const start = performance.now();
        let last = start;
        const localFrameDeltas = [];

        const step = (now) => {
          localFrameDeltas.push(now - last);
          last = now;
          const progress = Math.min(1, (now - start) / durationMs);
          const eased = 1 - Math.pow(1 - progress, 3);
          window.scrollTo({ behavior: "instant", top: startY + (targetY - startY) * eased });

          if (progress < 1) {
            requestAnimationFrame(step);
            return;
          }

          resolve(localFrameDeltas.filter((value) => value > 0));
        };

        requestAnimationFrame(step);
      });

    const topbarElement = document.querySelector(".topbar");
    const expectedTopbarTop = topbarElement ? Number.parseFloat(getComputedStyle(topbarElement).top) || 0 : 0;
    const targets = maxY > 0
      ? [0.22, 0.48, 0.74, 1].map((ratio) => Math.round(maxY * ratio))
      : [0];

    for (const targetY of targets) {
      const deltas = await animatedScrollTo(targetY);
      frameDeltas.push(...deltas);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const topbar = document.querySelector(".topbar")?.getBoundingClientRect();
      topbarSamples.push({
        scrollY: Math.round(window.scrollY),
        topbarBottom: topbar ? Math.round(topbar.bottom) : null,
        topbarTop: topbar ? Math.round(topbar.top) : null
      });
    }

    const horizontalOverflow = Math.max(0, document.body.scrollWidth - document.documentElement.clientWidth);
    const visibleControls = [...document.querySelectorAll("a,button")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          height: rect.height,
          text: (element.innerText || element.getAttribute("aria-label") || "").trim().slice(0, 80),
          width: rect.width
        };
      });

    return {
      averageFrameMs: Number((frameDeltas.length
        ? frameDeltas.reduce((sum, value) => sum + value, 0) / frameDeltas.length
        : 0).toFixed(2)),
      bodyOverflowX: bodyStyle.overflowX,
      bodyOverscrollY: bodyStyle.overscrollBehaviorY,
      bodyTextLength: document.body.innerText.trim().length,
      contentVisibilitySupported: CSS.supports("content-visibility", "auto"),
      docClientWidth: document.documentElement.clientWidth,
      frameCount: frameDeltas.length,
      horizontalOverflow,
      htmlScrollBehavior: documentStyle.scrollBehavior,
      layoutShiftScore: Number((window.__mhchubLayoutShiftScore || 0).toFixed(4)),
      maxFrameMs: Number(Math.max(0, ...frameDeltas).toFixed(2)),
      maxY,
      pathname: window.location.pathname,
      scrollHeight: scrollingElement.scrollHeight,
      scrollY: Math.round(window.scrollY),
      sectionStyles: sectionTargets.map((item) => ({ ...item, style: styleOf(item.selector) })),
      theme: document.documentElement.dataset.theme || "",
      topbarExpectedTop: expectedTopbarTop,
      topbarSamples,
      visibleControlCount: visibleControls.length,
      visibleControls: visibleControls.slice(0, 12),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    };
  }, { sectionTargets });
}

function evaluateMetrics(testCase, metrics, screenshot, consoleErrors) {
  const sectionStyles = metrics.sectionStyles || [];
  const contentVisibilityOk = sectionStyles.length === 0
    || !metrics.contentVisibilitySupported
    || sectionStyles.every((item) =>
      item.style
        && item.style.contentVisibility === "auto"
        && item.style.containIntrinsicSize
        && item.style.containIntrinsicSize !== "none"
    );
  const topbarSticky = metrics.topbarSamples.every((sample) =>
    sample.topbarTop !== null && Math.abs(sample.topbarTop - metrics.topbarExpectedTop) <= 1
  );
  const scrolledNearBottom = metrics.maxY <= 0 || metrics.scrollY >= metrics.maxY - 4;
  const minScrollableY = Math.max(140, metrics.viewportHeight * (testCase.minScrollableRatio ?? 0.35));
  const routeScrollableEnough = metrics.maxY > minScrollableY;
  const minFrameCount = testCase.allowShortPage && metrics.maxY < minScrollableY ? 8 : 20;
  const frameBudgetOk = metrics.frameCount >= minFrameCount && metrics.averageFrameMs <= 45 && metrics.maxFrameMs <= 180;

  return [
    check("scroll-route-loaded", metrics.bodyTextLength > 80 && metrics.theme === testCase.theme && metrics.pathname === testCase.path, {
      bodyTextLength: metrics.bodyTextLength,
      expectedPath: testCase.path,
      expectedTheme: testCase.theme,
      pathname: metrics.pathname,
      routeName: testCase.routeName,
      theme: metrics.theme
    }),
    check("scroll-page-is-scrollable", testCase.allowShortPage ? metrics.maxY >= 0 : routeScrollableEnough, {
      allowShortPage: Boolean(testCase.allowShortPage),
      maxY: metrics.maxY,
      minScrollableY,
      scrollHeight: metrics.scrollHeight,
      viewportHeight: metrics.viewportHeight
    }),
    check("scroll-reaches-bottom", scrolledNearBottom, {
      maxY: metrics.maxY,
      scrollY: metrics.scrollY
    }),
    check("scroll-frame-budget-stable", frameBudgetOk, {
      averageFrameMs: metrics.averageFrameMs,
      frameCount: metrics.frameCount,
      maxFrameMs: metrics.maxFrameMs,
      minFrameCount
    }),
    check("scroll-layout-shift-low", metrics.layoutShiftScore <= 0.1, {
      layoutShiftScore: metrics.layoutShiftScore
    }),
    check("scroll-topbar-remains-sticky", topbarSticky, {
      expectedTopbarTop: metrics.topbarExpectedTop,
      topbarSamples: metrics.topbarSamples
    }),
    check("scroll-no-horizontal-overflow", metrics.horizontalOverflow <= 1 && metrics.bodyOverflowX === "hidden", {
      bodyOverflowX: metrics.bodyOverflowX,
      docClientWidth: metrics.docClientWidth,
      horizontalOverflow: metrics.horizontalOverflow,
      viewportWidth: metrics.viewportWidth
    }),
    check("scroll-overscroll-contained", metrics.bodyOverscrollY === "contain", {
      bodyOverscrollY: metrics.bodyOverscrollY
    }),
    check("scroll-smooth-enabled", metrics.htmlScrollBehavior === "smooth", {
      htmlScrollBehavior: metrics.htmlScrollBehavior
    }),
    check("below-fold-sections-use-content-visibility", contentVisibilityOk, {
      contentVisibilitySupported: metrics.contentVisibilitySupported,
      sectionStyles
    }),
    check("scroll-screenshot-written", fs.existsSync(screenshot), { screenshot }),
    check("scroll-console-clean", consoleErrors.length === 0, { consoleErrors, testCase: testCase.name })
  ];
}

ensureDir(reportsDir);
ensureDir(screenshotsDir);

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const testCase of testCases) {
    const page = await browser.newPage({
      deviceScaleFactor: testCase.deviceScaleFactor ?? (testCase.width <= 430 ? 2 : 1),
      viewport: { width: testCase.width, height: testCase.height }
    });
    const consoleErrors = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });

    await page.addInitScript(({ theme }) => {
      localStorage.setItem("hub-lang", "vi");
      localStorage.setItem("hub-theme-default-version", "light-default-v1");
      localStorage.setItem("hub-theme", theme);
      window.__mhchubLayoutShiftScore = 0;
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              window.__mhchubLayoutShiftScore += entry.value;
            }
          }
        });
        observer.observe({ buffered: true, type: "layout-shift" });
      } catch {
        window.__mhchubLayoutShiftScore = 0;
      }
    }, { theme: testCase.theme });

    const authSetup = await loginForProtectedRoute(page, testCase);
    await page.goto(routeUrl(testCase.path), { waitUntil: "networkidle", timeout: 25000 });
    const metrics = await collectScrollMetrics(page, testCase.sectionTargets || []);
    const screenshot = path.join(screenshotsDir, `scroll-stability-${testCase.name}.png`);
    await page.screenshot({ fullPage: false, path: screenshot });
    const checks = evaluateMetrics(testCase, metrics, screenshot, consoleErrors);

    results.push({
      authSetup,
      checks,
      metrics,
      name: testCase.name,
      path: testCase.path,
      routeName: testCase.routeName,
      screenshot,
      size: `${testCase.width}x${testCase.height}`,
      theme: testCase.theme
    });

    await page.close();
  }
} finally {
  await browser.close();
}

const failedChecks = results.flatMap((result) =>
  result.checks
    .filter((item) => !item.pass)
    .map((item) => ({
      check: item.name,
      evidence: item.evidence,
      path: result.path,
      route: result.routeName,
      viewport: result.name
    }))
);
const allChecks = results.flatMap((result) => result.checks);
const summary = {
  failed: failedChecks.length,
  passed: allChecks.filter((item) => item.pass).length,
  total: allChecks.length
};

const report = {
  baseUrl,
  browserBaseUrl,
  failedChecks,
  generatedAtUtc: new Date().toISOString(),
  ok: failedChecks.length === 0,
  results,
  summary
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  failedChecks,
  ok: report.ok,
  reportPath,
  summary,
  viewports: results.map((result) => ({
    averageFrameMs: result.metrics.averageFrameMs,
    layoutShiftScore: result.metrics.layoutShiftScore,
    maxFrameMs: result.metrics.maxFrameMs,
    name: result.name,
    path: result.path,
    route: result.routeName,
    screenshot: result.screenshot
  }))
}, null, 2));

if (!report.ok) {
  process.exit(1);
}
