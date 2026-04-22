import { useState, useRef } from "react";
import JSZip from "jszip";
import { authFetch } from "../../lib/authFetch";
import { SettingsButton } from "./SettingsRow";

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

async function parseKeepFiles(files: FileList): Promise<ReturnType<typeof convertKeepNote>[]> {
  const entries: ReturnType<typeof convertKeepNote>[] = [];
  for (const file of Array.from(files)) {
    if (file.name.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(file);
      const jsonFiles = Object.values(zip.files).filter((f) => !f.dir && f.name.endsWith(".json"));
      for (const zf of jsonFiles) {
        try {
          const note: KeepNote = JSON.parse(await zf.async("text"));
          const entry = convertKeepNote(note);
          if (entry) entries.push(entry);
        } catch { /* skip malformed */ }
      }
    } else if (file.name.endsWith(".json")) {
      try {
        const note: KeepNote = JSON.parse(await file.text());
        const entry = convertKeepNote(note);
        if (entry) entries.push(entry);
      } catch { /* skip malformed */ }
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
        const res = await authFetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brain_id: brainId, entries: entries.slice(i, i + BATCH) }),
        });
        if (!res.ok) throw new Error("import failed");
        const data = await res.json();
        totalImported += data.imported ?? entries.slice(i, i + BATCH).length;
      }
      setStatus(`imported:${totalImported}`);
    } catch { setStatus("error"); }

    setImporting(false);
    setTimeout(() => setStatus(null), 5000);
  };

  const statusMsg = status?.startsWith("imported:")
    ? `${status.split(":")[1]} notes imported`
    : status === "empty" ? "No valid Keep notes found"
    : status === "error" ? "Import failed"
    : null;
  const statusOk = status?.startsWith("imported:");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div className="micro" style={{ marginBottom: 4 }}>Google Keep</div>
        <p className="f-serif" style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic", margin: 0 }}>
          Upload a Google Takeout <strong style={{ fontStyle: "normal", color: "var(--ink-soft)" }}>.zip</strong> or individual Keep <strong style={{ fontStyle: "normal", color: "var(--ink-soft)" }}>.json</strong> files. Trashed notes are skipped.
        </p>
      </div>
      <input type="file" accept=".zip,.json" multiple ref={fileRef} onChange={handleFiles} className="hidden" />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <SettingsButton onClick={() => fileRef.current?.click()} disabled={importing}>
          {importing ? "Importing…" : "Import Keep notes"}
        </SettingsButton>
        {statusMsg && (
          <p className="f-sans" style={{ fontSize: 12, color: statusOk ? "var(--moss)" : "var(--blood)", margin: 0 }}>
            {statusMsg}
          </p>
        )}
      </div>
    </div>
  );
}
