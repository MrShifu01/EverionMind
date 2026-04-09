# Clean Code — Key Principles Reference

A distillation of *Clean Code* (Robert C. Martin) combined with modern principles of compact, modular, maintainable code. Written as a practical reference, not a summary.

---

## 1. Naming

**Names are the first interface between you and the next developer.**

- A name should tell you WHY it exists, WHAT it does, and HOW it's used — without a comment
- If you need a comment to explain a name, rename it
- Avoid noise words: `data`, `info`, `manager`, `handler`, `helper`, `utils` say nothing
- Avoid abbreviations: `usr`, `cnt`, `tmp` — they save 3 keystrokes and cost hours of confusion
- Use the same word for the same concept everywhere — don't mix `fetch`, `get`, `retrieve` arbitrarily
- Boolean names should read as yes/no: `isLoading`, `hasError`, `canEdit` not `loading`, `error`, `edit`
- Functions should be verbs: `sendEmail`, `parseEntry`, `fetchUser` not `email`, `entry`, `user`
- Constants should be SCREAMING_SNAKE_CASE only for true constants — not every `const`
- Length of a name should be proportional to its scope — a loop variable `i` is fine; a module-level variable named `i` is not

```ts
// Bad
const d = new Date();
const usrDt = getUserData();
function handleIt(e) { ... }

// Good
const createdAt = new Date();
const userProfile = fetchUserProfile();
function handleFormSubmit(event) { ... }
```

---

## 2. Functions

**The first rule: functions should be small. The second rule: they should be smaller than that.**

- One function = one thing at one level of abstraction
- If you're writing "and" in a function description, split it
- A function that checks a condition AND acts on it is two functions
- Extract until you can't — the body of an if/else/loop is often a function waiting to be born
- Limit arguments: 0 is ideal, 1 is great, 2 is acceptable, 3 needs justification, 4+ is a design smell → group into an object
- Avoid flag arguments: `send(true)` means nothing. `sendAsEmail()` vs `sendAsNotification()` is clear
- Functions should have no hidden side effects — if a function is called `getUser`, it should not also update a timestamp
- Command-Query Separation: a function either does something (command) or returns something (query), never both

```ts
// Bad — does two things, takes a flag, has side effect
function processUser(user, sendEmail = false) {
  lastProcessed = Date.now(); // hidden side effect
  const result = validateUser(user);
  if (sendEmail) sendWelcomeEmail(user); // flag argument anti-pattern
  return result;
}

// Good — separated concerns
function validateUser(user: User): ValidationResult { ... }
function recordProcessingTime(): void { lastProcessed = Date.now(); }
function sendWelcomeEmail(user: User): void { ... }
```

---

## 3. The DRY Principle — Don't Repeat Yourself

**Every piece of knowledge must have a single, unambiguous, authoritative representation.**

- Duplication is the root of all evil in software — when the logic changes, you find 7 copies and miss 3
- Not all repetition is DRY violation — two similar-looking things with different reasons to change are not the same thing
- Extract shared logic when: the same logic appears 3+ times, OR it represents a meaningful concept that deserves a name
- Beware of premature DRY — forcing dissimilar things into a shared abstraction creates a worse problem than duplication (the "wrong abstraction")

```ts
// Bad — duplicated validation logic
function saveUser(data) {
  if (!data.email || !data.email.includes('@')) throw new Error('Invalid email');
  // ...
}
function updateUser(data) {
  if (!data.email || !data.email.includes('@')) throw new Error('Invalid email');
  // ...
}

// Good — extracted once
function assertValidEmail(email: string): void {
  if (!email || !email.includes('@')) throw new Error('Invalid email');
}
```

---

## 4. YAGNI — You Aren't Gonna Need It

**Don't write code for imaginary future requirements.**

- Every line of unused code is a liability: it must be read, understood, maintained, and tested
- "We might need this later" is almost never true in the way you imagine
- The cost of adding something later is almost always lower than the cost of carrying dead code
- Applies to: unused parameters, config flags that only have one value, abstraction layers with one implementation, generic interfaces when there's one consumer
- Delete code ruthlessly — version control means nothing is truly lost

---

## 5. KISS — Keep It Simple, Stupid

**Complexity is the enemy of reliability.**

- The simplest solution that works is always the correct starting point
- Complexity should only be introduced when a simpler solution has been proven insufficient
- If you can't explain your code to a junior dev in 2 minutes, it's probably too complex
- Fancy is not smart. The best engineers write boring, obvious code.
- Prefer linear code over deeply nested code — flatten conditionals, return early

```ts
// Bad — nested, hard to follow
function getDiscount(user) {
  if (user) {
    if (user.isPremium) {
      if (user.yearsActive > 2) {
        return 0.3;
      } else {
        return 0.2;
      }
    } else {
      return 0.05;
    }
  }
  return 0;
}

// Good — flat, readable guard clauses
function getDiscount(user: User | null): number {
  if (!user) return 0;
  if (!user.isPremium) return 0.05;
  if (user.yearsActive > 2) return 0.3;
  return 0.2;
}
```

---

## 6. Single Responsibility Principle (SRP)

**A module should have one — and only one — reason to change.**

- A class/component/module should represent one concept
- "Reason to change" is the key: if a UI component changes when backend data changes AND when design changes AND when business logic changes, it has 3 responsibilities
- Signs of SRP violation: large files, methods named with "and", a class that knows about unrelated domains
- Applied to React: a component that fetches data, transforms it, AND renders it has 3 responsibilities — split into a hook (fetch + transform) and a component (render)

```tsx
// Bad — one component doing everything
function UserDashboard({ userId }) {
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetch(`/api/users/${userId}`).then(r => r.json()).then(setUser);
  }, [userId]);
  const fullName = `${user?.firstName} ${user?.lastName}`.trim();
  return <div>{fullName}</div>;
}

// Good — separated
function useUser(userId: string) {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => { fetchUser(userId).then(setUser); }, [userId]);
  return user;
}
function UserDashboard({ userId }: { userId: string }) {
  const user = useUser(userId);
  return <div>{user ? formatFullName(user) : null}</div>;
}
```

---

## 7. Comments — When and When Not To

**A comment is an apology for not writing clear code.**

- Good code reads like prose — it shouldn't need narration
- Every comment is a promise to keep it updated when the code changes — most aren't
- **Good comments**: explain WHY a decision was made, warn of non-obvious consequences, TODO with a ticket reference, document public APIs
- **Bad comments**: restate what the code does, commented-out code, misleading comments, noise comments (`// constructor`)
- When you feel the urge to comment, first try to rename the variable or extract a function

```ts
// Bad comment — restates the code
// Increment counter by 1
counter++;

// Good comment — explains the WHY
// Offset by 1 because the API uses 1-based pagination
const page = requestedPage + 1;

// Commented-out code — just delete it, git has history
// const oldResult = legacyCalculate(input);
```

---

## 8. Code Smells (Things to Remove/Refactor)

**Code smells are patterns that indicate probable problems.**

| Smell | Description | Fix |
|-------|-------------|-----|
| Long function | Does too much | Extract functions |
| Long parameter list | Too many args | Group into object/config |
| Duplicate code | Same logic in multiple places | Extract and share |
| Dead code | Unused functions/variables | Delete |
| Magic numbers | Literal numbers with no context | Named constants |
| Deep nesting | 3+ levels of if/loop | Early returns, extraction |
| God class/component | One thing knows everything | Split by responsibility |
| Feature envy | A function uses another module's data more than its own | Move the function |
| Data clump | Same 3+ variables always appear together | Create a type/object |
| Primitive obsession | Using primitives where a type would be clearer | Create value types |
| Inconsistent abstraction | Mixing high and low level in one function | Separate levels |

---

## 9. Component Mindset (React/UI Specific)

**Build with Lego blocks, not poured concrete.**

### Atomic Design Hierarchy
- **Atoms**: single-purpose, no dependencies — `Button`, `Input`, `Badge`, `Icon`
- **Molecules**: atoms combined for a purpose — `SearchBar`, `FormField`, `CardHeader`
- **Organisms**: meaningful UI sections — `NavigationBar`, `EntryCard`, `SettingsPanel`
- **Templates**: page layout without content — `DashboardLayout`, `ModalLayout`
- **Pages/Views**: templates with real data — `SettingsView`, `GridView`

### Component Rules
- A component that takes 8+ props is doing too much — split it or use composition
- Prefer composition over configuration: instead of `<Card showHeader showFooter compact />`, build `<Card><CardHeader /><CardBody /><CardFooter /></Card>`
- Keep rendering logic separate from business logic — extract hooks for state management
- A component should not know how to fetch its own data AND render it — pick one
- Components at the same level of the tree should have the same level of abstraction

```tsx
// Bad — one component, all concerns
function EntryCard({ entry, onDelete, onEdit, isSelected, showRelationships }) {
  const [relationships, setRelationships] = useState([]);
  useEffect(() => { fetchRelationships(entry.id).then(setRelationships); }, [entry.id]);
  return (
    <div className={isSelected ? 'selected' : ''}>
      {/* 80 lines of JSX */}
    </div>
  );
}

// Good — composed from focused parts
function useEntryRelationships(entryId: string) { ... }

function EntryCard({ entry, isSelected, onDelete, onEdit }: EntryCardProps) {
  return (
    <Card selected={isSelected}>
      <EntryCardHeader entry={entry} />
      <EntryCardBody entry={entry} />
      <EntryCardActions onDelete={onDelete} onEdit={onEdit} />
    </Card>
  );
}
```

---

## 10. Shared and Reusable Components

**Write once, use everywhere. Discover before you build.**

- Before writing a new component, search for an existing one solving the same problem
- A component is ready to be shared when: it appears in 3+ places, OR it represents a concept that should be consistent (e.g., all error states should look the same)
- Shared components should be: stateless or minimally stateful, well-typed, well-named, documented with at least one usage example
- Don't generalize too early — extract when the third use case appears, not the first
- Shared components live in `src/components/ui/` or similar — not buried in a feature folder

### Signs a component is not yet shareable
- It imports from a specific feature module
- It has hardcoded strings or colors that belong to one context
- It requires knowledge of a specific data model to use

---

## 11. Module Design and File Organisation

**Code should be easy to find, easy to change, and hard to misuse.**

- Group by feature/domain, not by type — `src/features/capture/` not `src/components/`, `src/hooks/`, `src/utils/` as top-level silos
- Files should have one clear purpose — if the filename needs "and" or "utils", split it
- Barrel files (`index.ts`) are useful for public APIs; inside a feature folder, avoid them — they hide the actual source
- Circular dependencies are a symptom of poor module boundaries — two modules that depend on each other should probably be one module or share a third
- Keep related code close: a hook and its types should be near the component that owns them, not in a global `types.ts`

```
// Bad structure — organised by code type
src/
  components/
    EntryCard.tsx
    UserProfile.tsx
  hooks/
    useEntryCard.ts
    useUserProfile.ts
  types/
    entry.ts
    user.ts

// Better — organised by domain
src/
  features/
    entries/
      EntryCard.tsx
      useEntry.ts
      entry.types.ts
    users/
      UserProfile.tsx
      useUser.ts
      user.types.ts
  components/     ← only truly shared UI here
    Button.tsx
    Modal.tsx
```

---

## 12. The Rule of Three (When to Abstract)

**Once: just write it. Twice: notice the duplication. Three times: extract it.**

- The wrong abstraction is worse than duplication — forcing two different things into one shape creates coupling and confusion
- An abstraction earns its existence by making the call-site simpler AND the implementation easier to change
- If you need a long comment to explain how to use an abstraction, it's probably wrong
- If every new use case requires a new parameter to the abstraction, it's trying to do too much

---

## 13. Error Handling

**Errors are part of the contract, not an afterthought.**

- Don't return `null` — null is a lie that says "this always works". Use explicit error types or throw
- Catch errors at the boundary where you can do something meaningful — not inside every small function
- Error messages should be actionable: "Invalid email" is better than "Validation failed"; "API key missing — configure in Settings" is better than "Unauthorized"
- Don't swallow errors silently: `.catch(() => {})` hides bugs forever
- Use typed errors: a known error type is self-documenting; an untyped `throw new Error("something went wrong")` is useless

```ts
// Bad
function getUser(id: string) {
  try {
    return db.findUser(id);
  } catch {
    return null; // caller has no idea why
  }
}

// Good
class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`User ${id} not found`);
    this.name = 'UserNotFoundError';
  }
}
function getUser(id: string): User { // throws UserNotFoundError
  const user = db.findUser(id);
  if (!user) throw new UserNotFoundError(id);
  return user;
}
```

---

## 14. Boundaries and Interfaces

**Define the seam between modules explicitly.**

- Wrapping third-party libraries behind your own interface means you can swap them out (or mock them) without touching the rest of the codebase
- A dependency on `fetch` directly throughout your code means changing to a different HTTP client requires touching everything — wrap it once
- Types should be defined at the boundary where data enters your system (API response → domain type) and never let the external shape bleed through

```ts
// Bad — OpenRouter shape everywhere
function renderUsage(data: { usage: { prompt_tokens: number; completion_tokens: number } }) { ... }

// Good — translate at the boundary once
interface TokenUsage { inputTokens: number; outputTokens: number; }
function parseOpenRouterResponse(raw: any): TokenUsage {
  return { inputTokens: raw.usage.prompt_tokens, outputTokens: raw.usage.completion_tokens };
}
function renderUsage(usage: TokenUsage) { ... }
```

---

## 15. Small Footprint Principles

**Lines of code are a cost, not an asset.**

- Delete dead code immediately — if it's not called, it shouldn't exist
- Prefer built-ins over custom implementations: a custom sort, throttle, or deep-clone is usually worse than the platform equivalent
- Inline trivial wrappers — a function that does exactly one thing with no transformation is often noise
- Avoid defensive programming inside trusted internal code — validate at entry points (user input, API responses), trust internal functions
- Remove feature flags that only ever had one value — they're complexity with no upside
- Every abstraction, every file, every dependency has a carrying cost — only add them when they pay for themselves

---

## 16. The Boy Scout Rule

**Always leave the code cleaner than you found it.**

- When you touch a file for any reason, leave it slightly better — rename a confusing variable, extract a 3-line block into a function, delete a dead import
- This compounds: a codebase that 10 developers each improve slightly in every PR gets better over time
- This doesn't mean refactor everything in a feature PR — small, focused cleanup only
- The alternative (never cleaning up) leads to code entropy: every month the codebase becomes harder to work in

---

## 17. The Newspaper Metaphor

**Code should read top-to-bottom like an article.**

- The highest-level concepts should appear first; low-level details at the bottom
- A reader should be able to understand the "what" from the top of the file and skip to the "how" only if they need it
- Exported public functions at the top; private helpers below them
- This applies within functions too: the flow should be readable in sequence without jumping around

---

## 18. Tests as Documentation

**Tests are the most honest documentation that exists.**

- A test describes what the code should do, in a form the machine can verify — unlike comments, tests fail when they go out of date
- Test names should read as sentences: `it('returns null when user is not found')` not `it('test getUser')`
- One assertion per test (or one concept per test) — if a test fails, you know exactly what broke
- Tests should be FAST, INDEPENDENT, REPEATABLE, SELF-VALIDATING, TIMELY (the FIRST principles)
- Don't test implementation details — test observable behaviour. If you can refactor without changing tests, the tests are good.
- A test that requires 50 lines of setup is a signal that the code under test has too many dependencies

---

## Quick Reference — Red Flags in Any Codebase

| Signal | What it means |
|--------|---------------|
| File > 300 lines | Too many responsibilities |
| Function > 20 lines | Probably does too much |
| Nesting > 3 levels | Extract or use early returns |
| `// TODO` with no ticket | Work that will never happen |
| `any` type everywhere | Type system being avoided |
| Copy-pasted block found twice | DRY violation waiting to bite |
| `utils.ts` growing endlessly | No one knows where else to put things |
| Commented-out code | Should be deleted |
| `!important` in CSS | Style architecture has collapsed |
| `console.log` in production | Debugging code never removed |
| Function named `handleX` that does Y | Misleading name |
| `data`, `info`, `stuff`, `thing` | Unthought-out naming |
| Parameter named `flag` or `mode` | Boolean/enum smell |

---

## OpenBrain — Specific Issues to Fix (Priority Order)

These are concrete violations found in the current codebase, mapped to the principles above.

---

### P1 — God Components (SRP violation, Section 6 + 9)

These files each handle data fetching, transformation, and rendering in a single component. They are the root cause of most other issues below.

| File | Lines | Responsibilities |
|------|-------|-----------------|
| `src/components/QuickCapture.tsx` | 1,227 | Capture parsing, validation, API upload, file handling, voice recording, gallery |
| `src/views/VaultView.tsx` | 908 | Vault setup, unlock, decryption, secret management, bulk operations |
| `src/LoginScreen.tsx` | 851 | Auth flows, MFA, recovery codes |
| `src/views/SuggestionsView.tsx` | 839 | Question rendering, AI generation, transcription, image generation |
| `src/views/DetailModal.tsx` | 726 | Entry editing, brain linking, metadata updates |
| `src/views/RefineView.tsx` | 662 | Batch quality analysis, link discovery, suggestion application |
| `src/components/CaptureSheet.tsx` | 646 | Sheet UI, drag-to-close, voice, preview parsing |

**Fix**: Extract custom hooks for all data-fetching and business logic. Each hook owns one domain concern; the component renders only. E.g., `QuickCapture.tsx` should become `useCapture.ts` + `useCaptureVoice.ts` + `useCaptureUpload.ts` + a thin `QuickCapture.tsx` that orchestrates them.

---

### P2 — Silent Error Swallowing (Section 13)

11 places silently discard errors, making failures invisible in production:

```ts
// src/components/CaptureSheet.tsx:399
.catch(() => {})  // user never knows upload failed

// src/components/BulkUploadModal.tsx:191
.catch(() => {})  // bulk upload failure invisible

// src/components/settings/BrainTab.tsx:100, 171
.catch(() => {})  // settings saves fail silently
```

**Fix**: Every `.catch()` must do at least one of: set an error state, call a toast/notification, or rethrow. `.catch(() => {})` is never acceptable in production.

---

### P3 — Console Logs in Production (Section 8 Quick Reference)

37 files contain `console.log` statements that ship to production. Worst offenders:

- `SuggestionsView.tsx` — 13 logs
- `ProvidersTab.tsx` — 13 logs
- `useChat.ts` — multiple logs
- `ChatView.tsx`, `DetailModal.tsx`, `QuickCapture.tsx`, `CaptureSheet.tsx`

**Fix**: Delete all of them. None are guarded by `process.env.NODE_ENV`. If debug logging is needed, introduce a single `debug()` utility that no-ops in production.

---

### P4 — `any` Type Proliferation (Section 1 / naming + typing)

59 uses of `any` across the codebase, concentrated in:

- `src/hooks/useChat.ts` — 11 uses
- `src/views/SuggestionsView.tsx` — 11 uses
- `src/views/RefineView.tsx` — 4 uses
- `src/lib/ai.ts`, `src/lib/feedbackLearning.ts` — multiple uses

**Fix**: Define explicit types at API boundaries (Section 14). The OpenRouter/AI response shapes should be typed once in `src/lib/ai.types.ts` and used everywhere — not `any`.

---

### P5 — Magic Numbers Without Named Constants (Section 8)

| File | Line | Number | What it means |
|------|------|--------|--------------|
| `src/components/UndoToast.tsx` | 10 | `3000` / `5000` | Toast durations |
| `src/components/CaptureSheet.tsx` | 367 | `1000` | Byte threshold for "large" content |
| `src/components/CaptureSheet.tsx` | 412 | `1000` | Recorder interval (ms) |
| `src/components/NotificationSettings.tsx` | 174 | `8000` | Error display duration |
| `src/components/settings/DangerTab.tsx` | 25 | `5000` | Delay before destructive action |

**Fix**: Extract into named constants at the top of the file or a shared `src/lib/constants.ts`. `const TOAST_DURATION_MS = 3000` is self-documenting; `3000` is not.

---

### P6 — Type-Based File Structure (Section 11)

Current structure groups code by what it *is*, not what it *does*:

```
src/
  components/   ← everything UI
  views/        ← everything page-level
  hooks/        ← everything stateful
  lib/          ← everything else
```

This means a feature like "Capture" is split across `components/QuickCapture.tsx`, `components/CaptureSheet.tsx`, `hooks/useCapture*`, and `lib/capture*` with no clear ownership boundary.

**Fix**: Migrate toward feature folders when touching these files. Target structure:

```
src/
  features/
    capture/      QuickCapture.tsx, CaptureSheet.tsx, useCapture.ts
    vault/        VaultView.tsx, useVault.ts, vault.types.ts
    suggestions/  SuggestionsView.tsx, useSuggestions.ts
    chat/         ChatView.tsx, useChat.ts
  components/     Only truly shared atoms (Button, Modal, Toast)
  lib/            Only shared utilities with no feature ownership
```

---

### P7 — DRY Violations in API Fetch Patterns

`RefineView.tsx`, `DetailModal.tsx`, and `SuggestionsView.tsx` each implement their own fetch-then-update patterns for entries. The error handling and loading state management is copy-pasted, not shared.

**Fix**: A single `useEntryMutation` hook (or equivalent) should wrap the `authFetch('/api/update-entry')` + optimistic update + error toast pattern used in all three. Call-sites become one line instead of 15.

---

### Summary — Where to Start

1. **Delete all `console.log` calls** — 1 hour of work, immediate production quality improvement
2. **Fix silent `.catch(() => {})` blocks** — add error state or toast to each
3. **Replace magic numbers** with named constants in the files above
4. **Extract hooks from `SuggestionsView.tsx`** — it's the worst god component and most actively developed
5. **Type the AI response boundary** in `src/lib/ai.ts` — eliminates most `any` usage downstream
