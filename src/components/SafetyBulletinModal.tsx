// @ts-nocheck
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  Check,
  ChevronRight,
  Circle,
  CircleDot,
  ClipboardList,
  Clock3,
  Download,
  Eye,
  FileText,
  Flame,
  GraduationCap,
  HeartPulse,
  History,
  Image,
  Info,
  ListFilter,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  Siren,
  Trash2,
  User,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  buildBulletinPointView,
  normalizeBulletinSearchText,
  truncateBulletinText
} from "./bulletinPointView";
import { createBulletin, textToList } from "../core/hubCore";
import { Button } from "./ui";
import { getText } from "../i18n";
import { api } from "../services/api";
import "./SafetyBulletinModal.css";

const ADMIN_ROLES = new Set(["admin", "ehs", "leader"]);
const ROOT_ADMIN_ROLES = new Set(["admin"]);

const copy = {
  vi: {
    add: "Thêm bảng tin",
    audience: "Đối tượng",
    cancel: "Hủy",
    detailTitle: "Chi tiết bảng tin",
    delete: "Xóa",
    edit: "Sửa",
    hide: "Ẩn",
    restore: "Khôi phục",
    show: "Hiện",
    history: "Nhật ký sửa",
    meta: "Thông tin cập nhật",
    points: "Ý chính",
    published: "Đang đăng",
    save: "Lưu",
    summary: "Tóm tắt",
    tone: "Mức độ",
    updatedBy: "Người sửa",
    noLogs: "Chưa có log sửa.",
    newItem: "Bảng tin mới",
    document: "Tài liệu đính kèm",
    documentId: "ID tài liệu",
    focusTitle: "Việc cần làm ngay",
    focusSubtitle: "Các điểm ưu tiên từ nội dung họp",
    sectionsTitle: "Nhóm nội dung",
    allPoints: "Toàn bộ nội dung",
    searchPlaceholder: "Tìm nhanh: TNLĐ, PCCC, TSS, TBM...",
    searchResults: "Đang hiển thị",
    noMatches: "Không có nội dung phù hợp.",
    clearSearch: "Xóa tìm kiếm",
    pointCount: "ý",
    pointLabel: "Ý chính",
    pointToneLabels: {
      critical: "Ưu tiên",
      warning: "Theo dõi",
      good: "Đã ổn",
      info: "Thông tin"
    },
    sectionLabels: {
      health: "Y tế & sức khỏe",
      incident: "TNLĐ / Cận nguy",
      action: "Chỉ đạo & việc phải làm",
      system: "6S / PCCC / Risk",
      environment: "Hóa chất & môi trường",
      governance: "Thông báo & theo dõi",
      other: "Nội dung khác"
    }
  },
  en: {
    add: "Add bulletin",
    audience: "Audience",
    cancel: "Cancel",
    detailTitle: "Bulletin detail",
    delete: "Delete",
    edit: "Edit",
    hide: "Hide",
    restore: "Restore",
    show: "Show",
    history: "Edit log",
    meta: "Update info",
    points: "Key points",
    published: "Published",
    save: "Save",
    summary: "Summary",
    tone: "Priority",
    updatedBy: "Updated by",
    noLogs: "No edit logs yet.",
    newItem: "New bulletin",
    document: "Attachment",
    documentId: "Document ID",
    focusTitle: "Immediate actions",
    focusSubtitle: "Priority points from the meeting",
    sectionsTitle: "Content groups",
    allPoints: "Full content",
    searchPlaceholder: "Search: accident, fire, TSS, TBM...",
    searchResults: "showing",
    noMatches: "No matching content.",
    clearSearch: "Clear search",
    pointCount: "points",
    pointLabel: "Point",
    pointToneLabels: {
      critical: "Priority",
      warning: "Watch",
      good: "OK",
      info: "Info"
    },
    sectionLabels: {
      health: "Health",
      incident: "Accidents / Near-misses",
      action: "Instructions & required actions",
      system: "6S / Fire safety / Risk",
      environment: "Chemical & environment",
      governance: "Notices & follow-up",
      other: "Other content"
    }
  },
  ja: {
    add: "掲示を追加",
    audience: "対象",
    cancel: "キャンセル",
    detailTitle: "掲示詳細",
    delete: "削除",
    edit: "編集",
    hide: "非表示",
    restore: "復元",
    show: "表示",
    history: "編集履歴",
    meta: "更新情報",
    points: "要点",
    published: "公開中",
    save: "保存",
    summary: "概要",
    tone: "優先度",
    updatedBy: "更新者",
    noLogs: "編集履歴はありません。",
    newItem: "新規掲示",
    document: "添付資料",
    documentId: "資料ID",
    focusTitle: "すぐ対応する項目",
    focusSubtitle: "会議内容からの優先項目",
    sectionsTitle: "内容グループ",
    allPoints: "全内容",
    searchPlaceholder: "検索: 労災、防火、TSS、TBM...",
    searchResults: "表示中",
    noMatches: "一致する内容がありません。",
    clearSearch: "検索をクリア",
    pointCount: "項目",
    pointLabel: "項目",
    pointToneLabels: {
      critical: "優先",
      warning: "確認",
      good: "正常",
      info: "情報"
    },
    sectionLabels: {
      health: "医療・健康",
      incident: "労災・ヒヤリ",
      action: "指示・対応事項",
      system: "6S・防火・リスク",
      environment: "化学物質・環境",
      governance: "通知・フォロー",
      other: "その他"
    }
  }
};

const label = (lang, key) => copy[lang]?.[key] || copy.vi[key] || key;

const formatDateTime = (value, lang) => {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : lang === "ja" ? "ja-JP" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const BULLETIN_PREVIEW_MODE_KEY = "hub-bulletin-preview-density";

const text3 = (vi, en = vi, ja = vi) => ({ vi, en, ja });

const buildDensePreviewBulletins = (baseBulletin) => {
  if (!baseBulletin) return [];
  const baseTitle = getText(baseBulletin.title, "vi") || "Thong bao";
  const baseAudience = getText(baseBulletin.audience, "vi") || "Tat ca bo phan";
  const basePoints = baseBulletin.points || { vi: [], en: [], ja: [] };
  const tones = ["good", "watch", "alert", "good", "watch", "alert", "good", "watch"];
  const previewTitles = [
    "Tong hop y te",
    "TNLD / Can nguy",
    "Chi dao thuc hien",
    "6S / PCCC / Risk",
    "Hoa chat & moi truong",
    "Thong bao theo doi",
    "Danh gia an toan",
    "Cap nhat phan tich"
  ];
  const previewSummaries = [
    "Mo phong mot danh sach bulletin day hon de kiem tra mat do va do ro.",
    "Muc 2 mo phong danh sach co nhieu ban ghi hon va de lam quen voi giao dien.",
    "Muc 3 giup xem card co con de doc khi noi dung xep thanh nhieu dong.",
    "Muc 4 mo phong noi dung 6S / PCCC / Risk trong trang 1.",
    "Muc 5 mo phong thong tin hoa chat va moi truong de xem do thoang.",
    "Muc 6 mo phong thong bao theo doi de kiem tra danh sach dai hon.",
    "Muc 7 mo phong them nhieu muc de test nhan dien nhanh trong modal.",
    "Muc 8 mo phong dang hien thi day hon cho page 1."
  ];

  return [
    baseBulletin,
    ...previewTitles.map((suffix, index) => ({
      ...baseBulletin,
      id: `${baseBulletin.id || "preview-bulletin"}-mock-${index + 1}`,
      tone: tones[index] || "watch",
      date: new Date(Date.now() - (index + 1) * 86400000).toISOString().slice(0, 10),
      title: text3(`${baseTitle} - ${suffix}`, `${baseTitle} - ${suffix}`, `${baseTitle} - ${suffix}`),
      summary: text3(previewSummaries[index], previewSummaries[index], previewSummaries[index]),
      audience: text3(baseAudience, baseAudience, baseAudience),
      points: basePoints
    }))
  ];
};

const buildForm = (bulletin) => {
  const base = bulletin || createBulletin();
  return {
    id: base.id,
    date: base.date || new Date().toISOString().slice(0, 10),
    tone: base.tone || "watch",
    title: base.title || { vi: "", en: "", ja: "" },
    titleVi: base.title?.vi || "",
    summary: base.summary || { vi: "", en: "", ja: "" },
    summaryVi: base.summary?.vi || "",
    points: base.points || { vi: [], en: [], ja: [] },
    pointsVi: Array.isArray(base.points?.vi) ? base.points.vi.join("\n") : "",
    audience: base.audience || { vi: "", en: "", ja: "" },
    audienceVi: base.audience?.vi || "",
    documentId: base.documentId || "",
    documentUrl: base.documentUrl || "",
    published: base.published !== false
  };
};

export function SafetyBulletinModal({
  bulletin,
  bulletins = [],
  isNew = false,
  lang,
  onClose,
  onDeleted,
  onSaved,
  startEditing = false,
  t,
  variant = "hot"
}) {
  const { user } = useAuth();
  const canEdit = !!user && ADMIN_ROLES.has(user.role);
  const canDelete = !!user && ROOT_ADMIN_ROLES.has(user.role);
  const [activeBulletin, setActiveBulletin] = useState(() => bulletin || null);
  const [editing, setEditing] = useState(startEditing);
  const [form, setForm] = useState(() => buildForm(bulletin || activeBulletin));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedPointNumber, setSelectedPointNumber] = useState("");
  const [activeView, setActiveView] = useState("latest");
  const [pointQuery, setPointQuery] = useState("");
  const [selectedOverviewKey, setSelectedOverviewKey] = useState("");
  const [listToneFilter, setListToneFilter] = useState("all");
  const bodyRef = useRef(null);
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);

  const current = useMemo(() => activeBulletin || bulletin || createBulletin(), [activeBulletin, bulletin]);
  const previewDenseMode = typeof window !== "undefined" && window.localStorage.getItem(BULLETIN_PREVIEW_MODE_KEY) === "dense";
  const bulletinList = useMemo(() => {
    const seen = new Set();
    const source = previewDenseMode ? buildDensePreviewBulletins(current) : [current, ...bulletins];
    return source
      .filter(Boolean)
      .filter((item) => {
        const key = item.id || getText(item.title, lang);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [bulletins, current, lang, previewDenseMode]);
  const bulletinCountTotal = previewDenseMode ? bulletinList.length : bulletins.length || bulletinList.length;
  const labels = copy[lang] || copy.vi;
  const tone = ["good", "watch", "alert"].includes(current.tone) ? current.tone : "watch";
  const points = Array.isArray(getText(current.points, lang)) ? getText(current.points, lang) : [];
  const pointViews = useMemo(() => points.map((point, index) => buildBulletinPointView(point, index)), [points]);
  const normalizedQuery = normalizeBulletinSearchText(pointQuery).trim();
  const visiblePointViews = useMemo(() => {
    if (!normalizedQuery) return pointViews;
    return pointViews.filter((item) => normalizeBulletinSearchText(`${item.number} ${item.label} ${item.body}`).includes(normalizedQuery));
  }, [normalizedQuery, pointViews]);
  const criticalCount = useMemo(() => pointViews.filter((item) => item.tone === "critical").length, [pointViews]);
  const warningCount = useMemo(() => pointViews.filter((item) => item.tone === "warning").length, [pointViews]);
  const normalCount = Math.max(0, pointViews.length - criticalCount - warningCount);
  const isLatestVariant = variant === "latest";
  const bulletinPosition = Math.max(1, bulletinList.findIndex((item) => item.id === current.id) + 1 || 1);
  const modalTitle = isNew ? label(lang, "newItem") : isLatestVariant ? "Thông báo mới nhất" : "Bảng cảnh báo nóng AT-6S";
  const alertTitle = isLatestVariant ? "Nội dung thông báo cần phổ biến" : "Thông báo nóng cần xử lý trong ngày";
  const alertSummary = isLatestVariant
    ? `${pointViews.length} ý chính • ${warningCount + criticalCount} mục cần theo dõi • Phổ biến tới đúng đối tượng`
    : `${criticalCount} mục ưu tiên cao • ${warningCount} mục cần theo dõi • Yêu cầu phổ biến tới toàn bộ CBCNV`;
  const priorityButtonLabel = isLatestVariant ? "Xem nhanh ý cần theo dõi" : "Xem nhanh mục ưu tiên";
  const overviewGroups = useMemo(() => {
    const assigned = new Set();
    const textOf = (item) => normalizeBulletinSearchText(`${item.label || ""} ${item.body || ""}`);
    const collect = (key, labelText, description, Icon, accent, matcher) => {
      const items = pointViews.filter((item) => !assigned.has(item.number) && matcher(textOf(item), item));
      items.forEach((item) => assigned.add(item.number));
      return { key, label: labelText, description, Icon, accent, items };
    };

    const groups = [
      collect("health", "Y tế & sức khỏe", "Các cảnh báo liên quan đến y tế và sức khỏe người lao động.", HeartPulse, "blue", (text, item) => item.group === "health" || /y te|suc khoe|benh|kham|medline|soc cuu|chan thuong/.test(text)),
      collect("incident", "TNLĐ / Cận nguy", "Tai nạn lao động, cận nguy và tình huống mất an toàn.", Siren, "red", (text, item) => item.group === "incident" || /tnld|tai nan|can nguy|nga|kep|cat dut|va cham/.test(text)),
      collect("pccc", "PCCC", "Phòng cháy chữa cháy và ứng phó khẩn cấp.", Flame, "purple", (text) => /pccc|chay|chua chay|bao chay|cuu hoa|thoat hiem/.test(text)),
      collect("training", "Đào tạo", "Các cảnh báo liên quan đến đào tạo và năng lực.", GraduationCap, "green", (text) => /dao tao|huan luyen|training|nang luc|pho bien|tap huan/.test(text)),
      collect("safety6s", "An toàn 6S", "Vi phạm 6S, vệ sinh, sắp xếp và an toàn tại hiện trường.", null, "amber", (text) => /6s|ve sinh|sap xep|an toan|hien truong|kiem tra/.test(text))
    ];

    groups.push({
      key: "system",
      label: "Hệ thống",
      description: "Cảnh báo về hệ thống, thiết bị và quy trình vận hành.",
      Icon: Settings,
      accent: "indigo",
      items: pointViews.filter((item) => !assigned.has(item.number))
    });

    return groups;
  }, [pointViews]);
  const activeOverviewGroup = useMemo(
    () => overviewGroups.find((group) => group.key === selectedOverviewKey) || overviewGroups.find((group) => group.items.length) || overviewGroups[0] || null,
    [overviewGroups, selectedOverviewKey]
  );
  const listSourcePoints = selectedOverviewKey && activeOverviewGroup ? activeOverviewGroup.items : pointViews;
  const listVisiblePoints = useMemo(() => {
    const source = selectedOverviewKey && activeOverviewGroup ? activeOverviewGroup.items : pointViews;
    return source.filter((item) => {
      const matchesTone = listToneFilter === "all" || item.tone === listToneFilter;
      const matchesQuery = !normalizedQuery || normalizeBulletinSearchText(`${item.number} ${item.label} ${item.body}`).includes(normalizedQuery);
      return matchesTone && matchesQuery;
    });
  }, [activeOverviewGroup, listToneFilter, normalizedQuery, pointViews, selectedOverviewKey]);
  const selectedPoint = useMemo(() => {
    if (!pointViews.length) return null;
    return pointViews.find((item) => item.number === selectedPointNumber) || visiblePointViews[0] || pointViews[0];
  }, [pointViews, selectedPointNumber, visiblePointViews]);
  const detailGroup = selectedPoint ? overviewGroups.find((group) => group.items.some((item) => item.number === selectedPoint.number)) : null;
  const preferredListGroup = useMemo(
    () => overviewGroups.find((group) => group.key === "incident" && group.items.length) || overviewGroups.find((group) => group.items.length) || overviewGroups[0] || null,
    [overviewGroups]
  );
  const codePrefixForGroup = (groupKey) => {
    const prefixes = {
      action: "ACT",
      environment: "ENV",
      health: "YT",
      incident: "TNLĐ",
      pccc: "PCCC",
      safety6s: "6S",
      system: "SYS"
    };
    return prefixes[groupKey] || "AT6S";
  };
  const codeForPoint = (item, group = null) => {
    const ownerGroup = group || overviewGroups.find((candidate) => candidate.items.some((point) => point.number === item?.number));
    const groupIndex = ownerGroup?.items?.findIndex((point) => point.number === item?.number) ?? -1;
    const sequence = groupIndex >= 0 ? groupIndex + 1 : Number(item?.number || 0);
    return `${codePrefixForGroup(ownerGroup?.key)}-${String(sequence || 0).padStart(3, "0")}`;
  };

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";

    const focusInsideModal = () => {
      if (!modalRef.current?.contains(document.activeElement)) {
        closeButtonRef.current?.focus({ preventScroll: true });
      }
    };

    const focusTimer = window.setTimeout(focusInsideModal, 0);
    const refocusTimer = window.setTimeout(focusInsideModal, 80);

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      onCloseRef.current?.();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      window.clearTimeout(refocusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown, true);
      if (previousFocusRef.current && document.contains(previousFocusRef.current)) {
        previousFocusRef.current.focus?.({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    setActiveBulletin(bulletin || null);
  }, [bulletin]);

  useEffect(() => {
    setForm(buildForm(current));
    setEditing(startEditing);
    setMessage("");
    setPointQuery("");
    setSelectedPointNumber("");
    setSelectedOverviewKey("");
    setListToneFilter("all");
    setActiveView("latest");
  }, [current, startEditing]);

  const payloadFromForm = () => ({
    date: form.date,
    tone: form.tone,
    title: { ...form.title, vi: form.titleVi.trim() },
    summary: { ...form.summary, vi: form.summaryVi.trim() },
    points: { ...form.points, vi: textToList(form.pointsVi) },
    audience: { ...form.audience, vi: form.audienceVi.trim() },
    documentId: form.documentId.trim(),
    documentUrl: form.documentUrl.trim(),
    published: form.published
  });

  const save = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const payload = payloadFromForm();
      const saved = isNew
        ? await api.createSafetyBulletin(payload)
        : await api.updateSafetyBulletin(current.id, payload);
      setActiveBulletin(saved);
      onSaved?.(saved);
      setEditing(false);
      setMessage(t("saved"));
    } catch (error) {
      setMessage(error.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const hide = async () => {
    if (!canEdit || isNew || saving) return;
    const title = getText(current.title, lang) || current.id;
    if (!window.confirm(`Ẩn bảng tin "${title}"? Người dùng thường sẽ không còn thấy bảng tin này.`)) return;
    setSaving(true);
    setMessage("");
    try {
      const updated = await api.updateSafetyBulletin(current.id, { ...current, published: false });
      setActiveBulletin(updated);
      onSaved?.(updated);
      setMessage(t("saved"));
    } catch (error) {
      setMessage(error.message || "Hide failed");
    } finally {
      setSaving(false);
    }
  };

  const show = async () => {
    if (!canEdit || isNew || saving) return;
    const title = getText(current.title, lang) || current.id;
    if (!window.confirm(`Hiện lại bảng tin "${title}"? Người dùng sẽ nhìn thấy bảng tin này.`)) return;
    setSaving(true);
    setMessage("");
    try {
      const updated = await api.updateSafetyBulletin(current.id, { ...current, published: true });
      setActiveBulletin(updated);
      onSaved?.(updated);
      setMessage(t("saved"));
    } catch (error) {
      setMessage(error.message || "Show failed");
    } finally {
      setSaving(false);
    }
  };

  const softDelete = async () => {
    if (!canDelete || isNew || saving) return;
    const title = getText(current.title, lang) || current.id;
    if (!window.confirm(`Xóa bảng tin "${title}"? Bảng tin sẽ bị ẩn khỏi người dùng và chỉ admin cao nhất có thể khôi phục.`)) return;
    setSaving(true);
    setMessage("");
    try {
      const updated = await api.deleteSafetyBulletin(current.id);
      setActiveBulletin(updated);
      onDeleted?.(updated);
      setMessage(t("saved"));
    } catch (error) {
      setMessage(error.message || "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const restore = async () => {
    if (!canDelete || isNew || saving) return;
    const title = getText(current.title, lang) || current.id;
    if (!window.confirm(`Khôi phục bảng tin "${title}"? Bảng tin sẽ quay lại danh sách quản trị.`)) return;
    setSaving(true);
    setMessage("");
    try {
      const updated = await api.restoreSafetyBulletin(current.id);
      setActiveBulletin(updated);
      onSaved?.(updated);
      setMessage(t("saved"));
    } catch (error) {
      setMessage(error.message || "Restore failed");
    } finally {
      setSaving(false);
    }
  };

  const showFooter = true;

  const scrollBodyToTop = () => {
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTo({ top: 0, behavior: "auto" });
  };

  const openPointDetail = (item) => {
    if (!item) return;
    setSelectedPointNumber(item.number);
    const overviewMatch = overviewGroups.find((group) => group.items.some((point) => point.number === item.number));
    if (overviewMatch) setSelectedOverviewKey(overviewMatch.key);
    setPointQuery("");
    setActiveView("detail");
    window.requestAnimationFrame(() => {
      scrollBodyToTop();
      window.setTimeout(scrollBodyToTop, 60);
    });
  };

  const openOverview = () => {
    setActiveView("latest");
    setPointQuery("");
    setListToneFilter("all");
    window.requestAnimationFrame(() => {
      scrollBodyToTop();
      window.setTimeout(scrollBodyToTop, 60);
    });
  };

  const openOverviewGroup = (group) => {
    if (!group) return;
    setSelectedOverviewKey(group.key);
    setPointQuery("");
    setListToneFilter("all");
    setSelectedPointNumber("");
    setActiveView("category");
    window.requestAnimationFrame(() => {
      scrollBodyToTop();
      window.setTimeout(scrollBodyToTop, 60);
    });
  };

  const openListStep = () => {
    if (!selectedOverviewKey && preferredListGroup) {
      setSelectedOverviewKey(preferredListGroup.key);
    }
    setActiveView("category");
    window.requestAnimationFrame(() => {
      scrollBodyToTop();
      window.setTimeout(scrollBodyToTop, 60);
    });
  };

  const openPriorityList = () => {
    setSelectedOverviewKey("");
    setPointQuery("");
    setListToneFilter("critical");
    setActiveView("category");
    window.requestAnimationFrame(() => {
      scrollBodyToTop();
      window.setTimeout(scrollBodyToTop, 60);
    });
  };

  const handleModalKeyDown = (event) => {
    if (event.key !== "Tab") return;

    const focusable = modalRef.current
      ? Array.from(
          modalRef.current.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((element) => element.getAttribute("aria-hidden") !== "true")
      : [];

    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (!modalRef.current?.contains(active)) {
      event.preventDefault();
      first.focus();
      return;
    }

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop iot-modal-backdrop safety-bulletin-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="bulletin-modal-title"
        aria-modal="true"
        className={`iot-responsive-modal safety-bulletin-modal ${isLatestVariant ? "latest" : "hot"}`}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleModalKeyDown}
        ref={modalRef}
        role="dialog"
      >
        <div className="bulletin-modal-header">
          <div className="bulletin-hot-header-brand">
            <span className="bulletin-hot-shield" aria-hidden="true">
              <ShieldAlert size={30} />
            </span>
            <div>
              <h2 className="bulletin-modal-title-row" id="bulletin-modal-title">
                <span>{modalTitle}</span>
              </h2>
              <p>
                {isLatestVariant ? (
                  <>Bảng tin nội bộ · {bulletinPosition} / {bulletinCountTotal}</>
                ) : (
                  <>
                    Cập nhật {formatDateTime(current.updatedAt || current.createdAt || current.date, "vi")}
                    {"  •  "}
                    {getText(current.audience, lang) || t("companyLevel")}
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="bulletin-modal-tools">
            <button className="bulletin-hot-header-btn" type="button">
              <Bell size={17} />
              Theo dõi
            </button>
            <button className="bulletin-hot-header-btn primary" type="button">
              <Download size={17} />
              Xuất PDF
            </button>
            {canEdit && !editing ? (
              <button className="bulletin-hot-header-icon" onClick={() => setEditing(true)} title={label(lang, "edit")} type="button">
                <Pencil size={17} />
              </button>
            ) : null}
            <button aria-label={t("close")} className="bulletin-hot-header-icon" onClick={onClose} ref={closeButtonRef} type="button">
              <X size={21} />
            </button>
          </div>
        </div>

        {editing ? (
          <div className="bulletin-modal-form">
            <label className="field">
              <span>{t("title")} VI</span>
              <input value={form.titleVi} onChange={(event) => setForm({ ...form, titleVi: event.target.value })} />
            </label>
            <div className="form-row">
              <label className="field">
                <span>{label(lang, "tone")}</span>
                <select value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value })}>
                  <option value="good">{t("statusGood")}</option>
                  <option value="watch">{t("statusWatch")}</option>
                  <option value="alert">{t("statusAlert")}</option>
                </select>
              </label>
              <label className="field">
                <span>{label(lang, "meta")}</span>
                <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>{label(lang, "audience")} VI</span>
              <input value={form.audienceVi} onChange={(event) => setForm({ ...form, audienceVi: event.target.value })} />
            </label>
            <label className="field">
              <span>{label(lang, "summary")} VI</span>
              <textarea value={form.summaryVi} onChange={(event) => setForm({ ...form, summaryVi: event.target.value })} />
            </label>
            <label className="field">
              <span>{label(lang, "points")} VI</span>
              <textarea value={form.pointsVi} onChange={(event) => setForm({ ...form, pointsVi: event.target.value })} />
            </label>
            <div className="form-row">
              <label className="field">
                <span>{label(lang, "documentId")}</span>
                <input value={form.documentId} onChange={(event) => setForm({ ...form, documentId: event.target.value })} />
              </label>
              <label className="field">
                <span>{t("url")}</span>
                <input value={form.documentUrl} onChange={(event) => setForm({ ...form, documentUrl: event.target.value })} />
              </label>
            </div>
            <label className="admin-toggle-row">
              <input
                checked={form.published}
                onChange={(event) => setForm({ ...form, published: event.target.checked })}
                type="checkbox"
              />
              <span>{label(lang, "published")}</span>
            </label>
          </div>
        ) : (
          <div className={`bulletin-modal-body bulletin-body-${activeView}`} ref={bodyRef}>
            <div className="bulletin-hot-shell">
              <div className="bulletin-hot-alert">
                <span className="bulletin-hot-alert-icon" aria-hidden="true">
                  <AlertTriangle size={24} />
                </span>
                <div>
                  <strong>{alertTitle}</strong>
                  <p>{alertSummary}</p>
                </div>
                <button onClick={openPriorityList} type="button">
                  {priorityButtonLabel}
                  <ArrowRight size={18} />
                </button>
              </div>

              <div className="bulletin-hot-stepper" role="tablist" aria-label={label(lang, "detailTitle")}>
                <button aria-selected={activeView === "latest"} className={activeView === "latest" ? "active" : ""} onClick={openOverview} role="tab" type="button">
                  <b>1</b>
                  <span>Tổng quan nhóm</span>
                </button>
                <i aria-hidden="true" />
                <button aria-selected={activeView === "category"} className={activeView === "category" ? "active" : ""} onClick={openListStep} role="tab" type="button">
                  <b>2</b>
                  <span>Danh sách mục</span>
                </button>
                <i aria-hidden="true" />
                <button aria-selected={activeView === "detail"} className={activeView === "detail" ? "active" : ""} disabled={!selectedPoint} onClick={() => selectedPoint && setActiveView("detail")} role="tab" type="button">
                  <b>3</b>
                  <span>Chi tiết mục</span>
                </button>
              </div>

              {activeView === "latest" ? (
                <div className="bulletin-hot-overview">
                  <div className="bulletin-hot-stats" aria-label={label(lang, "meta")}>
                    {[
                      { label: "Tổng số mục", value: pointViews.length, Icon: FileText, tone: "blue" },
                      { label: "Ưu tiên cao", value: criticalCount, Icon: ShieldAlert, tone: "red" },
                      { label: "Cần theo dõi", value: warningCount, Icon: Eye, tone: "orange" },
                      { label: "Bình thường", value: normalCount, Icon: CheckCircle2, tone: "green" }
                    ].map((stat) => (
                      <div className={`bulletin-hot-stat ${stat.tone}`} key={stat.label}>
                        <span aria-hidden="true"><stat.Icon size={28} /></span>
                        <div>
                          <small>{stat.label}</small>
                          <strong>{stat.value}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bulletin-hot-groups">
                    {overviewGroups.map((group) => {
                      const groupCritical = group.items.filter((item) => item.tone === "critical").length;
                      const isFeaturedIncidentGroup = group.key === "incident";
                      const Icon = group.Icon;
                      return (
                        <button className={`bulletin-hot-group-card ${group.accent}${isFeaturedIncidentGroup ? " hot" : ""}`} key={group.key} onClick={() => openOverviewGroup(group)} type="button">
                          <span className="bulletin-hot-group-icon" aria-hidden="true">
                            {group.key === "safety6s" ? <span className="bulletin-sixs-icon">6S</span> : <Icon size={32} strokeWidth={2.2} />}
                          </span>
                          <span className="bulletin-hot-group-content">
                            <strong>{group.label}</strong>
                            <small>{group.description}</small>
                            <em>
                              {group.items.length} mục
                              {groupCritical ? `  •  ${groupCritical} ưu tiên` : ""}
                            </em>
                          </span>
                          <ChevronRight size={19} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : activeView === "category" ? (
                <div className="bulletin-hot-list-page">
                  <div className="bulletin-hot-list-head">
                    <span className={`bulletin-hot-group-icon ${activeOverviewGroup?.accent || "indigo"}`} aria-hidden="true">
                      {activeOverviewGroup?.key === "safety6s" ? <span className="bulletin-sixs-icon">6S</span> : activeOverviewGroup?.Icon ? <activeOverviewGroup.Icon size={32} strokeWidth={2.2} /> : <ListFilter size={32} />}
                    </span>
                    <div>
                      <h3>{selectedOverviewKey ? activeOverviewGroup?.label : "Tất cả mục ưu tiên"}</h3>
                      <p>{listSourcePoints.length} mục • {listSourcePoints.filter((item) => item.tone === "critical").length} ưu tiên cao • cập nhật 08:10</p>
                    </div>
                    <label className="bulletin-hot-search">
                      <Search size={17} />
                      <input value={pointQuery} onChange={(event) => setPointQuery(event.target.value)} placeholder="Tìm trong nhóm này..." type="search" />
                    </label>
                    <button className="bulletin-hot-export" type="button">
                      <Download size={17} />
                      Xuất danh sách
                    </button>
                  </div>
                  <div className="bulletin-hot-filter-pills">
                    {[
                      ["all", `Tất cả (${listSourcePoints.length})`],
                      ["critical", `Ưu tiên cao (${listSourcePoints.filter((item) => item.tone === "critical").length})`],
                      ["warning", `Cần theo dõi (${listSourcePoints.filter((item) => item.tone === "warning").length})`],
                      ["good", `Bình thường (${listSourcePoints.filter((item) => item.tone === "good" || item.tone === "info").length})`]
                    ].map(([key, text]) => (
                      <button className={listToneFilter === key ? "active" : ""} key={key} onClick={() => setListToneFilter(key)} type="button">
                        {text}
                      </button>
                    ))}
                  </div>
                  <div className="bulletin-hot-table" role="table">
                    <div className="bulletin-hot-table-row head" role="row">
                      <span>Mã mục</span>
                      <span>{"Ti\u00eau \u0111\u1ec1"}</span>
                      <span>{"M\u1ee9c \u0111\u1ed9"}</span>
                      <span>Trạng thái</span>
                      <span>Cập nhật</span>
                      <span>Thao tác</span>
                    </div>
                    {listVisiblePoints.map((item) => {
                      const toneLabel = item.tone === "critical" ? "Ưu tiên cao" : item.tone === "warning" ? "Cần theo dõi" : "Bình thường";
                      const statusLabel = item.tone === "critical" || item.tone === "warning" ? "Đang xử lý" : "Đã khắc phục";
                      return (
                        <button className="bulletin-hot-table-row" key={`${item.number}-${item.body}`} onClick={() => openPointDetail(item)} role="row" type="button">
                          <span>{codeForPoint(item, activeOverviewGroup)}</span>
                          <span>
                            <strong>{item.label || `${labels.pointLabel} ${item.number}`}</strong>
                            <small>{truncateBulletinText(item.body, 78)}</small>
                          </span>
                          <span><em className={`hot-pill ${item.tone}`}>{item.tone === "critical" ? <AlertTriangle size={14} /> : item.tone === "warning" ? <Clock3 size={14} /> : <CheckCircle2 size={14} />}{toneLabel}</em></span>
                          <span><em className={`hot-pill status ${item.tone}`}>{item.tone === "critical" || item.tone === "warning" ? <CircleDot size={14} /> : <CheckCircle2 size={14} />}{statusLabel}</em></span>
                          <span>08:10, 01/06/2026</span>
                          <span><ChevronRight size={19} /></span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : selectedPoint ? (
                <article className={`bulletin-hot-detail ${selectedPoint.tone}`}>
                  <div className="bulletin-hot-detail-title">
                    <small>{codeForPoint(selectedPoint, detailGroup)}</small>
                    <h3>{selectedPoint.label || `${labels.pointLabel} ${selectedPoint.number}`}</h3>
                    <span>
                      <em className={`hot-pill ${selectedPoint.tone}`}>{selectedPoint.tone === "critical" ? <ShieldAlert size={15} /> : selectedPoint.tone === "warning" ? <Clock3 size={15} /> : <CheckCircle2 size={15} />}{selectedPoint.tone === "critical" ? "Ưu tiên cao" : selectedPoint.tone === "warning" ? "Cần theo dõi" : "Bình thường"}</em>
                      <em className={`hot-pill status ${selectedPoint.tone}`}>{selectedPoint.tone === "critical" || selectedPoint.tone === "warning" ? <CircleDot size={15} /> : <CheckCircle2 size={15} />}{selectedPoint.tone === "critical" || selectedPoint.tone === "warning" ? "Đang xử lý" : "Đã khắc phục"}</em>
                    </span>
                  </div>
                  <div className="bulletin-hot-detail-tabs">
                    <button className="active" type="button"><Info size={16} /> Thông tin chi tiết</button>
                    <button type="button"><Image size={16} /> Hình ảnh / Tài liệu</button>
                    <button type="button"><History size={16} /> Lịch sử xử lý</button>
                    <button type="button"><MessageSquare size={16} /> Bình luận (3)</button>
                  </div>
                  <div className="bulletin-hot-detail-grid">
                    <section className="bulletin-hot-info-card">
                      <h4>Thông tin chung</h4>
                      {[
                        [ClipboardList, "Mã mục", codeForPoint(selectedPoint, detailGroup)],
                        [ShieldAlert, "Nhóm", activeOverviewGroup?.label || detailGroup?.label || selectedPoint.group],
                        [AlertTriangle, "Mức độ", selectedPoint.tone === "critical" ? "Ưu tiên cao" : selectedPoint.tone === "warning" ? "Cần theo dõi" : "Bình thường"],
                        [CircleDot, "Trạng thái", selectedPoint.tone === "good" ? "Đã khắc phục" : "Đang xử lý"],
                        [CalendarDays, "Ngày xảy ra", "01/06/2026 07:45"],
                        [MapPin, "Địa điểm", "Khu vực nhà máy"],
                        [User, "Người báo cáo", current.updatedByName || "Nguyễn Văn A"],
                        [Clock3, "Cập nhật cuối", "01/06/2026 08:10"]
                      ].map(([Icon, key, value]) => (
                        <p key={key}><Icon size={16} /><span>{key}</span><strong>{value}</strong></p>
                      ))}
                    </section>
                    <section className="bulletin-hot-detail-content">
                      <h4><FileText size={18} /> 1. Mô tả chi tiết</h4>
                      <p>{selectedPoint.body}</p>
                      <h4><CheckCircle2 size={18} /> 2. Hành động đã thực hiện</h4>
                      <ul>
                        <li>Sơ cứu ban đầu và đưa người liên quan đến phòng y tế</li>
                        <li>Dừng khu vực liên quan để kiểm tra an toàn</li>
                        <li>Điều tra nguyên nhân và lập biên bản</li>
                      </ul>
                      <h4><Circle size={18} /> 3. Hành động tiếp theo</h4>
                      <ul className="pending">
                        <li>Đào tạo lại quy trình vận hành cho toàn bộ nhân viên liên quan</li>
                        <li>Bổ sung biển cảnh báo và hướng dẫn tại khu vực</li>
                        <li>Kiểm tra định kỳ trong tuần này</li>
                      </ul>
                      <div className="bulletin-hot-note">
                        <AlertTriangle size={18} />
                        Lưu ý: Mục này cần được theo dõi chặt chẽ và báo cáo tiến độ hằng ngày.
                      </div>
                    </section>
                  </div>
                </article>
              ) : null}
            </div>
          </div>
        )}

        {showFooter ? (
          <div className="bulletin-modal-footer">
            {message ? <p className="form-message">{message}</p> : <span />}
            <div>
              {editing ? (
                <>
                  <Button className="secondary-button small" onClick={() => (isNew ? onClose() : setEditing(false))} size="sm" variant="secondary">
                    <X size={15} />
                    {label(lang, "cancel")}
                  </Button>
                  <Button className="primary-button small" disabled={saving} onClick={save} size="sm">
                    {isNew ? <Plus size={15} /> : <Save size={15} />}
                    {saving ? t("saving") : label(lang, "save")}
                  </Button>
                </>
              ) : (
                canEdit && !isNew ? (
                  <>
                    {current.deleted ? (
                      canDelete ? (
                        <Button className="secondary-button small" disabled={saving} onClick={restore} size="sm" variant="secondary">
                          <RefreshCw size={15} />
                          {label(lang, "restore")}
                        </Button>
                      ) : null
                    ) : current.published === false ? (
                      <Button className="secondary-button small" disabled={saving} onClick={show} size="sm" variant="secondary">
                        <Eye size={15} />
                        {label(lang, "show")}
                      </Button>
                    ) : (
                      <Button className="secondary-button small" disabled={saving} onClick={hide} size="sm" variant="secondary">
                        <Eye size={15} />
                        {label(lang, "hide")}
                      </Button>
                    )}
                    {canDelete && !current.deleted ? (
                      <Button className="secondary-button small danger-soft" disabled={saving} onClick={softDelete} size="sm" variant="danger">
                        <Trash2 size={15} />
                        {label(lang, "delete")}
                      </Button>
                    ) : null}
                  </>
                ) : null
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
