import { describe, it, expect } from 'vitest';
import { inferWorkspace } from '../../src/lib/workspaceInfer';
import type { Entry } from '../../src/types';

describe('inferWorkspace', () => {
  it('returns metadata.workspace if present', () => {
    const entry: Entry = { id: '1', title: 'Test', type: 'note', metadata: { workspace: 'personal' } };
    expect(inferWorkspace(entry)).toBe('personal');
  });

  it('returns "business" for business keywords', () => {
    const entry: Entry = { id: '2', title: 'Test', type: 'note', tags: ['Smash Burger Bar'] };
    expect(inferWorkspace(entry)).toBe('business');
  });

  it('returns "personal" for personal keywords', () => {
    const entry: Entry = { id: '3', title: 'Test', type: 'note', tags: ['medical aid'] };
    expect(inferWorkspace(entry)).toBe('personal');
  });

  it('returns "both" when no keywords match', () => {
    const entry: Entry = { id: '4', title: 'Test', type: 'note', tags: ['random'] };
    expect(inferWorkspace(entry)).toBe('both');
  });

  it('returns "both" when no tags exist', () => {
    const entry: Entry = { id: '5', title: 'Test', type: 'note' };
    expect(inferWorkspace(entry)).toBe('both');
  });
});
