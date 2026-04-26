/**
 * Pure-presentation pieces lifted out of EntryList.tsx so that file can shrink
 * toward holding only the list orchestration (virtualizer, selection mode,
 * sorting). Each export here renders from props alone — no shared state with
 * the parent.
 */

import { flagsOf } from "../lib/enrichFlags";
import type { Entry } from "../types";

/** Small pin glyph used on entry cards. 12×12 to match the card's tag row. */
export const IconPin = (
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

/** 12×12 vault padlock. captureIcons has an 18×18 sibling for the sheet. */
export const IconVaultSmall = (
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

/** Three-dot pulsing indicator for entries currently being enriched. */
export function EnrichingDot() {
  return (
    <span className="enriching-dot" aria-label="AI processing" title="AI enriching…">
      <span /><span /><span />
    </span>
  );
}

/**
 * Admin-only diagnostic chip cluster — four letters (P/I/C/E) showing which
 * enrichment flags are set. Hidden for non-admins. Reads from the shared
 * flagsOf helper so the chips always agree with what the pipeline considers
 * "done."
 */
export function EnrichFlagChips({ entry }: { entry: Entry }) {
  const flags = flagsOf(entry);
  const embedFailed = flags.embedding_status === "failed";
  const chip = (label: string, state: "on" | "off" | "warn", title: string) => {
    const palette = {
      on: { bg: "color-mix(in oklch, var(--moss) 18%, transparent)", fg: "var(--moss)" },
      off: { bg: "color-mix(in oklch, var(--blood) 14%, transparent)", fg: "var(--blood)" },
      warn: { bg: "color-mix(in oklch, var(--ember) 22%, transparent)", fg: "var(--ember)" },
    }[state];
    return (
      <span
        title={title}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 14,
          height: 14,
          borderRadius: 3,
          fontSize: 9,
          fontWeight: 700,
          fontFamily: "var(--f-mono)",
          background: palette.bg,
          color: palette.fg,
          letterSpacing: 0,
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    );
  };
  const embedState: "on" | "off" | "warn" = embedFailed ? "warn" : flags.embedded ? "on" : "off";
  const embedTitle = embedFailed
    ? "embedding failed — won't appear in semantic search"
    : flags.embedded
      ? "embedded"
      : "embedding pending";
  return (
    <span style={{ display: "inline-flex", gap: 2, flexShrink: 0 }} aria-hidden="true">
      {chip("P", flags.parsed ? "on" : "off", "parsed")}
      {chip("I", flags.has_insight ? "on" : "off", "insight")}
      {chip("C", flags.concepts_extracted ? "on" : "off", "concepts")}
      {chip("E", embedState, embedTitle)}
      {flags.backfilled && chip("B", "on", "backfilled — not really enriched")}
    </span>
  );
}
