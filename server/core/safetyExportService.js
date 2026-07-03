/**
 * Safety Export Service
 * Tạo file Excel (.xlsx) báo cáo an toàn đa sheet dùng exceljs.
 */
import ExcelJS from "exceljs";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 90) return "FF16a34a";
  if (score >= 75) return "FFca8a04";
  if (score >= 60) return "FFea580c";
  return "FFdc2626";
}

function levelLabel(score) {
  if (score >= 90) return "Xuất sắc";
  if (score >= 75) return "Tốt";
  if (score >= 60) return "Đạt";
  return "Chưa đạt";
}

function headerStyle(bg = "FF1565c0") {
  return {
    font: { bold: true, color: { argb: "FFFFFFFF" }, size: 11 },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: bg } },
    alignment: { horizontal: "center", vertical: "middle", wrapText: true },
    border: {
      top:    { style: "thin", color: { argb: "FFc7d2fe" } },
      bottom: { style: "thin", color: { argb: "FFc7d2fe" } },
      left:   { style: "thin", color: { argb: "FFc7d2fe" } },
      right:  { style: "thin", color: { argb: "FFc7d2fe" } },
    },
  };
}

function cellBorder() {
  return {
    top:    { style: "thin", color: { argb: "FFe2e8f0" } },
    bottom: { style: "thin", color: { argb: "FFe2e8f0" } },
    left:   { style: "thin", color: { argb: "FFe2e8f0" } },
    right:  { style: "thin", color: { argb: "FFe2e8f0" } },
  };
}

function applyRow(row, data, formats = {}) {
  row.values = data;
  row.eachCell((cell) => {
    cell.border = cellBorder();
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  Object.entries(formats).forEach(([colIdx, fmt]) => {
    const cell = row.getCell(Number(colIdx));
    Object.assign(cell, fmt);
  });
  row.height = 20;
}

// ─── Sheet 1: Tổng quan điểm công ty ────────────────────────────────────────
function buildOverviewSheet(wb, scoreResult) {
  const ws = wb.addWorksheet("📊 Tổng quan");
  ws.views = [{ showGridLines: false }];

  const { company, period, meta } = scoreResult;

  // Title
  ws.mergeCells("A1:H1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `BÁO CÁO ĐIỂM AN TOÀN THÁNG ${period}`;
  titleCell.font = { bold: true, size: 16, color: { argb: "FF1e3a5f" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFdbeafe" } };
  ws.getRow(1).height = 36;

  ws.mergeCells("A2:H2");
  ws.getCell("A2").value = `Tạo lúc: ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}  |  Công thức: 6S×35% + Daily×25% + PCCC×20% + KYT×10% + Họp AT×5% + Không TN×5%`;
  ws.getCell("A2").font = { italic: true, color: { argb: "FF64748b" }, size: 9 };
  ws.getCell("A2").alignment = { horizontal: "center" };
  ws.getRow(2).height = 16;

  // Company score block
  ws.getRow(4).values = ["", "ĐIỂM TOÀN CÔNG TY", "", "", "MỨC XẾP HẠNG", "", "BỘ PHẬN CÓ DATA", ""];
  ["B4", "E4", "G4"].forEach((addr) => {
    ws.getCell(addr).font = { bold: true, size: 10, color: { argb: "FF475569" } };
    ws.getCell(addr).alignment = { horizontal: "center" };
  });
  ws.getRow(4).height = 18;

  ws.mergeCells("B5:D5"); ws.mergeCells("E5:F5"); ws.mergeCells("G5:H5");
  const scoreCell = ws.getCell("B5");
  scoreCell.value = `${company.total}%`;
  scoreCell.font = { bold: true, size: 28, color: { argb: scoreColor(company.total) } };
  scoreCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell("E5").value = levelLabel(company.total);
  ws.getCell("E5").font = { bold: true, size: 18, color: { argb: scoreColor(company.total) } };
  ws.getCell("E5").alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell("G5").value = `${company.deptsWithData} / ${company.totalDepts}`;
  ws.getCell("G5").font = { bold: true, size: 18, color: { argb: "FF1565c0" } };
  ws.getCell("G5").alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(5).height = 48;

  // Components header
  ws.getRow(7).values = ["", "Trụ cột", "Trọng số", "Điểm (%)", "Mức đánh giá", "Ghi chú"];
  ["B7","C7","D7","E7","F7"].forEach((a) => {
    ws.getCell(a).style = headerStyle("FF1e40af");
  });
  ws.getRow(7).height = 22;

  const components = [
    { key: "sixS",       label: "🧹 6S",                   weight: "35%", note: "Điểm 6S hàng tháng theo kiểm tra định kỳ" },
    { key: "daily",      label: "📋 Checklist Daily",       weight: "25%", note: "Tỷ lệ hoàn thành checklist hàng ngày" },
    { key: "pccc",       label: "🔥 PCCC & An toàn điện",  weight: "20%", note: "Kiểm tra PCCC và điện hàng ngày" },
    { key: "kyt",        label: "🎯 Đào tạo KYT",          weight: "10%", note: "Tỷ lệ hoàn thành KYT trong tháng" },
    { key: "meeting",    label: "🤝 Họp an toàn",           weight: "5%",  note: meta.meetingHeld ? "Đã tổ chức họp tháng này" : "Chưa tổ chức họp tháng này" },
    { key: "noBadEvent", label: "✅ Không có sự cố",       weight: "5%",  note: `Sự cố nghiêm trọng trong tháng: ${meta.monthIncidentCount}` },
  ];

  components.forEach((c, i) => {
    const row = ws.getRow(8 + i);
    const val = company.components[c.key];
    row.values = ["", c.label, c.weight, `${val}%`, levelLabel(val), c.note];
    row.getCell(2).font = { bold: true };
    row.getCell(3).alignment = { horizontal: "center" };
    row.getCell(4).font = { bold: true, color: { argb: scoreColor(val) } };
    row.getCell(4).alignment = { horizontal: "center" };
    row.getCell(5).font = { color: { argb: scoreColor(val) } };
    row.eachCell((cell) => { cell.border = cellBorder(); cell.alignment = { ...cell.alignment, vertical: "middle" }; });
    const bg = i % 2 === 0 ? "FFf8fafc" : "FFffffff";
    row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } }; });
    row.height = 20;
  });

  ws.columns = [
    { width: 2 }, { width: 26 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 44 }, { width: 12 }, { width: 12 },
  ];
}

// ─── Sheet 2: Xếp hạng bộ phận ──────────────────────────────────────────────
function buildDeptSheet(wb, scoreResult) {
  const ws = wb.addWorksheet("🏆 Xếp hạng bộ phận");
  ws.views = [{ showGridLines: false }];

  ws.mergeCells("A1:J1");
  const title = ws.getCell("A1");
  title.value = `XẾP HẠNG AN TOÀN BỘ PHẬN – THÁNG ${scoreResult.period}`;
  title.font = { bold: true, size: 14, color: { argb: "FF1e3a5f" } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFdbeafe" } };
  ws.getRow(1).height = 30;

  const headers = ["Hạng", "Bộ phận", "Điểm", "Mức", "6S (35%)", "Daily (25%)", "PCCC (20%)", "KYT (10%)", "Họp AT (5%)", "Không TN (5%)"];
  const hRow = ws.getRow(3);
  hRow.values = headers;
  hRow.eachCell((cell) => { cell.style = headerStyle(); });
  hRow.height = 22;
  ws.getRow(3).getCell(1).style = headerStyle("FF0f172a");

  const sorted = [...scoreResult.departments].sort((a, b) => b.total - a.total);
  sorted.forEach((d, i) => {
    const row = ws.getRow(4 + i);
    const c = d.components;
    row.values = [
      i + 1, d.dept, `${d.total}%`, levelLabel(d.total),
      `${c.sixS}%`, `${c.daily}%`, `${c.pccc}%`, `${c.kyt}%`, `${c.meeting}%`, `${c.noBadEvent}%`,
    ];
    const bg = i % 2 === 0 ? "FFf8fafc" : "FFffffff";
    row.eachCell((cell) => {
      cell.border = cellBorder();
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    });
    row.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
    row.getCell(2).font = { bold: true };
    row.getCell(3).font = { bold: true, color: { argb: scoreColor(d.total) } };
    row.getCell(4).font = { color: { argb: scoreColor(d.total) } };
    if (!d.hasRealData) {
      row.getCell(3).font = { ...row.getCell(3).font, italic: true };
      row.getCell(4).value = "(dự phòng)";
    }
    row.height = 19;
  });

  ws.columns = [
    { width: 6 }, { width: 10 }, { width: 9 }, { width: 12 },
    { width: 10 }, { width: 11 }, { width: 11 }, { width: 10 }, { width: 10 }, { width: 12 },
  ];

  // Freeze header
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 3, showGridLines: false }];
}

// ─── Sheet 3: Cảnh báo ──────────────────────────────────────────────────────
function buildWarningsSheet(wb, warnings, period) {
  const ws = wb.addWorksheet("⚠️ Cảnh báo");
  ws.views = [{ showGridLines: false }];

  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = `DANH SÁCH CẢNH BÁO AN TOÀN – THÁNG ${period}`;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1e3a5f" } };
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFfef9c3" } };
  ws.getRow(1).height = 28;

  ws.getRow(3).values = ["STT", "Mã", "Bộ phận", "Danh mục", "Mức độ", "Trạng thái", "Người phụ trách", "Hạn xử lý"];
  ws.getRow(3).eachCell((cell) => { cell.style = headerStyle("FFb45309"); });
  ws.getRow(3).height = 22;

  const filtered = warnings.filter((w) => {
    if (w.deletedAt) return false;
    const d = String(w.detectedAt || w.createdAt || "").slice(0, 7);
    return !period || d === period;
  });

  filtered.forEach((w, i) => {
    const row = ws.getRow(4 + i);
    const bg = i % 2 === 0 ? "FFfffbeb" : "FFffffff";
    row.values = [
      i + 1,
      w.code || w.id || "",
      w.department || "",
      w.category || "",
      w.riskLevel || w.severity || "",
      w.status || "",
      w.assignedTo || "",
      w.dueDate ? String(w.dueDate).slice(0, 10) : "",
    ];
    row.eachCell((cell) => {
      cell.border = cellBorder();
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    row.height = 19;
  });

  if (!filtered.length) {
    ws.getRow(4).getCell(1).value = "Không có cảnh báo nào trong kỳ này.";
    ws.getRow(4).getCell(1).font = { italic: true, color: { argb: "FF94a3b8" } };
  }

  ws.columns = [
    { width: 5 }, { width: 14 }, { width: 10 }, { width: 20 },
    { width: 14 }, { width: 14 }, { width: 18 }, { width: 14 },
  ];
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 3, showGridLines: false }];
}

// ─── Sheet 4: Sự cố ─────────────────────────────────────────────────────────
function buildIncidentsSheet(wb, incidents, period) {
  const ws = wb.addWorksheet("🚨 Sự cố");
  ws.views = [{ showGridLines: false }];

  ws.mergeCells("A1:G1");
  ws.getCell("A1").value = `DANH SÁCH SỰ CỐ AN TOÀN – THÁNG ${period}`;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1e3a5f" } };
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFfee2e2" } };
  ws.getRow(1).height = 28;

  ws.getRow(3).values = ["STT", "Bộ phận", "Loại sự cố", "Mức độ", "Ngày xảy ra", "Trạng thái", "Mô tả ngắn"];
  ws.getRow(3).eachCell((cell) => { cell.style = headerStyle("FFb91c1c"); });
  ws.getRow(3).height = 22;

  const filtered = incidents.filter((inc) => {
    if (inc.deletedAt) return false;
    const d = String(inc.occurredDate || inc.createdAt || "").slice(0, 7);
    return !period || d === period;
  });

  filtered.forEach((inc, i) => {
    const row = ws.getRow(4 + i);
    const bg = i % 2 === 0 ? "FFfef2f2" : "FFffffff";
    row.values = [
      i + 1,
      inc.department || "",
      inc.incidentType || inc.type || "",
      inc.severity || inc.riskLevel || "",
      inc.occurredDate ? String(inc.occurredDate).slice(0, 10) : "",
      inc.status || "",
      inc.description ? String(inc.description).slice(0, 80) : "",
    ];
    row.eachCell((cell) => {
      cell.border = cellBorder();
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    row.height = 20;
  });

  if (!filtered.length) {
    ws.getRow(4).getCell(1).value = "Không có sự cố nào trong kỳ này.";
    ws.getRow(4).getCell(1).font = { italic: true, color: { argb: "FF94a3b8" } };
  }

  ws.columns = [
    { width: 5 }, { width: 10 }, { width: 20 }, { width: 14 },
    { width: 14 }, { width: 14 }, { width: 40 },
  ];
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 3, showGridLines: false }];
}

// ─── Main export function ────────────────────────────────────────────────────
export async function generateSafetyScoreExcel(scoreResult, opsStore) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MHChub Safety System";
  wb.lastModifiedBy = "MHChub Auto Export";
  wb.created = new Date();
  wb.modified = new Date();

  buildOverviewSheet(wb, scoreResult);
  buildDeptSheet(wb, scoreResult);

  // Fetch raw data for warnings & incidents sheets
  const [warningsRes, incidentsRes] = await Promise.all([
    opsStore.listWarnings({ limit: 2000 }).catch(() => []),
    opsStore.listIncidents({ limit: 2000 }).catch(() => []),
  ]);
  const warnings  = Array.isArray(warningsRes) ? warningsRes : (warningsRes?.items || []);
  const incidents = Array.isArray(incidentsRes) ? incidentsRes : (incidentsRes?.items || []);

  buildWarningsSheet(wb, warnings, scoreResult.period);
  buildIncidentsSheet(wb, incidents, scoreResult.period);

  const buf = await wb.xlsx.writeBuffer();
  return buf;
}

// ─── Dept Report Excel export ────────────────────────────────────────────────
export async function generateDeptReportExcel(reportData, tab, year) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MHChub Safety System";
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet("Báo cáo bộ phận");
  ws.views = [{ showGridLines: false }];

  const scope = tab === "dept" ? `Bộ phận: ${reportData.dept}` : "Toàn công ty";
  ws.mergeCells("A1:G1");
  ws.getCell("A1").value = `BÁO CÁO AN TOÀN ${scope.toUpperCase()} – NĂM ${year}`;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1e3a5f" } };
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFdbeafe" } };
  ws.getRow(1).height = 32;
  ws.getRow(2).getCell(1).value = `Tạo lúc: ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`;
  ws.getRow(2).getCell(1).font = { italic: true, color: { argb: "FF64748b" }, size: 9 };
  ws.getRow(2).height = 14;

  const sections = [];

  if (tab === "dept" && reportData) {
    const d = reportData;
    sections.push(
      { title: "KẾ HOẠCH KIỂM TRA", color: "FF1565c0", rows: [
        ["Chỉ tiêu", "Giá trị"],
        ["Số kế hoạch", d.inspectionPlans?.plansIncluded ?? "—"],
        ["Tổng hạng mục", d.inspectionPlans?.deptRowsTotal ?? "—"],
        ["Đã kiểm tra", d.inspectionPlans?.deptRowsDone ?? "—"],
        ["Tỷ lệ hoàn thành", `${d.inspectionPlans?.pct ?? 0}%`],
        ["CAPA đang mở", d.inspectionPlans?.openCapa ?? "—"],
        ["CAPA nghiêm trọng", d.inspectionPlans?.criticalCapa ?? "—"],
      ]},
      { title: "CẢNH BÁO", color: "FFb45309", rows: [
        ["Chỉ tiêu", "Giá trị"],
        ["Tổng cảnh báo", d.warnings?.total ?? "—"],
        ["Đang mở", d.warnings?.open ?? "—"],
        ["Đã duyệt", d.warnings?.approved ?? "—"],
        ["Mức Cao", d.warnings?.byRiskLevel?.HIGH ?? 0],
        ["Mức Nghiêm trọng", d.warnings?.byRiskLevel?.CRITICAL ?? 0],
      ]},
      { title: "SỰ CỐ", color: "FFb91c1c", rows: [
        ["Chỉ tiêu", "Giá trị"],
        ["Tổng sự cố", d.incidents?.total ?? "—"],
        ["Đang xử lý", d.incidents?.open ?? "—"],
      ]},
      { title: "HỌP AN TOÀN", color: "FF0f766e", rows: [
        ["Chỉ tiêu", "Giá trị"],
        ["Tổng cuộc họp", d.safetyMeetings?.total ?? "—"],
        ["Đã hoàn thành", d.safetyMeetings?.completed ?? "—"],
      ]},
      { title: "KPI", color: "FF7e22ce", rows: [
        ["Chỉ tiêu", "Giá trị"],
        ["Tổng KPI", d.kpiEntries?.total ?? "—"],
        ["Đã duyệt", d.kpiEntries?.approved ?? "—"],
      ]},
    );
  } else if (tab === "company" && reportData) {
    const c = reportData;
    sections.push(
      { title: "KẾ HOẠCH KIỂM TRA", color: "FF1565c0", rows: [
        ["Chỉ tiêu", "Giá trị"],
        ["Tổng kế hoạch", c.inspectionPlans?.total ?? "—"],
        ["Hoàn thành", c.inspectionPlans?.completed ?? "—"],
        ["Tỷ lệ hoàn thành", `${c.inspectionPlans?.pctCompleted ?? 0}%`],
        ["CAPA đang mở", c.inspectionPlans?.openCapa ?? "—"],
      ]},
      { title: "HỌP AN TOÀN", color: "FF0f766e", rows: [
        ["Chỉ tiêu", "Giá trị"],
        ["Tổng cuộc họp", c.safetyMeetings?.total ?? "—"],
        ["Hoàn thành", c.safetyMeetings?.completed ?? "—"],
        ["Tỷ lệ", `${c.safetyMeetings?.pctCompleted ?? 0}%`],
        ["Hành động đang mở", c.safetyMeetings?.openActions ?? "—"],
      ]},
      { title: "CẢNH BÁO", color: "FFb45309", rows: [
        ["Chỉ tiêu", "Giá trị"],
        ["Tổng cảnh báo", c.warnings?.total ?? "—"],
        ["Đang mở", c.warnings?.open ?? "—"],
      ]},
      { title: "SỰ CỐ", color: "FFb91c1c", rows: [
        ["Chỉ tiêu", "Giá trị"],
        ["Tổng sự cố", c.incidents?.total ?? "—"],
        ["Đang xử lý", c.incidents?.open ?? "—"],
      ]},
      { title: "ĐÀO TẠO", color: "FF0369a1", rows: [
        ["Chỉ tiêu", "Giá trị"],
        ["Tổng khóa", c.training?.total ?? "—"],
        ["Hoàn thành", c.training?.completed ?? "—"],
      ]},
    );
  }

  let rowOffset = 4;
  sections.forEach((sec) => {
    // Section title
    ws.mergeCells(`A${rowOffset}:G${rowOffset}`);
    const secCell = ws.getCell(`A${rowOffset}`);
    secCell.value = sec.title;
    secCell.font = { bold: true, size: 11, color: { argb: "FFffffff" } };
    secCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: sec.color } };
    secCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    ws.getRow(rowOffset).height = 22;
    rowOffset++;

    sec.rows.forEach((rowData, ri) => {
      const row = ws.getRow(rowOffset);
      row.getCell(1).value = rowData[0];
      row.getCell(2).value = rowData[1];
      const bg = ri === 0 ? "FFe2e8f0" : (ri % 2 === 1 ? "FFf8fafc" : "FFffffff");
      row.getCell(1).font = { bold: ri === 0 };
      row.getCell(2).font = { bold: ri === 0 };
      [1, 2].forEach((c) => {
        const cell = row.getCell(c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        cell.border = cellBorder();
        cell.alignment = { vertical: "middle" };
      });
      row.height = 19;
      rowOffset++;
    });
    rowOffset++; // gap
  });

  ws.columns = [{ width: 28 }, { width: 18 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }];
  const buf = await wb.xlsx.writeBuffer();
  return buf;
}
