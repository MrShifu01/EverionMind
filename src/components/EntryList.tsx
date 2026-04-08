import { useMemo, useRef, memo, useState, useEffect } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { TC, fmtD } from "../data/constants";
import { resolveIcon } from "../lib/typeIcons";
import type { Entry } from "../types";

// All colors reference CSS variables so they respond correctly to light/dark mode.
const TYPE_THEME: Record<string, { bg: string; text: string }> = {
  note:     { bg: "var(--color-primary-container)",   text: "var(--color-primary)" },
  person:   { bg: "var(--color-primary-container)",   text: "var(--color-primary)" },
  document: { bg: "var(--color-secondary-container)", text: "var(--color-secondary)" },
  secret:   { bg: "color-mix(in oklch, var(--color-error) 12%, var(--color-surface-container))", text: "var(--color-error)" },
  reminder: { bg: "color-mix(in oklch, var(--color-error) 12%, var(--color-surface-container))", text: "var(--color-error)" },
  supplier: { bg: "var(--color-secondary-container)", text: "var(--color-secondary)" },
  default:  { bg: "var(--color-primary-container)",   text: "var(--color-primary)" },
};

const EntryCard = memo(function EntryCard({
  entry: e,
  onSelect,
  typeIcons = {},
  onPin,
  onDelete,
}: {
  entry: Entry;
  onSelect: (e: Entry) => void;
  typeIcons?: Record<string, string>;
  onPin?: (e: Entry) => void;
  onDelete?: (e: Entry) => void;
}) {
  const cfg = { ...(TC[e.type] || TC.note), i: resolveIcon(e.type, typeIcons) };
  const importance = (e as any).importance as number;
  const imp = ({ 1: "Important", 2: "Critical" } as Record<number, string>)[importance];
  const isPinned = !!(e as any).pinned;
  const isCritical = importance === 2;
  const colors = TYPE_THEME[e.type] || TYPE_THEME.default;

  return (
    <article
      tabIndex={0}
      onClick={() => onSelect(e)}
      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSelect(e); } }}
      aria-label={e.title}
      {...(isPinned ? { "data-pinned": "true" } : {})}
      {...(importance > 0 ? { "data-importance": String(importance) } : {})}
      className={`entry-card${isCritical ? " entry-card--critical" : isPinned ? " entry-card--pinned" : ""} group cursor-pointer rounded-2xl p-5 border transition-all duration-200 press-scale`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
            style={{ background: colors.bg }}
          >
            <span style={{ color: colors.text }}>{cfg.i}</span>
          </div>
          <p className="text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>
            {e.type}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {(e as any).pinned && <span style={{ color: "var(--color-primary)", fontSize: 12 }}>📌</span>}
          {imp && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{
                background: imp === "Critical"
                  ? "color-mix(in oklch, var(--color-error) 14%, var(--color-surface-container))"
                  : "var(--color-primary-container)",
                color: imp === "Critical" ? "var(--color-error)" : "var(--color-on-primary-container)",
              }}
            >
              {imp}
            </span>
          )}
        </div>
      </div>
      <h3 className="font-semibold text-on-surface leading-snug tracking-tight line-clamp-2 mb-2 text-base">
        {e.title}
      </h3>
      {e.type === "secret" ? (
        <p className="text-sm italic mb-3" style={{ color: "var(--color-on-surface-variant)" }}>🔒 Encrypted — tap to reveal</p>
      ) : e.content ? (
        <p className="text-sm line-clamp-2 mb-3 leading-relaxed" style={{ color: "var(--color-on-surface-variant)" }}>
          {e.content as string}
        </p>
      ) : null}
      {(e as any).tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-auto">
          {(e as any).tags.slice(0, 3).map((tag: string) => (
            <span
              key={tag}
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{
                background: "var(--color-secondary-container)",
                color: "var(--color-secondary)",
              }}
            >
              #{tag}
            </span>
          ))}
          {(e as any).tags.length > 3 && (
            <span className="text-xs px-1" style={{ color: "var(--color-on-surface-variant)" }}>
              +{(e as any).tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Quick actions — subtle at rest, vivid on hover */}
      {(onPin || onDelete) && (
        <div
          className="flex items-center gap-1 mt-3 pt-2.5 border-t opacity-40 group-hover:opacity-100 transition-opacity duration-150"
          style={{ borderColor: "var(--color-outline-variant)" }}
        >
          {onPin && (
            <button
              onClick={(ev) => { ev.stopPropagation(); onPin(e); }}
              aria-label={isPinned ? "Unpin" : "Pin"}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors hover:bg-surface-container-high press-scale"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
              </svg>
              {isPinned ? "Unpin" : "Pin"}
            </button>
          )}
          {onDelete && (
            <button
              onClick={(ev) => { ev.stopPropagation(); onDelete(e); }}
              aria-label="Delete"
              className="entry-card__delete flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors press-scale ml-auto"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              Delete
            </button>
          )}
        </div>
      )}
    </article>
  );
});

export function VirtualGrid({
  filtered,
  setSelected,
  typeIcons = {},
  onPin,
  onDelete,
}: {
  filtered: Entry[];
  setSelected: (e: Entry) => void;
  typeIcons?: Record<string, string>;
  onPin?: (e: Entry) => void;
  onDelete?: (e: Entry) => void;
}) {
  const [COLS, setCOLS] = useState(() =>
    typeof window !== "undefined"
      ? window.innerWidth >= 1280 ? 3 : window.innerWidth >= 640 ? 2 : 1
      : 1
  );
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setCOLS(w >= 1024 ? 3 : w >= 560 ? 2 : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const rows = useMemo(() => {
    const r: Entry[][] = [];
    for (let i = 0; i < filtered.length; i += COLS) r.push(filtered.slice(i, i + COLS));
    return r;
  }, [filtered, COLS]);
  const listRef = useRef<HTMLDivElement>(null);
  const ROW_GAP = 16;
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 190 + ROW_GAP,
    overscan: 4,
    scrollMargin: listRef.current?.offsetTop ?? 0,
    measureElement: (el) => el.getBoundingClientRect().height,
  });
  return (
    <div ref={listRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vRow) => (
          <div
            key={vRow.index}
            data-index={vRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: vRow.start - virtualizer.options.scrollMargin,
              left: 0,
              right: 0,
              display: "grid",
              gridTemplateColumns: `repeat(${COLS}, 1fr)`,
              gap: "16px",
              paddingBottom: "16px",
            }}
          >
            {rows[vRow.index].map((e) => (
              <EntryCard key={e.id} entry={e} onSelect={setSelected} typeIcons={typeIcons} onPin={onPin} onDelete={onDelete} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function VirtualTimeline({
  sorted,
  setSelected,
  typeIcons = {},
}: {
  sorted: Entry[];
  setSelected: (e: Entry) => void;
  typeIcons?: Record<string, string>;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useWindowVirtualizer({
    count: sorted.length,
    estimateSize: () => 64,
    overscan: 5,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });
  return (
    <div ref={listRef} className="relative">
      <div
        className="absolute left-6 top-0 bottom-0 w-px"
        style={{ background: "var(--color-outline-variant)" }}
      />
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const e = sorted[vItem.index];
          const cfg = { ...(TC[e.type] || TC.note), i: resolveIcon(e.type, typeIcons) };
          return (
            <button
              key={e.id}
              aria-label={e.title}
              style={{
                position: "absolute",
                top: vItem.start - virtualizer.options.scrollMargin,
                left: 0,
                right: 0,
              }}
              className="flex items-center gap-4 pl-4 pr-4 py-2.5 cursor-pointer group w-full text-left bg-transparent border-0 appearance-none"
              onClick={() => setSelected(e)}
              onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setSelected(e); } }}
            >
              <div
                className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center z-10"
                style={{ background: "var(--color-surface-container-low)", border: "2px solid var(--color-primary)" }}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-primary)" }} />
              </div>
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant/50 font-semibold flex-shrink-0 w-20">
                {fmtD(e.created_at)}
              </p>
              <div className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2 rounded-xl transition-colors group-hover:bg-surface-container">
                <span className="text-sm flex-shrink-0">{cfg.i}</span>
                <span className="text-sm text-on-surface truncate">{e.title}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
