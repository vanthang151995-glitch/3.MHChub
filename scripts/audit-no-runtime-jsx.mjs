import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const reportsDir = path.join(rootDir, "qa", "reports");
const reportPath = path.join(reportsDir, "no-runtime-jsx-audit.json");
const scannedExtensions = new Set([".css", ".js", ".ts", ".tsx"]);
const ignoredDirectoryNames = new Set([".git", "backups", "dist", "node_modules", "output"]);

const toRelative = (filePath) => path.relative(rootDir, filePath).replace(/\\/g, "/");

const walk = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectoryNames.has(entry.name)) return [];
      return walk(fullPath);
    }
    return [fullPath];
  });
};

const discoverExtractedSourceRoots = () => {
  const extractedRoot = path.join(rootDir, "new");
  const sourceRoots = [];

  const visit = (dir) => {
    if (!fs.existsSync(dir)) return;

    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      if (!entry.isDirectory() || ignoredDirectoryNames.has(entry.name)) return;

      const fullPath = path.join(dir, entry.name);
      const isPackageSourceRoot =
        entry.name === "src" && fs.existsSync(path.join(path.dirname(fullPath), "package.json"));

      if (isPackageSourceRoot) {
        sourceRoots.push(fullPath);
        return;
      }

      visit(fullPath);
    });
  };

  visit(extractedRoot);
  return sourceRoots;
};

const discoverPackagedSourceRoots = () => {
  const packagesRoot = path.join(rootDir, "output", "packages");
  if (!fs.existsSync(packagesRoot)) return [];

  return fs
    .readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesRoot, entry.name))
    .filter((packageRoot) => fs.existsSync(path.join(packageRoot, "package.json")))
    .map((packageRoot) => path.join(packageRoot, "src"))
    .filter((sourceRoot) => fs.existsSync(sourceRoot));
};

const sourceRoots = Array.from(
  new Set([path.join(rootDir, "src"), ...discoverExtractedSourceRoots(), ...discoverPackagedSourceRoots()])
);
const checkedRoots = sourceRoots.map(toRelative).sort();
const files = sourceRoots.flatMap(walk);
const jsxFiles = files
  .filter((filePath) => path.extname(filePath).toLowerCase() === ".jsx")
  .map(toRelative)
  .sort();

const jsxReferences = files
  .filter((filePath) => scannedExtensions.has(path.extname(filePath).toLowerCase()))
  .flatMap((filePath) => {
    const text = fs.readFileSync(filePath, "utf8");
    return text
      .split(/\r?\n/)
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter(({ line }) => line.includes(".jsx"))
      .map(({ line, lineNumber }) => ({
        line: line.trim(),
        lineNumber,
        path: toRelative(filePath)
      }));
  });

const report = {
  ok: jsxFiles.length === 0 && jsxReferences.length === 0,
  checkedRoot: checkedRoots.join(", "),
  checkedRoots,
  jsxFileCount: jsxFiles.length,
  jsxFiles,
  jsxReferenceCount: jsxReferences.length,
  jsxReferences,
  scannedExtensions: Array.from(scannedExtensions).sort()
};

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exit(1);
}
