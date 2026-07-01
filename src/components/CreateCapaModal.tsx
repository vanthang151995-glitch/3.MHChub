import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  MapPin,
  Save,
  ShieldAlert,
  Target,
  UserRound,
  Workflow,
  X
} from "lucide-react";
import { ModalShell } from "../pages/safety/safety-shared";

export type CapaCreateForm = {
  departmentCode: string;
  description: string;
  dueDate: string;
  locationId: string;
  ownerName: string;
  priority: string;
  problemType: string;
  sourceType: string;
  status: string;
  title: string;
  topic: string;
};

type Department = {
  code: string;
  name: string;
  divisionCode: string;
};

type Location = {
  id: string;
  code: string;
  name: string;
  departmentCode: string;
};

type CreateCapaModalProps = {
  departments: Department[];
  form: CapaCreateForm;
  locations: Location[];
  onChange: (next: CapaCreateForm) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  open: boolean;
  saving: boolean;
};

const SOURCE_OPTIONS = [
  { value: "manual", label: "Thủ công", icon: FileText, hint: "Tạo CAPA trực tiếp từ quan sát hoặc yêu cầu nội bộ." },
  { value: "warning", label: "Cảnh báo nóng", icon: ShieldAlert, hint: "Theo dõi vấn đề phát hiện từ cảnh báo an toàn." },
  { value: "incident", label: "Sự cố", icon: AlertTriangle, hint: "Ngăn tái diễn sau sự cố hoặc cận nguy." },
  { value: "audit", label: "Audit / 6S", icon: ClipboardList, hint: "Khắc phục điểm không phù hợp sau kiểm tra." },
  { value: "pccc", label: "PCCC", icon: Workflow, hint: "Theo dõi hành động liên quan phòng cháy chữa cháy." }
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Thấp", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { value: "medium", label: "Trung bình", className: "border-amber-200 bg-amber-50 text-amber-700" },
  { value: "high", label: "Cao", className: "border-orange-200 bg-orange-50 text-orange-700" },
  { value: "critical", label: "Khẩn", className: "border-red-200 bg-red-50 text-red-700" }
];

const PROBLEM_TYPE_OPTIONS = [
  { value: "MACH", label: "Máy móc & thiết bị" },
  { value: "ELEC", label: "An toàn điện" },
  { value: "CHEM", label: "Hóa chất nguy hiểm" },
  { value: "HEIGHT", label: "Làm việc trên cao" },
  { value: "VEHICLE", label: "Xe nâng / phương tiện" },
  { value: "PPE", label: "Bảo hộ lao động" },
  { value: "BEHAV", label: "Hành vi không an toàn" },
  { value: "NEAR", label: "Tình huống cận nguy" },
  { value: "FIRE", label: "PCCC & cháy nổ" },
  { value: "ENV", label: "Môi trường làm việc" },
  { value: "6S", label: "6S / vệ sinh công nghiệp" },
  { value: "ERGO", label: "Ergonomic / tư thế" }
];

function fieldLabelClass(auto = false) {
  return `text-xs font-black uppercase ${auto ? "text-blue-600" : "text-slate-500"}`;
}

export function CreateCapaModal({
  departments,
  form,
  locations,
  onChange,
  onClose,
  onSubmit,
  open,
  saving
}: CreateCapaModalProps) {
  const selectedSource = SOURCE_OPTIONS.find((item) => item.value === form.sourceType) || SOURCE_OPTIONS[0];
  const selectedPriority = PRIORITY_OPTIONS.find((item) => item.value === form.priority) || PRIORITY_OPTIONS[1];
  const visibleLocations = locations.filter((location) => location.departmentCode === form.departmentCode);
  const update = (patch: Partial<CapaCreateForm>) => onChange({ ...form, ...patch });

  return (
    <ModalShell
      description="Tạo CAPA theo luồng nguồn phát sinh, phân loại vấn đề, giao người xử lý và đặt hạn hoàn thành."
      onClose={onClose}
      open={open}
      title="Tạo CAPA"
    >
      <form className="grid gap-4 bg-slate-50 p-5" onSubmit={onSubmit}>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-full bg-blue-700 text-xs font-black text-white">1</span>
            <div>
              <h3 className="text-sm font-black uppercase text-slate-700">Nguồn phát sinh</h3>
              <p className="text-xs font-semibold text-slate-500">Chọn nhóm nguồn để CAPA được phân loại đúng ngay từ đầu.</p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-5">
            {SOURCE_OPTIONS.map((source) => {
              const active = form.sourceType === source.value;
              return (
                <button
                  className={`rounded-xl border p-3 text-left transition ${
                    active ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
                  }`}
                  key={source.value}
                  onClick={() => update({ sourceType: source.value })}
                  type="button"
                >
                  <source.icon className={`size-5 ${active ? "text-blue-700" : "text-slate-400"}`} />
                  <strong className="mt-2 block text-sm text-slate-950">{source.label}</strong>
                  <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{source.hint}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
            Đang chọn: <strong>{selectedSource.label}</strong>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-white">2</span>
            <div>
              <h3 className="text-sm font-black uppercase text-slate-700">Thông tin cơ bản</h3>
              <p className="text-xs font-semibold text-slate-500">Tiêu đề, mức ưu tiên, bộ phận phụ trách và hạn xử lý.</p>
            </div>
          </div>

          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className={fieldLabelClass()}>Tiêu đề CAPA</span>
              <input
                className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                onChange={(event) => update({ title: event.target.value })}
                placeholder="Ví dụ: Bổ sung che chắn khu vực thao tác..."
                required
                value={form.title}
              />
            </label>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1.5">
                <span className={fieldLabelClass()}>Bộ phận</span>
                <select
                  className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold"
                  onChange={(event) => update({ departmentCode: event.target.value, locationId: "" })}
                  value={form.departmentCode}
                >
                  {departments.map((department) => (
                    <option key={department.code} value={department.code}>
                      {department.code} - {department.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className={fieldLabelClass()}>Khu vực</span>
                <select
                  className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold"
                  onChange={(event) => update({ locationId: event.target.value })}
                  value={form.locationId}
                >
                  <option value="">Không chọn</option>
                  {visibleLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code} - {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className={fieldLabelClass()}>Hạn xử lý</span>
                <span className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="min-h-11 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm font-semibold"
                    onChange={(event) => update({ dueDate: event.target.value })}
                    type="date"
                    value={form.dueDate}
                  />
                </span>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
              <label className="grid gap-1.5">
                <span className={fieldLabelClass()}>Người phụ trách</span>
                <span className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="min-h-11 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm font-semibold"
                    onChange={(event) => update({ ownerName: event.target.value })}
                    placeholder="Tên người hoặc nhóm phụ trách"
                    value={form.ownerName}
                  />
                </span>
              </label>
              <div className="grid gap-1.5">
                <span className={fieldLabelClass()}>Ưu tiên</span>
                <div className="grid grid-cols-2 gap-2">
                  {PRIORITY_OPTIONS.map((priority) => (
                    <button
                      className={`rounded-lg border px-3 py-2 text-sm font-black ${form.priority === priority.value ? priority.className : "border-slate-200 bg-white text-slate-500"}`}
                      key={priority.value}
                      onClick={() => update({ priority: priority.value })}
                      type="button"
                    >
                      {priority.label}
                    </button>
                  ))}
                </div>
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${selectedPriority.className}`}>
                  Mức hiện tại: {selectedPriority.label}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-black text-white">3</span>
            <div>
              <h3 className="text-sm font-black uppercase text-slate-700">Phân tích và kế hoạch</h3>
              <p className="text-xs font-semibold text-slate-500">Mô tả rõ vấn đề, loại rủi ro và hành động mong muốn.</p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <label className="grid gap-1.5">
              <span className={fieldLabelClass()}>Mô tả vấn đề / hành động yêu cầu</span>
              <textarea
                className="min-h-40 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold leading-6 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                onChange={(event) => update({ description: event.target.value })}
                placeholder="Mô tả hiện trạng, nguy cơ, nguyên nhân sơ bộ và hành động cần thực hiện..."
                value={form.description}
              />
            </label>
            <div className="grid content-start gap-3">
              <label className="grid gap-1.5">
                <span className={fieldLabelClass()}>Chủ đề</span>
                <span className="relative">
                  <Target className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="min-h-11 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm font-semibold"
                    onChange={(event) => update({ topic: event.target.value })}
                    placeholder="PCCC, 6S, hóa chất..."
                    value={form.topic}
                  />
                </span>
              </label>
              <label className="grid gap-1.5">
                <span className={fieldLabelClass()}>Loại vấn đề</span>
                <select
                  className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold"
                  onChange={(event) => update({ problemType: event.target.value })}
                  value={form.problemType}
                >
                  <option value="">Chưa phân loại</option>
                  {PROBLEM_TYPE_OPTIONS.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                  <MapPin className="size-4" />
                  Tóm tắt
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                  {form.departmentCode || "-"} · {selectedSource.label} · hạn {form.dueDate || "-"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <footer className="sticky bottom-0 z-10 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
            <CheckCircle2 className="size-4 text-emerald-600" />
            Dữ liệu sẽ lưu vào API CAPA hiện tại.
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700"
              onClick={onClose}
              type="button"
            >
              <X className="size-4" />
              Hủy
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#f5c400] px-4 text-sm font-black text-[#0f2a15] disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Lưu CAPA
            </button>
          </div>
        </footer>
      </form>
    </ModalShell>
  );
}

export default CreateCapaModal;
