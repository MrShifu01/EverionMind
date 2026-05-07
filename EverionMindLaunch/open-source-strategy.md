# Open Source Strategy — Everion Mind

> Strategic-direction decision doc. Whether to take Everion open source, what license, what business model, what the prerequisites are, and how the choice interacts with the wedge framework in `wedge.md`.
>
> **Status:** UNDECIDED as of 2026-05-07. Decision target: 2026-05-21 (before launch lock).
> **Related:** `wedge.md` (wedge framework), `STRATEGY.md` (positioning).

---

## TL;DR

| Question | Answer |
|---|---|
| Worth pursuing? | **Yes — but only if all 4 prerequisites are met (see § 9).** |
| Compatible with all wedges? | **No.** Locks wedge selection to W1, W2, or W4 (see § 5). |
| Recommended license? | **BSL 1.1 with 4-year delay to MIT** — not MIT, not AGPL. |
| Recommended business model? | **Open core + paid hosted** — Cal.com / Plausible model. |
| Probability impact? | Modest upside on revenue; **major upside on career capital**. |
| Worst-case warning? | Half-hearted OSS = worst of both worlds. Do it fully or not at all. |

---

## 1. The question

Should Everion Mind go fully open source — codebase public, self-host supported, hosted version paid — instead of remaining closed-source SaaS?

The privacy claims, encryption-first architecture, and audit-discipline already shipped make this question genuine. Closed-source privacy claims are "trust me." Open-source privacy claims are "verify me."

This doc evaluates the trade-off honestly.

---

## 2. The case FOR

### 2.1 Trust amplification

The strongest possible proof of every privacy claim Everion makes today (POPIA / GDPR / E2E vault / "we can't read your notes") is the source code itself. A privacy-conscious customer cannot verify a closed-source claim. They can verify an open-source one. This is decisive for the privacy-conscious audience.

### 2.2 Distribution channel built-in

OSS unlocks free distribution channels closed-source can't access:
- Hacker News front page (Show HN posts)
- GitHub trending
- r/selfhosted (~370k members)
- r/privacy (~1.4M members)
- OSS-focused newsletters: Console, OSS Insight, GitHub Trending Daily
- Awesome-lists (`awesome-self-hosted`, `awesome-mcp-servers`)

For a solo founder with no marketing budget, these channels matter. Closed-source competitors literally can't access them.

### 2.3 Defensibility against incumbents

Notion can't open-source. Mem.ai can't open-source. Apple won't. OpenAI won't. OSS becomes a real moat against well-funded closed competitors. Bitwarden survived against 1Password specifically because of this. The bigger the closed competitor, the less they can copy your move.

### 2.4 Real precedents at solo / small-team scale

- **Cal.com** — open-source Calendly competitor. $1M+ ARR, Series A.
- **Plausible** — open-source Google Analytics alternative. Sustainable indie.
- **Bitwarden** — dominates password managers despite 1Password's head start.
- **Standard Notes** — open-source encrypted notes. Profitable.
- **Joplin** — open-source notes app. Sustainable indie.
- **Supabase** — your dependency. Open-source Firebase alternative. Series C.

Open-source-as-business is real. Not theoretical.

### 2.5 Career capital — the underrated win

Today the audit catalogue, canonical-memory spec, brain-sharing infrastructure, MCP integration, vault crypto, and dual-provider billing live in a **private** repo. Hiring managers can't see any of it.

Going OSS makes the entire portfolio publicly verifiable. That alone is +$50k-$150k career-capital uplift, **regardless of business outcome.** Senior eng role at AI/SaaS company becomes near-certain. Closed-source Everion does not give you that visibility.

This is the one unconditional benefit. Even if the business fails, OSS Everion succeeds as a portfolio.

### 2.6 Community contribution leverage

Bug fixes, integrations, translations, docs, ports — these can come from the community. A solo dev gets engineering leverage that closed-source can't unlock. Caveat: realistic conversion is low — most OSS projects get 95% drive-by issues and 5% real contribution. But the 5% compounds.

---

## 3. The case AGAINST

### 3.1 Self-host crowd doesn't pay

The free-rider rate on OSS projects is brutal. Self-hosters often won't convert to paid hosted. Bitwarden is the exception. Most OSS projects convert <5% from self-host to paid hosted.

For Everion: if the wedge is privacy hawks (W4), this is acute — they're the most likely to self-host AND least likely to pay.

### 3.2 Maintenance EXPANDS, not contracts

Community PRs need review (often slower than writing yourself). Issues need triage. Discord / Discussions become a job. Solo OSS = **+20 hr/week minimum** on community work after launch. You'd pay this cost in attention.

Alternative: deliberate non-responsiveness ("issues are read but not always answered"). Some OSS founders do this. Has its own cost — community quality degrades fast.

### 3.3 Fork risk

If the hosted business succeeds, fork-and-host competitors emerge. Cal.com had this happen multiple times. Mitigation = license choice (BSL or AGPL). Without it, MIT / Apache competitors can spin up "Everion Hosted Cheap™" overnight.

### 3.4 Code goes public — every hack visible

Every TODO, every "this is gross but ships," every workaround for an iOS Safari quirk becomes public scrutiny. The Everion codebase is **above average for solo work** — the audit discipline shows — but pre-launch state still has rough edges. OSS forces polish before launch, or shipping rough.

### 3.5 Self-host packaging is REAL engineering

The app currently relies on Supabase (services, not bundled) + Vercel (services, not bundled). Self-host means:

- Docker Compose for Postgres + auth + storage
- Migration bundle that runs on plain Postgres without Supabase admin functions
- Replacement for Supabase auth (or self-hostable Supabase)
- Replacement for Vercel-specific features (cron, edge config, image optimisation)
- Documentation for setup, env vars, upgrade path
- CI to test self-host install on every release

Realistic estimate: **2-3 weeks of focused engineering** before OSS launch. Half-baked self-host kills the launch — disappointed early users post screenshots of broken installs to HN. Worse than not launching OSS at all.

### 3.6 Pricing pressure

OSS hosted competitors price-shame each other. Hosted tier ceiling drops to $10-15/mo for most OSS projects. Closed-source equivalent could charge $25-50/mo for same value. Lower price ceiling = lower revenue per user = harder economics.

### 3.7 License choice is high-stakes

| License | Use case | Risk |
|---|---|---|
| **MIT / Apache 2** | Friendliest. Maximum adoption. | Competitors fork freely and host cheaper. Strategic loss. |
| **AGPL v3** | Forces SaaS forks to also open-source. Strong protection. | Enterprise legal teams refuse to touch AGPL. Locks out the highest-value buyers. |
| **BSL 1.1** (Business Source License) | Cal.com / Sentry / MariaDB / CockroachDB pattern. Restricted commercial use for N years (typically 4), then automatically converts to MIT. | Slight community pushback ("not real OSS"). Some OSS purists boycott. |
| **Elastic License v2 / SSPL** | Mongo / Elastic pattern. Non-compete clauses. | Not OSI-approved. Excluded from "true open source" lists. Drives away purists. Rejected by Linux distros. |

**Wrong choice is hard to reverse.** Switching from MIT to BSL after launch is functionally impossible (existing copies stay MIT forever). Switching from AGPL to MIT is fine. Switching from BSL to MIT is fine.

**Recommendation: BSL 1.1, 4-year delay, MIT change-license.** This is the Cal.com pattern. Protects you from competitor-fork-and-host while still being recognisably open. Enterprise will accept it (BSL has clear commercial-use rules).

### 3.8 Pre-launch OSS = no community yet

OSS projects with traction get GitHub stars, contributors, organic mentions. OSS projects without users get tumbleweed. Going OSS at launch is not magic — you still need the wedge to drive initial traffic. OSS amplifies an existing wedge; it doesn't replace one.

---

## 4. Business model decision

### 4.1 Options

| Model | Description | Examples | Fit for Everion |
|---|---|---|---|
| **Open core + paid hosted** | Free open-source core. Paid hosted with managed infrastructure. Some features hosted-only (team, advanced AI, enterprise SSO). | Cal.com, Plausible, Supabase | **Strong fit** |
| **Hosted-only paid** | All code OSS. Free if you self-host. Paid only for hosted convenience. | Standard Notes, Joplin Cloud | OK fit. Lower revenue ceiling. |
| **Sponsored / freemium hosted** | Free hosted with limits. Paid for pro. GitHub Sponsors / Polar funding alongside. | Many smaller OSS projects | Weak fit — limits are easy to circumvent if code is open. |
| **Dual license** | OSS license for community + commercial license for enterprises that don't want OSS terms. | MongoDB (historically), Sentry | Possible but adds legal complexity solo can't easily handle. |
| **Foundation + services** | Donate to a foundation, charge for support. | Linux, Postgres | Not viable for single-product solo. |

### 4.2 Recommended

**Open core + paid hosted** with this split:

| Free / OSS | Hosted Pro ($10-15/mo) | Team ($25/user/mo) |
|---|---|---|
| Full app code | Managed infrastructure | Brain sharing |
| Self-host (Docker + Postgres) | Hosted AI (no BYOK needed) | Team admin |
| BYOK for hosted | Higher AI quotas | Audit log export |
| All vault crypto | Mobile app builds | SLA |
| MCP server | Backup / restore | Priority support |
| Basic AI quotas | | |

**Why this split.** Self-host crowd gets full functionality (no crippleware) — they're not a paying segment anyway. Paid tiers earn their price through infrastructure + team features the self-hosters won't reproduce.

---

## 5. Wedge interaction matrix

OSS narrows the viable wedge selection. Some wedges become MORE viable; others become incompatible.

| Wedge | OSS impact | Why |
|---|---|---|
| **W1 Developers (MCP)** | **Massive boost** | "Open-source MCP server for personal memory" is a 10x stronger HN headline. Devs prefer OSS by default. Self-host is native to the audience. |
| **W2 SA professionals** | **Boost** | "Audit our code, self-host on your firm's infrastructure, compliant by construction" is a compliance story. POPIA-conscious legal/medical professionals will pay extra for verifiability. |
| **W3 Couples / families** | Negligible | Couples don't care about source code. OSS messaging confuses the positioning. |
| **W4 Privacy hawks** | **OSS IS this wedge** | Without OSS, W4 is essentially non-viable. With OSS, W4 unlocks. |
| **W5 SMB operators** | Negative | SMB owners don't audit code. OSS messaging dilutes the operator-focused positioning. Smash Burger Bar restaurant case study doesn't gain from OSS. |
| **W6 Therapists** | Slight negative | Compliance-conscious therapists may prefer commercial tools with SLAs and clear vendor accountability. OSS implies "you're on your own." |

**Translation.** Going OSS = primary wedge must be W1, W2, or W4. The others become incompatible or weaker.

If you've already decided W5 (operators / Smash Burger Bar story) is the primary wedge, **do not go OSS**. The two strategies fight each other.

If primary wedge is W1, W4, or both, **OSS strongly improves the math.**

---

## 6. Probability shift (honest)

### Closed-source path (current trajectory)

| Outcome | Probability |
|---|---|
| Pay-itself ($1-2k MRR year 1) | 25-30% |
| Sustainable indie ($5-10k MRR) | 8-12% |
| Notable player in category | <3% |
| Big exit / VC | <1% |
| Quiet fade in 12-18 months | ~50% |

### Open-source path (with W1 or W4 primary, BSL license, proper packaging)

| Outcome | Probability | Delta |
|---|---|---|
| Pay-itself ($1-2k MRR year 1) | **30-40%** | +10% |
| Sustainable indie ($5-10k MRR) | **12-18%** | +5% (Cal.com / Bitwarden territory) |
| Notable player in category | **3-7%** | +3% (real shot at GitHub trending / OSS recognition) |
| Big exit / VC | 1-2% | +1% (Cal.com Series A precedent) |
| Quiet fade in 12-18 months | ~40% | -10% |
| **Job-leverage probability** | **~85%** | **MAJOR boost** — OSS portfolio at this quality is rare |

### Asymmetric upside

The probability deltas above are modest. The unconditional career-capital uplift is the big one. **Even if the business doesn't break out, OSS Everion succeeds as a portfolio.** A senior AI/SaaS engineering role becomes near-certain.

This is the strongest case for OSS: the worst case is still good.

---

## 7. License decision — recommended

**BSL 1.1 with 4-year delay to MIT.**

```
Licensor:               Christian Stander / Smash Burger Bar
Licensed Work:          Everion Mind
Additional Use Grant:   You may use the Licensed Work for production purposes
                        if such use does not constitute a "Memory-as-a-Service
                        offering," meaning a service that competes with the
                        Everion Mind hosted product.
Change Date:            Four years from the date the Licensed Work is published.
Change License:         MIT
```

**Why BSL.**
- Protects against competitor fork-and-host (Cal.com / Sentry use this exact pattern)
- Clear commercial-use rules — enterprise legal can read and accept
- Auto-converts to MIT after 4 years — community gets full freedom long-term
- Self-host for personal / internal use is fine — the only restriction is competing hosted services

**Why NOT MIT.** Lets Anthropic / Google / random Vietnamese startup fork and host cheaper. Strategic loss.

**Why NOT AGPL.** Enterprise legal teams refuse it. Locks out the highest-value buyers.

**Why NOT SSPL / Elastic License.** Not OSI-approved. Excluded from major OSS lists. Community boycott risk.

---

## 8. Required pre-launch work

If going OSS, this work is non-negotiable BEFORE the public OSS launch:

| Workstream | Estimate | Why |
|---|---|---|
| **Self-host packaging** | 2 weeks | Docker Compose for Postgres + auth + storage. Migration bundle that runs on plain Postgres without Supabase admin functions. |
| **Auth abstraction** | 1 week | Replace Supabase Auth dependency or document Supabase self-host as the supported path. |
| **Vercel-specific extraction** | 3-5 days | Cron via Postgres pg_cron, image opt via fallback, edge config replacement. |
| **Documentation** | 1 week | README, INSTALL, ARCHITECTURE, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, LICENSE, DEPLOYMENT. Plus: docs site (separate from app). |
| **Repo cleanup** | 3-5 days | Audit every TODO, secret, internal comment, customer name, vendor private detail. Anything that shouldn't be public. |
| **License application** | 1 day | LICENSE file + per-file headers + NOTICE file. Decide if cryptographic primitive code (`src/lib/crypto.ts`) is separately MIT for broader reuse. |
| **CI for self-host** | 2-3 days | GitHub Action that boots a fresh self-host install end-to-end on every release. Without this, self-host rots within 3 releases. |

**Total: 5-7 weeks of focused work.** Cannot be skipped without shipping a broken OSS launch.

**The shortcut nobody should take.** Repo public + half-baked self-host + vague README = HN ridicule. Better not to launch OSS at all than to launch it half-baked.

---

## 9. The 4 prerequisites — non-negotiable

Going OSS is recommended **only** if all four are committed to:

### 9.1 Wedge from {W1, W2, W4}

OSS is incompatible with W3 (couples), W5 (SMB operators), W6 (therapists) primary positioning. If you cannot commit to W1, W2, or W4 as primary, do not go OSS.

### 9.2 License: BSL 1.1, 4-year delay to MIT

Not MIT (fork risk). Not AGPL (enterprise lockout). The strategic protection BSL provides is the one thing standing between Everion and its own clones.

### 9.3 Pre-launch packaging work completed (5-7 weeks)

See § 8. Self-host that doesn't actually self-host is worse than not going OSS at all.

### 9.4 Community-cost decision made up front

Pick one in advance and commit:

| Option | Cost | Behavior |
|---|---|---|
| **Engaged maintainer** | +20 hr/week indefinitely | PRs reviewed, issues triaged, Discord active |
| **Deliberate non-responsiveness** | 0 hr/week | README explicitly says "this is published OSS, support comes via paid hosted only." |
| **Hybrid** | +5 hr/week | Critical security issues only, all else community-handled |

There is NO option where you "see how it goes" — that's just engaged-maintainer with frustration baked in. Decide up front.

---

## 10. Decision flowchart

```
1. Is your primary wedge in {W1 developers, W2 SA professionals, W4 privacy hawks}?
   - No → Do NOT go OSS. Stick with closed source. Revisit if wedge changes.
   - Yes → continue

2. Can you commit 5-7 weeks of pre-launch packaging work?
   - No → Do NOT go OSS yet. Mark as future option after launch.
   - Yes → continue

3. Are you OK with BSL license (not MIT, not AGPL)?
   - No → Reconsider. MIT = fork loss. AGPL = enterprise loss.
   - Yes → continue

4. Have you decided your community-cost mode (engaged / non-responsive / hybrid)?
   - No → Decide now. Indecision = engaged-by-default = burnout in 6 months.
   - Yes → continue

5. Is the career-capital upside (+$50-150k job leverage) attractive even if business fails?
   - No → Reconsider why you're considering OSS. Go is mostly motivated by upside.
   - Yes → GO OSS.
```

If all 5 = yes → **green light**. The math is favorable.
If any = no → **fix that constraint first or stay closed source**.

---

## 11. Anti-patterns

- **"OSS but only the boring parts."** Stripping out the AI / vault / sharing / MCP and OSS-ing only the UI shell. Defeats the trust amplification. Don't do this.
- **"Go OSS and figure out license later."** License is a one-way door. Decide before publishing the first commit. Re-licensing existing OSS is functionally impossible.
- **"OSS as marketing stunt."** Public repo, no real self-host support, no docs. HN smells this in 30 seconds. Backfires.
- **"Crippled self-host."** Free version missing features that the paid hosted has by removing FROM the OSS code. This is open-core's failure mode. Right move: features that are infrastructure-dependent (managed AI quota, hosted backups) are paid. Features that are software-dependent (vault, sharing, MCP) are FREE and OSS.
- **"Accept all PRs."** Saying yes to everything = direction loss. Maintainers must steer. Most PRs should be politely declined or require rework.
- **"Going OSS solves the wedge problem."** It doesn't. OSS amplifies a wedge. It cannot replace one. Without W1/W2/W4 picked AND executed, OSS by itself reaches noise floor.

---

## 12. What this means for `wedge.md`

If OSS is chosen, the `wedge.md` Section 0 (Active Surfaces) gets a new entry:

```markdown
### Open-source surface
- Repo: github.com/everionmind/everion-mind
- License: BSL 1.1 → MIT (Change Date: 2030-XX-XX)
- Status: ACTIVE | Inert | N/A
- Last commit: YYYY-MM-DD
- Stars / contributors: N / N
```

This counts as part of the **primary** wedge surface (not a separate passive surface). The OSS repo + the wedge marketing are two faces of the same primary wedge.

If OSS is NOT chosen, this file stays as a strategic-direction reference and is revisited every 6 months.

---

## 13. Recommended decision (my honest call)

**Conditional yes.**

Go OSS IF:
- Primary wedge is W1 (developers) — OSS is the natural channel
- OR primary wedge is W4 (privacy hawks) — OSS IS the wedge

Stay closed IF:
- Primary wedge is W5 (SMB operators / Smash Burger Bar)
- You can't budget 5-7 weeks for packaging
- You can't make the community-cost decision up front

The asymmetric upside (career capital) makes the decision favorable in most scenarios where the wedge fits. The math against is real but loses to the math for if the prerequisites are met.

**The single most important reason to go OSS.** Even if the business fails, you walk away with a publicly verifiable senior+ engineering portfolio that opens job-market doors closed-source can't. That's an unconditional win nothing else in this analysis matches.

---

## Maintenance

- **Created:** 2026-05-07
- **Decision target:** 2026-05-21
- **Revisit cadence:** every 6 months OR on wedge change OR on competitive pressure (e.g., a closed competitor open-sources first).
- **When decision is made:** record outcome at top of this file with date + reasoning. If "go OSS," start the 5-7 week packaging clock immediately. If "stay closed," mark this file as REVISIT and check in at next 6-month interval.
- **If OSS is launched:** this file becomes the canonical reference for license, business model, and community-cost policy. Updates require explicit decision review.
