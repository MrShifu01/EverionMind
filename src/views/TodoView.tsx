import { useState, useMemo, useRef, type ReactNode } from "react";
import { TC, fmtD } from "../data/constants";
import { resolveIcon } from "../lib/typeIcons";
import { useEntries } from "../context/EntriesContext";
import { authFetch } from "../lib/authFetch";
import type { Entry } from "../types";

/* ─── Date extraction: ALL keys (for calendar) ─── */
const ALL_DATE_KEYS = [
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

/* ─── Actionable date keys only (for overdue/today/tomorrow/week sections) ─── */
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
      style={{ background: "var(--color-surface-container)", borderColor: "var(--color-outline-variant)" }}
    >
      <button
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3"
        onClick={() => setExpanded((s) => !s)}
      >
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 flex-shrink-0" style={{ color: "var(--color-on-surface-variant)" }} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <div className="flex flex-col items-start">
            <span className="text-sm font-semibold text-[var(--color-on-surface)]" style={{ fontFamily: "var(--f-sans)" }}>
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
                style={{ color: "var(--color-primary)", background: "var(--color-primary-container)" }}
                onClick={(e) => { e.stopPropagation(); setMonth(new Date(year, mon - 1, 1)); }}
              >←</button>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition-opacity hover:opacity-80"
                style={{ color: "var(--color-primary)", background: "var(--color-primary-container)" }}
                onClick={(e) => { e.stopPropagation(); setMonth(new Date(year, mon + 1, 1)); }}
              >→</button>
            </>
          )}
          <span className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            {expanded ? "▾" : "▸"}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <div className="mb-1 grid grid-cols-7 gap-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="py-1 text-center text-[10px] font-medium" style={{ color: "var(--color-on-surface-variant)" }}>{d}</div>
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
                  className={`relative flex aspect-square w-full flex-col items-center justify-center rounded-full text-xs transition-all ${isSel ? "font-bold text-black" : isToday ? "font-semibold" : ""}`}
                  style={{
                    background: isSel ? "var(--color-primary)" : "transparent",
                    color: isSel ? "var(--color-on-primary)" : isToday ? "var(--color-primary)" : "var(--color-on-surface-variant)",
                    boxShadow: isToday && !isSel ? "inset 0 0 0 1.5px var(--color-primary)" : "none",
                  }}
                  onClick={() => onSelectDay(isSel ? null : key)}
                >
                  <span>{day}</span>
                  {dots.length > 0 && !isSel && (
                    <div className="absolute bottom-0.5 h-1 w-1 rounded-full" style={{ background: "var(--color-secondary)" }} />
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
function QuickAdd({ brainId, onAdded }: { brainId?: string; onAdded: () => void }) {
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
      style={{ background: "var(--color-surface-container)", borderColor: "var(--color-outline-variant)" }}
    >
      <span className="text-base shrink-0">☑️</span>
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a todo…"
        disabled={busy}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        style={{ color: "var(--color-on-surface)", fontFamily: "var(--f-sans)" }}
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        disabled={busy}
        className="shrink-0 rounded-lg border-none bg-transparent text-xs outline-none"
        style={{ color: dueDate ? "var(--color-primary)" : "var(--color-on-surface-variant)", fontFamily: "var(--f-sans)", cursor: "pointer" }}
      />
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="shrink-0 rounded-lg px-3 py-1 text-xs font-semibold transition-opacity disabled:opacity-40"
        style={{ background: "var(--color-primary)", color: "var(--color-on-primary)", fontFamily: "var(--f-sans)" }}
      >
        {busy ? "…" : "Add"}
      </button>
    </form>
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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const dateMap = useMemo(() => {
    const map: Record<string, Entry[]> = {};
    const addTo = (key: string, entry: Entry) => {
      if (!map[key]) map[key] = [];
      if (!map[key].find((e) => e.id === entry.id)) map[key].push(entry);
    };

    entries.forEach((e: Entry) => {
      if (isDone(e)) return;
      const dates = extractDates(e);
      dates.forEach((d) => addTo(d, e));
    });

    const now = new Date();
    const year = now.getFullYear();
    const mon = now.getMonth();
    entries.forEach((e: Entry) => {
      if (isDone(e)) return;
      const m = (e.metadata || {}) as Record<string, unknown>;
      let rawDay = (m.day_of_week || m.weekday || m.recurring_day || "").toString().toLowerCase().trim();
      if (!rawDay) {
        const text = `${e.title || ""} ${e.content || ""}`.toLowerCase();
        const dayMatch = text.match(/every\s+(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)/i);
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

  const { today, tomorrow, thisWeek, overdue, todoList } = useMemo(() => {
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
    // All active todos (type=todo, not done, regardless of date)
    const todoList: Entry[] = [];

    entries.forEach((entry: Entry) => {
      if (isDone(entry)) return;

      // Collect pure todos with no date into todoList
      if (entry.type === "todo") {
        const actionDates = extractActionDates(entry);
        if (actionDates.length === 0) {
          todoList.push(entry);
          return;
        }
      }

      // Use action-only dates for timed sections
      const dates = entry.type === "todo" ? extractActionDates(entry) : extractActionDates(entry);
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

    return { today, tomorrow, thisWeek, overdue, todoList };
  }, [entries]);

  const selEntries = selectedDay ? dateMap[selectedDay] || [] : [];
  const total = today.length + tomorrow.length + thisWeek.length + overdue.length + todoList.length;

  function renderItem({ entry, dateStr }: TodoItem, showDate: boolean) {
    const tc = TC[entry.type] || TC.note;
    const icon = resolveIcon(entry.type, typeIcons);
    const done = isDone(entry);
    return (
      <div key={`${entry.id}-${dateStr}`} className="flex items-center gap-3 py-2.5">
        <CheckButton entry={entry} ctx={ctx} />
        <span className="mt-0.5 text-base shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-medium ${done ? "line-through opacity-50" : "text-[var(--color-on-surface)]"}`}>
            {entry.title}
          </p>
          {entry.content && entry.content !== entry.title && (
            <p className="mt-0.5 truncate text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
              {entry.content}
            </p>
          )}
        </div>
        {showDate && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--color-primary-container)", color: "var(--color-primary)" }}>
            {fmtD(dateStr)}
          </span>
        )}
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize" style={{ background: `${tc.c}18`, color: tc.c }}>
          {entry.type}
        </span>
      </div>
    );
  }

  function renderTodoItem(entry: Entry) {
    const done = isDone(entry);
    const tc = TC.todo;
    return (
      <div key={entry.id} className="flex items-center gap-3 py-2.5">
        <CheckButton entry={entry} ctx={ctx} />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-medium ${done ? "line-through opacity-50" : "text-[var(--color-on-surface)]"}`}>
            {entry.title}
          </p>
        </div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize" style={{ background: `${tc.c}18`, color: tc.c }}>
          todo
        </span>
      </div>
    );
  }

  function renderSection(title: string, icon: ReactNode, items: TodoItem[], showDate: boolean, accentColor?: string) {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex-shrink-0 leading-none">{icon}</span>
          <p className="text-[10px] font-semibold tracking-[0.14em] uppercase" style={{ fontFamily: "var(--f-sans)", color: accentColor || "var(--color-on-surface-variant)" }}>
            {title}
          </p>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--color-primary-container)", color: "var(--color-on-surface-variant)" }}>
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
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      <header
        className="hidden lg:flex"
        style={{ alignItems: "center", justifyContent: "space-between", padding: "18px 32px", borderBottom: "1px solid var(--line-soft)", minHeight: 68, gap: 20 }}
      >
        <div>
          <h1 className="f-serif" style={{ fontSize: 22, fontWeight: 450, letterSpacing: "-0.01em", margin: 0, color: "var(--ink)" }}>
            Todos
          </h1>
          <div className="f-serif" style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 2 }}>
            {total > 0 ? `${total} items` : "your focused task list"}
          </div>
        </div>
      </header>
      <div style={{ padding: "16px 24px 120px", maxWidth: 780, margin: "0 auto" }}>

        {/* Quick-add */}
        <div className="mb-4">
          <QuickAdd brainId={activeBrainId} onAdded={() => ctx?.refreshEntries()} />
        </div>

        <MiniCalendar dateMap={dateMap} selectedDay={selectedDay} onSelectDay={setSelectedDay} />

        {/* Selected day detail */}
        {selectedDay && (
          <div
            className="mt-4 space-y-3 rounded-2xl border p-4"
            style={{ background: "var(--color-surface-container)", borderColor: "var(--color-outline-variant)" }}
          >
            <p className="text-sm font-semibold" style={{ color: selEntries.length ? "var(--color-primary)" : "var(--color-on-surface-variant)", fontFamily: "var(--f-sans)" }}>
              {selEntries.length ? `${selEntries.length} item${selEntries.length > 1 ? "s" : ""} — ${selectedDay}` : `Nothing on ${selectedDay}`}
            </p>
            {selEntries.map((e) => {
              const cfg = TC[e.type] || TC.note;
              const eIcon = resolveIcon(e.type, typeIcons);
              return (
                <div key={e.id} className="flex items-start gap-3 rounded-xl border px-3 py-2" style={{ background: "var(--color-surface-dim)", borderColor: "var(--color-outline-variant)" }}>
                  <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
                    <span className="text-base">{eIcon}</span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize" style={{ background: `${cfg.c}18`, color: cfg.c }}>
                      {e.type}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-on-surface truncate text-sm">{e.title}</p>
                    {e.content && (
                      <p className="mt-0.5 truncate text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
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
            <div className="mb-4 text-5xl">☑️</div>
            <p className="text-on-surface mb-1 text-lg font-semibold" style={{ fontFamily: "var(--f-sans)" }}>All clear</p>
            <p className="max-w-xs text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
              Add todos above, or they'll appear automatically when entries have due dates.
            </p>
          </div>
        )}

        {!selectedDay && total > 0 && (
          <div className="mt-6 space-y-8">
            {/* Undated todos */}
            {todoList.length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="block h-2 w-2 flex-shrink-0 rounded-full" style={{ background: "var(--color-primary)" }} />
                  <p className="text-[10px] font-semibold tracking-[0.14em] uppercase" style={{ fontFamily: "var(--f-sans)", color: "var(--color-primary)" }}>
                    To Do
                  </p>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--color-primary-container)", color: "var(--color-on-surface-variant)" }}>
                    {todoList.length}
                  </span>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--color-outline-variant)" }}>
                  {todoList.map((e) => renderTodoItem(e))}
                </div>
              </div>
            )}
            {renderSection("Overdue", <span className="block h-2 w-2 flex-shrink-0 rounded-full" style={{ background: "var(--color-error)" }} />, overdue, true, "var(--color-error)")}
            {renderSection("Today", <span className="block h-2 w-2 flex-shrink-0 rounded-full" style={{ background: "var(--color-primary)" }} />, today, false, "var(--color-primary)")}
            {renderSection("Tomorrow", <span className="block h-2 w-2 flex-shrink-0 rounded-full" style={{ background: "var(--color-status-medium)" }} />, tomorrow, false, "var(--color-status-medium)")}
            {renderSection("This week",
              <svg className="h-3.5 w-3.5" style={{ color: "var(--color-on-surface-variant)" }} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>,
              thisWeek, true
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Checkbox button (optimistic toggle done/todo) ─── */
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
        borderColor: done ? "var(--color-primary)" : "var(--color-outline-variant)",
        background: done ? "var(--color-primary)" : "transparent",
        cursor: busy ? "wait" : "pointer",
      }}
      aria-label={done ? "Mark incomplete" : "Mark done"}
    >
      {done && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5l2.5 2.5L8 3" stroke="var(--color-on-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
