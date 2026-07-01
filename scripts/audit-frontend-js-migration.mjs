import fs from "fs";
import path from "path";
import ts from "typescript";

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, "src");
const reportsDir = path.join(rootDir, "qa", "reports");
const reportPath = path.join(reportsDir, "frontend-js-migration-audit.json");
const tsconfigPath = path.join(rootDir, "tsconfig.json");
const viteConfigJsPath = path.join(rootDir, "vite.config.js");
const viteConfigTsPath = path.join(rootDir, "vite.config.ts");

const allowedJsFiles = new Map([]);
const allowedTypeScriptSuppressions = new Map([]);
const allowedExplicitAnyTypes = new Map([]);
const typeScriptSuppressionPattern = /@ts-(?:nocheck|ignore|expect-error)\b/;

const toRelative = (filePath) => path.relative(rootDir, filePath).replace(/\\/g, "/");
const readTsconfig = () => {
  if (!fs.existsSync(tsconfigPath)) return {};
  const parsed = ts.parseConfigFileTextToJson(tsconfigPath, fs.readFileSync(tsconfigPath, "utf8"));
  return parsed.config || {};
};

const walk = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
};

const jsFiles = walk(sourceDir)
  .filter((filePath) => path.extname(filePath).toLowerCase() === ".js")
  .map(toRelative)
  .sort();

const sourceFiles = walk(sourceDir)
  .filter((filePath) => [".ts", ".tsx"].includes(path.extname(filePath).toLowerCase()))
  .sort();

const unexpectedJsFiles = jsFiles.filter((filePath) => !allowedJsFiles.has(filePath));
const remainingAllowedJsFiles = jsFiles.map((filePath) => ({
  path: filePath,
  reason: allowedJsFiles.get(filePath) || ""
}));
const completedAllowedJsFiles = Array.from(allowedJsFiles.keys())
  .filter((filePath) => !jsFiles.includes(filePath))
  .sort();

const typeScriptSuppressions = sourceFiles.flatMap((filePath) => {
  const relativePath = toRelative(filePath);
  const allowedLines = new Set(allowedTypeScriptSuppressions.get(relativePath)?.lines || []);

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => typeScriptSuppressionPattern.test(line))
    .filter(({ lineNumber }) => !allowedLines.has(lineNumber))
    .map(({ line, lineNumber }) => ({
      line: line.trim(),
      lineNumber,
      path: relativePath
    }));
}).sort((left, right) => left.path.localeCompare(right.path) || left.lineNumber - right.lineNumber);

const findExplicitAnyTypes = (filePath, { applyAllowlist = true } = {}) => {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const relativePath = toRelative(filePath);
  const allowedLines = applyAllowlist ? new Set(allowedExplicitAnyTypes.get(relativePath)?.lines || []) : new Set();
  const scriptKind = path.extname(filePath).toLowerCase() === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  const lineTexts = sourceText.split(/\r?\n/);
  const findings = [];

  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const lineNumber = position.line + 1;
      if (!allowedLines.has(lineNumber)) {
        findings.push({
          column: position.character + 1,
          line: (lineTexts[position.line] || "").trim(),
          lineNumber,
          path: relativePath
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings;
};

const explicitAnyTypes = sourceFiles
  .flatMap(findExplicitAnyTypes)
  .sort((left, right) => left.path.localeCompare(right.path) || left.lineNumber - right.lineNumber || left.column - right.column);

const completedAllowedTypeScriptSuppressions = Array.from(allowedTypeScriptSuppressions, ([filePath, config]) => ({
  path: filePath,
  reason: config.reason || "",
  lines: config.lines || []
})).filter(({ path: filePath, lines }) => {
  const fullPath = path.join(rootDir, filePath);
  if (!fs.existsSync(fullPath)) return true;
  const foundLines = fs
    .readFileSync(fullPath, "utf8")
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => typeScriptSuppressionPattern.test(line))
    .map(({ lineNumber }) => lineNumber);

  return lines.every((lineNumber) => !foundLines.includes(lineNumber));
});

const completedAllowedExplicitAnyTypes = Array.from(allowedExplicitAnyTypes, ([filePath, config]) => ({
  path: filePath,
  reason: config.reason || "",
  lines: config.lines || []
})).filter(({ path: filePath, lines }) => {
  const fullPath = path.join(rootDir, filePath);
  if (!fs.existsSync(fullPath)) return true;
  const currentLines = new Set(findExplicitAnyTypes(fullPath, { applyAllowlist: false }).map((item) => item.lineNumber));
  return lines.every((lineNumber) => !currentLines.has(lineNumber));
});

const tsconfig = readTsconfig();
const compilerOptions = tsconfig.compilerOptions || {};
const includeValues = Array.isArray(tsconfig.include) ? tsconfig.include : [];
const allowJsDisabled = compilerOptions.allowJs !== true;
const includesViteConfigJs = includeValues.includes("vite.config.js");
const includesViteConfigTs = includeValues.includes("vite.config.ts");
const noImplicitAnyGuardEnabled =
  compilerOptions.noImplicitAny === true || (compilerOptions.strict === true && compilerOptions.noImplicitAny !== false);
const viteConfigFindings = [
  ...(fs.existsSync(viteConfigTsPath)
    ? []
    : [
        {
          expected: true,
          path: toRelative(viteConfigTsPath),
          reason: "Frontend build config must stay in TypeScript after the TSX migration."
        }
      ]),
  ...(fs.existsSync(viteConfigJsPath)
    ? [
        {
          expected: false,
          path: toRelative(viteConfigJsPath),
          reason: "Root vite.config.js would reintroduce untyped frontend build configuration."
        }
      ]
    : [])
];
const typeScriptConfigFindings = [
  ...(allowJsDisabled
    ? []
    : [
        {
          actual: compilerOptions.allowJs,
          expected: false,
          option: "compilerOptions.allowJs",
          path: toRelative(tsconfigPath),
          reason: "Frontend TSX migration should not rely on JavaScript source inclusion."
      }
    ]),
  ...(includesViteConfigTs
    ? []
    : [
        {
          actual: includeValues,
          expected: "vite.config.ts",
          option: "include",
          path: toRelative(tsconfigPath),
          reason: "The typed Vite config must remain covered by npm run typecheck."
        }
      ]),
  ...(!includesViteConfigJs
    ? []
    : [
        {
          actual: includeValues,
          expected: "no vite.config.js",
          option: "include",
          path: toRelative(tsconfigPath),
          reason: "The retired JavaScript Vite config must not be included in frontend typecheck."
        }
      ]),
  ...(noImplicitAnyGuardEnabled
    ? []
    : [
      {
        actual: compilerOptions.noImplicitAny ?? null,
        expected: true,
        option: "compilerOptions.noImplicitAny",
        path: toRelative(tsconfigPath),
        reason: "Frontend TSX migration must keep implicit-any checking enabled."
      }
    ])
];

const report = {
  ok:
    unexpectedJsFiles.length === 0 &&
    typeScriptSuppressions.length === 0 &&
    explicitAnyTypes.length === 0 &&
    viteConfigFindings.length === 0 &&
    typeScriptConfigFindings.length === 0,
  checkedRoot: "src",
  jsFileCount: jsFiles.length,
  unexpectedJsFileCount: unexpectedJsFiles.length,
  unexpectedJsFiles,
  typeScriptSuppressionCount: typeScriptSuppressions.length,
  typeScriptSuppressions,
  explicitAnyCount: explicitAnyTypes.length,
  explicitAnyTypes,
  viteConfig: {
    hasJavaScriptConfig: fs.existsSync(viteConfigJsPath),
    hasTypeScriptConfig: fs.existsSync(viteConfigTsPath)
  },
  viteConfigFindingCount: viteConfigFindings.length,
  viteConfigFindings,
  typeScriptConfig: {
    allowJs: compilerOptions.allowJs ?? null,
    allowJsDisabled,
    include: includeValues,
    includesViteConfigJs,
    includesViteConfigTs,
    noImplicitAny: compilerOptions.noImplicitAny ?? null,
    noImplicitAnyGuardEnabled,
    strict: compilerOptions.strict ?? null
  },
  typeScriptConfigFindingCount: typeScriptConfigFindings.length,
  typeScriptConfigFindings,
  remainingAllowedJsFiles,
  completedAllowedJsFiles,
  allowedJsFiles: Array.from(allowedJsFiles, ([filePath, reason]) => ({ path: filePath, reason })),
  remainingAllowedTypeScriptSuppressions: Array.from(allowedTypeScriptSuppressions, ([filePath, config]) => ({
    path: filePath,
    reason: config.reason || "",
    lines: config.lines || []
  })),
  completedAllowedTypeScriptSuppressions,
  remainingAllowedExplicitAnyTypes: Array.from(allowedExplicitAnyTypes, ([filePath, config]) => ({
    path: filePath,
    reason: config.reason || "",
    lines: config.lines || []
  })),
  completedAllowedExplicitAnyTypes
};

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exit(1);
}
