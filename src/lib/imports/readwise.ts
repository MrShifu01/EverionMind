// Readwise — CSV export. Highlights are grouped by book/article so the
// resulting entry is "one source = one entry" with all highlights in the
// content (instead of 5,000 separate one-line entries).
import {
  type ImportEntry,
  type Parser,
  abortIfNeeded,
  importHash,
  parseCsv,
  yieldToUi,
} from "./types";

interface ReadwiseRow {
  highlight: string;
  bookTitle: string;
  bookAuthor: string;
  note: string;
  location: string;
  highlightedAt: string;
  bookTags: string;
  documentTags: string;
  category: string;
}

function pickColumn(headers: string[], ...candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim() === c.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function rowToReadwise(headers: string[], row: string[]): ReadwiseRow {
  const get = (idx: number): string => (idx >= 0 ? row[idx]?.trim() ?? "" : "");
  return {
    highlight: get(pickColumn(headers, "Highlight")),
    bookTitle: get(pickColumn(headers, "Book Title", "Title")),
    bookAuthor: get(pickColumn(headers, "Book Author", "Author")),
    note: get(pickColumn(headers, "Note")),
    location: get(pickColumn(headers, "Location", "Highlight Location")),
    highlightedAt: get(pickColumn(headers, "Highlighted at", "Highlight Date")),
    bookTags: get(pickColumn(headers, "Book Tags", "Tags")),
    documentTags: get(pickColumn(headers, "Document Tags")),
    category: get(pickColumn(headers, "Category")),
  };
}

export const parseReadwise: Parser = async (files, onProgress, signal) => {
  // Collect all rows across however many CSV files were dropped in.
  const allRows: ReadwiseRow[] = [];
  for (const file of Array.from(files)) {
    abortIfNeeded(signal);
    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv")) continue;
    const rows = parseCsv(await file.text());
    if (rows.length < 2) continue;
    const headers = rows[0];
    for (let r = 1; r < rows.length; r++) {
      const rw = rowToReadwise(headers, rows[r]);
      if (rw.highlight) allRows.push(rw);
    }
  }

  // Group by (book title, author).
  type Bucket = { rows: ReadwiseRow[]; key: string };
  const buckets = new Map<string, Bucket>();
  for (const rw of allRows) {
    abortIfNeeded(signal);
    const key = `${rw.bookTitle}|${rw.bookAuthor}`;
    const b = buckets.get(key);
    if (b) b.rows.push(rw);
    else buckets.set(key, { rows: [rw], key });
  }

  const out: ImportEntry[] = [];
  let processed = 0;
  for (const bucket of buckets.values()) {
    abortIfNeeded(signal);
    const first = bucket.rows[0];
    const titleSuffix = first.bookAuthor ? ` — ${first.bookAuthor}` : "";
    const title = `${first.bookTitle}${titleSuffix}`.slice(0, 500);
    // Build content: each highlight as a paragraph, with optional note +
    // location below. Stable order = stable hash on re-import.
    const blocks: string[] = [];
    for (const rw of bucket.rows) {
      const parts = [rw.highlight];
      if (rw.note) parts.push(`Note: ${rw.note}`);
      if (rw.location) parts.push(`(${rw.location})`);
      blocks.push(parts.join("\n"));
    }
    const content = blocks.join("\n\n---\n\n");
    // Aggregate tags from per-book + per-document tag columns.
    const tagSet = new Set<string>();
    for (const rw of bucket.rows) {
      for (const t of (rw.bookTags + "," + rw.documentTags).split(",")) {
        const trimmed = t.trim();
        if (trimmed) tagSet.add(trimmed.toLowerCase());
      }
    }
    const tags = Array.from(tagSet).slice(0, 32);
    // First-seen highlightedAt becomes the entry's created_at.
    const created = bucket.rows
      .map((r) => r.highlightedAt)
      .filter(Boolean)
      .sort()[0];
    const createdIso = created && !Number.isNaN(Date.parse(created))
      ? new Date(created).toISOString()
      : undefined;
    const hash = await importHash("readwise", first.bookTitle, first.bookAuthor);
    out.push({
      title,
      content,
      type: "note",
      tags,
      metadata: {
        import_hash: hash,
        import_source: "readwise",
        readwise_book: first.bookTitle,
        ...(first.bookAuthor ? { readwise_author: first.bookAuthor } : {}),
        ...(first.category ? { readwise_category: first.category } : {}),
        readwise_highlight_count: bucket.rows.length,
      },
      ...(createdIso ? { created_at: createdIso } : {}),
    });
    processed++;
    if (processed % 100 === 0) {
      onProgress(processed, buckets.size);
      await yieldToUi();
    }
  }
  onProgress(buckets.size, buckets.size);
  return out;
};
