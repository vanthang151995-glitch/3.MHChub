import type { ButtonHTMLAttributes, ReactNode } from "react";
import { SAFETY_DEPARTMENTS } from "./safety-domain";
import type { SafetyUser } from "./safety-domain";

export type DepartmentInfo = {
  code: string;
  name: string;
  divisionCode: string;
  divisionName: string;
  sortOrder: number;
};

export type DivisionInfo = {
  code: string;
  color: string;
  departments: DepartmentInfo[];
  description: string;
  name: string;
};

export const DIVISIONS: DivisionInfo[] = [
  {
    code: "PED",
    name: "Khối PED",
    description: "PE1 · MP · MT · CM · WM",
    color: "#1565c0",
    departments: ["PE1", "MP", "MT", "CM", "WM"].map((name, index) => ({
      code: name,
      name,
      divisionCode: "PED",
      divisionName: "Khối PED",
      sortOrder: index + 1
    }))
  },
  {
    code: "QAD",
    name: "Khối QAD",
    description: "QA · GA · QC · CS · EHS · OS",
    color: "#9c27b0",
    departments: ["QA", "GA", "QC", "CS", "EHS", "OS"].map((name, index) => ({
      code: name,
      name,
      divisionCode: "QAD",
      divisionName: "Khối QAD",
      sortOrder: index + 1
    }))
  },
  {
    code: "DD",
    name: "Khối DD",
    description: "MR · RF · DB · DP1 · DP2",
    color: "#00a99d",
    departments: ["MR", "RF", "DB", "DP1", "DP2"].map((name, index) => ({
      code: name,
      name,
      divisionCode: "DD",
      divisionName: "Khối DD",
      sortOrder: index + 1
    }))
  },
  {
    code: "SD",
    name: "Khối SD",
    description: "OK1 · OK2 · SP1",
    color: "#22a050",
    departments: ["OK1", "OK2", "SP1"].map((name, index) => ({
      code: name,
      name,
      divisionCode: "SD",
      divisionName: "Khối SD",
      sortOrder: index + 1
    }))
  },
  {
    code: "ED",
    name: "Khối ED",
    description: "EBM · ETR · MS1 · SA · MS2",
    color: "#f4511e",
    departments: ["EBM", "ETR", "MS1", "SA", "MS2"].map((name, index) => ({
      code: name,
      name,
      divisionCode: "ED",
      divisionName: "Khối ED",
      sortOrder: index + 1
    }))
  }
];

export const ALL_DEPARTMENTS: DepartmentInfo[] = DIVISIONS.flatMap((division) => division.departments);
export const DEPARTMENTS = SAFETY_DEPARTMENTS;
export const DEPT_BY_NAME = new Map<string, DepartmentInfo>(ALL_DEPARTMENTS.map((department) => [department.name, department]));

export function getDivisionForDept(deptName?: string): DivisionInfo | undefined {
  const info = DEPT_BY_NAME.get(deptName || "");
  if (!info) return undefined;
  return DIVISIONS.find((division) => division.code === info.divisionCode);
}

export type SampleUser = SafetyUser & {
  department: string;
  departmentCode: string;
  divisionCode: string;
  name: string;
  roleLabel: string;
  token?: string;
};

export function toSampleUser(user: SafetyUser | null): SampleUser | null {
  if (!user) return null;
  const department = user.departmentId || "EHS";
  const division = getDivisionForDept(department);
  const role = user.role === "admin" ? "ehs" : user.role === "leader" ? "quanly" : user.role === "user" ? "nhanvien" : user.role;
  const roleLabel =
    role === "ehs"
      ? "EHS / An Toàn"
      : role === "quanly"
        ? "Quản lý"
        : role === "giamdoc"
          ? "Giám đốc"
          : "Nhân viên";
  return {
    ...user,
    department,
    departmentCode: department,
    divisionCode: division?.code || "",
    name: user.displayName || user.username || "Anh Nguyễn",
    role,
    roleLabel
  };
}

export function canSubmit(role?: string) {
  return role !== "giamdoc" && role !== "viewer";
}

export function canApprove(role?: string) {
  return ["admin", "ehs", "leader", "quanly", "giamdoc"].includes(role || "");
}

export function canSeeAll(role?: string) {
  return ["admin", "ehs", "giamdoc"].includes(role || "");
}

export function authHeaders(_token?: string | null): Record<string, string> {
  return { "Content-Type": "application/json" };
}

export function sampleArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  if (Array.isArray(record.items)) return record.items as T[];
  if (Array.isArray(record.data)) return record.data as T[];
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : {};
  if (Array.isArray(data.items)) return data.items as T[];
  return [];
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  variant?: "default" | "outline" | "ghost";
};

export function Button({ children, className = "", type = "button", variant = "default", ...props }: ButtonProps) {
  const variantClass =
    variant === "outline"
      ? "border border-border bg-card text-foreground hover:bg-muted"
      : variant === "ghost"
        ? "bg-transparent text-foreground hover:bg-muted"
        : "bg-[#1565c0] text-white hover:bg-[#0d47a1]";
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${variantClass} ${className}`}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
