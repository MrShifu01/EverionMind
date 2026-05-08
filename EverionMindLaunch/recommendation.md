# Strategic Recommendation — Everion Mind

> **Snapshot:** 2026-05-08
> **Author:** Claude (advisory) at Christian's request
> **Status:** Opinionated recommendation, not a decision. Decision belongs to Christian.
> **Supersedes:** none. Coexists with `wedge.md`, `open-source-strategy.md`, `STRATEGY.md`.
> **Revisit cadence:** every 30 days OR on any major reframe (job offer, wedge change, OSS decision).

> This file is a **moment-in-time call** based on what's known on the date above. It's intentionally opinionated — hedged advice doesn't help. Treat it as one input to the decision, not the decision itself. If a fact changes, the recommendation changes.

---

## TL;DR

**Two-track play. Job + OSS-with-W1-wedge. App as portfolio-first, business-second.**

| Track | What | Priority |
|---|---|---|
| A | Apply for senior AI/SaaS jobs **NOW** | Highest EV |
| B | Pick W1 (developers / MCP) as primary wedge + go OSS with BSL 1.1 | Conditional win |
| C | Cut app scope ruthlessly before launch (hide W3/W5/W6 surfaces) | Required for Track B |

**Schedule reality.** Current launch target 2026-05-30 = 22 days out. OSS packaging needs 5-7 weeks. **Math does not fit.** Recommendation: delay launch ~6 weeks to ~2026-07-15 and do OSS-first launch with Show HN.

**Single sentence.** Apply for senior AI/SaaS jobs today. Pick W1 as primary wedge. Go OSS with BSL 1.1. Delay launch 6 weeks to do OSS launch right. Treat the whole thing as portfolio-first; whatever business outcome emerges is bonus.

---

## 1. Why this recommendation

The brutal truth has three parts that compound.

**Part 1: The market math.** AI memory category is crowded — Mem.ai, Reflect, Rewind, ChatGPT memory, Apple Intelligence, Gemini-in-Workspace, Tana, Saner. Big platforms ship to billions free, embedded in workflow. Standalone "second memory" fights uphill. Solo against teams. Probabilities for closed-source path: pay-itself 25-30%, indie business 8-12%, notable player <3%. Most likely outcome: ships, 50-200 paying users, modest income or fade in 12-18 months.

**Part 2: The portfolio reality.** The codebase that exists today — vault crypto, MCP server, brain-sharing infrastructure, audit-log discipline, dual-provider billing, persona facts, retrieval pipeline, 30+ audit reports, canonical-memory spec, BYOK abstraction — is a **senior+ engineering portfolio**. It's rare in solo work. Hiring managers at AI/SaaS-tier companies will read this codebase and offer interviews. The portfolio is the unconditional win, regardless of business outcome.

**Part 3: The OSS asymmetry.** Going OSS with the right wedge (W1 developers or W4 privacy hawks) does three things simultaneously: (a) unlocks the W1 channel — HN, GitHub trending, dev community — that closed-source can't access, (b) makes the portfolio publicly verifiable for hiring managers, (c) provides a real moat against incumbents who can't open-source. Even modest OSS traction provides a near-certain path to a senior role. **Even if Everion fails as a business, OSS Everion succeeds as a portfolio.**

The recommendation stacks the three: chase the unconditional win (job) while keeping the conditional moonshot alive (W1 + OSS), and use the same artifact for both.

---

## 2. Track A — Apply for senior roles NOW

**Action:** start interviewing within the next 7 days. Do not wait for launch.

**Targets** (in rough order of fit and reachability):
- Vercel — strong AI/SaaS culture, hires SA-remote, your codebase uses their platform
- Supabase — your dependency, OSS culture, hires globally including SA
- Linear — high-engineering-bar SaaS, remote-friendly
- Notion — adjacent product space, your codebase shows direct relevance
- Anthropic — long shot, but the canonical-memory spec + MCP work is uniquely on-thesis
- Cloudflare — large, hires globally, edge/AI overlap
- Stripe — billing-adjacent codebase work shows
- Smaller well-funded AI startups — Granola, Reflect, Mem.ai (yes, your competitor — they may want to hire you specifically for the same skillset)
- Elastic, Cal.com, Plausible — OSS-aligned cultures

**What to lead with in applications:**
- "Built encrypted personal-memory app at senior-staff scope as solo founder"
- Link to: `EML/Audits/AUDIT-CATALOGUE.md` (when public)
- Link to: `CanonicalMemory.md` spec (when public)
- Link to: `api/mcp.ts` MCP server implementation
- Link to: `supabase/migrations/072_brain_vault_envelope.sql` for crypto chops

**Probability of landing one in 6 months with focused effort:** 50-70%.

**Realistic comp range, SA-remote:**
- Senior at well-funded AI/SaaS shop: $80-200k USD
- Staff at top-tier (Vercel, Stripe, Anthropic): $200-400k USD

**Why this is highest EV.** $150-250k expected value vs ~-$70k EV for "all-in-on-app for 1 year." This is the dominant strategy mathematically.

**Why not wait.** Interviewing while building takes ~10 hr/week. Doing it post-launch (after possibly soft results) is harder than doing it pre-launch with a strong portfolio narrative ("here's what I built solo"). Apply now.

---

## 3. Track B — W1 wedge + OSS

**Wedge selection: W1 (MCP-native personal data layer for AI agent power users).**

**Why W1 over the alternatives:**

| Wedge | Why not |
|---|---|
| W2 SA professionals | Slow ramp, requires legal review, paid demand soft pre-enforcement. Better as **expansion wedge 2** after W1 proof. |
| W3 Couples / families | Channel expensive, low WTP, OSS-incompatible. Skip. |
| W4 Privacy hawks | Strong fit with OSS, but smaller audience than W1 + lower WTP. Use the privacy story as part of W1 messaging instead. |
| W5 SMB operators | OSS-incompatible. Smash Burger Bar story is unfair advantage but the SMB audience is slow + non-technical. **Save as anchor case study for wedge 2 expansion**, not primary. |
| W6 Therapists | HIPAA infrastructure cost too high for solo. Post-traction wedge. |

W1 is the only wedge that **simultaneously**:
- Has the cheapest distribution channel
- Stacks with OSS strategy
- Reuses the existing MCP investment
- Provides the fastest validation loop
- Is the most aligned with what the codebase already does well

**OSS decision: yes, with BSL 1.1, 4-year delay to MIT.**

See `open-source-strategy.md` for full reasoning. Short version:
- BSL protects against competitor fork-and-host
- 4-year delay to MIT keeps community legitimacy
- Enterprise legal accepts BSL (rejects AGPL, doesn't fear MIT/Apache fork-risk)
- Cal.com / Sentry / MariaDB use this exact license — proven pattern

**Business model: open core + paid hosted.**

- **Free / OSS:** full app code, self-host, BYOK, all vault crypto, MCP server, basic AI quotas
- **Hosted Pro $12/mo:** managed infrastructure, hosted AI, higher quotas, mobile builds, backup/restore
- **Team $25/user/mo:** brain sharing, team admin, audit log export, SLA

**Validation milestone (90 days post-launch):** 100 active MCP-tool-using developers, 25% week-1 retention, 20+ paying hosted users.

---

## 4. Track C — Cut scope ruthlessly

**Action:** before public launch, hide every surface that doesn't speak to W1.

**Specific code-touch list:**

| Surface | Action | File / mechanism |
|---|---|---|
| Todo view | Hide via feature flag | `src/views/TodoView.tsx`, `src/lib/featureFlags.ts` |
| Calendar UI | Hide via feature flag | `src/views/CalendarView.tsx` (if exists), feature flag |
| Gmail decisions UI | Hide from non-power users | `src/components/settings/GmailTab.tsx` if exists |
| Family / couples branding | Hide theme variants | `src/design/tokens.css` — `html[class*="family-"]` keep code, hide theme picker |
| Generic landing copy | Rewrite for developers | `src/views/Landing.tsx` |
| Settings tabs | Slim to: Account / Brain / Connections / API keys | `src/components/settings/*` |
| Mobile-first navigation | De-emphasise — focus is web devs | `src/components/MobileMoreMenu.tsx` |

**Surfaces to PROMOTE:**

| Surface | Action |
|---|---|
| MCP catalogue page | Build new `/mcp` route with every tool documented + Claude Code config snippet |
| Self-host docs | New `/docs/self-host` route |
| Architecture / crypto page | New `/docs/architecture` showing what server can vs can't see |
| GitHub repo link | Top-of-fold on landing |
| BYOK setup flow | Make first-class in onboarding |

**Code stays. Surfaces narrow.** Per `wedge.md` discipline: nothing gets deleted, everything that's not W1-relevant gets feature-flagged off.

---

## 5. The schedule reality (load-bearing)

Today is 2026-05-08. Current launch target is 2026-05-30. That's 22 days.

**OSS packaging budget: 5-7 weeks** (per `open-source-strategy.md` § 8). The math does not fit the current target.

### Two options

#### Option 1 — Delay launch to ~2026-07-15. OSS-first launch with Show HN. ✅ Recommended.

**Why:**
- Show HN is a one-shot moment. You get one prime opportunity to be on HN front page with "Show HN: Open-source MCP server for personal memory." If it goes well, that single moment generates more distribution than 6 months of marketing.
- The current 2026-05-30 target is internal, not externally committed. Slipping it is cheap.
- 6 weeks of OSS packaging work also continues to harden the closed-source product. Nothing wasted.
- Job applications can run in parallel during this window. Applications + interviews fit cleanly into 6 weeks.

**Cost:**
- Public claim of "launching May 2026" softens. Update LAUNCH_CHECKLIST.md and STRATEGY.md.
- 6 more weeks of pre-launch fatigue. Real but bearable.

#### Option 2 — Launch closed-source on schedule. Transition to OSS 6-8 weeks post-launch. Acceptable backup.

**Why:**
- Lower-risk. You learn from a closed-source launch first.
- Job leverage from "I have a launched product with users" beats "I have an unlaunched OSS repo" by some margin.

**Cost:**
- The OSS-launch HN moment is gone. Re-launching as OSS later doesn't carry the same weight. "Show HN: I open-sourced my existing app" is third-page material.
- Two launches = two hardening cycles = more total work than one OSS launch.

**Recommendation: Option 1.** The Show HN moment is too valuable to spend on closed-source. Take the 6 extra weeks.

---

## 6. The 12-month plan, compressed

Approximate dates assume Track A starts 2026-05-08 and Option 1 launch schedule.

| Window | Focus | Output |
|---|---|---|
| **2026-05-08 → 2026-05-21** | Apply jobs + decide OSS + start packaging | 5+ applications submitted, OSS yes/no committed, packaging started |
| **2026-05-21 → 2026-06-15** | Cut scope, OSS packaging, first interview rounds | App scoped to W1, self-host docker working, 2-3 interviews underway |
| **2026-06-15 → 2026-07-15** | OSS finalisation + private dev beta + interview rounds | 20 selected devs in private beta, OSS repo polished, offers landing |
| **2026-07-15** | **OSS launch + Show HN + r/LocalLLaMA + MCP Discord** | Public launch moment |
| **2026-07-15 → 2026-10-15 (90-day validation gate)** | Measure: 100 active MCP devs, 25% W1 retention, 20 paying hosted | Validation result + job offer outcome |
| **2026-10-15 — decision branch:** | | |
| └─ W1 working AND no job | Consider full-time on app | Continue solo with traction |
| └─ W1 working AND job offer | **Take job. Keep app as side. Best outcome.** | Pressureless app keeps growing |
| └─ W1 not working AND no job | Pivot to W2 (SA professionals) OR reframe as portfolio + freelance | Adjust strategy |
| └─ W1 not working AND job offer | **Take job. Move app to portfolio mode. Good outcome.** | App at 5 hr/week, life stable |
| **2026-10-15 → 2027-05-08** | Either expand W1 → W2, OR maintain app at portfolio level | TBD by branch above |

The plan **assumes the job lands**. If it doesn't, revisit at 2026-08-15 with adjusted strategy.

---

## 7. What I would NOT do

- **Run W5 (SMB operators).** Despite the unfair Smash Burger Bar advantage, W5 is OSS-incompatible, requires consumer polish, and SMB audience is slow + non-technical. Save Smash Burger Bar as the **anchor case study for wedge 2 expansion**, not the primary wedge. Burning the unfair advantage on a launch wedge wastes it.
- **Market multiple wedges in parallel because "AI makes it easy."** Already rejected in `wedge.md`. Hold the line. AI compresses production, not bandwidth.
- **Quit anything full-time.** Smash Burger Bar continues. Job applications continue. App is side bet. Survival > swing-for-fences.
- **Go MIT or AGPL.** MIT = fork loss. AGPL = enterprise lockout. BSL 1.1 only.
- **Ship OSS half-baked.** Either 5-7 weeks of packaging work, or stay closed. No middle ground.
- **Treat launch as the success criterion.** Success criteria are: (a) job offer in 6 months, (b) 100 active MCP devs in 90 days post-launch, (c) wedge-2 decision by month 6.
- **Pivot the wedge before 90 days unless hard evidence demands it.** Most wedges look dead at week 6 and alive at week 12. Premature wedge-switching is the #1 indie killer.
- **Add a second active wedge before W1 hits validation milestone.** Even if it looks free with AI velocity, it's not free. See `wedge.md` § "On generic / general-audience marketing alongside a wedge."

---

## 8. The single most important sentence

**The unconditional win is the senior role. The conditional win is W1 traction. The bonus win is W1 → W2 → W3 wedge expansion. Stack them in that order.**

Stacked in this order, the worst-case outcome is "you have a senior AI/SaaS role + a quiet OSS portfolio." That outcome is **already much better than 90% of indie SaaS attempts.** The expected outcomes are progressively better than that. The variance is on the upside.

---

## 9. Next concrete actions (this week)

In order:

1. **Decide on this recommendation.** Read it. Pushback. Disagree where you disagree. Update before acting.
2. **Update `STRATEGY.md`** to reflect chosen wedge (W1) and OSS decision (yes, BSL 1.1).
3. **Update `LAUNCH_CHECKLIST.md`** to delay launch to 2026-07-15.
4. **Apply to 5 senior+ AI/SaaS roles by 2026-05-15.** Vercel, Supabase, Linear, Anthropic, Cloudflare. Use the codebase as portfolio.
5. **Begin OSS packaging work** (per `open-source-strategy.md` § 8). Start with self-host Docker compose + auth abstraction.
6. **Set 90-day validation milestone** in calendar — 2026-10-15.
7. **Update `wedge.md` Section 0** to mark W1 as Active Primary (or whatever you choose).

---

## 10. Caveats and what could change this recommendation

- **If you get a senior role offer immediately (week 1-2 of applying):** take it. Reduce app to portfolio mode. Recommendation collapses to "you won."
- **If a closed competitor open-sources first:** OSS becomes table stakes, not differentiation. W1 weakens. Pivot to W4 (privacy hawks) where the encryption story is the moat.
- **If validation milestone misses by ≥80% at 90 days:** kill W1 wedge actively. Re-evaluate W2 or full-portfolio mode. Don't let it limp.
- **If Smash Burger Bar demands more time:** all of this assumes ~30 hr/week available for app + job search. If less, scale every track proportionally — recommend dropping Track B before Track A.
- **If you decide closed-source is actually right:** redirect Track B to "polish closed-source + chase W5 with Smash Burger Bar story." Track A unchanged.

---

## 11. Honest disclosure

This is opinionated advice from an AI advisor based on conversation context, codebase inspection, and standard frameworks (wedge theory, OSS strategy, indie-SaaS economics). It is **not**:

- A substitute for talking to actual senior founders / mentors who can pattern-match against their lived experience
- Knowledgeable about your personal financial situation, family situation, risk tolerance, or career goals
- Aware of factors outside this conversation (offers in flight, conversations with potential customers, personal preferences for engineering vs business work)

Treat as one strong input. Add others. Decide for yourself.

The strongest claim in this doc is the **portfolio-first framing**. Even if you reject every other tactical call, the truth that **OSS Everion is unconditionally a senior+ portfolio that opens job-market doors** survives. That alone changes the math on every other decision.

---

## Maintenance

- **Created:** 2026-05-08
- **Author of recommendation:** Claude (advisory)
- **Decision owner:** Christian
- **Revisit cadence:** every 30 days OR on any major reframe (job offer received, wedge change, OSS reversed, launch delay decided)
- **Supersede policy:** when a major decision is made, update this file with `**Resolved YYYY-MM-DD: [decision]**` block at top. Do not delete prior recommendations — keep for retrospective.
