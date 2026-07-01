// @ts-nocheck
import { useState, useMemo, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { api } from "../services/api";
import "./SafetyBulletinViewModal.css";

// ── Types ──────────────────────────────────────────────────────────────────
type Tone   = "alert" | "watch" | "good";
type Level  = "critical" | "warning" | "good" | "info";
type Status = "processing" | "resolved";

interface ViewItem {
  id: string; title: string; body: string;
  level: Level; status: Status; updated: string;
  location: string; reporter: string; date: string;
  actions: string[]; next: string[];
}
interface ViewGroup { key: string; items: ViewItem[]; }
interface ViewBulletin {
  id: string; tone: Tone; date: string; month: string;
  title: string; audience: string; groups: ViewGroup[];
  published: boolean;
  deleted: boolean;
}

interface Props {
  bulletins: unknown[];
  initialId?: string;
  onClose: () => void;
  onCreateNew?: () => void;
  onEdit?: (rawBulletin: unknown) => void;
  onEdited?: (bulletin: unknown) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────
const ADMIN_ROLES = new Set(["admin", "ehs", "leader"]);
const ROOT_ADMIN_ROLES = new Set(["admin"]);

const TONE_META = {
  alert: { dot: "#dc2626", label: "Cần chú ý",   chip: { color: "#dc2626", bg: "#fef2f2", border: "#fecaca" } },
  watch: { dot: "#d97706", label: "Theo dõi",    chip: { color: "#d97706", bg: "#fffbeb", border: "#fde68a" } },
  good:  { dot: "#059669", label: "Bình thường", chip: { color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" } },
};

const LEVEL_META = {
  critical: { label: "Ưu tiên cao",  color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  warning:  { label: "Cần theo dõi", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  good:     { label: "Bình thường",  color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
  info:     { label: "Thông tin",    color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
};

const STATUS_META = {
  processing: { label: "Đang xử lý",   color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  resolved:   { label: "Đã khắc phục", color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
};

const GROUP_STRIP = {
  "TNLĐ / Cận nguy":        "#dc2626",
  "Y tế & sức khỏe":        "#d97706",
  "6S / PCCC / Risk":       "#2563eb",
  "Chỉ đạo & việc cần làm": "#7c3aed",
  "Đào tạo & TSS":          "#059669",
  "Nội dung họp":           "#64748b",
};

const ACTION_META = {
  created:     { label: "Tạo mới",   color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", icon: "✦" },
  published:   { label: "Xuất bản",  color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", icon: "▶" },
  unpublished: { label: "Lưu nháp",  color: "#d97706", bg: "#fffbeb", border: "#fde68a", icon: "◧" },
  edited:      { label: "Chỉnh sửa", color: "#475569", bg: "#f8fafc", border: "#e2e8f0", icon: "✎" },
  updated:     { label: "Cập nhật",  color: "#475569", bg: "#f8fafc", border: "#e2e8f0", icon: "✎" },
  hidden:      { label: "Ẩn đi",     color: "#94a3b8", bg: "#f8fafc", border: "#e2e8f0", icon: "◌" },
};

function formatLogTime(isoStr) {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  let rel;
  if (mins < 2)       rel = "vừa xong";
  else if (mins < 60) rel = `${mins} phút trước`;
  else if (hrs < 24)  rel = `${hrs} giờ trước`;
  else if (days < 7)  rel = `${days} ngày trước`;
  else                rel = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const absTime = d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return { rel, abs: absTime };
}

function computeDiff(before, after) {
  if (!after) return [];
  const changes = [];
  const viOf = (f) => typeof f === "string" ? f : (f?.vi || "");

  if (before !== null && before !== undefined) {
    // Published status
    if (before.published !== after.published) {
      changes.push({ field: "Trạng thái", from: before.published ? "Đã xuất bản" : "Bản nháp", to: after.published ? "Đã xuất bản" : "Bản nháp" });
    }
    // Title
    const bt = viOf(before.title); const at = viOf(after.title);
    if (bt && at && bt !== at) changes.push({ field: "Tiêu đề", from: bt, to: at });
    // Tone
    if (before.tone !== after.tone) changes.push({ field: "Mức độ", from: before.tone || "—", to: after.tone || "—" });
    // Item count
    const bi = (before.groups || []).flatMap(g => g.items || []).length;
    const ai = (after.groups  || []).flatMap(g => g.items || []).length;
    if (bi !== ai) changes.push({ field: "Số ý chính", from: String(bi), to: String(ai) });
    // Group count
    const bg = (before.groups || []).length;
    const ag = (after.groups  || []).length;
    if (bg !== ag) changes.push({ field: "Số nhóm", from: String(bg), to: String(ag) });
  }
  return changes;
}

// ── Data mapping ───────────────────────────────────────────────────────────
function getViText(field) {
  if (!field) return "";
  if (typeof field === "string") return field;
  if (typeof field === "object") return field.vi || field.en || "";
  return "";
}

function formatMonth(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return `T${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch { return ""; }
}

function mapToView(b): ViewBulletin {
  let groups: ViewGroup[] = [];

  if (Array.isArray(b.groups) && b.groups.length > 0) {
    groups = b.groups.map(g => ({
      key: g.key || "Nhóm",
      items: (g.items || []).map((it, idx) => ({
        id:       it.id || `P${String(idx + 1).padStart(3, "0")}`,
        title:    it.title || "",
        body:     it.body || "",
        level:    it.level || "info",
        status:   it.status || "processing",
        updated:  it.updated || "",
        location: it.location || "",
        reporter: it.reporter || "",
        date:     it.date || b.date || "",
        actions:  Array.isArray(it.actions) ? it.actions.filter(Boolean) : [],
        next:     Array.isArray(it.next)    ? it.next.filter(Boolean)    : [],
      })),
    }));
  } else {
    const pts = Array.isArray(b.points?.vi) ? b.points.vi
               : Array.isArray(b.points)    ? b.points
               : [];
    if (pts.length > 0) {
      // Derive priority level from label + body text
      const deriveTone = (lbl, bd): Level => {
        const t = (lbl + " " + bd).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (/(tnld|can nguy|rui ro|khac phuc|nguy co|canh bao|chay|uu tien|tai nan|thuong tich|chan thuong|bi thuong|ngo doc|bong|tu vong|ap suat|khi doc)/.test(t)) return "critical";
        if (/(6s|loto|hoa chat|moi truong|nuoc thai|bui|on|bon rua|sang loc|sap xep|san soc|sach se|rac|kiem dinh|thiet bi|bao ho|quy trinh|khu vuc|chat thai|kiem tra dinh ky|nuoc thai|tu dien)/.test(t)) return "warning";
        if (/(dao tao|huan luyen|tap huan|van ban|suc khoe|y te|kham|thuoc|benh|bac si|giao thong|bao cao|thong ke|chung chi|luat|nghi dinh|thong tu|qcvn)/.test(t)) return "good";
        return "info";
      };
      // Classify item into the appropriate topic group
      const classifyGroup = (lbl, bd): string => {
        const t = (lbl + " " + bd).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (/(tnld|tai nan|can nguy|thuong tich|chan thuong|bi thuong|su co|chay|ngo doc|bong|khi doc|tu vong|ap luc|nguy hiem cap|canh bao nguon|pccc chay)/.test(t)) return "TNLĐ / Cận nguy";
        if (/(y te|suc khoe|kham|thuoc|benh|bac si|khu sinh|thai|bao hiem y|cap cuu|phong kham|y bac|noi tiet|mat|rang|khop|long|tinh than|dinh duong)/.test(t)) return "Y tế & sức khỏe";
        if (/(6s|loto|hoa chat|moi truong|nuoc thai|bui|on|bon rua|sang loc|sap xep|san soc|sach se|rac|kiem dinh|thiet bi|bao ho|quy trinh|khu vuc san|chat thai|pccc|vat tu|tu dien|canh bao khu vuc)/.test(t)) return "6S / PCCC / Risk";
        if (/(chi dao|yeu cau|bat buoc|tbm|bien ban|thong bao|giam doc|truong phong|lanh dao|quy dinh|noi quy|tuyen duong|khen thuong|xu ly|ky luat|thi dua|bao cao|de nghi|chi thi|tong ket|ket qua hop|hop ban|phoi hop|xin y kien)/.test(t)) return "Chỉ đạo & việc cần làm";
        if (/(dao tao|huan luyen|tap huan|van ban|tss|chung chi|luat|nghi dinh|thong tu|qcvn|nang cao|nhan thuc|hoc|thi|ky nang|giao duc|biet|noi dung moi)/.test(t)) return "Đào tạo & TSS";
        return "Nội dung họp";
      };
      const GROUP_ORDER = ["TNLĐ / Cận nguy", "Y tế & sức khỏe", "6S / PCCC / Risk", "Chỉ đạo & việc cần làm", "Đào tạo & TSS", "Nội dung họp"];
      const groupMap = new Map();
      pts.forEach((p, idx) => {
        const isObj = p && typeof p === "object";
        let title, body;
        if (isObj) {
          title = p.title || p.text || String(p);
          body  = p.body  || p.detail || "";
        } else {
          const str = String(p || "").trim();
          const ci  = str.indexOf(":");
          if (ci > 0 && ci <= 48) { title = str.slice(0, ci).trim(); body = str.slice(ci + 1).trim(); }
          else { title = str; body = ""; }
        }
        title = String(title); body = String(body);
        const gKey = classifyGroup(title, body);
        if (!groupMap.has(gKey)) groupMap.set(gKey, []);
        groupMap.get(gKey).push({
          id:       `P${String(idx + 1).padStart(3, "0")}`,
          title,
          body,
          level:    deriveTone(title, body),
          status:   "resolved" as Status,
          updated:  "",
          location: "",
          reporter: "",
          date:     b.date || "",
          actions:  isObj && Array.isArray(p.actions) ? p.actions : [],
          next:     isObj && Array.isArray(p.next)    ? p.next    : [],
        });
      });
      groups = GROUP_ORDER.filter(k => groupMap.has(k)).map(k => ({ key: k, items: groupMap.get(k) }));
    }
  }

  const tone = ["good", "watch", "alert"].includes(b.tone) ? b.tone : "watch";
  return {
    id:        b.id,
    tone:      tone as Tone,
    date:      b.date || "",
    month:     b.month || formatMonth(b.date || ""),
    title:     getViText(b.title) || "(Chưa có tiêu đề)",
    audience:  getViText(b.audience) || "Tất cả bộ phận",
    groups,
    published: b.published !== false,
    deleted: b.deleted === true,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────
export function SafetyBulletinViewModal({ bulletins = [], initialId, onClose, onCreateNew, onEdit, onEdited }: Props) {
  const { user } = useAuth();
  const canCreate = !!user && ADMIN_ROLES.has(user.role);
  const canDelete = !!user && ROOT_ADMIN_ROLES.has(user.role);

  const VIEWS: ViewBulletin[] = useMemo(
    () => bulletins.map(mapToView),
    [bulletins]
  );

  const startId = initialId || VIEWS[0]?.id || "";

  const [bulletinId,  setBulletinId]  = useState(startId);
  const [step,        setStep]        = useState(1);
  const [groupKey,    setGroupKey]    = useState("");
  const [itemId,      setItemId]      = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [search,      setSearch]      = useState("");

  const bulletin = VIEWS.find(b => b.id === bulletinId) || VIEWS[0];
  const bIdx     = VIEWS.findIndex(b => b.id === bulletinId);
  const tm       = TONE_META[bulletin?.tone] || TONE_META.watch;

  const allItems = useMemo(
    () => bulletin ? bulletin.groups.flatMap(g => g.items.map(it => ({ ...it, groupKey: g.key }))) : [],
    [bulletinId, VIEWS]
  );

  const activeGroup = bulletin?.groups.find(g => g.key === groupKey);
  const activeItem  = allItems.find(it => it.id === itemId);

  const filteredItems = useMemo(() => {
    const base = activeGroup ? activeGroup.items : [];
    return base.filter(it => {
      const matchL = !levelFilter || it.level === levelFilter;
      const matchS = !search || (it.title + " " + it.body).toLowerCase().includes(search.toLowerCase());
      return matchL && matchS;
    });
  }, [activeGroup, levelFilter, search]);

  const itemListForNav = activeGroup ? activeGroup.items : allItems;
  const curItemIdx     = itemListForNav.findIndex(it => it.id === itemId);
  const critCount      = allItems.filter(i => i.level === "critical").length;
  const warnCount      = allItems.filter(i => i.level === "warning").length;

  const [publishing,    setPublishing]    = useState(false);
  const [publishError,  setPublishError]  = useState("");

  // Revision history state
  const [historyOpen,      setHistoryOpen]      = useState(false);
  const [historyLogs,      setHistoryLogs]      = useState([]);
  const [historyLoading,   setHistoryLoading]   = useState(false);
  const [historyLoadedFor, setHistoryLoadedFor] = useState("");

  useEffect(() => {
    if (!historyOpen || !bulletinId || !canCreate) return;
    if (historyLoadedFor === bulletinId) return;
    setHistoryLoading(true);
    setHistoryLogs([]);
    api.fetchSafetyBulletinLogs(bulletinId, { pageSize: 30 })
      .then(data => { setHistoryLogs(data.items || []); setHistoryLoadedFor(bulletinId); })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [historyOpen, bulletinId, canCreate, historyLoadedFor]);

  const handlePublish = async () => {
    if (!bulletin || publishing) return;
    if (!window.confirm(`Hiện lại bảng tin "${bulletin.title}"? Người dùng sẽ nhìn thấy bảng tin này.`)) return;
    setPublishing(true);
    setPublishError("");
    try {
      const rawBulletin = (bulletins as Record<string, unknown>[]).find(b => String(b.id) === bulletinId);
      const updated = await api.updateSafetyBulletin(bulletinId, { ...(rawBulletin || {}), published: true });
      onEdited?.(updated);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Xuất bản không thành công.");
    } finally {
      setPublishing(false);
    }
  };

  const handleHide = async () => {
    if (!bulletin || publishing) return;
    if (!window.confirm(`Ẩn bảng tin "${bulletin.title}"? Người dùng thường sẽ không còn thấy bảng tin này.`)) return;
    setPublishing(true);
    setPublishError("");
    try {
      const rawBulletin = (bulletins as Record<string, unknown>[]).find(b => String(b.id) === bulletinId);
      const updated = await api.updateSafetyBulletin(bulletinId, { ...(rawBulletin || {}), published: false });
      onEdited?.(updated);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Ẩn bảng tin không thành công.");
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!bulletin || publishing || !canDelete) return;
    if (!window.confirm(`Xóa bảng tin "${bulletin.title}"? Bảng tin sẽ bị ẩn khỏi người dùng và chỉ admin cao nhất có thể khôi phục.`)) return;
    setPublishing(true);
    setPublishError("");
    try {
      const updated = await api.deleteSafetyBulletin(bulletinId);
      onEdited?.(updated);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Xóa bảng tin không thành công.");
    } finally {
      setPublishing(false);
    }
  };

  const handleRestore = async () => {
    if (!bulletin || publishing || !canDelete) return;
    if (!window.confirm(`Khôi phục bảng tin "${bulletin.title}"? Bảng tin sẽ quay lại danh sách quản trị.`)) return;
    setPublishing(true);
    setPublishError("");
    try {
      const updated = await api.restoreSafetyBulletin(bulletinId);
      onEdited?.(updated);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Khôi phục bảng tin không thành công.");
    } finally {
      setPublishing(false);
    }
  };

  const handleEdit = () => {
    const rawBulletin = (bulletins as Record<string, unknown>[]).find(b => String(b.id) === bulletinId);
    onEdit?.(rawBulletin);
  };

  const switchBulletin = (id: string) => {
    setBulletinId(id); setStep(1); setGroupKey(""); setItemId(""); setLevelFilter(""); setSearch(""); setPublishError("");
    setHistoryOpen(false); setHistoryLoadedFor(""); setHistoryLogs([]);
  };
  const openGroup = (key: string) => { setGroupKey(key); setStep(2); setLevelFilter(""); setSearch(""); };
  const openItem  = (id: string)  => { setItemId(id); setStep(3); };
  const goStep    = (n: number)   => {
    if (n < step) { setStep(n); if (n === 1) { setGroupKey(""); setItemId(""); } if (n === 2) setItemId(""); }
  };
  const prevItem = () => { if (curItemIdx > 0) setItemId(itemListForNav[curItemIdx - 1].id); };
  const nextItem = () => { if (curItemIdx < itemListForNav.length - 1) setItemId(itemListForNav[curItemIdx + 1].id); };

  const handleExportPdf = () => {
    if (!bulletin) return;
    const tone = TONE_META[bulletin.tone] || TONE_META.watch;
    const totalItems = bulletin.groups.reduce((s, g) => s + g.items.length, 0);
    const critN = allItems.filter(i => i.level === "critical").length;
    const warnN = allItems.filter(i => i.level === "warning").length;

    const esc = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

    const levelMeta = {
      critical: { label: "Ưu tiên cao",  color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
      warning:  { label: "Cần theo dõi", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
      good:     { label: "Bình thường",  color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
      info:     { label: "Thông tin",    color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
    };

    const groupStrip: Record<string, string> = {
      "TNLĐ / Cận nguy":        "#dc2626",
      "Y tế & sức khỏe":        "#d97706",
      "6S / PCCC / Risk":       "#2563eb",
      "Chỉ đạo & việc cần làm": "#7c3aed",
      "Đào tạo & TSS":          "#059669",
      "Nội dung họp":           "#64748b",
    };

    const groupsHtml = bulletin.groups.map(g => {
      const strip = groupStrip[g.key] || "#64748b";
      const itemsHtml = g.items.map((it, idx) => {
        const lm = levelMeta[it.level] || levelMeta.info;
        const actionsHtml = it.actions.length > 0 ? `
          <div class="detail-block">
            <div class="detail-label">✅ Hành động đã thực hiện</div>
            <ul class="action-list">${it.actions.map(a => `<li>${esc(a)}</li>`).join("")}</ul>
          </div>` : "";
        const nextHtml = it.next.length > 0 ? `
          <div class="detail-block">
            <div class="detail-label next-label">→ Hành động tiếp theo</div>
            <ul class="next-list">${it.next.map(n => `<li>${esc(n)}</li>`).join("")}</ul>
          </div>` : "";
        const metaRow = [
          it.date     ? `<span class="meta-chip">📅 ${esc(it.date)}</span>` : "",
          it.location ? `<span class="meta-chip">📍 ${esc(it.location)}</span>` : "",
          it.reporter ? `<span class="meta-chip">👤 ${esc(it.reporter)}</span>` : "",
        ].filter(Boolean).join("");

        return `
          <div class="item-card ${idx > 0 ? "item-sep" : ""}">
            <div class="item-header">
              <span class="item-id">${esc(it.id)}</span>
              <span class="item-title">${esc(it.title)}</span>
              <span class="badge" style="color:${lm.color};background:${lm.bg};border:1px solid ${lm.border}">${esc(lm.label)}</span>
            </div>
            ${it.body ? `<p class="item-body">${esc(it.body)}</p>` : ""}
            ${metaRow ? `<div class="meta-row">${metaRow}</div>` : ""}
            ${actionsHtml}${nextHtml}
          </div>`;
      }).join("");

      return `
        <div class="group-block">
          <div class="group-header" style="border-left:5px solid ${strip};background:${strip}18">
            <span class="group-dot" style="background:${strip}"></span>
            <span class="group-name">${esc(g.key)}</span>
            <span class="group-count" style="background:${strip};color:#fff">${g.items.length} mục</span>
          </div>
          ${itemsHtml}
        </div>`;
    }).join("");

    const summaryChips = [
      `<span class="sum-chip" style="color:${tone.chip.color};background:${tone.chip.bg};border:1px solid ${tone.chip.border}">${esc(tone.label)}</span>`,
      critN > 0 ? `<span class="sum-chip" style="color:#dc2626;background:#fef2f2;border:1px solid #fecaca">⚠ ${critN} ưu tiên cao</span>` : "",
      warnN > 0 ? `<span class="sum-chip" style="color:#d97706;background:#fffbeb;border:1px solid #fde68a">${warnN} cần theo dõi</span>` : "",
      `<span class="sum-chip" style="color:#475569;background:#f8fafc;border:1px solid #e2e8f0">${bulletin.audience}</span>`,
    ].filter(Boolean).join(" ");

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Bảng Tin ATLĐ · ${esc(bulletin.title)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
  body { font-family: "Segoe UI", "Be Vietnam Pro", Inter, Arial, sans-serif;
         font-size: 13px; color: #0f172a; background: #fff; }

  .page-wrap { max-width: 860px; margin: 0 auto; padding: 36px 40px 56px; }

  /* ── Cover header ── */
  .cover { display: flex; align-items: flex-start; gap: 18px;
           border-radius: 14px; padding: 22px 24px; margin-bottom: 28px;
           border-left: 6px solid ${tone.chip.color};
           background: ${tone.chip.bg};
           border: 1px solid ${tone.chip.border};
           border-left: 6px solid ${tone.chip.color}; }
  .cover-icon { width: 44px; height: 44px; border-radius: 10px; flex-shrink: 0;
                background: #fffbeb; border: 1px solid #fde68a;
                display: flex; align-items: center; justify-content: center; font-size: 22px; }
  .cover-body { flex: 1; min-width: 0; }
  .cover-kicker { font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase;
                  letter-spacing: .7px; margin-bottom: 5px; }
  .cover-title { font-size: 22px; font-weight: 900; color: #0f172a; line-height: 1.2; margin-bottom: 10px; }
  .cover-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .sum-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px;
              border-radius: 20px; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
  .cover-meta { font-size: 11.5px; color: #64748b; }

  /* ── Stats row ── */
  .stats-row { display: flex; gap: 10px; margin-bottom: 26px; flex-wrap: wrap; }
  .stat-pill { display: flex; flex-direction: column; align-items: center; gap: 1px;
               padding: 10px 18px; border-radius: 10px; min-width: 80px; text-align: center; }
  .stat-pill .num { font-size: 26px; font-weight: 900; line-height: 1; }
  .stat-pill .lbl { font-size: 10.5px; font-weight: 600; color: #64748b; }

  /* ── Groups ── */
  .group-block { margin-bottom: 24px; border-radius: 12px; overflow: hidden;
                 border: 1px solid #e8edf3; page-break-inside: avoid; }
  .group-header { display: flex; align-items: center; gap: 9px;
                  padding: 11px 16px; }
  .group-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .group-name { font-size: 13.5px; font-weight: 800; color: #0f172a; flex: 1; }
  .group-count { padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 800; }

  /* ── Items ── */
  .item-card { padding: 13px 16px; background: #fff; }
  .item-sep { border-top: 1px solid #f1f5f9; }
  .item-header { display: flex; align-items: center; gap: 9px; margin-bottom: 6px; }
  .item-id { font-size: 11px; font-weight: 800; font-family: monospace;
             background: #f1f5f9; color: #334155; padding: 2px 7px; border-radius: 5px; flex-shrink: 0; }
  .item-title { font-size: 13px; font-weight: 700; color: #0f172a; flex: 1; }
  .badge { padding: 2px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 700;
           white-space: nowrap; flex-shrink: 0; }
  .item-body { font-size: 12.5px; color: #334155; line-height: 1.7; margin-bottom: 8px; }
  .meta-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .meta-chip { font-size: 11px; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0;
               border-radius: 6px; padding: 2px 8px; font-weight: 600; }

  /* ── Detail blocks ── */
  .detail-block { margin-top: 8px; }
  .detail-label { font-size: 11px; font-weight: 800; color: #475569; margin-bottom: 5px;
                  text-transform: uppercase; letter-spacing: .4px; }
  .next-label { color: #2563eb; }
  .action-list, .next-list { padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
  .action-list li { font-size: 12px; color: #334155; line-height: 1.6; padding-left: 18px; position: relative; }
  .action-list li::before { content: "✓"; position: absolute; left: 0; color: #059669; font-weight: 900; font-size: 11px; }
  .next-list li { font-size: 12px; color: #475569; line-height: 1.6; padding-left: 18px; position: relative; }
  .next-list li::before { content: "→"; position: absolute; left: 0; color: #2563eb; font-weight: 900; font-size: 11px; }

  /* ── Footer ── */
  .footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid #e2e8f0;
            display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
  .footer-brand { font-size: 12px; font-weight: 800; color: #64748b; }
  .footer-date { font-size: 11.5px; color: #94a3b8; }

  /* ── Print rules ── */
  @media print {
    html, body { background: #fff !important; }
    .page-wrap { padding: 20px 24px 40px; }
    .group-block { page-break-inside: avoid; }
    .item-card { page-break-inside: avoid; }
    @page { margin: 15mm 15mm 18mm; size: A4 portrait; }
  }
</style>
</head>
<body>
<div class="page-wrap">

  <div class="cover">
    <div class="cover-icon">🛡️</div>
    <div class="cover-body">
      <div class="cover-kicker">Bảng tin An toàn lao động · MHChub</div>
      <div class="cover-title">${esc(bulletin.title)}</div>
      <div class="cover-chips">${summaryChips}</div>
      <div class="cover-meta">${esc(bulletin.month)} &nbsp;·&nbsp; ${esc(bulletin.date)} &nbsp;·&nbsp; ${esc(bulletin.audience)}</div>
    </div>
  </div>

  <div class="stats-row">
    <div class="stat-pill" style="background:#eff6ff;border:1px solid #bfdbfe">
      <span class="num" style="color:#2563eb">${totalItems}</span>
      <span class="lbl">Tổng ý chính</span>
    </div>
    ${critN > 0 ? `<div class="stat-pill" style="background:#fef2f2;border:1px solid #fecaca">
      <span class="num" style="color:#dc2626">${critN}</span>
      <span class="lbl">Ưu tiên cao</span>
    </div>` : ""}
    ${warnN > 0 ? `<div class="stat-pill" style="background:#fffbeb;border:1px solid #fde68a">
      <span class="num" style="color:#d97706">${warnN}</span>
      <span class="lbl">Cần theo dõi</span>
    </div>` : ""}
    <div class="stat-pill" style="background:#f8fafc;border:1px solid #e2e8f0">
      <span class="num" style="color:#64748b">${bulletin.groups.length}</span>
      <span class="lbl">Nhóm</span>
    </div>
  </div>

  ${groupsHtml}

  <div class="footer">
    <span class="footer-brand">🏭 MHChub · An toàn lao động & 6S</span>
    <span class="footer-date">Xuất ngày ${new Date().toLocaleDateString("vi-VN", { day:"2-digit", month:"2-digit", year:"numeric" })}</span>
  </div>

</div>
<script>
  window.onload = function() {
    setTimeout(function() { window.print(); }, 400);
  };
</script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  if (!bulletin) return null;

  return (
    <div className="sbvm-overlay" role="dialog" aria-modal="true">
      <div className="sbvm-root" style={{
        width: 1060, maxWidth: "calc(100vw - 48px)",
        height: 680, maxHeight: "calc(100vh - 48px)",
        background: "#ffffff",
        borderRadius: 16, overflow: "hidden",
        boxShadow: "0 24px 64px rgba(15,30,60,0.22), 0 4px 16px rgba(15,30,60,0.1)",
        border: "1px solid #e2e8f0",
        display: "flex", flexDirection: "column",
      }}>

        {/* ── TOPBAR ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderBottom: "1px solid #e8edf3", background: "#ffffff", flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.4" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.7px", textTransform: "uppercase" }}>An toàn lao động · MHChub</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bulletin.title}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <NavBtn disabled={bIdx <= 0} onClick={() => switchBulletin(VIEWS[bIdx - 1].id)} dir="left" />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "#64748b", padding: "0 4px" }}>{bIdx + 1} / {VIEWS.length}</span>
            <NavBtn disabled={bIdx >= VIEWS.length - 1} onClick={() => switchBulletin(VIEWS[bIdx + 1].id)} dir="right" />
          </div>
          <div style={{ width: 1, height: 20, background: "#e2e8f0", margin: "0 4px" }} />
          <div style={{ display: "flex", gap: 5 }}>
            <TopBtn label="Xuất PDF" onClick={handleExportPdf} icon={
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            } />
            {canCreate && onEdit && (
              <TopBtn label="Chỉnh sửa" onClick={handleEdit} icon={
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              } />
            )}
            {canCreate && !bulletin.deleted && (
              <TopBtn label={bulletin.published ? "Ẩn" : "Hiện"} onClick={bulletin.published ? handleHide : handlePublish} />
            )}
            {canDelete && (
              <TopBtn label={bulletin.deleted ? "Khôi phục" : "Xóa"} onClick={bulletin.deleted ? handleRestore : handleDelete} />
            )}
            {canCreate && onCreateNew && (
              <TopBtn label="+ Thêm mới" accent onClick={onCreateNew} />
            )}
          </div>
          <button onClick={onClose} title="Đóng" style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", cursor: "pointer", flexShrink: 0, marginLeft: 2 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* ── BODY ───────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

          {/* LEFT SIDEBAR */}
          <div style={{ width: 220, flexShrink: 0, borderRight: "1px solid #e8edf3", background: "#f8fafc", display: "flex", flexDirection: "column", overflowY: "auto" }}>
            <div style={{ padding: "10px 14px 6px", fontSize: 9.5, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.7px", textTransform: "uppercase" }}>
              Bảng tin ({VIEWS.length})
            </div>
            {VIEWS.map(b => {
              const btm = TONE_META[b.tone] || TONE_META.watch;
              const isActive = b.id === bulletinId;
              const bAllItems = b.groups.flatMap(g => g.items);
              const bCrit = bAllItems.filter(i => i.level === "critical").length;
              return (
                <SidebarItem key={b.id} active={isActive} dot={btm.dot}
                  month={b.month} title={b.title} count={bAllItems.length} crit={bCrit}
                  isDraft={!b.published || b.deleted}
                  onClick={() => switchBulletin(b.id)} />
              );
            })}
          </div>

          {/* RIGHT PANEL */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "0 18px", borderBottom: "1px solid #e8edf3", background: "#ffffff", flexShrink: 0 }}>
              {[
                { n: 1, label: "Tổng quan" },
                { n: 2, label: groupKey   || "Danh sách" },
                { n: 3, label: activeItem ? activeItem.id : "Chi tiết" },
              ].map((s, i) => {
                const done     = step > s.n;
                const active   = step === s.n;
                const clickable = done || active;
                return (
                  <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
                    <button onClick={() => clickable && goStep(s.n)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", background: "none", border: "none", borderBottom: active ? "2px solid #f59e0b" : "2px solid transparent", cursor: clickable ? "pointer" : "default", marginBottom: -1, transition: "all 0.12s" }}>
                      <span style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, background: done ? "#059669" : active ? "#f59e0b" : "#e2e8f0", color: (done || active) ? "#fff" : "#94a3b8" }}>
                        {done
                          ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                          : s.n}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? "#b45309" : done ? "#475569" : "#94a3b8", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.label}
                      </span>
                    </button>
                    {i < 2 && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>}
                  </div>
                );
              })}
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 5, paddingRight: 4 }}>
                <MiniChip {...tm.chip} label={tm.label} />
                {critCount > 0 && <MiniChip color="#dc2626" bg="#fef2f2" border="#fecaca" label={`${critCount} ưu tiên`} />}
              </div>
            </div>

            {/* Content area */}
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>

              {/* ── STEP 1: GROUP OVERVIEW ───────────────────────── */}
              {step === 1 && (
                <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

                  {/* Draft banner — only show for unpublished bulletins */}
                  {!bulletin.published && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span style={{ flex: 1, fontSize: 12, color: "#92400e", fontWeight: 600 }}>
                        Bản nháp — chưa công bố. Nhân viên chưa thấy bảng tin này.
                      </span>
                      {canCreate && onEdit && (
                        <button onClick={handlePublish} disabled={publishing}
                          style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: publishing ? "#a7f3d0" : "#059669", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: publishing ? "default" : "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                          {publishing ? "Đang xuất bản..." : "Xuất bản ngay"}
                        </button>
                      )}
                    </div>
                  )}
                  {publishError && (
                    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#dc2626", marginBottom: 12 }}>
                      ⚠ {publishError}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    <SumPill n={allItems.length} label="Tổng ý chính" color="#2563eb" bg="#eff6ff" border="#bfdbfe" />
                    {critCount > 0 && <SumPill n={critCount} label="Ưu tiên cao"  color="#dc2626" bg="#fef2f2" border="#fecaca" />}
                    {warnCount > 0 && <SumPill n={warnCount} label="Cần theo dõi" color="#d97706" bg="#fffbeb" border="#fde68a" />}
                    <SumPill n={bulletin.groups.length} label="Nhóm" color="#64748b" bg="#f8fafc" border="#e2e8f0" />
                  </div>
                  {bulletin.groups.length === 0 ? (
                    <div style={{ padding: "48px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                      Bảng tin này chưa có nhóm nội dung chi tiết.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {bulletin.groups.map(g => {
                        const strip = GROUP_STRIP[g.key] || "#64748b";
                        const critN = g.items.filter(i => i.level === "critical").length;
                        const warnN = g.items.filter(i => i.level === "warning").length;
                        return (
                          <div key={g.key} style={{ border: "1px solid #e8edf3", borderRadius: 10, overflow: "hidden" }}>
                            {/* Group header — click → step 2 group filter */}
                            <button onClick={() => openGroup(g.key)}
                              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 14px", background: `${strip}12`, border: "none", borderLeft: `4px solid ${strip}`, borderBottom: g.items.length > 0 ? "1px solid #e8edf3" : "none", cursor: "pointer", textAlign: "left" }}>
                              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "#0f172a" }}>{g.key}</span>
                              {critN > 0 && <SmBadge n={critN} label="ưu tiên" color="#dc2626" bg="#fef2f2" border="#fecaca" />}
                              {warnN > 0 && <SmBadge n={warnN} label="theo dõi" color="#d97706" bg="#fffbeb" border="#fde68a" />}
                              <span style={{ fontSize: 11, fontWeight: 700, color: strip, background: `${strip}20`, padding: "2px 8px", borderRadius: 20, flexShrink: 0 }}>{g.items.length} mục</span>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={strip} strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                            </button>
                            {/* Inline item rows — click → step 3 detail */}
                            {g.items.map((it, ii) => {
                              const lm = LEVEL_META[it.level] || LEVEL_META.info;
                              return (
                                <OverviewItem key={it.id} it={it} lm={lm} isLast={ii === g.items.length - 1}
                                  onOpen={() => { openGroup(g.key); openItem(it.id); }} />
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── REVISION HISTORY (admin only) ──────────────────── */}
                  {canCreate && (
                    <div style={{ marginTop: 18, borderTop: "1px solid #e8edf3", paddingTop: 14 }}>
                      <button onClick={() => setHistoryOpen(o => !o)}
                        style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", background: "none", border: "none", cursor: "pointer", padding: "4px 0", textAlign: "left" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" style={{ transition: "transform 0.15s", transform: historyOpen ? "rotate(90deg)" : "none" }}>
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          Lịch sử chỉnh sửa
                        </span>
                        {historyLogs.length > 0 && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, background: "#e2e8f0", color: "#64748b", borderRadius: 20, padding: "1px 7px", marginLeft: 2 }}>
                            {historyLogs.length}
                          </span>
                        )}
                        <span style={{ marginLeft: "auto", fontSize: 10, color: "#94a3b8" }}>
                          {historyOpen ? "Thu gọn" : "Xem chi tiết"}
                        </span>
                      </button>

                      {historyOpen && (
                        <div style={{ marginTop: 12 }}>
                          {historyLoading && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 0", color: "#94a3b8", fontSize: 12 }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ animation: "sbvm-spin 0.7s linear infinite" }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.18-3.35"/></svg>
                              Đang tải lịch sử...
                            </div>
                          )}

                          {!historyLoading && historyLogs.length === 0 && (
                            <div style={{ padding: "12px 0", fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>
                              Chưa có dữ liệu lịch sử chỉnh sửa.
                            </div>
                          )}

                          {!historyLoading && historyLogs.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                              {historyLogs.map((log, idx) => {
                                const meta = ACTION_META[log.action] || ACTION_META.updated;
                                const timeInfo = formatLogTime(log.createdAt);
                                const diff = computeDiff(log.before, log.after);
                                const isLast = idx === historyLogs.length - 1;
                                return (
                                  <div key={log.id || idx} style={{ display: "flex", gap: 10, paddingBottom: isLast ? 0 : 14, position: "relative" }}>
                                    {/* Timeline line */}
                                    {!isLast && (
                                      <div style={{ position: "absolute", left: 12, top: 24, bottom: 0, width: 1, background: "#e8edf3" }} />
                                    )}
                                    {/* Action badge */}
                                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: meta.bg, border: `1px solid ${meta.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, color: meta.color, fontWeight: 800 }}>
                                      {meta.icon}
                                    </div>
                                    {/* Entry content */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
                                        <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 20, background: meta.bg, border: `1px solid ${meta.border}`, fontSize: 10.5, fontWeight: 700, color: meta.color }}>
                                          {meta.label}
                                        </span>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{log.actorName || log.actor || "—"}</span>
                                        <span style={{ fontSize: 10.5, color: "#94a3b8" }}>{log.actorRole || ""}</span>
                                        <span style={{ marginLeft: "auto", fontSize: 10.5, color: "#94a3b8" }} title={typeof timeInfo === "object" ? timeInfo.abs : ""}>
                                          {typeof timeInfo === "object" ? timeInfo.rel : timeInfo}
                                        </span>
                                      </div>
                                      {diff.length > 0 && (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 2 }}>
                                          {diff.map((ch, ci) => (
                                            <div key={ci} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                                              <span style={{ color: "#94a3b8", flexShrink: 0, minWidth: 60 }}>{ch.field}:</span>
                                              <span style={{ color: "#dc2626", textDecoration: "line-through", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.from}</span>
                                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2"><polyline points="9 18 15 12 9 6"/></svg>
                                              <span style={{ color: "#059669", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.to}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── STEP 2: ITEM LIST ────────────────────────────── */}
              {step === 2 && activeGroup && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  {/* Group tabs */}
                  <div style={{ display: "flex", borderBottom: "1px solid #e8edf3", background: "#ffffff", padding: "0 16px", flexShrink: 0, overflowX: "auto" }}>
                    {bulletin.groups.map(g => {
                      const strip = GROUP_STRIP[g.key] || "#64748b";
                      const isAct = g.key === groupKey;
                      return (
                        <button key={g.key} onClick={() => openGroup(g.key)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", background: "none", border: "none", borderBottom: isAct ? `2px solid ${strip}` : "2px solid transparent", color: isAct ? strip : "#64748b", fontSize: 12, fontWeight: isAct ? 700 : 500, cursor: "pointer", marginBottom: -1, whiteSpace: "nowrap", flexShrink: 0 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: isAct ? strip : "#cbd5e1", flexShrink: 0 }} />
                          {g.key}
                          <span style={{ fontSize: 10.5, padding: "1px 6px", borderRadius: 20, background: isAct ? strip : "#e2e8f0", color: isAct ? "#fff" : "#64748b", fontWeight: 700 }}>{g.items.length}</span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Toolbar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderBottom: "1px solid #e8edf3", background: "#ffffff", flexShrink: 0, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "0 9px", height: 32, flex: "1 1 180px", minWidth: 0 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm nhanh..." style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12, color: "#0f172a" }} />
                      {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>✕</button>}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {[
                        { key: "",         label: `Tất cả (${activeGroup.items.length})` },
                        { key: "critical", label: `Ưu tiên (${activeGroup.items.filter(i => i.level === "critical").length})` },
                        { key: "warning",  label: `Theo dõi (${activeGroup.items.filter(i => i.level === "warning").length})` },
                        { key: "good",     label: `Bình thường (${activeGroup.items.filter(i => i.level === "good" || i.level === "info").length})` },
                      ].map(f => {
                        const lm = f.key ? LEVEL_META[f.key] : null;
                        return <FilterChip key={f.key} label={f.label} active={levelFilter === f.key} color={lm?.color} bg={lm?.bg} border={lm?.border} onClick={() => setLevelFilter(f.key)} />;
                      })}
                    </div>
                  </div>
                  {/* Table header */}
                  <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr) 120px 128px 110px 44px", padding: "0 16px", borderBottom: "1px solid #e8edf3", background: "#f8fafc", flexShrink: 0 }}>
                    {["Mã mục", "Tiêu đề", "Mức độ", "Trạng thái", "Cập nhật", ""].map((h, i) => (
                      <div key={i} style={{ padding: "7px 8px 7px 0", fontSize: 10.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px" }}>{h}</div>
                    ))}
                  </div>
                  {/* Rows */}
                  <div style={{ flex: 1, overflowY: "auto" }}>
                    {filteredItems.length === 0 && (
                      <div style={{ textAlign: "center", padding: "36px 0", color: "#94a3b8", fontSize: 13 }}>Không có mục phù hợp.</div>
                    )}
                    {filteredItems.map((item, idx) => {
                      const lm = LEVEL_META[item.level] || LEVEL_META.info;
                      const sm = STATUS_META[item.status] || STATUS_META.processing;
                      return <ItemRow key={item.id} item={item} lm={lm} sm={sm} isLast={idx === filteredItems.length - 1} onClick={() => openItem(item.id)} />;
                    })}
                  </div>
                </div>
              )}

              {/* ── STEP 3: ITEM DETAIL ──────────────────────────── */}
              {step === 3 && activeItem && (() => {
                const lm    = LEVEL_META[activeItem.level] || LEVEL_META.info;
                const sm    = STATUS_META[activeItem.status] || STATUS_META.processing;
                const strip = GROUP_STRIP[activeItem.groupKey] || "#64748b";
                return (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                    {/* Detail topbar */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderBottom: "1px solid #e8edf3", background: "#ffffff", flexShrink: 0 }}>
                      <span style={{ padding: "3px 9px", borderRadius: 6, fontSize: 11.5, fontWeight: 800, background: "#f1f5f9", color: "#334155", letterSpacing: "0.5px", fontFamily: "monospace", flexShrink: 0 }}>{activeItem.id}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeItem.title}</span>
                      <Badge label={lm.label} color={lm.color} bg={lm.bg} border={lm.border} />
                      <Badge label={sm.label} color={sm.color} bg={sm.bg} border={sm.border} />
                      <div style={{ display: "flex", alignItems: "center", gap: 3, marginLeft: 4, flexShrink: 0 }}>
                        <button onClick={prevItem} disabled={curItemIdx <= 0} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #e2e8f0", background: curItemIdx > 0 ? "#fff" : "#f8fafc", color: curItemIdx > 0 ? "#475569" : "#cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", cursor: curItemIdx > 0 ? "pointer" : "default" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                        </button>
                        <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, padding: "0 2px", whiteSpace: "nowrap" }}>{curItemIdx + 1} / {itemListForNav.length}</span>
                        <button onClick={nextItem} disabled={curItemIdx >= itemListForNav.length - 1} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #e2e8f0", background: curItemIdx < itemListForNav.length - 1 ? "#fff" : "#f8fafc", color: curItemIdx < itemListForNav.length - 1 ? "#475569" : "#cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", cursor: curItemIdx < itemListForNav.length - 1 ? "pointer" : "default" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                      </div>
                    </div>
                    {/* 2-col body */}
                    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", minHeight: 0, overflow: "hidden" }}>
                      <div style={{ borderRight: "1px solid #e8edf3", overflowY: "auto", background: "#f8fafc", padding: 16 }}>
                        <div style={{ width: "100%", height: 3, background: strip, borderRadius: 2, marginBottom: 14 }} />
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 12 }}>Thông tin chung</div>
                        {[
                          { icon: "📂", label: "Nhóm",          val: activeItem.groupKey },
                          { icon: "⚠️", label: "Mức độ",        val: lm.label,  color: lm.color },
                          { icon: "✅", label: "Trạng thái",    val: sm.label,  color: sm.color },
                          { icon: "📅", label: "Ngày xảy ra",   val: activeItem.date },
                          { icon: "📍", label: "Địa điểm",      val: activeItem.location },
                          { icon: "👤", label: "Người báo cáo", val: activeItem.reporter },
                          { icon: "🕐", label: "Cập nhật cuối", val: activeItem.updated },
                        ].filter(r => r.val).map(row => (
                          <div key={row.label} style={{ display: "grid", gridTemplateColumns: "78px 1fr", gap: 4, marginBottom: 10, alignItems: "flex-start" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ fontSize: 11 }}>{row.icon}</span>
                              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{row.label}</span>
                            </div>
                            <span style={{ fontSize: 11.5, fontWeight: 600, color: row.color ?? "#0f172a", lineHeight: 1.5 }}>{row.val}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                        <section>
                          <SecHead n={1} title="Mô tả chi tiết" done={false} />
                          {(() => {
                            const bodyText = activeItem.body || "";
                            if (!bodyText) return <p style={{ marginTop: 8, fontSize: 13, color: "#94a3b8", lineHeight: 1.75, fontStyle: "italic" }}>(Chưa có mô tả)</p>;
                            const subs = bodyText.split(/;\s*/).map((s: string) => s.trim()).filter(Boolean);
                            if (subs.length > 1) return (
                              <ul style={{ marginTop: 10, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
                                {subs.map((s: string, i: number) => (
                                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#94a3b8", flexShrink: 0, marginTop: 8 }} />
                                    <span style={{ fontSize: 13, color: "#334155", lineHeight: 1.7 }}>{s}</span>
                                  </li>
                                ))}
                              </ul>
                            );
                            return <p style={{ marginTop: 8, fontSize: 13, color: "#334155", lineHeight: 1.75 }}>{bodyText}</p>;
                          })()}
                        </section>
                        {activeItem.actions.length > 0 && (
                          <section>
                            <SecHead n={2} title="Hành động đã thực hiện" done />
                            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 8 }}>
                              {activeItem.actions.map((a, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                                  <span style={{ width: 15, height: 15, borderRadius: "50%", background: "#059669", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                                    <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                                  </span>
                                  <span style={{ fontSize: 12.5, color: "#334155", lineHeight: 1.6 }}>{a}</span>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}
                        {activeItem.next.length > 0 && (
                          <section>
                            <SecHead n={3} title="Hành động tiếp theo" done={false} />
                            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 8 }}>
                              {activeItem.next.map((a, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                                  <span style={{ width: 15, height: 15, borderRadius: "50%", background: "#fff", border: "2px solid #cbd5e1", flexShrink: 0, marginTop: 2 }} />
                                  <span style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.6 }}>{a}</span>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

            </div>
          </div>
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 18px", borderTop: "1px solid #e8edf3", background: "#f8fafc", flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            {step === 1 && "Nhấp vào nhóm để xem danh sách mục."}
            {step === 2 && "Nhấp vào hàng để xem chi tiết · Chuyển nhóm qua các tab phía trên."}
            {step === 3 && "Dùng ← → để lướt qua các mục · Nhấp breadcrumb để quay lại."}
          </span>
          <span style={{ fontSize: 11, color: "#cbd5e1" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ marginRight: 4, verticalAlign: "middle" }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.18-3.35"/></svg>
            Dữ liệu đồng bộ từ server
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function NavBtn({ disabled, onClick, dir }) {
  return (
    <button onClick={!disabled ? onClick : undefined} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", color: disabled ? "#cbd5e1" : "#64748b", cursor: disabled ? "default" : "pointer" }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        {dir === "left" ? <polyline points="15 18 9 12 15 6"/> : <polyline points="9 18 15 12 9 6"/>}
      </svg>
    </button>
  );
}

function TopBtn({ label, icon = null, accent = false, onClick = undefined }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, border: accent ? "none" : "1px solid #e2e8f0", background: accent ? "#f59e0b" : "#ffffff", color: accent ? "#fff" : "#475569", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
      {icon}{label}
    </button>
  );
}

function MiniChip({ label, color, bg, border }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, background: bg, border: `1px solid ${border}`, fontSize: 10.5, fontWeight: 700, color }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

function SumPill({ n, label, color, bg, border }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9, background: bg, border: `1px solid ${border}` }}>
      <span style={{ fontSize: 18, fontWeight: 900, color, lineHeight: 1 }}>{n}</span>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "#64748b" }}>{label}</span>
    </div>
  );
}

function SidebarItem({ active, dot, month, title, count, crit, isDraft = false, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 14px", textAlign: "left", width: "100%", background: active ? "#ffffff" : hov ? "#f0f4f7" : "transparent", border: "none", borderLeft: active ? `3px solid ${isDraft ? "#d97706" : dot}` : "3px solid transparent", cursor: "pointer", transition: "all 0.12s", opacity: isDraft && !active ? 0.8 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: isDraft ? "#d97706" : dot, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: isDraft ? "#d97706" : "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>{isDraft ? "NHÁP" : month}</span>
        {isDraft && <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 400 }}>{month}</span>}
        <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, background: active ? (isDraft ? "#d97706" : dot) : "#e2e8f0", color: active ? "#fff" : "#64748b", borderRadius: 20, padding: "1px 6px" }}>{count}</span>
      </div>
      <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? "#0f172a" : "#475569", lineHeight: 1.4, paddingLeft: 12, fontStyle: isDraft ? "italic" : "normal" }}>{title}</span>
      {crit > 0 && <span style={{ fontSize: 10.5, color: "#dc2626", fontWeight: 700, paddingLeft: 12 }}>⚠ {crit} ưu tiên cao</span>}
    </button>
  );
}

function GroupCard({ groupKey, strip, count, critN, warnN, goodN, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 11, cursor: "pointer", textAlign: "left", background: hov ? "#f8fafc" : "#ffffff", border: `1px solid ${hov ? "#d1dde8" : "#e8edf3"}`, borderLeft: `4px solid ${strip}`, boxShadow: hov ? "0 2px 10px rgba(15,30,60,0.07)" : "0 1px 3px rgba(15,30,60,0.04)", transition: "all 0.13s" }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>{groupKey}</div>
        <div style={{ display: "flex", gap: 5 }}>
          {critN > 0 && <SmBadge n={critN} label="Ưu tiên cao"  color="#dc2626" bg="#fef2f2" border="#fecaca" />}
          {warnN > 0 && <SmBadge n={warnN} label="Theo dõi"    color="#d97706" bg="#fffbeb" border="#fde68a" />}
          {goodN > 0 && <SmBadge n={goodN} label="Bình thường" color="#059669" bg="#ecfdf5" border="#a7f3d0" />}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: strip, lineHeight: 1 }}>{count}</div>
          <div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 500 }}>mục</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={hov ? strip : "#cbd5e1"} strokeWidth="2.2" strokeLinecap="round" style={{ transition: "all 0.13s" }}><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </button>
  );
}

function SmBadge({ n, label, color, bg, border }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 20, background: bg, border: `1px solid ${border}`, fontSize: 10.5, fontWeight: 700, color }}>
      {n} {label}
    </span>
  );
}

function FilterChip({ label, active, color, bg, border, onClick }) {
  return (
    <button onClick={onClick} style={{ padding: "4px 10px", borderRadius: 20, background: active && bg ? bg : "#ffffff", border: `1px solid ${active && border ? border : "#e2e8f0"}`, color: active && color ? color : "#64748b", fontSize: 11.5, fontWeight: active ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.11s" }}>
      {label}
    </button>
  );
}

function OverviewItem({ it, lm, isLast, onOpen }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onOpen} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: isLast ? "none" : "1px solid #f1f5f9", cursor: "pointer", background: hov ? "#f8fafc" : "#fff", transition: "background 0.1s" }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", fontFamily: "monospace", flexShrink: 0, minWidth: 38 }}>{it.id}</span>
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
      {it.body && (
        <span style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200, flexShrink: 1 }}>
          {it.body.length > 65 ? it.body.slice(0, 65) + "…" : it.body}
        </span>
      )}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 20, background: lm.bg, border: `1px solid ${lm.border}`, fontSize: 10.5, fontWeight: 700, color: lm.color, whiteSpace: "nowrap", flexShrink: 0 }}>
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: lm.color }} />{lm.label}
      </span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={hov ? "#64748b" : "#d1d5db"} strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
    </div>
  );
}

function ItemRow({ item, lm, sm, isLast, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr) 120px 128px 110px 44px", padding: "0 16px", background: hov ? "#f8fafc" : "#ffffff", borderBottom: isLast ? "none" : "1px solid #f1f5f9", cursor: "pointer", transition: "background 0.11s", alignItems: "center" }}>
      <div style={{ padding: "10px 8px 10px 0" }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#334155", fontFamily: "monospace" }}>{item.id}</span>
      </div>
      <div style={{ padding: "10px 8px 10px 0", minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
        <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{item.body}</div>
      </div>
      <div style={{ padding: "10px 8px 10px 0" }}><Badge label={lm.label} color={lm.color} bg={lm.bg} border={lm.border} /></div>
      <div style={{ padding: "10px 8px 10px 0" }}><Badge label={sm.label} color={sm.color} bg={sm.bg} border={sm.border} /></div>
      <div style={{ padding: "10px 8px 10px 0", fontSize: 11, color: "#94a3b8" }}>{item.updated || item.date || "—"}</div>
      <div style={{ padding: "10px 0" }}>
        <span style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #e2e8f0", background: hov ? "#fff" : "#f8fafc", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </span>
      </div>
    </div>
  );
}

function Badge({ label, color, bg, border }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 20, background: bg, border: `1px solid ${border}`, fontSize: 11, fontWeight: 700, color, whiteSpace: "nowrap" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

function SecHead({ n, title, done }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 20, height: 20, borderRadius: "50%", background: done ? "#059669" : "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {done
          ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          : <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff" }}>{n}</span>}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#0f172a" }}>{title}</span>
    </div>
  );
}
