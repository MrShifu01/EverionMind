# Settings Views Audit — 2026-05-07

> Sweep across every tab in `src/components/settings/` and the host shell `src/views/SettingsView.tsx`. Focus: section taxonomy, URL alias coverage, write-confirmation patterns, save semantics, dirty-state handling, mobile nav. Tab-internal deep-dives (Profile, Admin, Security/Vault) live in their dedicated audits — this report covers cross-cutting shell concerns plus shallow scans of every other tab.

## Verdict

**Shell is solid; tab save semantics drift.** SettingsView consolidated 14 lazy-loaded tab modules into 6 sections with a clean URL_ALIASES map (`SettingsView.tsx:59-72`) — every legacy `?tab=` key (appearance, profile, billing, data, ai, notifications, integrations, security, danger, admin) routes correctly to its consolidated parent. Mobile uses a sticky horizontal scroll-strip; desktop uses a 220px sidebar. Both share the same nav array; both call `visit(id)` to seed the lazy-import set so the chunk fetch fires on hover (desktop) or tap (mobile).

Five findings worth shipping before launch. No HIGH-severity. Top three: (F1) DangerTab uses an old custom modal instead of the new `<ConfirmDialog>` shipping in `src/components/ConfirmDialog.tsx`; (F2) save semantics fragment across tabs — Brain toggles auto-save, Account profile needs a Save button, Brain Members invite is a form submit, AppearanceTab is auto-save with no toast, no consistent pattern; (F3) dirty-state is silently dropped on tab switch — Account profile editing then clicking another section nukes unsaved field changes with no warning.

URL_ALIASES coverage is good. `?tab=billing` still lands users on Account (where the BillingTab is mounted as a sub-section for admins), `?tab=danger` lands on Privacy. Cold load with `?tab=billing` triggers `deriveInitialSection()` (`SettingsView.tsx:74-81`) before render so the chunk fetches and the right pane shows. Two corner cases not covered: `?tab=appearance` lands you in "Personal" (correct), but the section header still says "Personal" rather than scrolling to AppearanceTab — purely cosmetic, AppearanceTab is the first child anyway.

Account-delete confirm is a custom inline modal in DangerTab (`DangerTab.tsx:130-249`), not native `confirm()`. Delete-brain confirm uses a 5-second tap-to-confirm pattern (`DangerTab.tsx:65-79` + `DELETE_BRAIN_CONFIRM_WINDOW_MS = 5000`). Both are inline-custom — no `window.confirm`. Connections-tab disconnect is a single-tap with no confirm. Brain delete (in MultiBrainSection) uses tap-to-confirm via local `confirmDelId` state with `onBlur` cancel (`BrainTab.tsx:342-358`). Inconsistency, but no native dialogs.

---

## Architecture overview

```
SettingsView (src/views/SettingsView.tsx)
│
├── deriveInitialSection() — reads ?tab=, ?gmailConnected, ?calendarConnected
│   └── URL_ALIASES (10 legacy keys → 6 sections)
│
├── header (desktop only — hidden on mobile)
├── nav (mobile horizontal scroll-strip, sticky top:0)
├── nav (desktop 220px sidebar, scrollable)
│
└── content panel (lazy-loaded sub-trees, Suspense boundary per section)
    │
    ├── PERSONAL — AppearanceTab + ProfileTab
    │       (AppearanceTab: theme/mode auto-save to design context)
    │       (ProfileTab: covered by profile-tab-audit)
    │
    ├── ACCOUNT — AccountTab + (admin only) BillingTab
    │       (AccountTab: profile fields, sign-out, onboarding restart)
    │       (BillingTab: tier/usage meters, upgrade CTA, manage portal)
    │
    ├── BRAIN — BrainTab + DataTab + AITab + audit/learning rows
    │       (BrainTab: multi-brain management, members, vault grants, toggles)
    │       (DataTab: imports/exports/backup, trash)
    │       (AITab: provider keys, enrichment controls, BYOK panel)
    │
    ├── CONNECTIONS — Notifications + CalendarSync + GmailSync + ClaudeCode
    │       (each in a SettingsExpand panel — Manage / Done toggle)
    │
    ├── PRIVACY — SecurityTab + (link to vault) + DangerTab
    │       (SecurityTab: vault PIN, AppLockSection — covered by vault-view-audit)
    │       (DangerTab: clear trash, reset graph, delete brain, export+delete account)
    │
    └── ADMIN — AdminTab (admin-only — covered by admin-tab-audit)
```

---

## Tab inventory

| Section | Tab module | Primary actions | Save semantics | Dirty-state | Confirm UI | Deep-link key |
|---|---|---|---|---|---|---|
| Personal | AppearanceTab | Pick theme variant, toggle dark/light | Auto-save to context (no button, no toast) | n/a — instant | n/a | `appearance`, `profile` |
| Personal | ProfileTab | About-you fields, Gemini key, photo, etc. | Out of scope (see profile-tab-audit) | Out of scope | Inline modal (commit `c8...` per ProfileTab.tsx:161) | (same) |
| Account | AccountTab | Edit display_name/phone/address, sign out, restart onboarding | Save button (`AccountTab.tsx:235-237`), local cache write before server | **Lost silently on tab switch** — no warn | Sign-out: no confirm | `account`, `billing` |
| Account | BillingTab (admin only) | Upgrade plan card, Manage subscription portal, see usage meters | n/a (provider redirects) | n/a | n/a | `billing` |
| Brain | BrainTab | Multi-brain CRUD, invite/remove member, grant vault, toggle concept extraction + embeddings | Toggles auto-save to localStorage; member ops auto-fire on click; rename has Save button | Edit-name dirty state lost on row collapse | Brain delete: 5s tap-to-confirm in DangerTab; multi-brain delete: tap-to-confirm-with-onBlur | `brain` |
| Brain | DataTab | Import (6 sources), Export JSON/CSV, Backup, Trash | Imports run immediately; export is one-shot download | n/a — no editable fields | n/a | `data` |
| Brain | AITab | BYOK key entry, enrichment run/clear/retry, diagnostics | Provider keys saved via Save button per card; enrich actions one-shot | BYOK keys lost on collapse without save | n/a | `ai` |
| Connections | NotificationSettings | Daily prompt time, weekly nudge | Auto-save | n/a | n/a | `notifications` |
| Connections | CalendarSyncTab | Connect Google Calendar (OAuth), disconnect | OAuth redirect; disconnect is one-click no confirm | n/a | **No confirm on disconnect** | `integrations` |
| Connections | GmailSyncTab | Connect Gmail, scan now, edit prefs, view inbox, disconnect | Prefs saved via modal; disconnect one-click no confirm | n/a | **No confirm on disconnect** | (same) |
| Connections | ClaudeCodeTab | Generate API key, copy, revoke | Save fires on Generate; revoke one-click no confirm | n/a | **No confirm on revoke** | (same) |
| Privacy | SecurityTab | Vault PIN setup/change/remove, AppLockSection | Step-form (verify → new → confirm) | n/a | PIN remove: no confirm (one-click) | `security` |
| Privacy | DangerTab | Clear trash, reset graph, delete brain, export+delete account | One-shot actions | n/a | Account delete: custom inline modal (3 steps); brain delete: 5s tap-to-confirm | `danger` |
| Admin | AdminTab | (out of scope — see admin-tab-audit) | (out of scope) | (out of scope) | (out of scope) | `admin` |

---

## What's solid

- **URL_ALIASES** (`SettingsView.tsx:59-72`) maps every legacy `?tab=` key (appearance, profile, account, billing, brain, data, ai, notifications, integrations, security, danger, admin — 12 keys) to one of the 6 consolidated sections. Cold load with any old deep-link routes correctly. `deriveInitialSection()` (`SettingsView.tsx:74-81`) runs synchronously inside `useState` initializer so the right section is selected before first paint — no hydration flash.
- **OAuth-return query params** are first-class. `?gmailConnected`, `?gmailError`, `?calendarConnected`, `?calendarError` short-circuit straight to `connections` (`SettingsView.tsx:76-78`) before the `tab` param is even read. After landing, each tab's effect strips its own params via `window.history.replaceState` (`GmailSyncTab.tsx:94-111`, `CalendarSyncTab.tsx:31-46`, `BillingTab.tsx:229-236`).
- **Lazy-loading per tab module** (`SettingsView.tsx:10-23`). Every tab is `lazy()`-wrapped and gated behind the `visited` Set so opening Settings doesn't pull all 14 tab chunks. Hover on a desktop sidebar item also seeds the visit (`SettingsView.tsx:502`) — by the time the user clicks, the chunk's downloaded.
- **Mobile-vs-desktop nav** parity. Same SECTIONS array drives both. Mobile gets sticky horizontal scroll (`SettingsView.tsx:423-468`); desktop gets vertical sidebar (`SettingsView.tsx:471-511`). Stylesheet at the bottom (`SettingsView.tsx:700-727`) flattens layout on `@media (max-width: 1024px)` so iOS Safari doesn't rubber-band — that is a deliberate fix per inline comment.
- **Admin gate is JWT-fresh.** `useEffect` on mount (`SettingsView.tsx:339-356`) calls `supabase.auth.refreshSession()` *before* reading `app_metadata.is_admin` so a user just-promoted to admin sees the Admin section without a sign-out / sign-in cycle. Comment at `SettingsView.tsx:340-344` documents the rationale.
- **Account-delete export-then-delete flow** (`DangerTab.tsx:106-128`) is a 3-state machine (`ask-export` → `exporting` → `deleting`) inside a single inline custom modal. Pulls every brain via `/api/brains`, then `/api/export?brain_id=…` for each, builds a single JSON, triggers download, then calls `deleteAccount`. Modal cannot be dismissed mid-export — only the `ask-export` state shows a Cancel button.
- **PIN flow** in SecurityTab (`SecurityTab.tsx:36-90`) is a 5-state machine (`create-new`, `create-confirm`, `change-verify`, `change-new`, `change-confirm`) plus `idle` and `busy`. Confirm-step compares against `savedPin` in component state — never round-trips the new PIN. Old PIN verified via `verifyPin()` before letting the user pick a new one. `Esc` and `Enter` keybindings work (`SecurityTab.tsx:181-183`).
- **Connections panels stay open across renders.** `SettingsExpand` with `keepMounted` (`SettingsRow.tsx:76-101`) — used by Notifications, Calendar, Gmail, ClaudeCode (`SettingsView.tsx:586, 600, 614`) so re-opening a panel doesn't re-run its effects/fetches.
- **Brain auto-save toggles** (`BrainTab.tsx:46-47`, `82-99`) — concept extraction + embeddings flip in localStorage instantly, no Save button to forget. Right pattern for prefs.
- **Member invite flow** is a `<form onSubmit>` with bound state and a single submit button (`BrainTab.tsx:608-637`). No naked native `confirm()`. Email input is `type="email"` with HTML5 validation; role select uses `appearance: none` per the design philosophy.
- **No native dialogs anywhere.** Grep `window\.confirm|window\.alert|window\.prompt|\bconfirm\(` across `src/components/settings/` returns only comments documenting their absence (`AdminCRMSection.tsx:12`, `ProfileTab.tsx:161`) and a function named `confirm()` inside ProfileTab (`ProfileTab.tsx:1462`) — not the global. Confirmed compliant with the CLAUDE.md design philosophy.
- **No window.open for external links.** Vault-portal returns a URL the client navigates to via `window.location.href` (`BillingTab.tsx:198`). Calendar/Gmail OAuth return `redirect_url` and the client navigates the same way. No popup blockers to fight.
- **Inline error banners use the design tokens** consistently — `var(--blood)` text on `var(--blood-wash)` with a matching border. See BrainTab.tsx:208-220 (multi-brain error), GmailSyncTab.tsx:212-227 (msg banner), DangerTab modal error (DangerTab.tsx:174-186). Consistent across tabs.

---

## Findings

### F1 — Account-delete uses a bespoke modal; the new `ConfirmDialog` is unused

**Severity: LOW** — UX consistency

`src/components/ConfirmDialog.tsx` is a clean `AlertDialog`-based primitive (`ConfirmDialog.tsx:14-105`) with submitting state, danger variant, and accessible focus management. It's checked into git (status `?? src/components/ConfirmDialog.tsx`) but **never imported by any settings tab**. DangerTab still uses a hand-rolled modal (`DangerTab.tsx:130-249`) for the export-then-delete flow.

Effect: account-delete looks different from any other confirm in the app. Two patterns to maintain. New tabs that need a confirm have to choose — neither pattern is documented as canonical.

The DangerTab modal IS more complex than ConfirmDialog (3 states: ask-export / exporting / deleting), so a swap isn't a one-liner. But the *export-then-delete* choice could be a `ConfirmDialog` with a custom `body` payload, and the *exporting/deleting* states could be a simple inline progress card.

**Fix path**:
1. Document `ConfirmDialog` as canonical confirm primitive in EML/architecture/.
2. Migrate DangerTab to use ConfirmDialog for the ask-export step; keep the inline progress card for the exporting/deleting states.
3. Add disconnect confirms (F4 below) using ConfirmDialog.

### F2 — Save semantics inconsistent across tabs

**Severity: MEDIUM** — UX confusion

Three different save patterns coexist:

**Auto-save (no button, no toast):**
- AppearanceTab variant + mode (`AppearanceTab.tsx:116, 189`) — fires `setVariant`/`setMode` directly on click, persists via context.
- BrainTab toggles (`BrainTab.tsx:82-99`) — flips localStorage on toggle change.
- AccountTab onboarding-restart (`AccountTab.tsx:243-247`) — clears localStorage immediately.

**Save button (explicit save, in-band confirm):**
- AccountTab profile fields (`AccountTab.tsx:235-237`) — "Save profile" button + "Saved." inline message + error inline.
- BrainTab rename (`BrainTab.tsx:290-298`) — "Save" inside the per-row edit panel.
- AITab BYOK provider keys (in ProvidersTab) — Save per provider card.
- SecurityTab PIN — Next/Set PIN/Update PIN per step.

**Form submit (single-button at end):**
- BrainTab member invite (`BrainTab.tsx:608-637`) — native `<form onSubmit>` flow.
- ClaudeCodeTab generate-key (`ClaudeCodeTab.tsx:57-80`) — Generate button.

**One-click action (no save concept):**
- DangerTab clear-trash, reset-graph (`DangerTab.tsx:33-63`) — one-click, inline status message.
- Connections disconnect — one-click, no confirm (F4 below).

The `AccountTab` profile flow contains `writeProfileCache(profile)` *before* the Supabase round-trip (`AccountTab.tsx:105`). If the network call fails, localStorage holds optimistic data while the server doesn't — but on next page-load the `useEffect` (`AccountTab.tsx:85-99`) refetches from `auth.getUser()` and overwrites localStorage with server-truth. So eventually-consistent, but there's a window where localStorage is ahead of server.

**Fix path**: pick a doctrine, document it in EML/architecture/settings-conventions.md, then realign the outliers. Suggested doctrine:
- **Toggles + theme** — auto-save (current pattern, keep).
- **Forms with multiple fields** — explicit Save button + dirty indicator + Saved/Failed inline.
- **Destructive single actions** — ConfirmDialog before action, then one-shot.
- **Connect/Disconnect external** — Connect navigates to OAuth; Disconnect uses ConfirmDialog.

### F3 — Dirty-state silently dropped on tab switch

**Severity: MEDIUM** — data loss class

Open `Account` section, click Edit, modify display_name field. Click `Brain` in the sidebar. The field state is held in `AccountTab` component's `useState` (`AccountTab.tsx:51-53`) — but the section render switches to `display: none` (`SettingsView.tsx:533`) **without unmounting**. Hidden, not destroyed. So the in-progress edit survives tab switch.

But: the `Save profile` button is hidden behind the now-hidden section. There's no toast, no nag, no "you have unsaved changes" indicator anywhere. User who clicked Save on the *next* tab doesn't realize their Account edit is sitting un-saved in a hidden DOM tree. Closing settings entirely (navigating to the vault, going home) discards everything because the `SettingsView` itself unmounts.

Same shape applies to:
- BrainTab in-row rename (`editingId`/`editName`/`editDesc` state) — unsaved rename lost when section switches THEN settings closes.
- AITab BYOK key entry inside ProvidersTab — same.
- GmailSyncTab inside Connections (modal mode `connect`/`edit`) — modal stays mounted but inaccessible.

`SettingsView` does **not** intercept `beforeunload` or section switches.

**Fix path**: lightweight dirty-state context. Each tab calls `useDirtyState(scope)` from a shared hook; on `setSection` or `beforeunload`, if any registered dirty scopes exist, show `<ConfirmDialog>` (`Discard unsaved changes?` / `Stay here`). Two-line addition to each tab. Bigger payoff than a one-pass UX: prevents the "I clicked save and nothing happened" support tickets at scale.

### F4 — Connections disconnect has no confirm

**Severity: LOW** — destructive but not catastrophic

- `GmailSyncTab.tsx:196-202` — `handleDisconnect` fires `DELETE /api/gmail` instantly, no confirm.
- `CalendarSyncTab.tsx:48-57` — `disconnect(provider)` fires `DELETE /api/calendar` instantly, no confirm.
- `ClaudeCodeTab.tsx:82-89` — `revoke(id)` fires `DELETE` instantly, no confirm.
- `SecurityTab.tsx:92-95` — `handleRemove` clears stored PIN with no confirm.

User who fat-fingers Disconnect on Gmail loses their OAuth grant + has to re-do the consent screen. User who taps Revoke on a Claude Code API key has any external client running with that key suddenly fail. Not catastrophic — re-connect path is documented and works — but every other destructive op in the app confirms.

`DisconnectButton` is a shared component (`GmailSyncTab.tsx` exports it; CalendarSyncTab imports from there per CalendarSyncTab.tsx:4). One change in that primitive ripples to both.

**Fix**: wrap each in a `ConfirmDialog` with a danger-variant Confirm button:
- Gmail: "Disconnect Gmail? This stops scans and revokes our OAuth grant. You can reconnect anytime."
- Calendar: same shape.
- API key: "Revoke key '<name>'? Anything using it will stop working immediately."
- PIN: "Remove vault PIN? You'll have to type your full passphrase to unlock the vault."

### F5 — Brain delete uses 5s tap-to-confirm in one place, onBlur tap-to-confirm in another

**Severity: LOW** — polish

Two delete flows for brains:

1. **DangerTab** (`DangerTab.tsx:65-79`): tap "Delete brain" → button text becomes "Tap to confirm" for `DELETE_BRAIN_CONFIRM_WINDOW_MS = 5000`. After 5s of inaction, it auto-resets. Second tap inside the window deletes.
2. **BrainTab.MultiBrainSection** (`BrainTab.tsx:342-358`): tap "Delete" → button text becomes "Confirm?". Stays until the user clicks elsewhere (`onBlur` resets to "Delete") or taps Confirm (deletes).

Same destructive op, two different confirm UX patterns. The `onBlur` pattern is fragile on touch devices — a tap on a sibling button can race the blur and either fire the delete or cancel it depending on bubbling order.

**Fix path**: standardize on `ConfirmDialog` for both. The MultiBrainSection one is the lower-friction option since the user might be deleting a list of brains and clicking through a dialog feels heavier — but the safety win is real. Keep the 5s window in DangerTab if you want it different (it's the deletes-the-active-brain context which is rarer).

### F6 — `?tab=billing` cold-load lands on Account but doesn't auto-scroll to BillingTab

**Severity: VERY LOW** — cosmetic

`URL_ALIASES.billing = "account"` (`SettingsView.tsx:64`). On cold load, deriveInitialSection picks `account`, BillingTab mounts as a sub-section under Account (admin-only — `SettingsView.tsx:537-545`), section header still says "Account" because it's the parent. User who deep-linked to billing has to scroll past the Account profile card + email + display-name + onboarding rows to reach the BillingTab pane.

For non-admin users `?tab=billing` lands them on Account *with no BillingTab visible* (it's gated behind `isAdmin`). Yet anyone hitting `/settings?tab=billing` from a marketing email or a `Manage subscription` link would expect to see billing.

Two issues:
1. Non-admin user sees no billing content. (Likely a bug — billing is paying users not admins.)
2. Even admin users get dropped at the top of Account, not at the BillingTab anchor.

**Fix**:
- Change the section gate so BillingTab is visible to **anyone**, not just admins (`SettingsView.tsx:537`). Admin gating doesn't fit billing — paying users need to manage their own subscription. Cross-check with `useSubscription` to confirm the BillingTab itself handles non-admin cases (it does — see BillingTab.tsx:289 onwards).
- On cold load with `?tab=billing`, scroll the BillingTab pane into view via `scrollIntoView({ block: "start" })` after Suspense resolves. Or split it back into its own section (would require reverting the consolidation — heavier).

### F7 — `?tab=appearance` legacy alias maps to "personal" but AppearanceTab is the first child anyway

**Severity: VERY LOW** — works as-is, noted for completeness

`URL_ALIASES.appearance = "personal"` and AppearanceTab is the first thing rendered inside Personal (`SettingsView.tsx:521-528`). Legacy deep-link works — the user lands at the top of Personal with the theme-picker in view. No fix needed; flagging because this is the *good* example of a legacy alias landing the user where they expected.

---

## Save-semantics matrix (proposed doctrine)

| Action class | Pattern | Confirm | Toast | Example |
|---|---|---|---|---|
| Toggle pref (boolean) | Auto-save | None | None | BrainTab concept extraction |
| Theme pick | Auto-save | None | None | AppearanceTab |
| Form (multi-field) | Save button + inline saved/failed | None | Inline | AccountTab profile |
| Single-action destructive | One-click + ConfirmDialog | ConfirmDialog | Inline | Disconnect Gmail (F4) |
| Multi-step destructive | Inline modal state machine | Inline | Inline | DangerTab delete account |
| External provider redirect | Click → navigate to OAuth | None (next page) | URL params on return | Calendar Connect |
| Generate secret | Click → reveal once | None | Reveal panel | ClaudeCodeTab |

---

## Mobile nav check

- Mobile sticky strip starts at `top: 0` (`SettingsView.tsx:441`) — comment notes the prior `var(--app-header-h)` double-counted the global header. Now flush under the header bars. Verified by the comment at SettingsView.tsx:434-440 and consistent with the layout-architecture memory.
- Strip has `overflow-x: auto` + `scrollbar-hide` — extra sections (e.g., Admin) push horizontally without crowding.
- Bottom-nav clearance: content padding is `calc(96px + env(safe-area-inset-bottom))` (`SettingsView.tsx:721`) — safe.
- Sidebar (desktop) has `height: 100%` (`SettingsView.tsx:480`) — the inline comment (480-485) explains a previous flex collapse where surface-low only painted a few rows tall. Currently fills.
- Touch routing: stylesheet flattens `overflow: hidden` on the body to `overflow: visible` for mobile (`SettingsView.tsx:719-722`). Comment 711-717 explains the iOS rubber-band fix. Currently shipping.

No findings here.

---

## Recommendations (priority)

1. **[MEDIUM] F2** — write `EML/architecture/settings-conventions.md` documenting the four save patterns above. Realign outliers in a follow-up sprint. ~30 min doc, ~2 hr realign.
2. **[MEDIUM] F3** — ship a `useDirtyState(scope)` hook + tab-switch interceptor. Prevents the "I clicked save and nothing happened" class of tickets. ~2 hr.
3. **[LOW] F4** — wrap every disconnect / revoke / PIN-remove in `ConfirmDialog`. ~30 min.
4. **[LOW] F1** — adopt `ConfirmDialog` as the canonical primitive; deprecate the bespoke DangerTab modal for the ask-export step. ~45 min.
5. **[LOW] F5** — standardize brain-delete confirm. Pick the `ConfirmDialog` path or the 5s tap-to-confirm path; document either way. ~20 min.
6. **[LOW] F6** — un-gate BillingTab from `isAdmin`. Audit who currently sees BillingTab and add a unit test that `/settings?tab=billing` renders the billing pane for any signed-in user. ~30 min + test.
7. **[VERY LOW] F7** — note in EML/architecture/settings.md that `?tab=appearance` works correctly, no action.

---

## Pre-launch checklist

| Item | Status | Owner |
|---|---|---|
| F1 — ConfirmDialog adopted in DangerTab | ❌ | dev |
| F2 — settings-conventions.md written | ❌ | dev |
| F3 — useDirtyState hook + tab-switch interceptor | ❌ | dev |
| F4 — disconnect confirms (Gmail, Calendar, ClaudeCode, PIN) | ❌ | dev |
| F5 — brain-delete confirm standardized | ❌ | dev |
| F6 — BillingTab visible to non-admin paying users | ❌ | dev |
| URL_ALIASES covers all 12 legacy keys | ✅ | — |
| Lazy-load per tab + visit-on-hover | ✅ | — |
| OAuth-return params route to Connections | ✅ | — |
| Admin gate uses fresh JWT | ✅ | — |
| No native confirm/alert/prompt anywhere in settings | ✅ | — |
| Mobile sticky tab strip + safe-area padding | ✅ | — |
| iOS rubber-band fix in mobile @media query | ✅ | — |

---

## Method

- Read `src/views/SettingsView.tsx` (full, 730 lines).
- Read every file in `src/components/settings/*.tsx` — full reads for AccountTab, BrainTab, DangerTab, BillingTab, SecurityTab, AppearanceTab, SettingsRow; partial reads (top 100-280 lines) for GmailSyncTab, CalendarSyncTab, ClaudeCodeTab, DataTab, AITab, AppLockSection, ProvidersTab.
- Read `src/components/ConfirmDialog.tsx` (uncommitted file per git status).
- Grep `window\.confirm|window\.alert|window\.prompt|\bconfirm\(` across the settings folder — only comments + one function-named `confirm()` in ProfileTab.tsx:1462 (out of scope).
- Grep `URL_ALIASES|\?tab=` across `src/` — only the SettingsView.tsx hits (line 59, 79).
- Cross-checked legacy keys against the URL_ALIASES map — 10 mappings to 6 sections, plus 2 trivial passthroughs.
- Did not run the app — every finding cites file:line.
- Out of scope (per user prompt): ProfileTab internals, AdminTab internals, SecurityTab vault internals, server-side handlers.

**Audit kicked off by**: user request "evidence-based settings-views audit" on 2026-05-07.
