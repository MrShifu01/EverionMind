/**
 * Core retrieval pipeline shared by /api/memory/retrieve and /api/mcp.
 * embed → vector search → keyword expand → tag siblings → metadata hydrate → graph boost
 */
import { generateEmbedding } from "./generateEmbedding.js";
import { SERVER_PROMPTS } from "./prompts.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SB_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
};
const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-2.5-flash-lite").trim();
const REBUILD_DEBOUNCE_MS = 10 * 60 * 1000; // 10 minutes

export interface RetrievedEntry {
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

export interface RetrievalResult {
  entries: RetrievedEntry[];
  concepts: Array<{ name: string; description?: string }>;
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
  boosted.sort((a: any, b: any) => (b._score ?? b.similarity ?? 0) - (a._score ?? a.similarity ?? 0));
  return boosted;
}

const STOP = new Set([
  "this","that","with","from","have","been","they","will","your","what","about",
  "which","when","than","some","more","also","into","over","after","their","there",
  "these","those","were","does","would","could","should","just","very","even",
  "back","most","such","both","each","much","only","then","them","make","like",
  "well","take","come","good","know","need","feel","seem","same",
]);

export async function retrieveEntries(
  query: string,
  brainId: string,
  geminiApiKey: string,
  limit = 15,
): Promise<RetrievalResult> {
  const embedding = await generateEmbedding(query, geminiApiKey);
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

  // 2. Keyword expand
  const qTokens = query.trim().split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
    .filter((w) => w.length > 3 && !STOP.has(w.toLowerCase()))
    .slice(0, 6);
  if (qTokens.length > 0) {
    const orFilter = qTokens.map((kw) => `title.ilike.*${kw}*,content.ilike.*${kw}*`).join(",");
    const kwRes = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&or=(${encodeURIComponent(orFilter)})&select=id,title,type,tags,content&limit=10`,
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

  // 3. Tag sibling expand
  const tagTokens = new Set<string>();
  entries.slice(0, 5).forEach((e: any) => {
    (e.tags ?? []).forEach((tag: string) => {
      String(tag).toLowerCase().split(/[\s',./_\-]+/).forEach((w) => {
        const clean = w.replace(/[^a-z0-9]/g, "");
        if (clean.length > 3 && !STOP.has(clean) && !/^\d+$/.test(clean)) tagTokens.add(clean);
      });
    });
  });
  if (tagTokens.size > 0) {
    const orFilter = Array.from(tagTokens).slice(0, 8).map((kw) => `title.ilike.*${kw}*`).join(",");
    const sibRes = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&or=(${encodeURIComponent(orFilter)})&select=id,title,type,tags,content,metadata&limit=10`,
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

  // 4. Metadata hydrate
  if (entries.length > 0) {
    const ids = entries.map((e: any) => e.id).join(",");
    const metaRes = await fetch(
      `${SB_URL}/rest/v1/entries?id=in.(${ids})&select=id,metadata`,
      { headers: SB_HEADERS },
    );
    if (metaRes.ok) {
      const metaRows: any[] = await metaRes.json();
      const metaMap = new Map(metaRows.map((r: any) => [r.id, r.metadata]));
      entries = entries.map((e: any) => ({ ...e, metadata: metaMap.get(e.id) ?? e.metadata ?? null }));
    }
  }

  // 5. Hybrid score + sort
  const queryTokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  entries.forEach((e: any) => {
    const sim = e.similarity ?? 0;
    if (!queryTokens.length) { e._score = sim; return; }
    const metaText = e.metadata ? Object.entries(e.metadata).map(([k, v]) => `${k} ${typeof v === "string" ? v : ""}`).join(" ") : "";
    const text = `${e.title ?? ""} ${e.content ?? ""} ${metaText}`.toLowerCase();
    const kw = queryTokens.filter((t) => text.includes(t)).length / queryTokens.length;
    e._score = sim * 0.7 + kw * 0.3;
  });
  entries.sort((a: any, b: any) => b._score - a._score);
  entries = entries.slice(0, 40);

  // 6. Graph boost + concept collection
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
            matchedConcepts.push({ name: c.name, ...(c.description ? { description: c.description } : {}) });
          }
        }
      }
    }
  } catch { /* non-fatal */ }

  return { entries: entries.slice(0, limit) as RetrievedEntry[], concepts: matchedConcepts };
}

export async function rebuildConceptGraph(brainId: string, geminiApiKey: string): Promise<void> {
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

    // Fetch top 100 entries by recency
    const entriesRes = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&select=id,title,type,tags,content&order=created_at.desc&limit=100`,
      { headers: SB_HEADERS },
    );
    if (!entriesRes.ok) return;
    const entries: any[] = await entriesRes.json();
    if (entries.length < 3) return;

    const entryLines = entries.map((e) => {
      const snippet = (e.content ?? "").slice(0, 150).replace(/\n/g, " ");
      const tags = (e.tags ?? []).join(", ");
      return `${e.id} | ${e.title ?? ""} | ${e.type ?? "note"} | ${tags} | ${snippet}`;
    }).join("\n");

    const prompt = SERVER_PROMPTS.CONCEPT_GRAPH.replace("{{ENTRIES}}", entryLines);

    const gemRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048 },
        }),
      },
    );
    if (!gemRes.ok) return;
    const gemData: any = await gemRes.json();
    const text = (gemData.candidates?.[0]?.content?.parts ?? [])
      .filter((p: any) => !p.thought)
      .map((p: any) => p.text ?? "")
      .join("").trim();

    let graph: any;
    try {
      const clean = text.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
      graph = JSON.parse(clean);
    } catch { return; }

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
  } catch { /* non-fatal */ }
}
