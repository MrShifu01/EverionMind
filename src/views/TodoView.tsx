import { useState, useMemo } from "react";
import { TC, fmtD } from "../data/constants";
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
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
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
  // Scan title + content for YYYY-MM-DD
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

  // Count total events this month
  const eventCount = Object.keys(dateMap).filter((k) => k.startsWith(`${year}-${String(mon + 1).padStart(2, "0")}`)).length;

  return (
    <div className="bg-ob-surface border-ob-border mb-3 rounded-xl border">
      {/* Header — always visible, acts as toggle */}
      <button
        onClick={() => setExpanded((s) => !s)}
        className="flex w-full cursor-pointer items-center justify-between border-none bg-transparent px-3 py-2.5"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">📅</span>
          <span className="text-ob-text text-[13px] font-semibold">{monthLabel}</span>
          {eventCount > 0 && (
            <span className="text-ob-text-dim text-[10px]">· {eventCount} days with events</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {expanded && (
            <>
              <span
                onClick={(e) => { e.stopPropagation(); setMonth(new Date(year, mon - 1, 1)); }}
                className="text-ob-text-muted px-1.5 text-sm"
              >←</span>
              <span
                onClick={(e) => { e.stopPropagation(); setMonth(new Date(year, mon + 1, 1)); }}
                className="text-ob-text-muted px-1.5 text-sm"
              >→</span>
            </>
          )}
          <span className="text-ob-text-muted text-xs">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>

      {/* Calendar grid — only when expanded */}
      {expanded && (
        <div className="px-2.5 pb-2.5">
          <div className="mb-0.5 grid grid-cols-7">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div
                key={i}
                className="text-ob-text-faint text-center text-[8px] font-bold"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              if (!day) return <div key={`e${i}`} />;
              const key = dayKey(day);
              const dots = dateMap[key] || [];
              const isToday = key === today;
              const isSel = key === selectedDay;
              return (
                <div
                  key={key}
                  onClick={() => onSelectDay(isSel ? null : key)}
                  className={`relative flex h-7 cursor-pointer items-center justify-center rounded ${
                    isSel
                      ? "bg-teal"
                      : isToday
                        ? "bg-teal/[0.12]"
                        : "bg-transparent"
                  }`}
                >
                  <span
                    className={`text-[10px] ${isToday ? "font-extrabold" : "font-normal"} ${isSel ? "text-ob-bg" : isToday ? "text-teal" : "text-ob-text-mid"}`}
                  >
                    {day}
                  </span>
                  {dots.length > 0 && !isSel && (
                    <div className="absolute bottom-0.5 h-1 w-1 rounded-full bg-orange" />
                  )}
                </div>
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
}

export default function TodoView({ entries: propEntries }: TodoViewProps) {
  const ctx = useEntries();
  const entries = propEntries || ctx?.entries || [];
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Build date map for calendar dots + recurring entries
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

    // Recurring day-of-week entries — show on every matching weekday in current month
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

  // Build prioritised todo sections
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

    entries.forEach((entry) => {
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

  // Selected day entries from calendar
  const selEntries = selectedDay ? dateMap[selectedDay] || [] : [];
  const total = today.length + tomorrow.length + thisWeek.length + overdue.length;

  function renderItem({ entry, dateStr }: TodoItem, showDate: boolean) {
    const tc = TC[entry.type] || TC.note;
    return (
      <div
        key={`${entry.id}-${dateStr}`}
        className="bg-ob-surface border-ob-border mb-1.5 flex items-center gap-2.5 rounded-[10px] border px-3.5 py-2.5"
      >
        <span className="shrink-0 text-base">{tc.i}</span>
        <div className="min-w-0 flex-1">
          <p className="text-ob-text m-0 overflow-hidden text-[13px] font-semibold text-ellipsis whitespace-nowrap">
            {entry.title}
          </p>
          {entry.content && entry.content !== entry.title && (
            <p className="text-ob-text-dim mt-0.5 mb-0 overflow-hidden text-[11px] text-ellipsis whitespace-nowrap">
              {entry.content}
            </p>
          )}
        </div>
        {showDate && <span className="text-ob-text-dim shrink-0 text-[10px]">{fmtD(dateStr)}</span>}
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold"
          style={{ background: `${tc.c}20`, color: tc.c }}
        >
          {entry.type}
        </span>
      </div>
    );
  }

  function renderSection(
    title: string,
    emoji: string,
    items: TodoItem[],
    showDate: boolean,
    accentColor?: string,
  ) {
    if (items.length === 0) return null;
    return (
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-sm">{emoji}</span>
          <p
            className="m-0 text-xs font-bold tracking-[1px] uppercase"
            style={accentColor ? { color: accentColor } : undefined}
          >
            {!accentColor && <span className="text-ob-text-mid">{title}</span>}
            {accentColor && title}
          </p>
          <span className="text-ob-text-dim text-[11px] font-normal">({items.length})</span>
        </div>
        {items.map((item) => renderItem(item, showDate))}
      </div>
    );
  }

  return (
    <div>
      {/* Mini calendar overview */}
      <MiniCalendar dateMap={dateMap} selectedDay={selectedDay} onSelectDay={setSelectedDay} />

      {/* Selected day detail */}
      {selectedDay && (
        <div className="mb-5">
          <p className="text-ob-text-faint mb-2 text-[11px] font-semibold tracking-[1.2px] uppercase">
            {selEntries.length
              ? `${selEntries.length} item${selEntries.length > 1 ? "s" : ""} — ${selectedDay}`
              : `Nothing on ${selectedDay}`}
          </p>
          {selEntries.map((e) => {
            const cfg = TC[e.type] || TC.note;
            return (
              <div
                key={e.id}
                className="bg-ob-surface border-ob-border mb-2 rounded-[10px] border px-4 py-3"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm">{cfg.i}</span>
                  <span className="text-[11px] font-bold uppercase" style={{ color: cfg.c }}>
                    {e.type}
                  </span>
                </div>
                <p className="text-ob-text-soft m-0 text-sm font-medium">{e.title}</p>
                {e.content && (
                  <p className="text-ob-text-muted mt-1 mb-0 text-xs leading-relaxed">
                    {e.content.slice(0, 120)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Prioritized sections */}
      {!selectedDay && total === 0 && (
        <div className="pt-8 text-center">
          <div className="mb-3 text-[40px]">📋</div>
          <p className="text-ob-text mb-1 text-[15px] font-semibold">All clear</p>
          <p className="text-ob-text-dim m-0 text-[13px] leading-relaxed">
            No upcoming deadlines, events, or reminders this week.
            <br />
            Entries with dates will show up here automatically.
          </p>
        </div>
      )}

      {!selectedDay && (
        <>
          {renderSection("Overdue", "🔴", overdue, true, "#FF6B35")}
          {renderSection("Today", "🟢", today, false, "#4ECDC4")}
          {renderSection("Tomorrow", "🟡", tomorrow, false, "#FFEAA7")}
          {renderSection("This week", "📅", thisWeek, true)}
        </>
      )}
    </div>
  );
}
