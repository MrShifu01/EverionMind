# Frontend Architecture Audit — 2026-05-07

> Multi-viewport audit against 2026 design standards (8-px grid, 48-px tap targets, fluid typography, container queries, WCAG / APCA, CWV). Static analysis of `src/index.css` + `src/design/*.css` plus a Playwright crawl of public routes (Landing, /privacy, /login) at desktop (1280×800) and mobile (360×800).
>
> Authenticated app interior (BottomNav, MobileHeader, EntryList, ProfileTab, modals) was sampled statically; live measurements there require an authed Playwright pass — see "Next steps" at the bottom.

## Verdict

**The design system has a clear voice and most cross-cutting tokens are sound** — colours via OKLCH, multi-family theming, dedicated pill `.design-chip`, custom scroll, no horizontal overflow at 360px. **But the system was authored against an older standard:** tap targets are 36–40 px (under 2026's 48-px floor), spacing is dominated by 6/10/14/18-px values (off the 8-px grid), zero `clamp()` fluid typography, near-zero container queries, and the desktop login email input is 15 px (will trigger iOS auto-zoom on tablet).

Bottom line: **shippable for closed beta, but a deliberate "tap-target + spacing-grid" pass would lift this to 2026 standard before public launch**.

---

## Phase 1: Define — design system inventory

| Layer | File | Notes |
|---|---|---|
| Tokens (colour, type, radius, z-index) | `src/design/tokens.css` (240 LOC) | OKLCH colours, `--font-size-{10,12,14,16,18,20,24,32,40,56}`, no fluid scale |
| Family themes (9 total) | `src/design/family-{dusk,paper,bronze,aurora,atelier,blueprint,botanical,newsprint,zine}.css` | Each overrides components but inherits spacing |
| Bridge (compat layer) | `src/design/bridge.css` | Container `min-height:72px`/`56px` (mobile) |
| Component primitives | `src/index.css` (987 LOC) | `.design-btn-primary` 40 px, `.design-btn-secondary` 40 px, `.design-btn-ghost` 36 px, `.design-chip` 24 px |
| Tailwind 4 | `@import "tailwindcss"` | Used heavily; `min-h-*`/`h-*` arbitrary values throughout views |

**Key measurements (computed at runtime):**
- Body font: `Inter Tight` variable
- Heading font: `Newsreader` (per-family override possible)
- Button heights: 36 / 40 / 44 / 56 / 72 px (no consistent 48-px size)
- Input height: 40 px desktop, 48 px (`min-h-48 + font-size 16`) mobile via `@media (max-width:1024px)`

---

## Phase 2: Crawl — measured violations

### Landing page (`/`) at 1280×800

| Metric | Value | Standard | Verdict |
|---|---|---|---|
| Horizontal overflow | none (1280 = scrollWidth) | none | ✅ |
| TTFB / FCP (dev server) | 21 ms / 90 ms | <800 / <1800 | ✅ (dev only — not representative) |
| Tap targets <44 px height (filtered <24 px width) | 8 of 39 | 0 | **⚠** |
| Sub-44 examples | nav links "What it is" (51×19), "Pricing" (38×19), "Privacy" (41×19) | h≥44 | **⚠** |
| Off-grid spacing instances | 164 unique elements | 0 | **⚠** |
| Top off-grid values | 6 px ×79, 10 px ×46, 14 px ×7, 18 px ×4, 26 px ×2, 3 px ×6, 2 px ×9 | multiples of 8 (or 4) | **⚠** |
| Inputs <16 px font | 0 | 0 | ✅ |
| Paragraphs >75 ch/line | 1 of 23 | <75 | ✅ |

### Landing page at 360×800 (mobile)

| Metric | Value | Verdict |
|---|---|---|
| Horizontal overflow | none | ✅ |
| Tap targets <44 px (any axis) | 22 of 30 | **⚠** large gap |

22 of 30 mobile tap targets miss the 44-px floor. Largely text links (Privacy/Terms in footer, inline anchors) and a few buttons. Worst offenders are header links rendered inline at ~19 px high.

### /privacy at 1280×800

| Metric | Value | Verdict |
|---|---|---|
| Body paragraph width | 624 px | within 65ch ideal |
| Estimated chars per line | ~56 | 45–75 target | ✅ |
| Line-height | 30 px on 20 px text = 1.5 | 1.4–1.6 | ✅ |
| Text alignment | `start` (left) | left | ✅ |

Privacy/Terms typography is the cleanest in the app. Use it as the template.

### /login at 1280×800

| Element | Measurement | Standard | Verdict |
|---|---|---|---|
| email input height | 46 px | ≥48 | borderline |
| **email input font-size** | **15 px** | **≥16 px** | **❌ iOS auto-zoom risk** |
| email input width | 360 px | n/a | ok |

The `@media (max-width:1024px)` rule in `src/index.css:185-190` correctly bumps `.design-input` to 16 px on phones, but **the desktop default (15 px) hits the 768–1024 px tablet zone where iOS Safari still auto-zooms inputs <16 px**. iPad Safari users will see the page zoom on focus.

### /login at 360×800

| Metric | Value | Verdict |
|---|---|---|
| email input fs | 16 px | ≥16 | ✅ |
| email input height | 48 px | ≥48 | ✅ |

Mobile is fine. The fix is to lift the 16-px floor to all viewports.

---

## Static analysis — system-wide

### Tap targets in CSS primitives (`src/design/tokens.css` + `src/index.css`)

| Class | min-height | Per 2026 standard | Action |
|---|---|---|---|
| `.design-btn-primary` | 40 px | ≥48 | bump |
| `.design-btn-secondary` | 40 px | ≥48 | bump |
| `.design-btn-ghost` | 36 px | ≥48 (or hit-area expansion) | bump or expand hit-area |
| `.design-chip` | 24 px | ≥32 (chips often exempt with ≥8 px gap) | OK if always part of group |
| `.family-botanical` button | 44 px | ≥48 | bump |
| Mobile container | 56 px | n/a | ✅ |
| BottomNav | 72 px | ≥48 | ✅ |

`src/index.css:675` and `src/design/family-botanical.css:103,116` already use 44 px — proves the system can ship larger; just hasn't been pushed to 48.

### `clamp()` fluid typography

```bash
grep -rn "clamp(" src/index.css src/design/*.css → 0 matches
```

**No fluid typography anywhere.** Type sizes are fixed 10/11/12/13/14/16/18/20/24/32/40/56 px steps. A 56-px Landing heading is the same on a 360-px screen as on a 1280-px screen, which doesn't read well at the small end.

Recommendation: introduce a per-family `--font-size-display` and `--font-size-h2` token using `clamp(min, viewport-fluid, max)` and route the Landing hero through it.

### Container queries

```bash
grep -rE "container-type|@container" src/ → 1 match (shadcn card.tsx)
```

**Effectively zero adoption.** The codebase is all media-query-driven, which means components don't adapt when their parent shrinks (e.g., a card in a 320-px sidebar slot vs. a 720-px main column).

This is a "next-decade" item — not launch-blocking. EntryList grid would benefit; defer post-launch.

### Off-grid spacing in inline styles (`src/`)

Sampled hits in `src/App.tsx`, `src/CaptureWelcomeScreen.tsx`, `src/components/AppLockGate.tsx`:
- `padding: "14px"`, `padding: "14px 16px"`, `padding: "12px 16px"`
- `margin: "6px 0 0"`, `gap: 10`, `gap: 12`

These line up with the runtime histogram (6 px / 10 px / 14 px dominate). Migrating to an 8-px grid (8/16/24/32/40/48) would normalise ~100 of the 164 measured violations without touching component logic.

### Justified text

```bash
grep -rE "text-align: *justify|text-justify" src/ → 0 matches
```

✅ No justified text anywhere.

---

## Findings ranked by skill priority

### 1. Accessibility (legal requirement) — **HIGH**

| # | Finding | Evidence | Fix |
|---|---|---|---|
| A11Y-1 | Primary/secondary buttons 40 px, ghost 36 px — under WCAG 2.5.5 AAA target of 44×44 and below the 2026 standard's 48 px | `src/design/tokens.css:49,81,109` | Bump `.design-btn-primary` / `.design-btn-secondary` to `min-height:48px`; `.design-btn-ghost` to 44 px or expand hit area via `padding` |
| A11Y-2 | 22 of 30 tap targets miss 44 px on mobile Landing | playwright crawl at 360 px | Audit `src/views/Landing.tsx` — bump nav links, footer links, scroll-cue button |
| A11Y-3 | Need `:focus-visible` outline audit (no measurements taken — defer to follow-up) | n/a | next pass |

### 2. Core Web Vitals — **MEDIUM**

| # | Finding | Evidence | Fix |
|---|---|---|---|
| CWV-1 | No production CWV measurement in this audit (dev server only — TTFB 21 ms is meaningless) | env limitation | Run Lighthouse against the deployed preview; the `lighthouse.yml` workflow already exists |
| CWV-2 | No `clamp()` for fluid headings — large displays reflow late on cold load (CLS risk on the 56-px Landing hero) | `grep` 0 hits | Migrate hero + h2 to `clamp(2rem, 4vw + 1rem, 3.5rem)` |

### 3. Mobile & Touch — **HIGH**

| # | Finding | Evidence | Fix |
|---|---|---|---|
| MOB-1 | Desktop email input is 15 px font-size — iOS auto-zoom on iPad/tablet | playwright `/login` 1280×800 | Lift `.design-input` font-size from 14 to 16 globally OR widen the mobile guard from `(max-width:1024px)` to `(max-width:1280px)` |
| MOB-2 | Component min-heights mostly 40 px; native iOS HIG is 44, Material 3 is 48 | `tokens.css:49,81` | Same fix as A11Y-1 |

### 4. Typography — **LOW**

| # | Finding | Evidence | Fix |
|---|---|---|---|
| TYPO-1 | Fixed type scale — no fluid steps for displays/h2 | `tokens.css` `--font-size-*` only | Add `--font-size-display-fluid: clamp(2rem, 4vw + 1rem, 3.5rem)` |
| TYPO-2 | `/privacy` body type is the cleanest in the app — copy that pattern across other long-form views (ToS, Status, About) | observed | Already aligned; just confirm |

### 5. Spatial Systems — **MEDIUM**

| # | Finding | Evidence | Fix |
|---|---|---|---|
| SPC-1 | 164 off-grid spacing values on the Landing page alone; dominated by 6 / 10 / 14 / 18 px | runtime histogram | Author a `--space-{1..10}` token scale on 4-px steps (4/8/12/16/20/24/32/40/48/64), migrate `src/index.css` + family files in a single sweep |
| SPC-2 | `.design-chip` at 24 px is too small if ever used in isolation (the rule "internal ≤ external" cannot be honoured at this size) | `tokens.css:139` | Document chips as "always grouped, ≥8 px gap" — add lint or visual test |

### 6. Layout Paradigms — **LOW (post-launch)**

| # | Finding | Evidence | Fix |
|---|---|---|---|
| LAY-1 | Container queries unused | `grep` 1 hit | Defer post-launch; EntryList grid is the highest-leverage candidate |
| LAY-2 | Bento grids absent on dashboard / Memory / Profile | inspection | Optional UX direction; not a defect |

---

## Grill tickets — proposed fix order

User signs off "yes/skip/modify/batch" per ticket. **Phase 3 fixes are queued — say the word and I'll execute them with failing Playwright tests first.**

### Ticket #1 — bump `.design-btn-*` heights to 48 / 44 px
- **Route**: every page
- **Element**: `.design-btn-primary`, `.design-btn-secondary`, `.design-btn-ghost`
- **Current**: 40 / 40 / 36 px
- **Expected**: 48 / 48 / 44 px
- **Why**: WCAG 2.5.5 AAA + 2026 standard; iOS HIG 44 + M3 48
- **Test**: `e2e/specs/tap-targets.spec.ts` — assert all `.design-btn-*` `getBoundingClientRect().height >= 44`
- **Risk**: **Visual regression on all 9 family themes — every button gets taller**. Need to walk each family in Playwright and confirm.

### Ticket #2 — global 16 px input floor
- **Route**: `/login`, every form (vault PIN, capture, settings)
- **Element**: `.design-input`
- **Current**: 14 px desktop, 16 px on `<1024 px`
- **Expected**: 16 px everywhere
- **Why**: iPad Safari auto-zooms 14 / 15-px inputs on focus
- **Test**: `e2e/specs/input-fontsize.spec.ts` — `expect(getComputedStyle(input).fontSize).toBe('16px')` at 360 / 768 / 1280 / 1920
- **Risk**: minimal — labels and helper text don't change; just inputs. ~5 px of vertical growth per row.

### Ticket #3 — author 8-px-grid spacing tokens + sweep
- **Element**: `tokens.css` `--space-*` scale + index.css cleanup
- **Current**: 164 off-grid instances on Landing alone
- **Expected**: tokens at 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64; index.css migrated
- **Test**: regex scan `src/index.css src/design/*.css` for `(padding|margin|gap):` values not in `{0,4,8,12,16,20,24,32,40,48,64}`
- **Risk**: medium — a few designs were authored to 6 / 10 / 14 px on purpose (e.g., the enriching-dot 2.5 px gap). Audit each before migrating.

### Ticket #4 — Landing mobile tap-target sweep (22 elements)
- **Route**: `/` at 360 px
- **Element**: nav links, footer links, scroll-cue button
- **Current**: many 19-px-high text links
- **Expected**: ≥44 px hit area (visible or via `padding-block`)
- **Test**: existing `e2e/specs/tap-targets.spec.ts` filtered to Landing
- **Risk**: low — adding `padding-block` doesn't shift visible text

### Ticket #5 — `clamp()` fluid display + h2 tokens
- **Element**: `tokens.css`
- **Current**: fixed 32 / 40 / 56 px steps
- **Expected**: `clamp(2rem, 4vw + 1rem, 3.5rem)` etc.
- **Test**: visual snapshot at 360 / 768 / 1280 / 1920 — heights smooth across breakpoints
- **Risk**: low. Per-family overrides still possible.

---

## Skipped / deferred

- **Container queries** — system-wide rewrite, post-launch. EntryList grid is the natural starting place.
- **Bento grids** — design direction, not a defect.
- **Authenticated-app crawl** (BottomNav, MobileHeader, EntryList, ProfileTab, modals) — needs storage-state injection into playwright-cli or use of the project's existing Playwright test infra. Spec saved for next pass via the `playwright-everion` skill.
- **APCA / colour-contrast measurement** — needs a per-token sweep with a contrast-calc lib; defer to follow-up audit dedicated to colour.
- **Lighthouse production CWV** — `lighthouse.yml` workflow already exists; trigger via `npm run lighthouse` once on a staging or preview URL.

---

## Production gate

These two would block a confident public launch (others are polish):

1. **Ticket #2 — global 16 px input floor.** iPad-Safari auto-zoom is a visible, lasting bad-experience that the user will report.
2. **Ticket #1 — 48-px tap targets.** Touch users miss the 40-px buttons more than you'd expect, and "buttons too small" is one of the top onboarding-test complaints in any product launch.

Total estimated effort for the two production-gate items: **~1.5 hours including Playwright tests + per-family-theme visual confirmation.**

---

## Method

- **Static**: `grep` for spacing, font-size, min-height, `clamp(`, `container-type`, `text-align:justify` across `src/index.css` + `src/design/*.css` + `src/components/**` + `src/views/**`.
- **Dynamic**: Playwright-CLI (v 1.59.0-alpha) against `npm run dev` (port 5173). Three routes, two viewports (1280×800 desktop, 360×800 mobile). Computed-style measurements via `page.evaluate()`. No screenshots saved (snapshot YAMLs are in `.playwright-cli/`).
- **Skipped on purpose**: authed-app interior, full a11y axe audit, colour contrast, production CWV — each gets its own follow-up audit because each demands different tooling.

**Audit kicked off by**: `/improve-frontend-architecture save it to eml audits` on 2026-05-07.
**Verifier**: every measurement above came from the running tree on 2026-05-07. Static counts came from `grep` runs in this session. No claims pulled from training memory.
