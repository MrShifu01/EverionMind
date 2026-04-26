# Architecture Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six architectural friction points — mixed-concern modules, implicit AI injection, scattered storage keys, and a shattered entry-save pipeline — to make the codebase easier to navigate, test, and extend.

**Architecture:** Six independent phases ordered by dependency: configuration split first (used by almost everything), then search extraction, then the AI layer (SystemPromptBuilder), then storage keys, then unified AI endpoint, and finally entry-save extraction. Each phase produces working, green tests before the next begins.

**Tech Stack:** TypeScript, Vitest, React 19, Vite, Supabase, IndexedDB/localStorage

---

## Phase 1 — Extract `aiSettings.ts` from `aiFetch.ts`

`aiFetch.ts` mixes three concerns: (1) localStorage get/set for AI config, (2) embed-header generation, and (3) the `aiFetch()` HTTP helper. Every module that needs a header or a key must import the whole file. Split it so each concern has a clear home.

**Files:**
- Create: `src/lib/aiSettings.ts`
- Modify: `src/lib/aiFetch.ts` (keep only `aiFetch()`)
- Modify: `src/lib/ai.ts` (update import source)
- Modify: `src/lib/searchIndex.ts` (update lazy import)
- Modify: `tests/lib/aiFetch.test.ts` (update import path for settings functions)

---

### Task 1.1: Move the settings-test import to the new module path

- [ ] **Step 1: Update `tests/lib/aiFetch.test.ts` to import from `aiSettings`**

Replace the import block (lines 9–33) in `tests/lib/aiFetch.test.ts`:

```ts
import {
  getUserApiKey,
  setUserApiKey,
  getUserModel,
  setUserModel,
  getUserProvider,
  setUserProvider,
  getOpenRouterKey,
  setOpenRouterKey,
  getOpenRouterModel,
  setOpenRouterModel,
  getGroqKey,
  setGroqKey,
  getEmbedProvider,
  setEmbedProvider,
  getEmbedOpenAIKey,
  setEmbedOpenAIKey,
  getGeminiKey,
  setGeminiKey,
  getEmbedKey,
  getEmbedHeaders,
  getModelForTask,
  setModelForTask,
} from "../../src/lib/aiSettings";
```

Also update the `vi.mock` path to `"../../src/lib/aiSettings"` (or keep the supabase mock as-is since `aiSettings` will import supabase internally for `setModelForTask`).

- [ ] **Step 2: Run the test to confirm it fails**

```
npx vitest run tests/lib/aiFetch.test.ts
```

Expected: FAIL — `Cannot find module '../../src/lib/aiSettings'`

---

### Task 1.2: Create `src/lib/aiSettings.ts`

- [ ] **Step 3: Write `src/lib/aiSettings.ts`**

```ts
import { supabase } from "./supabase";
import { MODEL as DEFAULT_MODEL } from "../data/constants";

const P = "openbrain_";

// ── Key migration (run once at module init) ──
try {
  const key = Object.keys(localStorage).find((k) => k.endsWith("-auth-token"));
  if (key) {
    const data = JSON.parse(localStorage.getItem(key)!);
    const uid: string | null = data?.user?.id || null;
    if (uid) {
      for (const suffix of [
        "api_key", "model", "provider", "openrouter_key",
        "openrouter_model", "embed_provider", "embed_openai_key", "gemini_key",
      ]) {
        const oldKey = `openbrain_${uid}_${suffix}`;
        const newKey = `${P}${suffix}`;
        if (!localStorage.getItem(newKey) && localStorage.getItem(oldKey)) {
          localStorage.setItem(newKey, localStorage.getItem(oldKey)!);
        }
      }
    }
  }
} catch { /* ignore */ }

export function getUserId(): string | null {
  try {
    const key = Object.keys(localStorage).find((k) => k.endsWith("-auth-token"));
    if (key) {
      const data = JSON.parse(localStorage.getItem(key)!);
      return data?.user?.id || null;
    }
  } catch { /* ignore */ }
  return null;
}

export function getUserApiKey(): string | null {
  return localStorage.getItem(`${P}api_key`) || null;
}
export function setUserApiKey(key: string | null): void {
  if (key) localStorage.setItem(`${P}api_key`, key);
  else localStorage.removeItem(`${P}api_key`);
}

export function getUserModel(): string {
  return localStorage.getItem(`${P}model`) || DEFAULT_MODEL;
}
export function setUserModel(model: string | null): void {
  if (model) localStorage.setItem(`${P}model`, model);
  else localStorage.removeItem(`${P}model`);
}

export function getUserProvider(): string {
  return localStorage.getItem(`${P}provider`) || "anthropic";
}
export function setUserProvider(provider: string | null): void {
  localStorage.setItem(`${P}provider`, provider || "anthropic");
}

export function getOpenRouterKey(): string | null {
  return localStorage.getItem(`${P}openrouter_key`) || null;
}
export function setOpenRouterKey(key: string | null): void {
  if (key) localStorage.setItem(`${P}openrouter_key`, key);
  else localStorage.removeItem(`${P}openrouter_key`);
}

export function getOpenRouterModel(): string | null {
  return localStorage.getItem(`${P}openrouter_model`) || null;
}
export function setOpenRouterModel(model: string | null): void {
  if (model) localStorage.setItem(`${P}openrouter_model`, model);
  else localStorage.removeItem(`${P}openrouter_model`);
}

export function getGroqKey(): string | null {
  return localStorage.getItem(`${P}groq_key`) || null;
}
export function setGroqKey(key: string | null): void {
  if (key) localStorage.setItem(`${P}groq_key`, key);
  else localStorage.removeItem(`${P}groq_key`);
}

const TASK_COL: Record<string, string> = {
  capture: "model_capture",
  questions: "model_questions",
  vision: "model_vision",
  refine: "model_refine",
  chat: "model_chat",
};

export function getModelForTask(task: string): string | null {
  return localStorage.getItem(`${P}task_${task}`) || null;
}
export function setModelForTask(task: string, model: string | null): void {
  const lsKey = `${P}task_${task}`;
  if (model) localStorage.setItem(lsKey, model);
  else localStorage.removeItem(lsKey);
  const col = TASK_COL[task];
  if (!col) return;
  const uid = getUserId();
  if (uid) {
    supabase
      .from("user_ai_settings")
      .upsert(
        { user_id: uid, [col]: model || null, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  }
}

export function loadTaskModels(
  _userId: string,
  settingsRow: Record<string, string | null> | null,
): void {
  if (!settingsRow) return;
  for (const [task, col] of Object.entries(TASK_COL)) {
    const val = settingsRow[col];
    const lsKey = `${P}task_${task}`;
    if (val) localStorage.setItem(lsKey, val);
    else localStorage.removeItem(lsKey);
  }
}

// ── Embedding settings ──

export function getEmbedProvider(): string {
  return localStorage.getItem(`${P}embed_provider`) || "openai";
}
export function setEmbedProvider(p: string | null): void {
  localStorage.setItem(`${P}embed_provider`, p || "openai");
}

export function getEmbedOpenAIKey(): string | null {
  return localStorage.getItem(`${P}embed_openai_key`) || null;
}
export function setEmbedOpenAIKey(key: string | null): void {
  if (key) localStorage.setItem(`${P}embed_openai_key`, key);
  else localStorage.removeItem(`${P}embed_openai_key`);
}

export function getGeminiKey(): string | null {
  return localStorage.getItem(`${P}gemini_key`) || null;
}
export function setGeminiKey(key: string | null): void {
  if (key) localStorage.setItem(`${P}gemini_key`, key);
  else localStorage.removeItem(`${P}gemini_key`);
}

export function getEmbedKey(): string | null {
  return getEmbedProvider() === "google" ? getGeminiKey() : getEmbedOpenAIKey();
}

export function getEmbedHeaders(): { "X-Embed-Provider": string; "X-Embed-Key": string } | null {
  const provider = getEmbedProvider();
  const key = getEmbedKey();
  if (!key) return null;
  return { "X-Embed-Provider": provider, "X-Embed-Key": key };
}
```

- [ ] **Step 4: Run tests — should be green**

```
npx vitest run tests/lib/aiFetch.test.ts
```

Expected: PASS (all 23 tests)

---

### Task 1.3: Slim down `src/lib/aiFetch.ts` and update all callers

- [ ] **Step 5: Replace `src/lib/aiFetch.ts` with the lean version**

```ts
import { getUserApiKey } from "./aiSettings";
import { authFetch } from "./authFetch";

export async function aiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const userKey = getUserApiKey();
  if (!userKey) return authFetch(url, options);
  return authFetch(url, {
    ...options,
    headers: { ...options.headers, "X-User-Api-Key": userKey },
  });
}
```

- [ ] **Step 6: Update `src/lib/ai.ts` imports**

Change the import block at the top of `src/lib/ai.ts` from:

```ts
import {
  getUserProvider,
  getUserModel,
  getUserApiKey,
  getOpenRouterKey,
  getOpenRouterModel,
  getModelForTask,
} from "./aiFetch";
```

To:

```ts
import {
  getUserProvider,
  getUserModel,
  getUserApiKey,
  getOpenRouterKey,
  getOpenRouterModel,
  getModelForTask,
} from "./aiSettings";
```

- [ ] **Step 7: Update the lazy import in `src/lib/searchIndex.ts` (line 53)**

Change:

```ts
const { getEmbedHeaders } = await import("./aiFetch");
```

To:

```ts
const { getEmbedHeaders } = await import("./aiSettings");
```

- [ ] **Step 8: Search for any other callers of `aiFetch` settings exports**

```
npx grep -r "from.*aiFetch" src/ --include="*.ts" --include="*.tsx" -l
```

For each file found that imports a settings function (not `aiFetch` itself), update the import source to `"./aiSettings"` (adjust relative path as needed).

- [ ] **Step 9: Run the full test suite**

```
npx vitest run
```

Expected: All tests pass. No `Cannot find module` errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/aiSettings.ts src/lib/aiFetch.ts src/lib/ai.ts src/lib/searchIndex.ts tests/lib/aiFetch.test.ts
git commit -m "refactor: extract aiSettings.ts — split mixed concerns out of aiFetch.ts"
```

---

## Phase 2 — Extract `semanticSearch.ts` from `searchIndex.ts`

`semanticSearch()` lives in `searchIndex.ts` but depends on `chatContext.scoreEntriesForQuery` and dynamically imports `aiSettings`. It is a higher-level operation than the token index. Moving it to its own file gives it a clear home and makes imports explicit.

There is also a latent casing bug: `searchIndex.ts` checks `headers?.["x-embed-key"]` (lowercase) but `getEmbedHeaders()` returns `"X-Embed-Key"` (capitalised). This phase fixes that too.

**Files:**
- Create: `src/lib/semanticSearch.ts`
- Modify: `src/lib/searchIndex.ts` (remove `semanticSearch`)
- Modify: `tests/lib/semanticSearch.test.ts` (update import path)
- Modify any callers that import `semanticSearch` from `searchIndex`

---

### Task 2.1: Point the existing test at the new module

- [ ] **Step 1: Update import in `tests/lib/semanticSearch.test.ts`**

Change line 13:

```ts
// Before
const { semanticSearch } = await import("../../src/lib/searchIndex");

// After (in every occurrence inside the test file)
const { semanticSearch } = await import("../../src/lib/semanticSearch");
```

There are 5 occurrences — replace all of them.

Also update the mock path for `aiFetch` at the top:

```ts
// Before
vi.mock("../../src/lib/aiFetch", () => ({
  getEmbedHeaders: vi.fn().mockReturnValue(null),
}));

// After
vi.mock("../../src/lib/aiSettings", () => ({
  getEmbedHeaders: vi.fn().mockReturnValue(null),
}));
```

- [ ] **Step 2: Run the test — should fail**

```
npx vitest run tests/lib/semanticSearch.test.ts
```

Expected: FAIL — `Cannot find module '../../src/lib/semanticSearch'`

---

### Task 2.2: Create `src/lib/semanticSearch.ts`

- [ ] **Step 3: Write `src/lib/semanticSearch.ts`**

```ts
import type { Entry } from "../types";
import { scoreEntriesForQuery } from "./chatContext";

/**
 * Semantic search with graceful keyword fallback.
 *
 * When online and embed headers are available, calls /api/search for
 * pgvector cosine similarity. Falls back to keyword scoring when:
 *   - offline
 *   - no embed key provided
 *   - API returns { fallback: true }
 *   - network/fetch error
 *
 * Note: embedHeaders keys must match what the API expects (lowercase
 * HTTP headers). Pass the result of getEmbedHeaders() lowercased, or
 * supply your own { "x-embed-key": string; "x-embed-provider": string }.
 */
export async function semanticSearch(
  query: string,
  brainId: string,
  entries: Entry[],
  isOnline = navigator.onLine,
  embedHeaders?: Record<string, string> | null,
): Promise<Entry[]> {
  if (!query.trim()) return entries;

  // Lazy import to avoid loading browser-only aiSettings at module init time
  const { getEmbedHeaders } = await import("./aiSettings");
  const rawHeaders = embedHeaders ?? getEmbedHeaders();

  // Normalise to lowercase for HTTP transport
  const headers: Record<string, string> | null = rawHeaders
    ? Object.fromEntries(Object.entries(rawHeaders).map(([k, v]) => [k.toLowerCase(), v]))
    : null;

  if (isOnline && headers?.["x-embed-key"]) {
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ query, brain_id: brainId, limit: 20 }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.fallback && Array.isArray(data.results)) {
          const byId = new Map(entries.map((e) => [e.id, e]));
          return data.results
            .map((r: { id: string }) => byId.get(r.id) ?? r)
            .filter(Boolean);
        }
      }
    } catch {
      // fall through to keyword
    }
  }

  return scoreEntriesForQuery(entries, query);
}
```

- [ ] **Step 4: Run the test — should be green**

```
npx vitest run tests/lib/semanticSearch.test.ts
```

Expected: PASS (all 5 tests)

---

### Task 2.3: Remove `semanticSearch` from `searchIndex.ts` and update callers

- [ ] **Step 5: Delete `semanticSearch` from `src/lib/searchIndex.ts`**

Remove lines 33–79 (the `semanticSearch` export and its JSDoc comment). The file should now contain only `indexEntry`, `removeFromIndex`, `searchIndex`, and the private `tokenize`.

- [ ] **Step 6: Find callers that import `semanticSearch` from `searchIndex`**

```
npx grep -r "semanticSearch" src/ --include="*.ts" --include="*.tsx" -l
```

For each file, change:

```ts
import { semanticSearch } from "./searchIndex";      // or relative path
```

To:

```ts
import { semanticSearch } from "./semanticSearch";   // adjust path
```

- [ ] **Step 7: Run the full suite**

```
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/semanticSearch.ts src/lib/searchIndex.ts tests/lib/semanticSearch.test.ts
git commit -m "refactor: extract semanticSearch.ts and fix embed-header casing bug"
```

---

## Phase 3 — Create `systemPromptBuilder.ts`

`callAI()` in `ai.ts` silently appends learnings to every system prompt when `brainId` is provided. Callers cannot see this happening, cannot test it without mocking `learningEngine`, and cannot control it. `systemPromptBuilder.ts` makes the composition explicit and pure.

**Files:**
- Create: `src/lib/systemPromptBuilder.ts`
- Create: `tests/lib/systemPromptBuilder.test.ts`
- Modify: `src/lib/ai.ts` (use the builder)

---

### Task 3.1: Write the failing tests

- [ ] **Step 1: Create `tests/lib/systemPromptBuilder.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/learningEngine", () => ({
  getLearningsContext: vi.fn(),
}));

import { getLearningsContext } from "../../src/lib/learningEngine";
import { buildSystemPrompt } from "../../src/lib/systemPromptBuilder";

const mockGetLearnings = getLearningsContext as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGetLearnings.mockReturnValue("");
});

describe("buildSystemPrompt", () => {
  it("returns empty string when called with no arguments", () => {
    expect(buildSystemPrompt({})).toBe("");
  });

  it("returns base unchanged when no memoryGuide or brainId", () => {
    expect(buildSystemPrompt({ base: "You are helpful." })).toBe("You are helpful.");
  });

  it("prepends memory guide in Classification Guide / Task format", () => {
    const result = buildSystemPrompt({ base: "Classify this.", memoryGuide: "Use types: note, task." });
    expect(result).toBe(
      "[Classification Guide]\nUse types: note, task.\n\n[Task]\nClassify this.",
    );
  });

  it("appends learnings block when brainId is provided and learnings exist", () => {
    mockGetLearnings.mockReturnValue("User prefers short titles.");
    const result = buildSystemPrompt({ base: "Do something.", brainId: "brain-1" });
    expect(result).toContain("--- USER LEARNING CONTEXT ---");
    expect(result).toContain("User prefers short titles.");
    expect(result).toContain("--- END LEARNING CONTEXT ---");
    expect(mockGetLearnings).toHaveBeenCalledWith("brain-1");
  });

  it("does not append learnings block when getLearningsContext returns empty string", () => {
    mockGetLearnings.mockReturnValue("");
    const result = buildSystemPrompt({ base: "Do something.", brainId: "brain-1" });
    expect(result).toBe("Do something.");
    expect(result).not.toContain("LEARNING CONTEXT");
  });

  it("composes guide then base then learnings in correct order", () => {
    mockGetLearnings.mockReturnValue("Prefer note type.");
    const result = buildSystemPrompt({
      base: "Classify.",
      memoryGuide: "Guide here.",
      brainId: "brain-2",
    });
    const guideIdx = result.indexOf("[Classification Guide]");
    const taskIdx = result.indexOf("[Task]");
    const learnIdx = result.indexOf("USER LEARNING CONTEXT");
    expect(guideIdx).toBeLessThan(taskIdx);
    expect(taskIdx).toBeLessThan(learnIdx);
  });
});
```

- [ ] **Step 2: Run — confirm failure**

```
npx vitest run tests/lib/systemPromptBuilder.test.ts
```

Expected: FAIL — `Cannot find module '../../src/lib/systemPromptBuilder'`

---

### Task 3.2: Implement `src/lib/systemPromptBuilder.ts`

- [ ] **Step 3: Write `src/lib/systemPromptBuilder.ts`**

```ts
import { getLearningsContext } from "./learningEngine";

export interface SystemPromptOptions {
  base?: string;
  memoryGuide?: string;
  /** When provided, auto-injects user learnings into the system prompt */
  brainId?: string;
}

export function buildSystemPrompt({ base = "", memoryGuide, brainId }: SystemPromptOptions): string {
  let prompt = base;

  if (memoryGuide) {
    prompt = `[Classification Guide]\n${memoryGuide}\n\n[Task]\n${prompt}`;
  }

  if (brainId) {
    const learnings = getLearningsContext(brainId);
    if (learnings) {
      prompt = `${prompt}\n\n--- USER LEARNING CONTEXT ---\nThis user's past decisions reveal preferences. Adapt your output accordingly:\n${learnings}\n--- END LEARNING CONTEXT ---`;
    }
  }

  return prompt;
}
```

- [ ] **Step 4: Run — confirm green**

```
npx vitest run tests/lib/systemPromptBuilder.test.ts
```

Expected: PASS (all 6 tests)

---

### Task 3.3: Wire `ai.ts` to use the builder

- [ ] **Step 5: Update `src/lib/ai.ts`**

Add import at the top:

```ts
import { buildSystemPrompt } from "./systemPromptBuilder";
```

Remove the import of `getLearningsContext` from `learningEngine` (it's now encapsulated in `systemPromptBuilder`).

Replace the manual system-prompt construction block (lines 88–97):

```ts
// Before
let fullSystem = system || "";
if (memoryGuide) {
  fullSystem = `[Classification Guide]\n${memoryGuide}\n\n[Task]\n${fullSystem}`;
}
if (brainId) {
  const learnings = getLearningsContext(brainId);
  if (learnings) {
    fullSystem = `${fullSystem}\n\n--- USER LEARNING CONTEXT ---\nThis user's past decisions reveal preferences. Adapt your output accordingly:\n${learnings}\n--- END LEARNING CONTEXT ---`;
  }
}

// After
const fullSystem = buildSystemPrompt({ base: system, memoryGuide, brainId });
```

- [ ] **Step 6: Run the full suite**

```
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/systemPromptBuilder.ts tests/lib/systemPromptBuilder.test.ts src/lib/ai.ts
git commit -m "refactor: extract systemPromptBuilder — make learning injection explicit and testable"
```

---

## Phase 4 — Centralise storage keys in `storageKeys.ts`

localStorage keys are hardcoded as strings in 8 modules. A typo silently reads `undefined`. This phase adds a single source-of-truth for all key names. No behaviour changes — pure rename/centralise.

**Files:**
- Create: `src/lib/storageKeys.ts`
- Modify: `src/lib/aiSettings.ts`
- Modify: `src/lib/offlineQueue.ts`
- Modify: `src/lib/learningEngine.ts`
- Modify: `src/lib/entriesCache.ts`

---

### Task 4.1: Write a failing test for the key-generation helpers

- [ ] **Step 1: Create `tests/lib/storageKeys.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { KEYS } from "../../src/lib/storageKeys";

describe("KEYS", () => {
  it("AI_API_KEY is the correct literal", () => {
    expect(KEYS.AI_API_KEY).toBe("openbrain_api_key");
  });

  it("OFFLINE_QUEUE is the correct literal", () => {
    expect(KEYS.OFFLINE_QUEUE).toBe("openbrain_queue");
  });

  it("learningDecisions scopes to brainId", () => {
    expect(KEYS.learningDecisions("brain-abc")).toBe("openbrain_learning_decisions:brain-abc");
  });

  it("learningSummary scopes to brainId", () => {
    expect(KEYS.learningSummary("brain-abc")).toBe("openbrain_learning_summary:brain-abc");
  });

  it("taskModel scopes to task name", () => {
    expect(KEYS.taskModel("capture")).toBe("openbrain_task_capture");
  });

  it("ENTRIES_CACHE is the correct literal", () => {
    expect(KEYS.ENTRIES_CACHE).toBe("openbrain_entries");
  });
});
```

- [ ] **Step 2: Run — confirm failure**

```
npx vitest run tests/lib/storageKeys.test.ts
```

Expected: FAIL — `Cannot find module '../../src/lib/storageKeys'`

---

### Task 4.2: Create `src/lib/storageKeys.ts`

- [ ] **Step 3: Write `src/lib/storageKeys.ts`**

```ts
const P = "openbrain_";

export const KEYS = {
  AI_API_KEY:        `${P}api_key`,
  AI_MODEL:          `${P}model`,
  AI_PROVIDER:       `${P}provider`,
  OPENROUTER_KEY:    `${P}openrouter_key`,
  OPENROUTER_MODEL:  `${P}openrouter_model`,
  GROQ_KEY:          `${P}groq_key`,
  EMBED_PROVIDER:    `${P}embed_provider`,
  EMBED_OPENAI_KEY:  `${P}embed_openai_key`,
  GEMINI_KEY:        `${P}gemini_key`,
  OFFLINE_QUEUE:     `${P}queue`,
  ENTRIES_CACHE:     `${P}entries`,
  learningDecisions: (brainId: string) => `${P}learning_decisions:${brainId}`,
  learningSummary:   (brainId: string) => `${P}learning_summary:${brainId}`,
  taskModel:         (task: string)    => `${P}task_${task}`,
} as const;
```

- [ ] **Step 4: Run — confirm green**

```
npx vitest run tests/lib/storageKeys.test.ts
```

Expected: PASS (all 6 tests)

---

### Task 4.3: Migrate `aiSettings.ts` to use `KEYS`

- [ ] **Step 5: Add import and replace hardcoded strings in `src/lib/aiSettings.ts`**

Add at the top:

```ts
import { KEYS } from "./storageKeys";
```

Then replace every `\`${P}...\`` literal with the matching `KEYS.*` constant. Examples:

```ts
// Before
return localStorage.getItem(`${P}api_key`) || null;
// After
return localStorage.getItem(KEYS.AI_API_KEY) || null;

// Before
localStorage.setItem(`${P}task_${task}`, model);
// After
localStorage.setItem(KEYS.taskModel(task), model);
```

Remove the `const P = "openbrain_";` line from `aiSettings.ts` once all references are replaced.

- [ ] **Step 6: Migrate `src/lib/offlineQueue.ts`**

Add:

```ts
import { KEYS } from "./storageKeys";
```

Replace every `"openbrain_queue"` literal with `KEYS.OFFLINE_QUEUE`.

- [ ] **Step 7: Migrate `src/lib/learningEngine.ts`**

Add:

```ts
import { KEYS } from "./storageKeys";
```

Replace:
- `\`${DECISIONS_KEY}:${brainId}\`` → `KEYS.learningDecisions(brainId)`
- `\`${LEARNINGS_KEY}:${brainId}\`` → `KEYS.learningSummary(brainId)`

Remove the `DECISIONS_KEY` and `LEARNINGS_KEY` const declarations once replaced.

- [ ] **Step 8: Migrate `src/lib/entriesCache.ts`**

Add:

```ts
import { KEYS } from "./storageKeys";
```

Replace `"openbrain_entries"` with `KEYS.ENTRIES_CACHE`.

- [ ] **Step 9: Run the full suite**

```
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/lib/storageKeys.ts tests/lib/storageKeys.test.ts \
        src/lib/aiSettings.ts src/lib/offlineQueue.ts \
        src/lib/learningEngine.ts src/lib/entriesCache.ts
git commit -m "refactor: centralise localStorage keys in storageKeys.ts"
```

---

## Phase 5 — Unified `/api/ai` endpoint

The frontend routes to `/api/anthropic`, `/api/openai`, or `/api/openrouter` based on `getUserProvider()`. Adding a new provider means touching `ai.ts`, `aiFetch.ts`, and creating a new handler. A single `/api/ai` endpoint that accepts an `X-Provider` header moves routing to the server and gives all providers one entry point.

**Files:**
- Create: `api/ai.ts`
- Create: `tests/api/ai.test.ts`
- Modify: `src/lib/ai.ts` (always send to `/api/ai`, add `X-Provider` header)

The existing provider-specific handlers (`/api/anthropic`, `/api/openai`, `/api/openrouter`) are **not deleted** — they continue to work for direct calls and backwards compatibility.

---

### Task 5.1: Write the failing test

- [ ] **Step 1: Create `tests/api/ai.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import handler from "../../api/ai";

// Re-use the existing test factory pattern from the codebase
function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: "POST",
    headers: {
      "x-provider": "anthropic",
      "authorization": "Bearer test-token",
      "content-type": "application/json",
    },
    body: {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hello" }],
      system: "You are helpful.",
      max_tokens: 100,
    },
    query: {},
    ...overrides,
  } as any;
}

function makeRes() {
  const res: any = { _status: 200, _body: null, _headers: {} };
  res.status = (code: number) => { res._status = code; return res; };
  res.json = (body: unknown) => { res._body = body; return res; };
  res.setHeader = (k: string, v: string) => { res._headers[k] = v; };
  res.end = () => res;
  return res;
}

vi.mock("../../api/_lib/verifyAuth.js", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
}));

vi.mock("../../api/_lib/rateLimit.js", () => ({
  rateLimit: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../api/_lib/securityHeaders.js", () => ({
  applySecurityHeaders: vi.fn(),
}));

describe("POST /api/ai", () => {
  it("returns 405 for non-POST methods", async () => {
    const res = makeRes();
    await handler(makeReq({ method: "GET" }), res);
    expect(res._status).toBe(405);
  });

  it("returns 400 when x-provider header is missing", async () => {
    const req = makeReq();
    delete req.headers["x-provider"];
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/provider/i);
  });

  it("returns 400 for unknown provider", async () => {
    const res = makeRes();
    await handler(makeReq({ headers: { "x-provider": "unknown", "authorization": "Bearer test-token" } }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/unsupported provider/i);
  });
});
```

- [ ] **Step 2: Run — confirm failure**

```
npx vitest run tests/api/ai.test.ts
```

Expected: FAIL — `Cannot find module '../../api/ai'`

---

### Task 5.2: Create `api/ai.ts`

- [ ] **Step 3: Write `api/ai.ts`**

```ts
/**
 * POST /api/ai — Unified AI endpoint.
 *
 * Accepts an `x-provider` header ("anthropic" | "openai" | "openrouter")
 * and delegates to the appropriate provider handler. All other request/response
 * semantics are identical to the individual provider endpoints.
 */
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

const SUPPORTED_PROVIDERS = ["anthropic", "openai", "openrouter"] as const;
type Provider = typeof SUPPORTED_PROVIDERS[number];

const HANDLER_MAP: Record<Provider, () => Promise<{ default: (req: ApiRequest, res: ApiResponse) => Promise<void> }>> = {
  anthropic:   () => import("./anthropic.js"),
  openai:      () => import("./openai.js"),
  openrouter:  () => import("./openrouter.js"),
};

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!(await rateLimit(req, 20))) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const provider = (req.headers["x-provider"] as string | undefined)?.toLowerCase();

  if (!provider) {
    return res.status(400).json({ error: "Missing x-provider header" });
  }

  if (!SUPPORTED_PROVIDERS.includes(provider as Provider)) {
    return res.status(400).json({ error: `Unsupported provider: ${provider}` });
  }

  const { default: providerHandler } = await HANDLER_MAP[provider as Provider]();
  return providerHandler(req, res);
}
```

- [ ] **Step 4: Run the test — confirm green**

```
npx vitest run tests/api/ai.test.ts
```

Expected: PASS (all 3 tests)

---

### Task 5.3: Update `src/lib/ai.ts` to use `/api/ai`

- [ ] **Step 5: Simplify `ai.ts` endpoint routing**

Replace the `ENDPOINT` map and per-provider routing in `src/lib/ai.ts`:

```ts
// Before
const ENDPOINT: Record<string, string> = {
  anthropic: "/api/anthropic",
  openai: "/api/openai",
  openrouter: "/api/openrouter",
};
// ...
const endpoint = ENDPOINT[provider] ?? ENDPOINT.anthropic;

// After
const endpoint = "/api/ai";
```

Add the provider to the request headers so `/api/ai` can route:

```ts
// Before
const headers: Record<string, string> = {
  "Content-Type": "application/json",
  ...(userKey ? { "X-User-Api-Key": userKey } : {}),
};

// After
const headers: Record<string, string> = {
  "Content-Type": "application/json",
  "X-Provider": provider,
  ...(userKey ? { "X-User-Api-Key": userKey } : {}),
};
```

- [ ] **Step 6: Run the full suite**

```
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add api/ai.ts tests/api/ai.test.ts src/lib/ai.ts
git commit -m "refactor: add unified /api/ai endpoint — provider routing moves server-side"
```

---

## Phase 6 — Extract `saveEntry()` from `OpenBrain.tsx`

`OpenBrain.tsx` is 1591 lines. The entry-save logic (validate → encrypt → enqueue → update cache → record decision) is inline in the component. It cannot be tested without rendering the full app. This phase extracts that logic into `src/lib/entryOps.ts` so it can be tested in isolation.

**Files:**
- Create: `src/lib/entryOps.ts`
- Create: `tests/lib/entryOps.test.ts`
- Modify: `src/OpenBrain.tsx` (call `saveEntry` instead of inline logic)

The goal is a clean seam, not a full `EntryRepository`. OpenBrain.tsx stays the orchestrator; `entryOps.ts` holds the pure/testable operations.

---

### Task 6.1: Write the failing tests

- [ ] **Step 1: Create `tests/lib/entryOps.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/offlineQueue", () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/lib/entriesCache", () => ({
  writeEntriesCache: vi.fn(),
  readEntriesCache: vi.fn().mockReturnValue([]),
}));

vi.mock("../../src/lib/learningEngine", () => ({
  recordDecision: vi.fn(),
}));

vi.mock("../../src/lib/crypto", () => ({
  encryptEntry: vi.fn((entry: unknown) => entry),
}));

import { enqueue } from "../../src/lib/offlineQueue";
import { writeEntriesCache } from "../../src/lib/entriesCache";
import { saveEntry } from "../../src/lib/entryOps";
import type { Entry } from "../../src/types";

const mockEnqueue = enqueue as ReturnType<typeof vi.fn>;
const mockWriteCache = writeEntriesCache as ReturnType<typeof vi.fn>;

const baseEntry: Entry = {
  id: "tmp-123",
  title: "Test entry",
  type: "note",
  tags: ["test"],
  content: "Hello",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveEntry", () => {
  it("calls enqueue with the entry", async () => {
    await saveEntry(baseEntry, { brainId: "brain-1" });
    expect(mockEnqueue).toHaveBeenCalledOnce();
    const op = mockEnqueue.mock.calls[0][0];
    expect(op.entry.id).toBe("tmp-123");
    expect(op.brainId).toBe("brain-1");
  });

  it("updates the entries cache optimistically", async () => {
    await saveEntry(baseEntry, { brainId: "brain-1" });
    expect(mockWriteCache).toHaveBeenCalledOnce();
  });

  it("returns the entry id", async () => {
    const result = await saveEntry(baseEntry, { brainId: "brain-1" });
    expect(result.entryId).toBe("tmp-123");
  });

  it("encrypts entry when vaultKey is provided", async () => {
    const { encryptEntry } = await import("../../src/lib/crypto");
    const mockEncrypt = encryptEntry as ReturnType<typeof vi.fn>;
    await saveEntry(baseEntry, { brainId: "brain-1", vaultKey: "vault-secret" });
    expect(mockEncrypt).toHaveBeenCalledWith(baseEntry, "vault-secret");
  });

  it("does not encrypt when vaultKey is null", async () => {
    const { encryptEntry } = await import("../../src/lib/crypto");
    const mockEncrypt = encryptEntry as ReturnType<typeof vi.fn>;
    await saveEntry(baseEntry, { brainId: "brain-1", vaultKey: null });
    expect(mockEncrypt).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — confirm failure**

```
npx vitest run tests/lib/entryOps.test.ts
```

Expected: FAIL — `Cannot find module '../../src/lib/entryOps'`

---

### Task 6.2: Implement `src/lib/entryOps.ts`

First, read the relevant section of `OpenBrain.tsx` to extract the exact save logic (search for `enqueue` call sites). Then:

- [ ] **Step 3: Write `src/lib/entryOps.ts`**

```ts
import type { Entry } from "../types";
import { enqueue } from "./offlineQueue";
import { readEntriesCache, writeEntriesCache } from "./entriesCache";
import { encryptEntry } from "./crypto";

export interface SaveEntryOptions {
  brainId: string;
  vaultKey?: string | null;
}

export interface SaveEntryResult {
  entryId: string;
}

/**
 * Saves an entry via the offline queue and updates the local cache optimistically.
 * Encrypts the entry if vaultKey is provided.
 */
export async function saveEntry(
  entry: Entry,
  { brainId, vaultKey }: SaveEntryOptions,
): Promise<SaveEntryResult> {
  const stored = vaultKey ? encryptEntry(entry, vaultKey) : entry;

  // Optimistic cache update
  const cached = readEntriesCache() ?? [];
  const idx = cached.findIndex((e) => e.id === entry.id);
  if (idx >= 0) cached[idx] = stored;
  else cached.unshift(stored);
  writeEntriesCache(cached);

  await enqueue({
    id: entry.id,
    type: "save",
    entry: stored,
    brainId,
    created_at: new Date().toISOString(),
    retries: 0,
  });

  return { entryId: entry.id };
}
```

> **Note:** If the `OfflineOp` type shape in your codebase differs from above, adjust the `enqueue` call to match `src/types.ts`. The `type`, `entry`, `brainId`, `created_at`, and `retries` fields should match `OfflineOp`.

- [ ] **Step 4: Run — confirm green**

```
npx vitest run tests/lib/entryOps.test.ts
```

Expected: PASS (all 5 tests)

---

### Task 6.3: Migrate `OpenBrain.tsx` to call `saveEntry`

- [ ] **Step 5: Find the inline save logic in `OpenBrain.tsx`**

Search for `enqueue(` in `OpenBrain.tsx`. There will be one or more call sites where the component manually builds the enqueue payload and updates the cache. Replace each one with a call to `saveEntry`.

Add the import:

```ts
import { saveEntry } from "./lib/entryOps";
```

Replace the inline save block (the exact code will depend on what you find, but the shape is):

```ts
// Before — something like this inline
const stored = vaultKey ? encryptEntry(entry, vaultKey) : entry;
const cached = readEntriesCache() ?? [];
// ... cache update logic ...
writeEntriesCache(cached);
await enqueue({ id: entry.id, type: "save", entry: stored, brainId, created_at: ..., retries: 0 });

// After
await saveEntry(entry, { brainId, vaultKey });
```

- [ ] **Step 6: Run the full suite**

```
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/entryOps.ts tests/lib/entryOps.test.ts src/OpenBrain.tsx
git commit -m "refactor: extract saveEntry into entryOps.ts — entry save logic is now testable in isolation"
```

---

## Self-Review

### Spec coverage

| Refactor | Phase | Tasks |
|---|---|---|
| Split `aiFetch.ts` | 1 | 1.1, 1.2, 1.3 |
| Extract `semanticSearch.ts` + casing fix | 2 | 2.1, 2.2, 2.3 |
| `SystemPromptBuilder` | 3 | 3.1, 3.2, 3.3 |
| Centralise storage keys | 4 | 4.1, 4.2, 4.3 |
| Unified `/api/ai` endpoint | 5 | 5.1, 5.2, 5.3 |
| Extract `saveEntry` | 6 | 6.1, 6.2, 6.3 |

All 6 candidates covered. Each phase ends with a green test run and a commit.

### Placeholder scan

No TBD, no "similar to task N", no vague steps. Task 6.3 Step 5 notes that the exact inline code must be read from `OpenBrain.tsx` before replacing — this is intentional, not a placeholder.

### Type consistency

- `SystemPromptOptions` defined in Task 3.2, used in Tasks 3.1 and 3.3 — consistent.
- `SaveEntryOptions` / `SaveEntryResult` defined in Task 6.2, matched in tests at Task 6.1 — consistent.
- `KEYS` exported from `storageKeys.ts` in Task 4.2, imported in Tasks 4.3 — consistent.
- `getEmbedHeaders` moves from `aiFetch` to `aiSettings` in Phase 1 — all subsequent phases import from `aiSettings`.
