import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { authFetch } from "../lib/authFetch";
import { Button } from "../components/ui/button";
import { DateField } from "../components/ui/date-field";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import type { Entry } from "../types";
import { isDone } from "./todoUtils";

// GTD Someday/Maybe inbox.
//
// Shows incomplete `type="someday"` entries — newest first. Each row offers
// three actions: Done (mark completed), Schedule (date picker → flip to
// type="todo" with metadata.due_date so the existing Calendar tab picks it
// up), and Drop (soft-delete). Quick-add at the top stores raw text directly
// as a someday entry, no AI parsing — feels like jotting on a Post-it.
//
// Categories: the user creates and manages categories explicitly. Each
// category is just a tag, but we persist the *list* in localStorage so empty
// categories survive (you can create a bucket before adding anything to it),
// and we expose Rename / Delete on each chip. Renaming bulk-updates every
// someday entry that carries the tag. The quick-add auto-tags new items
// with the active filter; each row has an inline "Move to…" picker so you
// can rebucket without leaving the tab.
//
// Gated behind the `someday` power feature in Everion.tsx; the parent
// TodoView only mounts this when the flag is on.

const ALL = "__all__";
const UNTAGGED = "__untagged__";

// Tag we always strip from category chips. Every bulk-imported launch entry
// has it as a marker, but it's not useful as a filter — every item would
// have it, so it adds no signal.
const HIDDEN_CATEGORY_TAGS = new Set(["launch"]);

// Categories live on the brain (server-side, JSONB column) so they sync
// across devices. localStorage acts as an optimistic cache so the chips
// render instantly on every load and writes don't block the UI.
const userCatsKey = (brainId: string | undefined) =>
  brainId ? `everion.someday.categories.${brainId}` : "everion.someday.categories.default";

function readCachedCategories(brainId: string | undefined): string[] {
  try {
    const raw = localStorage.getItem(userCatsKey(brainId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string" && s.trim()) : [];
  } catch {
    return [];
  }
}

function writeCachedCategories(brainId: string | undefined, list: string[]) {
  try {
    localStorage.setItem(userCatsKey(brainId), JSON.stringify(list));
  } catch {
    /* quota or disabled — ignore */
  }
}

// Pull the current category list from the brain row. Returns null on any
// failure so the caller can fall back to the local cache.
async function fetchBrainCategories(brainId: string): Promise<string[] | null> {
  try {
    const res = await authFetch("/api/brains");
    if (!res.ok) return null;
    const brains: Array<{ id: string; metadata?: { someday_categories?: unknown } }> =
      await res.json();
    const brain = brains.find((b) => b.id === brainId);
    const list = brain?.metadata?.someday_categories;
    if (!Array.isArray(list)) return [];
    return list.filter((s): s is string => typeof s === "string" && !!s.trim());
  } catch {
    return null;
  }
}

async function pushBrainCategories(brainId: string, list: string[]): Promise<void> {
  try {
    await authFetch("/api/brains", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: brainId, metadata: { someday_categories: list } }),
    });
  } catch (err) {
    console.error("[someday-cats-sync]", err);
  }
}

interface Props {
  entries: Entry[];
  brainId?: string;
  onAdded: () => void;
  onUpdate?: (id: string, changes: Partial<Entry>) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
}

export default function TodoSomedayTab({
  entries,
  brainId,
  onAdded,
  onUpdate,
  onDelete,
}: Props): JSX.Element {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string>(ALL);
  // Bulk-select mode — same UX as Memory view's Select toggle.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Optimistic entries — instant-render before server confirms. Matched
  // by id (server returns final id; we replace optimistic by content).
  const [optimisticEntries, setOptimisticEntries] = useState<Entry[]>([]);

  const toggleSelectMode = () => {
    setSelectMode((m) => {
      if (m) setSelectedIds(new Set());
      return !m;
    });
  };
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  // User-defined category list. Optimistic flow:
  //   1. Render from localStorage cache immediately (no flicker).
  //   2. Fetch from brain on mount; if server has newer/different list,
  //      adopt it and update the cache.
  //   3. Every mutation writes localStorage synchronously and PATCHes the
  //      brain in the background.
  const [userCategories, setUserCategories] = useState<string[]>(() =>
    readCachedCategories(brainId),
  );
  useEffect(() => {
    setUserCategories(readCachedCategories(brainId));
    if (!brainId) return;
    let cancelled = false;
    fetchBrainCategories(brainId).then((server) => {
      if (cancelled || !server) return;
      const cached = readCachedCategories(brainId);
      // Server is authoritative; merge cache only if server is empty (covers
      // first-ever sync after upgrading from local-only).
      const next = server.length === 0 && cached.length > 0 ? cached : server;
      setUserCategories(next);
      writeCachedCategories(brainId, next);
      // Backfill server if it had nothing and cache had local categories.
      if (server.length === 0 && cached.length > 0) {
        pushBrainCategories(brainId, cached);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [brainId]);
  const persistUserCategories = (next: string[]) => {
    const cleaned = Array.from(new Set(next.map((s) => s.trim()).filter(Boolean)));
    setUserCategories(cleaned);
    writeCachedCategories(brainId, cleaned);
    if (brainId) pushBrainCategories(brainId, cleaned);
  };

  // Merge real entries with optimistic-render entries. Optimistic IDs
  // start with "tmp-" so they can never collide with server UUIDs. Once
  // the next refetch lands an entry with matching content, we drop the
  // optimistic twin via the effect below.
  const allItems = useMemo(() => {
    const real = entries.filter((e) => e.type === "someday" && !isDone(e));
    const realKeys = new Set(real.map((e) => `${e.title}::${e.content || ""}`));
    const stillPending = optimisticEntries.filter(
      (e) => !realKeys.has(`${e.title}::${e.content || ""}`),
    );
    return [...stillPending, ...real].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
    );
  }, [entries, optimisticEntries]);

  // Prune optimistic entries that now exist in the real list — keeps state
  // tight and avoids stale ghosts.
  useEffect(() => {
    if (optimisticEntries.length === 0) return;
    const realKeys = new Set(
      entries.filter((e) => e.type === "someday").map((e) => `${e.title}::${e.content || ""}`),
    );
    const surviving = optimisticEntries.filter(
      (e) => !realKeys.has(`${e.title}::${e.content || ""}`),
    );
    if (surviving.length !== optimisticEntries.length) setOptimisticEntries(surviving);
  }, [entries, optimisticEntries]);

  const addOptimistic = (entry: Entry) => {
    setOptimisticEntries((prev) => [entry, ...prev]);
  };

  // Category list: union of (a) tags currently in use across someday items
  // and (b) user-declared categories — so a freshly-created empty bucket
  // still shows up. Counts come from items only.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of allItems) {
      for (const raw of e.tags ?? []) {
        const tag = raw.trim();
        if (!tag) continue;
        if (HIDDEN_CATEGORY_TAGS.has(tag)) continue;
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    for (const tag of userCategories) {
      if (!counts.has(tag)) counts.set(tag, 0);
    }
    return [...counts.entries()]
      .map(([tag, n]) => ({ tag, n }))
      .sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag));
  }, [allItems, userCategories]);

  const untaggedCount = useMemo(
    () =>
      allItems.filter((e) =>
        (e.tags ?? []).every((t) => !t.trim() || HIDDEN_CATEGORY_TAGS.has(t.trim())),
      ).length,
    [allItems],
  );

  const items = useMemo(() => {
    if (selectedTag === ALL) return allItems;
    if (selectedTag === UNTAGGED) {
      return allItems.filter((e) =>
        (e.tags ?? []).every((t) => !t.trim() || HIDDEN_CATEGORY_TAGS.has(t.trim())),
      );
    }
    return allItems.filter((e) => (e.tags ?? []).some((t) => t.trim() === selectedTag));
  }, [allItems, selectedTag]);

  const completedItems = useMemo(
    () =>
      entries
        .filter((e) => e.type === "someday" && isDone(e))
        .sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
        ),
    [entries],
  );

  // All known category tags for inline rebucketing dropdown (no hidden tags).
  const knownTags = useMemo(() => categories.map((c) => c.tag), [categories]);

  const createCategory = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    if (HIDDEN_CATEGORY_TAGS.has(name)) return;
    if (userCategories.includes(name) || knownTags.includes(name)) {
      setSelectedTag(name);
      return;
    }
    persistUserCategories([...userCategories, name]);
    setSelectedTag(name);
  };

  const renameCategory = async (oldName: string, newRaw: string) => {
    const newName = newRaw.trim();
    if (!newName || newName === oldName) return;
    if (HIDDEN_CATEGORY_TAGS.has(newName)) return;
    // Bulk-update every someday entry carrying the old tag.
    const affected = allItems.filter((e) => (e.tags ?? []).some((t) => t.trim() === oldName));
    for (const entry of affected) {
      const next = (entry.tags ?? []).map((t) => (t.trim() === oldName ? newName : t));
      try {
        await onUpdate?.(entry.id, { tags: next });
      } catch (err) {
        console.error("[someday-rename]", err);
      }
    }
    // Persist in user list too (covers empty buckets).
    persistUserCategories(
      userCategories.map((t) => (t === oldName ? newName : t)).filter((t) => t !== ""),
    );
    if (selectedTag === oldName) setSelectedTag(newName);
  };

  const deleteCategory = async (name: string) => {
    // Strip the tag from every someday entry that has it. Items themselves
    // are kept — they just become untagged (or keep other tags).
    //
    // Per-entry tag arrays differ, so we group by next-tag-set and fire one
    // bulk PATCH per group. In practice almost every affected row ends up
    // with the same `tags` after the strip (only rows with extra unique
    // tags differ), so this collapses to ~1-3 round-trips for any
    // realistic pile size — vs the old per-entry loop that 429'd at 30
    // affected rows.
    const affected = allItems.filter((e) => (e.tags ?? []).some((t) => t.trim() === name));
    const groups = new Map<string, { tags: string[]; ids: string[] }>();
    for (const entry of affected) {
      const next = (entry.tags ?? []).filter((t) => t.trim() !== name);
      const key = JSON.stringify(next);
      const group = groups.get(key);
      if (group) group.ids.push(entry.id);
      else groups.set(key, { tags: next, ids: [entry.id] });
    }
    // Optimistic UI: caller (Everion) already wired onUpdate to update
    // local state per-entry. We bypass it for the bulk path and POST
    // straight to the server — but we still mirror the local-state
    // update so the chip count drops immediately. The next entries
    // refetch picks up the canonical state.
    await Promise.all(
      Array.from(groups.values()).map(async (group) => {
        try {
          const r = await authFetch("/api/entries?action=bulk-patch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: group.ids, patch: { tags: group.tags } }),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          // Mirror to local state so the UI reflects the change without a
          // full refetch.
          for (const id of group.ids) {
            await onUpdate?.(id, { tags: group.tags });
          }
        } catch (err) {
          console.error("[someday-delete-cat:bulk]", err);
        }
      }),
    );
    persistUserCategories(userCategories.filter((t) => t !== name));
    if (selectedTag === name) setSelectedTag(ALL);
  };

  // ── Bulk-action handlers ───────────────────────────────────────────────
  // All hit /api/entries?action=bulk-patch where possible (one round-trip
  // for tags/status/pinned) and fall back to per-entry updates only where
  // the field isn't whitelisted (type changes during scheduling).

  const bulkDone = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    try {
      const r = await authFetch("/api/entries?action=bulk-patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, patch: { status: "done" } }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // Mirror to local state so cards disappear immediately.
      for (const id of ids) {
        const entry = allItems.find((e) => e.id === id);
        if (entry) {
          await onUpdate?.(id, {
            metadata: { ...(entry.metadata || {}), status: "done" },
          });
        }
      }
    } catch (err) {
      console.error("[someday-bulk-done]", err);
    }
    clearSelection();
  };

  const bulkDrop = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    // Two paths.
    //
    // (A) "Select all visible" was active — i.e. the user's intent is
    //     "every someday item in this view." Send a server-side filter
    //     delete instead of the id list. Phase-2 background loading can
    //     leave items.length short of what the DB has; the previous
    //     id-only path silently dropped rows the client hadn't loaded
    //     yet, leaving "deleted" entries to reappear after refresh.
    //     The filter path uses {type:'someday', brain_id, tag?}, scoped
    //     server-side to the user, so EVERY matching row gets deleted.
    //
    // (B) Manual partial selection — send the explicit id list.
    //
    // We detect (A) by checking whether everything currently visible
    // is selected AND the selection isn't smaller than what's visible.
    // Manual partial selection always falls into (B).
    const allVisibleSelected =
      items.length > 0 && items.every((e) => selectedIds.has(e.id)) && ids.length === items.length;
    try {
      let r: Response;
      if (allVisibleSelected) {
        const filter: Record<string, unknown> = { type: "someday" };
        if (brainId) filter.brain_id = brainId;
        if (selectedTag !== ALL && selectedTag !== UNTAGGED) filter.tag = selectedTag;
        r = await authFetch("/api/entries?action=bulk-delete-by-filter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(filter),
        });
      } else {
        r = await authFetch("/api/entries?action=bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      onAdded();
    } catch (err) {
      console.error("[someday-bulk-drop]", err);
    }
    clearSelection();
  };

  const bulkSchedule = async (dateStr: string) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    // type=todo isn't in the bulk-patch whitelist; per-entry it is.
    await Promise.all(
      ids.map(async (id) => {
        const entry = allItems.find((e) => e.id === id);
        if (!entry) return;
        await onUpdate?.(id, {
          type: "todo",
          metadata: {
            ...(entry.metadata || {}),
            scheduled_for: dateStr,
            due_date: dateStr,
            status: "todo",
          },
        });
      }),
    );
    clearSelection();
  };

  const bulkAssignCategory = async (newTag: string) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    // Group by next-tag-set so each group is one bulk PATCH (matches the
    // delete-category pattern).
    const groups = new Map<string, { tags: string[]; ids: string[] }>();
    for (const id of ids) {
      const entry = allItems.find((e) => e.id === id);
      if (!entry) continue;
      const filtered = (entry.tags ?? []).filter((raw) => {
        const t = raw.trim();
        if (!t) return false;
        if (HIDDEN_CATEGORY_TAGS.has(t)) return true;
        return !knownTags.includes(t);
      });
      const next = newTag === UNTAGGED ? filtered : [...filtered, newTag];
      const key = JSON.stringify(next);
      const group = groups.get(key);
      if (group) group.ids.push(id);
      else groups.set(key, { tags: next, ids: [id] });
    }
    await Promise.all(
      Array.from(groups.values()).map(async (group) => {
        try {
          const r = await authFetch("/api/entries?action=bulk-patch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: group.ids, patch: { tags: group.tags } }),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          for (const id of group.ids) {
            await onUpdate?.(id, { tags: group.tags });
          }
        } catch (err) {
          console.error("[someday-bulk-cat]", err);
        }
      }),
    );
    clearSelection();
  };

  const recategorise = async (entry: Entry, newTag: string) => {
    // Strip every existing *known* category tag, keep hidden tags + free-form
    // tags that aren't categories. Add the new one unless moving to untagged.
    const filtered = (entry.tags ?? []).filter((raw) => {
      const t = raw.trim();
      if (!t) return false;
      if (HIDDEN_CATEGORY_TAGS.has(t)) return true;
      return !knownTags.includes(t);
    });
    const next = newTag === UNTAGGED ? filtered : [...filtered, newTag];
    setBusyId(entry.id);
    try {
      await onUpdate?.(entry.id, { tags: next });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--line-soft)",
          borderRadius: 16,
          padding: 16,
          boxShadow: "var(--lift-1)",
        }}
      >
        <SomedayQuickAdd
          brainId={brainId}
          onAdded={onAdded}
          onOptimistic={addOptimistic}
          knownTags={knownTags}
          activeTag={selectedTag !== ALL && selectedTag !== UNTAGGED ? selectedTag : ""}
        />
      </div>

      <CategoryChips
        all={allItems.length}
        untagged={untaggedCount}
        categories={categories}
        selected={selectedTag}
        selectMode={selectMode}
        canSelect={allItems.length > 0}
        onToggleSelectMode={toggleSelectMode}
        onSelect={setSelectedTag}
        onCreate={createCategory}
        onRename={renameCategory}
        onDelete={deleteCategory}
      />

      {items.length === 0 ? (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            borderRadius: 16,
            padding: "40px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 32, opacity: 0.3, marginBottom: 8 }}>∞</div>
          <p
            className="f-serif"
            style={{
              fontSize: 16,
              fontStyle: "italic",
              color: "var(--ink-soft)",
              margin: "0 0 6px",
            }}
          >
            {selectedTag === ALL
              ? "Someday is empty."
              : selectedTag === UNTAGGED
                ? "Nothing untagged."
                : `No items in “${selectedTag}”.`}
          </p>
          <p
            className="f-sans"
            style={{ fontSize: 13, color: "var(--ink-faint)", margin: 0, lineHeight: 1.5 }}
          >
            Capture anything that's not for today. When the week's planned, pull from here.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {items.map((entry, idx) => (
            <SomedayRow
              key={entry.id}
              entry={entry}
              last={idx === items.length - 1}
              busy={busyId === entry.id}
              scheduling={scheduleId === entry.id}
              knownTags={knownTags}
              selectMode={selectMode}
              selected={selectedIds.has(entry.id)}
              onToggleSelect={() => toggleSelected(entry.id)}
              onRecategorise={(t) => recategorise(entry, t)}
              onStartSchedule={() => setScheduleId(entry.id)}
              onCancelSchedule={() => setScheduleId(null)}
              onSchedule={async (dateStr) => {
                setBusyId(entry.id);
                setScheduleId(null);
                try {
                  await onUpdate?.(entry.id, {
                    type: "todo",
                    metadata: {
                      ...(entry.metadata || {}),
                      // Canonical Phase 2 field; legacy due_date mirrored for
                      // any callers still reading it.
                      scheduled_for: dateStr,
                      due_date: dateStr,
                      status: "todo",
                    },
                  });
                } finally {
                  setBusyId(null);
                }
              }}
              onDone={async () => {
                setBusyId(entry.id);
                try {
                  await onUpdate?.(entry.id, {
                    metadata: { ...(entry.metadata || {}), status: "done" },
                  });
                } finally {
                  setBusyId(null);
                }
              }}
              onDrop={async () => {
                setBusyId(entry.id);
                try {
                  await onDelete?.(entry.id);
                } finally {
                  setBusyId(null);
                }
              }}
            />
          ))}
        </div>
      )}

      {completedItems.length > 0 && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            borderRadius: 16,
            padding: "12px 16px",
          }}
        >
          <p
            className="f-sans"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--ink-faint)",
              margin: "0 0 6px",
            }}
          >
            Recently done · {completedItems.length}
          </p>
          {completedItems.slice(0, 5).map((e) => (
            <p
              key={e.id}
              className="f-serif"
              style={{
                margin: "4px 0",
                fontSize: 13,
                color: "var(--ink-ghost)",
                textDecoration: "line-through",
              }}
            >
              {e.title}
            </p>
          ))}
        </div>
      )}

      {selectMode &&
        selectedIds.size > 0 &&
        // Portal to <body> so the bar's `position: fixed` is anchored to the
        // viewport, not the `.animate-view-enter` ancestor (whose slide-up
        // transform creates a containing block that breaks fixed positioning
        // — same reason Memory's BulkActionBar lives outside the wrapper in
        // Everion.tsx:881-884).
        createPortal(
          <SomedayBulkBar
            count={selectedIds.size}
            allVisibleCount={items.length}
            allSelected={items.every((e) => selectedIds.has(e.id))}
            knownTags={knownTags}
            onSelectAllVisible={() => {
              const next = new Set(selectedIds);
              items.forEach((e) => next.add(e.id));
              setSelectedIds(next);
            }}
            onClearVisible={() => {
              const next = new Set(selectedIds);
              items.forEach((e) => next.delete(e.id));
              setSelectedIds(next);
            }}
            onDone={bulkDone}
            onSchedule={bulkSchedule}
            onDrop={bulkDrop}
            onAssignCategory={bulkAssignCategory}
            onCancel={clearSelection}
          />,
          document.body,
        )}
    </div>
  );
}

function CategoryChips({
  all,
  untagged,
  categories,
  selected,
  selectMode,
  canSelect,
  onToggleSelectMode,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  all: number;
  untagged: number;
  categories: { tag: string; n: number }[];
  selected: string;
  selectMode: boolean;
  canSelect: boolean;
  onToggleSelectMode: () => void;
  onSelect: (tag: string) => void;
  onCreate: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
}): JSX.Element {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const submitNew = () => {
    const name = draft.trim();
    if (!name) {
      setAdding(false);
      setDraft("");
      return;
    }
    onCreate(name);
    setDraft("");
    setAdding(false);
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
      }}
    >
      <Chip label={`All · ${all}`} active={selected === ALL} onClick={() => onSelect(ALL)} />
      {untagged > 0 && (
        <Chip
          label={`Untagged · ${untagged}`}
          active={selected === UNTAGGED}
          onClick={() => onSelect(UNTAGGED)}
        />
      )}
      {categories.map((c) => (
        <ChipWithMenu
          key={c.tag}
          tag={c.tag}
          count={c.n}
          active={selected === c.tag}
          menuOpen={menuFor === c.tag}
          onSelect={() => onSelect(c.tag)}
          onOpenMenu={() => setMenuFor(menuFor === c.tag ? null : c.tag)}
          onCloseMenu={() => setMenuFor(null)}
          onRename={(newName) => {
            onRename(c.tag, newName);
            setMenuFor(null);
          }}
          onDelete={() => {
            onDelete(c.tag);
            setMenuFor(null);
          }}
        />
      ))}

      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submitNew}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitNew();
            } else if (e.key === "Escape") {
              setAdding(false);
              setDraft("");
            }
          }}
          placeholder="New category…"
          className="f-sans"
          style={{
            height: 32,
            padding: "0 12px",
            fontSize: 13,
            fontWeight: 500,
            border: "1px dashed var(--ember)",
            borderRadius: 8,
            background: "var(--surface-low)",
            color: "var(--ink)",
            outline: 0,
            minWidth: 140,
          }}
        />
      ) : (
        <Chip label="+ New" onClick={() => setAdding(true)} dashed />
      )}

      {canSelect && (
        <>
          <span style={{ flex: 1 }} />
          <button
            className="press f-sans"
            onClick={onToggleSelectMode}
            aria-pressed={selectMode}
            style={{
              height: 32,
              minHeight: 32,
              padding: "0 12px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              background: selectMode ? "var(--ember-wash)" : "transparent",
              color: selectMode ? "var(--ember)" : "var(--ink-faint)",
              border: selectMode ? "1px solid var(--ember)" : "1px solid transparent",
              cursor: "pointer",
              transition: "all 180ms",
            }}
          >
            {selectMode ? "Done" : "Select"}
          </button>
        </>
      )}
    </div>
  );
}

function Chip({
  label,
  active,
  dashed,
  onClick,
}: {
  label: string;
  active?: boolean;
  dashed?: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="press f-sans"
      aria-pressed={active}
      style={{
        height: 32,
        padding: "0 12px",
        fontSize: 13,
        fontWeight: 500,
        border: dashed
          ? "1px dashed var(--line)"
          : active
            ? "1px solid var(--ember)"
            : "1px solid transparent",
        borderRadius: 8,
        background: active ? "var(--ember-wash)" : "transparent",
        color: active ? "var(--ember)" : "var(--ink-faint)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all 180ms",
      }}
    >
      {label}
    </button>
  );
}

function ChipWithMenu({
  tag,
  count,
  active,
  menuOpen,
  onSelect,
  onOpenMenu,
  onCloseMenu,
  onRename,
  onDelete,
}: {
  tag: string;
  count: number;
  active: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
}): JSX.Element {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(tag);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!menuOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient panel state when menu closes; matches the close animation.
      setConfirmingDelete(false);
      setRenaming(false);
    }
  }, [menuOpen]);

  return (
    <div style={{ display: "inline-flex" }}>
      <button
        onClick={onSelect}
        className="press f-sans"
        aria-pressed={active}
        style={{
          height: 32,
          padding: "0 8px 0 12px",
          fontSize: 13,
          fontWeight: 500,
          border: active ? "1px solid var(--ember)" : "1px solid transparent",
          borderRight: "none",
          borderRadius: "8px 0 0 8px",
          background: active ? "var(--ember-wash)" : "transparent",
          color: active ? "var(--ember)" : "var(--ink-faint)",
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "all 180ms",
        }}
      >
        {tag} · {count}
      </button>
      <Popover open={menuOpen} onOpenChange={(o) => (o ? onOpenMenu() : onCloseMenu())}>
        <PopoverTrigger
          aria-label={`Edit category ${tag}`}
          className="press f-sans"
          style={{
            height: 32,
            padding: "0 8px",
            fontSize: 13,
            border: active ? "1px solid var(--ember)" : "1px solid transparent",
            borderRadius: "0 8px 8px 0",
            background: active ? "var(--ember-wash)" : "transparent",
            color: active ? "var(--ember)" : "var(--ink-faint)",
            cursor: "pointer",
            transition: "all 180ms",
          }}
        >
          ⋯
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="min-w-[200px] p-1.5"
          style={{ background: "var(--surface)", borderColor: "var(--line-soft)" }}
        >
          {renaming ? (
            <div style={{ display: "flex", gap: 4, padding: 4 }}>
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onRename(draft);
                    setRenaming(false);
                  } else if (e.key === "Escape") {
                    setRenaming(false);
                    setDraft(tag);
                  }
                }}
                className="f-sans"
                style={{
                  flex: 1,
                  height: 26,
                  padding: "0 8px",
                  fontSize: 12,
                  border: "1px solid var(--line-soft)",
                  borderRadius: 6,
                  background: "var(--surface-low)",
                  color: "var(--ink)",
                  outline: 0,
                }}
              />
              <Button
                size="sm"
                variant="moss"
                onClick={() => {
                  onRename(draft);
                  setRenaming(false);
                }}
              >
                Save
              </Button>
            </div>
          ) : confirmingDelete ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 6 }}>
              <p
                className="f-sans"
                style={{
                  margin: 0,
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: "var(--ink)",
                }}
              >
                Delete category <span style={{ fontWeight: 600 }}>“{tag}”</span>? Items keep their
                other tags but lose this one.
              </p>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <Button size="sm" variant="outline" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setConfirmingDelete(false);
                    onDelete();
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <MenuItem label="Rename" onClick={() => setRenaming(true)} />
              <MenuItem
                label="Delete category"
                tone="danger"
                onClick={() => setConfirmingDelete(true)}
              />
              <MenuItem label="Close" onClick={onCloseMenu} />
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  tone,
}: {
  label: string;
  onClick: () => void;
  tone?: "danger";
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="press f-sans"
      style={{
        textAlign: "left",
        padding: "6px 10px",
        fontSize: 12,
        background: "transparent",
        border: "none",
        borderRadius: 6,
        color: tone === "danger" ? "var(--danger, #c44)" : "var(--ink)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function SomedayRow({
  entry,
  last,
  busy,
  scheduling,
  knownTags,
  selectMode,
  selected,
  onToggleSelect,
  onRecategorise,
  onStartSchedule,
  onCancelSchedule,
  onSchedule,
  onDone,
  onDrop,
}: {
  entry: Entry;
  last: boolean;
  busy: boolean;
  scheduling: boolean;
  knownTags: string[];
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onRecategorise: (newTag: string) => void;
  onStartSchedule: () => void;
  onCancelSchedule: () => void;
  onSchedule: (dateStr: string) => void;
  onDone: () => void;
  onDrop: () => void;
}): JSX.Element {
  // Captured once at mount so React Compiler can treat the row as pure;
  // age stamps don't need second-by-second precision.
  const [now] = useState(() => Date.now());
  const ageDays = entry.created_at
    ? Math.floor((now - new Date(entry.created_at).getTime()) / 86_400_000)
    : null;

  // The row's *current* category — first known tag, ignoring hidden ones.
  const currentTag = (entry.tags ?? [])
    .map((t) => t.trim())
    .find((t) => t && !HIDDEN_CATEGORY_TAGS.has(t) && knownTags.includes(t));

  // Status chip text — category if tagged, "Someday" otherwise. Mirrors
  // PrimePro pattern from Day/Week/Month: every entry gets a colored
  // uppercase chip up top so the same visual grammar runs across tabs.
  const statusLabel = currentTag ?? "Someday";
  const ageLabel =
    ageDays === null
      ? null
      : ageDays === 0
        ? "Today"
        : ageDays === 1
          ? "Yesterday"
          : `${ageDays} days ago`;

  return (
    <div
      onClick={selectMode ? onToggleSelect : undefined}
      style={{
        background: selected ? "var(--ember-wash)" : "var(--surface)",
        border: selected ? "1px solid var(--ember)" : "1px solid var(--line-soft)",
        borderRadius: 14,
        padding: "14px 16px 12px",
        opacity: busy ? 0.5 : 1,
        transition: "opacity 200ms, background 160ms, border-color 160ms",
        cursor: selectMode ? "pointer" : "default",
        // Last-item bottom margin handled by the parent flex gap; keep
        // for legacy callers that might still rely on `last`.
        marginBottom: last ? 0 : 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {selectMode && (
          <span
            aria-hidden="true"
            style={{
              width: 20,
              height: 20,
              borderRadius: 6,
              border: selected ? "2px solid var(--ember)" : "2px solid var(--line)",
              background: selected ? "var(--ember)" : "transparent",
              flexShrink: 0,
              marginTop: 2,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 160ms",
            }}
          >
            {selected && (
              <svg
                width="13"
                height="13"
                viewBox="0 0 12 12"
                fill="none"
                stroke="white"
                strokeWidth="2.2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
              </svg>
            )}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            className="f-sans"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ember)",
              lineHeight: 1,
            }}
          >
            {statusLabel}
          </span>
          <p
            className="f-sans"
            style={{
              margin: "8px 0 0",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--ink)",
              lineHeight: 1.35,
              wordBreak: "break-word",
            }}
          >
            {entry.title}
          </p>
          {entry.content && entry.content !== entry.title && (
            <p
              className="f-serif"
              style={{
                margin: "6px 0 0",
                fontSize: 13,
                fontStyle: "italic",
                color: "var(--ink-soft)",
                lineHeight: 1.55,
                wordBreak: "break-word",
              }}
            >
              {entry.content.length > 240 ? entry.content.slice(0, 237) + "…" : entry.content}
            </p>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 12,
              paddingTop: 10,
              borderTop: "1px solid var(--line-soft)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                background: "var(--surface-high, var(--ember-wash))",
                border: "1px solid var(--line-soft)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--f-serif)",
                fontSize: 11,
                fontWeight: 500,
                color: "var(--ember)",
                flexShrink: 0,
              }}
            >
              {(entry.title || "?").charAt(0).toUpperCase()}
            </span>
            {ageLabel && (
              <span className="f-sans" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                {ageLabel}
              </span>
            )}
            <span style={{ marginLeft: "auto" }} />
            <Select
              value={currentTag ?? UNTAGGED}
              onValueChange={onRecategorise}
              disabled={busy || selectMode}
            >
              <SelectTrigger
                onClick={(e) => e.stopPropagation()}
                className="press f-sans"
                style={{
                  height: 26,
                  fontSize: 11,
                  fontWeight: 600,
                  border: "1px solid var(--line-soft)",
                  borderRadius: 999,
                  background: "var(--bg)",
                  color: "var(--ink-soft)",
                  padding: "0 10px",
                }}
              >
                <SelectValue placeholder="Untagged" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNTAGGED}>Untagged</SelectItem>
                {knownTags.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {!selectMode &&
        (scheduling ? (
          <div style={{ marginTop: 12 }}>
            <ScheduleInline onConfirm={onSchedule} onCancel={onCancelSchedule} />
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <ActionBtn label="Done" onClick={onDone} disabled={busy} tone="moss" />
            <ActionBtn label="Schedule" onClick={onStartSchedule} disabled={busy} tone="ember" />
            <ActionBtn label="Drop" onClick={onDrop} disabled={busy} tone="ghost" />
          </div>
        ))}
    </div>
  );
}

// Full-width action button for the Done / Schedule / Drop trio. Each
// instance flexes to 1 so the three buttons split the row evenly with
// breathing room between them.
// Thin wrappers around the shared <Button> primitive. They preserve the
// tone-based call-site API (so existing JSX doesn't change), but every
// pixel of the rendered button now comes from src/components/ui/button.tsx.
// Migrating other files = the same pattern: map your local tone semantics
// to one of the Button variants.

function ActionBtn({
  label,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone: "ember" | "moss" | "ghost";
}): JSX.Element {
  const variant = tone === "ember" ? "default" : tone === "moss" ? "moss" : "outline";
  return (
    <Button
      variant={variant}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className="flex-1"
    >
      {label}
    </Button>
  );
}

// Compact button for ScheduleInline picker (Today / Tomorrow / Next Mon /
// Set / Cancel) where a content-sized look reads better than the uniform-
// width ActionBtn.
function SmallBtn({
  label,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone: "ember" | "moss" | "ghost";
}): JSX.Element {
  const variant = tone === "ember" ? "default" : tone === "moss" ? "moss" : "ghost";
  return (
    <Button variant={variant} size="sm" onClick={onClick} disabled={disabled}>
      {label}
    </Button>
  );
}

function ScheduleInline({
  onConfirm,
  onCancel,
}: {
  onConfirm: (dateStr: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const nextMon = new Date(today);
  const dow = today.getDay();
  const daysToMonday = dow === 0 ? 1 : dow === 1 ? 7 : 8 - dow;
  nextMon.setDate(today.getDate() + daysToMonday);
  const [picked, setPicked] = useState(todayStr);

  return (
    <div
      style={{
        marginTop: 10,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
      }}
    >
      <SmallBtn label="Today" tone="ember" onClick={() => onConfirm(todayStr)} />
      <SmallBtn
        label="Tomorrow"
        tone="ember"
        onClick={() => onConfirm(format(tomorrow, "yyyy-MM-dd"))}
      />
      <SmallBtn
        label="Next Mon"
        tone="ember"
        onClick={() => onConfirm(format(nextMon, "yyyy-MM-dd"))}
      />
      <DateField
        value={picked}
        onChange={setPicked}
        ariaLabel="Pick a custom date"
        placeholder="Pick date"
      />
      <SmallBtn label="Set" tone="moss" onClick={() => onConfirm(picked)} />
      <SmallBtn label="Cancel" tone="ghost" onClick={onCancel} />
    </div>
  );
}

function SomedayQuickAdd({
  brainId,
  onAdded,
  onOptimistic,
  knownTags,
  activeTag,
}: {
  brainId?: string;
  onAdded: () => void;
  onOptimistic: (entry: Entry) => void;
  knownTags: string[];
  activeTag?: string;
}): JSX.Element {
  const [text, setText] = useState("");
  // Category picked at add-time. Defaults to the active filter so the
  // "Add to <category>" path is single-tap when filtered, but can be
  // overridden per-add via the inline picker.
  const [pickedTag, setPickedTag] = useState<string>(activeTag || "");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Sync the picker default when the active filter changes (user clicks
  // a different category chip). Reset-on-prop-change pattern from the
  // React docs — runs during render, no effect → no extra commit pass.
  const [prevActiveTag, setPrevActiveTag] = useState(activeTag);
  if (activeTag !== prevActiveTag) {
    setPrevActiveTag(activeTag);
    setPickedTag(activeTag || "");
  }

  function autoResize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const raw = text.trim();
    if (!raw || !brainId) return;
    const title = raw.length > 60 ? raw.slice(0, 57) + "…" : raw;
    const tags = pickedTag ? [pickedTag] : [];

    // Optimistic insert — show the entry instantly. Server confirmation
    // comes in via onAdded refetch and replaces this twin (matched by
    // title+content in the parent's merge logic). No parser involved
    // for someday, so the lag was purely network — kill it.
    const optimistic: Entry = {
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      content: raw,
      type: "someday",
      tags,
      metadata: {},
      created_at: new Date().toISOString(),
      brain_id: brainId,
    } as Entry;
    onOptimistic(optimistic);

    // Reset input visuals immediately.
    setText("");
    const el = ref.current;
    if (el) el.style.height = "auto";

    // Fire-and-forget the persist; parent's onAdded triggers refetch
    // when the server replies.
    authFetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_title: title,
        p_content: raw,
        p_type: "someday",
        p_brain_id: brainId,
        p_metadata: {},
        p_tags: tags,
      }),
    })
      .then(() => onAdded())
      .catch((err) => console.error("[someday-quick-add]", err));
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        background: "var(--surface-low)",
        border: "1px solid var(--line-soft)",
        borderRadius: 10,
        padding: "8px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 200 }}>
        <span style={{ fontSize: 18, color: "var(--ember)", flexShrink: 0 }}>∞</span>
        <textarea
          ref={ref}
          value={text}
          rows={1}
          onChange={(e) => {
            setText(e.target.value);
            autoResize();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(e as React.FormEvent);
            }
          }}
          placeholder="Something for someday — no date needed…"
          className="f-sans"
          style={{
            flex: 1,
            background: "transparent",
            border: 0,
            outline: 0,
            resize: "none",
            fontSize: 14,
            lineHeight: 1.5,
            color: "var(--ink)",
            padding: 0,
            minWidth: 0,
          }}
        />
      </div>
      <Select
        value={pickedTag || "__none__"}
        onValueChange={(v) => setPickedTag(v === "__none__" ? "" : v)}
      >
        <SelectTrigger
          aria-label="Category"
          className="press f-sans"
          style={{
            height: 30,
            fontSize: 12,
            fontWeight: 600,
            border: "1px solid var(--line-soft)",
            borderRadius: 999,
            background: "var(--surface)",
            color: pickedTag ? "var(--ink)" : "var(--ink-faint)",
            flexShrink: 0,
          }}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No category</SelectItem>
          {knownTags.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" disabled={!text.trim()}>
        Add
      </Button>
    </form>
  );
}

// ── Bulk action bar ───────────────────────────────────────────────────────
// Floats above the bottom nav while in select mode. Three primary actions
// (Done / Schedule / Drop) plus a category assigner. Schedule + Drop both
// have inline confirm states (no OS dialogs, per design philosophy). The
// pill collapses to a low-profile chip until the user expands it via the
// "More" affordance — keeps UI light while the user is still picking
// items, and only inflates when they're ready to act.

function SomedayBulkBar({
  count,
  allVisibleCount,
  allSelected,
  knownTags,
  onSelectAllVisible,
  onClearVisible,
  onDone,
  onSchedule,
  onDrop,
  onAssignCategory,
  onCancel,
}: {
  count: number;
  allVisibleCount: number;
  allSelected: boolean;
  knownTags: string[];
  onSelectAllVisible: () => void;
  onClearVisible: () => void;
  onDone: () => Promise<void>;
  onSchedule: (dateStr: string) => Promise<void>;
  onDrop: () => Promise<void>;
  onAssignCategory: (tag: string) => Promise<void>;
  onCancel: () => void;
}): JSX.Element {
  const [phase, setPhase] = useState<"idle" | "scheduling" | "categorising" | "confirmDrop">(
    "idle",
  );
  const [busy, setBusy] = useState(false);

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "calc(76px + env(safe-area-inset-bottom, 0px))",
        zIndex: "var(--z-fab)",
        width: "min(96vw, 520px)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: 12,
          borderRadius: 16,
          background: "var(--surface-high)",
          border: "1px solid var(--line)",
          boxShadow: "var(--lift-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="f-sans" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
            {count} selected
          </span>
          <span style={{ flex: 1 }} />
          <Button
            size="xs"
            variant="outline"
            onClick={allSelected ? onClearVisible : onSelectAllVisible}
          >
            {allSelected ? "Clear" : `Select all ${allVisibleCount}`}
          </Button>
          <Button size="xs" variant="ghost" onClick={onCancel} aria-label="Cancel selection">
            Cancel
          </Button>
        </div>

        {phase === "idle" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ActionBtn
              label={`Done · ${count}`}
              tone="moss"
              disabled={busy}
              onClick={() => wrap(onDone)}
            />
            <ActionBtn
              label="Schedule"
              tone="ember"
              disabled={busy}
              onClick={() => setPhase("scheduling")}
            />
            <ActionBtn
              label="Move"
              tone="ghost"
              disabled={busy}
              onClick={() => setPhase("categorising")}
            />
            <ActionBtn
              label="Drop"
              tone="ghost"
              disabled={busy}
              onClick={() => setPhase("confirmDrop")}
            />
          </div>
        )}

        {phase === "scheduling" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p className="f-sans" style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>
              Schedule {count} {count === 1 ? "item" : "items"} for…
            </p>
            <ScheduleInline
              onConfirm={async (d) => {
                await wrap(() => onSchedule(d));
                setPhase("idle");
              }}
              onCancel={() => setPhase("idle")}
            />
          </div>
        )}

        {phase === "categorising" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p className="f-sans" style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>
              Move {count} {count === 1 ? "item" : "items"} to…
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  await wrap(() => onAssignCategory(UNTAGGED));
                  setPhase("idle");
                }}
              >
                Untagged
              </Button>
              {knownTags.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    await wrap(() => onAssignCategory(t));
                    setPhase("idle");
                  }}
                >
                  {t}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setPhase("idle")}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {phase === "confirmDrop" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p
              className="f-sans"
              style={{ margin: 0, fontSize: 12, color: "var(--ink)", lineHeight: 1.45 }}
            >
              Drop {count} {count === 1 ? "item" : "items"}? This deletes them.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button size="sm" variant="outline" onClick={() => setPhase("idle")}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={async () => {
                  await wrap(onDrop);
                  setPhase("idle");
                }}
              >
                {busy ? "Dropping…" : "Drop"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
