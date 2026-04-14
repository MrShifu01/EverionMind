# Launch 2: Deep Audit -- Research Blueprint vs. Codebase Reality

**Date**: 2026-04-12
**Scope**: Thorough comparison of `research/Openai_Gemini.md` (the OpenBrain blueprint) against the actual EverionMind codebase, informed by all future-plans documents and the graphify knowledge graph (758 nodes, 694 edges, 255 communities).

This builds on `launch.md` but goes deeper into specifics. Where `launch.md` said "fix it," this says exactly what, where, and why.

---

## Part 1: What the Research Actually Demanded

The research doc isn't just a feature list. It's a product philosophy built around five non-negotiable principles:

1. **Faster than pen and paper** -- sub-4-second capture, zero-decision entry
2. **Capture now, organize later** -- no forced structure at input time
3. **Privacy by design** -- E2E encryption, local-first, exportable data
4. **Single daily loop** -- Capture > Memory > Insight > Action > Reward > Repeat
5. **One insane moment** -- "What have I been doing wrong?" and getting a real answer
6. **Retention-first growth** -- every growth mechanic must emerge from daily usage, not bolted-on invites (see [Viral Growth Research](#viral-growth-integration) below)

Every feature in the MVP section traces back to these six. Everything else is Phase 2+.

---

## Part 2: Feature-by-Feature Verdict

### KEEP -- You Nailed These

| Feature | Research Alignment | Why It Works |
|---------|-------------------|--------------|
| **Semantic search (pgvector + embeddings)** | Core of "Recall" | Hybrid keyword/vector scoring (70/30) is exactly right. `match_entries` RPC + re-ranking is solid. |
| **Chat with RAG** | Core of "Ask your brain" | Multi-turn history (20 msgs), multi-brain search, vault secret injection. The retrieval pipeline is genuinely good. |
| **Capture (text + voice + files)** | Core of "Capture" | PDF/DOCX/XLSX parsing, voice recording, URL deduplication, auto-embed on capture. This is the strongest part of the app. |
| **Offline-first with sync** | "Local-first future advantage" | IndexedDB cache, offline queue, service worker PWA. Research explicitly called this a moat. Don't touch it. |
| **Auto-enrichment cron** | "Resurfacing insights" | `gap-analyst` cron (Sundays 6am) scans for sparse entries and auto-enriches. This is a proto-version of the insight engine. Keep and expand. |
| **Responsive mobile + desktop** | "Mobile-first entry points" | DesktopSidebar, MobileHeader, BottomNav. Works on both form factors. |
| **BYO API keys** | Power user trust | Research said "ownership." Letting users bring keys = trust + cost savings. |
| **Rate limiting** | Production readiness | Upstash Redis with in-memory fallback. Per-route limits. This is mature infrastructure. |
| **Security headers** | Production readiness | CSP, X-Frame-Options, HMAC cron auth, scrypt key hashing. Solid. |
| **Sentry + Vercel Speed Insights** | Observability | You'll know when things break. Essential for launch. |
| **Test suite (20+ suites)** | Engineering discipline | API tests, component tests, hook tests, view tests. This is better than most indie MVPs. |

**Honest score: 9/10 on technical foundation.** You've built real infrastructure, not a toy.

---

### PRUNE -- Features That Hurt More Than Help at Launch

#### 1. Multi-Brain System (brains, brain_members, brain_invites, brain_api_keys, entry_brains)

**Research said:** "Single Brain. Multi-brain is Phase 3."

**What you built:** Full RBAC (owner/member/viewer), email invitations via Resend, per-brain API keys with scrypt hashing, entry sharing across brains, BrainSwitcher UI, CreateBrainModal.

**Why this hurts:**
- New users see "Personal Brain" and immediately wonder "what other brains are there?" -- cognitive load before they've captured a single note
- Permission model creates edge cases (what happens when a shared entry is deleted by the owner but not the viewer?)
- Brain invites via email require Resend integration, email deliverability testing, token expiry handling
- BrainSwitcher in the sidebar is prime real estate wasted on a feature most users won't use for months

**Action:** Don't delete the code. Feature-flag it. Hide BrainSwitcher, CreateBrainModal, and invite flows behind a `ENABLE_MULTI_BRAIN` flag (env var or user setting). Default to single brain. Ship multi-brain to your first 50 paying users as a beta.

**Files affected:** `src/components/BrainSwitcher.tsx`, `src/components/CreateBrainModal.tsx`, `src/views/SettingsView/BrainTab.tsx`, invite-related API routes.

---

#### 2. Vault (E2E Encrypted Secrets)

**Research said:** Nothing. Encryption isn't in the MVP spec. It's a Phase 2+ trust feature.

**What you built:** AES-256-GCM client-side encryption, recovery key backup (XXXXX-XXXXX format), VaultIntroModal, VaultView, passphrase prompts that interrupt chat flow.

**Why this hurts at launch:**
- Passphrase modal breaks the chat flow (user asks question > vault modal > lost context)
- Recovery key UX is complex and scary ("if you lose this key, your data is gone")
- Key management bugs are the #1 support burden for crypto features
- Zero new users will need encrypted secrets on day 1

**Action:** Keep the code. Disable by default. Move vault setup to a deliberate "Security" section deep in settings. Never prompt for passphrase during chat -- if vault data is needed, show a gentle "unlock vault to include sensitive data" link, not a blocking modal.

**Files affected:** `src/views/VaultView.tsx`, `src/components/VaultIntroModal.tsx`, vault-related chat logic in `/api/chat`.

---

#### 3. Todo View (Calendar-Based Task Management)

**Research said:** "create_task" is one of 3-5 actions. Not a standalone view with mini-calendar, overdue sections, recurring reminders.

**What you built:** Full TodoView with expandable mini-calendar, auto-date extraction from metadata, recurring reminders via day-of-week matching, overdue/today/tomorrow/this-week sections.

**Why this hurts:**
- Competes with Todoist, TickTick, Apple Reminders -- products with 10-year head starts
- Dilutes the core promise ("I'm a second brain, also I do tasks, also I have a calendar")
- The more views you have, the more confused users are about where to go
- Research explicitly listed "create_task" as an *action button on an insight*, not a standalone feature

**Action:** Don't delete. Merge task functionality into the main feed. When the AI suggests "create a task," it becomes an entry with type "task" that shows up in the main grid with a checkbox. Remove the dedicated TodoView from navigation. Tasks live in the brain, not in a separate app.

---

#### 4. LLM Provider Selector (Front-and-Center)

**Research said:** "Speed > perfection. Simple architecture."

**What you built:** ProvidersTab in settings where users choose between Anthropic, OpenAI, OpenRouter, Groq, plus BYO key entry.

**Why this hurts for new users:**
- "Choose your AI provider" is meaningless to 90% of users
- Decision paralysis: "Which one is better? What's OpenRouter? Do I need a key?"
- Wrong choice = bad experience (free OpenRouter models are noticeably worse)

**Action:** Default to your hosted model (Gemini Flash Lite per pricing strategy -- cheapest, fastest). Hide provider selection in "Advanced > AI Settings." BYO keys stay, but buried. New users should never see this.

---

#### 5. Concept Graph (@cosmograph/react)

**Research said:** Nothing about visual graphs in MVP. Phase 2+ "Brain Network" concept.

**What you built:** Interactive knowledge graph visualization using Cosmograph, "Surprisingly Connections" component.

**Why this hurts:**
- Cosmograph + @luma.gl/shadertools add significant bundle size (WebGL shaders)
- Graph views look impressive in demos but provide zero utility for < 50 entries
- New users with 3 entries see an empty graph -- terrible first impression

**Action:** Remove from MVP navigation. Keep the code. Re-introduce when a user hits 50+ entries as a "Your brain is growing -- see the connections" moment. This becomes a reward in the habit loop, not a feature.

---

### ADD -- Critical Missing Pieces

#### 1. Brain Feed (Home Screen) -- CRITICAL

**Research said:** "Home = Brain Feed: resurfaced thoughts, insights, suggested actions."

**What you have:** Chat view or grid view. No feed. New users see an empty grid or chat prompts.

**What to build:**
```
Brain Feed (home screen):
- "Good morning, Christian. Here's what your brain surfaced today:"
- 1-2 resurfaced memories (entries from 1-6 months ago, random weighted by importance)
- 1 pattern/insight (from gap-analyst results, or "You've mentioned X 5 times this month")
- 1 suggested action ("Review your supplier list -- 3 entries are missing phone numbers")
- Capture bar pinned at bottom ("What's on your mind?")
```

**Why it's critical:** This is the daily return trigger. Without it, users open the app, see nothing new, close it. The Feed is also the core of the **Habit Hook Loop** -- the cycle that moves users from needing a notification to *craving* the app:

```
Trigger (internal: "I wonder what my brain surfaced") →
Action (open app, glance at feed, capture a thought) →
Variable Reward (a surprising connection or forgotten memory) →
Investment (every new capture makes the next insight better)
```

The Feed must deliver **variable rewards** -- not the same template every day. Rotate between resurfaced memories, pattern detections, and "did you know?" connections. Unpredictability drives dopamine and return visits.

**AI-driven personalization (non-negotiable by 2026):** The Feed should adapt to user behavior -- if someone captures at 8am daily, the feed should be ready at 7:55am. If they mostly capture business ideas, surface business-related insights, not grocery lists. This doesn't require ML at launch -- simple heuristics on entry timestamps and tags are enough.

**Implementation path:**
- New API route `/api/feed` that returns: random old entries (weighted by age + importance), latest gap-analyst insights, action suggestions
- New `FeedView.tsx` component, set as default home view
- Reuse existing `gap-analyst` cron output as insight source
- Vary the feed composition daily (don't show the same format twice in a row)

**Effort:** 3-5 days for a basic version. Polish over time.

---

#### 2. Onboarding That Demonstrates the Holy Shit Moment -- CRITICAL

**Research said:** "Build 1 strong demo. Record holy shit moment."

**What you have:** `OnboardingModal.tsx` exists but it's a generic walkthrough.

**What to build:**
```
Onboarding flow:
1. "Welcome to Everion. Let's teach your brain."
2. "Paste or type 5-10 things on your mind right now." (bulk capture)
3. "Now ask your brain something hard." (guided prompt: "What patterns do you see?")
4. AI responds with a genuinely insightful pattern from their 5-10 inputs
5. "That's your brain working. Imagine it with 6 months of data."
```

**Why it's critical:** The research says users need the "holy shit" moment in the first session or they never come back. Your current onboarding explains features instead of demonstrating value.

**Tactical rules from viral growth research:**
- **60-second value or bust.** If a user can't experience the core insight in under 60 seconds, they churn. The onboarding must be a *value demo*, not a *product tour*.
- **Progressive onboarding ("learn by doing").** No front-loaded tutorials. Contextual tooltips only when the user reaches a feature naturally. Micro-tasks build momentum.
- **Eliminate registration friction.** One-tap sign-up (Google/GitHub). Delay all non-essential permissions. If you must ask for something (notifications), explain exactly why.
- **Celebrate the first win.** When the AI returns that first insight from their 5-10 inputs, use a subtle animation or visual beat. This is the "instant win" that anchors emotional buy-in.
- **Always allow skip.** Some users will skip onboarding. Make sure they can re-access it from Settings > Help.

**Effort:** 3-4 days. Mostly prompt engineering + a guided capture flow.

---

#### 3. Shareable Insight Cards -- HIGH PRIORITY (v1.1)

**Research said:** "Build shareable outputs: Insight cards, weekly reports, business analysis."

**What you have:** Nothing shareable. All outputs stay inside the app.

**What to build (post-launch, but design now):**
- "Share this insight" button on AI responses
- Generates an OG-image-ready card: quote + brain logo + "everion.app"
- One-click copy to clipboard or share to Twitter/X
- Weekly email digest: "Your brain this week: 12 captures, 3 patterns detected, 1 action suggested"

**Why it matters:** This is your entire growth engine. Users don't invite friends to "a note app." They share insights that make people say "how did your app know that?"

**Growth loop mechanics (from viral research):**
- Shared insights are **social currency** -- they make the sharer look smart. Design the card to be impressive on its own, no context needed.
- Virality must be a *natural extension* of the product, not a "share with 5 friends" nag screen. The loop is: user gets insight → shares it → recipient asks "how?" → downloads app → becomes user → gets own insights → shares.
- **Collaborative "shared brains"** (already built as multi-brain) become the ultimate viral loop in v1.1+: one user *must* invite others for the feature to work. This is the strongest viral mechanic you have -- but it only works after single-brain is proven. Don't rush it.

---

#### 4. Streak / Capture Reward System -- MEDIUM

**Research said:** "Capture > Memory > Insight > Action > **Reward** > Repeat"

**What you have:** No reward mechanism. No gamification. No acknowledgment of consistent use.

**What to build:**
- Simple streak counter: "5-day capture streak" (stored as user metadata)
- NudgeBanner already exists -- use it for streak messages
- Push notification: "Don't break your streak! What's on your mind today?"
- **Brain growth stats:** Show total entries, connections found, insights generated. This leverages the **IKEA effect** -- users who see their brain growing value it more because they built it. "Your brain: 47 memories, 12 connections, 3 insights this week."
- **Switching cost awareness:** Every stat you show reminds users how much they'd lose by leaving. This isn't manipulative -- it's *demonstrating real accumulated value*. A user with 200 entries and 50 connections has a brain that's genuinely hard to rebuild elsewhere.

**Effort:** 1-2 days. Uses existing NudgeBanner + push notification infrastructure + simple metadata queries.

---

### CHANGE -- Things That Need Rework

#### 1. Navigation Structure

**Current:** GridView, ChatView, TodoView, RefineView, VaultView, SettingsView, TrashView + Graph

**Research said:** "Home (feed), Ask (query brain), Memory (history), Profile (brain settings)"

**Proposed MVP navigation:**
```
1. Feed (new) -- Brain Feed, daily insights, resurfaced memories
2. Capture (existing) -- Quick entry, voice, file upload
3. Ask (existing ChatView) -- Chat with your brain
4. Memory (existing GridView) -- Browse all entries
5. Settings (simplified) -- Profile, notifications, advanced
```

Remove from nav: TodoView, RefineView, VaultView, Graph. Tasks become entries in Memory. Refine becomes part of Feed (insights). Vault becomes a settings sub-page. Graph becomes an easter egg at 50+ entries.

---

#### 2. Capture UX -- Almost Right, Needs Speed

**Research said:** "Faster than pen and paper. Under 4 seconds. Invisible interface."

**What you have:** CaptureSheet modal with options for text, voice, file.

**What to change:**
- Make capture accessible from EVERY view (not just via a button)
- Keyboard shortcut: `Cmd+K` or `/` to open capture from anywhere
- Auto-focus the text input on open (if not already)
- Strip the type selector from initial capture. Let AI categorize after. Research explicitly says "Capture Now, Organize Later"
- Voice button should be one-tap record, not "open modal > select voice > tap record"

**Effort:** 1-2 days. Mostly UX restructuring.

---

#### 3. Refine View -- Unclear Purpose

**Current:** "Auto-enrich sparse content and inline gap answers" (from git log). Unclear what the user sees or does here.

**Research alignment:** This maps to the "Insight Engine" (pattern detection, repetition detection, trend analysis) and "Action Layer" (suggest next steps).

**What to change:** Don't make this a separate view. Fold its output into the Brain Feed:
- Gap-analyst finds sparse entries > shows in Feed as "Your entry about X is missing details. Want to enrich it?"
- Pattern detection > shows in Feed as "You mention Y frequently. Here's what that might mean."
- Action suggestions > shows in Feed as actionable cards

**Effort:** Rerouting existing logic, not rebuilding. 2-3 days.

---

## Part 3: Technical Debt That Matters for Launch

### Things That Will Bite You

1. **255 communities in the knowledge graph for ~255 files.** That's nearly 1:1 -- indicates either very modular code (good) or very isolated code (fragmentation risk). Watch for duplicated logic across communities.

2. **vercel.json rewrites are getting complex.** You have legacy route aliases (`/api/delete-entry` > `/api/entries`). Clean these up before launch. Dead routes = confusion for anyone reading your API.

3. **Multiple LLM providers in the chat route.** The `/api/chat` handler juggles Anthropic, OpenAI, OpenRouter, Groq. For MVP, default to one (Gemini Flash Lite per your pricing doc) and route others through a single abstraction. The current multi-provider logic is a maintenance burden.

4. **Embedding model is Gemini (server-side) but chat models are Anthropic/OpenAI.** This is fine architecturally (embeddings don't need to match chat models) but could cause semantic drift if you ever switch embedding providers. Document this decision.

5. **No database migrations tracked in git.** Your `supabase/` directory has schema files, but if migrations aren't versioned, you'll hit issues with staging/production drift.

### Things That Are Fine

- TypeScript strict mode with no unused locals/params -- good discipline
- Vitest + Testing Library for tests -- right choice
- Knip for dead code detection -- smart tooling
- Vite 8 + React 19 -- modern, fast, correct choices
- Tailwind v4 with CVA + clsx + tailwind-merge -- clean component styling pattern

---

## Part 4: Pricing Strategy vs. Codebase Reality

Your pricing doc (`pricing-strategy.md`) is excellent. Gemini Flash Lite at $0.0003/capture and $0.0006/chat is genuinely cheap. 97.6% gross margin on Starter tier.

**But the codebase doesn't implement any of this yet:**
- No `user_usage` tracking table
- No tier enforcement (no "you've hit 50 entries this month" check)
- No Stripe integration
- No upgrade prompts in the UI

**For MVP launch, you have two options:**
1. **Launch free, add tiers in v1.1.** Get users first, monetize second. Risk: users expect free forever.
2. **Launch with Starter + Free tiers only.** Skip Pro. Implement basic usage counting + Stripe checkout. Risk: 3-5 days of billing work before launch.

**Recommendation:** Launch free with a visible "Starter plan coming soon -- early users get 50% off" banner. This sets expectation that it will cost money, creates urgency, and lets you ship sooner.

---

## Part 5: What the Research Got Right That You Should Trust

The research doc isn't just competitive analysis. It contains hard-won product wisdom:

1. **"Start simple and avoid feature bloat."** You didn't follow this. Fix it by hiding, not deleting.

2. **"Solve cognitive overload."** Your app currently *adds* cognitive overload (which view? which brain? which provider?). Simplify navigation to fix.

3. **"Master the Capture-Organize-Retrieve loop."** You've nailed Capture and Retrieve. The gap is Organize -- your entries are flat lists with tags. The research says "bidirectional linking" and "flexible categories." Your `links` table supports this, but the UI doesn't surface it well.

4. **"Privacy by design."** You over-indexed here with the Vault. Privacy at MVP = "we don't train on your data" + "your data is exportable." E2E encryption is a year-2 differentiator, not a launch requirement.

5. **"One use case, one insane experience, daily usage loop."** This is the single most important line in the entire research doc. Everything above traces back to this.

---

## Viral Growth Integration

*Synthesized from `5-viral-points.md` -- the retention-first growth paradigm applied to this launch plan.*

The five viral factors map directly to what's already planned above:

| Viral Factor | Where It Lives in This Plan | Launch Priority |
|:---|:---|:---|
| **Speed to Value** (Aha < 60s) | Onboarding rework (ADD #2) | Day 4-7 |
| **Habit Hook Loop** (trigger → action → variable reward → investment) | Brain Feed (ADD #1) | Day 4-7 |
| **User Investment / IKEA Effect** (growing brain = switching cost) | Streak + brain stats (ADD #4) | Day 4-7 |
| **AI Personalization** (proactive "Next Best Experience") | Feed personalization heuristics | Day 4-7 (basic), v1.1 (advanced) |
| **Sustainable Growth Loops** (retention → sharing → acquisition) | Shareable insight cards (ADD #3) | v1.1 (Week 1-2 post-launch) |

**The key insight:** You don't need a separate "viral strategy." Every viral mechanic is already a feature in the launch plan. The research just confirms *why* each feature matters and adds tactical details on *how* to execute them for maximum retention.

**What this changes in the sprint:**
- Onboarding gets a hard 60-second constraint, not just "guided flow"
- Feed must deliver *variable* rewards (no static templates)
- Streak system shows brain growth stats, not just a day counter
- Insight cards (v1.1) are designed as social currency from day 1, even if sharing ships later

---

## Part 6: The Honest Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Technical foundation** | 9/10 | Genuinely impressive for a solo/small team. Production-grade infrastructure. |
| **Feature completeness** | 8/10 | You built more than the research asked for. That's the problem. |
| **Feature focus** | 4/10 | Too many views, too many options, too many paths through the app. |
| **UX clarity** | 5/10 | Good components, unclear journey. User doesn't know what to do first. |
| **Habit loop** | 2/10 → 7/10 with plan | No feed yet, but hook loop + IKEA effect + streak system designed into sprint. |
| **Viral mechanics** | 1/10 → 6/10 with plan | Nothing shareable yet, but viral research now integrated into sprint. Sharing ships v1.1. |
| **Monetization readiness** | 3/10 | Strategy is excellent (pricing doc), implementation is zero. |
| **Launch readiness** | 5/10 | Ship-ready technically, not product-ready experientially. |

**Overall: 4.6/10 as a product, 9/10 as engineering.**

The gap isn't code quality. It's product discipline.

---

## Part 7: The 14-Day Launch Sprint

### Days 1-3: Simplify
- [ ] Feature-flag multi-brain (hide BrainSwitcher, CreateBrainModal, invite flows)
- [ ] Disable Vault by default (move to Settings > Security, remove chat interruption)
- [ ] Remove TodoView and Graph from navigation
- [ ] Collapse navigation to: Feed | Capture | Ask | Memory | Settings
- [ ] Default AI provider to Gemini Flash Lite, hide provider selector in Advanced

### Days 4-7: Build the Missing Core
- [ ] Build Brain Feed view (resurfaced memories + gap-analyst insights + action cards)
- [ ] Build guided onboarding (5-entry capture > first "ask your brain" > holy shit moment)
- [ ] Add global capture shortcut (Cmd+K or floating button on every view)
- [ ] Strip type selector from capture input (AI categorizes after)
- [ ] Add capture streak counter (metadata + NudgeBanner)

### Days 8-10: Polish
- [ ] Simplify settings to 2 tabs: Profile and Advanced
- [ ] Write clear value-prop copy for onboarding and empty states
- [ ] Test with 3 real users (not developers). Ask: "What does this app do?" If they can't answer in one sentence, fix the messaging.
- [ ] Run `npm run typecheck` and fix all errors
- [ ] Run Knip and remove dead exports/imports

### Days 11-12: Launch Prep
- [ ] Record 60-second demo showing the "holy shit" moment
- [ ] Set up landing page (separate repo/Vercel project)
- [ ] Configure Sentry alerts for error spikes
- [ ] Add "Free during early access -- Starter plan coming soon" banner
- [ ] Write 3 Twitter/X threads for launch day

### Days 13-14: Ship
- [ ] Final UAT pass
- [ ] Deploy to production
- [ ] Post launch threads
- [ ] Monitor Sentry + Vercel analytics for first 48 hours

---

## Part 8: Post-Launch Priority Stack

```
Week 1-2:  Shareable insight cards + weekly email digest
Week 3-4:  Stripe integration + Free/Starter tiers
Week 5-6:  Re-enable multi-brain for paying users
Week 7-8:  Finance entry type (v0.1 from community-brain-and-finance.md)
Month 3:   Entry enrichment (manual lookup button)
Month 4:   Community brain (read-only seed)
Month 5:   Voice-RAG optimization
Month 6:   Discovery queries (v0.6 from entry-enrichment.md)
```

---

## Part 9: The One Thing

If you read nothing else, read this:

**Your app has 7 views, 4 AI providers, encrypted vaults, multi-brain sharing, a concept graph, a todo calendar, and file parsing for 3 document formats.**

**The research said: "One use case. One insane experience. Daily usage loop."**

You are an engineer who built an impressive system. Now you need to be a product person who hides 80% of it behind progressive disclosure and ships the 20% that makes people say "holy shit."

The code is ready. The product needs focus.

Hide features. Nail the feed. Ship the moment.

---

*This assessment is meant to be direct, not discouraging. The technical foundation you've built is genuinely strong -- most indie apps launch with half this infrastructure. The gap is product focus, not engineering capability. Close that gap and you have something real.*
