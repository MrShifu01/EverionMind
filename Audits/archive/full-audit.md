# Full App Audit — 2026-04-12 (Pass 5)

```
▸ SMASH OS  ·  full app audit  [2026-04-12]
══════════════════════════════════════════════════════════════════

  OVERALL SCORE   80 / 100  —  B-
  VERDICT         PASS WITH WARNINGS

══════════════════════════════════════════════════════════════════
  DIMENSION BREAKDOWN
──────────────────────────────────────────────────────────────────
  Security              78 / 100   ×0.20  →  15.6
  Performance           76 / 100   ×0.20  →  15.2
  Architecture          84 / 100   ×0.20  →  16.8
  Code Quality / Types  80 / 100   ×0.15  →  12.0
  UX / UI               82 / 100   ×0.15  →  12.3
  Maintainability       78 / 100   ×0.05  →   3.9
  User Perspective      80 / 100   ×0.05  →   4.0
──────────────────────────────────────────────────────────────────
  WEIGHTED TOTAL                           79.8 → 80
══════════════════════════════════════════════════════════════════
```

## Code Hygiene Pass (pre-audit)

Before the audit, a full code hygiene pass was completed:

- Deleted 31 dead source files (~2,069 lines) from `src/lib/` and `src/data/`
- Deleted 30 orphaned test files for removed modules
- Consolidated duplicate `cn.ts` + `utils.ts` into single `cn.ts`
- Replaced `lucide-react` (37MB) with 2 inline SVGs in `LoginScreen.tsx`
- Moved `shadcn` from dependencies to devDependencies
- Removed unused `@luma.gl/webgl` and `@softarc/sheriff-*` from deps
- Removed unused `entryIds` variable in `GraphView.tsx`
- Fixed truncated JSON parse in `GraphView.tsx` `extractJSON` function

---

## SECURITY — 78/100

**What's solid:**
- Cryptography is textbook-correct: PBKDF2 310k iterations, AES-256-GCM, random IV/salt (`src/lib/crypto.ts`)
- CSP header comprehensive with scoped connect-src, script-src, style-src, font-src, img-src (`vercel.json:39`)
- All API endpoints enforce `verifyAuth()` before processing
- Rate limiting uses Upstash Redis sliding window with in-memory fallback (`api/_lib/rateLimit.ts`)
- RLS enabled on all tables (22 migration files)
- LLM proxy validates message structure: role, content type, max 50 messages, max_tokens capped at 4096
- AI keys now in-memory (no longer localStorage)
- .env in .gitignore, .env.example exists with all 12 vars documented

**Findings:**

| Sev | Finding | Location |
|-----|---------|----------|
| HIGH | Permissions-Policy blocks microphone (`microphone=()`) but app uses MediaRecorder for voice capture — silently broken in production | `vercel.json:44` vs `src/hooks/useVoiceRecorder.ts:22` |
| HIGH | No error monitoring (Sentry) — production errors invisible | `src/ErrorBoundary.tsx:23` |
| MEDIUM | `xlsx` has 2 unpatched high-severity CVEs (prototype pollution, ReDoS), no fix available | `package.json` |
| MEDIUM | `loadUserAISettings` still hydrates non-sensitive settings back into localStorage | `src/lib/aiSettings.ts:130-156` |
| LOW | Empty catch block swallows vault fetch errors silently | `src/hooks/useVaultOps.ts:70` |

---

## PERFORMANCE — 76/100

**What's solid:**
- Code splitting with `React.lazy` on 5 heavy views (`src/OpenBrain.tsx:75-79`)
- `lazyRetry` handles stale chunk hashes gracefully
- List virtualization via `@tanstack/react-virtual` in EntryList
- Search has 200ms debounce
- Entries cached in localStorage for instant cold start
- Vercel SpeedInsights integrated

**Findings:**

| Sev | Finding | Location |
|-----|---------|----------|
| HIGH | RefineView.tsx is 1,883 lines — not decomposed | `src/views/RefineView.tsx` |
| HIGH | DetailModal.tsx is 1,037 lines | `src/views/DetailModal.tsx` |
| MEDIUM | CaptureSheet.tsx (1,075 lines) eagerly imported on critical render path | `src/components/CaptureSheet.tsx` |
| MEDIUM | GraphView dependency tree is 280MB (cosmograph + duckdb + luma.gl) for one view | `src/views/GraphView.tsx` |

---

## ARCHITECTURE — 84/100

**What's solid:**
- Clean separation: `src/lib/` (logic), `src/hooks/` (React), `src/components/` (UI), `src/views/` (pages), `src/context/` (state)
- Context split by domain: `EntriesContext`, `BrainContext`
- Custom hooks extract logic well (10+ focused hooks)
- Database RLS on every table, 22 migrations with proper schema evolution
- API uses shared helpers: `verifyAuth`, `rateLimit`, `checkBrainAccess`, `sbHeaders`

**Findings:**

| Sev | Finding | Location |
|-----|---------|----------|
| HIGH | `computeCompletenessScore` duplicated verbatim across two API files | `api/entries.ts:11` and `api/capture.ts:12` |
| MEDIUM | OpenBrain.tsx at 1,032 lines — god component owning entries, nav, search, filters | `src/OpenBrain.tsx` |
| MEDIUM | No client-side router — no deep linking, no browser back/forward | `src/OpenBrain.tsx:92-97` |

---

## CODE QUALITY / TYPES — 80/100

**What's solid:**
- Zero `@ts-ignore` / `@ts-nocheck` in src/
- TypeScript strict mode, ESLint + Prettier enforced in CI
- 76 test files, 449+ passing tests
- Knip configured for dead code detection

**Findings:**

| Sev | Finding | Location |
|-----|---------|----------|
| MEDIUM | 68 occurrences of `: any` across 23 source files | Multiple |
| MEDIUM | RefineView.tsx needs decomposition into sub-components | `src/views/RefineView.tsx` |
| LOW | Empty catch block in useVaultOps.ts:70 | `src/hooks/useVaultOps.ts:70` |
| LOW | `lazyRetry` helper uses `Promise<any>` return type | `src/OpenBrain.tsx:57` |

---

## UX / UI — 82/100

**What's solid:**
- Skeleton loading screens with `role="status"` and `aria-label`
- ErrorBoundary wired at app root with recovery button
- Focus traps on modals, `aria-current="page"` on nav
- Onboarding modal with use-case selection
- Undo system with progress toast for delete/update/create
- PWA: service worker, offline queue, update toast
- Dark/light theme toggle with CSS custom properties

**Findings:**

| Sev | Finding | Location |
|-----|---------|----------|
| MEDIUM | Many interactive elements in large components likely lack aria labels | DetailModal, RefineView, CaptureSheet |
| MEDIUM | Destructive actions use native `window.confirm()` — inconsistent with polished UI | `src/views/TrashView.tsx:52,68` |
| LOW | Voice recording broken in production due to Permissions-Policy (see Security) | `vercel.json:44` |

---

## MAINTAINABILITY — 78/100

**What's solid:**
- CI/CD: GitHub Actions with typecheck, lint, format:check, test
- `.env.example` with all 12 vars documented
- 22 Supabase migrations with sequential numbering
- Knip + Prettier + ESLint with consistent config

**Findings:**

| Sev | Finding | Location |
|-----|---------|----------|
| MEDIUM | `xlsx` has unpatched high-severity CVEs | `package.json` |
| LOW | No Dependabot/Renovate configured | `.github/` |
| LOW | CI does not include build step — build failures caught only at deploy time | `.github/workflows/ci.yml` |

---

## USER PERSPECTIVE — 80/100

**What's solid:**
- Onboarding flow: name input, use-case selection, vault teaser
- Offline support with IndexedDB queue and retry logic
- PWA installable, background capture with toast feedback
- Entries cached locally for instant cold start

**Findings:**

| Sev | Finding | Location |
|-----|---------|----------|
| MEDIUM | No URL-based routing — no bookmarks, deep links, or browser history | `src/OpenBrain.tsx` |
| MEDIUM | Offline sync drops operations after 3 retries with only console.warn | `src/hooks/useOfflineSync.ts:8` |
| LOW | No keyboard shortcuts for power users | App-wide |

---

## TOP ACTIONS (priority order)

| # | Priority | Action | Impact |
|---|----------|--------|--------|
| 1 | HIGH | Fix Permissions-Policy: change `microphone=()` to `microphone=(self)` in `vercel.json:44` | Unblocks voice recording in production |
| 2 | HIGH | Add error monitoring (Sentry) — wire to `ErrorBoundary.componentDidCatch` | Operational visibility |
| 3 | HIGH | Decompose `RefineView.tsx` (1,883 lines) and `DetailModal.tsx` (1,037 lines) | Maintainability + bundle size |
| 4 | HIGH | Extract duplicated `computeCompletenessScore` to `api/_lib/` | DRY / bug risk |
| 5 | MEDIUM | Replace `xlsx` dependency (unpatched high-severity CVEs) | Security |
| 6 | MEDIUM | Add client-side router for deep linking and browser history | UX for knowledge management |
| 7 | MEDIUM | Reduce `: any` usage (68 occurrences across 23 files) | Type safety |
| 8 | LOW | Add `npm run build` step to CI pipeline | CI reliability |

---

## Score History

| Date | Pass | Score | Grade |
|------|------|-------|-------|
| 2026-04-02 | 1 | 74 | C+ |
| 2026-04-08 | 2 | 75 | C+ |
| 2026-04-08 | 3 | 78 | C+ |
| 2026-04-12 | 5 | 80 | B- |
