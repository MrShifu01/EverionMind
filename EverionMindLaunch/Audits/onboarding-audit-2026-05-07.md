# Onboarding Audit — 2026-05-07

> Evidence-based audit of signup → first-capture → first-answer activation. Maps OnboardingModal, FirstRunChecklist, empty states, telemetry coverage. Compares emitted PostHog events against `EML/Analytics/event-taxonomy.md`. AI provider is Gemini.

## Verdict

**Activation flow lands first capture inside 60s — barely.** OnboardingModal at signup is one screen, one textarea, four pre-fills, Cmd+Enter to save. Path to a row in `entries` is genuinely 30–45s on a fresh signup with the typed-text path. After save, user lands on Home where FirstRunChecklist (capture5/persona/vault/gmail/calendar/brain) and Today/InboxTriage cards take over. Sticky-done semantics are sound — `useFirstRunChecklist.stickyDone` ORs live signal with persisted `doneFlags`, no flicker.

**Telemetry has a 5-event hole.** `EML/Analytics/event-taxonomy.md` lists `landing_page_view`, `signup_started`, `first_ai_question_asked`, `first_ai_answer_viewed`, `vault_setup_completed`, `brain_created`, `onboarding_modal_shown`, `onboarding_step_completed`, `onboarding_skipped`, `onboarding_completed` — **none of those fire in code.** What fires (`src/lib/events.ts:18`): `signup_completed`, `first_capture`, `first_chat`, `first_insight_viewed`, `day_7_return`, `tier_upgraded`, `tier_downgraded`, `capture_method`, `nav_view_active`. The taxonomy and the wire are out of sync — funnel queries that name the missing events return zero. The "north-star" query (`first_ai_answer_viewed.uniques / signup_completed.uniques`) cannot run at all because `first_ai_answer_viewed` was never wired.

**Two onboarding-modal failure modes are uncaught.** F2 (Gemini timeout in OnboardingModal save: no spinner cap, no fallback) and F4 (modal save errors are console-logged then `markOnboarded()` runs anyway — silent loss of the user's first capture). For a launch counted in weeks these are P0.

**One HIGH, four MED, three LOW.** Telemetry rewire + capture-failure handling are the only blockers. Sticky-done, empty-state CTAs, and biometric timing are fine.

---

## Architecture overview

```
Login (LoginScreen.tsx) → Supabase session
                       ↘ App.tsx onAuthStateChange → trackSignupCompleted() (one-shot)
                                                  → identifyPostHogUser()
                                                  → loadSettings()

useAppShell — view defaults to "home"; showOnboarding gated by:
  1. localStorage("everion_onboarded")          [fast path, avoids modal flash]
  2. legacy localStorage("openbrain_onboarded") [migrated forward]
  3. user_profiles.onboarded_at                 [cross-device fallback, async]

Everion.tsx renders OnboardingModal when showOnboarding && no entries.
  ↳ user types → handleSave() → POST /api/capture
                 → markOnboarded() (localStorage + user_profiles upsert)
                 → onComplete({ nextAction: "vault" | undefined })
                 → setView("home" | "vault")
  ↳ trackFirstCapture / trackCaptureMethod fire ONLY when capture goes
    through CaptureSheet — OnboardingModal posts directly to /api/capture
    and bypasses the funnel events (FINDING F1).

Home (HomeView.tsx) renders for authed user with zero entries:
  GreetingHero        ← persona-aware greeting
  TodayCard           ← "nothing on your plate. enjoy the breathing room."
  InboxTriageCard     ← null branch when stagedCount === 0
  FirstRunChecklist   ← 6 items (personal brain) | 3 items (shared brain)
  RecentCapturesStrip ← null when entries.length === 0
  QuickCaptureChips   ← 4 starter labels → openCapture(text)

FirstRunChecklist items:
  capture5   (entryCount  >= 5)             → openCapture
  persona    (full_name | preferred_name | context not empty)
                                            → settings?tab=persona
  vault      (vault_entries.length > 0)     → navigate "vault"
  gmail      (gmail_integration row exists) → settings?tab=connections
  calendar   (calendar_integrations any)    → settings?tab=connections
  brain      (brainCount > 1)               → openCreateBrain
```

---

## What's solid

- **OnboardingModal is one screen, one input.** `src/components/OnboardingModal.tsx:157` — `<h2>give your brain its first thing to remember.</h2>`. No multi-step wizard. Four EXAMPLES chips at lines 14–31 pre-fill the textarea with realistic captures. Cmd+Enter saves. `onInteractOutside` and `onEscapeKeyDown` are blocked (lines 123–124) so a fat-finger doesn't dismiss without a save or skip. This is the right shape for time-to-aha.

- **Live preview render below the textarea** (lines 211–260): renders the entry card the way it'll look in their brain. Visceral evidence of what's happening — beats a copy line saying "this is your memory."

- **Sticky-done semantics in the checklist.** `useFirstRunChecklist.ts:337-338`:
  ```ts
  const stickyDone = (id: ChecklistItemId, live: boolean): boolean =>
    Boolean(live || doneFlags[id]);
  ```
  Item is done if the live signal says so OR `user_checklist_done` has a row. Once an item is observed done, `pinIfNew` POSTs to `/api/user-data?resource=checklist_done` (lines 207–217). User can't "un-do" by deleting a vault entry or disconnecting Gmail — the row stays.

- **Per-brain "ever-completed" gate** (`useFirstRunChecklist.ts:121-144`): once `allDone` flips true for a brain id, the checklist is hidden forever for that brain via `localStorage("everion_home_checklist_completed_v1")`. No "bring back the checklist" link once truly done. Correct UX — completed checklists clutter.

- **Cache-then-network** (`useFirstRunChecklist.ts:81-119, 242-243`): first render hydrates from `loadCachedRemote()` and `loadCachedFlags()` so the user doesn't see a frame of "must do it" then "actually you did." The original bug ("temporarily says I must still do them, then when loading is done, then they disappear") is documented in the comment at lines 75–79 and fixed by the cache.

- **Per-brain checklist scoping** (lines 392–399): shared brains render only `capture5`, `persona`, `vault`. Gmail/calendar/add-second-brain are personal-account concerns and don't belong on a family-shared brain. Correct cut.

- **Refresh on focus** (`useFirstRunChecklist.ts:299-303`): when window regains focus, `refresh()` runs. Means a round-trip through Settings → Connections (Gmail) → back to Home updates the checklist without a manual reload.

- **Cross-device onboarding sync** (`useAppShell.ts:120-148`): if local says "still need onboarding" but `user_profiles.onboarded_at` is set, modal hides + local cache updates. A user signing in on a fresh device doesn't get re-onboarded.

- **Home empty-state text is calm, not pushy.** `GreetingHero.tsx:30-34`: when `totalCount === 0`, line is "your brain is empty — type something below to start." Doesn't shout, doesn't add anxiety, points at the FAB.

- **TodayCard renders even when nothing's scheduled** (`TodayCard.tsx:77-104`): "nothing on your plate. enjoy the breathing room." The card stays in layout instead of disappearing. Comment at line 78 explicitly names this: "disappearing cards make the layout feel unstable."

- **Vault empty state has a CTA** (`VaultUnlocked.tsx:253-271`): "Vault is empty." + descriptive body + `<Button onClick={openAddSecret}>Add a secret</Button>`. Not a dead-end.

- **Chat empty state branches on `noMemory`** (`ChatView.tsx:439-468`): `noMemory = entriesLoaded && entries.length === 0` → shows "Nothing to chat about yet." + "Capture a thought" button. Gracefully bridges new users to capture instead of letting them ask Evara nothing.

- **Chat suggestions when memories exist** (`ChatView.tsx:486-532`): `derivePrompts(entries)` builds 3+ tied-to-content prompts. Beats a static "Ask me anything" wall.

- **AppLockGate doesn't block first-runs** (`AppLockGate.tsx:28-32`): `enabled = flagOn && userOptedIn && hasPinOrBio`. New user has no PIN, no biometric, hasn't opted in — gate is `enabled=false` and renders children directly. Lock only engages after the user goes to Settings → AppLock and configures it. Correct.

- **Capacitor deep-link auth** (`capacitorBridge.ts:42-60`): `everion://auth/callback` is wired through `handleAuthDeepLink` and lands the session via `supabase.auth.setSession`. Mobile shell signup → first-run modal works without web-style redirect.

---

## Findings

### F1 — OnboardingModal capture skips the funnel events
**Severity: HIGH** — analytics blind spot at the activation moment.

`src/components/OnboardingModal.tsx:72-95` (`handleSave`):

```ts
async function handleSave() {
  const content = input.trim();
  if (!content || !brainId || saving) return;
  const title = content.split("\n")[0].slice(0, 80);
  setSaving(true);
  try {
    await authFetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(getEmbedHeaders() || {}) },
      body: JSON.stringify({ ... }),
    });
  } catch (err) {
    console.error("[onboarding] capture failed", err);
  }
  markOnboarded();
  onComplete();
}
```

`trackFirstCapture` and `trackCaptureMethod` are wired only in `useCaptureSheetParse.ts:260-261` — the CaptureSheet path. Onboarding's direct POST bypasses both. Result: a user who completes the onboarding's first capture and never opens CaptureSheet **never fires `first_capture`**. The activation funnel under-counts the cleanest path through the app.

`first_capture` is a `firstOnce()` event — once another capture fires it through CaptureSheet, the storage key gates further fires (`src/lib/events.ts:37-50`). So the user shows as "captured" only on capture #2. The dashboard sees a delayed activation.

**Fix**:
```ts
// at top of OnboardingModal.tsx
import { trackFirstCapture, trackCaptureMethod } from "../lib/events";

// inside handleSave, before the try:
trackCaptureMethod({ method: "text" });
trackFirstCapture({ method: "text" });
```

Place BEFORE the `await` (per the `useCaptureSheetParse.ts:256-258` comment — "fire BEFORE the save round-trip so we count attempted captures"). 2-line patch.

### F2 — Gemini-slow / Gemini-down: OnboardingModal hangs, no timeout, no fallback
**Severity: HIGH** — first-impression failure mode.

`OnboardingModal.tsx:72-95` calls `authFetch("/api/capture", { method: "POST", ... })` with no timeout, no abort signal, no retry. Server-side `/api/capture` (Vercel function, see `api/capture.ts`) routes through Gemini for classification. Real Gemini latency ranges from sub-second to 30+ seconds during quota throttle. The button shows `saving…` (line 283) but no progress, no cap, no "still working" toast.

Failure modes:
- Gemini 503 / 429 → `fetch` resolves with a non-2xx response. `try/catch` only catches network errors (thrown promises), so a 503 falls through to `markOnboarded()`. **The user's first capture is silently lost** but the onboarding completes.
- Network drop → caught at `console.error("[onboarding] capture failed", err)` — silent in the UI. `markOnboarded()` still runs. Same loss.
- Gemini stall (40s+) → button stays in `saving…` indefinitely. User refreshes / force-closes. Modal returns on next mount because `markOnboarded()` never ran.

The `architecture/onboarding-flow.md:69` lists this as a known edge case ("First-capture timeout — capture endpoint > 5s → show 'still working' toast, don't block UI") with no implementation.

**Fix** (3 changes):

1. Check `r.ok` before declaring success:
```ts
const r = await authFetch("/api/capture", { ... });
if (!r.ok) throw new Error(`capture ${r.status}`);
```

2. AbortController with 30s cap:
```ts
const ac = new AbortController();
const timer = setTimeout(() => ac.abort(), 30_000);
try {
  await authFetch("/api/capture", { ..., signal: ac.signal });
} finally {
  clearTimeout(timer);
}
```

3. On failure: surface inline error in the modal, do NOT call `markOnboarded()`, keep the textarea content so the user can retry without retyping. Skip route stays available.

### F3 — Telemetry contract drift: 10 documented events that don't fire
**Severity: MEDIUM** — funnel dashboards are built on a phantom taxonomy.

`EML/Analytics/event-taxonomy.md` documents these activation/onboarding events:

| Documented | Fires? | Source |
|---|---|---|
| `landing_page_view` | NO | grep returns 0 |
| `signup_started` | NO | grep returns 0 |
| `signup_completed` | YES | `src/App.tsx:245` |
| `first_memory_created` | NO (named `first_capture` instead) | `src/lib/events.ts:20` |
| `first_ai_question_asked` | NO (named `first_chat` instead) | `src/lib/events.ts:22` |
| `first_ai_answer_viewed` | NO | grep returns 0 |
| `onboarding_modal_shown` | NO | grep returns 0 |
| `onboarding_step_completed` | NO | grep returns 0 |
| `onboarding_skipped` | NO | grep returns 0 |
| `onboarding_completed` | NO | grep returns 0 |
| `vault_setup_completed` | NO | grep returns 0 |
| `brain_created` | NO | grep returns 0 |
| `capture_classified` | NO | grep returns 0 |

What actually fires (`src/lib/events.ts:18-28`):
```ts
export const EVENT = {
  signupCompleted: "signup_completed",
  firstCapture: "first_capture",
  firstChat: "first_chat",
  firstInsightViewed: "first_insight_viewed",
  day7Return: "day_7_return",
  tierUpgraded: "tier_upgraded",
  tierDowngraded: "tier_downgraded",
  captureMethod: "capture_method",
  navViewActive: "nav_view_active",
} as const;
```

The north-star query in `event-taxonomy.md:41` (`first_ai_answer_viewed.uniques / signup_completed.uniques`) returns zero because `first_ai_answer_viewed` is not wired. PostHog autocapture (enabled at `src/lib/posthog.ts:38`) captures clicks/pageviews — those land — but the *named* funnel events the dashboard expects don't.

**Fix** — pick one direction. Either:

(a) **Update the taxonomy doc** to match the wire. Rename `first_memory_created` → `first_capture`, `first_ai_question_asked` → `first_chat`, drop the unwired ones. Keep the doc as the contract and make the wire match. ~15 min doc edit.

(b) **Add the missing events.** Wire `landing_page_view` (LandingScreen mount), `signup_started` (signup button click), `first_ai_answer_viewed` (`useChat.ts` stream-end), `vault_setup_completed` (`VaultPinSetup.tsx` post-PIN-set), `brain_created` (handleBrains POST 2xx), the 4 `onboarding_*` events (OnboardingModal mount/skip/save). ~2 hours code + tests.

Recommendation: do (a) for launch (the doc is wrong), schedule (b) for week 2 once funnel queries actually rely on the events.

### F4 — `markOnboarded()` runs on capture failure
**Severity: MEDIUM** — first-capture loss is silent.

`src/components/OnboardingModal.tsx:72-95`:

```ts
try {
  await authFetch("/api/capture", { ... });
} catch (err) {
  console.error("[onboarding] capture failed", err);
}
markOnboarded();   // ALWAYS runs
onComplete();      // ALWAYS runs
```

`markOnboarded()` writes `localStorage("everion_onboarded", "1")` and `user_profiles.onboarded_at`. After this fires, `useAppShell.ts:67-77` will never re-show the modal on this device. The user lands on Home with zero entries. They've already typed their first thought — it's gone — and the "Set up your brain" checklist now nags them with `0 of 5` on capture5 even though they captured something they thought saved.

The same skip path (`OnboardingModal.tsx:67-70`) deliberately calls `markOnboarded()` because skipping is intentional. But silent capture failure is not skip — it's loss.

**Fix**: only `markOnboarded()` on a successful save OR on explicit skip. Show inline error and keep the modal mounted on failure. Pairs with F2 mitigation.

```ts
async function handleSave() {
  const content = input.trim();
  if (!content || !brainId || saving) return;
  setSaving(true);
  try {
    const r = await authFetch("/api/capture", { ... });
    if (!r.ok) throw new Error(`capture ${r.status}`);
    markOnboarded();
    onComplete();
  } catch (err) {
    console.error("[onboarding] capture failed", err);
    setSaveError("couldn't save. try again — your text is still here.");
  } finally {
    setSaving(false);
  }
}
```

### F5 — `pinDoneRemote` swallows errors silently — server-flag drift
**Severity: MEDIUM**

`src/hooks/useFirstRunChecklist.ts:207-217`:

```ts
async function pinDoneRemote(id: ChecklistItemId): Promise<void> {
  try {
    await authFetch("/api/user-data?resource=checklist_done", {
      method: "POST",
      ...
    });
  } catch {
    /* best-effort — local optimistic state already shows it as done */
  }
}
```

No `r.ok` check, no retry, no logged surface. If `/api/user-data?resource=checklist_done` returns 5xx or the user is offline, the local cache stays "done" and the server `user_checklist_done` row never lands. On a fresh device login, `loadDoneFlags()` returns no row, the live signal is also false (e.g. user deleted the vault entry that pinned `vault`), and the item resurrects.

The "ever completed for this brain" guard at line 408–413 covers the *all-done* case — `markCompletedFor(brainId)` writes a per-brain flag — but per-item drift leaks.

**Fix**: check `r.ok`, log the failure, and retry once on the next refresh tick. Pair with the existing `refresh()` round-trip on focus (line 299–303) — if a flag is locally pinned but server hasn't confirmed, `refresh()` re-POSTs.

```ts
async function pinDoneRemote(id: ChecklistItemId): Promise<boolean> {
  try {
    const r = await authFetch("/api/user-data?resource=checklist_done", {
      method: "POST", ...
    });
    if (!r.ok) {
      console.warn("[checklist] pin failed", id, r.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[checklist] pin error", id, err);
    return false;
  }
}
```

Track a per-item "pending-server" set; on each `refresh()` re-attempt the pending ones.

### F6 — InboxTriage / Today / RecentCaptures hide instead of empty-state
**Severity: MEDIUM** — first impression on Home is sparse.

For a brand-new user with zero entries:
- `RecentCapturesStrip.tsx:34`: `if (recent.length === 0) return null;` — not rendered.
- `InboxTriageCard.tsx:7`: `if (stagedCount === 0) return null;` — not rendered.
- `TodayCard` does render with empty-state copy (line 77).

So Home for a fresh user shows: GreetingHero, TodayCard ("nothing on your plate"), FirstRunChecklist, QuickCaptureChips. The page feels thin — three cards stacked, two of them low-activity. The checklist is the only call to act.

This is a deliberate choice (TodayCard's comment says disappearing cards feel unstable, but the same logic isn't applied to RecentCapturesStrip / InboxTriageCard). A low-activity Home for a brand-new user doesn't break the flow — the FAB and checklist drive next action — but it under-uses the screen.

**Fix** (v2 polish, not blocker): add empty-state stubs to RecentCapturesStrip ("your captures show up here as you save them") and consider pulling InboxTriageCard out of Home for users without Gmail connected (it stays null in that case anyway, but a hide-when-no-integration explicit branch is cleaner than `stagedCount === 0`).

### F7 — No timing telemetry per onboarding step
**Severity: LOW**

`event-taxonomy.md:115` lists `onboarding_step_completed` with `time_spent_ms` property. Not wired. There's no `time_to_first_capture_ms` either — we cannot answer "what's the median time from signup to first capture?" The activation funnel says "completes" or "doesn't"; not "how fast."

**Fix**: capture `Date.now()` on `signup_completed` fire (`src/App.tsx:245`) into a session-scoped ref or localStorage; subtract on `first_capture` fire to emit `time_to_first_capture_ms`. Useful for sub-60s claim.

### F8 — Vault PIN nudge timing is right, but lives only in the checklist
**Severity: LOW** — verify

Per scope: "Vault PIN setup is offered at the right moment (not too early, not too late)." Confirmation:

- `VaultPinSetup.tsx` exists (`src/components/vault/VaultPinSetup.tsx`); `AppLockGate.tsx:31` reads `loadPinRecord() || loadBiometricRecord()` to decide whether to engage the gate.
- New users land on Home with no PIN configured → `enabled = false` (line 32), gate is inert.
- Vault checklist item (`useFirstRunChecklist.ts:362`) requires the user to *add* an encrypted entry before going done. PIN setup is implicit in that flow (vault unlock → add → encrypt).
- No standalone "set up a PIN now" prompt at signup. PIN is offered only when the user actively visits the vault.

Correct shape — PIN before any vault content is friction; PIN gated to "actually using vault" is right. The risk is users who *only* use chat/capture and never set a PIN, then later add a sensitive entry without realising the encryption story. The vault setup flow itself walks the user through PIN + recovery, so this is covered downstream.

**Fix** (optional): once `vault_entries.length > 0` and `loadPinRecord()` is empty, surface a one-time inline tip on the vault list ("you can unlock with a 6-digit PIN — set one up?"). Already partially handled in the vault setup nudge — verify the component actually shows it.

### F9 — Mobile-shell-specific onboarding considerations are unverified
**Severity: LOW** — verify

Capacitor deep-link auth lands the session via `supabase.auth.setSession` (`capacitorBridge.ts:42-67`). After that, the iOS / Android shell renders the same React tree as web. So:

- OnboardingModal renders the same way.
- `markOnboarded()` upserts to Supabase the same way; cross-device sync via `user_profiles.onboarded_at` covers app/web parity.
- No biometric prompt at signup — biometric is a vault-level setup, not an onboarding step. Correct timing (don't ask for Face ID before they understand what we're protecting).
- No `beforeinstallprompt` handling — the PWA install prompt is suppressed/never shown. iOS Safari doesn't fire it anyway, and Capacitor users are already in a native shell.

Untested: Capacitor StatusBar / SafeArea overlap with the OnboardingModal `Dialog` in landscape iOS. Modal uses `max-h-[calc(100vh-32px)]` which doesn't account for `env(safe-area-inset-top)`. On a notched device in landscape the modal can clip at the top.

**Fix**: change `max-h` to `max-h-[calc(100vh-32px-env(safe-area-inset-top)-env(safe-area-inset-bottom))]` and verify in iOS sim. Pair with the F2 / F4 fixes since you'll be in `OnboardingModal.tsx` already.

---

## Surface map

| File | Role | LOC |
|---|---|---|
| `src/components/OnboardingModal.tsx` | First-run modal — single capture, 4 examples, live preview | 290 |
| `src/components/FirstRunChecklist.tsx` | Renders 6-item (3-item shared) checklist on Home | 322 |
| `src/hooks/useFirstRunChecklist.ts` | Checklist state, sticky-done, cache-then-network, server pin | 429 |
| `src/hooks/useAppShell.ts` | `showOnboarding` gate, cross-device sync via `onboarded_at` | 217 |
| `src/views/HomeView.tsx` | Home shell — Greeting, Today, InboxTriage, Checklist, Recent, Chips | 87 |
| `src/components/home/GreetingHero.tsx` | Persona-aware greeting + week digest | 66 |
| `src/components/home/TodayCard.tsx` | Today's todos + calendar; renders even when empty | 252 |
| `src/components/home/InboxTriageCard.tsx` | Gmail-staged-count CTA; null when 0 | 78 |
| `src/components/home/RecentCapturesStrip.tsx` | Last 5 captures; null when 0 | 143 |
| `src/components/home/QuickCaptureChips.tsx` | 4 starter labels → openCapture | 44 |
| `src/views/ChatView.tsx` | Empty state branches on noMemory; suggestions when memories exist | 557+ |
| `src/views/VaultUnlocked.tsx` | Vault-empty CTA "Add a secret" | 280+ |
| `src/views/GraphView.tsx` | "the night sky is empty" empty state | 130+ |
| `src/views/ImportantMemoriesView.tsx` | "No important memories yet" + promote prompt | 290+ |
| `src/views/TodoSomedayTab.tsx` | Someday empty state with capture nudge | 568+ |
| `src/views/TrashView.tsx` | "Trash is empty" — terminal, no CTA needed | 200+ |
| `src/lib/events.ts` | PostHog event wrapper — 8 events wired | 121 |
| `src/lib/posthog.ts` | PostHog init, consent-gated, autocapture on | 85 |
| `src/App.tsx` | Fires `trackSignupCompleted`, `trackDay7ReturnIfDue` on session | 600+ |
| `EML/Analytics/event-taxonomy.md` | Documented event contract — drifted from code | 165 |
| `EML/architecture/onboarding-flow.md` | Spec — declares ≤60s activation goal | 89 |

---

## Time-to-first-capture walkthrough

Clean signup, web, broadband:

1. Click "Sign in with Google" → OAuth redirect (~5–8s including Google consent).
2. Redirect lands → Supabase session via App.tsx onAuthStateChange (instant).
3. `useAppShell` initial state: `view="home"`, `showOnboarding=true`.
4. Everion.tsx renders `<OnboardingModal>` modal (~150ms after session).
5. User reads "give your brain its first thing to remember" + 4 example chips.
6. User clicks a chip OR types ~10 words (~10–20s).
7. Cmd+Enter → POST /api/capture → Gemini classify (~2–5s typical, up to 30s degraded).
8. `markOnboarded()` upsert (fire-and-forget, no UI blocker).
9. `onComplete()` → setView("home") → user sees Home with first capture in `entries`.

**Best case: ~25s. Realistic: 35–50s. Degraded (Gemini slow): 60–90s.**

The 60s target in `architecture/onboarding-flow.md:7` is achievable on the happy path. F2 (no timeout / no fallback) is the single failure mode that breaks the claim — once Gemini stalls, the user is stuck or loses their first capture.

`first_ai_answer_viewed` is not tracked, so we cannot empirically measure activation completion against the 7-day-40% target in `event-taxonomy.md:42`. Wiring this is part of F3.

---

## Empty-state CTA matrix

| View | Empty branch | CTA | Verdict |
|---|---|---|---|
| Home (zero entries) | GreetingHero "your brain is empty — type something below" | FAB + checklist + quick chips | Good |
| Chat | "Nothing to chat about yet" + body | "Capture a thought" → setView("capture") | Good |
| Vault | "Vault is empty" + body | "Add a secret" → openAddSecret | Good |
| Graph | "the night sky is empty" + body | None (no button) | Dead-end — F6 type |
| Important memories | "No important memories yet. Add one — or promote any entry from its detail view" | Promote-prompt copy | Good (prose CTA) |
| Trash | "Trash is empty" | None (terminal — correct) | Good |
| Someday | "Someday is empty" + "Capture anything that's not for today" | Prose CTA — no button | OK (prose nudge) |
| Lists | "empty" (per-list text only) | "+ New list" button at index | Good |
| RecentCapturesStrip | NULL (hidden) | none | Hides — F6 |
| InboxTriageCard | NULL (hidden) | none | Correctly hides (no Gmail) — F6 caveat |

GraphView is the one with a body but no button. Add `<Button onClick={() => onNavigate("capture")}>Capture a thought</Button>` to mirror Chat/Vault. Low priority.

---

## Recommendations (priority)

1. **[HIGH] F1** — wire `trackFirstCapture` + `trackCaptureMethod` in `OnboardingModal.handleSave`. 2 lines. Closes the activation-funnel hole.

2. **[HIGH] F2 + F4** — `r.ok` check, AbortController 30s cap, on-failure surface error inline, do NOT `markOnboarded()` on failure. ~30 LOC in `OnboardingModal.tsx`. Prevents silent first-capture loss.

3. **[MED] F3** — update `event-taxonomy.md` to match the wired event names (`first_capture` not `first_memory_created`, `first_chat` not `first_ai_question_asked`, drop the unwired ones). Schedule wiring of `first_ai_answer_viewed`, `vault_setup_completed`, `brain_created`, `landing_page_view` for week 2.

4. **[MED] F5** — `pinDoneRemote` checks `r.ok`, retries failed pins on next `refresh()`. ~20 LOC in `useFirstRunChecklist.ts`.

5. **[MED] F6** — empty-state stubs for RecentCapturesStrip ("your captures land here") + GraphView CTA button. ~10 LOC each.

6. **[LOW] F7** — `time_to_first_capture_ms` property on `first_capture` event. Subtract `signup_completed` timestamp from a localStorage write at signup time. ~10 LOC.

7. **[LOW] F9** — modal `max-h` calc with safe-area insets, verify on iOS landscape sim. ~1 line.

---

## Limitations

- No live PostHog access in this audit — event wire-vs-doc cross-check is grep-only. Verifying that `posthog.capture("signup_completed", ...)` actually lands a row in PostHog requires the dashboard.
- No real-device timing — sub-60s claim is calculated from architecture, not measured. A real Capacitor build + iOS device timing would close that loop. Schedule for week 3 device QA per `Specs/android-qa-matrix.md`.
- Did not exercise OnboardingModal in storybook / Playwright. `src/components/__tests__/OnboardingModal.test.tsx` exists but was not read in this audit.
- `architecture/onboarding-flow.md:11-49` describes a forthcoming "what do you forget?" multi-pick onboarding screen (`marketing/seo-marketing-playbook.md` § 16). The current modal is the simpler one-input version. The spec drift is acknowledged in the doc but worth flagging — if the multi-pick is the launch design, current modal needs replacement.

---

## Method

- Read `src/hooks/useFirstRunChecklist.ts` end-to-end.
- Read `src/components/OnboardingModal.tsx` end-to-end.
- Read `src/components/FirstRunChecklist.tsx` end-to-end.
- Read `src/hooks/useAppShell.ts` end-to-end.
- Read `src/views/HomeView.tsx` + 5 home subcomponents.
- Read `src/lib/events.ts` and `src/lib/posthog.ts`.
- Grepped every `posthog.capture` / `track` / `track*` call across `src/`.
- Cross-checked emitted events against `EML/Analytics/event-taxonomy.md`.
- Read empty-state branches in 7 views (ChatView, VaultUnlocked, GraphView, ImportantMemoriesView, TodoSomedayTab, TrashView, ListsView).
- Read `EML/architecture/onboarding-flow.md` for activation goal + edge cases.
- Read `src/components/AppLockGate.tsx` to confirm new-user inertia.
- Read `src/lib/capacitorBridge.ts` to confirm deep-link auth.
- Did not run the app live; relied on code + doc reconciliation.

**Audit kicked off by**: user request "evidence-based onboarding audit" on 2026-05-07.
