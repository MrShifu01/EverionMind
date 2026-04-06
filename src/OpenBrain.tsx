// @ts-nocheck
import { useState, useMemo, useRef, useEffect, useCallback, lazy, Suspense, memo } from "react";
import { useTheme } from "./ThemeContext";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { authFetch } from "./lib/authFetch";
import { callAI } from "./lib/ai";
import {
  getEmbedHeaders,
  getUserProvider,
  getUserModel,
  getUserApiKey,
  getOpenRouterKey,
  getOpenRouterModel,
} from "./lib/aiFetch";
import { encryptEntry, decryptEntry, unlockVault, decryptVaultKeyFromRecovery } from "./lib/crypto";
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
import OnboardingChecklist from "./components/OnboardingChecklist";
import QuickCapture from "./components/QuickCapture";
import SupplierPanel from "./components/SupplierPanel";
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
    <div className="py-3">
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
      if (p <= 0) {
        clearInterval(tick);
        onDismiss();
      }
    }, 80);
    return () => clearInterval(tick);
  }, []);
  const label = { delete: "Entry deleted", update: "Entry updated", create: "Entry created" }[
    action.type
  ];
  return (
    <div className="fixed bottom-[80px] md:bottom-6 left-1/2 z-[2000] box-border flex max-w-[calc(100vw-32px)] min-w-[240px] -translate-x-1/2 items-center gap-3 rounded-2xl border px-4 py-3" style={{ background: "rgba(38,38,38,0.85)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderColor: "rgba(114,239,245,0.2)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
      <span className="text-sm" style={{ color: "#adaaaa" }}>{label}</span>
      <button
        onClick={onUndo}
        className="cursor-pointer rounded-lg border bg-transparent px-3.5 py-1 text-[13px] font-bold transition-opacity hover:opacity-80"
        style={{ borderColor: "rgba(114,239,245,0.3)", color: "#72eff5" }}
      >
        Undo
      </button>
      <div
        className="absolute bottom-0 left-0 h-[2px] rounded-b-2xl transition-[width] duration-[80ms] ease-linear"
        style={{ width: `${pct}%`, background: "linear-gradient(90deg, #72eff5, #8b5cf6)" }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NUDGE BANNER
   ═══════════════════════════════════════════════════════════════ */
function NudgeBanner({ nudge, onDismiss }) {
  if (!nudge) return null;
  return (
    <div className="bg-ob-surface border-purple/25 mx-3 mb-3 flex items-start gap-2.5 rounded-xl border px-3 py-2.5">
      <span className="shrink-0 text-base">💡</span>
      <p className="text-ob-text-mid m-0 flex-1 text-[13px] leading-normal">{nudge}</p>
      <button
        onClick={onDismiss}
        className="text-ob-text-faint shrink-0 cursor-pointer border-none bg-transparent text-lg leading-none"
      >
        ✕
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
const EntryCard = memo(function EntryCard({ entry: e, onSelect }) {
  const { t, isDark } = useTheme();
  const cfg = TC[e.type] || TC.note;
  const imp = { 1: "Important", 2: "Critical" }[e.importance];
  return (
    <div
      onClick={() => onSelect(e)}
      className="relative cursor-pointer overflow-hidden rounded-2xl border px-5 py-4 transition-all duration-300"
      style={{
        background: isDark ? "#1a1919" : "#ffffff",
        borderColor: e.pinned ? cfg.c + "60" : (isDark ? "rgba(72,72,71,0.15)" : "rgba(0,0,0,0.08)"),
      }}
      onMouseEnter={(ev) => {
        ev.currentTarget.style.borderColor = cfg.c + "80";
        ev.currentTarget.style.transform = "translateY(-2px)";
        ev.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.2), 0 0 12px ${cfg.c}18`;
      }}
      onMouseLeave={(ev) => {
        ev.currentTarget.style.borderColor = e.pinned ? cfg.c + "60" : (isDark ? "rgba(72,72,71,0.15)" : "rgba(0,0,0,0.08)");
        ev.currentTarget.style.transform = "none";
        ev.currentTarget.style.boxShadow = "none";
      }}
    >
      {e.pinned && (
        <div
          className="absolute top-0 right-0 left-0 h-0.5"
          style={{ background: `linear-gradient(90deg,${cfg.c},transparent)` }}
        />
      )}
      <div className="mb-2 flex items-center gap-2.5">
        <span className="text-xl">{cfg.i}</span>
        <span className="text-[10px] font-bold tracking-[1.5px] uppercase" style={{ color: cfg.c }}>
          {e.type}
        </span>
        {e.pinned && <span className="text-[10px]">📌</span>}
        {imp && (
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${e.importance === 2 ? "bg-orange/[0.19] text-orange" : "bg-yellow/[0.12] text-yellow"}`}
          >
            {imp}
          </span>
        )}
      </div>
      <h3 className="text-ob-text m-0 text-base leading-snug font-semibold">{e.title}</h3>
      {e.type === "secret" ? (
        <p className="text-red mt-2 mb-0 text-[13px] leading-normal italic">
          Encrypted — tap to reveal
        </p>
      ) : (
        <p className="text-ob-text-muted mt-2 mb-0 line-clamp-2 overflow-hidden text-[13px] leading-normal">
          {e.content}
        </p>
      )}
      {e.tags?.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {e.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className={`text-ob-text-dim rounded-full px-2 py-0.5 text-[10px] ${isDark ? "bg-white/[0.03]" : "bg-black/[0.03]"}`}
            >
              {tag}
            </span>
          ))}
          {e.tags.length > 4 && (
            <span className="text-ob-text-faint text-[10px]">+{e.tags.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════
   VIRTUALISED GRID
   ═══════════════════════════════════════════════════════════════ */
function VirtualGrid({ filtered, setSelected }) {
  const COLS = typeof window !== "undefined"
    ? window.innerWidth >= 1280 ? 3 : window.innerWidth >= 640 ? 2 : 1
    : 1;
  const rows = useMemo(() => {
    const r = [];
    for (let i = 0; i < filtered.length; i += COLS) r.push(filtered.slice(i, i + COLS));
    return r;
  }, [filtered, COLS]);
  const listRef = useRef(null);
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 172,
    overscan: 4,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });
  return (
    <div ref={listRef}>
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vRow) => (
          <div
            key={vRow.index}
            className="absolute right-0 left-0 grid gap-3 pb-3"
            style={{
              top: vRow.start - virtualizer.options.scrollMargin,
              gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            }}
          >
            {rows[vRow.index].map((e) => (
              <EntryCard key={e.id} entry={e} onSelect={setSelected} />
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
function VirtualTimeline({ sorted, setSelected }) {
  const listRef = useRef(null);
  const virtualizer = useWindowVirtualizer({
    count: sorted.length,
    estimateSize: () => 64,
    overscan: 5,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });
  return (
    <div ref={listRef} className="relative pl-6">
      <div
        className="absolute top-0 bottom-0 left-2.5 w-0.5"
        style={{ background: "linear-gradient(180deg,#4ECDC4,#FF6B35,#A29BFE)" }}
      />
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const e = sorted[vItem.index];
          const cfg = TC[e.type] || TC.note;
          return (
            <div
              key={e.id}
              className="absolute right-0 left-0 cursor-pointer pb-4 pl-5"
              style={{ top: vItem.start - virtualizer.options.scrollMargin }}
              onClick={() => setSelected(e)}
            >
              <div
                className="border-ob-bg absolute top-1.5 -left-[3px] h-3 w-3 rounded-full border-2"
                style={{ background: cfg.c }}
              />
              <p className="text-ob-text-dim m-0 mb-0.5 text-[10px]">{fmtD(e.created_at)}</p>
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{cfg.i}</span>
                <span className="text-ob-text-soft text-sm font-medium">{e.title}</span>
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
  const [showBrainTip, setShowBrainTip] = useState(null);
  const [showCreateBrain, setShowCreateBrain] = useState(false);
  const [chatInput, setChatInput] = useState("");
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
    if (!activeBrain?.id) return;
    setEntriesLoaded(false);
    const url = `/api/entries?brain_id=${encodeURIComponent(activeBrain.id)}`;
    authFetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          // Secret entries stay encrypted in state until vault is unlocked
          setEntries(data);
          writeEntriesCache(data); // PERF-8: write to IDB (with localStorage fallback)
          // ARCH-5: Build search index at load time (skip secret entries — encrypted)
          data.filter((e) => e.type !== "secret").forEach(indexEntry);
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
        const text = data.content?.[0]?.text?.trim();
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

  // ─── Reorder / Renewal Reminder ───
  const handleReorder = useCallback(async (supplier) => {
    const due = new Date();
    const isRenewal = supplier._renewalMode;
    if (isRenewal) due.setMonth(due.getMonth() + 1);
    else due.setDate(due.getDate() + 7);
    const parsed = isRenewal
      ? {
          title: `Renew ${supplier.title}`,
          content: `Set a renewal reminder for ${supplier.title}.`,
          type: "reminder",
          metadata: { status: "pending", due_date: due.toISOString().split("T")[0] },
          tags: ["renewal", "admin"],
        }
      : {
          title: `Reorder from ${supplier.title.split(" - ")[0]}`,
          content: `Remember to place a reorder with ${supplier.title}.`,
          type: "reminder",
          metadata: { status: "pending", due_date: due.toISOString().split("T")[0] },
          tags: ["reorder", "smash burger bar"],
        };
    try {
      const res = await authFetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getEmbedHeaders() || {}) },
        body: JSON.stringify({
          p_title: parsed.title,
          p_content: parsed.content,
          p_type: parsed.type,
          p_metadata: parsed.metadata,
          p_tags: parsed.tags,
        }),
      });
      const result = res.ok ? await res.json() : null;
      const newEntry = {
        id: result?.id || Date.now().toString(),
        ...parsed,
        pinned: false,
        importance: 1,
        created_at: new Date().toISOString(),
      };
      setEntries((prev) => [newEntry, ...prev]);
      setLastAction({ type: "create", id: newEntry.id });
    } catch {
      /* silently fail */
    }
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
          const res = await authFetch("/api/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...embedHeaders,
              ...(genKey ? { "X-User-Api-Key": genKey } : {}),
            },
            body: JSON.stringify({
              message: msg,
              brain_id: activeBrain.id,
              history,
              provider,
              model,
              secrets,
            }),
          });
          data = await res.json();
        } else {
          const contextWithSecrets = secrets.length
            ? [...chatContext, ...secrets.map((s) => ({ ...s, type: "secret" }))]
            : chatContext;
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
        const content = data.content?.map((c) => c.text || "").join("") || "Couldn't process.";
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
    [cryptoKey, entries, chatContext, links, chatMsgs, activeBrain],
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

  // Show loading state while brains are being fetched to prevent read-only / onboarding flash
  if (brainsLoading) {
    return (
      <div className="bg-ob-bg flex min-h-screen flex-col items-center justify-center font-['Söhne',system-ui,-apple-system,sans-serif]">
        <div className="mb-4 text-5xl" style={{ animation: "ob-pulse 1.5s ease-in-out infinite" }}>
          🧠
        </div>
        <p className="text-ob-text-dim m-0 text-[13px]">Loading your brains...</p>
        <div className="bg-ob-surface mt-3 h-[3px] w-[120px] overflow-hidden rounded-[3px]">
          <div
            className="gradient-accent h-full w-[40%] rounded-[3px]"
            style={{ animation: "ob-slide 1.2s ease-in-out infinite" }}
          />
        </div>
        <style>{`
          @keyframes ob-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.08); opacity: 0.7; } }
          @keyframes ob-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
        `}</style>
      </div>
    );
  }

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

          <div className="bg-ob-bg text-ob-text min-h-screen overflow-x-hidden font-['Söhne',system-ui,-apple-system,sans-serif] transition-[background,color] duration-[250ms]">
          {/* Main content — pushed right of sidebar on desktop */}
          <div className="pb-[80px] md:pb-8 md:pl-[220px]">

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
          {navOpen && (
            <div className="fixed inset-0 z-[1000] bg-black/40" onClick={() => setNavOpen(false)}>
              <div
                className={`absolute top-0 right-0 bottom-0 flex w-[78vw] max-w-[280px] flex-col shadow-[-12px_0_40px_rgba(0,0,0,0.3)] ${isDark ? "bg-[#181822]" : "bg-[#f8f8ff]"}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                  <span className="text-ob-text text-[15px] font-bold">Navigation</span>
                  <button
                    onClick={() => setNavOpen(false)}
                    className="touch-target text-ob-text-dim flex cursor-pointer items-center justify-center border-none bg-transparent text-xl leading-none"
                  >
                    ×
                  </button>
                </div>
                <div className="border-ob-border border-b" />
                <div className="flex-1 overflow-y-auto py-3">
                  {[{ id: "capture", l: "Home", ic: "⌂" }, ...navViews].map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setView(v.id);
                        setNavOpen(false);
                      }}
                      className={`flex w-full cursor-pointer items-center gap-3.5 border-none px-5 py-3.5 text-left text-[14px] ${view === v.id ? (isDark ? "bg-teal/10" : "bg-teal/15") + " text-teal font-semibold" : "text-ob-text bg-transparent font-normal"}`}
                    >
                      <span className="w-7 text-center text-lg">{v.ic}</span>
                      <span>{v.l}</span>
                      {v.id === "suggest" && (
                        <span className="bg-orange ml-auto h-2 w-2 rounded-full" />
                      )}
                    </button>
                  ))}
                </div>
                <div className="border-ob-border border-t px-5 py-3">
                  <button
                    onClick={() => {
                      setNavOpen(false);
                      setShowCreateBrain(true);
                    }}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[rgba(124,143,240,0.25)] bg-[rgba(124,143,240,0.08)] px-4 py-3 text-[13px] font-semibold text-[#a5b4fc]"
                  >
                    + Add Brain
                  </button>
                </div>
                <div className="text-ob-text-dim px-5 py-3 text-[12px]">
                  {entries.length} memories ·{" "}
                  {pendingCount > 0 ? `${pendingCount} pending sync` : "synced"}
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

          <div className="animate-fade-in px-5 py-4 md:px-8 md:py-6 md:max-w-4xl md:mx-auto">
            {view === "capture" && (
              <div className="animate-fade-in pt-1">
                <OnboardingChecklist activeBrain={activeBrain} onNavigate={setView} />

                {/* Quick stats bar */}
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex-1">
                    <span className="text-ob-text text-2xl font-extrabold">{entries.length}</span>
                    <span className="text-ob-text-muted ml-1.5 text-sm">memories</span>
                  </div>
                  {links.length > 0 && (
                    <span className="text-ob-text-dim text-xs">{links.length} links</span>
                  )}
                </div>

                {/* Primary action — larger, gradient */}
                <button
                  onClick={() => setView("suggest")}
                  className="gradient-accent mb-4 flex w-full cursor-pointer items-center gap-4 rounded-2xl border-none px-6 py-5 text-left"
                >
                  <span className="text-2xl">✦</span>
                  <div>
                    <div className="text-[15px] font-bold text-white">Fill Your Brain</div>
                    <div className="mt-0.5 text-[13px] text-white/70">Answer guided questions to build your memory</div>
                  </div>
                  <span className="ml-auto text-lg text-white/60">→</span>
                </button>

                {/* Secondary actions — clean grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { id: "grid", l: "Memory Grid", ic: "▦", desc: "Browse all" },
                    { id: "chat", l: "Ask Brain", ic: "◈", desc: "Chat with your data" },
                    { id: "todos", l: "Todos", ic: "✓", desc: "Deadlines & events" },
                    { id: "vault", l: "Vault", ic: "🔐", desc: "Encrypted secrets" },
                  ].map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setView(v.id)}
                      className="bg-ob-surface border-ob-border touch-target cursor-pointer rounded-2xl border px-5 py-5 text-left transition-transform duration-100 active:scale-[0.97]"
                    >
                      <div className="mb-2.5 text-2xl">{v.ic}</div>
                      <div className="text-ob-text text-[14px] font-semibold">{v.l}</div>
                      <div className="text-ob-text-dim mt-1 text-[12px] leading-relaxed">{v.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {view === "grid" && (
              <div className="animate-fade-in">
                {/* Search bar */}
                <div className="relative mb-4">
                  <span className="text-ob-text-faint absolute top-1/2 left-4 -translate-y-1/2 text-sm">
                    ⌕
                  </span>
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search memories..."
                    className="bg-ob-surface border-ob-border text-ob-text-soft box-border w-full rounded-xl border py-3.5 pr-4 pl-10 text-sm outline-none"
                  />
                </div>

                {/* Workspace + type filters combined row */}
                <div className="scrollbar-none mb-4 flex gap-2 overflow-x-auto pb-1">
                  {brains.some((b) => b.type === "business") && (
                    <>
                      {[
                        { ws: "all", label: "All" },
                        { ws: "personal", label: "Personal" },
                        { ws: "business", label: "Business" },
                      ].map(({ ws, label }) => (
                        <button
                          key={ws}
                          onClick={() => {
                            setWorkspace(ws);
                            localStorage.setItem("openbrain_workspace", ws);
                          }}
                          className={`shrink-0 cursor-pointer rounded-full border-none px-4 py-2 text-[12px] font-semibold ${workspace === ws ? "bg-purple text-white" : "bg-ob-surface text-ob-text-muted"}`}
                        >
                          {label}
                        </button>
                      ))}
                      <div className="border-ob-border mx-1 w-px shrink-0 self-stretch" />
                    </>
                  )}
                  <button
                    onClick={() => setTypeFilter("all")}
                    className={`shrink-0 cursor-pointer rounded-full border-none px-4 py-2 text-[12px] font-semibold ${typeFilter === "all" ? "bg-teal text-white" : "bg-ob-surface text-ob-text-muted"}`}
                  >
                    All ({entries.length})
                  </button>
                  {Object.entries(types).map(([typ, n]) => {
                    const c = TC[typ] || TC.note;
                    return (
                      <button
                        key={typ}
                        onClick={() => setTypeFilter(typ)}
                        className={`shrink-0 cursor-pointer rounded-full border-none px-4 py-2 text-[12px] font-semibold ${typeFilter === typ ? "text-white" : "bg-ob-surface text-ob-text-muted"}`}
                        style={typeFilter === typ ? { background: c.c } : undefined}
                      >
                        {c.i} {typ} ({n})
                      </button>
                    );
                  })}
                </div>

                {/* Compact inline stats */}
                <div className="text-ob-text-dim mb-4 flex items-center gap-3 text-[12px]">
                  <span><strong className="text-teal">{entries.length}</strong> memories</span>
                  <span className="text-ob-border">·</span>
                  <span><strong className="text-purple">{Object.keys(types).length}</strong> types</span>
                  <span className="text-ob-border">·</span>
                  <span><strong className="text-orange">{links.length}</strong> links</span>
                </div>

                {!entriesLoaded ? (
                  <div className="grid gap-3">
                    <SkeletonCard count={4} />
                  </div>
                ) : filtered.length > 0 ? (
                  <VirtualGrid filtered={filtered} setSelected={setSelected} />
                ) : (
                  <div className="pt-12 text-center">
                    <div className="mb-3 text-4xl">🔍</div>
                    <p className="text-ob-text-mid text-sm font-medium">No memories match</p>
                    <p className="text-ob-text-dim mt-1 text-xs">Try a different search or filter</p>
                  </div>
                )}
              </div>
            )}

            {view === "suppliers" && (
              <SupplierPanel entries={entries} onSelect={setSelected} onReorder={handleReorder} />
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
                <TodoView entries={entries} />
              </Suspense>
            )}
            {view === "timeline" && (
              <VirtualTimeline sorted={sortedTimeline} setSelected={setSelected} />
            )}
            {view === "vault" && (
              <Suspense fallback={<Loader />}>
                <VaultView
                  entries={entries}
                  onSelect={setSelected}
                  cryptoKey={cryptoKey}
                  onVaultUnlock={handleVaultUnlock}
                />
              </Suspense>
            )}

            {view === "chat" && (
              <div className="animate-fade-in flex h-[calc(100dvh-180px)] md:h-[calc(100dvh-100px)] flex-col">
                <div className="mb-3 flex-1 overflow-auto">
                  {chatMsgs.length === 0 && (
                    <div className="flex flex-col items-center justify-center pt-16 pb-8">
                      <div className="mb-4 text-5xl">◈</div>
                      <p className="text-ob-text mb-1 text-base font-semibold">Ask your brain anything</p>
                      <p className="text-ob-text-dim max-w-[260px] text-center text-[13px] leading-relaxed">
                        Ask questions about your memories, get summaries, or find connections.
                      </p>
                    </div>
                  )}
                  {chatMsgs.map((m, i) => (
                    <div
                      key={i}
                      className={`mb-3 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`overflow-wrap-anywhere max-w-[80%] px-4 py-3 text-[14px] leading-relaxed break-words whitespace-pre-wrap ${m.role === "user" ? "bg-teal text-white rounded-[18px_18px_4px_18px]" : "bg-ob-surface text-ob-text-mid rounded-[18px_18px_18px_4px]"}`}
                      >
                        {m.role === "assistant"
                          ? m.content.split(PHONE_REGEX).map((part, pi) =>
                              PHONE_REGEX.test(part) ? (
                                <a
                                  key={pi}
                                  href={`tel:${part}`}
                                  className="text-teal font-bold no-underline"
                                >
                                  {part}
                                </a>
                              ) : (
                                part
                              ),
                            )
                          : m.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex">
                      <div className="bg-ob-surface text-ob-text-dim rounded-[16px_16px_16px_4px] px-4 py-3">
                        Thinking...
                      </div>
                    </div>
                  )}
                  {/* Vault unlock prompt — shown inline when user asks about secrets */}
                  {vaultUnlockModal && (
                    <div className="bg-ob-surface border-red/50 my-3 rounded-xl border p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="text-xl">🔐</span>
                        <span className="text-ob-text text-sm font-semibold">Unlock Vault</span>
                        <button
                          onClick={() => setVaultUnlockModal(null)}
                          className="text-ob-text-faint ml-auto cursor-pointer border-none bg-transparent text-base"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="mb-2.5 flex gap-2">
                        <button
                          onClick={() => {
                            setVaultModalMode("passphrase");
                            setVaultModalInput("");
                            setVaultModalError("");
                          }}
                          className={`cursor-pointer rounded-2xl border-none px-3 py-1 text-[11px] font-semibold ${vaultModalMode === "passphrase" ? "bg-teal text-ob-bg" : "bg-ob-bg text-ob-text-muted"}`}
                        >
                          Passphrase
                        </button>
                        <button
                          onClick={() => {
                            setVaultModalMode("recovery");
                            setVaultModalInput("");
                            setVaultModalError("");
                          }}
                          className={`cursor-pointer rounded-2xl border-none px-3 py-1 text-[11px] font-semibold ${vaultModalMode === "recovery" ? "bg-teal text-ob-bg" : "bg-ob-bg text-ob-text-muted"}`}
                        >
                          Recovery Key
                        </button>
                      </div>
                      <input
                        type={vaultModalMode === "passphrase" ? "password" : "text"}
                        value={vaultModalInput}
                        onChange={(e) => setVaultModalInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleVaultModalUnlock()}
                        placeholder={
                          vaultModalMode === "passphrase"
                            ? "Enter vault passphrase..."
                            : "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                        }
                        autoFocus
                        className={`bg-ob-bg border-ob-border text-ob-text-soft mb-2 box-border w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none ${vaultModalMode === "recovery" ? "font-mono" : ""}`}
                      />
                      {vaultModalError && (
                        <p className="text-red m-0 mb-2 text-xs">{vaultModalError}</p>
                      )}
                      <button
                        onClick={handleVaultModalUnlock}
                        disabled={vaultModalBusy || !vaultModalInput.trim()}
                        className={`bg-teal text-ob-bg w-full cursor-pointer rounded-lg border-none py-2.5 text-[13px] font-bold ${vaultModalBusy ? "opacity-50" : ""}`}
                      >
                        {vaultModalBusy ? "Unlocking..." : "Unlock & Answer"}
                      </button>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                {/* Quick-ask chips */}
                <div className="scrollbar-none mb-2.5 flex gap-2 overflow-x-auto pb-0.5">
                  {CHAT_CHIPS.map((chip) => (
                    <button
                      key={chip.label}
                      onClick={() => setChatInput(chip.text)}
                      className="border-ob-border bg-ob-surface text-ob-text-muted shrink-0 cursor-pointer rounded-full border px-4 py-2.5 text-[12px] transition-colors active:bg-ob-accent-light"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2.5">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleChat()}
                    placeholder="Ask about your memories..."
                    className="bg-ob-surface border-ob-border text-ob-text-soft flex-1 rounded-xl border px-4 py-3.5 text-[14px] outline-none"
                  />
                  <button
                    onClick={handleChat}
                    disabled={chatLoading}
                    className={`touch-target bg-teal cursor-pointer rounded-xl border-none px-5 text-base font-bold text-white ${chatLoading ? "opacity-50" : ""}`}
                  >
                    →
                  </button>
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
              vaultUnlocked={!!cryptoKey}
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
            <div className="bg-ob-surface border-ob-error fixed bottom-6 left-1/2 z-[2000] box-border flex max-w-[calc(100vw-32px)] min-w-[240px] -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-3 shadow-[0_4px_20px_#0008]">
              <span className="text-ob-error text-sm">⚠ {saveError}</span>
              <button
                onClick={() => setSaveError(null)}
                className="text-ob-text-faint ml-auto cursor-pointer border-none bg-transparent text-lg leading-none"
              >
                ✕
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
          </div>{/* /bg-ob-bg */}
        </>
      </BrainContext.Provider>
    </EntriesContext.Provider>
  );
}
