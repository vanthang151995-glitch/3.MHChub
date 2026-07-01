import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { isPlaceholderDocumentTitle } from "../shared/documentDisplay.js";

const readArg = (name, fallback) => {
  const index = process.argv.lastIndexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
};

const rootDir = process.cwd();
const baseUrl = readArg("--url", process.env.VERIFY_BASE_URL || "http://127.0.0.1:3333/");
const reportsDir = path.join(rootDir, "qa", "reports");
const screenshotsDir = path.join(rootDir, "qa", "screenshots");
const reportPath = path.join(reportsDir, "document-preview-browser-audit.json");
const previewAssetTimeoutMs = Number(readArg("--preview-timeout-ms", process.env.PREVIEW_AUDIT_TIMEOUT_MS || "45000"));
const documentsPath = path.join(rootDir, "server", "data", "documents.json");
const htmlPreviewRoot = path.join(rootDir, "server", "previews", "html");

const viewports = [
  { deviceScaleFactor: 1, height: 768, name: "desktop", width: 1366 },
  { deviceScaleFactor: 2, height: 900, name: "mobile", width: 390 }
];
const themes = ["light", "dark"];
const navigationThemes = ["light"];

const ensureDir = (directory) => fs.mkdirSync(directory, { recursive: true });

const check = (name, pass, evidence = {}) => ({
  evidence,
  name,
  pass: Boolean(pass)
});

const extensionOf = (document) =>
  path.extname(String(document?.originalName || document?.fileName || "")).toLowerCase();

const SPREADSHEET_EXTENSIONS = new Set([".xlsx", ".xlsm", ".xls", ".ods", ".csv"]);
const CONVERTED_OFFICE_EXTENSIONS = new Set([".pptx", ".ppt", ".docx", ".doc", ".odt", ".odp", ".rtf"]);
const isPdfLikePreview = (kind) => kind === "pdf" || kind === "converted-office-pdf" || kind === "spreadsheet-pdf";

const hasHtmlPreview = (document) => {
  const directory = path.join(htmlPreviewRoot, String(document.id || ""));
  if (!fs.existsSync(directory)) return false;
  return fs.readdirSync(directory).some((fileName) => fileName.toLowerCase().endsWith(".html"));
};

const readDocuments = () => {
  const raw = fs.readFileSync(documentsPath, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("server/data/documents.json must be an array");
  return parsed;
};

const pickDocument = (documents, kind) => {
  if (kind === "spreadsheet-pdf") {
    const preferred = documents.find((document) =>
      document.id === "3d2cdc99-3864-4c70-970b-5d1677d369b3"
      && SPREADSHEET_EXTENSIONS.has(extensionOf(document))
      && document.fileName
      && document.previewStatus === "ready"
    );
    if (preferred) return preferred;
    return documents.find((document) =>
      SPREADSHEET_EXTENSIONS.has(extensionOf(document))
      && document.fileName
      && document.previewStatus === "ready"
    );
  }

  if (kind === "converted-office-pdf") {
    const preferred = documents.find((document) =>
      document.id === "3c07f928-d695-465b-b2af-78e981f32a8e"
      && CONVERTED_OFFICE_EXTENSIONS.has(extensionOf(document))
      && document.fileName
      && document.previewStatus === "ready"
    );
    if (preferred) return preferred;
    return documents.find((document) =>
      CONVERTED_OFFICE_EXTENSIONS.has(extensionOf(document))
      && document.fileName
      && document.previewStatus === "ready"
    );
  }

  const preferredPdf = documents.find((document) =>
    document.id === "75456bb9-5602-4864-856b-9246cb01f458"
    && extensionOf(document) === ".pdf"
    && document.fileName
  );
  if (preferredPdf) return preferredPdf;
  return documents.find((document) => extensionOf(document) === ".pdf" && document.fileName);
};

const previewRoute = (id) => `/documents/${encodeURIComponent(id)}/preview`;
const absoluteUrl = (route) => new URL(route, baseUrl).toString();
const screenshotPath = (caseName) => path.resolve(screenshotsDir, `document-preview-browser-${caseName}.png`);

const safeOpenActionEvidence = (formatMetrics) => {
  const action = (formatMetrics.openActions || [])[0] || null;
  const relTokens = String(action?.rel || "").toLowerCase().split(/\s+/).filter(Boolean);

  return {
    action,
    isSafe: Boolean(action?.href)
      && action.target === "_blank"
      && relTokens.includes("noreferrer")
      && action.download === false
      && action.visible === true
  };
};

const openActionTargetsPreviewSource = (formatMetrics, kind, documentId) => {
  const action = (formatMetrics.openActions || [])[0] || null;
  if (!action?.href) return { action, matches: false, reason: "missing-open-action-href" };

  if (kind === "excel-html") {
    try {
      const parsed = new URL(action.href, baseUrl);
      const expectedPath = `/api/documents/${encodeURIComponent(documentId)}/excel-html-preview`;
      const normalizedPath = parsed.pathname.replace(/\/$/, "");
      return {
        action,
        expectedPath,
        matches: normalizedPath === expectedPath,
        normalizedPath
      };
    } catch (error) {
      return { action, matches: false, reason: error.message };
    }
  }

  if (isPdfLikePreview(kind)) {
    if (action.href.startsWith("blob:")) {
      return {
        action,
        expected: "blob URL generated from inline PDF data",
        matches: true
      };
    }

    try {
      const parsed = new URL(action.href, baseUrl);
      const previewFilePath = `/api/documents/${encodeURIComponent(documentId)}/preview-file`;
      const inlineFilePath = `/api/documents/${encodeURIComponent(documentId)}/file`;
      const matchesPreviewFile = parsed.pathname === previewFilePath;
      const matchesInlineFile = parsed.pathname === inlineFilePath && parsed.searchParams.get("disposition") === "inline";
      const matchesInlineUploadPdf = kind === "pdf" && parsed.pathname.startsWith("/uploads/") && parsed.searchParams.get("preview") === "inline";
      return {
        action,
        expectedPaths: [previewFilePath, `${inlineFilePath}?disposition=inline`, "/uploads/*.pdf?preview=inline", "blob:"],
        matches: matchesPreviewFile || matchesInlineFile || matchesInlineUploadPdf,
        pathname: parsed.pathname,
        search: parsed.search
      };
    } catch (error) {
      return { action, matches: false, reason: error.message };
    }
  }

  return { action, matches: false, reason: `unsupported-kind:${kind}` };
};

const isExpectedAuthResponse = (url, status) =>
  status === 401 && new URL(url).pathname === "/api/auth/me";

const isIgnoredResponse = (url, status) =>
  url.includes("/favicon") || isExpectedAuthResponse(url, status);

const isDocumentPayloadRequest = (url) => {
  const parsed = new URL(url);
  return /^\/uploads\//.test(parsed.pathname)
    || /^\/api\/documents\/[^/]+\/(?:file|preview-file|excel-html-preview)(?:\/|$)/.test(parsed.pathname);
};

async function waitForDocumentPageReady(page) {
  await page.locator(".document-preview-page").waitFor({ state: "visible", timeout: 20000 });
  await page.locator('.document-preview-page[aria-busy="false"]').waitFor({ state: "visible", timeout: 25000 });
}

async function collectCommonMetrics(page, document, viewport, expectedTheme) {
  return page.evaluate(({ documentId, expectedTheme, viewportName }) => {
    const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const parseRgb = (value) => {
      const match = String(value || "").match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
      if (parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) return null;
      return {
        alpha: Number.isFinite(parts[3]) ? parts[3] : 1,
        blue: parts[2],
        green: parts[1],
        raw: value,
        red: parts[0]
      };
    };
    const channelToLinear = (value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    };
    const relativeLuminance = (color) =>
      color ? 0.2126 * channelToLinear(color.red) + 0.7152 * channelToLinear(color.green) + 0.0722 * channelToLinear(color.blue) : null;
    const simpleLuminance = (color) =>
      color ? Math.round(0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue) : null;
    const blend = (top, bottom) => {
      if (!top) return bottom;
      if (!bottom) return top;
      const alpha = Math.max(0, Math.min(1, top.alpha));
      const inverse = 1 - alpha;
      return {
        alpha: 1,
        blue: Math.round(top.blue * alpha + bottom.blue * inverse),
        green: Math.round(top.green * alpha + bottom.green * inverse),
        raw: `rgb(${Math.round(top.red * alpha + bottom.red * inverse)}, ${Math.round(top.green * alpha + bottom.green * inverse)}, ${Math.round(top.blue * alpha + bottom.blue * inverse)})`,
        red: Math.round(top.red * alpha + bottom.red * inverse)
      };
    };
    const contrastRatio = (foreground, background) => {
      const fg = relativeLuminance(foreground);
      const bg = relativeLuminance(background);
      if (fg === null || bg === null) return null;
      const lighter = Math.max(fg, bg);
      const darker = Math.min(fg, bg);
      return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
    };
    const effectiveBackgroundColor = (element) => {
      const bodyColor = parseRgb(getComputedStyle(document.body).backgroundColor);
      const rootColor = parseRgb(getComputedStyle(document.documentElement).backgroundColor);
      const fallbackColor = expectedTheme === "dark"
        ? { alpha: 1, blue: 20, green: 11, raw: "rgb(7, 11, 20)", red: 7 }
        : { alpha: 1, blue: 251, green: 245, raw: "rgb(237, 245, 251)", red: 237 };
      const baseColor = bodyColor?.alpha > 0.05 ? bodyColor : rootColor?.alpha > 0.05 ? rootColor : fallbackColor;
      const layers = [];
      let current = element;
      while (current && current.nodeType === 1) {
        const color = parseRgb(getComputedStyle(current).backgroundColor);
        if (color && color.alpha > 0.01) layers.push(color);
        current = current.parentElement;
      }
      return layers.reverse().reduce((background, layer) => blend(layer, background), baseColor);
    };
    const contrastFor = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const foreground = parseRgb(getComputedStyle(element).color);
      const background = effectiveBackgroundColor(element);
      return {
        background: background?.raw || "",
        color: foreground?.raw || "",
        contrast: contrastRatio(foreground, background),
        selector,
        text: compact(element.textContent).slice(0, 80)
      };
    };
    const rectFor = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        bottom: Number(rect.bottom.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
        left: Number(rect.left.toFixed(2)),
        right: Number(rect.right.toFixed(2)),
        top: Number(rect.top.toFixed(2)),
        width: Number(rect.width.toFixed(2))
      };
    };
    const downloadLink = document.querySelector(".document-preview-actions a[download], .document-preview-empty a[download]");
    const libraryLinks = [...document.querySelectorAll('a[href="/documents"]')];
    const frameworkOverlay = document.querySelector("vite-error-overlay, .vite-error-overlay, [data-nextjs-dialog-overlay]");
    const workbook = document.querySelector(".document-preview-workbook");
    const bodyText = compact(document.body.innerText);
    const bodyBg = parseRgb(getComputedStyle(document.body).backgroundColor);
    const rootBg = parseRgb(getComputedStyle(document.documentElement).backgroundColor);
    const contrastSamples = [
      ".document-preview-title h1",
      ".document-preview-title p",
      ".native-preview-toolbar h2",
      ".preview-stat strong",
      ".document-preview-actions a"
    ].map(contrastFor).filter(Boolean);

    return {
      bodyBackground: bodyBg?.raw || "",
      bodyLuminance: simpleLuminance(bodyBg),
      bodyTextLength: bodyText.length,
      contrastSamples,
      documentId,
      downloadHref: downloadLink?.href || "",
      downloadText: compact(downloadLink?.textContent),
      expectedTheme,
      frameworkOverlayVisible: Boolean(frameworkOverlay),
      hero: rectFor(".document-preview-hero"),
      h1: compact(document.querySelector(".document-preview-title h1")?.textContent),
      libraryLinkCount: libraryLinks.length,
      meta: rectFor(".document-preview-meta"),
      rootBackground: rootBg?.raw || "",
      rootLuminance: simpleLuminance(rootBg),
      scrollWidth: document.documentElement.scrollWidth,
      theme: document.documentElement.dataset.theme || "",
      viewportHeight: window.innerHeight,
      viewportName,
      viewportWidth: window.innerWidth,
      workbook: rectFor(".document-preview-workbook"),
      workbookVisibleEarly: workbook ? workbook.getBoundingClientRect().top < window.innerHeight * 0.92 : false
    };
  }, { documentId: document.id, expectedTheme, viewportName: viewport.name });
}

async function collectExcelMetrics(page) {
  await page.locator(".excel-html-preview-frame").waitFor({ state: "visible", timeout: previewAssetTimeoutMs });
  const frame = page.frameLocator(".excel-html-preview-frame");
  await frame.locator("body").waitFor({ state: "visible", timeout: previewAssetTimeoutMs });
  await page.waitForTimeout(500);

  const frameMetrics = await frame.locator("body").evaluate((body) => {
    const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const tables = [...body.querySelectorAll("table")];
    const headings = [...body.querySelectorAll('a[name^="table"] h1, h1, h2')]
      .map((heading) => compact(heading.textContent))
      .filter(Boolean)
      .slice(0, 8);
    const visibleTables = tables.filter((table) => {
      const rect = table.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const firstTable = visibleTables[0] || tables[0] || null;
    const firstRect = firstTable?.getBoundingClientRect();

    return {
      bodyTextLength: compact(body.innerText || body.textContent).length,
      firstTableRect: firstRect
        ? {
            height: Number(firstRect.height.toFixed(2)),
            width: Number(firstRect.width.toFixed(2))
          }
        : null,
      headings,
      tableCount: tables.length,
      visibleTableCount: visibleTables.length
    };
  });

  const pageMetrics = await page.evaluate(() => ({
    frameHeight: Math.round(document.querySelector(".excel-html-preview-frame")?.getBoundingClientRect().height || 0),
    openActions: [...document.querySelectorAll(".native-preview-actions a[target='_blank']")].map((link) => {
      const rect = link.getBoundingClientRect();
      return {
        download: link.hasAttribute("download"),
        href: link.href,
        rel: link.getAttribute("rel") || "",
        target: link.getAttribute("target") || "",
        text: String(link.textContent || "").replace(/\s+/g, " ").trim(),
        visible: rect.width > 0 && rect.height > 0
      };
    }),
    openInNewTabLinks: [...document.querySelectorAll(".native-preview-actions a[target='_blank']")].length,
    sheetJumpButtons: [...document.querySelectorAll(".excel-sheet-jump button")].length
  }));

  return {
    ...frameMetrics,
    ...pageMetrics
  };
}

async function collectPdfMetrics(page) {
  await page.locator(".pdf-native-preview-shell").waitFor({ state: "visible", timeout: 25000 });
  await page.locator(".pdf-native-frame").waitFor({ state: "visible", timeout: 25000 });
  await page.waitForTimeout(500);

  return page.evaluate(() => {
    const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const frame = document.querySelector(".pdf-native-frame");
    const frameRect = frame?.getBoundingClientRect();
    const shellRect = document.querySelector(".pdf-native-preview-shell")?.getBoundingClientRect();

    return {
      frameRect: frameRect
        ? {
            height: Number(frameRect.height.toFixed(2)),
            width: Number(frameRect.width.toFixed(2))
          }
        : null,
      frameSrc: frame?.getAttribute("src") || "",
      frameVisible: Boolean(frameRect && frameRect.width > 0 && frameRect.height > 0),
      openActions: [...document.querySelectorAll(".native-preview-actions a[target='_blank']")].map((link) => {
        const rect = link.getBoundingClientRect();
        return {
          download: link.hasAttribute("download"),
          href: link.href,
          rel: link.getAttribute("rel") || "",
          target: link.getAttribute("target") || "",
          text: compact(link.textContent),
          visible: rect.width > 0 && rect.height > 0
        };
      }),
      openInNewTabLinks: [...document.querySelectorAll(".native-preview-actions a[target='_blank']")].length,
      renderFailedMessage: compact(document.querySelector(".pdf-preview-message")?.textContent),
      shellRect: shellRect
        ? {
            height: Number(shellRect.height.toFixed(2)),
            width: Number(shellRect.width.toFixed(2))
          }
        : null
    };
  });
}

async function runCase(browser, testCase) {
  const context = await browser.newContext({
    deviceScaleFactor: testCase.viewport.deviceScaleFactor,
    viewport: {
      height: testCase.viewport.height,
      width: testCase.viewport.width
    }
  });

  await context.addInitScript(({ theme }) => {
    localStorage.setItem("hub-lang", "vi");
    localStorage.setItem("hub-theme-default-version", "light-default-v1");
    localStorage.setItem("hub-theme", theme);
  }, { theme: testCase.theme });

  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const badResponses = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 400 && !isIgnoredResponse(url, status)) {
      badResponses.push({ status, url });
    }
  });

  const url = absoluteUrl(previewRoute(testCase.document.id));
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
  await waitForDocumentPageReady(page);
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});

  const formatMetrics = testCase.kind === "excel-html"
    ? await collectExcelMetrics(page)
    : await collectPdfMetrics(page);
  const screenshot = screenshotPath(testCase.name);
  await page.screenshot({ fullPage: false, path: screenshot });
  const common = await collectCommonMetrics(page, testCase.document, testCase.viewport, testCase.theme);
  const lowContrastSamples = common.contrastSamples.filter((sample) => Number(sample.contrast || 0) < 4.2);
  const shellLuminance = common.bodyLuminance ?? common.rootLuminance;

  const checks = [
    check("preview-route-loaded", Boolean(response?.ok()), {
      status: response?.status(),
      url
    }),
    check("preview-page-not-blank", common.bodyTextLength > 300, {
      bodyTextLength: common.bodyTextLength
    }),
    check("preview-title-present", common.h1.length > 0, {
      h1: common.h1
    }),
    check("preview-title-is-not-placeholder", common.h1.length > 0 && !isPlaceholderDocumentTitle(common.h1), {
      h1: common.h1,
      rawTitle: testCase.document.title || ""
    }),
    check("preview-theme-applied", common.theme === testCase.theme, {
      actualTheme: common.theme,
      expectedTheme: testCase.theme
    }),
    check("preview-shell-background-matches-theme", testCase.theme === "dark" ? shellLuminance <= 95 : shellLuminance >= 150, {
      bodyBackground: common.bodyBackground,
      bodyLuminance: common.bodyLuminance,
      expectedTheme: testCase.theme,
      rootBackground: common.rootBackground,
      rootLuminance: common.rootLuminance,
      shellLuminance
    }),
    check("preview-text-contrast-readable", lowContrastSamples.length === 0, {
      contrastSamples: common.contrastSamples,
      lowContrastSamples
    }),
    check("preview-workbook-visible-in-first-viewport", common.workbookVisibleEarly, {
      viewportHeight: common.viewportHeight,
      workbook: common.workbook
    }),
    check("download-original-action-present", common.downloadHref.includes(`/api/documents/${encodeURIComponent(testCase.document.id)}/file`) && /disposition=attachment/.test(common.downloadHref), {
      downloadHref: common.downloadHref,
      downloadText: common.downloadText
    }),
    check("document-library-fallback-present", common.libraryLinkCount >= 1, {
      libraryLinkCount: common.libraryLinkCount
    }),
    check("preview-no-horizontal-overflow", common.scrollWidth <= common.viewportWidth + 1, {
      scrollWidth: common.scrollWidth,
      viewportWidth: common.viewportWidth
    }),
    check("preview-no-framework-overlay", !common.frameworkOverlayVisible, {}),
    check("preview-console-clean", consoleErrors.length === 0 && pageErrors.length === 0, {
      consoleErrors,
      pageErrors
    }),
    check("preview-network-clean", badResponses.length === 0, {
      badResponses,
      ignoredAuthProbe: "/api/auth/me 401 is expected for guest preview sessions"
    }),
    check("preview-screenshot-written", fs.existsSync(screenshot), {
      screenshot
    })
  ];

  if (testCase.kind === "excel-html") {
    const safeOpenAction = safeOpenActionEvidence(formatMetrics);
    const targetEvidence = openActionTargetsPreviewSource(formatMetrics, testCase.kind, testCase.document.id);

    checks.push(
      check("excel-html-preview-frame-has-content", formatMetrics.bodyTextLength > 80, {
        bodyTextLength: formatMetrics.bodyTextLength,
        headings: formatMetrics.headings
      }),
      check("excel-html-preview-has-visible-table", formatMetrics.visibleTableCount > 0, {
        firstTableRect: formatMetrics.firstTableRect,
        tableCount: formatMetrics.tableCount,
        visibleTableCount: formatMetrics.visibleTableCount
      }),
      check("excel-html-preview-has-open-action", formatMetrics.openInNewTabLinks >= 1, {
        openInNewTabLinks: formatMetrics.openInNewTabLinks
      }),
      check("excel-html-preview-open-action-is-safe", safeOpenAction.isSafe, safeOpenAction),
      check("excel-html-preview-open-action-targets-html-preview", targetEvidence.matches, targetEvidence),
      check("excel-html-preview-area-is-readable", formatMetrics.frameHeight >= (testCase.viewport.name === "mobile" ? 420 : 520), {
        frameHeight: formatMetrics.frameHeight,
        viewport: testCase.viewport.name
      })
    );
  }

  if (isPdfLikePreview(testCase.kind)) {
    const safeOpenAction = safeOpenActionEvidence(formatMetrics);
    const targetEvidence = openActionTargetsPreviewSource(formatMetrics, testCase.kind, testCase.document.id);

    checks.push(
      check("pdf-preview-renders-native-frame", formatMetrics.frameVisible && formatMetrics.frameRect?.height >= (testCase.viewport.name === "mobile" ? 420 : 520), {
        frameRect: formatMetrics.frameRect,
        frameSrc: formatMetrics.frameSrc,
        frameVisible: formatMetrics.frameVisible
      }),
      check("pdf-preview-shell-area-is-readable", formatMetrics.shellRect?.height >= (testCase.viewport.name === "mobile" ? 420 : 520), {
        shellRect: formatMetrics.shellRect,
        viewport: testCase.viewport.name
      }),
      check("pdf-preview-has-open-action", formatMetrics.openInNewTabLinks >= 1, {
        openInNewTabLinks: formatMetrics.openInNewTabLinks
      }),
      check("pdf-preview-open-action-is-safe", safeOpenAction.isSafe, safeOpenAction),
      check("pdf-preview-open-action-targets-inline-preview", targetEvidence.matches, targetEvidence),
      check("pdf-preview-not-in-error-fallback", !formatMetrics.renderFailedMessage, {
        renderFailedMessage: formatMetrics.renderFailedMessage
      })
    );

    if (testCase.kind === "spreadsheet-pdf") {
      checks.push(
        check("spreadsheet-preview-source-has-ready-pdf-preview", testCase.document.previewStatus === "ready" && /\.pdf$/i.test(testCase.document.previewFileName || ""), {
          previewFileName: testCase.document.previewFileName || "",
          previewStatus: testCase.document.previewStatus || ""
        })
      );
    }

    if (testCase.kind === "converted-office-pdf") {
      checks.push(
        check("converted-office-preview-source-has-ready-pdf-preview", testCase.document.previewStatus === "ready" && /\.pdf$/i.test(testCase.document.previewFileName || ""), {
          previewFileName: testCase.document.previewFileName || "",
          previewStatus: testCase.document.previewStatus || ""
        })
      );
    }
  }

  await context.close();

  return {
    checks,
    document: {
      id: testCase.document.id,
      originalName: testCase.document.originalName || "",
      title: testCase.document.title || ""
    },
    kind: testCase.kind,
    metrics: {
      common,
      format: formatMetrics
    },
    name: testCase.name,
    route: previewRoute(testCase.document.id),
    screenshot,
    source: "direct-route",
    theme: testCase.theme,
    url,
    viewport: {
      height: testCase.viewport.height,
      name: testCase.viewport.name,
      width: testCase.viewport.width
    }
  };
}

async function runNavigationCase(browser, testCase) {
  const context = await browser.newContext({
    deviceScaleFactor: testCase.viewport.deviceScaleFactor,
    viewport: {
      height: testCase.viewport.height,
      width: testCase.viewport.width
    }
  });

  await context.addInitScript(({ theme }) => {
    localStorage.setItem("hub-lang", "vi");
    localStorage.setItem("hub-theme-default-version", "light-default-v1");
    localStorage.setItem("hub-theme", theme);
  }, { theme: testCase.theme });

  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const badResponses = [];
  const documentListPayloadRequests = [];
  let phase = "documents-list";

  page.on("request", (request) => {
    const url = request.url();
    if (phase === "documents-list" && isDocumentPayloadRequest(url)) {
    documentListPayloadRequests.push({
        method: request.method(),
        resourceType: request.resourceType(),
        url
      });
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 400 && !isIgnoredResponse(url, status)) {
      badResponses.push({ status, url });
    }
  });

  const documentsUrl = absoluteUrl("/documents");
  const documentsResponse = await page.goto(documentsUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.locator(".documents-page").waitFor({ state: "visible", timeout: 20000 });
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});

  const targetRoute = previewRoute(testCase.document.id);
  const targetLink = page.locator(`a.document-view-button[href="${targetRoute}"]`).first();
  const linkCount = await targetLink.count();
  const documentsScreenshot = screenshotPath(`${testCase.name}-documents`);
  await page.screenshot({ fullPage: false, path: documentsScreenshot });

  const checks = [
    check("documents-route-loaded", Boolean(documentsResponse?.ok()), {
      status: documentsResponse?.status(),
      url: documentsUrl
    }),
    check("documents-list-does-not-prefetch-document-payloads", documentListPayloadRequests.length === 0, {
      blockedPatterns: [
        "/uploads/*",
        "/api/documents/:id/file",
        "/api/documents/:id/preview-file",
        "/api/documents/:id/excel-html-preview"
      ],
      documentListPayloadRequests
    }),
    check("documents-preview-link-present", linkCount > 0, {
      documentId: testCase.document.id,
      expectedHref: targetRoute,
      linkCount
    }),
    check("documents-list-screenshot-written", fs.existsSync(documentsScreenshot), {
      screenshot: documentsScreenshot
    })
  ];

  let common = null;
  let formatMetrics = null;
  let screenshot = "";
  let currentUrl = page.url();

  if (linkCount > 0) {
    phase = "preview-route";
    await Promise.all([
      page.waitForURL((url) => url.pathname === targetRoute, { timeout: 15000 }),
      targetLink.click()
    ]);
    await waitForDocumentPageReady(page);
    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});

    currentUrl = page.url();
    formatMetrics = testCase.kind === "excel-html"
      ? await collectExcelMetrics(page)
      : await collectPdfMetrics(page);
    screenshot = screenshotPath(testCase.name);
    await page.screenshot({ fullPage: false, path: screenshot });
    common = await collectCommonMetrics(page, testCase.document, testCase.viewport, testCase.theme);

    const lowContrastSamples = common.contrastSamples.filter((sample) => Number(sample.contrast || 0) < 4.2);
    const shellLuminance = common.bodyLuminance ?? common.rootLuminance;

    checks.push(
      check("documents-click-routes-to-preview", new URL(currentUrl).pathname === targetRoute, {
        actualUrl: currentUrl,
        expectedPath: targetRoute
      }),
      check("preview-page-not-blank-after-click", common.bodyTextLength > 300, {
        bodyTextLength: common.bodyTextLength
      }),
      check("preview-title-is-not-placeholder-after-click", common.h1.length > 0 && !isPlaceholderDocumentTitle(common.h1), {
        h1: common.h1,
        rawTitle: testCase.document.title || ""
      }),
      check("preview-theme-applied-after-click", common.theme === testCase.theme, {
        actualTheme: common.theme,
        expectedTheme: testCase.theme
      }),
      check("preview-shell-background-matches-theme-after-click", testCase.theme === "dark" ? shellLuminance <= 95 : shellLuminance >= 150, {
        shellLuminance,
        theme: testCase.theme
      }),
      check("preview-text-contrast-readable-after-click", lowContrastSamples.length === 0, {
        lowContrastSamples
      }),
      check("preview-workbook-visible-after-click", common.workbookVisibleEarly, {
        viewportHeight: common.viewportHeight,
        workbook: common.workbook
      }),
      check("download-original-action-present-after-click", common.downloadHref.includes(`/api/documents/${encodeURIComponent(testCase.document.id)}/file`) && /disposition=attachment/.test(common.downloadHref), {
        downloadHref: common.downloadHref
      }),
      check("preview-no-horizontal-overflow-after-click", common.scrollWidth <= common.viewportWidth + 1, {
        scrollWidth: common.scrollWidth,
        viewportWidth: common.viewportWidth
      }),
      check("preview-no-framework-overlay-after-click", !common.frameworkOverlayVisible, {}),
      check("preview-console-clean-after-click", consoleErrors.length === 0 && pageErrors.length === 0, {
        consoleErrors,
        pageErrors
      }),
      check("preview-network-clean-after-click", badResponses.length === 0, {
        badResponses,
        ignoredAuthProbe: "/api/auth/me 401 is expected for guest preview sessions"
      }),
      check("preview-screenshot-written-after-click", fs.existsSync(screenshot), {
        screenshot
      })
    );

    if (testCase.kind === "excel-html") {
      const safeOpenAction = safeOpenActionEvidence(formatMetrics);
      const targetEvidence = openActionTargetsPreviewSource(formatMetrics, testCase.kind, testCase.document.id);

      checks.push(
        check("excel-html-preview-frame-has-content-after-click", formatMetrics.bodyTextLength > 80, {
          bodyTextLength: formatMetrics.bodyTextLength,
          headings: formatMetrics.headings
        }),
        check("excel-html-preview-has-visible-table-after-click", formatMetrics.visibleTableCount > 0, {
          tableCount: formatMetrics.tableCount,
          visibleTableCount: formatMetrics.visibleTableCount
        }),
        check("excel-html-preview-open-action-is-safe-after-click", safeOpenAction.isSafe, safeOpenAction),
        check("excel-html-preview-open-action-targets-html-preview-after-click", targetEvidence.matches, targetEvidence)
      );
    }

    if (isPdfLikePreview(testCase.kind)) {
      const safeOpenAction = safeOpenActionEvidence(formatMetrics);
      const targetEvidence = openActionTargetsPreviewSource(formatMetrics, testCase.kind, testCase.document.id);

      checks.push(
        check("pdf-preview-renders-native-frame-after-click", formatMetrics.frameVisible && formatMetrics.frameRect?.height >= (testCase.viewport.name === "mobile" ? 420 : 520), {
          frameRect: formatMetrics.frameRect,
          frameSrc: formatMetrics.frameSrc,
          frameVisible: formatMetrics.frameVisible
        }),
        check("pdf-preview-not-in-error-fallback-after-click", !formatMetrics.renderFailedMessage, {
          renderFailedMessage: formatMetrics.renderFailedMessage
        }),
        check("pdf-preview-open-action-is-safe-after-click", safeOpenAction.isSafe, safeOpenAction),
        check("pdf-preview-open-action-targets-inline-preview-after-click", targetEvidence.matches, targetEvidence)
      );

      if (testCase.kind === "spreadsheet-pdf") {
        checks.push(
          check("spreadsheet-preview-source-has-ready-pdf-preview-after-click", testCase.document.previewStatus === "ready" && /\.pdf$/i.test(testCase.document.previewFileName || ""), {
            previewFileName: testCase.document.previewFileName || "",
            previewStatus: testCase.document.previewStatus || ""
          })
        );
      }

      if (testCase.kind === "converted-office-pdf") {
        checks.push(
          check("converted-office-preview-source-has-ready-pdf-preview-after-click", testCase.document.previewStatus === "ready" && /\.pdf$/i.test(testCase.document.previewFileName || ""), {
            previewFileName: testCase.document.previewFileName || "",
            previewStatus: testCase.document.previewStatus || ""
          })
        );
      }
    }
  }

  await context.close();

  return {
    checks,
    document: {
      id: testCase.document.id,
      originalName: testCase.document.originalName || "",
      title: testCase.document.title || ""
    },
    documentsScreenshot,
    kind: testCase.kind,
    metrics: {
      common,
      format: formatMetrics
    },
    name: testCase.name,
    route: targetRoute,
    screenshot,
    source: "documents-click",
    theme: testCase.theme,
    url: currentUrl,
    viewport: {
      height: testCase.viewport.height,
      name: testCase.viewport.name,
      width: testCase.viewport.width
    }
  };
}

ensureDir(reportsDir);
ensureDir(screenshotsDir);

const documents = readDocuments();
const placeholderOnlyDataset = documents.length > 0 && documents.every((document) => !document.fileName && !document.url);
const spreadsheetDocument = pickDocument(documents, "spreadsheet-pdf");
const pdfDocument = pickDocument(documents, "pdf");
const convertedOfficeDocument = pickDocument(documents, "converted-office-pdf");
const setupChecks = [
  check("browser-plugin-availability-recorded", true, {
    browserPath: "Browser plugin not available in this session; using Playwright."
  }),
  check("documents-json-readable", documents.length > 0, {
    documentsPath,
    totalDocuments: documents.length
  }),
  check("spreadsheet-pdf-preview-document-selected", placeholderOnlyDataset || Boolean(spreadsheetDocument), {
    placeholderOnlyDataset,
    selectedId: spreadsheetDocument?.id || ""
  }),
  check("pdf-document-selected", placeholderOnlyDataset || Boolean(pdfDocument), {
    placeholderOnlyDataset,
    selectedId: pdfDocument?.id || ""
  }),
  check("converted-office-preview-document-selected", placeholderOnlyDataset || Boolean(convertedOfficeDocument), {
    placeholderOnlyDataset,
    selectedId: convertedOfficeDocument?.id || "",
    selectedOriginalName: convertedOfficeDocument?.originalName || "",
    selectedTitle: convertedOfficeDocument?.title || ""
  }),
  check("light-and-dark-themes-covered", themes.includes("light") && themes.includes("dark"), {
    themes
  }),
  check("documents-navigation-flow-covered", placeholderOnlyDataset || Boolean(spreadsheetDocument && pdfDocument && convertedOfficeDocument), {
    placeholderOnlyDataset,
    route: "/documents",
    selectedIds: [spreadsheetDocument?.id, pdfDocument?.id, convertedOfficeDocument?.id].filter(Boolean)
  })
];

const browser = await chromium.launch({ headless: true });
const cases = [
  ...(spreadsheetDocument ? themes.flatMap((theme) => viewports.map((viewport) => ({
    document: spreadsheetDocument,
    kind: "spreadsheet-pdf",
    name: `spreadsheet-pdf-${theme}-${viewport.name}`,
    theme,
    viewport
  }))) : []),
  ...(pdfDocument ? themes.flatMap((theme) => viewports.map((viewport) => ({
    document: pdfDocument,
    kind: "pdf",
    name: `pdf-${theme}-${viewport.name}`,
    theme,
    viewport
  }))) : []),
  ...(convertedOfficeDocument ? themes.flatMap((theme) => viewports.map((viewport) => ({
    document: convertedOfficeDocument,
    kind: "converted-office-pdf",
    name: `converted-office-pdf-${theme}-${viewport.name}`,
    theme,
    viewport
  }))) : [])
];
const navigationCases = [
  ...(spreadsheetDocument ? navigationThemes.flatMap((theme) => viewports.map((viewport) => ({
    document: spreadsheetDocument,
    kind: "spreadsheet-pdf",
    name: `documents-click-spreadsheet-pdf-${theme}-${viewport.name}`,
    theme,
    viewport
  }))) : []),
  ...(pdfDocument ? navigationThemes.flatMap((theme) => viewports.map((viewport) => ({
    document: pdfDocument,
    kind: "pdf",
    name: `documents-click-pdf-${theme}-${viewport.name}`,
    theme,
    viewport
  }))) : []),
  ...(convertedOfficeDocument ? navigationThemes.flatMap((theme) => viewports.map((viewport) => ({
    document: convertedOfficeDocument,
    kind: "converted-office-pdf",
    name: `documents-click-converted-office-pdf-${theme}-${viewport.name}`,
    theme,
    viewport
  }))) : [])
];
const results = [];

try {
  for (const testCase of cases) {
    results.push(await runCase(browser, testCase));
  }
  for (const testCase of navigationCases) {
    results.push(await runNavigationCase(browser, testCase));
  }
} finally {
  await browser.close();
}

const allChecks = [
  ...setupChecks,
  ...results.flatMap((result) => result.checks)
];
const failedChecks = allChecks
  .filter((item) => !item.pass)
  .map((item) => ({
    check: item.name,
    evidence: item.evidence
  }));
const summary = {
  failed: failedChecks.length,
  passed: allChecks.length - failedChecks.length,
  total: allChecks.length
};

const report = {
  baseUrl,
  browserPath: "Playwright",
  documentsPath,
  failedChecks,
  generatedAtUtc: new Date().toISOString(),
  ok: failedChecks.length === 0,
  results,
  setupChecks,
  summary,
  targetFlow: "/documents -> /documents/:id/preview -> inline document content renders -> fallback actions remain available"
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  failedChecks,
  ok: report.ok,
  reportPath,
  summary,
  tested: results.map((result) => ({
    documentId: result.document.id,
    flow: result.source,
    kind: result.kind,
    route: result.route,
    screenshot: result.screenshot,
    theme: result.theme,
    viewport: result.viewport.name
  }))
}, null, 2));

if (!report.ok) process.exit(1);
