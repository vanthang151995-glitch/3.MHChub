import defaultConfig from "../shared/defaultConfig.js";

export const { utilityLinks, departments, safetyActions, safetyBulletins } = defaultConfig;

export const categories = [
  { id: "safety", label: { vi: "An toàn", en: "Safety", ja: "安全" } },
  { id: "6s", label: { vi: "6S", en: "6S", ja: "6S" } },
  { id: "training", label: { vi: "Đào tạo", en: "Training", ja: "教育" } },
  { id: "policy", label: { vi: "Quy định", en: "Policy", ja: "規程" } },
  { id: "inspection", label: { vi: "Kiểm tra", en: "Inspection", ja: "点検" } },
  { id: "meeting", label: { vi: "Biên bản họp", en: "Meeting report", ja: "会議記録" } },
  { id: "schedule", label: { vi: "Lịch vệ sinh", en: "Cleaning schedule", ja: "清掃予定" } }
];
