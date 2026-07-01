export const CHECKLIST_RESULT_OPTIONS = [
  { code: "pending", label: "Chưa nhập", shortLabel: "Chờ", symbol: "...", checked: false, excludedFromScore: true },
  { code: "pass", label: "Đạt", shortLabel: "Đạt", symbol: "O", checked: true, excludedFromScore: false },
  { code: "repair", label: "Sửa chữa", shortLabel: "Sửa", symbol: "△", checked: false, excludedFromScore: false },
  { code: "replace", label: "Thay thế", shortLabel: "Thay", symbol: "×", checked: false, excludedFromScore: false },
  { code: "day_off", label: "Ngày nghỉ", shortLabel: "Nghỉ", symbol: "/", checked: false, excludedFromScore: true },
  { code: "not_applicable", label: "Không thực hiện", shortLabel: "KTH", symbol: "-", checked: false, excludedFromScore: true }
];

export const DAILY_DEPARTMENT_CHECKLIST = {
  id: "ehs-qt-12-bieu-1-daily-6s",
  code: "EHS-QT-12",
  form: "Biểu 1",
  title: "Biểu kiểm tra 6S hàng ngày",
  scope: "department_daily",
  establishedDate: "2024-04-26",
  revisedDate: "2026-03-18",
  sourceFile: "tai lieu/Biểu kiểm tra 6S hàng ngày/Bieu kiem tra 6S hang ngay.pdf",
  items: [
    {
      id: 1,
      category: "6S hàng ngày - cấp bộ phận",
      item: "Vật dụng, tài liệu, dụng cụ... được sắp xếp đúng vị trí đã quy định và có hiển thị rõ ràng để nhận biết."
    },
    {
      id: 2,
      category: "6S hàng ngày - cấp bộ phận",
      item: "Các vị trí đã được dán băng dính nền theo đúng tiêu chuẩn băng dính dán nền và không bị bong chóc, không rách..."
    },
    {
      id: 3,
      category: "6S hàng ngày - cấp bộ phận",
      item: "Các khu vực làm việc như nền nhà, lối đi, giá kệ... sạch sẽ và không có bụi bẩn."
    },
    {
      id: 4,
      category: "6S hàng ngày - cấp bộ phận",
      item: "Các khu vực để chất thải, thùng rác, dụng cụ vệ sinh gọn gàng và được phân loại đúng quy định."
    },
    {
      id: 5,
      category: "6S hàng ngày - cấp bộ phận",
      item: "Các mục chỉ ra về 6S khi kiểm tra hàng ngày tại bộ phận được khắc phục nhanh chóng."
    }
  ]
};

const RESULT_CODE_SET = new Set(CHECKLIST_RESULT_OPTIONS.map((option) => option.code));
const EXCLUDED_RESULT_SET = new Set(
  CHECKLIST_RESULT_OPTIONS.filter((option) => option.excludedFromScore).map((option) => option.code)
);

const clone = (value) => JSON.parse(JSON.stringify(value));

export const normalizeChecklistResult = (value, fallback = "pending") => {
  const code = String(value || "").trim();
  return RESULT_CODE_SET.has(code) ? code : fallback;
};

export const isExcludedChecklistResult = (value) => EXCLUDED_RESULT_SET.has(normalizeChecklistResult(value));

export const getSafetyChecklistTemplate = () => ({
  resultOptions: clone(CHECKLIST_RESULT_OPTIONS),
  dailyDepartmentChecklist: clone(DAILY_DEPARTMENT_CHECKLIST)
});
