// ATELIER · Desktop memory
// ─────────────────────────────────────────────────────────────────────
// Implements the Atelier variant from DesktopDesignInkwell:
//   - Filter rail (top): pill chips (All / Today / This week / Important /
//     Voice / Drafts) + sort + view toggle (Spread / Stream)
//   - Main: 3-col masonry of MemoryCard with brass-spine gutter, ember
//     clasps on important entries, blue clasps on voice notes, mono
//     time + tag, serif body
//   - Right rail (280px): selected-memory Inspector + Month index +
//     Tag cloud
//
// Faithful to extracted/everionmobile/project/desktop-atelier.jsx with
// mock arrays (ATELIER_MEMORIES, A_FILTERS, A_TAGS) replaced by real
// entry data + month/tag aggregations.

import { useMemo, useState } from "react";
import type { Entry } from "../types";
import { startViewTransition } from "../lib/viewTransitions";

const ACCENT = "var(--ember)";

interface MemoryViewAtelierProps {
  entries: Entry[];
  onSelect: (entry: Entry) => void;
  searchInput: string;
  onSearchChange: (s: string) => void;
}

type FilterKey = "all" | "today" | "week" | "important" | "voice" | "drafts";
type ViewMode = "spread" | "stream";
type SortMode = "newest" | "oldest" | "important";

const FILTERS: Array<{ id: FilterKey; label: string }> = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "important", label: "Important" },
  { id: "voice", label: "Voice" },
  { id: "drafts", label: "Drafts" },
];

export default function MemoryViewAtelier({
  entries,
  onSelect,
  searchInput,
  onSearchChange,
}: MemoryViewAtelierProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("spread");
  const [sort, setSort] = useState<SortMode>("newest");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── Filter / sort / search pipeline ────────────────────────────────
  const filteredEntries = useMemo(() => {
    let list = entries.filter((e) => e.type !== "secret");

    const q = searchInput.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.title?.toLowerCase().includes(q) ||
          e.content?.toLowerCase().includes(q) ||
          e.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    if (filter === "today") {
      list = list.filter((e) => e.created_at && now - new Date(e.created_at).getTime() < dayMs);
    } else if (filter === "week") {
      list = list.filter((e) => e.created_at && now - new Date(e.created_at).getTime() < 7 * dayMs);
    } else if (filter === "important") {
      list = list.filter((e) => e.pinned || e.metadata?.important);
    } else if (filter === "voice") {
      list = list.filter((e) => {
        const src = e.metadata?.source;
        return (
          (typeof src === "string" && /voice/i.test(src)) ||
          e.type === "voice" ||
          e.metadata?.is_voice_note
        );
      });
    } else if (filter === "drafts") {
      list = list.filter((e) => !e.embedded_at);
    }

    list.sort((a, b) => {
      if (sort === "important") {
        const ai = a.pinned || a.metadata?.important ? 1 : 0;
        const bi = b.pinned || b.metadata?.important ? 1 : 0;
        if (ai !== bi) return bi - ai;
      }
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sort === "oldest" ? at - bt : bt - at;
    });

    return list;
  }, [entries, filter, searchInput, sort]);

  // ── Month aggregation for the rail ─────────────────────────────────
  const months = useMemo(() => {
    const map = new Map<string, { count: number; key: string; year: number; month: number }>();
    const fmt = new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric" });
    for (const e of entries) {
      if (!e.created_at) continue;
      const d = new Date(e.created_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const cur = map.get(key);
      if (cur) {
        cur.count++;
      } else {
        map.set(key, { count: 1, key: fmt.format(d), year: d.getFullYear(), month: d.getMonth() });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .slice(0, 6);
  }, [entries]);

  // ── Tag cloud aggregation ──────────────────────────────────────────
  const tags = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      for (const t of e.tags || []) {
        map.set(t, (map.get(t) ?? 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [entries]);

  const importantCount = useMemo(
    () => filteredEntries.filter((e) => e.pinned || e.metadata?.important).length,
    [filteredEntries],
  );

  const selectedEntry = useMemo(
    () => filteredEntries.find((e) => e.id === selectedId) || null,
    [filteredEntries, selectedId],
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <FilterRail
        filter={filter}
        setFilter={(f) => startViewTransition(() => setFilter(f))}
        viewMode={viewMode}
        setViewMode={(v) => startViewTransition(() => setViewMode(v))}
        sort={sort}
        setSort={(s) => startViewTransition(() => setSort(s))}
        searchInput={searchInput}
        onSearchChange={onSearchChange}
      />
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
          <AtelierSpread
            entries={filteredEntries}
            totalEntries={entries.length}
            visibleCount={filteredEntries.length}
            importantCount={importantCount}
            selectedId={selectedId}
            onSelect={(entry) => {
              setSelectedId(entry.id);
              onSelect(entry);
            }}
            viewMode={viewMode}
          />
        </div>
        <AtelierRail entry={selectedEntry} months={months} tags={tags} />
      </div>
    </div>
  );
}

// ─── Filter rail ─────────────────────────────────────────────────────

function FilterRail({
  filter,
  setFilter,
  viewMode,
  setViewMode,
  sort,
  setSort,
  searchInput,
  onSearchChange,
}: {
  filter: FilterKey;
  setFilter: (f: FilterKey) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  sort: SortMode;
  setSort: (s: SortMode) => void;
  searchInput: string;
  onSearchChange: (s: string) => void;
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortLabel =
    sort === "newest" ? "newest first" : sort === "oldest" ? "oldest first" : "important first";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "18px 36px",
        borderBottom: "1px solid var(--line-soft)",
        background: "color-mix(in oklch, var(--surface-low) 40%, var(--bg))",
      }}
    >
      <div style={{ display: "flex", gap: 6, flex: 1, overflowX: "auto" }}>
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: "7px 14px",
                background: active
                  ? "color-mix(in oklch, var(--ember) 14%, transparent)"
                  : "var(--surface)",
                border: `1px solid ${active ? "color-mix(in oklch, var(--ember) 40%, transparent)" : "var(--line-soft)"}`,
                borderRadius: 999,
                cursor: "pointer",
                color: active ? "var(--ember)" : "var(--ink-soft)",
                fontFamily: "var(--f-mono)",
                fontSize: 9.5,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 600,
                flexShrink: 0,
                transition: "background 160ms, color 160ms, border-color 160ms",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 32,
          padding: "0 10px",
          background: "var(--surface)",
          border: "1px solid var(--line-soft)",
          borderRadius: 8,
          width: 220,
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--ink-faint)" }}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="search the well…"
          className="f-serif"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--ink)",
            fontSize: 13,
            fontStyle: searchInput ? "normal" : "italic",
          }}
        />
      </div>

      {/* Sort */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
        <span
          className="f-mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
          }}
        >
          sort
        </span>
        <button
          onClick={() => setSortOpen((o) => !o)}
          style={{
            padding: "6px 11px",
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            borderRadius: 8,
            color: "var(--ink)",
            fontFamily: "var(--f-sans)",
            fontSize: 12,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {sortLabel}
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {sortOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 4,
              background: "var(--surface-high)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: 4,
              boxShadow: "var(--lift-2)",
              zIndex: 10,
              minWidth: 160,
            }}
          >
            {(["newest", "oldest", "important"] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSort(s);
                  setSortOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px 12px",
                  background:
                    sort === s
                      ? "color-mix(in oklch, var(--ember) 8%, transparent)"
                      : "transparent",
                  border: "none",
                  borderRadius: 6,
                  color: sort === s ? "var(--ember)" : "var(--ink)",
                  fontFamily: "var(--f-sans)",
                  fontSize: 12,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {s === "newest"
                  ? "newest first"
                  : s === "oldest"
                    ? "oldest first"
                    : "important first"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* View toggle */}
      <div
        style={{
          display: "flex",
          padding: 3,
          background: "var(--surface-low)",
          border: "1px solid var(--line-soft)",
          borderRadius: 8,
        }}
      >
        {(["spread", "stream"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setViewMode(v)}
            style={{
              padding: "5px 10px",
              background: viewMode === v ? "var(--surface)" : "transparent",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              color: viewMode === v ? "var(--ember)" : "var(--ink-faint)",
              fontFamily: "var(--f-sans)",
              fontSize: 11.5,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              textTransform: "capitalize",
            }}
          >
            {v === "spread" ? (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="4" width="7" height="7" rx="1.5" />
                <rect x="13" y="4" width="7" height="7" rx="1.5" />
                <rect x="4" y="13" width="7" height="7" rx="1.5" />
                <rect x="13" y="13" width="7" height="7" rx="1.5" />
              </svg>
            ) : (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12 12 3h8v8l-9 9z" />
              </svg>
            )}
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Spread (main) ───────────────────────────────────────────────────

function AtelierSpread({
  entries,
  totalEntries,
  visibleCount,
  importantCount,
  selectedId,
  onSelect,
  viewMode,
}: {
  entries: Entry[];
  totalEntries: number;
  visibleCount: number;
  importantCount: number;
  selectedId: string | null;
  onSelect: (entry: Entry) => void;
  viewMode: ViewMode;
}) {
  const today = new Date();
  const dateLine = today
    .toLocaleDateString("en-ZA", { weekday: "long", month: "long", day: "numeric" })
    .toLowerCase();
  const summary = `${totalEntries} pooled · ${visibleCount} showing · ${importantCount} important`;

  return (
    <div style={{ position: "relative", padding: "26px 36px 26px 50px" }}>
      {/* Brass spine */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 20,
          bottom: 20,
          left: 28,
          width: 1,
          background:
            "linear-gradient(to bottom, transparent, color-mix(in oklch, var(--ember) 38%, var(--line)) 4%, var(--line) 70%, transparent)",
        }}
      />

      {/* Date header */}
      <div style={{ marginBottom: 18 }}>
        <div
          className="f-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.24em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
          }}
        >
          {dateLine}
        </div>
        <div
          className="f-serif"
          style={{
            fontSize: 36,
            color: "var(--ink)",
            letterSpacing: "-0.025em",
            marginTop: 4,
            lineHeight: 1,
          }}
        >
          Your <span style={{ fontStyle: "italic", color: ACCENT }}>memories</span>
        </div>
        <div
          className="f-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.2em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
            marginTop: 6,
          }}
        >
          {summary}
        </div>
      </div>

      {entries.length === 0 ? (
        <div
          className="f-serif"
          style={{
            fontStyle: "italic",
            color: "var(--ink-faint)",
            fontSize: 16,
            padding: "60px 20px",
            textAlign: "center",
          }}
        >
          nothing matches this filter yet.
        </div>
      ) : viewMode === "spread" ? (
        <div style={{ columnCount: 3, columnGap: 16 }}>
          {entries.map((e) => (
            <MemoryCard
              key={e.id}
              entry={e}
              selected={selectedId === e.id}
              onClick={() => onSelect(e)}
            />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {entries.map((e) => (
            <MemoryCard
              key={e.id}
              entry={e}
              selected={selectedId === e.id}
              onClick={() => onSelect(e)}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MemoryCard({
  entry,
  selected,
  onClick,
  compact = false,
}: {
  entry: Entry;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const important = !!entry.pinned || !!entry.metadata?.important;
  const src = entry.metadata?.source;
  const voice =
    entry.type === "voice" ||
    (typeof src === "string" && /voice/i.test(src)) ||
    !!entry.metadata?.is_voice_note;
  const tag = (entry.tags?.[0] || entry.type || "note").toUpperCase().slice(0, 14);
  const time = formatTimeStamp(entry.created_at);
  const body = (entry.content || entry.title || "").trim();

  return (
    <article
      onClick={onClick}
      data-entry-id={entry.id}
      style={{
        position: "relative",
        padding: compact ? "13px 14px" : "16px 18px",
        background: selected
          ? "color-mix(in oklch, var(--ember) 6%, var(--surface))"
          : "var(--surface)",
        border: `1px solid ${selected ? "color-mix(in oklch, var(--ember) 38%, var(--line-soft))" : "var(--line-soft)"}`,
        borderRadius: 12,
        cursor: "pointer",
        breakInside: "avoid",
        marginBottom: compact ? 0 : 14,
        boxShadow: selected
          ? "0 0 0 4px color-mix(in oklch, var(--ember) 10%, transparent), var(--lift-1)"
          : "none",
        transition: "border-color 200ms, background 200ms",
        // Shared-element morph anchor to DetailModal (uses the same name).
        viewTransitionName: `entry-${entry.id}`,
      }}
    >
      {/* Clasp on left edge */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 18,
          left: -7,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: important
            ? "radial-gradient(circle at 35% 30%, color-mix(in oklch, var(--ember) 75%, white), var(--ember-deep))"
            : voice
              ? "color-mix(in oklch, oklch(70% 0.08 200) 40%, var(--surface-high))"
              : "var(--surface-high)",
          border: `1px solid color-mix(in oklch, ${voice ? "oklch(70% 0.08 200)" : "var(--ember)"} ${important ? 80 : 38}%, transparent)`,
          boxShadow: important
            ? "0 0 8px color-mix(in oklch, var(--ember) 50%, transparent)"
            : "var(--lift-1)",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          className="f-mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
          }}
        >
          {time}
        </span>
        <span
          className="f-mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            color: ACCENT,
            textTransform: "uppercase",
            padding: "2px 6px",
            background: "color-mix(in oklch, var(--ember) 14%, transparent)",
            borderRadius: 4,
            border: "1px solid color-mix(in oklch, var(--ember) 28%, transparent)",
            flexShrink: 0,
          }}
        >
          {tag}
        </span>
      </div>

      <div
        className="f-serif"
        style={{
          fontSize: compact ? 13.5 : 14.5,
          color: "var(--ink)",
          lineHeight: 1.45,
          letterSpacing: "-0.005em",
          display: "-webkit-box",
          WebkitLineClamp: compact ? 3 : 6,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {body}
      </div>

      {voice && (
        <div
          style={{
            marginTop: 10,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 8px",
            background: "var(--surface-low)",
            border: "1px solid var(--line-soft)",
            borderRadius: 999,
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--ink-faint)" }}
          >
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
          <span
            className="f-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.16em",
              color: "var(--ink-faint)",
              textTransform: "uppercase",
            }}
          >
            voice
          </span>
        </div>
      )}
    </article>
  );
}

// ─── Right rail ──────────────────────────────────────────────────────

function AtelierRail({
  entry,
  months,
  tags,
}: {
  entry: Entry | null;
  months: Array<{ key: string; count: number; year: number; month: number }>;
  tags: Array<{ name: string; count: number }>;
}) {
  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        borderLeft: "1px solid var(--line-soft)",
        background: "color-mix(in oklch, var(--surface-low) 50%, var(--bg))",
        padding: "26px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        overflowY: "auto",
      }}
    >
      <Inspector entry={entry} />
      <MonthIndex months={months} />
      <TagCloud tags={tags} />
    </aside>
  );
}

function Inspector({ entry }: { entry: Entry | null }) {
  if (!entry) {
    return (
      <div
        style={{
          padding: "32px 20px",
          textAlign: "center",
          color: "var(--ink-faint)",
        }}
      >
        <div className="f-serif" style={{ fontSize: 16, fontStyle: "italic", marginBottom: 8 }}>
          nothing selected
        </div>
        <div
          className="f-mono"
          style={{
            fontSize: 9.5,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          pick a memory →
        </div>
      </div>
    );
  }

  const wordCount = (entry.content || "").trim().split(/\s+/).filter(Boolean).length;
  const time = formatTimeStamp(entry.created_at);
  const tag = (entry.tags?.[0] || entry.type || "note").toUpperCase().slice(0, 14);

  return (
    <div>
      <div
        className="f-mono"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.22em",
          color: "var(--ink-faint)",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        selected
      </div>
      <div
        style={{
          padding: "14px 16px",
          background: "var(--surface)",
          border: "1px solid color-mix(in oklch, var(--ember) 28%, var(--line-soft))",
          borderRadius: 12,
          boxShadow: "0 0 0 4px color-mix(in oklch, var(--ember) 8%, transparent)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span
            className="f-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.18em",
              color: "var(--ink-faint)",
              textTransform: "uppercase",
            }}
          >
            {time}
          </span>
          <span
            className="f-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.18em",
              color: ACCENT,
              textTransform: "uppercase",
              padding: "2px 6px",
              background: "color-mix(in oklch, var(--ember) 14%, transparent)",
              borderRadius: 4,
              border: "1px solid color-mix(in oklch, var(--ember) 28%, transparent)",
            }}
          >
            {tag}
          </span>
        </div>
        {entry.title && (
          <div
            className="f-serif"
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: "var(--ink)",
              letterSpacing: "-0.015em",
              marginBottom: 6,
            }}
          >
            {entry.title}
          </div>
        )}
        <div
          className="f-serif"
          style={{
            fontSize: 13.5,
            color: "var(--ink-soft)",
            lineHeight: 1.55,
            display: "-webkit-box",
            WebkitLineClamp: 8,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {entry.content}
        </div>
        <div
          style={{
            margin: "14px 0 10px",
            color: "var(--ink-faint)",
            letterSpacing: "0.4em",
            fontFamily: "var(--f-mono)",
            fontSize: 12,
          }}
        >
          ···
        </div>
        <div
          className="f-mono"
          style={{
            fontSize: 9.5,
            letterSpacing: "0.16em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
          }}
        >
          {wordCount} word{wordCount === 1 ? "" : "s"} · {entry.tags?.length ?? 0} tag
          {(entry.tags?.length ?? 0) === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}

function MonthIndex({
  months,
}: {
  months: Array<{ key: string; count: number; year: number; month: number }>;
}) {
  if (months.length === 0) return null;
  return (
    <div>
      <div
        className="f-mono"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.22em",
          color: "var(--ink-faint)",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        months
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {months.map((m, i) => {
          const active = i === 0;
          return (
            <button
              key={m.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                background: active
                  ? "color-mix(in oklch, var(--ember) 6%, var(--surface))"
                  : "transparent",
                border: `1px solid ${active ? "color-mix(in oklch, var(--ember) 30%, transparent)" : "transparent"}`,
                borderRadius: 8,
                cursor: "pointer",
                color: active ? "var(--ink)" : "var(--ink-soft)",
                fontFamily: "var(--f-sans)",
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                textAlign: "left",
              }}
            >
              <span>{m.key}</span>
              <span
                className="f-mono"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.18em",
                  color: active ? ACCENT : "var(--ink-faint)",
                  textTransform: "uppercase",
                }}
              >
                {m.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const TAG_PALETTE = [
  "var(--ember)",
  "oklch(72% 0.09 320)",
  "oklch(68% 0.09 152)",
  "oklch(70% 0.08 200)",
  "oklch(74% 0.09 70)",
  "oklch(70% 0.085 256)",
  "oklch(72% 0.08 36)",
  "oklch(68% 0.075 184)",
];

function TagCloud({ tags }: { tags: Array<{ name: string; count: number }> }) {
  if (tags.length === 0) return null;
  return (
    <div>
      <div
        className="f-mono"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.22em",
          color: "var(--ink-faint)",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        tags
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {tags.map((t, i) => {
          const color = TAG_PALETTE[i % TAG_PALETTE.length];
          return (
            <button
              key={t.name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 10px",
                background: "transparent",
                border: "1px solid transparent",
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: color,
                    boxShadow: `0 0 6px ${color}`,
                  }}
                />
                <span
                  className="f-mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    color,
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  {t.name}
                </span>
              </span>
              <span
                className="f-mono"
                style={{
                  fontSize: 9.5,
                  color: "var(--ink-faint)",
                  letterSpacing: "0.12em",
                }}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────

function formatTimeStamp(input: string | number | null | undefined): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    const time = d.toLocaleTimeString("en-ZA", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `today · ${time}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const sameYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (sameYesterday) {
    const time = d.toLocaleTimeString("en-ZA", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `yesterday · ${time}`;
  }
  return (
    d.toLocaleDateString("en-ZA", { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-ZA", { hour: "numeric", minute: "2-digit", hour12: true })
  );
}
