// ============================================================
// Shared types + helpers for bulk importers
// ============================================================
//
// Each importer is a pure function: (files) → ImportEntry[]. The shared
// `BulkImportPanel` component handles progress, batching, dedup, waved
// enrichment, cancellation, and resume — none of which a parser cares
// about. Adding a new source = one parser file + one panel instance.

export interface ImportEntry {
  title: string;
  content: string;
  type: string;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at?: string;
}

export type Parser = (
  files: FileList,
  onProgress: (current: number, total: number, detail?: string) => void,
  signal: AbortSignal,
) => Promise<ImportEntry[]>;

/** 16-char hex slice of SHA-256 over a stable per-note signature. Collision
 *  odds are ~1 in 2^32 per pair — negligible for any realistic import. */
export async function importHash(...parts: (string | number | undefined | null)[]): Promise<string> {
  const sig = parts.map((p) => String(p ?? "")).join("|");
  const enc = new TextEncoder().encode(sig);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Yield to the browser event loop so big parses don't freeze the UI. */
export const yieldToUi = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
}

// ── YAML frontmatter ───────────────────────────────────────────────────────
//
// Minimal parser for the common Obsidian / Bear cases. Supports:
//   key: scalar
//   key: "quoted scalar"
//   key: [inline, list]
//   key:
//     - item
//     - item
// Doesn't try to be a full YAML implementation — anything fancier flows
// through to body and the user can re-tag/re-edit later.

export function parseFrontmatter(text: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { meta: {}, body: text };
  }
  const headerStart = text.indexOf("\n") + 1;
  const closeIdx = text.indexOf("\n---", headerStart);
  if (closeIdx === -1) return { meta: {}, body: text };
  const yaml = text.slice(headerStart, closeIdx);
  const afterClose = text.indexOf("\n", closeIdx + 4);
  const body = afterClose === -1 ? "" : text.slice(afterClose + 1);
  return { meta: parseSimpleYaml(yaml), body };
}

function parseSimpleYaml(src: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = src.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^([\w.-]+):\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const rest = m[2];
    if (rest === "") {
      // Multi-line list / nested map. We only handle the list form.
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        const lm = next.match(/^\s+-\s+(.*)$/);
        if (!lm) break;
        items.push(stripQuotes(lm[1].trim()));
        j++;
      }
      if (items.length > 0) {
        out[key] = items;
        i = j;
        continue;
      }
    }
    if (rest.startsWith("[") && rest.endsWith("]")) {
      out[key] = rest
        .slice(1, -1)
        .split(",")
        .map((s) => stripQuotes(s.trim()))
        .filter(Boolean);
    } else {
      out[key] = stripQuotes(rest);
    }
    i++;
  }
  return out;
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ── Inline #tag extraction ────────────────────────────────────────────────

export function extractInlineTags(text: string): string[] {
  const seen = new Set<string>();
  // Matches `#word`, optionally `#word/nested`, but not `#1`, `# space`,
  // anchor links inside markdown headings, or URLs.
  const re = /(?:^|[\s(])#([A-Za-z][\w/-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    seen.add(m[1].toLowerCase());
  }
  return Array.from(seen).slice(0, 32);
}

// ── HTML → text (also reused by Evernote) ─────────────────────────────────

export function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?(?:p|div|br|li|tr|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── CSV (RFC4180-ish) ──────────────────────────────────────────────────────
//
// Handles quoted fields with embedded commas, newlines, and escaped quotes.
// Adequate for Notion / Readwise exports — neither does anything exotic.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += c;
        i++;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
        i++;
      } else if (c === ",") {
        row.push(field);
        field = "";
        i++;
      } else if (c === "\r") {
        i++;
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i++;
      } else {
        field += c;
        i++;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
