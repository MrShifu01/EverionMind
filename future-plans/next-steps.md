# EverionMind — Next Steps to Market-Ready

**Date:** 2026-04-22
**Owner:** Christian
**Status:** Pre-launch. Engineering 9/10, Product 5/10, Commercial 3/10.
**Time to revenue:** 2–3 weeks of focused work.
**Time to $1K MRR:** 2–4 months post-launch (organic).
**Time to $10K MRR:** 8–18 months (requires proven retention + a repeatable channel).

This document consolidates the honest commercial audit with every `future-plans/` doc into one ordered roadmap. Read top-to-bottom. Do the work in the order listed. Do not skip ahead.

---

## 1. The Honest Verdict (what this plan is fixing)

- **Tech is strong.** pgvector hybrid search, offline-first sync, E2E vault, rate limiting, CSP, 51 test files, Gemini Flash Lite + Groq Whisper at 87%+ gross margin. Breakeven at 11 Starter users.
- **Product is unfinished.** No brain feed, generic onboarding, too many views, multi-brain + vault + todo + graph all crowding a single-user launch.
- **Commercially zero.** No Stripe. No tier enforcement. No `user_usage` table. No analytics. The app is accidentally free forever.
- **GTM is a blank page.** No documented channel, no content plan, no community motion. "Launch on Product Hunt" is a tactic, not a strategy.

The engineering is done. The product and go-to-market are not. The next 3 weeks close that gap.

---

## 2. The 4 Blockers — Must Ship Before Anything Else

Nothing else on this roadmap matters until these four are done. Do them in this order.

| # | Blocker | Why it blocks launch | Effort |
|---|---|---|---|
| 1 | **Stripe + server-side tier enforcement** | No revenue possible without this. | 5–7 days |
| 2 | **Brain Feed (home screen)** | No habit loop, Day 7 retention < 15%. | 3–5 days |
| 3 | **Onboarding that delivers the aha moment in 60s** | No activation, all acquisition spend wastes. | 3–4 days |
| 4 | **Product analytics (PostHog)** | Flying blind kills iteration speed. | 1–2 days |

Everything in Section 3 expands these four into exact tasks. Everything in Sections 4+ is post-launch.

---

## 3. The 21-Day Launch Sprint

### Week 1 (Days 1–7): Simplify + Monetise

**Goal:** Prune the app back to the MVP surface the research doc actually asked for, and make it possible to charge money.

#### Days 1–3: Prune & Simplify

- [ ] **Feature-flag multi-brain.** Add `ENABLE_MULTI_BRAIN` env flag. Hide `BrainSwitcher`, `CreateBrainModal`, invite flows, `SettingsView/BrainTab`. Default single brain.
- [ ] **Disable Vault by default.** Move to `Settings > Security`. Never interrupt chat with passphrase modals — replace with a gentle inline "unlock vault" link.
- [ ] **Remove from nav:** `TodoView`, `RefineView`, `VaultView`, Concept Graph. Tasks become entries with a checkbox in `Memory`. Refine output folds into the Feed (Day 4–7). Graph becomes a 50+ entries easter egg.
- [ ] **Collapse navigation to:** `Feed | Capture | Ask | Memory | Settings`.
- [ ] **Default AI provider to Gemini Flash Lite.** Hide the provider selector under `Settings > Advanced > AI`. BYO API keys stay but buried.
- [ ] **Clean `vercel.json` rewrites.** Remove legacy aliases (`/api/delete-entry` → `/api/entries`). Dead routes = future confusion.
- [ ] **Run `npm run typecheck` + Knip.** Fix all errors, remove dead exports.

#### Days 4–7: Stripe + Tier Enforcement (Blocker #1)

Reference: `pricing-strategy.md` for tier limits and per-action cost math.

- [ ] **Database migration.** Create `user_usage` table:
  ```sql
  CREATE TABLE user_usage (
    user_id uuid REFERENCES auth.users(id),
    period text, -- '2026-04'
    captures int DEFAULT 0,
    chats int DEFAULT 0,
    voice_notes int DEFAULT 0,
    improve_scans int DEFAULT 0,
    PRIMARY KEY (user_id, period)
  );
  ```
  Add `tier` column (`free | starter | pro`) to `user_profiles`. Track migrations in git under `supabase/migrations/`.
- [ ] **Build `lib/usage.ts` helper.** `checkAndIncrement(userId, action)` returns `{ allowed, remaining }`. Call from `api/capture`, `api/chat`, `api/voice`, `api/improve`. Blocks with 429 if over tier limit.
- [ ] **Stripe integration.**
  - Products: `price_free`, `price_starter_monthly` ($4.99), `price_pro_monthly` ($9.99).
  - Annual discount optional (2 months free).
  - `api/stripe/checkout.ts` — creates Checkout session.
  - `api/stripe/webhook.ts` — syncs `subscription.created|updated|deleted` → `user_profiles.tier`.
  - Customer Portal link in `Settings > Billing` for plan changes.
- [ ] **Upgrade prompts in UI.** When `remaining < 10%`, show a non-blocking banner with "Upgrade" button. When `remaining = 0`, block action with a modal offering Stripe Checkout.
- [ ] **BYO-key users bypass limits.** If `user_ai_settings.provider_key` is set, skip usage check. These users pay nothing for AI and don't need a paid tier unless they want Vault/multi-brain/Improve.

---

### Week 2 (Days 8–14): Build the Missing Core

**Goal:** The app earns Day 7 retention. Users return because something is waiting for them.

#### Days 8–10: Brain Feed (Blocker #2)

Reference: `launch2.md` Part 2, ADD #1. `5-viral-points.md` habit hook loop.

- [ ] **New API route `/api/feed`.** Returns:
  - 1–2 resurfaced memories (entries 1–6 months old, weighted by importance + tag recency)
  - 1 pattern/insight (latest `gap-analyst` cron output, or "You mentioned X 5 times this month")
  - 1 action suggestion ("Your supplier list is missing phone numbers — enrich?")
  - Pinned capture bar: "What's on your mind, Christian?"
- [ ] **New `FeedView.tsx` component.** Set as default home route.
- [ ] **Vary composition daily.** Rotate between resurface / pattern / connection. Never show the same template twice in a row — variable reward is the dopamine mechanism.
- [ ] **Personalisation heuristics (no ML needed at launch).** If user captures at 8am daily, prep feed at 7:55am. If tagged mostly "business", surface business insights. Time-of-day + tag-weight is enough for v1.
- [ ] **Reuse `gap-analyst` cron.** No new backend work — just surface its output in a human UI instead of a debug view.

#### Days 11–13: Onboarding Overhaul (Blocker #3)

Reference: `5-viral-points.md` 60-second aha. `launch2.md` Part 2, ADD #2.

Target: **value demonstrated in under 60 seconds.** Not a tour. A demo.

- [ ] **Replace generic `OnboardingModal.tsx` with a guided flow:**
  1. "Welcome. Let's teach your brain."
  2. Bulk-capture prompt: "Paste or type 5–10 things on your mind right now." (single textarea, line-per-thought, AI splits + categorises).
  3. "Now ask your brain something hard." (guided prompt: "What patterns do you see?")
  4. AI returns a genuinely insightful pattern from their 5–10 inputs.
  5. Celebration beat (subtle animation). "That's your brain working. Imagine it with 6 months of data."
  6. Drop user into Feed (not empty grid).
- [ ] **One-tap Google sign-in.** Shorten forms. Delay notification permission until the user hits a feature that uses it.
- [ ] **Progress indicator.** 3-step checklist at the top of the Feed on Day 1: `✓ Sign up · ✓ First capture · ◯ First insight`. Drives completion psychology.
- [ ] **Skip allowed, but re-accessible.** `Settings > Help > Re-run onboarding`.
- [ ] **Record 60-second demo video.** Screen capture of the above flow. This is your marketing asset, landing page hero, and Twitter launch post.

#### Day 14: Analytics + Global Capture (Blocker #4 + polish)

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
- [ ] **Strip type selector from capture.** Let AI categorise after. "Capture Now, Organize Later" (research line).
- [ ] **Streak counter.** Simple `user_metadata.capture_streak`. Show in Feed header: "🔥 5-day streak · 47 memories · 12 connections". IKEA effect + switching cost awareness in one component.

---

### Week 3 (Days 15–21): Polish, Prep, Ship

#### Days 15–17: Polish

- [ ] **Simplify Settings to 3 tabs:** `Profile · Billing · Advanced`. Everything else collapses inside Advanced.
- [ ] **Empty-state + value-prop copy.** Every screen that can be empty (Feed on Day 1, Memory with 0 entries, Ask with no history) gets clear copy explaining what happens next. No "No results found" — always a call-to-action.
- [ ] **User test with 3 non-developers.** Ask: "What does this app do?" If they can't answer in one sentence, rewrite messaging. Watch them use it silently for 5 minutes. Note every moment of confusion.
- [ ] **Run `npm run typecheck`.** Fix everything.
- [ ] **Run Knip.** Remove dead exports/imports your changes orphaned.
- [ ] **Lighthouse audit.** LCP < 2.5s, CLS < 0.1. Use `chrome-devtools` MCP if needed.

#### Days 18–19: Launch Prep

- [ ] **Landing page** (separate Vercel project). Hero: 60-second demo video. Sections: "Your brain, searchable" · "Pricing" · "FAQ" · CTA → app signup.
- [ ] **Pricing page copy** — use `pricing-strategy.md` Part 6 drafts verbatim, edit for tone.
- [ ] **Sentry alerts** for error-rate spikes (>1% over 5 min). Webhook to your phone/email.
- [ ] **"Free during early access — Starter coming soon"** banner in-app. Creates monetisation expectation without requiring Stripe to be live for every user.
- [ ] **Status page / uptime monitor** (Better Stack or similar, free tier).
- [ ] **Launch-day content drafts:**
  - 3 Twitter/X threads (problem → demo → pricing)
  - 1 Product Hunt draft
  - 1 Hacker News "Show HN" draft
  - 1 Reddit post for r/productivity, r/SideProject
- [ ] **Changelog page** (`/changelog`) for transparent ongoing updates. Retention signal for power users.

#### Days 20–21: Ship

- [ ] **Final UAT.** Every golden path + every error path. Test on mobile Safari, mobile Chrome, desktop Chrome, desktop Firefox.
- [ ] **Deploy to production.**
- [ ] **Post launch content.** Space across the day (Twitter 9am, HN 11am, PH 00:01 UTC, Reddit 2pm).
- [ ] **Monitor first 48 hours.** Sentry + Vercel Analytics + PostHog funnel. Fix anything critical within 1 hour.
- [ ] **Respond to every comment.** First 50 users are hand-held to success.

---

## 4. Month 1–2 Post-Launch (Weeks 4–8) — Retention & Sharing

**Goal:** Prove the habit loop works and start the viral flywheel. Watch the PostHog funnel every morning.

### Metrics to hit before moving on
- Day 7 retention ≥ 25%
- Free → Starter conversion ≥ 3%
- Weekly active users (WAU) growing week-over-week
- < 5% churn in first billing cycle

### What to build

- **Shareable Insight Cards (ADD #3 from `launch2.md`).**
  - "Share this insight" button on AI responses.
  - OG-image-ready card (quote + brain logo + `everion.app`).
  - Copy-to-clipboard + direct share to X, LinkedIn, WhatsApp.
  - **This is your organic acquisition engine.** Users don't invite friends to "a note app." They share AI insights that make them look smart.
- **Weekly Email Digest.**
  - Sunday evening: "Your brain this week — 12 captures, 3 patterns, 1 action suggested."
  - Links back to the Feed. Reactivates dormant users.
  - Use Resend (already integrated for brain invites).
- **Push Notifications (streak reminders).**
  - "Don't break your 7-day streak. What's on your mind?"
  - Respect quiet hours. Dismissible. Opt-out in Settings.
- **Chat Feedback v1** (see `chat-feedback-system.md`).
  - Thumbs up/down on every AI response.
  - Table: `chat_feedback` with question embedding.
  - Feeds into few-shot injection on next chat (top-3 similar thumbs-up examples).
  - Also feeds Layer 1 of `prompt-self-improvement.md` — real data to drive prompt edits.
- **Prompt improvement Layer 1** (see `prompt-self-improvement.md`).
  - Review thumbs-down responses weekly. Edit CAPTURE and CHAT prompts based on actual failure modes, not guesswork.
  - Pull entries with `type: "note"` — classification failures.

### Acquisition channels to test (pick 2, commit 4 weeks each)

| Channel | Why it fits EverionMind | Effort | Signal to watch |
|---|---|---|---|
| **SEO content** — "best second brain app 2026", "Notion alternatives", "AI journaling apps" | High intent traffic, compounds | 2–4 blog posts/week | Organic signups/week |
| **Twitter/X build-in-public** | Aligns with indie-dev narrative, shareable insights | Daily posts, 15min | Follower growth, reply-to-DM rate |
| **Reddit (r/productivity, r/PKMS, r/Notion, r/ObsidianMD)** | Exact audience, competitive positioning works | 2–3 thoughtful posts/week | Signups per post |
| **Partner with a PKM creator** (YouTube, newsletter) | One endorsement > 100 cold posts | 1 outreach campaign | Referral conversions |
| **Product Hunt re-launches** | New features = new PH launches every 6 months | Low | Spike in signups |

**Do NOT:** paid ads before Day 7 retention ≥ 25%. You'll burn money fast.

---

## 5. Month 3–6 — Expand the Moat

By now: 200–500 paying users, $1–3K MRR, clear picture of who the power user is.

### Feature priorities (in order)

1. **Multi-brain for paying users** (unhide the feature flag).
   - Reuses the work already built. Keeps Starter/Pro differentiated from Free.
   - Unlocks the **collaborative shared brains viral loop** — one user must invite others for the feature to function. This is the strongest viral mechanic you have. Only ships now because single-brain retention is proven.
2. **Finance v0.1 — `finance` entry type** (`community-brain-and-finance.md`).
   - Add `finance` to `CANONICAL_TYPES`. Parser recognises "spent R450 on groceries".
   - Smallest surface, highest daily-use lift.
3. **Finance v0.2 — Dashboard view.**
   - Top cards: this month income/expenses/net/savings rate.
   - Category breakdown donut, net-worth line chart.
   - Client-side aggregation from entries — no server work.
4. **Finance v0.3 — Budgets.**
   - Category budgets with progress bars + warnings.
5. **Community Brain v0.1 — read-only seed.**
   - One hard-coded "Everion Community" brain, every user auto-joins as reader.
   - Seed with ~200 example entries.
   - Solves Day-1 emptiness for new users.
6. **Entry Enrichment v0.1 — manual ✨ button** (`entry-enrichment.md`).
   - Google Places + Wikipedia + Gemini grounded fallback.
   - User-triggered, reviewable, never silent. Build the `src/lib/enrich/` router.
7. **Concept Graph re-introduction at 50+ entries.**
   - Only unlock when the user hits 50 entries. "Your brain is growing — see the connections."
   - Reward in the habit loop, not a default nav item.
   - Pair with `graphify-research.md` learnings: confidence labels (EXTRACTED/INFERRED), god-node view, surprising connections.

### Infrastructure milestones
- At 500 paying users: upgrade Supabase compute (Small, +$15/mo).
- Watch Vercel bandwidth — 1TB cap approaching.
- Enable Semantic Caching (`roadmap.md` sub-project 3) for `/v1/context` responses once latency tail shows repeat queries.
- **Upgrade to Vercel Pro** when public launch happens. Currently on Hobby (crons run once/day at a fixed UTC time). Pro enables hourly cron execution so each user's `daily_time` + `daily_timezone` preference in notification settings is actually respected. The handler already supports per-user timezone matching — just needs the hourly schedule to work.

---

## 6. Month 6–12 — Platform & Growth Loops

Target: $10K MRR. Only reachable if retention math holds and one acquisition channel is repeatable.

### Features

- **REST Gateway (`roadmap.md` sub-project 1).** `em_*` API keys, `/v1/context`, `/v1/answer`, `/v1/ingest` endpoints. Enables Everion as a second-brain backend for ChatGPT, Claude Desktop, custom agents. **This is the developer-audience moat.**
- **Usage Tracking (`roadmap.md` sub-project 2).** `api_usage` table, dashboard tab. Depends on REST Gateway.
- **JS + Python SDKs (`roadmap.md` sub-project 5).** Thin wrappers, published to npm + PyPI.
- **Finance v0.4 — RAG-aware finance chat.** Intent classifier routes finance questions through a structured tool (`{kind, category, from, to, agg: "sum"}`) before LLM. "How much did I spend on groceries in March?" → exact number + NL explanation. **This is the "wow" demo.**
- **Finance v0.5 — Recurring auto-generation.** Ghost entries for salary/rent/subscriptions. Upgrade to real on date.
- **Entry Enrichment v0.2–v0.6** — Books/TMDB + Discovery queries (`"what series would I enjoy?"` → TMDB Discover + LLM ranking + Save-to-brain). **The most user-visible enrichment payoff.**
- **Community Brain v0.2–v0.4.** User-created community brains, contributor role, voting, moderation.
- **Prompt Self-Improvement Layer 2** (at ~50 active users). Per-user preference blob injected into system prompts.
- **Prompt Self-Improvement Layer 3** (at ~500 active users). Global correction-pattern analysis, weekly prompt-diff with human-in-the-loop review.
- **External integrations (`future-plans.md`).** vCard contact import first (zero OAuth). Then Google OAuth — plan for 4–6 week scope verification review for Gmail `readonly`.
- **Entry Chunking (`roadmap.md` sub-project 7).** Split long entries into overlapping chunks, dual-embed, dedupe in retrieval. Kicks in when power users start storing SOPs/documents.

### Growth loops to harden

- **Shared brains** (multi-brain now = viral mechanic). One user invites 5 → each of those invites 3 → exponential compounding when the feature is used organically.
- **Insight card share rate.** Instrument: `share_click / insight_view`. Target 5%. Iterate card copy until hit.
- **Referral program** — $5 credit for referrer + referee on Starter upgrade. Only enable once organic share rate > 2%.

---

## 7. What NOT to Build (at least for the first 6 months)

From the honest audit — these are tempting but kill focus:

- **Team/Enterprise tiers.** Don't sell to teams until 1K+ individual paying users prove the product sticks.
- **Mobile native apps.** PWA works. Native comes after $5K MRR.
- **Self-hosted / on-prem.** Every enterprise call will want it. Say no. You're a SaaS.
- **API marketplace / plugin system.** REST Gateway only. No plugins until the platform has a reason to exist.
- **Voice-RAG real-time mode** (`voice-rag-setup.md`). Interesting, but Retell AI + Deepgram stack is a distraction until the feed + onboarding + Stripe are live. Revisit at Month 6+ if voice capture is a top-3 used feature.
- **Concept Graph WebGL polish.** Keep it deferred-until-50-entries. No time spent on graph UX until telemetry shows users are reaching the threshold.

---

## 8. Weekly Rituals (post-launch, forever)

- **Monday 9am:** Review PostHog funnel. Signup → First Capture → First Chat → Day 7 Return → Upgrade. Pick ONE number that dropped this week. Focus all improvement effort on that number until it recovers.
- **Wednesday:** Read every thumbs-down chat feedback from the week. Edit one prompt. Ship.
- **Friday:** Write one public post (blog, thread, or video). Build-in-public compounds.
- **Sunday evening:** Weekly email digest goes out automatically. Review a sample to make sure it's not junk.
- **Monthly:** Review churn list. Email every churned user personally. Ask one question: "What made you cancel?" You'll hear the same 2–3 reasons — fix them in order.

---

## 9. KPIs — The Scoreboard

Track these in a PostHog dashboard pinned to your home screen.

| Metric | Pre-launch target | Month 1 | Month 3 | Month 6 | Month 12 |
|---|---|---|---|---|---|
| Signups | — | 500 | 2,000 | 5,000 | 15,000 |
| Activation rate (signup → first insight) | ≥ 60% | 60% | 65% | 70% | 75% |
| Day 7 retention | ≥ 25% | 25% | 30% | 35% | 40% |
| Free → paid conversion | — | 3% | 4% | 5% | 6% |
| MRR | $0 | $300 | $1.5K | $4K | $10K |
| Gross margin | — | 85% | 87% | 88% | 88% |
| Churn (monthly) | — | < 10% | < 7% | < 5% | < 4% |
| Insight share rate | — | 1% | 2% | 4% | 5% |

If Day 7 retention stalls below 25%, **stop shipping features**. Fix the feed, fix onboarding, fix the prompt. Acquisition without retention is a leaky bucket.

---

## 10. The One Page You Read Every Morning

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

## Appendix A — Source documents consolidated here

All of the following were read and folded into this plan. Keep them for detail, but operate from this file.

- `launch2.md` — the deep audit this roadmap enforces (prune list, add list, change list, scorecard).
- `5-viral-points.md` — retention-first growth paradigm, 60-second aha framework, hook loop, IKEA effect, sharing as social currency.
- `pricing-strategy.md` — tier math, per-action costs, breakeven table, Stripe implementation notes. The numbers behind Blocker #1.
- `roadmap.md` — REST Gateway, usage tracking, semantic caching, billing layer, SDKs, dashboard, entry chunking. All slotted into Month 6–12.
- `community-brain-and-finance.md` — Finance v0.1–v0.7 and Community Brain v0.1–v0.5. Slotted into Month 3–6.
- `entry-enrichment.md` — v0.1 manual button → v0.6 discovery queries. Slotted into Month 3–12.
- `graphify-research.md` — knowledge graph patterns. Fed into Concept Graph re-introduction at 50+ entries.
- `chat-feedback-system.md` — thumbs up/down → few-shot injection. Slotted into Month 1–2.
- `prompt-self-improvement.md` — Layer 1 now (manual edits), Layer 2 at 50 users, Layer 3 at 500 users.
- `future-plans.md` — Google Workspace + Phone contacts OAuth. Slotted into Month 6–12 with scope-approval buffer.
- `voice-rag-setup.md` — Retell AI + Deepgram low-latency stack. Deferred until Month 6+; reconsider only if voice capture is a top-3 used feature.

---

## Appendix B — Order of work (TL;DR checklist)

```
WEEK 1
[ ] Feature-flag multi-brain + vault + todo + graph + provider selector
[ ] Collapse nav to Feed | Capture | Ask | Memory | Settings
[ ] Build user_usage table + tier enforcement middleware
[ ] Stripe Checkout + webhook + Customer Portal
[ ] Upgrade prompts at 90% / 100% of tier limits

WEEK 2
[ ] /api/feed endpoint (resurface + insight + action + capture bar)
[ ] FeedView.tsx as default home
[ ] Onboarding: 5-entry bulk capture → first insight → aha moment
[ ] One-tap Google signin
[ ] PostHog events + funnel dashboard
[ ] Global Cmd+K capture
[ ] Streak counter + brain stats

WEEK 3
[ ] Settings trimmed to Profile | Billing | Advanced
[ ] Empty-state copy audit
[ ] User-test with 3 non-developers
[ ] Typecheck + Knip clean
[ ] Landing page live
[ ] Launch content drafted (4 channels)
[ ] Ship + monitor 48h

MONTH 1-2
[ ] Shareable insight cards + OG images
[ ] Weekly email digest (Resend)
[ ] Push notifications for streak
[ ] Chat feedback thumbs
[ ] Prompt Layer 1 edits from feedback data
[ ] Commit to 2 acquisition channels, 4 weeks each

MONTH 3-6
[ ] Unhide multi-brain for paying users
[ ] Finance v0.1 + v0.2 + v0.3
[ ] Community Brain v0.1 (read-only seed)
[ ] Entry Enrichment v0.1 manual button
[ ] Concept Graph re-enabled at 50+ entries

MONTH 6-12
[ ] REST Gateway + SDKs
[ ] Finance v0.4 RAG chat + v0.5 recurring
[ ] Entry Enrichment v0.2–v0.6
[ ] Community Brain v0.2–v0.4
[ ] Prompt Layer 2 + 3
[ ] External integrations (vCard → Google OAuth)
```

Ship. Measure. Iterate. This is the plan.
