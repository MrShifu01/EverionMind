/**
 * Core retrieval pipeline shared by /api/memory/retrieve and /api/mcp.
 * embed → vector search → keyword expand → tag siblings → graph boost
 */
import { generateEmbedding } from "./generateEmbedding.js";
import { SERVER_PROMPTS } from "./prompts.js";
import { sbHeaders } from "./sbHeaders.js";
import { callAI } from "./aiProvider.js";
import { resolveProviderForUser } from "./resolveProvider.js";

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
  const qTokens = query
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
    .filter((w) => w.length > 3 && !STOP.has(w.toLowerCase()))
    .slice(0, 6);
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
// chars, drops short / STOP words, caps at 6 tokens.
function extractQueryTokens(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
    .filter((w) => w.length > 3 && !STOP.has(w.toLowerCase()))
    .slice(0, 6);
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
): Promise<RetrievalResult> {
  // Tier 1 (canonical facts) runs in parallel with the embed call so
  // it adds zero latency on the cache-miss path.
  const [embedding, importantMemories] = await Promise.all([
    generateEmbedding(query, geminiApiKey),
    findImportantMemoriesByBrain(query, brainId),
  ]);
  if (!embedding) throw new Error("Embedding failed");

  // 1. Vector search
  const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/match_entries`, {
    method: "POST",
    headers: SB_HEADERS,
    body: JSON.stringify({
      query_embedding: `[${embedding.join(",")}]`,
      p_brain_id: brainId,
      match_count: 20,
    }),
  });
  let entries: any[] = rpcRes.ok ? await rpcRes.json() : [];
  entries = entries.map((e) => ({ ...e, brain_id: brainId }));
  const existingIds = new Set(entries.map((e: any) => e.id));

  // 2. Keyword expand — FTS via PostgREST `wfts` (websearch_to_tsquery).
  // Indexed by entries_search_tsv_gin_idx (migration 087, partial on
  // type<>'secret' AND deleted_at IS NULL).
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
      const kwRes = await fetch(
        `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&type=neq.secret&search_tsv=wfts(english).${encodeURIComponent(orQuery)}&select=id,title,type,tags,content,metadata&limit=10`,
        { headers: SB_HEADERS },
      );
      if (kwRes.ok) {
        const rows: any[] = await kwRes.json();
        for (const r of rows) {
          if (!existingIds.has(r.id)) {
            existingIds.add(r.id);
            entries.push({ ...r, brain_id: brainId, similarity: 0 });
          }
        }
      }
    }
  }

  // 3. Tag sibling expand — FTS over the union of tag tokens lifted
  // from the top-5 hits. websearch treats `OR` as disjunction.
  const tagTokens = new Set<string>();
  entries.slice(0, 5).forEach((e: any) => {
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
    const tagQuery = Array.from(tagTokens).slice(0, 8).join(" OR ");
    const sibRes = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&type=neq.secret&search_tsv=wfts(english).${encodeURIComponent(tagQuery)}&select=id,title,type,tags,content,metadata&limit=10`,
      { headers: SB_HEADERS },
    );
    if (sibRes.ok) {
      const rows: any[] = await sibRes.json();
      for (const r of rows) {
        if (!existingIds.has(r.id)) {
          existingIds.add(r.id);
          entries.push({ ...r, brain_id: brainId, similarity: 0 });
        }
      }
    }
  }

  // 4. Hybrid score + sort
  const queryTokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  entries.forEach((e: any) => {
    const sim = e.similarity ?? 0;
    if (!queryTokens.length) {
      e._score = sim;
      return;
    }
    const metaText = e.metadata
      ? Object.entries(e.metadata)
          .map(([k, v]) => `${k} ${typeof v === "string" ? v : ""}`)
          .join(" ")
      : "";
    const text = `${e.title ?? ""} ${e.content ?? ""} ${metaText}`.toLowerCase();
    const kw = queryTokens.filter((t) => text.includes(t)).length / queryTokens.length;
    e._score = sim * 0.7 + kw * 0.3;
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
// Graph boost is intentionally skipped here: it's per-brain and merging
// graphs across N brains is expensive for marginal score gains. Chat
// users get a slightly less concept-aware ranking, but the trade-off
// for the cross-brain reach is worth it. Single-brain callers (v1,
// memory-api, mcp) keep the original retrieveEntries with graph boost.
export async function retrieveEntriesForUser(
  query: string,
  userId: string,
  geminiApiKey: string,
  limit = 15,
): Promise<RetrievalResult> {
  const accessibleIds = await getAccessibleBrainIds(userId);
  if (!accessibleIds.length) return { entries: [], concepts: [], importantMemories: [] };

  // Tier 1 (canonical facts) runs in parallel with the embed call — see
  // retrieveEntries() for the rationale.
  const [embedding, importantMemories] = await Promise.all([
    generateEmbedding(query, geminiApiKey),
    findImportantMemoriesForUser(query, userId, accessibleIds),
  ]);
  if (!embedding) throw new Error("Embedding failed");

  // 1. Vector search across every accessible brain (RPC handles the
  //    accessible-brains + entry_shares logic server-side).
  const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/match_entries_for_user`, {
    method: "POST",
    headers: SB_HEADERS,
    body: JSON.stringify({
      query_embedding: `[${embedding.join(",")}]`,
      p_user_id: userId,
      match_count: 20,
    }),
  });
  let entries: any[] = rpcRes.ok ? await rpcRes.json() : [];
  const existingIds = new Set(entries.map((e: any) => e.id));

  // PostgREST `in.(…)` filter for the keyword/tag passes. Cap the IN list
  // length so the URL doesn't balloon — beyond ~50 brains a user's chat
  // is going to be slow regardless and we can revisit.
  const brainInList = accessibleIds.slice(0, 50).map((id) => encodeURIComponent(id)).join(",");
  const brainScope = `brain_id=in.(${brainInList})`;

  // 2. Keyword expand — FTS via PostgREST `wfts` (websearch_to_tsquery).
  // OR-join tokens — see retrieveEntries() for the rationale.
  {
    const kwTokens = extractQueryTokens(query);
    if (kwTokens.length > 0) {
      const orQuery = kwTokens.join(" OR ");
      const kwRes = await fetch(
        `${SB_URL}/rest/v1/entries?${brainScope}&deleted_at=is.null&type=neq.secret&search_tsv=wfts(english).${encodeURIComponent(orQuery)}&select=id,title,type,tags,content,metadata,brain_id&limit=10`,
        { headers: SB_HEADERS },
      );
      if (kwRes.ok) {
        const rows: any[] = await kwRes.json();
        for (const r of rows) {
          if (!existingIds.has(r.id)) {
            existingIds.add(r.id);
            entries.push({ ...r, similarity: 0 });
          }
        }
      }
    }
  }

  // 3. Tag sibling expand — FTS over the union of tag tokens lifted
  // from the top-5 hits. websearch treats `OR` as disjunction.
  const tagTokens = new Set<string>();
  entries.slice(0, 5).forEach((e: any) => {
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
    const tagQuery = Array.from(tagTokens).slice(0, 8).join(" OR ");
    const sibRes = await fetch(
      `${SB_URL}/rest/v1/entries?${brainScope}&deleted_at=is.null&type=neq.secret&search_tsv=wfts(english).${encodeURIComponent(tagQuery)}&select=id,title,type,tags,content,metadata,brain_id&limit=10`,
      { headers: SB_HEADERS },
    );
    if (sibRes.ok) {
      const rows: any[] = await sibRes.json();
      for (const r of rows) {
        if (!existingIds.has(r.id)) {
          existingIds.add(r.id);
          entries.push({ ...r, similarity: 0 });
        }
      }
    }
  }

  // 4. Hybrid score + sort
  const queryTokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  entries.forEach((e: any) => {
    const sim = e.similarity ?? 0;
    if (!queryTokens.length) {
      e._score = sim;
      return;
    }
    const metaText = e.metadata
      ? Object.entries(e.metadata)
          .map(([k, v]) => `${k} ${typeof v === "string" ? v : ""}`)
          .join(" ")
      : "";
    const text = `${e.title ?? ""} ${e.content ?? ""} ${metaText}`.toLowerCase();
    const kw = queryTokens.filter((t) => text.includes(t)).length / queryTokens.length;
    e._score = sim * 0.7 + kw * 0.3;
  });
  entries.sort((a: any, b: any) => b._score - a._score);
  entries = entries.slice(0, limit);

  const finalEntries = entries as RetrievedEntry[];
  reinforcePersonaFacts(finalEntries).catch(() => {});
  return { entries: finalEntries, concepts: [], importantMemories };
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
