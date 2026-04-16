# Audit Pipeline Design

**Date:** 2026-04-16
**Status:** Approved

## Overview

A full entry-quality audit pipeline that automatically runs against a user's brain entries, surfaces actionable flags in the Feed, and lets users fix issues with minimal friction. Audit results are persisted in entry metadata so they survive device switches and page refreshes.

## Goals

- Automatically detect quality issues across all 11 flag types defined in `ENTRY_AUDIT` prompt
- Surface flags as actionable feed cards (one card per flag) under a "Consider fixing" section
- Zero friction — runs automatically on app open, once per 24h per brain
- No new Vercel function — audit handler merged into existing `api/entries.ts`
- Flags persist across devices via `entry.metadata.audit_flags`

## Architecture

### Backend

**Audit handler merged into `api/entries.ts`:**
- Dispatched via `resource=audit` query param (POST)
- Wired via rewrite in `vercel.json`: `/api/audit → /api/entries?resource=audit`
- Consistent with existing dispatch pattern (`delete-entry`, `update-entry`, `entry-brains` all route through `entries.ts`)

**`handleAudit(req, res)` function:**
1. Verify auth + brain access
2. Fetch 25 newest entries: `id, title, content, type, tags, metadata`
3. Call Gemini with `SERVER_PROMPTS.ENTRY_AUDIT` (prompt moved from `src/config/prompts.ts` to `api/_lib/prompts.ts`)
4. Parse response into `AuditFlag[]` — filter out any flags with entryIds not in the fetched set (hallucination guard, same as merge suggestions)
5. For each entry in the batch:
   - If it has flags: PATCH `metadata.audit_flags = [...]` in Supabase
   - If it had no flags from this run: PATCH `metadata.audit_flags = null` (clears stale flags for entries in this batch only — entries outside the batch are untouched until they're edited or included in a future batch)
6. Return `{ flagged: number }`

**`SERVER_PROMPTS.ENTRY_AUDIT`** — identical to the existing client-side `PROMPTS.ENTRY_AUDIT` in `src/config/prompts.ts`. The client-side definition can be removed once the server owns it.

### Frontend

**Auto-run on FeedView mount:**
- Check `audit_run_at:${brainId}` in localStorage
- If < 24h ago: skip — flags are already current in entry metadata
- If stale or missing: POST `/api/audit` in background, parallel with insights fetch
- On success: write `audit_run_at:${brainId} = Date.now()`
- On complete: trigger EntriesContext refresh to pick up new `audit_flags`

**"Consider fixing" section** in FeedView, rendered below merge suggestions:
- Source: `entries.filter(e => e.metadata?.audit_flags?.length > 0)`
- One card per flag (not per entry)
- Ordered: `SENSITIVE_DATA` first, then remaining flags as returned
- Section hidden if no flagged entries

## Flag Data Shape

Stored as `entry.metadata.audit_flags: AuditFlag[]`:

```ts
interface AuditFlag {
  type:
    | "TYPE_MISMATCH" | "PHONE_FOUND" | "EMAIL_FOUND" | "URL_FOUND"
    | "DATE_FOUND"    | "TITLE_POOR"  | "SPLIT_SUGGESTED"
    | "MERGE_SUGGESTED" | "CONTENT_WEAK" | "TAG_SUGGESTED" | "SENSITIVE_DATA";
  field: string;          // e.g. "metadata.phone", "type", "content"
  currentValue: string;
  suggestedValue: string;
  reason: string;         // max 90 chars, from Gemini
}
```

## UI Components

### Card Variants

**Auto-apply** — `PHONE_FOUND`, `EMAIL_FOUND`, `URL_FOUND`, `DATE_FOUND`, `TAG_SUGGESTED`, `SENSITIVE_DATA`
- Shows entry title + reason + suggested value
- "Fix" button: PATCH entry (apply `suggestedValue` to `field`) + remove this flag from `audit_flags`
- "Dismiss" button: remove flag only
- On PATCH success: card disappears, EntriesContext updates entry in-place

**Open-edit** — `TYPE_MISMATCH`, `TITLE_POOR`, `CONTENT_WEAK`
- Shows entry title + reason + what to fix
- "Edit" button: calls `onSelectEntry(entry)` to open detail modal
- "Dismiss" button: remove flag only
- On entry save: `update-entry` clears `audit_flags` automatically (content changed)

**Split** — `SPLIT_SUGGESTED`
- Shows entry title + suggested split description
- "Preview" button: POST `/api/llm` with existing `QA_PARSE` / split prompt → parse response using existing `parseAISplitResponse()` from `src/lib/fileSplitter.ts`
- Inline preview expands showing N proposed entries (title + type each)
- "Confirm Split": POST `/api/capture` × N new entries + DELETE `/api/delete-entry` (original)
- "Cancel": collapses preview, card stays
- On confirm success: original removed from EntriesContext, N new entries added

**Merge** — `MERGE_SUGGESTED`
- Reuses existing merge card JSX (tertiary colour scheme, Ignore/Merge buttons, `pendingMergeAction` flow)
- Audit flag shape differs from `MergeSuggestion` — transform before passing to handlers:
  ```ts
  // AuditFlag (MERGE_SUGGESTED): entryId = entry to keep, suggestedValue = ID to merge in, currentValue = "Title A + Title B"
  const asMergeSuggestion: MergeSuggestion = {
    ids: [flag.entryId, flag.suggestedValue],
    titles: flag.currentValue.split(" + "),
    reason: flag.reason,
  };
  ```
- After transform, existing `handleMerge()` and `handleIgnore()` work unchanged

### Dismiss Behaviour (all card types)

PATCH `/api/update-entry`: splice the specific flag out of `metadata.audit_flags`. If array becomes empty, set to `null`. Card disappears immediately on optimistic update.

## Data Flow

```
FeedView mount
  ├── audit_run_at < 24h → skip
  └── stale/missing → POST /api/audit (background)
        → entries.ts?resource=audit
              → fetch 25 newest entries
              → Gemini ENTRY_AUDIT
              → PATCH audit_flags onto each entry
              → return { flagged: N }
        → write audit_run_at
        → refresh EntriesContext

"Consider fixing" section
  → reads entries with audit_flags from EntriesContext (already loaded)
  → one card per flag

User action
  ├── Auto-apply  → PATCH field + remove flag
  ├── Open-edit   → onSelectEntry() → save clears audit_flags
  ├── Split       → LLM preview → confirm → capture×N + delete original
  ├── Merge       → existing handleMerge() unchanged
  └── Dismiss     → PATCH removes flag from array
```

## Flag Lifecycle

- **Written:** by `/api/audit` run
- **Cleared per flag:** when user fixes or dismisses a specific flag (PATCH removes it from array)
- **Cleared entirely:** when `update-entry` receives a change to `content`, `title`, or `type` — same location where enrichment flags are reset today
- **Re-written:** next audit run (24h later) re-evaluates the entry and writes fresh flags

## Error Handling

| Failure | Behaviour |
|---|---|
| Audit API fails | Silent — section hidden, `audit_run_at` not written (retries next load) |
| Gemini returns invalid JSON | Return `[]` — no flags written, no crash |
| Hallucinated entryId in response | Filtered out before writing (same guard as merge suggestions) |
| Auto-apply PATCH fails | Toast "Couldn't apply fix. Try again." — flag stays |
| Split preview LLM fails | Inline error "Couldn't generate preview. Try again." |
| Split save fails | Toast "Split failed. Try again." — original entry untouched |
| Dismiss PATCH fails | Toast "Couldn't dismiss. Try again." — flag stays visible |

## Testing

- **Unit:** `generateAuditFlags()` — valid Gemini response parses correctly; malformed JSON returns `[]`; hallucinated entryIds filtered out
- **Unit:** `update-entry` clears `audit_flags` when `content`, `title`, or `type` fields change
- **Unit:** auto-apply maps each flag type to the correct metadata field patch
- **Reuse:** `parseAISplitResponse()` in `fileSplitter.ts` already tested — reused as-is for split preview parsing

## Files to Create / Modify

| File | Change |
|---|---|
| `api/entries.ts` | Add `handleAudit()` function, dispatch on `resource=audit` |
| `api/_lib/prompts.ts` | Add `ENTRY_AUDIT` to `SERVER_PROMPTS` |
| `api/vercel.json` or `vercel.json` | Add rewrite `/api/audit → /api/entries?resource=audit` |
| `src/views/FeedView.tsx` | Auto-run logic, "Consider fixing" section, all card variants, action handlers |
| `src/lib/enrichEntry.ts` | No change needed — audit is separate from enrichment |
| `api/entries.ts` (update handler) | Clear `audit_flags` on content/title/type change |
| `src/config/prompts.ts` | Remove `ENTRY_AUDIT` (moved to server) |
