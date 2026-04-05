import { describe, it, expect } from 'vitest';
import { indexEntry, removeFromIndex, searchIndex } from '../../src/lib/searchIndex';
import type { Entry } from '../../src/types';

describe('searchIndex', () => {
  it('indexes and retrieves entries by title tokens', () => {
    const entry: Entry = { id: 'e1', title: 'Doctor Appointment', type: 'reminder' };
    indexEntry(entry);
    const results = searchIndex('doctor');
    expect(results).toBeDefined();
    expect(results!.has('e1')).toBe(true);
  });

  it('indexes content and tags', () => {
    const entry: Entry = { id: 'e2', title: 'Test', type: 'note', content: 'important meeting', tags: ['work'] };
    indexEntry(entry);
    const results = searchIndex('important');
    expect(results).toBeDefined();
    expect(results!.has('e2')).toBe(true);
  });

  it('removeFromIndex removes entry from results', () => {
    const entry: Entry = { id: 'e3', title: 'Unique Entry Title', type: 'note' };
    indexEntry(entry);
    removeFromIndex('e3');
    const results = searchIndex('unique');
    expect(results === null || !results.has('e3')).toBe(true);
  });

  it('returns null for empty query', () => {
    expect(searchIndex('')).toBeNull();
  });
});
