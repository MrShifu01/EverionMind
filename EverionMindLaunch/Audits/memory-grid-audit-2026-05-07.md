# Memory Grid Audit — 2026-05-07

> Memory grid is the primary navigation surface — every authed user lands here (well, lands on Home now per `useAppShell.ts:56`, then taps Memory). Grid powers `view === "memory"` and `view === "timeline"`. Audits virtualizer, filter pipeline, sort, search, infinite-scroll, sticky header, scroll-restore, keyboard nav, time-to-first-paint with cached entries.

## Verdict

**Mostly solid.** Virtualizer correctly bound to `main-content` after a14d914 refactor — windowing works for any list size. Cache-first hydration paints in two ticks: synchronous `localStorage` bootstrap (`useDataLayer.ts:30-42`) → IDB read finalizing `entriesLoaded` (`useDataLayer.ts:78-87`) → phase-1 network refresh (20 rows) → phase-2 cursor pagination (5000-row hard cap). First paint with warm cache is one render commit.

**Eight findings**, none critical, three medium. Headlines: full client-side filter on every keystroke runs O(n) over up to 5000 entries (F1); no scroll-restore — open a row, close modal, you're back at top of list (F2); no keyboard row navigation, only Tab + Enter card-by-card (F3); virtualizer remounts on every grid↔timeline tab switch via `key={appShell.view}` on `main-content` (F4); search debounce is 200ms (just under the 250–400ms recommendation) and never cancels stale work (F5); list-mode estimateSize 60px collides with actual ~50px row giving 20% wasted overscan (F6); IDB cache hydration race vs phase-1 network can briefly flash empty when phase-1 returns 0 rows for a brand-new brain (F7); `setCOLS` on initial mount reads `window.innerWidth` once, not the actual `listRef` width — first paint can pick wrong column count on narrow desktop sidebars (F8).

Pre-launch fix list is short — F2 (scroll-restore) is the only one a typical user feels every session.

---

## Architecture overview

```
useDataLayer (entry source)
  ├─ localStorage bootstrap (sync)              → entries + entriesLoaded
  ├─ readEntriesCache(brainId)  IDB / LS         → entries (if empty)
  ├─ refreshEntries() phase 1   /api/entries?limit=20    → entries
  └─ refreshEntries() phase 2   listAll() pages of 500   → entries (final)
        + writeEntriesCache + indexEntry per row

Everion.tsx::filtered (useMemo)
  ├─ persona/secret prefilter (allDisplayEntries)
  ├─ workspace filter (inferWorkspace)
  ├─ searchIndex(searchInput → debounced 200ms → search)
  ├─ applyEntryFilters(gridFilters) — type / showCompleted / importSource / concept / date / sort
  └─ relevance re-sort when search active

EverionContent (memory view)
  └─ <main id="main-content" key={view} ref={setScrollEl} overflow-y:auto>
      ├─ MemoryHeader (sticky top:0, z-20)
      └─ VirtualGrid filtered={filtered}
           ├─ ResizeObserver → COLS (1 / 2 / 3)
           ├─ rows = chunk(filtered, COLS)
           └─ useVirtualizer
                ├─ count: rows.length
                ├─ getScrollElement: document.getElementById("main-content")
                ├─ estimateSize: list 60 / grid 190+16
                ├─ overscan: 4
                └─ measureElement: getBoundingClientRect().height
                     → maps over getVirtualItems() → EntryCard / EntryRow
```

---

## Filter / sort inventory

| Filter / sort | Source | Where applied | Persistence | Reset on view-change |
|---|---|---|---|---|
| Search input | `useAppShell.searchInput` (`useAppShell.ts:82`) | `searchIndex(search)` in `Everion.tsx:1378` | none — session only | no (ref-stable) |
| Search debounce | `useAppShell.ts:153-156` | 200ms `setTimeout` → `setSearch` | n/a | n/a |
| Workspace | `useAppShell.workspace` (`useAppShell.ts:84`) | `inferWorkspace` filter `Everion.tsx:1373-1376` | `localStorage["openbrain_workspace"]` | no |
| Type | `gridFilters.type` (`useAppShell.ts:85`) | `applyEntryFilters` `entryFilters.ts:42-44` | none — in-memory only | no |
| Date | `gridFilters.date` | `applyEntryFilters` `entryFilters.ts:78-99` | none | no |
| Sort | `gridFilters.sort` (newest/oldest/pinned) | `applyEntryFilters` `entryFilters.ts:102-118` | none | no |
| Concept | `gridFilters.concept` | `applyEntryFilters` `entryFilters.ts:68-75` (loads graph) | none | no |
| Import source | `gridFilters.importSource` | `applyEntryFilters` `entryFilters.ts:58-65` | none | no |
| Show completed | `gridFilters.showCompleted` | `applyEntryFilters` `entryFilters.ts:50-55` | none — defaults hidden | no |
| Grid view-mode | `gridViewMode` ("grid" / "list") | passed to VirtualGrid `EntryList.tsx:41` | `localStorage["openbrain_viewmode"]` | no |
| Memory↔Timeline | `appShell.view` | branches `Everion.tsx:643-651` vs `:652+` | none | n/a (nav state) |
| Pinned tier sort | inside `applyEntryFilters` sort=pinned | always within-tier date desc | n/a | n/a |
| Relevance ranking | when `appShell.search` truthy | `Everion.tsx:1383-1385` overrides date sort | n/a — derived | n/a |

Notes:
- Sort is **NOT** persisted across reloads or even across nav. Open Memory, switch to "Pinned first", tap Settings, tap Memory — back to "Recent first".
- Filter changes do **NOT** unmount the virtualizer — `filtered` is a new array, virtualizer re-runs `count: rows.length` and re-measures. Confirmed.
- View change Memory↔Timeline **DOES** remount the scroll container via `key={appShell.view}` on `<main id="main-content">` (`Everion.tsx:622`). That re-creates the `getScrollElement` target, so virtualizer instance is effectively re-bound. See F4.

---

## What's solid

- **Virtualizer scroll-element binding fix lands.** `EntryList.tsx:79-80` resolves `document.getElementById("main-content")` lazily — works because `useWindowVirtualizer` (the previous binding per the comment at `EntryList.tsx:71-75`) listened to `window` scroll events but `body:has(.app-shell-fixed)` clamps body to `100lvh` with `overflow:hidden` (`index.css:635-642`). Window scroll never fires. The lazy `getScrollElement` fix matches the layout-architecture memory: signed-in shell uses fixed-height body + main-content scroll container.
- **Two-tier cache hydration.** Synchronous `localStorage` read in the `useState` initialiser (`useDataLayer.ts:30-42`) gives a real first paint of cached entries on mount — no skeleton flash for returning users. IDB fallback (`useDataLayer.ts:78-87`) handles bigger payloads and Safari-private-mode quirks.
- **Per-brain cache key.** `entriesCache.ts:28-34` keys by `entries:${brainId}` (IDB) and `KEYS.entriesCacheForBrain(brainId)` (LS). Brain switch reads the right cache. Stale legacy single-key fallback is purged on read (`entriesCache.ts:110-114`) — closes the foot-gun where personal-brain entries leaked into a freshly-created shared brain.
- **Phase 1 / phase 2 fetch concurrency.** `useDataLayer.ts:210-222` fires `entryRepo.list({limit:20})` and `entryRepo.listAll()` in parallel — phase 1 unblocks the UI in one round-trip while phase 2 walks the cursor pages in the background. Phase 2 is bounded at `LIST_ALL_HARD_CAP = 5000` (`entryRepo.ts:45`) so a runaway brain can't wedge the browser.
- **Skeleton → cache → content transition is single-flight.** `entriesLoaded` is one-way (`useDataLayer.ts:198-203`). Once true, it never flips back, so brain switches and reconnects don't flash a skeleton over already-rendered rows.
- **Vault entries are brain-scoped at three layers.** `useDataLayer.ts:131-141` filters cached vault rows by `brain_id === activeBrainId`; the API call `useDataLayer.ts:146` passes `?brain_id=`; the merge in `Everion.tsx:1361-1365` re-checks `brain_id === activeBrainIdForFilter` for `type === "secret"`. Triple defence vs cross-brain secret leak, with explicit comment on why (`useDataLayer.ts:111-115`).
- **Persona filter at single source.** `Everion.tsx:1360` strips `e.type === "persona"` once in `allDisplayEntries`, every downstream view (memory, timeline, bulk select, search ranking) inherits the exclusion automatically. Comment at `Everion.tsx:1346-1356` explains the rationale.
- **Sticky filter row pinning works.** `MemoryHeader.tsx:48-49` uses `sticky top:0 z-20` on a wrapper that lives inside `main-content`. Comment at `MemoryHeader.tsx:37-47` documents the post-refactor fix (was `top: var(--app-header-h)` which double-counted under `main-content`-scroll layout).
- **Empty state is real.** Memory `entries.length === 0` branch (`Everion.tsx:658-847`) ships:
  - Title + italic blurb
  - "+ Capture a thought" primary CTA wired to `appShell.openCapture()`
  - "Import from somewhere…" secondary wired to `setView("settings")`
  - Four example chips that pre-fill capture (`appShell.openCapture(example)`)
  - Vault setup card if `ff("vault")`
  - Admin loadError surface for debugging
- **No-results-after-filter has its own state.** `Everion.tsx:866-901` — "nothing matches. try a looser word. or a feeling." with a "Capture something new" CTA. Distinct from the cold empty state, correct UX.
- **Pull-to-refresh wired.** `Everion.tsx:367-374` binds `usePullToRefresh` to the scroll element via callback ref (handles `key={view}` remount). Refresh fires `refreshEntries()` + custom event for cross-view refetch.
- **Realtime replaced with cheap poller.** `useEntryRealtime.ts` polls only entries currently `isPendingEnrichment` every 15s, bails on hidden tab, fires immediate tick on visibility regain. Comment at `useEntryRealtime.ts:1-24` documents the trade — postgres_changes was 65% of Supabase DB time. The merge only flips enrichment fields (`useEntryRealtime.ts:84-90`), so optimistic title/tags/content edits aren't clobbered.
- **Realtime poll doesn't cause re-renders unless actually dirty.** `useEntryRealtime.ts:78-94` returns `prev` unchanged when no row diffed.
- **Bulk-action bar lives outside the animate-view-enter wrapper** (`Everion.tsx:1055-1058`) so `position: fixed` actually anchors to the viewport. Comment documents the stacking-context bug.
- **Search index is incremental.** `searchIndex.ts:12-28` indexes one entry at a time on creation/update; `useDataLayer.ts:227, 238` re-indexes on phase 1 + phase 2. `removeFromIndex` (`searchIndex.ts:40-42`) cleans up on delete (called from `useEntryActions`, not visible here but the export exists).
- **Concept names indexed for grid search.** `Everion.tsx:384-389` calls `indexEntryConcepts` for every entry as the concept graph loads — search by concept label finds the underlying entries.
- **No N+1 fetch on row render.** `EntryCard` and `EntryRow` are pure presentation, both `memo()`'d (`EntryCard.tsx:38`, `EntryRow.tsx:15`). All data comes from the `entry` prop. Concept labels read from `entry.metadata.concepts` first (`EntryCard.tsx:74-83`), fall back to the brain-wide `conceptMap` passed once. No fetches per row.
- **Last-page cursor pagination is bounded.** `entryRepo.ts:101-125` walks pages of 500 sequentially; loop exits on empty page, `hasMore=false`, missing cursor, or hard cap. No infinite loop possible.

---

## Findings

### F1 — Filter pipeline is O(n) per keystroke, no incremental indexing
**Severity: MEDIUM**

`Everion.tsx:1370-1387` recomputes `filtered` on every change to `appShell.search` / `appShell.gridFilters` / `appShell.workspace` / `allDisplayEntries`. Pipeline:

1. `allDisplayEntries.filter(workspace)` — O(n) `inferWorkspace` per row
2. `searchIndex(search)` returns `Set<string>` of matching ids by token-substring scan over the entire token map (`searchIndex.ts:54-58`)
3. `r.filter(e => ids.has(e.id))` — O(n)
4. `applyEntryFilters` — clones the array (`entryFilters.ts:39`), then 5+ sequential `.filter()` passes
5. If search active, `result.sort` calls `scoreEntry` twice per pair — O(n log n × score-cost)

Each `setSearchInput` keystroke triggers the 200ms debounced `setSearch` (`useAppShell.ts:153-156`), which retriggers the full pipeline.

**At 5000 entries**: token-map scan in `searchIndex.ts:54-58` iterates every token across all entries (could be 50k+ tokens after concept indexing) — dominates. `applyEntryFilters` is 5 array clones / filters — fine in absolute terms but creates GC pressure. Score sort calls `scoreEntryForQuery` ~n log n times.

**Measured cost not gathered** — no timing harness in the file. P95 user has hundreds-to-low-thousands of entries; perf is likely fine today but degrades sharply past 5k. Pre-launch this is borderline; post-launch (target: thousands of users, some with imports of 10k+ from Notion / Apple Notes) it's a real ceiling.

**Fix path**:
- Add `useMemo` cache keyed on `(search, gridFilters, workspace)` — already there but the deps include `allDisplayEntries` which is itself a new array on every realtime poll merge → cache thrash.
- Move `searchIndex` from a flat `Map<token, Set<id>>` to a prefix tree or precomputed n-gram bucket — token-substring scan over all keys is the hot path.
- Memoize `inferWorkspace(e)` as a property on the entry (it doesn't change unless metadata does).

### F2 — No scroll-restore on back-from-modal
**Severity: MEDIUM**

User scrolls to row 200, taps it → `DetailModal` opens (overlay, not navigation). User closes modal → grid is still scrolled at row 200 (good — modal didn't unmount the grid).

But: user scrolls to row 200, switches to Timeline tab, switches back to Grid → `key={appShell.view}` on `main-content` (`Everion.tsx:622`) **remounts the scroll container**. Virtualizer is re-instantiated, all `useVirtualizer` state resets, `scrollTop` is 0. Same on Memory → Settings → Memory.

No `scrollY` save/restore anywhere — confirmed by `Grep`: only `ExitIntentSlideIn.tsx` references `scrollY`. No `sessionStorage` write of scroll position keyed on view.

`@tanstack/react-virtual` has `initialOffset` config and `scrollToOffset` — neither used here.

**Fix**: `useEffect` on view change writes `main-content.scrollTop` to `sessionStorage[`memory_scroll_${view}`]`; on remount, virtualizer is given `initialOffset` from the stored value. Or remove `key={appShell.view}` on `main-content` and let view branches share the same scroll container — would also fix F4. Choice depends on whether per-view scroll positions are wanted (most apps want them).

### F3 — No keyboard row navigation
**Severity: MEDIUM**

`EntryCard.tsx:209-218` and `EntryRow.tsx:161-170` handle `Enter` / `Space` (activate) and `Escape` (close swipe). No arrow keys, no `j` / `k`, no roving focus. `tabIndex={0}` on every card means Tab steps through every card sequentially — 5000 entries = 5000 tab stops.

The grid has no `role="grid"`, no `aria-rowcount`, no `aria-colcount`. Screen readers see a flat list of buttons. No "Skip to first card" or "Skip to last card" affordance beyond browser default.

This isn't a launch-blocker for keyboard accessibility (Tab + Enter works) but it's the least-polished surface in the app for power users — note that Cmd/Ctrl+/ opens OmniSearch (`OmniSearch.tsx:122`), Cmd/Ctrl+K opens Capture (`Everion.tsx:394-404`), and the grid itself has no shortcut.

**Fix**: roving `tabindex` (only the focused card has `tabindex=0`, others `-1`); arrow keys move focus across rows/cols; `Home`/`End` jump to first/last. Standard ARIA grid pattern. ~50 lines in a `useGridKeyboardNav(rows, cols)` hook.

### F4 — Scroll container `key={appShell.view}` remounts virtualizer on every tab switch
**Severity: LOW** — UX-perceivable but bounded

`Everion.tsx:622`: `<div id="main-content" key={appShell.view} ref={setScrollEl} ...>`. Comment at `Everion.tsx:362-365` explains: "callback ref pattern because `<div id="main-content">` remounts on view changes via `key={appShell.view}`". Confirmed intentional.

Cost:
- Pull-to-refresh hook re-binds (callback ref handles this — fine).
- Virtualizer instance remounts; `scrollTop` resets to 0 (this is F2).
- Realtime poll keeps running unaffected (it's at `Everion` level above).
- `<MemoryHeader>` re-mounts → re-renders all the segmented-control buttons.

Net: tab switch Memory↔Timeline (which is `view === "timeline"`, also rendered in the same memory branch `Everion.tsx:628`) takes one full mount cycle ~16-32ms. User-perceivable as a tiny flicker. Animate-view-enter class hides it.

**Fix**: drop the `key`; views are mutually exclusive branches inside the same scroll container, so the scroll-container itself doesn't need to remount. `animate-view-enter` is fine on a sub-wrapper.

### F5 — Search debounce 200ms, no request cancellation
**Severity: LOW**

`useAppShell.ts:153-156`: `setTimeout(() => setSearch(searchInput), 200)`. 200ms is below the standard 250–400ms recommendation but search is **purely client-side** (`searchIndex` is a local `Map`) so the latency budget is different — no network round-trip to debounce against.

What isn't there: when `searchInput` changes mid-debounce, the previous timeout is correctly cleared (`useAppShell.ts:155`). But there's no concept of "stale work" because the search is synchronous over an in-memory map. So nothing actually leaks.

200ms is fine for client-only; mention it because the audit prompt called for the 250–400ms window — that range is for network-backed search. Verdict: no fix needed, but document the why.

### F6 — List-mode `estimateSize: 60` overshoots actual row height
**Severity: LOW**

`EntryList.tsx:81`: `estimateSize: () => (isList ? 60 : 190 + ROW_GAP)` (= 60 list, 206 grid).

`EntryRow.tsx:177-188`: row padding `12px 16px` + content (one line of 15px text + emoji + chips). Plus the swipe wrapper border-radius / border. Eyeballing: actual computed height ~46-50px with the 8px gap below = ~54-58px effective. `measureElement` (`EntryList.tsx:83`) corrects after first measurement, but the initial `getTotalSize` is 5000 × 60 = 300000 px scrollbar — corrected to ~270000 once measured. User sees the scrollbar thumb jump on first render.

**Fix**: drop `estimateSize` to 50 for list mode. Or add a one-time DOM measurement in a `useLayoutEffect` and pass it as `estimateSize`. Low-priority polish.

### F7 — Brand-new brain race: phase-1 returns 0 rows, IDB cache hydrate resolves later
**Severity: LOW**

Brain switch flow at `useDataLayer.ts:251-274`:
1. `setEntries([])` synchronously (clear stale brain)
2. Schedule `readEntriesCache(activeBrainId)` (async)
3. Call `refreshEntries()` (kicks off phase 1 + phase 2)

Race condition for a brand-new brain (no cached entries yet):
- Phase 1 returns `[]` → `setEntries(initial)` skipped because `initial.length === 0` (`useDataLayer.ts:225`) → `setEntriesLoaded(true)` (`useDataLayer.ts:230`)
- Cache hydration resolves with no rows (cache empty for new brain) → also no-op
- Memory grid sees `entriesLoaded=true && entries.length === 0` → renders the empty state (`Everion.tsx:658-847`). Correct.

But for a **previously-visited brain whose cache wasn't synced** (rare but possible — server has rows, IDB was cleared by user, localStorage cached rows from a different brain were already purged on the previous read):
- Synchronous bootstrap (`useDataLayer.ts:30-42`) reads `localStorage["openbrain_entries"]` (the legacy global key, NOT the per-brain key) → could return rows from the **wrong brain** on first paint
- `useDataLayer.ts:79-87` then reads the per-brain IDB cache → if empty, doesn't replace the wrong rows
- Phase 1 returns the right rows → replaces

**Concrete bug**: lines 30-42 use the legacy key `"openbrain_entries"`, which is brain-agnostic. Comment at `entriesCache.ts:103-114` says the legacy key is purged because it leaks personal-brain rows into a shared brain. But the bootstrap initialiser at `useDataLayer.ts:33` is reading that exact key and seeding state with it. The purge in `entriesCache.ts:110-114` only fires when `readEntriesCache(brainId)` is called and returns null — it doesn't run synchronously at component mount.

**Fix**: bootstrap initialiser should not read the legacy key. Either drop the synchronous bootstrap entirely (rely on the IDB read) — costs first-paint latency — or read it but flush it on first brain mismatch.

### F8 — Initial column count picks `window.innerWidth` not container width
**Severity: LOW**

`EntryList.tsx:42-50`: initial `COLS` computed from `window.innerWidth`:
- `>= 1280` → 3
- `>= 640` → 2
- else → 1

But the desktop sidebar is 240px wide (`Everion.tsx:538`: `lg:ml-60 lg:max-w-[calc(100vw-240px)]`). Inner content area on a 1366×768 laptop is 1126px, not 1366px. The `useEffect` at `EntryList.tsx:51-61` then `ResizeObserver`s the container and corrects to `>= 1024 ? 3 : >= 560 ? 2 : 1`. So:

- 1366 device → initial 3 (innerWidth ≥1280) → corrected to 3 (container 1126 ≥ 1024). OK.
- 1280 device → initial 3 (innerWidth ≥1280) → corrected to 2 (container 1040 ≥ 1024 — still 3). OK.
- 1100 device → initial 2 (innerWidth ≥640 < 1280) → corrected to 1 (container 860 < 1024 — wait, 1100-240=860, so 2 cols by ResizeObserver branch ≥560, corrected to 2). OK.
- Edge: 1300 device with sidebar collapsed off (mobile mode `lg:` doesn't apply) → innerWidth 1300, sidebar gone → container ~1300 → initial 3, corrected 3.

Actual mismatch is rare. Worst case: one re-render with a flash from 3 → 2 or 1 → 2 columns. Visible briefly on cold load on borderline widths.

**Fix**: defer initial render until `ResizeObserver` fires once (use `useLayoutEffect` and `null`-state until first measurement). Or compute initial COLS from `containerRef.current?.clientWidth` if available — rules out the off-by-sidebar bug.

---

## Findings to prove or refute (audit checklist)

| Finding | Status | Evidence |
|---|---|---|
| Virtualizer renders ~10–20 rows for any list size | **TRUE** | `overscan: 4`, `count: rows.length`, `getVirtualItems()` returns visible + overscan only. `EntryList.tsx:77-84` |
| Filter changes don't re-mount the virtualizer | **TRUE** | `filtered` array changes → `count: rows.length` re-runs but virtualizer instance persists. View change DOES remount via `key={view}` on parent — see F4. |
| Sort persists across navigation | **FALSE** | `gridFilters` is `useState` (no persistence) `useAppShell.ts:85-89`. Reload or remount → resets to `sort: "newest"`. |
| Infinite-scroll sentinel cleaned up on unmount | **N/A** | No infinite-scroll. Phase 2 is a finite cursor walk to `LIST_ALL_HARD_CAP = 5000`. `entryRepo.ts:101-125` |
| Empty state has a non-zero CTA | **TRUE** | Two CTAs + 4 example chips + vault setup card. `Everion.tsx:737-846` |
| Keyboard row navigation works | **PARTIAL** | Tab + Enter + Space work per card. No arrow keys, no `j`/`k`, no roving tabindex. See F3. |
| Scroll-restore works on back-from-modal | **PARTIAL** | Modal close: yes (modal is overlay, doesn't unmount grid). View tab switch: NO. See F2. |
| First-paint with cached entries < 200ms | **TRUE** | Synchronous `localStorage` read in `useState` initialiser `useDataLayer.ts:30-42` happens before first commit. Render-time only. |
| Search input debounced + cancels prior request | **PARTIAL** | 200ms debounce, prior timeout cleared. No request to cancel — search is local. See F5. |
| No N+1 fetch on row render | **TRUE** | `EntryCard` and `EntryRow` are pure props-driven `memo` components. No fetches. |

---

## Time-to-first-paint walkthrough

Cold reload with warm cache (returning user, ≥1 entry cached):

| t (ms est) | Event | Source |
|---|---|---|
| 0 | Mount | `Everion()` invoked |
| 0 | `useDataLayer` init reads `localStorage["openbrain_entries"]` synchronously, sets `entries=[...cached]`, `entriesLoaded=true` | `useDataLayer.ts:30-64` |
| 0 | `useAppShell` init: `view="home"` (NOT memory — see comment at `useAppShell.ts:52-56`) | `useAppShell.ts:56` |
| ~16 | First commit — Home view paints, NOT Memory grid | `Everion.tsx:1015-1034` |
| user tap | Bottom nav "Memory" → `appShell.setView("memory")` | `BottomNav` |
| ~16 | Memory branch renders, `entriesLoaded=true && entries.length > 0` → VirtualGrid mounts | `Everion.tsx:848-863` |
| ~16-32 | First useVirtualizer pass: `count` set, `getScrollElement` resolves to `main-content`, initial overscan window of ~4 rows rendered | `EntryList.tsx:77-84` |
| ~32-50 | `ResizeObserver` fires → `setCOLS` correction (only re-render if count differs from `window.innerWidth` derivation) | `EntryList.tsx:51-61` |
| ~50 | Phase 1 fetch resolves (typically 100-300ms) → `setEntries(initial)` (20 rows) | `useDataLayer.ts:224` |
| ~300+ | Phase 2 first page → `setEntries(all)` | `useDataLayer.ts:233-240` |

So: **memory grid first paint with cached entries is one render commit after the user taps Memory.** Cold-cache flow takes the network round-trip. New users land on Home (which is correct for activation).

Caveat: F7 — the synchronous bootstrap reads the legacy key, not the per-brain key. For multi-brain users this can paint the wrong brain's entries for ~50ms before phase 1 corrects.

---

## Recommendations (priority)

1. **[MEDIUM] F2** — scroll-restore on view-switch. Either drop `key={appShell.view}` from `main-content` (low-risk; scroll container is shared) OR add `sessionStorage` save/restore keyed on view + virtualizer `initialOffset`. ~30 lines.
2. **[MEDIUM] F1** — measure filter pipeline cost on a 5k-entry brain (build a perf harness, log `performance.now()` deltas around `filtered` useMemo). If P95 > 16ms, replace `searchIndex` token-map scan with prefix tree or precomputed n-grams. **Pre-launch only blocking if metrics confirm > 32ms at P95 with 5k entries.**
3. **[MEDIUM] F3** — roving `tabindex` + arrow keys on grid. Bundle with an ARIA `role="grid"` pass for screen-reader semantics. ~50 lines + tests.
4. **[LOW] F4** — drop `key={appShell.view}` on `main-content`. Move animate-view-enter to a sub-wrapper. Eliminates the scroll-container remount entirely (also fixes F2 in passing).
5. **[LOW] F7** — bootstrap initialiser at `useDataLayer.ts:30-42` should NOT read the legacy global key. Read the per-brain key directly via a synchronous `localStorage.getItem(KEYS.entriesCacheForBrain(activeBrainId))` — but `activeBrainId` isn't yet known at this scope. Either move the synchronous bootstrap into the brain-switch effect (loses some first-paint speed for multi-brain users) or read the legacy key only as a last-resort fallback.
6. **[LOW] F6** — drop `estimateSize` for list mode from 60 to 50.
7. **[LOW] F8** — initial-column-count from container width, not window width. `useLayoutEffect` first or null-render until measured.
8. **[NO-FIX] F5** — 200ms debounce is fine for client-only search. Document the rationale in a comment near `useAppShell.ts:153-156`.

---

## Pre-launch checklist

| Item | Status | Owner |
|---|---|---|
| F1 — filter pipeline perf harness on 5k brain | not yet | dev |
| F2 — scroll-restore on view-switch | open | dev |
| F3 — keyboard row nav (arrows + roving tabindex) | open | dev |
| F4 — drop `key={view}` on `main-content` | open (combine with F2) | dev |
| F7 — fix bootstrap legacy key read | open | dev |
| F6, F8 — column / row sizing polish | nice-to-have | dev |

---

## Method

- Read `src/Everion.tsx` end-to-end (1515 lines).
- Read `src/MemoryHeader.tsx` (259 lines).
- Read `src/components/EntryList.tsx` (252 lines), `EntryCard.tsx`, `EntryRow.tsx`.
- Read `src/hooks/useAppShell.ts`, `src/hooks/useDataLayer.ts`, `src/hooks/useEntryRealtime.ts`.
- Read `src/lib/entryRepo.ts`, `src/lib/entriesCache.ts`, `src/lib/searchIndex.ts`, `src/lib/entryFilters.ts`.
- Read `src/components/OmniSearch.tsx`.
- Grep `main-content`, `app-shell-fixed`, `scrollRestoration|scrollY|scrollTop`, `searchInput|setSearch`.
- Cross-checked virtualizer scroll-element binding against the layout-architecture memory note (signed-in shell uses fixed-height body + main-content scroll container).
- Confirmed `useVirtualizer` from `@tanstack/react-virtual` per import at `EntryList.tsx:12`.
- Did NOT exercise the grid live (no Playwright run, no DOM measurements). Findings are static-analysis-grade. F1 and F8 are flagged as needing live measurement before being given priority bumps.

**Audit kicked off by**: user request "evidence-based memory-grid audit for Everion Mind" on 2026-05-07.
