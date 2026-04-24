import { useState, useMemo, useEffect } from "react";
import { TC, fmtD } from "../data/constants";
import { resolveIcon } from "../lib/typeIcons";
import { useEntries } from "../context/EntriesContext";
import { authFetch } from "../lib/authFetch";
import type { Entry } from "../types";
import {
  type ExternalCalEvent,
  type TodoItem,
  toDateKey,
  fmtTime,
  isDone,
  extractActionDates,
  addRecurring,
} from "./todoUtils";
import TodoQuickAdd from "./TodoQuickAdd";
import TodoCalendarTab from "./TodoCalendarTab";
import TodoEditPopover from "./TodoEditPopover";

/* ─── Checkbox ─── */
function CheckButton({ entry, ctx }: { entry: Entry; ctx: ReturnType<typeof useEntries> }) {
  const serverDone = isDone(entry);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const done = optimistic ?? serverDone;

  function toggle() {
    if (!ctx?.handleUpdate) return;
    setOptimistic(!done);
    ctx
      .handleUpdate(entry.id, {
        metadata: { ...(entry.metadata || {}), status: done ? "todo" : "done" },
      })
      .catch(() => setOptimistic(null));
  }

  return (
    <button
      onClick={toggle}
      className="flex shrink-0 items-center justify-center rounded-full border-2 transition-all"
      style={{
        width: 20,
        height: 20,
        minWidth: 20,
        minHeight: 20,
        borderColor: done ? "var(--ember)" : "var(--line)",
        background: done ? "var(--ember)" : "transparent",
        cursor: "pointer",
      }}
      aria-label={done ? "Mark incomplete" : "Mark done"}
    >
      {done && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M2 5l2.5 2.5L8 3"
            stroke="var(--ember-ink)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

/* ─── Main TodoView ─── */
interface TodoViewProps {
  entries?: Entry[];
  typeIcons?: Record<string, string>;
  activeBrainId?: string;
}

export default function TodoView({
  entries: propEntries,
  typeIcons = {},
  activeBrainId,
}: TodoViewProps) {
  const ctx = useEntries();
  const entries = propEntries || ctx?.entries || [];
  const [tab, setTab] = useState<"list" | "calendar">("list");
  const [showCompleted, setShowCompleted] = useState(false);
  const [editState, setEditState] = useState<{ entry: Entry; rect: DOMRect } | null>(null);

  async function handleEditSave(changes: Partial<Entry>) {
    if (!ctx?.handleUpdate || !editState) return;
    await ctx.handleUpdate(editState.entry.id, changes);
  }

  /* External calendar events (from Google/Outlook sync) */
  const [externalEvents, setExternalEvents] = useState<ExternalCalEvent[]>([]);
  useEffect(() => {
    authFetch("/api/calendar?action=events")
      .then((r) => r?.json?.())
      .then((d) => {
        if (Array.isArray(d?.events)) setExternalEvents(d.events);
      })
      .catch(() => null);
  }, []);

  const mkAdd = (map: Record<string, Entry[]>) => (key: string, e: Entry) => {
    if (!map[key]) map[key] = [];
    if (!map[key].find((x) => x.id === e.id)) map[key].push(e);
  };

  const taskMap = useMemo(() => {
    const map: Record<string, Entry[]> = {};
    const add = mkAdd(map);
    entries.forEach((e) => {
      if (!isDone(e)) extractActionDates(e).forEach((d) => add(d, e));
    });
    addRecurring(entries, add);
    return map;
  }, [entries]);

  const calEventMap = useMemo(() => {
    const map: Record<string, ExternalCalEvent[]> = {};
    externalEvents.forEach((ev) => {
      const key = ev.start.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    return map;
  }, [externalEvents]);

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
    () =>
      entries.filter((e) => !isDone(e) && e.type === "todo" && extractActionDates(e).length === 0),
    [entries],
  );

  const completed = useMemo(() => entries.filter(isDone), [entries]);
  const weekItemCount = weekDays.reduce((n, d) => n + (taskMap[toDateKey(d)]?.length || 0), 0);
  const total = overdue.length + weekItemCount + todoList.length;

  function renderItem({ entry, dateStr }: TodoItem, showDate: boolean) {
    const tc = TC[entry.type] || TC.note;
    const icon = resolveIcon(entry.type, typeIcons);
    const done = isDone(entry);
    return (
      <div
        key={`${entry.id}-${dateStr}`}
        className="flex cursor-pointer items-center gap-3 py-2.5"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          setEditState({ entry, rect: e.currentTarget.getBoundingClientRect() });
        }}
      >
        <CheckButton entry={entry} ctx={ctx} />
        <span className="mt-0.5 shrink-0 text-base">{icon}</span>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium"
            style={{
              color: done ? "var(--ink-ghost)" : "var(--ink)",
              textDecoration: done ? "line-through" : "none",
            }}
          >
            {entry.title}
          </p>
          {entry.content && entry.content !== entry.title && (
            <p className="mt-0.5 truncate text-xs" style={{ color: "var(--ink-faint)" }}>
              {entry.content}
            </p>
          )}
        </div>
        {showDate && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: "var(--ember-wash)", color: "var(--ember)" }}
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

  function renderCalEventRow(ev: ExternalCalEvent) {
    const timeLabel = ev.allDay ? null : fmtTime(ev.start);
    return (
      <div key={ev.id} className="flex items-center gap-3 py-2.5">
        <span
          style={{
            width: 18,
            height: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--moss)",
              display: "block",
            }}
          />
        </span>
        <span className="shrink-0 text-base" style={{ lineHeight: 1 }}>
          📅
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" style={{ color: "var(--ink)" }}>
            {ev.title}
          </p>
          {timeLabel && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--ink-faint)" }}>
              {timeLabel}
            </p>
          )}
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--moss-wash)", color: "var(--moss)" }}
        >
          event
        </span>
      </div>
    );
  }

  function renderEntryRow(entry: Entry) {
    const done = isDone(entry);
    const tc = TC[entry.type] || TC.todo;
    const icon = resolveIcon(entry.type, typeIcons);
    return (
      <div
        key={entry.id}
        className="flex cursor-pointer items-center gap-3 py-2.5"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          setEditState({ entry, rect: e.currentTarget.getBoundingClientRect() });
        }}
      >
        <CheckButton entry={entry} ctx={ctx} />
        {icon && <span className="mt-0.5 shrink-0 text-base">{icon}</span>}
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium"
            style={{
              color: done ? "var(--ink-ghost)" : "var(--ink)",
              textDecoration: done ? "line-through" : "none",
            }}
          >
            {entry.title}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
          style={{ background: `${tc.c}18`, color: tc.c }}
        >
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
        style={{
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 32px",
          borderBottom: "1px solid var(--line-soft)",
          minHeight: 68,
          gap: 20,
        }}
      >
        <div>
          <h1
            className="f-serif"
            style={{
              fontSize: 22,
              fontWeight: 450,
              letterSpacing: "-0.01em",
              margin: 0,
              color: "var(--ink)",
            }}
          >
            Todos
          </h1>
          <div
            className="f-serif"
            style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 2 }}
          >
            {total > 0 ? `${total} active · ${completed.length} done` : "your focused task list"}
          </div>
        </div>

        {/* Tab switcher */}
        <div
          className="flex items-center overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--line-soft)" }}
        >
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

      <div
        style={{
          padding: "16px 24px 120px",
          maxWidth: tab === "calendar" ? 1100 : 780,
          margin: "0 auto",
        }}
      >
        {/* Mobile tab switcher */}
        <div
          className="mb-4 flex items-center overflow-hidden rounded-xl border lg:hidden"
          style={{ borderColor: "var(--line-soft)" }}
        >
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
          <TodoCalendarTab
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
              <TodoQuickAdd brainId={activeBrainId} onAdded={() => ctx?.refreshEntries()} />
            </div>

            <div className="mt-6 space-y-6">
              {/* Overdue */}
              {overdue.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: "var(--blood)" }}
                    />
                    <p
                      className="text-[10px] font-semibold tracking-[0.14em] uppercase"
                      style={{ fontFamily: "var(--f-sans)", color: "var(--blood)" }}
                    >
                      Overdue
                    </p>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ background: "var(--blood-wash)", color: "var(--blood)" }}
                    >
                      {overdue.length}
                    </span>
                  </div>
                  <div
                    className="divide-y rounded-2xl border px-3"
                    style={{ background: "var(--surface)", borderColor: "var(--line-soft)" }}
                  >
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
                const events = calEventMap[key] || [];
                const hasContent = items.length > 0 || events.length > 0;
                const dayLabel = dayDate.toLocaleDateString("en-ZA", { weekday: "short" });
                const dateLabel = dayDate.toLocaleDateString("en-ZA", {
                  day: "numeric",
                  month: "short",
                });

                return (
                  <div key={key} style={{ opacity: isPast ? 0.5 : 1 }}>
                    <div className="mb-2 flex items-center gap-2">
                      {isToday && (
                        <span
                          className="f-sans inline-flex shrink-0 items-center justify-center"
                          style={{
                            background: "var(--ember)",
                            color: "var(--ember-ink)",
                            borderRadius: 999,
                            padding: "4px 8px 3px",
                            fontSize: 9,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            lineHeight: 1,
                          }}
                        >
                          Today
                        </span>
                      )}
                      <span
                        className="f-sans"
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: isToday ? "var(--ink)" : "var(--ink-soft)",
                        }}
                      >
                        {dayLabel}
                      </span>
                      <span className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)" }}>
                        {dateLabel}
                      </span>
                      {hasContent && (
                        <span
                          className="f-sans ml-auto"
                          style={{ fontSize: 10, color: "var(--ink-faint)" }}
                        >
                          {events.length + items.length}
                        </span>
                      )}
                    </div>
                    {hasContent ? (
                      <div
                        className="divide-y rounded-2xl border px-3"
                        style={{ background: "var(--surface)", borderColor: "var(--line-soft)" }}
                      >
                        {events.map(renderCalEventRow)}
                        {items.map((entry) => renderItem({ entry, dateStr: key }, false))}
                      </div>
                    ) : (
                      <div
                        style={{ height: 1, background: "var(--line-soft)", margin: "4px 2px" }}
                      />
                    )}
                  </div>
                );
              })}

              {/* Undated todos */}
              {todoList.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: "var(--ember)" }}
                    />
                    <p
                      className="text-[10px] font-semibold tracking-[0.14em] uppercase"
                      style={{ fontFamily: "var(--f-sans)", color: "var(--ember)" }}
                    >
                      To Do
                    </p>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ background: "var(--ember-wash)", color: "var(--ember)" }}
                    >
                      {todoList.length}
                    </span>
                  </div>
                  <div
                    className="divide-y rounded-2xl border px-3"
                    style={{ background: "var(--surface)", borderColor: "var(--line-soft)" }}
                  >
                    {todoList.map((e) => renderEntryRow(e))}
                  </div>
                </div>
              )}

              {/* Completed */}
              {completed.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowCompleted((s) => !s)}
                    className="flex w-full items-center gap-2 py-1"
                  >
                    <span
                      className="block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: "var(--ink-ghost)" }}
                    />
                    <p
                      className="text-[10px] font-semibold tracking-[0.14em] uppercase"
                      style={{ fontFamily: "var(--f-sans)", color: "var(--ink-faint)" }}
                    >
                      Completed
                    </p>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ background: "var(--surface-high)", color: "var(--ink-faint)" }}
                    >
                      {completed.length}
                    </span>
                    <span className="f-sans ml-auto text-xs" style={{ color: "var(--ink-ghost)" }}>
                      {showCompleted ? "▾" : "▸"}
                    </span>
                  </button>
                  {showCompleted && (
                    <div
                      className="mt-2 divide-y rounded-2xl border px-3"
                      style={{ background: "var(--surface)", borderColor: "var(--line-soft)" }}
                    >
                      {completed.map((e) => renderEntryRow(e))}
                    </div>
                  )}
                </div>
              )}

              {/* Empty state */}
              {total === 0 && completed.length === 0 && (
                <div className="mt-8 flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-4" style={{ fontSize: 40, opacity: 0.3 }}>
                    ☑
                  </div>
                  <p
                    className="mb-1 text-lg font-semibold"
                    style={{ fontFamily: "var(--f-sans)", color: "var(--ink)" }}
                  >
                    All clear
                  </p>
                  <p className="max-w-xs text-sm" style={{ color: "var(--ink-faint)" }}>
                    Add todos above, or they'll appear automatically when entries have due dates.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {editState && (
        <TodoEditPopover
          entry={editState.entry}
          rect={editState.rect}
          onClose={() => setEditState(null)}
          onSave={handleEditSave}
        />
      )}
    </div>
  );
}

/* Re-export so any external consumer of ExternalCalEvent (none currently) keeps working. */
export type { ExternalCalEvent } from "./todoUtils";
