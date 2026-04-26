import React, { useMemo, useRef, memo, useState, useEffect } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type { Entry } from "../types";
import { resolveIcon } from "../lib/typeIcons";
import { isPendingEnrichment } from "../lib/enrichFlags";
import { getAdminPrefs } from "../lib/adminPrefs";
import { isCachedAdmin } from "../lib/userEmailCache";
import {
  IconPin,
  IconVaultSmall as IconVault,
  EnrichingDot,
  EnrichFlagChips,
} from "./EntryListBits";

const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined) ?? "";

// Cheap sync admin check — used to gate the diagnostic flag chips on entry
// cards. The async source of truth lives in useAdminDevMode; this just reads
// the cached email SettingsView stashes in localStorage on auth load.
const isAdminSync = (): boolean => isCachedAdmin(ADMIN_EMAIL);

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
  const showAdminFlags = isAdminSync() && !isVault && getAdminPrefs().showEnrichmentChips;

  // Concepts source priority:
  //   1. entry.metadata.concepts — written by stepConcepts as soon as the
  //      LLM extracts them, propagated via realtime UPDATEs. Always lives
  //      with the entry, so pills show the moment enrichment finishes.
  //   2. conceptMap[id] — the brain-wide aggregated graph, rebuilt
  //      periodically. Used as a fallback for older entries whose metadata
  //      predates the concepts-in-metadata convention.
  const conceptLabels: string[] = (() => {
    const meta = (e.metadata as any)?.concepts;
    if (Array.isArray(meta) && meta.length) {
      const labels = meta
        .map((c: any) => (typeof c === "string" ? c : c?.label))
        .filter((l: any): l is string => typeof l === "string" && l.length > 0);
      if (labels.length) return labels;
    }
    return concepts ?? [];
  })();

  const [swipeX, setSwipeX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const startSwipeRef = useRef(0);
  const draggingRef = useRef(false);

  const ACTION_W = 72;
  const actionCount = (onPin ? 1 : 0) + (onDelete ? 1 : 0);
  const TOTAL_W = actionCount * ACTION_W;
  const isOpen = swipeX < -10;

  function onTouchStart(ev: React.TouchEvent) {
    touchStartRef.current = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
    startSwipeRef.current = swipeX;
    draggingRef.current = false;
  }

  function onTouchMove(ev: React.TouchEvent) {
    if (TOTAL_W === 0) return;
    const dx = ev.touches[0].clientX - touchStartRef.current.x;
    const dy = ev.touches[0].clientY - touchStartRef.current.y;
    if (!draggingRef.current) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      if (Math.abs(dy) > Math.abs(dx)) return;
      draggingRef.current = true;
      setDragging(true);
    }
    setSwipeX(Math.min(0, Math.max(-TOTAL_W, startSwipeRef.current + dx)));
  }

  function onTouchEnd() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    setSwipeX((prev) => (prev < -(TOTAL_W / 2) ? -TOTAL_W : 0));
  }

  return (
    <div
      className={isCritical ? "entry-card--critical" : isPinned ? "entry-card--pinned" : ""}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 12,
        border: `1px solid ${selected ? "var(--ember)" : "var(--line-soft)"}`,
        borderLeft: isPinned ? "2px solid var(--ember)" : undefined,
        transition: "border-color 180ms",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Swipe action panel — revealed behind the card */}
      {TOTAL_W > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: TOTAL_W,
            display: "flex",
          }}
        >
          {onPin && (
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                onPin(e);
                setSwipeX(0);
              }}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                background: "var(--ember)",
                border: "none",
                cursor: "pointer",
                color: "#fff",
                fontFamily: "var(--f-sans)",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              <svg
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
              >
                <path d="M15 3 21 9l-4 1-4 4-1 5-3-3-5 5-1-1 5-5-3-3 5-1 4-4z" />
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
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                background: "var(--blood)",
                border: "none",
                cursor: "pointer",
                color: "#fff",
                fontFamily: "var(--f-sans)",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              <svg
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
              >
                <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
              </svg>
              Delete
            </button>
          )}
        </div>
      )}

      {/* Card content — slides left on swipe */}
      <article
        tabIndex={0}
        onClick={() => {
          if (isOpen) {
            setSwipeX(0);
            return;
          }
          selectMode ? onToggleSelect?.(e.id) : onSelect(e);
        }}
        onKeyDown={(ev) => {
          if (ev.key === "Escape") {
            setSwipeX(0);
            return;
          }
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            selectMode ? onToggleSelect?.(e.id) : onSelect(e);
          }
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        aria-label={`Open entry: ${e.title}`}
        aria-selected={selectMode ? selected : undefined}
        {...(isPinned ? { "data-pinned": "true" } : {})}
        {...(importance > 0 ? { "data-importance": String(importance) } : {})}
        className={`entry-card ${isCritical ? "entry-card--critical" : isPinned ? "entry-card--pinned" : ""} group press relative cursor-pointer`}
        style={{
          padding: 20,
          flex: 1,
          background: selected ? "var(--ember-wash)" : "var(--surface)",
          transform: `translateX(${swipeX}px)`,
          transition: dragging
            ? "none"
            : "transform 220ms cubic-bezier(0.25, 1, 0.5, 1), background 180ms",
          touchAction: dragging ? "none" : "pan-y",
          willChange: dragging ? "transform" : "auto",
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
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--ember-ink)"
                strokeWidth="2"
              >
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
          <span style={{ fontSize: 13, lineHeight: 1 }} aria-hidden="true">
            {emoji}
          </span>
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
          {isPendingEnrichment(e) && <EnrichingDot />}
          {showAdminFlags && <EnrichFlagChips entry={e} />}
          {e.embedding_status === "failed" && (
            <span
              aria-label="Embedding failed — not searchable"
              title="Embedding failed — won't appear in semantic search"
              style={{ color: "var(--ember)", lineHeight: 1, fontSize: 12 }}
            >
              ⚠
            </span>
          )}
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

        {conceptLabels.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 14 }}>
            {conceptLabels.slice(0, 3).map((c) => (
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

        {/* Desktop hover-reveal quick actions */}
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
                style={{ fontSize: 12, height: 28, minHeight: 28, padding: "0 8px" }}
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
                  <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
                </svg>
                Delete
              </button>
            )}
          </div>
        )}
      </article>
    </div>
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
  const showAdminFlags = isAdminSync() && e.type !== "secret" && getAdminPrefs().showEnrichmentChips;

  const [swipeX, setSwipeX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const startSwipeRef = useRef(0);
  const draggingRef = useRef(false);

  const ACTION_W = 64;
  const actionCount = (onPin ? 1 : 0) + (onDelete ? 1 : 0);
  const TOTAL_W = actionCount * ACTION_W;
  const isOpen = swipeX < -10;

  function onTouchStart(ev: React.TouchEvent) {
    touchStartRef.current = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
    startSwipeRef.current = swipeX;
    draggingRef.current = false;
  }

  function onTouchMove(ev: React.TouchEvent) {
    if (TOTAL_W === 0) return;
    const dx = ev.touches[0].clientX - touchStartRef.current.x;
    const dy = ev.touches[0].clientY - touchStartRef.current.y;
    if (!draggingRef.current) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      if (Math.abs(dy) > Math.abs(dx)) return;
      draggingRef.current = true;
      setDragging(true);
    }
    setSwipeX(Math.min(0, Math.max(-TOTAL_W, startSwipeRef.current + dx)));
  }

  function onTouchEnd() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    setSwipeX((prev) => (prev < -(TOTAL_W / 2) ? -TOTAL_W : 0));
  }

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 10,
        background: selected ? "var(--ember-wash)" : "var(--surface)",
        border: `1px solid ${selected ? "var(--ember)" : "var(--line-soft)"}`,
        borderLeft: isPinned ? "2px solid var(--ember)" : undefined,
        transition: "border-color 180ms, background 180ms",
      }}
    >
      {/* Swipe action panel — sits behind the row, revealed on swipe */}
      {TOTAL_W > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: TOTAL_W,
            display: "flex",
          }}
        >
          {onPin && (
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                onPin(e);
                setSwipeX(0);
              }}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                background: "var(--ember)",
                border: "none",
                cursor: "pointer",
                color: "#fff",
                fontFamily: "var(--f-sans)",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              <svg
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
              >
                <path d="M15 3 21 9l-4 1-4 4-1 5-3-3-5 5-1-1 5-5-3-3 5-1 4-4z" />
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
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                background: "var(--blood)",
                border: "none",
                cursor: "pointer",
                color: "#fff",
                fontFamily: "var(--f-sans)",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              <svg
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
              >
                <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
              </svg>
              Delete
            </button>
          )}
        </div>
      )}

      {/* Row content — slides left on swipe */}
      <article
        tabIndex={0}
        onClick={() => {
          if (isOpen) {
            setSwipeX(0);
            return;
          }
          selectMode ? onToggleSelect?.(e.id) : onSelect(e);
        }}
        onKeyDown={(ev) => {
          if (ev.key === "Escape") {
            setSwipeX(0);
            return;
          }
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            selectMode ? onToggleSelect?.(e.id) : onSelect(e);
          }
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        aria-label={`Open entry: ${e.title}`}
        {...(isPinned ? { "data-pinned": "true" } : {})}
        className="group press flex w-full cursor-pointer items-center gap-3"
        style={{
          padding: "12px 16px",
          // Selected rows get the same ember-wash fill as the grid card so
          // both views read the same in Select mode.
          background: selected ? "var(--ember-wash)" : "var(--surface)",
          transform: `translateX(${swipeX}px)`,
          transition: dragging ? "none" : "transform 220ms cubic-bezier(0.25, 1, 0.5, 1), background 180ms",
          touchAction: dragging ? "none" : "pan-y",
          willChange: dragging ? "transform" : "auto",
        }}
      >
        <span style={{ fontSize: 14, flexShrink: 0 }} aria-hidden="true">
          {emoji}
        </span>
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
        {isPendingEnrichment(e) && <EnrichingDot />}
        {showAdminFlags && <EnrichFlagChips entry={e} />}
        {/* Desktop hover-reveal actions */}
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
    </div>
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

function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - d.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: "long" }).toLowerCase();
  }
  return d
    .toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    .toLowerCase();
}

function dayShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }).toLowerCase();
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
  const byDay = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of sorted) {
      const iso = (e as any).created_at || (e as any).createdAt;
      if (!iso) continue;
      const key = String(iso).slice(0, 10);
      const arr = m.get(key);
      if (arr) arr.push(e);
      else m.set(key, [e]);
    }
    return [...m.entries()];
  }, [sorted]);

  if (byDay.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center"
        style={{ padding: "80px 20px", textAlign: "center" }}
      >
        <h3
          className="f-serif"
          style={{ fontSize: 22, fontWeight: 450, color: "var(--ink)", margin: 0 }}
        >
          nothing on the timeline yet.
        </h3>
        <p
          className="f-serif"
          style={{
            fontSize: 15,
            fontStyle: "italic",
            color: "var(--ink-faint)",
            margin: "8px 0 0",
          }}
        >
          remember something.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      {byDay.map(([day, items]) => (
        <section key={day} style={{ marginBottom: 48 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 14,
              marginBottom: 16,
            }}
          >
            <h3
              className="f-serif"
              style={{
                fontSize: 22,
                fontStyle: "italic",
                fontWeight: 450,
                letterSpacing: "-0.005em",
                color: "var(--ink)",
                margin: 0,
              }}
            >
              {dayLabel(day)}
            </h3>
            <div
              aria-hidden="true"
              style={{ flex: 1, height: 1, background: "var(--line-soft)" }}
            />
            <div
              className="f-sans"
              style={{ fontSize: 12, color: "var(--ink-faint)", flexShrink: 0 }}
            >
              {dayShort(day)}
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((e) => (
              <EntryCard key={e.id} entry={e} onSelect={setSelected} typeIcons={typeIcons} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
