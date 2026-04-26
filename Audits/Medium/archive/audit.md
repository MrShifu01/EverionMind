# Medium Severity Findings — EverionMind
**Combined from:** Production Audit (2026-04-14), Smash OS Audit Pass 5 (2026-04-12), Pass 6 (2026-04-14), Impeccable Audit (2026-04-14), Architecture Deep Audit (2026-04-15), Design Critique (2026-04-14)
**Status:** All items below are open as of 2026-04-15 unless noted.

---

## M-1 — Sentry DSN hardcoded in source; not configurable per environment
**Source:** Production Audit (WARN S1-1), Pass 6 (MEDIUM)

`src/main.tsx:11` has the Sentry DSN as a string literal. This means:
- The DSN cannot be rotated without a code deploy
- The same DSN is used in local development, staging (if any), and production — all errors conflated in one Sentry project
- The DSN cannot be disabled for dev environments

**Fix:** Move to env var and add to `.env.example`:
```ts
// src/main.tsx
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
  sendDefaultPii: false,
});
```

---

## M-2 — HSTS header missing
**Source:** Production Audit (WARN S1-3)

`vercel.json` sets CSP, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy but is missing `Strict-Transport-Security`. Without HSTS, browsers can be downgraded to HTTP on the first request (MITM window).

**Fix:** Add to `vercel.json` headers array:
```json
{ "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains; preload" }
```

---

## M-3 — Rate limiting non-functional if Upstash is not configured in production
**Source:** Production Audit (WARN S1-6)

`api/_lib/rateLimit.ts` falls back to in-memory rate limiting when `UPSTASH_REDIS_REST_URL` is absent. In-memory state does not persist across Vercel serverless invocations — each cold start resets the counter. The comment in the file explicitly notes: *"zero real protection in serverless"*.

**Action:** Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set in the Vercel production environment (`vercel env ls`). If not set, add them.

---

## M-4 — User API keys stored as plaintext in the database
**Source:** Production Audit (WARN DB-8)

`groq_key` and `gemini_key` are stored as plaintext columns in the `user_ai_settings` table. A Supabase service role key compromise or a misconfigured RLS policy would expose all user API keys.

**Fix:** Use Supabase Vault (`vault.create_secret`) for key storage, or at minimum apply column-level encryption. Keys should be stored as opaque references, not raw strings.

---

## M-5 — `vite-plugin-pwa` HIGH CVE in build pipeline
**Source:** Production Audit (FAIL CODE-5b), Pass 6 (MEDIUM)

`vite-plugin-pwa@>=0.20.0` depends on `workbox-build` → `@rollup/plugin-terser` → `serialize-javascript <=7.0.2`, which has:
- **GHSA-5c6j-r48x-rmvq** — RCE via crafted RegExp.flags (CVSS 8.1)
- **GHSA-qj8w-gfj5-8c6v** — CPU exhaustion DoS via crafted array-like objects

These are **build-time only** — they do not ship to production browsers. However, a compromised build environment could tamper with the output bundle.

**Fix:** Downgrade to `vite-plugin-pwa@0.19.8` (the last version before the vulnerable workbox-build dependency was introduced) until a patched version is available upstream.

---

## M-6 — `npm audit` not in CI — CVEs ship silently
**Source:** Pass 6 (MEDIUM)

The CI pipeline (`.github/workflows/ci.yml`) runs typecheck, lint, format:check, and test — but not `npm audit`. The HIGH CVEs currently present were caught manually, not by CI.

**Fix:** Add to `.github/workflows/ci.yml`:
```yaml
- run: npm audit --audit-level=high
```

---

## M-7 — 77 silent `catch {}` blocks in UI code
**Source:** Pass 6 (MEDIUM)

There are 77 instances of `catch {}` across `src/` with no logging or user feedback. Notable cases:
- `BulkActionBar.tsx:109` — bulk type-change network failures silently skipped; progress counter increments regardless
- `BulkActionBar.tsx:121` — bulk brain-assignment failures silently skipped
- `BrainTab.tsx:46,191,209` — brain create/update/delete errors swallowed
- `SurprisingConnections.tsx:30` — connection fetch failure swallowed

**Fix:** Replace `catch {}` on meaningful paths with `catch (e) { console.error(...); }` at minimum, and surface failures to the user in bulk operations (BulkActionBar especially).

---

## M-8 — 249 `: any` usages across src/ and api/
**Source:** Pass 5 (68 occurrences), Pass 6 (249 — significant increase)

The `any` count has grown from 68 to 249 between pass 5 and pass 6, suggesting new code is being written without type annotations. This defeats TypeScript's ability to catch bugs at compile time.

**Action:** Enforce `no-explicit-any` in `eslint.config.js` as a warning to halt the growth, then work down the count incrementally. Focus on API response types and Supabase return types first.

---

## M-9 — `Everion.tsx` — 1,171-line orchestration god component
**Source:** Pass 6 (MEDIUM), Architecture Deep Audit (MEDIUM)

`src/Everion.tsx` serves as both the application shell AND the primary data layer: ~45 independent `useState` calls covering core data, UI state, modals, enrichment, online state, vault, and theme. It also owns all AI enrichment orchestration, entry loading, cache writing, search indexing, concept graph derivation, and navigation. The concept graph is re-derived on every entry mutation (lines 337–340), including the hundreds of mutations per session from loading, sync, and enrichment — every change triggers a localStorage read and full concept map reconstruction.

**Location:** `src/Everion.tsx` (1,171 lines)

**Fix (phased — from Architecture Deep Audit):**
1. Extract UI/modal state into `src/hooks/useAppShell.ts`
2. Extract data fetching into `src/hooks/useDataLayer.ts`
3. Lift concept graph into `src/context/ConceptGraphContext.tsx` (subscribe consumers via `useConceptGraph()`) — eliminates the entries-change re-derivation
4. `Everion.tsx` reduces to ~400 lines of orchestration wiring

---

## M-10 — No staging environment
**Source:** Production Audit (WARN DEP-6)

CI targets only `main`. There is no `staging` branch or preview deployment workflow. Changes go directly from PR → production.

**Fix:** Configure a `staging` branch in Vercel that auto-deploys on push, with its own environment variables (separate Supabase project recommended). PRs merge to `staging` first, then promote to `main`.

---

## M-11 — No external uptime monitoring
**Source:** Production Audit (WARN OBS-2)

A comprehensive `/api/health` endpoint exists (checks DB + Gemini + Groq), but nothing external pings it. Production outages are only detected when a user reports them.

**Fix:** Add a free UptimeRobot or Checkly monitor pinging `https://your-domain.com/api/health` every 5 minutes. Alert to Telegram or email on failure.

---

## M-12 — No automated purge of soft-deleted entries
**Source:** Production Audit (WARN DATA-3)

Entries use soft-delete (`deleted_at` timestamp) with a 30-day trash window. There is no cron job that hard-deletes entries where `deleted_at < NOW() - 30 days`. Soft-deleted data accumulates indefinitely.

**Fix:** Add a weekly cron to `vercel.json`:
```json
{ "path": "/api/cron/purge-trash", "schedule": "0 3 * * 0" }
```
Implement `api/cron/purge-trash.ts` that deletes entries where `deleted_at < NOW() - INTERVAL '30 days'` using the service role key.

---

## M-13 — `loadUserAISettings` hydrates non-sensitive settings back to localStorage
**Source:** Pass 5 (MEDIUM)

`aiSettings.ts:157-165` writes model overrides and embed provider back to localStorage on login. While sensitive keys are now cleared correctly, non-sensitive settings still use localStorage as a write-through cache. Inconsistent pattern.

**Location:** `src/lib/aiSettings.ts:157-165`

**Fix:** Keep all settings in-memory after load; remove the localStorage write-back for model overrides and embed provider.

---

## M-14 — CaptureSheet.tsx — 1,061-line eagerly-imported component
**Source:** Pass 5 (MEDIUM)

`CaptureSheet.tsx` (1,061 lines) handles text capture, file upload, link parsing, voice recording, and pre-save preview. It is on the critical render path and not lazy-loaded.

**Fix:** Lazy-load CaptureSheet behind a `React.lazy` boundary. The sheet is opened on user action (FAB tap), never on initial render — it is a safe candidate for code-splitting.

---

## M-15 — No cookie consent / POPIA compliance audit
**Source:** Production Audit (WARN DATA-2)

Sentry and Vercel Speed Insights may set cookies. No cookie consent banner exists. This gap compounds with H-4 (no privacy policy).

**Fix:** Audit which third-party scripts set cookies. If any do, add a consent banner before initialising Sentry and Speed Insights. Gate `Sentry.init()` on consent.

---

## M-16 — No Terms of Service
**Source:** Production Audit (WARN DATA-7)

No Terms of Service document exists in the codebase or `public/` directory. Required for any app storing user data.

**Fix:** Draft a minimal ToS page; link from the login screen alongside the privacy policy (H-4).

---

## M-17 — Systemic focus ring removal: 42 interactive elements have no visible focus indicator
**Source:** Impeccable Audit (P1)

42 instances of `outline-none` across `CaptureSheet.tsx:586,600,681`, `BulkActionBar.tsx:261,328`, `OmniSearch.tsx:160`, `OnboardingModal.tsx:157`, `MemoryImportPanel.tsx:134` and 34 more. Keyboard users have no visible indicator of which element is focused. Some elements compensate with `focus:border-primary` but the border change does not meet the 3:1 non-text contrast minimum.

**WCAG/Standard:** WCAG 2.1 SC 2.4.7 (Focus Visible), SC 1.4.11 (Non-text Contrast)

**Fix:** Add a global rule and remove `outline-none` from interactive elements:
```css
/* index.css */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
:focus:not(:focus-visible) {
  outline: none;
}
```

---

## M-18 — OmniSearch: no combobox ARIA pattern
**Source:** Impeccable Audit (P1)

The search input opens a results dropdown but presents as a plain `<input>` to screen readers. Users with assistive technology cannot know the dropdown exists or navigate results without a mouse.

**WCAG/Standard:** WCAG 2.1 SC 4.1.2 (Name, Role, Value)

**Location:** `src/components/OmniSearch.tsx:85-280`

**Fix:**
```tsx
<input role="combobox" aria-expanded={results.length > 0} aria-haspopup="listbox"
  aria-controls="search-results" aria-autocomplete="list" ... />
<ul id="search-results" role="listbox">
  {results.map((r, i) => <li key={r.id} role="option" aria-selected={i === activeIndex}>{r.title}</li>)}
</ul>
```

---

## M-19 — Secondary action touch targets ~28px — below 44px minimum on mobile
**Source:** Impeccable Audit (P1)

`BulkActionBar.tsx:165,208,225`, `EntryList.tsx:167,193`, `KeyConcepts.tsx:54`, `CaptureSheet.tsx:690` all use `py-1` or `py-1.5` on `text-xs` buttons, resulting in ~26–28px height. These are heavily used in the primary mobile workflow.

**Fix:** Use `py-2.5` minimum on small action buttons. For icon-only actions use `h-11 w-11`. The `min-h-[44px]` pattern already exists in `CreateBrainModal.tsx:192`.

---

## M-20 — 14px input font in `App.tsx:192` triggers iOS auto-zoom
**Source:** Impeccable Audit (P2)

iOS Safari auto-zooms into any focused input with `font-size < 16px`, creating a permanently zoomed state.

**Location:** `src/App.tsx:192`

**Fix:** Change `fontSize: "14px"` to `fontSize: "16px"` (or `1rem`).

---

## M-21 — `ProvidersTab` `#4ade80` hardcoded hex always fires
**Source:** Impeccable Audit (P2)

`var(--color-success, #4ade80)` — the token `--color-success` is never defined in the token system, so the lime-green fallback always renders. This colour is unthemed (same in light and dark mode) and clashes with the warm amber/charcoal palette.

**Location:** `src/components/settings/ProvidersTab.tsx:51`

**Fix:** Define the token in `index.css @theme`:
```css
--color-success: oklch(62% 0.15 142);
```
Then remove the hardcoded fallback: `color: "var(--color-success)"`.

---

## M-22 — No ARIA live regions for async status updates
**Source:** Impeccable Audit (P2)

When the AI parses an entry (CaptureSheet), when feed content loads (FeedView), or when search results appear (OmniSearch), there is no announcement to screen reader users. `AskView` and the PIN component correctly use `aria-live="polite"` — the two most-used interactions do not.

**Fix:**
```tsx
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {status === 'success' ? `Entry "${previewTitle}" ready to save` : ''}
</div>
```

---

## M-23 — BulkActionBar custom dropdowns missing `aria-expanded` / `aria-haspopup`
**Source:** Impeccable Audit (P2)

Two `<button>` elements at `BulkActionBar.tsx:261,328` act as custom dropdowns but have no `aria-expanded`, `aria-haspopup`, or `aria-controls` attributes. A screen reader user activates them with no indication of what happens next.

**Fix:** Add `aria-expanded={isOpen}` and `aria-haspopup="true"` to each trigger, with `id` + `aria-controls` pairing to the panel it opens.

---

## M-24 — `EntriesContext` and `BrainContext` typed as `any` — silent runtime contract drift
**Source:** Architecture Deep Audit (MEDIUM), 2026-04-15

Both context files are 6-line empty wrappers using `createContext<any>(null)`. The actual value shapes are defined inline in Everion.tsx and passed down with no TypeScript contract. Consumers (`DetailModal`, `useBrain.ts`, etc.) must know the shape by convention — renamed or removed fields fail silently at runtime with no compile-time warning.

**Location:** `src/context/EntriesContext.tsx`, `src/context/BrainContext.tsx`, `src/Everion.tsx:~350–370`

**Fix:** Add explicit typed interfaces to both context files:
```typescript
// src/context/EntriesContext.tsx
export interface EntriesContextValue {
  entries: Entry[];
  entriesLoaded: boolean;
  selected: Entry | null;
  setSelected: (entry: Entry | null) => void;
  handleDelete: (id: string) => void;
  handleUpdate: (id: string, changes: Partial<Entry>) => Promise<void>;
}
export const EntriesContext = createContext<EntriesContextValue | null>(null);
```
Remove `setEntries` from context — consumers should use `handleUpdate`/`handleDelete` only. TypeScript will fail at compile time if the shape drifts.

---

## M-25 — `authFetch` calls `getSession()` on every request — ~100 calls/session
**Source:** Architecture Deep Audit (MEDIUM), 2026-04-15

`src/lib/authFetch.ts` calls `supabase.auth.getSession()` on every HTTP request. A single session generates ~100+ `authFetch` calls (entry loads, AI calls, embed calls, graph saves, link saves). Additionally, `authFetch` secretly records AI usage metrics via a hidden import of `usageTracker` — violating single responsibility and making the function untestable without mocking unrelated internals.

**Location:** `src/lib/authFetch.ts`

**Fix:**
1. Cache the session token with a 4-minute TTL: `let _sessionCache: { token: string; expiresAt: number } | null = null`
2. Invalidate on `supabase.auth.onAuthStateChange`
3. Extract usage tracking into an explicit `trackEmbeddingIfPresent(response)` that callers opt into; remove the import from `authFetch`

---

## M-26 — ConceptGraph: no schema version, lossy normalization, silent DB save failures
**Source:** Architecture Deep Audit (MEDIUM), 2026-04-15

Three related issues that degrade the concept graph over time:

1. **No schema version** — `ConceptGraph` has no `version` field. Stale localStorage data from a previous schema is read and used with no migration path.
2. **Lossy normalization** — `normalize()` strips possessives inconsistently: "Dr. Smith's Practice" → `"dr smiths practice"` but "Smith's Practice" → `"smiths practice"` — a different key. The graph grows duplicate concept nodes silently.
3. **Silent DB save failure** — if `saveGraphToDB` fails, the localStorage cache is ahead of the DB with no dirty flag. The inconsistency is permanently invisible.

**Location:** `src/lib/conceptGraph.ts`

**Fix:**
- Add `version: 2` to the `ConceptGraph` interface with a `migrateGraph()` function
- Fix normalize: `label.replace(/[''\u2019s]+\b/g, "")` before stripping punctuation
- Add a `concept_graph_dirty_{brainId}` localStorage flag; set before DB write, clear on success; retry flush on next `loadGraphFromDB`

---

## M-27 — `SKIP_META` keys duplicated in two files — will drift
**Source:** Architecture Deep Audit (MEDIUM), 2026-04-15

The set of metadata keys to exclude from enrichment checks is defined twice with slightly different contents:

```typescript
// src/lib/chatContext.ts:69
const SKIP_META = new Set(["enrichment", "confidence", "full_text", ...]);

// src/lib/enrichEntry.ts:5
const ENRICH_SKIP_META = new Set(["enrichment", "confidence", "full_text", ...]);
```

These will drift as new metadata fields are added. If `ai_insight` is excluded in one but not the other (already the case), chat scoring and enrichment checks make different decisions about the same entry.

**Location:** `src/lib/chatContext.ts:69`, `src/lib/enrichEntry.ts:5`

**Fix:** Create `src/lib/entryConstants.ts` with a single exported `SKIP_META_KEYS` set. Both files import from it. Remove local definitions.

---

## M-28 — Test coverage at 13% — critical paths entirely untested
**Source:** Architecture Deep Audit (MEDIUM), 2026-04-15

16 test files across 122 source files. All enrichment logic, graph mutation, auth session handling, and API endpoints are untested. The race condition in H-10 and the broken field names in H-11 were caught by manual audit — CI would not have caught either.

**Priority tests needed (in order of risk):**
1. `src/__tests__/graphWriter.test.ts` — concurrent write serialisation
2. `src/__tests__/conceptGraph.normalization.test.ts` — deduplication edge cases
3. `src/__tests__/refineDetectors.test.ts` — pure detection functions including `detectOrphans`
4. `src/__tests__/authFetch.session.test.ts` — cache reuse, invalidation on auth change
5. `src/__tests__/enrichEntry.test.ts` — per-phase failure isolation

---

## M-29 — Connections list rendered as plain unstyled bullet list — core value prop invisible
**Source:** Design Critique (P1), 2026-04-14

Every entry detail view shows the "Connections" section as a flat `<ul>` with no type differentiation, no grouping, no visual weight, and no sense of relationship direction. Anywhere from 8–15 connections appear in a single undifferentiated column. Connections are Everion's primary value proposition — the visual representation communicates nothing about why entries are linked.

At 200+ entries (the Marcus persona), this list becomes unnavigable with no grouping, no search within connections, and no filtering by type.

**Fix:**
- Group connections by type (other recipes, people, documents, notes)
- Add a small type label or color indicator per connection
- Show top 3 by default with "see all N" expand
- Minimum: add type icon/badge per connection item

---

## M-30 — Icon-only bottom navigation — no text labels
**Source:** Design Critique (P1), 2026-04-14

The bottom navigation bar shows icon-only tabs with no text labels. First-time users must recall what each icon means on every visit. The brand promise is "calm, intelligent, trusted" — unlabeled icons create small recurring friction that erodes trust and fails new user orientation.

**Fix:** Add text labels under all bottom nav icons. Labels can be small (`text-[10px]`, muted) — they just need to exist.

---

## M-31 — AI response language leaks internal implementation and mishandles not-found state
**Source:** Design Critique (P2), 2026-04-14

The chat assistant uses the phrase "retrieved memories" (a RAG implementation detail) in responses visible to users. When a requested fact is not in the brain, the response routes the user to an external source (e.g., a government phone number) instead of turning the failure into a capture moment. Both behaviors break the "trusted, intelligent" brand voice.

**Location:** `src/config/prompts.ts` — CHAT prompt system instructions

**Fix (two parts):**
1. Audit the CHAT system prompt for implementation-leaking language ("retrieved", "indexed", "memory store") and replace with user-facing language ("remembered", "saved", "stored")
2. Add a not-found response pattern to the CHAT prompt: "You haven't saved your [X] yet. Want to add it?" — turns failure into a capture prompt
