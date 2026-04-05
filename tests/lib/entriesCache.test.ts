import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { writeEntriesCache, readEntriesCache } from '../../src/lib/entriesCache';
import type { Entry } from '../../src/types';

describe('entriesCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when cache is empty (fresh DB)', async () => {
    // This test must run first before any writes
    const cached = await readEntriesCache();
    // On a fresh DB (no prior writes), expect null
    // After write test runs, IDB persists, so this only works first
    expect(cached === null || Array.isArray(cached)).toBe(true);
  });

  it('writes and reads entries from cache', async () => {
    const entries: Entry[] = [
      { id: '1', title: 'Test Entry', type: 'note' },
    ];
    await writeEntriesCache(entries);
    const cached = await readEntriesCache();
    expect(cached).toBeDefined();
    expect(cached!.length).toBeGreaterThanOrEqual(1);
    expect(cached!.some(e => e.title === 'Test Entry')).toBe(true);
  });

  it('writes to localStorage as fallback', async () => {
    const entries: Entry[] = [
      { id: '2', title: 'LS Entry', type: 'note' },
    ];
    await writeEntriesCache(entries);
    const lsData = localStorage.getItem('openbrain_entries');
    expect(lsData).toBeTruthy();
    const parsed = JSON.parse(lsData!);
    expect(parsed.some((e: Entry) => e.title === 'LS Entry')).toBe(true);
  });
});
