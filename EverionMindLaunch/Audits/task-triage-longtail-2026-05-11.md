# Triage — Long-tail launch docs (2026-05-11)

> Scope: 265 open `[ ]` boxes across 19 supporting docs (launch-day checklist, consolidated audit, billing spec, legal trio, vendors, mobile, brand, support).
> Categories: **M** Manual (operator hands) · **C** Code · **D** Decision · **S** Stale (deleted feature / already shipped / future-work / duplicate).

## Summary

| Source | M | C | D | S | Total |
|---|---:|---:|---:|---:|---:|
| `marketing/ProductHunt/launch-day-checklist.md` | 76 | 0 | 2 | 0 | 78 |
| `Audits/CONSOLIDATED-AUDIT.md` | 5 | 19 | 1 | 11 | 36 |
| `Specs/billing-revenuecat.md` | 33 | 0 | 0 | 2 | 35 |
| `Legal/privacy-tos-launch.md` | 9 | 4 | 0 | 2 | 15 |
| `Legal/trademarks-domains.md` | 10 | 0 | 5 | 0 | 15 |
| `Legal/pricing-billing.md` | 6 | 2 | 2 | 0 | 10 |
| `Ops/vendors.md` | 7 | 0 | 0 | 1 | 8 |
| `Specs/play-console-submission.md` | 8 | 0 | 0 | 0 | 8 |
| `Mobile/capacitor-build.md` | 6 | 0 | 0 | 1 | 7 |
| `Specs/shared-brain-notifications.md` | 6 | 0 | 0 | 1 | 7 |
| `Brand/assets.md` | 4 | 0 | 2 | 0 | 6 |
| `Brand/press-kit.md` | 5 | 1 | 0 | 0 | 6 |
| `marketing/ProductHunt/hunter-outreach.md` | 0 | 0 | 0 | 6 | 6 |
| `Ops/disaster-recovery.md` | 6 | 0 | 0 | 0 | 6 |
| `Support/abuse-moderation.md` | 4 | 2 | 0 | 0 | 6 |
| `marketing/ProductHunt/maker-comment.md` | 5 | 0 | 0 | 0 | 5 |
| `Mobile/ios-submission.md` | 0 | 0 | 0 | 5 | 5 |
| `Specs/android-qa-matrix.md` | 3 | 0 | 0 | 0 | 3 |
| `Support/faq.md` | 1 | 1 | 0 | 1 | 3 |
| **TOTAL** | **194** | **29** | **12** | **30** | **265** |

**Top-line recommendation:** 73% of the open boxes are operator-hand work, not code — launch day is gated on you doing stuff with your hands (writing tweets, configuring dashboards, registering trademarks, testing IAP), not on a backlog of dev tickets. Only 29 boxes (11%) are actual code. Of those, the 12 P0/P1 security items in CONSOLIDATED-AUDIT are the only ones that must land before public launch — and ~half of them reference deleted Gmail/Calendar code (stale). The real next-action stack is tiny: lock the brand name + domain, finish the security PATCHs in `entries.ts`, get the privacy policy lawyer-reviewed, ship Play Store, and prep launch-day assets. Everything else is sequencing.

## Per-task verdicts, grouped by folder

### marketing/ (3 files, 89 total)

#### `marketing/ProductHunt/launch-day-checklist.md` (78 — 76M / 2D)

All 78 entries are operator-hand actions on launch day: posting, tweeting, alarm-setting, screenshot-grabbing, replying. Two items are decisions disguised as actions:

- `D launch-day-checklist.md:18` — Confirm Play Store approved + production rollout 100%. *Decision: rollout cadence (10% → 50% → 100%) vs full-100% release. Currently no decision recorded.*
- `D launch-day-checklist.md:19` — Confirm App Store approved (or pivot day-of). *Decision deferred to Phase 6 per playbook — already non-blocking; should be marked [x] N/A for launch day.*

All others are M and stay as-is. The doc is correct, just unactioned because launch day hasn't happened.

#### `marketing/ProductHunt/maker-comment.md` (5 — 5M)

- `M maker-comment.md:69` — Update date if iOS isn't live launch-day. (Per launch plan iOS is deferred → just delete the iOS bullet, not a date update.)
- `M maker-comment.md:70` — Update Hobby/Starter/Pro pricing. Pricing now Hobby/Starter/Pro (Pro = $9.99/mo). Worth a single edit pass.
- `M maker-comment.md:71` — Read out loud.
- `M maker-comment.md:72` — Trusted-reader sanity check.
- `M maker-comment.md:73` — Save to launch-day notes.

#### `marketing/ProductHunt/hunter-outreach.md` (6 — 6S)

Every "open box" here is a *criterion definition*, not a task — they're describing what to look for in a hunter ("PH karma top ~500", "hunted PKM apps", "≥5K Twitter followers" etc.). The actual to-do is "pick a hunter" which lives elsewhere. **All six should be converted to plain bullets or moved into a heading** — they were never tasks. Mark `[x]` or restructure the doc; either way they don't belong in the operator's to-do count.

### Audits/CONSOLIDATED-AUDIT.md (36 — 5M / 19C / 1D / 11S)

The audit doc mixes shipped items (in a leading `Highest-Value Next Fixes` block where `[x]` items are intentionally still listed) with two pre-launch checklists at lines 5317 and 5334.

- `M CONSOLIDATED-AUDIT.md:48` — P1 operator gates (Vercel Pro, branch protection, env verification, Sentry alerts, uptime, Supabase breached-password, status page). Composite M task — split out.
- `M CONSOLIDATED-AUDIT.md:1465` — Rotate Supabase service-role + Gemini + Upstash + cron secrets if `.env.local` left the machine. Operator judgement call.
- `M CONSOLIDATED-AUDIT.md:1469` — Add `OAUTH_TOKEN_ENCRYPTION_KEY` to Vercel + run `oauth-token-plaintext-audit.sql`. Mostly manual (dashboard + SQL run).
- `M CONSOLIDATED-AUDIT.md:5610` — "All FAIL items resolved" — meta checkbox, marked at audit close.
- `M CONSOLIDATED-AUDIT.md:5611` — "All WARN items tracked in LAUNCH_CHECKLIST.md" — meta checkbox.
- `D CONSOLIDATED-AUDIT.md:5612` — Stakeholder approval (single-operator project — flip to `[x]` immediately; explicit per the parenthetical).

Refactor items (C, useful but not launch-blocking):
- `C CONSOLIDATED-AUDIT.md:1314` — `withRoute({ auth, rateLimit, headers, dispatch })` adoption.
- `C CONSOLIDATED-AUDIT.md:1315` — Resource dispatch extraction for `user-data.ts`/`entries.ts`/`mcp.ts`. *Partly shipped: `api/_lib/handlers/{entryDelete,entryMerge,entryPersona}.ts` already exist.*
- `C CONSOLIDATED-AUDIT.md:1316` — Vault security orchestrator (RFC-first).
- `C CONSOLIDATED-AUDIT.md:1317` — Vault ops hook split (gated on orchestrator).
- `C CONSOLIDATED-AUDIT.md:1318` — Capture pipeline split.
- `C CONSOLIDATED-AUDIT.md:1319` — ProfileTab decomposition.

P0/P1 launch-blocking code (C):
- `C CONSOLIDATED-AUDIT.md:5321` — Lock down PATCHs (`mcp.ts:497,388`, `v1.ts:278,312`, `entries.ts:215,341`).
- `C CONSOLIDATED-AUDIT.md:5322` — Fix `brain_vault_grants` leak (`user-data.ts:1665`).
- `C CONSOLIDATED-AUDIT.md:5323` — Block `type=secret` on `/v1/update` (`v1.ts:260`).
- `C CONSOLIDATED-AUDIT.md:5324` — Strip vault entries from shared-entry overlay (`entries.ts:175`).
- `C CONSOLIDATED-AUDIT.md:5327` — Paginate `enrichAllBrains` cursor (`enrich.ts:1855`).
- `C CONSOLIDATED-AUDIT.md:5329` — Extract `isAdminUser` to single module.
- `C CONSOLIDATED-AUDIT.md:5330` — JWT cache TTL drop 30s → 5–10s (`verifyAuth.ts:7`).
- `C CONSOLIDATED-AUDIT.md:5332` — Fix open-redirect in lemon-checkout `successUrl` (`user-data.ts:2939`).
- `C CONSOLIDATED-AUDIT.md:5336` — Key `withApiKey` rate-limit on `userId:path`.
- `C CONSOLIDATED-AUDIT.md:5337` — Stop echoing raw `em_*` as OAuth `access_token` (`mcp.ts:557`).
- `C CONSOLIDATED-AUDIT.md:5338` — Replace `_cache` in `search.ts` with sized LRU.
- `C CONSOLIDATED-AUDIT.md:5339` — Bound `handleEmptyTrash`/`handleBulkPatch` with chunked deletes.
- `C CONSOLIDATED-AUDIT.md:5341` — Audit-log writes for `merge_into`.
- `C CONSOLIDATED-AUDIT.md:5343` — Centralise `SB_HDR`/`hdrs()` into `sbHeaders.ts`.
- `C CONSOLIDATED-AUDIT.md:5344` — Remove `OAUTH_STATE_SECRET` fallback to service-role.
- `C CONSOLIDATED-AUDIT.md:5345` — Strip unused CSP providers (openrouter, groq).
- `C CONSOLIDATED-AUDIT.md:5346` — Replace `console.log` audit lines with `log.info`.

Stale (S) — references deleted Gmail/Calendar code per the May trim:
- `S CONSOLIDATED-AUDIT.md:1313` — Full LLM boundary migration calls out Gmail/persona/Gmail-scan/feedback/retrieval. Gmail/Calendar paths are deleted; this list is half-stale. Refresh scope before assigning.
- `S CONSOLIDATED-AUDIT.md:5325` — Bound Gmail scan concurrency (`gmailScan.ts:2309`). *File doesn't exist.*
- `S CONSOLIDATED-AUDIT.md:5326` — Await auto-accept enrichment in `gmailScan.ts:1466,1821`. *File doesn't exist.*
- `S CONSOLIDATED-AUDIT.md:5328` — Bound `persistMatches` Gemini fan-out in `gmailScan.ts:1281`. *File doesn't exist.*
- `S CONSOLIDATED-AUDIT.md:5331` — Anthropic-fallback paths in `gmailScan.ts:906` and `gmail.ts:53`. *Both files deleted.*
- `S CONSOLIDATED-AUDIT.md:5340` — `upsertGmailContact` race. *Deleted with Gmail.*
- `S CONSOLIDATED-AUDIT.md:5342` — `runGeminiBatch` in `handleAudit`. *Audit action lived in Gmail flow — verify path still exists; if not, stale.*
- (S × 5 more) — the `[ ]` block at lines 1313–1319 contains items that are scoped under "Defer Unless A Specific Symptom Appears" in the surrounding prose — they're explicitly deferred, not active tasks. Either flip to `[x] (deferred)` or restructure to be plain text.

### Specs/ (3 files, 50 total)

#### `Specs/billing-revenuecat.md` (35 — 33M / 0C / 0D / 2S)

This is a dashboard + sandbox-test setup checklist. Almost every line is operator hands on RevenueCat / App Store Connect / Play Console / a real device.

- `M billing-revenuecat.md:70–80` (10 items) — RevenueCat dashboard setup (apps, products, entitlements, offerings, paywall, webhook, secret key).
- `S billing-revenuecat.md:84–90` (7 items) — Apple App Store Connect setup. **iOS deferred to Phase 6** per playbook — mark these section-stale until iOS spin-up.
- `M billing-revenuecat.md:94–98` (5 items) — Play Console subscriptions config.
- `M billing-revenuecat.md:126–138` (13 items) — Sandbox purchase test flow on device.

#### `Specs/play-console-submission.md` (8 — 8M)

Pure submission gate. Every box is a Play Console form field or upload action.

#### `Specs/shared-brain-notifications.md` (7 — 6M / 1S)

- `S shared-brain-notifications.md:162` — "Migration 075 + 076 applied on staging". *Verify against `supabase/migrations/`; the latest applied is 086. If 075/076 already in prod, mark `[x]`.*
- `M shared-brain-notifications.md:163–168` (6 items) — Acceptance tests run on real devices (push delivery, prefs, cron idempotency, mid-cycle membership). Manual QA.

#### `Specs/android-qa-matrix.md` (3 — 3M)

All three are status flips after running the QA matrix on a real Android device. Manual.

### Legal/ (3 files, 40 total)

#### `Legal/privacy-tos-launch.md` (15 — 9M / 4C / 0D / 2S)

- `M Legal/privacy-tos-launch.md:150` — Find lawyer / use Termly+lawyer.
- `M :151` — Privacy policy draft → lawyer → publish.
- `M :152` — ToS draft → lawyer → publish.
- `C :153` — Cookie banner with consent-before-analytics. Code.
- `C :154` — Link privacy from signup, not just footer. Code.
- `M :155` — Reconcile claims vs code (encryption/deletion). Manual audit pass.
- `M :156` — Inbox forwarding for privacy@/support@/abuse@/appeals@.
- `C :157` — Version-control policy pages (audit trail).
- `M :158` — Sync if `Legal/ai-disclosure.md` changes.
- `M :162` — Lock brand name + legal entity. *Duplicate of trademarks-domains:95.*
- `M :163` — Lawyer review.
- `M :164` — Publish.
- `M :165` — Email early users.
- `S :166` — Build versioning system. *Dup of :157.*
- `C :167` — `audit_log` entry on policy change.

#### `Legal/trademarks-domains.md` (15 — 10M / 0C / 5D)

- `D :56` — `.com` available decision (requires name lock first).
- `M :57` — TM search SA + US + EU (Class 9 + 42).
- `M :58` — App Store + Play Store search.
- `M :59` — Twitter/X handle check.
- `M :60` — LinkedIn company page.
- `M :61–63` — Linguistic + reputation checks.
- `D :95` — Lock brand name. **The single biggest unblocker in this whole list.**
- `M :96` — Buy domain variants.
- `D :97` — File trademark (SA + US, Class 9 + 42). Decision: file pre-launch yes/no.
- `D :98` — Register (Pty) Ltd; assign IP. Decision: do this before or after first revenue.
- `M :99` — Cloudflare DNS setup.
- `M :100` — Google Alerts.
- `D :101` — TM monitor service post-launch. Decision: which vendor.

#### `Legal/pricing-billing.md` (10 — 6M / 2C / 2D)

- `D :163` — Lock tier limits (captures, brains, members, vault items). **Hard launch blocker.**
- `D :164` — Lock pricing ZAR + USD vs competitors.
- `M :165` — Wire LemonSqueezy live mode.
- `M :166` — Wire RevenueCat live mode both platforms.
- `M :167` — Test prorate on Pro → Max upgrade.
- `M :168` — Test downgrade → period-end.
- `M :169` — Test failed-card dunning.
- `C :170` — Build pricing page at `everion.smashburgerbar.co.za/pricing`.
- `C :171` — Customer portal link in Settings → Billing.
- `M :172` — Tax registration check with accountant.

### Ops/ (2 files, 14 total)

#### `Ops/vendors.md` (8 — 7M / 1S)

- `M :98` — Every key in `Ops/env-vars.md` set in Vercel `production`. Manual audit.
- `M :99` — DNS SPF/DKIM/DMARC verified at Resend.
- `M :100` — Supabase Pro upgrade.
- `M :101` — Vercel Pro upgrade.
- `M :102` — LemonSqueezy live mode for 3 variant IDs.
- `M :103` — RevenueCat sandbox-tested both platforms.
- `S :104` — Google OAuth out of "testing" mode. *Stale — Gmail integration removed in the May trim; if Google OAuth is no longer used for any feature, this is moot. Verify whether sign-in-with-Google still uses it.*
- `M :105` — Bookmark vendor status pages.

#### `Ops/disaster-recovery.md` (6 — 6M)

All six are physical-hand operator drills (test backup restore, snapshot env vars to 1Password, snapshot DNS, document collaborators, test rollback, verify `db-backup` ran). These are the most-skipped, highest-leverage launch items.

### Mobile/ (2 files, 12 total)

#### `Mobile/capacitor-build.md` (7 — 6M / 1S)

- `S :231` — iOS app builds + runs. *iOS deferred Phase 6.*
- `M :232` — Android builds + runs. Required for Play Store.
- `M :233` — Push notifications work end-to-end both platforms (Android only pre-launch).
- `M :234` — Biometric vault unlock iOS Face ID + Android fingerprint. (Android only.)
- `M :235` — IAP sandbox both platforms. (Android only.)
- `M :236` — Universal Links for invite emails.
- `M :237` — App icon at all sizes.

#### `Mobile/ios-submission.md` (5 — 5S)

Entire file is iOS-submission gating. **iOS deferred to Phase 6 post-launch.** Every item here should be marked stale-for-pre-launch — not deleted, but tagged "Phase 6" in the file's heading.

### Brand/ (2 files, 12 total)

#### `Brand/assets.md` (6 — 4M / 2D)

- `D :86` — Finalize brand name (working: "Evara Mind"). **Same decision as trademarks-domains:95.**
- `M :87` — Commission/design final logomark.
- `D :88` — Lock color tokens (with WCAG check). Operator can decide; check is automated.
- `M :89` — Lock display font (license-cleared).
- `M :90` — Ship press-kit page.
- `M :91` — Generate full app-icon set.

#### `Brand/press-kit.md` (6 — 5M / 1C)

- `M :88` — Final brand name + domain locked. *Dup decision.*
- `M :89` — Headshot taken.
- `M :90` — Screenshots final.
- `M :91` — Press email forwarded + auto-reply.
- `C :92` — Build `/press` page and index it.
- `M :93` — Bundle ZIP generated and hosted.

### Support/ (2 files, 9 total)

#### `Support/abuse-moderation.md` (6 — 4M / 2C)

- `M :108` — `abuse@` and `appeals@` inboxes set up.
- `C :109` — In-app Report button on shared-brain content.
- `C :110` — `app_metadata.banned` wired to auth gate.
- `M :111` — Saved investigation template.
- `M :112` — NCMEC reporting account (only if public shared content ships).
- `M :113` — Privacy policy + ToS reflect this. (Dup of legal lawyer-review thread.)

#### `Support/faq.md` (3 — 1M / 1C / 1S)

- `C :87` — Build `/help` page that renders this file.
- `M :88` — Add screenshots inline.
- `S :89` — Translate to other languages (post-launch). Move to BRAINSTORM.

## Stale items to mark [x] or delete immediately

### Already shipped (mark [x])

- `Audits/CONSOLIDATED-AUDIT.md:5612` — "Stakeholder approval obtained (single-operator project — implicit)" — flip to `[x]` now.
- `Specs/shared-brain-notifications.md:162` — Migration 075 + 076 (latest applied is 086 per recent commit; verify and flip).
- `Audits/CONSOLIDATED-AUDIT.md:1315` — Resource dispatch extraction already partly shipped (`api/_lib/handlers/{entryDelete,entryMerge,entryPersona}.ts` exist). Flip to `[~]` partial.

### References deleted features (delete the row or strikethrough)

- `Audits/CONSOLIDATED-AUDIT.md:5325` — `gmailScan.ts:2309` — file gone.
- `Audits/CONSOLIDATED-AUDIT.md:5326` — `gmailScan.ts:1466,1821` — file gone.
- `Audits/CONSOLIDATED-AUDIT.md:5328` — `gmailScan.ts:1281` — file gone.
- `Audits/CONSOLIDATED-AUDIT.md:5331` — `gmailScan.ts:906` + `gmail.ts:53` — both files gone.
- `Audits/CONSOLIDATED-AUDIT.md:5340` — `upsertGmailContact` race — function gone with Gmail.
- `Audits/CONSOLIDATED-AUDIT.md:5342` — `runGeminiBatch` in `handleAudit` — verify the audit action; if Gmail-only, delete.
- `Audits/CONSOLIDATED-AUDIT.md:1313` — LLM boundary migration scope is half-stale (Gmail, Gmail-scan paths gone). Refresh scope to retrieval + persona + feedback only.
- `Ops/vendors.md:104` — Google OAuth "testing mode" — only relevant if sign-in-with-Google still ships; verify and either flip or delete.
- `Mobile/ios-submission.md` (entire file, 5 items) — iOS deferred to Phase 6. Don't delete the file; add a `> Phase 6 (post-launch).` banner at the top so the dashboard stops counting these as open pre-launch tasks.
- `Specs/billing-revenuecat.md:84–90` (7 iOS Apple Store Connect items) — same Phase 6 banner under the iOS subsection.
- `Mobile/capacitor-build.md:231` — iOS device build, same.

### Duplicates (point to canonical, delete dup)

- `Brand/assets.md:86` ≡ `Brand/press-kit.md:88` ≡ `Legal/privacy-tos-launch.md:162` ≡ `Legal/trademarks-domains.md:95` — **all four are "lock the brand name"**. Canonical: `Legal/trademarks-domains.md:95`. Delete the other three; reference back.
- `Legal/privacy-tos-launch.md:166` ≡ `:157` — "build versioning system for legal pages" duplicates "version-control the policy pages". Delete `:166`.
- `Support/abuse-moderation.md:113` ≡ `Legal/privacy-tos-launch.md:151+152` — privacy+ToS reflect moderation policy is part of the lawyer-reviewed draft. Delete `:113`.

### "Future work" that should not block launch (move to BRAINSTORM.md)

- `Support/faq.md:89` — Translate FAQ to other languages.
- `Legal/trademarks-domains.md:101` — TM monitor service. Mark post-launch.
- `Audits/CONSOLIDATED-AUDIT.md:1316–1319` — RFC-gated refactors (vault orchestrator, vault hook split, capture split, ProfileTab decomp). Move to a `EML/Refactors/` queue; they're not launch-blocking.

### Restructure (these are spec criteria, not tasks)

- `marketing/ProductHunt/hunter-outreach.md:13–18` (all 6) — They define what a good hunter looks like, not work to do. Convert to bullets or sub-headings. The actual task ("pick a hunter and DM them") lives in `launch-day-checklist.md`.

## Top 5 items the operator should actually work on next

Ranked by launch-readiness leverage. Each one unblocks ≥3 downstream tasks.

1. **Lock the brand name.** `Legal/trademarks-domains.md:95`. Unblocks: domain purchases, trademark filings, logomark commission, press kit, privacy policy headers, app store listings, social handles, App ID strings. Currently 4 separate `[ ]` boxes across 4 docs are blocked on this one decision. Today, not "next week".

2. **Land the P0 security PATCHs in `entries.ts` / `v1.ts` / `mcp.ts` / `user-data.ts`.** `CONSOLIDATED-AUDIT.md:5321–5324` plus the open-redirect at `:5332`. Five surgical one-line `user_id` filter additions. This is the only audit work that's actually launch-blocking (auth bypass, vault leak, open redirect). Estimated 2–3 hours total.

3. **Lock pricing tiers + limits.** `Legal/pricing-billing.md:163–164`. Required to write LemonSqueezy variants live, finish RevenueCat offerings, write the pricing page, and update `maker-comment.md:70`. Decision unblocks 6+ downstream tasks.

4. **Privacy policy + ToS lawyer review and publish.** `Legal/privacy-tos-launch.md:150–153`. Long lead time (lawyer SLA). Start now even though it sits in the M column — every day delayed pushes launch back. Must precede Play Store submission (requires Privacy URL).

5. **Test the DB backup restore + verify last `db-backup` ran.** `Ops/disaster-recovery.md:64+:69`. The two most-skipped items on the list. If your `db-backup` workflow is silently broken, you don't know until you need it. 30 minutes of work, infinite downside if skipped.

## Per-folder archive recommendations

| Folder | Recommendation | Justification |
|---|---|---|
| `marketing/ProductHunt/` | **KEEP-ALL** | Launch hub. 78 boxes in `launch-day-checklist.md` are exactly the operator runbook for launch day. Touch nothing. `hunter-outreach.md` needs a structural refactor (criteria ≠ tasks). |
| `Audits/` | **TRIM** | The two trailing `[ ]` blocks at lines 5317 and 5334 should split out into a standalone `Audits/launch-blocking-security-2026-05-11.md` (the 12 P0/P1 items). The body audit text stays as reference. Stale Gmail items get strikethroughs. Refactor items (1313–1319) move to `EML/Refactors/`. |
| `Specs/` | **TRIM** | `billing-revenuecat.md` is a config runbook, valuable — keep but flag iOS section as Phase 6. `play-console-submission.md` is the active submission checklist — keep. `shared-brain-notifications.md` acceptance tests — keep. `android-qa-matrix.md` — keep. `archive/` is fine. |
| `Legal/` | **KEEP-ALL** | All three docs are pre-launch-critical. The duplicate "lock brand name" rows should consolidate but don't delete the files. Add post-launch versioning to `audit_log` is a real ship-blocker for GDPR compliance evidence. |
| `Ops/` | **KEEP-ALL** | `vendors.md` is the env-key + Pro-tier checklist. `disaster-recovery.md` is the under-loved one — do the drills. Verify `Ops/env-vars.md` against deleted Gmail vars (cleanup pass). |
| `Mobile/` | **TRIM + REFRAME** | `ios-submission.md` → add `> Status: Phase 6 (post-launch).` banner so the dashboard stops counting it. `capacitor-build.md` → keep, but strike iOS-only lines pre-launch. |
| `Brand/` | **KEEP-ALL** | Both files have real pre-launch deliverables. Dedupe the "lock brand name" rows to point at `Legal/trademarks-domains.md:95`. |
| `Support/` | **KEEP-ALL** | `abuse-moderation.md` is required for GDPR/ToS coherence. `faq.md` needs the `/help` route to exist; that's a one-day code task. |
