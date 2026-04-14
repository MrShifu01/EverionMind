import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import { NavIcon } from "./components/icons/NavIcons";
import { useTheme } from "./ThemeContext";
import { authFetch } from "./lib/authFetch";
import { callAI } from "./lib/ai";
import { getEmbedHeaders } from "./lib/aiSettings";
import { decryptEntry } from "./lib/crypto";
import { PROMPTS } from "./config/prompts";
import { LINKS } from "./data/constants";
import { getTypeIcons, registerTypeIcon } from "./lib/typeIcons";
import { useBrain as useBrainHook } from "./hooks/useBrain";
import { useRole } from "./hooks/useRole";
import { useOfflineSync } from "./hooks/useOfflineSync";
import { useEntryActions } from "./hooks/useEntryActions";
import { useNudge } from "./hooks/useNudge";
import { useChat } from "./hooks/useChat";
import { indexEntry, searchIndex } from "./lib/searchIndex";
import { applyEntryFilters, getEntryTypes } from "./lib/entryFilters";
import type { EntryFilterState } from "./lib/entryFilters";
import GridFilters from "./components/GridFilters";
import { readEntriesCache, writeEntriesCache } from "./lib/entriesCache";
import { loadGraph, getGodNodes } from "./lib/conceptGraph";
import type { ConceptGraph } from "./lib/conceptGraph";
import { PinGate } from "./lib/pin";
import { inferWorkspace } from "./lib/workspaceInfer";
import { EntriesContext } from "./context/EntriesContext";
import { BrainContext } from "./context/BrainContext";
import { UndoToast } from "./components/UndoToast";
import { NudgeBanner } from "./components/NudgeBanner";
import { BackgroundTaskToast } from "./components/BackgroundTaskToast";
import { useBackgroundCapture } from "./hooks/useBackgroundCapture";
import { VirtualGrid, VirtualTimeline } from "./components/EntryList";
import BrainSwitcher from "./components/BrainSwitcher";
import BulkActionBar from "./components/BulkActionBar";
import CreateBrainModal from "./components/CreateBrainModal";
import OnboardingModal from "./components/OnboardingModal";
import BrainTipCard from "./components/BrainTipCard";
import BottomNav from "./components/BottomNav";
import MobileHeader from "./components/MobileHeader";
import CaptureSheet from "./components/CaptureSheet";
import DesktopSidebar from "./components/DesktopSidebar";
import LoadingScreen from "./components/LoadingScreen";
import SkeletonCard from "./components/SkeletonCard";
import OmniSearch from "./components/OmniSearch";
import KeyConcepts from "./components/KeyConcepts";
import SettingsView from "./views/SettingsView";
import FeedView from "./views/FeedView";
import type { Brain, Entry } from "./types";

// Retry dynamic imports once on failure (stale chunk hash after deploy)
function lazyRetry(fn: () => Promise<any>) {
  return lazy(() =>
    fn()
      .then((mod) => {
        sessionStorage.removeItem("chunk_reload");
        return mod;
      })
      .catch(() => {
        if (!sessionStorage.getItem("chunk_reload")) {
          sessionStorage.setItem("chunk_reload", "1");
          window.location.reload();
          return new Promise(() => {}); // never resolves — page is reloading
        }
        return fn(); // second attempt after reload
      }),
  );
}

const RefineView = lazyRetry(() => import("./views/RefineView"));
const TodoView = lazyRetry(() => import("./views/TodoView"));
const DetailModal = lazyRetry(() => import("./views/DetailModal"));
const VaultView = lazyRetry(() => import("./views/VaultView"));
const ChatView = lazyRetry(() => import("./views/ChatView"));

function Loader() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SkeletonCard count={3} />
    </div>
  );
}

// PERF-9: compiled once at module level — generic phone pattern
const PHONE_REGEX = /(\+?[0-9]{7,15})/;

const NAV_VIEWS = [
  { id: "grid", l: "Memory", ic: "▦" },
  { id: "chat", l: "Ask", ic: "◈" },
];

export default function OpenBrain({ initialShowCapture }: { initialShowCapture?: boolean } = {}) {
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
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);

  const handleVaultUnlock = useCallback((key: CryptoKey | null) => {
    setCryptoKey(key);
    if (key) {
      setEntries((prev) => {
        Promise.all(prev.map((e) => (e.type === "secret" ? decryptEntry(e as any, key!) : e))).then(
          (decrypted) => setEntries(decrypted as Entry[]),
        );
        return prev;
      });
    }
  }, []);

  useEffect(() => {
    readEntriesCache()
      .then((cached) => {
        if (cached && cached.length > 0) setEntries((prev) => (prev.length === 0 ? cached : prev));
      })
      .catch((err) => console.error("[OpenBrain] readEntriesCache failed", err));
  }, []);

  const [links, setLinks] = useState<any[]>(LINKS);

  const {
    brains,
    activeBrain,
    setActiveBrain,
    deleteBrain,
    refresh,
    loading: brainsLoading,
  } = useBrainHook(
    useCallback(() => {
      setEntries([]);
      setLinks([]);
      setEntriesLoaded(false);
    }, []),
  );

  const { isOnline, pendingCount, sync, refreshCount, failedOps, clearFailedOps } = useOfflineSync({
    onEntryIdUpdate: useCallback((tempId: string, realId: string) => {
      setEntries((prev) => prev.map((e) => (e.id === tempId ? { ...e, id: realId } : e)));
    }, []),
  });

  useEffect(() => {
    if (isOnline) sync();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isOnlineRef = useRef(isOnline);
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [workspace] = useState(() => localStorage.getItem("openbrain_workspace") || "all");
  const [gridFilters, setGridFilters] = useState<EntryFilterState>({
    type: "all",
    date: "all",
    sort: "newest",
  });
  const [gridViewMode, setGridViewMode] = useState<"grid" | "list">(
    () => (localStorage.getItem("openbrain_viewmode") as "grid" | "list") || "grid",
  );
  const [view, setView] = useState("feed");
  const [selected, setSelected] = useState<Entry | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelectMode = () => {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
  };
  const toggleSelectId = (id: string) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const addLinks = useCallback((newLinks: any[]) => setLinks((prev) => [...prev, ...newLinks]), []);
  const [typeIcons, setTypeIcons] = useState<Record<string, string>>({});
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const refreshTypeIcons = useCallback(() => {
    if (activeBrain?.id) setTypeIcons(getTypeIcons(activeBrain.id));
  }, [activeBrain?.id]);
  const { canWrite, canInvite, canManageMembers } = useRole(activeBrain);
  const { isDark, toggleTheme } = useTheme();
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem("openbrain_onboarded"),
  );
  const [showBrainTip, setShowBrainTip] = useState<Brain | null>(null);
  const [showCreateBrain, setShowCreateBrain] = useState(false);
  const [showCapture, setShowCapture] = useState(!!initialShowCapture);
  const [vaultExists, setVaultExists] = useState(false);

  useEffect(() => {
    if (showOnboarding && brains.length > 0) {
      localStorage.setItem("openbrain_onboarded", "1");
      setShowOnboarding(false); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [brains, showOnboarding]);
  useEffect(() => {
    const h = () => setShowOnboarding(true);
    window.addEventListener("openbrain:restart-onboarding", h);
    return () => window.removeEventListener("openbrain:restart-onboarding", h);
  }, []);
  useEffect(() => {
    authFetch("/api/vault")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.exists) setVaultExists(true);
      })
      .catch((err) => console.error("[OpenBrain] /api/vault check failed", err));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 200);
    return () => clearTimeout(t);
  }, [searchInput]);
  useEffect(() => {
    if (activeBrain?.id) setTypeIcons(getTypeIcons(activeBrain.id)); // eslint-disable-line react-hooks/set-state-in-effect
  }, [activeBrain?.id]);
  useEffect(() => {
    if (!activeBrain?.id) return;
    setEntriesLoaded(false); // eslint-disable-line react-hooks/set-state-in-effect
    authFetch(`/api/entries?brain_id=${encodeURIComponent(activeBrain.id)}`)
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
    authFetch(`/api/search?brain_id=${encodeURIComponent(activeBrain.id)}&threshold=0.55`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const arr = Array.isArray(data) ? data : data.links || [];
        if (arr.length > 0) setLinks(arr);
      })
      .catch((err) => console.error("[OpenBrain] /api/search prefetch failed", err));
  }, [activeBrain?.id]);
  useEffect(() => {
    if (!entriesLoaded) return;
    const t = setTimeout(() => writeEntriesCache(entries), 3000);
    return () => clearTimeout(t);
  }, [entries, entriesLoaded]);

  const { nudge, setNudge } = useNudge({ entriesLoaded, entries, activeBrain });

  const {
    lastAction,
    setLastAction,
    saveError,
    setSaveError,
    commitPendingDelete,
    handleDelete,
    handleUpdate,
    handleUndo,
    handleCreated,
  } = useEntryActions({
    entries,
    setEntries,
    setSelected,
    isOnline,
    isOnlineRef,
    refreshCount,
    cryptoKey,
  });

  const {
    tasks: bgTasks,
    processFiles: bgProcessFiles,
    dismissTask: bgDismissTask,
    dismissAll: bgDismissAll,
  } = useBackgroundCapture();

  useEffect(() => {
    const flush = () => commitPendingDelete();
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [commitPendingDelete]);

  const chat = useChat({
    entries,
    activeBrain,
    brains,
    links,
    cryptoKey,
    handleVaultUnlock,
    vaultExists,
  });

  const filtered = useMemo(() => {
    let r = entries;
    if (workspace !== "all")
      r = r.filter((e) => {
        const ws = inferWorkspace(e);
        return ws === workspace || ws === "both";
      });
    if (search) {
      const ids = searchIndex(search);
      if (ids) r = r.filter((e) => ids.has(e.id));
    }
    return applyEntryFilters(r, gridFilters);
  }, [search, gridFilters, workspace, entries]);

  const sortedTimeline = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
      ),
    [filtered],
  );

  const availableEntryTypes = useMemo(() => getEntryTypes(entries), [entries]);

  // Concept graph data for grid view
  const conceptGraph: ConceptGraph | null = useMemo(() => {
    if (!activeBrain?.id) return null;
    const g = loadGraph(activeBrain.id);
    return g.concepts.length > 0 ? g : null;
  }, [activeBrain?.id, entries]); // re-derive when entries change (after sync)

  const conceptMap = useMemo(() => {
    if (!conceptGraph) return undefined;
    const map: Record<string, string[]> = {};
    for (const c of conceptGraph.concepts) {
      for (const eid of c.source_entries) {
        if (!map[eid]) map[eid] = [];
        map[eid].push(c.label);
      }
    }
    return map;
  }, [conceptGraph]);

  const godNodes = useMemo(() => {
    if (!conceptGraph) return [];
    return getGodNodes(conceptGraph, 8);
  }, [conceptGraph]);

  const entriesValue = useMemo(
    () => ({
      entries,
      setEntries,
      entriesLoaded,
      selected,
      setSelected,
      handleDelete,
      handleUpdate,
    }),
    [entries, setEntries, entriesLoaded, selected, setSelected, handleDelete, handleUpdate],
  );
  const brainValue = useMemo(
    () => ({
      activeBrain,
      brains,
      setActiveBrain,
      refresh,
      canInvite,
      canManageMembers,
      deleteBrain,
    }),
    [activeBrain, brains, setActiveBrain, refresh, canInvite, canManageMembers, deleteBrain],
  );

  if (brainsLoading)
    return (
      <>
        <LoadingScreen />
        <button
          onClick={() => setShowCapture(true)}
          aria-label="New entry"
          className="press-scale fixed bottom-5 left-1/2 z-[60] flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full lg:hidden"
          style={{
            background: "var(--color-primary)",
            color: "var(--color-on-primary)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </>
    );

  return (
    <EntriesContext.Provider value={entriesValue}>
      <BrainContext.Provider value={brainValue}>
        <>
          <DesktopSidebar
            activeBrainName={activeBrain?.name || "Everion"}
            view={view}
            onNavigate={(id) => {
              setSelected(null);
              setShowCapture(false);
              setView(id);
            }}
            onCapture={() => setShowCapture(true)}
            isDark={isDark}
            onToggleTheme={toggleTheme}
            isOnline={isOnline}
            pendingCount={pendingCount}
            entryCount={entries.length}
            onShowCreateBrain={() => setShowCreateBrain(true)}
            navViews={NAV_VIEWS}
          >
            {brains.length > 0 && (
              <BrainSwitcher
                brains={brains}
                activeBrain={activeBrain}
                onSwitch={setActiveBrain}
                onBrainCreated={async (brain) => {
                  await refresh();
                  setActiveBrain(brain);
                }}
                onBrainTip={(brain) => setShowBrainTip(brain)}
              />
            )}
          </DesktopSidebar>

          <div className="w-full overflow-x-hidden">
            <div className="bg-background min-h-dvh lg:ml-72 lg:max-w-[calc(75vw)]">
              <MobileHeader
                brainName={activeBrain?.name || "Everion"}
                brainEmoji="🧠"
                onToggleTheme={toggleTheme}
                isDark={isDark}
                isOnline={isOnline}
                pendingCount={pendingCount}
                onSearch={() =>
                  window.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
                  )
                }
              >
                {brains.length > 0 && (
                  <BrainSwitcher
                    brains={brains}
                    activeBrain={activeBrain}
                    onSwitch={setActiveBrain}
                    onBrainCreated={async (brain) => {
                      await refresh();
                      setActiveBrain(brain);
                    }}
                    onBrainTip={(brain) => setShowBrainTip(brain)}
                  />
                )}
              </MobileHeader>

              {showBrainTip && (
                <BrainTipCard
                  brain={showBrainTip}
                  onDismiss={() => setShowBrainTip(null)}
                  onFill={() => {
                    setShowBrainTip(null);
                    setView("suggest");
                  }}
                />
              )}
              {view === "grid" && nudge && (
                <NudgeBanner
                  nudge={nudge}
                  onDismiss={() => {
                    setNudge(null);
                    localStorage.setItem("openbrain_nudge_dismissed", Date.now().toString());
                    localStorage.removeItem("openbrain_nudge");
                  }}
                />
              )}
              {failedOps.length > 0 && (
                <div
                  className="mx-4 mt-2 flex items-center gap-3 rounded-2xl border p-3"
                  style={{
                    background: "color-mix(in oklch, var(--color-error) 8%, transparent)",
                    borderColor: "color-mix(in oklch, var(--color-error) 20%, transparent)",
                  }}
                >
                  <span className="text-error flex-1 text-sm">
                    {failedOps.length} operation{failedOps.length > 1 ? "s" : ""} failed to sync
                  </span>
                  <button
                    onClick={() => clearFailedOps()}
                    className="text-on-surface-variant hover:text-on-surface press-scale text-xs"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {showCreateBrain && (
                <CreateBrainModal
                  onClose={() => setShowCreateBrain(false)}
                  onCreate={async (brain) => {
                    await refresh();
                    setActiveBrain(brain);
                    setShowBrainTip(brain);
                    setShowCreateBrain(false);
                  }}
                />
              )}

              <OmniSearch entries={entries} onSelect={setSelected} onNavigate={setView} />

              <div className="mx-auto max-w-6xl px-4 pt-4 pb-32 sm:px-6 lg:pb-8">
                {view === "grid" && (
                  <div className="space-y-3">
                    <div
                      className="flex items-center gap-3 rounded-2xl border px-4 py-3"
                      style={{
                        background: "var(--color-surface-container-low)",
                        borderColor: "var(--color-outline-variant)",
                      }}
                    >
                      <svg
                        className="text-primary h-4 w-4 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                        />
                      </svg>
                      <input
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Search memories..."
                        className="text-on-surface placeholder:text-on-surface-variant/40 flex-1 border-none bg-transparent text-sm outline-none"
                      />
                    </div>
                    <GridFilters
                      filters={gridFilters}
                      availableTypes={availableEntryTypes}
                      typeIcons={typeIcons}
                      onChange={setGridFilters}
                      selectMode={selectMode}
                      onSelectModeToggle={toggleSelectMode}
                      viewMode={gridViewMode}
                      onViewModeChange={(mode) => {
                        setGridViewMode(mode);
                        localStorage.setItem("openbrain_viewmode", mode);
                      }}
                      activeCount={
                        [
                          gridFilters.type !== "all",
                          gridFilters.date !== "all",
                          gridFilters.sort !== "newest",
                          !!gridFilters.concept,
                        ].filter(Boolean).length
                      }
                    />

                    {godNodes.length > 0 && (
                      <KeyConcepts
                        concepts={godNodes}
                        activeConcept={gridFilters.concept}
                        onConceptClick={(label) =>
                          setGridFilters((f) => ({ ...f, concept: label, brainId: activeBrain?.id }))
                        }
                      />
                    )}

                    {!entriesLoaded ? (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <SkeletonCard count={6} />
                      </div>
                    ) : filtered.length > 0 ? (
                      <>
                        <VirtualGrid
                          filtered={filtered}
                          setSelected={selectMode ? () => {} : setSelected}
                          typeIcons={typeIcons}
                          onPin={(e) => handleUpdate(e.id, { pinned: !e.pinned })}
                          onDelete={(e) => handleDelete(e.id)}
                          selectMode={selectMode}
                          selectedIds={selectedIds}
                          onToggleSelect={toggleSelectId}
                          viewMode={gridViewMode}
                          conceptMap={conceptMap}
                        />
                        {selectMode && selectedIds.size > 0 && (
                          <BulkActionBar
                            selectedIds={selectedIds}
                            entries={entries}
                            brains={brains}
                            onDone={(updated) => {
                              setEntries((prev) =>
                                prev.map((e) => updated.find((u) => u.id === e.id) ?? e),
                              );
                              toggleSelectMode();
                            }}
                            onCancel={toggleSelectMode}
                          />
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-3 py-20">
                        <div className="text-4xl opacity-40">🔍</div>
                        <p className="text-on-surface font-bold">No memories match</p>
                      </div>
                    )}
                  </div>
                )}
                {view === "refine" && (
                  <Suspense fallback={<Loader />}>
                    <RefineView
                      entries={entries}
                      setEntries={setEntries}
                      links={links}
                      addLinks={addLinks}
                      activeBrain={activeBrain}
                      brains={brains}
                      onSwitchBrain={setActiveBrain}
                      onCapture={() => setShowCapture(true)}
                    />
                  </Suspense>
                )}
                {view === "todos" && (
                  <Suspense fallback={<Loader />}>
                    <TodoView entries={entries} typeIcons={typeIcons} />
                  </Suspense>
                )}
                {view === "timeline" && (
                  <VirtualTimeline
                    sorted={sortedTimeline}
                    setSelected={setSelected}
                    typeIcons={typeIcons}
                  />
                )}
                {view === "vault" && (
                  <Suspense fallback={<Loader />}>
                    <VaultView
                      entries={entries}
                      onSelect={setSelected}
                      cryptoKey={cryptoKey}
                      onVaultUnlock={handleVaultUnlock}
                      brainId={activeBrain?.id}
                      onEntryCreated={(e: Entry) => setEntries((prev) => [e, ...prev])}
                    />
                  </Suspense>
                )}
                {view === "chat" && (
                  <Suspense fallback={<Loader />}>
                    <ChatView {...chat} brains={brains} phoneRegex={PHONE_REGEX} />
                  </Suspense>
                )}
                {view === "settings" && <SettingsView onNavigate={setView} />}
                {view === "feed" && (
                  <FeedView onCapture={() => setShowCapture(true)} />
                )}
                {view === "capture" &&
                  (() => {
                    if (!entriesLoaded)
                      return (
                        <div className="space-y-6">
                          {/* Welcome skeleton */}
                          <div
                            className="h-16 animate-pulse rounded-3xl"
                            style={{ background: "var(--color-surface-container)" }}
                          />
                          {/* Grid skeleton */}
                          <div>
                            <div
                              className="mb-3 h-3 w-24 animate-pulse rounded-full"
                              style={{ background: "var(--color-surface-container)" }}
                            />
                            <div className="grid grid-cols-2 gap-3">
                              {[0, 1, 2, 3].map((i) => (
                                <div
                                  key={i}
                                  className="h-20 animate-pulse rounded-2xl"
                                  style={{ background: "var(--color-surface-container)" }}
                                />
                              ))}
                            </div>
                          </div>
                          {/* List skeleton */}
                          <div>
                            <div
                              className="mb-3 h-3 w-28 animate-pulse rounded-full"
                              style={{ background: "var(--color-surface-container)" }}
                            />
                            <div
                              className="overflow-hidden rounded-2xl border"
                              style={{ borderColor: "var(--color-outline-variant)" }}
                            >
                              {[0, 1, 2].map((i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-3 px-4 py-3"
                                  style={{
                                    borderTop:
                                      i > 0 ? "1px solid var(--color-outline-variant)" : undefined,
                                  }}
                                >
                                  <div
                                    className="h-5 w-5 animate-pulse rounded-full"
                                    style={{ background: "var(--color-surface-container)" }}
                                  />
                                  <div
                                    className="h-3 flex-1 animate-pulse rounded-full"
                                    style={{ background: "var(--color-surface-container)" }}
                                  />
                                  <div
                                    className="h-3 w-12 animate-pulse rounded-full"
                                    style={{ background: "var(--color-surface-container)" }}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    const recentEntries = [...entries]
                      .sort(
                        (a, b) =>
                          new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
                          new Date(a.updated_at ?? a.created_at ?? 0).getTime(),
                      )
                      .slice(0, 5);
                    const quickActions = [
                      { id: "chat", label: "Ask Brain", icon: NavIcon.chat },
                      { id: "todos", label: "Todos", icon: NavIcon.todos },
                      { id: "refine", label: "Improve Brain", icon: NavIcon.refine },
                      { id: "grid", label: "Memory Grid", icon: NavIcon.grid },
                    ] as { id: string; label: string; icon: ReactNode }[];
                    return (
                      <div className="space-y-6">
                        {/* Welcome */}
                        <div
                          className="rounded-3xl border px-5 py-4"
                          style={{
                            background:
                              "color-mix(in oklch, var(--color-primary) 8%, var(--color-surface))",
                            borderColor:
                              "color-mix(in oklch, var(--color-primary) 18%, transparent)",
                          }}
                        >
                          <p
                            className="text-base font-bold"
                            style={{ color: "var(--color-on-surface)" }}
                          >
                            👋 Welcome back
                          </p>
                          <p
                            className="mt-0.5 text-sm"
                            style={{ color: "var(--color-on-surface-variant)" }}
                          >
                            {activeBrain?.name ?? "Your brain"} is active · {entries.length}{" "}
                            {entries.length === 1 ? "memory" : "memories"}
                          </p>
                        </div>

                        {/* Quick actions grid */}
                        <div>
                          <p
                            className="mb-3 text-xs font-semibold tracking-widest uppercase"
                            style={{ color: "var(--color-on-surface-variant)" }}
                          >
                            Quick Nav
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            {quickActions.map((v) => (
                              <button
                                key={v.id}
                                onClick={() => setView(v.id)}
                                className="press-scale flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-all"
                                style={{
                                  background: "var(--color-surface-container-low)",
                                  borderColor: "var(--color-outline-variant)",
                                }}
                              >
                                <div style={{ color: "var(--color-primary)" }}>{v.icon}</div>
                                <div
                                  className="text-sm font-bold"
                                  style={{ color: "var(--color-on-surface)" }}
                                >
                                  {v.label}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Recent activity */}
                        {recentEntries.length > 0 && (
                          <div>
                            <p
                              className="mb-3 text-xs font-semibold tracking-widest uppercase"
                              style={{ color: "var(--color-on-surface-variant)" }}
                            >
                              Recent Activity
                            </p>
                            <div
                              className="overflow-hidden rounded-2xl border"
                              style={{
                                borderColor: "var(--color-outline-variant)",
                                background: "var(--color-surface-container-low)",
                              }}
                            >
                              {recentEntries.map((entry, i) => (
                                <button
                                  key={entry.id}
                                  onClick={() => setSelected(entry)}
                                  className="press-scale flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:brightness-95"
                                  style={{
                                    borderTop:
                                      i > 0 ? `1px solid var(--color-outline-variant)` : undefined,
                                  }}
                                >
                                  <span className="text-base leading-none">
                                    {typeIcons[entry.type] ?? "📝"}
                                  </span>
                                  <span
                                    className="flex-1 truncate text-sm font-medium"
                                    style={{ color: "var(--color-on-surface)" }}
                                  >
                                    {entry.title}
                                  </span>
                                  <span
                                    className="flex-shrink-0 text-xs capitalize"
                                    style={{ color: "var(--color-on-surface-variant)" }}
                                  >
                                    {entry.type}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
              </div>

              <Suspense fallback={null}>
                {selected && (
                  <DetailModal
                    entry={selected}
                    onClose={() => setSelected(null)}
                    onDelete={handleDelete}
                    onUpdate={handleUpdate}
                    entries={entries}
                    links={links}
                    canWrite={canWrite}
                    brains={brains}
                    vaultUnlocked={!!cryptoKey}
                    typeIcons={typeIcons}
                    onTypeIconChange={(type: string, icon: string) => {
                      registerTypeIcon(activeBrain?.id ?? "", type, icon);
                      refreshTypeIcons();
                    }}
                  />
                )}
              </Suspense>

              {lastAction && (
                <UndoToast
                  action={lastAction}
                  onUndo={handleUndo}
                  onDismiss={() => {
                    if (lastAction.type === "delete") commitPendingDelete();
                    setLastAction(null);
                  }}
                />
              )}

              <BackgroundTaskToast
                tasks={bgTasks}
                onDismiss={bgDismissTask}
                onDismissAll={bgDismissAll}
              />

              {saveError && (
                <div
                  className="fixed top-4 right-4 z-[100] flex max-w-sm items-center gap-3 rounded-2xl border px-4 py-3"
                  style={{
                    background: "var(--color-surface-container-high)",
                    borderColor: "color-mix(in oklch, var(--color-error) 20%, transparent)",
                  }}
                >
                  <span className="text-on-surface flex-1 text-sm">{saveError}</span>
                  <button
                    onClick={() => setSaveError(null)}
                    className="text-on-surface-variant hover:text-on-surface press-scale"
                  >
                    ×
                  </button>
                </div>
              )}

              {chat.showPinGate && (
                <PinGate
                  isSetup={chat.pinGateIsSetup}
                  onSuccess={() => {
                    if (chat.pendingSecureMsg) {
                      chat.setChatMsgs((p) => [
                        ...p,
                        { role: "assistant", content: chat.pendingSecureMsg!.content },
                      ]);
                      chat.setPendingSecureMsg(null);
                    }
                    chat.setShowPinGate(false);
                  }}
                  onCancel={() => {
                    chat.setPendingSecureMsg(null);
                    chat.setShowPinGate(false);
                  }}
                />
              )}

              {showOnboarding && (
                <OnboardingModal
                  onComplete={(_, answeredItems, skippedQs) => {
                    if (answeredItems?.length) {
                      try {
                        const key = "openbrain_answered_qs";
                        const ex = new Set(JSON.parse(localStorage.getItem(key) || "[]"));
                        answeredItems.forEach((i: any) => ex.add(i.q));
                        localStorage.setItem(key, JSON.stringify([...ex]));
                      } catch (err) {
                        console.error("[OpenBrain]", err);
                      }
                      answeredItems.forEach((item: any) => {
                        callAI({
                          max_tokens: 800,
                          system: PROMPTS.QA_PARSE,
                          brainId: activeBrain?.id,
                          messages: [
                            { role: "user", content: `Question: ${item.q}\nAnswer: ${item.a}` },
                          ],
                        })
                          .then((r: any) => r.json())
                          .then((data: any) => {
                            let parsed: any = {};
                            try {
                              parsed = JSON.parse(
                                (data.content?.[0]?.text || "{}")
                                  .replace(/```json|```/g, "")
                                  .trim(),
                              );
                            } catch (err) {
                              console.error("[OpenBrain]", err);
                            }
                            if (parsed.title && activeBrain?.id) {
                              authFetch("/api/capture", {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  ...(getEmbedHeaders() || {}),
                                },
                                body: JSON.stringify({
                                  p_title: parsed.title,
                                  p_content: parsed.content || item.a,
                                  p_type: parsed.type || "note",
                                  p_metadata: parsed.metadata || {},
                                  p_tags: parsed.tags || [],
                                  p_brain_id: activeBrain.id,
                                }),
                              }).catch((err: Error) =>
                                console.error("[onboarding] capture failed", err),
                              );
                            }
                          })
                          .catch((err: Error) =>
                            console.error("[onboarding] AI parse failed", err),
                          );
                      });
                    }
                    if (skippedQs?.length) {
                      try {
                        const ex = JSON.parse(
                          localStorage.getItem("openbrain_onboarding_skipped") || "[]",
                        );
                        const merged = [...ex];
                        skippedQs.forEach((q: any) => {
                          if (!merged.find((e: any) => e.q === q.q)) merged.push(q);
                        });
                        localStorage.setItem(
                          "openbrain_onboarding_skipped",
                          JSON.stringify(merged),
                        );
                      } catch (err) {
                        console.error("[OpenBrain]", err);
                      }
                    }
                    setShowOnboarding(false);
                    setView("feed");
                  }}
                />
              )}

              <CaptureSheet
                isOpen={showCapture}
                onClose={() => setShowCapture(false)}
                onCreated={handleCreated}
                brainId={activeBrain?.id}
                cryptoKey={cryptoKey}
                isOnline={isOnline}
                onBackgroundFiles={(files) => bgProcessFiles(files, activeBrain?.id, handleCreated)}
                onNavigate={(id) => {
                  setShowCapture(false);
                  setView(id);
                }}
              />
              <BottomNav
                activeView={view}
                onNavigate={(id) => {
                  setSelected(null);
                  setShowCapture(false);
                  setView(id);
                }}
                onCapture={() => setShowCapture(true)}
              />
            </div>
          </div>
        </>
      </BrainContext.Provider>
    </EntriesContext.Provider>
  );
}
