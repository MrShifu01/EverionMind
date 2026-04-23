import {
  useMemo,
  useRef,
  useEffect,
  useCallback,
  useState,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import { NavIcon } from "./components/icons/NavIcons";
import { useTheme } from "./ThemeContext";
import { authFetch } from "./lib/authFetch";
import { callAI } from "./lib/ai";
import { getEmbedHeaders } from "./lib/aiSettings";
import { registerTypeIcon } from "./lib/typeIcons";
import { useBrain as useBrainHook } from "./hooks/useBrain";
import { useOfflineSync } from "./hooks/useOfflineSync";
import { useNudge } from "./hooks/useNudge";
import { searchIndex, indexEntryConcepts, scoreEntry } from "./lib/searchIndex";
import { applyEntryFilters, getEntryTypes } from "./lib/entryFilters";
import GridFilters from "./components/GridFilters";
import { inferWorkspace } from "./lib/workspaceInfer";
import { EntriesContext } from "./context/EntriesContext";
import { BrainContext } from "./context/BrainContext";
import { ConceptGraphProvider, useConceptGraph } from "./context/ConceptGraphContext";
import { UndoToast } from "./components/UndoToast";
import { NudgeBanner } from "./components/NudgeBanner";
import { BackgroundTaskToast } from "./components/BackgroundTaskToast";
import { useBackgroundCapture } from "./hooks/useBackgroundCapture";
import { VirtualGrid, VirtualTimeline } from "./components/EntryList";
import BulkActionBar from "./components/BulkActionBar";
import OnboardingModal from "./components/OnboardingModal";
import BottomNav from "./components/BottomNav";
import MobileHeader from "./components/MobileHeader";
const CaptureSheet = lazy(() => import("./components/CaptureSheet"));
import DesktopSidebar from "./components/DesktopSidebar";
import LoadingScreen from "./components/LoadingScreen";
import SkeletonCard from "./components/SkeletonCard";
import OmniSearch from "./components/OmniSearch";
import SettingsView from "./views/SettingsView";
const GraphView = lazy(() => import("./views/GraphView"));
import FloatingCaptureButton from "./components/FloatingCaptureButton";
import { useAppShell, type AppShellState } from "./hooks/useAppShell";
import { useDataLayer } from "./hooks/useDataLayer";
import { useBrain } from "./context/BrainContext";
import { useEntries } from "./context/EntriesContext";
import type { Entry } from "./types";
import { useAdminDevMode } from "./hooks/useAdminDevMode";
import { isFeatureEnabled, FEATURE_FLAGS, type FeatureFlagKey } from "./lib/featureFlags";

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

const TodoView = lazyRetry(() => import("./views/TodoView"));
const DetailModal = lazyRetry(() => import("./views/DetailModal"));
const VaultView = lazyRetry(() => import("./views/VaultView"));
const ChatView = lazyRetry(() => import("./views/ChatView"));
const VaultRevealModal = lazyRetry(() => import("./components/VaultRevealModal"));
function Loader() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SkeletonCard count={3} />
    </div>
  );
}

const NAV_VIEWS = [
  { id: "memory", l: "Memory", ic: "▦" },
  { id: "chat", l: "Chat", ic: "💬" },
  { id: "graph", l: "Graph", ic: "✦" },
  { id: "todos", l: "Todos", ic: "✓" },
  { id: "vault", l: "Vault", ic: "🔐" },
];

// ─── EverionContent ──────────────────────────────────────────────────────────
// Reads context (BrainContext, EntriesContext, ConceptGraphContext) + receives
// appShell and the few values that don't belong in any context.

interface EverionContentProps {
  appShell: AppShellState;
  links: any[];
  cryptoKey: CryptoKey | null;
  handleVaultUnlock: (key: CryptoKey | null) => void;
  enriching: boolean;
  enrichProgress: { done: number; total: number } | null;
  enrichErrors: { id: string; title: string; errors: { step: string; message: string }[] }[];
  enrichCurrentEntry: { idx: number; total: number; title: string; phase: string } | null;
  enrichLog: { ts: number; level: "info" | "error"; message: string }[];
  runBulkEnrich: () => Promise<void>;
  unenrichedCount: number;
  unenrichedDetails: { id: string; title: string; gaps: string[] }[];
  handleCreated: (entry: Entry) => void;
  handleCreatedBulk: (entry: Entry) => void;
  lastAction: any;
  setLastAction: (a: any) => void;
  saveError: string | null;
  setSaveError: (e: string | null) => void;
  handleUndo: () => void;
  commitPendingDelete: () => void;
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  isOnline: boolean;
  pendingCount: number;
  failedOps: any[];
  clearFailedOps: () => void;
  canWrite: boolean;
  nudge: any;
  setNudge: (n: any) => void;
  bgTasks: any[];
  bgProcessFiles: (files: File[], brainId: string | undefined, onCreated: (e: Entry) => void) => void;
  bgQueueDirectSave: (entry: { title: string; content: string; type: string; tags: string[]; metadata: Record<string, any>; rawContent?: string }, brainId: string | undefined, onCreated: (e: Entry) => void) => void;
  bgDismissTask: (id: string) => void;
  bgDismissAll: () => void;
  filtered: Entry[];
  sortedTimeline: Entry[];
  availableEntryTypes: string[];
  vaultEntries: Entry[];
}

function EverionContent({
  appShell,
  links,
  cryptoKey,
  handleVaultUnlock,
  enriching,
  enrichProgress,
  enrichErrors,
  enrichCurrentEntry,
  enrichLog,
  runBulkEnrich,
  unenrichedCount,
  unenrichedDetails,
  handleCreated,
  handleCreatedBulk,
  lastAction,
  setLastAction,
  saveError,
  setSaveError,
  handleUndo,
  commitPendingDelete,
  setEntries,
  isOnline,
  pendingCount,
  failedOps,
  clearFailedOps,
  canWrite,
  nudge,
  setNudge,
  bgTasks,
  bgProcessFiles,
  bgQueueDirectSave,
  bgDismissTask,
  bgDismissAll,
  filtered,
  sortedTimeline,
  availableEntryTypes,
  vaultEntries,
}: EverionContentProps) {
  const { activeBrain, brains, setActiveBrain, refresh } = useBrain();
  const { entries, entriesLoaded, selected, setSelected, handleDelete, handleUpdate } = useEntries();
  const [selectedVaultEntry, setSelectedVaultEntry] = useState<Entry | null>(null);

  const handleEntrySelect = useCallback(
    (entry: Entry) => {
      if (entry.type === "secret") {
        setSelectedVaultEntry(entry);
      } else {
        setSelected(entry);
      }
    },
    [setSelected],
  );

  const allEntries = useMemo(() => [...entries, ...vaultEntries], [entries, vaultEntries]);
  const { conceptMap, godNodes } = useConceptGraph();
  const { isDark, toggleTheme } = useTheme();
  const { adminFlags } = useAdminDevMode();
  const ff = (key: FeatureFlagKey) => isFeatureEnabled(key, adminFlags);
  const visibleNavViews = NAV_VIEWS.filter(
    (v) => !(v.id in FEATURE_FLAGS) || ff(v.id as FeatureFlagKey)
  );

  // If the active view gets disabled, fall back to memory
  useEffect(() => {
    if (appShell.view in FEATURE_FLAGS && !ff(appShell.view as FeatureFlagKey)) {
      appShell.setView("memory");
    }
  }, [adminFlags, appShell.view, appShell.setView]);

  // Index concept names into the search index so grid search finds entries by concept
  useEffect(() => {
    if (!conceptMap) return;
    Object.entries(conceptMap).forEach(([entryId, concepts]) => {
      indexEntryConcepts(entryId, concepts);
    });
  }, [conceptMap]);

  // L-13: Cmd/Ctrl+N → open CaptureSheet (Cmd+K handled by OmniSearch, Escape by each modal)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        appShell.setShowCapture(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appShell.setShowCapture]);

  return (
    <>
      <div className="synapse-bg" />
      <div className="grain" />
      <DesktopSidebar
        activeBrainName={activeBrain?.name || "Everion"}
        view={appShell.view}
        onNavigate={(id) => {
          appShell.setSelected(null);
          appShell.setShowCapture(false);
          appShell.setView(id);
        }}
        onCapture={() => appShell.setShowCapture(true)}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        isOnline={isOnline}
        pendingCount={pendingCount}
        entryCount={entries.length}
        onShowCreateBrain={() => {}}
        navViews={visibleNavViews}
        searchInput={appShell.searchInput}
        onSearchChange={appShell.setSearchInput}
      >
      </DesktopSidebar>

      <div className="w-full overflow-x-hidden">
        <div className="bg-background lg:ml-60 lg:max-w-[calc(100vw-240px)] min-h-dvh">
          <MobileHeader
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
          </MobileHeader>

          {appShell.view === "memory" && nudge && (
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

          <OmniSearch
            entries={allEntries}
            onSelect={handleEntrySelect}
            onNavigate={appShell.setView}
            showGraph={ff("graph")}
            concepts={godNodes.map((c: any) => ({
              id: c.id,
              label: c.label,
              count: Array.isArray(c.source_entries) ? c.source_entries.length : undefined,
              source_entries: c.source_entries,
            }))}
          />
          <div key={appShell.view} className="animate-view-enter">
            {(appShell.view === "memory" || appShell.view === "timeline") && (
              <>
                {/* Memory top bar — title + inline search + Remember */}
                <header
                  className="memory-topbar hidden lg:flex"
                  style={{
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "18px 32px",
                    borderBottom: "1px solid var(--line-soft)",
                    minHeight: 80,
                    background: "var(--bg)",
                    gap: 20,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <h1
                      className="f-serif"
                      style={{
                        fontSize: 28,
                        fontWeight: 450,
                        letterSpacing: "-0.015em",
                        lineHeight: 1.1,
                        margin: 0,
                        color: "var(--ink)",
                      }}
                    >
                      Memory
                    </h1>
                    <div
                      className="f-serif"
                      style={{
                        fontSize: 14,
                        color: "var(--ink-faint)",
                        fontStyle: "italic",
                        marginTop: 4,
                      }}
                    >
                      {entriesLoaded && entries.length > 0
                        ? `${entries.length} entries`
                        : "everything you've written down."}
                    </div>
                  </div>
                  <button
                    className="design-btn-primary press"
                    onClick={() => appShell.setShowCapture(true)}
                    style={{ borderRadius: 6 }}
                  >
                    <svg
                      width="14" height="14"
                      fill="none" stroke="currentColor" strokeWidth="1.5"
                      strokeLinecap="round" strokeLinejoin="round"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Capture
                  </button>
                </header>

                {/* Filter row — Grid/Timeline + type pills + sort */}
                <div
                  className="memory-filter-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 32px",
                    borderBottom: "1px solid var(--line-soft)",
                    background: "var(--bg)",
                    flexWrap: "wrap",
                  }}
                >
                  {/* Grid / List / Timeline segmented */}
                  <div
                    style={{
                      display: "inline-flex",
                      padding: 3,
                      background: "var(--surface-low)",
                      border: "1px solid var(--line-soft)",
                      borderRadius: 8,
                      gap: 2,
                      flexShrink: 0,
                    }}
                  >
                    {[
                      { id: "memory-grid", label: "Grid" },
                      { id: "memory-list", label: "List" },
                      { id: "timeline", label: "Timeline" },
                    ].map((v) => {
                      const active =
                        v.id === "timeline"
                          ? appShell.view === "timeline"
                          : v.id === "memory-grid"
                            ? appShell.view === "memory" && appShell.gridViewMode === "grid"
                            : appShell.view === "memory" && appShell.gridViewMode === "list";
                      return (
                        <button
                          key={v.id}
                          onClick={() => {
                            appShell.setSelected(null);
                            if (v.id === "timeline") {
                              appShell.setView("timeline");
                            } else if (v.id === "memory-grid") {
                              appShell.setView("memory");
                              appShell.setGridViewMode("grid");
                            } else {
                              appShell.setView("memory");
                              appShell.setGridViewMode("list");
                            }
                          }}
                          className="press"
                          aria-pressed={active}
                          style={{
                            padding: "6px 14px",
                            minHeight: 28,
                            borderRadius: 6,
                            fontFamily: "var(--f-sans)",
                            fontSize: 13,
                            fontWeight: 500,
                            background: active ? "var(--surface-high)" : "transparent",
                            color: active ? "var(--ink)" : "var(--ink-faint)",
                            border: active ? "1px solid var(--line-soft)" : "1px solid transparent",
                            cursor: "pointer",
                            transition: "all 180ms",
                          }}
                        >
                          {v.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* vertical rule */}
                  <span
                    aria-hidden="true"
                    style={{ width: 1, height: 22, background: "var(--line-soft)", flexShrink: 0 }}
                  />

                  {/* Type pills */}
                  <div
                    className="scrollbar-hide"
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      overflowX: "auto",
                      minWidth: 0,
                    }}
                  >
                    {["all", "note", "link", "reminder", "idea", "contact", "file"].map((t) => {
                      const active = appShell.gridFilters.type === t;
                      return (
                        <button
                          key={t}
                          onClick={() =>
                            appShell.setGridFilters({
                              ...appShell.gridFilters,
                              type: t,
                              brainId: activeBrain?.id,
                            })
                          }
                          className="press f-sans"
                          style={{
                            flexShrink: 0,
                            padding: "0 14px",
                            height: 32,
                            minHeight: 32,
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: 500,
                            background: active ? "var(--ember-wash)" : "var(--surface)",
                            color: active ? "var(--ember)" : "var(--ink-soft)",
                            border: `1px solid ${active ? "var(--ember)" : "var(--line-soft)"}`,
                            cursor: "pointer",
                            transition: "all 180ms",
                          }}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ flex: 1 }} />

                  {/* Sort cycle */}
                  <button
                    className="design-btn-ghost press"
                    onClick={() => {
                      const order: Array<"newest" | "oldest" | "pinned"> = [
                        "newest",
                        "oldest",
                        "pinned",
                      ];
                      const idx = order.indexOf(appShell.gridFilters.sort as any);
                      const next = order[(idx + 1) % order.length];
                      appShell.setGridFilters({
                        ...appShell.gridFilters,
                        sort: next,
                        brainId: activeBrain?.id,
                      });
                    }}
                    style={{ fontSize: 13, height: 32, minHeight: 32, padding: "0 10px" }}
                  >
                    <svg
                      width="14" height="14"
                      fill="none" stroke="currentColor" strokeWidth="1.5"
                      strokeLinecap="round" strokeLinejoin="round"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3" />
                    </svg>
                    {appShell.gridFilters.sort === "oldest"
                      ? "Oldest first"
                      : appShell.gridFilters.sort === "pinned"
                        ? "Pinned first"
                        : "Recent first"}
                  </button>
                </div>

                {appShell.view === "timeline" && ff("timeline") && (
                  <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:pb-8 pt-4 pb-32">
                    <VirtualTimeline
                      sorted={sortedTimeline}
                      setSelected={handleEntrySelect}
                      typeIcons={appShell.typeIcons}
                    />
                  </div>
                )}
                {appShell.view === "memory" && <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:pb-8 pt-4 pb-32 space-y-3">

                {!entriesLoaded ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <SkeletonCard count={6} />
                  </div>
                ) : entries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
                    <div
                      style={{
                        width: 56, height: 56, borderRadius: "50%",
                        background: "var(--ember-wash)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <svg
                        width="24" height="24"
                        fill="none" stroke="currentColor" strokeWidth="1.5"
                        strokeLinecap="round" strokeLinejoin="round"
                        viewBox="0 0 24 24"
                        style={{ color: "var(--ember)" }}
                      >
                        <path d="M5 19c3-9 8-14 14-14-1 6-4 12-12 14M8 12l4 4"/>
                      </svg>
                    </div>
                    <h2
                      className="f-serif"
                      style={{
                        fontSize: 28, fontWeight: 400, letterSpacing: "-0.01em",
                        color: "var(--ink)", margin: 0,
                      }}
                    >
                      Nothing yet. That's fine.
                    </h2>
                    <p
                      className="f-serif"
                      style={{
                        fontSize: 16, fontStyle: "italic",
                        color: "var(--ink-soft)", margin: 0,
                        maxWidth: 360, lineHeight: 1.5,
                      }}
                    >
                      Remember something.
                    </p>
                    <button
                      onClick={() => appShell.setShowCapture(true)}
                      className="design-btn-primary press"
                      style={{ marginTop: 8 }}
                    >
                      Capture a thought
                    </button>
                  </div>
                ) : filtered.length > 0 ? (
                  <>
                    <VirtualGrid
                      filtered={filtered}
                      setSelected={appShell.selectMode ? () => {} : handleEntrySelect}
                      typeIcons={appShell.typeIcons}
                      onPin={(e) => e.type !== "secret" && handleUpdate(e.id, { pinned: !e.pinned })}
                      onDelete={(e) => e.type !== "secret" && handleDelete(e.id)}
                      selectMode={appShell.selectMode}
                      selectedIds={appShell.selectedIds}
                      onToggleSelect={appShell.toggleSelectId}
                      viewMode={appShell.gridViewMode}
                      conceptMap={conceptMap}
                    />
                    {appShell.selectMode && appShell.selectedIds.size > 0 && (
                      <BulkActionBar
                        selectedIds={appShell.selectedIds}
                        entries={entries}
                        brains={brains}
                        onDone={(updated) => {
                          setEntries((prev) =>
                            prev.map((e) => updated.find((u) => u.id === e.id) ?? e),
                          );
                          appShell.toggleSelectMode();
                        }}
                        onCancel={appShell.toggleSelectMode}
                      />
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                    <h3
                      className="f-serif"
                      style={{
                        fontSize: 22, fontWeight: 450, letterSpacing: "-0.005em",
                        color: "var(--ink)", margin: 0,
                      }}
                    >
                      nothing matches.
                    </h3>
                    <p
                      className="f-serif"
                      style={{
                        fontSize: 15, fontStyle: "italic",
                        color: "var(--ink-faint)", margin: 0, maxWidth: 320, lineHeight: 1.5,
                      }}
                    >
                      try a looser word. or a feeling.
                    </p>
                    <button
                      onClick={() => appShell.setShowCapture(true)}
                      className="design-btn-secondary press"
                      style={{ marginTop: 8 }}
                    >
                      Capture something new
                    </button>
                  </div>
                )}
                </div>}
              </>
            )}

            {appShell.view === "chat" && ff("chat") && (
              <Suspense fallback={<Loader />}>
                <ChatView brainId={activeBrain?.id} />
              </Suspense>
            )}
            {appShell.view === "graph" && ff("graph") && (
              <Suspense fallback={<Loader />}>
                <GraphView openEntry={setSelected} />
              </Suspense>
            )}
            {appShell.view === "todos" && ff("todos") && (
              <Suspense fallback={<Loader />}>
                <TodoView entries={entries} typeIcons={appShell.typeIcons} activeBrainId={activeBrain?.id} />
              </Suspense>
            )}
            {appShell.view === "vault" && ff("vault") && (
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
            {appShell.view === "settings" && (
              <SettingsView
                onNavigate={appShell.setView}
                unenrichedDetails={unenrichedDetails}
                enriching={enriching}
                enrichProgress={enrichProgress}
                enrichErrors={enrichErrors}
                enrichCurrentEntry={enrichCurrentEntry}
                enrichLog={enrichLog}
                runBulkEnrich={runBulkEnrich}
              />
            )}
            {appShell.view === "capture" && (
              <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:pb-8 pt-4 pb-32">
                {(() => {
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
                  { id: "todos", label: "Todos", icon: NavIcon.todos },
                  { id: "memory", label: "Memory Grid", icon: NavIcon.grid },
                ] as { id: string; label: string; icon: ReactNode }[];
                return (
                  <div className="space-y-8">
                    {/* Welcome */}
                    <div>
                      <h2
                        className="f-serif"
                        style={{
                          fontSize: 32, fontWeight: 400, letterSpacing: "-0.015em",
                          color: "var(--ink)", margin: 0, lineHeight: 1.15,
                        }}
                      >
                        welcome back.
                      </h2>
                      <p
                        className="f-serif"
                        style={{
                          fontSize: 15, fontStyle: "italic",
                          color: "var(--ink-faint)", margin: "6px 0 0",
                        }}
                      >
                        {activeBrain?.name ?? "your brain"} · {entries.length}{" "}
                        {entries.length === 1 ? "entry" : "entries"}
                      </p>
                    </div>

                    {/* Quick actions */}
                    <div>
                      <div className="micro" style={{ marginBottom: 12 }}>Quick nav</div>
                      <div className="grid grid-cols-2 gap-3">
                        {quickActions.map((v) => (
                          <button
                            key={v.id}
                            onClick={() => appShell.setView(v.id)}
                            className="press design-card"
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-start",
                              gap: 10,
                              padding: 16,
                              textAlign: "left",
                              cursor: "pointer",
                            }}
                          >
                            <span style={{ color: "var(--ink-faint)" }}>{v.icon}</span>
                            <span
                              className="f-serif"
                              style={{ fontSize: 16, fontWeight: 450, color: "var(--ink)" }}
                            >
                              {v.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Recent activity */}
                    {recentEntries.length > 0 && (
                      <div>
                        <div className="micro" style={{ marginBottom: 12 }}>Recent</div>
                        <div style={{ display: "grid", gap: 8 }}>
                          {recentEntries.map((entry) => (
                            <button
                              key={entry.id}
                              onClick={() => setSelected(entry)}
                              className="press design-card"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                padding: "12px 16px",
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              <span style={{ fontSize: 14 }} aria-hidden="true">
                                {appShell.typeIcons[entry.type] ?? "📝"}
                              </span>
                              <span
                                className="f-serif truncate flex-1"
                                style={{
                                  fontSize: 15, fontWeight: 450, color: "var(--ink)",
                                }}
                              >
                                {entry.title}
                              </span>
                              <span
                                className="f-sans"
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                  color: "var(--ink-faint)",
                                }}
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
            )}
          </div>

          <Suspense fallback={null}>
            {selectedVaultEntry && (
              <VaultRevealModal
                entry={selectedVaultEntry}
                cryptoKey={cryptoKey}
                onClose={() => setSelectedVaultEntry(null)}
                onVaultUnlock={handleVaultUnlock}
                onGoToVault={() => { setSelectedVaultEntry(null); appShell.setView("vault"); }}
              />
            )}
          </Suspense>

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
                typeIcons={appShell.typeIcons}
                onTypeIconChange={(type: string, icon: string) => {
                  registerTypeIcon(activeBrain?.id ?? "", type, icon);
                  appShell.refreshTypeIcons();
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

          {appShell.showOnboarding && (
            <OnboardingModal
              onComplete={(_selected, answeredItems, skippedQs) => {
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
                    (async () => {
                      const { PROMPTS } = await import("./config/prompts");
                      return callAI({
                        max_tokens: 800,
                        system: PROMPTS.QA_PARSE,
                        brainId: activeBrain?.id,
                        messages: [
                          { role: "user", content: `Question: ${item.q}\nAnswer: ${item.a}` },
                        ],
                      });
                    })()
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
                      .catch((err: Error) => console.error("[onboarding] AI parse failed", err));
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
                    localStorage.setItem("openbrain_onboarding_skipped", JSON.stringify(merged));
                  } catch (err) {
                    console.error("[OpenBrain]", err);
                  }
                }
                appShell.setShowOnboarding(false);
                appShell.setView("memory");
              }}
              brainId={activeBrain?.id}
            />
          )}

          <Suspense fallback={null}>
            <CaptureSheet
              isOpen={appShell.showCapture}
              onClose={() => { appShell.setShowCapture(false); }}
              onCreated={(e) => { handleCreated(e); }}
              brainId={activeBrain?.id}
              cryptoKey={cryptoKey}
              isOnline={isOnline}
              initialText={appShell.captureInitialText}
              onBackgroundFiles={(files) =>
                bgProcessFiles(files, activeBrain?.id, handleCreatedBulk)
              }
              onBackgroundSave={(entry) => {
                bgQueueDirectSave(entry, activeBrain?.id, handleCreated);
              }}
              onNavigate={(id) => {
                appShell.setShowCapture(false);
                appShell.setView(id);
              }}
            />
          </Suspense>
          {appShell.view !== "capture" && !appShell.showCapture && (
            <FloatingCaptureButton onClick={() => appShell.setShowCapture(true)} />
          )}
          <BottomNav
            activeView={appShell.view}
            onNavigate={(id) => {
              setSelected(null);
              appShell.setShowCapture(false);
              appShell.setView(id);
            }}
            onCapture={() => appShell.setShowCapture(true)}
          />
        </div>
      </div>
    </>
  );
}

// ─── Everion ─────────────────────────────────────────────────────────────────
// Orchestrates all hooks, provides contexts, and delegates rendering to
// EverionContent (which calls useConceptGraph inside ConceptGraphProvider).

export default function Everion({ initialShowCapture }: { initialShowCapture?: boolean } = {}) {
  const { brains, activeBrain, setActiveBrain, refresh, loading: brainsLoading } =
    useBrainHook();

  const patchEntryIdRef = useRef<(tempId: string, realId: string) => void>(() => {});

  const { isOnline, pendingCount, sync, refreshCount, failedOps, clearFailedOps } = useOfflineSync({
    onEntryIdUpdate: useCallback(
      (tempId: string, realId: string) => patchEntryIdRef.current(tempId, realId),
      [],
    ),
  });

  const isOnlineRef = useRef(isOnline);
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    if (isOnline) sync();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const appShell = useAppShell({ initialShowCapture, activeBrainId: activeBrain?.id });

  const dataLayer = useDataLayer({
    activeBrainId: activeBrain?.id,
    setSelected: appShell.setSelected,
    isOnline,
    isOnlineRef,
    refreshCount,
  });

  patchEntryIdRef.current = dataLayer.patchEntryId;

  // Single-user app — all brains are owned by the authenticated user.
  // If multi-user support is added, wire this to brain membership/ownership.
  const canWrite = true;
  const { nudge, setNudge } = useNudge({
    entriesLoaded: dataLayer.entriesLoaded,
    entries: dataLayer.entries,
    activeBrain,
  });

  const { tasks: bgTasks, processFiles: bgProcessFiles, queueDirectSave: bgQueueDirectSave, dismissTask: bgDismissTask, dismissAll: bgDismissAll } =
    useBackgroundCapture();

  const allDisplayEntries = useMemo(
    () => [...dataLayer.entries, ...dataLayer.vaultEntries],
    [dataLayer.entries, dataLayer.vaultEntries],
  );

  const filtered = useMemo(() => {
    let r = allDisplayEntries;
    if (appShell.workspace !== "all")
      r = r.filter((e) => {
        const ws = inferWorkspace(e);
        return ws === appShell.workspace || ws === "both";
      });
    if (appShell.search) {
      const ids = searchIndex(appShell.search);
      if (ids) r = r.filter((e) => ids.has(e.id));
    }
    const result = applyEntryFilters(r, appShell.gridFilters);
    // When a search is active, override date/pinned sort with relevance ranking
    if (appShell.search) {
      result.sort((a, b) => scoreEntry(b, appShell.search) - scoreEntry(a, appShell.search));
    }
    return result;
  }, [appShell.search, appShell.gridFilters, appShell.workspace, allDisplayEntries]);

  const sortedTimeline = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
      ),
    [filtered],
  );

  const availableEntryTypes = useMemo(
    () => getEntryTypes(dataLayer.entries),
    [dataLayer.entries],
  );

  const entriesValue = useMemo(
    () => ({
      entries: dataLayer.entries,
      entriesLoaded: dataLayer.entriesLoaded,
      selected: appShell.selected,
      setSelected: appShell.setSelected,
      handleDelete: dataLayer.handleDelete,
      handleUpdate: dataLayer.handleUpdate,
      refreshEntries: dataLayer.refreshEntries,
    }),
    [
      dataLayer.entries,
      dataLayer.entriesLoaded,
      appShell.selected,
      appShell.setSelected,
      dataLayer.handleDelete,
      dataLayer.handleUpdate,
      dataLayer.refreshEntries,
    ],
  );

  const brainValue = useMemo(
    () => ({
      activeBrain,
      brains,
      setActiveBrain,
      refresh,
    }),
    [activeBrain, brains, setActiveBrain, refresh],
  );

  if (brainsLoading)
    return (
      <>
        <LoadingScreen />
        <button
          onClick={() => appShell.setShowCapture(true)}
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
        <ConceptGraphProvider activeBrainId={activeBrain?.id}>
          <EverionContent
            appShell={appShell}
            links={dataLayer.links}
            cryptoKey={dataLayer.cryptoKey}
            handleVaultUnlock={dataLayer.handleVaultUnlock}
            enriching={dataLayer.enriching}
            enrichProgress={dataLayer.enrichProgress}
            enrichErrors={dataLayer.enrichErrors}
            enrichCurrentEntry={dataLayer.enrichCurrentEntry}
            enrichLog={dataLayer.enrichLog}
            runBulkEnrich={dataLayer.runBulkEnrich}
            unenrichedCount={dataLayer.unenrichedCount}
            unenrichedDetails={dataLayer.unenrichedDetails}
            handleCreated={dataLayer.handleCreated}
            handleCreatedBulk={dataLayer.handleCreatedBulk}
            lastAction={dataLayer.lastAction}
            setLastAction={dataLayer.setLastAction}
            saveError={dataLayer.saveError}
            setSaveError={dataLayer.setSaveError}
            handleUndo={dataLayer.handleUndo}
            commitPendingDelete={dataLayer.commitPendingDelete}
            setEntries={dataLayer.setEntries}
            isOnline={isOnline}
            pendingCount={pendingCount}
            failedOps={failedOps}
            clearFailedOps={clearFailedOps}
            canWrite={canWrite}
            nudge={nudge}
            setNudge={setNudge}
            bgTasks={bgTasks}
            bgProcessFiles={bgProcessFiles}
            bgQueueDirectSave={bgQueueDirectSave}
            bgDismissTask={bgDismissTask}
            bgDismissAll={bgDismissAll}
            filtered={filtered}
            sortedTimeline={sortedTimeline}
            availableEntryTypes={availableEntryTypes}
            vaultEntries={dataLayer.vaultEntries}
          />
        </ConceptGraphProvider>
      </BrainContext.Provider>
    </EntriesContext.Provider>
  );
}
