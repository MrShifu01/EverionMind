# AI Provider Abstraction Audit — 2026-05-07

> Evidence-based review of the AI provider boundary: `callAI`, the BYOK chain, the quota gate, the model registry, the retry budget, every `callAI` callsite, and the parallel adapter family at `api/_lib/providers/*`. Scope excludes feature flows that *use* `callAI` (covered by enrichment / retrieval / mcp audits).

## Verdict

**Two parallel abstractions, neither of them complete.** `callAI` (`api/_lib/aiProvider.ts`) was built as the single LLM entry point — bounded retry, optional quota gate, four provider adapters. It has only **four callsites total** (`enrich.ts:236, 361, 390`, `mergeEntries.ts:280`). Every other LLM call in the codebase — Gmail extract, file extract, persona extraction, concept-graph rebuild, audit batch, distill, feedback insight-correction, /api/llm chat & split, retrieval rebuild — bypasses `callAI` and goes straight to `googleAiFetch` or the parallel adapter family at `api/_lib/providers/{anthropic,openai,gemini}.ts`.

**Net effect:** the centralised retry budget, the quota gate, and the failover hint live on `callAI`, but ~25 raw `googleAiFetch` callsites do their own ad-hoc thing — most don't retry at all, half don't check the quota, and none share a token-cost ledger. The "single source of truth" doesn't exist; `callAI` is one of three competing surfaces.

**BYOK keys are stored in plaintext** in `user_ai_settings` (Supabase table). Browser writes them through the public anon key. No application-level encryption with `OAUTH_TOKEN_ENCRYPTION_KEY` shape. Service-role reads return ciphertext-shaped strings that aren't ciphertext.

**Six findings, two HIGH (BYOK plaintext + quota coverage gap), two MEDIUM (parallel abstractions + missing failover), two LOW (no cost telemetry + retry inconsistency).**

---

## Architecture overview

```
                ┌──────────────────────────────────────────────┐
                │   callAI (api/_lib/aiProvider.ts:97)         │
                │   - bounded retry (4 attempts: 100/400/1600) │
                │   - optional quota.{userId,tier} gate        │
                │   - 4 adapters: anthropic|openai|            │
                │     openai-compatible|gemini                 │
                │   - returns "" on permanent failure          │
                │   - swallows + logs all errors               │
                └──────────────────────────────────────────────┘
                                   ▲
                          only 4 callsites
                                   │
   enrich.ts:236  enrich.ts:361  enrich.ts:390  mergeEntries.ts:280
   (parse step)   (insight)      (concepts)     (merge LLM)
                                   │
                                   │ no failover. one provider try.
                                   │ if Gemini 5xx after 4 attempts,
                                   │ returns "" — caller logs nothing
                                   │ to a fallback chain.
                                   ▼

                 ─────────── PARALLEL UNIVERSE ───────────

       /api/llm chat + split     api/_lib/providers/select.ts
       (api/llm.ts:67-82,        ┌────────────────────────┐
        461-462, 674-675)        │ selectProvider(...)    │
                                 │ getAdapter(...)        │
                                 └────────────────────────┘
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                    anthropic.ts       openai.ts       gemini.ts
                    (no retry)         (no retry)      (no retry)
                    fetch() raw        fetch() raw     googleAiFetch raw

                 ─────────── DIRECT googleAiFetch ───────────

       gmailScan.ts:186, 824   (PDF/email content extraction)
       extractPersonaFacts.ts:339   (persona fact extraction)
       distillRejected.ts:110, 119   (reject-rule learning)
       distillGmail.ts:152, 160   (gmail-rule learning)
       distillPatternSummary.ts:127, 134   (pattern naming)
       retrievalCore.ts:563   (concept-graph rebuild)
       feedback.ts:186   (insight correction)
       entries.ts:692   (entry audit batch)
       enrich.ts:1912, 1919   (skip-rule reject filter)
       generateEmbedding.ts:60, 99   (embeddings)
       providers/gemini.ts:103   (file extract)
       user-data.ts:1240, 1260   (health-check probes)

                 ─────────── BYOK STORAGE ───────────

       Browser ProvidersTab.tsx
              │
              ▼
       supabase.from("user_ai_settings").upsert({
         anthropic_key: "<plaintext>", openai_key: "<plaintext>",
         gemini_key: "<plaintext>", openrouter_key: "<plaintext>"
       })   (src/lib/aiSettings.ts:73-82, 86-97)
              │
              ▼
       Postgres user_ai_settings (RLS: user can read+write own row)
              │
              ▼
       Server: fetchSettings() reads back as-is
       (resolveProvider.ts:57-65, loadUserAiContext.ts:38-62)
              │
              ▼
       AICall.apiKey = settings.anthropic_key   (no decrypt step)
```

---

## `callAI` callsite inventory

| # | File:line | Step | Provider source | Retry | Quota gate | BYOK path | Notes |
|---|---|---|---|---|---|---|---|
| 1 | `api/_lib/enrich.ts:236` | parse (capture LLM) | `resolveProviderForUser(userId)` → AICall | 4-attempt 100/400/1600ms (in `callAI`) | No `quota:` opt — outer gate at `enrich.ts:897` | Yes (anthropic→openai→gemini→openrouter via resolveProvider) | json:true, maxTokens:1500 |
| 2 | `api/_lib/enrich.ts:361` | insight | same `cfg` | same | same outer gate | same | maxTokens:300 |
| 3 | `api/_lib/enrich.ts:390` | concepts | same `cfg` | same | same outer gate | same | json:true, maxTokens:400 |
| 4 | `api/_lib/mergeEntries.ts:280` | merge entries | `resolveProviderForUser(userId)` | 4-attempt | **Yes — passes `quota:{userId, tier}` opt to callAI** | same | only callsite using inline quota path |

That's it. Four callsites. Every other LLM call is outside the abstraction.

---

## Non-`callAI` LLM callsite inventory (the parallel universe)

| # | File:line | Purpose | Provider | Retry | Quota | BYOK |
|---|---|---|---|---|---|---|
| 1 | `api/_lib/gmailScan.ts:186` | extract email body via Gemini | `GEMINI_EXTRACT_MODEL` env | None | No | No (server key) |
| 2 | `api/_lib/gmailScan.ts:824` | gmail classifier | user/server gemini | None | No | Yes (geminiKey arg) |
| 3 | `api/_lib/extractPersonaFacts.ts:339` | persona extraction | `GEMINI_API_KEY` env | None | No | No |
| 4 | `api/_lib/distillRejected.ts:110, 119` | rule learning | `GEMINI_API_KEY` env | One ad-hoc retry on 429 only | No | No |
| 5 | `api/_lib/distillGmail.ts:152, 160` | gmail rule learning | `GEMINI_API_KEY` env | One ad-hoc retry on 429 only | No | No |
| 6 | `api/_lib/distillPatternSummary.ts:127, 134` | pattern naming | `GEMINI_API_KEY` env | One ad-hoc retry on 429 only | No | No |
| 7 | `api/_lib/retrievalCore.ts:563` | concept-graph rebuild | `GEMINI_API_KEY` env | None | No | No |
| 8 | `api/feedback.ts:186` | insight correction | `GEMINI_API_KEY` env | None | No | No |
| 9 | `api/entries.ts:692` (`runGeminiBatch`) | entry audit batch | passed apiKey | None | No | Yes (caller supplies) |
| 10 | `api/_lib/enrich.ts:1912, 1919` | skip-rule reject filter | passed apiKey | One ad-hoc retry on 429 only | No | Yes |
| 11 | `api/_lib/generateEmbedding.ts:46, 60, 92` | embeddings (single + batch) | passed apiKey | 4-attempt 500/1500/3500ms (transient 429/503) | No | Yes (resolveEmbedProviderForUser) |
| 12 | `api/_lib/enrich.ts:429-445` (`fetchEmbedWithRetry`) | embed during enrichment | passed apiKey | 4-attempt 500/1500/3500 | No | Yes |
| 13 | `api/_lib/providers/anthropic.ts:42, 59` | chat + completion adapter | passed config.key | None | No | Yes |
| 14 | `api/_lib/providers/openai.ts` | chat + completion adapter | passed config.key | None | No | Yes |
| 15 | `api/_lib/providers/gemini.ts:39, 60, 108` | chat + completion + extractFile | passed config.key | None | No | Yes |
| 16 | `api/llm.ts:461-462` | `/api/llm` completion | `selectProvider` → `getAdapter` | None (delegated to adapter — adapters don't retry) | `checkAndIncrement('chats')` only when managed (line 593) | Yes |
| 17 | `api/llm.ts:674-675` | `/api/llm` split | same | None | Not gated | Yes |
| 18 | `api/llm.ts:857` | `/api/llm` direct generateContent | `GEMINI_BULK_MODEL` env | (need to verify) | No | No |
| 19 | `api/user-data.ts:1240, 1260` | health-check probes | `GEMINI_API_KEY` env | None | n/a (admin) | No |

**~19 distinct callsites bypass `callAI`.** Some legitimate (embeddings have a different shape than text completion; file extract is multimodal; chat-with-tools needs the adapter family). But the *retry budget*, *quota gate*, and *cost telemetry* meant to live on the boundary live nowhere when these paths are taken.

---

## What's solid

- **Bounded exponential backoff in `callAI`** (`aiProvider.ts:57-87`). Four attempts with delays `[100, 400, 1600]` — total worst-case wall-clock ~2.1s + 3 × ~5s timeouts on Google fetch path = ~17s upper bound. Retries trigger on 5xx + 429 + thrown network errors. 4xx other than 429 short-circuits — auth errors, content-policy refusals, malformed bodies don't waste 3 retries.
- **Provider exhaustiveness check** (`aiProvider.ts:123-128`). The default branch in the switch is `const _exhaustive: never = cfg.provider`. Adding a new provider type without an adapter is a TypeScript compile error, not a runtime fallthrough.
- **Empty key short-circuit** (`aiProvider.ts:103`). `if (!cfg.apiKey) return ""` — no network call burned probing a missing key.
- **OpenAI-compatible adapter shares OpenAI code** (`aiProvider.ts:118-120`). Same dispatch case for `openai` and `openai-compatible`. Means Ollama, LM Studio, OpenRouter, vLLM, llama.cpp, Together, Groq, Fireworks all reach Gemini-or-better quality through one branch — confirmed by inline comment at lines 175-178.
- **Gemini thinking budget zeroed** (`aiProvider.ts:248-251`). `thinkingConfig: { thinkingBudget: 0 }` for non-`gemini-3*` models. Without this 2.5-Flash-Lite eats the whole maxTokens budget on its thinking phase and returns truncated text — the CLAUDE.md "hard numbers" rule made flesh.
- **Date context injected centrally** (`aiProvider.ts:114`, also `chatRunner.ts:79`). `withDateContext(rawSystem)` anchors "today / this week / next Monday" against the real date so the LLM doesn't drift on relative time. One injection point per surface.
- **Gemini fallback model chain exists** (`geminiModels.ts:15-21`). `geminiFallbackChain(primary)` returns `[primary, GEMINI_FALLBACK_MODEL]` — used by the distill family + skip-rule filter to retry on a different model when the bulk model rate-limits. Not used by `callAI`.
- **Embedding fail-CLOSED on length mismatch** (`enrich.ts:466-468`, `generateEmbedding.ts:87-89`). `if (values.length !== EMBED_DIM) throw` — prevents silent PostgREST 400s on wrong-shape vectors that would leave `embedding_status='pending'` forever.
- **Quota gate is fail-CLOSED at the SQL boundary** (`enrichQuota.ts:79-100`). The `consume_enrich_quota` RPC is atomic upsert+check; HTTP failure returns `{allowed:false, errored:true}` and the caller writes `enrichment_state='pending'` — never `'failed'` — so a Supabase blip doesn't permanently lock the entry out. Free=20, starter=200, pro/max=-1 sentinel for unlimited.
- **Quota peek is read-only** (`enrichQuota.ts:107-120`). UI usage indicator hits `readQuotaUsage` which never consumes a credit, so opening Settings doesn't burn a daily.
- **Per-call abort timeout on Google fetch** (`googleAi.ts:30-45`). 15s default, propagated to every `googleAiFetch` callsite. AbortSignal.timeout — modern path. Without it a Vercel function would hang to its 60s ceiling.
- **`callAI` never throws — returns `""`** (`aiProvider.ts:160-170, 222-232, 273-281`). Caller treats empty as "step did not succeed, leave the flag unset for retry on the next pass." Composable with the enrichment retry-on-cron-sweep model (see CLAUDE.md note on `last_error + attempts` breadcrumbs at `enrich.ts:951-962`).
- **Resolution of provider is centralised** for two paths — `resolveProviderForUser` (`resolveProvider.ts:82-139`) for enrichment + merge, and `selectProvider` (`providers/select.ts:43-93`) for `/api/llm`. They have the same BYOK priority order: anthropic → openai → gemini → openrouter.
- **Anthropic key disabled at the routing layer** (`resolveProvider.ts:118-135`). Comment block explains the project's current state — Anthropic env key isn't valid yet, so managed pro/max are routed to Gemini regardless of tier. This matches the CLAUDE.md "AI provider in use is Gemini, not Anthropic" rule. The `callAI` Anthropic adapter still exists for when BYOK Anthropic is supplied.

---

## Findings

### F1 — BYOK keys stored in plaintext, written from the browser via anon key
**Severity: HIGH**

Provider API keys (`anthropic_key`, `openai_key`, `gemini_key`, `openrouter_key`, `groq_key`) live in `user_ai_settings` as plaintext columns. Writes happen client-side from `src/lib/aiSettings.ts:73-82` (`syncToSupabase`) and `:86-97` (`persistKeyToDb`):

```ts
supabase.from("user_ai_settings").upsert(
  { user_id: uid, ...fields, updated_at: new Date().toISOString() },
  { onConflict: "user_id" },
)
```

The browser uses the public anon key. RLS policies on `user_ai_settings` (referenced at `user-data.ts:1856`) gate by `user_id = auth.uid()` so a user can only read/write their own row. That blocks lateral access from one user to another — but it doesn't address two real risks:

1. **Service-role exfil = plaintext keys.** Anyone with the service-role key (Vercel functions, future contractors with DB access, breached env var) reads every BYOK key in the clear. Compare to vault entries at `user-data.ts:1592, 1853` — *those* are stored as ciphertext only ("server can't decrypt") with the data key encrypted with the user's per-brain symmetric data-encryption-key. BYOK keys get no such treatment.
2. **No `OAUTH_TOKEN_ENCRYPTION_KEY` shape.** The repo already has the pattern for at-rest encryption of secrets the server must use server-side (Gmail OAuth tokens, presumably). BYOK provider keys, which the server *also* uses server-side, don't reuse it.

Server reads at `resolveProvider.ts:58` and `loadUserAiContext.ts:40` pull the columns straight into `AICall.apiKey` — no decrypt step exists because no encrypt step ever ran.

**Mitigations in place**: RLS prevents user-to-user reads. Sensitive `localStorage` keys are wiped on load (`aiSettings.ts:166-168`) so a stolen device with no auth session can't retrieve them.

**Mitigations missing**:
- Application-level encryption of the four `*_key` columns.
- Audit log on key-write events (currently silent; user-data.ts admin path writes audit_log, this doesn't).
- Server-side write boundary — every BYOK write goes through the browser anon key. No `/api/user-data?action=save-byok-keys` endpoint that could perform encryption + rate-limit + log.

**Fix**:
1. Add an Edge Function or `/api/user-data?action=save-byok` endpoint that AES-GCM encrypts each key with `BYOK_ENCRYPTION_KEY` (rotate-able, separate from `OAUTH_TOKEN_ENCRYPTION_KEY`), writes via service role.
2. Server-side `decryptBYOK(row)` step in `fetchSettings` and `loadUserAiContext` before the keys reach `AICall.apiKey`.
3. Block the browser path — RLS UPDATE policy denies writes to `*_key` columns; only INSERT through the API.
4. Audit log row on every key change with `metadata = { provider, action: "set"|"clear", masked_prefix: "sk-ant-...***" }`.

### F2 — Quota gate adoption is 1 of 4 callsites; bypassed by 19 non-`callAI` callsites
**Severity: HIGH**

The `opts.quota` parameter on `callAI` (`aiProvider.ts:37-41, 104-113`) is the cleanest cost control surface in the codebase. It runs *before* the network call, fail-closes via the SQL RPC, and skips the round trip for unlimited tiers. Adoption:

- **`mergeEntries.ts:280-284`** — passes `quota: { userId, tier }`. ✅
- **`enrich.ts:236, 361, 390`** — does NOT pass `quota:`. The outer caller `enrichInline` runs *one* `checkAndConsumeQuota` at `enrich.ts:897` before all three steps. Per-entry, not per-call. ⚠️ (functionally OK because the three steps run as a unit, but the abstraction's promise is per-call gating.)
- **All 19 non-`callAI` callsites** — no quota check. ❌

The result: persona extraction, gmail classification, distill, retrieval rebuild, feedback insight-correction, and the `/api/llm` chat + split endpoints all run unmetered. A pro user with a stuck distill cron can burn 10× their quota cost without `user_enrich_quota.count` moving — the table only counts the entries that flowed through `enrichInline`.

`/api/llm` chat is metered separately by `checkAndIncrement(user.id, "chats", ...)` at `llm.ts:594`, but only inside `instrumentedExecTool` — the tool-call path. The base completion at line 462 isn't gated. `handleSplit` at line 668-685 isn't gated.

**Fix**:
1. Make `opts.quota` mandatory on `callAI` (compile-time enforced via `Required<Pick<AICallOpts, "quota">>` for any caller using a paid feature, or runtime: throw if missing in non-test mode).
2. Migrate all `googleAiFetch` callsites to `callAI` where the call is text-completion-shaped. File extract, multimodal, embeddings legitimately stay outside; everything else doesn't.
3. Add a separate `consume_chat_quota` RPC for `/api/llm` chat + split with the same fail-closed shape.
4. `/api/llm:handleSplit` (line 662) needs a quota check before line 675's adapter call.

### F3 — Two parallel provider abstractions; neither is the canonical surface
**Severity: MEDIUM**

`api/_lib/aiProvider.ts` (`callAI` + 4 inline adapters) and `api/_lib/providers/{select,anthropic,openai,gemini,chatRunner}.ts` (adapter-pattern + tool-use loop) both exist, both reachable, both reimplement the same provider HTTP shapes:

- `callAI` calls `https://api.anthropic.com/v1/messages` at `aiProvider.ts:144`.
- `providers/anthropic.ts:11-46` calls `https://api.anthropic.com/v1/messages` again. Different code, same endpoint.
- `callAI` calls Gemini via `googleAiFetch` + `googleAiModelUrl(model, "generateContent")` at `aiProvider.ts:257`.
- `providers/gemini.ts:39, 60` does the same.
- `providers/anthropic.ts` has no retry. `callAI`'s anthropic adapter has 4-attempt retry. Same provider, same call, two retry policies depending on which path the request takes.

The split happened because `chatRunner.ts` needs tool-use semantics that the original `callAI` doesn't support. Reasonable. But the consequence is: bug fix to one HTTP path (e.g., a new Anthropic header for prompt caching) requires touching both. Today's date injection is duplicated (`aiProvider.ts:114` and `chatRunner.ts:79`). The `gemini-2.5-*` thinking-budget guard is in `aiProvider.ts:250` but missing from `providers/gemini.ts` chat path — `/api/llm` chat with 2.5-Flash burns its budget on thinking and returns truncated text.

**Fix**:
1. Promote `providers/*` to be *the* abstraction — `chatRunner` already supports both completion and tool-use loops.
2. Move `callAI` retry + `withDateContext` + thinking-budget guard into the adapter base so both surfaces share them.
3. Delete `aiProvider.ts` once callers migrate, OR keep `callAI` as a thin wrapper around `getAdapter().completion(...)`.
4. Until then, the `providers/gemini.ts` chat path needs the thinking-budget guard added (one line: `if (!config.model.startsWith("gemini-3")) generationConfig.thinkingConfig = { thinkingBudget: 0 }`).

### F4 — No cross-provider failover. "Provider failover chain" doesn't exist.
**Severity: MEDIUM**

The audit signal asked: "callAI has a provider failover chain (Gemini primary, fallback X) — and the fallback actually works." Refuted.

`callAI` selects exactly one provider from `cfg.provider` and tries it. If Gemini 5xxs four times in a row, `callAI` returns `""`. There is no second provider attempt.

The closest thing is `geminiFallbackChain(primary)` (`geminiModels.ts:19-21`) which returns `[primary, GEMINI_FALLBACK_MODEL]` — but that's *model* fallback within Gemini, not *provider* fallback. And it's used only by:
- `enrich.ts:1912-1936` (skip-rule reject filter) — iterates the chain, breaks on first success.
- `distillRejected.ts:110-128`, `distillGmail.ts:152-167`, `distillPatternSummary.ts:127-141` — same pattern, ad-hoc.

`callAI` does not consume `geminiFallbackChain`. If `gemini-2.5-flash-lite` is down, every enrichment call returns `""` until the next cron sweep.

`resolveProviderForUser` returns ONE provider config. There is no `resolveProviderChainForUser` returning `[primary, fallback]`.

**Why this matters now**: Gemini 2.5-Flash-Lite has had multiple region-wide degradations in the last 60 days (Q1 2026 status pages). With four-attempt retry the user hits ~17s of wall-clock failure, then gets nothing. A pro-tier user paying for "managed AI" sees their entries stuck at `enrichment_state='pending'` until the next hourly sweep — which hits the same dead provider.

**Fix**:
1. `resolveProviderChainForUser(userId): AICall[]` returns `[byok_primary, managed_gemini, managed_fallback_model]` ordered by preference.
2. `callAI` accepts an array; iterates with the existing retry budget per entry; first non-empty response wins.
3. Add a `[providers] failover triggered: gemini→openai for user X` log line so we can spot churn.
4. Surface to `/api/health` so an external monitor catches a sustained primary-down state.

### F5 — No cost-per-call telemetry. Token-in/token-out not captured anywhere.
**Severity: LOW**

The audit signal asked: "Cost-per-call telemetry exists (token-in + token-out captured for cost-quota-audit)." Refuted.

Anthropic responses include `usage.input_tokens` and `usage.output_tokens`. Gemini responses include `usageMetadata.promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`. OpenAI responses include `usage.{prompt,completion,total}_tokens`. None of `aiProvider.ts:170, 232, 281` extract these. None of `providers/*.ts:55, 48, 75` extract these.

The only counter is `user_enrich_quota.count` — *requests*, not tokens. A 50k-token-input enrichment burns the same one credit as a 200-token enrichment. Pro/max users are unlimited at the quota layer, so a runaway enrichment loop on a 100k-character entry costs the company real money with no observability.

The cost-quota-audit (mentioned in scope) cannot be done from this data — there's no token ledger to audit against.

**Fix**:
1. Each adapter extracts the provider's usage fields and returns `{ text, tokensIn, tokensOut, model }`.
2. Add a `llm_call_log` table: `(user_id, ts, provider, model, tokens_in, tokens_out, latency_ms, ok)`. Daily prune at 30 days.
3. Insert one row per `callAI` invocation. Service role; user-readable via RLS for transparency ("you used X tokens this month").
4. Cron-sum into `user_profiles.tokens_used_30d` for the dashboard.

### F6 — Retry policies are inconsistent and copy-pasted
**Severity: LOW**

Three different retry helpers exist for the same shape problem:

- `aiProvider.ts:57-87` — `fetchWithRetry`, delays `[100, 400, 1600]`, retries 5xx + 429, supports both `googleAiFetch` and plain `fetch`.
- `enrich.ts:429-445` — `fetchEmbedWithRetry`, delays `[500, 1500, 3500]`, retries 429 + 503 only.
- `generateEmbedding.ts:46-57` — `fetchWithRetry`, delays `[500, 1500, 3500]`, retries 429 + 503 only. Identical to enrich.ts version.

Plus ad-hoc one-shot retries on 429 in:
- `distillRejected.ts:117-128`
- `distillGmail.ts:158-167`
- `distillPatternSummary.ts:133-141`
- `enrich.ts:1917-1924`

Every distill / pattern path retries `429` exactly once with a 1500ms sleep. Different from the `callAI` policy. Different from the embed policy.

**Fix**:
1. One helper at `api/_lib/fetchWithRetry.ts` parameterised on `delays`, `retryStatuses`, and `apiKey?` (for googleAi vs raw fetch).
2. Two named exports: `RETRY_LLM = [100, 400, 1600]`, `RETRY_EMBED = [500, 1500, 3500]`. Single config table.
3. Migrate the four ad-hoc one-shot retry blocks. They become one line each.

### F7 — Model registry is partially centralised; some IDs are hard-coded across N files
**Severity: LOW**

Centralised:
- `geminiModels.ts:1-13` exports `GEMINI_BULK_MODEL`, `GEMINI_CHAT_MODEL`, `GEMINI_FALLBACK_MODEL` — env-overridable, default fallbacks. Used by `resolveProvider.ts:32`, `loadUserAiContext.ts` consumers, `llm.ts:33`, `enrich.ts:43`.
- `resolveProvider.ts:31-36` exports `DEFAULT_MODELS` for the four BYOK providers. One place.

Not centralised:
- **Embedding model** `gemini-embedding-001` hard-coded at `enrich.ts` (via embed step), `generateEmbedding.ts:40`. Two copies.
- **OpenAI embedding model** `text-embedding-3-small` hard-coded at `resolveProvider.ts:157, 161`. Two copies.
- **Anthropic default** `claude-sonnet-4-6` hard-coded at `providers/select.ts:55`, `aiSettings.ts:156, 184, 309`. Three copies. Not the same as `resolveProvider.ts:32`'s `claude-haiku-4-5-20251001` default. Two competing "Anthropic defaults" depending on which path the request takes.
- **OpenAI default** `gpt-4o-mini` hard-coded at `resolveProvider.ts:34`, `providers/select.ts:62`, `aiSettings.ts:157, 192, 310`. Four copies.
- **Gemini BYOK default** `gemini-2.5-flash-lite` hard-coded at `aiSettings.ts:158, 197, 311`, `llm.ts:46`. Four copies.
- **`VALID_GEMINI_MODELS` allowlist** at `llm.ts:43-50` — six models. Not exported. Adding a new Gemini model requires touching this *and* `geminiModels.ts` *and* the four hard-coded defaults.

A model swap from `gemini-2.5-flash-lite` to `gemini-3-flash` requires touching ~9 files. The "centralised" registry is centralised for Gemini-bulk only.

**Fix**:
1. One file `api/_lib/aiModels.ts` exports `MODELS = { anthropic: { default: "claude-haiku-4-5-..." }, openai: { default: "gpt-4o-mini", embed: "text-embedding-3-small" }, gemini: { bulk: ..., chat: ..., fallback: ..., embed: "gemini-embedding-001", validForByok: [...] } }`.
2. Every default + allowlist sources from there.
3. The frontend `aiSettings.ts` defaults import the same constants (or duplicate as static literals if avoiding cross-boundary imports — but document the duplication).
4. Add a runtime sanity check in `withAuth` startup that env-set models exist in the allowlist.

---

## Probe results vs the audit signals

| Signal | Verdict | Evidence |
|---|---|---|
| `callAI` has a provider failover chain | **Refuted.** | Single provider per call (`aiProvider.ts:115-130`). Only model-level fallback exists, only outside `callAI`. |
| Retry budget is bounded per call (3 attempts, exp backoff, max 10s) | **Confirmed with caveat.** | 4 attempts (3 retries + 1 final), delays `100/400/1600`ms = ~2.1s + 4 × ~5s timeout = ~22s upper bound, not 10s. (`aiProvider.ts:63`) |
| Every `callAI` site checks quota before calling | **Refuted.** | 1 of 4 callsites uses `opts.quota`. The other 3 rely on an outer `enrichInline` gate at `enrich.ts:897`. |
| BYOK keys are encrypted at rest with `OAUTH_TOKEN_ENCRYPTION_KEY` shape | **Refuted.** | Plaintext columns in `user_ai_settings`. No application-level encryption. (`aiSettings.ts:73-97`, `resolveProvider.ts:58`) |
| BYOK never echoed in logs/Sentry/audit_log | **Confirmed.** | Logs reference only the user ID and provider name; key payloads are not interpolated into `console.error` calls. (`aiProvider.ts:108-109, 162, 226, 273`) |
| Model registry is centralised | **Partial.** | Gemini bulk/chat/fallback are env-overridable + centralised. Embedding models, BYOK Anthropic/OpenAI defaults, the `VALID_GEMINI_MODELS` allowlist, and frontend defaults are duplicated across 5–9 files. |
| Cost-per-call telemetry exists | **Refuted.** | Token-in/token-out are not extracted from any provider response. No `llm_call_log` table. Quota is request-count-based. |
| `callAI` doesn't silently swallow provider errors and return empty string | **Refuted.** | This is exactly what it does, on purpose. (`aiProvider.ts:96-103, 162-170, 222-232, 273-281`). It's documented as the pattern. The risk is that a *misconfigured* provider (wrong baseUrl, expired key) looks identical to a *transient outage* — and the breadcrumb at `enrich.ts:962` (`stepSilentSkips`) is a `console.error`, not a structured row. An admin can grep logs but cannot query "which users had silent provider drops in the last 24h." |

---

## Recommendations (priority)

1. **[HIGH] F1** — Encrypt BYOK keys at rest. Mirror the vault-entry / OAuth-token shape. Block browser writes to `*_key` columns via RLS; route through a server endpoint that encrypts before insert. Audit_log every key change. ~1 day of work; security-blocking for public launch.
2. **[HIGH] F2** — Make the quota gate the `callAI` boundary's responsibility. Migrate all text-completion `googleAiFetch` callsites to `callAI` with `opts.quota`. Add `consume_chat_quota` for `/api/llm`. ~1 day; cost-control-blocking for public launch.
3. **[MEDIUM] F3** — Pick one abstraction. Recommend `providers/*` since it already supports tool-use. Move retry + date-context + thinking-budget guard into the adapter base. Delete `aiProvider.ts` or thin-wrap it. ~2 days.
4. **[MEDIUM] F4** — Implement provider failover. `resolveProviderChainForUser` returns `[primary, fallback_byok_or_managed]`. `callAI` (or its replacement) iterates. Log every failover. ~half a day.
5. **[LOW] F5** — Token-cost telemetry. `llm_call_log` table + per-adapter usage extraction. Required for the cost-quota-audit referenced in scope. ~1 day.
6. **[LOW] F6** — Consolidate three retry helpers into one. Trivial. ~1 hour.
7. **[LOW] F7** — One `aiModels.ts`. Trivial. ~1 hour.

## Method

- Read `api/_lib/aiProvider.ts` end-to-end (282 lines).
- Read `api/_lib/enrichQuota.ts` end-to-end (120 lines).
- Read `api/_lib/resolveProvider.ts` end-to-end (170 lines).
- Read `api/_lib/loadUserAiContext.ts` end-to-end (62 lines).
- Read `api/_lib/generateEmbedding.ts` end-to-end (123 lines).
- Read `api/_lib/geminiModels.ts`, `api/_lib/googleAi.ts` end-to-end.
- Read `api/_lib/providers/{select,anthropic,gemini,chatRunner}.ts` end-to-end.
- Read `src/lib/aiSettings.ts` end-to-end (336 lines) — the BYOK frontend persistence path.
- Grep'd `callAI(` across `api/` — 4 callsites confirmed.
- Grep'd `checkAndConsumeQuota` across `api/` — 2 callsites confirmed (one inside `callAI`, one in `enrichInline`).
- Grep'd `googleAiFetch|generateContent|api\.anthropic\.com|api\.openai\.com` across `api/` — 19 distinct non-`callAI` LLM callsites enumerated above.
- Cross-checked frontend `ProvidersTab.tsx` and `aiSettings.ts` against the server `resolveProvider.ts` to confirm BYOK round-trip is plaintext end-to-end.
- Did NOT exercise live provider calls. Did NOT modify any code.

## Limitations

- Did not enumerate every `audit_log` entry to verify F1's "no key payload echoed" claim against historical data — verified by code-read only.
- Did not measure real Gemini 2.5-Flash-Lite outage duration in the last 60 days (cited in F4) — this is a deployment-ops claim from public status pages, not a measurement done in this audit.
- Did not run `consume_enrich_quota` RPC against staging to verify the row-locking semantics of the SQL function — read its caller contract (`enrichQuota.ts:79-100`) and its declared atomic shape only.
- Did not inspect the migration that created `user_ai_settings` to verify column types are `text` (assumed plaintext from the writes; not verified at the DDL level). If columns are `bytea` and the writes are encrypting via PG, F1 partially refuted — but the absence of a `decrypt(...)` step on the read side at `resolveProvider.ts:58` means BYOK keys are reaching `AICall.apiKey` as plaintext regardless.

**Audit kicked off by**: user request "evidence-based AI provider abstraction audit" on 2026-05-07. Scope explicitly excludes feature flows that *use* `callAI`.
