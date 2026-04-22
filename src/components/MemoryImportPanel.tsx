import { useState } from "react";
import { authFetch } from "../lib/authFetch";
import { getEmbedHeaders } from "../lib/aiSettings";
import { parseAISplitResponse } from "../lib/fileSplitter";
import { AI_MEMORY_PROMPT } from "../lib/aiMemoryPrompt";
import { SettingsButton } from "./settings/SettingsRow";

interface Props {
  brainId?: string;
  onImported?: (count: number) => void;
}

export default function MemoryImportPanel({ brainId, onImported }: Props) {
  const [copied, setCopied] = useState(false);
  const [json, setJson] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function copyPrompt() {
    navigator.clipboard.writeText(AI_MEMORY_PROMPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleImport() {
    setError(null);
    setResult(null);

    const entries = parseAISplitResponse(json);
    if (entries.length === 0) {
      setError("No valid entries found. Make sure you pasted the full JSON array from the AI.");
      return;
    }

    setImporting(true);
    let imported = 0;
    let failed = 0;
    const importedEntries: Array<{ id: string; title: string; content: string; type: string; tags: string[] }> = [];

    const { extractEntryConnections, generateEntryInsight, findAndSaveConnections } =
      await import("../lib/brainConnections");

    for (const entry of entries) {
      try {
        const r = await authFetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(getEmbedHeaders() || {}) },
          body: JSON.stringify({
            p_title: entry.title.slice(0, 500),
            p_content: entry.content || "",
            p_type: entry.type || "note",
            p_metadata: entry.metadata || {},
            p_tags: entry.tags || [],
            ...(brainId ? { p_brain_id: brainId } : {}),
          }),
        });
        if (r.ok) {
          const data = await r.json();
          imported++;
          if (data?.id && brainId) {
            const entryObj = {
              id: data.id,
              title: entry.title.slice(0, 500),
              content: entry.content || "",
              type: entry.type || "note",
              tags: entry.tags || [],
            };
            extractEntryConnections(entryObj, brainId).catch(() => {});
            generateEntryInsight(entryObj, brainId).catch(() => {});
            findAndSaveConnections(entryObj, [...importedEntries], brainId).catch(() => {});
            importedEntries.push(entryObj);
          }
        } else { failed++; }
      } catch { failed++; }
    }

    setImporting(false);
    setResult({ imported, failed });
    setJson("");
    onImported?.(imported);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div className="micro" style={{ marginBottom: 8 }}>Step 1 — copy this prompt into Claude or ChatGPT</div>
        <SettingsButton onClick={copyPrompt}>
          {copied ? "✓ Copied!" : "Copy prompt"}
        </SettingsButton>
      </div>

      <div>
        <div className="micro" style={{ marginBottom: 8 }}>Step 2 — paste the JSON result here</div>
        <textarea
          value={json}
          onChange={(e) => { setJson(e.target.value); setError(null); setResult(null); }}
          rows={5}
          placeholder="Paste the JSON array the AI returned here…"
          className="f-serif"
          style={{
            width: "100%",
            boxSizing: "border-box",
            fontSize: 13,
            lineHeight: 1.55,
            resize: "vertical",
            padding: "10px 12px",
            color: "var(--ink)",
            background: "var(--surface-low)",
            border: "1px solid var(--line-soft)",
            borderRadius: 10,
            outline: "none",
            fontStyle: json ? "normal" : "italic",
          }}
        />
      </div>

      {error && (
        <p className="f-sans" style={{ fontSize: 12, color: "var(--blood)", margin: 0 }}>{error}</p>
      )}
      {result && (
        <p className="f-sans" style={{ fontSize: 12, color: result.failed > 0 ? "var(--ember)" : "var(--moss)", margin: 0 }}>
          {result.imported} {result.imported === 1 ? "memory" : "memories"} imported
          {result.failed > 0 ? `, ${result.failed} failed` : ""}
        </p>
      )}

      <button
        onClick={handleImport}
        disabled={!json.trim() || importing}
        className="design-btn-primary press"
        style={{ width: "100%", opacity: (!json.trim() || importing) ? 0.4 : 1 }}
      >
        {importing ? "Importing…" : "Import memories"}
      </button>
    </div>
  );
}
