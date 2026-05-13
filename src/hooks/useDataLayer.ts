import { useState, useEffect, useCallback, useRef } from "react";
import type { Dispatch, SetStateAction, RefObject } from "react";
import { authFetch } from "../lib/authFetch";
import { entryRepo } from "../lib/entryRepo";
import { readEntriesCache, writeEntriesCache } from "../lib/entriesCache";
import { readVaultEntriesCache, writeVaultEntriesCache } from "../lib/vaultEntriesCache";
import { decryptEntry, cacheVaultKey } from "../lib/crypto";
import { indexEntry } from "../lib/searchIndex";
import { LINKS } from "../data/constants";
import { useEntryActions } from "./useEntryActions";
import { idleSchedule } from "../lib/idleSchedule";
import type { Entry, Link } from "../types";

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
  const [loadError, setLoadError] = useState<string | null>(null);
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
  // entriesLoaded means "first hydration attempt finished" — NOT "network
  // request completed". Used by the Memory view's grid/list to flip from
  // <SkeletonCard /> to the real list. If we wait for the network we strand
  // the user on a skeleton forever when offline OR when useBrain hasn't
  // resolved an activeBrainId yet (refreshEntries early-returns without
  // setting the flag in that case). Default to true when the synchronous
  // localStorage bootstrap above already produced rows — first paint shows
  // the cached list immediately, the network refresh upgrades it later.
  const [entriesLoaded, setEntriesLoaded] = useState<boolean>(() => {
    // Mirror the bootstrap above — we can't read the function-state initialiser
    // back so re-derive the same flag.
    try {
      const cached = localStorage.getItem("openbrain_entries");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return true;
      }
    } catch {
      /* fall through */
    }
    return false;
  });
  const [links, setLinks] = useState<Link[]>(LINKS);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [vaultExists, setVaultExists] = useState(false);
  const [vaultEntries, setVaultEntries] = useState<Entry[]>([]);
  const vaultEntryIdsRef = useRef<Set<string>>(new Set());

  // Load entries cache on mount — read the per-brain cache for the active brain
  // first, falling back to the legacy single-key cache. Empty cache leaves the
  // existing list intact (could be hydrated from the synchronous localStorage
  // bootstrap above). Either way, flip entriesLoaded once the cache attempt
  // resolves so the Memory view renders the cached list (or empty-state)
  // instead of stalling on the skeleton when activeBrainId isn't ready or
  // the network is down.
  useEffect(() => {
    readEntriesCache(activeBrainId)
      .then((cached) => {
        if (cached && cached.length > 0) setEntries((prev) => (prev.length === 0 ? cached : prev));
      })
      .catch((err) => console.error("[OpenBrain] readEntriesCache failed", err))
      .finally(() => setEntriesLoaded(true));
    // activeBrainId in deps so the cache load re-runs if the brain changes
    // before the network refresh can fill in.
  }, [activeBrainId]);

  // Vault existence check — deferred to idle. The vault badge is purely
  // decorative on first paint (icon in DesktopSidebar / MobileMoreMenu);
  // racing it against the entries fetch on cold boot just steals
  // bandwidth from the critical path.
  useEffect(() => {
    idleSchedule(() => {
      authFetch("/api/vault")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.exists) setVaultExists(true);
        })
        .catch((err) => console.error("[OpenBrain] /api/vault check failed", err));
    });
  }, []);

  // Fetch vault entries for the memory feed (titles are plaintext; content
  // stays encrypted). Cache is read first so the vault tab works offline —
  // the cached blob is the same AES-GCM ciphertext the server returns, so
  // local storage doesn't widen the trust boundary. Reconnect overwrites
  // with the latest server view.
  //
  // SECURITY: this fetch MUST be scoped to activeBrainId. Without the filter
  // the API returns every secret across every brain the user owns, and the
  // memory grid (which merges entries + vaultEntries) renders all of them
  // regardless of which brain the user is currently viewing — leaking
  // cross-brain secrets into shared brains. Only the current brain's
  // ciphertext should ever reach memory. Refetched on every brain switch.
  const fetchVaultEntries = useCallback(async () => {
    if (!activeBrainId) {
      // No brain context yet — clear any stale list rather than holding a
      // previous brain's entries while we wait. Belt-and-suspenders for the
      // brain-switch race.
      setVaultEntries([]);
      vaultEntryIdsRef.current = new Set();
      return;
    }
    // Cache first — non-blocking, gives offline users immediate vault content.
    // (The cache is global per the existing API; the fetch below is what
    // ultimately scopes to the active brain. Cache will be evicted by the
    // server fetch below within the same tick.)
    readVaultEntriesCache()
      .then((cached) => {
        if (cached && cached.length > 0) {
          // Only show cached rows that match the current brain — a stale
          // cache built when a different brain was active would otherwise
          // briefly leak.
          const scoped = cached.filter(
            (e) => (e as Entry & { brain_id?: string }).brain_id === activeBrainId,
          );
          if (scoped.length === 0) return;
          vaultEntryIdsRef.current = new Set(scoped.map((e) => e.id));
          setVaultEntries((prev) => (prev.length === 0 ? scoped : prev));
        }
      })
      .catch(() => {});

    try {
      const r = await authFetch(`/api/vault-entries?brain_id=${encodeURIComponent(activeBrainId)}`);
      if (!r.ok) return;
      const data: Partial<Entry>[] = await r.json();
      const fetched: Entry[] = data.map((e) => ({
        ...e,
        type: "secret" as const,
        encrypted: true,
      })) as Entry[];
      vaultEntryIdsRef.current = new Set(fetched.map((e) => e.id));
      setVaultEntries(fetched);
      // Persist for the next offline boot.
      writeVaultEntriesCache(fetched).catch(() => {});
    } catch (e) {
      console.debug("[useDataLayer] fetchVaultEntries failed", e);
    }
  }, [activeBrainId]);

  // Defer the vault-entries fetch off the critical path. Vault entries are a
  // separate tab (not the default Memory view), so first paint never depends
  // on this — we yield bandwidth to /api/entries phase 1 instead.
  // Re-runs on every activeBrainId change so the memory grid never sees
  // another brain's secrets.
  useEffect(() => {
    idleSchedule(() => {
      fetchVaultEntries();
    });
  }, [fetchVaultEntries]);

  // Optimistic cross-hook bridge — useVaultOps lives inside VaultView and
  // can't reach setVaultEntries here directly. It dispatches the encrypted
  // row when a secret is saved; we add it to the data-layer copy so the
  // memory grid sees it without waiting for the next refetch. brain_id on
  // the event payload is enforced by the dispatcher, and we double-check
  // it matches activeBrainId before adding.
  useEffect(() => {
    function onVaultEntryAdded(ev: Event) {
      const entry = (ev as CustomEvent<Entry>).detail;
      if (!entry || !entry.id) return;
      const entryBrainId = (entry as Entry & { brain_id?: string }).brain_id;
      if (!entryBrainId || entryBrainId !== activeBrainId) return;
      setVaultEntries((prev) => {
        if (prev.some((e) => e.id === entry.id)) return prev;
        return [{ ...entry, encrypted: true }, ...prev];
      });
      vaultEntryIdsRef.current = new Set([entry.id, ...vaultEntryIdsRef.current]);
    }
    window.addEventListener("everion:vault-entry-added", onVaultEntryAdded);
    return () => window.removeEventListener("everion:vault-entry-added", onVaultEntryAdded);
  }, [activeBrainId]);

  const refreshEntries = useCallback(async () => {
    if (!activeBrainId) return;
    // Don't flip entriesLoaded back to false here — that would flash the
    // skeleton over already-rendered cached entries on every brain switch
    // or reconnect. The flag is one-way: once we've shown anything (cache
    // or network), we keep showing something while the next fetch is in
    // flight. Initial-mount skeleton is handled by the bootstrap initialiser
    // + readEntriesCache .finally() above, both of which only flip true.
    setLoadError(null);
    // Fire phase 1 (fast 20-row first-paint) and phase 2 (full 1000-row
    // background) concurrently so phase 2 isn't gated on phase 1's
    // round-trip. PostgREST can't stream, so we still want both — phase 1
    // returns first (smaller payload) and unblocks the UI while phase 2
    // continues in the background. Net cold-load saving ~100-200 ms.
    const phase1 = entryRepo.list({
      brainId: activeBrainId,
      limit: 20,
      onError: (status, body) => {
        setLoadError(`HTTP ${status}${body ? `: ${body.slice(0, 200)}` : ""}`);
      },
    });
    // Phase 2 walks every page until the server says hasMore=false. Replaces
    // the previous unbounded `limit: 1000` fetch — handles brains that have
    // grown past 1000 entries and paginates cleanly under a 5000-entry cap
    // (LIST_ALL_HARD_CAP in entryRepo). Same network shape, just cursor-paged.
    const phase2 = entryRepo.listAll({ brainId: activeBrainId });

    try {
      const initial = await phase1;
      if (initial.length > 0) {
        setEntries(initial);
        initial.filter((e) => e.type !== "secret").forEach(indexEntry);
      }
    } finally {
      setEntriesLoaded(true); // unblock UI regardless of phase 1 outcome
    }

    phase2
      .then((all) => {
        if (all.length > 0) {
          setEntries(all);
          writeEntriesCache(all, activeBrainId);
          all.filter((e) => e.type !== "secret").forEach(indexEntry);
        }
      })
      .catch(() => {});
  }, [activeBrainId]);

  // Cross-device cache continuity. When the user comes back to the tab /
  // resumes the app on their phone, refetch so deletes / inserts made on
  // another device propagate. Without this, soft-deleted entries from a
  // desktop session still rendered on the phone for hours.
  //
  // Debounced: rapid visibility flips (Safari fires visibilitychange a lot
  // during scrolling, app-switcher previews, etc.) shouldn't trigger a
  // refetch storm. 10s window covers the common case of glancing away and
  // back, without leaving the list stale long enough to feel "wrong" when
  // returning from a meaningful gap.
  //
  // The 15s pending-enrichment poll in useEntryRealtime is separate — that
  // one only refetches `pending` entries on the current device, not the
  // full list, and doesn't catch cross-device mutations.
  const lastForegroundRefetchRef = useRef(0);
  const FOREGROUND_DEBOUNCE_MS = 10_000;
  useEffect(() => {
    if (!activeBrainId) return;
    const maybeRefetch = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastForegroundRefetchRef.current < FOREGROUND_DEBOUNCE_MS) return;
      lastForegroundRefetchRef.current = now;
      void refreshEntries();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      // iOS Safari bfcache restore — pageshow.persisted=true means the page
      // came out of the back-forward cache without a full reload, so the
      // list state we have is whatever was frozen when it was suspended.
      // Force the timer to expire so the refetch always fires here.
      if (e.persisted) lastForegroundRefetchRef.current = 0;
      maybeRefetch();
    };
    document.addEventListener("visibilitychange", maybeRefetch);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", maybeRefetch);
    return () => {
      document.removeEventListener("visibilitychange", maybeRefetch);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", maybeRefetch);
    };
  }, [activeBrainId, refreshEntries]);

  // Fetch entries + prefetch links when brain changes.
  // prevBrainIdRef guards against clearing entries on initial mount
  // (which would flash-blank the cached list before the API returns).
  // On brain switch we hydrate from the new brain's cache synchronously
  // (best-effort) before kicking off the network refresh — keeps the user
  // looking at the right brain's entries even when offline.
  const prevBrainIdRef = useRef(activeBrainId);
  useEffect(() => {
    if (!activeBrainId) return;
    if (prevBrainIdRef.current !== activeBrainId) {
      // Clear synchronously so a stale brain's rows don't briefly render
      // under the new brain's switch.
      setEntries([]);
      setLinks([]);
      prevBrainIdRef.current = activeBrainId;
      // Async cache hydration for instant paint — but only apply if the
      // API hasn't beaten us to it (state still empty) AND the user
      // hasn't switched brains again in the meantime. Without these
      // guards a brand-new brain races: refreshEntries populates real
      // rows around ~300 ms and the cache .then resolves later with
      // stale data, clobbering them.
      const hydrationFor = activeBrainId;
      readEntriesCache(activeBrainId)
        .then((cached) => {
          if (prevBrainIdRef.current !== hydrationFor) return;
          if (cached && cached.length > 0) {
            setEntries((prev) => (prev.length === 0 ? cached : prev));
          }
        })
        .catch(() => {});
    }
    refreshEntries();
    // Link prefetch deferred to idle. Links power the "Related" panel inside
    // DetailModal — first paint of the Memory grid never reads them, so this
    // doesn't belong on the critical path. The cached LINKS constant covers
    // any same-frame consumer until /api/search responds in the background.
    const brainIdForLinks = activeBrainId;
    idleSchedule(() => {
      authFetch(`/api/search?brain_id=${encodeURIComponent(brainIdForLinks)}&threshold=0.55`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          const arr = Array.isArray(data) ? data : data.links || [];
          if (arr.length > 0) setLinks(arr);
        })
        .catch((err) => console.error("[OpenBrain] /api/search prefetch failed", err));
    });
  }, [activeBrainId, refreshEntries]);

  // Write-back cache after entries settle — keyed on the active brain so a
  // brain switch can read the right cache later.
  useEffect(() => {
    if (!entriesLoaded) return;
    const t = setTimeout(() => writeEntriesCache(entries, activeBrainId), 3000);
    return () => clearTimeout(t);
  }, [entries, entriesLoaded, activeBrainId]);

  const handleVaultUnlock = useCallback((key: CryptoKey | null) => {
    setCryptoKey(key);
    if (key) {
      cacheVaultKey(key).catch(() => {});
      // Only decrypt legacy secrets in entries table; vault_entries stay PIN-gated
      const vaultIds = vaultEntryIdsRef.current;
      setEntries((prev) => {
        Promise.all(
          prev.map((e) => (e.type === "secret" && !vaultIds.has(e.id) ? decryptEntry(e, key!) : e)),
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
    handleUpdate: _handleUpdateBase,
    handleUndo,
    handleCreated: _handleCreated,
  } = useEntryActions({
    entries,
    setEntries,
    vaultEntries,
    setVaultEntries,
    setSelected,
    isOnline,
    isOnlineRef,
    refreshCount,
    cryptoKey,
    activeBrainId,
  });

  // Flush pending delete on page hide. beforeunload blocks BFCache on iOS
  // Safari, so use pagehide for the same lifecycle point without forcing a
  // full reload on back/forward navigation.
  useEffect(() => {
    const flush = () => commitPendingDelete();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [commitPendingDelete]);

  // silentUpdate uses the base updater so enrichEntry's own flag writes don't re-trigger enrichment
  const silentUpdate = useCallback(
    (id: string, changes: Partial<Entry>) => _handleUpdateBase(id, changes, { silent: true }),
    [_handleUpdateBase],
  );

  const handleUpdate = useCallback(
    async (id: string, changes: Partial<Entry>, options?: { silent?: boolean }) => {
      await _handleUpdateBase(id, changes, options);
    },
    [_handleUpdateBase],
  );

  /** Stable callback for useOfflineSync onEntryIdUpdate. */
  const patchEntryId = useCallback((tempId: string, realId: string) => {
    setEntries((prev) => prev.map((e) => (e.id === tempId ? { ...e, id: realId } : e)));
  }, []);

  const addLinks = useCallback(
    (newLinks: Link[]) => setLinks((prev) => [...prev, ...newLinks]),
    [],
  );

  const handleCreated = useCallback(
    (newEntry: Entry) => {
      _handleCreated(newEntry);
    },
    [_handleCreated],
  );

  return {
    entries,
    vaultEntries,
    setEntries,
    entriesLoaded,
    loadError,
    refreshEntries,
    links,
    setLinks,
    addLinks,
    cryptoKey,
    handleVaultUnlock,
    vaultExists,
    patchEntryId,
    handleCreated,
    handleCreatedBulk: handleCreated,
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
