import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import defaultConfig from "../shared/defaultConfig.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loadI18nModule = async () => {
  const sourcePath = path.join(ROOT, "src", "i18n.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    },
    fileName: sourcePath
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);
};

const { dictionary } = await loadI18nModule();
const VI_CHAR_RE = /[\u0102-\u1ef9\u0110\u0111]/;
const SAFETY_FILES = [
  "src/pages/safety/SafetyActionsPage.tsx",
  "src/pages/safety/SafetyAuditsPage.tsx",
  "src/pages/safety/SafetyWarningsPage.tsx",
  "src/pages/safety/SafetyIncidentsPage.tsx",
  "src/pages/safety/SafetyDashboardPage.tsx",
  "src/pages/safety/SafetyReportsPage.tsx",
  "src/pages/safety/SafetyDataEntryPage.tsx",
  "src/pages/safety/SafetyTrainingPage.tsx",
  "src/pages/safety/SafetySettingsPage.tsx",
  "src/pages/safety/SafetyApprovalPage.tsx",
  "src/pages/safety/SafetyDocumentsPage.tsx",
  "src/pages/safety/SafetyLocationsPage.tsx",
  "src/pages/safety/SafetyKpiPage.tsx",
  "src/pages/safety/SafetyChecklistPage.tsx",
  "src/pages/safety/SafetyReferencePage.tsx",
  "src/pages/safety/safety-shared.tsx"
];

const SAFETY_RENDER_FILES = SAFETY_FILES.filter((file) => file.endsWith("Page.tsx"));

const APP_I18N_FILES = [
  "src/app/AppShell.tsx",
  "src/pages/HomePage.tsx",
  "src/pages/DocumentsPage.tsx",
  "src/pages/LoginPage.tsx",
  "src/pages/AdminPage.tsx",
  "src/pages/OperationsPage.tsx",
  "src/components/FeedDetailModal.tsx",
  "src/components/SafetyBulletinModal.tsx",
  "src/components/ui.tsx"
];

const VISIBLE_PROP_NAMES = [
  "aria-label",
  "placeholder",
  "title",
  "alt",
  "label",
  "subtitle",
  "description",
  "helperText",
  "emptyLabel",
  "loadingLabel"
];

const APPROVED_APP_LITERAL_RE = [
  /^(MHC|6S|KPI|CAPA|KYT|PCCC|URL|ID|VI|EN|JA)$/i,
  /^(MHChub|IoT Mani|PLC Gateway Pro|MHC Corporation)$/i,
  /^(PDF|Excel|Word|PowerPoint|LibreOffice|MQTT|StrictReady)$/i,
  /^(config|documents|uploads)\.json$/i,
  /^v?\d+(\.\d+)*$/,
  /^[-–—·/()[\]{}:.,\s\d]+$/
];

const allowedNameFragments = [
  "Tuấn",
  "Phạm",
  "Hạnh",
  "Nguyễn",
  "Long",
  "Hùng"
];

function walk(value, visit, objectPath = "root") {
  if (!value || typeof value !== "object") return;
  visit(value, objectPath);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, `${objectPath}[${index}]`));
  } else {
    Object.entries(value).forEach(([key, item]) => walk(item, visit, `${objectPath}.${key}`));
  }
}

function auditDictionaryParity() {
  const languages = Object.keys(dictionary);
  const allKeys = [...new Set(languages.flatMap((lang) => Object.keys(dictionary[lang] || {})))].sort();
  const missing = {};

  languages.forEach((lang) => {
    missing[lang] = allKeys.filter((key) => !(key in (dictionary[lang] || {})));
  });

  return { languages, keyCount: allKeys.length, missing };
}

function auditJapaneseData() {
  const findings = [];
  walk(defaultConfig, (value, objectPath) => {
    if (!("ja" in value)) return;
    const entries = Array.isArray(value.ja) ? value.ja : [value.ja];
    entries.forEach((item, index) => {
      const text = String(item ?? "");
      if (!VI_CHAR_RE.test(text)) return;
      if (allowedNameFragments.some((name) => text.includes(name))) return;
      findings.push({ path: `${objectPath}.ja${Array.isArray(value.ja) ? `[${index}]` : ""}`, sample: text.slice(0, 160) });
    });
  });
  return findings;
}

function extractSafetyStrings() {
  const strings = new Set();
  const looksLikeCode = (value) =>
    value.length > 180 ||
    /\b(const|return|useState|filter|map|includes|queryKey|className|aria-label)\b/.test(value) ||
    /[{}[\]]/.test(value) ||
    /={|=>|&&|\|\||===|!==/.test(value);

  SAFETY_FILES.forEach((relativeFile) => {
    const text = fs.readFileSync(path.join(ROOT, relativeFile), "utf8");
    for (const match of text.matchAll(/>\s*([^<>{}\n][^<>{}]*)\s*</g)) {
      const value = match[1].replace(/\s+/g, " ").trim();
      if (value && VI_CHAR_RE.test(value) && !looksLikeCode(value)) strings.add(value);
    }
    for (const match of text.matchAll(/(?:aria-label|placeholder|title|alt|label|subtitle|description|helperText|emptyLabel|loadingLabel|name)=["']([^"']*[\u0102-\u1ef9\u0110\u0111][^"']*)["']/g)) {
      const value = match[1].replace(/\s+/g, " ").trim();
      if (!looksLikeCode(value)) strings.add(value);
    }
    for (const match of text.matchAll(/(?:aria-label|placeholder|title|alt|label|subtitle|description|helperText|emptyLabel|loadingLabel|name)=\{["']([^"']*[\u0102-\u1ef9\u0110\u0111][^"']*)["']\}/g)) {
      const value = match[1].replace(/\s+/g, " ").trim();
      if (!looksLikeCode(value)) strings.add(value);
    }
  });

  return [...strings].sort((left, right) => left.localeCompare(right, "vi"));
}

function looksLikeSourceCode(value) {
  return (
    value.length > 180 ||
    /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(value) ||
    /\b(const|return|useState|filter|map|includes|queryKey|className|aria-label|currentTarget|startsWith|document|getText|format|Number|Math|Date)\b/.test(value) ||
    /[{}[\]]/.test(value) ||
    /={|=>|&&|\|\||===|!==|[();]/.test(value)
  );
}

function isApprovedAppLiteral(value) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return APPROVED_APP_LITERAL_RE.some((pattern) => pattern.test(normalized));
}

function extractVisibleHardcodedAppStrings() {
  const findings = [];
  const propPattern = new RegExp(
    `(?:${VISIBLE_PROP_NAMES.map((name) => name.replace("-", "\\-")).join("|")})=["']([^"']*[A-Za-z\\u0102-\\u1ef9\\u0110\\u0111\\u3040-\\u30ff\\u3400-\\u9fff][^"']*)["']`,
    "g"
  );

  APP_I18N_FILES.forEach((relativeFile) => {
    const text = fs.readFileSync(path.join(ROOT, relativeFile), "utf8");
    if (/\b(?:vi|en|ja)\s*:\s*\{/.test(text)) {
      findings.push({
        file: relativeFile,
        kind: "language-map",
        sample: "Local vi/en/ja map detected"
      });
    }

    for (const match of text.matchAll(/>\s*([^<>{}\n][^<>{}]*)\s*</g)) {
      const value = match[1].replace(/\s+/g, " ").trim();
      if (!value || looksLikeSourceCode(value) || isApprovedAppLiteral(value)) continue;
      if (!/[A-Za-z\u0102-\u1ef9\u0110\u0111\u3040-\u30ff\u3400-\u9fff]/.test(value)) continue;
      findings.push({ file: relativeFile, kind: "jsx-text", sample: value.slice(0, 160) });
    }

    for (const match of text.matchAll(propPattern)) {
      const value = match[1].replace(/\s+/g, " ").trim();
      if (!value || looksLikeSourceCode(value) || isApprovedAppLiteral(value)) continue;
      findings.push({ file: relativeFile, kind: "prop", sample: value.slice(0, 160) });
    }
  });

  return findings;
}

function auditSafetyCoverage() {
  const bridgeSource = fs.readFileSync(path.join(ROOT, "src/pages/safety/safety-i18n.ts"), "utf8");
  const strings = extractSafetyStrings();
  const exactCovered = strings.filter((item) => bridgeSource.includes(JSON.stringify(item)) || bridgeSource.includes(`"${item.replaceAll('"', '\\"')}"`));
  const uncovered = strings.filter((item) => !exactCovered.includes(item));
  return {
    total: strings.length,
    exactCovered: exactCovered.length,
    exactCoveragePct: strings.length ? Math.round((exactCovered.length / strings.length) * 100) : 100,
    uncovered: uncovered.slice(0, 80)
  };
}

function auditSafetyRenderPath() {
  const bridgePath = path.join(ROOT, "src/pages/safety/SafetyI18nBridge.tsx");
  const safetyDir = path.join(ROOT, "src/pages/safety");
  const bridgeReferences = [];

  for (const fileName of fs.readdirSync(safetyDir)) {
    if (!/\.(tsx?|jsx?)$/.test(fileName)) continue;
    const relativeFile = `src/pages/safety/${fileName}`;
    const text = fs.readFileSync(path.join(ROOT, relativeFile), "utf8");
    if (text.includes("SafetyI18nBridge")) bridgeReferences.push(relativeFile);
  }

  const missingRenderWrapper = SAFETY_RENDER_FILES.filter((relativeFile) => {
    const text = fs.readFileSync(path.join(ROOT, relativeFile), "utf8");
    return extractSafetyStringsFromText(text).length && !text.includes("SafetyI18nRender");
  });

  return {
    bridgeFileExists: fs.existsSync(bridgePath),
    bridgeReferences,
    missingRenderWrapper
  };
}

function extractSafetyStringsFromText(text) {
  const strings = new Set();
  const looksLikeCode = (value) =>
    value.length > 180 ||
    /\b(const|return|useState|filter|map|includes|queryKey|className|aria-label)\b/.test(value) ||
    /[{}[\]]/.test(value) ||
    /={|=>|&&|\|\||===|!==/.test(value);

  for (const match of text.matchAll(/>\s*([^<>{}\n][^<>{}]*)\s*</g)) {
    const value = match[1].replace(/\s+/g, " ").trim();
    if (value && VI_CHAR_RE.test(value) && !looksLikeCode(value)) strings.add(value);
  }
  for (const match of text.matchAll(/(?:aria-label|placeholder|title|alt|label|subtitle|description|helperText|emptyLabel|loadingLabel|name)=["']([^"']*[\u0102-\u1ef9\u0110\u0111][^"']*)["']/g)) {
    const value = match[1].replace(/\s+/g, " ").trim();
    if (!looksLikeCode(value)) strings.add(value);
  }
  for (const match of text.matchAll(/(?:aria-label|placeholder|title|alt|label|subtitle|description|helperText|emptyLabel|loadingLabel|name)=\{["']([^"']*[\u0102-\u1ef9\u0110\u0111][^"']*)["']\}/g)) {
    const value = match[1].replace(/\s+/g, " ").trim();
    if (!looksLikeCode(value)) strings.add(value);
  }
  return [...strings];
}

const parity = auditDictionaryParity();
const japaneseDataFindings = auditJapaneseData();
const safetyCoverage = auditSafetyCoverage();
const safetyRenderPath = auditSafetyRenderPath();
const appHardcodedVisibleFindings = extractVisibleHardcodedAppStrings();

console.log(
  JSON.stringify(
    {
      dictionary: parity,
      japaneseDataFindings,
      safetyCoverage,
      safetyRenderPath,
      appHardcodedVisibleFindings
    },
    null,
    2
  )
);

if (
  Object.values(parity.missing).some((items) => items.length) ||
  japaneseDataFindings.length ||
  safetyCoverage.uncovered.length ||
  safetyRenderPath.bridgeFileExists ||
  safetyRenderPath.bridgeReferences.length ||
  safetyRenderPath.missingRenderWrapper.length ||
  appHardcodedVisibleFindings.length
) {
  process.exitCode = 1;
}
