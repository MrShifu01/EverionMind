// ============================================================
// Calendar (used by Todos → Calendar tab)
// ============================================================
//
// Premium iOS-inspired calendar that adapts to all three design families
// (dusk / paper / bronze) × both modes via CSS tokens. The spec's hard-coded
// "gold" palette is implemented through --ember + --ember-wash so colour
// shifts follow whichever family/mode is active.
//
// Three views: My Day (today + upcoming agenda), Week (7-column day strip),
// Calendar (month grid). Selected day surfaces in a right-side panel on
// desktop and a bottom sheet on mobile.

import { useState, useMemo, useEffect, useRef } from "react";
import { parseISO, startOfDay, endOfDay } from "date-fns";
import type { Entry } from "../types";
import { type ExternalCalEvent, toDateKey, addRecurring, isDone, extractDates } from "./todoUtils";
import QuickAdd from "./TodoQuickAdd";

// ── Types ─────────────────────────────────────────────────────────────────

interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  source: "entry" | "google" | "microsoft";
  entry?: Entry;
}

type ViewMode = "myday" | "week" | "calendar";

interface Props {
  entries: Entry[];
  externalEvents: ExternalCalEvent[];
  brainId?: string;
  onAdded: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_ABBRS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Internal todos use the ember accent (adapts per family). External
 *  events use a fixed blue that reads as "from another calendar" across
 *  every family — different enough from ember to be unambiguous. */
function eventSourceColor(source: CalEvent["source"]): string {
  if (source === "entry") return "var(--ember)";
  return "oklch(58% 0.13 248)";
}

function eventSourceKind(source: CalEvent["source"]): "internal" | "external" {
  return source === "entry" ? "internal" : "external";
}

function entriesToCalEvents(entries: Entry[]): CalEvent[] {
  const events: CalEvent[] = [];
  entries.forEach((e) => {
    if (isDone(e)) return;
    // Persona facts and vault secrets never belong on the calendar — they're
    // not time-bound. Without this skip, a persona entry's bookkeeping
    // timestamps (e.g. last_referenced_at) leak into extractDates and make
    // every fact show up as a "Todo" on the day it was last touched.
    if (e.type === "persona" || e.type === "secret") return;
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

function buildWeek(anchor: Date): Date[] {
  const day = (anchor.getDay() + 6) % 7; // Mon = 0
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function formatDayHeader(d: Date): string {
  return d.toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

function useIsDesktop(breakpoint = 1024): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth >= breakpoint,
  );
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isDesktop;
}

// ── Sub-components ────────────────────────────────────────────────────────

function ChevronButton({
  direction,
  onClick,
  ariaLabel,
}: {
  direction: "left" | "right";
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="press"
      style={{
        height: 32,
        width: 32,
        borderRadius: 999,
        border: 0,
        background: "transparent",
        color: "var(--ink-soft)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 180ms",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-high)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={direction === "left" ? "M15.75 19.5L8.25 12l7.5-7.5" : "M8.25 4.5l7.5 7.5-7.5 7.5"}
        />
      </svg>
    </button>
  );
}

function CalendarHeader({
  title,
  onPrev,
  onNext,
  onToday,
}: {
  title: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <ChevronButton direction="left" onClick={onPrev} ariaLabel="Previous" />
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, justifyContent: "center" }}>
        <h2
          className="f-serif"
          style={{
            fontSize: 18,
            fontWeight: 500,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
            margin: 0,
            textAlign: "center",
          }}
        >
          {title}
        </h2>
        <button
          onClick={onToday}
          className="press f-sans"
          style={{
            background: "var(--ember-wash)",
            color: "var(--ember)",
            border: 0,
            borderRadius: 999,
            padding: "5px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Today
        </button>
      </div>
      <ChevronButton direction="right" onClick={onNext} ariaLabel="Next" />
    </div>
  );
}

function SegmentedControl({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const options: Array<{ id: ViewMode; label: string }> = [
    { id: "myday", label: "My Day" },
    { id: "week", label: "Week" },
    { id: "calendar", label: "Calendar" },
  ];
  return (
    <div
      role="tablist"
      style={{
        display: "inline-flex",
        padding: 3,
        background: "var(--surface-low)",
        border: "1px solid var(--line-soft)",
        borderRadius: 10,
        gap: 2,
      }}
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className="press f-sans"
            style={{
              border: 0,
              padding: "7px 16px",
              minHeight: 30,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              background: active ? "var(--ember)" : "transparent",
              color: active ? "var(--ember-ink)" : "var(--ink-faint)",
              transition: "background 180ms, color 180ms",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Two-row "Tetris" stacking — top-heavy. Reads cleaner in a narrow day cell
// than a long horizontal row when there are 3+ events:
//   1 → •
//   2 → • •
//   3 → • •  /  •
//   4 → • •  /  • •
//   5 → • • •  /  • •
//   6 → • • •  /  • • •
//   7+ → 6 dots + +N
function EventDots({ events }: { events: CalEvent[] }) {
  if (events.length === 0) return null;
  const MAX = 6;
  const visible = events.slice(0, MAX);
  const overflow = events.length - visible.length;
  // Top row gets the extra dot when count is odd (top-heavy looks like a
  // proper Tetris piece resting; bottom-heavy reads as off-balance).
  const topCount = Math.ceil(visible.length / 2);
  const top = visible.slice(0, topCount);
  const bottom = visible.slice(topCount);

  const dotStyle = (ev: CalEvent): React.CSSProperties => ({
    width: 5,
    height: 5,
    borderRadius: 999,
    background: eventSourceColor(ev.source),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <div style={{ display: "flex", gap: 3 }}>
        {top.map((ev, i) => (
          <span key={`t${i}`} aria-hidden="true" style={dotStyle(ev)} />
        ))}
      </div>
      {bottom.length > 0 && (
        <div style={{ display: "flex", gap: 3 }}>
          {bottom.map((ev, i) => (
            <span key={`b${i}`} aria-hidden="true" style={dotStyle(ev)} />
          ))}
        </div>
      )}
      {overflow > 0 && (
        <span
          aria-hidden="true"
          style={{ fontSize: 9, color: "var(--ink-ghost)", lineHeight: 1, marginTop: 1 }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

function DayCell({
  date,
  events,
  isToday,
  isSelected,
  onClick,
}: {
  date: Date | null;
  events: CalEvent[];
  isToday: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  if (!date) {
    return (
      <div
        aria-hidden="true"
        style={{
          minHeight: 80,
          borderRadius: 14,
          background: "transparent",
        }}
      />
    );
  }
  return (
    <button
      onClick={onClick}
      className="cal-day press"
      data-today={isToday || undefined}
      data-selected={isSelected || undefined}
      style={{
        minHeight: 80,
        borderRadius: 14,
        padding: 10,
        background: isSelected ? "var(--ember-wash)" : "var(--surface)",
        // 2px ember border for today; transparent 2px on others so layout
        // doesn't shift between today and any other cell.
        border: isToday
          ? "2px solid var(--ember)"
          : "2px solid transparent",
        boxShadow: "var(--lift-1)",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        transition: "transform 180ms ease, box-shadow 180ms ease, background 180ms ease",
      }}
    >
      <span
        className="f-sans"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: isSelected ? "var(--ember)" : "var(--ink)",
          lineHeight: 1,
        }}
      >
        {date.getDate()}
      </span>
      <div style={{ flex: 1 }} />
      <EventDots events={events} />
    </button>
  );
}

function EventCard({ event }: { event: CalEvent }) {
  const color = eventSourceColor(event.source);
  const kind = eventSourceKind(event.source);
  const time = event.allDay ? "All day" : `${formatTime(event.start)} – ${formatTime(event.end)}`;
  const sourceLabel =
    event.source === "entry" ? "Todo" : event.source === "google" ? "Google" : "Outlook";
  return (
    <div
      style={{
        background: "var(--surface-low)",
        border: "1px solid var(--line-soft)",
        borderRadius: 12,
        padding: 12,
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
          marginTop: 7,
          flexShrink: 0,
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p
          className="f-sans"
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 500,
            color: "var(--ink)",
            lineHeight: 1.35,
            wordBreak: "break-word",
          }}
        >
          {event.title}
        </p>
        <div
          className="f-sans"
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginTop: 4,
            fontSize: 11,
            color: "var(--ink-faint)",
          }}
        >
          <span>{time}</span>
          <span aria-hidden="true">·</span>
          <span
            style={{
              padding: "1px 7px",
              borderRadius: 999,
              background: kind === "internal" ? "var(--ember-wash)" : "color-mix(in oklch, oklch(58% 0.13 248) 14%, var(--surface-high))",
              color: kind === "internal" ? "var(--ember)" : "oklch(54% 0.13 248)",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {sourceLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

function DayDetailContent({
  date,
  events,
  onClose,
}: {
  date: Date;
  events: CalEvent[];
  onClose?: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <p
            className="f-sans"
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-ghost)",
            }}
          >
            {events.length === 0 ? "Free" : `${events.length} ${events.length === 1 ? "event" : "events"}`}
          </p>
          <h3
            className="f-serif"
            style={{
              margin: "4px 0 0",
              fontSize: 20,
              fontWeight: 500,
              color: "var(--ink)",
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
            }}
          >
            {formatDayHeader(date)}
          </h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="press"
            style={{
              height: 28,
              width: 28,
              borderRadius: 999,
              border: 0,
              background: "var(--surface-low)",
              color: "var(--ink-soft)",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>
      {events.length === 0 ? (
        <p
          className="f-serif"
          style={{
            margin: 0,
            fontSize: 14,
            fontStyle: "italic",
            color: "var(--ink-ghost)",
            padding: "12px 0",
          }}
        >
          Nothing scheduled.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {events.map((ev) => (
            <EventCard key={ev.id} event={ev} />
          ))}
        </div>
      )}
    </div>
  );
}

function SidePanel({ children }: { children: React.ReactNode }) {
  return (
    <aside
      style={{
        width: 320,
        flexShrink: 0,
        alignSelf: "flex-start",
        position: "sticky",
        top: 16,
        background: "var(--surface)",
        border: "1px solid var(--line-soft)",
        borderRadius: 16,
        padding: 18,
        boxShadow: "var(--lift-1)",
      }}
    >
      {children}
    </aside>
  );
}

function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Lock body scroll while sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Drag-to-dismiss state. Only triggered from the handle area at the top —
  // otherwise scrolling through the event list would conflict with closing.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef(0);
  const CLOSE_THRESHOLD = 90; // px of downward drag to dismiss

  function onHandleTouchStart(e: React.TouchEvent) {
    startYRef.current = e.touches[0]?.clientY ?? 0;
    setDragging(true);
  }
  function onHandleTouchMove(e: React.TouchEvent) {
    const y = e.touches[0]?.clientY ?? 0;
    const delta = y - startYRef.current;
    setDragY(Math.max(0, delta)); // never drag up
  }
  function onHandleTouchEnd() {
    setDragging(false);
    if (dragY > CLOSE_THRESHOLD) {
      onClose();
      // Reset for next open. The sheet animates closed via animation; the
      // transform jumps back to 0 once `open=false` unmounts.
      setTimeout(() => setDragY(0), 200);
    } else {
      setDragY(0); // snap back
    }
  }

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        animation: "cal-sheet-fade 200ms ease",
      }}
    >
      <button
        aria-label="Close"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--scrim)",
          border: 0,
          cursor: "pointer",
        }}
      />
      <div
        style={{
          position: "relative",
          background: "var(--surface)",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          // Bottom padding includes the 56px BottomNav height so the last
          // event card has clearance instead of disappearing under the nav.
          padding: "14px 20px calc(84px + env(safe-area-inset-bottom))",
          boxShadow: "var(--lift-3)",
          maxHeight: "85vh",
          overflowY: "auto",
          animation: dragY > 0 ? undefined : "cal-sheet-slide 240ms cubic-bezier(0.22, 1, 0.36, 1)",
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
          touchAction: "pan-y",
        }}
      >
        {/* Handle: enlarged hit area + touch handlers for drag-to-dismiss. */}
        <div
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          onTouchCancel={onHandleTouchEnd}
          role="button"
          aria-label="Drag down to close"
          tabIndex={0}
          style={{
            // Generous hit area around the visible bar so it's easy to grab.
            margin: "-14px -20px 4px",
            padding: "12px 20px 8px",
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 40,
              height: 4,
              background: "var(--line)",
              borderRadius: 2,
              margin: "0 auto",
            }}
          />
        </div>
        {children}
      </div>
    </div>
  );
}

function FloatingActionButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Add todo"
      className="press"
      style={{
        position: "fixed",
        right: 24,
        bottom: "calc(96px + env(safe-area-inset-bottom))",
        height: 52,
        width: 52,
        borderRadius: 999,
        background: "var(--ember)",
        color: "var(--ember-ink)",
        border: 0,
        boxShadow: "var(--lift-3)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 40,
      }}
    >
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}

// ── View bodies ───────────────────────────────────────────────────────────

function MonthGrid({
  navDate,
  selectedKey,
  todayKey,
  eventMap,
  onSelect,
}: {
  navDate: Date;
  selectedKey: string | null;
  todayKey: string;
  eventMap: Record<string, CalEvent[]>;
  onSelect: (key: string) => void;
}) {
  const grid = useMemo(
    () => buildMonthGrid(navDate.getFullYear(), navDate.getMonth()),
    [navDate],
  );
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 8,
        }}
      >
        {DAY_ABBRS.map((d) => (
          <div
            key={d}
            className="f-sans"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--ink-ghost)",
              textAlign: "center",
              padding: "4px 0",
            }}
          >
            {d}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        {grid.flat().map((day, i) => {
          if (!day) return <DayCell key={`empty-${i}`} date={null} events={[]} isToday={false} isSelected={false} onClick={() => {}} />;
          const key = toDateKey(day);
          return (
            <DayCell
              key={key}
              date={day}
              events={eventMap[key] || []}
              isToday={key === todayKey}
              isSelected={key === selectedKey}
              onClick={() => onSelect(key)}
            />
          );
        })}
      </div>
    </div>
  );
}

function WeekStrip({
  navDate,
  todayKey,
  eventMap,
}: {
  navDate: Date;
  todayKey: string;
  eventMap: Record<string, CalEvent[]>;
}) {
  const days = useMemo(() => buildWeek(navDate), [navDate]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {days.map((d) => {
        const key = toDateKey(d);
        const events = eventMap[key] || [];
        const isToday = key === todayKey;
        const isPast = key < todayKey;
        const dayLabel = d.toLocaleDateString("en-ZA", { weekday: "long" });
        const dateLabel = d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
        return (
          <div
            key={key}
            className="cal-week-card"
            style={{
              background: isToday
                ? "color-mix(in oklch, var(--ember-wash) 70%, var(--surface))"
                : "var(--surface)",
              border: isToday
                ? "1px solid color-mix(in oklch, var(--ember) 32%, var(--line-soft))"
                : "1px solid var(--line-soft)",
              borderRadius: 16,
              padding: 16,
              boxShadow: "var(--lift-1)",
              opacity: isPast && !isToday ? 0.55 : 1,
              transition: "transform 180ms ease, box-shadow 180ms ease",
              ...(isToday ? { borderLeft: "3px solid var(--ember)" } : {}),
            }}
          >
            <div
              className="f-sans"
              style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: events.length > 0 ? 12 : 8 }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: isToday ? "var(--ember)" : "var(--ink)",
                }}
              >
                {dayLabel}
              </span>
              <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{dateLabel}</span>
              {isToday && (
                <span
                  style={{
                    background: "var(--ember)",
                    color: "var(--ember-ink)",
                    borderRadius: 999,
                    padding: "3px 8px 2px",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    lineHeight: 1,
                  }}
                >
                  Today
                </span>
              )}
              {events.length > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    color: "var(--ink-ghost)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {events.length}
                </span>
              )}
            </div>
            {events.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {events.map((ev) => (
                  <EventCard key={ev.id} event={ev} />
                ))}
              </div>
            ) : (
              <p
                className="f-serif"
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontStyle: "italic",
                  color: "var(--ink-ghost)",
                }}
              >
                Nothing scheduled.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MyDayList({
  todayKey,
  eventMap,
}: {
  todayKey: string;
  eventMap: Record<string, CalEvent[]>;
}) {
  // Today + next 13 days that have events. Today is always shown so the
  // page never collapses to "nothing".
  const buckets = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const out: { key: string; date: Date; events: CalEvent[] }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = toDateKey(d);
      const events = eventMap[key];
      if (events && events.length > 0) out.push({ key, date: d, events });
      else if (key === todayKey) out.push({ key, date: d, events: [] });
    }
    return out;
  }, [eventMap, todayKey]);

  if (buckets.length === 0) {
    return (
      <p
        className="f-serif"
        style={{
          fontSize: 14,
          fontStyle: "italic",
          color: "var(--ink-ghost)",
          padding: "32px 0",
          textAlign: "center",
          margin: 0,
        }}
      >
        Nothing in the next two weeks. A clean run.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {buckets.map(({ key, date, events }) => {
        const isToday = key === todayKey;
        const dayLabel = date.toLocaleDateString("en-ZA", { weekday: "long" });
        const dateLabel = date.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
        return (
          <div
            key={key}
            className="cal-week-card"
            style={{
              background: isToday
                ? "color-mix(in oklch, var(--ember-wash) 70%, var(--surface))"
                : "var(--surface)",
              border: isToday
                ? "1px solid color-mix(in oklch, var(--ember) 32%, var(--line-soft))"
                : "1px solid var(--line-soft)",
              borderRadius: 16,
              padding: 16,
              boxShadow: "var(--lift-1)",
              transition: "transform 180ms ease, box-shadow 180ms ease",
              ...(isToday ? { borderLeft: "3px solid var(--ember)" } : {}),
            }}
          >
            <div
              className="f-sans"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: events.length > 0 ? 12 : 8,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: isToday ? "var(--ember)" : "var(--ink)",
                }}
              >
                {dayLabel}
              </span>
              <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{dateLabel}</span>
              {isToday && (
                <span
                  style={{
                    background: "var(--ember)",
                    color: "var(--ember-ink)",
                    borderRadius: 999,
                    padding: "3px 8px 2px",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    lineHeight: 1,
                  }}
                >
                  Today
                </span>
              )}
              {events.length > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    color: "var(--ink-ghost)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {events.length}
                </span>
              )}
            </div>
            {events.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {events.map((ev) => (
                  <EventCard key={ev.id} event={ev} />
                ))}
              </div>
            ) : (
              <p
                className="f-serif"
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontStyle: "italic",
                  color: "var(--ink-ghost)",
                }}
              >
                {isToday ? "Free day." : "Nothing scheduled."}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function TodoCalendarTab({ entries, externalEvents, brainId, onAdded }: Props) {
  const [navDate, setNavDate] = useState(new Date());
  const todayKey = toDateKey(new Date());
  const [selectedKey, setSelectedKey] = useState<string | null>(todayKey);
  const [view, setView] = useState<ViewMode>("calendar");
  const [sheetOpen, setSheetOpen] = useState(false);
  const isDesktop = useIsDesktop(1024);
  const quickAddRef = useRef<HTMLDivElement | null>(null);

  // Build the event map once per inputs.
  const calEvents = useMemo(
    () => [...entriesToCalEvents(entries), ...externalToCalEvents(externalEvents)],
    [entries, externalEvents],
  );

  const year = navDate.getFullYear();
  const month = navDate.getMonth();

  const eventMap = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    calEvents.forEach((ev) => {
      const key = toDateKey(ev.start);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
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

  const selectedEvents = selectedKey ? eventMap[selectedKey] || [] : [];

  // ── Header navigation behaviour adapts to view mode ──
  const handlePrev = () => {
    if (view === "calendar") setNavDate(new Date(year, month - 1, 1));
    else if (view === "week") {
      const d = new Date(navDate);
      d.setDate(d.getDate() - 7);
      setNavDate(d);
    } else {
      const d = new Date(navDate);
      d.setDate(d.getDate() - 1);
      setNavDate(d);
    }
  };
  const handleNext = () => {
    if (view === "calendar") setNavDate(new Date(year, month + 1, 1));
    else if (view === "week") {
      const d = new Date(navDate);
      d.setDate(d.getDate() + 7);
      setNavDate(d);
    } else {
      const d = new Date(navDate);
      d.setDate(d.getDate() + 1);
      setNavDate(d);
    }
  };
  const handleToday = () => {
    const today = new Date();
    setNavDate(today);
    setSelectedKey(todayKey);
  };

  const headerTitle = useMemo(() => {
    if (view === "calendar") return `${MONTH_NAMES[month]} ${year}`;
    if (view === "week") {
      const days = buildWeek(navDate);
      const start = days[0];
      const end = days[6];
      const sameMonth = start.getMonth() === end.getMonth();
      return sameMonth
        ? `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`
        : `${MONTH_NAMES[start.getMonth()]} ${start.getDate()} – ${MONTH_NAMES[end.getMonth()]} ${end.getDate()}`;
    }
    return navDate.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });
  }, [view, month, year, navDate]);

  const handleSelect = (key: string) => {
    setSelectedKey(key);
    if (!isDesktop && view === "calendar") setSheetOpen(true);
  };

  const handleAddClick = () => {
    quickAddRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Focus the first input inside QuickAdd if one exists.
    const input = quickAddRef.current?.querySelector("input, textarea") as HTMLElement | null;
    setTimeout(() => input?.focus(), 250);
  };

  // ── Render ──
  return (
    <div className="cal-root" style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div ref={quickAddRef}>
        <QuickAdd brainId={brainId} onAdded={onAdded} />
      </div>

      {externalEvents.length === 0 && (
        <p
          className="f-sans"
          style={{
            fontSize: 11,
            color: "var(--ink-ghost)",
            margin: 0,
          }}
        >
          Connect Google or Outlook in{" "}
          <strong style={{ color: "var(--ink-soft)", fontWeight: 600 }}>
            Settings → Calendar Sync
          </strong>{" "}
          to see your events here.
        </p>
      )}

      <CalendarHeader
        title={headerTitle}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
      />

      <div style={{ display: "flex", justifyContent: "center" }}>
        <SegmentedControl value={view} onChange={setView} />
      </div>

      <div className="cal-body">
        <div className="cal-main">
          {view === "calendar" && (
            <MonthGrid
              navDate={navDate}
              selectedKey={selectedKey}
              todayKey={todayKey}
              eventMap={eventMap}
              onSelect={handleSelect}
            />
          )}
          {view === "week" && (
            <WeekStrip
              navDate={navDate}
              todayKey={todayKey}
              eventMap={eventMap}
            />
          )}
          {view === "myday" && (
            <MyDayList todayKey={todayKey} eventMap={eventMap} />
          )}
        </div>

        {/* Desktop side panel — only for the month grid; week and my-day
            views render their events inline. */}
        {isDesktop && view === "calendar" && selectedKey && (
          <SidePanel>
            <DayDetailContent
              date={parseISO(selectedKey + "T00:00:00")}
              events={selectedEvents}
              onClose={() => setSelectedKey(null)}
            />
          </SidePanel>
        )}
      </div>

      {/* Mobile bottom sheet — same content, slide-up presentation. */}
      {!isDesktop && view === "calendar" && (
        <BottomSheet open={sheetOpen && !!selectedKey} onClose={() => setSheetOpen(false)}>
          {selectedKey && (
            <DayDetailContent
              date={parseISO(selectedKey + "T00:00:00")}
              events={selectedEvents}
            />
          )}
        </BottomSheet>
      )}

      <FloatingActionButton onClick={handleAddClick} />

      <style>{`
        .cal-day:hover {
          transform: translateY(-1px);
          box-shadow: var(--lift-2);
        }
        .cal-day:focus-visible {
          outline: 2px solid var(--ember);
          outline-offset: 2px;
        }
        .cal-body {
          display: flex;
          gap: 20px;
          align-items: flex-start;
        }
        .cal-main {
          flex: 1;
          min-width: 0;
        }
        @keyframes cal-sheet-slide {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes cal-sheet-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @media (max-width: 1023px) {
          .cal-body { flex-direction: column; }
        }
      `}</style>
    </div>
  );
}
