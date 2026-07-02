import { useEffect, useState } from "react";
import { RefreshCw, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";

type AuditEntry = {
  id: string;
  createdAt: string;
  username: string;
  eventType: string;
  success: boolean;
  reason?: string;
  ip?: string;
};

const EVENT_LABELS: Record<string, string> = {
  login_success: "Đăng nhập thành công",
  login_failed: "Đăng nhập thất bại",
  login_rate_limited: "Bị chặn (quá nhiều lần thử)",
  logout: "Đăng xuất",
};

function EventIcon({ type, success }: { type: string; success: boolean }) {
  if (type === "logout") return <ShieldOff size={14} color="#94a3b8" />;
  if (success) return <ShieldCheck size={14} color="#22c55e" />;
  return <ShieldAlert size={14} color="#ef4444" />;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
  } catch { return iso; }
}

export function AuthAuditPanel() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/auth-audit", { credentials: "same-origin" });
      if (!res.ok) { setError(true); return; }
      setLogs(await res.json() as AuditEntry[]);
    } catch { setError(true); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  const pageItems = logs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <ShieldAlert size={16} color="#f59e0b" />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Lịch sử đăng nhập ({logs.length})</h3>
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
      ) : logs.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: 13 }}>Chưa có lịch sử đăng nhập.</p>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>Thời gian</th>
                  <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>Tài khoản</th>
                  <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>Sự kiện</th>
                  <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>IP</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((e) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "7px 10px", color: "#64748b", whiteSpace: "nowrap" }}>{fmtDate(e.createdAt)}</td>
                    <td style={{ padding: "7px 10px", fontWeight: 500 }}>{e.username}</td>
                    <td style={{ padding: "7px 10px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <EventIcon type={e.eventType} success={e.success} />
                        {EVENT_LABELS[e.eventType] ?? e.eventType}
                      </span>
                    </td>
                    <td style={{ padding: "7px 10px", color: "#94a3b8", fontFamily: "monospace", fontSize: 12 }}>{e.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: "flex", gap: 6, marginTop: 10, justifyContent: "flex-end" }}>
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} style={{ padding: "3px 10px", borderRadius: 5, border: "1px solid #cbd5e1", cursor: page === 1 ? "default" : "pointer", background: "#fff" }}>←</button>
              <span style={{ fontSize: 13, color: "#64748b", padding: "3px 6px" }}>{page}/{totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} style={{ padding: "3px 10px", borderRadius: 5, border: "1px solid #cbd5e1", cursor: page === totalPages ? "default" : "pointer", background: "#fff" }}>→</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
