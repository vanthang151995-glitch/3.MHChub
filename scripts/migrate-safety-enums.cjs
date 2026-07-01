const mysql = require("mysql2/promise");
const path = require("path");

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
    console.log("Starting Data Model Enum Migration...");

    // 1. ApprovalStatus Migration
    const approvalStatusUpdates = [
      { old: 'Chờ duyệt', new: 'PENDING' },
      { old: 'Đã duyệt', new: 'APPROVED' },
      { old: 'Từ chối', new: 'REJECTED' }
    ];

    for (const { old: o, new: n } of approvalStatusUpdates) {
      console.log(`Updating approval_status: ${o} -> ${n}`);
      const [warnRes] = await pool.query(`UPDATE safety_warnings SET approval_status = ? WHERE approval_status = ?`, [n, o]);
      console.log(`  safety_warnings affected: ${warnRes.affectedRows}`);
      const [incRes] = await pool.query(`UPDATE safety_incidents SET approval_status = ? WHERE approval_status = ?`, [n, o]);
      console.log(`  safety_incidents affected: ${incRes.affectedRows}`);
    }

    // 2. WStatus Migration
    const wStatusUpdates = [
      { old: 'Mở', new: 'OPEN' },
      { old: 'Đang xử lý', new: 'IN_PROGRESS' },
      { old: 'Hoàn thành', new: 'DONE' },
      { old: 'Quá hạn', new: 'OVERDUE' }
    ];

    for (const { old: o, new: n } of wStatusUpdates) {
      console.log(`Updating status (WStatus): ${o} -> ${n}`);
      const [warnRes] = await pool.query(`UPDATE safety_warnings SET status = ? WHERE status = ?`, [n, o]);
      console.log(`  safety_warnings affected: ${warnRes.affectedRows}`);
      const [incRes] = await pool.query(`UPDATE safety_incidents SET status = ? WHERE status = ?`, [n, o]);
      console.log(`  safety_incidents affected: ${incRes.affectedRows}`);
    }

    // 3. RiskLevel Migration
    const riskLevelUpdates = [
      { old: 'Cực kỳ nghiêm trọng', new: 'CRITICAL' },
      { old: 'Nghiêm trọng', new: 'HIGH' },
      { old: 'Trung bình', new: 'MEDIUM' },
      { old: 'Thấp', new: 'LOW' }
    ];

    for (const { old: o, new: n } of riskLevelUpdates) {
      console.log(`Updating risk_level: ${o} -> ${n}`);
      const [warnRes] = await pool.query(`UPDATE safety_warnings SET risk_level = ? WHERE risk_level = ?`, [n, o]);
      console.log(`  safety_warnings affected: ${warnRes.affectedRows}`);
    }

    // 4. WCategory Migration
    const categoryUpdates = [
      { old: 'Thiết bị / Máy móc', new: 'EQUIPMENT' },
      { old: 'Môi trường làm việc', new: 'ENVIRONMENT' },
      { old: 'Hành vi con người', new: 'HUMAN_BEHAVIOR' },
      { old: 'PCCC & Thoát hiểm', new: 'FIRE_SAFETY' },
      { old: 'Hóa chất nguy hiểm', new: 'CHEMICALS' },
      { old: 'Ergonomic / Tư thế', new: 'ERGONOMICS' }
    ];

    for (const { old: o, new: n } of categoryUpdates) {
      console.log(`Updating category: ${o} -> ${n}`);
      const [warnRes] = await pool.query(`UPDATE safety_warnings SET category = ? WHERE category = ?`, [n, o]);
      console.log(`  safety_warnings affected: ${warnRes.affectedRows}`);
    }

    console.log("Migration completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await pool.end();
  }
}

migrate();
