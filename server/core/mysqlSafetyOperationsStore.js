import crypto from "crypto";
import fs from "fs";
import mysql from "mysql2/promise";
import path from "path";
import {
  DAILY_DEPARTMENT_CHECKLIST,
  getSafetyChecklistTemplate,
  normalizeChecklistResult
} from "./safetyChecklistTemplate.js";
import {
  localizedTextJson,
  localizedTextJsonOrNull,
  localizedTextValue,
  mergeLocalizedText,
  parseLocalizedText
} from "./localizedText.js";

const hasMysqlConfig = () =>
  !!(process.env.MHCHUB_MYSQL_HOST && process.env.MHCHUB_MYSQL_DATABASE && process.env.MHCHUB_MYSQL_USER);

const envNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const parseMigration = (sql) =>
  sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);

const toMysqlDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace("T", " ");
};

const toIso = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toDateOnly = (value) => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const direct = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const numberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const numberOr = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const text = (value, fallback = "") => String(value ?? fallback).trim();

const textOrNull = (value) => {
  const safe = text(value);
  return safe ? safe : null;
};

const localizedForInput = (input = {}, key, fallback = "") => parseLocalizedText(input[`${key}I18n`] ?? input[key], fallback);

const mergeLocalizedForUpdate = (input = {}, key, current = {}) =>
  mergeLocalizedText(input[`${key}I18n`] ?? input[key], current[`${key}I18n`], current[key]);

const localizedLegacy = (value, fallback = "") => localizedTextValue(value, "vi", fallback);

const parseJson = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeArray = (value) => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim()) return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
};

const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

const codeStamp = () => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
};

const generateCode = (prefix) => `${prefix}-${codeStamp()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

const actorFields = (actor = {}) => ({
  id: actor.id || actor.userId || actor.username || null,
  username: actor.username || actor.id || "system",
  displayName: actor.displayName || actor.username || actor.id || "system",
  role: actor.role || "viewer",
  departmentId: actor.departmentId || actor.department_id || ""
});

const riskLevelFor = (score) => {
  if (score >= 16) return "CRITICAL";
  if (score >= 9) return "HIGH";
  if (score >= 4) return "MEDIUM";
  return "LOW";
};

const rowToWarning = (row) => ({
  id: String(row.id),
  code: row.code || "",
  title: row.title || "",
  titleI18n: parseLocalizedText(row.title_i18n_json, row.title || ""),
  category: row.category || "",
  subcategory: row.subcategory || null,
  department: row.department || "",
  area: row.area || null,
  areaI18n: parseLocalizedText(row.area_i18n_json, row.area || ""),
  productionLine: row.production_line || "",
  machineName: row.machine_name || "",
  locationDetail: row.location_detail || "",
  detectedAt: toIso(row.detected_at),
  coordinator: row.coordinator || "",
  additionalNotes: row.additional_notes || "",
  additionalNotesI18n: parseLocalizedText(row.additional_notes_i18n_json, row.additional_notes || ""),
  riskProbability: Number(row.risk_probability || 0),
  riskConsequence: Number(row.risk_consequence || 0),
  riskScore: Number(row.risk_score || 0),
  riskLevel: row.risk_level || "",
  description: row.description || "",
  descriptionI18n: parseLocalizedText(row.description_i18n_json, row.description || ""),
  currentControl: row.current_control || "",
  currentControlI18n: parseLocalizedText(row.current_control_i18n_json, row.current_control || ""),
  proposedAction: row.proposed_action || "",
  proposedActionI18n: parseLocalizedText(row.proposed_action_i18n_json, row.proposed_action || ""),
  responsiblePerson: row.responsible_person || "",
  deadline: toDateOnly(row.deadline),
  reporterName: row.reporter_name || "",
  evidenceNotes: row.evidence_notes || "",
  evidenceNotesI18n: parseLocalizedText(row.evidence_notes_i18n_json, row.evidence_notes || ""),
  relatedStandard: row.related_standard || "",
  relatedStandardI18n: parseLocalizedText(row.related_standard_i18n_json, row.related_standard || ""),
  status: row.status || "OPEN",
  approvalStatus: row.approval_status || "PENDING",
  rejectionReason: row.rejection_reason || null,
  rejectionReasonI18n: parseLocalizedText(row.rejection_reason_i18n_json, row.rejection_reason || ""),
  submittedByDept: row.submitted_by_dept || "",
  submittedById: row.submitted_by_id || "",
  submittedByName: row.submitted_by_name || "",
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  deletedAt: toIso(row.deleted_at),
  createdByName: row.created_by_name || "",
  updatedByName: row.updated_by_name || "",
  deletedByName: row.deleted_by_name || ""
});

const rowToIncident = (row) => ({
  id: String(row.id),
  code: row.code || "",
  type: row.type || "",
  severity: row.severity || "",
  status: row.status || "IN_PROGRESS",
  department: row.department || "",
  area: row.area || "",
  areaI18n: parseLocalizedText(row.area_i18n_json, row.area || ""),
  description: row.description || "",
  descriptionI18n: parseLocalizedText(row.description_i18n_json, row.description || ""),
  occurredDate: toDateOnly(row.occurred_date),
  occurredTime: row.occurred_time || "",
  reporterName: row.reporter_name || "",
  reporterPhone: row.reporter_phone || "",
  handlerName: row.handler_name || "",
  witnesses: row.witnesses || "",
  witnessesI18n: parseLocalizedText(row.witnesses_i18n_json, row.witnesses || ""),
  bodyPartsAffected: parseJson(row.body_parts_affected_json, []),
  firstAidGiven: row.first_aid_given === 1,
  rootCauseCategory: row.root_cause_category || "",
  rootCauseDetail: row.root_cause_detail || "",
  rootCauseDetailI18n: parseLocalizedText(row.root_cause_detail_i18n_json, row.root_cause_detail || ""),
  immediateAction: row.immediate_action || "",
  immediateActionI18n: parseLocalizedText(row.immediate_action_i18n_json, row.immediate_action || ""),
  correctiveAction: row.corrective_action || "",
  correctiveActionI18n: parseLocalizedText(row.corrective_action_i18n_json, row.corrective_action || ""),
  preventiveAction: row.preventive_action || "",
  preventiveActionI18n: parseLocalizedText(row.preventive_action_i18n_json, row.preventive_action || ""),
  estimatedCost: row.estimated_cost === null || row.estimated_cost === undefined ? null : Number(row.estimated_cost),
  approvalStatus: row.approval_status || "PENDING",
  rejectionReason: row.rejection_reason || null,
  rejectionReasonI18n: parseLocalizedText(row.rejection_reason_i18n_json, row.rejection_reason || ""),
  submittedByDept: row.submitted_by_dept || "",
  submittedById: row.submitted_by_id || "",
  submittedByName: row.submitted_by_name || "",
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  deletedAt: toIso(row.deleted_at),
  createdByName: row.created_by_name || "",
  updatedByName: row.updated_by_name || "",
  deletedByName: row.deleted_by_name || ""
});

const rowToKpi = (row) => ({
  id: String(row.id),
  code: row.code || "",
  entryType: row.entry_type || "",
  periodType: row.period_type || "",
  period: row.period || "",
  departmentCode: row.department_code || "",
  divisionCode: row.division_code || "",
  value: String(row.value ?? "0"),
  target: row.target === null || row.target === undefined ? null : String(row.target),
  unit: row.unit || "",
  notes: row.notes || "",
  notesI18n: parseLocalizedText(row.notes_i18n_json, row.notes || ""),
  approvalStatus: row.approval_status || "pending_l1",
  rejectionReason: row.rejection_reason || null,
  rejectionReasonI18n: parseLocalizedText(row.rejection_reason_i18n_json, row.rejection_reason || ""),
  rejectedByLevel: row.rejected_by_level || null,
  submittedById: row.submitted_by_id || "",
  submittedByName: row.submitted_by_name || "",
  submittedByDept: row.submitted_by_dept || "",
  l1ApprovedById: row.l1_approved_by_id || null,
  l1ApprovedByName: row.l1_approved_by_name || null,
  l1ApprovedAt: toIso(row.l1_approved_at),
  l2ApprovedById: row.l2_approved_by_id || null,
  l2ApprovedByName: row.l2_approved_by_name || null,
  l2ApprovedAt: toIso(row.l2_approved_at),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  deletedAt: toIso(row.deleted_at),
  createdByName: row.created_by_name || "",
  updatedByName: row.updated_by_name || ""
});

const rowToApprovalAction = (row) => ({
  id: String(row.id),
  entityType: row.entity_type || "",
  entityId: row.entity_id || "",
  entityCode: row.entity_code || "",
  action: row.action || "",
  actorId: row.actor_id || "",
  actorName: row.actor_name || "",
  actorRole: row.actor_role || "",
  actorDept: row.actor_dept || "",
  reason: row.reason || "",
  createdAt: toIso(row.created_at)
});

const rowToReport = (row) => ({
  id: String(row.id),
  code: row.code || "",
  title: row.title || "",
  titleI18n: parseLocalizedText(row.title_i18n_json, row.title || ""),
  type: row.type || "",
  period: row.period || "",
  department: row.department || "",
  creator: row.creator || "",
  status: row.status || "NhÃ¡p",
  notes: row.notes || "",
  notesI18n: parseLocalizedText(row.notes_i18n_json, row.notes || ""),
  createdById: row.created_by_id || "",
  createdByName: row.created_by_name || "",
  updatedByName: row.updated_by_name || "",
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  deletedAt: toIso(row.deleted_at)
});

const rowToTraining = (row) => ({
  id: String(row.id),
  code: row.code || "",
  name: row.name || "",
  nameI18n: parseLocalizedText(row.name_i18n_json, row.name || ""),
  category: row.category || "",
  categoryI18n: parseLocalizedText(row.category_i18n_json, row.category || ""),
  trainer: row.trainer || "",
  duration: row.duration || "",
  durationI18n: parseLocalizedText(row.duration_i18n_json, row.duration || ""),
  department: row.department || "",
  enrolled: Number(row.enrolled || 0),
  completed: Number(row.completed || 0),
  dueDate: toDateOnly(row.due_date),
  status: row.status || "ChÆ°a báº¯t Ä‘áº§u",
  notes: row.notes || "",
  notesI18n: parseLocalizedText(row.notes_i18n_json, row.notes || ""),
  createdById: row.created_by_id || "",
  createdByName: row.created_by_name || "",
  updatedByName: row.updated_by_name || "",
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  deletedAt: toIso(row.deleted_at)
});

const rowToNotification = (row) => ({
  id: String(row.id),
  type: row.type || "",
  title: row.title || "",
  titleI18n: parseLocalizedText(row.title_i18n_json, row.title || ""),
  message: row.message || "",
  messageI18n: parseLocalizedText(row.message_i18n_json, row.message || ""),
  page: row.page || "",
  forRoles: row.for_roles || "",
  forDept: row.for_dept || "",
  entityType: row.entity_type || "",
  entityCode: row.entity_code || "",
  readByUserIds: row.read_by_user_ids || "",
  createdAt: toIso(row.created_at)
});

const rowToAttachment = (row) => ({
  id: String(row.id),
  entityType: row.entity_type || "",
  entityId: row.entity_id || "",
  fileName: row.file_name || "",
  objectPath: row.object_path || "",
  contentType: row.content_type || "",
  sizeBytes: Number(row.size_bytes || 0),
  uploadedById: row.uploaded_by_id || "",
  uploadedByName: row.uploaded_by_name || "",
  createdAt: toIso(row.created_at),
  deletedAt: toIso(row.deleted_at),
  deletedById: row.deleted_by_id || "",
  deletedByName: row.deleted_by_name || ""
});

const rowToInspectionPlan = (row) => ({
  id: row.id || "",
  code: row.code || "",
  title: row.title || "",
  type: row.plan_type || "periodic",
  period: row.period || "",
  scopeLevel: row.scope_level || "company",
  scopeCode: row.scope_code || null,
  departments: parseJson(row.departments_json, []),
  scheduledDate: row.scheduled_date ? String(row.scheduled_date).slice(0, 10) : null,
  actualDate: row.actual_date ? String(row.actual_date).slice(0, 10) : null,
  leadInspectorId: row.lead_inspector_id || null,
  leadInspectorName: row.lead_inspector_name || row.lead_inspector || null,
  description: row.description || "",
  objectives: row.objectives || "",
  conclusion: row.conclusion || "",
  notes: row.notes || "",
  priority: row.priority || "normal",
  overallScore: Number(row.overall_score || 0),
  maxScore: Number(row.max_score || 0),
  scorePercent: Number(row.score_percent || 0),
  status: row.status || "draft",
  approvalStatus: row.approval_status || "pending",
  approvedById: row.approved_by_id || null,
  approvedByName: row.approved_by_name || null,
  approvedAt: toIso(row.approved_at),
  rejectionReason: row.rejection_reason || null,
  submittedById: row.submitted_by_id || null,
  submittedByName: row.submitted_by_name || null,
  tags: parseJson(row.tags_json, []),
  auditTrail: parseJson(row.audit_trail_json, []),
  createdById: row.created_by_id || "",
  createdByName: row.created_by_name || "",
  updatedByName: row.updated_by_name || "",
  deletedByName: row.deleted_by_name || "",
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  deletedAt: toIso(row.deleted_at),
});

const rowToMeeting = (row) => ({
  id: String(row.id),
  code: row.code || "",
  period: row.period || "",
  type: row.type || "monthly",
  title: row.title || "",
  meetingDate: row.meeting_date ? String(row.meeting_date).slice(0, 10) : null,
  startTime: row.start_time || "08:00",
  endTime: row.end_time || "09:00",
  location: row.location || "",
  chairperson: row.chairperson || "",
  participants: parseJson(row.participants, []),
  agenda: parseJson(row.agenda, []),
  contentSummary: row.content_summary || "",
  decisions: row.decisions || "",
  actionItems: parseJson(row.action_items, []),
  attachedPlanId: row.attached_plan_id || null,
  status: row.status || "planned",
  approvedById: row.approved_by_id || null,
  approvedByName: row.approved_by_name || null,
  approvedAt: toIso(row.approved_at),
  createdById: row.created_by_id || "",
  createdByName: row.created_by_name || "",
  deletedByName: row.deleted_by_name || "",
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  deletedAt: toIso(row.deleted_at)
});

export const createMysqlSafetyOperationsStore = ({ rootDir }) => {
  if (!hasMysqlConfig()) return null;

  const pool = mysql.createPool({
    host: process.env.MHCHUB_MYSQL_HOST,
    port: envNumber("MHCHUB_MYSQL_PORT", 3306),
    user: process.env.MHCHUB_MYSQL_USER,
    password: process.env.MHCHUB_MYSQL_PASSWORD || "",
    database: process.env.MHCHUB_MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: envNumber("MHCHUB_MYSQL_CONNECTION_LIMIT", 10),
    dateStrings: true,
    timezone: "Z"
  });

  const migrationPath = path.join(rootDir, "database", "migrations", "005_safety_operations_schema.sql");
  let schemaReady = null;

  const ensureSafetyChecklistColumns = async () => {
    const columns = [
      { name: "template_id", ddl: "ADD COLUMN template_id VARCHAR(120) NULL AFTER period" },
      { name: "result_status", ddl: "ADD COLUMN result_status VARCHAR(32) NULL AFTER checked" }
    ];

    for (const column of columns) {
      const [rows] = await pool.query("SHOW COLUMNS FROM safety_checklist_submissions LIKE ?", [column.name]);
      if (!rows.length) {
        await pool.query(`ALTER TABLE safety_checklist_submissions ${column.ddl}`);
      }
    }
  };

  const ensureLocalizedContentColumns = async () => {
    const tableColumns = {
      safety_warnings: [
        ["title_i18n_json", "LONGTEXT NULL"],
        ["area_i18n_json", "LONGTEXT NULL"],
        ["description_i18n_json", "LONGTEXT NULL"],
        ["current_control_i18n_json", "LONGTEXT NULL"],
        ["proposed_action_i18n_json", "LONGTEXT NULL"],
        ["evidence_notes_i18n_json", "LONGTEXT NULL"],
        ["related_standard_i18n_json", "LONGTEXT NULL"],
        ["rejection_reason_i18n_json", "LONGTEXT NULL"]
      ],
      safety_incidents: [
        ["area_i18n_json", "LONGTEXT NULL"],
        ["description_i18n_json", "LONGTEXT NULL"],
        ["witnesses_i18n_json", "LONGTEXT NULL"],
        ["root_cause_detail_i18n_json", "LONGTEXT NULL"],
        ["immediate_action_i18n_json", "LONGTEXT NULL"],
        ["corrective_action_i18n_json", "LONGTEXT NULL"],
        ["preventive_action_i18n_json", "LONGTEXT NULL"],
        ["rejection_reason_i18n_json", "LONGTEXT NULL"]
      ],
      safety_kpi_entries: [
        ["notes_i18n_json", "LONGTEXT NULL"],
        ["rejection_reason_i18n_json", "LONGTEXT NULL"]
      ],
      safety_reports: [
        ["title_i18n_json", "LONGTEXT NULL"],
        ["notes_i18n_json", "LONGTEXT NULL"]
      ],
      safety_training_courses: [
        ["name_i18n_json", "LONGTEXT NULL"],
        ["category_i18n_json", "LONGTEXT NULL"],
        ["duration_i18n_json", "LONGTEXT NULL"],
        ["notes_i18n_json", "LONGTEXT NULL"]
      ],
      safety_notifications: [
        ["title_i18n_json", "LONGTEXT NULL"],
        ["message_i18n_json", "LONGTEXT NULL"]
      ]
    };

    for (const [table, columns] of Object.entries(tableColumns)) {
      for (const [column, definition] of columns) {
        const [rows] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
        if (!rows.length) {
          await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
      }
    }
  };

  const runMigrationFile = async (filePath) => {
    if (!fs.existsSync(filePath)) return;
    const sql = fs.readFileSync(filePath, "utf8");
    for (const stmt of parseMigration(sql)) {
      try { await pool.query(stmt); } catch { /* idempotent â€” column/table may already exist */ }
    }
  };

  const ensureSchema = async () => {
    if (!schemaReady) {
      schemaReady = (async () => {
        const migration = fs.readFileSync(migrationPath, "utf8");
        for (const statement of parseMigration(migration)) {
          await pool.query(statement);
        }
        for (const migrationFile of [
          "008_i18n_complete.sql",
          "009_inspection_plans_schema.sql",
          "010_meeting_normalize.sql",
          "011_employees_schema.sql",
          "012_reporting_views.sql",
          "013_iplan_departments_json.sql"
        ]) {
          await runMigrationFile(path.join(rootDir, "database", "migrations", migrationFile));
        }
        await ensureSafetyChecklistColumns();
        await ensureLocalizedContentColumns();
      })();
    }
    return schemaReady;
  };

  const insertApproval = async ({ entityType, entityId, entityCode, action, actor, reason = "" }) => {
    const safeActor = actorFields(actor);
    await pool.query(
      `INSERT INTO safety_approval_actions
       (entity_type, entity_id, entity_code, action, actor_id, actor_name, actor_role, actor_dept, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entityType,
        entityId,
        entityCode || null,
        action,
        safeActor.id,
        safeActor.displayName,
        safeActor.role,
        safeActor.departmentId || null,
        textOrNull(reason),
        toMysqlDate()
      ]
    );
  };

  const insertNotification = async ({
    type,
    title,
    titleI18n,
    message,
    messageI18n,
    page,
    roles = "",
    dept = "",
    entityType = "",
    entityCode = ""
  }) => {
    const localizedTitle = parseLocalizedText(titleI18n ?? title, title || "");
    const localizedMessage = parseLocalizedText(messageI18n ?? message, message || "");
    await pool.query(
      `INSERT INTO safety_notifications
       (id, type, title, title_i18n_json, message, message_i18n_json, page, for_roles, for_dept, entity_type, entity_code, read_by_user_ids, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId("notification"),
        type,
        localizedLegacy(localizedTitle, title || ""),
        localizedTextJson(localizedTitle),
        localizedLegacy(localizedMessage, message || ""),
        localizedTextJson(localizedMessage),
        page || null,
        roles || null,
        dept || null,
        entityType || null,
        entityCode || null,
        "",
        toMysqlDate()
      ]
    );
  };

  const pagedFlag = (value) => value === true || value === "true" || value === "1" || value === "yes";

  const listRows = async ({
    table,
    mapper,
    query = {},
    columns = "*",
    orderBy = "updated_at DESC, created_at DESC",
    departmentColumn = "department",
    extraWhere
  }) => {
    await ensureSchema();
    const where = ["deleted_at IS NULL"];
    const params = [];
    if (query.dept) {
      where.push(`${departmentColumn} = ?`);
      params.push(String(query.dept));
    }
    if (query.department) {
      where.push(`${departmentColumn} = ?`);
      params.push(String(query.department));
    }
    const approvalStatus = query.approvalStatus || query.approval_status;
    if (approvalStatus) {
      where.push("approval_status = ?");
      params.push(String(approvalStatus));
    }
    if (query.status) {
      where.push("status = ?");
      params.push(String(query.status));
    }
    if (query.period) {
      where.push("period = ?");
      params.push(String(query.period));
    }
    if (typeof extraWhere === "function") {
      extraWhere({ where, params, query });
    }
    const whereSql = where.join(" AND ");
    const wantsPaged = pagedFlag(query.paged) || query.page !== undefined || query.pageSize !== undefined || query.page_size !== undefined;
    if (wantsPaged) {
      const rawPageSize = Number(query.pageSize || query.page_size || query.limit || 20);
      const pageSize = Math.max(1, Math.min(100, Number.isFinite(rawPageSize) ? rawPageSize : 20));
      const requestedPage = Math.max(1, Number(query.page) || 1);
      const [countRows] = await pool.query(`SELECT COUNT(*) AS totalItems FROM ${table} WHERE ${whereSql}`, params);
      const totalItems = Math.max(0, Number(countRows[0]?.totalItems || 0));
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const page = Math.min(requestedPage, totalPages);
      const offset = (page - 1) * pageSize;
      const [rows] = await pool.query(
        `SELECT ${columns} FROM ${table} WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      );
      return {
        items: rows.map(mapper),
        pagination: { page, pageSize, totalItems, totalPages }
      };
    }
    const limit = Math.max(1, Math.min(500, Number(query.limit) || 200));
    const [rows] = await pool.query(
      `SELECT ${columns} FROM ${table} WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ?`,
      [...params, limit]
    );
    return rows.map(mapper);
  };

  const kpiOrderByFor = (sortMode = "latest") => {
    if (sortMode === "oldest") return "period ASC, updated_at ASC, created_at ASC";
    if (sortMode === "value_desc") return "value DESC, period DESC, updated_at DESC";
    if (sortMode === "target_gap") {
      return `CASE
        WHEN target IS NULL THEN 2
        WHEN entry_type = 'violation_warning' AND value <= target THEN 1
        WHEN entry_type <> 'violation_warning' AND value >= target THEN 1
        ELSE 0
      END ASC, period DESC, updated_at DESC`;
    }
    return "period DESC, updated_at DESC, created_at DESC";
  };

  const findById = async (table, id, mapper) => {
    await ensureSchema();
    const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [id]);
    return rows[0] ? mapper(rows[0]) : null;
  };

  const checklistPeriodFilter = (period = "") => {
    const safePeriod = text(period, toDateOnly(new Date()).slice(0, 7));
    if (/^\d{4}-\d{2}$/.test(safePeriod)) {
      return {
        safePeriod,
        whereSql: "(period = ? OR period LIKE ?)",
        params: [safePeriod, `${safePeriod}-%`]
      };
    }
    return {
      safePeriod,
      whereSql: "period = ?",
      params: [safePeriod]
    };
  };

  const checklistCountedSql =
    "(result_status IS NULL OR result_status NOT IN ('pending', 'day_off', 'not_applicable'))";

  return {
    ensureSchema,
    async listWarnings(query = {}) {
      return listRows({
        table: "safety_warnings",
        mapper: rowToWarning,
        query,
        extraWhere: ({ where, params, query }) => {
          const riskLevel = query.riskLevel || query.risk_level;
          if (riskLevel) {
            where.push("risk_level = ?");
            params.push(String(riskLevel));
          }
        }
      });
    },
    async createWarning(input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const id = input.id || newId("warning");
      const probability = Math.max(1, Math.min(5, numberOr(input.riskProbability ?? input.risk_probability, 1)));
      const consequence = Math.max(1, Math.min(5, numberOr(input.riskConsequence ?? input.risk_consequence, 1)));
      const score = probability * consequence;
      const code = text(input.code, generateCode("WARN"));
      const now = toMysqlDate();
      const titleI18n = localizedForInput(input, "title", "Cáº£nh bÃ¡o má»›i");
      const areaI18n = localizedForInput(input, "area", "");
      const descriptionI18n = localizedForInput(input, "description", localizedLegacy(titleI18n, "Cáº£nh bÃ¡o má»›i"));
      const currentControlI18n = localizedForInput(input, "currentControl", "");
      const proposedActionI18n = localizedForInput(input, "proposedAction", "");
      const evidenceNotesI18n = localizedForInput(input, "evidenceNotes", "");
      const relatedStandardI18n = localizedForInput(input, "relatedStandard", "");
      const rejectionReasonI18n = localizedForInput(input, "rejectionReason", "");
      const additionalNotesI18n = localizedForInput(input, "additionalNotes", "");
      await pool.query(
        `INSERT INTO safety_warnings
         (id, code, title, title_i18n_json, category, subcategory, department, area, area_i18n_json,
          risk_probability, risk_consequence, risk_score, risk_level, description, description_i18n_json,
          current_control, current_control_i18n_json, proposed_action, proposed_action_i18n_json,
          responsible_person, deadline, reporter_name, evidence_notes, evidence_notes_i18n_json,
          related_standard, related_standard_i18n_json, status, approval_status, rejection_reason, rejection_reason_i18n_json,
          submitted_by_dept, submitted_by_id, submitted_by_name, created_by_name,
          updated_by_name, created_at, updated_at,
          production_line, machine_name, location_detail, detected_at,
          coordinator, additional_notes, additional_notes_i18n_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          code,
          localizedLegacy(titleI18n, "Cáº£nh bÃ¡o má»›i"),
          localizedTextJson(titleI18n),
          text(input.category, "ENVIRONMENT"),
          textOrNull(input.subcategory),
          text(input.department, safeActor.departmentId || "company"),
          textOrNull(localizedLegacy(areaI18n)),
          localizedTextJsonOrNull(areaI18n),
          probability,
          consequence,
          score,
          text(input.riskLevel, riskLevelFor(score)),
          localizedLegacy(descriptionI18n, localizedLegacy(titleI18n, "Cáº£nh bÃ¡o má»›i")),
          localizedTextJson(descriptionI18n, localizedLegacy(titleI18n, "Cáº£nh bÃ¡o má»›i")),
          textOrNull(localizedLegacy(currentControlI18n)),
          localizedTextJsonOrNull(currentControlI18n),
          textOrNull(localizedLegacy(proposedActionI18n)),
          localizedTextJsonOrNull(proposedActionI18n),
          textOrNull(input.responsiblePerson),
          toDateOnly(input.deadline) || null,
          textOrNull(input.reporterName || safeActor.displayName),
          textOrNull(localizedLegacy(evidenceNotesI18n)),
          localizedTextJsonOrNull(evidenceNotesI18n),
          textOrNull(localizedLegacy(relatedStandardI18n)),
          localizedTextJsonOrNull(relatedStandardI18n),
          text(input.status, "OPEN"),
          text(input.approvalStatus, "PENDING"),
          textOrNull(localizedLegacy(rejectionReasonI18n)),
          localizedTextJsonOrNull(rejectionReasonI18n),
          textOrNull(input.submittedByDept || safeActor.departmentId),
          textOrNull(input.submittedById || safeActor.id),
          textOrNull(input.submittedByName || safeActor.displayName),
          safeActor.displayName,
          safeActor.displayName,
          now,
          now,
          textOrNull(input.productionLine),
          textOrNull(input.machineName),
          textOrNull(input.locationDetail),
          input.detectedAt ? new Date(input.detectedAt) : null,
          textOrNull(input.coordinator),
          textOrNull(localizedLegacy(additionalNotesI18n)),
          localizedTextJsonOrNull(additionalNotesI18n)
        ]
      );
      const created = await findById("safety_warnings", id, rowToWarning);
      await insertApproval({ entityType: "warning", entityId: id, entityCode: code, action: "created", actor: safeActor });
      await insertNotification({
        type: "warning",
        title: "Cáº£nh bÃ¡o nÃ³ng má»›i",
        message: created.title,
        page: "warnings",
        roles: "leader,ehs,admin",
        dept: created.department,
        entityType: "warning",
        entityCode: code
      });
      return created;
    },
    async updateWarning(id, input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const current = await findById("safety_warnings", id, rowToWarning);
      if (!current) return null;
      const probability = input.riskProbability ?? input.risk_probability;
      const consequence = input.riskConsequence ?? input.risk_consequence;
      const nextProbability = probability === undefined ? current.riskProbability : Math.max(1, Math.min(5, numberOr(probability, 1)));
      const nextConsequence = consequence === undefined ? current.riskConsequence : Math.max(1, Math.min(5, numberOr(consequence, 1)));
      const nextScore = nextProbability * nextConsequence;
      const titleI18n = mergeLocalizedForUpdate(input, "title", current);
      const areaI18n = mergeLocalizedForUpdate(input, "area", current);
      const descriptionI18n = mergeLocalizedForUpdate(input, "description", current);
      const currentControlI18n = mergeLocalizedForUpdate(input, "currentControl", current);
      const proposedActionI18n = mergeLocalizedForUpdate(input, "proposedAction", current);
      const evidenceNotesI18n = mergeLocalizedForUpdate(input, "evidenceNotes", current);
      const relatedStandardI18n = mergeLocalizedForUpdate(input, "relatedStandard", current);
      const additionalNotesI18n = mergeLocalizedForUpdate(input, "additionalNotes", current);
      await pool.query(
        `UPDATE safety_warnings SET
          title = ?, title_i18n_json = ?, category = ?, subcategory = ?, department = ?, area = ?, area_i18n_json = ?,
          risk_probability = ?, risk_consequence = ?, risk_score = ?, risk_level = ?, description = ?, description_i18n_json = ?,
          current_control = ?, current_control_i18n_json = ?, proposed_action = ?, proposed_action_i18n_json = ?, responsible_person = ?,
          deadline = ?, reporter_name = ?, evidence_notes = ?, evidence_notes_i18n_json = ?, related_standard = ?, related_standard_i18n_json = ?,
          status = ?, updated_by_name = ?, updated_at = ?,
          production_line = ?, machine_name = ?, location_detail = ?, detected_at = ?,
          coordinator = ?, additional_notes = ?, additional_notes_i18n_json = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [
          localizedLegacy(titleI18n, current.title),
          localizedTextJson(titleI18n),
          text(input.category, current.category),
          textOrNull(input.subcategory ?? current.subcategory),
          text(input.department, current.department),
          textOrNull(localizedLegacy(areaI18n)),
          localizedTextJsonOrNull(areaI18n),
          nextProbability,
          nextConsequence,
          nextScore,
          text(input.riskLevel, riskLevelFor(nextScore)),
          localizedLegacy(descriptionI18n, current.description),
          localizedTextJson(descriptionI18n, current.description),
          textOrNull(localizedLegacy(currentControlI18n)),
          localizedTextJsonOrNull(currentControlI18n),
          textOrNull(localizedLegacy(proposedActionI18n)),
          localizedTextJsonOrNull(proposedActionI18n),
          textOrNull(input.responsiblePerson ?? current.responsiblePerson),
          toDateOnly(input.deadline ?? current.deadline) || null,
          textOrNull(input.reporterName ?? current.reporterName),
          textOrNull(localizedLegacy(evidenceNotesI18n)),
          localizedTextJsonOrNull(evidenceNotesI18n),
          textOrNull(localizedLegacy(relatedStandardI18n)),
          localizedTextJsonOrNull(relatedStandardI18n),
          text(input.status, current.status),
          safeActor.displayName,
          toMysqlDate(),
          textOrNull(input.productionLine ?? current.productionLine),
          textOrNull(input.machineName ?? current.machineName),
          textOrNull(input.locationDetail ?? current.locationDetail),
          input.detectedAt !== undefined ? (input.detectedAt ? new Date(input.detectedAt) : null) : (current.detectedAt ? new Date(current.detectedAt) : null),
          textOrNull(input.coordinator ?? current.coordinator),
          textOrNull(localizedLegacy(additionalNotesI18n)),
          localizedTextJsonOrNull(additionalNotesI18n),
          id
        ]
      );
      await insertApproval({ entityType: "warning", entityId: id, entityCode: current.code, action: "updated", actor: safeActor });
      return findById("safety_warnings", id, rowToWarning);
    },
    async approveWarning(id, actor = {}) {
      await ensureSchema();
      const current = await findById("safety_warnings", id, rowToWarning);
      if (!current) return null;
      const safeActor = actorFields(actor);
      await pool.query(
        "UPDATE safety_warnings SET approval_status = 'APPROVED', rejection_reason = NULL, rejection_reason_i18n_json = NULL, updated_by_name = ?, updated_at = ? WHERE id = ?",
        [safeActor.displayName, toMysqlDate(), id]
      );
      await insertApproval({ entityType: "warning", entityId: id, entityCode: current.code, action: "approved", actor: safeActor });
      return findById("safety_warnings", id, rowToWarning);
    },
    async rejectWarning(id, reason = "", actor = {}) {
      await ensureSchema();
      const current = await findById("safety_warnings", id, rowToWarning);
      if (!current) return null;
      const safeActor = actorFields(actor);
      const reasonI18n = parseLocalizedText(reason, "KhÃ´ng Ä‘áº¡t yÃªu cáº§u");
      await pool.query(
        "UPDATE safety_warnings SET approval_status = 'REJECTED', rejection_reason = ?, rejection_reason_i18n_json = ?, updated_by_name = ?, updated_at = ? WHERE id = ?",
        [localizedLegacy(reasonI18n, "KhÃ´ng Ä‘áº¡t yÃªu cáº§u"), localizedTextJson(reasonI18n), safeActor.displayName, toMysqlDate(), id]
      );
      await insertApproval({ entityType: "warning", entityId: id, entityCode: current.code, action: "rejected", actor: safeActor, reason });
      return findById("safety_warnings", id, rowToWarning);
    },
    async listIncidents(query = {}) {
      return listRows({
        table: "safety_incidents",
        mapper: rowToIncident,
        query,
        extraWhere: ({ where, params, query }) => {
          const statusOrApproval = query.statusOrApproval || query.status_or_approval;
          if (statusOrApproval) {
            where.push("(status = ? OR approval_status = ?)");
            params.push(String(statusOrApproval), String(statusOrApproval));
          }
        }
      });
    },
    async createIncident(input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const id = input.id || newId("incident");
      const code = text(input.code, generateCode("INC"));
      const now = toMysqlDate();
      const areaI18n = localizedForInput(input, "area", "");
      const descriptionI18n = localizedForInput(input, "description", input.type || "Sá»± cá»‘ an toÃ n");
      const witnessesI18n = localizedForInput(input, "witnesses", "");
      const rootCauseDetailI18n = localizedForInput(input, "rootCauseDetail", "");
      const immediateActionI18n = localizedForInput(input, "immediateAction", "");
      const correctiveActionI18n = localizedForInput(input, "correctiveAction", "");
      const preventiveActionI18n = localizedForInput(input, "preventiveAction", "");
      const rejectionReasonI18n = localizedForInput(input, "rejectionReason", "");
      await pool.query(
        `INSERT INTO safety_incidents
         (id, code, type, severity, status, department, area, area_i18n_json, description, description_i18n_json,
          occurred_date, occurred_time, reporter_name, reporter_phone, handler_name, witnesses, witnesses_i18n_json,
          body_parts_affected_json, first_aid_given, root_cause_category, root_cause_detail, root_cause_detail_i18n_json,
          immediate_action, immediate_action_i18n_json, corrective_action, corrective_action_i18n_json,
          preventive_action, preventive_action_i18n_json, estimated_cost, approval_status, rejection_reason, rejection_reason_i18n_json,
          submitted_by_dept, submitted_by_id, submitted_by_name, created_by_name, updated_by_name,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          code,
          text(input.type, "Sá»± cá»‘ an toÃ n"),
          text(input.severity, "Trung bÃ¬nh"),
          text(input.status, "Äang xá»­ lÃ½"),
          text(input.department, safeActor.departmentId || "company"),
          textOrNull(localizedLegacy(areaI18n)),
          localizedTextJsonOrNull(areaI18n),
          localizedLegacy(descriptionI18n, input.type || "Sá»± cá»‘ an toÃ n"),
          localizedTextJson(descriptionI18n, input.type || "Sá»± cá»‘ an toÃ n"),
          toDateOnly(input.occurredDate) || toDateOnly(new Date()),
          textOrNull(input.occurredTime),
          textOrNull(input.reporterName || safeActor.displayName),
          textOrNull(input.reporterPhone),
          textOrNull(input.handlerName),
          textOrNull(localizedLegacy(witnessesI18n)),
          localizedTextJsonOrNull(witnessesI18n),
          JSON.stringify(normalizeArray(input.bodyPartsAffected)),
          input.firstAidGiven ? 1 : 0,
          textOrNull(input.rootCauseCategory),
          textOrNull(localizedLegacy(rootCauseDetailI18n)),
          localizedTextJsonOrNull(rootCauseDetailI18n),
          textOrNull(localizedLegacy(immediateActionI18n)),
          localizedTextJsonOrNull(immediateActionI18n),
          textOrNull(localizedLegacy(correctiveActionI18n)),
          localizedTextJsonOrNull(correctiveActionI18n),
          textOrNull(localizedLegacy(preventiveActionI18n)),
          localizedTextJsonOrNull(preventiveActionI18n),
          numberOrNull(input.estimatedCost),
          text(input.approvalStatus, "PENDING"),
          textOrNull(localizedLegacy(rejectionReasonI18n)),
          localizedTextJsonOrNull(rejectionReasonI18n),
          textOrNull(input.submittedByDept || safeActor.departmentId),
          textOrNull(input.submittedById || safeActor.id),
          textOrNull(input.submittedByName || safeActor.displayName),
          safeActor.displayName,
          safeActor.displayName,
          now,
          now
        ]
      );
      const created = await findById("safety_incidents", id, rowToIncident);
      await insertApproval({ entityType: "incident", entityId: id, entityCode: code, action: "created", actor: safeActor });
      await insertNotification({
        type: "incident",
        title: "BÃ¡o cÃ¡o sá»± cá»‘ má»›i",
        message: created.description,
        page: "incidents",
        roles: "leader,ehs,admin",
        dept: created.department,
        entityType: "incident",
        entityCode: code
      });
      return created;
    },
    async updateIncident(id, input = {}, actor = {}) {
      await ensureSchema();
      const current = await findById("safety_incidents", id, rowToIncident);
      if (!current) return null;
      const safeActor = actorFields(actor);
      const areaI18n = mergeLocalizedForUpdate(input, "area", current);
      const descriptionI18n = mergeLocalizedForUpdate(input, "description", current);
      const witnessesI18n = mergeLocalizedForUpdate(input, "witnesses", current);
      const rootCauseDetailI18n = mergeLocalizedForUpdate(input, "rootCauseDetail", current);
      const immediateActionI18n = mergeLocalizedForUpdate(input, "immediateAction", current);
      const correctiveActionI18n = mergeLocalizedForUpdate(input, "correctiveAction", current);
      const preventiveActionI18n = mergeLocalizedForUpdate(input, "preventiveAction", current);
      await pool.query(
        `UPDATE safety_incidents SET
          type = ?, severity = ?, status = ?, department = ?, area = ?, area_i18n_json = ?, description = ?, description_i18n_json = ?,
          occurred_date = ?, occurred_time = ?, reporter_name = ?, reporter_phone = ?, handler_name = ?, witnesses = ?, witnesses_i18n_json = ?,
          body_parts_affected_json = ?, first_aid_given = ?, root_cause_category = ?, root_cause_detail = ?, root_cause_detail_i18n_json = ?,
          immediate_action = ?, immediate_action_i18n_json = ?, corrective_action = ?, corrective_action_i18n_json = ?,
          preventive_action = ?, preventive_action_i18n_json = ?, estimated_cost = ?, updated_by_name = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [
          text(input.type, current.type),
          text(input.severity, current.severity),
          text(input.status, current.status),
          text(input.department, current.department),
          textOrNull(localizedLegacy(areaI18n)),
          localizedTextJsonOrNull(areaI18n),
          localizedLegacy(descriptionI18n, current.description),
          localizedTextJson(descriptionI18n, current.description),
          toDateOnly(input.occurredDate ?? current.occurredDate) || null,
          textOrNull(input.occurredTime ?? current.occurredTime),
          textOrNull(input.reporterName ?? current.reporterName),
          textOrNull(input.reporterPhone ?? current.reporterPhone),
          textOrNull(input.handlerName ?? current.handlerName),
          textOrNull(localizedLegacy(witnessesI18n)),
          localizedTextJsonOrNull(witnessesI18n),
          JSON.stringify(normalizeArray(input.bodyPartsAffected ?? current.bodyPartsAffected)),
          input.firstAidGiven ?? current.firstAidGiven ? 1 : 0,
          textOrNull(input.rootCauseCategory ?? current.rootCauseCategory),
          textOrNull(localizedLegacy(rootCauseDetailI18n)),
          localizedTextJsonOrNull(rootCauseDetailI18n),
          textOrNull(localizedLegacy(immediateActionI18n)),
          localizedTextJsonOrNull(immediateActionI18n),
          textOrNull(localizedLegacy(correctiveActionI18n)),
          localizedTextJsonOrNull(correctiveActionI18n),
          textOrNull(localizedLegacy(preventiveActionI18n)),
          localizedTextJsonOrNull(preventiveActionI18n),
          numberOrNull(input.estimatedCost ?? current.estimatedCost),
          safeActor.displayName,
          toMysqlDate(),
          id
        ]
      );
      await insertApproval({ entityType: "incident", entityId: id, entityCode: current.code, action: "updated", actor: safeActor });
      return findById("safety_incidents", id, rowToIncident);
    },
    async approveIncident(id, actor = {}) {
      await ensureSchema();
      const current = await findById("safety_incidents", id, rowToIncident);
      if (!current) return null;
      const safeActor = actorFields(actor);
      await pool.query(
        "UPDATE safety_incidents SET approval_status = 'APPROVED', rejection_reason = NULL, rejection_reason_i18n_json = NULL, updated_by_name = ?, updated_at = ? WHERE id = ?",
        [safeActor.displayName, toMysqlDate(), id]
      );
      await insertApproval({ entityType: "incident", entityId: id, entityCode: current.code, action: "approved", actor: safeActor });
      return findById("safety_incidents", id, rowToIncident);
    },
    async rejectIncident(id, reason = "", actor = {}) {
      await ensureSchema();
      const current = await findById("safety_incidents", id, rowToIncident);
      if (!current) return null;
      const safeActor = actorFields(actor);
      const reasonI18n = parseLocalizedText(reason, "KhÃ´ng Ä‘áº¡t yÃªu cáº§u");
      await pool.query(
        "UPDATE safety_incidents SET approval_status = 'REJECTED', rejection_reason = ?, rejection_reason_i18n_json = ?, updated_by_name = ?, updated_at = ? WHERE id = ?",
        [localizedLegacy(reasonI18n, "KhÃ´ng Ä‘áº¡t yÃªu cáº§u"), localizedTextJson(reasonI18n), safeActor.displayName, toMysqlDate(), id]
      );
      await insertApproval({ entityType: "incident", entityId: id, entityCode: current.code, action: "rejected", actor: safeActor, reason });
      return findById("safety_incidents", id, rowToIncident);
    },
    async listIncidentAttachments(id) {
      await ensureSchema();
      const [rows] = await pool.query(
        "SELECT * FROM safety_attachments WHERE entity_type = 'incident' AND entity_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
        [id]
      );
      return rows.map(rowToAttachment);
    },
    async listKpiEntries(query = {}) {
      return listRows({
        table: "safety_kpi_entries",
        mapper: rowToKpi,
        query,
        departmentColumn: "department_code",
        orderBy: kpiOrderByFor(query.sortMode || query.sort),
        extraWhere: ({ where, params, query }) => {
          const entryType = query.entryType || query.entry_type;
          if (entryType) {
            where.push("entry_type = ?");
            params.push(String(entryType));
          }
          const excludeApprovalStatus = query.excludeApprovalStatus || query.exclude_approval_status;
          if (excludeApprovalStatus) {
            where.push("approval_status <> ?");
            params.push(String(excludeApprovalStatus));
          }
          const search = text(query.search || query.q);
          if (search) {
            const like = `%${search}%`;
            where.push("(code LIKE ? OR entry_type LIKE ? OR period LIKE ? OR department_code LIKE ? OR submitted_by_name LIKE ? OR submitted_by_dept LIKE ?)");
            params.push(like, like, like, like, like, like);
          }
        }
      });
    },
    async createKpiEntry(input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const id = input.id || newId("kpi");
      const code = text(input.code, generateCode("KPI"));
      const now = toMysqlDate();
      const notesI18n = localizedForInput(input, "notes", "");
      await pool.query(
        `INSERT INTO safety_kpi_entries
         (id, code, entry_type, period_type, period, department_code, division_code, value, target, unit, notes, notes_i18n_json,
          approval_status, rejection_reason, rejection_reason_i18n_json, rejected_by_level, submitted_by_id, submitted_by_name, submitted_by_dept,
          created_by_name, updated_by_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          code,
          text(input.entryType, "safety_score_monthly"),
          text(input.periodType, "month"),
          text(input.period, toDateOnly(new Date()).slice(0, 7)),
          text(input.departmentCode || input.department, safeActor.departmentId || "company"),
          textOrNull(input.divisionCode),
          numberOr(input.value, 0),
          numberOrNull(input.target),
          textOrNull(input.unit),
          textOrNull(localizedLegacy(notesI18n)),
          localizedTextJsonOrNull(notesI18n),
          text(input.approvalStatus, "pending_l1"),
          null,
          null,
          null,
          textOrNull(input.submittedById || safeActor.id),
          textOrNull(input.submittedByName || safeActor.displayName),
          textOrNull(input.submittedByDept || safeActor.departmentId),
          safeActor.displayName,
          safeActor.displayName,
          now,
          now
        ]
      );
      const created = await findById("safety_kpi_entries", id, rowToKpi);
      await insertApproval({ entityType: "kpi", entityId: id, entityCode: code, action: "submitted", actor: safeActor });
      return created;
    },
    async kpiHistory(id) {
      await ensureSchema();
      const [rows] = await pool.query(
        "SELECT * FROM safety_approval_actions WHERE entity_type = 'kpi' AND entity_id = ? ORDER BY created_at DESC, id DESC",
        [id]
      );
      return rows.map(rowToApprovalAction);
    },
    async approveKpi(id, level, actor = {}) {
      await ensureSchema();
      const current = await findById("safety_kpi_entries", id, rowToKpi);
      if (!current) return null;
      const safeActor = actorFields(actor);
      if (level === 1) {
        await pool.query(
          `UPDATE safety_kpi_entries
           SET approval_status = 'pending_l2', rejection_reason = NULL, rejection_reason_i18n_json = NULL, rejected_by_level = NULL,
               l1_approved_by_id = ?, l1_approved_by_name = ?, l1_approved_at = ?, updated_by_name = ?, updated_at = ?
           WHERE id = ?`,
          [safeActor.id, safeActor.displayName, toMysqlDate(), safeActor.displayName, toMysqlDate(), id]
        );
      } else {
        await pool.query(
          `UPDATE safety_kpi_entries
           SET approval_status = 'approved', rejection_reason = NULL, rejection_reason_i18n_json = NULL, rejected_by_level = NULL,
               l2_approved_by_id = ?, l2_approved_by_name = ?, l2_approved_at = ?, updated_by_name = ?, updated_at = ?
           WHERE id = ?`,
          [safeActor.id, safeActor.displayName, toMysqlDate(), safeActor.displayName, toMysqlDate(), id]
        );
      }
      await insertApproval({ entityType: "kpi", entityId: id, entityCode: current.code, action: `approved_l${level}`, actor: safeActor });
      return findById("safety_kpi_entries", id, rowToKpi);
    },
    async rejectKpi(id, level, reason = "", actor = {}) {
      await ensureSchema();
      const current = await findById("safety_kpi_entries", id, rowToKpi);
      if (!current) return null;
      const safeActor = actorFields(actor);
      const reasonI18n = parseLocalizedText(reason, "KhÃ´ng Ä‘áº¡t yÃªu cáº§u");
      await pool.query(
        `UPDATE safety_kpi_entries
         SET approval_status = ?, rejection_reason = ?, rejection_reason_i18n_json = ?, rejected_by_level = ?, updated_by_name = ?, updated_at = ?
         WHERE id = ?`,
        [`rejected_l${level}`, localizedLegacy(reasonI18n, "KhÃ´ng Ä‘áº¡t yÃªu cáº§u"), localizedTextJson(reasonI18n), `l${level}`, safeActor.displayName, toMysqlDate(), id]
      );
      await insertApproval({ entityType: "kpi", entityId: id, entityCode: current.code, action: `rejected_l${level}`, actor: safeActor, reason });
      return findById("safety_kpi_entries", id, rowToKpi);
    },
    async listChecklist({ dept = "", period = "" } = {}) {
      await ensureSchema();
      const [rows] = await pool.query(
        "SELECT * FROM safety_checklist_submissions WHERE department_code = ? AND period = ? ORDER BY item_id ASC",
        [dept, period]
      );
      return rows.map((row) => ({
        id: String(row.id),
        departmentCode: row.department_code,
        period: row.period,
        templateId: row.template_id || "",
        itemId: Number(row.item_id),
        checked: row.checked === 1,
        resultStatus: row.result_status || (row.checked === 1 ? "pass" : ""),
        status: row.result_status || (row.checked === 1 ? "pass" : ""),
        submittedById: row.submitted_by_id || "",
        submittedByName: row.submitted_by_name || "",
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at)
      }));
    },
    async saveChecklist(input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const dept = text(input.departmentCode || input.dept, safeActor.departmentId || "company");
      const period = text(input.period, toDateOnly(new Date()).slice(0, 7));
      const templateId = text(input.templateId || input.template_id, DAILY_DEPARTMENT_CHECKLIST.id);
      const items = Array.isArray(input.items)
        ? input.items
        : DAILY_DEPARTMENT_CHECKLIST.items.map((item) => ({
            itemId: item.id,
            checked: Boolean(input[`item${item.id}`])
          }));
      const now = toMysqlDate();
      for (const item of items) {
        const status = normalizeChecklistResult(
          item.status || item.resultStatus || item.result_status || (item.checked ? "pass" : "pending")
        );
        const checked = status === "pass";
        await pool.query(
          `INSERT INTO safety_checklist_submissions
           (department_code, period, template_id, item_id, checked, result_status, submitted_by_id, submitted_by_name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE template_id = VALUES(template_id), checked = VALUES(checked), result_status = VALUES(result_status),
             submitted_by_id = VALUES(submitted_by_id),
             submitted_by_name = VALUES(submitted_by_name), updated_at = VALUES(updated_at)`,
          [dept, period, templateId, Number(item.itemId ?? item.id), checked ? 1 : 0, status, safeActor.id, safeActor.displayName, now, now]
        );
      }
      return this.listChecklist({ dept, period });
    },
    async checklistSummary({ period = "" } = {}) {
      await ensureSchema();
      const periodFilter = checklistPeriodFilter(period);
      const [rows] = await pool.query(
        `SELECT department_code AS departmentCode,
                COUNT(CASE WHEN ${checklistCountedSql} THEN 1 END) AS total,
                SUM(CASE WHEN checked = 1 AND ${checklistCountedSql} THEN 1 ELSE 0 END) AS checked
         FROM safety_checklist_submissions
         WHERE ${periodFilter.whereSql}
         GROUP BY department_code
         ORDER BY department_code`,
        periodFilter.params
      );
      return rows.map((row) => ({
        departmentCode: row.departmentCode,
        period: periodFilter.safePeriod,
        total: Number(row.total || 0),
        checked: Number(row.checked || 0),
        score: Number(row.total || 0) ? Math.round((Number(row.checked || 0) / Number(row.total || 1)) * 100) : 0
      }));
    },
    async checklistTemplate() {
      return getSafetyChecklistTemplate();
    },
    async checklistPillarSummary({ period = "" } = {}) {
      const summary = await this.checklistSummary({ period });
      const total = summary.reduce((sum, item) => sum + item.total, 0);
      const checked = summary.reduce((sum, item) => sum + item.checked, 0);
      const score = total ? Math.round((checked / total) * 100) : 0;
      return ["S1", "S2", "S3", "S4", "S5", "S6"].map((pillar, index) => ({
        pillar,
        itemId: index + 1,
        score: Math.max(0, Math.min(100, score - index * 2)),
        total,
        checked
      }));
    },
    async listReports(query = {}) {
      return listRows({
        table: "safety_reports",
        mapper: rowToReport,
        query,
        extraWhere: ({ where, params, query }) => {
          if (query.type) {
            where.push("type = ?");
            params.push(String(query.type));
          }
        }
      });
    },
    async createReport(input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const id = input.id || newId("report");
      const code = text(input.code, generateCode("RPT"));
      const now = toMysqlDate();
      const titleI18n = localizedForInput(input, "title", "BÃ¡o cÃ¡o má»›i");
      const notesI18n = localizedForInput(input, "notes", "");
      await pool.query(
        `INSERT INTO safety_reports
         (id, code, title, title_i18n_json, type, period, department, creator, status, notes, notes_i18n_json,
          created_by_id, created_by_name, updated_by_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          code,
          localizedLegacy(titleI18n, "BÃ¡o cÃ¡o má»›i"),
          localizedTextJson(titleI18n),
          text(input.type, "Safety"),
          textOrNull(input.period),
          text(input.department, safeActor.departmentId || "company"),
          textOrNull(input.creator || safeActor.displayName),
          text(input.status, "NhÃ¡p"),
          textOrNull(localizedLegacy(notesI18n)),
          localizedTextJsonOrNull(notesI18n),
          safeActor.id,
          safeActor.displayName,
          safeActor.displayName,
          now,
          now
        ]
      );
      return findById("safety_reports", id, rowToReport);
    },
    async updateReport(id, input = {}, actor = {}) {
      await ensureSchema();
      const current = await findById("safety_reports", id, rowToReport);
      if (!current) return null;
      const safeActor = actorFields(actor);
      const titleI18n = mergeLocalizedForUpdate(input, "title", current);
      const notesI18n = mergeLocalizedForUpdate(input, "notes", current);
      await pool.query(
        `UPDATE safety_reports SET title = ?, title_i18n_json = ?, type = ?, period = ?, department = ?, creator = ?, status = ?, notes = ?, notes_i18n_json = ?,
         updated_by_name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
        [
          localizedLegacy(titleI18n, current.title),
          localizedTextJson(titleI18n),
          text(input.type, current.type),
          textOrNull(input.period ?? current.period),
          text(input.department, current.department),
          textOrNull(input.creator ?? current.creator),
          text(input.status, current.status),
          textOrNull(localizedLegacy(notesI18n)),
          localizedTextJsonOrNull(notesI18n),
          safeActor.displayName,
          toMysqlDate(),
          id
        ]
      );
      return findById("safety_reports", id, rowToReport);
    },
    async deleteReport(id, actor = {}) {
      const safeActor = actorFields(actor);
      await ensureSchema();
      await pool.query("UPDATE safety_reports SET deleted_at = ?, updated_by_name = ?, updated_at = ? WHERE id = ?", [
        toMysqlDate(),
        safeActor.displayName,
        toMysqlDate(),
        id
      ]);
      return { id, deleted: true };
    },
    async listTrainingCourses(query = {}) {
      return listRows({ table: "safety_training_courses", mapper: rowToTraining, query });
    },
    async createTrainingCourse(input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const id = input.id || newId("training");
      const code = text(input.code, generateCode("TRN"));
      const now = toMysqlDate();
      const nameI18n = localizedForInput(input, "name", "KhÃ³a Ä‘Ã o táº¡o má»›i");
      const categoryI18n = localizedForInput(input, "category", "");
      const durationI18n = localizedForInput(input, "duration", "");
      const notesI18n = localizedForInput(input, "notes", "");
      await pool.query(
        `INSERT INTO safety_training_courses
         (id, code, name, name_i18n_json, category, category_i18n_json, trainer, duration, duration_i18n_json,
          department, enrolled, completed, due_date, status, notes, notes_i18n_json,
          created_by_id, created_by_name, updated_by_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          code,
          localizedLegacy(nameI18n, "KhÃ³a Ä‘Ã o táº¡o má»›i"),
          localizedTextJson(nameI18n),
          textOrNull(localizedLegacy(categoryI18n)),
          localizedTextJsonOrNull(categoryI18n),
          textOrNull(input.trainer),
          textOrNull(localizedLegacy(durationI18n)),
          localizedTextJsonOrNull(durationI18n),
          text(input.department, safeActor.departmentId || "company"),
          numberOr(input.enrolled, 0),
          numberOr(input.completed, 0),
          toDateOnly(input.dueDate) || null,
          text(input.status, "ChÆ°a báº¯t Ä‘áº§u"),
          textOrNull(localizedLegacy(notesI18n)),
          localizedTextJsonOrNull(notesI18n),
          safeActor.id,
          safeActor.displayName,
          safeActor.displayName,
          now,
          now
        ]
      );
      return findById("safety_training_courses", id, rowToTraining);
    },
    async updateTrainingCourse(id, input = {}, actor = {}) {
      await ensureSchema();
      const current = await findById("safety_training_courses", id, rowToTraining);
      if (!current) return null;
      const safeActor = actorFields(actor);
      const nameI18n = mergeLocalizedForUpdate(input, "name", current);
      const categoryI18n = mergeLocalizedForUpdate(input, "category", current);
      const durationI18n = mergeLocalizedForUpdate(input, "duration", current);
      const notesI18n = mergeLocalizedForUpdate(input, "notes", current);
      await pool.query(
        `UPDATE safety_training_courses SET name = ?, name_i18n_json = ?, category = ?, category_i18n_json = ?, trainer = ?,
          duration = ?, duration_i18n_json = ?, department = ?, enrolled = ?, completed = ?, due_date = ?, status = ?,
          notes = ?, notes_i18n_json = ?, updated_by_name = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [
          localizedLegacy(nameI18n, current.name),
          localizedTextJson(nameI18n),
          textOrNull(localizedLegacy(categoryI18n)),
          localizedTextJsonOrNull(categoryI18n),
          textOrNull(input.trainer ?? current.trainer),
          textOrNull(localizedLegacy(durationI18n)),
          localizedTextJsonOrNull(durationI18n),
          text(input.department, current.department),
          numberOr(input.enrolled, current.enrolled),
          numberOr(input.completed, current.completed),
          toDateOnly(input.dueDate ?? current.dueDate) || null,
          text(input.status, current.status),
          textOrNull(localizedLegacy(notesI18n)),
          localizedTextJsonOrNull(notesI18n),
          safeActor.displayName,
          toMysqlDate(),
          id
        ]
      );
      return findById("safety_training_courses", id, rowToTraining);
    },
    async deleteTrainingCourse(id, actor = {}) {
      const safeActor = actorFields(actor);
      await ensureSchema();
      await pool.query("UPDATE safety_training_courses SET deleted_at = ?, updated_by_name = ?, updated_at = ? WHERE id = ?", [
        toMysqlDate(),
        safeActor.displayName,
        toMysqlDate(),
        id
      ]);
      return { id, deleted: true };
    },
    async listNotifications(actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const [rows] = await pool.query(
        `SELECT * FROM safety_notifications
         WHERE (for_roles IS NULL OR for_roles = '' OR FIND_IN_SET(?, REPLACE(for_roles, ' ', '')) > 0)
           AND (for_dept IS NULL OR for_dept = '' OR for_dept = ?)
         ORDER BY created_at DESC LIMIT 100`,
        [safeActor.role, safeActor.departmentId || ""]
      );
      return rows.map(rowToNotification);
    },
    async markNotificationRead(id, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const [rows] = await pool.query("SELECT read_by_user_ids FROM safety_notifications WHERE id = ? LIMIT 1", [id]);
      const current = new Set(String(rows[0]?.read_by_user_ids || "").split(",").filter(Boolean));
      if (safeActor.id) current.add(safeActor.id);
      await pool.query("UPDATE safety_notifications SET read_by_user_ids = ? WHERE id = ?", [[...current].join(","), id]);
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
      await ensureSchema();
      const id = `notif-${crypto.randomUUID()}`;
      const now = toMysqlDate();
      await pool.query(
        `INSERT INTO safety_notifications
          (id, type, entity_type, title, title_i18n, message, message_i18n, page, for_roles, for_dept, read_by_user_ids, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)`,
        [
          id,
          notification.type || "info",
          notification.entityType || "",
          notification.title || "",
          JSON.stringify(notification.titleI18n || {}),
          notification.message || "",
          JSON.stringify(notification.messageI18n || {}),
          notification.page || "",
          notification.forRoles || "",
          notification.forDept || "",
          now
        ]
      );
      return { id, ...notification, createdAt: new Date().toISOString() };
    },
    async getProfile(actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const [rows] = await pool.query("SELECT * FROM user_profiles WHERE user_id = ? LIMIT 1", [safeActor.id]);
      return {
        userId: safeActor.id,
        displayName: rows[0]?.display_name || safeActor.displayName,
        email: rows[0]?.email || "",
        phone: rows[0]?.phone || "",
        updatedAt: toIso(rows[0]?.updated_at)
      };
    },
    async updateProfile(input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const now = toMysqlDate();
      await pool.query(
        `INSERT INTO user_profiles (user_id, display_name, email, phone, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), email = VALUES(email), phone = VALUES(phone), updated_at = VALUES(updated_at)`,
        [safeActor.id, textOrNull(input.displayName), textOrNull(input.email), textOrNull(input.phone), now]
      );
      return this.getProfile(actor);
    },
    async activityFeed({ limit = 8 } = {}) {
      await ensureSchema();
      const [rows] = await pool.query(
        `SELECT entity_type, entity_code, action, actor_name, created_at
         FROM safety_approval_actions ORDER BY created_at DESC, id DESC LIMIT ?`,
        [Math.max(1, Math.min(50, Number(limit) || 8))]
      );
      return rows.map((row) => ({
        id: `${row.entity_type}-${row.entity_code}-${row.created_at}`,
        type: row.entity_type,
        title: `${row.action} ${row.entity_code || ""}`.trim(),
        actorName: row.actor_name || "",
        createdAt: toIso(row.created_at)
      }));
    },

    // â”€â”€â”€ Inspection Plans â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async listInspectionPlans(query = {}) {
      await ensureSchema();
      const where = ["deleted_at IS NULL"];
      const params = [];
      if (query.period) { where.push("period = ?"); params.push(String(query.period)); }
      if (query.year)   { where.push("period LIKE ?"); params.push(`${String(query.year)}%`); }
      if (query.status) { where.push("status = ?"); params.push(String(query.status)); }
      if (query.type)   { where.push("plan_type = ?"); params.push(String(query.type)); }
      if (query.q || query.search) {
        const q = String(query.q || query.search);
        where.push("(title LIKE ? OR code LIKE ?)");
        params.push(`%${q}%`, `%${q}%`);
      }
      const whereSql = where.join(" AND ");
      const limit = Math.max(1, Math.min(200, Number(query.limit) || 100));
      const [rows] = await pool.query(
        `SELECT * FROM inspection_plans WHERE ${whereSql} ORDER BY period DESC, created_at DESC LIMIT ?`,
        [...params, limit]
      );
      const items = rows.map(rowToInspectionPlan);
      return { items, total: items.length };
    },

    async getInspectionPlan(id) {
      await ensureSchema();
      const [rows] = await pool.query(
        "SELECT * FROM inspection_plans WHERE id = ? AND deleted_at IS NULL LIMIT 1", [id]
      );
      return rows.length ? rowToInspectionPlan(rows[0]) : null;
    },

    async createInspectionPlan(input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const now = toMysqlDate();
      const period = text(input.period, new Date().toISOString().slice(0, 7));
      const code   = generateCode("KH");
      const id     = newId("iplan");
      const departments = Array.isArray(input.departments) ? input.departments : [];
      await pool.query(
        `INSERT INTO inspection_plans
         (id, code, title, plan_type, period, scope_level, scope_code,
          departments_json, notes, priority, lead_inspector,
          scheduled_date, actual_date, lead_inspector_name,
          description, objectives, overall_score, max_score, score_percent,
          status, approval_status, submitted_by_id, submitted_by_name,
          created_by_id, created_by_name, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id, code,
          text(input.title, `Káº¿ hoáº¡ch kiá»ƒm tra ${period}`),
          text(input.type || input.planType, "periodic"),
          period,
          text(input.scopeLevel, "company"),
          textOrNull(input.scopeCode),
          JSON.stringify(departments),
          textOrNull(input.notes),
          text(input.priority, "normal"),
          textOrNull(input.leadInspectorName || input.leadInspector),
          input.scheduledDate ? toMysqlDate(new Date(input.scheduledDate)) : null,
          input.actualDate   ? toMysqlDate(new Date(input.actualDate))    : null,
          textOrNull(input.leadInspectorName),
          textOrNull(input.description),
          textOrNull(input.objectives),
          0, 0, 0,
          text(input.status, "draft"),
          "pending",
          safeActor.id,
          safeActor.displayName,
          safeActor.id,
          safeActor.displayName,
          now, now
        ]
      );
      return this.getInspectionPlan(id);
    },

    async updateInspectionPlan(id, input = {}, actor = {}) {
      await ensureSchema();
      const [rows] = await pool.query(
        "SELECT * FROM inspection_plans WHERE id = ? AND deleted_at IS NULL LIMIT 1", [id]
      );
      if (!rows.length) return null;
      const now = toMysqlDate();
      const updates = [];
      const params  = [];
      const allowed = ["title","type","planType","period","scopeLevel","scopeCode","departments",
                       "notes","priority","leadInspectorName","leadInspector","scheduledDate","actualDate",
                       "description","objectives","conclusion","status","overallScore","maxScore","scorePercent"];
      for (const key of allowed) {
        if (input[key] === undefined) continue;
        if (key === "departments") {
          updates.push("departments_json = ?");
          params.push(JSON.stringify(Array.isArray(input.departments) ? input.departments : []));
        } else if (key === "scheduledDate") {
          updates.push("scheduled_date = ?");
          params.push(input.scheduledDate ? toMysqlDate(new Date(input.scheduledDate)) : null);
        } else if (key === "actualDate") {
          updates.push("actual_date = ?");
          params.push(input.actualDate ? toMysqlDate(new Date(input.actualDate)) : null);
        } else if (key === "planType" || key === "type") {
          updates.push("plan_type = ?"); params.push(String(input[key]));
        } else if (key === "leadInspectorName" || key === "leadInspector") {
          updates.push("lead_inspector = ?"); params.push(textOrNull(input[key]));
          updates.push("lead_inspector_name = ?"); params.push(textOrNull(input[key]));
        } else if (key === "scopeLevel") {
          updates.push("scope_level = ?"); params.push(String(input.scopeLevel));
        } else if (key === "scopeCode") {
          updates.push("scope_code = ?"); params.push(textOrNull(input.scopeCode));
        } else if (key === "overallScore") {
          updates.push("overall_score = ?"); params.push(Number(input.overallScore) || 0);
        } else if (key === "maxScore") {
          updates.push("max_score = ?"); params.push(Number(input.maxScore) || 0);
        } else if (key === "scorePercent") {
          updates.push("score_percent = ?"); params.push(Number(input.scorePercent) || 0);
        } else {
          const col = key.replace(/([A-Z])/g, "_$1").toLowerCase();
          updates.push(`${col} = ?`); params.push(input[key]);
        }
      }
      if (!updates.length) return rowToInspectionPlan(rows[0]);
      updates.push("updated_at = ?"); params.push(now);
      params.push(id);
      await pool.query(`UPDATE inspection_plans SET ${updates.join(", ")} WHERE id = ?`, params);
      return this.getInspectionPlan(id);
    },

    async approveInspectionPlan(id, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const [rows] = await pool.query(
        "SELECT id FROM inspection_plans WHERE id = ? AND deleted_at IS NULL LIMIT 1", [id]
      );
      if (!rows.length) return null;
      const now = toMysqlDate();
      await pool.query(
        `UPDATE inspection_plans SET
           status = 'approved', approval_status = 'approved',
           approved_by_id = ?, approved_by_name = ?, approved_at = ?, updated_at = ?
         WHERE id = ?`,
        [safeActor.id, safeActor.displayName, now, now, id]
      );
      return this.getInspectionPlan(id);
    },

    async cancelInspectionPlan(id, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const [rows] = await pool.query(
        "SELECT id FROM inspection_plans WHERE id = ? AND deleted_at IS NULL LIMIT 1", [id]
      );
      if (!rows.length) return null;
      const now = toMysqlDate();
      await pool.query(
        `UPDATE inspection_plans SET status = 'cancelled', updated_at = ?, updated_by_name = ? WHERE id = ?`,
        [now, safeActor.displayName, id]
      );
      return this.getInspectionPlan(id);
    },

    async updatePlanDepartment(id, deptCode, input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const [rows] = await pool.query(
        "SELECT * FROM inspection_plans WHERE id = ? AND deleted_at IS NULL LIMIT 1", [id]
      );
      if (!rows.length) return null;
      const plan = rowToInspectionPlan(rows[0]);
      const depts = Array.isArray(plan.departments) ? [...plan.departments] : [];
      const idx = depts.findIndex((d) => d.deptCode === deptCode);
      if (idx === -1) return null;
      depts[idx] = { ...depts[idx], ...input, deptCode, updatedByName: safeActor.displayName };
      await pool.query(
        "UPDATE inspection_plans SET departments_json = ?, updated_at = ?, updated_by_name = ? WHERE id = ?",
        [JSON.stringify(depts), toMysqlDate(), safeActor.displayName, id]
      );
      return this.getInspectionPlan(id);
    },

    async deleteInspectionPlan(id, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const [rows] = await pool.query(
        "SELECT id FROM inspection_plans WHERE id = ? AND deleted_at IS NULL LIMIT 1", [id]
      );
      if (!rows.length) return { ok: false };
      await pool.query(
        "UPDATE inspection_plans SET deleted_at = ?, deleted_by_name = ? WHERE id = ?",
        [toMysqlDate(), safeActor.displayName, id]
      );
      return { ok: true };
    },

    // â”€â”€â”€ Safety Meetings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async listSafetyMeetings(query = {}) {
      await ensureSchema();
      const where = ["deleted_at IS NULL"];
      const params = [];
      if (query.period) { where.push("period = ?"); params.push(String(query.period)); }
      if (query.year)   { where.push("period LIKE ?"); params.push(`${String(query.year)}%`); }
      if (query.status) { where.push("status = ?"); params.push(String(query.status)); }
      if (query.type)   { where.push("type = ?"); params.push(String(query.type)); }
      if (query.q || query.search) {
        const q = String(query.q || query.search);
        where.push("(title LIKE ? OR code LIKE ? OR chairperson LIKE ?)");
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
      const whereSql = where.join(" AND ");
      const limit = Math.max(1, Math.min(200, Number(query.limit) || 100));
      const [rows] = await pool.query(
        `SELECT * FROM safety_meetings WHERE ${whereSql} ORDER BY meeting_date DESC, created_at DESC LIMIT ?`,
        [...params, limit]
      );
      const items = rows.map(rowToMeeting);
      return { items, total: items.length };
    },

    async getSafetyMeeting(id) {
      await ensureSchema();
      const [rows] = await pool.query(
        "SELECT * FROM safety_meetings WHERE id = ? AND deleted_at IS NULL LIMIT 1", [id]
      );
      return rows.length ? rowToMeeting(rows[0]) : null;
    },

    async createSafetyMeeting(input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const now = toMysqlDate();
      const period = text(input.period, new Date().toISOString().slice(0, 7));
      const code = generateCode("HOP");
      const id = newId("meeting");
      const agenda = Array.isArray(input.agenda) ? input.agenda.map((a, i) => ({
        id: `agenda-${i + 1}`, order: i + 1,
        topic: text(a.topic), presenter: text(a.presenter),
        duration: Number(a.duration) || 15, notes: text(a.notes)
      })) : [];
      const actionItems = Array.isArray(input.actionItems) ? input.actionItems.map((item, i) => ({
        id: newId("action"), order: i + 1,
        content: text(item.content), assignee: text(item.assignee),
        dueDate: item.dueDate || null, status: "open", completedAt: null
      })) : [];
      await pool.query(
        `INSERT INTO safety_meetings
         (id, code, period, type, title, meeting_date, start_time, end_time, location, chairperson,
          participants, agenda, content_summary, decisions, action_items, attached_plan_id,
          status, created_by_id, created_by_name, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id, code, period,
          text(input.type, "monthly"),
          text(input.title, `Há»p an toÃ n thÃ¡ng ${period}`),
          input.meetingDate ? toMysqlDate(new Date(input.meetingDate)) : null,
          text(input.startTime, "08:00"),
          text(input.endTime, "09:00"),
          textOrNull(input.location),
          textOrNull(input.chairperson),
          JSON.stringify(Array.isArray(input.participants) ? input.participants : []),
          JSON.stringify(agenda),
          textOrNull(input.contentSummary),
          textOrNull(input.decisions),
          JSON.stringify(actionItems),
          textOrNull(input.attachedPlanId),
          text(input.status, "planned"),
          safeActor.id,
          safeActor.displayName,
          now, now
        ]
      );
      return this.getSafetyMeeting(id);
    },

    async updateSafetyMeeting(id, input = {}, actor = {}) {
      await ensureSchema();
      const [rows] = await pool.query(
        "SELECT * FROM safety_meetings WHERE id = ? AND deleted_at IS NULL LIMIT 1", [id]
      );
      if (!rows.length) return null;
      const current = rows[0];
      const now = toMysqlDate();
      const allowed = ["title","type","period","meetingDate","startTime","endTime","location","chairperson","participants","agenda","contentSummary","decisions","actionItems","attachedPlanId","status"];
      const updates = [];
      const params = [];
      for (const key of allowed) {
        if (input[key] === undefined) continue;
        if (key === "meetingDate") {
          updates.push("meeting_date = ?");
          params.push(input.meetingDate ? toMysqlDate(new Date(input.meetingDate)) : null);
        } else if (key === "startTime") {
          updates.push("start_time = ?"); params.push(text(input.startTime, current.start_time));
        } else if (key === "endTime") {
          updates.push("end_time = ?"); params.push(text(input.endTime, current.end_time));
        } else if (key === "contentSummary") {
          updates.push("content_summary = ?"); params.push(textOrNull(input.contentSummary));
        } else if (key === "attachedPlanId") {
          updates.push("attached_plan_id = ?"); params.push(textOrNull(input.attachedPlanId));
        } else if (key === "participants" || key === "agenda" || key === "actionItems") {
          const col = key === "actionItems" ? "action_items" : key;
          updates.push(`${col} = ?`); params.push(JSON.stringify(Array.isArray(input[key]) ? input[key] : []));
        } else {
          const col = key.replace(/([A-Z])/g, "_$1").toLowerCase();
          updates.push(`${col} = ?`); params.push(input[key]);
        }
      }
      if (!updates.length) return rowToMeeting(current);
      updates.push("updated_at = ?"); params.push(now);
      params.push(id);
      await pool.query(`UPDATE safety_meetings SET ${updates.join(", ")} WHERE id = ?`, params);
      return this.getSafetyMeeting(id);
    },

    async completeSafetyMeeting(id, input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const now = toMysqlDate();
      const [rows] = await pool.query(
        "SELECT id FROM safety_meetings WHERE id = ? AND deleted_at IS NULL LIMIT 1", [id]
      );
      if (!rows.length) return null;
      await pool.query(
        `UPDATE safety_meetings SET
           status = 'completed',
           content_summary = COALESCE(?, content_summary),
           decisions = COALESCE(?, decisions),
           approved_by_id = ?, approved_by_name = ?, approved_at = ?, updated_at = ?
         WHERE id = ?`,
        [
          textOrNull(input.contentSummary),
          textOrNull(input.decisions),
          safeActor.id, safeActor.displayName, now, now, id
        ]
      );
      return this.getSafetyMeeting(id);
    },

    async updateMeetingActionItem(meetingId, actionItemId, input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const [rows] = await pool.query(
        "SELECT * FROM safety_meetings WHERE id = ? AND deleted_at IS NULL LIMIT 1", [meetingId]
      );
      if (!rows.length) return null;
      const current = rows[0];
      const actionItems = parseJson(current.action_items, []);
      const updatedItems = actionItems.map((item) => {
        if (item.id !== actionItemId) return item;
        const newStatus = input.status !== undefined ? input.status : item.status;
        return {
          ...item,
          status: newStatus,
          assignee: input.assignee !== undefined ? input.assignee : item.assignee,
          dueDate: input.dueDate !== undefined ? input.dueDate : item.dueDate,
          content: input.content !== undefined ? input.content : item.content,
          completedAt: newStatus === "closed" ? new Date().toISOString() : item.completedAt,
          updatedByName: safeActor.displayName
        };
      });
      const found = updatedItems.some((item) => item.id === actionItemId);
      if (!found) return null;
      await pool.query(
        "UPDATE safety_meetings SET action_items = ?, updated_at = ? WHERE id = ?",
        [JSON.stringify(updatedItems), toMysqlDate(), meetingId]
      );
      return this.getSafetyMeeting(meetingId);
    },

    async deleteSafetyMeeting(id, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const [rows] = await pool.query(
        "SELECT id FROM safety_meetings WHERE id = ? AND deleted_at IS NULL LIMIT 1", [id]
      );
      if (!rows.length) return { ok: false };
      await pool.query(
        "UPDATE safety_meetings SET deleted_at = ?, deleted_by_name = ? WHERE id = ?",
        [toMysqlDate(), safeActor.displayName, id]
      );
      return { ok: true };
    },

    // â”€â”€â”€ Summary & Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async inspectionPlanSummary({ year } = {}) {
      await ensureSchema();
      const where = ["deleted_at IS NULL"];
      const params = [];
      if (year) { where.push("period LIKE ?"); params.push(`${String(year)}%`); }
      const [rows] = await pool.query(
        `SELECT id, status, plan_type, period, departments_json
         FROM inspection_plans WHERE ${where.join(" AND ")}`,
        params
      );

      const byStatus = { draft: 0, approved: 0, in_progress: 0, completed: 0, cancelled: 0 };
      const byType = {};
      const deptMap = {};
      let openCapa = 0, criticalCapa = 0;

      for (const row of rows) {
        byStatus[row.status] = (byStatus[row.status] || 0) + 1;
        byType[row.plan_type] = (byType[row.plan_type] || 0) + 1;
        const departments = parseJson(row.departments_json, []);
        for (const dept of departments) {
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
        deptCode, divisionCode: d.divisionCode,
        total: d.total, done: d.done, inProgress: d.inProgress, pending: d.pending,
        pct: d.total ? Math.round((d.done / d.total) * 100) : 0,
        avgScore: d.scoreN ? Math.round((d.scoreSum / d.scoreN) * 10) / 10 : null,
      }));

      const divMap = {};
      for (const dept of deptProgress) {
        const div = dept.divisionCode || "other";
        if (!divMap[div]) divMap[div] = { divisionCode: div, total: 0, done: 0, inProgress: 0, pending: 0 };
        const d = divMap[div];
        d.total += dept.total; d.done += dept.done; d.inProgress += dept.inProgress; d.pending += dept.pending;
      }

      return {
        year: year ? String(year) : null,
        totalPlans: rows.length,
        byStatus, byType,
        deptProgress,
        divisionProgress: Object.values(divMap).map((d) => ({ ...d, pct: d.total ? Math.round((d.done / d.total) * 100) : 0 })),
        openCorrectiveActions: openCapa,
        criticalCorrectiveActions: criticalCapa,
      };
    },

    async safetyMeetingSummary({ year } = {}) {
      await ensureSchema();
      const where = ["deleted_at IS NULL"];
      const params = [];
      if (year) { where.push("period LIKE ?"); params.push(`${String(year)}%`); }
      const [rows] = await pool.query(
        `SELECT id, status, type, period, meeting_date, participants, action_items
         FROM safety_meetings WHERE ${where.join(" AND ")}`,
        params
      );

      const byType = {};
      const byPeriodMap = {};
      let totalActionItems = 0, openActionItems = 0, overdueActionItems = 0, totalParticipants = 0;
      const now = toDateOnly(new Date());

      for (const row of rows) {
        byType[row.type] = (byType[row.type] || 0) + 1;
        const period = row.period || (row.meeting_date ? String(row.meeting_date).slice(0, 7) : "unknown");
        if (!byPeriodMap[period]) byPeriodMap[period] = { period, count: 0, completed: 0, planned: 0 };
        byPeriodMap[period].count++;
        if (row.status === "completed") byPeriodMap[period].completed++;
        else byPeriodMap[period].planned++;
        totalParticipants += parseJson(row.participants, []).length;
        for (const item of parseJson(row.action_items, [])) {
          totalActionItems++;
          if (item.status === "open") {
            openActionItems++;
            if (item.dueDate && item.dueDate < now) overdueActionItems++;
          }
        }
      }

      const completed = rows.filter((r) => r.status === "completed").length;
      const planned   = rows.filter((r) => r.status === "planned").length;
      const cancelled = rows.filter((r) => r.status === "cancelled").length;

      return {
        year: year ? String(year) : null,
        total: rows.length, completed, planned, cancelled,
        completionRate: rows.length ? Math.round((completed / rows.length) * 100) : 0,
        byType,
        byPeriod: Object.values(byPeriodMap).sort((a, b) => a.period.localeCompare(b.period)),
        totalActionItems, openActionItems, overdueActionItems, totalParticipants,
      };
    },

    async deptReport({ dept, year } = {}) {
      await ensureSchema();
      const deptCode = String(dept || "");
      const yearStr  = year ? String(year) : null;
      const yearLike = yearStr ? `${yearStr}%` : null;

      const planParams = ["deleted_at IS NULL"];
      const planArgs   = [];
      if (yearLike) { planParams.push("period LIKE ?"); planArgs.push(yearLike); }
      const [planRows] = await pool.query(
        `SELECT id, code, title, period, status, departments_json FROM inspection_plans WHERE ${planParams.join(" AND ")}`,
        planArgs
      );

      const deptDepts = planRows.flatMap((p) => {
        const depts = parseJson(p.departments_json, []);
        return depts.filter((d) => d.deptCode === deptCode).map((d) => ({
          ...d, planCode: p.code, planPeriod: p.period, planStatus: p.status, planTitle: p.title
        }));
      });
      const deptPlanDone = deptDepts.filter((d) => d.status === "done" || d.status === "skipped").length;
      const deptCapa     = deptDepts.flatMap((d) => (d.corrective || []));

      const warnArgs = [deptCode, deptCode];
      const [warnRows] = await pool.query(
        `SELECT id, approval_status, risk_level FROM safety_warnings WHERE deleted_at IS NULL AND (department = ? OR submitted_by_dept = ?)${yearLike ? " AND period LIKE ?" : ""}`,
        yearLike ? [...warnArgs, yearLike] : warnArgs
      );

      const [incRows] = await pool.query(
        `SELECT id, status FROM safety_incidents WHERE deleted_at IS NULL AND department = ?${yearLike ? " AND period LIKE ?" : ""}`,
        yearLike ? [deptCode, yearLike] : [deptCode]
      );

      const [meetRows] = await pool.query(
        `SELECT id, status FROM safety_meetings WHERE deleted_at IS NULL${yearLike ? " AND period LIKE ?" : ""}`,
        yearLike ? [yearLike] : []
      );

      const byRisk = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
      for (const w of warnRows) byRisk[w.risk_level] = (byRisk[w.risk_level] || 0) + 1;

      return {
        dept: deptCode, year: yearStr,
        generatedAt: new Date().toISOString(),
        inspectionPlans: {
          plansIncluded: planRows.length,
          deptRowsTotal: deptDepts.length,
          deptRowsDone:  deptPlanDone,
          pct: deptDepts.length ? Math.round((deptPlanDone / deptDepts.length) * 100) : 0,
          openCapa:     deptCapa.filter((c) => c.status === "open" || c.status === "overdue").length,
          criticalCapa: deptCapa.filter((c) => c.severity === "critical" || c.status === "overdue").length,
          rows: deptDepts,
        },
        warnings: {
          total:    warnRows.length,
          open:     warnRows.filter((w) => w.approval_status !== "APPROVED").length,
          approved: warnRows.filter((w) => w.approval_status === "APPROVED").length,
          byRiskLevel: byRisk,
        },
        incidents: {
          total: incRows.length,
          open:  incRows.filter((i) => i.status === "Äang xá»­ lÃ½").length,
        },
        safetyMeetings: {
          total:     meetRows.length,
          completed: meetRows.filter((m) => m.status === "completed").length,
        },
      };
    },

    async companyReport({ year } = {}) {
      const [iplanSummary, meetingSummary] = await Promise.all([
        this.inspectionPlanSummary({ year }),
        this.safetyMeetingSummary({ year }),
      ]);

      await ensureSchema();
      const yearLike = year ? `${String(year)}%` : null;

      const warnQ = `SELECT id, approval_status, risk_level FROM safety_warnings WHERE deleted_at IS NULL${yearLike ? " AND period LIKE ?" : ""}`;
      const incQ  = `SELECT id, status, severity FROM safety_incidents WHERE deleted_at IS NULL${yearLike ? " AND period LIKE ?" : ""}`;
      const kpiQ  = `SELECT id, approval_status FROM safety_kpi_entries WHERE deleted_at IS NULL${yearLike ? " AND period LIKE ?" : ""}`;

      const [warnRows, incRows, kpiRows] = await Promise.all([
        pool.query(warnQ, yearLike ? [yearLike] : []),
        pool.query(incQ,  yearLike ? [yearLike] : []),
        pool.query(kpiQ,  yearLike ? [yearLike] : []),
      ]);
      const warnings  = warnRows[0];
      const incidents = incRows[0];
      const kpis      = kpiRows[0];

      const byRisk = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
      for (const w of warnings) byRisk[w.risk_level] = (byRisk[w.risk_level] || 0) + 1;
      const bySeverity = {};
      for (const i of incidents) bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;

      return {
        year: year ? String(year) : null,
        generatedAt: new Date().toISOString(),
        inspectionPlans: iplanSummary,
        safetyMeetings: meetingSummary,
        warnings: {
          total:    warnings.length,
          open:     warnings.filter((w) => w.approval_status !== "APPROVED").length,
          approved: warnings.filter((w) => w.approval_status === "APPROVED").length,
          byRiskLevel: byRisk,
        },
        incidents: { total: incidents.length, open: incidents.filter((i) => i.status === "Äang xá»­ lÃ½").length, bySeverity },
        kpiEntries: { total: kpis.length, approved: kpis.filter((k) => k.approval_status === "approved").length },
      };
    },

    async exportInspectionPlansCsv({ year } = {}) {
      const result = await this.listInspectionPlans({ year, limit: 200 });
      const plans  = result.items || [];

      const escape = (v) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const headers = ["Ká»³","MÃ£ KH","TiÃªu Ä‘á»","Loáº¡i","Tráº¡ng thÃ¡i KH","Bá»™ pháº­n","Khá»‘i","NgÃ y káº¿ hoáº¡ch","NgÃ y thá»±c hiá»‡n","Äiá»ƒm","Tráº¡ng thÃ¡i BP","CAPA má»Ÿ","NgÆ°á»i kiá»ƒm tra"];
      const rows = [];
      for (const plan of plans) {
        for (const dept of (plan.departments || [])) {
          const openCapa = (dept.corrective || []).filter((c) => c.status === "open" || c.status === "overdue").length;
          rows.push([
            plan.period, plan.code, plan.title, plan.type, plan.status,
            dept.deptCode, dept.divisionCode || "",
            dept.scheduledDate || "", dept.actualDate || "",
            dept.score != null ? dept.score : "",
            dept.status, openCapa,
            Array.isArray(dept.inspectorNames) ? dept.inspectorNames.join("; ") : "",
          ]);
        }
      }
      return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\r\n");
    },

    async exportSafetyMeetingsCsv({ year } = {}) {
      const result   = await this.listSafetyMeetings({ year, limit: 200 });
      const meetings = result.items || [];
      const now      = new Date().toISOString().slice(0, 10);

      const escape = (v) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const headers = ["Ká»³","MÃ£","Loáº¡i","TiÃªu Ä‘á»","NgÃ y há»p","Chá»§ tá»a","Äá»‹a Ä‘iá»ƒm","Sá»‘ ngÆ°á»i tham dá»±","Tráº¡ng thÃ¡i","HÄ má»Ÿ","HÄ quÃ¡ háº¡n","Quyáº¿t Ä‘á»‹nh"];
      const rows = meetings.map((m) => {
        const openActions    = (m.actionItems || []).filter((a) => a.status === "open").length;
        const overdueActions = (m.actionItems || []).filter((a) => a.status === "open" && a.dueDate && a.dueDate < now).length;
        return [
          m.period, m.code, m.type, m.title, m.meetingDate || "",
          m.chairperson || "", m.location || "",
          Array.isArray(m.participants) ? m.participants.length : 0,
          m.status, openActions, overdueActions,
          (m.decisions || "").replace(/\n/g, " | "),
        ];
      });
      return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\r\n");
    },
  };
};

