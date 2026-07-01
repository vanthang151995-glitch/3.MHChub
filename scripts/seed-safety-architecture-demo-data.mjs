import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";
import { createMysqlSafetyArchitectureStore } from "../server/core/mysqlSafetyArchitectureStore.js";
import { loadLocalEnv } from "../server/loadEnv.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

loadLocalEnv(rootDir);

const store = createMysqlSafetyArchitectureStore({ rootDir });
if (!store) {
  console.error("Safety architecture store is not configured. Check MHCHUB_MYSQL_* variables.");
  process.exit(1);
}

await store.ensureSchema();
await store.close?.();

const connection = await mysql.createConnection({
  host: process.env.MHCHUB_MYSQL_HOST,
  port: Number(process.env.MHCHUB_MYSQL_PORT || 3306),
  user: process.env.MHCHUB_MYSQL_USER,
  password: process.env.MHCHUB_MYSQL_PASSWORD || "",
  database: process.env.MHCHUB_MYSQL_DATABASE,
  dateStrings: true,
  timezone: "Z"
});

const now = "2026-06-08 09:00:00";
const templateId = "audit-template-6s-department-v1";

const [questionRows] = await connection.query(
  "SELECT id, sort_order FROM safety_audit_questions WHERE template_id = ? AND active = 1 ORDER BY sort_order ASC",
  [templateId]
);

const questionIds = questionRows.map((row) => row.id);

const upsertAudit = async (audit) => {
  await connection.query(
    `INSERT INTO safety_audits
     (id, code, template_id, title, department_code, location_id, scope_level, period, scheduled_date, performed_at,
      status, total_score, max_score, score_percent, reviewer_id, reviewer_name, reviewed_at, review_note,
      created_by_id, created_by_name, updated_by_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'department', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title = VALUES(title), department_code = VALUES(department_code), location_id = VALUES(location_id),
       status = VALUES(status), total_score = VALUES(total_score), max_score = VALUES(max_score), score_percent = VALUES(score_percent),
       reviewer_name = VALUES(reviewer_name), reviewed_at = VALUES(reviewed_at), review_note = VALUES(review_note),
       updated_by_name = VALUES(updated_by_name), updated_at = VALUES(updated_at)`,
    [
      audit.id,
      audit.code,
      templateId,
      audit.title,
      audit.departmentCode,
      audit.locationId,
      audit.period,
      audit.scheduledDate,
      audit.performedAt,
      audit.status,
      audit.totalScore,
      audit.maxScore,
      audit.scorePercent,
      "demo-ehs",
      "EHS Demo",
      audit.reviewedAt,
      audit.reviewNote,
      "demo-ehs",
      "EHS Demo",
      "EHS Demo",
      now,
      now
    ]
  );
};

const upsertAnswer = async (auditId, questionId, index, score, finding = "") => {
  await connection.query(
    `INSERT INTO safety_audit_answers
     (id, audit_id, question_id, score, result_status, finding, evidence_notes, action_required, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE score = VALUES(score), result_status = VALUES(result_status), finding = VALUES(finding),
       evidence_notes = VALUES(evidence_notes), action_required = VALUES(action_required), updated_at = VALUES(updated_at)`,
    [
      `${auditId}-q${String(index + 1).padStart(2, "0")}`,
      auditId,
      questionId,
      score,
      score >= 4 ? "pass" : "finding",
      finding || null,
      score >= 4 ? "Có ảnh hiện trường và checklist xác nhận." : "Có ảnh điểm lỗi, cần CAPA.",
      score >= 4 ? 0 : 1,
      now,
      now
    ]
  );
};

const auditSeeds = [
  {
    id: "demo-audit-pe1-202606",
    code: "DEMO-AUD-PE1-202606",
    title: "Audit 6S tháng 06 - PE1",
    departmentCode: "PE1",
    locationId: "loc-dept-pe1",
    period: "2026-06",
    scheduledDate: "2026-06-03",
    performedAt: "2026-06-03 14:20:00",
    status: "approved",
    reviewedAt: "2026-06-04 09:30:00",
    reviewNote: "Đạt yêu cầu, còn 2 điểm theo dõi cải tiến.",
    scores: [5, 4, 5, 4, 4, 5, 5, 4, 4, 5, 4, 5],
    findings: { 3: "Cần cập nhật vạch kẻ khu vực bán thành phẩm.", 8: "Một action kỳ trước còn thiếu ảnh sau khắc phục." }
  },
  {
    id: "demo-audit-dp2-202606",
    code: "DEMO-AUD-DP2-202606",
    title: "Audit 6S tháng 06 - DP2",
    departmentCode: "DP2",
    locationId: "loc-dept-dp2",
    period: "2026-06",
    scheduledDate: "2026-06-05",
    performedAt: "2026-06-05 10:10:00",
    status: "submitted",
    reviewedAt: null,
    reviewNote: null,
    scores: [4, 4, 3, 3, 4, 4, 4, 3, 3, 4, 4, 4],
    findings: { 2: "Ống khí nén để vòng qua vùng thao tác.", 7: "Checklist ngày 04/06 thiếu chữ ký leader.", 8: "CAPA cũ chưa đóng bằng chứng." }
  },
  {
    id: "demo-audit-wm-202606",
    code: "DEMO-AUD-WM-202606",
    title: "Audit 6S tháng 06 - WM",
    departmentCode: "WM",
    locationId: "loc-dept-wm",
    period: "2026-06",
    scheduledDate: "2026-06-06",
    performedAt: "2026-06-06 08:40:00",
    status: "rejected",
    reviewedAt: "2026-06-06 16:10:00",
    reviewNote: "Yêu cầu bổ sung ảnh hiện trường khu PCCC trước khi phê duyệt.",
    scores: [4, 3, 3, 2, 4, 3, 4, 3, 3, 4, 3, 4],
    findings: { 1: "Tủ PCCC bị xe đẩy che khuất sau giờ nhập hàng.", 3: "Lối đi phụ chưa sạch dầu/nước.", 10: "KYT thiếu chữ ký nhóm ca chiều." }
  },
  {
    id: "demo-audit-ehs-202606",
    code: "DEMO-AUD-EHS-202606",
    title: "Audit tự kiểm tra EHS tháng 06",
    departmentCode: "EHS",
    locationId: "loc-dept-ehs",
    period: "2026-06",
    scheduledDate: "2026-06-07",
    performedAt: "2026-06-07 11:00:00",
    status: "approved",
    reviewedAt: "2026-06-07 14:00:00",
    reviewNote: "Dùng làm mẫu chuẩn cho các bộ phận tham chiếu.",
    scores: [5, 5, 5, 5, 5, 5, 4, 5, 5, 5, 5, 5],
    findings: {}
  }
];

for (const audit of auditSeeds) {
  const maxScore = questionIds.length * 5;
  const totalScore = audit.scores.reduce((sum, score) => sum + score, 0);
  await upsertAudit({
    ...audit,
    totalScore,
    maxScore,
    scorePercent: Math.round((totalScore / maxScore) * 10000) / 100
  });
  for (let index = 0; index < questionIds.length; index += 1) {
    await upsertAnswer(audit.id, questionIds[index], index, audit.scores[index] || 0, audit.findings[index] || "");
  }
}

const actionSeeds = [
  ["demo-action-pe1-vach-ke", "DEMO-CAPA-PE1-001", "Bổ sung vạch kẻ khu bán thành phẩm PE1", "Kẻ lại vạch vàng, dán nhãn vị trí pallet và ảnh xác nhận sau hoàn thành.", "audit", "demo-audit-pe1-202606", "DEMO-AUD-PE1-202606", "PE1", "loc-dept-pe1", "medium", "in_progress", "PE1 Leader", "2026-06-14", null, null, null],
  ["demo-action-dp2-ong-khi", "DEMO-CAPA-DP2-001", "Cố định lại tuyến ống khí nén DP2", "Đi lại ống khí nén tránh vùng thao tác và bổ sung móc treo chống vướng.", "audit", "demo-audit-dp2-202606", "DEMO-AUD-DP2-202606", "DP2", "loc-dept-dp2", "high", "open", "DP2 Leader", "2026-06-12", null, null, null],
  ["demo-action-wm-pccc", "DEMO-CAPA-WM-001", "Giải phóng khu vực tủ PCCC WM", "Bố trí lại xe đẩy nhập hàng, dán vùng cấm đặt đồ trước tủ PCCC.", "audit", "demo-audit-wm-202606", "DEMO-AUD-WM-202606", "WM", "loc-dept-wm", "critical", "reopened", "Warehouse Supervisor", "2026-06-10", "Đã dán vạch nhưng còn xe đẩy phát sinh ca đêm.", "2026-06-07 15:00:00", "Cần xác minh lại ca đêm trước khi đóng."],
  ["demo-action-ms1-loto", "DEMO-CAPA-MS1-001", "Chuẩn hóa nhãn LOTO tại máy quay MS1", "Bổ sung nhãn khóa nguồn và ảnh hướng dẫn thao tác an toàn.", "warning", "warning-demo-ms1", "CB-001", "MS1", "loc-dept-ms1", "high", "done_by_owner", "MS1 Leader", "2026-06-11", "Đã cập nhật nhãn và gửi ảnh bằng chứng.", "2026-06-08 08:20:00", null],
  ["demo-action-ehs-training", "DEMO-CAPA-EHS-001", "Bổ sung refresh KYT cho nhóm RF/DP", "Tổ chức đào tạo nhắc lại KYT sau kết quả kiểm tra tháng 05.", "manual", null, null, "EHS", "loc-dept-ehs", "medium", "closed", "EHS Demo", "2026-06-06", "Đã hoàn thành lớp refresh và lưu biên bản.", "2026-06-06 16:30:00", "Đạt, đóng CAPA."]
];

for (const action of actionSeeds) {
  await connection.query(
    `INSERT INTO safety_actions
     (id, code, title, description, source_type, source_id, source_code, department_code, location_id,
      priority, status, owner_id, owner_name, due_date, evidence_notes, completed_at, verification_note,
      verified_by_id, verified_by_name, verified_at, created_by_id, created_by_name, updated_by_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), department_code = VALUES(department_code),
       location_id = VALUES(location_id), priority = VALUES(priority), status = VALUES(status), owner_name = VALUES(owner_name),
       due_date = VALUES(due_date), evidence_notes = VALUES(evidence_notes), completed_at = VALUES(completed_at),
       verification_note = VALUES(verification_note), verified_by_name = VALUES(verified_by_name),
       verified_at = VALUES(verified_at), updated_by_name = VALUES(updated_by_name), updated_at = VALUES(updated_at)`,
    [
      ...action.slice(0, 16),
      action[10] === "closed" || action[10] === "reopened" ? "demo-ehs" : null,
      action[10] === "closed" || action[10] === "reopened" ? "EHS Demo" : null,
      action[10] === "closed" || action[10] === "reopened" ? "2026-06-08 09:00:00" : null,
      "demo-ehs",
      "EHS Demo",
      "EHS Demo",
      now,
      now
    ]
  );
}

const [requirements] = await connection.query("SELECT id, code FROM safety_training_requirements WHERE active = 1");
const requirementByCode = new Map(requirements.map((item) => [item.code, item.id]));
const trainingSeeds = [
  ["demo-training-pe1-6s", "TR-6S-FOUNDATION", "NV-PE1-001", "Nguyễn Văn An", "PE1", "2026-05-20", "2027-05-20", "valid"],
  ["demo-training-pe1-kyt", "TR-KYT", "NV-PE1-002", "Trần Thị Bình", "PE1", "2026-05-28", "2026-11-28", "valid"],
  ["demo-training-dp2-kyt", "TR-KYT", "NV-DP2-001", "Lê Văn Cường", "DP2", "2025-11-18", "2026-05-18", "expired"],
  ["demo-training-wm-pccc", "TR-PCCC", "NV-WM-001", "Phạm Thị Dung", "WM", "2026-04-12", "2027-04-12", "valid"],
  ["demo-training-ms1-loto", "TR-SELF-INSPECTION", "NV-MS1-001", "Vũ Thị Phương", "MS1", null, null, "pending"],
  ["demo-training-rf-firstaid", "TR-FIRST-AID", "NV-RF-001", "Hoàng Văn Em", "RF", "2026-03-08", "2027-03-08", "valid"],
  ["demo-training-ehs-6s", "TR-6S-FOUNDATION", "NV-EHS-001", "EHS Demo", "EHS", "2026-01-10", "2027-01-10", "valid"]
];

for (const record of trainingSeeds) {
  const [id, requirementCode, employeeCode, employeeName, departmentCode, completedAt, expiresAt, status] = record;
  const requirementId = requirementByCode.get(requirementCode);
  if (!requirementId) continue;
  await connection.query(
    `INSERT INTO safety_training_records
     (id, requirement_id, employee_code, employee_name, department_code, completed_at, expires_at, status, evidence_document_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
     ON DUPLICATE KEY UPDATE employee_name = VALUES(employee_name), department_code = VALUES(department_code),
       completed_at = VALUES(completed_at), expires_at = VALUES(expires_at), status = VALUES(status), updated_at = VALUES(updated_at)`,
    [id, requirementId, employeeCode, employeeName, departmentCode, completedAt, expiresAt, status, now, now]
  );
}

await connection.end();

console.log(
  JSON.stringify(
    {
      audits: auditSeeds.length,
      actions: actionSeeds.length,
      trainingRecords: trainingSeeds.length
    },
    null,
    2
  )
);
