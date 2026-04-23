import type { Entry, Link } from "../types";
import { SKIP_META_KEYS } from "./entryConstants";
import { type EntryShape, rankEntries } from "./entryScorer";

export function scoreEntriesForQuery<T extends EntryShape & { id: string }>(
  entries: T[],
  query: string,
): T[] {
  return rankEntries(entries, query);
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

  const sections = scored.map((e) => {
    const related = linkedTitles.get(e.id);
    const relatedStr = related?.length ? `\nRelated to: ${related.join(", ")}` : "";
    const metaEntries = Object.entries(e.metadata || {})
      .filter(([k, v]) => !SKIP_META_KEYS.has(k) && v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
    const metaStr = metaEntries.length ? `\n${metaEntries.join("\n")}` : "";
    return `[${e.type}] ${e.title}${e.content ? `: ${e.content.slice(0, 300)}` : ""}${metaStr}${relatedStr}`;
  });

  const sourceList = scored.map((e) => e.title).join(", ");
  return `${sections.join("\n\n")}\n\nSources: ${sourceList}`;
}
