# EML Content Prune Audit — 2026-05-11

## Resolution — 2026-05-11

**Addressed in this commit:**
- `architecture/INDEX.md` — removed Gmail entry from Done list; deleted Tier 2.9 "Schedule / Todo placement engine" section; trimmed suggested-order list + done-set sentence.
- `architecture/bell.md` — full rewrite. Was 307 lines describing a Gmail-integrated bell with 4 cards + `useStagedCount` hook; now ~165 lines reflecting current 280-line bell with 2 cards (`MergeCard`, `AutoMergedCard`). Legacy `gmail_scan` / `gmail_review` rows still render via catch-all and are noted as legacy.
- `architecture/cron.md` — stripped `runGmailScanAllUsers` (six → five tasks), Gmail OAuth max-time note, Gmail-inbox-by-morning rationale, Gmail/enrich-or-persona verify row, Gmail-scan-dedup idempotency note.
- `architecture/enrich.md` — removed `api/gmail.ts:253` row from "Other call-sites of `enrichBrain`" table.
- `architecture/auth.md` — stripped `api/gmail.ts` 5/min-scan / 3/min-deep-scan reference, dropped "gmail scan" from list of `assertBrainAccess` callers, replaced `gmail-scan:<userId>` suffix example with llm sub-paths, dropped Gmail-scan 5/min from "no rate-limit per-user" bullet.
- `architecture/onboarding-flow.md` — removed stray `TODO confirm path` annotation.
- `ROADMAP.md` — removed `TodoView` from nav-removal list + DoD row; rewrote external-integrations bullet (vCard kept, Gmail/Google OAuth removed).
- `PLAYBOOK.md` — dropped `gmail` from INDEX skim line and from architecture-references list.
- `LAUNCH_CHECKLIST.md` — stripped Gmail from `T-01`, `A-04`, `E2E-21` lists; deleted E2E-14 / U-02-U-03 / E2E-20 (all entirely Gmail); marked `E2E-21` as `[x]` (this commit satisfies it); deleted "Gmail pattern rules — shipped" subsection (feature was reverted with migration 085).

**Deferred:** none. Every finding in this audit was either addressed in code or N/A (HISTORICAL [x] entries are load-bearing audit trail — kept by design).

**Wontfix:** none.

**Capture.md:** zero Gmail INGESTION mentions remained after the May-2026 trim. Only VCF contact-pipeline references — those refer to the live `src/lib/contactPipeline.ts` / `vcfParser.ts` path and are correct. No edit.

**Roadmap/week-*.md:** all surviving mentions are the user's personal email (`stander.christian@gmail.com`) or cross-client deliverability tests (Gmail/Outlook/Apple Mail INBOXES). No edit.

---

Post-trim audit of the `EverionMindLaunch/` knowledge base. After the May 2026 codebase trim, 140 markdown files across 13 folders carry varying amounts of dead references. This doc plans the prune so a fresh session can execute without re-discovering scope.

---

## Already deleted (this session)

| File | Reason |
|---|---|
| `architecture/gmail.md` | Entire doc is about the deleted Gmail ingestion subsystem |
| `Specs/gmail-pattern-rules.md` | Spec for `gmail_pattern_rules` table — table dropped via migration 085 |

---

## Important distinction: HISTORICAL vs LIVE references

`LAUNCH_CHECKLIST.md` has **50 hits** for `gmail|todo|calendar|contact|vcard`. The grep is misleading. Most are **historical [x] items** that describe past work (e.g. "Shipped 2026-04-30. New `api/_lib/oauthState.ts` HMAC-signs state payloads…"). Those are valid project history — **do not strip them**.

What to strip is narrower:

1. **Unchecked `[ ]` items referencing trimmed features** (future work that no longer applies)
2. **Forward-looking sections describing live functionality** for trimmed features (e.g. "Gmail pattern rules — shipped (2026-05-06)" if the section describes them as currently-live behaviour)
3. **References to deleted files as if they still exist** (e.g. architecture INDEX Tier 2.9 entirely about `TodoCalendarTab.tsx`)

Historical past-tense entries describing what happened are **load-bearing audit trail** — keep them.

---

## Strip targets — by file

### High value (live references to deleted code)

**`architecture/INDEX.md`** — 6 hits
- Line 9: Remove `✅ [Gmail sync flow](gmail.md)` from Done list
- Lines 33–35 (Tier 2.9): DELETE the entire "Schedule / Todo placement engine" section. `TodoCalendarTab.tsx`, `TodoView.tsx`, `TodoSomedayTab.tsx`, `todoUtils.ts` are all gone.
- Line 104: `contactPipeline.ts` — verify against current code (it still exists per the post-trim audit). Keep.
- Line 120: Update "Done" count sentence to remove Gmail.

**`architecture/bell.md`** — 27 hits
- Heavy mentions of `gmail_review` / `gmail_scan` notification types. These types still exist in the `useNotifications.ts` union for historical rows but no code creates new ones. Strip the **forward-looking** "this is how Gmail review notifications work" sections; keep any retrospective explanation of legacy rows.

**`architecture/cron.md`** — 6 hits
- `handleCronDaily` no longer runs `runGmailScanAllUsers` (removed in `c71b64d`). Strip the Gmail-scan section, keep the surrounding cron explanation.

**`architecture/capture.md`** — 7 hits
- Check for Gmail entry-creation references (gmail-source metadata, gmail-flag entry type). Historical entries still have these fields — keep mentions when describing READ paths, strip mentions describing INGESTION.

**`architecture/enrich.md`** — 2 hits
- Gmail attachment safety-net path was removed from `enrich.ts` (`c71b64d`). Strip those sentences.

**`architecture/onboarding-flow.md`** — 1 hit
- Quick check, likely one stray mention.

**`architecture/auth.md`** — 4 hits
- OAuth state HMAC sections referenced Gmail OAuth. Keep historical sections, strip live-references.

### Medium value (future-work items)

**`Roadmap/week-1.md` / `week-2.md` / `week-3.md`** — 1 hit each
- Single mentions, likely tangential. Quick strip.

**`Roadmap/week-4.md`** — 6 hits
- Cross-client email tests (`Gmail / Outlook / Apple Mail`) — these are about the welcome email landing in Gmail INBOXES, not the deleted Gmail integration. **Keep**.
- Calendar slot mention in template email — generic, **keep**.

**`ROADMAP.md`** — 4 hits
- Scan for Todo/Gmail/Calendar/Contacts product-roadmap items. Strip ones that promise features that no longer exist.

**`PLAYBOOK.md`** — 3 hits
- Same logic. Likely tangential mentions in the launch hub.

### Big file (slow scan)

**`LAUNCH_CHECKLIST.md`** — 50 hits, 121 KB
- The grep is dominated by historical retrospective entries. **Do not bulk-strip.**
- Targeted strip:
  - Line 17: `[x] **P1-3** Harden Gmail/enrichment cron…` — historical, keep
  - Line 46: `[ ] MANUAL-2026-05-07-11` mentions "TODO Phase 2" — verify if still applicable post-trim
  - Lines 70, 71, 74, 75, 78, 79, 80: **unchecked items** mentioning Gmail. Most can be DELETED — they describe future work on the removed feature.
  - Lines 522–529: "Gmail pattern rules — shipped (2026-05-06)" section. Convert to past-tense historical or delete entirely (the feature got ripped out a few days later).

### No action needed

`Specs/imports-spec.md`, `Specs/shared-brain-notifications.md`, `Specs/android-qa-matrix.md`, `Brand/*`, `Legal/*`, `Mobile/*`, `Analytics/*`, `marketing/*`, `Setup/*`, `Working/*` — mentions are either welcome-email-related (different Gmail) or historical/tangential.

---

## Recommended execution order for the next session

1. **Strip `architecture/INDEX.md`** (highest visibility, smallest scope) — 10 min
2. **Strip `architecture/bell.md`** — biggest single-file payoff — 20 min
3. **Strip `architecture/cron.md`, `capture.md`, `enrich.md`, `auth.md`, `onboarding-flow.md`** as a batch — 30 min
4. **Strip `ROADMAP.md` + `PLAYBOOK.md` + `Roadmap/week-*.md`** — 20 min
5. **LAUNCH_CHECKLIST.md targeted strip** of the ~7 unchecked-but-dead items — 30 min
6. **Commit** with `chore(EML): post-trim content prune — strip references to deleted Gmail/Todo/Calendar/Contacts features`
7. **THEN start the HTML redesign** (Phase B from the original plan)

Estimated total: 1.5–2 hours. Best done in a fresh session with clean context for the LAUNCH_CHECKLIST scan.

---

## After the prune: HTML redesign (Phase B)

User selected **Linear-style** for the visual rebuild. Sketch:
- Left sidebar: filterable views (Inbox / Active / Audits / Specs / Done) + saved filters
- Main panel: dense task list with status pills + priority + due date + small assignee
- Right slide-over: detail (renders markdown of the underlying file)
- Keyboard-first: `j`/`k` navigate, `enter` open, `cmd+k` search
- Status pills derived from `[ ]` vs `[x]` in checklists; priority from `P0`/`P1`/`P2` strings; due dates from inline date mentions
- `server.mjs` keeps live sync but adds JSON API for the dashboard to read structured task data

Estimated 3–6 hours. Do AFTER the content prune so the visual hierarchy isn't built around stale data.
