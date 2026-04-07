// @ts-nocheck
import { useState, useMemo, useRef, useEffect, useCallback, lazy, Suspense, memo } from "react";
import { useTheme } from "./ThemeContext";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { authFetch } from "./lib/authFetch";
import { callAI } from "./lib/ai";
import { extractNudgeText } from "./lib/extractNudgeText";
import { scoreEntriesForQuery } from "./lib/chatContext";
import {
  getEmbedHeaders,
  getUserProvider,
  getUserModel,
  getUserApiKey,
  getOpenRouterKey,
  getOpenRouterModel,
} from "./lib/aiSettings";
import { encryptEntry, decryptEntry, unlockVault, decryptVaultKeyFromRecovery } from "./lib/crypto";
import { PROMPTS } from "./config/prompts";
import { TC, fmtD, MODEL, INITIAL_ENTRIES, LINKS } from "./data/constants";
import { getTypeIcons, registerTypeIcon, pickDefaultIcon, resolveIcon } from "./lib/typeIcons";
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

import BottomNav from "./components/BottomNav";
import MobileHeader from "./components/MobileHeader";
import DesktopSidebar from "./components/DesktopSidebar";
import SkeletonCard from "./components/SkeletonCard";
import SettingsView from "./views/SettingsView";
import { inferWorkspace } from "./lib/workspaceInfer";
import { EntriesContext } from "./context/EntriesContext";
import { BrainContext } from "./context/BrainContext";

const SuggestionsView = lazy(() => import("./views/SuggestionsView"));
const RefineView = lazy(() => import("./views/RefineView"));
const TodoView = lazy(() => import("./views/TodoView"));
const DetailModal = lazy(() => import("./views/DetailModal"));
const VaultView = lazy(() => import("./views/VaultView"));

function Loader() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <SkeletonCard count={3} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   UNDO TOAST
   ═══════════════════════════════════════════════════════════════ */
function UndoToast({ action, onUndo, onDismiss }) {
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
  const isDelete = action.type === "delete";
  return (
    <div
      role="alert"
      className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-sm overflow-hidden rounded-2xl border"
      style={{
        background: "rgba(26,25,25,0.95)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderColor: isDelete ? "rgba(255,110,132,0.20)" : "rgba(114,239,245,0.15)",
        boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
        animation: "slide-up 0.25s ease-out",
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
          style={{ background: isDelete ? "rgba(255,110,132,0.1)" : "rgba(114,239,245,0.1)" }}
        >
          {isDelete ? "🗑" : "✓"}
        </div>
        <span className="flex-1 text-sm font-medium text-on-surface">{label}</span>
        {action.type !== "create" && (
          <button
            onClick={onUndo}
            className="text-primary text-xs font-bold uppercase tracking-widest hover:text-primary-dim transition-colors press-scale"
          >
            Undo
          </button>
        )}
        <button onClick={onDismiss} className="text-on-surface-variant hover:text-on-surface transition-colors ml-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {/* Progress bar */}
      <div className="h-0.5 w-full" style={{ background: "rgba(72,72,71,0.2)" }}>
        <div
          className="h-full transition-none rounded-full"
          style={{
            width: `${pct}%`,
            background: isDelete ? "#ff6e84" : "#72eff5",
          }}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NUDGE BANNER
   ═══════════════════════════════════════════════════════════════ */
function NudgeBanner({ nudge, onDismiss }) {
  if (!nudge) return null;
  return (
    <div
      className="flex items-start gap-3 p-4 rounded-2xl mb-4 border"
      style={{
        background: "rgba(213,117,255,0.06)",
        borderColor: "rgba(213,117,255,0.15)",
      }}
    >
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
        style={{ background: "rgba(213,117,255,0.12)" }}
      >
        💡
      </div>
      <p className="flex-1 text-sm text-on-surface-variant leading-relaxed">{nudge}</p>
      <button
        onClick={onDismiss}
        className="text-on-surface-variant/50 hover:text-on-surface transition-colors flex-shrink-0 mt-0.5 press-scale"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PASSWORD FIREWALL
   ═══════════════════════════════════════════════════════════════ */
const SENSITIVE_RE =
  /\b(password|passcode|passphrase|credentials|wifi\s*(key|password)|network\s*key|bank\s*(account|pin|number|detail)|id\s*number|passport\s*number|secret\s*key|secret\s*word|pin\s*number|access\s*code)\b/i;
function containsSensitiveContent(text) {
  return SENSITIVE_RE.test(text);
}

/* ═══════════════════════════════════════════════════════════════
   ENTRY CARD
   ═══════════════════════════════════════════════════════════════ */
const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  note:     { bg: "rgba(114,239,245,0.10)", text: "#72eff5" },
  person:   { bg: "rgba(114,239,245,0.10)", text: "#72eff5" },
  document: { bg: "rgba(213,117,255,0.10)", text: "#d575ff" },
  secret:   { bg: "rgba(255,154,195,0.10)", text: "#ff9ac3" },
  reminder: { bg: "rgba(255,110,132,0.10)", text: "#ff6e84" },
  supplier: { bg: "rgba(213,117,255,0.10)", text: "#d575ff" },
  default:  { bg: "rgba(114,239,245,0.10)", text: "#72eff5" },
};

const EntryCard = memo(function EntryCard({ entry: e, onSelect, typeIcons = {} }) {
  const cfg = { ...(TC[e.type] || TC.note), i: resolveIcon(e.type, typeIcons) };
  const imp = { 1: "Important", 2: "Critical" }[e.importance];
  const colors = TYPE_COLORS[e.type] || TYPE_COLORS.default;
  return (
    <article
      onClick={() => onSelect(e)}
      className="group cursor-pointer rounded-3xl p-5 border transition-all duration-300 hover:-translate-y-0.5 press-scale"
      style={{
        background: "#1a1919",
        borderColor: "rgba(72,72,71,0.05)",
      }}
      onMouseEnter={(el) => { (el.currentTarget as HTMLElement).style.borderColor = "rgba(114,239,245,0.15)"; (el.currentTarget as HTMLElement).style.background = "#1e1d1d"; }}
      onMouseLeave={(el) => { (el.currentTarget as HTMLElement).style.borderColor = "rgba(72,72,71,0.05)"; (el.currentTarget as HTMLElement).style.background = "#1a1919"; }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ background: colors.bg }}>
            <span style={{ color: colors.text }}>{cfg.i}</span>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant/60">{e.type}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {e.pinned && <span style={{ color: "#72eff5", fontSize: 12 }}>📌</span>}
          {imp && (
            <span
              className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{ background: imp === "Critical" ? "rgba(255,110,132,0.12)" : "rgba(255,154,195,0.10)", color: imp === "Critical" ? "#ff6e84" : "#ff9ac3" }}
            >
              {imp}
            </span>
          )}
        </div>
      </div>

      {/* Title */}
      <h3 className="font-bold text-on-surface leading-tight tracking-tight line-clamp-2 mb-2 text-base" style={{ fontFamily: "'Manrope', sans-serif" }}>
        {e.title}
      </h3>

      {/* Content */}
      {e.type === "secret" ? (
        <p className="text-sm text-on-surface-variant/60 italic mb-3">🔒 Encrypted — tap to reveal</p>
      ) : e.content ? (
        <p className="text-sm text-on-surface-variant line-clamp-2 mb-3 leading-relaxed">{e.content}</p>
      ) : null}

      {/* Tags */}
      {e.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-auto">
          {e.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "#262626", color: "#d575ff", border: "1px solid rgba(213,117,255,0.12)" }}>
              #{tag}
            </span>
          ))}
          {e.tags.length > 3 && (
            <span className="text-[10px] text-on-surface-variant/50 px-1">+{e.tags.length - 3}</span>
          )}
        </div>
      )}
    </article>
  );
});

/* ═══════════════════════════════════════════════════════════════
   VIRTUALISED GRID
   ═══════════════════════════════════════════════════════════════ */
function VirtualGrid({ filtered, setSelected, typeIcons = {} }) {
  const COLS = typeof window !== "undefined"
    ? window.innerWidth >= 1280 ? 3 : window.innerWidth >= 640 ? 2 : 1
    : 1;
  const rows = useMemo(() => {
    const r = [];
    for (let i = 0; i < filtered.length; i += COLS) r.push(filtered.slice(i, i + COLS));
    return r;
  }, [filtered, COLS]);
  const listRef = useRef(null);
  const ROW_GAP = 16;
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 190 + ROW_GAP,
    overscan: 4,
    scrollMargin: listRef.current?.offsetTop ?? 0,
    measureElement: (el) => el.getBoundingClientRect().height,
  });
  return (
    <div ref={listRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vRow) => (
          <div
            key={vRow.index}
            data-index={vRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: vRow.start - virtualizer.options.scrollMargin,
              left: 0,
              right: 0,
              display: "grid",
              gridTemplateColumns: `repeat(${COLS}, 1fr)`,
              gap: "16px",
              paddingBottom: "16px",
            }}
          >
            {rows[vRow.index].map((e) => (
              <EntryCard key={e.id} entry={e} onSelect={setSelected} typeIcons={typeIcons} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VIRTUALISED TIMELINE
   ═══════════════════════════════════════════════════════════════ */
function VirtualTimeline({ sorted, setSelected, typeIcons = {} }) {
  const listRef = useRef(null);
  const virtualizer = useWindowVirtualizer({
    count: sorted.length,
    estimateSize: () => 64,
    overscan: 5,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });
  return (
    <div ref={listRef} className="relative">
      <div className="absolute left-6 top-0 bottom-0 w-px" style={{ background: "rgba(72,72,71,0.15)" }} />
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const e = sorted[vItem.index];
          const cfg = { ...(TC[e.type] || TC.note), i: resolveIcon(e.type, typeIcons) };
          return (
            <div
              key={e.id}
              style={{ position: "absolute", top: vItem.start - virtualizer.options.scrollMargin, left: 0, right: 0 }}
              className="flex items-center gap-4 pl-4 pr-4 py-2.5 cursor-pointer group"
              onClick={() => setSelected(e)}
            >
              <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center z-10" style={{ background: "#1a1919", border: "2px solid rgba(114,239,245,0.3)" }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#72eff5" }} />
              </div>
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant/50 font-semibold flex-shrink-0 w-20">{fmtD(e.created_at)}</p>
              <div className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2 rounded-xl transition-colors group-hover:bg-surface-container">
                <span className="text-sm flex-shrink-0">{cfg.i}</span>
                <span className="text-sm text-on-surface truncate">{e.title}</span>
              </div>
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


export default function OpenBrain() {
  // PERF-8: Initial state uses synchronous localStorage read (fast, no flicker).
  // A useEffect below loads from IndexedDB (the primary cache) and updates if needed.
  const [entries, setEntries] = useState(() => {
    try {
      const cached = localStorage.getItem("openbrain_entries");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (
          Array.isArray(parsed) &&
          parsed.every((e) => e && typeof e.id === "string" && typeof e.title === "string")
        )
          return parsed;
      }
    } catch {}
    return [];
  });
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const [cryptoKey, setCryptoKey] = useState(null);

  // Vault unlock callback — stores derived key in state for the session
  const handleVaultUnlock = useCallback((key) => {
    setCryptoKey(key);
    // If key is set and we have entries, decrypt secret entries in-place
    if (key) {
      setEntries((prev) => {
        // Trigger async decrypt, will update state when done
        Promise.all(prev.map((e) => (e.type === "secret" ? decryptEntry(e, key) : e))).then(
          (decrypted) => setEntries(decrypted),
        );
        return prev;
      });
    }
  }, []);

  // PERF-8: On mount, upgrade the initial state from IndexedDB (richer than localStorage).
  // Only runs once; if IDB has data and localStorage was empty/stale, this hydrates faster.
  useEffect(() => {
    readEntriesCache()
      .then((cached) => {
        if (cached && cached.length > 0) {
          setEntries((prev) => (prev.length === 0 ? cached : prev));
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Brain context + role ───
  const {
    brains,
    activeBrain,
    setActiveBrain,
    createBrain,
    deleteBrain,
    refresh,
    loading: brainsLoading,
  } = useBrainHook(
    useCallback(() => {
      // Reset local state when brain switches
      setEntries([]);
      setLinks([]);
      setEntriesLoaded(false);
    }, []),
  );

  const { isOnline, pendingCount, sync, refreshCount } = useOfflineSync({
    onEntryIdUpdate: useCallback((tempId, realId) => {
      setEntries((prev) => prev.map((e) => (e.id === tempId ? { ...e, id: realId } : e)));
    }, []),
  });

  // Drain offline queue on mount when online
  useEffect(() => {
    if (isOnline) sync();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a ref so timer callbacks can read current isOnline without stale closure
  const isOnlineRef = useRef(isOnline);
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [workspace, setWorkspace] = useState(
    () => localStorage.getItem("openbrain_workspace") || "all",
  );
  const [view, setView] = useState("capture");
  const [navOpen, setNavOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [links, setLinks] = useState(LINKS);
  const addLinks = (newLinks) => setLinks((prev) => [...prev, ...newLinks]);
  const [typeIcons, setTypeIcons] = useState<Record<string, string>>({});
  // Reload typeIcons whenever the active brain changes
  const refreshTypeIcons = useCallback(() => {
    if (activeBrain?.id) setTypeIcons(getTypeIcons(activeBrain.id));
  }, [activeBrain?.id]);
  const { canWrite, canInvite, canManageMembers, role: myRole } = useRole(activeBrain);
  const { isDark, toggleTheme } = useTheme();
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem("openbrain_onboarded"),
  );
  // Skip onboarding for existing users on new browsers — if they already have brains, they're not new
  useEffect(() => {
    if (showOnboarding && brains.length > 0) {
      localStorage.setItem("openbrain_onboarded", "1");
      setShowOnboarding(false);
    }
  }, [brains, showOnboarding]);
  useEffect(() => {
    const handler = () => setShowOnboarding(true);
    window.addEventListener("openbrain:restart-onboarding", handler);
    return () => window.removeEventListener("openbrain:restart-onboarding", handler);
  }, []);
  const [showBrainTip, setShowBrainTip] = useState(null);
  const [showCreateBrain, setShowCreateBrain] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [searchAllBrains, setSearchAllBrains] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([
    {
      role: "assistant",
      content:
        'Hey! Ask me about your memories — "What\'s my ID number?", "Who are my suppliers?", etc.',
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [pendingSecureMsg, setPendingSecureMsg] = useState(null);
  const [showPinGate, setShowPinGate] = useState(false);
  const [pinGateIsSetup, setPinGateIsSetup] = useState(false);
  // Vault unlock modal state (triggered from chat when user asks about secrets)
  const [vaultUnlockModal, setVaultUnlockModal] = useState(null); // { vaultData, pendingMsg }
  const [vaultModalInput, setVaultModalInput] = useState("");
  const [vaultModalMode, setVaultModalMode] = useState("passphrase"); // "passphrase" | "recovery"
  const [vaultModalError, setVaultModalError] = useState("");
  const [vaultModalBusy, setVaultModalBusy] = useState(false);
  const [vaultExists, setVaultExists] = useState(false); // whether server has a vault for this user
  const [nudge, setNudge] = useState(() => sessionStorage.getItem("openbrain_nudge") || null);
  const [lastAction, setLastAction] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const pendingDeleteRef = useRef(null);
  const chatEndRef = useRef(null);

  // Check if user has a vault set up (for chat unlock prompts)
  useEffect(() => {
    authFetch("/api/vault")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.exists) setVaultExists(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs]);

  useEffect(() => {
    if (activeBrain?.id) setTypeIcons(getTypeIcons(activeBrain.id));
  }, [activeBrain?.id]);

  useEffect(() => {
    if (!activeBrain?.id) return;
    setEntriesLoaded(false);
    const url = `/api/entries?brain_id=${encodeURIComponent(activeBrain.id)}`;
    authFetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        // Support both paginated { entries, nextCursor } and legacy plain array responses
        const entries = Array.isArray(data) ? data : (data?.entries ?? []);
        if (entries.length > 0) {
          // Secret entries stay encrypted in state until vault is unlocked
          setEntries(entries);
          writeEntriesCache(entries); // PERF-8: write to IDB (with localStorage fallback)
          // ARCH-5: Build search index at load time (skip secret entries — encrypted)
          entries.filter((e) => e.type !== "secret").forEach(indexEntry);
        }
        setEntriesLoaded(true);
      })
      .catch((err) => {
        captureError(err, "fetchEntries");
        setEntriesLoaded(true);
      });
    // Load similarity links from embeddings
    authFetch(`/api/search?brain_id=${encodeURIComponent(activeBrain.id)}&threshold=0.55`)
      .then(async (r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const linkArr = Array.isArray(data) ? data : data.links || [];
        if (linkArr.length > 0) setLinks(linkArr);
      })
      .catch(() => {});
  }, [activeBrain?.id]);

  // Proactive intelligence nudge — runs once per session after entries load
  useEffect(() => {
    if (!entriesLoaded || sessionStorage.getItem("openbrain_nudge") !== null) return;
    const recent = entries
      .slice(0, 30)
      .map((e) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        tags: e.tags,
        metadata: e.metadata,
        created_at: e.created_at,
      }));
    callAI({
      max_tokens: 200,
      system: PROMPTS.NUDGE,
      brainId: activeBrain?.id,
      messages: [
        {
          role: "user",
          content: `My recent memories:\n${JSON.stringify(recent)}\n\nWhat should I know right now?`,
        },
      ],
    })
      .then((r) => r.json())
      .then((data) => {
        const text = extractNudgeText(data);
        if (text) {
          setNudge(text);
          sessionStorage.setItem("openbrain_nudge", text);
        } else sessionStorage.setItem("openbrain_nudge", "");
      })
      .catch(() => sessionStorage.setItem("openbrain_nudge", ""));
  }, [entriesLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!entriesLoaded) return;
    const t = setTimeout(() => {
      writeEntriesCache(entries);
    }, 3000); // PERF-8: debounced IDB write
    return () => clearTimeout(t);
  }, [entries, entriesLoaded]);

  const types = useMemo(() => {
    const t = {};
    entries.forEach((e) => {
      t[e.type] = (t[e.type] || 0) + 1;
    });
    return t;
  }, [entries]);

  const filtered = useMemo(() => {
    let r = entries;
    if (workspace !== "all")
      r = r.filter((e) => {
        const ws = inferWorkspace(e);
        return ws === workspace || ws === "both";
      });
    if (typeFilter !== "all") r = r.filter((e) => e.type === typeFilter);
    if (search) {
      // ARCH-5: Use pre-computed inverted index — O(k) lookup instead of O(n) full scan
      const matchIds = searchIndex(search);
      if (matchIds) {
        r = r.filter((e) => matchIds.has(e.id));
      } else {
        // Fallback: index returned null (empty query), no filter applied
      }
    }
    return r;
  }, [search, typeFilter, workspace, entries]);

  const sortedTimeline = useMemo(
    () => [...filtered].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [filtered],
  );

  // ─── Undo system ───
  const commitPendingDelete = useCallback(() => {
    if (!pendingDeleteRef.current) return;
    const { id } = pendingDeleteRef.current;
    if (isOnlineRef.current) {
      authFetch("/api/delete-entry", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      }).catch((err) => captureError(err, "commitPendingDelete"));
    } else {
      enqueue({
        id: crypto.randomUUID(),
        url: "/api/delete-entry",
        method: "DELETE",
        body: JSON.stringify({ id }),
        created_at: new Date().toISOString(),
      }).then(refreshCount);
    }
    pendingDeleteRef.current = null;
  }, [refreshCount]);

  const handleDelete = useCallback(
    (id) => {
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;
      commitPendingDelete();
      removeFromIndex(id); // ARCH-5: keep search index consistent
      setEntries((prev) => prev.filter((e) => e.id !== id));
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
    },
    [entries, commitPendingDelete],
  );

  const handleUpdate = useCallback(
    async (id, changes) => {
      const previous = entries.find((e) => e.id === id);
      if (!isOnline) {
        await enqueue({
          id: crypto.randomUUID(),
          url: "/api/update-entry",
          method: "PATCH",
          body: JSON.stringify({ id, ...changes }),
          created_at: new Date().toISOString(),
        });
        refreshCount();
        setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...changes } : e)));
        setSelected((prev) => (prev?.id === id ? { ...prev, ...changes } : prev));
        if (previous)
          setLastAction({
            type: "update",
            id,
            previous: {
              title: previous.title,
              content: previous.content,
              type: previous.type,
              tags: previous.tags,
              metadata: previous.metadata,
            },
          });
        return;
      }
      // E2E: encrypt content & metadata for secret entries before sending to server
      const entryType = changes.type || previous?.type;
      const isSecret = entryType === "secret";
      let serverChanges = { ...changes };
      if (isSecret && cryptoKey && (changes.content || changes.metadata)) {
        const encrypted = await encryptEntry(
          { content: changes.content, metadata: changes.metadata },
          cryptoKey,
        );
        if (changes.content) serverChanges.content = encrypted.content;
        if (changes.metadata) serverChanges.metadata = encrypted.metadata;
      }
      try {
        const res = await authFetch("/api/update-entry", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...serverChanges }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data?.message || data?.error) ?? `HTTP ${res.status}`);
        if (Array.isArray(data) && data.length === 0) throw new Error(`No row matched id=${id}`);
      } catch (e) {
        captureError(e, "handleUpdate");
        showError(`Save failed: ${e.message}`);
        setSaveError(`Save failed: ${e.message}`);
        setTimeout(() => setSaveError(null), 5000);
        return;
      }
      // Fire-and-forget re-embedding (skip for secret entries — encrypted content can't be embedded)
      if (!isSecret) {
        const embedHeaders = getEmbedHeaders();
        if (embedHeaders) {
          authFetch("/api/embed", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...embedHeaders },
            body: JSON.stringify({ entry_id: id }),
          }).catch(() => {}); // best-effort, never blocks
        }
      }
      // ARCH-5: Re-index the updated entry so search stays accurate
      removeFromIndex(id);
      const updated = { ...entries.find((e) => e.id === id), ...changes };
      indexEntry(updated);
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...changes } : e)));
      setSelected((prev) => (prev?.id === id ? { ...prev, ...changes } : prev));
      if (previous)
        setLastAction({
          type: "update",
          id,
          previous: {
            title: previous.title,
            content: previous.content,
            type: previous.type,
            tags: previous.tags,
            metadata: previous.metadata,
          },
        });
    },
    [entries, isOnline, refreshCount],
  );

  const handleUndo = useCallback(() => {
    if (!lastAction) return;
    if (lastAction.type === "delete" && pendingDeleteRef.current) {
      clearTimeout(pendingDeleteRef.current.timer);
      setEntries((prev) => [pendingDeleteRef.current.entry, ...prev]);
      pendingDeleteRef.current = null;
    }
    if (lastAction.type === "update") {
      const { id, previous } = lastAction;
      authFetch("/api/update-entry", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...previous }),
      }).catch((err) => captureError(err, "undo:update"));
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...previous } : e)));
      setSelected((prev) => (prev?.id === id ? { ...prev, ...previous } : prev));
    }
    if (lastAction.type === "create") {
      const { id } = lastAction;
      authFetch("/api/delete-entry", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      }).catch((err) => captureError(err, "undo:delete"));
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }
    setLastAction(null);
  }, [lastAction]);

  const handleCreated = useCallback((newEntry) => {
    setLastAction({ type: "create", id: newEntry.id });
  }, []);


  // ─── Chat context memoization (PERF-3) ───
  const chatContext = useMemo(() => {
    return entries.slice(0, 100).map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      tags: e.tags,
      content: e.content ? e.content.slice(0, 200) : undefined,
    }));
  }, [entries]);

  // Regex to detect when user is asking about vault-stored secrets
  const SECRET_QUERY_RE =
    /\b(password|passcode|passphrase|credentials|login|wifi\s*(key|password)|network\s*key|bank\s*(account|pin|number|detail)|credit\s*card|cvv|routing\s*number|secret|vault)\b/i;

  // Core chat send logic — used by both handleChat and post-vault-unlock retry
  const sendChat = useCallback(
    async (msg, overrideSecrets) => {
      setChatLoading(true);
      try {
        const secrets =
          overrideSecrets ||
          (cryptoKey
            ? entries
                .filter((e) => e.type === "secret")
                .map((e) => ({ title: e.title, content: e.content?.slice(0, 500), tags: e.tags }))
            : []);

        const embedHeaders = getEmbedHeaders();
        let data;
        if (embedHeaders && activeBrain?.id) {
          const provider = getUserProvider();
          const genKey = provider === "openrouter" ? getOpenRouterKey() : getUserApiKey();
          const model = provider === "openrouter" ? getOpenRouterModel() : getUserModel();
          const history = chatMsgs.slice(-10);
          const isAllBrains = searchAllBrains && brains.length > 1;
          // In single-brain mode, send keyword-scored entries as a fallback for
          // when no vector matches exist (i.e. entries haven't been embedded yet).
          // In all-brains mode the server fetches recent entries itself.
          const keywordFallback = isAllBrains
            ? []
            : scoreEntriesForQuery(
                entries.map((e) => ({
                  id: e.id,
                  title: e.title,
                  type: e.type,
                  tags: e.tags || [],
                  content: e.content ? e.content.slice(0, 200) : undefined,
                })),
                msg,
              ).slice(0, 40);
          const brainParam = isAllBrains
            ? { brain_ids: brains.map((b) => b.id) }
            : { brain_id: activeBrain.id };
          const res = await authFetch("/api/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...embedHeaders,
              ...(genKey ? { "X-User-Api-Key": genKey } : {}),
            },
            body: JSON.stringify({
              message: msg,
              ...brainParam,
              history,
              provider,
              model,
              secrets,
              ...(isAllBrains ? {} : { fallback_entries: keywordFallback }),
            }),
          });
          data = await res.json();
        } else {
          // Keyword-score entries against the query so the most relevant
          // ones appear first in the context window, not just the oldest 100.
          const relevantEntries = scoreEntriesForQuery(
            entries.map((e) => ({
              id: e.id,
              title: e.title,
              type: e.type,
              tags: e.tags || [],
              content: e.content ? e.content.slice(0, 200) : undefined,
            })),
            msg,
          ).slice(0, 60);
          const contextWithSecrets = secrets.length
            ? [...relevantEntries, ...secrets.map((s) => ({ ...s, type: "secret" }))]
            : relevantEntries;
          const res = await callAI({
            max_tokens: 1000,
            system: PROMPTS.CHAT.replace(
              "{{MEMORIES}}",
              JSON.stringify(contextWithSecrets),
            ).replace("{{LINKS}}", JSON.stringify(links)),
            brainId: activeBrain?.id,
            messages: [{ role: "user", content: msg }],
          });
          data = await res.json();
        }
        const content = extractNudgeText(data) || data.content?.map((c: any) => c.text || "").join("") || "Couldn't process.";
        if (containsSensitiveContent(content)) {
          const hasPinSet = !!getStoredPinHash();
          setPendingSecureMsg({ content });
          setPinGateIsSetup(!hasPinSet);
          setShowPinGate(true);
        } else {
          setChatMsgs((p) => [...p, { role: "assistant", content }]);
        }
      } catch {
        setChatMsgs((p) => [...p, { role: "assistant", content: "Connection error." }]);
      }
      setChatLoading(false);
    },
    [cryptoKey, entries, links, chatMsgs, activeBrain, searchAllBrains, brains],
  );

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMsgs((p) => [...p, { role: "user", content: msg }]);

    // If the message asks about secrets and vault is locked, prompt to unlock first
    if (!cryptoKey && vaultExists && SECRET_QUERY_RE.test(msg)) {
      // Fetch vault data for unlock modal
      try {
        const r = await authFetch("/api/vault");
        const vd = r.ok ? await r.json() : null;
        if (vd?.exists) {
          setVaultUnlockModal({ vaultData: vd, pendingMsg: msg });
          setVaultModalInput("");
          setVaultModalMode("passphrase");
          setVaultModalError("");
          setChatMsgs((p) => [
            ...p,
            {
              role: "assistant",
              content:
                "🔐 That looks like a question about your vault secrets. Please unlock your vault to continue.",
            },
          ]);
          return;
        }
      } catch {}
    }

    await sendChat(msg);
  };

  // Handle vault unlock from the chat modal
  const handleVaultModalUnlock = async () => {
    if (!vaultUnlockModal || !vaultModalInput.trim()) return;
    setVaultModalBusy(true);
    setVaultModalError("");
    const { vaultData, pendingMsg } = vaultUnlockModal;
    try {
      let key;
      if (vaultModalMode === "passphrase") {
        key = await unlockVault(vaultModalInput, vaultData.salt, vaultData.verify_token);
      } else {
        key = await decryptVaultKeyFromRecovery(
          vaultData.recovery_blob,
          vaultModalInput.trim().toUpperCase(),
        );
      }
      if (!key) {
        setVaultModalError(
          vaultModalMode === "passphrase" ? "Wrong passphrase" : "Wrong recovery key",
        );
        setVaultModalBusy(false);
        return;
      }
      // Unlock vault globally
      handleVaultUnlock(key);
      setVaultUnlockModal(null);
      // Decrypt secrets and re-send the pending message
      const decryptedEntries = await Promise.all(
        entries.filter((e) => e.type === "secret").map((e) => decryptEntry(e, key)),
      );
      const secrets = decryptedEntries.map((e) => ({
        title: e.title,
        content: e.content?.slice(0, 500),
        tags: e.tags,
      }));
      await sendChat(pendingMsg, secrets);
    } catch {
      setVaultModalError("Unlock failed");
    }
    setVaultModalBusy(false);
  };

  const navViews = [
    { id: "grid", l: "Grid", ic: "▦" },
    { id: "suggest", l: "Fill Brain", ic: "✦" },
    { id: "refine", l: "Refine", ic: "✦" },
    { id: "todos", l: "Todos", ic: "✓" },
    { id: "timeline", l: "Timeline", ic: "◔" },
    { id: "vault", l: "Vault", ic: "🔐" },
    { id: "chat", l: "Ask", ic: "◈" },
    { id: "settings", l: "Settings", ic: "⚙" },
  ];

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
      refresh,
      canInvite,
      canManageMembers,
    }),
    [activeBrain, brains, refresh, canInvite, canManageMembers],
  );

  return (
    <EntriesContext.Provider value={entriesValue}>
      <BrainContext.Provider value={brainValue}>
        <>
          {/* Desktop sidebar — fixed, outside overflow container */}
          <DesktopSidebar
            activeBrainName={activeBrain?.name || "OpenBrain"}
            view={view}
            onNavigate={(id) => { setView(id); setNavOpen(false); }}
            isDark={isDark}
            onToggleTheme={toggleTheme}
            isOnline={isOnline}
            pendingCount={pendingCount}
            entryCount={entries.length}
            onShowCreateBrain={() => setShowCreateBrain(true)}
            navViews={navViews}
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
                onBrainDeleted={deleteBrain}
                onBrainTip={(brain) => setShowBrainTip(brain)}
              />
            )}
          </DesktopSidebar>

          <div className="overflow-x-hidden w-full">
          {/* Main content — pushed right of sidebar on desktop, below fixed header on mobile */}
          {/* Main scroll area — offset from sidebar on desktop */}
          <div className="min-h-dvh bg-background lg:ml-72">

          {/* Mobile header — hidden on desktop */}
          <MobileHeader
            brainName={activeBrain?.name || "OpenBrain"}
            brainEmoji="🧠"
            onToggleTheme={toggleTheme}
            isDark={isDark}
            isOnline={isOnline}
            pendingCount={pendingCount}
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
                onBrainDeleted={deleteBrain}
                onBrainTip={(brain) => setShowBrainTip(brain)}
              />
            )}
          </MobileHeader>

          <QuickCapture
            entries={entries}
            setEntries={setEntries}
            links={links}
            addLinks={addLinks}
            onCreated={handleCreated}
            onUpdate={handleUpdate}
            brainId={activeBrain?.id}
            brains={brains}
            isOnline={isOnline}
            refreshCount={refreshCount}
            canWrite={canWrite}
            cryptoKey={cryptoKey}
            onNavigate={setView}
          />

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
                sessionStorage.removeItem("openbrain_nudge");
              }}
            />
          )}

          {/* Slide-in nav panel */}
          {/* Slide-out navigation drawer */}
          {navOpen && (
            <div
              className="fixed inset-0 z-50 transition-opacity"
              style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
              onClick={() => setNavOpen(false)}
            >
              <div
                className="absolute right-0 top-0 h-full w-72 flex flex-col border-l overflow-y-auto"
                style={{
                  background: "#141414",
                  borderColor: "rgba(72,72,71,0.15)",
                  paddingTop: "max(16px, env(safe-area-inset-top))",
                  paddingBottom: "max(16px, env(safe-area-inset-bottom))",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pb-4 mb-2 border-b" style={{ borderColor: "rgba(72,72,71,0.15)" }}>
                  <span className="text-sm font-bold text-white" style={{ fontFamily: "'Manrope', sans-serif" }}>Navigation</span>
                  <button
                    onClick={() => setNavOpen(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-[#777] hover:text-white hover:bg-white/10 transition-colors"
                  >
                    ×
                  </button>
                </div>

                {/* Nav items */}
                <div className="flex-1 px-3 space-y-1">
                  {[{ id: "capture", l: "Home", ic: "⌂" }, ...navViews].map((v) => {
                    const isActive = view === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => {
                          setView(v.id);
                          setNavOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                        style={{
                          background: isActive ? "rgba(114,239,245,0.08)" : "transparent",
                          color: isActive ? "#72eff5" : "#aaa",
                        }}
                      >
                        <span className="w-6 text-center text-base">{v.ic}</span>
                        <span className="text-sm font-medium">{v.l}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Add Brain button */}
                <div className="px-3 pt-3 mt-2 border-t" style={{ borderColor: "rgba(72,72,71,0.15)" }}>
                  <button
                    onClick={() => {
                      setNavOpen(false);
                      setShowCreateBrain(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/5"
                    style={{ color: "#d575ff" }}
                  >
                    <span className="w-6 text-center text-base">+</span>
                    <span className="text-sm font-medium">Add Brain</span>
                  </button>
                </div>

                {/* Footer stats */}
                <div className="px-5 pt-3 pb-2 mt-2 border-t" style={{ borderColor: "rgba(72,72,71,0.15)" }}>
                  <p className="text-[11px] text-[#555]">
                    {entries.length} memories ·{" "}
                    {pendingCount > 0 ? `${pendingCount} pending sync` : "synced"}
                  </p>
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

          <div className="px-4 sm:px-6 pt-4 pb-32 lg:pb-8 max-w-6xl mx-auto">
            {view === "capture" && (
              <div className="space-y-5">
                {/* Primary CTA */}
                <button
                  onClick={() => setView("suggest")}
                  className="w-full flex items-center gap-4 p-5 rounded-3xl border press-scale transition-all group"
                  style={{ background: "rgba(213,117,255,0.06)", borderColor: "rgba(213,117,255,0.15)" }}
                  onMouseEnter={(el) => { (el.currentTarget as HTMLElement).style.borderColor = "rgba(213,117,255,0.30)"; }}
                  onMouseLeave={(el) => { (el.currentTarget as HTMLElement).style.borderColor = "rgba(213,117,255,0.15)"; }}
                >
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #d575ff, #9800d0)", boxShadow: "0 4px 24px rgba(213,117,255,0.25)" }}>
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-bold text-on-surface mb-0.5" style={{ fontFamily: "'Manrope', sans-serif" }}>Fill Your Brain</div>
                    <div className="text-sm text-on-surface-variant">Answer guided questions to build your memory</div>
                  </div>
                  <svg className="w-5 h-5 text-on-surface-variant group-hover:text-secondary transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>

                {/* Quick actions grid */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "grid",     l: "Memory Grid",  ic: "▦", desc: "Browse all entries",   color: "#72eff5" },
                    { id: "chat",     l: "Ask Brain",    ic: "◈", desc: "Chat with your data",   color: "#d575ff" },
                    { id: "todos",    l: "Todos",        ic: "✓", desc: "Deadlines & events",    color: "#72eff5" },
                    { id: "vault",    l: "Vault",        ic: "🔐", desc: "Encrypted secrets",    color: "#ff9ac3" },
                  ].map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setView(v.id)}
                      className="flex flex-col items-start gap-2 p-4 rounded-2xl border transition-all press-scale text-left"
                      style={{ background: "#1a1919", borderColor: "rgba(72,72,71,0.08)" }}
                      onMouseEnter={(el) => { (el.currentTarget as HTMLElement).style.borderColor = `${v.color}30`; }}
                      onMouseLeave={(el) => { (el.currentTarget as HTMLElement).style.borderColor = "rgba(72,72,71,0.08)"; }}
                    >
                      <div className="text-xl">{v.ic}</div>
                      <div>
                        <div className="text-sm font-bold text-on-surface" style={{ fontFamily: "'Manrope', sans-serif" }}>{v.l}</div>
                        <div className="text-xs text-on-surface-variant/60 mt-0.5">{v.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {view === "grid" && (
              <div className="space-y-4">
                {/* Search bar */}
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border" style={{ background: "rgba(26,25,25,0.8)", borderColor: "rgba(72,72,71,0.12)", backdropFilter: "blur(12px)" }}>
                  <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search memories..."
                    className="flex-1 bg-transparent border-none outline-none text-on-surface placeholder:text-on-surface-variant/40 text-sm"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  />
                </div>

                {/* Workspace filter removed */}

                {!entriesLoaded ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <SkeletonCard count={6} />
                  </div>
                ) : filtered.length > 0 ? (
                  <VirtualGrid filtered={filtered} setSelected={setSelected} typeIcons={typeIcons} />
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <div className="text-4xl opacity-40">🔍</div>
                    <p className="font-bold text-on-surface" style={{ fontFamily: "'Manrope', sans-serif" }}>No memories match</p>
                    <p className="text-sm text-on-surface-variant">Try a different search or filter</p>
                  </div>
                )}
              </div>
            )}


            {view === "suggest" && (
              <Suspense fallback={<Loader />}>
                <SuggestionsView
                  entries={entries}
                  setEntries={setEntries}
                  activeBrain={activeBrain}
                  brains={brains}
                />
              </Suspense>
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
                />
              </Suspense>
            )}
            {view === "todos" && (
              <Suspense fallback={<Loader />}>
                <TodoView entries={entries} typeIcons={typeIcons} />
              </Suspense>
            )}
            {view === "timeline" && (
              <VirtualTimeline sorted={sortedTimeline} setSelected={setSelected} typeIcons={typeIcons} />
            )}
            {view === "vault" && (
              <Suspense fallback={<Loader />}>
                <VaultView
                  entries={entries}
                  onSelect={setSelected}
                  cryptoKey={cryptoKey}
                  onVaultUnlock={handleVaultUnlock}
                  brainId={activeBrain?.id}
                  onEntryCreated={(e) => setEntries((prev) => [e, ...prev])}
                />
              </Suspense>
            )}

            {view === "chat" && (
              <div className="flex flex-col h-[calc(100dvh-180px)] lg:h-[calc(100dvh-80px)]">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto space-y-4 pb-4">
                  {chatMsgs.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #d575ff, #9800d0)", boxShadow: "0 4px 30px rgba(213,117,255,0.25)" }}>
                        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-bold text-on-surface text-lg mb-1" style={{ fontFamily: "'Manrope', sans-serif" }}>Ask your brain anything</p>
                        <p className="text-sm text-on-surface-variant max-w-xs">Questions, summaries, connections — your knowledge at your fingertips.</p>
                      </div>
                    </div>
                  )}
                  {chatMsgs.map((m, i) => (
                    <div key={i} className={m.role === "user" ? "flex justify-end" : "flex gap-3 items-start"}>
                      {m.role === "assistant" && (
                        <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-1" style={{ background: "linear-gradient(135deg, #d575ff, #9800d0)", boxShadow: "0 2px 12px rgba(213,117,255,0.25)" }}>
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09z" />
                          </svg>
                        </div>
                      )}
                      <div
                        className="max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
                        style={m.role === "user"
                          ? { background: "rgba(114,239,245,0.12)", border: "1px solid rgba(114,239,245,0.18)", color: "#ffffff", borderRadius: "1rem 1rem 2px 1rem" }
                          : { background: "#1a1919", border: "1px solid rgba(72,72,71,0.08)", color: "#adaaaa", borderRadius: "2px 1rem 1rem 1rem" }
                        }
                      >
                        {m.role === "assistant"
                          ? m.content.split(PHONE_REGEX).map((part, pi) =>
                              PHONE_REGEX.test(part) ? <a key={pi} href={`tel:${part}`} className="text-primary underline">{part}</a> : part
                            )
                          : m.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex gap-3 items-center">
                      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center animate-pulse" style={{ background: "linear-gradient(135deg, #d575ff, #9800d0)" }}>
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09z" />
                        </svg>
                      </div>
                      <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl" style={{ background: "#1a1919" }}>
                        <span className="w-2 h-2 rounded-full bg-secondary animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 rounded-full bg-secondary animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 rounded-full bg-secondary animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  )}
                  {vaultUnlockModal && (
                    <div className="p-4 rounded-2xl border" style={{ background: "rgba(255,154,195,0.06)", borderColor: "rgba(255,154,195,0.18)" }}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold text-tertiary flex items-center gap-2" style={{ fontFamily: "'Manrope', sans-serif" }}>🔐 Unlock Vault</span>
                        <button onClick={() => setVaultUnlockModal(null)} className="text-on-surface-variant hover:text-on-surface press-scale">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <div className="flex gap-2 mb-3">
                        {["passphrase", "recovery"].map((mode) => (
                          <button key={mode} onClick={() => { setVaultModalMode(mode); setVaultModalInput(""); setVaultModalError(""); }}
                            className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all"
                            style={{ background: vaultModalMode === mode ? "rgba(255,154,195,0.15)" : "#262626", color: vaultModalMode === mode ? "#ff9ac3" : "#adaaaa", border: `1px solid ${vaultModalMode === mode ? "rgba(255,154,195,0.25)" : "rgba(72,72,71,0.15)"}` }}
                          >{mode === "passphrase" ? "Passphrase" : "Recovery Key"}</button>
                        ))}
                      </div>
                      <input type={vaultModalMode === "passphrase" ? "password" : "text"} value={vaultModalInput}
                        onChange={(e) => setVaultModalInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleVaultModalUnlock()}
                        placeholder={vaultModalMode === "passphrase" ? "Enter vault passphrase..." : "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"}
                        autoFocus
                        className="w-full px-4 py-2.5 rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none mb-3 min-h-[44px]"
                        style={{ background: "#262626", border: "1px solid rgba(72,72,71,0.2)" }}
                      />
                      {vaultModalError && <p className="text-xs text-error mb-2">{vaultModalError}</p>}
                      <button onClick={handleVaultModalUnlock} disabled={vaultModalBusy || !vaultModalInput.trim()}
                        className="w-full py-2.5 rounded-xl text-sm font-bold press-scale disabled:opacity-40"
                        style={{ background: "linear-gradient(135deg, #ff9ac3, #ec77aa)", color: "#6b0c40" }}
                      >{vaultModalBusy ? "Unlocking…" : "Unlock & Answer"}</button>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input area */}
                <div className="pt-3 border-t" style={{ borderColor: "rgba(72,72,71,0.10)" }}>
                  {brains.length > 1 && (
                    <div className="flex mb-2 p-1 rounded-xl gap-1" style={{ background: "#1a1919" }}>
                      <button
                        onClick={() => setSearchAllBrains(false)}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={!searchAllBrains
                          ? { background: "#303030", color: "#ffffff" }
                          : { color: "#555" }}
                      >
                        This brain
                      </button>
                      <button
                        onClick={() => setSearchAllBrains(true)}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={searchAllBrains
                          ? { background: "rgba(213,117,255,0.15)", color: "#d575ff" }
                          : { color: "#555" }}
                      >
                        All brains
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleChat()}
                      placeholder={searchAllBrains ? "Ask across all your brains…" : "Ask about your memories…"}
                      className="flex-1 px-4 py-3 rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none min-h-[44px] transition-all"
                      style={{ background: "#262626", border: "1px solid rgba(72,72,71,0.20)", fontFamily: "'Inter', sans-serif" }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(114,239,245,0.4)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(72,72,71,0.20)"; }}
                    />
                    <button onClick={handleChat} disabled={chatLoading}
                      className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center press-scale disabled:opacity-40"
                      style={{ background: "linear-gradient(135deg, #72eff5, #1fb1b7)", boxShadow: "0 4px 24px rgba(114,239,245,0.20)", color: "#002829" }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                      </svg>
                    </button>
                  </div>
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
              entries={entries}
              links={links}
              canWrite={canWrite}
              brains={brains}
              vaultUnlocked={!!cryptoKey}
              typeIcons={typeIcons}
              onTypeIconChange={(type, icon) => {
                registerTypeIcon(activeBrain?.id, type, icon);
                refreshTypeIcons();
              }}
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
            <div className="fixed top-4 right-4 z-[100] flex items-center gap-3 px-4 py-3 rounded-2xl border max-w-sm" style={{ background: "rgba(26,25,25,0.95)", backdropFilter: "blur(24px)", borderColor: "rgba(255,110,132,0.20)", boxShadow: "0 20px 40px rgba(0,0,0,0.4)" }}>
              <svg className="w-4 h-4 text-error flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              <span className="flex-1 text-sm text-on-surface">{saveError}</span>
              <button onClick={() => setSaveError(null)} className="text-on-surface-variant hover:text-on-surface press-scale">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}

          {showPinGate && (
            <PinGate
              isSetup={pinGateIsSetup}
              onSuccess={() => {
                if (pendingSecureMsg) {
                  setChatMsgs((p) => [
                    ...p,
                    { role: "assistant", content: pendingSecureMsg.content },
                  ]);
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
                    answeredItems.forEach((item) => existing.add(item.q));
                    localStorage.setItem(key, JSON.stringify([...existing]));
                  } catch {}

                  // Batch-save answered items to the brain via Quick Capture API
                  answeredItems.forEach((item) => {
                    callAI({
                      max_tokens: 800,
                      system: PROMPTS.QA_PARSE,
                      brainId: activeBrain?.id,
                      messages: [
                        { role: "user", content: `Question: ${item.q}\nAnswer: ${item.a}` },
                      ],
                    })
                      .then((r) => r.json())
                      .then((data) => {
                        let parsed = {};
                        try {
                          parsed = JSON.parse(
                            (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim(),
                          );
                        } catch {}
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
                          }).catch((err) =>
                            console.error("[OpenBrain:onboarding] Failed to save parsed Q&A", err),
                          );
                        }
                      })
                      .catch((err) =>
                        console.error("[OpenBrain:onboarding] Failed to parse Q&A with AI", err),
                      );
                  });
                }

                // Store skipped onboarding questions — Fill Brain will surface them
                if (skippedQs?.length) {
                  try {
                    const existing = JSON.parse(
                      localStorage.getItem("openbrain_onboarding_skipped") || "[]",
                    );
                    const merged = [...existing];
                    skippedQs.forEach((q) => {
                      if (!merged.find((e) => e.q === q.q)) merged.push(q);
                    });
                    localStorage.setItem("openbrain_onboarding_skipped", JSON.stringify(merged));
                  } catch {}
                }

                setShowOnboarding(false);
                setView("suggest");
              }}
            />
          )}

          <BottomNav
            activeView={view}
            onNavigate={(id) => {
              if (id === "more") {
                setNavOpen((o) => !o);
              } else {
                setView(id);
                setNavOpen(false);
              }
            }}
          />

          </div>{/* /main content wrapper */}
          </div>{/* /bg wrapper */}
        </>
      </BrainContext.Provider>
    </EntriesContext.Provider>
  );
}
