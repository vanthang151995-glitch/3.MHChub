import { currentMonth } from "./safety-api";
import { departmentForUser } from "./safety-domain";
import type { SafetyUser } from "./safety-domain";

export type KpiEntry = {
  id: string;
  code: string;
  entryType: string;
  periodType: string;
  period: string;
  departmentCode: string;
  department?: string;
  value: string;
  target: string | null;
  unit?: string;
  notes?: string | null;
  submittedByDept?: string;
  submittedById?: string;
  submittedByName?: string;
  rejectionReason?: string | null;
  rejectedByLevel?: string | null;
  l1ApprovedById?: string | null;
  l1ApprovedByName?: string | null;
  l1ApprovedAt?: string | null;
  l2ApprovedById?: string | null;
  l2ApprovedByName?: string | null;
  l2ApprovedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  approvalStatus: string;
};

export type KpiFormState = {
  entryType: string;
  period: string;
  departmentCode: string;
  value: string;
  target: string;
  notes: string;
};

export const DIVISION_BY_DEPARTMENT: Record<string, string> = {
  PE1: "PED",
  MP: "PED",
  MT: "PED",
  CM: "PED",
  WM: "PED",
  QA: "QAD",
  GA: "QAD",
  QC: "QAD",
  CS: "QAD",
  EHS: "QAD",
  OS: "QAD",
  MR: "DD",
  RF: "DD",
  DB: "DD",
  DP1: "DD",
  DP2: "DD",
  OK1: "SD",
  OK2: "SD",
  SP1: "SD",
  EBM: "ED",
  ETR: "ED",
  MS1: "ED",
  SA: "ED",
  MS2: "ED"
};

export const KPI_ENTRY_TYPES = [
  {
    value: "safety_score_monthly",
    label: "Điểm an toàn",
    unit: "điểm",
    periodType: "month",
    defaultTarget: "90",
    description: "Điểm ATVSLĐ tháng"
  },
  {
    value: "no_accident_days",
    label: "Ngày không tai nạn",
    unit: "ngày",
    periodType: "day",
    defaultTarget: "",
    description: "Số ngày tích lũy không tai nạn"
  },
  {
    value: "checklist_daily",
    label: "Checklist 6S",
    unit: "%",
    periodType: "day",
    defaultTarget: "80",
    description: "Tỷ lệ hoàn thành checklist"
  },
  {
    value: "training_monthly",
    label: "Tỷ lệ đào tạo",
    unit: "%",
    periodType: "month",
    defaultTarget: "100",
    description: "Hoàn thành đào tạo an toàn"
  },
  {
    value: "violation_warning",
    label: "Vi phạm / Cảnh báo",
    unit: "lần",
    periodType: "day",
    defaultTarget: "0",
    description: "Số vi phạm/cảnh báo ghi nhận"
  }
];

export const SAFETY_SCORE_TARGET = 95;

const DEPARTMENT_DISPLAY_CODES: Record<string, string> = {
  company: "ALL",
  ehs: "EHS",
  engineering: "MR",
  office: "ADM",
  production: "PE1",
  quality: "QA",
  warehouse: "WH"
};

export function canReview(user: SafetyUser | null) {
  return ["admin", "ehs", "leader"].includes(user?.role || "");
}

export function canAdminSafety(user: SafetyUser | null) {
  return ["admin", "ehs"].includes(user?.role || "");
}

export const approvedKpi = (item: KpiEntry) => item.approvalStatus === "approved" || item.approvalStatus === "APPROVED";

export const displayDeptCode = (department = "") => {
  const normalized = department.trim().toLowerCase();
  return DEPARTMENT_DISPLAY_CODES[normalized] || department.trim().toUpperCase() || "EHS";
};

export const kpiTypeFor = (entryType?: string) => KPI_ENTRY_TYPES.find((item) => item.value === entryType) || KPI_ENTRY_TYPES[0];

export const kpiMetTarget = (entry: KpiEntry) => {
  const value = Number(entry.value);
  const target = entry.target === null || entry.target === undefined || entry.target === "" ? null : Number(entry.target);
  if (!Number.isFinite(value) || target === null || !Number.isFinite(target)) return null;
  return entry.entryType === "violation_warning" ? value <= target : value >= target;
};

export function defaultKpiForm(user: SafetyUser | null): KpiFormState {
  const entryType = KPI_ENTRY_TYPES[0];
  return {
    entryType: entryType.value,
    period: currentMonth(),
    departmentCode: departmentForUser(user),
    value: "",
    target: entryType.defaultTarget,
    notes: ""
  };
}
