# Email Deliverability Audit — 2026-05-07

> Magic-link is the primary login. If Resend lands in spam on launch day, signup funnel collapses. This audit walks every transactional email path — Supabase Auth magic-link, Resend invite send, weekly admin roll-up — verifies SPF/DKIM/DMARC at the actual production zone, and flags what blocks Gmail/Yahoo bulk-sender compliance.

## Verdict

**Not launch-ready.** DNS posture has two HIGHs: **DMARC is missing** (no `_dmarc.everion.smashburgerbar.co.za`, no `_dmarc.smashburgerbar.co.za`) and **SPF is absent on the bare sender subdomain** — `everion.smashburgerbar.co.za` itself returns no TXT, only `send.everion.smashburgerbar.co.za` carries `v=spf1 include:amazonses.com ~all`. DKIM (`resend._domainkey.everion`) is good. Gmail/Yahoo February-2024 bulk-sender rules require DMARC at minimum `p=none` with a `rua` reporting address — without it, magic-links at scale will get filtered.

**Code paths are thin.** Two outbound senders exist via Resend (`api/_lib/sendInviteEmail.ts` for brain invites, `scripts/weekly-roll-up.ts` for admin digest). No welcome email, no password-reset email built in code — Supabase Auth handles password recovery via its own template (not visible in this repo). No `List-Unsubscribe` / `List-Unsubscribe-Post` header on either Resend send (third HIGH for Gmail compliance once volume crosses 5k/day).

**Five findings**: 2 HIGH, 2 MEDIUM, 1 LOW. All addressable in <2 hours of dashboard + DNS work plus a 10-line code change.

---

## Architecture overview

```
Magic-link login                                        Supabase Auth → SMTP (default supabase.co host or custom Resend SMTP)
   src/hooks/useAuthFlow.ts:67 signInWithOtp               → noreply@mail.app.supabase.co  (default — UNCONFIRMED)
   options.emailRedirectTo = VITE_APP_URL                  → DKIM-signed by Supabase's domain
                                                           → recipient inbox

Brain invite                                            Resend HTTP API
   api/user-data.ts:435 sendInviteEmail()                  → POST api.resend.com/emails
   api/_lib/sendInviteEmail.ts:52                          → from = RESEND_FROM (env) or "Everion <noreply@everionmind.com>" (fallback)
                                                           → DKIM-signed via resend._domainkey.everion.smashburgerbar.co.za
                                                           → return-path via send.everion.smashburgerbar.co.za (SPF aligns)
                                                           → recipient inbox

Admin weekly roll-up                                    Resend HTTP API (GitHub Actions)
   .github/workflows/weekly-roll-up.yml:49                 → scripts/weekly-roll-up.ts:274 fetch api.resend.com/emails
   from = "Everion <noreply@everion.smashburgerbar.co.za>" → DKIM-signed (same selector)
                                                           → ADMIN_EMAIL recipient

Password reset                                          Supabase Auth (built-in flow)
   src/App.tsx:180 handles tokens.type === "recovery"      → no resetPasswordForEmail() call in repo
                                                           → user must trigger via Supabase dashboard or unimplemented UI

Welcome email                                           NONE — does not exist
                                                           → no welcome-on-signup path. Onboarding lives in-app only.

Billing receipts                                        LemonSqueezy (merchant of record)
                                                           → LS sends from `noreply@lemonsqueezy.com`, not our domain
                                                           → out of our deliverability scope
```

---

## DNS posture

Lookups run via PowerShell `Resolve-DnsName` on 2026-05-07 against the live zone (NS = `ns{1-4}.tld-ns.{net,com}` — TLD-Hosting / Hostinger reseller).

| Record | Name | Status | Value found |
|---|---|---|---|
| **DKIM** | `resend._domainkey.everion.smashburgerbar.co.za` | ✅ PRESENT | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDFFkgq4bOui0qMohh32HZu5yO+UdfdFNizBgQTjDcJ/2IDuYvpLVbWAmSIM8PtU31MenYn8vKkedktkdsOsb4JOK2mO488QpFVVaZRxwgQ7CP0ew09i52SCDpUeQB+IuYJY1nER2aSWxThg2SJGfHt91Lxg7ME/U41xxvjO8G5AQIDAQAB` (1024-bit RSA, TTL 3600) |
| **SPF (return-path)** | `send.everion.smashburgerbar.co.za` | ✅ PRESENT | `v=spf1 include:amazonses.com ~all` (TTL 3600) |
| **MX (return-path)** | `send.everion.smashburgerbar.co.za` | ✅ PRESENT | `feedback-smtp.eu-west-1.amazonses.com` pref=10 |
| **SPF (sender subdomain)** | `everion.smashburgerbar.co.za` | ❌ **MISSING** | TXT query returned empty. Only CNAME → `6f77453a83e49045.vercel-dns-017.com`. No `v=spf1` record. |
| **DMARC (sender subdomain)** | `_dmarc.everion.smashburgerbar.co.za` | ❌ **MISSING** | `DNS name does not exist` |
| **DMARC (parent zone)** | `_dmarc.smashburgerbar.co.za` | ❌ **MISSING** | `DNS name does not exist` |
| **SPF (parent zone)** | `smashburgerbar.co.za` | ⚠ PRESENT but stale | `v=spf1 +a:mail.smashburgerbar.co.za +mx include:_spf.tld-mx.com ~all` — does NOT include Resend/SES. Doesn't matter for the subdomain sender, but if anyone ever sends from `@smashburgerbar.co.za` apex via Resend it will fail SPF. |
| **MX (parent zone)** | `smashburgerbar.co.za` | ✅ PRESENT | `mx1.tld-mx.com` pref=10 (registrar mail — unrelated to outbound) |
| **DKIM (Supabase default selector)** | `default._domainkey.everion.smashburgerbar.co.za` | ❌ MISSING (expected) | Supabase Auth default does not need this on our zone — it sends from `mail.app.supabase.co`. See F2. |

### What's right

- **DKIM correctly published** at the Resend-recommended `resend._domainkey.everion` selector. Public key matches Resend's RSA-1024 default.
- **Return-path subdomain (`send.everion`) has SPF + MX**. Resend's bounce/feedback handling will work — SES will see `v=spf1 include:amazonses.com ~all` when it does the outbound MAIL FROM check.
- **Sender domain alignment is achievable**: `From: noreply@everion.smashburgerbar.co.za` aligns relaxed-mode with DKIM `d=everion.smashburgerbar.co.za` (same organisational domain). SPF aligns relaxed via `send.everion.smashburgerbar.co.za` MAIL FROM, also same org domain.

### What's broken

- **No DMARC at any level.** Gmail/Yahoo Feb-2024 bulk-sender rules require **at minimum** `v=DMARC1; p=none; rua=mailto:...` on the `From` domain or its organisational parent. Without it, sends >5k/day get throttled and may go to spam even at low volume.
- **No SPF TXT on the bare sender subdomain.** Strictly speaking, SPF is checked on the **MAIL FROM** (return-path = `send.everion`) not the visible `From`, so this isn't a SPF failure today. But many receivers (and **mail-tester.com**) still grade lower without an SPF record on the visible sender domain. Fix is one TXT record.
- **Parent SPF lacks Resend.** If anyone ever sends as `@smashburgerbar.co.za` apex via Resend (e.g. a future ops alert), SPF check fails. Cosmetic for now since launch sends are subdomain-only.

---

## Email inventory

Every outbound transactional path. Sample subject lines pulled from source.

| # | Type | Provider | Trigger | From | Reply-To | List-Unsubscribe | HTML+text | Subject |
|---|---|---|---|---|---|---|---|---|
| 1 | Magic-link OTP / email-confirm | Supabase Auth (built-in) | `signInWithOtp` (`useAuthFlow.ts:67`), `signUp` (`useAuthFlow.ts:114`) | **UNCONFIRMED** — Supabase default = `noreply@mail.app.supabase.co` unless custom SMTP configured | unset | Built-in template — confirm in Supabase dashboard | HTML + text default | "Confirm your signup" / "Magic link" (Supabase default templates) |
| 2 | Brain invite | Resend HTTP API | `api/user-data.ts:435` after invite created | `RESEND_FROM` env or fallback `Everion <noreply@everionmind.com>` (`sendInviteEmail.ts:18`) | **NOT SET** | **NOT SET** (`sendInviteEmail.ts:58`) | ✅ both — `html` + `text` keys passed | `${inviterName} invited you to "${brainName}" on Everion Mind` (`sendInviteEmail.ts:21`) |
| 3 | Admin weekly roll-up | Resend HTTP API (GH Actions) | weekly cron, `weekly-roll-up.yml:49` | hardcoded `Everion <noreply@everion.smashburgerbar.co.za>` (`weekly-roll-up.ts:278`) | **NOT SET** | **NOT SET** | HTML only — no `text` key in payload (`weekly-roll-up.ts:277-282`) | `Everion weekly — <auto>` (`weekly-roll-up.ts:256`) |
| 4 | Password reset | Supabase Auth (built-in, theoretical) | No `supabase.auth.resetPasswordForEmail` call exists in `src/` (grep: 0 matches). `App.tsx:180` handles `tokens.type === "recovery"` IF a recovery link arrives, but no UI requests one. | Supabase default | unset | default | default | "Reset your password" (Supabase default) |
| 5 | Welcome email | **NONE** | — | — | — | — | — | Does not exist. Onboarding is in-product only. |
| 6 | Billing receipts | LemonSqueezy (merchant of record) | LS post-checkout | `noreply@lemonsqueezy.com` | LS managed | LS managed | LS managed | LS-defined |
| 7 | Daily digest, gmail-sync notifications | Mentioned in `Ops/vendors.md:36` as "outbound email (welcome, invite, daily digest, weekly roll-up)" but **no daily digest send code exists** in `api/` or `scripts/`. | — | — | — | — | — | Not implemented. |

**From-name consistency**: every send that does exist uses `Everion <…>` — consistent. ✅

**From-address inconsistency**: `sendInviteEmail.ts:18` falls back to `noreply@everionmind.com` (different domain — `everionmind.com`, not `everion.smashburgerbar.co.za`) if `RESEND_FROM` env is unset. If prod ever boots without `RESEND_FROM`, invites send from a domain with **no DKIM/SPF/DMARC** at all → instant spam. See F4.

---

## What's solid

- **DKIM published correctly** for the production sender subdomain. Public key in DNS matches Resend's selector convention. RSA-1024 — adequate for transactional volume; 2048 is preferred long-term but launch-acceptable.
- **Return-path subdomain (`send.everion`) is fully wired** — SPF includes `amazonses.com` (Resend rides on SES), MX points at `feedback-smtp.eu-west-1.amazonses.com` so SES bounce/feedback notifications route correctly.
- **From-name consistency** — both Resend send sites use `Everion <…>`. Gmail/Apple Mail render the friendly name without the user seeing the address; consistent across paths.
- **HTML + text fallback present on invite send** (`sendInviteEmail.ts:58` body has both `html` and `text` keys). Plaintext-only readers and accessibility scanners will see the same content.
- **Idempotent failure mode**: `sendInviteEmail` returns `{ ok: false, error }` on any error including `not_configured` — never throws. Invite UX surfaces "email sent" / "email failed" as a flag (`user-data.ts:450 email_sent`) and the invite link itself is returned in JSON so the inviter can copy/paste manually. Resend outage doesn't block the flow.
- **Lazy API-key init** (`sendInviteEmail.ts:17`): module load doesn't throw if `RESEND_API_KEY` is absent — endpoint stays alive, send becomes a no-op. Matches the `feedback_stripe_lazy_init` rule from memory.
- **Separation of marketing-vs-transactional** — there is no marketing email volume, so volume-based throttling won't trigger. All sends are user-initiated (invite) or internal (admin digest).
- **No SMTP credentials embedded** — both senders use Resend's HTTP API with bearer auth from env. No SMTP creds in repo.

---

## Findings

### F1 — DMARC record completely missing — Gmail/Yahoo 2024 bulk-sender violation (HIGH)

**Severity: HIGH** — blocks reliable inbox placement at scale.

**Evidence**: 

- `nslookup TXT _dmarc.everion.smashburgerbar.co.za` → "DNS name does not exist".
- `nslookup TXT _dmarc.smashburgerbar.co.za` → "DNS name does not exist".

DMARC absent at both the sending subdomain AND the organisational parent. Gmail and Yahoo's February-2024 sender requirements (still in force May 2026) require, for any domain sending bulk mail and for personal-Gmail-recipient mail at any volume:

- **DKIM signing** (✅ present)
- **SPF alignment** (✅ via return-path)
- **DMARC policy with at minimum `p=none`** (❌ missing)
- **One-click unsubscribe via `List-Unsubscribe` + `List-Unsubscribe-Post`** for >5k/day (see F3)

Without DMARC, Gmail's "Postmaster Tools" cannot ingest reports about your domain — you have no visibility into who passes/fails alignment, no reporting addresses (`rua=`), and Gmail's reputation engine has no policy signal to honour. Real impact: magic-link emails marked "Be careful with this message" in Gmail, dropped to Promotions tab, or quarantined outright on stricter MTAs. At thousands of users, signup funnel measurably collapses.

**Fix** (DNS record at TLD-Hosting / Hostinger panel):

```
Name:  _dmarc.everion.smashburgerbar.co.za   (or _dmarc.everion if relative entry)
Type:  TXT
Value: v=DMARC1; p=none; rua=mailto:postmaster@smashburgerbar.co.za; pct=100; adkim=r; aspf=r;
TTL:   3600
```

Add `postmaster@smashburgerbar.co.za` as a real mailbox (or a Cloudflare-routed alias to your inbox) — DMARC reports land there, and you'll see who's spoofing your domain or failing alignment.

After 2 weeks of clean DMARC reports → upgrade to `p=quarantine`. After another 30 days clean → `p=reject`. Don't jump to `reject` cold; one misconfigured record kills 100% of mail.

`launch-runbook-alerts-and-dns.md:124-134` already documents this exact ladder. The runbook step has not been executed against the live zone.

### F2 — Supabase Auth magic-link sender unconfirmed; likely `mail.app.supabase.co` default (HIGH)

**Severity: HIGH** — magic-link is the primary login path. If Supabase Auth is sending from its default address, the From-domain has no relationship with our DKIM/SPF/DMARC and may show "via supabase.co" in Gmail.

**Evidence**:

- `src/hooks/useAuthFlow.ts:67`: `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })` — no `from` override, no SMTP config visible in repo.
- No Supabase custom SMTP config visible in `.env.example`, `vendors.md`, or `env-vars.md`. No `SUPABASE_SMTP_*` keys.
- `Ops/vendors.md:38` says `Domain: noreply@everion.smashburgerbar.co.za. SPF/DKIM/DMARC tracked in LAUNCH_CHECKLIST.md` — implies the magic-link should send from this domain, but the code never tells Supabase to do that.

If the Supabase Auth dashboard's "SMTP settings" tab is unconfigured, Supabase ships from its default rate-limited shared sender (`noreply@mail.app.supabase.co`). Three problems:

1. **Heavy rate-limit** on the default shared sender (Supabase docs: "limited to 4 emails per hour per project"). At launch volume, magic-links queue or drop.
2. **From-domain mismatch** — users see mail from `supabase.co` not `everion.smashburgerbar.co.za`. Gmail shows "via supabase.co" suffix; brand confusion + lower trust.
3. **DMARC alignment irrelevant** — Supabase signs with `d=mail.app.supabase.co`, our DMARC policy at `everion.smashburgerbar.co.za` doesn't apply to those mails.

**Fix** (Supabase dashboard, `wfvoqpdfzkqnenzjxhui` → Authentication → Email Templates → SMTP Settings):

```
Sender email:    noreply@everion.smashburgerbar.co.za
Sender name:     Everion Mind
Host:            smtp.resend.com
Port:            465 (TLS) or 587 (STARTTLS)
Username:        resend
Password:        <RESEND_API_KEY>
```

Resend exposes an SMTP relay specifically for this — billing rolls into the same Resend account, and DKIM/SPF/DMARC alignment is automatic since the From domain is ours. Document the change in `Ops/vendors.md` under Supabase.

**Verify after**: paste Supabase Auth's "Magic Link" email template and check it ends with `<a href="{{ .SiteURL }}{{ .RedirectTo }}#access_token=…">`. Also confirm the URL points at `https://everion.smashburgerbar.co.za` not a Vercel preview — related to the carried `APP_ORIGIN` finding from `auth-flow-audit-2026-05-07.md` F1.

### F3 — `List-Unsubscribe` header missing on every Resend send (MEDIUM)

**Severity: MEDIUM** — Gmail/Yahoo 2024 rule for >5k/day; also reduces spam-folder rate at any volume.

**Evidence**:

- `api/_lib/sendInviteEmail.ts:58`: body is `{ from, to, subject, html, text }`. No `headers` field.
- `scripts/weekly-roll-up.ts:277-282`: body is `{ from, to, subject, html }`. No `headers` field.
- `LAUNCH_CHECKLIST.md:380` already flagged this: "List-Unsubscribe + List-Unsubscribe-Post headers — effectively required by Gmail in 2026 to dodge the bulk-sender penalty. Resend has a flag for this." Still unaddressed.

Resend supports passing custom headers in its API. For one-click unsubscribe (RFC 8058), both `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` must be present.

Strictly the rule kicks in at 5k mails/day. Pre-launch we're under that, but: (a) magic-links don't intuitively need an unsubscribe link, and Gmail's filter is dumb — it doesn't care if the email is transactional, it just checks for the header on bulk senders; (b) once we cross 5k it's too late to retro-add headers without a re-warm.

**Fix** (`api/_lib/sendInviteEmail.ts:58`):

```ts
body: JSON.stringify({
  from,
  to: args.to,
  subject,
  html,
  text,
  headers: {
    "List-Unsubscribe": `<mailto:unsubscribe@everion.smashburgerbar.co.za?subject=Unsubscribe>, <https://everion.smashburgerbar.co.za/unsubscribe?token=${unsubscribeToken}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
}),
```

For magic-link / invite, the mailto: variant alone is enough — receivers don't expect an unsubscribe page for transactional, but the header presence is what Gmail's filter scores. Apply the same headers to `weekly-roll-up.ts`. The admin digest IS bulk-style content and should also have a working `https://` unsubscribe URL since you might forward it later.

### F4 — `RESEND_FROM` fallback uses wrong domain (`everionmind.com`) (MEDIUM)

**Severity: MEDIUM** — silent failure mode if env var not set in prod.

**Evidence**: `api/_lib/sendInviteEmail.ts:18`:

```ts
const from = (process.env.RESEND_FROM || "").trim() || "Everion <noreply@everionmind.com>";
```

If `RESEND_FROM` is missing or empty in Vercel prod env, every invite sends from `noreply@everionmind.com` — a domain we don't own (or haven't configured DKIM for). Resend will either reject the send (sender domain not verified in your Resend account) OR send unsigned, in which case the recipient's MTA drops it as spam.

`vendors.md:36` says `RESEND_FROM` is "required" but the code fallback hides the failure: a missed env var becomes a silent unverified-sender error rather than a loud "configuration missing" message.

**Fix** — fail closed:

```ts
const from = (process.env.RESEND_FROM || "").trim();
if (!from) return { ok: false, error: "RESEND_FROM not configured" };
```

Same as the `RESEND_API_KEY` check on the line above — explicit not-configured rather than wrong-domain. The pre-launch checklist (`vendors.md:101` "Every key in `Ops/env-vars.md` is set in Vercel `production` env") then catches it.

### F5 — Weekly roll-up has no plaintext fallback (LOW)

**Severity: LOW** — admin-internal email; cosmetic.

**Evidence**: `scripts/weekly-roll-up.ts:277-282`:

```ts
body: JSON.stringify({
  from: "Everion <noreply@everion.smashburgerbar.co.za>",
  to: [to],
  subject,
  html,
}),
```

No `text` key. Email clients without HTML rendering (terminal mail, accessibility tools, some corporate filters) see "this email has no body". Apple Mail shows a slightly worse spam score for HTML-only.

**Fix**: render a plaintext mirror of the section data and pass `text` alongside `html`. Resend uses both bodies for multipart/alternative. ~10 lines.

---

## Limitations

- **Cannot inspect Supabase Auth dashboard config** without a session token. The `SUPABASE_SMTP_*` settings live in dashboard storage, not the repo. F2 is stated as "likely default" based on the absence of any custom-SMTP env vars in `.env.example` / `Ops/env-vars.md` and no docs marking SMTP as configured. **Manually verify**: dashboard → Authentication → Settings → SMTP. If "Custom SMTP" is enabled and points at Resend with sender `noreply@everion.smashburgerbar.co.za`, F2 reduces to MEDIUM (config drift risk, document it).
- **mail-tester.com NOT run** — would give a 0–10 spam score with per-cause breakdown (DMARC missing typically -3, missing List-Unsubscribe -1, etc.). Recommended manual run after F1+F2+F3 fixes (see Recommendations).
- **MX warmup status of sender subdomain unknown.** `everion.smashburgerbar.co.za` was added to the zone at some point — `whois` on the parent `smashburgerbar.co.za` registrar history is gated. If the sender subdomain has been live <30 days, expect lower initial inbox placement until reputation builds. Mitigation: keep launch volume low for the first week, then ramp.
- **No bounce-handling code** found. Resend webhooks (delivery / bounce / complaint) can fire at a configured URL; no `/api/resend-webhook` exists. At launch volume this is fine, but at 1k+/day you want bounced addresses suppressed automatically. Adds a 13th `api/*.ts` file → would need to fold into an existing handler (see F6 in Recommendations).

---

## Recommendations (priority)

1. **[HIGH] F1** — publish DMARC at `_dmarc.everion.smashburgerbar.co.za` AND `_dmarc.smashburgerbar.co.za` with `p=none; rua=mailto:postmaster@smashburgerbar.co.za`. Single TXT record at the registrar, ~3 min. Set up `postmaster@` as a real mailbox or alias FIRST so reports don't bounce.
2. **[HIGH] F2** — verify Supabase Auth SMTP. If default → switch to Resend SMTP relay with sender `noreply@everion.smashburgerbar.co.za`. Dashboard-only change, ~5 min. Document the constraint in `Ops/vendors.md` Supabase section.
3. **[HIGH/MEDIUM] F3** — add `List-Unsubscribe` + `List-Unsubscribe-Post` headers to both Resend send sites. ~10 lines code, ~1 hr including unsubscribe-token handler. Lands BEFORE >5k/day volume.
4. **[MEDIUM] F4** — fail closed when `RESEND_FROM` is unset. ~3 lines. Stops silent unverified-sender sends.
5. **[LOW] F5** — add plaintext fallback to weekly roll-up. ~10 lines. Cosmetic.
6. **[follow-up] mail-tester run** — after F1–F4 land, send a magic-link test to a fresh `mail-tester.com` address. Target 9/10 minimum. Anything below 9 → re-check the named DNS record.
7. **[follow-up] Resend bounce webhook** — once volume crosses 1k/day, add a `bounce` handler. Folded into existing `api/user-data.ts` via `?action=resend-webhook` to stay under the 12-function cap.
8. **[follow-up] BIMI** — after DMARC at `p=quarantine` for 30 days, publish a BIMI record + VMC certificate. Logo in Gmail/Yahoo inbox, brand trust uplift. Out of scope for week-1, schedule for week-6.
9. **[follow-up] DMARC ladder** — calendar reminders at 2 weeks (`p=none` → `p=quarantine`) and 6 weeks (`p=quarantine` → `p=reject`). Document in `Ops/incident-response.md` so a future contributor doesn't surprise-tighten and break sends.
10. **[follow-up] Postmaster Tools** — add `everion.smashburgerbar.co.za` at <https://postmaster.google.com>. Visibility into spam rate, IP reputation, authentication pass rates. Gated behind DMARC (which is why F1 unlocks it).

---

## Method

- Read `.env.example`, `Ops/vendors.md`, `Ops/env-vars.md`, `docs/launch-runbook-alerts-and-dns.md` for declared config.
- Grep'd `api/` + `scripts/` for `resend|RESEND|api.resend.com|emails.send|smtp` — found 2 send sites (`sendInviteEmail.ts`, `weekly-roll-up.ts`). Confirmed no third-party SMTP path.
- Grep'd `src/` for `signInWithOtp|signUp|resetPasswordForEmail|emailRedirectTo` — found magic-link in `useAuthFlow.ts`, no `resetPasswordForEmail` call anywhere.
- Live DNS lookups via PowerShell `Resolve-DnsName` against authoritative NS (`tld-ns.{net,com}`):
  - `TXT everion.smashburgerbar.co.za` — empty
  - `TXT _dmarc.everion.smashburgerbar.co.za` — NXDOMAIN
  - `TXT resend._domainkey.everion.smashburgerbar.co.za` — RSA-1024 key present
  - `TXT default._domainkey.everion.smashburgerbar.co.za` — NXDOMAIN (expected — Supabase default selector wouldn't be on our zone)
  - `TXT send.everion.smashburgerbar.co.za` — `v=spf1 include:amazonses.com ~all`
  - `MX send.everion.smashburgerbar.co.za` — `feedback-smtp.eu-west-1.amazonses.com` pref=10
  - `TXT smashburgerbar.co.za` — parent SPF (no Resend)
  - `TXT _dmarc.smashburgerbar.co.za` — NXDOMAIN
  - `A everion.smashburgerbar.co.za` — CNAME → `vercel-dns-017.com` (Vercel front-end host, unrelated to mail)
- Cross-referenced Supabase MCP capability — service-role can `execute_sql` on `auth.config` but that table is in `auth` schema, typically permission-denied for service role; did not run to avoid noise. Manual dashboard inspection required for F2.
- Did not run `mail-tester.com` (no WebFetch — out of scope per audit brief). Manual follow-up listed in Recommendations.

**Audit kicked off by**: scheduled audit per `EML/Audits/audit-schedule.json` 2026-05-24 entry, advanced to 2026-05-07 by user request.
