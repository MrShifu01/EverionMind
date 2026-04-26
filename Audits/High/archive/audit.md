# High Severity Findings — EverionMind
**Combined from:** Production Audit (2026-04-14), Smash OS Audit Pass 5 (2026-04-12), Pass 6 (2026-04-14), Impeccable Audit (2026-04-14), Architecture Deep Audit (2026-04-15)
**Status:** All items below are open and unresolved as of 2026-04-15.

---

## H-1 — `Permissions-Policy: microphone=()` blocks voice recording in production
**Source:** Production Audit (WARN S1), Pass 5 (HIGH), Pass 6 (HIGH)
**Status:** OPEN — persistent across 3 consecutive audit passes

Voice recording is a surfaced UI feature (mic button in CaptureSheet). The `Permissions-Policy` header in `vercel.json:44` explicitly blocks all microphone access. The result is a silent failure in production — the mic icon renders, the user taps it, nothing records. No error is shown.

**Location:** `vercel.json:44`
```json
{ "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
```

**Fix:** Change `microphone=()` to `microphone=(self)`. One character change.
```json
{ "key": "Permissions-Policy", "value": "camera=(), microphone=(self), geolocation=()" }
```

---

## H-2 — `xlsx` dependency: unpatched runtime CVEs on user-uploaded files
**Source:** Production Audit (FAIL CODE-5 / SUPPLY-2), Pass 5 (MEDIUM), Pass 6 (HIGH)
**Status:** OPEN — no upstream fix exists

`xlsx` is in production `dependencies` and parsed in `src/lib/fileExtract.ts:64`. Users can upload `.xlsx`/`.xls` files. Two unpatched CVEs:

- **GHSA-4r6h-8v6p-xvw6** — Prototype Pollution: a crafted spreadsheet corrupts the JS object prototype at parse time
- **GHSA-5pgg-2g8v-p4x9** — ReDoS: a crafted spreadsheet hangs the JS thread

This is a **direct attack surface** — user-controlled input triggers the vulnerable code path.

**Location:** `package.json:31`, `src/lib/fileExtract.ts:64`

**Fix (two options):**
1. Replace `xlsx` with `exceljs` (actively maintained, no known high CVEs)
2. Remove client-side Excel parsing entirely; route `.xlsx`/`.xls` files through the existing `/api/extract-file` Gemini server-side flow and drop `xlsx` from the bundle

---

## H-3 — `api/transfer.ts` missing — export and import return 404 in production
**Source:** Production Audit (FAIL DATA-5)
**Status:** OPEN

`vercel.json` rewrites `/api/export` → `/api/transfer` and `/api/import` → `/api/transfer`. The file `api/transfer.ts` does not exist in the repo. Both routes return 404 in production.

**Direct user impact:**
- `src/components/settings/BrainTab.tsx:13` calls `/api/export` for brain backup — silently fails
- `src/components/settings/DangerTab.tsx:50` calls `/api/export` as part of the "Export all data before deleting account" flow — GDPR/POPIA right-to-erasure export is broken

**Fix:** Implement `api/transfer.ts` with:
- `GET /api/export?brain_id=` — returns the user's entries as JSON (scoped to `user_id` via auth)
- `POST /api/import` — bulk capture following the existing `auth → rateLimit → checkBrainAccess` pattern

---

## H-4 — No privacy policy + `sendDefaultPii: true` in Sentry
**Source:** Production Audit (FAIL DATA-1), Pass 6 (MEDIUM)
**Status:** OPEN

Two related issues that together constitute a GDPR/POPIA compliance failure:

1. **`sendDefaultPii: true`** in `src/main.tsx:12` sends user IP addresses and email addresses to Sentry automatically. This app stores names, phone numbers, ID numbers, supplier data, and personal contacts. PII flows to a third-party error tracker without documented user consent.
2. **No privacy policy page** exists anywhere in the codebase or `public/` directory. There is no link from the login screen.
3. User content also flows to Google Gemini (entry content) and Groq (audio transcription) — neither is disclosed.

**Fix:**
- Set `sendDefaultPii: false` in `src/main.tsx:12`
- Add a privacy policy page documenting all third-party data flows (Sentry, Gemini, Groq, Vercel)
- Link it from the login screen

---

## H-5 — 8 failing tests, CI blocked
**Source:** Pass 6 (HIGH)
**Status:** OPEN — CI pipeline broken on `main`

Three test files are failing (8 tests total):

**Cluster 1: `src/components/__tests__/settings/AccountTab.test.tsx` (4 tests)**
Root cause: Supabase mock is missing `auth.getUser`. The component calls `supabase.auth.getUser()` in a `useEffect` (`AccountTab.tsx:56`). The mock used by this test does not implement `getUser`, causing a TypeError.

**Cluster 2: Duplicate BottomNav test files (4 tests)**
- `tests/components/BottomNav.test.tsx` — old location, stale test contract, failing
- `src/components/__tests__/BottomNav.test.tsx` — new location, also failing

Both files test `BottomNav` with different component contracts and both fail. The old file is an orphan from a test migration.

**Fix:**
1. Add `getUser: vi.fn().mockResolvedValue({ data: { user: { user_metadata: {} } } })` to the Supabase mock in AccountTab's test setup
2. Delete `tests/components/BottomNav.test.tsx` (old location); fix the remaining test in `src/components/__tests__/BottomNav.test.tsx`

---

## H-6 — `RefineView.tsx` — 1,883-line god component
**Source:** Production Audit (WARN), Pass 5 (HIGH), Pass 6 (HIGH)
**Status:** OPEN — persistent across 3 consecutive audit passes

`RefineView.tsx` is a single 1,883-line component handling brain-level AI suggestions, Q&A capture, link and concept graph management, SurprisingConnections display, bulk suggestion operations, and brain switcher UI. It has only 2 `useMemo`/`useCallback` calls across 6 `useState` declarations. Any state change re-renders the entire tree.

**Location:** `src/views/RefineView.tsx`

**Fix — suggested decomposition:**
- Extract `<ConceptGraphPanel>` (graph load/save/merge logic)
- Extract `<SuggestionList>` (suggestion items, accept/reject)
- Extract `<EnrichmentDebugPanel>` (Q&A capture, debug output)
- Keep `RefineView` as an orchestration shell (~200 lines)

---

## H-7 — `computeCompletenessScore` duplicated verbatim in two API files
**Source:** Pass 5 (HIGH), Pass 6 (HIGH)
**Status:** OPEN — persistent across 2 consecutive audit passes

The same 30-line function exists copy-pasted in both `api/entries.ts:11-40` and `api/capture.ts:12-40`. Any change to the completeness scoring logic must be made in two places. This has already diverged risk.

**Fix:** Extract to `api/_lib/completeness.ts` and import in both files:
```ts
// api/_lib/completeness.ts
export function computeCompletenessScore(
  title: string, content: string, type: string, tags: string[], metadata: Record<string, any>
): number { ... }
```

---

## H-8 — `DetailModal.tsx` — 976-line component
**Source:** Pass 5 (HIGH at 1,037 lines), Pass 6 (MEDIUM)
**Status:** OPEN — marginally reduced from 1,037 to 976 lines, still a decomposition candidate

Handles: entry display, inline editing, connections panel, sharing, AI suggestion display, voice note, quick actions. Single component with full state management.

**Location:** `src/views/DetailModal.tsx`

**Fix:** Extract the connections panel and the quick-actions panel as sub-components first (highest isolation).

---

## H-9 — `NotificationSettings` uses 21 undefined `ob-` tokens — renders broken in production
**Source:** Impeccable Audit (P1)
**Status:** OPEN

`src/components/NotificationSettings.tsx` uses 21 class references from a previous token generation: `bg-ob-surface`, `text-ob-text`, `text-ob-text-dim`, `border-ob-border`, `bg-ob-bg`, `text-ob-text-soft`, `text-ob-text-muted`, etc. None of these tokens are defined in `index.css` or any imported stylesheet. They silently fall back to transparent/inherited values, meaning the NotificationSettings panel renders with invisible text, missing backgrounds, and broken borders in production.

**Location:** `src/components/NotificationSettings.tsx:55–222`

**Fix:** Migrate all `ob-` tokens to the current system:

| Old | Replace with |
|-----|-------------|
| `bg-ob-surface` | `bg-surface-container` |
| `bg-ob-bg` | `bg-surface` |
| `text-ob-text` | `text-on-surface` |
| `text-ob-text-dim` / `text-ob-text-soft` | `text-on-surface-variant` |
| `text-ob-text-muted` | `text-on-surface-variant/60` |
| `border-ob-border` | `border-outline-variant` |

---

## H-10 — Concept graph race condition: concurrent saves silently overwrite each other
**Source:** Architecture Deep Audit (HIGH), 2026-04-15

The enrichment pipeline has four independent code paths that write to the concept graph, but only one goes through the module-level lock in `brainConnections.ts`. The lock is also global (not per-brain), so it serialises all brains unnecessarily while still leaving three unguarded writers:

1. `useRefineAnalysis.ts` lines ~800–820 — writes graph after AI audit call with no lock
2. `useChat.ts` — calls `feedQueryToGraph()` directly
3. `enrichEntry.ts` — calls `extractEntryConnections()` (goes through lock) but also writes enrichment metadata in parallel

**Concrete failure:** User captures an entry while Refine is open → both load the graph simultaneously → whichever saves last silently discards the other's extracted concepts. Concept graph data is permanently lost with no error shown.

**Location:** `src/lib/brainConnections.ts:14`, `src/hooks/useRefineAnalysis.ts:~800–820`, `src/hooks/useChat.ts`

**Fix:** Create `src/lib/graphWriter.ts` as the single per-brain-locked writer. All three callers replace their load→merge→save pattern with `writeConceptsToGraph(brainId, { concepts, relationships })`. Remove `_graphLock` from `brainConnections.ts` after migration.
```typescript
// src/lib/graphWriter.ts
const locks = new Map<string, Promise<void>>();
export async function writeConceptsToGraph(brainId: string, incoming: {...}): Promise<void> {
  // per-brain lock, load → merge → save under lock
}
```

---

## H-11 — `detectOrphans` uses wrong field names — orphan detection is completely broken
**Source:** Architecture Deep Audit (HIGH), 2026-04-15

`useRefineAnalysis.ts` line 79 accesses `l.from` and `l.to` on Link objects:
```typescript
const linked = new Set(links.flatMap((l) => [l.from, l.to]));
```
But the canonical `Link` type in `types.ts` uses `from_id` and `to_id`. Since `l.from` and `l.to` are both `undefined`, every entry in the brain appears as an orphan. The Refine view's orphan suggestions are entirely fabricated — every entry is flagged regardless of its actual connection state.

**Location:** `src/hooks/useRefineAnalysis.ts:79`, `src/types.ts`

**Fix:** Update `detectOrphans` to use the canonical field names:
```typescript
const linked = new Set(links.flatMap((l) => [l.from_id, l.to_id]));
```
Audit the file for any other uses of `l.from`/`l.to` and fix them to match `types.ts`.
