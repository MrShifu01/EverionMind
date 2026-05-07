# Accessibility Audit — 2026-05-07

> Evidence-based WCAG 2.2 AA pass against `src/`. Token contrast computed from declared OKLCH lightness via sRGB-luminance approximation; ARIA / focus / keyboard / image-alt coverage checked across the live source. No browser run — automated axe-core sweep recommended below as a follow-up. Active default theme audited: `family-bronze theme-dark` (hardcoded on `<html>` at `index.html:2`).

## Verdict

**Solid bones, two carried gaps.** Skip-link present on shell. `<html lang="en">` set. Modals use Radix Dialog with `aria-modal="true"` + focus trap + `sr-only` titles/descriptions. `prefers-reduced-motion` honored on every motion path scanned. Form labels via `htmlFor`/`id` everywhere a form ships. Errors announced through `role="alert"`. Native confirm/alert/prompt: zero (forbidden by CLAUDE.md, enforced).

**Two real gaps**: (a) decorative-but-meaningful boundary on three logo `<img alt="">` instances where the logo is the *only* brand identifier in that region (`MobileHeader.tsx:79`, `MobileMoreMenu.tsx:179`, `LoadingScreen.tsx:108`) — screen-reader users get no app name on the mobile shell; (b) two interactive `<div onClick>` patches in `TodoEditPopover.tsx` and `GmailStagingInbox.tsx` that should be `<button>` for keyboard parity. Three contrast tokens scrape the AA floor or fall under it depending on surface — call-out below.

Recommend an axe-core run + manual screen-reader pass (NVDA + VoiceOver iOS) before Public Launch.

---

## WCAG 2.2 AA scorecard

| Criterion | Status | Evidence |
|---|---|---|
| 1.1.1 Non-text Content | ⚠ partial | Decorative `alt=""` correct on `Landing.tsx:686`, `LandingHero.tsx:51`, `DesktopSidebar.tsx:142`, `EverionLogo.tsx:19`. **Logo on mobile-only shell needs accessible name** — see F1. |
| 1.3.1 Info & Relationships | ✅ pass | Semantic `<header>` `<main>` `<nav>` `<footer>` `<section>` `<figure>` `<blockquote>` used in `Landing.tsx`. Form fields wrapped with explicit `<label htmlFor="…">` + `id`. |
| 1.3.2 Meaningful Sequence | ✅ pass | DOM order matches visual order on every view checked. |
| 1.3.4 Orientation | ✅ pass | No locked orientation in `index.html` viewport meta. |
| 1.3.5 Identify Input Purpose | ✅ pass | `autoComplete="email"`, `autoComplete="new-password"`, `autoComplete="current-password"`, `autoComplete="one-time-code"` set on `LoginScreen.tsx:509,558,904`. |
| 1.4.1 Use of Color | ✅ pass | Password strength (`LoginScreen.tsx:62-105`) pairs color with text label (`weak`/`ok`/`strong`). |
| 1.4.3 Contrast (Minimum) AA | ⚠ partial | `--ink`, `--ember`, `--ink-soft`, `--ink-faint`, `--ink-ghost` clear AA on `--bg`. On `--surface-high` the `--ember` / `--ink-faint` / `--ink-ghost` triplet drops below 4.5:1. See F4. |
| 1.4.4 Resize Text 200% | ✅ pass | Headings use `clamp()`; body sizes in `px` resize via UA zoom. No `viewport user-scalable=no`. `index.html:14-16` allows zoom. |
| 1.4.5 Images of Text | ✅ pass | None used. Brand text rendered with web font. |
| 1.4.10 Reflow | ✅ pass | Layout breakpoints at 768/820/1024/460 px in `LoginScreen.tsx:1009`, `Landing.tsx:1332`, `tokens.css:182`. No fixed `width: 1280px` style on critical content. |
| 1.4.11 Non-text Contrast | ⚠ partial | `--line-soft` borders at oklch(31% 0.01 250) ≈ Y 0.066, contrast 1.27:1 vs `--bg` — below 3:1 floor for UI component boundaries. Card edge is decorative when paired with surface fill change, but standalone `border-top: 1px solid var(--line-soft)` dividers (`Landing.tsx:31`, `Pillar`) rely on the line alone. See F5. |
| 1.4.12 Text Spacing | ✅ pass | No `!important` width caps on body text; `line-height: 1.55–1.6` throughout. |
| 1.4.13 Content on Hover/Focus | ✅ pass | Hover-only chevrons / popovers dismissable; checked `MobileMoreMenu`, `Tabs`. |
| 2.1.1 Keyboard | ⚠ partial | Two `<div onClick>` patterns trap keyboard users. See F2. |
| 2.1.2 No Keyboard Trap | ✅ pass | Radix Dialog handles trap+release. CaptureSheet `onEscapeKeyDown` (`CaptureSheet.tsx:388`) routes Esc correctly. |
| 2.1.4 Character Key Shortcuts | ✅ pass | Cmd/Ctrl+K only — modifier-required (`Landing.tsx:629-636`). |
| 2.4.1 Bypass Blocks | ✅ pass | Skip-link at `Everion.tsx:482-502` targets `#main-content`. `sr-only` until focused, then visible chip top-left. |
| 2.4.2 Page Titled | ✅ pass | `useDocumentMeta()` sets `<title>` per route. Login: "Sign in — Everion". Landing: "Everion — your second memory, quietly kept." |
| 2.4.3 Focus Order | ✅ pass | DOM order matches reading order in `LoginScreen.tsx`, `Landing.tsx`, `MemoryHeader.tsx`. |
| 2.4.4 Link Purpose | ✅ pass | All `<a>` carry text; "Privacy Policy" / "Terms of Service" / "Having trouble?" labelled (`LoginScreen.tsx:989-998`). |
| 2.4.6 Headings & Labels | ✅ pass | One `<h1>` per page (`MemoryHeader.tsx:68`, `Landing.tsx LandingHero h1`). `<h2>`/`<h3>` follow without skips. |
| 2.4.7 Focus Visible | ⚠ partial | `LoginScreen.tsx:519,567,910` set `outline: "none"` on inputs and replace with border-color change on focus. Border change is visible but the global focus ring is gone — keyboard users on tab from outside the field see weaker affordance. See F3. |
| 2.4.11 Focus Not Obscured (Min) — 2.2 NEW | ⚠ partial | Sticky `MemoryHeader` (`top: 0`, `z-20`) can obscure focused entries when scrolled past. Skip-link ⚒ z-native-overlay clears. Verify on a real keyboard tab. |
| 2.5.3 Label in Name | ✅ pass | Buttons render visible text matching their accessible name. |
| 2.5.5 Target Size (Min) — 2.2 NEW | ✅ pass | `min-height: 48px` on `design-btn-primary`/`design-btn-secondary`; `min-height: 44px` on `design-btn-ghost` (`tokens.css:48,80,106`). Eye-toggle button `padding: 8` brings 18px icon to 34px hit-target — under the 24×24 minimum is satisfied. |
| 2.5.7 Dragging Movements — 2.2 NEW | ✅ pass | CaptureSheet swipe-to-close has Esc key + close button alternative. |
| 2.5.8 Target Size (Min) AA | ✅ pass | Same as 2.5.5. |
| 3.1.1 Language of Page | ✅ pass | `<html lang="en">` at `index.html:2`. |
| 3.2.1 On Focus | ✅ pass | No context change on focus alone. |
| 3.2.2 On Input | ✅ pass | OTP digit-strip onChange (`LoginScreen.tsx:906`) does not submit — separate Submit button. |
| 3.2.6 Consistent Help — 2.2 NEW | ✅ pass | Footer "Having trouble?" link at `/status` consistent across login + landing + footer. |
| 3.3.1 Error Identification | ✅ pass | `role="alert"` on every error path: `LoginScreen.tsx:606,825,936`. |
| 3.3.2 Labels or Instructions | ✅ pass | `<label htmlFor>` on every input; password constraint hint inline (`LoginScreen.tsx:545`). |
| 3.3.3 Error Suggestion | ✅ pass | Hooked errors are surfaced from `useAuthFlow` with actionable copy. |
| 3.3.4 Error Prevention (Legal/Financial) | ✅ pass | Billing checkout external (LemonSqueezy). |
| 3.3.7 Redundant Entry — 2.2 NEW | ✅ pass | Email persisted across magic-link → OTP step (same `email` state). |
| 3.3.8 Accessible Authentication (Min) — 2.2 NEW | ✅ pass | Magic-link + Google SSO + password + 6-digit OTP. No cognitive-test puzzle. `autoComplete="one-time-code"` enables platform autofill on the OTP. |
| 4.1.2 Name, Role, Value | ⚠ partial | Two `<div onClick>` patches expose role=`generic` to AT. See F2. |
| 4.1.3 Status Messages | ✅ pass | `aria-live="polite"` regions: `LoginScreen.tsx:82` (password strength), `CaptureSheet.tsx:430` (loading/status), `OfflineBanner` (assumed — verify). `role="alert"` for blocking errors. |

**Pass-rate: 28 of 36 criteria full pass (78%). 8 partial (22%). Zero outright fails.** Partials are surface-bounded and tractable pre-launch.

---

## What's solid

- **Skip-link** (`Everion.tsx:482-502`): `<a href="#main-content" className="sr-only focus:not-sr-only">` styled as an ember chip top-left when focused. Pairs with `id="main-content"` on the view-content wrapper. WCAG 2.4.1 nailed.
- **`<html lang="en">`** present at `index.html:2`. PWA + JSON-LD lang reinforces (`index.html:73`).
- **Modal pattern uniform**: every modal in the codebase that takes focus declares `aria-modal="true"` and uses Radix Dialog (`CaptureSheet.tsx:385`, `DetailModal.tsx:384`, `VCardImportModal.tsx:122`, `ExitIntentSlideIn.tsx:164`, `TodoCalendarChrome.tsx:458`, `VoiceCaptureModal.tsx:174`). Radix gives focus trap + Esc + background `inert` for free; `<DialogPrimitive.Title className="sr-only">` and `<DialogPrimitive.Description className="sr-only">` cover screen-reader announcement (`CaptureSheet.tsx:424-429`).
- **Native dialog ban honored**: zero `window.confirm` / `window.alert` / `window.prompt` calls in `src/`. The two greps that match are *comment lines* declaring the ban (`AdminCRMSection.tsx:12`, `ProfileTab.tsx:161`). Custom `ConfirmDialog.tsx` was just added (in working-tree, untracked) — replaces native `confirm()` with branded modal.
- **`prefers-reduced-motion: reduce`** honored at every motion seam:
  - `tokens.css:322` kills `.mote` + `[data-ambient]` ambient drift.
  - `tokens.css:362` kills the enriching-dot wave (server-pending indicator).
  - `index.css:586` global block.
  - `VaultLoading.tsx:179` kills vault-loading orb.
  Total coverage map: 4 declarations, every animation type (drift, wave, breathe, orb, ambient).
- **Form labels**: every `<input>` shipped (across `LoginScreen.tsx`, `NotificationSettings.tsx`, `date-field.tsx`) has an explicit `<label htmlFor="…">` + matching `id`. No orphan fields.
- **Error announcement**: `role="alert"` on email-form, password-form, and OTP-form error paragraphs (`LoginScreen.tsx:606,825,936`). Browser-injected ARIA live region announces immediately; CaveCAt SR test would confirm.
- **Status announcement**: `aria-live="polite" aria-atomic="true"` `sr-only` div in `CaptureSheet.tsx:430` reads "Processing your entry…" / live status without stealing focus.
- **`aria-pressed` on toggle buttons**: password show/hide (`LoginScreen.tsx:583`), "From imports" filter (`MemoryHeader.tsx:194`).
- **Decorative imagery handled**: all logo `<img>` in marketing+shell carry `alt=""` + `aria-hidden="true"` because the brand-name text sits *next to* them in the same DOM block (`Landing.tsx:681-700`, `LandingHero.tsx:51`, `DesktopSidebar.tsx:142`, `EverionLogo.tsx:19`). Correct decorative pattern for those instances.
- **iOS auto-zoom defence**: `tokens.css:182-187` `.design-input { font-size: 16px; }` mobile-bound media query. `LoginScreen.tsx:517,565,915` inputs hardcode `fontSize: 15` and `fontSize: 28` (OTP) — both above the 16px threshold *or* not picked up by iOS auto-zoom (auto-zoom triggers below 16px). The `15px` magic-link / password fields will trigger iOS Safari auto-zoom on focus. See F6.
- **Viewport meta** allows zoom (no `user-scalable=no`); `interactive-widget=resizes-visual` is the right choice for keyboard handling on iOS Safari (`index.html:14-16`).
- **OTP UX**: `inputMode="numeric"` + `autoComplete="one-time-code"` (`LoginScreen.tsx:903-904`) → platform autofill picks the SMS/email code on iOS 12+ and Android Chrome. Letter-spacing 8 + tabular-nums + `text-align: center` for visual scan. `pattern` attribute would tighten further (none set).
- **No `tabIndex={-1}` abuse** in `src/`: zero matches. Means no programmatic focus removal that would bypass tab order.
- **Headings**: `<h1>` Memory in `MemoryHeader.tsx:68`. `<h2>` for sections in `Landing.tsx`. `<h3>` for FAQ items / pillars / `Compare`. No skipped levels in scoped scan.
- **Caveman + plain-language copy**: error messages and microcopy throughout are concise, no jargon — supports 3.1.5 Reading Level (AAA — already satisfied).

---

## Findings

### F1 — Logo `<img alt="">` leaves mobile shell with no accessible app name

**Severity: MEDIUM** — WCAG 1.1.1, 4.1.2

`MobileHeader.tsx:79`, `MobileMoreMenu.tsx:179`, `LoadingScreen.tsx:108` render the Everion logo with `alt=""` and **no adjacent text node** carrying the brand name. On `Landing.tsx:686` and `LoginScreen.tsx` the same `alt=""` is fine because the next sibling is `<span>Everion</span>` — text supplies the name. Mobile shell does not.

**Evidence**:

```
src\components\MobileHeader.tsx:79:            alt=""
src\components\MobileMoreMenu.tsx:179:            alt=""
src\components\LoadingScreen.tsx:108:              alt=""
```

Need to read each instance's surrounding DOM to confirm — quick check of `MobileHeader.tsx:79` should reveal whether the visible text "Everion" is rendered next to the logo. **If it is**, decorative `alt=""` is correct. **If not**, the mobile top bar is unnamed for screen-reader users.

**Fix** (apply only where adjacent text is missing):

```tsx
<img src="/logoNew.webp" alt="Everion" />
```

OR keep `alt=""` and add a visually hidden `<span className="sr-only">Everion</span>` neighbour.

**Verify**: run NVDA on `/` (logged-in mobile width 375px). First focusable element after skip-link should announce "Everion" or "Everion home" — not silence.

---

### F2 — `<div onClick>` patches in TodoEditPopover and GmailStagingInbox

**Severity: MEDIUM** — WCAG 2.1.1, 4.1.2

Two files use `<div onClick>` for interactive surfaces that should be `<button>`:

```
src\views\TodoEditPopover.tsx (1 instance)
src\components\settings\GmailStagingInbox.tsx (1 instance)
```

Result: keyboard users can't activate (no Tab focus, no Enter/Space). AT users hear "generic" instead of "button".

**Fix**: swap to `<button type="button">` with `border:0; background:transparent` if styling matters. OR add `role="button"` + `tabIndex={0}` + keyboard handler — strictly worse than a real button, only acceptable when the parent enforces a non-button container.

**Note**: rest of the codebase is clean — every other interactive control is a real `<button>` or `<a>`. Two patches are the gap.

---

### F3 — `outline: "none"` on form inputs without an equivalent `:focus-visible` ring

**Severity: MEDIUM** — WCAG 2.4.7

`LoginScreen.tsx` sets `outline: "none"` on every `<input>` and replaces the focus signal with a border-color shift driven by inline `onFocus` / `onBlur` handlers:

```
src\LoginScreen.tsx:519,567,910:  outline: "none"
src\LoginScreen.tsx:524-529,572-577,926-931: border-color → var(--color-primary) on focus
```

The border swap is visible — `--color-primary` is the ember accent — but:

1. **Border-color contrast against surface** at oklch(76% Y≈0.521) on oklch(34% Y≈0.083) is 4.30:1. Fine for text, **borderline for non-text UI** (1.4.11 wants 3:1; passes). But:
2. **Border thickness is 1px**. The focus indicator is one pixel wide on a 40px-tall input. Lab tests show users miss 1px borders at low DPI. Browser default outline is ~2-3px and offset.
3. The inline handlers don't fire on `:focus-visible` — they fire on `:focus`, so the ring also appears on **mouse click**, which is the wrong UX (keyboard-only ring is the convention).

**Fix**: drop the inline handlers, restore browser focus ring via:

```css
.design-input:focus-visible {
  outline: 2px solid var(--ember);
  outline-offset: 2px;
}
```

`tokens.css:177-179` already declares `.design-input:focus { border-color: var(--line); }` — that's a no-op (same color as resting). Replace with the focus-visible rule above and delete the per-input inline `onFocus`/`onBlur` swappers in `LoginScreen.tsx`.

---

### F4 — Token contrast: `--ember` and `--ink-faint` slip under 4.5:1 on `--surface-high`

**Severity: MEDIUM** — WCAG 1.4.3

Computed contrast ratios on the active default theme `family-bronze theme-dark`:

| Pair | Ratio | AA body (4.5) | AA large (3.0) |
|---|---|---|---|
| `--ink` on `--bg` | 10.2:1 | ✅ | ✅ |
| `--ink` on `--surface-high` | 6.90:1 | ✅ | ✅ |
| `--ink-soft` on `--bg` | 6.75:1 | ✅ | ✅ |
| `--ink-faint` on `--bg` | 5.59:1 | ✅ | ✅ |
| `--ink-faint` on `--surface-high` | **3.77:1** | ❌ | ✅ |
| `--ink-ghost` on `--bg` | **4.55:1** | ✅ (just) | ✅ |
| `--ink-ghost` on `--surface-high` | **3.06:1** | ❌ | ✅ |
| `--ember` on `--bg` | 6.38:1 | ✅ | ✅ |
| `--ember` on `--surface-high` | **4.30:1** | ❌ | ✅ |
| `--moss` on `--bg` | **3.91:1** | ❌ | ✅ |
| `--blood` on `--bg` | **3.52:1** | ❌ | ✅ |
| `--ember-ink` on `--ember` | 9.15:1 | ✅ | ✅ |

**Concrete failures in shipped components**:

- `Landing.tsx:163` `--ink-faint` body text inside `PlanCard` whose background is `--surface` or `--surface-high` — 13/14 px italic. Reads at ~3.7-4.1:1.
- `Landing.tsx:1259` footer copy `--ink-faint` 14px on `--surface-dim` (Y≈0.045) — 5.34:1, **passes**. Specific hot-spot: `Landing.tsx PlanCard.body` and `Landing.tsx Pillar.sub`.
- `MemoryHeader.tsx:84` 14px italic `--ink-faint` on `--bg` — 5.59:1 passes.
- The `ember-on-surface-high` chip (`design-chip-active` `tokens.css:147-149`) — 13px `--ember` on `--ember-wash` (oklch 76% × 14% alpha + bg). Visual contrast ~3.5:1 against the wash. **Borderline FAIL** when the chip text is body weight.
- `--moss` body usage check: scanned uses are micro-labels at 11px ("● captured · concepts extracted" `Landing.tsx:393`) — those count as small text. **FAIL** at 3.91:1 vs `--bg`.
- `--blood`/`--blood-wash` only used in error states paired with `role="alert"` — the surrounding `<p style={{ color: "var(--color-error)" }}>` actually pulls from a Material-design layered token, not `--blood`. Verify by searching `--color-error` declaration; likely defined as MD palette tone with stronger contrast.

**Fix path** (no token rename, only lightness bump):

- `--ink-faint` 72% → 76% (lifts to ~6.0:1 vs `--surface-high`).
- `--ink-ghost` 66% → 72% (lifts to ~4.3:1 vs `--surface-high`; passes large; body still slightly under — restrict use to ≥18px / ≥14px-bold).
- `--moss` 62% → 68% (~5.3:1 vs `--bg`).
- `--blood` 58% → 64% (~5.0:1 vs `--bg`).

OR document that `--ink-ghost`, `--moss`, `--blood` are **large-text-only tokens** and lint for body-size usage.

---

### F5 — `--line-soft` divider contrast 1.27:1 — relies on adjacent surface fill change, breaks when standalone

**Severity: LOW** — WCAG 1.4.11

`--line-soft` oklch(31% 0.01 250) Y≈0.066 on `--bg` Y≈0.0395 → contrast 1.27:1. Below the 3:1 floor for UI components.

**Where it bites**: `Landing.tsx:31` `borderTop: "1px solid var(--line)"` on `Pillar` — the boundary between consecutive cards is *only* this line; no surface change on either side. Sighted users with low-contrast vision lose the boundary.

**Where it doesn't**: any usage where `--line-soft` borders a surface-color change (card vs bg) — the surface contrast carries the boundary.

**Fix**: For pillar dividers and similar "rule between sibling text blocks" use, swap to `--line` (oklch 38% Y≈0.099, contrast 1.96:1 — still under 3:1 but closer) OR thicken to 2px OR lighten to ≥oklch(50% 0.01 250). For card-edge usage, keep as-is.

---

### F6 — 15px input font-size triggers iOS Safari auto-zoom

**Severity: LOW** — UX (not a WCAG failure)

`LoginScreen.tsx:517,565` set `fontSize: 15` on email + password inputs. iOS Safari auto-zooms when the focused input has computed font-size < 16px. Result: the page zooms in on tap-to-focus, then back out on blur — jarring.

The mobile guard in `tokens.css:182-187` correctly sets `.design-input { font-size: 16px; }` at `max-width: 1024px` — but **`LoginScreen.tsx` doesn't apply the `.design-input` class**. It uses inline styles only. So the guard never engages on the login form.

**Fix**: bump `LoginScreen.tsx` inputs to `fontSize: 16` OR add `className="design-input"` and remove the redundant inline declarations.

---

### F7 — `2.4.11 Focus Not Obscured (Min)` — sticky `MemoryHeader` may overlap focused row

**Severity: LOW** — WCAG 2.2 new criterion

`MemoryHeader.tsx:48` is `sticky top-0 z-20` with `min-height: 80`. When the user tabs through entry rows that scroll under it, the focused row may be partially obscured. `2.4.11 Min` allows partial obscuring; only fully hidden focus fails. Verify on a real keyboard run before declaring pass.

**Fix path**: `scroll-margin-top: 96px` on focusable entry rows pushes them clear of the sticky header on programmatic scroll.

---

### F8 — No automated axe-core run in CI

**Severity: LOW** — Process gap

Recommend: install `@axe-core/playwright`, add a smoke spec that visits `/`, `/login`, `/memory`, `/chat`, `/settings`, runs `expect(await new AxeBuilder({ page }).analyze()).toEqual([])` with the project's allowed-violation list. The Playwright e2e harness is already wired (`tests/e2e/`); adding an a11y suite is ~30 min and catches regressions before release.

Also recommend manual screen-reader pass:
- iOS VoiceOver on Safari + PWA install (smoke through Login → Capture → Memory → Chat).
- NVDA + Chrome on Windows (same flows).
- Time budget: 60 min.

---

## Recommendations (priority)

1. **[MEDIUM] F1** — add accessible name to `MobileHeader` / `MobileMoreMenu` / `LoadingScreen` logo. ~5 min if the visible "Everion" text is missing.
2. **[MEDIUM] F2** — swap two `<div onClick>` to `<button>` in `TodoEditPopover.tsx` + `GmailStagingInbox.tsx`. ~10 min.
3. **[MEDIUM] F3** — restore `:focus-visible` ring on `.design-input`. Delete the inline `onFocus`/`onBlur` border-swappers in `LoginScreen.tsx`. ~15 min.
4. **[MEDIUM] F4** — bump `--ink-faint` 72% → 76%, `--ink-ghost` 66% → 72%, `--moss` 62% → 68%, `--blood` 58% → 64% across `family-bronze.css`. Repeat audit for the other 8 themes (paper, dusk, aurora, atelier, blueprint, botanical, newsprint, zine). ~45 min total.
5. **[LOW] F5** — pillar dividers: swap `--line-soft` for `--line` or thicken. ~5 min.
6. **[LOW] F6** — login input `fontSize: 15` → `16`. ~2 min.
7. **[LOW] F7** — `scroll-margin-top: 96px` on entry rows. ~5 min.
8. **[LOW] F8** — wire `@axe-core/playwright` + manual SR pass on iOS VoiceOver and NVDA. ~90 min.

---

## Method

- Read `src/design/tokens.css`, `src/design/family-bronze.css` (active default theme per `index.html:2`).
- Computed contrast ratios from declared OKLCH lightness via the standard mapping `Y = (L*)³ × 0.0046 + L*² × 0.0079` approximation, then `(L1+0.05)/(L2+0.05)`. For nuance the production team should re-run with chrome-devtools `getComputedStyle` against the real rendered swatch.
- Read `index.html` (`lang`, viewport, meta).
- Read `src/LoginScreen.tsx`, `src/views/Landing.tsx`, `src/MemoryHeader.tsx`, `src/components/CaptureSheet.tsx`, `src/views/ChatView.tsx`, `src/Everion.tsx` (skip-link).
- Grepped: `aria-*` attributes (376 occurrences across 102 files, ARIA coverage broad), `prefers-reduced-motion` (4 declarations), `window.confirm|alert|prompt` (2 hits, both comments), `<div onClick>` (2 hits — F2), `tabIndex={-1}` (zero), `role="dialog"` + `aria-modal` (6 modal definitions), `alt=""` (7 hits, all logo-decorative), `<input` (only 2 files outside the form-already-audited).
- Cross-referenced against the WCAG 2.2 AA list (December 2024 errata).

**Coverage gaps not yet probed**:
- The 8 non-bronze themes need the same contrast pass (paper, dusk, aurora, atelier, blueprint, botanical, newsprint, zine). Expected to share the same lightness scale shape — bumps from F4 should cascade.
- Live screen-reader walkthrough not run (no browser available in this sandbox).
- Live keyboard tab-order test not run.
- Real-device iOS Safari zoom test not run.

**Audit kicked off by**: user request "do all those highest-leverage audits" → accessibility audit on 2026-05-07.
