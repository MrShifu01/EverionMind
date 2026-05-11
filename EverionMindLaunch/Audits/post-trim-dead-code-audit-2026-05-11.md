# Post-Trim Dead Code Audit — 2026-05-11

Run after the major scope trim landed on `main` (~13k lines deleted across Todo, Gmail, Calendar, Contacts, Lists views; ~2.3k added for Gemini Live voice). Goal: identify legacy code and orphan files that can now be safely removed.

**Tools run**: Sheriff (passed), Knip (16 unused files, 6 unused deps, 2 unused types), e18e (127 warnings — mostly transitive dup-versions), TSR (cross-confirms Knip on `src/`), production build (✓ succeeded), manual import-graph trace.

---

## ⚠️ Highest-priority finding (tools missed this)

**A large dead Gmail subsystem is still wired into the API surface.** The trim removed `api/gmail.ts` (the Vercel function file) and all UI, but left every helper and handler intact in `api/entries.ts` + `api/mcp.ts`. Knip doesn't flag these because they're reachable from a live API entrypoint — but the `?action=` handlers behind them are dead since the UI no longer calls them.

| Surface | Location | Status |
|---|---|---|
| `POST /api/entries?action=distill-gmail` | `api/entries.ts:101, 884` | Handler live, no caller |
| `POST /api/entries?action=gmail-decision` | `api/entries.ts:103, 895` | Handler live, no caller |
| `GET /api/entries?action=gmail-prompt` | `api/entries.ts:105, 975` | Handler live, no caller |
| MCP tool `gmail_review_queue` | `api/mcp.ts:318, 1045` | Tool registered, no caller |
| Helper `api/_lib/distillGmail.ts` | imported by `entries.ts` | Dead chain |
| Helper `api/_lib/gmailScan.ts` (~2300 lines) | imported by `entries.ts` + `mcp.ts` | Dead chain |
| Helper `api/_lib/gmailPatternScore.ts` | imported by `entries.ts` | Dead chain |
| Helper `api/_lib/distillPatternSummary.ts` | imported by `gmailPatternScore` | Dead chain |
| Helper `api/_lib/gmailTokenCrypto.ts` | imported by `gmailScan` only | Dead chain |
| Helper `api/_lib/oauthState.ts` | **0 importers** | Knip-confirmed dead |
| Frontend dead-call → 404 | `src/views/DetailModal.tsx:300` calls `/api/gmail?action=ignore` (endpoint deleted) | Will 404 at runtime |
| Notification types `gmail_review`, `gmail_scan` | `src/hooks/useNotifications.ts:7, 10` | Dead enum members |

DB tables created by `supabase/migrations/080_gmail_pattern_rules.sql` and `083_pattern_distill.sql` are now orphaned (`gmail_pattern_rules`, `gmail_decisions`, `gmail_integrations`, `pattern_distill`). Migration files are append-only — they don't get deleted; instead write a new migration to `DROP TABLE`.

---

## Unused files (Knip + TSR agree) — 16 files

| File | Notes |
|---|---|
| `api/_lib/oauthState.ts` | OAuth state cookie helper — only ever used by `api/gmail.ts` (deleted) |
| `src/components/ListDetail.tsx` | Lists feature removed |
| `src/components/VoiceCaptureModal.tsx` | Old voice modal — replaced by `useGeminiLiveSession` |
| `src/hooks/useIsOnline.ts` | Superseded |
| `src/hooks/useRevenueCatEntitlement.ts` | Dead hook |
| `src/lib/karma.ts` | Todo-era helper |
| `src/lib/nlpParser.ts` | Todo NLP date parsing (uses chrono-node + date-fns) |
| `src/lib/vcard.ts` | Contacts-era helper |
| `src/components/settings/AppearanceTab.tsx` | Replaced by new design system |
| `src/components/ui/badge.tsx` | shadcn primitive — unused |
| `src/components/ui/calendar.tsx` | Uses `react-day-picker` (also unused dep) |
| `src/components/ui/card.tsx` | shadcn primitive — unused |
| `src/components/ui/date-field.tsx` | Uses `date-fns` (also unused) |
| `src/components/ui/drawer.tsx` | shadcn primitive — unused |
| `src/components/ui/label.tsx` | Uses `@radix-ui/react-label` (also unused) |
| `src/components/ui/popover.tsx` | Uses `@radix-ui/react-popover` (also unused) |

---

## Unused dependencies (Knip) — 6 packages

Listed in `package.json`, no source code imports them after the trim:

| Package | Pulled in by deleted file |
|---|---|
| `@radix-ui/react-label` | `ui/label.tsx` |
| `@radix-ui/react-popover` | `ui/popover.tsx` |
| `react-day-picker` | `ui/calendar.tsx` |
| `chrono-node` | `lib/nlpParser.ts` (Todo date parsing) |
| `date-fns` | `lib/nlpParser.ts` + `ui/date-field.tsx` |
| `@supabase/realtime-js` | Not imported anywhere; project uses `@supabase/postgrest-js` + `auth-js` directly |

---

## Unused types (Knip)

- `EventName` — `src/lib/events.ts:30`
- `ImportantMemory` — `src/lib/importantMemory.ts:9`

---

## Misplaced dependencies (manual)

- **`@capacitor/cli` is in `dependencies` (`package.json:36`)** — CLI build tool, belongs in `devDependencies`. Doesn't ship runtime code. Other Capacitor packages (`/android`, `/ios`, `/core`, etc.) are correctly placed.

---

## Heavy / replaceable packages (manual size audit)

| Package | Disk | Usage | Lighter option? |
|---|---|---|---|
| `@sentry/react` | 80 MB | Active (error reporting) | Keep — production-critical |
| `pdfjs-dist` | 41 MB | Active in `fileExtract` | Heavy but no real alternative for PDFs |
| `posthog-js` | 37 MB | Active analytics | Keep — but ensure it's only loaded after consent |
| `lucide-react` | 37 MB | **7 unique icons** across 8 files | Big win: switch to per-icon subpath imports `import CheckIcon from "lucide-react/dist/esm/icons/check"` or inline SVGs. Bundle is already tree-shaken; this reduces `node_modules` size + install time. |
| `exceljs` | 23 MB → 929 KB bundle chunk | Used in `fileExtract` for `.xlsx` | If read-only, `read-excel-file` is ~50 KB. If you also **write** xlsx, keep `exceljs`. |
| `mammoth` | 2.5 MB → 518 KB chunk | `.docx` parsing | Keep — no comparable alternative |

Build already chunks `exceljs` (929 KB), `mammoth` (518 KB), `sentry` (444 KB), `pdf` (405 KB) into lazy chunks, so first-paint is unaffected. Wins target install time and per-route load if you swap exceljs.

---

## Sheriff (illegal imports)

**Clean.** No module-boundary violations. `sheriff.config.ts` tagging is meaningful and all current code respects it.

---

## e18e

127 warnings — mostly **transitive duplicate dependency versions** (different versions of `ws`, `kleur`, `safe-buffer`, `tar-fs`, etc. pulled in by sibling packages). Not actionable directly — would require upgrading parent packages or adding `overrides`. Low priority unless install time matters.

---

## Build verification

`npm run build` succeeds cleanly. PWA generates 113 precache entries (~1.78 MB). No broken peer deps.

---

## Prioritised action table

| # | Action | Effort | Win |
|---|---|---|---|
| 1 | Delete the 16 Knip-flagged unused files | 5 min | Removes ~3000 lines of dead UI |
| 2 | Remove the 6 unused deps from `package.json` + `npm install` | 2 min | Slimmer install; smaller lockfile |
| 3 | Rip out dead Gmail subsystem from `api/_lib/` + handlers in `api/entries.ts`, `api/mcp.ts`, MCP tool, `DetailModal.handleIgnoreEmail`, notification types | 1–2 h | Removes ~3000+ lines from API layer; closes 404 path; flushes orphan code |
| 4 | Write a new migration to `DROP TABLE gmail_pattern_rules, gmail_decisions, gmail_integrations, pattern_distill` | 15 min | DB cleanup (after #3 ships) |
| 5 | Move `@capacitor/cli` to `devDependencies` | 1 min | Correctness; trims production install |
| 6 | Remove unused type exports (`EventName`, `ImportantMemory`) | 1 min | Tidy |
| 7 | Switch `lucide-react` to per-icon subpath imports OR inline 7 SVGs | 20 min | -30 MB `node_modules`, simpler types |
| 8 | Consider `read-excel-file` for `exceljs` if read-only | 30 min | -900 KB bundle chunk |
| 9 | Address e18e duplicate-version warnings via `overrides` | 1–2 h | Faster installs |

---

## Methodology

- Entrypoint: `src/main.tsx`
- Sheriff: `npx sheriff verify src/main.tsx` (passed)
- Knip: `npx knip --reporter json` (16 files, 6 deps, 2 types)
- e18e: `npx @e18e/cli analyze` (127 warnings)
- TSR: `npx tsr 'src/main\.tsx$'` (cross-confirmed Knip on `src/`; many test-file false positives ignored)
- Manual: import-graph trace via `grep` for each suspect; verified `DetailModal.tsx:300` calls deleted endpoint; verified Gmail helpers still imported by live API handlers; checked `node_modules` sizes via `du -sh`; ran `npm run build` to confirm no breakage.
