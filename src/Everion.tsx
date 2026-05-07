import { useMemo, useRef, useEffect, useCallback, useState, lazy, Suspense } from "react";
import { useTheme } from "./ThemeContext";
import { authFetch } from "./lib/authFetch";
import { registerTypeIcon } from "./lib/typeIcons";
import { useBrain as useBrainHook } from "./hooks/useBrain";
import { useOfflineSync } from "./hooks/useOfflineSync";
import { useNudge } from "./hooks/useNudge";
import { searchIndex, indexEntryConcepts, scoreEntry } from "./lib/searchIndex";
import { applyEntryFilters, getEntryTypes } from "./lib/entryFilters";
import { inferWorkspace } from "./lib/workspaceInfer";
import { EntriesContext } from "./context/EntriesContext";
import { BrainContext } from "./context/BrainContext";
import { ConceptGraphProvider, useConceptGraph } from "./context/ConceptGraphContext";
import { NudgeBanner } from "./components/NudgeBanner";
import { UsageWarningBanner } from "./components/UsageWarningBanner";
import { BackgroundTaskToast } from "./components/BackgroundTaskToast";
import { BackgroundOpsToast } from "./components/BackgroundOpsToast";
import { BackgroundOpsProvider } from "./hooks/useBackgroundOps";
import { useBackgroundCapture } from "./hooks/useBackgroundCapture";
import { useStagedCount } from "./hooks/useStagedCount";
import { VirtualGrid, VirtualTimeline } from "./components/EntryList";
import BulkActionBar from "./components/BulkActionBar";
import MergePreviewModal, { type MergePreviewShape } from "./components/MergePreviewModal";
import OnboardingModal from "./components/OnboardingModal";
import OfflineBanner from "./components/OfflineBanner";
import BottomNav from "./components/BottomNav";
import MobileMoreMenu from "./components/MobileMoreMenu";
import MobileHeader from "./components/MobileHeader";
// CaptureSheet is the heaviest single piece of the signed-in shell — voice
// recorder, NLP parser, file extraction, AI calls. We don't want it on the
// critical path, but we DO want it parsed and ready by the time the user
// taps the capture button. Lazy + idle-prefetch:
//   • lazy() keeps it out of the first paint chunk
//   • prefetchCaptureSheet() called below from a useEffect after mount runs
//     the import on the next idle frame so the chunk is already cached and
//     parsed when the user opens it (sub-50ms instead of 100-500ms).
const captureSheetImport = () => import("./components/CaptureSheet");
const CaptureSheet = lazy(captureSheetImport);
function prefetchCaptureSheet() {
  // requestIdleCallback isn't on iOS Safari (still). Fall back to setTimeout
  // with a small delay so the prefetch runs after the first useful paint
  // without blocking the layout commit.
  type Idle = (cb: () => void, opts?: { timeout?: number }) => number;
  const ric: Idle | undefined =
    typeof window !== "undefined"
      ? (window as unknown as { requestIdleCallback?: Idle }).requestIdleCallback
      : undefined;
  if (ric) ric(() => void captureSheetImport().catch(() => {}), { timeout: 2000 });
  else setTimeout(() => void captureSheetImport().catch(() => {}), 1500);
}
import DesktopSidebar from "./components/DesktopSidebar";
import DesktopHeader from "./components/DesktopHeader";
import LoadingScreen from "./components/LoadingScreen";
import SkeletonCard from "./components/SkeletonCard";
import OmniSearch from "./components/OmniSearch";
import SettingsView from "./views/SettingsView";
const GraphView = lazy(() => import("./views/GraphView"));
const GmailStagingInbox = lazy(() => import("./components/settings/GmailStagingInbox"));
import FloatingCaptureButton from "./components/FloatingCaptureButton";
import { Button } from "./components/ui/button";
import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import MemoryHeader from "./MemoryHeader";
import CaptureWelcomeScreen from "./CaptureWelcomeScreen";
import ErrorBoundary from "./ErrorBoundary";
import ViewError from "./components/ViewError";
import { useNotifications } from "./hooks/useNotifications";
import { useAppShell, type AppShellState } from "./hooks/useAppShell";
import { useDataLayer } from "./hooks/useDataLayer";
import type { LastAction } from "./hooks/useEntryActions";
import type { OfflineOp } from "./types";
import type { BackgroundTask } from "./hooks/useBackgroundCapture";
import { useEntryRealtime } from "./hooks/useEntryRealtime";
import { useBrain } from "./context/BrainContext";
import { useEntries } from "./context/EntriesContext";
import type { Entry } from "./types";
import { useAdminDevMode } from "./hooks/useAdminDevMode";
import { isFeatureEnabled, FEATURE_FLAGS, type FeatureFlagKey } from "./lib/featureFlags";
import { syncTimezoneIfChanged } from "./lib/syncTimezone";
import { supabase } from "./lib/supabase";
import { trackNavViewActive } from "./lib/events";
import { AppLockGate } from "./components/AppLockGate";
import HomeView from "./views/HomeView";

// Retry dynamic imports once on failure (stale chunk hash after deploy)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
const ImportantMemoriesView = lazyRetry(() => import("./views/ImportantMemoriesView"));
const ChatView = lazyRetry(() => import("./views/ChatView"));
const ListsView = lazyRetry(() => import("./views/ListsView"));
const ContactsView = lazyRetry(() => import("./views/ContactsView"));
const VaultRevealModal = lazyRetry(() => import("./components/VaultRevealModal"));
function Loader() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SkeletonCard count={3} />
    </div>
  );
}

const NAV_VIEWS = [
  { id: "home", l: "Home", ic: "⌂" },
  { id: "memory", l: "Memory", ic: "▦" },
  { id: "chat", l: "Chat", ic: "💬" },
  { id: "graph", l: "Graph", ic: "✦" },
  { id: "todos", l: "Schedule", ic: "✓" },
  { id: "lists", l: "Lists", ic: "≡" },
  { id: "contacts", l: "Contacts", ic: "◉" },
  { id: "memories", l: "Important", ic: "★" },
  { id: "vault", l: "Vault", ic: "🔐" },
];

// ─── EverionContent ──────────────────────────────────────────────────────────
// Reads context (BrainContext, EntriesContext, ConceptGraphContext) + receives
// appShell and the few values that don't belong in any context.

interface EverionContentProps {
  appShell: AppShellState;
  cryptoKey: CryptoKey | null;
  handleVaultUnlock: (key: CryptoKey | null) => void;
  handleCreated: (entry: Entry) => void;
  handleCreatedBulk: (entry: Entry) => void;
  lastAction: LastAction | null;
  setLastAction: (a: LastAction | null) => void;
  saveError: string | null;
  setSaveError: (e: string | null) => void;
  handleUndo: () => void;
  commitPendingDelete: () => void;
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  isOnline: boolean;
  pendingCount: number;
  failedOps: OfflineOp[];
  clearFailedOps: () => void;
  canWrite: boolean;
  nudge: string | null;
  setNudge: (n: string | null) => void;
  bgTasks: BackgroundTask[];
  bgProcessFiles: (
    files: File[],
    brainId: string | undefined,
    onCreated: (e: Entry) => void,
  ) => void;
  bgQueueDirectSave: (
    entry: {
      title: string;
      content: string;
      type: string;
      tags: string[];
      metadata: Record<string, unknown>;
      rawContent?: string;
    },
    brainId: string | undefined,
    onCreated: (e: Entry) => void,
  ) => void;
  bgDismissTask: (id: string) => void;
  bgDismissAll: () => void;
  filtered: Entry[];
  sortedTimeline: Entry[];
  availableEntryTypes: string[];
  vaultEntries: Entry[];
  loadError: string | null;
}

function EverionContent({
  appShell,
  cryptoKey,
  handleVaultUnlock,
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
  availableEntryTypes: _availableEntryTypes,
  vaultEntries,
  loadError,
}: EverionContentProps) {
  const { activeBrain, brains, setActiveBrain: _setActiveBrain, refresh: _refresh } = useBrain();
  const { entries, entriesLoaded, selected, setSelected, handleDelete, handleUpdate } =
    useEntries();
  const notifs = useNotifications();
  const [selectedVaultEntry, setSelectedVaultEntry] = useState<Entry | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  // Save errors are transient — surface via sonner instead of inline banner.
  useEffect(() => {
    if (!saveError) return;
    const id = toast.error(saveError, {
      duration: 6000,
      onDismiss: () => setSaveError(null),
      onAutoClose: () => setSaveError(null),
    });
    return () => {
      toast.dismiss(id);
    };
  }, [saveError, setSaveError]);

  // Soft-delete undo — replaces the bespoke <UndoToast/> component with a
  // Sonner action toast. lastAction.type === "delete" means an entry has
  // been removed from the in-memory list but the DB row hasn't been hard-
  // deleted yet (commitPendingDelete fires when the toast auto-closes).
  // 5-second window matches the previous UNDO_TOAST_MUTATE_MS duration.
  useEffect(() => {
    if (!lastAction || lastAction.type !== "delete") return;
    const id = toast("Entry deleted", {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          handleUndo();
          setLastAction(null);
        },
      },
      onAutoClose: () => {
        commitPendingDelete();
        setLastAction(null);
      },
      onDismiss: () => {
        commitPendingDelete();
        setLastAction(null);
      },
    });
    return () => {
      toast.dismiss(id);
    };
  }, [lastAction, handleUndo, commitPendingDelete, setLastAction]);

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
  const stagedCount = useStagedCount();
  const { conceptMap, godNodes } = useConceptGraph();
  const { isDark, toggleTheme } = useTheme();
  const { isAdmin, adminFlags } = useAdminDevMode();
  const ff = (key: FeatureFlagKey) => isFeatureEnabled(key, adminFlags);
  const visibleNavViews = NAV_VIEWS.filter(
    (v) => !(v.id in FEATURE_FLAGS) || ff(v.id as FeatureFlagKey),
  );

  // If the active view gets disabled, fall back to memory
  useEffect(() => {
    if (appShell.view in FEATURE_FLAGS && !ff(appShell.view as FeatureFlagKey)) {
      appShell.setView("memory");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ff() and appShell are referentially fresh every render; depending on them would re-run this every render. adminFlags + appShell.view are the actual decision inputs.
  }, [adminFlags, appShell.view, appShell.setView]);

  // PostHog funnel — emit nav_view_active on every view change. Initial
  // "memory" mount also fires (from === undefined) so the first session
  // has a clean entry point in the dashboard.
  const prevViewRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const from = prevViewRef.current;
    if (from !== appShell.view) {
      trackNavViewActive({ view: appShell.view, from });
      prevViewRef.current = appShell.view;
    }
  }, [appShell.view]);

  // Auto-sync IANA timezone on mount AND on SIGNED_IN. Skip TOKEN_REFRESHED:
  // Supabase fires that every 5–30 min during a session, which spammed
  // /api/notification-prefs to the rate-limit ceiling under e2e and produced
  // 429 noise. The session-scoped sessionStorage gate inside
  // syncTimezoneIfChanged still handles legit duplicate calls within a
  // single page load.
  //
  // Same effect bootstraps RevenueCat on native platforms: configure once,
  // then logIn the Supabase user.id so the webhook (api/user-data.ts
  // handleRevenueCatWebhook) can resolve appUserID → user_profiles row.
  // No-op on web — that flow uses LemonSqueezy.
  useEffect(() => {
    syncTimezoneIfChanged();
    let revenueCatLoaded = false;
    (async () => {
      const { configureRevenueCat, loginRevenueCatUser, isNative } =
        await import("./lib/revenuecat");
      if (!isNative()) return;
      await configureRevenueCat();
      revenueCatLoaded = true;
      const { data } = await supabase.auth.getUser();
      if (data.user?.id) await loginRevenueCatUser(data.user.id);
    })().catch((err) => console.error("[everion] revenuecat bootstrap failed", err));

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN") {
        syncTimezoneIfChanged();
        if (revenueCatLoaded && session?.user?.id) {
          const { loginRevenueCatUser } = await import("./lib/revenuecat");
          await loginRevenueCatUser(session.user.id);
        }
      }
      if (event === "SIGNED_OUT" && revenueCatLoaded) {
        const { resetRevenueCatUser } = await import("./lib/revenuecat");
        await resetRevenueCatUser();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Gmail staging inbox modal — hoisted to app root so HomeView's
  // InboxTriageCard, the notification bell, and toasts can all open the
  // Tinder swipe UI directly without bouncing through Settings.
  const [stagingInboxOpen, setStagingInboxOpen] = useState(false);
  useEffect(() => {
    function handleOpenGmailInbox() {
      setStagingInboxOpen(true);
    }
    window.addEventListener("everion:open-gmail-inbox", handleOpenGmailInbox);
    return () => window.removeEventListener("everion:open-gmail-inbox", handleOpenGmailInbox);
  }, []);

  // Index concept names into the search index so grid search finds entries by concept
  useEffect(() => {
    if (!conceptMap) return;
    Object.entries(conceptMap).forEach(([entryId, concepts]) => {
      indexEntryConcepts(entryId, concepts);
    });
  }, [conceptMap]);

  // Cmd/Ctrl+K opens the capture sheet — matches the keyboard hint shown
  // on the floating capture button. Cmd/Ctrl+N kept as an alias for muscle
  // memory. Search now lives on Cmd/Ctrl+/, see OmniSearch.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "n")) {
        e.preventDefault();
        appShell.setShowCapture(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- appShell as a whole would invalidate this listener every render; only the setter is read.
  }, [appShell.setShowCapture]);

  // ── Merge session ────────────────────────────────────────────────────────
  // Lives at this scope so the preview fetch survives a modal close. User
  // can click "Hide — notify when ready"; the bar reappears, the LLM keeps
  // generating in this same async scope, and a sonner Review toast fires
  // the moment the response lands. No server-side draft persistence — a
  // tab close still kills the request, which is fine: cost is bounded
  // (one LLM call, ~few seconds typical).
  type MergeSession = {
    ids: string[];
    preview: MergePreviewShape | null;
    error: string | null;
    status: "loading" | "ready" | "error";
    modalOpen: boolean;
  };
  const [mergeSession, setMergeSession] = useState<MergeSession | null>(null);

  const startMerge = useCallback((ids: string[]) => {
    setMergeSession({
      ids,
      preview: null,
      error: null,
      status: "loading",
      modalOpen: true,
    });

    (async () => {
      try {
        const r = await authFetch("/api/entries?action=merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, preview: true }),
        });
        if (!r.ok) {
          const data = await r.json().catch(() => ({}) as { error?: string });
          throw new Error((data as { error?: string })?.error || `HTTP ${r.status}`);
        }
        const data = (await r.json()) as MergePreviewShape;
        setMergeSession((cur) => {
          // Stale response — a newer session replaced this one (or it was
          // cancelled). Drop the result.
          if (!cur || cur.ids !== ids) return cur;
          if (!cur.modalOpen) {
            toast.success("Merge ready to review", {
              description: data.title.slice(0, 80),
              duration: Infinity,
              action: {
                label: "Review",
                onClick: () =>
                  setMergeSession((s) => (s && s.ids === ids ? { ...s, modalOpen: true } : s)),
              },
            });
          }
          return { ...cur, preview: data, status: "ready" };
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to generate merge";
        setMergeSession((cur) => {
          if (!cur || cur.ids !== ids) return cur;
          if (!cur.modalOpen) {
            toast.error(`Merge failed: ${msg}`);
          }
          return { ...cur, error: msg, status: "error" };
        });
      }
    })();
  }, []);

  return (
    <>
      {/*
        Skip-to-main-content link — keyboard users can jump past the
        sidebar/header tree in one Tab. `sr-only` keeps it invisible until
        focused; `focus:not-sr-only` brings it into view as a styled chip.
        Counterpart `id="main-content"` is on the view-content wrapper below.
      */}
      <OfflineBanner isOnline={isOnline} pendingCount={pendingCount} />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only"
        style={{
          position: "fixed",
          top: 8,
          left: 8,
          zIndex: "var(--z-native-overlay)",
          padding: "8px 14px",
          background: "var(--ember-wash)",
          color: "var(--ember)",
          border: "1px solid color-mix(in oklch, var(--ember) 40%, transparent)",
          borderRadius: 8,
          fontFamily: "var(--f-sans)",
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Skip to main content
      </a>
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
        inboxCount={stagedCount}
        searchInput={appShell.searchInput}
        onSearchChange={appShell.setSearchInput}
      ></DesktopSidebar>

      {/* overflow-x-clip (not -hidden) is critical: -hidden makes the other
          axis become overflow-y:auto, which silently turns this div into a
          CSS scroll container. Any position:sticky descendant then binds
          to this container as its scroll ancestor — but the div has no
          bounded height, so it never actually scrolls; the body does. The
          headers ended up "sticking" to a non-scrolling container while
          the body scrolled past them, making them appear to scroll away
          on memory + timeline (the only views tall enough to need it).
          overflow-x:clip clips horizontal overflow without creating a
          scroll container, so sticky descendants bind to the body and
          behave correctly. */}
      <div className="app-shell-fixed w-full overflow-x-clip">
        <div className="bg-background flex h-full flex-col overflow-hidden lg:ml-60 lg:max-w-[calc(100vw-240px)]">
          <MobileHeader
            onToggleTheme={toggleTheme}
            isDark={isDark}
            isOnline={isOnline}
            pendingCount={pendingCount}
            onSearch={() =>
              // OmniSearch listens on Cmd/Ctrl+/ since capture moved to Cmd+K.
              window.dispatchEvent(
                new KeyboardEvent("keydown", { key: "/", metaKey: true, bubbles: true }),
              )
            }
            onNavigate={appShell.setView}
            notifications={notifs.notifications}
            unreadCount={notifs.unreadCount}
            onDismissNotification={notifs.dismiss}
            onMarkNotificationRead={notifs.markRead}
            onDismissAllNotifications={notifs.dismissAll}
            onAcceptMerge={notifs.acceptMerge}
          ></MobileHeader>

          <DesktopHeader
            searchInput={appShell.searchInput}
            onSearchChange={appShell.setSearchInput}
            onNavigate={appShell.setView}
            isDark={isDark}
            onToggleTheme={toggleTheme}
            notifications={notifs.notifications}
            unreadCount={notifs.unreadCount}
            onDismissNotification={notifs.dismiss}
            onMarkNotificationRead={notifs.markRead}
            onDismissAllNotifications={notifs.dismissAll}
            onAcceptMerge={notifs.acceptMerge}
          />

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
          {(appShell.view === "memory" || appShell.view === "chat") && (
            <UsageWarningBanner onNavigate={appShell.setView} />
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
              <Button
                variant="ghost"
                size="xs"
                onClick={() => clearFailedOps()}
                className="text-on-surface-variant hover:text-on-surface press-scale text-xs"
              >
                Dismiss
              </Button>
            </div>
          )}

          <OmniSearch
            entries={allEntries}
            onSelect={handleEntrySelect}
            onNavigate={appShell.setView}
            showGraph={ff("graph")}
            concepts={godNodes.map((c) => ({
              id: c.id,
              label: c.label,
              count: Array.isArray(c.source_entries) ? c.source_entries.length : undefined,
              source_entries: c.source_entries,
            }))}
          />
          <div
            id="main-content"
            key={appShell.view}
            className="animate-view-enter flex-1 overflow-y-auto"
            tabIndex={-1}
          >
            {(appShell.view === "memory" || appShell.view === "timeline") && (
              <>
                <MemoryHeader
                  appShell={appShell}
                  entries={entries}
                  entriesLoaded={entriesLoaded}
                  activeBrainId={activeBrain?.id}
                  notifications={notifs.notifications}
                  unreadCount={notifs.unreadCount}
                  onDismissNotification={notifs.dismiss}
                  onMarkNotificationRead={notifs.markRead}
                  onDismissAllNotifications={notifs.dismissAll}
                  onAcceptMerge={notifs.acceptMerge}
                />

                {appShell.view === "timeline" && ff("timeline") && (
                  <div className="mx-auto max-w-4xl px-4 pt-4 pb-32 sm:px-6 lg:pb-8">
                    <VirtualTimeline
                      sorted={sortedTimeline}
                      setSelected={handleEntrySelect}
                      typeIcons={appShell.typeIcons}
                    />
                  </div>
                )}
                {appShell.view === "memory" && (
                  <div className="mx-auto max-w-6xl space-y-3 px-4 pt-4 pb-32 sm:px-6 lg:pb-8">
                    {!entriesLoaded ? (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <SkeletonCard count={6} />
                      </div>
                    ) : entries.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
                        {isAdmin && loadError && (
                          <div
                            className="w-full rounded-xl border px-4 py-3 text-left font-mono text-xs"
                            style={{
                              background: "color-mix(in oklch, var(--color-error) 8%, transparent)",
                              borderColor:
                                "color-mix(in oklch, var(--color-error) 25%, transparent)",
                              color: "var(--color-error)",
                            }}
                          >
                            <strong>Admin — entries load error:</strong> {loadError}
                          </div>
                        )}
                        <div
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: "50%",
                            background: "var(--ember-wash)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <svg
                            width="24"
                            height="24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            viewBox="0 0 24 24"
                            style={{ color: "var(--ember)" }}
                          >
                            <path d="M5 19c3-9 8-14 14-14-1 6-4 12-12 14M8 12l4 4" />
                          </svg>
                        </div>
                        <h2
                          className="f-serif"
                          style={{
                            fontSize: 28,
                            fontWeight: 400,
                            letterSpacing: "-0.01em",
                            color: "var(--ink)",
                            margin: 0,
                          }}
                        >
                          Your brain is empty.
                        </h2>
                        <p
                          className="f-serif"
                          style={{
                            fontSize: 16,
                            fontStyle: "italic",
                            color: "var(--ink-soft)",
                            margin: 0,
                            maxWidth: 380,
                            lineHeight: 1.5,
                          }}
                        >
                          Capture your first thing — or import what you've already written down.
                        </p>
                        <p
                          className="f-sans"
                          style={{
                            fontSize: 13,
                            color: "var(--ink-faint)",
                            margin: 0,
                            maxWidth: 420,
                            lineHeight: 1.55,
                          }}
                        >
                          A note, a link, a gate code, a policy number, a half-formed idea. Anything
                          worth not losing.
                        </p>

                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            justifyContent: "center",
                            marginTop: 4,
                          }}
                        >
                          <Button onClick={() => appShell.openCapture()} className="press">
                            + Capture a thought
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => appShell.setView("settings")}
                            className="press"
                          >
                            Import from somewhere…
                          </Button>
                        </div>

                        <div style={{ marginTop: 24, width: "100%", maxWidth: 480 }}>
                          <div
                            className="micro"
                            style={{ marginBottom: 10, color: "var(--ink-faint)" }}
                          >
                            try one of these to see how it works
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 6,
                              justifyContent: "center",
                            }}
                          >
                            {[
                              "the gate code Mom always forgets",
                              "when does my driver's licence expire",
                              "the customer call insight from Tuesday",
                              "where I hid the spare key",
                            ].map((example) => (
                              <button
                                key={example}
                                type="button"
                                onClick={() => appShell.openCapture(example)}
                                className="design-chip f-sans press"
                                style={{ fontSize: 12, cursor: "pointer" }}
                              >
                                {example}
                              </button>
                            ))}
                          </div>
                        </div>

                        {ff("vault") && (
                          <button
                            type="button"
                            onClick={() => appShell.setView("vault")}
                            className="press"
                            style={{
                              marginTop: 28,
                              padding: "14px 18px",
                              background: "var(--surface)",
                              border: "1px solid var(--ember)",
                              borderRadius: 14,
                              cursor: "pointer",
                              textAlign: "left",
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                              maxWidth: 420,
                            }}
                          >
                            <div
                              className="f-serif"
                              style={{
                                fontSize: 14,
                                fontWeight: 450,
                                color: "var(--ink)",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <span
                                aria-hidden="true"
                                style={{
                                  width: 5,
                                  height: 5,
                                  borderRadius: "50%",
                                  background: "var(--ember)",
                                }}
                              />
                              Set up your vault
                            </div>
                            <div
                              className="f-serif"
                              style={{
                                fontSize: 12,
                                color: "var(--ink-soft)",
                                fontStyle: "italic",
                                lineHeight: 1.45,
                              }}
                            >
                              For the high-stakes stuff — IDs, bank details, "if I die" notes.
                              End-to-end encrypted, server can't read it.
                            </div>
                          </button>
                        )}
                      </div>
                    ) : filtered.length > 0 ? (
                      <>
                        <VirtualGrid
                          filtered={filtered}
                          setSelected={appShell.selectMode ? () => {} : handleEntrySelect}
                          typeIcons={appShell.typeIcons}
                          onPin={(e) =>
                            e.type !== "secret" && handleUpdate(e.id, { pinned: !e.pinned })
                          }
                          onDelete={(e) => e.type !== "secret" && handleDelete(e.id)}
                          selectMode={appShell.selectMode}
                          selectedIds={appShell.selectedIds}
                          onToggleSelect={appShell.toggleSelectId}
                          viewMode={appShell.gridViewMode}
                          conceptMap={conceptMap}
                        />
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                        <h3
                          className="f-serif"
                          style={{
                            fontSize: 22,
                            fontWeight: 450,
                            letterSpacing: "-0.005em",
                            color: "var(--ink)",
                            margin: 0,
                          }}
                        >
                          nothing matches.
                        </h3>
                        <p
                          className="f-serif"
                          style={{
                            fontSize: 15,
                            fontStyle: "italic",
                            color: "var(--ink-faint)",
                            margin: 0,
                            maxWidth: 320,
                            lineHeight: 1.5,
                          }}
                        >
                          try a looser word. or a feeling.
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => appShell.setShowCapture(true)}
                          className="press"
                          style={{ marginTop: 8 }}
                        >
                          Capture something new
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {appShell.view === "chat" && ff("chat") && (
              <ErrorBoundary
                name="ChatView"
                fallback={(error, reset) => <ViewError view="Chat" error={error} onReset={reset} />}
              >
                <Suspense fallback={<Loader />}>
                  <ChatView brainId={activeBrain?.id} onNavigate={appShell.setView} />
                </Suspense>
              </ErrorBoundary>
            )}
            {appShell.view === "graph" && ff("graph") && (
              <ErrorBoundary
                name="GraphView"
                fallback={(error, reset) => (
                  <ViewError view="Graph" error={error} onReset={reset} />
                )}
              >
                <Suspense fallback={<Loader />}>
                  <GraphView openEntry={setSelected} />
                </Suspense>
              </ErrorBoundary>
            )}
            {appShell.view === "todos" && ff("todos") && (
              <ErrorBoundary
                name="TodoView"
                fallback={(error, reset) => (
                  <ViewError view="Schedule" error={error} onReset={reset} />
                )}
              >
                <Suspense fallback={<Loader />}>
                  <TodoView
                    entries={entries}
                    typeIcons={appShell.typeIcons}
                    activeBrainId={activeBrain?.id}
                    somedayEnabled={ff("someday")}
                  />
                </Suspense>
              </ErrorBoundary>
            )}
            {appShell.view === "memories" && ff("importantMemories") && (
              <ErrorBoundary
                name="ImportantMemoriesView"
                fallback={(error, reset) => (
                  <ViewError view="Important" error={error} onReset={reset} />
                )}
              >
                <Suspense fallback={<Loader />}>
                  <ImportantMemoriesView brainId={activeBrain?.id} />
                </Suspense>
              </ErrorBoundary>
            )}
            {appShell.view === "vault" && ff("vault") && (
              <ErrorBoundary
                name="VaultView"
                fallback={(error, reset) => (
                  <ViewError view="Vault" error={error} onReset={reset} />
                )}
              >
                <Suspense fallback={<Loader />}>
                  <VaultView
                    entries={entries}
                    onSelect={setSelected}
                    cryptoKey={cryptoKey}
                    onVaultUnlock={handleVaultUnlock}
                    brainId={activeBrain?.id}
                  />
                </Suspense>
              </ErrorBoundary>
            )}
            {appShell.view === "lists" && ff("lists") && (
              <ErrorBoundary
                name="ListsView"
                fallback={(error, reset) => (
                  <ViewError view="Lists" error={error} onReset={reset} />
                )}
              >
                <Suspense fallback={<Loader />}>
                  <ListsView
                    entries={entries}
                    brainId={activeBrain?.id}
                    onEntryCreated={handleCreated}
                    onEntryUpdate={(updated: Entry) =>
                      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
                    }
                    onEntryDelete={(id: string) =>
                      setEntries((prev) => prev.filter((e) => e.id !== id))
                    }
                  />
                </Suspense>
              </ErrorBoundary>
            )}
            {appShell.view === "contacts" && ff("contacts") && (
              <ErrorBoundary
                name="ContactsView"
                fallback={(error, reset) => (
                  <ViewError view="Contacts" error={error} onReset={reset} />
                )}
              >
                <Suspense fallback={<Loader />}>
                  <ContactsView
                    entries={entries}
                    brainId={activeBrain?.id}
                    onEntryCreated={handleCreated}
                    onSelectEntry={handleEntrySelect}
                  />
                </Suspense>
              </ErrorBoundary>
            )}
            {appShell.view === "home" && (
              <ErrorBoundary
                name="HomeView"
                fallback={(error, reset) => <ViewError view="Home" error={error} onReset={reset} />}
              >
                <HomeView
                  entries={entries}
                  brainCount={brains.length}
                  brainName={activeBrain?.name}
                  brainId={activeBrain?.id}
                  isPersonalBrain={activeBrain?.is_personal === true}
                  stagedCount={stagedCount}
                  onNavigate={appShell.setView}
                  onOpenCapture={() => appShell.setShowCapture(true)}
                  onOpenCaptureWith={(text) => appShell.openCapture(text)}
                  onCreateBrain={() => appShell.setShowCreateBrain(true)}
                  onSelectEntry={handleEntrySelect}
                />
              </ErrorBoundary>
            )}
            {appShell.view === "settings" && <SettingsView onNavigate={appShell.setView} />}
            {appShell.view === "capture" && (
              <ErrorBoundary
                name="CaptureWelcomeScreen"
                fallback={(error, reset) => (
                  <ViewError view="Capture" error={error} onReset={reset} />
                )}
              >
                <CaptureWelcomeScreen
                  entriesLoaded={entriesLoaded}
                  entries={entries}
                  activeBrainName={activeBrain?.name}
                  typeIcons={appShell.typeIcons}
                  onNavigate={appShell.setView}
                  onSelectEntry={setSelected}
                />
              </ErrorBoundary>
            )}
          </div>

          {/* BulkActionBar lives OUTSIDE the animate-view-enter wrapper.
              That wrapper applies a transform which creates a stacking
              context and breaks `position: fixed` for descendants —
              the pill ends up pinned to the wrapper, not the viewport. */}
          {(appShell.view === "memory" || appShell.view === "timeline") &&
            appShell.selectMode &&
            appShell.selectedIds.size > 0 && (
              <BulkActionBar
                selectedIds={appShell.selectedIds}
                entries={entries}
                brains={brains}
                activeBrainId={activeBrain?.id}
                allSelected={appShell.selectedIds.size === filtered.length}
                onSelectAll={() => {
                  if (appShell.selectedIds.size === filtered.length) {
                    filtered.forEach((e) => {
                      if (appShell.selectedIds.has(e.id)) appShell.toggleSelectId(e.id);
                    });
                  } else {
                    filtered.forEach((e) => {
                      if (!appShell.selectedIds.has(e.id)) appShell.toggleSelectId(e.id);
                    });
                  }
                }}
                onDelete={async (ids: string[]) => {
                  for (const id of ids) {
                    setEntries((prev) => prev.filter((e) => e.id !== id));
                    await authFetch("/api/delete-entry", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id }),
                    }).catch((err) => console.error("[bulkDelete]", err));
                  }
                }}
                onMoved={(ids: string[]) => {
                  // Moved rows leave the active brain; drop them from the
                  // local list so they don't ghost the Memory grid.
                  const set = new Set(ids);
                  setEntries((prev) => prev.filter((e) => !set.has(e.id)));
                }}
                onStartMerge={startMerge}
                mergeModalOpen={!!mergeSession?.modalOpen}
                onDone={(updated) => {
                  setEntries((prev) => prev.map((e) => updated.find((u) => u.id === e.id) ?? e));
                  appShell.toggleSelectMode();
                }}
                onCancel={appShell.toggleSelectMode}
              />
            )}

          {/* Merge preview lives at this scope so user can hide the modal
              while the LLM is generating — see startMerge above. Mounted
              for the lifetime of the session so local edit state survives
              hide/show toggles. */}
          {mergeSession && (
            <MergePreviewModal
              ids={mergeSession.ids}
              open={mergeSession.modalOpen}
              status={mergeSession.status}
              preview={mergeSession.preview}
              error={mergeSession.error}
              onHide={() => setMergeSession((s) => (s ? { ...s, modalOpen: false } : s))}
              onCancel={() => setMergeSession(null)}
              onCommitted={(_mergedId, sourceIds, merged) => {
                setMergeSession(null);
                // Drop the sources from the local list AND insert the merged
                // entry optimistically. Realtime should also surface the
                // INSERT but it can lag a beat — we don't want the user
                // staring at a hole in the grid while it catches up.
                const set = new Set(sourceIds);
                const mergedEntry = merged as Entry | null;
                setEntries((prev) => {
                  const filtered = prev.filter((e) => !set.has(e.id));
                  if (!mergedEntry?.id) return filtered;
                  // Dedup in case realtime beat us to it.
                  if (filtered.some((e) => e.id === mergedEntry.id)) return filtered;
                  return [mergedEntry, ...filtered];
                });
                appShell.toggleSelectMode();
              }}
            />
          )}

          <Suspense fallback={null}>
            {selectedVaultEntry && (
              <VaultRevealModal
                entry={selectedVaultEntry}
                cryptoKey={cryptoKey}
                onClose={() => setSelectedVaultEntry(null)}
                onVaultUnlock={handleVaultUnlock}
                onGoToVault={() => {
                  setSelectedVaultEntry(null);
                  appShell.setView("vault");
                }}
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
                canWrite={canWrite}
                brains={brains}
                vaultUnlocked={!!cryptoKey}
                onTypeIconChange={(type: string, icon: string) => {
                  registerTypeIcon(activeBrain?.id ?? "", type, icon);
                  appShell.refreshTypeIcons();
                }}
              />
            )}
          </Suspense>

          <BackgroundTaskToast
            tasks={bgTasks}
            onDismiss={bgDismissTask}
            onDismissAll={bgDismissAll}
          />
          <BackgroundOpsToast />

          {stagingInboxOpen && (
            <Suspense fallback={null}>
              <GmailStagingInbox onClose={() => setStagingInboxOpen(false)} />
            </Suspense>
          )}

          {appShell.showOnboarding && (
            <OnboardingModal
              onComplete={(opts) => {
                appShell.setShowOnboarding(false);
                if (opts?.nextAction === "vault") {
                  appShell.setView("vault");
                } else {
                  // New users land on Home so they see the first-run checklist.
                  // Existing users skip this branch (showOnboarding is already false).
                  appShell.setView("home");
                }
              }}
              brainId={activeBrain?.id}
            />
          )}

          <Suspense fallback={null}>
            <CaptureSheet
              isOpen={appShell.showCapture}
              onClose={() => {
                appShell.setShowCapture(false);
              }}
              onCreated={(e) => {
                handleCreated(e);
              }}
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
              somedayEnabled={ff("someday")}
            />
          </Suspense>
          {appShell.view !== "capture" && !appShell.showCapture && (
            <FloatingCaptureButton onClick={() => appShell.setShowCapture(true)} />
          )}
          {!appShell.showCapture && (
            <BottomNav
              activeView={appShell.view}
              adminFlags={adminFlags}
              onNavigate={(id) => {
                setSelected(null);
                appShell.setShowCapture(false);
                appShell.setView(id);
              }}
              onCapture={() => appShell.setShowCapture(true)}
              onOpenMore={() => setMoreOpen(true)}
            />
          )}
          <MobileMoreMenu
            isOpen={moreOpen}
            adminFlags={adminFlags}
            onNavigate={(id) => {
              setMoreOpen(false);
              if (id !== "close") {
                setSelected(null);
                appShell.setShowCapture(false);
                appShell.setView(id);
              }
            }}
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
  const { brains, activeBrain, setActiveBrain, refresh, loading: brainsLoading } = useBrainHook();

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

  // Pre-warm the CaptureSheet chunk after mount so the first capture tap
  // doesn't pay chunk download + parse latency. See captureSheetImport above.
  useEffect(() => {
    prefetchCaptureSheet();
  }, []);

  const appShell = useAppShell({ initialShowCapture, activeBrainId: activeBrain?.id });

  const dataLayer = useDataLayer({
    activeBrainId: activeBrain?.id,
    setSelected: appShell.setSelected,
    isOnline,
    isOnlineRef,
    refreshCount,
  });

  // Live-updates the chips and wave-dot as the server pipeline finishes
  // each step. Without this, dataLayer.entries only changes on refresh.
  useEntryRealtime(activeBrain?.id, dataLayer.setEntries);

  useEffect(() => {
    patchEntryIdRef.current = dataLayer.patchEntryId;
  }, [dataLayer.patchEntryId]);

  // Multi-brain (post-2026-05-05): owners + members can write; viewers are
  // read-only. activeBrain.my_role is set by /api/brains based on
  // brain_members.role for shared brains and 'owner' for owned brains.
  // Falls back to true when activeBrain is undefined (boot-time, brain
  // switcher in transit) so the UI stays usable while we wait — the API
  // then enforces the same check server-side via requireBrainAccess.
  const canWrite = !activeBrain || activeBrain.my_role !== "viewer";
  const { nudge, setNudge } = useNudge({
    entriesLoaded: dataLayer.entriesLoaded,
    entries: dataLayer.entries,
    activeBrain,
  });

  const {
    tasks: bgTasks,
    processFiles: bgProcessFiles,
    queueDirectSave: bgQueueDirectSave,
    dismissTask: bgDismissTask,
    dismissAll: bgDismissAll,
  } = useBackgroundCapture();

  // Persona facts live in the same `entries` table (so RAG and the concept
  // graph see them) but they're not "memories" — they belong in About You,
  // not in the Memory grid/list/timeline. Strip them out at the single
  // source so every downstream view (filtered, sortedTimeline, Bulk select,
  // search ranking) automatically excludes them.
  //
  // SECURITY: vault entries (type === "secret") are gated strictly on
  // brain_id === activeBrain.id. The data layer scopes its fetches per
  // brain, but a stale row briefly held during a brain switch (or a
  // future merge bug) would otherwise let a secret from one brain render
  // in another. Vault rows MUST carry a matching brain_id or they don't
  // render — no NULL-brain fallback. Non-secret entries are fetched
  // brain-scoped via /api/entries and trusted as-is (some legacy rows
  // pre-date brain_id and would unfairly disappear under a strict filter).
  const activeBrainIdForFilter = activeBrain?.id;
  const allDisplayEntries = useMemo(() => {
    const merged = [...dataLayer.entries, ...dataLayer.vaultEntries];
    return merged.filter((e) => {
      if (e.type === "persona") return false;
      if (e.type === "secret") {
        if (!activeBrainIdForFilter) return false;
        const rowBrain = (e as Entry & { brain_id?: string }).brain_id;
        return rowBrain === activeBrainIdForFilter;
      }
      return true;
    });
  }, [dataLayer.entries, dataLayer.vaultEntries, activeBrainIdForFilter]);

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

  const availableEntryTypes = useMemo(() => getEntryTypes(dataLayer.entries), [dataLayer.entries]);

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

  // Block the UI on the brains fetch only when we have nothing to render —
  // i.e. truly first-ever boot with no cache. With useBrain's localStorage
  // hydrate, returning users render immediately and the network refresh
  // updates state in place; any brain-set change after that surfaces in a
  // single re-render rather than bouncing the whole shell back to a
  // LoadingScreen for the duration of the round-trip.
  if (brainsLoading && brains.length === 0)
    return (
      <>
        <LoadingScreen />
        <Button
          size="icon-lg"
          onClick={() => appShell.setShowCapture(true)}
          aria-label="New entry"
          className="press-scale fixed bottom-5 left-1/2 z-[60] h-14 w-14 -translate-x-1/2 rounded-full lg:hidden"
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
        </Button>
      </>
    );

  return (
    <EntriesContext.Provider value={entriesValue}>
      <BrainContext.Provider value={brainValue}>
        <ConceptGraphProvider activeBrainId={activeBrain?.id}>
          <BackgroundOpsProvider>
            <TooltipProvider delayDuration={400}>
              <Toaster position="bottom-center" />
              <AppLockGate>
                <EverionContent
                  appShell={appShell}
                  cryptoKey={dataLayer.cryptoKey}
                  handleVaultUnlock={dataLayer.handleVaultUnlock}
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
                  loadError={dataLayer.loadError}
                />
              </AppLockGate>
            </TooltipProvider>
          </BackgroundOpsProvider>
        </ConceptGraphProvider>
      </BrainContext.Provider>
    </EntriesContext.Provider>
  );
}
