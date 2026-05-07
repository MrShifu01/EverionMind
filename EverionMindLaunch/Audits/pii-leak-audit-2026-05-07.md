# PII-in-Logs Audit — 2026-05-07

> Greps every `console.*` and `log.*` call site for sensitive payloads. Goal: production logs (Vercel function logs, Sentry breadcrumbs, structured logs) must never contain emails, passwords, tokens, PINs, recovery keys, or unredacted entry content.

## Verdict

**One real PII leak**, **two near-misses**, and a tail of bare `console.log` lines that should migrate to `createLogger` for consistency.

Sentry is configured with `sendDefaultPii: false` (`src/main.tsx:64`), so no automatic PII capture. The structured logger at `_lib/logger.ts` is adopted in 12 sites; the other 160 call sites are bare `console.*`.

---

## Findings

### F1 — `cron/hourly` logs `user.email` (real PII leak)
**Severity: MEDIUM**

`api/user-data.ts:2333` and `api/user-data.ts:2384`:

```ts
console.log(`[cron/hourly] ${user.email ?? user.id} skip: no push subscription`);
console.log(`[cron/hourly] ${user.email ?? user.id} daily: disabled`);
```

User email lands in Vercel function logs. Anyone with read access to the Vercel project (co-admins, support, any CI/log-scraping integration) can correlate emails to behaviour. Under POPIA/GDPR this is "personal data" and logs of personal data require a documented retention/access policy.

**Fix:** drop `user.email ?? `. The `user.id` UUID alone is enough for debugging; emails belong in audit_log only when the action itself involves email.

### F2 — gmail attachment errors include attachment filename
**Severity: LOW**

`api/_lib/gmailScan.ts:266`:

```ts
console.error(`[gmail-scan:attachment] ${messageId}/${att.name}:`, err);
```

`att.name` is "the file the user attached". Often benign ("invoice.pdf") but can be PII ("john-smith-passport.pdf", "tax-return-2025.pdf"). Vercel logs retention is configurable; if logs are exported to a third party, filenames travel with them.

**Fix:** log `att.size` and a hash of the name (`att.name` → `crypto.createHash('sha256').update(att.name).digest('hex').slice(0,8)`) instead of the raw filename. Or omit entirely — `messageId` is sufficient for support correlation.

### F3 — vCard contact saves log contact names
**Severity: LOW**

`src/hooks/useCaptureSheetParse.ts:699,703`:

```ts
console.error(`[vcf] Failed to save "${contact.name}": HTTP ${res.status}`);
console.error(`[vcf] Error saving "${contact.name}":`, err);
```

Same shape as F2. `contact.name` is third-party PII (someone else's name). Same fix — log a hash or sequential index, not the name.

### F4 — file extraction logs source filenames
**Severity: LOW**

`src/hooks/useCaptureSheetParse.ts:762`:

```ts
console.error(`[fileExtract:${file.name}]`, e);
```

Browser console logs aren't typically harvested, but if Sentry breadcrumbs capture them (depending on Sentry config) they'd ship. Same fix.

### F5 — bare `console.log` for audit events (consistency, not PII)
**Severity: LOW** — observability hygiene

15+ audit-relevant events use bare `console.log`:

```
api/entries.ts:578,583,591,597,630,1196,1388
api/llm.ts:892
api/user-data.ts:1943,2271,2324,2333,2346,2384,2636
```

These don't contain raw PII (mostly include `user.id` UUIDs and entry IDs), but they don't go through `createLogger` either, so they don't appear in structured-log queries with `req_id` correlation.

**Fix:** convert to `log.info("audit ...", { entry_id, user_id, action })` so they correlate with the request log.

---

## What's solid

- **`Sentry.init({ sendDefaultPii: false })`** (`src/main.tsx:64`) — Sentry never auto-captures usernames, IPs, or request bodies. Manual `Sentry.captureException` calls in `ErrorBoundary.tsx` pass only the error itself plus a `tags: { view }` label.
- **Structured logger** at `_lib/logger.ts` with `createLogger(req_id, { user_id, key_id })` — used in 12 hot paths (`withAuth.ts:111,149`, `withAuth.ts:246`, `entries.ts:250,343`, `llm.ts:602`, `mcp.ts:718,758,802,816,819`, `v1.ts:395`, `entryDelete.ts:36,57`).
- **No password/token/pin/recovery-key in logs** — grep returned zero hits for `password`, `pin`, `recovery_key`, `token` in `console.*` payloads (excluding test files).
- **`audit_log` inserts** include only `user_id` UUID + `action` enum + `resource_id` UUID + `request_id` — no raw entry content.
- **Webhook handlers** log only event ID + event name + signature-rejected reason — never the full webhook payload.

---

## Sites verified clean

| Path | Status |
|---|---|
| `api/_lib/withAuth.ts:111,149,246` | ✅ structured, only `user_id` + `req_id` |
| `api/entries.ts:250,343` (entry restore/patch) | ✅ structured |
| `api/llm.ts:602` (tool_call) | ✅ structured, includes brain_id only |
| `api/mcp.ts:758,802,816,819` (tool ok/err) | ✅ structured, no entry content |
| `api/v1.ts:395` (`log.info("ok")`) | ✅ minimal |
| `api/_lib/handlers/entryDelete.ts:36,57` (entry hard/soft delete) | ✅ structured |
| `api/user-data.ts:1943` (DELETE_ACCOUNT) | ✅ user.id + cascade counts only |
| Webhook idempotency | ✅ event_id only |
| Lemon webhook signature reject | ✅ reason text only |
| RC webhook | ✅ no payload echoed |

---

## Recommendations (priority)

1. **[MEDIUM] F1** — `api/user-data.ts:2333,2384` — drop `user.email ??`. 1 line change, 2 sites.
2. **[LOW] F2** — `api/_lib/gmailScan.ts:266` — replace `att.name` with size + name-hash.
3. **[LOW] F3** — `src/hooks/useCaptureSheetParse.ts:699,703,762` — replace contact / file names with hash or index.
4. **[LOW] F5** — migrate the 15 bare `console.log` audit lines in `entries.ts` / `llm.ts` / `user-data.ts` to `createLogger`. Pre-launch hygiene; not a security defect.
5. **[INFO]** Add `EML/Ops/log-redaction-checklist.md`: "before adding a new `console.log` or `log.*` call, ask — could this string contain PII when an error occurs? If yes, log the user_id, the operation name, and a hash; never the raw value."

## Verification gauntlet

```bash
# Re-run after fixes:
grep -rEn "console\.(log|info|warn|error)\(.*\.(email|name|phone|address)" api/ src/ \
  | grep -v "test\|spec\|__tests__"
# Expected: 0 hits after F1–F4 land
```

Add this regex to the `npm run lint` chain so a regression triggers a CI failure rather than a future audit finding.

## Method

- Grep all `console.*\(` + `log\.(info|warn|error|debug)\(` call sites.
- Manual classification by payload contents.
- Cross-checked Sentry config in `src/main.tsx:61-65`.
- Sampled `audit_log` row contents to confirm no PII at write site.

**Audit kicked off by**: user request "do all those highest-leverage audits" on 2026-05-07.
