import { useState, useMemo } from "react";
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

  const eventCount = Object.keys(dateMap).filter((k) => k.startsWith(`${year}-${String(mon + 1).padStart(2, "0")}`)).length;

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}
    >
      {/* Header toggle */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
        onClick={() => setExpanded((s) => !s)}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">📅</span>
          <div className="flex flex-col items-start">
            <span
              className="text-sm font-semibold text-white"
              style={{ fontFamily: "'Manrope', sans-serif" }}
            >
              {monthLabel}
            </span>
            {eventCount > 0 && (
              <span className="text-xs" style={{ color: "#777" }}>
                · {eventCount} days with events
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {expanded && (
            <>
              <button
                className="w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold hover:opacity-80 transition-opacity"
                style={{ color: "#72eff5", background: "rgba(114,239,245,0.1)" }}
                onClick={(e) => { e.stopPropagation(); setMonth(new Date(year, mon - 1, 1)); }}
              >←</button>
              <button
                className="w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold hover:opacity-80 transition-opacity"
                style={{ color: "#72eff5", background: "rgba(114,239,245,0.1)" }}
                onClick={(e) => { e.stopPropagation(); setMonth(new Date(year, mon + 1, 1)); }}
              >→</button>
            </>
          )}
          <span className="text-xs" style={{ color: "#555" }}>
            {expanded ? "▾" : "▸"}
          </span>
        </div>
      </button>

      {/* Calendar grid */}
      {expanded && (
        <div className="px-3 pb-3">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div
                key={i}
                className="text-center text-[10px] font-medium py-1"
                style={{ color: "#555" }}
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
                  className={`relative w-full aspect-square flex flex-col items-center justify-center rounded-full text-xs transition-all ${
                    isSel ? "text-black font-bold" : isToday ? "font-semibold" : ""
                  }`}
                  style={{
                    background: isSel ? "#72eff5" : "transparent",
                    color: isSel ? "#0e0e0e" : isToday ? "#72eff5" : "#aaa",
                    boxShadow: isToday && !isSel ? "inset 0 0 0 1.5px #72eff5" : "none",
                  }}
                  onClick={() => onSelectDay(isSel ? null : key)}
                >
                  <span>{day}</span>
                  {dots.length > 0 && !isSel && (
                    <div
                      className="absolute bottom-0.5 w-1 h-1 rounded-full"
                      style={{ background: "#d575ff" }}
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

  const selEntries = selectedDay ? dateMap[selectedDay] || [] : [];
  const total = today.length + tomorrow.length + thisWeek.length + overdue.length;

  function renderItem({ entry, dateStr }: TodoItem, showDate: boolean) {
    const tc = TC[entry.type] || TC.note;
    const icon = resolveIcon(entry.type, typeIcons);
    return (
      <div
        key={`${entry.id}-${dateStr}`}
        className="flex items-start gap-3 rounded-2xl border px-4 py-3 mb-2"
        style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}
      >
        <span className="text-lg mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{entry.title}</p>
          {entry.content && entry.content !== entry.title && (
            <p className="text-xs mt-0.5 truncate" style={{ color: "#777" }}>
              {entry.content}
            </p>
          )}
        </div>
        {showDate && (
          <span
            className="shrink-0 text-[10px] rounded-full px-2 py-0.5 font-medium"
            style={{ background: "rgba(114,239,245,0.1)", color: "#72eff5" }}
          >
            {fmtD(dateStr)}
          </span>
        )}
        <span
          className="shrink-0 text-[10px] rounded-full px-2 py-0.5 font-medium capitalize"
          style={{ background: `${tc.c}18`, color: tc.c }}
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
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">{emoji}</span>
          <p
            className="text-sm font-semibold"
            style={{
              fontFamily: "'Manrope', sans-serif",
              color: accentColor || "#aaa",
            }}
          >
            {!accentColor && <span>{title}</span>}
            {accentColor && title}
          </p>
          <span
            className="text-[10px] rounded-full px-2 py-0.5 font-medium"
            style={{ background: "rgba(114,239,245,0.08)", color: "#777" }}
          >
            {items.length}
          </span>
        </div>
        {items.map((item) => renderItem(item, showDate))}
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-4" style={{ background: "#0e0e0e", minHeight: "100%" }}>
      <MiniCalendar dateMap={dateMap} selectedDay={selectedDay} onSelectDay={setSelectedDay} />

      {/* Selected day detail */}
      {selectedDay && (
        <div
          className="rounded-2xl border p-4 space-y-3"
          style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}
        >
          <p
            className="text-sm font-semibold"
            style={{ color: selEntries.length ? "#72eff5" : "#777", fontFamily: "'Manrope', sans-serif" }}
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
                style={{ background: "rgba(14,14,14,0.5)", borderColor: "rgba(72,72,71,0.15)" }}
              >
                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                  <span className="text-base">{eIcon}</span>
                  <span
                    className="text-[10px] rounded-full px-2 py-0.5 font-medium capitalize"
                    style={{ background: `${cfg.c}18`, color: cfg.c }}
                  >
                    {e.type}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{e.title}</p>
                  {e.content && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: "#777" }}>
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
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-5xl mb-4">📋</div>
          <p
            className="text-lg font-semibold text-white mb-1"
            style={{ fontFamily: "'Manrope', sans-serif" }}
          >
            All clear
          </p>
          <p className="text-sm max-w-xs" style={{ color: "#777" }}>
            No upcoming deadlines, events, or reminders this week.
            Entries with dates will show up here automatically.
          </p>
        </div>
      )}

      {!selectedDay && (
        <>
          {renderSection("Overdue", "🔴", overdue, true, "#ff6e84")}
          {renderSection("Today", "🟢", today, false, "#72eff5")}
          {renderSection("Tomorrow", "🟡", tomorrow, false, "#FFEAA7")}
          {renderSection("This week", "📅", thisWeek, true)}
        </>
      )}
    </div>
  );
}
