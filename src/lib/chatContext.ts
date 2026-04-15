import type { Entry, Link } from "../types";

/**
 * Keyword + tag relevance scoring for the ASK chat context fallback.
 * Used when no embedding API key is configured and we need to rank
 * entries by relevance to the user's query before sending to the LLM.
 *
 * Scoring (additive):
 *   +3  title contains a query word
 *   +2  type matches a query word
 *   +2  a tag matches a query word (or is a plural/stem of one)
 *   +1  content contains a query word
 */
export function scoreEntriesForQuery<
  T extends {
    id: string;
    title: string;
    type: string;
    tags?: string[];
    content?: string;
  },
>(entries: T[], query: string): T[] {
  if (!query.trim()) return [...entries];

  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/s$/, "")); // naive de-pluralise

  const scored = entries.map((e) => {
    const titleLc = e.title.toLowerCase();
    const typeLc = e.type.toLowerCase();
    const tagsLc = (e.tags || []).map((t) => t.toLowerCase());
    const contentLc = (e.content || "").toLowerCase();
    let score = 0;
    for (const w of words) {
      if (titleLc.includes(w)) score += 3;
      if (typeLc.includes(w)) score += 2;
      if (tagsLc.some((t) => t.includes(w) || w.includes(t))) score += 2;
      if (contentLc.includes(w)) score += 1;
    }
    return { entry: e, score };
  });

  return scored.sort((a, b) => b.score - a.score).map(({ entry }) => entry);
}

/**
 * Build a context string for the chat LLM from scored entries.
 *
 * Scores and takes the top 20 entries, expands outgoing link titles,
 * and appends a "Sources:" list at the end for citation visibility.
 */
export function buildChatContext(entries: Entry[], links: Link[], query: string): string {
  // Score and take top 20
  const scored = scoreEntriesForQuery(entries, query).slice(0, 20);

  // Build a link lookup: entry id → titles of linked entries
  const linkedTitles = new Map<string, string[]>();
  for (const link of links) {
    const targetEntry = entries.find((e) => e.id === link.to);
    if (targetEntry) {
      if (!linkedTitles.has(link.from)) linkedTitles.set(link.from, []);
      linkedTitles.get(link.from)!.push(targetEntry.title);
    }
  }

  const SKIP_META = new Set(["raw_content", "full_text", "source_entry_id", "confidence", "completeness_score", "category", "status"]);

  const sections = scored.map((e) => {
    const related = linkedTitles.get(e.id);
    const relatedStr = related?.length ? `\nRelated to: ${related.join(", ")}` : "";
    const metaEntries = Object.entries(e.metadata || {})
      .filter(([k, v]) => !SKIP_META.has(k) && v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
    const metaStr = metaEntries.length ? `\n${metaEntries.join("\n")}` : "";
    return `[${e.type}] ${e.title}${e.content ? `: ${e.content.slice(0, 300)}` : ""}${metaStr}${relatedStr}`;
  });

  const sourceList = scored.map((e) => e.title).join(", ");
  return `${sections.join("\n\n")}\n\nSources: ${sourceList}`;
}
