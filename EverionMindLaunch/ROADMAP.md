# Everion Mind — Roadmap (Now → 12 Months)

**Last consolidated:** 2026-04-30 · **Active horizon:** 21-day launch sprint → Year 1 platform

The single forward-looking plan. Everything in this file traces to a real action item; everything in `LAUNCH_CHECKLIST.md` is what's *currently in flight*. When a roadmap milestone becomes the next thing to ship, lift its bullets into the checklist.

---

## North star

> EverionMind exists to give one person a brain that gets smarter every day.

**Engineering 9/10 · Product 5/10 · Commercial 3/10.** The next 3 weeks close the product + commercial gap. After that, retention math drives every feature decision.

| Horizon              | KPI to hit             | Then unlock                              |
| -------------------- | ---------------------- | ---------------------------------------- |
| Week 3               | Launch publicly        | Acquisition channels                     |
| Month 1–2            | Day 7 retention ≥ 25%  | Viral mechanics                          |
| Month 3–6            | $1–3K MRR              | Multi-brain + Finance + Community        |
| Month 6–12           | $10K MRR               | REST Gateway + SDKs + integrations       |

If Day 7 retention stalls below 25%, **stop shipping features.** Fix the feed, fix onboarding, fix the prompt. Acquisition without retention is a leaky bucket.

---

## The 4 launch blockers

Nothing else matters until these four are done. Order is fixed.

| #   | Blocker                                            | Why it blocks launch                         | Effort   |
| --- | -------------------------------------------------- | -------------------------------------------- | -------- |
| 1   | **LemonSqueezy + RevenueCat + tier enforcement**   | No revenue possible without this. Code shipped 2026-04-30; operator config (LS variants, RC dashboard, store products) outstanding. | 1–2 days config |
| 2   | **Brain Feed (home screen)**                       | No habit loop, Day 7 retention < 15%.        | 3–5 days |
| 3   | **Onboarding that delivers the aha moment in 60s** | No activation, all acquisition spend wastes. | 3–4 days |
| 4   | **Product analytics (PostHog)**                    | Flying blind kills iteration speed.          | 1–2 days |

---

## Week 1 (Days 1–7) — Simplify + Monetise

**Goal:** Prune the app back to the MVP surface, make it possible to charge.

### Days 1–3: Prune & Simplify

- [ ] Feature-flag multi-brain. Add `ENABLE_MULTI_BRAIN` env. Hide `BrainSwitcher`, `CreateBrainModal`, invite flows, `SettingsView/BrainTab`. Default single brain.
- [ ] Disable Vault by default. Move to `Settings > Security`. Replace passphrase modals with inline "unlock vault" link.
- [ ] Remove from nav: `RefineView`, `VaultView`, Concept Graph. Refine output folds into the Feed. Graph becomes a 50+ entries easter egg.
- [ ] Collapse navigation to: `Feed | Capture | Ask | Memory | Settings`.
- [ ] Default AI provider to Gemini Flash Lite. Hide provider selector under `Settings > Advanced > AI`. BYOK stays but buried.
- [ ] Clean `vercel.json` rewrites. Remove legacy aliases (`/api/delete-entry` → `/api/entries`).
- [ ] Run `npm run typecheck` + Knip. Fix all errors, remove dead exports.

### Days 4–7: LemonSqueezy + RevenueCat + Tier Enforcement (Blocker #1)

- [x] **Database migration for billing + tier columns** ✅ — `user_usage` (031), `user_profiles.tier` (031), LemonSqueezy/RevenueCat columns (065).
- [ ] Build `lib/usage.ts` — `checkAndIncrement(userId, action)` returns `{ allowed, remaining }`. Call from `api/capture`, `api/chat`, `api/voice`, `api/improve`. Block with 429 if over limit.
- [x] **Payment integration shipped** ✅ — LemonSqueezy for web (merchant of record, handles VAT) + RevenueCat for native iOS/Android (abstracts Apple + Play). Bridge: `lemon-webhook` calls RC `grantEntitlement` so a web purchase shows up as paid on mobile too. Variants: `LEMONSQUEEZY_STARTER_VARIANT_ID` ($4.99/mo), `LEMONSQUEEZY_PRO_VARIANT_ID` ($9.99/mo). Customer Portal in `Settings > Billing` (web → LS portal; native → OS Subscriptions hint). Commit `c484030`.
- [ ] Upgrade prompts: at `remaining < 10%` show non-blocking banner; at `0` block with modal that routes to web checkout (LS) or native paywall (RC SDK) per platform.
- [ ] BYOK users bypass limits. If `user_ai_settings.provider_key` set, skip usage check.

### Definition of done

- [ ] Nav at 5 items
- [ ] Multi-brain, Vault, Refine, Graph hidden behind flags or removed from nav
- [ ] `user_usage` table migrated
- [x] LemonSqueezy + RevenueCat checkout + webhooks live ✅ (code; operator config still pending — see LAUNCH_CHECKLIST Billing section)
- [ ] Upgrade prompt at 90% / 100%
- [ ] `npm run typecheck` clean

---

## Week 2 (Days 8–14) — Build the Missing Core

**Goal:** App earns Day 7 retention. Users return because something is waiting for them.

### Days 8–10: Brain Feed (Blocker #2)

- [ ] New API route `/api/feed` returning:
  - 1–2 resurfaced memories (entries 1–6 months old, weighted by importance + tag recency)
  - 1 pattern/insight (latest `gap-analyst` cron output, or "You mentioned X 5 times this month")
  - 1 action suggestion ("Your supplier list is missing phone numbers — enrich?")
  - Pinned capture bar: "What's on your mind, Christian?"
- [ ] New `FeedView.tsx` component as default home route.
- [ ] Vary composition daily. Rotate resurface / pattern / connection. Variable reward = dopamine mechanism.
- [ ] Personalisation heuristics (no ML at launch). Capture-time-of-day + tag-weight is enough for v1.
- [ ] Reuse `gap-analyst` cron — surface its output in a human UI.

### Days 11–13: Onboarding Overhaul (Blocker #3)

Target: **value demonstrated in under 60 seconds.** Not a tour. A demo.

- [ ] Replace generic `OnboardingModal.tsx` with a guided flow:
  1. "Welcome. Let's teach your brain."
  2. Bulk-capture: "Paste or type 5–10 things on your mind right now." Single textarea, line-per-thought, AI splits + categorises.
  3. "Now ask your brain something hard." Guided prompt: "What patterns do you see?"
  4. AI returns a genuinely insightful pattern from the 5–10 inputs.
  5. Celebration beat. "That's your brain working. Imagine it with 6 months of data."
  6. Drop user into Feed (not empty grid).
- [ ] One-tap Google sign-in. Shorten forms. Delay notification permission until the user hits a feature that uses it.
- [ ] Progress indicator. 3-step checklist at top of Feed on Day 1: `✓ Sign up · ✓ First capture · ◯ First insight`.
- [ ] Skip allowed but re-accessible: `Settings > Help > Re-run onboarding`.
- [ ] Record 60-second demo video. Marketing asset, landing-page hero, Twitter launch post.

### Day 14: Analytics + Global Capture (Blocker #4 + polish)

- [ ] PostHog (free tier). Events: `signup_completed`, `first_capture`, `first_chat`, `first_insight_viewed`, `day_7_return`, `tier_upgraded` / `tier_downgraded`, `capture_method`, `nav_view_active`.
- [ ] Funnel dashboard: Signup → First Capture → First Chat → Day 7 Return → Tier Upgrade.
- [ ] Global capture shortcut. `Cmd+K` / `/` opens `CaptureSheet` from anywhere. Floating FAB on mobile, auto-focus text input.
- [ ] Strip type selector from capture. Let AI categorise after.
- [ ] Streak counter. `user_metadata.capture_streak`. Show in Feed header: "🔥 5-day streak · 47 memories · 12 connections".

### Definition of done

- [ ] `/api/feed` returning 3-card composition
- [ ] `FeedView.tsx` is default home
- [ ] Onboarding aha moment in < 60s
- [ ] One-tap Google sign-in
- [ ] PostHog funnel with 8 events
- [ ] `Cmd+K` works on desktop + mobile
- [ ] Streak counter visible

---

## Week 3 (Days 15–21) — Polish, Prep, Ship

### Days 15–17: Polish

- [ ] Settings to 3 tabs: `Profile · Billing · Advanced`. Everything else collapses inside Advanced.
- [ ] Empty-state + value-prop copy. Every screen that can be empty gets clear copy explaining what happens next. No "No results found" — always a CTA.
- [ ] User test with 3 non-developers. Ask: "What does this app do?" If they can't answer in one sentence, rewrite messaging. Watch silently for 5 minutes. Note every confusion moment.
- [ ] `npm run typecheck` + Knip clean.
- [ ] Lighthouse audit. LCP < 2.5s, CLS < 0.1.

### Days 18–19: Launch Prep

- [ ] Landing page (separate Vercel project). Hero: 60-second demo video. Sections: "Your brain, searchable" · "Pricing" · "FAQ" · CTA → app signup.
- [ ] Pricing page copy from `pricing-strategy.md` Part 6.
- [ ] Sentry alerts for error-rate spikes (>1% over 5 min).
- [ ] "Free during early access — Starter coming soon" in-app banner.
- [ ] Status page / uptime monitor (Better Stack free tier).
- [ ] Launch-day content drafts: 3 Twitter/X threads, 1 Product Hunt, 1 Hacker News "Show HN", 1 Reddit (r/productivity, r/SideProject).
- [ ] Changelog page (`/changelog`).

### Days 20–21: Ship

- [ ] Final UAT — every golden + error path. Mobile Safari, mobile Chrome, desktop Chrome, desktop Firefox.
- [ ] Deploy to production.
- [ ] Post launch content. Spaced across the day (Twitter 9am, HN 11am, PH 00:01 UTC, Reddit 2pm).
- [ ] Monitor first 48 hours. Sentry + Vercel Analytics + PostHog funnel. Fix anything critical within 1 hour.
- [ ] Respond to every comment. First 50 users hand-held to success.

### Definition of done

- [ ] Settings has exactly 3 tabs
- [ ] All empty states have actionable copy
- [ ] 3 non-developer user tests done, confusion addressed
- [ ] Lighthouse green
- [ ] Landing page live
- [ ] Launch content drafted for 4 channels
- [ ] Deployed
- [ ] 48h monitoring shift complete

---

## Month 1–2 (Weeks 4–8) — Retention & Sharing

**Goal:** Prove the habit loop. Watch the PostHog funnel every morning.

### Metrics to hit before moving on

- Day 7 retention ≥ 25%
- Free → Starter conversion ≥ 3%
- WAU growing week-over-week
- < 5% churn in first billing cycle

### What to build

- [ ] **Shareable Insight Cards.** "Share this insight" button on AI responses. OG-image-ready card (quote + brain logo + `everion.app`). Copy-to-clipboard + direct share to X, LinkedIn, WhatsApp. Organic acquisition engine — users share AI insights that make them look smart.
- [ ] **Weekly Email Digest.** Sunday: "Your brain this week — 12 captures, 3 patterns, 1 action suggested." Links back to the Feed. Reactivates dormant users. Use Resend.
- [ ] **Push Notifications (streak reminders).** "Don't break your 7-day streak." Respect quiet hours. Dismissible. Opt-out in Settings.
- [ ] **Chat Feedback v1.** Thumbs up/down on every AI response. `chat_feedback` table with question embedding. Feeds top-3 thumbs-up examples into next chat as few-shot. Also feeds Layer 1 prompt edits.
- [ ] **Prompt Improvement Layer 1.** Weekly review of thumbs-down responses. Edit CAPTURE + CHAT prompts based on actual failure modes.

### Acquisition channels (pick 2, commit 4 weeks each)

| Channel                                                              | Why it fits                          | Effort                    | Signal                        |
| -------------------------------------------------------------------- | ------------------------------------ | ------------------------- | ----------------------------- |
| **SEO content** — "best second brain app 2026", "Notion alternatives", "AI journaling apps" | High intent, compounds | 2–4 posts/week | Organic signups/week |
| **Twitter/X build-in-public**                                         | Indie-dev narrative, shareable insights | Daily, 15 min | Follower growth, DM rate |
| **Reddit** (r/productivity, r/PKMS, r/Notion, r/ObsidianMD)          | Exact audience, competitive positioning | 2–3 posts/week | Signups per post |
| **Partner with a PKM creator** (YouTube, newsletter)                 | One endorsement > 100 cold posts | One outreach campaign | Referral conversions |
| **Product Hunt re-launches**                                         | New features = new launches every 6 mo | Low | Spike in signups |

**Do NOT:** paid ads before Day 7 retention ≥ 25%. You'll burn money fast.

---

### Product Hunt — the public launch (day 60 = ~2026-07-01)

PH visitors aren't random — they're earned. Six levers, ranked by ROI. **Tactical day-by-day calendar lives in `Roadmap/week-1.md` … `week-4.md`** — the section below is the strategic frame.

#### 1. Hunter relationship (highest leverage, hardest to fake)

- Find a hunter with karma in PKM/productivity (past hunters of Notion, Reflect, Mem, Obsidian, Tana, Capacities, Heptabase).
- DM/email 5-10 candidates 2 weeks before launch with: 1-paragraph pitch, 60s demo video link, "would you hunt this?"
- Offer them lifetime Pro access. **One yes is enough.**
- Hunter-led launches outperform self-hunted launches 3-10x. Hunter's followers see the launch in their feed; PH amplifies hunter posts in feed-rank.

#### 2. PH "upcoming" page (free top-of-funnel)

- Submit Everion to `producthunt.com/upcoming` 30 days before launch.
- Public URL with "Notify me" button. PH emails the waitlist on launch day.
- Goal: 200+ signups by launch day. Drive traffic via Twitter daily build-in-public + email beta-list.

#### 3. Launch-day asset quality

- **Submit at 00:01 PST (Pacific) Tuesday-Thursday.** Full 24h visibility window, weekday traffic, US morning kicks in 6h later.
- **Asset = 1280×720 GIF or short MP4 video** (NOT static screenshots — they underperform 2-3x). 8-12s loop showing capture → ask → cited answer.
- **Tagline (60 chars max):** value-driven. Working draft: `"your second brain — kept quietly."`
- **Description (260 chars):** Two-sentence hook. "The fleeting thoughts and the high-stakes facts. One private, encrypted home you can ask anything."
- **Maker comment (within 5 min of launch):** Personal, not corporate. Who you are, why you built it, what makes it different. ~150-250 words.

#### 4. Pre-warmed audience (first hour decides the day)

- First-hour upvotes weight heaviest in PH's ranking algorithm.
- 5-10 friends primed to upvote AND leave a 1-2 sentence genuine comment within 30 min.
- **Real PH accounts only.** PH detects coordinated voting (same IP, account-creation patterns, vote timing) and shadow-bans. One bot-vote can sink the launch.
- Build PH karma during beta phase: comment authentically on 1-2 PH launches/day. Builds your maker profile so PH doesn't see you as a one-shot.

#### 5. Cross-channel push day-of (parallel spikes)

| Time (PST) | Channel | Action |
| ---------- | ------- | ------ |
| 00:01 | PH | Hunter posts (NOT you) |
| 00:05 | Twitter | Pin launch tweet with PH link |
| 00:30 | PH | First-hour upvotes from primed network |
| 03:00 | HN | "Show HN: Everion — second brain with encrypted vault" |
| 06:00 | Reddit r/productivity | Launch post |
| 08:00 | Reddit r/PKMS | Launch post |
| 09:00 | Email | "We're live on PH — link inside" to beta list |
| 10:00 | Reddit r/SideProject | Launch post |
| 12:00 | Indie Hackers | Launch post |
| 14:00 | LinkedIn | Personal post |

#### 6. Day-of engagement (the difference between top 10 and top 30)

- **Reply to every PH comment within 30 min for the first 6 hours.** Comments = engagement signal = ranking boost.
- Block the entire day. No meetings.
- Mid-day Twitter update with rank + traffic spike screenshot. Builds momentum.

#### The bar to hit

| Rank on launch day | Outcome | Approx signups |
| ------------------ | ------- | -------------- |
| Top 30 | Listed but not featured | 100-500 |
| **Top 10** | Featured in PH daily email + sidebar | **500-2000** |
| **Top 5** | + Frontpage exposure | **2000-5000** |
| **Top 3** | + Newsletter mentions for 2-3 weeks (compounding) | **5000-10000** |

#### What NOT to do on launch day

- Don't submit yourself if a hunter is willing — hunter-led is 3-10x better
- Don't recruit upvotes via paid services or coordinated WhatsApp groups (PH detects, shadow-bans)
- Don't post HN/Reddit/IH simultaneously with PH — stagger by 2-6 hours so each spike is independent
- Don't launch on Friday/weekend — PH traffic drops 40-60% vs weekdays
- Don't launch in a holiday week (US Thanksgiving, July 4, Christmas) — traffic halved + competing launches reduced (paradox: also harder to rank because top-3 takes fewer votes)

### Weekly rituals

- **Monday 9am** — Review PostHog funnel. Pick ONE number that dropped. Focus all improvement on it until it recovers.
- **Wednesday** — Read every thumbs-down chat feedback. Edit one prompt. Ship.
- **Friday** — Write one public post (blog, thread, video). Build-in-public compounds.
- **Sunday evening** — Weekly email digest goes out. Review a sample.
- **Monthly** — Email every churned user personally: "What made you cancel?"

---

## Month 3–6 — Expand the Moat

**Starting point:** 200–500 paying users, $1–3K MRR, clear power-user picture.

### Feature priorities (in order)

1. [ ] **Unhide multi-brain for paying users.** Remove `ENABLE_MULTI_BRAIN` flag for Starter/Pro. Reuses already-built work. Differentiates Starter/Pro from Free. Unlocks the **shared brains viral loop** — strongest viral mechanic. Only ships now because single-brain retention is proven.
2. [ ] **Finance v0.1 — `finance` entry type.** Add `finance` to `CANONICAL_TYPES`. Parser recognises "spent R450 on groceries". Smallest surface, highest daily-use lift.
3. [ ] **Finance v0.2 — Dashboard view.** Top cards: month income / expenses / net / savings rate. Category breakdown donut, net-worth line chart. Client-side aggregation from entries.
4. [ ] **Finance v0.3 — Budgets.** Category budgets with progress bars + warnings.
5. [ ] **Community Brain v0.1 — read-only seed.** Hard-coded "Everion Community" brain. Every user auto-joins as reader. Seed with ~200 example entries. Solves Day-1 emptiness for new users.
6. [ ] **Entry Enrichment v0.1 — manual ✨ button.** Google Places + Wikipedia + Gemini grounded fallback. User-triggered, reviewable, never silent. Build `src/lib/enrich/` router.
7. [ ] **Concept Graph re-introduction at 50+ entries.** Only unlock at 50. "Your brain is growing — see the connections." Reward in the habit loop, not a default nav item. Confidence labels (EXTRACTED / INFERRED), god-node view, surprising connections.

### Infrastructure milestones

- [ ] At 500 paying users: upgrade Supabase compute (Small, +$15/mo).
- [ ] Watch Vercel bandwidth — 1TB cap approaching.
- [ ] Enable Semantic Caching for `/v1/context` once latency tail shows repeat queries.
- [ ] Vercel Hobby → Pro at public launch (already on the launch checklist). Pro enables hourly cron execution so per-user `daily_time` + `daily_timezone` preferences actually fire.

---

## Month 6–12 — Platform & Growth Loops

**Target:** $10K MRR. Only reachable if retention math holds and one acquisition channel is repeatable.

### Features

- [ ] **REST Gateway.** `em_*` API keys, `/v1/context`, `/v1/answer`, `/v1/ingest`. Enables Everion as a second-brain backend for ChatGPT, Claude Desktop, custom agents. **The developer-audience moat.**
- [ ] **Usage Tracking.** `api_usage` table, dashboard tab. Depends on REST Gateway.
- [ ] **JS + Python SDKs.** Thin wrappers, npm + PyPI.
- [ ] **Finance v0.4 — RAG-aware finance chat.** Intent classifier routes finance questions through structured tool (`{kind, category, from, to, agg: "sum"}`) before LLM. "How much did I spend on groceries in March?" → exact number + NL explanation. **The "wow" demo.**
- [ ] **Finance v0.5 — Recurring auto-generation.** Ghost entries for salary / rent / subscriptions, upgraded to real on date.
- [ ] **Entry Enrichment v0.2–v0.6.** Books / TMDB + Discovery queries ("what series would I enjoy?" → TMDB Discover + LLM ranking + Save-to-brain). Most user-visible enrichment payoff.
- [ ] **Community Brain v0.2–v0.4.** User-created community brains, contributor role, voting, moderation.
- [ ] **Prompt Self-Improvement Layer 2** (~50 active users). Per-user preference blob injected into system prompts.
- [ ] **Prompt Self-Improvement Layer 3** (~500 active users). Global correction-pattern analysis, weekly prompt-diff with human-in-the-loop review.
- [ ] **External integrations.** vCard contact import (zero OAuth, already shipped) is the current integration surface. No third-party OAuth planned for v1.
- [ ] **Entry Chunking.** Split long entries into overlapping chunks, dual-embed, dedupe in retrieval. Kicks in when power users start storing SOPs/documents.

### Growth loops to harden

- [ ] **Shared brains viral mechanic.** One user invites 5 → each invites 3 → exponential. Instrument invite-to-join conversion.
- [ ] **Insight card share rate.** Instrument: `share_click / insight_view`. Target 5%. Iterate card copy until hit.
- [ ] **Referral program.** $5 credit for referrer + referee on Starter upgrade. Only enable once organic share rate > 2%.

---

## What NOT to build (first 6 months)

Tempting but kill focus:

- **Team/Enterprise tiers** — wait for 1K+ individual paying users.
- **Mobile native apps** — PWA works. Native after $5K MRR. (Capacitor wrap is on the launch checklist as a *separate* track that doesn't block web launch.)
- **Self-hosted / on-prem** — you're a SaaS. Say no.
- **API marketplace / plugin system** — REST Gateway only. No plugins until the platform has a reason to exist.
- **Voice-RAG real-time mode** (Retell AI + Deepgram). Distraction until feed + onboarding + payment configured. Revisit at Month 6+ if voice capture is a top-3 used feature.
- **Concept Graph WebGL polish** — keep deferred until 50-entry threshold. No time on graph UX until telemetry shows users reaching it.

---

## KPIs — the scoreboard

Pin to PostHog dashboard.

| Metric                                   | Pre-launch target | Month 1 | Month 3 | Month 6 | Month 12 |
| ---------------------------------------- | ----------------- | ------- | ------- | ------- | -------- |
| Signups                                  | —                 | 500     | 2,000   | 5,000   | 15,000   |
| Activation rate (signup → first insight) | ≥ 60%             | 60%     | 65%     | 70%     | 75%      |
| Day 7 retention                          | ≥ 25%             | 25%     | 30%     | 35%     | 40%      |
| Free → paid conversion                   | —                 | 3%      | 4%      | 5%      | 6%       |
| MRR                                      | $0                | $300    | $1.5K   | $4K     | $10K     |
| Gross margin                             | —                 | 85%     | 87%     | 88%     | 88%      |
| Churn (monthly)                          | —                 | < 10%   | < 7%    | < 5%    | < 4%     |
| Insight share rate                       | —                 | 1%      | 2%      | 4%      | 5%       |

If Day 7 retention stalls below 25%, **stop shipping features.** Fix the feed, fix onboarding, fix the prompt.

---

## The page you read every morning

Print this. Tape it above the monitor.

> **EverionMind exists to give one person a brain that gets smarter every day.**
>
> Today I am doing the single thing that moves the most important metric this week.
>
> Not two things. Not "and also."
>
> The code is ready. The product needs focus.
>
> Hide features. Nail the feed. Ship the moment.

---

## Appendix — Source documents folded in

- `next-steps.md` (master plan, this file's spine)
- `roadmap/week-{1,2,3}-sprint.md` (extracted from next-steps.md)
- `roadmap/month-{1-2,3-6,6-12}-sprint.md` (extracted from next-steps.md)
- Strategic frameworks: `STRATEGY.md` for positioning, `RESEARCH.md` for competitor evidence, `BRAINSTORM.md` for the priority-scored idea park
