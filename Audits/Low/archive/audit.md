# Low Severity Findings — EverionMind
**Combined from:** Production Audit (2026-04-14), Smash OS Audit Pass 5 (2026-04-12), Pass 6 (2026-04-14), Impeccable Audit (2026-04-14), Architecture Deep Audit (2026-04-15), Design Critique (2026-04-14)
**Status:** All items below are open as of 2026-04-15 unless noted.

---

## L-1 — Sentry DSN missing from `.env.example`
**Source:** Pass 6 (LOW)

`VITE_SENTRY_DSN` is not documented in `.env.example`. A developer setting up a new environment has no indication that error monitoring needs configuring. When M-1 is fixed (move DSN to env var), add this to `.env.example`.

**Fix:**
```bash
# .env.example
VITE_SENTRY_DSN=https://xxx@o4511133135470592.ingest.us.sentry.io/yyy
```

---

## L-2 — No `<meta name="description">` in `index.html`
**Source:** Production Audit (WARN SEO-1)

`index.html` has no description meta tag. Search engines and social share cards show nothing for this URL.

**Fix:**
```html
<meta name="description" content="Everion — your personal memory and knowledge OS. Capture, organise, and surface what matters." />
```

---

## L-3 — No `robots.txt` — crawlers index the auth redirect wall
**Source:** Production Audit (WARN SEO-2/3)

`public/` contains no `robots.txt` or `sitemap.xml`. Search crawlers attempt to index all routes, which redirect to the login screen. This wastes crawl budget and may surface the login page as indexed content.

**Fix:** Add `public/robots.txt`:
```
User-agent: *
Disallow: /
```
If there are any public-facing pages (landing page, privacy policy), allow those explicitly.

---

## L-4 — No Open Graph tags
**Source:** Production Audit (WARN SEO-5)

Sharing the app URL on social platforms (WhatsApp, Telegram, LinkedIn) shows a blank preview with no title, description, or image. For an app with invite/sharing features, this reduces trust.

**Fix:** Add to `index.html`:
```html
<meta property="og:title" content="Everion" />
<meta property="og:description" content="Your personal memory and knowledge OS" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://everionmind.com" />
```

---

## L-5 — No Vercel function body size config on LLM and file-extract endpoints
**Source:** Production Audit (WARN API-3)

`api/llm.ts` and `api/capture.ts` (extract-file path) accept large request bodies without an explicit `sizeLimit`. Vercel's default is 1MB for API routes. Very large uploads will fail with a cryptic 413 before reaching the handler.

**Fix:** Add to `api/llm.ts` and `api/capture.ts`:
```ts
export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};
```

---

## L-6 — Supabase auth token in `localStorage` — documented XSS risk
**Source:** Production Audit (WARN FH-3)

Supabase JS v2 stores the auth session in `localStorage` by default. This is accepted Supabase pattern and the tight CSP (`script-src 'self'`) significantly reduces XSS risk. However, it is not documented as an accepted trade-off.

**Action:** No code change required. Add a comment in `src/lib/supabase.ts` acknowledging this as an accepted risk under the current CSP posture.

---

## L-7 — No SRI on Google Fonts loaded in `index.html`
**Source:** Production Audit (WARN FH-4)

`index.html:13-15` loads from `fonts.googleapis.com` without `integrity` attributes. If Google's CDN were compromised, a malicious stylesheet could be injected.

**Fix:** Self-host fonts instead of loading from Google CDN. `@fontsource-variable/geist` is already installed — confirm it is being used everywhere and the `<link>` tags in `index.html` can be removed.

---

## L-8 — No Dependabot / Renovate configured
**Source:** Pass 5 (LOW)

No automated dependency update tooling is configured in `.github/`. CVEs in dependencies (like `xlsx`) are only discovered manually.

**Fix:** Add `.github/dependabot.yml`:
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    ignore:
      - dependency-name: "xlsx"
        reason: "No fix available — tracked in Audits/High/audit.md H-2"
```

---

## L-9 — CI pipeline does not include a build step
**Source:** Pass 5 (LOW)

`.github/workflows/ci.yml` runs typecheck, lint, format:check, and test — but not `npm run build`. A build failure is only caught at Vercel deploy time, not at PR review.

**Fix:** Add to CI:
```yaml
- run: npm run build
```

---

## L-10 — `pdfjs-dist` (~4MB) not confirmed lazy-loaded
**Source:** Production Audit (WARN PERF-2)

`pdfjs-dist` is imported in `src/lib/fileExtract.ts`. If this module is in the main bundle rather than a dynamic import, it adds ~4MB to the initial load.

**Fix:** Confirm `fileExtract.ts` is only ever called via a dynamic import path. If not:
```ts
const pdfjs = await import("pdfjs-dist");
```

---

## L-11 — N+1 query in `api/cron/gap-analyst.ts`
**Source:** Production Audit (WARN PERF-9)

The weekly gap-analyst cron fetches all brains first, then issues one DB query per brain to fetch its entries. Will degrade linearly as brain count grows.

**Fix:** Fetch all entries for all relevant brains in a single query with `WHERE brain_id IN (...)`, then group in memory.

---

## L-12 — `VITE_ENABLE_MULTI_BRAIN` feature flag has no owner or removal date
**Source:** Production Audit (WARN CODE-10)

`src/lib/featureFlags.ts` exposes `VITE_ENABLE_MULTI_BRAIN` with no documentation of owner, gated behaviour, or removal target.

**Fix:** Add a comment in `featureFlags.ts`:
```ts
// VITE_ENABLE_MULTI_BRAIN: gates multi-brain UI (BrainSwitcher, brain-scoped captures).
// Owner: Christian. Removal target: when multi-brain is default-on (sprint X).
```

---

## L-13 — No keyboard shortcuts for power users
**Source:** Pass 5 (LOW)

The app has no keyboard shortcuts. Power users managing hundreds of entries cannot navigate without a mouse/trackpad.

**Suggested shortcuts:**
- `Cmd/Ctrl + K` — open OmniSearch
- `Cmd/Ctrl + N` — open CaptureSheet
- `Escape` — close any open modal

---

## L-14 — Empty catch in `useVaultOps.ts` swallows vault fetch errors
**Source:** Pass 5 (LOW)

`src/hooks/useVaultOps.ts:70` has an empty `catch {}` on the vault entry fetch. If the vault fails to load, the user sees nothing — no error, no retry prompt.

**Fix:**
```ts
} catch (e) {
  console.error("[vault] fetch failed:", e);
  setVaultError("Failed to load vault entries. Please try again.");
}
```

---

## L-15 — No business continuity documentation
**Source:** Production Audit (WARN BC-1–6)

No incident response plan, on-call contact, status page, disaster recovery runbook, or documented rollback procedure.

**Minimum viable fix:** Create `docs/runbook.md` with:
- How to trigger a Vercel rollback (one-click in dashboard)
- Supabase backup restore steps
- On-call contact (Christian)
- How to check logs: `vercel logs --follow`

---

## L-16 — `text-[10px]` used in 15+ locations — borderline legible
**Source:** Impeccable Audit (P3)

`BottomNav.tsx:60`, `BrainSwitcher.tsx:105,120`, `BulkActionBar.tsx:238,318`, `CaptureSheet.tsx:439,884`, `CreateBrainModal.tsx:155,183,210,263`, `DesktopSidebar.tsx:115`, and more. 10px is below the 12px minimum most accessibility guidelines recommend. On mobile where no browser zoom is available, this affects users with any visual impairment.

**Fix:** Bump non-decorative labels to `text-[11px]` or `text-xs` (12px). Purely decorative text at 10px is defensible.

---

## L-17 — `LoadingScreen` defines keyframe in inline `<style>` tag
**Source:** Impeccable Audit (P3)

`src/components/LoadingScreen.tsx:36-40` injects a `@keyframes loading-sweep` via a `<style>` tag on every mount. The other keyframes (`shimmer`, `fade-in`, `slide-up`) already live in `index.css`.

**Fix:** Move `@keyframes loading-sweep` to `index.css` alongside the other keyframes and reference it via a CSS class.

---

## L-18 — `EntryList` `aria-label` uses raw title without role context
**Source:** Impeccable Audit (P3)

`src/components/EntryList.tsx:56,247` sets `aria-label={e.title}` on card-level interactive elements. Screen reader users hear the title with no indication it's a selectable entry.

**WCAG/Standard:** WCAG 2.4.6 (Headings and Labels)

**Fix:** Change to `aria-label={\`Open entry: ${e.title}\`}` or use `aria-describedby` referencing the type badge.

---

## L-19 — "Insight:" prefix double-labels entry type in titles
**Source:** Design Critique (P2), 2026-04-14

Entry titles display as "Insight: Jalapeño Popper Burger" — prepending the content type directly to the user's title. The type badge in the header already communicates this. The double-labeling makes the actual title harder to read at a glance and conflates metadata with the user's words.

**Fix:** Remove the type prefix from displayed titles everywhere. The type badge handles this job. The stored title likely needs a display-only strip rather than a data change.

---

## L-20 — Action placement inconsistency: primary actions top, share action bottom
**Source:** Design Critique (minor observation), 2026-04-14

In `entry.png`, Delete and Edit are in the top header (thumb-unreachable on mobile), while the Share button floats at the bottom. Users must learn two separate zones for entry actions. The pattern is internally inconsistent.

**Fix:** Consolidate all entry actions into one location — either a bottom action sheet (mobile-friendly) or a top kebab menu. Bottom action sheet is preferred for the primary persona (Casey, mobile user).

---

## L-21 — Chat scoring de-pluralization produces wrong stems
**Source:** Architecture Deep Audit (LOW), 2026-04-15

`src/lib/chatContext.ts:29` strips trailing `s` from query words with `w.replace(/s$/, "")`. This produces `"entrie"` from `"entries"`, `"recipe"` from `"recipes"`, etc. — the stems don't match stored titles. Chat search relevance is degraded for plural queries.

**Location:** `src/lib/chatContext.ts:29`

**Fix:** Disable the de-pluralization (`depluralize: false` in the planned `ScoringProfile` from M-27), or replace with a proper stem check — at minimum, check both the original word and the `slice(0, -1)` form.

---

## L-22 — "This brain / All brains" tab labels assume pre-built mental model
**Source:** Design Critique (minor observation), 2026-04-14

First-time users don't know what a "brain" means in this context. The tab label works for existing users but is opaque for Jordan (first-timer persona) who expects Notes.app conventions.

**Fix:** Consider "Here / Everywhere" or "My [BrainName] / All Brains" as alternatives that convey scope without requiring the user to understand the domain metaphor first.
