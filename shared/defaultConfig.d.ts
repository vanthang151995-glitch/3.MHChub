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

declare const defaultConfig: HubConfig;
export default defaultConfig;
