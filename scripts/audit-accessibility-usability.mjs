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
const reportPath = path.join(reportsDir, "accessibility-usability-audit.json");

const routeCases = [
  { name: "home", path: "/", minTextLength: 600 },
  { name: "home-dark", path: "/", minTextLength: 600, theme: "dark" },
  { allowedPathnames: ["/safety-6s", "/login"], minTextLengthByPathname: { "/login": 140 }, name: "safety", path: "/safety-6s", minTextLength: 500 },
  { allowedPathnames: ["/safety-6s", "/login"], minTextLengthByPathname: { "/login": 140 }, name: "safety-dark", path: "/safety-6s", minTextLength: 500, theme: "dark" },
  { kind: "documents", name: "documents", path: "/documents", minTextLength: 500 },
  { kind: "documents", name: "documents-dark", path: "/documents", minTextLength: 500, theme: "dark" },
  { kind: "login", name: "login", path: "/login", minTextLength: 140 },
  { kind: "login", name: "login-dark", path: "/login", minTextLength: 140, theme: "dark" }
];

const viewports = [
  { name: "desktop", width: 1366, height: 768, deviceScaleFactor: 1 },
  {
    name: "mobile",
    width: 390,
    height: 900,
    deviceScaleFactor: 2,
    routes: ["home", "home-dark", "safety", "safety-dark", "documents", "documents-dark", "login", "login-dark"]
  }
];

const ensureDir = (directory) => fs.mkdirSync(directory, { recursive: true });

const check = (name, pass, evidence = {}) => ({
  evidence,
  name,
  pass: Boolean(pass)
});

const normalizeUrl = (routePath) => new URL(routePath, browserBaseUrl).toString();

const visibleSelector = "a[href], button, input, select, textarea, [role='button'], [role='menuitem'], [role='tab']";

const isLocalRateLimitResponse = (url, status) => {
  if (status !== 429) return false;
  try {
    const parsed = new URL(url);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
  } catch {
    return false;
  }
};

const isLocalRateLimitConsoleMessage = (message) =>
  /(?:status of 429|too many requests|rate_limited)/i.test(String(message || ""));

const luminanceFromCssColor = (value) => {
  const match = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return null;
  const [, red, green, blue] = match.map(Number);
  return Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
};

async function collectRouteMetrics(page) {
  return page.evaluate(({ visibleSelector }) => {
    const compactText = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const textForIds = (ids) =>
      String(ids || "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => compactText(document.getElementById(id)?.textContent || ""))
        .filter(Boolean)
        .join(" ");
    const associatedLabel = (element) => {
      if (element.id) {
        const explicit = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (explicit) return compactText(explicit.textContent);
      }
      const implicit = element.closest("label");
      return implicit ? compactText(implicit.textContent) : "";
    };
    const accessibleName = (element) =>
      compactText(
        element.getAttribute("aria-label")
          || textForIds(element.getAttribute("aria-labelledby"))
          || element.getAttribute("title")
          || associatedLabel(element)
          || element.getAttribute("placeholder")
          || element.textContent
          || ""
      );
    const describeControl = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        ariaLabel: element.getAttribute("aria-label") || "",
        className: element.className || "",
        disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
        height: Number(rect.height.toFixed(2)),
        href: element.getAttribute("href") || "",
        name: accessibleName(element),
        role: element.getAttribute("role") || "",
        tag: element.tagName.toLowerCase(),
        text: compactText(element.textContent).slice(0, 120),
        title: element.getAttribute("title") || "",
        type: element.getAttribute("type") || "",
        width: Number(rect.width.toFixed(2))
      };
    };

    const controls = [...document.querySelectorAll(visibleSelector)].filter(isVisible).map(describeControl);
    const namelessControls = controls.filter((item) => !item.disabled && !item.name);
    const tinyControls = controls.filter((item) =>
      !item.disabled
      && (item.tag === "button" || item.role === "button" || item.role === "tab" || item.className.includes("icon-button"))
      && (item.width < 28 || item.height < 28)
    );
    const invalidLinks = controls.filter((item) =>
      item.tag === "a" && (!item.href || item.href === "#" || /^javascript:/i.test(item.href))
    );
    const duplicateIds = [...document.querySelectorAll("[id]")]
      .map((element) => element.id)
      .filter((id, index, ids) => id && ids.indexOf(id) !== index);
    const missingAriaReferences = [...document.querySelectorAll("[aria-labelledby], [aria-describedby]")]
      .flatMap((element) =>
        ["aria-labelledby", "aria-describedby"].flatMap((attr) =>
          String(element.getAttribute(attr) || "")
            .split(/\s+/)
            .filter(Boolean)
            .filter((id) => !document.getElementById(id))
            .map((id) => ({
              attr,
              id,
              tag: element.tagName.toLowerCase()
            }))
        )
      );
    const visibleImagesWithoutAlt = [...document.images]
      .filter(isVisible)
      .filter((image) => !image.hasAttribute("alt"))
      .map((image) => ({ height: image.height, src: image.currentSrc || image.src, width: image.width }));
    const bodyText = compactText(document.body.innerText || "");
    const mains = [...document.querySelectorAll("main")].filter(isVisible);
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
      .filter(isVisible)
      .map((heading) => ({ level: Number(heading.tagName.slice(1)), text: compactText(heading.textContent) }));
    const allHeadings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
      .map((heading) => ({ level: Number(heading.tagName.slice(1)), text: compactText(heading.textContent) }));
    const focusableRoleButtonsMissingKeyboard = [...document.querySelectorAll("[role='button']")]
      .filter(isVisible)
      .filter((element) => element.tabIndex < 0)
      .map(describeControl);
    const intersection = (a, b) => {
      if (!a || !b) return { area: 0, height: 0, width: 0 };
      const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

      return {
        area: Number((width * height).toFixed(2)),
        height: Number(height.toFixed(2)),
        width: Number(width.toFixed(2))
      };
    };
    const toRect = (element) => {
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
    const styleSnapshot = (selector) => {
      const element = document.querySelector(selector);
      if (!element || !isVisible(element)) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        color: style.color,
        height: Number(rect.height.toFixed(2)),
        selector,
        width: Number(rect.width.toFixed(2))
      };
    };
    const documentHeroSummary = [...document.querySelectorAll(".document-hero-summary-item")]
      .filter(isVisible)
      .map((item) => {
        const label = item.querySelector("span");
        const value = item.querySelector("strong");
        const labelRect = toRect(label);
        const valueRect = toRect(value);
        const valueStyle = value ? getComputedStyle(value) : null;
        const valueText = compactText(value?.textContent || "");

        return {
          className: item.className || "",
          itemRect: toRect(item),
          label: compactText(label?.textContent || ""),
          labelRect,
          overlap: intersection(labelRect, valueRect),
          value: valueText,
          valueFontSize: valueStyle ? Number.parseFloat(valueStyle.fontSize) : 0,
          valueIsText: /[^\d.,\s]/.test(valueText),
          valueRect
        };
      });
    const documentFilter = (() => {
      const bar = document.querySelector(".documents-main .filter-bar");
      if (!bar || !isVisible(bar)) return null;

      const searchBox = bar.querySelector(".search-box");
      const searchInput = searchBox?.querySelector("input");
      const searchButton = bar.querySelector("button.icon-button");
      const selects = [...bar.querySelectorAll("select")].filter(isVisible);
      const searchBoxRect = toRect(searchBox);
      const searchButtonRect = toRect(searchButton);

      return {
        barRect: toRect(bar),
        searchBoxRect,
        searchButtonRect,
        searchInputRect: toRect(searchInput),
        searchButtonSameRow: Boolean(searchBoxRect && searchButtonRect && Math.abs(searchBoxRect.top - searchButtonRect.top) <= 2),
        selects: selects.map((select) => ({
          name: accessibleName(select),
          rect: toRect(select)
        }))
      };
    })();
    const documentUploadPanel = (() => {
      const panel = document.querySelector(".upload-panel");
      if (!panel || !isVisible(panel)) return null;

      const loginPanel = panel.querySelector(".login-required-panel");
      const loginButton = loginPanel?.querySelector(".primary-button");
      const firstDocument = document.querySelector(".document-row");
      const resultsHeading = document.querySelector(".document-results-heading");

      return {
        box: toRect(panel),
        firstDocument: toRect(firstDocument),
        isAccessLimited: panel.classList.contains("access-limited"),
        loginButton: toRect(loginButton),
        loginPanel: toRect(loginPanel),
        resultsHeading: toRect(resultsHeading)
      };
    })();
    const loginPanel = (() => {
      const card = document.querySelector(".login-card");
      if (!card || !isVisible(card)) return null;

      const title = card.querySelector("h1");
      const subtitle = card.querySelector(".login-hero p");
      const accessChips = [...card.querySelectorAll(".login-access-grid span")].filter(isVisible);
      const username = card.querySelector('input[name="username"]');
      const password = card.querySelector('input[name="password"]');
      const submit = card.querySelector('button[type="submit"]');
      const credit = document.querySelector(".site-credit");

      return {
        accessChips: accessChips.map((chip) => ({
          name: compactText(chip.textContent),
          rect: toRect(chip)
        })),
        box: toRect(card),
        credit: toRect(credit),
        password: password ? describeControl(password) : null,
        submit: submit ? describeControl(submit) : null,
        subtitle: subtitle
          ? {
              rect: toRect(subtitle),
              text: compactText(subtitle.textContent)
            }
          : null,
        title: title
          ? {
              rect: toRect(title),
              text: compactText(title.textContent)
            }
          : null,
        username: username ? describeControl(username) : null
      };
    })();

    return {
      allHeadings,
      bodyTextLength: bodyText.length,
      pathname: window.location.pathname,
      controls,
      documentFilter,
      documentHeroSummary,
      documentSurfaceStyles: {
        filterInput: styleSnapshot(".filter-bar input"),
        filterSelect: styleSnapshot(".filter-bar select"),
        firstDocumentTitle: styleSnapshot(".document-row h3"),
        resultsHeading: styleSnapshot(".document-results-heading h2"),
        subtitle: styleSnapshot(".documents-title-band p"),
        title: styleSnapshot(".documents-title-band h1"),
        uploadGateText: styleSnapshot(".upload-panel .login-required-panel p")
      },
      documentUploadPanel,
      duplicateIds: [...new Set(duplicateIds)],
      focusableRoleButtonsMissingKeyboard,
      headings,
      invalidLinks,
      loginPanel,
      mainCount: mains.length,
      mainTextLength: compactText(mains[0]?.innerText || "").length,
      missingAriaReferences,
      namelessControls,
      shellSurfaceStyles: {
        pageTitle: styleSnapshot(".topbar-page-title span"),
        sidebarToggle: styleSnapshot(".topbar .sidebar-toggle"),
        authButton: styleSnapshot(".topbar .topnav-auth-btn"),
        iconButton: styleSnapshot(".topbar .topnav-icon-btn"),
        iconGlyph: styleSnapshot(".topbar .topnav-icon-btn svg"),
        languageText: styleSnapshot(".topbar .topnav-lang-btn span"),
        statusPill: styleSnapshot(".topbar .topnav-status-pill"),
        statusText: styleSnapshot(".topbar .topnav-status-pill strong"),
        topbar: styleSnapshot(".topbar"),
        topbarActions: styleSnapshot(".topbar .topbar-action-cluster"),
        userText: styleSnapshot(".topbar .user-session-btn span")
      },
      theme: document.documentElement.dataset.theme || "",
      tinyControls,
      visibleControls: controls.length,
      visibleImagesWithoutAlt
    };
  }, { visibleSelector });
}

function evaluateRoute(routeCase, viewport, metrics, screenshot, consoleErrors, badResponses) {
  const h1Count = metrics.allHeadings.filter((heading) => heading.level === 1).length;
  const expectedTheme = routeCase.theme || "light";
  const allowedPathnames = routeCase.allowedPathnames || [];
  const pathAllowed = allowedPathnames.length === 0 || allowedPathnames.includes(metrics.pathname);
  const minTextLength = routeCase.minTextLengthByPathname?.[metrics.pathname] ?? routeCase.minTextLength;
  const isDocumentsRoute = routeCase.kind === "documents" || routeCase.name === "documents";
  const isLoginRoute = routeCase.kind === "login";
  const blockingConsoleErrors = consoleErrors.filter((message) => !isLocalRateLimitConsoleMessage(message));
  const blockingBadResponses = badResponses.filter((response) => !isLocalRateLimitResponse(response.url, response.status));
  const checks = [
    check("a11y-theme-applied", metrics.theme === expectedTheme, {
      actual: metrics.theme,
      expected: expectedTheme,
      route: routeCase.name,
      viewport: viewport.name
    }),
    check("a11y-page-has-one-main", metrics.mainCount === 1, {
      mainCount: metrics.mainCount,
      route: routeCase.name,
      viewport: viewport.name
    }),
    check("a11y-page-has-h1", h1Count >= 1, {
      h1Count,
      headings: metrics.allHeadings.slice(0, 12),
      route: routeCase.name
    }),
    check("a11y-main-has-content", pathAllowed && metrics.mainTextLength >= minTextLength, {
      allowedPathnames,
      expectedMin: minTextLength,
      mainTextLength: metrics.mainTextLength,
      pathname: metrics.pathname
    }),
    check("a11y-visible-controls-have-names", metrics.namelessControls.length === 0, {
      namelessControls: metrics.namelessControls.slice(0, 12),
      visibleControls: metrics.visibleControls
    }),
    check("a11y-interactive-targets-not-tiny", metrics.tinyControls.length === 0, {
      tinyControls: metrics.tinyControls.slice(0, 12)
    }),
    check("a11y-links-have-valid-hrefs", metrics.invalidLinks.length === 0, {
      invalidLinks: metrics.invalidLinks.slice(0, 12)
    }),
    check("a11y-aria-references-resolve", metrics.missingAriaReferences.length === 0, {
      missingAriaReferences: metrics.missingAriaReferences.slice(0, 12)
    }),
    check("a11y-no-duplicate-ids", metrics.duplicateIds.length === 0, {
      duplicateIds: metrics.duplicateIds.slice(0, 12)
    }),
    check("a11y-visible-images-have-alt", metrics.visibleImagesWithoutAlt.length === 0, {
      visibleImagesWithoutAlt: metrics.visibleImagesWithoutAlt.slice(0, 12)
    }),
    check("a11y-role-buttons-keyboard-focusable", metrics.focusableRoleButtonsMissingKeyboard.length === 0, {
      focusableRoleButtonsMissingKeyboard: metrics.focusableRoleButtonsMissingKeyboard.slice(0, 12)
    }),
    check("a11y-route-screenshot-written", fs.existsSync(screenshot), { screenshot }),
    check("a11y-console-clean", blockingConsoleErrors.length === 0, {
      consoleErrors: blockingConsoleErrors,
      ignoredRateLimitConsoleErrors: consoleErrors.filter(isLocalRateLimitConsoleMessage)
    }),
    check("a11y-no-bad-network-responses", blockingBadResponses.length === 0, {
      badResponses: blockingBadResponses,
      ignoredRateLimitResponses: badResponses.filter((response) => isLocalRateLimitResponse(response.url, response.status))
    })
  ];

  if (isDocumentsRoute) {
    const summaryItems = metrics.documentHeroSummary || [];
    const textValueMaxFont = viewport.name === "mobile" ? 13.5 : 15;
    checks.push(check("a11y-documents-hero-summary-no-label-value-overlap", summaryItems.length >= 4 && summaryItems.every((item) => item.overlap.area === 0), {
      summaryItems
    }));
    checks.push(check("a11y-documents-hero-text-values-compact", summaryItems.filter((item) => item.valueIsText).every((item) => item.valueFontSize <= textValueMaxFont), {
      expectedMaxFontSize: textValueMaxFont,
      textValueItems: summaryItems.filter((item) => item.valueIsText),
      viewport: viewport.name
    }));
    if (viewport.name === "mobile") {
      const filter = metrics.documentFilter;
      checks.push(check("a11y-documents-mobile-filter-search-inline", Boolean(
        filter
          && filter.searchButtonSameRow
          && filter.searchBoxRect?.width >= 260
          && filter.searchButtonRect?.width >= 36
          && filter.searchButtonRect?.width <= 52
          && filter.selects?.length >= 2
          && filter.selects.every((item) => item.rect?.height >= 34)
      ), {
        filter
      }));
      const uploadPanel = metrics.documentUploadPanel;
      checks.push(check("a11y-documents-mobile-upload-gate-compact", Boolean(
        uploadPanel
          && uploadPanel.isAccessLimited
          && uploadPanel.box?.height <= 210
          && uploadPanel.loginPanel?.height <= 112
          && (!uploadPanel.loginButton || uploadPanel.loginButton.height <= 44)
      ), {
        uploadPanel
      }));
    }

    if (expectedTheme === "dark") {
      const styles = metrics.documentSurfaceStyles || {};
      const primaryText = [styles.title, styles.firstDocumentTitle, styles.resultsHeading];
      const secondaryText = [styles.subtitle, styles.uploadGateText];
      const controlSurfaces = [styles.filterInput, styles.filterSelect];
      checks.push(check("a11y-documents-dark-surfaces-readable", Boolean(
        primaryText.every((item) => luminanceFromCssColor(item?.color) >= 185)
          && secondaryText.every((item) => luminanceFromCssColor(item?.color) >= 145)
          && controlSurfaces.every((item) => (
            luminanceFromCssColor(item?.color) >= 185
              && luminanceFromCssColor(item?.backgroundColor) <= 80
          ))
      ), {
        controlSurfaces,
        primaryText,
        secondaryText
      }));
    }
  }

  if (isLoginRoute) {
    const login = metrics.loginPanel;
    checks.push(check("a11y-login-has-operable-form-structure", Boolean(
      login
        && login.title?.text
        && login.subtitle?.text
        && login.accessChips?.length === 3
        && login.username?.name
        && login.password?.name
        && login.submit?.name
        && login.submit?.width >= 120
        && login.submit?.height >= 40
    ), {
      login
    }));
    checks.push(check("a11y-login-credit-visible-and-attributed", Boolean(
      login?.credit
        && login.credit.width >= 180
        && metrics.bodyTextLength >= routeCase.minTextLength
    ), {
      bodyTextLength: metrics.bodyTextLength,
      credit: login?.credit,
      expectedDesigner: "Nguyen Van Thang - PE1"
    }));
  }

  if (expectedTheme === "dark") {
    const styles = metrics.shellSurfaceStyles || {};
    const minShellTextSamples = viewport.name === "mobile" ? 3 : 4;
    const primaryShellText = [
      styles.pageTitle,
      styles.sidebarToggle,
      styles.authButton,
      styles.topbarActions,
      styles.iconButton,
      styles.iconGlyph,
      styles.languageText,
      styles.statusText,
      styles.userText
    ].filter(Boolean);
    const darkShellSurfaces = [styles.topbar, styles.topbarActions, styles.statusPill, styles.iconButton, styles.sidebarToggle, styles.authButton].filter(Boolean);
    checks.push(check("a11y-dark-shell-controls-readable", Boolean(
      primaryShellText.length >= minShellTextSamples
        && primaryShellText.every((item) => luminanceFromCssColor(item.color) >= 185)
        && darkShellSurfaces.length >= 3
        && darkShellSurfaces.every((item) => luminanceFromCssColor(item.backgroundColor) <= 95)
    ), {
      darkShellSurfaces,
      minShellTextSamples,
      primaryShellText,
      route: routeCase.name,
      viewport: viewport.name
    }));
  }

  return checks;
}

async function auditRoute(browser, routeCase, viewport) {
  const context = await browser.newContext({
    deviceScaleFactor: viewport.deviceScaleFactor,
    viewport: { width: viewport.width, height: viewport.height }
  });

  await context.addInitScript(({ theme }) => {
    localStorage.setItem("hub-lang", "vi");
    localStorage.setItem("hub-theme-default-version", "light-default-v1");
    localStorage.setItem("hub-theme", theme);
  }, { theme: routeCase.theme || "light" });

  const page = await context.newPage();
  const consoleErrors = [];
  const badResponses = [];

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

  const response = await page.goto(normalizeUrl(routeCase.path), { waitUntil: "networkidle", timeout: 25000 });
  const screenshot = path.join(screenshotsDir, `accessibility-${routeCase.name}-${viewport.name}.png`);
  await page.screenshot({ fullPage: false, path: screenshot });
  const metrics = await collectRouteMetrics(page);
  const checks = [
    check("a11y-route-loaded", Boolean(response?.ok()), {
      status: response?.status(),
      url: page.url()
    }),
    ...evaluateRoute(routeCase, viewport, metrics, screenshot, consoleErrors, badResponses)
  ];

  await context.close();

  return {
    checks,
    metrics,
    route: routeCase.name,
    screenshot,
    viewport: viewport.name
  };
}

async function auditInteractions(browser) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { width: 1920, height: 1080 }
  });
  await context.addInitScript(() => {
    localStorage.setItem("hub-lang", "vi");
    localStorage.setItem("hub-theme-default-version", "light-default-v1");
    localStorage.setItem("hub-theme", "light");
  });
  const page = await context.newPage();
  await page.goto(normalizeUrl("/"), { waitUntil: "networkidle", timeout: 25000 });

  const checks = [];

  await page.locator(".topnav-help-btn:visible").first().click();
  await page.locator(".help-modal[role='dialog']").waitFor({ state: "visible", timeout: 8000 });
  const helpMetrics = await page.evaluate(() => {
    const dialog = document.querySelector(".help-modal");
    const focusables = dialog
      ? [...dialog.querySelectorAll("a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])")]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
      : [];
    return {
      ariaModal: dialog?.getAttribute("aria-modal") || "",
      closeButtonName: dialog?.querySelector("button[aria-label]")?.getAttribute("aria-label") || "",
      focusableCount: focusables.length,
      role: dialog?.getAttribute("role") || "",
      title: dialog?.querySelector("h2")?.textContent?.trim() || ""
    };
  });
  checks.push(check("a11y-help-dialog-contract", helpMetrics.role === "dialog" && helpMetrics.ariaModal === "true" && helpMetrics.focusableCount >= 2 && Boolean(helpMetrics.closeButtonName), helpMetrics));
  await page.locator(".help-modal button[aria-label]").last().click();
  await page.locator(".help-modal").waitFor({ state: "detached", timeout: 8000 });

  await page.locator(".language-trigger:visible").first().click();
  const languageMetrics = await page.evaluate(() => {
    const trigger = document.querySelector(".language-trigger");
    const items = [...document.querySelectorAll(".topnav-menu [role='menuitem']")].filter((item) => {
      const rect = item.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return {
      expanded: trigger?.getAttribute("aria-expanded") || "",
      itemCount: items.length,
      itemTexts: items.map((item) => item.textContent.trim())
    };
  });
  checks.push(check("a11y-language-menu-contract", languageMetrics.expanded === "true" && languageMetrics.itemCount >= 3, languageMetrics));

  await context.close();

  const mobileContext = await browser.newContext({
    deviceScaleFactor: 2,
    viewport: { width: 390, height: 900 }
  });
  await mobileContext.addInitScript(() => {
    localStorage.setItem("hub-lang", "vi");
    localStorage.setItem("hub-theme-default-version", "light-default-v1");
    localStorage.setItem("hub-theme", "light");
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(normalizeUrl("/"), { waitUntil: "networkidle", timeout: 25000 });
  await mobilePage.locator(".sidebar-toggle").click();
  await mobilePage.locator(".app-shell.sidebar-open .side-rail").waitFor({ state: "visible", timeout: 8000 });
  await mobilePage.waitForFunction(() => {
    const drawer = document.querySelector(".app-shell.sidebar-open .side-rail");
    if (!drawer) return false;
    return drawer.getBoundingClientRect().left >= -1;
  }, null, { timeout: 8000 });
  const drawerMetrics = await mobilePage.evaluate(() => {
    const drawer = document.querySelector(".side-rail");
    const links = [...document.querySelectorAll(".main-nav a")].filter((link) => {
      const rect = link.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.left >= 0;
    });
    const close = document.querySelector(".sidebar-close");
    return {
      closeName: close?.getAttribute("aria-label") || close?.textContent?.trim() || "",
      drawerLeft: drawer?.getBoundingClientRect().left || 0,
      linkCount: links.length,
      linkTexts: links.map((link) => link.textContent.trim())
    };
  });
  checks.push(check("a11y-mobile-drawer-contract", drawerMetrics.drawerLeft >= -1 && drawerMetrics.linkCount >= 3 && Boolean(drawerMetrics.closeName), drawerMetrics));
  await mobileContext.close();

  return {
    checks,
    route: "interaction",
    viewport: "mixed"
  };
}

ensureDir(reportsDir);
ensureDir(screenshotsDir);

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    const routeNames = new Set(viewport.routes || routeCases.map((item) => item.name));
    for (const routeCase of routeCases.filter((item) => routeNames.has(item.name))) {
      results.push(await auditRoute(browser, routeCase, viewport));
    }
  }
  results.push(await auditInteractions(browser));
} finally {
  await browser.close();
}

const failedChecks = results.flatMap((result) =>
  result.checks
    .filter((item) => !item.pass)
    .map((item) => ({
      check: item.name,
      evidence: item.evidence,
      route: result.route,
      viewport: result.viewport
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
  routes: results.map((result) => ({
    checks: result.checks.length,
    route: result.route,
    screenshot: result.screenshot,
    viewport: result.viewport
  }))
}, null, 2));

if (!report.ok) {
  process.exit(1);
}
