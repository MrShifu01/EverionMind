import { getDecisionCount } from "../lib/learningEngine";
import { useRefineAnalysis } from "../hooks/useRefineAnalysis";
import { TC } from "../data/constants";
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
  brains: _brains,
  onSwitchBrain: _onSwitchBrain,
}: RefineViewProps) {
  const {
    loading,
    suggestions,
    dismissed,
    applying,
    editingKey, setEditingKey,
    editValue, setEditValue,
    visible, linkCount, entryCount, allDone, noneFound,
    analyze,
    applyEntry,
    applyLink,
    reject,
    keyOf,
  } = useRefineAnalysis({ entries, links, activeBrain, setEntries, addLinks });

  const isSharedBrain = activeBrain && activeBrain.type !== "personal";
  const isOwner = !activeBrain || activeBrain.myRole === "owner";
  const brainEmoji =
    activeBrain?.type === "business" ? "🏪" : activeBrain?.type === "family" ? "🏠" : "🧠";

  if (isSharedBrain && !isOwner) {
    return (
      <div
        className="space-y-4 px-4 py-4"
        style={{ background: "var(--color-background)", minHeight: "100%" }}
      >
        <div
          className="space-y-3 rounded-2xl p-8 text-center"
          style={{
            background: "var(--color-surface-container)",
            border: "1px solid var(--color-outline-variant)",
          }}
        >
          <div className="text-4xl">{brainEmoji}</div>
          <h2
            className="text-xl font-semibold text-[var(--color-on-surface)]"
            style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
          >
            Refine — Owner Only
          </h2>
          <p
            style={{ color: "var(--color-on-surface-variant)" }}
            className="text-sm leading-relaxed"
          >
            Only the owner of{" "}
            <strong className="text-[var(--color-on-surface)]">{activeBrain.name}</strong> can run
            the Refine analysis.
            <br />
            Members can view and add entries, but AI auditing is reserved for the brain owner.
          </p>
          <div
            className="mt-2 inline-block rounded-xl px-4 py-2 text-xs"
            style={{ background: "var(--color-primary-container)", color: "var(--color-primary)" }}
          >
            Ask the brain owner to run Refine and review the suggestions.
          </div>
        </div>
      </div>
    );
  }

  const BRAIN_EMOJI: Record<string, string> = { personal: "🧠", business: "🏪", family: "🏠" };

  return (
    <div
      className="space-y-4 px-4 py-4"
      style={{ background: "var(--color-background)", minHeight: "100%" }}
    >
      {/* Header */}
      <div className="space-y-3">
        <h2
          className="text-xl font-semibold text-[var(--color-on-surface)]"
          style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
        >
          Refine{isSharedBrain ? ` — ${activeBrain.name}` : ""}
        </h2>
        <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
          AI skeptically audits every entry — and discovers missing relationships between them.
        </p>
        {activeBrain?.id && getDecisionCount(activeBrain.id) > 0 && (
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: "var(--color-primary)" }}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "var(--color-primary)" }}
            />
            Learning from {getDecisionCount(activeBrain.id)} past decisions
          </div>
        )}
        {activeBrain && (
          <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            Analysing{" "}
            <strong className="text-on-surface">
              {BRAIN_EMOJI[activeBrain.type || "personal"] || "🧠"} {activeBrain.name}
            </strong>
          </p>
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
        {loading ? "Analyzing…" : suggestions === null ? "✶ Analyze my brain" : "✶ Re-analyze"}
      </button>

      {/* Loading */}
      {loading && (
        <div
          className="space-y-3 rounded-2xl p-8 text-center"
          style={{
            background: "var(--color-surface-container)",
            border: "1px solid var(--color-outline-variant)",
          }}
        >
          <div
            className="text-3xl"
            style={{
              color: "var(--color-primary)",
              animation: "typing-dot 2s ease-in-out infinite",
            }}
          >
            ✶
          </div>
          <p className="text-on-surface-variant text-sm font-medium">
            Auditing {entries.length} entries + mapping relationships…
          </p>
          <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            Running entry quality + link discovery in parallel
          </p>
        </div>
      )}

      {/* Stats */}
      {suggestions !== null && !loading && (
        <div
          className="flex items-start gap-6 border-b py-3"
          style={{ borderColor: "var(--color-outline-variant)" }}
        >
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
              <span
                className="text-xl font-semibold text-[var(--color-on-surface)]"
                style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
              >
                {s.v}
              </span>
              <span
                className="text-[10px] tracking-[0.1em] uppercase"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                {s.l}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Nothing found */}
      {noneFound && !loading && (
        <div
          className="space-y-2 rounded-2xl p-8 text-center"
          style={{
            background: "var(--color-surface-container)",
            border: "1px solid var(--color-outline-variant)",
          }}
        >
          <div className="text-3xl" style={{ color: "var(--color-primary)" }}>
            ✓
          </div>
          <p className="text-sm font-medium text-[var(--color-on-surface)]">
            Everything looks clean
          </p>
          <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            No high-confidence improvements or missing links found
          </p>
        </div>
      )}

      {/* All done */}
      {allDone && !loading && (
        <div
          className="space-y-2 rounded-2xl p-8 text-center"
          style={{
            background: "var(--color-surface-container)",
            border: "1px solid var(--color-outline-variant)",
          }}
        >
          <div className="text-3xl" style={{ color: "var(--color-secondary)" }}>
            ✶
          </div>
          <p className="text-sm font-medium text-[var(--color-on-surface)]">
            All suggestions resolved
          </p>
          <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            Re-analyze to check again
          </p>
        </div>
      )}

      {!loading && entryCount > 0 && (
        <p
          className="pt-2 text-[10px] font-semibold tracking-widest uppercase"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
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

        const sIdx = visible.indexOf(s);
        const prevIsEntry = sIdx > 0 && visible[sIdx - 1].type !== "LINK_SUGGESTED";
        const showDivider = isLink && (sIdx === 0 || prevIsEntry);

        return (
          <div key={key}>
            {showDivider && (
              <p
                className="pt-4 pb-1 text-[10px] font-semibold tracking-widest uppercase"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                Missing relationships ({linkCount})
              </p>
            )}
            <div
              className="space-y-3 rounded-2xl p-4"
              style={{
                background: "var(--color-surface-container)",
                border: "1px solid var(--color-outline-variant)",
              }}
            >
              {isLink ? (
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
                    <div className="min-w-0 flex-1">
                      <div
                        className="mb-1 text-[10px] tracking-widest uppercase"
                        style={{ color: "var(--color-on-surface-variant)" }}
                      >
                        From
                      </div>
                      <div className="truncate text-sm text-[var(--color-on-surface)]">
                        {(TC as Record<string, any>)[
                          entries.find((e) => e.id === ls.fromId)?.type || "note"
                        ]?.i || "📝"}{" "}
                        {ls.fromTitle}
                      </div>
                    </div>
                    <div className="flex-shrink-0 px-2 text-center">
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
                          className="w-32 rounded-lg px-2 py-1 text-center text-xs outline-none"
                          style={{
                            background: "var(--color-surface)",
                            border: "1px solid var(--color-primary)",
                            color: "var(--color-on-surface)",
                          }}
                        />
                      ) : (
                        <span
                          className="text-xs font-medium"
                          style={{ color: "var(--color-primary)" }}
                        >
                          ⟶ {ls.rel} ⟶
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 text-right">
                      <div
                        className="mb-1 text-[10px] tracking-widest uppercase"
                        style={{ color: "var(--color-on-surface-variant)" }}
                      >
                        To
                      </div>
                      <div className="truncate text-sm text-[var(--color-on-surface)]">
                        {(TC as Record<string, any>)[
                          entries.find((e) => e.id === ls.toId)?.type || "note"
                        ]?.i || "📝"}{" "}
                        {ls.toTitle}
                      </div>
                    </div>
                  </div>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    {ls.reason}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    {isEdit ? (
                      <>
                        <button
                          onClick={() => setEditingKey(null)}
                          className="flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-all"
                          style={{
                            background: "transparent",
                            border: "1px solid var(--color-outline-variant)",
                            color: "var(--color-on-surface-variant)",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => editValue.trim() && applyLink(ls, editValue.trim())}
                          disabled={!editValue.trim() || busy}
                          className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                          style={{
                            background:
                              !editValue.trim() || busy
                                ? "var(--color-surface-container-highest)"
                                : "var(--color-primary)",
                            color:
                              !editValue.trim() || busy
                                ? "var(--color-on-surface-variant)"
                                : "var(--color-on-primary)",
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
                          style={{
                            background: "transparent",
                            border: "1px solid var(--color-outline-variant)",
                            color: "var(--color-error)",
                            opacity: busy ? 0.5 : 1,
                          }}
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
                          style={{
                            background: "transparent",
                            border: "1px solid var(--color-outline-variant)",
                            color: "var(--color-on-surface-variant)",
                            opacity: busy ? 0.5 : 1,
                          }}
                        >
                          ✎ Edit
                        </button>
                        <button
                          onClick={() => applyLink(ls)}
                          disabled={busy}
                          className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                          style={{
                            background: busy
                              ? "var(--color-surface-container-highest)"
                              : "var(--color-primary)",
                            color: busy
                              ? "var(--color-on-surface-variant)"
                              : "var(--color-on-primary)",
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
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-base">
                      {(TC as Record<string, any>)[
                        entries.find((e) => e.id === es.entryId)?.type || "note"
                      ]?.i || "📝"}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium text-[var(--color-on-surface)]">
                      {es.entryTitle ||
                        entries.find((e) => e.id === es.entryId)?.title ||
                        es.entryId}
                    </span>
                    <span
                      className="flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                      style={{ background: metaBg, color: metaText }}
                    >
                      {meta.icon} {meta.label}
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div
                        className="mb-1 text-[10px] tracking-widest uppercase"
                        style={{ color: "var(--color-on-surface-variant)" }}
                      >
                        Current
                      </div>
                      <div
                        className="rounded-lg px-2.5 py-1.5 text-xs break-words"
                        style={{
                          background: "var(--color-surface-container)",
                          color: "var(--color-on-surface-variant)",
                        }}
                      >
                        {es.currentValue || (
                          <em style={{ color: "var(--color-on-surface-variant)" }}>empty</em>
                        )}
                      </div>
                    </div>
                    <span
                      className="mt-5 flex-shrink-0 text-sm"
                      style={{ color: "var(--color-on-surface-variant)" }}
                    >
                      →
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className="mb-1 text-[10px] tracking-widest uppercase"
                        style={{ color: "var(--color-on-surface-variant)" }}
                      >
                        Suggested
                      </div>
                      <div
                        className="rounded-lg px-2.5 py-1.5 text-xs break-words"
                        style={{
                          background: "var(--color-primary-container)",
                          color: "var(--color-primary)",
                        }}
                      >
                        {es.suggestedValue}
                      </div>
                    </div>
                  </div>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
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
                          style={{
                            background: "transparent",
                            border: "1px solid var(--color-outline-variant)",
                            color: "var(--color-on-surface-variant)",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => editValue.trim() && applyEntry(es, editValue.trim())}
                          disabled={!editValue.trim() || busy}
                          className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                          style={{
                            background:
                              !editValue.trim() || busy
                                ? "var(--color-surface-container-highest)"
                                : "var(--color-primary)",
                            color:
                              !editValue.trim() || busy
                                ? "var(--color-on-surface-variant)"
                                : "var(--color-on-primary)",
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
                          style={{
                            background: "transparent",
                            border: "1px solid var(--color-outline-variant)",
                            color: "var(--color-error)",
                            opacity: busy ? 0.5 : 1,
                          }}
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
                          style={{
                            background: "transparent",
                            border: "1px solid var(--color-outline-variant)",
                            color: "var(--color-on-surface-variant)",
                            opacity: busy ? 0.5 : 1,
                          }}
                        >
                          ✎ Edit
                        </button>
                        <button
                          onClick={() => applyEntry(es)}
                          disabled={busy}
                          className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                          style={{
                            background: busy
                              ? "var(--color-surface-container-highest)"
                              : "var(--color-primary)",
                            color: busy
                              ? "var(--color-on-surface-variant)"
                              : "var(--color-on-primary)",
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
