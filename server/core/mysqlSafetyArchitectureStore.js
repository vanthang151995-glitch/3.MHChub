import crypto from "crypto";
import fs from "fs";
import mysql from "mysql2/promise";
import path from "path";
import {
  buildSafetyDocumentManifestEntry,
  extractSafetyDocumentText,
  scanSafetyDocumentFiles
} from "./safetyDocumentIntelligence.js";

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

const nowMysql = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace("T", " ");
};

const toDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const direct = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const toIso = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const text = (value, fallback = "") => {
  const safe = String(value ?? "").trim();
  return safe || fallback;
};

const textOrNull = (value) => {
  const safe = text(value);
  return safe ? safe : null;
};

const numberOr = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const jsonString = (value) => JSON.stringify(value ?? null);

const parseJson = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

const codeStamp = () => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
};

const generateCode = (prefix) => `${prefix}-${codeStamp()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

const actorFields = (actor = {}) => ({
  id: actor.id || actor.userId || actor.username || null,
  username: actor.username || actor.id || "system",
  displayName: actor.displayName || actor.username || actor.id || "system",
  role: actor.role || "viewer",
  departmentId: actor.departmentId || actor.department_id || ""
});

const SAFETY_DIVISIONS = [
  { code: "PED", name: "Production Engineering Division", description: "Khối sản xuất và kỹ thuật sản xuất", sortOrder: 10 },
  { code: "QAD", name: "Quality & Administration Division", description: "Khối chất lượng, EHS, GA và văn phòng", sortOrder: 20 },
  { code: "DD", name: "Die & Device Division", description: "Khối khuôn, RF, DP và MR", sortOrder: 30 },
  { code: "SD", name: "System & Sub Assembly Division", description: "Khối OK và SP", sortOrder: 40 },
  { code: "ED", name: "Equipment Division", description: "Khối EBM, ETR, MS và SA", sortOrder: 50 }
];

const SAFETY_DEPARTMENTS = [
  ["PE1", "PE1", "PED"], ["MP", "MP", "PED"], ["MT", "MT", "PED"], ["CM", "CM", "PED"], ["WM", "WM", "PED"],
  ["QA", "QA", "QAD"], ["GA", "GA", "QAD"], ["QC", "QC", "QAD"], ["CS", "CS", "QAD"], ["EHS", "EHS", "QAD"], ["OS", "OS", "QAD"],
  ["MR", "MR", "DD"], ["RF", "RF", "DD"], ["DB", "DB", "DD"], ["DP1", "DP1", "DD"], ["DP2", "DP2", "DD"],
  ["OK1", "OK1", "SD"], ["OK2", "OK2", "SD"], ["SP1", "SP1", "SD"],
  ["EBM", "EBM", "ED"], ["ETR", "ETR", "ED"], ["MS1", "MS1", "ED"], ["SA", "SA", "ED"], ["MS2", "MS2", "ED"]
].map(([code, name, divisionCode], index) => ({
  code,
  divisionCode,
  headcount: 20 + (index % 6) * 3,
  managerName: `${code} Leader`,
  name,
  safetyTarget: code === "EHS" ? 96 : 90
}));

const DEFAULT_AUDIT_TEMPLATE = {
  id: "audit-template-6s-department-v1",
  code: "EHS-QT-11-6S-AUDIT",
  description: "Template chấm điểm 6S theo bộ phận, liên kết quy trình EHS-QT-11/EHS-QT-12 và phiếu chấm điểm 6S.",
  name: "Chấm điểm 6S bộ phận",
  ownerRole: "ehs",
  scopeLevel: "department",
  templateType: "6s-audit",
  version: "1.0"
};

const DEFAULT_AUDIT_QUESTIONS = [
  ["S1", "Vật dụng không cần thiết đã được loại bỏ khỏi khu vực làm việc.", "Không còn vật tư/tài liệu/dụng cụ không cần thiết tại vị trí thao tác."],
  ["S1", "Hàng NG, hàng chờ xử lý và vật tư dư được phân biệt rõ.", "Có nhãn nhận diện và vị trí lưu tạm an toàn."],
  ["S2", "Dụng cụ, tài liệu, vật tư được sắp xếp đúng vị trí đã định.", "Có chỉ thị vị trí, kẻ vạch, tên gọi hoặc hình ảnh chuẩn."],
  ["S2", "Lối đi, cửa thoát hiểm và thiết bị PCCC không bị che khuất.", "Không có pallet, thùng hàng hoặc vật cản trước lối thoát/PCCC."],
  ["S3", "Sàn, máy, bàn thao tác và khu vực chung được vệ sinh sạch.", "Không bụi bẩn, dầu tràn, nước đọng hoặc rác không phân loại."],
  ["S3", "Nguồn phát sinh bẩn được nhận diện và có biện pháp kiểm soát.", "Có khay hứng, lịch vệ sinh hoặc đối sách cải tiến."],
  ["S4", "Tiêu chuẩn hình ảnh/biểu mẫu 6S được cập nhật tại khu vực.", "Tiêu chuẩn còn hiệu lực và người phụ trách hiểu nội dung."],
  ["S4", "Checklist hằng ngày được thực hiện đúng kỳ.", "Có bằng chứng hoàn thành hoặc lý do hợp lệ khi nghỉ/ngừng hoạt động."],
  ["S5", "Các điểm chỉ ra kỳ trước được theo dõi đến khi đóng.", "Có người phụ trách, hạn xử lý và bằng chứng sau khắc phục."],
  ["S5", "Nhân viên tuân thủ quy định 6S/ATVSLĐ tại khu vực.", "Không có hành vi bỏ PPE, thao tác không an toàn hoặc sai luồng."],
  ["S6", "Nguy cơ an toàn chính đã được kiểm soát.", "Che chắn, biển báo, LOTO, hóa chất, điện và máy quay được kiểm soát."],
  ["S6", "KYT/cảnh báo rủi ro được triển khai khi có thay đổi hoặc sự cố.", "Có ghi nhận KYT, TBM hoặc cảnh báo nóng liên quan."]
];

const DEFAULT_TRAINING_REQUIREMENTS = [
  ["TR-6S-FOUNDATION", "Nhận thức 6S và ATVSLĐ cơ bản", "6S", "company", null, "Toàn bộ nhân viên", 12],
  ["TR-PCCC", "PCCC và quy định sử dụng điện", "PCCC", "company", null, "Toàn bộ nhân viên", 12],
  ["TR-FIRST-AID", "Sơ cứu và sử dụng túi sơ cứu", "Y tế", "company", null, "Tổ sơ cứu/bộ phận", 12],
  ["TR-KYT", "KYT nhận diện nguy cơ trước thao tác", "KYT", "department", null, "Leader/Auditor", 6],
  ["TR-SELF-INSPECTION", "Tự kiểm tra ATVSLĐ theo EHS-QT-06", "Tự kiểm tra", "department", null, "Leader/EHS", 12]
];

const DOCUMENT_ARCHITECTURE_LEVELS = [
  {
    id: "company",
    title: "Cấp công ty",
    icon: "Factory",
    focus: "Điều hành mục tiêu, quy định, báo cáo và các hoạt động chung toàn nhà máy.",
    responsibilities: [
      "Ban hành nội quy, tiêu chuẩn, biên bản họp an toàn và tài liệu hiệu lực.",
      "Theo dõi 6S, PCCC, y tế, KYT, CAPA, đào tạo và mạng lưới ATV theo tháng/quý/năm.",
      "Nhìn được PY/PY2, division, bộ phận, tỷ lệ hoàn thành và điểm quá hạn."
    ]
  },
  {
    id: "ehs",
    title: "Cấp EHS",
    icon: "ShieldAlert",
    focus: "Quản lý quy trình, template, review kết quả và xác minh đóng việc.",
    responsibilities: [
      "Sở hữu checklist/audit/KYT/PCCC/tự kiểm tra và version tài liệu.",
      "Review dữ liệu bộ phận, yêu cầu bổ sung bằng chứng, verify CAPA.",
      "Tạo báo cáo chuyên đề và ma trận đào tạo bắt buộc theo vị trí/bộ phận."
    ]
  },
  {
    id: "department",
    title: "Cấp bộ phận",
    icon: "HardHat",
    focus: "Thực hiện checklist, phát hiện rủi ro, cập nhật bằng chứng và đóng hành động.",
    responsibilities: [
      "Làm checklist 6S/PCCC/tự kiểm tra theo lịch, khu vực và ca/ngày.",
      "Tạo cảnh báo, sự cố, KYT finding và CAPA nội bộ khi có điểm không phù hợp.",
      "Theo dõi việc được giao từ họp an toàn/EHS và tình trạng đào tạo của bộ phận."
    ]
  }
];

const DOCUMENT_ARCHITECTURE_MODULES = [
  {
    id: "documents",
    title: "Kho tài liệu Safety",
    status: "existing",
    path: "/safety-6s/documents",
    icon: "FileText",
    levels: ["company", "ehs", "department"],
    sourceCategories: [],
    outcome: "Giữ tên file gốc, tra cứu OCR/text, version, ngày hiệu lực và liên kết sang nghiệp vụ."
  },
  {
    id: "checklist",
    title: "Checklist 6S hằng ngày",
    status: "extend",
    path: "/safety-6s/checklist",
    icon: "ClipboardCheck",
    levels: ["department", "ehs"],
    sourceCategories: ["sixs-daily-checklist", "sixs-standard"],
    outcome: "Bổ sung checklist theo EHS-QT-12, khu vực/ca/ngày, ảnh bằng chứng và điểm S1-S6."
  },
  {
    id: "audits",
    title: "Audit / Chấm điểm 6S",
    status: "extend",
    path: "/safety-6s/audits",
    icon: "ClipboardList",
    levels: ["ehs", "department"],
    sourceCategories: ["sixs-scoring", "sixs-standard"],
    outcome: "Tách template sản xuất/gián tiếp, chấm điểm theo kỳ, review EHS và tạo CAPA từ lỗi."
  },
  {
    id: "actions",
    title: "CAPA cải tiến an toàn",
    status: "extend",
    path: "/safety-6s/actions",
    icon: "Workflow",
    levels: ["ehs", "department"],
    sourceCategories: ["safety-improvement", "kyt", "pccc", "self-inspection"],
    outcome: "Mỗi finding từ audit/KYT/PCCC/tự kiểm tra có owner, hạn xử lý, bằng chứng và EHS verify."
  },
  {
    id: "kyt",
    title: "KYT - Lường trước nguy hiểm",
    status: "existing",
    path: "/safety-6s/kyt",
    icon: "Target",
    levels: ["department", "ehs"],
    sourceCategories: ["kyt"],
    outcome: "Flow riêng: Step 1 hiện trạng, Step 2 điểm nguy hiểm, giải pháp, mục tiêu hành động và nhóm tham gia."
  },
  {
    id: "pccc",
    title: "PCCC & An toàn điện",
    status: "existing",
    path: "/safety-6s/pccc",
    icon: "Flame",
    levels: ["company", "ehs", "department"],
    sourceCategories: ["pccc"],
    outcome: "Checklist PCCC/điện theo khu vực, thiết bị, lỗi, deadline, ảnh bằng chứng và xác nhận hoàn thành."
  },
  {
    id: "medical",
    title: "Y tế / Túi sơ cứu",
    status: "existing",
    path: "/safety-6s/medical",
    icon: "BriefcaseMedical",
    levels: ["company", "ehs", "department"],
    sourceCategories: ["medical-first-aid"],
    outcome: "Theo dõi phòng y tế, túi sơ cứu, vật tư, đề xuất mua và báo cáo y tế PY/PY2 theo tháng."
  },
  {
    id: "self-inspection",
    title: "Tự kiểm tra ATVSLĐ",
    status: "existing",
    path: "/safety-6s/self-inspection",
    icon: "ListChecks",
    levels: ["department", "ehs"],
    sourceCategories: ["self-inspection"],
    outcome: "Lập đợt kiểm tra, thành phần đoàn, nội dung/kết luận, chữ ký và xuất biên bản theo form gốc."
  },
  {
    id: "meetings",
    title: "Họp an toàn",
    status: "proposed-tab",
    path: "/safety-6s/reports?tab=meetings",
    icon: "CalendarCheck",
    levels: ["company", "ehs", "department"],
    sourceCategories: ["safety-meeting"],
    outcome: "Theo dõi kỳ họp, người tham dự/vắng mặt, agenda, quyết định và việc giao cho bộ phận."
  },
  {
    id: "atv-network",
    title: "Mạng lưới ATV",
    status: "proposed-tab",
    path: "/safety-6s/training?tab=atv-network",
    icon: "Users",
    levels: ["company", "ehs", "department"],
    sourceCategories: ["safety-roster"],
    outcome: "Quản lý an toàn viên theo bộ phận/khu vực, trạng thái đào tạo, hiệu lực và trách nhiệm hỗ trợ."
  },
  {
    id: "reports",
    title: "Báo cáo chuyên đề",
    status: "extend",
    path: "/safety-6s/reports",
    icon: "FileBarChart",
    levels: ["company", "ehs"],
    sourceCategories: ["sixs-scoring", "kyt", "pccc", "medical-first-aid", "safety-meeting"],
    outcome: "Bổ sung report 6S score, CAPA quá hạn, KYT findings, PCCC issues, medical cases, training valid rate."
  },
  {
    id: "training",
    title: "Đào tạo bắt buộc",
    status: "extend",
    path: "/safety-6s/training",
    icon: "GraduationCap",
    levels: ["company", "ehs", "department"],
    sourceCategories: ["kyt", "pccc", "medical-first-aid", "safety-roster", "sixs-standard"],
    outcome: "Gắn yêu cầu đào tạo 6S, PCCC, sơ cứu, KYT và ATV với bộ phận/vị trí/ngày hết hạn."
  },
  {
    id: "locations",
    title: "Khu vực / QR",
    status: "extend",
    path: "/safety-6s/locations",
    icon: "MapPin",
    levels: ["ehs", "department"],
    sourceCategories: ["sixs-daily-checklist", "pccc", "medical-first-aid", "self-inspection"],
    outcome: "Dùng QR cho khu vực checklist/audit/PCCC/túi sơ cứu để không trùng dữ liệu."
  }
];

const SPECIAL_PROGRAMS = {
  kyt: {
    id: "kyt",
    title: "KYT - Lường trước nguy hiểm",
    subtitle: "Huấn luyện nhận diện nguy hiểm trước thao tác theo nhóm, có Step 1, Step 2, mục tiêu hành động và CAPA.",
    icon: "Target",
    route: "/safety-6s/kyt",
    ownerRole: "EHS / Leader bộ phận",
    cadence: "Hàng tháng hoặc trước công việc rủi ro cao",
    scope: "Bộ phận, nhóm thao tác, khu vực có thay đổi",
    primaryAction: "Tạo phiên KYT",
    documentCategories: ["kyt"],
    dataSourceNote: "Bản ghi vận hành bên dưới là dữ liệu mẫu để mô phỏng workflow từ tài liệu KYT đã index.",
    stats: [
      { id: "sessions", label: "Phiên KYT tháng này", value: 18, unit: "", tone: "blue", icon: "Target", helper: "+4 phiên so với tháng trước" },
      { id: "findings", label: "Điểm nguy hiểm", value: 42, unit: "", tone: "amber", icon: "AlertTriangle", helper: "12 điểm mức ưu tiên cao" },
      { id: "closed", label: "Đã chuyển hành động", value: 31, unit: "", tone: "emerald", icon: "CheckCircle2", helper: "74% đã có owner" },
      { id: "overdue", label: "Quá hạn", value: 3, unit: "", tone: "red", icon: "ClockAlert", helper: "Cần EHS theo dõi" }
    ],
    workflow: [
      { step: "01", title: "Chọn chủ đề và khu vực", owner: "Leader", description: "Xác định công việc, khu vực, nhóm thao tác và rủi ro trọng tâm.", evidence: "Ảnh hiện trạng hoặc sơ đồ thao tác" },
      { step: "02", title: "Step 1 - Nắm hiện trạng", owner: "Nhóm KYT", description: "Ghi nguy cơ tiềm ẩn, điều kiện bất thường, hành vi/thiết bị/khu vực liên quan.", evidence: "Danh sách hiện trạng và ảnh" },
      { step: "03", title: "Step 2 - Truy bản chất", owner: "Nhóm KYT", description: "Đánh dấu điểm nguy hiểm trọng yếu, diễn giải kiểu tai nạn có thể phát sinh.", evidence: "Risk point và mức ưu tiên" },
      { step: "04", title: "Mục tiêu hành động", owner: "Leader/EHS", description: "Chọn biện pháp, câu chỉ tay đọc tên, deadline và liên kết CAPA nếu cần.", evidence: "Action target và người phụ trách" }
    ],
    checkpoints: [
      { id: "kyt-01", group: "Chuẩn bị", title: "Có chủ đề KYT rõ ràng theo công việc hoặc khu vực.", standard: "Chủ đề, khu vực, trưởng nhóm và thành viên phải được ghi trước khi bắt đầu.", severity: "medium" },
      { id: "kyt-02", group: "Step 1", title: "Hiện trạng/nguy cơ được mô tả cụ thể, không viết chung chung.", standard: "Mỗi nguy cơ có vị trí, nguyên nhân quan sát được và ảnh nếu cần.", severity: "high" },
      { id: "kyt-03", group: "Step 2", title: "Điểm nguy hiểm trọng yếu được chọn và đánh dấu ưu tiên.", standard: "Ít nhất một risk point có diễn giải kiểu tai nạn dự kiến.", severity: "high" },
      { id: "kyt-04", group: "Hành động", title: "Có mục tiêu hành động, câu chỉ tay đọc tên và owner.", standard: "Finding mức cao phải tạo CAPA hoặc có bằng chứng kiểm soát.", severity: "critical" }
    ],
    records: [
      { id: "KYT-202606-018", title: "KYT hóa chất khu vực RF", department: "RF", location: "Khu pha hóa chất", status: "in_progress", risk: "high", owner: "RF Leader", dueDate: "2026-06-14", score: 82, progress: 68, findings: 5, actionCode: "CAPA-202606-8F2A", detail: "Nắp hố ga sau bể lọc bị han mọt, có nguy cơ sụt chân; cần thay mới và bổ sung cảnh báo tạm." },
      { id: "KYT-202606-017", title: "KYT phân loại rác nguy hại MR", department: "MR", location: "Phòng mài vô tâm", status: "submitted", risk: "medium", owner: "MR Supervisor", dueDate: "2026-06-12", score: 88, progress: 90, findings: 3, actionCode: "CAPA-202606-72C1", detail: "Thùng chất thải nguy hại còn lẫn nilon/khẩu trang, cần nhãn phân loại và điểm đặt chuẩn 6S." },
      { id: "KYT-202606-016", title: "KYT thao tác máy K06", department: "RF", location: "Máy K06", status: "closed", risk: "low", owner: "RF Team", dueDate: "2026-06-10", score: 96, progress: 100, findings: 1, actionCode: "", detail: "Nhóm đã thống nhất câu chỉ tay đọc tên trước thao tác và bổ sung ảnh tiêu chuẩn." },
      { id: "KYT-202606-015", title: "KYT nâng hạ vật tư DP2", department: "DP2", location: "Khu cấp phát vật tư", status: "overdue", risk: "high", owner: "DP2 Leader", dueDate: "2026-06-06", score: 71, progress: 44, findings: 4, actionCode: "CAPA-202606-A901", detail: "Lối nâng hạ có điểm mù, cần bổ sung gương/cảnh báo và quy định vị trí đứng an toàn." }
    ],
    charts: {
      status: [
        { label: "Mở", value: 5, tone: "blue" },
        { label: "Đang xử lý", value: 7, tone: "amber" },
        { label: "Đã đóng", value: 9, tone: "emerald" },
        { label: "Quá hạn", value: 3, tone: "red" }
      ],
      departments: [
        { label: "RF", value: 9, tone: "blue" },
        { label: "MR", value: 6, tone: "amber" },
        { label: "DP2", value: 5, tone: "red" },
        { label: "QA", value: 4, tone: "emerald" }
      ]
    },
    apiPlan: ["GET/POST /api/kyt-sessions", "POST /api/kyt-sessions/:id/submit", "POST /api/kyt-findings/:id/create-action"]
  },
  pccc: {
    id: "pccc",
    title: "PCCC & An toàn điện",
    subtitle: "Quản lý kiểm tra PCCC, an toàn điện, lối thoát hiểm, tủ điện, bình chữa cháy và lỗi quá hạn theo khu vực.",
    icon: "Flame",
    route: "/safety-6s/pccc",
    ownerRole: "EHS / GA / Bộ phận sở hữu khu vực",
    cadence: "Theo lịch định kỳ và kiểm tra đột xuất",
    scope: "Toàn nhà máy, khu vực PCCC, thiết bị điện, lối thoát hiểm",
    primaryAction: "Tạo kiểm tra PCCC",
    documentCategories: ["pccc"],
    dataSourceNote: "Bản ghi vận hành là dữ liệu mẫu dựng từ checklist PCCC và nội quy sử dụng điện đã index.",
    stats: [
      { id: "areas", label: "Khu vực kiểm tra", value: 32, unit: "", tone: "blue", icon: "MapPin", helper: "PY/PY2 và kho" },
      { id: "issues", label: "Lỗi PCCC/điện", value: 21, unit: "", tone: "amber", icon: "AlertTriangle", helper: "7 lỗi mức cao" },
      { id: "verified", label: "EHS đã xác nhận", value: 16, unit: "", tone: "emerald", icon: "ShieldCheck", helper: "76% hoàn thành" },
      { id: "blocked", label: "Bị che chắn", value: 4, unit: "", tone: "red", icon: "Flame", helper: "Ưu tiên xử lý ngay" }
    ],
    workflow: [
      { step: "01", title: "Lập lịch/khu vực", owner: "EHS", description: "Chọn khu vực, mẫu checklist, người kiểm tra và ngày hiệu lực.", evidence: "Lịch kiểm tra và QR khu vực" },
      { step: "02", title: "Kiểm tra tại hiện trường", owner: "EHS/GA", description: "Bình chữa cháy, chuông/đèn, họng nước, lối thoát, tủ điện, dây điện và tải điện.", evidence: "Ảnh từng lỗi và vị trí" },
      { step: "03", title: "Giao việc bộ phận", owner: "Leader", description: "Phân loại lỗi, deadline, owner và biện pháp tạm thời.", evidence: "CAPA hoặc phiếu xác nhận" },
      { step: "04", title: "EHS verify", owner: "EHS", description: "Xác minh đóng lỗi, kiểm tra lại ảnh/bằng chứng và mở lại nếu chưa đạt.", evidence: "Ảnh sau khắc phục" }
    ],
    checkpoints: [
      { id: "pccc-01", group: "Thiết bị PCCC", title: "Bình chữa cháy, chuông, đèn, họng nước không bị che chắn.", standard: "Thiết bị tiếp cận được, có tem/biển và còn hiệu lực.", severity: "critical" },
      { id: "pccc-02", group: "Lối thoát", title: "Lối thoát hiểm, đèn exit và tiêu lệnh không bị cản trở.", standard: "Không đặt pallet, thùng hàng, vật tư trước lối thoát.", severity: "critical" },
      { id: "pccc-03", group: "An toàn điện", title: "Tủ điện, dây dẫn, ổ cắm không quá tải hoặc hở nguy hiểm.", standard: "Có nắp che, nhãn cảnh báo, không câu móc tạm.", severity: "high" },
      { id: "pccc-04", group: "Nội quy", title: "Khu vực có nội quy PCCC và quy định sử dụng điện.", standard: "Nội quy còn hiệu lực, người phụ trách biết cách xử lý khi có sự cố.", severity: "medium" }
    ],
    records: [
      { id: "PCCC-202606-011", title: "Tủ PCCC bị che khuất sau giờ nhập hàng", department: "WM", location: "Kho vật tư", status: "in_progress", risk: "critical", owner: "Warehouse Supervisor", dueDate: "2026-06-09", score: 62, progress: 40, findings: 2, actionCode: "CAPA-202606-PCCC1", detail: "Pallet chắn trước tủ PCCC và đèn exit khó quan sát, cần kẻ vùng cấm đặt hàng." },
      { id: "PCCC-202606-010", title: "Dây điện kéo tạm qua lối đi", department: "MS1", location: "Line MS1", status: "submitted", risk: "high", owner: "MS1 Leader", dueDate: "2026-06-11", score: 74, progress: 78, findings: 3, actionCode: "CAPA-202606-PCCC2", detail: "Dây điện chưa đi máng, có nguy cơ vấp ngã và hở điện khi vệ sinh." },
      { id: "PCCC-202606-009", title: "Kiểm tra bình CO2 khu GA", department: "GA", location: "Văn phòng GA", status: "closed", risk: "low", owner: "GA", dueDate: "2026-06-07", score: 98, progress: 100, findings: 0, actionCode: "", detail: "Bình chữa cháy đủ tem, vị trí tiếp cận tốt." },
      { id: "PCCC-202606-008", title: "Biển tiêu lệnh PCCC mờ", department: "QA", location: "Khu QA", status: "overdue", risk: "medium", owner: "QA Admin", dueDate: "2026-06-05", score: 80, progress: 55, findings: 1, actionCode: "CAPA-202606-PCCC3", detail: "Cần thay biển tiêu lệnh và bổ sung hướng dẫn song ngữ nếu cần." }
    ],
    charts: {
      status: [
        { label: "Mở", value: 8, tone: "blue" },
        { label: "Đang xử lý", value: 9, tone: "amber" },
        { label: "Đã verify", value: 16, tone: "emerald" },
        { label: "Quá hạn", value: 4, tone: "red" }
      ],
      departments: [
        { label: "WM", value: 7, tone: "red" },
        { label: "MS1", value: 5, tone: "amber" },
        { label: "GA", value: 4, tone: "emerald" },
        { label: "QA", value: 3, tone: "blue" }
      ]
    },
    apiPlan: ["GET/POST /api/pccc-inspections", "POST /api/pccc-inspections/:id/submit", "POST /api/pccc-inspections/:id/review"]
  },
  medical: {
    id: "medical",
    title: "Y tế / Túi sơ cứu",
    subtitle: "Theo dõi phòng y tế, ca sử dụng, túi sơ cứu, vật tư, nhu cầu mua hàng và cảnh báo hết hạn.",
    icon: "BriefcaseMedical",
    route: "/safety-6s/medical",
    ownerRole: "Y tế / EHS / GA",
    cadence: "Theo ca sử dụng, kiểm tra định kỳ vật tư và tổng hợp tháng",
    scope: "Phòng y tế, túi sơ cứu tại nơi làm việc, vật tư y tế PY/PY2",
    primaryAction: "Ghi nhận y tế",
    documentCategories: ["medical-first-aid"],
    dataSourceNote: "Dữ liệu vận hành là mẫu từ hướng dẫn phòng y tế, túi sơ cứu và bảng vật tư đã index.",
    stats: [
      { id: "visits", label: "Ca y tế tháng này", value: 126, unit: "", tone: "blue", icon: "Hospital", helper: "Theo sổ phòng y tế" },
      { id: "kits", label: "Túi sơ cứu cần kiểm", value: 9, unit: "", tone: "amber", icon: "BriefcaseMedical", helper: "3 túi thiếu vật tư" },
      { id: "valid", label: "Vật tư hợp lệ", value: 92, unit: "%", tone: "emerald", icon: "CheckCircle2", helper: "Không tính vật tư sắp hết hạn" },
      { id: "expired", label: "Vật tư hết hạn/sắp hết", value: 6, unit: "", tone: "red", icon: "AlertTriangle", helper: "Cần mua bổ sung" }
    ],
    workflow: [
      { step: "01", title: "Ghi nhận ca sử dụng", owner: "Y tế", description: "Nhập người sử dụng, bộ phận, nhóm bệnh/lý do, hướng xử lý và thời gian.", evidence: "Sổ phòng y tế hoặc phiếu đăng ký" },
      { step: "02", title: "Kiểm túi sơ cứu", owner: "EHS/Y tế", description: "Kiểm túi theo khu vực, số lượng tối thiểu, vật tư thiếu/hết hạn.", evidence: "Ảnh túi và danh mục vật tư" },
      { step: "03", title: "Đề xuất mua", owner: "Y tế/GA", description: "Tổng hợp nhu cầu mua vật tư từ checklist và thống kê sử dụng.", evidence: "Bảng đề xuất mua" },
      { step: "04", title: "Báo cáo công ty", owner: "EHS", description: "Tổng hợp nhóm bệnh, PY/PY2, bộ phận phát sinh nhiều và trend theo tháng.", evidence: "Báo cáo tháng" }
    ],
    checkpoints: [
      { id: "med-01", group: "Phòng y tế", title: "Ca sử dụng phòng y tế được ghi nhận đủ thông tin.", standard: "Có bộ phận, lý do, hướng xử lý và thời gian.", severity: "medium" },
      { id: "med-02", group: "Túi sơ cứu", title: "Túi sơ cứu không dùng để chứa vật dụng khác.", standard: "Túi đúng vị trí, sạch, đủ danh mục tối thiểu.", severity: "high" },
      { id: "med-03", group: "Vật tư", title: "Vật tư thiếu/hết hạn được đề xuất mua kịp thời.", standard: "Danh mục thiếu có số lượng, deadline và người xử lý.", severity: "high" },
      { id: "med-04", group: "Báo cáo", title: "Có tổng hợp y tế theo tháng và nhà máy.", standard: "Theo dõi nhóm bệnh/ca kham, PY/PY2, bộ phận liên quan.", severity: "medium" }
    ],
    records: [
      { id: "MED-202606-041", title: "Túi sơ cứu WM thiếu nước muối sinh lý", department: "WM", location: "Kho WM", status: "in_progress", risk: "medium", owner: "Medical PY2", dueDate: "2026-06-10", score: 84, progress: 60, findings: 2, actionCode: "REQ-MED-202606-03", detail: "Thiếu NaCl và băng dính y tế, cần bổ sung theo định mức A/B/C." },
      { id: "MED-202606-040", title: "Tổng hợp ca đau mắt sau ca đêm", department: "MS2", location: "Phòng y tế PY", status: "submitted", risk: "medium", owner: "Medical PY", dueDate: "2026-06-13", score: 78, progress: 82, findings: 4, actionCode: "", detail: "Cần phân tích điều kiện ánh sáng, bụi và PPE tại MS2." },
      { id: "MED-202606-039", title: "Kiểm tra tủ sơ cứu EHS", department: "EHS", location: "Văn phòng EHS", status: "closed", risk: "low", owner: "EHS", dueDate: "2026-06-08", score: 100, progress: 100, findings: 0, actionCode: "", detail: "Danh mục đầy đủ, không có vật tư hết hạn." },
      { id: "MED-202606-038", title: "Gạc y tế gần hết hạn tại PE1", department: "PE1", location: "Line PE1", status: "overdue", risk: "high", owner: "PE1 Admin", dueDate: "2026-06-06", score: 70, progress: 30, findings: 1, actionCode: "REQ-MED-202606-02", detail: "Cần thu hồi vật tư gần hết hạn và cấp thay thế." }
    ],
    charts: {
      status: [
        { label: "Ca y tế", value: 126, tone: "blue" },
        { label: "Túi cần kiểm", value: 9, tone: "amber" },
        { label: "Đủ chuẩn", value: 28, tone: "emerald" },
        { label: "Thiếu/hết hạn", value: 6, tone: "red" }
      ],
      departments: [
        { label: "WM", value: 8, tone: "amber" },
        { label: "MS2", value: 7, tone: "red" },
        { label: "PE1", value: 5, tone: "blue" },
        { label: "EHS", value: 3, tone: "emerald" }
      ]
    },
    apiPlan: ["GET/POST /api/medical-visits", "GET/POST /api/first-aid-kits", "POST /api/first-aid-kits/:id/check"]
  },
  "self-inspection": {
    id: "self-inspection",
    title: "Tự kiểm tra ATVSLĐ",
    subtitle: "Quản lý đợt tự kiểm tra, đoàn kiểm tra, đại diện bộ phận, nội dung/kết luận, chữ ký và CAPA.",
    icon: "ListChecks",
    route: "/safety-6s/self-inspection",
    ownerRole: "Bộ phận / EHS review",
    cadence: "Theo kỳ, theo thông báo trước và khi có yêu cầu đặc biệt",
    scope: "Tổ, đội, bộ phận, khối và khu vực sản xuất",
    primaryAction: "Tạo biên bản",
    documentCategories: ["self-inspection"],
    dataSourceNote: "Dữ liệu vận hành là mẫu từ quy trình EHS-QT-06 và mẫu biên bản đã index.",
    stats: [
      { id: "sessions", label: "Đợt tự kiểm tra", value: 14, unit: "", tone: "blue", icon: "ClipboardList", helper: "Theo kỳ tháng 06" },
      { id: "submitted", label: "Chờ EHS review", value: 5, unit: "", tone: "amber", icon: "Send", helper: "Cần kết luận rõ" },
      { id: "closed", label: "Đã đóng biên bản", value: 8, unit: "", tone: "emerald", icon: "CheckCircle2", helper: "Đủ chữ ký/bằng chứng" },
      { id: "findings", label: "Finding cần CAPA", value: 17, unit: "", tone: "red", icon: "AlertTriangle", helper: "6 điểm mức cao" }
    ],
    workflow: [
      { step: "01", title: "Thông báo và lập đoàn", owner: "EHS/Bộ phận", description: "Thông báo lịch, đại diện đoàn kiểm tra và đại diện cơ sở/bộ phận.", evidence: "Danh sách thành viên, chức vụ" },
      { step: "02", title: "Kiểm tra hiện trường", owner: "Đoàn kiểm tra", description: "Ghi nội dung kiểm tra, điểm phù hợp/không phù hợp, ảnh và khu vực.", evidence: "Ảnh, QR khu vực, checklist" },
      { step: "03", title: "Kết luận biên bản", owner: "Trưởng đoàn", description: "Kết luận, kiến nghị, việc giao, thời hạn và người phụ trách.", evidence: "Biên bản đã ký" },
      { step: "04", title: "EHS review và đóng", owner: "EHS", description: "Review kết quả, chuyển CAPA nếu cần, xác minh bằng chứng đóng việc.", evidence: "Review note và CAPA" }
    ],
    checkpoints: [
      { id: "self-01", group: "Hồ sơ", title: "Biên bản có đủ đại diện đoàn và đại diện bộ phận.", standard: "Ghi họ tên, chức vụ, vai trò và ngày kiểm tra.", severity: "medium" },
      { id: "self-02", group: "Nội dung", title: "Nội dung kiểm tra mô tả rõ điểm không phù hợp.", standard: "Finding có vị trí, ảnh/bằng chứng và tiêu chuẩn liên quan.", severity: "high" },
      { id: "self-03", group: "Kết luận", title: "Kết luận có hành động, owner và deadline.", standard: "Điểm không phù hợp phải có biện pháp hoặc CAPA.", severity: "critical" },
      { id: "self-04", group: "Ký xác nhận", title: "Biên bản đủ chữ ký/xác nhận điện tử.", standard: "Đại diện đoàn và bộ phận xác nhận trước khi EHS đóng.", severity: "medium" }
    ],
    records: [
      { id: "SELF-202606-014", title: "Tự kiểm tra ATVSLĐ khu DP2", department: "DP2", location: "Khu thao tác DP2", status: "submitted", risk: "high", owner: "DP2 Leader", dueDate: "2026-06-15", score: 76, progress: 80, findings: 5, actionCode: "CAPA-202606-SI01", detail: "Biên bản đã có đoàn kiểm tra, còn thiếu ảnh sau khắc phục của 2 finding." },
      { id: "SELF-202606-013", title: "Tự kiểm tra kho WM", department: "WM", location: "Kho WM", status: "in_progress", risk: "medium", owner: "WM Supervisor", dueDate: "2026-06-12", score: 83, progress: 58, findings: 3, actionCode: "CAPA-202606-SI02", detail: "Cần bổ sung kết luận về lối đi, pallet và thiết bị PCCC." },
      { id: "SELF-202606-012", title: "Tự kiểm tra văn phòng QA", department: "QA", location: "Văn phòng QA", status: "closed", risk: "low", owner: "QA Admin", dueDate: "2026-06-09", score: 96, progress: 100, findings: 1, actionCode: "", detail: "Đã đóng biên bản, đủ chữ ký và ảnh." },
      { id: "SELF-202606-011", title: "Tự kiểm tra line MS1", department: "MS1", location: "Line MS1", status: "overdue", risk: "high", owner: "MS1 Leader", dueDate: "2026-06-07", score: 69, progress: 45, findings: 4, actionCode: "CAPA-202606-SI03", detail: "Thiếu chữ ký đại diện bộ phận và bằng chứng khắc phục dây điện tạm." }
    ],
    charts: {
      status: [
        { label: "Nháp/mở", value: 4, tone: "blue" },
        { label: "Chờ review", value: 5, tone: "amber" },
        { label: "Đã đóng", value: 8, tone: "emerald" },
        { label: "Quá hạn", value: 2, tone: "red" }
      ],
      departments: [
        { label: "DP2", value: 5, tone: "red" },
        { label: "WM", value: 4, tone: "amber" },
        { label: "QA", value: 3, tone: "emerald" },
        { label: "MS1", value: 4, tone: "blue" }
      ]
    },
    apiPlan: ["GET/POST /api/self-inspections", "POST /api/self-inspections/:id/submit", "POST /api/self-inspections/:id/review"]
  }
};

const rowToDocument = (row) => ({
  id: String(row.id),
  title: row.title || "",
  category: row.category || "",
  departmentId: row.department_id || "",
  departmentName: row.department_name || "",
  version: row.version || "",
  originalName: row.original_name || "",
  mimeType: row.mime_type || "",
  size: Number(row.size || 0),
  uploadedAt: toIso(row.uploaded_at),
  url: row.url || "",
  source: row.source || "",
  sourcePath: row.source_path || "",
  storagePath: row.storage_path || "",
  documentCode: row.document_code || "",
  documentType: row.document_type || "",
  scopeLevel: row.scope_level || "",
  ownerRole: row.owner_role || "",
  section6s: row.section_6s || "",
  effectiveDate: toDateOnly(row.effective_date),
  tags: parseJson(row.tags_json, []),
  checksum: row.checksum || "",
  ocrStatus: row.ocr_status || "",
  ocrError: row.ocr_error || "",
  ocrUpdatedAt: toIso(row.ocr_updated_at),
  supersedesDocumentId: row.supersedes_document_id || ""
});

const rowToDivision = (row) => ({
  code: row.code,
  name: row.name,
  description: row.description || "",
  sortOrder: Number(row.sort_order || 0),
  active: row.active === 1,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at)
});

const rowToDepartment = (row) => ({
  code: row.code,
  name: row.name,
  divisionCode: row.division_code,
  managerName: row.manager_name || "",
  headcount: Number(row.headcount || 0),
  safetyTarget: Number(row.safety_target || 0),
  active: row.active === 1,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at)
});

const rowToLocation = (row) => ({
  id: String(row.id),
  code: row.code || "",
  name: row.name || "",
  departmentCode: row.department_code || "",
  areaType: row.area_type || "",
  parentId: row.parent_id || "",
  qrCode: row.qr_code || "",
  riskLevel: row.risk_level || "",
  description: row.description || "",
  active: row.active === 1,
  createdByName: row.created_by_name || "",
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at)
});

const rowToAuditTemplate = (row, questions = []) => ({
  id: String(row.id),
  code: row.code || "",
  name: row.name || "",
  documentId: row.document_id || "",
  documentCode: row.document_code || "",
  scopeLevel: row.scope_level || "",
  templateType: row.template_type || "",
  version: row.version || "",
  status: row.status || "",
  ownerRole: row.owner_role || "",
  description: row.description || "",
  questions,
  createdByName: row.created_by_name || "",
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at)
});

const rowToAuditQuestion = (row) => ({
  id: String(row.id),
  templateId: row.template_id || "",
  pillar: row.pillar || "",
  sortOrder: Number(row.sort_order || 0),
  question: row.question || "",
  expectedStandard: row.expected_standard || "",
  maxScore: Number(row.max_score || 0),
  requiredEvidence: row.required_evidence === 1,
  active: row.active === 1,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at)
});

const rowToAuditAnswer = (row) => ({
  id: String(row.id),
  auditId: row.audit_id || "",
  questionId: row.question_id || "",
  score: Number(row.score || 0),
  resultStatus: row.result_status || "",
  finding: row.finding || "",
  evidenceNotes: row.evidence_notes || "",
  actionRequired: row.action_required === 1,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at)
});

const rowToAudit = (row, answers = []) => ({
  id: String(row.id),
  code: row.code || "",
  templateId: row.template_id || "",
  title: row.title || "",
  departmentCode: row.department_code || "",
  locationId: row.location_id || "",
  scopeLevel: row.scope_level || "",
  period: row.period || "",
  scheduledDate: toDateOnly(row.scheduled_date),
  performedAt: toIso(row.performed_at),
  status: row.status || "",
  totalScore: Number(row.total_score || 0),
  maxScore: Number(row.max_score || 0),
  scorePercent: Number(row.score_percent || 0),
  reviewerName: row.reviewer_name || "",
  reviewedAt: toIso(row.reviewed_at),
  reviewNote: row.review_note || "",
  createdByName: row.created_by_name || "",
  updatedByName: row.updated_by_name || "",
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  answers
});

const rowToAction = (row) => ({
  id: String(row.id),
  code: row.code || "",
  title: row.title || "",
  description: row.description || "",
  sourceType: row.source_type || "",
  sourceId: row.source_id || "",
  sourceCode: row.source_code || "",
  departmentCode: row.department_code || "",
  locationId: row.location_id || "",
  priority: row.priority || "",
  status: row.status || "",
  ownerId: row.owner_id || "",
  ownerName: row.owner_name || "",
  dueDate: toDateOnly(row.due_date),
  completedAt: toIso(row.completed_at),
  verifiedByName: row.verified_by_name || "",
  verifiedAt: toIso(row.verified_at),
  evidenceNotes: row.evidence_notes || "",
  verificationNote: row.verification_note || "",
  createdByName: row.created_by_name || "",
  updatedByName: row.updated_by_name || "",
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at)
});

const rowToTrainingRequirement = (row) => ({
  id: String(row.id),
  code: row.code || "",
  title: row.title || "",
  category: row.category || "",
  requiredForScope: row.required_for_scope || "",
  departmentCode: row.department_code || "",
  roleName: row.role_name || "",
  documentId: row.document_id || "",
  frequencyMonths: Number(row.frequency_months || 0),
  active: row.active === 1,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at)
});

const rowToTrainingRecord = (row) => ({
  id: String(row.id),
  requirementId: row.requirement_id || "",
  employeeCode: row.employee_code || "",
  employeeName: row.employee_name || "",
  departmentCode: row.department_code || "",
  completedAt: toDateOnly(row.completed_at),
  expiresAt: toDateOnly(row.expires_at),
  status: row.status || "",
  evidenceDocumentId: row.evidence_document_id || "",
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at)
});

export const createMysqlSafetyArchitectureStore = ({ rootDir }) => {
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

  const migrationPath = path.join(rootDir, "database", "migrations", "006_safety_architecture_schema.sql");
  let schemaReady = null;

  const ensureColumn = async (table, name, definition, after = "") => {
    const [rows] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [name]);
    if (!rows.length) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}${after ? ` AFTER ${after}` : ""}`);
    }
  };

  const ensureDocumentColumns = async () => {
    const columns = [
      ["document_code", "VARCHAR(64) NULL", "source_path"],
      ["document_type", "VARCHAR(64) NULL", "document_code"],
      ["scope_level", "VARCHAR(32) NULL", "document_type"],
      ["owner_role", "VARCHAR(64) NULL", "scope_level"],
      ["section_6s", "VARCHAR(120) NULL", "owner_role"],
      ["effective_date", "DATE NULL", "section_6s"],
      ["tags_json", "JSON NULL", "effective_date"],
      ["checksum", "VARCHAR(128) NULL", "tags_json"],
      ["ocr_status", "VARCHAR(64) NULL", "checksum"],
      ["ocr_error", "VARCHAR(500) NULL", "ocr_status"],
      ["ocr_updated_at", "DATETIME NULL", "ocr_error"],
      ["supersedes_document_id", "VARCHAR(64) NULL", "ocr_updated_at"]
    ];
    for (const [name, definition, after] of columns) {
      await ensureColumn("documents", name, definition, after);
    }
  };

  const seedMasterData = async () => {
    const now = nowMysql();
    for (const division of SAFETY_DIVISIONS) {
      await pool.query(
        `INSERT INTO safety_divisions (code, name, description, sort_order, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), sort_order = VALUES(sort_order), updated_at = VALUES(updated_at)`,
        [division.code, division.name, division.description, division.sortOrder, now, now]
      );
    }
    for (const department of SAFETY_DEPARTMENTS) {
      await pool.query(
        `INSERT INTO safety_departments (code, name, division_code, manager_name, headcount, safety_target, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), division_code = VALUES(division_code), updated_at = VALUES(updated_at)`,
        [
          department.code,
          department.name,
          department.divisionCode,
          department.managerName,
          department.headcount,
          department.safetyTarget,
          now,
          now
        ]
      );
      await pool.query(
        `INSERT INTO safety_locations
         (id, code, name, department_code, area_type, parent_id, qr_code, risk_level, description, active, created_by_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'department', NULL, ?, 'medium', ?, 1, 'system', ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), department_code = VALUES(department_code), updated_at = VALUES(updated_at)`,
        [
          `loc-${department.code.toLowerCase()}`,
          `LOC-${department.code}`,
          `Khu vực ${department.code}`,
          department.code,
          `MHC-6S-${department.code}`,
          `QR mặc định cho bộ phận ${department.code}`,
          now,
          now
        ]
      );
    }

    await pool.query(
      `INSERT INTO safety_audit_templates
       (id, code, name, document_id, document_code, scope_level, template_type, version, status, owner_role, description, created_by_name, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'EHS-QT-11', ?, ?, ?, 'active', ?, ?, 'system', ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), updated_at = VALUES(updated_at)`,
      [
        DEFAULT_AUDIT_TEMPLATE.id,
        DEFAULT_AUDIT_TEMPLATE.code,
        DEFAULT_AUDIT_TEMPLATE.name,
        DEFAULT_AUDIT_TEMPLATE.scopeLevel,
        DEFAULT_AUDIT_TEMPLATE.templateType,
        DEFAULT_AUDIT_TEMPLATE.version,
        DEFAULT_AUDIT_TEMPLATE.ownerRole,
        DEFAULT_AUDIT_TEMPLATE.description,
        now,
        now
      ]
    );

    for (const [index, question] of DEFAULT_AUDIT_QUESTIONS.entries()) {
      const id = `audit-question-6s-${String(index + 1).padStart(2, "0")}`;
      await pool.query(
        `INSERT INTO safety_audit_questions
         (id, template_id, pillar, sort_order, question, expected_standard, max_score, required_evidence, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 5, ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE pillar = VALUES(pillar), sort_order = VALUES(sort_order), question = VALUES(question), expected_standard = VALUES(expected_standard), updated_at = VALUES(updated_at)`,
        [id, DEFAULT_AUDIT_TEMPLATE.id, question[0], index + 1, question[1], question[2], question[0] === "S6" ? 1 : 0, now, now]
      );
    }

    for (const item of DEFAULT_TRAINING_REQUIREMENTS) {
      await pool.query(
        `INSERT INTO safety_training_requirements
         (id, code, title, category, required_for_scope, department_code, role_name, document_id, frequency_months, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE title = VALUES(title), category = VALUES(category), frequency_months = VALUES(frequency_months), updated_at = VALUES(updated_at)`,
        [`req-${item[0].toLowerCase()}`, item[0], item[1], item[2], item[3], item[4], item[5], item[6], now, now]
      );
    }
  };

  const ensureSchema = async () => {
    if (!schemaReady) {
      schemaReady = (async () => {
        const migration = fs.readFileSync(migrationPath, "utf8");
        for (const statement of parseMigration(migration)) {
          await pool.query(statement);
        }
        await ensureDocumentColumns();
        await seedMasterData();
      })();
    }
    return schemaReady;
  };

  const insertLog = async ({ entityType, entityId, action, actor = {}, summary = "", metadata = null }) => {
    const safeActor = actorFields(actor);
    await pool.query(
      `INSERT INTO safety_audit_logs
       (entity_type, entity_id, action, actor_id, actor_name, actor_role, actor_dept, summary, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entityType,
        entityId,
        action,
        safeActor.id,
        safeActor.displayName,
        safeActor.role,
        safeActor.departmentId || null,
        summary || null,
        metadata ? jsonString(metadata) : null,
        nowMysql()
      ]
    );
  };

  const upsertImportedDocument = async (entry, extraction) => {
    const now = nowMysql();
    const columns = [
      "id", "title", "category", "department_id", "department_name", "language", "version", "original_name",
      "file_name", "mime_type", "size", "uploaded_at", "url", "source", "source_path", "storage_path",
      "created_by", "created_by_name", "created_by_role", "created_at", "updated_by", "updated_by_name",
      "updated_by_role", "updated_at", "document_code", "document_type", "scope_level", "owner_role",
      "section_6s", "effective_date", "tags_json", "checksum", "ocr_status", "ocr_error", "ocr_updated_at",
      "supersedes_document_id"
    ];
    const values = [
      entry.id,
      entry.title,
      entry.category,
      entry.departmentId,
      entry.departmentName,
      entry.language,
      entry.version,
      entry.originalName,
      entry.fileName,
      entry.mimeType,
      entry.size,
      nowMysql(entry.uploadedAt),
      entry.url,
      entry.source,
      entry.sourcePath,
      entry.storagePath,
      "system",
      "Safety Import",
      "ehs",
      nowMysql(entry.createdAt),
      "system",
      "Safety Import",
      "ehs",
      now,
      entry.documentCode,
      entry.documentType,
      entry.scopeLevel,
      entry.ownerRole,
      entry.section6s || null,
      toDateOnly(entry.effectiveDate),
      jsonString(entry.tags),
      entry.checksum,
      extraction.ocrStatus,
      extraction.error || null,
      now,
      null
    ];
    const updates = columns
      .filter((column) => column !== "id" && !["created_at", "created_by", "created_by_name", "created_by_role"].includes(column))
      .map((column) => `${column} = VALUES(${column})`)
      .join(", ");

    await pool.query(
      `INSERT INTO documents (${columns.join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})
       ON DUPLICATE KEY UPDATE ${updates}`,
      values
    );

    await pool.query("DELETE FROM safety_document_text_chunks WHERE document_id = ?", [entry.id]);
    for (const [index, chunk] of extraction.chunks.entries()) {
      await pool.query(
        `INSERT INTO safety_document_text_chunks
         (document_id, chunk_index, source_page, text_content, extraction_method, ocr_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          index,
          chunk.sourcePage || null,
          chunk.text,
          extraction.extractionMethod,
          extraction.ocrStatus,
          now,
          now
        ]
      );
    }
  };

  const findDocument = async (id) => {
    await ensureSchema();
    const [rows] = await pool.query("SELECT * FROM documents WHERE id = ? LIMIT 1", [id]);
    return rows[0] ? rowToDocument(rows[0]) : null;
  };

  const recalculateAudit = async (auditId) => {
    const [rows] = await pool.query(
      `SELECT SUM(score) AS totalScore, SUM(q.max_score) AS maxScore
       FROM safety_audit_answers a
       LEFT JOIN safety_audit_questions q ON q.id = a.question_id
       WHERE a.audit_id = ?`,
      [auditId]
    );
    const totalScore = Number(rows[0]?.totalScore || 0);
    const maxScore = Number(rows[0]?.maxScore || 0);
    const scorePercent = maxScore ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;
    await pool.query(
      "UPDATE safety_audits SET total_score = ?, max_score = ?, score_percent = ?, updated_at = ? WHERE id = ?",
      [totalScore, maxScore, scorePercent, nowMysql(), auditId]
    );
    return { maxScore, scorePercent, totalScore };
  };

  const findAudit = async (id, { includeAnswers = true } = {}) => {
    const [rows] = await pool.query("SELECT * FROM safety_audits WHERE id = ? AND deleted_at IS NULL LIMIT 1", [id]);
    if (!rows[0]) return null;
    let answers = [];
    if (includeAnswers) {
      const [answerRows] = await pool.query("SELECT * FROM safety_audit_answers WHERE audit_id = ? ORDER BY id ASC", [id]);
      answers = answerRows.map(rowToAuditAnswer);
    }
    return rowToAudit(rows[0], answers);
  };

  const saveAuditAnswers = async (auditId, answers = []) => {
    const now = nowMysql();
    for (const answer of answers) {
      const id = answer.id || newId("audit-answer");
      await pool.query(
        `INSERT INTO safety_audit_answers
         (id, audit_id, question_id, score, result_status, finding, evidence_notes, action_required, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE score = VALUES(score), result_status = VALUES(result_status), finding = VALUES(finding),
           evidence_notes = VALUES(evidence_notes), action_required = VALUES(action_required), updated_at = VALUES(updated_at)`,
        [
          id,
          auditId,
          text(answer.questionId || answer.question_id),
          numberOr(answer.score, 0),
          text(answer.resultStatus || answer.result_status, numberOr(answer.score, 0) >= 4 ? "pass" : "finding"),
          textOrNull(answer.finding),
          textOrNull(answer.evidenceNotes || answer.evidence_notes),
          answer.actionRequired || answer.action_required || numberOr(answer.score, 0) < 4 ? 1 : 0,
          now,
          now
        ]
      );
    }
    return recalculateAudit(auditId);
  };

  const createActionInternal = async (input = {}, actor = {}) => {
    const safeActor = actorFields(actor);
    const id = input.id || newId("action");
    const code = text(input.code, generateCode("CAPA"));
    const now = nowMysql();
    await pool.query(
      `INSERT INTO safety_actions
       (id, code, title, description, source_type, source_id, source_code, department_code, location_id, priority, status,
        owner_id, owner_name, due_date, evidence_notes, created_by_id, created_by_name, updated_by_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        code,
        text(input.title, "Hành động khắc phục mới"),
        textOrNull(input.description),
        text(input.sourceType || input.source_type, "manual"),
        textOrNull(input.sourceId || input.source_id),
        textOrNull(input.sourceCode || input.source_code),
        text(input.departmentCode || input.department_code || input.department, safeActor.departmentId || "EHS"),
        textOrNull(input.locationId || input.location_id),
        text(input.priority, "medium"),
        text(input.status, "open"),
        textOrNull(input.ownerId || input.owner_id),
        textOrNull(input.ownerName || input.owner_name || safeActor.displayName),
        toDateOnly(input.dueDate || input.due_date),
        textOrNull(input.evidenceNotes || input.evidence_notes),
        safeActor.id,
        safeActor.displayName,
        safeActor.displayName,
        now,
        now
      ]
    );
    await insertLog({ entityType: "action", entityId: id, action: "created", actor: safeActor, summary: code });
    const [rows] = await pool.query("SELECT * FROM safety_actions WHERE id = ? LIMIT 1", [id]);
    return rowToAction(rows[0]);
  };

  return {
    async close() {
      await pool.end();
    },
    ensureSchema,
    async listDivisions() {
      await ensureSchema();
      const [rows] = await pool.query("SELECT * FROM safety_divisions ORDER BY sort_order ASC, code ASC");
      return rows.map(rowToDivision);
    },
    async listDepartments() {
      await ensureSchema();
      const [rows] = await pool.query("SELECT * FROM safety_departments ORDER BY division_code ASC, code ASC");
      return rows.map(rowToDepartment);
    },
    async architectureSummary() {
      await ensureSchema();
      const [documentRows] = await pool.query(
        `SELECT category, document_type, scope_level, ocr_status, COUNT(*) AS total
         FROM documents
         WHERE source = 'safety-document-import'
         GROUP BY category, document_type, scope_level, ocr_status
         ORDER BY category`
      );
      const [actionRows] = await pool.query("SELECT status, COUNT(*) AS total FROM safety_actions WHERE deleted_at IS NULL GROUP BY status");
      const [auditRows] = await pool.query("SELECT status, COUNT(*) AS total FROM safety_audits WHERE deleted_at IS NULL GROUP BY status");
      return {
        divisions: await this.listDivisions(),
        departments: await this.listDepartments(),
        documents: documentRows.map((row) => ({
          category: row.category || "",
          documentType: row.document_type || "",
          scopeLevel: row.scope_level || "",
          ocrStatus: row.ocr_status || "",
          total: Number(row.total || 0)
        })),
        actions: actionRows.map((row) => ({ status: row.status || "", total: Number(row.total || 0) })),
        audits: auditRows.map((row) => ({ status: row.status || "", total: Number(row.total || 0) }))
      };
    },
    async documentArchitecture() {
      await ensureSchema();
      const [rows] = await pool.query(
        `SELECT
           d.id,
           d.title,
           d.original_name,
           d.document_code,
           d.category,
           d.document_type,
           d.scope_level,
           d.ocr_status,
           d.effective_date,
           d.source_path,
           COUNT(c.id) AS chunk_count,
           MIN(c.extraction_method) AS extraction_method
         FROM documents d
         LEFT JOIN safety_document_text_chunks c ON c.document_id = d.id
         WHERE d.source = 'safety-document-import'
         GROUP BY
           d.id,
           d.title,
           d.original_name,
           d.document_code,
           d.category,
           d.document_type,
           d.scope_level,
           d.ocr_status,
           d.effective_date,
           d.source_path
         ORDER BY d.category ASC, COALESCE(d.original_name, d.title) ASC`
      );
      const documents = rows.map((row) => ({
        id: String(row.id),
        name: row.original_name || row.title || String(row.id),
        documentCode: row.document_code || "",
        category: row.category || "",
        documentType: row.document_type || "",
        scopeLevel: row.scope_level || "",
        ocrStatus: row.ocr_status || "",
        effectiveDate: toDateOnly(row.effective_date),
        sourcePath: row.source_path || "",
        chunkCount: Number(row.chunk_count || 0),
        extractionMethod: row.extraction_method || ""
      }));
      const modules = DOCUMENT_ARCHITECTURE_MODULES.map((module) => {
        const sourceCategories = module.sourceCategories || [];
        const sourceDocuments = sourceCategories.length
          ? documents.filter((document) => sourceCategories.includes(document.category))
          : documents;
        return {
          ...module,
          documentCount: sourceDocuments.length,
          indexedCount: sourceDocuments.filter((document) => document.ocrStatus === "indexed").length,
          chunkCount: sourceDocuments.reduce((total, document) => total + document.chunkCount, 0),
          sourceDocuments
        };
      });
      return {
        generatedAt: new Date().toISOString(),
        summary: {
          totalDocuments: documents.length,
          indexedDocuments: documents.filter((document) => document.ocrStatus === "indexed").length,
          totalChunks: documents.reduce((total, document) => total + document.chunkCount, 0),
          existingModules: modules.filter((module) => module.status === "existing").length,
          extendModules: modules.filter((module) => module.status === "extend").length,
          proposedModules: modules.filter((module) => module.status.startsWith("proposed")).length
        },
        levels: DOCUMENT_ARCHITECTURE_LEVELS,
        modules
      };
    },
    async listSafetyPrograms() {
      await ensureSchema();
      return Object.values(SPECIAL_PROGRAMS).map((program) => ({
        id: program.id,
        title: program.title,
        subtitle: program.subtitle,
        icon: program.icon,
        route: program.route,
        ownerRole: program.ownerRole,
        cadence: program.cadence,
        scope: program.scope,
        primaryAction: program.primaryAction,
        documentCategories: program.documentCategories
      }));
    },
    async safetyProgram(programId) {
      await ensureSchema();
      const program = SPECIAL_PROGRAMS[String(programId || "").toLowerCase()];
      if (!program) return null;
      const [rows] = await pool.query(
        `SELECT
           d.id,
           d.title,
           d.original_name,
           d.document_code,
           d.category,
           d.document_type,
           d.scope_level,
           d.ocr_status,
           d.effective_date,
           d.source_path,
           COUNT(c.id) AS chunk_count,
           MIN(c.extraction_method) AS extraction_method
         FROM documents d
         LEFT JOIN safety_document_text_chunks c ON c.document_id = d.id
         WHERE d.source = 'safety-document-import'
           AND d.category IN (?)
         GROUP BY
           d.id,
           d.title,
           d.original_name,
           d.document_code,
           d.category,
           d.document_type,
           d.scope_level,
           d.ocr_status,
           d.effective_date,
           d.source_path
         ORDER BY COALESCE(d.original_name, d.title) ASC`,
        [program.documentCategories]
      );
      const documents = rows.map((row) => ({
        id: String(row.id),
        name: row.original_name || row.title || String(row.id),
        documentCode: row.document_code || "",
        category: row.category || "",
        documentType: row.document_type || "",
        scopeLevel: row.scope_level || "",
        ocrStatus: row.ocr_status || "",
        effectiveDate: toDateOnly(row.effective_date),
        sourcePath: row.source_path || "",
        chunkCount: Number(row.chunk_count || 0),
        extractionMethod: row.extraction_method || ""
      }));
      return {
        ...program,
        documents,
        summary: {
          documentCount: documents.length,
          indexedDocuments: documents.filter((document) => document.ocrStatus === "indexed").length,
          chunkCount: documents.reduce((sum, document) => sum + document.chunkCount, 0),
          openRecords: program.records.filter((record) => record.status !== "closed").length,
          overdueRecords: program.records.filter((record) => record.status === "overdue").length
        },
        generatedAt: new Date().toISOString()
      };
    },
    async importDocumentManifest({ sourceRoot = "tai lieu", dryRun = false } = {}, actor = {}) {
      await ensureSchema();
      const scan = await scanSafetyDocumentFiles({ rootDir, sourceRoot });
      const imported = [];
      const skipped = [];
      const startedAt = Date.now();

      for (const filePath of scan.files) {
        try {
          const entry = await buildSafetyDocumentManifestEntry({ filePath, rootDir, sourceRoot: scan.sourceRoot });
          let extraction = { chunks: [], extractionMethod: "preview", ocrStatus: "not_imported" };
          if (!dryRun) {
            extraction = await extractSafetyDocumentText(filePath);
            await upsertImportedDocument(entry, extraction);
          }
          imported.push({
            ...entry,
            chunkCount: extraction.chunks.length,
            extractionMethod: extraction.extractionMethod,
            ocrError: extraction.error || "",
            ocrStatus: extraction.ocrStatus
          });
        } catch (error) {
          skipped.push({ filePath: path.relative(rootDir, filePath), error: error.message });
        }
      }

      await insertLog({
        entityType: "document",
        entityId: "safety-import",
        action: dryRun ? "import-preview" : "imported",
        actor,
        summary: `${imported.length} files`,
        metadata: { skipped, sourceRoot, durationMs: Date.now() - startedAt }
      });

      return {
        dryRun,
        imported,
        skipped,
        sourceRoot: path.relative(rootDir, scan.sourceRoot).replace(/\\/g, "/"),
        stats: {
          imported: imported.length,
          indexed: imported.filter((item) => item.ocrStatus === "indexed").length,
          ocrRequired: imported.filter((item) => item.ocrStatus === "ocr_required").length,
          converterRequired: imported.filter((item) => item.ocrStatus === "converter_required").length,
          skipped: skipped.length
        }
      };
    },
    async getDocumentText(id) {
      await ensureSchema();
      const document = await findDocument(id);
      if (!document) return null;
      const [rows] = await pool.query(
        "SELECT * FROM safety_document_text_chunks WHERE document_id = ? ORDER BY chunk_index ASC",
        [id]
      );
      return {
        document,
        chunks: rows.map((row) => ({
          id: Number(row.id),
          chunkIndex: Number(row.chunk_index || 0),
          sourcePage: row.source_page || "",
          text: row.text_content || "",
          extractionMethod: row.extraction_method || "",
          ocrStatus: row.ocr_status || "",
          createdAt: toIso(row.created_at),
          updatedAt: toIso(row.updated_at)
        }))
      };
    },
    async runDocumentOcr(id, actor = {}, options = {}) {
      await ensureSchema();
      const document = await findDocument(id);
      if (!document) return null;
      const resolved = document.sourcePath ? path.resolve(rootDir, document.sourcePath) : "";
      if (resolved && resolved.startsWith(rootDir) && fs.existsSync(resolved)) {
        const extraction = await extractSafetyDocumentText(resolved, {
          ocr: true,
          maxOcrPages: Number(options.maxPages || options.maxOcrPages || 0),
          ocrLanguages: options.languages || options.ocrLanguages || "vie+eng",
          pageScale: Number(options.pageScale || 2)
        });
        const pseudoEntry = {
          ...document,
          checksum: document.checksum,
          departmentId: document.departmentId || "company",
          documentCode: document.documentCode,
          documentType: document.documentType,
          effectiveDate: document.effectiveDate,
          fileName: null,
          language: "vi",
          originalName: document.originalName,
          ownerRole: document.ownerRole,
          scopeLevel: document.scopeLevel,
          section6s: document.section6s,
          size: document.size,
          source: document.source,
          tags: document.tags,
          uploadedAt: document.uploadedAt,
          version: document.version
        };
        await upsertImportedDocument(pseudoEntry, extraction);
        await insertLog({ entityType: "document", entityId: id, action: "ocr-run", actor, summary: extraction.ocrStatus });
        return this.getDocumentText(id);
      }
      await pool.query("UPDATE documents SET ocr_status = 'queued', ocr_updated_at = ? WHERE id = ?", [nowMysql(), id]);
      await insertLog({ entityType: "document", entityId: id, action: "ocr-queued", actor, summary: "Source file unavailable for local extraction" });
      return this.getDocumentText(id);
    },
    async listAuditTemplates() {
      await ensureSchema();
      const [templates] = await pool.query("SELECT * FROM safety_audit_templates ORDER BY status ASC, code ASC");
      const [questions] = await pool.query("SELECT * FROM safety_audit_questions ORDER BY template_id ASC, sort_order ASC");
      const questionMap = new Map();
      questions.forEach((row) => {
        const list = questionMap.get(row.template_id) || [];
        list.push(rowToAuditQuestion(row));
        questionMap.set(row.template_id, list);
      });
      return templates.map((row) => rowToAuditTemplate(row, questionMap.get(row.id) || []));
    },
    async createAuditTemplate(input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const id = input.id || newId("audit-template");
      const code = text(input.code, generateCode("AUD-TPL"));
      const now = nowMysql();
      await pool.query(
        `INSERT INTO safety_audit_templates
         (id, code, name, document_id, document_code, scope_level, template_type, version, status, owner_role, description,
          created_by_id, created_by_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          code,
          text(input.name, "Template audit mới"),
          textOrNull(input.documentId),
          textOrNull(input.documentCode),
          text(input.scopeLevel, "department"),
          text(input.templateType, "6s-audit"),
          text(input.version, "1.0"),
          text(input.status, "active"),
          text(input.ownerRole, "ehs"),
          textOrNull(input.description),
          safeActor.id,
          safeActor.displayName,
          now,
          now
        ]
      );
      await insertLog({ entityType: "audit-template", entityId: id, action: "created", actor: safeActor, summary: code });
      return (await this.listAuditTemplates()).find((item) => item.id === id);
    },
    async updateAuditTemplate(id, input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      await pool.query(
        `UPDATE safety_audit_templates
         SET name = COALESCE(?, name), document_id = ?, document_code = ?, scope_level = COALESCE(?, scope_level),
             template_type = COALESCE(?, template_type), version = COALESCE(?, version), status = COALESCE(?, status),
             owner_role = COALESCE(?, owner_role), description = ?, updated_at = ?
         WHERE id = ?`,
        [
          textOrNull(input.name),
          textOrNull(input.documentId),
          textOrNull(input.documentCode),
          textOrNull(input.scopeLevel),
          textOrNull(input.templateType),
          textOrNull(input.version),
          textOrNull(input.status),
          textOrNull(input.ownerRole),
          textOrNull(input.description),
          nowMysql(),
          id
        ]
      );
      await insertLog({ entityType: "audit-template", entityId: id, action: "updated", actor: safeActor, summary: text(input.name) });
      return (await this.listAuditTemplates()).find((item) => item.id === id) || null;
    },
    async listAudits(query = {}) {
      await ensureSchema();
      const where = ["deleted_at IS NULL"];
      const params = [];
      if (query.dept || query.departmentCode) {
        where.push("department_code = ?");
        params.push(String(query.dept || query.departmentCode));
      }
      if (query.status) {
        where.push("status = ?");
        params.push(String(query.status));
      }
      if (query.period) {
        where.push("period = ?");
        params.push(String(query.period));
      }
      const [rows] = await pool.query(
        `SELECT * FROM safety_audits WHERE ${where.join(" AND ")} ORDER BY COALESCE(scheduled_date, created_at) DESC LIMIT ?`,
        [...params, Math.max(1, Math.min(200, Number(query.limit) || 100))]
      );
      return rows.map((row) => rowToAudit(row));
    },
    async createAudit(input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const id = input.id || newId("audit");
      const code = text(input.code, generateCode("AUD"));
      const templateId = text(input.templateId || input.template_id, DEFAULT_AUDIT_TEMPLATE.id);
      const departmentCode = text(input.departmentCode || input.department_code || input.department, safeActor.departmentId || "EHS");
      const now = nowMysql();
      await pool.query(
        `INSERT INTO safety_audits
         (id, code, template_id, title, department_code, location_id, scope_level, period, scheduled_date, status,
          created_by_id, created_by_name, updated_by_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          code,
          templateId,
          text(input.title, `Audit 6S ${departmentCode}`),
          departmentCode,
          textOrNull(input.locationId || input.location_id),
          text(input.scopeLevel || input.scope_level, "department"),
          textOrNull(input.period),
          toDateOnly(input.scheduledDate || input.scheduled_date),
          text(input.status, "draft"),
          safeActor.id,
          safeActor.displayName,
          safeActor.displayName,
          now,
          now
        ]
      );
      const [questions] = await pool.query("SELECT * FROM safety_audit_questions WHERE template_id = ? AND active = 1 ORDER BY sort_order ASC", [templateId]);
      const answers = Array.isArray(input.answers) && input.answers.length
        ? input.answers
        : questions.map((question) => ({ questionId: question.id, score: question.max_score, resultStatus: "pass", actionRequired: false }));
      await saveAuditAnswers(id, answers);
      await insertLog({ entityType: "audit", entityId: id, action: "created", actor: safeActor, summary: code });
      return findAudit(id);
    },
    async updateAudit(id, input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      await pool.query(
        `UPDATE safety_audits
         SET title = COALESCE(?, title), department_code = COALESCE(?, department_code), location_id = ?,
             scope_level = COALESCE(?, scope_level), period = ?, scheduled_date = ?, status = COALESCE(?, status),
             updated_by_name = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [
          textOrNull(input.title),
          textOrNull(input.departmentCode || input.department_code),
          textOrNull(input.locationId || input.location_id),
          textOrNull(input.scopeLevel || input.scope_level),
          textOrNull(input.period),
          toDateOnly(input.scheduledDate || input.scheduled_date),
          textOrNull(input.status),
          safeActor.displayName,
          nowMysql(),
          id
        ]
      );
      if (Array.isArray(input.answers)) {
        await saveAuditAnswers(id, input.answers);
      }
      await insertLog({ entityType: "audit", entityId: id, action: "updated", actor: safeActor });
      return findAudit(id);
    },
    async submitAudit(id, input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      if (Array.isArray(input.answers)) {
        await saveAuditAnswers(id, input.answers);
      }
      const scores = await recalculateAudit(id);
      await pool.query(
        "UPDATE safety_audits SET status = 'submitted', performed_at = COALESCE(performed_at, ?), updated_by_name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
        [nowMysql(), safeActor.displayName, nowMysql(), id]
      );
      const audit = await findAudit(id);
      const [existingActions] = await pool.query("SELECT COUNT(*) AS total FROM safety_actions WHERE source_type = 'audit' AND source_id = ? AND deleted_at IS NULL", [id]);
      if (audit && Number(existingActions[0]?.total || 0) === 0) {
        for (const answer of audit.answers.filter((item) => item.actionRequired || item.score < 4)) {
          await createActionInternal(
            {
              title: `Khắc phục điểm audit ${audit.code}`,
              description: answer.finding || "Điểm không phù hợp cần khắc phục sau audit 6S.",
              sourceType: "audit",
              sourceId: audit.id,
              sourceCode: audit.code,
              departmentCode: audit.departmentCode,
              locationId: audit.locationId,
              priority: answer.score <= 2 ? "high" : "medium",
              dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            },
            safeActor
          );
        }
      }
      await insertLog({ entityType: "audit", entityId: id, action: "submitted", actor: safeActor, metadata: scores });
      return findAudit(id);
    },
    async reviewAudit(id, input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const approved = input.approved !== false;
      await pool.query(
        `UPDATE safety_audits
         SET status = ?, reviewer_id = ?, reviewer_name = ?, reviewed_at = ?, review_note = ?, updated_by_name = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [
          approved ? "reviewed" : "reopened",
          safeActor.id,
          safeActor.displayName,
          nowMysql(),
          textOrNull(input.note || input.reviewNote),
          safeActor.displayName,
          nowMysql(),
          id
        ]
      );
      await insertLog({ entityType: "audit", entityId: id, action: approved ? "reviewed" : "reopened", actor: safeActor, summary: text(input.note) });
      return findAudit(id);
    },
    async listActions(query = {}) {
      await ensureSchema();
      const where = ["deleted_at IS NULL"];
      const params = [];
      if (query.dept || query.departmentCode) {
        where.push("department_code = ?");
        params.push(String(query.dept || query.departmentCode));
      }
      if (query.status) {
        where.push("status = ?");
        params.push(String(query.status));
      }
      if (query.priority) {
        where.push("priority = ?");
        params.push(String(query.priority));
      }
      const [rows] = await pool.query(
        `SELECT * FROM safety_actions WHERE ${where.join(" AND ")} ORDER BY FIELD(status,'open','assigned','in_progress','blocked','done_by_owner','reopened','verified','closed'), due_date ASC, updated_at DESC LIMIT ?`,
        [...params, Math.max(1, Math.min(300, Number(query.limit) || 200))]
      );
      return rows.map(rowToAction);
    },
    async createAction(input = {}, actor = {}) {
      await ensureSchema();
      return createActionInternal(input, actor);
    },
    async updateAction(id, input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      await pool.query(
        `UPDATE safety_actions
         SET title = COALESCE(?, title), description = ?, department_code = COALESCE(?, department_code), location_id = ?,
             priority = COALESCE(?, priority), status = COALESCE(?, status), owner_id = ?, owner_name = ?,
             due_date = ?, evidence_notes = ?, updated_by_name = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [
          textOrNull(input.title),
          textOrNull(input.description),
          textOrNull(input.departmentCode || input.department_code),
          textOrNull(input.locationId || input.location_id),
          textOrNull(input.priority),
          textOrNull(input.status),
          textOrNull(input.ownerId || input.owner_id),
          textOrNull(input.ownerName || input.owner_name),
          toDateOnly(input.dueDate || input.due_date),
          textOrNull(input.evidenceNotes || input.evidence_notes),
          safeActor.displayName,
          nowMysql(),
          id
        ]
      );
      await insertLog({ entityType: "action", entityId: id, action: "updated", actor: safeActor });
      const [rows] = await pool.query("SELECT * FROM safety_actions WHERE id = ? LIMIT 1", [id]);
      return rows[0] ? rowToAction(rows[0]) : null;
    },
    async submitActionEvidence(id, input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      await pool.query(
        `UPDATE safety_actions
         SET status = 'done_by_owner', evidence_notes = ?, completed_at = ?, updated_by_name = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [text(input.evidenceNotes || input.evidence_notes, "Đã gửi bằng chứng hoàn thành"), nowMysql(), safeActor.displayName, nowMysql(), id]
      );
      await insertLog({ entityType: "action", entityId: id, action: "evidence-submitted", actor: safeActor });
      const [rows] = await pool.query("SELECT * FROM safety_actions WHERE id = ? LIMIT 1", [id]);
      return rows[0] ? rowToAction(rows[0]) : null;
    },
    async verifyAction(id, input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const approved = input.approved !== false;
      await pool.query(
        `UPDATE safety_actions
         SET status = ?, verified_by_id = ?, verified_by_name = ?, verified_at = ?, verification_note = ?, updated_by_name = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [
          approved ? "closed" : "reopened",
          safeActor.id,
          safeActor.displayName,
          nowMysql(),
          textOrNull(input.note || input.verificationNote),
          safeActor.displayName,
          nowMysql(),
          id
        ]
      );
      await insertLog({ entityType: "action", entityId: id, action: approved ? "verified" : "reopened", actor: safeActor });

      // Auto-Sync: Khi Action hoàn thành (closed) và nguồn gốc là Warning → Tự động đóng Warning gốc
      if (approved) {
        const [actionRows] = await pool.query("SELECT source_type, source_id FROM safety_actions WHERE id = ? LIMIT 1", [id]);
        const actionRow = actionRows[0];
        if (actionRow && actionRow.source_type === "warning" && actionRow.source_id) {
          try {
            await pool.query(
              `UPDATE safety_warnings SET status = 'CLOSED', updated_by_name = ?, updated_at = ? WHERE id = ? AND status != 'CLOSED'`,
              [safeActor.displayName, nowMysql(), actionRow.source_id]
            );
          } catch (syncError) {
            console.error("[Auto-Sync] Failed to close source warning:", syncError.message);
          }
        }
      }

      const [rows] = await pool.query("SELECT * FROM safety_actions WHERE id = ? LIMIT 1", [id]);
      return rows[0] ? rowToAction(rows[0]) : null;
    },
    async listLocations(query = {}) {
      await ensureSchema();
      const where = ["active = 1"];
      const params = [];
      if (query.dept || query.departmentCode) {
        where.push("department_code = ?");
        params.push(String(query.dept || query.departmentCode));
      }
      const [rows] = await pool.query(
        `SELECT * FROM safety_locations WHERE ${where.join(" AND ")} ORDER BY department_code ASC, code ASC LIMIT 300`,
        params
      );
      return rows.map(rowToLocation);
    },
    async createLocation(input = {}, actor = {}) {
      await ensureSchema();
      const safeActor = actorFields(actor);
      const id = input.id || newId("loc");
      const code = text(input.code, generateCode("LOC"));
      const qrCode = text(input.qrCode || input.qr_code, `MHC-6S-${code}`);
      const now = nowMysql();
      await pool.query(
        `INSERT INTO safety_locations
         (id, code, name, department_code, area_type, parent_id, qr_code, risk_level, description, active,
          created_by_id, created_by_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [
          id,
          code,
          text(input.name, "Khu vực mới"),
          text(input.departmentCode || input.department_code, safeActor.departmentId || "EHS"),
          text(input.areaType || input.area_type, "area"),
          textOrNull(input.parentId || input.parent_id),
          qrCode,
          text(input.riskLevel || input.risk_level, "medium"),
          textOrNull(input.description),
          safeActor.id,
          safeActor.displayName,
          now,
          now
        ]
      );
      await insertLog({ entityType: "location", entityId: id, action: "created", actor: safeActor, summary: code });
      const [rows] = await pool.query("SELECT * FROM safety_locations WHERE id = ? LIMIT 1", [id]);
      return rowToLocation(rows[0]);
    },
    async findLocationByQr(qrCode) {
      await ensureSchema();
      const [rows] = await pool.query("SELECT * FROM safety_locations WHERE qr_code = ? AND active = 1 LIMIT 1", [qrCode]);
      return rows[0] ? rowToLocation(rows[0]) : null;
    },
    async listTrainingRequirements(query = {}) {
      await ensureSchema();
      const where = ["active = 1"];
      const params = [];
      if (query.dept || query.departmentCode) {
        where.push("(department_code IS NULL OR department_code = ?)");
        params.push(String(query.dept || query.departmentCode));
      }
      const [rows] = await pool.query(`SELECT * FROM safety_training_requirements WHERE ${where.join(" AND ")} ORDER BY category ASC, code ASC`, params);
      return rows.map(rowToTrainingRequirement);
    },
    async createTrainingRequirement(input = {}, actor = {}) {
      await ensureSchema();
      const id = input.id || newId("training-req");
      const code = text(input.code, generateCode("TR"));
      const now = nowMysql();
      await pool.query(
        `INSERT INTO safety_training_requirements
         (id, code, title, category, required_for_scope, department_code, role_name, document_id, frequency_months, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          id,
          code,
          text(input.title, "Yêu cầu đào tạo mới"),
          text(input.category, "Safety"),
          text(input.requiredForScope || input.required_for_scope, "department"),
          textOrNull(input.departmentCode || input.department_code),
          textOrNull(input.roleName || input.role_name),
          textOrNull(input.documentId || input.document_id),
          Math.max(1, numberOr(input.frequencyMonths || input.frequency_months, 12)),
          now,
          now
        ]
      );
      await insertLog({ entityType: "training-requirement", entityId: id, action: "created", actor, summary: code });
      return (await this.listTrainingRequirements()).find((item) => item.id === id);
    },
    async listTrainingRecords(query = {}) {
      await ensureSchema();
      const where = ["1=1"];
      const params = [];
      if (query.dept || query.departmentCode) {
        where.push("department_code = ?");
        params.push(String(query.dept || query.departmentCode));
      }
      if (query.status) {
        where.push("status = ?");
        params.push(String(query.status));
      }
      const [rows] = await pool.query(`SELECT * FROM safety_training_records WHERE ${where.join(" AND ")} ORDER BY expires_at ASC, updated_at DESC LIMIT 500`, params);
      return rows.map(rowToTrainingRecord);
    },
    async createTrainingRecord(input = {}, actor = {}) {
      await ensureSchema();
      const id = input.id || newId("training-record");
      const now = nowMysql();
      await pool.query(
        `INSERT INTO safety_training_records
         (id, requirement_id, employee_code, employee_name, department_code, completed_at, expires_at, status, evidence_document_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          text(input.requirementId || input.requirement_id),
          textOrNull(input.employeeCode || input.employee_code),
          text(input.employeeName || input.employee_name, "Nhân viên"),
          text(input.departmentCode || input.department_code, "EHS"),
          toDateOnly(input.completedAt || input.completed_at),
          toDateOnly(input.expiresAt || input.expires_at),
          text(input.status, "pending"),
          textOrNull(input.evidenceDocumentId || input.evidence_document_id),
          now,
          now
        ]
      );
      await insertLog({ entityType: "training-record", entityId: id, action: "created", actor });
      return (await this.listTrainingRecords()).find((item) => item.id === id);
    },
    async riskRegister(query = {}) {
      await ensureSchema();
      const params = [];
      const deptWhere = query.dept || query.departmentCode ? "AND department = ?" : "";
      if (deptWhere) params.push(String(query.dept || query.departmentCode));
      const [warnings] = await pool.query(
        `SELECT code, title, department, risk_level, risk_score, status, deadline, responsible_person
         FROM safety_warnings WHERE deleted_at IS NULL ${deptWhere}
         ORDER BY risk_score DESC, deadline ASC LIMIT 100`,
        params
      );
      const actionParams = query.dept || query.departmentCode ? [String(query.dept || query.departmentCode)] : [];
      const [actions] = await pool.query(
        `SELECT code, title, department_code, priority, status, due_date, owner_name
         FROM safety_actions WHERE deleted_at IS NULL ${actionParams.length ? "AND department_code = ?" : ""}
         ORDER BY FIELD(priority,'critical','high','medium','low'), due_date ASC LIMIT 100`,
        actionParams
      );
      return {
        warnings: warnings.map((row) => ({
          code: row.code,
          title: row.title,
          departmentCode: row.department,
          riskLevel: row.risk_level,
          riskScore: Number(row.risk_score || 0),
          status: row.status,
          dueDate: toDateOnly(row.deadline),
          ownerName: row.responsible_person || ""
        })),
        actions: actions.map((row) => ({
          code: row.code,
          title: row.title,
          departmentCode: row.department_code,
          riskLevel: row.priority,
          riskScore: row.priority === "high" ? 16 : row.priority === "medium" ? 9 : 4,
          status: row.status,
          dueDate: toDateOnly(row.due_date),
          ownerName: row.owner_name || ""
        }))
      };
    }
  };
};
