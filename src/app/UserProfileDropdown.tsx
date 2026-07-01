import { Check, Eye, EyeOff, KeyRound, LogOut, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AuthUser } from "../services/api";
import { api } from "../services/api";
import type { HubTranslate } from "../i18n-context";
import "./UserProfileDropdown.css";

type Props = {
  isOpen: boolean;
  logout: () => void;
  onClose: () => void;
  onDisplayNameChange: (name: string) => void;
  t: HubTranslate;
  user: AuthUser | null;
  userName: string;
};

type FormStatus = { kind: "idle" | "saving" | "ok" | "err"; msg: string };

const IDLE: FormStatus = { kind: "idle", msg: "" };

const ROLE_LABEL: Record<string, string> = {
  admin: "Quản trị viên",
  ehs: "EHS",
  leader: "Trưởng nhóm",
  viewer: "Người xem"
};

export function UserProfileDropdown({ isOpen, logout, onClose, onDisplayNameChange, t, user, userName }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const [displayName, setDisplayName] = useState(userName);
  const [nameStatus, setNameStatus] = useState<FormStatus>(IDLE);

  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwdStatus, setPwdStatus] = useState<FormStatus>(IDLE);

  useEffect(() => {
    if (isOpen) {
      setDisplayName(userName);
      setNameStatus(IDLE);
      setPwdStatus(IDLE);
      setCurPwd(""); setNewPwd(""); setConfirmPwd("");
    }
  }, [isOpen, userName]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onClose]);

  const handleSaveName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) { setNameStatus({ kind: "err", msg: "Tên không được để trống" }); return; }
    if (trimmed === userName) { setNameStatus({ kind: "ok", msg: "Không có thay đổi" }); return; }
    setNameStatus({ kind: "saving", msg: "" });
    try {
      const res = await api.updateProfile(trimmed);
      if (res.data?.user?.displayName) {
        onDisplayNameChange(res.data.user.displayName);
        setNameStatus({ kind: "ok", msg: "Đã cập nhật tên hiển thị" });
      } else {
        setNameStatus({ kind: "err", msg: (res as { message?: string }).message || "Lỗi cập nhật" });
      }
    } catch {
      setNameStatus({ kind: "err", msg: "Không thể kết nối máy chủ" });
    }
  };

  const handleChangePassword = async () => {
    if (!curPwd || !newPwd || !confirmPwd) {
      setPwdStatus({ kind: "err", msg: "Vui lòng nhập đầy đủ thông tin" }); return;
    }
    if (newPwd !== confirmPwd) {
      setPwdStatus({ kind: "err", msg: "Mật khẩu xác nhận không khớp" }); return;
    }
    if (newPwd.length < 6) {
      setPwdStatus({ kind: "err", msg: "Mật khẩu mới phải có ít nhất 6 ký tự" }); return;
    }
    setPwdStatus({ kind: "saving", msg: "" });
    try {
      const res = await api.changePassword(curPwd, newPwd);
      if (res.data?.ok) {
        setPwdStatus({ kind: "ok", msg: "Đổi mật khẩu thành công" });
        setCurPwd(""); setNewPwd(""); setConfirmPwd("");
      } else {
        setPwdStatus({ kind: "err", msg: (res as { message?: string }).message || "Lỗi đổi mật khẩu" });
      }
    } catch {
      setPwdStatus({ kind: "err", msg: "Không thể kết nối máy chủ" });
    }
  };

  if (!isOpen) return null;

  const initials = userName.charAt(0).toUpperCase();

  return (
    <div className="user-profile-dropdown" ref={ref} role="dialog" aria-label="Thông tin tài khoản">
      <button className="profile-dropdown-close" onClick={onClose} type="button" aria-label="Đóng">
        <X size={14} />
      </button>

      {/* Header: avatar + identity */}
      <div className="profile-dropdown-header">
        <span className="profile-dropdown-avatar">{initials}</span>
        <div className="profile-dropdown-identity">
          <strong>{userName}</strong>
          <small>{ROLE_LABEL[user?.role ?? ""] ?? user?.role ?? ""}</small>
          {user?.username && <code>@{user.username}</code>}
        </div>
      </div>

      <div className="profile-dropdown-divider" />

      {/* Section 1: Display name */}
      <div className="profile-dropdown-section">
        <div className="profile-section-title">
          <Pencil size={13} />
          <span>Tên hiển thị</span>
        </div>
        <div className="profile-field-row">
          <input
            className="profile-input"
            maxLength={80}
            onChange={(e) => { setDisplayName(e.target.value); setNameStatus(IDLE); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); }}
            placeholder="Nhập tên hiển thị..."
            type="text"
            value={displayName}
          />
          <button
            className={`profile-save-btn${nameStatus.kind === "saving" ? " saving" : ""}`}
            disabled={nameStatus.kind === "saving"}
            onClick={handleSaveName}
            type="button"
          >
            {nameStatus.kind === "saving" ? (
              <span className="profile-spinner" />
            ) : nameStatus.kind === "ok" ? (
              <Check size={14} />
            ) : (
              "Lưu"
            )}
          </button>
        </div>
        {nameStatus.msg && (
          <p className={`profile-feedback ${nameStatus.kind}`}>{nameStatus.msg}</p>
        )}
      </div>

      <div className="profile-dropdown-divider" />

      {/* Section 2: Change password */}
      <div className="profile-dropdown-section">
        <div className="profile-section-title">
          <KeyRound size={13} />
          <span>Đổi mật khẩu</span>
        </div>

        <div className="profile-pwd-field">
          <input
            className="profile-input"
            onChange={(e) => { setCurPwd(e.target.value); setPwdStatus(IDLE); }}
            placeholder="Mật khẩu hiện tại"
            type={showCur ? "text" : "password"}
            value={curPwd}
          />
          <button className="profile-eye-btn" onClick={() => setShowCur((v) => !v)} tabIndex={-1} type="button">
            {showCur ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        <div className="profile-pwd-field">
          <input
            className="profile-input"
            onChange={(e) => { setNewPwd(e.target.value); setPwdStatus(IDLE); }}
            placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
            type={showNew ? "text" : "password"}
            value={newPwd}
          />
          <button className="profile-eye-btn" onClick={() => setShowNew((v) => !v)} tabIndex={-1} type="button">
            {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        <input
          className="profile-input"
          onChange={(e) => { setConfirmPwd(e.target.value); setPwdStatus(IDLE); }}
          onKeyDown={(e) => { if (e.key === "Enter") handleChangePassword(); }}
          placeholder="Xác nhận mật khẩu mới"
          type="password"
          value={confirmPwd}
        />

        <button
          className={`profile-save-btn full${pwdStatus.kind === "saving" ? " saving" : ""}`}
          disabled={pwdStatus.kind === "saving"}
          onClick={handleChangePassword}
          type="button"
        >
          {pwdStatus.kind === "saving" ? (
            <><span className="profile-spinner" /> Đang xử lý…</>
          ) : pwdStatus.kind === "ok" ? (
            <><Check size={14} /> Thành công</>
          ) : (
            "Đổi mật khẩu"
          )}
        </button>

        {pwdStatus.msg && (
          <p className={`profile-feedback ${pwdStatus.kind}`}>{pwdStatus.msg}</p>
        )}
      </div>

      <div className="profile-dropdown-divider" />

      {/* Logout */}
      <button
        className="profile-logout-btn"
        onClick={logout}
        type="button"
      >
        <LogOut size={14} />
        <span>Đăng xuất</span>
      </button>
    </div>
  );
}
