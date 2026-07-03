/**
 * Safety Score Engine
 * Tính điểm an toàn tổng hợp theo công thức MapLogic §5.1:
 *
 *   Score = 6S×0.35 + Daily×0.25 + PCCC×0.20 + KYT×0.10 + Meeting×0.05 + NoBadEvent×0.05
 *
 * Tất cả thành phần trả về giá trị 0–100 trước khi nhân trọng số.
 */

const WEIGHTS = {
  sixS:       0.35,
  daily:      0.25,
  pccc:       0.20,
  kyt:        0.10,
  meeting:    0.05,
  noBadEvent: 0.05,
};

const ALL_DEPARTMENTS = [
  "PE1","MP","MT","CM","WM","QA","GA","QC","CS","EHS",
  "OS","MR","RF","DB","DP1","DP2","OK1","OK2","SP1","EBM","ETR","MS1","SA","MS2",
];

function scoreLevel(score) {
  if (score >= 90) return { label: "Xuất sắc", tier: "excellent", color: "#16a34a" };
  if (score >= 75) return { label: "Tốt",      tier: "good",      color: "#ca8a04" };
  if (score >= 60) return { label: "Đạt",      tier: "average",   color: "#ea580c" };
  return             { label: "Chưa đạt",       tier: "poor",      color: "#dc2626" };
}

function extractItems(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.items)) return result.items;
  return [];
}

function clamp100(v) {
  const n = Number(v) || 0;
  return Math.max(0, Math.min(100, n));
}

function periodToMonth(period) {
  return String(period || "").slice(0, 7);
}

export async function computeSafetyScores(period, opsStore) {
  const month = periodToMonth(period);

  const [
    warningsResult,
    incidentsResult,
    kpiResult,
    trainingResult,
    meetingsResult,
    checklistSummary,
  ] = await Promise.all([
    opsStore.listWarnings({ limit: 5000 }).catch(() => []),
    opsStore.listIncidents({ limit: 5000 }).catch(() => []),
    opsStore.listKpiEntries({ limit: 5000 }).catch(() => []),
    opsStore.listTrainingCourses({ limit: 5000 }).catch(() => []),
    opsStore.listSafetyMeetings({ period: month }).catch(() => ({ items: [] })),
    opsStore.checklistSummary({ period: month }).catch(() => []),
  ]);

  const warnings    = extractItems(warningsResult);
  const incidents   = extractItems(incidentsResult);
  const kpiEntries  = extractItems(kpiResult);
  const training    = extractItems(trainingResult);
  const meetings    = extractItems(meetingsResult);
  const checklists  = Array.isArray(checklistSummary) ? checklistSummary : [];

  const HIGH_SEV = new Set(["critical","high","CRITICAL","HIGH","Nghiêm trọng","Cao"]);

  const monthIncidents = incidents.filter((inc) => {
    const d = String(inc.occurredDate || inc.createdAt || "").slice(0, 7);
    return d === month && !inc.deletedAt;
  });

  const monthMeetingHeld = meetings.some(
    (m) => m.type === "monthly" && (m.status === "completed" || m.status === "done")
  );

  const kytMonth = training.filter((t) => {
    if (String(t.category || "").toUpperCase() !== "KYT") return false;
    const d = String(t.dueDate || t.createdAt || "").slice(0, 7);
    return d === month && !t.deletedAt;
  });

  const kytCompanyScore = kytMonth.length === 0
    ? 100
    : clamp100(
        (kytMonth.reduce((s, t) => s + Number(t.completed || 0), 0) /
         Math.max(1, kytMonth.reduce((s, t) => s + Number(t.enrolled || 1), 0))) * 100
      );

  const checklistByDept = new Map(checklists.map((c) => [c.departmentCode, c.score || 0]));

  const kpiByDeptType = new Map();
  for (const entry of kpiEntries) {
    if (entry.deletedAt) continue;
    const entryMonth = periodToMonth(entry.period);
    if (entryMonth !== month) continue;
    const dept = String(entry.departmentCode || entry.department || entry.submittedByDept || "");
    const type = String(entry.entryType || "");
    const key  = `${dept}::${type}`;
    const prev = kpiByDeptType.get(key);
    if (!prev || (entry.period > prev.period)) {
      kpiByDeptType.set(key, entry);
    }
  }

  function getKpi(dept, type) {
    return kpiByDeptType.get(`${dept}::${type}`);
  }

  function sixSScoreForDept(dept) {
    const official = getKpi(dept, "safety_score_6s_official") || getKpi(dept, "safety_score_monthly");
    if (official) {
      const val = Number(official.value || 0);
      return val > 1 ? clamp100(val) : clamp100(val * 100);
    }
    return null;
  }

  function dailyScoreForDept(dept) {
    const kpiDaily = getKpi(dept, "checklist_daily") || getKpi(dept, "checklist_daily_safety");
    if (kpiDaily) return clamp100(Number(kpiDaily.value || 0));
    const cl = checklistByDept.get(dept);
    return cl != null ? clamp100(cl) : null;
  }

  function pcccScoreForDept(dept) {
    const kpiPccc = getKpi(dept, "checklist_daily_pccc") || getKpi(dept, "checklist_pccc");
    if (kpiPccc) return clamp100(Number(kpiPccc.value || 0));
    return null;
  }

  function hasBadEvent(dept) {
    return monthIncidents.some(
      (inc) => String(inc.department || "").toUpperCase() === dept.toUpperCase()
            && HIGH_SEV.has(inc.severity || inc.riskLevel || "")
    );
  }

  const deptResults = ALL_DEPARTMENTS.map((dept) => {
    const raw6S   = sixSScoreForDept(dept);
    const rawDly  = dailyScoreForDept(dept);
    const rawPccc = pcccScoreForDept(dept);

    const sixS       = raw6S   != null ? raw6S   : 80;
    const daily      = rawDly  != null ? rawDly  : 85;
    const pccc       = rawPccc != null ? rawPccc : daily;
    const kyt        = kytCompanyScore;
    const meeting    = monthMeetingHeld ? 100 : 0;
    const noBadEvent = hasBadEvent(dept) ? 0 : 100;

    const hasRealData = raw6S != null || rawDly != null;

    const total = Math.round(
      sixS  * WEIGHTS.sixS  +
      daily * WEIGHTS.daily +
      pccc  * WEIGHTS.pccc  +
      kyt   * WEIGHTS.kyt   +
      meeting    * WEIGHTS.meeting    +
      noBadEvent * WEIGHTS.noBadEvent
    );

    return {
      dept,
      total: clamp100(total),
      components: { sixS, daily, pccc, kyt, meeting, noBadEvent },
      level: scoreLevel(clamp100(total)),
      hasRealData,
    };
  });

  const realDepts = deptResults.filter((d) => d.hasRealData);
  const companyTotal = realDepts.length
    ? Math.round(realDepts.reduce((s, d) => s + d.total, 0) / realDepts.length)
    : 0;

  const companyComponents = {
    sixS:       Math.round(deptResults.reduce((s,d) => s + d.components.sixS,  0) / deptResults.length),
    daily:      Math.round(deptResults.reduce((s,d) => s + d.components.daily, 0) / deptResults.length),
    pccc:       Math.round(deptResults.reduce((s,d) => s + d.components.pccc,  0) / deptResults.length),
    kyt:        kytCompanyScore,
    meeting:    monthMeetingHeld ? 100 : 0,
    noBadEvent: Math.round(deptResults.reduce((s,d) => s + d.components.noBadEvent, 0) / deptResults.length),
  };

  return {
    period: month,
    computedAt: new Date().toISOString(),
    company: {
      total: clamp100(companyTotal),
      level: scoreLevel(clamp100(companyTotal)),
      components: companyComponents,
      deptsWithData: realDepts.length,
      totalDepts: ALL_DEPARTMENTS.length,
    },
    departments: deptResults.sort((a, b) => b.total - a.total),
    meta: {
      weights: WEIGHTS,
      meetingHeld: monthMeetingHeld,
      kytScore: kytCompanyScore,
      monthIncidentCount: monthIncidents.length,
    },
  };
}
