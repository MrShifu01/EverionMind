import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { authFetch } from "../../lib/authFetch";
import { entryRepo } from "../../lib/entryRepo";
import { KEYS } from "../../lib/storageKeys";
import TrashView from "../../views/TrashView";
import MemoryImportPanel from "../MemoryImportPanel";
import type { Brain } from "../../types";
import SettingsRow, { SettingsButton, SettingsExpand } from "./SettingsRow";

const GoogleKeepImportPanel = lazy(() => import("./GoogleKeepImportPanel"));

interface Props {
  brainId?: string;
  activeBrain?: Brain;
}

function fmt(n: number) {
  return n.toLocaleString();
}
function fmtBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataTab({ brainId, activeBrain }: Props) {
  const [entryCount, setEntryCount] = useState(0);
  const [entriesThisMonth, setEntriesThisMonth] = useState(0);
  const [showTrash, setShowTrash] = useState(false);
  const [importsOpen, setImportsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(KEYS.ENTRIES_CACHE);
      if (cached) {
        const arr = JSON.parse(cached);
        if (Array.isArray(arr)) {
          setEntryCount(arr.length);
          const month = new Date().toISOString().slice(0, 7);
          setEntriesThisMonth(arr.filter((e: any) => e.created_at?.startsWith(month)).length);
        }
      }
    } catch (e) {
      console.debug("[DataTab] entries cache parse failed", e);
    }
  }, []);

  async function fetchAllEntries() {
    const entries = await entryRepo.list();
    if (!entries.length) throw new Error("No entries to export");
    return entries;
  }

  async function handleExportJSON() {
    setExporting(true);
    setExportError(null);
    try {
      const entries = await fetchAllEntries();
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(
        JSON.stringify(entries, null, 2),
        `everion-export-${date}.json`,
        "application/json",
      );
    } catch (e: any) {
      setExportError(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleExportCSV() {
    setExporting(true);
    setExportError(null);
    try {
      const entries = await fetchAllEntries();
      if (!entries.length) {
        setExportError("No entries to export.");
        return;
      }
      const cols = ["id", "title", "type", "content", "tags", "created_at", "updated_at"];
      const rows = [
        cols.join(","),
        ...entries.map((e: any) =>
          cols
            .map((c) => {
              const val = c === "tags" ? (e[c] || []).join("; ") : (e[c] ?? "");
              return `"${String(val).replace(/"/g, '""')}"`;
            })
            .join(","),
        ),
      ];
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(rows.join("\n"), `everion-export-${date}.csv`, "text/csv");
    } catch (e: any) {
      setExportError(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleExportVCard() {
    setExporting(true);
    setExportError(null);
    try {
      const entries = await fetchAllEntries();
      const contacts = entries.filter((e: any) =>
        ["person", "contact"].includes(e.type?.toLowerCase()),
      );
      if (!contacts.length) {
        setExportError("No person/contact entries to export.");
        return;
      }
      const vcards = contacts.map((e: any) => {
        const meta = e.metadata || {};
        return [
          "BEGIN:VCARD",
          "VERSION:3.0",
          `FN:${e.title}`,
          meta.email ? `EMAIL:${meta.email}` : "",
          meta.phone ? `TEL:${meta.phone}` : "",
          e.content ? `NOTE:${e.content.replace(/\n/g, "\\n")}` : "",
          "END:VCARD",
        ]
          .filter(Boolean)
          .join("\r\n");
      });
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(vcards.join("\r\n"), `everion-contacts-${date}.vcf`, "text/vcard");
    } catch (e: any) {
      setExportError(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  function handleBrainExport() {
    if (!activeBrain) return;
    const a = document.createElement("a");
    a.href = `/api/export?brain_id=${activeBrain.id}`;
    a.click();
  }

  async function handleBrainImport(e: React.ChangeEvent<HTMLInputElement>) {
    if (!activeBrain) return;
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
  }

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

  const supabaseEstimateBytes = entryCount * 5 * 1024;

  return (
    <div>
      <SettingsRow
        label="Entries"
        hint={`${fmt(entryCount)} entries · ${fmtBytes(supabaseEstimateBytes)} on device · ${fmt(entriesThisMonth)} added this month`}
      >
        <SettingsButton onClick={handleBrainExport} disabled={!activeBrain}>
          Export all
        </SettingsButton>
      </SettingsRow>

      <SettingsRow label="Trash" hint="deleted entries clear automatically after 30 days.">
        <SettingsButton onClick={() => setShowTrash((s) => !s)}>
          {showTrash ? "Done" : "View"}
        </SettingsButton>
      </SettingsRow>
      <SettingsExpand open={showTrash}>
        <TrashView brainId={activeBrain?.id} />
      </SettingsExpand>

      <SettingsRow
        label="Imports"
        hint="bring in memories claude or chatgpt already know about you."
      >
        <SettingsButton onClick={() => setImportsOpen((v) => !v)}>
          {importsOpen ? "Done" : "Manage"}
        </SettingsButton>
      </SettingsRow>
      <SettingsExpand open={importsOpen}>
        <MemoryImportPanel brainId={brainId} />
        {brainId && (
          <Suspense
            fallback={<div style={{ fontSize: 12, color: "var(--ink-faint)" }}>Loading…</div>}
          >
            <GoogleKeepImportPanel brainId={brainId} />
          </Suspense>
        )}
      </SettingsExpand>

      <SettingsRow label="Export entries" hint="your data is yours — take it anywhere, any time.">
        <SettingsButton onClick={() => setExportOpen((v) => !v)}>
          {exportOpen ? "Done" : "Export"}
        </SettingsButton>
      </SettingsRow>
      <SettingsExpand open={exportOpen}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <SettingsButton onClick={handleExportJSON} disabled={exporting}>
            {exporting ? "Exporting…" : "JSON"}
          </SettingsButton>
          <SettingsButton onClick={handleExportCSV} disabled={exporting}>
            CSV
          </SettingsButton>
          <SettingsButton onClick={handleExportVCard} disabled={exporting}>
            vCard (contacts)
          </SettingsButton>
        </div>
        {exportError && (
          <p className="f-sans" style={{ fontSize: 12, color: "var(--blood)", margin: 0 }}>
            {exportError}
          </p>
        )}
      </SettingsExpand>

      <SettingsRow
        label="Brain backup"
        hint="export or restore this brain as a JSON file."
        last={!backupOpen}
      >
        <SettingsButton onClick={() => setBackupOpen((v) => !v)}>
          {backupOpen ? "Done" : "Manage"}
        </SettingsButton>
      </SettingsRow>
      <SettingsExpand open={backupOpen} last>
        <div style={{ display: "flex", gap: 8 }}>
          <SettingsButton onClick={handleBrainExport} disabled={!activeBrain}>
            Export brain
          </SettingsButton>
          <input
            type="file"
            accept=".json"
            ref={fileRef}
            onChange={handleBrainImport}
            className="hidden"
          />
          <SettingsButton
            onClick={() => fileRef.current?.click()}
            disabled={importing || !activeBrain}
          >
            {importing ? "Importing…" : "Import JSON"}
          </SettingsButton>
        </div>
        {statusMsg && (
          <p
            className="f-sans"
            style={{ fontSize: 12, color: statusOk ? "var(--moss)" : "var(--blood)", margin: 0 }}
          >
            {statusMsg}
          </p>
        )}
      </SettingsExpand>
    </div>
  );
}
