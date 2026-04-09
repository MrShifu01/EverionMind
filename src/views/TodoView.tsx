import { useState, useMemo, type ReactNode } from "react";
import { TC, fmtD } from "../data/constants";
import { resolveIcon } from "../lib/typeIcons";
import { useEntries } from "../context/EntriesContext";
import type { Entry } from "../types";

/* ─── Shared date extraction (single source of truth) ─── */
const DATE_KEYS = [
  "deadline",
  "due_date",
  "valid_to",
  "valid_from",
  "date",
  "event_date",
  "start_date",
  "end_date",
  "match_date",
  "game_date",
  "scheduled_date",
  "appointment_date",
  "event_start",
  "expiry_date",
  "expiry",
  "renewal_date",
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const CONTENT_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/g;

const DOW: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function extractDates(entry: Entry): string[] {
  const m = (entry.metadata || {}) as Record<string, unknown>;
  const dates = new Set<string>();
  DATE_KEYS.forEach((k) => {
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

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface TodoItem {
  entry: Entry;
  dateStr: string;
}

/* ─── Collapsible Mini Calendar ─── */
function MiniCalendar({
  dateMap,
  selectedDay,
  onSelectDay,
}: {
  dateMap: Record<string, Entry[]>;
  selectedDay: string | null;
  onSelectDay: (key: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [month, setMonth] = useState<Date>(() => new Date());
  const year = month.getFullYear();
  const mon = month.getMonth();
  const today = new Date().toISOString().slice(0, 10);

  const firstDow = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const cells = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthLabel = month.toLocaleDateString("en-ZA", { month: "short", year: "numeric" });
  const dayKey = (d: number) =>
    `${year}-${String(mon + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const eventCount = Object.keys(dateMap).filter((k) =>
    k.startsWith(`${year}-${String(mon + 1).padStart(2, "0")}`),
  ).length;

  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{
        background: "var(--color-surface-container)",
        borderColor: "var(--color-outline-variant)",
      }}
    >
      {/* Header toggle */}
      <button
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3"
        onClick={() => setExpanded((s) => !s)}
      >
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 flex-shrink-0" style={{ color: "var(--color-on-surface-variant)" }} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <div className="flex flex-col items-start">
            <span
              className="text-sm font-semibold text-[var(--color-on-surface)]"
              style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
            >
              {monthLabel}
            </span>
            {eventCount > 0 && (
              <span className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                · {eventCount} days with events
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {expanded && (
            <>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition-opacity hover:opacity-80"
                style={{
                  color: "var(--color-primary)",
                  background: "var(--color-primary-container)",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setMonth(new Date(year, mon - 1, 1));
                }}
              >
                ←
              </button>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition-opacity hover:opacity-80"
                style={{
                  color: "var(--color-primary)",
                  background: "var(--color-primary-container)",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setMonth(new Date(year, mon + 1, 1));
                }}
              >
                →
              </button>
            </>
          )}
          <span className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            {expanded ? "▾" : "▸"}
          </span>
        </div>
      </button>

      {/* Calendar grid */}
      {expanded && (
        <div className="px-3 pb-3">
          <div className="mb-1 grid grid-cols-7 gap-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div
                key={i}
                className="py-1 text-center text-[10px] font-medium"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                {d}
              </div>
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
                  className={`relative flex aspect-square w-full flex-col items-center justify-center rounded-full text-xs transition-all ${
                    isSel ? "font-bold text-black" : isToday ? "font-semibold" : ""
                  }`}
                  style={{
                    background: isSel ? "var(--color-primary)" : "transparent",
                    color: isSel
                      ? "var(--color-on-primary)"
                      : isToday
                        ? "var(--color-primary)"
                        : "var(--color-on-surface-variant)",
                    boxShadow:
                      isToday && !isSel ? "inset 0 0 0 1.5px var(--color-primary)" : "none",
                  }}
                  onClick={() => onSelectDay(isSel ? null : key)}
                >
                  <span>{day}</span>
                  {dots.length > 0 && !isSel && (
                    <div
                      className="absolute bottom-0.5 h-1 w-1 rounded-full"
                      style={{ background: "var(--color-secondary)" }}
                    />
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

/* ─── Main TodoView ─── */
interface TodoViewProps {
  entries?: Entry[];
  typeIcons?: Record<string, string>;
}

export default function TodoView({ entries: propEntries, typeIcons = {} }: TodoViewProps) {
  const ctx = useEntries();
  const entries = propEntries || ctx?.entries || [];
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const dateMap = useMemo(() => {
    const map: Record<string, Entry[]> = {};
    const addTo = (key: string, entry: Entry) => {
      if (!map[key]) map[key] = [];
      if (!map[key].find((e) => e.id === entry.id)) map[key].push(entry);
    };

    entries.forEach((e: Entry) => {
      if (e.type === "reminder" && (e.metadata as any)?.status === "done") return;
      const dates = extractDates(e);
      dates.forEach((d) => addTo(d, e));
    });

    const now = new Date();
    const year = now.getFullYear();
    const mon = now.getMonth();
    entries.forEach((e: Entry) => {
      const m = (e.metadata || {}) as Record<string, unknown>;
      let rawDay = (m.day_of_week || m.weekday || m.recurring_day || "")
        .toString()
        .toLowerCase()
        .trim();
      if (!rawDay) {
        const text = `${e.title || ""} ${e.content || ""}`.toLowerCase();
        const dayMatch = text.match(
          /every\s+(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)/i,
        );
        if (dayMatch) rawDay = dayMatch[1];
      }
      const dowIndex = DOW[rawDay];
      if (dowIndex === undefined) return;
      for (let d = 1; d <= new Date(year, mon + 1, 0).getDate(); d++) {
        if (new Date(year, mon, d).getDay() === dowIndex) {
          addTo(`${year}-${String(mon + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, e);
        }
      }
    });

    return map;
  }, [entries]);

  const { today, tomorrow, thisWeek, overdue } = useMemo(() => {
    const now = new Date();
    const todayKey = toDateKey(now);
    const tom = new Date(now);
    tom.setDate(tom.getDate() + 1);
    const tomorrowKey = toDateKey(tom);
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    const endOfWeekKey = toDateKey(endOfWeek);

    const today: TodoItem[] = [];
    const tomorrow: TodoItem[] = [];
    const thisWeek: TodoItem[] = [];
    const overdue: TodoItem[] = [];

    entries.forEach((entry: Entry) => {
      if (entry.type === "reminder" && (entry.metadata as any)?.status === "done") return;
      const dates = extractDates(entry);
      dates.forEach((dateStr) => {
        const item = { entry, dateStr };
        if (dateStr === todayKey) today.push(item);
        else if (dateStr === tomorrowKey) tomorrow.push(item);
        else if (dateStr > tomorrowKey && dateStr <= endOfWeekKey) thisWeek.push(item);
        else if (dateStr < todayKey) overdue.push(item);
      });
    });

    const byDate = (a: TodoItem, b: TodoItem) => a.dateStr.localeCompare(b.dateStr);
    thisWeek.sort(byDate);
    overdue.sort((a, b) => b.dateStr.localeCompare(a.dateStr));

    return { today, tomorrow, thisWeek, overdue };
  }, [entries]);

  const selEntries = selectedDay ? dateMap[selectedDay] || [] : [];
  const total = today.length + tomorrow.length + thisWeek.length + overdue.length;

  function renderItem({ entry, dateStr }: TodoItem, showDate: boolean) {
    const tc = TC[entry.type] || TC.note;
    const icon = resolveIcon(entry.type, typeIcons);
    return (
      <div key={`${entry.id}-${dateStr}`} className="flex items-start gap-3 py-3">
        <span className="mt-0.5 text-lg">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--color-on-surface)]">
            {entry.title}
          </p>
          {entry.content && entry.content !== entry.title && (
            <p
              className="mt-0.5 truncate text-xs"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              {entry.content}
            </p>
          )}
        </div>
        {showDate && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: "var(--color-primary-container)", color: "var(--color-primary)" }}
          >
            {fmtD(dateStr)}
          </span>
        )}
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
          style={{ background: `${tc.c}18`, color: tc.c }}
        >
          {entry.type}
        </span>
      </div>
    );
  }

  function renderSection(
    title: string,
    icon: ReactNode,
    items: TodoItem[],
    showDate: boolean,
    accentColor?: string,
  ) {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex-shrink-0 leading-none">{icon}</span>
          <p
            className="text-[10px] font-semibold tracking-[0.14em] uppercase"
            style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              color: accentColor || "var(--color-on-surface-variant)",
            }}
          >
            {title}
          </p>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              background: "var(--color-primary-container)",
              color: "var(--color-on-surface-variant)",
            }}
          >
            {items.length}
          </span>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--color-outline-variant)" }}>
          {items.map((item) => renderItem(item, showDate))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4" style={{ background: "var(--color-background)", minHeight: "100%" }}>
      <MiniCalendar dateMap={dateMap} selectedDay={selectedDay} onSelectDay={setSelectedDay} />

      {/* Selected day detail */}
      {selectedDay && (
        <div
          className="mt-4 space-y-3 rounded-2xl border p-4"
          style={{
            background: "var(--color-surface-container)",
            borderColor: "var(--color-outline-variant)",
          }}
        >
          <p
            className="text-sm font-semibold"
            style={{
              color: selEntries.length ? "var(--color-primary)" : "var(--color-on-surface-variant)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            {selEntries.length
              ? `${selEntries.length} item${selEntries.length > 1 ? "s" : ""} — ${selectedDay}`
              : `Nothing on ${selectedDay}`}
          </p>
          {selEntries.map((e) => {
            const cfg = TC[e.type] || TC.note;
            const eIcon = resolveIcon(e.type, typeIcons);
            return (
              <div
                key={e.id}
                className="flex items-start gap-3 rounded-xl border px-3 py-2"
                style={{
                  background: "var(--color-surface-dim)",
                  borderColor: "var(--color-outline-variant)",
                }}
              >
                <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
                  <span className="text-base">{eIcon}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                    style={{ background: `${cfg.c}18`, color: cfg.c }}
                  >
                    {e.type}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-on-surface truncate text-sm">{e.title}</p>
                  {e.content && (
                    <p
                      className="mt-0.5 truncate text-xs"
                      style={{ color: "var(--color-on-surface-variant)" }}
                    >
                      {e.content.slice(0, 120)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!selectedDay && total === 0 && (
        <div className="mt-8 flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 text-5xl">📋</div>
          <p
            className="text-on-surface mb-1 text-lg font-semibold"
            style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
          >
            All clear
          </p>
          <p className="max-w-xs text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
            No upcoming deadlines, events, or reminders this week. Entries with dates will show up
            here automatically.
          </p>
        </div>
      )}

      {!selectedDay && total > 0 && (
        <div className="mt-6 space-y-8">
          {renderSection("Overdue", <span className="block h-2 w-2 rounded-full flex-shrink-0" style={{ background: "var(--color-error)" }} />, overdue, true, "var(--color-error)")}
          {renderSection("Today", <span className="block h-2 w-2 rounded-full flex-shrink-0" style={{ background: "var(--color-primary)" }} />, today, false, "var(--color-primary)")}
          {renderSection("Tomorrow", <span className="block h-2 w-2 rounded-full flex-shrink-0" style={{ background: "var(--color-status-medium)" }} />, tomorrow, false, "var(--color-status-medium)")}
          {renderSection("This week", <svg className="h-3.5 w-3.5" style={{ color: "var(--color-on-surface-variant)" }} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>, thisWeek, true)}
        </div>
      )}
    </div>
  );
}
