import { Edit2, KeyRound, Loader2, Plus, Shield, Trash2, User, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Field } from "../components/ui";
import { api, type AdminUserRecord } from "../services/api";

const ROLES = [
  { value: "admin", label: "Admin — Toàn quyền" },
  { value: "ehs", label: "EHS — An toàn & Môi trường" },
  { value: "leader", label: "Leader — Trưởng nhóm" },
  { value: "viewer", label: "Viewer — Chỉ xem" }
];

const ROLE_BADGE: Record<string, string> = {
  admin: "alert",
  ehs: "good",
  leader: "watch",
  viewer: "info"
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  ehs: "EHS",
  leader: "Leader",
  viewer: "Viewer"
};

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "—";
  }
};

type UserFormData = {
  username: string;
  displayName: string;
  password: string;
  role: string;
  departmentId: string;
};

const EMPTY_FORM: UserFormData = { username: "", displayName: "", password: "", role: "viewer", departmentId: "" };

type ModalMode = "create" | "edit" | "reset-password" | null;

type ModalState = {
  mode: ModalMode;
  user?: AdminUserRecord;
};

function UserModal({
  state,
  onClose,
  onDone
}: {
  state: ModalState;
  onClose: () => void;
  onDone: (user: AdminUserRecord) => void;
}) {
  const { mode, user } = state;
  const [form, setForm] = useState<UserFormData>(
    mode === "edit" && user
      ? { username: user.username, displayName: user.displayName, password: "", role: user.role, departmentId: user.departmentId || "" }
      : EMPTY_FORM
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => firstRef.current?.focus(), 60);
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
          departmentId: form.departmentId
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
    mode === "create" ? "Tạo tài khoản mới" :
    mode === "edit" ? `Chỉnh sửa: ${user?.username}` :
    `Đặt lại mật khẩu: ${user?.username}`;

  return (
    <div className="user-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="user-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="user-modal-header">
          <h3>{title}</h3>
          <button className="user-modal-close" onClick={onClose} type="button" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        <form className="user-modal-body" onSubmit={submit}>
          {mode === "create" && (
            <Field label="Username *">
              <input
                ref={firstRef}
                value={form.username}
                onChange={set("username")}
                placeholder="vd: nguyenvana"
                autoComplete="off"
                required
              />
            </Field>
          )}
          {(mode === "create" || mode === "edit") && (
            <>
              <Field label="Tên hiển thị">
                <input
                  ref={mode === "edit" ? firstRef : undefined}
                  value={form.displayName}
                  onChange={set("displayName")}
                  placeholder="vd: Nguyễn Văn A - PE1"
                  autoComplete="off"
                />
              </Field>
              <Field label="Vai trò">
                <select value={form.role} onChange={set("role")}>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Phòng ban (mã)">
                <input
                  value={form.departmentId}
                  onChange={set("departmentId")}
                  placeholder="vd: PE1, EHS, HR (để trống = toàn công ty)"
                  autoComplete="off"
                />
              </Field>
            </>
          )}
          {(mode === "create" || mode === "reset-password") && (
            <Field label={mode === "create" ? "Mật khẩu *" : "Mật khẩu mới *"}>
              <input
                ref={mode === "reset-password" ? firstRef : undefined}
                type="password"
                value={form.password}
                onChange={set("password")}
                placeholder="Tối thiểu 4 ký tự"
                autoComplete="new-password"
                required
              />
            </Field>
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
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ModalState>({ mode: null });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError("");
    api.listAdminUsers()
      .then((res) => setUsers(res.data || []))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Lỗi tải danh sách"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDone = (user: AdminUserRecord) => {
    setUsers((prev) => {
      const idx = prev.findIndex((u) => u.id === user.id);
      if (idx === -1) return [user, ...prev];
      const next = [...prev];
      next[idx] = user;
      return next;
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
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="admin-section" id="admin-users">
      <div className="panel-header">
        <h2>
          <Shield size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Quản lý tài khoản
        </h2>
        <Button
          className="secondary-button small"
          size="sm"
          variant="secondary"
          onClick={() => setModal({ mode: "create" })}
        >
          <Plus size={15} />
          Thêm tài khoản
        </Button>
      </div>

      {loading ? (
        <div className="user-mgmt-loading">
          <Loader2 size={22} className="spin" />
          <span>Đang tải...</span>
        </div>
      ) : error ? (
        <div className="user-mgmt-error">
          <p>{error}</p>
          <Button variant="secondary" size="sm" onClick={load}>Thử lại</Button>
        </div>
      ) : (
        <div className="user-mgmt-list">
          {users.length === 0 ? (
            <p className="user-mgmt-empty">Chưa có tài khoản nào.</p>
          ) : (
            users.map((user) => (
              <Card
                as="div"
                key={user.id}
                className={`user-mgmt-card${flashId === user.id ? " user-mgmt-card--flash" : ""}${user.id === currentUserId ? " user-mgmt-card--self" : ""}`}
              >
                <div className="user-card-identity">
                  <div className="user-card-avatar">
                    <User size={18} />
                  </div>
                  <div className="user-card-info">
                    <strong>{user.displayName || user.username}</strong>
                    <code>@{user.username}</code>
                    {user.id === currentUserId ? <em className="user-self-tag">bạn</em> : null}
                  </div>
                  <span className={`system-pill user-role-badge role-${user.role}`}>
                    {ROLE_LABEL[user.role] || user.role}
                  </span>
                </div>
                <div className="user-card-meta">
                  {user.departmentId ? <span>📂 {user.departmentId}</span> : <span className="dim">Toàn công ty</span>}
                  <span>Tạo: {fmtDate(user.createdAt)}</span>
                  <span>Đăng nhập: {fmtDate(user.lastLoginAt)}</span>
                  {user.activeSessionId ? <span className="online-dot">● Online</span> : null}
                </div>
                <div className="user-card-actions">
                  <button
                    className="user-card-btn"
                    title="Chỉnh sửa"
                    onClick={() => setModal({ mode: "edit", user })}
                    type="button"
                  >
                    <Edit2 size={15} />
                    <span>Sửa</span>
                  </button>
                  <button
                    className="user-card-btn"
                    title="Đặt lại mật khẩu"
                    onClick={() => setModal({ mode: "reset-password", user })}
                    type="button"
                  >
                    <KeyRound size={15} />
                    <span>Mật khẩu</span>
                  </button>
                  <button
                    className={`user-card-btn danger${deletingId === user.id ? " loading" : ""}`}
                    title="Xóa tài khoản"
                    disabled={user.id === currentUserId || deletingId === user.id}
                    onClick={() => handleDelete(user)}
                    type="button"
                  >
                    {deletingId === user.id ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                    <span>Xóa</span>
                  </button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {modal.mode ? (
        <UserModal
          state={modal}
          onClose={() => setModal({ mode: null })}
          onDone={handleDone}
        />
      ) : null}
    </section>
  );
}
