import crypto from "crypto";
import fs from "fs";
import path from "path";

const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const codeStamp = () => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
};
const generateCode = (prefix) => `${prefix}-${codeStamp()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
const nowIso = () => new Date().toISOString();
const toDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const direct = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};
const text = (value, fallback = "") => {
  const safe = String(value ?? "").trim();
  return safe || fallback;
};
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
  code, divisionCode,
  headcount: 20 + (index % 6) * 3,
  managerName: `${code} Leader`,
  name,
  safetyTarget: code === "EHS" ? 96 : 90
}));

// EHS-QT-11 Biểu 2 — Khối gián tiếp (văn phòng/hành chính): 25 mục, tối đa 100 điểm
const TEMPLATE_BIEU2 = {
  id: "ehs-qt-11-bieu-2",
  code: "EHS-QT-11-B2",
  name: "Phiếu chấm điểm 6S — Khối gián tiếp",
  description: "EHS-QT-11 Biểu 2 — Áp dụng cho khối văn phòng, hành chính, kỹ thuật và các bộ phận gián tiếp. 25 hạng mục, tổng 100 điểm (0–4/mục).",
  ownerRole: "ehs",
  scopeLevel: "department",
  templateType: "6s-audit",
  applicableTo: "indirect",
  version: "2.0",
  status: "active",
  questions: [
    // Seiri / Sàng lọc (20 điểm)
    { id: "b2-s1-1", category: "Seiri", pillar: "Sàng lọc", text: "Tủ khóa", hint: "Không để vật dụng không cần thiết; dụng cụ cần thiết thì hiển thị rõ vị trí.", maxScore: 4, sortOrder: 1, active: true },
    { id: "b2-s1-2", category: "Seiri", pillar: "Sàng lọc", text: "Giá để tài liệu", hint: "Hồ sơ phân loại rõ ràng, không lưu lẫn tài liệu thừa/nháp. Không để hồ sơ tràn ra ngoài giá.", maxScore: 4, sortOrder: 2, active: true },
    { id: "b2-s1-3", category: "Seiri", pillar: "Sàng lọc", text: "Bảng tin", hint: "Chỉ giữ thông tin cần thiết và còn hiệu lực; đặt đúng vị trí quy định.", maxScore: 4, sortOrder: 3, active: true },
    { id: "b2-s1-4", category: "Seiri", pillar: "Sàng lọc", text: "Xung quanh vị trí làm việc", hint: "Không có vật dụng dư thừa; thực hiện đúng tiêu chuẩn 3S đã quy định.", maxScore: 4, sortOrder: 4, active: true },
    { id: "b2-s1-5", category: "Seiri", pillar: "Sàng lọc", text: "Giá, kệ và vật dụng lưu kho", hint: "Tất cả đồ vật lưu kho đều được phân loại, có nhãn hiển thị.", maxScore: 4, sortOrder: 5, active: true },
    // Seiton / Sắp xếp (20 điểm)
    { id: "b2-s2-1", category: "Seiton", pillar: "Sắp xếp", text: "Thiết bị, công cụ, dụng cụ", hint: "Sắp xếp đúng vị trí đã quy định và có hiển thị rõ để nhận biết.", maxScore: 4, sortOrder: 6, active: true },
    { id: "b2-s2-2", category: "Seiton", pillar: "Sắp xếp", text: "File tài liệu", hint: "Sắp xếp đúng quy định, dễ nhận biết. Người phụ trách có thể tìm thấy tài liệu nhanh chóng.", maxScore: 4, sortOrder: 7, active: true },
    { id: "b2-s2-3", category: "Seiton", pillar: "Sắp xếp", text: "Lối đi, khu vực làm việc", hint: "Phân biệt theo màu sắc trực quan; đúng theo tiêu chuẩn đã quy định.", maxScore: 4, sortOrder: 8, active: true },
    { id: "b2-s2-4", category: "Seiton", pillar: "Sắp xếp", text: "Bàn làm việc", hint: "Sắp xếp gọn gàng, đồ vật để đúng vị trí đã quy định.", maxScore: 4, sortOrder: 9, active: true },
    { id: "b2-s2-5", category: "Seiton", pillar: "Sắp xếp", text: "Đường dây điện, ổ cắm, phích cắm", hint: "Được lắp đặt gọn gàng, an toàn, tiện lợi.", maxScore: 4, sortOrder: 10, active: true },
    // Seiso / Sạch sẽ (16 điểm)
    { id: "b2-s3-1", category: "Seiso", pillar: "Sạch sẽ", text: "Sàn nhà, lối đi, dụng cụ…", hint: "Luôn sạch sẽ, không có bụi bẩn.", maxScore: 4, sortOrder: 11, active: true },
    { id: "b2-s3-2", category: "Seiso", pillar: "Sạch sẽ", text: "Cửa sổ và các giá, kệ", hint: "Không có bụi bẩn, mạng nhện…", maxScore: 4, sortOrder: 12, active: true },
    { id: "b2-s3-3", category: "Seiso", pillar: "Sạch sẽ", text: "Nhà vệ sinh", hint: "Luôn sạch sẽ, không tắc, không mùi hôi; thiết bị/dụng cụ đảm bảo tiêu chuẩn 3S.", maxScore: 4, sortOrder: 13, active: true },
    { id: "b2-s3-4", category: "Seiso", pillar: "Sạch sẽ", text: "Dụng cụ vệ sinh", hint: "Được trang bị đầy đủ, có vị trí đặt gọn gàng, sạch sẽ.", maxScore: 4, sortOrder: 14, active: true },
    // Seiketsu / Săn sóc (16 điểm)
    { id: "b2-s4-1", category: "Seiketsu", pillar: "Săn sóc", text: "Tiêu chuẩn 3S (Sàng lọc, Sắp xếp, Sạch sẽ)", hint: "Có tiêu chuẩn 3S phù hợp thực tế, cập nhật khi có thay đổi.", maxScore: 4, sortOrder: 15, active: true },
    { id: "b2-s4-2", category: "Seiketsu", pillar: "Săn sóc", text: "Bảng hình dẫn nền", hint: "Bảng và thực hiện đúng tiêu chuẩn đề ra (không rách, đúng màu quy định).", maxScore: 4, sortOrder: 16, active: true },
    { id: "b2-s4-3", category: "Seiketsu", pillar: "Săn sóc", text: "Trách nhiệm vệ sinh", hint: "Có phân công vệ sinh định kỳ, quy định rõ trách nhiệm và kiểm tra sau vệ sinh.", maxScore: 4, sortOrder: 17, active: true },
    { id: "b2-s4-4", category: "Seiketsu", pillar: "Săn sóc", text: "Khắc phục 6S", hint: "Hoàn thành khắc phục những vấn đề đã chỉ ra đúng tiến độ đề ra.", maxScore: 4, sortOrder: 18, active: true },
    // Shitsuke / Sản sàng (20 điểm)
    { id: "b2-s5-1", category: "Shitsuke", pillar: "Sản sàng", text: "Hoạt động 6S", hint: "Quản lý đi đầu triển khai, giám sát và cải tiến 6S; các hoạt động kịp thời, hiệu quả.", maxScore: 4, sortOrder: 19, active: true },
    { id: "b2-s5-2", category: "Shitsuke", pillar: "Sản sàng", text: "Đào tạo 6S", hint: "Người lao động được đào tạo, cập nhật quy định và tiêu chuẩn 6S tại bộ phận.", maxScore: 4, sortOrder: 20, active: true },
    { id: "b2-s5-3", category: "Shitsuke", pillar: "Sản sàng", text: "Kiểm tra 6S", hint: "Nhóm kiểm tra 6S hoạt động thường xuyên, có ghi nhận kết quả sau kiểm tra.", maxScore: 4, sortOrder: 21, active: true },
    { id: "b2-s5-4", category: "Shitsuke", pillar: "Sản sàng", text: "Các quy trình, tiêu chuẩn 3S", hint: "Tất cả quy trình, tiêu chuẩn 3S đều được triển khai và tuân thủ.", maxScore: 4, sortOrder: 22, active: true },
    { id: "b2-s5-5", category: "Shitsuke", pillar: "Sản sàng", text: "Kết quả 6S", hint: "Tích cực khắc phục khuyến nghị 6S; không tiếp diễn lỗi đã từng nhắc nhở.", maxScore: 4, sortOrder: 23, active: true },
    // Shitsukoi / Siêng năng (8 điểm)
    { id: "b2-s6-1", category: "Shitsukoi", pillar: "Siêng năng", text: "Cải tiến 6S", hint: "Mục tiêu cải tiến 6S thiết lập rõ ràng, cụ thể; chủ động cải tiến khu vực làm việc.", maxScore: 4, sortOrder: 24, active: true },
    { id: "b2-s6-2", category: "Shitsukoi", pillar: "Siêng năng", text: "Nâng cao ý thức thực hiện 6S", hint: "Cán bộ, công nhân viên nhận thức tốt về 6S (phỏng vấn xác suất và trả lời được câu hỏi đề ra).", maxScore: 4, sortOrder: 25, active: true }
  ],
  createdAt: "2024-04-26T00:00:00.000Z",
  updatedAt: "2026-06-23T00:00:00.000Z"
};

// EHS-QT-11 Biểu 1 — Khối sản xuất/trực tiếp: 25 mục, tối đa 100 điểm
const TEMPLATE_BIEU1 = {
  id: "ehs-qt-11-bieu-1",
  code: "EHS-QT-11-B1",
  name: "Phiếu chấm điểm 6S — Khối sản xuất",
  description: "EHS-QT-11 Biểu 1 — Áp dụng cho khối sản xuất, xưởng và các bộ phận trực tiếp. 25 hạng mục, tổng 100 điểm (0–4/mục).",
  ownerRole: "ehs",
  scopeLevel: "department",
  templateType: "6s-audit",
  applicableTo: "direct",
  version: "2.0",
  status: "active",
  questions: [
    // Seiri / Sàng lọc (20 điểm)
    { id: "b1-s1-1", category: "Seiri", pillar: "Sàng lọc", text: "Máy móc & thiết bị", hint: "Chỉ có vật tư, dụng cụ cần thiết cho ca làm việc tại máy/trạm; loại bỏ đồ không cần thiết.", maxScore: 4, sortOrder: 1, active: true },
    { id: "b1-s1-2", category: "Seiri", pillar: "Sàng lọc", text: "Bán thành phẩm, vật tư", hint: "Hàng WIP, hàng NG và phế liệu phân khu rõ ràng, có nhãn nhận diện.", maxScore: 4, sortOrder: 2, active: true },
    { id: "b1-s1-3", category: "Seiri", pillar: "Sàng lọc", text: "Dụng cụ, gá lắp", hint: "Chỉ giữ dụng cụ cần thiết; dụng cụ hỏng/lỗi được tách biệt chờ xử lý.", maxScore: 4, sortOrder: 3, active: true },
    { id: "b1-s1-4", category: "Seiri", pillar: "Sàng lọc", text: "Khu vực lưu trữ", hint: "Nguyên liệu đầu vào/ra có vị trí cố định, lượng tồn theo tiêu chuẩn (min-max).", maxScore: 4, sortOrder: 4, active: true },
    { id: "b1-s1-5", category: "Seiri", pillar: "Sàng lọc", text: "Bàn thao tác & giá", hint: "Không có vật tư thừa; đồ dùng cá nhân đặt đúng nơi quy định.", maxScore: 4, sortOrder: 5, active: true },
    // Seiton / Sắp xếp (20 điểm)
    { id: "b1-s2-1", category: "Seiton", pillar: "Sắp xếp", text: "Thiết bị, công cụ, dụng cụ", hint: "Sắp xếp đúng vị trí đã vạch kẻ, có hình ảnh chuẩn nhận biết.", maxScore: 4, sortOrder: 6, active: true },
    { id: "b1-s2-2", category: "Seiton", pillar: "Sắp xếp", text: "Gá lắp & khuôn mẫu", hint: "Lưu trữ đúng vị trí, có tên/mã và dễ lấy ra sử dụng.", maxScore: 4, sortOrder: 7, active: true },
    { id: "b1-s2-3", category: "Seiton", pillar: "Sắp xếp", text: "Lối đi & luồng sản xuất", hint: "Lối đi kẻ vạch rõ, không có vật cản; luồng di chuyển đúng quy định.", maxScore: 4, sortOrder: 8, active: true },
    { id: "b1-s2-4", category: "Seiton", pillar: "Sắp xếp", text: "Bố trí trạm làm việc", hint: "Sắp xếp theo nguyên tắc tầm với, ergonomics và thứ tự thao tác.", maxScore: 4, sortOrder: 9, active: true },
    { id: "b1-s2-5", category: "Seiton", pillar: "Sắp xếp", text: "Hệ thống điện, khí nén", hint: "Ống dây gọn gàng, lắp đặt an toàn, không gây vướng hoặc nguy hiểm.", maxScore: 4, sortOrder: 10, active: true },
    // Seiso / Sạch sẽ (16 điểm)
    { id: "b1-s3-1", category: "Seiso", pillar: "Sạch sẽ", text: "Máy móc & thiết bị", hint: "Máy sạch sẽ; không có vụn phoi, dầu tràn hoặc bụi bẩn bám dính.", maxScore: 4, sortOrder: 11, active: true },
    { id: "b1-s3-2", category: "Seiso", pillar: "Sạch sẽ", text: "Sàn khu vực sản xuất", hint: "Sạch sẽ; không có dầu mỡ, nước, phoi hoặc vật nguy hiểm trên sàn.", maxScore: 4, sortOrder: 12, active: true },
    { id: "b1-s3-3", category: "Seiso", pillar: "Sạch sẽ", text: "Nguồn sinh bẩn", hint: "Nguồn phát sinh dầu/phoi/bụi được nhận diện và có biện pháp kiểm soát (khay hứng, lịch vệ sinh).", maxScore: 4, sortOrder: 13, active: true },
    { id: "b1-s3-4", category: "Seiso", pillar: "Sạch sẽ", text: "Dụng cụ vệ sinh", hint: "Có đủ dụng cụ, bảo quản đúng nơi, dễ lấy và luôn sạch.", maxScore: 4, sortOrder: 14, active: true },
    // Seiketsu / Săn sóc (16 điểm)
    { id: "b1-s4-1", category: "Seiketsu", pillar: "Săn sóc", text: "Tiêu chuẩn 3S khu vực", hint: "Có tiêu chuẩn hình ảnh 3S dán tại khu vực, còn hiệu lực và đúng thực tế.", maxScore: 4, sortOrder: 15, active: true },
    { id: "b1-s4-2", category: "Seiketsu", pillar: "Săn sóc", text: "Bảng quản lý trực quan", hint: "Bảng sản lượng, chất lượng, 6S được cập nhật đúng kỳ và đúng quy định.", maxScore: 4, sortOrder: 16, active: true },
    { id: "b1-s4-3", category: "Seiketsu", pillar: "Săn sóc", text: "Phân công vệ sinh & trách nhiệm", hint: "Có bảng phân công, lịch vệ sinh và xác nhận sau khi hoàn thành.", maxScore: 4, sortOrder: 17, active: true },
    { id: "b1-s4-4", category: "Seiketsu", pillar: "Săn sóc", text: "Theo dõi & đóng lỗi 6S", hint: "Các điểm lỗi đã ghi nhận và khắc phục đúng tiến độ.", maxScore: 4, sortOrder: 18, active: true },
    // Shitsuke / Sản sàng (20 điểm)
    { id: "b1-s5-1", category: "Shitsuke", pillar: "Sản sàng", text: "Cam kết quản lý", hint: "Quản lý trực tiếp dẫn đầu thực hiện và duy trì 6S tại khu vực.", maxScore: 4, sortOrder: 19, active: true },
    { id: "b1-s5-2", category: "Shitsuke", pillar: "Sản sàng", text: "Đào tạo & nhận thức", hint: "Công nhân được đào tạo 6S và hiểu tiêu chuẩn tại trạm làm việc.", maxScore: 4, sortOrder: 20, active: true },
    { id: "b1-s5-3", category: "Shitsuke", pillar: "Sản sàng", text: "Tuân thủ an toàn", hint: "Không có hành vi bỏ PPE, làm sai thao tác hoặc vi phạm quy định ATVSLĐ.", maxScore: 4, sortOrder: 21, active: true },
    { id: "b1-s5-4", category: "Shitsuke", pillar: "Sản sàng", text: "Kết quả audit & follow-up", hint: "Các điểm từ audit trước đã theo dõi và đóng đúng hạn.", maxScore: 4, sortOrder: 22, active: true },
    { id: "b1-s5-5", category: "Shitsuke", pillar: "Sản sàng", text: "Quy trình & tiêu chuẩn thao tác", hint: "SOP/WI dán đúng vị trí; người vận hành hiểu và thực hiện đúng.", maxScore: 4, sortOrder: 23, active: true },
    // Shitsukoi / Siêng năng (8 điểm)
    { id: "b1-s6-1", category: "Shitsukoi", pillar: "Siêng năng", text: "Cải tiến 6S", hint: "Có ít nhất 1 cải tiến 6S được đề xuất và thực hiện trong kỳ.", maxScore: 4, sortOrder: 24, active: true },
    { id: "b1-s6-2", category: "Shitsukoi", pillar: "Siêng năng", text: "Nâng cao ý thức", hint: "Công nhân chủ động duy trì 6S; trả lời được câu hỏi kiểm tra về 6S.", maxScore: 4, sortOrder: 25, active: true }
  ],
  createdAt: "2024-04-26T00:00:00.000Z",
  updatedAt: "2026-06-23T00:00:00.000Z"
};

const DEFAULT_AUDIT_TEMPLATE = TEMPLATE_BIEU2;

const DEFAULT_TRAINING_REQUIREMENTS = [
  { id: newId("treq"), code: "TR-6S-FOUNDATION", name: "Nhận thức 6S và ATVSLĐ cơ bản", category: "6S", scopeLevel: "company", departmentCode: null, targetGroup: "Toàn bộ nhân viên", intervalMonths: 12, status: "active", createdAt: "2024-04-26T00:00:00.000Z", updatedAt: "2024-04-26T00:00:00.000Z" },
  { id: newId("treq"), code: "TR-PCCC", name: "PCCC và quy định sử dụng điện", category: "PCCC", scopeLevel: "company", departmentCode: null, targetGroup: "Toàn bộ nhân viên", intervalMonths: 12, status: "active", createdAt: "2024-04-26T00:00:00.000Z", updatedAt: "2024-04-26T00:00:00.000Z" },
  { id: newId("treq"), code: "TR-FIRST-AID", name: "Sơ cứu và sử dụng túi sơ cứu", category: "Y tế", scopeLevel: "company", departmentCode: null, targetGroup: "Tổ sơ cứu/bộ phận", intervalMonths: 12, status: "active", createdAt: "2024-04-26T00:00:00.000Z", updatedAt: "2024-04-26T00:00:00.000Z" },
  { id: newId("treq"), code: "TR-KYT", name: "KYT nhận diện nguy cơ trước thao tác", category: "KYT", scopeLevel: "department", departmentCode: null, targetGroup: "Leader/Auditor", intervalMonths: 6, status: "active", createdAt: "2024-04-26T00:00:00.000Z", updatedAt: "2024-04-26T00:00:00.000Z" },
  { id: newId("treq"), code: "TR-SELF-INSPECTION", name: "Tự kiểm tra ATVSLĐ theo EHS-QT-06", category: "Tự kiểm tra", scopeLevel: "department", departmentCode: null, targetGroup: "Leader/EHS", intervalMonths: 12, status: "active", createdAt: "2024-04-26T00:00:00.000Z", updatedAt: "2024-04-26T00:00:00.000Z" }
];

const DOCUMENT_ARCHITECTURE_LEVELS = [
  { id: "company", title: "Cấp công ty", icon: "Factory", focus: "Điều hành mục tiêu, quy định, báo cáo và các hoạt động chung toàn nhà máy.", responsibilities: ["Ban hành nội quy, tiêu chuẩn, biên bản họp an toàn và tài liệu hiệu lực.", "Theo dõi 6S, PCCC, y tế, KYT, CAPA, đào tạo và mạng lưới ATV theo tháng/quý/năm.", "Nhìn được PY/PY2, division, bộ phận, tỷ lệ hoàn thành và điểm quá hạn."] },
  { id: "ehs", title: "Cấp EHS", icon: "ShieldAlert", focus: "Quản lý quy trình, template, review kết quả và xác minh đóng việc.", responsibilities: ["Sở hữu checklist/audit/KYT/PCCC/tự kiểm tra và version tài liệu.", "Review dữ liệu bộ phận, yêu cầu bổ sung bằng chứng, verify CAPA.", "Tạo báo cáo chuyên đề và ma trận đào tạo bắt buộc theo vị trí/bộ phận."] },
  { id: "department", title: "Cấp bộ phận", icon: "HardHat", focus: "Thực hiện checklist, phát hiện rủi ro, cập nhật bằng chứng và đóng hành động.", responsibilities: ["Làm checklist 6S/PCCC/tự kiểm tra theo lịch, khu vực và ca/ngày.", "Tạo cảnh báo, sự cố, KYT finding và CAPA nội bộ khi có điểm không phù hợp.", "Theo dõi việc được giao từ họp an toàn/EHS và tình trạng đào tạo của bộ phận."] }
];

const DOCUMENT_ARCHITECTURE_MODULES = [
  { id: "documents", title: "Kho tài liệu Safety", status: "existing", path: "/safety-6s/documents", icon: "FileText", levels: ["company", "ehs", "department"], sourceCategories: [], outcome: "Giữ tên file gốc, tra cứu OCR/text, version, ngày hiệu lực và liên kết sang nghiệp vụ." },
  { id: "checklist", title: "Checklist 6S hằng ngày", status: "extend", path: "/safety-6s/checklist", icon: "ClipboardCheck", levels: ["department", "ehs"], sourceCategories: ["sixs-daily-checklist", "sixs-standard"], outcome: "Bổ sung checklist theo EHS-QT-12, khu vực/ca/ngày, ảnh bằng chứng và điểm S1-S6." },
  { id: "audits", title: "Audit / Chấm điểm 6S", status: "extend", path: "/safety-6s/audits", icon: "ClipboardList", levels: ["ehs", "department"], sourceCategories: ["sixs-scoring", "sixs-standard"], outcome: "Tách template sản xuất/gián tiếp, chấm điểm theo kỳ, review EHS và tạo CAPA từ lỗi." },
  { id: "actions", title: "CAPA cải tiến an toàn", status: "extend", path: "/safety-6s/actions", icon: "Workflow", levels: ["ehs", "department"], sourceCategories: ["safety-improvement", "kyt", "pccc", "self-inspection"], outcome: "Mỗi finding từ audit/KYT/PCCC/tự kiểm tra có owner, hạn xử lý, bằng chứng và EHS verify." },
  { id: "kyt", title: "KYT - Lường trước nguy hiểm", status: "existing", path: "/safety-6s/kyt", icon: "Target", levels: ["department", "ehs"], sourceCategories: ["kyt"], outcome: "Flow riêng: Step 1 hiện trạng, Step 2 điểm nguy hiểm, giải pháp, mục tiêu hành động và nhóm tham gia." },
  { id: "pccc", title: "PCCC & An toàn điện", status: "existing", path: "/safety-6s/pccc", icon: "Flame", levels: ["company", "ehs", "department"], sourceCategories: ["pccc"], outcome: "Checklist PCCC/điện theo khu vực, thiết bị, lỗi, deadline, ảnh bằng chứng và xác nhận hoàn thành." },
  { id: "medical", title: "Y tế / Túi sơ cứu", status: "existing", path: "/safety-6s/medical", icon: "BriefcaseMedical", levels: ["company", "ehs", "department"], sourceCategories: ["medical-first-aid"], outcome: "Theo dõi phòng y tế, túi sơ cứu, vật tư, đề xuất mua và báo cáo y tế PY/PY2 theo tháng." },
  { id: "self-inspection", title: "Tự kiểm tra ATVSLĐ", status: "existing", path: "/safety-6s/self-inspection", icon: "ListChecks", levels: ["department", "ehs"], sourceCategories: ["self-inspection"], outcome: "Lập đợt kiểm tra, thành phần đoàn, nội dung/kết luận, chữ ký và xuất biên bản theo form gốc." },
  { id: "reports", title: "Báo cáo chuyên đề", status: "extend", path: "/safety-6s/reports", icon: "FileBarChart", levels: ["company", "ehs"], sourceCategories: ["sixs-scoring", "kyt", "pccc", "medical-first-aid", "safety-meeting"], outcome: "Bổ sung report 6S score, CAPA quá hạn, KYT findings, PCCC issues, medical cases, training valid rate." },
  { id: "training", title: "Đào tạo bắt buộc", status: "extend", path: "/safety-6s/training", icon: "GraduationCap", levels: ["company", "ehs", "department"], sourceCategories: ["kyt", "pccc", "medical-first-aid", "safety-roster", "sixs-standard"], outcome: "Gắn yêu cầu đào tạo 6S, PCCC, sơ cứu, KYT và ATV với bộ phận/vị trí/ngày hết hạn." },
  { id: "locations", title: "Khu vực / QR", status: "extend", path: "/safety-6s/locations", icon: "MapPin", levels: ["ehs", "department"], sourceCategories: ["sixs-daily-checklist", "pccc", "medical-first-aid", "self-inspection"], outcome: "Dùng QR cho khu vực checklist/audit/PCCC/túi sơ cứu để không trùng dữ liệu." }
];

const SPECIAL_PROGRAMS = {
  kyt: { id: "kyt", title: "KYT - Lường trước nguy hiểm", subtitle: "Huấn luyện nhận diện nguy hiểm trước thao tác theo nhóm.", icon: "Target", route: "/safety-6s/kyt", ownerRole: "EHS / Leader bộ phận", cadence: "Hàng tháng hoặc trước công việc rủi ro cao", scope: "Bộ phận, nhóm thao tác, khu vực có thay đổi", primaryAction: "Tạo phiên KYT", documentCategories: ["kyt"], records: [], stats: [], workflow: [], checkpoints: [], charts: { status: [], departments: [] }, apiPlan: [] },
  pccc: { id: "pccc", title: "PCCC & An toàn điện", subtitle: "Quản lý kiểm tra PCCC, an toàn điện, lối thoát hiểm.", icon: "Flame", route: "/safety-6s/pccc", ownerRole: "EHS / GA / Bộ phận sở hữu khu vực", cadence: "Theo lịch định kỳ và kiểm tra đột xuất", scope: "Toàn nhà máy, khu vực PCCC, thiết bị điện, lối thoát hiểm", primaryAction: "Tạo kiểm tra PCCC", documentCategories: ["pccc"], records: [], stats: [], workflow: [], checkpoints: [], charts: { status: [], departments: [] }, apiPlan: [] },
  medical: { id: "medical", title: "Y tế / Túi sơ cứu", subtitle: "Theo dõi phòng y tế, ca sử dụng, túi sơ cứu và vật tư.", icon: "BriefcaseMedical", route: "/safety-6s/medical", ownerRole: "Y tế / EHS / GA", cadence: "Theo ca sử dụng, kiểm tra định kỳ vật tư và tổng hợp tháng", scope: "Phòng y tế, túi sơ cứu tại nơi làm việc, vật tư y tế PY/PY2", primaryAction: "Ghi nhận y tế", documentCategories: ["medical-first-aid"], records: [], stats: [], workflow: [], checkpoints: [], charts: { status: [], departments: [] }, apiPlan: [] },
  "self-inspection": { id: "self-inspection", title: "Tự kiểm tra ATVSLĐ", subtitle: "Lập đợt tự kiểm tra an toàn, lao động theo định kỳ.", icon: "ListChecks", route: "/safety-6s/self-inspection", ownerRole: "EHS / Đoàn kiểm tra", cadence: "Theo lịch định kỳ (quý/năm) và khi có yêu cầu", scope: "Toàn nhà máy theo đợt và từng bộ phận", primaryAction: "Lập đợt kiểm tra", documentCategories: ["self-inspection"], records: [], stats: [], workflow: [], checkpoints: [], charts: { status: [], departments: [] }, apiPlan: [] }
};

const SEED_DATA = {
  auditTemplates: [TEMPLATE_BIEU2, TEMPLATE_BIEU1],
  audits: [],
  actions: [],
  locations: [
    { id: "loc-py1-main", code: "PY1-MAIN", name: "Nhà xưởng PY1 - Khu chính", departmentCode: "EHS", floor: "1F", building: "PY1", qrCode: "LOC-PY1-MAIN", description: "Khu sản xuất chính tầng 1", createdAt: "2024-04-26T00:00:00.000Z", updatedAt: "2024-04-26T00:00:00.000Z" },
    { id: "loc-py2-main", code: "PY2-MAIN", name: "Nhà xưởng PY2 - Khu chính", departmentCode: "EHS", floor: "1F", building: "PY2", qrCode: "LOC-PY2-MAIN", description: "Khu sản xuất PY2", createdAt: "2024-04-26T00:00:00.000Z", updatedAt: "2024-04-26T00:00:00.000Z" }
  ],
  trainingRequirements: DEFAULT_TRAINING_REQUIREMENTS,
  trainingRecords: []
};

export function createJsonSafetyArchitectureStore({ rootDir }) {
  const dataFile = path.join(rootDir, "server", "data", "safety-architecture.json");

  const load = () => {
    try {
      if (fs.existsSync(dataFile)) {
        const raw = fs.readFileSync(dataFile, "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed.auditTemplates?.length) parsed.auditTemplates = SEED_DATA.auditTemplates;
        if (!parsed.trainingRequirements?.length) parsed.trainingRequirements = SEED_DATA.trainingRequirements;
        if (!parsed.locations?.length) parsed.locations = SEED_DATA.locations;
        return parsed;
      }
    } catch {}
    return { ...SEED_DATA };
  };

  const save = (data) => {
    try {
      const dir = path.dirname(dataFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf8");
    } catch (err) {
      console.error("[jsonSafetyArchitectureStore] save error:", err.message);
    }
  };

  const filterQuery = (items, query = {}) => {
    let result = items.filter((item) => !item.deletedAt);
    if (query.dept || query.departmentCode) {
      const dept = String(query.dept || query.departmentCode);
      result = result.filter((item) => item.departmentCode === dept || item.department === dept);
    }
    if (query.status) result = result.filter((item) => item.status === query.status);
    if (query.period) result = result.filter((item) => item.period === query.period);
    if (query.priority) result = result.filter((item) => item.priority === query.priority);
    if (query.sourceType) result = result.filter((item) => (item.sourceType || item.source_type || "manual") === query.sourceType);
    if (query.sourceId) result = result.filter((item) => (item.sourceId || item.source_id) === query.sourceId);
    if (query.q || query.search) {
      const needle = String(query.q || query.search).toLowerCase();
      result = result.filter((item) => {
        const hay = [item.title, item.code, item.description, item.ownerName, item.owner_name].join(" ").toLowerCase();
        return hay.includes(needle);
      });
    }
    const limit = Math.max(1, Math.min(500, Number(query.limit) || 200));
    return result.slice(0, limit);
  };

  return {
    async listDivisions() {
      return SAFETY_DIVISIONS;
    },
    async listDepartments() {
      return SAFETY_DEPARTMENTS;
    },
    async architectureSummary() {
      const data = load();
      const actions = data.actions || [];
      const audits = data.audits || [];
      const actionStats = ["open", "in_progress", "submitted", "verified", "closed"].map((status) => ({
        status, total: actions.filter((a) => !a.deletedAt && a.status === status).length
      })).filter((s) => s.total > 0);
      const auditStats = ["draft", "submitted", "reviewed", "closed"].map((status) => ({
        status, total: audits.filter((a) => !a.deletedAt && a.status === status).length
      })).filter((s) => s.total > 0);
      return {
        divisions: SAFETY_DIVISIONS,
        departments: SAFETY_DEPARTMENTS,
        documents: [],
        actions: actionStats,
        audits: auditStats
      };
    },
    async documentArchitecture() {
      const modules = DOCUMENT_ARCHITECTURE_MODULES.map((module) => ({
        ...module,
        documentCount: 0,
        indexedCount: 0,
        chunkCount: 0,
        sourceDocuments: []
      }));
      return {
        generatedAt: new Date().toISOString(),
        summary: { totalDocuments: 0, indexedDocuments: 0, totalChunks: 0, existingModules: modules.filter((m) => m.status === "existing").length, extendModules: modules.filter((m) => m.status === "extend").length, proposedModules: modules.filter((m) => m.status.startsWith("proposed")).length },
        levels: DOCUMENT_ARCHITECTURE_LEVELS,
        modules
      };
    },
    async listSafetyPrograms() {
      return Object.values(SPECIAL_PROGRAMS).map((program) => ({
        id: program.id, title: program.title, subtitle: program.subtitle, icon: program.icon,
        route: program.route, ownerRole: program.ownerRole, cadence: program.cadence,
        scope: program.scope, primaryAction: program.primaryAction, documentCategories: program.documentCategories
      }));
    },
    async safetyProgram(programId) {
      const program = SPECIAL_PROGRAMS[String(programId || "").toLowerCase()];
      if (!program) return null;
      return { ...program, documents: [], summary: { documentCount: 0, indexedDocuments: 0, chunkCount: 0, openRecords: 0, overdueRecords: 0 }, generatedAt: new Date().toISOString() };
    },
    async riskRegister(query = {}) {
      return [];
    },
    async importDocumentManifest({ sourceRoot = "tai lieu", dryRun = false } = {}, actor = {}) {
      return { dryRun, imported: [], skipped: [], sourceRoot, stats: { imported: 0, indexed: 0, ocrRequired: 0, converterRequired: 0, skipped: 0 } };
    },
    async getDocumentText(id) {
      return null;
    },
    async runDocumentOcr(id, actor = {}, options = {}) {
      return null;
    },
    async listAuditTemplates() {
      const data = load();
      return (data.auditTemplates || []).filter((t) => !t.deletedAt);
    },
    async createAuditTemplate(input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const now = nowIso();
      const item = {
        id: input.id || newId("audit-template"),
        code: text(input.code, generateCode("AUD-TPL")),
        name: text(input.name, "Template audit mới"),
        documentId: input.documentId || null,
        documentCode: input.documentCode || null,
        scopeLevel: text(input.scopeLevel, "department"),
        templateType: text(input.templateType, "6s-audit"),
        version: text(input.version, "1.0"),
        status: text(input.status, "active"),
        ownerRole: text(input.ownerRole, "ehs"),
        description: input.description || null,
        questions: Array.isArray(input.questions) ? input.questions : [],
        createdById: safeActor.id,
        createdByName: safeActor.displayName,
        createdAt: now,
        updatedAt: now
      };
      data.auditTemplates = [...(data.auditTemplates || []), item];
      save(data);
      return item;
    },
    async updateAuditTemplate(id, input = {}, actor = {}) {
      const data = load();
      const idx = (data.auditTemplates || []).findIndex((t) => t.id === id);
      if (idx === -1) return null;
      const current = data.auditTemplates[idx];
      const updated = { ...current, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)), updatedAt: nowIso() };
      data.auditTemplates[idx] = updated;
      save(data);
      return updated;
    },
    async listAudits(query = {}) {
      const data = load();
      return filterQuery(data.audits || [], query);
    },
    async createAudit(input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const now = nowIso();
      const templateId = text(input.templateId || input.template_id, DEFAULT_AUDIT_TEMPLATE.id);
      const departmentCode = text(input.departmentCode || input.department_code || input.department, safeActor.departmentId || "EHS");
      const template = (data.auditTemplates || []).find((t) => t.id === templateId) || DEFAULT_AUDIT_TEMPLATE;
      const questions = template.questions || DEFAULT_AUDIT_TEMPLATE.questions;
      const answers = Array.isArray(input.answers) && input.answers.length
        ? input.answers
        : questions.map((q) => ({ questionId: q.id, score: q.maxScore, resultStatus: "pass", actionRequired: false }));
      const totalScore = answers.reduce((sum, a) => sum + (Number(a.score) || 0), 0);
      const maxScore = questions.reduce((sum, q) => sum + (Number(q.maxScore) || 5), 0);
      const item = {
        id: input.id || newId("audit"),
        code: text(input.code, generateCode("AUD")),
        templateId,
        title: text(input.title, `Audit 6S ${departmentCode}`),
        departmentCode,
        locationId: input.locationId || null,
        scopeLevel: text(input.scopeLevel || input.scope_level, "department"),
        period: input.period || null,
        scheduledDate: toDateOnly(input.scheduledDate || input.scheduled_date),
        status: text(input.status, "draft"),
        totalScore,
        maxScore,
        scorePercent: maxScore ? Math.round((totalScore / maxScore) * 100) : 0,
        answers,
        createdById: safeActor.id,
        createdByName: safeActor.displayName,
        updatedByName: safeActor.displayName,
        createdAt: now,
        updatedAt: now
      };
      data.audits = [...(data.audits || []), item];
      save(data);
      return item;
    },
    async updateAudit(id, input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.audits || []).findIndex((a) => a.id === id && !a.deletedAt);
      if (idx === -1) return null;
      const current = data.audits[idx];
      const updated = { ...current, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)), updatedByName: safeActor.displayName, updatedAt: nowIso() };
      if (Array.isArray(input.answers)) {
        updated.answers = input.answers;
        const maxScore = updated.maxScore || 60;
        const totalScore = input.answers.reduce((sum, a) => sum + (Number(a.score) || 0), 0);
        updated.totalScore = totalScore;
        updated.scorePercent = maxScore ? Math.round((totalScore / maxScore) * 100) : 0;
      }
      data.audits[idx] = updated;
      save(data);
      return updated;
    },
    async submitAudit(id, input = {}, actor = {}) {
      return this.updateAudit(id, { ...input, status: "submitted" }, actor);
    },
    async reviewAudit(id, input = {}, actor = {}) {
      return this.updateAudit(id, { ...input, status: input.status || "reviewed" }, actor);
    },
    async listActions(query = {}) {
      const data = load();
      return filterQuery(data.actions || [], query);
    },
    async getAction(id) {
      const data = load();
      return (data.actions || []).find((a) => a.id === id && !a.deletedAt) || null;
    },
    async createAction(input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const now = nowIso();
      const item = {
        id: input.id || newId("action"),
        code: text(input.code, generateCode("CAPA")),
        title: text(input.title, "Hành động khắc phục mới"),
        description: input.description || null,
        topic: input.topic || null,
        problemType: input.problemType || input.problem_type || null,
        sourceType: text(input.sourceType || input.source_type, "manual"),
        sourceId: input.sourceId || input.source_id || null,
        sourceCode: input.sourceCode || input.source_code || null,
        sourceTitle: input.sourceTitle || input.source_title || null,
        departmentCode: text(input.departmentCode || input.department_code || input.department, safeActor.departmentId || "EHS"),
        locationId: input.locationId || input.location_id || null,
        priority: text(input.priority, "medium"),
        status: text(input.status, "open"),
        ownerId: input.ownerId || input.owner_id || null,
        ownerName: input.ownerName || input.owner_name || safeActor.displayName || null,
        dueDate: toDateOnly(input.dueDate || input.due_date),
        evidenceNotes: input.evidenceNotes || input.evidence_notes || null,
        actionPlan: Array.isArray(input.actionPlan) ? input.actionPlan : null,
        createdById: safeActor.id,
        createdByName: safeActor.displayName,
        updatedByName: safeActor.displayName,
        createdAt: now,
        updatedAt: now
      };
      data.actions = [...(data.actions || []), item];
      data.actionLogs = [...(data.actionLogs || []), {
        id: newId("alog"), entityId: item.id,
        action: input.sourceType && input.sourceType !== "manual" ? "auto-created" : "created",
        actorName: safeActor.displayName, actorRole: safeActor.role,
        summary: input.sourceType && input.sourceType !== "manual"
          ? `CAPA tạo tự động từ ${input.sourceType} ${input.sourceCode || input.sourceId || ""}`
          : "Tạo CAPA thủ công",
        createdAt: now,
      }];
      save(data);
      return item;
    },
    async updateAction(id, input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.actions || []).findIndex((a) => a.id === id && !a.deletedAt);
      if (idx === -1) return null;
      const prev = data.actions[idx];
      const now = nowIso();
      const updated = { ...prev, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)), updatedByName: safeActor.displayName, updatedAt: now };
      data.actions[idx] = updated;
      const statusChanged = input.status && input.status !== prev.status;
      if (statusChanged) {
        const STATUS_LABELS = {
          open: "Đang mở", in_progress: "Đang xử lý",
          done_by_owner: "Chờ EHS xác minh", closed: "Đã đóng", verified: "Đã xác minh"
        };
        data.actionLogs = [...(data.actionLogs || []), {
          id: newId("alog"), entityId: id,
          action: `status-changed-to-${input.status}`,
          actorName: safeActor.displayName, actorRole: safeActor.role,
          summary: `Trạng thái → ${STATUS_LABELS[input.status] || input.status}`,
          meta: { from: prev.status, to: input.status },
          createdAt: now,
        }];
      } else if (input.progressNote) {
        data.actionLogs = [...(data.actionLogs || []), {
          id: newId("alog"), entityId: id,
          action: "note-added",
          actorName: safeActor.displayName, actorRole: safeActor.role,
          summary: input.progressNote,
          createdAt: now,
        }];
      } else if (input._editMode) {
        data.actionLogs = [...(data.actionLogs || []), {
          id: newId("alog"), entityId: id,
          action: "edited",
          actorName: safeActor.displayName, actorRole: safeActor.role,
          summary: `Chỉnh sửa thông tin CAPA bởi ${safeActor.displayName}`,
          createdAt: now,
        }];
      } else if (input._extendMode) {
        const prevDue = input._prevDueDate || prev.dueDate || prev.due || "—";
        const newDue  = input.dueDate || input.due_date || "—";
        data.actionLogs = [...(data.actionLogs || []), {
          id: newId("alog"), entityId: id,
          action: "due-date-extended",
          actorName: safeActor.displayName, actorRole: safeActor.role,
          summary: `Gia hạn: ${prevDue} → ${newDue} | Lý do: ${input._extendReason}`,
          meta: { prevDueDate: prevDue, newDueDate: newDue, reason: input._extendReason },
          createdAt: now,
        }];
      } else if (input._approveMode) {
        data.actionLogs = [...(data.actionLogs || []), {
          id: newId("alog"), entityId: id,
          action: "approved",
          actorName: safeActor.displayName, actorRole: safeActor.role,
          summary: `EHS phê duyệt CAPA — chuyển sang "Đang mở"`,
          createdAt: now,
        }];
      } else if (input._rejectMode) {
        data.actionLogs = [...(data.actionLogs || []), {
          id: newId("alog"), entityId: id,
          action: "rejected-draft",
          actorName: safeActor.displayName, actorRole: safeActor.role,
          summary: `EHS từ chối CAPA — Lý do: ${input.rejectionNote || "Không đạt yêu cầu"}`,
          meta: { reason: input.rejectionNote },
          createdAt: now,
        }];
      } else if (input._resubmitMode) {
        data.actionLogs = [...(data.actionLogs || []), {
          id: newId("alog"), entityId: id,
          action: "resubmitted",
          actorName: safeActor.displayName, actorRole: safeActor.role,
          summary: `Gửi lại để EHS phê duyệt`,
          createdAt: now,
        }];
      } else if (input._reminderMode) {
        data.actionLogs = [...(data.actionLogs || []), {
          id: newId("alog"), entityId: id,
          action: "due-date-reminder",
          actorName: safeActor.displayName, actorRole: safeActor.role,
          summary: `Nhắc hạn: còn ${input._reminderDays != null ? input._reminderDays + " ngày" : "gần đến hạn"} | ${input._reminderNote || ""}`,
          meta: { daysLeft: input._reminderDays, note: input._reminderNote, manual: input._reminderManual || false },
          createdAt: now,
        }];
      }
      save(data);
      return updated;
    },
    async submitActionEvidence(id, input = {}, actor = {}) {
      return this.updateAction(id, { ...input, status: "done_by_owner" }, actor);
    },
    async verifyAction(id, input = {}, actor = {}) {
      const newStatus = input.approved !== false ? "closed" : "open";
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.actions || []).findIndex((a) => a.id === id && !a.deletedAt);
      if (idx === -1) return null;
      const now = nowIso();
      const updated = { ...data.actions[idx], status: newStatus, verificationNote: input.note || input.verificationNote || null, verifiedByName: safeActor.displayName, verifiedAt: now, updatedByName: safeActor.displayName, updatedAt: now };
      data.actions[idx] = updated;
      data.actionLogs = [...(data.actionLogs || []), {
        id: newId("alog"), entityId: id,
        action: input.approved !== false ? "verified-closed" : "rejected-reopen",
        actorName: safeActor.displayName, actorRole: safeActor.role,
        summary: input.approved !== false
          ? `EHS xác minh & đóng CAPA${input.note ? ` — ${input.note}` : ""}`
          : `EHS trả lại — chưa đạt${input.note ? `: ${input.note}` : ""}`,
        createdAt: now,
      }];
      save(data);
      return updated;
    },
    async addActionEvidenceFiles(id, newFiles = [], actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.actions || []).findIndex((a) => a.id === id && !a.deletedAt);
      if (idx === -1) return null;
      const now = nowIso();
      const existing = data.actions[idx].evidenceFiles || [];
      data.actions[idx] = { ...data.actions[idx], evidenceFiles: [...existing, ...newFiles], updatedByName: safeActor.displayName, updatedAt: now };
      data.actionLogs = [...(data.actionLogs || []), {
        id: newId("alog"), entityId: id,
        action: "files-attached",
        actorName: safeActor.displayName, actorRole: safeActor.role,
        summary: `Đính kèm ${newFiles.length} file bằng chứng`,
        createdAt: now,
      }];
      save(data);
      return data.actions[idx];
    },
    async listActionLogs(id) {
      const data = load();
      return (data.actionLogs || [])
        .filter((l) => l.entityId === id && l.action !== "comment")
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
        .slice(0, 100);
    },
    async listActionComments(id) {
      const data = load();
      return (data.actionLogs || [])
        .filter((l) => l.entityId === id && l.action === "comment")
        .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    },
    async addActionComment(id, input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.actions || []).findIndex((a) => a.id === id && !a.deletedAt);
      if (idx === -1) return null;
      const now = nowIso();
      const comment = {
        id: newId("cmt"),
        entityId: id,
        action: "comment",
        actorName: safeActor.displayName,
        actorRole: safeActor.role,
        actorUsername: safeActor.username,
        text: String(input.text || "").trim(),
        mentions: Array.isArray(input.mentions) ? input.mentions : [],
        edited: false,
        createdAt: now,
        updatedAt: now,
      };
      if (!comment.text) return null;
      data.actionLogs = [...(data.actionLogs || []), comment];
      save(data);
      return comment;
    },
    async editActionComment(commentId, { text } = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.actionLogs || []).findIndex((l) => l.id === commentId && l.action === "comment");
      if (idx === -1) return null;
      const trimmed = String(text || "").trim();
      if (!trimmed) return null;
      data.actionLogs[idx] = {
        ...data.actionLogs[idx],
        text: trimmed,
        edited: true,
        updatedAt: new Date().toISOString(),
      };
      save(data);
      return data.actionLogs[idx];
    },
    async deleteActionComment(commentId, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.actionLogs || []).findIndex((l) => l.id === commentId && l.action === "comment");
      if (idx === -1) return false;
      const log = data.actionLogs[idx];
      if (log.actorUsername !== safeActor.username && safeActor.role !== "admin" && safeActor.role !== "ehs") return false;
      data.actionLogs.splice(idx, 1);
      save(data);
      return true;
    },
    async getActionCommentCounts() {
      const data = load();
      const counts = {};
      (data.actionLogs || []).forEach((l) => {
        if (l.action === "comment" && l.entityId) {
          counts[l.entityId] = (counts[l.entityId] || 0) + 1;
        }
      });
      return counts;
    },
    async backfillSourceTitles() {
      const data = load();
      let warningIndex = {};
      let auditIndex = {};
      try {
        const opsPath = path.join(path.dirname(new URL(import.meta.url).pathname), "../data/safety-operations.json");
        const ops = JSON.parse(fs.readFileSync(opsPath, "utf8"));
        (ops.warnings || []).forEach((w) => { warningIndex[w.id] = w; });
      } catch {}
      (data.audits || []).forEach((a) => { auditIndex[a.id] = a; });
      let count = 0;
      data.actions = (data.actions || []).map((a) => {
        if (a.sourceTitle) return a;
        let sourceTitle = null;
        if (a.sourceType === "warning" && a.sourceId) {
          const w = warningIndex[a.sourceId];
          if (w) sourceTitle = w.title || null;
        } else if (a.sourceType === "audit" && a.sourceId) {
          const aud = auditIndex[a.sourceId];
          if (aud) sourceTitle = `Audit ${aud.code || a.sourceCode || ""}`.trim();
        }
        if (sourceTitle) { count++; return { ...a, sourceTitle }; }
        return a;
      });
      save(data);
      return count;
    },
    async backfillProblemTypes({ inferFromCategory, sourceTypeFallback } = {}) {
      const data = load();
      let count = 0;
      // Pre-load warnings index for warning-sourced CAPA lookup
      let warningIndex = {};
      try {
        const opsPath = path.join(path.dirname(new URL(import.meta.url).pathname), "../data/safety-operations.json");
        const ops = JSON.parse(fs.readFileSync(opsPath, "utf8"));
        (ops.warnings || []).forEach((w) => { warningIndex[w.id] = w; });
      } catch {}
      data.actions = (data.actions || []).map((a) => {
        if (a.problemType) return a;
        let pt = null;
        if (a.sourceType === "warning" && a.sourceId) {
          const w = warningIndex[a.sourceId];
          if (w && inferFromCategory) pt = inferFromCategory(w.category);
        }
        if (!pt && sourceTypeFallback) pt = sourceTypeFallback[String(a.sourceType).toLowerCase()] || null;
        if (pt) { count++; return { ...a, problemType: pt }; }
        return a;
      });
      save(data);
      return count;
    },
    async listLocations(query = {}) {
      const data = load();
      return filterQuery(data.locations || [], query);
    },
    async createLocation(input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const now = nowIso();
      const code = text(input.code, generateCode("LOC"));
      const item = {
        id: input.id || newId("loc"),
        code,
        name: text(input.name, "Khu vực mới"),
        departmentCode: text(input.departmentCode || input.department, safeActor.departmentId || "EHS"),
        floor: input.floor || null,
        building: input.building || null,
        qrCode: text(input.qrCode, code),
        description: input.description || null,
        createdAt: now,
        updatedAt: now
      };
      data.locations = [...(data.locations || []), item];
      save(data);
      return item;
    },
    async findLocationByQr(code) {
      const data = load();
      return (data.locations || []).find((l) => l.qrCode === code || l.code === code) || null;
    },
    async listTrainingRequirements(query = {}) {
      const data = load();
      return filterQuery(data.trainingRequirements || [], query);
    },
    async createTrainingRequirement(input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const now = nowIso();
      const item = {
        id: input.id || newId("treq"),
        code: text(input.code, generateCode("TR")),
        name: text(input.name, "Yêu cầu đào tạo mới"),
        category: input.category || null,
        scopeLevel: text(input.scopeLevel, "company"),
        departmentCode: input.departmentCode || null,
        targetGroup: input.targetGroup || null,
        intervalMonths: Number(input.intervalMonths) || 12,
        status: text(input.status, "active"),
        createdByName: safeActor.displayName,
        createdAt: now,
        updatedAt: now
      };
      data.trainingRequirements = [...(data.trainingRequirements || []), item];
      save(data);
      return item;
    },
    async listTrainingRecords(query = {}) {
      const data = load();
      return filterQuery(data.trainingRecords || [], query);
    },
    async exportActionsCsv(query = {}) {
      const data = load();
      let actions = (data.actions || []).filter((a) => !a.deletedAt);
      if (query.status) actions = actions.filter((a) => a.status === query.status);
      if (query.dept) actions = actions.filter((a) => a.departmentCode === query.dept);
      if (query.sourceType) actions = actions.filter((a) => (a.sourceType || "manual") === query.sourceType);
      if (query.priority) actions = actions.filter((a) => a.priority === query.priority);
      actions = actions.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

      const escape = (v) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const STATUS_LABEL = {
        draft:"Nháp", pending_ehs:"Chờ duyệt", open:"Đang mở", in_progress:"Đang xử lý",
        done_by_owner:"Chờ nghiệm thu", closed:"Đã đóng", verified:"Đã xác nhận", reopened:"Mở lại",
      };
      const PRIO_LABEL = { low:"Thấp", medium:"Trung bình", high:"Cao", critical:"Khẩn cấp" };
      const SRC_LABEL = {
        manual:"Thủ công", warning:"Cảnh báo", incident:"Sự cố", audit:"Kiểm tra/Audit",
        kyt:"KYT", pccc:"PCCC", inspection:"Biên bản kiểm tra",
      };

      const headers = [
        "Mã CAPA","Tiêu đề","Loại CA/PA","Chuyên đề","Loại vấn đề",
        "Nguồn phát sinh","Mã nguồn","Bộ phận","Ưu tiên","Trạng thái",
        "Người thực hiện","Hạn xử lý","Ngày kiểm tra hiệu lực",
        "Số hành động","Ngày tạo","Người tạo",
      ];
      const rows = actions.map((a) => [
        a.code || "",
        a.title || "",
        a.capaType ? (a.capaType === "ca" ? "CA" : a.capaType === "pa" ? "PA" : "CA+PA") : "",
        a.topic || "",
        a.problemType || "",
        SRC_LABEL[a.sourceType] || a.sourceType || "",
        a.sourceCode || "",
        a.departmentCode || "",
        PRIO_LABEL[a.priority] || a.priority || "",
        STATUS_LABEL[a.status] || a.status || "",
        Array.isArray(a.assignees) ? a.assignees.join("; ") : (a.ownerName || ""),
        a.dueDate || "",
        a.verifyDate || "",
        Array.isArray(a.actionPlan) ? a.actionPlan.length : 0,
        (a.createdAt || "").slice(0, 10),
        a.createdByName || "",
      ]);
      return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\r\n");
    },
    async createTrainingRecord(input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const now = nowIso();
      const item = {
        id: input.id || newId("trec"),
        requirementId: input.requirementId || null,
        requirementCode: input.requirementCode || null,
        trainingName: text(input.trainingName, "Khóa đào tạo"),
        departmentCode: text(input.departmentCode || input.department, safeActor.departmentId || "company"),
        attendeeName: input.attendeeName || null,
        attendeeId: input.attendeeId || null,
        trainedDate: toDateOnly(input.trainedDate),
        expiryDate: toDateOnly(input.expiryDate),
        status: text(input.status, "valid"),
        notes: input.notes || null,
        createdByName: safeActor.displayName,
        createdAt: now,
        updatedAt: now
      };
      data.trainingRecords = [...(data.trainingRecords || []), item];
      save(data);
      return item;
    },
    async deleteAction(id, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.actions || []).findIndex((a) => a.id === id && !a.deletedAt);
      if (idx === -1) return null;
      data.actions[idx] = {
        ...data.actions[idx],
        deletedAt: nowIso(),
        updatedAt: nowIso(),
        deletedByName: safeActor.displayName
      };
      save(data);
      return { ok: true, id };
    },
    async updateLocation(id, input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.locations || []).findIndex((l) => l.id === id && !l.deletedAt);
      if (idx === -1) return null;
      const updated = {
        ...data.locations[idx],
        ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
        updatedByName: safeActor.displayName,
        updatedAt: nowIso()
      };
      data.locations[idx] = updated;
      save(data);
      return updated;
    },
    async deleteLocation(id, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.locations || []).findIndex((l) => l.id === id && !l.deletedAt);
      if (idx === -1) return null;
      data.locations[idx] = {
        ...data.locations[idx],
        deletedAt: nowIso(),
        updatedAt: nowIso(),
        deletedByName: safeActor.displayName
      };
      save(data);
      return { ok: true, id };
    },
    async updateTrainingRequirement(id, input = {}, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.trainingRequirements || []).findIndex((t) => t.id === id && !t.deletedAt);
      if (idx === -1) return null;
      const updated = {
        ...data.trainingRequirements[idx],
        ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
        updatedByName: safeActor.displayName,
        updatedAt: nowIso()
      };
      data.trainingRequirements[idx] = updated;
      save(data);
      return updated;
    },
    async deleteTrainingRequirement(id, actor = {}) {
      const data = load();
      const safeActor = actorFields(actor);
      const idx = (data.trainingRequirements || []).findIndex((t) => t.id === id && !t.deletedAt);
      if (idx === -1) return null;
      data.trainingRequirements[idx] = {
        ...data.trainingRequirements[idx],
        deletedAt: nowIso(),
        updatedAt: nowIso(),
        deletedByName: safeActor.displayName
      };
      save(data);
      return { ok: true, id };
    }
  };
}
