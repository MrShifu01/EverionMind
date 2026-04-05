import type { Entry } from '../types';

export function scoreTitle(a: string, b: string): number {
  let al = a.toLowerCase().trim();
  let bl = b.toLowerCase().trim();
  if (al === bl) return 100;
  if (al.includes(bl) || bl.includes(al)) return 70;
  const aSet = new Set(al.split(/\W+/).filter(Boolean));
  const bArr = bl.split(/\W+/).filter(Boolean);
  const hits = bArr.filter(w => aSet.has(w)).length;
  return Math.round((hits / Math.max(aSet.size, bArr.length, 1)) * 100);
}

export function findDuplicates(title: string, entries: Entry[], threshold: number = 50): Entry[] {
  if (!title.trim()) return [];
  return entries
    .map(e => ({ entry: e, score: scoreTitle(title, e.title) }))
    .filter(({ score }) => score > threshold)
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry);
}
