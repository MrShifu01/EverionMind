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
export function scoreEntriesForQuery<T extends {
  id: string;
  title: string;
  type: string;
  tags: string[];
  content?: string;
}>(entries: T[], query: string): T[] {
  if (!query.trim()) return [...entries];

  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/s$/, "")); // naive de-pluralise

  const scored = entries.map((e) => {
    const titleLc  = e.title.toLowerCase();
    const typeLc   = e.type.toLowerCase();
    const tagsLc   = (e.tags || []).map((t) => t.toLowerCase());
    const contentLc = (e.content || "").toLowerCase();
    let score = 0;
    for (const w of words) {
      if (titleLc.includes(w))            score += 3;
      if (typeLc.includes(w))             score += 2;
      if (tagsLc.some((t) => t.includes(w) || w.includes(t)))  score += 2;
      if (contentLc.includes(w))          score += 1;
    }
    return { entry: e, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry);
}
