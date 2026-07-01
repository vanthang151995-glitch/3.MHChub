const fs = require('fs');

const path = 'server/core/mysqlSafetyOperationsStore.js';
let code = fs.readFileSync(path, 'utf8');

const r = (f, t) => { code = code.split(f).join(t); };

// WStatus
r('status: row.status || "Mở"', 'status: row.status || "OPEN"');
r('status: row.status || "Đang xử lý"', 'status: row.status || "IN_PROGRESS"');
r('text(input.status, "Mở")', 'text(input.status, "OPEN")');

// ApprovalStatus
r('approvalStatus: row.approval_status || "Chờ duyệt"', 'approvalStatus: row.approval_status || "PENDING"');
r('text(input.approvalStatus, "Chờ duyệt")', 'text(input.approvalStatus, "PENDING")');
r("approval_status = 'Đã duyệt'", "approval_status = 'APPROVED'");
r("approval_status = 'Từ chối'", "approval_status = 'REJECTED'");

// RiskLevel
r('if (score >= 16) return "Cực kỳ nghiêm trọng";', 'if (score >= 16) return "CRITICAL";');
r('if (score >= 9) return "Nghiêm trọng";', 'if (score >= 9) return "HIGH";');
r('if (score >= 4) return "Trung bình";', 'if (score >= 4) return "MEDIUM";');
r('return "Thấp";', 'return "LOW";');

// Also update any categories if there are defaults.
r('text(input.category, "6S")', 'text(input.category, "ENVIRONMENT")'); // "6S" was an odd default anyway

fs.writeFileSync(path, code, 'utf8');
console.log('Updated mysqlSafetyOperationsStore.js');
