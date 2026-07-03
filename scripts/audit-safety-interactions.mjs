import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import defaultConfig from "../shared/defaultConfig.js";

const rootDir = process.cwd();
const baseUrl = (process.env.MHCHUB_AUDIT_BASE_URL || "http://localhost:4174").replace(/\/$/, "");
const username = process.env.MHCHUB_AUDIT_USERNAME || process.env.MHCHUB_E2E_USERNAME || "";
const password = process.env.MHCHUB_AUDIT_PASSWORD || process.env.MHCHUB_E2E_PASSWORD || "";
const sidebarOnly = process.argv.includes("--sidebar-only") || process.env.MHCHUB_AUDIT_SIDEBAR_ONLY === "1";
const mockApi = process.argv.includes("--mock-api") || process.env.MHCHUB_AUDIT_MOCK_API === "1";
const includeSidebarNavigation =
  sidebarOnly ||
  process.argv.includes("--include-sidebar-navigation") ||
  process.env.MHCHUB_AUDIT_INCLUDE_SIDEBAR_NAVIGATION === "1";
const reportsDir = path.join(rootDir, "qa", "reports");
const artifactsDir = path.join(rootDir, "output", "playwright");
const reportPath = path.join(reportsDir, "safety-interactions-audit.json");
const artifactReportPath = path.join(artifactsDir, `safety-interactions-audit-${Date.now()}.json`);

const viewports = [
  { name: "desktop", width: 1366, height: 768 },
  { name: "mobile", width: 390, height: 900 }
];

const routes = [
  { path: "/safety-6s", actions: ["route-load"] },
  { path: "/safety-6s/departments/production", actions: ["route-load"] },
  { path: "/safety-6s/checklist", actions: ["checklist-modal"] },
  { path: "/safety-6s/warnings", actions: ["warning-create", "warning-detail"] },
  { path: "/safety-6s/incidents", actions: ["incident-create", "incident-detail"] },
  { path: "/safety-6s/audits", actions: ["route-load"] },
  { path: "/safety-6s/actions", actions: ["route-load"] },
  { path: "/safety-6s/locations", actions: ["route-load"] },
  { path: "/safety-6s/kyt", actions: ["special-program-tabs"] },
  { path: "/safety-6s/pccc", actions: ["special-program-tabs"] },
  { path: "/safety-6s/medical", actions: ["special-program-tabs"] },
  { path: "/safety-6s/self-inspection", actions: ["special-program-tabs"] },
  { path: "/safety-6s/kpi", actions: ["kpi-filter-tabs"] },
  { path: "/safety-6s/data-entry", actions: ["entry-create"] },
  { path: "/safety-6s/approval", actions: ["approval-tabs"] },
  { path: "/safety-6s/documents", actions: ["document-upload", "document-text"] },
  { path: "/safety-6s/reports", actions: ["reports-tabs", "report-create"] },
  { path: "/safety-6s/training", actions: ["training-requirement", "training-record"] },
  { path: "/safety-6s/reference", actions: ["reference-load"] },
  { path: "/safety-6s/settings", actions: ["settings-edit"] }
];

const sidebarNavigationRoutes = [
  "/safety-6s",
  "/safety-6s/warnings",
  "/safety-6s/incidents",
  "/safety-6s/checklist",
  "/safety-6s/audits",
  "/safety-6s/actions",
  "/safety-6s/kpi",
  "/safety-6s/data-entry",
  "/safety-6s/approval",
  "/safety-6s/documents",
  "/safety-6s/reports",
  "/safety-6s/training",
  "/safety-6s/settings",
  "/safety-6s/reference"
];

const textPatterns = {
  cancel: /^\s*(H\u1ee7y|Hu\u1ef7|\u0110\u00f3ng|Cancel)\s*$/i,
  trainingRecord: /\u0054h\u00eam h\u1ed3 s\u01a1/i,
  trainingRequirement: /\u0054h\u00eam y\u00eau c\u1ea7u/i
};

const toRelative = (filePath) => path.relative(rootDir, filePath).replace(/\\/g, "/");
const asText = (error) => error?.message || String(error || "");
const nowIso = () => new Date().toISOString();

const mockUser = {
  department: "EHS",
  departmentCode: "EHS",
  departmentId: "ehs",
  displayName: "Nguyen Van Thang - PE1",
  email: "thangiot@mhc.local",
  name: "Nguyen Van Thang",
  phone: "0900000000",
  role: "admin",
  username: "thangiot"
};

const mockDepartments = [
  { code: "production", id: "production", manager: "Line Leader", name: "Production", owner: "Line Leader" },
  { code: "warehouse", id: "warehouse", manager: "Warehouse Supervisor", name: "Warehouse", owner: "Warehouse Supervisor" },
  { code: "engineering", id: "engineering", manager: "Maintenance Lead", name: "Engineering", owner: "Maintenance Lead" },
  { code: "quality", id: "quality", manager: "QA/QC Supervisor", name: "QA/QC", owner: "QA/QC Supervisor" },
  { code: "office", id: "office", manager: "Admin", name: "Office", owner: "Admin" },
  { code: "ehs", id: "ehs", manager: "EHS Officer", name: "EHS/6S", owner: "EHS Officer" }
];

const mockLocations = [
  { code: "PY1-LINE-A", departmentCode: "production", id: "loc-production-a", name: "Production line A", qrCode: "QR-PY1-LINE-A", riskLevel: "medium" },
  { code: "EHS-OFFICE", departmentCode: "ehs", id: "loc-ehs-office", name: "EHS office", qrCode: "QR-EHS-OFFICE", riskLevel: "low" }
];

const mockWarnings = [
  {
    approvalStatus: "approved",
    area: "Production line A",
    category: "6S",
    code: "WARN-AUDIT-001",
    createdAt: nowIso(),
    createdByName: "Audit smoke",
    deadline: "2026-06-30",
    department: "production",
    departmentCode: "production",
    description: "Loose cable near operator walkway.",
    id: "warn-audit-001",
    location: "Production line A",
    relatedStandard: "EHS-QT-12",
    reporterName: "Audit smoke",
    responsiblePerson: "Line Leader",
    riskLevel: "Trung binh",
    riskScore: 9,
    severity: "medium",
    status: "Dang xu ly",
    title: "Cable route needs correction"
  }
];

const mockIncidents = [
  {
    approvalStatus: "approved",
    area: "Warehouse aisle",
    code: "INC-AUDIT-001",
    createdAt: nowIso(),
    department: "warehouse",
    departmentCode: "warehouse",
    description: "Near miss during material movement.",
    id: "inc-audit-001",
    occurredDate: nowIso().slice(0, 10),
    severity: "low",
    status: "investigating",
    title: "Forklift pedestrian near miss"
  }
];

const mockKpiEntries = [
  {
    approvalStatus: "pending_l2",
    code: "KPI-AUDIT-001",
    createdAt: nowIso(),
    departmentCode: "EHS",
    divisionCode: "EHS",
    entryType: "safety_score_monthly",
    id: "kpi-audit-001",
    l1ApprovedAt: nowIso(),
    l1ApprovedByName: "Line Leader",
    l2ApprovedAt: null,
    l2ApprovedByName: null,
    notes: "Audit smoke KPI row.",
    period: nowIso().slice(0, 7),
    rejectionReason: null,
    rejectedByLevel: null,
    submittedByDept: "EHS",
    submittedByName: "Audit smoke",
    target: "90",
    unit: "diem",
    value: "92"
  },
  {
    approvalStatus: "approved",
    code: "KPI-AUDIT-002",
    createdAt: nowIso(),
    departmentCode: "Production",
    divisionCode: "PRD",
    entryType: "safety_score_monthly",
    id: "kpi-audit-002",
    l1ApprovedAt: nowIso(),
    l1ApprovedByName: "Line Leader",
    l2ApprovedAt: nowIso(),
    l2ApprovedByName: "EHS Officer",
    notes: "Approved audit smoke KPI row.",
    period: nowIso().slice(0, 7),
    rejectionReason: null,
    rejectedByLevel: null,
    submittedByDept: "Production",
    submittedByName: "Audit smoke",
    target: "90",
    unit: "diem",
    value: "94"
  },
  {
    approvalStatus: "rejected",
    code: "KPI-AUDIT-003",
    createdAt: nowIso(),
    departmentCode: "QA/QC",
    divisionCode: "QA",
    entryType: "checklist_daily",
    id: "kpi-audit-003",
    l1ApprovedAt: null,
    l1ApprovedByName: null,
    l2ApprovedAt: null,
    l2ApprovedByName: null,
    notes: "Rejected audit smoke KPI row.",
    period: nowIso().slice(0, 10),
    rejectionReason: "Missing evidence.",
    rejectedByLevel: "l1",
    submittedByDept: "QA/QC",
    submittedByName: "Audit smoke",
    target: "80",
    unit: "%",
    value: "72"
  }
];

const mockReports = [
  {
    code: "RPT-AUDIT-001",
    createdAt: nowIso(),
    creator: "Audit smoke",
    department: "EHS",
    id: "rpt-audit-001",
    notes: "Sidebar smoke report.",
    period: "Month 06/2026",
    status: "Cho duyet",
    title: "Safety sidebar audit report",
    type: "Thang"
  }
];

const mockDocuments = [
  {
    category: "sixs-standard",
    createdAt: nowIso(),
    documentCode: "DOC-AUDIT-001",
    fileName: "safety-audit-smoke.pdf",
    id: "doc-audit-001",
    mimeType: "application/pdf",
    ocrStatus: "indexed",
    scopeLevel: "company",
    source: "safety-document-import",
    sourcePath: "tai lieu/safety-audit-smoke.pdf",
    tags: ["6s", "audit"],
    title: "Safety audit smoke document",
    titleI18n: { en: "Safety audit smoke document", ja: "Safety audit smoke document", vi: "Safety audit smoke document" },
    version: "1.0"
  }
];

const mockPaged = (items = []) => ({
  items,
  pagination: {
    page: 1,
    pageSize: Math.max(20, items.length),
    totalItems: items.length,
    totalPages: 1
  }
});

const mockChecklistTemplate = {
  dailyDepartmentChecklist: {
    code: "EHS-QT-12",
    id: "ehs-qt-12-daily-6s",
    items: [
      { category: "Access", id: 1, item: "Walkways are clear" },
      { category: "PPE", id: 2, item: "Correct PPE is available" },
      { category: "Tools", id: 3, item: "Tools are returned to assigned positions" }
    ],
    title: "Daily 6S checklist"
  }
};

const mockChecklistSummary = mockDepartments.map((department, index) => ({
  checkedCount: 8 + index,
  departmentCode: department.code,
  passCount: 8 + index,
  period: nowIso().slice(0, 7),
  score: 85 + index,
  totalCount: 10
}));

const mockReferencePayload = {
  endpoints: [
    { auth: "admin", method: "GET", module: "reference", path: "/api/safety/reference", purpose: "Safety reference catalog" },
    { auth: "admin", method: "GET", module: "documents", path: "/api/safety/document-architecture", purpose: "Safety document architecture" }
  ],
  formulas: [
    {
      description: "Tracks the share of KPI records approved by EHS/Admin.",
      expression: "approved / total * 100",
      icon: "Sigma",
      id: "kpi-approval-rate",
      notes: ["Uses approved and total KPI records.", "Empty states are expected when a filter has no rows."],
      title: "Approval rate"
    }
  ],
  icons: [{ group: "Navigation", icon: "ShieldCheck", label: "Safety control", route: "/safety-6s", usage: "Primary safety indicator" }],
  modals: [{ icon: "FileText", primaryAction: "View text", route: "/safety-6s/documents", sections: ["Metadata", "OCR text"], title: "Document text" }],
  routes: sidebarNavigationRoutes.map((routePath) => ({
    api: ["/api/auth/me", routePath === "/safety-6s/reference" ? "/api/safety/reference" : "/api/safety/departments"],
    icon: "Route",
    label: routePath.replace("/safety-6s/", "") || "Dashboard",
    page: routePath.replace("/safety-6s/", "Safety") || "Safety dashboard",
    path: routePath,
    title: routePath.replace("/safety-6s/", "") || "dashboard"
  }))
};

const mockDocumentArchitecture = {
  generatedAt: nowIso(),
  levels: [
    { focus: "Company-wide safety procedures.", icon: "Factory", id: "company", responsibilities: ["Own standards.", "Review evidence."], title: "Company" },
    { focus: "Department operating records.", icon: "Users", id: "department", responsibilities: ["Run daily checks.", "Close actions."], title: "Department" }
  ],
  modules: [
    {
      chunkCount: 3,
      documentCount: 1,
      icon: "ClipboardCheck",
      id: "sixs-checklist",
      indexedCount: 1,
      levels: ["company", "department"],
      outcome: "6S checklist and operating controls.",
      path: "/safety-6s/checklist",
      sourceCategories: ["sixs-standard"],
      sourceDocuments: mockDocuments.map((document) => ({
        category: document.category,
        chunkCount: 3,
        documentCode: document.documentCode,
        documentType: "pdf",
        effectiveDate: "2026-06-01",
        extractionMethod: "mock-index",
        id: document.id,
        name: document.title,
        ocrStatus: document.ocrStatus,
        scopeLevel: document.scopeLevel,
        sourcePath: document.sourcePath
      })),
      status: "existing",
      title: "6S checklist"
    }
  ],
  summary: {
    existingModules: 1,
    extendModules: 0,
    indexedDocuments: 1,
    proposedModules: 0,
    totalChunks: 3,
    totalDocuments: 1
  }
};

const mockProgramPayload = (programId) => ({
  apiPlan: [`GET /api/safety/programs/${programId}`, "GET /api/documents"],
  cadence: "Monthly",
  charts: {
    departments: [
      { label: "Production", tone: "blue", value: 2 },
      { label: "EHS", tone: "emerald", value: 1 }
    ],
    status: [
      { label: "Open", tone: "amber", value: 1 },
      { label: "Closed", tone: "emerald", value: 2 }
    ]
  },
  checkpoints: [
    { group: "Control", id: `${programId}-control`, severity: "medium", standard: "Owner verifies controls before work.", title: "Pre-work control" },
    { group: "Evidence", id: `${programId}-evidence`, severity: "low", standard: "Evidence is attached to the record.", title: "Evidence trail" }
  ],
  dataSourceNote: "Mocked only for current-source sidebar audit.",
  documentCategories: ["sixs-standard"],
  documents: mockDocuments,
  icon: "ShieldCheck",
  id: programId,
  ownerRole: "EHS",
  primaryAction: "Review",
  records: [
    {
      actionCode: "CAPA-AUDIT",
      department: "EHS",
      detail: "Mock sidebar audit record.",
      dueDate: "2026-06-30",
      findings: 1,
      id: `${programId.toUpperCase()}-AUDIT-001`,
      location: "EHS office",
      owner: "EHS",
      progress: 72,
      status: "open",
      title: "Audit smoke action"
    }
  ],
  route: `/safety-6s/${programId}`,
  scope: "Company",
  stats: [
    { helper: "Open records", icon: "ListChecks", id: "open", label: "Open", tone: "amber", value: 1 },
    { helper: "Indexed documents", icon: "FileText", id: "docs", label: "Documents", tone: "blue", value: mockDocuments.length }
  ],
  subtitle: `${programId.toUpperCase()} safety program`,
  summary: {
    chunkCount: 3,
    documentCount: mockDocuments.length,
    indexedDocuments: mockDocuments.length,
    openRecords: 1,
    overdueRecords: 0
  },
  title: `${programId.toUpperCase()} program`
});

function routeJson(route, payload, status = 200) {
  return route.fulfill({
    body: JSON.stringify(payload),
    contentType: "application/json; charset=utf-8",
    status
  });
}

function mockApiPayload(pathname, method) {
  if (pathname === "/api/auth/me" || pathname === "/api/auth/login") return { data: { user: mockUser } };
  if (pathname === "/api/auth/logout") return { ok: true };
  if (pathname === "/api/config") return defaultConfig;
  if (pathname === "/api/profile") return { data: { profile: mockUser }, user: mockUser };
  if (pathname === "/api/safety/departments") return mockDepartments;
  if (pathname === "/api/locations") return mockLocations;
  if (pathname.startsWith("/api/qr/")) return mockLocations[0];
  if (pathname === "/api/actions") return [{ departmentCode: "production", due: "2026-06-30", id: "act-audit-001", severity: "medium", status: "open", title: "Close audit smoke action" }];
  if (pathname === "/api/audits") {
    return [
      {
        code: "AUD-AUDIT-001",
        createdAt: nowIso(),
        createdByName: "Audit smoke",
        departmentCode: "production",
        id: "audit-smoke-001",
        maxScore: 10,
        period: nowIso().slice(0, 7),
        scheduledDate: "2026-06-30",
        scorePercent: 92,
        status: "closed",
        templateId: "tpl-6s",
        title: "Production 6S walk-through",
        totalScore: 9.2
      }
    ];
  }
  if (pathname === "/api/audit-templates") {
    return [
      {
        code: "TPL-6S",
        id: "tpl-6s",
        name: "6S walk-through",
        questions: [
          { expectedStandard: "Walkways are clear.", id: "q-1", maxScore: 5, pillar: "S1", question: "Are walkways clear?", requiredEvidence: false, sortOrder: 1 },
          { expectedStandard: "PPE is available.", id: "q-2", maxScore: 5, pillar: "S6", question: "Is PPE available?", requiredEvidence: true, sortOrder: 2 }
        ],
        version: "1.0"
      }
    ];
  }
  if (pathname === "/api/warnings") return mockWarnings;
  if (pathname === "/api/incidents") return mockIncidents;
  if (pathname === "/api/kpi-entries") return mockKpiEntries;
  if (/^\/api\/kpi-entries\/[^/]+\/history$/.test(pathname)) return [];
  if (/^\/api\/kpi-entries\/[^/]+\/(?:approve-l1|approve-l2|reject-l1|reject-l2)$/.test(pathname)) return mockKpiEntries[0];
  if (pathname === "/api/checklists/template") return mockChecklistTemplate;
  if (pathname === "/api/checklists/summary") return mockChecklistSummary;
  if (pathname === "/api/checklists") return [];
  if (pathname === "/api/reports") return method === "GET" ? mockReports : { ...mockReports[0], id: "rpt-audit-created" };
  if (/^\/api\/reports\/[^/]+$/.test(pathname)) return method === "DELETE" ? { ok: true } : mockReports[0];
  if (pathname === "/api/training-courses") return [{ code: "TR-AUDIT", id: "course-audit-001", name: "Safety orientation", requiredRole: "all", validityMonths: 12 }];
  if (pathname === "/api/training-requirements") return [{ courseId: "course-audit-001", departmentCode: "production", id: "req-audit-001", requiredBy: "2026-06-30", status: "open" }];
  if (pathname === "/api/training-records") return [{ courseId: "course-audit-001", employeeName: "Audit smoke", id: "record-audit-001", status: "valid", trainedAt: "2026-06-01" }];
  if (pathname === "/api/safety/reference") return mockReferencePayload;
  if (pathname === "/api/safety/document-architecture") return mockDocumentArchitecture;
  if (pathname === "/api/safety/programs") {
    return { programs: ["kyt", "pccc", "medical", "self-inspection"].map((id) => ({ id, route: `/safety-6s/${id}`, title: `${id.toUpperCase()} program` })) };
  }
  if (/^\/api\/safety\/programs\/[^/]+$/.test(pathname)) return mockProgramPayload(pathname.split("/").pop());
  if (pathname === "/api/documents/import-manifest") return { stats: { imported: 0, indexed: mockDocuments.length, ocrRequired: 0 } };
  if (pathname === "/api/documents") return method === "GET" ? mockPaged(mockDocuments) : mockDocuments[0];
  if (/^\/api\/documents\/[^/]+\/(?:text|ocr)$/.test(pathname)) return { document: mockDocuments[0], text: "Audit smoke document text.", chunks: [] };
  if (/^\/api\/documents\/[^/]+$/.test(pathname)) return mockDocuments[0];
  return method === "GET" ? [] : { ok: true };
}

async function setupMockApi(page) {
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    return routeJson(route, mockApiPayload(url.pathname, request.method()));
  });
}

function isBenignNavigationAbort(event) {
  return (
    event.type === "requestfailed" &&
    event.method === "GET" &&
    event.failure === "net::ERR_ABORTED" &&
    /\/assets\/[^/]+\.(?:css|js)$/i.test(event.url || "")
  );
}

function filteredEvents(events) {
  return events.filter((event) => !/favicon\.ico/i.test(event.url || "") && !isBenignNavigationAbort(event));
}

async function firstVisible(locator) {
  const count = await locator.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    if (await item.isVisible().catch(() => false)) return item;
  }
  return null;
}

async function clickFirst(page, locators, label, options = {}) {
  for (const locator of locators) {
    const item = typeof locator === "string" ? await firstVisible(page.locator(locator)) : await firstVisible(locator);
    if (!item) continue;
    if (options.requireEnabled !== false && !(await item.isEnabled().catch(() => true))) continue;
    await item.scrollIntoViewIfNeeded().catch(() => {});
    await item.click({ timeout: 5000 });
    return { ok: true, selector: typeof locator === "string" ? locator : "locator" };
  }
  return { ok: false, error: `Element not found: ${label}` };
}

async function login(page) {
  if (mockApi) return "mock-api";

  if (!username || !password) {
    throw new Error("Set MHCHUB_AUDIT_USERNAME and MHCHUB_AUDIT_PASSWORD before running audit:safety-interactions.");
  }

  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  const passwordInput = page.locator("input[type=\"password\"]").first();
  if (!(await passwordInput.isVisible().catch(() => false))) return page.url();

  const usernameInput = page.locator("input[type=\"text\"], input[name=\"username\"], input[autocomplete=\"username\"], input:not([type])").first();
  await usernameInput.fill(username);
  await passwordInput.fill(password);

  const submit = (await firstVisible(page.locator("button[type=\"submit\"]"))) || (await firstVisible(page.locator("button")));
  if (!submit) throw new Error("Login submit button not found.");

  await submit.click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  return page.url();
}

async function dialogCount(page) {
  return page.locator("[role=\"dialog\"]").count();
}

async function waitForDialog(page, label) {
  await page.locator("[role=\"dialog\"]").last().waitFor({ state: "visible", timeout: 8000 });
  const count = await dialogCount(page);
  const health = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const docOverflowX = Math.max(0, document.documentElement.scrollWidth - viewportWidth);
    const bodyOverflowX = Math.max(0, document.body.scrollWidth - viewportWidth);
    const dialogs = Array.from(document.querySelectorAll("[role=\"dialog\"]")).map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        bottom: Math.round(rect.bottom),
        className: String(node.className),
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        overflowsX: rect.left < -2 || rect.right > viewportWidth + 2,
        overflowsYHard: rect.top < -8 || rect.bottom > viewportHeight + 24,
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        width: Math.round(rect.width)
      };
    });
    const clippedButtons = Array.from(document.querySelectorAll("[role=\"dialog\"] button, [role=\"dialog\"] a"))
      .filter((node) => {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && node.scrollWidth > node.clientWidth + 3;
      })
      .slice(0, 8)
      .map((node) => ({
        className: String(node.className),
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        text: (node.textContent || node.getAttribute("aria-label") || "").trim().slice(0, 80)
      }));

    return { bodyOverflowX, clippedButtons, dialogs, docOverflowX, viewportHeight, viewportWidth };
  });

  return {
    count,
    health,
    label,
    ok:
      count > 0 &&
      health.docOverflowX === 0 &&
      health.bodyOverflowX === 0 &&
      health.dialogs.every((dialog) => !dialog.overflowsX) &&
      health.clippedButtons.length === 0
  };
}

async function closeAnyDialog(page) {
  const dialog = page.locator("[role=\"dialog\"]").last();
  if (!(await dialog.isVisible().catch(() => false))) return { ok: true, method: "none" };

  const candidates = [
    dialog.locator("button").filter({ hasText: textPatterns.cancel }).first(),
    dialog.locator("button[aria-label]").filter({ has: page.locator("svg") }).first(),
    dialog.locator("button").first()
  ];

  for (const candidate of candidates) {
    if (!(await candidate.isVisible().catch(() => false))) continue;
    await candidate.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(250);
    if ((await dialogCount(page)) === 0) return { ok: true, method: "button" };
  }

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250);
  return { ok: (await dialogCount(page)) === 0, method: "escape" };
}

async function routeHealth(page) {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const bodyText = document.body.innerText || "";
    const overflowX = Math.max(0, document.documentElement.scrollWidth - viewportWidth, document.body.scrollWidth - viewportWidth);
    return {
      dialogCount: document.querySelectorAll("[role=\"dialog\"]").length,
      overflowX,
      stuckLoading: /loading/i.test(bodyText) && bodyText.trim().length < 220,
      textLength: bodyText.trim().length,
      title: document.title,
      url: location.pathname
    };
  });
}

function hasStableRouteHealth(health, minTextLength = 300) {
  return Boolean(health && health.overflowX === 0 && !health.stuckLoading && Number(health.textLength || 0) >= minTextLength);
}

async function waitForSidebarInteractive(page) {
  await page
    .waitForFunction(
      () => {
        const shell = document.querySelector(".app-shell");
        const rail = document.querySelector(".side-rail");
        if (!shell || !rail || !shell.classList.contains("sidebar-open")) return false;
        const style = window.getComputedStyle(rail);
        const rect = rail.getBoundingClientRect();
        return (
          style.pointerEvents !== "none" &&
          Number(style.opacity || "1") > 0.95 &&
          rect.left > -8 &&
          rect.right > 80 &&
          rect.width > 180
        );
      },
      null,
      { timeout: 2500 }
    )
    .catch(() => {});
}

async function waitForSidebarClosed(page) {
  await page
    .waitForFunction(() => !document.querySelector(".app-shell.sidebar-open"), null, { timeout: 1400 })
    .catch(() => {});
}

async function waitForRouteContentReady(page, routePath, minTextLength = 300) {
  await page
    .waitForFunction(
      ({ minTextLength: expectedTextLength, routePath: expectedRoutePath }) => {
        const bodyText = document.body.innerText || "";
        return (
          location.pathname === expectedRoutePath &&
          bodyText.trim().length >= expectedTextLength &&
          !(/loading/i.test(bodyText) && bodyText.trim().length < 220)
        );
      },
      { minTextLength, routePath },
      { timeout: 3500 }
    )
    .catch(() => {});
}

async function ensureSidebarOpen(page) {
  const alreadyOpen = await page.locator(".app-shell.sidebar-open").count().then((count) => count > 0).catch(() => false);
  if (alreadyOpen) {
    await waitForSidebarInteractive(page);
    return { ok: true, opened: false };
  }

  const toggle = page.locator(".sidebar-toggle").first();
  if (!(await toggle.isVisible().catch(() => false))) {
    return { ok: false, opened: false, error: "Sidebar toggle not visible." };
  }

  await toggle.click({ timeout: 5000 });
  await waitForSidebarInteractive(page);

  const isOpen = await page.locator(".app-shell.sidebar-open").count().then((count) => count > 0).catch(() => false);
  return { ok: isOpen, opened: isOpen };
}

async function scrollSidebarLinkIntoView(page, routePath) {
  return page.evaluate((targetPath) => {
    const link = document.querySelector(`.main-nav a[href="${targetPath}"]`);
    if (!link) return { ok: false, error: "Sidebar link not found." };

    const centerWithin = (container) => {
      if (!container) return;
      const linkRect = link.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      container.scrollTop += linkRect.top - containerRect.top - ((containerRect.height - linkRect.height) / 2);
    };

    centerWithin(document.querySelector(".main-nav"));
    centerWithin(document.querySelector(".side-rail"));
    link.scrollIntoView({ block: "center", inline: "nearest" });

    const rect = link.getBoundingClientRect();
    const viewport = { height: window.innerHeight, width: window.innerWidth };
    return {
      ok: rect.bottom > 0 && rect.top < viewport.height && rect.right > 0 && rect.left < viewport.width,
      rect: {
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top)
      },
      viewport
    };
  }, routePath);
}

async function runSidebarNavigation(page, viewport, events) {
  const eventStart = events.length;
  const result = {
    clicks: [],
    events: [],
    ok: false,
    routeCount: sidebarNavigationRoutes.length,
    viewport: viewport.name
  };

  try {
    await login(page);
    await page.goto(`${baseUrl}/safety-6s`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
    result.sidebarOpen = await ensureSidebarOpen(page);

    for (const routePath of sidebarNavigationRoutes) {
      const sidebarOpen = await ensureSidebarOpen(page);
      const link = page.locator(`.main-nav a[href="${routePath}"]`).first();
      const exists = await link.count().then((count) => count > 0).catch(() => false);
      const beforeUrl = await routeHealth(page).catch(() => null);
      const scroll = exists ? await scrollSidebarLinkIntoView(page, routePath).catch((error) => ({ ok: false, error: asText(error) })) : null;
      let clicked = false;
      let clickError = "";

      if (exists) {
        try {
          await link.click({ timeout: 3000 });
          clicked = true;
          await page.waitForURL((url) => url.pathname === routePath, { timeout: 10000 }).catch(() => {});
          await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
          await waitForSidebarClosed(page);
          await waitForRouteContentReady(page, routePath);
        } catch (error) {
          clickError = asText(error);
        }
      }

      const health = await routeHealth(page).catch((error) => ({ error: asText(error) }));
      const active = await page.locator(`.main-nav a[href="${routePath}"].active`).count().then((count) => count > 0).catch(() => false);
      const ok =
        exists &&
        clicked &&
        health.url === routePath &&
        health.overflowX === 0 &&
        !health.stuckLoading &&
        health.textLength > 300;

      result.clicks.push({
        active,
        beforeUrl: beforeUrl?.url || "",
        clickError,
        clicked,
        exists,
        health,
        ok,
        path: routePath,
        scroll,
        sidebarOpen
      });
    }
  } catch (error) {
    result.error = asText(error);
    result.screenshot = toRelative(path.join(artifactsDir, `safety-sidebar-navigation-${viewport.name}.png`));
    await page.screenshot({ fullPage: true, path: path.join(rootDir, result.screenshot) }).catch(() => {});
  }

  result.events = filteredEvents(events.slice(eventStart));
  result.ok = !result.error && result.events.length === 0 && result.clicks.length === sidebarNavigationRoutes.length && result.clicks.every((click) => click.ok);
  return result;
}

async function performAction(page, action) {
  if (action === "route-load") {
    const health = await routeHealth(page);
    return { action, health, ok: health.overflowX === 0 && !health.stuckLoading && health.textLength > 350 };
  }

  if (action === "checklist-modal") {
    const click = await clickFirst(page, ["[data-testid^=\"dept-tab-\"]:not([disabled])", ".safety-checklist-dept-card.can-open"], action);
    if (!click.ok) return { action, ...click };
    const dialog = await waitForDialog(page, action);
    const close = await closeAnyDialog(page);
    return { action, click, close, dialog, ok: dialog.ok && close.ok };
  }

  if (action === "warning-create") {
    const click = await clickFirst(page, [".safety-warning-add-btn"], action);
    if (!click.ok) return { action, ...click };
    const dialog = await waitForDialog(page, action);
    await page.locator("[role=\"dialog\"] input, [role=\"dialog\"] textarea").first().fill("Audit UI smoke").catch(() => {});
    const close = await closeAnyDialog(page);
    return { action, click, close, dialog, ok: dialog.ok && close.ok };
  }

  if (action === "warning-detail") {
    const click = await clickFirst(page, [".safety-warning-action-icon.view", ".safety-warning-title-button", ".safety-warning-board article button"], action);
    if (!click.ok) return { action, ...click, skipped: true };
    const dialog = await waitForDialog(page, action);
    const close = await closeAnyDialog(page);
    return { action, click, close, dialog, ok: dialog.ok && close.ok };
  }

  if (action === "incident-create") {
    const click = await clickFirst(page, [".safety-incidents-add-btn"], action);
    if (!click.ok) return { action, ...click, skipped: true };
    const dialog = await waitForDialog(page, action);
    const close = await closeAnyDialog(page);
    return { action, click, close, dialog, ok: dialog.ok && close.ok };
  }

  if (action === "incident-detail") {
    const click = await clickFirst(page, [".safety-incidents-card-trigger"], action);
    if (!click.ok) return { action, ...click, skipped: true };
    const dialog = await waitForDialog(page, action);
    const close = await closeAnyDialog(page);
    return { action, click, close, dialog, ok: dialog.ok && close.ok };
  }

  if (action === "entry-create") {
    const click = await clickFirst(page, [".safety-entry-create-btn"], action);
    if (!click.ok) return { action, ...click, skipped: true };
    const dialog = await waitForDialog(page, action);
    await page.locator("#kpi-entry-value").fill("88").catch(() => {});
    const close = await closeAnyDialog(page);
    return { action, click, close, dialog, ok: dialog.ok && close.ok };
  }

  if (action === "approval-tabs") {
    const initialHealth = await routeHealth(page);
    const clicks = [];
    const snapshots = [];
    for (const selector of ["#approval-kpi-tab-pending", "#approval-kpi-tab-approved", "#approval-kpi-tab-rejected", "#approval-kpi-tab-all"]) {
      const tab = page.locator(selector).first();
      if (await tab.count().then((count) => count > 0).catch(() => false)) {
        await tab.scrollIntoViewIfNeeded().catch(() => {});
        await tab.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(150);
        clicks.push(selector);
        snapshots.push({ selector, health: await routeHealth(page) });
      }
    }
    const health = await routeHealth(page);
    const stableSnapshots = [initialHealth, health, ...snapshots.map((snapshot) => snapshot.health)];
    return {
      action,
      clicks,
      health,
      initialHealth,
      ok: clicks.length >= 3 && stableSnapshots.every((item) => hasStableRouteHealth(item, 120)) && stableSnapshots.some((item) => hasStableRouteHealth(item, 500)),
      snapshots
    };
  }

  if (action === "special-program-tabs") {
    const tabs = page.locator("section nav button");
    const count = await tabs.count().catch(() => 0);
    const clicks = [];
    for (let index = 0; index < Math.min(count, 5); index += 1) {
      const tab = tabs.nth(index);
      if (!(await tab.isVisible().catch(() => false))) continue;
      await tab.click();
      await page.waitForTimeout(150);
      clicks.push(index);
    }
    const health = await routeHealth(page);
    return { action, clicks, health, ok: clicks.length >= 3 && health.overflowX === 0 && !health.stuckLoading && health.textLength > 500 };
  }

  if (action === "kpi-filter-tabs") {
    const initialHealth = await routeHealth(page);
    const tabs = page.locator(".safety-kpi-filter-tab");
    const count = await tabs.count().catch(() => 0);
    const clicks = [];
    const snapshots = [];
    for (let index = 0; index < Math.min(count, 5); index += 1) {
      const tab = tabs.nth(index);
      if (!(await tab.isVisible().catch(() => false))) continue;
      await tab.click();
      await page.waitForTimeout(150);
      clicks.push(index);
      snapshots.push({ health: await routeHealth(page), index });
    }
    const health = await routeHealth(page);
    const stableSnapshots = [initialHealth, health, ...snapshots.map((snapshot) => snapshot.health)];
    return {
      action,
      clicks,
      health,
      initialHealth,
      ok: clicks.length >= 2 && stableSnapshots.every((item) => hasStableRouteHealth(item, 120)) && stableSnapshots.some((item) => hasStableRouteHealth(item, 500)),
      snapshots
    };
  }

  if (action === "document-upload") {
    const click = await clickFirst(page, [page.locator("button").filter({ hasText: /^\s*Upload\s*$/i })], action);
    if (!click.ok) return { action, ...click, skipped: true };
    const dialog = await waitForDialog(page, action);
    const close = await closeAnyDialog(page);
    return { action, click, close, dialog, ok: dialog.ok && close.ok };
  }

  if (action === "document-text") {
    const click = await clickFirst(page, [page.locator("button").filter({ hasText: /^\s*Text\s*$/i })], action);
    if (!click.ok) return { action, ...click, skipped: true };
    const dialog = await waitForDialog(page, action);
    const close = await closeAnyDialog(page);
    return { action, click, close, dialog, ok: dialog.ok && close.ok };
  }

  if (action === "reports-tabs") {
    const clicks = [];
    for (const selector of ["#reports-chart-tab-incidents", "#reports-chart-tab-checklist", "#reports-chart-tab-overview"]) {
      if (await page.locator(selector).isVisible().catch(() => false)) {
        await page.locator(selector).click();
        await page.waitForTimeout(250);
        clicks.push(selector);
      }
    }
    return { action, clicks, health: await routeHealth(page), ok: clicks.length === 3 };
  }

  if (action === "report-create") {
    const click = await clickFirst(page, [".safety-reports-create-btn"], action);
    if (!click.ok) return { action, ...click, skipped: true };
    const dialog = await waitForDialog(page, action);
    await page.locator("#safety-report-title").fill("Audit UI smoke").catch(() => {});
    const close = await closeAnyDialog(page);
    return { action, click, close, dialog, ok: dialog.ok && close.ok };
  }

  if (action === "training-requirement") {
    const click = await clickFirst(page, [page.locator("button").filter({ hasText: textPatterns.trainingRequirement })], action);
    if (!click.ok) return { action, ...click, skipped: true };
    const dialog = await waitForDialog(page, action);
    const close = await closeAnyDialog(page);
    return { action, click, close, dialog, ok: dialog.ok && close.ok };
  }

  if (action === "training-record") {
    const click = await clickFirst(page, [page.locator("button").filter({ hasText: textPatterns.trainingRecord })], action);
    if (!click.ok) return { action, ...click, skipped: true };
    const dialog = await waitForDialog(page, action);
    const close = await closeAnyDialog(page);
    return { action, click, close, dialog, ok: dialog.ok && close.ok };
  }

  if (action === "reference-load") {
    const health = await routeHealth(page);
    const hasReferenceContent = await page
      .locator("body")
      .evaluate((body) => /api|endpoint|formula|route|reference|safety/i.test(body.innerText || ""))
      .catch(() => false);
    return {
      action,
      hasReferenceContent,
      health,
      ok: health.overflowX === 0 && !health.stuckLoading && health.textLength > 500 && hasReferenceContent
    };
  }

  if (action === "settings-edit") {
    const desktop = await page.locator("[data-testid=\"button-edit-dept-0\"]").isVisible().catch(() => false);
    const targetSelector = desktop ? "[data-testid=\"button-edit-dept-0\"]" : "[data-testid=\"button-edit-dept-mobile-0\"]";
    const containerSelector = desktop ? "[data-testid=\"row-dept-0\"]" : "[data-testid=\"card-dept-0\"]";
    const click = await clickFirst(page, [targetSelector], action);
    if (!click.ok) return { action, ...click, skipped: true };
    const container = page.locator(containerSelector);
    const inputs = await container.locator("input").count().catch(() => 0);
    const saveVisible = await firstVisible(container.locator("button").filter({ hasText: /^L\u01b0u$/i })) !== null;
    const health = await routeHealth(page);
    return {
      action,
      click,
      containerSelector,
      health,
      inputs,
      ok: inputs >= 3 && saveVisible && health.overflowX === 0 && !health.stuckLoading,
      saveVisible
    };
  }

  return { action, error: "Unknown action.", ok: false };
}

async function run() {
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(artifactsDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const report = {
    artifactReportPath: toRelative(artifactReportPath),
    baseUrl,
    mockApi,
    mode: sidebarOnly ? "sidebar-only" : includeSidebarNavigation ? "full-with-sidebar" : "full",
    ok: true,
    routes: [],
    sidebarNavigation: [],
    startedAt: new Date().toISOString()
  };

  for (const viewport of viewports) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport });
    const page = await context.newPage();
    const events = [];

    page.on("pageerror", (error) => events.push({ message: asText(error), type: "pageerror" }));
    page.on("console", (message) => {
      if (message.type() === "error") events.push({ message: message.text(), type: "console-error" });
    });
    page.on("requestfailed", (request) => {
      events.push({ failure: request.failure()?.errorText, method: request.method(), type: "requestfailed", url: request.url() });
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        events.push({ method: response.request().method(), status: response.status(), type: "response", url: response.url() });
      }
    });

    if (mockApi) await setupMockApi(page);

    const loginUrl = await login(page);

    if (!sidebarOnly) {
      for (const route of routes) {
        let eventStart = events.length;
        const routeResult = { actions: [], events: [], loginUrl, path: route.path, sessionRecovered: false, viewport: viewport.name };

        try {
          routeResult.preRouteAuthUrl = await login(page);
          eventStart = events.length;
          await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded" });
          await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
          if (page.url().includes("/login")) {
            routeResult.sessionRecovered = true;
            await login(page);
            eventStart = events.length;
            await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded" });
            await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
          }
          routeResult.initialHealth = await routeHealth(page);
          routeResult.redirectedToLogin = page.url().includes("/login");

          for (const action of route.actions) {
            routeResult.actions.push(await performAction(page, action));
            await page.waitForTimeout(200);
          }

          routeResult.finalHealth = await routeHealth(page);
        } catch (error) {
          routeResult.error = asText(error);
          routeResult.screenshot = toRelative(path.join(artifactsDir, `safety-interaction-${viewport.name}-${route.path.replace(/[^a-z0-9]+/gi, "-")}.png`));
          await page.screenshot({ fullPage: true, path: path.join(rootDir, routeResult.screenshot) }).catch(() => {});
        }

        routeResult.events = filteredEvents(events.slice(eventStart));
        routeResult.ok =
          !routeResult.error &&
          !routeResult.redirectedToLogin &&
          routeResult.events.length === 0 &&
          routeResult.initialHealth?.overflowX === 0 &&
          routeResult.finalHealth?.overflowX === 0 &&
          routeResult.initialHealth?.url === route.path &&
          routeResult.finalHealth?.url === route.path &&
          !routeResult.initialHealth?.stuckLoading &&
          !routeResult.finalHealth?.stuckLoading &&
          routeResult.actions.every((item) => item.ok);

        report.routes.push(routeResult);
      }
    }

    if (includeSidebarNavigation) {
      report.sidebarNavigation.push(await runSidebarNavigation(page, viewport, events));
    }

    await context.close();
  }

  await browser.close();

  report.finishedAt = new Date().toISOString();
  report.routeFailureCount = report.routes.filter((route) => !route.ok).length;
  report.sidebarFailureCount = report.sidebarNavigation.filter((navigation) => !navigation.ok).length;
  report.failureCount = report.routeFailureCount + report.sidebarFailureCount;
  report.sessionRecoveryCount = report.routes.filter((route) => route.sessionRecovered).length;
  report.ok = report.failureCount === 0;

  const json = `${JSON.stringify(report, null, 2)}\n`;
  fs.writeFileSync(reportPath, json, "utf8");
  fs.writeFileSync(artifactReportPath, json, "utf8");

  console.log(
    JSON.stringify(
      {
        artifactReportPath: report.artifactReportPath,
        failureCount: report.failureCount,
        mockApi: report.mockApi,
        mode: report.mode,
        ok: report.ok,
        reportPath: toRelative(reportPath),
        routeCount: report.routes.length,
        sidebarFailureCount: report.sidebarFailureCount,
        sidebarNavigationCount: report.sidebarNavigation.length,
        sessionRecoveryCount: report.sessionRecoveryCount
      },
      null,
      2
    )
  );

  if (!report.ok) process.exit(1);
}

run().catch((error) => {
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = {
    error: asText(error),
    ok: false,
    requirement: "Set MHCHUB_AUDIT_USERNAME and MHCHUB_AUDIT_PASSWORD, keep MHChub running at MHCHUB_AUDIT_BASE_URL, or use --mock-api for current-source frontend/sidebar smoke.",
    startedAt: new Date().toISOString()
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
});
