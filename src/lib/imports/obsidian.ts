// Obsidian — folder of .md files (typically zipped). YAML frontmatter
// becomes metadata; inline #tags get extracted.
import JSZip from "jszip";
import {
  type ImportEntry,
  type Parser,
  abortIfNeeded,
  importHash,
  parseFrontmatter,
  extractInlineTags,
  yieldToUi,
} from "./types";

function titleFromContent(body: string, fallback: string): string {
  // Prefer the first H1, fall back to the filename without extension.
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  const firstLine = body.split("\n").find((l) => l.trim().length > 0);
  return firstLine?.trim().slice(0, 200) || fallback;
}

function normaliseTags(meta: Record<string, unknown>, body: string): string[] {
  const set = new Set<string>();
  const fmTags = meta.tags;
  if (Array.isArray(fmTags)) {
    for (const t of fmTags) if (typeof t === "string") set.add(t.toLowerCase());
  } else if (typeof fmTags === "string") {
    fmTags
      .split(/[,\s]+/)
      .filter(Boolean)
      .forEach((t) => set.add(t.toLowerCase()));
  }
  for (const t of extractInlineTags(body)) set.add(t);
  return Array.from(set).slice(0, 32);
}

async function convertMdFile(
  path: string,
  text: string,
  source: "obsidian" | "bear",
): Promise<ImportEntry | null> {
  const { meta, body } = parseFrontmatter(text);
  const fileName = (path.split("/").pop() ?? "untitled").replace(/\.md$/i, "");
  const title = (typeof meta.title === "string" && meta.title) || titleFromContent(body, fileName);
  if (!title.trim()) return null;
  const tags = normaliseTags(meta, body);
  const created =
    (typeof meta.created === "string" && meta.created) ||
    (typeof meta.date === "string" && meta.date) ||
    undefined;
  const createdIso = created && !Number.isNaN(Date.parse(created))
    ? new Date(created).toISOString()
    : undefined;
  const hash = await importHash(source, path, title, body.slice(0, 200));
  // Strip the title H1 from body if it's the first heading — title carries it.
  const cleanBody = body.replace(/^#\s+.+\n+/, "").trim();
  const metadata: Record<string, unknown> = {
    import_hash: hash,
    import_source: source,
    source_path: path,
    ...(meta.aliases ? { aliases: meta.aliases } : {}),
  };
  return {
    title: title.slice(0, 500),
    content: cleanBody,
    type: "note",
    tags,
    metadata,
    ...(createdIso ? { created_at: createdIso } : {}),
  };
}

function makeMdParser(source: "obsidian" | "bear"): Parser {
  return async (files, onProgress, signal) => {
    type Task =
      | { kind: "zip"; path: string; zf: JSZip.JSZipObject }
      | { kind: "file"; file: File };
    const tasks: Task[] = [];

    for (const file of Array.from(files)) {
      abortIfNeeded(signal);
      const name = file.name.toLowerCase();
      if (name.endsWith(".zip")) {
        const zip = await JSZip.loadAsync(file);
        for (const zf of Object.values(zip.files)) {
          if (zf.dir) continue;
          if (!zf.name.toLowerCase().endsWith(".md")) continue;
          // Skip Obsidian's own internal files.
          if (/(?:^|\/)\.obsidian\//i.test(zf.name)) continue;
          tasks.push({ kind: "zip", path: zf.name, zf });
        }
      } else if (name.endsWith(".md")) {
        tasks.push({ kind: "file", file });
      }
    }

    const out: ImportEntry[] = [];
    let processed = 0;
    for (const task of tasks) {
      abortIfNeeded(signal);
      try {
        const path = task.kind === "zip" ? task.path : task.file.name;
        const text = task.kind === "zip" ? await task.zf.async("text") : await task.file.text();
        const entry = await convertMdFile(path, text, source);
        if (entry) out.push(entry);
      } catch {
        /* malformed — skip */
      }
      processed++;
      if (processed % 200 === 0) {
        onProgress(processed, tasks.length);
        await yieldToUi();
      }
    }
    onProgress(tasks.length, tasks.length);
    return out;
  };
}

export const parseObsidian: Parser = makeMdParser("obsidian");
export const parseBear: Parser = makeMdParser("bear");
