import { authFetch } from "./authFetch";
import { callAI } from "./ai";
import {
  extractConcepts,
  extractRelationships,
  mergeGraph,
  loadGraphFromDB,
  saveGraphToDB,
} from "./conceptGraph";

// ─── Per-entry concept extraction (runs on every capture) ───────────────────

const ENTRY_CONCEPTS_PROMPT = `Extract key concepts and relationships from this single brain entry.
Return ONLY this JSON (no markdown):
{"concepts":[{"label":"concept name","entry_ids":["ENTRY_ID"]}],"relationships":[{"source":"A","target":"B","relation":"related_to","confidence":"extracted","confidence_score":0.8,"entry_ids":["ENTRY_ID"]}]}
Max 5 concepts, max 4 relationships. Replace ENTRY_ID with the actual entry id provided.`;

const INSIGHT_PROMPT = `You are a personal knowledge assistant. Given a new brain entry and the user's existing top concepts, write ONE brief insight (2 sentences max). Be specific — name a pattern, connection, or implication this entry reveals. No generic observations. Plain text only, no markdown.`;

interface EntryRef {
  id: string;
  title: string;
  content?: string;
  type?: string;
  tags?: string[];
}

/**
 * Extract concepts and relationships from a single newly-captured entry.
 * Reads the graph from localStorage (free), writes back only if there are new concepts.
 * Fire-and-forget safe.
 */
export async function extractEntryConnections(entry: EntryRef, brainId: string): Promise<void> {
  try {
    const rawContent = (entry as any).metadata?.raw_content;
    const bodyText = rawContent
      ? String(rawContent).replace(/[\r\n]+/g, " ").slice(0, 500)
      : String(entry.content || "").replace(/[\r\n]+/g, " ").slice(0, 300);
    const entryText = `id:${entry.id} type:${entry.type || "note"} title:${entry.title}\n${bodyText}`;
    const aiRes = await callAI({
      max_tokens: 512,
      system: ENTRY_CONCEPTS_PROMPT,
      messages: [{ role: "user", content: entryText }],
    });
    if (!aiRes.ok) {
      console.warn("[concepts] AI call failed", aiRes.status, entry.id);
      return;
    }
    const raw = await aiRes.json();
    const text: string = raw?.content?.[0]?.text || "";
    if (!text) {
      console.warn("[concepts] AI returned empty text for", entry.id);
      return;
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[concepts] No JSON in AI response for", entry.id, "· raw:", text.slice(0, 100));
      return;
    }
    let parsed: any;
    try { parsed = JSON.parse(jsonMatch[0]); } catch (e) {
      console.warn("[concepts] JSON parse failed for", entry.id, e);
      return;
    }

    const newConcepts = parsed.concepts ? extractConcepts(parsed.concepts) : [];
    const newRels = parsed.relationships ? extractRelationships(parsed.relationships) : [];
    if (newConcepts.length === 0 && newRels.length === 0) {
      console.warn("[concepts] AI returned 0 concepts for", entry.id, "· parsed:", parsed);
      return;
    }

    const existing = await loadGraphFromDB(brainId);
    const merged = mergeGraph(existing, { concepts: newConcepts, relationships: newRels });
    await saveGraphToDB(brainId, merged);
    console.log("[concepts] saved", newConcepts.length, "concepts for", entry.title);
  } catch (e) {
    console.error("[concepts] extractEntryConnections failed for", entry.id, e);
  }
}

/**
 * Generate a brief AI insight about a newly-captured entry, using the existing
 * concept graph (from localStorage) as context. Saves result as type=insight entry.
 * Fire-and-forget safe.
 */
export async function generateEntryInsight(entry: EntryRef, brainId: string): Promise<void> {
  try {
    const graph = await loadGraphFromDB(brainId);
    const topConcepts = graph.concepts
      .sort((a, b) => (b.frequency || 0) - (a.frequency || 0))
      .slice(0, 8)
      .map((c) => c.label)
      .join(", ");

    const tagStr = entry.tags?.length ? ` [${entry.tags.join(", ")}]` : "";
    const contextStr = topConcepts ? `\n\nExisting brain concepts: ${topConcepts}` : "";
    const entryStr = `Entry: "${entry.title}" (${entry.type || "note"})${tagStr}\n${String(entry.content || "").slice(0, 400)}`;

    const aiRes = await callAI({
      max_tokens: 150,
      system: INSIGHT_PROMPT,
      messages: [{ role: "user", content: entryStr + contextStr }],
    });
    if (!aiRes.ok) return;
    const raw = await aiRes.json();
    const insightText: string = raw?.content?.[0]?.text?.trim() || "";
    if (insightText.length < 20) return;

    await authFetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_title: `Insight: ${entry.title.slice(0, 60)}`,
        p_content: insightText,
        p_type: "insight",
        p_tags: entry.tags || [],
        p_metadata: {
          source_entry_id: entry.id,
          ...(entry.content ? { raw_content: String(entry.content).slice(0, 4000) } : {}),
        },
        p_brain_id: brainId,
      }),
    });
  } catch { /* silent */ }
}

const BATCH_CONCEPTS_PROMPT = `You are building a concept graph from a list of personal/business brain entries.
Identify the most important recurring concepts (themes, entities, ideas) and meaningful relationships between them.
Return ONLY this JSON (no markdown):
{"concepts":[{"label":"concept name","entry_ids":["id1","id2"]}],"relationships":[{"source":"A","target":"B","relation":"related_to","confidence":"extracted","confidence_score":0.8,"entry_ids":["id1"]}]}
Max 20 concepts, max 15 relationships. Use the entry IDs provided in brackets.`;

// ─── Full-brain batch rebuild (used by Settings button) ─────────────────────

/**
 * Rebuild concept graph from all entries in the brain.
 * Fetches all entries, runs a dedicated concept-extraction prompt, merges into graph.
 * Pass onStatus for UI feedback; omit for silent background use.
 */
export async function buildBrainConnections(
  brainId: string,
  onStatus?: (s: string) => void,
): Promise<void> {
  const status = onStatus ?? (() => {});
  status("Fetching entries…");
  try {
    const res = await authFetch(
      `/api/entries?brain_id=${encodeURIComponent(brainId)}&limit=100`,
    );
    if (!res.ok) throw new Error("Could not fetch entries");
    const body = await res.json();
    const entries: any[] = Array.isArray(body) ? body : (body.entries ?? []);
    if (entries.length === 0) { status("No entries found."); return; }

    const summary = entries
      .slice(0, 80)
      .map((e) =>
        `[${e.id}] (${e.type}) ${e.title}: ${String(e.content || "").replace(/[\r\n]+/g, " ").slice(0, 120)}`,
      )
      .join("\n");

    status(`Analysing ${entries.length} entries with AI…`);
    const aiRes = await callAI({
      max_tokens: 2048,
      system: BATCH_CONCEPTS_PROMPT,
      brainId,
      messages: [{ role: "user", content: `Brain entries:\n\n${summary}` }],
    });
    if (!aiRes.ok) throw new Error(`AI error ${aiRes.status}`);
    const raw = await aiRes.json();
    const text: string = raw?.content?.[0]?.text || raw?.text || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in AI response");
    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // Response truncated — salvage individual arrays defensively
      const conceptsMatch = text.match(/"concepts"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
      const relsMatch = text.match(/"relationships"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
      let concepts: any[] = [];
      let relationships: any[] = [];
      try { if (conceptsMatch) concepts = JSON.parse(conceptsMatch[1]); } catch { /* truncated */ }
      try { if (relsMatch) relationships = JSON.parse(relsMatch[1]); } catch { /* truncated */ }
      parsed = { concepts, relationships };
    }

    const newConcepts = parsed.concepts ? extractConcepts(parsed.concepts) : [];
    const newRels = parsed.relationships ? extractRelationships(parsed.relationships) : [];

    status("Saving connections…");
    const existing = await loadGraphFromDB(brainId);
    const merged = mergeGraph(existing, { concepts: newConcepts, relationships: newRels });
    await saveGraphToDB(brainId, merged);
    status(`Done — ${newConcepts.length} concepts, ${newRels.length} relationships saved.`);
  } catch (e: any) {
    status(`Error: ${e.message}`);
  }
}
