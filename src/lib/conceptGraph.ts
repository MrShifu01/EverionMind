import type { Concept, Relationship } from "../types";
import { authFetch } from "./authFetch";

export interface ConceptGraph {
  version?: number;
  concepts: Concept[];
  relationships: Relationship[];
}

/** Migrate graph data from older schema versions to current (v2). */
function migrateGraph(graph: ConceptGraph): ConceptGraph {
  if ((graph.version ?? 1) >= 2) return graph;
  return { ...graph, version: 2 };
}

/** Guard: returns false if graph is structurally invalid. */
export function validateGraph(graph: unknown): graph is ConceptGraph {
  if (!graph || typeof graph !== "object") return false;
  const g = graph as ConceptGraph;
  return Array.isArray(g.concepts) && Array.isArray(g.relationships);
}

/** Normalize a concept label for deduplication */
function normalize(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[''\u2019]s\b/g, "s") // "Smith's" → "smiths" before punctuation strip
    .replace(/[^a-z0-9\s]/g, "");
}

/** Truncate to max 3 words — safety net for AI label drift. Possessives are normalised by normalize(). */
function sanitizeConceptLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim().split(/\s+/).slice(0, 3).join(" ");
}

/** Parse AI-returned concepts into typed Concept[] */
export function extractConcepts(
  aiConcepts: Array<{ label: string; entry_ids: string[] }>,
): Concept[] {
  const map = new Map<string, Concept>();
  for (const c of aiConcepts) {
    const sanitized = sanitizeConceptLabel(c.label);
    if (!sanitized) continue;
    const key = normalize(sanitized);
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      const merged = new Set([...existing.source_entries, ...c.entry_ids]);
      existing.source_entries = [...merged];
      existing.frequency = merged.size;
    } else {
      map.set(key, {
        id: key,
        label: sanitized,
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
      ex.evidence_entries = [...new Set([...ex.evidence_entries, ...r.evidence_entries])];
    }
  }

  return { concepts: [...conceptMap.values()], relationships: [...relMap.values()] };
}

/** Get all concepts that reference a given entry */
export function getConceptsForEntry(graph: ConceptGraph, entryId: string): Concept[] {
  return graph.concepts.filter((c) => c.source_entries.includes(entryId));
}

/** Get top N concepts by degree (number of relationships) — "god nodes" */
export function getGodNodes(graph: ConceptGraph, topN = 10, filter?: Set<string>): Concept[] {
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

// ─── Storage helpers (DB-backed with localStorage cache) ───

const GRAPH_KEY = (brainId: string) => `concept_graph_${brainId}`;
const DIRTY_KEY = (brainId: string) => `concept_graph_dirty_${brainId}`;
const EMPTY: ConceptGraph = { concepts: [], relationships: [], version: 2 };

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
    const graph = migrateGraph(data.graph || EMPTY);
    // Only overwrite localStorage if DB has actual data — don't wipe a valid local cache
    // with an empty DB response (e.g. migration not yet applied or first save pending)
    if (graph.concepts.length > 0 || graph.relationships.length > 0) {
      try {
        localStorage.setItem(GRAPH_KEY(brainId), JSON.stringify(graph));
      } catch {
        /* quota */
      }
      return graph;
    }
    // DB is empty — prefer local cache if it has data
    const cached = loadGraph(brainId);
    if (cached.concepts.length > 0 || cached.relationships.length > 0) {
      // Retry a previously failed save if the dirty flag is set
      if (localStorage.getItem(DIRTY_KEY(brainId))) {
        saveGraphToDB(brainId, cached).catch(() => {});
      }
      return cached;
    }
    return graph;
  } catch {
    return loadGraph(brainId); // offline fallback
  }
}

/** Save graph to DB and update localStorage cache. */
export async function saveGraphToDB(brainId: string, graph: ConceptGraph): Promise<void> {
  const versionedGraph = { ...graph, version: 2 };
  // Mark dirty before attempting write so a crash mid-write is recoverable
  try {
    localStorage.setItem(DIRTY_KEY(brainId), "1");
  } catch {
    /* quota */
  }
  // Update cache immediately for fast reads
  try {
    localStorage.setItem(GRAPH_KEY(brainId), JSON.stringify(versionedGraph));
    window.dispatchEvent(new CustomEvent("concept-graph-updated", { detail: { brainId } }));
  } catch {
    /* quota */
  }
  // Persist to DB
  try {
    await authFetch("/api/graph", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brain_id: brainId, graph: versionedGraph }),
    });
    // Clear dirty flag on success
    try {
      localStorage.removeItem(DIRTY_KEY(brainId));
    } catch {
      /* quota */
    }
  } catch (err) {
    console.error("[conceptGraph] DB save failed, cached locally:", err);
    // Dirty flag remains set — will retry on next loadGraphFromDB
  }
}

