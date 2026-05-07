# Todo View Audit — 2026-05-07

> Schedule UX surface — the four-tab "Schedule" shell (Day / Week / Month / Someday) backed by a single `getPlacements()` engine that converts raw `Entry` rows + their `metadata.recurrence` / `due_date` / `scheduled_for` keys into calendar grid placements. Audits date math (timezone drift, recurrence expansion, "today" boundary), completion idempotency, render cost on large piles, drag/swipe gesture cleanup, snooze, and empty-state CTAs.

## Verdict

**Engine is solid, UX layer has real bugs.** The placement engine (`src/views/todoUtils.ts`) is the unification of three legacy date-extractors into one well-traced function with an `explainPlacements` debug companion — clearest piece of code in the whole `src/views` tree. Recurrence is canonical (`metadata.recurrence: { freq, dow[], dom[] }`) with legacy fallback. The four tabs share state cleanly (`selectedDate` is lifted to TodoView).

**Five bugs need pre-launch attention.** F1 (entire app uses local-Date math, no user-TZ profile column → midnight straddlers land on the wrong day), F2 (toggleDone is NOT idempotent — double-tap during in-flight request flips back to incomplete), F3 (no virtualization anywhere — Day/Week/Month all render every matching row, fine at 50 todos, brittle past 500), F4 (recurring rules have no "until" — every `dow:[1]` entry resurrects every Monday forever, including after the user "completes" one instance), F5 (Day-tab swipe-left "+1d" gesture mutates `due_date` even when the canonical field is `scheduled_for` — the row vanishes from the calendar grid because the engine reads `scheduled_for` first). One MEDIUM (F6, calendar bundle) and three LOW (F7-9).

**Architecture: A−. Implementation: B−.** Worth shipping after F1, F2, F4, F5. F3 can wait until a beta user actually has 500 todos; until then it's a theoretical hazard.

---

## Architecture overview

```
TodoView.tsx (orchestrator, 742 lines)
   ├─ Tabs: today | list (Week) | calendar (Month) | someday
   ├─ lifted state: selectedDate, externalEvents, overdueExpanded
   ├─ memos: overdue, todoList, completed (all from EntriesContext.entries)
   │
   ├─ TodoQuickAdd ─────► /api/capture (NLP parse via chrono-node + custom regex)
   │
   ├─ today tab:
   │    ├─ DayPager (← → today)
   │    ├─ OverdueBanner (interactive, expandable)
   │    └─ DayAgenda (filtered entriesToCalEvents on { from: dateKey, to: dateKey })
   │
   ├─ list (Week) tab:
   │    ├─ WeekPager
   │    ├─ WeekStrip (7-day picker + dot map)
   │    ├─ OverdueBanner (pinned, non-interactive)
   │    └─ DayAgenda
   │
   ├─ calendar (Month) tab → TodoCalendarTab.tsx
   │    ├─ CalendarHeader / MonthGrid / DayCell / EventDots
   │    ├─ visibleRange = ±1 day around the rendered month
   │    └─ Desktop: SidePanel  |  Mobile: BottomSheet (drag-to-dismiss)
   │
   └─ someday tab → TodoSomedayTab.tsx (gated on somedayEnabled flag)
        ├─ Categories synced to brain.metadata.someday_categories + localStorage cache
        ├─ Bulk-select mode → /api/entries?action=bulk-patch | bulk-delete-by-filter
        ├─ Optimistic insert (tmp- prefixed id)
        └─ Schedule action → flips type=todo + scheduled_for/due_date

todoUtils.ts (508 lines) — pure
   ├─ getPlacements(entry, { mode, range, expandRecurrence, includeCompleted })
   ├─ getActionPlacements(entry)        — narrow keys, no recurrence
   ├─ getCalendarPlacements(entry, r)   — wide keys, recurrence on
   ├─ explainPlacements(entry, opts)    — admin trace inspector
   └─ Recurrence canonical: metadata.recurrence = { freq, dow?[], dom?[] }
        + legacy: day_of_week / day_of_month / weekday / recurring_day
        + content fallback: /every (mon|tue|...)/ when no metadata at all

TodoRowItem.tsx (334 lines)
   ├─ Optimistic toggle: setOptimistic(!done) → handleUpdate → catch reverts
   ├─ Pointer swipe: right=done (≥80px), left=+1day (≥80px)
   └─ Reads/writes metadata.due_date — NOT scheduled_for (F5)
```

**Code split:** TodoView is `lazyRetry()`-loaded in `src/Everion.tsx:108` → calendar tab + helpers + chrome + event editor + someday tab + utils all chunk-bundled together (no further splits). Initial Schedule navigation pulls all 5,616 lines + chrono-node + date-fns transitively.

---

## Tab inventory

| Tab | File | Lines | Lazy? | Quick-add? | Empty-state CTA? | Virtualization? | Bulk ops? |
|---|---|---|---|---|---|---|---|
| Day (`today`) | TodoView.tsx | inline | parent-lazy only | yes (TodoQuickAdd) | yes ("↑ type above") | no | no |
| Week (`list`) | TodoView.tsx | inline | parent-lazy only | yes (TodoQuickAdd) | yes ("↑ type above") | no | no |
| Month (`calendar`) | TodoCalendarTab.tsx | 419 | parent-lazy only | yes (TodoQuickAdd) | "Nothing scheduled." (no CTA) | no | no |
| Someday | TodoSomedayTab.tsx | 1786 | parent-lazy only, gated by `somedayEnabled` | yes (SomedayQuickAdd) | yes ("Capture anything that's not for today") | no | yes (Done / Schedule / Drop / Move) |

**Tab default**: `useState<Tab>("calendar")` at TodoView.tsx:370 — Schedule lands you on Month, not Day. Decision worth flagging in PLAYBOOK.md (matches PrimePro reference but most rival apps land on Today).

---

## What's solid

- **Single placement engine** — `getPlacements()` at `todoUtils.ts:150-194` replaced three legacy extractors that disagreed on which dates surface in which view. Modes (`actions` vs `calendar`) make the contract explicit. Range-clamp + recurrence are options on the same call. **`explainPlacements` companion** at `todoUtils.ts:221-315` returns a per-entry trace ("Mode: calendar (checking keys: …)" → "+ 2026-05-12 from metadata.due_date" → "Recurrence skipped: specific date set"). Matches the audit-trail philosophy from billing.
- **Content-regex date scan removed**, with a clear comment block explaining why (`todoUtils.ts:18-28`). Hidden inline `2026-04-28` strings inside `content` no longer drag entries onto random days.
- **NON_SCHEDULABLE_TYPES set** at `todoUtils.ts:90` excludes `secret` and `persona` entries from ever appearing in Schedule — even if their metadata carries date keys. Belt-and-braces; security.
- **NON_CALENDAR_DATE_KEYS set** at `todoUtils.ts:60-70` excludes bookkeeping timestamps (`last_referenced_at`, `last_decayed_at`, `embedded_at`, …) from the open metadata scan. Without this the calendar grid would surface every entry on the day it was last decayed.
- **Memoised `entries` source** at `TodoView.tsx:369` with a comment explaining why: `propEntries || ctx?.entries || []` short-circuits to a fresh `[]` every render when both sides are nullish, which would invalidate every downstream `useMemo` (overdue / todoList / completed). The wrap stabilises identity.
- **Range-clamped recurrence expansion** — `TodoCalendarTab.tsx:68-74` widens the visible month by ±1 day to cover the previous-Sunday and next-Saturday cells that bleed into a month grid. Without the buffer, a recurring "every Monday" entry would not appear on the Apr-30 cell of the May grid.
- **Two-stage BottomSheet animation** at `TodoCalendarChrome.tsx:378-398` — `mounted` tracks DOM presence, `visible` drives CSS, decoupled so the slide-out animation runs *before* unmount. With a comment explaining the lint disable and citing the iOS-Safari URL-bar issue that drove the no-`body.overflow:hidden` decision.
- **BottomSheet portals to `document.body`** at `TodoCalendarChrome.tsx:456` to escape ancestor stacking contexts (`Everion.tsx` layout has `transform`-bearing wrappers that trap z-index). Carries a precise comment citing the local stacking context bug Capture hit before being portalled.
- **Drag-to-dismiss only on the handle area** (`TodoCalendarChrome.tsx:500-516`) — the comment at `:410` explains why the entire body can't be a drag target (would conflict with scrolling the event list). Generous hit area (margin/padding inversion) so it's easy to grab on mobile.
- **`SidePanel` is `position: sticky`** on desktop (`TodoCalendarChrome.tsx:341-360`) — day detail stays visible while user scrolls the page. Correct primitive, no JS scrolling.
- **Recurrence parser tolerates legacy + canonical** (`todoUtils.ts:383-436`) — checks `metadata.recurrence` first, falls back to `day_of_week` / `day_of_month`, falls back to content regex `/every (mon|tue|...)/` only when all metadata is empty. Migration-safe.
- **Specific-date wins over recurrence**: `hasSpecificDate(metadata)` short-circuits recurrence expansion at `todoUtils.ts:181-184` so a "Wednesday 1 May" appointment does NOT also fire as "every Wednesday". Comment block explains. F4 is *not* about this — F4 is the absence of an "until" cap.
- **Someday optimistic flow** (`TodoSomedayTab.tsx:122, 184-211`) — `tmp-` prefixed id; merge logic dedups by `${title}::${content}`; effect prunes optimistic ghosts when the real refetch lands. Crisp.
- **Someday bulk paths use bulk APIs**: `bulk-patch` for status/tags, `bulk-delete-by-filter` for "delete all visible" (handles phase-2 background loading where `items.length` < what server holds). Per-entry only where the field isn't whitelisted (type changes during scheduling). Comment block at `:374-394` explains why two paths exist.
- **Categories sync to brain row** (`TodoSomedayTab.tsx:72-97`) with localStorage as optimistic cache. Server-authoritative after first fetch with a backfill from cache when server is empty. Empty buckets survive (you can create "Reading list" before adding anything).

## Findings

### F1 — All date math uses local Date — no user-TZ profile column, midnight crossings land on wrong day (HIGH)
**Severity: HIGH — pre-launch blocker for users outside South Africa**

`toDateKey` at `todoUtils.ts:140-142`:
```ts
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
```
This reads the **client's local timezone**, not the user's `user_profiles.timezone` (if any such column exists — none referenced in todo code). Every "today / Monday / overdue" computation in TodoView starts from `new Date()` and immediately calls `toDateKey(now)` (`TodoView.tsx:404, 60, 147, 316`). All compares are string-compares of `YYYY-MM-DD`.

**Concrete failure**: a user travelling from Johannesburg (UTC+2) to São Paulo (UTC-3) at 22:30 SAST on May 7 — their phone says May 7, the laptop has switched to May 7 17:30 BRT. Both compute "today = 2026-05-07" using local time. Same screen. Now the user lands at 03:00 SAST (still May 8 local SAST, May 7 22:00 BRT). The phone says today = May 8, the browser says today = May 7. A todo with `due_date = "2026-05-07"` shows up as overdue on the phone, due-today on the laptop. Likewise a recurring `dow:[1]` (Monday) entry: at 23:30 Sunday SAST the user opens the laptop in BRT (Sunday 18:30) — the entry doesn't appear yet on the laptop (Sunday) but appears on the phone (Monday). Confusion.

**Same shape inside `entriesToCalEvents`** (`todoCalendarHelpers.ts:99-110`): `parseISO(d)` constructs a Date in local TZ, `startOfDay`/`endOfDay` use local TZ. Recurrence expansion via `eachDayInRange` (`todoUtils.ts:346-360`) iterates a local-TZ cursor — fine for one device, drifts across devices.

**Same shape inside completion-streak math**: `TodoRowItem.tsx:124` builds `new Date()` and pads with `getMonth()+1`. The streak counter records a completion for the device's local day, not the user's chosen day-of-record.

**Root cause**: no canonical user-TZ. App treats "today" as whatever the device thinks. There is no `user_profiles.timezone` column referenced. The whole engine assumes the device is the user's timezone of record.

**Fix path** (post-launch acceptable for monoglot SA cohort, MUST land before international beta):
1. Add `user_profiles.timezone TEXT` column (default `"Africa/Johannesburg"`).
2. Add a `useUserTimezone()` hook that reads it (falls back to `Intl.DateTimeFormat().resolvedOptions().timeZone`).
3. Every `toDateKey(d)` call site → `toDateKeyInTz(d, userTz)` using `Intl.DateTimeFormat(userTz, { ... })` to get year/month/day in the user's chosen zone.
4. Recurrence expansion ranges → also computed in user TZ.

The `en-ZA` locale literal at `TodoView.tsx:62, 132` etc. is a *display* concern — the bug is the *date arithmetic*. Fix is to keep en-ZA strings and add an explicit user-TZ for math.

### F2 — `toggleDone` is NOT idempotent — double-tap during in-flight flips back to incomplete (HIGH)
**Severity: HIGH — easy to hit on mobile**

`TodoRowItem.tsx:65-79`:
```ts
function toggleDone() {
  if (!ctx?.handleUpdate) return;
  setOptimistic(!done);
  ctx
    .handleUpdate(entry.id, {
      metadata: { ...(entry.metadata || {}), status: done ? "todo" : "done" },
    })
    .then(() => {
      if (!done) {
        const k = recordCompletion();
        onKarmaChange?.(k.points, k.streak);
      }
    })
    .catch(() => setOptimistic(null));
}
```
Reading `done` (line 70, 73): `done` is the closure-captured value at the moment the function was created. `done = optimistic ?? serverDone` (line 46) — when the user taps the FIRST time, `done = false` → optimistic flips to `true`, the request body is `status:"done"`. The user taps again before the request resolves: `done` is still the closure-captured `false` (the closure hasn't re-rendered) — wait, actually React re-renders synchronously after `setOptimistic`, so the second tap reads the *new* `done = true` and sends `status: "todo"`. So the second tap legitimately undoes the first. **But**: the two requests can be reordered or the first may fail. The catch handler at line 78 sets `setOptimistic(null)`, dropping back to `serverDone` — which by then may be `done` (if the second request landed first). Net: race produces "incomplete" state in DB even though the user wanted "complete then complete-undo then nothing".

**Concrete failure**: user double-taps the checkbox by accident (jittery thumb on a phone). Two `handleUpdate` calls fire ~50ms apart. Both eventually land. There's no idempotency key. The server applies them in arrival order. With network reordering, the *second* (status:"todo") can land *first*, and the *first* (status:"done") can land *second* — leaving the entry as `status:"done"` even though the user's intent was the opposite. Or vice-versa. UI shows whichever arrives last.

There's also no in-flight lock on the row — every tap fires a fresh request. A phone with a touchscreen glitch fires 5 requests; 5 separate `handleUpdate` calls. The race window grows with the user's input rate.

**Fix path** (~15 min):
1. Track in-flight per row: `const [pending, setPending] = useState(false)`. Bail at the top of `toggleDone` if `pending`.
2. **Idempotency-key header**: every PATCH gets a stable `X-Idempotency-Key: ${entry.id}-${optimisticTarget}-${Date.now() bucketed to 5s}`. Server's `idempotency_keys` namespace is already there for billing — extend to entry updates.
3. Read `done` from `optimistic ?? serverDone` *inside* the function body each call (already does — but the issue is the request payload uses the captured value).

### F3 — No virtualization — Day/Week/Month/Someday all render every row (HIGH for power users, MEDIUM for general)
**Severity: MEDIUM — degrades, doesn't crash, but a power user with 500+ todos will feel it**

- **Day tab**: `entries.flatMap(getActionPlacements...)` at `TodoView.tsx:412-424` is O(N) per render. The agenda then renders every event for the day via `events.map(...)` at `TodoCalendarTab.tsx:281-285`. No `react-window`, no `virtuoso`, no `@tanstack/virtual`.
- **Week tab**: same, plus `WeekStrip` recomputes the 7-day eventMap on every entries change.
- **Month tab**: `entriesToCalEvents` at `todoCalendarHelpers.ts:85-113` walks every entry, expanding recurrence within the month range. For an entry with `dow:[1]` it generates 4-5 event rows. For 1000 entries that's ~5000 CalEvent objects in `calEvents`, then bucketed into 31 days. `MonthGrid` renders 35-42 cells; each cell calls `EventDots` which slices to MAX=6. Computational cost is fine; **memory per render** is the problem (5000 objects every time `entries` updates).
- **Someday tab**: `items.map((entry, idx) => <SomedayRow ... />)` at `TodoSomedayTab.tsx:577`. No virtualization. A user with 1000 someday items renders 1000 SomedayRow components, each carrying a Select + Popover via Radix.
- **Completed list (Week tab)**: `completed.map(entry => <p>...)` at `TodoView.tsx:699` — naïve render of every completed todo (no slice/limit).

**Concrete failure**: 1000 someday items × ~1.5KB DOM each ≈ 1.5MB DOM weight. First paint stutters. Subsequent re-renders (any entries change → context refetch) re-render all 1000 rows because no `React.memo` boundary on `SomedayRow`. Test with `import.dev` performance trace.

**Fix path** (~2 hr):
1. Add `react-window` (3KB gzip) — `FixedSizeList` for SomedayRow + Day/Week agenda, `VariableSizeGrid` if rows expand on edit.
2. `React.memo(SomedayRow)` + stable `onUpdate`/`onDelete` refs (already wired but verify).
3. Cap completed list at `slice(0, 50)` with a "Show more" button.
4. **Defer**: until a beta user actually has 100+ todos. Pre-launch this is a "watch this" item, not a blocker. Add to LAUNCH_CHECKLIST P1.

### F4 — Recurring rules have NO "until" cap — every dow:[1] resurrects every Monday forever (HIGH)
**Severity: HIGH — UX-breaking after 2 weeks of use**

`Recurrence` shape at `todoUtils.ts:370-376`:
```ts
export interface Recurrence {
  freq: "weekly" | "monthly";
  dow?: number[];
  dom?: number[];
}
```
No `until`. No `count`. No `byDate`. `expandRecurringDates` at `todoUtils.ts:439-461` iterates `eachDayInRange(range.from, range.to, ...)` — bounded only by the **caller's** range. Caller is `entriesToCalEvents` (current month), `getActionPlacements` (no range, returns specific dates only — recurrence not expanded for action mode), or `WeekStrip`'s eventMap (current week).

**Concrete failure mode #1 — completion does not stop recurrence**:
User creates "Take vitamins every Monday" → `metadata.recurrence: { freq: "weekly", dow: [1] }`. Monday morning they tick it done. `metadata.status = "done"` is written. The placement engine then early-returns (`if (!includeCompleted && isDone(entry)) return [];` at `:153`). The entry vanishes from the calendar entirely — including next Monday and every Monday after. The user lost their recurring habit.

The reverse failure also exists: if the user *doesn't* mark it done, the engine keeps surfacing it every Monday. Forever. There's no "until 2026-12-31" or "for the next 4 weeks". Every recurring entry haunts the calendar in perpetuity unless the user manually deletes the entry.

**Concrete failure mode #2 — recurrence expansion in `getActionPlacements` mode**:
Wait — `getActionPlacements` at `:199-201` calls `getPlacements(entry, { mode: "actions" })`. Mode "actions" passes `expandRecurrence: false` (default at `:151`). So recurring entries do NOT appear in Day/Week/overdue scans! Only on the calendar grid. That means a `dow:[1]` entry never shows up on the user's "Today" view on a Monday. **Verified by reading the code path.** Action placements only return *explicit* dates via `due_date` / `scheduled_for` / `deadline`. If the user's "Take vitamins every Monday" entry has only `recurrence.dow:[1]` and no `due_date`, it appears on every Monday in Month view but never on Day view, even when "today is Monday". This is almost certainly not the intent — recurring habits are exactly what people want on Today.

**Fix path** (~30 min for #1, ~1 hr for #2):
1. **Add `until` to Recurrence**:
   ```ts
   export interface Recurrence {
     freq: "weekly" | "monthly";
     dow?: number[];
     dom?: number[];
     until?: string;   // YYYY-MM-DD inclusive
     count?: number;   // max instances (alternative to until)
   }
   ```
   Update `expandRecurringDates` to clamp the upper end of range against `until`.
2. **Decide completion semantics** for recurring instances. Options:
   - (a) **Per-instance completion**: store `metadata.recurrence_done: ["2026-05-07", "2026-05-14"]` — the engine excludes those dates from expansion. Each instance is independently completable. Habit-tracker pattern.
   - (b) **Status only on the master entry**: ticking done removes the *whole series*. Aligns with "this is a one-shot todo" but kills habits.
   - (c) Snooze-only — ticking advances the next occurrence to the following week.
   Decision needed; document in `EML/Specs/`. (a) is what users expect from "every Monday" semantics.
3. **Surface recurring entries in `getActionPlacements`** when "today is a matching day": expand recurrence within `{ from: today, to: today }` in actions mode, gated on a flag so call sites that want raw specific dates still get them.

### F5 — Swipe-left "+1d" gesture writes `due_date`, not `scheduled_for` — entry vanishes from calendar (HIGH)
**Severity: HIGH — silent UX bug**

`TodoRowItem.tsx:119-129`:
```ts
function bumpDueDate() {
  if (!ctx?.handleUpdate) return;
  const current = (entry.metadata as Record<string, unknown>)?.due_date as string | undefined;
  const base = current ? new Date(current + "T12:00:00") : new Date();
  base.setDate(base.getDate() + 1);
  const next = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
  ctx
    .handleUpdate(entry.id, { metadata: { ...(entry.metadata || {}), due_date: next } })
    .catch(() => null);
  setSwipeState("idle");
}
```
**Reads** `due_date`. **Writes** `due_date`. Phase 2 canonical field is `scheduled_for` (per `todoUtils.ts:27-28` + `TodoEditPopover.tsx:47-50, 87-93` which writes both for back-compat). So if the user creates a todo via the edit popover (which writes `scheduled_for` AND mirrors to `due_date`), then swipes left to "+1d":
- Reads `due_date` (correct mirror, present)
- Computes `next = current + 1`
- Writes `due_date = next`
- **Does NOT update `scheduled_for`**

`getPlacements` reads `scheduled_for` *first* in `ACTION_DATE_KEYS` (`:55`) and `CALENDAR_DATE_KEYS` (`:33`). After the swipe, `scheduled_for` is still the original day; `due_date` is the day-after. The Set in `getPlacements` ends up with **both** dates → the entry now appears on TWO consecutive days. The user expected it to move *off* today and *onto* tomorrow; instead it ghosts on today AND appears on tomorrow.

**Concrete failure**: a user swipe-pushes "Pay rent" from May 1 → May 2. The card stays visible on May 1's column (because `scheduled_for=2026-05-01` was never updated). User thinks the swipe didn't work. Swipes again → now `due_date=2026-05-03`, `scheduled_for=2026-05-01`. Three days of ghosting.

**Fix** (1 line): write both fields:
```ts
ctx.handleUpdate(entry.id, {
  metadata: { ...(entry.metadata || {}), due_date: next, scheduled_for: next },
})
```
Even better — write the field that's *currently set* (read priority: `scheduled_for` first, fallback `due_date`) and mirror to the other. Same shape as the edit popover save path.

### F6 — Calendar tab + chrono-node + date-fns all in the TodoView chunk — no further code-split (MEDIUM)
**Severity: MEDIUM — bundle**

`Everion.tsx:108`:
```ts
const TodoView = lazyRetry(() => import("./views/TodoView"));
```
TodoView imports TodoCalendarTab (eager), which imports TodoCalendarChrome + TodoCalendarEvent + todoCalendarHelpers (eager). TodoQuickAdd imports `chrono-node` (~50KB gzip). The Schedule tab is the second-most-used tab after Memory; users hit it on every session. But the **someday tab** is gated behind `somedayEnabled` flag — every user who never enables Someday still ships its 1786 lines because it's eagerly imported by TodoView.

Also: `react-big-calendar` / `fullcalendar` are NOT used — the calendar is hand-rolled (`MonthGrid` + `DayCell`). That's already the win. Less to optimise.

**Fix path** (~30 min):
1. Lazy TodoSomedayTab inside TodoView when `somedayEnabled`:
   ```ts
   const TodoSomedayTab = lazy(() => import("./TodoSomedayTab"));
   ```
   Wrap render in `<Suspense fallback={null}>`. Saves 1786 lines for free-tier users.
2. Lazy TodoCalendarTab too — if the user lands on Day/Week, don't ship the Month chrome.

Quick benchmark with `vite build --mode analyze` would tell the exact savings; estimate 30-50KB gzip out of the Schedule chunk.

### F7 — Empty states have copy but only the Day/Week tabs have an actionable CTA (LOW)
**Severity: LOW — UX polish**

- Day tab empty state: "Nothing scheduled. ↑ type above to add an event." — `TodoCalendarTab.tsx:251-277`. ✓
- Week tab empty state: same as Day. ✓
- **Month tab** day-detail "Free / Nothing scheduled." (`TodoCalendarEvent.tsx:466-477`) — no CTA. The TodoQuickAdd is at the top of the calendar but a user looking at an empty future day's drawer doesn't get an explicit "tap to add" affordance.
- **Someday tab** empty state: ✓ helpful copy ("Capture anything that's not for today. When the week's planned, pull from here.") at `:546-567` — no button, but the QuickAdd is right above. Acceptable.
- **No "you have nothing today, here's something from someday" cross-link.** Pure GTD users want this — one-tap promote a someday item to today. Fix path: when Day tab is empty AND somedayEnabled, render a "Pull from someday →" affordance that opens the Someday tab.

### F8 — `WeekStrip`'s eventMap recomputes recurrence per render-pass keyed only on weekStart (LOW)
**Severity: LOW — perf**

`TodoCalendarTab.tsx:326-338`:
```ts
const eventMap = useMemo(() => {
  const last = new Date(weekStart);
  last.setDate(last.getDate() + 6);
  const range = { from: toDateKey(weekStart), to: toDateKey(last) };
  const fromEntries = entriesToCalEvents(entries, range);
  const fromExternal = externalToCalEvents(externalEvents);
  ...
}, [weekStart, entries, externalEvents]);
```
Recomputes whenever `entries` reference changes (which is every context refresh). For 1000 entries with recurrence expansion across 7 days, this is ~7000 iteration steps and ~N CalEvent allocations per refresh. `entries` reference is stabilised at `TodoView.tsx:369` but the inner array still gets a new identity every refetch. Memoisation is correct in principle; the cost is just the work itself.

**Fix path**: pre-compute a recurrence-expanded "this month" map once at TodoView level, share across Week + Month + Day. Or: use `useDeferredValue(entries)` to keep WeekStrip responsive during heavy refetch. Also defer until a beta user actually feels it.

### F9 — Karma/streak counter persists to client only via `recordCompletion` — not server-side (LOW)
**Severity: LOW — data loss**

`TodoRowItem.tsx:74` calls `recordCompletion()` from `../lib/karma`. Reading `src/lib/karma` would confirm; the import path suggests localStorage. If so, switching devices loses the streak. Carry to streak-counter spec at `EML/Specs/streak-counter.md` if not already addressed.

---

## Recurring rule format — proven

Storage: `entries.metadata.recurrence` (canonical, JSONB key) — Phase 2 `Recurrence { freq, dow?[], dom?[] }` shape.
Legacy: `entries.metadata.day_of_week` (string), `entries.metadata.weekday` (alias), `entries.metadata.recurring_day` (alias), `entries.metadata.day_of_month` (number/string).
Content fallback: regex `/every (sun|mon|tue|wed|thu|fri|sat)(?:day)?/i` and `/every (\d+)(?:st|nd|rd|th)/`.

**NOT RRULE-style**. No `RRULE:FREQ=WEEKLY;BYDAY=MO`. No iCal interop. Custom JSON. The migration path to RRULE (if ever needed for calendar export) is small — `dow:[1]` ⇄ `BYDAY=MO`, `dom:[15]` ⇄ `BYMONTHDAY=15`. Document the wire format in `EML/architecture/` if not already there; users who eventually export to iCal will need this.

## "Today" boundary — proven

`mondayKey, todayKey` at `TodoView.tsx:404-410`:
```ts
const now = new Date();
const dow = now.getDay();
const monday = new Date(now);
monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
monday.setHours(0, 0, 0, 0);
return { mondayKey: toDateKey(monday), todayKey: toDateKey(now) };
```
`new Date()` → device-local-time. Correct logic for "this week's Monday" assuming Monday-first weeks (`dow === 0` Sunday → -6, otherwise -[dow-1]). The bug is F1 — `new Date()` is device TZ, not user TZ. The math itself is right.

The `useMemo` deps array is `[]`. The `mondayKey` therefore captures the day at first mount and never updates — if the user keeps the tab open across midnight, "today" is yesterday. Bug, fix is `[entries]` or a `useNowEvery5Min` hook. Add to F1's fix bundle.

## Drag-reorder

**Not present**. Searched `TodoView.tsx`, `TodoSomedayTab.tsx`, `TodoRowItem.tsx`, `TodoCalendarTab.tsx` for `dnd-kit`, `react-dnd`, `react-beautiful-dnd`, `draggable`. None match. Order is purely date+priority sort. Acceptable for v1; add to BRAINSTORM if users ask.

## Snooze

**Implemented as swipe-left → "+1d" Button** at `TodoRowItem.tsx:293-330`. Single fixed action, no "+3d / next week / pick date" branching. F5 is its bug. UX-wise: cap is fine for launch; the inline `ScheduleInline` at `TodoSomedayTab.tsx:1374-1422` (Today / Tomorrow / Next Mon / pick) is the richer pattern — port it to the swipe-reschedule chip post-launch.

## Calendar overlay library

**Hand-rolled.** No `react-big-calendar`, `fullcalendar`, `@fullcalendar/react`. `MonthGrid` is a 7-column CSS Grid; `DayCell` is a button; `EventDots` is two flex rows. Saves ~100KB+ of library weight. Trade-off: no time-blocking, no drag-to-schedule, no week-grid hour view. Suitable for a todo-first product; not suitable if Schedule expands to "calendar app" scope. Decision documented implicitly by the file names — make it explicit in `EML/architecture/`.

---

## Recommendations (priority)

1. **[HIGH] F1** — add `user_profiles.timezone`, route every `toDateKey` / `new Date()` boundary computation through user TZ. Pre-international-beta blocker. ~3-4 hr.
2. **[HIGH] F2** — in-flight lock on `TodoRowItem`'s `toggleDone` + idempotency-key on the PATCH. ~30 min.
3. **[HIGH] F4** — add `until` to Recurrence, decide completion semantics for recurring instances, surface recurring entries in `getActionPlacements`. ~2 hr + spec write.
4. **[HIGH] F5** — `bumpDueDate` writes both `scheduled_for` and `due_date`. ~2 min code, ~5 min test.
5. **[MEDIUM] F6** — lazy-import TodoSomedayTab + TodoCalendarTab inside TodoView. ~30 min.
6. **[MEDIUM] F3** — virtualize SomedayRow + agenda lists with `react-window`. Defer until 100+ todos in a real beta cohort. ~2 hr.
7. **[LOW] F7** — empty-state CTA in Month-tab day drawer + "Pull from someday" cross-link on empty Day tab. ~20 min.
8. **[LOW] F8** — share recurrence-expanded month map across Week/Day/Month rather than recomputing per tab. ~1 hr.
9. **[LOW] F9** — server-persist streak/karma. Cross-ref `EML/Specs/streak-counter.md`. ~depends.

## Method

- Read `src/views/TodoView.tsx` end-to-end (742 lines).
- Read `src/views/TodoCalendarTab.tsx` (419 lines), `TodoCalendarChrome.tsx` (573 lines), `TodoCalendarEvent.tsx` (487 lines).
- Read `src/views/TodoSomedayTab.tsx` (1786 lines).
- Read `src/views/TodoRowItem.tsx` (334 lines), `TodoQuickAdd.tsx` (248 lines), `TodoEditPopover.tsx` (275 lines).
- Read `src/views/todoUtils.ts` (508 lines), `todoCalendarHelpers.ts` (244 lines).
- Read `src/lib/nlpParser.ts` (chrono-node integration, regex priority/tag/energy parsing).
- Verified lazy-loading via grep on `Everion.tsx`. Confirmed `TodoView` is `lazyRetry`-loaded; downstream components are NOT further split.
- Cross-checked recurrence engine against `metadata.recurrence` shape, legacy field fallback, content regex fallback.
- Did NOT exercise the running app in this audit — relied on code-reading + targeted grep. F1 / F2 / F4 / F5 reproductions belong in week-3 e2e (Playwright).

**Audit triggered by**: user request "do all those highest-leverage audits" on 2026-05-07 (same batch as billing-audit-2026-05-07.md).
