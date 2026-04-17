# Everion Mind — Future Platform Roadmap

Sub-projects deferred after REST Gateway (sub-project 1) ships.
Each item is an independent scope → spec → plan → implementation cycle.

---

## Sub-project 2 — Usage Tracking

Track API activity per key so users can see how their memory is being accessed.

**What to build:**
- `api_usage` table in Supabase: `user_id`, `key_id`, `endpoint`, `request_count`, `tokens_estimated`, `latency_ms`, `timestamp`
- Middleware in `api/v1.ts` that writes a usage row after each successful request (fire-and-forget, non-blocking)
- Dashboard tab showing: requests this month, last used, per-endpoint breakdown

**Depends on:** REST Gateway (sub-project 1)

---

## Sub-project 3 — Semantic Caching

Cache query results in Redis to hit the <50ms target for repeated queries.

**What to build:**
- Cache key: `SHA-256(userId + query)` → stored in Upstash Redis with a TTL (e.g. 5 min)
- Cache `/v1/context` responses (not `/v1/answer` — LLM output shouldn't be cached blindly)
- Cache embeddings: if the same query text is embedded twice, return cached vector
- Cache miss falls through to normal retrieval pipeline

**Depends on:** REST Gateway (sub-project 1)

---

## Sub-project 4 — Billing Layer

Enforce usage tiers and prepare for Stripe integration.

**What to build:**
- Free tier: 500 requests/month
- Paid tier: 10,000 requests/month (or unlimited)
- `user_subscriptions` table: `user_id`, `tier`, `period_start`, `request_count`, `overage`
- Middleware that checks monthly count before processing a request (429 with tier message if over)
- Stripe webhook handler to flip `tier` on payment
- UI: upgrade prompt when approaching limit

**Depends on:** Usage Tracking (sub-project 2)

---

## Sub-project 5 — JS + Python SDK

Make it trivial for developers to integrate Everion into their own apps.

**JavaScript SDK**
```js
const everion = new EverionClient({ apiKey: 'em_...' })
const results = await everion.context("What are my goals?")
const answer  = await everion.answer("Summarize Q2", { model: 'openai/gpt-4o', apiKey: 'sk-...' })
await everion.ingest({ title: 'New note', content: '...' })
await everion.update({ id: 'uuid', content: 'Updated...' })
await everion.delete('uuid')
```

**Python SDK**
```python
everion = EverionClient(api_key="em_...")
results = everion.context("What are my goals?")
answer  = everion.answer("Summarize Q2", model="openai/gpt-4o", api_key="sk-...")
everion.ingest(title="New note", content="...")
everion.update(id="uuid", content="Updated...")
everion.delete("uuid")
```

- Thin wrappers over the REST API — no business logic in the SDK
- Published to npm and PyPI
- README with quickstart for ChatGPT, Claude, and custom agents

**Depends on:** REST Gateway (sub-project 1)

---

## Sub-project 6 — Dashboard Enhancements

Surface the platform features in the Everion UI.

**What to build:**
- API Keys tab: create, revoke, rotate keys with one click
- Usage tab: requests this month, last used timestamp, endpoint breakdown chart
- "Connect Your AI" tab: step-by-step instructions with copy buttons for `/v1/context`, `/v1/answer`, `/v1/ingest` — generic REST format usable in any tool
- Upgrade prompt (when billing is live)

**Depends on:** Usage Tracking (sub-project 2), Billing Layer (sub-project 4)
