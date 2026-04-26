# UX & Feature Improvements — Design Spec
**Date:** 2026-04-07

## Scope
Mobile touch targets, onboarding re-access, notification test button, embedding provider mismatch warning, per-task model pickers UI, token/cost tracking, bulk operations in VaultView, chat source citations, entry pagination, findConnections isBulkImporting.

---

## 1. Mobile Touch Targets (44px minimum)

**Problem:** Many buttons below 44px tap target.

**Solution:** Add global CSS rule to `src/index.css`:
```css
button, [role="button"] {
  min-height: 44px;
  min-width: 44px;
}
```
Plus audit and fix specific known offenders: undo toast button, type filter chips, brain switcher buttons, onboarding dismiss. Each gets explicit `style={{ minHeight: 44, padding: "0 12px" }}`.

---

## 2. Onboarding Re-Access

**Problem:** `openbrain_onboarded` flag set once, no way back.

**Solution:** In `src/views/SettingsView.tsx`, under a "Help & Onboarding" section:
```
[Restart Onboarding]
```
Button clears `localStorage.removeItem("openbrain_onboarded")` and dispatches a custom event `openbrain:restart-onboarding`. `OpenBrain.tsx` listens and sets `setShowOnboarding(true)`.

---

## 3. Notification Test Button

**Problem:** No way to verify push notifications work after setup.

**Solution:** In `src/components/NotificationSettings.tsx`, next to the "Enable Notifications" toggle, add:
```
[Send test notification]
```
Calls `POST /api/cron/push?action=test` (new action). Handler sends a single test push to the requesting user. Returns `{ sent: true }`. Button shows spinner, then "Sent!" for 3s.

New handler in `api/cron/push.ts`:
```ts
if (action === "test") return handleTest(req, res);
```
`handleTest` requires `verifyAuth` (unlike other cron actions), sends one push to `user.id`.

---

## 4. Embedding Provider Mismatch Warning

**Problem:** Switching embed provider mid-use breaks semantic search (mixed vector spaces).

**Solution:** In `SettingsView`, when user changes `embedProvider`:
1. Count entries that have `embedded_at IS NOT NULL AND embedding_provider != newProvider`.
2. If count > 0, show inline warning:
   > "You have X entries embedded with [old provider]. Switching will make search inconsistent until you re-embed all entries."
   > [Switch anyway] [Re-embed all first] [Cancel]
3. "Re-embed all first" triggers existing `handleReembed()` flow, then saves the new provider.

API endpoint `GET /api/embed?action=count&brain_id=X` — returns `{ total: N, embedded: M, provider: "openai" }`.

---

## 5. Per-Task Model Pickers UI

**Problem:** Data layer (`getModelForTask`, `loadTaskModels`) is done. UI not built.

**Solution:** In `SettingsView`, inside the existing `showAdvanced` collapsible section, add a new sub-section visible only when `provider === "openrouter"`:

```
Advanced: Per-task models
─────────────────────────
Entry capture        [dropdown]
Fill Brain questions [dropdown]  
Image reading        [dropdown — vision models only]
Refine collection    [dropdown]
Brain chat           [dropdown]
```

Each dropdown uses the same OR model list as the global model picker. First option: "Same as global default" (value: null). Vision dropdown filters to models with `modality.includes("image")`.

Each dropdown calls `setModelForTask(task, value === "default" ? null : value)` on change.

Price tier badges displayed inline: `gemini-2.0-flash-exp [Free]`, `gpt-4o [Expensive]`.

```ts
function priceTier(pricing?: { prompt?: string }): { label: string; color: string } {
  const p = parseFloat(pricing?.prompt ?? "1");
  if (p === 0) return { label: "Free", color: "#22c55e" };
  if (p < 0.000001) return { label: "Cheap", color: "#4ECDC4" };
  if (p < 0.000010) return { label: "Normal", color: "#888" };
  return { label: "Expensive", color: "#FF6B35" };
}
```

---

## 6. Token / Cost Tracking

**Problem:** No visibility into AI spend.

**Solution:** 
**`src/lib/usageTracker.ts`** — tracks usage in `localStorage["openbrain_usage"]`:
```ts
interface UsageRecord { date: string; inputTokens: number; outputTokens: number; provider: string; model: string; }
export function recordUsage(params: UsageRecord): void
export function getMonthlyUsage(): { inputTokens: number; outputTokens: number; estimatedUsd: number }
export function clearUsage(): void
```

LLM responses include `usage.input_tokens` and `usage.output_tokens` in Anthropic/OpenAI responses. `src/lib/ai.ts` (or `aiFetch.ts`) reads these from the response JSON and calls `recordUsage`.

**SettingsView:** New "Usage this month" panel:
```
Input tokens:  12,450
Output tokens: 3,200
Est. cost:     $0.04
[Clear history]
```
Cost estimate: simple lookup table per provider/model tier. Label as "estimate" — not billed amount.

---

## 7. Bulk Operations in VaultView

**Problem:** Vault requires one-at-a-time interaction. No multi-select.

**Solution:** When vault is unlocked, add a "Select" mode toggle button.

In select mode:
- Each secret shows a checkbox
- Bottom action bar appears: "[X] selected — [Delete] [Export]"
- Delete: soft-deletes all selected (calls DELETE for each, or batch endpoint)
- Export: downloads JSON of decrypted selected entries (title, content, metadata)

Implementation: `bulkMode: boolean` state, `selectedIds: Set<string>` state in VaultView.

---

## 8. Chat Source Citations

**Problem:** Chat answers aren't traceable. Users can't verify which entries were used.

**Solution:** In `src/lib/chatContext.ts`, update context building:

1. After scoring/retrieving top entries, resolve their outgoing links:
   - For each entry, check `links` array for `from_id === entry.id`
   - Fetch linked entry titles from the loaded entries array (no extra API call)
   - Include: `Related to: [Title A], [Title B]`

2. System prompt addition:
```
When answering, cite sources using [Source: Entry Title] inline.
```

3. Return value includes `usedEntries: Entry[]` so UI can show "Sources used: ..." below the response.

---

## 9. Entry Pagination

**Problem:** Hard-coded `limit=500`. Users with large brains miss older entries.

**Solution:**

**`api/entries.ts`:** Support `cursor` param (last seen `created_at` ISO string):
```
GET /api/entries?brain_id=X&cursor=2025-01-01T00:00:00Z&limit=50
```
Query: `&order=created_at.desc&limit=51` — if 51 results returned, there are more. Return first 50 + `{ nextCursor: results[49].created_at }`.

**Client (`src/OpenBrain.tsx`):** 
- Initial load: first 50 entries
- State: `hasMore: boolean`, `nextCursor: string | null`
- VaultView/SuggestionsView: "Load more" button at bottom — calls `fetchMoreEntries(cursor)`
- Appends to existing entries array

---

## 10. findConnections isBulkImporting Flag

**Problem:** Auto-link fires on every entry during Fill Brain, hammering AI.

**Solution:** Add `isBulkImporting` ref to `QuickCapture` (or wherever `findConnections` is called). Set to `true` at start of bulk Fill Brain, `false` at end. `findConnections` checks: if `isBulkImporting`, skip. After bulk completes, run one pass.

Debounce already present (per PERF-6 comment). Just needs the flag enforcement.

---

## Tests

- `tests/lib/usageTracker.test.ts` — recordUsage accumulates, getMonthlyUsage aggregates, clearUsage resets
- `tests/lib/chatContext-citations.test.ts` — context includes linked entry titles, system prompt has citation instruction
- `tests/api/entries-pagination.test.ts` — cursor param works, nextCursor returned when more exist
- `tests/api/cron-test-push.test.ts` — test action requires auth, sends push to requesting user
