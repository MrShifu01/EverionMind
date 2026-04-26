import { useRef, useState } from "react";
import { resolveIcon } from "../lib/typeIcons";
import { TC } from "../data/constants";
import { isDone } from "./todoUtils";
import { recordCompletion } from "../lib/karma";
import type { Entry } from "../types";
import type { useEntries } from "../context/EntriesContext";

type Ctx = ReturnType<typeof useEntries>;

const PRIORITY_COLOR: Record<string, string> = {
  p1: "var(--ember)",
  p2: "oklch(72% 0.16 68)",
  p3: "var(--ink-soft)",
  p4: "var(--ink-ghost)",
};

interface Props {
  entry: Entry;
  dateStr?: string;
  showDate?: boolean;
  showType?: boolean;
  showIcon?: boolean;
  typeIcons?: Record<string, string>;
  ctx: Ctx;
  onEdit?: (entry: Entry, rect: DOMRect) => void;
  onKarmaChange?: (points: number, streak: number) => void;
}

export default function TodoRowItem({
  entry,
  dateStr = "",
  showDate = false,
  showType = true,
  showIcon = true,
  typeIcons = {},
  ctx,
  onEdit,
  onKarmaChange,
}: Props) {
  const tc = TC[entry.type] || TC.note;
  const icon = resolveIcon(entry.type, typeIcons);
  const serverDone = isDone(entry);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const done = optimistic ?? serverDone;

  // Swipe state
  const pointerStartX = useRef(0);
  const pointerStartY = useRef(0);
  const [swipeX, setSwipeX] = useState(0);
  const [swipeState, setSwipeState] = useState<"idle" | "swiping-right" | "swiping-left" | "completing" | "rescheduling">("idle");
  const trackingRef = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);

  const priority = (entry.metadata as Record<string, unknown> | undefined)?.priority as string | undefined;
  const energy = (entry.metadata as Record<string, unknown> | undefined)?.energy as string | undefined;

  function toggleDone() {
    if (!ctx?.handleUpdate) return;
    setOptimistic(!done);
    ctx
      .handleUpdate(entry.id, {
        metadata: { ...(entry.metadata || {}), status: done ? "todo" : "done" },
      })
      .then(() => {
        if (!done) {
          const k = recordCompletion();
          onKarmaChange?.(k.points, k.streak);
        }
      })
      .catch(() => setOptimistic(null));
  }

  function onPointerDown(e: React.PointerEvent) {
    pointerStartX.current = e.clientX;
    pointerStartY.current = e.clientY;
    trackingRef.current = true;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!trackingRef.current) return;
    const dx = e.clientX - pointerStartX.current;
    const dy = Math.abs(e.clientY - pointerStartY.current);
    // If predominantly vertical, don't hijack scroll
    if (dy > Math.abs(dx) && Math.abs(dx) < 10) return;
    if (Math.abs(dx) > 30) {
      e.preventDefault();
      setSwipeX(Math.max(-120, Math.min(120, dx)));
      setSwipeState(dx > 0 ? "swiping-right" : "swiping-left");
    }
  }

  function onPointerUp() {
    if (!trackingRef.current) return;
    trackingRef.current = false;
    if (swipeState === "swiping-right" && swipeX >= 80) {
      setSwipeState("completing");
      setSwipeX(0);
      setTimeout(() => {
        toggleDone();
        setSwipeState("idle");
      }, 250);
    } else if (swipeState === "swiping-left" && swipeX <= -80) {
      setSwipeState("rescheduling");
      setSwipeX(0);
    } else {
      setSwipeState("idle");
      setSwipeX(0);
    }
  }

  function bumpDueDate() {
    if (!ctx?.handleUpdate) return;
    const current = (entry.metadata as Record<string, unknown>)?.due_date as string | undefined;
    const base = current ? new Date(current + "T12:00:00") : new Date();
    base.setDate(base.getDate() + 1);
    const next = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
    ctx.handleUpdate(entry.id, { metadata: { ...(entry.metadata || {}), due_date: next } }).catch(() => null);
    setSwipeState("idle");
  }

  const isCompleting = swipeState === "completing";
  const isRescheduling = swipeState === "rescheduling";

  return (
    <div
      ref={rowRef}
      style={{ position: "relative", overflow: "hidden" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* Swipe right background (complete) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--moss, oklch(62% 0.1 145))",
          display: "flex",
          alignItems: "center",
          paddingLeft: 16,
          opacity: swipeState === "swiping-right" ? Math.min(1, swipeX / 80) : isCompleting ? 1 : 0,
          transition: isCompleting ? "opacity 0.25s" : "none",
          pointerEvents: "none",
        }}
      >
        <span style={{ color: "#fff", fontSize: 16 }}>✓</span>
      </div>

      {/* Swipe left background (reschedule) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--ember)",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingRight: 16,
          opacity: swipeState === "swiping-left" ? Math.min(1, Math.abs(swipeX) / 80) : 0,
          pointerEvents: "none",
        }}
      >
        <span style={{ color: "var(--ember-ink)", fontSize: 13, fontWeight: 700 }}>+1d</span>
      </div>

      {/* Main row */}
      <div
        className="flex cursor-pointer items-center gap-3 py-2.5"
        style={{
          transform: isCompleting || isRescheduling ? "translateX(0)" : `translateX(${swipeX}px)`,
          transition: swipeX === 0 ? "transform 0.2s ease" : "none",
          background: "var(--surface)",
          position: "relative",
        }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          if (swipeX !== 0) return;
          onEdit?.(entry, e.currentTarget.getBoundingClientRect());
        }}
      >
        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleDone();
          }}
          className="flex shrink-0 items-center justify-center rounded-full border-2 transition-all"
          style={{
            width: 20,
            height: 20,
            minWidth: 20,
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

        {/* Priority dot */}
        {priority && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: PRIORITY_COLOR[priority] ?? "var(--ink-ghost)",
              flexShrink: 0,
            }}
          />
        )}

        {showIcon && icon && <span className="mt-0.5 shrink-0 text-base">{icon}</span>}

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
          {energy && (
            <p className="mt-0.5 text-[10px]" style={{ color: "var(--ink-ghost)" }}>
              {energy === "high" ? "⚡" : energy === "low" ? "🌿" : "〰️"} {energy} energy
            </p>
          )}
        </div>

        {(() => {
          const enr = (entry.metadata as any)?.enrichment ?? {};
          const pending = entry.type !== "secret" && !(enr.parsed === true && enr.has_insight === true && enr.concepts_extracted === true);
          return pending ? (
            <span className="enriching-dot" aria-label="AI processing" title="AI enriching…">
              <span /><span /><span />
            </span>
          ) : null;
        })()}
        {showDate && dateStr && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: "var(--ember-wash)", color: "var(--ember)" }}
          >
            {dateStr}
          </span>
        )}
        {showType && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
            style={{ background: `${tc.c}18`, color: tc.c }}
          >
            {entry.type}
          </span>
        )}
      </div>

      {/* Reschedule action chip */}
      {isRescheduling && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            paddingRight: 12,
            background: "var(--surface)",
          }}
        >
          <button
            onClick={bumpDueDate}
            style={{
              background: "var(--ember)",
              color: "var(--ember-ink)",
              borderRadius: 8,
              padding: "4px 12px",
              fontSize: 12,
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
            }}
          >
            +1 day
          </button>
          <button
            onClick={() => setSwipeState("idle")}
            style={{
              background: "var(--surface-high)",
              color: "var(--ink-soft)",
              borderRadius: 8,
              padding: "4px 10px",
              fontSize: 12,
              border: "none",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
