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
const screenshotsDir = path.join(process.cwd(), "qa", "screenshots");
const reportPath = path.join(reportsDir, "theme-first-paint-audit.json");

const scenarios = [
  {
    expectedTheme: "light",
    name: "fresh-first-visit",
    setup: "fresh"
  },
  {
    expectedTheme: "light",
    name: "stale-dark-reset-to-light",
    setup: "stale-dark"
  },
  {
    expectedTheme: "light",
    name: "valid-light-reload",
    setup: "valid-light"
  },
  {
    expectedTheme: "dark",
    name: "valid-dark-respected",
    setup: "valid-dark"
  }
];

const routeCases = [
  { name: "home", path: "/" },
  { allowedPathnames: ["/login"], name: "safety", path: "/safety-6s" },
  { name: "documents", path: "/documents" },
  { name: "login", path: "/login" }
];

const viewportCases = [
  { deviceScaleFactor: 1, height: 768, name: "desktop-1366", width: 1366 },
  { deviceScaleFactor: 2, height: 900, name: "mobile-390", width: 390 }
];

const ensureDir = (directory) => fs.mkdirSync(directory, { recursive: true });

const check = (name, pass, evidence = {}) => ({
  evidence,
  name,
  pass: Boolean(pass)
});

const routeUrl = (routePath) => new URL(routePath, baseUrl).toString();

const slug = (value) => String(value || "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const luminanceFromRgb = (rgb) => {
  const match = String(rgb || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return null;
  const [, red, green, blue] = match.map(Number);
  return Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
};

const responseText = async (targetUrl) => {
  const response = await fetch(targetUrl);
  return {
    ok: response.ok,
    status: response.status,
    text: await response.text()
  };
};

const evaluateHtmlContract = (html) => {
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] || "";
  const themeInitIndex = html.indexOf('src="/theme-init.js"');
  const rootIndex = html.indexOf('<div id="root"');
  const moduleIndex = html.indexOf('type="module"');
  const themeColor = html.match(/<meta\s+name=["']theme-color["']\s+content=["']([^"']+)["']/i)?.[1] || "";

  return {
    htmlTag,
    hasLightThemeAttribute: /\bdata-theme=["']light["']/i.test(htmlTag),
    moduleIndex,
    themeColor,
    themeInitBeforeApp: themeInitIndex >= 0 && rootIndex >= 0 && themeInitIndex < rootIndex && themeInitIndex < moduleIndex,
    themeInitDeferred: /<script\b[^>]*src=["']\/theme-init\.js["'][^>]*\bdefer\b[^>]*>/i.test(html),
    themeInitIndex
  };
};

async function auditScenario(browser, scenario, routeCase, viewportCase) {
  const context = await browser.newContext({
    deviceScaleFactor: viewportCase.deviceScaleFactor,
    viewport: { width: viewportCase.width, height: viewportCase.height }
  });
  const page = await context.newPage();
  const consoleErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });

  await page.addInitScript(({ setup }) => {
    try {
      if (setup === "stale-dark") {
        localStorage.removeItem("hub-theme-default-version");
        localStorage.setItem("hub-theme", "dark");
      } else if (setup === "valid-light") {
        localStorage.setItem("hub-theme-default-version", "light-default-v1");
        localStorage.setItem("hub-theme", "light");
      } else if (setup === "valid-dark") {
        localStorage.setItem("hub-theme-default-version", "light-default-v1");
        localStorage.setItem("hub-theme", "dark");
      } else {
        localStorage.removeItem("hub-theme-default-version");
        localStorage.removeItem("hub-theme");
      }
    } catch {}

    window.__themeFirstPaintSamples = [];
    const sample = () => {
      try {
        const rootStyle = getComputedStyle(document.documentElement);
        const bodyStyle = document.body ? getComputedStyle(document.body) : null;
        window.__themeFirstPaintSamples.push({
          bodyBackgroundColor: bodyStyle?.backgroundColor || "",
          colorScheme: rootStyle.colorScheme || "",
          datasetTheme: document.documentElement.dataset.theme || "",
          ms: Math.round(performance.now()),
          rootBg: rootStyle.getPropertyValue("--bg").trim(),
          storedTheme: localStorage.getItem("hub-theme") || ""
        });
      } catch {}
    };

    const start = performance.now();
    const tick = () => {
      sample();
      if (performance.now() - start < 900) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }, { setup: scenario.setup });

  await page.goto(routeUrl(routeCase.path), { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(950);
  const screenshot = path.join(
    screenshotsDir,
    `theme-first-paint-${slug(routeCase.name)}-${slug(viewportCase.name)}-${slug(scenario.name)}.png`
  );
  await page.screenshot({ fullPage: false, path: screenshot });

  const metrics = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const samples = window.__themeFirstPaintSamples || [];
    return {
      bodyBackgroundColor: bodyStyle.backgroundColor,
      bodyColor: bodyStyle.color,
      bodyTextLength: document.body.innerText.trim().length,
      colorScheme: rootStyle.colorScheme,
      datasetTheme: document.documentElement.dataset.theme || "",
      firstSamples: samples.slice(0, 12),
      lastSamples: samples.slice(-12),
      lightSamples: samples.filter((sample) => sample.datasetTheme === "light").length,
      darkSamples: samples.filter((sample) => sample.datasetTheme === "dark").length,
      rootBg: rootStyle.getPropertyValue("--bg").trim(),
      pathname: window.location.pathname,
      sampleCount: samples.length,
      storedDefaultVersion: localStorage.getItem("hub-theme-default-version") || "",
      storedTheme: localStorage.getItem("hub-theme") || "",
      themeColor: document.querySelector('meta[name="theme-color"]')?.content || ""
    };
  });

  const bodyLuminance = luminanceFromRgb(metrics.bodyBackgroundColor);
  const expectedLight = scenario.expectedTheme === "light";
  const noUnexpectedDarkSamples = expectedLight
    ? metrics.darkSamples === 0 && metrics.lastSamples.every((sample) => sample.datasetTheme !== "dark")
    : metrics.darkSamples > 0;
  const allowedPathnames = new Set([routeCase.path, ...(routeCase.allowedPathnames || [])]);
  const routeLoaded = allowedPathnames.has(metrics.pathname) && metrics.bodyTextLength > 80;

  const checks = [
    check("theme-first-paint-route-loaded", routeLoaded, {
      allowedPathnames: [...allowedPathnames],
      bodyTextLength: metrics.bodyTextLength,
      expectedPath: routeCase.path,
      pathname: metrics.pathname,
      route: routeCase.name,
      viewport: viewportCase.name
    }),
    check("theme-first-paint-final-theme", metrics.datasetTheme === scenario.expectedTheme, {
      actual: metrics.datasetTheme,
      expected: scenario.expectedTheme,
      scenario: scenario.name
    }),
    check("theme-first-paint-local-storage-synced", metrics.storedTheme === scenario.expectedTheme && metrics.storedDefaultVersion === "light-default-v1", {
      storedDefaultVersion: metrics.storedDefaultVersion,
      storedTheme: metrics.storedTheme
    }),
    check("theme-first-paint-no-unexpected-dark-samples", noUnexpectedDarkSamples, {
      darkSamples: metrics.darkSamples,
      expectedTheme: scenario.expectedTheme,
      firstSamples: metrics.firstSamples,
      lastSamples: metrics.lastSamples,
      lightSamples: metrics.lightSamples,
      sampleCount: metrics.sampleCount
    }),
    check("theme-first-paint-background-matches-theme", expectedLight ? bodyLuminance !== null && bodyLuminance >= 190 : bodyLuminance === null || bodyLuminance <= 80, {
      bodyBackgroundColor: metrics.bodyBackgroundColor,
      bodyLuminance,
      expectedTheme: scenario.expectedTheme,
      rootBg: metrics.rootBg
    }),
    check("theme-first-paint-screenshot-written", fs.existsSync(screenshot), { screenshot }),
    check("theme-first-paint-console-clean", consoleErrors.length === 0, { consoleErrors })
  ];

  await context.close();

  return {
    checks,
    metrics,
    name: scenario.name,
    route: routeCase.name,
    path: routeCase.path,
    viewport: viewportCase.name,
    screenshot
  };
}

ensureDir(reportsDir);
ensureDir(screenshotsDir);

const htmlResults = [];
for (const routeCase of routeCases) {
  const htmlResponse = await responseText(routeUrl(routeCase.path));
  const htmlContract = evaluateHtmlContract(htmlResponse.text);
  const checks = [
    check("theme-html-response-ok", htmlResponse.ok, {
      path: routeCase.path,
      route: routeCase.name,
      status: htmlResponse.status
    }),
    check("theme-html-default-attribute-is-light", htmlContract.hasLightThemeAttribute, {
      htmlTag: htmlContract.htmlTag,
      path: routeCase.path,
      route: routeCase.name
    }),
    check("theme-html-theme-init-before-app", htmlContract.themeInitBeforeApp, {
      ...htmlContract,
      path: routeCase.path,
      route: routeCase.name
    }),
    check("theme-html-theme-init-remains-deferred", htmlContract.themeInitDeferred, {
      ...htmlContract,
      path: routeCase.path,
      route: routeCase.name
    }),
    check("theme-html-theme-color-is-light", /^#(?:f6d600|[fF][6][dD]600)$/.test(htmlContract.themeColor), {
      path: routeCase.path,
      route: routeCase.name,
      themeColor: htmlContract.themeColor
    })
  ];

  htmlResults.push({
    checks,
    contract: htmlContract,
    path: routeCase.path,
    route: routeCase.name
  });
}

const browser = await chromium.launch({ headless: true });
const scenarioResults = [];

try {
  for (const routeCase of routeCases) {
    for (const viewportCase of viewportCases) {
      for (const scenario of scenarios) {
        scenarioResults.push(await auditScenario(browser, scenario, routeCase, viewportCase));
      }
    }
  }
} finally {
  await browser.close();
}

const failedChecks = [
  ...htmlResults.flatMap((result) =>
    result.checks
      .filter((item) => !item.pass)
      .map((item) => ({ check: item.name, evidence: item.evidence, route: result.route, scope: "html" }))
  ),
  ...scenarioResults.flatMap((result) =>
    result.checks
      .filter((item) => !item.pass)
      .map((item) => ({
        check: item.name,
        evidence: item.evidence,
        route: result.route,
        scope: result.name,
        viewport: result.viewport
      }))
  )
];
const allChecks = [
  ...htmlResults.flatMap((result) => result.checks),
  ...scenarioResults.flatMap((result) => result.checks)
];
const summary = {
  failed: failedChecks.length,
  passed: allChecks.filter((item) => item.pass).length,
  total: allChecks.length
};

const report = {
  baseUrl,
  failedChecks,
  generatedAtUtc: new Date().toISOString(),
  htmlResults,
  ok: failedChecks.length === 0,
  scenarioResults,
  summary
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  failedChecks,
  ok: report.ok,
  reportPath,
  summary,
  htmlRoutes: htmlResults.map((result) => ({
    checks: result.checks.length,
    path: result.path,
    route: result.route,
    themeInitBeforeApp: result.contract.themeInitBeforeApp
  })),
  scenarios: scenarioResults.map((result) => ({
    datasetTheme: result.metrics.datasetTheme,
    darkSamples: result.metrics.darkSamples,
    name: result.name,
    path: result.path,
    rootBg: result.metrics.rootBg,
    route: result.route,
    sampleCount: result.metrics.sampleCount,
    screenshot: result.screenshot,
    storedTheme: result.metrics.storedTheme,
    viewport: result.viewport
  }))
}, null, 2));

if (!report.ok) {
  process.exit(1);
}
