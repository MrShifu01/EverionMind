# EverionMind Launch MVP Sprint - Design Spec

**Date:** 2026-04-13
**Sprint:** Apr 14-27 (14 days)
**Goal:** Ship a focused, retention-ready MVP by hiding 80% and nailing the 20% that drives daily return.
**Reference:** `future-plans/launch2.md` (deep audit), `sprints/sprint.md` (task breakdown)

---

## Execution Strategy

Phase-by-phase with commits. Each phase is an atomic unit with exit criteria from the sprint doc. Commit after each phase passes verification. Phases 3-5 have human-only tasks flagged separately.

---

## Phase 1: Simplify (Days 1-3)

No code deletion. Feature flags and nav changes only.

### Task 1.1: Feature-flag multi-brain

**New file:** `src/lib/featureFlags.ts`
- Export `isMultiBrainEnabled(): boolean` reading `import.meta.env.VITE_ENABLE_MULTI_BRAIN`
- Default: `false`

**Changes:**
- `src/components/BrainSwitcher.tsx` — early return `null` when flag is off
- `src/components/CreateBrainModal.tsx` — early return `null` when flag is off
- `src/components/settings/BrainTab.tsx` — hide tab from SettingsView when flag is off
- `src/components/DesktopSidebar.tsx` — hide brain switcher slot and "New Brain" button when flag is off
- `src/components/MobileHeader.tsx` — hide brain switcher slot when flag is off
- `.env.example` — add `VITE_ENABLE_MULTI_BRAIN=false`

**No changes to:** API routes (still functional server-side), database schema, BrainContext (still provides single default brain)

### Task 1.2: Disable Vault by default

**Changes:**
- `src/components/VaultIntroModal.tsx` — remove auto-prompt trigger. Only opens when user explicitly navigates to vault in Settings
- `src/components/CaptureSheet.tsx` — remove VaultIntroModal trigger on secret tab access (or hide secret tab entirely when vault not set up)
- `/api/chat.ts` — replace blocking passphrase modal logic with graceful skip. If vault data referenced but vault locked, include inline note "unlock vault in Settings to include sensitive data" instead of blocking
- `src/views/SettingsView.tsx` — vault moves to a sub-section inside Advanced tab (Phase 3 restructures settings fully; for now, keep vault tab but deprioritize in ordering)
- `src/components/BottomNav.tsx` — remove vault from "More" menu

### Task 1.3: Simplify navigation

**Target nav:** Feed | Capture | Ask | Memory | Settings

**BottomNav.tsx changes:**
- Replace current items: `capture`(Home) / `refine` / FAB / `chat` / More
- New items: `feed`(Home) / FAB(Capture) / `chat`(Ask) / `grid`(Memory) / `settings`
- Remove "More" menu entirely
- Remove: refine, vault, todos, timeline from nav

**DesktopSidebar.tsx changes:**
- Nav items: Feed, Capture (CTA button), Ask, Memory, Settings
- Remove: brain switcher slot (hidden by flag), "New Brain" button, refine/todos/timeline

**OpenBrain.tsx changes:**
- Add `feed` view ID to the view system
- Create placeholder `FeedView.tsx` — renders "Your feed is coming soon" centered message with capture CTA
- Set `feed` as default view on app load
- Keep TodoView, RefineView, GraphView code intact (just no nav path to them)
- Update NAV_VIEWS array

### Task 1.4: Default AI provider

**Changes:**
- `src/data/constants.ts` — remove claude-haiku-4-5-20251001 default. Gemini 2.5 Flash Lite is hardcoded in .env
- `/api/chat.ts` — remove Anthropic as default provider path. Ensure Gemini is the default flow. Remove claude haiku model references from allowlists
- `src/components/OnboardingModal.tsx` — confirm no provider selection step exists (it doesn't currently)
- ProvidersTab stays in settings but will be moved to "Advanced" in Phase 3
- Remove all claude-haiku-4-5-20251001 references across the codebase (constants, chat API model allowlists, etc.)

### Phase 1 Exit Criteria
1. `npm run typecheck` passes
2. App loads with 5-item nav: Feed, Capture, Ask, Memory, Settings
3. New user flow has zero decisions before first capture
4. `VITE_ENABLE_MULTI_BRAIN=true` restores brain features
5. No UI references to "brains" (plural), vault modals, or provider choice for new users

---

## Phase 2: Build the Core (Days 4-7)

### Task 2.1: Brain Feed (home screen)

**New API:** `/api/feed.ts`
- Auth: requires valid Supabase session
- Input: user_id (from session), brain_id (from query or default)
- Output JSON:
  ```json
  {
    "greeting": "Good morning, Christian",
    "resurfaced": [{ entry object }, { entry object }],
    "insight": "You've mentioned supplier issues 5 times this month...",
    "action": "3 entries are missing phone numbers. Review them?",
    "streak": { "current": 5, "longest": 12 },
    "stats": { "entries": 47, "connections": 12, "insights": 3 }
  }
  ```
- Resurfaced: SELECT 2 random entries WHERE created_at BETWEEN (now - 6 months) AND (now - 1 month), weighted by importance if column exists, otherwise random
- Insight: SELECT latest gap-analyst result from cron output storage
- Action: SELECT entries with sparse metadata (few tags, no phone/email in content for contact-type entries)
- Streak: query user metadata or entries table for consecutive capture days
- Stats: COUNT entries, COUNT links/connections, COUNT gap-analyst runs

**New view:** `src/views/FeedView.tsx`
- Time-aware greeting using hour of day
- User name from Supabase auth metadata
- Card layout:
  - Resurfaced memory cards (tappable, show title + snippet + age)
  - Insight card (gap-analyst output, styled distinctly)
  - Action card (suggestion with CTA button)
  - Stats bar (entries count, connections, streak with flame icon)
- Capture bar pinned at bottom: text input "What's on your mind?" + voice button
- Empty state: "Your brain is empty. Let's fix that." + big capture CTA
- Content variation: use `new Date().getDay()` to rotate card ordering/emphasis

### Task 2.2: Guided onboarding

**Replace:** `src/components/OnboardingModal.tsx`

**New flow (6 steps):**
1. **Welcome:** "Welcome to Everion. Let's teach your brain." + Continue button
2. **Bulk capture:** Multi-line textarea, placeholder "One thought per line", example grayed out. Submit button "Teach my brain"
3. **Processing:** Loading spinner/skeleton. Call `/api/capture` for each line (or batch). Show brief "Processing X thoughts..."
4. **Guided query:** "Now ask your brain something hard." Pre-filled: "What patterns do you see?" Editable. Submit button
5. **AI response:** Display response from `/api/chat`. Styled as insight card
6. **Celebration:** Subtle scale animation on the insight card. "That's your brain working. Imagine 6 months of data." + "Start exploring" button → Feed

**Requirements:**
- Skip button on every step (skips to Feed)
- Re-accessible from Settings > Help (store onboarding completion in localStorage, add "Replay onboarding" button)
- Steps 1-6 completable in under 60 seconds (excluding AI response time)
- Google OAuth at minimum for signup (already exists via Supabase)

### Task 2.3: Global capture shortcut

**Changes:**
- `src/components/CaptureSheet.tsx` — remove type selector from initial view. Auto-categorize after submission
- New: `src/components/FloatingCaptureButton.tsx` — fixed-position FAB visible on Feed, Ask, Memory, Settings views. Opens CaptureSheet
- `src/OpenBrain.tsx` — add global `keydown` listener for `Cmd+K` / `Ctrl+K` → open CaptureSheet
- CaptureSheet — auto-focus text input on open
- Voice button: ensure one-tap record (no intermediary modal)

### Task 2.4: Streak + brain stats

**Data model:** Add to user metadata (Supabase auth.users.raw_user_meta_data or a new `user_stats` row in a stats table):
- `current_streak: number`
- `longest_streak: number`
- `last_capture_date: string (ISO date)`
- `total_insights: number`

**Logic (in `/api/capture` or a shared helper):**
- On each capture: compare `last_capture_date` to today
  - Same day: no change
  - Yesterday: increment `current_streak`, update `longest_streak` if exceeded
  - Older: reset `current_streak` to 1
  - Update `last_capture_date` to today

**UI:**
- Feed displays streak: "X-day capture streak" with flame icon
- Feed displays stats from `/api/feed` response
- NudgeBanner messages at milestones (3, 7, 14, 30): "You're on fire! 7-day streak!"
- Push notification for streak at risk: trigger via existing cron/push infrastructure when `last_capture_date` is yesterday and current time > 8pm

### Phase 2 Exit Criteria
1. Feed shows personalized content for users with entries
2. Feed shows helpful empty state for new users
3. Onboarding delivers insight in under 60 seconds (excluding AI latency)
4. Capture accessible from every view via FAB + Cmd+K
5. Streak counter working and visible in Feed
6. `npm run typecheck` passes
7. Test suite passes

---

## Phase 3: Polish (Days 8-10)

### Task 3.1: Settings simplification

Collapse 6 tabs to 2:
- **Profile:** account (name, avatar from AccountTab), notifications (from NotificationsTab)
- **Advanced:** AI provider + API keys (from ProvidersTab), Security/Vault (VaultView as sub-section), Storage (from StorageTab), Data export + danger zone (from DangerTab, BrainTab export)

### Task 3.2: Copy and empty states

Write copy for:
- Onboarding screens (done in 2.2, polish here)
- Feed empty state: "Your brain is empty. Let's fix that. Capture your first thought and watch your brain grow."
- Memory empty state: "Nothing here yet. Your memories will appear as you capture thoughts."
- Ask empty state: "Ask your brain anything. The more you capture, the smarter it gets."
- Voice: direct, warm, not corporate. Second person. Short sentences.
- Every empty state has CTA button → opens capture

### Task 3.3: Code cleanup

- `npm run typecheck` — fix all errors
- Run Knip — remove dead exports/imports from Phase 1 nav changes
- Check for `console.log` in production paths (not in test files)
- Review `future-plans/Production-security-checklist` items — address critical ones

### Phase 3 Exit Criteria
1. Settings has 2 tabs, all features findable
2. All empty states have clear copy + CTAs
3. No typecheck errors, no dead imports, test suite green

**Human tasks (not code):** Test with 3 real users, document findings, fix top 3 friction points

---

## Phase 4: Launch Prep (Days 11-12)

### Task 4.1: OG meta tags

- Add `<meta property="og:title">`, `og:description`, `og:image`, `og:url` to `index.html`
- Add Twitter card meta tags
- OG image: static asset (create or use existing brand asset)

### Task 4.2: Monetization banner

**New component:** `src/components/EarlyAccessBanner.tsx`
- Text: "Free during early access. Starter plan coming soon. Early users get 50% off."
- Dismissible (localStorage key)
- Subtle styling, not intrusive
- Displayed at top of Feed view

### Task 4.3: Monitoring verification

- Verify Sentry DSN is set in production env
- Verify Vercel Speed Insights script is included
- Add a test error boundary trigger (dev-only) to confirm Sentry captures errors

### Phase 4 Exit Criteria
1. OG meta tags render correctly (testable via social preview tools)
2. Early access banner visible and dismissible
3. Sentry config verified

**Human tasks:** Record demo video, set up landing page, write launch content, draft Product Hunt listing

---

## Phase 5: Ship (Days 13-14)

### Task 5.1: Final code checks

- Full UAT path verification: signup → onboarding → capture → ask → feed → next day feed
- Verify all env vars referenced in code are set in Vercel project settings
- Verify rate limiting config is appropriate for launch traffic
- Test suite passes
- Mobile responsive check (code-level, verify no breakpoint issues)

### Phase 5 Exit Criteria
1. All code checks pass
2. No critical typecheck or test failures

**Human tasks:** Deploy to production, smoke test, post launch threads, monitor Sentry + analytics for 48 hours, respond to users

---

## Files Created/Modified Summary

### New Files
- `src/lib/featureFlags.ts` — feature flag helpers
- `src/views/FeedView.tsx` — Brain Feed home screen
- `/api/feed.ts` — Feed API endpoint
- `src/components/FloatingCaptureButton.tsx` — global capture FAB
- `src/components/EarlyAccessBanner.tsx` — monetization placeholder

### Modified Files
- `src/components/BrainSwitcher.tsx` — feature flag gate
- `src/components/CreateBrainModal.tsx` — feature flag gate
- `src/components/settings/BrainTab.tsx` — feature flag gate
- `src/components/BottomNav.tsx` — new nav structure
- `src/components/DesktopSidebar.tsx` — new nav structure
- `src/components/MobileHeader.tsx` — hide brain switcher
- `src/OpenBrain.tsx` — new view routing, keyboard shortcut, default view
- `src/components/VaultIntroModal.tsx` — disable auto-prompt
- `src/components/CaptureSheet.tsx` — remove vault trigger, remove type selector
- `src/views/SettingsView.tsx` — restructure tabs
- `src/components/OnboardingModal.tsx` — full rewrite to guided flow
- `src/data/constants.ts` — default provider change
- `src/components/NudgeBanner.tsx` — streak milestone messages
- `.env.example` — add VITE_ENABLE_MULTI_BRAIN
- `index.html` — OG meta tags
- `/api/chat.ts` — vault handling change, provider default
- `/api/capture.ts` — streak tracking on capture

### Unchanged (kept intact)
- All multi-brain API routes (server-side still works)
- VaultView.tsx (accessible via Settings)
- TodoView.tsx (code stays, no nav path)
- GraphView.tsx (code stays, no nav path)
- RefineView.tsx (code stays, no nav path)
- All test files
- Database schema
