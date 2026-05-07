/**
 * List import parser — pure deterministic text → list items.
 *
 * Distinct from the entry capture parser (`/api/llm` + `nlpParser.ts`) — list
 * items are NOT classified, NOT embedded, NOT enriched. They're just rows of
 * text the user wants to track in a checklist.
 *
 * Handles:
 *   - Markdown bullets:  `- foo`, `* foo`, `+ foo`, `• foo`
 *   - Numbered:          `1. foo`, `1) foo`, `(1) foo`
 *   - Checkboxes:        `[ ] foo` → completed=false, `[x] foo` → completed=true
 *   - Plain lines:       `foo\nbar\nbaz`
 *   - CSV col-1:         `foo,extra,extra` → `foo` (strips matching outer quotes)
 *
 * Trims whitespace, skips empty lines, preserves duplicates (the user may
 * actually want "milk x2"). Returns up to MAX_ITEMS_PER_PARSE — anything over
 * is truncated and the caller is expected to surface a soft warning.
 */

export interface ListItem {
  id: string;
  title: string;
  completed: boolean;
  order: number;
  // Optional descriptive text under the title. Populated when items are
  // imported from a structured source (file extraction returns title +
  // description pairs). The pasted-text parser leaves this undefined —
  // free-form text can't be split into "item / description" reliably.
  description?: string;
}

export const MAX_ITEMS_PER_PARSE = 500;

// Order: checkbox first (it carries completed-state), then numbered/bullets.
// Each pattern strips its own prefix from the line and returns the rest.
type LinePattern = (line: string) => { rest: string; completed: boolean } | null;

const CHECKBOX_RE = /^\s*(?:[-*+•]\s+)?\[(\s|x|X)\]\s*(.*)$/;
const NUMBERED_RE = /^\s*(?:\(\d+\)|\d+[.)])\s+(.*)$/;
const BULLET_RE = /^\s*[-*+•]\s+(.*)$/;

const checkboxPattern: LinePattern = (line) => {
  const m = CHECKBOX_RE.exec(line);
  if (!m) return null;
  return { rest: m[2].trim(), completed: m[1].toLowerCase() === "x" };
};

const numberedPattern: LinePattern = (line) => {
  const m = NUMBERED_RE.exec(line);
  if (!m) return null;
  return { rest: m[1].trim(), completed: false };
};

const bulletPattern: LinePattern = (line) => {
  const m = BULLET_RE.exec(line);
  if (!m) return null;
  return { rest: m[1].trim(), completed: false };
};

const PATTERNS: LinePattern[] = [checkboxPattern, numberedPattern, bulletPattern];

// CSV col-1: take everything before the first unquoted comma. Strips a
// matching pair of surrounding quotes if present.
function takeCsvCol1(s: string): string {
  // If line has no comma, return as-is
  if (!s.includes(",")) return s;

  // Naive parse — first cell only. Handle quoted cell with comma inside.
  if (s.startsWith('"')) {
    const closingQuote = s.indexOf('"', 1);
    if (closingQuote > 0) return s.slice(1, closingQuote);
  }
  return s.slice(0, s.indexOf(","));
}

function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for old environments — Math.random is OK; ids are local-only.
  return `lst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function parseListText(raw: string): ListItem[] {
  if (!raw) return [];

  const lines = raw.split(/\r?\n/);
  const items: ListItem[] = [];
  let order = 0;

  for (const rawLine of lines) {
    if (items.length >= MAX_ITEMS_PER_PARSE) {
      console.warn(
        `[listParser] truncated at ${MAX_ITEMS_PER_PARSE} items; ${lines.length - items.length} lines dropped`,
      );
      break;
    }

    const line = rawLine.trim();
    if (!line) continue;

    // Run patterns in priority order. First match wins.
    let matched: { rest: string; completed: boolean } | null = null;
    for (const pat of PATTERNS) {
      matched = pat(line);
      if (matched) break;
    }

    // No pattern matched → treat whole line as the item title (after CSV col-1).
    const candidate = matched ?? { rest: line, completed: false };
    const title = takeCsvCol1(candidate.rest).trim();
    if (!title) continue;

    items.push({
      id: genId(),
      title,
      completed: candidate.completed,
      order: order++,
    });
  }

  return items;
}
