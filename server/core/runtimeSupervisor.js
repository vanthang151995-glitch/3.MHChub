import fs from "fs";
import os from "os";
import path from "path";

const readJson = (filePath, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
};

const writeJson = (filePath, value) => {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
};

const fileInfo = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return { exists: false, bytes: 0, updatedAt: null };
  }

  const stat = fs.statSync(filePath);
  return {
    exists: true,
    bytes: stat.size,
    updatedAt: stat.mtime.toISOString()
  };
};

const isInside = (parent, child) => {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const normalizeBackupPath = (value) => String(value || "").replace(/\\/g, "/");

const copyBackupFile = ({ name, source, targetDir }) => {
  if (!fs.existsSync(source)) return null;
  const stat = fs.statSync(source);
  if (!stat.isFile()) return null;

  const target = path.join(targetDir, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);

  return {
    name,
    type: "file",
    files: 1,
    bytes: stat.size
  };
};

const copyBackupDirectory = ({ name, source, targetDir }) => {
  if (!source || !fs.existsSync(source)) return null;
  const stat = fs.statSync(source);
  if (!stat.isDirectory()) return null;

  const targetRoot = path.join(targetDir, name);
  if (isInside(source, targetRoot)) {
    throw new Error(`Backup target cannot be inside source directory: ${source}`);
  }

  const detail = {
    name: `${normalizeBackupPath(name).replace(/\/+$/g, "")}/`,
    type: "directory",
    files: 0,
    bytes: 0,
    skipped: 0
  };

  const walk = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const sourcePath = path.join(currentDir, entry.name);
      const relativePath = path.relative(source, sourcePath);
      const targetPath = path.join(targetRoot, relativePath);

      if (entry.isDirectory()) {
        fs.mkdirSync(targetPath, { recursive: true });
        walk(sourcePath);
        continue;
      }

      if (!entry.isFile()) {
        detail.skipped += 1;
        continue;
      }

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
      const fileStat = fs.statSync(sourcePath);
      detail.files += 1;
      detail.bytes += fileStat.size;
    }
  };

  fs.mkdirSync(targetRoot, { recursive: true });
  walk(source);
  return detail;
};

const paginate = (items, page = 1, pageSize = 20) => {
  const safePageSize = Math.max(1, Math.min(100, Number(pageSize) || 20));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = Math.max(1, Math.min(totalPages, Number(page) || 1));
  const start = (currentPage - 1) * safePageSize;

  return {
    items: items.slice(start, start + safePageSize),
    pagination: {
      page: currentPage,
      pageSize: safePageSize,
      totalItems,
      totalPages
    }
  };
};

export const createRuntimeSupervisor = ({
  activityFile,
  backupDir,
  configFile,
  docsFile,
  previewDir = null,
  uploadDir,
  activityLimit = 500
}) => {
  fs.mkdirSync(path.dirname(activityFile), { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  const safeActivityLimit = Math.max(100, Math.min(5000, Number(activityLimit) || 500));

  if (!fs.existsSync(activityFile)) {
    writeJson(activityFile, []);
  }

  const readActivityRaw = () => {
    const value = readJson(activityFile, []);
    return Array.isArray(value) ? value : [];
  };

  const logActivity = ({ type, message, level = "info", actor = "system", target = "", metadata = {} }) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ts: new Date().toISOString(),
      type,
      level,
      actor,
      target,
      message,
      metadata
    };

    writeJson(activityFile, [entry, ...readActivityRaw()].slice(0, safeActivityLimit));
    return entry;
  };

  const createBackup = (reason = "manual") => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const targetDir = path.join(backupDir, stamp);
    fs.mkdirSync(targetDir, { recursive: true });

    const details = [
      copyBackupFile({ name: "config.json", source: configFile, targetDir }),
      copyBackupFile({ name: "documents.json", source: docsFile, targetDir }),
      copyBackupDirectory({ name: "uploads", source: uploadDir, targetDir }),
      copyBackupDirectory({ name: "previews", source: previewDir, targetDir })
    ].filter(Boolean);
    const copied = details.map((item) => item.name);

    const manifest = {
      id: stamp,
      reason,
      createdAt: new Date().toISOString(),
      copied,
      details
    };
    writeJson(path.join(targetDir, "manifest.json"), manifest);
    logActivity({
      type: "backup.created",
      message: `Runtime backup created (${reason})`,
      target: stamp,
      metadata: { copied }
    });
    return manifest;
  };

  const listBackups = () => {
    if (!fs.existsSync(backupDir)) return [];
    return fs
      .readdirSync(backupDir, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => {
        const manifestPath = path.join(backupDir, item.name, "manifest.json");
        return readJson(manifestPath, { id: item.name, createdAt: null, copied: [] });
      })
      .sort((a, b) => String(b.createdAt || b.id).localeCompare(String(a.createdAt || a.id)));
  };

  const getStatus = ({ summary, config, documentCount = null, environment = {} }) => {
    const docs = readJson(docsFile, []);
    const files = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : [];
    const previewFiles = previewDir && fs.existsSync(previewDir) ? fs.readdirSync(previewDir) : [];
    const memory = process.memoryUsage();
    const checks = [
      { id: "config", label: "config.json", ok: fs.existsSync(configFile) },
      { id: "documents", label: "documents.json", ok: fs.existsSync(docsFile) },
      { id: "uploads", label: "uploads/", ok: fs.existsSync(uploadDir) },
      { id: "previews", label: "previews/", ok: !previewDir || fs.existsSync(previewDir) },
      { id: "legacy-admin-pin", label: "Legacy ADMIN_PIN", ok: !environment.enableLegacyAdminPin || !environment.usesDefaultAdminPin },
      { id: "admin-password", label: "ADMIN_PASSWORD", ok: !environment.usesPlaceholderAdminPassword },
      { id: "cors", label: "ALLOWED_ORIGINS", ok: environment.allowedOrigins?.length > 0 }
    ];
    const readiness = {
      ready: checks.every((item) => item.ok),
      checks
    };
    const warnings = readiness.checks
      .filter((item) => !item.ok)
      .map((item) => `${item.label} needs attention`);

    return {
      service: "Company Utility Hub",
      status: "online",
      environment,
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      host: {
        name: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        cpus: os.cpus().length,
        memoryTotalMb: Math.round(os.totalmem() / 1024 / 1024),
        memoryFreeMb: Math.round(os.freemem() / 1024 / 1024)
      },
      process: {
        pid: process.pid,
        rssMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024)
      },
      runtimeFiles: {
        config: fileInfo(configFile),
        documents: fileInfo(docsFile),
        uploads: { exists: fs.existsSync(uploadDir), count: files.length },
        previews: { exists: !previewDir ? false : fs.existsSync(previewDir), count: previewFiles.length }
      },
      counts: {
        utilityLinks: config.utilityLinks.length,
        departments: config.departments.length,
        safetyActions: config.safetyActions.length,
        safetyBulletins: summary?.publishedBulletins ?? config.safetyBulletins?.length ?? 0,
        documents: Number.isFinite(Number(documentCount)) ? Number(documentCount) : Array.isArray(docs) ? docs.length : 0,
        uploadedFiles: files.length,
        previewFiles: previewFiles.length,
        backups: listBackups().length
      },
      readiness,
      warnings,
      summary
    };
  };

  return {
    createBackup,
    getStatus,
    listBackups,
    logActivity,
    readActivity(query = {}) {
      return paginate(readActivityRaw(), query.page, query.pageSize);
    }
  };
};
