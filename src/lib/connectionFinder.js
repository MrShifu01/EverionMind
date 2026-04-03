import { callAI } from "./ai";
import { PROMPTS } from "../config/prompts";
export { scoreTitle } from "./duplicateDetection";

/* ─── AI Connection Discovery ─── */
/**
 * Uses AI to find likely connections between a new entry and existing entries.
 * @param {object} newEntry - The newly created entry to match against.
 * @param {Array} existingEntries - All current entries to search for connections.
 * @param {Array} existingLinks - Already-known links to avoid re-suggesting.
 * @returns {Promise<Array>} Array of new link objects { from, to, rel }.
 */
export async function findConnections(newEntry, existingEntries, existingLinks) {
  const candidates = existingEntries
    .filter(e => e.id !== newEntry.id)
    .slice(0, 50)
    .map(e => ({ id: e.id, title: e.title, type: e.type, tags: e.tags, content: (e.content || "").slice(0, 120) }));
  if (candidates.length === 0) return [];
  const existingKeys = new Set(existingLinks.map(l => `${l.from}-${l.to}`));
  try {
    const res = await callAI({
      max_tokens: 600,
      system: PROMPTS.CONNECTION_FINDER,
      messages: [{ role: "user", content: `NEW ENTRY:\n${JSON.stringify({ id: newEntry.id, title: newEntry.title, type: newEntry.type, content: newEntry.content, tags: newEntry.tags })}\n\nEXISTING ENTRIES:\n${JSON.stringify(candidates)}` }]
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

