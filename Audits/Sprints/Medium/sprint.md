# Sprint — Medium Severity Fixes
**Created:** 2026-04-15
**Source:** Audits/Medium/audit.md (31 findings)
**Goal:** Close configuration gaps, architectural coupling, accessibility blockers, and UX friction that collectively degrade the app's trustworthiness, performance, and usability for real users.

> **Note:** Several tasks here are architectural (M-9, M-24–M-28) and depend on High sprint items being stable first. Complete the High sprint before starting the architecture cluster (M-9, M-24, M-25, M-26, M-27, M-28).

---

## How to use this sprint

Tasks are grouped into four themes. Work a full theme at a time rather than cherry-picking across themes — context switching between security config, architecture, UX, and accessibility is expensive.

**Effort key:** `XS` <30 min · `S` 1–2h · `M` half-day · `L` full day · `XL` multi-day

---

## Theme 1 — Security & Compliance Config

### [x] M-1 — Move Sentry DSN to env var
**Effort:** XS | **File:** `src/main.tsx:11`

- [ ] Replace hardcoded DSN string with `import.meta.env.VITE_SENTRY_DSN`
- [ ] Add `enabled: !!import.meta.env.VITE_SENTRY_DSN` to silence dev noise
- [ ] Add `sendDefaultPii: false` (pairs with H-4)
- [ ] Add `VITE_SENTRY_DSN=...` to `.env.example` (resolves L-1 simultaneously)

---

### [x] M-2 — Add HSTS header
**Effort:** XS | **File:** `vercel.json`

- [ ] Add `{ "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains; preload" }` to the headers array

---

### [ ] M-3 — Verify Upstash Redis is configured in production
**Effort:** XS | **Action:** Vercel dashboard check

- [ ] Run `vercel env ls` — confirm `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are present
- [ ] If missing: add them (Upstash free tier is sufficient)
- [ ] Confirm rate limiting is functional by checking `api/_lib/rateLimit.ts` falls into the Redis path

---

### [ ] M-4 — Move user API keys to Supabase Vault
**Effort:** M | **File:** `user_ai_settings` table, related fetch/save code

- [ ] Migrate `groq_key` and `gemini_key` storage to `vault.create_secret` / `vault.secret_id` references
- [ ] Update all code that reads these keys to fetch from Vault rather than the plaintext column
- [ ] Drop the plaintext columns from the table after migration

---

### [x] M-5 — Downgrade `vite-plugin-pwa` to avoid build-pipeline CVEs
**Effort:** XS | **File:** `package.json`

- [ ] Change `vite-plugin-pwa` to `0.19.8` in `package.json`
- [ ] Run `npm install` and confirm build passes
- [ ] Run `npm audit` — HIGH CVEs from `serialize-javascript` should be gone

---

### [x] M-6 — Add `npm audit` to CI
**Effort:** XS | **File:** `.github/workflows/ci.yml`

- [ ] Add `- run: npm audit --audit-level=high` step to the CI workflow
- [ ] Confirm the step fails correctly on a known-bad dep, then fix any blockers

---

### [ ] M-15 — Add cookie consent gating
**Effort:** M | **Files:** `src/main.tsx`, new consent component

- [ ] Audit which third-party scripts set cookies (Sentry, Vercel Speed Insights)
- [ ] Create a minimal consent banner component
- [ ] Gate `Sentry.init()` and Speed Insights behind consent flag
- [ ] Store consent decision in localStorage

---

### [x] M-16 — Add Terms of Service page
**Effort:** S | **Files:** new ToS page, login screen link

- [ ] Draft minimal ToS (can be a static Markdown-rendered page)
- [ ] Link from login screen alongside privacy policy (H-4)

---

## Theme 2 — Architecture & Code Quality

### [ ] M-9 — Decompose `Everion.tsx` (1,171 lines)
**Effort:** XL | **Files:** `src/Everion.tsx`, new hooks + context

The application root owns everything: 45+ useState calls, data fetching, enrichment orchestration, search indexing, concept graph derivation, and navigation. Concept graph re-derives on every entry mutation (including 100s per session).

- [ ] Extract all view/modal/UI state into `src/hooks/useAppShell.ts`
- [ ] Extract entry fetching, cache write, search indexing into `src/hooks/useDataLayer.ts`
- [ ] Lift concept graph into `src/context/ConceptGraphContext.tsx` — consumers call `useConceptGraph()`, graph re-derives only on brain change
- [ ] `Everion.tsx` should have ≤5 `useState` calls after refactor
- [ ] Smoke-test all views: Feed, Ask, Refine, Detail, Settings

---

### [ ] M-24 — Add explicit types to `EntriesContext` and `BrainContext`
**Effort:** S | **Files:** `src/context/EntriesContext.tsx`, `src/context/BrainContext.tsx`, `src/Everion.tsx`

Both contexts are `createContext<any>(null)`. Shape drifts fail silently at runtime.

- [ ] Define `EntriesContextValue` interface in `EntriesContext.tsx` with all current fields
- [ ] Define `BrainContextValue` interface in `BrainContext.tsx`
- [ ] Throw readable error when hooks are used outside a provider
- [ ] Remove `setEntries` from context — only `handleUpdate` and `handleDelete` should be exposed
- [ ] Type the `useMemo` context values in `Everion.tsx` to match interfaces
- [ ] Fix any consumers that currently call `useEntries().setEntries` directly

---

### [ ] M-25 — Cache `authFetch` session token + separate usage tracking
**Effort:** S | **File:** `src/lib/authFetch.ts`, `src/lib/usageTracker.ts`

`getSession()` called ~100x/session. Usage tracking is a hidden side effect inside the transport layer.

- [ ] Add `_sessionCache: { token: string; expiresAt: number } | null` with 4-minute TTL
- [ ] Invalidate cache on `supabase.auth.onAuthStateChange`
- [ ] Extract `trackEmbeddingIfPresent(response)` into `usageTracker.ts`
- [ ] Remove the `usageTracker` import from `authFetch.ts`
- [ ] Update call sites that need tracking to call `trackEmbeddingIfPresent` explicitly

---

### [ ] M-26 — Fix ConceptGraph: add versioning, fix normalization, add dirty flag
**Effort:** M | **File:** `src/lib/conceptGraph.ts`, `src/types.ts`

No schema version → stale data silently loaded. Lossy normalization → duplicate concept nodes accumulate. Silent DB save failure → localStorage ahead of DB with no recovery.

- [ ] Add `version: 2` to `ConceptGraph` interface; add `migrateGraph()` for v1 data
- [ ] Fix `normalize()`: add `label.replace(/[''\u2019s]+\b/g, "")` before punctuation strip
- [ ] Add `concept_graph_dirty_{brainId}` flag: set before DB write, clear on success, retry on next load
- [ ] Add `validateGraph()` guard before any `mergeGraph` call
- [ ] Test: "Smith's Practice" and "Smiths Practice" should produce the same normalized key

---

### [x] M-27 — Deduplicate `SKIP_META` into a single source of truth
**Effort:** XS | **Files:** `src/lib/chatContext.ts`, `src/lib/enrichEntry.ts`, new `src/lib/entryConstants.ts`

Two separate `SKIP_META` sets with different contents. They will drift further as new metadata fields are added.

- [ ] Create `src/lib/entryConstants.ts` with `export const SKIP_META_KEYS = new Set([...])`
- [ ] Replace `SKIP_META` in `chatContext.ts` with import
- [ ] Replace `ENRICH_SKIP_META` in `enrichEntry.ts` with import
- [ ] Verify neither local constant name remains in the codebase

---

### [ ] M-28 — Write tests for critical untested paths
**Effort:** XL | **Files:** new `src/__tests__/` files

13% test coverage. Race conditions and broken field names (H-10, H-11) were caught by manual audit, not CI.

- [ ] `src/__tests__/graphWriter.test.ts` — two concurrent `writeConceptsToGraph` calls for the same brainId: second must wait for first
- [ ] `src/__tests__/conceptGraph.normalization.test.ts` — "Smith's Practice" = "Smiths Practice", possessive variants, punctuation
- [ ] `src/__tests__/refineDetectors.test.ts` — all pure detection functions; `detectOrphans` with real `from_id`/`to_id` fields
- [ ] `src/__tests__/authFetch.session.test.ts` — cache reuse within TTL, invalidation on auth state change
- [ ] `src/__tests__/enrichEntry.test.ts` — each of the 4 enrichment phases fails in isolation without blocking the others

---

### [x] M-7 — Replace 77 silent `catch {}` blocks with logging
**Effort:** M | **Files:** `BulkActionBar.tsx`, `BrainTab.tsx`, `SurprisingConnections.tsx`, others

- [ ] Fix `BulkActionBar.tsx:109,121` — surface bulk operation failures to the user; don't increment progress counter on failure
- [ ] Fix `BrainTab.tsx:46,191,209` — log and show error toast on brain create/update/delete failure
- [ ] Fix `SurprisingConnections.tsx:30` — show empty state on fetch failure
- [ ] Grep for remaining empty `catch {}` in critical paths and add `console.error` at minimum

---

### [x] M-8 — Halt growth of `: any` usages (249 and climbing)
**Effort:** S | **File:** `eslint.config.js`, then incremental

- [ ] Enable `@typescript-eslint/no-explicit-any: warn` in `eslint.config.js`
- [ ] Fix `any` in all API route files first (highest risk — runtime type errors on user data)
- [ ] Fix `any` in Supabase return types across data layer files
- [ ] Track count: target under 100 within two sprints

---

### [x] M-13 — Remove localStorage write-back in `loadUserAISettings`
**Effort:** XS | **File:** `src/lib/aiSettings.ts:157-165`

- [ ] Remove the localStorage write-back for model overrides and embed provider
- [ ] Keep all settings in-memory after load
- [ ] Verify settings persist correctly across page reloads (should come from DB, not localStorage)

---

### [x] M-14 — Lazy-load `CaptureSheet.tsx`
**Effort:** XS | **File:** Import site in `Everion.tsx` or wherever CaptureSheet is imported

- [ ] Wrap the import in `React.lazy(() => import('./CaptureSheet'))`
- [ ] Add a `<Suspense fallback={null}>` boundary around its usage
- [ ] Verify the sheet still opens correctly on FAB tap

---

## Theme 3 — UX & Product Quality

### [ ] M-29 — Redesign connections list (group by type, add labels)
**Effort:** M | **File:** connections rendering in `DetailModal.tsx` or its sub-component

The connections section is a flat `<ul>` with no grouping. The app's core value prop (links between ideas) is invisible.

- [ ] Group connection items by type (recipe, person, document, note, etc.)
- [ ] Add a small type icon or label badge per connection
- [ ] Show top 3 by default with "see all N" expand control
- [ ] Test with an entry that has 10+ connections — should feel organised, not overwhelming

---

### [x] M-30 — Add text labels to bottom navigation
**Effort:** XS | **File:** `src/components/BottomNav.tsx`

- [ ] Add text labels under each bottom nav icon (`text-[10px]`, muted color)
- [ ] Verify labels are visible and legible on a real mobile device

---

### [x] M-31 — Rewrite AI chat not-found response + remove internal terminology
**Effort:** S | **File:** `src/config/prompts.ts` — CHAT prompt

- [ ] Audit CHAT prompt for "retrieved memories", "indexed", "memory store" — replace with "remembered", "saved", "stored"
- [ ] Add explicit not-found instruction: when a requested fact is absent, respond "You haven't saved your [X] yet. Want to add it?" rather than routing to external sources
- [ ] Test: ask for a fact not in the brain and verify the response turns it into a capture prompt

---

### [ ] M-10 — Set up staging environment
**Effort:** M | **Action:** Vercel dashboard + GitHub

- [ ] Create a `staging` branch in the repo
- [ ] Configure Vercel to auto-deploy `staging` branch with separate env vars
- [ ] Recommend a separate Supabase project for staging (avoids polluting prod data)
- [ ] Update PR process: merge to `staging` first, promote to `main` after verification

---

### [ ] M-11 — Add external uptime monitoring
**Effort:** XS | **Action:** UptimeRobot or Checkly (free tier)

- [ ] Set up monitor pinging `/api/health` every 5 minutes
- [ ] Configure alert to Telegram or email on failure

---

### [x] M-12 — Add soft-delete purge cron job
**Effort:** S | **Files:** `vercel.json`, new `api/cron/purge-trash.ts`

- [ ] Add cron schedule to `vercel.json`: `{ "path": "/api/cron/purge-trash", "schedule": "0 3 * * 0" }`
- [ ] Implement `api/cron/purge-trash.ts`: delete entries where `deleted_at < NOW() - INTERVAL '30 days'`
- [ ] Guard with service role key + verify the cron runs correctly

---

## Theme 4 — Accessibility

### [x] M-17 — Add global focus ring, remove systemic `outline-none`
**Effort:** S | **Files:** `index.css`, then 42 component files

- [ ] Add to `index.css`: `:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }`
- [ ] Add `:focus:not(:focus-visible) { outline: none; }` to suppress on mouse click
- [ ] Remove `outline-none` from all interactive elements (or replace with `focus-visible:outline-none` where intentional)
- [ ] Keyboard-navigate through the app and verify focus is always visible

---

### [x] M-18 — Fix OmniSearch combobox ARIA pattern
**Effort:** S | **File:** `src/components/OmniSearch.tsx:85-280`

- [ ] Add `role="combobox"`, `aria-expanded`, `aria-haspopup="listbox"`, `aria-controls`, `aria-autocomplete="list"` to the input
- [ ] Wrap results in `<ul role="listbox">` with `<li role="option" aria-selected>` per item
- [ ] Test with a screen reader (VoiceOver / TalkBack)

---

### [x] M-19 — Increase touch target sizes to 44px minimum
**Effort:** S | **Files:** `BulkActionBar.tsx`, `EntryList.tsx`, `KeyConcepts.tsx`, `CaptureSheet.tsx`

- [ ] Change `py-1`/`py-1.5` to `py-2.5` on small action buttons
- [ ] Apply `h-11 w-11` to icon-only action buttons
- [ ] Visually verify on a real mobile device — no layout shifts

---

### [x] M-20 — Fix 14px input font (iOS auto-zoom)
**Effort:** XS | **File:** `src/App.tsx:192`

- [ ] Change `fontSize: "14px"` to `fontSize: "16px"`
- [ ] Test on iOS Safari — focused input should not zoom the viewport

---

### [x] M-21 — Define `--color-success` token
**Effort:** XS | **Files:** `index.css`, `src/components/settings/ProvidersTab.tsx:51`

- [ ] Add `--color-success: oklch(62% 0.15 142)` to `index.css @theme`
- [ ] Remove the `#4ade80` hardcoded fallback from ProvidersTab
- [ ] Verify color works in both light and dark mode

---

### [x] M-22 — Add ARIA live regions for async status updates
**Effort:** S | **Files:** `CaptureSheet.tsx`, `FeedView.tsx`, `OmniSearch.tsx`

- [ ] Add `<div aria-live="polite" aria-atomic="true" className="sr-only">` with contextual status text to CaptureSheet AI parse result, FeedView load, and OmniSearch results

---

### [x] M-23 — Fix BulkActionBar dropdown ARIA attributes
**Effort:** XS | **File:** `BulkActionBar.tsx:261,328`

- [ ] Add `aria-expanded={isOpen}` and `aria-haspopup="true"` to both trigger buttons
- [ ] Add `id` and `aria-controls` pairing to each panel they open

---

## Sprint Summary by Theme

| Theme | Tasks | Est. Total Effort |
|-------|-------|------------------|
| Security & Compliance | M-1, M-2, M-3, M-4, M-5, M-6, M-15, M-16 | ~2 days |
| Architecture & Code Quality | M-7, M-8, M-9, M-13, M-14, M-24–M-28 | ~4–5 days |
| UX & Product Quality | M-10, M-11, M-12, M-29, M-30, M-31 | ~1.5 days |
| Accessibility | M-17–M-23 | ~1.5 days |

**Recommended order within themes:** Security first (no dependencies), then Architecture (unblocks everything), then UX + Accessibility in parallel.
