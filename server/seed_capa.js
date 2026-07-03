

import { createMysqlSafetyArchitectureStore } from "./core/mysqlSafetyArchitectureStore.js";

const safetyArchitecture = createMysqlSafetyArchitectureStore({ rootDir: process.cwd() });

async function seed() {
  const actor = { id: "seed", displayName: "Admin System", email: "admin@mhchub.local", role: "admin", departmentId: "EHS" };

  console.log("Seeding CAPA data...");
  const actions = [
    {
      title: "Công nhân không đeo kính bảo hộ khi mài kim loại",
      description: "Phát hiện 2 công nhân tại xưởng cơ khí không đeo kính bảo hộ khi thực hiện công đoạn mài, tiềm ẩn nguy cơ phôi kim loại bắn vào mắt.",
      departmentCode: "PE1",
      locationId: "Khu vực mài",
      priority: "high",
      status: "open",
      ownerName: "Nguyễn Văn Thắng",
      dueDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
      problemType: "PPE",
      topic: "Sức khỏe nghề nghiệp",
      sourceType: "inspection"
    },
    {
      title: "Rò rỉ hóa chất tại khu vực lưu trữ C-12",
      description: "Hóa chất (Axeton) bị rò rỉ khoảng 2 lít do van xả bị lỏng. Yêu cầu làm sạch và thay thế van xả ngay lập tức.",
      departmentCode: "QA",
      locationId: "Kho hóa chất C-12",
      priority: "critical",
      status: "in_progress",
      ownerName: "Trần Văn Đức",
      dueDate: new Date(Date.now() + 1 * 86400000).toISOString().split('T')[0],
      problemType: "CHEM",
      topic: "Hóa chất",
      sourceType: "warning"
    },
    {
      title: "Bình chữa cháy hết hạn kiểm định",
      description: "Trong đợt audit tuần trước, phát hiện 3 bình chữa cháy CO2 tại khu vực kho thành phẩm đã hết hạn kiểm định định kỳ 6 tháng.",
      departmentCode: "GA",
      locationId: "Kho thành phẩm",
      priority: "high",
      status: "assigned",
      ownerName: "Lê Văn Hùng",
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      problemType: "FIRE",
      topic: "PCCC",
      sourceType: "audit"
    },
    {
      title: "Thiếu vạch kẻ đường cho xe nâng nội bộ",
      description: "Khu vực bãi tập kết vật tư B2 thiếu vạch kẻ đường giao thông rõ ràng, dễ gây va chạm giữa người đi bộ và xe nâng.",
      departmentCode: "MP",
      locationId: "Bãi B2",
      priority: "medium",
      status: "draft",
      ownerName: "Phạm Thị Hoa",
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      problemType: "VEHICLE",
      topic: "Giao thông nội bộ",
      sourceType: "manual"
    },
    {
      title: "Thiết bị dập chấn không có che chắn an toàn",
      description: "Máy dập thủy lực #4 bị tháo mất tấm lưới chắn an toàn. Rất nguy hiểm.",
      departmentCode: "PE1",
      locationId: "Xưởng Dập",
      priority: "critical",
      status: "done_by_owner",
      ownerName: "Nguyễn Minh Tuấn",
      dueDate: new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0],
      problemType: "MACH",
      topic: "Máy móc / Thiết bị",
      sourceType: "incident"
    },
    {
      title: "Tủ điện ngoài trời mở toang",
      description: "Tủ MSB-02 nằm sát khu vực chứa nước sinh hoạt mở toang nắp, không khóa, rất dễ gây chập điện hoặc tai nạn điện.",
      departmentCode: "EBM",
      locationId: "Trạm điện ngoài trời",
      priority: "high",
      status: "closed",
      ownerName: "Hoàng Thị Linh",
      dueDate: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
      problemType: "ELEC",
      topic: "An toàn điện",
      sourceType: "warning"
    }
  ];

  for (const action of actions) {
    try {
      const res = await safetyArchitecture.createAction(action, actor);
      console.log(`Created CAPA: ${res.code} - ${res.title}`);
      
      // MOCK SOME STATUS FLOW IF APPLICABLE
      if (action.status !== 'draft') {
         await safetyArchitecture.updateAction(res.id, { status: action.status }, actor);
      }
      if (action.status === 'done_by_owner' || action.status === 'closed') {
         await safetyArchitecture.submitActionEvidence(res.id, { evidenceNotes: "Đã khắc phục xong" }, actor);
      }
      if (action.status === 'closed') {
         await safetyArchitecture.verifyAction(res.id, { approved: true, note: "Đạt yêu cầu" }, actor);
      }

    } catch (e) {
      console.error("Error creating action", e);
    }
  }

  console.log("Seeding complete. Exiting...");
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
