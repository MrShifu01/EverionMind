export interface EntryShape {
  title: string;
  type: string;
  tags?: string[];
  content?: string;
  metadata?: Record<string, unknown>;
}

export function scoreEntryForQuery(entry: EntryShape, query: string): number {
  const q = query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  if (!q) return 0;
  const terms = q.split(/\s+/).filter(Boolean);

  const title = (entry.title || "").toLowerCase();
  const type = (entry.type || "").toLowerCase();
  const content = (entry.content || "").toLowerCase();
  const tags = (entry.tags || []).join(" ").toLowerCase();
  const metaText =
    entry.metadata && typeof entry.metadata === "object"
      ? Object.values(entry.metadata)
          .map((v) => (typeof v === "string" ? v : ""))
          .join(" ")
          .toLowerCase()
      : "";

  let score = 0;

  if (title.includes(q)) score += 100;
  if (title.startsWith(q)) score += 50;

  let titleHits = 0;
  for (const t of terms) {
    if (title.includes(t)) { score += 20; titleHits++; }
    if (tags.includes(t)) score += 15;
    if (type.includes(t)) score += 5;
    if (content.includes(t)) score += 3;
    if (metaText.includes(t)) score += 3;
  }

  if (terms.length > 1 && titleHits === terms.length) score += 40;
  if (content.includes(q)) score += 20;

  return score;
}

export function rankEntries<T extends EntryShape>(entries: T[], query: string): T[] {
  if (!query.trim()) return [...entries];
  return [...entries]
    .map((e) => ({ e, s: scoreEntryForQuery(e, query) }))
    .sort((a, b) => b.s - a.s)
    .map(({ e }) => e);
}
