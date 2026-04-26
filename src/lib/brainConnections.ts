import { authFetch } from "./authFetch";
import { entryRepo } from "./entryRepo";
import { callAI } from "./ai";
import { PROMPTS } from "../config/prompts";
import { extractConcepts, extractRelationships, loadGraphFromDB } from "./conceptGraph";
import { writeConceptsToGraph } from "./graphWriter";

const ENTRY_CONCEPTS_PROMPT = PROMPTS.ENTRY_CONCEPTS;
const INSIGHT_PROMPT = PROMPTS.INSIGHT;

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
export function extractEntryConnections(entry: EntryRef, brainId: string): Promise<void> {
  return _doExtractEntryConnections(entry, brainId);
}

async function _doExtractEntryConnections(entry: EntryRef, brainId: string): Promise<void> {
  try {
    const rawContent = (entry as any).metadata?.raw_content;
    const bodyText = rawContent
      ? String(rawContent)
          .replace(/[\r\n]+/g, " ")
          .slice(0, 500)
      : String(entry.content || "")
          .replace(/[\r\n]+/g, " ")
          .slice(0, 300);
    const entryText = `id:${entry.id} type:${entry.type || "note"} title:${entry.title}\n${bodyText}`;
    const aiRes = await callAI({
      max_tokens: 1024,
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
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // Truncated response — salvage complete objects from partial arrays
      const salvageArray = (key: string): any[] => {
        const m = text.match(
          new RegExp(`"${key}"\\s*:\\s*(\\[[\\s\\S]*?)(?=\\s*(?:,\\s*"[a-z]|\\}\\s*$))`, "i"),
        );
        if (!m) return [];
        const items: any[] = [];
        const objRe = /\{[^{}]*\}/g;
        let om: RegExpExecArray | null;
        while ((om = objRe.exec(m[1])) !== null) {
          try {
            items.push(JSON.parse(om[0]));
          } catch {
            /* skip */
          }
        }
        return items;
      };
      parsed = { concepts: salvageArray("concepts"), relationships: salvageArray("relationships") };
      if (parsed.concepts.length > 0) {
        console.warn(
          "[concepts] salvaged",
          parsed.concepts.length,
          "concepts from truncated response for",
          entry.id,
        );
      }
    }

    const newConcepts = parsed.concepts ? extractConcepts(parsed.concepts) : [];
    const newRels = parsed.relationships ? extractRelationships(parsed.relationships) : [];
    if (newConcepts.length === 0 && newRels.length === 0) {
      console.warn("[concepts] AI returned 0 concepts for", entry.id, "· parsed:", parsed);
      return;
    }

    await writeConceptsToGraph(brainId, { concepts: newConcepts, relationships: newRels });
  } catch (e) {
    console.error("[concepts] extractEntryConnections failed for", entry.id, e);
  }
}

/**
 * Generate a brief AI insight about a newly-captured entry, using the existing
 * concept graph as context. Stores the result as metadata.ai_insight on the
 * source entry — no separate entry row is created.
 * Returns the insight text so callers can update local state.
 */
export async function generateEntryInsight(entry: EntryRef, brainId: string): Promise<string> {
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
  if (!aiRes.ok) {
    const errText = await aiRes.text().catch(() => String(aiRes.status));
    throw new Error(`AI call failed (${aiRes.status}): ${errText.slice(0, 200)}`);
  }
  const raw = await aiRes.json();
  const insightText: string = raw?.content?.[0]?.text?.trim() || "";
  if (insightText.length < 20) throw new Error("AI returned an empty or too-short insight");

  // Merge ai_insight into the source entry's metadata (server merges with existing metadata)
  const ok = await entryRepo.patch(entry.id, { metadata: { ai_insight: insightText } });
  if (!ok) {
    throw new Error("Failed to save insight");
  }

  return insightText;
}

const BATCH_CONCEPTS_PROMPT = PROMPTS.BATCH_CONCEPTS;
const BATCH_LINKS_PROMPT = PROMPTS.BATCH_LINKS;

function parseConceptsChunk(text: string): { concepts: any[]; relationships: any[] } {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { concepts: [], relationships: [] };
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return { concepts: parsed.concepts || [], relationships: parsed.relationships || [] };
  } catch {
    // Truncated — salvage complete items from partial arrays
    const salvageArray = (key: string): any[] => {
      const m = text.match(
        new RegExp(`"${key}"\\s*:\\s*(\\[[\\s\\S]*?)(?=\\s*(?:,\\s*"[a-z]|\\}\\s*$))`, "i"),
      );
      if (!m) return [];
      const items: any[] = [];
      const objRe = /\{[^{}]*\}/g;
      let om: RegExpExecArray | null;
      while ((om = objRe.exec(m[1])) !== null) {
        try {
          items.push(JSON.parse(om[0]));
        } catch {
          /* skip */
        }
      }
      return items;
    };
    return { concepts: salvageArray("concepts"), relationships: salvageArray("relationships") };
  }
}

// ─── Full-brain batch rebuild (used by Settings button) ─────────────────────

/**
 * Rebuild concept graph AND entry-to-entry connections from all entries in the brain.
 * Processes entries in chunks to avoid AI response truncation.
 * Pass onStatus for UI feedback; omit for silent background use.
 */
export async function buildBrainConnections(
  brainId: string,
  onStatus?: (s: string) => void,
): Promise<void> {
  const status = onStatus ?? (() => {});
  status("Fetching entries…");
  try {
    const res = await authFetch(`/api/entries?brain_id=${encodeURIComponent(brainId)}&limit=150`);
    if (!res.ok) throw new Error("Could not fetch entries");
    const body = await res.json();
    const allEntries: any[] = Array.isArray(body) ? body : (body.entries ?? []);
    // Exclude insights from concept/connection building
    const entries = allEntries.filter((e) => e.type !== "insight");
    if (entries.length === 0) {
      status("No entries found.");
      return;
    }

    // ── Phase 1: Concept graph — process in chunks of 20 ──
    const CHUNK = 20;
    let totalConcepts = 0;
    let totalRels = 0;
    const allNewConcepts: ReturnType<typeof extractConcepts> = [];
    const allNewRels: ReturnType<typeof extractRelationships> = [];

    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      const chunkNum = Math.floor(i / CHUNK) + 1;
      const totalChunks = Math.ceil(entries.length / CHUNK);
      status(`Building concept graph — chunk ${chunkNum}/${totalChunks}…`);

      const summary = chunk
        .map(
          (e) =>
            `[${e.id}] (${e.type}) ${e.title}: ${String(e.content || "")
              .replace(/[\r\n]+/g, " ")
              .slice(0, 150)}`,
        )
        .join("\n");

      const aiRes = await callAI({
        max_tokens: 1024,
        system: BATCH_CONCEPTS_PROMPT,
        brainId,
        messages: [{ role: "user", content: `Brain entries:\n\n${summary}` }],
      });
      if (!aiRes.ok) {
        console.warn("[buildBrain] concept AI error", aiRes.status);
        continue;
      }
      const raw = await aiRes.json();
      const text: string = raw?.content?.[0]?.text || raw?.text || "";
      const { concepts: newC, relationships: newR } = parseConceptsChunk(text);

      const newConcepts = extractConcepts(newC);
      const newRels = extractRelationships(newR);
      allNewConcepts.push(...newConcepts);
      allNewRels.push(...newRels);
      totalConcepts += newConcepts.length;
      totalRels += newRels.length;
    }

    status("Saving concept graph…");
    await writeConceptsToGraph(brainId, { concepts: allNewConcepts, relationships: allNewRels });

    // ── Phase 2: Entry-to-entry connections — batch link finding ──
    const linkChunks = Math.ceil(entries.length / CHUNK);
    let totalLinks = 0;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      const chunkNum = Math.floor(i / CHUNK) + 1;
      status(`Building entry connections — chunk ${chunkNum}/${linkChunks}…`);

      const summary = chunk
        .map(
          (e) =>
            `[${e.id}] (${e.type}) ${e.title}: ${String(e.content || "")
              .replace(/[\r\n]+/g, " ")
              .slice(0, 200)}`,
        )
        .join("\n");

      const aiRes = await callAI({
        max_tokens: 1024,
        system: BATCH_LINKS_PROMPT,
        messages: [{ role: "user", content: summary }],
      });
      if (!aiRes.ok) {
        console.warn("[buildBrain] links AI error", aiRes.status);
        continue;
      }
      const raw = await aiRes.json();
      const text: string = raw?.content?.[0]?.text || raw?.text || "";
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) continue;

      try {
        const links: Array<{ from: string; to: string; rel: string }> = JSON.parse(match[0]);
        if (!Array.isArray(links) || links.length === 0) continue;
        const valid = links.filter(
          (l) =>
            l.from &&
            l.to &&
            l.rel &&
            typeof l.rel === "string" &&
            /^[a-zA-Z0-9 _\-']{1,50}$/.test(l.rel),
        );
        if (!valid.length) continue;
        await authFetch("/api/save-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ links: valid, brain_id: brainId }),
        });
        totalLinks += valid.length;
      } catch {
        /* skip bad chunk */
      }
    }

    status(
      `Done — ${totalConcepts} concepts, ${totalRels} concept relationships, ${totalLinks} entry connections saved.`,
    );
  } catch (e: any) {
    status(`Error: ${e.message}`);
  }
}

/**
 * Auto-find and save connections between a newly-captured entry and existing entries.
 * Called fire-and-forget from handleCreated. Uses the CONNECTION_FINDER prompt.
 */
export async function findAndSaveConnections(
  newEntry: EntryRef,
  existingEntries: EntryRef[],
  brainId: string,
): Promise<void> {
  try {
    const candidates = existingEntries
      .filter((e) => e.id !== newEntry.id)
      .slice(0, 30)
      .map(
        (e) =>
          `[${e.id}] (${e.type || "note"}) ${e.title}: ${String(e.content || "").slice(0, 100)}`,
      )
      .join("\n");
    if (!candidates) return;

    const newEntryText = `NEW ENTRY:\n[${newEntry.id}] (${newEntry.type || "note"}) ${newEntry.title}: ${String(newEntry.content || "").slice(0, 200)}\n\nEXISTING ENTRIES:\n${candidates}`;
    const aiRes = await callAI({
      max_tokens: 512,
      system: `You are a knowledge-graph builder. Given a NEW entry and EXISTING entries, find meaningful connections.\nRULES:\n- Only connect where a real, specific relationship exists (supplier→business, person→place, idea→business, etc.)\n- "rel" label: short phrase 2-4 words describing the relationship\n- Do NOT connect entries just because they share a type\n- Return 0–5 connections. Quality over quantity.\n- "from" = new entry ID. "to" = existing entry ID.\n- Return ONLY valid JSON array: [{"from":"...","to":"...","rel":"..."}]\n- If no connections: []`,
      messages: [{ role: "user", content: newEntryText }],
    });
    if (!aiRes.ok) return;
    const raw = await aiRes.json();
    const text: string = raw?.content?.[0]?.text || "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return;
    const links: Array<{ from: string; to: string; rel: string }> = JSON.parse(match[0]);
    if (!Array.isArray(links) || links.length === 0) return;
    const valid = links.filter(
      (l) =>
        l.from &&
        l.to &&
        l.rel &&
        typeof l.rel === "string" &&
        /^[a-zA-Z0-9 _\-']{1,50}$/.test(l.rel),
    );
    if (!valid.length) return;
    await authFetch("/api/save-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links: valid, brain_id: brainId }),
    });
  } catch {
    /* fire-and-forget, never throws */
  }
}
