/**
 * Feedback + knowledge shortcut utilities for self-improving retrieval.
 *
 * All functions are fail-safe: they catch their own errors and return safe
 * defaults so the hot path in chat.ts is never blocked by a feedback failure.
 */

import { sbHeaders } from "./sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_HEADERS = sbHeaders();

// ── Stop words ────────────────────────────────────────────────────────────────
// Identical to the stop word sets in chat.ts so ILIKE token extraction is
// consistent across query-keyword expansion, sibling expansion, and feedback.
const STOP = new Set([
  "this",
  "that",
  "with",
  "from",
  "have",
  "been",
  "they",
  "will",
  "your",
  "what",
  "about",
  "which",
  "when",
  "than",
  "some",
  "more",
  "also",
  "into",
  "over",
  "after",
  "their",
  "there",
  "these",
  "those",
  "were",
  "does",
  "would",
  "could",
  "should",
  "shall",
  "might",
  "must",
  "just",
  "very",
  "even",
  "back",
  "most",
  "such",
  "both",
  "each",
  "much",
  "only",
  "then",
  "them",
  "make",
  "like",
  "well",
  "take",
  "come",
  "good",
  "know",
  "need",
  "feel",
  "seem",
  "same",
  "tell",
  "give",
  "find",
  "show",
  "list",
  "number",
  "south",
  "african",
]);

/** Extract meaningful ILIKE tokens from a query string. */
function queryTokens(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
    .filter((w) => w.length > 3 && !STOP.has(w.toLowerCase()))
    .slice(0, 6);
}

// ── learnKnowledgeShortcut ────────────────────────────────────────────────────
/**
 * Called only on +1 feedback with high confidence.
 * Extracts entity/role/attribute from the top retrieved entries and creates or
 * updates a knowledge_shortcut row. Uses check-then-upsert so usage_count
 * increments correctly (Supabase REST upsert replaces, not increments).
 *
 * Fire-and-forget from the caller — do NOT await in the hot path.
 */
export async function learnKnowledgeShortcut(
  brainId: string,
  query: string,
  _retrievedEntryIds: string[],
  topEntryIds: string[],
): Promise<void> {
  if (!topEntryIds.length) return;

  try {
    // Fetch the top entries to extract entity/role/attribute
    const ids = topEntryIds.slice(0, 5).join(",");
    const entryRes = await fetch(
      `${SB_URL}/rest/v1/entries?id=in.(${ids})&select=id,title,type,tags`,
      { headers: SB_HEADERS },
    );
    if (!entryRes.ok) return;

    const entries: Array<{ id: string; title: string; type: string; tags: string[] }> =
      await entryRes.json();
    if (!entries.length) return;

    // Extract entity, role, attribute from tags using role-tag heuristics
    const ROLE_TAGS = new Set([
      "father",
      "dad",
      "mother",
      "mum",
      "mom",
      "boss",
      "manager",
      "partner",
      "spouse",
      "husband",
      "wife",
      "colleague",
      "friend",
      "brother",
      "sister",
      "child",
      "son",
      "daughter",
      "uncle",
      "aunt",
      "grandfather",
      "grandmother",
      "grandpa",
      "grandma",
    ]);

    let entity = "";
    let role = "";
    let attribute = "";

    for (const entry of entries) {
      const tags = (entry.tags ?? []).map((t: string) => t.toLowerCase());
      const roleTag = tags.find((t: string) => ROLE_TAGS.has(t));
      if (roleTag && !role) role = roleTag;

      // Title of a person-type entry is the entity
      if (entry.type === "person" && !entity) {
        entity = entry.title.toLowerCase();
      }

      // Non-person entries' titles become the attribute
      if (entry.type !== "person" && !attribute) {
        attribute = entry.title.toLowerCase();
      }
    }

    // Fall back to query tokens when extraction finds nothing
    const tokens = queryTokens(query);
    if (!entity) entity = tokens[0] ?? "unknown";
    if (!role) role = tokens[1] ?? "unknown";
    if (!attribute) attribute = tokens[2] ?? tokens[0] ?? "unknown";

    const triggerPattern = query.trim().toLowerCase().slice(0, 200);

    // Check for existing shortcut with this unique key
    const existingRes = await fetch(
      `${SB_URL}/rest/v1/knowledge_shortcuts` +
        `?brain_id=eq.${encodeURIComponent(brainId)}` +
        `&entity=eq.${encodeURIComponent(entity)}` +
        `&role=eq.${encodeURIComponent(role)}` +
        `&attribute=eq.${encodeURIComponent(attribute)}` +
        `&select=id,usage_count,confidence_score`,
      { headers: SB_HEADERS },
    );

    if (existingRes.ok) {
      const existing: Array<{ id: string; usage_count: number; confidence_score: number }> =
        await existingRes.json();

      if (existing.length > 0) {
        // Update: increment usage_count and nudge confidence_score toward 1
        const row = existing[0];
        const newUsage = row.usage_count + 1;
        const newConfidence = Math.min(row.confidence_score + 0.05, 1.0);
        await fetch(`${SB_URL}/rest/v1/knowledge_shortcuts?id=eq.${encodeURIComponent(row.id)}`, {
          method: "PATCH",
          headers: SB_HEADERS,
          body: JSON.stringify({
            usage_count: newUsage,
            confidence_score: newConfidence,
            entry_ids: topEntryIds,
            trigger_query_pattern: triggerPattern,
            updated_at: new Date().toISOString(),
          }),
        });
      } else {
        // Insert new shortcut — single event → confidence starts at 0.7, usage 1
        // Dual gate (> 0.6 AND >= 2) means this is a weak shortcut until the 2nd hit
        await fetch(`${SB_URL}/rest/v1/knowledge_shortcuts`, {
          method: "POST",
          headers: SB_HEADERS,
          body: JSON.stringify({
            brain_id: brainId,
            trigger_query_pattern: triggerPattern,
            entity,
            role,
            attribute,
            entry_ids: topEntryIds,
            confidence_score: 0.7,
            usage_count: 1,
          }),
        });
      }
    }
  } catch {
    /* non-fatal — learning failures never block the response */
  }
}
