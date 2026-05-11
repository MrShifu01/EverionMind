# RevenueCat setup runbook — ARCHIVED 2026-05-11

> **STATUS: ARCHIVED.** Integration shipped 2026-04-30 (commit `c484030`) and 2026-05-06 (commit `3814d13`); RC dashboard configured. 65 of 74 steps in this file were already done by the time the dashboard parsed it.
>
> Remaining live work folds elsewhere: sandbox-test rituals before each store submission live in `Setup/ios.md` § 10 and `Setup/android.md` § 11. The implementation spec is `Specs/billing-revenuecat.md` — that's the canonical doc going forward.
>
> Kept for historical reference in case a future operator needs to re-bootstrap the RC dashboard from scratch.

---

# RevenueCat setup runbook

Mobile IAP provider — wraps Apple StoreKit + Google Play Billing. Code is shipped (`src/lib/revenuecat.ts`, `src/hooks/useRevenueCatEntitlement.ts`, `api/user-data.ts:handleRevenueCatWebhook`, paywall + customer center wired in `BillingTab.tsx`). This is the operator-side dashboard work.

> **Implementation spec**: `Specs/billing-revenuecat.md` — architecture, file map, edge cases, glossary.
> **Why split web (LS) and mobile (RC)?** See `Legal/pricing-billing.md` § Billing providers — `Decided 2026-05-06` block.

## Prerequisites

- [ ] Apple Developer account active — see `Setup/ios.md`
- [ ] Google Play Developer account active — see `Setup/android.md`
- [ ] Bundle id `com.everionmind.app` registered in both
- [ ] App Store Connect API key generated (for RC to read iOS products)
- [ ] Play Console service account JSON downloaded (for RC to read Android products)

## 1. Create the RevenueCat project

- [ ] Sign up / log in at https://app.revenuecat.com
- [ ] **Create project** → name: `Everion Mind`

## 2. Add the iOS app

- [ ] Project Settings → **Apps** → **New** → **App Store**
- [ ] **Bundle ID**: `com.everionmind.app`
- [ ] **App Store Connect API Key**: paste the `.p8` content + Key ID + Issuer ID (from Apple Developer)
- [ ] **Public SDK Key** (starts with `appl_`): copy — this is `VITE_REVENUECAT_API_KEY_IOS`

## 3. Add the Android app

- [ ] Project Settings → **Apps** → **New** → **Play Store**
- [ ] **Package name**: `com.everionmind.app`
- [ ] **Service Account credentials**: upload the JSON
- [ ] **Public SDK Key** (starts with `goog_`): copy — this is `VITE_REVENUECAT_API_KEY_ANDROID`

## 4. Import products

Once the App Store + Play apps are linked, RC pulls products automatically. Make sure the products exist in both stores first:

- [ ] App Store Connect: `monthly`, `yearly`, `lifetime` subscriptions configured
- [ ] Play Console: same three subscriptions configured + activated

Then in RC:

- [ ] Project → **Products** → click "Import from Apple" → select the three
- [ ] Project → **Products** → click "Import from Google" → select the three
- [ ] Confirm both platforms show identifiers `monthly`, `yearly`, `lifetime`

## 5. Create the entitlement

Single entitlement covering all paid tiers.

- [ ] Project → **Entitlements** → **New entitlement**
- [ ] **Identifier**: `everion_mind_pro` ← MUST match `ENTITLEMENT_ID` in `src/lib/revenuecat.ts`
- [ ] **Display name**: `Everion Mind Pro`
- [ ] Attach all three products (monthly, yearly, lifetime) to this entitlement
- [ ] Save

## 6. Create the offering

Offering = the bundle of packages presented on the paywall.

- [ ] Project → **Offerings** → **New offering**
- [ ] **Identifier**: `default`
- [ ] Add three packages:
  - [ ] `$rc_monthly` → mapped to `monthly` product
  - [ ] `$rc_annual` → mapped to `yearly` product
  - [ ] `$rc_lifetime` → mapped to `lifetime` product (RC has a `$rc_lifetime` reserved identifier)
- [ ] Mark this offering as **Current** (the SDK fetches "current" by default)

## 7. Design the paywall

V2 paywalls — designed in dashboard, no code.

- [ ] Project → **Paywalls** → **New paywall** → **V2 Paywall**
- [ ] Pick a template, customise headline / subhead / colours per `Brand/voice-tone.md`
- [ ] Attach to the `default` offering
- [ ] **Required for App Store review:**
  - [ ] Privacy Policy link → your privacy URL
  - [ ] Terms of Service link → your ToS URL
  - [ ] Restore Purchases button visible (V2 paywalls include this by default)

## 8. Configure the webhook

- [ ] Project → **Integrations** → **Webhooks** → **New**
- [ ] **URL**: `https://everion.smashburgerbar.co.za/api/revenuecat-webhook`
- [ ] **Authorization Header**: generate a strong random string (`openssl rand -hex 32`). Save — this is `REVENUECAT_WEBHOOK_AUTH`. Format the header value as `Bearer <secret>`.
- [ ] **Send all events** initially (filter later if noisy)

## 9. Get the secret API key

For the LemonSqueezy → RC bridge (web payers get RC promotional entitlement so mobile recognises them).

- [ ] Project Settings → **API Keys** → **Secret API key** (server-side; never ships to client)
- [ ] Copy — this is `REVENUECAT_SECRET_API_KEY`

## 10. Set Vercel env vars

```
VITE_REVENUECAT_API_KEY_IOS=<step 2>
VITE_REVENUECAT_API_KEY_ANDROID=<step 3>
REVENUECAT_SECRET_API_KEY=<step 9>
REVENUECAT_WEBHOOK_AUTH=<step 8>
REVENUECAT_STARTER_PRODUCT_ID=
REVENUECAT_PRO_PRODUCT_ID=monthly
REVENUECAT_MAX_PRODUCT_ID=lifetime
```

- [ ] Set in **Production AND Preview** environments
- [ ] Redeploy
- [ ] **Important**: `VITE_*` vars are **build-inlined**. The native build also needs them present locally when running `npm run build && npx cap sync` — they bake into the iOS/Android bundle.

## 11. Sandbox test

**iOS:**
- [ ] App Store Connect → Users and Access → **Sandbox Testers** → create a tester (use a fake email, accept Apple's prompt)
- [ ] On the test device, sign out of the App Store. Sign in to **Sandbox Account** in Settings → App Store
- [ ] Build the app from Xcode onto the device
- [ ] Open Settings → Billing → Upgrade
- [ ] Paywall presents — buy the monthly
- [ ] Confirm:
  - [ ] Paywall closes
  - [ ] `useRevenueCatEntitlement().isPro` flips immediately
  - [ ] Within 5s, `user_profiles.tier` updates to `pro` in Supabase
  - [ ] Vercel function logs show `[revenuecat]` webhook event resolved
  - [ ] Cross-device check: open the same account on web → tier shows Pro

**Android:**
- [ ] Play Console → Testing → **Closed testing** → create track → add the tester's email
- [ ] Tester accepts the invite link, installs from Play Store (not from sideload — IAP requires the Play Store install)
- [ ] Same purchase flow as above

## 12. Restore purchases test

App Store review will reject if Restore doesn't work.

- [ ] Uninstall the app on the test device
- [ ] Reinstall, sign in to the same account
- [ ] Tap Restore Purchases (visible on the V2 paywall)
- [ ] Entitlement returns, tier shows Pro

## 13. Customer Center test

- [ ] Settings → Billing → **Manage Subscription**
- [ ] Customer Center opens (cancel / change plan / refund / contact support)
- [ ] Cancel from inside it
- [ ] Confirm webhook fires `CANCELLATION` and tier drops to `free` after the period ends (sandbox accelerates this — minutes instead of months)

## 14. Go live

- [ ] App Store Connect: submit subscriptions for review (Apple reviews each subscription independently)
- [ ] Play Console: roll out to production track
- [ ] In RC dashboard, no live/test toggle — sandbox vs prod is determined by the device's signing/account state
- [ ] First real purchase: smoke test on a real card with a real Apple/Google ID

## Troubleshooting

- **Paywall shows "NOT_PRESENTED"** → no current offering or no API key configured. Check both.
- **`isPro` flips but tier never updates** → webhook URL wrong or `REVENUECAT_WEBHOOK_AUTH` mismatch. Check Vercel function logs for `[revenuecat]` rejections.
- **Sandbox purchase succeeds but RC dashboard doesn't show the customer** → App Store Connect API key not configured in RC project, or service account JSON not uploaded for Android.
- **"Cannot find packages"** → `default` offering not marked as **Current**, or product identifiers don't match between RC and the stores.
- **Restore returns nothing** → the test device wasn't signed in to the same Apple ID / Google account as the original purchase.

## Related

- `Specs/billing-revenuecat.md` — full implementation spec
- `Setup/lemonsqueezy.md` — web side
- `Setup/ios.md` — Apple Developer + App Store Connect setup
- `Setup/android.md` — Google Play Console setup
- `Ops/env-vars.md` — full env var reference
- RevenueCat docs: https://docs.revenuecat.com
- RC Capacitor: https://www.revenuecat.com/docs/getting-started/installation/capacitor
