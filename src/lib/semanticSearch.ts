import type { Entry } from "../types";
import { scoreEntriesForQuery } from "./chatContext";

/**
 * Semantic search with graceful keyword fallback.
 *
 * When online and embed headers are available, calls /api/search for
 * pgvector cosine similarity. Falls back to keyword scoring when:
 *   - offline
 *   - no embed key provided
 *   - API returns { fallback: true }
 *   - network/fetch error
 *
 * embedHeaders keys are normalised to lowercase for HTTP transport regardless
 * of how they were provided (X-Embed-Key and x-embed-key both work).
 */
export async function semanticSearch(
  query: string,
  brainId: string,
  entries: Entry[],
  isOnline = navigator.onLine,
  embedHeaders?: Record<string, string> | null,
): Promise<Entry[]> {
  if (!query.trim()) return entries;

  const { getEmbedHeaders } = await import("./aiSettings");
  const rawHeaders = embedHeaders ?? getEmbedHeaders();

  // Normalise to lowercase for HTTP transport
  const headers: Record<string, string> | null = rawHeaders
    ? Object.fromEntries(Object.entries(rawHeaders).map(([k, v]) => [k.toLowerCase(), v]))
    : null;

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
          return data.results
            .map((r: { id: string }) => byId.get(r.id) ?? r)
            .filter(Boolean);
        }
      }
    } catch {
      // fall through to keyword
    }
  }

  return scoreEntriesForQuery(entries, query);
}
