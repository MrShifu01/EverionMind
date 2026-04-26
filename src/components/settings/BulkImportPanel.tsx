// ============================================================
// Generic bulk-import panel
// ============================================================
//
// Used by every importer (Google Keep, Obsidian, Notion, Bear, Evernote,
// Readwise, …). Each instance receives a parser function that turns the
// uploaded files into ImportEntry[]; this component owns everything else:
// progress, batching, dedup-aware import API, waved enrichment, cancel,
// and resume.
//
// The orchestration was originally inlined in GoogleKeepImportPanel —
// extracting it lets new sources be a ~10-line wrapper around a parser
// instead of a full re-implementation.

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { authFetch } from "../../lib/authFetch";
import { SettingsButton } from "./SettingsRow";
import type { ImportEntry, Parser } from "../../lib/imports/types";

// ── Tunables ───────────────────────────────────────────────────────────────

const BATCH_SIZE = 500; // entries per /api/import call (well under 25 MB body)
const ENRICH_BATCH = 30; // entries per /api/entries?action=enrich-batch poll
const ENRICH_PAUSE_MS = 600; // pause between enrich polls — gives DB room to breathe
const RESUME_TTL_MS = 30 * 60 * 1000; // discard stale resume tokens after 30 min
const RESUME_KEY_PREFIX = "import_resume_";

// ── Types ──────────────────────────────────────────────────────────────────

type Phase = "idle" | "parsing" | "importing" | "enriching" | "done" | "error" | "cancelled";

interface Progress {
  phase: Phase;
  current: number;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  enriched: number;
  pendingEnrichment: number;
  startedAt: number;
  detail?: string;
}

interface ResumeState {
  source: string;
  brainId: string;
  importedCount: number;
  totalCount: number;
  startedAt: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatEta(elapsedMs: number, current: number, total: number): string {
  if (current <= 0 || total <= current) return "";
  const rate = current / elapsedMs;
  const remainingMs = (total - current) / rate;
  const s = Math.round(remainingMs / 1000);
  if (s < 60) return `~${s} s`;
  if (s < 3600) return `~${Math.round(s / 60)} min`;
  return `~${Math.round(s / 3600)} h`;
}

function resumeKey(brainId: string, source: string): string {
  return `${RESUME_KEY_PREFIX}${brainId}_${source}`;
}

function loadResume(brainId: string, source: string): ResumeState | null {
  try {
    const raw = localStorage.getItem(resumeKey(brainId, source));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumeState;
    if (Date.now() - parsed.startedAt > RESUME_TTL_MS) {
      localStorage.removeItem(resumeKey(brainId, source));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveResume(brainId: string, source: string, state: ResumeState): void {
  try {
    localStorage.setItem(resumeKey(brainId, source), JSON.stringify(state));
  } catch {
    /* quota — non-fatal */
  }
}

function clearResume(brainId: string, source: string): void {
  try {
    localStorage.removeItem(resumeKey(brainId, source));
  } catch {
    /* non-fatal */
  }
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  brainId: string;
  source: string;
  label: string;
  description: ReactNode;
  accept: string;
  parser: Parser;
  multiple?: boolean;
}

export default function BulkImportPanel({
  brainId,
  source,
  label,
  description,
  accept,
  parser,
  multiple = true,
}: Props) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [resume, setResume] = useState<ResumeState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!brainId) return;
    setResume(loadResume(brainId, source));
  }, [brainId, source]);

  const updateProgress = useCallback((patch: Partial<Progress>) => {
    setProgress((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const runImport = useCallback(
    async (files: FileList) => {
      const ac = new AbortController();
      abortRef.current = ac;
      const startedAt = Date.now();
      setProgress({
        phase: "parsing",
        current: 0,
        total: 0,
        imported: 0,
        skipped: 0,
        failed: 0,
        enriched: 0,
        pendingEnrichment: 0,
        startedAt,
        detail: "Reading…",
      });

      let entries: ImportEntry[] = [];
      try {
        entries = await parser(
          files,
          (current, total, detail) =>
            updateProgress({ phase: "parsing", current, total, detail }),
          ac.signal,
        );
      } catch (e: any) {
        if (e?.name === "AbortError") {
          setProgress((p) => (p ? { ...p, phase: "cancelled" } : p));
        } else {
          console.error(`[import:${source}:parse]`, e);
          setProgress((p) =>
            p
              ? { ...p, phase: "error", detail: e?.message || "Could not read the archive" }
              : p,
          );
        }
        return;
      }

      if (entries.length === 0) {
        setProgress((p) =>
          p ? { ...p, phase: "error", detail: `No valid ${label} entries found` } : p,
        );
        return;
      }

      // ── Import phase ──
      setProgress((p) =>
        p ? { ...p, phase: "importing", current: 0, total: entries.length, detail: undefined } : p,
      );

      let imported = 0;
      let skipped = 0;
      let failed = 0;

      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        if (ac.signal.aborted) {
          setProgress((p) => (p ? { ...p, phase: "cancelled" } : p));
          saveResume(brainId, source, {
            source,
            brainId,
            importedCount: imported,
            totalCount: entries.length,
            startedAt,
          });
          return;
        }
        const batch = entries.slice(i, i + BATCH_SIZE);
        try {
          const res = await authFetch("/api/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brain_id: brainId, entries: batch }),
            signal: ac.signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          imported += data.imported ?? 0;
          skipped += data.skipped ?? 0;
          failed += data.failed ?? 0;
        } catch (e: any) {
          if (e?.name === "AbortError") {
            setProgress((p) => (p ? { ...p, phase: "cancelled" } : p));
            saveResume(brainId, source, {
              source,
              brainId,
              importedCount: imported,
              totalCount: entries.length,
              startedAt,
            });
            return;
          }
          failed += batch.length;
          console.error(`[import:${source}:batch]`, e);
        }
        updateProgress({
          current: Math.min(i + BATCH_SIZE, entries.length),
          imported,
          skipped,
          failed,
        });
      }

      // ── Enrichment phase (waved) ──
      setProgress((p) =>
        p
          ? {
              ...p,
              phase: "enriching",
              current: 0,
              total: imported,
              pendingEnrichment: imported,
              detail: undefined,
            }
          : p,
      );

      let enriched = 0;
      let stuckIterations = 0;
      while (true) {
        if (ac.signal.aborted) {
          setProgress((p) => (p ? { ...p, phase: "cancelled" } : p));
          return;
        }
        let processed = 0;
        let remaining = 0;
        try {
          const res = await authFetch("/api/entries?action=enrich-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brain_id: brainId, batch_size: ENRICH_BATCH }),
            signal: ac.signal,
          });
          if (!res.ok) break;
          const data = await res.json();
          processed = data.processed ?? 0;
          remaining = data.remaining ?? 0;
        } catch (e: any) {
          if (e?.name === "AbortError") {
            setProgress((p) => (p ? { ...p, phase: "cancelled" } : p));
            return;
          }
          console.warn(`[import:${source}:enrich]`, e);
          break;
        }
        enriched += processed;
        updateProgress({
          enriched,
          pendingEnrichment: remaining,
          current: enriched,
          total: enriched + remaining,
        });
        if (remaining === 0) break;
        if (processed === 0) {
          stuckIterations++;
          if (stuckIterations >= 3) break;
        } else {
          stuckIterations = 0;
        }
        await new Promise((r) => setTimeout(r, ENRICH_PAUSE_MS));
      }

      setProgress((p) => (p ? { ...p, phase: "done" } : p));
      clearResume(brainId, source);
      setResume(null);
    },
    [brainId, source, label, parser, updateProgress],
  );

  const handleFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      e.target.value = "";
      void runImport(files);
    },
    [runImport],
  );

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleClearResume = useCallback(() => {
    clearResume(brainId, source);
    setResume(null);
  }, [brainId, source]);

  const inFlight =
    progress?.phase === "parsing" ||
    progress?.phase === "importing" ||
    progress?.phase === "enriching";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div className="micro" style={{ marginBottom: 4 }}>
          {label}
        </div>
        <p
          className="f-serif"
          style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic", margin: 0 }}
        >
          {description}
        </p>
      </div>

      <input
        type="file"
        accept={accept}
        multiple={multiple}
        ref={fileRef}
        onChange={handleFiles}
        className="hidden"
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <SettingsButton onClick={() => fileRef.current?.click()} disabled={inFlight}>
          {inFlight ? "Working…" : `Import ${label} notes`}
        </SettingsButton>
        {inFlight && <SettingsButton onClick={handleCancel}>Cancel</SettingsButton>}
      </div>

      {progress && <ProgressBlock progress={progress} sourceLabel={label} />}

      {resume && !inFlight && (
        <div
          className="f-sans"
          style={{
            fontSize: 12,
            color: "var(--ink-faint)",
            border: "1px solid var(--line-soft)",
            borderRadius: 8,
            padding: "8px 12px",
            background: "var(--surface-low)",
          }}
        >
          A previous {label} import was interrupted at {resume.importedCount} / {resume.totalCount}.
          Re-uploading the same archive resumes safely (duplicates dropped automatically).{" "}
          <button
            onClick={handleClearResume}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--ink-soft)",
              textDecoration: "underline",
              cursor: "pointer",
              padding: 0,
              fontFamily: "inherit",
              fontSize: "inherit",
            }}
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// ── Progress block ─────────────────────────────────────────────────────────

function ProgressBlock({ progress, sourceLabel }: { progress: Progress; sourceLabel: string }) {
  const { phase, current, total, imported, skipped, failed, enriched, pendingEnrichment } =
    progress;
  // Tick once per second so elapsed/ETA refresh while the parent prop is stable.
  // Reading Date.now() during render breaks purity; a tick state fixes that.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (phase === "done" || phase === "error" || phase === "cancelled") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);
  const elapsed = now - progress.startedAt;
  const eta =
    phase === "parsing" || phase === "importing" || phase === "enriching"
      ? formatEta(elapsed, current, total)
      : "";
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  const headline =
    phase === "parsing"
      ? `Parsing ${current.toLocaleString()} / ${total.toLocaleString()}`
      : phase === "importing"
        ? `Importing ${current.toLocaleString()} / ${total.toLocaleString()}`
        : phase === "enriching"
          ? `Enriching ${enriched.toLocaleString()} / ${(enriched + pendingEnrichment).toLocaleString()}`
          : phase === "done"
            ? `${imported.toLocaleString()} ${sourceLabel} entries imported, ${enriched.toLocaleString()} enriched${
                skipped ? `, ${skipped.toLocaleString()} duplicates skipped` : ""
              }${failed ? `, ${failed.toLocaleString()} failed` : ""}`
            : phase === "cancelled"
              ? `Cancelled — ${imported.toLocaleString()} imported so far`
              : phase === "error"
                ? progress.detail || "Import failed"
                : "";

  const statusColor =
    phase === "done"
      ? "var(--moss)"
      : phase === "error"
        ? "var(--blood)"
        : phase === "cancelled"
          ? "var(--ink-faint)"
          : "var(--ink-soft)";

  return (
    <div
      className="f-sans"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 12px",
        border: "1px solid var(--line-soft)",
        borderRadius: 8,
        background: "var(--surface-low)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
        <span style={{ color: statusColor }}>{headline}</span>
        {eta && <span style={{ color: "var(--ink-faint)" }}>{eta}</span>}
      </div>
      {(phase === "parsing" || phase === "importing" || phase === "enriching") && (
        <div
          style={{ height: 4, background: "var(--surface-high)", borderRadius: 2, overflow: "hidden" }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "var(--ember)",
              transition: "width 200ms ease",
            }}
          />
        </div>
      )}
      {progress.detail && phase !== "error" && (
        <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{progress.detail}</span>
      )}
    </div>
  );
}
