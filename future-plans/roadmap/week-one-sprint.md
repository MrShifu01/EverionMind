# Week 1 Sprint — Simplify + Monetise (Days 1–7)

**Goal:** Prune the app back to the MVP surface and make it possible to charge money.

---

## Days 1–3: Prune & Simplify

- [ ] **Feature-flag multi-brain.** Add `ENABLE_MULTI_BRAIN` env flag. Hide `BrainSwitcher`, `CreateBrainModal`, invite flows, `SettingsView/BrainTab`. Default single brain.
- [ ] **Disable Vault by default.** Move to `Settings > Security`. Replace passphrase modals with a gentle inline "unlock vault" link.
- [ ] **Remove from nav:** `TodoView`, `RefineView`, `VaultView`, Concept Graph. Tasks become entries with a checkbox in `Memory`. Refine output folds into the Feed (Day 4–7). Graph becomes a 50+ entries easter egg.
- [ ] **Collapse navigation to:** `Feed | Capture | Ask | Memory | Settings`.
- [ ] **Default AI provider to Gemini Flash Lite.** Hide provider selector under `Settings > Advanced > AI`. BYO API keys stay but buried.
- [ ] **Clean `vercel.json` rewrites.** Remove legacy aliases (`/api/delete-entry` → `/api/entries`). Dead routes = future confusion.
- [ ] **Run `npm run typecheck` + Knip.** Fix all errors, remove dead exports.

---

## Days 4–7: Stripe + Tier Enforcement (Blocker #1)

> Reference: `pricing-strategy.md` for tier limits and per-action cost math.

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

- [ ] **BYO-key users bypass limits.** If `user_ai_settings.provider_key` is set, skip usage check.

---

## Week 1 Definition of Done

- [ ] Nav collapsed to 5 items
- [ ] Multi-brain, Vault, Todo, Refine, Graph all hidden behind flags or removed from nav
- [ ] `user_usage` table migrated
- [ ] Stripe Checkout + webhook live
- [ ] Upgrade prompt shown at 90% and 100% of tier limits
- [ ] `npm run typecheck` passes clean
