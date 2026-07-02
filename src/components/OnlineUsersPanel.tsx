import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

type PresenceUser = {
  username: string | null;
  displayName: string | null;
  role: string | null;
  page: string;
  lastSeen: number;
  secondsAgo: number;
};

function fmtSince(s: number) {
  if (s < 5) return "vừa xong";
  if (s < 60) return `${s}s trước`;
  return `${Math.round(s / 60)}p trước`;
}

function fmtRole(role: string | null) {
  if (!role) return "—";
  const map: Record<string, string> = { admin: "Quản trị", ehs: "EHS", leader: "Trưởng nhóm", viewer: "Nhân viên" };
  return map[role] ?? role;
}

export function OnlineUsersPanel() {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/presence/users", { credentials: "same-origin" });
      if (!res.ok) { setError(true); return; }
      setUsers(await res.json() as PresenceUser[]);
    } catch { setError(true); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Đang online ({users.length})</h3>
        <button
          onClick={load}
          style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}
          title="Làm mới"
        >
          <RefreshCw size={14} /> Làm mới
        </button>
      </div>

      {loading ? (
        <p style={{ color: "#94a3b8", fontSize: 13 }}>Đang tải...</p>
      ) : error ? (
        <p style={{ color: "#ef4444", fontSize: 13 }}>Không thể tải dữ liệu.</p>
      ) : users.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: 13 }}>Chưa có ai online.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>Người dùng</th>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>Vai trò</th>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>Đang xem</th>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>Hoạt động</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "7px 10px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                      {u.displayName || u.username || "Khách"}
                    </span>
                  </td>
                  <td style={{ padding: "7px 10px", color: "#475569" }}>{fmtRole(u.role)}</td>
                  <td style={{ padding: "7px 10px", color: "#475569", fontFamily: "monospace", fontSize: 12 }}>{u.page}</td>
                  <td style={{ padding: "7px 10px", color: "#94a3b8" }}>{fmtSince(u.secondsAgo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
