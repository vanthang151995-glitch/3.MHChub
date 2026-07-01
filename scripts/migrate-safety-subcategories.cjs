const mysql = require("mysql2/promise");

const subcategories = [
  { old: 'Thiếu che chắn an toàn', new: 'MISSING_GUARD' },
  { old: 'Máy hỏng đang sử dụng', new: 'BROKEN_MACHINE' },
  { old: 'Áp suất vượt ngưỡng', new: 'HIGH_PRESSURE' },
  { old: 'Thiếu bảo trì định kỳ', new: 'MISSING_MAINTENANCE' },
  { old: 'Dây điện hở', new: 'EXPOSED_WIRES' },
  { old: 'Thiết bị cũ quá hạn thay', new: 'EXPIRED_EQUIPMENT' },

  { old: 'Chiếu sáng không đủ', new: 'POOR_LIGHTING' },
  { old: 'Tiếng ồn vượt ngưỡng', new: 'HIGH_NOISE' },
  { old: 'Nhiệt độ cao', new: 'HIGH_TEMPERATURE' },
  { old: 'Bụi vượt ngưỡng', new: 'EXCESSIVE_DUST' },
  { old: 'Sàn trơn trượt', new: 'SLIPPERY_FLOOR' },
  { old: 'Lối đi bị chặn', new: 'BLOCKED_AISLE' },
  { old: 'Thông gió kém', new: 'POOR_VENTILATION' },

  { old: 'Không đeo PPE', new: 'NO_PPE' },
  { old: 'Vi phạm quy trình', new: 'PROCESS_VIOLATION' },
  { old: 'Làm việc không được phép', new: 'UNAUTHORIZED_WORK' },
  { old: 'Chưa được đào tạo', new: 'UNTRAINED' },
  { old: 'Sử dụng điện thoại khi làm việc', new: 'USING_PHONE' },
  { old: 'Không khóa thiết bị trước bảo trì', new: 'NO_LOTO' },

  { old: 'Bình PCCC hết hạn', new: 'EXPIRED_EXTINGUISHER' },
  { old: 'Lối thoát hiểm bị chặn', new: 'BLOCKED_ESCAPE_ROUTE' },
  { old: 'Biển thoát hiểm hỏng', new: 'BROKEN_EXIT_SIGN' },
  { old: 'Thiếu bản đồ thoát hiểm', new: 'MISSING_EVAC_PLAN' },
  { old: 'Hệ thống báo cháy lỗi', new: 'FIRE_ALARM_FAULT' },
  { old: 'Thiếu diễn tập PCCC', new: 'MISSING_FIRE_DRILL' },

  { old: 'Không có nhãn hóa chất', new: 'NO_CHEMICAL_LABEL' },
  { old: 'Thiếu SDS/MSDS', new: 'MISSING_SDS' },
  { old: 'Bảo quản sai quy định', new: 'IMPROPER_STORAGE' },
  { old: 'Không có PPE hóa chất', new: 'NO_CHEMICAL_PPE' },
  { old: 'Rò rỉ nhỏ chưa xử lý', new: 'MINOR_LEAK' },
  { old: 'Hóa chất hết hạn', new: 'EXPIRED_CHEMICALS' },

  { old: 'Nâng hàng sai tư thế', new: 'IMPROPER_LIFTING' },
  { old: 'Ghế làm việc không phù hợp', new: 'UNSUITABLE_CHAIR' },
  { old: 'Màn hình quá cao/thấp', new: 'MONITOR_HEIGHT' },
  { old: 'Đứng liên tục > 4 giờ', new: 'PROLONGED_STANDING' },
  { old: 'Rung động máy kéo dài', new: 'MACHINE_VIBRATION' },
  { old: 'Thao tác lặp lại liên tục', new: 'REPETITIVE_MOTION' }
];

const standards = [
  { old: 'QCVN 26:2016/BLĐTBXH', new: 'QCVN_26_2016' },
  { old: 'TCVN 5179:2013', new: 'TCVN_5179_2013' },
  { old: 'IEC 60204-1', new: 'IEC_60204_1' },
  { old: 'QCVN 24:2016', new: 'QCVN_24_2016' },
  { old: 'TCVN 3733:2002', new: 'TCVN_3733_2002' },
  { old: 'Luật ATVSLĐ 2015', new: 'LAW_ATVSLD_2015' },
  { old: 'QCVN 04:2015/BLĐTBXH', new: 'QCVN_04_2015' },
  { old: 'QCVN 06:2021/BXD', new: 'QCVN_06_2021' },
  { old: 'TCVN 3890:2009', new: 'TCVN_3890_2009' },
  { old: 'Luật PCCC 2001', new: 'LAW_PCCC_2001' },
  { old: 'QCVN 05:2009/BCT', new: 'QCVN_05_2009' },
  { old: 'Thông tư 32/2017/TT-BCT', new: 'CIRCULAR_32_2017' },
  { old: 'GHS/CLP', new: 'GHS_CLP' },
  { old: 'ISO 9241', new: 'ISO_9241' },
  { old: 'TCVN 7303:2003', new: 'TCVN_7303_2003' }
];

async function migrate() {
  const pool = mysql.createPool({
    host: "127.0.0.1",
    port: 3308,
    user: "root",
    password: "",
    database: "mhchub",
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true,
    timezone: "Z"
  });

  try {
    console.log("Starting Migration for Subcategories & Standards...");
    for (const { old: o, new: n } of subcategories) {
      const [res] = await pool.query(`UPDATE safety_warnings SET subcategory = ? WHERE subcategory = ?`, [n, o]);
      if (res.affectedRows > 0) {
        console.log(`Updated subcategory '${o}' to '${n}' (${res.affectedRows} rows)`);
      }
    }
    for (const { old: o, new: n } of standards) {
      const [res] = await pool.query(`UPDATE safety_warnings SET related_standard = ? WHERE related_standard = ?`, [n, o]);
      if (res.affectedRows > 0) {
        console.log(`Updated related_standard '${o}' to '${n}' (${res.affectedRows} rows)`);
      }
    }
    console.log("Migration completed.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await pool.end();
  }
}

migrate();
