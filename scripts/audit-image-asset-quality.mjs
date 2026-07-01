import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const readArg = (name, fallback) => {
  const index = process.argv.lastIndexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
};

const rootDir = process.cwd();
const baseUrl = readArg("--url", process.env.VERIFY_BASE_URL || "http://127.0.0.1:3333/");
const reportsDir = path.join(rootDir, "qa", "reports");
const screenshotsDir = path.join(rootDir, "qa", "screenshots");
const reportPath = path.join(reportsDir, "image-asset-quality-audit.json");

const ensureDir = (directory) => fs.mkdirSync(directory, { recursive: true });
const normalize = (filePath) => path.relative(rootDir, filePath).replace(/\\/g, "/");

const check = (name, pass, evidence = {}) => ({
  evidence,
  name,
  pass: Boolean(pass)
});

const pngSize = (buffer) => {
  if (buffer.slice(1, 4).toString("ascii") !== "PNG") return null;
  return {
    height: buffer.readUInt32BE(20),
    width: buffer.readUInt32BE(16)
  };
};

const webpSize = (buffer) => {
  if (buffer.slice(0, 4).toString("ascii") !== "RIFF" || buffer.slice(8, 12).toString("ascii") !== "WEBP") {
    return null;
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.slice(offset, offset + 4).toString("ascii");
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;

    if (type === "VP8X" && data + 10 <= buffer.length) {
      return {
        height: 1 + buffer.readUIntLE(data + 7, 3),
        type,
        width: 1 + buffer.readUIntLE(data + 4, 3)
      };
    }

    if (type === "VP8 " && data + 10 <= buffer.length) {
      return {
        height: buffer.readUInt16LE(data + 8) & 0x3fff,
        type,
        width: buffer.readUInt16LE(data + 6) & 0x3fff
      };
    }

    if (type === "VP8L" && data + 5 <= buffer.length) {
      const b0 = buffer[data + 1];
      const b1 = buffer[data + 2];
      const b2 = buffer[data + 3];
      const b3 = buffer[data + 4];
      return {
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
        type,
        width: 1 + (((b1 & 0x3f) << 8) | b0)
      };
    }

    offset += 8 + size + (size % 2);
  }

  return null;
};

const svgSize = (text) => {
  const width = text.match(/\bwidth=["']([^"']+)/i)?.[1] || null;
  const height = text.match(/\bheight=["']([^"']+)/i)?.[1] || null;
  const viewBox = text.match(/viewBox=["']([^"']+)/i)?.[1] || null;
  return { height, viewBox, width };
};

const readImageInfo = (relativePath) => {
  const filePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      path: relativePath
    };
  }

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(relativePath).toLowerCase();
  const dimensions = ext === ".png"
    ? pngSize(buffer)
    : ext === ".webp"
      ? webpSize(buffer)
      : ext === ".svg"
        ? svgSize(buffer.toString("utf8"))
        : null;

  return {
    bytes: buffer.length,
    exists: true,
    path: relativePath,
    ...(dimensions || {})
  };
};

const imageInfoFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    const urlPath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    const relativePath = urlPath.startsWith("images/") ? `public/${urlPath}` : urlPath;
    return readImageInfo(relativePath);
  } catch {
    return {
      exists: false,
      path: url
    };
  }
};

const fileExpectations = [
  {
    bytesMax: 180000,
    height: 2160,
    path: "public/images/light-mode-background-4k.webp",
    width: 3840
  },
  {
    bytesMax: 260000,
    height: 1442,
    path: "public/images/safety-6s-hero-2400.webp",
    width: 2400
  },
  {
    bytesMax: 150000,
    height: 961,
    path: "public/images/safety-6s-hero-1600.webp",
    width: 1600
  },
  {
    bytesMax: 90000,
    height: 577,
    path: "public/images/safety-6s-hero-960.webp",
    width: 960
  },
  {
    bytesMax: 900000,
    height: 721,
    path: "public/images/safety-6s-hero-web.png",
    width: 1200
  },
  {
    bytesMax: 40000,
    path: "public/images/mani-logo-main.png",
    widthMin: 600
  },
  {
    bytesMax: 12000,
    path: "public/images/topnavi-bg.svg",
    viewBox: "0 0 1920 78"
  },
  {
    bytesMax: 12000,
    path: "public/images/topnavi-mobile-bg.svg",
    viewBox: "0 0 234 78"
  }
];

const imageInfos = fileExpectations.map((item) => ({
  expected: item,
  info: readImageInfo(item.path)
}));

const fileChecks = imageInfos.flatMap(({ expected, info }) => {
  const checks = [
    check(`image-exists-${expected.path}`, info.exists, { info }),
    check(`image-size-budget-${expected.path}`, info.exists && info.bytes <= expected.bytesMax, {
      bytes: info.bytes,
      bytesMax: expected.bytesMax,
      path: expected.path
    })
  ];

  if (expected.width) {
    checks.push(check(`image-width-${expected.path}`, info.width === expected.width, {
      actual: info.width,
      expected: expected.width
    }));
  }

  if (expected.height) {
    checks.push(check(`image-height-${expected.path}`, info.height === expected.height, {
      actual: info.height,
      expected: expected.height
    }));
  }

  if (expected.widthMin) {
    checks.push(check(`image-min-width-${expected.path}`, Number(info.width) >= expected.widthMin, {
      actual: info.width,
      expectedMin: expected.widthMin
    }));
  }

  if (expected.viewBox) {
    checks.push(check(`image-viewbox-${expected.path}`, info.viewBox === expected.viewBox, {
      actual: info.viewBox,
      expected: expected.viewBox
    }));
  }

  return checks;
});

const readSourceText = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");

const homeSource = readSourceText(path.join("src", "pages", "HomePage.tsx"));
const heroCssFiles = ["src/styles.css", "src/pages/HomePage.css"];
const heroCssText = heroCssFiles
  .map((relativePath) => `/* ${relativePath} */\n${readSourceText(relativePath)}`)
  .join("\n");
const heroImageRules = [...heroCssText.matchAll(/\.portal-hero-image[^{]*\{[^}]*\}/g)].map((match) => match[0]);
const heroContainRule = heroImageRules.some((rule) => /object-fit\s*:\s*contain\b/i.test(rule));
const heroCoverRule = heroImageRules.some((rule) => /object-fit\s*:\s*cover\b/i.test(rule));
const heroScaleRule = heroImageRules.some((rule) => /transform\s*:\s*scale\(/i.test(rule));
const sourceChecks = [
  check("hero-source-set-includes-2400-webp", homeSource.includes("/images/safety-6s-hero-2400.webp 2400w"), {}),
  check("hero-image-attributes-match-highest-ratio", homeSource.includes('width="2400"') && homeSource.includes('height="1442"'), {}),
  check("hero-image-uses-contain-css-contract", heroContainRule && !heroCoverRule && !heroScaleRule, {
    checkedFiles: heroCssFiles,
    heroContainRule,
    heroCoverRule,
    heroScaleRule
  })
];

async function collectBrowserMetrics() {
  const browser = await chromium.launch({ headless: true });
  const cases = [
    { deviceScaleFactor: 1, height: 2160, name: "desktop-3840-4k", width: 3840 },
    { deviceScaleFactor: 1, height: 1080, name: "desktop-1920", width: 1920 },
    { deviceScaleFactor: 2, height: 1080, name: "retina-tv-1920", width: 1920 },
    { deviceScaleFactor: 2, height: 900, name: "mobile-390", width: 390 }
  ];
  const results = [];

  try {
    for (const testCase of cases) {
      const page = await browser.newPage({
        deviceScaleFactor: testCase.deviceScaleFactor,
        viewport: {
          height: testCase.height,
          width: testCase.width
        }
      });
      const consoleErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(error.message));
      await page.addInitScript(() => {
        localStorage.setItem("hub-theme-default-version", "light-default-v1");
        localStorage.setItem("hub-theme", "light");
        localStorage.setItem("hub-lang", "vi");
      });
      await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 25000 });
      await page.locator(".portal-hero-image").waitFor({ state: "visible", timeout: 12000 });
      const metrics = await page.locator(".portal-hero-image").evaluate((img) => {
        const rect = img.getBoundingClientRect();
        return {
          clientHeight: rect.height,
          clientWidth: rect.width,
          currentSrc: img.currentSrc,
          devicePixelRatio: window.devicePixelRatio,
          naturalHeight: img.naturalHeight,
          naturalWidth: img.naturalWidth,
          objectFit: getComputedStyle(img).objectFit
        };
      });
      const sourceInfo = imageInfoFromUrl(metrics.currentSrc);
      const screenshot = path.resolve(screenshotsDir, `image-assets-${testCase.name}.png`);
      await page.screenshot({ fullPage: false, path: screenshot });
      await page.close();

      const requiredPixelWidth = Math.ceil(metrics.clientWidth * metrics.devicePixelRatio);
      const sourcePixelWidth = Number(sourceInfo.width) || metrics.naturalWidth;
      const overshootRatio = sourcePixelWidth / Math.max(1, requiredPixelWidth);
      const checks = [
        check("hero-browser-uses-webp", metrics.currentSrc.endsWith(".webp"), { metrics }),
        check("hero-browser-has-enough-source-pixels", sourcePixelWidth >= requiredPixelWidth, {
          metrics,
          requiredPixelWidth,
          sourceInfo,
          sourcePixelWidth
        }),
        check("hero-browser-source-not-excessive", overshootRatio <= 3.2, {
          overshootRatio,
          requiredPixelWidth,
          sourceInfo,
          sourcePixelWidth
        }),
        check("hero-browser-object-fit-contain", metrics.objectFit === "contain", { metrics }),
        check("hero-browser-console-clean", consoleErrors.length === 0, { consoleErrors }),
        check("hero-browser-screenshot-written", fs.existsSync(screenshot), { screenshot })
      ];

      results.push({
        checks,
        metrics,
        name: testCase.name,
        screenshot,
        sourceInfo,
        size: `${testCase.width}x${testCase.height}`
      });
    }
  } finally {
    await browser.close();
  }

  return results;
}

ensureDir(reportsDir);
ensureDir(screenshotsDir);

const browserResults = await collectBrowserMetrics();
const allChecks = [...fileChecks, ...sourceChecks, ...browserResults.flatMap((result) => result.checks)];
const failedChecks = allChecks.filter((item) => !item.pass);
const report = {
  baseUrl,
  failedChecks,
  fileChecks,
  generatedAtUtc: new Date().toISOString(),
  imageInfos,
  ok: failedChecks.length === 0,
  reportPath: normalize(reportPath),
  results: browserResults,
  sourceChecks,
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
  viewports: browserResults.map((result) => ({
    failed: result.checks.filter((item) => !item.pass).length,
    name: result.name,
    screenshot: result.screenshot,
    size: result.size
  }))
}, null, 2));

if (!report.ok) process.exit(1);
