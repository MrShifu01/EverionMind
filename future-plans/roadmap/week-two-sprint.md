# Week 2 Sprint — Build the Missing Core (Days 8–14)

**Goal:** The app earns Day 7 retention. Users return because something is waiting for them.

---

## Days 8–10: Brain Feed (Blocker #2)

> Reference: `launch2.md` Part 2, ADD #1. `5-viral-points.md` habit hook loop.

- [ ] **New API route `/api/feed`.** Returns:
  - 1–2 resurfaced memories (entries 1–6 months old, weighted by importance + tag recency)
  - 1 pattern/insight (latest `gap-analyst` cron output, or "You mentioned X 5 times this month")
  - 1 action suggestion ("Your supplier list is missing phone numbers — enrich?")
  - Pinned capture bar: "What's on your mind, Christian?"

- [ ] **New `FeedView.tsx` component.** Set as default home route.

- [ ] **Vary composition daily.** Rotate between resurface / pattern / connection. Never show the same template twice in a row — variable reward is the dopamine mechanism.

- [ ] **Personalisation heuristics (no ML needed at launch).** If user captures at 8am daily, prep feed at 7:55am. If tagged mostly "business", surface business insights. Time-of-day + tag-weight is enough for v1.

- [ ] **Reuse `gap-analyst` cron.** No new backend work — just surface its output in a human UI instead of a debug view.

---

## Days 11–13: Onboarding Overhaul (Blocker #3)

> Reference: `5-viral-points.md` 60-second aha. `launch2.md` Part 2, ADD #2.
> Target: **value demonstrated in under 60 seconds.** Not a tour. A demo.

- [ ] **Replace generic `OnboardingModal.tsx` with a guided flow:**
  1. "Welcome. Let's teach your brain."
  2. Bulk-capture prompt: "Paste or type 5–10 things on your mind right now." (single textarea, line-per-thought, AI splits + categorises).
  3. "Now ask your brain something hard." (guided prompt: "What patterns do you see?")
  4. AI returns a genuinely insightful pattern from their 5–10 inputs.
  5. Celebration beat (subtle animation). "That's your brain working. Imagine it with 6 months of data."
  6. Drop user into Feed (not empty grid).

- [ ] **One-tap Google sign-in.** Shorten forms. Delay notification permission until the user hits a feature that uses it.

- [ ] **Progress indicator.** 3-step checklist at top of Feed on Day 1: `✓ Sign up · ✓ First capture · ◯ First insight`. Drives completion psychology.

- [ ] **Skip allowed, but re-accessible.** `Settings > Help > Re-run onboarding`.

- [ ] **Record 60-second demo video.** Screen capture of the above flow. This is your marketing asset, landing page hero, and Twitter launch post.

---

## Day 14: Analytics + Global Capture (Blocker #4 + polish)

- [ ] **PostHog (free tier).** Instrument events:
  - `signup_completed`
  - `first_capture` (time-from-signup)
  - `first_chat` (time-from-signup)
  - `first_insight_viewed` (aha moment proxy)
  - `day_7_return`
  - `tier_upgraded` / `tier_downgraded`
  - `capture_method` (text | voice | file)
  - `nav_view_active` (Feed | Capture | Ask | Memory | Settings)

- [ ] **Funnel dashboard.** Signup → First Capture → First Chat → Day 7 Return → Tier Upgrade. This is your decision-making spine for the next 6 months.

- [ ] **Global capture shortcut.** `Cmd+K` / `/` opens `CaptureSheet` from anywhere. Floating FAB on mobile always visible. Auto-focus text input.

- [ ] **Strip type selector from capture.** Let AI categorise after. "Capture Now, Organize Later".

- [ ] **Streak counter.** Simple `user_metadata.capture_streak`. Show in Feed header: "🔥 5-day streak · 47 memories · 12 connections". IKEA effect + switching cost in one component.

---

## Week 2 Definition of Done

- [ ] `/api/feed` live and returning 3-card composition
- [ ] `FeedView.tsx` is the default home route
- [ ] Onboarding delivers aha moment in < 60 seconds
- [ ] One-tap Google sign-in working
- [ ] PostHog funnel dashboard live with all 8 events
- [ ] `Cmd+K` global capture works on desktop and mobile
- [ ] Streak counter visible in Feed header
