import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Bell, Building2, CheckCircle2, Moon, Settings, ShieldCheck, SlidersHorizontal, Sun, UserRound } from 'lucide-react';
import { DEPARTMENTS } from './safety-sample-adapter';
import { SafetyI18nRender } from "./safety-i18n-render";
interface DeptSetting {
    name: string;
    manager: string;
    headcount: number;
    target: number;
    active: boolean;
}
const INITIAL_DEPTS: DeptSetting[] = DEPARTMENTS.map((name, i) => ({
    name,
    manager: '—',
    headcount: 20,
    target: 90,
    active: true,
}));
const NOTIF_DEFAULTS = {
    warningEmail: true, warningApp: true,
    incidentEmail: true, incidentApp: true,
    kpiEmail: false, kpiApp: true,
    reportEmail: true, reportApp: false,
};
type ThemeMode = 'light' | 'dark';
interface SafetySettingsPageProps {
    theme?: ThemeMode;
    setTheme?: (theme: ThemeMode) => void;
}
function readCurrentTheme(): ThemeMode {
    const theme = document.documentElement.dataset.theme || localStorage.getItem('hub-theme');
    return theme === 'dark' ? 'dark' : 'light';
}
function authHeaders(): Record<string, string> {
    const tk = localStorage.getItem('mhc_session_token');
    return { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) };
}
export function SafetySettingsPage({ theme, setTheme }: SafetySettingsPageProps = {}) {
    const [fallbackTheme, setFallbackTheme] = useState<ThemeMode>(readCurrentTheme);
    const resolvedTheme: ThemeMode = theme === 'dark' || theme === 'light' ? theme : fallbackTheme;
    const isDark = resolvedTheme === 'dark';
    useEffect(() => {
        if (theme === 'dark' || theme === 'light') {
            setFallbackTheme(theme);
        }
    }, [theme]);
    const toggleTheme = useCallback(() => {
        const nextTheme: ThemeMode = resolvedTheme === 'dark' ? 'light' : 'dark';
        if (setTheme) {
            setTheme(nextTheme);
            return;
        }
        document.documentElement.dataset.theme = nextTheme;
        localStorage.setItem('hub-theme', nextTheme);
        setFallbackTheme(nextTheme);
    }, [resolvedTheme, setTheme]);
    const [depts, setDepts] = useState<DeptSetting[]>(INITIAL_DEPTS);
    const [editIdx, setEditIdx] = useState<number | null>(null);
    const [editVal, setEditVal] = useState<Partial<DeptSetting>>({});
    const [notifs, setNotifs] = useState(NOTIF_DEFAULTS);
    const [profile, setProfile] = useState({ displayName: '', email: '', phone: '' });
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [actorName, setActorName] = useState('');
    const [actorRole, setActorRole] = useState('');
    const loadProfile = useCallback(async () => {
        try {
            const meRes = await fetch('/api/auth/me', { headers: authHeaders() });
            let fallbackDisplayName = '';
            if (meRes.ok) {
                const authPayload = await meRes.json();
                const actor = authPayload?.data?.user || authPayload?.actor || authPayload?.user || null;
                fallbackDisplayName = actor?.displayName || actor?.name || actor?.username || '';
                const roleMap: Record<string, string> = {
                    admin: 'Quản trị',
                    leader: 'Quản lý',
                    viewer: 'Khách truy cập',
                    nhanvien: 'Nhân viên',
                    quanly: 'Quản lý',
                    ehs: 'EHS / An Toàn',
                    giamdoc: 'Giám đốc',
                };
                const role = String(actor?.role || '');
                setActorName(fallbackDisplayName);
                setActorRole(roleMap[role] ?? role);
            }
            const profileRes = await fetch('/api/profile', { headers: authHeaders() });
            if (profileRes.ok) {
                const profilePayload = await profileRes.json();
                const data = profilePayload?.data?.profile || profilePayload?.data || profilePayload || {};
                setProfile({
                    displayName: data.displayName ?? fallbackDisplayName,
                    email: data.email ?? '',
                    phone: data.phone ?? '',
                });
            }
        }
        catch { /* ignore */ }
    }, []);
    useEffect(() => { loadProfile(); }, [loadProfile]);
    async function saveProfile(e: React.FormEvent) {
        e.preventDefault();
        setSaveStatus('saving');
        try {
            const res = await fetch('/api/profile', {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify(profile),
            });
            if (!res.ok)
                throw new Error('save failed');
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2500);
        }
        catch {
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 2500);
        }
    }
    function startEdit(i: number) { setEditIdx(i); setEditVal({ ...depts[i] }); }
    function saveEdit() {
        if (editIdx === null)
            return;
        setDepts(prev => prev.map((d, i) => i === editIdx ? { ...d, ...editVal } : d));
        setEditIdx(null);
    }
    function toggleActive(i: number) { setDepts(prev => prev.map((d, idx) => idx === i ? { ...d, active: !d.active } : d)); }
    const totalHeadcount = depts.reduce((s, d) => s + (d.active ? d.headcount : 0), 0);
    const activeDeptCount = depts.filter(d => d.active).length;
    const enabledNotifCount = Object.values(notifs).filter(Boolean).length;
    const avgTarget = Math.round(depts.reduce((sum, d) => sum + d.target, 0) / Math.max(1, depts.length));
    const settingsStats = [
        { icon: UserRound, label: 'Hồ sơ', value: profile.displayName || actorName ? 'Đã nhận' : 'Chưa có', sub: actorRole || 'Phiên hiện tại', color: '#1565c0' },
        { icon: Building2, label: 'Bộ phận active', value: activeDeptCount, sub: `${totalHeadcount} nhân sự`, color: '#22a050' },
        { icon: Bell, label: 'Kênh thông báo', value: enabledNotifCount, sub: 'Email + ứng dụng', color: '#f9a825' },
        { icon: ShieldCheck, label: 'Mục tiêu AT TB', value: `${avgTarget}%`, sub: 'Theo bộ phận', color: '#00a99d' },
    ];
    return <SafetyI18nRender>{(<div className="safety-settings-page space-y-6 max-w-5xl mx-auto pb-10">
      <div className="safety-settings-stat-grid grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {settingsStats.map(item => (<article className="safety-settings-stat-card rounded-lg border border-border bg-card p-4 shadow-sm" key={item.label}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-xs font-black text-muted-foreground">{item.label}</span>
                <strong className="mt-2 block truncate font-mono text-2xl leading-none" style={{ color: item.color }}>{item.value}</strong>
                <small className="mt-2 block truncate text-xs font-semibold text-muted-foreground">{item.sub}</small>
              </div>
              <span className="safety-settings-stat-icon" style={{ color: item.color, background: `${item.color}14` }}>
                <item.icon className="h-5 w-5"/>
              </span>
            </div>
          </article>))}
      </div>

      <div className="safety-settings-command rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="min-w-0">
          <span className="safety-settings-eyebrow"><Settings className="h-4 w-4"/> Trung tâm cấu hình Safety</span>
          <h2>Quản lý hồ sơ, giao diện, thông báo và bộ phận 6S/ATVSLĐ</h2>
          <p>Phần này giữ cấu hình vận hành trong hệ thống MHChub local: không gọi web mẫu, không đổi dashboard chính, chỉ điều chỉnh dữ liệu và trải nghiệm cho module Safety.</p>
        </div>
        <div className="safety-settings-command-grid">
          <article><SlidersHorizontal className="h-4 w-4"/><strong>{isDark ? 'Dark' : 'Light'}</strong><span>Theme hiện tại</span></article>
          <article><Bell className="h-4 w-4"/><strong>{enabledNotifCount}/8</strong><span>Kênh đang bật</span></article>
          <article><Building2 className="h-4 w-4"/><strong>{depts.length}</strong><span>Bộ phận master</span></article>
        </div>
      </div>

      {/* Profile */}
      <div className="safety-settings-panel safety-settings-profile bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-bold text-base leading-tight">Thông Tin Người Dùng</h3>
          {actorName && (<div className="min-w-0 max-w-full text-left sm:text-right">
              <div className="truncate text-xs font-bold text-foreground">{actorName}</div>
              <div className="text-xs text-muted-foreground">{actorRole}</div>
            </div>)}
        </div>
        <form onSubmit={saveProfile} className="safety-settings-form p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Tên hiển thị</label>
            <input aria-label="Tên hiển thị" value={profile.displayName} onChange={e => setProfile(p => ({ ...p, displayName: e.target.value }))} placeholder={actorName || 'Nhập tên hiển thị...'} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:border-[#F5C400]" data-testid="input-profile-name"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Vai trò (hệ thống)</label>
            <input aria-label="Vai trò hệ thống" value={actorRole} disabled className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-muted text-muted-foreground cursor-not-allowed"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Email</label>
            <input aria-label="Email" type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} placeholder="email@mhc.vn" className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:border-[#F5C400]"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Số điện thoại</label>
            <input aria-label="Số điện thoại" value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="0912 345 678" className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:border-[#F5C400]"/>
          </div>
          <div className="md:col-span-2 flex items-center gap-4" aria-live="polite">
            <button type="submit" disabled={saveStatus === 'saving'} className="px-5 py-2 bg-[#F5C400] text-[#0f2a15] rounded-lg font-bold text-sm hover:bg-[#e0b300] disabled:opacity-60" data-testid="button-save-profile">
              {saveStatus === 'saving' ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
            {saveStatus === 'saved' && (<span className="inline-flex items-center gap-1.5 text-sm text-[#22a050] font-semibold" role="status">
                <CheckCircle2 className="h-4 w-4"/> Đã lưu thành công!
              </span>)}
            {saveStatus === 'error' && (<span className="inline-flex items-center gap-1.5 text-sm text-[#e53935] font-semibold" role="alert">
                <AlertTriangle className="h-4 w-4"/> Lỗi lưu. Vui lòng thử lại.
              </span>)}
          </div>
        </form>
      </div>

      {/* Appearance */}
      <div className="safety-settings-panel safety-settings-appearance bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30">
          <h3 className="font-bold text-base">Giao Diện</h3>
        </div>
        <div className="safety-settings-appearance-row p-5 flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm">Chế độ màu</div>
            <div className="text-xs text-muted-foreground mt-0.5">Hiện tại: {isDark ? 'Tối (Dark)' : 'Sáng (Light)'}</div>
          </div>
          <button type="button" aria-checked={isDark} aria-label={isDark ? 'Đang dùng chế độ tối, chuyển sang sáng' : 'Đang dùng chế độ sáng, chuyển sang tối'} onClick={toggleTheme} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border font-semibold text-sm hover:bg-muted transition-all" data-testid="button-toggle-theme" role="switch">
            {isDark ? <Sun className="h-4 w-4"/> : <Moon className="h-4 w-4"/>}
            {isDark ? 'Chuyển sang Sáng' : 'Chuyển sang Tối'}
          </button>
        </div>
      </div>

      {/* Notifications */}
      <div className="safety-settings-panel safety-settings-notifications bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30">
          <h3 className="font-bold text-base">Cài Đặt Thông Báo</h3>
        </div>
        <div className="safety-settings-notification-list p-5 space-y-4">
          {[
            { key: 'warning', label: 'Cảnh báo an toàn mới', emailKey: 'warningEmail' as keyof typeof NOTIF_DEFAULTS, appKey: 'warningApp' as keyof typeof NOTIF_DEFAULTS },
            { key: 'incident', label: 'Sự cố được báo cáo', emailKey: 'incidentEmail' as keyof typeof NOTIF_DEFAULTS, appKey: 'incidentApp' as keyof typeof NOTIF_DEFAULTS },
            { key: 'kpi', label: 'Báo cáo KPI hàng tuần', emailKey: 'kpiEmail' as keyof typeof NOTIF_DEFAULTS, appKey: 'kpiApp' as keyof typeof NOTIF_DEFAULTS },
            { key: 'report', label: 'Báo cáo mới được tạo', emailKey: 'reportEmail' as keyof typeof NOTIF_DEFAULTS, appKey: 'reportApp' as keyof typeof NOTIF_DEFAULTS },
        ].map(n => (<div key={n.key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="text-sm font-medium">{n.label}</span>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={notifs[n.emailKey]} onChange={() => setNotifs(p => ({ ...p, [n.emailKey]: !p[n.emailKey] }))} className="w-4 h-4 accent-[#F5C400]" data-testid={`notif-email-${n.key}`}/>
                  <span className="text-xs text-muted-foreground">Email</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={notifs[n.appKey]} onChange={() => setNotifs(p => ({ ...p, [n.appKey]: !p[n.appKey] }))} className="w-4 h-4 accent-[#F5C400]" data-testid={`notif-app-${n.key}`}/>
                  <span className="text-xs text-muted-foreground">Trong ứng dụng</span>
                </label>
              </div>
            </div>))}
        </div>
      </div>

      {/* Department management */}
      <div className="safety-settings-panel safety-settings-departments bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">Quản Lý Bộ Phận</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Tổng nhân sự hoạt động: <strong>{totalHeadcount} người</strong></p>
          </div>
        </div>
        <div className="safety-settings-dept-mobile-list space-y-3 p-3 sm:hidden">
          {depts.map((d, i) => (<article key={d.name} className="safety-settings-dept-mobile-card rounded-lg border border-border bg-background p-3 shadow-sm" data-testid={`card-dept-${i}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground">#{i + 1}</div>
                  <div className="mt-0.5 text-base font-bold text-foreground">{d.name}</div>
                </div>
                <button onClick={() => toggleActive(i)} aria-label={`${d.active ? 'Tạm dừng' : 'Kích hoạt'} bộ phận ${d.name}`} aria-checked={d.active} className={`relative h-6 w-11 shrink-0 rounded-full transition-all ${d.active ? 'bg-[#22a050]' : 'bg-muted'}`} data-testid={`toggle-dept-mobile-${i}`} role="switch" type="button">
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${d.active ? 'right-0.5' : 'left-0.5'}`}/>
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="col-span-2 rounded-md bg-muted/30 px-2 py-1.5">
                  <div className="text-[10px] font-semibold uppercase text-muted-foreground">Trưởng bộ phận</div>
                  {editIdx === i ? (<input aria-label={`Trưởng bộ phận ${d.name}`} value={editVal.manager ?? ''} onChange={e => setEditVal(p => ({ ...p, manager: e.target.value }))} className="mt-1 w-full rounded border border-[#F5C400] bg-background px-2 py-1.5 text-xs outline-none"/>) : (<div className="font-semibold">{d.manager}</div>)}
                </div>
                <div className="rounded-md bg-muted/30 px-2 py-1.5">
                  <div className="text-[10px] font-semibold uppercase text-muted-foreground">Nhân sự</div>
                  {editIdx === i ? (<input aria-label={`Nhân sự ${d.name}`} type="number" value={editVal.headcount ?? ''} onChange={e => setEditVal(p => ({ ...p, headcount: parseInt(e.target.value) || 0 }))} className="mt-1 w-full rounded border border-[#F5C400] bg-background px-2 py-1.5 font-mono text-xs outline-none"/>) : (<div className="font-mono font-bold">{d.headcount}</div>)}
                </div>
                <div className="rounded-md bg-muted/30 px-2 py-1.5">
                  <div className="text-[10px] font-semibold uppercase text-muted-foreground">Mục tiêu AT</div>
                  {editIdx === i ? (<input aria-label={`Mục tiêu an toàn ${d.name}`} type="number" min={50} max={100} value={editVal.target ?? ''} onChange={e => setEditVal(p => ({ ...p, target: parseInt(e.target.value) || 90 }))} className="mt-1 w-full rounded border border-[#F5C400] bg-background px-2 py-1.5 font-mono text-xs outline-none"/>) : (<div className="font-mono font-bold" style={{ color: d.target >= 95 ? '#22a050' : '#1565c0' }}>{d.target}%</div>)}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className={`rounded-md px-2 py-1 text-xs font-bold ${d.active ? 'bg-[#22a050]/10 text-[#22a050]' : 'bg-muted text-muted-foreground'}`}>
                  {d.active ? 'Đang hoạt động' : 'Tạm dừng'}
                </span>
                {editIdx === i ? (<button onClick={saveEdit} className="rounded-md bg-[#22a050] px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700" type="button">Lưu</button>) : (<button onClick={() => startEdit(i)} className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-semibold hover:border-[#F5C400]" data-testid={`button-edit-dept-mobile-${i}`} type="button">Sửa</button>)}
              </div>
            </article>))}
        </div>

        <div className="safety-settings-table-wrap hidden overflow-x-auto sm:block">
          <table className="safety-settings-table w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                {['#', 'Bộ phận', 'Trưởng bộ phận', 'Nhân sự', 'Mục tiêu AT', 'Hoạt động', 'Chỉnh sửa'].map(h => (<th key={h} scope="col" className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {depts.map((d, i) => (<tr key={d.name} className="safety-settings-row border-b border-border hover:bg-muted/20" data-testid={`row-dept-${i}`}>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{i + 1}</td>
                  <td className="px-4 py-3 font-semibold whitespace-nowrap">{d.name}</td>
                  <td className="px-4 py-3">
                    {editIdx === i
                ? <input aria-label={`Trưởng bộ phận ${d.name}`} value={editVal.manager ?? ''} onChange={e => setEditVal(p => ({ ...p, manager: e.target.value }))} className="border border-[#F5C400] rounded px-2 py-1 text-xs bg-background w-28"/>
                : d.manager}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {editIdx === i
                ? <input aria-label={`Nhân sự ${d.name}`} type="number" value={editVal.headcount ?? ''} onChange={e => setEditVal(p => ({ ...p, headcount: parseInt(e.target.value) || 0 }))} className="border border-[#F5C400] rounded px-2 py-1 text-xs bg-background w-16"/>
                : d.headcount}
                  </td>
                  <td className="px-4 py-3">
                    {editIdx === i
                ? <input aria-label={`Mục tiêu an toàn ${d.name}`} type="number" min={50} max={100} value={editVal.target ?? ''} onChange={e => setEditVal(p => ({ ...p, target: parseInt(e.target.value) || 90 }))} className="border border-[#F5C400] rounded px-2 py-1 text-xs bg-background w-16"/>
                : <span className="font-mono font-bold" style={{ color: d.target >= 95 ? '#22a050' : '#1565c0' }}>{d.target}%</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(i)} aria-label={`${d.active ? 'Tạm dừng' : 'Kích hoạt'} bộ phận ${d.name}`} aria-checked={d.active} className={`w-10 h-5 rounded-full transition-all ${d.active ? 'bg-[#22a050]' : 'bg-muted'} relative`} data-testid={`toggle-dept-${i}`} role="switch" type="button">
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${d.active ? 'right-0.5' : 'left-0.5'}`}/>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {editIdx === i
                ? <button type="button" onClick={saveEdit} className="px-2 py-1 text-xs font-bold bg-[#22a050] text-white rounded hover:bg-green-700">Lưu</button>
                : <button onClick={() => startEdit(i)} className="px-2 py-1 text-xs font-semibold bg-muted border border-border rounded hover:border-[#F5C400]" data-testid={`button-edit-dept-${i}`} type="button">Sửa</button>}
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>
      </div>
    </div>)}</SafetyI18nRender>;
}
