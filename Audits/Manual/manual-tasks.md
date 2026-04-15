# Manual Tasks

Things that require dashboard access, third-party signups, or environment configuration that cannot be done in code.

---

## M-3 — Verify Upstash Redis is configured in production

**Action:** Vercel dashboard
3. Confirm rate limiting hits the Redis path in `api/_lib/rateLimit.ts`

---

## M-10 — Set up staging environment

**Action:** Vercel dashboard + GitHub

1. Create a `staging` branch in the repo:
   ```
   git checkout -b staging
   git push -u origin staging
   ```
2. In Vercel dashboard: add a new deployment targeting the `staging` branch with separate env vars
3. Create a separate Supabase project for staging to avoid polluting prod data
4. Update PR process: merge to `staging` first, promote to `main` after verification

---

## M-4 — Move user API keys to Supabase Vault

**Action:** Supabase dashboard + code migration (M effort)

This requires a database migration and code changes. Steps:

1. Enable Supabase Vault on the project (Dashboard → Database → Vault)
2. Write a migration to:
   - For each row in `user_ai_settings`, call `vault.create_secret(groq_key)` and `vault.create_secret(gemini_key)`
   - Store the returned secret IDs in new `groq_key_id` and `gemini_key_id` columns
   - Drop the plaintext `groq_key` and `gemini_key` columns
3. Update `src/lib/aiSettings.ts` `loadUserAISettings` to fetch via `vault.decrypted_secrets`
4. Update `api/` routes that read these keys to use the Vault API

**Warning:** Do this in staging first. A bad migration here locks users out of AI features.


## npm install after vite-plugin-pwa downgrade

The `vite-plugin-pwa` version was changed to `0.19.8` in `package.json`.

Run the following to apply the change and verify the CVEs are gone:

```
npm install
npm audit
npm run build
```

Confirm no HIGH CVEs from `serialize-javascript` remain after install.
