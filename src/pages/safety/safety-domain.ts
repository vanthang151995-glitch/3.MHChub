export type SafetyUser = {
  id?: string;
  username?: string;
  displayName?: string;
  role?: string;
  departmentId?: string;
};

export type Report = {
  id: string;
  code: string;
  title: string;
  type: string;
  period: string;
  department: string;
  creator?: string;
  status: string;
  notes?: string;
  createdByName?: string;
  createdAt?: string;
};

export type TrainingCourse = {
  id: string;
  code: string;
  name: string;
  category: string;
  trainer: string;
  duration?: string;
  department: string;
  enrolled: number;
  completed: number;
  dueDate?: string;
  status: string;
  notes?: string;
};

export const SAFETY_DEPARTMENTS = [
  "PE1",
  "MP",
  "MT",
  "CM",
  "WM",
  "QA",
  "GA",
  "QC",
  "CS",
  "EHS",
  "OS",
  "MR",
  "RF",
  "DB",
  "DP1",
  "DP2",
  "OK1",
  "OK2",
  "SP1",
  "EBM",
  "ETR",
  "MS1",
  "SA",
  "MS2"
];

export const REPORT_TYPES = ["Tuần", "Tháng", "Quý", "Năm", "Đột xuất"];
export const REPORT_STATUSES = ["Nháp", "Đang lập", "Đã phát hành", "Đã lưu trữ"];
export const TRAINING_STATUSES = ["Chưa bắt đầu", "Đang diễn ra", "DONE", "OVERDUE"];

export const departmentForUser = (user: SafetyUser | null) => user?.departmentId || SAFETY_DEPARTMENTS[0];
export const displayUserName = (user: SafetyUser | null) => user?.displayName || user?.username || "";
