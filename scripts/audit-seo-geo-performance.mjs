import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const defaultRoutes = [
  "/",
  "/safety-6s",
  "/safety-6s/departments/warehouse",
  "/documents"
];

const readArg = (name, fallback) => {
  const index = process.argv.lastIndexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
};

const url = readArg("--url", "http://127.0.0.1:3333/");
const canonicalizeBrowserBaseUrl = (value) => {
  try {
    const parsed = new URL(value);
    if (parsed.hostname === "127.0.0.1" || parsed.hostname === "::1" || parsed.hostname === "[::1]") {
      parsed.hostname = "localhost";
    }
    return parsed.toString();
  } catch {
    return value;
  }
};
const browserUrl = canonicalizeBrowserBaseUrl(url);
const routes = readArg("--routes", defaultRoutes.join(","))
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = readArg("--out", path.join("Seo", `SEO_GEO_LOCAL_AUDIT_${timestamp}.json`));

const toAbsolute = (baseUrl, routeOrUrl) => new URL(routeOrUrl, baseUrl).toString();

const score = (checks) => {
  const passed = checks.filter((check) => check.pass).length;
  return Math.round((passed / Math.max(1, checks.length)) * 100);
};

const textWordCount = (text) => String(text || "").trim().split(/\s+/).filter(Boolean).length;

const responseStatus = async (targetUrl) => {
  try {
    const response = await fetch(targetUrl, { redirect: "manual" });
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      cacheControl: response.headers.get("cache-control") || "",
      bytes: Number(response.headers.get("content-length") || 0)
    };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
};

const check = (name, pass, evidence = null, weight = 1) => ({ name, pass: Boolean(pass), evidence, weight });

async function collectPageAudit(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    isMobile: true,
    viewport: { width: 390, height: 844 }
  });

  await context.addInitScript(() => {
    localStorage.setItem("hub-lang", "vi");
    localStorage.setItem("hub-theme-default-version", "light-default-v1");
    localStorage.setItem("hub-theme", "light");
  });

  const page = await context.newPage();
  const consoleMessages = [];
  const resourceResponses = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push({ type: message.type(), text: message.text() });
    }
  });
  page.on("pageerror", (error) => {
    consoleMessages.push({ type: "pageerror", text: error.message });
  });
  page.on("response", (response) => {
    const request = response.request();
    const requestUrl = response.url();
    if (requestUrl.includes("/images/") || requestUrl.includes("/assets/") || requestUrl.endsWith("/theme-init.js")) {
      resourceResponses.push({
        url: requestUrl,
        status: response.status(),
        type: request.resourceType()
      });
    }
  });

  const mainResponse = await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 20000 });
  const mainHeaders = mainResponse ? await mainResponse.allHeaders() : {};

  const dom = await page.evaluate(() => {
    const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content || "";
    const prop = (name) => document.querySelector(`meta[property="${name}"]`)?.content || "";
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((el) => ({
      level: Number(el.tagName.slice(1)),
      id: el.id || "",
      text: el.textContent?.trim() || ""
    }));
    const hierarchySkips = [];
    for (let index = 1; index < headings.length; index += 1) {
      if (headings[index].level - headings[index - 1].level > 1) {
        hierarchySkips.push(`H${headings[index - 1].level} -> H${headings[index].level}`);
      }
    }
    const schemaBlocks = [...document.querySelectorAll('script[type="application/ld+json"]')].map((node) => {
      try {
        const parsed = JSON.parse(node.textContent || "{}");
        const graph = Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
        return {
          valid: true,
          types: graph.map((entry) => entry["@type"]).filter(Boolean),
          hasSearchAction: graph.some((entry) => Boolean(entry.potentialAction))
        };
      } catch (error) {
        return { valid: false, error: error.message, types: [] };
      }
    });
    const links = [...document.querySelectorAll("a")].map((link) => ({
      href: link.href,
      text: link.innerText.trim(),
      ariaLabel: link.getAttribute("aria-label") || "",
      rel: link.getAttribute("rel") || ""
    }));
    const images = [...document.images].map((img) => ({
      src: img.currentSrc || img.src,
      alt: img.alt || "",
      loading: img.loading || "",
      width: img.naturalWidth,
      height: img.naturalHeight,
      displayWidth: Math.round(img.getBoundingClientRect().width),
      displayHeight: Math.round(img.getBoundingClientRect().height)
    }));
    const resources = performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      transferSize: entry.transferSize || 0,
      encodedBodySize: entry.encodedBodySize || 0
    }));
    const semanticTags = {};
    ["main", "nav", "header", "footer", "section", "article", "aside", "figure", "address", "time"].forEach((tag) => {
      semanticTags[tag] = document.querySelectorAll(tag).length;
    });
    const bodyText = document.body.innerText || "";
    const questions = [...document.querySelectorAll("summary,h2,h3,p,li")]
      .filter((el) => (el.textContent || "").trim().endsWith("?"))
      .length;
    const stats = (bodyText.match(/\b\d+(?:[.,]\d+)?\s?(?:%|ms|KB|MB|GB|s|file|route|link)\b/gi) || []).length;
    const aboveFoldElements = [...document.querySelectorAll("a,button")].filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.top < window.innerHeight && rect.width > 0 && rect.height > 0;
    });
    const normalizedText = (value) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\u0111/g, "d")
        .replace(/\u0110/g, "D")
        .toLowerCase()
        .trim();
    const ctaTerms = ["mo", "xem", "dang nhap", "tai", "open", "view", "login", "download"];
    const genericLinkTexts = new Set(["mo", "xem", "view", "open", "click here"]);
    const isCallToAction = (value) => {
      const text = normalizedText(value);
      return ctaTerms.some((term) => text.includes(term));
    };

    return {
      title: document.title,
      titleLength: document.title.length,
      description: meta("description"),
      descriptionLength: meta("description").length,
      robots: meta("robots"),
      author: meta("author"),
      referrer: meta("referrer"),
      themeColor: meta("theme-color"),
      canonical: document.querySelector('link[rel="canonical"]')?.href || "",
      favicon: document.querySelector('link[rel="icon"]')?.href || "",
      manifest: document.querySelector('link[rel="manifest"]')?.href || "",
      preloadImages: [...document.querySelectorAll('link[rel="preload"][as="image"]')].map((link) => ({
        href: link.getAttribute("href"),
        imagesrcset: link.getAttribute("imagesrcset"),
        imagesizes: link.getAttribute("imagesizes"),
        fetchpriority: link.getAttribute("fetchpriority")
      })),
      themeInitScript: {
        exists: Boolean(document.querySelector('script[src="/theme-init.js"]')),
        defer: Boolean(document.querySelector('script[src="/theme-init.js"][defer]')),
        async: Boolean(document.querySelector('script[src="/theme-init.js"][async]'))
      },
      og: {
        title: prop("og:title"),
        description: prop("og:description"),
        image: prop("og:image"),
        url: prop("og:url"),
        type: prop("og:type")
      },
      twitter: {
        card: meta("twitter:card"),
        title: meta("twitter:title"),
        description: meta("twitter:description"),
        image: meta("twitter:image")
      },
      schema: {
        count: schemaBlocks.length,
        invalid: schemaBlocks.filter((block) => !block.valid).length,
        types: schemaBlocks.flatMap((block) => block.types),
        hasSearchAction: schemaBlocks.some((block) => block.hasSearchAction)
      },
      headings,
      hierarchySkips,
      headingIdPct: headings.length
        ? Math.round((headings.filter((heading) => heading.id).length / headings.length) * 100)
        : 0,
      counts: {
        h1: document.querySelectorAll("h1").length,
        h2: document.querySelectorAll("h2").length,
        h3: document.querySelectorAll("h3").length,
        ul: document.querySelectorAll("ul").length,
        ol: document.querySelectorAll("ol").length,
        dl: document.querySelectorAll("dl").length,
        table: document.querySelectorAll("table").length,
        details: document.querySelectorAll("details").length,
        dt: document.querySelectorAll("dt").length,
        questions,
        stats,
        breadcrumbHtml: document.querySelectorAll(".page-crumb ol li").length,
        address: document.querySelectorAll("address").length,
        timeDateTime: document.querySelectorAll("time[datetime]").length,
        emptyLinks: links.filter((link) => !link.text && !link.ariaLabel).length,
        genericLinks: links.filter((link) => genericLinkTexts.has(normalizedText(link.text))).length,
        links: links.length,
        internalLinks: links.filter((link) => link.href.startsWith(location.origin) || link.href.startsWith("/")).length,
        externalLinks: links.filter((link) => link.href && !link.href.startsWith(location.origin) && !link.href.startsWith("/")).length,
        cta: links.filter((link) => isCallToAction(link.text || link.ariaLabel)).length,
        ctaAboveFold: aboveFoldElements.filter((el) => isCallToAction(el.innerText || el.getAttribute("aria-label") || "")).length
      },
      semanticTags,
      geo: {
        hasSummarySection: Boolean(document.querySelector(".geo-summary-section")),
        hasDirectAnswer: Boolean(document.querySelector(".geo-summary-answer")),
        geoLinks: document.querySelectorAll(".geo-link-list a").length,
        faqItems: document.querySelectorAll(".geo-faq-list details").length,
        text: document.querySelector(".geo-summary-section")?.innerText.slice(0, 500) || ""
      },
      bodyChars: bodyText.length,
      bodyText,
      wordCount: bodyText.trim().split(/\s+/).filter(Boolean).length,
      images,
      links,
      resources
    };
  });

  const heroImage = await page.locator(".portal-hero-image").evaluate((img) => ({
    currentSrc: img.currentSrc,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    clientWidth: Math.round(img.getBoundingClientRect().width),
    clientHeight: Math.round(img.getBoundingClientRect().height),
    devicePixelRatio: window.devicePixelRatio
  })).catch(() => null);

  await browser.close();
  return { dom, heroImage, mainHeaders, mainStatus: mainResponse?.status() || 0, consoleMessages, resourceResponses };
}

async function main() {
  const pageAudit = await collectPageAudit(browserUrl);
  const origin = new URL(browserUrl).origin;
  const supportingFiles = {};
  for (const file of ["/robots.txt", "/llms.txt", "/sitemap.xml", "/site.webmanifest"]) {
    supportingFiles[file] = await responseStatus(toAbsolute(browserUrl, file));
  }
  const routeStatuses = {};
  for (const route of routes) {
    routeStatuses[route] = await responseStatus(toAbsolute(browserUrl, route));
  }

  const { dom, heroImage, mainHeaders, consoleMessages, resourceResponses } = pageAudit;
  const schemaTypes = new Set(dom.schema.types);
  const imageRequestUrls = resourceResponses.map((item) => item.url);
  const totalTransfer = dom.resources.reduce((sum, item) => sum + Number(item.transferSize || 0), 0);
  const imageTransfer = dom.resources
    .filter((item) => item.name.includes("/images/"))
    .reduce((sum, item) => sum + Number(item.transferSize || item.encodedBodySize || 0), 0);

  const seoChecks = [
    check("title_length", dom.titleLength >= 30 && dom.titleLength <= 65, dom.title),
    check("meta_description", dom.descriptionLength >= 80 && dom.descriptionLength <= 165, dom.descriptionLength),
    check("canonical", Boolean(dom.canonical), dom.canonical),
    check("robots_indexable", /index/i.test(dom.robots || "index"), dom.robots),
    check("open_graph_complete", Object.values(dom.og).every(Boolean), dom.og),
    check("twitter_complete", Boolean(dom.twitter.card && dom.twitter.title && dom.twitter.description && dom.twitter.image), dom.twitter),
    check("favicon_manifest", Boolean(dom.favicon && dom.manifest), { favicon: dom.favicon, manifest: dom.manifest }),
    check("single_h1", dom.counts.h1 === 1, dom.counts.h1),
    check("heading_hierarchy", dom.hierarchySkips.length === 0, dom.hierarchySkips),
    check("schema_present", dom.schema.count > 0 && dom.schema.invalid === 0, dom.schema),
    check("website_search_action", dom.schema.hasSearchAction, dom.schema),
    check("breadcrumb_html", dom.counts.breadcrumbHtml >= 2, dom.counts.breadcrumbHtml),
    check("robots_txt", supportingFiles["/robots.txt"].ok && !/html/i.test(supportingFiles["/robots.txt"].contentType), supportingFiles["/robots.txt"]),
    check("llms_txt", supportingFiles["/llms.txt"].ok && !/html/i.test(supportingFiles["/llms.txt"].contentType), supportingFiles["/llms.txt"]),
    check("sitemap_xml", supportingFiles["/sitemap.xml"].ok, supportingFiles["/sitemap.xml"]),
    check("empty_links", dom.counts.emptyLinks === 0, dom.counts.emptyLinks),
    check("image_alt", dom.images.every((image) => image.alt), dom.images.map((image) => ({ src: image.src, alt: image.alt })))
  ];

  const geoChecks = [
    check("summary_section", dom.geo.hasSummarySection, dom.geo.text),
    check("direct_answer", dom.geo.hasDirectAnswer, dom.geo.text),
    check("lists_present", dom.counts.ul + dom.counts.ol >= 1, { ul: dom.counts.ul, ol: dom.counts.ol }),
    check("definitions_present", dom.counts.dl >= 1 && dom.counts.dt >= 2, { dl: dom.counts.dl, dt: dom.counts.dt }),
    check("questions_present", dom.counts.questions >= 2 || dom.counts.details >= 2, { questions: dom.counts.questions, details: dom.counts.details }),
    check("author_present", Boolean(dom.author || dom.counts.address), { author: dom.author, address: dom.counts.address }),
    check("date_modified_present", dom.counts.timeDateTime >= 1, dom.counts.timeDateTime),
    check("heading_ids", dom.headingIdPct >= 20, dom.headingIdPct),
    check("faq_schema", schemaTypes.has("FAQPage"), [...schemaTypes]),
    check("breadcrumb_schema", schemaTypes.has("BreadcrumbList"), [...schemaTypes]),
    check("org_schema", schemaTypes.has("Organization"), [...schemaTypes]),
    check("website_schema", schemaTypes.has("WebSite"), [...schemaTypes]),
    check("content_length", dom.bodyChars >= 2200, dom.bodyChars),
    check("semantic_html", ["main", "nav", "header", "section", "figure"].every((tag) => dom.semanticTags[tag] > 0), dom.semanticTags),
    check("ai_access_files", supportingFiles["/llms.txt"].ok && supportingFiles["/robots.txt"].ok, supportingFiles)
  ];

  const perfChecks = [
    check("hero_preloaded", dom.preloadImages.some((item) => item.href?.includes("safety-6s-hero")), dom.preloadImages),
    check("hero_uses_webp", Boolean(heroImage?.currentSrc?.endsWith(".webp")), heroImage),
    check("no_4k_hero_request", !imageRequestUrls.some((item) => item.includes("safety-6s-hero-4k.png")), imageRequestUrls),
    check("background_uses_webp", imageRequestUrls.some((item) => /light-mode-background-(mobile|4k)\.webp/.test(item)), imageRequestUrls),
    check("route_split_chunks", dom.resources.filter((item) => item.name.includes("/assets/") && item.name.endsWith(".js")).length >= 2, dom.resources.filter((item) => item.name.includes("/assets/") && item.name.endsWith(".js")).map((item) => item.name)),
    check("console_clean", consoleMessages.length === 0, consoleMessages),
    check("theme_init_not_blocking", !dom.themeInitScript.exists || dom.themeInitScript.defer || dom.themeInitScript.async, dom.themeInitScript),
    check("image_transfer_under_250kb", imageTransfer > 0 && imageTransfer < 250000, imageTransfer),
    check("total_transfer_under_900kb", totalTransfer > 0 && totalTransfer < 900000, totalTransfer)
  ];

  const securityChecks = [
    check("csp_header", Boolean(mainHeaders["content-security-policy"]), mainHeaders["content-security-policy"]),
    check("csp_form_action", /form-action 'self'/.test(mainHeaders["content-security-policy"] || ""), mainHeaders["content-security-policy"]),
    check("csp_manifest_src", /manifest-src 'self'/.test(mainHeaders["content-security-policy"] || ""), mainHeaders["content-security-policy"]),
    check("x_content_type_options", mainHeaders["x-content-type-options"] === "nosniff", mainHeaders["x-content-type-options"]),
    check("x_frame_options", Boolean(mainHeaders["x-frame-options"]), mainHeaders["x-frame-options"]),
    check("referrer_policy", Boolean(mainHeaders["referrer-policy"] || dom.referrer), { header: mainHeaders["referrer-policy"], meta: dom.referrer }),
    check("permissions_policy", Boolean(mainHeaders["permissions-policy"]), mainHeaders["permissions-policy"]),
    check("x_powered_by_hidden", !mainHeaders["x-powered-by"], mainHeaders["x-powered-by"] || ""),
    check("html_no_cache", /no-cache/.test(mainHeaders["cache-control"] || ""), mainHeaders["cache-control"]),
    check("manifest_available", supportingFiles["/site.webmanifest"].ok, supportingFiles["/site.webmanifest"])
  ];
  const checksByGroup = {
    geo: geoChecks,
    performance: perfChecks,
    security: securityChecks,
    seo: seoChecks
  };
  const failedChecks = Object.entries(checksByGroup).flatMap(([group, checks]) =>
    checks
      .filter((item) => !item.pass)
      .map((item) => ({
        evidence: item.evidence,
        group,
        name: item.name
      }))
  );
  const allChecks = Object.values(checksByGroup).flat();
  const summary = {
    failed: failedChecks.length,
    passed: allChecks.length - failedChecks.length,
    total: allChecks.length
  };

  const result = {
    generatedAt: new Date().toISOString(),
    auditedUrl: url,
    browserUrl,
    origin,
    routes,
    scores: {
      seoReadiness: score(seoChecks),
      geoReadiness: score(geoChecks),
      performanceReadiness: score(perfChecks),
      securityReadiness: score(securityChecks),
      overall: Math.round((score(seoChecks) + score(geoChecks) + score(perfChecks) + score(securityChecks)) / 4)
    },
    checks: checksByGroup,
    failedChecks,
    ok: failedChecks.length === 0,
    page: {
      status: pageAudit.mainStatus,
      title: dom.title,
      titleLength: dom.titleLength,
      descriptionLength: dom.descriptionLength,
      canonical: dom.canonical,
      schema: dom.schema,
      counts: dom.counts,
      headingIdPct: dom.headingIdPct,
      hierarchySkips: dom.hierarchySkips,
      bodyChars: dom.bodyChars,
      wordCount: dom.wordCount,
      semanticTags: dom.semanticTags,
      heroImage,
      preloadImages: dom.preloadImages,
      themeInitScript: dom.themeInitScript,
      consoleMessages,
      resources: {
        totalTransfer,
        imageTransfer,
        imageRequests: imageRequestUrls,
        resourceResponses
      }
    },
    headers: mainHeaders,
    supportingFiles,
    routeStatuses
  };
  result.summary = summary;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    failedChecks,
    ok: result.ok,
    outPath,
    scores: result.scores,
    summary,
    failedCheckNames: Object.fromEntries(
      Object.entries(result.checks).map(([group, checks]) => [group, checks.filter((item) => !item.pass).map((item) => item.name)])
    )
  }, null, 2));

  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
