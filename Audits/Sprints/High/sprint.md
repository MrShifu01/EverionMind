# Sprint — High Severity Fixes
**Created:** 2026-04-15
**Source:** Audits/High/audit.md (11 findings)
**Goal:** Eliminate every actively broken feature, data loss risk, security vulnerability, and compliance failure before shipping to new users.

---

## How to use this sprint

Each task maps 1:1 to a High audit finding. Work top-to-bottom — earlier tasks unblock or reduce risk for later ones. Mark status as you go: `[ ]` → `[~]` (in progress) → `[x]` (done).

**Effort key:**
- `XS` — under 30 min, single file change
- `S` — 1–2 hours
- `M` — half day
- `L` — full day
- `XL` — multi-day, needs planning

---

## Task List

### [x] H-1 — Fix microphone permissions policy blocking voice recording
**Effort:** XS | **File:** `vercel.json:44`

The mic icon is live in the UI but silently does nothing in production. One character fix.

- [ ] Change `"microphone=()"` to `"microphone=(self)"` in the Permissions-Policy header
- [ ] Deploy and verify mic button works on a real device

---

### [x] H-2 — Replace `xlsx` dependency (unpatched CVEs on user uploads)
**Effort:** M | **Files:** `package.json`, `src/lib/fileExtract.ts`

Two unpatched CVEs on user-controlled input (prototype pollution + ReDoS). Direct attack surface.

- [ ] Decide approach: replace with `exceljs` OR remove client-side Excel parsing and route through `/api/extract-file` Gemini flow
- [ ] Remove `xlsx` from `package.json`
- [ ] Update `src/lib/fileExtract.ts` to use chosen replacement
- [ ] Test `.xlsx` upload end-to-end

---

### [x] H-3 — Implement `api/transfer.ts` (export/import return 404)
**Effort:** L | **File:** `api/transfer.ts` (new)

Brain backup and the GDPR/POPIA "export before delete" flow both silently fail with 404. Data portability is broken.

- [ ] Create `api/transfer.ts`
- [ ] Implement `GET ?brain_id=` export — returns user's entries as JSON, scoped to `user_id` via auth
- [ ] Implement `POST` import — bulk capture following `auth → rateLimit → checkBrainAccess` pattern
- [ ] Verify `vercel.json` rewrites resolve correctly
- [ ] Test export from BrainTab settings and DangerTab "export before delete" flow

---

### [x] H-4 — Fix PII leaking to Sentry + add privacy policy
**Effort:** M | **Files:** `src/main.tsx`, new privacy policy page

`sendDefaultPii: true` sends user emails and IPs to Sentry. No privacy policy exists. GDPR/POPIA compliance failure.

- [ ] Set `sendDefaultPii: false` in `src/main.tsx:12`
- [ ] Draft and add a privacy policy page (can be a static route) disclosing Sentry, Gemini, Groq, Vercel
- [ ] Link the privacy policy from the login screen
- [ ] Verify no PII fields in Sentry after deploy

---

### [x] H-5 — Fix 8 failing tests (CI pipeline broken)
**Effort:** S | **Files:** `src/components/__tests__/settings/AccountTab.test.tsx`, `src/components/__tests__/BottomNav.test.tsx`, `tests/components/BottomNav.test.tsx`

CI is broken on `main`. Two clusters of failures.

- [ ] Add `getUser: vi.fn().mockResolvedValue({ data: { user: { user_metadata: {} } } })` to AccountTab test Supabase mock
- [ ] Delete `tests/components/BottomNav.test.tsx` (orphan from test migration)
- [ ] Fix `src/components/__tests__/BottomNav.test.tsx` to match current component contract
- [ ] Run `npm test` — all 8 should pass
- [ ] Confirm CI green on push

---

### [x] H-6 — Decompose `RefineView.tsx` (1,883 lines)
**Effort:** XL | **File:** `src/views/RefineView.tsx`

Single component with 1,883 lines, 6 useState, 2 useMemo. Any state change re-renders everything. Persistent across 3 audit passes.

- [x] **Resolved by deletion** — `RefineView.tsx` was removed entirely from the codebase. The Refine view is no longer part of the app.

---

### [x] H-7 — Extract `computeCompletenessScore` to shared lib
**Effort:** XS | **Files:** `api/entries.ts`, `api/capture.ts`, new `api/_lib/completeness.ts`

Same 30-line function copy-pasted in two API files. Any scoring change must be made twice.

- [ ] Create `api/_lib/completeness.ts` with the shared function
- [ ] Replace both inline copies with the import
- [ ] Confirm both API routes still work

---

### [x] H-8 — Decompose `DetailModal.tsx` (976 lines)
**Effort:** L | **File:** `src/views/DetailModal.tsx`

Near-1,000-line component handling display, editing, connections, sharing, AI suggestions, voice notes, and quick actions.

- [ ] Extract the connections panel as `<ConnectionsPanel>` sub-component (highest isolation, most contained)
- [ ] Extract the quick-actions panel as `<EntryQuickActions>` sub-component
- [ ] Keep DetailModal as the shell wiring them together
- [ ] Verify entry detail modal still opens, edits, and saves correctly

---

### [x] H-9 — Fix NotificationSettings broken `ob-` tokens
**Effort:** S | **File:** `src/components/NotificationSettings.tsx:55–222`

21 undefined `ob-` class tokens. Notification settings panel renders with invisible text and missing backgrounds in production.

- [ ] Replace all `ob-` tokens with current system equivalents (migration table in audit)
- [ ] Visually verify the NotificationSettings panel in both light and dark mode

---

### [x] H-10 — Fix concept graph race condition (concurrent saves)
**Effort:** L | **Files:** `src/lib/brainConnections.ts`, `src/hooks/useRefineAnalysis.ts`, new `src/lib/graphWriter.ts`

Concurrent enrichment + Refine writes silently overwrite each other's concept data. Data loss with no error shown.

- [ ] Create `src/lib/graphWriter.ts` with per-brain lock and `writeConceptsToGraph(brainId, incoming)` function
- [ ] Update `brainConnections.ts` to delegate all graph writes through `graphWriter` — remove `_graphLock`
- [ ] Update `useRefineAnalysis.ts` lines ~800–820 to use `writeConceptsToGraph` instead of inline load→merge→save
- [ ] Check `useChat.ts` `feedQueryToGraph()` — route through `graphWriter` if it writes
- [ ] Verify `_graphLock` no longer exists anywhere in the codebase

---

### [x] H-11 — Fix `detectOrphans` using wrong field names
**Effort:** XS | **File:** `src/hooks/useRefineAnalysis.ts:79`

`l.from` and `l.to` are used but the canonical `Link` type uses `l.from_id` and `l.to_id`. Both are `undefined`, so every entry appears as an orphan — all orphan suggestions in Refine are fabricated.

- [ ] Change line 79: `[l.from, l.to]` → `[l.from_id, l.to_id]`
- [ ] Grep the file for any other `l.from` / `l.to` accesses and fix them
- [ ] Verify Refine no longer shows orphan suggestions for entries that have connections

---

## Sprint Summary

| # | Task | Effort | Risk if skipped |
|---|------|--------|----------------|
| H-1 | Mic permissions | XS | Voice feature silently broken |
| H-2 | Replace xlsx | M | CVE attack surface on uploads |
| H-3 | Implement transfer.ts | L | Export/import 404, GDPR breach |
| H-4 | PII + privacy policy | M | GDPR/POPIA compliance failure |
| H-5 | Fix failing tests | S | CI broken, no confidence in merges |
| H-6 | Decompose RefineView | XL | Compounding tech debt, render perf |
| H-7 | Extract completeness fn | XS | Scoring logic will diverge silently |
| H-8 | Decompose DetailModal | L | Growing tech debt on most-used view |
| H-9 | Fix ob- tokens | S | Notifications panel invisibly broken |
| H-10 | Graph race condition | L | Silent concept data loss |
| H-11 | detectOrphans fields | XS | All orphan suggestions are fabricated |

**Recommended order:** H-1 → H-11 → H-5 → H-7 → H-9 → H-4 → H-2 → H-3 → H-10 → H-8 → H-6
(quickest wins first to establish momentum; data loss and compliance mid-sprint; big refactors last)
