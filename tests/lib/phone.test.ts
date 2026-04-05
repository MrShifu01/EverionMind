import { describe, it, expect } from 'vitest';
import { extractPhone, toWaUrl } from '../../src/lib/phone';
import type { Entry } from '../../src/types';

describe('extractPhone', () => {
  it('extracts +27 phone number from content', () => {
    const entry: Entry = { id: '1', title: 'Test', type: 'contact', content: 'Call +27612345678' };
    expect(extractPhone(entry)).toBe('+27612345678');
  });

  it('extracts 0-prefixed phone from metadata', () => {
    const entry: Entry = { id: '2', title: 'Test', type: 'contact', metadata: { phone: '0612345678' } };
    expect(extractPhone(entry)).toBe('0612345678');
  });

  it('returns null when no phone found', () => {
    const entry: Entry = { id: '3', title: 'Test', type: 'note' };
    expect(extractPhone(entry)).toBeNull();
  });
});

describe('toWaUrl', () => {
  it('converts +27 number to WhatsApp URL', () => {
    expect(toWaUrl('+27612345678')).toBe('https://wa.me/27612345678');
  });

  it('converts 0-prefixed number to WhatsApp URL with country code', () => {
    expect(toWaUrl('0612345678')).toBe('https://wa.me/27612345678');
  });
});
