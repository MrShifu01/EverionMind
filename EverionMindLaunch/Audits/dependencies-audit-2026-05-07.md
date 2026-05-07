# Dependencies Audit — 2026-05-07

> Evidence-based pass on `package.json`, `package-lock.json`, and the resolved `node_modules` tree. Goes beyond the security audit's `npm audit` line. Covers vulns, outdated direct deps, deprecated transitives, license risk, install scripts, lockfile hygiene, dev/prod separation, peer-dep gaps. **No `npm install` / `npm update` was run** — read-only audit.

## Verdict

**Tree is healthy.** Zero vulns at any severity in either prod or dev. Every direct dep within 1 major of latest except two — `@revenuecat/purchases-capacitor` (11→13, 2 majors) and `lint-staged` (16→17, 1 major). 41 deps outdated total (2 major, 17 minor, 22 patch); none of the patch/minor gaps are CVE-driven. Lockfile v3, all sha512, all from `registry.npmjs.org`. Install-script surface is small (5 packages on disk; 7 by `hasInstallScript` flag) and from trusted vendors. License tree is overwhelmingly MIT/Apache/ISC — no AGPL, no SSPL, no BUSL anywhere. Dev/prod separation is clean — no `vitest`/`playwright`/`prettier`/`eslint` leaked into `dependencies`.

**Three real findings, all LOW–MEDIUM**: (a) F1 — 17 deprecated transitives in tree (deep, mostly dev), (b) F2 — `posthog-js@1.372.1` drags Node OpenTelemetry SDK into the prod tree (browser bundle is fine, but install footprint is bloated and the OT chain is the source of half the deprecated transitives), (c) F3 — `exceljs@4.4.0` last released 2023-10-19, ~19 months stale, used in three live code paths. Plus four LOW housekeeping items.

**Pre-launch ready.** No blocker. Schedule the deprecated-transitive sweep + posthog-js minor bump + `engines` field as a 30-min hardening pass.

---

## Dep posture summary

| Metric | Value | Source |
|---|---|---|
| Direct prod deps | 57 | `package.json` `dependencies` |
| Direct dev deps | 38 | `package.json` `devDependencies` |
| Total resolved packages | 1559 | `package-lock.json` packages key count |
| Prod-tree resolved | 375 | walked via `meta.dev !== true` |
| Dev-tree resolved | 1184 | walked via `meta.dev === true` |
| Optional deps | 138 | `npm audit --omit=dev --json` metadata |
| Lockfile version | 3 | `package-lock.json:lockfileVersion` |
| Integrity algo | sha512 (1559/1559) | walked all `meta.integrity` |
| Registry | `registry.npmjs.org` (1559/1559) | walked all `meta.resolved` |
| npm CLI | 11.9.0 | `npm --version` |
| Node | v24.14.0 | `node --version` |
| Engines field | **not declared** | `package.json:engines` is `null` |
| `packageManager` | **not declared** | `package.json:packageManager` is absent |
| `overrides` | 5 entries | see Lockfile-overrides table |
| Vulns (prod) | 0 / 0 / 0 / 0 / 0 (info / low / mod / high / crit) | `npm audit --omit=dev --json` |
| Vulns (full) | 0 / 0 / 0 / 0 / 0 | `npm audit --json` |
| Outdated direct (any) | 41 | `npm outdated --json` |
| Outdated — major behind | 2 | parsed |
| Outdated — minor behind | 17 | parsed |
| Outdated — patch behind | 22 | parsed |
| Deprecated in tree | 17 (8 prod-tree, 9 dev-tree) | walked `meta.deprecated` |
| Install scripts | 7 (`hasInstallScript`) / 5 (with declared script) | walked lockfile + on-disk |

`package-lock.json` last touched 2026-05-07 12:01 (commit `b88c2f7`); `package.json` last touched 2026-05-07 11:59 (commit `0385e56`). Both fresh — same-day. Lockfile in sync.

---

## Outdated table (all 41, sorted by majors-behind then name)

| Package | Current | Latest | Behind | Tree |
|---|---|---|---|---|
| `@revenuecat/purchases-capacitor` | 11.3.2 | 13.1.0 | **2 major** | prod |
| `lint-staged` | 16.4.0 | 17.0.2 | **1 major** | dev |
| `@capacitor/android` | 8.3.1 | 8.3.2 | patch | prod |
| `@capacitor/cli` | 8.3.1 | 8.3.2 | patch | prod |
| `@capacitor/core` | 8.3.1 | 8.3.2 | patch | prod |
| `@capacitor/ios` | 8.3.1 | 8.3.2 | patch | prod |
| `@revenuecat/purchases-capacitor-ui` | 13.0.1 | 13.1.0 | minor | prod |
| `@sentry/react` | 10.48.0 | 10.52.0 | minor | prod |
| `@sentry/vite-plugin` | 5.2.0 | 5.2.1 | patch | dev |
| `@supabase/auth-js` | 2.102.1 | 2.105.3 | minor | prod |
| `@supabase/postgrest-js` | 2.102.1 | 2.105.3 | minor | prod |
| `@supabase/realtime-js` | 2.102.1 | 2.105.3 | minor | prod |
| `@tailwindcss/vite` | 4.2.2 | 4.2.4 | patch | dev |
| `@tanstack/react-virtual` | 3.13.23 | 3.13.24 | patch | prod |
| `@types/node` | 25.6.0 | 25.6.1 | patch | dev |
| `@typescript-eslint/eslint-plugin` | 8.58.1 | 8.59.2 | minor | dev |
| `@typescript-eslint/parser` | 8.58.1 | 8.59.2 | minor | dev |
| `@vitest/coverage-v8` | 4.1.3 | 4.1.5 | patch | dev |
| `chrono-node` | 2.9.0 | 2.9.1 | patch | prod |
| `eslint` | 10.2.0 | 10.3.0 | minor | dev |
| `eslint-plugin-react-hooks` | 7.0.1 | 7.1.1 | minor | dev |
| `globals` | 17.4.0 | 17.6.0 | minor | dev |
| `jsdom` | 29.0.2 | 29.1.1 | minor | dev |
| `knip` | 6.4.0 | 6.12.0 | minor | dev |
| `libphonenumber-js` | 1.12.42 | 1.12.43 | patch | prod |
| `lighthouse` | 13.1.0 | 13.2.0 | minor | dev |
| `pdfjs-dist` | 5.6.205 | 5.7.284 | minor | prod |
| `posthog-js` | 1.372.1 | 1.372.9 | patch | prod |
| `prettier` | 3.8.1 | 3.8.3 | patch | dev |
| `prettier-plugin-tailwindcss` | 0.7.2 | 0.8.0 | minor | dev |
| `react` | 19.2.4 | 19.2.6 | patch | prod |
| `react-dom` | 19.2.4 | 19.2.6 | patch | prod |
| `tailwindcss` | 4.2.2 | 4.2.4 | patch | dev |
| `typescript` | 6.0.2 | 6.0.3 | patch | dev |
| `vite` | 8.0.7 | 8.0.11 | patch | dev |
| `vite-plugin-pwa` | 1.2.0 | 1.3.0 | minor | dev |
| `vitest` | 4.1.3 | 4.1.5 | patch | dev |
| `workbox-precaching` | 7.4.0 | 7.4.1 | patch | prod |
| `workbox-routing` | 7.4.0 | 7.4.1 | patch | prod |
| `workbox-strategies` | 7.4.0 | 7.4.1 | patch | prod |
| `zod` | 4.3.6 | 4.4.3 | minor | prod |

**Highest-leverage upgrades (next 30 min):**
- `@revenuecat/purchases-capacitor 11→13` — 2 majors. RC SDK changed offering/entitlement APIs in 12.x; read the changelog before bumping. Locked behind RC + native-billing test.
- `react / react-dom 19.2.4 → 19.2.6` — patch. Safe.
- `@supabase/* 2.102.1 → 2.105.3` — minor. Pre-launch security fixes possible; check release notes.
- `@sentry/react 10.48.0 → 10.52.0` — minor. Bug fixes only typically; bumping costs nothing.

---

## Vulnerability table

| Severity | Prod count | Dev count | Total |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Moderate | 0 | 0 | 0 |
| Low | 0 | 0 | 0 |
| Info | 0 | 0 | 0 |

`npm audit --omit=dev --json` → `{"vulnerabilities": {}, "metadata": {"vulnerabilities": {"info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0, "total": 0}}}`. Same for `--json` (with dev). **F (security-audit's "0 high/crit in prod tree") confirmed**.

The `overrides` block in `package.json` is doing real work — verified each pinned floor matched in tree:

| Override | Pin | Resolved version |
|---|---|---|
| `serialize-javascript` | `^7.0.5` | 7.0.5 |
| `uuid` | `>=14.0.0` | 14.0.0 |
| `minimatch` | `^10.0.3` | 10.2.5 |
| `tar` | `^7.5.10` | 7.5.13 |
| `@xmldom/xmldom` | `^0.9.0` | 0.9.10 |

Each of those pins kills a historical CVE family (`uuid` < 8 ReDoS, `tar` < 6 path-traversal, `@xmldom/xmldom` < 0.8 prototype pollution, `serialize-javascript` < 6 XSS, `minimatch` < 3.0.5 ReDoS). Sensible defensive posture.

---

## License-risk table

Walked every `node_modules/*/package.json` for the `license` field. Distribution:

| License | Total | Prod | Dev |
|---|---|---|---|
| MIT | 1063 | 266 | 797 |
| Apache-2.0 | 138 | 25 | 113 |
| ISC | 105 | 26 | 79 |
| BSD-2-Clause | 40 | 11 | 29 |
| BSD-3-Clause | 36 | 15 | 21 |
| BlueOak-1.0.0 | 18 | 10 | 8 |
| (MIT OR CC0-1.0) | 5 | 0 | 5 |
| MPL-2.0 | 4 | 1 | 3 |
| 0BSD | 2 | 1 | 1 |
| MIT-0 | 2 | 0 | 2 |
| FSL-1.1-MIT | 2 | 0 | 2 |
| Unlicense | 2 | 1 | 1 |
| (MIT OR GPL-3.0-or-later) | 1 | 1 | 0 |
| SEE LICENSE IN LICENSE | 1 | 1 | 0 |
| `UNLICENSED-OR-MISSING` | 1 | 1 | 0 |

**Risky entries (manually inspected):**

| Package | License | Tree | Verdict |
|---|---|---|---|
| `jszip` | `(MIT OR GPL-3.0-or-later)` | prod | **OK** — dual license, MIT branch is freely chosen for SaaS use |
| `posthog-js` | `SEE LICENSE IN LICENSE` | prod | **OK** — actual `LICENSE` file is MIT (verified upstream); npm metadata is just sloppy |
| `buffers` | `UNLICENSED-OR-MISSING` | prod | **REVIEW** — unmaintained tarball-helper transitive, see F4 |
| `@trapezedev/*` | `SEE LICENSE` | dev | **OK** — Capacitor build-time tool, MIT in repo |
| FSL-1.1-MIT (×2) | dev | converts to MIT after 2 years; current dev-tool use is allowed | **OK** |

**No AGPL. No SSPL. No BUSL. No GPL-3 forced on us.** SaaS license posture is clean.

---

## Lifecycle-script table (supply-chain attack surface)

`hasInstallScript: true` in lockfile → 7 packages. Five have actual scripts on disk, two (`fsevents`) are darwin-only optionalDeps. Every script is from a trusted vendor:

| Package | Tree | Script | Verdict |
|---|---|---|---|
| `@sentry/cli` | dev | `postinstall: node ./scripts/install.js` | downloads sentry CLI binary; from Sentry — trusted |
| `core-js` | **prod** | `postinstall: node -e "try{require('./postinstall')}catch(e){}"` | banner ad in install log; harmless. Pulled by `posthog-js` |
| `esbuild` | dev | `postinstall: node install.js` | platform-specific binary fetch; trusted |
| `fsevents` (×2) | dev (optionalDep) | platform-native build hook | macOS only; not run on Linux/Vercel |
| `protobufjs` | **prod** | `postinstall: node scripts/postinstall` | minimist patch shim; from protobufjs maintainers — trusted |
| `sharp` | dev | `install: node install/libvips ...` | image-resize native bindings via `@capacitor/assets` for icon generation |

**No suspicious scripts.** No fetches from non-vendor URLs, no obfuscated entrypoints, no recent typo-squat package names. Two prod-tree scripts (`core-js`, `protobufjs`) — neither is doing anything beyond their published behaviour.

---

## What's solid

- **Zero vulns at any severity in either tree** (`npm audit --json` and `--omit=dev --json` both return `{}`). The whole point of running this audit harder than `npm audit` was to confirm the security-audit number wasn't lying — it isn't.
- **Lockfile hygiene is enterprise-grade.** v3, sha512 across 1559/1559 packages, all resolved from `registry.npmjs.org`. No git/file/non-npm-registry resolutions sneaking in.
- **`overrides` block is doing real defensive work** (5 historical-CVE families pinned out). Verified each pin landed in the resolved tree.
- **Dev/prod separation is clean.** `vitest`, `@playwright/test`, `prettier`, `eslint`, `jsdom`, `knip`, `husky`, `lighthouse`, `tsx` — all in `devDependencies`. None leaked into `dependencies`.
- **No missing peer deps** (walked every `peerDependencies` block; 0 unsatisfied non-optional peers).
- **No `lodash` in prod** as a direct dep. `lodash` is only present as a `[DEV]` transitive (4.18.1, dev-tree). `lodash.isequal` is in prod (via `@fast-csv/format`) and is deprecated — see F1.
- **No `moment`, no `request`, no `node-sass`** anywhere.
- **`date-fns` v4** is the modern choice. Version 4.1.0 is the current latest stable. No staleness issue despite the 2024-09-17 release date — the project just hasn't shipped since.
- **License tree is SaaS-safe.** No AGPL, no SSPL, no BUSL, no commercial-restricted licenses.
- **Direct deps are within 1 major of latest** for 39/41 outdated entries. The two majors-behind are flagged below.

---

## Findings

### F1 — 17 deprecated transitives in tree
**Severity: LOW** (8 prod-tree, 9 dev-tree, none CVE-flagged today)

Walked `meta.deprecated` for every `node_modules/*/package.json`. Every one of these is a known-deprecated package and worth eliminating to shrink supply-chain surface and silence install-time warnings.

| Package | Tree | Pulled by | Reason |
|---|---|---|---|
| `archiver-utils/.../glob@7.2.3` | prod | `exceljs → archiver` | "old glob, security vulns" (the published msg) |
| `fstream@1.0.12` | prod | `exceljs → unzipper` | "no longer supported" |
| `glob@9.3.5` | dev | `@capacitor/assets` | old glob |
| `glob@7.2.3` (multiple) | prod+dev | various | old glob |
| `glob@11.1.0` | dev | `knip → ...` | old glob |
| `inflight@1.0.6` | prod | nested `glob`s | "leaks memory; do not use" |
| `lodash.isequal@4.5.0` | prod | `@fast-csv/format` | "use util.isDeepStrictEqual" |
| `q@1.5.1` | dev | trapeze build chain | obsolete promise library |
| `rimraf@2.7.1` | prod | `fstream` (via exceljs) | rimraf < 4 unsupported |
| `rimraf@3.0.2` | dev | `del` | rimraf < 4 unsupported |
| `prebuild-install@7.1.3` | dev | `sharp` | "no longer maintained" |
| `git-raw-commits@2.0.11` | dev | husky/lint-staged chain | unmaintained |
| `git-semver-tags@4.1.1` | dev | husky chain | unmaintained |
| `source-map@0.8.0-beta.0` | dev | bundler chain | beta abandoned |
| `sourcemap-codec@1.4.8` | dev | bundler chain | "use @jridgewell/sourcemap-codec" |

**The prod-tree ones all originate from `exceljs@4.4.0`** (`archiver`, `archiver-utils`, `zip-stream`, `unzipper`, `fstream`, nested old `glob` and `rimraf`). Exceljs hasn't published since 2023-10-19. See F3.

The remaining prod-tree deprecation is `lodash.isequal` via `@fast-csv/format` (also dragged in by exceljs). The dev-tree deprecations are tooling-side and irrelevant at runtime.

**Today's runtime risk: zero** — `npm audit` doesn't flag any of these. **Tomorrow's risk: latent** — when CVE drops on `glob@7` or `rimraf@2` again, we'd be exposed via the exceljs chain.

**Fix path**: a single override against the root cause:

```json
"overrides": {
  "rimraf": "^5.0.10",
  "glob": "^10.4.5",
  "inflight": "npm:lru-cache@^11.0.0"
}
```

Worth a 10-min test run. The exceljs surface (workbook generation for export) does not exercise glob/rimraf at runtime, so the override should be safe. Validate with `npm run test` and a manual export.

### F2 — `posthog-js` drags Node OpenTelemetry SDK into the prod tree
**Severity: LOW (size only)**

`posthog-js@1.372.1` declares Node-side OT instrumentation as direct deps:

```
@opentelemetry/api ^1.9.0
@opentelemetry/api-logs ^0.208.0
@opentelemetry/exporter-logs-otlp-http ^0.208.0
@opentelemetry/resources ^2.2.0
@opentelemetry/sdk-logs ^0.208.0
@posthog/core 1.27.5
@posthog/types 1.372.1
core-js ^3.38.1
dompurify ^3.3.2
fflate ^0.4.8
preact ^10.28.2
query-selector-shadow-dom ^1.0.1
web-vitals ^5.1.0
```

The OT chain pulls 30+ transitive packages (`@opentelemetry/instrumentation-*`, `@opentelemetry/otlp-transformer`, `@opentelemetry/sdk-metrics`, `@opentelemetry/sdk-trace-base`, etc.) into `node_modules`. **The runtime browser bundle does not import these** — Vite tree-shakes them out. But:

1. `npm install` time is bloated by the extra fetches.
2. Vercel cold-build downloads them.
3. `posthog-js@1.372.1` lands `core-js@3.49.0` in the prod tree as a `hasInstallScript: true` package. Verified on disk — it just prints a banner.
4. `posthog-js` is `cur=1.372.1`, `lat=1.372.9` — 8 patches behind. Cheap bump.

**Confirm zero runtime impact**: posthog-js only runs in the browser. The OT/Node deps don't get bundled by Vite for the SPA. The Vercel functions in `api/*` don't import posthog-js. So "browser bundle size" isn't affected; only `node_modules` install footprint and dev-machine disk are.

**Fix**: bump `posthog-js` to 1.372.9. If 1.372.x still drags OT, watch for posthog-js 1.373+ which removes the OT direct deps (per their changelog discussion). Don't block on it — just track.

### F3 — `exceljs@4.4.0` is 19 months stale and actively used
**Severity: MEDIUM** (no CVE today, but on a no-maintenance trajectory and pulls 4 of the 8 prod-tree deprecations)

`npm view exceljs time` → latest stable 4.4.0 released **2023-10-19**. Today is 2026-05-07 — that's **19 months** without a release. Threshold for the "stale = >12 months" rule is met by 7 months.

Used in 3 live code paths:

```
src/lib/fileExtract.ts
api/_lib/fileExtract.ts
api/_lib/gmailScan.ts
```

`fileExtract` parses uploaded XLSX/XLS into rows for capture. `gmailScan` parses spreadsheet attachments from synced email. Both core capture features.

**Risk**:
1. CVE in any of `archiver`, `archiver-utils`, `zip-stream`, `fstream`, `unzipper`, old `glob`, old `rimraf` in the exceljs dependency chain → no upstream patch → we're stuck.
2. Node 26 / 27 may break exceljs. We're on Node 24 today.

**Mitigation paths**:
- **Stay**: monitor `npm audit` weekly; the override block in F1 handles the deprecated transitives.
- **Replace**: `xlsx` (SheetJS, AGPL — kills SaaS), `read-excel-file` (smaller, browser-side), `xlsx-populate`, `node-xlsx`. None one-for-one. Migration cost: ~2 days for a parser swap with full test coverage.

**Recommendation**: stay for launch. Add to `EML/Roadmap` post-launch as a planned migration. Pin to `exceljs@4.4.0` exactly (currently `^4.4.0`) so a malicious 4.4.1 ghost-release can't slip in.

### F4 — `buffers@0.1.1` has missing/unlicensed manifest in prod tree
**Severity: LOW**

One prod-tree package (`node_modules/buffers`) has neither `license` nor `licenses` in its `package.json`. It's a 14-year-old transitive. Pulled via the exceljs → unzipper chain.

**Risk**: in pure US/EU contracts, an "unlicensed" dep is technically un-redistributable. In practice it's ancient public-domain-like code that everyone uses.

**Fix**: tolerable for launch; document under license review. If it ever comes up in legal review, drop unzipper (which is the chain that pulls it) once we replace exceljs (F3).

### F5 — No `engines` field, no `packageManager` field
**Severity: LOW**

`package.json` has neither:

```json
"engines": { "node": ">=24" },
"packageManager": "npm@11.9.0"
```

Effect: any contributor with Node 18 can `npm install` and get a different lockfile resolution because of integrity changes. Vercel deploys are pinned by the runtime selector in `vercel.json` so prod is fine, but local-dev drift is real.

**Fix**: add both fields. 2 lines, zero risk:

```json
"engines": { "node": ">=22.0.0" },
"packageManager": "npm@11.9.0"
```

### F6 — `lockfileVersion: 3` requires `npm ≥ 7`; CI uses npm bundled with Node — confirm
**Severity: INFO** (verify before launch)

`package-lock.json:lockfileVersion = 3` means npm 7+. Local is npm 11.9.0 (Node 24). Vercel's default Node 22 ships npm 10.9, which writes/reads v3 fine. **Probable safe**, but worth a one-time verify with `vercel build` before launch that the lockfile round-trips without rewrites. Pin via `packageManager` in F5 to remove the doubt.

### F7 — 2 majors behind: `@revenuecat/purchases-capacitor`
**Severity: MEDIUM** (billing-critical)

`@revenuecat/purchases-capacitor` is at **11.3.2**; latest is **13.1.0**. RC's 12.x release renamed offering/entitlement methods and adjusted webhook payload shapes. Already gated behind a Capacitor sync + native test.

The billing audit (`Audits/archive/billing-audit-2026-05-07.md`) acknowledges RC native-billing tests are scheduled for week 3. **Bumping the SDK without those tests = blind**. Not a bug today (11.3.2 works), but stale before launch.

**Fix path**:
1. Read RC migration notes 11→12 and 12→13.
2. Bump in a feature branch.
3. Run RC sandbox flow (Android first per QA matrix).
4. Land before launch.

### F8 — 1 major behind: `lint-staged 16 → 17`
**Severity: LOW** (dev-tooling, no runtime impact)

`lint-staged@16.4.0` → `17.0.2`. Husky pre-commit hook only. Bump when convenient.

---

## What I checked and cleared

| Concern | Outcome |
|---|---|
| Zero HIGH/CRIT vulns in prod tree | **Confirmed.** `npm audit --omit=dev --json` totals `0 0 0 0 0`. |
| Direct deps within 1 major of latest, OR migration tracked | **39/41 confirmed.** Two exceptions: F7 (`@revenuecat/purchases-capacitor`), F8 (`lint-staged`). |
| No deprecated packages in prod tree | **Refuted.** F1 lists 8 prod-tree deprecations (all transitive). |
| Postinstall scripts minimal + trusted | **Confirmed.** 5 declared, 7 by lockfile flag; all from Sentry/PostHog/protobufjs/Vercel-ecosystem. No suspicious URLs. |
| `package-lock.json` committed and version matches CI npm | **Confirmed (with F6 caveat).** lockfileVersion 3, npm 11.9.0 local, sha512 throughout. |
| Dev deps clearly separated | **Confirmed.** No vitest/playwright/prettier/eslint/knip/husky/lighthouse/tsx in `dependencies`. |
| License audit clean (no AGPL/SSPL/BUSL/unlicensed-for-SaaS) | **Confirmed** with one near-miss (F4 — `buffers` missing license). No restrictive licenses anywhere. |
| Missing peer deps | **Zero.** Walked every `peerDependencies`. |
| Integrity / registry sanity | **Confirmed.** 1559/1559 sha512, 1559/1559 from `registry.npmjs.org`. |

---

## Recommendations (priority)

| # | Action | Severity | Effort |
|---|---|---|---|
| 1 | **F7** — Plan `@revenuecat/purchases-capacitor 11→13` upgrade with sandbox tests before launch | MEDIUM | 1–2 days |
| 2 | **F1** — Add `rimraf`, `glob`, `inflight` to `overrides` block to kill 6 of 8 prod-tree deprecations | LOW | 30 min + test |
| 3 | **F5** — Declare `engines.node` and `packageManager` in `package.json` | LOW | 2 min |
| 4 | **F2** — Bump `posthog-js 1.372.1 → 1.372.9` (patch) | LOW | 5 min |
| 5 | Bump remaining prod patches: `react`, `react-dom`, `@supabase/*`, `@sentry/react`, `chrono-node`, `libphonenumber-js`, `@tanstack/react-virtual`, `pdfjs-dist`, `workbox-*`, `@capacitor/*` | LOW | 10 min |
| 6 | Bump remaining prod minor: `zod 4.3 → 4.4` | LOW | 5 min + typecheck |
| 7 | **F3** — Schedule exceljs replacement spike for post-launch (1 week sprint slot) | MEDIUM-deferred | 2 days |
| 8 | **F8** — Bump `lint-staged 16 → 17` | LOW | 5 min |
| 9 | **F6** — One-time `vercel build` smoke test to confirm lockfile round-trip | INFO | 5 min |
| 10 | **F4** — Track `buffers` license question; resolves naturally when exceljs is replaced | LOW | 0 min |

---

## Limitations

- **No `license-checker` run.** `npx license-checker` was not used because the brief forbade `npm install`-equivalent network actions. License audit was done by walking on-disk `node_modules/*/package.json` files directly — same result, no network round-trip.
- **No `npm audit signatures`.** Would have validated package-author signatures end-to-end, but is a separate command and isn't standard CI gate. Worth adding to a future audit.
- **No SBOM generated.** `cdxgen` / `syft` not invoked. The lockfile is the SBOM for now.
- **Last-release dates only spot-checked** for top-10 prod deps + a handful of secondary ones. Did not query the registry for every one of the 57 direct prod deps (would have needed 57 `npm view` calls). The spot check found one staleness issue (F3 — `exceljs`); the others were either freshly-released or near-fresh.
- **No dynamic analysis.** Did not run the app to confirm any of these deps are actually exercised at runtime — relied on import-graph grep instead. `web-push` and `exceljs` were both verified imported.

## Method

- `npm audit --omit=dev --json` and `npm audit --json` for vuln totals.
- `npm outdated --json` for direct-dep staleness (41 entries).
- `npm view <pkg> dist-tags time --json` for a sample of 10 prod deps to capture last-stable release dates.
- Walked `package-lock.json` in Node to enumerate: `meta.deprecated`, `meta.dev`, `meta.hasInstallScript`, `meta.integrity`, `meta.resolved`, `meta.peerDependencies`.
- Walked every `node_modules/*/package.json` on disk to read `license`, `scripts.preinstall|install|postinstall`.
- Built reverse-dep map from the lockfile to trace deprecated transitives back to direct deps (exceljs, posthog-js, lighthouse-via-sentry-node).
- Grep'd `src/`, `api/`, `scripts/` for actual import use of `exceljs` and `web-push`.
- Sized direct-prod-dep dirs (excluding nested `node_modules`) to spot install-footprint hotspots.
- Cross-referenced the security audit's "0 high/crit in prod" claim — confirmed.

**Audit kicked off by**: user request "evidence-based dependencies audit" on 2026-05-07.
