// ============================================================
// AI memory import (Claude / ChatGPT)
// ============================================================
//
// Two-step paste-based import: copy a prompt into your AI of choice, paste
// the JSON it returns here. Visually mirrors the file-based importers
// below it (BulkImportPanel) so the whole "Imports" section reads as a
// uniform set of cards rather than one bespoke flow + a stack of similar
// ones.

import { useState } from "react";
import { authFetch } from "../lib/authFetch";
import { getEmbedHeaders } from "../lib/aiSettings";
import { parseAISplitResponse } from "../lib/fileSplitter";
import { PROMPTS } from "../config/prompts";
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
    navigator.clipboard.writeText(PROMPTS.AI_MEMORY_EXPORT).then(() => {
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
    const importedEntries: Array<{
      id: string;
      title: string;
      content: string;
      type: string;
      tags: string[];
    }> = [];

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
            p_metadata: { ...(entry.metadata || {}), import_source: "ai_chat" },
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
        } else {
          failed++;
        }
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
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div className="micro" style={{ marginBottom: 4 }}>
          Claude / ChatGPT
        </div>
        <p
          className="f-serif"
          style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic", margin: 0 }}
        >
          Bring in what your AI already remembers about you. Copy the prompt, paste it into
          a Claude or ChatGPT chat, then paste the JSON it returns below.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <SettingsButton onClick={copyPrompt}>
          {copied ? "Copied" : "Copy prompt"}
        </SettingsButton>
        <SettingsButton onClick={handleImport} disabled={!json.trim() || importing}>
          {importing ? "Importing…" : "Import memories"}
        </SettingsButton>
      </div>

      <textarea
        value={json}
        onChange={(e) => {
          setJson(e.target.value);
          setError(null);
          setResult(null);
        }}
        rows={3}
        placeholder="Paste the JSON array the AI returned here…"
        className="f-sans"
        style={{
          width: "100%",
          boxSizing: "border-box",
          fontSize: 12,
          lineHeight: 1.55,
          resize: "vertical",
          padding: "8px 10px",
          color: "var(--ink)",
          background: "var(--surface-low)",
          border: "1px solid var(--line-soft)",
          borderRadius: 8,
          outline: "none",
          fontFamily: "var(--f-mono, var(--f-sans))",
        }}
      />

      {(error || result) && (
        <div
          className="f-sans"
          style={{
            fontSize: 12,
            padding: "8px 12px",
            border: "1px solid var(--line-soft)",
            borderRadius: 8,
            background: "var(--surface-low)",
            color: error
              ? "var(--blood)"
              : result && result.failed > 0
                ? "var(--ember)"
                : "var(--moss)",
          }}
        >
          {error
            ? error
            : result &&
              `${result.imported} ${result.imported === 1 ? "memory" : "memories"} imported${
                result.failed > 0 ? `, ${result.failed} failed` : ""
              }`}
        </div>
      )}
    </div>
  );
}
