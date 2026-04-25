// Google Keep / Takeout — zip of <Title>.json files under Keep/
import JSZip from "jszip";
import {
  type ImportEntry,
  type Parser,
  abortIfNeeded,
  importHash,
  yieldToUi,
} from "./types";

interface KeepAttachment {
  filePath?: string;
  mimetype?: string;
}

interface KeepNote {
  title?: string;
  textContent?: string;
  listContent?: Array<{ text: string; isChecked: boolean }>;
  labels?: Array<{ name: string }>;
  attachments?: KeepAttachment[];
  isTrashed?: boolean;
  isArchived?: boolean;
  userEditedTimestampUsec?: number;
  createdTimestampUsec?: number;
}

function usecToIso(usec?: number): string | undefined {
  if (!usec || !Number.isFinite(usec)) return undefined;
  const d = new Date(Math.floor(usec / 1000));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

async function convertNote(note: KeepNote): Promise<ImportEntry | null> {
  if (note.isTrashed) return null;
  const content = note.listContent?.length
    ? note.listContent.map((it) => `- [${it.isChecked ? "x" : " "}] ${it.text}`).join("\n")
    : (note.textContent ?? "");
  const title = note.title?.trim() || content.slice(0, 80);
  if (!title) return null;
  const tags = note.labels?.map((l) => l.name).filter(Boolean) ?? [];
  const hash = await importHash(
    note.title ?? "",
    (note.textContent ?? "").slice(0, 200),
    note.userEditedTimestampUsec ?? note.createdTimestampUsec ?? 0,
  );
  const createdAt = usecToIso(note.createdTimestampUsec);
  const editedAt = usecToIso(note.userEditedTimestampUsec);
  const attachments = Array.isArray(note.attachments) ? note.attachments : [];
  const metadata: Record<string, unknown> = {
    import_hash: hash,
    import_source: "google_keep",
    ...(editedAt ? { original_edited_at: editedAt } : {}),
    ...(note.isArchived ? { keep_archived: true } : {}),
    ...(attachments.length > 0
      ? {
          attachments_dropped: attachments.length,
          attachment_files: attachments.map((a) => a.filePath || "").filter(Boolean).slice(0, 10),
        }
      : {}),
  };
  return {
    title,
    content,
    type: "note",
    tags,
    metadata,
    ...(createdAt ? { created_at: createdAt } : {}),
  };
}

export const parseGoogleKeep: Parser = async (files, onProgress, signal) => {
  type Task = { kind: "zip"; zf: JSZip.JSZipObject } | { kind: "file"; file: File };
  const tasks: Task[] = [];

  for (const file of Array.from(files)) {
    abortIfNeeded(signal);
    if (file.name.toLowerCase().endsWith(".zip")) {
      const zip = await JSZip.loadAsync(file);
      for (const zf of Object.values(zip.files)) {
        if (zf.dir) continue;
        if (!zf.name.toLowerCase().endsWith(".json")) continue;
        // Skip non-Keep JSONs from a multi-product Takeout export.
        if (!/(?:^|\/)keep\//i.test(zf.name) && !/^[^/]+\.json$/i.test(zf.name)) continue;
        tasks.push({ kind: "zip", zf });
      }
    } else if (file.name.toLowerCase().endsWith(".json")) {
      tasks.push({ kind: "file", file });
    }
  }

  const out: ImportEntry[] = [];
  let processed = 0;
  for (const task of tasks) {
    abortIfNeeded(signal);
    try {
      const text = task.kind === "zip" ? await task.zf.async("text") : await task.file.text();
      const note: KeepNote = JSON.parse(text);
      const entry = await convertNote(note);
      if (entry) out.push(entry);
    } catch {
      /* malformed JSON — skip */
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
