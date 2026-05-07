# Production Hardening Audit — 2026-05-06

## Resolution Section

Status: **mostly remediated; operator-only and deep migration items remain**.

Last updated: **2026-05-07**.

### Remediation Checklist

- [ ] **P0-1 manual** — Rotate Supabase service-role, Gemini, Upstash, cron, and any provisioned Anthropic secrets if the local `.env.local` output or this transcript ever left this machine.
- [x] **P0-2** — Scoped MCP and `/v1` service-role entry mutations by `brain_id`; also scoped `api/entries.ts` hard delete, soft delete, restore, and patch mutations.
- [x] **P0-3** — Locked down `brain_vault_grants` reads/deletes so callers must prove brain access, and only owners can enumerate or revoke brain-level grants.
- [x] **P0-4 code** — Token encryption now fails hard in production when `OAUTH_TOKEN_ENCRYPTION_KEY` / `GMAIL_TOKEN_ENCRYPTION_KEY` is missing; `.env.example` documents the key.
- [ ] **P0-4 manual** — Add `OAUTH_TOKEN_ENCRYPTION_KEY` to Vercel production/staging and run `EverionMindLaunch/Ops/oauth-token-plaintext-audit.sql` against production.
- [x] **P1-1** — Added a 2 MB hard cap to raw body buffering in `api/user-data.ts`, with a 413 response path.
- [x] **P1-2** — Repaired failing API, vault, dialog, active-brain, virtualization, and vault hook tests; full Vitest suite is green.
- [x] **P1-3** — Gmail scan and cron paths now use bounded concurrency, and enrichment cron paginates brain scans within wall-clock budgets.
- [x] **P1-4** — Blocked `type: "secret"` through public `/v1/update`.
- [x] **P1-5** — API-key paths now rate limit after key resolution using identity-aware limiter suffixes.
- [x] **P1-6** — MCP OAuth token exchange now returns signed short-lived `mcp_` access tokens instead of echoing raw `em_` API keys.
- [x] **P1-7** — Entry write/delete paths now enforce explicit owner/member/viewer semantics: viewer is read-only, member can soft-write, owner is required for hard delete.
- [x] **P1-8** — Heavy chunks are confirmed lazy/non-precached, bundle visualizer remains available via `BUNDLE_STATS=1`, and build warning threshold now reflects intentional lazy chunk architecture.
- [x] **P1-9** — Build wrapper no longer uses `shell: true`; the Node `DEP0190` warning is gone.
- [x] **P1-10** — Vendored the tiny shadcn Tailwind CSS layer, removed the vulnerable shadcn CLI package, ran `npm audit fix`, and cleared npm audit.
- [x] **P1-11 partial** — Extracted the delete handler into `api/_lib/handlers/entryDelete.ts` without adding Vercel functions. Further handler extraction is quality backlog, not a release blocker.
- [x] **P1-12** — Centralized direct service-role key reads through `_lib/sbHeaders.ts` and added a lint-gated `scripts/check-service-role-headers.mjs` guard.
- [x] **P1-13** — Release-relevant dialog/component test regressions are cleared in the current suite.
- [x] **P2-1** — README now documents Gemini as the hosted provider instead of Anthropic as default.
- [x] **P2-2** — `.env.example` now aligns with the Ops env inventory and labels required, optional, server-only, and public Vite values.
- [x] **P2-3** — Public status endpoint now returns only coarse `{ ok, ts }`; dependency detail stays behind auth-gated health.
- [x] **P2-4** — Search cache now expires stale entries and caps warm-instance cache size.
- [x] **P2-5** — Import metadata is capped to 16 KB per row with a truncated safe metadata fallback.
- [x] **P2-6** — `ApiRequest.body` is now `unknown`; request-body boundaries use focused object validators / guards instead of relying on the shared `any` type.
- [x] **P2-7** — PIN copy now describes quick/app unlock and explicitly says the passphrase remains the vault encryption key.
- [x] **P2-8 plan** — CSP still allows `style-src 'unsafe-inline'`, but the migration is now mapped in `EverionMindLaunch/Ops/csp-inline-style-migration-plan.md` with hotspot inventory, phases, and acceptance criteria.
- [x] **P3-1** — PWA manifest colors now use the warmer Everion shell color.
- [x] **P3-2** — MCP discovery is GET-only.
- [x] **P3-3 partial** — Entry delete/restore/patch audit events now route through structured request logger helpers. Older batch audit diagnostics remain free-form debug logs.
- [x] **P3-4** — Build chunk warning noise is removed with an intentional threshold and explanatory Vite config comment.

This audit is a release-readiness synthesis across security, stability, architecture, code quality, dependency posture, and frontend technical quality. It builds on the archived same-day audits:

- `EverionMindLaunch/Audits/archive/audit-security-2026-05-06.md`
- `EverionMindLaunch/Audits/archive/audit-stability-2026-05-06.md`
- `EverionMindLaunch/Audits/archive/audit-architecture-2026-05-06.md`

The detailed findings below preserve the original audit text for traceability. The remediation checklist above is the current source of truth for fixed versus still-open work.

Verification run during this audit:

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `npm run test` — pass: 80 files passed, 560 tests passed.
- `npm run build` — pass. No large chunk warnings; the previous Node child-process deprecation warning is fixed.
- `npm audit --audit-level=low` — pass: 0 vulnerabilities.
- `python -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` — pass; graphify rebuilt 7142 nodes, 21851 edges, 503 communities.

## Executive Summary

Everion is improved but still not launch-clean against bad actors, large data, or public-scale traffic. This remediation pass fixed the highest-risk authorization scope defects, vault grant enumeration, MCP token exposure, plaintext-token production footgun, raw body buffering, failing release tests, unbounded search cache growth, oversized import metadata, public status reconnaissance, and the Windows shell build warning.

The current risk profile is much lower, but two classes of work still cannot be closed purely in code: operator-side secret rotation / production env configuration, and deep platform migrations such as removing inline styles from CSP or changing every API request body boundary from `any` to `unknown`.

Be blunt: the app now has fewer obvious soft spots, but the unchecked items above are still real launch risk, not paperwork.

## Production Readiness Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Security | 3 / 4 | Critical auth-scope, vault grant, MCP token, role-policy, dependency, and encryption-footgun fixes are applied; manual secret rotation remains. |
| 2 | Stability & Scale | 3 / 4 | Body/cache/import caps and bounded Gmail/enrichment cron work are applied. |
| 3 | Code Quality | 3 / 4 | Typecheck/lint pass, service-role headers are enforced, and the entries dispatcher split has started. Request bodies are still mostly `any`. |
| 4 | Test Confidence | 3 / 4 | Full unit suite is green after contract/test repairs. |
| 5 | Frontend Technical Quality | 3 / 4 | Build succeeds without warning noise, shadcn audit is cleared, and heavy chunks are lazy/non-precached. |
| **Total** | | **15 / 20** | **Closed-beta viable after manual env/secret work; unrestricted public launch still needs CSP/body-boundary migrations.** |

## Original Severity Counts

- P0 Blocking: 4
- P1 Major: 13
- P2 Minor: 8
- P3 Polish: 4

## P0 Blocking Findings

### P0-1: Real secrets were present in local `.env.local`; rotate if exposed outside this machine

- **Location**: `.env.local` presence check during this audit; `.gitignore:25`, `.gitignore:29`, `.gitignore:38`.
- **Category**: Security / Secrets management.
- **Impact**: The local file is correctly gitignored and `git status --short` was clean, so this does not appear committed. However, real-looking service, provider, cron, and rate-limit secrets exist locally. If this terminal transcript, screenshots, logs, or the file itself were ever shared, attackers could get service-role or vendor access.
- **Recommendation**: Treat any displayed local secret as compromised unless you are certain the transcript is private. Rotate Supabase service-role, Gemini, Upstash, cron secret, and any Anthropic key that was ever provisioned. Keep `.env.local` ignored; never paste it into agent-visible output.
- **Suggested command**: `/harden`.

### P0-2: MCP/v1 entry mutation paths have missing write-scope guards

- **Location**: Existing security audit cites `api/mcp.ts:388`, `api/mcp.ts:497`, `api/v1.ts:278`, `api/v1.ts:312`.
- **Category**: Security / Authorization.
- **Impact**: Read checks verify entry/brain access, but final service-role mutations are not always scoped by both `id` and `brain_id` or `user_id`. Service-role bypasses RLS, so a future logic bug or race becomes a cross-entry mutation risk.
- **Recommendation**: Scope every service-role mutation with the same ownership constraints used in the read check. Do not rely on "we already checked above" for destructive writes.
- **Suggested command**: `/harden`.

### P0-3: `brain_vault_grants` can enumerate grants by arbitrary `brain_id`

- **Location**: Existing security audit cites `api/user-data.ts:1665–1675`.
- **Category**: Security / Vault authorization.
- **Impact**: Any authenticated caller with a known brain UUID can request grant rows for that brain without proving membership/ownership. Wrapped DEKs are still encrypted, but the endpoint leaks vault-sharing metadata and creates unnecessary cryptographic material exposure.
- **Recommendation**: Require `checkBrainAccess(user.id, brainId)` before brain-scoped grant reads. Default to returning only the caller's own grant rows unless the caller is owner.
- **Suggested command**: `/harden`.

### P0-4: OAuth provider tokens silently store plaintext when encryption env is absent

- **Location**: `api/_lib/gmailTokenCrypto.ts:10`, `api/_lib/gmailTokenCrypto.ts:23`, `api/_lib/gmailTokenCrypto.ts:34`; `.env.example` lacks `OAUTH_TOKEN_ENCRYPTION_KEY`.
- **Category**: Security / Credential storage.
- **Impact**: `encryptToken()` returns plaintext if `OAUTH_TOKEN_ENCRYPTION_KEY` or `GMAIL_TOKEN_ENCRYPTION_KEY` is absent. The helper refuses to decrypt encrypted values without a key, but new writes can still land unencrypted. `.env.example` does not list the token encryption key, while `EverionMindLaunch/Ops/env-vars.md` does. That mismatch is a production footgun.
- **Recommendation**: Make missing token encryption key a hard startup/write failure in production. Add `OAUTH_TOKEN_ENCRYPTION_KEY` to `.env.example`, Vercel env, and launch checklist. Add a migration/audit query to detect plaintext OAuth tokens already stored.
- **Suggested command**: `/harden`.

## P1 Major Findings

### P1-1: `api/user-data.ts` buffers raw request bodies with no size cap before dispatch

- **Location**: `api/user-data.ts:34`, `api/user-data.ts:36`, `api/user-data.ts:75`.
- **Category**: Stability / DoS.
- **Impact**: `bodyParser: false` plus `bufferBody()` concatenates the full request into memory before resource routing, auth, or JSON parsing. A large request to any `user-data` route, including public-ish status/webhook paths, can force memory allocation and tie up a Vercel function.
- **Recommendation**: Add a hard byte cap inside `bufferBody()` and abort when exceeded. Apply smaller caps for normal JSON routes and explicit caps for webhook raw bodies. Rate limiting should happen before expensive buffering where possible.
- **Suggested command**: `/harden`.

### P1-2: Test suite is failing in release-relevant areas

- **Location**: `npm run test`.
- **Category**: Stability / Test confidence.
- **Impact**: 30 failures across `tests/api/llm.test.ts`, `tests/api/vault-entries.test.ts`, `tests/components/DetailModal.test.tsx`, `tests/components/MobileHeader.test.tsx`, `src/components/__tests__/EntryList.test.tsx`, and `tests/hooks/useVaultOpsTemplates.test.ts`. These are not harmless cosmetic failures: vault entry contracts, active brain assumptions, dialog accessibility, transcribe API shape, and virtualization test mocks are all drifting.
- **Recommendation**: Make the suite green before launch. For stale tests, update test fixtures. For real contract changes, fix the implementation. Keep `npm run test` in the release gate.
- **Suggested command**: `/harden`.

### P1-3: Gmail and enrichment cron paths are not scale-safe

- **Location**: Existing stability audit cites `api/_lib/gmailScan.ts:2309`, `api/_lib/gmailScan.ts:1466`, `api/_lib/gmailScan.ts:1821`, `api/_lib/enrich.ts:1855`.
- **Category**: Stability / Scale.
- **Impact**: Unbounded `Promise.all`, fire-and-forget work after Vercel responses, and full-table brain scans will break once real users connect Gmail or bulk import. The likely failure mode is partial work with misleading "success" responses.
- **Recommendation**: Add bounded concurrency, user-level timeouts, awaited queues, and pagination. Replace full-table scans with pending-work queries.
- **Suggested command**: `/optimize`.

### P1-4: Public REST `/v1/update` can retype plaintext entries to `secret`

- **Location**: Existing security audit cites `api/v1.ts:260`.
- **Category**: Security / Vault integrity.
- **Impact**: API-key callers can mark normal plaintext entries as `secret`, bypassing the vault encryption flow and causing invisible/unreadable inconsistent data.
- **Recommendation**: Block `type === "secret"` on all non-vault APIs and add a DB-level constraint or trigger to prevent non-vault plaintext secret states.
- **Suggested command**: `/harden`.

### P1-5: API-key rate limiting is IP-centric, not identity-centric

- **Location**: Existing security audit cites `api/_lib/withAuth.ts:175`, `api/mcp.ts:533`, `api/v1.ts:342`.
- **Category**: Security / Abuse resistance.
- **Impact**: NAT users can starve each other, while attackers can spread abuse across keys. Rate limits need to bind to authenticated identity for API-key paths.
- **Recommendation**: After resolving the API key, pass `auth.userId` or `auth.keyId` as the limiter suffix.
- **Suggested command**: `/harden`.

### P1-6: MCP OAuth token endpoint echoes the raw long-lived API key

- **Location**: Existing security audit cites `api/mcp.ts:557`.
- **Category**: Security / Credential exposure.
- **Impact**: MCP clients may log/cache `access_token`; returning the original `em_*` key spreads the long-lived credential into more places.
- **Recommendation**: Exchange raw keys for short-lived opaque tokens. Validate short-lived tokens in MCP calls.
- **Suggested command**: `/harden`.

### P1-7: Entry delete/patch access model allows shared-brain members to mutate too broadly

- **Location**: Existing security audit cites `api/entries.ts:215–223`, `api/entries.ts:341`.
- **Category**: Security / Authorization.
- **Impact**: Fetching an entry by `id` without `user_id` before `requireBrainAccess()` can let members operate on entries in shared brains when ownership semantics intended stricter behavior. This is especially dangerous for hard delete.
- **Recommendation**: Define role policy explicitly: owner/member/viewer permissions. Enforce it in `requireBrainAccess` or a richer `requireBrainRole`.
- **Suggested command**: `/harden`.

### P1-8: Large bundle chunks and heavy lazy assets threaten mobile-first performance

- **Location**: `npm run build`; `dist/assets/exceljs.min-*.js` ~930 KB, `sentry-*.js` ~444 KB, `lib-*.js` ~423 KB, `pdf-*.js` ~405 KB, `Everion-*.js` ~232 KB, `TodoView-*.js` ~206 KB.
- **Category**: Performance / Mobile.
- **Impact**: Build passes, but Vite warns about chunks above 500 KB. For a mobile-first capture app, large first-use feature chunks can cause long interaction stalls on low-end devices.
- **Recommendation**: Run bundle visualizer, verify what is eager vs lazy, and split heavy settings/import/admin surfaces further. Keep capture/home paths lean.
- **Suggested command**: `/optimize`.

### P1-9: Build script uses `shell: true` on Windows

- **Location**: `scripts/build.mjs:41`; build warning from Node `DEP0190`.
- **Category**: Build security / Operational quality.
- **Impact**: Current args are static (`vite build`), so immediate exploitability is low. But the pattern is dangerous: passing args to a child process with shell enabled can become command injection if future dynamic args are added.
- **Recommendation**: Avoid `shell: true`; resolve the Vite binary explicitly for Windows or call through `npx vite build` only if arguments remain static and controlled.
- **Suggested command**: `/harden`.

### P1-10: Dependency audit reports moderate XSS advisory in tooling chain

- **Location**: `npm audit --audit-level=low`; `ip-address <=10.1.0` via `shadcn -> @modelcontextprotocol/sdk -> express-rate-limit`.
- **Category**: Dependency security.
- **Impact**: This appears to be a dev/tooling dependency path rather than runtime app code, but it still fails audit and can affect local tooling or CI. `npm audit fix --force` would downgrade/break `shadcn`, so do not blindly run it.
- **Recommendation**: Pin or upgrade the transitive path when `shadcn` publishes a non-breaking fix, or move `shadcn` to a separately audited dev-only workflow if it is not needed in production builds.
- **Suggested command**: `/harden`.

### P1-11: `/api/entries.ts` is beyond maintainable size for a security-sensitive dispatcher

- **Location**: Existing architecture audit: `api/entries.ts`.
- **Category**: Architecture / Code quality.
- **Impact**: A 1700-line action dispatcher with CRUD, graph, Gmail, persona, merge, sharing, audit, and trash behavior is a bug incubator. Security review becomes local rather than systemic.
- **Recommendation**: Extract handler modules under `api/_lib/handlers/` while preserving the consolidated Vercel function count.
- **Suggested command**: `/extract`.

### P1-12: Supabase service-role header construction is duplicated

- **Location**: Existing architecture audit cites `api/_lib/enrich.ts`, `api/_lib/resolveProvider.ts`, `api/_lib/enrichQuota.ts`, `api/_lib/retrievalCore.ts`, `api/_lib/checkBrainAccess.ts`, `api/user-data.ts`.
- **Category**: Architecture / Secret handling.
- **Impact**: Module-level env capture makes key rotation inconsistent and bypasses the intended `sbHeaders()` source of truth.
- **Recommendation**: Centralize all service-role headers through `_lib/sbHeaders.ts` and add an ESLint restriction against direct `SUPABASE_SERVICE_ROLE_KEY` reads elsewhere.
- **Suggested command**: `/normalize`.

### P1-13: Dialog accessibility regression is visible in tests

- **Location**: `npm run test`; Radix warning in `tests/components/DetailModal.test.tsx`.
- **Category**: Accessibility.
- **Impact**: Radix reports `DialogContent` missing `DialogTitle`. This is a screen-reader contract violation and should not ship in a personal knowledge app handling private content.
- **Recommendation**: Ensure every dialog has a visible or `VisuallyHidden` title, and add tests for title/description wiring.
- **Suggested command**: `/harden`.

## P2 Minor Findings

### P2-1: README still documents Anthropic as default provider

- **Location**: `README.md:29–31`; `AGENTS.md:74`; `CLAUDE.md:187`.
- **Category**: Docs / Operational correctness.
- **Impact**: The repo guidance says Gemini is active, but README still lists Anthropic as default. Operators following README may provision the wrong key or miss Gemini.
- **Recommendation**: Update README and `.env.example` to match Gemini-first production reality.
- **Suggested command**: `/clarify`.

### P2-2: `.env.example` omits several production-critical secrets

- **Location**: `.env.example`; `EverionMindLaunch/Ops/env-vars.md`.
- **Category**: Configuration.
- **Impact**: `OAUTH_TOKEN_ENCRYPTION_KEY` is documented in ops but absent from `.env.example`. Missing envs become silent plaintext token writes or disabled features.
- **Recommendation**: Regenerate `.env.example` from `Ops/env-vars.md` and mark which are required for production vs optional.
- **Suggested command**: `/harden`.

### P2-3: Public status endpoint exposes internal dependency health

- **Location**: Existing security audit cites `api/user-data.ts:1175–1188`.
- **Category**: Security / Reconnaissance.
- **Impact**: Public `db` and `ai` booleans help attackers time incidents or outages.
- **Recommendation**: Public status should expose only coarse availability; keep details in auth-gated `/api/health`.
- **Suggested command**: `/harden`.

### P2-4: Search cache has unbounded in-memory growth

- **Location**: Existing stability audit cites `api/search.ts:15–23`.
- **Category**: Stability / Memory.
- **Impact**: Warm serverless instances can accumulate unique search keys without eviction.
- **Recommendation**: Add max size and TTL deletion on miss.
- **Suggested command**: `/optimize`.

### P2-5: Import path allows huge metadata objects per entry

- **Location**: `api/transfer.ts:54–133`.
- **Category**: Stability / Data validation.
- **Impact**: Titles/content are clamped, but `metadata` accepts any object without a byte-size limit. A batch of 2000 rows with very large metadata can inflate DB writes and later UI JSON parsing.
- **Recommendation**: Enforce a metadata byte cap per row, mirroring `api/user-data.ts` brain metadata max behavior.
- **Suggested command**: `/harden`.

### P2-6: API request bodies are typed as `any`

- **Location**: Existing architecture audit cites `api/_lib/types.ts:6`.
- **Category**: Code quality.
- **Impact**: TypeScript cannot protect handler boundaries. Every endpoint relies on manual validation discipline.
- **Recommendation**: Change request body type to `unknown` and validate with Zod or focused guards at each boundary.
- **Suggested command**: `/harden`.

### P2-7: App-level PIN is not a serious local attacker boundary

- **Location**: `src/lib/pin.tsx:18`, `src/lib/pin.tsx:30–41`, `src/lib/pin.tsx:106`.
- **Category**: Security / Local protection.
- **Impact**: The PIN is four digits, localStorage-backed, and server-verified when online. This is acceptable as a UX lock, not as a strong device-compromise control. Marketing or UI copy must not oversell it as encryption.
- **Recommendation**: Label it as app lock. For high-security mode, require vault passphrase/biometric-backed key unwrap rather than PIN.
- **Suggested command**: `/clarify`.

### P2-8: CSP allows `style-src 'unsafe-inline'`

- **Location**: `vercel.json` CSP.
- **Category**: Security / XSS blast radius.
- **Impact**: Inline styles are common in this app, but `unsafe-inline` weakens CSP. It does not directly allow script execution, but it expands what injected markup can do visually.
- **Recommendation**: Long-term, move inline styles to tokens/classes or adopt nonces/hashes where possible.
- **Suggested command**: `/normalize`.

## P3 Polish / Follow-Up

### P3-1: PWA manifest colors still use deprecated cool-dark palette

- **Location**: `vite.config.js` manifest `theme_color` and `background_color`.
- **Category**: Theming / Brand consistency.
- **Impact**: Design context says warm editorial palette, but PWA shell still uses `#0f0f23`.
- **Recommendation**: Update manifest colors to warm charcoal/amber tokens.
- **Suggested command**: `/normalize`.

### P3-2: MCP discovery accepts broad methods

- **Location**: Existing security audit cites `api/mcp.ts:536`.
- **Category**: Protocol correctness.
- **Impact**: Low exploitability, but discovery endpoints should be GET-only.
- **Recommendation**: Add method checks.
- **Suggested command**: `/harden`.

### P3-3: Structured logging is inconsistent for audit operations

- **Location**: Existing security/architecture audits cite `api/entries.ts:232`, `api/entries.ts:267`, `api/entries.ts:399`.
- **Category**: Observability.
- **Impact**: Free-form logs are harder to query in incident response.
- **Recommendation**: Route all audit events through `createLogger()`.
- **Suggested command**: `/normalize`.

### P3-4: `npm run build` succeeds but emits large-chunk warning noise

- **Location**: Build output.
- **Category**: Developer experience.
- **Impact**: Persistent warnings train operators to ignore build output.
- **Recommendation**: Either fix chunking or set an intentional chunk warning threshold with an explanation.
- **Suggested command**: `/optimize`.

## Positive Findings

- `npm run typecheck` and `npm run lint` are clean.
- Production build succeeds.
- Baseline security headers exist in `vercel.json`, including CSP, HSTS, `X-Frame-Options`, `nosniff`, referrer policy, COOP, CORP, and permissions policy.
- Rate limiting fails closed on Vercel when Upstash is absent, which is the right production posture.
- OAuth state signing is present and previous URL-token leakage appears addressed.
- Vault crypto uses AES-GCM, PBKDF2 with 310k iterations for vault passphrases, client-side encryption, and per-brain DEK wrapping for sharing.
- The codebase already has focused tests around several important behaviors; the problem is current drift, not absence of a test culture.

## Recommended Remediation Order

1. **P0 `/harden`** — Rotate any exposed local secrets if this transcript or `.env.local` content left the machine.
2. **P0 `/harden`** — Fix service-role mutation guards in MCP/v1/entries and `brain_vault_grants`.
3. **P0 `/harden`** — Make OAuth token encryption mandatory in production and detect plaintext legacy rows.
4. **P1 `/harden`** — Add byte caps to `api/user-data.ts` raw body buffering.
5. **P1 `/harden`** — Make `npm run test` green, prioritizing vault/API/a11y failures.
6. **P1 `/optimize`** — Bound Gmail/enrichment cron concurrency and paginate full-table scans.
7. **P1 `/extract`** — Split `api/entries.ts` into handler modules without adding Vercel functions.
8. **P1 `/normalize`** — Centralize Supabase service-role header generation and block direct key reads by lint rule.
9. **P2 `/clarify`** — Align README, `.env.example`, and Ops env docs with Gemini-first production config.
10. **Final `/polish`** — Re-run this audit and tighten remaining P2/P3 items after P0/P1 fixes.

Re-run `/audit` after fixes to see the score improve.
