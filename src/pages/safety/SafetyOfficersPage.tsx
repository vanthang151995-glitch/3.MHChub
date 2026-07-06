import { BookUser, Search, Shield, ShieldCheck, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./safety-api";
import { ErrorPanel, LoadingPanel } from "./safety-shared";
import "./safety-officers.css";

// ─── Types ───────────────────────────────────────────────────────────────────

type OfficerItem = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  jobTitle: string | null;
  isSafetyOfficer: boolean;
  departmentId: string | null;
  departmentName: string | null;
  divisionCode: string | null;
  divisionName: string | null;
  divisionColor: string | null;
};

type OrgStructure = {
  divisions: Array<{ code: string; name: string; color?: string }>;
  departments: Array<{ id: string; name: string; divisionCode?: string }>;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const DIVISION_COLORS: Record<string, string> = {
  PED: "#2563eb",
  QAD: "#7c3aed",
  SAD: "#0891b2",
  MAD: "#d97706",
  EHD: "#16a34a"
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  ehs: "EHS",
  leader: "Lãnh đạo",
  safety_officer: "An toàn viên",
  dept: "Bộ phận",
  manager: "Quản lý",
  viewer: "Xem",
  user: "Người dùng"
};

const ROLE_BADGE_CLASS: Record<string, string> = {
  admin: "admin",
  ehs: "ehs",
  leader: "leader",
  safety_officer: "atv"
};

function avatarColor(name: string): string {
  const colors = [
    "#1565c0", "#1976d2", "#0288d1", "#0097a7",
    "#00796b", "#388e3c", "#7b1fa2", "#c62828",
    "#d84315", "#5d4037"
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function OfficerCard({ officer }: { officer: OfficerItem }) {
  const bgColor = avatarColor(officer.displayName);
  const roleClass = ROLE_BADGE_CLASS[officer.role] || "atv";
  const roleLbl = ROLE_LABEL[officer.role] || officer.role;
  const divColor = officer.divisionColor || DIVISION_COLORS[officer.divisionCode || ""] || "#64748b";

  return (
    <div className="so-card">
      <div className="so-card-top">
        <div className="so-avatar" style={{ background: bgColor }}>
          {initials(officer.displayName)}
        </div>
        <div className="so-card-info">
          <div className="so-card-name" title={officer.displayName}>{officer.displayName}</div>
          <div className="so-card-username">@{officer.username}</div>
        </div>
      </div>

      <div className="so-card-badges">
        {officer.isSafetyOfficer && (
          <span className="so-badge atv">
            <ShieldCheck size={10} />
            An toàn viên
          </span>
        )}
        <span className={`so-badge ${roleClass}`}>
          {roleLbl}
        </span>
      </div>

      {(officer.departmentName || officer.departmentId) && (
        <div className="so-card-dept">
          <span className="so-dept-dot" style={{ background: divColor }} />
          <span>
            {officer.departmentName || officer.departmentId}
            {officer.divisionName ? <span style={{ color: "#94a3b8" }}> · {officer.divisionName}</span> : null}
          </span>
        </div>
      )}

      {officer.jobTitle && (
        <div className="so-card-title">
          <User size={11} />
          {officer.jobTitle}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function SafetyOfficersPage() {
  const [officers, setOfficers] = useState<OfficerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState("");
  const [filterDiv, setFilterDiv] = useState("all");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch<{ data: OfficerItem[] }>("/api/safety/officers"),
      apiFetch<OrgStructure>("/api/org/structure").catch(() => ({ divisions: [], departments: [] }))
    ])
      .then(([res]) => {
        setOfficers(res.data || []);
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, []);

  const divisions = useMemo(() => {
    const map = new Map<string, { code: string; name: string; color: string }>();
    for (const o of officers) {
      if (o.divisionCode && !map.has(o.divisionCode)) {
        map.set(o.divisionCode, {
          code: o.divisionCode,
          name: o.divisionName || o.divisionCode,
          color: o.divisionColor || DIVISION_COLORS[o.divisionCode] || "#64748b"
        });
      }
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [officers]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return officers.filter((o) => {
      if (filterDiv !== "all" && o.divisionCode !== filterDiv) return false;
      if (!q) return true;
      return (
        o.displayName.toLowerCase().includes(q) ||
        o.username.toLowerCase().includes(q) ||
        (o.jobTitle || "").toLowerCase().includes(q) ||
        (o.departmentName || "").toLowerCase().includes(q) ||
        (o.divisionName || "").toLowerCase().includes(q)
      );
    });
  }, [officers, search, filterDiv]);

  const grouped = useMemo(() => {
    const groups = new Map<string, OfficerItem[]>();
    const noDivision: OfficerItem[] = [];

    for (const o of filtered) {
      if (o.divisionCode) {
        const existing = groups.get(o.divisionCode) || [];
        existing.push(o);
        groups.set(o.divisionCode, existing);
      } else {
        noDivision.push(o);
      }
    }

    return { groups, noDivision };
  }, [filtered]);

  const ehsCount = officers.filter((o) => o.role === "ehs").length;

  if (loading) return <LoadingPanel label="Đang tải danh sách an toàn viên..." />;
  if (error) return <ErrorPanel error={error} />;

  return (
    <div className="so-page">
      <div className="so-header">
        <h2 className="so-title">
          <span className="so-title-icon">
            <BookUser size={18} />
          </span>
          Danh bạ An toàn viên
        </h2>
        <p className="so-subtitle">
          Danh sách cán bộ an toàn theo khối/bộ phận — dùng làm danh bạ liên lạc nội bộ.
        </p>

        <div className="so-toolbar">
          <div className="so-search-wrap">
            <Search size={14} className="so-search-icon" />
            <input
              className="so-search"
              placeholder="Tìm theo tên, bộ phận..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="so-filter-select"
            value={filterDiv}
            onChange={(e) => setFilterDiv(e.target.value)}
          >
            <option value="all">Tất cả khối</option>
            {divisions.map((d) => (
              <option key={d.code} value={d.code}>{d.name} ({d.code})</option>
            ))}
            {officers.some((o) => !o.divisionCode) && (
              <option value="__none__">Chưa phân khối</option>
            )}
          </select>
        </div>
      </div>

      <div className="so-stats-bar">
        <span className="so-stat-pill total">
          <Shield size={12} />
          {officers.length} An toàn viên
        </span>
        {ehsCount > 0 && (
          <span className="so-stat-pill ehs">
            <ShieldCheck size={12} />
            {ehsCount} EHS Officer
          </span>
        )}
        {divisions.map((d) => {
          const cnt = officers.filter((o) => o.divisionCode === d.code).length;
          return cnt > 0 ? (
            <span key={d.code} className="so-stat-pill" style={{
              background: `${d.color}14`,
              color: d.color,
              borderColor: `${d.color}40`
            }}>
              {d.name}: {cnt}
            </span>
          ) : null;
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="so-empty">
          <div className="so-empty-icon">🔍</div>
          <div>Không tìm thấy an toàn viên nào phù hợp</div>
        </div>
      ) : (
        <>
          {filterDiv === "__none__" ? (
            <>
              {grouped.noDivision.length > 0 && (
                <div className="so-division">
                  <div className="so-nodiv-label">Chưa phân khối</div>
                  <div className="so-cards">
                    {grouped.noDivision.map((o) => <OfficerCard key={o.id} officer={o} />)}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {divisions
                .filter((d) => filterDiv === "all" || d.code === filterDiv)
                .map((div) => {
                  const items = grouped.groups.get(div.code) || [];
                  if (items.length === 0) return null;
                  return (
                    <div className="so-division" key={div.code}>
                      <div className="so-division-header">
                        <span className="so-division-color" style={{ background: div.color }} />
                        <span className="so-division-name">{div.name}</span>
                        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{div.code}</span>
                        <span className="so-division-count">{items.length} người</span>
                      </div>
                      <div className="so-cards">
                        {items.map((o) => <OfficerCard key={o.id} officer={o} />)}
                      </div>
                    </div>
                  );
                })}

              {(filterDiv === "all" || filterDiv === "__none__") && grouped.noDivision.length > 0 && (
                <div className="so-division">
                  <div className="so-nodiv-label">Chưa phân khối</div>
                  <div className="so-cards">
                    {grouped.noDivision.map((o) => <OfficerCard key={o.id} officer={o} />)}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default SafetyOfficersPage;
