# Triage — Core launch docs (2026-05-11)

Triages every `[ ]` checkbox across the five core launch docs (468 tasks).
M = Manual (operator hands) · C = Code (Claude/dev) · D = Decision (operator
judgement) · S = Stale (deleted feature / duplicate / already done / future
work that doesn't belong on a pre-launch list).

## Summary

| Source | M | C | D | S | Total |
|---|---|---|---|---|---|
| LAUNCH_CHECKLIST.md | 167 | 64 | 4 | 66 | 301 |
| ROADMAP.md | 6 | 38 | 6 | 35 | 85 |
| PLAYBOOK.md | 33 | 5 | 4 | 26 | 68 |
| Roadmap/week-4.md | 6 | 0 | 0 | 0 | 6 |
| Roadmap/beta-phase.md | 7 | 0 | 0 | 1 | 8 |
| **Total** | **219** | **107** | **14** | **128** | **468** |

**Top-line recommendation:** ~27% of the open backlog (128 of 468) is stale —
either superseded by code already shipped, references deleted Gmail/Todo/
Calendar/Contacts subsystems, lives inside `[iOS — DEFERRED]` blocks that
explicitly belong in a post-launch sprint, duplicates other items in the
same doc, or is V2+ future-work parked in "Other backlog" / "Month 3-6" /
"Beyond v0" sections. Delete or `[x]` those today. The remaining 340 items
are dominated by **operator-only manual work** (219 of 340 — dashboard
clicks, env vars, DNS records, screenshots, real-device QA, store metadata)
and **about 107 real code items**. Of the 219 manual items, the bulk are
Android store-prep + post-launch iOS sprint + native-shell testing. There
are only about **20 manual items** that genuinely block opening signups —
those are the ones to do this week (see Top 10 below). Stop treating
ROADMAP.md's 21-day sprint as a live to-do — most of week 1/2 is already
shipped under different names, and week 3 polish overlaps the checklist.

---

## Per-task verdicts

### LAUNCH_CHECKLIST.md (301)

#### Production hardening + manual-operator audits (lines 15-50)

- `M LAUNCH_CHECKLIST.md:15` — P0-1 rotate local/prod secrets (operator action: rotate keys in vendor dashboards).
- `M LAUNCH_CHECKLIST.md:16` — P0-4 add `OAUTH_TOKEN_ENCRYPTION_KEY` to Vercel + run audit SQL (dup of MANUAL-04 line 39).
- `M LAUNCH_CHECKLIST.md:36` — MANUAL-01 Vercel Pro upgrade.
- `M LAUNCH_CHECKLIST.md:37` — MANUAL-02 GitHub main branch protection.
- `M LAUNCH_CHECKLIST.md:38` — MANUAL-03 add `SUPABASE_DB_URL` to GH Actions secrets.
- `S LAUNCH_CHECKLIST.md:39` — MANUAL-04 duplicate of line 16.
- `M LAUNCH_CHECKLIST.md:40` — MANUAL-05 set `APP_ORIGIN` in Vercel prod.
- `M LAUNCH_CHECKLIST.md:41` — MANUAL-06 confirm LS+RC live env vars in Vercel.
- `M LAUNCH_CHECKLIST.md:42` — MANUAL-07 Supabase breached-password protection.
- `M LAUNCH_CHECKLIST.md:43` — MANUAL-08 Sentry alerts (dup of line 265 + 549).
- `M LAUNCH_CHECKLIST.md:44` — MANUAL-09 external uptime monitor.
- `M LAUNCH_CHECKLIST.md:45` — MANUAL-10 external status page (note: in-product `/status` shipped — operator decision whether external one is needed; tag as Decision but conservatively Manual since launch-day signal).
- `M LAUNCH_CHECKLIST.md:46` — MANUAL-11 run DB hardening EXPLAIN ANALYZE checks.
- `M LAUNCH_CHECKLIST.md:47` — MANUAL-12 schedule quarterly RC webhook secret rotation.
- `M LAUNCH_CHECKLIST.md:48` — MANUAL-13 run Lighthouse on prod (dup of line 338 + 592).
- `M LAUNCH_CHECKLIST.md:49` — MANUAL-14 Privacy+ToS legal review (dup of line 579 + 685).
- `M LAUNCH_CHECKLIST.md:50` — MANUAL-15 verify SPF/DKIM/DMARC, hit mail-tester 10/10 (dup of line 368 + 552 + 682).

#### Enrichment audit deferrals (lines 67-77)

- `C LAUNCH_CHECKLIST.md:67` — S-02/A-03 reduce service-role/RLS bypass on entry writes.
- `C LAUNCH_CHECKLIST.md:68` — S-04/E2E-16 DB-backed admin verification + audit log writes.
- `C LAUNCH_CHECKLIST.md:69` — A-02/S-06 audit-log coverage for `/v1/*` + MCP write tools.
- `C LAUNCH_CHECKLIST.md:70` — T-01/E2E-03 hard external timeouts for non-Google providers (Gmail removed but OpenAI/Anthropic/OpenRouter/Groq/Supabase/webhooks remain).
- `C LAUNCH_CHECKLIST.md:71` — A-04/E2E-02/E2E-05 durable async enrichment job path.
- `C LAUNCH_CHECKLIST.md:72` — E2E-07 pending-work indexing for cron sweeps.
- `D LAUNCH_CHECKLIST.md:73` — E2E-10 shared-entry overlay semantics decision.
- `D LAUNCH_CHECKLIST.md:74` — E2E-17 localStorage prompt learning trust model decision.
- `C LAUNCH_CHECKLIST.md:75` — E2E-19 named-entity facts extraction.
- `C LAUNCH_CHECKLIST.md:77` — E2E-22 workflow-level tests (capture, shared-brain, quota, prompt injection, cron starvation).

#### Infrastructure / Security / Telemetry (lines 203-296)

- `M LAUNCH_CHECKLIST.md:203` — Vercel Pro upgrade (dup of line 36 + 545).
- `M LAUNCH_CHECKLIST.md:205` — Supabase Pro upgrade (dup of line 544).
- `M LAUNCH_CHECKLIST.md:218` — add `SUPABASE_DB_URL` to repo secrets (dup of MANUAL-03 line 38 + line 546).
- `M LAUNCH_CHECKLIST.md:221` — trigger DB backup workflow (dup of line 547).
- `M LAUNCH_CHECKLIST.md:224` — confirm SSL grade A + DNS A/AAAA (dup of line 550 + 551).
- `M LAUNCH_CHECKLIST.md:231` — rotate keys exposed in dev sessions (dup of line 15 + 548).
- `M LAUNCH_CHECKLIST.md:265` — configure Sentry alerts (dup of MANUAL-08 + line 549).
- `M LAUNCH_CHECKLIST.md:274` — add 8 GH Actions secrets for weekly roll-up.
- `C LAUNCH_CHECKLIST.md:287` — wire `scripts/weekly-roll-up.ts`.
- `C LAUNCH_CHECKLIST.md:290` — wire `.github/workflows/weekly-roll-up.yml`.
- `M LAUNCH_CHECKLIST.md:293` — dry-run weekly roll-up first send.

#### Billing operator config (lines 308-318) — duplicates of lines 557-561

- `M LAUNCH_CHECKLIST.md:308` — LemonSqueezy live store (dup of line 557).
- `M LAUNCH_CHECKLIST.md:310` — RevenueCat dashboard (dup of line 558).
- `M LAUNCH_CHECKLIST.md:312` — App Store Connect + Play Console products (dup of line 559).
- `M LAUNCH_CHECKLIST.md:316` — subscription cancellation flow test (dup of line 561).
- `M LAUNCH_CHECKLIST.md:318` — end-to-end native sandbox test.

#### Shared-brain notifications (lines 327-334)

- `M LAUNCH_CHECKLIST.md:327` — wire shared-brain expiry fan-out (parent — operator must flip flag + verify; children below are the actual work).
- `M LAUNCH_CHECKLIST.md:330` — set `FEATURE_SHARED_BRAIN_REMINDERS=1` in Vercel.
- `M LAUNCH_CHECKLIST.md:331` — manual test: 2 members, due-date entry, cron-hourly verification.
- `M LAUNCH_CHECKLIST.md:332` — test per-brain `level=off`.
- `M LAUNCH_CHECKLIST.md:333` — test per-brain `level=owner_only`.
- `D LAUNCH_CHECKLIST.md:334` — decide when to roll from beta cohort to production.

#### Quality (lines 338-344)

- `M LAUNCH_CHECKLIST.md:338` — Lighthouse pass on prod (dup of line 48 + 592).
- `M LAUNCH_CHECKLIST.md:340` — E2E suite back to green (dev work — but operator-driven cycle of run/fix/run; tag M because it's "run on machine and read output"; the actual fixes are C work the operator triggers).
- `M LAUNCH_CHECKLIST.md:342` — real-device QA pass (dup of line 577).
- `M LAUNCH_CHECKLIST.md:344` — onboarding test with 3 strangers (dup of line 576).

#### Admin / Email deliverability / Communications (lines 364-382)

- `C LAUNCH_CHECKLIST.md:364` — e2e admin smoke spec (small Playwright test).
- `M LAUNCH_CHECKLIST.md:366` — welcome email tested across clients.
- `M LAUNCH_CHECKLIST.md:368` — email sender SPF/DKIM/DMARC (dup of line 50 + 552 + 682).
- `M LAUNCH_CHECKLIST.md:370` — invite emails inbox-not-spam (parent of children below).
- `M LAUNCH_CHECKLIST.md:372` — DMARC soak-then-tighten.
- `M LAUNCH_CHECKLIST.md:373` — mail-tester score ≥9/10.
- `M LAUNCH_CHECKLIST.md:374` — switch from `noreply@` to a personal from-address.
- `M LAUNCH_CHECKLIST.md:375` — rewrite invite subject + preview text.
- `C LAUNCH_CHECKLIST.md:376` — add plain-text body to invite email (small code change in Resend send call).
- `C LAUNCH_CHECKLIST.md:377` — enable List-Unsubscribe headers.
- `C LAUNCH_CHECKLIST.md:378` — strip CTA links down to invite+unsubscribe only.
- `M LAUNCH_CHECKLIST.md:379` — provision dedicated sending subdomain.
- `M LAUNCH_CHECKLIST.md:380` — warm-up sends to test inboxes.
- `M LAUNCH_CHECKLIST.md:381` — parent-domain blocklist check on mxtoolbox.
- `M LAUNCH_CHECKLIST.md:382` — real-inbox smoke test (Gmail/Outlook/Apple).

#### Performance / Hardening (lines 435-445)

- `M LAUNCH_CHECKLIST.md:435` — bundle size review (`npm run build`; eyeball output).
- `M LAUNCH_CHECKLIST.md:437` — cold-start mitigation: re-run mobile Lighthouse to prove FCP<1.8s / LCP<2.5s.
- `C LAUNCH_CHECKLIST.md:441` — browser private-cache hardening (privacy mode + TTL/encryption for localStorage).
- `M LAUNCH_CHECKLIST.md:445` — re-verify Supabase Disk IO health post 2026-05-07 (run SQL probes — operator-driven query).

#### Shared brains Phase 2+ (lines 471-477) — explicit P2 post-launch backlog

- `S LAUNCH_CHECKLIST.md:471` — Phase 2 invites+members — P2 deferred post-launch (per header line 467).
- `S LAUNCH_CHECKLIST.md:472` — Phase 2 roles — P2 deferred.
- `S LAUNCH_CHECKLIST.md:473` — Phase 2 RLS — P2 deferred.
- `S LAUNCH_CHECKLIST.md:474` — Phase 2 audit-log events — P2 deferred.
- `S LAUNCH_CHECKLIST.md:475` — Phase 3 management UX — P2 deferred.
- `S LAUNCH_CHECKLIST.md:476` — Phase 3 activity feed — P2 deferred.
- `S LAUNCH_CHECKLIST.md:477` — Phase 4 public brains — explicitly "out of scope for 2026".

#### Enrichment Phase 2B+3 (lines 503-511) — explicit P2 deferred

- `S LAUNCH_CHECKLIST.md:503` — Phase 2B async capture — P2 deferred (trigger ~3000-5000 users).
- `S LAUNCH_CHECKLIST.md:511` — Phase 3 Vercel Queues/Inngest — P2 deferred (trigger ~10k+ users).

#### Other backlog (lines 529-532)

- `C LAUNCH_CHECKLIST.md:529` — more e2e specs (calendar persona-facts owed).
- `S LAUNCH_CHECKLIST.md:532` — PostHog cohorts+funnels — explicitly "set up after a week of real data."

#### Owner-only flat to-do (lines 544-572) — duplicates of earlier sections

- `M LAUNCH_CHECKLIST.md:544` — Supabase Pro (dup of line 205).
- `M LAUNCH_CHECKLIST.md:545` — Vercel Pro (dup of line 36 + 203).
- `M LAUNCH_CHECKLIST.md:546` — `SUPABASE_DB_URL` secret (dup of line 38 + 218).
- `M LAUNCH_CHECKLIST.md:547` — trigger first DB backup (dup of line 221).
- `M LAUNCH_CHECKLIST.md:548` — rotate keys (dup of line 15 + 231).
- `M LAUNCH_CHECKLIST.md:549` — Sentry alerts (dup of MANUAL-08 + line 265).
- `M LAUNCH_CHECKLIST.md:550` — SSL grade A (dup of line 224).
- `M LAUNCH_CHECKLIST.md:551` — DNS A+AAAA (dup of line 224).
- `M LAUNCH_CHECKLIST.md:552` — Resend SPF/DKIM/DMARC (dup of line 50 + 368 + 682).
- `M LAUNCH_CHECKLIST.md:553` — customer support channel forwarding.
- `M LAUNCH_CHECKLIST.md:557` — LemonSqueezy live products+env (dup of line 308).
- `M LAUNCH_CHECKLIST.md:558` — RevenueCat dashboard+env (dup of line 310).
- `M LAUNCH_CHECKLIST.md:559` — App Store + Play subscription products (dup of line 312).
- `S LAUNCH_CHECKLIST.md:560` — "VAT handled by merchant of record" — informational, not an action; already true.
- `M LAUNCH_CHECKLIST.md:561` — end-to-end subscription cancellation test (dup of line 316).
- `M LAUNCH_CHECKLIST.md:567` — `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` GH secrets.
- `M LAUNCH_CHECKLIST.md:568` — `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID` GH secrets.
- `M LAUNCH_CHECKLIST.md:569` — `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` GH secrets.
- `M LAUNCH_CHECKLIST.md:570` — `RESEND_API_KEY` GH secret.
- `M LAUNCH_CHECKLIST.md:571` — `WEEKLY_REPORT_TO` GH secret.
- `M LAUNCH_CHECKLIST.md:572` — dry-run weekly roll-up (dup of line 293).

#### People stuff (lines 576-579)

- `M LAUNCH_CHECKLIST.md:576` — onboarding test with 3 strangers (dup of line 344).
- `M LAUNCH_CHECKLIST.md:577` — real-device QA pass (dup of line 342).
- `M LAUNCH_CHECKLIST.md:578` — co-admin on every dashboard (dup of line 700).
- `M LAUNCH_CHECKLIST.md:579` — Privacy+ToS legal review (dup of line 49 + 685).

#### One-time/Performance (lines 588-593)

- `M LAUNCH_CHECKLIST.md:588` — test Supabase backup restore (dup of line 701).
- `M LAUNCH_CHECKLIST.md:592` — run Lighthouse on prod (dup of line 48 + 338).
- `M LAUNCH_CHECKLIST.md:593` — bundle-size eyeball (dup of line 435).

#### Findings — CSP / webhook / settings (lines 631-651)

- `C LAUNCH_CHECKLIST.md:631` — CSP `style-src 'unsafe-inline'` removal (matches line 692 nonce migration).
- `C LAUNCH_CHECKLIST.md:637` — webhook idempotency fail-closed when Upstash missing.
- `D LAUNCH_CHECKLIST.md:651` — settings sidebar density (decision: collapse to 5-6 groups or hide devs behind toggle; only then C).

#### P1 compliance (lines 682-694)

- `M LAUNCH_CHECKLIST.md:682` — sender domain SPF/DKIM/DMARC (dup of line 50 + 368 + 552).
- `M LAUNCH_CHECKLIST.md:685` — Privacy+ToS legal review (dup of line 49 + 579).
- `C LAUNCH_CHECKLIST.md:692` — CSP nonce migration (dup of line 631).
- `C LAUNCH_CHECKLIST.md:694` — audit-log UI surface in `/settings/security`.

#### Ops & bus factor (lines 700-701)

- `M LAUNCH_CHECKLIST.md:700` — co-admin on every dashboard (dup of line 578).
- `M LAUNCH_CHECKLIST.md:701` — test Supabase backup restore (dup of line 588).

#### Mobile — Capacitor wrap (lines 808-907) — Android-first build steps + real-device QA

- `M LAUNCH_CHECKLIST.md:808` — get Android running on a real device (operator must hold device + run).
- `S LAUNCH_CHECKLIST.md:810` — iOS on a real device — `[iOS — DEFERRED]`.
- `M LAUNCH_CHECKLIST.md:818` — real-device testing pass.
- `M LAUNCH_CHECKLIST.md:820` — prepare store assets.
- `M LAUNCH_CHECKLIST.md:822` — submit to internal testing.
- `M LAUNCH_CHECKLIST.md:824` — submit to production stores.
- `M LAUNCH_CHECKLIST.md:828` — app icon + splash (already shipped per line 814; duplicate or stale verification step — mark Manual but flag).
- `M LAUNCH_CHECKLIST.md:829` — safe-area handling on device.
- `M LAUNCH_CHECKLIST.md:830` — no browser-looking UI verification.
- `M LAUNCH_CHECKLIST.md:831` — offline screen verification on device.
- `M LAUNCH_CHECKLIST.md:832` — mobile loading states (skeletons not spinners).
- `M LAUNCH_CHECKLIST.md:833` — mobile auth flow verification.
- `M LAUNCH_CHECKLIST.md:834` — deep-link / magic-link redirects on device.
- `M LAUNCH_CHECKLIST.md:835` — file/photo upload on device.

#### Magic-link / deep links (lines 841-855)

- `C LAUNCH_CHECKLIST.md:841` — add mobile redirect URL schemes (small code+config).
- `M LAUNCH_CHECKLIST.md:844` — configure Supabase redirect URLs in dashboard.
- `C LAUNCH_CHECKLIST.md:845` — register iOS URL scheme in Info.plist `[iOS DEFERRED]` (mark S — covered by post-launch sprint).
- `C LAUNCH_CHECKLIST.md:846` — Android intent filter in AndroidManifest.
- `M LAUNCH_CHECKLIST.md:847` — verify flow end-to-end on device.
- `M LAUNCH_CHECKLIST.md:853` — cold-start case.
- `M LAUNCH_CHECKLIST.md:854` — warm-start case.
- `M LAUNCH_CHECKLIST.md:855` — no leftover browser tab.

#### Capacitor plugins (lines 861-868)

- `C LAUNCH_CHECKLIST.md:861` — `@capacitor/splash-screen`.
- `C LAUNCH_CHECKLIST.md:862` — `@capacitor/app`.
- `C LAUNCH_CHECKLIST.md:863` — `@capacitor/browser`.
- `C LAUNCH_CHECKLIST.md:864` — `@capacitor/network`.
- `C LAUNCH_CHECKLIST.md:865` — `@capacitor/preferences`.
- `C LAUNCH_CHECKLIST.md:866` — `@capacitor/filesystem` (conditional).
- `C LAUNCH_CHECKLIST.md:867` — `@capacitor/camera` (conditional).
- `C LAUNCH_CHECKLIST.md:868` — biometric auth plugin.

#### Session storage / offline / real-device matrix (lines 874-907) — all device-test items

- `M LAUNCH_CHECKLIST.md:874` — sessions persist across restart.
- `M LAUNCH_CHECKLIST.md:875` — logout clears session fully.
- `M LAUNCH_CHECKLIST.md:876` — expired sessions refresh.
- `M LAUNCH_CHECKLIST.md:877` — no tokens leaked to logs (audit `console.log` in prod build).
- `M LAUNCH_CHECKLIST.md:878` — magic-link no broken tabs.
- `D LAUNCH_CHECKLIST.md:879` — consider `@capacitor/preferences` for session — decision before code.
- `M LAUNCH_CHECKLIST.md:883` — detect no network via @capacitor/network.
- `M LAUNCH_CHECKLIST.md:884` — show calm offline UI on device.
- `M LAUNCH_CHECKLIST.md:885` — avoid infinite loading screens.
- `M LAUNCH_CHECKLIST.md:886` — preserve unsaved capture text.
- `M LAUNCH_CHECKLIST.md:892` — device matrix: sign up.
- `M LAUNCH_CHECKLIST.md:893` — device matrix: magic-link login.
- `M LAUNCH_CHECKLIST.md:894` — device matrix: logout.
- `M LAUNCH_CHECKLIST.md:895` — device matrix: app restart.
- `M LAUNCH_CHECKLIST.md:896` — device matrix: capture entry.
- `M LAUNCH_CHECKLIST.md:897` — device matrix: ask Everion.
- `M LAUNCH_CHECKLIST.md:898` — device matrix: view entries.
- `M LAUNCH_CHECKLIST.md:899` — device matrix: switch brain.
- `M LAUNCH_CHECKLIST.md:900` — device matrix: file/photo upload.
- `M LAUNCH_CHECKLIST.md:901` — device matrix: offline state.
- `M LAUNCH_CHECKLIST.md:902` — device matrix: slow internet.
- `M LAUNCH_CHECKLIST.md:903` — device matrix: expired session.
- `M LAUNCH_CHECKLIST.md:904` — device matrix: deep-link auth callback.
- `M LAUNCH_CHECKLIST.md:905` — device matrix: keyboard behaviour.
- `M LAUNCH_CHECKLIST.md:906` — device matrix: safe-area layout.
- `M LAUNCH_CHECKLIST.md:907` — device matrix: dark/light mode.

#### Acceptance criteria (lines 924-934)

- `M LAUNCH_CHECKLIST.md:924` — Android app runs on real device.
- `S LAUNCH_CHECKLIST.md:925` — iOS app runs on real device — `[iOS — DEFERRED]`.
- `M LAUNCH_CHECKLIST.md:926` — Supabase auth works on both (Android only practically).
- `M LAUNCH_CHECKLIST.md:927` — magic links open app correctly.
- `M LAUNCH_CHECKLIST.md:928` — sessions persist across restart (dup of 874).
- `M LAUNCH_CHECKLIST.md:929` — proper icon + splash (dup of 828).
- `M LAUNCH_CHECKLIST.md:930` — safe-area handling (dup of 829).
- `M LAUNCH_CHECKLIST.md:931` — offline state (dup of 831).
- `M LAUNCH_CHECKLIST.md:932` — core features on real devices (composite).
- `M LAUNCH_CHECKLIST.md:933` — not feeling like a browser window.
- `M LAUNCH_CHECKLIST.md:934` — ready for TestFlight + Play Internal Testing.

#### Store submission blockers (lines 940-963)

- `M LAUNCH_CHECKLIST.md:940` — trademark check "Everion" USPTO/WIPO/CIPC.
- `M LAUNCH_CHECKLIST.md:941` — Google Play Dev account ($25).
- `S LAUNCH_CHECKLIST.md:942` — Apple Dev Program enrollment — `[iOS — DEFERRED]`.
- `S LAUNCH_CHECKLIST.md:943` — D-U-N-S number — `[iOS — DEFERRED]`.
- `S LAUNCH_CHECKLIST.md:947` — Privacy manifest NSPrivacyAccessedAPICategoryUserDefaults — `[iOS — DEFERRED]`.
- `S LAUNCH_CHECKLIST.md:948` — NSPrivacyAccessedAPICategoryFileTimestamp — `[iOS — DEFERRED]`.
- `S LAUNCH_CHECKLIST.md:949` — NSPrivacyTracking false — `[iOS — DEFERRED]`.
- `S LAUNCH_CHECKLIST.md:950` — list third-party SDKs — `[iOS — DEFERRED]`.
- `S LAUNCH_CHECKLIST.md:954` — NSCameraUsageDescription — `[iOS — DEFERRED]`.
- `S LAUNCH_CHECKLIST.md:955` — NSMicrophoneUsageDescription — `[iOS — DEFERRED]`.
- `S LAUNCH_CHECKLIST.md:956` — NSPhotoLibraryUsageDescription — `[iOS — DEFERRED]`.
- `S LAUNCH_CHECKLIST.md:957` — NSFaceIDUsageDescription — `[iOS — DEFERRED]`.
- `C LAUNCH_CHECKLIST.md:961` — Android permissions INTERNET/RECORD_AUDIO/CAMERA/READ_MEDIA_IMAGES.
- `C LAUNCH_CHECKLIST.md:962` — POST_NOTIFICATIONS permission.
- `S LAUNCH_CHECKLIST.md:963` — "skip WRITE_EXTERNAL_STORAGE" — informational guidance, not an action.

#### Billing operator config (line 969) — duplicate

- `S LAUNCH_CHECKLIST.md:969` — operator config note — dup of lines 310 + 312 + 558 + 559.

#### Apple listing copy (lines 975-980) — all DEFERRED

- `S LAUNCH_CHECKLIST.md:975` — Apple title — `[iOS — DEFERRED]`.
- `S LAUNCH_CHECKLIST.md:976` — Apple subtitle — `[iOS — DEFERRED]`.
- `S LAUNCH_CHECKLIST.md:977` — Apple keywords — `[iOS — DEFERRED]`.
- `S LAUNCH_CHECKLIST.md:979` — Apple promotional text — `[iOS — DEFERRED]`.
- `S LAUNCH_CHECKLIST.md:980` — Apple description — `[iOS — DEFERRED]`.

#### Google Play listing copy (lines 984-987)

- `M LAUNCH_CHECKLIST.md:984` — Play title.
- `M LAUNCH_CHECKLIST.md:985` — Play short description.
- `M LAUNCH_CHECKLIST.md:986` — Play full description.
- `M LAUNCH_CHECKLIST.md:987` — Play tags.

#### Screenshots + visual assets (lines 1080-1099)

- `M LAUNCH_CHECKLIST.md:1080` — Hero screenshot.
- `M LAUNCH_CHECKLIST.md:1081` — Capture screenshot.
- `M LAUNCH_CHECKLIST.md:1082` — Voice screenshot.
- `M LAUNCH_CHECKLIST.md:1083` — Recall screenshot.
- `M LAUNCH_CHECKLIST.md:1084` — Vault screenshot.
- `M LAUNCH_CHECKLIST.md:1085` — Shape screenshot.
- `M LAUNCH_CHECKLIST.md:1086` — Privacy screenshot.
- `M LAUNCH_CHECKLIST.md:1087` — Pricing screenshot.
- `S LAUNCH_CHECKLIST.md:1091` — Apple-only frame 9 multi-modal — `[iOS — DEFERRED]`.
- `S LAUNCH_CHECKLIST.md:1092` — Apple-only frame 10 cross-device — `[iOS — DEFERRED]`.
- `M LAUNCH_CHECKLIST.md:1096` — app icons iOS+Android (Android portion needed).
- `M LAUNCH_CHECKLIST.md:1097` — Play feature graphic 1024×500.
- `S LAUNCH_CHECKLIST.md:1098` — iOS preview video — `[iOS — DEFERRED]`.
- `M LAUNCH_CHECKLIST.md:1099` — Capacitor splash screen design.

#### Native shell config (lines 1103-1111)

- `M LAUNCH_CHECKLIST.md:1103` — bundle ID locked in store consoles.
- `C LAUNCH_CHECKLIST.md:1104` — service-worker gated behind `!isNativePlatform()`.
- `S LAUNCH_CHECKLIST.md:1109` — Universal Links AASA file — `[iOS — DEFERRED]`.
- `C LAUNCH_CHECKLIST.md:1110` — App Links assetlinks.json.
- `M LAUNCH_CHECKLIST.md:1111` — demo `review@everionmind.com` account with backdoor.

#### Apple store metadata (lines 1117-1122)

- `S LAUNCH_CHECKLIST.md:1117` — App Privacy nutrition labels — `[iOS — DEFERRED]`.
- `S LAUNCH_CHECKLIST.md:1121` — age rating — `[iOS — DEFERRED]`.
- `S LAUNCH_CHECKLIST.md:1122` — Apple App Review Information — `[iOS — DEFERRED]`.

#### Google Play forms (lines 1126-1133)

- `M LAUNCH_CHECKLIST.md:1126` — Data Safety form.
- `M LAUNCH_CHECKLIST.md:1132` — content rating questionnaire.
- `M LAUNCH_CHECKLIST.md:1133` — target audience.

#### M5 pre-submission gate (lines 1137-1152)

- `S LAUNCH_CHECKLIST.md:1137` — iOS Privacy Manifest written — `[iOS — DEFERRED]`.
- `S LAUNCH_CHECKLIST.md:1138` — iOS Info.plist usage strings — `[iOS — DEFERRED]`.
- `M LAUNCH_CHECKLIST.md:1139` — Android permissions match runtime requests.
- `M LAUNCH_CHECKLIST.md:1140` — bundle ID locked in Play Console.
- `M LAUNCH_CHECKLIST.md:1141` — assetlinks.json served + validated.
- `S LAUNCH_CHECKLIST.md:1142` — AASA validated — `[iOS — DEFERRED]`.
- `C LAUNCH_CHECKLIST.md:1144` — service-worker gated (dup of line 1104).
- `M LAUNCH_CHECKLIST.md:1145` — 8 Android screenshots generated.
- `M LAUNCH_CHECKLIST.md:1146` — feature graphic generated (dup of 1097).
- `M LAUNCH_CHECKLIST.md:1147` — Android 512×512 icon generated.
- `M LAUNCH_CHECKLIST.md:1148` — privacy policy URL live + matches metadata.
- `M LAUNCH_CHECKLIST.md:1149` — trademark check complete (dup of 940).
- `M LAUNCH_CHECKLIST.md:1150` — demo review account created (dup of 1111).
- `M LAUNCH_CHECKLIST.md:1151` — Data Safety form submitted (dup of 1126).
- `S LAUNCH_CHECKLIST.md:1152` — Apple privacy labels submitted — `[iOS — DEFERRED]`.

#### M6 paid-tooling deferred (lines 1156-1160) — all genuinely out-of-budget pre-launch

- `S LAUNCH_CHECKLIST.md:1156` — search volume per store — explicit "paid tooling required".
- `S LAUNCH_CHECKLIST.md:1157` — ranking vs Mem/Reflect/Saner — paid.
- `S LAUNCH_CHECKLIST.md:1158` — conversion-rate benchmarks — paid.
- `S LAUNCH_CHECKLIST.md:1159` — Apple Custom Product Pages — paid+post-launch.
- `S LAUNCH_CHECKLIST.md:1160` — Play Store Listing Experiments — post-launch (requires install volume).

#### Post-launch iOS sprint (lines 1175-1224) — entire section is post-Android-30-day sprint

- `S LAUNCH_CHECKLIST.md:1175` — Apple Developer Program enrollment — iOS sprint (post-launch).
- `S LAUNCH_CHECKLIST.md:1176` — D-U-N-S — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1177` — App Store Connect entry — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1178` — RC iOS app entry — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1181` — verify `cap add ios` — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1182` — Privacy Manifest — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1187` — Info.plist usage strings — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1192` — iOS URL scheme — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1193` — Associated Domains entitlement — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1194` — AASA validated — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1197` — Apple title — iOS sprint (dup of 975).
- `S LAUNCH_CHECKLIST.md:1198` — Apple subtitle — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1199` — Apple keywords — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1200` — Apple promo text — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1201` — Apple description — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1202` — App Privacy nutrition labels — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1206` — Apple age rating — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1207` — App Review Information — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1208` — Apple primary category — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1209` — Apple screenshot frames 9-10 — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1210` — iOS preview video — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1211` — iOS app icon 1024² — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1214` — open Xcode workspace — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1215` — archive + distribute — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1216` — TestFlight approval — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1217` — real-device iPhone test — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1218` — verify SW gated — iOS sprint (dup of 1104).
- `S LAUNCH_CHECKLIST.md:1221` — App Store Connect product creation — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1222` — Sandbox sub cycle on iPhone — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1223` — submit for prod review — iOS sprint.
- `S LAUNCH_CHECKLIST.md:1224` — wait 24-72h — iOS sprint (not even an action).

#### Important Memories v0+ (lines 1239-1246) — explicit "beyond v0"

- `S LAUNCH_CHECKLIST.md:1239` — v0b retrieval injection — post-launch.
- `S LAUNCH_CHECKLIST.md:1240` — v1 AI suggestions — post-launch.
- `S LAUNCH_CHECKLIST.md:1241` — v1 contradiction detection — post-launch.
- `S LAUNCH_CHECKLIST.md:1242` — v1 source-entry sync — post-launch.
- `S LAUNCH_CHECKLIST.md:1243` — v1 memory provenance UI — post-launch.
- `S LAUNCH_CHECKLIST.md:1244` — v1 memory export — post-launch.
- `S LAUNCH_CHECKLIST.md:1245` — v2 multi-language — post-launch.
- `S LAUNCH_CHECKLIST.md:1246` — v2 soft-merge — post-launch.

#### Vault beyond V3 (lines 1255-1256)

- `S LAUNCH_CHECKLIST.md:1255` — vault entry templates — has its own spec, post-launch sub-project.
- `S LAUNCH_CHECKLIST.md:1256` — browser extension autofill — explicitly "Deferred per source guidance".

#### Marketing copy V3 polish (lines 1260-1262)

- `S LAUNCH_CHECKLIST.md:1260` — replace [PLACEHOLDER] proof-points — explicitly "post-launch" (needs beta-user quotes).
- `S LAUNCH_CHECKLIST.md:1261` — test two acquisition angles — "once enough traffic to power 7-day comparisons" (post-launch).
- `S LAUNCH_CHECKLIST.md:1262` — decide shared-brain marketing weight — post-launch.

### ROADMAP.md (85)

This file is the *original 21-day sprint plan* drafted before the recent
trim. Most of week-1 simplify items (multi-brain flag, Vault default,
nav-collapse, AI default to Gemini, vercel.json cleanup, typecheck) are
**already shipped or are now stale** given the current shape of the app.
Brain Feed (week-2) was never built — code search confirms no
`FeedView` or `/api/feed`. PostHog wired but the 8-event funnel never
materialized. Treat the rest as a backlog of unrealised v1 plans.

#### Week 1 — Simplify (lines 45-51)

- `S ROADMAP.md:45` — feature-flag multi-brain — `multiBrain` flag exists in `src/lib/featureFlags.ts` + `BrainSwitcher` already gated; shipped.
- `D ROADMAP.md:46` — disable Vault by default — never shipped that way; vault remained a first-class feature. Treat as live decision: keep current or recall.
- `S ROADMAP.md:47` — remove RefineView/VaultView/Graph from nav — superseded; Refine subsumed, Graph already an entries-threshold easter egg per `frontend-design`.
- `S ROADMAP.md:48` — collapse nav to 5 items — already shipped (5-section nav exists: Feed/Capture/Ask/Memory/Settings equivalents).
- `S ROADMAP.md:49` — default to Gemini Flash Lite — Gemini is default per `CLAUDE.md` ("project runs on Gemini, not Anthropic"); shipped.
- `C ROADMAP.md:50` — clean `vercel.json` rewrites (legacy aliases).
- `M ROADMAP.md:51` — `npm run typecheck` + Knip (operator run on machine).

#### Week 1 — Billing (line 56, 58, 59)

- `S ROADMAP.md:56` — `lib/usage.ts` `checkAndIncrement` — `api/_lib/usage.ts` exists, called from capture/llm/v1/mcp/memory-api; shipped.
- `C ROADMAP.md:58` — upgrade prompts at 90% / 100% (block with paywall modal).
- `C ROADMAP.md:59` — BYOK bypass usage check.

#### Week 1 — Definition of done (lines 63-68)

- `S ROADMAP.md:63` — nav at 5 items — shipped (dup of 48).
- `S ROADMAP.md:64` — multi-brain/Vault/Refine/Graph hidden — shipped (dup of 47).
- `S ROADMAP.md:65` — `user_usage` table migrated — migration 031 shipped per LAUNCH_CHECKLIST line 56.
- `C ROADMAP.md:67` — upgrade prompt at 90%/100% (dup of 58).
- `M ROADMAP.md:68` — `npm run typecheck` clean (dup of 51).

#### Week 2 — Brain Feed (lines 78-86) — NEVER SHIPPED — biggest gap

- `C ROADMAP.md:78` — `/api/feed` endpoint (3-card composition).
- `C ROADMAP.md:83` — `FeedView.tsx` as default home.
- `C ROADMAP.md:84` — vary composition daily (variable-reward rotation).
- `C ROADMAP.md:85` — personalisation heuristics (capture-time + tag-weight).
- `C ROADMAP.md:86` — reuse `gap-analyst` cron output in human UI.

#### Week 2 — Onboarding (lines 92-102)

- `C ROADMAP.md:92` — guided 60-second onboarding flow.
- `C ROADMAP.md:99` — one-tap Google sign-in.
- `C ROADMAP.md:100` — 3-step progress checklist in Feed.
- `C ROADMAP.md:101` — skip allowed but re-accessible.
- `M ROADMAP.md:102` — record 60-second demo video.

#### Week 2 — Analytics + Cmd+K + streak (lines 106-110)

- `C ROADMAP.md:106` — PostHog 8-event funnel (PostHog wired; the 8 events not).
- `M ROADMAP.md:107` — PostHog funnel dashboard (operator config in PH UI).
- `C ROADMAP.md:108` — Cmd+K / `/` global capture shortcut.
- `D ROADMAP.md:109` — strip type selector from capture — design decision (some types are still useful).
- `C ROADMAP.md:110` — streak counter (`user_metadata.capture_streak` + header chip).

#### Week 2 — DoD (lines 114-120)

- `C ROADMAP.md:114` — `/api/feed` returning composition (dup of 78).
- `C ROADMAP.md:115` — `FeedView.tsx` default home (dup of 83).
- `C ROADMAP.md:116` — onboarding aha in <60s (dup of 92).
- `C ROADMAP.md:117` — one-tap Google sign-in (dup of 99).
- `C ROADMAP.md:118` — PostHog 8-event funnel (dup of 106).
- `C ROADMAP.md:119` — Cmd+K (dup of 108).
- `C ROADMAP.md:120` — streak counter visible (dup of 110).

#### Week 3 — Polish (lines 128-132)

- `D ROADMAP.md:128` — collapse Settings to 3 tabs (Profile/Billing/Advanced) — same decision as LAUNCH_CHECKLIST:651 settings-density; settings shipped at 5 sections already; mark D not C.
- `C ROADMAP.md:129` — empty-state copy across all screens (most are done per L_C:346).
- `M ROADMAP.md:130` — user test with 3 non-developers (dup of L_C:344, 576).
- `M ROADMAP.md:131` — typecheck + Knip clean (dup of 51).
- `M ROADMAP.md:132` — Lighthouse audit LCP<2.5s/CLS<0.1 (dup of L_C:338, 592).

#### Week 3 — Launch prep (lines 136-142)

- `C ROADMAP.md:136` — landing page final (separate Vercel project) — Landing exists in-app; standalone marketing site not built.
- `C ROADMAP.md:137` — pricing page copy.
- `M ROADMAP.md:138` — Sentry alerts (dup of L_C:265).
- `C ROADMAP.md:139` — "Free during early access" in-app banner.
- `M ROADMAP.md:140` — status page / uptime monitor (dup of L_C:44, 45; `/status` shipped, external monitor outstanding).
- `M ROADMAP.md:141` — launch-day content drafts (3 Twitter, 1 PH, 1 HN, 1 Reddit).
- `C ROADMAP.md:142` — `/changelog` page.

#### Week 3 — Ship (lines 146-150)

- `M ROADMAP.md:146` — final UAT (browser matrix; dup of L_C:577).
- `M ROADMAP.md:147` — deploy to production.
- `M ROADMAP.md:148` — post launch content (spaced across day).
- `M ROADMAP.md:149` — monitor first 48 hours.
- `M ROADMAP.md:150` — respond to every comment.

#### Week 3 — DoD (lines 154-161)

- `S ROADMAP.md:154` — Settings has exactly 3 tabs (dup of 128 + settings currently at 5).
- `S ROADMAP.md:155` — empty-state copy (dup of 129).
- `S ROADMAP.md:156` — 3 user tests done (dup of 130).
- `S ROADMAP.md:157` — Lighthouse green (dup of 132).
- `S ROADMAP.md:158` — landing page live (dup of 136).
- `S ROADMAP.md:159` — launch content drafted (dup of 141).
- `S ROADMAP.md:160` — deployed (dup of 147).
- `S ROADMAP.md:161` — 48h monitoring complete (dup of 149).

#### Month 1-2 features (lines 178-182) — explicitly post-launch

- `S ROADMAP.md:178` — shareable insight cards — explicit Month 1-2 work.
- `S ROADMAP.md:179` — weekly email digest — Month 1-2.
- `S ROADMAP.md:180` — push notifications streak reminders — Month 1-2.
- `S ROADMAP.md:181` — chat feedback v1 — Month 1-2.
- `S ROADMAP.md:182` — prompt improvement Layer 1 — Month 1-2.

#### Month 3-6 infrastructure (lines 294-297) — explicitly post-launch + scale-triggered

- `S ROADMAP.md:294` — upgrade Supabase compute at 500 paying users — scale-triggered.
- `S ROADMAP.md:295` — watch Vercel bandwidth — operational ongoing, not actionable.
- `S ROADMAP.md:296` — semantic caching for `/v1/context` — Month 3-6.
- `M ROADMAP.md:297` — Vercel Pro upgrade at launch (dup of L_C:36).

#### Month 6-12 features (lines 307-317) — explicitly post-launch

- `S ROADMAP.md:307` — REST Gateway — Month 6-12.
- `S ROADMAP.md:308` — usage tracking dashboard — Month 6-12.
- `S ROADMAP.md:309` — JS+Python SDKs — Month 6-12.
- `S ROADMAP.md:310` — Finance v0.4 RAG chat — Month 6-12.
- `S ROADMAP.md:311` — Finance v0.5 recurring auto-gen — Month 6-12.
- `S ROADMAP.md:312` — Entry enrichment v0.2-v0.6 — Month 6-12.
- `S ROADMAP.md:313` — Community brain v0.2-v0.4 — Month 6-12.
- `S ROADMAP.md:314` — prompt self-improvement Layer 2 — Month 6-12.
- `S ROADMAP.md:315` — prompt self-improvement Layer 3 — Month 6-12.
- `S ROADMAP.md:316` — external integrations / vCard — Month 6-12 (also "no third-party OAuth planned for v1").
- `S ROADMAP.md:317` — entry chunking — Month 6-12.

#### Growth loops (lines 321-323) — post-launch instrumentation

- `S ROADMAP.md:321` — shared-brains viral mechanic — depends on Phase-2 shared brains shipping (also deferred P2).
- `S ROADMAP.md:322` — insight card share rate instrumentation — depends on insight cards (Month 1-2).
- `S ROADMAP.md:323` — referral program — explicit "only enable once organic share rate > 2%".

### PLAYBOOK.md (68)

PLAYBOOK is a launch hub with reading-list items and phase-level
checkboxes. Many are reading items the operator has already absorbed
multiple times; others are reference parents whose real work lives in
the underlying doc.

#### Phase 0 — State of the world (lines 13-20) — all are "read X" items

- `S PLAYBOOK.md:13` — "Read STRATEGY.md" — reading task; either already done or evergreen.
- `S PLAYBOOK.md:14` — "Read RESEARCH.md" — reading task.
- `S PLAYBOOK.md:15` — "Read ROADMAP.md" — reading task.
- `S PLAYBOOK.md:16` — "Skim LAUNCH_CHECKLIST.md" — reading task.
- `S PLAYBOOK.md:17` — "Skim BRAINSTORM.md" — reading task.
- `S PLAYBOOK.md:18` — "Skim architecture/INDEX.md" — reading task.
- `S PLAYBOOK.md:19` — "Skim Specs/" — reading task.
- `S PLAYBOOK.md:20` — "Skim Audits/" — reading task.

#### Phase 1 — Hardening (lines 30-38) — verification items

- `M PLAYBOOK.md:30` — verify auth flow (signup/signin/reset/OAuth recovery).
- `M PLAYBOOK.md:31` — verify capture flow (typed/paste/share-target/voice).
- `M PLAYBOOK.md:32` — verify enrichment reliable + idempotent.
- `M PLAYBOOK.md:33` — verify crons green (daily/hourly/db-backup/weekly-roll-up — weekly-roll-up itself unshipped).
- `M PLAYBOOK.md:34` — verify vault setup/unlock/recovery/backup round-trip.
- `M PLAYBOOK.md:35` — verify bell push + email deliverability.
- `M PLAYBOOK.md:36` — verify onboarding fresh-account experience.
- `M PLAYBOOK.md:37` — verify quotas enforced + upgrade nudge.
- `M PLAYBOOK.md:38` — verify error states surface useful info.

#### Phase 2 — Brand & domain (lines 53-60)

- `D PLAYBOOK.md:53` — lock brand name — already chosen (Everion / Everion Mind); mark Decision but effectively settled.
- `M PLAYBOOK.md:54` — domain check + buy.
- `M PLAYBOOK.md:55` — trademark filing (SA + US).
- `D PLAYBOOK.md:56` — register Pty Ltd + assign IP — decision before action.
- `M PLAYBOOK.md:57` — set up support@/privacy@/abuse@/appeals@/press@ forwarding.
- `M PLAYBOOK.md:58` — logo final + assets bundled.
- `M PLAYBOOK.md:59` — voice & tone document final.
- `C PLAYBOOK.md:60` — `/press` page live.

#### Phase 3 — Marketing foundation (lines 70-80)

- `C PLAYBOOK.md:70` — marketing site/landing page final.
- `C PLAYBOOK.md:71` — SEO baseline (sitemap + robots + OG/Twitter + legal pages + pricing + FAQ + Help; children below).
- `C PLAYBOOK.md:72` — sitemap + robots.txt.
- `M PLAYBOOK.md:73` — OG + Twitter card images.
- `C PLAYBOOK.md:74` — Privacy/ToS/AI-disclosure live (drafts exist; mark C for any final wiring).
- `C PLAYBOOK.md:75` — pricing page live.
- `C PLAYBOOK.md:76` — FAQ page live.
- `C PLAYBOOK.md:77` — Help/Support page live.
- `M PLAYBOOK.md:78` — email deliverability hardened (dup of LAUNCH_CHECKLIST § Invite emails — pointer not a separate item).
- `M PLAYBOOK.md:79` — analytics wired — PostHog already in; "identify + funnel events" the action.
- `M PLAYBOOK.md:80` — outreach list drafted.

#### Phase 4 — Beta phase (lines 90-97)

- `S PLAYBOOK.md:90` — "Read Roadmap/beta-phase.md" — reading task.
- `M PLAYBOOK.md:91` — beta cohort defined + tagged in PostHog.
- `M PLAYBOOK.md:92` — Beta-1 invitations (first 25).
- `M PLAYBOOK.md:93` — direct DM channel open.
- `M PLAYBOOK.md:94` — weekly retro.
- `M PLAYBOOK.md:95` — Beta-2 invitations (next 75).
- `M PLAYBOOK.md:96` — NPS at D14.
- `M PLAYBOOK.md:97` — activation rate ≥40% target (measurement, not action).

#### Phase 5 — Launch day (lines 111-123)

- `D PLAYBOOK.md:111` — pick the date.
- `M PLAYBOOK.md:112` — Product Hunt prep.
- `M PLAYBOOK.md:113` — HN "Show HN" draft prepared.
- `M PLAYBOOK.md:114` — Twitter/X thread drafted.
- `M PLAYBOOK.md:115` — LinkedIn announcement drafted.
- `M PLAYBOOK.md:116` — email blast drafted.
- `M PLAYBOOK.md:117` — press list pitched 48h ahead.
- `M PLAYBOOK.md:118` — Android app live in Play Store.
- `C PLAYBOOK.md:119` — PWA install banner for iOS users (until iOS ships).
- `S PLAYBOOK.md:120` — iOS app live in App Store — explicitly struck through + deferred.
- `M PLAYBOOK.md:121` — status page ready (dup of L_C:45 external status page; `/status` shipped).
- `M PLAYBOOK.md:122` — on-call schedule.
- `M PLAYBOOK.md:123` — incident response playbook reviewed.

#### Phase 6 — Post-launch ops (lines 141-151) — ALL post-launch, not launch-prep

- `S PLAYBOOK.md:141` — daily activation-rate dashboard — post-launch.
- `S PLAYBOOK.md:142` — weekly cohort retention review — post-launch.
- `S PLAYBOOK.md:143` — monthly MRR + churn check — post-launch.
- `S PLAYBOOK.md:144` — support SLA enforced — post-launch.
- `S PLAYBOOK.md:145` — incident postmortems — post-launch.
- `S PLAYBOOK.md:146` — A/B tests started — post-launch.
- `S PLAYBOOK.md:147` — content cadence — post-launch.
- `S PLAYBOOK.md:148` — iOS launch sprint — post-launch.
- `S PLAYBOOK.md:149` — quarterly re-read ai-disclosure — recurring, not actionable now.
- `S PLAYBOOK.md:150` — quarterly re-read security.md — recurring.
- `S PLAYBOOK.md:151` — bi-annually tabletop disaster-recovery — recurring.

### Roadmap/week-4.md (6)

All 6 are end-of-week launch-day verification items — they only become
actionable on the targeted launch Sat (currently 2026-05-30 in the doc).
They're real items, just date-gated. Keep as-is.

- `M Roadmap/week-4.md:341` — all hard outputs above checked off.
- `M Roadmap/week-4.md:342` — closed beta launched Sat as planned.
- `M Roadmap/week-4.md:343` — first 24h: ≥5 sign-ups, <5 P0 Sentry errors, <3 deliverability complaints.
- `M Roadmap/week-4.md:344` — Day-1 retention ≥30%.
- `M Roadmap/week-4.md:345` — Twitter announce >50 impressions, day-1 tweet >100.
- `M Roadmap/week-4.md:346` — "mood: tired but proud, not panicked" — qualitative gate.

### Roadmap/beta-phase.md (8)

All 8 are end-of-beta-phase verification at day 59 (Sun 2026-06-30, eve
of public launch). Real, date-gated.

- `M Roadmap/beta-phase.md:202` — 50-100 closed beta users with measured retention.
- `M Roadmap/beta-phase.md:203` — Day-7 retention ≥25%.
- `M Roadmap/beta-phase.md:204` — PH hunter confirmed OR self-hunt locked.
- `M Roadmap/beta-phase.md:205` — PH "upcoming" page 200+ signups.
- `S Roadmap/beta-phase.md:206` — iOS submitted to App Store — `[iOS — DEFERRED]` per the May 2026 Android-first decision; stale in this file.
- `M Roadmap/beta-phase.md:207` — 5 weekly digest tweets out.
- `M Roadmap/beta-phase.md:208` — `/blog/the-60-days` drafted.
- `M Roadmap/beta-phase.md:209` — 12+ beta-call conversations done.

---

## Stale items to mark [x] or delete immediately

### Already shipped (mark [x])

- `ROADMAP.md:45` — multi-brain feature-flag (`multiBrain` in `src/lib/featureFlags.ts`)
- `ROADMAP.md:47` — RefineView/Vault/Graph nav removal (current nav matches)
- `ROADMAP.md:48` + `ROADMAP.md:63` — nav at 5 items
- `ROADMAP.md:49` — Gemini Flash Lite default (`CLAUDE.md`: "this project runs on Gemini")
- `ROADMAP.md:56` — `lib/usage.ts` checkAndIncrement (`api/_lib/usage.ts` shipped, called from capture/llm/v1/mcp/memory-api)
- `ROADMAP.md:64` — multi-brain/Vault/Refine/Graph hidden (dup of 47)
- `ROADMAP.md:65` — `user_usage` migrated (migration 031)
- `ROADMAP.md:154-161` — entire week-3 DoD block; all items are duplicates of earlier roadmap entries
- `LAUNCH_CHECKLIST.md:560` — VAT info line (not an action)
- `LAUNCH_CHECKLIST.md:963` — "skip WRITE_EXTERNAL_STORAGE" (informational)
- `LAUNCH_CHECKLIST.md:1224` — "wait 24-72h" (not an action even in iOS sprint)

### References deleted features (delete the row)

None found. The May 2026 trim was thorough — no `[ ]` items reference
Gmail/Todo/Calendar/Contacts in any of the 5 dumps. The `gmail.ts` API
endpoint still exists as one of the 12 functions (no row to delete here,
but the OAUTH_TOKEN_ENCRYPTION_KEY item at line 16+39 is still valid
because the wider OAuth token encryption pattern persists even without
Gmail per se).

### Duplicate of another task in the same doc

LAUNCH_CHECKLIST.md is the duplication hotspot. Canonical → kill the others:

- Vercel Pro upgrade — canonical at line 36; kill lines 203, 545.
- Supabase Pro upgrade — canonical at line 205; kill 544.
- `SUPABASE_DB_URL` secret — canonical at line 38; kill 218, 546.
- Trigger first DB backup — canonical at 221; kill 547.
- Rotate keys — canonical at 15; kill 231, 548.
- Sentry alerts — canonical at 43 (MANUAL-08); kill 265, 549.
- SSL grade A — canonical at 224 (or 550); pick one.
- DNS A+AAAA — canonical at 224; kill 551.
- SPF/DKIM/DMARC — canonical at 50 (MANUAL-15); kill 368, 552, 682.
- LemonSqueezy live store — canonical at 308; kill 557.
- RevenueCat dashboard — canonical at 310; kill 558.
- App Store + Play products — canonical at 312; kill 559.
- Subscription cancellation test — canonical at 316; kill 561.
- Lighthouse on prod — canonical at 48 (MANUAL-13); kill 338, 592.
- Privacy+ToS legal review — canonical at 49 (MANUAL-14); kill 579, 685.
- OAUTH_TOKEN_ENCRYPTION_KEY — canonical at 16; kill 39 (or vice versa).
- Onboarding test with 3 strangers — canonical at 344; kill 576.
- Real-device QA — canonical at 342; kill 577.
- Co-admin on every dashboard — canonical at 578; kill 700.
- Backup restore test — canonical at 588; kill 701.
- CSP nonce migration — canonical at 631; kill 692.
- Bundle-size eyeball — canonical at 435; kill 593.
- App Links assetlinks.json — canonical at 1110; kill 1141.
- Feature graphic 1024×500 — canonical at 1097; kill 1146.
- Service-worker gated — canonical at 1104; kill 1144, 1218.
- Trademark check — canonical at 940; kill 1149.
- Demo review account — canonical at 1111; kill 1150.
- Data Safety form — canonical at 1126; kill 1151.
- Bundle ID locked — canonical at 1103; kill 1140.

Result: removing the dupes alone cuts ~30 items off LAUNCH_CHECKLIST.

### Explicitly post-launch / V2+ that doesn't belong on pre-launch list

- LAUNCH_CHECKLIST.md:471-477 (shared-brains Phase 2-4) — P2 deferred
- LAUNCH_CHECKLIST.md:503, 511 (enrichment Phase 2B+3) — P2 deferred with scale triggers
- LAUNCH_CHECKLIST.md:1156-1160 (M6 paid ASO tooling) — paid-tooling deferred
- LAUNCH_CHECKLIST.md:1175-1224 (iOS launch sprint, 30 items) — post-launch sprint
- LAUNCH_CHECKLIST.md:1239-1246 (Important Memories beyond v0) — explicit "beyond v0"
- LAUNCH_CHECKLIST.md:1255-1256 (vault extras) — sub-projects 1+5 of 5 are explicitly post-launch
- LAUNCH_CHECKLIST.md:1260-1262 (marketing V3 polish) — explicit "post-launch" / "once enough traffic"
- LAUNCH_CHECKLIST.md:947-957, 975-980, 1091-1092, 1098, 1109, 1117, 1121-1122, 1137-1138, 1142, 1152 — all `[iOS — DEFERRED]` items duplicated in the post-launch iOS sprint section
- ROADMAP.md:178-182 — Month 1-2 features (explicit horizon)
- ROADMAP.md:294-297 — Month 3-6 infrastructure (most scale-triggered)
- ROADMAP.md:307-317 — Month 6-12 features (explicit horizon)
- ROADMAP.md:321-323 — growth loops (explicit "Month 6-12")
- PLAYBOOK.md:13-20 — Phase 0 reading list (evergreen, not actionable)
- PLAYBOOK.md:141-151 — Phase 6 post-launch ops (post-launch by definition)

Together with the dupes, ~128 items can come off the active list today
without losing a single real obligation.

---

## Top 10 items the operator should actually work on next

Ordered by impact-on-launch-readiness. M = operator hands, C = dev work
operator triggers, D = decide first.

1. **M LAUNCH_CHECKLIST.md:36 — Upgrade Vercel to Pro** ($20/mo). Functions silently capped at 60s on Hobby; `maxDuration:300` already in `vercel.json`. Unblocks reliable hourly cron, longer LLM calls, removes a class of launch-day timeout bugs.
2. **M LAUNCH_CHECKLIST.md:205 — Upgrade Supabase to Pro** ($25/mo). CRITICAL — currently on Free tier, zero automated backups, 500MB cap. Single biggest stability gap.
3. **M LAUNCH_CHECKLIST.md:344 — Onboarding test with 3 strangers.** Explicitly tagged "single highest-value pre-launch task" — runs against an app that hasn't been validated by anyone except its author. Cheapest meaningful UX signal.
4. **M LAUNCH_CHECKLIST.md:308/310/312/316/318 — LemonSqueezy/RevenueCat live config + cancellation test.** Code shipped 2026-04-30 (commit `c484030`), operator config never done. Without these flipped, no revenue is possible even if users sign up.
5. **M LAUNCH_CHECKLIST.md:50 — SPF/DKIM/DMARC + mail-tester 10/10.** Invite emails reportedly going to spam (line 370). Easy fix, huge effect on closed-beta invite conversion.
6. **M LAUNCH_CHECKLIST.md:342 + 808 + 818 — Android real-device QA pass.** Capacitor wrap built but step 7 (Android on real device) never ticked. Blocks any Play submission.
7. **M LAUNCH_CHECKLIST.md:43 — Sentry alerts (3 rules).** ~5 min in dashboard, gives blast-radius alerting for the first 1k users.
8. **C LAUNCH_CHECKLIST.md:67-77 — Enrichment audit deferrals (the 10 unticked S/A/E2E items).** Real code work for security + reliability of the enrichment path that actually drives the product. Most still apply post-Gmail-trim. Prioritise S-02/A-03 (RLS bypass) and T-01 (external timeouts).
9. **C ROADMAP.md:78 + 83 — Brain Feed (`/api/feed` + `FeedView.tsx`).** The single largest *unshipped product surface* on the entire roadmap — the home screen the whole "Day 7 retention" thesis depends on. If retention math is the launch gate, this can't be missing.
10. **D LAUNCH_CHECKLIST.md:651 + ROADMAP.md:128 — Settings density decision.** Settings sit at 14 tabs (or 5 grouped) depending on which doc you trust; ROADMAP wants 3. Pick one shape before launch; settings drift is the first thing new users see when they "look around".

---

## Per-source archive recommendations

### LAUNCH_CHECKLIST.md — KEEP, but TRIM AGGRESSIVELY

Real living to-do but bloated by ~95 duplicates + ~70 iOS-deferred items
that already have their own post-launch sprint block. Recommended pass:

1. De-duplicate per the canonical-vs-kill list above (~30 lines).
2. Delete every `[iOS — DEFERRED]` `[ ]` row in the pre-iOS-sprint sections (945-957, 975-980, 1091-1092, 1098, 1109, 1117, 1121-1122, 1137-1138, 1142, 1152) — they're all redundant with the dedicated post-launch iOS sprint block (1175-1224). Lose ~30 lines.
3. Move "Important Memories beyond v0", "Vault beyond V3", "Marketing copy V3 polish", "Shared brains Phase 2+", "Enrichment Phase 2B+3" into a `EML/post-launch-backlog.md` file. Lose ~20 lines from the active checklist.

Post-trim size: ~150 active items, not 301.

### ROADMAP.md — RETIRE-AFTER-LAUNCH (it's a sprint plan, not a backlog)

This file is a *sprint plan* written before the recent app shape change.
Most week-1/2/3 items are either shipped under different names, never
shipped (Brain Feed), or now duplicated in LAUNCH_CHECKLIST. Half the
remaining items are future-dated (Month 1-2, 3-6, 6-12). Recommended:

1. Mark `[x]` everything in week-1 Simplify that has shipped (most of it).
2. Move week-2 Brain Feed + onboarding into LAUNCH_CHECKLIST P0 if you still intend to ship them pre-launch; otherwise mark `[ ]→[ ] (deferred)` and stop counting them.
3. Move Month 1-2 / 3-6 / 6-12 sections into the same `post-launch-backlog.md`.
4. Once launched: archive the entire file. ROADMAP is not the format you want for post-launch ops.

### PLAYBOOK.md — KEEP as a hub, TRIM Phase-0 + Phase-6 + Phase-1 verifications

The phase structure is genuinely useful. The reading-list checkboxes
(Phase 0, 13-20) are anti-patterns — convert those to plain prose at the
top of each phase intro. Phase 1 verification items (30-38) should
either be a one-time pre-beta gate (mark `[x]` once verified, never
re-tick) or moved into the playwright-everion e2e suite. Phase 6 items
(141-151) are post-launch by definition and shouldn't live on the
pre-launch playbook; lift into the proposed `post-launch-backlog.md`.

Post-trim: PLAYBOOK retains ~25 actively meaningful checkboxes, mostly
Phase-2 brand/legal and Phase-5 launch-day prep.

### Roadmap/week-4.md — KEEP (date-gated verification gates)

All 6 items are end-of-week verification at the chosen beta-launch
Saturday. They're fine as-is — they're the wrap-up gates, not active
to-dos.

### Roadmap/beta-phase.md — KEEP (date-gated)

Same shape as week-4 — beta-phase day-59 verification gates. Only stale
item is :206 (iOS submitted to App Store) which contradicts the May
2026 Android-first decision; mark `~~struck through~~` with a pointer
to the post-launch iOS sprint.
