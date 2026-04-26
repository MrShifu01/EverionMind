// Evernote — .enex (XML). Each <note> becomes an entry.
// Uses the browser's DOMParser instead of pulling in an XML library.
import {
  type ImportEntry,
  type Parser,
  abortIfNeeded,
  importHash,
  stripHtml,
  yieldToUi,
} from "./types";

function textOf(parent: Element, tag: string): string {
  const el = parent.getElementsByTagName(tag)[0];
  return el?.textContent?.trim() ?? "";
}

function tagsOf(parent: Element): string[] {
  const tags = parent.getElementsByTagName("tag");
  const out: string[] = [];
  for (let i = 0; i < tags.length; i++) {
    const v = tags[i].textContent?.trim();
    if (v) out.push(v);
  }
  return Array.from(new Set(out)).slice(0, 32);
}

async function convertEnexNote(noteEl: Element): Promise<ImportEntry | null> {
  const title = textOf(noteEl, "title") || "Untitled note";
  // <content> wraps a CDATA blob containing XHTML in an <en-note> element.
  const rawContent = textOf(noteEl, "content");
  const body = stripHtml(rawContent);
  if (!body && !title) return null;
  const created = textOf(noteEl, "created");
  const updated = textOf(noteEl, "updated");
  // Evernote timestamps are like "20240115T123045Z" — turn into ISO.
  const enToIso = (s: string): string | undefined => {
    const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    if (!m) return undefined;
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
  };
  const createdIso = enToIso(created);
  const updatedIso = enToIso(updated);
  const tags = tagsOf(noteEl);
  const resources = noteEl.getElementsByTagName("resource");
  const attachmentCount = resources.length;
  const attachmentNames: string[] = [];
  for (let i = 0; i < Math.min(resources.length, 10); i++) {
    const fname = resources[i].getElementsByTagName("file-name")[0]?.textContent?.trim();
    if (fname) attachmentNames.push(fname);
  }
  const hash = await importHash("evernote", title, body.slice(0, 200), created || updated);
  return {
    title: title.slice(0, 500),
    content: body,
    type: "note",
    tags,
    metadata: {
      import_hash: hash,
      import_source: "evernote",
      ...(updatedIso ? { original_edited_at: updatedIso } : {}),
      ...(attachmentCount > 0
        ? { attachments_dropped: attachmentCount, attachment_files: attachmentNames }
        : {}),
    },
    ...(createdIso ? { created_at: createdIso } : {}),
  };
}

export const parseEvernote: Parser = async (files, onProgress, signal) => {
  // Read all .enex files, concatenate their <note> elements.
  const allNotes: Element[] = [];
  for (const file of Array.from(files)) {
    abortIfNeeded(signal);
    if (!file.name.toLowerCase().endsWith(".enex")) continue;
    const text = await file.text();
    const doc = new DOMParser().parseFromString(text, "application/xml");
    // Browsers don't throw on bad XML — they emit a <parsererror>.
    if (doc.getElementsByTagName("parsererror").length > 0) continue;
    const notes = doc.getElementsByTagName("note");
    for (let i = 0; i < notes.length; i++) allNotes.push(notes[i]);
  }

  const out: ImportEntry[] = [];
  let processed = 0;
  for (const note of allNotes) {
    abortIfNeeded(signal);
    try {
      const entry = await convertEnexNote(note);
      if (entry) out.push(entry);
    } catch {
      /* malformed — skip */
    }
    processed++;
    if (processed % 200 === 0) {
      onProgress(processed, allNotes.length);
      await yieldToUi();
    }
  }
  onProgress(allNotes.length, allNotes.length);
  return out;
};
