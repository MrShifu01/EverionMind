# Audit Fixes — Consolidated TODO

> Single source for **outstanding audit findings** across all 11 reports run on 2026-05-07. Individual reports archived under `archive/` for traceability; severity, file paths, and rationale preserved here.
>
> **Order is the ideal tackle sequence** — Phase 0 unblocks Phase 1, etc. Within a phase, items batch by file/system so one PR can close several lines at once. Each item links back to the source audit (`{audit-name}` → `archive/{audit-name}-2026-05-07.md`).
>
> **Status legend:** [ ] open · [x] done · [~] in progress · [-] deferred (post-launch).

---

## Phase 0 — One-line fixes (knock out first, no deps) · ~1 hour total

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| 0.1 | HIGH | Replace `window.confirm()` with branded `ConfirmDialog` (extract from `ProfileTab.tsx:1587` to shared) | `src/views/TrashView.tsx:44,57` · `src/hooks/useVaultOps.ts:836` | smash-os, vault-unlock F1, production F1 |
| 0.2 | HIGH | `redirectUrl()` fail closed when `VITE_APP_URL` unset — never trust `window.location.origin` for OAuth | `src/hooks/useAuthFlow.ts:5-19` | auth-flow F1 |
| 0.3 | HIGH | Kill `host`-header trust in LS `successUrl` — read `APP_ORIGIN` env var | `api/user-data.ts:2981-2982` | billing F1 |
| 0.4 | MEDIUM | Drop JWT cache TTL `30_000 → 5_000` ms (revoke window) | `api/_lib/verifyAuth.ts:8` | smash-os, auth F2, production W1 |
| 0.5 | MEDIUM | Lift `.design-input` font-size 14 → 16 px globally (kills iPad-Safari auto-zoom) | `src/index.css:185-190` | frontend MOB-1, production W11 |
| 0.6 | MEDIUM | Drop `user.email ??` from cron logs (PII leak) | `api/user-data.ts:2333,2384` | pii F1 |
| 0.7 | LOW | Auto-trim OTP input on paste | `src/hooks/useAuthFlow.ts` (input handler) | auth F4 |

---

## Phase 1 — Pre-launch blockers · ops + infra

### 1A — Vercel + env var setup (~30 min · operator-side, no code)

| # | Severity | Fix | Source |
|---|---|---|---|
| 1A.1 | HIGH | **Vercel Pro upgrade ($20/mo)** — unblocks `maxDuration:300` on api/gmail, user-data, llm, entries (Hobby silently caps 60s) | smash-os, production F3 |
| 1A.2 | HIGH | Verify `gh api repos/<owner>/<repo>/branches/main/protection` — if absent, configure: require PR + passing CI + no force pushes | production F4 |
| 1A.3 | MEDIUM | Add `SUPABASE_DB_URL` to GH Actions secrets (db-backup workflow runs but writes nothing without it) | smash-os, production W4 |
| 1A.4 | MEDIUM | Add `OAUTH_TOKEN_ENCRYPTION_KEY` to Vercel prod, then run `Ops/oauth-token-plaintext-audit.sql` | smash-os, production W5 |
| 1A.5 | MEDIUM | Set `APP_ORIGIN=https://everion.smashburgerbar.co.za` in Vercel prod (paired with 0.3) | billing F1 |
| 1A.6 | MEDIUM | Confirm in Vercel prod: `LEMONSQUEEZY_STARTER_VARIANT_ID`, `_PRO_VARIANT_ID`, `_MAX_VARIANT_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `LEMONSQUEEZY_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `REVENUECAT_API_KEY` all set | billing pre-launch checklist |
| 1A.7 | LOW | Supabase dashboard → Auth → Password Security → enable "Check for breached passwords" (HaveIBeenPwned) | db F12 |
| 1A.8 | LOW | Confirm Supabase Auth → Email Confirmation is required (prevents unconfirmed sign-ins) | auth F5 |

### 1B — Sentry + uptime + status (~1 hour)

| # | Severity | Fix | Source |
|---|---|---|---|
| 1B.1 | HIGH | Configure 3 Sentry alert rules: error-rate > 50/10m · new-issue first-fire · p95(`/api/llm`,`/api/capture`) > 5s. Route to `stander.christian@gmail.com`. | smash-os, observability F1, production F2 |
| 1B.2 | MEDIUM | External uptime monitor (UptimeRobot free / BetterStack / Sentry uptime) → poll `https://everionmind.com/api/status` every 1m, alert on 2 consecutive 503/timeout | smash-os, observability F6, production W15 |
| 1B.3 | MEDIUM | `/api/health` returns **503** when `db === false`; `200 + degraded:[…]` for non-critical (gemini/groq) | observability F4, production W12 |
| 1B.4 | LOW | External status page (Statuspage.io / Instatus) — in-app `StatusPage.tsx` is invisible when the app itself is down | production W18 |

### 1C — Auth-surface drift (~30 min)

| # | Severity | Fix | Source |
|---|---|---|---|
| 1C.1 | HIGH | Extract `isAdminUser()` to `api/_lib/adminAuth.ts`, import from `entries.ts:987` + `user-data.ts:3267`. Stops silent admin-surface drift. | smash-os, production W2 |
| 1C.2 | MEDIUM | `handlePatch` and `entryDelete` pre-fetch by `id` only — add `&user_id=eq.${user.id}` (or compound brain scope) so RLS is a backstop, not the gate | `api/entries.ts:281,313` · `api/_lib/handlers/entryDelete.ts:21` · smash-os, service-role F1 |
| 1C.3 | LOW | Surface Supabase rate-limit errors with countdown (status 429 / "rate limit" detection) | auth F3 |

---

## Phase 2 — DB hardening · Migration 083+ (~1 hour SQL)

### 2A — Migration 083 — RLS + function security

| # | Severity | Fix | Source |
|---|---|---|---|
| 2A.1 | HIGH | `DROP POLICY vault_entries_all ON public.vault_entries` — overlapping policy lets the looser one win (advisor 0006 ×4) | db F1 |
| 2A.2 | HIGH | Verify `entries_embedding_hnsw_idx` is actually scanned (0 scans observed). If retrieval is using seq-scan fallback, vector search is silently slow. `EXPLAIN ANALYZE` evidence required before keeping or dropping | db F2 |
| 2A.3 | MEDIUM | Rewrite `gmail_pattern_rules_owner_rw` + `user_enrich_quota_owner_read` policies with `(SELECT auth.uid())` pattern, pin role to `authenticated` | db F3 |
| 2A.4 | MEDIUM | `ALTER FUNCTION ... SET search_path = public, pg_temp` on 7 functions: `create_personal_brain_for_new_user`, `user_personas_touch_updated_at`, `handle_new_user`, `match_gmail_pattern`, `important_memories_touch`, `_lock_billing_columns`, `enforce_entries_brain_owner_match` | db F6 |
| 2A.5 | MEDIUM | Audit 7 mutating SECURITY DEFINER functions for explicit `auth.uid()` gate: `capture`, `quick_capture`, `save_links`, `bulk_apply_embeddings`, `claim_pending_enrichments`, `consume_enrich_quota`, `recompute_enrichment_state`, `handle_new_user`. Then **REVOKE EXECUTE FROM anon** OR switch to SECURITY INVOKER | db F5 |
| 2A.6 | LOW | `COMMENT ON CONSTRAINT entries_brain_id_fkey` + `links_brain_id_fkey` — document `NO ACTION` is intentional (data preservation) | db F8 |

### 2B — Migration 084 — drop dead tables (after product confirm)

| # | Severity | Fix | Source |
|---|---|---|---|
| 2B.1 | MEDIUM | `DROP TABLE` (CASCADE): `notification_prefs`, `push_subscriptions`, `messaging_connections`, `messaging_pending_links`, `collection_entries`, `collections`, `brain_api_keys` | db F4 |
| 2B.2 | MEDIUM | Strip the dropped tables from GDPR delete-cascade list at `api/user-data.ts:1851-1862` | db F4 |

### 2C — Migration 085 — index cleanup (after 2A.2 verified)

| # | Severity | Fix | Source |
|---|---|---|---|
| 2C.1 | LOW | Add 4 missing FK indexes: `idx_brain_invites_invited_by`, `idx_brain_members_invited_by`, `idx_brain_vault_grants_granted_by`, `idx_entry_shares_shared_by` | db F9 |
| 2C.2 | LOW | Drop 23 unused indexes — one PR per group with `EXPLAIN ANALYZE` evidence | db F10 |

### 2D — Garbage purge (one-shot SQL)

| # | Severity | Fix | Source |
|---|---|---|---|
| 2D.1 | LOW | `DELETE FROM public.tags WHERE NOT EXISTS (SELECT 1 FROM entry_tags WHERE tag_id = tags.id)` — 33 orphan tags | db F11 |
| 2D.2 | LOW | Verify `concept_graphs` / `knowledge_shortcuts` / `query_feedback` owner-only RLS is intentional (members blocked) — confirm with product spec | db F7 |
| 2D.3 | LOW | Daily cron: `DELETE FROM webhook_events WHERE seen_at < NOW() - INTERVAL '30 days'` — table grows monotonically | billing F5 |

---

## Phase 3 — Webhook + audit-log coverage (~1.5 hours)

| # | Severity | Fix | Source |
|---|---|---|---|
| 3.1 | MEDIUM | Extract `writeAuditLog(user.id, action, resource_id, req_id, metadata?)` helper. Half-done in `api/_lib/handlers/entryDelete.ts:69-79` | service-role F4 |
| 3.2 | MEDIUM | Adopt `writeAuditLog()` at gap sites: LS webhook tier writes · RC webhook tier writes · `gmail_decisions` (accept/reject) · vault entry CRUD · `brain_invites`/`brain_members` admin actions · `/v1/*` writes via API key · MCP mutating tool invocations | billing F6, observability F3 |
| 3.3 | MEDIUM | Document `REVENUECAT_WEBHOOK_SECRET` rotation cadence (quarterly) in `EML/Ops/vendors.md` + calendar reminder | billing F2 |
| 3.4 | MEDIUM | RC webhook: reject events older than 5 min via `event.event_timestamp_ms` (defence-in-depth) | billing F2 |
| 3.5 | LOW | RC fallback `eventId`: include body hash, OR refuse events without `event.id` (collision-prone today) | billing F3 |
| 3.6 | LOW | Accept `Idempotency-Key` header on `handleLemonCheckout` (double-tap subscribe → 2 LS records today) | billing F7 |
| 3.7 | LOW | Add `GMAIL_CRON_DISABLE=1` and `ENRICH_CRON_DISABLE=1` env-var kill switches | service-role F2 |
| 3.8 | HIGH | **Paginate `enrichAllBrains` with `?limit=1000&order=id`** — past 1000 brains additional brains never enrich (PostgREST silently truncates) | service-role F3 |

---

## Phase 4 — Frontend launch polish (~3 hours)

### 4A — Tap targets + 8-px grid (production-gate)

| # | Severity | Fix | Source |
|---|---|---|---|
| 4A.1 | HIGH | Bump `.design-btn-primary` + `.design-btn-secondary` `min-height: 40 → 48 px`, `.design-btn-ghost: 36 → 44 px`. Walk all 9 family themes in Playwright | `src/design/tokens.css:49,81,109` · frontend A11Y-1, production W10 |
| 4A.2 | HIGH | Landing mobile tap-target sweep — 22/30 elements < 44 px. Bump nav links, footer links, scroll-cue button via `padding-block` (visible text doesn't shift) | `src/views/Landing.tsx` · frontend A11Y-2 |
| 4A.3 | MEDIUM | Author `--space-{1..10}` token scale on 4-px steps (4/8/12/16/20/24/32/40/48/64). Migrate `src/index.css` + family CSS in single sweep — 164 off-grid instances on Landing alone | `tokens.css` · frontend SPC-1 |
| 4A.4 | LOW | `clamp()` fluid display + h2 tokens (e.g., `clamp(2rem, 4vw + 1rem, 3.5rem)`) — fixed type scale today | `tokens.css` · frontend TYPO-1, CWV-2 |
| 4A.5 | LOW | Add `e2e/specs/tap-targets.spec.ts` + `e2e/specs/input-fontsize.spec.ts` regression tests | frontend tickets |

### 4B — Vault crypto polish

| # | Severity | Fix | Source |
|---|---|---|---|
| 4B.1 | MEDIUM | Migrate vault-key cache from `sessionStorage` raw bytes to **IndexedDB `extractable: false` CryptoKey**. Same UX, key no longer extractable to JS even with full DOM access (~2 hr incl. tests) | `src/lib/crypto.ts:149-154` · vault F2 |
| 4B.2 | LOW | `decryptVaultKeyFromRecovery` — distinguish "format error" (corrupted blob) from "key error" (wrong recovery code). UX win, no security risk | `src/lib/crypto.ts:144-146` · vault F6 |
| 4B.3 | LOW | Verify no save path triggers when `decryptEntry` returned the placeholder `"[encrypted — key mismatch or corrupted]"` (guards against placeholder-overwrite of ciphertext) | `src/lib/crypto.ts:207` · vault F7 |

---

## Phase 5 — Observability + log hygiene (~1.5 hours)

| # | Severity | Fix | Source |
|---|---|---|---|
| 5.1 | LOW | `att.name` → size + sha256(name).slice(0,8) in gmail attachment errors | `api/_lib/gmailScan.ts:266` · pii F2 |
| 5.2 | LOW | `contact.name` → hash/index in vCard error logs | `src/hooks/useCaptureSheetParse.ts:699,703` · pii F3 |
| 5.3 | LOW | `file.name` → hash/index in file-extraction error logs | `src/hooks/useCaptureSheetParse.ts:762` · pii F4 |
| 5.4 | LOW | Migrate 15+ bare `console.log` audit lines to `log.info(..., { req_id })` | `entries.ts:578,583,591,597,630,1196,1388` · `llm.ts:892` · `user-data.ts:1943,2271,2324,2333,2346,2384,2636` · pii F5, observability F5, production W6 |
| 5.5 | LOW | Add `npm run lint` regex check: `console\.(log\|info\|warn\|error)\(.*\.(email\|name\|phone\|address)` → 0 hits | pii verification |
| 5.6 | INFO | Write `EML/Ops/log-redaction-checklist.md` — "log user_id + operation + hash, never raw value" | pii F5 |
| 5.7 | INFO | Schedule `telemetry-funnel-audit` separately (PostHog event taxonomy not reviewed) | observability F7 |

---

## Phase 6 — Performance investigation (~2 hours)

| # | Severity | Fix | Source |
|---|---|---|---|
| 6.1 | MEDIUM | Audit SW precache growth 1.7 MB → 2.52 MB since pass 11 — inspect `vite.config.js:131` `globPatterns` for re-added webp/png | smash-os, production W8 |
| 6.2 | MEDIUM | `useDataLayer` cold-load fan-out — verify entries / vault_entries / brains / activity await-parallel during boot | `src/hooks/useDataLayer.ts` · smash-os |
| 6.3 | MEDIUM | Run `npm run lighthouse` against deployed preview (production CWV unmeasured) | smash-os, production W9 |
| 6.4 | LOW | Code-split TodoView (206 KB), DetailModal (176 KB), Everion shell (232 KB) | smash-os |
| 6.5 | LOW | Verify `vite.config.js` source-maps `filesToDeleteAfterUpload` actually fires in prod build | production W17 |

---

## Phase 7 — Legal + DNS + content (week 4 prep · ~1 day operator)

| # | Severity | Fix | Source |
|---|---|---|---|
| 7.1 | MEDIUM | Privacy + ToS lawyer review (R500–R1500 SA attorney) for POPIA + GDPR | smash-os, production W13 |
| 7.2 | MEDIUM | SPF/DKIM/DMARC for sender domain — target `mail-tester.com` 10/10 | smash-os, production W14 |
| 7.3 | LOW | Fix `entries.brain_id NO ACTION` undocumented intent (paired with 2A.6) | db F8 |

---

## Phase 8 — Architecture deepening (post-launch, RFC-first)

> Skipped on purpose pre-launch — verbose-but-cohesive code is shippable. These are next-decade leverage items, **each gets an RFC before code**.

| # | Candidate | Cluster | Source |
|---|---|---|---|
| 8.1 | Full LLM boundary migration — every Gemini call routes through `callAI()` quota-gated | `_lib/aiProvider.ts` + 8 distillation/persona files | arch-deepening #4 |
| 8.2 | `withRoute({ auth, rateLimit, headers, dispatch })` data-driven route boundary | every `api/*.ts` | arch-deepening #1 |
| 8.3 | Resource dispatch extraction — `api/_lib/handlers/{resource}.ts` modules (no new Vercel functions) | `user-data.ts` 3,441 LOC · `entries.ts` 1,665 LOC · `mcp.ts` 838 LOC | arch-deepening #2, smash-os |
| 8.4 | `gmailScan.ts` (2,426 LOC) + `enrich.ts` (1,899 LOC) extraction | `_lib/` | smash-os |
| 8.5 | Vault security orchestrator — `isUnlocked`, `unlock(strategy)`, `setupPin(pin)`, `rotateRecoveryKey()`, `lock()` | `crypto.ts` + `vaultPinKey.ts` + UI subscribers | arch-deepening #3 |
| 8.6 | `useVaultOps` (962 LOC) → 4 focused hooks (setup / unlock / decrypt / actions) | UI hooks | arch-deepening #5 |
| 8.7 | `useCaptureSheetParse` (813 LOC) → `useFileExtraction` + `useAIClassification` + `useSecretDetection` | capture | arch-deepening #6 |
| 8.8 | ProfileTab decomposition (2,328 LOC) — ProfileCore + PersonaFactsGrid + ... | UI | arch-deepening #7, smash-os |
| 8.9 | AdminTab (1,898) / TodoSomedayTab (1,746) / DetailModal (1,590) test coverage + decomposition | UI | smash-os |
| 8.10 | Vault recovery-key rotation flow (`rotateRecoveryKey()`) | crypto + UI | vault F3 |
| 8.11 | Brain DEK rotation (`rotateBrainDEK(brainId)`) — re-encrypt all vault entries on member removal, OR document the limitation in copy | crypto + UI | vault F4 |
| 8.12 | Container queries adoption — EntryList grid is the natural starting place | frontend | frontend LAY-1 |
| 8.13 | CSP `style-src 'unsafe-inline'` migration (plan in `EML/Ops/csp-inline-style-migration-plan.md`) | `vercel.json` | smash-os, production W3 |
| 8.14 | `vercel.ts` migration from `vercel.json` | infra | smash-os (skipped on purpose) |
| 8.15 | Typed Supabase `fetch()` wrapper to retire 370 `:any` casts in `api/` | `_lib/` | smash-os, production W7 |
| 8.16 | Mandatory first-run walkthrough | UX | smash-os |
| 8.17 | 14 e2e specs for 28k-LOC frontend — coverage expansion | `e2e/` | smash-os |
| 8.18 | `/reset-password` flow audit | auth | auth F6 |

---

## Resolved / non-findings (do not re-flag)

- F1–F5 from May 6 production audit — all **FIXED** (MCP scope, brain_vault_grants gate, /v1 secret block, withApiKey rate-limit suffix, signed MCP token).
- "F8 shared overlay leaks vault ciphertext" — **false flag** (vault entries live in `vault_entries`, not `entries.type=secret`).
- "Raw `em_*` key echoed as access_token" — **fixed** via `signMcpAccessToken` (`api/mcp.ts:623`).
- "Rate limiter IP-only on API key paths" — **fixed** in `withApiKey` rate-limit suffix (`_lib/withAuth.ts:238`).
- `/status` endpoint exposes too much (F10 May 6) — **closed**: `handlePublicStatus` now returns only `{ ok, ts }`. Timing-leak via response latency is observed but acceptable (edge cache 15s).
- Cross-user contamination — **0 hits** across 13 RLS probes on 2026-05-07.

---

## Effort estimate (total to clear pre-launch [Phases 0–7])

| Phase | Estimate |
|---|---|
| Phase 0 — one-line fixes | ~1 hour |
| Phase 1A — env var setup | ~30 min |
| Phase 1B — Sentry + uptime + status | ~1 hour |
| Phase 1C — auth-surface drift | ~30 min |
| Phase 2 — DB migrations 083/084/085 | ~1 hour SQL + product confirm |
| Phase 3 — webhook + audit-log coverage | ~1.5 hours |
| Phase 4 — frontend launch polish | ~3 hours (incl. theme walk + e2e tests) |
| Phase 5 — observability + log hygiene | ~1.5 hours |
| Phase 6 — performance investigation | ~2 hours |
| Phase 7 — legal + DNS + content | ~1 day operator |
| **Total dev** | **~12 hours** |
| **Plus operator** | **~1 day** for legal review + DNS + Vercel Pro upgrade |

---

## Source audits (archived under `archive/`)

| Audit | Findings tracked here |
|---|---|
| `audit-architecture-deepening-2026-05-07.md` | Phase 8 (post-launch RFCs) |
| `auth-flow-audit-2026-05-07.md` | F1→0.2, F2→0.4, F3→1C.3, F4→0.7, F5→1A.8, F6→8.18 |
| `billing-audit-2026-05-07.md` | F1→0.3+1A.5, F2→3.3+3.4, F3→3.5, F5→2D.3, F6→3.2, F7→3.6 + pre-launch checklist→1A.6 |
| `db-audit-2026-05-07.md` | F1→2A.1, F2→2A.2, F3→2A.3, F4→2B, F5→2A.5, F6→2A.4, F7→2D.2, F8→2A.6, F9→2C.1, F10→2C.2, F11→2D.1, F12→1A.7 |
| `frontend-architecture-audit-2026-05-07.md` | A11Y-1→4A.1, A11Y-2→4A.2, MOB-1→0.5, SPC-1→4A.3, TYPO-1/CWV-2→4A.4, LAY-1→8.12 |
| `observability-audit-2026-05-07.md` | F1→1B.1, F3→3.2, F4→1B.3, F5→5.4, F6→1B.2, F7→5.7 |
| `pii-leak-audit-2026-05-07.md` | F1→0.6, F2→5.1, F3→5.2, F4→5.3, F5→5.4 |
| `production-audit-2026-05-07.md` | F1→0.1, F2→1B.1, F3→1A.1, F4→1A.2, W1–W18 mapped above |
| `service-role-usage-audit-2026-05-07.md` | F1→1C.2, F2→3.7, F3→3.8, F4→3.1 |
| `smash-os-audit-2026-05-07.md` | top actions consolidated above; god-file decomposition→8.3/8.4/8.8/8.9 |
| `vault-unlock-audit-2026-05-07.md` | F1→0.1, F2→4B.1, F3→8.10, F4→8.11, F6→4B.2, F7→4B.3 |

---

**Generated:** 2026-05-07 from 11 parallel audits.
**Next review:** after Phase 0–3 lands; re-audit billing + observability + db before public-launch sign-off.
