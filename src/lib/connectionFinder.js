import { callAI } from "./ai";
import { authFetch } from "./authFetch";
import { PROMPTS } from "../config/prompts";
import { getEmbedHeaders } from "./aiFetch";
export { scoreTitle } from "./duplicateDetection";

/* ─── AI Connection Discovery ─── */
/**
 * Uses AI to find likely connections between a new entry and existing entries.
 * When an embedding key is configured, pre-filters candidates via semantic
 * search (top-20 by cosine similarity) instead of passing 50 random entries.
 *
 * @param {object} newEntry - The newly created entry to match against.
 * @param {Array} existingEntries - All current entries to search for connections.
 * @param {Array} existingLinks - Already-known links to avoid re-suggesting.
 * @param {string} [brainId] - Active brain ID (required for semantic pre-filter).
 * @returns {Promise<Array>} Array of new link objects { from, to, rel }.
 */
export async function findConnections(newEntry, existingEntries, existingLinks, brainId) {
  let candidates;

  const embedHeaders = getEmbedHeaders();
  if (embedHeaders && brainId) {
    // Semantic pre-filter: retrieve top-20 similar entries via pgvector
    try {
      const query = [newEntry.title, newEntry.content, (newEntry.tags || []).join(" ")]
        .filter(Boolean)
        .join(" ")
        .slice(0, 500);
      const res = await authFetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...embedHeaders },
        body: JSON.stringify({ query, brain_id: brainId, limit: 20 }),
      });
      if (res.ok) {
        const similar = await res.json();
        // Exclude the new entry itself
        const similarIds = new Set(similar.map(e => e.id));
        similarIds.delete(newEntry.id);
        candidates = similar
          .filter(e => e.id !== newEntry.id)
          .map(e => ({ id: e.id, title: e.title, type: e.type, tags: e.tags, content: (e.content || "").slice(0, 120) }));
      }
    } catch {
      // fall through to random-50 below
    }
  }

  if (!candidates) {
    // Fallback: first 50 entries (original behavior)
    candidates = existingEntries
      .filter(e => e.id !== newEntry.id)
      .slice(0, 50)
      .map(e => ({ id: e.id, title: e.title, type: e.type, tags: e.tags, content: (e.content || "").slice(0, 120) }));
  }

  if (candidates.length === 0) return [];

  const existingKeys = new Set(existingLinks.map(l => `${l.from}-${l.to}`));
  try {
    const res = await callAI({
      max_tokens: 600,
      system: PROMPTS.CONNECTION_FINDER,
      messages: [{
        role: "user",
        content: `NEW ENTRY:\n${JSON.stringify({ id: newEntry.id, title: newEntry.title, type: newEntry.type, content: newEntry.content, tags: newEntry.tags })}\n\nEXISTING ENTRIES:\n${JSON.stringify(candidates)}`,
      }],
    });
    const data = await res.json();
    const raw = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(l =>
      l.from && l.to && l.rel &&
      candidates.some(c => c.id === l.to) &&
      !existingKeys.has(`${l.from}-${l.to}`) &&
      !existingKeys.has(`${l.to}-${l.from}`)
    );
  } catch { return []; }
}
