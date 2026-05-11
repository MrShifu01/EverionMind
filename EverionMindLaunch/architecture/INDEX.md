# Architecture Documentation Index

> Reference docs for cross-cutting components, pipelines, and workflows. Tiered by leverage — Tier 1 has the highest payoff (cross-cutting hubs, recent bug magnets, footgun density). Each entry has a one-line *why this is worth a writeup*. Source files live alongside this INDEX in `EverionMindLaunch/architecture/`.

**Done:**
- ✅ [Notification Bell](bell.md) — `src/components/NotificationBell.tsx`
- ✅ [Capture pipeline](capture.md) — `CaptureSheet.tsx` + `useCaptureSheetParse.ts` + `api/capture.ts`
- ✅ [Enrichment pipeline](enrich.md) — `api/_lib/enrich.ts` + `enrichFlags.ts` + PICE chips
- ✅ [Workflows + cron](cron.md) — `.github/workflows/*.yml` + `handleCronDaily/Hourly`
- ✅ [Auth + tier + rate](auth.md) — `withAuth`, `app_metadata.is_admin`, tier quotas, Upstash limiter

---

## Tier 1 — Cross-cutting hubs (do these first)

### 1. Memory / retrieval
**Files:** `api/_lib/retrievalCore.ts` + `api/memory-api.ts` + `api/_lib/promptContext.ts` + `src/lib/conceptGraph.ts`
**Why:** Hybrid vector + keyword retrieval feeding Chat, MCP, and search. Persona-fact injection, recency boosting, brain scoping. The thing that makes Everion's chat feel "smart" — and the place where retrieval bugs surface as "why didn't it find X?".

---

## Tier 2 — Big components with state complexity

### 7. CaptureSheet (the component, separate from the pipeline)
**Files:** `src/components/CaptureSheet.tsx` (607 lines) + `CaptureEntryBody`, `CapturePreviewPanel`, `CaptureSecretPanel`
**Why:** Tabs (entry / secret), drag-handle drag-to-dismiss, voice recording, image capture, file extraction, vault encryption, someday toggle, brain override, mobile vs desktop layouts, FocusTrap, save-shortcut. Component-level concerns separate from the pipeline doc.

### 8. Vault (encryption + lock + recovery + reveal)
**Files:** `src/components/VaultRevealModal.tsx` + `src/views/VaultView.tsx` + `src/lib/crypto.ts` + `src/hooks/useVaultOps.ts` + `vault_keys` table + secret entries
**Why:** Cryptographic surface. Argon2id key derivation, AES-GCM, lock countdown, recovery codes. Get this wrong and user data is unrecoverable. Worth a careful single doc that consolidates the full key lifecycle.

### 10. Persona pipeline (extraction + hygiene + dedup)
**Files:** `api/_lib/extractPersonaFacts.ts` + `personaTools.ts` + `personaHygiene.ts` + `buildProfilePreamble.ts`
**Why:** Auto-extracts short facts from entries, treats them as first-class entries with `type='persona'`, runs daily decay + weekly dedup + weekly digest. Powers the persona section of every chat preamble. ~1100 lines across the trio. Easy to mis-tune (over-extraction = noise, under = forgetting things).

### 11. EntryList / Memory grid
**Files:** `src/components/EntryList.tsx` (932 lines) + `EntryListBits.tsx` + `EntryQuickActions.tsx` + `BulkActionBar.tsx`
**Why:** The hero surface of the app. Sorting (recency / importance / pinned), filtering, hover preview, click-to-detail, multi-select bulk actions, drag-to-pin, swipe gestures on mobile. Where the rendering bugs land first when something upstream changes.

### 12. OmniSearch (`⌘K`)
**Files:** `src/components/OmniSearch.tsx` (560 lines)
**Why:** Three-segment palette (entries / concepts / commands), keyboard nav, fuzzy match, command registry. Touches the entire surface area of the app via shortcuts.

---

## Tier 3 — Subsystems / focused features

### 13. Push subscription lifecycle
**Files:** `src/components/NotificationSettings.tsx` (693 lines) + `useNotifications.ts` + Service Worker push handler + VAPID setup + cron-hourly send loop
**Why:** Browser permission → VAPID subscribe → store on `auth.users.user_metadata.push_subscription` → cron pulls and sends → 410/404 prunes. Three failure modes (permission denied, subscription expired, VAPID misconfig) all surface differently.

### 14. Brain switcher + multi-brain plumbing
**Files:** `src/components/BrainSwitcher.tsx` + `CreateBrainModal.tsx` + `MoveToBrainModal.tsx` + `BrainTab.tsx` + `useBrain.ts` + `multiBrain` feature flag + `brain_metadata` migration 060
**Why:** Recently-shipped feature behind a flag. Move-between-brains rules, ownership, RLS interaction. Per-capture brain pill. The plumbing isn't fully exposed yet — doc captures the design intent before it leaks.

### 15. Billing — LemonSqueezy + RevenueCat
**Files:** `src/components/settings/BillingTab.tsx` + `api/_lib/billing.ts` + `lemonsqueezy.ts` + `revenuecat.ts` + `webhookIdempotency.ts` + the four billing resources in `api/user-data.ts` (`lemon-checkout`, `lemon-webhook`, `lemon-portal`, `revenuecat-webhook`) + migration `065`
**Why:** LemonSqueezy is the merchant of record for the web (handles VAT / tax / global compliance) — replaced Stripe 2026-04-30 (commit `c484030`). RevenueCat abstracts Apple App Store + Google Play for native. The two sides bridge: the LS webhook calls RC `grantEntitlement` so a web purchase shows up as paid on mobile too. Webhook signature verification (HMAC-SHA256 for LS, bearer for RC), idempotency via `webhookIdempotency.ts` SET-NX, plan/variant mapping, subscription state ↔ `user_profiles.tier`. Handles real money, deserves the diligence.

### 15a. Admin support CRM
**Files:** `src/components/settings/AdminCRMSection.tsx` + `admin_users` / `admin_user_overview` / `admin_set_tier` resources in `api/user-data.ts` + migration `066` (RPCs + tier index)
**Why:** Internal `/admin` console for support: search any user, view tier + this-month usage + last 50 audit events, override tier with a recorded reason. Read-only by default; the tier mutation is gated behind an inline reason panel and writes `audit_log` action `admin_tier_changed { actor_id, previous_tier, new_tier, reason }`. Two `SECURITY DEFINER` RPCs (`admin_list_users`, `admin_user_overview`) granted to `service_role` only — caller's `app_metadata.is_admin` is checked in the API layer first.

### 16. Service Worker + PWA + self-heal
**Files:** `src/sw.js` + `src/components/UpdatePrompt.tsx` + `main.tsx` self-heal + `ErrorBoundary.tsx`
**Why:** Just wrote the stale-bundle self-heal but the rest (cache strategy, precache manifest, controllerchange handling, push handler, update prompt) deserves the same once-over. Web push, install prompt, offline behavior all converge here.

### 17. Imports (Bear / Notion / Evernote / Keep / NotebookLM)
**Files:** `src/components/settings/{Bear,Notion,Evernote,GoogleKeep}ImportPanel.tsx` + `BulkImportPanel.tsx`
**Why:** Each format has its own parsing quirks (Bear's tag inheritance, Notion's nested blocks, Evernote's ENEX). One doc covering "how an import becomes entries" plus the per-source notes saves rediscovery.

### 18. Onboarding flow
**Files:** `src/components/OnboardingModal.tsx` (550 lines) + onboarding steps + brain seed + persona priming
**Why:** First-run experience. Determines retention. The 5-30 min walk-through worth understanding before A/B-testing changes.

### 19. MCP server
**Files:** `api/mcp.ts` (712 lines) + the `/.well-known` rewrites + OAuth dance + tool surface
**Why:** Lets external agents (including Claude itself) talk to a user's brain. OAuth flow, tool registration, resource exposure. Niche but high-impact for power users.

### 20. LLM router
**Files:** `api/llm.ts` (896 lines) + `aiProvider.ts` + `resolveProvider.ts` + `providers/`
**Why:** Multi-provider switching (Gemini / Anthropic / OpenAI / OpenRouter / Groq), BYOK resolution, transcribe + extract-file actions, model-name normalization, streaming. Where every LLM call lands.

### 21. Graph view
**Files:** `src/components/graph/*` + `useGraph.ts` + `build_similarity_graph` SQL RPC
**Why:** The "constellations" surface from the redesign spec. Force-directed layout disabled in favor of star metaphor. Concept extraction → similarity graph → render → interactive zoom.

### 22. Background ops + offline queue
**Files:** `src/hooks/useBackgroundOps.tsx` + `useOfflineSync.ts` + `backgroundTaskRegistry.ts` + `BackgroundOpsToast.tsx` + `BackgroundTaskToast.tsx`
**Why:** "Run-now enrichment is happening in the background" toast, offline-mode queueing, retry-on-reconnect. Ties into the offline-capture-queue someday item.

---

## Tier 4 — Worth a paragraph in a parent doc, not a standalone

- `useDataLayer.ts` — entry CRUD wrapper, fits inside the EntryList doc
- `useEntryRealtime.ts` — Supabase realtime subscription, fits inside EntryList
- `learningEngine.ts` — pattern detection, fits inside Persona pipeline
- `contactPipeline.ts` — phone-number extraction, fits inside Capture pipeline
- `aiSettings.ts` — BYOK + model selection, fits inside LLM router
- Settings tabs each (Account, Data, Danger, etc.) — UI-thin, low complexity per line

---

## Suggested order

If we work through this systematically, the highest-leverage remaining path is:

1. **Memory / retrieval** (Tier 1.1) — the chat-feels-smart layer
2. **Vault** (Tier 2.8) — security-critical, document while design intent is clear
3. **Persona pipeline** (Tier 2.10) — quietly powerful, easily mis-tuned

Each takes ~30 min to write at `bell.md` density. Three more = a
roughly-complete handbook (Bell + Capture + Enrich + Cron + Auth done).

---

## How to refresh this index

When a new component or pipeline lands that meets the criteria (multiple
writers, hidden state, cross-cutting), add it to the appropriate tier.
When one is documented, move it to the **Done** list at the top with a
link to the file.

Bell.md is a reference template — same headings (TL;DR, file map, data
shape, sources, lifecycle, clearing/teardown, server endpoint, recent
changes, known limitations) work for most of these.
