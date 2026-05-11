# Android setup runbook

Google Play Developer Console + Android Studio + signing keystore. Capacitor wrap is shipped (`capacitor.config.ts`, package id `com.everionmind.app`). This is the operator-side Google work needed before you can build a release AAB, ship to Internal Testing, or publish to Play Store.

> **Submission flow** (after this is set up): `Specs/play-console-submission.md` covers Internal Testing → Production track flow.
> **Build flow**: `Mobile/capacitor-build.md` covers `cap sync` and Android Studio build steps.

## Prerequisites

- [ ] Google account with 2FA enrolled
- [ ] Android Studio installed (Hedgehog 2023.1+ minimum)
- [ ] JDK 17 installed (Android Studio bundles one)
- [ ] $25 one-time Google Play Console registration fee

## 1. Google Play Console registration

- [ ] https://play.google.com/console → **Create developer account**
- [ ] **Account type**:
  - **Personal** if billing as a sole proprietor
  - **Organization** if you have a registered company (requires DUNS — apply at https://www.dnb.com if you don't have one)
- [ ] Pay the $25 one-time registration fee
- [ ] Identity verification (Google may require ID upload — varies by region)
- [ ] Wait for approval (instant to 48h)

## 2. Create the app

- [ ] Play Console → **All apps** → **Create app**
- [ ] **App name**: `Everion Mind`
- [ ] **Default language**: English (United Kingdom) or English (United States)
- [ ] **App type**: App
- [ ] **Free or paid**: Free (subscriptions handled in-app)
- [ ] Accept Play Store Terms
- [ ] Create

## 3. Service account (for RevenueCat)

RC uses this to validate Play receipts and read product info.

- [ ] Google Cloud Console (linked from Play Console settings) → **IAM & Admin** → **Service Accounts** → **Create**
- [ ] **Name**: `revenuecat-everionmind`
- [ ] **Role**: at minimum `Service Account User` (RC docs detail the exact roles — usually `Pub/Sub Editor` and `Service Usage Consumer`)
- [ ] Create + skip optional steps
- [ ] Click the service account → **Keys** → **Add Key** → **JSON** → download
- [ ] Save the JSON — this gets uploaded to RC at `Setup/revenuecat.md` step 3
- [ ] In Play Console → **Setup** → **API access** → link the Google Cloud project → grant the service account **Financial data, app management** access

## 4. Subscription products

- [ ] Play Console → your app → **Monetize** → **Subscriptions**
- [ ] Create **Subscription**: ID `monthly`
  - Add **Base plan**: `monthly-base`, billing period **1 month**, auto-renewing
  - Set price for ZA + US + your launch markets
- [ ] Create **Subscription**: ID `yearly`
  - Base plan: `yearly-base`, billing period **1 year**
- [ ] Create **Subscription**: ID `lifetime`
  - Base plan: `lifetime-base`, billing period **lifetime** (or use a one-time product if Play doesn't support lifetime sub directly — check current Play docs)
- [ ] For each subscription:
  - [ ] **Title** + **Description** localised
  - [ ] **Activate** the subscription
- [ ] Save

## 5. Generate the upload signing key (keystore)

This is what signs your app for upload to Play. Different from Play's own signing key (which they manage post-upload).

```bash
# From the project root
cd android
keytool -genkey -v -keystore everion-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias everion
```

- [ ] Set a strong **keystore password** — save in 1Password under `Everion Mind / Android upload keystore`
- [ ] Set a strong **key password** (can be same as keystore password)
- [ ] Fill in the certificate info (Common Name = `Everion Mind`, etc.)
- [ ] **The `everion-release.jks` file is irreplaceable** — back it up to a secure location (1Password attachments, encrypted backup, etc.). If you lose it, you can never publish updates to this app.

## 6. Configure Gradle to use the keystore

`android/app/build.gradle` already reads its signing config from `android/keystore.properties` (gitignored). The template lives at `android/keystore.properties.example`. The mechanism: build.gradle calls `keystoreProperties.load(...)` and falls back to debug signing when the file is missing, so `./gradlew assembleDebug` keeps working in CI without secrets.

Copy the template and fill it in:

```bash
cp android/keystore.properties.example android/keystore.properties
# Edit android/keystore.properties:
#   storeFile=everion-release.jks
#   storePassword=<keystore password>
#   keyAlias=everion
#   keyPassword=<key password>
```

- [ ] Both `android/keystore.properties` and the `.jks` file are already in `android/.gitignore` (verified 2026-05-11). Confirm before running `git add` after this step.
- [ ] Test build: `cd android && ./gradlew bundleRelease` should produce `android/app/build/outputs/bundle/release/app-release.aab`.
- [ ] If you build AABs in GitHub Actions later: stage `keystore.properties` and the `.jks` via base64-encoded repo secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PROPS_BASE64`), decode at job start. Do **not** use `ANDROID_KEY_PASSWORD` / `ANDROID_STORE_PASSWORD` env vars — build.gradle no longer reads them.

## 7. First AAB upload to Internal Testing

Internal Testing track is the fastest way to test signed builds — instant rollout to up to 100 testers.

- [ ] Play Console → your app → **Testing** → **Internal testing** → **Create new release**
- [ ] Upload `app-release.aab`
- [ ] **Release name**: `1.0.0 (1)` (matches `versionName (versionCode)` in `build.gradle`)
- [ ] **Release notes**: any text — visible to testers
- [ ] Save → **Review release** → **Start rollout to Internal testing**
- [ ] Add testers: **Testers** tab → **Create email list** → add tester emails → save
- [ ] Copy the **opt-in URL** → send to testers
- [ ] Testers click the URL → "Become a tester" → install via Play Store

## 8. Play App Signing (mandatory since 2021)

When you upload your first AAB, Play will prompt you to enrol in **Play App Signing**.

- [ ] Accept the enrolment
- [ ] Play generates an **app signing key** that they manage. Your **upload key** (from step 5) only signs uploads to Google; Google re-signs with the app signing key before distributing to users.
- [ ] **Download the signing certificate (`SHA-256` fingerprint)** — needed for any service that needs to verify your app's identity (e.g. Firebase, Universal Links). Play Console → Setup → App integrity → App signing.

## 9. Permissions + manifest declarations

Android manifest changes Capacitor doesn't auto-add — confirm these are in `android/app/src/main/AndroidManifest.xml`:

- [ ] `<uses-permission android:name="com.android.vending.BILLING" />` (auto-added by purchases-capacitor)
- [ ] `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />` (Android 13+ for push)
- [ ] `<uses-permission android:name="android.permission.RECORD_AUDIO" />` (voice capture)
- [ ] `<uses-permission android:name="android.permission.INTERNET" />` (auto-added)
- [ ] `<uses-permission android:name="android.permission.USE_BIOMETRIC" />` (vault biometric unlock — if shipped)

## 10. Universal Links / App Links

For invite emails that open the app instead of a browser.

- [x] **Intent filter already shipped** in `android/app/src/main/AndroidManifest.xml` (lines 36-43). Targets `everionmind.com` with `/invite/`, `/share/`, `/auth/callback` path prefixes. `autoVerify="false"` until the assetlinks fingerprint below is real — flip to `"true"` once Play App Signing returns the production SHA256:
  ```xml
  <intent-filter android:autoVerify="false">
      <action android:name="android.intent.action.VIEW" />
      <category android:name="android.intent.category.DEFAULT" />
      <category android:name="android.intent.category.BROWSABLE" />
      <data android:scheme="https" android:host="everionmind.com" android:pathPrefix="/invite/" />
      <data android:scheme="https" android:host="everionmind.com" android:pathPrefix="/share/" />
      <data android:scheme="https" android:host="everionmind.com" android:pathPrefix="/auth/callback" />
  </intent-filter>
  ```
  > **Host note:** the shipped manifest targets `everionmind.com` (the planned production domain), not the current beta host `everion.smashburgerbar.co.za`. If the brand-name decision moves the production domain, update both this manifest block and the assetlinks file URL below in a single pass.
- [ ] Host the **assetlinks** JSON at `https://everionmind.com/.well-known/assetlinks.json` (matches the manifest host). The file template already lives at `public/.well-known/assetlinks.json` with a placeholder `REPLACE_WITH_PRODUCTION_KEYSTORE_SHA256_FINGERPRINT` — replace once Play App Signing returns the real fingerprint from step 8:
  ```json
  [{
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.everionmind.app",
      "sha256_cert_fingerprints": ["<paste from step 8>"]
    }
  }]
  ```

## 11. Sandbox / test purchase

Play has its own sandbox flow:

- [ ] Play Console → **Setup** → **License testing** → add tester email addresses (these accounts get test cards in the Play Store)
- [ ] On a test device, sign in to the Play Store with the tester account
- [ ] Install the app via the Internal Testing opt-in URL (NOT a sideloaded APK — IAP requires Play Store install)
- [ ] Settings → Billing → Upgrade → paywall presents
- [ ] Purchase — test card auto-applied for license tester accounts
- [ ] Confirm same flow as iOS: optimistic isPro flip, webhook fires, tier updates

## 12. Open Testing → Production

Once Internal Testing is solid:
- [ ] **Open Testing** track (limited rollout, no review delay) → broader beta
- [ ] **Production** → triggers Play review (1-7 days first time, then often hours for updates)
- [ ] Staged rollout: start at 10% → 50% → 100% over a week to catch crashes early

## Troubleshooting

- **"Your app is using a deprecated target SDK"** → bump `targetSdkVersion` in `android/build.gradle`. Play requires you stay within ~2 years of the latest.
- **Upload AAB rejected** → version code already used. Bump `versionCode` in `android/app/build.gradle` (must be monotonically increasing).
- **IAP test purchase fails** → tester not in the License Testing list, or app installed via APK sideload (must be Play Store install). Or subscription not activated in Play Console.
- **Service account can't read Play data** → IAM role missing on Google Cloud side. RC docs list the exact roles. Re-grant if RC dashboard shows "Service account credentials invalid."
- **Universal Links don't open the app** → `assetlinks.json` not served as `application/json`, or wrong SHA-256 in it (must be the **app signing** fingerprint from step 8, not the upload keystore).

## What's next

- [ ] `Setup/revenuecat.md` step 3 — upload service account JSON to RC
- [ ] `Specs/play-console-submission.md` — Production rollout flow
- [ ] `Specs/android-qa-matrix.md` — device QA before launch

## Related

- `capacitor.config.ts` — package id, web dir
- `Mobile/capacitor-build.md` — build runbook
- `Specs/play-console-submission.md` — Production submission
- `Specs/android-qa-matrix.md` — QA device matrix
- `Setup/revenuecat.md` — RC dashboard setup
- Play Console: https://play.google.com/console
- Android Developer: https://developer.android.com
