import { describe, it, expect } from 'vitest';
import { PROMPTS } from '../../src/config/prompts';

describe('prompts', () => {
  it('exports all required prompt keys', () => {
    const expectedKeys = [
      'CAPTURE', 'NUDGE', 'CHAT', 'QA_PARSE',
      'FILL_BRAIN', 'ENTRY_AUDIT', 'LINK_DISCOVERY',
      'LINK_DISCOVERY_PAIRS', 'CONNECTION_FINDER',
    ];
    expectedKeys.forEach(key => {
      expect(PROMPTS[key as keyof typeof PROMPTS]).toBeDefined();
      expect(typeof PROMPTS[key as keyof typeof PROMPTS]).toBe('string');
    });
  });

  it('CAPTURE prompt mentions JSON format', () => {
    expect(PROMPTS.CAPTURE).toContain('JSON');
  });

  it('ENTRY_AUDIT prompt mentions valid types', () => {
    expect(PROMPTS.ENTRY_AUDIT).toContain('TYPE_MISMATCH');
    expect(PROMPTS.ENTRY_AUDIT).toContain('PHONE_FOUND');
  });
});
