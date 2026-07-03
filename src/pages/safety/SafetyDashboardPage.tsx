import { AlertTriangle, BarChart3, Building2, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download, FileBarChart, FileText, Loader2, Minus, ShieldAlert, TrendingDown, TrendingUp, X } from "lucide-react";
import "./safety-dashboard.css";
import { useCallback, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import type { HubDepartment, HubModel } from "../../core/hubCore";
import { useHubLanguage } from "../../i18n-context";
import { localizedText } from "../../i18n-localized";
import { apiFetch, apiFetchArray, currentMonth } from "./safety-api";
import { ErrorPanel, LoadingPanel } from "./safety-shared";
import type { SafetyUser } from "./safety-domain";
import { SafetyI18nRender } from "./safety-i18n-render";
type Warning = {
    id: string;
    code: string;
    title: string;
    titleI18n?: Record<string, string | undefined>;
    category: string;
    subcategory?: string | null;
    department: string;
    area?: string | null;
    areaI18n?: Record<string, string | undefined>;
    riskProbability?: number;
    riskConsequence?: number;
    riskScore: number;
    riskLevel: string;
    status: string;
    approvalStatus: string;
    deadline?: string;
    description?: string;
    descriptionI18n?: Record<string, string | undefined>;
    currentControl?: string;
    currentControlI18n?: Record<string, string | undefined>;
    responsiblePerson?: string;
    proposedAction?: string;
    proposedActionI18n?: Record<string, string | undefined>;
    evidenceNotes?: string;
    evidenceNotesI18n?: Record<string, string | undefined>;
    relatedStandard?: string;
    relatedStandardI18n?: Record<string, string | undefined>;
    reporterName?: string;
    rejectionReason?: string | null;
    submittedByDept?: string;
    submittedById?: string;
    submittedByName?: string;
    createdByName?: string;
    updatedByName?: string;
    createdAt?: string;
};
type Incident = {
    id: string;
    code: string;
    type: string;
    severity: string;
    status: string;
    department: string;
    area?: string;
    areaI18n?: Record<string, string | undefined>;
    description: string;
    descriptionI18n?: Record<string, string | undefined>;
    occurredDate?: string;
    occurredTime?: string;
    reporterPhone?: string;
    handlerName?: string;
    witnesses?: string;
    bodyPartsAffected?: string[];
    firstAidGiven?: boolean;
    rootCauseCategory?: string;
    rootCauseDetail?: string;
    immediateAction?: string;
    correctiveAction?: string;
    preventiveAction?: string;
    estimatedCost?: number | null;
    createdAt?: string;
    approvalStatus: string;
    rejectionReason?: string | null;
    submittedByDept?: string;
    submittedById?: string;
    reporterName?: string;
    submittedByName?: string;
    createdByName?: string;
    updatedByName?: string;
};
type KpiEntry = {
    id: string;
    code: string;
    entryType: string;
    periodType: string;
    period: string;
    departmentCode: string;
    department?: string;
    value: string;
    target: string | null;
    unit?: string;
    notes?: string | null;
    submittedByDept?: string;
    submittedByName?: string;
    createdAt?: string;
    approvalStatus: string;
};
type AutoScoreDept = {
    dept: string; total: number; hasRealData: boolean;
    components: { sixS: number; daily: number; pccc: number; kyt: number; meeting: number; noBadEvent: number };
    level: { label: string; tier: string; color: string };
};
type AutoScoreResult = {
    period: string; computedAt: string;
    company: { total: number; deptsWithData: number; totalDepts: number; level: { label: string; tier: string; color: string }; components: AutoScoreDept['components'] };
    departments: AutoScoreDept[];
    meta: { weights: Record<string, number>; meetingHeld: boolean; kytScore: number; monthIncidentCount: number };
};
const contentText = (record: Record<string, unknown>, key: string, lang: string, fallback = "") =>
    localizedText(record[`${key}I18n`] as Record<string, string | undefined> | undefined, lang, String(record[key] || fallback));
const currentGreeting = () => {
    const hour = Number(new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        hour12: false,
        timeZone: "Asia/Ho_Chi_Minh"
    }).format(new Date())) % 24;
    if (hour < 11)
        return "Chào buổi sáng";
    if (hour < 13)
        return "Chào buổi trưa";
    if (hour < 18)
        return "Chào buổi chiều";
    return "Chào buổi tối";
};
const SAFETY_DEPARTMENTS = [
    "PE1",
    "MP",
    "MT",
    "CM",
    "WM",
    "QA",
    "GA",
    "QC",
    "CS",
    "EHS",
    "OS",
    "MR",
    "RF",
    "DB",
    "DP1",
    "DP2",
    "OK1",
    "OK2",
    "SP1",
    "EBM",
    "ETR",
    "MS1",
    "SA",
    "MS2"
];
function useSafetyCollections() {
    const warnings = useQuery({
        queryKey: ["safety", "warnings"],
        queryFn: () => apiFetchArray<Warning>("/api/warnings")
    });
    const incidents = useQuery({
        queryKey: ["safety", "incidents"],
        queryFn: () => apiFetchArray<Incident>("/api/incidents")
    });
    const kpis = useQuery({
        queryKey: ["safety", "kpi"],
        queryFn: () => apiFetchArray<KpiEntry>("/api/kpi-entries")
    });
    return { warnings, incidents, kpis };
}
function SafetyStatCard({ icon: Icon, label, tone = "good", value }: {
    icon: ComponentType<{ className?: string }>;
    label: string;
    tone?: string;
    value: string | number;
}) {
    const toneClass = tone === "alert"
        ? "border-red-200 bg-red-50 text-red-950"
        : tone === "watch"
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : "border-emerald-200 bg-emerald-50 text-emerald-950";
    return (<article className={`rounded-lg border p-4 shadow-sm ${toneClass}`}>
      <div className="flex items-center justify-between">
        <span className="rounded-md bg-white/70 p-2">
          <Icon className="size-5"/>
        </span>
        <strong className="text-3xl leading-none">{value}</strong>
      </div>
      <p className="mt-3 text-sm font-semibold">{label}</p>
    </article>);
}
type SixSRingItem = {
    letter: string;
    name: string;
    percentage: number;
    color: string;
    status: string;
    pillColor: string;
};
type DeptScore = {
    dept: string;
    score: number;
    color: string;
};
type DeptScoreSet = {
    all: DeptScore[];
    top: DeptScore[];
    bottom: DeptScore[];
};
type TrendPoint = {
    month: string;
    score: number;
    target: number;
};
type CountPoint = {
    label: string;
    warnings: number;
    incidents: number;
};
const DEFAULT_SIXS_RINGS: SixSRingItem[] = [
    { letter: "S1", name: "Sàng lọc", percentage: 90, color: "#1565c0", status: "Tốt", pillColor: "#22a050" },
    { letter: "S2", name: "Sắp xếp", percentage: 84, color: "#00a99d", status: "Tốt", pillColor: "#22a050" },
    { letter: "S3", name: "Sạch sẽ", percentage: 85, color: "#22a050", status: "Tốt", pillColor: "#22a050" },
    { letter: "S4", name: "Săn sóc", percentage: 68, color: "#f9a825", status: "Cần cải thiện", pillColor: "#f9a825" },
    { letter: "S5", name: "Sẵn sàng", percentage: 44, color: "#e53935", status: "Yếu - ưu tiên", pillColor: "#e53935" },
    { letter: "S6", name: "An toàn", percentage: 75, color: "#f4511e", status: "Cần cải thiện", pillColor: "#f9a825" }
];
const FALLBACK_TREND: TrendPoint[] = [
    { month: "T1", score: 85, target: 90 },
    { month: "T2", score: 87, target: 90 },
    { month: "T3", score: 88, target: 90 },
    { month: "T4", score: 91, target: 92 },
    { month: "T5", score: 93, target: 92 },
    { month: "T6", score: 96, target: 95 }
];
const INCIDENT_COLORS = ["#e53935", "#f9a825", "#f4511e", "#1565c0", "#00a99d", "#9c27b0", "#22a050"];
const SAFETY_SCORE_TARGET = 95;
const SAFETY_RANKING_PAGE_SIZE = 5;
const LIVE_PANEL_PAGE_SIZE = 5;
const RECENT_ACTIVITY_LIMIT = 8;
const DEPARTMENT_DISPLAY_CODES: Record<string, string> = {
    company: "ALL",
    ehs: "EHS",
    engineering: "MR",
    office: "ADM",
    production: "PE1",
    quality: "QA",
    warehouse: "WH"
};
const approvedKpi = (item: KpiEntry) => item.approvalStatus === "approved" || item.approvalStatus === "APPROVED";
const scoreColor = (score: number) => (score >= 95 ? "#22a050" : score >= 85 ? "#00a99d" : score >= 75 ? "#f9a825" : "#e53935");
const riskColor = (level = "") => level.includes("Cực") || level.includes("Nghiêm") ? "#e53935" : level.includes("Trung") ? "#f9a825" : "#22a050";
const displayDeptCode = (department = "") => {
    const normalized = department.trim().toLowerCase();
    return DEPARTMENT_DISPLAY_CODES[normalized] || department.trim().toUpperCase() || "EHS";
};
const COMPANY_LEVEL_DEPARTMENT_CODES = new Set(["", "ALL", "COMPANY", "MHC", "TOTAL", "TONG", "TỔNG"]);
const SAFETY_RANKING_FALLBACK_SCORES: DeptScore[] = [
    { dept: "EHS", score: 96, color: scoreColor(96) },
    { dept: "MR", score: 92, color: scoreColor(92) },
    { dept: "PE1", score: 87, color: scoreColor(87) },
    { dept: "ETR", score: 76, color: scoreColor(76) },
    { dept: "OK1", score: 76, color: scoreColor(76) },
    { dept: "QA", score: 74, color: scoreColor(74) },
    { dept: "GA", score: 73, color: scoreColor(73) },
    { dept: "QC", score: 72, color: scoreColor(72) },
    { dept: "CS", score: 71, color: scoreColor(71) },
    { dept: "OS", score: 70, color: scoreColor(70) },
    { dept: "MP", score: 69, color: scoreColor(69) },
    { dept: "MT", score: 68, color: scoreColor(68) },
    { dept: "CM", score: 67, color: scoreColor(67) },
    { dept: "WM", score: 66, color: scoreColor(66) },
    { dept: "RF", score: 65, color: scoreColor(65) },
    { dept: "DB", score: 64, color: scoreColor(64) },
    { dept: "DP1", score: 63, color: scoreColor(63) },
    { dept: "DP2", score: 62, color: scoreColor(62) },
    { dept: "OK2", score: 61, color: scoreColor(61) },
    { dept: "SP1", score: 60, color: scoreColor(60) },
    { dept: "EBM", score: 59, color: scoreColor(59) },
    { dept: "MS1", score: 58, color: scoreColor(58) },
    { dept: "SA", score: 57, color: scoreColor(57) },
    { dept: "MS2", score: 56, color: scoreColor(56) }
];
const SAFETY_DIVISION_PERFORMANCE_CARDS = [
    {
        code: "PED",
        name: "Khối PED",
        departments: ["PE1", "MP", "MT", "CM", "WM"],
        score: 84,
        incidents: 3,
        checklist: 81,
        daysSafe: 95,
        color: "#f9a825",
        accent: "#1565c0",
        chipBg: "#e8f1ff",
        chipText: "#1565c0"
    },
    {
        code: "QAD",
        name: "Khối QAD",
        departments: ["QA", "GA", "QC", "CS", "EHS", "OS"],
        score: 91,
        incidents: 0,
        checklist: 90,
        daysSafe: 162,
        color: "#22a050",
        accent: "#9c27b0",
        chipBg: "#f4e6fb",
        chipText: "#9c27b0"
    },
    {
        code: "DD",
        name: "Khối DD",
        departments: ["MR", "RF", "DB", "DP1", "DP2"],
        score: 81,
        incidents: 3,
        checklist: 79,
        daysSafe: 88,
        color: "#f9a825",
        accent: "#00a99d",
        chipBg: "#e3fbf6",
        chipText: "#00877e"
    },
    {
        code: "SD",
        name: "Khối SD",
        departments: ["OK1", "OK2", "SP1"],
        score: 89,
        incidents: 1,
        checklist: 88,
        daysSafe: 131,
        color: "#f9a825",
        accent: "#22a050",
        chipBg: "#e8f8ef",
        chipText: "#168242"
    },
    {
        code: "ED",
        name: "Khối ED",
        departments: ["EBM", "ETR", "MS1", "SA", "MS2"],
        score: 90,
        incidents: 1,
        checklist: 89,
        daysSafe: 147,
        color: "#22a050",
        accent: "#f4511e",
        chipBg: "#ffeee8",
        chipText: "#f4511e"
    }
] as const;
const SAFETY_REFERENCE_DEPARTMENT_CODES = new Set<string>(SAFETY_DIVISION_PERFORMANCE_CARDS.flatMap((division) => [...division.departments]));
const parseDateOnly = (value = "") => {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match)
        return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};
const formatDateChip = (value = "") => {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : "Chưa có hạn";
};
const isOverdueDate = (value = "") => {
    const date = parseDateOnly(value);
    if (!date)
        return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
};
const formatRelativeTime = (value = "") => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return "vừa cập nhật";
    const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (minutes < 1)
        return "vừa cập nhật";
    if (minutes < 60)
        return `${minutes} phút trước`;
    const hours = Math.round(minutes / 60);
    if (hours < 48)
        return `${hours} giờ trước`;
    const days = Math.round(hours / 24);
    if (days < 31)
        return `${days} ngày trước`;
    return `${Math.round(days / 30)} tháng trước`;
};
const pageCountFor = (length: number) => Math.max(1, Math.ceil(length / LIVE_PANEL_PAGE_SIZE));
const pageRangeLabel = (page: number, length: number, unit: string) => {
    if (!length)
        return `0–0 / 0 ${unit}`;
    const start = (page - 1) * LIVE_PANEL_PAGE_SIZE + 1;
    const end = Math.min(length, page * LIVE_PANEL_PAGE_SIZE);
    return `${start}–${end} / ${length} ${unit}`;
};
function buildSafetyTrend(entries: KpiEntry[]): TrendPoint[] {
    const approved = entries.filter((item) => approvedKpi(item) && item.entryType === "safety_score_monthly");
    if (!approved.length)
        return FALLBACK_TREND;
    const byPeriod = new Map<string, {
        count: number;
        hasAggregate: boolean;
        sum: number;
        target: number;
    }>();
    approved.forEach((item) => {
        const deptCode = displayDeptCode(item.departmentCode || item.department || item.submittedByDept || "");
        const isAggregate = COMPANY_LEVEL_DEPARTMENT_CODES.has(deptCode);
        const current = byPeriod.get(item.period) || { sum: 0, count: 0, target: 90, hasAggregate: false };
        if (current.hasAggregate && !isAggregate)
            return;
        if (isAggregate) {
            current.sum = Number(item.value || 0);
            current.count = 1;
            current.hasAggregate = true;
        }
        else {
            current.sum += Number(item.value || 0);
            current.count += 1;
        }
        if (item.target)
            current.target = Number(item.target || 90);
        byPeriod.set(item.period, current);
    });
    return Array.from(byPeriod.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(-6)
        .map(([period, value]) => {
        const month = Number(period.split("-")[1] || period);
        return {
            month: Number.isFinite(month) ? `T${month}` : period,
            score: Math.round(value.sum / value.count),
            target: value.target
        };
    });
}
function buildDeptScores(entries: KpiEntry[]): DeptScoreSet {
    const latest = new Map<string, KpiEntry>();
    entries
        .filter((item) => approvedKpi(item) && item.entryType === "safety_score_monthly")
        .forEach((item) => {
        const deptCode = displayDeptCode(item.departmentCode || item.department || item.submittedByDept || "");
        if (COMPANY_LEVEL_DEPARTMENT_CODES.has(deptCode))
            return;
        if (!SAFETY_REFERENCE_DEPARTMENT_CODES.has(deptCode))
            return;
        const current = latest.get(deptCode);
        if (!current || item.period > current.period)
            latest.set(deptCode, item);
    });
    const realScoreMap = new Map(Array.from(latest.entries()).map(([dept, entry]) => {
        const score = Math.round(Number(entry.value || 0));
        return [dept, { dept, score, color: scoreColor(score) }] as const;
    }));
    const fallbackScores = SAFETY_RANKING_FALLBACK_SCORES.map((fallback) => realScoreMap.get(fallback.dept) || fallback);
    const sorted = [...fallbackScores].sort((left, right) => right.score - left.score);
    return { all: sorted, top: sorted, bottom: [...sorted].reverse() };
}
function buildCountTrend(warnings: Warning[], incidents: Incident[]): CountPoint[] {
    const buckets = new Map<string, {
        warnings: number;
        incidents: number;
    }>();
    const touch = (period: string) => {
        if (!buckets.has(period))
            buckets.set(period, { warnings: 0, incidents: 0 });
        return buckets.get(period)!;
    };
    warnings.forEach((item) => {
        const period = (item.createdAt || item.deadline || "").slice(0, 7);
        if (period)
            touch(period).warnings += 1;
    });
    incidents.forEach((item) => {
        const period = (item.occurredDate || item.createdAt || "").slice(0, 7);
        if (period)
            touch(period).incidents += 1;
    });
    const points = Array.from(buckets.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(-8)
        .map(([period, value]) => ({ label: `T${Number(period.split("-")[1] || 0) || period}`, ...value }));
    return points.length
        ? points
        : [
            { label: "T1", warnings: 12, incidents: 5 },
            { label: "T2", warnings: 15, incidents: 7 },
            { label: "T3", warnings: 9, incidents: 4 },
            { label: "T4", warnings: 11, incidents: 6 },
            { label: "T5", warnings: 7, incidents: 4 },
            { label: "T6", warnings: 4, incidents: 2 }
        ];
}
function buildIncidentTypes(incidents: Incident[]) {
    const counts = new Map<string, number>();
    incidents.forEach((item) => counts.set(item.type || "Khác", (counts.get(item.type || "Khác") || 0) + 1));
    const rows = Array.from(counts.entries())
        .sort((left, right) => right[1] - left[1])
        .map(([name, value], index) => ({ name, value, color: INCIDENT_COLORS[index % INCIDENT_COLORS.length] }));
    return rows.length ? rows : [{ name: "Chưa có dữ liệu", value: 1, color: "#cbd5e1" }];
}
function MiniSparkline({ color, data }: {
    color: string;
    data: number[];
}) {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const width = 72;
    const height = 32;
    const points = data
        .map((value, index) => {
        const x = (index / Math.max(1, data.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
    })
        .join(" ");
    return (<svg aria-hidden="true" className="h-8 w-[72px] overflow-visible" viewBox={`0 0 ${width} ${height}`}>
      <polyline fill="none" points={points} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
    </svg>);
}
function SafetyKpiCard({ color, icon, label, sparkData, sub, trend, value }: {
    color: string;
    icon: string;
    label: string;
    sparkData?: number[];
    sub: string;
    trend: "up" | "down" | "flat";
    value: string;
}) {
    const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
    const trendColor = trend === "up" ? "#22a050" : trend === "down" ? "#e53935" : "#64748b";
    return (<article className="relative min-h-[126px] overflow-hidden rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }}/>
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex size-6 shrink-0 items-center justify-center text-[18px] leading-none" aria-hidden="true">
          {icon}
        </span>
        <span className="min-w-0 text-[12px] font-semibold leading-none text-[#2f684f] sm:text-[13px]">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <strong className="font-mono text-[28px] font-bold leading-none tracking-normal sm:text-[30px]" style={{ color }}>
            {value}
          </strong>
          <span className="mt-1.5 block text-[12px] font-medium leading-snug text-[#3f684f]">{sub}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          {sparkData?.length ? <MiniSparkline color={color} data={sparkData}/> : null}
          <TrendIcon className="size-4" style={{ color: trendColor }}/>
        </div>
      </div>
    </article>);
}
function SixSRing({ color, letter, name, percentage, pillColor, status }: SixSRingItem) {
    const radius = 21;
    const circumference = 2 * Math.PI * radius;
    const dashoffset = circumference * (1 - percentage / 100);
    return (<div className="relative flex min-h-[150px] flex-col items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }}/>
      <span className="text-xs font-bold text-slate-500">{letter}</span>
      <strong className="mb-3 mt-1 text-sm text-slate-950">{name}</strong>
      <div className="relative mb-3 size-16">
        <svg className="size-full -rotate-90" viewBox="0 0 48 48">
          <circle className="text-slate-100" cx="24" cy="24" fill="none" r={radius} stroke="currentColor" strokeWidth="5"/>
          <circle cx="24" cy="24" fill="none" r={radius} stroke={color} strokeDasharray={circumference} strokeDashoffset={dashoffset} strokeLinecap="round" strokeWidth="5"/>
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-bold text-slate-950">{percentage}%</span>
      </div>
      <span className="w-full truncate rounded-full px-2 py-1 text-center text-[10px] font-bold text-white" style={{ backgroundColor: pillColor }}>
        {status}
      </span>
    </div>);
}
function SafetyPanel({ action, children, subtitle, title, titleIcon }: {
    action?: ReactNode;
    children: ReactNode;
    subtitle?: ReactNode;
    title: ReactNode;
    titleIcon?: ReactNode;
}) {
    return (<section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className={`${subtitle ? "mb-3" : titleIcon ? "mb-1.5" : "mb-4"} flex flex-wrap items-start justify-between gap-x-3 gap-y-1`}>
        <div className="min-w-[180px] flex-1">
          <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-bold leading-tight text-slate-950">
            {titleIcon ? <span className="inline-flex size-4 shrink-0 items-center justify-center text-[15px] leading-none">{titleIcon}</span> : null}
            <span className="min-w-0">{title}</span>
          </h2>
          {subtitle ? <p className="mt-1 text-xs font-medium leading-tight text-slate-500">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>);
}
type DashboardGroupHeadingTone = "amber" | "blue" | "emerald";
const DASHBOARD_GROUP_HEADING_STYLES: Record<DashboardGroupHeadingTone, {
    badge: string;
    icon: string;
    line: string;
}> = {
    amber: {
        badge: "border-amber-200 bg-amber-50 text-amber-950",
        icon: "text-amber-600",
        line: "bg-amber-200"
    },
    blue: {
        badge: "border-blue-200 bg-blue-50 text-blue-950",
        icon: "text-blue-700",
        line: "bg-blue-200"
    },
    emerald: {
        badge: "border-emerald-200 bg-emerald-50 text-emerald-950",
        icon: "text-emerald-700",
        line: "bg-emerald-200"
    }
};
function DashboardGroupHeading({ icon, title, tone = "emerald" }: {
    icon: ReactNode;
    title: ReactNode;
    tone?: DashboardGroupHeadingTone;
}) {
    const style = DASHBOARD_GROUP_HEADING_STYLES[tone];
    return (<div className="safety-dashboard-group-heading -mb-1 flex min-w-0 items-center gap-3">
      <span className={`h-px min-w-4 flex-1 ${style.line}`}/>
      <h2 className={`inline-flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-black leading-tight shadow-sm sm:px-5 sm:py-2 sm:text-base ${style.badge}`}>
        <span className={`inline-flex size-4 shrink-0 items-center justify-center sm:size-5 ${style.icon}`}>{icon}</span>
        <span className="min-w-0 truncate">{title}</span>
      </h2>
      <span className={`h-px min-w-4 flex-1 ${style.line}`}/>
    </div>);
}
function SafetyTrendChart({ data }: {
    data: TrendPoint[];
}) {
    const width = 640;
    const height = 200;
    const domainMin = 80;
    const domainMax = 100;
    const padding = { bottom: 26, left: 38, right: 12, top: 8 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const xFor = (index: number) => padding.left + (index / Math.max(1, data.length - 1)) * plotWidth;
    const yFor = (value: number) => {
        const clamped = Math.max(domainMin, Math.min(domainMax, value));
        return padding.top + (1 - (clamped - domainMin) / (domainMax - domainMin)) * plotHeight;
    };
    const scorePoints = data.map((item, index) => `${xFor(index)},${yFor(item.score)}`).join(" ");
    const targetPoints = data.map((item, index) => `${xFor(index)},${yFor(item.target)}`).join(" ");
    const areaPoints = `${padding.left},${padding.top + plotHeight} ${scorePoints} ${padding.left + plotWidth},${padding.top + plotHeight}`;
    return (<div>
      <svg className="h-[200px] w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id="safetyScoreAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="#22a050" stopOpacity="0.3"/>
            <stop offset="95%" stopColor="#22a050" stopOpacity="0.02"/>
          </linearGradient>
        </defs>
        {[80, 85, 90, 95, 100].map((value) => (<g key={value}>
            <line stroke="#e2e8f0" strokeDasharray="3 3" x1={padding.left} x2={width - padding.right} y1={yFor(value)} y2={yFor(value)}/>
            <text fill="#64748b" fontSize="10" x="4" y={yFor(value) + 3}>
              {value}%
            </text>
          </g>))}
        <polygon fill="url(#safetyScoreAreaGradient)" points={areaPoints}/>
        <polyline fill="none" points={targetPoints} stroke="#f5c400" strokeDasharray="5 4" strokeLinecap="round" strokeWidth="2"/>
        <polyline fill="none" points={scorePoints} stroke="#22a050" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"/>
        {data.map((item, index) => (<g key={item.month}>
            <circle cx={xFor(index)} cy={yFor(item.score)} fill="#22a050" r="4"/>
            <text fill="#64748b" fontSize="11" textAnchor="middle" x={xFor(index)} y={height - 9}>
              {item.month}
            </text>
          </g>))}
      </svg>
      <div className="mt-1 flex items-center justify-center gap-5 text-xs font-semibold">
        <span className="inline-flex items-center gap-1.5 text-emerald-700">
          <i className="h-0.5 w-4 rounded-full bg-[#22a050]"/>
          Thực tế
        </span>
        <span className="inline-flex items-center gap-1.5 text-amber-600">
          <i className="h-0.5 w-4 rounded-full border-t-2 border-dashed border-[#f5c400]"/>
          Mục tiêu
        </span>
      </div>
    </div>);
}
function polarPoint(cx: number, cy: number, radius: number, angle: number) {
    const radians = ((angle - 90) * Math.PI) / 180;
    return {
        x: cx + radius * Math.cos(radians),
        y: cy + radius * Math.sin(radians)
    };
}
function donutSlicePath(cx: number, cy: number, innerRadius: number, outerRadius: number, startAngle: number, endAngle: number) {
    const outerStart = polarPoint(cx, cy, outerRadius, endAngle);
    const outerEnd = polarPoint(cx, cy, outerRadius, startAngle);
    const innerStart = polarPoint(cx, cy, innerRadius, endAngle);
    const innerEnd = polarPoint(cx, cy, innerRadius, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return [
        `M ${outerStart.x} ${outerStart.y}`,
        `A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y}`,
        `L ${innerEnd.x} ${innerEnd.y}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${innerStart.x} ${innerStart.y}`,
        "Z"
    ].join(" ");
}
function IncidentTypeDonut({ data }: {
    data: Array<{
        color: string;
        name: string;
        value: number;
    }>;
}) {
    const total = Math.max(1, data.reduce((sum, item) => sum + item.value, 0));
    const cx = 90;
    const cy = 90;
    const innerRadius = 40;
    const outerRadius = 80;
    let cursor = 0;
    return (<div className="flex min-h-[260px] items-center justify-center py-2">
      <div className="mx-auto grid w-full max-w-[590px] items-center gap-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-7">
        <div className="flex justify-center">
          <svg className="size-[190px] max-w-full shrink-0" role="img" viewBox="0 0 180 180">
            {data.map((item) => {
            const startAngle = cursor;
            const endAngle = cursor + (item.value / total) * 360;
            const middleAngle = (startAngle + endAngle) / 2;
            const percent = Math.round((item.value / total) * 100);
            const labelPoint = polarPoint(cx, cy, (innerRadius + outerRadius) / 2, middleAngle);
            cursor = endAngle;
            return (<g key={item.name}>
                  <path d={donutSlicePath(cx, cy, innerRadius, outerRadius, startAngle, endAngle)} fill={item.color}/>
                  {percent >= 8 ? (<text fill="#ffffff" fontSize="11" fontWeight="800" textAnchor="middle" x={labelPoint.x} y={labelPoint.y + 4}>
                      {percent}%
                    </text>) : null}
                </g>);
        })}
            <circle cx={cx} cy={cy} fill="#ffffff" r={innerRadius - 1}/>
          </svg>
        </div>
        <div className="min-w-0 space-y-2.5">
          {data.map((item) => (<div className="grid grid-cols-[10px_minmax(0,1fr)_28px] items-center gap-2" key={item.name}>
              <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }}/>
              <span className="min-w-0 truncate text-xs font-semibold text-slate-800">{item.name}</span>
              <span className="text-right font-mono text-xs font-bold" style={{ color: item.color }}>
                {item.value}
              </span>
            </div>))}
        </div>
      </div>
    </div>);
}
function CountTrendBars({ data }: {
    data: CountPoint[];
}) {
    const visibleData = data.slice(-3);
    const maxValue = Math.max(1, ...visibleData.flatMap((item) => [item.warnings, item.incidents]));
    const axisMax = Math.max(12, Math.ceil(maxValue / 3) * 3);
    const width = 640;
    const height = 200;
    const padding = { bottom: 28, left: 36, right: 18, top: 8 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const ticks = Array.from({ length: 5 }, (_, index) => Math.round((axisMax / 4) * index));
    const yFor = (value: number) => padding.top + (1 - Math.max(0, Math.min(axisMax, value)) / axisMax) * plotHeight;
    const groupWidth = plotWidth / Math.max(1, visibleData.length);
    const barWidth = Math.min(34, groupWidth * 0.24);
    return (<div>
      <svg className="h-[200px] w-full" preserveAspectRatio="none" role="img" viewBox={`0 0 ${width} ${height}`}>
        {ticks.map((value) => (<g key={value}>
            <line stroke="#e2e8f0" strokeDasharray="3 3" x1={padding.left} x2={width - padding.right} y1={yFor(value)} y2={yFor(value)}/>
            <text fill="#64748b" fontSize="10" x="4" y={yFor(value) + 3}>
              {value}
            </text>
          </g>))}
        {visibleData.map((item, index) => {
            const center = padding.left + groupWidth * index + groupWidth / 2;
            const warningHeight = yFor(0) - yFor(item.warnings);
            const incidentHeight = yFor(0) - yFor(item.incidents);
            return (<g key={item.label}>
              <rect fill="#f9a825" height={warningHeight} rx="3" width={barWidth} x={center - barWidth - 3} y={yFor(item.warnings)}/>
              <rect fill="#e53935" height={incidentHeight} rx="3" width={barWidth} x={center + 3} y={yFor(item.incidents)}/>
              <text fill="#64748b" fontSize="11" fontWeight="700" textAnchor="middle" x={center} y={height - 8}>
                {item.label}
              </text>
            </g>);
        })}
      </svg>
      <div className="mt-2 flex items-center justify-center gap-4 text-xs font-semibold">
        <span className="inline-flex items-center gap-1.5 text-amber-600"><i className="size-2.5 rounded-sm bg-[#f9a825]"/>Vi phạm</span>
        <span className="inline-flex items-center gap-1.5 text-red-600"><i className="size-2.5 rounded-sm bg-[#e53935]"/>Sự cố</span>
      </div>
    </div>);
}
function LivePanelPager({ label, page, pageCount, setPage }: {
    label: string;
    page: number;
    pageCount: number;
    setPage: (page: number) => void;
}) {
    const safePage = Math.min(page, pageCount);
    return (<div className="flex min-h-[48px] items-center justify-between gap-3 border-t border-emerald-100 bg-slate-50/75 px-4 py-2 text-xs font-medium text-emerald-900">
      <span>{label}</span>
      <div className="flex items-center gap-1">
        <button aria-label="Trang trước" className="inline-flex size-7 items-center justify-center rounded-md border border-emerald-100 bg-white text-slate-400 disabled:opacity-45" disabled={safePage <= 1} onClick={() => setPage(Math.max(1, safePage - 1))} type="button">
          <ChevronLeft className="size-4"/>
        </button>
        <span className="inline-flex size-7 items-center justify-center rounded-md bg-blue-700 text-xs font-bold text-white">{safePage}</span>
        {pageCount > 1 ? (<button className="inline-flex size-7 items-center justify-center rounded-md border border-emerald-100 bg-white text-xs font-bold text-emerald-900" onClick={() => setPage(Math.min(pageCount, safePage + 1))} type="button">
            {safePage < pageCount ? safePage + 1 : pageCount}
          </button>) : null}
        <button aria-label="Trang sau" className="inline-flex size-7 items-center justify-center rounded-md border border-emerald-100 bg-white text-emerald-900 disabled:opacity-45" disabled={safePage >= pageCount} onClick={() => setPage(Math.min(pageCount, safePage + 1))} type="button">
          <ChevronRight className="size-4"/>
        </button>
      </div>
    </div>);
}
type HotWarningFilter = "all" | "overdue" | "soon";
function WarningDetailModal({ lang, warning, onClose }: {
    lang: string;
    warning: Warning;
    onClose: () => void;
}) {
    const overdue = isOverdueDate(warning.deadline);
    const critical = warning.riskScore >= 16 || warning.riskLevel.includes("Cực");
    const toneClass = overdue || critical ? "border-red-200 bg-red-50 text-red-700" : "border-orange-200 bg-orange-50 text-orange-700";
    const fallback = "Chưa cập nhật.";
    const detailItems = [
        { label: "Mã cảnh báo", value: warning.code || warning.id },
        { label: "Bộ phận", value: displayDeptCode(warning.department) },
        { label: "Khu vực", value: contentText(warning, "area", lang, fallback) || fallback },
        { label: "Hạn xử lý", value: formatDateChip(warning.deadline) },
        { label: "Trạng thái", value: warning.status || fallback },
        { label: "Phê duyệt", value: warning.approvalStatus || fallback },
        { label: "Mức rủi ro", value: warning.riskLevel || fallback },
        { label: "Điểm rủi ro", value: String(warning.riskScore || 0) },
        { label: "Người phụ trách", value: warning.responsiblePerson || fallback },
        { label: "Người báo cáo", value: warning.reporterName || warning.submittedByName || warning.createdByName || fallback },
        { label: "Nhóm vấn đề", value: warning.category || fallback },
        { label: "Tiêu chuẩn liên quan", value: contentText(warning, "relatedStandard", lang, fallback) || fallback }
    ];
    return (<div aria-labelledby={`warning-detail-title-${warning.id}`} aria-modal="true" className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]" onClick={onClose} role="dialog">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-emerald-100 bg-red-50/70 px-5 py-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${toneClass}`}>
                {overdue ? "OVERDUE" : critical ? "Rủi ro cao" : "Sắp hạn"}
              </span>
              <span className="rounded-full border border-emerald-100 bg-white px-2.5 py-1 text-xs font-bold text-emerald-800">
                {warning.code || warning.id}
              </span>
            </div>
            <h3 className="break-words text-lg font-extrabold leading-snug text-slate-950" id={`warning-detail-title-${warning.id}`}>
              {contentText(warning, "title", lang, warning.title)}
            </h3>
          </div>
          <button aria-label="Đóng chi tiết cảnh báo" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50" onClick={onClose} type="button">
            <X className="size-4"/>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {detailItems.map((item) => (<div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2" key={item.label}>
                <p className="text-[11px] font-bold text-slate-500">{item.label}</p>
                <p className="mt-1 break-words text-sm font-semibold text-slate-900">{item.value}</p>
              </div>))}
          </div>

          <div className="mt-4 grid gap-3">
            {[
            { label: "Mô tả vấn đề", value: contentText(warning, "description", lang, fallback) },
            { label: "Kiểm soát hiện tại", value: contentText(warning, "currentControl", lang, fallback) },
            { label: "Hành động đề xuất", value: contentText(warning, "proposedAction", lang, fallback) },
            { label: "Ghi chú bằng chứng", value: contentText(warning, "evidenceNotes", lang, fallback) }
        ].map((item) => (<section className="rounded-lg border border-emerald-100 bg-white p-3" key={item.label}>
                <h4 className="text-xs font-extrabold text-emerald-800">{item.label}</h4>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{item.value || fallback}</p>
              </section>))}
          </div>
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-emerald-100 bg-slate-50 px-5 py-3 sm:flex-row sm:justify-end">
          <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50" onClick={onClose} type="button">
            Đóng
          </button>
          <Link className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800" onClick={onClose} to="warnings">
            Mở trang quản lý
          </Link>
        </footer>
      </div>
    </div>);
}
function HotWarningsPanel({ lang, warnings }: {
    lang: string;
    warnings: Warning[];
}) {
    const [page, setPage] = useState(1);
    const [filter, setFilter] = useState<HotWarningFilter>("all");
    const [filterOpen, setFilterOpen] = useState(false);
    const [selectedWarning, setSelectedWarning] = useState<Warning | null>(null);
    const overdueWarnings = warnings.filter((item) => isOverdueDate(item.deadline));
    const soonWarnings = warnings.filter((item) => !isOverdueDate(item.deadline));
    const filteredWarnings = filter === "overdue" ? overdueWarnings : filter === "soon" ? soonWarnings : warnings;
    const pageCount = pageCountFor(filteredWarnings.length);
    const safePage = Math.min(page, pageCount);
    const visibleWarnings = filteredWarnings.slice((safePage - 1) * LIVE_PANEL_PAGE_SIZE, safePage * LIVE_PANEL_PAGE_SIZE);
    const filterOptions: Array<{
        value: HotWarningFilter;
        label: string;
        count: number;
        dotClass: string;
    }> = [
        { value: "all", label: "Tất cả", count: warnings.length, dotClass: "bg-red-500" },
        { value: "overdue", label: "OVERDUE", count: overdueWarnings.length, dotClass: "bg-red-500" },
        { value: "soon", label: "Sắp hạn", count: soonWarnings.length, dotClass: "bg-orange-500" }
    ];
    const activeFilter = filterOptions.find((item) => item.value === filter) || filterOptions[0];
    return (<>
    <section className="flex min-h-[452px] flex-col overflow-hidden rounded-lg border border-emerald-100 bg-white shadow-sm">
      <header className="grid min-h-[46px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-emerald-100 bg-red-50/55 px-4 py-1.5">
        <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold leading-tight text-slate-950">
          <span aria-hidden="true" className="shrink-0 text-base leading-none">
            🔥
          </span>
          <span className="truncate">Cảnh Báo Nóng</span>
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative shrink-0" onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setFilterOpen(false);
            }
        }}>
            <button aria-expanded={filterOpen} aria-haspopup="listbox" aria-label={`Lọc cảnh báo nóng: ${activeFilter.label} (${activeFilter.count})`} className="inline-flex h-8 min-w-[122px] items-center justify-between gap-2 rounded-full border border-emerald-200 bg-white px-2.5 text-xs font-extrabold text-emerald-950 shadow-[0_1px_4px_rgba(15,23,42,0.14)] outline-none transition hover:border-emerald-300 hover:bg-emerald-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:min-w-[150px]" id="hot-warning-filter" onClick={() => setFilterOpen((value) => !value)} type="button">
              <span className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${activeFilter.dotClass}`}/>
                <span className="truncate">{activeFilter.label}</span>
                <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] leading-none text-emerald-700">{activeFilter.count}</span>
              </span>
              <ChevronDown className={`size-3.5 shrink-0 text-emerald-700 transition ${filterOpen ? "rotate-180" : ""}`}/>
            </button>
            {filterOpen ? (<div aria-label="Lọc cảnh báo nóng" className="absolute right-0 top-[calc(100%+6px)] z-30 w-[184px] overflow-hidden rounded-lg border border-emerald-100 bg-white p-1 shadow-[0_14px_28px_rgba(15,23,42,0.18)]" role="listbox">
                {filterOptions.map((option) => {
                const selected = option.value === filter;
                return (<button aria-selected={selected} className={`flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-2.5 py-2 text-left text-xs font-bold outline-none transition focus:bg-emerald-50 focus:ring-2 focus:ring-blue-100 ${selected ? "bg-emerald-50 text-emerald-950" : "text-slate-700 hover:bg-slate-50 hover:text-slate-950"}`} key={option.value} onClick={() => {
                        setFilter(option.value);
                        setPage(1);
                        setFilterOpen(false);
                    }} role="option" type="button">
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${option.dotClass}`}/>
                        <span className="truncate">{option.label}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] leading-none text-emerald-700 shadow-sm">{option.count}</span>
                        {selected ? <Check className="size-3.5 text-emerald-700"/> : null}
                      </span>
                    </button>);
            })}
              </div>) : null}
          </div>
          <Link className="hidden shrink-0 text-xs font-bold text-blue-700 hover:underline sm:inline-flex" to="warnings">
            Xem tất cả →
          </Link>
        </div>
      </header>

      <div className="safety-live-feed-list min-h-0 flex-1 overflow-hidden px-3 py-3">
        {visibleWarnings.map((item) => {
            const overdue = isOverdueDate(item.deadline);
            const critical = item.riskScore >= 16 || item.riskLevel.includes("Cực");
            const dotColor = overdue || critical ? "#ef233c" : "#ff7a1a";
            const cardTone = overdue || critical ? "high" : "medium";
            const title = contentText(item, "title", lang, item.title);
            return (<button aria-label={`Xem chi tiết cảnh báo ${title}`} className={`safety-live-card safety-live-warning-card w-full cursor-pointer text-left ${cardTone}`} key={item.id} onClick={() => setSelectedWarning(item)} type="button">
              <span className="safety-live-dot" style={{ backgroundColor: dotColor }} aria-hidden="true"/>
              <div className="safety-live-content">
                <div className="safety-live-title-row">
                  <strong>{title}</strong>
                  <span aria-label={overdue || critical ? "Cảnh báo cần xử lý" : "Cảnh báo sắp hạn"} className="safety-live-status-icon" title={overdue || critical ? "Cảnh báo cần xử lý" : "Cảnh báo sắp hạn"}>
                    <AlertTriangle className="size-4"/>
                  </span>
                </div>
                <div className="safety-live-meta-row">
                  <span className="safety-live-meta-chip">
                    <Building2 className="size-3.5"/>
                    {displayDeptCode(item.department)}
                  </span>
                  <span className={`safety-live-meta-chip ${overdue ? "danger" : "due"}`}>
                    <CalendarDays className="size-3.5"/>
                    {formatDateChip(item.deadline)}
                  </span>
                </div>
              </div>
            </button>);
        })}
        {!visibleWarnings.length ? <p className="px-4 py-10 text-center text-sm text-slate-500">Không có cảnh báo phù hợp.</p> : null}
      </div>

      <LivePanelPager label={pageRangeLabel(safePage, filteredWarnings.length, "cảnh báo")} page={safePage} pageCount={pageCount} setPage={setPage}/>
    </section>
    {selectedWarning ? <WarningDetailModal lang={lang} onClose={() => setSelectedWarning(null)} warning={selectedWarning}/> : null}
    </>);
}
type LiveActivityItem = {
    id: string;
    createdAt: string;
    department: string;
    kind: "warning" | "incident";
    title: string;
};
function RecentActivityPanel({ incidents, lang, warnings }: {
    incidents: Incident[];
    lang: string;
    warnings: Warning[];
}) {
    const [page, setPage] = useState(1);
    const activities: LiveActivityItem[] = [
        ...warnings.map((item) => {
            const actor = item.reporterName || item.submittedByName || item.createdByName || "EHS";
            return {
                id: `warning-${item.id}`,
                createdAt: item.createdAt || "",
                department: item.department,
                kind: "warning" as const,
                title: `${actor} đã gửi cảnh báo ${contentText(item, "title", lang, item.code)}`
            };
        }),
        ...incidents.map((item) => {
            const actor = item.reporterName || item.submittedByName || item.createdByName || "EHS";
            return {
                id: `incident-${item.id}`,
                createdAt: item.createdAt || item.occurredDate || "",
                department: item.department,
                kind: "incident" as const,
                title: `${actor} đã gửi sự cố ${contentText(item, "description", lang, item.code)}`
            };
        })
    ]
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, RECENT_ACTIVITY_LIMIT);
    const pageCount = pageCountFor(activities.length);
    const safePage = Math.min(page, pageCount);
    const visibleActivities = activities.slice((safePage - 1) * LIVE_PANEL_PAGE_SIZE, safePage * LIVE_PANEL_PAGE_SIZE);
    return (<section className="flex min-h-[452px] flex-col overflow-hidden rounded-lg border border-emerald-100 bg-white shadow-sm">
      <header className="flex min-h-[46px] items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/60 px-4">
        <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold leading-tight text-slate-950">
          <span aria-hidden="true" className="shrink-0 text-base leading-none">
            🕐
          </span>
          <span className="truncate">Hoạt Động Gần Đây</span>
          <span className="text-xs font-semibold text-emerald-700">({activities.length})</span>
        </h2>
        <span className="hidden shrink-0 text-xs font-medium text-emerald-700 sm:inline">Dữ liệu thực · Tự động cập nhật</span>
      </header>

      <div className="safety-live-feed-list min-h-0 flex-1 overflow-hidden px-3 py-3">
        {visibleActivities.map((item) => (<Link className={`safety-live-card safety-live-activity-card ${item.kind}`} key={item.id} to={item.kind === "incident" ? "incidents" : "warnings"}>
            <span className="safety-live-dot" aria-hidden="true"/>
            <div className="safety-live-content">
              <div className="safety-live-title-row">
                <strong>{item.title}</strong>
                <span aria-label={item.kind === "incident" ? "Sự cố mới" : "Cảnh báo mới"} className="safety-live-status-icon" title={item.kind === "incident" ? "Sự cố mới" : "Cảnh báo mới"}>
                  {item.kind === "incident" ? <FileText className="size-4"/> : <Clock3 className="size-4"/>}
                </span>
              </div>
              <div className="safety-live-meta-row">
                <span className="safety-live-meta-chip">
                  <Building2 className="size-3.5"/>
                  {displayDeptCode(item.department)}
                </span>
                <span className="safety-live-meta-chip due">
                  <Clock3 className="size-3.5"/>
                  {formatRelativeTime(item.createdAt)}
                </span>
              </div>
            </div>
          </Link>))}
        {!visibleActivities.length ? (<p className="px-4 py-10 text-center text-sm text-slate-500">Chưa có hoạt động mới.</p>) : null}
      </div>

      <LivePanelPager label={pageRangeLabel(safePage, activities.length, "hoạt động")} page={safePage} pageCount={pageCount} setPage={setPage}/>
    </section>);
}
export function SafetyDashboardPage({ model }: { model: HubModel }) {
    const { lang } = useHubLanguage();
    const { user } = useAuth() as {
        user: SafetyUser | null;
    };
    const { warnings, incidents, kpis } = useSafetyCollections();
    const [showTopDepartments, setShowTopDepartments] = useState(true);
    const [rankingPage, setRankingPage] = useState(0);
    const [isExporting, setIsExporting] = useState(false);
    const exportDashboardExcel = useCallback(async (period: string) => {
        setIsExporting(true);
        try {
            const res = await fetch(`/api/safety/score/export.xlsx?period=${period}`, { credentials: "include" });
            if (!res.ok) throw new Error("Export failed");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `BaoCaoAnToan_${period}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            alert("Không xuất được file. Vui lòng thử lại.");
        } finally {
            setIsExporting(false);
        }
    }, []);
    const pillarSummary = useQuery({
        queryKey: ["safety", "checklists", "pillar-summary", currentMonth()],
        queryFn: () => apiFetchArray<{
            pillar: string;
            checkedCount?: number;
            totalCount?: number;
            checked?: number;
            total?: number;
            percentage?: number;
            score?: number;
        }>(`/api/checklists/pillar-summary?period=${currentMonth()}`)
    });
    const autoScore = useQuery({
        queryKey: ["safety", "score", currentMonth()],
        queryFn: () => apiFetch<AutoScoreResult>(`/api/safety/score?period=${currentMonth()}`),
        staleTime: 5 * 60 * 1000,
    });
    if (warnings.isLoading || incidents.isLoading || kpis.isLoading || pillarSummary.isLoading)
        return <SafetyI18nRender>{<LoadingPanel />}</SafetyI18nRender>;
    if (warnings.error || incidents.error || kpis.error)
        return <SafetyI18nRender>{<ErrorPanel error={warnings.error || incidents.error || kpis.error}/>}</SafetyI18nRender>;
    const warningItems = warnings.data || [];
    const incidentItems = incidents.data || [];
    const kpiItems = kpis.data || [];
    const approvedKpis = kpiItems.filter(approvedKpi);
    const safetyScoreKpis = approvedKpis.filter((item) => item.entryType === "safety_score_monthly");
    const safetyTrend = buildSafetyTrend(kpiItems);
    const autoScoreData = autoScore.data ?? null;
    const averageSafety = autoScoreData?.company?.total
        ?? (safetyScoreKpis.length
            ? Math.round(safetyScoreKpis.reduce((sum, item) => sum + Number(item.value || 0), 0) / safetyScoreKpis.length)
            : Math.round(Number(model?.averageScore || 0)));
    const scoreSource = autoScoreData ? `Engine tự động · ${autoScoreData.company.level.label}` : safetyScoreKpis.length ? "Trung bình KPI đã duyệt" : "Fallback tổng quan";
    const scoreComponents = autoScoreData?.company?.components ?? null;
    const openWarnings = warningItems.filter((item) => item.status !== "DONE");
    const overdueWarnings = openWarnings.filter((item) => item.deadline && new Date(item.deadline) < new Date());
    const monthIncidents = incidentItems.filter((item) => (item.occurredDate || item.createdAt || "").startsWith(currentMonth()));
    const sixsFromApi = pillarSummary.data?.some((item) => Number(item.totalCount ?? item.total ?? 0) > 0)
        ? DEFAULT_SIXS_RINGS.map((ring) => {
            const item = pillarSummary.data?.find((entry) => entry.pillar === ring.letter);
            const totalCount = Number(item?.totalCount ?? item?.total ?? 0);
            if (!item || totalCount <= 0)
                return ring;
            const checkedCount = Number(item.checkedCount ?? item.checked ?? 0);
            const percentage = Math.round(Number(item.percentage ?? item.score ?? (checkedCount / totalCount) * 100));
            return {
                ...ring,
                percentage,
                status: percentage >= 80 ? "Tốt" : percentage >= 60 ? "Cần cải thiện" : "Yếu - ưu tiên",
                pillColor: percentage >= 80 ? "#22a050" : percentage >= 60 ? "#f9a825" : "#e53935"
            };
        })
        : DEFAULT_SIXS_RINGS;
    const sixsAverage = Math.round(sixsFromApi.reduce((sum, item) => sum + item.percentage, 0) / sixsFromApi.length);
    const weakestSixs = [...sixsFromApi].sort((left, right) => left.percentage - right.percentage)[0];
    const deptScores = (() => {
        if (autoScoreData?.departments?.length) {
            const sorted = [...autoScoreData.departments].sort((a, b) => b.total - a.total);
            const all = sorted.map((d) => ({ dept: d.dept, score: d.total, color: scoreColor(d.total) }));
            return { all, top: all, bottom: [...all].reverse() };
        }
        return buildDeptScores(kpiItems);
    })();
    const countTrend = buildCountTrend(warningItems, incidentItems);
    const incidentTypes = buildIncidentTypes(incidentItems);
    const incidentTypeTotal = incidentTypes.reduce((sum, item) => sum + item.value, 0);
    const topIncidentType = [...incidentTypes].sort((left, right) => right.value - left.value)[0];
    const lastTwoTrend = countTrend.slice(-2);
    const lastTwoIncidentTotal = lastTwoTrend.reduce((sum, item) => sum + item.incidents, 0);
    const firstWarningCount = countTrend[0]?.warnings || 0;
    const lastWarningCount = countTrend[countTrend.length - 1]?.warnings || 0;
    const warningReductionPercent = firstWarningCount > 0 ? Math.max(0, Math.round(((firstWarningCount - lastWarningCount) / firstWarningCount) * 100)) : 0;
    const lastTwoTrendLabel = lastTwoTrend.map((item) => item.label).join("–");
    const rankingSource = showTopDepartments ? deptScores.top : deptScores.bottom;
    const rankingPageCount = Math.max(1, Math.ceil(rankingSource.length / SAFETY_RANKING_PAGE_SIZE));
    const safeRankingPage = Math.min(rankingPage, rankingPageCount - 1);
    const rankingStart = safeRankingPage * SAFETY_RANKING_PAGE_SIZE;
    const visibleDeptScores = rankingSource.slice(rankingStart, rankingStart + SAFETY_RANKING_PAGE_SIZE);
    const rankingEnd = Math.min(rankingSource.length, rankingStart + visibleDeptScores.length);
    const deptScoreTotal = Math.max(1, deptScores.all.length);
    const deptScoreMetTarget = deptScores.all.filter((item) => item.score >= SAFETY_SCORE_TARGET).length;
    const deptScoreNames = visibleDeptScores.slice(0, 3).map((item) => item.dept).join(", ");
    const lowestDeptScore = deptScores.bottom[0];
    const rankingDisplayStart = showTopDepartments ? rankingStart + 1 : deptScoreTotal - rankingStart;
    const rankingDisplayEnd = showTopDepartments ? rankingEnd : Math.max(1, deptScoreTotal - rankingEnd + 1);
    const rankingRangeText = rankingSource.length ? `${rankingDisplayStart}-${rankingDisplayEnd}` : "0-0";
    const rankingSubtitle = showTopDepartments
        ? rankingStart === 0
            ? `Top 5 bộ phận dẫn đầu${deptScoreNames ? ` · ${deptScoreNames}` : ""}`
            : `Xếp hạng ${rankingRangeText}${deptScoreNames ? ` · ${deptScoreNames}` : ""}`
        : rankingStart === 0
            ? `5 bộ phận thấp nhất${lowestDeptScore ? ` · ${lowestDeptScore.dept} thấp nhất (${lowestDeptScore.score}%)` : ""}`
            : `Nhóm thấp tiếp theo hạng ${rankingRangeText}${deptScoreNames ? ` · ${deptScoreNames}` : ""}`;
    const firstTrend = safetyTrend[0];
    const lastTrend = safetyTrend[safetyTrend.length - 1];
    const trendDelta = firstTrend && lastTrend ? lastTrend.score - firstTrend.score : 0;
    const trendDirectionText = trendDelta >= 0 ? `Tăng ${trendDelta} điểm` : `Giảm ${Math.abs(trendDelta)} điểm`;
    const activeUserName = user?.displayName || user?.username || "Anh Nguyễn";
    const greeting = currentGreeting();
    const period = currentMonth();
    const [periodYear, periodMonth] = period.split("-");
    const currentPeriodLabel = `Tháng ${Number(periodMonth) || periodMonth}/${periodYear}`;
    const departmentsForMetrics: HubDepartment[] = Array.isArray(model?.departments) ? model.departments : [];
    const trainingRate = departmentsForMetrics.length
        ? Math.round(departmentsForMetrics.reduce((sum, department) => sum + Number(department.trainingRate || 0), 0) /
            departmentsForMetrics.length)
        : 0;
    const divisionCards = SAFETY_DIVISION_PERFORMANCE_CARDS.map((card) => {
        if (!autoScoreData?.departments?.length) return card;
        const deptMap = new Map(autoScoreData.departments.map((d) => [d.dept, d]));
        const cardDepts = (card.departments as readonly string[]).map((d) => deptMap.get(d)).filter(Boolean) as AutoScoreDept[];
        if (!cardDepts.length) return card;
        const liveScore   = Math.round(cardDepts.reduce((s, d) => s + d.total, 0) / cardDepts.length);
        const liveChklist = Math.round(cardDepts.reduce((s, d) => s + d.components.daily, 0) / cardDepts.length);
        const liveInc     = monthIncidents.filter((inc) => (card.departments as readonly string[]).includes(String(inc.department || "").toUpperCase())).length;
        return { ...card, score: liveScore, checklist: liveChklist, incidents: liveInc, color: scoreColor(liveScore) };
    });
    return <SafetyI18nRender>{(<div className="safety-dashboard-grid grid gap-5">
      <section className="safety-welcome-card relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-amber-400 via-emerald-500 to-blue-600"/>
        <div className="flex flex-col gap-4 pl-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-xl font-bold leading-tight text-slate-950 sm:text-2xl">
              <ShieldAlert className="size-6 text-amber-500"/>
              <span className="truncate">{greeting}, {activeUserName}!</span>
            </h2>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1.5 text-red-600">
                <span aria-hidden="true" className="text-[15px] leading-none">
                  ⚠
                </span>
                <span>{overdueWarnings.length} cảnh báo quá hạn</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-blue-700">
                <span aria-hidden="true" className="text-[15px] leading-none">
                  📊
                </span>
                <span>Điểm 6S tháng này: {sixsAverage}%</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <span aria-hidden="true" className="text-[15px] leading-none">
                  🎯
                </span>
                <span>Mục tiêu an toàn: 95%</span>
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Link className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50" to="warnings">
              Xem cảnh báo
            </Link>
            <Link className="rounded-md bg-amber-400 px-3 py-2 text-sm font-bold text-emerald-950 hover:bg-amber-300" to="documents">
              <FileText className="mr-1.5 inline size-4"/>
              Tài liệu
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SafetyKpiCard color="#22a050" icon="🛡️" label="Điểm An Toàn Tổng Thể" sparkData={safetyTrend.map((item) => item.score)} sub={autoScore.error ? "⚠ Engine lỗi — dùng fallback KPI" : scoreSource} trend="up" value={`${averageSafety ?? 96}%`}/>
        <SafetyKpiCard color="#1565c0" icon="🎓" label="Tỷ Lệ Đào Tạo ATVSLĐ" sparkData={[0, 15, 22, 38, 56, trainingRate]} sub={`Mục tiêu 100% · ${trainingRate >= 100 ? "Đạt" : "Chưa đạt"}`} trend={trainingRate >= 100 ? "up" : "flat"} value={`${trainingRate}%`}/>
        <SafetyKpiCard color="#f9a825" icon="⚠️" label="Cảnh Báo Đang Mở" sparkData={[8, 9, 7, 6, 7, openWarnings.length]} sub={`${overdueWarnings.length} quá hạn · ${Math.max(0, openWarnings.length - overdueWarnings.length)} còn hạn`} trend={overdueWarnings.length ? "down" : "flat"} value={String(openWarnings.length)}/>
        <SafetyKpiCard color="#ef4444" icon="📋" label="Sự Cố Tháng Này" sparkData={countTrend.map((item) => item.incidents)} sub={`${incidentItems.length} sự cố trong dữ liệu hiện có`} trend={monthIncidents.length ? "down" : "flat"} value={String(monthIncidents.length)}/>
      </section>

      {scoreComponents && (
        <section className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-slate-50 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-800">🔢 Phân tích điểm an toàn – {currentPeriodLabel}</span>
            <div className="flex items-center gap-2">
              <button
                disabled={isExporting}
                onClick={() => exportDashboardExcel(currentMonth())}
                className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 shadow-sm transition hover:bg-green-100 disabled:opacity-60"
              >
                {isExporting ? <Loader2 size={13} className="animate-spin"/> : <Download size={13}/>}
                {isExporting ? "Đang xuất…" : "Xuất Excel"}
              </button>
              <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: autoScoreData!.company.level.color + '20', color: autoScoreData!.company.level.color }}>
                {autoScoreData!.company.level.label} · {autoScoreData!.company.total}% · {autoScoreData!.company.deptsWithData}/{autoScoreData!.company.totalDepts} bộ phận có data
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            {([
              { key: "sixS",       label: "6S",       icon: "🧹", weight: "35%", note: "Điểm 6S chính thức hàng tháng theo kiểm tra định kỳ tại bộ phận" },
              { key: "daily",      label: "Daily",    icon: "📋", weight: "25%", note: "Tỷ lệ hoàn thành checklist an toàn hàng ngày tại bộ phận" },
              { key: "pccc",       label: "PCCC",     icon: "🔥", weight: "20%", note: "Kết quả kiểm tra phòng cháy chữa cháy & an toàn điện hàng ngày" },
              { key: "kyt",        label: "KYT",      icon: "🎯", weight: "10%", note: "Tỷ lệ hoàn thành đào tạo nhận diện nguy hiểm KYT trong tháng" },
              { key: "meeting",    label: "Họp AT",   icon: "🤝", weight: "5%",  note: "Đã tổ chức họp an toàn định kỳ hàng tháng = 100%, chưa họp = 0%" },
              { key: "noBadEvent", label: "Không TN", icon: "✅", weight: "5%",  note: "Không có sự cố nghiêm trọng/cao trong tháng = 100%, có sự cố = 0%" },
            ] as const).map(({ key, label, icon, weight, note }) => {
              const val = scoreComponents[key];
              return (
                <div key={key} className="flex flex-col rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg leading-none">{icon}</span>
                    <span className="text-[11px] font-bold text-slate-700">{label}</span>
                    <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500">{weight}</span>
                  </div>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="font-mono text-2xl font-black leading-none" style={{ color: scoreColor(val) }}>{val}</span>
                    <span className="mb-0.5 text-xs font-bold text-slate-400">%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full transition-all" style={{ width: `${val}%`, backgroundColor: scoreColor(val) }}/>
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{note}</p>
                </div>
              );
            })}
          </div>
          {/* Công thức */}
          <div className="mt-3 rounded-lg border border-blue-100 bg-white/70 px-3 py-2.5 text-xs text-slate-600">
            <span className="mr-2 font-bold text-slate-700">📐 Công thức:</span>
            <span className="font-mono">Điểm = 6S×35% + Daily×25% + PCCC×20% + KYT×10% + Họp AT×5% + Không TN×5%</span>
            <span className="ml-3 text-slate-400">· Nguồn: {autoScoreData!.meta.meetingHeld ? "✅ Đã họp tháng này" : "❌ Chưa họp tháng này"} · KYT: {autoScoreData!.meta.kytScore}% · Sự cố nghiêm trọng: {autoScoreData!.meta.monthIncidentCount}</span>
          </div>
        </section>
      )}
      <SafetyPanel titleIcon="📊" action={<Link className="text-xs font-bold text-blue-700 hover:underline" to="checklist">
            Xem checklist →
          </Link>} title={`Tiến Độ 6S – ${currentPeriodLabel}`}>
        <p className="safety-progress-summary text-xs text-slate-500">
          Điểm tổng hợp từ checklist bộ phận · Trụ cột cần ưu tiên:{" "}
          <strong style={{ color: weakestSixs.pillColor }}>
            {weakestSixs.letter} {weakestSixs.name} ({weakestSixs.percentage}%)
          </strong>
        </p>
        <div className="safety-sixs-overview-grid grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {sixsFromApi.map((item) => (<SixSRing key={item.letter} {...item}/>))}
        </div>
      </SafetyPanel>

      <DashboardGroupHeading icon={<Clock3 className="size-4 sm:size-5"/>} title="Cảnh báo & hoạt động gần đây" tone="amber"/>

      <section className="safety-live-section grid gap-5 xl:grid-cols-2">
        <HotWarningsPanel lang={lang} warnings={openWarnings}/>
        <RecentActivityPanel incidents={incidentItems} lang={lang} warnings={warningItems}/>
      </section>

      <DashboardGroupHeading icon={<BarChart3 className="size-4 sm:size-5"/>} title="Điểm an toàn & xếp hạng bộ phận" tone="blue"/>

      <section className="safety-chart-section grid min-w-0 gap-5 xl:grid-cols-2">
        <SafetyPanel action={<Link className="text-xs font-bold text-blue-700 hover:underline" to="kpi">
              Xem KPI →
            </Link>} subtitle={`So sánh thực tế vs mục tiêu · ${lastTrend?.score >= SAFETY_SCORE_TARGET ? "Đã vượt" : "Đang theo dõi"} mục tiêu ${SAFETY_SCORE_TARGET}%`} title="Điểm An Toàn – 6 Tháng Đầu 2026" titleIcon="📈">
          <SafetyTrendChart data={safetyTrend}/>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
            <span className="flex min-w-0 items-center gap-1.5">
              <TrendingUp className="size-3.5 shrink-0"/>
              <span className="leading-snug">
                {trendDirectionText} so với {firstTrend?.month || "kỳ đầu"} · Đạt {lastTrend?.score || 0}% / mục tiêu {SAFETY_SCORE_TARGET}%
              </span>
            </span>
            <Link className="shrink-0 text-blue-700 hover:underline" to="kpi">
              Chi tiết →
            </Link>
          </div>
        </SafetyPanel>

        <SafetyPanel action={<Link className="text-xs font-bold text-blue-700 hover:underline" to="reports">
              Xem báo cáo →
            </Link>} subtitle={rankingSubtitle} title="Xếp Hạng Bộ Phận – Điểm An Toàn" titleIcon="🏆">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="safety-ranking-toggle-group flex gap-1.5">
              <button className={`safety-ranking-toggle inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-bold transition-all ${showTopDepartments
            ? "border-emerald-950 bg-[#009b72] text-white shadow-[0_2px_0_rgba(0,0,0,0.25)]"
            : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"}`} onClick={() => {
            setShowTopDepartments(true);
            setRankingPage(0);
        }} type="button">
                Top 5 ↑
              </button>
              <button className={`safety-ranking-toggle inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-bold transition-all ${!showTopDepartments
            ? "border-red-950 bg-[#e53935] text-white shadow-[0_2px_0_rgba(0,0,0,0.25)]"
            : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"}`} onClick={() => {
            setShowTopDepartments(false);
            setRankingPage(0);
        }} type="button">
                Thấp nhất ↓
              </button>
            </div>
            <div className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1 text-xs font-bold text-slate-600">
              <button aria-label="Trang xếp hạng trước" className="inline-flex size-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 disabled:opacity-35" disabled={safeRankingPage <= 0} onClick={() => setRankingPage((page) => Math.max(0, page - 1))} type="button">
                <ChevronLeft className="size-3.5"/>
              </button>
              <span className="min-w-[64px] text-center">
                {rankingRangeText} / {rankingSource.length}
              </span>
              <button aria-label="Trang xếp hạng sau" className="inline-flex size-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 disabled:opacity-35" disabled={safeRankingPage >= rankingPageCount - 1} onClick={() => setRankingPage((page) => Math.min(rankingPageCount - 1, page + 1))} type="button">
                <ChevronRight className="size-3.5"/>
              </button>
            </div>
          </div>
          <div className="grid min-w-0 gap-3">
            {visibleDeptScores.map((item, index) => (<div className="grid min-w-0 grid-cols-[20px_52px_minmax(0,1fr)_36px] items-center gap-2 sm:grid-cols-[24px_76px_minmax(0,1fr)_44px] sm:gap-3" key={item.dept}>
                <span className="text-right text-xs font-bold text-emerald-800">
                  {showTopDepartments ? rankingStart + index + 1 : deptScoreTotal - rankingStart - index}
                </span>
                <span className="truncate text-sm font-bold text-slate-800">{item.dept}</span>
                <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full" style={{ backgroundColor: item.color, width: `${Math.max(4, item.score)}%` }}/>
                </span>
                <span className="text-right font-mono text-[11px] font-bold sm:text-xs" style={{ color: item.color }}>
                  {item.score}%
                </span>
              </div>))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-200 pt-4 text-center text-xs sm:gap-3">
            <div className="rounded-lg bg-emerald-50 px-2 py-2.5 sm:px-3">
              <strong className="block font-mono text-lg font-bold leading-tight text-emerald-600">
                {deptScoreMetTarget}/{deptScoreTotal}
              </strong>
              <span className="text-slate-600">Bộ phận đạt mục tiêu</span>
            </div>
            <div className="rounded-lg bg-red-50 px-2 py-2.5 sm:px-3">
              <strong className="block font-mono text-lg font-bold leading-tight text-red-600">
                {deptScoreTotal - deptScoreMetTarget}/{deptScoreTotal}
              </strong>
              <span className="text-slate-600">Cần cải thiện</span>
            </div>
          </div>
        </SafetyPanel>
      </section>

      <DashboardGroupHeading icon={<TrendingUp className="size-4 sm:size-5"/>} title="So sánh hiệu suất cấp khối" tone="blue"/>

      <section className="safety-performance-section">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-emerald-900/70">Từ Công ty → Khối → Bộ phận</span>
          <Link className="text-xs font-bold text-blue-700 hover:underline" to="kpi">
            Xem KPI →
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {divisionCards.map((division) => (<Link className="safety-performance-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-300" key={division.code} to={`/safety-6s/departments/${division.departments[0].toLowerCase()}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <small className="block text-xs font-bold" style={{ color: division.accent }}>
                    [{division.code}]
                  </small>
                  <strong className="block text-sm font-bold leading-tight text-slate-950">{division.name}</strong>
                  <em className="mt-0.5 block truncate text-xs not-italic text-emerald-900/75">{division.departments.join(" · ")}</em>
                </span>
                <span className="shrink-0 text-right">
                  <strong className="block font-mono text-2xl leading-none" style={{ color: division.color }}>
                    {division.score}%
                  </strong>
                  <em className="mt-0.5 block text-xs not-italic text-emerald-900/75">Điểm AT</em>
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <span className="block h-full rounded-full" style={{ backgroundColor: division.color, width: `${division.score}%` }}/>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <span className="rounded-md bg-slate-50 px-2 py-2 text-slate-600">
                  <strong className="block font-mono text-red-600">{division.incidents}</strong>
                  Sự cố
                </span>
                <span className="rounded-md bg-slate-50 px-2 py-2 text-slate-600">
                  <strong className="block font-mono text-blue-700">{division.checklist}%</strong>
                  Checklist
                </span>
                <span className="rounded-md bg-slate-50 px-2 py-2 text-slate-600">
                  <strong className="block font-mono text-purple-700">{division.daysSafe}d</strong>
                  Không TN
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-200 pt-3">
                {division.departments.map((department) => (<span className="rounded px-1.5 py-0.5 text-[11px] font-bold leading-tight" key={`${division.code}-${department}`} style={{ backgroundColor: division.chipBg, color: division.chipText }}>
                    {department}
                  </span>))}
              </div>
            </Link>))}
        </div>
      </section>

      <DashboardGroupHeading icon={<BarChart3 className="size-4 sm:size-5"/>} title="Phân tích tổng hợp đa nguồn" tone="blue"/>

      <section className="safety-chart-section">
        <Link
          className="flex items-center gap-4 rounded-xl border-2 border-blue-200 bg-gradient-to-r from-[#0f172a] to-[#1e40af] px-6 py-4 text-white shadow-md hover:opacity-90 transition-opacity"
          to="intel"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f5c400]">
            <BarChart3 className="size-5 text-[#0f172a]"/>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-black tracking-tight">EHS Intelligence Dashboard</div>
            <div className="text-xs font-medium text-blue-200 mt-0.5">
              Tổng hợp đa nguồn — Cảnh báo · Sự cố · Kiểm tra · CAPA · Ma trận rủi ro · Xu hướng
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-bold">
            Xem ngay →
          </div>
        </Link>
      </section>

      <DashboardGroupHeading icon={<FileBarChart className="size-4 sm:size-5"/>} title="Dữ liệu sự cố & vi phạm" tone="emerald"/>

      <section className="safety-incident-section">
        <div className="grid gap-5 xl:grid-cols-2">
          <SafetyPanel action={<Link className="text-xs font-bold text-blue-700 hover:underline" to="reports">
                Xem báo cáo →
              </Link>} subtitle={<>
                Tổng <strong>{incidentTypeTotal}</strong> sự cố từ đầu năm ·{" "}
                <span className="font-semibold text-[#f9a825]">{topIncidentType?.name || "Chưa có dữ liệu"} chiếm nhiều nhất</span>
              </>} title="Phân Loại Sự Cố – 2026" titleIcon="🥧">
            <IncidentTypeDonut data={incidentTypes}/>
          </SafetyPanel>

          <SafetyPanel action={<Link className="text-xs font-bold text-blue-700 hover:underline" to="incidents">
                Xem sự cố →
              </Link>} subtitle={`Số lượng vi phạm và sự cố theo tuần · ${lastTwoIncidentTotal} sự cố trong 2 kỳ gần nhất`} title="Vi Phạm & Sự Cố – 8 Tuần Qua" titleIcon="📉">
            <CountTrendBars data={countTrend}/>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
              <span className="flex min-w-0 items-center gap-1.5">
                <TrendingDown className="size-3.5 shrink-0"/>
                <span className="leading-snug">
                  Giảm {warningReductionPercent}% vi phạm · {lastTwoIncidentTotal} sự cố trong 2 kỳ {lastTwoTrendLabel}
                </span>
              </span>
              <Link className="shrink-0 text-blue-700 hover:underline" to="incidents">
                Chi tiết →
              </Link>
            </div>
          </SafetyPanel>
        </div>
      </section>
    </div>)}</SafetyI18nRender>;
}
