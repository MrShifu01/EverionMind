# Audit Rollup — Batch 4 (2026-05-07)

> Findings from the fourth-batch audits — landing, login-signup, memory-grid, detail-modal, capture-sheet, vault-view, chat-view, todo-view, settings-views, profile-tab. Per-surface UI deep cuts. Pending merge into `TODO-AUDIT-FIXES.md` after batch-1/2/3 close.
>
> **Status legend:** [ ] open · [x] done · [~] in progress · [-] deferred (post-launch).
> **Source link:** `{audit}` → `EML/Audits/{audit}-audit-2026-05-07.md`

---

## Roll-up by audit

| Audit | Verdict | HIGH | MED | LOW | File |
|---|---|---:|---:|---:|---|
| landing | bones solid; 4 ship-blockers | 4 | 5 | 7 | `landing-audit-2026-05-07.md` |
| login-signup | iOS auto-zoom + no forgot-password | 2 | 4 | 3 | `login-signup-audit-2026-05-07.md` |
| memory-grid | virtualizer correct; no scroll-restore | 0 | 3 | 5 | `memory-grid-audit-2026-05-07.md` |
| detail-modal | god comp; stale-clobber + vault-reveal | 2 | 3 | 3 | `detail-modal-audit-2026-05-07.md` |
| capture-sheet | offline+voice solid; PDF size unbounded | 2 | 3 | 2 | `capture-sheet-audit-2026-05-07.md` |
| vault-view | recovery dismiss too easy; clipboard only | 2 | 2 | 4 | `vault-view-audit-2026-05-07.md` |
| chat-view | non-streaming, no `res.ok` check | 1 | 4 | 7 | `chat-view-audit-2026-05-07.md` |
| todo-view | engine A−; TZ + race + recurrence | 4 | 2 | 3 | `todo-view-audit-2026-05-07.md` |
| settings-views | shell solid; save semantics drift | 0 | 2 | 5 | `settings-views-audit-2026-05-07.md` |
| profile-tab | sane; no virtualizer + no undo | 0 | 3 | 4 | `profile-tab-audit-2026-05-07.md` |
| **Totals** | — | **17** | **31** | **43** | 91 findings |

---

## Phase D0 — Fix today (one-line, all HIGH) · ~1 hour

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| D0.1 | HIGH | [ ] Canonical mismatch — `index.html:30` says `everionmind.com`, `Landing.tsx:623` says `everion.smashburgerbar.co.za`. JS-render crawlers see different canonical from non-JS. SEO equity splits. Pick one (custom domain) and align both | `index.html:30` · `src/views/Landing.tsx:623` | landing F1 |
| D0.2 | HIGH | [ ] Hero CTA routes to login, not signup. `LandingHero.tsx:145` is the visually dominant above-fold button — calls `onAuth("login")`. ProductHunt cold traffic → zero accounts. Conversion blocker | `src/views/LandingHero.tsx:145` | landing F2 |
| D0.3 | HIGH | [ ] `useChat.ts:99-130` doesn't check `res.ok`. Server returns `429 {error:"monthly_limit_reached", upgrade_url}` for free-tier quota; client renders literal `"No response."` because `data.reply` is undefined. User hits dead-end at the most-important paid moment | `src/hooks/useChat.ts:99-130` | chat-view F1 |
| D0.4 | HIGH | [ ] `dismissRecoveryKey` is one click — no checkbox, no confirm. Mis-tap = recovery key gone forever. Add "I've saved my recovery key" checkbox gate before the dismiss button enables | `src/views/VaultUnlocked.tsx` (dismiss handler) | vault-view F1 |
| D0.5 | HIGH | [ ] Five login/reset inputs at `fontSize: 15`. iOS Safari auto-zooms <16 px on focus. `LoginScreen.tsx:517,565,808` + `ResetPasswordView.tsx:117 ×2` | five sites | login-signup F1 |

---

## Phase D1 — Pre-launch HIGH blockers

### D1A — landing-page launch readiness

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| D1A.1 | HIGH | [ ] Pricing inconsistency. JSON-LD `index.html:91-98` says Pro = `$6` with "14-day trial". Page + BillingTab + ChatView say `$9.99` with no trial. JSON-LD lists 2 tiers; page renders 4. AI Overviews + Perplexity will cite wrong price. Realign JSON-LD to live tiers | `index.html:91-98` | landing F3 |

### D1B — login-signup recovery + enumeration

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| D1B.1 | HIGH | [ ] No "Forgot password?" entry point. `App.tsx:180` mounts `ResetPasswordView` on hash recovery tokens, but **zero calls to `supabase.auth.resetPasswordForEmail()`** exist in `src/`. Locked-out users have no in-app path; every recovery = support ticket | `src/LoginScreen.tsx` (add Forgot link) | login-signup F2 |

### D1C — detail-modal stale data + vault reveal

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| D1C.1 | HIGH | [ ] `useState(entry.title)` only seeds on mount — no resync on prop change. Background poll updates `entry`; user opens edit, types over stale base, hits Save → silent clobber of fresher fields. Read-side preview also frozen at mount-time content. Fix: `useEffect([entry, editing])` + inline conflict banner | `src/views/DetailModal.tsx` (mount effect + :854 read-side) | detail-modal F1 |
| D1C.2 | HIGH | [ ] Vault reveal accepts session-cached `cryptoKey` only. No fresh PIN, no biometric step-up, no `audit_log` row when a secret is revealed. Phone left unlocked = every secret one tap away with zero forensics. Fresh-PIN gate on >5 min stale reveals + new `POST /api/audit/vault-reveal` | `src/views/DetailModal.tsx` (reveal handler) | detail-modal F2 |

### D1D — capture-sheet file safety

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| D1D.1 | HIGH | [ ] `IMAGE_MAX_BYTES = 5 MB` cap exists ONLY for images. Doc/PDF/xlsx path through `extractTextFromFile` has zero size guard. 50 MB PDF gets fully buffered in `arrayBuffer()` + pdfjs internal copy. Low-RAM Android OOMs silently. Add per-type cap before parse | `src/hooks/useCaptureSheetParse.ts:619-622` (extend) | capture-sheet F1 |
| D1D.2 | HIGH | [ ] `accept` attribute is a hint, not a contract. No magic-bytes sniffing. `stripHtml` regex is the only sanitisation on HTML files. Prompt-injection content can ride into Gemini classifier. Add `file-type` magic-bytes sniff + reject mismatched MIME | `src/hooks/useCaptureSheetParse.ts` | capture-sheet F2 |

### D1E — vault-view recovery flow

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| D1E.1 | HIGH | [ ] Recovery-key UX is clipboard-copy only. No print, no `.txt` download, no PDF. For data shown ONCE, this forces screenshot or paste-into-notes (both bad). Add print + download buttons | `src/views/VaultUnlocked.tsx` (recovery panel) | vault-view F2 |

### D1F — todo-view correctness

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| D1F.1 | HIGH | [ ] Every `toDateKey` / `new Date()` reads device-local TZ, not user-profile TZ. No `user_profiles.timezone` column exists. Cross-device midnight straddles → todos on wrong day. `mondayKey` memo deps `[]` so "today" never refreshes in long-open tab. Pre-international-beta blocker | `src/views/TodoView.tsx` + new column | todo-view F1 |
| D1F.2 | HIGH | [ ] `toggleDone` (`TodoRowItem.tsx:65-79`) has no in-flight lock and no idempotency key. Double-tap during in-flight PATCH races; network reordering can land wrong final status. Easy on mobile | `src/components/TodoRowItem.tsx:65-79` | todo-view F2 |
| D1F.3 | HIGH | [ ] Recurrence has no `until` cap. Recurring entries never expire. `getActionPlacements` skips recurrence expansion — "every Monday" never shows on Today's view. Spec-decision needed for per-instance completion | `src/lib/placements.ts` (or equivalent) | todo-view F4 |
| D1F.4 | HIGH | [ ] `bumpDueDate` (swipe-left "+1d") writes `due_date` only, never `scheduled_for`. `getPlacements` reads `scheduled_for` first → swiped entry ghosts on original day AND appears on day+1. One-line fix to write both | `src/views/TodoView.tsx` (bumpDueDate handler) | todo-view F5 |

---

## Phase D2 — Pre-launch MEDIUM hardening

| # | Severity | Fix | Source |
|---|---|---|---|
| D2.1 | MEDIUM | [ ] Account-enumeration via error copy. `src/lib/friendlyError.ts:11-12` returns "There's already an account with that email" — distinguishes registered vs unregistered. Generic "If an account exists for this email, we sent a code" | login-signup F4 |
| D2.2 | MEDIUM | [ ] Inputs ship `outline:none` with only 1px border-color cue for focus. Add `:focus-visible` ring across LoginScreen + ResetPasswordView | login-signup F3 |
| D2.3 | MEDIUM | [ ] Privacy + ToS links present at `fontSize:11` × `opacity:0.6` — illegible. Bump to 13 px / opacity 0.75 | login-signup F6 |
| D2.4 | MEDIUM | [ ] No scroll-restore. View-switch Memory ↔ Timeline remounts `main-content` via `key={appShell.view}` (`Everion.tsx:622`); virtualizer re-instantiates, scrollTop resets. Modal close fine, tab switch isn't | memory-grid F2 |
| D2.5 | MEDIUM | [ ] Filter pipeline O(n) per keystroke over up to 5000 entries. `searchIndex` flat token-map scan. Borderline today; degrades past 5 k | memory-grid F1 |
| D2.6 | MEDIUM | [ ] No keyboard row navigation on memory grid. Tab + Enter works but no arrows / `j/k` / roving tabindex / `role="grid"`. 5000 cards = 5000 tab stops | memory-grid F3 |
| D2.7 | MEDIUM | [ ] DetailModal god-component (1,590 LOC). 4 high-confidence extractions (`KeepThisPanel`, `EntryActionToolbar`, `EntryContentSection`, `EntryEditForm`) drop ~470 LOC zero-behaviour-change | detail-modal F3 |
| D2.8 | MEDIUM | [ ] Vault toggle does NOT re-encrypt content. note → secret leaves plaintext on server; secret → note leaves ciphertext as a regular note. Re-encrypt on toggle, or refuse the operation | detail-modal F4 |
| D2.9 | MEDIUM | [ ] Failed save still calls `setEditing(false)` — user thinks save landed | detail-modal F5 |
| D2.10 | MEDIUM | [ ] pdfjs worker URL init has no try/catch. If worker fails to resolve (CORS, 404, Capacitor scope), pdfjs silently parses on main thread → seconds of UI freeze on big PDFs | capture-sheet F3 |
| D2.11 | MEDIUM | [ ] Two separate PIN stores: `lib/pin.ts` (4-digit, used by `SecurityTab`) and `lib/vaultPinKey.ts` (6-digit / 4–8 valid, used by vault unlock). Setting "Vault PIN" in Settings does NOT change vault-unlock PIN. Unify to one source | vault-view F3 |
| D2.12 | MEDIUM | [ ] No recovery-key rotation UI. Lost-key users have no in-app re-issue | vault-view F4 |
| D2.13 | MEDIUM | [ ] No `AbortController` anywhere in chat. Brain switch mid-request corrupts: stale fetch resolves, `setMessages` overwrites brain B's view with brain A's reply | chat-view F2 |
| D2.14 | MEDIUM | [ ] `useEffect [messages, loading] → scrollIntoView` fires unconditionally. No user-scroll check. Violates "don't fight the user" rule | chat-view F3 |
| D2.15 | MEDIUM | [ ] No streaming, no Stop button, no virtualization. Acceptable for launch but document the gap; long chats will jank | chat-view F4 (compound) |
| D2.16 | MEDIUM | [ ] Rate-limit feedback absent — 429 from `/api/llm` not mapped to UI countdown | chat-view F5 |
| D2.17 | MEDIUM | [ ] Zero virtualization in any todo tab. Fine at 50 todos, brittle past 500 | todo-view F3 |
| D2.18 | MEDIUM | [ ] `TodoSomedayTab` (1,786 LOC) eagerly imported regardless of `somedayEnabled` flag — 30–50 KB gz wasted on free tier | todo-view F6 |
| D2.19 | MEDIUM | [ ] Save semantics fragmented across settings tabs — 4 distinct patterns (auto-save, save button, form submit, one-click). AccountTab profile writes localStorage *before* server confirm. Write `EML/architecture/settings-conventions.md` and realign outliers | settings-views F2 |
| D2.20 | MEDIUM | [ ] Dirty-state silently dropped on settings tab switch. AccountTab + BrainTab in-row rename + AITab BYOK key entry survive tab switch via `display:none` but user can't see unsaved state. Ship `useDirtyState(scope)` + `ConfirmDialog` interceptor | settings-views F3 |
| D2.21 | MEDIUM | [ ] ProfileTab no virtualization + no `React.memo` on `FactRow`. `CollapsibleSection.Content` mounts children regardless of `collapsed`. 200-fact users pay full DOM cost. Two-line fix: `{!collapsed && children}` + `React.memo(FactRow)` | profile-tab F1+F7 |
| D2.22 | MEDIUM | [ ] Persona retire has no inverse — Rejected has `unrejectFact`, History has only delete. Data layer supports inverse, only icon missing | profile-tab F5 |
| D2.23 | MEDIUM | [ ] ProfileTab refactor pressure — 3 clean extraction seams (`PersonaFactsGrid` ~170 LOC, `PersonaPromptDebug` ~350 LOC, `PersonaActionsPanel` ~200 LOC). Pulling all three drops file 2,219 → ~450 LOC | profile-tab refactor |

---

## Phase D3 — LOW + nits (post-launch acceptable)

| # | Severity | Fix | Source |
|---|---|---|---|
| D3.1 | LOW | [ ] Landing — fabricated testimonials shipped (file comment admits "placeholder, replace post-launch"). FTC §255 risk | landing F5 |
| D3.2 | LOW | [ ] Pro plan promises Claude Sonnet but project AI is Gemini per CLAUDE.md. Update copy or add provider as actual | landing F6 |
| D3.3 | LOW | [ ] `stander.christian@gmail.com` exposed in landing footer. Use a brand inbox | landing F7 |
| D3.4 | LOW | [ ] Hero uses `100vh` not `100dvh` — iOS Safari URL-bar overflow | landing F8 |
| D3.5 | LOW | [ ] LCP hero image not preloaded | landing F9 |
| D3.6 | LOW | [ ] Cmd+K binding has no visible kbd hint despite the code comment claiming one exists | landing F11 |
| D3.7 | LOW | [ ] Landing — 2 more LOWs in source audit | landing F12+ |
| D3.8 | LOW | [ ] Memory-grid: synchronous bootstrap at `useDataLayer.ts:30-42` reads legacy global `openbrain_entries` key, contradicting `entriesCache.ts:103-114` which purges it. Multi-brain users may briefly see wrong-brain rows on cold mount | memory-grid F7 |
| D3.9 | LOW | [ ] Memory-grid 4 more LOWs (skeleton flash, search debounce calibration, etc.) | memory-grid F4–F8 |
| D3.10 | LOW | [ ] Trash restore writes no audit_log row | detail-modal F8 |
| D3.11 | LOW | [ ] Capture-sheet: paste-URL has no metadata enrichment | capture-sheet F6 |
| D3.12 | LOW | [ ] Capture-sheet: VCF + multi-entry split paths bypass `queueDirectSave` and have no offline branch. Share-target not wired in `manifest.json` | capture-sheet F7 |
| D3.13 | LOW | [ ] Vault: cosmetic info-leak on locked subtitle | vault-view F6 |
| D3.14 | LOW | [ ] Vault: missing first-unlock toast | vault-view F8 |
| D3.15 | LOW | [ ] Vault: no brand logo on any vault screen (absence not swap; trust signal) | vault-view F5 |
| D3.16 | LOW | [ ] Chat: punycode look-alikes pass markdown render — XSS-adjacent | chat-view F8 |
| D3.17 | LOW | [ ] Chat — 6 more LOWs in source audit (citations UX, copy button consistency, etc.) | chat-view F6/F7/F9–F12 |
| D3.18 | LOW | [ ] Todo — 3 LOWs in source audit | todo-view F7–F9 |
| D3.19 | LOW | [ ] Settings: `ConfirmDialog` primitive checked in but unused; DangerTab still uses hand-rolled 3-state modal | settings-views F1 |
| D3.20 | LOW | [ ] Settings: `?tab=billing` only shows BillingTab for admins (`SettingsView.tsx:537`). Non-admin paying users hitting deep-link see nothing. Un-gate before launch | settings-views F6 |
| D3.21 | LOW | [ ] Settings — 1 more LOW + 2 VERY-LOW in source audit | settings-views F4/F5/F7 |
| D3.22 | LOW | [ ] Profile: history reads `entries.metadata` not `audit_log` — drift over time | profile-tab F3 |
| D3.23 | LOW | [ ] Profile: text-only loading skeleton | profile-tab F8 |
| D3.24 | LOW | [ ] Profile: no inline duplicate-detection in fact entry | profile-tab F9 |

---

## Limitations carried into batch 4

| Audit | Blocked signal | Re-run trigger |
|---|---|---|
| landing | Lighthouse not run live (config-only); no real-device LCP | CI Lighthouse step pre-launch |
| login-signup | No `SignupModal.tsx` exists — repo has only inline forms in `LoginScreen.tsx`. Brief assumed presence | Documented, no re-run needed |
| memory-grid | No real-device measurement at 5000-entry scale | Beta-week-1 |
| capture-sheet | No mobile / Capacitor live test of file pickers | Beta-week-1 |
| vault-view | No iOS Safari biometric live test | Beta-week-1 |
| chat-view | No long-chat (200+ msg) DOM-size measurement | Beta-week-1 |
| todo-view | No multi-TZ smoke test (cross-device midnight) | International beta |
| profile-tab | No 200-fact perf measurement | After persona-extraction beta data |

---

## Merge plan

When earlier batches close:

1. Append phases D0–D3 into the existing TODO numbering (now A0–D3 across 4 batches).
2. Header update: count of consolidated reports → 39 (12 archived + 27 active = 39 total tracked verticals).
3. Per-finding workflow: when `[x]`, add `## Resolution — YYYY-MM-DD` to source audit + `git mv` to `archive/`.
4. Delete this file once merged; preserve in git history.

---

**File created**: 2026-05-07 by audit batch-4 rollup.
**Maintenance**: keep `[ ]` checkboxes synced with the source audit files.
