# Wedge Strategy — Everion Mind

> A wedge is the narrowest, sharpest version of who you serve and what you do.
> Generic positioning ("second memory, quietly kept") competes against everyone and reaches no one.
> A wedge competes against no one in its niche and reaches a specific community cheaply.
> Pick one. Dominate it. Expand outward later.
>
> This is a **living file**. Wedges are added as they're discovered, promoted to active when chosen, archived once executed. The discipline is **one active wedge at a time** — multiple parallel wedges is the failure mode dressed up as "diversification."

---

## File structure

| Section | What it holds | Discipline |
|---|---|---|
| **0. Active Wedge** | The single wedge currently being executed. | Exactly one entry. Never zero (after launch), never more than one. |
| **1. Candidate Wedges** | Fleshed-out options ready to promote when current wedge hits its validation milestone. | Each must have: ICP, pain, code references, 90-day plan, validation milestone, risk + mitigation. |
| **2. Idea Park** | Wedge sketches not yet fleshed out. Captured to avoid losing them. | One-paragraph max. Promote to Candidate when worth deeper thought. |
| **3. Archive** | Wedges already executed (succeeded, pivoted, or failed). | Each archived entry includes: outcome metric, what worked, what didn't, what to carry forward. |

**Promotion path:** Idea Park → Candidate Wedges → Active Wedge → Archive. Movement is one-way and one-at-a-time.

**Why one wedge at a time:**
- Two messages → diluted
- Two channels → half-budget each
- Two onboardings → neither polished
- Two roadmaps → neither shipped
- Two feedback loops → neither understood

**When the active wedge can be replaced:** validation milestone hit + 90 days of retention data + explicit decision to expand. NOT before. Premature wedge-switching is the #1 indie killer.

---

## 0. Active Wedge

> _No active wedge yet. Pre-launch. Decision target: 2026-05-30 (before public launch)._
>
> Once chosen, the entry below holds the full wedge spec, weekly progress metrics, and the validation milestone with current % progress. Update weekly.

```
[Empty — fill in once chosen from Section 1.]
```

---

## 1. Candidate Wedges

### How to read each entry

| Field | What it means |
|---|---|
| **ICP** | Ideal customer profile. Who exactly. |
| **Pain** | What hurts them today. Specific. |
| **Why this codebase fits** | What's already built that maps to the wedge. |
| **Keep / hide / build** | What the wedge demands of existing code. |
| **Channel** | Where this user lives. How to reach cheaply. |
| **Pricing wedge** | Pricing strategy that fits the niche. |
| **90-day plan** | First three months of focused execution. |
| **Validation milestone** | Metric that says "this wedge works." |
| **Risk + mitigation** | What kills it. How to dodge. |

---

### Wedge 1 — MCP-native personal data layer for AI agent power users

**ICP.** Developers running Claude Code, Cursor, ChatGPT desktop, custom agents. They configure MCP servers. ~0.1% of internet users but ~100% reachable through dev channels.

**Pain.** AI agents have no persistent memory across sessions. ChatGPT memory is per-account, Claude memory is per-account, Cursor is project-scoped — none give the user a portable, encrypted, agent-shared brain. Power users build custom MCP servers as a hack. They want a polished one with infrastructure.

**Why this codebase fits.**
- `api/mcp.ts` already implements OAuth + signed access tokens + tool catalogue. Most consumer apps don't have this.
- Vault crypto (AES-GCM, recovery keys) means sensitive data stays encrypted from agents.
- BYOK already in `api/_lib/resolveProvider.ts` + `api/_lib/aiProvider.ts` — fits "you keep your keys" ethos.
- Brain-sharing (migrations 068-072) maps to "personal brain + shared team brain" cleanly.

**KEEP / double-down.**
- `api/mcp.ts` — ship MCP catalogue of 15+ tools, top of stack
- `api/_lib/resolveProvider.ts` + BYOK plumbing
- Vault encryption (`src/lib/crypto.ts`)
- Audit log (`audit_log` table, migration 057) — devs love provenance
- `/api/v1` public surface — promote it, version it, document it

**HIDE / cut from public surface.**
- `api/calendar.ts` and Calendar view — consumer-y feature
- `api/gmail.ts` and Gmail decisions UI — consumer-y feature
- `src/views/TodoView.tsx` — keep code, hide via feature flag
- Most consumer copy in `src/views/Landing.tsx` — replace with developer-first messaging

**BUILD.**
- MCP catalogue page at `/mcp` route — every tool documented with example
- `npx everion-mind init` CLI for one-line setup with Claude Code / Cursor
- "Keys never leave your machine" architecture page
- Developer dashboard: tokens issued, tool calls per day, retrieval analytics

**Channel.**
- r/LocalLLaMA, r/ClaudeAI, r/MachineLearning posts
- MCP Discord (Anthropic's official server)
- Show HN: "I built an MCP server that gives every AI agent the same memory"
- Direct outreach to MCP server authors / public dotfiles repos
- Sponsorships: TLDR AI, Ben's Bites, AI Tidbits

**Pricing wedge.**
- Free: 1k entries, 100 MCP tool calls/day
- Pro ($12/mo): unlimited entries, BYOK, MCP unlimited
- Team ($25/user/mo): shared brain, audit log export

**90-day plan.**
- Wk 1-2: cut consumer features from landing/signup; rewrite landing for developers
- Wk 3-4: ship MCP catalogue page + npx CLI + Claude Code config snippet
- Wk 5-6: write 5 dev-focused tutorials (build-with-everion-mcp)
- Wk 7-8: launch on HN, LocalLLaMA, MCP Discord
- Wk 9-12: onboard first 50 dev users, ship 3 tools they ask for

**Validation milestone.** 100 active MCP-tool-using developers in 90 days, 25% week-1 retention.

**Risk.** MCP standard is young. If Anthropic builds an official "personal memory" MCP layer, this gets eaten.
**Mitigation.** Ship before they do. Build provider-agnostic tools — work with non-Anthropic agents.

**Code-touch budget:** medium. Mostly subtractive (hide features) + landing rewrite + MCP polish.

---

### Wedge 2 — POPIA-compliant encrypted memory for SA professionals

**ICP.** Lawyers, doctors, psychologists, accountants in South Africa. ~80,000 professionals. Tech-literate but non-developer. Already pay for compliance tooling.

**Pain.** Section 11 of POPIA + Section 19 (security safeguards) makes US-cloud AI tools a compliance grey area. Cannot legally put client data in ChatGPT (US data residency, Anthropic ToS). Existing local "secure" tools have no AI. Stuck taking notes by hand or risking compliance.

**Why this codebase fits.**
- Vault E2E (AES-GCM 256, PBKDF2 310k) — client data encrypted before leaving device.
- Audit log (`audit_log`, migration 057) = compliance evidence trail.
- BYOK = professionals use their firm's pre-vetted AI provider.
- South African founder + domain (`everion.smashburgerbar.co.za`) = trust signal.
- POPIA claim already in `src/views/PrivacyPolicy.tsx` — needs deepening, not inventing.

**KEEP / double-down.**
- Vault crypto (`src/lib/crypto.ts`, migration 072 envelope)
- `audit_log` — must capture every read of every client note
- `/api/transfer` export (reachable via `api/transfer.ts`) — POPIA Article 20 portability
- Account delete cascade (`api/user-data.ts:1851-1862` per launch checklist) — Article 17 erasure
- Password + recovery key flow — no SSO trust risk

**HIDE / cut.**
- MCP server — irrelevant to this audience
- Public Gmail integration — too much risk for client communication storage
- Brain-sharing UI — collapse to "share with paralegal/PA only" in v1
- Consumer copy on `src/views/Landing.tsx` — replace with profession-specific landings

**BUILD.**
- POPIA compliance page (new `src/views/PopiaCompliance.tsx`) with profession-specific assurances
- Per-profession templates (legal client note, medical consultation note, accountant ledger entry)
- Sub-processor + data-residency commitment doc — every vendor with their POPIA s.72 details
- Local backup export (POPIA s.19 security safeguards)
- Practitioner-number field on profile (LSSA, HPCSA, SAICA membership numbers)

**Channel.**
- LSSA (Law Society of SA) bar association partnerships
- HPCSA-registered practitioner Facebook + WhatsApp groups
- SAIPA / SAICA newsletters
- LegalTech SA conferences
- Direct mail to small-firm partners (high pain, cheap reach)

**Pricing wedge.**
- Solo professional: R299/mo (~$16) — high willingness to pay for compliance
- Small firm (2-10): R249/user/mo
- Mid-firm (10-50): custom

**90-day plan.**
- Wk 1-2: legal review of POPIA claim by SA attorney; compliance page draft
- Wk 3-4: ship 3 profession-specific templates + audit-log export feature
- Wk 5-6: pitch 5 bar associations / professional bodies for partnership
- Wk 7-8: launch with one anchor customer testimonial
- Wk 9-12: 20 paying SA professionals

**Validation milestone.** 20 paying SA professionals (~R6,000 MRR) at 90 days.

**Risk.** POPIA enforcement is light today; paid demand may be soft.
**Mitigation.** Position as "ahead of next enforcement wave" + "AI productivity for the compliance-bound" rather than fear-based.

**Code-touch budget:** small. Mostly subtractive + compliance docs + 2-3 templates.

---

### Wedge 3 — Encrypted shared brain for couples and small families

**ICP.** Couples (married, partnered, co-parenting) who want shared logistics, household notes, family memory but distrust Google/Apple with everything. Privacy-conscious, often dual-tech-literate, often parents.

**Pain.** Shared notes today live in Notion (no E2E), Apple Notes (Apple has the keys), Google Keep (Google has the keys), or messy WhatsApp threads. Family logistics needing real privacy — passwords, kid medical info, finances, travel — have no good home.

**Why this codebase fits.**
- Brain-sharing (migrations 068, 069, 070) is built and tested.
- Vault sharing via `brain_vault_grants` (migration 072) means encrypted secrets work across multiple users.
- Family-themed CSS class system (`html[class*="family-"]`) already exists in `src/design/tokens.css`.
- "Brain" terminology fits "family brain" naturally.

**KEEP / double-down.**
- Brain-sharing flow (`brain_invites`, `brain_members`)
- Vault sharing envelope (migration 072)
- Family theme support (`src/design/tokens.css`)
- Calendar — couples want shared schedule
- Gmail forwarding-rules — "send to family@..." capture

**HIDE / cut.**
- MCP — irrelevant
- Developer-y features
- Single-user-only flows in onboarding (`src/hooks/useFirstRunChecklist.ts`)

**BUILD.**
- "Create family" onboarding flow that defaults to brain-share + dual-vault setup
- Per-family-member icon + theme picker
- Shared categories: meal plans, kid medical, passwords, household
- Mobile push: "X added Y to family brain"
- Recovery flow that requires both partners (or fallback)

**Channel.**
- Privacy-conscious parenting newsletters
- r/privacy, r/HomeNetworking, r/selfhosted (DIY-leaning families)
- Couples' productivity influencers (limited — niche)
- "Notion for couples" SEO

**Pricing wedge.**
- Family: $8/mo for 2 adults + 4 kids (kids free, no AI calls)
- Family Pro: $15/mo, BYOK, more AI

**90-day plan.**
- Wk 1-2: family onboarding flow (new `src/views/FamilyOnboard.tsx`)
- Wk 3-4: shared-vault polish + family-specific templates
- Wk 5-6: launch on r/privacy + privacy-newsletter sponsorships
- Wk 7-12: iterate based on first 30 family signups

**Validation milestone.** 30 paying families (~$300 MRR) at 90 days, NPS > 40.

**Risk.** Couples often have asymmetric tech literacy — non-techie partner won't onboard.
**Mitigation.** "Invite by SMS, no setup needed for partner" flow. First 7 days run in shadow mode.

**Code-touch budget:** medium. New onboarding flow + recovery flow + UI polish.

---

### Wedge 4 — BYOK private memory for the tech-literate privacy hawk

**ICP.** Developers, security engineers, privacy advocates, ex-Cypherpunks, Hacker News regulars. Already pay for ProtonMail, 1Password, often run their own AI keys. ~500k addressable globally.

**Pain.** ChatGPT memory trains on their notes. Anthropic claims not to but trust is broken for many. Local-only LLMs are slow + dumb. They want hosted convenience with cryptographic guarantees the host can't read their data.

**Why this codebase fits.**
- Vault E2E means data ON DISK at server is encrypted with key the server doesn't have.
- BYOK already there — Anthropic / Gemini / OpenRouter key.
- Audit log gives them provenance.
- MCP integration extends to their own agents.

**KEEP / double-down.**
- BYOK flow — every AI surface respects it
- Vault encryption — make it the default for ALL entries, not just secrets
- Audit log + export
- MCP for their agent stack
- Open-source the client-side crypto (`src/lib/crypto.ts`) under MIT

**HIDE / cut.**
- Gmail integration — too much surface trust for this audience
- Calendar OAuth — too much surface trust
- Brain-sharing UI — keep code, hide flag
- Consumer landing copy

**BUILD.**
- "Architecture" page with diagrams: what server sees vs what stays encrypted
- Cryptographic architecture write-up (security blog pattern)
- Self-host option — Docker compose + Supabase self-host template
- Open-source client crypto module under MIT licence
- "We can't read your notes — here's the proof" technical FAQ

**Channel.**
- Show HN: "Encrypted personal memory you can self-host"
- r/privacy, r/selfhosted, r/cryptography
- Security newsletters: tldrsec, Risky Biz
- Privacy podcasts

**Pricing wedge.**
- Self-host: free (open-source client + your own Supabase)
- Hosted with BYOK: $10/mo
- Hosted with managed AI: $20/mo

**90-day plan.**
- Wk 1-2: extract crypto module to standalone open-source repo
- Wk 3-4: ship self-host docker-compose + Supabase template
- Wk 5-6: architecture deep-dive post → HN, Lobsters
- Wk 7-8: launch hosted-with-BYOK tier
- Wk 9-12: iterate based on community feedback

**Validation milestone.** 50 self-host installs + 30 paying BYOK users at 90 days.

**Risk.** Self-host crowd often won't pay.
**Mitigation.** Hosted tier must be 10× easier than self-host so people convert. Free self-host = lead generation, paid hosted = conversion.

**Code-touch budget:** large. Self-host packaging is real engineering work.

---

### Wedge 5 — Operator memory for solo founders + small business owners

**ICP.** Founders running 1-10 person companies. Restaurant owners, agency owners, e-commerce solos. Live across email, Slack, Notion, paper. Have $200/mo to spend on tooling.

**Pain.** Decisions, customer feedback, supplier conversations, compliance dates, employee notes — sprawl across 7 apps. Want one place that captures and recalls. ChatGPT doesn't know their business; Notion has no AI by default.

**Why this codebase fits.**
- Gmail integration captures supplier/customer comms.
- Brain-sharing for "team brain" (the 1-10 employee case).
- Calendar for ops dates (licence renewals, supplier visits).
- Persona facts could become "customer facts" / "supplier facts."
- Vault for operational secrets (door codes, alarm, supplier portals).
- **Real Smash Burger Bar context** — you literally run this kind of business. Unfair advantage.

**KEEP / double-down.**
- Gmail capture + decisions (`api/gmail.ts`, `api/_lib/gmailScan.ts`)
- Calendar (`api/calendar.ts`)
- Brain-sharing
- Vault for operational secrets
- Persona facts (`api/_lib/extractPersonaFacts.ts`) → entity facts (people + suppliers + customers)
- Ask Everion chat (`src/views/ChatView.tsx`)

**HIDE / cut.**
- MCP — most operators won't use
- Developer-facing features
- Family-themed branding

**BUILD.**
- "Customers" entity type (subset of persona facts)
- "Suppliers" entity type
- "Employees" entity type (private vault per employee)
- Daily ops digest email (extends existing cron in `api/user-data.ts` daily handler)
- Recurring ops reminders (rent, licence, lease) — Calendar already supports
- Smash Burger Bar template as marketing anchor

**Channel.**
- Indie Hackers, MicroAcquire community
- Restaurant owner Facebook groups (you have direct access)
- Small business newsletters
- "How I run my restaurant with Everion" case study (you = anchor customer)

**Pricing wedge.**
- Solo operator: $19/mo
- Small team (2-10): $15/user/mo
- Operator Pro with Gmail + Calendar: $29/mo

**90-day plan.**
- Wk 1-2: build entity types (customers/suppliers/employees) — extends `extractPersonaFacts.ts`
- Wk 3-4: ship daily digest email (extends `handleCronDaily` in `api/user-data.ts`)
- Wk 5-6: write Smash Burger Bar case study, post Indie Hackers
- Wk 7-8: outreach to 50 SMB owners
- Wk 9-12: 30 paying operators

**Validation milestone.** 30 paying SMB operators (~$600 MRR) at 90 days.

**Risk.** SMB owners are notoriously non-technical and slow to adopt new tools.
**Mitigation.** Lean on direct network. Smash Burger Bar anchor case study. Hands-on onboarding for first 20 users.

**Code-touch budget:** small-medium. Reuses MORE of the existing codebase than any other wedge. Mostly additive entity types + digest.

---

### Wedge 6 — AI memory for therapists and coaches (small private practices)

**ICP.** Solo and small-practice therapists, life coaches, executive coaches. ~200k US, ~50k EU, ~20k SA. Already pay $50-100/mo for practice management.

**Pain.** Client notes need privacy + AI search ("what did Sarah say about her brother last quarter?"). SimplePractice has no AI; ChatGPT isn't HIPAA. Workflow today: take notes during session → forget context by next session.

**Why this codebase fits.**
- Vault E2E + audit log = HIPAA-aligned (with BAA, which is a lift but achievable).
- Persona facts already track "important people in user's life" — same pattern works for "client's important people."
- Concept graph maps relationships in client's life.

**KEEP / double-down.**
- Vault + audit log
- Persona facts (rebrand as "client mental model")
- Ask Everion chat (rebrand as "client recall")

**HIDE / cut.**
- MCP, BYOK consumer flow
- Family branding
- Public landing — replace with therapist-specific

**BUILD.**
- Per-client brain (one brain per client, isolated by RLS — already supported via brain-sharing infrastructure)
- Session-note template (SOAP / DAP / BIRP formats)
- "Pre-session brief" — auto-summary of last 3 sessions before today's appointment
- BAA capability + HIPAA documentation
- US data-residency option (Vercel + Supabase US-region)

**Channel.**
- Therapist Facebook groups (large, active)
- Modern Health, BetterHelp coach community
- Conference: ACA, AAMFT, ICF
- Therapist-business influencers (Tara Wagner, Allison Puryear)

**Pricing wedge.**
- Solo therapist: $39/mo
- Group practice: $29/user/mo

**90-day plan.**
- Wk 1-2: per-client brain isolation, session note templates
- Wk 3-4: BAA-readiness audit, US data-residency setup
- Wk 5-6: pre-session brief feature, therapist landing page
- Wk 7-8: launch in 2 large therapist Facebook groups
- Wk 9-12: 15 paying therapists (high price point, lower volume target)

**Validation milestone.** 15 paying therapists (~$585 MRR) at 90 days, BAA signed with 3+.

**Risk.** HIPAA compliance is heavy for solo dev (BAA, breach notification, periodic audit). Insurance + legal cost ~$5k/yr minimum.
**Mitigation.** Start with non-HIPAA coaches first. Add HIPAA later when revenue justifies.

**Code-touch budget:** medium-large. HIPAA infrastructure + new templates + per-client brain UX.

---

## 2. Idea Park

> One-paragraph sketches. Capture wedge ideas as they come up so they don't get lost. Promote to Section 1 (Candidate Wedges) when worth fleshing out into full spec.

- **Investigative journalists / activists / sources** — privacy-first second brain for surveillance-context users. Encryption + panic-delete + no-knowledge architecture. Tiny market, hard distribution, story is strong. Viable post-launch when codebase is stable.
- **South African small-business compliance generalist** — wider than Wedge 2 (lawyers/doctors/accountants) — anyone subject to POPIA who currently uses ChatGPT in violation. Schools, NGOs, HR consultants. Lower WTP per user, larger TAM.
- **Conversation memory (call/meeting transcript + ask later)** — uses voice transcribe + retrieval. Heavily contested by Granola, Otter, Fireflies. Skip unless we find a cheap channel.
- **Private journaling + AI reflection for mental wellness** — capture + retrieval + persona facts. Crowded (Day One, Reflect, Stoic). Possible if paired with a specific journaling community (e.g., Stoicism, Morning Pages practitioners).
- **POPIA + GDPR consultancy support tool** — for compliance officers themselves. They run audits, reviews, gap analyses. Memory of "what we recommended for client X two years ago." High WTP, niche TAM.
- **Personal brand / creator economy memory** — for solo creators who do interviews, podcasts, talks. "What did I say on episode 47?" Codebase fits. Channel = creator newsletters.
- **Family-business succession planning brain** — multi-generational businesses where institutional knowledge dies with the founder. Niche but real.

---

## 3. Archive

> Wedges already executed. Each entry: outcome metric reached or missed, what worked, what didn't, what to carry forward to the next wedge.

```
[Empty — no wedges executed yet.]
```

**Format when filling in (post-execution):**

```markdown
### Archived: Wedge X — [name]
- **Active period:** YYYY-MM-DD to YYYY-MM-DD
- **Validation milestone target:** [original target]
- **Actual result:** [hit / missed / partial]
- **Why it worked / didn't:** [3-5 bullets]
- **What to carry forward:** [reusable copy, channel, code, customer insights]
- **Decision:** [expanded to next wedge / pivoted / killed]
```

---

## On generic / general-audience marketing alongside a wedge

**Question that comes up.** "Can we still market the app to general users while spending more time targeting wedges?"

**Honest answer.** No. Not pre-PMF. Not solo. Not without a marketing team.

**Why.** Generic marketing pre-PMF is what you do when you have no message, no audience clarity, no channel. It's the default mode every solo founder falls into. Wedges exist BECAUSE generic marketing fails for indie launches. Running both simultaneously means generic eats your time, attention, ad budget, SEO juice, and copy iteration loops — and the wedge gets the leftovers. Both lose.

**The Notion / Stripe pattern people cite.** Notion has a generic landing AND vertical pages ("for engineering teams" / "for marketing teams"). Stripe has generic AND vertical ("for SaaS" / "for marketplaces"). True. But: those companies earned the right to generic by FIRST dominating a wedge with strong PMF. Notion's wedge was Stewart Butterfield's network + YC. Stripe's was YC startups. They expanded outward AFTER PMF. They did not run both pre-PMF.

**Pre-PMF rule (where Everion sits today).** Wedge marketing only. Generic landing exists as a placeholder / fallback / SEO catcher, but ZERO active marketing time goes to it. No ads, no content, no copy iteration, no analytics tracking, no funnel tuning. Treat it as an inert backstop.

**Post-PMF rule (after wedge 1 hits validation milestone + 90 days retention).** Generic landing becomes one of N parallel surfaces. By that point you have testimonials, case studies, revenue, retention data — the generic page can ride off the wedge's proof.

**Concrete instruction for now.** `src/views/Landing.tsx` either gets rewritten to speak to the active wedge OR stays as the current generic copy and you do not spend time on it. You don't write blog posts for "everyone." You don't run Google ads on "AI memory app." You don't try to rank for "second brain" on SEO. All marketing dollars + hours go to the wedge.

**Test.** If someone asks "who is Everion for?" and you can't answer in 8 words pointing at a specific persona, you don't have a wedge. Generic landing tempts you to answer "anyone who wants memory" — that's the failure mode in a sentence.

---

## Decision framework

Pick the wedge by answering these in order:

### 1. Reachability — which audience can you reach with $0 marketing budget?

| Wedge | Reach cost |
|---|---|
| 1. Developers | **Cheap** — HN + dev Discord + your dev followers |
| 2. SA professionals | **Cheap** — your network + bar associations |
| 3. Couples / families | **Expensive** — paid ads or hard-won partnerships |
| 4. Tech privacy hawks | **Cheap** — HN + r/privacy |
| 5. SMB operators | **Cheap** — your Smash Burger Bar network + Indie Hackers |
| 6. Therapists | **Moderate** — paid ads or grinding Facebook groups |

### 2. Willingness to pay — who pays $20+/mo without negotiation?

| Wedge | WTP |
|---|---|
| 1. Developers | **Low** — $10/mo ceiling for many |
| 2. SA professionals | **High** — $16-30 normal |
| 3. Couples / families | **Low** — $8/mo ceiling |
| 4. Tech privacy hawks | **Medium** — $10-15/mo |
| 5. SMB operators | **High** — $30+ normal |
| 6. Therapists | **High** — $40+ normal |

### 3. Code leverage — which wedge uses what's already built?

| Wedge | Code reuse |
|---|---|
| 1. Developers | High on MCP — narrow on rest |
| 2. SA professionals | Medium — vault + audit log + transfer |
| 3. Couples / families | High — brain-share + vault + family theme |
| 4. Tech privacy hawks | Medium — vault + BYOK (needs new self-host code) |
| 5. SMB operators | **Highest** — gmail + calendar + brain-share + persona + vault all at once |
| 6. Therapists | Medium-high — vault + persona + retrieval |

### 4. Defensibility — hardest for incumbents to copy?

| Wedge | Defensibility |
|---|---|
| 1. Developers | **Low** — Anthropic could ship in 30 days |
| 2. SA professionals | **High** — compliance + local trust |
| 3. Couples / families | **Low** |
| 4. Tech privacy hawks | **Medium** — self-host moat |
| 5. SMB operators | **Medium** |
| 6. Therapists | **Medium-high** — HIPAA moat + sticky workflow |

### Top recommendations

- **Personal-advantage play: Wedge 5 (SMB operators).** Smash Burger Bar network is unfair. Reuses most of the codebase. High WTP. Pricing supports the math.
- **Fastest-validation play: Wedge 1 (developers).** Cheapest channel, fastest feedback. But low defensibility — race vs Anthropic.
- **Highest-revenue-per-user play: Wedge 2 (SA professionals).** Slow to ramp, but R299/mo × 100 = R30k/mo with 100 users. Defensible.

**Hybrid that minimises risk:** Wedge 5 (operators) as primary, with Smash Burger Bar anchor case study, and Wedge 1 (developers) as zero-cost secondary surface (MCP catalogue stays public, dev community still finds it).

---

## Anti-patterns

- **Don't pick two wedges.** Two wedges = no wedge. The whole point is focus.
- **Don't expand the wedge in week 8.** "But what if doctors also want this?" — note it, do not act. The wedge is the launchpad, not the destination.
- **Don't keep all features visible.** A wedge means HIDING 60% of what the app does so the wedge audience sees a focused product. Code stays; UI gates it.
- **Don't market generically.** Once wedge is picked, every blog post / landing word / tweet is specifically for that audience. Generic marketing wastes the wedge.
- **Don't pivot before 90 days of real traction work.** Most wedges look dead at week 6 and alive at week 12. Premature pivot is the #1 indie killer.
- **Don't fight the codebase.** Wedges that demand huge new code (HIPAA BAA infrastructure, true self-host) cost months. Wedges that REUSE existing code (operators reuses gmail+calendar+brain+persona+vault all at once) ship fast.

---

## Files to grep when executing the chosen wedge

| Concern | File |
|---|---|
| Top-of-funnel positioning | `src/views/Landing.tsx` |
| Feature visibility per wedge | `src/lib/featureFlags.ts` |
| Main app shell + navigation | `src/Everion.tsx` |
| Mobile feature visibility | `src/components/MobileMoreMenu.tsx` |
| Strategic positioning doc | `EverionMindLaunch/STRATEGY.md` |
| Brand voice for wedge audience | `EverionMindLaunch/Brand/voice-tone.md` |
| Pricing tier definitions | `src/lib/featureFlags.ts` + LemonSqueezy product IDs in env |
| Audit-log row coverage | `audit_log` table (migration 057) |

## Files NOT to delete (even if hidden)

- `api/mcp.ts` — keep MCP code even when hiding it from non-dev wedges
- `api/gmail.ts`, `api/calendar.ts` — keep, hide via feature flag
- All vault crypto (`src/lib/crypto.ts`, migration 072) — universal foundation
- All audit-log infrastructure — universal foundation
- All brain-sharing infrastructure (migrations 068-072) — universal foundation

**Rule: code stays. Surfaces narrow.**

---

## Maintenance

- **Created:** 2026-05-07
- **Revisit cadence:** weekly while a wedge is active (update Section 0 progress); every 90 days for the full file.
- **When a wedge is chosen:** move it from Section 1 (Candidates) to Section 0 (Active). Update `EverionMindLaunch/STRATEGY.md` to match. Wedge stays active until validation milestone hit OR 90 days of zero traction triggers an explicit kill decision.
- **When the active wedge is replaced:** move it from Section 0 to Section 3 (Archive) with the post-execution template filled in. Promote next chosen wedge from Section 1.
- **New ideas:** add to Section 2 (Idea Park) immediately. Promote to Section 1 only when worth a full spec.
- **Hard rule:** Section 0 has exactly one entry post-launch. Never zero (you'd be drifting), never two (you'd be diluting).

---

## Final note

The hardest part of picking a wedge isn't picking — it's saying no to all the others.

Your brain will scream "but the developer wedge is too small, what about doctors?" That scream is the failure mode. Notice it. Note it. Do not act on it.

The wedge isn't the final market. It's the first 1,000 users you can dominate, before expanding outward. Facebook didn't launch as "social network for everyone" — it launched as "social network for Harvard students." Then Ivy League. Then US college students. Then everyone.

Each wedge was small, dominated, and used as launchpad for the next. That's the playbook. Run it.

Same playbook applies to this file. **Sequential, not parallel.** One wedge active. One wedge dominated. Then the next.
