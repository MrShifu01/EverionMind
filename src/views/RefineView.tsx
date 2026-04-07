import { useState, useCallback } from "react";
import { authFetch } from "../lib/authFetch";
import { callAI } from "../lib/ai";
import { TC } from "../data/constants";
import { PROMPTS } from "../config/prompts";
import { recordDecision, getDecisionCount } from "../lib/learningEngine";
import type { Entry, Brain } from "../types";

interface EntrySuggestion {
  type: string;
  entryId: string;
  entryTitle?: string;
  field: string;
  currentValue?: string;
  suggestedValue: string;
  reason: string;
}

interface LinkSuggestion {
  type: "LINK_SUGGESTED";
  fromId: string;
  toId: string;
  fromTitle?: string;
  toTitle?: string;
  rel: string;
  reason: string;
}

type RefineSuggestion = EntrySuggestion | LinkSuggestion;

interface RefineLink {
  from: string;
  to: string;
  rel?: string;
  similarity?: number;
}

interface RefineViewProps {
  entries: Entry[];
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  links?: RefineLink[];
  addLinks?: (links: Array<{ from: string; to: string; rel: string }>) => void;
  activeBrain: Brain | null;
  brains: Brain[];
  onSwitchBrain?: (brain: Brain) => void;
}

/* ─── Suggestion type metadata ─── */
// variant: "primary" = warm amber accent | "neutral" = muted on-surface
const LABELS = {
  TYPE_MISMATCH: { label: "Wrong type", icon: "🔄", variant: "neutral" },
  PHONE_FOUND: { label: "Phone number", icon: "📞", variant: "primary" },
  EMAIL_FOUND: { label: "Email address", icon: "✉️", variant: "primary" },
  URL_FOUND: { label: "URL / link", icon: "🔗", variant: "neutral" },
  DATE_FOUND: { label: "Date / deadline", icon: "📅", variant: "primary" },
  TITLE_POOR: { label: "Better title", icon: "✏️", variant: "neutral" },
  SPLIT_SUGGESTED: { label: "Split entry", icon: "✂️", variant: "neutral" },
  MERGE_SUGGESTED: { label: "Merge entries", icon: "🔀", variant: "neutral" },
  CONTENT_WEAK: { label: "Needs content", icon: "📝", variant: "neutral" },
  TAG_SUGGESTED: { label: "Add tags", icon: "🏷️", variant: "neutral" },
  LINK_SUGGESTED: { label: "Relationship", icon: "⟷", variant: "primary" },
};

function labelColors(variant: string) {
  if (variant === "primary") {
    return { bg: "var(--color-primary-container)", text: "var(--color-primary)" };
  }
  return { bg: "var(--color-surface-container-high)", text: "var(--color-on-surface-variant)" };
}

export default function RefineView({
  entries,
  setEntries,
  links,
  addLinks,
  activeBrain,
  brains,
  onSwitchBrain,
}: RefineViewProps) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<RefineSuggestion[] | null>(null); // null = never run
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  /* ── Analyze: entry quality + link discovery in parallel ── */
  const analyze = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setSuggestions(null);
    setDismissed(new Set());
    setEditingKey(null);

    const existingLinkKeys = new Set((links || []).map((l: RefineLink) => `${l.from}-${l.to}`));
    const BATCH = 25;
    const entrySuggestions: RefineSuggestion[] = [];

    /* Entry quality — batched (learnings auto-injected by callAI via brainId) */
    const batches = [];
    for (let i = 0; i < entries.length; i += BATCH) batches.push(entries.slice(i, i + BATCH));

    await Promise.all(
      batches.map(async (batch) => {
        const slim = batch.map((e: Entry) => ({
          id: e.id,
          title: e.title,
          content: (e.content || "").slice(0, 400),
          type: e.type,
          metadata: e.metadata || {},
          tags: e.tags || [],
        }));
        try {
          const res = await callAI({
            max_tokens: 1500,
            system: PROMPTS.ENTRY_AUDIT,
            brainId: activeBrain?.id,
            messages: [
              {
                role: "user",
                content: `Review these ${slim.length} entries:\n\n${JSON.stringify(slim)}`,
              },
            ],
          });
          const data = await res.json();
          const raw = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
          try {
            const p = JSON.parse(raw);
            if (Array.isArray(p)) entrySuggestions.push(...p);
          } catch {}
        } catch {}
      }),
    );

    /* Link discovery — embedding-powered pair selection */
    let linkSuggestions: RefineSuggestion[] = [];
    // Named links have a `rel` property; similarity-only links have `similarity`
    const namedLinkKeys = new Set(
      (links || [])
        .filter((l: RefineLink) => l.rel)
        .flatMap((l: RefineLink) => [`${l.from}-${l.to}`, `${l.to}-${l.from}`]),
    );
    // Find similarity pairs that don't already have a named relationship
    const similarityPairs = (links || [])
      .filter(
        (l: RefineLink) =>
          typeof l.similarity === "number" &&
          !namedLinkKeys.has(`${l.from}-${l.to}`) &&
          !namedLinkKeys.has(`${l.to}-${l.from}`),
      )
      .sort((a: RefineLink, b: RefineLink) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, 30);

    const entryMap: Record<string, Entry> = Object.fromEntries(
      entries.map((e: Entry) => [e.id, e]),
    );

    if (similarityPairs.length > 0) {
      // Embedding-powered: send pre-selected candidate pairs to AI for naming
      const PAIR_BATCH = 15;
      const pairBatches = [];
      for (let i = 0; i < similarityPairs.length; i += PAIR_BATCH)
        pairBatches.push(similarityPairs.slice(i, i + PAIR_BATCH));

      await Promise.all(
        pairBatches.map(async (batch: RefineLink[]) => {
          const candidates = batch
            .map((l: RefineLink) => {
              const a = entryMap[l.from],
                b = entryMap[l.to];
              if (!a || !b) return null;
              return {
                fromId: a.id,
                fromTitle: a.title,
                fromType: a.type,
                fromContent: (a.content || "").slice(0, 200),
                fromTags: (a.tags || []).slice(0, 6),
                toId: b.id,
                toTitle: b.title,
                toType: b.type,
                toContent: (b.content || "").slice(0, 200),
                toTags: (b.tags || []).slice(0, 6),
              };
            })
            .filter(Boolean);
          if (candidates.length === 0) return;
          try {
            const res = await callAI({
              max_tokens: 1200,
              system: PROMPTS.LINK_DISCOVERY_PAIRS,
              brainId: activeBrain?.id,
              messages: [
                { role: "user", content: `CANDIDATE PAIRS:\n${JSON.stringify(candidates)}` },
              ],
            });
            const data = await res.json();
            const raw = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
            try {
              const p = JSON.parse(raw);
              if (Array.isArray(p)) {
                linkSuggestions.push(
                  ...p
                    .filter(
                      (l: any) =>
                        l.fromId &&
                        l.toId &&
                        !existingLinkKeys.has(`${l.fromId}-${l.toId}`) &&
                        !existingLinkKeys.has(`${l.toId}-${l.fromId}`),
                    )
                    .map((l: any) => ({ ...l, type: "LINK_SUGGESTED" as const })),
                );
              }
            } catch {}
          } catch {}
        }),
      );
    } else {
      // Fallback: no embeddings — use old approach with first 60 entries
      try {
        const slim = entries.slice(0, 60).map((e: Entry) => ({
          id: e.id,
          title: e.title,
          type: e.type,
          content: (e.content || "").slice(0, 200),
          tags: (e.tags || []).slice(0, 6),
        }));
        const res = await callAI({
          max_tokens: 1200,
          system: PROMPTS.LINK_DISCOVERY,
          brainId: activeBrain?.id,
          messages: [
            {
              role: "user",
              content: `Entries:\n${JSON.stringify(slim)}\n\nExisting links (do NOT re-suggest these):\n${JSON.stringify([...existingLinkKeys])}`,
            },
          ],
        });
        const data = await res.json();
        const raw = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
        try {
          const p = JSON.parse(raw);
          if (Array.isArray(p)) {
            linkSuggestions = p
              .filter(
                (l: any) =>
                  l.fromId &&
                  l.toId &&
                  !existingLinkKeys.has(`${l.fromId}-${l.toId}`) &&
                  !existingLinkKeys.has(`${l.toId}-${l.fromId}`),
              )
              .map((l: any) => ({ ...l, type: "LINK_SUGGESTED" as const }));
          }
        } catch {}
      } catch {}
    }

    setSuggestions([...entrySuggestions, ...linkSuggestions]);
    setLoading(false);
  }, [loading, entries, links]);

  /* ── Accept an entry-quality suggestion ── */
  const applyEntry = useCallback(
    async (s: EntrySuggestion, override?: string) => {
      const value = override ?? s.suggestedValue;
      const key = `entry:${s.entryId}:${s.field}`;
      setApplying((p) => new Set(p).add(key));

      // Record learning
      if (activeBrain?.id) {
        recordDecision(activeBrain.id, {
          source: "refine",
          type: s.type,
          action: override ? "edit" : "accept",
          field: s.field,
          originalValue: s.suggestedValue,
          finalValue: value,
          reason: s.reason,
        });
      }

      const entry = entries.find((e: Entry) => e.id === s.entryId);
      if (!entry) {
        setApplying((p) => {
          const n = new Set(p);
          n.delete(key);
          return n;
        });
        return;
      }

      /* ── MERGE: combine two entries into one, delete the other ── */
      if (s.type === "MERGE_SUGGESTED") {
        const mergeTargetId = s.suggestedValue; // ID of entry to merge in
        const mergeTarget = entries.find((e: Entry) => e.id === mergeTargetId);
        if (mergeTarget) {
          // Combine content and tags into the primary entry
          const combinedContent = [entry.content, mergeTarget.content].filter(Boolean).join("\n\n");
          const combinedTags = [...new Set([...(entry.tags || []), ...(mergeTarget.tags || [])])];
          const combinedMeta = { ...(mergeTarget.metadata || {}), ...(entry.metadata || {}) };
          try {
            await authFetch("/api/update-entry", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: entry.id, content: combinedContent, tags: combinedTags, metadata: combinedMeta }),
            });
            await authFetch("/api/delete-entry", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: mergeTargetId }),
            });
            setEntries((prev) =>
              prev
                .map((e) => e.id === entry.id ? { ...e, content: combinedContent, tags: combinedTags, metadata: combinedMeta } : e)
                .filter((e) => e.id !== mergeTargetId),
            );
          } catch {}
        }
      } else {
        /* ── Standard field updates ── */
        const body: Record<string, any> = { id: entry.id };
        if (s.field === "type") body.type = value;
        else if (s.field === "title") body.title = value;
        else if (s.field === "tags") body.tags = value.split(",").map((t: string) => t.trim()).filter(Boolean);
        else if (s.field === "content") body.content = value;
        else if (s.field.startsWith("metadata.")) {
          const k = s.field.slice("metadata.".length);
          body.metadata = { ...(entry.metadata || {}), [k]: value };
        }

        try {
          await authFetch("/api/update-entry", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          setEntries((prev) =>
            prev.map((e) => {
              if (e.id !== entry.id) return e;
              if (s.field === "type") return { ...e, type: value as any };
              if (s.field === "title") return { ...e, title: value };
              if (s.field === "tags") return { ...e, tags: value.split(",").map((t: string) => t.trim()).filter(Boolean) };
              if (s.field === "content") return { ...e, content: value };
              if (s.field.startsWith("metadata.")) {
                const k = s.field.slice("metadata.".length);
                return { ...e, metadata: { ...(e.metadata || {}), [k]: value } };
              }
              return e;
            }),
          );
        } catch {}
      }

      setDismissed((p) => new Set(p).add(key));
      setApplying((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
      setEditingKey(null);
    },
    [entries, setEntries],
  );

  /* ── Accept a link suggestion ── */
  const applyLink = useCallback(
    async (s: LinkSuggestion, relOverride?: string) => {
      const rel = relOverride ?? s.rel;
      const key = `link:${s.fromId}:${s.toId}`;
      setApplying((p) => new Set(p).add(key));

      // Record learning
      if (activeBrain?.id) {
        recordDecision(activeBrain.id, {
          source: "refine",
          type: "LINK_SUGGESTED",
          action: relOverride ? "edit" : "accept",
          originalValue: s.rel,
          finalValue: rel,
          reason: s.reason,
        });
      }

      const newLink = { from: s.fromId, to: s.toId, rel };
      try {
        await authFetch("/api/save-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ links: [newLink] }),
        });
        addLinks?.([newLink]);
      } catch {}

      setDismissed((p) => new Set(p).add(key));
      setApplying((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
      setEditingKey(null);
    },
    [addLinks],
  );

  const reject = useCallback((key: string, s?: RefineSuggestion) => {
    setDismissed((p) => new Set(p).add(key));
    setEditingKey(null);
    // Record rejection learning
    if (s && activeBrain?.id) {
      recordDecision(activeBrain.id, {
        source: "refine",
        type: s.type,
        action: "reject",
        field: s.type === "LINK_SUGGESTED" ? undefined : (s as EntrySuggestion).field,
        originalValue: s.type === "LINK_SUGGESTED" ? (s as LinkSuggestion).rel : (s as EntrySuggestion).suggestedValue,
        reason: s.type === "LINK_SUGGESTED" ? (s as LinkSuggestion).reason : (s as EntrySuggestion).reason,
      });
    }
  }, [activeBrain?.id]);

  /* ── Key helpers ── */
  const keyOf = (s: RefineSuggestion): string =>
    s.type === "LINK_SUGGESTED"
      ? `link:${(s as LinkSuggestion).fromId}:${(s as LinkSuggestion).toId}`
      : `entry:${(s as EntrySuggestion).entryId}:${(s as EntrySuggestion).field}`;

  /* ── Derived state ── */
  const visible = (suggestions ?? []).filter((s) => !dismissed.has(keyOf(s)));
  const linkCount = visible.filter((s) => s.type === "LINK_SUGGESTED").length;
  const entryCount = visible.filter((s) => s.type !== "LINK_SUGGESTED").length;
  const allDone = suggestions !== null && suggestions.length > 0 && visible.length === 0;
  const noneFound = suggestions !== null && suggestions.length === 0;

  // Gate: non-owners of family/business brains cannot run Refine
  const isSharedBrain = activeBrain && activeBrain.type !== "personal";
  const isOwner = !activeBrain || activeBrain.myRole === "owner";
  const brainEmoji =
    activeBrain?.type === "business" ? "🏪" : activeBrain?.type === "family" ? "🏠" : "🧠";

  if (isSharedBrain && !isOwner) {
    return (
      <div className="px-4 py-4 space-y-4" style={{ background: "var(--color-background)", minHeight: "100%" }}>
        <div
          className="rounded-2xl p-8 text-center space-y-3"
          style={{ background: "var(--color-surface-container)", border: "1px solid var(--color-outline-variant)" }}
        >
          <div className="text-4xl">{brainEmoji}</div>
          <h2 className="text-xl font-semibold text-white" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            Refine — Owner Only
          </h2>
          <p style={{ color: "var(--color-on-surface-variant)" }} className="text-sm leading-relaxed">
            Only the owner of <strong className="text-white">{activeBrain.name}</strong> can
            run the Refine analysis.
            <br />
            Members can view and add entries, but AI auditing is reserved for the brain owner.
          </p>
          <div
            className="rounded-xl px-4 py-2 text-xs inline-block mt-2"
            style={{ background: "var(--color-primary-container)", color: "var(--color-primary)" }}
          >
            Ask the brain owner to run Refine and review the suggestions.
          </div>
        </div>
      </div>
    );
  }

  const BRAIN_EMOJI: Record<string, string> = { personal: "🧠", business: "🏪", family: "🏠" };
  const isOwnerMultiBrain = isOwner && brains.length > 1;

  return (
    <div className="px-4 py-4 space-y-4" style={{ background: "var(--color-background)", minHeight: "100%" }}>
      {/* Header */}
      <div className="space-y-3">
        <h2
          className="text-xl font-semibold text-white"
          style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
        >
          Refine{isSharedBrain ? ` — ${activeBrain.name}` : ""}
        </h2>
        <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
          AI skeptically audits every entry — and discovers missing relationships between them.
        </p>
        {activeBrain?.id && getDecisionCount(activeBrain.id) > 0 && (
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-primary)" }}>
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: "var(--color-primary)" }}
            />
            Learning from {getDecisionCount(activeBrain.id)} past decisions
          </div>
        )}
        {/* Brain selector — owners only, when multiple brains exist */}
        {isOwnerMultiBrain && onSwitchBrain && (
          <div className="flex flex-wrap gap-2 pt-1">
            {brains.map((b) => {
              const active = b.id === activeBrain?.id;
              return (
                <button
                  key={b.id}
                  onClick={() => onSwitchBrain(b)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-all"
                  style={{
                    background: active ? "var(--color-primary-container)" : "var(--color-surface-container)",
                    border: active ? "1px solid var(--color-primary)" : "1px solid var(--color-outline-variant)",
                    color: active ? "var(--color-primary)" : "var(--color-on-surface-variant)",
                  }}
                >
                  <span>{BRAIN_EMOJI[b.type || "personal"] || "🧠"}</span>
                  <span>{b.name}</span>
                </button>
              );
            })}
          </div>
        )}
        {!isOwnerMultiBrain && activeBrain && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
            style={{ background: "var(--color-surface-container)", border: "1px solid var(--color-outline-variant)", color: "var(--color-on-surface-variant)" }}
          >
            {BRAIN_EMOJI[activeBrain.type || "personal"] || "🧠"} {activeBrain.name}
          </span>
        )}
      </div>

      {/* Analyze button */}
      <button
        onClick={analyze}
        disabled={loading}
        className="w-full rounded-xl py-3 text-sm font-semibold tracking-wide transition-all"
        style={{
          background: loading ? "var(--color-surface-container-high)" : "var(--color-primary)",
          color: loading ? "var(--color-on-surface-variant)" : "var(--color-on-primary)",
          opacity: loading ? 0.6 : 1,
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
      >
        {loading ? "Analyzing…" : suggestions === null ? "✦ Analyze my brain" : "✦ Re-analyze"}
      </button>

      {/* Loading */}
      {loading && (
        <div
          className="rounded-2xl p-8 text-center space-y-3"
          style={{ background: "var(--color-surface-container)", border: "1px solid var(--color-outline-variant)" }}
        >
          <div className="text-3xl" style={{ color: "var(--color-primary)", animation: "typing-dot 2s ease-in-out infinite" }}>✦</div>
          <p className="text-sm font-medium text-on-surface-variant">
            Auditing {entries.length} entries + mapping relationships…
          </p>
          <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            Running entry quality + link discovery in parallel
          </p>
        </div>
      )}

      {/* Stats */}
      {suggestions !== null && !loading && (
        <div className="flex items-start gap-6 py-3 border-b" style={{ borderColor: "var(--color-outline-variant)" }}>
          {[
            { l: "Entries", v: entries.length },
            {
              l: "Fixes",
              v:
                visible.filter((s) => s.type !== "LINK_SUGGESTED").length +
                dismissed.size -
                linkCount,
            },
            { l: "Links", v: linkCount },
            { l: "Remaining", v: visible.length },
          ].map((s) => (
            <div key={s.l} className="flex flex-col gap-0.5">
              <span className="text-xl font-semibold text-white" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>{s.v}</span>
              <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--color-on-surface-variant)" }}>{s.l}</span>
            </div>
          ))}
        </div>
      )}

      {/* Nothing found */}
      {noneFound && !loading && (
        <div
          className="rounded-2xl p-8 text-center space-y-2"
          style={{ background: "var(--color-surface-container)", border: "1px solid var(--color-outline-variant)" }}
        >
          <div className="text-3xl" style={{ color: "var(--color-primary)" }}>✓</div>
          <p className="text-sm font-medium text-white">Everything looks clean</p>
          <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            No high-confidence improvements or missing links found
          </p>
        </div>
      )}

      {/* All done */}
      {allDone && !loading && (
        <div
          className="rounded-2xl p-8 text-center space-y-2"
          style={{ background: "var(--color-surface-container)", border: "1px solid var(--color-outline-variant)" }}
        >
          <div className="text-3xl" style={{ color: "var(--color-secondary)" }}>✦</div>
          <p className="text-sm font-medium text-white">All suggestions resolved</p>
          <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>Re-analyze to check again</p>
        </div>
      )}

      {/* Section labels */}
      {!loading && entryCount > 0 && (
        <p className="text-[10px] uppercase tracking-widest font-semibold pt-2" style={{ color: "var(--color-on-surface-variant)" }}>
          Entry fixes ({entryCount})
        </p>
      )}

      {/* Suggestion cards */}
      {visible.map((s) => {
        const key = keyOf(s);
        const meta = (LABELS as Record<string, { label: string; icon: string; variant: string }>)[
          s.type
        ] || { label: s.type, icon: "•", variant: "neutral" };
        const { bg: metaBg, text: metaText } = labelColors(meta.variant);
        const busy = applying.has(key);
        const isEdit = editingKey === key;
        const isLink = s.type === "LINK_SUGGESTED";
        const ls = s as LinkSuggestion;
        const es = s as EntrySuggestion;

        // Section divider before first link card
        const sIdx = visible.indexOf(s);
        const prevIsEntry = sIdx > 0 && visible[sIdx - 1].type !== "LINK_SUGGESTED";
        const showDivider = isLink && (sIdx === 0 || prevIsEntry);

        return (
          <div key={key}>
            {showDivider && (
              <p className="text-[10px] uppercase tracking-widest font-semibold pt-4 pb-1" style={{ color: "var(--color-on-surface-variant)" }}>
                Missing relationships ({linkCount})
              </p>
            )}

            <div
              className="rounded-2xl p-4 space-y-3"
              style={{ background: "var(--color-surface-container)", border: "1px solid var(--color-outline-variant)" }}
            >
              {isLink ? (
                /* ── Link card ── */
                <>
                  <div className="flex items-center justify-end">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                      style={{ background: metaBg, color: metaText }}
                    >
                      {meta.icon} {meta.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* From entry */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--color-on-surface-variant)" }}>From</div>
                      <div className="text-sm text-white truncate">
                        {(TC as Record<string, any>)[
                          entries.find((e) => e.id === ls.fromId)?.type || "note"
                        ]?.i || "📝"}{" "}
                        {ls.fromTitle}
                      </div>
                    </div>

                    {/* Rel label / edit input */}
                    <div className="flex-shrink-0 text-center px-2">
                      {isEdit ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editValue.trim())
                              applyLink(ls, editValue.trim());
                            if (e.key === "Escape") setEditingKey(null);
                          }}
                          placeholder="relationship…"
                          maxLength={50}
                          className="w-32 rounded-lg px-2 py-1 text-xs text-center outline-none"
                          style={{
                            background: "var(--color-surface)",
                            border: "1px solid var(--color-primary)",
                            color: "var(--color-on-surface)",
                          }}
                        />
                      ) : (
                        <span className="text-xs font-medium" style={{ color: "var(--color-primary)" }}>
                          ⟶ {ls.rel} ⟶
                        </span>
                      )}
                    </div>

                    {/* To entry */}
                    <div className="flex-1 min-w-0 text-right">
                      <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--color-on-surface-variant)" }}>To</div>
                      <div className="text-sm text-white truncate">
                        {(TC as Record<string, any>)[
                          entries.find((e) => e.id === ls.toId)?.type || "note"
                        ]?.i || "📝"}{" "}
                        {ls.toTitle}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs leading-relaxed" style={{ color: "var(--color-on-surface-variant)" }}>{ls.reason}</p>

                  <div className="flex items-center gap-2 pt-1">
                    {isEdit ? (
                      <>
                        <button
                          onClick={() => setEditingKey(null)}
                          className="flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-all"
                          style={{ background: "transparent", border: "1px solid var(--color-outline-variant)", color: "var(--color-on-surface-variant)" }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => editValue.trim() && applyLink(ls, editValue.trim())}
                          disabled={!editValue.trim() || busy}
                          className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                          style={{
                            background: !editValue.trim() || busy ? "var(--color-surface-container-highest)" : "var(--color-primary)",
                            color: !editValue.trim() || busy ? "var(--color-on-surface-variant)" : "var(--color-on-primary)",
                            border: "none",
                            opacity: !editValue.trim() || busy ? 0.5 : 1,
                          }}
                        >
                          Apply
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => reject(key, s)}
                          disabled={busy}
                          className="flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-all"
                          style={{ background: "transparent", border: "1px solid var(--color-outline-variant)", color: "var(--color-error)", opacity: busy ? 0.5 : 1 }}
                        >
                          ✗ Reject
                        </button>
                        <button
                          onClick={() => {
                            setEditingKey(key);
                            setEditValue(ls.rel);
                          }}
                          disabled={busy}
                          className="flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-all"
                          style={{ background: "transparent", border: "1px solid var(--color-outline-variant)", color: "var(--color-on-surface-variant)", opacity: busy ? 0.5 : 1 }}
                        >
                          ✎ Edit
                        </button>
                        <button
                          onClick={() => applyLink(ls)}
                          disabled={busy}
                          className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                          style={{
                            background: busy ? "var(--color-surface-container-highest)" : "var(--color-primary)",
                            color: busy ? "var(--color-on-surface-variant)" : "var(--color-on-primary)",
                            border: "none",
                            opacity: busy ? 0.5 : 1,
                          }}
                        >
                          {busy ? "Saving…" : "✓ Accept"}
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                /* ── Entry-quality card ── */
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-base">
                      {(TC as Record<string, any>)[
                        entries.find((e) => e.id === es.entryId)?.type || "note"
                      ]?.i || "📝"}
                    </span>
                    <span className="text-sm font-medium text-white truncate flex-1">
                      {es.entryTitle ||
                        entries.find((e) => e.id === es.entryId)?.title ||
                        es.entryId}
                    </span>
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[11px] font-medium flex-shrink-0"
                      style={{ background: `${meta.color}18`, color: meta.color }}
                    >
                      {meta.icon} {meta.label}
                    </span>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--color-on-surface-variant)" }}>Current</div>
                      <div
                        className="text-xs rounded-lg px-2.5 py-1.5 break-words"
                        style={{ background: "var(--color-surface-container)", color: "var(--color-on-surface-variant)" }}
                      >
                        {es.currentValue || <em style={{ color: "var(--color-on-surface-variant)" }}>empty</em>}
                      </div>
                    </div>
                    <span className="text-sm mt-5 flex-shrink-0" style={{ color: "var(--color-on-surface-variant)" }}>→</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--color-on-surface-variant)" }}>Suggested</div>
                      <div
                        className="text-xs rounded-lg px-2.5 py-1.5 break-words"
                        style={{ background: "var(--color-primary-container)", color: "var(--color-primary)" }}
                      >
                        {es.suggestedValue}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs leading-relaxed" style={{ color: "var(--color-on-surface-variant)" }}>{es.reason}</p>

                  {isEdit && (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && editValue.trim()) applyEntry(es, editValue.trim());
                        if (e.key === "Escape") setEditingKey(null);
                      }}
                      maxLength={50}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={{
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-primary)",
                        color: "var(--color-on-surface)",
                      }}
                    />
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    {isEdit ? (
                      <>
                        <button
                          onClick={() => setEditingKey(null)}
                          className="flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-all"
                          style={{ background: "transparent", border: "1px solid var(--color-outline-variant)", color: "var(--color-on-surface-variant)" }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => editValue.trim() && applyEntry(es, editValue.trim())}
                          disabled={!editValue.trim() || busy}
                          className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                          style={{
                            background: !editValue.trim() || busy ? "var(--color-surface-container-highest)" : "var(--color-primary)",
                            color: !editValue.trim() || busy ? "var(--color-on-surface-variant)" : "var(--color-on-primary)",
                            border: "none",
                            opacity: !editValue.trim() || busy ? 0.5 : 1,
                          }}
                        >
                          Apply
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => reject(key, s)}
                          disabled={busy}
                          className="flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-all"
                          style={{ background: "transparent", border: "1px solid var(--color-outline-variant)", color: "var(--color-error)", opacity: busy ? 0.5 : 1 }}
                        >
                          ✗ Reject
                        </button>
                        <button
                          onClick={() => {
                            setEditingKey(key);
                            setEditValue(es.suggestedValue);
                          }}
                          disabled={busy}
                          className="flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-all"
                          style={{ background: "transparent", border: "1px solid var(--color-outline-variant)", color: "var(--color-on-surface-variant)", opacity: busy ? 0.5 : 1 }}
                        >
                          ✎ Edit
                        </button>
                        <button
                          onClick={() => applyEntry(es)}
                          disabled={busy}
                          className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                          style={{
                            background: busy ? "var(--color-surface-container-highest)" : "var(--color-primary)",
                            color: busy ? "var(--color-on-surface-variant)" : "var(--color-on-primary)",
                            border: "none",
                            opacity: busy ? 0.5 : 1,
                          }}
                        >
                          {busy ? "Saving…" : "✓ Accept"}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
