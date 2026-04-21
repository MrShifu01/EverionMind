import { useMemo, useRef, memo, useState, useEffect } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type { Entry } from "../types";
import { resolveIcon } from "../lib/typeIcons";

const IconPin = (
  <svg
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M15 3 21 9l-4 1-4 4-1 5-3-3-5 5-1-1 5-5-3-3 5-1 4-4z" />
  </svg>
);

const IconVault = (
  <svg
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

function relTime(iso?: string) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - then;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.round(d / 7)}w ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(d / 365)}y ago`;
}

const EntryCard = memo(function EntryCard({
  entry: e,
  onSelect,
  typeIcons = {},
  onPin,
  onDelete,
  selectMode = false,
  selected = false,
  onToggleSelect,
  concepts,
}: {
  entry: Entry;
  onSelect: (e: Entry) => void;
  typeIcons?: Record<string, string>;
  onPin?: (e: Entry) => void;
  onDelete?: (e: Entry) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  concepts?: string[];
}) {
  const importance = (e as any).importance as number;
  const isPinned = !!(e as any).pinned;
  const isCritical = importance === 2;
  const isVault = e.type === "secret";
  const emoji = resolveIcon(e.type, typeIcons);
  const createdAt = (e as any).created_at || (e as any).createdAt;

  return (
    <article
      tabIndex={0}
      onClick={() => (selectMode ? onToggleSelect?.(e.id) : onSelect(e))}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          selectMode ? onToggleSelect?.(e.id) : onSelect(e);
        }
      }}
      aria-label={`Open entry: ${e.title}`}
      aria-selected={selectMode ? selected : undefined}
      {...(isPinned ? { "data-pinned": "true" } : {})}
      {...(importance > 0 ? { "data-importance": String(importance) } : {})}
      className={`entry-card ${isCritical ? "entry-card--critical" : isPinned ? "entry-card--pinned" : ""} group press relative cursor-pointer`}
      style={{
        padding: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: selected ? "var(--ember)" : "var(--line-soft)",
        borderLeft: isPinned ? "2px solid var(--ember)" : "1px solid var(--line-soft)",
        background: selected ? "var(--ember-wash)" : "var(--surface)",
        transition: "background 180ms, border-color 180ms",
      }}
    >
      {selectMode && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 20,
            height: 20,
            minHeight: 20,
            borderRadius: 4,
            border: `1px solid ${selected ? "var(--ember)" : "var(--line)"}`,
            background: selected ? "var(--ember)" : "var(--surface-high)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {selected && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ember-ink)" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l4 4 10-10" />
            </svg>
          )}
        </div>
      )}

      {/* Top row: type glyph + label + time + markers */}
      <div
        className="f-sans"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          color: "var(--ink-faint)",
          fontSize: 12,
        }}
      >
        <span style={{ fontSize: 13, lineHeight: 1 }} aria-hidden="true">{emoji}</span>
        <span
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
          }}
        >
          {e.type}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12 }}>{relTime(createdAt)}</span>
        {isPinned && <span style={{ color: "var(--ember)" }}>{IconPin}</span>}
        {isVault && <span>{IconVault}</span>}
      </div>

      <h3
        className="f-serif line-clamp-2"
        style={{
          fontSize: 18,
          lineHeight: 1.25,
          fontWeight: 450,
          letterSpacing: "-0.005em",
          color: "var(--ink)",
          margin: 0,
        }}
      >
        {e.title}
      </h3>
      {isVault ? (
        <p
          className="f-serif"
          style={{
            fontSize: 14,
            fontStyle: "italic",
            color: "var(--ink-faint)",
            margin: "8px 0 0",
          }}
        >
          encrypted — tap to reveal.
        </p>
      ) : e.content ? (
        <p
          className="f-serif line-clamp-3"
          style={{
            fontSize: 15,
            lineHeight: 1.55,
            color: "var(--ink-soft)",
            margin: "8px 0 0",
          }}
        >
          {e.content as string}
        </p>
      ) : null}

      {concepts && concepts.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 14 }}>
          {concepts.slice(0, 3).map((c) => (
            <span
              key={c}
              className="design-chip f-sans"
              style={{ height: 20, fontSize: 11, padding: "0 8px" }}
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {/* Quick actions — visible only on hover */}
      {(onPin || onDelete) && (
        <div
          className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: "1px solid var(--line-soft)",
          }}
        >
          {onPin && (
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                onPin(e);
              }}
              aria-label={isPinned ? "Unpin" : "Pin"}
              className="design-btn-ghost press"
              style={{
                fontSize: 12,
                height: 28,
                minHeight: 28,
                padding: "0 8px",
              }}
            >
              {IconPin}
              <span>{isPinned ? "Unpin" : "Pin"}</span>
            </button>
          )}
          {onDelete && (
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                onDelete(e);
              }}
              aria-label="Delete"
              className="entry-card__delete press"
              style={{
                marginLeft: "auto",
                fontSize: 12,
                height: 28,
                minHeight: 28,
                padding: "0 8px",
                borderRadius: 6,
                color: "var(--blood)",
                background: "transparent",
                border: 0,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "var(--f-sans)",
                fontWeight: 500,
              }}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
              </svg>
              Delete
            </button>
          )}
        </div>
      )}
    </article>
  );
});

const EntryRow = memo(function EntryRow({
  entry: e,
  onSelect,
  onPin,
  onDelete,
  selectMode = false,
  selected = false,
  onToggleSelect,
  typeIcons = {},
}: {
  entry: Entry;
  onSelect: (e: Entry) => void;
  onPin?: (e: Entry) => void;
  onDelete?: (e: Entry) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  typeIcons?: Record<string, string>;
}) {
  const isPinned = !!(e as any).pinned;
  const emoji = resolveIcon(e.type, typeIcons);
  return (
    <article
      tabIndex={0}
      onClick={() => (selectMode ? onToggleSelect?.(e.id) : onSelect(e))}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          selectMode ? onToggleSelect?.(e.id) : onSelect(e);
        }
      }}
      aria-label={`Open entry: ${e.title}`}
      {...(isPinned ? { "data-pinned": "true" } : {})}
      className="group press flex w-full cursor-pointer items-center gap-3"
      style={{
        padding: "12px 16px",
        borderRadius: 10,
        background: "var(--surface)",
        border: `1px solid ${selected ? "var(--ember)" : "var(--line-soft)"}`,
        borderLeft: isPinned ? "2px solid var(--ember)" : undefined,
        transition: "background 180ms, border-color 180ms",
      }}
    >
      <span style={{ fontSize: 14, flexShrink: 0 }} aria-hidden="true">{emoji}</span>
      <span
        className="f-sans"
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--ink-faint)",
          flexShrink: 0,
        }}
      >
        {e.type}
      </span>
      {isPinned && <span style={{ color: "var(--ember)", flexShrink: 0 }}>{IconPin}</span>}
      <span
        className="f-serif min-w-0 flex-1 truncate"
        style={{ fontSize: 15, fontWeight: 450, color: "var(--ink)" }}
      >
        {e.title}
      </span>
      {(onPin || onDelete) && (
        <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onPin && (
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                onPin(e);
              }}
              aria-label={isPinned ? "Unpin" : "Pin"}
              className="press-scale rounded-lg p-1.5 transition-colors hover:bg-white/10"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
                />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                onDelete(e);
              }}
              aria-label="Delete"
              className="entry-card__delete press-scale rounded-lg p-1.5 transition-colors hover:bg-white/10"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                />
              </svg>
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
  selectMode = false,
  selectedIds,
  onToggleSelect,
  viewMode = "grid",
  conceptMap,
}: {
  filtered: Entry[];
  setSelected: (e: Entry) => void;
  typeIcons?: Record<string, string>;
  onPin?: (e: Entry) => void;
  onDelete?: (e: Entry) => void;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  viewMode?: "grid" | "list";
  conceptMap?: Record<string, string[]>;
}) {
  const isList = viewMode === "list";
  const [COLS, setCOLS] = useState(() =>
    typeof window !== "undefined"
      ? window.innerWidth >= 1280
        ? 3
        : window.innerWidth >= 640
          ? 2
          : 1
      : 1,
  );
  useEffect(() => {
    if (isList) return;
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setCOLS(w >= 1024 ? 3 : w >= 560 ? 2 : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isList]);
  const cols = isList ? 1 : COLS;
  const rows = useMemo(() => {
    const r: Entry[][] = [];
    for (let i = 0; i < filtered.length; i += cols) r.push(filtered.slice(i, i + cols));
    return r;
  }, [filtered, cols]);
  const listRef = useRef<HTMLDivElement>(null);
  const ROW_GAP = 16;
  // eslint-disable-next-line react-hooks/refs
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => (isList ? 60 : 190 + ROW_GAP),
    overscan: 4,
    scrollMargin: listRef.current?.offsetTop ?? 0, // eslint-disable-line react-hooks/refs
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
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: isList ? "8px" : "16px",
              paddingBottom: isList ? "8px" : "16px",
            }}
          >
            {rows[vRow.index].map((e) =>
              isList ? (
                <EntryRow
                  key={e.id}
                  entry={e}
                  onSelect={setSelected}
                  onPin={selectMode ? undefined : onPin}
                  onDelete={selectMode ? undefined : onDelete}
                  selectMode={selectMode}
                  selected={selectedIds?.has(e.id) ?? false}
                  onToggleSelect={onToggleSelect}
                  typeIcons={typeIcons}
                />
              ) : (
                <EntryCard
                  key={e.id}
                  entry={e}
                  onSelect={setSelected}
                  typeIcons={typeIcons}
                  onPin={selectMode ? undefined : onPin}
                  onDelete={selectMode ? undefined : onDelete}
                  selectMode={selectMode}
                  selected={selectedIds?.has(e.id) ?? false}
                  onToggleSelect={onToggleSelect}
                  concepts={conceptMap?.[e.id]}
                />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function VirtualTimeline({
  sorted,
  setSelected,
  typeIcons: _typeIcons = {},
}: {
  sorted: Entry[];
  setSelected: (e: Entry) => void;
  typeIcons?: Record<string, string>;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/refs
  const virtualizer = useWindowVirtualizer({
    count: sorted.length,
    estimateSize: () => 64,
    overscan: 5,
    scrollMargin: listRef.current?.offsetTop ?? 0, // eslint-disable-line react-hooks/refs
  });
  return (
    <div ref={listRef} className="relative">
      <div
        className="absolute top-0 bottom-0 left-6 w-px"
        style={{ background: "var(--color-outline-variant)" }}
      />
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const e = sorted[vItem.index];
          return (
            <button
              key={e.id}
              aria-label={`Open entry: ${e.title}`}
              style={{
                position: "absolute",
                top: vItem.start - virtualizer.options.scrollMargin,
                left: 0,
                right: 0,
              }}
              className="group flex w-full cursor-pointer appearance-none items-center gap-4 border-0 bg-transparent py-2.5 pr-4 pl-4 text-left"
              onClick={() => setSelected(e)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  setSelected(e);
                }
              }}
            >
              <div
                className="z-10 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full"
                style={{
                  background: "var(--color-surface-container-low)",
                  border: "2px solid var(--color-primary)",
                }}
              >
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--color-primary)" }}
                />
              </div>
              <div className="group-hover:bg-surface-container flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 transition-colors">
                <span className="text-on-surface truncate text-sm">{e.title}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
