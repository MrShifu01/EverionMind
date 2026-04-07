# OpenBrain — Consolidated TODO

> Unresolved items only. Completed work removed.  
> Last updated: 2026-04-07  
> Consolidated from: GAPS.md · AI-models.md · audit-sprint.md · todo.md

---

## Immediate / Manual Actions

- **Revoke leaked Telegram Bot Token** — flagged by GitGuardian on commit `d811ad2`. Go to @BotFather → `/revoke`, generate new token, update `BOT_TOKEN` / `TELEGRAM_BOT_TOKEN` in Supabase env vars.
- **Update Supabase email template** — Auth → Email Templates → Magic Link, add `{{ .Token }}` so the OTP code is visible for PWA sign-in.
- **Run migration 013 in Supabase SQL editor** — file is at `supabase/migrations/013_flexible_entry_types.sql`. Drops any hardcoded `entries_type_check` constraint and replaces the `capture` RPC to accept any AI-generated type string (not just the old whitelist). Not auto-applied — must be run manually.
- **Add `RESEND_API_KEY` to Vercel env vars** — required for brain invite emails to be delivered. Get a free key at resend.com (100 emails/day free). Add in Vercel → Settings → Environment Variables. Also add `APP_URL=https://open-brain-ib4e.vercel.app` so invite accept links point to the correct domain.

---

## Security

### SEC-12 · Add security headers to all API handlers
**Files:** All `api/*.ts` handlers  
**Risk:** No `X-Content-Type-Options` or `X-Frame-Options` — MIME sniffing and framing attacks possible.  
**Fix:** Add to every response:
```ts
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Frame-Options", "DENY");
```

### SEC-16 · Upgrade cron auth to HMAC-signed requests
**File:** `api/cron/push.ts:30` — TODO comment already in code  
**Status:** `CRON_SECRET` bearer + `x-vercel-cron` header check in place, but HMAC upgrade is pending.  
**Fix:** Sign with `HMAC-SHA256(CRON_SECRET, timestamp)`; add IP whitelist `76.76.21.0/24` in `vercel.json`.

### ARCH-6 · Move PIN hash server-side
**Current:** PBKDF2 is used (good) but hash is still stored in `localStorage` — XSS accessible.  
**Fix:** POST derived key to `/api/pin/verify`; store hash in `user_ai_settings` or a `pin_hashes` table; remove from `localStorage`.

---

## Performance

### PERF-6 · Debounce `findConnections` / skip during bulk import
**Risk:** Auto-link discovery fires on every entry during Fill Brain, hammering the AI API.  
**Fix:** 5 s debounce; set `isBulkImporting` flag to suppress calls during batch; run a single pass after bulk completes.

---

## Code Quality

### CODE-2 · Replace silent `.catch(() => {})` blocks
**File:** `src/OpenBrain.tsx` lines ~281, ~376, ~416, ~604  
**Risk:** Data-loss failures are invisible to the user.  
**Fix:** Each catch must at minimum `console.error()`. User-facing failures must show a toast via `src/lib/notifications.ts`.

---

## AI — Per-Task Model Pickers (Settings UI)

Data layer (`getModelForTask`, `loadTaskModels`, `model_capture` etc.) and `callAI()` wiring are done. **The Settings UI is not built yet.**

### Per-task dropdown rows
Add a collapsible **"Advanced: per-task models"** section to `src/views/SettingsView.tsx`, rendered only when `provider === "openrouter"`:

| Label | Task key |
|---|---|
| Entry capture | `capture` |
| Fill Brain questions | `questions` |
| Image reading | `vision` |
| Refine collection | `refine` |
| Brain chat | `chat` |

- Top option: **"Same as global default"** (saves `null`). On change: `setModelForTask(task, value === "default" ? null : value)`.
- `vision` dropdown: filter to `modality.includes("image")` models only.
- Load from `user_ai_settings` on mount (extend existing Supabase fetch).

### Pricing tier badges
Add `priceTier` badges to all model dropdowns (global + per-task):

```ts
function priceTier(pricing) {
  const p = parseFloat(pricing?.prompt ?? 1);
  if (p === 0)       return { label: "Free",      color: "#22c55e" };
  if (p < 0.000001)  return { label: "Cheap",     color: "#4ECDC4" };
  if (p < 0.000010)  return { label: "Normal",    color: "#888" };
  return              { label: "Expensive",  color: "#FF6B35" };
}
```

Render inline: `gemini-2.0-flash-exp  [Free]`, `gpt-4o  [Expensive]`.

---

## Strategic Roadmap

### Phase 1 — High impact, achievable now

| Item | Description |
|---|---|
| **Agentic scheduled tasks** | Vercel Cron → `/api/agent`: Memory Synthesizer (weekly `user_memory` rewrite), Expiry Agent (30/7/1-day document alerts), Gap Analyst (scan brain for missing info), Contradiction Detector |
| **Knowledge graph traversal in chat** | When user asks about an entity, fetch its 2-hop `entry_links` neighborhood and include in chat context |
| **Staleness + confidence scoring** | Flag entries not updated in 6+ months; AI marks entries as verified/unverified/contradicted |
| **Observability** | Sentry for frontend errors; Axiom or Datadog for API logs; Vercel Analytics for performance |

### Phase 2 — High value, moderate effort

| Item | Description |
|---|---|
| **Client-side encryption (E2EE Phase 1)** | Encrypt `entries.content` + `entries.metadata` with `AES-256-GCM` in browser before storing. Mitigate search loss with client-side MiniSearch index. |
| **PDF ingestion** | Upload lease/contract/recipe → AI extracts key fields → structured entries. `/api/parse-doc` + PDF.js. |
| **Entry versioning** | Content snapshots on every update; `entry_versions` table (entry_id, content, metadata, saved_at); user can roll back. |
| **Recurring reminders** | Entry-level reminder settings (e.g. 30 days before expiry, repeat annually). Extend cron expiry agent. |
| **Markdown / rich text editor** | Tiptap or Milkdown for long-form entries (headers, lists, code blocks). |

### Phase 3 — High value, high effort

| Item | Description |
|---|---|
| **Full E2EE** | Per-brain symmetric keys wrapped with per-user `X25519` public keys. `brain_keys` table. Move AI calls to browser (decrypt → call AI provider → re-encrypt). |
| **Voice query / TTS** | Speak a question → brain answers aloud via browser Speech API or ElevenLabs. Telegram bot: Whisper transcription for voice notes. |
| **On-device AI** | WebLLM (`Phi-3-mini` / `Gemma-2B`) in browser via WebGPU for offline classification. Ollama integration for desktop power users. |
| **Smart import** | AI import wizard: parse Notion / Obsidian / Apple Notes / Google Keep exports → map to entry types. |
| **Real-time collaboration** | Supabase Realtime subscriptions → live updates. Comments on entries, @mentions. |
| **Analytics dashboard** | Brain health: entry growth, link density, most-accessed entries, staleness heatmap. |

### Future

| Item | Description |
|---|---|
| **Fine-tuned personal model** | Log AI classification corrections → batch weekly → fine-tune small model. ~500 corrections = near-zero errors for power users. |
| **Native mobile app** | React Native / Capacitor: Share Sheet, Siri Shortcuts, iOS home screen widget. |
| **TEE-based AI inference** | Zero-knowledge with frontier AI via Intel TDX / AMD SEV-SNP. Viable ~2027. |
