export interface VersionSnapshot {
  title?: string; content?: string; type?: string; tags?: string[];
  snapshot_at: string; [key: string]: unknown;
}
export function buildVersionSnapshot(entry: Record<string, unknown>): VersionSnapshot {
  const { id: _id, ...rest } = entry;
  return { ...rest, snapshot_at: new Date().toISOString() } as VersionSnapshot;
}
export function diffVersions(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  return Object.keys(b).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}
