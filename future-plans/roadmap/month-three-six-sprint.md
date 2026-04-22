# Month 3–6 Sprint — Expand the Moat

**Starting point:** 200–500 paying users, $1–3K MRR, clear picture of who the power user is.

---

## Feature Priorities (in order)

- [ ] **Unhide multi-brain for paying users.**
  - Remove `ENABLE_MULTI_BRAIN` flag gate for Starter/Pro tiers.
  - Reuses the work already built. Keeps Starter/Pro differentiated from Free.
  - Unlocks collaborative shared brains viral loop — one user must invite others. Strongest viral mechanic. Only ships now because single-brain retention is proven.

- [ ] **Finance v0.1 — `finance` entry type** (see `community-brain-and-finance.md`).
  - Add `finance` to `CANONICAL_TYPES`. Parser recognises "spent R450 on groceries".
  - Smallest surface, highest daily-use lift.

- [ ] **Finance v0.2 — Dashboard view.**
  - Top cards: this month income / expenses / net / savings rate.
  - Category breakdown donut, net-worth line chart.
  - Client-side aggregation from entries — no server work.

- [ ] **Finance v0.3 — Budgets.**
  - Category budgets with progress bars + warnings.

- [ ] **Community Brain v0.1 — read-only seed.**
  - One hard-coded "Everion Community" brain, every user auto-joins as reader.
  - Seed with ~200 example entries.
  - Solves Day-1 emptiness for new users.

- [ ] **Entry Enrichment v0.1 — manual ✨ button** (see `entry-enrichment.md`).
  - Google Places + Wikipedia + Gemini grounded fallback.
  - User-triggered, reviewable, never silent.
  - Build the `src/lib/enrich/` router.

- [ ] **Concept Graph re-introduction at 50+ entries.**
  - Only unlock when user hits 50 entries. "Your brain is growing — see the connections."
  - Reward in the habit loop, not a default nav item.
  - Confidence labels: EXTRACTED / INFERRED. God-node view. Surprising connections.

---

## Infrastructure Milestones

- [ ] At 500 paying users: upgrade Supabase compute (Small, +$15/mo).
- [ ] Watch Vercel bandwidth — 1TB cap approaching.
- [ ] Enable Semantic Caching for `/v1/context` responses once latency tail shows repeat queries.

---

## Month 3–6 Definition of Done

- [ ] Multi-brain live and gated to Starter/Pro
- [ ] Finance entry type recognised and stored correctly
- [ ] Finance dashboard showing income / expenses / net / savings
- [ ] Budget tracking with progress bars
- [ ] Community Brain seeded with 200+ entries, all users auto-joined
- [ ] Entry enrichment ✨ button live and reviewable
- [ ] Concept Graph unlocked at 50+ entries with confidence labels
