import { useState, useRef } from "react";
import { authFetch } from "../../lib/authFetch";
import type { Brain } from "../../types";
import SettingsRow, {
  SettingsButton,
  SettingsToggle,
  SettingsValue,
} from "./SettingsRow";

const CONCEPT_KEY = "everion:brain:concept_extraction";
const EMBEDDINGS_KEY = "everion:brain:embeddings";

interface Props {
  activeBrain: Brain;
  onRefreshBrains?: () => void;
}

function loadPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === "true") return true;
    if (v === "false") return false;
  } catch { /* ignore */ }
  return fallback;
}

function savePref(key: string, value: boolean) {
  try { localStorage.setItem(key, String(value)); } catch { /* ignore */ }
}

export default function BrainTab({ activeBrain }: Props) {
  const [conceptOn, setConceptOn] = useState(() => loadPref(CONCEPT_KEY, true));
  const [embedOn, setEmbedOn] = useState(() => loadPref(EMBEDDINGS_KEY, true));
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [exportImportOpen, setExportImportOpen] = useState(false);

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
        return `imported ${i}, skipped ${s} duplicates`;
      })()
    : importStatus === "invalid"
      ? "invalid file format"
      : importStatus === "toobig"
        ? "max 500 entries per import"
        : importStatus === "error"
          ? "import failed"
          : null;
  const statusOk = importStatus?.startsWith("imported:");

  return (
    <div>
      <SettingsRow label="Name">
        <SettingsValue>{activeBrain.name}</SettingsValue>
      </SettingsRow>

      <SettingsRow
        label="Concept extraction"
        hint="extract concepts from new entries automatically."
      >
        <SettingsToggle
          value={conceptOn}
          onChange={(v) => {
            setConceptOn(v);
            savePref(CONCEPT_KEY, v);
          }}
          ariaLabel="Concept extraction"
        />
      </SettingsRow>

      <SettingsRow label="Embeddings" hint="used for semantic search. stored on device.">
        <SettingsToggle
          value={embedOn}
          onChange={(v) => {
            setEmbedOn(v);
            savePref(EMBEDDINGS_KEY, v);
          }}
          ariaLabel="Embeddings"
        />
      </SettingsRow>

      <SettingsRow
        label="Export / Import"
        hint="take this brain with you, or pull one back in from a backup."
        last={!exportImportOpen}
      >
        <SettingsButton onClick={() => setExportImportOpen((v) => !v)}>
          {exportImportOpen ? "Close" : "Manage"}
        </SettingsButton>
      </SettingsRow>
      {exportImportOpen && (
        <div
          style={{
            padding: "0 0 18px",
            borderBottom: "1px solid var(--line-soft)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <SettingsButton onClick={handleExport}>Export brain</SettingsButton>
            <input
              type="file"
              accept=".json"
              ref={fileRef}
              onChange={handleImportFile}
              className="hidden"
            />
            <SettingsButton onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? "Importing…" : "Import JSON"}
            </SettingsButton>
          </div>
          {statusMsg && (
            <p
              className="f-sans"
              style={{
                fontSize: 12,
                color: statusOk ? "var(--moss)" : "var(--blood)",
                margin: 0,
              }}
            >
              {statusMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
