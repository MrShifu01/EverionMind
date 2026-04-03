import { useState, useMemo, useRef, useEffect, useCallback, lazy, Suspense, memo } from "react";
import { useTheme } from "./ThemeContext";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { authFetch } from "./lib/authFetch";
import { callAI } from "./lib/ai";
import { getEmbedHeaders, getUserProvider, getUserModel, getUserApiKey, getOpenRouterKey, getOpenRouterModel } from "./lib/aiFetch";
import { PROMPTS } from "./config/prompts";
import { TC, fmtD, MODEL, INITIAL_ENTRIES, LINKS } from "./data/constants";
import { useBrain as useBrainHook } from "./hooks/useBrain";
import { useRole } from "./hooks/useRole";
import { useOfflineSync } from "./hooks/useOfflineSync";
import { enqueue } from "./lib/offlineQueue";
import { showError, captureError } from "./lib/notifications";
import { indexEntry, removeFromIndex, searchIndex } from "./lib/searchIndex";
import { readEntriesCache, writeEntriesCache } from "./lib/entriesCache";
import { PinGate, getStoredPinHash } from "./lib/pin";
import BrainSwitcher from "./components/BrainSwitcher";
import CreateBrainModal from "./components/CreateBrainModal";
import OnboardingModal from "./components/OnboardingModal";
import BrainTipCard from "./components/BrainTipCard";
import QuickCapture from "./components/QuickCapture";
import SupplierPanel from "./components/SupplierPanel";
import SettingsView from "./views/SettingsView";
import { inferWorkspace } from "./lib/workspaceInfer";
import { EntriesContext } from "./context/EntriesContext";
import { BrainContext } from "./context/BrainContext";

const SuggestionsView = lazy(() => import("./views/SuggestionsView"));
const CalendarView    = lazy(() => import("./views/CalendarView"));
const TodoView        = lazy(() => import("./views/TodoView"));
const GraphView       = lazy(() => import("./views/GraphView"));
const DetailModal     = lazy(() => import("./views/DetailModal"));
const RefineView      = lazy(() => import("./views/RefineView"));

function Loader() {
  const { t } = useTheme();
  return <div style={{ padding: 40, textAlign: "center", color: t.textFaint, fontSize: 13 }}>Loading…</div>;
}

/* ═══════════════════════════════════════════════════════════════
   UNDO TOAST
   ═══════════════════════════════════════════════════════════════ */
function UndoToast({ action, onUndo, onDismiss }) {
  const { t } = useTheme();
  const duration = action.type === "create" ? 3000 : 5000;
  const [pct, setPct] = useState(100);
  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      const p = Math.max(0, 100 - ((Date.now() - start) / duration) * 100);
      setPct(p);
      if (p <= 0) { clearInterval(tick); onDismiss(); }
    }, 80);
    return () => clearInterval(tick);
  }, []);
  const label = { delete: "Entry deleted", update: "Entry updated", create: "Entry created" }[action.type];
  return (
    <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: t.surface, border: "1px solid #4ECDC4", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, zIndex: 2000, boxShadow: "0 4px 20px #0008", minWidth: 240, maxWidth: "calc(100vw - 32px)", boxSizing: "border-box" }}>
      <span style={{ fontSize: 14, color: t.textMid }}>{label}</span>
      <button onClick={onUndo} style={{ padding: "4px 14px", borderRadius: 8, border: "1px solid #4ECDC4", background: "none", color: "#4ECDC4", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Undo</button>
      <div style={{ position: "absolute", bottom: 0, left: 0, height: 3, background: "#4ECDC4", borderRadius: "0 0 12px 12px", width: `${pct}%`, transition: "width 80ms linear" }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NUDGE BANNER
   ═══════════════════════════════════════════════════════════════ */
function NudgeBanner({ nudge, onDismiss }) {
  const { t } = useTheme();
  if (!nudge) return null;
  return (
    <div style={{ margin: "0 12px 12px", padding: "10px 12px", background: t.surface, border: "1px solid #A29BFE40", borderRadius: 12, display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
      <p style={{ margin: 0, flex: 1, fontSize: 13, color: t.textMid, lineHeight: 1.5 }}>{nudge}</p>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: t.textFaint, fontSize: 18, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>✕</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PASSWORD FIREWALL
   ═══════════════════════════════════════════════════════════════ */
const SENSITIVE_RE = /\b(password|passcode|passphrase|credentials|wifi\s*(key|password)|network\s*key|bank\s*(account|pin|number|detail)|id\s*number|passport\s*number|secret\s*key|secret\s*word|pin\s*number|access\s*code)\b/i;
function containsSensitiveContent(text) { return SENSITIVE_RE.test(text); }

/* ═══════════════════════════════════════════════════════════════
   ENTRY CARD
   ═══════════════════════════════════════════════════════════════ */
const EntryCard = memo(function EntryCard({ entry: e, onSelect }) {
  const { t, isDark } = useTheme();
  const cfg = TC[e.type] || TC.note;
  const imp = { 1: "Important", 2: "Critical" }[e.importance];
  return (
    <div onClick={() => onSelect(e)} style={{ background: t.surface, border: `1px solid ${e.pinned ? cfg.c + "80" : t.border}`, borderRadius: 12, padding: "16px 20px", cursor: "pointer", position: "relative", overflow: "hidden" }}
      onMouseEnter={ev => { ev.currentTarget.style.borderColor = cfg.c; ev.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={ev => { ev.currentTarget.style.borderColor = e.pinned ? cfg.c + "80" : t.border; ev.currentTarget.style.transform = "none"; }}>
      {e.pinned && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${cfg.c},transparent)` }} />}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{cfg.i}</span>
        <span style={{ fontSize: 10, color: cfg.c, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5 }}>{e.type}</span>
        {e.pinned && <span style={{ fontSize: 10 }}>📌</span>}
        {imp && <span style={{ fontSize: 9, background: e.importance === 2 ? "#FF6B3530" : "#FFEAA720", color: e.importance === 2 ? "#FF6B35" : "#FFEAA7", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>{imp}</span>}
      </div>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: t.text, lineHeight: 1.3 }}>{e.title}</h3>
      <p style={{ margin: "8px 0 0", fontSize: 13, color: t.textMuted, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.content}</p>
      {e.tags?.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10 }}>
        {e.tags.slice(0, 4).map(tag => <span key={tag} style={{ fontSize: 10, color: t.textDim, background: isDark ? "#ffffff08" : "#00000008", padding: "2px 8px", borderRadius: 20 }}>{tag}</span>)}
        {e.tags.length > 4 && <span style={{ fontSize: 10, color: t.textFaint }}>+{e.tags.length - 4}</span>}
      </div>}
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════
   VIRTUALISED GRID
   ═══════════════════════════════════════════════════════════════ */
function VirtualGrid({ filtered, setSelected }) {
  const COLS = typeof window !== "undefined" && window.innerWidth >= 640 ? 2 : 1;
  const rows = useMemo(() => { const r = []; for (let i = 0; i < filtered.length; i += COLS) r.push(filtered.slice(i, i + COLS)); return r; }, [filtered, COLS]);
  const listRef = useRef(null);
  const virtualizer = useWindowVirtualizer({ count: rows.length, estimateSize: () => 172, overscan: 4, scrollMargin: listRef.current?.offsetTop ?? 0 });
  return (
    <div ref={listRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map(vRow => (
          <div key={vRow.index} style={{ position: "absolute", top: vRow.start - virtualizer.options.scrollMargin, left: 0, right: 0, display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: 12, paddingBottom: 12 }}>
            {rows[vRow.index].map(e => <EntryCard key={e.id} entry={e} onSelect={setSelected} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VIRTUALISED TIMELINE
   ═══════════════════════════════════════════════════════════════ */
function VirtualTimeline({ sorted, setSelected }) {
  const { t } = useTheme();
  const listRef = useRef(null);
  const virtualizer = useWindowVirtualizer({ count: sorted.length, estimateSize: () => 64, overscan: 5, scrollMargin: listRef.current?.offsetTop ?? 0 });
  return (
    <div ref={listRef} style={{ position: "relative", paddingLeft: 24 }}>
      <div style={{ position: "absolute", left: 10, top: 0, bottom: 0, width: 2, background: "linear-gradient(180deg,#4ECDC4,#FF6B35,#A29BFE)" }} />
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map(vItem => {
          const e = sorted[vItem.index]; const cfg = TC[e.type] || TC.note;
          return (
            <div key={e.id} style={{ position: "absolute", top: vItem.start - virtualizer.options.scrollMargin, left: 0, right: 0, paddingLeft: 20, paddingBottom: 16, cursor: "pointer" }} onClick={() => setSelected(e)}>
              <div style={{ position: "absolute", left: -3, top: 6, width: 12, height: 12, borderRadius: "50%", background: cfg.c, border: `2px solid ${t.bg}` }} />
              <p style={{ fontSize: 10, color: t.textDim, margin: "0 0 2px" }}>{fmtD(e.created_at)}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 14 }}>{cfg.i}</span><span style={{ fontSize: 14, color: t.textSoft, fontWeight: 500 }}>{e.title}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════════ */

// PERF-9: Module-level constant so regex is compiled once, not on every render.
const PHONE_REGEX = /(\+27[0-9]{9}|0[6-8][0-9]{8})/;

const CHAT_CHIPS = [
  { label: "Who supplies...", text: "Who supplies " },
  { label: "Who do I call for...", text: "Who do I call for " },
  { label: "When does... expire?", text: "When does " },
  { label: "What's the number for...", text: "What's the number for " },
];

export default function OpenBrain() {
  // PERF-8: Initial state uses synchronous localStorage read (fast, no flicker).
  // A useEffect below loads from IndexedDB (the primary cache) and updates if needed.
  const [entries, setEntries] = useState(() => {
    try {
      const cached = localStorage.getItem("openbrain_entries");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.every(e => e && typeof e.id === "string" && typeof e.title === "string")) return parsed;
      }
    } catch {}
    return [];
  });
  const [entriesLoaded, setEntriesLoaded] = useState(false);

  // PERF-8: On mount, upgrade the initial state from IndexedDB (richer than localStorage).
  // Only runs once; if IDB has data and localStorage was empty/stale, this hydrates faster.
  useEffect(() => {
    readEntriesCache().then(cached => {
      if (cached && cached.length > 0) {
        setEntries(prev => prev.length === 0 ? cached : prev);
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Brain context + role ───
  const { brains, activeBrain, setActiveBrain, createBrain, deleteBrain, refresh } = useBrainHook(
    useCallback(() => {
      // Reset local state when brain switches
      setEntries([]);
      setLinks([]);
      setEntriesLoaded(false);
    }, [])
  );

  const { isOnline, pendingCount, sync, refreshCount } = useOfflineSync({
    onEntryIdUpdate: useCallback((tempId, realId) => {
      setEntries(prev => prev.map(e => e.id === tempId ? { ...e, id: realId } : e));
    }, []),
  });

  // Drain offline queue on mount when online
  useEffect(() => {
    if (isOnline) sync();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a ref so timer callbacks can read current isOnline without stale closure
  const isOnlineRef = useRef(isOnline);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [workspace, setWorkspace] = useState(() => localStorage.getItem("openbrain_workspace") || "all");
  const [view, setView] = useState("capture");
  const [navOpen, setNavOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [links, setLinks] = useState(LINKS);
  const addLinks = (newLinks) => setLinks(prev => [...prev, ...newLinks]);
  const { canWrite, canInvite, canManageMembers, role: myRole } = useRole(activeBrain);
  const { t, isDark, toggleTheme } = useTheme();
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem("openbrain_onboarded"));
  // Skip onboarding for existing users on new browsers — if they already have brains, they're not new
  useEffect(() => {
    if (showOnboarding && brains.length > 0) {
      localStorage.setItem("openbrain_onboarded", "1");
      setShowOnboarding(false);
    }
  }, [brains, showOnboarding]);
  const [showBrainTip, setShowBrainTip] = useState(null);
  const [showCreateBrain, setShowCreateBrain] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState([{ role: "assistant", content: "Hey! Ask me about your memories — \"What's my ID number?\", \"Who are my suppliers?\", etc." }]);
  const [chatLoading, setChatLoading] = useState(false);
  const [pendingSecureMsg, setPendingSecureMsg] = useState(null);
  const [showPinGate, setShowPinGate] = useState(false);
  const [pinGateIsSetup, setPinGateIsSetup] = useState(false);
  const [nudge, setNudge] = useState(() => sessionStorage.getItem("openbrain_nudge") || null);
  const [lastAction, setLastAction] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const pendingDeleteRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs]);

  useEffect(() => {
    if (!activeBrain?.id) return;
    setEntriesLoaded(false);
    const url = `/api/entries?brain_id=${encodeURIComponent(activeBrain.id)}`;
    authFetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setEntries(data);
          writeEntriesCache(data); // PERF-8: write to IDB (with localStorage fallback)
          // ARCH-5: Build search index at load time — O(n) once, not on every filter
          data.forEach(indexEntry);
        }
        setEntriesLoaded(true);
      })
      .catch(err => { captureError(err, 'fetchEntries'); setEntriesLoaded(true); });
  }, [activeBrain?.id]);

  // Proactive intelligence nudge — runs once per session after entries load
  useEffect(() => {
    if (!entriesLoaded || sessionStorage.getItem("openbrain_nudge") !== null) return;
    const recent = entries.slice(0, 30).map(e => ({ id: e.id, title: e.title, type: e.type, tags: e.tags, metadata: e.metadata, created_at: e.created_at }));
    callAI({
      max_tokens: 200,
      system: PROMPTS.NUDGE,
      messages: [{ role: "user", content: `My recent memories:\n${JSON.stringify(recent)}\n\nWhat should I know right now?` }]
    })
      .then(r => r.json())
      .then(data => {
        const text = data.content?.[0]?.text?.trim();
        if (text) { setNudge(text); sessionStorage.setItem("openbrain_nudge", text); }
        else sessionStorage.setItem("openbrain_nudge", "");
      })
      .catch(() => sessionStorage.setItem("openbrain_nudge", ""));
  }, [entriesLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!entriesLoaded) return;
    const t = setTimeout(() => { writeEntriesCache(entries); }, 3000); // PERF-8: debounced IDB write
    return () => clearTimeout(t);
  }, [entries, entriesLoaded]);

  const types = useMemo(() => { const t = {}; entries.forEach(e => { t[e.type] = (t[e.type] || 0) + 1; }); return t; }, [entries]);

  const filtered = useMemo(() => {
    let r = entries;
    if (workspace !== "all") r = r.filter(e => { const ws = inferWorkspace(e); return ws === workspace || ws === "both"; });
    if (typeFilter !== "all") r = r.filter(e => e.type === typeFilter);
    if (search) {
      // ARCH-5: Use pre-computed inverted index — O(k) lookup instead of O(n) full scan
      const matchIds = searchIndex(search);
      if (matchIds) {
        r = r.filter(e => matchIds.has(e.id));
      } else {
        // Fallback: index returned null (empty query), no filter applied
      }
    }
    return r;
  }, [search, typeFilter, workspace, entries]);

  const sortedTimeline = useMemo(() => [...filtered].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)), [filtered]);

  // ─── Undo system ───
  const commitPendingDelete = useCallback(() => {
    if (!pendingDeleteRef.current) return;
    const { id } = pendingDeleteRef.current;
    if (isOnlineRef.current) {
      authFetch("/api/delete-entry", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(err => captureError(err, 'commitPendingDelete'));
    } else {
      enqueue({ id: crypto.randomUUID(), url: "/api/delete-entry", method: "DELETE", body: JSON.stringify({ id }), created_at: new Date().toISOString() }).then(refreshCount);
    }
    pendingDeleteRef.current = null;
  }, [refreshCount]);

  const handleDelete = useCallback((id) => {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    commitPendingDelete();
    removeFromIndex(id); // ARCH-5: keep search index consistent
    setEntries(prev => prev.filter(e => e.id !== id));
    setSelected(null);
    // Deferred commit: actual DB delete fires only when toast expires.
    // Guard: only commit if the ref still holds this exact entry (prevents a stale
    // timer from firing after a second delete has replaced the ref with a different id).
    const timer = setTimeout(() => {
      if (pendingDeleteRef.current?.id === id) {
        commitPendingDelete();
        setLastAction(null);
      }
    }, 5000);
    pendingDeleteRef.current = { id, entry, timer };
    setLastAction({ type: "delete", entry });
  }, [entries, commitPendingDelete]);

  const handleUpdate = useCallback(async (id, changes) => {
    const previous = entries.find(e => e.id === id);
    if (!isOnline) {
      await enqueue({ id: crypto.randomUUID(), url: "/api/update-entry", method: "PATCH", body: JSON.stringify({ id, ...changes }), created_at: new Date().toISOString() });
      refreshCount();
      setEntries(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e));
      setSelected(prev => prev?.id === id ? { ...prev, ...changes } : prev);
      if (previous) setLastAction({ type: "update", id, previous: { title: previous.title, content: previous.content, type: previous.type, tags: previous.tags, metadata: previous.metadata } });
      return;
    }
    try {
      const res = await authFetch("/api/update-entry", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...changes }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data?.message || data?.error) ?? `HTTP ${res.status}`);
      if (Array.isArray(data) && data.length === 0) throw new Error(`No row matched id=${id}`);
    } catch (e) { captureError(e, 'handleUpdate'); showError(`Save failed: ${e.message}`); setSaveError(`Save failed: ${e.message}`); setTimeout(() => setSaveError(null), 5000); return; }
    // Fire-and-forget re-embedding for the updated entry (non-blocking)
    const embedHeaders = getEmbedHeaders();
    if (embedHeaders) {
      authFetch("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...embedHeaders },
        body: JSON.stringify({ entry_id: id }),
      }).catch(() => {}); // best-effort, never blocks
    }
    // ARCH-5: Re-index the updated entry so search stays accurate
    removeFromIndex(id);
    const updated = { ...entries.find(e => e.id === id), ...changes };
    indexEntry(updated);
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e));
    setSelected(prev => prev?.id === id ? { ...prev, ...changes } : prev);
    if (previous) setLastAction({ type: "update", id, previous: { title: previous.title, content: previous.content, type: previous.type, tags: previous.tags, metadata: previous.metadata } });
  }, [entries, isOnline, refreshCount]);

  const handleUndo = useCallback(() => {
    if (!lastAction) return;
    if (lastAction.type === "delete" && pendingDeleteRef.current) {
      clearTimeout(pendingDeleteRef.current.timer);
      setEntries(prev => [pendingDeleteRef.current.entry, ...prev]);
      pendingDeleteRef.current = null;
    }
    if (lastAction.type === "update") {
      const { id, previous } = lastAction;
      authFetch("/api/update-entry", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...previous }) }).catch(err => captureError(err, 'undo:update'));
      setEntries(prev => prev.map(e => e.id === id ? { ...e, ...previous } : e));
      setSelected(prev => prev?.id === id ? { ...prev, ...previous } : prev);
    }
    if (lastAction.type === "create") {
      const { id } = lastAction;
      authFetch("/api/delete-entry", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(err => captureError(err, 'undo:delete'));
      setEntries(prev => prev.filter(e => e.id !== id));
    }
    setLastAction(null);
  }, [lastAction]);

  const handleCreated = useCallback((newEntry) => {
    setLastAction({ type: "create", id: newEntry.id });
  }, []);

  // ─── Reorder / Renewal Reminder ───
  const handleReorder = useCallback(async (supplier) => {
    const due = new Date();
    const isRenewal = supplier._renewalMode;
    if (isRenewal) due.setMonth(due.getMonth() + 1); else due.setDate(due.getDate() + 7);
    const parsed = isRenewal ? {
      title: `Renew ${supplier.title}`,
      content: `Set a renewal reminder for ${supplier.title}.`,
      type: "reminder",
      metadata: { status: "pending", due_date: due.toISOString().split("T")[0] },
      tags: ["renewal", "admin"]
    } : {
      title: `Reorder from ${supplier.title.split(" - ")[0]}`,
      content: `Remember to place a reorder with ${supplier.title}.`,
      type: "reminder",
      metadata: { status: "pending", due_date: due.toISOString().split("T")[0] },
      tags: ["reorder", "smash burger bar"]
    };
    try {
      const res = await authFetch("/api/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_title: parsed.title, p_content: parsed.content, p_type: parsed.type, p_metadata: parsed.metadata, p_tags: parsed.tags }) });
      const result = res.ok ? await res.json() : null;
      const newEntry = { id: result?.id || Date.now().toString(), ...parsed, pinned: false, importance: 1, created_at: new Date().toISOString() };
      setEntries(prev => [newEntry, ...prev]);
      setLastAction({ type: "create", id: newEntry.id });
    } catch { /* silently fail */ }
  }, []);

  // ─── Chat context memoization (PERF-3) ───
  const chatContext = useMemo(() => {
    return entries.slice(0, 100).map(e => ({
      id: e.id,
      title: e.title,
      type: e.type,
      tags: e.tags,
      content: e.content ? e.content.slice(0, 200) : undefined,
    }));
  }, [entries]);

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMsgs(p => [...p, { role: "user", content: msg }]);
    setChatLoading(true);
    try {
      const embedHeaders = getEmbedHeaders();
      let data;
      if (embedHeaders && activeBrain?.id) {
        // RAG path: retrieve relevant entries server-side, send conversation history
        const provider = getUserProvider();
        const genKey = provider === "openrouter" ? getOpenRouterKey() : getUserApiKey();
        const model = provider === "openrouter" ? getOpenRouterModel() : getUserModel();
        const history = chatMsgs.slice(-10); // last 10 turns
        const res = await authFetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...embedHeaders,
            ...(genKey ? { "X-User-Api-Key": genKey } : {}),
          },
          body: JSON.stringify({ message: msg, brain_id: activeBrain.id, history, provider, model }),
        });
        data = await res.json();
      } else {
        // Fallback: existing top-100 context, no history
        const res = await callAI({
          max_tokens: 1000,
          system: PROMPTS.CHAT.replace("{{MEMORIES}}", JSON.stringify(chatContext)).replace("{{LINKS}}", JSON.stringify(links)),
          messages: [{ role: "user", content: msg }],
        });
        data = await res.json();
      }
      const content = data.content?.map(c => c.text || "").join("") || "Couldn't process.";
      if (containsSensitiveContent(content)) {
        const hasPinSet = !!getStoredPinHash();
        setPendingSecureMsg({ content });
        setPinGateIsSetup(!hasPinSet);
        setShowPinGate(true);
      } else {
        setChatMsgs(p => [...p, { role: "assistant", content }]);
      }
    } catch { setChatMsgs(p => [...p, { role: "assistant", content: "Connection error." }]); }
    setChatLoading(false);
  };

  const navViews = [
    { id: "grid", l: "Grid", ic: "▦" },
    { id: "suggest", l: "Fill Brain", ic: "✦" },
    { id: "refine", l: "Refine", ic: "◇" },
    { id: "calendar", l: "Calendar", ic: "📅" },
    { id: "todos", l: "Todos", ic: "✓" },
    { id: "timeline", l: "Timeline", ic: "◔" },
    { id: "graph", l: "Graph", ic: "◉" },
    { id: "chat", l: "Ask", ic: "◈" },
    { id: "settings", l: "Settings", ic: "⚙" },
  ];

  const entriesValue = useMemo(() => ({
    entries,
    setEntries,
    entriesLoaded,
    selected,
    setSelected,
    handleDelete,
    handleUpdate,
  }), [entries, setEntries, entriesLoaded, selected, setSelected, handleDelete, handleUpdate]);

  const brainValue = useMemo(() => ({
    activeBrain,
    brains,
    refresh,
    canInvite,
    canManageMembers,
  }), [activeBrain, brains, refresh, canInvite, canManageMembers]);

  return (
    <EntriesContext.Provider value={entriesValue}>
    <BrainContext.Provider value={brainValue}>
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "'Söhne', system-ui, -apple-system, sans-serif", transition: "background 0.25s, color 0.25s", overflowX: "hidden" }}>
      <div style={{ padding: "16px 12px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "nowrap", overflow: "hidden" }}>
          <div style={{ width: 32, height: 32, minWidth: 32, borderRadius: 10, background: "linear-gradient(135deg, #4ECDC4, #45B7D1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🧠</div>
          <div style={{ minWidth: 0 }}><h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.5, whiteSpace: "nowrap" }}>OpenBrain</h1><p style={{ margin: 0, fontSize: 10, color: t.textDim }}>Your eternal memory</p></div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {brains.length > 0 && (
              <BrainSwitcher
                brains={brains}
                activeBrain={activeBrain}
                onSwitch={setActiveBrain}
                onBrainCreated={async (brain) => {
                  await refresh();
                  setActiveBrain(brain);
                }}
                onBrainDeleted={deleteBrain}
                onBrainTip={(brain) => setShowBrainTip(brain)}
              />
            )}
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${isDark ? "#4a4a6a" : "#c0c0e0"}`, background: isDark ? "#2a2a4a" : "#ffffff", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}
            >
              {isDark ? "🌙" : "☀️"}
            </button>
            {/* Hamburger */}
            <button
              onClick={() => setNavOpen(o => !o)}
              title="Menu"
              style={{ width: 36, height: 36, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, cursor: "pointer", flexShrink: 0, padding: 0 }}
            >
              {[0,1,2].map(i => <div key={i} style={{ width: 16, height: 2, background: t.textMid, borderRadius: 1 }} />)}
            </button>
          </div>
        </div>
      </div>

      <QuickCapture entries={entries} setEntries={setEntries} links={links} addLinks={addLinks} onCreated={handleCreated} onUpdate={handleUpdate} brainId={activeBrain?.id} brains={brains} isOnline={isOnline} refreshCount={refreshCount} canWrite={canWrite} />

      {showBrainTip && (
        <BrainTipCard
          brain={showBrainTip}
          onDismiss={() => setShowBrainTip(null)}
          onFill={() => { setShowBrainTip(null); setView("suggest"); }}
        />
      )}

      {view === "grid" && nudge && <NudgeBanner nudge={nudge} onDismiss={() => { setNudge(null); sessionStorage.removeItem("openbrain_nudge"); }} />}

      {/* Slide-in nav panel */}
      {navOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000 }} onClick={() => setNavOpen(false)}>
          <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "75vw", maxWidth: 260, background: isDark ? "#16161e" : "#f8f8ff", borderLeft: `1px solid ${t.border}`, boxShadow: "-8px 0 32px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column", padding: "20px 0" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: "0 20px 16px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: t.textMid }}>Navigation</span>
              <button onClick={() => setNavOpen(false)} style={{ background: "none", border: "none", color: t.textDim, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
              {[{ id: "capture", l: "Capture", ic: "+" }, ...navViews].map(v => (
                <button key={v.id} onClick={() => { setView(v.id); setNavOpen(false); }}
                  style={{ width: "100%", textAlign: "left", padding: "12px 20px", border: "none", background: view === v.id ? (isDark ? "rgba(78,205,196,0.1)" : "rgba(78,205,196,0.15)") : "none", color: view === v.id ? "#4ECDC4" : t.text, fontSize: 14, fontWeight: view === v.id ? 700 : 400, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{v.ic}</span>
                  <span>{v.l}</span>
                  {v.id === "suggest" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#FF6B35", marginLeft: "auto" }} />}
                </button>
              ))}
            </div>
            <div style={{ padding: "8px 16px", borderTop: `1px solid ${t.border}` }}>
              <button
                onClick={() => { setNavOpen(false); setShowCreateBrain(true); }}
                style={{ width: "100%", padding: "10px 16px", background: "rgba(124,143,240,0.1)", border: "1px solid rgba(124,143,240,0.3)", borderRadius: 10, color: "#a5b4fc", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}
              >
                + Add Family or Business Brain
              </button>
            </div>
            <div style={{ padding: "8px 20px", borderTop: `1px solid ${t.border}`, fontSize: 11, color: t.textDim }}>
              {entries.length} memories · {pendingCount > 0 ? `${pendingCount} pending sync` : "synced"}
            </div>
          </div>
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

      <div style={{ padding: "12px 12px" }}>
        {view === "capture" && (
          <div style={{ textAlign: "center", paddingTop: 40, color: t.textDim }}>
            <p style={{ fontSize: 13, marginBottom: 20 }}>Tap ☰ to navigate — or just start capturing above.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {[{ id: "grid", l: "Memory Grid", ic: "▦" }, { id: "suggest", l: "Fill Brain", ic: "✦" }, { id: "calendar", l: "Calendar", ic: "📅" }, { id: "chat", l: "Ask", ic: "◈" }].map(v => (
                <button key={v.id} onClick={() => setView(v.id)} style={{ padding: "10px 18px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, color: t.textMid, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{v.ic} {v.l}</button>
              ))}
            </div>
          </div>
        )}
        {view === "grid" && <>
          {/* Workspace toggle — only show business tab if user has a business brain */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[
              { ws: "all", label: "All" },
              { ws: "personal", label: "👤 Personal" },
              ...(brains.some(b => b.type === "business") ? [{ ws: "business", label: "🏪 Business" }] : []),
            ].map(({ ws, label }) => (
              <button key={ws} onClick={() => { setWorkspace(ws); localStorage.setItem("openbrain_workspace", ws); }} style={{ padding: "5px 14px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", background: workspace === ws ? "#A29BFE" : t.surface, color: workspace === ws ? "#0f0f23" : t.textMuted, textTransform: "capitalize" }}>{label}</button>
            ))}
          </div>
          <div style={{ position: "relative", marginBottom: 16 }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: t.textFaint }}>⌕</span>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search..." style={{ width: "100%", boxSizing: "border-box", padding: "12px 16px 12px 38px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, color: t.textSoft, fontSize: 14, outline: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 16, scrollbarWidth: "none" }}>
            <button onClick={() => setTypeFilter("all")} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", background: typeFilter === "all" ? "#4ECDC4" : t.surface, color: typeFilter === "all" ? "#0f0f23" : t.textMuted }}>All ({entries.length})</button>
            {Object.entries(types).map(([typ, n]) => { const c = TC[typ] || TC.note; return <button key={typ} onClick={() => setTypeFilter(typ)} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", background: typeFilter === typ ? c.c : t.surface, color: typeFilter === typ ? "#0f0f23" : t.textMuted }}>{c.i} {typ} ({n})</button>; })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(70px, 1fr))", gap: 8, marginBottom: 16 }}>
            {[{ l: "Memories", v: entries.length, c: "#4ECDC4" }, { l: "Pinned", v: entries.filter(e => e.pinned).length, c: "#FFD700" }, { l: "Types", v: Object.keys(types).length, c: "#A29BFE" }, { l: "Links", v: links.length, c: "#FF6B35" }].map(s =>
              <div key={s.l} style={{ background: t.surface, borderRadius: 10, padding: "10px 8px", textAlign: "center", border: `1px solid ${t.border}` }}><div style={{ fontSize: 22, fontWeight: 800, color: s.c }}>{s.v}</div><div style={{ fontSize: 8, color: t.textDim, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{s.l}</div></div>
            )}
          </div>
          {filtered.length > 0 ? <VirtualGrid filtered={filtered} setSelected={setSelected} /> : <p style={{ textAlign: "center", color: "#555", marginTop: 40 }}>No memories match.</p>}
        </>}

        {view === "suppliers" && <SupplierPanel entries={entries} onSelect={setSelected} onReorder={handleReorder} />}
        {view === "suggest" && <Suspense fallback={<Loader />}><SuggestionsView entries={entries} setEntries={setEntries} activeBrain={activeBrain} brains={brains} /></Suspense>}
        {view === "refine" && <Suspense fallback={<Loader />}><RefineView entries={entries} setEntries={setEntries} links={links} addLinks={addLinks} activeBrain={activeBrain} brains={brains} onSwitchBrain={setActiveBrain} /></Suspense>}
        {view === "calendar" && <Suspense fallback={<Loader />}><CalendarView /></Suspense>}
        {view === "todos" && <Suspense fallback={<Loader />}><TodoView /></Suspense>}
        {view === "timeline" && <VirtualTimeline sorted={sortedTimeline} setSelected={setSelected} />}
        {view === "graph" && <Suspense fallback={<Loader />}><p style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>Knowledge graph — click nodes to view</p><GraphView onSelect={setSelected} entries={entries} links={links} /></Suspense>}

        {view === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 220px)", maxHeight: "calc(100dvh - 220px)" }}>
            <div style={{ flex: 1, overflow: "auto", marginBottom: 12 }}>
              {chatMsgs.map((m, i) => (
                <div key={i} style={{ marginBottom: 12, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "85%", padding: "10px 14px", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: m.role === "user" ? "#4ECDC4" : t.surface, color: m.role === "user" ? "#0f0f23" : t.textMid, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word" }}>
                    {m.role === "assistant" ? m.content.split(PHONE_REGEX).map((part, pi) =>
                      PHONE_REGEX.test(part)
                        ? <a key={pi} href={`tel:${part}`} style={{ color: "#4ECDC4", fontWeight: 700, textDecoration: "none" }}>{part}</a>
                        : part
                    ) : m.content}
                  </div>
                </div>
              ))}
              {chatLoading && <div style={{ display: "flex" }}><div style={{ padding: "12px 16px", borderRadius: "16px 16px 16px 4px", background: t.surface, color: t.textDim }}>Thinking...</div></div>}
              <div ref={chatEndRef} />
            </div>
            {/* Quick-ask chips */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {CHAT_CHIPS.map(chip => (
                <button key={chip.label} onClick={() => setChatInput(chip.text)} style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${t.border}`, background: t.surface, color: t.textMuted, fontSize: 11, cursor: "pointer" }}>{chip.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleChat()} placeholder="Ask about your memories..." style={{ flex: 1, padding: "12px 16px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, color: t.textSoft, fontSize: 14, outline: "none" }} />
              <button onClick={handleChat} disabled={chatLoading} style={{ padding: "12px 20px", background: "#4ECDC4", border: "none", borderRadius: 12, color: "#0f0f23", fontWeight: 700, cursor: "pointer", opacity: chatLoading ? 0.5 : 1 }}>→</button>
            </div>
          </div>
        )}

        {view === "settings" && <SettingsView />}
      </div>

      <Suspense fallback={null}>
        <DetailModal
          entry={selected}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
          onReorder={handleReorder}
          entries={entries}
          links={links}
          canWrite={canWrite}
          brains={brains}
        />
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

      {saveError && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: t.surface, border: `1px solid ${t.error}`, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, zIndex: 2000, boxShadow: "0 4px 20px #0008", minWidth: 240, maxWidth: "calc(100vw - 32px)", boxSizing: "border-box" }}>
          <span style={{ fontSize: 14, color: t.error }}>⚠ {saveError}</span>
          <button onClick={() => setSaveError(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#666", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
      )}

      {showPinGate && (
        <PinGate
          isSetup={pinGateIsSetup}
          onSuccess={() => {
            if (pendingSecureMsg) {
              setChatMsgs(p => [...p, { role: "assistant", content: pendingSecureMsg.content }]);
              setPendingSecureMsg(null);
            }
            setShowPinGate(false);
            setPinGateIsSetup(false);
          }}
          onCancel={() => {
            setPendingSecureMsg(null);
            setShowPinGate(false);
            setPinGateIsSetup(false);
          }}
        />
      )}

      {showOnboarding && (
        <OnboardingModal
          onComplete={(selected, answeredItems, skippedQs) => {
            // Mark answered onboarding questions so they don't re-appear in Fill Brain
            if (answeredItems?.length) {
              try {
                const key = "openbrain_answered_qs";
                const existing = new Set(JSON.parse(localStorage.getItem(key) || "[]"));
                answeredItems.forEach(item => existing.add(item.q));
                localStorage.setItem(key, JSON.stringify([...existing]));
              } catch {}

              // Batch-save answered items to the brain via Quick Capture API
              answeredItems.forEach(item => {
                callAI({
                  max_tokens: 800,
                  system: PROMPTS.QA_PARSE,
                  messages: [{ role: "user", content: `Question: ${item.q}\nAnswer: ${item.a}` }]
                })
                  .then(r => r.json())
                  .then(data => {
                    let parsed = {};
                    try { parsed = JSON.parse((data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim()); } catch {}
                    if (parsed.title && activeBrain?.id) {
                      authFetch("/api/capture", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          p_title: parsed.title,
                          p_content: parsed.content || item.a,
                          p_type: parsed.type || "note",
                          p_metadata: parsed.metadata || {},
                          p_tags: parsed.tags || [],
                          p_brain_id: activeBrain.id,
                        })
                      }).catch(err => console.error('[OpenBrain:onboarding] Failed to save parsed Q&A', err));
                    }
                  })
                  .catch(err => console.error('[OpenBrain:onboarding] Failed to parse Q&A with AI', err));
              });
            }

            // Store skipped onboarding questions — Fill Brain will surface them
            if (skippedQs?.length) {
              try {
                const existing = JSON.parse(localStorage.getItem("openbrain_onboarding_skipped") || "[]");
                const merged = [...existing];
                skippedQs.forEach(q => {
                  if (!merged.find(e => e.q === q.q)) merged.push(q);
                });
                localStorage.setItem("openbrain_onboarding_skipped", JSON.stringify(merged));
              } catch {}
            }

            setShowOnboarding(false);
            setView("suggest");
          }}
        />
      )}
    </div>
    </BrainContext.Provider>
    </EntriesContext.Provider>
  );
}
