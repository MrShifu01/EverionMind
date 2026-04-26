# Sprint: EverionMind Launch MVP

**Goal:** Ship a focused, retention-ready MVP in 14 days.
**Start date:** 2026-04-14
**End date:** 2026-04-27
**Guiding principle:** Hide 80%, nail the 20% that makes people say "holy shit."

---

## Phase 1: Simplify (Days 1-3 / Apr 14-16)

Strip the app down to its core. No code deletion -- feature flags and nav changes only.

### Task 1.1: Feature-flag multi-brain
- [ ] Add `ENABLE_MULTI_BRAIN` env var (default `false`)
- [ ] Hide `BrainSwitcher` component behind the flag
- [ ] Hide `CreateBrainModal` behind the flag
- [ ] Hide brain invite flows behind the flag
- [ ] Hide `BrainTab` from Settings
- [ ] Verify: app works with single default brain, no UI references to "brains"

**Files:** `BrainSwitcher.tsx`, `CreateBrainModal.tsx`, `SettingsView/BrainTab.tsx`, invite API routes

### Task 1.2: Disable Vault by default
- [ ] Move Vault setup into Settings > Security (not prominent)
- [ ] Remove VaultIntroModal auto-prompt during chat
- [ ] Replace blocking passphrase modal with inline "unlock vault" link in chat
- [ ] Verify: new user never encounters vault unless they seek it out

**Files:** `VaultView.tsx`, `VaultIntroModal.tsx`, vault logic in `/api/chat`

### Task 1.3: Simplify navigation
- [ ] Remove TodoView from nav (tasks become entries with type "task" in grid)
- [ ] Remove Graph/Concept view from nav
- [ ] Remove RefineView from nav (output moves to Feed later)
- [ ] New nav structure: **Feed | Capture | Ask | Memory | Settings**
- [ ] Feed points to placeholder for now (built in Phase 2)
- [ ] Verify: only 5 nav items visible, all functional

**Files:** `BottomNav.tsx`, `DesktopSidebar.tsx`, router config

### Task 1.4: Default AI provider
- [ ] Set Gemini Flash Lite as the default provider for new users
- [ ] Move provider selector to Settings > Advanced > AI Settings
- [ ] Hide provider choice from onboarding entirely
- [ ] Verify: new user gets working AI without choosing a provider

**Files:** `ProvidersTab.tsx`, default provider config, `/api/chat`

### Phase 1 exit criteria
- [ ] `npm run typecheck` passes
- [ ] App loads with simplified nav
- [ ] New user flow has zero decisions before first capture
- [ ] All hidden features still work when flags are toggled on

---

## Phase 2: Build the Core (Days 4-7 / Apr 17-20)

Build the three missing pieces that drive daily return + first-session conversion.

### Task 2.1: Brain Feed (home screen) -- CRITICAL
The Feed is the habit loop engine. Without it, users open the app, see nothing, leave.

- [ ] Create `/api/feed` endpoint:
  - Returns 1-2 resurfaced entries (random, weighted by age 1-6 months + importance)
  - Returns latest gap-analyst insight (reuse existing cron output)
  - Returns 1 action suggestion (entries missing data, patterns detected)
  - Returns user streak data
- [ ] Create `FeedView.tsx`:
  - Greeting: "Good morning, [name]. Here's what your brain surfaced today:"
  - Resurfaced memory cards (tappable, expand to full entry)
  - Insight/pattern card (from gap-analyst)
  - Action suggestion card
  - Streak display + brain stats ("47 memories, 12 connections")
  - Capture bar pinned at bottom: "What's on your mind?"
- [ ] Set Feed as default home view
- [ ] Feed content varies daily (rotate card types, don't repeat template)
- [ ] Empty state for new users: "Your brain is empty. Let's fix that." → links to capture
- [ ] Verify: returning user sees new content daily, new user sees helpful empty state

**Acceptance:** User opens app → sees personalized feed → taps capture bar → adds entry → returns next day → sees different content.

### Task 2.2: Guided onboarding -- CRITICAL
Must deliver the "holy shit" moment in under 60 seconds.

- [ ] Replace current `OnboardingModal.tsx` with guided value demo:
  1. "Welcome to Everion. Let's teach your brain."
  2. Bulk capture prompt: "Paste or type 5-10 things on your mind right now." (multi-line input, one thought per line)
  3. AI processes all inputs (parse + embed, show brief loading state)
  4. Guided first query: "Now ask your brain something hard." (suggest: "What patterns do you see?")
  5. AI returns insight from their inputs
  6. Celebration beat (subtle animation): "That's your brain working. Imagine 6 months of data."
- [ ] One-tap signup (Google OAuth at minimum, GitHub optional)
- [ ] Skip button on every step
- [ ] Re-access onboarding from Settings > Help
- [ ] Timer constraint: steps 1-6 must be completable in under 60 seconds (excluding AI response time)
- [ ] Verify: test with a non-developer -- can they complete onboarding and articulate what the app does?

**Acceptance:** New user signs up → completes onboarding → says "oh that's cool" → captures another thought voluntarily.

### Task 2.3: Global capture shortcut
- [ ] Add floating capture button visible on every view (not just via nav)
- [ ] Keyboard shortcut: `Cmd+K` / `Ctrl+K` to open capture from anywhere
- [ ] Auto-focus text input on open
- [ ] Remove type selector from initial capture (AI categorizes after submission)
- [ ] Voice button: one-tap record (no modal intermediary)
- [ ] Verify: capture is accessible from Feed, Ask, Memory, and Settings views

**Files:** `CaptureSheet.tsx`, global keyboard listener, view layouts

### Task 2.4: Streak + brain stats
- [ ] Add streak tracking to user metadata (consecutive days with at least 1 capture)
- [ ] Display streak in Feed: "5-day capture streak"
- [ ] Brain growth stats in Feed: total entries, connections found, insights generated
- [ ] NudgeBanner message for streak milestones (3, 7, 14, 30 days)
- [ ] Push notification for streak at risk: "Don't break your streak!"
- [ ] Verify: streak increments correctly, resets on missed day, displays in Feed

### Phase 2 exit criteria
- [ ] Feed shows personalized content for users with entries
- [ ] Feed shows helpful empty state for new users
- [ ] Onboarding delivers insight in under 60 seconds
- [ ] Capture accessible from every view via button + keyboard shortcut
- [ ] Streak counter working and visible
- [ ] `npm run typecheck` passes
- [ ] Test suite passes

---

## Phase 3: Polish (Days 8-10 / Apr 21-23)

Tighten the UX, clean the codebase, test with real humans.

### Task 3.1: Settings simplification
- [ ] Collapse settings to 2 main tabs: **Profile** and **Advanced**
- [ ] Profile: name, avatar, notifications, account
- [ ] Advanced: AI provider, API keys, Security (vault), data export
- [ ] Verify: settings feel simple, power features are findable but not prominent

### Task 3.2: Copy and empty states
- [ ] Write clear value-prop copy for:
  - Onboarding screens
  - Feed empty state
  - Memory (grid) empty state
  - Ask (chat) empty state
- [ ] Every empty state has a CTA that leads to capture
- [ ] Consistent voice: direct, warm, not corporate

### Task 3.3: User testing
- [ ] Test with 3 real users (NOT developers)
- [ ] Test script:
  1. "Sign up and use this app for 5 minutes"
  2. Ask: "What does this app do?" (if they can't answer in one sentence, fix messaging)
  3. Ask: "Would you open this tomorrow?" (if no, find out why)
  4. Note: where they get confused, where they hesitate, what they try to tap that doesn't work
- [ ] Document findings
- [ ] Fix top 3 friction points from testing

### Task 3.4: Code cleanup
- [ ] `npm run typecheck` -- fix all errors
- [ ] Run Knip -- remove dead exports/imports created by Phase 1 changes
- [ ] Verify test suite passes
- [ ] Check for console.logs in production paths
- [ ] Review Production-security-checklist items (see `future-plans/Production-security-checklist`)

### Phase 3 exit criteria
- [ ] 3 real users tested, top 3 issues fixed
- [ ] All empty states have clear copy + CTAs
- [ ] No typecheck errors, no dead imports, test suite green
- [ ] Security checklist reviewed (critical items addressed)

---

## Phase 4: Launch Prep (Days 11-12 / Apr 24-25)

Everything needed to go live.

### Task 4.1: Demo and landing
- [ ] Record 60-second screen recording showing the "holy shit" moment (onboarding flow)
- [ ] Landing page: set up simple page (separate Vercel project or single-page in this repo)
  - Hero: one sentence + demo video
  - 3 value props (capture, ask, grow)
  - "Try free" CTA → app signup
- [ ] OG image + meta tags for social sharing

### Task 4.2: Monetization placeholder
- [ ] Add banner in app: "Free during early access -- Starter plan coming soon. Early users get 50% off."
- [ ] Banner links to nothing yet (or a "notify me" email capture)
- [ ] Sets user expectation that app will cost money

### Task 4.3: Monitoring setup
- [ ] Verify Sentry alerts configured for error spikes
- [ ] Verify Vercel Speed Insights active
- [ ] Set up a simple uptime check (free tier of any uptime service)
- [ ] Test: trigger a fake error, confirm Sentry captures it

### Task 4.4: Launch content
- [ ] Write 3 Twitter/X threads:
  1. "I built a second brain app. Here's what it does." (demo thread)
  2. "The tech stack behind Everion" (developer audience)
  3. "Your notes app is a graveyard. Here's why." (pain point thread)
- [ ] Draft Product Hunt listing (title, tagline, description, screenshots)
- [ ] Identify 5-10 communities to post in (Reddit, Indie Hackers, HN, relevant Discords)

### Phase 4 exit criteria
- [ ] Demo video recorded and watchable
- [ ] Landing page live with working CTA
- [ ] Early access banner visible in app
- [ ] Sentry + monitoring confirmed working
- [ ] Launch content drafted and ready to post

---

## Phase 5: Ship (Days 13-14 / Apr 26-27)

### Task 5.1: Final checks
- [ ] Full UAT pass: sign up → onboarding → capture → ask → feed → next day feed
- [ ] Test on mobile (Chrome Android, Safari iOS) + desktop
- [ ] Test offline capture + sync (existing PWA)
- [ ] Verify rate limiting works under load
- [ ] Check all env vars set in production Vercel project

### Task 5.2: Deploy
- [ ] Deploy to production
- [ ] Smoke test production URL
- [ ] Verify Sentry receiving production events
- [ ] Verify analytics tracking

### Task 5.3: Launch
- [ ] Post Twitter/X threads
- [ ] Post to communities (stagger over 48 hours, don't spam)
- [ ] Submit to Product Hunt (schedule for Tuesday/Wednesday morning)
- [ ] Monitor Sentry + Vercel analytics for first 48 hours
- [ ] Respond to every early user comment/question within 2 hours

### Phase 5 exit criteria
- [ ] App live in production
- [ ] First real users signed up
- [ ] No critical errors in Sentry
- [ ] Launch posts published

---

## Post-Launch Priority Stack

After ship, work in this order:

| Week | Focus | Key Deliverable |
|------|-------|----------------|
| **Week 1-2** | Shareable insight cards | "Share this insight" button → OG-image card → clipboard/social share |
| **Week 1-2** | Weekly email digest | "Your brain this week: X captures, Y patterns, Z suggestions" |
| **Week 3-4** | Stripe + Free/Starter tiers | Usage tracking table, tier enforcement, Stripe Checkout |
| **Week 5-6** | Re-enable multi-brain | For paying users only, remove feature flag for Starter+ |
| **Week 7-8** | Finance entry type | v0.1 from community-brain-and-finance.md |
| **Month 3** | Entry enrichment | Manual lookup button per entry |
| **Month 4** | Community brain | Read-only seed brain |
| **Month 5** | Voice-RAG optimization | Lower latency, better transcription |
| **Month 6** | Concept graph relaunch | Unlock at 50+ entries as a "brain growth" reward |

---

## Success Metrics

Track these from day 1:

| Metric | Target (30 days) | How to Measure |
|--------|-------------------|----------------|
| **Signups** | 100+ | Supabase auth count |
| **Day 1 retention** | >40% | Users who return within 24 hours |
| **Day 7 retention** | >20% | Users active on day 7 |
| **Onboarding completion** | >70% | Users who finish all 6 steps |
| **Captures per active user** | >3/day | Entry count / DAU |
| **Feed opens per active user** | >1/day | Feed view count / DAU |
| **Streak holders (7+ days)** | >10% of actives | Streak metadata query |

If Day 1 retention is below 40%, the onboarding isn't landing -- fix it before anything else.
If captures per user are below 3/day, the capture UX has too much friction -- simplify further.

---

## Reference Documents

- `future-plans/launch2.md` -- Deep audit and full rationale for every decision above
- `future-plans/5-viral-points.md` -- Retention-first growth research (integrated into launch2.md)
- `future-plans/pricing-strategy.md` -- Tier structure, costs, breakeven analysis
- `future-plans/Production-security-checklist` -- Pre-ship security checklist
- `future-plans/community-brain-and-finance.md` -- Post-launch finance features
- `future-plans/entry-enrichment.md` -- Post-launch enrichment features
- `future-plans/voice-rag-setup.md` -- Voice optimization roadmap
