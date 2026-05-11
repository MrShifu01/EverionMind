# Post-launch backlog

> **Status: deferred from V0.** Real, scoped work — but explicitly post-launch. The dashboard treats this file like an archive (hidden from default views) so it stops counting against the active sprint. Promote items back into `LAUNCH_CHECKLIST.md` or `ROADMAP.md` when they enter the active window.

Updated 2026-05-11 — extracted from `LAUNCH_CHECKLIST.md § P2` and `ROADMAP.md § Month 1-2 / 3-6 / 6-12`.

---

## Shared brains — Phase 2+ (deferred from 2026-04-28 brainstorm)

Phase 1 (solo multi-brain plumbing) shipped behind flag `multiBrain`. Spec: `docs/superpowers/specs/2026-04-28-shared-brains-design.md`. Decisions already locked, implementation deferred:

- [ ] **Phase 2: invites + members** — `brain_members`, `brain_invites` tables. POST `/api/user-data?resource=brains&action=invite` (email + link). Email-redemption flow via Resend (signup link → auto-join on first login). Member-list view in Settings → Brains tab. Owner can revoke invites.
- [ ] **Phase 2: roles** — owner / member / observer. Member = wiki-style edit any (locked: brainstorm Q3 = B). Observer = read-only.
- [ ] **Phase 2: RLS for shared access** — replace `brains_owner_all` with policies that grant SELECT to members/observers, INSERT/UPDATE/DELETE on entries to members + owner only. Service-role bypass for system jobs unchanged.
- [ ] **Phase 2: audit-log events** — `brain_invited`, `brain_joined`, `brain_member_removed`, `brain_role_changed` on the existing `audit_log` table (migration 053).
- [ ] **Phase 3: full management UX** — transfer ownership, delete brain with member confirmation broadcast, "leave brain" for members.
- [ ] **Phase 3: brain-level activity feed** — see who added/edited what, when (read from audit_log).
- [ ] **Phase 4: discovery / public brains** — out of scope for 2026; only revisit if community use case re-emerges.

---

## Enrichment pipeline — Phase 2B + 3 (deferred from 2026-05-06)

Phase 2A (queue state + daily quota + claim worker) shipped 2026-05-06 (commit `beecc65`). The async/durable migrations below are higher-leverage work but only triggered by user-visible scale.

- [ ] **Phase 2B — async capture / fire-fast.** Switch capture/llm/mcp/v1 from `await enrichInline` to fire-fast — entry returns `state='pending'` instantly, worker drains within ~1min. Trade: capture latency drops from 3-5s to <200ms, but UI shows red P/I/C chips for ~30-60s post-capture (need Supabase realtime subscription to flip when worker completes). **Trigger:** when capture latency or function concurrency limits become user-visible. Probably ~3000-5000 active users.
- [ ] **Phase 3 — Vercel Queues / Inngest migration.** When the cron worker can't keep up (~10k+ active users): move from cron-driven sweep to event-driven worker, per-user round-robin scheduling, step-level durability + exponential backoff. Vercel Queues (Beta) is lowest-friction; Inngest is best-in-class for workflow durability. Cost ~$50-200/mo. **Trigger:** p95 cron drain time exceeding 1h.

---

## Month 1-2 features (from ROADMAP § Month 1-2)

Day-7 retention loop. Build only after the launch checklist closes and the first cohort is in.

- [ ] **Shareable Insight Cards.** "Share this insight" button on AI responses. OG-image-ready card (quote + brain logo + `everion.app`). Copy-to-clipboard + direct share to X, LinkedIn, WhatsApp. Organic acquisition engine — users share AI insights that make them look smart.
- [ ] **Weekly Email Digest.** Sunday: "Your brain this week — 12 captures, 3 patterns, 1 action suggested." Links back to the Feed. Reactivates dormant users. Use Resend.
- [ ] **Push Notifications (streak reminders).** "Don't break your 7-day streak." Respect quiet hours. Dismissible. Opt-out in Settings.
- [ ] **Chat Feedback v1.** Thumbs up/down on every AI response. `chat_feedback` table with question embedding. Feeds top-3 thumbs-up examples into next chat as few-shot. Also feeds Layer 1 prompt edits.
- [ ] **Prompt Improvement Layer 1.** Weekly review of thumbs-down responses. Edit CAPTURE + CHAT prompts based on actual failure modes.

---

## Month 3-6 features (from ROADMAP § Month 3-6)

**Starting point:** 200–500 paying users, $1–3K MRR, clear power-user picture.

- [ ] **Unhide multi-brain for paying users.** Remove `ENABLE_MULTI_BRAIN` flag for Starter/Pro. Reuses already-built work. Differentiates Starter/Pro from Free. Unlocks the **shared brains viral loop** — strongest viral mechanic. Only ships now because single-brain retention is proven.
- [ ] **Finance v0.1 — `finance` entry type.** Add `finance` to `CANONICAL_TYPES`. Parser recognises "spent R450 on groceries". Smallest surface, highest daily-use lift.
- [ ] **Finance v0.2 — Dashboard view.** Top cards: month income / expenses / net / savings rate. Category breakdown donut, net-worth line chart. Client-side aggregation from entries.
- [ ] **Finance v0.3 — Budgets.** Category budgets with progress bars + warnings.
- [ ] **Community Brain v0.1 — read-only seed.** Hard-coded "Everion Community" brain. Every user auto-joins as reader. Seed with ~200 example entries. Solves Day-1 emptiness for new users.
- [ ] **Entry Enrichment v0.1 — manual ✨ button.** Google Places + Wikipedia + Gemini grounded fallback. User-triggered, reviewable, never silent. Build `src/lib/enrich/` router.
- [ ] **Concept Graph re-introduction at 50+ entries.** Only unlock at 50. "Your brain is growing — see the connections." Reward in the habit loop, not a default nav item. Confidence labels (EXTRACTED / INFERRED), god-node view, surprising connections.

### Infrastructure milestones

- [ ] At 500 paying users: upgrade Supabase compute (Small, +$15/mo).
- [ ] Watch Vercel bandwidth — 1TB cap approaching.
- [ ] Enable Semantic Caching for `/v1/context` once latency tail shows repeat queries.

---

## Month 6-12 features (from ROADMAP § Month 6-12)

**Target:** $10K MRR. Only reachable if retention math holds and one acquisition channel is repeatable.

- [ ] **REST Gateway.** `em_*` API keys, `/v1/context`, `/v1/answer`, `/v1/ingest`. Enables Everion as a second-brain backend for ChatGPT, Claude Desktop, custom agents. **The developer-audience moat.**
- [ ] **Usage Tracking.** `api_usage` table, dashboard tab. Depends on REST Gateway.
- [ ] **JS + Python SDKs.** Thin wrappers, npm + PyPI.
- [ ] **Finance v0.4 — RAG-aware finance chat.** Intent classifier routes finance questions through structured tool (`{kind, category, from, to, agg: "sum"}`) before LLM. "How much did I spend on groceries in March?" → exact number + NL explanation. **The "wow" demo.**
- [ ] **Finance v0.5 — Recurring auto-generation.** Ghost entries for salary / rent / subscriptions, upgraded to real on date.
- [ ] **Entry Enrichment v0.2–v0.6.** Books / TMDB + Discovery queries ("what series would I enjoy?" → TMDB Discover + LLM ranking + Save-to-brain). Most user-visible enrichment payoff.
- [ ] **Community Brain v0.2–v0.4.** User-created community brains, contributor role, voting, moderation.
- [ ] **Prompt Self-Improvement Layer 2** (~50 active users). Per-user preference blob injected into system prompts.
- [ ] **Prompt Self-Improvement Layer 3** (~500 active users). Global correction-pattern analysis, weekly prompt-diff with human-in-the-loop review.
- [ ] **Entry Chunking.** Split long entries into overlapping chunks, dual-embed, dedupe in retrieval. Kicks in when power users start storing SOPs/documents.

### Growth loops to harden

- [ ] **Shared brains viral mechanic.** One user invites 5 → each invites 3 → exponential. Instrument invite-to-join conversion.
- [ ] **Insight card share rate.** Instrument: `share_click / insight_view`. Target 5%. Iterate card copy until hit.
- [ ] **Referral program.** $5 credit for referrer + referee on Starter upgrade. Only enable once organic share rate > 2%.

---

## Promotion rules

When promoting an item from this file back into the active checklist:

1. Cut the row from here, paste into `LAUNCH_CHECKLIST.md` (current scope) or `ROADMAP.md` (next milestone) with priority + due date.
2. Add a one-line note here under "Promoted" saying when + where it went.
3. Don't leave the row in both places — drift is the failure mode.
