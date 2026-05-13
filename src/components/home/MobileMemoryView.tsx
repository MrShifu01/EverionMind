import { useMemo, useState } from "react";
import type { Entry } from "../../types";

const FILTERS = ["All", "Today", "This week", "Voice", "Important"] as const;
type Filter = (typeof FILTERS)[number];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function startOfWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

function formatMeta(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  const t = d.getTime();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (t >= today.getTime()) return `Today · ${time}`;
  if (t >= yest.getTime()) return `Yesterday · ${time}`;
  if (now.getFullYear() === d.getFullYear()) {
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
  }
  return `${d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
}

function tagFor(e: Entry): string {
  const first = e.tags?.[0];
  if (first) return first.toUpperCase();
  if (e.type) return e.type.toUpperCase();
  return "NOTE";
}

function isVoice(e: Entry): boolean {
  const meta = e.metadata as { source?: string } | undefined;
  return meta?.source === "voice" || meta?.source === "voice_auto";
}

function isImportant(e: Entry): boolean {
  return !!e.pinned;
}

function ClaspIcon({ voice, important }: { voice: boolean; important: boolean }) {
  if (voice)
    return (
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
      </svg>
    );
  if (important)
    return (
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2 14.5 8.5 21 9.3l-5 4.7L17.5 21 12 17.7 6.5 21 8 14l-5-4.7 6.5-.8z" />
      </svg>
    );
  return null;
}

interface Props {
  entries: Entry[];
  searchInput: string;
  onSearchChange: (s: string) => void;
  onSelect: (entry: Entry) => void;
  totalCount: number;
}

export default function MobileMemoryView({
  entries,
  searchInput,
  onSearchChange,
  onSelect,
  totalCount,
}: Props) {
  const [filter, setFilter] = useState<Filter>("All");

  const todayStart = useMemo(() => startOfToday(), []);
  const weekStart = useMemo(() => startOfWeek(), []);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filter === "Voice" && !isVoice(e)) return false;
      if (filter === "Important" && !isImportant(e)) return false;
      if (filter === "Today") {
        const t = new Date(e.created_at || 0).getTime();
        if (t < todayStart) return false;
      }
      if (filter === "This week") {
        const t = new Date(e.created_at || 0).getTime();
        if (t < weekStart) return false;
      }
      return true;
    });
  }, [entries, filter, todayStart, weekStart]);

  const todayLabel = useMemo(() => {
    const d = new Date();
    return d
      .toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
      .toLowerCase();
  }, []);

  return (
    <div
      className="bronze-screen"
      style={{
        padding: "8px 16px 22px",
        background: "var(--bg)",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ marginTop: 6 }}>
        <div
          className="f-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
          }}
        >
          {todayLabel}
        </div>
        <div
          className="f-serif"
          style={{
            fontSize: 30,
            color: "var(--ink)",
            letterSpacing: "-0.025em",
            lineHeight: 1.05,
            marginTop: 4,
          }}
        >
          your <span style={{ fontStyle: "italic", color: "var(--ember)" }}>memories</span>
        </div>
        <div
          className="f-mono"
          style={{
            fontSize: 9.5,
            letterSpacing: "0.18em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
            marginTop: 6,
          }}
        >
          {totalCount} pooled · {filtered.length} showing
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 12px",
          background: "var(--surface)",
          border: "1px solid var(--line-soft)",
          borderRadius: 999,
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ink-faint)"
          strokeWidth="2"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="search the well…"
          aria-label="Search memories"
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: "none",
            outline: "none",
            fontFamily: "var(--f-serif)",
            fontStyle: "italic",
            fontSize: 13,
            color: "var(--ink)",
          }}
        />
      </div>

      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 6,
          overflowX: "auto",
          paddingBottom: 2,
          scrollbarWidth: "none",
        }}
        className="scrollbar-hide"
      >
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className="press"
              style={{
                flexShrink: 0,
                padding: "6px 12px",
                background: active ? "var(--ember-wash)" : "var(--surface-low)",
                border: `1px solid ${
                  active ? "color-mix(in oklch, var(--ember) 40%, transparent)" : "var(--line-soft)"
                }`,
                borderRadius: 999,
                cursor: "pointer",
                color: active ? "var(--ember)" : "var(--ink-soft)",
                fontFamily: "var(--f-mono)",
                fontSize: 9.5,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              {f}
            </button>
          );
        })}
      </div>

      <div
        style={{
          flex: 1,
          marginTop: 14,
          position: "relative",
          paddingLeft: 24,
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 6,
            bottom: 6,
            left: 8,
            width: 1,
            background:
              "linear-gradient(to bottom, transparent, color-mix(in oklch, var(--ember) 40%, var(--line)) 8%, var(--line) 70%, transparent)",
          }}
        />

        {filtered.length === 0 ? (
          <div
            style={{
              padding: "40px 8px",
              textAlign: "center",
            }}
          >
            <div
              className="f-serif"
              style={{
                fontSize: 18,
                fontStyle: "italic",
                color: "var(--ink-faint)",
              }}
            >
              {searchInput || filter !== "All" ? "nothing matches." : "the well is empty."}
            </div>
          </div>
        ) : (
          filtered.map((m) => {
            const voice = isVoice(m);
            const important = isImportant(m);
            const body = m.content || m.title || "";
            return (
              <article
                key={m.id}
                className="press"
                onClick={() => onSelect(m)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(m);
                  }
                }}
                style={{
                  position: "relative",
                  padding: "12px 12px",
                  marginBottom: 10,
                  background: "var(--surface)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 14,
                  cursor: "pointer",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 16,
                    left: -22,
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: important
                      ? "radial-gradient(circle at 35% 30%, color-mix(in oklch, var(--ember) 70%, white), var(--ember-deep))"
                      : "var(--surface-high)",
                    border: `1px solid color-mix(in oklch, var(--ember) ${important ? 80 : 38}%, transparent)`,
                    boxShadow: important
                      ? "0 0 10px color-mix(in oklch, var(--ember) 55%, transparent)"
                      : "var(--lift-1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: important ? "var(--ember-ink)" : "var(--ember)",
                  }}
                >
                  <ClaspIcon voice={voice} important={important} />
                </span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    marginBottom: 4,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    className="f-mono"
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.16em",
                      color: "var(--ink-faint)",
                      textTransform: "uppercase",
                    }}
                  >
                    {formatMeta(m.created_at)}
                  </span>
                  <span
                    className="f-mono"
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.16em",
                      color: "var(--ember)",
                      textTransform: "uppercase",
                      padding: "2px 6px",
                      background: "var(--ember-wash)",
                      borderRadius: 4,
                      border: "1px solid color-mix(in oklch, var(--ember) 28%, transparent)",
                    }}
                  >
                    {tagFor(m)}
                  </span>
                </div>
                <div
                  className="f-serif"
                  style={{
                    fontSize: 14,
                    color: "var(--ink)",
                    lineHeight: 1.4,
                    letterSpacing: "-0.005em",
                    display: "-webkit-box",
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {body}
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
