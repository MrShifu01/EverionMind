# iOS setup runbook — DEFERRED to Phase 6 (post-launch)

> **STATUS: DEFERRED 2026-05-11.** iOS submission is Phase 6 — explicitly post-launch per `CLAUDE.md` and the `Roadmap/beta-phase.md` Android-first decision (2026-05-05). The 53 manual items in this file are real future work, not stale. They just shouldn't count against the active pre-launch sprint.
>
> File moved to `Setup/archive/` so the dashboard hides it from default task views. Promote individual items back into `LAUNCH_CHECKLIST.md` when the iOS sprint begins (Android needs 30 days of stable production data and zero S1 incidents first — see `LAUNCH_CHECKLIST.md § Post-launch — iOS launch sprint`).

---

# iOS setup runbook

Apple Developer + App Store Connect + Xcode signing. The Capacitor wrap is shipped (`capacitor.config.ts`, bundle id `com.everionmind.app`). This is the operator-side Apple work needed before you can build, ship to TestFlight, or publish to the App Store.

> **Submission flow** (after this is set up): `Mobile/ios-submission.md` covers TestFlight / review / release.
> **Build flow**: `Mobile/capacitor-build.md` covers `cap sync` and Xcode build steps.

## Prerequisites

- [ ] Apple ID with 2FA enrolled (mandatory for Developer Program)
- [ ] Mac with Xcode 15+ installed
- [ ] Credit card for Apple Developer Program ($99/year)

## 1. Apple Developer Program enrolment

- [ ] https://developer.apple.com/programs/ → **Enroll**
- [ ] **Entity type**:
  - **Individual** if you're billing as a sole proprietor (fastest, no DUNS required)
  - **Organization** if you have a company (requires DUNS number — apply at https://www.dnb.com if you don't have one; takes 1-2 weeks)
- [ ] Pay the $99 annual fee
- [ ] Wait for approval (24-48h for individual, longer for org)

## 2. Bundle ID + App ID

- [ ] developer.apple.com → **Certificates, IDs & Profiles** → **Identifiers** → **+**
- [ ] **App IDs** → **App** → continue
- [ ] **Description**: `Everion Mind`
- [ ] **Bundle ID**: Explicit → `com.everionmind.app`
- [ ] **Capabilities** to enable:
  - [ ] **In-App Purchase** (required for RC)
  - [ ] **Push Notifications** (required for VAPID push)
  - [ ] **Sign in with Apple** (if you offer it — currently no, skip)
  - [ ] **Associated Domains** (for Universal Links — invite emails)
- [ ] Save

## 3. App Store Connect — create the app

- [ ] https://appstoreconnect.apple.com → **My Apps** → **+** → **New App**
- [ ] **Platform**: iOS
- [ ] **Name**: `Everion Mind`
- [ ] **Primary language**: English (U.K.) or English (U.S.) — pick once, can't change
- [ ] **Bundle ID**: select `com.everionmind.app` from the dropdown
- [ ] **SKU**: any unique string, e.g. `EVERIONMIND001`
- [ ] **User Access**: Full Access (or Limited if multiple devs)
- [ ] Create

## 4. App Store Connect API key (for RevenueCat)

RC uses this to read your products + listen for receipt validation events.

- [ ] App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API**
- [ ] **Generate API Key** → name `RevenueCat`
- [ ] **Access**: Admin
- [ ] **Download the .p8 file immediately** — Apple shows it once
- [ ] Note the **Key ID** + **Issuer ID** (shown on the same page)
- [ ] Hand all three (`.p8` content, Key ID, Issuer ID) to `Setup/revenuecat.md` step 2

## 5. Subscription products

- [ ] App Store Connect → your app → **Monetization** → **Subscriptions**
- [ ] Create **Subscription Group**: `Everion Mind Pro`
  - All your subs go in here so users can upgrade/downgrade between them without separate purchases
- [ ] Add three subscriptions to the group:
  - [ ] Product ID: `monthly` — Display Name: `Pro Monthly` — Duration: 1 Month
  - [ ] Product ID: `yearly` — Display Name: `Pro Yearly` — Duration: 1 Year
  - [ ] Product ID: `lifetime` — Display Name: `Lifetime Access` — Duration: Lifetime (non-renewing)
- [ ] For each subscription:
  - [ ] **Localized pricing**: ZA + US + your other launch markets (or Apple's auto-tier mapping)
  - [ ] **Display Name** + **Description** per locale
  - [ ] **Promotional Image** (1024x1024) — for App Store search results
  - [ ] **Review Information**: paywall screenshot + reviewer notes (e.g. "Test sandbox tier with sandbox account `tester@everionmind.com`")
  - [ ] **Tax Category**: select per Apple's tax classification (usually Apps, Software, or Services)

## 6. Sandbox tester

Required for in-app purchase testing without real money.

- [ ] App Store Connect → **Users and Access** → **Sandbox** → **Testers** → **+**
- [ ] **Email**: a fake email (Apple doesn't send anything; e.g. `tester+everionmind@anywhere.com`)
- [ ] **Password**: strong, save it in 1Password
- [ ] **Country/Region**: ZA (or the market you're testing)
- [ ] Save
- [ ] On your test device: Settings → App Store → Sandbox Account → sign in with the tester credentials

## 7. Push notification certificate

For VAPID push (already wired server-side via the cron-hourly endpoint).

- [ ] App Store Connect → **Users and Access** → **Keys** → **+** under APNs
- [ ] **Name**: `Everion Mind APNs`
- [ ] **Services**: Apple Push Notifications service (APNs)
- [ ] Download the `.p8`, save the Key ID + Team ID
- [ ] These get configured in your push backend (Vercel env: `APN_KEY`, `APN_KEY_ID`, `APN_TEAM_ID` — confirm exact names against `Ops/env-vars.md`)

## 8. Universal Links / Associated Domains

For invite emails that should open the app instead of the website.

- [ ] App Store Connect → your app → **App Information** → **Associated Domains** (or in Xcode → Signing & Capabilities)
- [ ] Add: `applinks:everion.smashburgerbar.co.za`
- [ ] Host an `apple-app-site-association` JSON file at `https://everion.smashburgerbar.co.za/.well-known/apple-app-site-association` (no `.json` extension, must be served as `application/json`)

## 9. Xcode project signing

- [ ] `npx cap open ios` to open the Xcode project
- [ ] Select the project → **Signing & Capabilities**
- [ ] **Team**: select your Apple Developer team
- [ ] **Bundle Identifier**: confirm `com.everionmind.app`
- [ ] **Automatically manage signing**: ON (Xcode handles provisioning profiles)
- [ ] **Capabilities** added:
  - [ ] In-App Purchase
  - [ ] Push Notifications
  - [ ] Associated Domains → `applinks:everion.smashburgerbar.co.za`
  - [ ] (If using Face ID for vault) Privacy → Face ID Usage Description in Info.plist

## 10. Build + run on device

- [ ] Plug in a real iPhone (sandbox IAP doesn't work in simulator)
- [ ] Trust the Mac on the phone
- [ ] In Xcode, select the device as run target
- [ ] Cmd+R to build and run
- [ ] App should open. Sign in to your Supabase user. Open Settings → Billing → Upgrade. Paywall should present.

## 11. TestFlight upload (first build)

- [ ] Xcode → Product → Archive
- [ ] Once archived → **Distribute App** → **App Store Connect** → **Upload**
- [ ] Wait for Apple's processing (~15-30 min)
- [ ] App Store Connect → your app → **TestFlight** → **iOS Builds** → the build appears
- [ ] Add testers (internal testers = team members; external testers = anyone with email + Apple ID)
- [ ] Internal testers can install immediately. External testers go through Apple Beta Review (~24h first time).

## Troubleshooting

- **"No identity found"** → Apple Developer account isn't linked in Xcode. Xcode → Settings → Accounts → add Apple ID with team access.
- **Provisioning profile error** → "Automatically manage signing" should resolve it. If not, manually generate at developer.apple.com → Certificates, IDs & Profiles → Profiles.
- **"This bundle is invalid. The bundle is missing the iOS app icon"** → Xcode → AppIcon → ensure all sizes filled. Use `npx capacitor-assets generate --ios` to regen from the master in `resources/`.
- **IAP test purchase fails on device** → not signed in to Sandbox Account in Settings. Or the subscription isn't approved in App Store Connect (status must be "Ready to Submit" or "Approved").
- **Push not working** → `entitlements` file might not include `aps-environment` after Xcode capability add. Confirm the entitlements file shows `<key>aps-environment</key><string>development</string>` (or `production`).

## What's next

Once iOS setup is done:
- [ ] `Setup/revenuecat.md` step 2 — wire iOS to RevenueCat
- [ ] `Mobile/ios-submission.md` — App Store review submission

## Related

- `capacitor.config.ts` — bundle id, web dir, plugin config
- `Mobile/ios-submission.md` — submission + review flow
- `Mobile/capacitor-build.md` — build runbook
- `Setup/revenuecat.md` — RC dashboard setup (uses iOS app + API key)
- Apple Developer: https://developer.apple.com
- App Store Connect: https://appstoreconnect.apple.com
