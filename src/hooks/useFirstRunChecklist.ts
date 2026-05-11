import { useEffect, useState, useCallback, useRef } from "react";
import { authFetch } from "../lib/authFetch";

// First-run checklist item identifiers — these double as React keys and CTA
// targets. Order matters: it determines render order.
export type ChecklistItemId = "capture5" | "persona" | "vault" | "brain";

export interface ChecklistItem {
  id: ChecklistItemId;
  title: string;
  body: string;
  done: boolean;
  /** What clicking the row should do. Resolved by the consumer. */
  action: ChecklistAction;
}

export type ChecklistAction =
  | { kind: "navigate"; view: string }
  | { kind: "settings"; tab: string }
  | { kind: "openCapture" }
  | { kind: "createBrain" };

export interface FirstRunChecklistState {
  items: ChecklistItem[];
  /** 0..1 — fraction of items complete. */
  progress: number;
  doneCount: number;
  totalCount: number;
  /** True once all items are complete. */
  allDone: boolean;
  /** User has explicitly hidden the card (separate from completion). */
  dismissed: boolean;
  dismiss: () => void;
  undismiss: () => void;
  /** Re-fetch remote state (call after returning from a settings tab). */
  refresh: () => void;
  loading: boolean;
  /**
   * True when the checklist has ever reached allDone for THIS brain. Once
   * true the consumer should render nothing — no card, no "bring back"
   * link. Persisted in localStorage per brain id so it stays gone across
   * refreshes, sessions, and re-mounts.
   */
  hidden: boolean;
}

const DISMISS_KEY = "everion_home_checklist_dismissed_at";
const REMOTE_CACHE_KEY = "everion_home_checklist_remote_v1";
const FLAGS_CACHE_KEY = "everion_home_checklist_flags_v1";
// Per-brain "ever-completed" map — once a brain id appears here the
// checklist is gone forever for that brain. Format: { [brainId]: ISO }.
const COMPLETED_KEY = "everion_home_checklist_completed_v1";

// Server-side sticky-done flags. Once an item is observed as done — by a
// live remote check or an in-memory threshold — we POST it here so the row
// persists across devices and survives API blips. Schema: one row per
// (user_id, item_id) in user_checklist_done.
type DoneFlags = Partial<Record<ChecklistItemId, string>>;

interface RemoteState {
  personaDone: boolean;
  vaultDone: boolean;
}

const EMPTY_REMOTE: RemoteState = {
  personaDone: false,
  vaultDone: false,
};

// ─── localStorage helpers ────────────────────────────────────────────────
// Cache the last-seen remote signals + done-flags so the next mount
// renders from cache immediately rather than flashing "must do" while the
// network round-trip resolves. The user reported this as the visible
// regression: "it temporarily says I must still do them, then when
// loading is done, then they disappear." Cache eliminates that frame.

function loadCachedRemote(): RemoteState | null {
  try {
    const raw = localStorage.getItem(REMOTE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RemoteState;
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCachedRemote(state: RemoteState): void {
  try {
    localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode — fine, in-memory cache still works */
  }
}

function loadCachedFlags(): DoneFlags {
  try {
    const raw = localStorage.getItem(FLAGS_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as DoneFlags;
  } catch {
    return {};
  }
}

function saveCachedFlags(flags: DoneFlags): void {
  try {
    localStorage.setItem(FLAGS_CACHE_KEY, JSON.stringify(flags));
  } catch {
    /* ignore */
  }
}

function isCompletedFor(brainId: string | undefined): boolean {
  if (!brainId) return false;
  try {
    const raw = localStorage.getItem(COMPLETED_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, string>;
    return Boolean(map?.[brainId]);
  } catch {
    return false;
  }
}

function markCompletedFor(brainId: string): void {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    if (!map[brainId]) {
      map[brainId] = new Date().toISOString();
      localStorage.setItem(COMPLETED_KEY, JSON.stringify(map));
    }
  } catch {
    /* ignore */
  }
}

// ─── Remote loaders ──────────────────────────────────────────────────────

async function loadRemote(): Promise<RemoteState> {
  // Persona lives at /api/user-data?resource=profile (handler reads
  // user_personas table but the resource key is "profile"). Response shape:
  // { profile: row | null }. Any of full_name / preferred_name / context
  // being non-empty counts as "told us about themselves".
  const personaP = authFetch("/api/user-data?resource=profile")
    .then((r) => r?.json?.() ?? null)
    .then((data) => {
      const p = data?.profile;
      if (!p) return false;
      return Boolean(p.full_name || p.preferred_name || p.context);
    })
    .catch(() => false);

  const vaultP = authFetch("/api/user-data?resource=vault_entries")
    .then((r) => r?.json?.() ?? null)
    .then((data) => {
      const list = Array.isArray(data) ? data : (data?.entries ?? data?.vault_entries ?? []);
      return Array.isArray(list) && list.length > 0;
    })
    .catch(() => false);

  const [personaDone, vaultDone] = await Promise.all([personaP, vaultP]);
  return { personaDone, vaultDone };
}

async function loadDoneFlags(): Promise<DoneFlags> {
  try {
    const r = await authFetch("/api/user-data?resource=checklist_done");
    if (!r?.ok) return {};
    const data = await r.json();
    const items = (data?.items ?? {}) as Record<string, string>;
    return items as DoneFlags;
  } catch {
    return {};
  }
}

async function pinDoneRemote(id: ChecklistItemId): Promise<void> {
  try {
    await authFetch("/api/user-data?resource=checklist_done", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: id }),
    });
  } catch {
    /* best-effort — local optimistic state already shows it as done */
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────

interface UseFirstRunChecklistOptions {
  entryCount: number;
  brainCount: number;
  /** Active brain id. Used to scope the "ever-completed" flag. */
  brainId?: string;
  /** Personal brain shows the full set; shared brains show only the
   *  cross-brain core: capture5, persona, vault. Gmail / calendar /
   *  add-second-brain are personal-account concerns and don't belong on
   *  a shared family brain. */
  isPersonalBrain: boolean;
}

export function useFirstRunChecklist({
  entryCount,
  brainCount,
  brainId,
  isPersonalBrain,
}: UseFirstRunChecklistOptions): FirstRunChecklistState {
  // Hydrate from cache synchronously so the first render shows the
  // last-known truth instead of all-undone. Background refresh updates
  // both the in-memory state and the cache when fresh data arrives.
  const [remote, setRemote] = useState<RemoteState>(() => loadCachedRemote() ?? EMPTY_REMOTE);
  const [doneFlags, setDoneFlags] = useState<DoneFlags>(() => loadCachedFlags());
  const [loading, setLoading] = useState(false);
  // Stable across the lifetime of THIS brain id — flips to true once
  // allDone is first observed and writes to localStorage.
  const [hidden, setHidden] = useState<boolean>(() => isCompletedFor(brainId));
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem(DISMISS_KEY));
    } catch {
      return false;
    }
  });

  // In-flight pin requests so we don't hammer the server with the same id
  // every render while threshold conditions stay true.
  const pinningRef = useRef<Set<ChecklistItemId>>(new Set());

  const pinIfNew = useCallback((id: ChecklistItemId) => {
    setDoneFlags((prev) => {
      if (prev[id]) return prev;
      if (pinningRef.current.has(id)) return prev;
      pinningRef.current.add(id);
      void pinDoneRemote(id).finally(() => pinningRef.current.delete(id));
      const next = { ...prev, [id]: new Date().toISOString() };
      saveCachedFlags(next);
      return next;
    });
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    void Promise.all([loadRemote(), loadDoneFlags()])
      .then(([nextRemote, serverFlags]) => {
        setRemote(nextRemote);
        saveCachedRemote(nextRemote);
        setDoneFlags((prev) => {
          // Merge: server flags are authoritative for the cross-device
          // baseline, but keep any optimistic local pins from this session.
          const merged: DoneFlags = { ...prev, ...serverFlags };
          if (nextRemote.personaDone && !merged.persona) pinIfNew("persona");
          if (nextRemote.vaultDone && !merged.vault) pinIfNew("vault");
          saveCachedFlags(merged);
          return merged;
        });
      })
      .finally(() => setLoading(false));
  }, [pinIfNew]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-fetch when the window regains focus — handles round-trips through
  // settings tabs and the vault setup flow without needing a manual refresh.
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  // Pin in-memory-derived items as soon as they go true so they stay done
  // even if entries get deleted later or brains get pruned.
  useEffect(() => {
    if (entryCount >= 5) pinIfNew("capture5");
    if (brainCount > 1) pinIfNew("brain");
  }, [entryCount, brainCount, pinIfNew]);

  // Brain switch — re-evaluate the hidden flag against the new brain id.
  useEffect(() => {
    setHidden(isCompletedFor(brainId));
  }, [brainId]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, []);

  const undismiss = useCallback(() => {
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch {
      /* ignore */
    }
    setDismissed(false);
  }, []);

  // Helper: an item is done if EITHER the live signal says so OR we've
  // ever pinned it server-side. One-and-done semantics — no flicker.
  const stickyDone = (id: ChecklistItemId, live: boolean): boolean =>
    Boolean(live || doneFlags[id]);

  // Build the full item set. Ordering matches the previous render.
  const allItems: ChecklistItem[] = [
    {
      id: "capture5",
      title: "Capture 5 things",
      body:
        entryCount >= 5
          ? `${entryCount} thoughts saved.`
          : `${entryCount} of 5 — your brain gets sharper around here.`,
      done: stickyDone("capture5", entryCount >= 5),
      action: { kind: "openCapture" },
    },
    {
      id: "persona",
      title: "Tell your brain about you",
      body: "Name, context, habits — answers get noticeably more personal.",
      done: stickyDone("persona", remote.personaDone),
      action: { kind: "settings", tab: "persona" },
    },
    {
      id: "vault",
      title: "Set up your vault",
      body: "Encrypted store for IDs, codes, bank details. Add your first secret to mark this done.",
      done: stickyDone("vault", remote.vaultDone),
      action: { kind: "navigate", view: "vault" },
    },
    {
      id: "brain",
      title: "Add a second brain",
      body: "Separate work from personal — switch with one tap.",
      done: stickyDone("brain", brainCount > 1),
      action: { kind: "createBrain" },
    },
  ];

  // Shared brains get only the cross-brain core. Gmail / calendar /
  // add-second-brain are personal-account concerns and don't belong on a
  // family brain a member is using.
  const SHARED_BRAIN_ITEM_IDS: ReadonlySet<ChecklistItemId> = new Set([
    "capture5",
    "persona",
    "vault",
  ]);
  const items = isPersonalBrain
    ? allItems
    : allItems.filter((i) => SHARED_BRAIN_ITEM_IDS.has(i.id));

  const doneCount = items.filter((i) => i.done).length;
  const totalCount = items.length;
  const progress = totalCount === 0 ? 0 : doneCount / totalCount;
  const allDone = totalCount > 0 && doneCount === totalCount;

  // Once allDone goes true, persist the per-brain hidden flag and flip
  // local state. Subsequent mounts read isCompletedFor() and start hidden.
  useEffect(() => {
    if (!allDone || !brainId) return;
    if (hidden) return;
    markCompletedFor(brainId);
    setHidden(true);
  }, [allDone, brainId, hidden]);

  return {
    items,
    progress,
    doneCount,
    totalCount,
    allDone,
    dismissed,
    dismiss,
    undismiss,
    refresh,
    loading,
    hidden,
  };
}
