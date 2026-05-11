# PLAYBOOK — Evara launch (the only file you need to start)

> **The hub.** Every launch decision, in order, with a link to the canonical doc behind it. Read top to bottom. The phases are sequential. Don't skip ahead.

If you've never seen this folder before, this is where to start. Each section ends with the docs you need to read or fill out. Other docs are reference; this is the timeline.

---

## Phase 0 — State of the world (now)

Before you do anything else, get a clear picture of what's true today.

- [ ] Read `STRATEGY.md` — positioning, moat, pricing principles
- [ ] Read `RESEARCH.md` — competitor matrix, market evidence
- [ ] Read `ROADMAP.md` — 21-day sprint plan + 12-month timeline
- [ ] Skim `LAUNCH_CHECKLIST.md` — current to-do (P0/P1/P2)
- [ ] Skim `BRAINSTORM.md` — priority-scored idea park (raw thinking)
- [ ] Skim `architecture/INDEX.md` — what each architecture doc covers (auth, capture, cron, enrich, bell, security, onboarding-flow)
- [ ] Skim `Specs/` — features built or being built (each has a status line)
- [ ] Skim `Audits/` — open audits (deferred items get lifted into LAUNCH_CHECKLIST)

**Output of this phase**: a mental model of where the product is, where it's going, and what's already locked vs still open.

---

## Phase 1 — Hardening (the product works for everyone, not just you)

Before you announce a launch date, the product has to survive a stranger landing on it cold.

- [ ] **Auth flow** — verify signup / signin / password reset / OAuth recovery (`architecture/auth.md`)
- [ ] **Capture flow** — typed, paste, share-target, voice work end-to-end (`architecture/capture.md`)
- [ ] **Enrichment** — parse / insight / concepts / persona / embed reliable + idempotent (`architecture/enrich.md`)
- [ ] **Crons** — daily / hourly / db-backup / weekly-roll-up all green (`Ops/crons.md`)
- [ ] **Vault** — setup, unlock, recovery key, backup round-trip (`architecture/security.md`)
- [ ] **Bell / notifications** — push delivers; email deliverable (`architecture/bell.md`)
- [ ] **Onboarding** — fresh-account experience hits activation (`architecture/onboarding-flow.md`)
- [ ] **Quotas** — tier limits enforced + clear upgrade nudge (`Legal/pricing-billing.md`)
- [ ] **Error states** — every API failure surfaces something useful (`Ops/incident-response.md` § triage)

**Tooling**:
- E2E run via the `playwright-everion` skill (memory: `.claude/projects/.../memory/feedback_e2e_philosophy.md`)
- Sentry rate <1% on critical paths
- PostHog dashboards live (`Analytics/event-taxonomy.md`)

**Output**: a stranger can use the product without help and get value.

---

## Phase 2 — Brand & domain (own your name)

Don't announce a brand before owning the surfaces.

- [ ] Lock brand name — see `BRAINSTORM.md` § brand-name shortlist
- [ ] Domain check + buy (one-day batch) — see `Legal/trademarks-domains.md` § domain shopping list
- [ ] Trademark filing initiated (SA + US) — `Legal/trademarks-domains.md` § Phase 1
- [ ] Register (Pty) Ltd; IP assigned to the company — `Legal/trademarks-domains.md` § Legal entity
- [ ] Set up email infrastructure — `support@`, `privacy@`, `abuse@`, `appeals@`, `press@` — all forward to a real inbox
- [ ] Logo final + assets bundled — `Brand/assets.md`
- [ ] Voice & tone document final — `Brand/voice-tone.md`
- [ ] Press kit page live at `/press` — `Brand/press-kit.md`

**Output**: the brand exists publicly with consistent surfaces and legal scaffolding.

---

## Phase 3 — Marketing foundation (the inbound machine)

Don't shout into the void. Build the pipes that turn a one-time announcement into compounding traffic.

- [ ] Marketing site / landing page final — copy per `Brand/voice-tone.md`
- [ ] SEO baseline — see `marketing/seo-marketing-playbook.md` (the canonical playbook)
  - [ ] Sitemap + robots.txt
  - [ ] OG + Twitter card images
  - [ ] Privacy / ToS / AI-disclosure pages live (`Legal/privacy-tos-launch.md`, `Legal/ai-disclosure.md`)
  - [ ] Pricing page live (`Legal/pricing-billing.md`)
  - [ ] FAQ page live (`Support/faq.md`)
  - [ ] Help / Support page live
- [ ] Email deliverability hardened — SPF / DKIM / DMARC, warm-up — see `LAUNCH_CHECKLIST.md` § Invite emails inbox-not-spam
- [ ] Analytics wired — PostHog identify + funnel events — `Analytics/event-taxonomy.md`
- [ ] Outreach list drafted — `Brand/outreach-list.md`

**Output**: a working SEO + email + analytics foundation that compounds with each new visitor.

---

## Phase 4 — Beta phase (the first 50–100 users)

Closed beta is where you find the bugs you'd never have caught alone.

- [ ] Read `Roadmap/beta-phase.md` (full beta playbook)
- [ ] Beta cohort defined + tagged in PostHog — `Analytics/beta-cohort.md`
- [ ] Beta-1 invitations sent (first 25; closest network)
- [ ] Direct DM channel open with beta cohort
- [ ] Weekly retro on what's working / breaking
- [ ] Beta-2 invitations sent (next 75) once Beta-1 cohort retention curves stabilize
- [ ] NPS at D14 sent
- [ ] Activation rate ≥ 40% in beta cohort — `Analytics/north-star.md`

Don't move to Phase 5 until activation rate is healthy and bug surface is quiet.

**Output**: a small but real user base, validated retention curves, founder-direct feedback channel.

---

## Phase 5 — Launch day

This is one of three tactical days that matter most. Plan it like an event.

> **Decided 2026-05-05: Android-first launch.** iOS App Store ship is deferred to a post-launch sprint (see Phase 6). Capacitor treats iOS / Android as fully independent native projects, so this is a clean cut — no coupling. Android gives us a real-user platform with cheaper review (~hours vs Apple's 24-72h), a $25 one-time fee instead of $99/yr + tax forms, and lets us iterate on real metrics while iOS goes through its own cycle later. Rationale + dependencies: see `LAUNCH_CHECKLIST.md` § Mobile app launch — Android-first decision.

- [ ] Pick the date — see `Roadmap/week-4.md`
- [ ] Product Hunt prep (assets, captain coordination, hunter friend) — `marketing/ProductHunt/`
- [ ] Hacker News "Show HN" draft prepared (post on launch day morning)
- [ ] Twitter / X thread drafted
- [ ] LinkedIn announcement drafted
- [ ] Email blast to mailing list drafted
- [ ] Press list pitched 48h ahead — `Brand/outreach-list.md`
- [ ] **Android app live in Play Store** — `Specs/play-console-submission.md`
- [ ] PWA install banner for iOS users (until iOS app ships) — landing-page CTA + `/install` deep-link to "Add to Home Screen" instructions
- [ ] ~~iOS app live in App Store~~ — **deferred to Phase 6 post-launch sprint** (see `LAUNCH_CHECKLIST.md` § Post-launch — iOS launch sprint)
- [ ] Status page ready — TODO
- [ ] On-call schedule (yes, even solo — block your day; no other commitments)
- [ ] Incident response playbook reviewed — `Ops/incident-response.md`

**Day-of cadence**:
- 06:00 — Show HN goes live; PH listing goes live
- 07:00 — first social posts
- 08:00 — email blast
- 09:00 — start manning support inbox
- All day — respond to comments, reply to every PH comment, every HN comment, every tweet
- 22:00 — bedtime, set out-of-office for 09:00 next day

**Output**: launch is in the world; first 24h is documented.

---

## Phase 6 — Post-launch ops (the next 90 days are the real test)

Launch day is a spike. Retention and growth are the real product.

- [ ] Daily activation-rate dashboard — `Analytics/north-star.md`
- [ ] Weekly cohort retention review
- [ ] Monthly MRR + churn check
- [ ] Support SLA enforced — `Support/sop.md`
- [ ] Incident postmortems written — `Ops/incident-response.md`
- [ ] A/B tests started (1–2 at a time) — `Analytics/ab-tests.md`
- [ ] Content cadence: 1 blog post / week, 1 social thread / week — `marketing/seo-marketing-playbook.md`
- [ ] **iOS launch sprint** — once Android has 30 days of stable production data and no S1 incidents, run the iOS submission sprint. Plan in `LAUNCH_CHECKLIST.md` § Post-launch — iOS launch sprint; runbook in `Mobile/ios-submission.md`. Don't start before Android stability is proven.
- [ ] Quarterly: re-read `Legal/ai-disclosure.md` for vendor changes
- [ ] Quarterly: re-read `architecture/security.md` for threat surface drift
- [ ] Bi-annually: tabletop a `Ops/disaster-recovery.md` scenario

**Output**: compounding growth. Each week the funnel widens, retention improves, MRR grows.

---

## Cross-cutting reference (when you need to look something up)

### Operational
- `Ops/env-vars.md` — every env var, owner, rotation cadence
- `Ops/feature-flags.md` — every flag, default, removal trigger
- `Ops/vendors.md` — every external service, status page, escape hatch
- `Ops/crons.md` — every scheduled job, schedule, disable command
- `Ops/incident-response.md` — what to do when something breaks
- `Ops/disaster-recovery.md` — RPO/RTO + worst-case scenarios

### Setup runbooks (one-time operator dashboard work)
- `Setup/README.md` — index
- `Setup/lemonsqueezy.md` — web billing dashboard
- `Setup/revenuecat.md` — mobile IAP dashboard
- `Setup/ios.md` — Apple Developer + App Store Connect + Xcode signing
- `Setup/android.md` — Google Play Console + keystore + App Links

### Architecture
- `architecture/INDEX.md` — what each doc covers
- `architecture/auth.md`
- `architecture/capture.md`
- `architecture/enrich.md`
- `architecture/cron.md`
- `architecture/bell.md`
- `architecture/events.md`
- `architecture/security.md`
- `architecture/onboarding-flow.md`

### Support
- `Support/sop.md` — triage SLA + reply template
- `Support/account-recovery.md` — every "I can't get in" scenario
- `Support/faq.md` — public FAQ
- `Support/abuse-moderation.md` — TOS violations + CSAM/NCII

### Legal
- `Legal/ai-disclosure.md` — what we send to AI vendors
- `Legal/pricing-billing.md` — tiers, refund, dunning
- `Legal/privacy-tos-launch.md` — privacy + ToS launch checklist
- `Legal/trademarks-domains.md` — TM + domain strategy

### Brand
- `Brand/assets.md` — logo, colors, fonts
- `Brand/voice-tone.md` — how we sound
- `Brand/press-kit.md` — what journalists get
- `Brand/outreach-list.md` — who to talk to

### Mobile
- `Mobile/ios-submission.md` — App Store Connect
- `Mobile/capacitor-build.md` — build & release flow
- `Specs/play-console-submission.md` — Play Console

### Analytics
- `Analytics/event-taxonomy.md` — every event we emit
- `Analytics/north-star.md` — the one number
- `Analytics/beta-cohort.md` — beta tracking
- `Analytics/ab-tests.md` — test queue

### Marketing
- `marketing/seo-marketing-playbook.md` — full SEO + content + PR plan (the long one)
- `marketing/ProductHunt/` — PH launch assets

### Roadmap
- `Roadmap/week-1.md` / `week-2.md` / `week-3.md` / `week-4.md` — sprint detail
- `Roadmap/beta-phase.md` — beta operations

### Specs (features)
- `Specs/imports-spec.md` — mass + continuous import
- `Specs/brain-feed-v0.md` — home brain feed
- `Specs/streak-counter.md` — habit loop
- `Specs/android-qa-matrix.md` — device compat
- `Specs/play-console-submission.md` — Play Console submission
- `Specs/archive/` — shipped specs

### Audits
- `Audits/*.md` — auto-discovered, mtime-sorted in dashboard
- `Audits/archive/` — addressed audits

---

## How to keep this doc useful

Every time you complete a phase task, tick the box here AND in the underlying doc. The dashboard lives at `http://localhost:5174` (run `node server.mjs`) — both directions sync.

When a new launch-relevant decision is made, it lands in this playbook (top-level), in `LAUNCH_CHECKLIST.md` (the active to-do), or in the relevant phase doc. If it's not in any of those, it doesn't exist.

Decisions, once locked, become a `[x]` item OR a `**Decided YYYY-MM-DD:**` block under the relevant section. Never delete a decision — strikethrough it (`~~old decision~~`) and add the new one with the date.
