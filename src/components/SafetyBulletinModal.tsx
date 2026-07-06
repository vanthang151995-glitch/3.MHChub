// @ts-nocheck
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  Check,
  ChevronLeft,
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

const copy = {
  vi: {
    add: "Thêm bảng tin",
    audience: "Đối tượng",
    cancel: "Hủy",
    detailTitle: "Chi tiết bảng tin",
    edit: "Sửa",
    hide: "Ẩn",
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
    edit: "Edit",
    hide: "Hide",
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
    edit: "編集",
    hide: "非表示",
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
    titleJa: base.title?.ja || "",
    summary: base.summary || { vi: "", en: "", ja: "" },
    summaryVi: base.summary?.vi || "",
    summaryJa: base.summary?.ja || "",
    points: base.points || { vi: [], en: [], ja: [] },
    pointsVi: Array.isArray(base.points?.vi) ? base.points.vi.join("\n") : "",
    pointsJa: Array.isArray(base.points?.ja) ? base.points.ja.join("\n") : "",
    audience: base.audience || { vi: "", en: "", ja: "" },
    audienceVi: base.audience?.vi || "",
    audienceJa: base.audience?.ja || "",
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
  const [activeBulletin, setActiveBulletin] = useState(() => bulletin || null);
  const [editing, setEditing] = useState(startEditing);
  const [localIsNew, setLocalIsNew] = useState(isNew);
  const [formLang, setFormLang] = useState("vi");
  const [showBulletinList, setShowBulletinList] = useState(false);
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

  // — Groups format (new CreateModal) takes priority over legacy points.vi —
  const groupsData = Array.isArray(current.groups) && current.groups.length > 0 ? current.groups : null;

  const GKEY_TO_GROUP = {
    "TNLĐ / Cận nguy":          "incident",
    "Y tế & sức khỏe":          "health",
    "6S / PCCC / Risk":          "system",
    "Chỉ đạo & việc cần làm":   "action",
    "Đào tạo & TSS":             "training",
    "Nội dung họp":              "other",
  };
  const LEVEL_TO_TONE = { critical: "critical", warning: "warning", good: "good", info: "info" };

  // Rich item lookup: point number — full item data (for detail view)
  const richItemMap = useMemo(() => {
    if (!groupsData) return {};
    const map = {};
    let c = 0;
    for (const g of groupsData) {
      for (const it of (g.items || [])) {
        c++;
        map[String(c).padStart(2, "0")] = { ...it, groupKey: g.key };
      }
    }
    return map;
  }, [current]);

  const pointViews = useMemo(() => {
    if (groupsData) {
      let c = 0;
      return groupsData.flatMap(g =>
        (g.items || []).map(it => {
          c++;
          return {
            label: it.title || "",
            body:  it.body  || "",
            number: String(c).padStart(2, "0"),
            group:  GKEY_TO_GROUP[g.key] || "other",
            tone:   LEVEL_TO_TONE[it.level] || "info",
          };
        })
      );
    }
    return points.map((point, index) => buildBulletinPointView(point, index));
  }, [current, points]);
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
  const modalTitle = localIsNew ? label(lang, "newItem") : isLatestVariant ? "Thông báo mới nhất" : "Bảng cảnh báo nóng AT-6S";
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
    title: { ...form.title, vi: form.titleVi.trim(), ja: form.titleJa.trim() },
    summary: { ...form.summary, vi: form.summaryVi.trim(), ja: form.summaryJa.trim() },
    points: { ...form.points, vi: textToList(form.pointsVi), ja: textToList(form.pointsJa) },
    audience: { ...form.audience, vi: form.audienceVi.trim(), ja: form.audienceJa.trim() },
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
      const saved = localIsNew
        ? await api.createSafetyBulletin(payload)
        : await api.updateSafetyBulletin(current.id, payload);
      setActiveBulletin(saved);
      onSaved?.(saved);
      setEditing(false);
      setLocalIsNew(false);
      setMessage(t("saved"));
      setActiveView("latest");
      setSelectedOverviewKey("");
      setShowBulletinList(false);
    } catch (error) {
      setMessage(error.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateNew = () => {
    setLocalIsNew(true);
    setEditing(true);
    setActiveBulletin(null);
    setForm(buildForm(null));
    setMessage("");
  };

  const goToBulletin = (b) => {
    setActiveBulletin(b);
    setForm(buildForm(b));
    setEditing(false);
    setLocalIsNew(false);
    setMessage("");
    setActiveView("latest");
    setSelectedOverviewKey("");
    setPointQuery("");
    setListToneFilter("all");
    setSelectedPointNumber("");
    window.requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0, behavior: "auto" }));
  };

  const goToPrev = () => {
    const idx = bulletinList.findIndex((b) => b.id === current.id);
    if (idx > 0) goToBulletin(bulletinList[idx - 1]);
  };

  const goToNext = () => {
    const idx = bulletinList.findIndex((b) => b.id === current.id);
    if (idx >= 0 && idx < bulletinList.length - 1) goToBulletin(bulletinList[idx + 1]);
  };


  const hide = async () => {
    if (!canEdit || localIsNew || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const updated = await api.deleteSafetyBulletin(current.id);
      onDeleted?.(updated);
      setMessage(t("saved"));
    } catch (error) {
      setMessage(error.message || "Delete failed");
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
        {pending && (
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: "24px 28px", maxWidth: 380, width: "92%", boxShadow: "0 24px 48px rgba(15,23,42,0.22)" }}>
              <p style={{ margin: "0 0 18px", fontSize: 14, fontWeight: 600, color: "#0f172a", lineHeight: 1.5 }}>{pending.msg}</p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setPending(null)} style={{ padding: "7px 18px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>Hủy</button>
                <button onClick={() => { const fn = pending.onOk; setPending(null); fn(); }} style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: pending.danger ? "#dc2626" : "#d97706", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>{pending.label}</button>
              </div>
            </div>
          </div>
        )}
        <div className="bulletin-modal-header">
          <div className="bulletin-hot-header-brand">
            <span className="bulletin-hot-shield" aria-hidden="true">
              <ShieldAlert size={30} />
            </span>
            <div>
              <h2 className="bulletin-modal-title-row" id="bulletin-modal-title">
                <span>{modalTitle}</span>
              </h2>
              <div className="bulletin-modal-nav-row">
                {isLatestVariant ? (
                  <>
                    <button
                      aria-label="Danh sách thông báo"
                      className={`bulletin-nav-list-toggle${showBulletinList ? " active" : ""}`}
                      onClick={() => setShowBulletinList((v) => !v)}
                      title="Xem tất cả thông báo"
                      type="button"
                    >
                      <User size={14} />
                      <span>{bulletinCountTotal} bảng tin</span>
                    </button>
                    <div className="bulletin-nav-arrows">
                      <button aria-label="Thông báo trước" disabled={bulletinPosition <= 1} onClick={goToPrev} title="Trước" type="button">
                        <ChevronLeft size={15} />
                      </button>
                      <span>{bulletinPosition} / {bulletinCountTotal}</span>
                      <button aria-label="Thông báo sau" disabled={bulletinPosition >= bulletinCountTotal} onClick={goToNext} title="Tiếp" type="button">
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    Cập nhật {formatDateTime(current.updatedAt || current.createdAt || current.date, "vi")}
                    {"  •  "}
                    {getText(current.audience, lang) || t("companyLevel")}
                  </>
                )}
              </div>
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
            {canEdit && isLatestVariant && !editing ? (
              <button className="bulletin-hot-header-btn accent" onClick={handleCreateNew} title="Thêm thông báo mới" type="button">
                <Plus size={16} />
                Thêm bảng tin
              </button>
            ) : null}
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

        {isLatestVariant && showBulletinList && !editing ? (
          <div className="bulletin-list-sidebar">
            <div className="bulletin-list-sidebar-head">
              <span>Tất cả thông báo ({bulletinCountTotal})</span>
              <button onClick={() => setShowBulletinList(false)} title="Đóng" type="button"><X size={15} /></button>
            </div>
            <div className="bulletin-list-sidebar-items">
              {bulletinList.map((b) => {
                const isCurrent = b.id === current.id;
                const btone = ["good","watch","alert"].includes(b.tone) ? b.tone : "watch";
                return (
                  <button
                    className={`bulletin-sidebar-item${isCurrent ? " active" : ""} tone-${btone}`}
                    key={b.id}
                    onClick={() => goToBulletin(b)}
                    type="button"
                  >
                    <span className={`bulletin-sidebar-dot ${btone}`} />
                    <div>
                      <strong>{getText(b.title, lang) || "—"}</strong>
                      <small>{b.date} · {getText(b.audience, lang) || t("companyLevel")}</small>
                    </div>
                    {isCurrent ? <ChevronRight size={14} className="bulletin-sidebar-arrow" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {editing ? (
          <div className="bulletin-modal-form">
            <div className="bf-form-lang-tabs">
              <button className={formLang === "vi" ? "active" : ""} onClick={() => setFormLang("vi")} type="button">🇻🇳 Tiếng Việt</button>
              <button className={formLang === "ja" ? "active" : ""} onClick={() => setFormLang("ja")} type="button">🇯🇵 日本語</button>
              <span className="bf-form-lang-hint">{formLang === "vi" ? "Nhập nội dung chính bằng tiếng Việt" : "日本語で内容を入力してください"}</span>
            </div>
            <div className="form-row">
              <label className="field" style={{flex:2}}>
                <span>{formLang === "vi" ? "Tiêu đề" : "タイトル"}</span>
                {formLang === "vi"
                  ? <input value={form.titleVi} onChange={(e) => setForm({ ...form, titleVi: e.target.value })} placeholder="Ví dụ: Họp AT T05/2026 — Nội dung trọng tâm đầy đủ" />
                  : <input value={form.titleJa} onChange={(e) => setForm({ ...form, titleJa: e.target.value })} placeholder="例: 安全会議 2026年5月 — 主な内容" />}
              </label>
              <label className="field">
                <span>{label(lang, "tone")}</span>
                <select value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}>
                  <option value="good">{t("statusGood")}</option>
                  <option value="watch">{t("statusWatch")}</option>
                  <option value="alert">{t("statusAlert")}</option>
                </select>
              </label>
              <label className="field">
                <span>{label(lang, "meta")}</span>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>{formLang === "vi" ? "Đối tượng" : "対象"}</span>
              {formLang === "vi"
                ? <input value={form.audienceVi} onChange={(e) => setForm({ ...form, audienceVi: e.target.value })} placeholder="Tất cả bộ phận / Sản xuất / EHS..." />
                : <input value={form.audienceJa} onChange={(e) => setForm({ ...form, audienceJa: e.target.value })} placeholder="全部門 / 製造 / EHS..." />}
            </label>
            <label className="field">
              <span>{formLang === "vi" ? "Tóm tắt" : "概要"}</span>
              {formLang === "vi"
                ? <textarea rows={2} value={form.summaryVi} onChange={(e) => setForm({ ...form, summaryVi: e.target.value })} placeholder="Mô tả ngắn nội dung bảng tin — vài câu tổng quan" />
                : <textarea rows={2} value={form.summaryJa} onChange={(e) => setForm({ ...form, summaryJa: e.target.value })} placeholder="掲示の概要を簡単に説明してください" />}
            </label>
            <div className="bf-points-field">
              <div className="bf-points-header">
                <span className="bf-points-label">{formLang === "vi" ? "Ý chính (mỗi dòng = 1 ý)" : "要点（1行 = 1項目）"}</span>
                <span className="bf-points-count">{(formLang === "vi" ? form.pointsVi : form.pointsJa).split("\n").filter((l) => l.trim()).length} ý chính</span>
              </div>
              <div className="bf-points-hint">
                {formLang === "vi"
                  ? <><strong>Định dạng:</strong> <code>Tiêu đề: Nội dung chi tiết</code> — Từ khóa tự động phân nhóm: <em>TNLĐ, y tế, 6S, PCCC, đào tạo, hóa chất…</em></>
                  : <><strong>形式:</strong> <code>タイトル: 詳細内容</code> — キーワードで自動分類されます</>}
              </div>
              {formLang === "vi"
                ? <textarea className="bf-points-textarea" rows={14} value={form.pointsVi} onChange={(e) => setForm({ ...form, pointsVi: e.target.value })} placeholder={"TNLĐ tháng 5: Ghi nhận 1 vụ kẹp tay tại dây chuyền A — đã sơ cứu và điều tra\nY tế: Kết quả khám sức khỏe định kỳ Q2 — 3 NLĐ cần theo dõi huyết áp\n6S khu vực B: Phát hiện lối đi bị chặn bởi pallet — yêu cầu khắc phục ngay\nPCCC: Kiểm tra bình cứu hỏa tháng 6 — hạn sử dụng còn đủ\nĐào tạo: Lịch huấn luyện ATLĐ cho nhân viên mới — 15/06/2026\n..."}  />
                : <textarea className="bf-points-textarea" rows={14} value={form.pointsJa} onChange={(e) => setForm({ ...form, pointsJa: e.target.value })} placeholder={"5月の労災: Aラインで手のはさまれ事故1件 — 応急処置・調査済み\n健康管理: Q2定期健康診断結果 — 血圧経過観察3名\n6S区域B: 通路のパレット障害発見 — 即時是正要求\n..."} />}
              {(() => {
                const viLines = form.pointsVi.split("\n").filter((l) => l.trim());
                if (!viLines.length) return null;
                const groups = {};
                viLines.forEach((line, idx) => {
                  const { label: lbl, body } = (() => { const s = line.indexOf(":"); return s > 0 && s <= 48 ? { label: line.slice(0, s).trim(), body: line.slice(s + 1).trim() } : { label: "", body: line.trim() }; })();
                  const t2 = (lbl + " " + body).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
                  const g = /(tnld|tai nan|can nguy)/.test(t2) ? "TNLĐ" : /(y te|suc khoe|benh|kham)/.test(t2) ? "Y tế" : /(pccc|chay|chua chay)/.test(t2) ? "PCCC" : /(dao tao|huan luyen|training)/.test(t2) ? "Đào tạo" : /(6s|ve sinh|sap xep)/.test(t2) ? "6S" : /(hoa chat|moi truong|tss)/.test(t2) ? "Môi trường" : "Khác";
                  groups[g] = (groups[g] || 0) + 1;
                });
                return (
                  <div className="bf-points-preview">
                    <span className="bf-preview-title">Phân nhóm tự động → Trang 2 modal:</span>
                    {Object.entries(groups).map(([g, n]) => (
                      <span className="bf-preview-pill" key={g}>{g} <strong>{n}</strong></span>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="form-row">
              <label className="field">
                <span>{label(lang, "documentId")}</span>
                <input value={form.documentId} onChange={(e) => setForm({ ...form, documentId: e.target.value })} placeholder="ID tài liệu đính kèm (tuỳ chọn)" />
              </label>
              <label className="field">
                <span>{t("url")}</span>
                <input value={form.documentUrl} onChange={(e) => setForm({ ...form, documentUrl: e.target.value })} placeholder="https://..." />
              </label>
            </div>
            <label className="admin-toggle-row">
              <input
                checked={form.published}
                onChange={(e) => setForm({ ...form, published: e.target.checked })}
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
                    {(() => {
                      const rich = richItemMap[selectedPoint?.number] || null;
                      const toneLabel = selectedPoint.tone === "critical" ? "Ưu tiên cao" : selectedPoint.tone === "warning" ? "Cần theo dõi" : selectedPoint.tone === "good" ? "Bình thường" : "Thông tin";
                      const statusLabel = selectedPoint.tone === "good" || selectedPoint.tone === "info" ? "Đã khắc phục" : "Đang xử lý";
                      const updatedDate = current.updatedAt
                        ? new Date(current.updatedAt).toLocaleDateString("vi-VN")
                        : current.date || "—";
                      const actions = Array.isArray(rich?.actions) ? rich.actions.filter(Boolean) : [];
                      const next    = Array.isArray(rich?.next)    ? rich.next.filter(Boolean)    : [];
                      return (
                        <>
                          <section className="bulletin-hot-info-card">
                            <h4>Thông tin chung</h4>
                            {[
                              [ClipboardList, "Mã mục",        codeForPoint(selectedPoint, detailGroup)],
                              [ShieldAlert,   "Nhóm",          rich?.groupKey || activeOverviewGroup?.label || detailGroup?.label || selectedPoint.group],
                              [AlertTriangle, "Mức độ",        toneLabel],
                              [CircleDot,     "Trạng thái",    statusLabel],
                              rich?.date     ? [CalendarDays, "Ngày ghi nhận", rich.date]     : null,
                              rich?.location ? [MapPin,        "Địa điểm",     rich.location] : null,
                              rich?.reporter ? [User,          "Người báo cáo",rich.reporter] : null,
                              [Clock3, "Ngày cập nhật", updatedDate],
                            ].filter(Boolean).map(([Icon, key, value]) => (
                              <p key={key}><Icon size={16} /><span>{key}</span><strong>{value}</strong></p>
                            ))}
                          </section>
                          <section className="bulletin-hot-detail-content">
                            {(() => {
                              const bodyText = selectedPoint.body || rich?.body || "";
                              if (rich) {
                                // Groups format — structured actions/next data
                                return (
                                  <>
                                    <h4><FileText size={18} /> 1. Mô tả chi tiết</h4>
                                    <p>{bodyText || "(Chưa có mô tả)"}</p>
                                    {actions.length > 0 && (
                                      <>
                                        <h4><CheckCircle2 size={18} /> 2. Hành động đã thực hiện</h4>
                                        <ul>{actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                                      </>
                                    )}
                                    {next.length > 0 && (
                                      <>
                                        <h4><Circle size={18} /> 3. Hành động tiếp theo</h4>
                                        <ul className="pending">{next.map((n, i) => <li key={i}>{n}</li>)}</ul>
                                      </>
                                    )}
                                    {actions.length === 0 && next.length === 0 && (
                                      <div className="bulletin-hot-note">
                                        <AlertTriangle size={18} />
                                        Mục này chưa có thông tin hành động xử lý.
                                      </div>
                                    )}
                                  </>
                                );
                              }
                              // Points.vi format — parse semicolon-separated sub-items
                              const subItems = bodyText
                                .split(/;\s*/)
                                .map(s => s.trim())
                                .filter(Boolean);
                              return (
                                <>
                                  <h4><FileText size={18} /> Nội dung chi tiết</h4>
                                  {subItems.length > 1
                                    ? <ul>{subItems.map((s, i) => <li key={i}>{s}</li>)}</ul>
                                    : <p>{bodyText || "(Chưa có nội dung)"}</p>
                                  }
                                </>
                              );
                            })()}
                            {actions.length === 0 && next.length === 0 && (
                              <div className="bulletin-hot-note">
                                <AlertTriangle size={18} />
                                Mục này chưa có thông tin hành động xử lý.
                              </div>
                            )}
                          </section>
                        </>
                      );
                    })()}
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
                  <Button className="secondary-button small" onClick={() => (localIsNew ? (setLocalIsNew(false), setEditing(false)) : setEditing(false))} size="sm" variant="secondary">
                    <X size={15} />
                    {label(lang, "cancel")}
                  </Button>
                  <Button className="primary-button small" disabled={saving} onClick={save} size="sm">
                    {localIsNew ? <Plus size={15} /> : <Save size={15} />}
                    {saving ? t("saving") : label(lang, "save")}
                  </Button>
                </>
              ) : (
                canEdit && !localIsNew ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button className="secondary-button small danger-soft" disabled={saving || current.published === false} onClick={hide} size="sm" variant="danger">
                      <EyeOff size={15} />
                      Ẩn đi
                    </Button>
                    {canDelete && (
                      <Button className="secondary-button small danger-soft" disabled={saving} onClick={softDelete} size="sm" variant="danger">
                        <Trash2 size={15} />
                        Xóa
                      </Button>
                    )}
                  </div>
                ) : null
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
