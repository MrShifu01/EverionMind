// ─────────────────────────────────────────────────────────────────────────────
// backgroundTaskRegistry
//
// Pure functions, indexed by `kind`, that the BackgroundOps context invokes
// when a task starts or resumes after app reload. They MUST be closure-free
// (no React state, no component refs) because they run from a fresh module
// graph on rehydration — only the persisted resumeKey is available.
//
// Each runner returns the success message (or throws on failure). Helpers
// give them a way to report incremental progress to the toast.
// ─────────────────────────────────────────────────────────────────────────────

import { authFetch } from "./authFetch";

export interface TaskHelpers {
  setProgress: (p: { current: number; total?: number; suffix?: string }) => void;
  setLabel: (label: string) => void;
}

interface TaskAction {
  label: string;
  event: string;
  detail?: Record<string, unknown>;
}

interface TaskOutput {
  result: string;
  action?: TaskAction;
}

type TaskRunner = (resumeKey: string, helpers: TaskHelpers) => Promise<string | TaskOutput>;

// authFetch with one retry on network error — covers Safari's "Load failed"
// when a resumed task fires before the network/auth is fully warm. Server
// state is idempotent (every endpoint is safe to call again) so a retry
// can't double-process anything. We deliberately only retry on TypeError
// (network failure); HTTP non-OK responses go through as-is so the caller
// can decide how to surface them.
async function retryFetch(
  url: string,
  init: RequestInit,
  retries = 1,
  delayMs = 2000,
): Promise<Response> {
  try {
    return await authFetch(url, init);
  } catch (err) {
    if (retries > 0) {
      await new Promise((res) => setTimeout(res, delayMs));
      return retryFetch(url, init, retries - 1, delayMs * 2);
    }
    // Re-throw with a clearer message so the toast doesn't say cryptic "Load failed".
    const original = err instanceof Error ? err.message : "network error";
    throw new Error(`Network blip (${original}). Try again — already-saved progress is kept.`, {
      cause: err,
    });
  }
}

// ── Persona ─────────────────────────────────────────────────────────────────

const personaScan: TaskRunner = async (brainId, h) => {
  if (!brainId) throw new Error("brain_id required");
  let totalScanned = 0;
  let totalExtracted = 0;
  // Hard ceiling on polling rounds so a runaway can't loop forever.
  let safety = 80;
  while (safety-- > 0) {
    const r = await retryFetch("/api/entries?action=backfill-persona", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brain_id: brainId, batch_size: 50 }),
    });
    if (!r?.ok) throw new Error(`HTTP ${r?.status ?? "?"}`);
    const data = (await r.json()) as { scanned: number; extracted: number; remaining: number };
    totalScanned += data.scanned;
    totalExtracted += data.extracted;
    h.setProgress({
      current: totalScanned,
      suffix: `extracted ${totalExtracted}`,
    });
    if (data.scanned === 0 || data.remaining === 0) break;
  }
  if (totalScanned === 0) return "Already scanned — nothing new.";
  if (totalExtracted === 0) {
    return `Scanned ${totalScanned} ${totalScanned === 1 ? "entry" : "entries"} · no new persona facts.`;
  }
  return `Scanned ${totalScanned} ${totalScanned === 1 ? "entry" : "entries"} · extracted ${totalExtracted} ${totalExtracted === 1 ? "fact" : "facts"}.`;
};

const personaWipe: TaskRunner = async (brainId) => {
  if (!brainId) throw new Error("brain_id required");
  const r = await retryFetch("/api/entries?action=wipe-persona-extracted", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brain_id: brainId }),
  });
  if (!r?.ok) throw new Error(`HTTP ${r?.status ?? "?"}`);
  const data = (await r.json()) as { deleted: number; cleared: number };
  if (data.deleted === 0) return "Nothing to wipe — no auto-extracted facts.";
  return `Deleted ${data.deleted} ${data.deleted === 1 ? "fact" : "facts"} · ready to re-scan ${data.cleared} ${data.cleared === 1 ? "entry" : "entries"}.`;
};

const personaReset: TaskRunner = async (brainId) => {
  if (!brainId) throw new Error("brain_id required");
  const r = await retryFetch("/api/entries?action=revert-persona-backfill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brain_id: brainId }),
  });
  if (!r?.ok) throw new Error(`HTTP ${r?.status ?? "?"}`);
  const data = (await r.json()) as { scanned: number; reverted: number };
  if (data.reverted === 0) return "Nothing to revert — already clean.";
  return `Reverted ${data.reverted} ${data.reverted === 1 ? "entry" : "entries"} back to original type.`;
};

const personaAudit: TaskRunner = async (brainId) => {
  if (!brainId) throw new Error("brain_id required");
  const r = await retryFetch("/api/entries?action=audit-persona", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brain_id: brainId }),
  });
  if (!r?.ok) throw new Error(`HTTP ${r?.status ?? "?"}`);
  const data = (await r.json()) as {
    scanned: number;
    rejected_duplicates: number;
    rejected_pattern: number;
    rejected_core: number;
    kept: number;
  };
  if (data.scanned === 0) return "Nothing to audit yet.";
  const removed = data.rejected_duplicates + data.rejected_pattern + data.rejected_core;
  if (removed === 0)
    return `Audited ${data.scanned} ${data.scanned === 1 ? "fact" : "facts"} · all clean.`;
  const parts: string[] = [];
  if (data.rejected_duplicates) parts.push(`${data.rejected_duplicates} dupes`);
  if (data.rejected_pattern) parts.push(`${data.rejected_pattern} match a not-me pattern`);
  if (data.rejected_core) parts.push(`${data.rejected_core} covered by About You`);
  return `Removed ${removed}: ${parts.join(", ")} · ${data.kept} kept.`;
};

// ── Enrichment ──────────────────────────────────────────────────────────────

const enrichRunNow: TaskRunner = async (brainId, h) => {
  if (!brainId) throw new Error("brain_id required");
  // Loop until remaining=0 or a bounded ceiling. The endpoint now drains
  // up to batch_size entries per round-trip AND loops internally for up
  // to ~270s, so each request does meaningful bulk work — the client
  // loop is a thin progress wrapper that keeps the toast counter alive
  // and re-fires if the server's wall-clock budget timed out mid-drain.
  let totalProcessed = 0;
  let safety = 20;
  while (safety-- > 0) {
    const r = await retryFetch("/api/entries?action=enrich-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brain_id: brainId, batch_size: 100 }),
    });
    if (!r?.ok) throw new Error(`HTTP ${r?.status ?? "?"}`);
    const data = (await r.json()) as { processed: number; remaining: number };
    totalProcessed += data.processed;
    h.setProgress({ current: totalProcessed, suffix: `${data.remaining} remaining` });
    if (data.processed === 0 || data.remaining === 0) break;
  }
  if (totalProcessed === 0) return "Already up to date.";
  return `Processed ${totalProcessed} ${totalProcessed === 1 ? "entry" : "entries"}.`;
};

const enrichClearBackfill: TaskRunner = async (brainId) => {
  if (!brainId) throw new Error("brain_id required");
  const r = await retryFetch("/api/entries?action=enrich-clear-backfill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brain_id: brainId }),
  });
  if (!r?.ok) throw new Error(`HTTP ${r?.status ?? "?"}`);
  const data = (await r.json()) as { cleared: number; scanned: number };
  return `Cleared ${data.cleared} of ${data.scanned} backfilled entries.`;
};

const enrichRetryFailed: TaskRunner = async (brainId) => {
  if (!brainId) throw new Error("brain_id required");
  const r = await retryFetch("/api/entries?action=enrich-retry-failed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brain_id: brainId }),
  });
  if (!r?.ok) throw new Error(`HTTP ${r?.status ?? "?"}`);
  const data = (await r.json()) as { reset: number; processed: number; remaining: number };
  if (data.reset === 0) return "No failed embeddings to retry.";
  return `Retried ${data.reset} · processed ${data.processed} · ${data.remaining} remaining.`;
};

// ── Gmail ───────────────────────────────────────────────────────────────────

const gmailScan: TaskRunner = async (brainId) => {
  // brainId may be empty string — Gmail allows null brain.
  const r = await retryFetch("/api/gmail?action=scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brain_id: brainId || null }),
  });
  let data:
    | { debug?: { tokenRefreshFailed?: boolean }; error?: string; created?: number }
    | undefined;
  try {
    data = await r?.json();
  } catch {
    /* non-JSON */
  }
  if (data?.debug?.tokenRefreshFailed) {
    throw new Error("Gmail token expired — disconnect and reconnect.");
  }
  if (!r?.ok) throw new Error(data?.error ?? "Scan failed");
  const created: number = data?.created ?? 0;
  if (created === 0) return "No new items found.";
  // Notify any badge listeners that staged count just changed.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("everion:staged-changed"));
  }
  return {
    result: `${created} new ${created === 1 ? "item" : "items"} flagged for review.`,
    action: { label: "Review", event: "everion:open-gmail-inbox" },
  };
};

// ── Registry ────────────────────────────────────────────────────────────────

export const TASK_RUNNERS: Record<string, TaskRunner> = {
  "persona-scan": personaScan,
  "persona-wipe": personaWipe,
  "persona-reset": personaReset,
  "persona-audit": personaAudit,
  "enrich-run-now": enrichRunNow,
  "enrich-clear-backfill": enrichClearBackfill,
  "enrich-retry-failed": enrichRetryFailed,
  "gmail-scan": gmailScan,
};
