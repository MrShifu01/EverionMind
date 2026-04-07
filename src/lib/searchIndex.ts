import type { Entry } from "../types";
import { scoreEntriesForQuery } from "./chatContext";

const index = new Map<string, Set<string>>();

export function indexEntry(entry: Entry): void {
  const tokens = tokenize(`${entry.title} ${entry.content || ""} ${(entry.tags || []).join(" ")}`);
  tokens.forEach((token) => {
    if (!index.has(token)) index.set(token, new Set());
    index.get(token)!.add(entry.id);
  });
}

export function removeFromIndex(entryId: string): void {
  index.forEach((ids) => ids.delete(entryId));
}

export function searchIndex(query: string): Set<string> | null {
  const tokens = tokenize(query);
  if (!tokens.length) return null;
  const sets = tokens.map((t) => index.get(t) || new Set<string>());
  return new Set(sets.flatMap((s) => [...s]));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/**
 * Semantic search with graceful keyword fallback.
 *
 * When online and embed headers are available, calls /api/search for
 * pgvector cosine similarity. Falls back to keyword scoring when:
 *   - offline
 *   - no embed key provided
 *   - API returns { fallback: true }
 *   - network/fetch error
 */
export async function semanticSearch(
  query: string,
  brainId: string,
  entries: Entry[],
  isOnline = navigator.onLine,
  embedHeaders?: Record<string, string> | null,
): Promise<Entry[]> {
  if (!query.trim()) return entries;

  // Lazy import to avoid loading browser-only supabase/auth at module init time
  const { getEmbedHeaders } = await import("./aiFetch");
  const headers = embedHeaders ?? getEmbedHeaders();

  if (isOnline && headers?.["x-embed-key"]) {
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ query, brain_id: brainId, limit: 20 }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.fallback && Array.isArray(data.results)) {
          const byId = new Map(entries.map((e) => [e.id, e]));
          const semantic = data.results
            .map((r: any) => byId.get(r.id) ?? r)
            .filter(Boolean);
          return semantic;
        }
      }
    } catch {
      // fall through to keyword
    }
  }

  return scoreEntriesForQuery(entries, query);
}
