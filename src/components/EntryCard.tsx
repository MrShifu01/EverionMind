// Memo'd grid card for an entry. Used by VirtualGrid (in `viewMode=grid`)
// and VirtualTimeline. Split out of EntryList.tsx so the virtualisers are
// readable on their own. Pure presentation — no fetching or mutation.

import { memo } from "react";
import type { Entry } from "../types";
import { resolveIcon } from "../lib/typeIcons";
import { isPendingEnrichment } from "../lib/enrichFlags";
import { getAdminPrefs } from "../lib/adminPrefs";
import { getCachedIsAdmin } from "../lib/userEmailCache";
import { useSwipeActions } from "../hooks/useSwipeActions";
import {
  IconPin,
  IconVaultSmall as IconVault,
  EnrichingDot,
  EnrichFlagChips,
} from "./EntryListBits";
import { Button } from "./ui/button";

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

export const EntryCard = memo(function EntryCard({
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
  const importance = e.importance ?? 0;
  const isPinned = !!e.pinned;
  const isCritical = importance === 2;
  const isVault = e.type === "secret";
  const emoji = resolveIcon(e.type, typeIcons);
  const createdAt = e.created_at;
  const showAdminFlags = getCachedIsAdmin() && !isVault && getAdminPrefs().showEnrichmentChips;

  // Concepts source priority:
  //   1. entry.metadata.concepts — written by stepConcepts as soon as the
  //      LLM extracts them, propagated via realtime UPDATEs. Always lives
  //      with the entry, so pills show the moment enrichment finishes.
  //   2. conceptMap[id] — the brain-wide aggregated graph, rebuilt
  //      periodically. Used as a fallback for older entries whose metadata
  //      predates the concepts-in-metadata convention.
  const conceptLabels: string[] = (() => {
    const meta = e.metadata?.concepts as unknown;
    if (Array.isArray(meta) && meta.length) {
      const labels = meta
        .map((c) => (typeof c === "string" ? c : (c as { label?: string })?.label))
        .filter((l): l is string => typeof l === "string" && l.length > 0);
      if (labels.length) return labels;
    }
    return concepts ?? [];
  })();

  const ACTION_W = 72;
  const actionCount = (onPin ? 1 : 0) + (onDelete ? 1 : 0);
  const TOTAL_W = actionCount * ACTION_W;

  const { swipeX, dragging, isOpen, onTouchStart, onTouchMove, onTouchEnd, closeSwipe } =
    useSwipeActions({ actionWidth: ACTION_W, actionCount });

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
                closeSwipe();
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
        onClick={(ev) => {
          if (isOpen) {
            closeSwipe();
            return;
          }
          if (selectMode) {
            onToggleSelect?.(e.id);
            return;
          }
          // Imperatively mark this card as the View Transitions source.
          // The parent wraps the resulting setSelected in startViewTransition;
          // browser captures the BEFORE snapshot with this name on the card,
          // React's flushSync replaces the inline style on re-render (no name
          // on the card after), DetailModal renders with the same name, and
          // the browser morphs card -> modal. On unsupported browsers the
          // inline style is harmless (view-transition-name is a no-op there).
          (ev.currentTarget as HTMLElement).style.viewTransitionName = `entry-${e.id}`;
          onSelect(e);
        }}
        onKeyDown={(ev) => {
          if (ev.key === "Escape") {
            closeSwipe();
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
              bottom: 12,
              right: 12,
              width: 22,
              height: 22,
              minHeight: 22,
              borderRadius: 6,
              border: `1px solid ${selected ? "var(--ember)" : "var(--line)"}`,
              background: selected ? "var(--ember)" : "var(--surface-high)",
              boxShadow: "var(--lift-1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
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
        ) : (
          (() => {
            // For Gmail-sourced entries the raw `content` field is auto-
            // generated at scan time (cluster-mode: first 400 chars of email
            // body; classifier-mode: a one-sentence LLM summary). When the
            // body is "see attached" the card was useless. We now prefer
            // metadata.ai_summary (richer summary the parse step writes from
            // the full body + attachment_text) and fall back to ai_insight,
            // then finally raw content. Non-Gmail entries always render
            // user-authored content.
            const meta = e.metadata as Record<string, unknown> | undefined;
            const isGmail = (meta?.source as string | undefined) === "gmail";
            const aiSummary =
              isGmail && typeof meta?.ai_summary === "string"
                ? (meta.ai_summary as string).trim()
                : "";
            const aiInsight =
              isGmail && typeof meta?.ai_insight === "string"
                ? (meta.ai_insight as string).trim()
                : "";
            const rawContent = (e.content as string | null) ?? "";
            // Use the richer text only when meaningfully longer than raw —
            // a 30-char ai_summary on a 400-char body would be a downgrade.
            const display =
              aiSummary && aiSummary.length >= rawContent.length / 2
                ? aiSummary
                : aiInsight && rawContent.length < 200 && aiInsight.length > rawContent.length
                  ? aiInsight
                  : rawContent;
            if (!display) return null;
            return (
              <p
                className="f-serif line-clamp-3"
                style={{
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: "var(--ink-soft)",
                  margin: "8px 0 0",
                }}
              >
                {display}
              </p>
            );
          })()
        )}

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
              <Button
                variant="ghost"
                size="xs"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onPin(e);
                }}
                aria-label={isPinned ? "Unpin" : "Pin"}
              >
                {IconPin}
                <span>{isPinned ? "Unpin" : "Pin"}</span>
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="xs"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onDelete(e);
                }}
                aria-label="Delete"
                className="entry-card__delete ml-auto"
                style={{ color: "var(--blood)" }}
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
              </Button>
            )}
          </div>
        )}
      </article>
    </div>
  );
});
