# Sprint — Low Severity Fixes
**Created:** 2026-04-15
**Source:** Audits/Low/audit.md (22 findings)
**Goal:** Close polish gaps, SEO blind spots, developer experience issues, and minor accessibility items that are cheap to fix and improve the app's overall professionalism.

> **Note:** L-1 (Sentry .env.example) is resolved automatically when M-1 is completed. L-19 ("Insight:" title prefix) should be verified before fixing — confirm whether the prefix is stored in the title field or injected at render time.

---

## How to use this sprint

These are all low-friction tasks. Most are XS or S effort and can be batched into a single focused session. Group by file cluster when possible to avoid context-switching overhead.

**Effort key:** `XS` <30 min · `S` 1–2h · `M` half-day

---

## Cluster A — `index.html` (do all at once)

### [x] L-2 — Add `<meta name="description">`
**Effort:** XS | **File:** `index.html`

- [x] Add: `<meta name="description" content="Everion — your personal memory and knowledge OS. Capture, organise, and surface what matters." />`

---

### [x] L-4 — Add Open Graph tags
**Effort:** XS | **File:** `index.html`

- [x] Add `og:title`, `og:description`, `og:type`, `og:url` meta tags
- [x] Add `og:image` if a logo/cover image is available

---

### [x] L-7 — Remove Google Fonts CDN link (use self-hosted)
**Effort:** XS | **File:** `index.html:13-15`

- [x] Confirm `@fontsource-variable/geist` (already installed) is imported in `src/main.tsx` or `index.css`
- [x] Remove the `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` tags
- [x] Verify font renders correctly after removal

---

## Cluster B — `public/` (do all at once)

### [x] L-3 — Add `robots.txt`
**Effort:** XS | **File:** `public/robots.txt` (new)

- [x] Create `public/robots.txt`:
```
User-agent: *
Disallow: /
```
- [x] If a public landing page or privacy policy exists, add an `Allow:` rule for it

---

## Cluster C — CI / Developer Experience

### [x] L-1 — Add `VITE_SENTRY_DSN` to `.env.example`
**Effort:** XS | **File:** `.env.example`
**Note:** Completed automatically when M-1 is done. Check here if M-1 is already merged.

- [x] Confirm `.env.example` has `VITE_SENTRY_DSN=https://xxx@...`

---

### [x] L-8 — Add Dependabot config
**Effort:** XS | **File:** `.github/dependabot.yml` (new)

- [x] Create `.github/dependabot.yml` with weekly npm updates
- [x] Add ignore rule for `xlsx` with reason comment pointing to H-2
- [x] Confirm Dependabot is enabled in the GitHub repo settings

---

### [x] L-9 — Add build step to CI
**Effort:** XS | **File:** `.github/workflows/ci.yml`

- [x] Add `- run: npm run build` to the CI workflow
- [x] Confirm the step runs after lint/typecheck so build errors are caught at PR time

---

### [x] L-12 — Document `VITE_ENABLE_MULTI_BRAIN` feature flag
**Effort:** XS | **File:** `src/lib/featureFlags.ts`

- [x] Add comment above the flag: what it gates, who owns it, and when it's expected to be removed

---

## Cluster D — Performance

### [x] L-5 — Add body size config to LLM and file-extract endpoints
**Effort:** XS | **Files:** `api/llm.ts`, `api/capture.ts`

- [x] Add `export const config = { api: { bodyParser: { sizeLimit: "10mb" } } }` to both files
- [x] Test a large file upload to confirm it no longer 413s

---

### [x] L-10 — Confirm `pdfjs-dist` is lazy-loaded
**Effort:** XS | **File:** `src/lib/fileExtract.ts`

- [x] Check if `fileExtract.ts` is only called via dynamic import paths in the app
- [x] If not: wrap the `pdfjs-dist` import in `const pdfjs = await import("pdfjs-dist")`
- [x] Run `npm run build` and check the chunk output — pdfjs should be in a separate chunk

---

### [x] L-11 — Fix N+1 query in gap-analyst cron
**Effort:** S | **File:** `api/cron/gap-analyst.ts`

- [x] Replace the per-brain entry fetch loop with a single `WHERE brain_id IN (...)` query
- [x] Group results in memory by brain_id
- [x] Verify the cron output is identical before and after

---

## Cluster E — Code Hygiene

### [x] L-6 — Document Supabase localStorage auth token as accepted risk
**Effort:** XS | **File:** `src/lib/supabase.ts`

- [x] Add a comment: "Session stored in localStorage per Supabase JS v2 default. Accepted risk under current CSP (script-src 'self'). Revisit if CSP is relaxed."

---

### [x] L-13 — Add keyboard shortcuts
**Effort:** S | **File:** `src/Everion.tsx` or a new `src/hooks/useKeyboardShortcuts.ts`

- [x] `Cmd/Ctrl + K` — open OmniSearch
- [x] `Cmd/Ctrl + N` — open CaptureSheet
- [x] `Escape` — close any open modal
- [x] Add a `useEffect` with `keydown` listener; clean up on unmount

---

### [x] L-14 — Fix empty catch in `useVaultOps.ts`
**Effort:** XS | **File:** `src/hooks/useVaultOps.ts:70`

- [x] Replace `catch {}` with `catch (e) { console.error("[vault] fetch failed:", e); setVaultError("Failed to load vault entries. Please try again."); }`

---

### [x] L-15 — Create minimal business continuity runbook
**Effort:** S | **File:** `docs/runbook.md` (new)

- [x] Document: how to trigger a Vercel rollback (one-click in dashboard)
- [x] Document: Supabase backup restore steps
- [x] Document: on-call contact (Christian, stander.christian@gmail.com)
- [x] Document: how to check logs (`vercel logs --follow`)

---

## Cluster F — UI Polish

### [x] L-16 — Bump `text-[10px]` labels to 11px minimum
**Effort:** S | **Files:** `BottomNav.tsx`, `BrainSwitcher.tsx`, `BulkActionBar.tsx`, `CaptureSheet.tsx`, `CreateBrainModal.tsx`, `DesktopSidebar.tsx`

- [x] Change non-decorative `text-[10px]` to `text-[11px]` or `text-xs` (12px)
- [x] Keep purely decorative text at 10px if appropriate
- [x] Visual check: nothing reflows badly

---

### [x] L-17 — Move `LoadingScreen` keyframe to `index.css`
**Effort:** XS | **Files:** `src/components/LoadingScreen.tsx:36-40`, `index.css`

- [x] Cut `@keyframes loading-sweep` from the inline `<style>` tag in `LoadingScreen.tsx`
- [x] Paste into `index.css` alongside `shimmer`, `fade-in`, `slide-up`
- [x] Reference via CSS class in `LoadingScreen.tsx`

---

### [x] L-18 — Add role context to `EntryList` aria-labels
**Effort:** XS | **File:** `src/components/EntryList.tsx:56,247`

- [x] Change `aria-label={e.title}` to `aria-label={\`Open entry: ${e.title}\`}`

---

### [x] L-19 — Remove "Insight:" type prefix from displayed titles
**Effort:** S | **Files:** entry title render locations

- [x] Determine if the prefix is stored in the `title` field or injected at render time
- [x] If render-time: remove the prefix from the display template
- [x] If stored: add a display-only strip (do NOT modify stored data — the title field is the source of truth)
- [x] Verify type badge in the header still communicates the type independently

---

### [x] L-20 — Consolidate entry action placement
**Effort:** S | **Files:** entry detail action area

- [x] Audit current action locations: Delete and Edit are top-header, Share is bottom-floating
- [x] Move all actions to a single location (bottom action sheet preferred for mobile)
- [x] Test thumb reach on a real device

---

## Cluster G — Chat & Language

### [x] L-21 — Fix chat scoring de-pluralization
**Effort:** XS | **File:** `src/lib/chatContext.ts:29`

The current `w.replace(/s$/, "")` produces `"entrie"` from `"entries"` — stems don't match.

- [x] Disable the de-pluralization entirely (simplest fix; relevance is better without bad stems)
- [x] OR: check both the original word and `word.slice(0, -1)` against titles
- [x] Test: searching "recipes" should surface entries with "recipe" in the title

---

### [x] L-22 — Improve "This brain / All brains" tab copy
**Effort:** XS | **File:** tab label component in chat/Ask view

- [x] Consider alternatives: "Here / Everywhere" or "My [BrainName] / All Brains"
- [x] Pick the version that makes sense to someone who has never used the app
- [x] Update the label string; verify no layout impact

---

## Sprint Summary

| Cluster | Tasks | Est. Total Effort |
|---------|-------|------------------|
| A — index.html | L-2, L-4, L-7 | ~30 min |
| B — public/ | L-3 | ~10 min |
| C — CI / DX | L-1, L-8, L-9, L-12 | ~45 min |
| D — Performance | L-5, L-10, L-11 | ~1.5h |
| E — Code Hygiene | L-6, L-13, L-14, L-15 | ~2h |
| F — UI Polish | L-16, L-17, L-18, L-19, L-20 | ~2h |
| G — Chat & Language | L-21, L-22 | ~30 min |

**Total estimated effort: ~1 focused day**

**Recommended batching:** Do Cluster A + B + C in one sitting (all tiny, all index/config files). Then Cluster D + E together. Then F + G together.
