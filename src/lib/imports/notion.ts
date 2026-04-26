// Notion — Markdown & CSV export zip. Pages are .md (often with UUID
// suffixes on filenames); databases are .csv (one row per item).
import JSZip from "jszip";
import {
  type ImportEntry,
  type Parser,
  abortIfNeeded,
  importHash,
  parseCsv,
  yieldToUi,
} from "./types";

// Notion appends a 32-char hex UUID to filenames. Strip it for clean titles.
const NOTION_UUID = /\s+[0-9a-f]{32}$/i;

function cleanNotionName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(NOTION_UUID, "").trim();
}

/** Notion adds a properties block right after the H1, formatted as
 *    Key: Value
 *  pairs (no YAML frontmatter). Strip them out and surface as metadata. */
function extractNotionProps(body: string): { meta: Record<string, string>; rest: string } {
  const lines = body.split("\n");
  const meta: Record<string, string> = {};
  let i = 0;
  // Skip the H1 if present.
  if (lines[i]?.startsWith("# ")) i++;
  // Skip blank lines.
  while (i < lines.length && lines[i].trim() === "") i++;
  // Read consecutive Key: Value lines.
  while (i < lines.length) {
    const m = lines[i].match(/^([A-Z][A-Za-z0-9 _-]{0,60}):\s+(.+)$/);
    if (!m) break;
    meta[m[1].trim().toLowerCase().replace(/\s+/g, "_")] = m[2].trim();
    i++;
  }
  // Bail if we didn't actually find any properties.
  if (Object.keys(meta).length === 0) return { meta: {}, rest: body };
  // Skip the blank line after the property block.
  if (lines[i]?.trim() === "") i++;
  return { meta, rest: lines.slice(i).join("\n") };
}

async function convertMdPage(path: string, text: string): Promise<ImportEntry | null> {
  const fileName = path.split("/").pop() ?? "untitled.md";
  const fallbackTitle = cleanNotionName(fileName);
  // Title preference: explicit H1 > cleaned filename
  const h1 = text.match(/^#\s+(.+)$/m);
  const title = (h1 ? h1[1].trim() : fallbackTitle) || fallbackTitle;
  if (!title) return null;
  const { meta, rest } = extractNotionProps(text);
  // Drop the H1 + property block from the body so it doesn't duplicate.
  const body = rest.replace(/^#\s+.+\n+/, "").trim();
  const tags = typeof meta.tags === "string"
    ? meta.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 32)
    : [];
  const created =
    (meta.created_time && Date.parse(meta.created_time))
      ? new Date(meta.created_time).toISOString()
      : (meta.created && Date.parse(meta.created))
        ? new Date(meta.created).toISOString()
        : undefined;
  const hash = await importHash("notion", path, title, body.slice(0, 200));
  return {
    title: title.slice(0, 500),
    content: body,
    type: "note",
    tags,
    metadata: {
      import_hash: hash,
      import_source: "notion",
      source_path: path,
      ...(Object.keys(meta).length > 0 ? { notion_properties: meta } : {}),
    },
    ...(created ? { created_at: created } : {}),
  };
}

async function convertCsvRow(
  dbName: string,
  headers: string[],
  row: string[],
  rowIdx: number,
): Promise<ImportEntry | null> {
  // Notion CSV: first column is usually the Name/Title. Use it.
  const titleField = row[0]?.trim() || `${dbName} row ${rowIdx + 1}`;
  // Build content from the remaining columns as `Field: Value` lines.
  const lines: string[] = [];
  const meta: Record<string, string> = {};
  for (let i = 1; i < headers.length; i++) {
    const k = headers[i]?.trim();
    const v = row[i]?.trim();
    if (!k || !v) continue;
    lines.push(`${k}: ${v}`);
    meta[k.toLowerCase().replace(/\s+/g, "_").slice(0, 50)] = v.slice(0, 500);
  }
  const content = lines.join("\n");
  const hash = await importHash("notion-db", dbName, titleField, content.slice(0, 200));
  return {
    title: titleField.slice(0, 500),
    content,
    type: "note",
    tags: [],
    metadata: {
      import_hash: hash,
      import_source: "notion",
      notion_database: dbName,
      ...meta,
    },
  };
}

export const parseNotion: Parser = async (files, onProgress, signal) => {
  type Task =
    | { kind: "md"; path: string; zf: JSZip.JSZipObject }
    | { kind: "csv"; path: string; zf: JSZip.JSZipObject }
    | { kind: "md-file"; file: File }
    | { kind: "csv-file"; file: File };
  const tasks: Task[] = [];

  for (const file of Array.from(files)) {
    abortIfNeeded(signal);
    const name = file.name.toLowerCase();
    if (name.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(file);
      for (const zf of Object.values(zip.files)) {
        if (zf.dir) continue;
        const lower = zf.name.toLowerCase();
        // Notion sometimes nests a "_all.csv" alongside row files — skip.
        if (lower.endsWith("_all.csv")) continue;
        if (lower.endsWith(".md")) tasks.push({ kind: "md", path: zf.name, zf });
        else if (lower.endsWith(".csv")) tasks.push({ kind: "csv", path: zf.name, zf });
      }
    } else if (name.endsWith(".md")) {
      tasks.push({ kind: "md-file", file });
    } else if (name.endsWith(".csv")) {
      tasks.push({ kind: "csv-file", file });
    }
  }

  const out: ImportEntry[] = [];
  let processed = 0;
  for (const task of tasks) {
    abortIfNeeded(signal);
    try {
      if (task.kind === "md" || task.kind === "md-file") {
        const path = task.kind === "md" ? task.path : task.file.name;
        const text = task.kind === "md" ? await task.zf.async("text") : await task.file.text();
        const entry = await convertMdPage(path, text);
        if (entry) out.push(entry);
      } else {
        const path = task.kind === "csv" ? task.path : task.file.name;
        const text = task.kind === "csv" ? await task.zf.async("text") : await task.file.text();
        const rows = parseCsv(text);
        if (rows.length < 2) continue;
        const headers = rows[0];
        const dbName = cleanNotionName(path.split("/").pop() ?? path);
        for (let r = 1; r < rows.length; r++) {
          const entry = await convertCsvRow(dbName, headers, rows[r], r - 1);
          if (entry) out.push(entry);
          if ((r & 0xff) === 0) await yieldToUi();
        }
      }
    } catch {
      /* malformed — skip */
    }
    processed++;
    if (processed % 50 === 0) {
      onProgress(processed, tasks.length);
      await yieldToUi();
    }
  }
  onProgress(tasks.length, tasks.length);
  return out;
};
