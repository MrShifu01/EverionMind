import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { enqueue, getAll, remove, clear } from '../../src/lib/offlineQueue';
import type { OfflineOp } from '../../src/types';

describe('offlineQueue', () => {
  beforeEach(async () => {
    await clear();
  });

  it('enqueues and retrieves an operation', async () => {
    const op: OfflineOp = { id: 'a', url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() };
    await enqueue(op);
    const all = await getAll();
    expect(all.length).toBe(1);
    expect(all[0].id).toBe('a');
  });

  it('getAll returns items sorted by created_at', async () => {
    const op1: OfflineOp = { id: 'b', url: '/api/capture', method: 'POST', body: '{}', created_at: '2024-01-02T00:00:00Z' };
    const op2: OfflineOp = { id: 'a', url: '/api/capture', method: 'POST', body: '{}', created_at: '2024-01-01T00:00:00Z' };
    await enqueue(op1);
    await enqueue(op2);
    const all = await getAll();
    expect(all[0].id).toBe('a');
    expect(all[1].id).toBe('b');
  });

  it('removes an operation by id', async () => {
    const op: OfflineOp = { id: 'c', url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() };
    await enqueue(op);
    await remove('c');
    const all = await getAll();
    expect(all.length).toBe(0);
  });

  it('clear removes all operations', async () => {
    await enqueue({ id: 'd', url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() });
    await enqueue({ id: 'e', url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() });
    await clear();
    const all = await getAll();
    expect(all.length).toBe(0);
  });

  it('enqueue is idempotent for same id', async () => {
    const op: OfflineOp = { id: 'f', url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() };
    await enqueue(op);
    await enqueue(op);
    const all = await getAll();
    expect(all.length).toBe(1);
  });
});
