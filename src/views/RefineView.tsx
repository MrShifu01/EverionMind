import { type ReactNode } from "react";
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

interface WeakLabelSuggestion {
  type: "WEAK_LABEL";
  fromId: string;
  toId: string;
  fromTitle?: string;
  toTitle?: string;
  currentRel: string;
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
function SvgRefresh() { return <svg className="inline h-3 w-3 align-middle" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>; }
function SvgPhone() { return <svg className="inline h-3 w-3 align-middle" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>; }
function SvgEnvelope() { return <svg className="inline h-3 w-3 align-middle" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>; }
function SvgLink() { return <svg className="inline h-3 w-3 align-middle" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>; }
function SvgCalendar() { return <svg className="inline h-3 w-3 align-middle" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>; }
function SvgPencil() { return <svg className="inline h-3 w-3 align-middle" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>; }
function SvgScissors() { return <svg className="inline h-3 w-3 align-middle" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.848 8.25l1.536.887M7.848 8.25a3 3 0 11-5.196-3 3 3 0 015.196 3zm1.536.887a2.165 2.165 0 011.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 11-5.196 3 3 3 0 015.196-3zm1.536-.887a2.165 2.165 0 001.083-1.838c.005-.352.054-.695.14-1.025m-1.223 2.863l2.077-1.199m0-3.328a4.323 4.323 0 012.068-1.379l5.325-1.628a4.5 4.5 0 012.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.331 4.331 0 0010.607 12m3.136 1.328l7.794 4.5-.802.215a4.5 4.5 0 01-2.48-.043l-5.326-1.629a4.324 4.324 0 01-2.068-1.379M14.25 9l-3 1.5" /></svg>; }
function SvgArrows() { return <svg className="inline h-3 w-3 align-middle" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>; }
function SvgDocument() { return <svg className="inline h-3 w-3 align-middle" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>; }
function SvgTag() { return <svg className="inline h-3 w-3 align-middle" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>; }
function SvgArrowsLR() { return <svg className="inline h-3 w-3 align-middle" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5H21M16.5 3L21 7.5m0 0L16.5 12M21 7.5H3" /></svg>; }
function SvgLock() { return <svg className="inline h-3 w-3 align-middle" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>; }
function SvgCluster() { return <svg className="inline h-3 w-3 align-middle" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>; }

const LABELS: Record<string, { label: string; icon: ReactNode; variant: string }> = {
  TYPE_MISMATCH: { label: "Wrong type", icon: <SvgRefresh />, variant: "neutral" },
  PHONE_FOUND: { label: "Phone number", icon: <SvgPhone />, variant: "primary" },
  EMAIL_FOUND: { label: "Email address", icon: <SvgEnvelope />, variant: "primary" },
  URL_FOUND: { label: "URL / link", icon: <SvgLink />, variant: "neutral" },
  DATE_FOUND: { label: "Date / deadline", icon: <SvgCalendar />, variant: "primary" },
  TITLE_POOR: { label: "Better title", icon: <SvgPencil />, variant: "neutral" },
  SPLIT_SUGGESTED: { label: "Split entry", icon: <SvgScissors />, variant: "neutral" },
  MERGE_SUGGESTED: { label: "Merge entries", icon: <SvgArrows />, variant: "neutral" },
  CONTENT_WEAK: { label: "Needs content", icon: <SvgDocument />, variant: "neutral" },
  TAG_SUGGESTED: { label: "Add tags", icon: <SvgTag />, variant: "neutral" },
  LINK_SUGGESTED: { label: "Relationship", icon: <SvgArrowsLR />, variant: "primary" },
  SENSITIVE_DATA: { label: "Sensitive data", icon: <SvgLock />, variant: "primary" },
  ORPHAN_DETECTED: { label: "No connections", icon: <SvgTag />, variant: "neutral" },
  STALE_REMINDER: { label: "Overdue", icon: <SvgCalendar />, variant: "primary" },
  DEAD_URL: { label: "Dead link", icon: <SvgLink />, variant: "primary" },
  WEAK_LABEL: { label: "Vague relationship", icon: <SvgArrowsLR />, variant: "neutral" },
  DUPLICATE_ENTRY: { label: "Duplicate", icon: <SvgArrows />, variant: "primary" },
  CLUSTER_SUGGESTED: { label: "Create hub entry", icon: <SvgCluster />, variant: "primary" },
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
    applyWeakLabel,
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
        const meta = LABELS[s.type] || { label: s.type, icon: <span>•</span>, variant: "neutral" };
        const { bg: metaBg, text: metaText } = labelColors(meta.variant);
        const busy = applying.has(key);
        const isEdit = editingKey === key;
        const isLink = s.type === "LINK_SUGGESTED" || s.type === "WEAK_LABEL";
        const ls = s as LinkSuggestion;
        const ws = s as WeakLabelSuggestion;
        const es = s as EntrySuggestion;

        const sIdx = visible.indexOf(s);
        const prevIsEntry = sIdx > 0 && visible[sIdx - 1].type !== "LINK_SUGGESTED" && visible[sIdx - 1].type !== "WEAK_LABEL";
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
                          entries.find((e) => e.id === (isLink && s.type === "WEAK_LABEL" ? ws.fromId : ls.fromId))?.type || "note"
                        ]?.i || "📝"}{" "}
                        {s.type === "WEAK_LABEL" ? ws.fromTitle : ls.fromTitle}
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
                              s.type === "WEAK_LABEL" ? applyWeakLabel(ws, editValue.trim()) : applyLink(ls, editValue.trim());
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
                          {s.type === "WEAK_LABEL"
                            ? <><s style={{ opacity: 0.5 }}>{ws.currentRel}</s> → {ws.rel}</>
                            : <>⟶ {ls.rel} ⟶</>}
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
                          entries.find((e) => e.id === (s.type === "WEAK_LABEL" ? ws.toId : ls.toId))?.type || "note"
                        ]?.i || "📝"}{" "}
                        {s.type === "WEAK_LABEL" ? ws.toTitle : ls.toTitle}
                      </div>
                    </div>
                  </div>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    {s.type === "WEAK_LABEL" ? ws.reason : ls.reason}
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
                          onClick={() => editValue.trim() && (s.type === "WEAK_LABEL" ? applyWeakLabel(ws, editValue.trim()) : applyLink(ls, editValue.trim()))}
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
                            setEditValue(s.type === "WEAK_LABEL" ? ws.rel : ls.rel);
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
                          onClick={() => s.type === "WEAK_LABEL" ? applyWeakLabel(ws) : applyLink(ls)}
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
