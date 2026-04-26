# Impeccable Audit — EverionMind
**Date:** 2026-04-14
**Skill:** impeccable:audit
**Scope:** Full codebase — Accessibility, Performance, Responsive Design, Theming, Anti-Patterns

---

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2/4 | 42× `outline-none` strips focus rings; OmniSearch missing combobox ARIA |
| 2 | Performance | 3/4 | Transform-only animations; some missing memoization |
| 3 | Responsive Design | 2/4 | Secondary action buttons ~28px tall; 14px input on mobile |
| 4 | Theming | 3/4 | 21 undefined `ob-` tokens in NotificationSettings; hardcoded `#4ade80` |
| 5 | Anti-Patterns | 4/4 | No AI slop tells. Clean editorial execution. |
| **Total** | | **14/20** | **Good (address weak dimensions)** |

---

## Anti-Patterns Verdict

**Pass — this does not look AI-generated.**

The `.impeccable.md` stated it needed to escape cyan/purple neon, glassmorphism, and gradient text. It did. The warm amber + deep charcoal palette feels human and editorial. Lora serif + DM Sans is an intentional, distinctive pairing. No blob backgrounds, no glow borders, no hero metrics. The `press-scale:active { transform: scale(0.97) }` shows restraint — a real design decision, not a showcase. This passes the slop test cleanly.

---

## Executive Summary

- **Audit Health Score: 14/20 — Good**
- Issues found: 0 P0 / 4 P1 / 5 P2 / 3 P3
- **Top issues**: Focus ring removal is systemic; OmniSearch combobox has no ARIA; NotificationSettings uses 21 undefined legacy tokens; BulkActionBar/EntryList secondary actions fail 44px touch target minimum

---

## Detailed Findings by Severity

---

### **[P1] Systemic focus ring removal across 42 interactive elements**
**Location**: Codebase-wide — `CaptureSheet.tsx:586,600,681`, `BulkActionBar.tsx:261,328`, `OmniSearch.tsx:160`, `OnboardingModal.tsx:157`, `MemoryImportPanel.tsx:134` and 34 more
**Category**: Accessibility
**Impact**: Keyboard users and screen reader users navigating the app have no visible indicator of which element is focused. This breaks WCAG 2.1 SC 2.4.7 (Focus Visible) — a Level AA requirement. Some elements compensate with `focus:border-primary` which changes a border but provides very low-contrast feedback and may not meet the 3:1 minimum for non-text contrast.
**WCAG/Standard**: WCAG 2.1 SC 2.4.7 (Focus Visible), SC 1.4.11 (Non-text Contrast)
**Recommendation**: Remove `outline-none` from interactive elements and replace with a consistent focus ring using the token system:

```css
/* index.css */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
:focus:not(:focus-visible) {
  outline: none;
}
```

Then remove `outline-none` from all components and only add `focus:outline-none` where mouse-click-only elements genuinely need it.
**Suggested command**: `/harden`

---

### **[P1] OmniSearch: no combobox ARIA pattern**
**Location**: `src/components/OmniSearch.tsx:85-280`
**Category**: Accessibility
**Impact**: The search input opens a dropdown of results but the component presents this to screen readers as a plain `<input>`. Users with assistive technology cannot know the dropdown exists, how many results are available, or navigate between results without a mouse. WCAG 4.1.2 violation.
**WCAG/Standard**: WCAG 2.1 SC 4.1.2 (Name, Role, Value)
**Recommendation**: Add the combobox pattern:

```tsx
<input
  role="combobox"
  aria-expanded={results.length > 0}
  aria-haspopup="listbox"
  aria-controls="search-results"
  aria-autocomplete="list"
  ...
/>
<ul id="search-results" role="listbox">
  {results.map((r, i) => (
    <li key={r.id} role="option" aria-selected={i === activeIndex}>
      {r.title}
    </li>
  ))}
</ul>
```

**Suggested command**: `/harden`

---

### **[P1] NotificationSettings: 21 undefined `ob-` token references**
**Location**: `src/components/NotificationSettings.tsx:55-222`
**Category**: Theming
**Impact**: All 21 class references (`bg-ob-surface`, `text-ob-text`, `text-ob-text-dim`, `border-ob-border`, `bg-ob-bg`, `text-ob-text-soft`, `text-ob-text-muted`) resolve to undefined CSS variables and will silently fall back to transparent/inherited values. The NotificationSettings panel likely renders with invisible text, missing backgrounds, or broken borders in production. This is a regression from a previous token refactor.
**Recommendation**: Migrate all `ob-` tokens to the current system:

| Old | Replace with |
|-----|-------------|
| `bg-ob-surface` | `bg-surface-container` |
| `bg-ob-bg` | `bg-surface` |
| `text-ob-text` | `text-on-surface` |
| `text-ob-text-dim` / `text-ob-text-soft` | `text-on-surface-variant` |
| `text-ob-text-muted` | `text-on-surface-variant/60` |
| `border-ob-border` | `border-outline-variant` |

**Suggested command**: `/normalize`

---

### **[P1] Small touch targets on secondary actions throughout mobile UI**
**Location**: `BulkActionBar.tsx:165,208,225`, `EntryList.tsx:167,193`, `KeyConcepts.tsx:54`, `CaptureSheet.tsx:690`
**Category**: Responsive Design
**Impact**: Secondary action buttons (`py-1.5 text-xs` ≈ 28px, `py-1 text-xs` ≈ 26px) are consistently below the 44×44px minimum for touch targets. This is particularly painful in BulkActionBar and EntryList which are heavily used in the primary mobile workflow. Users with motor impairments or large fingers will frequently mis-tap.
**WCAG/Standard**: WCAG 2.5.5 (Target Size); Apple/Google HIG 44px minimum
**Recommendation**: Increase vertical padding on small action buttons. Use `py-2.5` minimum instead of `py-1` or `py-1.5`. For icon-only actions, ensure minimum `h-11 w-11`. Use the `min-h-[44px]` pattern already present in `CreateBrainModal.tsx:192`.
**Suggested command**: `/adapt`

---

### **[P2] `App.tsx:192` — 14px input font triggers iOS auto-zoom**
**Location**: `src/App.tsx:192`
**Category**: Responsive Design
**Impact**: iOS Safari auto-zooms into any focused input with `font-size < 16px`. The page zooms in without the user requesting it, then doesn't zoom back out — creating a permanently zoomed state. The `.impeccable.md` explicitly lists "Forms use 16px+ font on mobile" as a requirement.
**Recommendation**: Change `fontSize: "14px"` to `fontSize: "16px"` (or `1rem`) for the affected input.
**Suggested command**: `/adapt`

---

### **[P2] ProvidersTab: `#4ade80` hardcoded hex fallback always fires**
**Location**: `src/components/settings/ProvidersTab.tsx:51`
**Category**: Theming
**Impact**: `var(--color-success, #4ade80)` — the token `--color-success` is never defined in `index.css` or any imported stylesheet, so the fallback `#4ade80` (lime green) always renders. This is default Tailwind green-400, which clashes with the warm amber/charcoal palette and is unthemed (same in light and dark mode).
**Recommendation**: Define `--color-success` in the token system:

```css
/* index.css @theme */
--color-success: oklch(62% 0.15 142);   /* warm sage-green */
--color-on-success: oklch(97% 0.01 142);
```

```tsx
/* ProvidersTab.tsx */
<span style={{ color: "var(--color-success)" }}>●</span>
```

**Suggested command**: `/normalize`

---

### **[P2] No ARIA live regions for asynchronous status updates**
**Location**: `FeedView.tsx` (loading state), `CaptureSheet.tsx` (parse status), `OmniSearch.tsx` (result count)
**Category**: Accessibility
**Impact**: When the AI parses an entry, when feed content loads, or when search results appear, there is no announcement to screen reader users. The `AskView` and PIN component correctly use `aria-live="polite"` — but the two most-used interactions in the app (capture + search) do not.
**Recommendation**:

```tsx
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {status === 'success' ? `Entry "${previewTitle}" ready to save` : ''}
</div>
```

**Suggested command**: `/harden`

---

### **[P2] BulkActionBar custom dropdowns missing interactive ARIA**
**Location**: `src/components/BulkActionBar.tsx:261,328`
**Category**: Accessibility
**Impact**: Two `<button>` elements act as custom dropdowns but have no `aria-expanded`, `aria-haspopup`, or `aria-controls` attributes. A screen reader user activates them with no indication of what happens next.
**Recommendation**: Add `aria-expanded={isOpen}` and `aria-haspopup="true"` to each trigger button, and `id` + `aria-controls` pairing to the panel it opens.
**Suggested command**: `/harden`

---

### **[P3] `text-[10px]` used in ~15 locations — borderline legible**
**Location**: `BottomNav.tsx:60`, `BrainSwitcher.tsx:105,120`, `BulkActionBar.tsx:238,318`, `CaptureSheet.tsx:439,884`, `CreateBrainModal.tsx:155,183,210,263`, `DesktopSidebar.tsx:115`, and more
**Category**: Accessibility
**Impact**: 10px is below the 12px minimum most accessibility guidelines recommend. While intentional for de-emphasized labels, users with any visual impairment cannot read the content at this size on mobile. Non-decorative labels at 10px are a friction point.
**Recommendation**: Bump meaningful labels to `text-[11px]` or `text-xs` (12px). Purely decorative text at 10px is defensible but should be the exception.
**Suggested command**: `/typeset`

---

### **[P3] LoadingScreen: inline `<style>` keyframe defined inside component**
**Location**: `src/components/LoadingScreen.tsx:36-40`
**Category**: Performance
**Impact**: The `loading-sweep` keyframe is injected into the DOM via a `<style>` tag on every mount. The other keyframes (`shimmer`, `fade-in`, `slide-up`) already live in `index.css` — this one should too.
**Recommendation**: Move `@keyframes loading-sweep` to `index.css` and reference it via a CSS class.
**Suggested command**: `/optimize`

---

### **[P3] EntryList `aria-label` uses raw title without role context**
**Location**: `src/components/EntryList.tsx:56,247`
**Category**: Accessibility
**Impact**: `aria-label={e.title}` on card-level interactive elements gives a name but no context. Screen reader users hear the title with no indication it's a selectable entry. A prefix like "Open entry:" or a complementary `aria-describedby` referencing the type badge would improve announcements.
**WCAG/Standard**: WCAG 2.4.6 (Headings and Labels)
**Suggested command**: `/harden`

---

## Patterns & Systemic Issues

1. **`outline-none` on 42 interactive elements** — codebase-wide pattern, not a one-off. A global `:focus-visible` rule + selective suppression fixes all instances at once.

2. **Small touch targets on secondary actions are consistent** — `py-1`/`py-1.5` on `text-xs` buttons appears across BulkActionBar, EntryList, KeyConcepts, and CaptureSheet. Primary actions (FAB, BottomNav) are correctly sized at 56px. The gap is specifically in secondary/inline actions, suggesting they were sized for desktop hover and not revisited for mobile.

3. **NotificationSettings is on a different token generation** — the `ob-` prefix belongs to a prior naming convention. The entire component needs token migration.

---

## Positive Findings

- **Anti-pattern discipline**: Zero AI slop tells. No glassmorphism, gradient text, cyan/purple palette, blob backgrounds, or hero metrics. The aesthetic is committed and coherent.
- **Modal focus management**: `DetailModal` restores focus to the trigger element on close. `CaptureSheet` has a working focus trap. Both are rare to see done correctly.
- **Token system quality**: The dual-layer OKLCH token system (custom `@theme` + shadcn `:root`/`.dark`) is thorough. Warm tinted neutrals, no pure black, perceptually uniform color scale.
- **Motion is clean**: `press-scale` uses only `transform`. All keyframes use `transform`/`opacity`. `ease-out-expo` used consistently. `prefers-reduced-motion` globally respected.
- **Semantic navigation**: `BottomNav` uses `<nav>`, `aria-label="Primary navigation"`, `aria-current="page"` — textbook correct.
- **Skeleton loading**: `role="status"` and `aria-label="Loading"` on `SkeletonCard` — good pattern, rarely done.
- **SVG icons**: Consistently marked `aria-hidden="true"` — no decorative icons polluting the accessibility tree.

---

## Recommended Actions (Priority Order)

1. **[P1] `/harden`** — Fix focus ring system globally (42× `outline-none`), add OmniSearch combobox ARIA, add BulkActionBar `aria-expanded`, add live regions to CaptureSheet parse flow
2. **[P1] `/normalize`** — Migrate 21 `ob-` tokens in `NotificationSettings.tsx` to current token system; define `--color-success` token and remove `#4ade80` fallback
3. **[P1] `/adapt`** — Increase touch target sizes on BulkActionBar, EntryList, KeyConcepts secondary actions; fix 14px mobile input font in `App.tsx`
4. **[P3] `/typeset`** — Audit 15× `text-[10px]` labels; bump meaningful labels to 11–12px
5. **[P3] `/optimize`** — Move `loading-sweep` keyframe out of inline `<style>` into `index.css`
6. **[P2] `/polish`** — Final pass after all fixes are applied
