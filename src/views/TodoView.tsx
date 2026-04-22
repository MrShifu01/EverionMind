import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Calendar, dateFnsLocalizer, Views, type View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, parseISO, startOfDay, endOfDay } from "date-fns";
import { enUS } from "date-fns/locale";
import { TC, fmtD } from "../data/constants";
import { resolveIcon } from "../lib/typeIcons";
import { useEntries } from "../context/EntriesContext";
import { authFetch } from "../lib/authFetch";
import type { Entry } from "../types";
import "../design/big-calendar.css";

/* ─── date-fns localizer (week starts Monday) ─── */
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { "en-US": enUS },
});

/* ─── Date extraction ─── */
const ALL_DATE_KEYS = [
  "deadline", "due_date", "valid_to", "valid_from", "date", "event_date",
  "start_date", "end_date", "match_date", "game_date", "scheduled_date",
  "appointment_date", "event_start", "expiry_date", "expiry", "renewal_date",
];
const ACTION_DATE_KEYS = ["due_date", "deadline"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const CONTENT_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/g;
const DOW: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

function extractDates(entry: Entry): string[] {
  const m = (entry.metadata || {}) as Record<string, unknown>;
  const dates = new Set<string>();
  ALL_DATE_KEYS.forEach((k) => {
    if (m[k] && DATE_RE.test(String(m[k]))) dates.add(String(m[k]).slice(0, 10));
  });
  Object.values(m).forEach((v) => {
    if (typeof v === "string" && DATE_RE.test(v)) dates.add(v.slice(0, 10));
  });
  const text = `${entry.title || ""} ${entry.content || ""}`;
  let match;
  while ((match = CONTENT_DATE_RE.exec(text)) !== null) dates.add(match[1]);
  return [...dates];
}

function extractActionDates(entry: Entry): string[] {
  const m = (entry.metadata || {}) as Record<string, unknown>;
  const dates = new Set<string>();
  ACTION_DATE_KEYS.forEach((k) => {
    if (m[k] && DATE_RE.test(String(m[k]))) dates.add(String(m[k]).slice(0, 10));
  });
  return [...dates];
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isDone(entry: Entry): boolean {
  return (entry.metadata as any)?.status === "done";
}

interface TodoItem { entry: Entry; dateStr: string; }

/* ─── External calendar event shape ─── */
export interface ExternalCalEvent {
  id: string;
  title: string;
  start: string; // ISO
  end: string;   // ISO
  allDay?: boolean;
  provider: "google" | "microsoft";
  calendarEmail?: string;
}

/* ─── RBC event shape ─── */
interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  source: "entry" | "google" | "microsoft";
  entry?: Entry;
}

/* ─── Convert entries → RBC events ─── */
function entriesToCalEvents(entries: Entry[]): CalEvent[] {
  const events: CalEvent[] = [];
  entries.forEach((e) => {
    if (isDone(e)) return;
    extractActionDates(e).forEach((d) => {
      const day = parseISO(d);
      events.push({
        id: `entry-${e.id}-${d}`,
        title: e.title,
        start: startOfDay(day),
        end: endOfDay(day),
        allDay: true,
        source: "entry",
        entry: e,
      });
    });
  });
  return events;
}

/* ─── Convert external events → RBC events ─── */
function externalToCalEvents(exts: ExternalCalEvent[]): CalEvent[] {
  return exts.map((ev) => ({
    id: `ext-${ev.id}`,
    title: ev.title,
    start: new Date(ev.start),
    end: new Date(ev.end),
    allDay: ev.allDay ?? false,
    source: ev.provider,
  }));
}

/* ─── Recurring helper ─── */
function addRecurring(entries: Entry[], add: (key: string, e: Entry) => void) {
  const now = new Date();
  const year = now.getFullYear();
  const mon = now.getMonth();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  entries.forEach((e) => {
    if (isDone(e)) return;
    const m = (e.metadata || {}) as Record<string, unknown>;
    let rawDay = (m.day_of_week || m.weekday || m.recurring_day || "").toString().toLowerCase().trim();
    if (!rawDay) {
      const text = `${e.title || ""} ${e.content || ""}`.toLowerCase();
      const match = text.match(/every\s+(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)/i);
      if (match) rawDay = match[1];
    }
    const dowIndex = DOW[rawDay];
    if (dowIndex === undefined) return;
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(year, mon, d).getDay() === dowIndex)
        add(`${year}-${String(mon + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, e);
    }
  });
}

/* ─── Mini calendar (list tab) ─── */
function MiniCalendar({
  dateMap, selectedDay, onSelectDay,
}: { dateMap: Record<string, Entry[]>; selectedDay: string | null; onSelectDay: (k: string | null) => void; }) {
  const [expanded, setExpanded] = useState(false);
  const [month, setMonth] = useState<Date>(() => new Date());
  const year = month.getFullYear();
  const mon = month.getMonth();
  const today = new Date().toISOString().slice(0, 10);

  const firstDow = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthLabel = month.toLocaleDateString("en-ZA", { month: "short", year: "numeric" });
  const dayKey = (d: number) => `${year}-${String(mon + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const eventCount = Object.keys(dateMap).filter((k) => k.startsWith(`${year}-${String(mon + 1).padStart(2, "0")}`)).length;

  return (
    <div className="overflow-hidden rounded-2xl border" style={{ background: "var(--surface)", borderColor: "var(--line-soft)" }}>
      <button
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3"
        onClick={() => setExpanded((s) => !s)}
      >
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 flex-shrink-0" style={{ color: "var(--ink-faint)" }} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <div className="flex flex-col items-start">
            <span className="text-sm font-semibold" style={{ color: "var(--ink)", fontFamily: "var(--f-sans)" }}>{monthLabel}</span>
            {eventCount > 0 && <span className="text-xs" style={{ color: "var(--ink-faint)" }}>· {eventCount} days with events</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {expanded && (
            <>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition-opacity hover:opacity-70"
                style={{ color: "var(--ember)", background: "var(--ember-wash)" }}
                onClick={(e) => { e.stopPropagation(); setMonth(new Date(year, mon - 1, 1)); }}
              >←</button>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition-opacity hover:opacity-70"
                style={{ color: "var(--ember)", background: "var(--ember-wash)" }}
                onClick={(e) => { e.stopPropagation(); setMonth(new Date(year, mon + 1, 1)); }}
              >→</button>
            </>
          )}
          <span className="text-xs" style={{ color: "var(--ink-ghost)" }}>{expanded ? "▾" : "▸"}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <div className="mb-1 grid grid-cols-7 gap-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="py-1 text-center text-[10px] font-medium" style={{ color: "var(--ink-ghost)" }}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={`e${i}`} />;
              const key = dayKey(day);
              const dots = dateMap[key] || [];
              const isToday = key === today;
              const isSel = key === selectedDay;
              return (
                <button
                  key={key}
                  className="relative flex aspect-square w-full flex-col items-center justify-center rounded-full text-xs transition-all"
                  style={{
                    background: isSel ? "var(--ember)" : "transparent",
                    color: isSel ? "var(--ember-ink)" : isToday ? "var(--ember)" : "var(--ink-soft)",
                    fontWeight: isSel || isToday ? 700 : 400,
                    boxShadow: isToday && !isSel ? "inset 0 0 0 1.5px var(--ember)" : "none",
                  }}
                  onClick={() => onSelectDay(isSel ? null : key)}
                >
                  <span>{day}</span>
                  {dots.length > 0 && !isSel && (
                    <div className="absolute bottom-0.5 h-1 w-1 rounded-full" style={{ background: "var(--moss)" }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Quick-add form ─── */
function QuickAdd({ brainId, onAdded }: { brainId?: string; onAdded: () => void; defaultDate?: string }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || !brainId) return;
    setBusy(true);
    const metadata: Record<string, string> = { status: "todo" };
    if (dueDate) metadata.due_date = dueDate;
    await authFetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_title: t, p_type: "todo", p_brain_id: brainId, p_metadata: metadata }),
    }).catch(() => null);
    setTitle("");
    setDueDate("");
    setBusy(false);
    onAdded();
    inputRef.current?.focus();
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-2 rounded-2xl border px-3 py-2"
      style={{ background: "var(--surface)", borderColor: "var(--line-soft)" }}
    >
      <CheckCircleIcon className="h-4 w-4 shrink-0" style={{ color: "var(--ink-ghost)" }} />
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a todo…"
        disabled={busy}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        style={{ color: "var(--ink)", fontFamily: "var(--f-sans)" }}
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        disabled={busy}
        className="shrink-0 rounded-lg border-none bg-transparent text-xs outline-none"
        style={{ color: dueDate ? "var(--ember)" : "var(--ink-ghost)", fontFamily: "var(--f-sans)", cursor: "pointer" }}
      />
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="shrink-0 rounded-lg px-3 py-1 text-xs font-semibold transition-opacity disabled:opacity-40"
        style={{ background: "var(--ember)", color: "var(--ember-ink)", fontFamily: "var(--f-sans)" }}
      >
        {busy ? "…" : "Add"}
      </button>
    </form>
  );
}

/* ─── Checkbox ─── */
function CheckButton({ entry, ctx }: { entry: Entry; ctx: ReturnType<typeof useEntries> }) {
  const [busy, setBusy] = useState(false);
  const done = isDone(entry);

  async function toggle() {
    if (!ctx?.handleUpdate) return;
    setBusy(true);
    await ctx.handleUpdate(entry.id, {
      metadata: { ...(entry.metadata || {}), status: done ? "todo" : "done" },
    }).catch(() => null);
    setBusy(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all"
      style={{
        borderColor: done ? "var(--ember)" : "var(--line)",
        background: done ? "var(--ember)" : "transparent",
        cursor: busy ? "wait" : "pointer",
      }}
      aria-label={done ? "Mark incomplete" : "Mark done"}
    >
      {done && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5l2.5 2.5L8 3" stroke="var(--ember-ink)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

/* ─── Tiny icon helpers ─── */
function CheckCircleIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

/* ─── Custom RBC toolbar ─── */
function CalendarToolbar({
  view,
  onNavigate,
  onView,
  label,
}: {
  date?: Date;
  view: View;
  label: string;
  onNavigate: (action: "PREV" | "NEXT" | "TODAY" | "DATE", newDate?: Date) => void;
  onView: (view: View) => void;
}) {
  const views: { key: View; label: string }[] = [
    { key: Views.MONTH, label: "Month" },
    { key: Views.WEEK, label: "Week" },
    { key: Views.DAY, label: "Day" },
    { key: Views.AGENDA, label: "Agenda" },
  ];

  return (
    <div className="mb-3 flex items-center gap-3 flex-wrap">
      {/* Nav */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onNavigate("PREV")}
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
          style={{ color: "var(--ink-soft)", background: "transparent" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-high)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <button
          onClick={() => onNavigate("TODAY")}
          className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
          style={{ background: "var(--ember-wash)", color: "var(--ember)" }}
        >
          Today
        </button>
        <button
          onClick={() => onNavigate("NEXT")}
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
          style={{ color: "var(--ink-soft)", background: "transparent" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-high)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Label */}
      <span className="f-serif flex-1 text-base font-semibold" style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}>
        {label}
      </span>

      {/* View switcher */}
      <div className="flex items-center rounded-lg overflow-hidden border" style={{ borderColor: "var(--line-soft)" }}>
        {views.map(({ key, label: vl }) => (
          <button
            key={key}
            onClick={() => onView(key)}
            className="px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: view === key ? "var(--ember)" : "var(--surface)",
              color: view === key ? "var(--ember-ink)" : "var(--ink-soft)",
              borderRight: key !== Views.AGENDA ? `1px solid var(--line-soft)` : "none",
            }}
          >
            {vl}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Calendar tab ─── */
function CalendarTab({
  entries,
  externalEvents,
  brainId,
  onAdded,
}: {
  entries: Entry[];
  externalEvents: ExternalCalEvent[];
  brainId?: string;
  onAdded: () => void;
}) {
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState<View>(Views.MONTH);
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [addDate, setAddDate] = useState<string>("");

  const events = useMemo(() => {
    return [...entriesToCalEvents(entries), ...externalToCalEvents(externalEvents)];
  }, [entries, externalEvents]);

  const eventStyleGetter = useCallback((event: CalEvent) => {
    if (event.source === "entry") {
      return {
        style: {
          background: "var(--ember)",
          color: "var(--ember-ink)",
          border: "none",
          borderRadius: "4px",
        },
      };
    }
    return {
      style: {
        background: "var(--moss)",
        color: "oklch(100% 0 0)",
        border: "none",
        borderRadius: "4px",
      },
    };
  }, []);

  const components = useMemo(() => ({
    toolbar: (props: any) => (
      <CalendarToolbar
        date={props.date}
        view={props.view}
        label={props.label}
        onNavigate={props.onNavigate}
        onView={props.onView}
      />
    ),
  }), []);

  function handleSelectSlot({ start }: { start: Date }) {
    const k = toDateKey(start);
    setAddDate(k);
  }

  return (
    <div>
      {/* Quick-add with pre-filled date from slot selection */}
      <div className="mb-4">
        <QuickAdd brainId={brainId} onAdded={onAdded} defaultDate={addDate} />
      </div>

      {/* External event legend */}
      {externalEvents.length > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--ember)" }} />
            <span className="text-[10px] font-medium" style={{ color: "var(--ink-faint)" }}>Todos</span>
          </div>
          {externalEvents.some((e) => e.provider === "google") && (
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--moss)" }} />
              <span className="text-[10px] font-medium" style={{ color: "var(--ink-faint)" }}>Google Calendar</span>
            </div>
          )}
          {externalEvents.some((e) => e.provider === "microsoft") && (
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--moss)" }} />
              <span className="text-[10px] font-medium" style={{ color: "var(--ink-faint)" }}>Outlook</span>
            </div>
          )}
        </div>
      )}

      {externalEvents.length === 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--line-soft)", background: "var(--surface)" }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ color: "var(--ink-ghost)", flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
          <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
            Connect Google or Outlook in{" "}
            <strong style={{ color: "var(--ink-soft)", fontWeight: 600 }}>Settings → Calendar Sync</strong>{" "}
            to see your events here.
          </span>
        </div>
      )}

      {/* The calendar */}
      <div style={{ height: "calc(100vh - 320px)", minHeight: 480 }}>
        <Calendar
          localizer={localizer}
          events={events}
          date={date}
          onNavigate={(d: Date) => setDate(d)}
          view={view}
          onView={(v: View) => setView(v)}
          components={components}
          eventPropGetter={eventStyleGetter as any}
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={(ev) => setSelectedEvent(ev as CalEvent)}
          popup
        />
      </div>

      {/* Event detail popup */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          style={{ background: "var(--scrim)" }}
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border p-5"
            style={{ background: "var(--surface)", borderColor: "var(--line)", boxShadow: "var(--lift-3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                style={{ background: selectedEvent.source === "entry" ? "var(--ember)" : "var(--moss)" }}
              />
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--ink-faint)" }}>
                {selectedEvent.source === "entry" ? "Todo" : selectedEvent.source === "google" ? "Google Calendar" : "Outlook"}
              </span>
            </div>
            <p className="text-base font-semibold mb-1" style={{ color: "var(--ink)", fontFamily: "var(--f-sans)" }}>
              {selectedEvent.title}
            </p>
            <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
              {selectedEvent.allDay
                ? selectedEvent.start.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })
                : `${selectedEvent.start.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })} · ${selectedEvent.start.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}–${selectedEvent.end.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`}
            </p>
            <button
              onClick={() => setSelectedEvent(null)}
              className="w-full rounded-xl py-2 text-sm font-medium transition-colors"
              style={{ background: "var(--surface-high)", color: "var(--ink-soft)" }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main TodoView ─── */
interface TodoViewProps {
  entries?: Entry[];
  typeIcons?: Record<string, string>;
  activeBrainId?: string;
}

export default function TodoView({ entries: propEntries, typeIcons = {}, activeBrainId }: TodoViewProps) {
  const ctx = useEntries();
  const entries = propEntries || ctx?.entries || [];
  const [tab, setTab] = useState<"list" | "calendar">("list");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  /* External calendar events (from Google/Outlook sync) */
  const [externalEvents, setExternalEvents] = useState<ExternalCalEvent[]>([]);
  useEffect(() => {
    authFetch("/api/calendar/events")
      .then((r) => r?.json?.())
      .then((d) => { if (Array.isArray(d?.events)) setExternalEvents(d.events); })
      .catch(() => null);
  }, []);

  const mkAdd = (map: Record<string, Entry[]>) => (key: string, e: Entry) => {
    if (!map[key]) map[key] = [];
    if (!map[key].find((x) => x.id === e.id)) map[key].push(e);
  };

  const dateMap = useMemo(() => {
    const map: Record<string, Entry[]> = {};
    const add = mkAdd(map);
    entries.forEach((e) => { if (!isDone(e)) extractDates(e).forEach((d) => add(d, e)); });
    addRecurring(entries, add);
    return map;
  }, [entries]);

  const taskMap = useMemo(() => {
    const map: Record<string, Entry[]> = {};
    const add = mkAdd(map);
    entries.forEach((e) => { if (!isDone(e)) extractActionDates(e).forEach((d) => add(d, e)); });
    addRecurring(entries, add);
    return map;
  }, [entries]);

  const { weekDays, mondayKey, todayKey } = useMemo(() => {
    const now = new Date();
    const todayKey = toDateKey(now);
    const dow = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    monday.setHours(0, 0, 0, 0);
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
    return { weekDays, mondayKey: toDateKey(monday), todayKey };
  }, []);

  const overdue = useMemo(() => {
    const seen = new Set<string>();
    return entries
      .filter((e) => !isDone(e))
      .flatMap((e) => extractActionDates(e).map((d) => ({ entry: e, dateStr: d })))
      .filter(({ entry, dateStr }) => {
        if (dateStr >= mondayKey) return false;
        const k = `${entry.id}-${dateStr}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  }, [entries, mondayKey]);

  const todoList = useMemo(
    () => entries.filter((e) => !isDone(e) && e.type === "todo" && extractActionDates(e).length === 0),
    [entries],
  );

  const completed = useMemo(() => entries.filter(isDone), [entries]);
  const selEntries = selectedDay ? dateMap[selectedDay] || [] : [];
  const weekItemCount = weekDays.reduce((n, d) => n + (taskMap[toDateKey(d)]?.length || 0), 0);
  const total = overdue.length + weekItemCount + todoList.length;

  function renderItem({ entry, dateStr }: TodoItem, showDate: boolean) {
    const tc = TC[entry.type] || TC.note;
    const icon = resolveIcon(entry.type, typeIcons);
    const done = isDone(entry);
    return (
      <div key={`${entry.id}-${dateStr}`} className="flex items-center gap-3 py-2.5">
        <CheckButton entry={entry} ctx={ctx} />
        <span className="mt-0.5 text-base shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" style={{ color: done ? "var(--ink-ghost)" : "var(--ink)", textDecoration: done ? "line-through" : "none" }}>
            {entry.title}
          </p>
          {entry.content && entry.content !== entry.title && (
            <p className="mt-0.5 truncate text-xs" style={{ color: "var(--ink-faint)" }}>{entry.content}</p>
          )}
        </div>
        {showDate && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--ember-wash)", color: "var(--ember)" }}>
            {fmtD(dateStr)}
          </span>
        )}
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize" style={{ background: `${tc.c}18`, color: tc.c }}>
          {entry.type}
        </span>
      </div>
    );
  }

  function renderEntryRow(entry: Entry) {
    const done = isDone(entry);
    const tc = TC[entry.type] || TC.todo;
    const icon = resolveIcon(entry.type, typeIcons);
    return (
      <div key={entry.id} className="flex items-center gap-3 py-2.5">
        <CheckButton entry={entry} ctx={ctx} />
        {icon && <span className="mt-0.5 text-base shrink-0">{icon}</span>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" style={{ color: done ? "var(--ink-ghost)" : "var(--ink)", textDecoration: done ? "line-through" : "none" }}>
            {entry.title}
          </p>
        </div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize" style={{ background: `${tc.c}18`, color: tc.c }}>
          {entry.type}
        </span>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      {/* Desktop header */}
      <header
        className="hidden lg:flex"
        style={{ alignItems: "center", justifyContent: "space-between", padding: "18px 32px", borderBottom: "1px solid var(--line-soft)", minHeight: 68, gap: 20 }}
      >
        <div>
          <h1 className="f-serif" style={{ fontSize: 22, fontWeight: 450, letterSpacing: "-0.01em", margin: 0, color: "var(--ink)" }}>
            Todos
          </h1>
          <div className="f-serif" style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 2 }}>
            {total > 0 ? `${total} active · ${completed.length} done` : "your focused task list"}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center rounded-xl overflow-hidden border" style={{ borderColor: "var(--line-soft)" }}>
          {(["list", "calendar"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-4 py-2 text-sm font-medium capitalize transition-colors"
              style={{
                background: tab === t ? "var(--ember)" : "var(--surface)",
                color: tab === t ? "var(--ember-ink)" : "var(--ink-soft)",
                borderRight: t === "list" ? "1px solid var(--line-soft)" : "none",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <div style={{ padding: "16px 24px 120px", maxWidth: tab === "calendar" ? 1100 : 780, margin: "0 auto" }}>
        {/* Mobile tab switcher */}
        <div className="mb-4 flex items-center rounded-xl overflow-hidden border lg:hidden" style={{ borderColor: "var(--line-soft)" }}>
          {(["list", "calendar"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2 text-sm font-medium capitalize transition-colors"
              style={{
                background: tab === t ? "var(--ember)" : "var(--surface)",
                color: tab === t ? "var(--ember-ink)" : "var(--ink-soft)",
                borderRight: t === "list" ? "1px solid var(--line-soft)" : "none",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── Calendar tab ── */}
        {tab === "calendar" && (
          <CalendarTab
            entries={entries}
            externalEvents={externalEvents}
            brainId={activeBrainId}
            onAdded={() => ctx?.refreshEntries()}
          />
        )}

        {/* ── List tab ── */}
        {tab === "list" && (
          <>
            <div className="mb-4">
              <QuickAdd brainId={activeBrainId} onAdded={() => ctx?.refreshEntries()} />
            </div>

            <MiniCalendar dateMap={dateMap} selectedDay={selectedDay} onSelectDay={setSelectedDay} />

            {/* Selected day detail */}
            {selectedDay && (
              <div
                className="mt-4 space-y-3 rounded-2xl border p-4"
                style={{ background: "var(--surface)", borderColor: "var(--line-soft)" }}
              >
                <p className="text-sm font-semibold" style={{ color: selEntries.length ? "var(--ember)" : "var(--ink-faint)", fontFamily: "var(--f-sans)" }}>
                  {selEntries.length ? `${selEntries.length} item${selEntries.length > 1 ? "s" : ""} — ${selectedDay}` : `Nothing on ${selectedDay}`}
                </p>
                {selEntries.map((e) => {
                  const cfg = TC[e.type] || TC.note;
                  const eIcon = resolveIcon(e.type, typeIcons);
                  return (
                    <div key={e.id} className="flex items-start gap-3 rounded-xl border px-3 py-2" style={{ background: "var(--surface-low)", borderColor: "var(--line-soft)" }}>
                      <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
                        <span className="text-base">{eIcon}</span>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize" style={{ background: `${cfg.c}18`, color: cfg.c }}>
                          {e.type}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm" style={{ color: "var(--ink)" }}>{e.title}</p>
                        {e.content && (
                          <p className="mt-0.5 truncate text-xs" style={{ color: "var(--ink-faint)" }}>{e.content.slice(0, 120)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!selectedDay && (
              <div className="mt-6 space-y-6">

                {/* Overdue */}
                {overdue.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="block h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--blood)" }} />
                      <p className="text-[10px] font-semibold tracking-[0.14em] uppercase" style={{ fontFamily: "var(--f-sans)", color: "var(--blood)" }}>Overdue</p>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--blood-wash)", color: "var(--blood)" }}>{overdue.length}</span>
                    </div>
                    <div className="divide-y rounded-2xl border px-3" style={{ background: "var(--surface)", borderColor: "var(--line-soft)" }}>
                      {overdue.map((item) => renderItem(item, true))}
                    </div>
                  </div>
                )}

                {/* Weekly day-by-day */}
                {weekDays.map((dayDate) => {
                  const key = toDateKey(dayDate);
                  const isToday = key === todayKey;
                  const isPast = key < todayKey;
                  const items = taskMap[key] || [];
                  const dayLabel = dayDate.toLocaleDateString("en-ZA", { weekday: "short" });
                  const dateLabel = dayDate.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });

                  return (
                    <div key={key} style={{ opacity: isPast ? 0.5 : 1 }}>
                      <div className="mb-2 flex items-center gap-2">
                        {isToday && (
                          <span className="f-sans shrink-0" style={{ background: "var(--ember)", color: "var(--ember-ink)", borderRadius: 999, padding: "1px 8px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                            Today
                          </span>
                        )}
                        <span className="f-sans" style={{ fontSize: 12, fontWeight: 600, color: isToday ? "var(--ink)" : "var(--ink-soft)" }}>{dayLabel}</span>
                        <span className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)" }}>{dateLabel}</span>
                        {items.length > 0 && (
                          <span className="f-sans ml-auto" style={{ fontSize: 10, color: "var(--ink-faint)" }}>{items.length}</span>
                        )}
                      </div>
                      {items.length > 0 ? (
                        <div className="divide-y rounded-2xl border px-3" style={{ background: "var(--surface)", borderColor: "var(--line-soft)" }}>
                          {items.map((entry) => renderItem({ entry, dateStr: key }, false))}
                        </div>
                      ) : (
                        <div style={{ height: 1, background: "var(--line-soft)", margin: "4px 2px" }} />
                      )}
                    </div>
                  );
                })}

                {/* Undated todos */}
                {todoList.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="block h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--ember)" }} />
                      <p className="text-[10px] font-semibold tracking-[0.14em] uppercase" style={{ fontFamily: "var(--f-sans)", color: "var(--ember)" }}>To Do</p>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--ember-wash)", color: "var(--ember)" }}>{todoList.length}</span>
                    </div>
                    <div className="divide-y rounded-2xl border px-3" style={{ background: "var(--surface)", borderColor: "var(--line-soft)" }}>
                      {todoList.map((e) => renderEntryRow(e))}
                    </div>
                  </div>
                )}

                {/* Completed */}
                {completed.length > 0 && (
                  <div>
                    <button onClick={() => setShowCompleted((s) => !s)} className="flex w-full items-center gap-2 py-1">
                      <span className="block h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--ink-ghost)" }} />
                      <p className="text-[10px] font-semibold tracking-[0.14em] uppercase" style={{ fontFamily: "var(--f-sans)", color: "var(--ink-faint)" }}>Completed</p>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--surface-high)", color: "var(--ink-faint)" }}>{completed.length}</span>
                      <span className="f-sans ml-auto text-xs" style={{ color: "var(--ink-ghost)" }}>{showCompleted ? "▾" : "▸"}</span>
                    </button>
                    {showCompleted && (
                      <div className="mt-2 divide-y rounded-2xl border px-3" style={{ background: "var(--surface)", borderColor: "var(--line-soft)" }}>
                        {completed.map((e) => renderEntryRow(e))}
                      </div>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {total === 0 && completed.length === 0 && (
                  <div className="mt-8 flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-4" style={{ fontSize: 40, opacity: 0.3 }}>☑</div>
                    <p className="mb-1 text-lg font-semibold" style={{ fontFamily: "var(--f-sans)", color: "var(--ink)" }}>All clear</p>
                    <p className="max-w-xs text-sm" style={{ color: "var(--ink-faint)" }}>
                      Add todos above, or they'll appear automatically when entries have due dates.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
