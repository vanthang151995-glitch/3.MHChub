import crypto from "crypto";
import fs from "fs";
import path from "path";
import { DAILY_DEPARTMENT_CHECKLIST, normalizeChecklistResult } from "./safetyChecklistTemplate.js";

const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const codeStamp = () => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
};
const generateCode = (prefix) => `${prefix}-${codeStamp()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
const nowIso = () => new Date().toISOString();
const toDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const direct = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};
const text = (value, fallback = "") => {
  const safe = String(value ?? "").trim();
  return safe || fallback;
};
const actorFields = (actor = {}) => ({
  id: actor.id || actor.userId || actor.username || null,
  username: actor.username || actor.id || "system",
  displayName: actor.displayName || actor.username || actor.id || "system",
  role: actor.role || "viewer",
  departmentId: actor.departmentId || actor.department_id || ""
});

const EMPTY_DATA = {
  warnings: [],
  incidents: [],
  kpiEntries: [],
  checklistSubmissions: [],
  reports: [],
  trainingCourses: [],
  inspectionPlans: [],
  safetyMeetings: [],
  notifications: [],
  profiles: {},
  activityLog: []
};

export function createJsonSafetyOperationsStore({ rootDir, archStore } = {}) {
  const dataFile = path.join(rootDir, "server", "data", "safety-operations.json");

  const load = () => {
    try {
      if (fs.existsSync(dataFile)) {
        return { ...EMPTY_DATA, ...JSON.parse(fs.readFileSync(dataFile, "utf8")) };
      }
    } catch {}
    return { ...EMPTY_DATA };
  };

  const save = (data) => {
    try {
      const dir = path.dirname(dataFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf8");
    } catch (err) {
      console.error("[jsonSafetyOperationsStore] save error:", err.message);
    }
  };

  const filterList = (items = [], query = {}) => {
    let result = items.filter((item) => !item.deletedAt);
    if (query.dept || query.department) {
      const dept = String(query.dept || query.department);
      result = result.filter((item) => item.department === dept || item.departmentCode === dept);
    }
    if (query.status) result = result.filter((item) => item.status === query.status);
    if (query.period) result = result.filter((item) => item.period === query.period);
    if (query.approvalStatus || query.approval_status) {
      const s = query.approvalStatus || query.approval_status;
      result = result.filter((item) => item.approvalStatus === s);
    }
    if (query.statusOrApproval || query.status_or_approval) {
      const s = String(query.statusOrApproval || query.status_or_approval);
      result = result.filter((item) => item.status === s || item.approvalStatus === s);
    }
    if (query.category) result = result.filter((item) => item.category === query.category);
    if (query.riskLevel || query.risk_level) {
      const rl = String(query.riskLevel || query.risk_level);
      result = result.filter((item) => item.riskLevel === rl);
    }
    if (query.type) result = result.filter((item) => item.type === query.type);
    if (query.severity) result = result.filter((item) => item.severity === query.severity);
    if (query.search || query.q) {
      const q = String(query.search || query.q).toLowerCase();
      result = result.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
    }
    result = result.slice().reverse();
    const limit = Math.max(1, Math.min(500, Number(query.limit) || 100));
    return { items: result.slice(0, limit), total: result.length };
  };

  const logActivity = (data, entry) => {
    if (!data.activityLog) data.activityLog = [];
    data.activityLog.unshift({ ...entry, createdAt: nowIso() });
    if (data.activityLog.length > 200) data.activityLog = data.activityLog.slice(0, 200);
  };

  const warningCategoryToTopic = (category = "") => {
    const c = String(category).toUpperCase();
    if (c.includes("FIRE") || c.includes("PCCC"))          return "pccc";
    if (c.includes("CHEM") || c.includes("HOA_CHAT"))      return "hoa_chat";
    if (c.includes("ELEC") || c.includes("DIEN"))          return "dien";
    if (c.includes("MACHINE") || c.includes("MAY"))        return "may_moc";
    if (c.includes("HEIGHT") || c.includes("CAO"))         return "tren_cao";
    if (c.includes("PPE") || c.includes("BAO_HO"))         return "ppe";
    if (c.includes("ERGO"))                                 return "ergonomics";
    if (c.includes("HYGIENE") || c.includes("VE_SINH") || c.includes("ENVIRONMENT")) return "ve_sinh";
    if (c.includes("6S") || c.includes("5S"))               return "6s";
    return "khac";
  };

  /* Map warning.category → CAPA problemType (taxonomy v1, 25/06/2026) */
  const warningCategoryToProblemType = (category = "") => {
    const c = String(category).toUpperCase();
    const exact = {
      EQUIPMENT: "MACH", ELECTRICAL: "ELEC", CHEMICALS: "CHEM",
      HEIGHT: "HEIGHT", VEHICLE: "VEHICLE", PPE_ISSUE: "PPE",
      HUMAN_BEHAVIOR: "BEHAV", NEAR_MISS: "NEAR", FIRE_SAFETY: "FIRE",
      ENVIRONMENT: "ENV", HOUSEKEEPING: "6S", ENERGY: "ENRG",
      ERGONOMICS: "BEHAV",
    };
    if (exact[c]) return exact[c];
    // Legacy fallbacks
    if (c.includes("FIRE") || c.includes("PCCC"))        return "FIRE";
    if (c.includes("CHEM") || c.includes("HOA_CHAT"))    return "CHEM";
    if (c.includes("ELEC") || c.includes("DIEN"))        return "ELEC";
    if (c.includes("MACHINE") || c.includes("MAY"))      return "MACH";
    if (c.includes("HEIGHT") || c.includes("CAO"))       return "HEIGHT";
    if (c.includes("PPE") || c.includes("BAO_HO"))       return "PPE";
    if (c.includes("ERGO"))                              return "BEHAV";
    if (c.includes("HYGIENE") || c.includes("VE_SINH")) return "6S";
    if (c.includes("6S") || c.includes("5S"))            return "6S";
    return null;
  };

  return {
    async listWarnings(query = {}) {
      const data = load();
      return filterList(data.warnings || [], query);
    },
    async getWarning(id) {
      const data = load();
      return (data.warnings || []).find((w) => w.id === id && !w.deletedAt) || null;
    },
    async deleteWarning(id, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.warnings || []).findIndex((w) => w.id === id && !w.deletedAt);
      if (idx === -1) return null;
      data.warnings[idx] = { ...data.warnings[idx], deletedAt: nowIso(), updatedAt: nowIso(), deletedByName: safeActor.displayName, updatedByName: safeActor.displayName };
      save(data);
      return { ok: true, id };
    },
    async createWarning(input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const now = nowIso();
      const probability = Math.max(1, Math.min(5, Number(input.riskProbability ?? input.risk_probability) || 1));
      const consequence = Math.max(1, Math.min(5, Number(input.riskConsequence ?? input.risk_consequence) || 1));
      const score = probability * consequence;
      const riskLevel = score >= 15 ? "CRITICAL" : score >= 8 ? "HIGH" : score >= 4 ? "MEDIUM" : "LOW";
      const code = text(input.code, generateCode("WARN"));
      const item = {
        id: input.id || newId("warning"),
        code,
        title: text(input.title, "Cảnh báo mới"),
        category: text(input.category, "ENVIRONMENT"),
        subcategory: input.subcategory || null,
        department: text(input.department, safeActor.departmentId || "company"),
        area: input.area || null,
        riskProbability: probability,
        riskConsequence: consequence,
        riskScore: score,
        riskLevel: text(input.riskLevel, riskLevel),
        description: input.description || input.title || "Cảnh báo mới",
        currentControl: input.currentControl || null,
        proposedAction: input.proposedAction || null,
        responsiblePerson: input.responsiblePerson || null,
        deadline: toDateOnly(input.deadline),
        reporterName: input.reporterName || safeActor.displayName || null,
        evidenceNotes: input.evidenceNotes || null,
        relatedStandard: input.relatedStandard || null,
        status: text(input.status, "OPEN"),
        approvalStatus: text(input.approvalStatus, "PENDING"),
        rejectionReason: null,
        submittedByDept: input.submittedByDept || safeActor.departmentId || null,
        submittedById: input.submittedById || safeActor.id || null,
        submittedByName: input.submittedByName || safeActor.displayName || null,
        productionLine: input.productionLine || null,
        machineName: input.machineName || null,
        locationDetail: input.locationDetail || null,
        detectedAt: input.detectedAt || null,
        coordinator: input.coordinator || null,
        additionalNotes: input.additionalNotes || null,
        createdByName: safeActor.displayName,
        updatedByName: safeActor.displayName,
        createdAt: now,
        updatedAt: now
      };
      data.warnings = [...(data.warnings || []), item];
      logActivity(data, { type: "warning", entityCode: code, action: "created", actorName: safeActor.displayName });
      save(data);
      if (archStore && item.proposedAction?.trim() && item.responsiblePerson?.trim() && item.deadline) {
        try {
          const capa = await archStore.createAction({
            title: `[Cảnh báo] ${item.title}`,
            description: item.proposedAction || item.description || item.title,
            sourceType: "warning",
            sourceId: item.id,
            sourceCode: item.code,
            departmentCode: item.department,
            area: item.area || item.locationDetail || null,
            ownerName: item.responsiblePerson,
            dueDate: item.deadline,
            priority: (item.riskLevel === "HIGH" || item.riskLevel === "CRITICAL") ? "high" : (item.riskLevel === "LOW" ? "low" : "medium"),
            status: "open",
            topic: warningCategoryToTopic(item.category),
            problemType: warningCategoryToProblemType(item.category),
          }, actor);
          const data2 = load();
          const idx2 = (data2.warnings || []).findIndex((w) => w.id === item.id);
          if (idx2 !== -1) {
            data2.warnings[idx2] = { ...data2.warnings[idx2], capaId: capa.id, capaCode: capa.code };
            save(data2);
            return data2.warnings[idx2];
          }
        } catch (e) {
          console.error("[auto-capa] warning create trigger failed:", e.message);
        }
      }
      return item;
    },
    async updateWarning(id, input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.warnings || []).findIndex((w) => w.id === id && !w.deletedAt);
      if (idx === -1) return null;
      const current = data.warnings[idx];
      const updated = { ...current, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)), updatedByName: safeActor.displayName, updatedAt: nowIso() };
      data.warnings[idx] = updated;
      logActivity(data, { type: "warning", entityCode: current.code, action: "updated", actorName: safeActor.displayName });
      save(data);
      if (
        archStore &&
        !current.capaId &&
        updated.proposedAction?.trim() &&
        updated.responsiblePerson?.trim() &&
        updated.deadline
      ) {
        try {
          const capa = await archStore.createAction({
            title: `[Cảnh báo] ${updated.title}`,
            description: updated.proposedAction || updated.description || updated.title,
            sourceType: "warning",
            sourceId: updated.id,
            sourceCode: updated.code,
            departmentCode: updated.department,
            area: updated.area || updated.locationDetail || null,
            ownerName: updated.responsiblePerson,
            dueDate: updated.deadline,
            priority: (updated.riskLevel === "HIGH" || updated.riskLevel === "CRITICAL") ? "high" : (updated.riskLevel === "LOW" ? "low" : "medium"),
            status: "open",
            topic: warningCategoryToTopic(updated.category),
            problemType: warningCategoryToProblemType(updated.category),
          }, actor);
          const data2 = load();
          const idx2 = (data2.warnings || []).findIndex((w) => w.id === id);
          if (idx2 !== -1) {
            data2.warnings[idx2] = { ...data2.warnings[idx2], capaId: capa.id, capaCode: capa.code };
            save(data2);
            return data2.warnings[idx2];
          }
        } catch (e) {
          console.error("[auto-capa] warning update trigger failed:", e.message);
        }
      }
      return updated;
    },
    async approveWarning(id, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.warnings || []).findIndex((w) => w.id === id && !w.deletedAt);
      if (idx === -1) return null;
      const current = data.warnings[idx];
      data.warnings[idx] = { ...current, approvalStatus: "APPROVED", rejectionReason: null, updatedByName: safeActor.displayName, updatedAt: nowIso() };
      logActivity(data, { type: "warning", entityCode: current.code, action: "approved", actorName: safeActor.displayName });
      save(data);
      return data.warnings[idx];
    },
    async rejectWarning(id, reason = "", actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.warnings || []).findIndex((w) => w.id === id && !w.deletedAt);
      if (idx === -1) return null;
      const current = data.warnings[idx];
      data.warnings[idx] = { ...current, approvalStatus: "REJECTED", rejectionReason: reason || "Không đạt yêu cầu", updatedByName: safeActor.displayName, updatedAt: nowIso() };
      logActivity(data, { type: "warning", entityCode: current.code, action: "rejected", actorName: safeActor.displayName });
      save(data);
      return data.warnings[idx];
    },
    async listIncidents(query = {}) {
      const data = load();
      return filterList(data.incidents || [], query);
    },
    async getIncident(id) {
      const data = load();
      return (data.incidents || []).find((inc) => inc.id === id && !inc.deletedAt) || null;
    },
    async deleteIncident(id, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.incidents || []).findIndex((inc) => inc.id === id && !inc.deletedAt);
      if (idx === -1) return null;
      data.incidents[idx] = { ...data.incidents[idx], deletedAt: nowIso(), updatedAt: nowIso(), deletedByName: safeActor.displayName, updatedByName: safeActor.displayName };
      save(data);
      return { ok: true, id };
    },
    async createIncident(input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const now = nowIso();
      const code = text(input.code, generateCode("INC"));
      const item = {
        id: input.id || newId("incident"),
        code,
        type: text(input.type, "Sự cố an toàn"),
        severity: text(input.severity, "Trung bình"),
        status: text(input.status, "Đang xử lý"),
        department: text(input.department, safeActor.departmentId || "company"),
        area: input.area || null,
        description: input.description || input.type || "Sự cố an toàn",
        occurredDate: toDateOnly(input.occurredDate) || toDateOnly(new Date()),
        occurredTime: input.occurredTime || null,
        reporterName: input.reporterName || safeActor.displayName || null,
        reporterPhone: input.reporterPhone || null,
        handlerName: input.handlerName || null,
        witnesses: input.witnesses || null,
        bodyPartsAffected: Array.isArray(input.bodyPartsAffected) ? input.bodyPartsAffected : [],
        firstAidGiven: Boolean(input.firstAidGiven),
        rootCauseCategory: input.rootCauseCategory || null,
        rootCauseDetail: input.rootCauseDetail || null,
        immediateAction: input.immediateAction || null,
        correctiveAction: input.correctiveAction || null,
        preventiveAction: input.preventiveAction || null,
        estimatedCost: input.estimatedCost != null ? Number(input.estimatedCost) : null,
        approvalStatus: text(input.approvalStatus, "PENDING"),
        rejectionReason: null,
        submittedByDept: input.submittedByDept || safeActor.departmentId || null,
        submittedById: input.submittedById || safeActor.id || null,
        submittedByName: input.submittedByName || safeActor.displayName || null,
        createdByName: safeActor.displayName,
        updatedByName: safeActor.displayName,
        createdAt: now,
        updatedAt: now
      };
      data.incidents = [...(data.incidents || []), item];
      logActivity(data, { type: "incident", entityCode: code, action: "created", actorName: safeActor.displayName });
      save(data);
      return item;
    },
    async updateIncident(id, input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.incidents || []).findIndex((i) => i.id === id && !i.deletedAt);
      if (idx === -1) return null;
      const current = data.incidents[idx];
      const updated = { ...current, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)), updatedByName: safeActor.displayName, updatedAt: nowIso() };
      data.incidents[idx] = updated;
      logActivity(data, { type: "incident", entityCode: current.code, action: "updated", actorName: safeActor.displayName });
      save(data);
      return updated;
    },
    async approveIncident(id, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.incidents || []).findIndex((i) => i.id === id && !i.deletedAt);
      if (idx === -1) return null;
      const current = data.incidents[idx];
      data.incidents[idx] = { ...current, approvalStatus: "APPROVED", rejectionReason: null, updatedByName: safeActor.displayName, updatedAt: nowIso() };
      logActivity(data, { type: "incident", entityCode: current.code, action: "approved", actorName: safeActor.displayName });
      save(data);
      return data.incidents[idx];
    },
    async rejectIncident(id, reason = "", actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.incidents || []).findIndex((i) => i.id === id && !i.deletedAt);
      if (idx === -1) return null;
      const current = data.incidents[idx];
      data.incidents[idx] = { ...current, approvalStatus: "REJECTED", rejectionReason: reason || "Không đạt yêu cầu", updatedByName: safeActor.displayName, updatedAt: nowIso() };
      logActivity(data, { type: "incident", entityCode: current.code, action: "rejected", actorName: safeActor.displayName });
      save(data);
      return data.incidents[idx];
    },
    async listIncidentAttachments(id) {
      return [];
    },

    async violationTrend() {
      const data = load();
      const isoWeek = (d) => {
        const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
        return Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
      };
      const now = new Date();
      const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 56);
      const slots = [];
      for (let i = 0; i < 8; i++) {
        const d = new Date(cutoff); d.setDate(d.getDate() + i * 7);
        slots.push({ yr: d.getFullYear(), wk: isoWeek(d), label: `T${d.getMonth() + 1}`, violations: 0, incidents: 0 });
      }
      const getSlot = (dateStr) => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d)) return null;
        const yr = d.getFullYear(); const wk = isoWeek(d);
        return slots.find(s => s.yr === yr && s.wk === wk) || null;
      };
      for (const w of (data.warnings || [])) {
        if (w.deletedAt) continue;
        const s = getSlot(w.createdAt); if (s) s.violations++;
      }
      for (const i of (data.incidents || [])) {
        if (i.deletedAt) continue;
        const s = getSlot(i.occurredDate || i.createdAt); if (s) s.incidents++;
      }
      return slots.map(({ label, violations, incidents }) => ({ label, violations, incidents }));
    },

    async incidentCategories({ year } = {}) {
      const COLORS = ["#ef4444","#f59e0b","#f97316","#0d6efd","#14b8a6","#8b5cf6","#22c55e","#64748b"];
      const data = load();
      const yr = year ? String(year) : String(new Date().getFullYear());
      const counts = {};
      for (const i of (data.incidents || [])) {
        if (i.deletedAt) continue;
        if (i.occurredDate && !String(i.occurredDate).startsWith(yr)) continue;
        const cat = i.rootCauseCategory || i.severity || "Khác";
        counts[cat] = (counts[cat] || 0) + 1;
      }
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      return entries.map(([label, value], idx) => ({ label, value, color: COLORS[idx % COLORS.length] }));
    },
    async listKpiEntries(query = {}) {
      const data = load();
      const items = (data.kpiEntries || []).filter((k) => !k.deletedAt);
      let result = items;
      if (query.dept || query.department) {
        const dept = String(query.dept || query.department);
        result = result.filter((k) => k.departmentCode === dept);
      }
      if (query.entryType || query.entry_type) result = result.filter((k) => k.entryType === (query.entryType || query.entry_type));
      if (query.approvalStatus) result = result.filter((k) => k.approvalStatus === query.approvalStatus);
      if (query.excludeApprovalStatus || query.exclude_approval_status) {
        const excl = query.excludeApprovalStatus || query.exclude_approval_status;
        result = result.filter((k) => k.approvalStatus !== excl);
      }
      result = result.slice().reverse();
      const limit = Math.max(1, Math.min(200, Number(query.limit) || 100));
      return { items: result.slice(0, limit), total: result.length };
    },
    async createKpiEntry(input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const now = nowIso();
      const code = text(input.code, generateCode("KPI"));
      const item = {
        id: input.id || newId("kpi"),
        code,
        entryType: text(input.entryType, "safety_score_monthly"),
        periodType: text(input.periodType, "month"),
        period: text(input.period, toDateOnly(new Date())?.slice(0, 7) || ""),
        departmentCode: text(input.departmentCode || input.department, safeActor.departmentId || "company"),
        divisionCode: input.divisionCode || null,
        value: Number(input.value) || 0,
        target: input.target != null ? Number(input.target) : null,
        unit: input.unit || null,
        notes: input.notes || null,
        approvalStatus: text(input.approvalStatus, "pending_l1"),
        rejectionReason: null,
        rejectedByLevel: null,
        l1ApprovedById: null, l1ApprovedByName: null, l1ApprovedAt: null,
        l2ApprovedById: null, l2ApprovedByName: null, l2ApprovedAt: null,
        submittedById: input.submittedById || safeActor.id || null,
        submittedByName: input.submittedByName || safeActor.displayName || null,
        submittedByDept: input.submittedByDept || safeActor.departmentId || null,
        createdByName: safeActor.displayName,
        updatedByName: safeActor.displayName,
        createdAt: now,
        updatedAt: now
      };
      data.kpiEntries = [...(data.kpiEntries || []), item];
      logActivity(data, { type: "kpi", entityCode: code, action: "submitted", actorName: safeActor.displayName });
      save(data);
      return item;
    },
    async kpiHistory(id) {
      const data = load();
      return (data.activityLog || []).filter((e) => e.entityCode && e.type === "kpi").slice(0, 20);
    },
    async approveKpi(id, level, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.kpiEntries || []).findIndex((k) => k.id === id && !k.deletedAt);
      if (idx === -1) return null;
      const current = data.kpiEntries[idx];
      const updates = level === 1
        ? { approvalStatus: "pending_l2", l1ApprovedById: safeActor.id, l1ApprovedByName: safeActor.displayName, l1ApprovedAt: nowIso(), rejectionReason: null, rejectedByLevel: null }
        : { approvalStatus: "approved", l2ApprovedById: safeActor.id, l2ApprovedByName: safeActor.displayName, l2ApprovedAt: nowIso(), rejectionReason: null, rejectedByLevel: null };
      data.kpiEntries[idx] = { ...current, ...updates, updatedByName: safeActor.displayName, updatedAt: nowIso() };
      logActivity(data, { type: "kpi", entityCode: current.code, action: `approved_l${level}`, actorName: safeActor.displayName });
      save(data);
      return data.kpiEntries[idx];
    },
    async rejectKpi(id, level, reason = "", actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.kpiEntries || []).findIndex((k) => k.id === id && !k.deletedAt);
      if (idx === -1) return null;
      const current = data.kpiEntries[idx];
      data.kpiEntries[idx] = { ...current, approvalStatus: `rejected_l${level}`, rejectionReason: reason || "Không đạt yêu cầu", rejectedByLevel: `l${level}`, updatedByName: safeActor.displayName, updatedAt: nowIso() };
      logActivity(data, { type: "kpi", entityCode: current.code, action: `rejected_l${level}`, actorName: safeActor.displayName });
      save(data);
      return data.kpiEntries[idx];
    },
    async listChecklist({ dept = "", period = "" } = {}) {
      const data = load();
      return (data.checklistSubmissions || []).filter((s) => s.departmentCode === dept && s.period === period).sort((a, b) => (a.itemId || 0) - (b.itemId || 0));
    },
    async saveChecklist(input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const dept = text(input.departmentCode || input.dept, safeActor.departmentId || "company");
      const period = text(input.period, toDateOnly(new Date())?.slice(0, 7) || "");
      const templateId = text(input.templateId || input.template_id, DAILY_DEPARTMENT_CHECKLIST.id);
      const items = Array.isArray(input.items)
        ? input.items
        : DAILY_DEPARTMENT_CHECKLIST.items.map((item) => ({ itemId: item.id, checked: Boolean(input[`item${item.id}`]) }));
      const now = nowIso();
      for (const item of items) {
        const status = normalizeChecklistResult(item.status || item.resultStatus || item.result_status || (item.checked ? "pass" : "pending"));
        const checked = status === "pass";
        const existing = (data.checklistSubmissions || []).findIndex((s) => s.departmentCode === dept && s.period === period && s.itemId === Number(item.itemId ?? item.id));
        const entry = { departmentCode: dept, period, templateId, itemId: Number(item.itemId ?? item.id), checked, resultStatus: status, status, submittedById: safeActor.id, submittedByName: safeActor.displayName, createdAt: now, updatedAt: now };
        if (existing >= 0) {
          data.checklistSubmissions[existing] = { ...data.checklistSubmissions[existing], ...entry };
        } else {
          if (!data.checklistSubmissions) data.checklistSubmissions = [];
          data.checklistSubmissions.push({ id: String(data.checklistSubmissions.length + 1), ...entry });
        }
      }
      save(data);
      return this.listChecklist({ dept, period });
    },
    async checklistTemplate() {
      return { checklist: DAILY_DEPARTMENT_CHECKLIST };
    },
    async checklistSummary({ period = "" } = {}) {
      const data = load();
      const subs = (data.checklistSubmissions || []);
      const EXCLUDED = new Set(["pending", "day_off", "not_applicable"]);
      const depts = [...new Set(subs.map((s) => s.departmentCode))];
      return depts.map((departmentCode) => {
        const deptSubs = subs.filter((s) => s.departmentCode === departmentCode && (!period || s.period === period));
        const counted = deptSubs.filter((s) => !EXCLUDED.has(s.resultStatus));
        const total = counted.length;
        const checked = counted.filter((s) => s.checked).length;
        return { departmentCode, period, total, checked, score: total ? Math.round((checked / total) * 100) : 0 };
      });
    },
    async checklistPillarSummary({ period = "" } = {}) {
      const summary = await this.checklistSummary({ period });
      const total = summary.reduce((sum, item) => sum + item.total, 0);
      const checked = summary.reduce((sum, item) => sum + item.checked, 0);
      const score = total ? Math.round((checked / total) * 100) : 0;
      return ["S1", "S2", "S3", "S4", "S5", "S6"].map((pillar, index) => ({
        pillar, itemId: index + 1, score: Math.max(0, Math.min(100, score - index * 2)), total, checked
      }));
    },
    async listReports(query = {}) {
      const data = load();
      return filterList(data.reports || [], query);
    },
    async createReport(input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const now = nowIso();
      const code = text(input.code, generateCode("RPT"));
      const item = {
        id: input.id || newId("report"),
        code,
        title: text(input.title, "Báo cáo mới"),
        type: text(input.type, "Safety"),
        period: input.period || null,
        department: text(input.department, safeActor.departmentId || "company"),
        creator: input.creator || safeActor.displayName || null,
        status: text(input.status, "Nháp"),
        notes: input.notes || null,
        createdById: safeActor.id,
        createdByName: safeActor.displayName,
        updatedByName: safeActor.displayName,
        createdAt: now,
        updatedAt: now
      };
      data.reports = [...(data.reports || []), item];
      logActivity(data, { type: "report", entityCode: code, action: "created", actorName: safeActor.displayName });
      save(data);
      return item;
    },
    async updateReport(id, input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.reports || []).findIndex((r) => r.id === id && !r.deletedAt);
      if (idx === -1) return null;
      const current = data.reports[idx];
      const updated = { ...current, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)), updatedByName: safeActor.displayName, updatedAt: nowIso() };
      data.reports[idx] = updated;
      save(data);
      return updated;
    },
    async deleteReport(id, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.reports || []).findIndex((r) => r.id === id);
      if (idx !== -1) {
        data.reports[idx] = { ...data.reports[idx], deletedAt: nowIso(), updatedByName: safeActor.displayName, updatedAt: nowIso() };
        save(data);
      }
      return { id, deleted: true };
    },
    async listTrainingCourses(query = {}) {
      const data = load();
      return filterList(data.trainingCourses || [], query);
    },
    async createTrainingCourse(input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const now = nowIso();
      const code = text(input.code, generateCode("TRN"));
      const item = {
        id: input.id || newId("training"),
        code,
        name: text(input.name, "Khóa đào tạo mới"),
        category: input.category || null,
        trainer: input.trainer || null,
        duration: input.duration || null,
        department: text(input.department, safeActor.departmentId || "company"),
        enrolled: Number(input.enrolled) || 0,
        completed: Number(input.completed) || 0,
        dueDate: toDateOnly(input.dueDate),
        status: text(input.status, "Chưa bắt đầu"),
        notes: input.notes || null,
        createdById: safeActor.id,
        createdByName: safeActor.displayName,
        updatedByName: safeActor.displayName,
        createdAt: now,
        updatedAt: now
      };
      data.trainingCourses = [...(data.trainingCourses || []), item];
      logActivity(data, { type: "training", entityCode: code, action: "created", actorName: safeActor.displayName });
      save(data);
      return item;
    },
    async updateTrainingCourse(id, input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.trainingCourses || []).findIndex((t) => t.id === id && !t.deletedAt);
      if (idx === -1) return null;
      const current = data.trainingCourses[idx];
      const updated = { ...current, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)), updatedByName: safeActor.displayName, updatedAt: nowIso() };
      data.trainingCourses[idx] = updated;
      save(data);
      return updated;
    },
    async deleteTrainingCourse(id, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.trainingCourses || []).findIndex((t) => t.id === id);
      if (idx !== -1) {
        data.trainingCourses[idx] = { ...data.trainingCourses[idx], deletedAt: nowIso(), updatedByName: safeActor.displayName, updatedAt: nowIso() };
        save(data);
      }
      return { id, deleted: true };
    },
    async listNotifications(actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      return (data.notifications || [])
        .filter((n) => {
          if (n.forRoles && n.forRoles !== "" && safeActor.role) {
            const roles = n.forRoles.replace(/\s/g, "").split(",");
            if (!roles.includes(safeActor.role)) return false;
          }
          if (n.forDept && n.forDept !== "" && safeActor.departmentId) {
            if (n.forDept !== safeActor.departmentId) return false;
          }
          if (n.forUsers && n.forUsers !== "") {
            const users = n.forUsers.split(",").map((u) => u.trim()).filter(Boolean);
            if (safeActor.id && !users.includes(safeActor.id)) return false;
          }
          return true;
        })
        .slice(0, 100)
        .map((n) => ({
          ...n,
          isRead: Array.isArray(n.readByUserIds) ? n.readByUserIds.includes(safeActor.id) : false
        }));
    },
    async markNotificationRead(id, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.notifications || []).findIndex((n) => n.id === id);
      if (idx !== -1) {
        const current = data.notifications[idx];
        const readByUserIds = Array.isArray(current.readByUserIds) ? current.readByUserIds : [];
        if (safeActor.id && !readByUserIds.includes(safeActor.id)) {
          readByUserIds.push(safeActor.id);
        }
        data.notifications[idx] = { ...current, readByUserIds };
        save(data);
      }
      return { id, read: true };
    },
    async markAllNotificationsRead(actor = {}) {
      const notifications = await this.listNotifications(actor);
      for (const item of notifications) {
        await this.markNotificationRead(item.id, actor);
      }
      return { ok: true };
    },
    async addNotification(notification = {}) {
      const data = load();
      if (!Array.isArray(data.notifications)) data.notifications = [];
      const record = {
        id: newId("notif"),
        type: notification.type || "info",
        entityType: notification.entityType || "",
        title: notification.title || "",
        titleI18n: notification.titleI18n || {},
        message: notification.message || "",
        messageI18n: notification.messageI18n || {},
        page: notification.page || "",
        forRoles: notification.forRoles || "",
        forDept: notification.forDept || "",
        forUsers: notification.forUsers || "",
        readByUserIds: [],
        createdAt: nowIso()
      };
      data.notifications.unshift(record);
      if (data.notifications.length > 200) data.notifications = data.notifications.slice(0, 200);
      save(data);
      return record;
    },
    async getProfile(actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const profile = safeActor.id ? (data.profiles || {})[safeActor.id] : null;
      return {
        userId: safeActor.id,
        displayName: profile?.displayName || safeActor.displayName,
        email: profile?.email || "",
        phone: profile?.phone || "",
        updatedAt: profile?.updatedAt || null
      };
    },
    async updateProfile(input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      if (safeActor.id) {
        if (!data.profiles) data.profiles = {};
        data.profiles[safeActor.id] = {
          ...(data.profiles[safeActor.id] || {}),
          displayName: input.displayName || safeActor.displayName,
          email: input.email || "",
          phone: input.phone || "",
          updatedAt: nowIso()
        };
        save(data);
      }
      return this.getProfile(actor);
    },
    async activityFeed({ limit = 8 } = {}) {
      const data = load();
      const n = Math.max(1, Math.min(50, Number(limit) || 8));
      return (data.activityLog || []).slice(0, n).map((entry) => ({
        id: `${entry.type}-${entry.entityCode}-${entry.createdAt}`,
        type: entry.type,
        title: `${entry.action} ${entry.entityCode || ""}`.trim(),
        actorName: entry.actorName || "",
        createdAt: entry.createdAt
      }));
    },

    // ─── Inspection Plans ─────────────────────────────────────────────────────
    async listInspectionPlans(query = {}) {
      const data = load();
      let plans = (data.inspectionPlans || []).filter((p) => !p.deletedAt);
      if (query.period) plans = plans.filter((p) => p.period === query.period);
      if (query.year) plans = plans.filter((p) => (p.period || "").startsWith(String(query.year)));
      if (query.status) plans = plans.filter((p) => p.status === query.status);
      if (query.type) plans = plans.filter((p) => p.type === query.type);
      if (query.q || query.search) {
        const q = String(query.q || query.search).toLowerCase();
        plans = plans.filter((p) => JSON.stringify(p).toLowerCase().includes(q));
      }
      plans = plans.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      const limit = Math.max(1, Math.min(200, Number(query.limit) || 100));
      return { items: plans.slice(0, limit), total: plans.length };
    },

    async getInspectionPlan(id) {
      const data = load();
      return (data.inspectionPlans || []).find((p) => p.id === id && !p.deletedAt) || null;
    },

    async createInspectionPlan(input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const now = nowIso();
      const period = text(input.period, now.slice(0, 7));
      const codePrefix = input.type === "pccc-quarterly" ? "KHPCCC"
        : input.type === "comprehensive-annual" ? "KHTH"
        : input.type === "special" ? "KHDT"
        : "KH6S";
      const code = generateCode(codePrefix);
      const depts = Array.isArray(input.departments) ? input.departments : [];
      const plan = {
        id: newId("plan"),
        code,
        period,
        type:             text(input.type, "6s-monthly"),
        title:            text(input.title, `Kế hoạch kiểm tra 6S tháng ${period}`),
        scope:            text(input.scope, "company"),
        status:           "draft",
        // ── Trường mở rộng (schema v2) ──────────────────────────────
        priority:         ["normal","high","urgent"].includes(input.priority) ? input.priority : "normal",
        tags:             Array.isArray(input.tags) ? input.tags : [],
        leadInspector:    input.leadInspector || null,
        plannedStartDate: toDateOnly(input.plannedStartDate) || null,
        plannedEndDate:   toDateOnly(input.plannedEndDate)   || null,
        customFields:     (input.customFields && typeof input.customFields === "object") ? input.customFields : {},
        auditTrail:       [{ at: now, by: safeActor.displayName, action: "created", note: "Tạo kế hoạch" }],
        // ── Departments ──────────────────────────────────────────────
        departments: depts.map((d) => ({
          deptCode:              d.deptCode || "",
          deptName:              d.deptName || d.deptCode || "",
          divisionCode:          d.divisionCode || "",
          scheduledDate:         toDateOnly(d.scheduledDate) || null,
          actualDate:            null,
          timeStart:             null,
          timeEnd:               null,
          inspectorNames:        Array.isArray(d.inspectorNames) ? d.inspectorNames : [],
          leadInspectorName:     d.leadInspectorName || null,
          checklistSubmissionId: null,
          score:                 null,
          findings:              "",
          corrective:            [],
          signedOffByName:       null,
          signedOffAt:           null,
          evidenceRefs:          [],
          status:                "pending",
        })),
        notes:         text(input.notes),
        approvedById:  null,
        approvedByName:null,
        approvedAt:    null,
        createdById:   safeActor.id,
        createdByName: safeActor.displayName,
        createdAt:     now,
        updatedAt:     now,
      };
      data.inspectionPlans = [...(data.inspectionPlans || []), plan];
      logActivity(data, { type: "inspection-plan", entityCode: code, action: "created", actorName: safeActor.displayName });
      save(data);
      return plan;
    },

    async updateInspectionPlan(id, input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.inspectionPlans || []).findIndex((p) => p.id === id && !p.deletedAt);
      if (idx === -1) return null;
      const current = data.inspectionPlans[idx];
      const allowed = [
        "title", "type", "period", "scope", "notes", "status", "departments",
        // schema v2
        "priority", "tags", "leadInspector", "plannedStartDate", "plannedEndDate", "customFields",
      ];
      const patch = Object.fromEntries(
        Object.entries(input)
          .filter(([k]) => allowed.includes(k))
          .filter(([, v]) => v !== undefined)
      );
      const now = nowIso();
      const trail = [...(current.auditTrail || []), { at: now, by: safeActor.displayName, action: "updated", note: input._auditNote || "Cập nhật kế hoạch" }];
      const updated = { ...current, ...patch, auditTrail: trail, updatedAt: now };
      data.inspectionPlans[idx] = updated;
      logActivity(data, { type: "inspection-plan", entityCode: current.code, action: "updated", actorName: safeActor.displayName });
      save(data);
      return updated;
    },

    async approveInspectionPlan(id, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.inspectionPlans || []).findIndex((p) => p.id === id && !p.deletedAt);
      if (idx === -1) return null;
      const now = nowIso();
      const current = data.inspectionPlans[idx];
      const trail = [...(current.auditTrail || []), { at: now, by: safeActor.displayName, action: "approved", note: "Phê duyệt kế hoạch" }];
      data.inspectionPlans[idx] = {
        ...current,
        status: "approved",
        approvedById: safeActor.id,
        approvedByName: safeActor.displayName,
        approvedAt: now,
        auditTrail: trail,
        updatedAt: now,
      };
      logActivity(data, { type: "inspection-plan", entityCode: current.code, action: "approved", actorName: safeActor.displayName });
      save(data);
      return data.inspectionPlans[idx];
    },

    async cancelInspectionPlan(id, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.inspectionPlans || []).findIndex((p) => p.id === id && !p.deletedAt);
      if (idx === -1) return null;
      const now = nowIso();
      const current = data.inspectionPlans[idx];
      const trail = [...(current.auditTrail || []), { at: now, by: safeActor.displayName, action: "cancelled", note: "Hủy kế hoạch" }];
      data.inspectionPlans[idx] = {
        ...current,
        status: "cancelled",
        auditTrail: trail,
        updatedAt: now,
      };
      logActivity(data, { type: "inspection-plan", entityCode: current.code, action: "cancelled", actorName: safeActor.displayName });
      save(data);
      return data.inspectionPlans[idx];
    },

    async updatePlanDepartment(planId, deptCode, input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.inspectionPlans || []).findIndex((p) => p.id === planId && !p.deletedAt);
      if (idx === -1) return null;
      const plan = data.inspectionPlans[idx];
      const departments = (plan.departments || []).map((d) => {
        if (d.deptCode !== deptCode) return d;
        return {
          ...d,
          // core fields (backward-compat)
          actualDate:    input.actualDate    !== undefined ? input.actualDate    : d.actualDate,
          inspectorNames:Array.isArray(input.inspectorNames) ? input.inspectorNames : d.inspectorNames,
          score:         input.score         !== undefined ? input.score         : d.score,
          findings:      input.findings      !== undefined ? input.findings      : d.findings,
          status:        input.status        !== undefined ? input.status        : d.status,
          // schema v2 fields
          timeStart:           input.timeStart           !== undefined ? input.timeStart           : (d.timeStart           || null),
          timeEnd:             input.timeEnd             !== undefined ? input.timeEnd             : (d.timeEnd             || null),
          leadInspectorName:   input.leadInspectorName   !== undefined ? input.leadInspectorName   : (d.leadInspectorName   || null),
          corrective:          Array.isArray(input.corrective)         ? input.corrective         : (d.corrective          || []),
          signedOffByName:     input.signedOffByName     !== undefined ? input.signedOffByName     : (d.signedOffByName     || null),
          signedOffAt:         input.signedOffAt         !== undefined ? input.signedOffAt         : (d.signedOffAt         || null),
          evidenceRefs:        Array.isArray(input.evidenceRefs)       ? input.evidenceRefs       : (d.evidenceRefs        || []),
          updatedByName: safeActor.displayName,
        };
      });
      const doneCount  = departments.filter((d) => d.status === "done" || d.status === "skipped").length;
      const allDone    = doneCount === departments.length && departments.length > 0;
      const anyInProg  = departments.some((d) => d.status === "done" || d.status === "in_progress");
      const newPlanStatus = allDone
        ? "completed"
        : anyInProg && (plan.status === "approved" || plan.status === "in_progress")
          ? "in_progress"
          : plan.status;
      data.inspectionPlans[idx] = { ...plan, departments, status: newPlanStatus, updatedAt: nowIso() };
      save(data);
      return data.inspectionPlans[idx];
    },

    async deleteInspectionPlan(id, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.inspectionPlans || []).findIndex((p) => p.id === id && !p.deletedAt);
      if (idx === -1) return { ok: false };
      data.inspectionPlans[idx] = { ...data.inspectionPlans[idx], deletedAt: nowIso(), deletedByName: safeActor.displayName };
      save(data);
      return { ok: true };
    },

    // ─── Safety Meetings ──────────────────────────────────────────────────────
    async listSafetyMeetings(query = {}) {
      const data = load();
      let meetings = (data.safetyMeetings || []).filter((m) => !m.deletedAt);
      if (query.period) meetings = meetings.filter((m) => m.period === query.period);
      if (query.year)   meetings = meetings.filter((m) => (m.period || "").startsWith(String(query.year)));
      if (query.status) meetings = meetings.filter((m) => m.status === query.status);
      if (query.type)   meetings = meetings.filter((m) => m.type === query.type);
      if (query.q || query.search) {
        const q = String(query.q || query.search).toLowerCase();
        meetings = meetings.filter((m) => JSON.stringify(m).toLowerCase().includes(q));
      }
      meetings = meetings.slice().sort((a, b) => (b.meetingDate || b.createdAt || "").localeCompare(a.meetingDate || a.createdAt || ""));
      const limit = Math.max(1, Math.min(200, Number(query.limit) || 100));
      return { items: meetings.slice(0, limit), total: meetings.length };
    },

    async getSafetyMeeting(id) {
      const data = load();
      return (data.safetyMeetings || []).find((m) => m.id === id && !m.deletedAt) || null;
    },

    async createSafetyMeeting(input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const now = nowIso();
      const period = text(input.period, now.slice(0, 7));
      const code = generateCode("HOP");
      const meeting = {
        id: newId("meeting"),
        code,
        period,
        type: text(input.type, "monthly"),
        title: text(input.title, `Họp an toàn tháng ${period}`),
        meetingDate: input.meetingDate || null,
        startTime: text(input.startTime, "08:00"),
        endTime: text(input.endTime, "09:00"),
        location: text(input.location, "Phòng họp"),
        chairperson: text(input.chairperson),
        participants: Array.isArray(input.participants) ? input.participants : [],
        agenda: Array.isArray(input.agenda) ? input.agenda.map((a, i) => ({
          id: `agenda-${i + 1}`,
          order: i + 1,
          topic: text(a.topic),
          presenter: text(a.presenter),
          duration: Number(a.duration) || 15,
          notes: text(a.notes)
        })) : [],
        contentSummary: text(input.contentSummary),
        decisions: text(input.decisions),
        actionItems: Array.isArray(input.actionItems) ? input.actionItems.map((item, i) => ({
          id: newId("action"),
          order: i + 1,
          content: text(item.content),
          assignee: text(item.assignee),
          dueDate: item.dueDate || null,
          status: "open",
          completedAt: null
        })) : [],
        attachedPlanId: input.attachedPlanId || null,
        status: text(input.status, "planned"),
        approvedById: null,
        approvedByName: null,
        approvedAt: null,
        createdById: safeActor.id,
        createdByName: safeActor.displayName,
        createdAt: now,
        updatedAt: now
      };
      data.safetyMeetings = [...(data.safetyMeetings || []), meeting];
      logActivity(data, { type: "safety-meeting", entityCode: code, action: "created", actorName: safeActor.displayName });
      save(data);
      return meeting;
    },

    async updateSafetyMeeting(id, input = {}, actor = {}) {
      const data = load();
      const idx = (data.safetyMeetings || []).findIndex((m) => m.id === id && !m.deletedAt);
      if (idx === -1) return null;
      const current = data.safetyMeetings[idx];
      const allowed = ["title", "type", "period", "meetingDate", "startTime", "endTime", "location", "chairperson", "participants", "agenda", "contentSummary", "decisions", "actionItems", "attachedPlanId", "status"];
      const patch = Object.fromEntries(Object.entries(input).filter(([k]) => allowed.includes(k)).filter(([, v]) => v !== undefined));
      const updated = { ...current, ...patch, updatedAt: nowIso() };
      data.safetyMeetings[idx] = updated;
      save(data);
      return updated;
    },

    async completeSafetyMeeting(id, input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.safetyMeetings || []).findIndex((m) => m.id === id && !m.deletedAt);
      if (idx === -1) return null;
      data.safetyMeetings[idx] = {
        ...data.safetyMeetings[idx],
        status: "completed",
        contentSummary: input.contentSummary || data.safetyMeetings[idx].contentSummary,
        decisions: input.decisions || data.safetyMeetings[idx].decisions,
        approvedById: safeActor.id,
        approvedByName: safeActor.displayName,
        approvedAt: nowIso(),
        updatedAt: nowIso()
      };
      logActivity(data, { type: "safety-meeting", entityCode: data.safetyMeetings[idx].code, action: "completed", actorName: safeActor.displayName });
      save(data);
      return data.safetyMeetings[idx];
    },

    async updateMeetingActionItem(meetingId, actionItemId, input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.safetyMeetings || []).findIndex((m) => m.id === meetingId && !m.deletedAt);
      if (idx === -1) return null;
      const meeting = data.safetyMeetings[idx];
      const actionItems = (meeting.actionItems || []).map((item) =>
        item.id === actionItemId
          ? {
              ...item,
              status: input.status !== undefined ? input.status : item.status,
              assignee: input.assignee !== undefined ? input.assignee : item.assignee,
              dueDate: input.dueDate !== undefined ? input.dueDate : item.dueDate,
              content: input.content !== undefined ? input.content : item.content,
              completedAt: input.status === "closed" ? nowIso() : item.completedAt,
              updatedByName: safeActor.displayName
            }
          : item
      );
      data.safetyMeetings[idx] = { ...meeting, actionItems, updatedAt: nowIso() };
      save(data);
      return data.safetyMeetings[idx];
    },

    async deleteSafetyMeeting(id, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.safetyMeetings || []).findIndex((m) => m.id === id && !m.deletedAt);
      if (idx === -1) return { ok: false };
      data.safetyMeetings[idx] = { ...data.safetyMeetings[idx], deletedAt: nowIso(), deletedByName: safeActor.displayName };
      save(data);
      return { ok: true };
    },

    // ─── Summary & Analytics ──────────────────────────────────────────────────
    async inspectionPlanSummary({ year } = {}) {
      const data = load();
      let plans = (data.inspectionPlans || []).filter((p) => !p.deletedAt);
      if (year) plans = plans.filter((p) => (p.period || "").startsWith(String(year)));

      const byStatus = { draft: 0, approved: 0, in_progress: 0, completed: 0, cancelled: 0 };
      const byType = {};
      const deptMap = {};
      let openCapa = 0, criticalCapa = 0;

      for (const plan of plans) {
        byStatus[plan.status] = (byStatus[plan.status] || 0) + 1;
        byType[plan.type] = (byType[plan.type] || 0) + 1;
        for (const dept of (plan.departments || [])) {
          const key = dept.deptCode;
          if (!deptMap[key]) deptMap[key] = { divisionCode: dept.divisionCode || "", total: 0, done: 0, inProgress: 0, pending: 0, scoreSum: 0, scoreN: 0 };
          const d = deptMap[key];
          d.total++;
          if (dept.status === "done" || dept.status === "skipped") d.done++;
          else if (dept.status === "in_progress") d.inProgress++;
          else d.pending++;
          if (dept.score != null) { d.scoreSum += Number(dept.score); d.scoreN++; }
          for (const c of (dept.corrective || [])) {
            if (c.status === "open" || c.status === "overdue") openCapa++;
            if (c.severity === "critical" || c.status === "overdue") criticalCapa++;
          }
        }
      }

      const deptProgress = Object.entries(deptMap).map(([deptCode, d]) => ({
        deptCode,
        divisionCode: d.divisionCode,
        total: d.total,
        done: d.done,
        inProgress: d.inProgress,
        pending: d.pending,
        pct: d.total ? Math.round((d.done / d.total) * 100) : 0,
        avgScore: d.scoreN ? Math.round((d.scoreSum / d.scoreN) * 10) / 10 : null,
      }));

      const divMap = {};
      for (const dept of deptProgress) {
        const div = dept.divisionCode || "other";
        if (!divMap[div]) divMap[div] = { divisionCode: div, total: 0, done: 0, inProgress: 0, pending: 0 };
        const d = divMap[div];
        d.total += dept.total;
        d.done += dept.done;
        d.inProgress += dept.inProgress;
        d.pending += dept.pending;
      }
      const divisionProgress = Object.values(divMap).map((d) => ({
        ...d,
        pct: d.total ? Math.round((d.done / d.total) * 100) : 0,
      }));

      return {
        year: year ? String(year) : null,
        totalPlans: plans.length,
        byStatus,
        byType,
        deptProgress,
        divisionProgress,
        openCorrectiveActions: openCapa,
        criticalCorrectiveActions: criticalCapa,
      };
    },

    async safetyMeetingSummary({ year } = {}) {
      const data = load();
      let meetings = (data.safetyMeetings || []).filter((m) => !m.deletedAt);
      if (year) meetings = meetings.filter((m) => (m.period || "").startsWith(String(year)));

      const byType = {};
      const byPeriodMap = {};
      let totalActionItems = 0, openActionItems = 0, overdueActionItems = 0, totalParticipants = 0;
      const now = new Date().toISOString().slice(0, 10);

      for (const m of meetings) {
        byType[m.type] = (byType[m.type] || 0) + 1;
        const period = m.period || (m.meetingDate || "").slice(0, 7) || "unknown";
        if (!byPeriodMap[period]) byPeriodMap[period] = { period, count: 0, completed: 0, planned: 0 };
        byPeriodMap[period].count++;
        if (m.status === "completed") byPeriodMap[period].completed++;
        else byPeriodMap[period].planned++;
        totalParticipants += Array.isArray(m.participants) ? m.participants.length : 0;
        for (const item of (m.actionItems || [])) {
          totalActionItems++;
          if (item.status === "open") {
            openActionItems++;
            if (item.dueDate && item.dueDate < now) overdueActionItems++;
          }
        }
      }

      const completed = meetings.filter((m) => m.status === "completed").length;
      const planned   = meetings.filter((m) => m.status === "planned").length;
      const cancelled = meetings.filter((m) => m.status === "cancelled").length;

      return {
        year: year ? String(year) : null,
        total: meetings.length,
        completed,
        planned,
        cancelled,
        completionRate: meetings.length ? Math.round((completed / meetings.length) * 100) : 0,
        byType,
        byPeriod: Object.values(byPeriodMap).sort((a, b) => a.period.localeCompare(b.period)),
        totalActionItems,
        openActionItems,
        overdueActionItems,
        totalParticipants,
      };
    },

    async deptReport({ dept, year } = {}) {
      const data = load();
      const deptCode = String(dept || "");
      const yearStr  = year ? String(year) : null;
      const inYear   = (item) => !yearStr || (item.period || item.createdAt || "").startsWith(yearStr);

      const plans     = (data.inspectionPlans || []).filter((p) => !p.deletedAt && inYear(p));
      const deptDepts = plans.flatMap((p) =>
        (p.departments || [])
          .filter((d) => d.deptCode === deptCode)
          .map((d) => ({ ...d, planCode: p.code, planPeriod: p.period, planStatus: p.status, planTitle: p.title }))
      );
      const deptPlanDone = deptDepts.filter((d) => d.status === "done" || d.status === "skipped").length;
      const deptCapa     = deptDepts.flatMap((d) => (d.corrective || []));

      const warnings  = (data.warnings  || []).filter((w) => !w.deletedAt && w.department === deptCode && inYear(w));
      const incidents = (data.incidents || []).filter((i) => !i.deletedAt && i.department === deptCode && inYear(i));
      const kpi       = (data.kpiEntries || []).filter((k) => !k.deletedAt && k.departmentCode === deptCode && inYear(k));
      const meetings  = (data.safetyMeetings || []).filter((m) => !m.deletedAt && inYear(m));

      const byRisk = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
      for (const w of warnings) byRisk[w.riskLevel] = (byRisk[w.riskLevel] || 0) + 1;

      return {
        dept: deptCode,
        year: yearStr,
        generatedAt: nowIso(),
        inspectionPlans: {
          plansIncluded: plans.length,
          deptRowsTotal: deptDepts.length,
          deptRowsDone:  deptPlanDone,
          pct: deptDepts.length ? Math.round((deptPlanDone / deptDepts.length) * 100) : 0,
          openCapa:      deptCapa.filter((c) => c.status === "open" || c.status === "overdue").length,
          criticalCapa:  deptCapa.filter((c) => c.severity === "critical" || c.status === "overdue").length,
          rows: deptDepts,
        },
        warnings: {
          total:    warnings.length,
          open:     warnings.filter((w) => w.approvalStatus !== "APPROVED").length,
          approved: warnings.filter((w) => w.approvalStatus === "APPROVED").length,
          byRiskLevel: byRisk,
        },
        incidents: {
          total: incidents.length,
          open:  incidents.filter((i) => i.status === "Đang xử lý").length,
          bySeverity: {
            "Nhẹ":      incidents.filter((i) => i.severity === "Nhẹ").length,
            "Trung bình": incidents.filter((i) => i.severity === "Trung bình").length,
            "Nặng":     incidents.filter((i) => i.severity === "Nặng").length,
          }
        },
        safetyMeetings: {
          total:     meetings.length,
          completed: meetings.filter((m) => m.status === "completed").length,
        },
        kpiEntries: {
          total:    kpi.length,
          approved: kpi.filter((k) => k.approvalStatus === "approved").length,
          pending:  kpi.filter((k) => k.approvalStatus !== "approved").length,
        },
      };
    },

    async companyReport({ year } = {}) {
      const data = load();
      const yearStr = year ? String(year) : null;
      const inYear  = (item) => !yearStr || (item.period || item.createdAt || "").startsWith(yearStr);

      const [iplanSummary, meetingSummary] = await Promise.all([
        this.inspectionPlanSummary({ year }),
        this.safetyMeetingSummary({ year }),
      ]);

      const warnings  = (data.warnings  || []).filter((w) => !w.deletedAt && inYear(w));
      const incidents = (data.incidents || []).filter((i) => !i.deletedAt && inYear(i));
      const kpi       = (data.kpiEntries || []).filter((k) => !k.deletedAt && inYear(k));
      const training  = (data.trainingCourses || []).filter((t) => !t.deletedAt && inYear(t));

      const byRisk = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
      for (const w of warnings) byRisk[w.riskLevel] = (byRisk[w.riskLevel] || 0) + 1;

      const bySeverity = {};
      for (const i of incidents) bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;

      return {
        year: yearStr,
        generatedAt: nowIso(),
        inspectionPlans: iplanSummary,
        safetyMeetings: meetingSummary,
        warnings: {
          total:    warnings.length,
          open:     warnings.filter((w) => w.approvalStatus !== "APPROVED").length,
          approved: warnings.filter((w) => w.approvalStatus === "APPROVED").length,
          byRiskLevel: byRisk,
        },
        incidents: {
          total:    incidents.length,
          open:     incidents.filter((i) => i.status === "Đang xử lý").length,
          bySeverity,
        },
        kpiEntries: {
          total:    kpi.length,
          approved: kpi.filter((k) => k.approvalStatus === "approved").length,
        },
        training: {
          total:     training.length,
          completed: training.filter((t) => t.status === "Hoàn thành").length,
        },
      };
    },

    // ─── CSV Export ───────────────────────────────────────────────────────────
    async exportInspectionPlansCsv({ year } = {}) {
      const data = load();
      let plans = (data.inspectionPlans || []).filter((p) => !p.deletedAt);
      if (year) plans = plans.filter((p) => (p.period || "").startsWith(String(year)));
      plans = plans.sort((a, b) => (a.period || "").localeCompare(b.period || ""));

      const escape = (v) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const headers = ["Kỳ","Mã KH","Tiêu đề","Loại","Trạng thái KH","Bộ phận","Khối","Ngày kế hoạch","Ngày thực hiện","Điểm","Trạng thái BP","CAPA mở","Người kiểm tra"];
      const rows = [];

      for (const plan of plans) {
        for (const dept of (plan.departments || [])) {
          const openCapa = (dept.corrective || []).filter((c) => c.status === "open" || c.status === "overdue").length;
          rows.push([
            plan.period,
            plan.code,
            plan.title,
            plan.type,
            plan.status,
            dept.deptCode,
            dept.divisionCode || "",
            dept.scheduledDate || "",
            dept.actualDate || "",
            dept.score != null ? dept.score : "",
            dept.status,
            openCapa,
            Array.isArray(dept.inspectorNames) ? dept.inspectorNames.join("; ") : "",
          ]);
        }
      }

      return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\r\n");
    },

    async exportSafetyMeetingsCsv({ year } = {}) {
      const data = load();
      let meetings = (data.safetyMeetings || []).filter((m) => !m.deletedAt);
      if (year) meetings = meetings.filter((m) => (m.period || "").startsWith(String(year)));
      meetings = meetings.sort((a, b) => (a.period || "").localeCompare(b.period || ""));

      const escape = (v) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const now = new Date().toISOString().slice(0, 10);
      const headers = ["Kỳ","Mã","Loại","Tiêu đề","Ngày họp","Chủ tọa","Địa điểm","Số người tham dự","Trạng thái","HĐ mở","HĐ quá hạn","Quyết định"];

      const rows = meetings.map((m) => {
        const openActions    = (m.actionItems || []).filter((a) => a.status === "open").length;
        const overdueActions = (m.actionItems || []).filter((a) => a.status === "open" && a.dueDate && a.dueDate < now).length;
        return [
          m.period, m.code, m.type, m.title,
          m.meetingDate || "",
          m.chairperson || "",
          m.location || "",
          Array.isArray(m.participants) ? m.participants.length : 0,
          m.status,
          openActions,
          overdueActions,
          (m.decisions || "").replace(/\n/g, " | "),
        ];
      });

      return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\r\n");
    },
  };
}
