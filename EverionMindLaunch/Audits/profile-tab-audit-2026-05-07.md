# Profile Tab Audit — 2026-05-07

> Settings → "About you". Hosts core scalars (preferred name, full name, pronouns, free-form context, master toggle) plus living-memory persona-fact orchestration (active grouped by bucket, fading, history, not-me). Audits god-component pressure, virtualization, soft-retire UX, history source, optimistic update semantics, undo coverage, and confirm-dialog correctness against the no-OS-native rule.

## Verdict

**Architecture is sane, ergonomics are mostly right.** Single big component, ~2,219 LOC (header comment claims one tab; actual file ends `ProfileTab.tsx:2219`). All persona-fact mutations route through `/api/capture` and `/api/entries` — same pipeline every other entry uses, no parallel persona endpoint. Optimistic state for pin / retire / reject / unreject. ConfirmDialog wraps Radix AlertDialog (`src/components/ConfirmDialog.tsx:14-104`) — no `window.confirm`, no `window.alert`, no `window.prompt` anywhere in this file (`ProfileTab.tsx:1-2219` searched, only one comment match describing what was replaced).

**Three real findings, all medium-or-below**: (a) **F1** — no virtualizer; renders every active fact + every bucket's `<FactRow>` to DOM at once, scroll cost grows linearly with persona-fact count; (b) **F2** — no avatar upload exists at all (claim refuted — neither file picker, blob, Supabase Storage call, image preview, nor any reference to `avatar` / `image` / `upload`), so any spec referencing avatar in ProfileTab is dead text; (c) **F3** — history timeline reads `metadata.retired_at` from each persona entry instead of `audit_log` rows, so retirement events are coupled to the entry surviving — hard-delete kills the timeline. **Three god-component extraction seams** are obvious and ready (`PersonaFactsGrid`, `PersonaPromptDebug`, `PersonaActionsPanel`).

---

## Architecture overview

```
ProfileTab.tsx (2,219 LOC, default-export)
├── useCachedQuery("profile:core") → GET /api/profile          (line 208-215)
├── reloadFacts() → GET /api/entries?type=persona&_t=Date.now() (line 232-259)
├── grouped = useMemo({ active{bucket}, fading[], history[], rejected[] }) (line 324-381)
├── Core scalars panel (preferred_name, full_name, pronouns, context)     (line 745-826)
├── Master toggle + sensitive-data warning                                 (line 709-743)
├── Action panels (gated)
│   ├── needsReset → "Undo previous scan"  (runReset → ConfirmDialog → ops.startTask) (line 836-885)
│   ├── hasExtractedFacts → "Audit"        (line 890-939)
│   ├── hasExtractedFacts → "Wipe"         (line 942-988)
│   └── always → "Scan existing entries"   (line 990-1039)
├── Manual add row (Select bucket + input + Add button)                    (line 1042-1084)
├── Active facts (BUCKET_RENDER_ORDER → CollapsibleSection → FactRow[])    (line 1097-1145)
├── Fading + History + Not-me sections (CollapsibleSection per group)      (line 1149-1263)
├── isAdmin && adminPrefs.showPersonaPromptDebug → <PersonaPromptDebug>    (line 1270-1280)
├── <RejectDialog />                                                       (line 1282-1288)
└── <ConfirmDialog />                                                      (line 1290-1303)

Sub-components defined in same file:
├── FactRow                       (line 1312-1436)  — single fact card
├── RejectDialog                  (line 1446-1575)  — Radix Dialog, chips + freeform
├── CollapsibleSection            (line 1583-1718)  — Radix Accordion wrapper
├── PersonaPromptDebug            (line 1743-2073)  — admin-only extractor inspector
├── DebugBlock / DebugList / DebugRejectedList  (line 2075-2218)
```

Core save path: PUT `/api/profile` (`ProfileTab.tsx:393`), then `invalidateCachedQuery("profile:core")`. Fact mutations: PATCH `/api/entries` (pin/retire/reject/unreject), POST `/api/capture` (manual add), DELETE `/api/delete-entry` (hard purge from history/rejected only).

---

## Section inventory

| Section | LOC range | Renders | State source | Confirm UX | Optimistic |
|---|---|---|---|---|---|
| Master toggle | 709-720 | `SettingsToggle` | `core.enabled` | none (toggle) | n/a |
| Sensitive-data warning | 723-743 | static block | n/a | n/a | n/a |
| Core scalars (name, pronouns, context) | 745-826 | inputs + textarea + Save | `useCachedQuery("profile:core")` | none | no |
| Reset previous scan | 836-885 | Conditional alert + button | `needsReset` from `facts` | `ConfirmDialog` | n/a (background op) |
| Audit living memory | 890-939 | Conditional row + button | `hasExtractedFacts` | `ConfirmDialog` | n/a |
| Wipe extracted facts | 942-988 | Conditional row + button | `hasExtractedFacts` | `ConfirmDialog` (danger) | yes — local filter pre-op |
| Run scan | 990-1039 | always-visible row | `scanning` flag | none | n/a (long op + poll) |
| Manual add fact | 1042-1084 | bucket Select + input + Add | local `newFactText`, `newFactBucket` | none (Enter to submit) | no — awaits POST |
| Active bucket grids (Identity / Family / Habit / Preference / Event / Other) | 1097-1145 | `CollapsibleSection` per bucket → N `FactRow` | `grouped.active[bucket]` | n/a | n/a |
| Fading | 1160-1182 | `CollapsibleSection` (only if non-empty) | `grouped.fading` | none on individual pin | yes (pin restores) |
| History | 1186-1221 | `CollapsibleSection` (always) | `grouped.history` | none on row, ConfirmDialog on hard-delete | yes (retire) |
| Not me | 1225-1261 | `CollapsibleSection` (always) | `grouped.rejected` | RejectDialog (chips) on entry, ConfirmDialog on hard-delete | yes (reject + unreject) |
| `RejectDialog` (modal) | 1446-1575 | Radix Dialog with 5 chips + textarea | local | n/a | n/a |
| `PersonaPromptDebug` (admin) | 1743-2073 | extractor introspection | GET `/api/entries?action=persona-prompt` | none | n/a |

**No identity-photo / avatar section, no email field, no brain selector, no edit-fact UI** (manual add only — once a fact is created the only mutations are pin / retire / reject / hard-delete).

---

## What's solid

- **`ConfirmDialog` swap-in** (`ProfileTab.tsx:1290-1303` + `ConfirmDialog.tsx:14-104`). Body accepts `string | string[]`; renders Radix `AlertDialog` with destructive variant when `danger` is true. Submit button shows `"Working…"` during the async confirm. Supports keyboard escape (Radix default), scrim click, `autoFocus` on the action button. Comment `ProfileTab.tsx:161-172` explicitly calls out: "Replaces window.confirm() with an in-app branded modal." A grep across the file for `window.confirm` / `window.alert` / `window.prompt` returns the comment match only — zero call sites. **Compliant with CLAUDE.md "no OS-native UI" rule.**
- **All persona mutations are optimistic with server reconciliation.**
  - Pin / unpin (`patchFact`, line 535-555): local `setFacts` first, fire-and-forget PATCH, no reload — comment at line 541-546 explicitly explains why (avoids cache-race flip-back).
  - Retire (`retireFact`, line 557-596): optimistic flip to `archived` then PATCH then `reloadFacts()`.
  - Reject (`rejectFact`, line 598-636): optimistic flip then PATCH then reload + auto-distill every 20 rejections.
  - Unreject (`unrejectFact`, line 638-672): rebuilds metadata WITHOUT `rejected_at` / `rejected_reason` keys (not undefined — actually omitted via destructure rest at line 648-653), avoiding the "PostgREST keeps undefined as null in jsonb" trap explicitly documented in the same comment.
  - Wipe (`runWipe`, line 503-533): optimistic local filter — keeps manual + chat-source facts, drops scanner-produced ones BEFORE the background op runs, so user sees immediate result.
- **Cache discipline.** Core profile uses `useCachedQuery("profile:core")` with `invalidateCachedQuery("profile:core")` on save (line 402). Persona facts use cache-bust via unique `_t=Date.now()` query param + `cache: "no-store"` (line 240-243) — the GET endpoint cache (5-min `Cache-Control: max-age=300`) is bypassed for the persona view but kept for everything else, exactly the surgical approach.
- **Defensive client-side type filter** (line 246-251). After fetching `?type=persona`, filters again locally on `r?.type === "persona"` with eslint-disable + comment justifying it: "defensive filter against future endpoint regression that might leak non-persona types." Carries no false-positive cost; pure paranoia tax.
- **Buckets default to collapsed on first load** (line 269-280). `collapseInitialized` gate ensures user toggle state survives subsequent reloads (wipe / scan / audit). Solves the "30 identity facts dump on tab open" problem before it lands.
- **Bucket sort order is correct.** Pinned > confidence-desc > recency-desc (line 360-368). Pinned facts surface even when a low-confidence fact wins on freshness.
- **Master toggle wires through `enabled` flag** which the chat preamble checks server-side. Off = profile not sent on chat call. (Verified by referenced comment line 711-712, server not in scope.)
- **Sensitive-data warning before the textarea** (line 723-743). Calls out ID numbers, passport, banking, medical → "Vault, not here." Right placement, right copy, right colour (ember-wash background, ember accent border).
- **Background-ops integration** (line 190-194). Long-running scan / wipe / reset / audit go through `useBackgroundOps()` — survive tab switch, app close, with global toast. Local `scanning` / `wiping` / `resetting` / `auditing` are read-only mirrors used to disable buttons. Comment at 187-189 documents the migration away from inline busy-state.
- **Auto-distill on every 20 rejections** (line 627-632). Without the user having to remember to hit "Distill now" the rejected_summary stays current as the corpus grows. Fire-and-forget — failures show on next manual run.
- **`unrejectFact` triggers a re-distill** (line 668) so the model isn't taught to keep skipping something the user just restored. Closes the symmetric corner of the rejection-learning loop.
- **`PersonaPromptDebug` re-fetches on `refreshKey` change** (line 1276-1278 + 1782-1785). The key is composed from `id:status:pinned` for every fact, so reject / retire / pin all trigger an admin debug refresh — admin can watch learnings update live.
- **CollapsibleSection is a single primitive** (line 1583-1718) used by **every** group — Identity / Family / Habit / Preference / Event / Other / Fading / History / Not-me. One look, one tap target, one chevron animation curve (`cubic-bezier(.16,1,.3,1)` 200ms), one count badge. Comment at 1577-1581 spells out the consistency intent.
- **Non-existent buckets aren't rendered.** Line 1101-1103 short-circuits `if (!items.length) return null`. No empty "Family & people" header showing 0 — UI shows only buckets the user actually has facts in.

## Findings

### F1 — Persona-facts grid is not virtualized; renders every fact at once

**Severity: MEDIUM** — verified

`ProfileTab.tsx:1100-1125`:

```tsx
{factsLoaded &&
  BUCKET_RENDER_ORDER.map((bucket) => {
    const items = grouped.active[bucket] || [];
    if (!items.length) return null;
    const collapsed = collapsedBuckets.has(bucket);
    return (
      <CollapsibleSection ...>
        {items.map((f) => (
          <FactRow key={f.id} fact={f} ... />
        ))}
      </CollapsibleSection>
    );
  })}
```

Every active fact mounts a `<FactRow>` (line 1312-1436) which is itself a 100+ DOM-node tree per row (icons, badges, source label, optional confidence badge, action buttons). At 200 active facts the tab mounts ~20,000+ DOM nodes plus the same again for fading + history + rejected sections.

**Mitigation present**: buckets default to collapsed (line 269-280), so the user only pays the render cost for buckets they expand. Radix `AccordionPrimitive.Content` uses CSS animation but children still mount on initial render (Radix renders children inside collapsed Accordion items by default unless `forceMount` is `false` — and this code uses `type="single" collapsible` which mounts children, just hides via `data-state`). Confirm: line 1702 `<AccordionPrimitive.Content className="data-open:animate-accordion-down data-closed:animate-accordion-up overflow-hidden">` — children render regardless of state.

So the collapse hides them visually but **does not skip the render**. A 200-fact user pays the full DOM cost on first mount of the tab.

**Repro path**:
1. Brain with 250+ active persona facts.
2. Open Settings → About you.
3. Scroll perf jank, especially on iOS Safari mid-tier device.

**Fix options** (priority order):
- **Conditional render based on `collapsed`** — wrap the `{children}` inside `CollapsibleSection` (line 1703-1713) with `{!collapsed && children}`. Cheap, matches existing collapse semantics, no virtualizer dep. Drops mount cost from O(N) to O(visible). One-line fix.
- **Virtualize per-bucket via `@tanstack/react-virtual`** if a single bucket can exceed ~80 facts. For Christian's brain right now buckets are all under 30, so this is premature.

**Refute side**: Buckets default collapsed, and most users won't have 200 facts on day one. Severity stays MEDIUM not HIGH because the worst case is post-launch power users (Christian himself once 6+ months of capture lands).

### F2 — Avatar upload claim is not real (refuted)

**Severity: NONE** — corrects scope

The audit brief asks: "Avatar upload: which storage (Supabase Storage)? Size cap?"

**Answer**: there is no avatar upload in `ProfileTab.tsx`. Searched the file for `avatar`, `upload`, `image`, `file`, `Storage` — zero matches in user-facing code. The Core panel renders `preferred_name`, `full_name`, `pronouns`, free-form `context` and the master toggle. No image input, no `<input type="file">`, no Supabase Storage SDK import, no blob handling.

If the spec implies an avatar exists, the spec is stale. If avatar is on the roadmap, this audit is the moment to either (a) decide it's out of scope for launch and remove from spec, or (b) carry it as a P2 in `EML/LAUNCH_CHECKLIST.md` with the design constraints (size cap, server-side resize, Storage bucket policy, RLS rules).

**Recommendation**: drop avatar from any persona-tab spec. If wanted, scope as a separate sub-component under a future `<IdentityCard>` extraction (see Refactor pressure below).

### F3 — History timeline reads from `metadata.retired_at`, not `audit_log`

**Severity: LOW** — design choice with one cliff

`ProfileTab.tsx:370-374`:

```ts
out.history.sort((a, b) =>
  (b.metadata?.retired_at || b.updated_at).localeCompare(
    a.metadata?.retired_at || a.updated_at,
  ),
);
```

History timeline is *not* a separate event log. It's the same `entries` table filtered by `metadata.status === "archived"`, sorted by `metadata.retired_at` (the moment retired) falling back to `updated_at`.

**Implications**:
- A "history" entry is the persona entry itself, just flagged. Hard-delete (`deleteFactCompletely`, line 674-695) erases the entry **and** the timeline record at the same time. There is no "the fact 'I lived in Cape Town' was retired on Jan 4" record once the fact itself is purged.
- Retirement metadata is mutable from the row owner via PATCH (already happens on retire). Tampering isn't a worry here — same user owns both — but it does mean the "when" can drift if a future code path overwrites `metadata` without preserving `retired_at`.
- `audit_log` (live since migration 057, per `CLAUDE.md`) currently does not get a row for persona retire / reject / restore events. Source of truth for the timeline is mutable user data.

**Why this is LOW**: the design is intentional and consistent with the rest of the entries pipeline. Reject + restore + retire all live in the entry's own metadata. The trade-off is: if the user hard-deletes a fact from history, that erases the history-of-the-history. That's actually the user's intent — "purge completely" is a stronger ask than "retire."

**Fix path** (defer unless audit-log coverage becomes a launch P0):
- Add `audit_log` rows on `retireFact` / `rejectFact` / `unrejectFact` / `deleteFactCompletely` server-side (in the PATCH/DELETE handler, not client-side). Action codes: `persona.retire`, `persona.reject`, `persona.restore`, `persona.delete`. Resource id = entry id. Metadata = `{ reason, prev_status }`.
- Renders a separate "Activity" section under About-You sourced from audit_log when launched. Out of scope for now.

### F4 — Soft-retire confirms inline via ConfirmDialog (proven)

**Severity: NONE** — finding proven, no fix needed

Verified: `retireFact` (`ProfileTab.tsx:557-596`) sets `confirmRequest` state, which renders `<ConfirmDialog>` at line 1290-1303. ConfirmDialog wraps Radix `AlertDialog` (`ConfirmDialog.tsx:43-104`) with project tokens (`var(--surface-high)`, `var(--line)`, `var(--lift-3)`, `f-serif`).

Body string-array support (`ConfirmDialog.tsx:41` `paragraphs = Array.isArray(body) ? body : [body]`) is used by every persona-tab confirm — they all pass string arrays for the two-paragraph "what / what-not" structure (e.g., line 562-568 retire prompt: title + fact-quote + 'Moves this fact into History — archived but still searchable…').

Submit button is auto-focused (`ConfirmDialog.tsx:94`), confirm-during-submit shows `"Working…"` (line 98), Escape exits via Radix-default keyboard handling, scrim click cancels (line 44 `onOpenChange={(open) => !open && !submitting && onCancel()}`).

**No `window.confirm`. Compliant.**

### F5 — Undo coverage on retire is partial

**Severity: LOW**

After retire, the fact lands in History. From History, the only actions are `onDelete={() => deleteFactCompletely(f.id)}` (line 1217) — there is **no** "Restore from history" action. By contrast, the rejected (Not-me) section has `onUnreject={() => unrejectFact(f.id)}` (line 1256) which restores the fact to active.

**Effect**: a user who retires a fact and changes their mind a minute later cannot un-retire from the UI. They'd have to manually re-add the same fact via the input row. The data is still there (just `status: "archived"`), so the restore path is one PATCH away.

**Fix**: add a "Bring back to active" `IconBtn` in `FactRow` when `historyMode` is true. One handler that mirrors `unrejectFact` shape, flipping `status` from `archived` → `active` and stripping `retired_at` / `retired_reason` via destructure-rest the same way `unrejectFact` does at line 648-653.

```tsx
{historyMode && (
  <IconBtn label="Bring back to active" onClick={onUnretire}>↻</IconBtn>
)}
```

**Severity LOW** because: (a) retire is a deliberate user action with a confirm dialog ("This restores entries… moves this fact into History"); (b) the user *can* re-add the same text manually; (c) the fact is still visible in History so it isn't lost. But the UX cost of "I must retype my own fact" is real, and the data layer already supports the inverse — only the icon is missing.

### F6 — Edit-fact does not exist (refuted with caveat)

**Severity: NONE** — finding refuted

The audit brief asks: "Edit fact: inline or modal? Save semantics?"

**Answer**: there is no edit-fact UI. Manual add (line 1042-1084), pin / unpin, retire, reject, restore-from-rejected, hard-delete — but no "edit the title or content of an existing fact." Once a fact lands, the only mutation surface is the metadata flags.

**Why this is fine for now**: persona facts are short single-sentence statements ("Wakes at 5:30 every weekday"). The natural flow when wrong is reject ("Not me") + add the corrected version, not edit-in-place. The auto-distill rule then teaches the extractor not to re-derive the wrong version.

**Why it might become a finding later**: typo correction. If the scanner produces "Wakes at 5:30 evert weekday" the user has no inline-edit path — they must reject + manually add. P3 polish, not a launch blocker. Carry to backlog.

### F7 — Scroll perf on the "Identity dump" path is OK by-default but exposed under a single toggle

**Severity: LOW** — partial overlap with F1

When all buckets are *expanded* (e.g., user expanded Identity, Family, Habit, Preference, Event, Context all at once on a 200-fact brain), every `<FactRow>` mounts and Radix Accordion does not unmount on collapse (line 1702 — see F1). So the "expanded everything" state is the worst case.

**Mitigation in place**: buckets default to collapsed via line 269-280. `collapseInitialized` gates that to once-per-mount.

**Real risk**: a session where the user expands everything to look around, then leaves the tab open — the next interaction (typing in the manual-add input, hitting Save core) re-renders the whole subtree. State lifts to top (`facts`, `core`) so any parent re-render walks every `<FactRow>`. No `React.memo` on `FactRow` — it'd re-render on every parent change.

**Fix**: `React.memo(FactRow)`. Comparison can be shallow (`fact` is a stable reference per id under optimistic updates that build new objects for the changed row only). Cheap mitigation, no behaviour change.

**Quote** (`ProfileTab.tsx:1312-1330`):

```tsx
function FactRow({
  fact, historyMode, rejectedMode,
  onPin, onRetire, onReject, onUnreject, onDelete,
}: { ... }) {
```

Wrap as `const FactRow = React.memo(function FactRow(...) {...})` and the unchanged rows skip diff entirely.

### F8 — Loading skeleton is text-only ("Loading…")

**Severity: LOW** — UX polish

`ProfileTab.bits.tsx:137-146`:

```tsx
export function Loading() {
  return (
    <p className="f-serif" style={{ fontStyle: "italic", color: "var(--ink-faint)", padding: "16px 0", margin: 0 }}>
      Loading…
    </p>
  );
}
```

Used by `ProfileTab.tsx:704` (`!coreLoaded` → returns `<Loading />`) and `ProfileTab.tsx:1098` (`!factsLoaded`). On a fast connection it flashes for ~200ms; on a slow connection the user stares at an italic word for several seconds with no shape information.

**Fix**: skeleton card outline (3-4 grey rounded rects sized to the bucket header + a few rows), keeps layout stable on render. Same pattern as the timeline view skeleton elsewhere in the codebase.

**Severity LOW** because (a) the data fetches are typically <300ms (`useCachedQuery` cache + the persona endpoint is paginated/fast), (b) the UI doesn't shift much when content arrives — the structural shift is small.

### F9 — Persona-fact dedup heuristic is not surfaced inline

**Severity: LOW** — design observation

The Audit button (`runAudit`, line 484-501) bulk-rejects duplicates server-side. But there is no inline "this fact looks like that fact — merge?" UI in the persona-facts grid. If the scanner extracts "Lives in Pretoria" twice (or "Lives in Pretoria" + "Based in Pretoria"), the user sees both rows side by side and must reject one.

**Why this exists by design**: dedup is hard, false-positive collapses lose information, the Audit button defers it to the LLM with a server-side prompt. The UI deliberately doesn't try to do it on the client.

**Fix path (defer)**: server-side dedup pass on the next scan that maps near-duplicates to a single canonical entry with merged confidence. Out of scope.

---

## Refactor pressure

`ProfileTab.tsx` is 2,219 LOC and renders three distinct concern-clusters. Three clean extraction seams stand out:

### Seam 1: `<PersonaFactsGrid>`
- **Lines**: 1095-1264 (active buckets + fading + history + not-me).
- **Props**: `facts`, `grouped`, `collapsedBuckets`, `onToggleBucket`, `onPin`, `onRetire`, `onReject`, `onUnreject`, `onDelete`, plus `showFading`/`showHistory`/`showRejected` open-state.
- **Why now**: it owns ~170 LOC of JSX + 4 separate Collapsible patterns. Today it depends on 8 of the parent's state slots — already the right shape for a contained component. Lift `setRejectingFact` callback, pass everything else as props.
- **Win**: parent shrinks ~170 LOC, renders only `<PersonaFactsGrid>` + the action panels + the modals. Clearer mental model: "core profile" vs "facts grid" vs "modals."

### Seam 2: `<PersonaPromptDebug>` (already a sub-component, just move to its own file)
- **Lines**: 1721-2073 (sub-component) + 2075-2218 (its three child components `DebugBlock`, `DebugList`, `DebugRejectedList`).
- **Why**: 350+ LOC of admin-only UI that has its own data fetch, its own state, its own distill button, its own Accordion replacement. Zero coupling to the rest of the file beyond `brainId` + `refreshKey`. Move to `src/components/settings/PersonaPromptDebug.tsx`.
- **Win**: bundle splitting. PersonaPromptDebug + Debug helpers only mount for admin users with the `showPersonaPromptDebug` admin pref. Pulling the file out lets vite tree-shake / code-split it cleanly. Also: the 350 LOC stops cluttering the persona-tab grep surface.

### Seam 3: `<PersonaActionsPanel>`
- **Lines**: 836-1039 (Reset / Audit / Wipe / Scan four conditional action rows, each with copy + Button + ops.startTask wiring).
- **Props**: `brainId`, `needsReset`, `hasExtractedFacts`, `scanning`/`wiping`/`resetting`/`auditing`, the four `runX` callbacks.
- **Why**: ~200 LOC of stylistically identical "panel card with copy + button" components. They share a layout pattern (left: title + hint, right: button) that's currently inlined four times with minor color tweaks. Could even become a primitive `<ActionPanel title hint button />` first, then composed.
- **Win**: parent loses 200 LOC, the panels become independently testable, the visual variance (ember vs blood vs ink-faint border colour) becomes prop-driven instead of inline-styled.

### Bonus: extract `<RejectDialog>` and `<CollapsibleSection>` to their own files
- Both are pure components with no parent-coupling — RejectDialog (`line 1446-1575`, 130 LOC) and CollapsibleSection (`line 1583-1718`, 135 LOC) are reusable in other settings tabs. Move to `src/components/settings/`. Smaller wins, but trivial PR.

**Aggregate**: pulling Seams 1 + 2 + 3 + the two bonus extractions drops `ProfileTab.tsx` from 2,219 LOC to roughly **400-450 LOC** — entirely about state orchestration + the four data loaders. That's the size where a senior reviewer can hold the whole file in their head; the current file requires scrolling.

---

## Persona dedup heuristic — surface check

The audit brief asks where the UI surfaces duplicate detection.

**Answer**: only in the bulk-Audit button (line 884-939). No inline merge button on individual rows. No "looks like 2 other facts" hint badge. `<FactRow>` (line 1312-1436) renders `source`, `confidence`, optional `pinned`/`retired_at`/`rejected_at` badges, plus the title — that's the full info surface. No similarity score.

This is consistent with project philosophy ("server does dedup, client surfaces the result"). Carry as backlog: **inline "merge candidates" affordance** if user feedback shows this is felt friction.

---

## Recommendations (priority)

1. **[MEDIUM] F1 + F7** — wrap `<FactRow>` in `React.memo` AND add `{!collapsed && children}` inside `CollapsibleSection.Content`. Two tiny changes, kills the 200-fact mount cost. ~15 min.
2. **[MEDIUM] F5** — add "Bring back to active" `IconBtn` in `FactRow` when `historyMode`. Mirror `unrejectFact` shape; strip `retired_at` / `retired_reason` via destructure-rest. ~25 min.
3. **[MEDIUM] Refactor seam 2** — extract `<PersonaPromptDebug>` + 3 debug helpers to their own file. Code-split admin debug. ~30 min.
4. **[LOW] F8** — replace text-only `<Loading />` with a skeleton-card primitive. Probably already exists in another tab. ~20 min.
5. **[LOW] F2** — drop avatar from persona-tab spec or move to a separate `<IdentityCard>` design ticket. Doc change only.
6. **[LOW] F3** — add server-side `audit_log` writes for persona retire/reject/restore/delete. Defer unless audit-log coverage hits launch P0. ~45 min server-side.
7. **[LOW] Refactor seams 1 + 3** — split out `<PersonaFactsGrid>` and `<PersonaActionsPanel>`. Drops file from 2,219 → ~450 LOC. ~2 hours including the test pass.
8. **[BACKLOG] F6** — inline edit-fact (typo correction). Carry to LAUNCH_CHECKLIST P3.
9. **[BACKLOG] F9** — inline "merge candidates" affordance. Carry to brainstorm.

## Method

- Read `src/components/settings/ProfileTab.tsx` start to end (2,219 LOC, header comment in error claiming a different total).
- Read `src/components/settings/ProfileTab.bits.tsx` (147 LOC, presentational primitives).
- Read `src/components/ConfirmDialog.tsx` (105 LOC, AlertDialog wrapper) to verify CLAUDE.md "no OS-native UI" rule compliance.
- Cross-checked against findings list in audit brief — proved F (ConfirmDialog), F (no `window.confirm`), refuted F (avatar upload, edit-fact), partially refuted F (history-from-audit_log: design uses metadata not audit_log), refined F (virtualization: not present, but mitigated by default-collapse).
- Did not exercise this tab live in the dev build; findings are static-analysis grade. Recommend a real-device test on a brain with 200+ facts before landing F1's `React.memo` + collapsed-render fix to confirm the win is felt.

**Audit kicked off by**: senior-staff-engineer evidence-based audit request 2026-05-07.
