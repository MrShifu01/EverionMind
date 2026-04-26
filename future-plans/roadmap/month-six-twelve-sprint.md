# Month 6–12 Sprint — Platform & Growth Loops

**Target:** $10K MRR. Only reachable if retention math holds and one acquisition channel is repeatable.

---

## Features to Build

- [ ] **REST Gateway** (see `roadmap.md` sub-project 1).
  - `em_*` API keys, `/v1/context`, `/v1/answer`, `/v1/ingest` endpoints.
  - Enables Everion as a second-brain backend for ChatGPT, Claude Desktop, custom agents.
  - This is the developer-audience moat.

- [ ] **Usage Tracking** (see `roadmap.md` sub-project 2).
  - `api_usage` table, dashboard tab.
  - Depends on REST Gateway.

- [ ] **JS + Python SDKs** (see `roadmap.md` sub-project 5).
  - Thin wrappers, published to npm + PyPI.

- [ ] **Finance v0.4 — RAG-aware finance chat.**
  - Intent classifier routes finance questions through a structured tool (`{kind, category, from, to, agg: "sum"}`) before LLM.
  - "How much did I spend on groceries in March?" → exact number + NL explanation.
  - This is the "wow" demo.

- [ ] **Finance v0.5 — Recurring auto-generation.**
  - Ghost entries for salary / rent / subscriptions. Upgrade to real on date.

- [ ] **Entry Enrichment v0.2–v0.6** (see `entry-enrichment.md`).
  - Books / TMDB + Discovery queries ("what series would I enjoy?" → TMDB Discover + LLM ranking + Save-to-brain).
  - Most user-visible enrichment payoff.

- [ ] **Community Brain v0.2–v0.4.**
  - User-created community brains, contributor role, voting, moderation.

- [ ] **Prompt Self-Improvement Layer 2** (at ~50 active users).
  - Per-user preference blob injected into system prompts.

- [ ] **Prompt Self-Improvement Layer 3** (at ~500 active users).
  - Global correction-pattern analysis, weekly prompt-diff with human-in-the-loop review.

- [ ] **External integrations** (see `future-plans.md`).
  - vCard contact import first (zero OAuth).
  - Then Google OAuth — plan for 4–6 week scope-verification review for Gmail `readonly`.

- [ ] **Entry Chunking** (see `roadmap.md` sub-project 7).
  - Split long entries into overlapping chunks, dual-embed, dedupe in retrieval.
  - Kicks in when power users start storing SOPs/documents.

---

## Growth Loops to Harden

- [ ] **Shared brains viral mechanic.** One user invites 5 → each invites 3 → exponential compounding. Instrument invite-to-join conversion.
- [ ] **Insight card share rate.** Instrument: `share_click / insight_view`. Target 5%. Iterate card copy until hit.
- [ ] **Referral program** — $5 credit for referrer + referee on Starter upgrade. Only enable once organic share rate > 2%.

---

## What NOT to Build (first 6 months)

Avoid these even when tempted:

- **Team/Enterprise tiers** — wait for 1K+ individual paying users.
- **Mobile native apps** — PWA works. Native after $5K MRR.
- **Self-hosted / on-prem** — you're a SaaS. Say no.
- **API marketplace / plugin system** — REST Gateway only for now.
- **Voice-RAG real-time mode** — revisit at Month 6+ only if voice capture is a top-3 used feature.
- **Concept Graph WebGL polish** — no time spent on graph UX until telemetry shows users reaching the 50-entry threshold.

---

## Month 6–12 Definition of Done

- [ ] REST Gateway live with `em_*` API keys and 3 endpoints
- [ ] `api_usage` table and dashboard tab live
- [ ] JS SDK published to npm, Python SDK published to PyPI
- [ ] Finance RAG chat returning exact numbers for spend queries
- [ ] Recurring ghost entries auto-generating for known subscriptions
- [ ] Entry enrichment v0.2–v0.6 shipped
- [ ] Community Brain user-created brains with contributor + moderation roles
- [ ] Prompt Layer 2 injecting per-user preferences
- [ ] vCard import live
- [ ] Insight card share rate ≥ 5%
- [ ] Referral program live (after share rate > 2%)
