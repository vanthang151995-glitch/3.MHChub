import fs from "node:fs";
import path from "node:path";

const checks = [
  {
    file: "src/pages/SafetyPage.tsx",
    tests: [
      {
        pattern: /legacy-safety-command-grid/,
        message: "SafetyPage must not render the hidden legacy command grid; keep only the current dashboard blocks."
      },
      {
        pattern: /Xem thÃªm/,
        message: "SafetyPage must not contain mojibake legacy 'Xem thêm' text."
      }
    ]
  },
  {
    file: "src/pages/SafetyPage.css",
    tests: [
      {
        pattern: /\.legacy-safety-command-grid\b/,
        message: "SafetyPage.css must not keep display:none legacy grid rules."
      }
    ]
  },
  {
    file: "scripts/audit-bulletin-ui.mjs",
    tests: [
      {
        pattern: /\.bulletin-modal(?=(?:\s|["'#:),>]|$))/,
        message: "Bulletin UI audit must target .safety-bulletin-modal root, not legacy .bulletin-modal."
      }
    ]
  },
  {
    file: "src/components/FeedDetailModal.tsx",
    tests: [
      {
        pattern: /import\s+["']\.\/modal-overlays\.css["']/,
        message: "FeedDetailModal must not import legacy modal-overlays.css; keep feed-detail styles in FeedDetailModal.css."
      }
    ]
  },
  {
    file: "src/components/SafetyBulletinModal.tsx",
    tests: [
      {
        pattern: /import\s+["']\.\/modal-overlays\.css["']/,
        message: "SafetyBulletinModal must not import legacy modal-overlays.css."
      },
      {
        pattern: /className=["'][^"']*(?:^|\s)bulletin-modal(?:\s|$)[^"']*["']/,
        message: "SafetyBulletinModal root must use safety-bulletin-modal, not legacy bulletin-modal."
      }
    ]
  },
  {
    file: "src/components/SafetyBulletinModal.css",
    tests: [
      {
        pattern: /\.bulletin-modal(?=[:\s.,{])/,
        message: "SafetyBulletinModal.css must not target legacy .bulletin-modal root."
      },
      {
        pattern: /\.iot-responsive-modal\s+\.safety-bulletin-modal/,
        message: "Do not target .safety-bulletin-modal as a child of .iot-responsive-modal; it is the same root element."
      }
    ]
  },
  {
    file: "src/styles.css",
    tests: [
      {
        pattern: /\.side-rail\s+\.main-nav\s*\{[^}]*scrollbar-width:\s*thin/s,
        message: "Sidebar main-nav must hide native scrollbars, not re-enable thin scrollbars."
      },
      {
        pattern: /\.side-rail\s*\{[^}]*scrollbar-width:\s*thin/s,
        message: "Sidebar rail must hide native scrollbars, not inherit/re-enable thin scrollbars."
      },
      {
        pattern: /side-rail(?:\s+\.main-nav)?::-webkit-scrollbar-(?:track|thumb)/,
        message: "Sidebar must not draw custom scrollbar tracks/thumbs."
      },
      {
        pattern: /\.bulletin-modal\b/,
        message: "Global styles.css must not contain legacy .bulletin-modal selectors; use scoped SafetyBulletinModal.css instead."
      },
      {
        pattern: /\.feed-detail-/,
        message: "Global styles.css must not style FeedDetailModal internals; keep feed detail styles in FeedDetailModal.css."
      }
    ]
  },
  {
    file: "src/pages/safety/safety-route.css",
    tests: [
      {
        pattern: /Final Safety sidebar scrollbar lock/,
        message: "Do not add late Safety sidebar scrollbar lock blocks; put sidebar rules at the source selector."
      },
      {
        pattern: /\.legacy-safety-command-grid\b/,
        message: "Safety route CSS must not keep display:none legacy grid rules."
      }
    ]
  }
];

const failures = [];
const bulletinModalChildPattern = /\.bulletin-modal-[a-z0-9_-]+\b/i;
const rootDir = process.cwd();
const srcDir = path.join(rootDir, "src");

function toRelative(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

function walkFiles(directory, predicate, results = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, results);
    } else if (predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

for (const check of checks) {
  const text = fs.readFileSync(check.file, "utf8");
  for (const test of check.tests) {
    if (test.pattern.test(text)) {
      failures.push(`${check.file}: ${test.message}`);
    }
  }

  if (check.file === "src/components/SafetyBulletinModal.css") {
    for (const block of text.matchAll(/([^{}]+)\{/g)) {
      const selectorList = block[1];
      for (const selector of selectorList.split(",")) {
        if (bulletinModalChildPattern.test(selector) && !selector.includes(".safety-bulletin-modal")) {
          failures.push(`${check.file}: SafetyBulletinModal child selector is not scoped: ${selector.trim()}`);
        }
      }
    }
  }
}

const cssFiles = new Set(walkFiles(srcDir, (filePath) => filePath.endsWith(".css")).map(toRelative));
const sourceFiles = walkFiles(srcDir, (filePath) => /\.(?:tsx?|jsx?)$/.test(filePath));
const importedCssFiles = new Set();

for (const sourceFile of sourceFiles) {
  const sourceText = fs.readFileSync(sourceFile, "utf8");
  for (const match of sourceText.matchAll(/import\s+(?:[^"']+\s+from\s+)?["']([^"']+\.css)["']/g)) {
    const specifier = match[1];
    if (!specifier.startsWith(".")) continue;
    const resolved = toRelative(path.resolve(path.dirname(sourceFile), specifier));
    importedCssFiles.add(resolved);
    if (!fs.existsSync(path.join(rootDir, resolved))) {
      failures.push(`${toRelative(sourceFile)}: CSS import points to a missing file: ${specifier}`);
    }
  }
}

for (const cssFile of cssFiles) {
  if (!importedCssFiles.has(cssFile)) {
    failures.push(`${cssFile}: CSS file is not imported by any src TypeScript/JavaScript entrypoint.`);
  }
}

if (fs.existsSync(path.join(srcDir, "components", "modal-overlays.css"))) {
  failures.push("src/components/modal-overlays.css: legacy overlay stylesheet must stay deleted.");
}

if (failures.length) {
  console.error("CSS cleanliness audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("CSS cleanliness audit passed.");
