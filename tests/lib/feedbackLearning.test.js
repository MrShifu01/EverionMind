import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  createFeedbackEvent,
  bufferFeedback,
  getBufferedFeedback,
  clearBuffer,
  shouldDistill,
  extractLearningSection,
  mergeLearningSection,
  buildDistillPrompt,
  parseDistillResponse,
  applyMemoryHygiene,
  distillAndUpdate,
  FEEDBACK_TYPES,
  DISTILL_THRESHOLD,
  MAX_LEARNING_RULES,
  LEARNING_SECTION_HEADER,
} from '../../src/lib/feedbackLearning';

/* ──────────────────────────────────────────────
   § 1  Feedback event creation
   ────────────────────────────────────────────── */
describe('createFeedbackEvent', () => {
  it('creates a capture-edit event with required fields', () => {
    const evt = createFeedbackEvent(FEEDBACK_TYPES.CAPTURE_EDIT, {
      field: 'type',
      aiValue: 'note',
      userValue: 'person',
      rawInput: 'John Smith 082 555 1234',
    });
    expect(evt.type).toBe(FEEDBACK_TYPES.CAPTURE_EDIT);
    expect(evt.field).toBe('type');
    expect(evt.aiValue).toBe('note');
    expect(evt.userValue).toBe('person');
    expect(evt.rawInput).toBe('John Smith 082 555 1234');
    expect(evt.timestamp).toBeDefined();
    expect(typeof evt.timestamp).toBe('string');
  });

  it('creates a refine-reject event', () => {
    const evt = createFeedbackEvent(FEEDBACK_TYPES.REFINE_REJECT, {
      suggestionType: 'TYPE_MISMATCH',
      field: 'type',
      suggestedValue: 'person',
      currentValue: 'note',
      entryTitle: 'My note about meetings',
    });
    expect(evt.type).toBe(FEEDBACK_TYPES.REFINE_REJECT);
    expect(evt.suggestionType).toBe('TYPE_MISMATCH');
    expect(evt.entryTitle).toBe('My note about meetings');
  });

  it('creates a refine-edit event with override value', () => {
    const evt = createFeedbackEvent(FEEDBACK_TYPES.REFINE_EDIT, {
      suggestionType: 'TITLE_POOR',
      field: 'title',
      suggestedValue: 'Better Title',
      userValue: 'My Custom Title',
      entryTitle: 'Note',
    });
    expect(evt.type).toBe(FEEDBACK_TYPES.REFINE_EDIT);
    expect(evt.suggestedValue).toBe('Better Title');
    expect(evt.userValue).toBe('My Custom Title');
  });

  it('creates a refine-accept event', () => {
    const evt = createFeedbackEvent(FEEDBACK_TYPES.REFINE_ACCEPT, {
      suggestionType: 'PHONE_FOUND',
      field: 'metadata.phone',
      suggestedValue: '082 555 1234',
    });
    expect(evt.type).toBe(FEEDBACK_TYPES.REFINE_ACCEPT);
  });

  it('throws on unknown feedback type', () => {
    expect(() => createFeedbackEvent('UNKNOWN_TYPE', {})).toThrow();
  });
});

/* ──────────────────────────────────────────────
   § 2  Feedback buffer (localStorage)
   ────────────────────────────────────────────── */
describe('feedback buffer', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('bufferFeedback stores event and getBufferedFeedback retrieves it', () => {
    const evt = createFeedbackEvent(FEEDBACK_TYPES.CAPTURE_EDIT, {
      field: 'type', aiValue: 'note', userValue: 'person',
    });
    bufferFeedback(evt);
    const buf = getBufferedFeedback();
    expect(buf).toHaveLength(1);
    expect(buf[0].type).toBe(FEEDBACK_TYPES.CAPTURE_EDIT);
  });

  it('accumulates multiple events', () => {
    bufferFeedback(createFeedbackEvent(FEEDBACK_TYPES.CAPTURE_EDIT, { field: 'type', aiValue: 'note', userValue: 'person' }));
    bufferFeedback(createFeedbackEvent(FEEDBACK_TYPES.REFINE_REJECT, { suggestionType: 'TYPE_MISMATCH', field: 'type', suggestedValue: 'person', currentValue: 'note' }));
    expect(getBufferedFeedback()).toHaveLength(2);
  });

  it('clearBuffer empties the buffer', () => {
    bufferFeedback(createFeedbackEvent(FEEDBACK_TYPES.CAPTURE_EDIT, { field: 'type', aiValue: 'note', userValue: 'person' }));
    clearBuffer();
    expect(getBufferedFeedback()).toHaveLength(0);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('openbrain_feedback_buffer', 'not-json');
    expect(getBufferedFeedback()).toEqual([]);
  });

  it('caps buffer at 50 events (FIFO — oldest dropped)', () => {
    for (let i = 0; i < 55; i++) {
      bufferFeedback(createFeedbackEvent(FEEDBACK_TYPES.CAPTURE_EDIT, {
        field: 'type', aiValue: `v${i}`, userValue: 'person',
      }));
    }
    const buf = getBufferedFeedback();
    expect(buf.length).toBeLessThanOrEqual(50);
    // Oldest events should have been dropped — newest should remain
    expect(buf[buf.length - 1].aiValue).toBe('v54');
  });
});

/* ──────────────────────────────────────────────
   § 3  Distillation threshold
   ────────────────────────────────────────────── */
describe('shouldDistill', () => {
  it('returns false when buffer is below threshold', () => {
    const events = Array.from({ length: DISTILL_THRESHOLD - 1 }, (_, i) =>
      createFeedbackEvent(FEEDBACK_TYPES.CAPTURE_EDIT, { field: 'type', aiValue: `v${i}`, userValue: 'person' })
    );
    expect(shouldDistill(events)).toBe(false);
  });

  it('returns true when buffer reaches threshold', () => {
    const events = Array.from({ length: DISTILL_THRESHOLD }, (_, i) =>
      createFeedbackEvent(FEEDBACK_TYPES.CAPTURE_EDIT, { field: 'type', aiValue: `v${i}`, userValue: 'person' })
    );
    expect(shouldDistill(events)).toBe(true);
  });

  it('returns false for empty buffer', () => {
    expect(shouldDistill([])).toBe(false);
  });
});

/* ──────────────────────────────────────────────
   § 4  Learning section extraction / merge
   ────────────────────────────────────────────── */
describe('extractLearningSection', () => {
  it('extracts learning rules from memory guide', () => {
    const guide = `My suppliers are wholesale.

${LEARNING_SECTION_HEADER}
- User prefers type "person" for named individuals
- Titles should be concise

[Other Section]
Something else`;
    const rules = extractLearningSection(guide);
    expect(rules).toContain('User prefers type "person"');
    expect(rules).toContain('Titles should be concise');
    expect(rules).not.toContain('Other Section');
    expect(rules).not.toContain('My suppliers');
  });

  it('returns empty string when no learning section exists', () => {
    expect(extractLearningSection('Just a plain memory guide')).toBe('');
    expect(extractLearningSection('')).toBe('');
    expect(extractLearningSection(null)).toBe('');
  });
});

describe('mergeLearningSection', () => {
  it('adds learning section to guide without one', () => {
    const guide = 'My suppliers are wholesale.';
    const rules = '- User prefers type "person" for named individuals';
    const result = mergeLearningSection(guide, rules);
    expect(result).toContain('My suppliers are wholesale.');
    expect(result).toContain(LEARNING_SECTION_HEADER);
    expect(result).toContain('User prefers type "person"');
  });

  it('replaces existing learning section', () => {
    const guide = `Manual notes.

${LEARNING_SECTION_HEADER}
- Old rule

[Other Section]
Other stuff`;
    const rules = '- New rule';
    const result = mergeLearningSection(guide, rules);
    expect(result).toContain('Manual notes.');
    expect(result).toContain('- New rule');
    expect(result).not.toContain('- Old rule');
    expect(result).toContain('[Other Section]');
    expect(result).toContain('Other stuff');
  });

  it('handles empty guide', () => {
    const result = mergeLearningSection('', '- Rule one');
    expect(result).toContain(LEARNING_SECTION_HEADER);
    expect(result).toContain('- Rule one');
  });

  it('removes learning section when rules are empty', () => {
    const guide = `Notes.\n\n${LEARNING_SECTION_HEADER}\n- Old rule`;
    const result = mergeLearningSection(guide, '');
    expect(result).toContain('Notes.');
    expect(result).not.toContain(LEARNING_SECTION_HEADER);
  });
});

/* ──────────────────────────────────────────────
   § 5  Distill prompt building
   ────────────────────────────────────────────── */
describe('buildDistillPrompt', () => {
  it('includes feedback events in the prompt', () => {
    const events = [
      createFeedbackEvent(FEEDBACK_TYPES.CAPTURE_EDIT, { field: 'type', aiValue: 'note', userValue: 'person', rawInput: 'John Smith' }),
    ];
    const prompt = buildDistillPrompt(events, '');
    expect(prompt).toContain('note');
    expect(prompt).toContain('person');
    expect(prompt).toContain('John Smith');
  });

  it('includes existing rules for context', () => {
    const events = [
      createFeedbackEvent(FEEDBACK_TYPES.CAPTURE_EDIT, { field: 'type', aiValue: 'note', userValue: 'person' }),
    ];
    const prompt = buildDistillPrompt(events, '- Existing rule about types');
    expect(prompt).toContain('Existing rule about types');
  });

  it('returns a non-empty string', () => {
    const prompt = buildDistillPrompt([], '');
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });
});

/* ──────────────────────────────────────────────
   § 6  Parse distill response
   ────────────────────────────────────────────── */
describe('parseDistillResponse', () => {
  it('parses bullet-point rules from AI response', () => {
    const text = `- User prefers "person" type for entries with names
- Phone numbers should always be extracted to metadata
- Titles should not exceed 40 characters`;
    const rules = parseDistillResponse(text);
    expect(rules).toHaveLength(3);
    expect(rules[0]).toContain('person');
  });

  it('handles markdown-wrapped response', () => {
    const text = '```\n- Rule one\n- Rule two\n```';
    const rules = parseDistillResponse(text);
    expect(rules).toHaveLength(2);
  });

  it('returns empty array for gibberish', () => {
    expect(parseDistillResponse('no rules here')).toEqual([]);
    expect(parseDistillResponse('')).toEqual([]);
  });

  it('enforces max rules limit', () => {
    const lines = Array.from({ length: MAX_LEARNING_RULES + 10 }, (_, i) => `- Rule ${i}`).join('\n');
    const rules = parseDistillResponse(lines);
    expect(rules.length).toBeLessThanOrEqual(MAX_LEARNING_RULES);
  });
});

/* ──────────────────────────────────────────────
   § 7  Memory hygiene
   ────────────────────────────────────────────── */
describe('applyMemoryHygiene', () => {
  it('removes exact duplicate rules', () => {
    const rules = [
      '- User prefers "person" for names',
      '- User prefers "person" for names',
      '- Titles should be short',
    ];
    const clean = applyMemoryHygiene(rules);
    expect(clean).toHaveLength(2);
  });

  it('preserves unique rules', () => {
    const rules = [
      '- Rule A',
      '- Rule B',
      '- Rule C',
    ];
    const clean = applyMemoryHygiene(rules);
    expect(clean).toHaveLength(3);
  });

  it('enforces max rules cap', () => {
    const rules = Array.from({ length: MAX_LEARNING_RULES + 5 }, (_, i) => `- Rule ${i}`);
    const clean = applyMemoryHygiene(rules);
    expect(clean.length).toBeLessThanOrEqual(MAX_LEARNING_RULES);
  });

  it('trims whitespace from rules', () => {
    const rules = ['  - Rule with spaces  ', '- Clean rule'];
    const clean = applyMemoryHygiene(rules);
    expect(clean[0]).toBe('- Rule with spaces');
  });

  it('removes empty rules', () => {
    const rules = ['- Valid', '', '  ', '-', '- Also valid'];
    const clean = applyMemoryHygiene(rules);
    expect(clean).toHaveLength(2);
    expect(clean[0]).toBe('- Valid');
    expect(clean[1]).toBe('- Also valid');
  });
});

/* ──────────────────────────────────────────────
   § 8  Full distill-and-update orchestration
   ────────────────────────────────────────────── */
describe('distillAndUpdate', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does nothing when buffer is below threshold', async () => {
    // Add fewer events than threshold
    bufferFeedback(createFeedbackEvent(FEEDBACK_TYPES.CAPTURE_EDIT, { field: 'type', aiValue: 'note', userValue: 'person' }));

    const mockCallAI = vi.fn();
    const mockGetMemory = vi.fn().mockResolvedValue('');
    const mockSaveMemory = vi.fn().mockResolvedValue(true);

    const result = await distillAndUpdate(mockCallAI, mockGetMemory, mockSaveMemory);
    expect(result).toBe(false);
    expect(mockCallAI).not.toHaveBeenCalled();
    // Buffer should NOT be cleared
    expect(getBufferedFeedback()).toHaveLength(1);
  });

  it('calls AI, updates memory, and clears buffer when threshold met', async () => {
    // Fill buffer to threshold
    for (let i = 0; i < DISTILL_THRESHOLD; i++) {
      bufferFeedback(createFeedbackEvent(FEEDBACK_TYPES.CAPTURE_EDIT, {
        field: 'type', aiValue: `note`, userValue: `person`,
      }));
    }

    const mockCallAI = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        content: [{ type: 'text', text: '- When input contains a name, classify as "person" not "note"' }],
      }),
    });
    const mockGetMemory = vi.fn().mockResolvedValue('My existing guide.');
    const mockSaveMemory = vi.fn().mockResolvedValue(true);

    const result = await distillAndUpdate(mockCallAI, mockGetMemory, mockSaveMemory);
    expect(result).toBe(true);
    expect(mockCallAI).toHaveBeenCalled();
    expect(mockSaveMemory).toHaveBeenCalled();

    // Memory should contain the new rule merged with existing
    const savedContent = mockSaveMemory.mock.calls[0][0];
    expect(savedContent).toContain('My existing guide.');
    expect(savedContent).toContain(LEARNING_SECTION_HEADER);
    expect(savedContent).toContain('person');

    // Buffer should be cleared after successful distillation
    expect(getBufferedFeedback()).toHaveLength(0);
  });

  it('does not clear buffer if AI call fails', async () => {
    for (let i = 0; i < DISTILL_THRESHOLD; i++) {
      bufferFeedback(createFeedbackEvent(FEEDBACK_TYPES.CAPTURE_EDIT, {
        field: 'type', aiValue: 'note', userValue: 'person',
      }));
    }

    const mockCallAI = vi.fn().mockRejectedValue(new Error('Network error'));
    const mockGetMemory = vi.fn().mockResolvedValue('');
    const mockSaveMemory = vi.fn();

    const result = await distillAndUpdate(mockCallAI, mockGetMemory, mockSaveMemory);
    expect(result).toBe(false);
    expect(mockSaveMemory).not.toHaveBeenCalled();
    // Buffer preserved for retry
    expect(getBufferedFeedback()).toHaveLength(DISTILL_THRESHOLD);
  });

  it('merges new rules with existing learning section', async () => {
    for (let i = 0; i < DISTILL_THRESHOLD; i++) {
      bufferFeedback(createFeedbackEvent(FEEDBACK_TYPES.REFINE_REJECT, {
        suggestionType: 'TYPE_MISMATCH', field: 'type',
        suggestedValue: 'person', currentValue: 'note',
        entryTitle: `Entry ${i}`,
      }));
    }

    const existingMemory = `My notes.\n\n${LEARNING_SECTION_HEADER}\n- Old rule about contacts`;

    const mockCallAI = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        content: [{ type: 'text', text: '- Old rule about contacts\n- New rule: do not suggest type changes for meeting notes' }],
      }),
    });
    const mockGetMemory = vi.fn().mockResolvedValue(existingMemory);
    const mockSaveMemory = vi.fn().mockResolvedValue(true);

    await distillAndUpdate(mockCallAI, mockGetMemory, mockSaveMemory);

    const saved = mockSaveMemory.mock.calls[0][0];
    expect(saved).toContain('My notes.');
    // Should have deduplicated — AI returned old rule + new rule
    expect(saved).toContain('Old rule about contacts');
    expect(saved).toContain('do not suggest type changes');
  });
});
