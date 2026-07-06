import React, { useState, useEffect, useCallback, useMemo } from "react";

/* ── types ── */
interface Factory { id: string; code: string; name: string; description: string; address: string; sortOrder: number; active: boolean; }
interface Division { id: string; code: string; name: string; description: string; color: string; factoryCodes: string[]; sortOrder: number; active: boolean; }
interface Department { id: string; code: string; name: string; fullName: string; divisionCode: string; factoryCodes: string[]; managerName: string; headcount: number; safetyTarget: number; active: boolean; }

/* ── helpers ── */
const api = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error || res.statusText); }
  return res.json();
};

const PALETTE = ["#1565c0","#9c27b0","#00a99d","#22a050","#f4511e","#d97706","#0891b2","#7c3aed","#be185d","#064e3b"];

const s: Record<string, React.CSSProperties> = {
  page:     { padding: "0 0 48px" },
  head:     { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap" as const, gap:10 },
  title:    { fontSize:18, fontWeight:900, color:"#0f172a", margin:0 },
  sub:      { fontSize:12, color:"#64748b", marginTop:2 },
  tabs:     { display:"flex", gap:4, borderBottom:"2px solid #e2e8f0", marginBottom:20 },
  tab:      { padding:"8px 18px", fontSize:13, fontWeight:700, border:"none", background:"transparent", cursor:"pointer", color:"#64748b", borderBottom:"2px solid transparent", marginBottom:-2 },
  tabAct:   { color:"#1565c0", borderBottomColor:"#1565c0" },
  btn:      { height:34, padding:"0 14px", borderRadius:8, border:"none", cursor:"pointer", fontSize:12, fontWeight:700, display:"inline-flex", alignItems:"center", gap:5 },
  btnPri:   { background:"#1565c0", color:"#fff" },
  btnDanger:{ background:"#dc2626", color:"#fff" },
  btnGhost: { background:"#f1f5f9", color:"#0f172a", border:"1px solid #e2e8f0" },
  card:     { background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,.04)" },
  cardH:    { padding:"12px 16px", borderBottom:"1px solid #e2e8f0", display:"flex", alignItems:"center", justifyContent:"space-between", background:"#f8fafc" },
  cardBody: { padding:"16px" },
  grid3:    { display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:14 },
  input:    { height:34, padding:"0 10px", borderRadius:8, border:"1px solid #e2e8f0", fontSize:13, width:"100%", boxSizing:"border-box" as const, background:"#fff" },
  textarea: { padding:"8px 10px", borderRadius:8, border:"1px solid #e2e8f0", fontSize:12, width:"100%", boxSizing:"border-box" as const, minHeight:56, resize:"vertical" as const, background:"#fff" },
  label:    { fontSize:11, fontWeight:700, color:"#64748b", marginBottom:4, display:"block" },
  row:      { display:"flex", gap:10, marginBottom:10 },
  col:      { flex:1, display:"flex", flexDirection:"column" as const },
  badge:    { display:"inline-block", padding:"1px 8px", borderRadius:20, fontSize:10, fontWeight:700, border:"1px solid" },
  table:    { width:"100%", borderCollapse:"collapse" as const, fontSize:12 },
  th:       { padding:"8px 10px", textAlign:"left" as const, fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"1px solid #e2e8f0", whiteSpace:"nowrap" as const },
  td:       { padding:"8px 10px", borderBottom:"1px solid #f1f5f9", verticalAlign:"middle" as const },
  toast:    { position:"fixed" as const, bottom:24, right:24, zIndex:9999, background:"#0f172a", color:"#fff", borderRadius:10, padding:"10px 18px", fontSize:13, fontWeight:600, boxShadow:"0 4px 20px rgba(0,0,0,.25)" },
  overlay:  { position:"fixed" as const, inset:0, background:"rgba(0,0,0,.4)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" },
  modal:    { background:"#fff", borderRadius:14, padding:24, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto" as const },
  modalH:   { fontSize:15, fontWeight:800, color:"#0f172a", marginBottom:16 },
  err:      { background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#dc2626", marginBottom:12 },
};

/* ── Toast ── */
function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, [onDone]);
  return <div style={s.toast}>{msg}</div>;
}

/* ── FactoryScopePicker ── */
function FactoryScopePicker({ factories, selected, onChange }: { factories: Factory[]; selected: string[]; onChange: (v: string[]) => void }) {
  return (
    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
      {factories.map(f => {
        const on = selected.includes(f.code);
        return (
          <label key={f.code} style={{ display:"flex", alignItems:"center", gap:5, cursor:"pointer", userSelect:"none", padding:"4px 10px", borderRadius:8, border:`1.5px solid ${on ? "#1565c0" : "#e2e8f0"}`, background: on ? "#eff6ff" : "#fff", fontSize:12, fontWeight:700, color: on ? "#1565c0" : "#64748b" }}>
            <input type="checkbox" checked={on} onChange={e => { const n = e.target.checked ? [...selected, f.code] : selected.filter(x => x !== f.code); onChange(n); }} style={{ margin:0 }} />
            {f.code} — {f.name}
          </label>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════
   FACTORY TAB
═══════════════════════════ */
function FactoriesTab({ factories, onRefresh, userIsAdmin }: { factories: Factory[]; onRefresh: () => void; userIsAdmin: boolean }) {
  const blank = { code:"", name:"", description:"", address:"", sortOrder:0 };
  const [editing, setEditing] = useState<(typeof blank & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!editing) return;
    setSaving(true); setErr("");
    try {
      if (editing.id) await api("PUT", `/api/admin/org/factories/${editing.id}`, editing);
      else await api("POST", "/api/admin/org/factories", editing);
      setEditing(null); onRefresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const del = async (f: Factory) => {
    if (!confirm(`Xóa nhà máy ${f.name}?`)) return;
    try { await api("DELETE", `/api/admin/org/factories/${f.id}`); onRefresh(); }
    catch (e) { alert((e as Error).message); }
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:13, color:"#64748b" }}>Quản lý nhà máy. Mỗi nhà máy có mã riêng (PY, PY2...).</div>
        {userIsAdmin && <button style={{ ...s.btn, ...s.btnPri }} onClick={() => { setEditing(blank); setErr(""); }}>+ Thêm nhà máy</button>}
      </div>

      <div style={s.grid3}>
        {factories.map(f => (
          <div key={f.id} style={{ ...s.card, borderTop:"4px solid #1565c0" }}>
            <div style={s.cardH}>
              <div>
                <span style={{ fontSize:20, fontWeight:900, color:"#1565c0" }}>{f.code}</span>
                <span style={{ fontSize:12, color:"#64748b", marginLeft:8 }}>Nhà máy</span>
              </div>
              {userIsAdmin && (
                <div style={{ display:"flex", gap:6 }}>
                  <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => { setEditing({ ...f }); setErr(""); }}>Sửa</button>
                  <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => del(f)}>Xóa</button>
                </div>
              )}
            </div>
            <div style={s.cardBody}>
              <div style={{ fontSize:15, fontWeight:800, marginBottom:4 }}>{f.name}</div>
              {f.description && <div style={{ fontSize:12, color:"#64748b", marginBottom:4 }}>{f.description}</div>}
              {f.address && <div style={{ fontSize:11, color:"#94a3b8" }}>📍 {f.address}</div>}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div style={s.modal}>
            <div style={s.modalH}>{editing.id ? "Sửa nhà máy" : "Thêm nhà máy"}</div>
            {err && <div style={s.err}>{err}</div>}
            <div style={s.row}>
              <div style={{ ...s.col, flex:"0 0 100px" }}>
                <label style={s.label}>Mã *</label>
                <input style={s.input} value={editing.code} onChange={e => setEditing(p => p && { ...p, code: e.target.value.toUpperCase() })} placeholder="PY3" disabled={!!editing.id} />
              </div>
              <div style={s.col}>
                <label style={s.label}>Tên *</label>
                <input style={s.input} value={editing.name} onChange={e => setEditing(p => p && { ...p, name: e.target.value })} placeholder="Nhà máy PY3" />
              </div>
            </div>
            <div style={{ marginBottom:10 }}>
              <label style={s.label}>Mô tả</label>
              <textarea style={s.textarea} value={editing.description} onChange={e => setEditing(p => p && { ...p, description: e.target.value })} />
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={s.label}>Địa chỉ / Vị trí</label>
              <input style={s.input} value={editing.address} onChange={e => setEditing(p => p && { ...p, address: e.target.value })} />
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setEditing(null)}>Hủy</button>
              <button style={{ ...s.btn, ...s.btnPri }} onClick={save} disabled={saving}>{saving ? "Đang lưu..." : "Lưu"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════
   DIVISIONS TAB
═══════════════════════════ */
function DivisionsTab({ divisions, factories, onRefresh, userIsAdmin }: { divisions: Division[]; factories: Factory[]; onRefresh: () => void; userIsAdmin: boolean }) {
  type EditState = { id?: string; code: string; name: string; description: string; color: string; factoryCodes: string[]; sortOrder: number };
  const blank: EditState = { code:"", name:"", description:"", color:PALETTE[0], factoryCodes:[], sortOrder:0 };
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!editing) return;
    setSaving(true); setErr("");
    try {
      if (editing.id) await api("PUT", `/api/admin/org/divisions/${editing.id}`, editing);
      else await api("POST", "/api/admin/org/divisions", editing);
      setEditing(null); onRefresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const del = async (d: Division) => {
    if (!confirm(`Xóa khối ${d.name}?`)) return;
    try { await api("DELETE", `/api/admin/org/divisions/${d.id}`); onRefresh(); }
    catch (e) { alert((e as Error).message); }
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:13, color:"#64748b" }}>Phân nhóm các bộ phận vào khối sản xuất. Mỗi khối gắn với 1 hoặc nhiều nhà máy.</div>
        {userIsAdmin && <button style={{ ...s.btn, ...s.btnPri }} onClick={() => { setEditing(blank); setErr(""); }}>+ Thêm khối</button>}
      </div>

      <div style={s.grid3}>
        {divisions.map(d => (
          <div key={d.id} style={{ ...s.card, borderTop:`4px solid ${d.color || "#64748b"}` }}>
            <div style={s.cardH}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ width:12, height:12, borderRadius:"50%", background:d.color||"#64748b", display:"inline-block" }} />
                <span style={{ fontWeight:800, color:"#0f172a" }}>{d.code}</span>
                <span style={{ fontSize:12, color:"#64748b" }}>{d.name}</span>
              </div>
              {userIsAdmin && (
                <div style={{ display:"flex", gap:6 }}>
                  <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => { setEditing({ ...d, id: d.id }); setErr(""); }}>Sửa</button>
                  <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => del(d)}>Xóa</button>
                </div>
              )}
            </div>
            <div style={s.cardBody}>
              <div style={{ fontSize:11, color:"#94a3b8", marginBottom:8 }}>{d.description}</div>
              <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                {(d.factoryCodes || []).length === 0
                  ? <span style={{ fontSize:11, color:"#f97316", fontStyle:"italic" }}>Chưa gán nhà máy</span>
                  : (d.factoryCodes || []).map(fc => (
                    <span key={fc} style={{ ...s.badge, color:"#1565c0", borderColor:"#bfdbfe", background:"#eff6ff" }}>{fc}</span>
                  ))
                }
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div style={s.modal}>
            <div style={s.modalH}>{editing.id ? "Sửa khối" : "Thêm khối"}</div>
            {err && <div style={s.err}>{err}</div>}
            <div style={s.row}>
              <div style={{ ...s.col, flex:"0 0 100px" }}>
                <label style={s.label}>Mã *</label>
                <input style={s.input} value={editing.code} onChange={e => setEditing(p => p && { ...p, code: e.target.value.toUpperCase() })} placeholder="PED" disabled={!!editing.id} />
              </div>
              <div style={s.col}>
                <label style={s.label}>Tên *</label>
                <input style={s.input} value={editing.name} onChange={e => setEditing(p => p && { ...p, name: e.target.value })} placeholder="Khối PED" />
              </div>
            </div>
            <div style={{ marginBottom:10 }}>
              <label style={s.label}>Mô tả / Danh sách bộ phận</label>
              <input style={s.input} value={editing.description} onChange={e => setEditing(p => p && { ...p, description: e.target.value })} placeholder="PE1 · MP · MT · CM · WM" />
            </div>
            <div style={{ marginBottom:10 }}>
              <label style={s.label}>Màu sắc</label>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {PALETTE.map(c => (
                  <button key={c} onClick={() => setEditing(p => p && { ...p, color: c })}
                    style={{ width:24, height:24, borderRadius:6, background:c, border: editing.color===c ? "3px solid #0f172a" : "2px solid transparent", cursor:"pointer" }} />
                ))}
              </div>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={s.label}>Hoạt động ở nhà máy nào? *</label>
              <FactoryScopePicker factories={factories} selected={editing.factoryCodes} onChange={v => setEditing(p => p && { ...p, factoryCodes: v })} />
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setEditing(null)}>Hủy</button>
              <button style={{ ...s.btn, ...s.btnPri }} onClick={save} disabled={saving}>{saving ? "Đang lưu..." : "Lưu"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════
   DEPARTMENTS TAB
═══════════════════════════ */
function DepartmentsTab({ departments, divisions, factories, onRefresh, userIsAdmin }: { departments: Department[]; divisions: Division[]; factories: Factory[]; onRefresh: () => void; userIsAdmin: boolean }) {
  type EditState = { id?: string; code: string; name: string; fullName: string; divisionCode: string; factoryCodes: string[]; managerName: string; headcount: number; safetyTarget: number; active: boolean };
  const blank: EditState = { code:"", name:"", fullName:"", divisionCode: divisions[0]?.code||"", factoryCodes:[], managerName:"", headcount:0, safetyTarget:95, active:true };
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [filterDiv, setFilterDiv] = useState("");
  const [filterFac, setFilterFac] = useState("");

  const filtered = useMemo(() => {
    let list = departments;
    if (search) list = list.filter(d => d.code.includes(search.toUpperCase()) || d.name.toLowerCase().includes(search.toLowerCase()) || d.fullName?.toLowerCase().includes(search.toLowerCase()));
    if (filterDiv) list = list.filter(d => d.divisionCode === filterDiv);
    if (filterFac) list = list.filter(d => (d.factoryCodes||[]).includes(filterFac));
    return list;
  }, [departments, search, filterDiv, filterFac]);

  const save = async () => {
    if (!editing) return;
    setSaving(true); setErr("");
    try {
      if (editing.id) await api("PUT", `/api/admin/org/departments/${editing.id}`, editing);
      else await api("POST", "/api/admin/org/departments", editing);
      setEditing(null); onRefresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const del = async (d: Department) => {
    if (!confirm(`Xóa bộ phận ${d.code}?`)) return;
    try { await api("DELETE", `/api/admin/org/departments/${d.id}`); onRefresh(); }
    catch (e) { alert((e as Error).message); }
  };

  const divMap = new Map(divisions.map(d => [d.code, d]));

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12, alignItems:"center" }}>
        <input style={{ ...s.input, maxWidth:180 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm bộ phận..." />
        <select style={{ ...s.input, maxWidth:160 }} value={filterDiv} onChange={e => setFilterDiv(e.target.value)}>
          <option value="">Tất cả khối</option>
          {divisions.map(d => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
        </select>
        <select style={{ ...s.input, maxWidth:160 }} value={filterFac} onChange={e => setFilterFac(e.target.value)}>
          <option value="">Tất cả NM</option>
          {factories.map(f => <option key={f.code} value={f.code}>{f.code} — {f.name}</option>)}
        </select>
        <span style={{ fontSize:12, color:"#94a3b8" }}>{filtered.length} bộ phận</span>
        {userIsAdmin && <button style={{ ...s.btn, ...s.btnPri, marginLeft:"auto" }} onClick={() => { setEditing(blank); setErr(""); }}>+ Thêm bộ phận</button>}
      </div>

      <div style={{ ...s.card }}>
        <div style={{ overflowX:"auto" }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Mã BP</th>
                <th style={s.th}>Tên đầy đủ</th>
                <th style={s.th}>Khối</th>
                <th style={s.th}>Nhà máy</th>
                <th style={s.th}>Trưởng BP</th>
                <th style={s.th}>Mục tiêu AT</th>
                {userIsAdmin && <th style={s.th}>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const div = divMap.get(d.divisionCode);
                return (
                  <tr key={d.id}>
                    <td style={s.td}>
                      <span style={{ fontWeight:800, fontFamily:"monospace", color: div?.color||"#0f172a" }}>{d.code}</span>
                    </td>
                    <td style={s.td}>
                      <div style={{ fontWeight:600 }}>{d.fullName || d.name}</div>
                    </td>
                    <td style={s.td}>
                      {div ? <span style={{ ...s.badge, color: div.color, borderColor: div.color+"33", background: div.color+"11" }}>{div.code}</span> : <span style={{ color:"#94a3b8" }}>—</span>}
                    </td>
                    <td style={s.td}>
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                        {(d.factoryCodes||[]).length === 0
                          ? <span style={{ color:"#f97316", fontSize:11 }}>Chưa gán</span>
                          : (d.factoryCodes||[]).map(fc => (
                            <span key={fc} style={{ ...s.badge, color:"#2563eb", borderColor:"#bfdbfe", background:"#eff6ff", fontSize:10 }}>{fc}</span>
                          ))
                        }
                      </div>
                    </td>
                    <td style={{ ...s.td, color:"#64748b" }}>{d.managerName || "—"}</td>
                    <td style={s.td}><span style={{ fontWeight:700, color: d.safetyTarget >= 95 ? "#16a34a" : "#f59e0b" }}>{d.safetyTarget}%</span></td>
                    {userIsAdmin && (
                      <td style={s.td}>
                        <div style={{ display:"flex", gap:4 }}>
                          <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => { setEditing({ ...d, id: d.id }); setErr(""); }}>Sửa</button>
                          <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => del(d)}>Xóa</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={userIsAdmin ? 7 : 6} style={{ ...s.td, textAlign:"center", color:"#94a3b8", padding:"32px 0" }}>Không có dữ liệu</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div style={s.modal}>
            <div style={s.modalH}>{editing.id ? `Sửa bộ phận ${editing.code}` : "Thêm bộ phận"}</div>
            {err && <div style={s.err}>{err}</div>}
            <div style={s.row}>
              <div style={{ ...s.col, flex:"0 0 90px" }}>
                <label style={s.label}>Mã *</label>
                <input style={s.input} value={editing.code} onChange={e => setEditing(p => p && { ...p, code: e.target.value.toUpperCase() })} placeholder="PE1" disabled={!!editing.id} />
              </div>
              <div style={s.col}>
                <label style={s.label}>Tên ngắn *</label>
                <input style={s.input} value={editing.name} onChange={e => setEditing(p => p && { ...p, name: e.target.value })} placeholder="PE1" />
              </div>
            </div>
            <div style={{ marginBottom:10 }}>
              <label style={s.label}>Tên đầy đủ</label>
              <input style={s.input} value={editing.fullName} onChange={e => setEditing(p => p && { ...p, fullName: e.target.value })} placeholder="Bộ phận PE1" />
            </div>
            <div style={{ marginBottom:10 }}>
              <label style={s.label}>Khối *</label>
              <select style={s.input} value={editing.divisionCode} onChange={e => setEditing(p => p && { ...p, divisionCode: e.target.value })}>
                {divisions.map(d => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:10 }}>
              <label style={s.label}>Hoạt động ở nhà máy nào? *</label>
              <FactoryScopePicker factories={factories} selected={editing.factoryCodes} onChange={v => setEditing(p => p && { ...p, factoryCodes: v })} />
            </div>
            <div style={s.row}>
              <div style={s.col}>
                <label style={s.label}>Trưởng bộ phận</label>
                <input style={s.input} value={editing.managerName} onChange={e => setEditing(p => p && { ...p, managerName: e.target.value })} />
              </div>
              <div style={{ ...s.col, flex:"0 0 120px" }}>
                <label style={s.label}>Mục tiêu AT (%)</label>
                <input type="number" style={s.input} value={editing.safetyTarget} onChange={e => setEditing(p => p && { ...p, safetyTarget: Number(e.target.value) })} min={0} max={100} />
              </div>
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:6 }}>
              <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setEditing(null)}>Hủy</button>
              <button style={{ ...s.btn, ...s.btnPri }} onClick={save} disabled={saving}>{saving ? "Đang lưu..." : "Lưu"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STRUCTURE TREE VIEW (read-only overview)
═══════════════════════════════════════════════════════════════ */
function TreeView({ factories, divisions, departments }: { factories: Factory[]; divisions: Division[]; departments: Department[] }) {
  const deptByDiv = useMemo(() => {
    const m: Record<string, Department[]> = {};
    for (const d of departments) {
      if (!m[d.divisionCode]) m[d.divisionCode] = [];
      m[d.divisionCode].push(d);
    }
    return m;
  }, [departments]);

  return (
    <div style={s.grid3}>
      {factories.map(f => (
        <div key={f.code} style={{ ...s.card }}>
          <div style={{ ...s.cardH, background: "#0f172a", color:"#fff", borderRadius:"12px 12px 0 0" }}>
            <span style={{ fontWeight:900, fontSize:15 }}>🏭 {f.name} ({f.code})</span>
            <span style={{ fontSize:11, color:"#94a3b8" }}>
              {departments.filter(d => (d.factoryCodes||[]).includes(f.code)).length} bộ phận
            </span>
          </div>
          <div style={{ padding:"12px" }}>
            {divisions.filter(div => (div.factoryCodes||[]).includes(f.code)).map(div => {
              const depts = (deptByDiv[div.code] || []).filter(d => (d.factoryCodes||[]).includes(f.code));
              return (
                <div key={div.code} style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5 }}>
                    <span style={{ width:10, height:10, borderRadius:"50%", background:div.color||"#64748b", display:"inline-block" }} />
                    <span style={{ fontWeight:800, fontSize:12, color: div.color||"#0f172a" }}>{div.code}</span>
                    <span style={{ fontSize:11, color:"#64748b" }}>{div.name}</span>
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4, paddingLeft:16 }}>
                    {depts.map(d => (
                      <span key={d.code} style={{ ...s.badge, color: div.color||"#0f172a", borderColor:(div.color||"#94a3b8")+"33", background:(div.color||"#94a3b8")+"11", fontSize:11 }}>
                        {d.code}
                      </span>
                    ))}
                    {depts.length === 0 && <span style={{ fontSize:10, color:"#94a3b8" }}>Không có bộ phận</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════
   PLACES TAB
═══════════════════════════ */
interface Place { id: string; name: string; description: string; factoryCode: string; sortOrder: number; active: boolean; status?: "active"|"pending"|"rejected"; approvedAt?: string; rejectedAt?: string; createdAt?: string; }

function PlacesTab({ userIsAdmin, factories, onPendingChange }: { userIsAdmin: boolean; factories: Factory[]; onPendingChange?: (n: number) => void }) {
  const blank = { name: "", description: "", factoryCode: "", sortOrder: 0 };
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<(typeof blank & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState<string|null>(null);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [showRejected, setShowRejected] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = userIsAdmin ? "/api/admin/places" : "/api/places";
      const r = await fetch(url, { credentials: "include" });
      if (r.ok) {
        const data: Place[] = await r.json();
        setPlaces(data);
        if (onPendingChange) onPendingChange(data.filter(p => p.status === "pending").length);
      }
    } finally { setLoading(false); }
  }, [userIsAdmin, onPendingChange]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { setErr("Tên địa điểm không được trống"); return; }
    setSaving(true); setErr("");
    try {
      if (editing.id) await api("PUT", `/api/admin/places/${editing.id}`, editing);
      else await api("POST", "/api/admin/places", editing);
      setEditing(null); load();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const approve = async (p: Place) => {
    setApproving(p.id);
    try { await api("POST", `/api/admin/places/${p.id}/approve`, {}); load(); }
    catch (e) { alert((e as Error).message); }
    finally { setApproving(null); }
  };

  const reject = async (p: Place) => {
    if (!confirm(`Từ chối địa điểm "${p.name}"? Địa điểm sẽ không hiện trong form.`)) return;
    setApproving(p.id);
    try { await api("POST", `/api/admin/places/${p.id}/reject`, {}); load(); }
    catch (e) { alert((e as Error).message); }
    finally { setApproving(null); }
  };

  const del = async (p: Place) => {
    if (!confirm(`Ẩn địa điểm "${p.name}"?`)) return;
    try { await api("DELETE", `/api/admin/places/${p.id}`); load(); }
    catch (e) { alert((e as Error).message); }
  };

  const toggle = async (p: Place) => {
    const newStatus = p.status === "active" ? "rejected" : "active";
    try { await api("PUT", `/api/admin/places/${p.id}`, { status: newStatus }); load(); }
    catch (e) { alert((e as Error).message); }
  };

  const pending  = useMemo(() => places.filter(p => p.status === "pending"), [places]);
  const active   = useMemo(() => places.filter(p => p.status === "active" || (!p.status && p.active !== false)), [places]);
  const rejected = useMemo(() => places.filter(p => p.status === "rejected"), [places]);

  const filtered = useMemo(() => {
    const base = showRejected ? [...active, ...rejected] : active;
    return base.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.description||"").toLowerCase().includes(search.toLowerCase()));
  }, [active, rejected, search, showRejected]);

  const factoryLabel = (code: string) => {
    if (!code) return "Chung";
    const f = factories.find(f => f.code === code);
    return f ? `${f.code} — ${f.name}` : code;
  };

  const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString("vi-VN", { day:"2-digit", month:"2-digit", year:"numeric" }) : "—";

  return (
    <div>
      {/* ── Khu chờ duyệt ── */}
      {userIsAdmin && pending.length > 0 && (
        <div style={{ background:"#fffbeb", border:"2px solid #fbbf24", borderRadius:12, padding:"14px 18px", marginBottom:18 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <span style={{ fontSize:18 }}>⏳</span>
            <span style={{ fontWeight:800, fontSize:14, color:"#92400e" }}>Địa điểm chờ phê duyệt</span>
            <span style={{ background:"#f59e0b", color:"#fff", borderRadius:20, padding:"1px 9px", fontSize:12, fontWeight:800 }}>{pending.length}</span>
            <span style={{ fontSize:12, color:"#b45309", marginLeft:4 }}>Người dùng tự thêm qua form — cần admin xem xét</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column" as const, gap:8 }}>
            {pending.map(p => (
              <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, background:"#fff", border:"1px solid #fde68a", borderRadius:9, padding:"10px 14px", flexWrap:"wrap" as const }}>
                <span style={{ fontSize:15 }}>📍</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <span style={{ fontWeight:700, color:"#0f172a", fontSize:13 }}>{p.name}</span>
                  {p.createdAt && <span style={{ fontSize:11, color:"#94a3b8", marginLeft:8 }}>Thêm {fmtDate(p.createdAt)}</span>}
                </div>
                <span style={{ fontSize:12, color:"#64748b", marginRight:4 }}>{factoryLabel(p.factoryCode)}</span>
                <div style={{ display:"flex", gap:6 }}>
                  <button
                    style={{ ...s.btn, background:"#16a34a", color:"#fff", opacity: approving===p.id ? 0.6 : 1 }}
                    disabled={approving === p.id}
                    onClick={() => approve(p)}>
                    {approving===p.id ? "..." : "✓ Duyệt"}
                  </button>
                  <button
                    style={{ ...s.btn, background:"#fee2e2", color:"#dc2626", border:"none", opacity: approving===p.id ? 0.6 : 1 }}
                    disabled={approving === p.id}
                    onClick={() => reject(p)}>
                    ✕ Từ chối
                  </button>
                  <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => { setEditing({ ...p }); setErr(""); }}>Sửa</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, gap:10, flexWrap:"wrap" as const }}>
        <div style={{ fontSize:13, color:"#64748b" }}>
          Danh sách địa điểm dùng trong form báo cáo, CAPA, cảnh báo an toàn.
          {!userIsAdmin && " Địa điểm mới bạn nhập sẽ chờ admin phê duyệt trước khi hiện cho mọi người."}
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" as const }}>
          <input style={{ ...s.input, width:200 }} placeholder="🔍 Tìm địa điểm..." value={search} onChange={e => setSearch(e.target.value)} />
          {userIsAdmin && rejected.length > 0 && (
            <button style={{ ...s.btn, ...s.btnGhost, fontSize:12 }} onClick={() => setShowRejected(v => !v)}>
              {showRejected ? "Ẩn đã từ chối" : `Xem đã từ chối (${rejected.length})`}
            </button>
          )}
          {userIsAdmin && <button style={{ ...s.btn, ...s.btnPri }} onClick={() => { setEditing({ ...blank }); setErr(""); }}>+ Thêm địa điểm</button>}
        </div>
      </div>

      {/* ── Bảng chính ── */}
      {loading ? (
        <div style={{ textAlign:"center", padding:40, color:"#94a3b8" }}>Đang tải...</div>
      ) : (
        <div style={s.card}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Tên địa điểm</th>
                <th style={s.th}>Mô tả</th>
                <th style={s.th}>Nhà máy</th>
                <th style={s.th}>Thứ tự</th>
                {userIsAdmin && <th style={s.th}>Trạng thái</th>}
                {userIsAdmin && <th style={{ ...s.th, textAlign:"right" as const }}>Hành động</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ ...s.td, textAlign:"center", color:"#94a3b8", padding:32 }}>Chưa có địa điểm nào</td></tr>
              )}
              {filtered.map(p => {
                const isRej = p.status === "rejected";
                return (
                  <tr key={p.id} style={{ opacity: isRej ? 0.45 : 1 }}>
                    <td style={s.td}>
                      <span style={{ fontWeight:700, color:"#0f172a" }}>📍 {p.name}</span>
                    </td>
                    <td style={{ ...s.td, color:"#64748b" }}>{p.description || "—"}</td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, color:"#1565c0", borderColor:"#bfdbfe", background:"#eff6ff" }}>
                        {factoryLabel(p.factoryCode)}
                      </span>
                    </td>
                    <td style={{ ...s.td, color:"#94a3b8" }}>{p.sortOrder ?? "—"}</td>
                    {userIsAdmin && (
                      <td style={s.td}>
                        {isRej
                          ? <span style={{ ...s.badge, color:"#9f1239", borderColor:"#fda4af", background:"#fff1f2" }}>Đã từ chối</span>
                          : <span style={{ ...s.badge, color:"#166534", borderColor:"#86efac", background:"#f0fdf4" }}>Hiển thị</span>
                        }
                      </td>
                    )}
                    {userIsAdmin && (
                      <td style={{ ...s.td, textAlign:"right" as const }}>
                        <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
                          <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => { setEditing({ ...p }); setErr(""); }}>Sửa</button>
                          <button style={{ ...s.btn, background: isRej ? "#f0fdf4" : "#fef3c7", color: isRej ? "#166534" : "#92400e", border:"none" }} onClick={() => toggle(p)}>
                            {isRej ? "Khôi phục" : "Ẩn"}
                          </button>
                          <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => del(p)}>Xóa</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!userIsAdmin && (
            <div style={{ padding:"10px 16px", borderTop:"1px solid #f1f5f9", fontSize:12, color:"#94a3b8" }}>
              Hiển thị {filtered.length} địa điểm đã được duyệt
            </div>
          )}
        </div>
      )}

      {/* ── Modal sửa/thêm ── */}
      {editing && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div style={s.modal}>
            <div style={s.modalH}>{editing.id ? "Sửa địa điểm" : "Thêm địa điểm"}</div>
            {err && <div style={s.err}>{err}</div>}
            <div style={{ marginBottom:10 }}>
              <label style={s.label}>Tên địa điểm *</label>
              <input style={s.input} value={editing.name} onChange={e => setEditing(p => p && { ...p, name: e.target.value })} placeholder="VD: Khu vực A, Xưởng 3, Văn phòng..." autoFocus />
            </div>
            <div style={{ marginBottom:10 }}>
              <label style={s.label}>Mô tả</label>
              <textarea style={s.textarea} value={editing.description} onChange={e => setEditing(p => p && { ...p, description: e.target.value })} placeholder="Mô tả ngắn về địa điểm..." />
            </div>
            <div style={s.row}>
              <div style={s.col}>
                <label style={s.label}>Thuộc nhà máy</label>
                <select style={s.input} value={editing.factoryCode} onChange={e => setEditing(p => p && { ...p, factoryCode: e.target.value })}>
                  <option value="">Chung (cả 2 nhà máy)</option>
                  {factories.map(f => <option key={f.code} value={f.code}>{f.code} — {f.name}</option>)}
                </select>
              </div>
              <div style={{ ...s.col, flex:"0 0 100px" }}>
                <label style={s.label}>Thứ tự</label>
                <input type="number" style={s.input} value={editing.sortOrder} onChange={e => setEditing(p => p && { ...p, sortOrder: +e.target.value })} min={0} />
              </div>
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:16 }}>
              <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setEditing(null)}>Hủy</button>
              <button style={{ ...s.btn, ...s.btnPri }} onClick={save} disabled={saving}>{saving ? "Đang lưu..." : "Lưu"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════ */
type OrgStructurePageProps = { user?: { role?: string } | null };

export function OrgStructurePage({ user }: OrgStructurePageProps) {
  const userIsAdmin = user?.role === "admin";
  const [tab, setTab] = useState<"tree"|"factories"|"divisions"|"departments"|"places">("tree");
  const [factories,   setFactories]   = useState<Factory[]>([]);
  const [divisions,   setDivisions]   = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [toast,   setToast]   = useState("");
  const [pendingPlaces, setPendingPlaces] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await api("GET", "/api/org/structure");
      setFactories(data.factories || []);
      setDivisions(data.divisions || []);
      setDepartments(data.departments || []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(() => { load().then(() => setToast("Đã cập nhật!")); }, [load]);

  const TABS = [
    { key:"tree",        label:"Sơ đồ tổ chức",              badge: 0 },
    { key:"factories",   label:`Nhà máy (${factories.length})`,       badge: 0 },
    { key:"divisions",   label:`Khối sản xuất (${divisions.length})`, badge: 0 },
    { key:"departments", label:`Bộ phận (${departments.length})`,     badge: 0 },
    { key:"places",      label:"📍 Địa điểm",                badge: pendingPlaces },
  ];

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.head}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:"linear-gradient(135deg,#1565c0,#2563eb)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <span style={{ fontSize:22 }}>🏭</span>
            </div>
            <div>
              <h2 style={s.title}>Cấu trúc tổ chức nhà máy</h2>
              <p style={s.sub}>Quản lý nhà máy · khối sản xuất · bộ phận{!userIsAdmin ? " · Chỉ xem (liên hệ admin để thay đổi)" : ""}</p>
            </div>
          </div>
        </div>
        {!userIsAdmin && (
          <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, padding:"8px 14px", fontSize:12, color:"#92400e", fontWeight:600 }}>
            🔒 Bạn không có quyền chỉnh sửa cấu hình tổ chức
          </div>
        )}
      </div>

      {/* Error */}
      {error && <div style={{ ...s.err, marginBottom:16 }}>❌ {error}</div>}

      {/* Loading */}
      {loading ? (
        <div style={{ textAlign:"center", padding:60, color:"#94a3b8" }}>Đang tải...</div>
      ) : (
        <>
          {/* Tabs */}
          <div style={s.tabs}>
            {TABS.map(t => (
              <button key={t.key} style={{ ...s.tab, ...(tab === t.key ? s.tabAct : {}), display:"inline-flex", alignItems:"center", gap:6 }} onClick={() => setTab(t.key as typeof tab)}>
                {t.label}
                {t.badge > 0 && (
                  <span style={{ background:"#f59e0b", color:"#fff", borderRadius:20, padding:"0px 7px", fontSize:11, fontWeight:800, lineHeight:"18px" }}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === "tree"        && <TreeView factories={factories} divisions={divisions} departments={departments} />}
          {tab === "factories"   && <FactoriesTab   factories={factories}                          onRefresh={refresh} userIsAdmin={userIsAdmin} />}
          {tab === "divisions"   && <DivisionsTab   divisions={divisions}  factories={factories}   onRefresh={refresh} userIsAdmin={userIsAdmin} />}
          {tab === "departments" && <DepartmentsTab departments={departments} divisions={divisions} factories={factories} onRefresh={refresh} userIsAdmin={userIsAdmin} />}
          {tab === "places"      && <PlacesTab      userIsAdmin={userIsAdmin} factories={factories} onPendingChange={setPendingPlaces} />}
        </>
      )}

      {/* Toast */}
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
    </div>
  );
}
