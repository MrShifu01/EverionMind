# OpenBrain — Redesign Implementation Plan
**Source Spec:** `new_design/UI-SPEC.md`  
**Codebase State:** Stripped to raw HTML/bare TSX — styles removed, structure preserved  
**Target:** Neural Obsidian dark-mode PWA + Desktop, light mode togglable  
**Last Updated:** 2026-04-06

---

## Overview

This plan rebuilds the OpenBrain UI from the stripped codebase in **5 ordered phases**. Each phase produces a shippable, working increment. No phase requires the next one to be started. Later phases layer on top of earlier ones without breaking them.

**Do not start implementation without reading `UI-SPEC.md` in full.**

---

## Pre-Flight Checklist

Before writing a single line of CSS, verify these are in place:

- [ ] `tailwind.config.js` updated with full token system from `UI-SPEC.md §7`
- [ ] `src/index.css` has all global primitives from `UI-SPEC.md §6`
- [ ] Google Fonts preconnect + import in `index.html` (`Manrope` + `Inter`)
- [ ] `public/manifest.json` updated per `UI-SPEC.md §12`
- [ ] `index.html` has all PWA meta tags from `UI-SPEC.md §12`
- [ ] `viewport` meta includes `viewport-fit=cover`
- [ ] Lucide React is installed: `lucide-react`
- [ ] `cn()` utility available (via `clsx` + `tailwind-merge`)
- [ ] `ThemeContext` supports `'dark' | 'light'` and applies class to `<html>`

```bash
npm install lucide-react clsx tailwind-merge
```

```ts
// src/lib/cn.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

---

## Phase 1 — Foundation Layer
**Goal:** Every page renders correctly. Global shell, layout, navigation, and token system in place.  
**Estimate:** ~2 days  
**Deliverable:** App opens, navigates, looks like OpenBrain (no blank white pages)

### 1.1 Tailwind Config & Global Tokens
- Replace `tailwind.config.js` with spec version (`UI-SPEC.md §7`)
- Replace `src/index.css` contents with global primitives (`UI-SPEC.md §6`)
- Add `animation` and `keyframe` definitions to Tailwind config
- Add `transitionTimingFunction` tokens (`spring`, `out-expo`)
- Verify: `bg-background`, `text-primary`, `font-headline` all resolve

### 1.2 Root Layout Shell
**File:** `src/App.tsx`

```tsx
// Shell structure — reference UI-SPEC.md §10
<div className="min-h-dvh bg-background text-on-surface font-body relative">
  {/* Skip link */}
  <a href="#main-content" className="sr-only focus:not-sr-only fixed top-4 left-4 z-[200] px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold text-sm">
    Skip to main content
  </a>

  {/* Ambient atmosphere */}
  <div className="synapse-bg fixed inset-0 pointer-events-none z-0" aria-hidden="true" />

  {/* Desktop sidebar */}
  <DesktopSidebar className="hidden lg:flex" />

  {/* Mobile header */}
  <MobileHeader className="lg:hidden" />

  {/* Main */}
  <main id="main-content" tabIndex={-1} className="relative z-10 px-4 sm:px-6 lg:px-8 pt-4 pb-28 lg:pb-8 lg:ml-72">
    <Outlet />
  </main>

  {/* Mobile bottom nav */}
  <MobileBottomNav className="lg:hidden" />
</div>
```

### 1.3 Desktop Sidebar
**File:** `src/components/DesktopSidebar.tsx`  
**Reference:** `UI-SPEC.md §8.1`, `screens/desktop_sidenavbar_with_theme_toggle.png`

Implementation steps:
1. Fixed `aside`, `w-72`, full height, `bg-background`, right border
2. Brand mark: `gradient-text` on "OpenBrain" wordmark, `text-10 uppercase` tagline
3. `BrainSwitcher` component slot (build in Phase 1.6)
4. "+ New Entry" primary CTA button (cyan gradient, full-width)
5. `NavItem` sub-component (active + hover + inactive states per spec)
6. 9 nav items in correct order (see spec §8.1)
7. Footer: Settings NavItem + `UserProfileRow` (email + avatar placeholder)
8. Theme toggle icon button (top right of brand row)

**NavItem active detection:** use React Router's `useMatch` or a simple `pathname === href` check.

### 1.4 Mobile Bottom Navigation
**File:** `src/components/BottomNav.tsx`  
**Reference:** `UI-SPEC.md §8.2`, `screens/mobile_bottomnavbar_with_theme_toggle.png`

Implementation steps:
1. Fixed, `bottom-6`, centered pill, `w-[90vw] max-w-sm`
2. `glass-panel-dark`, `rounded-full`, `shadow-nav`
3. 5 tabs: Home · Collections · Capture (center FAB) · Ask AI · More
4. Center Capture tab: `-mt-4`, larger, cyan gradient, `rounded-2xl`
5. Active tab: `text-secondary bg-secondary/10 rounded-xl`
6. All tabs: `min-w-[56px] min-h-[56px]` (touch target)
7. Safe area bottom padding: `max(8px, env(safe-area-inset-bottom))`
8. `aria-current="page"` on active tab, `aria-label` on all

### 1.5 Mobile Header
**File:** `src/components/MobileHeader.tsx`  
**Reference:** `UI-SPEC.md §8.3`

1. Sticky top, `glass-panel-dark`, `border-b border-outline-variant/10`
2. Safe area top padding
3. Left: Brain name (truncated) + chevron → opens `BrainSwitcher` sheet
4. Right: offline badge (if offline) + sync spinner (if syncing) + search icon + notification icon
5. All icon buttons: `w-10 h-10 min-h-[44px]` touch target

### 1.6 Brain Switcher
**File:** `src/components/BrainSwitcher.tsx`  
**Reference:** `UI-SPEC.md §8.4`, `screens/openbrain_main_brain_settings.png`

- Desktop: dropdown panel below trigger button
- Mobile: bottom sheet (slides up)
- Trigger button: violet-tinted background, brain name truncated, chevron
- Brain list: each brain as a row with `BrainIcon` and `CheckIcon` on active
- "Create New Brain" button at bottom of list

### 1.7 Theme Context & Toggle
**File:** `src/ThemeContext.tsx`

- Stores `'dark' | 'light'` in localStorage as `openbrain_theme`
- Applies `class="dark"` to `<html>` element
- Default: `'dark'`
- Toggle button in desktop sidebar and mobile header (`SunIcon` / `MoonIcon`)

---

## Phase 2 — Core Components
**Goal:** All reusable components built, tested visually, accessible.  
**Estimate:** ~3 days  
**Deliverable:** Component library complete — all building blocks for screens exist

### 2.1 Button System
**File:** `src/components/ui/Button.tsx`

Build a single `<Button>` component with `variant` prop:
```tsx
type ButtonVariant = 'primary' | 'ai' | 'ghost' | 'text' | 'icon' | 'destructive';
```
Each variant maps exactly to the code in `UI-SPEC.md §8.7`. Include:
- `loading` state: shows spinner, disables interaction, reduces opacity
- `press-scale` class on all variants
- `disabled` state: `opacity-40 cursor-not-allowed`
- `aria-disabled` when disabled
- Full TypeScript props

### 2.2 Input System
**File:** `src/components/ui/Input.tsx`, `Textarea.tsx`, `Select.tsx`

From `UI-SPEC.md §8.8`:
- Shared label styling (`text-10 uppercase tracking-[0.2em]`)
- Focus ring: `focus:ring-2 focus:ring-primary/15 focus:border-primary/60`
- Error state: inline below field, `role="alert"`
- Helper text: below field, muted
- `min-h-[44px]` on all inputs
- Password field variant: show/hide toggle button

### 2.3 Entry Card Components
**File:** `src/components/EntryCard.tsx` (wrapped in `React.memo`)

Three variants from `UI-SPEC.md §8.6`:
- `EntryCard` — standard card (most views)
- `EntryCardLarge` — feature card (desktop home, 8-col bento)
- `EntryCardCompact` — dense list row (search results, sidebar references)

All variants share the type-icon-in-circle pattern and tag pills.

### 2.4 Modal System
**File:** `src/components/ui/Modal.tsx`, `BottomSheet.tsx`

- `<Modal>`: renders portal to `document.body`, focus trap, Escape to close, `aria-modal`
- `<BottomSheet>`: mobile-only slide-up variant
- Shared: `glass-panel`, scrim, close button (top-right), animated in/out
- Focus management: auto-focus first interactive element on open; return to trigger on close

### 2.5 Toast System
**File:** `src/lib/notifications.ts` (update) + `src/components/ui/ToastContainer.tsx`

- `ToastContainer` renders fixed stack (top-right desktop, top-center mobile)
- 4 variants: `success`, `error`, `ai`, `info` — per `UI-SPEC.md §8.11`
- Auto-dismiss: 4s success, 6s error, manual for AI insights
- `aria-live="polite"` for success/info, `aria-live="assertive"` for errors
- `X` dismiss button on all toasts

### 2.6 Skeleton Components
**File:** `src/components/SkeletonCard.tsx` (update)

From `UI-SPEC.md §8.12` — add shimmer via Tailwind animation, `role="status"`, `aria-label="Loading"`. Create variants:
- `SkeletonCard` — standard entry card skeleton
- `SkeletonRow` — compact list row skeleton
- `SkeletonText` — inline text placeholder

### 2.7 Tags, Badges, Empty States
**Files:** `src/components/ui/Tag.tsx`, `Badge.tsx`, `EmptyState.tsx`

From `UI-SPEC.md §8.13` and `§8.14`. `EmptyState` takes `icon`, `title`, `description`, `actionLabel`, `onAction` props.

---

## Phase 3 — Screen Implementation
**Goal:** All 13 screens in spec built using Phase 2 components.  
**Estimate:** ~5 days  
**Deliverable:** Full app navigable end-to-end, correct visual design on all screens

Work through screens in this order (dependency order):

### 3.1 Login Screen
**File:** `src/LoginScreen.tsx`  
**Reference:** `UI-SPEC.md §9.1`, `screens/openbrain_login.png`

- Desktop: 40/60 split — left brand column (synapse-bg, wordmark, decorative cards), right form
- Mobile: single centered card
- Responsive breakpoint: `<1024px` → single column
- Form: email input + "Send Magic Link" primary button + Google OAuth ghost button
- Post-submit: button shows loading state, success toast on send

### 3.2 Onboarding Flow
**File:** `src/views/OnboardingFlow.tsx` (replace existing `OnboardingModal.tsx`)  
**Reference:** `UI-SPEC.md §9.2`, screens

- 3-step full-screen flow (not a modal — dedicated route `/onboarding`)
- Step indicator: 3 dots, bottom-center, current dot `bg-primary scale-125`
- Step 1: Brain type selector cards (multi-select, primary-bordered when selected)
- Step 2: Brain name input + optional colour preset
- Step 3: Feature discovery 2×2 grid + "Add to Home Screen" animated tip
- Transition between steps: `translateX` slide, 300ms out-expo

### 3.3 Home / Neural Hub
**File:** `src/OpenBrain.tsx` (refactor home view section)  
**Reference:** `UI-SPEC.md §9.3`, `screens/openbrain_home_desktop.png`

- Sticky quick capture bar (top, `z-20`)
- Nudge banner (primary/cyan-accented dismissable card)
- Desktop: 12-column bento grid (feature card 8-col + insight panel 4-col + 3 bento cards + wide card)
- Mobile: single-column feed
- Pinned entries: horizontal scroll strip on mobile
- All entries via `EntriesContext` (no prop drilling)

### 3.4 Grid / Collections View
**File:** `src/views/GridView.tsx` (new — currently handled inline)  
**Reference:** `UI-SPEC.md §9.4`, `screens/openbrain_grid_view_1.png`

- Sticky filter bar (type chips, search input)
- Responsive grid: 1 → 2 → 3 → 4 columns
- "No results" empty state
- Entry count badge on each filter chip

### 3.5 Quick Capture
**File:** `src/components/QuickCapture.tsx` (update)  
**Reference:** `UI-SPEC.md §9.5`

- Mobile: `<BottomSheet>` full-screen
- Desktop: `<Modal>` centered (max-w-2xl)
- Type selector: horizontal scroll chips
- Title autofocused on open
- Collapsible metadata section (tags, file attach)
- AI "Capture & Enhance" violet CTA + "Save Draft" ghost CTA

### 3.6 Fill Brain / Suggestions
**File:** `src/views/SuggestionsView.tsx` (update)  
**Reference:** `UI-SPEC.md §9.6`

- Card-per-question, gradient progress bar
- Violet AI header throughout
- Skip / Answer buttons
- Previous question swipe gesture (touch events)

### 3.7 Ask AI / Chat
**File:** `src/views/ChatView.tsx` (new, currently inline in `OpenBrain.tsx`)  
**Reference:** `UI-SPEC.md §9.7`, `§8.9`, `screens/openbrain_ask_ai_desktop.png`

- Desktop: 65/35 split (chat / source entries panel)
- Mobile: full-screen chat
- Typing indicator (3-dot bounce stagger)
- Quick-ask chips above input
- Vault integration: show lock modal if query needs vault entries

### 3.8 Entry Detail & Edit
**File:** `src/views/DetailModal.tsx` (update to `DetailPanel.tsx`)  
**Reference:** `UI-SPEC.md §9.8`

- Desktop: right-panel drawer (`w-[480px]`, slides from right)
- Mobile: full-screen takeover
- View mode: title (headline-md), content, metadata grid, linked entries, action bar
- Edit mode: autofocus title input, all fields editable inline
- Delete: requires confirmation modal — "Confirm delete?" dialog with `text-error` button

### 3.9 Knowledge Graph
**File:** `src/views/GraphView.tsx` (update)  
**Reference:** `UI-SPEC.md §9.9`, `screens/openbrain_network_desktop.png`

- Full-bleed canvas
- Node colors match entry type (cyan = person, violet = document, rose = secret)
- Hover tooltip: glass-panel card
- Selected node → right panel entry detail
- Float controls: glass-panel bottom-right

### 3.10 Calendar View
**File:** `src/views/CalendarView.tsx` (update)  
**Reference:** `UI-SPEC.md §9.10`

- Day cells: `min-h-[44px]` mobile, `min-h-[80px]` desktop
- Entry dots: colored per type
- Today: `text-primary font-bold`
- Selected day: `bg-primary/10 border border-primary/25`

### 3.11 Refine View
**File:** `src/views/RefineView.tsx` (update)  
**Reference:** `UI-SPEC.md §9.11`

- AI quality ring on entry icons
- Suggested link pairs with violet CTA

### 3.12 Settings
**File:** `src/views/SettingsView.tsx` (update)  
**Reference:** `UI-SPEC.md §9.12`, `screens/openbrain_main_brain_settings.png`

- Sectioned scroll layout, no tabs
- Each section = `bg-surface-container rounded-3xl p-6` card
- Per-task model pickers (from `todo.md` AI-models section)
- Theme toggle prominently in Account section

### 3.13 Vault
**File:** `src/views/VaultView.tsx` (update)  
**Reference:** `UI-SPEC.md §9.13`

- Tertiary (rose) color theme throughout
- 6-dot PIN entry
- Auto-lock timer

---

## Phase 4 — Interaction & Motion Layer
**Goal:** All micro-interactions, transitions, and animation states implemented.  
**Estimate:** ~2 days  
**Deliverable:** App feels polished, responsive, and alive

### 4.1 Press Animations
Apply `press-scale` utility class to every interactive element. Verify all buttons, cards, nav items, and chips spring back correctly.

### 4.2 View Transitions
Use React Router's `useTransition` or a lightweight `framer-motion` / CSS-based approach:

```tsx
// Wrap route outlet in transition container
<div
  key={pathname}
  className="animate-in fade-in duration-200"
>
  <Outlet />
</div>
```

**Direction rules (spatial continuity):**
- Forward navigation → `slide-in-from-right`
- Back navigation → `slide-in-from-left`
- Modal/sheet → `zoom-in-95` (modal) or `slide-in-from-bottom` (sheet)

### 4.3 Card Hover Effects (Desktop)
For desktop only (`@media (hover: hover)`):
- Entry cards: `hover:-translate-y-0.5 hover:border-primary/20` + shadow increase, 500ms ease
- Nav items: `hover:bg-surface-container` fill, 200ms
- Buttons: shine sweep on AI buttons on hover

### 4.4 Skeleton → Content Transition
When data loads, replace skeleton with content using `animate-in fade-in duration-300`. No jarring layout shift — skeleton must match content dimensions.

### 4.5 Toast Queue Management
- Max 3 toasts visible simultaneously
- New toast slides in from top; excess toasts slide down and fade out
- Auto-dismiss sequence: success (4s), error (6s), AI insights (manual only)

### 4.6 Typing Indicator
3-dot bounce stagger for AI response — 150ms delay between dots, infinite until response arrives. Disappears with `animate-out fade-out duration-150`.

### 4.7 Ambient Blobs (Synapse Background)
`synapse-bg` radials are static CSS. Optional enhancement: JS-driven slow `blob-drift` animation on 2 absolutely-positioned `<div>` elements for richer atmosphere effect. **Must be disabled under `prefers-reduced-motion`.**

### 4.8 Haptic Feedback (PWA)
On mobile, on save/delete/confirm actions:
```ts
if ('vibrate' in navigator) navigator.vibrate(10); // short tap
if ('vibrate' in navigator) navigator.vibrate([20, 50, 20]); // double pulse for delete
```

---

## Phase 5 — PWA & Performance Layer
**Goal:** Perfect PWA integration, offline support, and performance optimisation.  
**Estimate:** ~2 days  
**Deliverable:** Lighthouse PWA score ≥90, offline works, install prompt handled

### 5.1 Manifest & Icons
- Update `public/manifest.json` per `UI-SPEC.md §12`
- Generate icon set: 192×192, 512×512, 180×180 (apple-touch), maskable 512×512
- Add `screenshots` to manifest (mobile + wide)
- Add `shortcuts` for Quick Capture and Ask AI

### 5.2 Meta Tags
Update `index.html` with all PWA meta tags per spec §12. Verify:
- `theme-color` (dark and light variants)
- `apple-mobile-web-app-capable`
- `viewport-fit=cover`
- Apple touch icon link

### 5.3 Service Worker
**File:** `src/sw.js` (update)

Strategy:
- App shell: Cache-First (HTML, CSS, JS, fonts)
- API responses: Stale-While-Revalidate (entries, brains)
- AI responses: Network-First (always fresh)
- Offline fallback: Return cached `index.html` for navigation requests

```js
// Precache strategy
const SHELL = ['/index.html', '/assets/index.css', '/assets/index.js'];
const RUNTIME = 'runtime-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(RUNTIME).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')));
    return;
  }
  // Stale-while-revalidate for API
  if (e.request.url.includes('/api/entries')) {
    e.respondWith(staleWhileRevalidate(e.request));
    return;
  }
  e.respondWith(cacheFirst(e.request));
});
```

### 5.4 Install Prompt
```tsx
// src/hooks/useInstallPrompt.ts
const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

useEffect(() => {
  const handler = (e: Event) => {
    e.preventDefault();
    setInstallPrompt(e as BeforeInstallPromptEvent);
  };
  window.addEventListener('beforeinstallprompt', handler);
  return () => window.removeEventListener('beforeinstallprompt', handler);
}, []);
```

Surface a dismissable banner in the onboarding step 3 and in Settings → About. Don't show if already installed (`window.matchMedia('(display-mode: standalone)').matches`).

### 5.5 Offline State UI
- `navigator.onLine` + `online`/`offline` event listeners
- Header shows amber "Offline" badge when offline
- Pending operations counter badge on sync icon
- Full offline page (cached route `/offline`) shown when no cache available for a route

### 5.6 Performance Checklist

| Item | Implementation |
|---|---|
| Font loading | `display=swap` on Google Fonts import |
| Image optimization | All user images via `<img loading="lazy">` with `width`/`height` |
| Code splitting | Route-level `React.lazy` + `Suspense` for heavy views (Graph, Refine) |
| Virtual scrolling | Enable for entry lists with >50 entries |
| Bundle audit | `vite-bundle-visualizer` — target initial bundle <200KB gzipped |
| Web vitals | Add Vercel Analytics + `web-vitals` library |

```tsx
// Route-level lazy loading
const GraphView    = lazy(() => import('./views/GraphView'));
const RefineView   = lazy(() => import('./views/RefineView'));
const SettingsView = lazy(() => import('./views/SettingsView'));

// Wrapped with Suspense + SkeletonCard fallback
<Suspense fallback={<SkeletonCard count={4} />}>
  <GraphView />
</Suspense>
```

### 5.7 Window Controls Overlay (Desktop PWA)
When installed on desktop:

```json
// manifest.json
"display_override": ["window-controls-overlay", "standalone"]
```

```css
/* Sidebar brand area respects title bar */
.sidebar-brand {
  padding-top: max(8px, env(titlebar-area-height, 8px));
}
```

### 5.8 Keyboard Shortcuts (Desktop)
**File:** `src/hooks/useKeyboardShortcuts.ts`

```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); focusCapture(); }
    if ((e.metaKey || e.ctrlKey) && e.key === '/') { e.preventDefault(); openChat(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') { e.preventDefault(); openCapture(); }
    if (e.key === 'Escape') { closeModal(); }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

---

## Testing Plan

After each phase, verify:

### Visual
- [ ] Dark mode renders correctly (no white flashes)
- [ ] Light mode toggle produces Neural Alabaster theme
- [ ] 375px mobile layout (no horizontal scroll)
- [ ] 1440px desktop layout (sidebar, bento grid)
- [ ] Tablet 768px (appropriate column layout)

### Functional
- [ ] Navigation works between all screens
- [ ] Entry CRUD (create/read/update/delete) with confirmation
- [ ] Brain switching updates all views
- [ ] Quick capture saves and appears in grid
- [ ] AI chat sends, shows typing indicator, renders response
- [ ] Toast notifications appear and dismiss

### Accessibility
- [ ] Tab through entire app without mouse
- [ ] Screen reader reads all nav items, modals, and toast messages
- [ ] All focus states visible (cyan outline)
- [ ] Escape closes all modals and sheets
- [ ] Enable `prefers-reduced-motion` — no animations

### PWA
- [ ] Lighthouse PWA score ≥90
- [ ] Install prompt fires on Chrome/Edge
- [ ] App opens in standalone mode (no browser chrome)
- [ ] Offline: cached content shows, offline badge appears
- [ ] Theme color appears in browser tab / OS window frame
- [ ] Safe area insets respected on iPhone notch

---

## Component Build Order Summary

```
Phase 1: Foundation
  ├── tailwind.config.js
  ├── src/index.css (global primitives)
  ├── src/lib/cn.ts
  ├── src/ThemeContext.tsx (update)
  ├── src/App.tsx (layout shell)
  ├── src/components/DesktopSidebar.tsx
  ├── src/components/BottomNav.tsx
  ├── src/components/MobileHeader.tsx
  └── src/components/BrainSwitcher.tsx

Phase 2: Components
  ├── src/components/ui/Button.tsx
  ├── src/components/ui/Input.tsx
  ├── src/components/ui/Modal.tsx
  ├── src/components/ui/BottomSheet.tsx
  ├── src/components/ui/ToastContainer.tsx
  ├── src/components/EntryCard.tsx (updated)
  ├── src/components/SkeletonCard.tsx (updated)
  ├── src/components/ui/Tag.tsx
  ├── src/components/ui/Badge.tsx
  └── src/components/ui/EmptyState.tsx

Phase 3: Screens (in order)
  ├── src/LoginScreen.tsx
  ├── src/views/OnboardingFlow.tsx
  ├── src/OpenBrain.tsx (home view)
  ├── src/views/GridView.tsx
  ├── src/components/QuickCapture.tsx
  ├── src/views/SuggestionsView.tsx
  ├── src/views/ChatView.tsx
  ├── src/views/DetailPanel.tsx
  ├── src/views/GraphView.tsx
  ├── src/views/CalendarView.tsx
  ├── src/views/RefineView.tsx
  ├── src/views/SettingsView.tsx
  └── src/views/VaultView.tsx

Phase 4: Motion
  ├── press-scale utility (global CSS)
  ├── Route transition wrapper
  ├── Card hover effects (desktop)
  ├── Toast queue animations
  └── src/hooks/useHaptic.ts

Phase 5: PWA
  ├── public/manifest.json
  ├── index.html (meta tags)
  ├── src/sw.js (update)
  ├── src/hooks/useInstallPrompt.ts
  ├── src/hooks/useKeyboardShortcuts.ts
  └── Web vitals integration
```

---

## Decision Log

| Decision | Rationale |
|---|---|
| Tailwind over CSS-in-JS | Token system stays consistent, hover/focus/responsive via class variants, no runtime overhead |
| `glass-panel` as CSS class, not Tailwind utility | `backdrop-filter` + `-webkit-backdrop-filter` together are cleaner in a single class |
| `min-h-dvh` not `min-h-screen` | `dvh` accounts for mobile browser chrome (iOS Safari bottom bar) — avoids scroll jump |
| No `user-scalable=no` | Accessibility requirement; forced zoom prevention violates WCAG 2.2 |
| Separate `Modal` and `BottomSheet` components | Different animation axes, different dismiss behaviors (Escape vs swipe-down), easier to test |
| `press-scale` as global CSS class | Ensures consistent 95% spring scale on every interactive element without Tailwind's `active:scale-95` which uses linear timing |
| Route-level code splitting for Graph/Refine/Settings | These are heavy views rarely used on first load — keeps initial bundle small |
| Google Fonts with `display=swap` | Prevents FOIT (invisible text) while fonts load — body text shows in system font first |
| `viewport-fit=cover` | Required for `env(safe-area-inset-*)` to work on iPhone notch/Dynamic Island |
| Dark mode via `class="dark"` on `<html>` | Allows JavaScript control for the theme toggle button, preferred over `prefers-color-scheme` media query which can't be overridden |

---

*End of Implementation Plan — OpenBrain v2.0*
