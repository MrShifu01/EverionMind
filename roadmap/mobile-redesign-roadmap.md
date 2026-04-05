# OpenBrain Mobile Redesign Roadmap

## Completed (Phase 1 — Foundation)

### Bottom Navigation
- [x] Fixed `BottomNav` with 5 primary actions: Capture, Grid, Fill Brain, Ask, More
- [x] 56px touch targets (exceeds 48px WCAG 2.2 minimum)
- [x] Glassmorphism blur backdrop (`backdrop-filter: blur(20px)`)
- [x] `aria-current="page"` active state + `aria-label` on all items
- [x] Safe area inset padding for notched devices

### WCAG 2.2 Accessibility
- [x] Fixed 6 color tokens failing contrast ratios in both dark and light themes
- [x] Dark: `textMuted` 4.1:1 -> 5.2:1, `textDim` 3.0:1 -> 4.6:1, `textFaint` 1.8:1 -> 3.2:1
- [x] Light: `textMuted` 4.1:1 -> 5.5:1, `textDim` 3.0:1 -> 4.8:1, `textFaint` 2.4:1 -> 3.3:1
- [x] All text-on-background combinations now meet AA (4.5:1) or large text / non-text (3:1)

### Skeleton Loading States
- [x] `SkeletonCard` component with animated shimmer effect
- [x] Replaces text-only "Loading..." across all lazy-loaded views
- [x] Grid view shows 4 skeleton cards while entries load
- [x] Accessible: `role="status"` + `aria-label="Loading"`

### Streamlined Onboarding
- [x] Condensed from 5 steps + 30 in-flow questions to 3 steps
- [x] Step 1: Choose brain type(s)
- [x] Step 2: Setup confirmation
- [x] Step 3: Ready to go (features overview)
- [x] All 30 starter questions deferred to Fill Brain post-onboarding
- [x] iOS Home Screen tip folded into final step

### Mobile Header
- [x] `MobileHeader` component with 44px+ touch targets
- [x] Offline/sync status indicator
- [x] Proper `<header>` semantic landmark
- [x] Brain name with text overflow handling

### Test Coverage
- [x] 37 tests across 6 suites, all passing
- [x] Red-Green TDD methodology throughout

---

## Phase 2 — Progressive Disclosure & Micro-interactions

### Progressive Disclosure on Capture Home
- [ ] Show 2 primary tiles (Quick Capture + Fill Brain) initially
- [ ] Reveal Grid, Vault, and other tiles on scroll or "Show more" tap
- [ ] Context-aware: show different tiles based on time of day or entry count

### Micro-interaction Feedback
- [ ] Tap scale animation on all buttons (0.95 scale on press, spring back)
- [ ] Haptic feedback on save/delete actions (via `navigator.vibrate`)
- [ ] Smooth view transitions when switching between nav items
- [ ] Pull-to-refresh gesture on grid view
- [ ] Card press-and-hold for quick actions (pin, delete, share)

### Swipe Gestures
- [ ] Swipe left/right between adjacent views (Grid <-> Fill Brain <-> Ask)
- [ ] Swipe down to dismiss modals
- [ ] Swipe right on entry card for quick pin/delete

---

## Phase 3 — Adaptive UI & Glassmorphism

### Glassmorphism (Liquid Glass)
- [ ] Apply `backdrop-filter: blur(16px)` to entry cards on hover/focus
- [ ] Glassmorphism modal backgrounds (DetailModal, CreateBrainModal)
- [ ] Frosted glass header on scroll (increase blur as user scrolls down)
- [ ] Subtle glass effect on quick-ask chips in chat view

### Adaptive UI
- [ ] Auto-detect one-handed use (persistent bottom-right interactions)
- [ ] Detect device orientation and adjust grid columns (1 portrait, 2 landscape)
- [ ] Auto dark mode based on system preference (`prefers-color-scheme`)
- [ ] Reduce motion mode for `prefers-reduced-motion` users
- [ ] Large text mode for `prefers-contrast: more`

### Predictive/Agentic UX
- [ ] Reorder capture home tiles based on usage frequency
- [ ] Surface time-relevant entries (e.g., morning = today's reminders, evening = review)
- [ ] Location-aware nudges (if geolocation permitted)
- [ ] Auto-suggest entry type based on input content

---

## Phase 4 — Technical Optimization

### Migrate Inline Styles to Tailwind
- [ ] Convert all `style={{}}` objects in `OpenBrain.jsx` to Tailwind utilities
- [ ] Convert component inline styles (`EntryCard`, `QuickCapture`, etc.)
- [ ] Unlock hover/focus/active states via Tailwind pseudo-classes
- [ ] Unlock responsive breakpoints via Tailwind `sm:`, `md:`, `lg:`
- [ ] Reduce bundle size (CSS extraction vs JS style objects)

### PWA Optimization
- [ ] Add offline fallback page for uncached routes
- [ ] Implement stale-while-revalidate for API responses
- [ ] Cache AI chat responses locally for instant replay
- [ ] Optimize icon set (add 144px, 256px, maskable variants)
- [ ] Add `screenshots` to manifest for richer install prompt

### Performance
- [ ] Implement `React.memo` on all card components with proper comparators
- [ ] Use `useTransition` for non-urgent state updates (search, filter)
- [ ] Lazy-load heavy components below the fold
- [ ] Implement image lazy loading for document scans
- [ ] Add web vitals monitoring (LCP, FID, CLS)

---

## Phase 5 — Retention & Growth

### Optional Sign-up / Demo Mode
- [ ] Show a read-only demo brain with sample data before requiring auth
- [ ] "Try it first" CTA on login screen
- [ ] Prove core value (search, AI chat) in under 60 seconds
- [ ] Seamless transition: demo data becomes user's first brain on sign-up

### Enhanced Onboarding Retention
- [ ] Day 1-3 push notifications with contextual tips
- [ ] "Your brain is 23% full" progress indicator
- [ ] Weekly digest notification: "You stored X memories this week"
- [ ] Re-engagement: "You have 12 unanswered Fill Brain questions"

### Social / Sharing
- [ ] Share individual entries via native share sheet
- [ ] Export brain as beautifully formatted PDF
- [ ] QR code for quick brain sharing between family members
