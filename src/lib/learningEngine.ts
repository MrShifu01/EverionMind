/**
 * OpenBrain Learning Engine
 *
 * Tracks user decisions across ALL features — Refine, Capture, Connections,
 * Chat, Suggestions — and distils them into compact "learnings" injected
 * into every AI prompt so the whole app gets smarter over time.
 *
 * Storage: localStorage, keyed per brain (each brain learns independently).
 */

const DECISIONS_KEY = "openbrain_learning_decisions";
const LEARNINGS_KEY = "openbrain_learning_summary";
const MAX_RAW_DECISIONS = 300;
const SUMMARIZE_EVERY = 10;

/* ─── Types ─── */

export type DecisionSource =
  | "refine"       // Refine audit suggestions
  | "capture"      // QuickCapture classification edits
  | "connection"   // Auto-link accept/remove
  | "suggestion"   // Fill-brain Q&A edits
  | "chat";        // Chat feedback (future)

export interface LearningDecision {
  /** Which feature produced this decision */
  source: DecisionSource;
  /** Suggestion type, e.g. TYPE_MISMATCH, LINK_SUGGESTED, CAPTURE_EDIT */
  type: string;
  /** What the user did */
  action: "accept" | "reject" | "edit";
  /** Field that was changed */
  field?: string;
  /** The AI's original value */
  originalValue?: string;
  /** What the user actually chose */
  finalValue?: string;
  /** Short reason / context */
  reason?: string;
  /** ISO timestamp */
  ts: string;
}

/* ─── Read / write helpers ─── */

function readDecisions(brainId: string): LearningDecision[] {
  try {
    // Check new key first, fall back to legacy refine key for migration
    const raw = localStorage.getItem(`${DECISIONS_KEY}:${brainId}`)
      || localStorage.getItem(`openbrain_refine_decisions:${brainId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeDecisions(brainId: string, decisions: LearningDecision[]): void {
  try {
    const trimmed = decisions.slice(-MAX_RAW_DECISIONS);
    localStorage.setItem(`${DECISIONS_KEY}:${brainId}`, JSON.stringify(trimmed));
    // Clean up legacy key if it exists
    localStorage.removeItem(`openbrain_refine_decisions:${brainId}`);
  } catch { /* quota exceeded — degrade gracefully */ }
}

function readLearnings(brainId: string): string {
  try {
    return localStorage.getItem(`${LEARNINGS_KEY}:${brainId}`)
      || localStorage.getItem(`openbrain_refine_learnings:${brainId}`)
      || "";
  } catch {
    return "";
  }
}

function writeLearnings(brainId: string, text: string): void {
  try {
    localStorage.setItem(`${LEARNINGS_KEY}:${brainId}`, text);
    localStorage.removeItem(`openbrain_refine_learnings:${brainId}`);
  } catch { /* quota exceeded */ }
}

/* ─── Public API ─── */

/** Record any user decision from any feature. */
export function recordDecision(
  brainId: string,
  decision: Omit<LearningDecision, "ts">,
): void {
  const decisions = readDecisions(brainId);
  decisions.push({ ...decision, ts: new Date().toISOString() });
  writeDecisions(brainId, decisions);

  if (decisions.length % SUMMARIZE_EVERY === 0) {
    summarizeLearnings(brainId, decisions);
  }
}

/**
 * Build a compact learnings string from raw decisions.
 * Called automatically every N decisions, but can also be called manually.
 */
function summarizeLearnings(brainId: string, decisions?: LearningDecision[]): void {
  const decs = decisions || readDecisions(brainId);
  if (decs.length === 0) return;

  const lines: string[] = [];

  /* ── Per-source stats ── */
  const bySource: Record<string, LearningDecision[]> = {};
  for (const d of decs) {
    const src = d.source || "refine"; // legacy decisions may lack source
    if (!bySource[src]) bySource[src] = [];
    bySource[src].push(d);
  }

  /* ── Refine & general: acceptance / rejection rates per type ── */
  const typeCounts: Record<string, { accept: number; reject: number; edit: number }> = {};
  const rejectReasons: Record<string, string[]> = {};
  const editPatterns: Array<{ type: string; from: string; to: string }> = [];
  const acceptedTypes: Record<string, string[]> = {};

  for (const d of decs) {
    if (!typeCounts[d.type]) typeCounts[d.type] = { accept: 0, reject: 0, edit: 0 };
    typeCounts[d.type][d.action]++;

    if (d.action === "reject" && d.reason) {
      if (!rejectReasons[d.type]) rejectReasons[d.type] = [];
      rejectReasons[d.type].push(d.reason);
    }
    if (d.action === "edit" && d.originalValue && d.finalValue) {
      editPatterns.push({ type: d.type, from: d.originalValue, to: d.finalValue });
    }
    if (d.action === "accept" && d.type === "TYPE_MISMATCH" && d.finalValue) {
      if (!acceptedTypes[d.finalValue]) acceptedTypes[d.finalValue] = [];
      if (d.originalValue) acceptedTypes[d.finalValue].push(d.originalValue);
    }
  }

  // Rejection / edit rates per suggestion type
  for (const [type, counts] of Object.entries(typeCounts)) {
    const total = counts.accept + counts.reject + counts.edit;
    if (total < 3) continue;

    const rejectRate = Math.round((counts.reject / total) * 100);
    if (rejectRate >= 60) {
      lines.push(`- User rejects ${type} suggestions ${rejectRate}% of the time. Be much more conservative with ${type}.`);
    } else if (rejectRate >= 40) {
      lines.push(`- User rejects ${type} suggestions ${rejectRate}% of the time. Raise your confidence threshold for ${type}.`);
    }

    if (counts.edit > 0 && counts.edit >= total * 0.3) {
      lines.push(`- User frequently edits ${type} suggestions (${counts.edit}/${total}). Suggestions are directionally correct but need refinement.`);
    }
  }

  // Type preferences from accepted TYPE_MISMATCH
  for (const [toType, fromTypes] of Object.entries(acceptedTypes)) {
    if (fromTypes.length >= 2) {
      const unique = [...new Set(fromTypes)];
      lines.push(`- User confirmed entries typed as "${unique.join('", "')}" should often be "${toType}".`);
    }
  }

  /* ── Capture-specific learnings ── */
  const captureDecs = bySource["capture"] || [];
  if (captureDecs.length >= 3) {
    const typeEdits = captureDecs.filter((d) => d.field === "type" && d.originalValue && d.finalValue);
    if (typeEdits.length >= 2) {
      const corrections: Record<string, string[]> = {};
      for (const d of typeEdits) {
        const key = d.originalValue!;
        if (!corrections[key]) corrections[key] = [];
        corrections[key].push(d.finalValue!);
      }
      for (const [from, tos] of Object.entries(corrections)) {
        const mostCommon = mode(tos);
        if (mostCommon) {
          lines.push(`- When classifying captures, AI often says "${from}" but user changes to "${mostCommon}". Prefer "${mostCommon}" in these cases.`);
        }
      }
    }

    const titleEdits = captureDecs.filter((d) => d.field === "title").length;
    if (titleEdits >= 3) {
      lines.push(`- User frequently edits AI-generated titles (${titleEdits}x). Generate more specific, concise titles.`);
    }

    const tagEdits = captureDecs.filter((d) => d.field === "tags").length;
    if (tagEdits >= 3) {
      lines.push(`- User frequently modifies tags (${tagEdits}x). Be more careful with tag suggestions.`);
    }
  }

  /* ── Connection-specific learnings ── */
  const connDecs = bySource["connection"] || [];
  if (connDecs.length >= 3) {
    const rejected = connDecs.filter((d) => d.action === "reject");
    const accepted = connDecs.filter((d) => d.action === "accept");
    if (rejected.length > accepted.length) {
      lines.push(`- User rejects most auto-suggested connections (${rejected.length}/${connDecs.length}). Only suggest very high-confidence links.`);
    }
    // Track rejected relationship types
    const rejectedRels = rejected.map((d) => d.originalValue).filter(Boolean);
    if (rejectedRels.length >= 3) {
      const topRejected = mode(rejectedRels as string[]);
      if (topRejected) {
        lines.push(`- Most rejected connection type: "${topRejected}". Avoid suggesting this relationship.`);
      }
    }
  }

  /* ── Common rejection themes ── */
  for (const [type, reasons] of Object.entries(rejectReasons)) {
    if (reasons.length >= 3) {
      const wordFreq: Record<string, number> = {};
      reasons.forEach((r) =>
        r.toLowerCase().split(/\s+/).forEach((w) => {
          if (w.length > 3) wordFreq[w] = (wordFreq[w] || 0) + 1;
        }),
      );
      const topWords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([w]) => w);
      if (topWords.length > 0) {
        lines.push(`- When rejecting ${type}, common themes: ${topWords.join(", ")}. Avoid suggestions related to these.`);
      }
    }
  }

  /* ── Recent edit patterns (last 5 as examples) ── */
  const recentEdits = editPatterns.slice(-5);
  if (recentEdits.length >= 2) {
    const examples = recentEdits
      .map((e) => `${e.type}: "${e.from}" → "${e.to}"`)
      .join("; ");
    lines.push(`- Recent user edits: ${examples}. Adapt suggestions to match this user's preferred style.`);
  }

  /* ── Header stats ── */
  const totalDecs = decs.length;
  const totalAccepts = decs.filter((d) => d.action === "accept").length;
  const totalRejects = decs.filter((d) => d.action === "reject").length;
  const sources = Object.keys(bySource).join(", ");
  lines.unshift(
    `User has made ${totalDecs} decisions across ${sources} (${totalAccepts} accepted, ${totalRejects} rejected). Learn from their patterns:`,
  );

  writeLearnings(brainId, lines.join("\n"));
}

/**
 * Get the learnings context string to inject into AI prompts.
 * Returns empty string if no learnings yet.
 */
export function getLearningsContext(brainId: string): string {
  const decs = readDecisions(brainId);
  if (decs.length > 0) {
    const stored = readLearnings(brainId);
    if (!stored) summarizeLearnings(brainId, decs);
  }
  return readLearnings(brainId);
}

/** Get raw decision count for display purposes. */
export function getDecisionCount(brainId: string): number {
  return readDecisions(brainId).length;
}

/** Get decision count by source. */
export function getDecisionCountBySource(brainId: string, source: DecisionSource): number {
  return readDecisions(brainId).filter((d) => d.source === source).length;
}

/* ─── Utilities ─── */

/** Find the most common element in an array. */
function mode(arr: string[]): string | null {
  const freq: Record<string, number> = {};
  for (const v of arr) freq[v] = (freq[v] || 0) + 1;
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, c] of Object.entries(freq)) {
    if (c > bestCount) { best = v; bestCount = c; }
  }
  return bestCount >= 2 ? best : null;
}
