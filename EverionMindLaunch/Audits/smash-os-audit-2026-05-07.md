# Smash-OS Full App Audit — 2026-05-07 (pass 12)

> Multi-dimensional pre-launch review. Senior-engineering-lead lens, hard numbers verified against the working tree on 2026-05-07. Skeptically filtered against prior audit history (`.smashOS/memory/decisions.md` pass 11 = 79/100; `Audits/archive/audit-{security,stability,architecture}-2026-05-06.md`; `Audits/archive/audit-production-hardening-2026-05-06.md`). Resolved findings not re-flagged.

```
▸ SMASH OS  ·  full app audit  [2026-05-07]
══════════════════════════════════════════════════════════════════

  OVERALL SCORE   79 / 100  —  C+
  VERDICT         PASS WITH WARNINGS

══════════════════════════════════════════════════════════════════
  DIMENSION BREAKDOWN
──────────────────────────────────────────────────────────────────
  Security              84 / 100   ×0.20  →  16.8
  Performance           78 / 100   ×0.20  →  15.6
  Architecture          78 / 100   ×0.20  →  15.6
  Code Quality / Types  76 / 100   ×0.15  →  11.4
  UX / UI               78 / 100   ×0.15  →  11.7
  Maintainability       86 / 100   ×0.05  →   4.3
  User Perspective      78 / 100   ×0.05  →   3.9
──────────────────────────────────────────────────────────────────
  WEIGHTED TOTAL                           79.3
══════════════════════════════════════════════════════════════════
```

## Verification gauntlet (run 2026-05-07)

| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npx vitest run` | 562 / 562 tests passing across 81 files (27.0s) |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run build` | succeeds; PWA SW precache 120 entries / 2520 KiB |

---

## Security — 84 / 100

**What's solid:**
- Prior security findings F1–F5 confirmed FIXED:
  - MCP `update_entry`/`delete_entry` PATCHs scope `id+brain_id` (`api/mcp.ts:445`, `:557`)
  - `brain_vault_grants` GET runs `checkBrainAccess` and role-gates the scope (`api/user-data.ts:1696-1704`)
  - `/v1/update` blocks `type=secret` (`api/v1.ts:258-262`)
  - `withApiKey` rate-limit keyed `api-key:userId:keyId:routeSuffix`, not IP (`_lib/withAuth.ts:238`)
  - MCP token endpoint issues `signMcpAccessToken(auth)` — no longer echoes raw `em_*` key (`api/mcp.ts:623`)
- `withAuth`/`withApiKey` share `startRoute`/`handleRouteError` — security headers, request ID, method check, rate-limit normalization in one place
- Vault: client-side AES-GCM, server never sees plaintext; OAuth state HMAC + nonce; webhook signature constant-time compare
- `npm audit` 0 vulns; CI gate at `--audit-level=high`
- CSP, HSTS, COOP, CORP, Permissions-Policy all in `vercel.json`

**Findings:**
| Sev | Finding | Location |
|-----|---------|----------|
| HIGH | JWT cache TTL still 30s — revoked-token honour window | `api/_lib/verifyAuth.ts:8` |
| HIGH | `isAdminUser()` still copy-pasted in two files; admin-surface drift risk | `api/entries.ts:987`, `api/user-data.ts:3267` |
| HIGH | Vercel still on Hobby plan — `maxDuration:300` declared for 4 functions but Hobby caps 60s; silent fail at scale | `vercel.json` |
| MEDIUM | `handlePatch` pre-fetch by `id` only, no `user_id` filter; in shared brains an owner can patch a member's entry without realising it | `api/entries.ts:281-290` |
| MEDIUM | `OAUTH_TOKEN_ENCRYPTION_KEY` not yet in Vercel prod (P0-4 from hardening audit) | EML/LAUNCH_CHECKLIST.md L16 |
| MEDIUM | Enrichment-audit S-02/A-03 (service-role bypass on user-scoped writes) still open — no DB-layer safety net | EML/LAUNCH_CHECKLIST.md L45 |
| LOW | CSP `style-src 'unsafe-inline'` retained (post-launch migration plan exists) | `vercel.json` |

---

## Performance — 78 / 100

**What's solid:**
- Sentry + PostHog deferred behind `requestIdleCallback` + 2s fallback + consent gate (`src/main.tsx:76-87`)
- Vercel SpeedInsights + Analytics lazy-imported (~15 KB gz saved on cold load)
- Heavy chunks lazy + excluded from SW precache: exceljs (256 KB gz), pdfjs (121 KB gz), jszip (28 KB gz), AdminTab, ChatView, sentry, all importer panels
- `vite.config.js:140-160` `globIgnores` already aggressive — no leak detected
- Vault existence check idle-deferred; vault-entries cache-first
- App + Landing both behind `lazy()` so anon visitors skip the Supabase graph
- iOS BFCache `pageshow.persisted` resume guard at 10s threshold

**Findings:**
| Sev | Finding | Location |
|-----|---------|----------|
| MEDIUM | SW precache grew 1.7 MB → 2.52 MB since pass 11 — likely added webp/png assets; verify which globPatterns expanded | `vite.config.js:131`, build manifest |
| MEDIUM | `useDataLayer` cold-load fan-out still unverified for parallel-await — vault check idle-deferred but entries / vault_entries / brains / activity all hit network during boot | `src/hooks/useDataLayer.ts` |
| MEDIUM | TodoView (206 KB), DetailModal (176 KB), Everion shell (232 KB) chunks are next code-split candidates | build report |
| LOW | No Vercel Speed Insights "Real Experience Score" dashboard cited; LCP/CLS/INP thresholds unknown | observability |

---

## Architecture — 78 / 100

**What's solid:**
- Phase-1 LLM provider gate landed: `callAI()` consumes quota; merge preview goes through it
- Gemini payload + `pickAnswerText` deduped into `_lib/providers/geminiHelpers.ts`; aiProvider + providers/gemini share it
- `withAuth`/`withApiKey` share `startRoute`/`handleRouteError`
- `mergeEntries.ts` shared-core / thin-wrapper proven across 4 surfaces (chat, MCP, /v1/merge, in-app)
- Idempotency on capture + Lemon/RC webhooks
- 83 sequential migrations; migration 057 `audit_log` live
- No circular deps (graphify-out report)
- Nice extraction: `api/_lib/handlers/entryDelete.ts` proves the dispatch-table refactor pattern

**Findings:**
| Sev | Finding | Location |
|-----|---------|----------|
| HIGH | `api/user-data.ts` 3,443 LOC — 29 sub-resources, manual if-chain dispatch; primary maintainability ceiling | `api/user-data.ts` |
| HIGH | `api/_lib/gmailScan.ts` 2,426 LOC + `_lib/enrich.ts` 1,899 LOC — single-file pipelines hard to test in isolation | both |
| HIGH | `api/entries.ts` 1,676 LOC — 24 actions; dispatcher split (P1-11) carried since hardening audit | `api/entries.ts` |
| MEDIUM | Frontend god components persist: `ProfileTab.tsx` 2,328 / `AdminTab.tsx` 1,898 / `TodoSomedayTab.tsx` 1,746 / `DetailModal.tsx` 1,590 — first three have 0 tests | listed |
| MEDIUM | 22 deferred enrichment-audit items still open (durable async job path, audit-log for `/v1/*` + MCP, hard external timeouts) | EML/LAUNCH_CHECKLIST.md L34-58 |

---

## Code Quality / Types — 76 / 100

**What's solid:**
- Typecheck 0 errors
- 562 tests / 81 files / 100% pass — up from 450 last pass (+25%)
- 0 npm vulns, CI gate at `--audit-level=high`
- `src/` clean: only **1** `@ts-nocheck` (`src/lib/revenuecat.ts` — Capacitor types), **13** `: any | as any` across 7 files
- New tests: `tests/api/ai-provider-boundary.test.ts`, vault entries, persona hygiene, soft-delete
- `verifyAuth` typed `Promise<AuthedUser | null>` (no more leaked `any`)

**Findings:**
| Sev | Finding | Location |
|-----|---------|----------|
| MEDIUM | 370 `: any | as any` in `api/` — bulk in Supabase JSON-response handling; no typed wrapper around `fetch(${SB_URL}/rest/v1/…)` | `api/**` |
| LOW | 14 e2e specs for a 28k-LOC frontend — god components still untested | `e2e/` |

---

## UX / UI — 78 / 100

**What's solid:**
- Skip-to-content link, focus traps with `fallbackFocus` on modals, ErrorBoundary with named `ViewError`
- `aria-label` on BottomNav, MobileHeader, FloatingCapture
- `friendlyError` mapping; loading skeletons; consent banner gated
- Custom design tokens (`--ember`, `--ink`, `--moss`, `--danger`); pill-shaped 28 px chips consistent
- No horizontal scroll on mobile; in-flow flex BottomNav

**Findings:**
| Sev | Finding | Location |
|-----|---------|----------|
| **HIGH** | Native `confirm()` used for permanent-delete and "delete all trash" — violates CLAUDE.md "never use OS-native UI" rule. Branded `ConfirmDialog` already exists at `ProfileTab.tsx:1587`, just not adopted here | `src/views/TrashView.tsx:44`, `:57` |
| **HIGH** | Native `confirm()` in vault recovery-key drop confirmation — same rule violation | `src/hooks/useVaultOps.ts:836` |
| MEDIUM | No mandatory first-run walkthrough (carried) | n/a |
| LOW | Empty states for Vault / Calendar / Chat lack action CTAs (carried) | various |

---

## Maintainability — 86 / 100

**What's solid:**
- 8 GH workflows: `ci`, `e2e`, `lighthouse`, `db-backup` (daily 03:17 UTC), `cron-daily`, `cron-hourly`, `weekly-roll-up`, `test-push`
- README accurate, env table matches `.env.example`
- 83 sequential numbered migrations
- Dependabot weekly + grouped, ESLint warning ratchet at 73, lint-staged + husky + prettier
- `npm run lint` includes service-role-header lint script + knip
- `EverionMindLaunch/` knowledge base + `RUNBOOK.md` + `CLAUDE.md` cross-linked

**Findings:**
| Sev | Finding | Location |
|-----|---------|----------|
| MEDIUM | DB backup workflow shipped but `SUPABASE_DB_URL` not yet added to repo secrets — backup currently inactive | LAUNCH_CHECKLIST P0 / week-1 |
| LOW | `.smashOS/` + `EML/` + `RUNBOOK.md` + `graphify-out/` are overlapping documentation surfaces — entry point unclear to a new contributor | repo root |

---

## User Perspective — 78 / 100

**What's solid:**
- Value prop clear from Landing
- Capture flow tight; OmniSearch + keyboard shortcuts feel native
- AI-output disclaimer surfaced; GDPR delete cascade live
- Self-rated 6.5 / 10 in own readiness scorecard — closed-beta ready

**Findings:**
| Sev | Finding | Location |
|-----|---------|----------|
| HIGH | Sentry alert rules still not configured — errors caught but nobody paged (carried from pass 11) | Sentry dashboard |
| MEDIUM | Privacy + ToS still not lawyer-vetted (R500–R1500 SA attorney) | EML/Legal/ |
| MEDIUM | SPF/DKIM/DMARC for sender domain unverified — transactional mail spam risk | DNS |

---

## TOP ACTIONS (priority order)

1. **[HIGH]** Replace `window.confirm()` in `src/views/TrashView.tsx:44,57` and `src/hooks/useVaultOps.ts:836` with the existing branded `ConfirmDialog` from `ProfileTab.tsx:1587`. CLAUDE.md rule violation. ~30 min.
2. **[HIGH]** Reduce JWT cache TTL `30_000 → 5_000` in `api/_lib/verifyAuth.ts:8`. Pre-launch revocation-window tightening. 1-line change.
3. **[HIGH]** Extract `isAdminUser()` into `api/_lib/adminAuth.ts`; import from `entries.ts:987` + `user-data.ts:3267`. Stops silent admin-surface drift. ~15 min.
4. **[HIGH]** Vercel Pro upgrade ($20/mo) — 4 functions declare `maxDuration:300` but Hobby silently caps 60s under load.
5. **[HIGH]** Configure 3 Sentry alert rules: error-rate spike, new issue type, slow `/api/llm` + `/api/capture` p95.

---

## Skipped on purpose (skeptically filtered)

- **God-component decomposition** — same posture as pass 11; verbose-but-cohesive in most cases. ProfileTab + TodoSomedayTab are realistic next targets, but not launch-blocking.
- **`api/**` `: any` count of 370** — bulk are Supabase JSON-response casts. Replacing them costs more than it pays without a typed `fetch(${SB_URL}/rest/v1/…)` wrapper, which is its own RFC.
- **CSP `style-src 'unsafe-inline'`** — migration plan documented in `EML/Ops/csp-inline-style-migration-plan.md`, intentionally post-launch.
- **`vercel.ts` migration** — `vercel.json` works; touching it pre-launch is risk for no user-visible win.

## False-flag findings dismissed

- "F8: shared overlay leaks vault ciphertext" — vault entries live in the separate `vault_entries` table, not `entries.type=secret`. The original audit flagged a non-issue; the share overlay only operates over `entries`.
- "Raw `em_*` key echoed as access_token" — fixed; now signed via `signMcpAccessToken` (`api/mcp.ts:623`).
- "Rate limiter IP-only on API key paths" — fixed in `withApiKey` rate-limit suffix (`_lib/withAuth.ts:238`).

---

**Audit kicked off by**: `/smash-os:audit` on 2026-05-07.
**Method**: read prior audit history (`.smashOS/memory/decisions.md`, EML `Audits/archive/`, `LAUNCH_CHECKLIST.md`); verified each carried-forward finding against working tree; ran the verification gauntlet (typecheck / vitest / npm audit / build); did not re-flag resolved items.
**Verification**: every file + line cited above was sampled directly from `git status`-clean tree on 2026-05-07. No claims pulled from training memory.
