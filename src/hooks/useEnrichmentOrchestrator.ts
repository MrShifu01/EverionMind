import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { RefObject } from "react";
import {
  isFullyEnriched,
  getEnrichmentGaps,
  enrichEntry,
  type EnrichError,
} from "../lib/enrichEntry";
import { loadGraphFromDB } from "../lib/conceptGraph";
import { authFetch } from "../lib/authFetch";
import type { Entry } from "../types";

interface UseEnrichmentOrchestratorParams {
  activeBrainId: string | undefined;
  entriesLoaded: boolean;
  entriesRef: RefObject<Entry[]>;
  onSilentUpdate: (id: string, changes: any) => void | Promise<void>;
}

export function useEnrichmentOrchestrator({
  activeBrainId,
  entriesLoaded,
  entriesRef,
  onSilentUpdate,
}: UseEnrichmentOrchestratorParams) {
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [enrichErrors, setEnrichErrors] = useState<
    { id: string; title: string; errors: EnrichError[] }[]
  >([]);
  const [enrichCurrentEntry, setEnrichCurrentEntry] = useState<{
    idx: number;
    total: number;
    title: string;
    phase: string;
  } | null>(null);
  const [enrichLog, setEnrichLog] = useState<
    { ts: number; level: "info" | "error"; message: string }[]
  >([]);
  const [conceptEntryIds, setConceptEntryIds] = useState<Set<string>>(new Set());

  const updateAdapter = useCallback(
    (id: string, changes: any): Promise<void> =>
      Promise.resolve(onSilentUpdate(id, changes)).then(() => {}),
    [onSilentUpdate],
  );

  const appendLog = useCallback((level: "info" | "error", message: string) => {
    setEnrichLog((prev) => [{ ts: Date.now(), level, message }, ...prev]);
  }, []);

  const refreshConceptIds = useCallback(async () => {
    if (!activeBrainId) return;
    try {
      const graph = await loadGraphFromDB(activeBrainId);
      const ids = new Set<string>(graph.concepts.flatMap((c) => c.source_entries ?? []));
      setConceptEntryIds(ids);
    } catch (e) {
      console.debug("[useEnrichmentOrchestrator] refreshConceptIds failed", e);
    }
  }, [activeBrainId]);

  useEffect(() => {
    refreshConceptIds();
  }, [refreshConceptIds]);

  const enrichingRef = useRef(enriching);
  useEffect(() => {
    enrichingRef.current = enriching;
  }, [enriching]);

  useEffect(() => {
    if (!entriesLoaded || !activeBrainId) return;

    let cancelled = false;
    const brainId = activeBrainId;
    let timer: ReturnType<typeof setTimeout>;

    const runPass = async () => {
      // Server pass: parse + insight
      try {
        await authFetch("/api/entries?action=enrich-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brain_id: brainId }),
        });
      } catch {}

      if (cancelled || enrichingRef.current) return;

      // Client pass: embed + concepts
      const current = entriesRef.current;
      const unenriched = current.filter((e) => !isFullyEnriched(e, current, conceptEntryIds));
      for (const entry of unenriched) {
        if (cancelled || enrichingRef.current) break;
        await enrichEntry(entry, brainId, updateAdapter);
        // Promote staged entry once fully enriched
        if (entry.status === "staged" && isFullyEnriched(entry, current, conceptEntryIds)) {
          authFetch("/api/entries", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: entry.id, status: "active" }),
          }).then(() => updateAdapter(entry.id, { status: "active" })).catch(() => {});
        }
      }
    };

    const schedule = async () => {
      await runPass();
      if (!cancelled) timer = setTimeout(schedule, 90_000);
    };

    timer = setTimeout(schedule, 15_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [entriesLoaded, activeBrainId]); // eslint-disable-line react-hooks/exhaustive-deps

  const entries = entriesRef.current;

  const unenrichedDetails = useMemo(
    () =>
      entries
        .filter((e) => !isFullyEnriched(e, entries, conceptEntryIds))
        .map((e) => ({
          id: e.id,
          title: e.title || "(untitled)",
          gaps: getEnrichmentGaps(e, entries, conceptEntryIds),
        })),
    [entries, conceptEntryIds],
  );
  const unenrichedCount = unenrichedDetails.length;

  const runBulkEnrich = useCallback(async () => {
    if (!activeBrainId || enriching) return;
    const currentEntries = entriesRef.current;
    const unenriched = currentEntries.filter(
      (e) => !isFullyEnriched(e, currentEntries, conceptEntryIds),
    );
    if (unenriched.length === 0) return;
    setEnriching(true);
    setEnrichErrors([]);
    setEnrichLog([]);
    setEnrichProgress({ done: 0, total: unenriched.length });
    try {
      for (let i = 0; i < unenriched.length; i++) {
        const entry = unenriched[i];
        const title = entry.title || "(untitled)";
        setEnrichCurrentEntry({ idx: i + 1, total: unenriched.length, title, phase: "starting" });
        appendLog("info", `[${i + 1}/${unenriched.length}] ${title}`);
        let errs: EnrichError[] = [];
        try {
          errs = await enrichEntry(entry, activeBrainId, updateAdapter, (phase) => {
            setEnrichCurrentEntry({ idx: i + 1, total: unenriched.length, title, phase });
          });
        } catch (err) {
          errs = [{ step: "unknown", message: String((err as any)?.message ?? err) }];
        }
        if (errs.length > 0) {
          setEnrichErrors((prev) => [...prev, { id: entry.id, title, errors: errs }]);
          for (const e of errs) appendLog("error", `  ${e.step}: ${e.message}`);
        }
        setEnrichProgress({ done: i + 1, total: unenriched.length });
        if ((i + 1) % 3 === 0) await refreshConceptIds();
        if (i < unenriched.length - 1) await new Promise((r) => setTimeout(r, 5000));
      }
      appendLog("info", `Complete — ${unenriched.length} processed`);
    } finally {
      await refreshConceptIds();
      setEnriching(false);
      setEnrichProgress(null);
      setEnrichCurrentEntry(null);
    }
  }, [
    activeBrainId,
    enriching,
    updateAdapter,
    conceptEntryIds,
    refreshConceptIds,
    appendLog,
    entriesRef,
  ]);

  return {
    enriching,
    enrichProgress,
    enrichErrors,
    enrichCurrentEntry,
    enrichLog,
    runBulkEnrich,
    unenrichedCount,
    unenrichedDetails,
    conceptEntryIds,
    refreshConceptIds,
  };
}
