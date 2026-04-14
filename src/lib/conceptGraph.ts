import type { Concept, Relationship } from "../types";
import { authFetch } from "./authFetch";

export interface ConceptGraph {
  concepts: Concept[];
  relationships: Relationship[];
}

/** Normalize a concept label for deduplication */
function normalize(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "");
}

/** Parse AI-returned concepts into typed Concept[] */
export function extractConcepts(
  aiConcepts: Array<{ label: string; entry_ids: string[] }>,
): Concept[] {
  const map = new Map<string, Concept>();
  for (const c of aiConcepts) {
    const key = normalize(c.label);
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      const merged = new Set([...existing.source_entries, ...c.entry_ids]);
      existing.source_entries = [...merged];
      existing.frequency = merged.size;
    } else {
      map.set(key, {
        id: key,
        label: c.label.trim(),
        source_entries: [...new Set(c.entry_ids)],
        frequency: c.entry_ids.length,
      });
    }
  }
  return [...map.values()];
}

/** Parse AI-returned relationships into typed Relationship[] */
export function extractRelationships(
  aiRels: Array<{
    source: string;
    target: string;
    relation: string;
    confidence?: "extracted" | "inferred";
    confidence_score?: number;
    entry_ids?: string[];
  }>,
): Relationship[] {
  return aiRels
    .filter((r) => r.source && r.target && r.relation)
    .map((r) => ({
      source_concept: normalize(r.source),
      target_concept: normalize(r.target),
      relation: r.relation,
      confidence: r.confidence || "inferred",
      confidence_score: r.confidence_score ?? 0.5,
      evidence_entries: r.entry_ids || [],
    }));
}

/** Merge new graph data into existing, deduplicating by normalized label */
export function mergeGraph(existing: ConceptGraph, incoming: ConceptGraph): ConceptGraph {
  const conceptMap = new Map<string, Concept>();
  for (const c of existing.concepts) conceptMap.set(c.id, c);
  for (const c of incoming.concepts) {
    const ex = conceptMap.get(c.id);
    if (ex) {
      const merged = new Set([...ex.source_entries, ...c.source_entries]);
      ex.source_entries = [...merged];
      ex.frequency = merged.size;
    } else {
      conceptMap.set(c.id, c);
    }
  }

  const relKey = (r: Relationship) => `${r.source_concept}|${r.target_concept}|${r.relation}`;
  const relMap = new Map<string, Relationship>();
  for (const r of existing.relationships) relMap.set(relKey(r), r);
  for (const r of incoming.relationships) {
    const k = relKey(r);
    if (!relMap.has(k)) relMap.set(k, r);
    else {
      const ex = relMap.get(k)!;
      ex.confidence_score = Math.max(ex.confidence_score, r.confidence_score);
      ex.evidence_entries = [
        ...new Set([...ex.evidence_entries, ...r.evidence_entries]),
      ];
    }
  }

  return { concepts: [...conceptMap.values()], relationships: [...relMap.values()] };
}

/** Get all concepts that reference a given entry */
export function getConceptsForEntry(graph: ConceptGraph, entryId: string): Concept[] {
  return graph.concepts.filter((c) => c.source_entries.includes(entryId));
}

/** Get entries related to a given entry via shared concepts */
export function getRelatedEntries(
  graph: ConceptGraph,
  entryId: string,
): Array<{ entryId: string; sharedConcepts: string[] }> {
  const myConcepts = getConceptsForEntry(graph, entryId);
  const relatedMap = new Map<string, Set<string>>();
  for (const c of myConcepts) {
    for (const eid of c.source_entries) {
      if (eid === entryId) continue;
      if (!relatedMap.has(eid)) relatedMap.set(eid, new Set());
      relatedMap.get(eid)!.add(c.label);
    }
  }
  return [...relatedMap.entries()]
    .map(([eid, concepts]) => ({ entryId: eid, sharedConcepts: [...concepts] }))
    .sort((a, b) => b.sharedConcepts.length - a.sharedConcepts.length);
}

/** Get top N concepts by degree (number of relationships) — "god nodes" */
export function getGodNodes(
  graph: ConceptGraph,
  topN = 10,
  filter?: Set<string>,
): Concept[] {
  const GENERIC = new Set(["note", "task", "item", "thing", "entry", "other", "general"]);
  const degree = new Map<string, number>();
  for (const r of graph.relationships) {
    degree.set(r.source_concept, (degree.get(r.source_concept) || 0) + 1);
    degree.set(r.target_concept, (degree.get(r.target_concept) || 0) + 1);
  }
  // Also count source_entries as connections
  for (const c of graph.concepts) {
    degree.set(c.id, (degree.get(c.id) || 0) + c.source_entries.length);
  }
  return graph.concepts
    .filter((c) => !GENERIC.has(c.id) && (!filter || !filter.has(c.id)))
    .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))
    .slice(0, topN);
}

/** Simple label propagation community detection */
export function detectCommunities(
  graph: ConceptGraph,
): Array<{ clusterId: string; conceptIds: string[]; entryIds: string[] }> {
  const labels = new Map<string, string>();
  for (const c of graph.concepts) labels.set(c.id, c.id);

  // Build adjacency
  const adj = new Map<string, Set<string>>();
  for (const r of graph.relationships) {
    if (!adj.has(r.source_concept)) adj.set(r.source_concept, new Set());
    if (!adj.has(r.target_concept)) adj.set(r.target_concept, new Set());
    adj.get(r.source_concept)!.add(r.target_concept);
    adj.get(r.target_concept)!.add(r.source_concept);
  }

  // Iterate label propagation (max 10 rounds)
  for (let iter = 0; iter < 10; iter++) {
    let changed = false;
    for (const c of graph.concepts) {
      const neighbors = adj.get(c.id);
      if (!neighbors || neighbors.size === 0) continue;
      const freq = new Map<string, number>();
      for (const n of neighbors) {
        const nl = labels.get(n) || n;
        freq.set(nl, (freq.get(nl) || 0) + 1);
      }
      let best = labels.get(c.id)!;
      let bestCount = 0;
      for (const [l, count] of freq) {
        if (count > bestCount) { best = l; bestCount = count; }
      }
      if (best !== labels.get(c.id)) { labels.set(c.id, best); changed = true; }
    }
    if (!changed) break;
  }

  // Group by label
  const clusters = new Map<string, string[]>();
  for (const [cid, label] of labels) {
    if (!clusters.has(label)) clusters.set(label, []);
    clusters.get(label)!.push(cid);
  }

  const conceptMap = new Map(graph.concepts.map((c) => [c.id, c]));
  return [...clusters.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .map(([clusterId, conceptIds]) => {
      const entryIds = new Set<string>();
      for (const cid of conceptIds) {
        const c = conceptMap.get(cid);
        if (c) c.source_entries.forEach((eid) => entryIds.add(eid));
      }
      return { clusterId, conceptIds, entryIds: [...entryIds] };
    });
}

// ─── Storage helpers (DB-backed with localStorage cache) ───

const GRAPH_KEY = (brainId: string) => `concept_graph_${brainId}`;
const EMPTY: ConceptGraph = { concepts: [], relationships: [] };

/** Sync read from localStorage cache (used by chat context builder). */
export function loadGraph(brainId: string): ConceptGraph {
  try {
    const raw = localStorage.getItem(GRAPH_KEY(brainId));
    return raw ? JSON.parse(raw) : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Load graph from DB, updating localStorage cache. */
export async function loadGraphFromDB(brainId: string): Promise<ConceptGraph> {
  try {
    const res = await authFetch(`/api/graph?brain_id=${encodeURIComponent(brainId)}`);
    if (!res.ok) return loadGraph(brainId); // fallback to cache
    const data = await res.json();
    const graph: ConceptGraph = data.graph || EMPTY;
    // Only overwrite localStorage if DB has actual data — don't wipe a valid local cache
    // with an empty DB response (e.g. migration not yet applied or first save pending)
    if (graph.concepts.length > 0 || graph.relationships.length > 0) {
      try { localStorage.setItem(GRAPH_KEY(brainId), JSON.stringify(graph)); } catch { /* quota */ }
      return graph;
    }
    // DB is empty — prefer local cache if it has data
    const cached = loadGraph(brainId);
    return (cached.concepts.length > 0 || cached.relationships.length > 0) ? cached : graph;
  } catch {
    return loadGraph(brainId); // offline fallback
  }
}

/** Save graph to DB and update localStorage cache. */
export async function saveGraphToDB(brainId: string, graph: ConceptGraph): Promise<void> {
  // Update cache immediately for fast reads
  try { localStorage.setItem(GRAPH_KEY(brainId), JSON.stringify(graph)); } catch { /* quota */ }
  // Persist to DB
  try {
    await authFetch("/api/graph", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brain_id: brainId, graph }),
    });
  } catch (err) {
    console.error("[conceptGraph] DB save failed, cached locally:", err);
  }
}

/** @deprecated Use saveGraphToDB for new code. Kept for sync fallback. */
export function saveGraph(brainId: string, graph: ConceptGraph): void {
  try { localStorage.setItem(GRAPH_KEY(brainId), JSON.stringify(graph)); } catch { /* quota */ }
}

/** Phase 7: Apply user feedback to strengthen/weaken relationship confidence */
export async function applyFeedback(
  brainId: string,
  action: "accept" | "reject",
  entryIdA: string,
  entryIdB: string,
): Promise<void> {
  const graph = loadGraph(brainId);
  const delta = action === "accept" ? 0.1 : -0.15;
  for (const rel of graph.relationships) {
    const srcEntries = graph.concepts.find((c) => c.id === rel.source_concept)?.source_entries || [];
    const tgtEntries = graph.concepts.find((c) => c.id === rel.target_concept)?.source_entries || [];
    if (
      (srcEntries.includes(entryIdA) && tgtEntries.includes(entryIdB)) ||
      (srcEntries.includes(entryIdB) && tgtEntries.includes(entryIdA))
    ) {
      rel.confidence_score = Math.max(0, Math.min(1, rel.confidence_score + delta));
      if (action === "accept") rel.confidence = "extracted";
    }
  }
  // Remove very low confidence relationships
  graph.relationships = graph.relationships.filter((r) => r.confidence_score > 0.05);
  await saveGraphToDB(brainId, graph);
}
