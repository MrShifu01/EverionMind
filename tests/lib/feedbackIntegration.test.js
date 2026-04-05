import { describe, it, expect, beforeEach } from 'vitest';

import {
  createFeedbackEvent,
  bufferFeedback,
  getBufferedFeedback,
  clearBuffer,
  FEEDBACK_TYPES,
  trackCaptureEdits,
  trackRefineAction,
} from '../../src/lib/feedbackLearning';

/* ──────────────────────────────────────────────
   § 1  trackCaptureEdits — QuickCapture integration
   Compares AI suggestion vs user's final edits
   ────────────────────────────────────────────── */
describe('trackCaptureEdits', () => {
  beforeEach(() => { localStorage.clear(); });

  it('records feedback when user changes the title', () => {
    const aiParsed = { title: 'AI Title', type: 'note', tags: ['tag1'] };
    const userFinal = { title: 'My Custom Title', type: 'note', tags: ['tag1'] };

    trackCaptureEdits(aiParsed, userFinal, 'some raw input');

    const buf = getBufferedFeedback();
    expect(buf).toHaveLength(1);
    expect(buf[0].type).toBe(FEEDBACK_TYPES.CAPTURE_EDIT);
    expect(buf[0].field).toBe('title');
    expect(buf[0].aiValue).toBe('AI Title');
    expect(buf[0].userValue).toBe('My Custom Title');
    expect(buf[0].rawInput).toBe('some raw input');
  });

  it('records feedback when user changes the type', () => {
    const aiParsed = { title: 'Same', type: 'note', tags: [] };
    const userFinal = { title: 'Same', type: 'person', tags: [] };

    trackCaptureEdits(aiParsed, userFinal);

    const buf = getBufferedFeedback();
    expect(buf).toHaveLength(1);
    expect(buf[0].field).toBe('type');
    expect(buf[0].aiValue).toBe('note');
    expect(buf[0].userValue).toBe('person');
  });

  it('records feedback when user changes tags', () => {
    const aiParsed = { title: 'Same', type: 'note', tags: ['a', 'b'] };
    const userFinal = { title: 'Same', type: 'note', tags: ['a', 'c'] };

    trackCaptureEdits(aiParsed, userFinal);

    const buf = getBufferedFeedback();
    expect(buf).toHaveLength(1);
    expect(buf[0].field).toBe('tags');
  });

  it('records multiple changes as separate events', () => {
    const aiParsed = { title: 'AI Title', type: 'note', tags: ['a'] };
    const userFinal = { title: 'User Title', type: 'person', tags: ['b'] };

    trackCaptureEdits(aiParsed, userFinal);

    const buf = getBufferedFeedback();
    expect(buf).toHaveLength(3); // title + type + tags
  });

  it('does nothing when no changes were made', () => {
    const aiParsed = { title: 'Same', type: 'note', tags: ['a'] };
    const userFinal = { title: 'Same', type: 'note', tags: ['a'] };

    trackCaptureEdits(aiParsed, userFinal);

    expect(getBufferedFeedback()).toHaveLength(0);
  });
});

/* ──────────────────────────────────────────────
   § 2  trackRefineAction — RefineView integration
   ────────────────────────────────────────────── */
describe('trackRefineAction', () => {
  beforeEach(() => { localStorage.clear(); });

  it('records a reject action', () => {
    trackRefineAction('reject', {
      suggestionType: 'TYPE_MISMATCH',
      field: 'type',
      suggestedValue: 'person',
      currentValue: 'note',
      entryTitle: 'My meeting notes',
    });

    const buf = getBufferedFeedback();
    expect(buf).toHaveLength(1);
    expect(buf[0].type).toBe(FEEDBACK_TYPES.REFINE_REJECT);
    expect(buf[0].suggestionType).toBe('TYPE_MISMATCH');
    expect(buf[0].entryTitle).toBe('My meeting notes');
  });

  it('records an edit action with user override', () => {
    trackRefineAction('edit', {
      suggestionType: 'TITLE_POOR',
      field: 'title',
      suggestedValue: 'Better Title',
      userValue: 'My Actual Title',
      entryTitle: 'Note',
    });

    const buf = getBufferedFeedback();
    expect(buf).toHaveLength(1);
    expect(buf[0].type).toBe(FEEDBACK_TYPES.REFINE_EDIT);
    expect(buf[0].userValue).toBe('My Actual Title');
  });

  it('records an accept action', () => {
    trackRefineAction('accept', {
      suggestionType: 'PHONE_FOUND',
      field: 'metadata.phone',
      suggestedValue: '082 555 1234',
    });

    const buf = getBufferedFeedback();
    expect(buf).toHaveLength(1);
    expect(buf[0].type).toBe(FEEDBACK_TYPES.REFINE_ACCEPT);
  });

  it('records link reject', () => {
    trackRefineAction('reject', {
      suggestionType: 'LINK_SUGGESTED',
      fromTitle: 'Company A',
      toTitle: 'Person B',
      rel: 'works at',
    });

    const buf = getBufferedFeedback();
    expect(buf).toHaveLength(1);
    expect(buf[0].type).toBe(FEEDBACK_TYPES.REFINE_REJECT);
    expect(buf[0].suggestionType).toBe('LINK_SUGGESTED');
  });

  it('records link edit with custom rel', () => {
    trackRefineAction('edit', {
      suggestionType: 'LINK_SUGGESTED',
      fromTitle: 'Company A',
      toTitle: 'Person B',
      suggestedValue: 'works at',
      userValue: 'supplies',
    });

    const buf = getBufferedFeedback();
    expect(buf).toHaveLength(1);
    expect(buf[0].type).toBe(FEEDBACK_TYPES.REFINE_EDIT);
    expect(buf[0].suggestedValue).toBe('works at');
    expect(buf[0].userValue).toBe('supplies');
  });
});
