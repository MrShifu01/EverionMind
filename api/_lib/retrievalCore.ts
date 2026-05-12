/**
 * Core retrieval pipeline shared by /api/memory/retrieve and /api/mcp.
 * embed → vector search → keyword expand → tag siblings → graph boost
 */
import { generateEmbedding } from "./generateEmbedding.js";
import { SERVER_PROMPTS } from "./prompts.js";
import { sbHeaders } from "./sbHeaders.js";
import { callAI } from "./aiProvider.js";
import { resolveProviderForUser } from "./resolveProvider.js";
import { writeAuditLog } from "./auditLog.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_HEADERS = sbHeaders();
const REBUILD_DEBOUNCE_MS = 10 * 60 * 1000; // 10 minutes

interface RetrievedEntry {
  id: string;
  title: string;
  content: string;
  type: string;
  tags: string[];
  metadata: Record<string, any> | null;
  brain_id: string;
  similarity: number;
  _score: number;
}

interface ImportantMemoryHit {
  id: string;
  brain_id: string;
  title: string;
  summary: string;
  memory_type: "fact" | "preference" | "decision" | "obligation";
  source_entry_ids: string[];
  created_at: string;
}

interface RetrievalResult {
  entries: RetrievedEntry[];
  concepts: Array<{ name: string; description?: string }>;
  importantMemories: ImportantMemoryHit[];
}

interface RetrievalTelemetryOptions {
  userId?: string | null;
  requestId?: string | null;
  surface?: string;
  brainId?: string | null;
}

function recordRetrievalTelemetry(
  opts: RetrievalTelemetryOptions | undefined,
  metadata: Record<string, unknown>,
): void {
  if (!opts?.userId) return;
  writeAuditLog({
    userId: opts.userId,
    action: "retrieval.query",
    resourceId: opts.brainId ?? null,
    requestId: opts.requestId ?? null,
    metadata: {
      surface: opts.surface ?? "unknown",
      ...metadata,
    },
  });
}

function applyGraphBoost(entries: any[], graph: any): any[] {
  if (!graph || entries.length < 2) return entries;
  const top3Ids = new Set(entries.slice(0, 3).map((e: any) => e.id));
  const boosts = new Map<string, number>();
  for (const concept of graph.concepts ?? []) {
    const srcs: string[] = concept.source_entries ?? [];
    if (srcs.some((id) => top3Ids.has(id))) {
      for (const id of srcs) {
        if (!top3Ids.has(id)) boosts.set(id, (boosts.get(id) ?? 0) + 0.05);
      }
    }
  }
  for (const rel of graph.relationships ?? []) {
    const relIds: string[] = rel.entry_ids ?? [];
    if (relIds.some((id) => top3Ids.has(id))) {
      for (const id of relIds) {
        if (!top3Ids.has(id)) boosts.set(id, (boosts.get(id) ?? 0) + 0.08);
      }
    }
  }
  if (!boosts.size) return entries;
  const boosted = entries.map((e: any) => {
    const b = Math.min(boosts.get(e.id) ?? 0, 0.15);
    return b > 0 ? { ...e, _score: (e._score ?? e.similarity ?? 0) + b } : e;
  });
  boosted.sort(
    (a: any, b: any) => (b._score ?? b.similarity ?? 0) - (a._score ?? a.similarity ?? 0),
  );
  return boosted;
}

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
  "whats",
  "where",
  "who",
  "whom",
  "whose",
]);

const SHORT_LOOKUP_TOKENS = new Set([
  "id",
  "pin",
  "vat",
  "tax",
  "tin",
  "po",
  "ref",
  "reg",
  "vin",
  "otp",
  "uid",
]);

/**
 * Find vault-locked entries whose titles match the query.
 *
 * Returns titles only — never content, metadata, or tags. The point of this
 * surface is to let chat acknowledge "you have a vault entry titled X — open
 * the Vault to view" instead of pretending the row doesn't exist (which is
 * what the hard secret-exclusion in retrieveEntries would otherwise produce).
 *
 * Title-only disclosure is the maximum we can leak here. Full content would
 * defeat the whole point of the vault.
 */
export async function findLockedSecretTitles(
  query: string,
  brainId: string,
  limit = 5,
): Promise<Array<{ id: string; title: string }>> {
  const qTokens = extractQueryTokens(query);
  if (qTokens.length === 0) return [];

  const orFilter = qTokens.map((kw) => `title.ilike.*${kw}*`).join(",");
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&type=eq.secret&or=(${encodeURIComponent(orFilter)})&select=id,title&limit=${limit}`,
    { headers: SB_HEADERS },
  );
  if (!r.ok) return [];
  return r.json();
}

// Shared token extractor for ILIKE-based lookups: strips non-alphanumeric
// chars, drops STOP words, preserves common short lookup tokens like
// "ID"/"VAT", and caps at 6 tokens.
function extractQueryTokens(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
    .map((w) => w.toLowerCase())
    .filter((w) => !!w && !STOP.has(w))
    .filter((w) => w.length > 3 || SHORT_LOOKUP_TOKENS.has(w))
    .slice(0, 6);
}

function extractScoreTokens(query: string): string[] {
  return extractQueryTokens(query);
}

async function searchEntriesFts(
  brainIds: string[],
  query: string,
  limit = 20,
): Promise<Array<Record<string, unknown>>> {
  if (!brainIds.length || !query.trim()) return [];
  const r = await fetch(`${SB_URL}/rest/v1/rpc/search_entries_fts`, {
    method: "POST",
    headers: SB_HEADERS,
    body: JSON.stringify({
      p_brain_ids: brainIds,
      p_query: query,
      p_limit: limit,
    }),
  });
  if (!r.ok) return [];
  return r.json();
}

// Minimal English stemmer — strips the most common inflectional suffixes
// so "built" and "Builder" both collapse to "build" and match. Without
// this, the client-side title/body scoring (which is .includes()-based)
// misses obvious lexical relatives that the server-side FTS pass (which
// uses Postgres `english` text-search with full Porter stemming) catches
// at the index level.
//
// Conservative: only strips suffixes from words ≥6 chars to avoid
// collapsing short words like "as" → "a" or "is" → "i". Tested against
// the JC Kraal failure (query "built", title "Builder" — both → "build").
function stemSimple(word: string): string {
  const w = word.toLowerCase();
  if (w.length < 6) return w;
  // Order matters: try longest matching suffix first.
  const suffixes = ["ings", "ying", "ied", "ing", "ed", "es", "er", "ly", "s"];
  for (const suf of suffixes) {
    if (w.length > suf.length + 3 && w.endsWith(suf)) {
      return w.slice(0, -suf.length);
    }
  }
  return w;
}

/** Token-vs-text match with stemming. Returns true if any word in `text`
 *  shares a stem with `token` (either direction). */
function stemMatch(token: string, text: string): boolean {
  const stemmedToken = stemSimple(token);
  const words = text.toLowerCase().split(/[^a-z0-9]+/);
  for (const w of words) {
    if (!w) continue;
    if (w === token || w === stemmedToken) return true;
    const stemmedWord = stemSimple(w);
    if (stemmedWord === stemmedToken) return true;
    // Substring fallback for short tokens that escaped stemming (e.g.
    // "VAT" → 3 chars, no stem applied, want direct hit on "VAT number").
    if (token.length >= 4 && w.includes(token)) return true;
  }
  return false;
}

/** Title-targeted ILIKE path using STEMMED tokens. The keyword FTS pass
 *  is OR-tokens unordered + limit-capped, so on broad queries that match
 *  many entries by content, title-only hits can fall outside the cut.
 *  This path guarantees title hits enter the pool. Stems each query
 *  token before ILIKE so "built" → "build" → matches "Builder" titles. */
async function pathTitleMatch(
  query: string,
  brainScope: string,
  selectFields: string,
  limit = 20,
): Promise<Array<Record<string, unknown>>> {
  const tokens = extractQueryTokens(query);
  if (!tokens.length) return [];
  // Drop very-short stems (≤3 chars) — they produce too many false
  // positives ("built" → "buil" via stem? no, we keep "built" → "build";
  // length stays ≥4 except for words too short to stem in the first place).
  const stems = Array.from(new Set(tokens.map(stemSimple).filter((s) => s.length >= 4)));
  if (!stems.length) return [];
  const orFilter = stems.map((s) => `title.ilike.*${s}*`).join(",");
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?${brainScope}&deleted_at=is.null&type=neq.secret&or=(${encodeURIComponent(orFilter)})&select=${selectFields}&limit=${limit}`,
    { headers: SB_HEADERS },
  );
  if (!r.ok) return [];
  return r.json();
}

// Tier 1 — canonical-fact lookup. `important_memories` rows are the
// user-curated fact layer ("Keep this" promotes an entry into a durable
// fact with a stable memory_key, summary, and source_entry_ids).
//
// Before the vector path embeds the query, run an ILIKE pass over
// title + summary. Hits return in ~30-80ms on a small table vs ~600ms
// for the full embed → RPC → keyword → graph path. Runs in parallel
// with generateEmbedding(), so it adds zero latency on the cache-miss
// path — and gives the LLM canonical facts to prefer for direct
// questions ("What is Henk's ID?").
async function findImportantMemoriesByBrain(
  query: string,
  brainId: string,
  limit = 5,
): Promise<ImportantMemoryHit[]> {
  const tokens = extractQueryTokens(query);
  if (!tokens.length) return [];
  const orFilter = tokens.map((kw) => `title.ilike.*${kw}*,summary.ilike.*${kw}*`).join(",");
  const url = `${SB_URL}/rest/v1/important_memories?brain_id=eq.${encodeURIComponent(
    brainId,
  )}&status=eq.active&or=(${encodeURIComponent(
    orFilter,
  )})&select=id,brain_id,title,summary,memory_type,source_entry_ids,created_at&order=updated_at.desc&limit=${limit}`;
  const r = await fetch(url, { headers: SB_HEADERS });
  if (!r.ok) return [];
  return r.json();
}

// Multi-brain variant used by /api/llm chat — every brain the user can
// read (owned + member-of). `user_id` filter is the primary scope and
// matches RLS; `brain_id IN (...)` narrows to brains we already resolved.
async function findImportantMemoriesForUser(
  query: string,
  userId: string,
  brainIds: string[],
  limit = 5,
): Promise<ImportantMemoryHit[]> {
  if (!brainIds.length) return [];
  const tokens = extractQueryTokens(query);
  if (!tokens.length) return [];
  const brainList = brainIds
    .slice(0, 50)
    .map((id) => encodeURIComponent(id))
    .join(",");
  const orFilter = tokens.map((kw) => `title.ilike.*${kw}*,summary.ilike.*${kw}*`).join(",");
  const url = `${SB_URL}/rest/v1/important_memories?user_id=eq.${encodeURIComponent(
    userId,
  )}&brain_id=in.(${brainList})&status=eq.active&or=(${encodeURIComponent(
    orFilter,
  )})&select=id,brain_id,title,summary,memory_type,source_entry_ids,created_at&order=updated_at.desc&limit=${limit}`;
  const r = await fetch(url, { headers: SB_HEADERS });
  if (!r.ok) return [];
  return r.json();
}

export async function retrieveEntries(
  query: string,
  brainId: string,
  geminiApiKey: string,
  limit = 15,
  telemetry?: RetrievalTelemetryOptions,
): Promise<RetrievalResult> {
  const startedAt = Date.now();
  let tagSiblingUsed = false;
  let graphBoostApplied = false;
  // Tier 1 (canonical facts) runs in parallel with the embed call so
  // it adds zero latency on the cache-miss path.
  const [embedding, importantMemories] = await Promise.all([
    generateEmbedding(query, geminiApiKey),
    findImportantMemoriesByBrain(query, brainId),
  ]);
  if (!embedding) throw new Error("Embedding failed");

  // 1. Vector search. match_count bumped from 20 → 30 to widen the
  // candidate pool — title-boosted scoring downstream surfaces title
  // hits buried in low-similarity territory.
  const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/match_entries`, {
    method: "POST",
    headers: SB_HEADERS,
    body: JSON.stringify({
      query_embedding: `[${embedding.join(",")}]`,
      p_brain_id: brainId,
      match_count: 30,
    }),
  });
  let entries: any[] = rpcRes.ok ? await rpcRes.json() : [];
  entries = entries.map((e) => ({ ...e, brain_id: brainId }));
  const existingIds = new Set(entries.map((e: any) => e.id));

  // 2. Keyword expand — ranked FTS via search_entries_fts RPC. Indexed by
  // entries_search_tsv_gin_idx (migration 087, partial on type<>'secret'
  // AND deleted_at IS NULL) and ordered by ts_rank_cd (migration 088).
  //
  // Tokens are OR-joined explicitly because websearch_to_tsquery
  // AND-joins multi-word input by default — passing the raw query
  // would require entries to match every term simultaneously, which
  // misses "any-term" queries like "staff employee team member contact
  // details" where no single entry has all six terms. Mirrors the
  // ILIKE OR-of-tokens semantics the previous implementation used.
  {
    const kwTokens = extractQueryTokens(query);
    if (kwTokens.length > 0) {
      const orQuery = kwTokens.join(" OR ");
      const rows = await searchEntriesFts([brainId], orQuery, 30);
      for (const r of rows) {
        const id = r.id as string;
        if (!existingIds.has(id)) {
          existingIds.add(id);
          entries.push({ ...r, brain_id: brainId, similarity: 0 });
        }
      }
    }
  }

  // 2b. Title-stemmed ILIKE — guarantees title-matching entries enter
  // the pool even when the FTS OR-tokens query has too many candidates
  // and JC Kraal-style entries fall outside the cut.
  {
    const titleHits = await pathTitleMatch(
      query,
      `brain_id=eq.${encodeURIComponent(brainId)}`,
      "id,title,type,tags,content,metadata",
    );
    for (const r of titleHits) {
      const id = r.id as string;
      if (!existingIds.has(id)) {
        existingIds.add(id);
        entries.push({ ...r, brain_id: brainId, similarity: 0 });
      }
    }
  }

  // 2c. Trigram fuzzy title match — closes the irregular-verb gap that
  // FTS stemming + naive client-side stemming both miss. word_similarity
  // needs single-word queries (full sentences dilute the score below
  // threshold), so we fan out one RPC call per query token in parallel
  // and union the results. "built" vs "Builder" hits 0.667, JC Kraal
  // case clears the 0.4 threshold and surfaces.
  {
    const trgTokens = extractQueryTokens(query);
    if (trgTokens.length > 0) {
      const trgResults = await Promise.all(
        trgTokens
          .filter((t) => t.length >= 4)
          .slice(0, 4)
          .map((t) =>
            fetch(`${SB_URL}/rest/v1/rpc/match_entries_title_trgm`, {
              method: "POST",
              headers: SB_HEADERS,
              body: JSON.stringify({
                p_brain_ids: [brainId],
                p_query: t,
                p_limit: 5,
              }),
            })
              .then((r) => (r.ok ? r.json() : []))
              .catch(() => []),
          ),
      );
      for (const rows of trgResults) {
        for (const r of rows as Array<Record<string, unknown>>) {
          const id = r.id as string;
          const trgSim = typeof r.sim === "number" ? r.sim : 0;
          if (existingIds.has(id)) {
            // Already in pool from another path — attach the trgm score
            // so scoring can pick it up.
            const existing = entries.find((e: any) => e.id === id);
            if (existing) existing._trgm_sim = Math.max(existing._trgm_sim ?? 0, trgSim);
          } else {
            existingIds.add(id);
            entries.push({ ...r, brain_id: brainId, similarity: 0, _trgm_sim: trgSim });
          }
        }
      }
    }
  }

  // 3. Tag sibling expand — FTS over the union of tag tokens lifted
  // from the top-3 seed hits. Keeping this tight avoids broad tags pulling
  // weak siblings above direct title/body matches.
  const tagTokens = new Set<string>();
  entries.slice(0, 3).forEach((e: any) => {
    (e.tags ?? []).forEach((tag: string) => {
      String(tag)
        .toLowerCase()
        .split(/[\s',./_\-]+/)
        .forEach((w) => {
          const clean = w.replace(/[^a-z0-9]/g, "");
          if (clean.length > 3 && !STOP.has(clean) && !/^\d+$/.test(clean)) tagTokens.add(clean);
        });
    });
  });
  if (tagTokens.size > 0) {
    tagSiblingUsed = true;
    const tagQuery = Array.from(tagTokens).slice(0, 8).join(" OR ");
    const rows = await searchEntriesFts([brainId], tagQuery, 20);
    for (const r of rows) {
      const id = r.id as string;
      if (!existingIds.has(id)) {
        existingIds.add(id);
        entries.push({ ...r, brain_id: brainId, similarity: 0 });
      }
    }
  }

  // 4. Hybrid score + sort.
  //
  // Three signals, each ∈ [0, 1], weighted to sum to 1:
  //   - sim      0.45  — vector similarity (semantic baseline)
  //   - titleHit 0.40  — fraction of query tokens appearing in title.
  //                      Heavy weight because exact-title matches are
  //                      near-certain answers to direct-lookup queries
  //                      ("staff details" → titles like "Landon... -
  //                      Staff Details" must win). Was missing pre-
  //                      2026-05-12; staff queries surfaced test
  //                      entries because pure vector tied them.
  //   - bodyHit  0.15  — fraction in content + metadata. Supporting
  //                      evidence; lower weight so a brief keyword
  //                      mention doesn't beat a strong title match.
  //
  // Score range [0, 1]. Pure-vector hits cap at 0.45 unless they also
  // hit by title/body; title-only hits with sim=0 cap at 0.55.
  const queryTokens = extractScoreTokens(query);
  entries.forEach((e: any) => {
    const sim = e.similarity ?? 0;
    if (!queryTokens.length) {
      e._score = sim;
      return;
    }
    const titleText = e.title ?? "";
    const titleHit =
      queryTokens.filter((t) => stemMatch(t, titleText)).length / queryTokens.length;

    const metaText = e.metadata
      ? Object.entries(e.metadata)
          .map(([k, v]) => `${k} ${typeof v === "string" ? v : ""}`)
          .join(" ")
      : "";
    const bodyText = `${e.content ?? ""} ${metaText}`;
    const bodyHit =
      queryTokens.filter((t) => stemMatch(t, bodyText)).length / queryTokens.length;

    // Trigram fuzzy-title bonus — only set when the entry came (or was
    // also reached) via the pg_trgm path. Server-side filtered at
    // threshold 0.4 so any nonzero value here represents a real
    // word-level match in the title that the literal stemMatch missed
    // (typical irregular-verb case: query "built" vs title "Builder",
    // word_similarity 0.667). Weighted 0.5 so a strong fuzzy hit beats
    // any pure content-only candidate.
    const trgSim = (e._trgm_sim as number | undefined) ?? 0;

    e._score = sim * 0.45 + titleHit * 0.4 + bodyHit * 0.15 + trgSim * 0.5;
  });
  entries.sort((a: any, b: any) => b._score - a._score);
  entries = entries.slice(0, 40);

  // 5. Graph boost + concept collection
  const matchedConcepts: Array<{ name: string; description?: string }> = [];
  try {
    const graphRes = await fetch(
      `${SB_URL}/rest/v1/concept_graphs?brain_id=eq.${encodeURIComponent(brainId)}&select=graph`,
      { headers: SB_HEADERS },
    );
    if (graphRes.ok) {
      const rows: any[] = await graphRes.json();
      const graph = rows[0]?.graph;
      if (graph) {
        entries = applyGraphBoost(entries, graph);
        graphBoostApplied = true;
        const finalIds = new Set(entries.slice(0, limit).map((e: any) => e.id));
        for (const c of graph.concepts ?? []) {
          if (c.name && (c.source_entries ?? []).some((id: string) => finalIds.has(id))) {
            matchedConcepts.push({
              name: c.name,
              ...(c.description ? { description: c.description } : {}),
            });
          }
        }
      }
    }
  } catch {
    /* non-fatal */
  }

  const finalEntries = entries.slice(0, limit) as RetrievedEntry[];

  // Reinforce persona facts that were retrieved — bumps last_referenced_at
  // and evidence_count, and nudges confidence up. Fire-and-forget so chat
  // latency is unchanged. Cap nudge so a fact can't pin itself by being
  // retrieved often.
  reinforcePersonaFacts(finalEntries).catch(() => {});

  recordRetrievalTelemetry(
    telemetry ? { ...telemetry, brainId: telemetry.brainId ?? brainId } : undefined,
    {
      mode: "single_brain",
      duration_ms: Date.now() - startedAt,
      requested_limit: limit,
      returned_count: finalEntries.length,
      important_memory_count: importantMemories.length,
      concept_count: matchedConcepts.length,
      graph_boost_applied: graphBoostApplied,
      tag_sibling_used: tagSiblingUsed,
      query_length: query.length,
      token_count: extractQueryTokens(query).length,
    },
  );

  return { entries: finalEntries, concepts: matchedConcepts, importantMemories };
}

// Resolve every brain id the user can read: owned + member-of. Used by
// retrieveEntriesForUser to scope keyword/tag fallbacks; the vector RPC
// resolves accessible brains internally so this list is only for the
// PostgREST OR clauses that fall outside the RPC.
async function getAccessibleBrainIds(userId: string): Promise<string[]> {
  const [ownedRes, memberRes] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/brains?owner_id=eq.${encodeURIComponent(userId)}&select=id`, {
      headers: SB_HEADERS,
    }),
    fetch(
      `${SB_URL}/rest/v1/brain_members?user_id=eq.${encodeURIComponent(userId)}&select=brain_id`,
      { headers: SB_HEADERS },
    ),
  ]);
  const ids = new Set<string>();
  if (ownedRes.ok) {
    for (const r of (await ownedRes.json()) as { id: string }[]) ids.add(r.id);
  }
  if (memberRes.ok) {
    for (const r of (await memberRes.json()) as { brain_id: string }[]) ids.add(r.brain_id);
  }
  return Array.from(ids);
}

// Retrieve across every brain the user can read — owned + member-of, plus
// entries shared into any of those via entry_shares (migration 070).
//
// Used by /api/llm chat: when the user asks "give me a number for a
// recommended plumber", we don't want to scope to one brain; we want a
// single ranked retrieval across everything they can see. RLS already
// gates which entries are accessible — this just removes the brain_id
// equality filter so vector ranking can pick the best match anywhere.
//
// Graph boost is opportunistic here: when the top-ranked seeds all land in
// one brain, we can safely use that brain's graph without mixing graph
// semantics across unrelated workspaces.
export async function retrieveEntriesForUser(
  query: string,
  userId: string,
  geminiApiKey: string,
  limit = 15,
  telemetry?: RetrievalTelemetryOptions,
): Promise<RetrievalResult> {
  const startedAt = Date.now();
  let tagSiblingUsed = false;
  let graphBoostApplied = false;
  const telemetryOpts: RetrievalTelemetryOptions = {
    userId,
    surface: "chat",
    ...telemetry,
    brainId: telemetry?.brainId ?? null,
  };
  const accessibleIds = await getAccessibleBrainIds(userId);
  if (!accessibleIds.length) {
    recordRetrievalTelemetry(telemetryOpts, {
      mode: "cross_brain",
      duration_ms: Date.now() - startedAt,
      requested_limit: limit,
      returned_count: 0,
      important_memory_count: 0,
      concept_count: 0,
      graph_boost_applied: false,
      tag_sibling_used: false,
      accessible_brain_count: 0,
      query_length: query.length,
      token_count: extractQueryTokens(query).length,
    });
    return { entries: [], concepts: [], importantMemories: [] };
  }

  // Tier 1 (canonical facts) runs in parallel with the embed call — see
  // retrieveEntries() for the rationale.
  const [embedding, importantMemories] = await Promise.all([
    generateEmbedding(query, geminiApiKey),
    findImportantMemoriesForUser(query, userId, accessibleIds),
  ]);
  if (!embedding) throw new Error("Embedding failed");

  // 1. Vector search across every accessible brain (RPC handles the
  //    accessible-brains + entry_shares logic server-side). match_count
  //    bumped 20 → 30 to widen the pool for title-boosted re-ranking.
  const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/match_entries_for_user`, {
    method: "POST",
    headers: SB_HEADERS,
    body: JSON.stringify({
      query_embedding: `[${embedding.join(",")}]`,
      p_user_id: userId,
      match_count: 30,
    }),
  });
  let entries: any[] = rpcRes.ok ? await rpcRes.json() : [];
  const existingIds = new Set(entries.map((e: any) => e.id));

  // PostgREST `in.(…)` filter for the keyword/tag passes. Cap the IN list
  // length so the URL doesn't balloon — beyond ~50 brains a user's chat
  // is going to be slow regardless and we can revisit.
  const brainInList = accessibleIds.slice(0, 50).map((id) => encodeURIComponent(id)).join(",");
  const brainScope = `brain_id=in.(${brainInList})`;

  // 2. Keyword expand — ranked FTS via search_entries_fts RPC.
  // OR-join tokens — see retrieveEntries() for the rationale.
  {
    const kwTokens = extractQueryTokens(query);
    if (kwTokens.length > 0) {
      const orQuery = kwTokens.join(" OR ");
      const rows = await searchEntriesFts(accessibleIds.slice(0, 50), orQuery, 30);
      for (const r of rows) {
        const id = r.id as string;
        if (!existingIds.has(id)) {
          existingIds.add(id);
          entries.push({ ...r, similarity: 0 });
        }
      }
    }
  }

  // 2b. Title-stemmed ILIKE — see retrieveEntries() for the rationale.
  {
    const titleHits = await pathTitleMatch(
      query,
      brainScope,
      "id,title,type,tags,content,metadata,brain_id",
    );
    for (const r of titleHits) {
      const id = r.id as string;
      if (!existingIds.has(id)) {
        existingIds.add(id);
        entries.push({ ...r, similarity: 0 });
      }
    }
  }

  // 2c. Trigram fuzzy title match — see retrieveEntries() for rationale.
  // Fan out per-token in parallel.
  {
    const trgTokens = extractQueryTokens(query);
    if (trgTokens.length > 0) {
      const brainIdsSlice = accessibleIds.slice(0, 50);
      const trgResults = await Promise.all(
        trgTokens
          .filter((t) => t.length >= 4)
          .slice(0, 4)
          .map((t) =>
            fetch(`${SB_URL}/rest/v1/rpc/match_entries_title_trgm`, {
              method: "POST",
              headers: SB_HEADERS,
              body: JSON.stringify({
                p_brain_ids: brainIdsSlice,
                p_query: t,
                p_limit: 5,
              }),
            })
              .then((r) => (r.ok ? r.json() : []))
              .catch(() => []),
          ),
      );
      for (const rows of trgResults) {
        for (const r of rows as Array<Record<string, unknown>>) {
          const id = r.id as string;
          const trgSim = typeof r.sim === "number" ? r.sim : 0;
          if (existingIds.has(id)) {
            const existing = entries.find((e: any) => e.id === id);
            if (existing) existing._trgm_sim = Math.max(existing._trgm_sim ?? 0, trgSim);
          } else {
            existingIds.add(id);
            entries.push({ ...r, similarity: 0, _trgm_sim: trgSim });
          }
        }
      }
    }
  }

  // 3. Tag sibling expand — FTS over the union of tag tokens lifted
  // from the top-3 seed hits. Keeping this tight avoids broad tags pulling
  // weak siblings above direct title/body matches.
  const tagTokens = new Set<string>();
  entries.slice(0, 3).forEach((e: any) => {
    (e.tags ?? []).forEach((tag: string) => {
      String(tag)
        .toLowerCase()
        .split(/[\s',./_\-]+/)
        .forEach((w) => {
          const clean = w.replace(/[^a-z0-9]/g, "");
          if (clean.length > 3 && !STOP.has(clean) && !/^\d+$/.test(clean)) tagTokens.add(clean);
        });
    });
  });
  if (tagTokens.size > 0) {
    tagSiblingUsed = true;
    const tagQuery = Array.from(tagTokens).slice(0, 8).join(" OR ");
    const rows = await searchEntriesFts(accessibleIds.slice(0, 50), tagQuery, 20);
    for (const r of rows) {
      const id = r.id as string;
      if (!existingIds.has(id)) {
        existingIds.add(id);
        entries.push({ ...r, similarity: 0 });
      }
    }
  }

  // 4. Hybrid score + sort. See retrieveEntries() for the rationale —
  // title-weighted three-signal formula so direct-lookup queries don't
  // get drowned by mid-similarity vector noise.
  const queryTokens = extractScoreTokens(query);
  entries.forEach((e: any) => {
    const sim = e.similarity ?? 0;
    if (!queryTokens.length) {
      e._score = sim;
      return;
    }
    const titleText = e.title ?? "";
    const titleHit =
      queryTokens.filter((t) => stemMatch(t, titleText)).length / queryTokens.length;

    const metaText = e.metadata
      ? Object.entries(e.metadata)
          .map(([k, v]) => `${k} ${typeof v === "string" ? v : ""}`)
          .join(" ")
      : "";
    const bodyText = `${e.content ?? ""} ${metaText}`;
    const bodyHit =
      queryTokens.filter((t) => stemMatch(t, bodyText)).length / queryTokens.length;

    // Trigram fuzzy-title bonus — only set when the entry came (or was
    // also reached) via the pg_trgm path. Server-side filtered at
    // threshold 0.4 so any nonzero value here represents a real
    // word-level match in the title that the literal stemMatch missed
    // (typical irregular-verb case: query "built" vs title "Builder",
    // word_similarity 0.667). Weighted 0.5 so a strong fuzzy hit beats
    // any pure content-only candidate.
    const trgSim = (e._trgm_sim as number | undefined) ?? 0;

    e._score = sim * 0.45 + titleHit * 0.4 + bodyHit * 0.15 + trgSim * 0.5;
  });
  entries.sort((a: any, b: any) => b._score - a._score);
  entries = entries.slice(0, 40);

  const matchedConcepts: Array<{ name: string; description?: string }> = [];
  try {
    const seedBrainIds = new Set(
      entries
        .slice(0, 3)
        .map((e: any) => e.brain_id)
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
    );
    if (seedBrainIds.size === 1) {
      const seedBrainId = Array.from(seedBrainIds)[0];
      if (seedBrainId) {
        const graphRes = await fetch(
          `${SB_URL}/rest/v1/concept_graphs?brain_id=eq.${encodeURIComponent(seedBrainId)}&select=graph`,
          { headers: SB_HEADERS },
        );
        if (graphRes.ok) {
          const rows: any[] = await graphRes.json();
          const graph = rows[0]?.graph;
          if (graph) {
            entries = applyGraphBoost(entries, graph);
            graphBoostApplied = true;
            const finalIds = new Set(entries.slice(0, limit).map((e: any) => e.id));
            for (const c of graph.concepts ?? []) {
              if (c.name && (c.source_entries ?? []).some((id: string) => finalIds.has(id))) {
                matchedConcepts.push({
                  name: c.name,
                  ...(c.description ? { description: c.description } : {}),
                });
              }
            }
          }
        }
      }
    }
  } catch {
    /* non-fatal */
  }

  const finalEntries = entries.slice(0, limit) as RetrievedEntry[];
  reinforcePersonaFacts(finalEntries).catch(() => {});
  recordRetrievalTelemetry(telemetryOpts, {
    mode: "cross_brain",
    duration_ms: Date.now() - startedAt,
    requested_limit: limit,
    returned_count: finalEntries.length,
    important_memory_count: importantMemories.length,
    concept_count: matchedConcepts.length,
    graph_boost_applied: graphBoostApplied,
    tag_sibling_used: tagSiblingUsed,
    accessible_brain_count: accessibleIds.length,
    query_length: query.length,
    token_count: extractQueryTokens(query).length,
  });
  return { entries: finalEntries, concepts: matchedConcepts, importantMemories };
}

async function reinforcePersonaFacts(entries: RetrievedEntry[]): Promise<void> {
  const personaIds = entries.filter((e) => e.type === "persona").map((e) => e.id);
  if (!personaIds.length) return;
  const now = new Date().toISOString();
  // We bump in parallel; each PATCH is small and indexed by primary key.
  await Promise.all(
    personaIds.map(async (id) => {
      try {
        const r = await fetch(
          `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=metadata&limit=1`,
          { headers: SB_HEADERS },
        );
        if (!r.ok) return;
        const rows: Array<{ metadata: Record<string, any> | null }> = await r.json();
        const meta = rows[0]?.metadata ?? {};
        if (meta.pinned === true) {
          // Pinned facts already at ceiling — only bump the timestamp.
          await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { ...SB_HEADERS, Prefer: "return=minimal" },
            body: JSON.stringify({ metadata: { ...meta, last_referenced_at: now } }),
          });
          return;
        }
        const conf = typeof meta.confidence === "number" ? meta.confidence : 0.7;
        const nextConf = Math.min(1, conf + 0.02); // +2% per retrieval, capped
        const evidence = typeof meta.evidence_count === "number" ? meta.evidence_count : 0;
        await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { ...SB_HEADERS, Prefer: "return=minimal" },
          body: JSON.stringify({
            metadata: {
              ...meta,
              confidence: nextConf,
              evidence_count: evidence + 1,
              last_referenced_at: now,
            },
          }),
        });
      } catch {
        /* non-fatal */
      }
    }),
  );
}

export async function rebuildConceptGraph(brainId: string, userId: string): Promise<void> {
  try {
    // Debounce: skip if rebuilt within last 10 minutes
    const checkRes = await fetch(
      `${SB_URL}/rest/v1/concept_graphs?brain_id=eq.${encodeURIComponent(brainId)}&select=updated_at&limit=1`,
      { headers: SB_HEADERS },
    );
    if (checkRes.ok) {
      const rows: any[] = await checkRes.json();
      if (rows[0]?.updated_at) {
        const age = Date.now() - new Date(rows[0].updated_at).getTime();
        if (age < REBUILD_DEBOUNCE_MS) return;
      }
    }

    // Fetch top 100 entries by recency.
    // type=neq.secret: vault-typed entries must never be fed to the LLM during
    // concept-graph rebuild — concept descriptions would otherwise leak titles
    // and snippets back into the chat surface.
    const entriesRes = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&type=neq.secret&select=id,title,type,tags,content&order=created_at.desc&limit=100`,
      { headers: SB_HEADERS },
    );
    if (!entriesRes.ok) return;
    const entries: any[] = await entriesRes.json();
    if (entries.length < 3) return;

    const entryLines = entries
      .map((e) => {
        const snippet = (e.content ?? "").slice(0, 150).replace(/\n/g, " ");
        const tags = (e.tags ?? []).join(", ");
        return `${e.id} | ${e.title ?? ""} | ${e.type ?? "note"} | ${tags} | ${snippet}`;
      })
      .join("\n");

    const prompt = SERVER_PROMPTS.CONCEPT_GRAPH.replace("{{ENTRIES}}", entryLines);

    const cfg = await resolveProviderForUser(userId);
    if (!cfg) return;
    const text = await callAI(cfg, "", prompt, { maxTokens: 2048, json: true });
    if (!text) return;

    let graph: any;
    try {
      const clean = text
        .replace(/^```[a-z]*\n?/, "")
        .replace(/\n?```$/, "")
        .trim();
      graph = JSON.parse(clean);
    } catch {
      return;
    }

    if (!Array.isArray(graph.concepts) || !Array.isArray(graph.relationships)) return;

    await fetch(`${SB_URL}/rest/v1/concept_graphs`, {
      method: "POST",
      headers: { ...SB_HEADERS, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        brain_id: brainId,
        graph: {
          concepts: graph.concepts.slice(0, 500),
          relationships: graph.relationships.slice(0, 500),
        },
        updated_at: new Date().toISOString(),
      }),
    });
  } catch {
    /* non-fatal */
  }
}
