# Pricing Strategy — Everion Hosted AI

**Goal:** Users get working AI out of the box. No API key needed. Everion pays the API providers, users pay Everion. Three simple tiers.

---

## Part 1 — Raw API costs (researched April 2026)

### Gemini 2.5 Flash Lite (text generation)

| | Price |
|---|---|
| Input | $0.10 / 1M tokens |
| Output | $0.40 / 1M tokens |
| Free tier | 15 RPM, 1,000 RPD, 250K TPM |

Source: [Google AI pricing](https://ai.google.dev/gemini-api/docs/pricing)

### gemini-embedding-001 (embeddings)

| | Price |
|---|---|
| Input | $0.15 / 1M tokens |
| Batch | $0.075 / 1M tokens (50% off) |
| Free tier | 1,500 RPD |

Note: `text-embedding-004` was sunset Jan 2026. `gemini-embedding-001` is the current model.

Source: [Google Developers Blog](https://developers.googleblog.com/gemini-embedding-available-gemini-api/)

### Groq Whisper (voice transcription)

| Model | Price/hour | Price/minute |
|---|---|---|
| Whisper Large v3 | $0.111 | $0.00185 |
| Whisper Large v3 Turbo | $0.040 | $0.00067 |
| Distil-Whisper | $0.020 | $0.00033 |
| Free tier | 2,000 RPD, 7,200 audio-sec/hour | |

**Recommendation:** Use **Whisper Large v3 Turbo** — best cost/accuracy tradeoff at $0.04/hour.

Source: [Groq pricing](https://groq.com/pricing)

### Infrastructure

| Service | Monthly cost |
|---|---|
| Vercel Pro | $20/month (includes $20 usage credit, 1 TB bandwidth, 10M edge requests) |
| Supabase Pro | $25/month (8 GB database, 100K MAUs, 100 GB storage, 250 GB egress, $10 compute credit) |
| **Total fixed** | **$45/month** |

Sources: [Vercel pricing](https://vercel.com/pricing), [Supabase pricing](https://supabase.com/pricing)

---

## Part 2 — Per-action cost breakdown

These are the real costs Everion pays per user action, using Gemini 2.5 Flash Lite + gemini-embedding-001 + Groq Whisper Turbo.

### Capture an entry (parse text + embed)

| Step | Tokens | Cost |
|---|---|---|
| LLM parse (system prompt + user text → structured JSON) | ~800 in, ~400 out | $0.00024 |
| Embed entry for semantic search | ~300 in | $0.000045 |
| **Total per capture** | | **$0.0003** |

### Ask Brain chat query

| Step | Tokens | Cost |
|---|---|---|
| Embed user question | ~100 in | $0.000015 |
| LLM response (system + 20 retrieved entries + history → answer) | ~3,000 in, ~600 out | $0.00054 |
| **Total per chat message** | | **$0.0006** |

### Voice note (30-second average)

| Step | Cost |
|---|---|
| Groq Whisper transcription (0.5 min) | $0.000335 |
| Then capture pipeline (parse + embed) | $0.0003 |
| **Total per voice note** | **$0.0006** |

### Improve Brain scan

| Step | Tokens | Cost |
|---|---|---|
| Multi-pass analysis over entries | ~8,000 in, ~2,000 out | $0.0016 |
| **Total per scan** | | **$0.002** |

### Summary

| Action | Cost to Everion |
|---|---|
| 1 capture | $0.0003 |
| 1 chat message | $0.0006 |
| 1 voice note | $0.0006 |
| 1 Improve scan | $0.002 |

**Key insight:** Gemini 2.5 Flash Lite is absurdly cheap. A heavy user doing 1,000 captures + 500 chats + 100 voice notes + 10 scans per month costs Everion **~$1.32/month** in API fees.

---

## Part 3 — Three-tier pricing

### Free — $0/month

For trying the app. No card needed.

| Feature | Limit |
|---|---|
| Entries | 50/month |
| Ask Brain messages | 30/month |
| Voice notes | 5/month |
| Brains | 1 |
| Improve Brain | — |
| Vault (E2E encryption) | — |
| Invite members | — |

**Cost to Everion per free user (typical):**

| Action | Volume | Cost |
|---|---|---|
| 30 captures × $0.0003 | | $0.009 |
| 20 chats × $0.0006 | | $0.012 |
| 3 voice × $0.0006 | | $0.002 |
| **Total** | | **$0.02/month** |

Negligible. 1,000 free users cost ~$20/month in API. Acquisition cost is the real expense.

---

### Starter — $4.99/month

For daily personal use. The "it just works" tier.

| Feature | Limit |
|---|---|
| Entries | 300/month |
| Ask Brain messages | 150/month |
| Voice notes | 30/month |
| Brains | 3 |
| Improve Brain | 2 scans/month |
| Vault (E2E encryption) | ✓ |
| Invite members | 1 per brain |

**Cost to Everion per Starter user (typical usage: ~60% of limits):**

| Action | Volume | Cost |
|---|---|---|
| 180 captures × $0.0003 | | $0.054 |
| 90 chats × $0.0006 | | $0.054 |
| 18 voice × $0.0006 | | $0.011 |
| 2 scans × $0.002 | | $0.004 |
| **Total API** | | **$0.12/month** |

| | Per user/month |
|---|---|
| Revenue | $4.99 |
| API cost | $0.12 |
| **Gross margin** | **$4.87 (97.6%)** |

---

### Pro — $9.99/month

For power users, families, small businesses.

| Feature | Limit |
|---|---|
| Entries | Unlimited (fair use: 2,000/month) |
| Ask Brain messages | Unlimited |
| Voice notes | 100/month |
| Brains | Unlimited |
| Improve Brain | Unlimited |
| Vault (E2E encryption) | ✓ |
| Invite members | 5 per brain |
| API access (MCP / REST) | ✓ (future) |
| Priority support | ✓ |

**Cost to Everion per Pro user (heavy usage):**

| Action | Volume | Cost |
|---|---|---|
| 1,000 captures × $0.0003 | | $0.30 |
| 500 chats × $0.0006 | | $0.30 |
| 80 voice × $0.0006 | | $0.048 |
| 10 scans × $0.002 | | $0.02 |
| **Total API** | | **$0.67/month** |

**Worst-case Pro user (maxes everything):**

| Action | Volume | Cost |
|---|---|---|
| 2,000 captures × $0.0003 | | $0.60 |
| 1,000 chats × $0.0006 | | $0.60 |
| 100 voice × $0.0006 | | $0.06 |
| 30 scans × $0.002 | | $0.06 |
| **Total API** | | **$1.32/month** |

| | Per user/month |
|---|---|
| Revenue | $9.99 |
| Worst-case API cost | $1.32 |
| **Gross margin (worst case)** | **$8.67 (86.8%)** |

---

## Part 4 — Breakeven analysis

### Fixed costs

| Cost | Monthly |
|---|---|
| Vercel Pro | $20 |
| Supabase Pro | $25 |
| Domain + misc | ~$5 |
| **Total fixed** | **$50/month** |

### Breakeven scenarios

| Scenario | Paying users needed |
|---|---|
| All Starter ($4.99) | 11 users |
| All Pro ($9.99) | 6 users |
| Mix: 10 Starter + 3 Pro | Revenue $79.87, profit $29.87 |
| Mix: 50 Starter + 10 Pro | Revenue $349.40, API ~$40, profit ~$260 |

### Revenue projections

| Users | Free | Starter | Pro | Monthly revenue | Monthly API cost | Monthly profit |
|---|---|---|---|---|---|---|
| **Launch** | 100 | 10 | 3 | $79.87 | $52.70 | $27.17 |
| **6 months** | 500 | 50 | 15 | $399.35 | $60.60 | $338.75 |
| **12 months** | 2,000 | 200 | 50 | $1,498.50 | $93.40 | $1,405.10 |
| **Scale** | 10,000 | 1,000 | 200 | $6,988.00 | $456 | $6,532 |

Note: at scale, Supabase/Vercel overage costs increase. Budget ~$200/month at 1,000 paying users for bandwidth + DB overages. Still very healthy margins.

### Infrastructure scaling triggers

| Milestone | Action | Added cost |
|---|---|---|
| 100 paying users | No change needed | $0 |
| 500 paying users | Consider Supabase compute upgrade (Small instance) | +$15/month |
| 1,000 paying users | Vercel bandwidth may exceed 1 TB | +$40/month |
| 5,000 paying users | Supabase Medium instance + read replicas | +$75/month |
| 10,000+ paying users | Evaluate self-hosting or enterprise tiers | Variable |

---

## Part 5 — Implementation notes

### How to enforce limits

Track usage per user in a `usage` table:

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

Increment on each action. Check against tier limits before executing the AI call. Reset monthly. Display usage in Settings.

### How to manage the API keys

- Everion holds one Gemini API key and one Groq API key — users never see them.
- Keys stored in Vercel environment variables, never exposed to the client.
- All AI calls go through Everion's API routes (`api/anthropic`, `api/chat`, etc.) which authenticate the user first, then use the server-side key.
- Rate limiting per user (existing `rateLimit` helper) prevents any single user from burning the global quota.

### Stripe integration

- Stripe Checkout for subscription signup.
- Stripe Customer Portal for plan changes and cancellations.
- Webhook to sync subscription status to `user_profiles.tier` column in Supabase.
- Plans: `price_free`, `price_starter_monthly`, `price_pro_monthly`.
- Annual discount (optional): 2 months free → Starter $49.90/year, Pro $99.90/year.

### What users who already have their own API keys get

- Users who bring their own API key (existing flow) bypass Everion's hosted AI and usage limits entirely.
- Their requests go directly to their provider — Everion pays nothing.
- These users don't need a paid plan for AI features, but may still want Starter/Pro for Vault, multiple brains, and Improve Brain.
- Settings UI: "Use Everion AI (included)" toggle vs "Use your own API key (advanced)".

---

## Part 6 — Pricing page copy (draft)

### Free
**Try Everion**
- 50 entries/month
- 30 AI questions
- 5 voice notes
- 1 brain

### Starter — $4.99/month
**Your second brain**
- 300 entries/month
- 150 AI questions
- 30 voice notes
- 3 brains
- Vault encryption
- Improve Brain AI

### Pro — $9.99/month
**Unlimited memory**
- Unlimited entries
- Unlimited AI chat
- 100 voice notes
- Unlimited brains
- Everything in Starter
- Priority support
- API access (coming soon)

---

## Pricing API cost sources

- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [gemini-embedding-001 launch](https://developers.googleblog.com/gemini-embedding-available-gemini-api/)
- [Groq pricing](https://groq.com/pricing)
- [Groq free tier limits](https://www.grizzlypeaksoftware.com/articles/p/groq-api-free-tier-limits-in-2026-what-you-actually-get-uwysd6mb)
- [Vercel pricing](https://vercel.com/pricing)
- [Supabase pricing](https://supabase.com/pricing)
