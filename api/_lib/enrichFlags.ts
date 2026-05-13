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

interface EnrichmentFlags {
  parsed: boolean;
  has_insight: boolean;
  /** True once the concepts step has been attempted (gates pipeline re-runs).
   *  ⚠ This does NOT mean concepts were actually produced — see has_concepts. */
  concepts_extracted: boolean;
  /** True only when the entry has at least one concept stored. Use this for
   *  user-facing "is this enriched?" UI; an entry can have concepts_extracted
   *  but zero concepts when the LLM returned an empty array. */
  has_concepts: boolean;
  /** Count of concepts actually stored on the entry. */
  concepts_count: number;
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

function needsImportTypeClassification(entry: EntryShape): boolean {
  const meta = entry.metadata ?? {};
  const enr = meta.enrichment ?? {};
  const isImport = typeof meta.import_source === "string" || typeof meta.import_hash === "string";
  const type = String(entry.type || "note")
    .trim()
    .toLowerCase();
  return (
    isImport &&
    (type === "note" || type === "memory" || type === "other") &&
    typeof meta.capture_kind !== "string" &&
    enr.type_classified !== true
  );
}

export function flagsOf(entry: EntryShape): EnrichmentFlags {
  const meta = entry.metadata ?? {};
  const enr = meta.enrichment ?? {};
  const embeddingStatus = (entry.embedding_status as EnrichmentFlags["embedding_status"]) ?? null;
  const conceptsCount = Array.isArray(meta.concepts) ? meta.concepts.length : 0;
  // Persona entries are tiny single-sentence facts. Parse / insight /
  // concepts don't apply — the extractor IS the enrichment for them.
  // Treat the LLM flags as permanently satisfied so the chips render
  // green and the pipeline doesn't waste Gemini calls trying to "enrich"
  // a string like "User wakes at 5:30". Embedding stays accurate.
  const isPersona = entry.type === "persona";
  // Lists need different treatment. The parent row is the "Burgers" list;
  // items are literal title/description rows in metadata.items. Two of
  // the four LLM steps add no value here:
  //   parse   — no dates / phones / amounts to pull out of "- title: desc"
  //   insight — no "wow" to surface from a flat collection
  // Concepts and embedding DO add value (chat retrieval, concept graph)
  // and stay enabled. Skipping parse + insight also keeps capture's 30s
  // maxDuration comfortable for long imported lists; the previous full
  // pipeline was timing out on 50+ item PDFs.
  const isList = entry.type === "list";
  const importNeedsClassification = needsImportTypeClassification(entry);
  return {
    parsed: isPersona || isList || (enr.parsed === true && !importNeedsClassification),
    has_insight: isPersona || isList || enr.has_insight === true,
    concepts_extracted: isPersona || enr.concepts_extracted === true,
    has_concepts: isPersona || conceptsCount > 0,
    concepts_count: conceptsCount,
    embedded: embeddingStatus === "done" || !!entry.embedded_at,
    embedding_status: embeddingStatus,
    backfilled: !!enr.backfilled_at,
  };
}
