import { useState } from "react";
import { authFetch } from "../lib/authFetch";
import { getEmbedHeaders } from "../lib/aiSettings";
import { parseAISplitResponse } from "../lib/fileSplitter";
import { AI_MEMORY_PROMPT } from "../lib/aiMemoryPrompt";

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
        if (r.ok) imported++;
        else failed++;
      } catch {
        failed++;
      }
    }

    setImporting(false);
    setResult({ imported, failed });
    setJson("");
    onImported?.(imported);
  }

  return (
    <div className="space-y-3">
      {/* Step 1 — copy the prompt */}
      <div>
        <p className="text-on-surface mb-1 text-xs font-semibold">
          Step 1 — Copy this prompt into Claude or ChatGPT
        </p>
        <div
          className="relative rounded-xl border p-3"
          style={{
            background: "var(--color-surface-container-low)",
            borderColor: "var(--color-outline-variant)",
          }}
        >
          <pre
            className="text-on-surface-variant whitespace-pre-wrap text-xs leading-relaxed"
            style={{ maxHeight: 160, overflowY: "auto" }}
          >
            {AI_MEMORY_PROMPT}
          </pre>
          <button
            onClick={copyPrompt}
            className="absolute top-2 right-2 rounded-lg px-2 py-1 text-xs font-medium transition-colors"
            style={{
              background: copied
                ? "color-mix(in oklch, var(--color-primary) 15%, transparent)"
                : "var(--color-surface-container-highest)",
              color: copied ? "var(--color-primary)" : "var(--color-on-surface-variant)",
            }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Step 2 — paste the JSON result */}
      <div>
        <p className="text-on-surface mb-1 text-xs font-semibold">
          Step 2 — Paste the JSON result here
        </p>
        <textarea
          value={json}
          onChange={(e) => { setJson(e.target.value); setError(null); setResult(null); }}
          rows={5}
          placeholder="Paste the JSON array the AI returned here…"
          className="text-on-surface placeholder:text-on-surface-variant/40 w-full resize-none rounded-xl border p-3 text-xs outline-none"
          style={{
            background: "var(--color-surface-container-low)",
            borderColor: "var(--color-outline-variant)",
          }}
        />
      </div>

      {error && (
        <p className="text-xs" style={{ color: "var(--color-error)" }}>{error}</p>
      )}

      {result && (
        <p className="text-xs" style={{ color: result.failed > 0 ? "var(--color-status-medium)" : "var(--color-primary)" }}>
          {result.imported} {result.imported === 1 ? "memory" : "memories"} imported
          {result.failed > 0 ? `, ${result.failed} failed` : ""}
        </p>
      )}

      <button
        onClick={handleImport}
        disabled={!json.trim() || importing}
        className="press-scale w-full rounded-xl py-2.5 text-xs font-semibold disabled:opacity-40"
        style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
      >
        {importing ? "Importing…" : "Import memories"}
      </button>
    </div>
  );
}
