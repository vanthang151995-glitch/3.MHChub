import { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Users,
  CalendarCheck2,
  RefreshCw,
  CalendarDays,
} from "lucide-react";
import { apiFetch, asArray } from "./safety-api";
import { CalendarEventModal } from "../../components/safety/CalendarEventModal";
import "./safety-calendar.css";

// ── types ──────────────────────────────────────────────────────────────────
type EventKind = "audit" | "meeting" | "inspection";

interface CalEvent {
  id: string;
  date: string;       // YYYY-MM-DD
  title: string;
  kind: EventKind;
  status: string;
  subtitle?: string;  // dept code, time, etc.
}

// ── constants ───────────────────────────────────────────────────────────────
const KIND_META: Record<
  EventKind,
  { label: string; color: string; bg: string; dot: string; Icon: typeof ClipboardList; route: string }
> = {
  audit: {
    label: "Audit 6S",
    color: "#1d4ed8",
    bg: "#dbeafe",
    dot: "#3b82f6",
    Icon: ClipboardList,
    route: "/safety-6s/audits",
  },
  meeting: {
    label: "Họp an toàn",
    color: "#047857",
    bg: "#d1fae5",
    dot: "#10b981",
    Icon: Users,
    route: "/safety-6s/safety-meetings",
  },
  inspection: {
    label: "Kế hoạch KT",
    color: "#b45309",
    bg: "#fef3c7",
    dot: "#f59e0b",
    Icon: CalendarCheck2,
    route: "/safety-6s/inspection-plans",
  },
};

const WEEKDAYS_VN = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const VN_MONTHS = [
  "Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6",
  "Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12",
];

// ── helpers ─────────────────────────────────────────────────────────────────
function toDateStr(s: string | undefined | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
function periodToDate(period: string | undefined): string | null {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return null;
  return `${period}-05`;
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── component ────────────────────────────────────────────────────────────────
export function SafetyCalendarPage() {
  const now = new Date();
  const [year,  setYear]    = useState(now.getFullYear());
  const [month, setMonth]   = useState(now.getMonth()); // 0-indexed
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [filters, setFilters] = useState<Set<EventKind>>(
    new Set<EventKind>(["audit", "meeting", "inspection"])
  );
  const today = todayStr();

  // ── fetch ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      apiFetch<unknown>("/api/audits?limit=300").catch(() => ({})),
      apiFetch<unknown>("/api/safety-meetings?limit=200").catch(() => ({})),
      apiFetch<unknown>("/api/inspection-plans?limit=100").catch(() => ({})),
    ]).then(([auditsRaw, meetingsRaw, plansRaw]) => {
      if (!alive) return;
      const audits   = asArray<Record<string, unknown>>(auditsRaw);
      const meetings = asArray<Record<string, unknown>>(meetingsRaw);
      const plans    = asArray<Record<string, unknown>>(plansRaw);

      const calEvents: CalEvent[] = [];

      for (const a of audits) {
        const date =
          toDateStr(a.scheduledDate as string) ||
          toDateStr(a.performedAt  as string) ||
          periodToDate(a.period as string);
        if (!date) continue;
        calEvents.push({
          id: `audit:${String(a.id)}`,
          date,
          title: String(a.title || `Audit ${a.departmentCode ?? ""}`),
          kind: "audit",
          status: String(a.status || "draft"),
          subtitle: a.departmentCode ? String(a.departmentCode) : undefined,
        });
      }

      for (const m of meetings) {
        const date = toDateStr(m.meetingDate as string) || toDateStr(m.scheduledDate as string);
        if (!date) continue;
        const time = m.startTime
          ? `${String(m.startTime)}${m.endTime ? ` – ${String(m.endTime)}` : ""}`
          : undefined;
        calEvents.push({
          id: `meeting:${String(m.id)}`,
          date,
          title: String(m.title || "Họp an toàn"),
          kind: "meeting",
          status: String(m.status || "planned"),
          subtitle: time,
        });
      }

      for (const p of plans) {
        const date = toDateStr(p.plannedStartDate as string) || periodToDate(p.period as string);
        if (!date) continue;
        calEvents.push({
          id: `inspection:${String(p.id)}`,
          date,
          title: String(p.title || `Kế hoạch ${p.period ?? ""}`),
          kind: "inspection",
          status: String(p.status || "draft"),
          subtitle: p.type ? String(p.type) : undefined,
        });
      }

      setEvents(calEvents);
      setLoading(false);
    }).catch(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, []);

  // ── navigation ────────────────────────────────────────────────────────────
  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelected(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelected(null);
  };
  const goToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setSelected(null);
  };

  // ── filter toggle ─────────────────────────────────────────────────────────
  const toggleFilter = (kind: EventKind) => {
    setFilters(prev => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind); else next.add(kind);
      return next;
    });
  };

  // ── calendar cells ────────────────────────────────────────────────────────
  const cells = useMemo(() => {
    const firstDay   = new Date(year, month, 1).getDay(); // 0=Sun
    const offset     = (firstDay + 6) % 7;                // Mon-start
    const daysInMon  = new Date(year, month + 1, 0).getDate();
    const result: (number | null)[] = [];
    for (let i = 0; i < offset; i++) result.push(null);
    for (let d = 1; d <= daysInMon; d++) result.push(d);
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [year, month]);

  // ── events for month ──────────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return events.filter(e => e.date.startsWith(prefix) && filters.has(e.kind));
  }, [events, year, month, filters]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of filteredEvents) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [filteredEvents]);

  // ── stats for chips ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const c: Record<EventKind, number> = { audit: 0, meeting: 0, inspection: 0 };
    for (const e of filteredEvents) c[e.kind]++;
    return c;
  }, [filteredEvents]);

  // ── upcoming events (next 30 days) ────────────────────────────────────────
  const upcoming = useMemo(() => {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);
    const endStr = endDate.toISOString().slice(0, 10);
    return events
      .filter(e => e.date >= today && e.date <= endStr && filters.has(e.kind))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 25);
  }, [events, filters, today]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="sc-page">
      {/* ── HEADER ── */}
      <div className="sc-header">
        <div className="sc-header-left">
          <div className="sc-title-row">
            <CalendarDays size={22} className="sc-title-icon" />
            <h1 className="sc-title">Lịch An Toàn</h1>
            {loading && <RefreshCw size={14} className="sc-spinner" />}
          </div>
          <p className="sc-subtitle">
            Tổng hợp audit 6S · họp an toàn · kế hoạch kiểm tra
          </p>
        </div>

        <div className="sc-month-nav">
          <button className="sc-nav-btn" onClick={prevMonth} title="Tháng trước" aria-label="Tháng trước">
            <ChevronLeft size={18} />
          </button>
          <div className="sc-month-label">
            <span className="sc-month-name">{VN_MONTHS[month]}</span>
            <span className="sc-month-year">{year}</span>
          </div>
          <button className="sc-nav-btn" onClick={nextMonth} title="Tháng sau" aria-label="Tháng sau">
            <ChevronRight size={18} />
          </button>
          <button className="sc-today-btn" onClick={goToday}>Hôm nay</button>
        </div>
      </div>

      {/* ── FILTER CHIPS ── */}
      <div className="sc-filters">
        {(Object.keys(KIND_META) as EventKind[]).map(kind => {
          const km = KIND_META[kind];
          const active = filters.has(kind);
          return (
            <button
              key={kind}
              className={`sc-chip ${active ? "sc-chip--active" : ""}`}
              style={active ? { background: km.bg, color: km.color, borderColor: km.dot } : {}}
              onClick={() => toggleFilter(kind)}
            >
              <km.Icon size={13} />
              <span>{km.label}</span>
              <span className="sc-chip-count">{stats[kind]}</span>
            </button>
          );
        })}
        <div className="sc-chip-total">
          {filteredEvents.length} sự kiện trong tháng
        </div>
      </div>

      {/* ── MAIN LAYOUT ── */}
      <div className="sc-layout">

        {/* ── CALENDAR GRID ── */}
        <div className="sc-calendar-wrap">
          {/* weekday headers */}
          <div className="sc-weekdays">
            {WEEKDAYS_VN.map((d, i) => (
              <div
                key={d}
                className={`sc-weekday ${i >= 5 ? "sc-weekday--weekend" : ""}`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* day cells */}
          <div className="sc-grid">
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="sc-cell sc-cell--empty" />;
              }
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayEvents = eventsByDate.get(dateStr) ?? [];
              const isToday   = dateStr === today;
              const isWeekend = idx % 7 >= 5;

              return (
                <div
                  key={dateStr}
                  className={[
                    "sc-cell",
                    isToday   ? "sc-cell--today"      : "",
                    isWeekend ? "sc-cell--weekend"    : "",
                    dayEvents.length > 0 ? "sc-cell--has-events" : "",
                  ].join(" ")}
                >
                  <div className="sc-day-num">
                    {isToday
                      ? <span className="sc-today-badge">{day}</span>
                      : day
                    }
                  </div>
                  <div className="sc-day-events">
                    {dayEvents.slice(0, 3).map(e => {
                      const km = KIND_META[e.kind];
                      const isSelected = selected?.id === e.id;
                      return (
                        <button
                          key={e.id}
                          className={`sc-event-pill ${isSelected ? "sc-event-pill--selected" : ""}`}
                          style={{
                            background: km.bg,
                            color: km.color,
                            borderColor: isSelected ? km.dot : "transparent",
                          }}
                          onClick={() => setSelected(e)}
                          title={e.title}
                        >
                          <span className="sc-pill-dot" style={{ background: km.dot }} />
                          <span className="sc-pill-text">{e.title}</span>
                        </button>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <div className="sc-more-badge">
                        +{dayEvents.length - 3} nữa
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── SIDEBAR ── */}
        <div className="sc-sidebar">

          {/* upcoming events */}
          <div className="sc-upcoming">
            <div className="sc-upcoming-title">
              <CalendarDays size={14} />
              <span>Sắp diễn ra (30 ngày tới)</span>
              <span className="sc-upcoming-count">{upcoming.length}</span>
            </div>

            {loading ? (
              <div className="sc-upcoming-empty">Đang tải...</div>
            ) : upcoming.length === 0 ? (
              <div className="sc-upcoming-empty">
                Không có sự kiện nào trong 30 ngày tới
              </div>
            ) : (
              <div className="sc-upcoming-list">
                {upcoming.map((e, idx) => {
                  const km = KIND_META[e.kind];
                  const d = new Date(e.date + "T00:00:00");
                  const diff = Math.round(
                    (d.getTime() - new Date(today + "T00:00:00").getTime()) / 86400000
                  );
                  const diffLabel =
                    diff === 0 ? "Hôm nay" :
                    diff === 1 ? "Ngày mai" :
                    `${diff} ngày nữa`;
                  const isLast = idx === upcoming.length - 1;
                  return (
                    <button
                      key={e.id}
                      className="sc-upcoming-item"
                      onClick={() => setSelected(e)}
                    >
                      <div className="sc-upcoming-dot-wrap">
                        <div className="sc-upcoming-dot" style={{ background: km.dot }} />
                        {!isLast && <div className="sc-upcoming-line" />}
                      </div>
                      <div className="sc-upcoming-content">
                        <div className="sc-upcoming-item-title">{e.title}</div>
                        <div className="sc-upcoming-item-meta">
                          <span style={{ color: km.color, fontWeight: 600 }}>{km.label}</span>
                          <span>·</span>
                          <span style={diff === 0 ? { color: "#dc2626", fontWeight: 600 } : {}}>
                            {diffLabel}
                          </span>
                          {e.subtitle && (
                            <>
                              <span>·</span>
                              <span>{e.subtitle}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* legend */}
          <div className="sc-legend">
            {(Object.keys(KIND_META) as EventKind[]).map(kind => {
              const km = KIND_META[kind];
              return (
                <div key={kind} className="sc-legend-item">
                  <span className="sc-legend-dot" style={{ background: km.dot }} />
                  <span>{km.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── EVENT DETAIL MODAL ── */}
      <CalendarEventModal
        event={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
