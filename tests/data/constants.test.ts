import { describe, it, expect } from 'vitest';
import { TC, PC, fmtD, INITIAL_ENTRIES, LINKS } from '../../src/data/constants';
import type { EntryType, Priority, TypeConfig, PriorityConfig } from '../../src/types';

describe('constants', () => {
  it('TC has all entry types with icon and color', () => {
    const expectedTypes: EntryType[] = [
      'reminder', 'document', 'contact', 'place', 'person',
      'idea', 'color', 'decision', 'note', 'secret',
    ];
    expectedTypes.forEach(type => {
      const config: TypeConfig = TC[type];
      expect(config).toBeDefined();
      expect(config.i).toBeTruthy();
      expect(config.c).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  it('PC has all priorities with bg, color, and label', () => {
    const expectedPriorities: Priority[] = ['high', 'medium', 'low'];
    expectedPriorities.forEach(p => {
      const config: PriorityConfig = PC[p];
      expect(config).toBeDefined();
      expect(config.bg).toBeTruthy();
      expect(config.c).toBeTruthy();
      expect(config.l).toBeTruthy();
    });
  });

  it('fmtD formats dates in en-ZA locale', () => {
    const result = fmtD('2024-01-15');
    expect(result).toContain('15');
    expect(result).toContain('Jan');
    expect(result).toContain('2024');
  });

  it('INITIAL_ENTRIES is an empty array', () => {
    expect(INITIAL_ENTRIES).toEqual([]);
  });

  it('LINKS is an empty array', () => {
    expect(LINKS).toEqual([]);
  });
});
