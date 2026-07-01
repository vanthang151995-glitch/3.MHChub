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
  try {
    const url = new URL(value);
    if (url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "[::1]") {
      url.hostname = "localhost";
    }
    return url.toString();
  } catch {
    return value;
  }
};
const browserBaseUrl = canonicalizeBrowserBaseUrl(baseUrl);
const reportsDir = path.join(process.cwd(), "qa", "reports");
const screenshotsDir = path.join(process.cwd(), "qa", "screenshots");
const reportPath = path.join(reportsDir, "zoom-background-stability-audit.json");
const stylesPath = path.join(process.cwd(), "src", "styles.css");

const viewports = [
  { deviceScaleFactor: 1, height: 2160, name: "desktop-3840-4k", physicalWidth: 3840, width: 3840 },
  { deviceScaleFactor: 1, height: 1080, name: "desktop-1920", physicalWidth: 1920, width: 1920 },
  { deviceScaleFactor: 0.8, height: 1350, name: "zoom80-2400", physicalWidth: 1920, width: 2400 },
  { deviceScaleFactor: 1.25, height: 864, name: "zoom125-1536", physicalWidth: 1920, width: 1536 },
  { deviceScaleFactor: 1.5, height: 720, name: "zoom150-1280", physicalWidth: 1920, width: 1280 },
  { deviceScaleFactor: 1, height: 768, name: "laptop-1366", physicalWidth: 1366, width: 1366 },
  { deviceScaleFactor: 2, height: 900, mobile: true, name: "mobile-390", physicalWidth: 780, width: 390 }
];

const routeCoverage = [
  { allowedPathnames: ["/safety-6s", "/login"], bodyTextMin: 800, bodyTextMinByPathname: { "/login": 400 }, name: "safety", path: "/safety-6s" },
  { bodyTextMin: 500, name: "documents", path: "/documents" },
  { bodyTextMin: 80, name: "login", path: "/login" }
];

const routeCoverageViewports = viewports.filter((testCase) =>
  ["desktop-1920", "zoom125-1536", "mobile-390"].includes(testCase.name)
);

const ensureDir = (directory) => fs.mkdirSync(directory, { recursive: true });

const check = (name, pass, evidence = {}) => ({
  evidence,
  name,
  pass: Boolean(pass)
});

const slug = (value) => String(value || "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const routeUrl = (routePath) => new URL(routePath, browserBaseUrl).toString();

const splitLayers = (value) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean);

const parseLayerWidth = (value) => {
  const match = String(value || "").match(/([\d.]+)px/);
  return match ? Number(match[1]) : null;
};

const deriveBackgroundMetrics = (metrics) => {
  const imageLayerWidth = parseLayerWidth(metrics?.imageLayerSize);
  const imageLayerPhysicalWidth = imageLayerWidth !== null
    ? Math.round(imageLayerWidth * metrics.viewportDevicePixelRatio)
    : null;

  return {
    imageLayerPhysicalWidth,
    imageLayerWidth
  };
};

async function collectMetrics(page, requestedImages) {
  return page.evaluate(({ requestedImages }) => {
    const bodyStyle = getComputedStyle(document.body);
    const bodyBeforeStyle = getComputedStyle(document.body, "::before");
    const hasFixedArtLayer = bodyBeforeStyle.content && bodyBeforeStyle.content !== "none";
    const backgroundLayerStyle = hasFixedArtLayer ? bodyBeforeStyle : bodyStyle;
    const imageLayerSize = String(backgroundLayerStyle.backgroundSize || "").split(",").map((item) => item.trim()).at(-1) || "";
    const imageLayerAttachment = String(backgroundLayerStyle.backgroundAttachment || "").split(",").map((item) => item.trim()).at(-1) || "";
    const imageLayerPosition = String(backgroundLayerStyle.backgroundPosition || "").split(",").map((item) => item.trim()).at(-1) || "";
    const performanceImages = performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => name.includes("/images/light-mode-background"));
    const textSampleSelectors = [
      ".topbar .topnav-status-pill strong",
      ".portal-menu-panel .panel-header h2",
      ".home-command-grid .directive-card-header h3",
      ".portal-link-card h3"
    ];
    const textSamples = textSampleSelectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const cssFontSize = Number.parseFloat(style.fontSize);

      if (!Number.isFinite(cssFontSize) || rect.width <= 0 || rect.height <= 0) return null;

      return {
        cssFontSize,
        fontWeight: style.fontWeight,
        physicalFontSize: cssFontSize * window.devicePixelRatio,
        rect: {
          height: rect.height,
          width: rect.width
        },
        selector,
        text: element.textContent.trim()
      };
    }).filter(Boolean);
    const textSample = textSamples[0] || null;

    return {
      backgroundAttachment: bodyStyle.backgroundAttachment,
      backgroundImage: bodyStyle.backgroundImage,
      backgroundPosition: bodyStyle.backgroundPosition,
      backgroundSize: bodyStyle.backgroundSize,
      backgroundLayerAttachment: backgroundLayerStyle.backgroundAttachment,
      backgroundLayerCssPosition: backgroundLayerStyle.position,
      backgroundLayerImage: backgroundLayerStyle.backgroundImage,
      backgroundLayerPosition: backgroundLayerStyle.backgroundPosition,
      backgroundLayerSize: backgroundLayerStyle.backgroundSize,
      backgroundLayerSource: hasFixedArtLayer ? "body::before" : "body",
      bodyBefore: {
        content: bodyBeforeStyle.content,
        position: bodyBeforeStyle.position,
        zIndex: bodyBeforeStyle.zIndex
      },
      bodyTextLength: document.body.innerText.trim().length,
      docClientWidth: document.documentElement.clientWidth,
      pathname: window.location.pathname,
      theme: document.documentElement.dataset.theme || "",
      imageLayerAttachment,
      imageLayerPosition,
      imageLayerSize,
      performanceImages,
      requestedImages,
      scrollWidth: document.documentElement.scrollWidth,
      textSample,
      textSamples,
      viewportDevicePixelRatio: window.devicePixelRatio,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    };
  }, { requestedImages });
}

function evaluateCase(testCase, metrics, screenshot, consoleErrors, options = {}) {
  const bodyTextMin = options.bodyTextMin ?? 800;
  const bodyTextMinByPathname = options.bodyTextMinByPathname || {};
  const effectiveBodyTextMin = bodyTextMinByPathname[metrics.pathname] ?? bodyTextMin;
  const allowedPathnames = options.allowedPathnames || [];
  const pathAllowed = allowedPathnames.length === 0 || allowedPathnames.includes(metrics.pathname);
  const requireTextSample = options.requireTextSample ?? true;
  const nonRateLimitConsoleErrors = consoleErrors.filter((message) => !/(?:status of 429|Too many requests|RATE_LIMITED)/i.test(message));
  const backgroundImages = [...new Set([...(metrics.performanceImages || []), ...(metrics.requestedImages || [])])];
  const uses4kWebp = backgroundImages.some((url) => url.includes("light-mode-background-4k.webp"));
  const usesMobileWebp = backgroundImages.some((url) => url.includes("light-mode-background-mobile.webp"));
  const usesLegacy1600 = backgroundImages.some((url) => url.includes("light-mode-background-1600.webp"));
  const usesExpectedBackground = testCase.mobile
    ? usesMobileWebp && !uses4kWebp && !usesLegacy1600
    : uses4kWebp && !usesMobileWebp && !usesLegacy1600;
  const { imageLayerPhysicalWidth, imageLayerWidth } = deriveBackgroundMetrics(metrics);
  const imageLayerPosition = String(metrics.imageLayerPosition || "").toLowerCase();
  const imageLayerCenteredTop = /center/.test(imageLayerPosition) || /50%/.test(imageLayerPosition);
  const imageLayerPinnedTop = /top/.test(imageLayerPosition) || /\b0%/.test(imageLayerPosition) || /\b0px/.test(imageLayerPosition);
  const imageLayerTracksViewport = imageLayerWidth !== null && Math.abs(imageLayerWidth - testCase.width) <= 2;
  const imageLayerKeepsPhysicalWidth = imageLayerPhysicalWidth !== null
    && Math.abs(imageLayerPhysicalWidth - testCase.physicalWidth) <= 3;
  const fixedArtLayerContract = metrics.backgroundLayerSource === "body::before"
    ? metrics.backgroundLayerCssPosition === "fixed"
    : (testCase.mobile ? metrics.imageLayerAttachment === "scroll" : metrics.imageLayerAttachment === "fixed");

  const checks = [
    check("zoom-background-page-loaded", pathAllowed && metrics.bodyTextLength > effectiveBodyTextMin, {
      allowedPathnames,
      bodyTextLength: metrics.bodyTextLength,
      bodyTextMin: effectiveBodyTextMin,
      pathname: metrics.pathname
    }),
    check("zoom-background-light-theme-applied", metrics.theme === "light", {
      expected: "light",
      pathname: metrics.pathname,
      theme: metrics.theme
    }),
    check("zoom-background-source-is-expected-webp", usesExpectedBackground, {
      backgroundImages,
      expected: testCase.mobile ? "light-mode-background-mobile.webp" : "light-mode-background-4k.webp"
    }),
    check("zoom-background-image-layer-not-cover", metrics.imageLayerSize !== "cover", {
      backgroundSize: metrics.backgroundSize,
      imageLayerSize: metrics.imageLayerSize
    }),
    check("zoom-background-image-layer-centered", imageLayerCenteredTop && imageLayerPinnedTop, {
      backgroundPosition: metrics.backgroundPosition,
      imageLayerPosition: metrics.imageLayerPosition
    }),
    check("zoom-background-layer-follows-css-viewport", imageLayerTracksViewport, {
      browserZoomContract: "100dvw makes the image layer shrink in CSS pixels as browser zoom increases",
      deviceScaleFactor: testCase.deviceScaleFactor,
      expectedWidth: testCase.width,
      imageLayerSize: metrics.imageLayerSize,
      imageLayerWidth,
      mobile: Boolean(testCase.mobile),
      viewportWidth: testCase.width
    }),
    check("zoom-background-visual-width-stays-with-device", imageLayerKeepsPhysicalWidth, {
      browserZoomContract: "the background stays the same physical width while text/layout zooms",
      deviceScaleFactor: testCase.deviceScaleFactor,
      expectedPhysicalWidth: testCase.physicalWidth,
      imageLayerPhysicalWidth,
      imageLayerWidth,
      viewportWidth: testCase.width
    }),
    check("zoom-background-attachment-contract", fixedArtLayerContract, {
      backgroundAttachment: metrics.backgroundAttachment,
      backgroundLayerCssPosition: metrics.backgroundLayerCssPosition,
      backgroundLayerSource: metrics.backgroundLayerSource,
      expected: "fixed body::before art layer, or legacy body attachment contract",
      imageLayerAttachment: metrics.imageLayerAttachment,
      mobile: Boolean(testCase.mobile)
    }),
    check("zoom-background-fixed-art-layer-contract", fixedArtLayerContract, {
      backgroundLayerCssPosition: metrics.backgroundLayerCssPosition,
      backgroundLayerSource: metrics.backgroundLayerSource,
      legacyImageLayerAttachment: metrics.imageLayerAttachment
    }),
    check("zoom-background-no-horizontal-overflow", metrics.scrollWidth <= metrics.docClientWidth + 1, {
      docClientWidth: metrics.docClientWidth,
      scrollWidth: metrics.scrollWidth
    }),
    check("zoom-background-console-clean", nonRateLimitConsoleErrors.length === 0, {
      consoleErrors: nonRateLimitConsoleErrors,
      ignoredRateLimitConsoleErrors: consoleErrors.filter((message) => !nonRateLimitConsoleErrors.includes(message))
    }),
    check("zoom-background-screenshot-written", fs.existsSync(screenshot), { screenshot })
  ];

  if (requireTextSample) {
    checks.splice(-2, 0, check("zoom-background-text-sample-present", Boolean(metrics.textSample), {
      textSample: metrics.textSample
    }));
  }

  return checks;
}

function evaluateZoomContract(results) {
  const desktop = results.find((result) => result.name === "desktop-1920");
  const zoom80 = results.find((result) => result.name === "zoom80-2400");
  const zoom125 = results.find((result) => result.name === "zoom125-1536");
  const zoom150 = results.find((result) => result.name === "zoom150-1280");
  const desktopBackground = deriveBackgroundMetrics(desktop?.metrics);
  const zoomBackground = deriveBackgroundMetrics(zoom125?.metrics);
  const zoomLevelComparisons = [zoom80, zoom125, zoom150].filter(Boolean).map((result) => {
    const background = deriveBackgroundMetrics(result.metrics);
    const textSamples = result.metrics?.textSamples || [];
    const sampleRatios = (desktop?.metrics?.textSamples || []).map((desktopSample) => {
      const zoomSample = textSamples.find((sample) => sample.selector === desktopSample.selector);
      if (!zoomSample) return null;

      return {
        desktopPhysicalFontSize: desktopSample.physicalFontSize,
        physicalRatio: zoomSample.physicalFontSize / desktopSample.physicalFontSize,
        selector: desktopSample.selector,
        zoomPhysicalFontSize: zoomSample.physicalFontSize
      };
    }).filter(Boolean);

    return {
      imageLayerPhysicalWidth: background.imageLayerPhysicalWidth,
      name: result.name,
      sampleRatios
    };
  });
  const desktopSamples = desktop?.metrics?.textSamples || [];
  const zoomSamples = zoom125?.metrics?.textSamples || [];
  const sampleComparisons = desktopSamples.map((desktopSample) => {
    const zoomSample = zoomSamples.find((sample) => sample.selector === desktopSample.selector);
    if (!zoomSample) return null;

    return {
      cssDelta: zoomSample.cssFontSize - desktopSample.cssFontSize,
      desktop: desktopSample,
      physicalRatio: zoomSample.physicalFontSize / desktopSample.physicalFontSize,
      selector: desktopSample.selector,
      zoom125: zoomSample
    };
  }).filter(Boolean);
  const strongZoomText = sampleComparisons.find((comparison) => comparison.physicalRatio >= 1.18);
  const titleComparison = sampleComparisons.find((comparison) => comparison.selector === ".portal-menu-panel .panel-header h2");
  const backgroundStable = desktopBackground.imageLayerPhysicalWidth !== null
    && zoomBackground.imageLayerPhysicalWidth !== null
    && Math.abs(desktopBackground.imageLayerPhysicalWidth - zoomBackground.imageLayerPhysicalWidth) <= 3;
  const cssTextSizeStable = sampleComparisons.length > 0
    ? sampleComparisons.every((comparison) => Math.abs(comparison.cssDelta) <= 2)
    : false;
  const titleStillGrows = titleComparison
    ? titleComparison.physicalRatio >= 1.08
    : false;
  const backgroundStableAcrossZoom = zoomLevelComparisons.length >= 3
    && zoomLevelComparisons.every((comparison) => Math.abs(comparison.imageLayerPhysicalWidth - desktopBackground.imageLayerPhysicalWidth) <= 3);
  const zoom80TextShrinks = zoomLevelComparisons
    .find((comparison) => comparison.name === "zoom80-2400")
    ?.sampleRatios.some((sample) => sample.physicalRatio <= 0.88) || false;
  const zoom150TextGrows = zoomLevelComparisons
    .find((comparison) => comparison.name === "zoom150-1280")
    ?.sampleRatios.some((sample) => sample.physicalRatio >= 1.32) || false;

  return [
    check("zoom-background-physical-image-stable-between-100-and-125", backgroundStable, {
      desktopPhysicalWidth: desktopBackground.imageLayerPhysicalWidth,
      zoom125PhysicalWidth: zoomBackground.imageLayerPhysicalWidth
    }),
    check("zoom-background-css-text-size-remains-responsive", cssTextSizeStable, {
      sampleComparisons
    }),
    check("zoom-background-visible-text-grows-at-125-zoom", Boolean(strongZoomText) && titleStillGrows, {
      browserZoomContract: "browser zoom should enlarge text/UI while the background art keeps the same physical width",
      strongZoomText,
      titleComparison
    }),
    check("zoom-background-physical-image-stable-across-80-150", backgroundStableAcrossZoom, {
      browserZoomContract: "zoom out/in should not resize the background art in physical pixels",
      desktopPhysicalWidth: desktopBackground.imageLayerPhysicalWidth,
      zoomLevelComparisons
    }),
    check("zoom-background-visible-text-changes-with-browser-zoom", zoom80TextShrinks && zoom150TextGrows, {
      browserZoomContract: "text/UI follows browser zoom while the background art remains physically stable",
      zoomLevelComparisons
    })
  ];
}

function evaluateRouteZoomContract(routeResults) {
  return routeCoverage.map((route) => {
    const desktop = routeResults.find((result) => result.routeName === route.name && result.viewportName === "desktop-1920");
    const zoom125 = routeResults.find((result) => result.routeName === route.name && result.viewportName === "zoom125-1536");
    const desktopBackground = deriveBackgroundMetrics(desktop?.metrics);
    const zoomBackground = deriveBackgroundMetrics(zoom125?.metrics);
    const backgroundStable = desktopBackground.imageLayerPhysicalWidth !== null
      && zoomBackground.imageLayerPhysicalWidth !== null
      && Math.abs(desktopBackground.imageLayerPhysicalWidth - zoomBackground.imageLayerPhysicalWidth) <= 3;

    return check(`zoom-background-route-stable-${route.name}`, backgroundStable, {
      browserZoomContract: "route background art keeps the same physical width while text/layout follows browser zoom",
      desktopPhysicalWidth: desktopBackground.imageLayerPhysicalWidth,
      path: route.path,
      zoom125PhysicalWidth: zoomBackground.imageLayerPhysicalWidth
    });
  });
}

function evaluateCssContract(cssText) {
  const lightBeforeBlock = cssText.match(/:root\[data-theme="light"\]\s+body::before\s*\{[\s\S]*?\n\}/)?.[0] || "";

  return [
    check("zoom-background-css-uses-4k-webp", /light-mode-background-4k\.webp/.test(cssText), {}),
    check("zoom-background-css-does-not-switch-by-resolution", !/min-resolution|max-resolution|device-pixel-ratio/i.test(cssText), {}),
    check("zoom-background-css-uses-viewport-width-for-physical-stability", /--light-background-display-size:\s*100dvw\s+auto;/.test(cssText), {}),
    check("zoom-background-css-uses-fixed-body-before-layer", /:root\[data-theme="light"\]\s+body::before\s*\{[\s\S]*position:\s*fixed;/.test(cssText), {}),
    check("zoom-background-css-root-layer-stays-above-background", /#root\s*\{[\s\S]*position:\s*relative;[\s\S]*z-index:\s*1;/.test(cssText), {}),
    check("zoom-background-css-decorative-light-uses-percentage-radii", /radial-gradient\(ellipse\s+\d+%\s+\d+%\s+at\s+14%\s+10%/.test(lightBeforeBlock)
      && /radial-gradient\(ellipse\s+\d+%\s+\d+%\s+at\s+86%\s+12%/.test(lightBeforeBlock)
      && !/radial-gradient\([\s\S]*?transparent\s+\d+(?:\.\d+)?(?:rem|px)/.test(lightBeforeBlock), {
      expected: "decorative light gradients use viewport-relative percentage radii instead of rem/px stops"
    })
  ];
}

ensureDir(reportsDir);
ensureDir(screenshotsDir);

const cssText = fs.readFileSync(stylesPath, "utf8");
const browser = await chromium.launch({ headless: true });
const results = [];
const routeResults = [];

try {
  for (const testCase of viewports) {
    const requestedImages = [];
    const page = await browser.newPage({
      deviceScaleFactor: testCase.deviceScaleFactor,
      viewport: { width: testCase.width, height: testCase.height }
    });
    const consoleErrors = [];

    page.on("requestfinished", (request) => {
      const url = request.url();
      if (url.includes("/images/light-mode-background")) requestedImages.push(url);
    });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });

    await page.addInitScript(() => {
      localStorage.setItem("hub-theme-default-version", "light-default-v1");
      localStorage.setItem("hub-theme", "light");
    });

    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 25000 });
    const screenshot = path.resolve(screenshotsDir, `zoom-background-${testCase.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    const metrics = await collectMetrics(page, requestedImages);
    const checks = evaluateCase(testCase, metrics, screenshot, consoleErrors);

    results.push({
      checks,
      metrics,
      name: testCase.name,
      screenshot,
      size: `${testCase.width}x${testCase.height}`
    });

    await page.close();
  }

  for (const route of routeCoverage) {
    for (const testCase of routeCoverageViewports) {
      const requestedImages = [];
      const page = await browser.newPage({
        deviceScaleFactor: testCase.deviceScaleFactor,
        viewport: { width: testCase.width, height: testCase.height }
      });
      const consoleErrors = [];

      page.on("requestfinished", (request) => {
        const url = request.url();
        if (url.includes("/images/light-mode-background")) requestedImages.push(url);
      });
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => {
        consoleErrors.push(error.message);
      });

      await page.addInitScript(() => {
        localStorage.setItem("hub-theme-default-version", "light-default-v1");
        localStorage.setItem("hub-theme", "light");
      });

      await page.goto(routeUrl(route.path), { waitUntil: "networkidle", timeout: 25000 });
      const screenshot = path.resolve(screenshotsDir, `zoom-background-route-${slug(route.name)}-${testCase.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      const metrics = await collectMetrics(page, requestedImages);
      const checks = evaluateCase(testCase, metrics, screenshot, consoleErrors, {
        bodyTextMin: route.bodyTextMin,
        bodyTextMinByPathname: route.bodyTextMinByPathname,
        allowedPathnames: route.allowedPathnames,
        requireTextSample: false
      });

      routeResults.push({
        checks,
        metrics,
        name: `${route.name}-${testCase.name}`,
        routeName: route.name,
        routePath: route.path,
        screenshot,
        size: `${testCase.width}x${testCase.height}`,
        viewportName: testCase.name
      });

      await page.close();
    }
  }
} finally {
  await browser.close();
}

const cssChecks = evaluateCssContract(cssText);
const crossChecks = evaluateZoomContract(results);
const routeCrossChecks = evaluateRouteZoomContract(routeResults);
const failedChecks = [
  ...cssChecks.filter((item) => !item.pass).map((item) => ({ check: item.name, scope: "css", evidence: item.evidence })),
  ...crossChecks.filter((item) => !item.pass).map((item) => ({ check: item.name, scope: "cross-zoom", evidence: item.evidence })),
  ...routeCrossChecks.filter((item) => !item.pass).map((item) => ({ check: item.name, scope: "cross-route-zoom", evidence: item.evidence })),
  ...results.flatMap((result) =>
    result.checks
      .filter((item) => !item.pass)
      .map((item) => ({ check: item.name, evidence: item.evidence, scope: result.name }))
  ),
  ...routeResults.flatMap((result) =>
    result.checks
      .filter((item) => !item.pass)
      .map((item) => ({ check: item.name, evidence: item.evidence, scope: result.name }))
  )
];
const allChecks = [
  ...cssChecks,
  ...crossChecks,
  ...routeCrossChecks,
  ...results.flatMap((result) => result.checks),
  ...routeResults.flatMap((result) => result.checks)
];
const summary = {
  failed: failedChecks.length,
  passed: allChecks.filter((item) => item.pass).length,
  total: allChecks.length
};

const report = {
  baseUrl,
  browserBaseUrl,
  crossChecks,
  cssChecks,
  failedChecks,
  generatedAtUtc: new Date().toISOString(),
  ok: failedChecks.length === 0,
  routeCrossChecks,
  routeResults,
  results,
  summary
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  failedChecks,
  ok: report.ok,
  reportPath,
  summary,
  routes: routeResults.map((result) => ({
    checks: result.checks.length,
    name: result.name,
    path: result.routePath,
    screenshot: result.screenshot,
    size: result.size
  })),
  viewports: results.map((result) => ({
    checks: result.checks.length,
    name: result.name,
    screenshot: result.screenshot,
    size: result.size
  }))
}, null, 2));

if (!report.ok) process.exit(1);
