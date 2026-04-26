import type { Entry } from "../types";
import { scoreEntryForQuery } from "./entryScorer";

const index = new Map<string, Set<string>>();

export function scoreEntry(entry: Entry, query: string): number {
  return scoreEntryForQuery(entry, query);
}

const SKIP_META = new Set(["enrichment", "confidence", "ai_insight_short", "merge_note"]);

export function indexEntry(entry: Entry): void {
  // Include metadata string/number values (ai_insight, supplier info, etc.)
  let metaText = "";
  if (entry.metadata && typeof entry.metadata === "object") {
    metaText = Object.entries(entry.metadata as Record<string, unknown>)
      .filter(([k]) => !SKIP_META.has(k))
      .map(([, v]) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : ""))
      .join(" ");
  }
  const tokens = tokenize(
    `${entry.title} ${entry.content || ""} ${(entry.tags || []).join(" ")} ${metaText}`,
  );
  tokens.forEach((token) => {
    if (!index.has(token)) index.set(token, new Set());
    index.get(token)!.add(entry.id);
  });
}

/** Index concept names for an entry — call after concept graph loads. */
export function indexEntryConcepts(entryId: string, concepts: string[]): void {
  concepts.forEach((concept) => {
    tokenize(concept).forEach((token) => {
      if (!index.has(token)) index.set(token, new Set());
      index.get(token)!.add(entryId);
    });
  });
}

export function removeFromIndex(entryId: string): void {
  index.forEach((ids) => ids.delete(entryId));
}

export function searchIndex(query: string): Set<string> | null {
  const q = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
  if (!q) return null;
  // Split query into parts; each part must appear as a substring of an indexed token
  const parts = q.split(/\s+/).filter((p) => p.length >= 1);
  if (!parts.length) return null;
  const result = new Set<string>();
  for (const [token, ids] of index) {
    if (parts.some((p) => token.includes(p))) {
      ids.forEach((id) => result.add(id));
    }
  }
  return result;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}
