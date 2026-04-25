// ============================================================
// Single source of truth for "is this entry enriched?".
// ============================================================
//
// Used by:
//   - the inline pipeline (decides which steps to run)
//   - the diagnostic endpoint (counts pending / done)
//   - the EntryList card chips (P/I/C/E indicators)
//   - the wave-dot heuristic (isPending)
//
// Rules:
//   - Explicit booleans only. No fallback heuristics — if a flag
//     isn't `true`, the step needs to run.
//   - Legacy data is stamped explicitly via migration 045 before this
//     module replaces the old isParsed/hasInsight/hasConcepts helpers.
//   - Embedding lives on its own column path, not inside metadata.
//     `embedded` is true when embedding_status='done' OR embedded_at
//     is non-null.

export interface EnrichmentFlags {
  parsed: boolean;
  has_insight: boolean;
  concepts_extracted: boolean;
  embedded: boolean;
  /** "done" | "pending" | "failed" | null — surfaces the embedding state for the UI. */
  embedding_status: "done" | "pending" | "failed" | null;
  /** True if this entry was stamped by the silence-the-dot backfill rather than really enriched. */
  backfilled: boolean;
}

interface EntryShape {
  type?: string | null;
  metadata?: Record<string, any> | null;
  embedded_at?: string | null;
  embedding_status?: string | null;
}

export function flagsOf(entry: EntryShape): EnrichmentFlags {
  const meta = entry.metadata ?? {};
  const enr = meta.enrichment ?? {};
  const embeddingStatus = (entry.embedding_status as EnrichmentFlags["embedding_status"]) ?? null;
  return {
    parsed: enr.parsed === true,
    has_insight: enr.has_insight === true,
    concepts_extracted: enr.concepts_extracted === true,
    embedded: embeddingStatus === "done" || !!entry.embedded_at,
    embedding_status: embeddingStatus,
    backfilled: !!enr.backfilled_at,
  };
}

/**
 * Secrets are excluded from enrichment entirely — we never send them
 * through an LLM, never extract concepts. They're "fully enriched" by
 * definition for UI purposes (no wave-dot, no flag chips).
 */
export function isFullyEnriched(entry: EntryShape): boolean {
  if (entry.type === "secret") return true;
  const f = flagsOf(entry);
  return f.parsed && f.has_insight && f.concepts_extracted && f.embedded;
}

/**
 * What the wave-dot uses. True when at least one enrichment step is
 * still outstanding. Embedding failure is NOT pending — it's its own
 * terminal state with its own indicator.
 */
export function isPendingEnrichment(entry: EntryShape): boolean {
  if (entry.type === "secret") return false;
  const f = flagsOf(entry);
  if (f.embedding_status === "failed") return false;
  return !f.parsed || !f.has_insight || !f.concepts_extracted || !f.embedded;
}
