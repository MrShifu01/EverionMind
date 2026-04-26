/**
 * Feedback + knowledge shortcut utilities for self-improving retrieval.
 *
 * All functions are fail-safe: they catch their own errors and return safe
 * defaults so the hot path in chat.ts is never blocked by a feedback failure.
 */

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SB_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
};

// ── Stop words ────────────────────────────────────────────────────────────────
// Identical to the stop word sets in chat.ts so ILIKE token extraction is
// consistent across query-keyword expansion, sibling expansion, and feedback.
const STOP = new Set([
  "this","that","with","from","have","been","they","will","your",
  "what","about","which","when","than","some","more","also","into","over","after",
  "their","there","these","those","were","does","would","could","should","shall",
  "might","must","just","very","even","back","most","such","both","each","much",
  "only","then","them","make","like","well","take","come","good","know","need",
  "feel","seem","same","tell","give","find","show","list","number","south","african",
]);

/** Extract meaningful ILIKE tokens from a query string. */
function queryTokens(query: string): string[] {
  return query.trim().split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
    .filter((w) => w.length > 3 && !STOP.has(w.toLowerCase()))
    .slice(0, 6);
}

// ── In-memory shortcut cache ───────────────────────────────────────────────
interface ShortcutRow {
  entry_ids: string[];
  confidence_score: number;
  usage_count: number;
  strong: boolean;
}

interface CacheEntry {
  value: ShortcutRow[];
  expires: number;
}

const _shortcutCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function _cacheKey(brainId: string, query: string): string {
  return `${brainId}:${query.trim().toLowerCase()}`;
}

// ── getFeedbackBoosts ─────────────────────────────────────────────────────────
/**
 * For each entry in entryIds, returns a score boost based on how often that
 * entry appeared in positively-rated interactions for similar queries.
 *
 * One DB query — batch, not N per-entry calls.
 * Returns Map<entryId, boost> where boost is typically 0.02–0.08.
 */
export async function getFeedbackBoosts(
  brainId: string,
  query: string,
  entryIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!entryIds.length) return result;

  try {
    const tokens = queryTokens(query);
    if (!tokens.length) return result;

    // Fetch recent positive feedback rows for this brain with a query match
    const orFilter = tokens.map((t) => `query.ilike.*${t}*`).join(",");
    const res = await fetch(
      `${SB_URL}/rest/v1/query_feedback` +
        `?brain_id=eq.${encodeURIComponent(brainId)}` +
        `&feedback=eq.1` +
        `&or=(${encodeURIComponent(orFilter)})` +
        `&select=retrieved_entry_ids` +
        `&order=created_at.desc` +
        `&limit=50`,
      { headers: SB_HEADERS },
    );
    if (!res.ok) return result;

    const rows: Array<{ retrieved_entry_ids: string[] }> = await res.json();
    if (!rows.length) return result;

    // Count how many positive rows each entry appears in
    const hitCount = new Map<string, number>();
    for (const row of rows) {
      for (const id of row.retrieved_entry_ids ?? []) {
        hitCount.set(id, (hitCount.get(id) ?? 0) + 1);
      }
    }

    const targetSet = new Set(entryIds);
    for (const [id, count] of hitCount) {
      if (!targetSet.has(id)) continue;
      // Scale: 1 hit → +0.02, saturates at ~4 hits → +0.08
      result.set(id, Math.min(count * 0.02, 0.08));
    }
  } catch {
    /* non-fatal */
  }

  return result;
}

// ── getQueryPatterns ──────────────────────────────────────────────────────────
/**
 * Looks at successful retrievals for similar queries and returns a boost map
 * for entries that appeared in ≥2 positive interactions (indicating they are
 * reliably useful for this query type).
 *
 * Returns Map<entryId, boost> where boost is +0.05 for pattern entries.
 */
export async function getQueryPatterns(
  brainId: string,
  query: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  try {
    const tokens = queryTokens(query);
    if (!tokens.length) return result;

    const orFilter = tokens.map((t) => `query.ilike.*${t}*`).join(",");
    const res = await fetch(
      `${SB_URL}/rest/v1/query_feedback` +
        `?brain_id=eq.${encodeURIComponent(brainId)}` +
        `&feedback=eq.1` +
        `&or=(${encodeURIComponent(orFilter)})` +
        `&select=top_entry_ids` +
        `&order=created_at.desc` +
        `&limit=50`,
      { headers: SB_HEADERS },
    );
    if (!res.ok) return result;

    const rows: Array<{ top_entry_ids: string[] }> = await res.json();
    if (!rows.length) return result;

    // Count top-entry appearances
    const hitCount = new Map<string, number>();
    for (const row of rows) {
      for (const id of row.top_entry_ids ?? []) {
        hitCount.set(id, (hitCount.get(id) ?? 0) + 1);
      }
    }

    // Only boost entries that appear in ≥2 interactions
    for (const [id, count] of hitCount) {
      if (count >= 2) result.set(id, 0.05);
    }
  } catch {
    /* non-fatal */
  }

  return result;
}

// ── getKnowledgeShortcuts ─────────────────────────────────────────────────────
/**
 * Returns ALL shortcut rows whose trigger pattern matches the query, annotated
 * with `strong: true` when confidence_score > 0.6 AND usage_count >= 2.
 *
 * Results are cached for 10 minutes per (brainId, query) key.
 */
export async function getKnowledgeShortcuts(
  brainId: string,
  query: string,
): Promise<ShortcutRow[]> {
  const ck = _cacheKey(brainId, query);
  const cached = _shortcutCache.get(ck);
  if (cached && Date.now() < cached.expires) return cached.value;

  const empty: ShortcutRow[] = [];

  try {
    const tokens = queryTokens(query);
    if (!tokens.length) {
      _shortcutCache.set(ck, { value: empty, expires: Date.now() + CACHE_TTL_MS });
      return empty;
    }

    const orFilter = tokens
      .map((t) => `trigger_query_pattern.ilike.*${t}*`)
      .join(",");
    const res = await fetch(
      `${SB_URL}/rest/v1/knowledge_shortcuts` +
        `?brain_id=eq.${encodeURIComponent(brainId)}` +
        `&or=(${encodeURIComponent(orFilter)})` +
        `&select=entry_ids,confidence_score,usage_count` +
        `&limit=20`,
      { headers: SB_HEADERS },
    );
    if (!res.ok) {
      _shortcutCache.set(ck, { value: empty, expires: Date.now() + CACHE_TTL_MS });
      return empty;
    }

    const rows: Array<{ entry_ids: string[]; confidence_score: number; usage_count: number }> =
      await res.json();

    const value: ShortcutRow[] = rows.map((r) => ({
      entry_ids: r.entry_ids ?? [],
      confidence_score: r.confidence_score ?? 0,
      usage_count: r.usage_count ?? 1,
      strong: r.confidence_score > 0.6 && r.usage_count >= 2,
    }));

    _shortcutCache.set(ck, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  } catch {
    _shortcutCache.set(ck, { value: empty, expires: Date.now() + CACHE_TTL_MS });
    return empty;
  }
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
      "father","dad","mother","mum","mom","boss","manager","partner","spouse",
      "husband","wife","colleague","friend","brother","sister","child","son",
      "daughter","uncle","aunt","grandfather","grandmother","grandpa","grandma",
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
        await fetch(
          `${SB_URL}/rest/v1/knowledge_shortcuts?id=eq.${encodeURIComponent(row.id)}`,
          {
            method: "PATCH",
            headers: SB_HEADERS,
            body: JSON.stringify({
              usage_count: newUsage,
              confidence_score: newConfidence,
              entry_ids: topEntryIds,
              trigger_query_pattern: triggerPattern,
              updated_at: new Date().toISOString(),
            }),
          },
        );
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
