# Performance Audit — 2026-05-07

> Cold-load and runtime perf for the SPA. Bundle composition, code-splitting, SW precache, font loading, render-blocking. Out of scope: server-side latency (covered by retrieval-audit, capture-pipeline-audit). Per-view perf checked only at the bundle level.

## Verdict

**Bundle is in good shape.** Initial JS+CSS payload over the wire on a cold first paint = **~189 KB gzipped** (entry chunk 62.7 KB gz + 17 modulepreloaded chunks 99.4 KB gz + CSS 25.9 KB gz). Below the 200 KB SPA target on 3G. No 1+ MB monolith on the critical path. Lazy boundaries are dense and intentional — every heavy view (DetailModal 1545 LOC, ProfileTab 2126 LOC, AdminTab 1819 LOC, GmailSyncTab 939 LOC) sits behind a `lazy()` import. Heaviest single chunk (`exceljs.min` 250 KB gz) is dynamic-imported AND excluded from SW precache.

**Three real findings.** F1 — `mammoth` (101 KB gz / 422 KB raw) sits in a `lib-*` chunk that's NOT in the SW precache ignore-list, so workbox would precache it on first visit even though it's only used by `.docx` import. F2 — Google Fonts CSS is fetched cross-origin from `fonts.googleapis.com` instead of self-hosted, costing one cross-origin round-trip on cold load (preconnect mitigates, doesn't eliminate). F3 — `index-DaIcQwiF.css` is 150 KB raw / 25.9 KB gz, contains 9 design-family stylesheets concatenated; only one family is active per render. Plus four LOW: PWA precache strategy, posthog deferred but adds 60 KB on consent, no `<link rel="preload" as="font">` for visible-above-the-fold typography, anonymous landing path waits on entry chunk to lazy-resolve `Landing`.

**No blockers for ProductHunt-day traffic.** Critical-path budget hits target. SW serves cached chunks instantly on repeat visits. Vercel `Cache-Control: public, max-age=31536000, immutable` on `/assets/*` (vercel.json:107-108) means CDN edge serves all hashed bundles.

---

## Architecture overview

```
build (vite + rolldown)
  ├─ entry: index-*.js (62.7 KB gz)
  ├─ modulepreload set (17 chunks, 99.4 KB gz total)
  │    ├─ rolldown-runtime, preload-helper
  │    ├─ radix (40.9 KB gz)        ← consolidated by manualChunks
  │    ├─ supabase (24.1 KB gz)     ← consolidated by manualChunks
  │    ├─ lucide (4 KB gz)          ← consolidated
  │    ├─ button, dist-DEij6uhg, LoadingScreen, capacitorBridge,
  │    │   posthog-shim (consent banner only, 1.2 KB gz),
  │    │   featureFlags, DesignThemeContext, etc.
  ├─ CSS: index-*.css (25.9 KB gz, 150 KB raw)
  └─ lazy chunks (114 + dynamic imports):
       ├─ exceljs.min (250 KB gz)   ← excluded from SW precache
       ├─ sentry (142 KB gz)        ← consent-gated, idle-deferred
       ├─ pdf (117 KB gz)           ← excluded from SW precache
       ├─ lib- (101 KB gz, mammoth) ← NOT excluded (F1)
       ├─ Everion (63.3 KB gz)      ← signed-in shell entry
       ├─ posthog full (59.8 KB gz) ← consent-gated, idle-deferred
       ├─ TodoView (55.9 KB gz), DetailModal (46.9 KB gz)
       ├─ jszip (27.8 KB gz)        ← imported eagerly by 3 import-panel files (F4)
       ├─ AdminTab (12.6 KB gz), CaptureSheet (13.5 KB gz)
       └─ ~100 smaller route + tab chunks
                    │
                    ▼
service worker (workbox, injectManifest)
  ├─ precacheAndRoute(self.__WB_MANIFEST)
  ├─ globPatterns: js/css/ico/png/svg/webp
  ├─ globIgnores: exceljs, pdf, jszip, AdminTab, GraphView,
  │   sentry, LoginScreen, StatusPage, ResetPasswordView,
  │   8 ImportPanels, VaultRevealModal, ChatView
  ├─ maximumFileSizeToCacheInBytes: 1.5 MB
  ├─ runtime route: js + /assets/* → CacheFirst (immutable hashed)
  └─ runtime route: navigation → StaleWhileRevalidate (HTML)
                    │
                    ▼
network (Vercel CDN edge)
  ├─ /assets/*: Cache-Control: public, max-age=31536000, immutable
  ├─ /api/*:    Cache-Control: no-store
  └─ /(rest):   default (HTML revalidates)
                    │
                    ▼
render path
  ├─ HTML parse → inline boot shell paints (~500ms target)
  ├─ <link rel=preload as=style> for Google Fonts (cross-origin, F2)
  ├─ entry script (module, parallel to CSS)
  ├─ main.tsx mounts → ConsentBanner + Landing OR App
  ├─ requestIdleCallback → Sentry + PostHog full bundle (only if accepted)
  └─ useEffect on Everion mount → prefetchCaptureSheet on idle
```

---

## Bundle inventory

Raw + gzipped from `dist/assets/` after `npm run build`. Sorted by gzip size.

| Chunk | Raw KB | Gzip KB | Critical? | Notes |
|---|---:|---:|---|---|
| `exceljs.min-*.js` | 908.1 | 250.4 | no — excluded from SW | xlsx export/import. Dynamic-imported by `fileExtract.ts`. |
| `sentry-*.js` | 433.8 | 142.6 | no — consent + idle | Consent-gated. Excluded from SW precache. |
| `pdf-*.js` | 395.6 | 117.9 | no — excluded from SW | pdfjs main thread. Worker is separate chunk. |
| `lib-*.js` (mammoth) | 413.0 | 101.1 | no — but **F1** | `.docx` parser. Dynamic-imported by `fileExtract.ts:149`. NOT in SW ignore-list. |
| `Everion-*.js` | 230.3 | 63.3 | signed-in only | Signed-in shell. Lazy-loaded after auth check. |
| `index-*.js` (entry) | 196.4 | **62.7** | YES | Static-import root: ThemeContext, ErrorBoundary, ConsentBanner, supabase init, capacitorBridge bootstrap, ld+json schema-mark consumers. |
| `posthog-*.js` (full) | 179.4 | 59.8 | no — consent + idle | Loads only after consent accepted via `requestIdleCallback`. |
| `TodoView-*.js` | 202.0 | 55.9 | no — lazy route | Schedule view. 705 LOC source + chrono-node bundled. |
| `DetailModal-*.js` | 172.3 | 46.9 | no — lazy route | 1545 LOC. Opens on entry click. Lazy + retry-on-stale. |
| `radix-*.js` | 136.4 | **40.9** | YES — modulepreloaded | All Radix primitives merged via `manualChunks`. Used by Tooltip, Toaster eagerly + many lazy paths. |
| `jszip.min-*.js` | 93.6 | 27.8 | no — but **F4** | Lazy via 3 import panels but each panel is a separate lazy chunk. |
| `index-*.css` | 150.3 | **25.9** | YES — render-blocking | 9 design-family stylesheets concatenated (**F3**). |
| `supabase-*.js` | 96.9 | **24.1** | YES — modulepreloaded | auth-js + postgrest-js + realtime-js. Used by App.tsx eagerly. |
| `VaultView-*.js` | 58.0 | 14.1 | no — lazy route | |
| `CaptureSheet-*.js` | 45.7 | 13.5 | no — idle prefetched | `prefetchCaptureSheet()` fires on Everion mount. |
| `AdminTab-*.js` | 46.9 | 12.6 | no — excluded from SW | 1819 LOC. |
| `prompts-*.js` | 37.3 | 11.7 | no | Chat prompt scaffolding. |
| `Landing-*.js` | 34.9 | 10.2 | anonymous-only | Marketing landing. Lazy. **F7**. |
| `button-*.js` | 28.5 | 9.3 | YES — modulepreloaded | Shared button + sonner. |
| `ProfileTab-*.js` | 34.7 | 9.5 | no — lazy tab | 2126 LOC. Settings tab. |
| `dist-DEij6uhg.js` | 31.9 | 8.9 | YES — modulepreloaded | Capacitor plugins (network, preferences, app). |
| `ChatView-*.js` | 26.7 | 7.7 | no — excluded from SW | |
| `LoginScreen-*.js` | 21.4 | 5.8 | no — excluded from SW | Lazy after Landing CTA. |
| `App-*.js` | 11.4 | 4.4 | no — lazy | Mounts after main.tsx Root chooses signed-in path. |
| `lucide-*.js` | 9.9 | 4.0 | YES — modulepreloaded | Consolidated icon chunk. |
| `BillingTab-*.js` | 9.9 | 3.3 | no — lazy tab | |
| `posthog-CdySg4vB.js` | 2.6 | 1.2 | YES — modulepreloaded | Consent banner shim only — does NOT pull posthog-js until accepted. |
| `react-*.js` × 2 | 2.4 + 2.7 | 1.1 + 1.2 | small split | React + ReactDOM split into two micro-chunks. |
| Capacitor plugins (`dist-*`, `web-*`, `esm-*`) | varied | < 5 KB ea | YES (stub) | Stub-only on web; real impls only on native. |

**Initial cold-load wire-cost (uncached visitor):**

```
entry (index-*.js)        62.7 KB gz
17 modulepreloaded chunks 99.4 KB gz
index-*.css               25.9 KB gz
─────────────────────────────────────
Total                    188.0 KB gz
```

Plus the static index.html (5–8 KB gz after compression).

**Repeat visitor (SW + CDN cache hot):** 0 bytes for hashed assets. HTML revalidates.

**Anonymous landing-only first paint:** entry + modulepreloads (188 KB gz) + Landing chunk lazy-fetched (10.2 KB gz) = 198 KB. App + Everion + supabase auth-js are NOT loaded until the user clicks Sign in. Saves ~63 KB gz over the previous "auto-mount App" architecture.

---

## What's solid

- **Lazy boundaries are dense.** 5 lazy() in `App.tsx` (Everion, LoginScreen, AdminView, ResetPasswordView, StatusPage), 8 in `Everion.tsx` (DetailModal, TodoView, VaultView, ImportantMemoriesView, ChatView, ListsView, ContactsView, VaultRevealModal, GraphView, GmailStagingInbox, CaptureSheet), 13 in `SettingsView.tsx` (every settings tab), 6 in `DataTab.tsx` (every import panel). Heavy 1500–2100 LOC views never enter the critical bundle. (`src/App.tsx:21-25`, `src/Everion.tsx:38-58,108-115`, `src/views/SettingsView.tsx:10-23`, `src/components/settings/DataTab.tsx:10-15`)

- **manualChunks consolidates correctly.** `vite.config.js:52-69` groups `@radix-ui/*` → `radix` (40.9 KB gz, one stream instead of 15 micro-chunks), `lucide-react/*` → `lucide` (4 KB gz vs ~8 separate icon-bundle requests), `posthog-js/*` → `posthog`, `@supabase/*` → `supabase`. HTTP/2 stream overhead saved on first paint.

- **3rd-party SDKs deferred + consent-gated.** Sentry + posthog full bundle (`~200 KB gz combined`) initialise only after consent acceptance AND `requestIdleCallback` (or 2s setTimeout fallback for Safari < 17), per `src/main.tsx:60-87`. Anonymous + declined-cookie users never download them. `posthog-CdySg4vB.js` (1.2 KB gz, modulepreloaded) is just the consent-banner shim — the real `posthog-DD7OAAB2.js` (59.8 KB gz) loads on consent.

- **Boot shell paints before JS.** Inline `<style>` + DOM in `index.html:223-419` renders the orbital orb + brand within the HTML parse — no external requests, ~500ms target on cold cell. Replaces React `#root` once main.tsx mounts.

- **No render-blocking 3rd-party scripts.** `vercel.json:81` CSP `script-src 'self' https://*.posthog.com https://va.vercel-scripts.com` allowlist — but no PostHog/Sentry/Analytics `<script>` in `<head>`. All loaded post-mount via dynamic import. Boot watchdog (`/boot-watchdog.js`) is the only sync `<script>` and it's deferred-loaded after the entry module-script tag in body.

- **Font loading non-blocking.** `<link rel="preload" as="style">` (index.html:199-203) kicks the byte download in parallel with CSS, then `loadFontsAsync()` in `main.tsx:45-57` injects the actual `<link rel="stylesheet">` from JS. Fonts use `display=swap` (URL param). JetBrains Mono dropped to save ~70 KB (`main.tsx:46-50`).

- **Vite immutable cache.** `vercel.json:107-108` ships `Cache-Control: public, max-age=31536000, immutable` on `/assets/*` — every hashed bundle is permanently cacheable at the CDN edge AND in the SW. `Cache-Control: no-store` on `/api/*` (line 102) prevents stale API responses.

- **Service worker discriminates correctly.** `src/sw.js:21-27` — JS chunks under `/assets/` get `CacheFirst` (hashed = immutable), HTML navigations get `StaleWhileRevalidate`. No aggressive `/api/*` runtime caching that would break realtime / break webhook idempotency.

- **SW precache excludes the right things.** `vite.config.js:140-160` ignores 14 heavy / rare-route chunks: pdf, exceljs, jszip, sentry, GraphView, AdminTab, every Import panel, LoginScreen (declined-consent users still pay), StatusPage, ResetPasswordView, VaultRevealModal, ChatView. Saves ~3+ MB of background download on first visit.

- **`maximumFileSizeToCacheInBytes: 1.5 MB`** dropped from default 2 MB. Sane — pdf.worker would warn at 2 MB and the ignored set leaves no single legit precache file over 1 MB.

- **`registerType: "prompt"`.** New SW only takes over when user taps the update toast — no auto-reload mid-session.

- **CDN preconnect.** `index.html:188-190` preconnects fonts.googleapis, fonts.gstatic, supabase. Saves DNS + TLS handshake on the critical path.

- **WOFF2 + `font-display: swap`.** Built CSS contains 3 `@font-face` blocks, all `font-display: swap`, all `.woff2` (no legacy `.woff`). `@fontsource-variable/geist` ships variable Geist self-hosted (in addition to Google Fonts Fraunces + Inter Tight via JS-injected stylesheet).

- **Anonymous landing fast-path.** `src/main.tsx:192-208` — anonymous visitor on `/` with no `sb-*-auth-token` in localStorage and no auth fragment in URL renders Landing alone, skipping App/Everion/supabase entirely. Cuts the cold-load chunk graph by ~63 KB gz (Everion) for marketing-page traffic. ProductHunt-day visitors will hit this path.

- **Stale-bundle recovery.** `src/main.tsx:144-178` catches `Failed to fetch dynamically imported module`, unregisters SW, clears caches, hard-reloads. Dense lazy graph → high probability of stale-chunk fetches mid-session after a deploy. Once-per-session guard prevents reload loops.

- **Capacitor splits are tiny.** 6+ `dist-*` / `web-*` / `esm-*` files at < 10 KB each. Web-only stubs ship; native plugins resolve at compile time.

---

## Findings

### F1 — `mammoth` (101 KB gz) is precached by the SW even though it's a dynamic-import-only `.docx` parser

**Severity: MEDIUM**

`src/lib/fileExtract.ts:149`:
```ts
const mod = await import("mammoth");
```

Output: `dist/assets/lib-BQtG_ufA.js` (413 KB raw / **101.1 KB gz**) — confirmed by inspecting the chunk's first 500 chars (`docx`, `Mammoth`, `xmldom`, `DOMParser` markers).

`vite.config.js:140-160` `globIgnores` lists `exceljs`, `pdf`, `jszip`, `AdminTab`, `GraphView`, `sentry`, all import panels, etc. — but **not** any pattern matching `lib-*`. Workbox `injectManifest` walks `globPatterns: ["**/*.{js,css,...}"]` and unless excluded, the file lands in `__WB_MANIFEST` and gets precached on first SW install.

**Effect:** every first visitor (anonymous OR authed) downloads 101 KB gz of `.docx` parser to background-cache, on top of the 188 KB critical path, even if they never click "Import from Word." Worst on cold cellular. Counts against the SW install timeout on slow connections.

**Fix:** add `"**/lib-*.{js,mjs}"` to `globIgnores` in `vite.config.js:140`. The chunk name comes from rolldown's auto-chunking for dynamic imports — confirm the prefix is stable across builds. Alternatively, rename via a `manualChunks` rule (`if (id.includes("/node_modules/mammoth/")) return "mammoth-vendor"`) and ignore by the explicit name to make the precache rule grep-friendly.

**Verify:** after fix, `npm run build` then `cat dist/sw.js | grep "lib-"` should return nothing matching the precache manifest.

---

### F2 — Google Fonts CSS fetched cross-origin; could be self-hosted to remove the round-trip

**Severity: MEDIUM** — saves one cross-origin RTT on cold load

`index.html:199-203`:
```html
<link rel="preload" as="style"
  href="https://fonts.googleapis.com/css2?family=Fraunces:...&family=Inter+Tight:...&display=swap" />
```

`src/main.tsx:45-57` then injects the same URL as a stylesheet from JS.

Fraunces + Inter Tight are loaded from `fonts.googleapis.com` (CSS file, ~2-4 KB, returns `@font-face` declarations with hashed `fonts.gstatic.com` URLs for the actual `.woff2` payloads). Two cross-origin hosts in the critical-path graph:
1. `fonts.googleapis.com` — CSS fetch
2. `fonts.gstatic.com` — woff2 fetch

`<link rel="preconnect">` for both (`index.html:188-189`) eliminates the TCP/TLS handshake but **not** the request. Cross-origin still pays an extra HTTP/2 stream open vs same-origin.

**Mitigations in place:**
- Preconnect on both hosts (index.html:188-189)
- Preload the CSS so byte-fetch starts during HTML parse
- `font-display: swap` (in URL) — no FOIT
- JS-injected stylesheet — non-render-blocking

**Why a fix:** self-hosting via `@fontsource-variable/fraunces` + `@fontsource/inter-tight` (already use `@fontsource-variable/geist` per `package.json:42` + `src/index.css:4`) would put the fonts on the Vercel CDN, same-origin, immutable-cached, picked up by the existing SW precache. Removes ~150-300ms on a cold cellular RTT. Bytes likely a wash (woff2 + variable axes).

**Risk:** the `@fontsource-variable/geist` import in `src/index.css:4` already inflates the CSS bundle — verify `index-DaIcQwiF.css` (150 KB raw, 25.9 KB gz) doesn't double-grow when adding two more font families. Use `@fontsource-variable/fraunces/wght.css` to ship only the weight axis used.

---

### F3 — `index.css` ships 9 design-family stylesheets (150 KB raw / 25.9 KB gz); only one family is active per render

**Severity: LOW–MEDIUM**

`src/index.css:8-16`:
```css
@import "./design/family-dusk.css";
@import "./design/family-paper.css";
@import "./design/family-bronze.css";
@import "./design/family-aurora.css";
@import "./design/family-atelier.css";
@import "./design/family-blueprint.css";
@import "./design/family-botanical.css";
@import "./design/family-newsprint.css";
@import "./design/family-zine.css";
```

9 families × ~15 KB each (raw) ≈ ~135 KB CSS just for token + family bundles, scoped by `:root.family-bronze`, `.family-aurora`, etc. The active family is set at runtime via `<html class="family-bronze ...">` (visible in `index.html:2`).

Only the active family's tokens are used per render. The other 8 are downloaded, parsed, and held in CSSOM for nothing.

**Why it might be load-bearing:** instant theme switching without re-fetching. Today's UX is "cycle through families in Settings → Appearance" — needs no flash, so eager load wins. Splitting by family means 8 CSS round-trips on family-change.

**Fix path (graduated):**
1. **Quick win**: ship dark/light tokens for ONLY the user's persisted family (read from localStorage at HTML-parse time via `applyInitialDesignTheme()` in `main.tsx:37`). Lazy-import the other 8 via `import("./design/family-aurora.css?inline")` only if the user opens Settings → Appearance. Saves ~115 KB raw / ~22 KB gz from the critical CSS.
2. **Medium**: Tailwind-style `@layer` per family + JIT-prune via tailwind v4's `@source` directive. Only active family's classes survive.
3. **Hard**: ship CSS variables only (no per-family classnames); JS mutates `--ember`, `--ink`, `--bg` tokens directly on theme change.

Quick-win is the right target for launch.

**Verify:** `npm run build` → `wc -c dist/assets/index-*.css` before and after. Target: under 80 KB raw / under 15 KB gz.

---

### F4 — `jszip` (27.8 KB gz) shipped as separate chunk but imported eagerly by 3 import-panel files

**Severity: LOW**

```
src/lib/imports/google-keep.ts:2:import JSZip from "jszip";
src/lib/imports/obsidian.ts:3:import JSZip from "jszip";
src/lib/imports/notion.ts:3:import JSZip from "jszip";
```

The 3 import-panel components (`GoogleKeepImportPanel`, `ObsidianImportPanel`, `NotionImportPanel`) are themselves lazy-loaded from `DataTab.tsx:10-15`. So jszip only loads when a user opens DataTab and clicks one of those panels — fine.

But the panels eager-import their corresponding `imports/*.ts` parser, which eager-imports jszip. So each panel's chunk pulls jszip into the dependency graph. Vite hoists the shared dep to `jszip.min-*.js` (27.8 KB gz). Outcome is correct (one shared chunk, lazy-fetched).

**Concern**: if any future code statically imports `imports/google-keep.ts` from Everion or App or any non-lazy boundary, jszip silently leaks into the critical path. No build-time guard.

**Fix:** convert to dynamic import inside the parser fn:
```ts
async function parseGoogleKeepZip(buf: ArrayBuffer) {
  const { default: JSZip } = await import("jszip");
  // ...
}
```
Adds one micro-await but pins jszip behind a function-call boundary that can't be statically pulled into the eager graph.

---

### F5 — Repeat visitors with declined-consent or no-consent re-pay PostHog cost on every `getConsentDecision` flip

**Severity: LOW**

`src/main.tsx:87` + the consent banner write/read flow: when a user accepts consent, `deferSdks()` runs `initSentry()` + `initPostHog()`. PostHog full chunk (`posthog-DD7OAAB2.js`, 59.8 KB gz) downloads then. Sentry full (`sentry-Bv4tlh4O.js`, 142.6 KB gz) downloads then.

Combined: **~200 KB gz** triggered once on consent accept. Not on critical path, deferred via `requestIdleCallback`, but it's a real bandwidth cost a few seconds after first paint.

**Mitigation in place:** `idle` schedule means it doesn't compete with the entry parse + supabase auth boot. Should land during the first-typing-pause moment.

**Watchpoint:** if `requestIdleCallback` doesn't fire (heavy main thread for 4s+, e.g. on a low-end Android), the 4-second `timeout` parameter forces the callback. Sentry + PostHog still land before the 4s mark on most devices. Confirm on real device once before launch — cheap test in Chrome DevTools "CPU 4× slowdown" + "Slow 3G" preset.

**No fix needed unless field data shows long-tail issues.**

---

### F6 — No `<link rel="preload" as="font">` for above-the-fold variable Geist

**Severity: LOW**

`@fontsource-variable/geist` (`src/index.css:4`) ships the woff2 inside `dist/assets/*.woff2` (referenced from the built `index-*.css`). The CSS is loaded synchronously (render-blocking), so the browser will discover the font URL once CSSOM is built. That's one round-trip after HTML+CSS arrive.

For the visible-on-load typography (boot shell brand title — `index.html:336` — which uses Newsreader/serif fallback), this doesn't matter much because the family is rendered with `Newsreader, Georgia, serif` system fallback during the FOUC window. Once Geist loads and CSS swaps the family, text reflows.

**Fix:** add an explicit `<link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/fraunces-...woff2">` for the LCP-text font. Hash-stable URL — needs a build-time injection (Vite plugin or manual entry tag with placeholder).

**Worth it?** Only if real-device LCP measurements show font-swap lateness as the LCP-event cause. Don't pre-optimise without numbers (CLAUDE.md rule).

---

### F7 — Anonymous Landing path waits on entry chunk to lazy-resolve `Landing.tsx`

**Severity: LOW**

`src/main.tsx:17` — `const Landing = lazy(() => import("./views/Landing"));`

Anonymous visitor to `/` with no auth signal: HTML parses → entry script downloads + parses (62.7 KB gz) → main.tsx runs `chooseInitialBoot()` → returns `<Suspense fallback={<LoadingScreen/>}><Landing/></Suspense>` → triggers Landing fetch (10.2 KB gz).

So landing visit pays 2 sequential JS round-trips instead of 1. The boot shell HTML covers the gap visually.

**Fix:** add `<link rel="modulepreload" href="/assets/Landing-*.js">` to `index.html` for `/` route. Same caveat as F6 — needs a hash-stable URL or a Vite plugin to inject post-build.

**Or:** static-import Landing in `main.tsx` (5 line change) and keep App lazy. Gets Landing into the entry chunk waterfall. Tradeoff: returning users (who skip Landing) pay 10 KB gz they don't need. Returning users are the larger segment, so net cost positive.

**Don't fix without measuring.** ProductHunt-day Landing-only conversion path is the load-bearing one — but real LCP delta is likely ~50–150ms, well within budget.

---

### F8 — Boot watchdog script (`/boot-watchdog.js`) is sync-loaded after entry

**Severity: INFO — verify**

`index.html:428`:
```html
<script src="/boot-watchdog.js"></script>
<script type="module" src="/src/main.tsx"></script>
```

`<script src>` (no `defer`, no `type="module"`) is parser-blocking. It executes before the next-line module script. boot-watchdog.js is 2311 bytes raw — executes in <1ms — but blocking the parser at all is unnecessary if the watchdog only fires on `visibilitychange`.

**Comment in HTML (line 421-427):** "load order is fine" — the watchdog only fires on visibilitychange so it doesn't need to run before main.tsx.

**Fix:** add `defer` to the `<script>` tag — keeps order (defer runs in document order before DOMContentLoaded), removes parser-block. Single-character diff.

---

## Recommendations (priority)

1. **[MEDIUM] F1** — exclude `**/lib-*.{js,mjs}` from SW `globIgnores` in `vite.config.js:140`. Saves 101 KB gz precache cost for every first visitor. ~2 min change. **Highest leverage.**
2. **[MEDIUM] F2** — self-host Fraunces + Inter Tight via `@fontsource-variable/*` packages. Removes 1 cross-origin RTT on cold load. Verify CSS bundle stays under 30 KB gz after addition. ~30 min.
3. **[LOW–MEDIUM] F3** — defer the 8 inactive design-family stylesheets behind `import("?inline")` triggered from Settings → Appearance. Saves ~22 KB gz from critical CSS. ~1 hour. Test theme-switch UX still snaps without flash.
4. **[LOW] F8** — add `defer` to `<script src="/boot-watchdog.js">`. Single character. Removes parser-block.
5. **[LOW] F4** — convert `imports/{google-keep,obsidian,notion}.ts` jszip imports to function-scoped dynamic imports. Hardens against accidental eager-graph leaks. ~10 min.
6. **[LOW] F7** — measure first; only fix if Landing LCP > 2.5s on real device + slow 4G.
7. **[LOW] F6** — measure first; only preload font if font-swap lateness is the LCP cause.
8. **[INFO] F5** — verify on real low-end Android that idle posthog+sentry boot doesn't degrade typing INP.

---

## Pre-launch perf checklist

| Item | Status | Target | Owner |
|---|---|---|---|
| Initial JS+CSS gzipped < 200 KB | OK (188 KB) | 200 KB | — |
| Largest critical chunk < 50 KB gz | OK (radix 40.9 KB) | — | — |
| F1 fix — exclude lib-* from SW precache | TODO | — | dev |
| F2 fix — self-host Fraunces + Inter Tight | TODO | optional | dev |
| F3 fix — lazy-load inactive design families | TODO | optional | dev |
| Real-device Lighthouse run on `/` (anon) | not yet | LCP < 2.5s | dev |
| Real-device Lighthouse run on `/` (authed) | not yet | LCP < 2.5s | dev |
| WebPageTest cold cellular run | not yet | TTI < 5s on 4G | dev |
| Fonts: WOFF2 + `font-display: swap` | OK (verified in built CSS) | — | — |
| 3rd-party scripts in `<head>` (render-blocking) | none | none | — |
| `Cache-Control: immutable` on /assets/* | OK (vercel.json:107-108) | — | — |
| SW caches /api/* aggressively | NO (correct) | no | — |
| Stale-bundle recovery on chunk-fetch fail | OK (main.tsx:144-178) | — | — |
| posthog/sentry consent-gated + idle-deferred | OK (main.tsx:60-87) | — | — |

---

## Method

- Read `vite.config.js`, `package.json`, `index.html`, `dist/index.html`, `src/main.tsx`, `src/sw.js`, `scripts/build.mjs`, `vercel.json`, `src/index.css`, `src/App.tsx` (1-100), `src/Everion.tsx` (1-285).
- `npm run build` had already produced `dist/assets/*` — used existing artifacts; no rebuild this audit.
- PowerShell: enumerated `dist/assets/*.{js,css}` by size; computed proper gzip sizes using `System.IO.Compression.GZipStream` for top 28 chunks.
- Sniffed mystery chunks (`lib-*`, `dist-*`, `web-*`, `esm-*`) by inspecting first 150-500 chars + grepping for vendor markers (`mammoth`, `docx`, `xmldom`, `chrono`, `JSZip`).
- Walked modulepreload set in `dist/index.html` — 17 entries — confirmed initial wire-cost = 188 KB gz with CSS.
- Greps:
  - `lazy(`/`React.lazy(` in `src/` → 30+ callsites, all routed through `App.tsx`/`Everion.tsx`/`SettingsView.tsx`/`DataTab.tsx`.
  - `from "mammoth"`/`from "jszip"`/`from "exceljs"`/`from "pdfjs"`/`from "chrono"` → confirmed dynamic-import-only for mammoth + exceljs + pdfjs + chrono; jszip is statically imported by 3 import-panel parsers (F4).
  - `@font-face`/`font-display`/`woff2` against built CSS → 3 declarations, all swap, all woff2.
- Did NOT run lighthouse — the scope is config-level + bundle-level evidence; real-device LCP/INP is week-of-launch testing per the perf checklist.
- Did NOT read `graphify-out/GRAPH_REPORT.md` — pre-tool hint advisory; the audit needs measured bytes, not graph topology.

**Audit kicked off by**: user request "performance audit" on 2026-05-07.
