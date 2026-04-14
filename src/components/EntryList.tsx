import { useMemo, useRef, memo, useState, useEffect } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { fmtD } from "../data/constants";
import type { Entry } from "../types";
import { Badge } from "./ui/badge";
import type { VariantProps } from "class-variance-authority";
import { badgeVariants } from "./ui/badge";

// Maps entry types to Badge variant
const TYPE_VARIANT: Record<string, VariantProps<typeof badgeVariants>["variant"]> = {
  note: "default",
  person: "default",
  document: "secondary",
  supplier: "secondary",
  secret: "destructive",
  reminder: "destructive",
};

const EntryCard = memo(function EntryCard({
  entry: e,
  onSelect,
  typeIcons: _typeIcons = {},
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
  const imp = ({ 1: "Important", 2: "Critical" } as Record<number, string>)[importance];
  const isPinned = !!(e as any).pinned;
  const isCritical = importance === 2;
  const typeVariant = TYPE_VARIANT[e.type] ?? "default";

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
      aria-label={e.title}
      aria-selected={selectMode ? selected : undefined}
      {...(isPinned ? { "data-pinned": "true" } : {})}
      {...(importance > 0 ? { "data-importance": String(importance) } : {})}
      className={`entry-card ${isCritical ? "entry-card--critical" : isPinned ? "entry-card--pinned" : ""} group press-scale relative cursor-pointer rounded-2xl border p-5 transition-all duration-200`}
      style={
        selected ? { outline: "2px solid var(--color-primary)", outlineOffset: "2px" } : undefined
      }
    >
      {selectMode && (
        <div
          className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors"
          style={{
            borderColor: selected ? "var(--color-primary)" : "var(--color-outline-variant)",
            background: selected ? "var(--color-primary)" : "transparent",
          }}
        >
          {selected && (
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
            </svg>
          )}
        </div>
      )}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Badge variant={typeVariant}>{e.type.charAt(0).toUpperCase() + e.type.slice(1)}</Badge>
          {(e.metadata?.confidence as Record<string, string> | undefined)?.type && (
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                background:
                  (e.metadata!.confidence as Record<string, string>).type === "extracted"
                    ? "rgb(22,163,74)"
                    : (e.metadata!.confidence as Record<string, string>).type === "inferred"
                      ? "rgb(217,119,6)"
                      : "rgb(220,38,38)",
              }}
              title={`Type: ${(e.metadata!.confidence as Record<string, string>).type}`}
            />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {(e as any).pinned && <span className="text-primary text-xs">📌</span>}
          {imp && (
            <Badge variant={imp === "Critical" ? "destructive" : "default"} size="pill">
              {imp}
            </Badge>
          )}
        </div>
      </div>
      <h3 className="text-on-surface mb-2 line-clamp-2 text-base leading-snug font-semibold tracking-tight">
        {e.title}
      </h3>
      {e.type === "secret" ? (
        <p className="mb-3 text-sm italic" style={{ color: "var(--color-on-surface-variant)" }}>
          🔒 Encrypted — tap to reveal
        </p>
      ) : e.content ? (
        <p
          className="mb-3 line-clamp-2 text-sm leading-relaxed"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          {e.content as string}
        </p>
      ) : null}
      {(e as any).tags?.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1.5">
          {(e as any).tags.slice(0, 3).map((tag: string) => (
            <Badge key={tag} variant="secondary" size="pill">
              {tag}
            </Badge>
          ))}
          {(e as any).tags.length > 3 && (
            <span className="text-on-surface-variant px-1 text-xs">
              +{(e as any).tags.length - 3}
            </span>
          )}
        </div>
      )}

      {concepts && concepts.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {concepts.slice(0, 3).map((c) => (
            <span
              key={c}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                background: "var(--color-secondary-container)",
                color: "var(--color-secondary)",
              }}
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {/* Quick actions — subtle at rest, vivid on hover */}
      {(onPin || onDelete) && (
        <div
          className="mt-3 flex items-center gap-1 border-t pt-2.5 opacity-60 transition-opacity duration-150 group-hover:opacity-100"
          style={{ borderColor: "var(--color-outline-variant)" }}
        >
          {onPin && (
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                onPin(e);
              }}
              aria-label={isPinned ? "Unpin" : "Pin"}
              className="hover:bg-surface-container-high press-scale flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors"
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
              {isPinned ? "Unpin" : "Pin"}
            </button>
          )}
          {onDelete && (
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                onDelete(e);
              }}
              aria-label="Delete"
              className="entry-card__delete press-scale ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors"
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
}: {
  entry: Entry;
  onSelect: (e: Entry) => void;
  onPin?: (e: Entry) => void;
  onDelete?: (e: Entry) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const rowTypeVariant = TYPE_VARIANT[e.type] ?? "default";
  const isPinned = !!(e as any).pinned;
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
      aria-label={e.title}
      {...(isPinned ? { "data-pinned": "true" } : {})}
      className={`group press-scale bg-surface-container flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-xl border px-4 py-3 transition-all duration-200 ${selected ? "border-primary outline-primary outline outline-2 outline-offset-2" : "border-outline-variant"}`}
    >
      <Badge variant={rowTypeVariant}>{e.type.charAt(0).toUpperCase() + e.type.slice(1)}</Badge>
      {isPinned && <span className="text-primary flex-shrink-0 text-[11px]">📌</span>}
      <span className="text-on-surface min-w-0 flex-1 truncate text-sm font-medium">{e.title}</span>
      <span className="flex-shrink-0 text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
        {e.created_at ? fmtD(e.created_at) : ""}
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
              aria-label={e.title}
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
              <p className="text-on-surface-variant/50 w-20 flex-shrink-0 text-xs font-semibold tracking-widest uppercase">
                {fmtD(e.created_at ?? "")}
              </p>
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
