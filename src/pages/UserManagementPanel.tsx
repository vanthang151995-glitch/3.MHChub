import { Edit2, KeyRound, Loader2, Plus, Shield, ShieldCheck, Trash2, User, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Field } from "../components/ui";
import { api, type AdminUserRecord } from "../services/api";

const ROLES = [
  { value: "admin",          label: "Admin — Toàn quyền" },
  { value: "ehs",            label: "EHS — An toàn & Môi trường" },
  { value: "safety_officer", label: "An toàn viên — Tổng hợp & đề xuất CAPA" },
  { value: "leader",         label: "Leader — Trưởng nhóm / QĐ phê duyệt" },
  { value: "viewer",         label: "Viewer — Chỉ xem" }
];

const JOB_TITLES = [
  "Tổng giám đốc",
  "Phó giám đốc",
  "Trưởng khối",
  "Trưởng bộ phận",
  "Phó bộ phận",
  "An toàn viên",
  "Tổ trưởng",
  "Nhân viên",
];

const ROLE_LABEL: Record<string, string> = {
  admin:          "Admin",
  ehs:            "EHS",
  safety_officer: "An toàn viên",
  leader:         "Leader",
  viewer:         "Viewer"
};

const ROLE_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  admin:          { bg: "#fef2f2", color: "#b91c1c", border: "#fca5a5" },
  ehs:            { bg: "#f0fdf4", color: "#15803d", border: "#86efac" },
  safety_officer: { bg: "#fff7ed", color: "#c2410c", border: "#fdba74" },
  leader:         { bg: "#eff6ff", color: "#1d4ed8", border: "#93c5fd" },
  viewer:         { bg: "#f8fafc", color: "#475569", border: "#cbd5e1" },
};

const TITLE_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  "Tổng giám đốc":  { bg: "#fdf4ff", color: "#7e22ce", border: "#d8b4fe" },
  "Phó giám đốc":   { bg: "#fdf4ff", color: "#9333ea", border: "#e9d5ff" },
  "Trưởng khối":    { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  "Trưởng bộ phận": { bg: "#eff6ff", color: "#2563eb", border: "#dbeafe" },
  "Phó bộ phận":    { bg: "#f0f9ff", color: "#0369a1", border: "#bae6fd" },
  "An toàn viên":   { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  "Tổ trưởng":      { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  "Nhân viên":      { bg: "#f8fafc", color: "#475569", border: "#e2e8f0" },
};

const defaultTitleStyle = { bg: "#f8fafc", color: "#475569", border: "#e2e8f0" };

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return "—"; }
};

type DivisionInfo  = { id: string; code: string; name: string; color: string };
type DeptInfo      = { id: string; code: string; name: string; fullName: string; divisionCode: string };
type OrgData       = { divisions: DivisionInfo[]; departments: DeptInfo[] };

type UserFormData = {
  username: string;
  displayName: string;
  password: string;
  role: string;
  departmentId: string;
  jobTitle: string;
  isSafetyOfficer: boolean;
};

const EMPTY_FORM: UserFormData = {
  username: "", displayName: "", password: "",
  role: "viewer", departmentId: "",
  jobTitle: "", isSafetyOfficer: false,
};

type ModalMode  = "create" | "edit" | "reset-password" | null;
type ModalState = { mode: ModalMode; user?: AdminUserRecord; };

function Chip({ label, style }: { label: string; style: { bg: string; color: string; border: string } }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: style.bg, color: style.color, border: `1px solid ${style.border}`,
      whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function DeptPicker({
  org, value, onChange
}: {
  org: OrgData;
  value: string;
  onChange: (deptId: string) => void;
}) {
  const INP: React.CSSProperties = {
    height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid #e2e8f0",
    fontSize: 13, width: "100%", boxSizing: "border-box", background: "#fff",
  };

  const currentDept = org.departments.find(d => d.id === value);
  const currentDivCode = currentDept?.divisionCode ?? "";
  const [selDiv, setSelDiv] = useState(currentDivCode);

  const deptsInDiv = selDiv ? org.departments.filter(d => d.divisionCode === selDiv) : [];

  const handleDivChange = (divCode: string) => {
    setSelDiv(divCode);
    onChange(""); // reset bộ phận khi đổi khối
  };

  const handleDeptChange = (deptId: string) => {
    onChange(deptId);
  };

  const selDivObj = org.divisions.find(d => d.code === selDiv);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Row 1: Chọn Khối */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <select
          style={{ ...INP, flex: 1, color: selDiv ? "#1e293b" : "#94a3b8" }}
          value={selDiv}
          onChange={e => handleDivChange(e.target.value)}
        >
          <option value="">— Chọn khối —</option>
          {org.divisions.map(div => (
            <option key={div.code} value={div.code}>{div.name}</option>
          ))}
        </select>
      </div>

      {/* Row 2: Chọn Bộ phận (chỉ hiện khi đã chọn khối) */}
      {selDiv && (
        <select
          style={{ ...INP, color: value ? "#1e293b" : "#94a3b8" }}
          value={value}
          onChange={e => handleDeptChange(e.target.value)}
        >
          <option value="">— Chọn bộ phận —</option>
          {deptsInDiv.map(dept => (
            <option key={dept.id} value={dept.id}>{dept.code} — {dept.fullName}</option>
          ))}
        </select>
      )}

      {/* Preview: Khối → Bộ phận */}
      {(selDiv || value) && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
          {selDivObj && (
            <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: selDivObj.color + "18", color: selDivObj.color,
              border: `1px solid ${selDivObj.color}44` }}>
              {selDivObj.name}
            </span>
          )}
          {value && currentDept && selDiv === currentDept.divisionCode && (
            <>
              <span style={{ color: "#cbd5e1" }}>›</span>
              <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd" }}>
                {currentDept.code}
              </span>
            </>
          )}
          {!value && selDiv && (
            <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>Chưa chọn bộ phận</span>
          )}
        </div>
      )}

      {/* Nút xóa */}
      {(selDiv || value) && (
        <button type="button"
          onClick={() => { setSelDiv(""); onChange(""); }}
          style={{ alignSelf: "flex-start", fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
          Xóa lựa chọn
        </button>
      )}
    </div>
  );
}

function UserModal({
  state, org, onClose, onDone
}: {
  state: ModalState;
  org: OrgData;
  onClose: () => void;
  onDone: (user: AdminUserRecord) => void;
}) {
  const { mode, user } = state;
  const [form, setForm] = useState<UserFormData>(
    mode === "edit" && user
      ? {
          username: user.username,
          displayName: user.displayName,
          password: "",
          role: user.role,
          departmentId: user.departmentId || "",
          jobTitle: user.jobTitle || "",
          isSafetyOfficer: user.isSafetyOfficer || false,
        }
      : EMPTY_FORM
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [jobTitleOpen, setJobTitleOpen] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTimeout(() => firstRef.current?.focus(), 60); }, []);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (titleRef.current && !titleRef.current.contains(e.target as Node)) setJobTitleOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const set = (key: keyof UserFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "create") {
        const res = await api.createAdminUser(form);
        onDone(res.data);
      } else if (mode === "edit" && user) {
        const res = await api.updateAdminUser(user.id, {
          displayName: form.displayName,
          role: form.role,
          departmentId: form.departmentId || null as any,
          jobTitle: form.jobTitle || null,
          isSafetyOfficer: form.isSafetyOfficer,
        });
        onDone(res.data);
      } else if (mode === "reset-password" && user) {
        await api.resetAdminUserPassword(user.id, form.password);
        onDone(user);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "create"         ? "Tạo tài khoản mới" :
    mode === "edit"           ? `Chỉnh sửa: ${user?.username}` :
                                `Đặt lại mật khẩu: ${user?.username}`;

  const INP: React.CSSProperties = {
    height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid #e2e8f0",
    fontSize: 13, width: "100%", boxSizing: "border-box", background: "#fff",
  };
  const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" };
  const FIELD: React.CSSProperties = { marginBottom: 12 };

  return (
    <div className="user-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="user-modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: 520, width: "100%" }}>
        <div className="user-modal-header">
          <h3>{title}</h3>
          <button className="user-modal-close" onClick={onClose} type="button" aria-label="Đóng"><X size={18} /></button>
        </div>
        <form className="user-modal-body" onSubmit={submit}>
          {mode === "create" && (
            <div style={FIELD}>
              <label style={LBL}>Username *</label>
              <input ref={firstRef} style={INP} value={form.username} onChange={set("username")} placeholder="vd: nguyenvana" autoComplete="off" required />
            </div>
          )}

          {(mode === "create" || mode === "edit") && (<>
            <div style={FIELD}>
              <label style={LBL}>Tên hiển thị</label>
              <input ref={mode === "edit" ? firstRef : undefined} style={INP} value={form.displayName} onChange={set("displayName")} placeholder="vd: Nguyễn Văn A - PE1" autoComplete="off" />
            </div>

            {/* Chức danh */}
            <div style={{ ...FIELD, position: "relative" }} ref={titleRef}>
              <label style={LBL}>Chức danh</label>
              <div style={{ position: "relative" }}>
                <input
                  style={{ ...INP, paddingRight: form.jobTitle ? 30 : 10 }}
                  value={form.jobTitle}
                  onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
                  onFocus={() => setJobTitleOpen(true)}
                  placeholder="Chọn hoặc nhập chức danh..."
                  autoComplete="off"
                />
                {form.jobTitle && (
                  <button type="button" onMouseDown={e => { e.preventDefault(); setForm(f => ({ ...f, jobTitle: "" })); }}
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 13, padding: 0 }}>✕</button>
                )}
                {jobTitleOpen && (
                  <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, background: "#fff", border: "1.5px solid #bae6fd", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,.1)", zIndex: 500, maxHeight: 200, overflowY: "auto" }}>
                    {JOB_TITLES.filter(t => !form.jobTitle || t.toLowerCase().includes(form.jobTitle.toLowerCase())).map(t => (
                      <button key={t} type="button"
                        onMouseDown={e => { e.preventDefault(); setForm(f => ({ ...f, jobTitle: t })); setJobTitleOpen(false); }}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 12px", border: "none", background: form.jobTitle === t ? "#f0f9ff" : "transparent", cursor: "pointer", fontSize: 13, color: "#1e293b" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f0f9ff")}
                        onMouseLeave={e => (e.currentTarget.style.background = form.jobTitle === t ? "#f0f9ff" : "transparent")}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {form.jobTitle && (
                <div style={{ marginTop: 6 }}>
                  <Chip label={form.jobTitle} style={TITLE_COLOR[form.jobTitle] || defaultTitleStyle} />
                </div>
              )}
            </div>

            {/* Toggle An toàn viên */}
            <div style={{ ...FIELD, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: form.isSafetyOfficer ? "#fff7ed" : "#f8fafc", borderRadius: 8, border: `1.5px solid ${form.isSafetyOfficer ? "#fdba74" : "#e2e8f0"}`, cursor: "pointer" }}
              onClick={() => setForm(f => ({ ...f, isSafetyOfficer: !f.isSafetyOfficer }))}>
              <ShieldCheck size={16} color={form.isSafetyOfficer ? "#c2410c" : "#94a3b8"} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: form.isSafetyOfficer ? "#c2410c" : "#475569" }}>🛡️ Là An toàn viên (ATV)</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>Phụ trách an toàn cho bộ phận / khu vực</div>
              </div>
              <div style={{ width: 36, height: 20, borderRadius: 10, background: form.isSafetyOfficer ? "#f97316" : "#e2e8f0", position: "relative", transition: "background .2s" }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: form.isSafetyOfficer ? 18 : 2, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
              </div>
            </div>

            <div style={FIELD}>
              <label style={LBL}>Vai trò hệ thống</label>
              <select style={INP} value={form.role} onChange={set("role")}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            {/* Picker Khối → Bộ phận */}
            <div style={FIELD}>
              <label style={LBL}>Bộ phận</label>
              {org.divisions.length === 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8", padding: "6px 0" }}>Đang tải danh sách...</div>
              ) : (
                <DeptPicker
                  org={org}
                  value={form.departmentId}
                  onChange={deptId => setForm(f => ({ ...f, departmentId: deptId }))}
                />
              )}
            </div>
          </>)}

          {(mode === "create" || mode === "reset-password") && (
            <div style={FIELD}>
              <label style={LBL}>{mode === "create" ? "Mật khẩu *" : "Mật khẩu mới *"}</label>
              <input
                ref={mode === "reset-password" ? firstRef : undefined}
                style={INP} type="password" value={form.password} onChange={set("password")}
                placeholder="Tối thiểu 4 ký tự" autoComplete="new-password" required
              />
            </div>
          )}

          {error ? <p className="user-modal-error">{error}</p> : null}
          <div className="user-modal-actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Hủy</Button>
            <Button type="submit" className="primary-button" disabled={busy}>
              {busy ? <Loader2 size={15} className="spin" /> : null}
              {mode === "create" ? "Tạo tài khoản" : mode === "edit" ? "Lưu thay đổi" : "Đặt lại mật khẩu"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UserManagementPanel({ currentUserId }: { currentUserId?: string }) {
  const [users, setUsers]       = useState<AdminUserRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [modal, setModal]       = useState<ModalState>({ mode: null });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [flashId, setFlashId]   = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [org, setOrg]           = useState<OrgData>({ divisions: [], departments: [] });

  const load = () => {
    setLoading(true); setError("");
    Promise.all([
      api.listAdminUsers(),
      fetch("/api/org/structure", { credentials: "include" }).then(r => r.json()),
    ])
      .then(([usersRes, orgRes]) => {
        setUsers(usersRes.data || []);
        setOrg({
          divisions:   (orgRes.divisions  || []).filter((d: any) => d.active),
          departments: (orgRes.departments|| []).filter((d: any) => d.active),
        });
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Lỗi tải danh sách"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDone = (user: AdminUserRecord) => {
    setUsers((prev) => {
      const idx = prev.findIndex((u) => u.id === user.id);
      if (idx === -1) return [user, ...prev];
      const next = [...prev]; next[idx] = user; return next;
    });
    setFlashId(user.id);
    setTimeout(() => setFlashId(null), 1500);
  };

  const handleDelete = async (user: AdminUserRecord) => {
    if (!window.confirm(`Xóa tài khoản "${user.username}"? Không thể hoàn tác.`)) return;
    setDeletingId(user.id);
    try {
      await api.deleteAdminUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Lỗi xóa tài khoản");
    } finally { setDeletingId(null); }
  };

  const deptMap = Object.fromEntries(org.departments.map(d => [d.id, d]));
  const divMap  = Object.fromEntries(org.divisions.map(d => [d.code, d]));

  const getDeptLabel = (deptId?: string) => {
    if (!deptId) return null;
    const dept = deptMap[deptId];
    if (!dept) return deptId;
    const div = divMap[dept.divisionCode];
    return { deptCode: dept.code, deptFull: dept.fullName, divName: div?.name, divColor: div?.color };
  };

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    const dept = deptMap[u.departmentId || ""];
    return (
      (u.displayName || u.username).toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (u.departmentId || "").toLowerCase().includes(q) ||
      (dept?.code || "").toLowerCase().includes(q) ||
      (dept?.fullName || "").toLowerCase().includes(q) ||
      (u.jobTitle || "").toLowerCase().includes(q)
    );
  });

  return (
    <section className="admin-section" id="admin-users">
      <div className="panel-header">
        <h2>
          <Shield size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Quản lý tài khoản
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Tìm tên, bộ phận, chức danh..."
            style={{ height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12, width: 220 }}
          />
          <Button className="secondary-button small" size="sm" variant="secondary" onClick={() => setModal({ mode: "create" })}>
            <Plus size={15} /> Thêm tài khoản
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="user-mgmt-loading"><Loader2 size={22} className="spin" /><span>Đang tải...</span></div>
      ) : error ? (
        <div className="user-mgmt-error"><p>{error}</p><Button variant="secondary" size="sm" onClick={load}>Thử lại</Button></div>
      ) : (
        <div className="user-mgmt-list">
          {filtered.length === 0 ? (
            <p className="user-mgmt-empty">{users.length === 0 ? "Chưa có tài khoản nào." : "Không tìm thấy tài khoản."}</p>
          ) : (
            filtered.map((user) => {
              const roleStyle  = ROLE_COLOR[user.role] || ROLE_COLOR.viewer;
              const titleStyle = user.jobTitle ? (TITLE_COLOR[user.jobTitle] || defaultTitleStyle) : null;
              const deptInfo   = getDeptLabel(user.departmentId);
              return (
                <Card
                  as="div" key={user.id}
                  className={`user-mgmt-card${flashId === user.id ? " user-mgmt-card--flash" : ""}${user.id === currentUserId ? " user-mgmt-card--self" : ""}`}
                >
                  <div className="user-card-identity">
                    <div className="user-card-avatar">
                      {user.isSafetyOfficer
                        ? <ShieldCheck size={18} color="#c2410c" />
                        : <User size={18} />}
                    </div>
                    <div className="user-card-info">
                      <strong>{user.displayName || user.username}</strong>
                      <code>@{user.username}</code>
                      {user.id === currentUserId ? <em className="user-self-tag">bạn</em> : null}
                    </div>
                    {/* Chips chức danh + vai trò */}
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {titleStyle && user.jobTitle && (
                        <Chip label={user.jobTitle} style={titleStyle} />
                      )}
                      {user.isSafetyOfficer && !user.jobTitle?.includes("An toàn") && (
                        <Chip label="🛡️ ATV" style={{ bg: "#fff7ed", color: "#c2410c", border: "#fdba74" }} />
                      )}
                      <Chip label={ROLE_LABEL[user.role] || user.role} style={roleStyle} />
                    </div>
                  </div>

                  <div className="user-card-meta">
                    {deptInfo && typeof deptInfo === "object" ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {deptInfo.divColor && (
                          <span style={{
                            padding: "1px 6px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                            background: deptInfo.divColor + "18", color: deptInfo.divColor,
                            border: `1px solid ${deptInfo.divColor}44`
                          }}>{deptInfo.divName}</span>
                        )}
                        <span>›</span>
                        <span style={{
                          padding: "1px 6px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                          background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd"
                        }}>{deptInfo.deptCode}</span>
                        <span style={{ color: "#64748b" }}>{deptInfo.deptFull}</span>
                      </span>
                    ) : deptInfo ? (
                      <span>📂 {deptInfo}</span>
                    ) : (
                      <span className="dim">Toàn công ty</span>
                    )}
                    <span>Tạo: {fmtDate(user.createdAt)}</span>
                    <span>Đăng nhập: {fmtDate(user.lastLoginAt)}</span>
                    {user.activeSessionId ? <span className="online-dot">● Online</span> : null}
                  </div>

                  <div className="user-card-actions">
                    <button className="user-card-btn" title="Chỉnh sửa" onClick={() => setModal({ mode: "edit", user })} type="button">
                      <Edit2 size={15} /><span>Sửa</span>
                    </button>
                    <button className="user-card-btn" title="Đặt lại mật khẩu" onClick={() => setModal({ mode: "reset-password", user })} type="button">
                      <KeyRound size={15} /><span>Mật khẩu</span>
                    </button>
                    <button
                      className={`user-card-btn danger${deletingId === user.id ? " loading" : ""}`}
                      title="Xóa tài khoản" disabled={user.id === currentUserId || deletingId === user.id}
                      onClick={() => handleDelete(user)} type="button"
                    >
                      {deletingId === user.id ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                      <span>Xóa</span>
                    </button>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {modal.mode ? (
        <UserModal state={modal} org={org} onClose={() => setModal({ mode: null })} onDone={handleDone} />
      ) : null}
    </section>
  );
}
