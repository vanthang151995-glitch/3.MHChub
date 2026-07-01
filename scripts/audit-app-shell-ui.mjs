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
const reportPath = path.join(reportsDir, "app-shell-ui-audit.json");
const screenshotDir = readArg("--screenshots", path.join("qa", "screenshots"));

const viewports = [
  { name: "light-1920-full", theme: "light", width: 1920, height: 1080, shell: "full" },
  { name: "light-1600-collapsed", theme: "light", width: 1600, height: 900, shell: "collapsed" },
  { name: "light-1536-zoom125-collapsed", theme: "light", width: 1536, height: 864, shell: "collapsed", deviceScaleFactor: 1.25 },
  { name: "light-1440-collapsed", theme: "light", width: 1440, height: 900, shell: "collapsed" },
  { name: "light-1200-collapsed", theme: "light", width: 1200, height: 820, shell: "collapsed" },
  { name: "light-1366-collapsed", theme: "light", width: 1366, height: 768, shell: "collapsed" },
  { name: "light-390-mobile", theme: "light", width: 390, height: 900, shell: "drawer", deviceScaleFactor: 2 },
  { name: "dark-1536-collapsed", theme: "dark", width: 1536, height: 864, shell: "collapsed" },
  { name: "dark-1200-collapsed", theme: "dark", width: 1200, height: 820, shell: "collapsed" },
  { name: "dark-1366-collapsed", theme: "dark", width: 1366, height: 768, shell: "collapsed" },
  { name: "dark-1024-drawer", theme: "dark", width: 1024, height: 768, shell: "drawer" },
  { name: "dark-390-mobile", theme: "dark", width: 390, height: 900, shell: "drawer" }
];

const check = (name, pass, evidence = {}) => ({
  name,
  pass: Boolean(pass),
  evidence
});

const isLocalRateLimitConsoleMessage = (message) =>
  /(?:status of 429|too many requests|rate_limited)/i.test(String(message || ""));

const ensureDir = (directory) => {
  fs.mkdirSync(directory, { recursive: true });
};

const rectFromElement = (element) => {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
    x: rect.x,
    y: rect.y
  };
};

const luminanceFromRgb = (rgb) => {
  const match = String(rgb || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return null;
  const [, red, green, blue] = match.map(Number);
  return Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
};

async function collectShellMetrics(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const item = element.getBoundingClientRect();
      return {
        bottom: item.bottom,
        height: item.height,
        left: item.left,
        right: item.right,
        top: item.top,
        width: item.width,
        x: item.x,
        y: item.y
      };
    };
    const elementRect = (element) => {
      if (!element) return null;
      const item = element.getBoundingClientRect();
      return {
        bottom: item.bottom,
        height: item.height,
        left: item.left,
        right: item.right,
        top: item.top,
        width: item.width,
        x: item.x,
        y: item.y
      };
    };

    const nav = [...document.querySelectorAll(".main-nav a")].map((link) => {
      const box = link.getBoundingClientRect();
      const icon = link.querySelector("svg")?.getBoundingClientRect();
      const label = link.querySelector("span");
      const labelBox = label?.getBoundingClientRect();
      const labelStyle = label ? getComputedStyle(label) : null;
      return {
        active: link.classList.contains("active"),
        box: {
          height: box.height,
          left: box.left,
          top: box.top,
          width: box.width
        },
        dx: icon ? Math.abs((icon.left + icon.width / 2) - (box.left + box.width / 2)) : null,
        dy: icon ? Math.abs((icon.top + icon.height / 2) - (box.top + box.height / 2)) : null,
        icon: icon
          ? {
              height: icon.height,
              left: icon.left,
              top: icon.top,
              width: icon.width
            }
          : null,
        label: labelBox
          ? {
              display: labelStyle?.display || "",
              height: labelBox.height,
              opacity: Number.parseFloat(labelStyle?.opacity) || 0,
              visibility: labelStyle?.visibility || "",
              visible: labelStyle?.display !== "none"
                && labelStyle?.visibility !== "hidden"
                && Number.parseFloat(labelStyle?.opacity) > 0.05
                && labelBox.width > 4
                && labelBox.height > 4,
              width: labelBox.width
            }
          : null,
        text: link.textContent.trim()
      };
    });

    const topbar = document.querySelector(".topbar");
    const topbarStyle = topbar ? getComputedStyle(topbar) : null;
    const topbarBefore = topbar ? getComputedStyle(topbar, "::before") : null;
    const topbarAuth = document.querySelector(".topnav-auth-btn.user-session-btn");
    const topbarAuthText = topbarAuth?.querySelector("span");
    const topbarAuthTextBox = topbarAuthText?.getBoundingClientRect();
    const topbarAuthTextStyle = topbarAuthText ? getComputedStyle(topbarAuthText) : null;
    const topbarAuthIcon = topbarAuth?.querySelector("svg");
    const topbarAuthIconBox = topbarAuthIcon?.getBoundingClientRect();
    const topbarAuthStyle = topbarAuth ? getComputedStyle(topbarAuth) : null;
    const bodyStyle = getComputedStyle(document.body);
    const bodyBeforeStyle = getComputedStyle(document.body, "::before");
    const hasFixedBackgroundArt = bodyBeforeStyle.content && bodyBeforeStyle.content !== "none";
    const bodyBackgroundStyle = hasFixedBackgroundArt ? bodyBeforeStyle : bodyStyle;
    const sideRail = document.querySelector(".side-rail");
    const sideRailStyle = sideRail ? getComputedStyle(sideRail) : null;
    const sideRailVisibleChildren = sideRail
      ? [sideRail, ...sideRail.querySelectorAll("*")]
          .map((element) => {
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            const visible = style.display !== "none"
              && style.visibility !== "hidden"
              && Number.parseFloat(style.opacity || "1") > 0.05
              && box.width > 1
              && box.height > 1;
            return visible ? box : null;
          })
          .filter(Boolean)
      : [];
    const sideRailContentMaxRight = sideRailVisibleChildren.length
      ? Math.max(...sideRailVisibleChildren.map((box) => box.right))
      : null;
    const brandMark = document.querySelector(".brand-mark");
    const brandCopy = document.querySelector(".brand-copy");
    const brandMarkBox = brandMark?.getBoundingClientRect();
    const brandCopyBox = brandCopy?.getBoundingClientRect();
    const brandCopyStyle = brandCopy ? getComputedStyle(brandCopy) : null;
    const siteCredit = document.querySelector(".site-credit");
    const siteCreditStyle = siteCredit ? getComputedStyle(siteCredit) : null;
    const portalHeroArt = rect(".portal-hero-art");
    const portalHeroDots = rect(".hero-carousel-dots");
    const portalHeroDotButtons = [...document.querySelectorAll(".hero-carousel-dots button")].map((button) => {
      const buttonBox = button.getBoundingClientRect();
      const beforeStyle = getComputedStyle(button, "::before");
      return {
        boxHeight: buttonBox.height,
        boxWidth: buttonBox.width,
        visualHeight: Number.parseFloat(beforeStyle.height) || 0,
        visualWidth: Number.parseFloat(beforeStyle.width) || 0
      };
    });
    const portalHeroDotsVisualArea = portalHeroDotButtons.reduce((total, button) => {
      return total + button.visualWidth * button.visualHeight;
    }, 0);
    const portalMenuPanel = rect(".portal-menu-panel");
    const portalHeroImage = document.querySelector(".portal-hero-image");
    const portalHeroImageStyle = portalHeroImage ? getComputedStyle(portalHeroImage) : null;
    const systemHeader = document.querySelector(".portal-menu-panel .system-panel-header");
    const systemViewAll = systemHeader?.querySelector(".view-all-link");
    const portalLinkCards = [...document.querySelectorAll(".portal-link-card")].map((card) => {
      const box = card.getBoundingClientRect();
      const utilityIcon = card.querySelector(".utility-icon");
      const utilityIconBox = utilityIcon?.getBoundingClientRect();
      const utilityIconSvg = utilityIcon?.querySelector("svg")?.getBoundingClientRect();
      const launchLabel = card.querySelector(".launch-label");
      const launchLabelBox = launchLabel?.getBoundingClientRect();
      const launchLabelSvg = launchLabel?.querySelector("svg")?.getBoundingClientRect();
      const launchText = launchLabel?.querySelector(".launch-text");
      const launchTextStyle = launchText ? getComputedStyle(launchText) : null;
      const title = card.querySelector("h3");
      const titleBox = title?.getBoundingClientRect();
      const titleStyle = title ? getComputedStyle(title) : null;
      const target = card.querySelector(".portal-link-target");
      const targetBox = target?.getBoundingClientRect();
      const targetStyle = target ? getComputedStyle(target) : null;
      const accentCornerStyle = getComputedStyle(card, "::before");
      const iconCenterDelta = utilityIconBox && utilityIconSvg
        ? {
            dx: Math.abs((utilityIconSvg.left + utilityIconSvg.width / 2) - (utilityIconBox.left + utilityIconBox.width / 2)),
            dy: Math.abs((utilityIconSvg.top + utilityIconSvg.height / 2) - (utilityIconBox.top + utilityIconBox.height / 2))
          }
        : null;
      return {
        accentCorner: {
          height: Number.parseFloat(accentCornerStyle.height) || 0,
          width: Number.parseFloat(accentCornerStyle.width) || 0
        },
        height: box.height,
        iconCenterDelta,
        launchLabel: launchLabelBox
          ? {
              height: launchLabelBox.height,
              iconHeight: launchLabelSvg?.height || 0,
              iconWidth: launchLabelSvg?.width || 0,
              text: launchText?.textContent?.trim() || "",
              textVisible: Boolean(launchText && launchTextStyle?.display !== "none"),
              width: launchLabelBox.width
            }
          : null,
        overflowY: Math.max(0, card.scrollHeight - card.clientHeight),
        statusChipCount: card.querySelectorAll(".status-chip").length,
        target: targetBox
          ? {
              fontSize: Number.parseFloat(targetStyle?.fontSize) || 0,
              fontWeight: Number.parseFloat(targetStyle?.fontWeight) || 0,
              height: targetBox.height,
              text: target?.textContent?.trim() || "",
              width: targetBox.width
            }
          : null,
        text: title?.textContent?.trim() || "",
        title: titleBox
          ? {
              fontSize: Number.parseFloat(titleStyle?.fontSize) || 0,
              fontWeight: Number.parseFloat(titleStyle?.fontWeight) || 0,
              height: titleBox.height,
              lineHeight: Number.parseFloat(titleStyle?.lineHeight) || 0,
              width: titleBox.width
            }
          : null,
        utilityIcon: utilityIconBox
          ? {
              height: utilityIconBox.height,
              width: utilityIconBox.width
            }
          : null,
        width: box.width
      };
    });
    const safetyKpiCards = [...document.querySelectorAll(".system-kpi-card")].map((card) => {
      const box = card.getBoundingClientRect();
      const icon = card.querySelector(".system-kpi-icon");
      const iconBox = icon?.getBoundingClientRect();
      const value = card.querySelector(".system-kpi-value");
      const valueBox = value?.getBoundingClientRect();
      const valueStyle = value ? getComputedStyle(value) : null;
      const label = card.querySelector(".system-kpi-label");
      const labelBox = label?.getBoundingClientRect();
      const labelStyle = label ? getComputedStyle(label) : null;
      const detail = card.querySelector("small");
      const detailBox = detail?.getBoundingClientRect();
      const detailStyle = detail ? getComputedStyle(detail) : null;
      const trend = card.querySelector(".system-kpi-trend");
      const trendBox = trend?.getBoundingClientRect();
      return {
        detail: detailBox
          ? {
              fontSize: Number.parseFloat(detailStyle?.fontSize) || 0,
              height: detailBox.height,
              text: detail?.textContent?.trim() || "",
              width: detailBox.width
            }
          : null,
        height: box.height,
        icon: iconBox
          ? {
              height: iconBox.height,
              width: iconBox.width
            }
          : null,
        label: labelBox
          ? {
              fontSize: Number.parseFloat(labelStyle?.fontSize) || 0,
              height: labelBox.height,
              text: label?.textContent?.trim() || "",
              width: labelBox.width
            }
          : null,
        overflowY: Math.max(0, card.scrollHeight - card.clientHeight),
        text: card.textContent.trim().replace(/\s+/g, " "),
        trend: trendBox
          ? {
              height: trendBox.height,
              width: trendBox.width
            }
          : null,
        value: valueBox
          ? {
              fontSize: Number.parseFloat(valueStyle?.fontSize) || 0,
              height: valueBox.height,
              text: value?.textContent?.trim() || "",
              width: valueBox.width
            }
          : null,
        width: box.width
      };
    });
    const portalHeroSameRow = Boolean(
      portalHeroArt
        && portalMenuPanel
        && portalMenuPanel.left > portalHeroArt.right
        && Math.abs(portalHeroArt.top - portalMenuPanel.top) <= 2
    );

    return {
      bodyTextLength: (document.body.innerText || "").trim().length,
      bodyScrollWidth: document.body.scrollWidth,
      bodyBackground: {
        image: bodyBackgroundStyle.backgroundImage,
        layerPosition: bodyBackgroundStyle.position,
        position: bodyBackgroundStyle.backgroundPosition,
        size: bodyBackgroundStyle.backgroundSize,
        source: hasFixedBackgroundArt ? "body::before" : "body"
      },
      docClientWidth: document.documentElement.clientWidth,
      drawerTransform: sideRail ? getComputedStyle(sideRail).transform : "",
      brand: {
        copy: brandCopyBox
          ? {
              display: brandCopyStyle?.display || "",
              height: brandCopyBox.height,
              opacity: Number.parseFloat(brandCopyStyle?.opacity) || 0,
              visibility: brandCopyStyle?.visibility || "",
              visible: brandCopyStyle?.display !== "none"
                && brandCopyStyle?.visibility !== "hidden"
                && Number.parseFloat(brandCopyStyle?.opacity) > 0.05
                && brandCopyBox.width > 4
                && brandCopyBox.height > 4,
              width: brandCopyBox.width
            }
          : null,
        mark: brandMarkBox
          ? {
              bottom: brandMarkBox.bottom,
              height: brandMarkBox.height,
              left: brandMarkBox.left,
              right: brandMarkBox.right,
              top: brandMarkBox.top,
              width: brandMarkBox.width
            }
          : null
      },
      nav,
      pageCrumb: rect(".page-crumb"),
      portalHero: {
        art: portalHeroArt,
        bottomDelta: portalHeroSameRow ? Math.abs(portalMenuPanel.bottom - portalHeroArt.bottom) : null,
        dots: portalHeroDots,
        dotButtons: portalHeroDotButtons,
        dotsVisualArea: portalHeroDotsVisualArea,
        heightDelta: portalHeroSameRow ? Math.abs(portalMenuPanel.height - portalHeroArt.height) : null,
        imageObjectFit: portalHeroImageStyle?.objectFit || "",
        kpiCards: safetyKpiCards,
        linkCards: portalLinkCards,
        maxKpiOverflowY: safetyKpiCards.reduce((max, card) => Math.max(max, card.overflowY), 0),
        maxCardOverflowY: portalLinkCards.reduce((max, card) => Math.max(max, card.overflowY), 0),
        menuPanel: portalMenuPanel,
        sameRow: portalHeroSameRow,
        systemHeader: systemHeader
          ? {
              box: elementRect(systemHeader),
              childClasses: [...systemHeader.children].map((child) => child.className || child.tagName.toLowerCase()),
              childCount: systemHeader.children.length,
              hasTicker: Boolean(systemHeader.querySelector(".system-feed-ticker")),
              text: systemHeader.textContent.trim(),
              viewAll: systemViewAll ? elementRect(systemViewAll) : null
            }
          : null
      },
      sideRail: rect(".side-rail"),
      sideRailContentMaxRight,
      sideRailOverflowX: sideRailStyle?.overflowX || "",
      sidebarToggle: rect(".sidebar-toggle"),
      siteCredit: siteCredit
        ? {
            ariaLabel: siteCredit.getAttribute("aria-label") || "",
            box: elementRect(siteCredit),
            color: siteCreditStyle?.color || "",
            fontSize: siteCreditStyle?.fontSize || "",
            fontWeight: siteCreditStyle?.fontWeight || "",
            text: siteCredit.textContent.trim().replace(/\s+/g, " ")
          }
        : null,
      topbar: rect(".topbar"),
      topbarActions: rect(".topbar-action-cluster"),
      topbarAuth: topbarAuth
        ? {
            box: elementRect(topbarAuth),
            gap: topbarAuthStyle?.gap || "",
            icon: topbarAuthIconBox
              ? {
                  height: topbarAuthIconBox.height,
                  width: topbarAuthIconBox.width
                }
              : null,
            text: topbarAuth.textContent.trim().replace(/\s+/g, " "),
            textSpan: topbarAuthTextBox
              ? {
                  className: topbarAuthText.className || "",
                  display: topbarAuthTextStyle?.display || "",
                  fontSize: Number.parseFloat(topbarAuthTextStyle?.fontSize) || 0,
                  height: topbarAuthTextBox.height,
                  opacity: Number.parseFloat(topbarAuthTextStyle?.opacity) || 0,
                  visible: topbarAuthTextStyle?.display !== "none"
                    && topbarAuthTextStyle?.visibility !== "hidden"
                    && topbarAuthTextBox.width > 12
                    && topbarAuthTextBox.height > 8,
                  width: topbarAuthTextBox.width
                }
              : null
          }
        : null,
      topbarBackgroundColor: topbarStyle?.backgroundColor || "",
      topbarBefore: topbarBefore
        ? {
            content: topbarBefore.content,
            height: topbarBefore.height,
            left: topbarBefore.left,
            top: topbarBefore.top,
            width: topbarBefore.width
          }
        : null,
      theme: document.documentElement.dataset.theme,
      viewport: {
        devicePixelRatio: window.devicePixelRatio,
        height: window.innerHeight,
        width: window.innerWidth
      },
      resourceUrls: performance.getEntriesByType("resource").map((entry) => entry.name)
    };
  });
}

function shellChecks(testCase, metrics, consoleErrors, screenshot) {
  const checks = [];
  const blockingConsoleErrors = consoleErrors.filter((message) => !isLocalRateLimitConsoleMessage(message));
  const actionInside = metrics.topbarActions
    && metrics.topbarActions.left >= 0
    && metrics.topbarActions.right <= testCase.width + 1;
  const horizontalOverflow = metrics.bodyScrollWidth > metrics.docClientWidth + 1;
  const backgroundLuminance = luminanceFromRgb(metrics.topbarBackgroundColor);

  checks.push(check("theme-applied", metrics.theme === testCase.theme, {
    actual: metrics.theme,
    expected: testCase.theme
  }));
  checks.push(check("home-not-blank", metrics.bodyTextLength > 200, {
    bodyTextLength: metrics.bodyTextLength
  }));
  checks.push(check("no-horizontal-overflow", !horizontalOverflow, {
    bodyScrollWidth: metrics.bodyScrollWidth,
    docClientWidth: metrics.docClientWidth
  }));
  checks.push(check("topbar-visible", Boolean(metrics.topbar && metrics.topbar.height >= 56), {
    topbar: metrics.topbar
  }));
  checks.push(check("topbar-actions-inside-viewport", actionInside, {
    actions: metrics.topbarActions,
    viewportWidth: testCase.width
  }));
  const authIconVisible = Boolean(metrics.topbarAuth?.icon?.width >= 14 && metrics.topbarAuth?.icon?.height >= 14);
  checks.push(check("topbar-auth-icon-visible", authIconVisible, {
    auth: metrics.topbarAuth
  }));
  if (testCase.width >= 1024) {
    checks.push(check("topbar-auth-label-visible-on-desktop", Boolean(
      metrics.topbarAuth?.text
        && metrics.topbarAuth.textSpan?.visible
        && metrics.topbarAuth.textSpan.width >= 42
        && metrics.topbarAuth.box?.width >= 82
    ), {
      auth: metrics.topbarAuth
    }));
  }
  if (testCase.width <= 900) {
    checks.push(check("topbar-auth-icon-only-on-mobile", Boolean(
      authIconVisible
        && metrics.topbarAuth?.box?.width <= 38
        && (!metrics.topbarAuth.textSpan || !metrics.topbarAuth.textSpan.visible)
    ), {
      auth: metrics.topbarAuth
    }));
  }
  checks.push(check("site-credit-readable-and-attributed", Boolean(
    metrics.siteCredit
      && metrics.siteCredit.text.includes("Nguyễn Văn Thắng - PE1")
      && metrics.siteCredit.ariaLabel.includes("Nguyễn Văn Thắng - PE1")
      && !/bởiNguyễn|byNguyen|bởiNguyen|byNguyễn/.test(metrics.siteCredit.text)
      && metrics.siteCredit.box?.height >= 36
      && metrics.siteCredit.box?.width <= Math.max(360, testCase.width - 24)
  ), {
    siteCredit: metrics.siteCredit
  }));
  checks.push(check("console-clean", blockingConsoleErrors.length === 0, {
    consoleErrors: blockingConsoleErrors,
    ignoredRateLimitConsoleErrors: consoleErrors.filter(isLocalRateLimitConsoleMessage)
  }));
  checks.push(check("screenshot-written", fs.existsSync(screenshot), { screenshot }));
  checks.push(check("hero-slogan-image-not-cropped", metrics.portalHero?.imageObjectFit === "contain", {
    objectFit: metrics.portalHero?.imageObjectFit
  }));
  const heroDots = metrics.portalHero?.dots;
  const heroArt = metrics.portalHero?.art;
  const heroDotsVisibleAreaRatio = heroArt
    ? (metrics.portalHero?.dotsVisualArea || 0) / Math.max(1, heroArt.width * heroArt.height)
    : null;
  const heroDotsVisible = Boolean(heroDots && heroDots.width > 0 && heroDots.height > 0);
  const heroIndicatorSubtle = testCase.width <= 760
    ? !heroDotsVisible
    : Boolean(
        heroDotsVisible
          && heroArt
          && heroDots.height <= 28
          && heroDots.width <= Math.max(88, heroArt.width * 0.12)
          && heroDotsVisibleAreaRatio !== null
          && heroDotsVisibleAreaRatio <= 0.001
      );
  checks.push(check("hero-carousel-indicator-stays-subtle", heroIndicatorSubtle, {
    art: heroArt,
    dots: heroDots,
    dotButtons: metrics.portalHero?.dotButtons,
    visibleAreaRatio: heroDotsVisibleAreaRatio,
    mobileContract: testCase.width <= 760 ? "hidden so it does not cover the slogan art" : "small visible dots with accessible hit targets"
  }));
  const systemHeader = metrics.portalHero?.systemHeader;
  const systemHeaderCompact = Boolean(
    systemHeader
      && systemHeader.childCount === 2
      && !systemHeader.hasTicker
      && systemHeader.viewAll
  );
  checks.push(check("system-header-is-compact", systemHeaderCompact, {
    systemHeader
  }));

  const expectsDesktopHeroRow = testCase.width > 1320 && Boolean(metrics.portalHero?.art && metrics.portalHero?.menuPanel);
  checks.push(check("hero-image-and-links-same-row-on-desktop", !expectsDesktopHeroRow || metrics.portalHero?.sameRow, {
    art: metrics.portalHero?.art,
    expectsDesktopHeroRow,
    menuPanel: metrics.portalHero?.menuPanel,
    sameRow: metrics.portalHero?.sameRow
  }));

  if (testCase.theme === "light") {
    const backgroundLayerSize = String(metrics.bodyBackground?.size || "").split(",").map((item) => item.trim()).at(-1) || "";
    const backgroundLayerWidth = Number((backgroundLayerSize.match(/([\d.]+)px/) || [])[1] || 0);
    const backgroundImages = metrics.resourceUrls.filter((url) => url.includes("/images/light-mode-background"));
    const uses4kBackground = backgroundImages.some((url) => url.includes("light-mode-background-4k.webp"));
    const usesMobileBackground = backgroundImages.some((url) => url.includes("light-mode-background-mobile.webp"));
    const usesLegacyBackground = backgroundImages.some((url) => url.includes("light-mode-background-1600.webp"));
    const expectedBackground = testCase.width <= 760 ? "mobile-webp" : "stable-4k-webp";
    const usesExpectedBackground = testCase.width <= 760
      ? usesMobileBackground && !uses4kBackground && !usesLegacyBackground
      : uses4kBackground && !usesMobileBackground && !usesLegacyBackground;
    checks.push(check("light-background-image-layer-not-cover-cropped", backgroundLayerSize !== "cover", {
      backgroundSize: metrics.bodyBackground?.size,
      imageLayerSize: backgroundLayerSize
    }));
    checks.push(check("light-background-width-follows-viewport", Math.abs(backgroundLayerWidth - testCase.width) <= 2, {
      browserZoomContract: "viewport-width background keeps the art visually stable while browser zoom scales text/layout",
      backgroundLayerWidth,
      imageLayerSize: backgroundLayerSize,
      viewportWidth: testCase.width
    }));
    checks.push(check("light-background-uses-fixed-art-layer", metrics.bodyBackground?.source === "body::before" && metrics.bodyBackground?.layerPosition === "fixed", {
      bodyBackground: metrics.bodyBackground
    }));
    checks.push(check("light-background-uses-expected-webp", usesExpectedBackground, {
      devicePixelRatio: metrics.viewport?.devicePixelRatio,
      backgroundImages,
      expected: expectedBackground,
      viewportWidth: testCase.width
    }));
  }

  if (testCase.width <= 760) {
    const linkCards = metrics.portalHero?.linkCards || [];
    const kpiCards = metrics.portalHero?.kpiCards || [];
    if (linkCards.length) {
      checks.push(check("mobile-hero-link-cards-compact-readable", linkCards.length >= 6 && linkCards.every((card) => (
        card.height >= 84
          && card.height <= 112
          && card.utilityIcon?.height <= 34
          && card.utilityIcon?.width <= 34
          && card.title?.fontSize >= 12
          && card.title?.fontSize <= 13
          && card.title?.fontWeight <= 740
          && card.target?.fontSize > 0
          && card.target?.fontSize <= 10
          && card.launchLabel?.width >= 28
          && card.launchLabel?.width <= 34
          && card.launchLabel?.iconWidth >= 13
          && !card.launchLabel?.textVisible
      )), {
        linkCards: linkCards.map((card) => ({
          height: card.height,
          launchLabel: card.launchLabel,
          target: card.target,
          text: card.text,
          title: card.title,
          utilityIcon: card.utilityIcon,
          width: card.width
        }))
      }));
    } else {
      checks.push(check("mobile-hero-safety-kpis-compact-readable", kpiCards.length === 4 && kpiCards.every((card) => (
        card.height >= 90
          && card.height <= 132
          && card.icon?.height <= 34
          && card.icon?.width <= 34
          && card.value?.fontSize >= 20
          && card.value?.fontSize <= 25
          && card.label?.fontSize >= 10
          && card.label?.fontSize <= 12.8
          && card.detail?.fontSize >= 9
          && card.detail?.fontSize <= 11
      )), {
        kpiCards: kpiCards.map((card) => ({
          detail: card.detail,
          height: card.height,
          icon: card.icon,
          label: card.label,
          text: card.text,
          value: card.value,
          width: card.width
        }))
      }));
    }
  }

  if (metrics.portalHero?.sameRow) {
    checks.push(check("hero-image-and-links-bottom-aligned", metrics.portalHero.bottomDelta <= 3 && metrics.portalHero.heightDelta <= 3, {
      art: metrics.portalHero.art,
      bottomDelta: metrics.portalHero.bottomDelta,
      heightDelta: metrics.portalHero.heightDelta,
      menuPanel: metrics.portalHero.menuPanel
    }));
    const linkCards = metrics.portalHero.linkCards || [];
    const kpiCards = metrics.portalHero.kpiCards || [];
    if (linkCards.length) {
      checks.push(check("hero-link-cards-do-not-overflow", metrics.portalHero.maxCardOverflowY <= 1, {
        linkCards: metrics.portalHero.linkCards,
        maxCardOverflowY: metrics.portalHero.maxCardOverflowY
      }));
      const cardHeights = linkCards.map((card) => card.height).filter(Number.isFinite);
      const minCardHeight = Math.min(...cardHeights);
      const maxCardHeight = Math.max(...cardHeights);
      const cardHeightSpread = maxCardHeight - minCardHeight;
      checks.push(check("hero-link-cards-balanced-density", linkCards.length >= 6 && minCardHeight >= 92 && maxCardHeight <= 150 && cardHeightSpread <= 2, {
        cardHeights,
        cardHeightSpread,
        linkCards: linkCards.map((card) => ({ text: card.text, height: card.height, width: card.width }))
      }));
      checks.push(check("hero-link-icons-centered-inside-buttons", linkCards.every((card) => card.iconCenterDelta && card.iconCenterDelta.dx <= 1.5 && card.iconCenterDelta.dy <= 1.5), {
        linkCards: linkCards.map((card) => ({ text: card.text, iconCenterDelta: card.iconCenterDelta }))
      }));
      checks.push(check("hero-link-accent-corners-stay-small", linkCards.every((card) => card.accentCorner?.width <= 32 && card.accentCorner?.height <= 14), {
        linkCards: linkCards.map((card) => ({ text: card.text, accentCorner: card.accentCorner }))
      }));
      checks.push(check("hero-launch-buttons-compact-and-readable", linkCards.every((card) => (
        card.launchLabel
          && card.launchLabel.height >= 26
          && card.launchLabel.height <= 34
          && card.launchLabel.width >= 52
          && card.launchLabel.width <= 82
          && card.launchLabel.iconWidth >= 14
          && card.launchLabel.textVisible
          && card.launchLabel.text.length > 0
      )), {
        linkCards: linkCards.map((card) => ({ text: card.text, launchLabel: card.launchLabel }))
      }));
    } else {
      checks.push(check("hero-safety-kpi-cards-do-not-overflow", metrics.portalHero.maxKpiOverflowY <= 1, {
        kpiCards,
        maxKpiOverflowY: metrics.portalHero.maxKpiOverflowY
      }));
      const cardHeights = kpiCards.map((card) => card.height).filter(Number.isFinite);
      const minCardHeight = Math.min(...cardHeights);
      const maxCardHeight = Math.max(...cardHeights);
      const cardHeightSpread = maxCardHeight - minCardHeight;
      checks.push(check("hero-safety-kpi-cards-balanced-density", kpiCards.length === 4 && minCardHeight >= 96 && maxCardHeight <= 220 && cardHeightSpread <= 2, {
        cardHeights,
        cardHeightSpread,
        kpiCards: kpiCards.map((card) => ({ text: card.text, height: card.height, width: card.width }))
      }));
      checks.push(check("hero-safety-kpi-icons-readable", kpiCards.every((card) => (
        card.icon?.height >= 28
          && card.icon?.height <= 44
          && card.icon?.width >= 28
          && card.icon?.width <= 44
      )), {
        kpiCards: kpiCards.map((card) => ({ text: card.text, icon: card.icon }))
      }));
    }
  }

  if (testCase.theme === "dark") {
    checks.push(check("dark-topbar-background-is-dark", backgroundLuminance !== null && backgroundLuminance < 50, {
      backgroundColor: metrics.topbarBackgroundColor,
      luminance: backgroundLuminance
    }));
  }

  if (testCase.shell === "full") {
    const textVisible = metrics.nav.every((item) => item.text.length > 0 && item.box.width > 180 && item.label?.visible);
    checks.push(check("full-sidebar-wide", metrics.sideRail?.width >= 240, {
      sideRail: metrics.sideRail
    }));
    checks.push(check("full-sidebar-nav-labels-visible", textVisible, {
      nav: metrics.nav.map((item) => ({ label: item.label, text: item.text, width: item.box.width }))
    }));
  }

  if (testCase.shell === "collapsed") {
    const centered = metrics.nav.every((item) => item.dx !== null && item.dx <= 2.5 && item.dy <= 2.5);
    const compactBoxes = metrics.nav.every((item) => item.box.width >= 46 && item.box.width <= 52 && item.box.height >= 46 && item.box.height <= 52);
    const labelsHidden = metrics.nav.every((item) => item.label && !item.label.visible);
    const brandMark = metrics.brand?.mark;
    const brandMarkCentered = Boolean(
      metrics.sideRail
        && brandMark
        && Math.abs((brandMark.left + brandMark.width / 2) - (metrics.sideRail.left + metrics.sideRail.width / 2)) <= 2.5
        && brandMark.width >= 46
        && brandMark.width <= 52
        && brandMark.height >= 46
        && brandMark.height <= 52
    );
    const brandCopyHidden = Boolean(metrics.brand?.copy && !metrics.brand.copy.visible);
    const noSidebarBleed = Boolean(
      metrics.sideRail
        && Number.isFinite(metrics.sideRailContentMaxRight)
        && metrics.sideRailContentMaxRight <= metrics.sideRail.right + 1
        && metrics.sideRailOverflowX === "hidden"
    );
    checks.push(check("collapsed-sidebar-width", metrics.sideRail?.width >= 70 && metrics.sideRail?.width <= 90, {
      sideRail: metrics.sideRail
    }));
    checks.push(check("collapsed-sidebar-brand-mark-centered", brandMarkCentered, {
      brand: metrics.brand,
      sideRail: metrics.sideRail
    }));
    checks.push(check("collapsed-sidebar-text-hidden", labelsHidden && brandCopyHidden, {
      brand: metrics.brand,
      nav: metrics.nav.map((item) => ({ label: item.label, text: item.text }))
    }));
    checks.push(check("collapsed-sidebar-content-does-not-bleed", noSidebarBleed, {
      sideRail: metrics.sideRail,
      sideRailContentMaxRight: metrics.sideRailContentMaxRight,
      sideRailOverflowX: metrics.sideRailOverflowX
    }));
    checks.push(check("collapsed-sidebar-icons-centered", centered, {
      nav: metrics.nav.map((item) => ({ text: item.text, dx: item.dx, dy: item.dy }))
    }));
    checks.push(check("collapsed-sidebar-nav-touch-targets", compactBoxes, {
      nav: metrics.nav.map((item) => ({ text: item.text, box: item.box }))
    }));
  }

  if (testCase.shell === "drawer") {
    checks.push(check("drawer-hidden-before-open", metrics.drawerTransform !== "none" && metrics.sideRail?.left < 0, {
      transform: metrics.drawerTransform,
      sideRail: metrics.sideRail
    }));
    checks.push(check("menu-button-visible", Boolean(metrics.sidebarToggle && metrics.sidebarToggle.width >= 34), {
      sidebarToggle: metrics.sidebarToggle
    }));
  }

  return checks;
}

function openedDrawerChecks(testCase, metrics, screenshot) {
  if (testCase.shell !== "drawer") return [];

  const navLabelsVisible = metrics.nav.every((item) => item.text.length > 0 && item.box.width > 180 && item.label?.visible);
  return [
    check("drawer-opens-from-menu-button", metrics.sideRail?.left >= -1 && metrics.sideRail?.width >= 280, {
      sideRail: metrics.sideRail
    }),
    check("drawer-nav-labels-visible", navLabelsVisible, {
      nav: metrics.nav.map((item) => ({ label: item.label, text: item.text, box: item.box }))
    }),
    check("drawer-screenshot-written", fs.existsSync(screenshot), { screenshot })
  ];
}

const roundMetric = (value) => (
  Number.isFinite(value) ? Math.round(value * 10) / 10 : value
);

const compactRect = (rect) => {
  if (!rect) return null;
  return {
    bottom: roundMetric(rect.bottom),
    height: roundMetric(rect.height),
    left: roundMetric(rect.left),
    right: roundMetric(rect.right),
    top: roundMetric(rect.top),
    width: roundMetric(rect.width)
  };
};

const compactShellMetrics = (metrics) => {
  if (!metrics) return null;

  return {
    bodyScrollWidth: roundMetric(metrics.bodyScrollWidth),
    docClientWidth: roundMetric(metrics.docClientWidth),
    nav: (metrics.nav || []).map((item) => ({
      active: item.active,
      box: compactRect(item.box),
      dx: roundMetric(item.dx),
      dy: roundMetric(item.dy),
      icon: compactRect(item.icon),
      label: item.label
        ? {
            display: item.label.display,
            height: roundMetric(item.label.height),
            opacity: roundMetric(item.label.opacity),
            visibility: item.label.visibility,
            visible: item.label.visible,
            width: roundMetric(item.label.width)
          }
        : null,
      text: item.text
    })),
    pageCrumb: compactRect(metrics.pageCrumb),
    portalHero: {
      art: compactRect(metrics.portalHero?.art),
      bottomDelta: roundMetric(metrics.portalHero?.bottomDelta),
      heightDelta: roundMetric(metrics.portalHero?.heightDelta),
      imageObjectFit: metrics.portalHero?.imageObjectFit || "",
      kpiCards: (metrics.portalHero?.kpiCards || []).map((card) => ({
        detail: card.detail
          ? {
              fontSize: roundMetric(card.detail.fontSize),
              height: roundMetric(card.detail.height),
              text: card.detail.text,
              width: roundMetric(card.detail.width)
            }
          : null,
        height: roundMetric(card.height),
        icon: compactRect(card.icon),
        label: card.label
          ? {
              fontSize: roundMetric(card.label.fontSize),
              height: roundMetric(card.label.height),
              text: card.label.text,
              width: roundMetric(card.label.width)
            }
          : null,
        overflowY: roundMetric(card.overflowY),
        text: card.text,
        trend: compactRect(card.trend),
        value: card.value
          ? {
              fontSize: roundMetric(card.value.fontSize),
              height: roundMetric(card.value.height),
              text: card.value.text,
              width: roundMetric(card.value.width)
            }
          : null,
        width: roundMetric(card.width)
      })),
      linkCards: (metrics.portalHero?.linkCards || []).map((card) => ({
        accentCorner: card.accentCorner,
        height: roundMetric(card.height),
        iconCenterDelta: card.iconCenterDelta
          ? {
              dx: roundMetric(card.iconCenterDelta.dx),
              dy: roundMetric(card.iconCenterDelta.dy)
            }
          : null,
        launchLabel: card.launchLabel
          ? {
              height: roundMetric(card.launchLabel.height),
              iconHeight: roundMetric(card.launchLabel.iconHeight),
              iconWidth: roundMetric(card.launchLabel.iconWidth),
              text: card.launchLabel.text,
              textVisible: card.launchLabel.textVisible,
              width: roundMetric(card.launchLabel.width)
            }
          : null,
        overflowY: roundMetric(card.overflowY),
        statusChipCount: card.statusChipCount,
        target: card.target
          ? {
              fontSize: roundMetric(card.target.fontSize),
              fontWeight: roundMetric(card.target.fontWeight),
              height: roundMetric(card.target.height),
              text: card.target.text,
              width: roundMetric(card.target.width)
            }
          : null,
        text: card.text,
        title: card.title
          ? {
              fontSize: roundMetric(card.title.fontSize),
              fontWeight: roundMetric(card.title.fontWeight),
              height: roundMetric(card.title.height),
              lineHeight: roundMetric(card.title.lineHeight),
              width: roundMetric(card.title.width)
            }
          : null,
        utilityIcon: card.utilityIcon
          ? {
              height: roundMetric(card.utilityIcon.height),
              width: roundMetric(card.utilityIcon.width)
            }
          : null,
        width: roundMetric(card.width)
      })),
      maxCardOverflowY: roundMetric(metrics.portalHero?.maxCardOverflowY),
      maxKpiOverflowY: roundMetric(metrics.portalHero?.maxKpiOverflowY),
      menuPanel: compactRect(metrics.portalHero?.menuPanel),
      sameRow: Boolean(metrics.portalHero?.sameRow),
      systemHeader: metrics.portalHero?.systemHeader
        ? {
            box: compactRect(metrics.portalHero.systemHeader.box),
            childClasses: metrics.portalHero.systemHeader.childClasses,
            childCount: metrics.portalHero.systemHeader.childCount,
            hasTicker: metrics.portalHero.systemHeader.hasTicker,
            text: metrics.portalHero.systemHeader.text,
            viewAll: compactRect(metrics.portalHero.systemHeader.viewAll)
          }
        : null
    },
    brand: metrics.brand
      ? {
          copy: metrics.brand.copy
            ? {
                display: metrics.brand.copy.display,
                height: roundMetric(metrics.brand.copy.height),
                opacity: roundMetric(metrics.brand.copy.opacity),
                visibility: metrics.brand.copy.visibility,
                visible: metrics.brand.copy.visible,
                width: roundMetric(metrics.brand.copy.width)
              }
            : null,
          mark: compactRect(metrics.brand.mark)
        }
      : null,
    sideRail: compactRect(metrics.sideRail),
    sideRailContentMaxRight: roundMetric(metrics.sideRailContentMaxRight),
    sideRailOverflowX: metrics.sideRailOverflowX,
    sidebarToggle: compactRect(metrics.sidebarToggle),
    siteCredit: metrics.siteCredit
      ? {
          ariaLabel: metrics.siteCredit.ariaLabel,
          box: compactRect(metrics.siteCredit.box),
          color: metrics.siteCredit.color,
          fontSize: metrics.siteCredit.fontSize,
          fontWeight: metrics.siteCredit.fontWeight,
          text: metrics.siteCredit.text
        }
      : null,
    theme: metrics.theme,
    topbar: compactRect(metrics.topbar),
    topbarActions: compactRect(metrics.topbarActions),
    topbarAuth: metrics.topbarAuth
      ? {
          box: compactRect(metrics.topbarAuth.box),
          gap: metrics.topbarAuth.gap,
          icon: compactRect(metrics.topbarAuth.icon),
          text: metrics.topbarAuth.text,
          textSpan: metrics.topbarAuth.textSpan
            ? {
                className: metrics.topbarAuth.textSpan.className,
                display: metrics.topbarAuth.textSpan.display,
                fontSize: roundMetric(metrics.topbarAuth.textSpan.fontSize),
                height: roundMetric(metrics.topbarAuth.textSpan.height),
                opacity: roundMetric(metrics.topbarAuth.textSpan.opacity),
                visible: metrics.topbarAuth.textSpan.visible,
                width: roundMetric(metrics.topbarAuth.textSpan.width)
              }
            : null
        }
      : null,
    topbarBackgroundColor: metrics.topbarBackgroundColor,
    viewport: metrics.viewport
  };
};

ensureDir(reportsDir);
ensureDir(screenshotDir);

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const testCase of viewports) {
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
      localStorage.setItem("hub-theme-default-version", "light-default-v1");
      localStorage.setItem("hub-theme", theme);
    }, { theme: testCase.theme });

    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 25000 });
    const screenshot = path.resolve(screenshotDir, `app-shell-${testCase.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    const metrics = await collectShellMetrics(page);
    const checks = shellChecks(testCase, metrics, consoleErrors, screenshot);

    let drawerScreenshot = "";
    let drawerMetrics = null;
    if (testCase.shell === "drawer") {
      await page.locator(".sidebar-toggle").click();
      await page.locator(".app-shell.sidebar-open .side-rail").waitFor({ state: "visible", timeout: 8000 });
      await page.waitForFunction(() => {
        const sideRail = document.querySelector(".side-rail");
        if (!sideRail) return false;
        return sideRail.getBoundingClientRect().left >= -1;
      }, null, { timeout: 8000 });
      drawerScreenshot = path.resolve(screenshotDir, `app-shell-${testCase.name}-drawer-open.png`);
      await page.screenshot({ path: drawerScreenshot, fullPage: false });
      drawerMetrics = await collectShellMetrics(page);
      checks.push(...openedDrawerChecks(testCase, drawerMetrics, drawerScreenshot));
    }

    results.push({
      checks,
      drawerMetrics,
      drawerScreenshot,
      metrics,
      name: testCase.name,
      screenshot,
      shell: testCase.shell,
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
      viewport: result.name
    }))
);
const allChecks = results.flatMap((result) => result.checks);
const summary = {
  failed: failedChecks.length,
  passed: allChecks.filter((item) => item.pass).length,
  total: allChecks.length
};

const payload = {
  ok: failedChecks.length === 0,
  baseUrl,
  failedChecks,
  generatedAtUtc: new Date().toISOString(),
  summary,
  results: results.map((result) => ({
    checks: result.checks,
    drawerMetrics: compactShellMetrics(result.drawerMetrics),
    drawerScreenshot: result.drawerScreenshot,
    metrics: compactShellMetrics(result.metrics),
    name: result.name,
    screenshot: result.screenshot,
    shell: result.shell,
    size: result.size,
    theme: result.theme
  }))
};

fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  failedChecks,
  ok: payload.ok,
  reportPath,
  summary,
  viewports: results.map((result) => ({
    checks: result.checks.length,
    failedChecks: result.checks.filter((item) => !item.pass).length,
    name: result.name,
    screenshot: result.screenshot,
    shell: result.shell,
    size: result.size,
    theme: result.theme
  }))
}, null, 2));

if (!payload.ok) {
  process.exit(1);
}
