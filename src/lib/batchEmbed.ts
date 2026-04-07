export interface EmbedJob { brain_id: string; entry_ids: string[]; }
export function chunkEntries<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
export function buildBatchQueue(entries: Array<{id: string}>, brainId: string, batchSize = 5): EmbedJob[] {
  return chunkEntries(entries, batchSize).map(chunk => ({ brain_id: brainId, entry_ids: chunk.map(e => e.id) }));
}
