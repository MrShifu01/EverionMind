# PWA / Offline Audit — 2026-05-07

> Service-worker lifecycle, precache budget, runtime cache strategy, BFCache eligibility, iOS Safari resume behaviour, install-prompt UX, and `manifest` correctness for the public-launch PWA. Capacitor native shell explicitly out of scope.

## Verdict

**Most of the SW design is right.** Custom `injectManifest` SW (`src/sw.js`, 60 lines) skips waiting only on user opt-in (Sonner toast), claims clients on activate, runs `cleanupOutdatedCaches`, splits hashed `/assets/*.js` (CacheFirst) from navigations (StaleWhileRevalidate). `globIgnores` drops 4.20 MB of dynamic-import-only chunks (pdf.worker, exceljs, sentry, GraphView, AdminTab, all import panels, ChatView, LoginScreen, ResetPasswordView, StatusPage, VaultRevealModal) — precache lands at **~2.64 MB raw / 64 entries**, well under the 5 MB mobile-data threshold.

**Six findings**, none catastrophic, but two are launch-blockers for the install story:

- **F1 — manifest mismatch**: `index.html` references vite-pwa-generated `/manifest.webmanifest` which has **no maskable icons** and **no apple-touch icon**. Public `/manifest.json` (which has both) is shipped to dist but never loaded. Android adaptive-icon falls back to a 1×1 transparent square inside a circle on some launchers; iOS uses generic Safari fallback.
- **F2 — `beforeunload` listener kills BFCache** for the signed-in app shell on iOS Safari. Page never goes into the BFCache; "back" from a settings link triggers a full reload + the boot-shell flash.
- **F3 — no `beforeinstallprompt` handling** — Android install prompt fires whenever Chrome's heuristic decides, with no engagement gate. iOS has no `apple-touch-startup-image`, so launching from home screen shows a black flash before the boot shell paints.
- **F4 — fonts not in precache** — woff2 not in `globPatterns`. First offline launch falls back to Inter/Fraunces system stack until network returns.
- **F5 — SW served with default Cache-Control** — no explicit `Cache-Control: no-cache` on `/sw.js`. Vercel default is fine for now (browsers re-validate SW max every 24h per spec) but unpinned.
- **F6 — `cleanupOutdatedCaches` runs on every SW eval, not gated to install/activate** — minor; keeps cache hygiene but adds a `caches.keys()` round on every event.

**Top 3 to fix pre-launch**: F1 (point HTML at `/manifest.json`, or merge maskable + apple-touch into the vite-pwa manifest config), F2 (replace `beforeunload` with `pagehide` for the pending-delete flush), F3 (capture the `beforeinstallprompt` event, gate the prompt on a 30s + 2nd-session engagement signal, and add `apple-touch-startup-image` for iOS).

---

## Architecture overview

```
                              ┌───────────────────────────────┐
First navigation              │ index.html (CSP: script-src   │
─────────────────────────────►│   'self'). app-shell-boot div │
GET /                         │   inline. boot-watchdog 12s.  │
                              └──────────────┬────────────────┘
                                             │
                                             ▼
                              main.tsx → registerSW (web only,
                                gated by !Capacitor.isNativePlatform)
                                             │
                                             ▼
                ┌────────────────────────────────────────────────┐
                │  /sw.js (workbox-precaching + workbox-routing) │
                │  injectManifest from src/sw.js (60 lines).     │
                │  ┌──────────────────────────────────────────┐  │
                │  │ install:                                 │  │
                │  │   precacheAndRoute(__WB_MANIFEST)        │  │
                │  │   — fetches 64 entries, ~2.64 MB raw     │  │
                │  └──────────────────────────────────────────┘  │
                │  ┌──────────────────────────────────────────┐  │
                │  │ activate:                                │  │
                │  │   self.clients.claim()                   │  │
                │  │   cleanupOutdatedCaches() (was at top    │  │
                │  │   level — runs on every SW eval, F6)     │  │
                │  └──────────────────────────────────────────┘  │
                │  ┌──────────────────────────────────────────┐  │
                │  │ message:                                 │  │
                │  │   if data.type === 'SKIP_WAITING' →      │  │
                │  │     self.skipWaiting()                   │  │
                │  └──────────────────────────────────────────┘  │
                │  ┌──────────────────────────────────────────┐  │
                │  │ runtime routes:                          │  │
                │  │   /assets/*.js  → CacheFirst (js-chunks) │  │
                │  │   navigation    → SWR (html-nav)         │  │
                │  │   /api/*        → no route, network only │  │
                │  └──────────────────────────────────────────┘  │
                │  ┌──────────────────────────────────────────┐  │
                │  │ push / notificationclick handlers        │  │
                │  └──────────────────────────────────────────┘  │
                └─────────────────┬──────────────────────────────┘
                                  │
                ┌─────────────────▼──────────────────┐
                │ UpdatePrompt.tsx                   │
                │   onNeedRefresh → Sonner toast     │
                │   "New version available." →       │
                │   updateSW(true) → SKIP_WAITING +  │
                │   page reload via vite-pwa's       │
                │   own controllerchange listener.   │
                └────────────────────────────────────┘
```

SW only runs in the browser. Capacitor wrap explicitly skips registration (`UpdatePrompt.tsx:33`).

---

## Precache inventory

Build artefact: `dist/sw.js`, 24,652 bytes. Manifest is inlined as the `__WB_MANIFEST` argument to `precacheAndRoute`.

| Type            | Count | Largest file (bytes)                                | Total (raw bytes) |
|-----------------|-------|-----------------------------------------------------|-------------------|
| Static images   | 7     | `og.png` (estimated from public/), `icons/icon-512.png` 29,363 | ~80,000 |
| App shell JS    | 53    | `lib-BQtG_ufA.js` 422,939; `Everion-Bm7VTuKO.js` 235,789; `index-C2dDtYwD.js` 201,148 | ~2,400,000 |
| App shell CSS   | 2     | `index-DaIcQwiF.css` 153,882; `TodoView-Chw94eNX.css` 7,969 | 161,851 |
| Manifest        | 1     | `manifest.webmanifest` 377                          | 377 |
| **Total raw**   | **64**| —                                                   | **~2,640,000 (2.64 MB)** |

Cross-check: `dist/assets/` is 6.76 MB raw; `globIgnores` removes 4.20 MB (verified by summing pdf.worker 2.19 MB, exceljs 930 KB, sentry 444 KB, pdf 405 KB, jszip 96 KB, AdminTab 48 KB, ChatView 27 KB, LoginScreen 22 KB, GraphView 14 KB, others). Net precache ≈ 2.56 MB inside `/assets`, plus ~80 KB of /icons + /favicons + boot-watchdog + logoNew.webp + og.png + icons.svg = **~2.64 MB raw / ~700–900 KB gzipped on the wire**.

**Verdict on precache budget**: bounded, well below the 5 MB Lighthouse mobile-data threshold. Verified against `vite.config.js:140-160` `globIgnores` allowlist — the named excluded chunks are real lazy routes (fileExtract, GraphView, AdminTab, all import panels) so the budget is intentional, not accidental.

Excluded chunks confirmed in `dist/assets/` (sizes raw):

| Excluded chunk             | Size (bytes) | Trigger                                     |
|----------------------------|-------------:|---------------------------------------------|
| `pdf.worker-*.mjs`         |    2,186,232 | PDF capture only                            |
| `exceljs.min-*.js`         |      929,875 | `.xlsx` import only                         |
| `sentry-*.js`              |      444,165 | consent-deferred SDK                        |
| `pdf-*.js`                 |      405,070 | PDF capture only                            |
| `jszip.min-*.js`           |       95,880 | docx / zip import only                      |
| `AdminTab-*.js`            |       48,065 | admin route only                            |
| `ChatView-*.js`            |       27,328 | chat route                                  |
| `LoginScreen-*.js`         |       21,951 | auth flow only — already cached on first auth visit |
| `GraphView-*.js`           |       14,845 | graph route only                            |
| `VaultRevealModal-*.js`    |        6,817 | vault reveal only                           |
| `StatusPage-*.js`          |        3,679 | /status only                                |
| `*ImportPanel-*.js`        |    ~10,000   | per-source imports                          |
| **Total excluded**         | **4,197,471 (4.00 MB)** | |

`maximumFileSizeToCacheInBytes: 1_500_000` (vite.config.js:164) — every individual file in the included set is below the limit.

---

## Runtime cache strategy

| Pattern                          | Strategy           | Cache name      | Source        | Notes                                                                                          |
|----------------------------------|--------------------|-----------------|---------------|------------------------------------------------------------------------------------------------|
| Precached assets                 | CacheFirst (Workbox precache) | `workbox-precache-v2-…` | `precacheAndRoute` (`sw.js:17`) | 64 hashed entries; revalidated by hash on each build         |
| `request.destination=script` AND `url.pathname startsWith /assets/` | CacheFirst           | `js-chunks`     | `sw.js:21-24` | Hashed Vite chunks — content-addressed, immutable                                              |
| Navigation requests              | StaleWhileRevalidate | `html-nav`      | `sw.js:27`    | Serves cached `index.html` instantly, revalidates in the background                            |
| `/api/*`                         | No route — falls through to network only | n/a | n/a | Vercel response sets `Cache-Control: no-store` (`vercel.json:102`); SW does not match it. ✅ correct |
| Fonts (woff2)                    | No route, no precache| n/a             | n/a           | First offline launch falls back to Geist system stack. **F4**                                  |
| Push / notification              | n/a                | n/a             | `sw.js:30-60` | Standard `showNotification` + `clients.matchAll` focus; no caching                             |

`/api/*` not aggressively cached: **confirmed**. No `registerRoute(/^\/api/, …)` exists. Falls through to default network. Plus Vercel sets `Cache-Control: no-store` so the browser HTTP cache also won't store responses. ✅

---

## What's solid

- **Precache budget bounded** (~2.64 MB raw / ~700–900 KB gz). Heavy lazy chunks excluded via explicit allowlist in `vite.config.js:140-160`.
- **Skip-waiting + clients.claim wired correctly** (`sw.js:8-11`). User opts in via Sonner toast (`UpdatePrompt.tsx:34-49`); the new SW activates and claims open clients; vite-plugin-pwa's `controllerchange` listener (in `node_modules/vite-plugin-pwa/.../register.js`) handles the reload — `main.tsx:89-96` deliberately doesn't add a second listener (would double-fire on every background SW takeover).
- **`cleanupOutdatedCaches()` is called** (`sw.js:14`) — old precaches from prior SW versions are deleted on activate, killing ghost-cache risk after a deploy.
- **Hashed-asset cache-bust strategy works**: Vite emits content-hashed filenames (`assets/Everion-Bm7VTuKO.js`); precache uses null `revision` because the URL itself encodes the hash (verified inline in `dist/sw.js`'s manifest entries).
- **Stale-bundle recovery** (`main.tsx:144-178`): catches "Loading chunk N failed" / "Failed to fetch dynamically imported module" / "Importing a module script failed" / "error loading dynamically imported module" and once-per-session unregisters all SWs + clears all caches + reloads. Strong defence against an old SW serving a chunk URL whose hash no longer exists post-deploy.
- **Capacitor gate** (`UpdatePrompt.tsx:33`): SW registration is suppressed inside the native WebView. Native shell ships its own bundle via App Store / Play release; SWs inside Capacitor have a long history of pain (cache mismatches, file:// scope conflicts).
- **Native-side `/api/*` handling**: Vercel sets `Cache-Control: no-store` on `/api/*` (`vercel.json:99-104`). SW has no route matching `/api/*` so it falls through to network. Two layers of defence.
- **iOS PWA resume reload** (`main.tsx:109-134`): tracks `visibilitychange`-hidden timestamp, force-reloads on `pageshow` if `persisted` and >10s elapsed. Works around the iOS Safari freeze-on-resume bug. Boot-watchdog (`public/boot-watchdog.js`) fires after 12s if React hasn't mounted, gated on `navigator.onLine` (no reload-loop while offline) and `sessionStorage` (once per session).
- **Offline empty state implemented** (`src/components/OfflineScreen.tsx`): mounts when there's no session AND `navigator.onLine === false` (`App.tsx:355-360`). Subscribes to `online` event for auto-retry. Calm UI, single retry button, no native dialog.
- **Online subscription hook** (`src/hooks/useIsOnline.ts`): leaf components subscribe to `online`/`offline` events. Capacitor wrap uses native `Network` plugin instead of `navigator.onLine` (`src/lib/capacitorBridge.ts:11`) — `navigator.onLine` is unreliable inside the WebView. ✅
- **No `unload` listener anywhere in `src/`**: verified by grep — only `beforeunload` (in one file). Absence of `unload` is the strongest BFCache eligibility win.
- **CSP-safe boot watchdog**: `public/boot-watchdog.js` is a self-hosted script (not inline). CSP `script-src 'self'` blocks every inline `<script>` in production (`vercel.json:69`). Self-hosting the watchdog satisfies CSP without `'unsafe-inline'` or hash-pinning every comment edit.

---

## Findings

### F1 — Manifest mismatch: live one missing maskable + apple-touch
**Severity: HIGH** — launch blocker for Android install / iOS home-screen icon

`dist/index.html:420`:
```html
<link rel="manifest" href="/manifest.webmanifest">
```

`dist/manifest.webmanifest` (vite-pwa generated, full content):
```json
{"name":"Everion","short_name":"Everion","description":"Chris's personal memory & knowledge OS","start_url":"/","display":"standalone","background_color":"#211a14","theme_color":"#211a14","lang":"en","scope":"/","orientation":"any","icons":[{"src":"/icons/icon-192.png","sizes":"192x192","type":"image/png"},{"src":"/icons/icon-512.png","sizes":"512x512","type":"image/png"}]}
```

`public/manifest.json` (lines 14-33 — has maskable + apple-touch icon, never loaded):
```json
"icons": [
  { "src": "/icons/icon-192.png", "type": "image/png", "sizes": "192x192", "purpose": "any maskable" },
  { "src": "/icons/icon-512.png", "type": "image/png", "sizes": "512x512", "purpose": "any maskable" },
  { "src": "/icons/apple-touch-icon.png", "type": "image/png", "sizes": "180x180", "purpose": "any" }
]
```

**Result**:
- Android Chrome: "Add to Home" works, but adaptive-icon launchers (Pixel, OneUI) get an icon without a `maskable` declaration → applies safe-zone cropping → border may appear. Not all launchers degrade — Chrome backfills — but the spec compliance is broken.
- iOS Safari: `apple-touch-icon` is read from `index.html:8` (`<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`) so it works, but the manifest disagreement still flags in Lighthouse PWA audit and any third-party wrapper that reads only the manifest (Capacitor wrap, browser engagement scoring) misses the high-res icon.

Source: `vite.config.js:112-126` defines the manifest inline in the VitePWA plugin config; vite-pwa emits `manifest.webmanifest` and overrides whatever is in `public/manifest.json`. The `public/manifest.json` is shipped because vite copies `public/*` into `dist/*` unmodified, but `index.html` is rewritten by the build to point at `manifest.webmanifest`.

**Fix** (`vite.config.js:112-126`):
```js
manifest: {
  // ...existing fields...
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    { src: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
  ],
},
```

Then delete `public/manifest.json` so there's a single source of truth.

### F2 — `beforeunload` listener kills BFCache eligibility
**Severity: HIGH** — every "back" from a link out reloads the whole app

`src/hooks/useDataLayer.ts:339-348`:
```ts
// Flush pending delete on page hide / unload
useEffect(() => {
  const flush = () => commitPendingDelete();
  window.addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", flush);
  return () => {
    window.removeEventListener("beforeunload", flush);
    document.removeEventListener("visibilitychange", flush);
  };
}, [commitPendingDelete]);
```

`beforeunload` is a documented BFCache-killer in WebKit (Safari/iOS) and degrades BFCache eligibility in Firefox. Chromium keeps BFCache eligibility for `beforeunload` since 2022 if the handler is empty, but Everion's handler does work (`commitPendingDelete()`), so even Chrome may evict.

**Result**: when a user taps an external link from the app and hits "back," instead of the BFCache instant restore, the page reloads from scratch — boot shell flash, all React state lost, lazy chunks re-parsed, Supabase auth re-cached.

**Fix**: replace `beforeunload` with `pagehide` (which fires unconditionally on tab close + on BFCache entry) AND keep `visibilitychange`. `pagehide` is BFCache-friendly:

```ts
useEffect(() => {
  const flush = () => commitPendingDelete();
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", flush);
  return () => {
    window.removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", flush);
  };
}, [commitPendingDelete]);
```

`pagehide` fires before BFCache-entry; the page is then frozen, restored on `pageshow`. `commitPendingDelete()` will have run, BFCache stays eligible. **One-line risk-bounded fix.**

### F3 — No `beforeinstallprompt` UX, no iOS startup image
**Severity: MEDIUM** — install rate left to browser heuristic

Grep: no `beforeinstallprompt` anywhere in `src/`. Android's install prompt fires when Chrome's PWA-criteria bot decides the user is "engaged enough" — first paint is too early. Without a `beforeinstallprompt` capture, we can't:
- Defer the prompt to a 2nd-session + 30s engagement gate.
- Show our own install CTA inside the in-app onboarding flow.
- Track install-prompt-accept analytics.

**iOS side**: `index.html` has `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title` (correct). It does NOT have `apple-touch-startup-image`. When iOS launches the home-screen PWA, there's a black flash before the boot-shell `<style>` paints. Adding even one `apple-touch-startup-image` per device class (or one default 1242×2688) cuts the flash. Boot-watchdog already mitigates the *post-mount* freeze; the *pre-mount* flash is what's left.

**Fix paths** (in priority order):
1. Capture `beforeinstallprompt` in a top-level `useEffect` inside `App.tsx`, stash the deferred event in state. After 2nd session + ≥30s session-time, surface a custom install banner using existing project tokens (`Chip`, `SmallBtn`, `--ember`, `press` class). On click: `event.prompt()`. Track outcome via `event.userChoice`.
2. Add `<link rel="apple-touch-startup-image" href="/icons/splash-1242x2688.png">` (one entry covers most devices; per-class is gold-plate). Generate the splash from the existing app-shell-boot at 2x.

### F4 — Fonts not in precache; offline first-load uses fallback stack
**Severity: LOW** — cosmetic on first offline launch, no functional impact

`vite.config.js:131`:
```js
globPatterns: ["**/*.{js,css,ico,png,svg,webp}"],
```

`woff2` is missing. `dist/assets/` ships:
- `geist-latin-wght-normal-Dm3htQBi.woff2` (28,400 bytes)
- `geist-latin-ext-wght-normal-DMtmJ5ZE.woff2` (15,308 bytes)
- `geist-cyrillic-wght-normal-CHSlOQsW.woff2` (14,692 bytes)

These are local Geist fonts — used somewhere in `index-DaIcQwiF.css`. Total = 58.4 KB raw (~30 KB gz) — small enough to add to the precache cheaply.

**Plus**: Google Fonts `Fraunces` + `Inter Tight` are loaded from `fonts.googleapis.com` (`index.html:200-203`) — those don't precache. First offline visit shows the fallback stack `Newsreader, Georgia, serif` for the brand text and the system sans for body. Acceptable; documenting as a known caveat.

**Fix**:
```js
globPatterns: ["**/*.{js,css,ico,png,svg,webp,woff2}"],
```

One-character widening; adds 58 KB to the precache, brings local fonts offline-ready.

### F5 — `/sw.js` served with default Cache-Control
**Severity: LOW** — mostly belt-and-braces

`vercel.json` has explicit overrides for `/api/*` (no-store, line 102) and `/assets/*` (immutable, line 108). No override on `/sw.js`. Vercel serves it with default headers (`Cache-Control: public, max-age=0, must-revalidate` for static files based on Vercel's defaults).

**Why it matters at all**: per the SW spec, browsers re-validate the SW script every 24h max regardless of Cache-Control. So even if a CDN held the old SW for hours, the next install/update tick would refetch. But adding an explicit `Cache-Control: no-cache, must-revalidate` on `/sw.js` makes the contract explicit and survives a CDN config drift.

**Fix** (`vercel.json` headers section):
```json
{
  "source": "/sw.js",
  "headers": [{ "key": "Cache-Control", "value": "no-cache, must-revalidate" }]
}
```

### F6 — `cleanupOutdatedCaches` runs on every SW eval
**Severity: LOW** — minor perf, no correctness issue

`src/sw.js:14`:
```js
cleanupOutdatedCaches();
```

Top-level call. Workbox's docs say the function attaches an `activate` listener; it should be safe at top level. But a re-read of the workbox-precaching source shows it iterates `caches.keys()` to find outdated precache caches at activate time only — so this is fine. Marking as **wontfix / monitor**: keep as-is.

---

## BFCache eligibility scorecard

| Concern                              | Source                                       | Status                                  |
|--------------------------------------|----------------------------------------------|-----------------------------------------|
| `unload` listener                    | grep — no matches in `src/`                  | ✅ none                                 |
| `beforeunload` listener              | `src/hooks/useDataLayer.ts:342`              | ❌ kills WebKit eligibility (**F2**)    |
| Open IndexedDB transaction at hide   | not directly checked — `useOfflineSync` uses non-blocking ops | likely OK              |
| WebSocket open                       | not used anywhere in src/                    | ✅ none                                 |
| `Cache-Control: no-store` on the doc | `index.html` served with default              | ✅ no `no-store`                        |
| `pageshow` reload on iOS resume      | `main.tsx:121-133` — gated on `>10s` hidden  | ✅ proportionate, doesn't kill BFCache (the reload is intentional and only on long-suspended persisted=true) |

**Net**: one `beforeunload` listener away from BFCache compatibility on every browser. Fix F2, full eligibility.

---

## iOS Safari resume scorecard

| Behaviour                          | Mitigation                                   |
|------------------------------------|----------------------------------------------|
| Freeze-on-resume (long background) | `main.tsx:109-134` — sessionStorage timestamp + `pageshow.persisted` + 10s threshold + reload |
| Stuck splash (boot-shell never hidden) | `public/boot-watchdog.js` — 12s timeout, gated on `navigator.onLine` and per-session sentinel |
| Black flash on home-screen launch  | **Missing** `apple-touch-startup-image` (**F3**) |
| App-shell mismatch with theme      | inline `:root { --bg }` CSS in `index.html:228-237` matches resolved theme; theme-color media-aware (`index.html:24-25`) |
| Standalone mode `navigator.standalone` handling | not directly checked — out of audit scope |

---

## Install / engagement signals

| Signal                                 | Source                                     | Status |
|---------------------------------------|--------------------------------------------|--------|
| `display: standalone`                 | `vite.config.js:118`, `dist/manifest.webmanifest` | ✅     |
| `start_url: /`                        | same                                       | ✅     |
| `scope: /`                            | same                                       | ✅     |
| `theme_color`                         | `#211a14` (manifest), media-aware (HTML)   | ✅     |
| `background_color`                    | `#211a14` (manifest), inline `--bg` (HTML) | ✅     |
| `name`, `short_name`                  | "Everion" / "Everion"                      | ✅     |
| Maskable icon (192, 512)              | NOT in active manifest                     | ❌ **F1** |
| `apple-touch-icon` (180×180)          | HTML `<link>` only, NOT in active manifest | ⚠ partial **F1** |
| `apple-touch-startup-image`           | not present                                | ❌ **F3** |
| `beforeinstallprompt` capture/UX      | not present                                | ❌ **F3** |

`start_url: /` does match the post-login redirect target — `App.tsx` uses `/` for both the landing and the signed-in shell, with auth state determining which view mounts.

---

## Recommendations (priority)

| # | Severity | Finding | Action                                                                                        | Effort |
|---|----------|---------|-----------------------------------------------------------------------------------------------|--------|
| 1 | HIGH     | F1      | Move `purpose: "any maskable"` + apple-touch entry into `vite.config.js` `manifest.icons`. Delete `public/manifest.json`. | 5 min  |
| 2 | HIGH     | F2      | Replace `beforeunload` with `pagehide` in `useDataLayer.ts:342`. Verify `commitPendingDelete()` is sync or fire-and-forget. | 5 min  |
| 3 | MEDIUM   | F3      | Capture `beforeinstallprompt`; gate prompt on session-count + dwell-time signal. Add one `apple-touch-startup-image`. | 1–2 hrs |
| 4 | LOW      | F4      | Add `woff2` to `vite.config.js:131` `globPatterns`. Verifies offline first-load uses local Geist. | 1 min  |
| 5 | LOW      | F5      | Add explicit `/sw.js` Cache-Control to `vercel.json`.                                          | 2 min  |
| 6 | n/a      | F6      | Wontfix — current placement is workbox-recommended. Monitor.                                  | 0      |

After F1 + F2 + F3, the PWA is launch-ready. F4 and F5 are belt-and-braces hardening.

---

## Limitations

- Did not run `npm run build` in this audit — analysed the existing `dist/` artefact (timestamps May 7 18:09, post-recent commits). If a subsequent build changes the manifest URL or precache shape, re-verify.
- Did not run Lighthouse PWA audit in CI — recommended pre-launch step. Lighthouse will surface F1 (manifest) and F3 (install prompt) automatically; useful confirmation.
- Did not exercise `pageshow.persisted` on a real iOS device — recommendation in `main.tsx:109-134` reads correct but real-device verification is the only proof iOS still triggers the freeze-on-resume the same way in iOS 18. Add to QA matrix.
- Did not verify `Cache-Control` header actually returned by Vercel on `/sw.js` against a deployed preview — relied on `vercel.json` config absence. Confirm via `curl -I https://<deploy>/sw.js`.
- Capacitor native shell explicitly out of scope per audit brief; `UpdatePrompt.tsx:33` confirms the SW is gated off there. Native cache and update story belongs in the upcoming mobile-native-audit.

## Method

- Read `vite.config.js:80-167` (VitePWA plugin config, `injectManifest` strategy, `globIgnores`, `maximumFileSizeToCacheInBytes`).
- Read `src/sw.js` end-to-end (60 lines, every line).
- Read `dist/sw.js` first 200+ lines — confirmed Workbox 7.3.0, precache manifest inlined with 64 entries.
- Read `public/manifest.json` and `dist/manifest.webmanifest` — diffed icon entries.
- Read `dist/index.html:420` — confirmed live `<link rel="manifest">` target.
- Read `src/components/UpdatePrompt.tsx`, `src/main.tsx:60-178`, `src/App.tsx:84-99 + 355-360`, `src/components/OfflineScreen.tsx`, `src/hooks/useIsOnline.ts`, `public/boot-watchdog.js`.
- Grep'd for `unload`, `beforeunload`, `beforeinstallprompt`, `navigator.onLine`, `useOnline`, `addEventListener("unload"`. Counted matches and read each hit.
- Inspected `dist/assets/` directory: counted 130 files, summed total bytes (6.76 MB raw), summed excluded set (4.20 MB raw), inferred precache (~2.64 MB raw).
- Confirmed `vercel.json:99-109` `/api/*` no-store + `/assets/*` immutable; verified absence of `/sw.js` override.
- Cross-checked all findings against the format reference `EML/Audits/archive/billing-audit-2026-05-07.md`.

**Audit kicked off by**: user request "evidence-based PWA / offline audit" on 2026-05-07.
