// @ts-nocheck
import { useState } from "react";
import { api } from "../services/api";
import "./SafetyBulletinCreateModal.css";

// ── Types ──────────────────────────────────────────────────────────────────
type Tone   = "alert" | "watch" | "good";
type Level  = "critical" | "warning" | "good" | "info";

interface DraftItem {
  id: string; title: string; body: string; level: Level;
  location: string; reporter: string; date: string;
  actions: string[]; next: string[];
}
interface DraftGroup { key: string; items: DraftItem[]; }

interface Props {
  onClose: () => void;
  onSaved?: (bulletin: unknown) => void;
  initialData?: unknown;
  editId?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────
const PRESET_GROUPS = ["TNLĐ / Cận nguy", "Y tế & sức khỏe", "6S / PCCC / Risk", "Chỉ đạo & việc cần làm", "Đào tạo & TSS"];
const GROUP_ORDER   = ["TNLĐ / Cận nguy", "Y tế & sức khỏe", "6S / PCCC / Risk", "Chỉ đạo & việc cần làm", "Đào tạo & TSS", "Nội dung họp"];

function classifyGroup(lbl: string, bd: string): string {
  const t = (lbl + " " + bd).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/(tnld|tai nan|can nguy|thuong tich|chan thuong|bi thuong|su co|chay|ngo doc|bong|khi doc|tu vong|ap luc|nguy hiem cap|canh bao nguon|pccc chay)/.test(t)) return "TNLĐ / Cận nguy";
  if (/(y te|suc khoe|kham|thuoc|benh|bac si|khu sinh|thai|bao hiem y|cap cuu|phong kham|y bac|noi tiet|mat|rang|khop|long|tinh than|dinh duong)/.test(t)) return "Y tế & sức khỏe";
  if (/(6s|loto|hoa chat|moi truong|nuoc thai|bui|on|bon rua|sang loc|sap xep|san soc|sach se|rac|kiem dinh|thiet bi|bao ho|quy trinh|khu vuc san|chat thai|pccc|vat tu|tu dien|canh bao khu vuc)/.test(t)) return "6S / PCCC / Risk";
  if (/(chi dao|yeu cau|bat buoc|tbm|bien ban|thong bao|giam doc|truong phong|lanh dao|quy dinh|noi quy|tuyen duong|khen thuong|xu ly|ky luat|thi dua|bao cao|de nghi|chi thi|tong ket|ket qua hop|hop ban|phoi hop|xin y kien)/.test(t)) return "Chỉ đạo & việc cần làm";
  if (/(dao tao|huan luyen|tap huan|van ban|tss|chung chi|luat|nghi dinh|thong tu|qcvn|nang cao|nhan thuc|hoc|thi|ky nang|giao duc|biet|noi dung moi)/.test(t)) return "Đào tạo & TSS";
  return "Nội dung họp";
}

const TONE_OPT = [
  { value: "alert" as Tone, label: "Cần chú ý",   desc: "Có sự cố / TNLĐ ưu tiên cao", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  { value: "watch" as Tone, label: "Theo dõi",    desc: "Có điểm cần theo dõi thêm",   color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  { value: "good"  as Tone, label: "Bình thường", desc: "Không có sự cố đáng kể",      color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
];

const LEVEL_OPT = [
  { value: "critical" as Level, label: "Ưu tiên cao",  color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  { value: "warning"  as Level, label: "Cần theo dõi", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  { value: "good"     as Level, label: "Bình thường",  color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
  { value: "info"     as Level, label: "Thông tin",    color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
];

const GROUP_STRIP: Record<string, string> = {
  "TNLĐ / Cận nguy":        "#dc2626",
  "Y tế & sức khỏe":        "#d97706",
  "6S / PCCC / Risk":       "#2563eb",
  "Chỉ đạo & việc cần làm": "#7c3aed",
  "Đào tạo & TSS":          "#059669",
};

function makeId() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  const d = new Date();
  return `T${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function monthFromDate(dateStr: string): string {
  if (!dateStr) return currentMonth();
  try {
    const d = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(d.getTime())) return currentMonth();
    return `T${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch { return currentMonth(); }
}

function viText(field: unknown): string {
  if (!field) return "";
  if (typeof field === "string") return field;
  if (typeof field === "object") return (field as Record<string, string>).vi || (field as Record<string, string>).en || "";
  return "";
}

// ── Pre-populate state from a raw API bulletin ─────────────────────────────
function initFromRaw(data: unknown): {
  title: string; month: string; date: string; tone: Tone;
  audience: string; groups: DraftGroup[];
} {
  const defaults = { title: "", month: currentMonth(), date: todayISO(), tone: "watch" as Tone, audience: "Tất cả bộ phận", groups: [] as DraftGroup[] };
  if (!data) return defaults;
  const d = data as Record<string, unknown>;

  const date = typeof d.date === "string" && d.date ? d.date : todayISO();
  const tone = (["alert", "watch", "good"].includes(d.tone as string) ? d.tone : "watch") as Tone;

  // Build groups from bulletin.groups (rich format, stored after our fix)
  // or fall back to points.vi (flat legacy format)
  let groups: DraftGroup[] = [];
  const rawGroups = d.groups;
  if (Array.isArray(rawGroups) && rawGroups.length > 0) {
    groups = (rawGroups as Record<string, unknown>[]).map(g => ({
      key: String(g.key || "Nhóm"),
      items: (Array.isArray(g.items) ? g.items as Record<string, unknown>[] : []).map(it => ({
        id:       String(it.id   || ""),
        title:    String(it.title || ""),
        body:     String(it.body  || ""),
        level:    (["critical","warning","good","info"].includes(it.level as string) ? it.level : "info") as Level,
        location: String(it.location || ""),
        reporter: String(it.reporter || ""),
        date:     String(it.date     || ""),
        actions:  Array.isArray(it.actions) && (it.actions as string[]).filter(Boolean).length > 0
                    ? (it.actions as string[]).filter(Boolean)
                    : [""],
        next:     Array.isArray(it.next) && (it.next as string[]).filter(Boolean).length > 0
                    ? (it.next as string[]).filter(Boolean)
                    : [""],
      })),
    }));
  } else {
    // Legacy: convert points.vi flat array → auto-classified groups
    const pts = d.points as Record<string, unknown>;
    const ptArr = Array.isArray(pts?.vi) ? pts.vi as unknown[]
                : Array.isArray(d.points) ? d.points as unknown[]
                : [];
    if (ptArr.length > 0) {
      const legacyMap = new Map<string, DraftItem[]>();
      ptArr.forEach((p, idx) => {
        const isObj = p && typeof p === "object";
        const po = (isObj ? p : {}) as Record<string, unknown>;
        let title: string, body: string;
        if (isObj) {
          title = String(po.title || po.text || "");
          body  = String(po.body  || po.detail || "");
        } else {
          const str = String(p || "").trim();
          const ci  = str.indexOf(":");
          if (ci > 0 && ci <= 48) { title = str.slice(0, ci).trim(); body = str.slice(ci + 1).trim(); }
          else { title = str; body = ""; }
        }
        const gKey = classifyGroup(title, body);
        if (!legacyMap.has(gKey)) legacyMap.set(gKey, []);
        legacyMap.get(gKey)!.push({
          id:       `P${String(idx + 1).padStart(3, "0")}`,
          title,
          body,
          level:    "info" as Level,
          location: "",
          reporter: "",
          date:     "",
          actions:  isObj && Array.isArray(po.actions) ? (po.actions as string[]).filter(Boolean) : [""],
          next:     isObj && Array.isArray(po.next)    ? (po.next    as string[]).filter(Boolean) : [""],
        });
      });
      groups = GROUP_ORDER.filter(k => legacyMap.has(k)).map(k => ({ key: k, items: legacyMap.get(k)! }));
    }
  }

  return {
    title:    viText(d.title)    || "",
    month:    monthFromDate(date),
    date,
    tone,
    audience: viText(d.audience) || "Tất cả bộ phận",
    groups,
  };
}

const EMPTY_ITEM = (): DraftItem => ({
  id: "", title: "", body: "", level: "info",
  location: "", reporter: "", date: "",
  actions: [""], next: [""],
});

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 11px", borderRadius: 8, border: "1px solid #e2e8f0",
  fontSize: 13, color: "#0f172a", outline: "none", background: "#ffffff",
  boxSizing: "border-box", fontFamily: "inherit",
};

const addRowBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
  padding: "5px 10px", borderRadius: 7,
  border: "1px dashed #e2e8f0", background: "#f8fafc",
  color: "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer", marginTop: 2,
};

// ── Main ───────────────────────────────────────────────────────────────────
export function SafetyBulletinCreateModal({ onClose, onSaved, initialData, editId }: Props) {
  const isEditMode = !!editId;
  const isCurrentlyPublished = isEditMode ? ((initialData as Record<string,unknown>)?.published !== false) : false;

  // Pre-populate from initialData (for edit) or use defaults (for create)
  const _init = initFromRaw(initialData);

  const [step,  setStep]  = useState(1);
  const [saved, setSaved] = useState(false);
  const [savedPublished, setSavedPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedBulletin, setSavedBulletin] = useState(null as unknown | null);

  // Step 1
  const [title,    setTitle]    = useState(_init.title);
  const [month,    setMonth]    = useState(_init.month);
  const [date,     setDate]     = useState(_init.date);
  const [tone,     setTone]     = useState(_init.tone);
  const [audience, setAudience] = useState(_init.audience);

  // Step 2
  const [groups,          setGroups]  = useState(_init.groups);
  const [activeGroupIdx,  setAGI]     = useState(0);
  const [activeItemIdx,   setAII]     = useState(null as number | null);
  const [newGroupName,    setNGN]     = useState("");
  const [showGroupPicker, setSGP]     = useState(false);

  // ── Group helpers ──────────────────────────────────────────────────────
  const addGroup = (key: string) => {
    if (groups.find(g => g.key === key)) return;
    setGroups(prev => [...prev, { key, items: [] }]);
    setAGI(groups.length);
    setSGP(false);
    setNGN("");
  };

  const removeGroup = (idx: number) => {
    setGroups(prev => prev.filter((_, i) => i !== idx));
    setAGI(Math.max(0, idx - 1));
    setAII(null);
  };

  // ── Item helpers ───────────────────────────────────────────────────────
  const addItem = () => {
    setGroups(prev => prev.map((g, i) => i === activeGroupIdx ? { ...g, items: [...g.items, EMPTY_ITEM()] } : g));
    setAII(groups[activeGroupIdx]?.items.length ?? 0);
  };

  const removeItem = (itemIdx: number) => {
    setGroups(prev => prev.map((g, i) => i === activeGroupIdx ? { ...g, items: g.items.filter((_, ii) => ii !== itemIdx) } : g));
    setAII(null);
  };

  const updateItem = (itemIdx: number, patch: Partial<DraftItem>) => {
    setGroups(prev => prev.map((g, gi) =>
      gi !== activeGroupIdx ? g : { ...g, items: g.items.map((it, ii) => ii !== itemIdx ? it : { ...it, ...patch }) }
    ));
  };

  const updateList = (itemIdx: number, field: "actions" | "next", listIdx: number, val: string) => {
    setGroups(prev => prev.map((g, gi) =>
      gi !== activeGroupIdx ? g : {
        ...g, items: g.items.map((it, ii) => {
          if (ii !== itemIdx) return it;
          const arr = [...it[field]]; arr[listIdx] = val;
          return { ...it, [field]: arr };
        }),
      }
    ));
  };

  const addListRow = (itemIdx: number, field: "actions" | "next") => {
    setGroups(prev => prev.map((g, gi) =>
      gi !== activeGroupIdx ? g : { ...g, items: g.items.map((it, ii) => ii !== itemIdx ? it : { ...it, [field]: [...it[field], ""] }) }
    ));
  };

  const removeListRow = (itemIdx: number, field: "actions" | "next", listIdx: number) => {
    setGroups(prev => prev.map((g, gi) =>
      gi !== activeGroupIdx ? g : { ...g, items: g.items.map((it, ii) => ii !== itemIdx ? it : { ...it, [field]: it[field].filter((_, li) => li !== listIdx) }) }
    ));
  };

  const moveItem = (itemIdx: number, targetGroupKey: string) => {
    if (!curGroup || targetGroupKey === curGroup.key) return;
    const targetGI = groups.findIndex(g => g.key === targetGroupKey);
    if (targetGI === -1) return;
    const item = curGroup.items[itemIdx];
    const targetLen = groups[targetGI].items.length;
    setGroups(prev => prev.map((g, gi) => {
      if (gi === activeGroupIdx) return { ...g, items: g.items.filter((_, ii) => ii !== itemIdx) };
      if (gi === targetGI) return { ...g, items: [...g.items, item] };
      return g;
    }));
    setAGI(targetGI);
    setAII(targetLen);
  };

  // ── Derived ───────────────────────────────────────────────────────────
  const curGroup   = groups[activeGroupIdx];
  const curItem    = activeItemIdx !== null ? curGroup?.items[activeItemIdx] : null;
  const totalItems = groups.reduce((s, g) => s + g.items.length, 0);
  const tm         = TONE_OPT.find(t => t.value === tone) || TONE_OPT[1];
  const canNext1   = title.trim().length > 3;
  const canNext2   = groups.length > 0 && totalItems > 0;

  // ── Save ──────────────────────────────────────────────────────────────
  // publishNow=true → published:true; publishNow=false → draft (published:false)
  const handleSave = async (publishNow: boolean) => {
    setSaving(true);
    setSaveError("");
    try {
      const cleanedGroups = groups.map(g => ({
        key: g.key,
        items: g.items.map(it => ({
          ...it,
          id:      it.id || makeId(),
          actions: it.actions.filter(a => a.trim()),
          next:    it.next.filter(n => n.trim()),
        })),
      }));

      // Keep points.vi in sync for legacy display fallback
      const allTitles = cleanedGroups.flatMap(g => g.items.map(i => i.title)).filter(Boolean);

      const payload = {
        date,
        tone,
        title:    { vi: title,    en: title,    ja: title    },
        summary:  { vi: "", en: "", ja: "" },
        points:   { vi: allTitles, en: [], ja: [] },
        audience: { vi: audience, en: audience, ja: audience },
        groups:   cleanedGroups,
        published: publishNow,
      };

      let result: unknown;
      if (isEditMode) {
        result = await api.updateSafetyBulletin(editId, payload);
      } else {
        result = await api.createSafetyBulletin(payload);
      }

      setSavedBulletin(result);
      setSavedPublished(publishNow);
      setSaved(true);
      onSaved?.(result);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Lưu không thành công, vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  // ── Success screen ────────────────────────────────────────────────────
  if (saved) {
    const successTitle   = isEditMode
      ? (savedPublished ? "Đã cập nhật và xuất bản!" : "Đã cập nhật bản nháp!")
      : (savedPublished ? "Bảng tin đã được đăng!"   : "Đã lưu bản nháp!");
    const successSub   = isEditMode
      ? (savedPublished ? "Thay đổi đã được lưu và bảng tin đang hiển thị." : "Bản nháp đã được cập nhật — chưa công bố.")
      : (savedPublished ? "Bảng tin đang hiển thị trên trang chủ."          : "Bản nháp đã lưu — chưa công bố. Có thể xuất bản sau.");
    const iconBg = savedPublished ? "#ecfdf5" : "#fffbeb";
    const iconBorder = savedPublished ? "#a7f3d0" : "#fde68a";
    const iconStroke = savedPublished ? "#059669" : "#d97706";
    const iconPath = savedPublished
      ? <polyline points="20 6 9 17 4 12"/>
      : <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>;

    return (
      <div className="sbcm-overlay" role="dialog" aria-modal="true">
        <div className="sbcm-root" style={{ width: 480, background: "#fff", borderRadius: 16, padding: "48px 40px", textAlign: "center", boxShadow: "0 24px 64px rgba(15,30,60,0.2)", maxWidth: "calc(100vw - 48px)" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: iconBg, border: `2px solid ${iconBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2.5" strokeLinecap="round">{iconPath}</svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>{successTitle}</div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}><strong>{title}</strong></div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 28 }}>
            {totalItems} ý chính · {groups.length} nhóm · {month}
          </div>
          {!savedPublished && !isEditMode && (
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 9, padding: "9px 14px", fontSize: 12, color: "#92400e", marginBottom: 20, textAlign: "left" }}>
              ℹ️ Bản nháp chỉ hiển thị với admin. Mở lại bảng tin và nhấn <strong>Xuất bản</strong> khi sẵn sàng.
            </div>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 9, background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Đóng
            </button>
            {!isEditMode && (
              <button onClick={() => { setSaved(false); setStep(1); setTitle(""); setMonth(currentMonth()); setDate(todayISO()); setTone("watch"); setAudience("Tất cả bộ phận"); setGroups([]); setAGI(0); setAII(null); }}
                style={{ padding: "10px 24px", borderRadius: 9, background: "#f59e0b", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                + Tạo bảng tin mới
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sbcm-overlay" role="dialog" aria-modal="true">
      <div className="sbcm-root" style={{
        width: 1020, maxWidth: "calc(100vw - 48px)",
        height: 680, maxHeight: "calc(100vh - 48px)",
        background: "#ffffff",
        borderRadius: 16, overflow: "hidden",
        boxShadow: "0 24px 64px rgba(15,30,60,0.22), 0 4px 16px rgba(15,30,60,0.1)",
        border: "1px solid #e2e8f0",
        display: "flex", flexDirection: "column",
      }}>

        {/* ── TOPBAR ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderBottom: "1px solid #e8edf3", background: "#ffffff", flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: isEditMode ? "#eff6ff" : "#fffbeb", border: isEditMode ? "1px solid #bfdbfe" : "1px solid #fde68a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {isEditMode
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.4" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.4" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            }
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.7px" }}>An toàn lao động · MHChub</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
              {isEditMode ? "Chỉnh sửa bảng tin" : "Tạo bảng tin mới"}
              {isEditMode && !isCurrentlyPublished && (
                <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a", borderRadius: 20, padding: "2px 7px" }}>NHÁP</span>
              )}
            </div>
          </div>
          <button onClick={onClose} title="Đóng" style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* ── STEP BAR ───────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", padding: "0 18px", borderBottom: "1px solid #e8edf3", background: "#fff", flexShrink: 0 }}>
          {[
            { n: 1, label: "Thông tin cơ bản" },
            { n: 2, label: "Nhóm & Ý chính"  },
            { n: 3, label: "Xem lại & Lưu"   },
          ].map((s, i) => {
            const done   = step > s.n;
            const active = step === s.n;
            return (
              <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 14px", borderBottom: active ? "2px solid #f59e0b" : "2px solid transparent", marginBottom: -1 }}>
                  <span style={{ width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, background: done ? "#059669" : active ? "#f59e0b" : "#e2e8f0", color: (done || active) ? "#fff" : "#94a3b8" }}>
                    {done ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> : s.n}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: active ? 700 : 500, color: active ? "#b45309" : done ? "#475569" : "#94a3b8" }}>{s.label}</span>
                </div>
                {i < 2 && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>}
              </div>
            );
          })}
          <div style={{ flex: 1 }} />
          {step === 2 && <span style={{ fontSize: 11.5, color: "#94a3b8", paddingRight: 4 }}>{totalItems} ý chính · {groups.length} nhóm</span>}
        </div>

        {/* ── BODY ───────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* ── STEP 1: BASIC INFO ──────────────────────────────────────── */}
          {step === 1 && (
            <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
              <div style={{ maxWidth: 600, display: "flex", flexDirection: "column", gap: 20 }}>

                <CField label="Tiêu đề bảng tin" required>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="VD: Họp AT T06/2026 — Kết quả kiểm tra định kỳ"
                    style={inputStyle} autoFocus={!isEditMode} />
                </CField>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <CField label="Tháng / Kỳ" required>
                    <input value={month} onChange={e => setMonth(e.target.value)} placeholder="T06/2026" style={inputStyle} />
                  </CField>
                  <CField label="Ngày họp" required>
                    <input type="date" value={date} onChange={e => { setDate(e.target.value); setMonth(monthFromDate(e.target.value)); }} style={inputStyle} />
                  </CField>
                </div>

                <CField label="Đối tượng">
                  <select value={audience} onChange={e => setAudience(e.target.value)} style={inputStyle}>
                    <option>Tất cả bộ phận</option>
                    <option>Sản xuất + EHS</option>
                    <option>EHS / Ban AT</option>
                    <option>Quản lý cấp trung</option>
                    <option>Kỹ thuật + Bảo trì</option>
                  </select>
                </CField>

                <CField label="Mức độ bảng tin" required>
                  <div style={{ display: "flex", gap: 10 }}>
                    {TONE_OPT.map(t => (
                      <button key={t.value} onClick={() => setTone(t.value)}
                        style={{ flex: 1, padding: "12px 10px", borderRadius: 10, cursor: "pointer", textAlign: "left", border: `2px solid ${tone === t.value ? t.border : "#e2e8f0"}`, background: tone === t.value ? t.bg : "#ffffff", transition: "all 0.12s" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: tone === t.value ? t.color : "#475569" }}>{t.label}</span>
                        </div>
                        <span style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>{t.desc}</span>
                      </button>
                    ))}
                  </div>
                </CField>

                {title && (
                  <div style={{ background: tm.bg, border: `1px solid ${tm.border}`, borderLeft: `4px solid ${tm.color}`, borderRadius: 10, padding: "12px 16px" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Xem trước</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{title}</div>
                    <div style={{ fontSize: 11.5, color: "#64748b" }}>{month} · {audience}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 2: GROUPS & ITEMS ──────────────────────────────────── */}
          {step === 2 && (
            <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

              {/* Left navigator */}
              <div style={{ width: 240, borderRight: "1px solid #e8edf3", display: "flex", flexDirection: "column", background: "#f8fafc" }}>
                <div style={{ padding: "10px 12px 6px", fontSize: 9.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.6px" }}>Nhóm nội dung</div>

                {groups.length === 0 && (
                  <div style={{ padding: "16px 14px", fontSize: 12, color: "#94a3b8", textAlign: "center", lineHeight: 1.5 }}>Chưa có nhóm.<br />Nhấn + để thêm.</div>
                )}

                {groups.map((g, gi) => {
                  const strip = GROUP_STRIP[g.key] || "#64748b";
                  const isAct = gi === activeGroupIdx;
                  return (
                    <div key={g.key}>
                      <div onClick={() => { setAGI(gi); setAII(null); }}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 12px", borderLeft: isAct ? `3px solid ${strip}` : "3px solid transparent", background: isAct ? "#ffffff" : "transparent", cursor: "pointer", transition: "all 0.11s" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: strip, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 12, fontWeight: isAct ? 700 : 500, color: isAct ? "#0f172a" : "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.key}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, background: isAct ? strip : "#e2e8f0", color: isAct ? "#fff" : "#64748b", borderRadius: 20, padding: "1px 6px" }}>{g.items.length}</span>
                        <button onClick={e => { e.stopPropagation(); removeGroup(gi); }} style={{ width: 16, height: 16, borderRadius: 4, border: "none", background: "none", color: "#94a3b8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>×</button>
                      </div>

                      {isAct && g.items.map((it, ii) => (
                        <div key={ii} onClick={() => setAII(ii)}
                          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px 7px 24px", background: activeItemIdx === ii ? "#f0f4f7" : "transparent", cursor: "pointer", borderLeft: "3px solid transparent" }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: LEVEL_OPT.find(l => l.value === it.level)?.color || "#94a3b8", flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 11.5, color: activeItemIdx === ii ? "#0f172a" : "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: activeItemIdx === ii ? 600 : 400 }}>
                            {it.title || <em style={{ color: "#94a3b8" }}>Chưa có tiêu đề</em>}
                          </span>
                          <button onClick={e => { e.stopPropagation(); removeItem(ii); }} style={{ width: 14, height: 14, border: "none", background: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12, flexShrink: 0, padding: 0 }}>×</button>
                        </div>
                      ))}

                      {isAct && (
                        <button onClick={addItem} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px 6px 24px", width: "100%", background: "none", border: "none", color: strip, fontSize: 11.5, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Thêm ý chính
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Add group */}
                <div style={{ padding: "8px 12px", marginTop: "auto", borderTop: "1px solid #e8edf3" }}>
                  {showGroupPicker ? (
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>Chọn nhóm</div>
                      {PRESET_GROUPS.filter(g => !groups.find(gr => gr.key === g)).map(pg => (
                        <button key={pg} onClick={() => addGroup(pg)} style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 8px", borderRadius: 7, border: "none", background: "none", fontSize: 12, color: "#334155", cursor: "pointer", marginBottom: 2 }}>
                          + {pg}
                        </button>
                      ))}
                      <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
                        <input value={newGroupName} onChange={e => setNGN(e.target.value)} placeholder="Tên nhóm khác..."
                          style={{ flex: 1, fontSize: 11.5, padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: 7, outline: "none" }}
                          onKeyDown={e => e.key === "Enter" && newGroupName.trim() && addGroup(newGroupName.trim())} />
                        <button onClick={() => newGroupName.trim() && addGroup(newGroupName.trim())} style={{ padding: "5px 8px", borderRadius: 7, background: "#f59e0b", border: "none", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>OK</button>
                      </div>
                      <button onClick={() => setSGP(false)} style={{ marginTop: 5, fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }}>Huỷ</button>
                    </div>
                  ) : (
                    <button onClick={() => setSGP(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 10px", borderRadius: 8, border: "1px dashed #e2e8f0", background: "#ffffff", color: "#475569", fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Thêm nhóm
                    </button>
                  )}
                </div>
              </div>

              {/* Right: item form */}
              <div style={{ flex: 1, overflowY: "auto", background: "#ffffff" }}>
                {curItem !== null && activeItemIdx !== null && curGroup ? (
                  <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Group selector header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderLeft: `3px solid ${GROUP_STRIP[curGroup.key] || "#64748b"}`, borderRadius: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", flexShrink: 0 }}>NHÓM</span>
                      {groups.length > 1 ? (
                        <select value={curGroup.key} onChange={e => moveItem(activeItemIdx, e.target.value)}
                          style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 12.5, fontWeight: 700, color: GROUP_STRIP[curGroup.key] || "#64748b", cursor: "pointer", appearance: "none" }}>
                          {groups.map(g => <option key={g.key} value={g.key}>{g.key}</option>)}
                        </select>
                      ) : (
                        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: GROUP_STRIP[curGroup.key] || "#64748b" }}>{curGroup.key}</span>
                      )}
                      <span style={{ fontSize: 10.5, color: "#94a3b8", flexShrink: 0 }}>Ý {activeItemIdx + 1}/{curGroup.items.length}</span>
                    </div>

                    <CField label="Tiêu đề ý chính" required>
                      <input value={curItem.title} onChange={e => updateItem(activeItemIdx, { title: e.target.value })} placeholder="VD: Cận nguy kẹp tay tại khu A" style={inputStyle} />
                    </CField>

                    <CField label="Mô tả chi tiết" required>
                      <textarea value={curItem.body} onChange={e => updateItem(activeItemIdx, { body: e.target.value })} placeholder="Mô tả tình huống, sự cố, kết quả..." style={{ ...inputStyle, height: 72, resize: "vertical" }} />
                    </CField>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <CField label="Mức độ" required>
                        <select value={curItem.level} onChange={e => updateItem(activeItemIdx, { level: e.target.value as Level })} style={inputStyle}>
                          {LEVEL_OPT.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                        </select>
                      </CField>
                      <CField label="Ngày xảy ra">
                        <input value={curItem.date} onChange={e => updateItem(activeItemIdx, { date: e.target.value })} placeholder="VD: 01/06/2026 07:45" style={inputStyle} />
                      </CField>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <CField label="Địa điểm">
                        <input value={curItem.location} onChange={e => updateItem(activeItemIdx, { location: e.target.value })} placeholder="VD: Khu vực B" style={inputStyle} />
                      </CField>
                      <CField label="Người báo cáo">
                        <input value={curItem.reporter} onChange={e => updateItem(activeItemIdx, { reporter: e.target.value })} placeholder="VD: Nguyễn Văn A · PE1" style={inputStyle} />
                      </CField>
                    </div>

                    <CField label="Hành động đã thực hiện">
                      {curItem.actions.map((a, li) => (
                        <div key={li} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#059669", flexShrink: 0, marginTop: 10 }} />
                          <input value={a} onChange={e => updateList(activeItemIdx, "actions", li, e.target.value)} placeholder={`Hành động ${li + 1}...`} style={{ ...inputStyle, flex: 1 }} />
                          {curItem.actions.length > 1 && <button onClick={() => removeListRow(activeItemIdx, "actions", li)} style={{ width: 26, height: 34, borderRadius: 7, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#94a3b8", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>×</button>}
                        </div>
                      ))}
                      <button onClick={() => addListRow(activeItemIdx, "actions")} style={addRowBtn}>+ Thêm hành động</button>
                    </CField>

                    <CField label="Hành động tiếp theo">
                      {curItem.next.map((n, li) => (
                        <div key={li} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", border: "2px solid #cbd5e1", flexShrink: 0, marginTop: 10 }} />
                          <input value={n} onChange={e => updateList(activeItemIdx, "next", li, e.target.value)} placeholder={`Việc cần làm ${li + 1}...`} style={{ ...inputStyle, flex: 1 }} />
                          {curItem.next.length > 1 && <button onClick={() => removeListRow(activeItemIdx, "next", li)} style={{ width: 26, height: 34, borderRadius: 7, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#94a3b8", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>×</button>}
                        </div>
                      ))}
                      <button onClick={() => addListRow(activeItemIdx, "next")} style={addRowBtn}>+ Thêm việc cần làm</button>
                    </CField>
                  </div>
                ) : (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, color: "#94a3b8", textAlign: "center", height: "100%" }}>
                    {groups.length === 0 ? (
                      <>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>Thêm nhóm đầu tiên</div>
                        <div style={{ fontSize: 12, lineHeight: 1.6 }}>Nhấn <strong>+ Thêm nhóm</strong> bên trái để bắt đầu.</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>✏️</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>Chọn hoặc thêm ý chính</div>
                        <div style={{ fontSize: 12, lineHeight: 1.6 }}>Click vào ý chính bên trái hoặc nhấn <strong>+ Thêm ý chính</strong>.</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 3: REVIEW ──────────────────────────────────────────── */}
          {step === 3 && (
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
              <div style={{ background: tm.bg, border: `1px solid ${tm.border}`, borderLeft: `4px solid ${tm.color}`, borderRadius: 12, padding: "16px 20px", marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ display: "flex", gap: 7, marginBottom: 8 }}>
                      <CBadge label={tm.label}   color={tm.color}   bg={tm.bg}   border={tm.border} />
                      <CBadge label={month}       color="#475569" bg="#f8fafc" border="#e2e8f0" />
                      <CBadge label={audience}    color="#475569" bg="#f8fafc" border="#e2e8f0" />
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>{title}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: tm.color }}>{totalItems}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>ý chính</div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {groups.map(g => {
                  const strip = GROUP_STRIP[g.key] || "#64748b";
                  return (
                    <div key={g.key} style={{ border: "1px solid #e8edf3", borderLeft: `3px solid ${strip}`, borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#f8fafc", borderBottom: g.items.length > 0 ? "1px solid #e8edf3" : "none" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{g.key}</span>
                        <span style={{ fontSize: 11.5, color: "#64748b", fontWeight: 500 }}>{g.items.length} ý chính</span>
                      </div>
                      {g.items.map((it, ii) => {
                        const lm = LEVEL_OPT.find(l => l.value === it.level);
                        return (
                          <div key={ii} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 16px", borderBottom: ii < g.items.length - 1 ? "1px solid #f1f5f9" : "none", background: "#fff" }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: lm?.color || "#94a3b8", flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 12.5, color: "#334155", fontWeight: 500 }}>{it.title || <em style={{ color: "#94a3b8" }}>Chưa có tiêu đề</em>}</span>
                            {lm && <CBadge label={lm.label} color={lm.color} bg={lm.bg} border={lm.border} />}
                          </div>
                        );
                      })}
                      {g.items.length === 0 && <div style={{ padding: "9px 16px", fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>Chưa có ý chính trong nhóm này.</div>}
                    </div>
                  );
                })}
              </div>

              {groups.some(g => g.items.length === 0) && (
                <div style={{ marginTop: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 9, padding: "10px 14px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <span style={{ fontSize: 12, color: "#92400e" }}>Có nhóm chưa có ý chính. Vẫn có thể lưu nhưng nên bổ sung thêm.</span>
                </div>
              )}

              {saveError && (
                <div style={{ marginTop: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: "#dc2626" }}>
                  ⚠ {saveError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── FOOTER / ACTIONS ───────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", borderTop: "1px solid #e8edf3", background: "#f8fafc", flexShrink: 0 }}>
          <div style={{ fontSize: 11.5, color: "#94a3b8" }}>
            {step === 1 && "Điền tiêu đề và chọn mức độ trước khi tiếp tục."}
            {step === 2 && "Thêm nhóm → chọn nhóm → thêm ý chính và điền thông tin."}
            {step === 3 && "Chọn lưu nháp để xem trước, hoặc xuất bản ngay."}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#ffffff", color: "#475569", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                ← Quay lại
              </button>
            )}
            {step < 3 && (
              <button
                onClick={() => (step === 1 ? canNext1 : canNext2) && setStep(step + 1)}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: (step === 1 ? canNext1 : canNext2) ? "#f59e0b" : "#e2e8f0", color: (step === 1 ? canNext1 : canNext2) ? "#fff" : "#94a3b8", fontSize: 13, fontWeight: 700, cursor: (step === 1 ? canNext1 : canNext2) ? "pointer" : "default", transition: "all 0.12s" }}>
                Tiếp tục →
              </button>
            )}
            {step === 3 && (
              <>
                <button onClick={() => handleSave(false)} disabled={saving}
                  title="Lưu bản nháp — chưa công bố, chỉ admin thấy"
                  style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: saving ? "#f8fafc" : "#ffffff", color: saving ? "#94a3b8" : "#475569", fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  {saving ? "Đang lưu..." : "Lưu nháp"}
                </button>
                <button onClick={() => handleSave(true)} disabled={saving}
                  style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: saving ? "#a7f3d0" : "#059669", color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
                  {saving ? "Đang lưu..." : isEditMode && isCurrentlyPublished ? "✓ Lưu thay đổi" : "✓ Xuất bản ngay"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function CField({ label, required = false, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>
        {label}{required && <span style={{ color: "#dc2626", marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function CBadge({ label, color, bg, border }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 20, background: bg, border: `1px solid ${border}`, fontSize: 11, fontWeight: 700, color, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}
