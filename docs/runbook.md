# Everion — Business Continuity Runbook

## On-call contact

**Christian Stander** — stander.christian@gmail.com

---

## Vercel rollback

1. Open [vercel.com/dashboard](https://vercel.com/dashboard) → select the Everion project
2. Go to **Deployments** tab
3. Find the last known-good deployment
4. Click the **···** menu → **Promote to Production**

One-click — no CLI required.

---

## Check production logs

```bash
vercel logs --follow
```

Or in the Vercel dashboard: **Deployments** → select deployment → **Logs** tab.

---

## Supabase backup restore

1. Open [supabase.com/dashboard](https://supabase.com/dashboard) → select the Everion project
2. Go to **Database** → **Backups**
3. Select the backup point-in-time to restore from
4. Click **Restore** and confirm

> Supabase Pro plan includes daily backups with 7-day retention and point-in-time recovery.

---

## Emergency contacts / services

| Service | Dashboard |
|---------|-----------|
| Vercel (hosting) | vercel.com/dashboard |
| Supabase (database + auth) | supabase.com/dashboard |
| Sentry (error monitoring) | sentry.io |
| Upstash (rate limiting) | console.upstash.com |
