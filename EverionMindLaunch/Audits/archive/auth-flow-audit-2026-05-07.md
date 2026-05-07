# Auth Flow Audit — 2026-05-07

> Login + signup + OAuth + magic-link + password + recovery + session lifecycle. Top of every funnel — every issue here either blocks signups or compromises the entire app.

## Verdict

**Three providers wired, all routed through Supabase Auth.** Magic-link OTP, password (signup + signin), Google OAuth. Password strength meter present. Session lifecycle handled by `onAuthStateChange` listeners in `App.tsx`, `Everion.tsx`, `authFetch.ts`. Sign-out clears the Supabase session.

**Two real findings**: (a) the `redirectUrl()` helper falls back to `window.location.origin` if `VITE_APP_URL` is unset, opening an open-redirect surface on preview deployments; (b) JWT cache TTL still 30 s server-side (carried).

Login/signup is ready for closed beta. Two line-level fixes lift it to production-grade before public launch.

---

## What's solid

- **Three auth providers wired**: magic-link OTP, password, Google OAuth (`useAuthFlow.ts:48,87,128`).
- **Password strength meter** (`LoginScreen.tsx:62-72`): 5-point scale (length, mixed case, digit, symbol, length-14 bonus). Min length 10 enforced (`useAuthFlow.ts:182`).
- **Magic-link OTP fallback**: if the email link doesn't redirect properly, user can paste the 6-8 digit code (`handleVerifyOtp` at `useAuthFlow.ts:61`).
- **Friendly error mapping** via `friendlyError(error.message)` — Supabase error strings translated to user-readable copy.
- **Invite-token preservation through sign-up**: `redirectUrl()` parses `?invite=<token>` and round-trips it through email confirmation (`useAuthFlow.ts:11-14`). Validates token shape (`/^[0-9a-f]{64}$/`).
- **Auto-default to password mode** if invite is pending — matches the "invitee usually doesn't have an account yet" path (`useAuthFlow.ts:34, 43`).
- **`onAuthStateChange` listeners** in `App.tsx:235`, `Everion.tsx:330`, `authFetch.ts:8` — clear stale state on sign-out, refresh tokens before expiry.
- **`refreshSession()`** called in `authFetch.ts:55` when a 401 is detected — auto-recovers from short-lived token expiry.
- **Sign-out** calls `supabase.auth.signOut()` (`AccountTab.tsx:116`, `SettingsView.tsx:675`) — clears the session server-side, not just client-side.
- **Sentry init gated by consent** (`src/main.tsx:87`) — no auth-flow telemetry leaks before consent.
- **Login screen has no horizontal scroll, focus traps, skip-to-content** — verified in earlier frontend audit.

## Findings

### F1 — Open-redirect surface in `redirectUrl()`
**Severity: HIGH**

`src/hooks/useAuthFlow.ts:5-19`:

```ts
function redirectUrl(): string {
  const raw = import.meta.env.VITE_APP_URL || window.location.origin;
  const base = raw.startsWith("http") ? raw : `https://${raw}`;
  …
  return base;
}
```

If `VITE_APP_URL` is unset (or empty string), the helper trusts `window.location.origin`. On a Vercel preview deployment (`*.vercel.app`), or if a phisher hosts the app at `evil.com` and a user clicks a magic-link from there, `emailRedirectTo` lands at the attacker domain. Supabase Auth honours that redirect target on first session, so the session JWT lands at `evil.com`.

**Three call sites** all read this helper:
- magic-link send (`handleSend` line 54)
- password sign-up (`handlePasswordSignUp` line 95)
- Google OAuth (`handleGoogleSignIn` line 133)

**Mitigation in production**: `VITE_APP_URL` must be set (current value should be `https://everion.smashburgerbar.co.za` or the new domain after week-2 cutover). On previews, this is unset by default — a malicious actor sharing a preview URL gets a working OAuth flow that lands on the preview deployment. **Vercel deployment protection** (the SSO gate) blocks preview access today, so the practical exposure is low — but the helper itself shouldn't trust `window.location.origin`.

**Fix**:
```ts
function redirectUrl(): string {
  const raw = import.meta.env.VITE_APP_URL;
  if (!raw) {
    // Fail closed — never trust window.location.origin for OAuth redirects.
    throw new Error("VITE_APP_URL is required for auth redirects");
  }
  const base = raw.startsWith("http") ? raw : `https://${raw}`;
  …
}
```

Or maintain an allowlist: `["https://everionmind.com", "https://everion.smashburgerbar.co.za"]` and throw if `window.location.origin` is not in it. The Supabase project's Auth → URL Configuration → Redirect URLs already enforces an allowlist server-side, so a malicious redirect would actually be rejected by Supabase — but defence in depth, and the user gets a confusing error rather than a hijacked session.

### F2 — JWT verification cache TTL still 30 s (carried)
**Severity: MEDIUM**

`api/_lib/verifyAuth.ts:8` — `CACHE_TTL_MS = 30_000`. Token revoked in the last 30 s could still be honoured. Comment at line 19 acknowledges the trade-off but not for a vault/billing app.

**Fix**: drop to `5_000`. Already on `production-audit-2026-05-07.md` top actions list.

### F3 — No client-side rate-limit feedback on auth endpoints
**Severity: LOW**

`useAuthFlow.ts` calls `supabase.auth.signInWithOtp` / `signInWithPassword` / `signInWithOAuth` directly. Supabase Auth has its own rate-limiter, but the client doesn't show "Too many attempts — try again in N seconds". A rapid-fire user (or attacker) gets generic `friendlyError(error.message)` text.

**Fix**: detect Supabase rate-limit errors (status 429 or message includes "rate limit") and surface a count-down. ~30 min UI work.

### F4 — Magic-link OTP code not stripped of whitespace before display
**Severity: LOW** UX polish

`handleVerifyOtp` line 68 trims `otpCode.trim()` but the input field doesn't auto-strip pasted whitespace. If a user copies the code from email with trailing whitespace, the visible input shows whitespace until they manually fix it.

**Fix**: `setOtpCode(e.target.value.trim().slice(0,8))` in the input handler.

### F5 — Password sign-up returns `data.user` without verifying email
**Severity: LOW** by design — verify

`handlePasswordSignUp` line 92-98:
```ts
const { error, data } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
…
else if (data?.user) setSignupSuccess(true);
```

Supabase returns `data.user` even when email-confirmation is required. The `setSignupSuccess(true)` UI shows "check your email" — correct. But if Supabase Auth → Email Confirmation is **disabled** in the dashboard, `data.user` means an immediately-signed-in account without confirmed email. **Verify** the dashboard setting requires email confirmation; otherwise unconfirmed accounts can sign in.

### F6 — Recovery / reset-password flow not exercised in this audit
**Severity: INFO**

`/reset-password` route exists (visible in `robots.txt` Disallow list). Flow not walked through in this audit — separate audit candidate.

---

## Verification gauntlet

```bash
# Confirm VITE_APP_URL is required (after F1 fix lands):
grep -n "VITE_APP_URL" .env.example src/hooks/useAuthFlow.ts
# Expected: documented in env.example with a clear "REQUIRED" tag

# Confirm Supabase redirect allowlist matches production:
# (Supabase dashboard → Auth → URL Configuration)
# Should contain only: https://everion.smashburgerbar.co.za, https://everionmind.com
```

## Recommendations (priority)

1. **[HIGH] F1** — fail closed in `redirectUrl()` when `VITE_APP_URL` is unset. ~5 min.
2. **[MEDIUM] F2** — drop `verifyAuth.ts:8` TTL `30_000 → 5_000`. 1 line.
3. **[INFO] F5** — confirm Supabase Auth requires email confirmation; if not, enable it.
4. **[LOW] F3** — surface Supabase rate-limit errors with a count-down. ~30 min.
5. **[LOW] F4** — auto-trim OTP input. 1 line.
6. **[INFO]** schedule a `/reset-password` flow audit separately (F6).

## Method

- Read `src/hooks/useAuthFlow.ts` (the orchestrator) end-to-end.
- Walked `src/LoginScreen.tsx` for UI bindings.
- Confirmed `onAuthStateChange` subscribers via grep across `src/`.
- Cross-referenced `production-audit-2026-05-07.md` (W1 carried).
- Did not exercise the live OAuth flow in this audit (separate Playwright e2e exists in `e2e/specs/auth.spec.ts`).

**Audit kicked off by**: user request "do all those highest-leverage audits" on 2026-05-07.
