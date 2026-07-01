import defaultConfig from "../../shared/defaultConfig.js";

export type LocalizedString = {
  en?: string;
  ja?: string;
  vi?: string;
  [lang: string]: string | undefined;
};

export type LocalizedStringList = {
  en?: string[];
  ja?: string[];
  vi?: string[];
  [lang: string]: string[] | undefined;
};

export type UtilityLink = {
  description: LocalizedString;
  health: string;
  id: string;
  title: LocalizedString;
  type: string;
  url: string;
};

export type HubDepartment = {
  checklist?: LocalizedStringList;
  id: string;
  name: LocalizedString;
  openActions: number | string;
  owner: string;
  riskLevel: string;
  risks?: LocalizedStringList;
  score: number | string;
  trainingRate: number | string;
};

export type SafetyAction = {
  departmentId: string;
  due: string;
  id: string;
  severity: string;
  title: LocalizedString;
  [key: string]: unknown;
};

export type SafetyBulletin = {
  audience?: LocalizedString;
  createdAt?: string;
  createdBy?: string;
  createdByName?: string;
  createdByRole?: string;
  date: string;
  documentId?: string;
  documentUrl?: string;
  id: string;
  points?: LocalizedStringList;
  published?: boolean;
  summary?: LocalizedString;
  title: LocalizedString;
  tone: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string;
  updatedByRole?: string;
  [key: string]: unknown;
};

export type HubConfig = {
  departments: HubDepartment[];
  safetyActions: SafetyAction[];
  safetyBulletins: SafetyBulletin[];
  utilityLinks: UtilityLink[];
};

export type HubModel = HubConfig & {
  actionCount: number;
  averageScore: number;
  bulletinCount: number;
  checklistOpenCount?: number;
  departmentActionCount: number;
  pendingKpiCount?: number;
  publishedBulletins: SafetyBulletin[];
  trainingAverage: number;
  watchCount: number;
};

const typedDefaultConfig = defaultConfig as HubConfig;

export const normalizeHubConfig = (config: Partial<HubConfig> = typedDefaultConfig): HubConfig => ({
  utilityLinks: Array.isArray(config.utilityLinks) ? config.utilityLinks : typedDefaultConfig.utilityLinks,
  departments: Array.isArray(config.departments) ? config.departments : typedDefaultConfig.departments,
  safetyActions: Array.isArray(config.safetyActions) ? config.safetyActions : typedDefaultConfig.safetyActions,
  safetyBulletins: Array.isArray(config.safetyBulletins)
    ? config.safetyBulletins.map((item): SafetyBulletin => ({
        ...item,
        createdBy: item.createdBy || "",
        createdByName: item.createdByName || "",
        createdByRole: item.createdByRole || "",
        createdAt: item.createdAt || "",
        updatedBy: item.updatedBy || "",
        updatedByName: item.updatedByName || "",
        updatedByRole: item.updatedByRole || "",
        updatedAt: item.updatedAt || ""
      }))
    : typedDefaultConfig.safetyBulletins || []
});

export const buildHubModel = (config?: Partial<HubConfig>): HubModel => {
  const normalized = normalizeHubConfig(config);
  const departments = normalized.departments;
  const averageScore = departments.length
    ? Math.round(departments.reduce((sum, item) => sum + Number(item.score || 0), 0) / departments.length)
    : 0;
  const trainingAverage = departments.length
    ? Math.round(departments.reduce((sum, item) => sum + Number(item.trainingRate || 0), 0) / departments.length)
    : 0;

  return {
    ...normalized,
    averageScore,
    trainingAverage,
    actionCount: normalized.safetyActions.length,
    bulletinCount: normalized.safetyBulletins.length,
    publishedBulletins: normalized.safetyBulletins
      .filter((item) => item.published !== false)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))),
    departmentActionCount: departments.reduce((sum, item) => sum + Number(item.openActions || 0), 0),
    watchCount: departments.filter((item) => item.riskLevel !== "good").length
  };
};

export const paginateItems = <T,>(items: T[], page = 1, pageSize = 10) => {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.max(1, Math.min(totalPages, page));
  const start = (currentPage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    pagination: { page: currentPage, pageSize, totalItems, totalPages }
  };
};

export const textToList = (value: unknown) =>
  String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

export const listToText = (value: unknown) => (Array.isArray(value) ? value.join("\n") : "");

export const createLink = (): UtilityLink => ({
  id: `link-${Date.now()}`,
  type: "gateway",
  title: { vi: "Link mới", en: "New link", ja: "新規リンク" },
  description: { vi: "Mô tả link", en: "Link description", ja: "リンク説明" },
  url: "",
  health: "good"
});

export const createDepartment = (): HubDepartment => ({
  id: `department-${Date.now()}`,
  name: { vi: "Bộ phận mới", en: "New department", ja: "新規部門" },
  owner: "",
  score: 80,
  riskLevel: "good",
  openActions: 0,
  trainingRate: 90,
  risks: { vi: [], en: [], ja: [] },
  checklist: { vi: [], en: [], ja: [] }
});

export const createAction = (departmentId = "production"): SafetyAction => ({
  id: `action-${Date.now()}`,
  departmentId,
  severity: "medium",
  due: new Date().toISOString().slice(0, 10),
  title: { vi: "Hành động mới", en: "New action", ja: "新規アクション" }
});

export const createBulletin = (): SafetyBulletin => ({
  id: `bulletin-${Date.now()}`,
  date: new Date().toISOString().slice(0, 10),
  tone: "watch",
  title: { vi: "Bảng tin an toàn mới", en: "New safety bulletin", ja: "新しい安全掲示" },
  summary: { vi: "", en: "", ja: "" },
  points: { vi: [], en: [], ja: [] },
  audience: { vi: "Tất cả bộ phận", en: "All departments", ja: "全部門" },
  documentId: "",
  documentUrl: "",
  published: true,
  createdBy: "",
  createdByName: "",
  createdByRole: "",
  createdAt: "",
  updatedBy: "",
  updatedByName: "",
  updatedByRole: "",
  updatedAt: ""
});
