import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Dispatch, SetStateAction, RefObject } from "react";
import { authFetch } from "../lib/authFetch";
import { readEntriesCache, writeEntriesCache } from "../lib/entriesCache";
import { decryptEntry, cacheVaultKey } from "../lib/crypto";
import { indexEntry } from "../lib/searchIndex";
import { LINKS } from "../data/constants";
import { isFullyEnriched, getEnrichmentGaps, enrichEntry, type EnrichError } from "../lib/enrichEntry";
import { loadGraphFromDB } from "../lib/conceptGraph";
import { useEntryActions } from "./useEntryActions";
import type { Entry } from "../types";

interface UseDataLayerParams {
  activeBrainId?: string;
  setSelected: Dispatch<SetStateAction<Entry | null>>;
  isOnline: boolean;
  isOnlineRef: RefObject<boolean>;
  refreshCount: () => void;
}

export function useDataLayer({
  activeBrainId,
  setSelected,
  isOnline,
  isOnlineRef,
  refreshCount,
}: UseDataLayerParams) {
  const [entries, setEntries] = useState<Entry[]>(() => {
    try {
      const cached = localStorage.getItem("openbrain_entries");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.every((e) => e && typeof e.id === "string"))
          return parsed;
      }
    } catch (err) {
      console.error("[OpenBrain]", err);
    }
    return [];
  });
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const [links, setLinks] = useState<any[]>(LINKS);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [vaultExists, setVaultExists] = useState(false);
  const [vaultEntries, setVaultEntries] = useState<Entry[]>([]);
  const vaultEntryIdsRef = useRef<Set<string>>(new Set());
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{ done: number; total: number } | null>(null);
  const [enrichErrors, setEnrichErrors] = useState<{ id: string; title: string; errors: EnrichError[] }[]>([]);
  const [conceptEntryIds, setConceptEntryIds] = useState<Set<string>>(new Set());

  // Load concept graph entry IDs so unenriched detection matches the health panel
  const refreshConceptIds = useCallback(async () => {
    if (!activeBrainId) return;
    try {
      const graph = await loadGraphFromDB(activeBrainId);
      const ids = new Set<string>(graph.concepts.flatMap((c) => c.source_entries ?? []));
      setConceptEntryIds(ids);
    } catch {}
  }, [activeBrainId]);

  useEffect(() => {
    refreshConceptIds();
  }, [refreshConceptIds]);

  // Load entries cache on mount
  useEffect(() => {
    readEntriesCache()
      .then((cached) => {
        if (cached && cached.length > 0)
          setEntries((prev) => (prev.length === 0 ? cached : prev));
      })
      .catch((err) => console.error("[OpenBrain] readEntriesCache failed", err));
  }, []);

  // Vault existence check
  useEffect(() => {
    authFetch("/api/vault")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.exists) setVaultExists(true);
      })
      .catch((err) => console.error("[OpenBrain] /api/vault check failed", err));
  }, []);

  // Fetch vault entries for the memory feed (titles are plaintext; content stays encrypted)
  const fetchVaultEntries = useCallback(async () => {
    try {
      const r = await authFetch("/api/vault-entries");
      if (!r.ok) return;
      const data: any[] = await r.json();
      const fetched: Entry[] = data.map((e) => ({ ...e, type: "secret" as const, encrypted: true }));
      vaultEntryIdsRef.current = new Set(fetched.map((e) => e.id));
      setVaultEntries(fetched);
    } catch {}
  }, []);

  useEffect(() => {
    fetchVaultEntries();
  }, [fetchVaultEntries]);

  const refreshEntries = useCallback(async () => {
    if (!activeBrainId) return;
    setEntriesLoaded(false);
    try {
      // Phase 1: first 20 entries for fast first-paint
      const r1 = await authFetch(`/api/entries?brain_id=${encodeURIComponent(activeBrainId)}&limit=20`);
      const data1 = r1.ok ? await r1.json() : null;
      const initial: Entry[] = Array.isArray(data1) ? data1 : (data1?.entries ?? []);
      if (initial.length > 0) {
        setEntries(initial);
        initial.filter((e) => e.type !== "secret").forEach(indexEntry);
      }
    } finally {
      setEntriesLoaded(true); // unblock UI regardless of phase 1 outcome
    }

    // Phase 2: full load in background — no skeleton, UI already visible
    authFetch(`/api/entries?brain_id=${encodeURIComponent(activeBrainId)}&limit=1000`)
      .then(async (r2) => {
        if (!r2.ok) return;
        const data2 = await r2.json();
        const all: Entry[] = Array.isArray(data2) ? data2 : (data2?.entries ?? []);
        if (all.length > 0) {
          setEntries(all);
          writeEntriesCache(all);
          all.filter((e) => e.type !== "secret").forEach(indexEntry);
        }
      })
      .catch(() => {});
  }, [activeBrainId]);

  // Fetch entries + prefetch links when brain changes.
  // prevBrainIdRef guards against clearing entries on initial mount
  // (which would flash-blank the cached list before the API returns).
  const prevBrainIdRef = useRef(activeBrainId);
  useEffect(() => {
    if (!activeBrainId) return;
    if (prevBrainIdRef.current !== activeBrainId) {
      setEntries([]);
      setLinks([]);
      prevBrainIdRef.current = activeBrainId;
    }
    refreshEntries();
    authFetch(`/api/search?brain_id=${encodeURIComponent(activeBrainId)}&threshold=0.55`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const arr = Array.isArray(data) ? data : data.links || [];
        if (arr.length > 0) setLinks(arr);
      })
      .catch((err) => console.error("[OpenBrain] /api/search prefetch failed", err));
  }, [activeBrainId, refreshEntries]);

  // Write-back cache after entries settle
  useEffect(() => {
    if (!entriesLoaded) return;
    const t = setTimeout(() => writeEntriesCache(entries), 3000);
    return () => clearTimeout(t);
  }, [entries, entriesLoaded]);

  const handleVaultUnlock = useCallback((key: CryptoKey | null) => {
    setCryptoKey(key);
    if (key) {
      cacheVaultKey(key).catch(() => {});
      // Only decrypt legacy secrets in entries table; vault_entries stay PIN-gated
      const vaultIds = vaultEntryIdsRef.current;
      setEntries((prev) => {
        Promise.all(
          prev.map((e) =>
            e.type === "secret" && !vaultIds.has(e.id) ? decryptEntry(e as any, key!) : e,
          ),
        ).then((decrypted) => setEntries(decrypted as Entry[]));
        return prev;
      });
    }
  }, []);

  const {
    lastAction,
    setLastAction,
    saveError,
    setSaveError,
    commitPendingDelete,
    handleDelete,
    handleUpdate,
    handleUndo,
    handleCreated: _handleCreated,
  } = useEntryActions({
    entries,
    setEntries,
    setSelected,
    isOnline,
    isOnlineRef,
    refreshCount,
    cryptoKey,
  });

  // Flush pending delete on page hide / unload
  useEffect(() => {
    const flush = () => commitPendingDelete();
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [commitPendingDelete]);

  const silentUpdate = useCallback(
    (id: string, changes: any) => handleUpdate(id, changes, { silent: true }),
    [handleUpdate],
  );

  /** Stable callback for useOfflineSync onEntryIdUpdate. */
  const patchEntryId = useCallback(
    (tempId: string, realId: string) => {
      setEntries((prev) => prev.map((e) => (e.id === tempId ? { ...e, id: realId } : e)));
    },
    [],
  );

  const addLinks = useCallback(
    (newLinks: any[]) => setLinks((prev) => [...prev, ...newLinks]),
    [],
  );

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

  // Silent background enrich — fires once per brain after entries load.
  // 8s initial delay lets the page settle; 5s between entries respects the LLM rate limit.
  // Cancelled immediately if the user triggers manual bulk enrich (enriching flag).
  const autoEnrichBrainRef = useRef<string | null>(null);
  const enrichingRef = useRef(enriching);
  useEffect(() => { enrichingRef.current = enriching; }, [enriching]);

  useEffect(() => {
    if (!entriesLoaded || !activeBrainId) return;
    if (autoEnrichBrainRef.current === activeBrainId) return;

    const unenriched = entries.filter((e) => !isFullyEnriched(e, entries, conceptEntryIds));
    if (unenriched.length === 0) return;

    autoEnrichBrainRef.current = activeBrainId;
    const snapshot = [...unenriched];
    const brainId = activeBrainId;
    let cancelled = false;

    (async () => {
      await new Promise((r) => setTimeout(r, 15000));
      for (let i = 0; i < snapshot.length; i++) {
        if (cancelled || enrichingRef.current) break;
        await enrichEntry(snapshot[i], brainId, silentUpdate);
        if (i < snapshot.length - 1) await new Promise((r) => setTimeout(r, 15000));
      }
    })();

    return () => { cancelled = true; };
  }, [entriesLoaded, activeBrainId]); // eslint-disable-line react-hooks/exhaustive-deps

  const runBulkEnrich = useCallback(async () => {
    if (!activeBrainId || enriching) return;
    const unenriched = entries.filter((e) => !isFullyEnriched(e, entries, conceptEntryIds));
    if (unenriched.length === 0) return;
    setEnriching(true);
    setEnrichErrors([]);
    setEnrichProgress({ done: 0, total: unenriched.length });
    for (let i = 0; i < unenriched.length; i++) {
      const errs = await enrichEntry(unenriched[i], activeBrainId, silentUpdate);
      if (errs.length > 0) {
        setEnrichErrors((prev) => [...prev, { id: unenriched[i].id, title: unenriched[i].title || "(untitled)", errors: errs }]);
      }
      setEnrichProgress({ done: i + 1, total: unenriched.length });
      if ((i + 1) % 3 === 0) await refreshConceptIds();
      if (i < unenriched.length - 1) await new Promise((r) => setTimeout(r, 5000));
    }
    await refreshConceptIds();
    setEnriching(false);
    setEnrichProgress(null);
  }, [activeBrainId, entries, enriching, silentUpdate, conceptEntryIds, refreshConceptIds]);

  const handleCreated = useCallback(
    (newEntry: Entry) => {
      _handleCreated(newEntry);
      if (activeBrainId) {
        import("../lib/brainConnections").then(
          ({ extractEntryConnections, generateEntryInsight, findAndSaveConnections }) => {
            extractEntryConnections(newEntry, activeBrainId!).catch(() => {});
            generateEntryInsight(newEntry, activeBrainId!)
              .then((insightText) =>
                silentUpdate(newEntry.id, {
                  metadata: { ...(newEntry.metadata ?? {}), ai_insight: insightText },
                }),
              )
              .catch(() => {});
            findAndSaveConnections(newEntry, entries, activeBrainId!).catch(() => {});
          },
        );
      }
    },
    [_handleCreated, activeBrainId, entries, silentUpdate],
  );

  const handleCreatedBulk = useCallback(
    (newEntry: Entry) => {
      _handleCreated(newEntry);
      if (activeBrainId) {
        import("../lib/brainConnections").then(
          ({ extractEntryConnections, generateEntryInsight, findAndSaveConnections }) => {
            extractEntryConnections(newEntry, activeBrainId!).catch(() => {});
            generateEntryInsight(newEntry, activeBrainId!)
              .then((insightText) =>
                silentUpdate(newEntry.id, {
                  metadata: { ...(newEntry.metadata ?? {}), ai_insight: insightText },
                }),
              )
              .catch(() => {});
            findAndSaveConnections(newEntry, entries, activeBrainId!).catch(() => {});
          },
        );
      }
    },
    [_handleCreated, activeBrainId, entries, silentUpdate],
  );

  return {
    entries,
    vaultEntries,
    setEntries,
    entriesLoaded,
    refreshEntries,
    links,
    setLinks,
    addLinks,
    cryptoKey,
    handleVaultUnlock,
    vaultExists,
    enriching,
    enrichProgress,
    enrichErrors,
    runBulkEnrich,
    unenrichedDetails,
    unenrichedCount,
    patchEntryId,
    handleCreated,
    handleCreatedBulk,
    lastAction,
    setLastAction,
    saveError,
    setSaveError,
    handleDelete,
    handleUpdate,
    handleUndo,
    commitPendingDelete,
    silentUpdate,
  };
}
