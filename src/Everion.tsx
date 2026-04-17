import {
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
import { PROMPTS } from "./config/prompts";
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
import FloatingCaptureButton from "./components/FloatingCaptureButton";
import { useAppShell, type AppShellState } from "./hooks/useAppShell";
import { useDataLayer } from "./hooks/useDataLayer";
import { useBrain } from "./context/BrainContext";
import { useEntries } from "./context/EntriesContext";
import type { Entry } from "./types";

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
function Loader() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SkeletonCard count={3} />
    </div>
  );
}

const NAV_VIEWS = [
  { id: "memory", l: "Memory", ic: "▦" },
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
}

function EverionContent({
  appShell,
  links,
  cryptoKey,
  handleVaultUnlock,
  enriching,
  enrichProgress,
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
}: EverionContentProps) {
  const { activeBrain, brains, setActiveBrain, refresh } = useBrain();
  const { entries, entriesLoaded, selected, setSelected, handleDelete, handleUpdate } = useEntries();
  const { conceptMap, godNodes } = useConceptGraph();
  const { isDark, toggleTheme } = useTheme();

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
        navViews={NAV_VIEWS}
      >
      </DesktopSidebar>

      <div className="w-full overflow-x-hidden">
        <div className="bg-background lg:ml-72 lg:max-w-[calc(75vw)] min-h-dvh">
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

          <OmniSearch entries={entries} onSelect={setSelected} onNavigate={appShell.setView} />

          <div key={appShell.view} className="animate-view-enter mx-auto max-w-6xl px-4 sm:px-6 lg:pb-8 pt-4 pb-32">
            {appShell.view === "memory" && (
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
                    value={appShell.searchInput}
                    onChange={(e) => appShell.setSearchInput(e.target.value)}
                    placeholder="Search memories..."
                    className="text-on-surface placeholder:text-on-surface-variant/40 flex-1 border-none bg-transparent text-sm outline-none"
                  />
                </div>
                <GridFilters
                  filters={appShell.gridFilters}
                  availableTypes={availableEntryTypes}
                  typeIcons={appShell.typeIcons}
                  onChange={(f) => appShell.setGridFilters({ ...f, brainId: activeBrain?.id })}
                  viewMode={appShell.gridViewMode}
                  onViewModeChange={(mode) => {
                    appShell.setGridViewMode(mode);
                    localStorage.setItem("openbrain_viewmode", mode);
                  }}
                  activeCount={
                    [
                      appShell.gridFilters.type !== "all",
                      appShell.gridFilters.date !== "all",
                      appShell.gridFilters.sort !== "newest",
                      !!appShell.gridFilters.concept,
                    ].filter(Boolean).length
                  }
                  concepts={godNodes}
                />

                {!entriesLoaded ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <SkeletonCard count={6} />
                  </div>
                ) : entries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                    <div className="text-5xl">🧠</div>
                    <h2
                      className="text-on-surface text-xl font-bold"
                      style={{ fontFamily: "'Lora', Georgia, serif" }}
                    >
                      Your memory is blank. Start filling it.
                    </h2>
                    <p className="text-on-surface-variant max-w-sm text-sm">
                      Every thought you capture makes your brain smarter. Try one now.
                    </p>
                    <button
                      onClick={() => appShell.setShowCapture(true)}
                      className="press-scale text-on-primary rounded-xl px-6 py-3 text-sm font-semibold"
                      style={{ background: "var(--color-primary)" }}
                    >
                      Capture a thought
                    </button>
                  </div>
                ) : filtered.length > 0 ? (
                  <>
                    <VirtualGrid
                      filtered={filtered}
                      setSelected={appShell.selectMode ? () => {} : setSelected}
                      typeIcons={appShell.typeIcons}
                      onPin={(e) => handleUpdate(e.id, { pinned: !e.pinned })}
                      onDelete={(e) => handleDelete(e.id)}
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
                    <div className="text-4xl opacity-40">🔍</div>
                    <p className="text-on-surface font-bold">Nothing matches that filter.</p>
                    <p className="text-on-surface-variant max-w-xs text-sm">
                      Try a different search, or capture something new.
                    </p>
                    <button
                      onClick={() => appShell.setShowCapture(true)}
                      className="press-scale text-on-primary rounded-xl px-5 py-2.5 text-sm font-semibold"
                      style={{ background: "var(--color-primary)" }}
                    >
                      Capture a thought
                    </button>
                  </div>
                )}
              </div>
            )}

            {appShell.view === "todos" && (
              <Suspense fallback={<Loader />}>
                <TodoView entries={entries} typeIcons={appShell.typeIcons} />
              </Suspense>
            )}
            {appShell.view === "timeline" && (
              <VirtualTimeline
                sorted={sortedTimeline}
                setSelected={setSelected}
                typeIcons={appShell.typeIcons}
              />
            )}
            {appShell.view === "vault" && (
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
            {appShell.view === "settings" && <SettingsView onNavigate={appShell.setView} />}
            {appShell.view === "capture" &&
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
                  { id: "todos", label: "Todos", icon: NavIcon.todos },
                  { id: "memory", label: "Memory Grid", icon: NavIcon.grid },
                ] as { id: string; label: string; icon: ReactNode }[];
                return (
                  <div className="space-y-6">
                    {/* Welcome */}
                    <div
                      className="rounded-3xl border px-5 py-4"
                      style={{
                        background:
                          "color-mix(in oklch, var(--color-primary) 8%, var(--color-surface))",
                        borderColor: "color-mix(in oklch, var(--color-primary) 18%, transparent)",
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
                            onClick={() => appShell.setView(v.id)}
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
                                {appShell.typeIcons[entry.type] ?? "📝"}
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

  const canWrite = true;
  const { nudge, setNudge } = useNudge({
    entriesLoaded: dataLayer.entriesLoaded,
    entries: dataLayer.entries,
    activeBrain,
  });

  const { tasks: bgTasks, processFiles: bgProcessFiles, queueDirectSave: bgQueueDirectSave, dismissTask: bgDismissTask, dismissAll: bgDismissAll } =
    useBackgroundCapture();

  const filtered = useMemo(() => {
    let r = dataLayer.entries;
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
  }, [appShell.search, appShell.gridFilters, appShell.workspace, dataLayer.entries]);

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
          />
        </ConceptGraphProvider>
      </BrainContext.Provider>
    </EntriesContext.Provider>
  );
}
