import { useState, useRef } from "react";
import JSZip from "jszip";
import { authFetch } from "../../lib/authFetch";

interface KeepNote {
  title?: string;
  textContent?: string;
  listContent?: Array<{ text: string; isChecked: boolean }>;
  labels?: Array<{ name: string }>;
  isTrashed?: boolean;
}

function convertKeepNote(
  note: KeepNote,
): { title: string; content: string; type: string; tags: string[] } | null {
  if (note.isTrashed) return null;

  const content = note.listContent?.length
    ? note.listContent.map((item) => `- [${item.isChecked ? "x" : " "}] ${item.text}`).join("\n")
    : (note.textContent ?? "");

  const title = note.title?.trim() || content.slice(0, 80);
  if (!title) return null;

  const tags = note.labels?.map((l) => l.name).filter(Boolean) ?? [];
  return { title, content, type: "note", tags };
}

async function parseKeepFiles(
  files: FileList,
): Promise<ReturnType<typeof convertKeepNote>[]> {
  const entries: ReturnType<typeof convertKeepNote>[] = [];

  for (const file of Array.from(files)) {
    if (file.name.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(file);
      const jsonFiles = Object.values(zip.files).filter(
        (f) => !f.dir && f.name.endsWith(".json"),
      );
      for (const zf of jsonFiles) {
        try {
          const text = await zf.async("text");
          const note: KeepNote = JSON.parse(text);
          const entry = convertKeepNote(note);
          if (entry) entries.push(entry);
        } catch {
          // skip malformed files
        }
      }
    } else if (file.name.endsWith(".json")) {
      try {
        const text = await file.text();
        const note: KeepNote = JSON.parse(text);
        const entry = convertKeepNote(note);
        if (entry) entries.push(entry);
      } catch {
        // skip malformed files
      }
    }
  }

  return entries;
}

export default function GoogleKeepImportPanel({ brainId }: { brainId: string }) {
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.target.value = "";

    setImporting(true);
    setStatus(null);

    let entries: ReturnType<typeof convertKeepNote>[];
    try {
      entries = await parseKeepFiles(files);
    } catch {
      setImporting(false);
      setStatus("error");
      setTimeout(() => setStatus(null), 4000);
      return;
    }

    if (entries.length === 0) {
      setImporting(false);
      setStatus("empty");
      setTimeout(() => setStatus(null), 4000);
      return;
    }

    const BATCH = 2000;
    let totalImported = 0;
    try {
      for (let i = 0; i < entries.length; i += BATCH) {
        const batch = entries.slice(i, i + BATCH);
        const res = await authFetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brain_id: brainId, entries: batch }),
        });
        if (!res.ok) throw new Error("import failed");
        const data = await res.json();
        totalImported += data.imported ?? batch.length;
      }
      setStatus(`imported:${totalImported}`);
    } catch {
      setStatus("error");
    }

    setImporting(false);
    setTimeout(() => setStatus(null), 5000);
  };

  const statusMsg = status?.startsWith("imported:")
    ? `✓ Imported ${status.split(":")[1]} notes`
    : status === "empty"
      ? "✗ No valid Keep notes found"
      : status === "error"
        ? "✗ Import failed"
        : null;

  return (
    <div
      className="space-y-3 rounded-2xl border p-4"
      style={{
        background: "var(--color-surface-container-high)",
        borderColor: "var(--color-outline-variant)",
      }}
    >
      <div>
        <p className="text-on-surface text-sm font-semibold">Import from Google Keep</p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
          Upload a Google Takeout <strong className="text-on-surface">.zip</strong> or individual
          Keep <strong className="text-on-surface">.json</strong> files. Trashed notes are skipped.
        </p>
      </div>
      <input
        type="file"
        accept=".zip,.json"
        multiple
        ref={fileRef}
        onChange={handleFiles}
        className="hidden"
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={importing}
        className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
        style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
      >
        {importing ? "Importing…" : "⬆ Import Keep Notes"}
      </button>
      {statusMsg && (
        <p
          className="text-xs"
          style={{
            color: statusMsg.startsWith("✓") ? "var(--color-primary)" : "var(--color-error)",
          }}
        >
          {statusMsg}
        </p>
      )}
    </div>
  );
}
