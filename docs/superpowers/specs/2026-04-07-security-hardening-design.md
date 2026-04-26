# Security Hardening — Design Spec
**Date:** 2026-04-07

## Scope
SEC-12 security headers, SEC-16 HMAC cron auth, brain API key hashing, ARCH-6 PIN hash server-side.

---

## SEC-12: Security Headers on All API Handlers

**Problem:** No `X-Content-Type-Options` or `X-Frame-Options` on any API response.

**Solution:** Shared helper `api/_lib/securityHeaders.ts` exports `applySecurityHeaders(res)`. Called at the top of every handler before any other write.

```ts
export function applySecurityHeaders(res: ApiResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
}
```

Applied in: `api/capture.ts`, `api/brains.ts`, `api/chat.ts`, `api/llm.ts`, `api/cron/push.ts`, `api/external.js`.

---

## SEC-16: HMAC-Signed Cron Auth

**Problem:** `api/cron/push.ts` uses plain Bearer token — TODO comment already in code.

**Solution:** Sign requests with `HMAC-SHA256(CRON_SECRET, ISO-date-string)`. Verifier accepts ±5 minute window (to tolerate clock drift). Plain Bearer token kept as fallback for local dev.

```ts
// Verify: HMAC of today's UTC date string
function verifyCronHmac(header: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret)
    .update(new Date().toISOString().slice(0, 10)) // "2026-04-07"
    .digest("hex");
  return header === `HMAC ${expected}`;
}
```

Cron runner sends: `Authorization: HMAC <hex>`. Vercel cron trigger validated via `x-vercel-cron: 1` header (already in place).

---

## Brain API Key Hashing

**Problem:** Keys stored plaintext in `brain_api_keys.api_key`. Should store hash, show once.

**Solution:** Use Node.js built-in `crypto.scrypt` (no native addon needed on Vercel). On key generation:
1. Generate `ob_<32 hex bytes>` (keep current format)
2. Store `scrypt(key, salt, 32)` hash + salt in DB
3. Return plaintext key to UI once — never stored server-side again
4. On API requests: hash the incoming key and compare

**Migration 014:** Add `api_key_hash TEXT`, `api_key_salt TEXT` columns. Rename `api_key` to `api_key_prefix` (first 8 chars, for display). Drop plaintext column after migration.

**DB columns after migration:**
- `api_key_prefix TEXT` — first 8 chars (`ob_xxxxxx`) for user identification
- `api_key_hash TEXT NOT NULL` — scrypt hash
- `api_key_salt TEXT NOT NULL` — random 16-byte hex salt

---

## ARCH-6: PIN Hash Server-Side

**Problem:** PBKDF2 PIN hash stored in `localStorage` — XSS accessible.

**Solution:**
1. New `POST /api/pin/verify` endpoint — accepts `{ pinHash: string }`, compares to DB record, returns `{ valid: boolean }`.
2. New `POST /api/pin/setup` — stores hash in `user_ai_settings.pin_hash` column.
3. New `DELETE /api/pin` — removes pin from DB.
4. Migration 015: add `pin_hash TEXT` to `user_ai_settings`.
5. Client: derive key client-side with PBKDF2 (unchanged), POST hash to `/api/pin/verify`, do NOT store in localStorage.
6. Backward compat: if localStorage hash exists on first visit after upgrade, migrate it to DB, then clear localStorage.

---

## Tests

- `tests/lib/securityHeaders.test.ts` — applySecurityHeaders sets correct response headers
- `tests/api/cron-hmac.test.ts` — verifyCronHmac accepts valid signature, rejects tampered
- `tests/api/brains-key-hash.test.ts` — generated key: hash stored, plaintext not in DB response
- `tests/api/pin.test.ts` — setup/verify/delete PIN via API
