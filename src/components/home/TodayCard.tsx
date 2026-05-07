import { useEffect, useMemo } from "react";
import type { Entry } from "../../types";
import { authFetch } from "../../lib/authFetch";
import { useCachedQuery, invalidateCachedQuery } from "../../lib/useCachedQuery";
import {
  toDateKey,
  getActionPlacements,
  isDone,
  type ExternalCalEvent,
} from "../../views/todoUtils";

interface TodayCardProps {
  entries: Entry[];
  onNavigate: (view: string) => void;
}

function formatTimeOfDay(iso: string): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const hh = d.getHours();
  const mm = d.getMinutes();
  const ampm = hh >= 12 ? "pm" : "am";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  if (mm === 0) return `${h12}${ampm}`;
  return `${h12}:${String(mm).padStart(2, "0")}${ampm}`;
}

export default function TodayCard({ entries, onNavigate }: TodayCardProps) {
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const { data: cachedEvents, refetch: refetchEvents } = useCachedQuery<ExternalCalEvent[]>(
    "calendar:events:today",
    async () => {
      const r = await authFetch("/api/calendar?action=events");
      const d = await r?.json?.();
      return Array.isArray(d?.events) ? (d.events as ExternalCalEvent[]) : [];
    },
    { ttlMs: 5 * 60_000 },
  );
  // Pull-to-refresh subscriber — drop the TTL'd cache and refetch.
  useEffect(() => {
    function handle() {
      invalidateCachedQuery("calendar:events:today");
      void refetchEvents();
    }
    window.addEventListener("everion:pull-refresh", handle);
    return () => window.removeEventListener("everion:pull-refresh", handle);
  }, [refetchEvents]);
  // Stable reference — keep the same `[]` across renders when null so the
  // downstream useMemo dependency doesn't churn.
  const events = useMemo(() => cachedEvents ?? [], [cachedEvents]);

  // Today's todos = action-placed entries scheduled today, not done.
  const todayTodos = useMemo(
    () =>
      entries.filter((e) => !isDone(e) && getActionPlacements(e).includes(todayKey)).slice(0, 3),
    [entries, todayKey],
  );

  const todayEvents = useMemo(
    () =>
      events
        .filter((e) => toDateKey(new Date(e.start)) === todayKey)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
        .slice(0, 3),
    [events, todayKey],
  );

  const totalTodos = useMemo(
    () => entries.filter((e) => !isDone(e) && getActionPlacements(e).includes(todayKey)).length,
    [entries, todayKey],
  );
  const totalEvents = useMemo(
    () => events.filter((e) => toDateKey(new Date(e.start)) === todayKey).length,
    [events, todayKey],
  );

  if (todayTodos.length === 0 && todayEvents.length === 0) {
    // Nothing today — render a quiet, encouraging empty state instead of
    // hiding the card. Disappearing cards make the layout feel unstable.
    return (
      <section
        style={{
          background: "var(--surface-high)",
          border: "1px solid var(--line-soft)",
          borderRadius: 18,
          padding: "18px 22px",
          boxShadow: "var(--lift-1)",
        }}
      >
        <div
          className="f-serif"
          style={{ fontSize: 17, fontWeight: 450, color: "var(--ink)", marginBottom: 4 }}
        >
          today
        </div>
        <div
          className="f-serif"
          style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-soft)" }}
        >
          nothing on your plate. enjoy the breathing room.
        </div>
      </section>
    );
  }

  return (
    <section
      style={{
        background: "var(--surface-high)",
        border: "1px solid var(--line-soft)",
        borderRadius: 18,
        padding: "18px 22px 14px",
        boxShadow: "var(--lift-1)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div
          className="f-serif"
          style={{
            fontSize: 17,
            fontWeight: 450,
            color: "var(--ink)",
          }}
        >
          today
        </div>
        <button
          type="button"
          onClick={() => onNavigate("todos")}
          className="press f-sans"
          style={{
            background: "transparent",
            border: 0,
            color: "var(--ink-faint)",
            fontSize: 12,
            cursor: "pointer",
            padding: 4,
          }}
        >
          open schedule →
        </button>
      </div>

      <ul
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          listStyle: "none",
          padding: 0,
          margin: 0,
        }}
      >
        {todayEvents.map((ev) => {
          const time = ev.allDay ? "all day" : formatTimeOfDay(ev.start);
          return (
            <li key={`ev-${ev.id}`} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--moss)",
                  marginTop: 8,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="f-sans"
                  style={{
                    fontSize: 13,
                    color: "var(--ink)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ev.title || "(untitled event)"}
                </div>
                {time && (
                  <div
                    className="f-sans"
                    style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 1 }}
                  >
                    {time}
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {todayTodos.map((e) => (
          <li key={`td-${e.id}`} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span
              aria-hidden="true"
              style={{
                flexShrink: 0,
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--ember)",
                marginTop: 8,
              }}
            />
            <div
              className="f-sans"
              style={{
                fontSize: 13,
                color: "var(--ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {e.title || "(no title)"}
            </div>
          </li>
        ))}
      </ul>

      {(totalTodos > todayTodos.length || totalEvents > todayEvents.length) && (
        <button
          type="button"
          onClick={() => onNavigate("todos")}
          className="press f-sans"
          style={{
            marginTop: 8,
            background: "transparent",
            border: 0,
            color: "var(--ink-faint)",
            fontSize: 12,
            fontStyle: "italic",
            cursor: "pointer",
            padding: "4px 0",
          }}
        >
          + {totalTodos + totalEvents - todayTodos.length - todayEvents.length} more
        </button>
      )}
    </section>
  );
}
