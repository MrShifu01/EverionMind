import { useState, useRef } from "react";
import { authFetch } from "../../lib/authFetch";
import type { Brain } from "../../types";
import GoogleKeepImportPanel from "./GoogleKeepImportPanel";

// ── Export / Import Panel ──────────────────────────────────────
function ExportImportPanel({ activeBrain }: { activeBrain: Brain }) {
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const a = document.createElement("a");
    a.href = `/api/export?brain_id=${activeBrain.id}`;
    a.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.entries || !Array.isArray(data.entries)) {
        setImportStatus("invalid");
        setTimeout(() => setImportStatus(null), 3000);
        return;
      }
      if (data.entries.length > 500) {
        setImportStatus("toobig");
        setTimeout(() => setImportStatus(null), 3000);
        return;
      }
      setImporting(true);
      const res = await authFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brain_id: activeBrain.id,
          entries: data.entries,
          options: { skip_duplicates: true },
        }),
      });
      const result = res.ok ? await res.json() : null;
      setImportStatus(result ? `imported:${result.imported}:${result.skipped}` : "error");
    } catch {
      setImportStatus("error");
    }
    setImporting(false);
    setTimeout(() => setImportStatus(null), 5000);
  };

  const statusMsg = importStatus?.startsWith("imported:")
    ? (() => {
        const [, i, s] = importStatus.split(":");
        return `✓ Imported ${i}, skipped ${s} duplicates`;
      })()
    : importStatus === "invalid"
      ? "✗ Invalid file format"
      : importStatus === "toobig"
        ? "✗ Max 500 entries per import"
        : importStatus === "error"
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
      <p className="text-on-surface text-sm font-semibold">Export / Import</p>
      <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
        Export all entries from <strong className="text-on-surface">{activeBrain.name}</strong> as
        JSON, or import from a previous export.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={handleExport}
          className="rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
          style={{
            color: "var(--color-on-surface-variant)",
            borderColor: "var(--color-outline-variant)",
          }}
        >
          ⬇ Export Brain
        </button>
        <input
          type="file"
          accept=".json"
          ref={fileRef}
          onChange={handleImportFile}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
        >
          {importing ? "Importing…" : "⬆ Import"}
        </button>
      </div>
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

// ── Brain Tab ──────────────────────────────────────────────────
interface Props {
  activeBrain: Brain;
  onRefreshBrains?: () => void;
}

export default function BrainTab({ activeBrain }: Props) {
  return (
    <>
      <ExportImportPanel activeBrain={activeBrain} />
      <GoogleKeepImportPanel brainId={activeBrain.id} />
    </>
  );
}
