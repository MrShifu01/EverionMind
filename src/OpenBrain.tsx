import { useState, useMemo, useRef, useEffect, useCallback, lazy, Suspense } from "react";
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
import { readEntriesCache, writeEntriesCache } from "./lib/entriesCache";
import { PinGate } from "./lib/pin";
import { inferWorkspace } from "./lib/workspaceInfer";
import { EntriesContext } from "./context/EntriesContext";
import { BrainContext } from "./context/BrainContext";
import { UndoToast } from "./components/UndoToast";
import { NudgeBanner } from "./components/NudgeBanner";
import { VirtualGrid, VirtualTimeline } from "./components/EntryList";
import BrainSwitcher from "./components/BrainSwitcher";
import CreateBrainModal from "./components/CreateBrainModal";
import OnboardingModal from "./components/OnboardingModal";
import BrainTipCard from "./components/BrainTipCard";
import QuickCapture from "./components/QuickCapture";
import BottomNav from "./components/BottomNav";
import MobileHeader from "./components/MobileHeader";
import CaptureSheet from "./components/CaptureSheet";
import DesktopSidebar from "./components/DesktopSidebar";
import LoadingScreen from "./components/LoadingScreen";
import SkeletonCard from "./components/SkeletonCard";
import SettingsView from "./views/SettingsView";
import type { Brain, Entry } from "./types";

const SuggestionsView = lazy(() => import("./views/SuggestionsView"));
const RefineView = lazy(() => import("./views/RefineView"));
const TodoView = lazy(() => import("./views/TodoView"));
const DetailModal = lazy(() => import("./views/DetailModal"));
const VaultView = lazy(() => import("./views/VaultView"));
const ChatView = lazy(() => import("./views/ChatView"));

function Loader() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <SkeletonCard count={3} />
    </div>
  );
}

// PERF-9: compiled once at module level
const PHONE_REGEX = /(\+27[0-9]{9}|0[6-8][0-9]{8})/;

const NAV_VIEWS = [
  { id: "grid", l: "Grid", ic: "▦" },
  { id: "suggest", l: "Fill Brain", ic: "✦" },
  { id: "refine", l: "Refine", ic: "✦" },
  { id: "vault", l: "Vault", ic: "🔐" },
  { id: "chat", l: "Ask", ic: "◈" },
];

export default function OpenBrain() {
  const [entries, setEntries] = useState<Entry[]>(() => {
    try {
      const cached = localStorage.getItem("openbrain_entries");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.every((e) => e && typeof e.id === "string"))
          return parsed;
      }
    } catch {}
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
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { brains, activeBrain, setActiveBrain, deleteBrain, refresh, loading: brainsLoading } =
    useBrainHook(useCallback(() => { setEntries([]); setLinks([]); setEntriesLoaded(false); }, []));

  const { isOnline, pendingCount, sync, refreshCount, failedOps, clearFailedOps } = useOfflineSync({
    onEntryIdUpdate: useCallback((tempId: string, realId: string) => {
      setEntries((prev) => prev.map((e) => (e.id === tempId ? { ...e, id: realId } : e)));
    }, []),
  });

  useEffect(() => { if (isOnline) sync(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isOnlineRef = useRef(isOnline);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter] = useState("all");
  const [workspace] = useState(() => localStorage.getItem("openbrain_workspace") || "all");
  const [view, setView] = useState("capture");
  const [, setNavOpen] = useState(false);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [links, setLinks] = useState<any[]>(LINKS);
  const addLinks = useCallback((newLinks: any[]) => setLinks((prev) => [...prev, ...newLinks]), []);
  const [typeIcons, setTypeIcons] = useState<Record<string, string>>({});
  const refreshTypeIcons = useCallback(() => {
    if (activeBrain?.id) setTypeIcons(getTypeIcons(activeBrain.id));
  }, [activeBrain?.id]);
  const { canWrite, canInvite, canManageMembers } = useRole(activeBrain);
  const { isDark, toggleTheme } = useTheme();
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem("openbrain_onboarded"));
  const [showBrainTip, setShowBrainTip] = useState<Brain | null>(null);
  const [showCreateBrain, setShowCreateBrain] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [vaultExists, setVaultExists] = useState(false);

  useEffect(() => {
    if (showOnboarding && brains.length > 0) { localStorage.setItem("openbrain_onboarded", "1"); setShowOnboarding(false); }
  }, [brains, showOnboarding]);
  useEffect(() => {
    const h = () => setShowOnboarding(true);
    window.addEventListener("openbrain:restart-onboarding", h);
    return () => window.removeEventListener("openbrain:restart-onboarding", h);
  }, []);
  useEffect(() => {
    authFetch("/api/vault").then((r) => r.ok ? r.json() : null).then((d) => { if (d?.exists) setVaultExists(true); }).catch(() => {});
  }, []);
  useEffect(() => { const t = setTimeout(() => setSearch(searchInput), 200); return () => clearTimeout(t); }, [searchInput]);
  useEffect(() => { if (activeBrain?.id) setTypeIcons(getTypeIcons(activeBrain.id)); }, [activeBrain?.id]);
  useEffect(() => {
    if (!activeBrain?.id) return;
    setEntriesLoaded(false);
    authFetch(`/api/entries?brain_id=${encodeURIComponent(activeBrain.id)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const fetched = Array.isArray(data) ? data : (data?.entries ?? []);
        if (fetched.length > 0) { setEntries(fetched); writeEntriesCache(fetched); fetched.filter((e: Entry) => e.type !== "secret").forEach(indexEntry); }
        setEntriesLoaded(true);
      })
      .catch(() => setEntriesLoaded(true));
    authFetch(`/api/search?brain_id=${encodeURIComponent(activeBrain.id)}&threshold=0.55`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (!data) return; const arr = Array.isArray(data) ? data : (data.links || []); if (arr.length > 0) setLinks(arr); })
      .catch(() => {});
  }, [activeBrain?.id]);
  useEffect(() => {
    if (!entriesLoaded) return;
    const t = setTimeout(() => writeEntriesCache(entries), 3000);
    return () => clearTimeout(t);
  }, [entries, entriesLoaded]);

  const { nudge, setNudge } = useNudge({ entriesLoaded, entries, activeBrain });

  const { lastAction, setLastAction, saveError, setSaveError, commitPendingDelete, handleDelete, handleUpdate, handleUndo, handleCreated } =
    useEntryActions({ entries, setEntries, setSelected, isOnline, isOnlineRef, refreshCount, cryptoKey });

  const chat = useChat({ entries, activeBrain, brains, links, cryptoKey, handleVaultUnlock, vaultExists });

  const filtered = useMemo(() => {
    let r = entries;
    if (workspace !== "all") r = r.filter((e) => { const ws = inferWorkspace(e); return ws === workspace || ws === "both"; });
    if (typeFilter !== "all") r = r.filter((e) => e.type === typeFilter);
    if (search) { const ids = searchIndex(search); if (ids) r = r.filter((e) => ids.has(e.id)); }
    return r;
  }, [search, typeFilter, workspace, entries]);

  const sortedTimeline = useMemo(
    () => [...filtered].sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()),
    [filtered],
  );

  const entriesValue = useMemo(
    () => ({ entries, setEntries, entriesLoaded, selected, setSelected, handleDelete, handleUpdate }),
    [entries, setEntries, entriesLoaded, selected, setSelected, handleDelete, handleUpdate],
  );
  const brainValue = useMemo(
    () => ({ activeBrain, brains, refresh, canInvite, canManageMembers, deleteBrain }),
    [activeBrain, brains, refresh, canInvite, canManageMembers, deleteBrain],
  );

  if (brainsLoading) return <LoadingScreen />;

  return (
    <EntriesContext.Provider value={entriesValue}>
      <BrainContext.Provider value={brainValue}>
        <>
          <DesktopSidebar
            activeBrainName={activeBrain?.name || "Everion"}
            view={view}
            onNavigate={(id) => { setView(id); setNavOpen(false); }}
            isDark={isDark}
            onToggleTheme={toggleTheme}
            isOnline={isOnline}
            pendingCount={pendingCount}
            entryCount={entries.length}
            onShowCreateBrain={() => setShowCreateBrain(true)}
            navViews={NAV_VIEWS}
          >
            {brains.length > 0 && (
              <BrainSwitcher brains={brains} activeBrain={activeBrain} onSwitch={setActiveBrain}
                onBrainCreated={async (brain) => { await refresh(); setActiveBrain(brain); }}
                onBrainTip={(brain) => setShowBrainTip(brain)}
              />
            )}
          </DesktopSidebar>

          <div className="overflow-x-hidden w-full">
            <div className="min-h-dvh bg-background lg:ml-72">
              <MobileHeader brainName={activeBrain?.name || "Everion"} brainEmoji="🧠"
                onToggleTheme={toggleTheme} isDark={isDark} isOnline={isOnline} pendingCount={pendingCount}>
                {brains.length > 0 && (
                  <BrainSwitcher brains={brains} activeBrain={activeBrain} onSwitch={setActiveBrain}
                    onBrainCreated={async (brain) => { await refresh(); setActiveBrain(brain); }}
                    onBrainTip={(brain) => setShowBrainTip(brain)}
                  />
                )}
              </MobileHeader>

              <QuickCapture entries={entries} setEntries={setEntries} links={links} addLinks={addLinks}
                onCreated={handleCreated} onUpdate={handleUpdate} brainId={activeBrain?.id ?? ""}
                brains={brains} isOnline={isOnline} refreshCount={refreshCount}
                canWrite={canWrite} cryptoKey={cryptoKey} onNavigate={setView}
              />

              {showBrainTip && <BrainTipCard brain={showBrainTip} onDismiss={() => setShowBrainTip(null)} onFill={() => { setShowBrainTip(null); setView("suggest"); }} />}
              {view === "grid" && nudge && <NudgeBanner nudge={nudge} onDismiss={() => { setNudge(null); sessionStorage.removeItem("openbrain_nudge"); }} />}
              {failedOps.length > 0 && (
                <div className="mx-4 mt-2 p-3 rounded-2xl border flex items-center gap-3" style={{ background: "rgba(255,110,132,0.08)", borderColor: "rgba(255,110,132,0.2)" }}>
                  <span className="text-sm text-error flex-1">{failedOps.length} operation{failedOps.length > 1 ? "s" : ""} failed to sync</span>
                  <button onClick={() => clearFailedOps()} className="text-xs text-on-surface-variant hover:text-on-surface press-scale">Dismiss</button>
                </div>
              )}

              {showCreateBrain && (
                <CreateBrainModal onClose={() => setShowCreateBrain(false)} onCreate={async (brain) => { await refresh(); setActiveBrain(brain); setShowBrainTip(brain); setShowCreateBrain(false); }} />
              )}

              <div className="px-4 sm:px-6 pt-4 pb-32 lg:pb-8 max-w-6xl mx-auto">
                {view === "grid" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border" style={{ background: "var(--color-surface-container-low)", borderColor: "var(--color-outline-variant)" }}>
                      <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                      <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search memories..." className="flex-1 bg-transparent border-none outline-none text-on-surface placeholder:text-on-surface-variant/40 text-sm" />
                    </div>
                    {!entriesLoaded ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"><SkeletonCard count={6} /></div>
                      : filtered.length > 0 ? <VirtualGrid filtered={filtered} setSelected={setSelected} typeIcons={typeIcons} onPin={(e) => handleUpdate(e.id, { pinned: !e.pinned })} onDelete={(e) => handleDelete(e.id)} />
                      : <div className="flex flex-col items-center justify-center py-20 gap-3"><div className="text-4xl opacity-40">🔍</div><p className="font-bold text-on-surface">No memories match</p></div>}
                  </div>
                )}
                {view === "suggest" && <Suspense fallback={<Loader />}><SuggestionsView entries={entries} setEntries={setEntries} activeBrain={activeBrain} brains={brains} /></Suspense>}
                {view === "refine" && <Suspense fallback={<Loader />}><RefineView entries={entries} setEntries={setEntries} links={links} addLinks={addLinks} activeBrain={activeBrain} brains={brains} onSwitchBrain={setActiveBrain} /></Suspense>}
                {view === "todos" && <Suspense fallback={<Loader />}><TodoView entries={entries} typeIcons={typeIcons} /></Suspense>}
                {view === "timeline" && <VirtualTimeline sorted={sortedTimeline} setSelected={setSelected} typeIcons={typeIcons} />}
                {view === "vault" && <Suspense fallback={<Loader />}><VaultView entries={entries} onSelect={setSelected} cryptoKey={cryptoKey} onVaultUnlock={handleVaultUnlock} brainId={activeBrain?.id} onEntryCreated={(e) => setEntries((prev) => [e, ...prev])} /></Suspense>}
                {view === "chat" && (
                  <Suspense fallback={<Loader />}>
                    <ChatView {...chat} brains={brains} phoneRegex={PHONE_REGEX} />
                  </Suspense>
                )}
                {view === "settings" && <SettingsView />}
                {view === "capture" && (
                  <div className="space-y-5">
                    <button onClick={() => setView("suggest")} className="w-full flex items-center gap-4 p-5 rounded-3xl border press-scale transition-all group" style={{ background: "var(--color-surface-container-low)", borderColor: "var(--color-outline-variant)" }}>
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--color-primary-container)" }}>
                        <svg className="w-6 h-6" style={{ color: "var(--color-primary)" }} fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                      </div>
                      <div className="flex-1 text-left"><div className="font-bold text-on-surface mb-0.5">Fill Your Brain</div><div className="text-sm text-on-surface-variant">Answer guided questions to build your memory</div></div>
                    </button>
                    <div className="grid grid-cols-2 gap-3">
                      {[{ id: "grid", l: "Memory Grid", ic: "▦" }, { id: "chat", l: "Ask Brain", ic: "◈" }, { id: "refine", l: "Refine", ic: "✦" }, { id: "vault", l: "Vault", ic: "🔐" }].map((v) => (
                        <button key={v.id} onClick={() => setView(v.id)} className="flex flex-col items-start gap-2 p-4 rounded-2xl border transition-all press-scale text-left" style={{ background: "var(--color-surface-container-low)", borderColor: "var(--color-outline-variant)" }}>
                          <div className="text-xl">{v.ic}</div>
                          <div className="text-sm font-bold text-on-surface">{v.l}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Suspense fallback={null}>
                <DetailModal entry={selected} onClose={() => setSelected(null)} onDelete={handleDelete} onUpdate={handleUpdate}
                  entries={entries} links={links} canWrite={canWrite} brains={brains} vaultUnlocked={!!cryptoKey} typeIcons={typeIcons}
                  onTypeIconChange={(type: string, icon: string) => { registerTypeIcon(activeBrain?.id, type, icon); refreshTypeIcons(); }}
                />
              </Suspense>

              {lastAction && (
                <UndoToast action={lastAction} onUndo={handleUndo} onDismiss={() => { if (lastAction.type === "delete") commitPendingDelete(); setLastAction(null); }} />
              )}

              {saveError && (
                <div className="fixed top-4 right-4 z-[100] flex items-center gap-3 px-4 py-3 rounded-2xl border max-w-sm" style={{ background: "rgba(26,25,25,0.95)", borderColor: "rgba(255,110,132,0.20)" }}>
                  <span className="flex-1 text-sm text-on-surface">{saveError}</span>
                  <button onClick={() => setSaveError(null)} className="text-on-surface-variant hover:text-on-surface press-scale">×</button>
                </div>
              )}

              {chat.showPinGate && (
                <PinGate isSetup={chat.pinGateIsSetup}
                  onSuccess={() => { if (chat.pendingSecureMsg) { chat.setChatMsgs((p) => [...p, { role: "assistant", content: chat.pendingSecureMsg!.content }]); chat.setPendingSecureMsg(null); } chat.setShowPinGate(false); }}
                  onCancel={() => { chat.setPendingSecureMsg(null); chat.setShowPinGate(false); }}
                />
              )}

              {showOnboarding && (
                <OnboardingModal onComplete={(_, answeredItems, skippedQs) => {
                  if (answeredItems?.length) {
                    try { const key = "openbrain_answered_qs"; const ex = new Set(JSON.parse(localStorage.getItem(key) || "[]")); answeredItems.forEach((i: any) => ex.add(i.q)); localStorage.setItem(key, JSON.stringify([...ex])); } catch {}
                    answeredItems.forEach((item: any) => {
                      callAI({ max_tokens: 800, system: PROMPTS.QA_PARSE, brainId: activeBrain?.id, messages: [{ role: "user", content: `Question: ${item.q}\nAnswer: ${item.a}` }] })
                        .then((r: any) => r.json()).then((data: any) => {
                          let parsed: any = {};
                          try { parsed = JSON.parse((data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim()); } catch {}
                          if (parsed.title && activeBrain?.id) {
                            authFetch("/api/capture", { method: "POST", headers: { "Content-Type": "application/json", ...(getEmbedHeaders() || {}) }, body: JSON.stringify({ p_title: parsed.title, p_content: parsed.content || item.a, p_type: parsed.type || "note", p_metadata: parsed.metadata || {}, p_tags: parsed.tags || [], p_brain_id: activeBrain.id }) })
                              .catch((err: Error) => console.error("[onboarding] capture failed", err));
                          }
                        }).catch((err: Error) => console.error("[onboarding] AI parse failed", err));
                    });
                  }
                  if (skippedQs?.length) {
                    try { const ex = JSON.parse(localStorage.getItem("openbrain_onboarding_skipped") || "[]"); const merged = [...ex]; skippedQs.forEach((q: any) => { if (!merged.find((e: any) => e.q === q.q)) merged.push(q); }); localStorage.setItem("openbrain_onboarding_skipped", JSON.stringify(merged)); } catch {}
                  }
                  setShowOnboarding(false); setView("suggest");
                }} />
              )}

              <CaptureSheet
                isOpen={showCapture}
                onClose={() => setShowCapture(false)}
                onCreated={handleCreated}
                brainId={activeBrain?.id}
                isOnline={isOnline}
              />
              <BottomNav
                activeView={view}
                onNavigate={(id) => { if (id === "more") { setNavOpen((o) => !o); } else { setView(id); setNavOpen(false); } }}
                onCapture={() => setShowCapture(true)}
              />
            </div>
          </div>
        </>
      </BrainContext.Provider>
    </EntriesContext.Provider>
  );
}
