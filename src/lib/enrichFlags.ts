// ============================================================
// Single source of truth for "is this entry enriched?" — client mirror
// of api/_lib/enrichFlags.ts. Same rules, same outputs.
// ============================================================
//
// Keep this in sync with api/_lib/enrichFlags.ts. They exist as two
// files because the server and client have different module systems
// (Vercel functions are .js after build, the client is bundled by Vite).
// The logic is small enough that duplication is cheaper than introducing
// a shared package.

import type { Entry } from "../types";

interface EnrichmentFlags {
  parsed: boolean;
  has_insight: boolean;
  /** True once the concepts step has been attempted. Does NOT mean concepts
   *  were actually produced — use has_concepts for honest UI rendering. */
  concepts_extracted: boolean;
  /** True only when the entry has at least one concept stored. */
  has_concepts: boolean;
  /** Count of concepts actually stored on the entry. */
  concepts_count: number;
  embedded: boolean;
  embedding_status: "done" | "pending" | "failed" | null;
  backfilled: boolean;
}

function needsImportTypeClassification(entry: Entry): boolean {
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

export function flagsOf(entry: Entry): EnrichmentFlags {
  const meta = entry.metadata ?? {};
  const enr = meta.enrichment ?? {};
  const embeddingStatus = entry.embedding_status ?? null;
  const conceptsCount = Array.isArray(meta.concepts) ? meta.concepts.length : 0;
  const isPersona = entry.type === "persona";
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

export function isPendingEnrichment(entry: Entry): boolean {
  if (entry.type === "secret") return false;
  const f = flagsOf(entry);
  if (f.embedding_status === "failed") return false;
  return !f.parsed || !f.has_insight || !f.concepts_extracted || !f.embedded;
}
