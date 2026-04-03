import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { enqueue, getAll, remove, clear } from '../../src/lib/offlineQueue';

describe('offlineQueue', () => {
  beforeEach(async () => {
    await clear();
  });

  it('enqueue adds an op and getAll returns it', async () => {
    const op = {
      id: 'test-1',
      url: '/api/capture',
      method: 'POST',
      body: '{}',
      created_at: new Date().toISOString(),
    };
    await enqueue(op);
    const all = await getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('test-1');
  });

  it('getAll returns ops sorted oldest-first', async () => {
    await enqueue({ id: 'recent', url: '/api/capture', method: 'POST', body: '{}', created_at: '2026-01-02T00:00:00.000Z' });
    await enqueue({ id: 'old',    url: '/api/capture', method: 'POST', body: '{}', created_at: '2026-01-01T00:00:00.000Z' });
    const all = await getAll();
    expect(all[0].id).toBe('old');
    expect(all[1].id).toBe('recent');
  });

  it('remove deletes only the specified op', async () => {
    await enqueue({ id: 'keep',      url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() });
    await enqueue({ id: 'delete-me', url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() });
    await remove('delete-me');
    const all = await getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('keep');
  });

  it('clear empties the queue', async () => {
    await enqueue({ id: 'x', url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() });
    await clear();
    const all = await getAll();
    expect(all).toHaveLength(0);
  });

  it('enqueue is idempotent for the same id (put semantics)', async () => {
    const op = { id: 'dup', url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() };
    await enqueue(op);
    await enqueue(op);
    const all = await getAll();
    expect(all).toHaveLength(1);
  });
});
