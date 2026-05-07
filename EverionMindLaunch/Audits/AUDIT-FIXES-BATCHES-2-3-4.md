# Audit Fixes — Consolidated Triage (Batches 2 + 3 + 4)

> Single-source TODO across 28 audits run on 2026-05-07 (batch-2 = 6, batch-3 = 12, batch-4 = 10). 233 findings de-duplicated and re-ordered by **ideal tackle sequence** — earlier phases unblock later phases; within a phase items batch by file/system so one PR can close several lines at once.
>
> **Replaces** `AUDIT-ROLLUP-2026-05-07-batch-2.md`, `-batch-3.md`, `-batch-4.md` for active triage. Rollup files preserved in repo for audit-trail; do not edit them once findings flow into this file.
>
> **Status legend:** `[ ]` open · `[x]` done · `[~]` in progress · `[-]` deferred (post-launch).
> **Source link:** `{audit}` → `EML/Audits/{audit}-audit-2026-05-07.md`.

---

## Verification pass — 2026-05-07

Spot-checked 17 cited findings across the three batches by reading the actual code:

| # | Claim | File:line cited | Match? |
|---|---|---|---|
| 1 | mcp-server F3 — `resolveApiKey` brains lookup omits `is_personal=eq.true` | `api/_lib/resolveApiKey.ts:28` | ✅ confirmed verbatim |
| 2 | mcp-server F2 — `mcpTokenSecret()` falls back to service-role key | `api/mcp.ts:40-42` | ✅ confirmed |
| 3 | mcp-server F1 — `${plan}` instead of `${tier}` in quota-exceeded msg | `api/mcp.ts:897` | ✅ confirmed |
| 4 | security F1 — CSP allows unused LLM CDN connect-src targets | `vercel.json:81` | ✅ confirmed |
| 5 | capture F1 — idempotency-replay returns w/o `audit_log` | `api/capture.ts:127-130` | ✅ confirmed |
| 6 | admin-tab F1 — `handleTriggerTestPush` gates on email equality | `api/user-data.ts:2118-2119` | ✅ confirmed |
| 7 | cron F1 — hourly cron is plain `for-of` (serial) | `api/user-data.ts:2334` | ✅ confirmed |
| 8 | pwa F2 — `beforeunload` listener kills BFCache | `src/hooks/useDataLayer.ts:342` | ✅ confirmed |
| 9 | landing F1 — canonical mismatch | `index.html:30` (`everionmind.com`) vs `Landing.tsx:623` (`everion.smashburgerbar.co.za`) | ✅ both confirmed |
| 10 | landing F2 — hero CTA → `onAuth("login")` | `src/views/LandingHero.tsx:145` | ✅ confirmed |
| 11 | landing F3 — JSON-LD says Pro `$6` + 14-day trial | `index.html:94-96` | ✅ confirmed |
| 12 | login-signup F1 — five inputs `fontSize: 15` | `LoginScreen.tsx:517, 565` + `ResetPasswordView.tsx:117` | ✅ all three confirmed |
| 13 | login-signup F2 — no `resetPasswordForEmail` call in `src/` | grep | ✅ zero matches |
| 14 | chat-view F1 — `useChat.ts` has no `res.ok` check; falls to `"No response."` | `src/hooks/useChat.ts:99-130` (`data.reply ?? "No response."` at 122) | ✅ confirmed verbatim |
| 15 | email F1 — `_dmarc.smashburgerbar.co.za` NXDOMAIN | `nslookup` | ✅ "Non-existent domain" |
| 16 | rate-limiter mechanism — fail-closed, circuit-breaker, in-memory dev fallback | `api/_lib/rateLimit.ts:11-58` | ✅ matches audit narrative |
| 17 | todo-view F2 — `TodoRowItem.tsx:65-79` toggleDone race | path nit: file is `src/views/TodoRowItem.tsx` not `src/components/...` | ⚠️ file exists, location off by one folder; content not re-checked |

**Verdict:** 16/17 cited verbatim, 1/17 path off by one folder (content claim still presumed valid). No fabricated findings, no overstated severity, no invented file references. Treat all 233 findings as actionable. Path nit (#17) flagged inline below.

---

## Cumulative finding totals (de-dup'd)

| Severity | Count |
|---:|---:|
| HIGH | 50 |
| MEDIUM | 78 |
| LOW | 102 |
| INFO | 3 |
| **Total** | **233** |

Cross-batch carries (one finding cited from multiple audits) are listed once below with all sources.

---

## Phase 0 — Fix today · one-liners, no deps · ~90 minutes

Knock out first. Each is < 10 lines of code or a single config write.

| # | Sev | Fix | Where | Sources |
|---|---|---|---|---|
| 0.1 | HIGH | [ ] Webhook idempotency — move `markWebhookEventSeen` AFTER `writePlanChange` succeeds. Today: failed write → retry sees `firstTime:false` → 200 → tier never lands; user pays, shows free | `api/user-data.ts` LS + RC handlers | webhook F3 |
| 0.2 | HIGH | [ ] `_getIp` — return leftmost `x-forwarded-for` entry, not Vercel edge IP. Carried since 2026-05-06 | `api/_lib/rateLimit.ts` | rate-limiter F1 |
| 0.3 | HIGH | [ ] `resolveApiKey` brains lookup — append `&is_personal=eq.true`. Mirrors `personalBrain.ts:30-31` and `gmailScan.ts:1057`. Today MCP writes without explicit `brain_id` land in arbitrary brain (tenant-leak via configuration) | `api/_lib/resolveApiKey.ts:28-31` | mcp-server F3 |
| 0.4 | HIGH | [ ] `api/mcp.ts:897` — replace `${plan}` with `${tier}`. Today quota-exceeded path throws `ReferenceError`, surfaces as generic `-32603` | `api/mcp.ts:897` | mcp-server F1 |
| 0.5 | HIGH | [ ] `handleTriggerTestPush` — replace `process.env.ADMIN_EMAIL ?? VITE_ADMIN_EMAIL` equality with `await isAdminUser(user.id)`. `VITE_*` fallback risks leaking admin email into prod JS bundle | `api/user-data.ts:2118-2121` | admin-tab F1 |
| 0.6 | HIGH | [ ] `useDataLayer.ts:342` — swap `beforeunload` for `pagehide`. `beforeunload` kills BFCache on iOS Safari (back-button = full reload, not instant restore) | `src/hooks/useDataLayer.ts:342` | pwa F2 |
| 0.7 | HIGH | [ ] `useChat.ts:99-130` — add `if (!res.ok) { surface 429-with-upgrade-link, else generic error }`. Today 429 monthly-limit response renders literal `"No response."` | `src/hooks/useChat.ts:99-130` | chat-view F1 |
| 0.8 | HIGH | [ ] Recovery-key dismiss — add `<input type="checkbox">` "I've saved my recovery key" gate before `dismissRecoveryKey` button enables. One-click dismiss = recovery gone forever on mis-tap | `src/views/VaultUnlocked.tsx` (dismiss handler) | vault-view F1 |
| 0.9 | HIGH | [ ] DMARC TXT record at registrar — `_dmarc.smashburgerbar.co.za` → `v=DMARC1; p=none; rua=mailto:postmaster@smashburgerbar.co.za`. Currently NXDOMAIN; Gmail/Yahoo bulk-sender violation | DNS only (registrar) | email F1 |
| 0.10 | HIGH | [ ] Five login/reset inputs `fontSize: 15 → 16`. iOS Safari auto-zooms <16 px on focus | `LoginScreen.tsx:517, 565, 808` + `ResetPasswordView.tsx:117 ×2` | login-signup F1 |
| 0.11 | HIGH | [ ] Hero CTA — `LandingHero.tsx:145` change `onClick={() => onAuth("login")}` to `onAuth("signup")`. Above-fold dominant button on cold-traffic landing | `src/views/LandingHero.tsx:145` | landing F2 |
| 0.12 | HIGH | [ ] Canonical mismatch — pick one. Custom domain (`https://everion.smashburgerbar.co.za`) is the SEO truth (per CLAUDE.md). Update `index.html:30` to match `Landing.tsx:623` | `index.html:30` | landing F1 |
| 0.13 | HIGH | [ ] Landing pricing JSON-LD — realign to live tiers. `index.html:91-98` says Pro $6 + 14-day trial; live page + BillingTab + ChatView say $9.99, no trial. AI Overviews + Perplexity will cite wrong number | `index.html:91-98` | landing F3 |
| 0.14 | HIGH | [ ] `bumpDueDate` (todo swipe-left "+1d") — write both `due_date` AND `scheduled_for`. Today writes `due_date` only; `getPlacements` reads `scheduled_for` first → swiped entry ghosts on original day AND appears on day+1 | `src/views/TodoView.tsx` (bumpDueDate handler) | todo-view F5 |
| 0.15 | HIGH | [ ] `OnboardingModal.handleSave` — wrap fetch with `r.ok` check + abort timeout + error toast. Today no error surface; failure marks user `onboarded()` and silently loses first capture | `src/components/OnboardingModal.tsx:72-95` | onboarding F2/F4 |
| 0.16 | HIGH | [ ] `OnboardingModal.handleSave` — call `trackFirstCapture` + `trackCaptureMethod` after success. Today the cleanest activation path is invisible to PostHog | same handler | onboarding F1 |

---

## Phase 1 — Pre-launch HIGH blockers · grouped by area

### 1A — Auth + identity (~1.5 h)

| # | Sev | Fix | Where | Sources |
|---|---|---|---|---|
| 1A.1 | HIGH | [ ] No "Forgot password?" link. `App.tsx:180` mounts `ResetPasswordView` only on hash-recovery tokens; **zero** `supabase.auth.resetPasswordForEmail()` call sites in `src/`. Add Forgot link to LoginScreen | `src/LoginScreen.tsx` (new link) + new handler | login-signup F2 |

### 1B — Money + tiers (~3 h)

| # | Sev | Fix | Where | Sources |
|---|---|---|---|---|
| 1B.1 | HIGH | [ ] BYOK keys (`anthropic_key`, `openai_key`, `gemini_key`, `openrouter_key`) stored plaintext in `user_ai_settings`, written from browser via anon key. Encrypt with `OAUTH_TOKEN_ENCRYPTION_KEY` envelope. Match vault entry handling | `api/user-data.ts` settings handler + `user_ai_settings` schema | ai-provider F1 |
| 1B.2 | HIGH | [ ] `callAI` quota gate (`opts.quota`) used by 1 of 4 callsites. 19 non-`callAI` LLM callsites (persona extraction, gmail classifier, distill family, retrieval rebuild, feedback, `/api/llm` chat + split) run unmetered → pro/max users uncapped | many call sites | ai-provider F2 |
| 1B.3 | HIGH | [ ] `webhookIdempotency.ts` — fail CLOSED on Upstash outage (mirror `rateLimit.ts`). Today fails OPEN → duplicate side-effects on every retry during outage | `api/_lib/webhookIdempotency.ts` | webhook F2 |
| 1B.4 | HIGH | [ ] Doc drift — billing-audit F5 references `webhook_events` Postgres table that doesn't exist. Idempotency is Upstash Redis only with 24h TTL. Bump to 7d retention; correct the audit doc | `api/_lib/webhookIdempotency.ts` + audit doc | webhook F1 |
| 1B.5 | HIGH | [ ] LemonSqueezy + RevenueCat webhook receivers — add `rateLimit({ id:'webhook:lemon' / 'webhook:rc' })`. Defence-in-depth even with signature verify + idempotency | `api/user-data.ts` (LS + RC handlers) | rate-limiter F3, webhook F5 |
| 1B.6 | HIGH | [ ] `api/mcp.ts` rate-limit key — suffix with `mcp:<api_key_id>` for API-key requests, `user:<userId>` for JWT. Today same IP collides MCP traffic with browser JWT | `api/mcp.ts` | rate-limiter F2 |

### 1C — Vault + crypto (~2 h)

| # | Sev | Fix | Where | Sources |
|---|---|---|---|---|
| 1C.1 | HIGH | [ ] Recovery-key UX is clipboard-copy only. Add print + `.txt` download. Data shown ONCE — clipboard alone forces screenshot or paste-into-notes (both bad) | `src/views/VaultUnlocked.tsx` recovery panel | vault-view F2 |
| 1C.2 | HIGH | [ ] Vault reveal accepts session-cached `cryptoKey` only. No fresh PIN, no biometric step-up, no `audit_log` row when secret revealed. Phone-left-unlocked = every secret one tap away with zero forensics. Fresh-PIN gate on >5 min stale reveals + new `POST /api/audit/vault-reveal` | `src/views/DetailModal.tsx` (reveal handler) | detail-modal F2 |
| 1C.3 | HIGH | [ ] `mcpTokenSecret()` — drop `SUPABASE_SERVICE_ROLE_KEY` fallback. Require `MCP_ACCESS_TOKEN_SECRET` set; fail closed at boot if absent. Same anti-pattern as `oauthState.ts` F13 | `api/mcp.ts:40-42` | mcp-server F2 |

### 1D — Resilience + timeouts (~3.5 h, biggest mechanical lift)

| # | Sev | Fix | Where | Sources |
|---|---|---|---|---|
| 1D.1 | HIGH | [ ] Wrap ~95 Supabase REST fetches with `AbortSignal.timeout(8_000)`. Helper: extend `sbHeaders.ts` with default `signal`. Today one PostgREST hang freezes function for 300 s | `api/**/*.ts` (~95 sites) | resilience F1 |
| 1D.2 | HIGH | [ ] Wrap 14 third-party fetches with `AbortSignal.timeout(...)`: LS, RC, Resend, Anthropic, Google OAuth, Microsoft OAuth, Whisper, Groq, Upstash health probes | various | resilience F2 |
| 1D.3 | HIGH | [ ] `/api/health` — `Promise.allSettled` per probe with `AbortSignal.timeout(2_000)` per probe. Add `Retry-After: 30` on 503. Today serial probes time out external monitors before endpoint responds | `api/v1.ts` health handler | resilience F4 |
| 1D.4 | HIGH | [ ] Zero `AbortController` on every Gmail-API `fetch()` in `gmailScan.ts` (token refresh, message list, history, threads, attachments). One stalled TCP eats one of three concurrent cron slots for 5 min. Compare `googleAiFetch` which DOES wrap with `AbortSignal.timeout(15_000)` | `api/_lib/gmailScan.ts` | gmail-sync F2 |

### 1E — Capture surface (~2 h)

| # | Sev | Fix | Where | Sources |
|---|---|---|---|---|
| 1E.1 | HIGH | [ ] `IMAGE_MAX_BYTES = 5 MB` cap exists ONLY for images. Doc/PDF/xlsx via `extractTextFromFile` has zero size guard. 50 MB PDF buffers in `arrayBuffer()` + pdfjs internal copy → low-RAM Android OOMs silently | `src/hooks/useCaptureSheetParse.ts:619-622` | capture-sheet F1 |
| 1E.2 | HIGH | [ ] `accept` attribute is a hint. No magic-bytes sniffing; `stripHtml` regex is the only HTML defence. Add `file-type` magic-bytes sniff + reject mismatched MIME. Prompt-injection content currently rides into Gemini classifier | `src/hooks/useCaptureSheetParse.ts` | capture-sheet F2 |
| 1E.3 | HIGH | [ ] `audit_log` skipped on idempotency-replay branch (`capture.ts:127-130`) AND dedup-merge branch (`:268-271`). Same pattern at `v1.ts:368-370` and `mcp.ts:903-910`. Retried successful captures land zero audit rows | four sites | capture-pipeline F1 |
| 1E.4 | HIGH | [ ] Sibling entry-creation doors (`v1.ts ingest`, `mcp.ts create_entry`, `llm.ts chat-tool create_entry`, `transfer.ts import`) write zero `audit_log`. Coverage 25 % of doors. Extract shared `writeCaptureAudit(user, entry, source, req_id)` helper | four files | capture-pipeline F2 |

### 1F — Retrieval cost + perf (~3 h)

| # | Sev | Fix | Where | Sources |
|---|---|---|---|---|
| 1F.1 | HIGH | [ ] Add embedding cache — dedupe by `sha256(query)` with 5-min TTL. Today every retrieval re-embeds via Gemini (~100 ms median + paid tokens) | `api/_lib/generateEmbedding.ts` (cache wrapper) | retrieval F1 |
| 1F.2 | HIGH | [ ] Drop the 4th PostgREST round-trip in `retrieveEntries` (metadata-hydrate). Add `metadata` column to keyword/tag selects (already returned by vector RPC) | `api/_lib/retrievalCore.ts` | retrieval F2 |
| 1F.3 | HIGH | [ ] Migration 086 — `CREATE EXTENSION pg_trgm; CREATE INDEX entries_content_trgm_idx ON entries USING gin (content gin_trgm_ops);`. Today keyword/tag expand uses `ILIKE '%kw%'` — full table scan past a few thousand entries | new migration | retrieval F3 |

### 1G — Onboarding silent loss (covered in Phase 0)

(Phase 0 items 0.15 + 0.16 close this category.)

### 1H — Cron concurrency (~1 h)

| # | Sev | Fix | Where | Sources |
|---|---|---|---|---|
| 1H.1 | HIGH | [ ] Hourly cron is fully serial — `for-of` at `user-data.ts:2334`. At 1000+ users the per-user multi-RTT loop + expiry fan-out blows 300 s `maxDuration`. Use `mapWithConcurrency` (already exists at `enrich.ts:1313-1335`) with `HOURLY_CONCURRENCY=8` | `api/user-data.ts:2334` | cron F1 |
| 1H.2 | HIGH | [ ] No cron failure alerting. No `if: failure()` step in GH Actions, no Sentry hook. Per `architecture/cron.md:144-149` the daily cron schedule trigger has never proven auto-fired since 2026-04-28 | `.github/workflows/cron-{daily,hourly}.yml` | cron F2 |

### 1I — Detail-modal stale data (~1 h)

| # | Sev | Fix | Where | Sources |
|---|---|---|---|---|
| 1I.1 | HIGH | [ ] `useState(entry.title)` only seeds on mount; no resync on prop change. Background poll updates `entry`, user types over stale base, hits Save → silent clobber of fresher fields. Read-side preview also frozen at mount-time content. Fix: `useEffect([entry, editing])` + inline conflict banner | `src/views/DetailModal.tsx` mount effect + :854 read | detail-modal F1 |

### 1J — Todo correctness (~3 h)

| # | Sev | Fix | Where | Sources |
|---|---|---|---|---|
| 1J.1 | HIGH | [ ] Every `toDateKey` / `new Date()` reads device-local TZ. No `user_profiles.timezone` column exists. Cross-device midnight straddles → todos on wrong day. `mondayKey` memo deps `[]` so "today" never refreshes in long-open tab. Pre-international-beta blocker | `src/views/TodoView.tsx` + new column + migration | todo-view F1 |
| 1J.2 | HIGH | [ ] `toggleDone` (`src/views/TodoRowItem.tsx:65-79` — note path) has no in-flight lock and no idempotency key. Double-tap during in-flight PATCH races; network reordering can land wrong final status. Easy on mobile | `src/views/TodoRowItem.tsx:65-79` | todo-view F2 |
| 1J.3 | HIGH | [ ] Recurrence has no `until` cap. Recurring entries never expire. `getActionPlacements` skips recurrence expansion → "every Monday" never shows on Today's view. Spec-decision needed for per-instance completion | `src/lib/placements.ts` | todo-view F4 |

### 1K — PWA + landing additional (covered in Phase 0)

| # | Sev | Fix | Where | Sources |
|---|---|---|---|---|
| 1K.1 | HIGH | [ ] PWA manifest mismatch — live `manifest.webmanifest` lacks maskable + apple-touch icons; `public/manifest.json` exists but is never loaded. Move maskable + apple-touch into `vite.config.js` PWA plugin and delete `public/manifest.json` | `vite.config.js` + `public/manifest.json` | pwa F1 |

### 1L — Email deliverability (~30 min, mostly DNS)

| # | Sev | Fix | Where | Sources |
|---|---|---|---|---|
| 1L.1 | HIGH | [ ] Supabase Dashboard → Auth → SMTP Settings → switch from default sender to Resend SMTP relay. Default sender `noreply@mail.app.supabase.co` rate-limits 4/hr/project + DMARC alignment fails | Supabase dashboard | email F2 |

### 1M — Security defence-in-depth (~30 min)

| # | Sev | Fix | Where | Sources |
|---|---|---|---|---|
| 1M.1 | HIGH | [ ] CSP `connect-src` — strip `api.anthropic.com`, `api.openai.com`, `openrouter.ai`, `api.groq.com`, `api.resend.com`, `generativelanguage.googleapis.com`. Server-side only; presence is XSS-exfil surface | `vercel.json:81` | security F1 |

### 1N — Brain-sharing role split (~30 min)

| # | Sev | Fix | Where | Sources |
|---|---|---|---|---|
| 1N.1 | HIGH | [ ] `requireBrainAccess` collapses viewer + member into one role. ~13 callsites in `capture.ts` / `transfer.ts` / `feedback.ts` / `mergeEntries.ts` rely on RLS to reject viewer writes. Switch to `requireBrainRole(["owner","member"])` so errors surface 403 not 502 | four files | brain-sharing F1 |

### 1O — Gmail-sync RPC NaN (~30 min)

| # | Sev | Fix | Where | Sources |
|---|---|---|---|---|
| 1O.1 | HIGH | [ ] Migration 084 — add `accept_hits` + `reject_hits` to `match_gmail_pattern` RPC return-table. Today `recordPatternDecision` reads `match.accept_hits + weight` → `NaN`; pattern hit counters corrupt on every accept/reject; `shouldDistillAt(NaN)` false → pattern summaries never re-distill (defeats migration 083) | new migration | gmail-sync F1 |

---

## Phase 2 — Pre-launch MEDIUM hardening · grouped by area

### 2A — Auth + identity

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2A.1 | MED | [ ] Account-enumeration via error copy. `src/lib/friendlyError.ts:11-12` returns "There's already an account with that email" — distinguishes registered vs unregistered. Generic "If an account exists for this email, we sent a code" | login-signup F4 |
| 2A.2 | MED | [ ] Inputs ship `outline:none` with only 1 px border-color cue for focus. Add `:focus-visible` ring across LoginScreen + ResetPasswordView | login-signup F3 |
| 2A.3 | MED | [ ] Privacy + ToS links at `fontSize:11` × `opacity:0.6` — illegible. Bump to 13 px / opacity 0.75 | login-signup F6 |
| 2A.4 | MED | [ ] JWT cache TTL `5_000 → 2_000` ms. Force-revalidate on delete-account, admin-tier change, api-key revoke | security F2 |
| 2A.5 | MED | [ ] CSP — add `frame-ancestors 'none'` and `base-uri 'none'`. Click-jacking + base-tag injection defence | security F4 |

### 2B — Rate limiting

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2B.1 | MED | [ ] `withAuth` rate-limit key — when `user.id` resolved, key by `user:<id>` not IP. Closes NAT lockout. Mirror `withApiKey` two-tier pattern | security F3, rate-limiter F5 |
| 2B.2 | MED | [ ] `memory-api.ts`, `calendar.ts`, `mcp.ts` — re-key rate-limit by `user.id` post-auth | rate-limiter F4 |

### 2C — Capture + idempotency

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2C.1 | MED | [ ] Idempotency-key namespace — flat per-user collides on legit double-fire. Prefix with `<route>:` (`capture:<hash>`, `mcp_create:<hash>`) | capture-pipeline F3 |
| 2C.2 | MED | [ ] `bodyParser.sizeLimit` `10mb → 512kb` on `api/capture.ts`. Largest legit body sums to ~265 KB; 10 MB is 38× DoS bandwidth waste | capture-pipeline F4 |
| 2C.3 | MED | [ ] pdfjs worker URL init has no try/catch. If worker fails (CORS, 404, Capacitor scope), pdfjs silently parses on main thread → seconds of UI freeze | capture-sheet F3 |

### 2D — Retrieval + AI provider

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2D.1 | MED | [ ] `match_count` in `match_entries` RPC — read caller `limit` instead of hard-coded 20 | retrieval F4 |
| 2D.2 | MED | [ ] Embedding circuit breaker — when Gemini down, fall back to BM25-only with `aiAllowed:false` flag in response | retrieval F5 |
| 2D.3 | MED | [ ] Concurrent-embed dedup — when same query embedded twice in 100 ms, dedup via in-flight promise map | retrieval F6 |
| 2D.4 | MED | [ ] Provider failover chain — `callAI` tries one provider, returns `""` after retry exhaustion. Add Anthropic / OpenAI fallback for premium tiers; surface explicit `provider_unavailable` error for free | ai-provider F4 |
| 2D.5 | MED | [ ] Two parallel LLM abstractions (`callAI` vs `_lib/providers/*`) with overlapping responsibilities. Pick one canonical; deprecate the other | ai-provider F3 |

### 2E — MCP

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2E.1 | MED | [ ] 7 of 8 mutating MCP tools write nothing to `audit_log`. Add `writeAuditLog` to `update_entry`, `delete_entry`, `merge_entries`, `gmail_ignore_pattern`, etc. | mcp-server F4 |
| 2E.2 | MED | [ ] MCP tool result size guard — truncate to 32 KB or paginate. Today an attacker calling a tool returning huge data blows context window + provider cost | mcp-server F5 |

### 2F — Email deliverability

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2F.1 | MED | [ ] Resend sends — add `List-Unsubscribe: <mailto:unsubscribe@everion.smashburgerbar.co.za>, <https://everion.smashburgerbar.co.za/unsubscribe?u={uid}>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Required by Gmail/Yahoo bulk-sender 2024 | `api/_lib/sendInviteEmail.ts:58` · `weekly-roll-up.ts:277-282` | email F3 |
| 2F.2 | MED | [ ] `RESEND_FROM` fallback — change from `everionmind.com` (unowned) to `noreply@everion.smashburgerbar.co.za` | `api/_lib/sendInviteEmail.ts` + Vercel env | email F4 |

### 2G — Onboarding telemetry

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2G.1 | MED | [ ] PostHog event-taxonomy contract drift — 10 events documented in `EML/Analytics/event-taxonomy.md` (`first_memory_created`, `first_ai_answer_viewed`, `vault_setup_completed`, etc.) don't fire. Wire `src/lib/events.ts` OR delete the doc lines | onboarding F3 |

### 2H — Gmail-sync prompt-injection

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2H.1 | MED | [ ] `buildPrompt` interpolates email `From:` / `Subject:` / `Body:` raw into classifier prompt with no `<untrusted_email>` delimiter. `distillGmail` DOES wrap; classifier does not. Same fix in `deepExtractEntry` | gmail-sync F3 |

### 2I — Webhooks

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2I.1 | MED | [ ] Webhook RC fallback id collapses distinct events when both `event.id` AND `event_timestamp_ms` are missing. Hash full body in fallback | webhook F4 |
| 2I.2 | MED | [ ] Webhook LS fallback to `data.id` permanently locks subscriptions — once data.id idempotency burns, future events for that sub are ignored | webhook F6 |

### 2J — Brain-sharing

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2J.1 | MED | [ ] 60/min rate limit applies to invite + accept + members combined. Split invite to 10/min | brain-sharing F3 |

### 2K — Admin

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2K.1 | MED | [ ] `handleAdminSetTier` writes audit_log AFTER PATCH, fire-and-forget. Crash window between two = tier change with no audit row. Write pending row BEFORE PATCH or wrap in Postgres function | admin-tab F2 |
| 2K.2 | MED | [ ] Four persona/gmail mutating handlers (`audit-persona`, `wipe-persona-extracted`, `backfill-persona`, `revert-persona-backfill`) have `requireBrainAccess` only — no `isAdminUser`, no audit_log. `wipe-persona-extracted` is bulk hard-delete with zero trail | `api/entries.ts:882-931` | admin-tab F3 |

### 2L — Vault UI

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2L.1 | MED | [ ] Two PIN stores: `lib/pin.ts` (4-digit, used by `SecurityTab`) and `lib/vaultPinKey.ts` (6-digit / 4–8 valid, used by vault unlock). Setting "Vault PIN" in Settings does NOT change vault-unlock PIN. Unify | vault-view F3 |
| 2L.2 | MED | [ ] No recovery-key rotation UI for lost-key users | vault-view F4 |

### 2M — Detail modal

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2M.1 | MED | [ ] DetailModal god-component (1,590 LOC). 4 high-confidence extractions (`KeepThisPanel`, `EntryActionToolbar`, `EntryContentSection`, `EntryEditForm`) drop ~470 LOC zero-behaviour-change | detail-modal F3 |
| 2M.2 | MED | [ ] Vault toggle does NOT re-encrypt content. note → secret leaves plaintext on server; secret → note leaves ciphertext as a regular note. Re-encrypt on toggle, or refuse the operation | detail-modal F4 |
| 2M.3 | MED | [ ] Failed save still calls `setEditing(false)` — user thinks save landed | detail-modal F5 |

### 2N — Memory grid

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2N.1 | MED | [ ] No scroll-restore. View-switch Memory ↔ Timeline remounts via `key={appShell.view}` (`Everion.tsx:622`); virtualizer re-instantiates, scrollTop resets | memory-grid F2 |
| 2N.2 | MED | [ ] Filter pipeline O(n) per keystroke over up to 5000 entries. `searchIndex` flat token-map scan. Borderline today | memory-grid F1 |
| 2N.3 | MED | [ ] No keyboard row navigation. Tab + Enter works but no arrows / `j/k` / roving tabindex / `role="grid"` | memory-grid F3 |

### 2O — Chat view

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2O.1 | MED | [ ] No `AbortController` anywhere in chat. Brain switch mid-request corrupts: stale fetch resolves, `setMessages` overwrites brain B's view with brain A's reply | chat-view F2 |
| 2O.2 | MED | [ ] `useEffect [messages, loading] → scrollIntoView` fires unconditionally. No user-scroll check. "Don't fight the user" violation | chat-view F3 |
| 2O.3 | MED | [ ] No streaming, no Stop button, no virtualization. OK for launch but document the gap; long chats jank | chat-view F4 |
| 2O.4 | MED | [ ] Rate-limit feedback absent — 429 from `/api/llm` not mapped to UI countdown | chat-view F5 |

### 2P — Todo

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2P.1 | MED | [ ] Zero virtualization in any todo tab. Brittle past 500 todos | todo-view F3 |
| 2P.2 | MED | [ ] `TodoSomedayTab` (1,786 LOC) eagerly imported regardless of `somedayEnabled` flag — 30–50 KB gz wasted on free tier | todo-view F6 |

### 2Q — Settings shell

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2Q.1 | MED | [ ] Save semantics fragmented across tabs — 4 distinct patterns (auto-save, save button, form submit, one-click). `EML/architecture/settings-conventions.md` + realign outliers | settings-views F2 |
| 2Q.2 | MED | [ ] Dirty-state silently dropped on settings tab switch. AccountTab + BrainTab in-row rename + AITab BYOK key entry survive tab switch via `display:none` but user can't see unsaved state. Ship `useDirtyState(scope)` + `ConfirmDialog` interceptor | settings-views F3 |

### 2R — Profile tab

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2R.1 | MED | [ ] No virtualization + no `React.memo`. `CollapsibleSection.Content` mounts children regardless of `collapsed`. 200-fact users pay full DOM cost. Two-line: `{!collapsed && children}` + `React.memo(FactRow)` | profile-tab F1+F7 |
| 2R.2 | MED | [ ] Persona retire has no inverse — Rejected has `unrejectFact`, History has only delete. Data layer supports inverse, only icon missing | profile-tab F5 |
| 2R.3 | MED | [ ] ProfileTab refactor pressure — 3 clean extraction seams (`PersonaFactsGrid` ~170 LOC, `PersonaPromptDebug` ~350 LOC, `PersonaActionsPanel` ~200 LOC). Drops 2,219 → ~450 LOC | profile-tab refactor |

### 2S — Cron

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2S.1 | MED | [ ] No per-iteration timeout on web-push / Supabase REST inside hourly cron. Wrap each in `AbortSignal.timeout(5_000)` | cron F3 |
| 2S.2 | MED | [ ] Cron daily logs leak user IDs in handler-side Vercel logs. Strip via structured-log redaction | cron F6 |

### 2T — A11y

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2T.1 | MED | [ ] Color contrast — `--ember`, `--ink-faint`, `--ink-ghost` drop below 4.5:1 on `--surface-high`; `--moss` (3.91:1) + `--blood` (3.52:1) fail body-text contrast on `--bg`. Re-tune tokens or restrict to ≥18 pt | a11y F4 |
| 2T.2 | MED | [ ] Two `<div onClick>` patches break keyboard parity in `TodoEditPopover.tsx` and `GmailStagingInbox.tsx`. Convert to `<button>` | a11y F2 |
| 2T.3 | MED | [ ] `outline:none` on `LoginScreen.tsx` inputs without `:focus-visible` ring | a11y F3 |

### 2U — Performance + PWA

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2U.1 | MED | [ ] Add `mammoth` (101 KB gz) to SW `globIgnores`. Currently precaches `.docx` parser for every first visitor | perf F1, `vite.config.js:140` |
| 2U.2 | MED | [ ] Self-host Google Fonts via `@fontsource-variable/*` — removes one cross-origin RTT on first paint | perf F2 |
| 2U.3 | MED | [ ] `beforeinstallprompt` not captured; apple-touch-startup-image missing for iOS standalone | pwa F3 |

### 2V — Resilience MEDIUM

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2V.1 | MED | [ ] Five MEDIUM resilience items (mixed-fetch `Promise.all` patterns, missing retry-budget logging, etc.) — see source audit F5–F9 | resilience F5–F9 |

### 2W — Dependencies

| # | Sev | Fix | Sources |
|---|---|---|---|
| 2W.1 | MED | [ ] `@revenuecat/purchases-capacitor 11.3.2 → 13.1.0`. 2 majors behind on billing-critical SDK. Schedule before launch with RC sandbox tests | deps F7 |

---

## Phase 3 — LOW + nits · post-launch acceptable

### 3A — CSP + supply-chain LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3A.1 | LOW | `vercel.json` CSP — add `'strict-dynamic'` to `script-src` for stronger CSP-3 score | security F7 |
| 3A.2 | LOW | CSP `connect-src` — drop static PostHog `Authorization` reference (not needed) | security F8 |
| 3A.3 | LOW | `handleAuth` — wrap redirect path in try/catch; today an error after redirect issuance silently 200s | security F6 |
| 3A.4 | LOW | 17 deprecated transitives. Add `rimraf`/`glob`/`inflight` to `overrides` block to kill 6 of 8 prod-tree deprecations | deps F1 |
| 3A.5 | LOW | `posthog-js@1.372.1 → 1.372.9` patch bump — avoids dragging Node OpenTelemetry SDK transitives | deps F2 |
| 3A.6 | LOW | Deps F3–F8 (5 LOW) — see source | deps |
| 3A.7 | INFO | `exceljs@4.4.0` last released 2023-10-19 (19 mo stale). Used in 3 prod paths. Replace post-launch | deps F3 |

### 3B — Capture + retrieval LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3B.1 | LOW | `updateStreak` admin-endpoint errors don't bubble — add `.catch(log.warn)` | capture-pipeline F5 |
| 3B.2 | LOW | Gmail attachment late-extract is fire-and-forget at scan time. Move into enrichment queue | capture-pipeline F6 |
| 3B.3 | LOW | Free-tier `?action=embed` does NOT check `aiAllowed`. Gate with same flag as enrichment | capture-pipeline F7 |
| 3B.4 | LOW | Capture-sheet F6 — paste-URL no metadata enrichment | capture-sheet F6 |
| 3B.5 | LOW | Capture-sheet F7 — VCF + multi-entry split paths bypass `queueDirectSave`, no offline branch. Share-target not wired in `manifest.json` | capture-sheet F7 |
| 3B.6 | LOW | Tag-sibling expand can spider into noise — cap at top-5 sibling tags by usage | retrieval F7 |
| 3B.7 | LOW | `applyGraphBoost` only fires for `retrieveEntries`, not `retrieveEntriesForUser`. Document or unify | retrieval F8 |

### 3C — MCP LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3C.1 | LOW | `gmail_sync` tool — `brain_id` arg documented but silently ignored. Honour or remove | mcp-server F6 |
| 3C.2 | LOW | `merge_entries` tool definition omits `brain_id` parameter | mcp-server F7 |
| 3C.3 | LOW | `resolveTargetBrain` accepts non-string `brain_id` then ignores it. Validate type → 400 | mcp-server F8 |
| 3C.4 | LOW | Token verification has no `iss`/`aud`/`sub` claims. Add for auditability | mcp-server F9 |
| 3C.5 | LOW | OAuth `client_credentials` accepts any valid `em_` key as `client_secret`. Tighten to dedicated MCP client registration | mcp-server F10 |
| 3C.6 | LOW | `merge_entries` rate limit is global per-IP; switch to per-key | mcp-server F11 |
| 3C.7 | LOW | `gmail_ignore_pattern` writes user-controlled string into `preferences.custom` with no length cap. Cap at 256 chars | mcp-server F12 |

### 3D — Brain-sharing LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3D.1 | LOW | Token equality at DB layer only (no plaintext compare). Note for HMAC migration | brain-sharing F2 |
| 3D.2 | LOW | Expired invites never pruned; pending-list query missing `expires_at>now()` | brain-sharing F4 |
| 3D.3 | LOW | `entry_shares` rows survive source-entry soft-delete — minor info leak + UX bug | brain-sharing F5 |

### 3E — Admin LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3E.1 | LOW | `handleHealth` accepts every HTTP method with `rateLimit:false`; `handleSentryIssues` not admin-gated; eight `entries.ts` admin handlers skip audit_log | admin-tab F4–F7 |

### 3F — Webhook LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3F.1 | LOW | No audit_log on webhook tier change (carry billing F6); no dead-letter / retry-budget tracking | webhook F7, F11 |

### 3G — Email LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3G.1 | LOW | Weekly roll-up email — no text/plain fallback (HTML-only) | email F5 |

### 3H — Resilience LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3H.1 | LOW | Resilience F9–F11 (3 LOW — see source audit) | resilience |

### 3I — Rate-limiter LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3I.1 | LOW | `health` route opts out of rate-limit; OK by design but document | rate-limiter F7 |
| 3I.2 | LOW | Pre-auth gate in `withApiKey` doesn't trip on user identity (design note) | rate-limiter F8 |
| 3I.3 | LOW | In-memory dev fallback masks rate-limit bugs. Make Upstash mandatory in `NODE_ENV=production` | rate-limiter F9 |
| 3I.4 | LOW | Add 3-second timeout on Upstash REST `fetch` | rate-limiter F10 |
| 3I.5 | NIT | `req.url` includes query string before split — bound is on the wrong slice | rate-limiter F11 |

### 3J — A11y LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3J.1 | LOW | Logo `<img alt="">` may leave it unnamed on mobile shell (`MobileHeader.tsx:79`, `MobileMoreMenu.tsx:179`, `LoadingScreen.tsx:108`) | a11y F1 |
| 3J.2 | LOW | A11y F5 + 4 more LOWs — see source | a11y |

### 3K — Performance LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3K.1 | LOW | 9 design-family stylesheets `@import`-ed in `src/index.css:8-16`; only one active. Lazy-load saves ~22 KB gz | perf F3 |
| 3K.2 | LOW | jszip eager-graph leak risk; posthog + sentry consent-load (~200 KB gz); no font preload; anonymous Landing 2-RTT | perf F4–F8 |

### 3L — PWA LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3L.1 | LOW | Woff2 not in precache; no explicit `/sw.js` `Cache-Control` header | pwa F4–F5 |

### 3M — Cron LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3M.1 | LOW | Cron F4–F5, F7 (2 LOW + 1 NIT — see source) | cron |

### 3N — AI-provider LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3N.1 | LOW | No token-cost telemetry; partial model-registry centralisation across 5–9 files | ai-provider F5–F7 |

### 3O — Landing LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3O.1 | LOW | Fabricated testimonials shipped (file comment admits "placeholder, replace post-launch"). FTC §255 risk | landing F5 |
| 3O.2 | LOW | Pro plan promises Claude Sonnet but project AI is Gemini per CLAUDE.md. Update copy or change provider | landing F6 |
| 3O.3 | LOW | `stander.christian@gmail.com` exposed in landing footer. Use brand inbox | landing F7 |
| 3O.4 | LOW | Hero `100vh` not `100dvh` — iOS Safari URL-bar overflow | landing F8 |
| 3O.5 | LOW | LCP hero image not preloaded | landing F9 |
| 3O.6 | LOW | Cmd+K binding has no visible kbd hint despite code comment claiming one exists | landing F11 |
| 3O.7 | LOW | Landing F12+ (2 more LOWs) | landing |

### 3P — Memory grid + detail-modal LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3P.1 | LOW | Synchronous bootstrap at `useDataLayer.ts:30-42` reads legacy global `openbrain_entries`, contradicting `entriesCache.ts:103-114`. Multi-brain users may briefly see wrong-brain rows on cold mount | memory-grid F7 |
| 3P.2 | LOW | Memory-grid F4–F8 (4 LOW — see source) | memory-grid |
| 3P.3 | LOW | Trash restore writes no audit_log row | detail-modal F8 |

### 3Q — Vault view LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3Q.1 | LOW | Cosmetic info-leak on locked subtitle | vault-view F6 |
| 3Q.2 | LOW | Missing first-unlock toast | vault-view F8 |
| 3Q.3 | LOW | No brand logo on any vault screen (absence not swap; trust signal) | vault-view F5 |

### 3R — Chat view LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3R.1 | LOW | Punycode look-alikes pass markdown render — XSS-adjacent | chat-view F8 |
| 3R.2 | LOW | Chat F6/F7/F9–F12 (6 more LOWs — see source) | chat-view |

### 3S — Todo LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3S.1 | LOW | Todo F7–F9 (3 LOWs — see source) | todo-view |

### 3T — Settings LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3T.1 | LOW | `ConfirmDialog` primitive checked in but unused; DangerTab still uses hand-rolled 3-state modal | settings-views F1 |
| 3T.2 | LOW | `?tab=billing` only shows BillingTab for admins (`SettingsView.tsx:537`). Non-admin paying users hitting deep-link see nothing. Un-gate | settings-views F6 |
| 3T.3 | LOW | Settings F4/F5/F7 (1 LOW + 2 VERY-LOW — see source) | settings-views |

### 3U — Profile LOW

| # | Sev | Fix | Sources |
|---|---|---|---|
| 3U.1 | LOW | History reads `entries.metadata` not `audit_log` — drift over time | profile-tab F3 |
| 3U.2 | LOW | Text-only loading skeleton | profile-tab F8 |
| 3U.3 | LOW | No inline duplicate-detection in fact entry | profile-tab F9 |

---

## Limitations + re-run triggers

| Audit | Blocked signal | Re-run trigger |
|---|---|---|
| security F5 | RLS coverage unverified — Supabase MCP not authenticated | Re-run F5 once MCP OAuth done |
| capture | No live p95 / 24 h 5xx scan | Observability cycle |
| retrieval | No `EXPLAIN ANALYZE` / advisor lints | Defer to `vector-index-audit` 2026-06-14 |
| email F1 | DMARC absence verified via nslookup; mail-tester.com not run | Manual mail-tester pre-launch |
| rate-limiter | Upstash creds not readable; live x-forwarded-for chain not measured | Prod env access |
| gmail-sync | `gmail_decisions` counts, `/api/gmail` 5xx logs deferred | MCP OAuth |
| performance | Real-device LCP/INP not measured | Lighthouse CI step pre-launch |
| resilience | Live Vercel function-secs of stalled-fetch impact not measured | Beta week 1 |
| brain-sharing | Policies via migrations, not `pg_policies` | SQL cross-check pre-launch |
| accessibility | No axe-core run; no SR walk | Manual VoiceOver iOS + NVDA pre-launch |
| dependencies | No `license-checker`, no `npm audit signatures`, no SBOM | Add to CI |
| onboarding | No PostHog dashboard access; no real-device timing | Beta week 1 |
| memory-grid | No 5000-entry real-device measurement | Beta week 1 |
| capture-sheet | No mobile / Capacitor live picker test | Beta week 1 |
| vault-view | No iOS Safari biometric live test | Beta week 1 |
| chat-view | No long-chat (200+ msg) DOM-size measurement | Beta week 1 |
| todo-view | No multi-TZ smoke test | International beta |
| profile-tab | No 200-fact perf measurement | Persona-extraction beta data |

---

## Maintenance

- When a row closes, mark `[x]` and (where applicable) add `## Resolution — YYYY-MM-DD` to the source audit + `git mv` to `archive/`.
- New audit findings (batch-5+) append to the right phase by area, not at the bottom.
- Once 70 % of HIGH closes, re-score MEDIUMs for cut-down.
- Verification pass at top is the snapshot of confidence on 2026-05-07. Re-verify before any "carry forward" decision past 2026-05-21.

---

**Created**: 2026-05-07 by audit-batch consolidation. Replaces the three rollup files for triage.
