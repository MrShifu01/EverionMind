/**
 * feedbackLearning.js — Tracks user corrections to AI suggestions,
 * distills patterns into learning rules, and maintains a lean memory
 * section that makes the AI smarter over time.
 *
 * Integration points:
 *   - QuickCapture: when user edits AI-parsed title/type/tags before saving
 *   - RefineView:   when user accepts, edits, or rejects a suggestion
 *   - SuggestionsView: when user provides an answer (optional tracking)
 *
 * Memory is stored in the user's memory guide under [Learned Preferences].
 */

/* ─── Constants ─── */

export const FEEDBACK_TYPES = {
  CAPTURE_EDIT:   "CAPTURE_EDIT",   // user changed AI-parsed field in preview
  REFINE_ACCEPT:  "REFINE_ACCEPT",  // user accepted refine suggestion as-is
  REFINE_EDIT:    "REFINE_EDIT",    // user edited refine suggestion before applying
  REFINE_REJECT:  "REFINE_REJECT",  // user rejected refine suggestion
  QA_EDIT:        "QA_EDIT",        // user modified AI-parsed Q&A entry
};

const VALID_TYPES = new Set(Object.values(FEEDBACK_TYPES));

export const DISTILL_THRESHOLD = 5;   // min events before triggering distillation
export const MAX_LEARNING_RULES = 20; // hard cap on stored rules
export const LEARNING_SECTION_HEADER = "[Learned Preferences]";

const BUFFER_KEY = "openbrain_feedback_buffer";
const MAX_BUFFER = 50;

/* ─── Feedback event creation ─── */

export function createFeedbackEvent(type, details = {}) {
  if (!VALID_TYPES.has(type)) {
    throw new Error(`Unknown feedback type: ${type}`);
  }
  return {
    type,
    timestamp: new Date().toISOString(),
    ...details,
  };
}

/* ─── Feedback buffer (localStorage) ─── */

export function getBufferedFeedback() {
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function bufferFeedback(event) {
  const buf = getBufferedFeedback();
  buf.push(event);
  // FIFO cap — keep newest events
  const capped = buf.length > MAX_BUFFER ? buf.slice(buf.length - MAX_BUFFER) : buf;
  localStorage.setItem(BUFFER_KEY, JSON.stringify(capped));
}

export function clearBuffer() {
  localStorage.removeItem(BUFFER_KEY);
}

/* ─── Distillation threshold ─── */

export function shouldDistill(events) {
  return Array.isArray(events) && events.length >= DISTILL_THRESHOLD;
}

/* ─── Learning section extraction / merge ─── */

export function extractLearningSection(memoryGuide) {
  if (!memoryGuide) return "";
  const idx = memoryGuide.indexOf(LEARNING_SECTION_HEADER);
  if (idx === -1) return "";

  const afterHeader = memoryGuide.slice(idx + LEARNING_SECTION_HEADER.length);

  // Find the next section header [Xxx] or end of string
  const nextSection = afterHeader.search(/\n\[(?!Learned Preferences\])/);
  const sectionContent = nextSection === -1 ? afterHeader : afterHeader.slice(0, nextSection);

  return sectionContent.trim();
}

export function mergeLearningSection(memoryGuide, rules) {
  const guide = memoryGuide || "";

  // Remove existing learning section if present
  let cleaned = guide;
  const idx = cleaned.indexOf(LEARNING_SECTION_HEADER);
  if (idx !== -1) {
    const before = cleaned.slice(0, idx);
    const afterHeader = cleaned.slice(idx + LEARNING_SECTION_HEADER.length);
    const nextSection = afterHeader.search(/\n\[(?!Learned Preferences\])/);
    const after = nextSection === -1 ? "" : afterHeader.slice(nextSection);
    cleaned = (before + after).trim();
  }

  // If no rules, just return cleaned guide
  if (!rules || !rules.trim()) return cleaned;

  // Append new learning section
  const section = `${LEARNING_SECTION_HEADER}\n${rules.trim()}`;
  return cleaned ? `${cleaned}\n\n${section}` : section;
}

/* ─── Distill prompt building ─── */

export function buildDistillPrompt(events, existingRules) {
  const eventSummary = (events || []).map((e, i) => {
    switch (e.type) {
      case FEEDBACK_TYPES.CAPTURE_EDIT:
        return `${i + 1}. CAPTURE CORRECTION: Field "${e.field}" — AI suggested "${e.aiValue}", user changed to "${e.userValue}"${e.rawInput ? ` (raw input: "${e.rawInput}")` : ""}`;
      case FEEDBACK_TYPES.REFINE_REJECT:
        return `${i + 1}. REFINE REJECTED: ${e.suggestionType} on "${e.entryTitle}" — AI suggested ${e.field}="${e.suggestedValue}", current was "${e.currentValue}". User rejected.`;
      case FEEDBACK_TYPES.REFINE_EDIT:
        return `${i + 1}. REFINE EDITED: ${e.suggestionType} on "${e.entryTitle}" — AI suggested "${e.suggestedValue}", user changed to "${e.userValue}"`;
      case FEEDBACK_TYPES.REFINE_ACCEPT:
        return `${i + 1}. REFINE ACCEPTED: ${e.suggestionType} — "${e.suggestedValue}" applied`;
      case FEEDBACK_TYPES.QA_EDIT:
        return `${i + 1}. QA CORRECTION: Field "${e.field}" — AI parsed "${e.aiValue}", user changed to "${e.userValue}"`;
      default:
        return `${i + 1}. ${e.type}: ${JSON.stringify(e)}`;
    }
  }).join("\n");

  const existingContext = existingRules
    ? `\n\nEXISTING RULES (update/merge/replace as needed):\n${existingRules}`
    : "";

  return `USER FEEDBACK EVENTS:\n${eventSummary || "(none)"}${existingContext}`;
}

/* ─── Parse distill response ─── */

export function parseDistillResponse(text) {
  if (!text) return [];
  // Strip markdown fences
  const cleaned = text.replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*/g, "").trim())
    .replace(/```/g, "")
    .trim();

  // Extract bullet-point lines
  const rules = cleaned
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.startsWith("- ") && line.length > 3)
    .slice(0, MAX_LEARNING_RULES);

  return rules;
}

/* ─── Memory hygiene ─── */

export function applyMemoryHygiene(rules) {
  if (!Array.isArray(rules)) return [];

  const seen = new Set();
  const clean = [];

  for (const rule of rules) {
    const trimmed = rule.trim();
    // Must be a non-empty bullet rule with content after "- "
    if (!trimmed.startsWith("- ") || trimmed.length <= 2) continue;

    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    clean.push(trimmed);
  }

  // Enforce max cap — keep newest (last added)
  return clean.slice(-MAX_LEARNING_RULES);
}

/* ─── Integration helpers ─── */

/**
 * Compare AI-parsed capture with user's final edits and buffer differences.
 * Called from QuickCapture when user saves after editing the preview.
 */
export function trackCaptureEdits(aiParsed, userFinal, rawInput) {
  if (!aiParsed || !userFinal) return;

  // Check title
  if (aiParsed.title !== userFinal.title) {
    bufferFeedback(createFeedbackEvent(FEEDBACK_TYPES.CAPTURE_EDIT, {
      field: "title",
      aiValue: aiParsed.title,
      userValue: userFinal.title,
      rawInput,
    }));
  }

  // Check type
  if (aiParsed.type !== userFinal.type) {
    bufferFeedback(createFeedbackEvent(FEEDBACK_TYPES.CAPTURE_EDIT, {
      field: "type",
      aiValue: aiParsed.type,
      userValue: userFinal.type,
      rawInput,
    }));
  }

  // Check tags
  const aiTags = (aiParsed.tags || []).slice().sort().join(",");
  const userTags = (userFinal.tags || []).slice().sort().join(",");
  if (aiTags !== userTags) {
    bufferFeedback(createFeedbackEvent(FEEDBACK_TYPES.CAPTURE_EDIT, {
      field: "tags",
      aiValue: (aiParsed.tags || []).join(", "),
      userValue: (userFinal.tags || []).join(", "),
      rawInput,
    }));
  }
}

/**
 * Track a refine action (accept/edit/reject).
 * Called from RefineView on user interaction with suggestion cards.
 */
export function trackRefineAction(action, details) {
  const typeMap = {
    accept: FEEDBACK_TYPES.REFINE_ACCEPT,
    edit:   FEEDBACK_TYPES.REFINE_EDIT,
    reject: FEEDBACK_TYPES.REFINE_REJECT,
  };
  const feedbackType = typeMap[action];
  if (!feedbackType) return;

  bufferFeedback(createFeedbackEvent(feedbackType, details));
}

/* ─── Full distill-and-update orchestration ─── */

export async function distillAndUpdate(callAIFn, getMemoryFn, saveMemoryFn) {
  const buffer = getBufferedFeedback();
  if (!shouldDistill(buffer)) return false;

  try {
    const currentMemory = await getMemoryFn();
    const existingRules = extractLearningSection(currentMemory);
    const userMessage = buildDistillPrompt(buffer, existingRules);

    const res = await callAIFn({
      system: DISTILL_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      max_tokens: 800,
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || "";

    const newRules = parseDistillResponse(text);
    if (newRules.length === 0) {
      // AI found no patterns — still clear buffer to avoid re-processing
      clearBuffer();
      return true;
    }

    const hygienic = applyMemoryHygiene(newRules);
    const rulesText = hygienic.join("\n");
    const updatedMemory = mergeLearningSection(currentMemory, rulesText);

    await saveMemoryFn(updatedMemory);
    clearBuffer();
    return true;
  } catch {
    // Preserve buffer for retry on next threshold
    return false;
  }
}

/* ─── System prompt for distillation ─── */

export const DISTILL_SYSTEM_PROMPT = `You are a learning system for OpenBrain, a personal knowledge base. You analyze user corrections to AI suggestions and extract lasting preference rules.

TASK: Given a batch of user feedback events (corrections, rejections, edits to AI suggestions), distill them into concise, reusable rules that will prevent the same mistakes.

RULES FOR OUTPUT:
- Return ONLY bullet points starting with "- "
- Each rule must be specific and actionable (not vague)
- Merge overlapping rules into one
- If an existing rule already covers a correction, keep it unchanged
- If a new pattern contradicts an existing rule, replace the old rule with the updated one
- Maximum ${MAX_LEARNING_RULES} rules total
- Focus on PATTERNS, not one-off corrections (need 2+ similar events to create a rule)
- Rules should be about classification, typing, naming, metadata extraction, and relationship preferences
- Be concise: each rule should be one line, under 120 characters

EXAMPLES:
- When input contains a person's name, classify as "person" not "note"
- South African phone numbers (07x/08x) always go in metadata.phone
- Business supplier entries should be typed as "contact" not "person"
- User prefers short titles under 40 characters
- Do not suggest type changes for entries tagged "meeting-notes"

If no clear pattern emerges from the feedback, return an empty response.`;
