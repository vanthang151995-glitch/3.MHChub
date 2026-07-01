export const pointGroupOrder = ["health", "incident", "action", "system", "environment", "governance", "other"] as const;

export type BulletinPointGroup = (typeof pointGroupOrder)[number];
export type BulletinPointTone = "critical" | "warning" | "good" | "info";
export type BulletinPointView = {
  body: string;
  group: BulletinPointGroup;
  label: string;
  number: string;
  tone: BulletinPointTone;
};
export type BulletinPointLabels = {
  sectionLabels?: Partial<Record<BulletinPointGroup, string>>;
};

export const normalizeBulletinSearchText = (value: unknown): string =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export const splitBulletinPoint = (point: unknown): Pick<BulletinPointView, "body" | "label"> => {
  const value = String(point || "").trim();
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex > 48) {
    return { body: value, label: "" };
  }

  return {
    body: value.slice(separatorIndex + 1).trim(),
    label: value.slice(0, separatorIndex).trim()
  };
};

export const getBulletinPointTone = (label: string, body: string): BulletinPointTone => {
  const text = normalizeBulletinSearchText(`${label} ${body}`);
  if (/(tnld|can nguy|pccc|rui ro|bat buoc|khac phuc|nguy co|chi dao|yeu cau|tbm|phong ngua|phong ngua tai dien|canh bao an toan|gioi han pham vi|thieu canh bao|set danh|chay no|vuot chuan|luu y|phai pho bien)/.test(text)) {
    return "critical";
  }
  if (/(6s|cai tien|tu dien|kiem tra|kiem dinh|loto|medline|quy trinh|hoa chat|moi truong|nuoc thai|bon rua mat|nuoc ro|san chiet|sds|ykao)/.test(text)) {
    return "warning";
  }
  if (/(dao tao|van ban|suc khoe|y te|giao thong)/.test(text)) return "good";
  return "info";
};

export const getBulletinPointGroup = (label: string, body: string): BulletinPointGroup => {
  const text = normalizeBulletinSearchText(`${label} ${body}`);
  if (/(y te|suc khoe|benh nghe nghiep|kham bo sung|bao cao y te)/.test(text)) return "health";
  if (/(tnld|tai nan|can nguy|mani|myl|kim dam|kep tay|namashi)/.test(text)) return "incident";
  if (/(chi dao|yeu cau|bat buoc|pho bien|lich hop|tbm|cong viec khong thuong xuyen|theo doi an toan)/.test(text)) {
    return "action";
  }
  if (/(6s|pccc|risk|rui ro|ppe|tu dien|quy trinh ehs|van ban ehs|cai tien an toan)/.test(text)) return "system";
  if (/(hoa chat|moi truong|nuoc thai|tss|bon rua mat|os-qt|sds|quan trac|medline)/.test(text)) return "environment";
  if (/(tieu ban|set danh|mong tay|day deo the|giao thong|phuong tien|bao cao at-pccc)/.test(text)) return "governance";
  return "other";
};

export const buildBulletinPointView = (point: unknown, index: number): BulletinPointView => {
  const item = splitBulletinPoint(point);
  return {
    ...item,
    number: String(index + 1).padStart(2, "0"),
    group: getBulletinPointGroup(item.label, item.body),
    tone: getBulletinPointTone(item.label, item.body)
  };
};

export const groupBulletinPointViews = (items: BulletinPointView[], labels: BulletinPointLabels) =>
  pointGroupOrder
    .map((key) => ({
      key,
      label: labels.sectionLabels?.[key] || key,
      items: items.filter((item) => item.group === key)
    }))
    .filter((group) => group.items.length);

export const truncateBulletinText = (value: unknown, maxLength = 140): string => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
};
