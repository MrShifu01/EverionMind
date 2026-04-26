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

export interface EnrichmentFlags {
  parsed: boolean;
  has_insight: boolean;
  concepts_extracted: boolean;
  embedded: boolean;
  embedding_status: "done" | "pending" | "failed" | null;
  backfilled: boolean;
}

export function flagsOf(entry: Entry): EnrichmentFlags {
  const meta = (entry.metadata as any) ?? {};
  const enr = meta.enrichment ?? {};
  const embeddingStatus = ((entry as any).embedding_status as EnrichmentFlags["embedding_status"]) ?? null;
  return {
    parsed: enr.parsed === true,
    has_insight: enr.has_insight === true,
    concepts_extracted: enr.concepts_extracted === true,
    embedded: embeddingStatus === "done" || !!(entry as any).embedded_at,
    embedding_status: embeddingStatus,
    backfilled: !!enr.backfilled_at,
  };
}

export function isFullyEnriched(entry: Entry): boolean {
  if (entry.type === "secret") return true;
  const f = flagsOf(entry);
  return f.parsed && f.has_insight && f.concepts_extracted && f.embedded;
}

export function isPendingEnrichment(entry: Entry): boolean {
  if (entry.type === "secret") return false;
  const f = flagsOf(entry);
  if (f.embedding_status === "failed") return false;
  return !f.parsed || !f.has_insight || !f.concepts_extracted || !f.embedded;
}
