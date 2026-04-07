import type { Entry } from "../types";

export function scoreTitle(a: string, b: string): number {
  let al = a.toLowerCase().trim();
  let bl = b.toLowerCase().trim();
  if (al === bl) return 100;
  if (al.includes(bl) || bl.includes(al)) return 70;
  const aSet = new Set(al.split(/\W+/).filter(Boolean));
  const bArr = bl.split(/\W+/).filter(Boolean);
  const hits = bArr.filter((w) => aSet.has(w)).length;
  return Math.round((hits / Math.max(aSet.size, bArr.length, 1)) * 100);
}

/** Score how similar two entries are, considering title, content, and tags */
export function scoreEntry(incoming: { title: string; content?: string; tags?: string[] }, existing: Entry): number {
  const titleScore = scoreTitle(incoming.title, existing.title);

  // Content overlap: check if key phrases from incoming appear in existing
  let contentScore = 0;
  if (incoming.content && existing.content) {
    const inWords = new Set(incoming.content.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
    const exWords = existing.content.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    if (inWords.size > 0 && exWords.length > 0) {
      const hits = exWords.filter((w) => inWords.has(w)).length;
      contentScore = Math.round((hits / Math.max(inWords.size, exWords.length, 1)) * 100);
    }
  }

  // Tag overlap
  let tagScore = 0;
  if (incoming.tags?.length && existing.tags?.length) {
    const inTags = new Set(incoming.tags.map((t) => t.toLowerCase()));
    const hits = existing.tags.filter((t) => inTags.has(t.toLowerCase())).length;
    tagScore = Math.round((hits / Math.max(inTags.size, existing.tags.length, 1)) * 100);
  }

  // Weighted: title matters most, then content, then tags
  return Math.round(titleScore * 0.6 + contentScore * 0.25 + tagScore * 0.15);
}

export function findDuplicates(title: string, entries: Entry[], threshold: number = 50): Entry[] {
  if (!title.trim()) return [];
  return entries
    .map((e) => ({ entry: e, score: scoreTitle(title, e.title) }))
    .filter(({ score }) => score > threshold)
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry);
}

/** Find candidate matches using full entry data (title + content + tags) */
export function findCandidateMatches(
  incoming: { title: string; content?: string; tags?: string[] },
  entries: Entry[],
  threshold: number = 40,
): Array<{ entry: Entry; score: number }> {
  if (!incoming.title.trim()) return [];
  return entries
    .map((e) => ({ entry: e, score: scoreEntry(incoming, e) }))
    .filter(({ score }) => score > threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
