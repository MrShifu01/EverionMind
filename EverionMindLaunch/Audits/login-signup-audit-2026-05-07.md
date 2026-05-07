# Login / Signup Surface Audit — 2026-05-07

> Client-side surface audit of `src/LoginScreen.tsx`, `src/hooks/useAuthFlow.ts`, and the `src/views/ResetPasswordView.tsx` recovery view. Server-side flow already covered by `EverionMindLaunch/Audits/archive/auth-flow-audit-2026-05-07.md` — referenced, not re-audited.

## Verdict

**Surface ships, but iOS will zoom every input on focus.** Every text input on the login surface uses `fontSize: 15` — Safari iOS auto-zooms anything under 16px on focus, then leaves the page scaled until the user pinches out. Three inputs (login email line 517, password line 565, magic-link email line 808) plus both `ResetPasswordView` inputs (line 117) all hit this bug. OTP input (line 915) at 28px is fine.

**No `SignupModal.tsx` exists.** Audit scope named one — repo doesn't contain one (verified via filesystem search and grep across `src/`). Signup happens inline in `LoginScreen` via the password form (`isSigningUp` branch, lines 459-681) or the magic-link OTP path. No modal to focus-trap, no ESC handler to wire up. Reframed accordingly.

**Two HIGH, three MEDIUM, four LOW findings.** Top priority: ship the iOS-zoom fix (one CSS line), add a "Forgot password?" entry point to the password sign-in form (currently no path from the UI to `ResetPasswordView` — recovery emails would arrive only if Supabase Dashboard sends one manually), and fix `outline: none` without a `:focus-visible` ring on every input.

`redirectUrl()` (`src/hooks/useAuthFlow.ts:6-7`) **fails closed** when `VITE_APP_URL` is unset — auth-flow F1 fix is in place. Error messages go through `friendlyError()` which **does enumerate accounts** ("There's already an account with that email" — `src/lib/friendlyError.ts:11-12`). OTP `setOtpCode` trims input on every keystroke (line 225 of useAuthFlow). Privacy + ToS links present at line 989-995. Submit buttons disabled during in-flight requests.

---

## Architecture overview

```
src/LoginScreen.tsx   ── single page, four states gated by useAuthFlow flags:
  ├── pre-form CTA          (showForm=false, sent=false, usePassword=false) ── lines 382-456
  │     ├── Continue with Google       → handleGoogleSignIn → supabase.auth.signInWithOAuth
  │     ├── Email me a code             → switchToMagicLink → showForm=true
  │     └── Use password                → switchToPassword  → usePassword=true
  ├── magic-link email form (showForm=true,  sent=false, usePassword=false) ── lines 750-847
  │     └── Send my code                → handleSend → supabase.auth.signInWithOtp
  ├── OTP verification     (sent=true)                                       ── lines 850-979
  │     ├── 6-digit code input          → handleVerifyOtp → supabase.auth.verifyOtp({type:"magiclink"})
  │     ├── Resend code                 → handleResend
  │     └── Use different email         → goBackFromOtp
  └── password form        (usePassword=true)                                ── lines 459-681
        ├── isSigningUp=true            → handlePasswordSignUp → supabase.auth.signUp
        ├── isSigningUp=false           → handlePasswordSignIn → supabase.auth.signInWithPassword
        └── signupSuccess=true          → "Check your email"  ── lines 684-747

src/hooks/useAuthFlow.ts                ── all state + handlers
  ├── redirectUrl()                     ── fails closed when VITE_APP_URL unset (line 7)
  ├── friendlyError                     ── error mapping (src/lib/friendlyError.ts)
  └── 6 boolean state flags             ── show/hide branches above

src/App.tsx (line 180) ──────────────── on hash tokens.type === "recovery"
  └── <ResetPasswordView/>              ── new password + confirm + supabase.auth.updateUser
```

No modal. No focus trap to verify. ESC / outside-click handling is N/A — the surface is a full page.

---

## Form / button inventory

| State | Element | File:line | type / role | Disabled rule | aria notes |
|---|---|---|---|---|---|
| pre-form | Continue with Google | LoginScreen.tsx:412-437 | `<Button>` | `loading` | none — text + svg |
| pre-form | Email me a code | LoginScreen.tsx:444-451 | `<Button variant=outline>` | — | none |
| pre-form | Use password | LoginScreen.tsx:452-454 | `<Button variant=outline>` | — | none |
| password form | Email address | LoginScreen.tsx:501-530 | `<input type=email>` | — | `<label htmlFor>` ✓ |
| password form | Password | LoginScreen.tsx:550-578 | `<input type=password>` | — | `<label htmlFor>` ✓, `minLength` enforced |
| password form | Show / Hide pw toggle | LoginScreen.tsx:579-600 | `<button type=button>` | — | `aria-label` ✓, `aria-pressed` ✓ |
| password form | Back | LoginScreen.tsx:613-621 | `<Button variant=outline>` | — | none |
| password form | Submit (Create / Sign in) | LoginScreen.tsx:622-635 | `<Button type=submit>` | `isPasswordDisabled` | label changes — no `aria-busy` |
| password form | Sign in / Create switch | LoginScreen.tsx:646-655 / 667-676 | `<Button variant=link>` | — | none |
| signup success | Use a different email | LoginScreen.tsx:734-740 | `<Button variant=outline>` | — | none |
| signup success | I clicked it, sign in | LoginScreen.tsx:742-744 | `<Button>` | — | none |
| signup success | Resend the link | LoginScreen.tsx:720-731 | `<Button variant=link>` | `loading` | none |
| magic-link form | Email address | LoginScreen.tsx:792-821 | `<input type=email>` | — | `<label htmlFor>` ✓ |
| magic-link form | Back | LoginScreen.tsx:832-840 | `<Button variant=outline>` | — | none |
| magic-link form | Send my code | LoginScreen.tsx:841-843 | `<Button type=submit>` | `isDisabled` | none |
| OTP | 6-digit code | LoginScreen.tsx:900-932 | `<input inputMode=numeric>` | — | `<label htmlFor>` ✓, `autoComplete="one-time-code"` ✓ |
| OTP | Sign in | LoginScreen.tsx:942-944 | `<Button type=submit>` | `isOtpDisabled` | none |
| OTP | Resend code | LoginScreen.tsx:949-951 | `<Button variant=link>` | `loading` | none |
| OTP | Use different email | LoginScreen.tsx:952-959 | `<Button variant=link>` | — | none |
| ResetPasswordView | New password | ResetPasswordView.tsx:83-90 | `<input type=password>` | — | **NO label, NO aria-label**, only `placeholder` |
| ResetPasswordView | Confirm password | ResetPasswordView.tsx:91-97 | `<input type=password>` | — | **NO label, NO aria-label**, only `placeholder` |
| ResetPasswordView | Set password | ResetPasswordView.tsx:101-103 | `<Button type=submit>` | `busy` | none |

---

## What's solid

- **`redirectUrl()` fails closed** — `useAuthFlow.ts:6-7` throws when `VITE_APP_URL` unset. `getEmailRedirectUrl()` (line 49-58) catches the throw, surfaces friendly error, keeps user on the form. Auth-flow F1 fix is in place. Tested by `tests/components/LoginScreen.test.tsx:163` ("fails closed when VITE_APP_URL is not set").
- **Invite token preserved through redirect** — `redirectUrl()` lines 12-18 — pulls `?invite=<64-hex>` from current URL and re-attaches to `emailRedirectTo` so the App.tsx accept flow fires post-confirmation.
- **OTP input sanitisation on every keystroke** — line 906: `setOtpCode(e.target.value.replace(/[^0-9]/g, ""))`. Plus `useAuthFlow.ts:225` wraps `setOtpCode` in `.trim()`. Pasted "  123 456 \n" becomes "123456". Auto-trim per auth-flow F4 fix.
- **OTP `autoComplete="one-time-code"`** — line 904. iOS Mail / Messages auto-fill works. `inputMode="numeric"` (line 903) brings up the numeric keypad on mobile.
- **Password autocomplete tokens** — line 558: `autoComplete={isSigningUp ? "new-password" : "current-password"}`. Password manager + iOS / Android keychain integrate cleanly. Email field uses `autoComplete="email"` + `inputMode="email"` (lines 509-510, 800-801).
- **Submit buttons disabled in flight** — `isDisabled = loading || !email` (useAuthFlow.ts:212), `isPasswordDisabled = loading || !email || password.length < MIN_PASSWORD_LENGTH` (214), `isOtpDisabled = verifying || otpCode.length < 6 || otpCode.length > 8` (213). Double-submit blocked.
- **Error regions have `role="alert"`** — lines 606, 825, 936. Screen reader announces the error string when it changes.
- **Password strength meter** — `<PasswordStrength>` component (lines 62-105) renders as `role="status" aria-live="polite"`. Real-time feedback on length / casing / digits / specials.
- **Pwd visibility toggle** — `aria-pressed` (line 583) + `aria-label` (line 582) toggles between "Show password" / "Hide password". `aria-hidden="true"` on the eye SVG (line 43).
- **Privacy + ToS visible** — lines 989-995. Plus a "Having trouble?" → /status link. All three legible (`fontSize: 11`, opacity 0.6 — borderline-low contrast — see F6).
- **Document title set per intent** — `useDocumentMeta` line 129-132. `noindex: true` keeps the login page out of search results.
- **`autoFocus` on first interactive input** in every state — lines 508, 799, 908. Tab order is predictable: input → submit → secondary actions.
- **`useAuthFlow` exposes a clean state machine** — six boolean flags + email/password/otp strings. Easy to audit. No race conditions inside the hook (single-await per handler).
- **MIN_PASSWORD_LENGTH = 10** (useAuthFlow.ts:211) + HTML5 `minLength` (line 557). Stricter than Supabase's default 6.
- **Google OAuth via Supabase SDK** (useAuthFlow.ts:160-163) — no token handling client-side; redirects through Supabase, then back to `redirectTo`.

---

## Findings

### F1 — Every text input is `fontSize: 15`, iOS Safari auto-zooms on focus (HIGH)

**Severity: HIGH** — known iOS regression, fix is one line per input.

iOS Safari auto-zooms any `<input>` whose computed font-size is below 16px when focused. The page stays scaled until the user pinches out. Every login text input is below the threshold:

| Input | File:line | `fontSize` |
|---|---|---|
| password form — email | LoginScreen.tsx:517 | 15 |
| password form — password | LoginScreen.tsx:565 | 15 |
| magic-link form — email | LoginScreen.tsx:808 | 15 |
| ResetPasswordView — new password | ResetPasswordView.tsx:117 | 15 |
| ResetPasswordView — confirm password | ResetPasswordView.tsx:117 | 15 |

OTP at line 915 (`fontSize: 28`) is fine.

The project already has the right pattern in `src/design/tokens.css:172` (`.design-input { font-size: 16px; }`) plus a mobile-only guard at line 182-187 (`@media (max-width: 1024px)`). The login inputs don't use the `design-input` class — they ship inline styles.

**Effect on iPhone**: tap the email field, page jumps to ~135% scale, content shifts under fingertip, layout breaks if the form was already vertically tight. First impression of the product is "this app feels broken." Safari iOS shipped this behaviour in iOS 4 — has not changed since.

**Fix**: bump every login input to `fontSize: 16` OR migrate them all to `className="design-input"` and drop the inline font-size. Cost: 5 line edits.

### F2 — No "Forgot password?" entry point (HIGH)

**Severity: HIGH** — recovery flow exists in `App.tsx:180` but no UI path triggers it.

`src/App.tsx:180` mounts `<ResetPasswordView>` when the URL hash contains `tokens.type === "recovery"` — meaning Supabase's `resetPasswordForEmail()` was called somewhere and the user clicked the email link.

**Nowhere in `src/` does any component call `supabase.auth.resetPasswordForEmail()`** (verified via grep — 0 matches). There's no "Forgot password?" link anywhere on `LoginScreen.tsx`. A user who forgets their password has no in-app path to recovery — only the support team triggering one manually via Supabase Dashboard (`EML/Support/account-recovery.md:60` describes that workflow).

This was already flagged in `EML/Audits/email-deliverability-audit-2026-05-07.md:88` ("no `supabase.auth.resetPasswordForEmail` call exists in `src/` (grep: 0 matches)"). It's a bigger problem than email deliverability — it's a missing core flow.

**Effect**: every locked-out user files a support ticket. At launch volume that doesn't scale.

**Fix**:
1. Add a "Forgot password?" link to the password sign-in form (under the password input, line 603 area). Only show when `!isSigningUp`.
2. New state in `useAuthFlow`: `showForgot` boolean + `handleForgotPassword(email)` calling `supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() })`.
3. New branch in `LoginScreen` rendering "Check your email" success state — same pattern as the magic-link `sent` branch.
4. Verify the recovery email template in Supabase Dashboard (Auth → Email Templates → "Reset password") matches the brand voice — that template has never been customised (per email-deliverability audit line 88).

### F3 — `outline: none` on every input with no replacement focus ring (MEDIUM)

**Severity: MEDIUM** — accessibility regression carried from `EML/Audits/accessibility-audit-2026-05-07.md` F3.

Every login input has `outline: "none"` inline:

| File:line | input |
|---|---|
| LoginScreen.tsx:519 | password-email |
| LoginScreen.tsx:567 | password |
| LoginScreen.tsx:810 | magic-link email |
| LoginScreen.tsx:918 | OTP code |
| ResetPasswordView.tsx:119 | password fields (shared `inputStyle`) |

The focus state is signalled only by border-color change (lines 524-526, 572-574, 815-817, 926-928 — `onFocus` swaps `borderColor` to `var(--color-primary)`, ~1px difference from the default `var(--color-outline-variant)`). Keyboard-only users (Tab traversal) get a barely-visible cue. Screen-reader users + sighted-keyboard-users are penalised; trackpad / mouse users don't notice.

WCAG 2.4.7 (Focus Visible) is at risk — the visible focus indicator must be perceivable. A 1px border-colour change against a low-contrast surface fails most contrast measurements.

**Fix**: replace `outline: "none"` with `outline: "2px solid transparent"` and add a `:focus-visible` ring, OR keep `outline: "none"` and add `boxShadow: "0 0 0 2px var(--color-primary-container)"` on focus. Match what `Button` already does (`focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` — `src/components/ui/button.tsx:21`).

### F4 — Error copy enumerates account existence (MEDIUM)

**Severity: MEDIUM** — account-enumeration via timing + error-string differential.

`src/lib/friendlyError.ts` distinguishes:
- line 7-8: `"That email and password didn't match. Please try again."` (`invalid login credentials`)
- line 11-12: `"There's already an account with that email. Try signing in instead."` (`user already registered`)
- line 9-10: `"Check your email and click the confirmation link before signing in."` (`email not confirmed`)

An attacker probing emails on the signup form gets a stable signal:
- email exists, confirmed → "There's already an account with that email"
- email exists, unconfirmed → "Check your email and click the confirmation link"
- email free → success path (signupSuccess=true)

Same on the password sign-in form — different errors for "no such user" vs "wrong password" leak which emails are registered.

**Mitigation in place**: Supabase Auth applies its own rate-limiting (~30/hour per IP). An attacker still extracts ~700 valid emails per day per IP, more from a botnet.

**Fix path**:
1. Collapse all auth errors on the sign-in form to one constant-time message: `"That didn't work. Check your email and password, or try a magic link instead."`
2. On the signup form, after `signUp({ email })`: always show `"Check your email — if you don't have an account, we sent a confirmation link"`. Don't differentiate "already registered" — Supabase Auth handles the dedupe server-side and sends a different email to existing users (account exists notification vs confirmation).
3. Keep the `email_not_confirmed` differentiation on sign-in only — it's a usability vs security tradeoff and the user is already authenticated to that email.

This is a known launch-blocker for any product handling secrets (Everion has the encrypted vault). Account enumeration → targeted phishing → vault attack. Fix before public launch.

### F5 — No 429 retry-after surfacing (MEDIUM)

**Severity: MEDIUM** — UX gap, no feedback signal beyond generic text.

`friendlyError.ts:13-14`:
```ts
if (m.includes("rate limit") || m.includes("for security purposes"))
  return "Too many attempts. Please wait a minute and try again.";
```

Hard-coded "a minute" — Supabase Auth's actual retry-after varies (default 60s for OTP, 300s for password attempts after 5 failures). The user is told "wait a minute", waits, re-tries, hits 429 again, re-tries again, hits 429 again. Perceived as "the app is broken" rather than "I'm being throttled."

Supabase JS SDK exposes the rate-limit window in the error response — `error.message` includes "after X seconds" sometimes; the structured details are richer if we read them.

**Fix**:
1. Parse the rate-limit response for the actual retry-after.
2. Surface a countdown: "Too many attempts. Try again in 47 seconds." with a `setInterval` decrementing in the error region.
3. Disable the submit button until the countdown reaches zero.

Not launch-blocking but reduces support load.

### F6 — Privacy / ToS / Status links are below WCAG AA contrast (MEDIUM)

**Severity: MEDIUM** — legal copy must be perceivable.

LoginScreen.tsx:980-1000:
```tsx
<p style={{
  marginTop: 24,
  fontSize: 11,                           // ← below WCAG minimum 12px
  color: "var(--color-on-surface-variant)",
  opacity: 0.6,                           // ← compounds the contrast hit
  textAlign: "center",
}}>
```

`fontSize: 11` × `opacity: 0.6` against `var(--bg)` is, in practice, illegible on most ambient-lit phone screens. These are the **legal** links — Privacy Policy + Terms of Service are conditions of signup. If they can't be read, consent is contestable.

**Fix**: bump to `fontSize: 12`, drop `opacity` to 1, use `var(--color-on-surface-variant)` directly (it's already designed for low-emphasis). Costs ~2 lines of contrast.

### F7 — `ResetPasswordView` inputs have no `<label>` and no `aria-label` (LOW)

**Severity: LOW** — accessibility, only reachable via emailed recovery link.

`src/views/ResetPasswordView.tsx:83-97` — both password inputs use `placeholder="New password"` / `placeholder="Confirm password"` with no `<label>`, no `aria-label`, no `id` to associate with anything. Screen readers announce "edit, secure" with no context. Placeholder disappears on focus.

Also, `inputStyle` (line 111-120) sets `fontSize: 15` (covered by F1) and `outline: "none"` (covered by F3), and lacks `autoComplete="new-password"`. Password managers won't auto-fill.

**Fix** (combined):
```tsx
<input
  id="new-password"
  aria-label="New password"
  autoComplete="new-password"
  ...
/>
<input
  id="confirm-password"
  aria-label="Confirm new password"
  autoComplete="new-password"
  ...
/>
```

Plus the F1 + F3 fixes.

### F8 — Magic-link OTP allows up to 8 digits but Supabase emits 6 (LOW)

**Severity: LOW** — UX confusion, low-impact bug.

`useAuthFlow.ts:213`:
```ts
const isOtpDisabled = verifying || otpCode.length < 6 || otpCode.length > 8;
```

Window is 6-8. The Supabase magic-link OTP is **always 6 digits**. The `> 8` ceiling is dead code — extra digits past 6 are rejected by `verifyOtp` server-side anyway, but the user can type a 7th and 8th digit into the box and the submit button stays enabled. They'll get an "invalid token" friendlyError back. Better UX is to cap at 6.

The input also has no `maxLength={6}` — it accepts arbitrary digit length until the input box overflows.

**Fix**: cap at 6 inline (`maxLength={6}` on the input, line 901; tighten `isOtpDisabled` to `otpCode.length !== 6`).

### F9 — `handlePasswordSignUp` checks `data?.user` for success but Supabase returns it on duplicate signup too (LOW)

**Severity: LOW** — UX edge, probably already mitigated via friendlyError.

`useAuthFlow.ts:121-122`:
```ts
if (error) setError(toFriendlyError(error.message));
else if (data?.user) setSignupSuccess(true);
```

Supabase Auth, since a 2024 change, returns `data.user` populated **even when the email is already registered** (to prevent enumeration — the success path looks identical). The duplicate-signup user lands in `signupSuccess=true` state ("Check your email") with no email actually sent that lets them in (Supabase silently sends an account-exists notification to that address). User waits, no action works, support ticket.

This interacts with F4 — fixing F4 (always show generic success) makes this finding effectively the same flow — but the user gets stuck regardless. The right fix is: after `signUp` returns success, surface the magic-link "use a different email or sign in" path as the fallback in the same view. Already partially there (signupSuccess branch line 734-744 has "Use a different email" + "I clicked it, sign in").

No code change required — copy review only.

### F10 — Mobile brand strip duplicates desktop logo without `aria-hidden` (LOW)

**Severity: LOW** — minor a11y noise.

LoginScreen.tsx:354-379 — mobile-only brand strip rendered always but hidden via CSS at line 1008-1014. On mobile (≤768px), it's visible; the desktop left-panel logo (line 221-244) is hidden. Both contain the same `<EverionLogo>` and `Everion` wordmark — no `aria-hidden` on the visually hidden one. Screen readers announce "Everion" twice (once from the hidden desktop strip, once from the mobile strip) on small viewports if they ignore CSS visibility.

Most modern screen readers honour `display: none`, so the practical impact is near-zero. Worth a `aria-hidden="true"` on the off-screen instance for paranoia.

---

## Surface map

Every interactive element on the login page, in tab order from page load.

```
/login (initialIntent=login, no invite)
─────────────────────────────────────────────────────────
  [tab 1] ← back to everion                LoginScreen.tsx:318-330
  [tab 2] Continue with Google             LoginScreen.tsx:412-437   primary
  [tab 3] Email me a code                  LoginScreen.tsx:444-451   secondary
  [tab 4] Use password                     LoginScreen.tsx:452-454   secondary
  [tab 5] Privacy Policy                   LoginScreen.tsx:989-991
  [tab 6] Terms of Service                 LoginScreen.tsx:993-995
  [tab 7] Having trouble? (/status)        LoginScreen.tsx:997-999

→ click "Use password" → switchToPassword()
─────────────────────────────────────────────────────────
  [auto-focus] Email address               LoginScreen.tsx:501-530   id=password-email
  [tab 1]      Password                    LoginScreen.tsx:550-578   id=password-input
  [tab 2]      Show / Hide pw toggle       LoginScreen.tsx:579-600
  [tab 3]      Back                        LoginScreen.tsx:613-621
  [tab 4]      Sign in / Create account    LoginScreen.tsx:622-635   submit
  [tab 5]      Sign in ↔ Create switch     LoginScreen.tsx:646-655 / 667-676

→ submit → handlePasswordSignIn / handlePasswordSignUp
  on error  → role="alert" announces       LoginScreen.tsx:604-611
  on signup → signupSuccess=true → "Check your email"
              [tab 1] Use a different email
              [tab 2] I clicked it, sign in
              [tab 3] resend the link

→ click "Email me a code" → switchToMagicLink()
─────────────────────────────────────────────────────────
  [auto-focus] Email address               LoginScreen.tsx:792-821   id=login-email
  [tab 1]      Back                        LoginScreen.tsx:832-840
  [tab 2]      Send my code                LoginScreen.tsx:841-843   submit

→ submit → handleSend → sent=true
─────────────────────────────────────────────────────────
  [auto-focus] 6-digit code                LoginScreen.tsx:900-932   id=otp-code
                                           inputMode=numeric
                                           autoComplete=one-time-code
  [tab 1]      Sign in                     LoginScreen.tsx:942-944   submit
  [tab 2]      Resend code                 LoginScreen.tsx:949-951
  [tab 3]      Use different email         LoginScreen.tsx:952-959

→ click "Continue with Google" → handleGoogleSignIn → redirect to Google → return to redirectUrl()

→ /?type=recovery (hash from email)  → App.tsx:180 mounts <ResetPasswordView>
─────────────────────────────────────────────────────────
  [auto-focus] New password                ResetPasswordView.tsx:83-90
  [tab 1]      Confirm password            ResetPasswordView.tsx:91-97
  [tab 2]      Set password                ResetPasswordView.tsx:101-103   submit
```

**No focus trap needed** — full page, no modal. ESC has no handler — browser default applies (no-op).

**No outside-click handler needed** — full page. Accidental dismissal isn't possible.

---

## Findings to prove or refute (from scope)

| Claim | Status | Evidence |
|---|---|---|
| All inputs ≥16px font-size on focus (iOS no-zoom) | **REFUTED** | F1 — 5 inputs at `fontSize: 15` |
| Error messages don't enumerate account existence | **REFUTED** | F4 — `friendlyError.ts:11-12` distinguishes "already registered" |
| OTP input handles paste cleanly (auto-trim) | **CONFIRMED** | line 906 strips non-digits; useAuthFlow.ts:225 trims |
| Submit button disabled during in-flight request | **CONFIRMED** | `isDisabled / isPasswordDisabled / isOtpDisabled` all gate on `loading` |
| 429 surfaced with retry-after countdown | **REFUTED** | F5 — generic "wait a minute" copy, no countdown |
| Focus trap in SignupModal (Radix or custom) | **N/A** | no SignupModal exists; surface is full-page |
| ESC closes SignupModal and restores focus to opener | **N/A** | no modal |
| `redirectUrl()` uses VITE_APP_URL, never window.location.origin raw | **CONFIRMED** | useAuthFlow.ts:6-7 throws when unset |
| No CSS `outline:none` without `:focus-visible` ring | **REFUTED** | F3 — 5 inputs ship `outline: "none"` with only border-color cue |
| Privacy + ToS links visible at signup (legal requirement) | **PARTIAL** | links exist (lines 989-995); F6 — too small + low-contrast to be reliably perceivable |

---

## Recommendations (priority)

1. **[HIGH] F1 — iOS auto-zoom fix.** Bump 5 inputs from `fontSize: 15` → `16`. ~5-line diff. Highest user-visible win for an inflight customer; first impression of the product.
2. **[HIGH] F2 — wire "Forgot password?" entry point + `resetPasswordForEmail()` call.** New state + handler in `useAuthFlow`, new branch in `LoginScreen`. ~50 LOC. Removes a launch support-ticket vector.
3. **[MEDIUM] F4 — collapse account-enumerating error strings.** Edit `friendlyError.ts` to return generic copy on signup; keep distinct copy only on sign-in. ~3-line diff. Closes account-enumeration vector before public launch.
4. **[MEDIUM] F3 — replace `outline: none` with `:focus-visible` ring.** Either migrate inputs to `className="design-input"` (already 16px, has design system focus state) OR add `boxShadow` focus ring inline. ~10-line diff. WCAG 2.4.7 compliance.
5. **[MEDIUM] F5 — parse and surface 429 retry-after with live countdown.** New `retryAfterSeconds` state + `setInterval` in `useAuthFlow`. ~25 LOC. UX win, reduces "app feels broken" perception.
6. **[MEDIUM] F6 — Privacy/ToS legibility.** `fontSize: 12`, drop `opacity` to 1. ~2-line diff. Legal exposure mitigation.
7. **[LOW] F7 — ResetPasswordView aria-labels + autoComplete + 16px font.** ~6-line diff.
8. **[LOW] F8 — cap OTP input at 6 digits.** Add `maxLength={6}`, tighten `isOtpDisabled`. ~2-line diff.
9. **[LOW] F10 — `aria-hidden="true"` on the off-screen brand strip.** ~1-line diff.

Total surgical work to address everything: ~120 LOC across 4 files. ~40 minutes for a dev with the codebase loaded.

---

## Method

- Read `src/LoginScreen.tsx` end-to-end (1018 lines).
- Read `src/hooks/useAuthFlow.ts` end-to-end (252 lines).
- Read `src/views/ResetPasswordView.tsx` end-to-end (120 lines) — uncovered by the original scope but is the recovery view referenced from `App.tsx:180`.
- Read `src/lib/friendlyError.ts` end-to-end (32 lines).
- Read `src/components/ui/button.tsx` for `<Button>` API + variant/size + focus state.
- Verified no `SignupModal.tsx` exists — `find` + `glob` against `src/`. Audit scope assumed one; reframed to inline-form analysis.
- Cross-referenced `EML/Audits/archive/auth-flow-audit-2026-05-07.md` for `redirectUrl()` F1 fix status — confirmed in place.
- Cross-referenced `EML/Audits/email-deliverability-audit-2026-05-07.md` for password-reset flow status — confirmed `resetPasswordForEmail()` not wired.
- Cross-referenced `EML/Audits/accessibility-audit-2026-05-07.md` F3 (outline:none) — same root cause.
- Grep'd for `fontSize`, `outline`, `aria-`, `role=`, `redirectUrl`, `emailRedirectTo`, `resetPasswordForEmail`, `tokens.type`, `recovery`, `429`, `retry-after` across `src/`.
- Did not exercise the auth flow in a live browser session — all findings are static-analysis grade. Live device test of F1 (iOS zoom) would close the loop.

**Audit kicked off by**: senior-staff-engineer evidence-based login + signup surface review on 2026-05-07.
