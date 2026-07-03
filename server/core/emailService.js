import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

export function isEmailConfigured() {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function createTransporter() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { rejectUnauthorized: false },
  });
}

/**
 * Gửi email nhắc nhở lỗi quá hạn cho từng người chịu trách nhiệm.
 *
 * @param {Array<{
 *   planCode: string, planTitle: string,
 *   deptCode: string, deptName: string,
 *   caId: string, finding: string,
 *   responsible: string, responsibleEmail: string,
 *   dueDate: string | null, daysOverdue: number,
 *   severity: string
 * }>} items - Danh sách lỗi quá hạn
 * @returns {{ sent: number, failed: number, skipped: number, details: Array }}
 */
export async function sendOverdueReminders(items) {
  const SEV_VI = { critical: "Nghiêm trọng", high: "Cao", medium: "Trung bình", low: "Thấp" };
  const result = { sent: 0, failed: 0, skipped: 0, details: [] };

  if (!isEmailConfigured()) {
    result.skipped = items.length;
    result.details.push({ reason: "SMTP chưa được cấu hình" });
    return result;
  }

  const transporter = createTransporter();

  const grouped = new Map();
  for (const item of items) {
    const email = (item.responsibleEmail || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      result.skipped++;
      result.details.push({ caId: item.caId, responsible: item.responsible, reason: "Thiếu địa chỉ email" });
      continue;
    }
    if (!grouped.has(email)) grouped.set(email, { email, name: item.responsible, items: [] });
    grouped.get(email).items.push(item);
  }

  for (const { email, name, items: caItems } of grouped.values()) {
    const rows = caItems.map((ca) => `
      <tr style="border-bottom:1px solid #fee2e2">
        <td style="padding:8px 10px;font-size:13px;color:#1e293b">${ca.deptCode} — ${ca.deptName}</td>
        <td style="padding:8px 10px;font-size:13px;color:#1e293b">${ca.finding}</td>
        <td style="padding:8px 10px;text-align:center;font-size:12px;font-weight:700;color:${ca.severity === "critical" ? "#dc2626" : ca.severity === "high" ? "#ea580c" : "#d97706"}">
          ${SEV_VI[ca.severity] || ca.severity}
        </td>
        <td style="padding:8px 10px;text-align:center;font-size:12px;color:#b91c1c;font-weight:700">Quá ${ca.daysOverdue} ngày</td>
        <td style="padding:8px 10px;font-size:12px;color:#64748b">${ca.planCode}</td>
      </tr>`).join("");

    const html = `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><title>Nhắc nhở lỗi khắc phục quá hạn</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif">
  <div style="max-width:680px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <div style="background:linear-gradient(135deg,#dc2626,#b91c1c);padding:24px 28px">
      <div style="font-size:22px;font-weight:700;color:#fff">⚠ Nhắc nhở: Lỗi khắc phục quá hạn</div>
      <div style="font-size:14px;color:#fecaca;margin-top:6px">MHChub · Hệ thống An toàn 6S</div>
    </div>
    <div style="padding:24px 28px">
      <p style="font-size:15px;color:#374151;margin:0 0 16px">Xin chào <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#64748b;margin:0 0 20px">
        Bạn có <strong style="color:#dc2626">${caItems.length} lỗi khắc phục đã quá hạn xử lý</strong>.
        Vui lòng kiểm tra và cập nhật trạng thái hoặc liên hệ EHS để được hỗ trợ.
      </p>
      <table style="width:100%;border-collapse:collapse;background:#fff8f8;border:1px solid #fecaca;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#fef2f2">
            <th style="padding:9px 10px;text-align:left;font-size:12px;font-weight:700;color:#991b1b">Bộ phận</th>
            <th style="padding:9px 10px;text-align:left;font-size:12px;font-weight:700;color:#991b1b">Phát hiện</th>
            <th style="padding:9px 10px;text-align:center;font-size:12px;font-weight:700;color:#991b1b">Mức độ</th>
            <th style="padding:9px 10px;text-align:center;font-size:12px;font-weight:700;color:#991b1b">Quá hạn</th>
            <th style="padding:9px 10px;text-align:left;font-size:12px;font-weight:700;color:#991b1b">Kế hoạch</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:13px;color:#94a3b8;margin:20px 0 0;border-top:1px solid #e2e8f0;padding-top:16px">
        Email này được gửi tự động bởi hệ thống MHChub. Vui lòng không trả lời email này.
      </p>
    </div>
  </div>
</body>
</html>`;

    try {
      await transporter.sendMail({
        from: `"MHChub · An toàn 6S" <${SMTP_FROM}>`,
        to: email,
        subject: `[MHChub] ⚠ ${caItems.length} lỗi khắc phục quá hạn — cần xử lý ngay`,
        html,
      });
      result.sent++;
      result.details.push({ email, responsible: name, count: caItems.length, status: "sent" });
    } catch (err) {
      result.failed++;
      result.details.push({ email, responsible: name, count: caItems.length, status: "failed", error: err.message });
    }
  }

  return result;
}

export async function testSmtpConnection() {
  if (!isEmailConfigured()) {
    return { ok: false, reason: "SMTP chưa cấu hình (thiếu SMTP_HOST, SMTP_USER hoặc SMTP_PASS)" };
  }
  try {
    const t = createTransporter();
    await t.verify();
    return { ok: true, host: SMTP_HOST, port: SMTP_PORT, user: SMTP_USER };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
