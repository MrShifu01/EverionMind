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

## Cross-device sync — Supabase Realtime push (deferred from 2026-05-13)

What shipped (commit `35f4435`): foreground refetch on `visibilitychange`, `pageshow.persisted`, and `online` events, debounced 10s. Covers ~95% of cross-device UX — desktop → phone deletes and inserts propagate within one refetch cycle on app resume. Matches the pattern Notion, Linear, and Bear use as their default.

What's NOT shipped: real-time push. The previous `postgres_changes` subscription on `entries` was responsible for ~65% of total Supabase DB time (WAL decoder + publication-tables lookup per reconnect, even for subscribers whose UI didn't consume the events). It was ripped out and replaced with a 15s pending-enrichment poll (`useEntryRealtime`). Cross-device deletes / inserts now rely on the foreground refetch above.

- [ ] **Re-enable Realtime, scoped narrowly.** Subscribe only to the active brain (`filter: brain_id=eq.<active>`) and only while the tab is visible (drop the channel on `visibilitychange → hidden`, restore on visible). Far smaller decode + publication cost than the previous broadcast-to-all-subscribers shape — only the rows in the user's currently-viewed brain are decoded, only while they're looking at them. Combine with the foreground refetch as a fallback for missed events during reconnects.
- **Trigger:** when one of these becomes true —
  - **Shared brains ship** (real-time collaboration ratchets up the "is this current?" anxiety; lag between collaborators editing is a felt bug, not a polite delay).
  - **Capture Phase 2B fire-fast lands** (entry returns `state='pending'` instantly, worker drains async — UI needs Realtime to flip P/I/C chips green when worker completes, otherwise users see red dots for ~30-60s with no feedback). This is the more likely first trigger; already noted under Enrichment Phase 2B above.
  - **User feedback that the 10s foreground debounce feels slow** (multi-device power users who flip between desktop and phone within seconds and expect instant propagation).
- **Cost shape:** under "scoped to active brain only" the DB time should be a small fraction of the original ~65%. Worst-case estimate: a power user with 5000 entries actively editing for an hour produces ~50 mutations, each decoded once and broadcast to one subscriber → ~50 messages. Compared to the previous shape (every subscriber decoded every mutation across all brains they had any access to, even with the channel idle).

---

## View Transitions API — additional polish (deferred from 2026-05-13)

Initial roll-out shipped: tab transitions (`27c05fe`), entry card → DetailModal morph (`2eec554`), Ask pill → ChatSheet input morph (`098fa60`), Capture FAB → CaptureSheet morph (`3d10458`). The helper at `src/lib/viewTransitions.ts` (`6c33b9f`) is feature-detected + reduced-motion-aware + React.flushSync-wrapped, so all call sites fall back to instant on unsupported browsers.

The polish below uses the same helper and the same shared-element pattern but needs more careful per-component work. Each item is small in isolation but adds up to a "Notion-grade" tactile feel across the whole app.

- [x] **DetailModal close → reverse morph back to source card** (`f5ae8c3`). Imperative `view-transition-name` re-assignment INSIDE the startViewTransition callback so BEFORE captures only the modal carrying the name and AFTER captures only the card. `data-entry-id` on EntryCard + Atelier MemoryCard lets the close handler find the source card via querySelector.
- [x] **CaptureSheet close → reverse morph back to FAB** (`f5ae8c3`). `appShell.setShowCapture(false)` wrapped in startViewTransition. Both sheet and FAB carry `capture-surface`; browser morphs sheet → FAB pill on unmount.
- [x] **Chat route conversion** (`2c233df`). MobileHome's Ask pill navigates to `view: "chat"` instead of the modal sheet. Chat feature flag default-on.
- [x] **Memory list reorder / filter / sort** (`f5ae8c3`). Atelier's setFilter / setSort / setViewMode wrapped in startViewTransition. Each card's existing `view-transition-name: entry-${id}` produces position morphs on filter / sort changes.
- [x] **Voice orb composability prep** (`a943112`). Tagged the orb with `view-transition-name: voice-orb` for future shared-element morphs (home → full-screen live voice). The idle ↔ live scale itself stays on the existing CSS transition since the state is hook-driven and the current motion is already smooth.
- [x] **BrainSwitcher pill → sheet (`7b7dd7e`).** DropdownMenu → Radix Dialog, 420px centered sheet with mono+serif Inkwell header. Pill carries `view-transition-name: brain-pill` while closed; active row inside the sheet carries it while open. Pill `visibility: hidden` when open so only one element holds the name at rest. setOpen wrapped in startViewTransition.
- [x] **Retire user-pill→ChatSheet dead fallback (`7b7dd7e`).** Pill onClick is route-only now; removed the unused else branch that called `setSheetExplicitOpen`. Also removed the `sheetExplicitOpen` state entirely.
- [ ] **ChatSheet close → reverse morph back to Ask pill.** Largely moot now that the chat is route-based (2c233df) — closing chat = navigating back via the root-view native transition. Only relevant if voice-driven content keeps the ChatSheet alive as the voice surface; the close morph would matter there.
- [ ] **Fully retire ChatSheet (voice-content path).** The user-pill path is dead (above), but ChatSheet still auto-opens when voice transcripts or pending voice actions land in `useChat`. To fully retire it, either: (a) route voice content into the chat route (requires lifting `useChat` state out of MobileHome so the chat route sees the same messages), or (b) replace the sheet with an inline VoiceTranscriptCard overlay (already exists for voice live). Decide based on whether you want voice context to persist on route changes.
- [ ] **Onboarding step transitions.** Current OnboardingModal is a single-step capture experience (no multi-step state). FirstRunChecklist is a list, not a flow. Onboarding morphs only become relevant if onboarding grows multi-step screens with a shared header / logo — revisit when that happens.

**Trigger:** any moment of "this could feel more native." None of these are launch-blocking. They're systematic polish — best worked in batches across a single day's pass rather than scattered through other PRs.

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
