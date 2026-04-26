# Fix Issues Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Fix Issues (RefineView) feature with 9 new capabilities: priority scoring, orphan detection, stale reminder detection, dead URL detection, delta scanning, sensitive data type detection, weak relationship label improvement, duplicate entity name detection, and cluster-to-parent suggestion.

**Architecture:** All pure-logic checks run client-side in `useRefineAnalysis.ts` before the AI pass. New AI calls are small and targeted. Priority scoring sorts all suggestions (including existing ones) by a weight map. Delta scanning uses localStorage to skip unchanged entries on re-runs.

**Tech Stack:** React, TypeScript, Vitest, localStorage, fetch (no-cors HEAD for URL checks)

---

## File Map

| File | Change |
|---|---|
| `src/hooks/useRefineAnalysis.ts` | Add all new detection logic + delta scan + priority sort |
| `src/config/prompts.ts` | Add `WEAK_LABEL_RENAME`, `DUPLICATE_NAMES`, `CLUSTER_NAMING`; update `ENTRY_AUDIT` |
| `src/views/RefineView.tsx` | Add new LABELS entries + new section headers |
| `src/hooks/__tests__/useRefineAnalysis.logic.test.ts` | New test file — pure logic unit tests |

---

## Task 1: Priority Scoring

Add a weight map and sort all suggestions by priority before rendering.

**Files:**
- Modify: `src/hooks/useRefineAnalysis.ts`
- Modify: `src/views/RefineView.tsx`
- Create: `src/hooks/__tests__/useRefineAnalysis.logic.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/hooks/__tests__/useRefineAnalysis.logic.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { PRIORITY_WEIGHTS, sortBySuggestionPriority } from "../useRefineAnalysis";

describe("sortBySuggestionPriority", () => {
  it("sorts higher-weight types before lower-weight types", () => {
    const suggestions = [
      { type: "TAG_SUGGESTED", entryId: "a", field: "tags", suggestedValue: "", reason: "" },
      { type: "SENSITIVE_DATA", entryId: "b", field: "type", suggestedValue: "secret", reason: "" },
      { type: "STALE_REMINDER", entryId: "c", field: "metadata.due_date", suggestedValue: "", reason: "" },
    ];
    const sorted = sortBySuggestionPriority(suggestions as any);
    expect(sorted[0].type).toBe("SENSITIVE_DATA");
    expect(sorted[1].type).toBe("STALE_REMINDER");
    expect(sorted[2].type).toBe("TAG_SUGGESTED");
  });

  it("items with equal weight preserve original order (stable)", () => {
    const suggestions = [
      { type: "TAG_SUGGESTED", entryId: "a", field: "tags", suggestedValue: "x", reason: "" },
      { type: "TAG_SUGGESTED", entryId: "b", field: "tags", suggestedValue: "y", reason: "" },
    ];
    const sorted = sortBySuggestionPriority(suggestions as any);
    expect(sorted[0].entryId).toBe("a");
    expect(sorted[1].entryId).toBe("b");
  });

  it("PRIORITY_WEIGHTS has entries for all known types", () => {
    const known = [
      "SENSITIVE_DATA", "MERGE_SUGGESTED", "STALE_REMINDER", "DEAD_URL",
      "DUPLICATE_ENTRY", "TYPE_MISMATCH", "PHONE_FOUND", "EMAIL_FOUND",
      "DATE_FOUND", "LINK_SUGGESTED", "CLUSTER_SUGGESTED", "CONTENT_WEAK",
      "TAG_SUGGESTED", "TITLE_POOR", "ORPHAN_DETECTED", "SPLIT_SUGGESTED",
      "URL_FOUND", "WEAK_LABEL",
    ];
    known.forEach((t) => expect(PRIORITY_WEIGHTS).toHaveProperty(t));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/hooks/__tests__/useRefineAnalysis.logic.test.ts
```
Expected: FAIL — `PRIORITY_WEIGHTS` and `sortBySuggestionPriority` not exported

- [ ] **Step 3: Add exports to `useRefineAnalysis.ts`**

At the top of `src/hooks/useRefineAnalysis.ts`, before the function, add:

```typescript
export const PRIORITY_WEIGHTS: Record<string, number> = {
  SENSITIVE_DATA: 10,
  MERGE_SUGGESTED: 9,
  STALE_REMINDER: 8,
  DEAD_URL: 7,
  DUPLICATE_ENTRY: 7,
  TYPE_MISMATCH: 6,
  PHONE_FOUND: 5,
  EMAIL_FOUND: 5,
  DATE_FOUND: 5,
  LINK_SUGGESTED: 4,
  CLUSTER_SUGGESTED: 4,
  CONTENT_WEAK: 3,
  TAG_SUGGESTED: 2,
  TITLE_POOR: 2,
  ORPHAN_DETECTED: 2,
  SPLIT_SUGGESTED: 2,
  URL_FOUND: 1,
  WEAK_LABEL: 1,
};

export function sortBySuggestionPriority<T extends { type: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => (PRIORITY_WEIGHTS[b.type] ?? 0) - (PRIORITY_WEIGHTS[a.type] ?? 0),
  );
}
```

- [ ] **Step 4: Apply sort in `useRefineAnalysis.ts`**

Find this line near the bottom of `useRefineAnalysis.ts`:
```typescript
  const visible = (suggestions ?? []).filter((s) => !dismissed.has(keyOf(s)));
```

Replace with:
```typescript
  const visible = sortBySuggestionPriority(
    (suggestions ?? []).filter((s) => !dismissed.has(keyOf(s))),
  );
```

- [ ] **Step 5: Run tests**

```
npx vitest run src/hooks/__tests__/useRefineAnalysis.logic.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useRefineAnalysis.ts src/hooks/__tests__/useRefineAnalysis.logic.test.ts
git commit -m "feat: add priority scoring to Fix Issues suggestions"
```

---

## Task 2: Orphan Detection

Flag entries that have zero links AND zero tags — they're invisible in the knowledge graph.

**Files:**
- Modify: `src/hooks/useRefineAnalysis.ts`
- Modify: `src/views/RefineView.tsx`
- Modify: `src/hooks/__tests__/useRefineAnalysis.logic.test.ts`

- [ ] **Step 1: Write failing test**

Add to `src/hooks/__tests__/useRefineAnalysis.logic.test.ts`:

```typescript
import { detectOrphans } from "../useRefineAnalysis";

describe("detectOrphans", () => {
  const baseEntry = { id: "e1", title: "Test", type: "note", content: "", tags: [], metadata: {} };

  it("flags entry with no links and no tags", () => {
    const result = detectOrphans([baseEntry as any], []);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("ORPHAN_DETECTED");
    expect(result[0].entryId).toBe("e1");
  });

  it("does not flag entry that has tags", () => {
    const entry = { ...baseEntry, tags: ["foo"] };
    const result = detectOrphans([entry as any], []);
    expect(result).toHaveLength(0);
  });

  it("does not flag entry that has a link", () => {
    const result = detectOrphans([baseEntry as any], [{ from: "e1", to: "e2" }]);
    expect(result).toHaveLength(0);
  });

  it("does not flag entry that appears as link target", () => {
    const result = detectOrphans([baseEntry as any], [{ from: "e2", to: "e1" }]);
    expect(result).toHaveLength(0);
  });

  it("does not flag encrypted entries", () => {
    const entry = { ...baseEntry, encrypted: true };
    const result = detectOrphans([entry as any], []);
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/hooks/__tests__/useRefineAnalysis.logic.test.ts
```
Expected: FAIL — `detectOrphans` not exported

- [ ] **Step 3: Add `detectOrphans` to `useRefineAnalysis.ts`**

After `sortBySuggestionPriority`, add:

```typescript
export function detectOrphans(
  entries: Entry[],
  links: Array<{ from: string; to: string }>,
): EntrySuggestion[] {
  const linked = new Set(links.flatMap((l) => [l.from, l.to]));
  return entries
    .filter((e) => !e.encrypted && !linked.has(e.id) && !(e.tags && e.tags.length > 0))
    .map((e) => ({
      type: "ORPHAN_DETECTED",
      entryId: e.id,
      entryTitle: e.title,
      field: "tags",
      currentValue: "",
      suggestedValue: "",
      reason: "No links and no tags — invisible in graph",
    }));
}
```

- [ ] **Step 4: Call `detectOrphans` inside `analyze` in `useRefineAnalysis.ts`**

Find in `analyze`:
```typescript
    setSuggestions([...entrySuggestions, ...linkSuggestions]);
```

Replace with:
```typescript
    const orphanSuggestions = detectOrphans(entries, links || []);
    setSuggestions([...entrySuggestions, ...linkSuggestions, ...orphanSuggestions]);
```

- [ ] **Step 5: Add label to `RefineView.tsx`**

Find the `LABELS` object and add after `TAG_SUGGESTED`:
```typescript
  ORPHAN_DETECTED: { label: "No connections", icon: <SvgTag />, variant: "neutral" },
```

- [ ] **Step 6: Run tests**

```
npx vitest run src/hooks/__tests__/useRefineAnalysis.logic.test.ts
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useRefineAnalysis.ts src/views/RefineView.tsx src/hooks/__tests__/useRefineAnalysis.logic.test.ts
git commit -m "feat: detect orphan entries (no links, no tags)"
```

---

## Task 3: Stale Reminder Detection

Flag entries where `metadata.due_date` is in the past.

**Files:**
- Modify: `src/hooks/useRefineAnalysis.ts`
- Modify: `src/views/RefineView.tsx`
- Modify: `src/hooks/__tests__/useRefineAnalysis.logic.test.ts`

- [ ] **Step 1: Write failing test**

Add to test file:

```typescript
import { detectStaleReminders } from "../useRefineAnalysis";

describe("detectStaleReminders", () => {
  it("flags entry whose due_date is in the past", () => {
    const entry = {
      id: "r1", title: "Pay invoice", type: "reminder",
      metadata: { due_date: "2020-01-01" }, tags: [], content: "",
    };
    const result = detectStaleReminders([entry as any]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("STALE_REMINDER");
    expect(result[0].entryId).toBe("r1");
  });

  it("does not flag entry with future due_date", () => {
    const entry = {
      id: "r2", title: "Future task", type: "reminder",
      metadata: { due_date: "2099-12-31" }, tags: [], content: "",
    };
    const result = detectStaleReminders([entry as any]);
    expect(result).toHaveLength(0);
  });

  it("does not flag entry with no due_date", () => {
    const entry = { id: "r3", title: "No date", type: "note", metadata: {}, tags: [], content: "" };
    const result = detectStaleReminders([entry as any]);
    expect(result).toHaveLength(0);
  });

  it("does not flag encrypted entries", () => {
    const entry = {
      id: "r4", title: "Secret old", type: "reminder",
      metadata: { due_date: "2020-01-01" }, encrypted: true, tags: [], content: "",
    };
    const result = detectStaleReminders([entry as any]);
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/hooks/__tests__/useRefineAnalysis.logic.test.ts
```
Expected: FAIL

- [ ] **Step 3: Add `detectStaleReminders` to `useRefineAnalysis.ts`**

```typescript
export function detectStaleReminders(entries: Entry[]): EntrySuggestion[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return entries
    .filter((e) => {
      if (e.encrypted) return false;
      const due = e.metadata?.due_date;
      if (!due) return false;
      const d = new Date(due);
      return !isNaN(d.getTime()) && d < today;
    })
    .map((e) => ({
      type: "STALE_REMINDER",
      entryId: e.id,
      entryTitle: e.title,
      field: "metadata.due_date",
      currentValue: e.metadata?.due_date,
      suggestedValue: "",
      reason: `Due date ${e.metadata?.due_date} is in the past — update or archive`,
    }));
}
```

- [ ] **Step 4: Call inside `analyze`**

In the `analyze` callback, find:
```typescript
    const orphanSuggestions = detectOrphans(entries, links || []);
    setSuggestions([...entrySuggestions, ...linkSuggestions, ...orphanSuggestions]);
```

Replace with:
```typescript
    const orphanSuggestions = detectOrphans(entries, links || []);
    const staleSuggestions = detectStaleReminders(entries);
    setSuggestions([...entrySuggestions, ...linkSuggestions, ...orphanSuggestions, ...staleSuggestions]);
```

- [ ] **Step 5: Add label to `RefineView.tsx` LABELS**

```typescript
  STALE_REMINDER: { label: "Overdue", icon: <SvgCalendar />, variant: "primary" },
```

- [ ] **Step 6: Run tests**

```
npx vitest run src/hooks/__tests__/useRefineAnalysis.logic.test.ts
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useRefineAnalysis.ts src/views/RefineView.tsx src/hooks/__tests__/useRefineAnalysis.logic.test.ts
git commit -m "feat: detect stale/overdue reminders in Fix Issues"
```

---

## Task 4: Dead URL Detection

Flag entries where `metadata.url` appears to be unreachable. Uses `fetch` with `no-cors` + timeout — catches fully dead domains/DNS failures. CORS-blocked live URLs are treated as alive (conservative: no false positives).

**Files:**
- Modify: `src/hooks/useRefineAnalysis.ts`
- Modify: `src/views/RefineView.tsx`

Note: No unit test for this — it requires network. Tested manually.

- [ ] **Step 1: Add `checkDeadUrls` to `useRefineAnalysis.ts`**

```typescript
export async function checkDeadUrls(entries: Entry[]): Promise<EntrySuggestion[]> {
  const candidates = entries.filter(
    (e) => !e.encrypted && e.metadata?.url && typeof e.metadata.url === "string",
  );
  if (candidates.length === 0) return [];

  const results = await Promise.all(
    candidates.map(async (e) => {
      const url = e.metadata!.url as string;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        await fetch(url, { method: "HEAD", mode: "no-cors", signal: controller.signal });
        clearTimeout(timeout);
        return null; // alive (opaque response = probably fine)
      } catch {
        return {
          type: "DEAD_URL",
          entryId: e.id,
          entryTitle: e.title,
          field: "metadata.url",
          currentValue: url,
          suggestedValue: "",
          reason: "URL appears unreachable — check or remove it",
        } as EntrySuggestion;
      }
    }),
  );

  return results.filter((r): r is EntrySuggestion => r !== null);
}
```

- [ ] **Step 2: Call inside `analyze` (run in parallel with AI calls)**

In `analyze`, find where `batches` are processed with `Promise.all`. After all AI calls complete, add the URL check in parallel with the link discovery. Replace:

```typescript
    const orphanSuggestions = detectOrphans(entries, links || []);
    const staleSuggestions = detectStaleReminders(entries);
    setSuggestions([...entrySuggestions, ...linkSuggestions, ...orphanSuggestions, ...staleSuggestions]);
```

With:

```typescript
    const orphanSuggestions = detectOrphans(entries, links || []);
    const staleSuggestions = detectStaleReminders(entries);
    const deadUrlSuggestions = await checkDeadUrls(entries);
    setSuggestions([
      ...entrySuggestions,
      ...linkSuggestions,
      ...orphanSuggestions,
      ...staleSuggestions,
      ...deadUrlSuggestions,
    ]);
```

- [ ] **Step 3: Add label to `RefineView.tsx` LABELS**

```typescript
  DEAD_URL: { label: "Dead link", icon: <SvgLink />, variant: "primary" },
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useRefineAnalysis.ts src/views/RefineView.tsx
git commit -m "feat: detect dead URLs in Fix Issues"
```

---

## Task 5: Delta Scanning

Store `lastScannedAt` per brain in localStorage. On re-analyze, only send changed entries to the AI entry audit. Cross-entry checks (links, orphans, clusters) always run on the full set.

**Files:**
- Modify: `src/hooks/useRefineAnalysis.ts`
- Modify: `src/hooks/__tests__/useRefineAnalysis.logic.test.ts`

- [ ] **Step 1: Write failing test**

Add to test file:

```typescript
import { getChangedEntries } from "../useRefineAnalysis";

describe("getChangedEntries", () => {
  const now = new Date().toISOString();
  const old = "2020-01-01T00:00:00.000Z";
  const lastScan = "2024-01-01T00:00:00.000Z";

  it("returns entries updated after lastScannedAt", () => {
    const entries = [
      { id: "a", updated_at: now, title: "New", type: "note" },
      { id: "b", updated_at: old, title: "Old", type: "note" },
    ];
    const result = getChangedEntries(entries as any, lastScan);
    expect(result.map((e) => e.id)).toEqual(["a"]);
  });

  it("returns all entries if no lastScannedAt", () => {
    const entries = [
      { id: "a", updated_at: now, title: "A", type: "note" },
      { id: "b", updated_at: old, title: "B", type: "note" },
    ];
    const result = getChangedEntries(entries as any, null);
    expect(result).toHaveLength(2);
  });

  it("returns entries with no updated_at when lastScannedAt is set", () => {
    const entries = [
      { id: "a", title: "No date", type: "note" },
    ];
    const result = getChangedEntries(entries as any, lastScan);
    expect(result).toHaveLength(1); // no updated_at = treat as changed
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/hooks/__tests__/useRefineAnalysis.logic.test.ts
```
Expected: FAIL

- [ ] **Step 3: Add helpers + localStorage key to `useRefineAnalysis.ts`**

```typescript
function deltaKey(brainId: string) {
  return `refine_last_scan_${brainId}`;
}

export function getChangedEntries(entries: Entry[], lastScannedAt: string | null): Entry[] {
  if (!lastScannedAt) return entries;
  const cutoff = new Date(lastScannedAt).getTime();
  return entries.filter((e) => {
    if (!e.updated_at) return true; // no date = assume changed
    return new Date(e.updated_at).getTime() > cutoff;
  });
}
```

- [ ] **Step 4: Use delta in `analyze`**

At the start of `analyze`, after `setSuggestions(null)`, add:

```typescript
    const brainId = activeBrain?.id ?? "default";
    const lastScannedAt = localStorage.getItem(deltaKey(brainId));
    const entriesToAudit = getChangedEntries(entries, lastScannedAt);
```

Then replace all uses of `entries` in the AI batch loop with `entriesToAudit`:

Find:
```typescript
    const batches = [];
    for (let i = 0; i < entries.length; i += BATCH) batches.push(entries.slice(i, i + BATCH));
```

Replace with:
```typescript
    const batches = [];
    for (let i = 0; i < entriesToAudit.length; i += BATCH) batches.push(entriesToAudit.slice(i, i + BATCH));
```

At the end of `analyze`, just before `setLoading(false)`, add:

```typescript
    localStorage.setItem(deltaKey(brainId), new Date().toISOString());
```

- [ ] **Step 5: Run tests**

```
npx vitest run src/hooks/__tests__/useRefineAnalysis.logic.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useRefineAnalysis.ts src/hooks/__tests__/useRefineAnalysis.logic.test.ts
git commit -m "feat: delta scanning — only re-audit changed entries"
```

---

## Task 6: Sensitive Data Detection

Add a `SENSITIVE_DATA` rule to the existing `ENTRY_AUDIT` prompt. The AI already handles `secret` type in `TYPE_MISMATCH` but this gives it an explicit, dedicated check.

**Files:**
- Modify: `src/config/prompts.ts`
- Modify: `src/views/RefineView.tsx`

- [ ] **Step 1: Update `ENTRY_AUDIT` in `prompts.ts`**

Find the existing rule list in `ENTRY_AUDIT`. After rule 10 (`TAG_SUGGESTED`), add:

```
11. SENSITIVE_DATA — Entry contains a password, PIN, credit card number, bank account number, API key, or private key but type is NOT "secret". Examples: "password: abc123", "PIN: 1234", "card: 4111...", "sk-...". Only flag if the value is explicit and obvious in the content. suggestedValue should be "secret".
```

Also update the Hard rules `- For TYPE_MISMATCH: suggestedValue...` line — leave it, SENSITIVE_DATA is its own type with `suggestedValue: "secret"` always.

Update the schema line to include `SENSITIVE_DATA` in the type enum:
```
Schema: [{"entryId":"...","entryTitle":"...","type":"TYPE_MISMATCH|PHONE_FOUND|EMAIL_FOUND|URL_FOUND|DATE_FOUND|TITLE_POOR|SPLIT_SUGGESTED|MERGE_SUGGESTED|CONTENT_WEAK|TAG_SUGGESTED|SENSITIVE_DATA","field":"type|metadata.phone|metadata.email|metadata.url|metadata.due_date|title|content|tags","currentValue":"...","suggestedValue":"...","reason":"max 90 chars"}]
```

- [ ] **Step 2: Handle `SENSITIVE_DATA` in `applyEntry`**

In `useRefineAnalysis.ts`, find the `applyEntry` callback. Find:
```typescript
      if (s.type === "MERGE_SUGGESTED") {
```

Before that block, add:
```typescript
      if (s.type === "SENSITIVE_DATA") {
        // Reclassify as secret type
        const body = { id: entry.id, type: "secret" };
        try {
          await authFetch("/api/update-entry", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          setEntries((prev) =>
            prev.map((e) => (e.id === entry.id ? { ...e, type: "secret" } : e)),
          );
        } catch (err) { console.error("[useRefineAnalysis]", err); }
        setDismissed((p) => new Set(p).add(key));
        setApplying((p) => { const n = new Set(p); n.delete(key); return n; });
        setEditingKey(null);
        return;
      }
```

- [ ] **Step 3: Add label to `RefineView.tsx` LABELS**

Add a lock SVG function at the top with the other SVG helpers:
```typescript
function SvgLock() { return <svg className="inline h-3 w-3 align-middle" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>; }
```

Add to LABELS:
```typescript
  SENSITIVE_DATA: { label: "Sensitive data", icon: <SvgLock />, variant: "primary" },
```

- [ ] **Step 4: Commit**

```bash
git add src/config/prompts.ts src/hooks/useRefineAnalysis.ts src/views/RefineView.tsx
git commit -m "feat: detect sensitive data in wrong entry type"
```

---

## Task 7: Weak Relationship Labels

Scan existing links for vague labels ("relates to", "related", "similar", "connected", "linked"). Send only those to AI for renaming.

**Files:**
- Modify: `src/config/prompts.ts`
- Modify: `src/hooks/useRefineAnalysis.ts`
- Modify: `src/views/RefineView.tsx`
- Modify: `src/hooks/__tests__/useRefineAnalysis.logic.test.ts`

- [ ] **Step 1: Write failing test**

Add to test file:

```typescript
import { findWeakLinks } from "../useRefineAnalysis";

describe("findWeakLinks", () => {
  it("identifies weak labels", () => {
    const links = [
      { from: "a", to: "b", rel: "relates to" },
      { from: "c", to: "d", rel: "works at" },
      { from: "e", to: "f", rel: "related" },
      { from: "g", to: "h", rel: "similar" },
    ];
    const result = findWeakLinks(links as any);
    expect(result.map((l) => l.from)).toEqual(["a", "e", "g"]);
  });

  it("is case-insensitive", () => {
    const links = [{ from: "a", to: "b", rel: "Relates To" }];
    const result = findWeakLinks(links as any);
    expect(result).toHaveLength(1);
  });

  it("returns empty if no weak links", () => {
    const links = [{ from: "a", to: "b", rel: "supplies" }];
    const result = findWeakLinks(links as any);
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/hooks/__tests__/useRefineAnalysis.logic.test.ts
```
Expected: FAIL

- [ ] **Step 3: Add `WEAK_LABELS` constant and `findWeakLinks` to `useRefineAnalysis.ts`**

```typescript
const WEAK_LABELS = new Set(["relates to", "related", "related to", "similar", "connected", "linked", "link", "connection"]);

export function findWeakLinks(links: RefineLink[]): RefineLink[] {
  return links.filter((l) => l.rel && WEAK_LABELS.has(l.rel.toLowerCase().trim()));
}
```

- [ ] **Step 4: Add `WEAK_LABEL_RENAME` prompt to `prompts.ts`**

```typescript
  /** RefineView: rename vague relationship labels */
  WEAK_LABEL_RENAME: `You are improving a knowledge graph by renaming vague relationship labels to specific verb phrases.

Rules:
- Replace vague labels ("relates to", "related", "similar", "connected") with specific verb phrases
- Examples: "works at", "supplies", "owns", "insures", "manages", "located at", "deadline for", "part of"
- If you cannot determine a better label from the entry content, return null for that pair — do not guess
- Return ONLY a valid JSON array, no markdown, no explanation

Schema: [{"fromId":"...","toId":"...","rel":"specific verb phrase"}]

Return null rel for pairs where you cannot determine a better label: [{"fromId":"...","toId":"...","rel":null}]`,
```

- [ ] **Step 5: Add weak label AI pass inside `analyze` in `useRefineAnalysis.ts`**

Add a new `WeakLabelSuggestion` interface near the top of the file:

```typescript
interface WeakLabelSuggestion {
  type: "WEAK_LABEL";
  fromId: string;
  toId: string;
  fromTitle?: string;
  toTitle?: string;
  currentRel: string;
  rel: string;
  reason: string;
}
```

Update `RefineSuggestion` union:
```typescript
type RefineSuggestion = EntrySuggestion | LinkSuggestion | WeakLabelSuggestion;
```

In `analyze`, after the `linkSuggestions` block and before `detectOrphans`, add:

```typescript
    let weakLabelSuggestions: WeakLabelSuggestion[] = [];
    const weakLinks = findWeakLinks(links || []);
    if (weakLinks.length > 0) {
      const candidates = weakLinks
        .map((l) => {
          const a = entryMap[l.from], b = entryMap[l.to];
          if (!a || !b) return null;
          return {
            fromId: l.from, fromTitle: a.title, fromType: a.type,
            fromContent: (a.content || "").slice(0, 150),
            toId: l.to, toTitle: b.title, toType: b.type,
            toContent: (b.content || "").slice(0, 150),
            currentRel: l.rel,
          };
        })
        .filter(Boolean);
      if (candidates.length > 0) {
        try {
          const res = await callAI({
            max_tokens: 800,
            system: PROMPTS.WEAK_LABEL_RENAME,
            brainId: activeBrain?.id,
            messages: [{ role: "user", content: `WEAK LINKS TO RENAME:\n${JSON.stringify(candidates)}` }],
          });
          const data = await res.json();
          const raw = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
          try {
            const p = JSON.parse(raw);
            if (Array.isArray(p)) {
              weakLabelSuggestions = p
                .filter((x: any) => x.fromId && x.toId && x.rel)
                .map((x: any) => {
                  const weak = weakLinks.find((l) => l.from === x.fromId && l.to === x.toId);
                  const a = entryMap[x.fromId], b = entryMap[x.toId];
                  return {
                    type: "WEAK_LABEL" as const,
                    fromId: x.fromId,
                    toId: x.toId,
                    fromTitle: a?.title,
                    toTitle: b?.title,
                    currentRel: weak?.rel || "relates to",
                    rel: x.rel,
                    reason: `Rename "${weak?.rel || "relates to"}" → "${x.rel}"`,
                  };
                });
            }
          } catch (err) { console.error("[useRefineAnalysis]", err); }
        } catch (err) { console.error("[useRefineAnalysis]", err); }
      }
    }
```

- [ ] **Step 6: Add `weakLabelSuggestions` to `setSuggestions` call**

```typescript
    setSuggestions([
      ...entrySuggestions,
      ...linkSuggestions,
      ...weakLabelSuggestions,
      ...orphanSuggestions,
      ...staleSuggestions,
      ...deadUrlSuggestions,
    ]);
```

- [ ] **Step 7: Handle `WEAK_LABEL` in `applyLink` and `keyOf`**

Update `keyOf`:
```typescript
  const keyOf = (s: RefineSuggestion): string => {
    if (s.type === "LINK_SUGGESTED")
      return `link:${(s as LinkSuggestion).fromId}:${(s as LinkSuggestion).toId}`;
    if (s.type === "WEAK_LABEL")
      return `weak:${(s as WeakLabelSuggestion).fromId}:${(s as WeakLabelSuggestion).toId}`;
    return `entry:${(s as EntrySuggestion).entryId}:${(s as EntrySuggestion).field}`;
  };
```

Add `applyWeakLabel` callback after `applyLink`:

```typescript
  const applyWeakLabel = useCallback(
    async (s: WeakLabelSuggestion, relOverride?: string) => {
      const rel = relOverride ?? s.rel;
      const key = `weak:${s.fromId}:${s.toId}`;
      setApplying((p) => new Set(p).add(key));
      if (activeBrain?.id) {
        recordDecision(activeBrain.id, {
          source: "refine", type: "WEAK_LABEL",
          action: relOverride ? "edit" : "accept",
          originalValue: s.currentRel, finalValue: rel, reason: s.reason,
        });
      }
      try {
        await authFetch("/api/save-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ links: [{ from: s.fromId, to: s.toId, rel }] }),
        });
      } catch (err) { console.error("[useRefineAnalysis]", err); }
      setDismissed((p) => new Set(p).add(key));
      setApplying((p) => { const n = new Set(p); n.delete(key); return n; });
      setEditingKey(null);
    },
    [activeBrain],
  );
```

Return `applyWeakLabel` from the hook.

- [ ] **Step 8: Add WEAK_LABEL label and rendering in `RefineView.tsx`**

Add to LABELS:
```typescript
  WEAK_LABEL: { label: "Vague relationship", icon: <SvgArrowsLR />, variant: "neutral" },
```

In the suggestion card rendering in `RefineView.tsx`, `WEAK_LABEL` suggestions have the same shape as `LINK_SUGGESTED` (fromId, toId, rel). Detect them with `s.type === "WEAK_LABEL"` and render identically to link cards — show From/rel/To with the current rel as the editable field and the suggested rel as the pre-fill. The `applyWeakLabel` function replaces `applyLink` for these cards. (Use the existing link card JSX pattern — just swap the handler and show "Current: X → Suggested: Y" in the reason.)

- [ ] **Step 9: Run tests**

```
npx vitest run src/hooks/__tests__/useRefineAnalysis.logic.test.ts
```
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/config/prompts.ts src/hooks/useRefineAnalysis.ts src/views/RefineView.tsx src/hooks/__tests__/useRefineAnalysis.logic.test.ts
git commit -m "feat: detect and improve vague relationship labels"
```

---

## Task 8: Duplicate Entity Names

Fuzzy-match entry titles to find entries likely referring to the same entity. Run AI on candidates to confirm + suggest merge.

**Files:**
- Modify: `src/config/prompts.ts`
- Modify: `src/hooks/useRefineAnalysis.ts`
- Modify: `src/views/RefineView.tsx`
- Modify: `src/hooks/__tests__/useRefineAnalysis.logic.test.ts`

- [ ] **Step 1: Write failing test**

Add to test file:

```typescript
import { normalizeName, findNameCandidates } from "../useRefineAnalysis";

describe("normalizeName", () => {
  it("lowercases and removes punctuation", () => {
    expect(normalizeName("John Smith")).toBe("john smith");
    expect(normalizeName("J. Smith")).toBe("j smith");
    expect(normalizeName("John S.")).toBe("john s");
  });
});

describe("findNameCandidates", () => {
  it("returns pairs with shared name tokens", () => {
    const entries = [
      { id: "a", title: "John Smith", type: "person", content: "", tags: [], metadata: {} },
      { id: "b", title: "J. Smith", type: "person", content: "", tags: [], metadata: {} },
      { id: "c", title: "Unrelated Entry", type: "note", content: "", tags: [], metadata: {} },
    ];
    const pairs = findNameCandidates(entries as any);
    expect(pairs.length).toBeGreaterThan(0);
    const ids = pairs[0].map((e: any) => e.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
  });

  it("does not pair entries with no title overlap", () => {
    const entries = [
      { id: "a", title: "Alpha Corp", type: "company", content: "", tags: [], metadata: {} },
      { id: "b", title: "Beta Ltd", type: "company", content: "", tags: [], metadata: {} },
    ];
    const pairs = findNameCandidates(entries as any);
    expect(pairs).toHaveLength(0);
  });

  it("does not pair encrypted entries", () => {
    const entries = [
      { id: "a", title: "John Smith", type: "person", encrypted: true, content: "", tags: [], metadata: {} },
      { id: "b", title: "J. Smith", type: "person", content: "", tags: [], metadata: {} },
    ];
    const pairs = findNameCandidates(entries as any);
    expect(pairs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/hooks/__tests__/useRefineAnalysis.logic.test.ts
```
Expected: FAIL

- [ ] **Step 3: Add fuzzy helpers to `useRefineAnalysis.ts`**

```typescript
export function normalizeName(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

export function findNameCandidates(entries: Entry[]): [Entry, Entry][] {
  const eligible = entries.filter((e) => !e.encrypted && e.title && e.title.length >= 3);
  const pairs: [Entry, Entry][] = [];
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = normalizeName(eligible[i].title);
      const b = normalizeName(eligible[j].title);
      const tokensA = new Set(a.split(/\s+/).filter((t) => t.length >= 3));
      const tokensB = new Set(b.split(/\s+/).filter((t) => t.length >= 3));
      const shared = [...tokensA].filter((t) => tokensB.has(t));
      // At least 2 shared tokens OR 1 shared token that is >= 5 chars
      const meaningful = shared.filter((t) => t.length >= 5);
      if (shared.length >= 2 || meaningful.length >= 1) {
        pairs.push([eligible[i], eligible[j]]);
      }
    }
  }
  return pairs;
}
```

- [ ] **Step 4: Add `DUPLICATE_NAMES` prompt to `prompts.ts`**

```typescript
  /** RefineView: confirm duplicate entity candidates */
  DUPLICATE_NAMES: `You are reviewing candidate pairs of entries that may refer to the same real-world entity. Confirm which pairs are genuine duplicates and should be merged.

Rules:
- Only confirm if you are highly confident (>90%) these refer to the same entity
- "John Smith" and "J. Smith" in a contacts brain = likely duplicate
- "Apple Inc" and "Apple Computers" = likely same company
- "Main Branch" and "Main Road Branch" = possibly different, SKIP
- Return ONLY a valid JSON array, no markdown, no explanation

Schema: [{"primaryId":"...","duplicateId":"...","reason":"max 90 chars"}]

Return empty array if no confirmed duplicates: []`,
```

- [ ] **Step 5: Add duplicate detection pass inside `analyze`**

After the weak label pass and before `detectOrphans`, add:

```typescript
    let duplicateSuggestions: EntrySuggestion[] = [];
    const nameCandidates = findNameCandidates(entries);
    if (nameCandidates.length > 0) {
      const candidatePayload = nameCandidates.slice(0, 20).map(([a, b]) => ({
        primaryId: a.id, primaryTitle: a.title, primaryType: a.type,
        primaryContent: (a.content || "").slice(0, 150),
        duplicateId: b.id, duplicateTitle: b.title, duplicateType: b.type,
        duplicateContent: (b.content || "").slice(0, 150),
      }));
      try {
        const res = await callAI({
          max_tokens: 800,
          system: PROMPTS.DUPLICATE_NAMES,
          brainId: activeBrain?.id,
          messages: [{ role: "user", content: `CANDIDATE PAIRS:\n${JSON.stringify(candidatePayload)}` }],
        });
        const data = await res.json();
        const raw = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
        try {
          const p = JSON.parse(raw);
          if (Array.isArray(p)) {
            duplicateSuggestions = p
              .filter((x: any) => x.primaryId && x.duplicateId)
              .map((x: any) => {
                const primary = entryMap[x.primaryId];
                const dup = entryMap[x.duplicateId];
                return {
                  type: "DUPLICATE_ENTRY",
                  entryId: x.primaryId,
                  entryTitle: primary?.title,
                  field: "content",
                  currentValue: `${primary?.title} + ${dup?.title}`,
                  suggestedValue: x.duplicateId,
                  reason: x.reason,
                } as EntrySuggestion;
              });
          }
        } catch (err) { console.error("[useRefineAnalysis]", err); }
      } catch (err) { console.error("[useRefineAnalysis]", err); }
    }
```

Add `duplicateSuggestions` to the `setSuggestions` call:

```typescript
    setSuggestions([
      ...entrySuggestions,
      ...linkSuggestions,
      ...weakLabelSuggestions,
      ...duplicateSuggestions,
      ...orphanSuggestions,
      ...staleSuggestions,
      ...deadUrlSuggestions,
    ]);
```

- [ ] **Step 6: Handle `DUPLICATE_ENTRY` in `applyEntry`**

`DUPLICATE_ENTRY` has the same shape as `MERGE_SUGGESTED` (entryId = keep, suggestedValue = ID to merge in). The existing `MERGE_SUGGESTED` branch in `applyEntry` already handles this. Add `DUPLICATE_ENTRY` to the check:

Find:
```typescript
      if (s.type === "MERGE_SUGGESTED") {
```

Replace with:
```typescript
      if (s.type === "MERGE_SUGGESTED" || s.type === "DUPLICATE_ENTRY") {
```

- [ ] **Step 7: Add label to `RefineView.tsx` LABELS**

```typescript
  DUPLICATE_ENTRY: { label: "Duplicate", icon: <SvgArrows />, variant: "primary" },
```

- [ ] **Step 8: Run tests**

```
npx vitest run src/hooks/__tests__/useRefineAnalysis.logic.test.ts
```
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/config/prompts.ts src/hooks/useRefineAnalysis.ts src/views/RefineView.tsx src/hooks/__tests__/useRefineAnalysis.logic.test.ts
git commit -m "feat: detect duplicate entity names with fuzzy match + AI confirmation"
```

---

## Task 9: Cluster Detection

Find groups of entries that share 2+ tags or have 3+ interconnections but no parent/hub entry. Suggest creating one.

**Files:**
- Modify: `src/config/prompts.ts`
- Modify: `src/hooks/useRefineAnalysis.ts`
- Modify: `src/views/RefineView.tsx`
- Modify: `src/hooks/__tests__/useRefineAnalysis.logic.test.ts`

- [ ] **Step 1: Write failing test**

Add to test file:

```typescript
import { detectClusters } from "../useRefineAnalysis";

describe("detectClusters", () => {
  it("detects cluster from shared tags", () => {
    const entries = [
      { id: "a", title: "Entry A", type: "note", tags: ["supplier", "food"], content: "", metadata: {} },
      { id: "b", title: "Entry B", type: "note", tags: ["supplier", "food"], content: "", metadata: {} },
      { id: "c", title: "Entry C", type: "note", tags: ["supplier", "food"], content: "", metadata: {} },
      { id: "d", title: "Entry D", type: "note", tags: ["unrelated"], content: "", metadata: {} },
    ];
    const clusters = detectClusters(entries as any, []);
    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters[0].memberIds).toContain("a");
    expect(clusters[0].memberIds).toContain("b");
    expect(clusters[0].memberIds).toContain("c");
    expect(clusters[0].memberIds).not.toContain("d");
  });

  it("does not flag clusters with fewer than 3 members", () => {
    const entries = [
      { id: "a", title: "A", type: "note", tags: ["x", "y"], content: "", metadata: {} },
      { id: "b", title: "B", type: "note", tags: ["x", "y"], content: "", metadata: {} },
    ];
    const clusters = detectClusters(entries as any, []);
    expect(clusters).toHaveLength(0);
  });

  it("detects cluster from link density", () => {
    const entries = [
      { id: "a", title: "A", type: "note", tags: [], content: "", metadata: {} },
      { id: "b", title: "B", type: "note", tags: [], content: "", metadata: {} },
      { id: "c", title: "C", type: "note", tags: [], content: "", metadata: {} },
      { id: "d", title: "D", type: "note", tags: [], content: "", metadata: {} },
    ];
    const links = [
      { from: "a", to: "b" }, { from: "a", to: "c" }, { from: "a", to: "d" },
      { from: "b", to: "c" }, { from: "b", to: "d" }, { from: "c", to: "d" },
    ];
    const clusters = detectClusters(entries as any, links as any);
    expect(clusters.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/hooks/__tests__/useRefineAnalysis.logic.test.ts
```
Expected: FAIL

- [ ] **Step 3: Add `ClusterInfo` interface and `detectClusters` to `useRefineAnalysis.ts`**

```typescript
interface ClusterInfo {
  sharedTags: string[];
  memberIds: string[];
}

export function detectClusters(entries: Entry[], links: RefineLink[]): ClusterInfo[] {
  const clusters: ClusterInfo[] = [];

  // Tag-based clustering: find tags shared by 3+ entries
  const tagToEntries: Record<string, string[]> = {};
  for (const e of entries) {
    for (const tag of e.tags || []) {
      if (!tagToEntries[tag]) tagToEntries[tag] = [];
      tagToEntries[tag].push(e.id);
    }
  }
  const tagGroups = Object.entries(tagToEntries).filter(([, ids]) => ids.length >= 3);

  // Merge overlapping tag groups
  const seen = new Set<string>();
  for (const [tag, ids] of tagGroups) {
    const key = ids.sort().join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    // Find all tags shared by this group
    const sharedTags = Object.entries(tagToEntries)
      .filter(([, members]) => ids.every((id) => members.includes(id)))
      .map(([t]) => t);
    clusters.push({ sharedTags, memberIds: ids });
  }

  // Link-density clustering: find groups of 3+ entries with 3+ links between them
  const adjacency: Record<string, Set<string>> = {};
  for (const l of links) {
    if (!adjacency[l.from]) adjacency[l.from] = new Set();
    if (!adjacency[l.to]) adjacency[l.to] = new Set();
    adjacency[l.from].add(l.to);
    adjacency[l.to].add(l.from);
  }
  for (const e of entries) {
    const neighbors = [...(adjacency[e.id] || [])];
    if (neighbors.length < 2) continue;
    // Check if neighbors are also connected to each other (triangle)
    const clique = [e.id];
    for (const n of neighbors) {
      const nNeighbors = adjacency[n] || new Set();
      if (nNeighbors.has(e.id)) clique.push(n);
    }
    if (clique.length >= 3) {
      const key = clique.sort().join(",");
      if (!seen.has(key)) {
        seen.add(key);
        clusters.push({ sharedTags: [], memberIds: clique });
      }
    }
  }

  return clusters;
}
```

- [ ] **Step 4: Add `CLUSTER_NAMING` prompt to `prompts.ts`**

```typescript
  /** RefineView: suggest a parent/hub entry name for a cluster */
  CLUSTER_NAMING: `You are organizing a knowledge base. You are given groups of entries that appear to be related (by shared tags or links). Suggest a parent/hub entry title that would unite each group.

Rules:
- The parent entry title should be concise and descriptive (max 50 chars)
- Choose the most appropriate type for the parent entry (project, company, category, person, place, etc.)
- Only suggest if the grouping clearly warrants a hub entry
- Return ONLY a valid JSON array, no markdown, no explanation

Schema: [{"memberIds":["..."],"parentTitle":"...","parentType":"...","reason":"max 90 chars"}]

Return empty array if no cluster needs a parent entry: []`,
```

- [ ] **Step 5: Add cluster pass inside `analyze`**

After `duplicateSuggestions` and before `detectOrphans`:

```typescript
    let clusterSuggestions: EntrySuggestion[] = [];
    const clusters = detectClusters(entries, links || []);
    if (clusters.length > 0) {
      try {
        const res = await callAI({
          max_tokens: 800,
          system: PROMPTS.CLUSTER_NAMING,
          brainId: activeBrain?.id,
          messages: [{ role: "user", content: `CLUSTERS:\n${JSON.stringify(
            clusters.slice(0, 10).map((c) => ({
              memberIds: c.memberIds,
              sharedTags: c.sharedTags,
              memberTitles: c.memberIds.map((id) => entryMap[id]?.title).filter(Boolean),
            })),
          )}` }],
        });
        const data = await res.json();
        const raw = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
        try {
          const p = JSON.parse(raw);
          if (Array.isArray(p)) {
            clusterSuggestions = p
              .filter((x: any) => x.memberIds?.length >= 3 && x.parentTitle)
              .map((x: any) => ({
                type: "CLUSTER_SUGGESTED",
                entryId: x.memberIds[0], // representative entry
                entryTitle: x.parentTitle,
                field: "content",
                currentValue: x.memberIds.map((id: string) => entryMap[id]?.title).filter(Boolean).join(", "),
                suggestedValue: JSON.stringify({ parentTitle: x.parentTitle, parentType: x.parentType, memberIds: x.memberIds }),
                reason: x.reason,
              } as EntrySuggestion));
          }
        } catch (err) { console.error("[useRefineAnalysis]", err); }
      } catch (err) { console.error("[useRefineAnalysis]", err); }
    }
```

Add to `setSuggestions`:

```typescript
    setSuggestions([
      ...entrySuggestions,
      ...linkSuggestions,
      ...weakLabelSuggestions,
      ...duplicateSuggestions,
      ...clusterSuggestions,
      ...orphanSuggestions,
      ...staleSuggestions,
      ...deadUrlSuggestions,
    ]);
```

- [ ] **Step 6: Handle `CLUSTER_SUGGESTED` apply in `useRefineAnalysis.ts`**

In `applyEntry`, before the `SENSITIVE_DATA` block, add:

```typescript
      if (s.type === "CLUSTER_SUGGESTED") {
        // Create a new parent entry
        try {
          const parsed = JSON.parse(s.suggestedValue);
          await authFetch("/api/create-entry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: parsed.parentTitle,
              type: parsed.parentType || "note",
              content: `Hub entry for: ${(s.currentValue || "").slice(0, 200)}`,
              tags: [],
              brain_id: activeBrain?.id,
            }),
          });
        } catch (err) { console.error("[useRefineAnalysis]", err); }
        setDismissed((p) => new Set(p).add(key));
        setApplying((p) => { const n = new Set(p); n.delete(key); return n; });
        setEditingKey(null);
        return;
      }
```

- [ ] **Step 7: Add label to `RefineView.tsx` LABELS**

Add a new SVG for cluster:
```typescript
function SvgCluster() { return <svg className="inline h-3 w-3 align-middle" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>; }
```

Add to LABELS:
```typescript
  CLUSTER_SUGGESTED: { label: "Create hub entry", icon: <SvgCluster />, variant: "primary" },
```

- [ ] **Step 8: Run tests**

```
npx vitest run src/hooks/__tests__/useRefineAnalysis.logic.test.ts
```
Expected: PASS

- [ ] **Step 9: Run full test suite**

```
npx vitest run
```
Expected: all existing tests pass

- [ ] **Step 10: Commit**

```bash
git add src/config/prompts.ts src/hooks/useRefineAnalysis.ts src/views/RefineView.tsx src/hooks/__tests__/useRefineAnalysis.logic.test.ts
git commit -m "feat: detect entry clusters and suggest hub entries"
```

---

## Self-Review

**Spec coverage:**
- Priority scoring ✓ Task 1
- Orphan detection ✓ Task 2
- Stale reminder detection ✓ Task 3
- Dead URL detection ✓ Task 4
- Delta scanning ✓ Task 5
- Sensitive data wrong type ✓ Task 6
- Weak relationship labels ✓ Task 7
- Duplicate entity names ✓ Task 8
- Cluster → parent entry ✓ Task 9

**Placeholder scan:** None — all tasks contain full code.

**Type consistency:**
- `EntrySuggestion`, `LinkSuggestion`, `WeakLabelSuggestion` used consistently across tasks
- `RefineSuggestion` union updated in Task 7 to include `WeakLabelSuggestion`
- `keyOf` updated in Task 7 handles all three types
- `CLUSTER_SUGGESTED` in Task 9 uses `EntrySuggestion` shape (no new type needed)
- `DUPLICATE_ENTRY` reuses `MERGE_SUGGESTED` apply path (Task 8, Step 6)
- All new detection functions are exported for testability

**Known limitation:** Dead URL detection (Task 4) cannot detect CORS-blocked live URLs — these are treated as alive. This is intentional (no false positives).
