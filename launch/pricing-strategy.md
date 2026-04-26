# EverionMind — Pricing Strategy

**Last updated:** 2026-04-24

---

## Tiers & Prices

| Tier | Monthly | Annual | Annual saving |
|---|---|---|---|
| Free | $0 | $0 | — |
| Starter | $4.99 | $49.90 | ~2 months free |
| Pro | $9.99 | $99.90 | ~2 months free |

Breakeven estimate: 11 Starter users cover base Supabase + Vercel costs.

---

## What Each Tier Includes

### Free
- Unlimited raw entry capture and storage
- Basic keyword search
- Tags, types, organisation
- Offline support
- Vault (encrypted secrets)
- BYOK (bring your own API keys) → unlocks full AI pipeline at no platform cost
  - AI parsing & classification
  - Vector embeddings & semantic search
  - Concept extraction & knowledge graph
  - Gmail scanning, calendar integration
  - AI insights per entry

### Starter — $4.99 / month
Everything in Free, plus:
- Platform-managed AI (no keys required)
- 500 AI-assisted captures / month
- 200 AI chats / month
- 20 voice notes / month
- 20 improve scans / month
- AI models: Gemini Flash / Claude Haiku (fast, cost-efficient)

### Pro — $9.99 / month
Everything in Starter, plus:
- 2 000 AI-assisted captures / month
- 1 000 AI chats / month
- 100 voice notes / month
- Unlimited improve scans
- AI models: Claude Sonnet / GPT-4o (premium quality)
- All product features unlocked (multi-brain, advanced enrichment, etc.)
- Priority processing & support

---

## Platform AI Usage Limits

| Action | Free (BYOK) | Starter | Pro |
|---|---|---|---|
| AI-parsed captures | unlimited (own key) | 500 / mo | 2 000 / mo |
| AI chats | unlimited (own key) | 200 / mo | 1 000 / mo |
| Voice notes | unlimited (own key) | 20 / mo | 100 / mo |
| Improve scans | unlimited (own key) | 20 / mo | unlimited |

BYOK users on any tier bypass platform limits entirely — the provider bills them directly.

---

## AI Models by Tier

| Task | Starter | Pro |
|---|---|---|
| Capture parsing | Gemini Flash Lite | Gemini Flash / Claude Haiku |
| Chat / Q&A | Claude Haiku / Gemini Flash | Claude Sonnet / GPT-4o |
| Embeddings | text-embedding-004 | text-embedding-004 |
| Enrichment | Gemini Flash Lite | Gemini Flash |
| Voice transcription | Groq Whisper | Groq Whisper |

---

## Per-Action Cost Estimate (platform AI)

Approximate blended cost at current provider rates:

| Action | Cost/unit | Starter margin | Pro margin |
|---|---|---|---|
| AI capture (parse + embed) | ~$0.0004 | ~85% | ~88% |
| Chat turn | ~$0.002 | ~80% | ~82% |
| Voice note (30s) | ~$0.001 | ~85% | ~87% |
| Improve scan | ~$0.003 | ~80% | ~82% |

Blended gross margin target: **85%+**

---

## Upgrade Trigger Points

- At **90%** of any monthly limit: amber non-blocking banner with upgrade CTA
- At **100%** of any limit: action blocked, upgrade modal shown
- Modal always includes "Use your own API key instead" escape hatch

---

## Data Architecture

Tier is stored in `user_profiles.tier` (source of truth). `user_ai_settings.plan` is kept in sync via a DB trigger during the transition period and will be removed once all reads migrate to `user_profiles`. See design spec for full schema.

---

## Stripe Products

| Product | Stripe Price ID env var |
|---|---|
| Starter monthly | `STRIPE_STARTER_PRICE_ID` |
| Pro monthly | `STRIPE_PRO_PRICE_ID` |
| Starter annual | `STRIPE_STARTER_ANNUAL_PRICE_ID` |
| Pro annual | `STRIPE_PRO_ANNUAL_PRICE_ID` |

---

## Key Decisions & Rationale

**Why BYOK on Free?**
Lowers the barrier to zero for technical users. They get full AI without paying, but they manage their own keys and costs. This drives signups and word-of-mouth in the developer/PKM audience. Paid tiers sell convenience + model quality, not capability.

**Why 3 tiers not 2?**
$4.99 Starter captures users who want platform AI but won't pay $9.99 at launch. Lower entry point = higher conversion. Starter → Pro upsell happens naturally as power users hit limits or want better models.

**Why hosted Checkout (not embedded)?**
Fastest to ship, highest conversion, zero PCI scope. Stripe's hosted page handles 3DS, SCA, tax, card validation. Revisit embedded Elements only if brand consistency becomes a hard requirement post-launch.

**Grace period on cancellation**
`tier_expires_at` is set to `current_period_end` on `subscription.deleted`. Users retain access until the period they paid for ends — no surprise access loss, reduces support tickets.
