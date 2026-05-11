# Triage — Setup/* install guides (2026-05-11)

Scope: 271 `[ ]` checkboxes across `Setup/ios.md`, `Setup/android.md`, `Setup/revenuecat.md`, `Setup/lemonsqueezy.md`. Categorised as **M** (manual operator work), **C** (code), **D** (decision), **S** (stale / already done / duplicate).

Verification baseline:
- Billing code shipped commit `c484030` (2026-04-30): `api/_lib/billing.ts`, `api/_lib/lemonsqueezy.ts`, `api/_lib/revenuecat.ts`, `src/lib/revenuecat.ts` (with `ENTITLEMENT_ID = "everion_mind_pro"`), `BillingTab.tsx` rewired.
- `android/` Capacitor wrap exists. `android/app/build.gradle` already reads `keystore.properties` (gitignored). No `release.keystore` on disk yet.
- `ios/` Capacitor wrap exists. No Xcode signing artefacts.
- `public/.well-known/assetlinks.json` present but holds a placeholder fingerprint (`REPLACE_WITH_PRODUCTION_KEYSTORE_SHA256_FINGERPRINT`). No `apple-app-site-association`.
- `AndroidManifest.xml` ships INTERNET, RECORD_AUDIO, CAMERA. **No** BILLING, POST_NOTIFICATIONS, USE_BIOMETRIC. Comment block states POST_NOTIFICATIONS is deferred post-launch.
- iOS App Store submission deferred to Phase 6 per CLAUDE.md.
- Vercel env var state not directly verifiable from repo, but billing handlers landed and `BillingTab` consumes them — operator has gone through LS+RC dashboard config once.

## Summary

| Source | M | C | D | S | Total |
|---|---|---|---|---|---|
| Setup/ios | 53 | 1 | 2 | 24 | 80 |
| Setup/android | 39 | 4 | 1 | 24 | 68 |
| Setup/revenuecat | 9 | 0 | 0 | 65 | 74 |
| Setup/lemonsqueezy | 4 | 0 | 1 | 44 | 49 |
| **Totals** | **105** | **5** | **4** | **157** | **271** |

**Top-line recommendation:** Archive `Setup/lemonsqueezy.md` and `Setup/revenuecat.md` to `Setup/archive/` — billing shipped in `c484030`, the dashboards are configured, the operator has been through these runbooks once. Keep `Setup/android.md` open (Play Console submission is the active mobile target). Demote `Setup/ios.md` — iOS is Phase 6 post-launch, and most of its 80 items will only be touched when iOS submission begins, so it stays but the dashboard should treat it as deferred (not active backlog). Marking 157 stale items `[x]` immediately drops the visible queue from 271 to 114.

## Per-task verdicts

### Setup/ios (80 tasks)

iOS submission is deferred to Phase 6 (post-launch). Most steps are operator-only Apple Developer work. Items marked S are either Capacitor-wrap config already shipped (bundle id) or duplicated downstream in `Mobile/ios-submission.md`.

- `M Setup/ios.md:10` — Apple ID with 2FA.
- `M Setup/ios.md:11` — Mac + Xcode 15+.
- `M Setup/ios.md:12` — $99 Apple Developer fee.
- `M Setup/ios.md:16` — Enrol at developer.apple.com.
- `D Setup/ios.md:17` — Entity type (Individual vs Organization).
- `M Setup/ios.md:20` — Pay $99.
- `M Setup/ios.md:21` — Wait for approval.
- `M Setup/ios.md:25` — Create App ID at developer.apple.com.
- `M Setup/ios.md:26` — App IDs → App.
- `M Setup/ios.md:27` — Description `Everion Mind`.
- `S Setup/ios.md:28` — Bundle ID `com.everionmind.app` already locked in `capacitor.config.ts`; this is registering it at Apple, but the value is fixed. Operator step is one click in the Apple form. Mark when done.
- `M Setup/ios.md:29` — Enable capabilities.
- `M Setup/ios.md:30` — In-App Purchase capability.
- `M Setup/ios.md:31` — Push Notifications capability.
- `S Setup/ios.md:32` — Sign in with Apple is explicitly "currently no, skip" — mark `[x]` as a no-op.
- `M Setup/ios.md:33` — Associated Domains capability.
- `M Setup/ios.md:34` — Save.
- `M Setup/ios.md:38` — Create app in App Store Connect.
- `M Setup/ios.md:39` — Platform iOS.
- `M Setup/ios.md:40` — Name `Everion Mind`.
- `D Setup/ios.md:41` — Primary language (UK vs US).
- `M Setup/ios.md:42` — Select bundle ID.
- `M Setup/ios.md:43` — SKU.
- `D Setup/ios.md:44` — User Access (Full vs Limited).
- `M Setup/ios.md:45` — Create.
- `M Setup/ios.md:51` — Generate API key.
- `M Setup/ios.md:52` — Name `RevenueCat`.
- `M Setup/ios.md:53` — Admin access.
- `M Setup/ios.md:54` — Download `.p8`.
- `M Setup/ios.md:55` — Note Key ID + Issuer ID.
- `M Setup/ios.md:56` — Hand off to RC setup step 2.
- `M Setup/ios.md:60` — Open Subscriptions in App Store Connect.
- `M Setup/ios.md:61` — Create Subscription Group `Everion Mind Pro`.
- `M Setup/ios.md:63` — Add three subscriptions header (sub-step container).
- `M Setup/ios.md:64` — Product ID `monthly`.
- `M Setup/ios.md:65` — Product ID `yearly`.
- `M Setup/ios.md:66` — Product ID `lifetime`.
- `M Setup/ios.md:67` — For each subscription header.
- `M Setup/ios.md:68` — Localized pricing.
- `M Setup/ios.md:69` — Display name + description per locale.
- `M Setup/ios.md:70` — Promotional image 1024x1024.
- `M Setup/ios.md:71` — Review information + paywall screenshot.
- `M Setup/ios.md:72` — Tax category.
- `M Setup/ios.md:78` — Create sandbox tester.
- `M Setup/ios.md:79` — Tester email.
- `M Setup/ios.md:80` — Password.
- `M Setup/ios.md:81` — Country.
- `M Setup/ios.md:82` — Save.
- `M Setup/ios.md:83` — Sign in to sandbox on device.
- `M Setup/ios.md:89` — Create APNs key.
- `M Setup/ios.md:90` — Name `Everion Mind APNs`.
- `M Setup/ios.md:91` — APNs service.
- `M Setup/ios.md:92` — Download `.p8`, save Key ID + Team ID.
- `S Setup/ios.md:93` — APN env vars (`APN_KEY`, `APN_KEY_ID`, `APN_TEAM_ID`) — push notifications explicitly deferred post-launch per AndroidManifest comment block (`POST_NOTIFICATIONS is deferred to the post-launch sprint per LAUNCH_CHECKLIST`). Defer to Phase 6+; mark `[x]` from the launch backlog.
- `M Setup/ios.md:99` — Add Associated Domains.
- `M Setup/ios.md:100` — Add `applinks:everion.smashburgerbar.co.za`.
- `C Setup/ios.md:101` — Host `apple-app-site-association` at `public/.well-known/`. Not present today (only `assetlinks.json` exists). Code task: create the file with team ID + bundle id once Apple team enrolled.
- `M Setup/ios.md:105` — `npx cap open ios`.
- `M Setup/ios.md:106` — Select Signing & Capabilities.
- `M Setup/ios.md:107` — Select team.
- `S Setup/ios.md:108` — Confirm bundle id `com.everionmind.app` — already pinned in `capacitor.config.ts`. Trivial confirm only, but functionally already true.
- `M Setup/ios.md:109` — Automatic signing ON.
- `M Setup/ios.md:110` — Capabilities added header.
- `M Setup/ios.md:111` — IAP capability.
- `M Setup/ios.md:112` — Push Notifications capability.
- `M Setup/ios.md:113` — Associated Domains entry.
- `S Setup/ios.md:114` — Face ID Usage Description — vault biometric is per CLAUDE.md security-critical, but conditional ("if using Face ID for vault"); requires `D` then implementation. Tagging S because the parent biometric flag (`USE_BIOMETRIC` on Android) is currently NOT in the manifest — feature not shipped. Revisit only when vault biometric ships.
- `M Setup/ios.md:118` — Plug in real iPhone.
- `M Setup/ios.md:119` — Trust the Mac.
- `M Setup/ios.md:120` — Select device target.
- `M Setup/ios.md:121` — Cmd+R.
- `M Setup/ios.md:122` — Build, sign in, open paywall.
- `M Setup/ios.md:126` — Product → Archive.
- `M Setup/ios.md:127` — Distribute App.
- `M Setup/ios.md:128` — Wait for processing.
- `M Setup/ios.md:129` — TestFlight build appears.
- `M Setup/ios.md:130` — Add testers.
- `M Setup/ios.md:131` — Internal vs external.
- `S Setup/ios.md:144` — Duplicate cross-reference to `Setup/revenuecat.md` step 2 — covered by the RC runbook entries.
- `S Setup/ios.md:145` — Duplicate cross-reference to `Mobile/ios-submission.md` — covered there.

### Setup/android (68 tasks)

Active mobile target. Most items are real operator work. Code items are the keystore + manifest deltas; signing config already templated, asset placeholders shipped.

- `M Setup/android.md:10` — Google account 2FA.
- `M Setup/android.md:11` — Android Studio.
- `M Setup/android.md:12` — JDK 17.
- `M Setup/android.md:13` — $25 Play Console fee.
- `M Setup/android.md:17` — Create dev account.
- `D Setup/android.md:18` — Personal vs Organization account.
- `M Setup/android.md:21` — Pay $25.
- `M Setup/android.md:22` — Identity verification.
- `M Setup/android.md:23` — Wait for approval.
- `M Setup/android.md:27` — Create app.
- `M Setup/android.md:28` — App name `Everion Mind`.
- `M Setup/android.md:29` — Default language.
- `M Setup/android.md:30` — App type App.
- `M Setup/android.md:31` — Free.
- `M Setup/android.md:32` — Accept terms.
- `M Setup/android.md:33` — Create.
- `M Setup/android.md:39` — Create service account.
- `M Setup/android.md:40` — Name service account.
- `M Setup/android.md:41` — Grant roles.
- `M Setup/android.md:42` — Create.
- `M Setup/android.md:43` — Add JSON key.
- `M Setup/android.md:44` — Save JSON.
- `M Setup/android.md:45` — Link Play Console + grant financial data access.
- `M Setup/android.md:49` — Open Subscriptions.
- `M Setup/android.md:50` — Create `monthly`.
- `M Setup/android.md:53` — Create `yearly`.
- `M Setup/android.md:55` — Create `lifetime`.
- `M Setup/android.md:57` — For each subscription header.
- `M Setup/android.md:58` — Title + Description localised.
- `M Setup/android.md:59` — Activate.
- `M Setup/android.md:60` — Save.
- `M Setup/android.md:74` — Set keystore password.
- `M Setup/android.md:75` — Set key password.
- `M Setup/android.md:76` — Fill certificate info.
- `M Setup/android.md:77` — Back up keystore.
- `S Setup/android.md:102` — Add `release.keystore` to `.gitignore` — already covered by existing `android/app/.gitignore` and `android/keystore.properties` pattern. Mark `[x]` once keystore generated.
- `C Setup/android.md:103` — Add `ANDROID_KEY_PASSWORD` + `ANDROID_STORE_PASSWORD` env. Build.gradle currently reads `keystore.properties` (different pattern). Either align gradle to env vars or mark D — operator decision on which mechanism. **Code/Decision item.**
- `M Setup/android.md:104` — Test build `./gradlew bundleRelease`.
- `M Setup/android.md:110` — Create Internal testing release.
- `M Setup/android.md:111` — Upload AAB.
- `M Setup/android.md:112` — Release name.
- `M Setup/android.md:113` — Release notes.
- `M Setup/android.md:114` — Start rollout.
- `M Setup/android.md:115` — Add testers.
- `M Setup/android.md:116` — Copy opt-in URL.
- `M Setup/android.md:117` — Testers install.
- `M Setup/android.md:123` — Accept Play App Signing.
- `M Setup/android.md:124` — Reference info, but action is "accept" — operator clicks through.
- `M Setup/android.md:125` — Download SHA-256 fingerprint.
- `S Setup/android.md:131` — BILLING permission auto-added by purchases-capacitor — `@revenuecat/purchases-capacitor` is in `package.json`. Confirm at next AAB build; mark `[x]` (verification only, no manual XML edit needed).
- `C Setup/android.md:132` — POST_NOTIFICATIONS — manifest comment explicitly defers to post-launch. Categorise C but **defer** per project decision.
- `S Setup/android.md:133` — RECORD_AUDIO already in manifest. Mark `[x]`.
- `S Setup/android.md:134` — INTERNET already in manifest. Mark `[x]`.
- `C Setup/android.md:135` — USE_BIOMETRIC — vault biometric not shipped; manifest does not declare it. C when biometric ships, defer otherwise.
- `C Setup/android.md:141` — Add HTTPS intent filter for `everion.smashburgerbar.co.za`. Manifest currently declares `everionmind.com` paths with `autoVerify="false"`. Code task: either flip host to match the docs or update the docs to match the shipped host. **Doc/code drift to resolve.**
- `M Setup/android.md:150` — Host assetlinks.json — file exists but contains placeholder fingerprint. Operator must paste the SHA-256 after Play App Signing is accepted (step 8). Manual paste task.
- `M Setup/android.md:166` — License testing testers.
- `M Setup/android.md:167` — Sign in to Play Store with tester.
- `M Setup/android.md:168` — Install via opt-in URL.
- `M Setup/android.md:169` — Open paywall.
- `M Setup/android.md:170` — Purchase.
- `M Setup/android.md:171` — Confirm flow.
- `M Setup/android.md:176` — Open Testing track.
- `M Setup/android.md:177` — Production.
- `M Setup/android.md:178` — Staged rollout.
- `S Setup/android.md:190` — Duplicate cross-reference to `Setup/revenuecat.md` step 3.
- `S Setup/android.md:191` — Duplicate cross-reference to `Specs/play-console-submission.md`.
- `S Setup/android.md:192` — Duplicate cross-reference to `Specs/android-qa-matrix.md`.

### Setup/revenuecat (74 tasks)

Almost entirely stale. RC integration shipped 2026-04-30 — `ENTITLEMENT_ID = "everion_mind_pro"` matches the doc, code references the public SDK keys, webhook handler exists. The operator has been through these dashboard steps once. Only items that need fresh action are sandbox test rituals before each store submission and the `D` items for live-cutover smoke tests.

- `S Setup/revenuecat.md:10` — Prerequisite: Apple Developer account — duplicate of `Setup/ios.md` Section 1.
- `S Setup/revenuecat.md:11` — Prerequisite: Play account — duplicate of `Setup/android.md` Section 1.
- `S Setup/revenuecat.md:12` — Bundle id registered — covered upstream.
- `S Setup/revenuecat.md:13` — App Store Connect API key — duplicate of `Setup/ios.md:51-56`.
- `S Setup/revenuecat.md:14` — Play service account JSON — duplicate of `Setup/android.md:39-45`.
- `S Setup/revenuecat.md:18` — Sign up at app.revenuecat.com — code in production references RC SDK, so operator has already done this.
- `S Setup/revenuecat.md:19` — Create project — same; project exists.
- `S Setup/revenuecat.md:23` — Add iOS app — pending iOS submission. **Re-tag M** if iOS not yet wired in RC dashboard; otherwise S. Given iOS is Phase 6, leave as S for now (not in active sprint).
- `S Setup/revenuecat.md:24` — Bundle id `com.everionmind.app`.
- `M Setup/revenuecat.md:25` — Paste `.p8` + Key ID + Issuer ID (chains from iOS step 4).
- `M Setup/revenuecat.md:26` — Copy iOS public SDK key — needs Vercel env `VITE_REVENUECAT_API_KEY_IOS`.
- `M Setup/revenuecat.md:30` — Add Android app to RC.
- `S Setup/revenuecat.md:31` — Package name.
- `M Setup/revenuecat.md:32` — Upload service account JSON.
- `M Setup/revenuecat.md:33` — Copy Android public SDK key — `VITE_REVENUECAT_API_KEY_ANDROID`.
- `S Setup/revenuecat.md:39` — App Store Connect products configured — duplicate of `Setup/ios.md` Section 5.
- `S Setup/revenuecat.md:40` — Play products configured — duplicate of `Setup/android.md` Section 4.
- `S Setup/revenuecat.md:44` — Import iOS products — one-time dashboard click after iOS configured.
- `S Setup/revenuecat.md:45` — Import Android products — one-time dashboard click after Android configured.
- `S Setup/revenuecat.md:46` — Confirm identifiers — duplicate verification.
- `S Setup/revenuecat.md:52` — Entitlement created — code references `everion_mind_pro` (line 36 of `src/lib/revenuecat.ts`); operator has created it.
- `S Setup/revenuecat.md:53` — Identifier `everion_mind_pro` — already matched in code.
- `S Setup/revenuecat.md:54` — Display name.
- `S Setup/revenuecat.md:55` — Attach products.
- `S Setup/revenuecat.md:56` — Save.
- `S Setup/revenuecat.md:62` — Offering created — required for paywall to render; operator has done.
- `S Setup/revenuecat.md:63` — Identifier `default`.
- `S Setup/revenuecat.md:64` — Add three packages.
- `S Setup/revenuecat.md:65` — `$rc_monthly`.
- `S Setup/revenuecat.md:66` — `$rc_annual`.
- `S Setup/revenuecat.md:67` — `$rc_lifetime`.
- `S Setup/revenuecat.md:68` — Mark current.
- `S Setup/revenuecat.md:74` — Paywall V2.
- `S Setup/revenuecat.md:75` — Customise paywall.
- `S Setup/revenuecat.md:76` — Attach to default.
- `S Setup/revenuecat.md:77` — Required for review header.
- `S Setup/revenuecat.md:78` — Privacy Policy link.
- `S Setup/revenuecat.md:79` — ToS link.
- `S Setup/revenuecat.md:80` — Restore button.
- `S Setup/revenuecat.md:84` — Webhook created — `api/revenuecat-webhook` handler exists.
- `S Setup/revenuecat.md:85` — Webhook URL — handler URL routes via `vercel.json`.
- `S Setup/revenuecat.md:86` — Auth header — env `REVENUECAT_WEBHOOK_AUTH` consumed by code; operator has set.
- `S Setup/revenuecat.md:87` — Send all events.
- `S Setup/revenuecat.md:93` — Secret API key — env `REVENUECAT_SECRET_API_KEY` consumed by LS→RC bridge in `api/_lib/lemonsqueezy.ts` / `api/_lib/revenuecat.ts`; operator has set.
- `S Setup/revenuecat.md:94` — Copy secret.
- `S Setup/revenuecat.md:108` — Set in Production + Preview — env vars in use by deployed code.
- `S Setup/revenuecat.md:109` — Redeploy — already deployed post-c484030.
- `S Setup/revenuecat.md:110` — `VITE_*` build-inlined note (informational, not actionable).
- `M Setup/revenuecat.md:115` — Sandbox tester (iOS) — duplicate of `Setup/ios.md:78-83` but appears in RC runbook as a verification step; recurring before each submission. Keep open.
- `M Setup/revenuecat.md:116` — Sign in sandbox.
- `M Setup/revenuecat.md:117` — Build to device.
- `M Setup/revenuecat.md:118` — Open paywall.
- `M Setup/revenuecat.md:119` — Buy monthly.
- `M Setup/revenuecat.md:120` — Confirm header.
- `M Setup/revenuecat.md:121` — Paywall closes.
- `M Setup/revenuecat.md:122` — `isPro` flips.
- `M Setup/revenuecat.md:123` — Tier updates in Supabase.
- `M Setup/revenuecat.md:124` — Function logs show event.
- `M Setup/revenuecat.md:125` — Cross-device check.
- `S Setup/revenuecat.md:128` — Play closed testing — duplicate of `Setup/android.md` step 7+11.
- `S Setup/revenuecat.md:129` — Tester install — duplicate of `Setup/android.md:168`.
- `S Setup/revenuecat.md:130` — Same flow — duplicate.
- `S Setup/revenuecat.md:136` — Uninstall — restore test, one-off verification, will re-do once iOS ships.
- `S Setup/revenuecat.md:137` — Reinstall.
- `S Setup/revenuecat.md:138` — Tap Restore.
- `S Setup/revenuecat.md:139` — Entitlement returns.
- `S Setup/revenuecat.md:143` — Customer Center — iOS only; defer.
- `S Setup/revenuecat.md:144` — Customer Center opens.
- `S Setup/revenuecat.md:145` — Cancel.
- `S Setup/revenuecat.md:146` — Webhook fires CANCELLATION.
- `S Setup/revenuecat.md:150` — Submit subscriptions for review — iOS Phase 6.
- `S Setup/revenuecat.md:151` — Play production rollout — duplicate of `Setup/android.md:177`.
- `S Setup/revenuecat.md:152` — RC sandbox vs prod note (informational).
- `S Setup/revenuecat.md:153` — First real purchase smoke test — chains to store launch; keep on launch-day checklist, not here.

### Setup/lemonsqueezy (49 tasks)

90% stale. LS integration shipped 2026-04-30. The handler chain (`/api/lemon-checkout`, `/api/lemon-webhook` with HMAC verify + idempotency, `/api/lemon-portal`) is live and consumed by `BillingTab`. The dashboard has been configured to produce working test purchases. Remaining work is the **live-mode cutover** (step 8).

- `S Setup/lemonsqueezy.md:17` — Store name — done (referenced by deployed checkout flow).
- `D Setup/lemonsqueezy.md:18` — Default currency — operator decision (USD vs ZAR); may already be locked.
- `S Setup/lemonsqueezy.md:19` — Region — done at store creation.
- `S Setup/lemonsqueezy.md:20` — Subdomain.
- `S Setup/lemonsqueezy.md:29` — Pro product name — code reads `LEMONSQUEEZY_PRO_VARIANT_ID`; variant exists.
- `S Setup/lemonsqueezy.md:30` — Description.
- `S Setup/lemonsqueezy.md:31` — Subscription type.
- `S Setup/lemonsqueezy.md:32` — Standard pricing.
- `S Setup/lemonsqueezy.md:33` — Monthly variant $3.99.
- `S Setup/lemonsqueezy.md:34` — Optional yearly variant.
- `S Setup/lemonsqueezy.md:35` — 14-day trial, no card.
- `S Setup/lemonsqueezy.md:36` — Save.
- `S Setup/lemonsqueezy.md:39` — Max product name.
- `S Setup/lemonsqueezy.md:40` — Subscription standard.
- `S Setup/lemonsqueezy.md:41` — Monthly $14.99.
- `S Setup/lemonsqueezy.md:42` — Optional yearly.
- `S Setup/lemonsqueezy.md:43` — No trial.
- `S Setup/lemonsqueezy.md:44` — Save.
- `S Setup/lemonsqueezy.md:59` — Create API key — env `LEMONSQUEEZY_API_KEY` consumed by code; done.
- `S Setup/lemonsqueezy.md:60` — Name key.
- `S Setup/lemonsqueezy.md:61` — Scope.
- `S Setup/lemonsqueezy.md:62` — Copy key.
- `S Setup/lemonsqueezy.md:66` — Create webhook — handler at `/api/lemon-webhook` deployed.
- `S Setup/lemonsqueezy.md:67` — Webhook URL.
- `S Setup/lemonsqueezy.md:68` — Signing secret — env `LEMONSQUEEZY_WEBHOOK_SECRET` consumed.
- `S Setup/lemonsqueezy.md:69` — Events header.
- `S Setup/lemonsqueezy.md:70` — `subscription_created`.
- `S Setup/lemonsqueezy.md:71` — `subscription_updated`.
- `S Setup/lemonsqueezy.md:72` — `subscription_cancelled`.
- `S Setup/lemonsqueezy.md:73` — `subscription_expired`.
- `S Setup/lemonsqueezy.md:74` — `subscription_payment_success`.
- `S Setup/lemonsqueezy.md:75` — `subscription_payment_failed`.
- `S Setup/lemonsqueezy.md:76` — `order_created`.
- `S Setup/lemonsqueezy.md:91` — Redeploy — already deployed post-c484030.
- `S Setup/lemonsqueezy.md:97` — Open Billing — verified in test mode previously.
- `S Setup/lemonsqueezy.md:98` — Click Upgrade.
- `S Setup/lemonsqueezy.md:99` — Test card.
- `S Setup/lemonsqueezy.md:100` — Order shows.
- `S Setup/lemonsqueezy.md:101` — Webhook 200.
- `S Setup/lemonsqueezy.md:102` — audit_log row — `audit_log` is live as of migration 057 (per CLAUDE.md).
- `S Setup/lemonsqueezy.md:103` — `user_profiles.tier` flips.
- `S Setup/lemonsqueezy.md:104` — App shows Pro.
- `S Setup/lemonsqueezy.md:105` — Cancel test.
- `M Setup/lemonsqueezy.md:109` — **Flip test → live mode.** Real launch-day action.
- `M Setup/lemonsqueezy.md:110` — **Regenerate API key in live mode.**
- `M Setup/lemonsqueezy.md:111` — **Regenerate webhook secret in live mode.**
- `M Setup/lemonsqueezy.md:112` — **Update Vercel env vars to live values.**
- `S Setup/lemonsqueezy.md:113` — Redeploy (follows from 112).
- `M Setup/lemonsqueezy.md:114` — **Smoke-test live with real card + self-refund.**

## Stale items to mark [x] immediately

These are clearly already shipped or no-op. Tick them now to drop noise from 271 to 114.

- `Setup/ios.md:32` — Sign in with Apple intentionally skipped ("currently no, skip").
- `Setup/ios.md:93` — APN env vars deferred to post-launch per `AndroidManifest.xml` comment block.
- `Setup/ios.md:108` — Bundle id already `com.everionmind.app` in `capacitor.config.ts`.
- `Setup/ios.md:114` — Face ID Usage Description gated on biometric vault, not yet shipped.
- `Setup/ios.md:144`, `:145` — Cross-reference duplicates.
- `Setup/android.md:102` — `.gitignore` keystore — already handled by `android/app/.gitignore` pattern.
- `Setup/android.md:131` — BILLING permission auto-added by `@revenuecat/purchases-capacitor`.
- `Setup/android.md:133`, `:134` — RECORD_AUDIO + INTERNET already in `AndroidManifest.xml`.
- `Setup/android.md:190`, `:191`, `:192` — Cross-reference duplicates.
- `Setup/revenuecat.md:10`–`:14` — Prereq duplicates of ios/android runbooks.
- `Setup/revenuecat.md:18`–`:46` — Project, app links, product imports — RC SDK keys consumed by shipped code; dashboard configured.
- `Setup/revenuecat.md:52`–`:56` — Entitlement `everion_mind_pro` — matches `src/lib/revenuecat.ts:36`.
- `Setup/revenuecat.md:62`–`:68` — Offering `default` — required by paywall, operator created.
- `Setup/revenuecat.md:74`–`:80` — Paywall + legal links.
- `Setup/revenuecat.md:84`–`:94` — Webhook + secret API key — `api/_lib/revenuecat.ts` consumes both.
- `Setup/revenuecat.md:108`–`:110` — Env vars already set + deployed.
- `Setup/revenuecat.md:128`–`:153` — Android closed-testing + go-live duplicates of `Setup/android.md`; iOS Customer Center / submission belongs to Phase 6.
- `Setup/lemonsqueezy.md:17`, `:19`, `:20` — Store config done.
- `Setup/lemonsqueezy.md:29`–`:44` — Pro + Max products configured (variant IDs consumed by code).
- `Setup/lemonsqueezy.md:59`–`:62` — API key issued + stored in Vercel.
- `Setup/lemonsqueezy.md:66`–`:76` — Webhook + events subscribed.
- `Setup/lemonsqueezy.md:91`, `:97`–`:105` — Test-mode round-trip completed (handler shipped + audit_log live).
- `Setup/lemonsqueezy.md:113` — Redeploy after live env vars (one-click chained from M task above).

## Items recommended for full archive (move file to Setup/archive/)

### `Setup/lemonsqueezy.md` — ARCHIVE NOW

44 of 49 tasks stale. The five remaining `M`/`D` items are the **live-mode cutover** (step 8) — that's one launch-day checklist item, not an install runbook. Move the file to `Setup/archive/lemonsqueezy.md` and lift the five live-cutover steps into `LAUNCH_CHECKLIST.md` under "Launch day". The file stays in git for reference; the dashboard stops surfacing 49 false-active tasks.

### `Setup/revenuecat.md` — ARCHIVE NOW

65 of 74 tasks stale (88%). The remaining `M` items are (a) sandbox test rituals that recur every store submission — already covered in `Setup/ios.md` Section 10 and `Setup/android.md` Section 11, and (b) a few env var copy steps that fold under iOS/Android setup. Move to `Setup/archive/revenuecat.md`. The implementation spec lives at `Specs/billing-revenuecat.md` — that's the canonical doc going forward.

### `Setup/ios.md` — KEEP, BUT MARK DEFERRED

Only 24 of 80 are stale, but iOS is Phase 6 (post-launch). The 53 manual items are real future work — they shouldn't be discarded, just not counted as active backlog. Suggest: rename folder to `Setup/iOS-deferred/` or add a prominent `> Status: Phase 6 — not active until web launch ships` banner that the dashboard reads to demote the file.

### `Setup/android.md` — KEEP ACTIVE

Most actionable file. 39 manual + 4 code + 1 decision. This is the live mobile track. Two code items worth raising:
1. `Setup/android.md:103` — env var vs `keystore.properties` mismatch with current `build.gradle`. Resolve which signing-secret mechanism wins.
2. `Setup/android.md:141` — manifest declares `everionmind.com` intent filter, doc says `everion.smashburgerbar.co.za`. Pick a host and align doc + manifest + `public/.well-known/assetlinks.json`.
