/**
 * SafetyCapaNav — Dải điều hướng chia sẻ giữa 3 trang CAPA Ecosystem:
 *   EHS Intelligence Dashboard  ←→  CAPA List  ←→  Phê duyệt CAPA
 *
 * Phân quyền:
 *  - EHS Intel:   admin, ehs, leader, safety_officer
 *  - CAPA List:   tất cả (read-only với viewer/user)
 *  - Phê duyệt:   admin, ehs
 */
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "./safety-api";
import "./safety-capa-nav.css";

type AnyUser = { role?: string; displayName?: string; username?: string; [k: string]: unknown };

const INTEL_ROLES    = new Set(["admin", "ehs", "leader", "safety_officer"]);
const APPROVAL_ROLES = new Set(["admin", "ehs"]);

const ROLE_LABEL: Record<string, string> = {
  admin:          "Quản trị hệ thống",
  ehs:            "EHS Officer",
  leader:         "Lãnh đạo",
  safety_officer: "Cán bộ ATLĐ",
  dept:           "Bộ phận",
  manager:        "Quản lý",
  viewer:         "Xem báo cáo",
  user:           "Người dùng",
};

const ROLE_ICON: Record<string, string> = {
  admin: "👑", ehs: "🛡️", leader: "⭐", safety_officer: "🔧",
  dept: "🏭", manager: "📊", viewer: "👁️", user: "👤",
};

const LOCKED_REASON: Record<string, string> = {
  intel:    "Chỉ dành cho EHS Officer, Lãnh đạo và Cán bộ ATLĐ",
  approval: "Chỉ dành cho EHS Officer và Quản trị viên",
};

interface Props {
  /** Nếu trang cha đã có số CAPA chờ duyệt, truyền vào để tránh fetch thêm */
  pendingCount?: number;
}

export function SafetyCapaNav({ pendingCount: pendingProp }: Props) {
  const { user } = useAuth() as { user: AnyUser | null };
  const location  = useLocation();
  const navigate  = useNavigate();
  const role      = (user?.role as string) || "viewer";

  const [pending, setPending] = useState<number>(pendingProp ?? 0);
  const [hoveredLock, setHoveredLock] = useState<string | null>(null);

  // Fetch pending count nếu trang cha không cung cấp
  useEffect(() => {
    if (pendingProp !== undefined) { setPending(pendingProp); return; }
    apiFetch<unknown>("/api/actions")
      .then(data => {
        const arr = Array.isArray(data) ? data : ((data as any)?.data ?? []);
        setPending(arr.filter((a: any) => a.status === "draft" || a.status === "pending_ehs").length);
      })
      .catch(() => {});
  }, [pendingProp]);

  // Cập nhật badge khi prop thay đổi
  useEffect(() => {
    if (pendingProp !== undefined) setPending(pendingProp);
  }, [pendingProp]);

  const currentPath = location.pathname.replace(/\/+$/, "");

  const canIntel    = INTEL_ROLES.has(role);
  const canApproval = APPROVAL_ROLES.has(role);

  const tabs = [
    {
      key:       "intel",
      href:      "/safety-6s/intel",
      icon:      "🧠",
      label:     "EHS Intel",
      sublabel:  "Tổng quan chiến lược",
      locked:    !canIntel,
      badge:     null as number | null,
      active:    currentPath === "/safety-6s/intel",
      tier:      1, // cấp cao nhất
    },
    {
      key:       "actions",
      href:      "/safety-6s/actions",
      icon:      "📋",
      label:     "CAPA",
      sublabel:  "Danh sách hành động",
      locked:    false,
      badge:     null as number | null,
      active:    currentPath === "/safety-6s/actions",
      tier:      2,
    },
    {
      key:       "approval",
      href:      "/safety-6s/capa-approval",
      icon:      "✅",
      label:     "Phê duyệt",
      sublabel:  "EHS & Admin",
      locked:    !canApproval,
      badge:     (!canApproval ? null : (pending > 0 ? pending : null)),
      active:    currentPath === "/safety-6s/capa-approval",
      tier:      3, // cấp chuyên biệt nhất
    },
  ];

  return (
    <div className="scn-root">

      {/* ── Tabs ── */}
      <div className="scn-tabs" role="tablist">
        {tabs.map((tab, idx) => (
          <div key={tab.key} className="scn-tab-wrap">
            {/* Divider mũi tên giữa các tab */}
            {idx > 0 && <span className="scn-arrow" aria-hidden>›</span>}

            {tab.locked ? (
              /* ── Tab bị khoá ── */
              <div
                className="scn-tab scn-tab--locked"
                role="tab"
                aria-disabled="true"
                onMouseEnter={() => setHoveredLock(tab.key)}
                onMouseLeave={() => setHoveredLock(null)}
              >
                <span className="scn-tab-icon">{tab.icon}</span>
                <span className="scn-tab-body">
                  <span className="scn-tab-label">{tab.label}</span>
                  <span className="scn-tab-sub">{tab.sublabel}</span>
                </span>
                <span className="scn-lock-icon" aria-label="Cần quyền truy cập">🔒</span>

                {/* Tooltip giải thích */}
                {hoveredLock === tab.key && (
                  <div className="scn-lock-tooltip" role="tooltip">
                    <span className="scn-lock-tooltip-icon">🔒</span>
                    <span>{LOCKED_REASON[tab.key]}</span>
                  </div>
                )}
              </div>
            ) : (
              /* ── Tab có thể truy cập ── */
              <button
                className={`scn-tab${tab.active ? " scn-tab--active" : ""}`}
                role="tab"
                aria-selected={tab.active}
                onClick={() => navigate(tab.href)}
              >
                <span className="scn-tab-icon">{tab.icon}</span>
                <span className="scn-tab-body">
                  <span className="scn-tab-label">{tab.label}</span>
                  <span className="scn-tab-sub">{tab.sublabel}</span>
                </span>
                {tab.badge !== null && (
                  <span className="scn-badge">{tab.badge}</span>
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ── Role pill bên phải ── */}
      <div className="scn-meta">
        <span className="scn-role-pill" title={`Vai trò: ${role}`}>
          {ROLE_ICON[role] || "👤"} {ROLE_LABEL[role] || role}
        </span>
      </div>
    </div>
  );
}
