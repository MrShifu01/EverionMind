import { useState, useMemo } from "react";
import { parseISO, startOfDay, endOfDay } from "date-fns";
import type { Entry } from "../types";
import { type ExternalCalEvent, toDateKey, addRecurring, isDone, extractDates } from "./todoUtils";
import QuickAdd from "./TodoQuickAdd";

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

function entriesToCalEvents(entries: Entry[]): CalEvent[] {
  const events: CalEvent[] = [];
  entries.forEach((e) => {
    if (isDone(e)) return;
    extractDates(e).forEach((d) => {
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

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAY_ABBRS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function eventSourceColor(source: CalEvent["source"]): string {
  if (source === "entry") return "var(--ember)";
  if (source === "google") return "oklch(54% 0.13 248)";
  return "oklch(52% 0.10 192)";
}

function buildMonthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const total = new Date(year, month + 1, 0).getDate();
  const startOffset = (first.getDay() + 6) % 7; // Mon = 0
  const cells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: total }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function DayDetailPanel({
  dateKey,
  events,
  onClose,
}: {
  dateKey: string;
  events: CalEvent[];
  onClose: () => void;
}) {
  const date = new Date(dateKey + "T00:00:00");
  const label = date.toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <div
      className="space-y-3 rounded-2xl border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--line-soft)" }}
    >
      <div className="flex items-center justify-between">
        <p
          className="text-sm font-semibold"
          style={{ color: "var(--ink)", fontFamily: "var(--f-sans)" }}
        >
          {label}
        </p>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-full text-sm transition-colors"
          style={{ color: "var(--ink-ghost)", background: "var(--surface-high)" }}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      {events.length === 0 ? (
        <p className="py-4 text-center text-xs" style={{ color: "var(--ink-ghost)" }}>
          Nothing scheduled
        </p>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => {
            const color = eventSourceColor(ev.source);
            const timeStr = ev.allDay
              ? "All day"
              : `${ev.start.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}–${ev.end.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`;
            const srcLabel =
              ev.source === "entry" ? "Todo" : ev.source === "google" ? "Google" : "Outlook";
            return (
              <div
                key={ev.id}
                className="flex items-start gap-3 rounded-xl p-3"
                style={{ background: `color-mix(in oklch, ${color} 6%, var(--surface-low))` }}
              >
                <div
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug font-medium" style={{ color: "var(--ink)" }}>
                    {ev.title}
                  </p>
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--ink-faint)" }}>
                    {timeStr} · {srcLabel}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AgendaList({
  days,
  today,
}: {
  days: { key: string; date: Date; events: CalEvent[] }[];
  today: string;
}) {
  if (days.length === 0) {
    return (
      <div className="py-12 text-center" style={{ color: "var(--ink-ghost)" }}>
        <p className="text-sm">No upcoming events in the next 60 days</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {days.map(({ key, date, events }) => {
        const isToday = key === today;
        return (
          <div key={key} className="flex gap-4">
            <div className="w-14 shrink-0 pt-0.5 text-right">
              <p
                className="text-xs leading-tight font-semibold"
                style={{
                  color: isToday ? "var(--ember)" : "var(--ink-soft)",
                  fontFamily: "var(--f-sans)",
                }}
              >
                {isToday ? "Today" : date.toLocaleDateString("en-ZA", { weekday: "short" })}
              </p>
              {!isToday && (
                <p className="text-[10px] leading-tight" style={{ color: "var(--ink-ghost)" }}>
                  {date.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                </p>
              )}
            </div>
            <div
              className="min-w-0 flex-1 space-y-1.5 border-l pl-4"
              style={{ borderColor: isToday ? "var(--ember)" : "var(--line-soft)" }}
            >
              {events.map((ev) => {
                const color = eventSourceColor(ev.source);
                return (
                  <div
                    key={ev.id}
                    className="flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2"
                    style={{ background: "var(--surface)" }}
                  >
                    <div
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: color }}
                    />
                    <span className="flex-1 truncate text-sm" style={{ color: "var(--ink)" }}>
                      {ev.title}
                    </span>
                    {!ev.allDay && (
                      <span className="shrink-0 text-[10px]" style={{ color: "var(--ink-ghost)" }}>
                        {ev.start.toLocaleTimeString("en-ZA", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase"
                      style={{
                        background: `color-mix(in oklch, ${color} 12%, var(--surface-high))`,
                        color,
                      }}
                    >
                      {ev.source === "entry"
                        ? "Todo"
                        : ev.source === "google"
                          ? "Google"
                          : "Outlook"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface Props {
  entries: Entry[];
  externalEvents: ExternalCalEvent[];
  brainId?: string;
  onAdded: () => void;
}

export default function TodoCalendarTab({ entries, externalEvents, brainId, onAdded }: Props) {
  const [navDate, setNavDate] = useState(new Date());
  const [selectedKey, setSelectedKey] = useState<string | null>(toDateKey(new Date()));
  const [calView, setCalView] = useState<"month" | "agenda">("month");

  const year = navDate.getFullYear();
  const month = navDate.getMonth();
  const today = toDateKey(new Date());

  const calEvents = useMemo(
    () => [...entriesToCalEvents(entries), ...externalToCalEvents(externalEvents)],
    [entries, externalEvents],
  );

  const eventMap = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    calEvents.forEach((ev) => {
      const key = toDateKey(ev.start);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    // Add recurring entries for the currently viewed month
    addRecurring(
      entries,
      (key, e) => {
        if (!map[key]) map[key] = [];
        if (!map[key].find((ev) => ev.id === `entry-${e.id}-recurring`)) {
          map[key].push({
            id: `entry-${e.id}-recurring`,
            title: e.title,
            start: startOfDay(parseISO(key)),
            end: endOfDay(parseISO(key)),
            allDay: true,
            source: "entry",
            entry: e,
          });
        }
      },
      year,
      month,
    );
    return map;
  }, [calEvents, entries, year, month]);

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const selectedEvents = selectedKey ? eventMap[selectedKey] || [] : [];

  // Freeze "now" at mount so agenda computation is pure (React Compiler rule)
  const [nowMs] = useState(() => Date.now());

  const agendaDays = useMemo(() => {
    const start = new Date(nowMs);
    start.setHours(0, 0, 0, 0);
    const end = new Date(nowMs + 60 * 86400000);
    const days: { key: string; date: Date; events: CalEvent[] }[] = [];
    const d = new Date(start);
    while (d <= end) {
      const key = toDateKey(d);
      if (eventMap[key]?.length) days.push({ key, date: new Date(d), events: eventMap[key] });
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [eventMap, nowMs]);

  return (
    <div className="space-y-4">
      <QuickAdd brainId={brainId} onAdded={onAdded} />

      {externalEvents.length === 0 && (
        <p className="text-xs" style={{ color: "var(--ink-ghost)" }}>
          Connect Google or Outlook in{" "}
          <strong style={{ color: "var(--ink-soft)", fontWeight: 600 }}>
            Settings → Calendar Sync
          </strong>{" "}
          to see your events here.
        </p>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setNavDate(new Date(year, month - 1, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          style={{ color: "var(--ink-soft)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-high)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          aria-label="Previous month"
        >
          <svg
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>

        <h2
          className="flex-1 text-base font-semibold"
          style={{ color: "var(--ink)", fontFamily: "var(--f-serif)", letterSpacing: "-0.01em" }}
        >
          {MONTH_NAMES[month]} {year}
        </h2>

        <button
          onClick={() => {
            setNavDate(new Date());
            setSelectedKey(today);
          }}
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{ background: "var(--ember-wash)", color: "var(--ember)" }}
        >
          Today
        </button>

        <button
          onClick={() => setNavDate(new Date(year, month + 1, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          style={{ color: "var(--ink-soft)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-high)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          aria-label="Next month"
        >
          <svg
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        <div
          className="flex overflow-hidden rounded-lg border"
          style={{ borderColor: "var(--line-soft)" }}
        >
          {(["month", "agenda"] as const).map((v, i) => (
            <button
              key={v}
              onClick={() => setCalView(v)}
              className="px-3 py-1.5 text-xs font-medium capitalize transition-colors"
              style={{
                background: calView === v ? "var(--ember)" : "var(--surface)",
                color: calView === v ? "var(--ember-ink)" : "var(--ink-soft)",
                borderRight: i === 0 ? "1px solid var(--line-soft)" : "none",
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Month view */}
      {calView === "month" && (
        <div>
          <div className="lg:flex lg:gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 grid grid-cols-7">
                {DAY_ABBRS.map((d) => (
                  <div
                    key={d}
                    className="py-1 text-center text-[10px] font-bold tracking-widest uppercase"
                    style={{ color: "var(--ink-ghost)" }}
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div
                className="overflow-hidden rounded-2xl border"
                style={{ borderColor: "var(--line-soft)" }}
              >
                {grid.map((row, ri) => (
                  <div
                    key={ri}
                    className="grid grid-cols-7"
                    style={{ borderTop: ri > 0 ? "1px solid var(--line-soft)" : "none" }}
                  >
                    {row.map((day, ci) => {
                      if (!day) {
                        return (
                          <div
                            key={`e${ci}`}
                            style={{
                              background: "var(--surface-low)",
                              borderLeft: ci > 0 ? "1px solid var(--line-soft)" : "none",
                              minHeight: 64,
                            }}
                          />
                        );
                      }
                      const key = toDateKey(day);
                      const dayEvents = eventMap[key] || [];
                      const isToday = key === today;
                      const isSel = key === selectedKey;
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedKey(isSel ? null : key)}
                          className="flex flex-col p-1.5 text-left transition-colors sm:p-2"
                          style={{
                            background: isSel
                              ? "color-mix(in oklch, var(--ember) 7%, var(--surface))"
                              : "var(--surface)",
                            borderLeft: ci > 0 ? "1px solid var(--line-soft)" : "none",
                            minHeight: 64,
                          }}
                        >
                          <div className="flex justify-end">
                            <span
                              className="flex h-[22px] w-[22px] items-center justify-center text-[11px] leading-none"
                              style={{
                                borderRadius: "50%",
                                background: isToday ? "var(--ember)" : "transparent",
                                color: isToday
                                  ? "var(--ember-ink)"
                                  : isSel
                                    ? "var(--ember)"
                                    : "var(--ink-soft)",
                                fontWeight: isToday || isSel ? 700 : 500,
                              }}
                            >
                              {day.getDate()}
                            </span>
                          </div>
                          {/* Dots on all screen sizes */}
                          {dayEvents.length > 0 && (
                            <div className="mt-auto flex justify-center gap-0.5 pb-0.5">
                              {dayEvents.slice(0, 3).map((ev, i) => (
                                <div
                                  key={i}
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{ background: eventSourceColor(ev.source) }}
                                />
                              ))}
                              {dayEvents.length > 3 && (
                                <div
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{ background: "var(--ink-ghost)" }}
                                />
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Desktop day panel */}
            {selectedKey && (
              <div className="hidden w-72 shrink-0 lg:block">
                <DayDetailPanel
                  dateKey={selectedKey}
                  events={selectedEvents}
                  onClose={() => setSelectedKey(null)}
                />
              </div>
            )}
          </div>

          {/* Mobile day panel */}
          {selectedKey && (
            <div className="mt-3 lg:hidden">
              <DayDetailPanel
                dateKey={selectedKey}
                events={selectedEvents}
                onClose={() => setSelectedKey(null)}
              />
            </div>
          )}

          {/* Legend */}
          {externalEvents.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {[
                { label: "Todos", color: "var(--ember)" },
                ...(externalEvents.some((e) => e.provider === "google")
                  ? [{ label: "Google", color: "oklch(54% 0.13 248)" }]
                  : []),
                ...(externalEvents.some((e) => e.provider === "microsoft")
                  ? [{ label: "Outlook", color: "oklch(52% 0.10 192)" }]
                  : []),
              ].map(({ label, color }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ background: color }} />
                  <span className="text-[10px] font-medium" style={{ color: "var(--ink-faint)" }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Agenda view */}
      {calView === "agenda" && <AgendaList days={agendaDays} today={today} />}
    </div>
  );
}
