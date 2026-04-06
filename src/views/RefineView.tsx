import { useState, useCallback } from "react";
import { authFetch } from "../lib/authFetch";
import { callAI } from "../lib/ai";
import { TC, MODEL } from "../data/constants";
import { useTheme } from "../ThemeContext";
import { PROMPTS } from "../config/prompts";
import type { Entry, Brain, Link } from "../types";

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
const LABELS = {
  TYPE_MISMATCH: { label: "Wrong type", icon: "🔄", color: "#A29BFE" },
  PHONE_FOUND: { label: "Phone number", icon: "📞", color: "#45B7D1" },
  EMAIL_FOUND: { label: "Email address", icon: "✉️", color: "#4ECDC4" },
  URL_FOUND: { label: "URL / link", icon: "🔗", color: "#FFEAA7" },
  DATE_FOUND: { label: "Date / deadline", icon: "📅", color: "#FF6B35" },
  TITLE_POOR: { label: "Better title", icon: "✏️", color: "#DDA0DD" },
  SPLIT_SUGGESTED: { label: "Split entry", icon: "✂️", color: "#E17055" },
  MERGE_SUGGESTED: { label: "Merge entries", icon: "🔀", color: "#74B9FF" },
  CONTENT_WEAK: { label: "Needs content", icon: "📝", color: "#FDCB6E" },
  TAG_SUGGESTED: { label: "Add tags", icon: "🏷️", color: "#00CEC9" },
  LINK_SUGGESTED: { label: "Relationship", icon: "⟷", color: "#96CEB4" },
};

export default function RefineView({
  entries,
  setEntries,
  links,
  addLinks,
  activeBrain,
  brains,
  onSwitchBrain,
}: RefineViewProps) {
  const { t } = useTheme();
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

    /* Entry quality — batched */
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

  const reject = useCallback((key: string) => {
    setDismissed((p) => new Set(p).add(key));
    setEditingKey(null);
  }, []);

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
      <div className="px-5 py-10 text-center">
        <div className="mb-4 text-[32px]">{brainEmoji}</div>
        <h2 className="text-ob-text m-0 mb-2 text-base font-extrabold">Refine — Owner Only</h2>
        <p className="text-ob-text-faint m-0 mb-5 text-[13px] leading-relaxed">
          Only the owner of <strong className="text-ob-text-muted">{activeBrain.name}</strong> can
          run the Refine analysis.
          <br />
          Members can view and add entries, but AI auditing is reserved for the brain owner.
        </p>
        <div className="bg-ob-surface border-ob-border text-ob-text-dim inline-block rounded-xl border px-[18px] py-3.5 text-xs">
          Ask the brain owner to run Refine and review the suggestions.
        </div>
      </div>
    );
  }

  const BRAIN_EMOJI: Record<string, string> = { personal: "🧠", business: "🏪", family: "🏠" };
  const isOwnerMultiBrain = isOwner && brains.length > 1;

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-ob-text m-0 text-base font-extrabold">
          Refine{isSharedBrain ? ` — ${activeBrain.name}` : ""}
        </h2>
        <p className="text-ob-text-faint mt-1 mb-0 text-xs">
          AI skeptically audits every entry — and discovers missing relationships between them.
        </p>
        {/* Brain selector — owners only, when multiple brains exist */}
        {isOwnerMultiBrain && onSwitchBrain && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {brains.map((b) => {
              const active = b.id === activeBrain?.id;
              return (
                <button
                  key={b.id}
                  onClick={() => onSwitchBrain(b)}
                  className="flex min-h-11 min-w-11 cursor-pointer items-center gap-[5px] rounded-full text-[11px] font-semibold"
                  style={{
                    padding: "5px 12px",
                    border: active ? `1px solid ${t.accent}` : "1px solid #2a2a4a",
                    background: active ? `${t.accent}20` : "#1a1a2e",
                    color: active ? t.accent : "#888",
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
          <span className="text-ob-text-faint bg-ob-surface border-ob-border mt-2 inline-block rounded-full border px-3 py-1 text-[11px]">
            {BRAIN_EMOJI[activeBrain.type || "personal"] || "🧠"} {activeBrain.name}
          </span>
        )}
      </div>

      {/* Analyze button */}
      <button
        onClick={analyze}
        disabled={loading}
        className="mb-5 min-h-11 w-full rounded-[14px] border-0 text-sm font-bold"
        style={{
          padding: "14px 20px",
          background: !loading ? "linear-gradient(135deg, #A29BFE, #6C63FF)" : "#1a1a2e",
          color: !loading ? "#fff" : "#444",
          cursor: !loading ? "pointer" : "default",
        }}
      >
        {loading ? "Analyzing…" : suggestions === null ? "✦ Analyze my brain" : "✦ Re-analyze"}
      </button>

      {/* Loading */}
      {loading && (
        <div
          className="bg-ob-surface border-ob-border mb-5 rounded-[14px] border text-center"
          style={{ padding: "40px 20px" }}
        >
          <div className="mb-2.5 text-[22px]">✦</div>
          <p className="text-purple m-0 text-sm font-semibold">
            Auditing {entries.length} entries + mapping relationships…
          </p>
          <p className="text-ob-text-faint mt-1.5 mb-0 text-[11px]">
            Running entry quality + link discovery in parallel
          </p>
        </div>
      )}

      {/* Stats */}
      {suggestions !== null && !loading && (
        <div className="mb-5 flex gap-2">
          {[
            { l: "Entries", v: entries.length, c: "#A29BFE" },
            {
              l: "Fixes",
              v:
                visible.filter((s) => s.type !== "LINK_SUGGESTED").length +
                dismissed.size -
                linkCount,
              c: t.accent,
            },
            { l: "Links", v: linkCount, c: "#96CEB4" },
            { l: "Remaining", v: visible.length, c: "#FF6B35" },
          ].map((s) => (
            <div
              key={s.l}
              className="bg-ob-surface border-ob-border flex-1 rounded-[10px] border text-center"
              style={{ padding: "10px 6px" }}
            >
              <div className="text-lg font-extrabold" style={{ color: s.c }}>
                {s.v}
              </div>
              <div className="text-ob-text-faint mt-0.5 text-[9px] tracking-widest uppercase">
                {s.l}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Nothing found */}
      {noneFound && !loading && (
        <div
          className="bg-ob-surface border-ob-border rounded-[14px] border text-center"
          style={{ padding: "40px 20px" }}
        >
          <div className="mb-2.5 text-[26px]">✓</div>
          <p className="text-ob-accent m-0 text-[15px] font-bold">Everything looks clean</p>
          <p className="text-ob-text-faint mt-1.5 mb-0 text-xs">
            No high-confidence improvements or missing links found
          </p>
        </div>
      )}

      {/* All done */}
      {allDone && !loading && (
        <div
          className="bg-ob-surface border-ob-border rounded-[14px] border text-center"
          style={{ padding: "40px 20px" }}
        >
          <div className="mb-2.5 text-[26px]">✦</div>
          <p className="text-ob-accent m-0 text-[15px] font-bold">All suggestions resolved</p>
          <p className="text-ob-text-faint mt-1.5 mb-0 text-xs">Re-analyze to check again</p>
        </div>
      )}

      {/* Section labels */}
      {!loading && entryCount > 0 && (
        <p className="text-ob-text-faint m-0 mb-2.5 text-[10px] font-bold tracking-wider uppercase">
          Entry fixes ({entryCount})
        </p>
      )}

      {/* Suggestion cards */}
      {visible.map((s) => {
        const key = keyOf(s);
        const meta = (LABELS as Record<string, { label: string; icon: string; color: string }>)[
          s.type
        ] || { label: s.type, icon: "•", color: "#888" };
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
              <p className="text-ob-text-faint mt-4 mb-2.5 text-[10px] font-bold tracking-wider uppercase">
                Missing relationships ({linkCount})
              </p>
            )}

            <div
              className="bg-ob-surface mb-3 rounded-[14px] p-4"
              style={{ border: `1px solid ${meta.color}28` }}
            >
              {isLink ? (
                /* ── Link card ── */
                <>
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className="rounded-full text-[10px] font-bold"
                      style={{
                        background: `${meta.color}18`,
                        color: meta.color,
                        padding: "2px 9px",
                      }}
                    >
                      {meta.icon} {meta.label}
                    </span>
                  </div>

                  <div className="mb-2.5 flex items-center gap-2">
                    {/* From entry */}
                    <div className="bg-ob-bg border-ob-border flex-1 rounded-lg border px-3 py-2">
                      <div className="text-ob-text-faint mb-0.5 text-[9px] font-bold tracking-widest uppercase">
                        From
                      </div>
                      <div className="text-ob-text-mid text-[11px] font-semibold">
                        {(TC as Record<string, any>)[
                          entries.find((e) => e.id === ls.fromId)?.type || "note"
                        ]?.i || "📝"}{" "}
                        {ls.fromTitle}
                      </div>
                    </div>

                    {/* Rel label / edit input */}
                    <div className="shrink-0 text-center">
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
                          className="text-center font-[inherit] outline-none"
                          style={{
                            width: 90,
                            padding: "5px 8px",
                            background: "#0f0f23",
                            border: `1px solid ${meta.color}50`,
                            borderRadius: 6,
                            color: "#ddd",
                            fontSize: 11,
                          }}
                        />
                      ) : (
                        <span
                          className="text-[11px] font-bold whitespace-nowrap"
                          style={{ color: meta.color }}
                        >
                          ⟶ {ls.rel} ⟶
                        </span>
                      )}
                    </div>

                    {/* To entry */}
                    <div className="bg-ob-bg border-ob-border flex-1 rounded-lg border px-3 py-2">
                      <div className="text-ob-text-faint mb-0.5 text-[9px] font-bold tracking-widest uppercase">
                        To
                      </div>
                      <div className="text-ob-text-mid text-[11px] font-semibold">
                        {(TC as Record<string, any>)[
                          entries.find((e) => e.id === ls.toId)?.type || "note"
                        ]?.i || "📝"}{" "}
                        {ls.toTitle}
                      </div>
                    </div>
                  </div>

                  <p className="text-ob-text-faint m-0 mb-3 text-[11px] leading-normal italic">
                    {ls.reason}
                  </p>

                  <div className="flex gap-2">
                    {isEdit ? (
                      <>
                        <button
                          onClick={() => setEditingKey(null)}
                          className="text-ob-text-dim min-h-11 flex-1 cursor-pointer rounded-lg border-0 bg-[#252540] py-2 text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => editValue.trim() && applyLink(ls, editValue.trim())}
                          disabled={!editValue.trim() || busy}
                          className="min-h-11 flex-2 rounded-lg border-0 py-2 text-xs font-bold"
                          style={{
                            background:
                              editValue.trim() && !busy
                                ? `linear-gradient(135deg, #96CEB4, ${t.accent})`
                                : "#252540",
                            color: editValue.trim() && !busy ? "#0f0f23" : "#444",
                            cursor: editValue.trim() && !busy ? "pointer" : "default",
                          }}
                        >
                          Apply
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => reject(key)}
                          disabled={busy}
                          className="text-orange min-h-11 flex-1 cursor-pointer rounded-lg border-0 bg-[#252540] py-2 text-xs font-semibold"
                        >
                          ✗ Reject
                        </button>
                        <button
                          onClick={() => {
                            setEditingKey(key);
                            setEditValue(ls.rel);
                          }}
                          disabled={busy}
                          className="text-yellow min-h-11 flex-1 cursor-pointer rounded-lg border-0 bg-[#252540] py-2 text-xs font-semibold"
                        >
                          ✎ Edit
                        </button>
                        <button
                          onClick={() => applyLink(ls)}
                          disabled={busy}
                          className="min-h-11 flex-2 rounded-lg border-0 py-2 text-xs font-bold"
                          style={{
                            background: busy
                              ? "#252540"
                              : `linear-gradient(135deg, #96CEB4, ${t.accent})`,
                            color: busy ? "#444" : "#0f0f23",
                            cursor: busy ? "default" : "pointer",
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
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-sm">
                      {(TC as Record<string, any>)[
                        entries.find((e) => e.id === es.entryId)?.type || "note"
                      ]?.i || "📝"}
                    </span>
                    <span className="text-ob-text-mid flex-1 overflow-hidden text-xs font-semibold text-ellipsis whitespace-nowrap">
                      {es.entryTitle ||
                        entries.find((e) => e.id === es.entryId)?.title ||
                        es.entryId}
                    </span>
                    <span
                      className="shrink-0 rounded-full text-[10px] font-bold"
                      style={{
                        background: `${meta.color}18`,
                        color: meta.color,
                        padding: "2px 9px",
                      }}
                    >
                      {meta.icon} {meta.label}
                    </span>
                  </div>

                  <div className="mb-2.5 flex gap-2">
                    <div
                      className="flex-1 rounded-lg px-3 py-2"
                      style={{ background: "#FF6B3510", border: "1px solid #FF6B3525" }}
                    >
                      <div className="text-orange mb-[3px] text-[9px] font-bold tracking-widest uppercase">
                        Current
                      </div>
                      <div className="text-ob-text-muted text-xs leading-snug break-all">
                        {es.currentValue || <em className="text-ob-text-faint">empty</em>}
                      </div>
                    </div>
                    <span className="shrink-0 self-center text-sm text-[#444]">→</span>
                    <div className="bg-ob-accent-light border-ob-accent-border flex-1 rounded-lg border px-3 py-2">
                      <div className="text-ob-accent mb-[3px] text-[9px] font-bold tracking-widest uppercase">
                        Suggested
                      </div>
                      <div className="text-ob-text-soft text-xs leading-snug break-all">
                        {es.suggestedValue}
                      </div>
                    </div>
                  </div>

                  <p className="text-ob-text-faint m-0 mb-3 text-[11px] leading-normal italic">
                    {es.reason}
                  </p>

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
                      className="mb-2.5 box-border w-full font-[inherit] outline-none"
                      style={{
                        padding: "10px 14px",
                        background: "#0f0f23",
                        border: `1px solid ${meta.color}50`,
                        borderRadius: 8,
                        color: "#ddd",
                        fontSize: 13,
                      }}
                    />
                  )}

                  <div className="flex gap-2">
                    {isEdit ? (
                      <>
                        <button
                          onClick={() => setEditingKey(null)}
                          className="text-ob-text-dim min-h-11 flex-1 cursor-pointer rounded-lg border-0 bg-[#252540] py-2 text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => editValue.trim() && applyEntry(es, editValue.trim())}
                          disabled={!editValue.trim() || busy}
                          className="min-h-11 flex-2 rounded-lg border-0 py-2 text-xs font-bold"
                          style={{
                            background:
                              editValue.trim() && !busy
                                ? `linear-gradient(135deg, ${t.accent}, #45B7D1)`
                                : "#252540",
                            color: editValue.trim() && !busy ? "#0f0f23" : "#444",
                            cursor: editValue.trim() && !busy ? "pointer" : "default",
                          }}
                        >
                          Apply
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => reject(key)}
                          disabled={busy}
                          className="text-orange min-h-11 flex-1 cursor-pointer rounded-lg border-0 bg-[#252540] py-2 text-xs font-semibold"
                        >
                          ✗ Reject
                        </button>
                        <button
                          onClick={() => {
                            setEditingKey(key);
                            setEditValue(es.suggestedValue);
                          }}
                          disabled={busy}
                          className="text-yellow min-h-11 flex-1 cursor-pointer rounded-lg border-0 bg-[#252540] py-2 text-xs font-semibold"
                        >
                          ✎ Edit
                        </button>
                        <button
                          onClick={() => applyEntry(es)}
                          disabled={busy}
                          className="min-h-11 flex-2 rounded-lg border-0 py-2 text-xs font-bold"
                          style={{
                            background: busy
                              ? "#252540"
                              : `linear-gradient(135deg, ${t.accent}, #45B7D1)`,
                            color: busy ? "#444" : "#0f0f23",
                            cursor: busy ? "default" : "pointer",
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
