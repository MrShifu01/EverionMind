import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Dispatch, SetStateAction, RefObject } from "react";
import { authFetch } from "../lib/authFetch";
import { readEntriesCache, writeEntriesCache } from "../lib/entriesCache";
import { decryptEntry } from "../lib/crypto";
import { indexEntry } from "../lib/searchIndex";
import { LINKS } from "../data/constants";
import { isFullyEnriched, getEnrichmentGaps, enrichEntry } from "../lib/enrichEntry";
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
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{ done: number; total: number } | null>(null);

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
    setEntriesLoaded(false);
    authFetch(`/api/entries?brain_id=${encodeURIComponent(activeBrainId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const fetched = Array.isArray(data) ? data : (data?.entries ?? []);
        if (fetched.length > 0) {
          setEntries(fetched);
          writeEntriesCache(fetched);
          fetched.filter((e: Entry) => e.type !== "secret").forEach(indexEntry);
        }
        setEntriesLoaded(true);
      })
      .catch(() => setEntriesLoaded(true));
    authFetch(`/api/search?brain_id=${encodeURIComponent(activeBrainId)}&threshold=0.55`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const arr = Array.isArray(data) ? data : data.links || [];
        if (arr.length > 0) setLinks(arr);
      })
      .catch((err) => console.error("[OpenBrain] /api/search prefetch failed", err));
  }, [activeBrainId]);

  // Write-back cache after entries settle
  useEffect(() => {
    if (!entriesLoaded) return;
    const t = setTimeout(() => writeEntriesCache(entries), 3000);
    return () => clearTimeout(t);
  }, [entries, entriesLoaded]);

  const handleVaultUnlock = useCallback((key: CryptoKey | null) => {
    setCryptoKey(key);
    if (key) {
      setEntries((prev) => {
        Promise.all(
          prev.map((e) => (e.type === "secret" ? decryptEntry(e as any, key!) : e)),
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
        .filter((e) => !isFullyEnriched(e, entries))
        .map((e) => ({
          id: e.id,
          title: e.title || "(untitled)",
          gaps: getEnrichmentGaps(e, entries),
        })),
    [entries],
  );
  const unenrichedCount = unenrichedDetails.length;

  const runBulkEnrich = useCallback(async () => {
    if (!activeBrainId || enriching) return;
    const unenriched = entries.filter((e) => !isFullyEnriched(e, entries));
    if (unenriched.length === 0) return;
    setEnriching(true);
    setEnrichProgress({ done: 0, total: unenriched.length });
    for (let i = 0; i < unenriched.length; i++) {
      await enrichEntry(unenriched[i], activeBrainId, silentUpdate);
      setEnrichProgress({ done: i + 1, total: unenriched.length });
    }
    setEnriching(false);
    setEnrichProgress(null);
  }, [activeBrainId, entries, enriching, silentUpdate]);

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
    setEntries,
    entriesLoaded,
    links,
    setLinks,
    addLinks,
    cryptoKey,
    handleVaultUnlock,
    vaultExists,
    enriching,
    enrichProgress,
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
