# DetailModal Audit — 2026-05-07

> `src/views/DetailModal.tsx` is the universal entry-detail surface. Opens on tap from Memory grid, Vault grid, Brain feed, Search, Calendar, Trash. Owns: edit form (title/content/type/tags via `useEntryEdit`), vault reveal, share, copy-to-clipboard, save-to-contacts, gmail-ignore, "Keep this" (Important Memory promotion), pin/unpin, vault toggle, move-to-brain, share-to-brains, delete (with 3s confirm), reveal-secret. ~1,590 LOC, 13+ render branches, 12 useState slots, 3 nested modals.

## Verdict

**Architecture works but pressure is high.** Radix Dialog handles focus trap, scroll lock, ESC, ARIA — DetailModal just composes. Edit flow via explicit Save button, no auto-save. Optimistic update + rollback wired in `useEntryActions.handleUpdate`. Server-side audit_log fires on every PATCH (`api/entries.ts:349`) and DELETE (`api/_lib/handlers/entryDelete.ts:44, 59`).

**Eight findings.** Two HIGH, three MEDIUM, three LOW. Top-line risks: (F1) edit form does NOT reload when `entry` prop changes — open modal during background poll = silent overwrite of fresher data on save; (F2) vault reveal trusts session-cached `cryptoKey` with no fresh-PIN re-prompt — once unlocked, every secret in the brain is one tap away; (F3) god-component — 7 distinct concerns in one file, ready to extract into 4 sub-modules.

**No realtime subscription on entries.** `useEntryRealtime` is a 15s poll for enrichment chips only — not for `title`/`content`/`type`. Conflict window: anything 1–60s.

---

## Architecture overview

```
Everion.tsx:1167 <DetailModal entry={selected} onUpdate={handleUpdate} onDelete={handleDelete} ...>
                                  │
                                  ▼
        ┌─────────────────────────────────────────────────────┐
        │ DetailModal (1,590 LOC)                             │
        ├─────────────────────────────────────────────────────┤
        │ • Radix Dialog.Root open                            │
        │ • Header (type chip, time, X)                       │
        │ • Body                                              │
        │   ├─ edit form (title/type/content)                 │
        │   ├─ secret reveal gate                             │
        │   ├─ rendered content (gmail summary preference)    │
        │   ├─ metadata chips (top 8)                         │
        │   ├─ tags / concepts                                │
        │   ├─ Full Content accordion                         │
        │   └─ <EntryQuickActions /> (call/wa/email/snooze…)  │
        │ • "Keep this" inline panel                          │
        │ • Bottom toolbar (pin/vault/move/share/edit)        │
        │ • Bottom strip (save-contact / ignore / delete)     │
        └─────────────────────────────────────────────────────┘
                  │             │             │
                  ▼             ▼             ▼
       useEntryEdit       authFetch      MoveToBrainModal
       (save flow)        ad-hoc         ShareToBrainsModal
                          (LLM, gmail
                           ignore,
                           keep-this)

handleUpdate (useEntryActions:160) → optimistic → /api/update-entry (PATCH)
                                                  → audit_log row
                                                  → rollback on error
                                                  → record learningEngine

handleDelete (useEntryActions:123) → 5s pendingDeleteRef → commitPendingDelete
                                                            ├─ if vault → /api/vault-entries?id=X
                                                            └─ else      → /api/delete-entry (audit_log row)

Vault reveal (DetailModal:823) → if `vaultUnlocked` (cryptoKey present)
                                  → setSecretRevealed(true)
                                  → no fresh-PIN prompt
```

---

## Code-path inventory

| Action | Trigger (DetailModal) | Endpoint | Optimistic | Rollback | Audit-log | Undo wired | Vault-gated |
|---|---|---|---|---|---|---|---|
| Edit title/content/type | `handleSave` :759 → `useEntryEdit:44` | PATCH `/api/update-entry` (alias `/api/entries`) | ✓ (useEntryActions:197) | ✓ (useEntryActions:243) | ✓ entries.ts:349 `entry_update` | ✓ (`type:"update"`, useEntryActions:343) | ✗ (re-encrypt happens client-side if secret) |
| Edit tags | same | same | ✓ | ✓ | ✓ | ✓ | ✗ |
| Pin / unpin | bottom-nav :1306 → `onUpdate(id,{pinned})` | same | ✓ | ✓ | ✓ | ✓ | ✗ |
| Vault toggle (note→secret / secret→note) | bottom-nav :1333 → `onUpdate(id,{type:"secret"\|"note"})` | same | ✓ | ✓ | ✓ entry_update | ✓ | ✗ — **no re-encrypt of content** when promoting note→secret |
| Move-to-brain | :1359 → `<MoveToBrainModal/>` :1568 | external modal | n/a here | n/a here | n/a here | ✗ | ✗ |
| Share-to-brains | :1387 → `<ShareToBrainsModal/>` :1581 | external modal | n/a here | n/a here | n/a here | ✗ | ✗ |
| Soft delete | :1532 → 3s confirm → `onDelete(id)` | DELETE `/api/delete-entry` (or `/api/vault-entries?id=` for secrets) | ✓ (useEntryActions:133) — 5s queue before commit | ✓ (useEntryActions:97) | ✓ entryDelete.ts:59 `entry_delete` (regular only — vault-entries ✗) | ✓ (`type:"delete"`, useEntryActions:337) — but UI `Cmd-Z` not surfaced from modal | ✗ |
| Permanent delete | not in modal | DELETE `?permanent=true` | n/a | n/a | ✓ entryDelete.ts:44 `entry_permanent_delete` | ✗ | ✗ |
| Restore from trash | not in modal | PATCH `?action=restore` | n/a | n/a | ✗ entries.ts:230-258 — **no audit_log** | ✗ | ✗ |
| Reveal secret | :823 button → `setSecretRevealed(true)` | client-only (no endpoint) | n/a | n/a | **✗ no audit row for "secret revealed"** | ✗ | ✓ — gates on `vaultUnlocked` prop only |
| Copy revealed secret | EntryQuickActions:188-201 | clipboard API | n/a | n/a | ✗ | ✗ | ✓ implicit |
| Hide revealed secret | EntryQuickActions:203 | client-only | n/a | n/a | ✗ | n/a | ✓ |
| AI suggest type | :689 `suggestType` → `/api/llm` | POST `/api/llm` | n/a | n/a | n/a | n/a | ✗ |
| Save-to-contacts (vCard) | :1458 `saveToContacts` | client-only blob download | n/a | n/a | ✗ — no PII export audit | n/a | ✗ |
| Ignore future emails | :1483 `handleIgnoreEmail` | POST `/api/gmail?action=ignore` | n/a | n/a | unverified | ✗ | ✗ |
| "Keep this" → Important Memory | :1269 `handleKeepSave` :197 | POST `/api/important-memories` | ✗ | ✗ | unverified server-side | ✗ | client+server block when `isSecret` |
| Mark reminder done / snooze | EntryQuickActions:90 / :103 / :118 → `onUpdate({metadata})` | PATCH `/api/update-entry` | ✓ | ✓ | ✓ entry_update | ✓ | ✗ |
| Idea start / archive | EntryQuickActions:139 / :151 → `onUpdate({metadata})` | same | ✓ | ✓ | ✓ | ✓ | ✗ |
| Document set-renewal | EntryQuickActions:167 → `onReorder(...)` | external flow | n/a | n/a | n/a | n/a | ✗ |
| Share (web share / clipboard) | EntryQuickActions:213 → `useEntryEdit:96` | navigator.share / clipboard | n/a | n/a | ✗ — no share audit | n/a | ✗ when `isSecret` |
| Reorder (supplier) | EntryQuickActions:75 → `onReorder(entry)` | external | n/a | n/a | n/a | n/a | ✗ |

---

## What's solid

- **Radix Dialog ownership** (DetailModal:377-411). Focus trap, scroll lock, ARIA `aria-modal`, ARIA `aria-labelledby` are not hand-rolled. The visually-hidden `<Dialog.Title id="detail-modal-title">` (:429) keeps the label valid even when edit-mode unmounts the visible h2. Radix's portal-mounted overlay (`position:fixed`) stops body scroll on iOS Safari without manual `body { overflow:hidden }` shims.
- **Edit-aware ESC** (:386-394). First ESC exits edit mode via `e.preventDefault()` + `setEditing(false)`; second ESC closes. Same shape on `onPointerDownOutside` and `onInteractOutside` (:395-402) so backdrop tap during edit doesn't bin unsaved changes. Matches the design philosophy — **no native confirm**, no lost work.
- **Focus restored to opener** (:139-146). `triggerRef.current = document.activeElement` at mount; cleanup `triggerRef.current.focus()` on unmount. Closing the modal returns the user to the EntryCard they came from (where the `Enter` keyboard nav lives) — the typical Radix-native focus-restore plus a belt for cases where the opener element re-renders mid-modal.
- **Optimistic update + rollback** (`useEntryActions.handleUpdate:197-251`). `setEntries` and `setSelected` mutate before the network call; on `!res.ok` or thrown error, `previous` snapshot is restored, cache is rewritten, modal `selected` resets, `showError` toast. Equally, `useEntryActions:97` restores on `commitPendingDelete` failure.
- **Soft-delete with 5s commit window** (`useEntryActions:148-154`). `pendingDeleteRef` + `setTimeout(commitPendingDelete, 5000)` gives undo a window before the DELETE actually ships. `setLastAction({type:"delete", entry})` allows `handleUndo` to short-circuit before the network call.
- **Server-side audit_log on every entry mutation**. PATCH handler writes `entry_update` (entries.ts:349). Soft delete writes `entry_delete` (entryDelete.ts:59). Permanent delete writes `entry_permanent_delete` (entryDelete.ts:44). Service-role insert; user reads via RLS (per migration 057).
- **Optimistic rollback on offline path** is **not** rolled back — by design (useEntryActions:204-228). Optimistic state + queued op stay consistent until the server speaks. `showToast("Saved locally — will sync when online")` keeps the user honest.
- **Learning-engine telemetry** (`useEntryActions:288-329`). Every user-initiated edit (TITLE_EDIT, TYPE_MISMATCH, TAG_EDIT, CONTENT_EDIT) writes a `recordDecision` row. Silent updates (enrichment, auto-flag) skip via `options?.silent` so AI noise doesn't pollute the signal.
- **Vault delete dual-routing** (`useEntryActions:84-86`). Type === "secret" → `/api/vault-entries?id=` (the dedicated table). Otherwise → `/api/delete-entry`. The earlier bug ("Deleted but row stays in Vault grid") is comment-documented as fixed, plus a `window.dispatchEvent("everion:entry-deleted")` (useEntryActions:142-146) so `useVaultOps`'s separate state mirror also clears.
- **Memo-frozen "now"** (DetailModal:360). `mountedAt = useState(() => Date.now())` freezes the relative-time anchor at mount — relative-time block (:535-553) doesn't recompute impurely on every render. React-Compiler-clean.
- **Funnel event** (:152-161). `trackFirstInsightViewed` fires once per device when the user opens an entry with AI enrichment present. Empty entries don't count.
- **Vault note→secret server-block** is comment-claimed (`importantMemoriesEnabled && !isSecret`, :1503-1504) — server-side block still needs verification (out of scope, but flagged in F4).
- **Tags display + concept-shape tolerance** (:1069-1116). Concepts can be string OR `{label}` shape — both render. Earlier silent-drop on object-shape concepts is fixed.

## Findings

### F1 — Edit form does NOT sync to fresher `entry` prop changes; save overwrites with stale field state
**Severity: HIGH** — silent data loss

`DetailModal:177-180`:

```tsx
const [editTitle, setEditTitle] = useState(entry.title);
const [editContent, setEditContent] = useState(entry.content ?? "");
const [editType, setEditType] = useState<string>(entry.type);
const [editTags] = useState((entry.tags || []).join(", "));
```

`useState(initial)` only seeds on **first mount**. After mount, `editTitle` is independent of `entry.title`. There is **no `useEffect` that resyncs** these locals when the `entry` prop changes.

**Conflict path that drops data**:
1. User opens entry in DetailModal — `editTitle` seeded from current `entry.title = "Foo"`.
2. Background tick of `useEntryRealtime` (15s, hooks/useEntryRealtime.ts:32) merges fresh server fields into `entries[]` — say enrichment adds an `[ai-summary]` line into `entry.content`. `Everion.tsx:1167` re-renders DetailModal with the fresher `entry` (the parent passes the updated reference because the array changed identity). The visible non-edit body uses `editContent` (:854 `const raw = editContent ?? ""`), which still holds the **old** content.
3. User taps Edit → form is pre-populated with stale `editTitle/editContent` (from mount). They type a small change.
4. User hits Save → `handleSave({editTitle, editContent, editType, editTags})` → PATCH with stale base. The fresher fields the server / enrichment wrote are clobbered.

**Why the read-side is also affected**: `:854 const raw = editContent ?? "";` is used for the rendered body **outside** edit mode too, not just in the form. The rendered preview is therefore frozen at mount-time content even when the entry prop has fresher data. Only `entry.metadata`, `entry.tags`, `entry.concepts`, and the gmail-summary read from `entry.metadata.ai_summary` (:847) update on prop change.

**Same shape applies to**: `editType` (:179), `keepTitle` / `keepSummary` (:192-193).

**Mitigations in place**: very limited. Soft-delete + restore is fine because deletion uses a different path. The 15s realtime poll only writes enrichment-relevant fields (per the comment at hooks/useEntryRealtime.ts:18), not user-editable fields — but a server-side admin tier change or a cross-device edit absolutely could mutate `title`/`content` and the form would still see the stale values.

**Fix**: add a sync effect.

```tsx
const entryRef = useRef(entry);
useEffect(() => {
  // Resync local form state when the entry prop changes AND the user
  // isn't actively editing. If they ARE editing, surface a "this entry
  // changed elsewhere — discard your edits or keep them?" inline panel
  // (per the DESIGN PHILOSOPHY rule — no native confirm).
  if (entryRef.current.id !== entry.id) {
    setEditTitle(entry.title);
    setEditContent(entry.content ?? "");
    setEditType(entry.type);
    entryRef.current = entry;
    return;
  }
  if (!editing) {
    setEditTitle(entry.title);
    setEditContent(entry.content ?? "");
    setEditType(entry.type);
    entryRef.current = entry;
  } else {
    // editing AND content changed under us — show conflict banner
    if (
      entry.title !== entryRef.current.title ||
      entry.content !== entryRef.current.content
    ) {
      setConflictBanner(true);
    }
  }
}, [entry, editing]);
```

The conflict banner is the **last-write-wins-with-warning** posture this audit's "Findings to prove or refute" calls for — currently the modal is **silent last-write-wins**.

### F2 — Vault reveal accepts session-cached `cryptoKey`, no fresh-PIN re-prompt for sensitive entries
**Severity: HIGH** — privacy regression vs. expected vault posture

`DetailModal:819-825`:

```tsx
{vaultUnlocked
  ? "end-to-end encrypted. tap to reveal."
  : "unlock your vault to view this secret."}
{vaultUnlocked && (
  <Button onClick={() => setSecretRevealed(true)}>Reveal content</Button>
)}
```

`vaultUnlocked` is `!!cryptoKey` (Everion.tsx:1174). `cryptoKey` lives in component memory until `lockVault()` is called (useVaultOps:854) or the page reloads. On a phone left unlocked, every secret in the active brain is one tap away — no fresh PIN, no biometric step-up, no audit row.

**What "fresh PIN" would buy**: a second factor on the action that actually exposes plaintext. Even if the device is grabbed unlocked, the secret stays sealed without a fresh PIN entry. RC-style "step-up auth on sensitive actions" is the standard posture here.

**Cross-reference**: vault-unlock-audit F2 (referenced in this audit's "Findings to prove or refute") plans to migrate sessionStorage→IDB for the unlocked-state holder. That work is necessary but **not sufficient** — IDB-backed `cryptoKey` is still a session-cached key. The reveal action itself needs a step-up.

**No "secret revealed" audit_log row** — invisibly successful reads can't be audited later. The dedicated table is at `vault_entries`, but `vault-entries` GETs (server-side decryption never happens — the ciphertext goes to the client). The reveal is a client-side `setState`. Audit_log is impossible without an explicit `POST /api/vault/reveal-acknowledge` endpoint that does no work but stamps the row.

**Fix path**:
1. Add a `requireFreshPin` flag — when on, `onClick` of "Reveal content" gates on a PIN re-prompt panel (inline, not native confirm) that calls `unwrapVaultKeyWithPin` with the entered PIN. Successful unwrap → `setSecretRevealed(true)` + ping a new `POST /api/audit/vault-reveal` endpoint that writes an `audit_log` row with `action: "vault_reveal"`, `resource_id: entry.id`. Defaults: `true` for entries last revealed >5 min ago, `false` within the 5-min window.
2. Even without step-up, add the audit_log ping. **Read-tracking is the table-stakes baseline.**

### F3 — God-component: 7 distinct concerns, 1,590 LOC, ready for 4-module extraction
**Severity: MEDIUM** — refactor pressure

DetailModal owns:

| Concern | Lines (approx) | Should live in |
|---|---|---|
| Modal shell / Radix Dialog plumbing | 376-435, 1565-1588 | stays — this **is** the modal |
| Header (type chip, time, close X) | 444-600 | extract → `<DetailModalHeader>` |
| Title band + content rendering (gmail-aware preference, truncation) | 602-893 | extract → `<EntryContentSection>` |
| Metadata chips renderer | 895-983 | extract → `<EntryMetadataChips>` (already candidate for shared use with EntryCard's mini-chips) |
| Attachment-files notice | 985-1055 | extract → `<EntryAttachmentNotice>` |
| Tags + concepts chips | 1057-1116 | extract → `<EntryChipsRow>` |
| Edit form (title/type/content + AI suggest) | 638-769 | extract → `<EntryEditForm>` (already half-extracted via `useEntryEdit`, but the JSX lives here) |
| Important-memory "Keep this" panel | 1171-1274 | extract → `<KeepThisPanel>` (its own state + handler is a self-contained sub-feature: `keeping`, `keepType`, `keepTitle`, `keepSummary`, `keepBusy`, `keepMsg`, `handleKeepSave` — :191-237) |
| Bottom toolbar (pin/vault/move/share/edit) | 1276-1436 | extract → `<EntryActionToolbar>` |
| Bottom strip (save-contacts / ignore-email / delete) | 1438-1564 | extract → `<EntryContextStrip>` |
| AI type-suggestion logic | 239-280 (`suggestType`) | move to `useEntryEdit` hook OR a `<TypeSelectorWithAI>` component |
| Gmail "ignore" handler | 298-321 (`handleIgnoreEmail`) | move to a `useGmailIgnore` hook (one fetch, one state pair) |
| vCard generator | 323-355 (`saveToContacts`) | already a pure fn — move to `lib/vcard.ts` |

**Concrete top-3 extractions** (highest leverage, lowest risk):

1. **`<KeepThisPanel>`** — fully self-contained. 6 state slots + 1 handler. ~100 LOC out. Zero coupling to DetailModal apart from `entry`, `activeBrain`, `onClose`. Drop-in.
2. **`<EntryActionToolbar>`** — pure render of 5 icon buttons. Props: `{entry, isPinned, isSecret, canWrite, onUpdate, showMoveBrain, onMove, onShare, onEdit}`. ~140 LOC out. Removes the `flex-shrink:0` guard, the `role="toolbar"`, and the per-icon SVG noise from the body file.
3. **`<KeepThisPanel>` + the `<EntryContextStrip>` together** — the bottom of the modal is its own animation surface; pulling both gives `<DetailModal>` a clean three-section composition: header / scroll-body / bottom-stack.

Result: from 1,590 LOC → ~700 LOC core. Each extracted child is independently testable.

### F4 — Vault toggle (`type: "secret" → "note"` and inverse) does not re-encrypt content; downgrade leaves ciphertext readable; upgrade leaves plaintext on the server
**Severity: MEDIUM** — vault-isolation breach

DetailModal:1333:

```tsx
onClick={() => onUpdate(entry.id, { type: isSecret ? "note" : "secret" })}
```

This is a one-field PATCH — only `type`. `useEntryActions:160-194` sees `changes.content === undefined`, so the encrypt-branch (:187-194) does **not** run. The server PATCH goes through with no `content` field, leaving:

- **note → secret**: the row's `content` column stays in plaintext on `entries`. The UI now treats the entry as a secret (vault gate, no embed), but the server holds the plaintext. Anyone with a service-role read sees it. Worse, the row is in `entries`, not `vault_entries` — it's never moved to the dedicated encrypted table.
- **secret → note**: the row's `content` column stays as ciphertext. The UI treats it as a regular note. Renderers see "[encrypted — key mismatch]" sentinel. The row is now searchable / embeddable / brain-feed-eligible with garbled text — and the user has no obvious way to recover the original.

**The toggle is misleading by name**. There's no migration step. Either it should be removed, or it should:
1. For note → secret: encrypt with `cryptoKey`, INSERT into `vault_entries`, DELETE from `entries`.
2. For secret → note: prompt the user with an inline confirm panel ("decrypt this and move out of the vault?"), decrypt with `cryptoKey`, INSERT into `entries`, DELETE from `vault_entries`.

**Server-side block recommendation**: the `entries` PATCH handler (entries.ts:225-260) should reject any payload that sets `type: "secret"` without `content` being supplied — fail closed.

### F5 — Edit save's `handleSave().then(() => setEditing(false))` does not handle reject — failed saves leave user in edit mode with no error visible from this modal
**Severity: MEDIUM** — UX bug

DetailModal:759:

```tsx
onClick={() =>
  handleSave({ editTitle, editContent, editType, editTags }).then(() =>
    setEditing(false),
  )
}
```

`handleSave` calls `onUpdate` (= `useEntryActions.handleUpdate`). On error, `handleUpdate:240-258` rolls back optimistic state, calls `showError(...)` (which is a toast), and **returns** — it does **not** throw. So `.then` always fires, `setEditing(false)` always runs. From the modal's perspective, the save "succeeded" — the form closes, the user sees the rolled-back state with no inline error in the modal itself (only the toast that lives at the app shell).

The user is left with no acknowledgement inside the modal that the save failed. On a flaky network they re-open the form, retype, hit Save, get the same toast off-screen, give up.

**Fix**: change `handleUpdate`'s contract to throw on error (or return a result tuple) and gate `setEditing(false)` on success only. Show inline error in the form area.

### F6 — Soft-delete pendingDelete commits 5s later, but the modal's confirm timeout is 3s — race on tap-then-immediately-tap
**Severity: LOW**

DetailModal:1535-1538:

```tsx
confirmTimerRef.current = setTimeout(
  () => setConfirmingDelete(false),
  3000,
);
```

`useEntryActions:148-154`:

```tsx
const timer = setTimeout(() => {
  if (pendingDeleteRef.current?.id === id) {
    commitPendingDelete();
    setLastAction(null);
  }
}, 5000);
```

These are independent timers. Fine in isolation. But: after `confirmingDelete` reverts at 3s, the `pendingDeleteRef` does NOT exist yet — the user only entered the confirm-state, they didn't commit. So no real race. But if the user double-taps "delete" within 3s, `onDelete(entry.id)` fires, then `pendingDeleteRef` is set, then the modal closes (via `setSelected(null)` inside `handleDelete:147`). Five seconds later the network DELETE fires. If the user navigated away and rapidly tapped Undo in a toast (not currently rendered for delete from DetailModal — see F7), the undo writes are wired, but **the DetailModal does not surface the undo**. The user sees the delete, the modal closes, no undo affordance is in the modal frame.

**Fix**: surface a 5s undo banner from the DetailModal's `onDelete` callback (or rely on a global toast that owns the undo button — currently `useEntryActions.handleUndo` exists but no UI calls it from a delete-from-modal flow).

### F7 — Delete-from-modal has no in-modal undo affordance; the only undo path is `useEntryActions.handleUndo`, which no UI surface invokes from this flow
**Severity: LOW** — UX gap

`useEntryActions:335-363` defines `handleUndo`. It's exported in the hook's return at :381. Search for callers from DetailModal: none. The deleted-entry toast (if any) is not surfaced here. Once `setSelected(null)` runs at useEntryActions:147, the modal unmounts; the only undo window is the 5s before `commitPendingDelete` ships, and the user has no UI to act on it during that window.

**Fix**: pipe `handleUndo` into a global "Deleted — undo (5s)" banner. Reuses the same `BackgroundTaskToast` slot that's already mounted (Everion.tsx:1183).

### F8 — Restore-from-trash PATCH `?action=restore` does not write `audit_log`
**Severity: LOW**

`api/entries.ts:230-258` handles restore. There is no `audit_log` insert in this branch — only the PATCH that nulls `deleted_at`. Compare to the soft-delete path (entryDelete.ts:59) which does write the row. Trash restore should be an audited action: a deleted entry coming back into circulation is a security-relevant state change.

**Fix**: insert `entry_restore` audit row mirroring entries.ts:349's pattern.

---

## Refactor pressure summary

| Sub-module | Self-contained? | Lines | Test surface |
|---|---|---|---|
| `<KeepThisPanel>` | ✓ | ~100 | inline panel + POST important-memories |
| `<EntryActionToolbar>` | ✓ | ~140 | render 5 buttons, conditionally show move/share |
| `<EntryContextStrip>` | partial — needs `isContact / isGmailEntry / canWrite / importantMemoriesEnabled` flags | ~120 | conditional buttons, delete confirm flow |
| `<EntryEditForm>` | ✓ once `useEntryEdit` is the single owner | ~150 | edit fields + AI-suggest |
| `<EntrySecretGate>` | ✓ | ~30 | reveal button gating |
| `<EntryContentSection>` | dependency on `editing/showFullText/editContent` | ~80 | gmail-aware preference + truncation |
| `<EntryMetadataChips>` | ✓ pure render | ~90 | top-8 picker, link types |

Net: **4 high-confidence extractions** (`KeepThisPanel`, `EntryActionToolbar`, `EntryContentSection`, `EntryEditForm`) that drop ~470 LOC out of DetailModal with zero behaviour change. Two more (`EntryContextStrip`, `EntrySecretGate`) need light prop plumbing but are also clean. The remaining shell (header + body+scroll-body container + Radix Dialog wiring) lands at ~700 LOC — sane.

---

## Findings — prove / refute table

| Claim | Verdict | Evidence |
|---|---|---|
| Every mutation has undo OR explicit "no undo" | **partial** — undo wired in `useEntryActions:335-363`, but **no UI surface from the modal calls it** for deletes (F7) | useEntryActions:381, no caller from DetailModal |
| ESC with unsaved changes prompts confirm | **partial** — first ESC exits edit mode, **no confirm panel** for typed-but-unsaved changes (per design philosophy, this would be inline, not native — currently absent) | DetailModal:386-394 |
| Vault entries require fresh PIN OR cached vault session | **failed** — accepts cached `cryptoKey` only; no fresh PIN, no audit_log on reveal | DetailModal:823-825, useVaultOps:854 |
| Focus trap engaged + restored | **passed** — Radix Dialog handles trap; explicit `triggerRef` restoration on close | DetailModal:139-146 + Radix |
| Realtime conflict — last-write-wins with banner, NOT silent overwrite | **failed** — silent last-write-wins; edit form locals never resync to fresher prop | DetailModal:177-180 (no resync effect), F1 |
| Optimistic updates rollback on 4xx/5xx | **passed** | useEntryActions:243-251 |
| Audit_log fires server-side from every mutation | **partial** — entry_update ✓, entry_delete ✓, entry_permanent_delete ✓, **entry_restore ✗** (F8), **vault_reveal ✗** (F2) | entries.ts:349, entryDelete.ts:44, :59 |
| God-component: ≥3 candidate sub-modules | **passed** — 4 high-confidence extractions, 6+ candidates | F3 |

---

## Recommendations (priority)

1. **[HIGH] F1** — add `useEffect([entry, editing])` to resync `editTitle/editContent/editType` when the prop changes and the user isn't editing; show conflict banner if they are. ~25 lines + a small inline panel. Fixes silent overwrite. **Pre-launch blocker.**
2. **[HIGH] F2** — fresh-PIN gate on `setSecretRevealed(true)` for entries last revealed >5 min ago. Pair with `POST /api/audit/vault-reveal` (no work, just stamps audit_log). ~80 lines client + 30 lines new endpoint. **Pre-launch blocker for security posture.**
3. **[MEDIUM] F4** — vault toggle either re-encrypts and migrates between `entries` ↔ `vault_entries`, or is removed. The current behavior is broken. Server-side fail-closed if `type: "secret"` PATCH lacks ciphertext.
4. **[MEDIUM] F5** — change `handleUpdate` contract to throw on error so `setEditing(false)` only fires on success. Alternative: return a result type (`{ ok: boolean, error?: string }`).
5. **[MEDIUM] F3** — extract `<KeepThisPanel>`, `<EntryActionToolbar>`, `<EntryContentSection>`, `<EntryEditForm>` (in that order — riskiest last). Each is ~30-min PR. **Post-launch refactor**, not pre-launch blocker.
6. **[LOW] F7** — wire the existing `handleUndo` into a global toast for delete-from-modal. ~30 lines.
7. **[LOW] F8** — add `audit_log` insert for `?action=restore` in entries.ts handler. ~10 lines.
8. **[LOW] F6** — align the 3s confirm window with the 5s commit window OR add an in-modal undo banner.

---

## Method

- Read `src/views/DetailModal.tsx` end-to-end (1-1590).
- Read `src/hooks/useEntryEdit.ts` (full, 143 LOC) for `handleSave`, `handleShare`.
- Read `src/components/EntryQuickActions.tsx` (full, 230 LOC) for action chips, secret copy, snooze flows.
- Read `src/hooks/useEntryActions.ts` (full, 385 LOC) for `handleUpdate`, `handleDelete`, `handleUndo`, optimistic + rollback.
- Read `src/hooks/useVaultOps.ts` (1-957) for `cryptoKey` lifecycle, `lockVault`, vault-entry add path.
- Read `src/hooks/useEntryRealtime.ts` (1-80) to confirm there is **no** realtime mutation subscription — just a 15s enrichment poll.
- Read `api/_lib/handlers/entryDelete.ts` (full, 80 LOC) — confirms audit_log on soft + permanent delete.
- Read `api/entries.ts:225-385` (PATCH handler) — confirms audit_log on entry_update; absence on entry_restore.
- Cross-checked Everion.tsx:1167-1180 for prop wiring (`entry={selected}`, `vaultUnlocked={!!cryptoKey}`).
- Did **not** exercise live click flows in this audit — relies on code-path tracing. Suggest E2E test (Playwright) for F1 specifically: open modal, mutate entry server-side via direct supabase write, verify the form does NOT clobber fresher fields on save.

**Audit kicked off by**: user request "do the detail-modal audit" on 2026-05-07. ~1,590 LOC, 12 useState slots, 13+ render branches, 3 nested modals.
