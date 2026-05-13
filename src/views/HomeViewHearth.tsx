// HEARTH · Desktop home
// ─────────────────────────────────────────────────────────────────────
// Implements the Hearth variant from DesktopDesignInkwell:
//   - Center stage: drop/ask toggle + 280px metallic well (mobile orb at desktop scale)
//   - Right rail (320px): "today" stream of recent entries with brass-spine gutter
//   - Bottom strip: open threads as calm card faces
//
// Faithful to extracted/everionmobile/project/desktop-hearth.jsx with two
// substitutions per user direction:
//   1. The center well's clickable button uses the metallic silver palette
//      from MobileHome's <Inkwell> (BTN_ACCENT/BTN_DEEP = --silver-fixed /
//      --silver-deep-fixed) instead of the design file's ember-on-ember
//      button. The surrounding well rim stays ember per the design.
//   2. Mock data (RECENT_DESK, OPEN_THREADS) replaced with real entry data.
//
// Layout shell (sidebar + topbar) is the existing Everion chrome — no
// changes there. This file owns only the body of the home route.

import { useMemo } from "react";
import type { Entry } from "../types";

const ACCENT = "var(--ember)";
const BTN_ACCENT = "var(--silver-fixed)";
const BTN_DEEP = "var(--silver-deep-fixed)";
const BTN_GLYPH = "var(--orb-glyph)";

interface HomeViewHearthProps {
  entries: Entry[];
  brainName?: string;
  onOpenCapture: () => void;
  onNavigate: (view: string) => void;
  onSelectEntry: (entry: Entry) => void;
}

export default function HomeViewHearth({
  entries,
  brainName,
  onOpenCapture,
  onNavigate,
  onSelectEntry,
}: HomeViewHearthProps) {
  // "Today" rail shows the 4 most recent non-secret entries — same
  // density as the design (4 cards visible above the fold).
  const todayEntries = useMemo(
    () =>
      entries
        .filter((e) => e.type !== "secret")
        .slice(0, 4)
        .map((e) => ({
          id: e.id,
          entry: e,
          time: formatRelative(e.created_at),
          tag: (e.tags?.[0] || e.type || "note").toUpperCase().slice(0, 12),
          body: e.content?.trim() || e.title || "",
          important: !!e.metadata?.important || !!e.pinned,
        })),
    [entries],
  );

  // Real threads aren't wired through the home route yet — show the 4
  // most-tagged entries as "open threads" placeholders. When the threads
  // feature ships properly this map becomes the real source.
  const threadsByTag = useMemo(() => {
    const map = new Map<string, { count: number; lastAt: number; sample: Entry }>();
    for (const e of entries) {
      for (const t of e.tags || []) {
        const cur = map.get(t);
        const at = e.created_at ? new Date(e.created_at).getTime() : 0;
        if (!cur || at > cur.lastAt) {
          map.set(t, { count: (cur?.count ?? 0) + 1, lastAt: at, sample: e });
        } else {
          cur.count++;
        }
      }
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [entries]);

  const total = entries.length;
  const today = new Date();
  const dateLine = `${today.toLocaleDateString("en-ZA", { weekday: "long", month: "long", day: "numeric" }).toLowerCase()} · ${total} in the well`;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {/* Center stage */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: "26px 36px 0",
            minWidth: 0,
            position: "relative",
          }}
        >
          <HearthInkwell dateLine={dateLine} brainName={brainName} onOpen={onOpenCapture} />
        </div>

        {/* Right today rail */}
        <HearthTodayRail
          items={todayEntries}
          totalCount={total}
          onSelect={onSelectEntry}
          onOpenMemory={() => onNavigate("memory")}
        />
      </div>

      {/* Bottom open-threads strip */}
      <HearthThreadStrip threads={threadsByTag} onOpenMemory={() => onNavigate("memory")} />
    </div>
  );
}

// ─── Inkwell (center stage) ──────────────────────────────────────────

function HearthInkwell({
  dateLine,
  brainName,
  onOpen,
}: {
  dateLine: string;
  brainName?: string;
  onOpen: () => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        position: "relative",
      }}
    >
      {/* Ambient brass glow behind the well */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          width: 620,
          height: 620,
          borderRadius: "50%",
          background: `radial-gradient(circle, color-mix(in oklch, ${ACCENT} 14%, transparent), transparent 65%)`,
          filter: "blur(40px)",
          pointerEvents: "none",
        }}
      />

      <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
        <div
          className="f-mono"
          style={{
            fontSize: 10.5,
            letterSpacing: "0.28em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
            marginBottom: 14,
          }}
        >
          {dateLine}
        </div>
        <div
          className="f-serif"
          style={{ fontSize: 56, color: "var(--ink)", letterSpacing: "-0.025em", lineHeight: 1.0 }}
        >
          <span style={{ fontStyle: "italic", color: "var(--ember)" }}>Drop</span> a thought.
        </div>
        {brainName && (
          <div
            className="f-serif"
            style={{
              fontSize: 14,
              color: "var(--ink-faint)",
              fontStyle: "italic",
              marginTop: 10,
            }}
          >
            into{" "}
            <span style={{ color: "var(--ink-soft)", fontStyle: "normal", fontWeight: 500 }}>
              {brainName}
            </span>
          </div>
        )}
      </div>

      {/* The well — 280px ember rim with metallic silver button at center */}
      <DesktopWell onClick={onOpen} />

      <div
        className="f-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          color: "var(--ink-faint)",
          textTransform: "uppercase",
          position: "relative",
          zIndex: 1,
        }}
      >
        tap the well · or just start typing
      </div>
    </div>
  );
}

function DesktopWell({ onClick }: { onClick: () => void }) {
  return (
    <div style={{ position: "relative", width: 280, height: 280 }}>
      {/* Outer ember rim */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 28%,
            color-mix(in oklch, ${ACCENT} 28%, var(--surface)) 0%,
            var(--surface) 48%,
            var(--surface-low) 100%)`,
          border: `1px solid color-mix(in oklch, ${ACCENT} 42%, transparent)`,
          boxShadow: "var(--lift-3), inset 0 -10px 22px var(--scrim)",
        }}
      />
      {/* Inner ring */}
      <div
        style={{
          position: "absolute",
          inset: 22,
          borderRadius: "50%",
          border: `1.5px solid color-mix(in oklch, ${ACCENT} 55%, transparent)`,
          background: "var(--surface-dim)",
          boxShadow: "inset 0 5px 18px oklch(4% 0.01 250 / 0.8)",
        }}
      />
      {/* Metallic silver button (mobile orb palette) */}
      <button
        type="button"
        aria-label="Drop a thought"
        onClick={onClick}
        style={{
          position: "absolute",
          inset: 50,
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 30%,
            color-mix(in oklch, ${BTN_ACCENT} 55%, ${BTN_DEEP}) 0%,
            color-mix(in oklch, ${BTN_ACCENT} 30%, ${BTN_DEEP}) 50%,
            ${BTN_DEEP} 100%)`,
          border: `1px solid color-mix(in oklch, ${BTN_ACCENT} 70%, transparent)`,
          cursor: "pointer",
          padding: 0,
          boxShadow: `
            inset 0 1px 0 color-mix(in oklch, ${BTN_ACCENT} 85%, white),
            inset 0 -8px 18px color-mix(in oklch, ${BTN_DEEP} 80%, transparent),
            0 0 36px color-mix(in oklch, ${BTN_ACCENT} 32%, transparent),
            var(--lift-2)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          transition: "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
        onMouseDown={(e) => {
          (e.currentTarget as HTMLElement).style.transform = "scale(0.96)";
        }}
        onMouseUp={(e) => {
          (e.currentTarget as HTMLElement).style.transform = "scale(1)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.transform = "scale(1)";
        }}
      >
        {/* Specular highlight */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: "14%",
            left: "22%",
            width: "44%",
            height: "22%",
            background: `radial-gradient(ellipse, color-mix(in oklch, white 32%, ${BTN_ACCENT}) 0%, transparent 70%)`,
            filter: "blur(4px)",
            opacity: 0.85,
            borderRadius: "50%",
          }}
        />
        {/* Engraved glyph */}
        <span
          className="f-serif"
          style={{
            position: "relative",
            zIndex: 1,
            fontSize: 60,
            fontWeight: 600,
            color: BTN_GLYPH,
            lineHeight: 1,
            textShadow: `0 1px 2px color-mix(in oklch, ${BTN_DEEP} 60%, transparent)`,
          }}
        >
          +
        </span>
      </button>
    </div>
  );
}

// ─── Today rail (right) ──────────────────────────────────────────────

function HearthTodayRail({
  items,
  totalCount,
  onSelect,
  onOpenMemory,
}: {
  items: Array<{
    id: string;
    entry: Entry;
    time: string;
    tag: string;
    body: string;
    important: boolean;
  }>;
  totalCount: number;
  onSelect: (entry: Entry) => void;
  onOpenMemory: () => void;
}) {
  return (
    <aside
      style={{
        width: 320,
        flexShrink: 0,
        borderLeft: "1px solid var(--line-soft)",
        background: "color-mix(in oklch, var(--surface-low) 50%, var(--bg))",
        padding: "26px 22px 26px 26px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div
            className="f-mono"
            style={{
              fontSize: 9.5,
              letterSpacing: "0.22em",
              color: "var(--ink-faint)",
              textTransform: "uppercase",
            }}
          >
            today
          </div>
          <div
            className="f-serif"
            style={{
              fontSize: 22,
              color: "var(--ink)",
              letterSpacing: "-0.02em",
              marginTop: 2,
            }}
          >
            What you've <span style={{ fontStyle: "italic", color: "var(--ember)" }}>kept</span>
          </div>
        </div>
        <span
          className="f-mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.16em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
          }}
        >
          {items.length} · today
        </span>
      </div>

      {/* Brass spine */}
      <div style={{ position: "relative", paddingLeft: 22, marginTop: 4 }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 4,
            bottom: 4,
            left: 6,
            width: 1,
            background:
              "linear-gradient(to bottom, transparent, color-mix(in oklch, var(--ember) 40%, var(--line)) 8%, var(--line) 70%, transparent)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.length === 0 && (
            <div
              className="f-serif"
              style={{
                fontStyle: "italic",
                color: "var(--ink-faint)",
                fontSize: 13,
                padding: "20px 0",
              }}
            >
              nothing kept today yet.
            </div>
          )}
          {items.map((e) => (
            <TodayItem key={e.id} item={e} onSelect={() => onSelect(e.entry)} />
          ))}
        </div>
      </div>

      <button
        onClick={onOpenMemory}
        style={{
          marginTop: 4,
          padding: "10px 12px",
          background: "transparent",
          border: "1px dashed var(--line)",
          borderRadius: 10,
          color: "var(--ink-soft)",
          cursor: "pointer",
          fontFamily: "var(--f-mono)",
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        open the well · {totalCount} →
      </button>
    </aside>
  );
}

function TodayItem({
  item,
  onSelect,
}: {
  item: {
    time: string;
    tag: string;
    body: string;
    important: boolean;
  };
  onSelect: () => void;
}) {
  return (
    <article
      onClick={onSelect}
      style={{
        position: "relative",
        padding: "12px 14px",
        background: "var(--surface)",
        border: "1px solid var(--line-soft)",
        borderRadius: 12,
        cursor: "pointer",
        transition: "transform 140ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
      onMouseDown={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(1px) scale(0.99)";
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(0) scale(1)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(0) scale(1)";
      }}
    >
      {/* Clasp */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 16,
          left: -22,
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: item.important
            ? "radial-gradient(circle at 35% 30%, color-mix(in oklch, var(--ember) 70%, white), var(--ember-deep))"
            : "var(--surface-high)",
          border: `1px solid color-mix(in oklch, var(--ember) ${item.important ? 80 : 38}%, transparent)`,
          boxShadow: item.important
            ? "0 0 10px color-mix(in oklch, var(--ember) 55%, transparent)"
            : "var(--lift-1)",
        }}
      />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
        <span
          className="f-mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
          }}
        >
          {item.time}
        </span>
        <span
          className="f-mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            color: "var(--ember)",
            textTransform: "uppercase",
            padding: "2px 6px",
            background: "var(--ember-wash, color-mix(in oklch, var(--ember) 14%, transparent))",
            borderRadius: 4,
            border: "1px solid color-mix(in oklch, var(--ember) 28%, transparent)",
          }}
        >
          {item.tag}
        </span>
      </div>
      <div
        className="f-serif"
        style={{
          fontSize: 13.5,
          color: "var(--ink)",
          lineHeight: 1.42,
          letterSpacing: "-0.005em",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {item.body}
      </div>
    </article>
  );
}

// ─── Thread strip (bottom) ───────────────────────────────────────────

function HearthThreadStrip({
  threads,
  onOpenMemory,
}: {
  threads: Array<{ name: string; count: number; lastAt: number }>;
  onOpenMemory: () => void;
}) {
  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: "1px solid var(--line-soft)",
        background: "color-mix(in oklch, var(--surface-low) 40%, var(--bg))",
        padding: "20px 36px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span
            className="f-mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.24em",
              color: "var(--ink-faint)",
              textTransform: "uppercase",
            }}
          >
            open threads
          </span>
          <span
            className="f-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.18em",
              color: "var(--ember)",
              textTransform: "uppercase",
            }}
          >
            · {threads.length} active
          </span>
        </div>
        <button
          onClick={onOpenMemory}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--f-mono)",
            fontSize: 9.5,
            letterSpacing: "0.18em",
            color: "var(--ink-ghost)",
            textTransform: "uppercase",
          }}
        >
          all →
        </button>
      </div>
      <div style={{ display: "flex", gap: 12, overflowX: "auto" }}>
        {threads.map((t, i) => (
          <ThreadCard key={t.name} t={t} index={i} />
        ))}
        <button
          onClick={onOpenMemory}
          style={{
            width: 132,
            height: 132,
            flexShrink: 0,
            background: "transparent",
            border: "1px dashed var(--line)",
            borderRadius: 14,
            color: "var(--ink-faint)",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 22,
              fontFamily: "var(--f-serif)",
              fontWeight: 300,
              lineHeight: 1,
            }}
          >
            +
          </span>
          <span
            className="f-mono"
            style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase" }}
          >
            new thread
          </span>
        </button>
      </div>
    </div>
  );
}

const THREAD_PALETTE = [
  { color: "oklch(72% 0.09 320)", glyph: "✦" },
  { color: "oklch(76% 0.105 82)", glyph: "●" },
  { color: "oklch(68% 0.09 152)", glyph: "❋" },
  { color: "oklch(70% 0.08 200)", glyph: "▲" },
];

function ThreadCard({
  t,
  index,
}: {
  t: { name: string; count: number; lastAt: number };
  index: number;
}) {
  const palette = THREAD_PALETTE[index % THREAD_PALETTE.length];
  const last = formatRelative(t.lastAt);
  return (
    <button
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: 220,
        height: 132,
        padding: "14px 16px",
        background: "var(--surface)",
        border: "1px solid var(--line-soft)",
        borderRadius: 14,
        cursor: "pointer",
        textAlign: "left",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: -20,
          right: -20,
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: `radial-gradient(circle, color-mix(in oklch, ${palette.color} 22%, transparent), transparent 65%)`,
          filter: "blur(10px)",
          pointerEvents: "none",
        }}
      />
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: `color-mix(in oklch, ${palette.color} 22%, var(--surface-low))`,
          border: `1px solid color-mix(in oklch, ${palette.color} 60%, transparent)`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: palette.color,
          fontSize: 12,
        }}
      >
        {palette.glyph}
      </span>
      <div
        className="f-serif"
        style={{
          fontSize: 17,
          color: "var(--ink)",
          letterSpacing: "-0.015em",
          lineHeight: 1.15,
        }}
      >
        #{t.name}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginTop: "auto",
        }}
      >
        <span
          className="f-mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            color: "var(--ember)",
            textTransform: "uppercase",
          }}
        >
          {t.count} mem
        </span>
        <span
          className="f-mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.16em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
          }}
        >
          {last}
        </span>
      </div>
    </button>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────

function formatRelative(input: string | number | undefined): string {
  if (!input) return "—";
  const t = typeof input === "number" ? input : new Date(input).getTime();
  if (!Number.isFinite(t) || t === 0) return "—";
  const diff = Date.now() - t;
  if (diff < 0) return "now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"}`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w} wk`;
  return new Date(t).toLocaleDateString("en-ZA", { month: "short", day: "numeric" });
}
