import fs from "fs";
import os from "os";
import path from "path";
import defaultConfig from "../shared/defaultConfig.js";
import { createCentralProcessor } from "../server/core/centralProcessor.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

const makePagination = (items) => ({
  items,
  pagination: {
    page: 1,
    pageSize: 20,
    totalItems: items.length,
    totalPages: 1
  }
});

const findBulletin = (config, id) =>
  (Array.isArray(config?.safetyBulletins) ? config.safetyBulletins : []).find((item) => item.id === id) || null;

const assert = (condition, message, evidence = {}) => {
  if (condition) return;
  const error = new Error(message);
  error.evidence = evidence;
  throw error;
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mhchub-central-mirror-"));
const dataDir = path.join(tempDir, "data");
const uploadDir = path.join(tempDir, "uploads");
const docsFile = path.join(dataDir, "documents.json");
const configFile = path.join(dataDir, "config.json");

let appConfig = clone(defaultConfig);
const bulletinMap = new Map();
const bulletinLogs = [];

const actorFields = (actor = {}) => ({
  username: actor.username || actor.id || "admin",
  displayName: actor.displayName || actor.username || actor.id || "admin",
  role: actor.role || "admin"
});

const logChange = ({ bulletinId, action, actor, before = null, after = null }) => {
  const safeActor = actorFields(actor);
  bulletinLogs.push({
    id: String(bulletinLogs.length + 1),
    bulletinId,
    action,
    actor: safeActor.username,
    actorName: safeActor.displayName,
    actorRole: safeActor.role,
    before: before ? clone(before) : null,
    after: after ? clone(after) : null,
    createdAt: new Date().toISOString()
  });
};

const configStore = {
  async ensureSchema() {},
  async readConfig() {
    return clone(appConfig);
  },
  async writeConfig(config) {
    appConfig = clone(config);
    return clone(appConfig);
  }
};

const bulletinStore = {
  async ensureSchema() {},
  async countBulletins() {
    return bulletinMap.size;
  },
  async importBulletins(items = []) {
    for (const item of items) {
      bulletinMap.set(item.id, clone(item));
    }
    return items.map(clone);
  },
  async getBulletin(id) {
    return bulletinMap.has(id) ? clone(bulletinMap.get(id)) : null;
  },
  async getBulletins() {
    return makePagination([...bulletinMap.values()].map(clone));
  },
  async addBulletin(bulletin, actor) {
    bulletinMap.set(bulletin.id, clone(bulletin));
    const created = clone(bulletin);
    logChange({ bulletinId: created.id, action: "created", actor, after: created });
    return created;
  },
  async updateBulletin(id, patch, actor) {
    const current = bulletinMap.get(id);
    if (!current) return null;
    const next = { ...current, ...patch, id };
    bulletinMap.set(id, clone(next));
    const updated = clone(next);
    logChange({ bulletinId: id, action: "updated", actor, before: current, after: updated });
    return updated;
  },
  async hideBulletin(id, actor) {
    const current = bulletinMap.get(id);
    if (!current) return null;
    const next = { ...current, published: false };
    bulletinMap.set(id, clone(next));
    const hidden = clone(next);
    logChange({ bulletinId: id, action: "hidden", actor, before: current, after: hidden });
    return hidden;
  },
  async getLogs(id) {
    return makePagination(bulletinLogs.filter((item) => item.bulletinId === id).slice().reverse().map(clone));
  }
};

const core = createCentralProcessor({
  dataDir,
  docsFile,
  configFile,
  uploadDir,
  defaultConfig,
  configStore,
  bulletinStore
});

const readJsonConfig = () => JSON.parse(fs.readFileSync(configFile, "utf8"));

const id = "bulletin-mirror-smoke";
const actor = { username: "mirror-test", displayName: "Mirror Test", role: "admin" };

const created = await core.addSafetyBulletin(
  {
    id,
    date: "2026-06-02",
    tone: "watch",
    title: { vi: "Mirror create", en: "Mirror create", ja: "Mirror create" },
    summary: { vi: "Created", en: "Created", ja: "Created" },
    points: { vi: ["Point 1"], en: ["Point 1"], ja: ["Point 1"] },
    audience: { vi: "EHS", en: "EHS", ja: "EHS" },
    published: true
  },
  actor
);

const afterCreateStore = findBulletin(appConfig, id);
const afterCreateFile = findBulletin(readJsonConfig(), id);

assert(created?.id === id, "Created bulletin was not returned", { created });
assert(afterCreateStore?.points?.vi?.length === 1, "Create did not mirror to config store", { afterCreateStore });
assert(afterCreateFile?.points?.vi?.length === 1, "Create did not mirror to JSON fallback", { afterCreateFile });

const updated = await core.updateSafetyBulletin(
  id,
  {
    summary: { vi: "Updated", en: "Updated", ja: "Updated" },
    points: { vi: ["Point 1", "Point 2"], en: ["Point 1", "Point 2"], ja: ["Point 1", "Point 2"] }
  },
  actor
);

const afterUpdateStore = findBulletin(appConfig, id);
const afterUpdateFile = findBulletin(readJsonConfig(), id);

assert(updated?.points?.vi?.length === 2, "Updated bulletin was not returned", { updated });
assert(
  afterUpdateStore?.points?.vi?.length === 2 && afterUpdateStore?.summary?.vi === "Updated",
  "Update did not mirror to config store",
  { afterUpdateStore }
);
assert(
  afterUpdateFile?.points?.vi?.length === 2 && afterUpdateFile?.summary?.vi === "Updated",
  "Update did not mirror to JSON fallback",
  { afterUpdateFile }
);

const hidden = await core.hideSafetyBulletin(id, actor);
const afterHideStore = findBulletin(appConfig, id);
const afterHideFile = findBulletin(readJsonConfig(), id);

assert(hidden?.published === false, "Hidden bulletin was not returned", { hidden });
assert(afterHideStore?.published === false, "Hide did not mirror to config store", { afterHideStore });
assert(afterHideFile?.published === false, "Hide did not mirror to JSON fallback", { afterHideFile });

const logResult = await core.getSafetyBulletinLogs(id, { page: 1, pageSize: 10 });
const logActions = (logResult.items || []).map((item) => item.action);
const createdLog = (logResult.items || []).find((item) => item.action === "created");
const updatedLog = (logResult.items || []).find((item) => item.action === "updated");
const hiddenLog = (logResult.items || []).find((item) => item.action === "hidden");

assert(logActions.filter((action) => action === "created").length === 1, "Create action was not logged once", { logActions });
assert(logActions.filter((action) => action === "updated").length === 1, "Update action was not logged once", { logActions });
assert(logActions.filter((action) => action === "hidden").length === 1, "Hide action was not logged once", { logActions });
assert(createdLog?.after?.id === id, "Create log does not include after snapshot", { createdLog });
assert(updatedLog?.before?.points?.vi?.length === 1 && updatedLog?.after?.points?.vi?.length === 2, "Update log snapshots are incomplete", { updatedLog });
assert(hiddenLog?.before?.published === true && hiddenLog?.after?.published === false, "Hide log snapshots are incomplete", { hiddenLog });

console.log(
  JSON.stringify(
    {
      ok: true,
      tempDir,
      checks: {
        createMirrors: true,
        createLog: true,
        hideLog: true,
        updateMirrors: true,
        updateLog: true,
        hideMirrors: true
      },
      logActions
    },
    null,
    2
  )
);
