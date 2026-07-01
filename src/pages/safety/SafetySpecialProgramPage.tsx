import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  BriefcaseMedical,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  ClockAlert,
  Database,
  ExternalLink,
  Eye,
  FileText,
  Flame,
  Hospital,
  Layers3,
  Link2,
  ListChecks,
  MapPin,
  Plus,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Target,
  Workflow
} from "lucide-react";
import { Link } from "react-router-dom";
import { apiFetch } from "./safety-api";
import { ErrorPanel, LoadingPanel, ModalShell } from "./safety-shared";
import { SafetyI18nRender } from "./safety-i18n-render";

type Tone = "blue" | "amber" | "emerald" | "red" | "slate";

type ProgramStat = {
  id: string;
  label: string;
  value: number;
  unit?: string;
  tone: Tone;
  icon: string;
  helper: string;
};

type ProgramWorkflow = {
  step: string;
  title: string;
  owner: string;
  description: string;
  evidence: string;
};

type ProgramCheckpoint = {
  id: string;
  group: string;
  title: string;
  standard: string;
  severity: "low" | "medium" | "high" | "critical";
};

type ProgramRecord = {
  id: string;
  title: string;
  department: string;
  location: string;
  status: string;
  risk: "low" | "medium" | "high" | "critical";
  owner: string;
  dueDate: string;
  score: number;
  progress: number;
  findings: number;
  actionCode?: string;
  detail: string;
};

type ProgramChartItem = {
  label: string;
  value: number;
  tone: Tone;
};

type ProgramDocument = {
  id: string;
  name: string;
  documentCode: string;
  category: string;
  documentType: string;
  scopeLevel: string;
  ocrStatus: string;
  effectiveDate: string | null;
  sourcePath: string;
  chunkCount: number;
  extractionMethod: string;
};

type ProgramPayload = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  route: string;
  ownerRole: string;
  cadence: string;
  scope: string;
  primaryAction: string;
  dataSourceNote: string;
  documentCategories: string[];
  stats: ProgramStat[];
  workflow: ProgramWorkflow[];
  checkpoints: ProgramCheckpoint[];
  records: ProgramRecord[];
  charts: {
    status: ProgramChartItem[];
    departments: ProgramChartItem[];
  };
  apiPlan: string[];
  documents: ProgramDocument[];
  summary: {
    documentCount: number;
    indexedDocuments: number;
    chunkCount: number;
    openRecords: number;
    overdueRecords: number;
  };
};

type ProgramTheme = {
  accent: string;
  icon: string;
  soft: string;
  marker: string;
};

const PROGRAM_THEMES: Record<string, ProgramTheme> = {
  kyt: {
    accent: "border-t-blue-600",
    icon: "bg-blue-50 text-blue-700 ring-blue-100",
    soft: "bg-blue-50/60",
    marker: "bg-blue-600"
  },
  pccc: {
    accent: "border-t-red-500",
    icon: "bg-red-50 text-red-700 ring-red-100",
    soft: "bg-red-50/60",
    marker: "bg-red-500"
  },
  medical: {
    accent: "border-t-emerald-600",
    icon: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    soft: "bg-emerald-50/60",
    marker: "bg-emerald-600"
  },
  "self-inspection": {
    accent: "border-t-slate-700",
    icon: "bg-slate-100 text-slate-800 ring-slate-200",
    soft: "bg-slate-50",
    marker: "bg-slate-800"
  }
};

function programTheme(programId: string) {
  return PROGRAM_THEMES[programId] || PROGRAM_THEMES.kyt;
}

const ICONS = {
  AlertTriangle,
  BookOpen,
  BriefcaseMedical,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  ClockAlert,
  Database,
  FileText,
  Flame,
  Hospital,
  Layers3,
  Link2,
  ListChecks,
  MapPin,
  Plus,
  Send,
  ShieldAlert,
  ShieldCheck,
  Target,
  Workflow
};

const TABS = [
  { id: "overview", label: "Tổng quan", icon: Layers3 },
  { id: "workflow", label: "Luồng xử lý", icon: Workflow },
  { id: "checklist", label: "Điểm kiểm", icon: ClipboardCheck },
  { id: "records", label: "Bản ghi", icon: ListChecks },
  { id: "documents", label: "Tài liệu", icon: FileText }
] as const;

type TabId = (typeof TABS)[number]["id"];
type ProgramFallbackMeta = Pick<
  ProgramPayload,
  "cadence" | "documentCategories" | "icon" | "ownerRole" | "primaryAction" | "route" | "scope" | "subtitle" | "title"
>;

const FALLBACK_PROGRAMS: Record<string, ProgramFallbackMeta> = {
  kyt: {
    cadence: "Trước công việc có rủi ro",
    documentCategories: ["KYT", "Đánh giá rủi ro"],
    icon: "Target",
    ownerRole: "EHS + Tổ trưởng sản xuất",
    primaryAction: "Mở checklist KYT",
    route: "/safety-6s/kyt",
    scope: "Máy, line, công việc bất thường",
    subtitle: "Nhận diện nguy hiểm trước khi thao tác, chốt mục tiêu hành động và bằng chứng kiểm soát.",
    title: "KYT - Lường trước nguy hiểm"
  },
  pccc: {
    cadence: "Hằng tuần / sau bảo trì",
    documentCategories: ["PCCC", "An toàn điện"],
    icon: "Flame",
    ownerRole: "EHS + Bảo trì",
    primaryAction: "Kiểm tra PCCC",
    route: "/safety-6s/pccc",
    scope: "Tủ điện, lối thoát nạn, báo cháy",
    subtitle: "Theo dõi PCCC, an toàn điện, lối thoát nạn và bằng chứng khắc phục.",
    title: "PCCC & An toàn điện"
  },
  medical: {
    cadence: "Hằng tháng",
    documentCategories: ["Y tế", "Sơ cứu"],
    icon: "BriefcaseMedical",
    ownerRole: "Y tế + EHS",
    primaryAction: "Kiểm tra túi sơ cứu",
    route: "/safety-6s/medical",
    scope: "Phòng y tế, túi sơ cứu, vật tư",
    subtitle: "Quản lý vật tư sơ cứu, theo dõi thiết bị y tế và xu hướng sức khỏe tại xưởng.",
    title: "Y tế / Túi sơ cứu"
  },
  "self-inspection": {
    cadence: "Theo kế hoạch ATVSLĐ",
    documentCategories: ["Tự kiểm tra", "ATVSLĐ"],
    icon: "ListChecks",
    ownerRole: "Tiểu ban ATVSLĐ",
    primaryAction: "Lập biên bản kiểm tra",
    route: "/safety-6s/self-inspection",
    scope: "Bộ phận, khu vực, máy thiết bị",
    subtitle: "Ghi nhận tự kiểm tra ATVSLĐ, kết luận, finding và CAPA theo bộ phận.",
    title: "Tự kiểm tra ATVSLĐ"
  }
};

function iconFor(name: string) {
  return ICONS[name as keyof typeof ICONS] || ShieldCheck;
}

function isProgramPayload(payload?: ProgramPayload): payload is ProgramPayload {
  const record = payload && typeof payload === "object" ? payload : null;
  return Boolean(
    record &&
      typeof record.id === "string" &&
      typeof record.title === "string" &&
      Array.isArray(record.stats) &&
      Array.isArray(record.workflow) &&
      Array.isArray(record.checkpoints) &&
      Array.isArray(record.records) &&
      Array.isArray(record.apiPlan) &&
      Array.isArray(record.documents) &&
      record.charts &&
      Array.isArray(record.charts.status) &&
      Array.isArray(record.charts.departments) &&
      record.summary
  );
}

function buildFallbackProgram(programId: string): ProgramPayload | null {
  const meta = FALLBACK_PROGRAMS[programId];
  if (!meta) return null;
  const records: ProgramRecord[] = [
    {
      actionCode: "CAPA-PENDING",
      department: "Sản xuất",
      detail: "Bản ghi dự phòng giữ route chuyên đề hoạt động khi API /api/safety/programs chưa trả JSON.",
      dueDate: "2026-06-30",
      findings: 1,
      id: `${programId.toUpperCase()}-OPS-01`,
      location: "Line trọng điểm",
      owner: meta.ownerRole,
      progress: 72,
      risk: "medium",
      score: 82,
      status: "in_progress",
      title: `${meta.title} - checklist vận hành`
    },
    {
      department: "EHS",
      detail: "Bằng chứng và tài liệu gốc sẽ được nạp từ API thật sau khi backend sẵn sàng.",
      dueDate: "2026-07-15",
      findings: 0,
      id: `${programId.toUpperCase()}-EHS-02`,
      location: "Toàn công ty",
      owner: "EHS",
      progress: 100,
      risk: "low",
      score: 96,
      status: "closed",
      title: `${meta.title} - review tài liệu`
    }
  ];
  const openRecords = records.filter((record) => record.status !== "closed").length;
  const overdueRecords = records.filter((record) => record.status === "overdue").length;

  return {
    ...meta,
    apiPlan: [
      `GET /api/safety/programs/${programId}`,
      "POST /api/actions",
      "POST /api/documents/import-manifest",
      "GET /api/documents"
    ],
    charts: {
      departments: [
        { label: "Sản xuất", tone: "amber", value: 3 },
        { label: "EHS", tone: "blue", value: 2 },
        { label: "Bảo trì", tone: "emerald", value: 1 }
      ],
      status: [
        { label: "IN_PROGRESS", tone: "amber", value: openRecords },
        { label: "Đã đóng", tone: "emerald", value: records.length - openRecords }
      ]
    },
    checkpoints: [
      {
        group: "Nhận diện",
        id: `${programId}-hazard`,
        severity: "high",
        standard: "Người phụ trách xác nhận mối nguy, vùng ảnh hưởng và biện pháp ngăn chặn trước thao tác.",
        title: "Nhận diện mối nguy và phạm vi kiểm soát"
      },
      {
        group: "Bằng chứng",
        id: `${programId}-evidence`,
        severity: "medium",
        standard: "Có ảnh, biên bản, owner, deadline và liên kết CAPA nếu phát sinh finding.",
        title: "Bằng chứng đóng vòng xử lý"
      }
    ],
    dataSourceNote:
      "Dữ liệu dự phòng chỉ hiển thị khi API /api/safety/programs/* chưa trả JSON. Khi backend sẵn sàng, trang tự động ưu tiên dữ liệu thật từ database.",
    documents: [],
    id: programId,
    records,
    stats: [
      { helper: "Bản ghi mở cần theo dõi", icon: "ListChecks", id: "open", label: "IN_PROGRESS", tone: "amber", value: openRecords },
      { helper: "Bằng chứng sẽ nạp từ Document API", icon: "FileText", id: "documents", label: "Tài liệu", tone: "blue", value: 0 },
      { helper: "Checkpoint tối thiểu của route chuyên đề", icon: "ClipboardCheck", id: "checks", label: "Điểm kiểm", tone: "emerald", value: 2 },
      { helper: "Quá hạn trong dữ liệu dự phòng", icon: "ClockAlert", id: "overdue", label: "OVERDUE", tone: overdueRecords ? "red" : "emerald", value: overdueRecords }
    ],
    summary: {
      chunkCount: 0,
      documentCount: 0,
      indexedDocuments: 0,
      openRecords,
      overdueRecords
    },
    workflow: [
      {
        description: "Xác định công việc/khu vực cần kiểm soát và chọn checklist phù hợp.",
        evidence: "Checklist trên route chuyên đề",
        owner: meta.ownerRole,
        step: "01",
        title: "Chuẩn bị"
      },
      {
        description: "Ghi nhận finding, mức rủi ro, owner và hạn xử lý ngay trên hiện trường.",
        evidence: "Record + ảnh minh chứng",
        owner: "Người phụ trách khu vực",
        step: "02",
        title: "Thực hiện"
      },
      {
        description: "EHS review bằng chứng, mở CAPA nếu cần và đóng vòng phòng ngừa tái diễn.",
        evidence: "CAPA / biên bản review",
        owner: "EHS",
        step: "03",
        title: "Review"
      },
      {
        description: "Đồng bộ tài liệu, chỉ số và báo cáo tháng khi API backend đã sẵn sàng.",
        evidence: "API + document library",
        owner: "Admin hệ thống",
        step: "04",
        title: "Đồng bộ"
      }
    ]
  };
}

function toneClasses(tone: Tone, surface = false) {
  const map = {
    amber: surface
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-amber-200 text-amber-700",
    blue: surface
      ? "border-blue-200 bg-blue-50 text-blue-800"
      : "border-blue-200 text-blue-700",
    emerald: surface
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-emerald-200 text-emerald-700",
    red: surface
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-red-200 text-red-700",
    slate: surface
      ? "border-slate-200 bg-slate-50 text-slate-800"
      : "border-slate-200 text-slate-700"
  };
  return map[tone] || map.slate;
}

function statusLabel(status: string) {
  if (status === "closed") return "Đã đóng";
  if (status === "submitted") return "Chờ EHS review";
  if (status === "in_progress") return "IN_PROGRESS";
  if (status === "overdue") return "OVERDUE";
  return "OPEN";
}

function statusTone(status: string): Tone {
  if (status === "closed") return "emerald";
  if (status === "submitted") return "blue";
  if (status === "overdue") return "red";
  if (status === "in_progress") return "amber";
  return "slate";
}

function riskLabel(risk: string) {
  if (risk === "critical") return "CRITICAL";
  if (risk === "high") return "HIGH";
  if (risk === "medium") return "MEDIUM";
  return "LOW";
}

function riskTone(risk: string): Tone {
  if (risk === "critical" || risk === "high") return "red";
  if (risk === "medium") return "amber";
  return "emerald";
}

function StatCard({ stat }: { stat: ProgramStat }) {
  const Icon = iconFor(stat.icon);
  return (
    <article className={`rounded-lg border bg-white p-4 shadow-sm ${toneClasses(stat.tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">{stat.label}</p>
          <strong className="mt-2 block font-mono text-3xl leading-none text-slate-950">
            {stat.value}
            {stat.unit ? <span className="ml-1 text-lg">{stat.unit}</span> : null}
          </strong>
        </div>
        <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-lg ${toneClasses(stat.tone, true)}`}>
          <Icon className="size-5" />
        </span>
      </div>
      <p className="mt-3 text-xs font-bold leading-snug text-slate-500">{stat.helper}</p>
    </article>
  );
}

function BarChart({ data, title }: { data: ProgramChartItem[]; title: string }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-black text-slate-950">{title}</h3>
      <div className="mt-4 grid gap-3">
        {data.map((item) => {
          const width = Math.max(8, Math.round((item.value / max) * 100));
          return (
            <div className="grid gap-1.5" key={`${title}-${item.label}`}>
              <div className="flex items-center justify-between gap-3 text-xs font-bold">
                <span className="truncate text-slate-600">{item.label}</span>
                <span className="font-mono text-slate-950">{item.value}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${item.tone === "red" ? "bg-red-500" : item.tone === "amber" ? "bg-amber-400" : item.tone === "emerald" ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = statusTone(status);
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-black ${toneClasses(tone, true)}`}>{statusLabel(status)}</span>;
}

function RiskPill({ risk }: { risk: string }) {
  const tone = riskTone(risk);
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-black ${toneClasses(tone, true)}`}>{riskLabel(risk)}</span>;
}

function ProgressLine({ value }: { value: number }) {
  const tone = value >= 90 ? "bg-emerald-500" : value >= 70 ? "bg-blue-500" : value >= 50 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between text-xs font-bold">
        <span className="text-slate-500">Tiến độ</span>
        <span className="font-mono text-slate-900">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function ProgramHeader({ primaryRoute, program }: { primaryRoute: string; program: ProgramPayload }) {
  const Icon = iconFor(program.icon);
  const theme = programTheme(program.id);
  return (
    <header className={`rounded-lg border border-t-4 border-slate-200 bg-white p-4 shadow-sm md:p-5 ${theme.accent}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`inline-flex size-12 shrink-0 items-center justify-center rounded-lg shadow-sm ring-1 ${theme.icon}`}>
            <Icon className="size-6" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-black leading-tight text-slate-950 md:text-2xl">{program.title}</h2>
            <p className="mt-1 max-w-4xl text-sm font-medium leading-snug text-slate-600">{program.subtitle}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[program.ownerRole, program.cadence, program.scope].map((item) => (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600" key={item}>
                  <ShieldCheck className="size-3.5 text-emerald-700" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
        <Link className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#f5c400] px-4 text-sm font-black text-[#0f2a15] shadow-sm hover:bg-[#e0b300] sm:w-fit" to={primaryRoute}>
          <Plus className="size-4" />
          {program.primaryAction}
        </Link>
      </div>
    </header>
  );
}

function primaryRouteForProgram(programId: string) {
  return `/safety-6s/audits?create=1&program=${encodeURIComponent(programId)}`;
}

function ProgramOperationsLayers({ program }: { program: ProgramPayload }) {
  const theme = programTheme(program.id);
  const layers = [
    {
      id: "company",
      title: "Cấp công ty",
      icon: Layers3,
      metric: `${program.summary.documentCount} tài liệu gốc`,
      description: `Chuẩn hóa mục tiêu, tần suất và phạm vi áp dụng cho ${program.title}; theo dõi xu hướng trên báo cáo tháng.`
    },
    {
      id: "ehs",
      title: "Cấp EHS",
      icon: ShieldCheck,
      metric: `${program.summary.indexedDocuments} tài liệu đã index`,
      description: "Giữ template, kiểm tra bằng chứng, review điểm rủi ro và xác minh CAPA trước khi đóng vòng xử lý."
    },
    {
      id: "department",
      title: "Cấp bộ phận",
      icon: ClipboardCheck,
      metric: `${program.records.length} bản ghi vận hành`,
      description: `Thực hiện ${program.primaryAction.toLowerCase()}, cập nhật owner, deadline, ảnh/bằng chứng và phản hồi EHS đúng hạn.`
    }
  ];

  return (
    <article className={`rounded-lg border border-slate-200 p-4 shadow-sm lg:col-span-2 ${theme.soft}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-black text-slate-950">Phân tầng vận hành</h3>
          <p className="mt-1 text-sm font-medium leading-snug text-slate-600">Thiết kế theo đúng 3 cấp để Công ty nắm mục tiêu, EHS kiểm soát chuẩn, bộ phận xử lý hiện trường.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-black text-slate-600">
          <span className={`size-2 rounded-full ${theme.marker}`} />
          {program.cadence}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {layers.map((layer) => {
          const Icon = layer.icon;
          return (
            <div className="rounded-lg border border-slate-200 bg-white p-3" key={layer.id}>
              <div className="flex items-center gap-2">
                <span className="inline-flex size-8 items-center justify-center rounded-md bg-slate-50 text-slate-700">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <h4 className="text-sm font-black leading-tight text-slate-950">{layer.title}</h4>
                  <p className="mt-0.5 text-[11px] font-black uppercase text-slate-400">{layer.metric}</p>
                </div>
              </div>
              <p className="mt-3 text-sm font-medium leading-snug text-slate-600">{layer.description}</p>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function RecordDetailModal({
  onClose,
  record
}: {
  onClose: () => void;
  record: ProgramRecord | null;
}) {
  return (
    <ModalShell description="Chi tiết bản ghi chuyên đề, owner, deadline, finding và liên kết CAPA." onClose={onClose} open={Boolean(record)} title={record?.title || "Chi tiết bản ghi"}>
      {record ? (
        <div className="grid gap-4 p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="text-xs font-black uppercase text-slate-500">Mã</span>
              <strong className="mt-1 block font-mono text-sm text-blue-700">{record.id}</strong>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="text-xs font-black uppercase text-slate-500">Bộ phận</span>
              <strong className="mt-1 block text-sm text-slate-950">{record.department}</strong>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="text-xs font-black uppercase text-slate-500">Trạng thái</span>
              <div className="mt-1"><StatusPill status={record.status} /></div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="text-xs font-black uppercase text-slate-500">Rủi ro</span>
              <div className="mt-1"><RiskPill risk={record.risk} /></div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-black text-slate-950">Nội dung xử lý</h3>
              <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">{record.detail}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <MapPin className="size-4 text-blue-700" />
                  <span className="mt-2 block text-xs font-black uppercase text-slate-500">Khu vực</span>
                  <strong className="mt-1 block text-sm text-slate-950">{record.location}</strong>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <CalendarClock className="size-4 text-amber-700" />
                  <span className="mt-2 block text-xs font-black uppercase text-slate-500">Hạn xử lý</span>
                  <strong className="mt-1 block font-mono text-sm text-slate-950">{record.dueDate}</strong>
                </div>
              </div>
            </section>

            <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black uppercase text-slate-500">Owner</div>
              <strong className="mt-1 block text-slate-950">{record.owner}</strong>
              <div className="mt-4">
                <ProgressLine value={record.progress} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-md bg-white p-2 text-center">
                  <strong className="block font-mono text-xl text-slate-950">{record.score}%</strong>
                  <span className="text-[11px] font-bold text-slate-500">điểm</span>
                </div>
                <div className="rounded-md bg-white p-2 text-center">
                  <strong className="block font-mono text-xl text-red-700">{record.findings}</strong>
                  <span className="text-[11px] font-bold text-slate-500">finding</span>
                </div>
              </div>
              {record.actionCode ? (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                  <span className="block text-xs font-black uppercase text-blue-500">Liên kết CAPA</span>
                  <strong className="mt-1 block font-mono text-blue-800">{record.actionCode}</strong>
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      ) : null}
    </ModalShell>
  );
}

export function SafetySpecialProgramPage({ programId }: { programId: string }) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRecord, setSelectedRecord] = useState<ProgramRecord | null>(null);

  const programQuery = useQuery({
    queryKey: ["safety", "program", programId],
    queryFn: () => apiFetch<ProgramPayload>(`/api/safety/programs/${encodeURIComponent(programId)}`)
  });

  const fallbackProgram = useMemo(() => buildFallbackProgram(programId), [programId]);
  const program = isProgramPayload(programQuery.data) ? programQuery.data : fallbackProgram;

  const filteredRecords = useMemo(() => {
    if (!program) return [];
    const text = query.trim().toLowerCase();
    return program.records.filter((record) => {
      const matchesStatus = statusFilter === "all" || record.status === statusFilter;
      const matchesText =
        !text ||
        [record.id, record.title, record.department, record.location, record.owner, record.actionCode || ""]
          .some((item) => String(item).toLowerCase().includes(text));
      return matchesStatus && matchesText;
    });
  }, [program, query, statusFilter]);

  if (programQuery.isLoading && !program) {
    return <SafetyI18nRender>{<LoadingPanel label="Đang tải chương trình Safety" />}</SafetyI18nRender>;
  }

  if ((programQuery.error && !program) || !program) {
    return <SafetyI18nRender>{<ErrorPanel error={programQuery.error || new Error("Không tìm thấy chương trình Safety.")} />}</SafetyI18nRender>;
  }

  return (
    <SafetyI18nRender>
      <section className="mx-auto max-w-7xl space-y-5 pb-10">
        <ProgramHeader primaryRoute={primaryRouteForProgram(program.id)} program={program} />

        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))" }}>
          {program.stats.map((stat) => <StatCard key={stat.id} stat={stat} />)}
        </div>

        <nav className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <div className="flex min-w-max gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  className={`inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-black transition ${active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                >
                  <Icon className="size-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>

        {activeTab === "overview" ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-4 lg:grid-cols-2">
              <BarChart data={program.charts.status} title="Trạng thái xử lý" />
              <BarChart data={program.charts.departments} title="Bộ phận trọng điểm" />
              <ProgramOperationsLayers program={program} />
              <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
                <div className="flex items-center gap-2">
                  <Database className="size-5 text-blue-700" />
                  <h3 className="text-sm font-black text-slate-950">Nguồn dữ liệu</h3>
                </div>
                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">{program.dataSourceNote}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800">
                    <CheckCircle2 className="size-3.5" />
                    Tài liệu thật từ MySQL/OCR
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-800">
                    <Database className="size-3.5" />
                    Bản ghi mô phỏng theo tài liệu
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <strong className="block font-mono text-2xl text-slate-950">{program.summary.documentCount}</strong>
                    <span className="text-xs font-black uppercase text-slate-500">tài liệu gốc</span>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <strong className="block font-mono text-2xl text-emerald-700">{program.summary.indexedDocuments}</strong>
                    <span className="text-xs font-black uppercase text-slate-500">đã index</span>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <strong className="block font-mono text-2xl text-blue-700">{program.summary.chunkCount}</strong>
                    <span className="text-xs font-black uppercase text-slate-500">text chunks</span>
                  </div>
                </div>
              </article>
            </div>
            <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <BookOpen className="size-5 text-emerald-700" />
                <h3 className="font-black text-slate-950">API nghiệp vụ đề xuất</h3>
              </div>
              <div className="mt-3 grid gap-2">
                {program.apiPlan.map((item) => (
                  <code className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 font-mono text-xs font-bold text-slate-700" key={item}>{item}</code>
                ))}
              </div>
              <Link className="mt-4 inline-flex items-center gap-2 text-sm font-black text-blue-700 hover:underline" to="/safety-6s/reference">
                Xem kiến trúc tổng thể
                <ArrowRight className="size-4" />
              </Link>
            </aside>
          </div>
        ) : null}

        {activeTab === "workflow" ? (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="mb-4 flex items-center gap-2">
              <Workflow className="size-5 text-blue-700" />
              <h3 className="text-base font-black text-slate-950">Luồng nghiệp vụ chuẩn</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {program.workflow.map((step) => (
                <article className="rounded-lg border border-slate-200 bg-slate-50 p-4" key={step.step}>
                  <span className="inline-flex size-8 items-center justify-center rounded-md bg-slate-950 font-mono text-xs font-black text-white">{step.step}</span>
                  <h4 className="mt-3 text-sm font-black leading-tight text-slate-950">{step.title}</h4>
                  <p className="mt-2 text-sm font-medium leading-snug text-slate-600">{step.description}</p>
                  <div className="mt-3 rounded-md bg-white p-2 text-xs">
                    <span className="block font-black uppercase text-slate-400">Owner</span>
                    <strong className="text-slate-800">{step.owner}</strong>
                  </div>
                  <div className="mt-2 rounded-md bg-white p-2 text-xs">
                    <span className="block font-black uppercase text-slate-400">Bằng chứng</span>
                    <strong className="text-slate-800">{step.evidence}</strong>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === "checklist" ? (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="mb-4 flex items-center gap-2">
              <ClipboardCheck className="size-5 text-emerald-700" />
              <h3 className="text-base font-black text-slate-950">Điểm kiểm nghiệp vụ</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {program.checkpoints.map((item) => (
                <article className="rounded-lg border border-slate-200 p-4" key={item.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-500">{item.group}</span>
                      <h4 className="mt-3 text-sm font-black leading-tight text-slate-950">{item.title}</h4>
                    </div>
                    <RiskPill risk={item.severity} />
                  </div>
                  <p className="mt-2 text-sm font-medium leading-snug text-slate-600">{item.standard}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === "records" ? (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2">
                <ListChecks className="size-5 text-blue-700" />
                <h3 className="text-base font-black text-slate-950">Bản ghi vận hành</h3>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative min-w-0">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input className="min-h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm font-semibold sm:w-72" onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã, bộ phận, owner..." value={query} />
                </label>
                <select className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                  <option value="all">Tất cả trạng thái</option>
                  <option value="in_progress">Đang xử lý</option>
                  <option value="submitted">Chờ review</option>
                  <option value="closed">Đã đóng</option>
                  <option value="overdue">Quá hạn</option>
                </select>
              </div>
            </div>

            <div className="hidden overflow-x-auto rounded-lg border border-slate-200 lg:block">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    {["Mã", "Nội dung", "Bộ phận", "Rủi ro", "Trạng thái", "Hạn", "Owner", "Tiến độ", "Thao tác"].map((column) => (
                      <th className="border-b border-slate-200 px-3 py-3 font-black" key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => (
                    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50" key={record.id}>
                      <td className="px-3 py-3 align-top font-mono text-xs font-black text-blue-700">{record.id}</td>
                      <td className="px-3 py-3 align-top">
                        <strong className="block max-w-[260px] leading-snug text-slate-950">{record.title}</strong>
                        <span className="mt-1 block text-xs font-semibold text-slate-500">{record.location}</span>
                      </td>
                      <td className="px-3 py-3 align-top font-black text-slate-700">{record.department}</td>
                      <td className="px-3 py-3 align-top"><RiskPill risk={record.risk} /></td>
                      <td className="px-3 py-3 align-top"><StatusPill status={record.status} /></td>
                      <td className="px-3 py-3 align-top font-mono text-xs font-bold text-slate-600">{record.dueDate}</td>
                      <td className="px-3 py-3 align-top font-semibold text-slate-700">{record.owner}</td>
                      <td className="px-3 py-3 align-top"><div className="w-32"><ProgressLine value={record.progress} /></div></td>
                      <td className="px-3 py-3 align-top">
                        <button className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-700" onClick={() => setSelectedRecord(record)} title="Xem chi tiết" type="button">
                          <Eye className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 lg:hidden">
              {filteredRecords.map((record) => (
                <article className="rounded-lg border border-slate-200 p-4" key={record.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-black text-blue-700">{record.id}</span>
                      <h4 className="mt-1 text-sm font-black leading-tight text-slate-950">{record.title}</h4>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{record.department} - {record.location}</p>
                    </div>
                    <button className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500" onClick={() => setSelectedRecord(record)} type="button">
                      <Eye className="size-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <RiskPill risk={record.risk} />
                    <StatusPill status={record.status} />
                  </div>
                  <div className="mt-3"><ProgressLine value={record.progress} /></div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === "documents" ? (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="size-5 text-blue-700" />
              <h3 className="text-base font-black text-slate-950">Tài liệu gốc liên quan</h3>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))" }}>
              {program.documents.map((document) => (
                <article className="rounded-lg border border-slate-200 p-4" key={document.id}>
                  <div className="flex items-start gap-3">
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                      <FileText className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <h4 className="break-words text-sm font-black leading-snug text-slate-950">{document.name}</h4>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{document.category} - {document.documentType}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-slate-50 p-2">
                      <span className="block font-black uppercase text-slate-400">Index</span>
                      <strong className="text-emerald-700">{document.ocrStatus}</strong>
                    </div>
                    <div className="rounded-md bg-slate-50 p-2">
                      <span className="block font-black uppercase text-slate-400">Chunks</span>
                      <strong className="font-mono text-slate-950">{document.chunkCount}</strong>
                    </div>
                  </div>
                  <Link className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-blue-700 hover:underline" to="/safety-6s/documents">
                    Mở thư viện
                    <ExternalLink className="size-3.5" />
                  </Link>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <RecordDetailModal onClose={() => setSelectedRecord(null)} record={selectedRecord} />
      </section>
    </SafetyI18nRender>
  );
}

export default SafetySpecialProgramPage;
