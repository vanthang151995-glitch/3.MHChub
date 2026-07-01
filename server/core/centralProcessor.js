import fs from "fs";
import path from "path";
import { normalizeDocumentPatch, normalizeDocumentTextFields } from "./textEncoding.js";

const asArray = (value) => (Array.isArray(value) ? value : []);

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

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

const asLocalizedText = (value, fallback = "") => {
  if (typeof value === "string") return { vi: value, en: value, ja: value };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      vi: String(value.vi || value.en || fallback),
      en: String(value.en || value.vi || fallback),
      ja: String(value.ja || value.vi || value.en || fallback)
    };
  }
  return { vi: fallback, en: fallback, ja: fallback };
};

const asLocalizedList = (value) => {
  if (Array.isArray(value)) return { vi: value.map(String), en: value.map(String), ja: value.map(String) };
  if (value && typeof value === "object") {
    return {
      vi: asArray(value.vi).map(String),
      en: asArray(value.en || value.vi).map(String),
      ja: asArray(value.ja || value.vi || value.en).map(String)
    };
  }
  return { vi: [], en: [], ja: [] };
};

const normalizeConfig = (input, defaults) => ({
  utilityLinks: asArray(input?.utilityLinks).map((item, index) => ({
    id: item.id || `link-${index + 1}`,
    type: item.type || "gateway",
    title: item.title || { vi: item.name || "Link mới", en: item.name || "New link", ja: item.name || "新規リンク" },
    description: item.description || { vi: "", en: "", ja: "" },
    url: item.url || "",
    health: ["good", "watch", "alert"].includes(item.health) ? item.health : "good"
  })),
  departments: asArray(input?.departments).map((item, index) => ({
    id: item.id || `department-${index + 1}`,
    name: item.name || { vi: "Bộ phận mới", en: "New department", ja: "新規部門" },
    owner: item.owner || "",
    score: Math.max(0, Math.min(100, asNumber(item.score, 0))),
    riskLevel: ["good", "watch", "alert"].includes(item.riskLevel) ? item.riskLevel : "good",
    openActions: Math.max(0, asNumber(item.openActions, 0)),
    trainingRate: Math.max(0, Math.min(100, asNumber(item.trainingRate, 0))),
    risks: item.risks || { vi: [], en: [], ja: [] },
    checklist: item.checklist || { vi: [], en: [], ja: [] }
  })),
  safetyActions: asArray(input?.safetyActions).map((item, index) => ({
    id: item.id || `action-${index + 1}`,
    departmentId: item.departmentId || defaults.departments[0]?.id || "company",
    severity: ["low", "medium", "high"].includes(item.severity) ? item.severity : "medium",
    due: item.due || "",
    title: item.title || { vi: "Hành động mới", en: "New action", ja: "新規アクション" }
  })),
  safetyBulletins: (Array.isArray(input?.safetyBulletins) ? input.safetyBulletins : asArray(defaults?.safetyBulletins)).map((item, index) => ({
    id: item.id || `bulletin-${index + 1}`,
    date: item.date || "",
    tone: ["good", "watch", "alert"].includes(item.tone) ? item.tone : "watch",
    title: asLocalizedText(item.title, "Safety bulletin"),
    summary: asLocalizedText(item.summary, ""),
    points: asLocalizedList(item.points),
    audience: asLocalizedText(item.audience, ""),
    groups: Array.isArray(item.groups) ? item.groups : [],
    documentId: item.documentId || "",
    documentUrl: item.documentUrl || "",
    published: item.published !== false,
    deleted: item.deleted === true,
    deletedBy: item.deletedBy || "",
    deletedByName: item.deletedByName || "",
    deletedByRole: item.deletedByRole || "",
    deletedAt: item.deletedAt || "",
    createdBy: item.createdBy || "",
    createdByName: item.createdByName || "",
    createdByRole: item.createdByRole || "",
    createdAt: item.createdAt || "",
    updatedBy: item.updatedBy || "",
    updatedByName: item.updatedByName || "",
    updatedByRole: item.updatedByRole || "",
    updatedAt: item.updatedAt || ""
  }))
});

const paginate = (items, page = 1, pageSize = 10) => {
  const safePageSize = Math.max(1, Math.min(100, asNumber(pageSize, 10)));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = Math.max(1, Math.min(totalPages, asNumber(page, 1)));
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

const normalizeDocumentKind = (value = "") => {
  const kind = String(value || "").trim().toLowerCase();
  if (!kind || kind === "all" || kind === "tất cả") return "";
  if (kind === "powerpoint") return "slide";
  if (kind === "hình ảnh") return "image";
  return ["excel", "image", "pdf", "slide", "video", "word"].includes(kind) ? kind : "";
};

const documentKindFor = (document = {}) => {
  const source = `${document.mimeType || ""} ${document.title || ""} ${document.originalName || ""} ${document.fileName || ""}`.toLowerCase();
  if (source.includes("pdf") || source.endsWith(".pdf")) return "pdf";
  if (source.includes("spreadsheet") || source.includes("excel") || /\.(xlsx?|csv)$/.test(source)) return "excel";
  if (source.includes("word") || /\.(docx?)$/.test(source)) return "word";
  if (source.includes("image") || /\.(png|jpe?g|gif|webp|svg)$/.test(source)) return "image";
  if (source.includes("video") || /\.(mp4|mov|avi|webm)$/.test(source)) return "video";
  if (source.includes("presentation") || source.includes("powerpoint") || /\.(pptx?)$/.test(source)) return "slide";
  return "default";
};

export const createCentralProcessor = ({
  dataDir,
  docsFile,
  configFile,
  uploadDir,
  defaultConfig,
  documentStore = null,
  configStore = null,
  bulletinStore = null
}) => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });

  if (!fs.existsSync(docsFile)) {
    writeJson(docsFile, []);
  }

  if (!fs.existsSync(configFile)) {
    writeJson(configFile, normalizeConfig(defaultConfig, defaultConfig));
  }

  const readDocuments = () => asArray(readJson(docsFile, [])).map(normalizeDocumentTextFields);
  const writeDocuments = (documents) => writeJson(docsFile, asArray(documents).map(normalizeDocumentTextFields));
  const readJsonConfig = () => normalizeConfig(readJson(configFile, defaultConfig), defaultConfig);
  const writeJsonConfig = (config) => {
    const normalized = normalizeConfig(config, defaultConfig);
    writeJson(configFile, normalized);
    return normalized;
  };
  let documentStoreReady = !!documentStore;
  let documentStoreBootstrap = null;
  let configStoreReady = !!configStore;
  let configStoreBootstrap = null;
  let bulletinStoreReady = !!bulletinStore;
  let bulletinStoreBootstrap = null;

  const mirrorDocument = (document) => {
    const normalizedDocument = normalizeDocumentTextFields(document);
    const documents = readDocuments();
    const index = documents.findIndex((item) => item.id === normalizedDocument.id);
    if (index >= 0) {
      documents[index] = normalizedDocument;
      writeDocuments(documents);
      return;
    }
    writeDocuments([normalizedDocument, ...documents]);
  };

  const removeMirroredDocument = (id) => {
    writeDocuments(readDocuments().filter((item) => item.id !== id));
  };

  const ensureDocumentStore = async () => {
    if (!documentStoreReady) return false;
    if (!documentStoreBootstrap) {
      documentStoreBootstrap = (async () => {
        const existingCount = await documentStore.countDocuments();
        const jsonDocuments = readDocuments();
        if (existingCount === 0 && jsonDocuments.length) {
          await documentStore.importDocuments(jsonDocuments);
        }
      })();
    }

    try {
      await documentStoreBootstrap;
      return true;
    } catch (error) {
      documentStoreReady = false;
      console.warn(`Document store unavailable, using JSON fallback: ${error.message}`);
      return false;
    }
  };

  const ensureConfigStore = async () => {
    if (!configStoreReady) return false;
    if (!configStoreBootstrap) {
      configStoreBootstrap = (async () => {
        await configStore.ensureSchema();
        const storedConfig = await configStore.readConfig();
        if (!storedConfig) {
          await configStore.writeConfig(readJsonConfig(), "bootstrap-json");
          return;
        }
        writeJsonConfig(storedConfig);
      })();
    }

    try {
      await configStoreBootstrap;
      return true;
    } catch (error) {
      configStoreReady = false;
      console.warn(`Config store unavailable, using JSON fallback: ${error.message}`);
      return false;
    }
  };

  const normalizeBulletin = (input, index = 0) =>
    normalizeConfig(
      {
        utilityLinks: [],
        departments: [],
        safetyActions: [],
        safetyBulletins: [input]
      },
      defaultConfig
    ).safetyBulletins[index] || normalizeConfig(defaultConfig, defaultConfig).safetyBulletins[0];

  const normalizeBulletins = (items = []) => asArray(items).map((item) => normalizeBulletin(item));

  const actorFields = (actor = {}) => ({
    username: actor.username || actor.id || "admin",
    displayName: actor.displayName || actor.username || actor.id || "admin",
    role: actor.role || "admin"
  });

  const ensureBulletinStore = async () => {
    if (!bulletinStoreReady) return false;
    if (!bulletinStoreBootstrap) {
      bulletinStoreBootstrap = (async () => {
        await bulletinStore.ensureSchema();
        const existingCount = await bulletinStore.countBulletins({ includeDrafts: true });
        const jsonBulletins = readJsonConfig().safetyBulletins;
        if (existingCount === 0 && jsonBulletins.length) {
          await bulletinStore.importBulletins(jsonBulletins, {
            username: "bootstrap-json",
            displayName: "JSON bootstrap",
            role: "system"
          });
        }
      })();
    }

    try {
      await bulletinStoreBootstrap;
      return true;
    } catch (error) {
      bulletinStoreReady = false;
      console.warn(`Safety bulletin store unavailable, using config fallback: ${error.message}`);
      return false;
    }
  };

  const readConfig = async () => {
    if (await ensureConfigStore()) {
      try {
        const normalized = normalizeConfig(await configStore.readConfig(), defaultConfig);
        writeJsonConfig(normalized);
        return normalized;
      } catch (error) {
        configStoreReady = false;
        console.warn(`Config store read failed, using JSON fallback: ${error.message}`);
      }
    }
    return readJsonConfig();
  };

  const writeConfig = async (config, actor = "system") => {
    const normalized = normalizeConfig(config, defaultConfig);
    if (await ensureConfigStore()) {
      try {
        await configStore.writeConfig(normalized, actor);
        writeJsonConfig(normalized);
        return normalized;
      } catch (error) {
        configStoreReady = false;
        console.warn(`Config store write failed, using JSON fallback: ${error.message}`);
      }
    }
    writeJsonConfig(normalized);
    return normalized;
  };

  const readFallbackBulletins = async ({ includeDrafts = false, includeDeleted = false, page = 1, pageSize = 20 } = {}) => {
    const config = await readConfig();
    const filtered = config.safetyBulletins
      .filter((item) => includeDrafts || item.published !== false)
      .filter((item) => includeDeleted || item.deleted !== true)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    return paginate(filtered, page, pageSize);
  };

  const writeFallbackBulletins = async (items, actor = "admin") => {
    const config = await readConfig();
    await writeConfig({ ...config, safetyBulletins: normalizeBulletins(items) }, actor);
  };

  const mirrorBulletinToFallback = async (bulletin, actor = "admin") => {
    if (!bulletin) return null;
    const normalizedBulletin = normalizeBulletin(bulletin);
    const config = await readConfig();
    const bulletins = Array.isArray(config.safetyBulletins) ? config.safetyBulletins : [];
    let found = false;
    const nextBulletins = bulletins.map((item) => {
      if (item.id !== normalizedBulletin.id) return item;
      found = true;
      return normalizedBulletin;
    });
    if (!found) {
      nextBulletins.unshift(normalizedBulletin);
    }
    await writeConfig({ ...config, safetyBulletins: normalizeBulletins(nextBulletins) }, actor);
    return normalizedBulletin;
  };

  return {
    readConfig,
    writeConfig,
    async getSafetySummary() {
      const config = await readConfig();
      const departments = config.departments;
      const publishedBulletins = await (async () => {
        if (await ensureBulletinStore()) {
          try {
            return bulletinStore.countBulletins({ includeDrafts: false });
          } catch (error) {
            bulletinStoreReady = false;
            console.warn(`Safety bulletin count failed, using config fallback: ${error.message}`);
          }
        }
        return config.safetyBulletins.filter((item) => item.published !== false).length;
      })();
      const averageScore = departments.length
        ? Math.round(departments.reduce((sum, item) => sum + asNumber(item.score, 0), 0) / departments.length)
        : 0;
      const averageTraining = departments.length
        ? Math.round(departments.reduce((sum, item) => sum + asNumber(item.trainingRate, 0), 0) / departments.length)
        : 0;

      return {
        departments: departments.length,
        averageScore,
        averageTraining,
        openActions: departments.reduce((sum, item) => sum + asNumber(item.openActions, 0), 0),
        watchDepartments: departments.filter((item) => item.riskLevel !== "good").length,
        configuredLinks: config.utilityLinks.filter((item) => item.url).length,
        publishedBulletins
      };
    },
    async getSafetyBulletins(query = {}) {
      const includeDrafts = query.includeDrafts === true || query.includeDrafts === "true";
      const includeDeleted = query.includeDeleted === true || query.includeDeleted === "true";
      if (await ensureBulletinStore()) {
        try {
          return bulletinStore.getBulletins({ ...query, includeDrafts, includeDeleted });
        } catch (error) {
          bulletinStoreReady = false;
          console.warn(`Safety bulletin list failed, using config fallback: ${error.message}`);
        }
      }
      return readFallbackBulletins({ ...query, includeDrafts, includeDeleted });
    },
    async getSafetyBulletin(id) {
      if (await ensureBulletinStore()) {
        try {
          return bulletinStore.getBulletin(id);
        } catch (error) {
          bulletinStoreReady = false;
          console.warn(`Safety bulletin read failed, using config fallback: ${error.message}`);
        }
      }
      const config = await readConfig();
      return config.safetyBulletins.find((item) => item.id === id) || null;
    },
    async addSafetyBulletin(input, actor = {}) {
      const safeActor = actorFields(actor);
      const now = new Date().toISOString();
      const bulletin = normalizeBulletin({
        ...input,
        id: input.id || `bulletin-${Date.now()}`,
        createdBy: safeActor.username,
        createdByName: safeActor.displayName,
        createdByRole: safeActor.role,
        createdAt: now,
        updatedBy: safeActor.username,
        updatedByName: safeActor.displayName,
        updatedByRole: safeActor.role,
        updatedAt: now
      });
      if (await ensureBulletinStore()) {
        try {
          const created = await bulletinStore.addBulletin(bulletin, safeActor);
          await mirrorBulletinToFallback(created, safeActor.username);
          return created;
        } catch (error) {
          bulletinStoreReady = false;
          console.warn(`Safety bulletin create failed, using config fallback: ${error.message}`);
        }
      }
      const config = await readConfig();
      await writeFallbackBulletins([bulletin, ...config.safetyBulletins], safeActor.username);
      return bulletin;
    },
    async updateSafetyBulletin(id, input, actor = {}) {
      const safeActor = actorFields(actor);
      const current = await this.getSafetyBulletin(id);
      if (!current) return null;
      const normalizedPatch = normalizeBulletin({ ...current, ...input, id });
      if (await ensureBulletinStore()) {
        try {
          const updated = await bulletinStore.updateBulletin(id, normalizedPatch, safeActor);
          await mirrorBulletinToFallback(updated, safeActor.username);
          return updated;
        } catch (error) {
          bulletinStoreReady = false;
          console.warn(`Safety bulletin update failed, using config fallback: ${error.message}`);
        }
      }
      const config = await readConfig();
      let updated = null;
      const now = new Date().toISOString();
      const nextBulletins = config.safetyBulletins.map((item) => {
        if (item.id !== id) return item;
        updated = normalizeBulletin({
          ...item,
          ...normalizedPatch,
          id,
          createdBy: item.createdBy,
          createdByName: item.createdByName,
          createdByRole: item.createdByRole,
          createdAt: item.createdAt,
          updatedBy: safeActor.username,
          updatedByName: safeActor.displayName,
          updatedByRole: safeActor.role,
          updatedAt: now
        });
        return updated;
      });
      if (!updated) return null;
      await writeFallbackBulletins(nextBulletins, safeActor.username);
      return updated;
    },
    async hideSafetyBulletin(id, actor = {}) {
      const safeActor = actorFields(actor);
      if (await ensureBulletinStore()) {
        try {
          const updated = await bulletinStore.hideBulletin(id, safeActor);
          await mirrorBulletinToFallback(updated, safeActor.username);
          return updated;
        } catch (error) {
          bulletinStoreReady = false;
          console.warn(`Safety bulletin hide failed, using config fallback: ${error.message}`);
        }
      }
      return this.updateSafetyBulletin(id, { published: false }, safeActor);
    },
    async deleteSafetyBulletin(id, actor = {}) {
      const safeActor = actorFields(actor);
      if (await ensureBulletinStore()) {
        try {
          const updated = await bulletinStore.deleteBulletin(id, safeActor);
          await mirrorBulletinToFallback(updated, safeActor.username);
          return updated;
        } catch (error) {
          bulletinStoreReady = false;
          console.warn(`Safety bulletin delete failed, using config fallback: ${error.message}`);
        }
      }
      return this.updateSafetyBulletin(id, {
        deleted: true,
        deletedBy: safeActor.username,
        deletedByName: safeActor.displayName,
        deletedByRole: safeActor.role,
        deletedAt: new Date().toISOString()
      }, safeActor);
    },
    async restoreSafetyBulletin(id, actor = {}) {
      const safeActor = actorFields(actor);
      if (await ensureBulletinStore()) {
        try {
          const updated = await bulletinStore.restoreBulletin(id, safeActor);
          await mirrorBulletinToFallback(updated, safeActor.username);
          return updated;
        } catch (error) {
          bulletinStoreReady = false;
          console.warn(`Safety bulletin restore failed, using config fallback: ${error.message}`);
        }
      }
      return this.updateSafetyBulletin(id, {
        deleted: false,
        deletedBy: "",
        deletedByName: "",
        deletedByRole: "",
        deletedAt: ""
      }, safeActor);
    },
    async getSafetyBulletinLogs(id, query = {}) {
      if (await ensureBulletinStore()) {
        try {
          return bulletinStore.getLogs(id, query);
        } catch (error) {
          bulletinStoreReady = false;
          console.warn(`Safety bulletin logs failed: ${error.message}`);
        }
      }
      return paginate([], query.page, query.pageSize);
    },
    async getDocuments(query = {}) {
      if (await ensureDocumentStore()) {
        return documentStore.getDocuments(query);
      }

      const q = String(query.q || query.search || "").trim().toLowerCase();
      const category = String(query.category || "all");
      const departmentId = String(query.departmentId || "all");
      const fileType = normalizeDocumentKind(query.fileType || query.kind);

      const filtered = readDocuments().filter((document) => {
        const matchesQuery =
          !q ||
          String(document.title || "").toLowerCase().includes(q) ||
          String(document.originalName || "").toLowerCase().includes(q);
        const matchesCategory = category === "all" || document.category === category;
        const matchesDepartment =
          departmentId === "all" || document.departmentId === departmentId || document.departmentId === "company";
        const matchesType = !fileType || documentKindFor(document) === fileType;
        return matchesQuery && matchesCategory && matchesDepartment && matchesType;
      });

      return paginate(filtered, query.page, query.pageSize);
    },
    async getDocumentCount() {
      if (await ensureDocumentStore()) {
        return documentStore.countDocuments();
      }
      return readDocuments().length;
    },
    async getDocument(id) {
      if (await ensureDocumentStore() && typeof documentStore.getDocument === "function") {
        return documentStore.getDocument(id);
      }
      return readDocuments().find((item) => item.id === id) || null;
    },
    async addDocument(document) {
      const normalizedDocument = normalizeDocumentTextFields(document);
      if (await ensureDocumentStore()) {
        const created = await documentStore.addDocument(normalizedDocument);
        mirrorDocument(created);
        return created;
      }

      const documents = readDocuments();
      documents.unshift(normalizedDocument);
      writeDocuments(documents);
      return normalizedDocument;
    },
    async updateDocument(id, updates) {
      const normalizedUpdates = normalizeDocumentPatch(updates);
      if (await ensureDocumentStore()) {
        const updated = await documentStore.updateDocument(id, normalizedUpdates);
        if (updated) mirrorDocument(updated);
        return updated;
      }

      let updated = null;
      const documents = readDocuments().map((item) => {
        if (item.id !== id) return item;
        updated = normalizeDocumentTextFields({ ...item, ...normalizedUpdates, id: item.id });
        return updated;
      });

      if (!updated) return null;
      writeDocuments(documents);
      return updated;
    },
    async deleteDocument(id) {
      if (await ensureDocumentStore()) {
        const target = await documentStore.deleteDocument(id);
        if (target) removeMirroredDocument(id);
        return target;
      }

      const documents = readDocuments();
      const target = documents.find((item) => item.id === id);
      if (!target) return null;

      writeDocuments(documents.filter((item) => item.id !== id));
      return target;
    }
  };
};
