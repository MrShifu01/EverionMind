export function mergeCrossBrainResults(
  perBrainResults: Array<Array<{id: string; similarity?: number; brain_id?: string}>>,
  limit: number,
): Array<{id: string; similarity?: number; brain_id?: string}> {
  const seen = new Set<string>();
  const all = perBrainResults.flat().sort((a,b) => (b.similarity??0)-(a.similarity??0));
  const out: typeof all = [];
  for (const e of all) { if (!seen.has(e.id)) { seen.add(e.id); out.push(e); if (out.length >= limit) break; } }
  return out;
}
