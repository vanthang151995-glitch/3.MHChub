import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const argValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
};
const distDir = path.resolve(rootDir, argValue("--dist") || "dist");
const assetsDir = path.join(distDir, "assets");
const runtimeImageDir = path.join(distDir, "images");
const reportPath = path.resolve(rootDir, argValue("--report") || path.join("qa", "reports", "dist-asset-audit.json"));
const reportsDir = path.dirname(reportPath);
const applyCleanup = process.argv.includes("--apply");
const quiet = process.argv.includes("--quiet");
const strictStale = process.argv.includes("--strict-stale");
const fullStaleList = process.argv.includes("--full-stale-list");

const ensureDir = (directory) => fs.mkdirSync(directory, { recursive: true });
const normalize = (value) => value.replace(/\\/g, "/");
const ensureUnder = (target, parent) => {
  const targetPath = path.resolve(target);
  const parentPath = path.resolve(parent);
  if (targetPath !== parentPath && !targetPath.startsWith(`${parentPath}${path.sep}`)) {
    throw new Error(`Refusing to operate outside expected directory: ${targetPath}`);
  }
};

const check = (name, pass, evidence = {}) => ({
  evidence,
  name,
  pass: Boolean(pass)
});

const listFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  };
  walk(directory);
  return files.sort();
};

const isTextAsset = (filePath) => /\.(?:html|js|mjs|css|json|svg|txt|xml|webmanifest)$/i.test(filePath);
const isCleanableAsset = (filePath) => /\.(?:js|mjs|css)$/i.test(filePath);
const isCleanableRuntimeImage = (filePath) => /\.(?:avif|jpe?g|png|webp)$/i.test(filePath);

const removeFileWithRetry = (filePath) => {
  let lastError = null;

  try {
    if (!fs.existsSync(filePath)) return null;
    try {
      fs.chmodSync(filePath, 0o666);
    } catch {
      // Windows ACLs can deny chmod while still allowing delete.
    }
    fs.unlinkSync(filePath);
    return null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    lastError = error;
  }

  return {
    code: lastError?.code || "UNKNOWN",
    message: lastError?.message || "Unknown cleanup error",
    path: normalize(path.relative(rootDir, filePath))
  };
};

const summarizeCleanupErrors = (items) => {
  const byCode = items.reduce((summary, item) => {
    const code = item.code || "UNKNOWN";
    summary[code] = (summary[code] || 0) + 1;
    return summary;
  }, {});

  return {
    byCode,
    count: items.length,
    sample: items.slice(0, 12)
  };
};

ensureDir(reportsDir);

const checks = [];
const allAssetFiles = listFiles(assetsDir);
const allRuntimeImageFiles = listFiles(runtimeImageDir);
const runtimeFilesByBasename = new Map();
const reachable = new Set();
const scanned = new Set();
const scanQueue = [];

const addRuntimeFile = (filePath) => {
  const basename = path.basename(filePath);
  const items = runtimeFilesByBasename.get(basename) || [];
  items.push(filePath);
  runtimeFilesByBasename.set(basename, items);
};

for (const filePath of [...allAssetFiles, ...allRuntimeImageFiles]) {
  addRuntimeFile(filePath);
}

const enqueue = (filePath) => {
  if (!filePath || reachable.has(filePath)) return;
  reachable.add(filePath);
  if (isTextAsset(filePath)) {
    scanQueue.push(filePath);
  }
};

const rootTextFiles = listFiles(distDir)
  .filter((filePath) => !filePath.startsWith(`${assetsDir}${path.sep}`))
  .filter(isTextAsset);

for (const filePath of rootTextFiles) {
  scanQueue.push(filePath);
}

while (scanQueue.length > 0) {
  const current = scanQueue.shift();
  if (!current || scanned.has(current) || !fs.existsSync(current)) continue;
  scanned.add(current);

  const text = fs.readFileSync(current, "utf8");
  for (const [basename, filePaths] of runtimeFilesByBasename.entries()) {
    if (text.includes(basename)) {
      filePaths.forEach(enqueue);
    }
  }
}

const staleAssetsBeforeCleanup = allAssetFiles
  .filter((filePath) => isCleanableAsset(filePath))
  .filter((filePath) => !reachable.has(filePath));
const staleBytesBeforeCleanup = staleAssetsBeforeCleanup.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
const staleRuntimeImagesBeforeCleanup = allRuntimeImageFiles
  .filter((filePath) => isCleanableRuntimeImage(filePath))
  .filter((filePath) => !reachable.has(filePath));
const staleRuntimeImageBytesBeforeCleanup = staleRuntimeImagesBeforeCleanup.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);

const removedAssets = [];
const removedRuntimeImages = [];
const cleanupErrors = [];
if (applyCleanup && staleAssetsBeforeCleanup.length > 0) {
  for (const filePath of staleAssetsBeforeCleanup) {
    ensureUnder(filePath, assetsDir);
    const cleanupError = removeFileWithRetry(filePath);
    if (cleanupError) {
      cleanupErrors.push(cleanupError);
    } else {
      removedAssets.push(filePath);
    }
  }
}
if (applyCleanup && staleRuntimeImagesBeforeCleanup.length > 0) {
  for (const filePath of staleRuntimeImagesBeforeCleanup) {
    ensureUnder(filePath, runtimeImageDir);
    const cleanupError = removeFileWithRetry(filePath);
    if (cleanupError) {
      cleanupErrors.push(cleanupError);
    } else {
      removedRuntimeImages.push(filePath);
    }
  }
}

const finalAssetFiles = listFiles(assetsDir);
const finalRuntimeImageFiles = listFiles(runtimeImageDir);
const finalCleanableAssets = finalAssetFiles.filter(isCleanableAsset);
const finalReachableAssetFiles = finalAssetFiles.filter((filePath) => reachable.has(filePath));
const finalReachableCleanableAssets = finalReachableAssetFiles.filter(isCleanableAsset);
const staleAssetsAfterCleanup = finalCleanableAssets.filter((filePath) => !reachable.has(filePath));
const finalCleanableRuntimeImages = finalRuntimeImageFiles.filter(isCleanableRuntimeImage);
const finalReachableRuntimeImages = finalRuntimeImageFiles.filter((filePath) => reachable.has(filePath));
const staleRuntimeImagesAfterCleanup = finalCleanableRuntimeImages.filter((filePath) => !reachable.has(filePath));
const finalTotalBytes = finalAssetFiles.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
const finalReachableTotalBytes = finalReachableAssetFiles.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
const finalRuntimeImageTotalBytes = finalRuntimeImageFiles.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
const finalReachableRuntimeImageBytes = finalReachableRuntimeImages.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
const finalLargestAssets = finalReachableAssetFiles
  .map((filePath) => ({
    bytes: fs.statSync(filePath).size,
    path: normalize(path.relative(rootDir, filePath))
  }))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 12);

const duplicateChunkGroups = Object.values(finalReachableCleanableAssets.reduce((groups, filePath) => {
  const basename = path.basename(filePath);
  const ext = path.extname(basename).toLowerCase();
  const stem = basename.replace(/-[A-Za-z0-9_]{6,}\.(?:js|mjs|css)$/i, "");
  const groupKey = `${stem}${ext}`;
  groups[groupKey] = groups[groupKey] || [];
  groups[groupKey].push(normalize(path.relative(rootDir, filePath)));
  return groups;
}, {})).filter((items) => items.length > 1);

const staleRelative = staleAssetsBeforeCleanup.map((filePath) => normalize(path.relative(rootDir, filePath)));
const staleAfterRelative = staleAssetsAfterCleanup.map((filePath) => normalize(path.relative(rootDir, filePath)));
const removedRelative = removedAssets.map((filePath) => normalize(path.relative(rootDir, filePath)));
const staleRuntimeImageRelative = staleRuntimeImagesBeforeCleanup.map((filePath) => normalize(path.relative(rootDir, filePath)));
const staleRuntimeImageAfterRelative = staleRuntimeImagesAfterCleanup.map((filePath) => normalize(path.relative(rootDir, filePath)));
const removedRuntimeImageRelative = removedRuntimeImages.map((filePath) => normalize(path.relative(rootDir, filePath)));
const staleBytesAfterCleanup = staleAssetsAfterCleanup.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
const staleRuntimeImageBytesAfterCleanup = staleRuntimeImagesAfterCleanup.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
const staleSampleBeforeCleanup = staleRelative.slice(0, 12);
const staleSampleAfterCleanup = staleAfterRelative.slice(0, 12);
const staleListBeforeCleanup = fullStaleList ? staleRelative : staleSampleBeforeCleanup;
const staleListAfterCleanup = fullStaleList ? staleAfterRelative : staleSampleAfterCleanup;
const staleRuntimeImageListBeforeCleanup = fullStaleList ? staleRuntimeImageRelative : staleRuntimeImageRelative.slice(0, 12);
const staleRuntimeImageListAfterCleanup = fullStaleList ? staleRuntimeImageAfterRelative : staleRuntimeImageAfterRelative.slice(0, 12);
const cleanupErrorSummary = summarizeCleanupErrors(cleanupErrors);
const runtimeImageRelativePrefix = `${normalize(path.relative(rootDir, runtimeImageDir))}/`;
const runtimeCleanupErrors = cleanupErrors.filter((item) => String(item.path || "").startsWith(runtimeImageRelativePrefix));
const runtimeCleanupErrorSummary = summarizeCleanupErrors(runtimeCleanupErrors);
const totalStaleCleanableBeforeCleanup = staleAssetsBeforeCleanup.length + staleRuntimeImagesBeforeCleanup.length;
const totalRemovedCleanableAssets = removedAssets.length + removedRuntimeImages.length;
const cleanupBlockedByOsPermissions = applyCleanup
  && totalStaleCleanableBeforeCleanup > 0
  && totalRemovedCleanableAssets === 0
  && cleanupErrors.length === totalStaleCleanableBeforeCleanup
  && Object.keys(cleanupErrorSummary.byCode).length === 1
  && cleanupErrorSummary.byCode.EPERM === cleanupErrors.length;
const runtimeCleanupBlockedByOsPermissions = applyCleanup
  && staleRuntimeImagesBeforeCleanup.length > 0
  && removedRuntimeImages.length === 0
  && runtimeCleanupErrors.length === staleRuntimeImagesBeforeCleanup.length
  && Object.keys(runtimeCleanupErrorSummary.byCode).length === 1
  && runtimeCleanupErrorSummary.byCode.EPERM === runtimeCleanupErrors.length;
const cleanupOutcome = !applyCleanup
  ? "not-attempted"
  : staleAssetsAfterCleanup.length === 0
    ? "clean"
    : cleanupBlockedByOsPermissions
      ? "blocked-by-os-permissions"
      : "partial-or-unclassified";
const warnings = [];

if (staleAfterRelative.length > 0) {
  warnings.push({
    cleanupBlockedByOsPermissions,
    cleanupErrorCount: cleanupErrors.length,
    cleanupErrorCodes: cleanupErrorSummary.byCode,
    cleanupAttempted: applyCleanup,
    cleanupOutcome,
    name: "dist-stale-cleanable-assets-retained",
    reason: strictStale
      ? "Stale generated JS/CSS assets remain after cleanup."
      : "Stale generated JS/CSS assets remain on disk but are not referenced by the current app shell.",
    staleAssets: staleListAfterCleanup,
    staleAssetsOmitted: Math.max(0, staleAfterRelative.length - staleListAfterCleanup.length),
    staleBytes: staleBytesAfterCleanup,
    staleCount: staleAfterRelative.length,
    suggestedAction: cleanupBlockedByOsPermissions
      ? "Windows denied deletion for every stale asset with EPERM. Clean dist/assets from an elevated Administrator shell if local disk hygiene matters; current app shell does not reference these stale files."
      : cleanupErrors.length > 0
      ? "Cleanup was attempted but Windows denied deletion. Clean dist/assets with elevated permissions if local disk hygiene matters; current app shell does not reference these stale files."
      : "Run a strict package audit or clean dist/assets with elevated permissions if local disk hygiene matters; current app shell does not reference these stale files."
  });
}
if (staleRuntimeImageAfterRelative.length > 0) {
  warnings.push({
    cleanupAttempted: applyCleanup,
    cleanupBlockedByOsPermissions: runtimeCleanupBlockedByOsPermissions,
    cleanupErrorCount: runtimeCleanupErrors.length,
    cleanupErrorCodes: runtimeCleanupErrorSummary.byCode,
    name: "dist-unreferenced-runtime-images-retained",
    reason: "Generated dist/images contains raster images that are not referenced by the current app shell.",
    staleAssets: staleRuntimeImageListAfterCleanup,
    staleAssetsOmitted: Math.max(0, staleRuntimeImageAfterRelative.length - staleRuntimeImageListAfterCleanup.length),
    staleBytes: staleRuntimeImageBytesAfterCleanup,
    staleCount: staleRuntimeImageAfterRelative.length,
    suggestedAction: runtimeCleanupErrors.length > 0
      ? "Cleanup was attempted but Windows denied deletion for one or more dist/images files. Source copies have been moved out of public/images; clean dist/images from an elevated Administrator shell if local disk hygiene matters. The current app shell does not reference these files."
      : applyCleanup
      ? "These images are not referenced by the current app shell. Source copies should stay outside public/images; clean dist/images if local disk hygiene matters."
      : "Run npm run build so audit-dist-assets can prune unreferenced runtime images from dist/images."
  });
}

checks.push(check("dist-index-html-exists", fs.existsSync(path.join(distDir, "index.html")), {}));
checks.push(check("dist-assets-directory-exists", fs.existsSync(assetsDir), {}));
checks.push(check("dist-assets-reachable-count-nonzero", reachable.size > 0, {
  reachableCount: reachable.size,
  scannedCount: scanned.size
}));
checks.push(check("dist-unreferenced-runtime-images-clean", strictStale ? staleRuntimeImagesAfterCleanup.length === 0 : true, {
  applyCleanup,
  cleanupErrors: runtimeCleanupErrors.slice(0, 6),
  cleanupErrorCount: runtimeCleanupErrors.length,
  removedCount: removedRuntimeImageRelative.length,
  removedImages: removedRuntimeImageRelative.slice(0, 12),
  staleImages: applyCleanup ? staleRuntimeImageListAfterCleanup : staleRuntimeImageListBeforeCleanup,
  staleImagesOmitted: Math.max(0, (applyCleanup ? staleRuntimeImageAfterRelative : staleRuntimeImageRelative).length - (applyCleanup ? staleRuntimeImageListAfterCleanup : staleRuntimeImageListBeforeCleanup).length),
  staleImageBytes: applyCleanup ? staleRuntimeImageBytesAfterCleanup : staleRuntimeImageBytesBeforeCleanup,
  staleImageBytesBeforeCleanup: staleRuntimeImageBytesBeforeCleanup,
  staleImageCount: applyCleanup ? staleRuntimeImageAfterRelative.length : staleRuntimeImageRelative.length,
  staleImageCountBeforeCleanup: staleRuntimeImageRelative.length
}));
checks.push(check("dist-stale-assets-clean", strictStale ? staleAssetsAfterCleanup.length === 0 : true, {
  applyCleanup,
  cleanupErrors: cleanupErrors.slice(0, 6),
  cleanupErrorCount: cleanupErrors.length,
  removedCount: removedAssets.length,
  staleAssets: applyCleanup ? staleListAfterCleanup : staleListBeforeCleanup,
  staleAssetsOmitted: Math.max(0, (applyCleanup ? staleAfterRelative : staleRelative).length - (applyCleanup ? staleListAfterCleanup : staleListBeforeCleanup).length),
  staleBytes: applyCleanup ? staleBytesAfterCleanup : staleBytesBeforeCleanup,
  staleBytesBeforeCleanup,
  staleCount: applyCleanup ? staleAfterRelative.length : staleRelative.length,
  staleCountBeforeCleanup: staleRelative.length
}));
checks.push(check("dist-cleanable-duplicate-chunk-groups-none", duplicateChunkGroups.length === 0, {
  duplicateChunkGroups: duplicateChunkGroups.slice(0, 20),
  duplicateGroupCount: duplicateChunkGroups.length
}));
checks.push(check("dist-reachable-assets-total-budget", finalReachableTotalBytes <= 10 * 1024 * 1024, {
  budgetBytes: 10 * 1024 * 1024,
  reachableTotalBytes: finalReachableTotalBytes,
  totalBytesOnDisk: finalTotalBytes
}));
checks.push(check("dist-largest-runtime-asset-budget", finalLargestAssets.every((item) => item.bytes <= 2.4 * 1024 * 1024), {
  budgetBytes: Math.round(2.4 * 1024 * 1024),
  largestAssets: finalLargestAssets
}));

const failedChecks = checks.filter((item) => !item.pass);
const report = {
  applyCleanup,
  cleanupBlockedByOsPermissions,
  distDir: normalize(path.relative(rootDir, distDir)) || ".",
  failedChecks,
  fullStaleList,
  generatedAtUtc: new Date().toISOString(),
  ok: failedChecks.length === 0,
  cleanupErrorCount: cleanupErrors.length,
  cleanupErrors: cleanupErrorSummary.sample,
  cleanupErrorsOmitted: Math.max(0, cleanupErrors.length - cleanupErrorSummary.sample.length),
  cleanupErrorSummary,
  cleanupOutcome,
  removedAssets: removedRelative,
  removedRuntimeImages: removedRuntimeImageRelative,
  strictStale,
  staleAssets: fullStaleList ? staleAfterRelative : undefined,
  staleRuntimeImages: fullStaleList ? staleRuntimeImageAfterRelative : undefined,
  summary: {
    failed: failedChecks.length,
    passed: checks.length - failedChecks.length,
    total: checks.length,
    warnings: warnings.length
  },
  totals: {
    assetCount: finalAssetFiles.length,
    cleanableAssetCount: finalCleanableAssets.length,
    reachableAssetCount: finalReachableAssetFiles.length,
    reachableCleanableAssetCount: finalReachableCleanableAssets.length,
    reachableTotalBytes: finalReachableTotalBytes,
    reachableRuntimeImageBytes: finalReachableRuntimeImageBytes,
    reachableRuntimeImageCount: finalReachableRuntimeImages.length,
    runtimeImageCount: finalRuntimeImageFiles.length,
    runtimeImageTotalBytes: finalRuntimeImageTotalBytes,
    staleBytes: staleBytesAfterCleanup,
    staleCleanableAssetCount: staleAssetsAfterCleanup.length,
    staleRuntimeImageBytes: staleRuntimeImageBytesAfterCleanup,
    staleRuntimeImageCount: staleRuntimeImagesAfterCleanup.length,
    totalBytes: finalTotalBytes
  },
  warnings,
  checks
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!quiet) {
  console.log(JSON.stringify({
    applyCleanup,
    failedChecks,
    ok: report.ok,
    cleanupOutcome,
    cleanupErrorCount: cleanupErrors.length,
    removedCount: removedRelative.length,
    removedRuntimeImageCount: removedRuntimeImageRelative.length,
    reportPath,
    staleCount: strictStale ? staleAfterRelative.length : staleRelative.length,
    staleRuntimeImageCount: applyCleanup ? staleRuntimeImageAfterRelative.length : staleRuntimeImageRelative.length,
    summary: report.summary,
    runtimeImageTotalBytes: finalRuntimeImageTotalBytes,
    totalBytes: finalTotalBytes,
    warningCount: warnings.length
  }, null, 2));
}

if (!report.ok) process.exit(1);
