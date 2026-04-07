# OpenBrain — Master Sprint File
> Synthesised from: full-app-audit (2026-04-07) · security_audit.md · architecture_audit.md · MASTER.md · audit1.md (intelligence improvements)  
> Last updated: 2026-04-07  
> Overall app score: **63/100 — C+** → target **82/100** after all sprints complete

---

## How to Read This File

Each item has:
- **ID** — unique reference for commits and PRs
- **Sev** — CRITICAL / HIGH / MEDIUM / LOW
- **Why** — the actual risk or user pain
- **Files** — exact files to touch
- **AC** — acceptance criteria (how you know it's done)

Items are ordered by blast radius × ease. Do phase 0 today. Do sprint 1 before any feature work.

---

## PHASE 0 — DO TODAY (Manual Actions, No Code)

These cannot be fixed with a PR. They are live security risks right now.

| # | Action | Why | How |
|---|--------|-----|-----|
| P0-1 | **Revoke leaked Telegram Bot Token** | GitGuardian flagged commit `d811ad2` — token is live and exploitable | @BotFather → `/revoke` → generate new token → update `BOT_TOKEN` / `TELEGRAM_BOT_TOKEN` in Supabase env vars |
| P0-2 | **Rotate Vercel OIDC token** | `.env.local` committed with live OIDC JWT (team_id, project_id, environment claims) | Vercel Dashboard → Settings → Tokens → Rotate |
| P0-3 | **Update Supabase Magic Link email template** | OTP code not visible in PWA sign-in emails → users can't log in | Supabase → Auth → Email Templates → Magic Link → add `{{ .Token }}` |
| P0-4 | **Run migration 013 in Supabase SQL editor** | `entries_type_check` constraint blocks AI-generated flexible types | Run `supabase/migrations/013_flexible_entry_types.sql` manually |
| P0-5 | **Add `RESEND_API_KEY` to Vercel env vars** | Brain invite emails not delivered without it | resend.com → create key → Vercel → Settings → Env Vars. Also add `APP_URL=https://open-brain-ib4e.vercel.app` |
| P0-6 | **Clean .env.local from git history** | Secrets committed, rotation alone doesn't remove them from history | `git filter-repo --path .env.local --invert-paths` then force-push. Verify `.env.local` is in `.gitignore`. |

---

## SPRINT 1 — Security Hardening
**Goal:** No known exploitable vulnerabilities. Score target: Security 62 → 80.

---

### S1-1 · Add Content-Security-Policy header
**Sev:** HIGH  
**Why:** XSS has zero browser-enforced fallback without CSP. Particularly dangerous because BYO API keys live in localStorage.  
**Files:** `vercel.json`  
**AC:** `curl -I https://open-brain-ib4e.vercel.app` returns `Content-Security-Policy` header. Policy at minimum: `default-src 'self'; connect-src 'self' https://*.supabase.co https://api.anthropic.com https://api.openai.com https://openrouter.ai https://api.groq.com; script-src 'self'; style-src 'self' 'unsafe-inline'`

```json
{ "key": "Content-Security-Policy", "value": "default-src 'self'; connect-src 'self' https://*.supabase.co https://api.anthropic.com https://api.openai.com https://openrouter.ai https://api.groq.com https://api.resend.com; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:" }
```

---

### S1-2 · Remove PIN hash from localStorage (complete ARCH-6)
**Sev:** HIGH  
**Why:** PBKDF2 hash stored in `localStorage` is XSS-readable. Server-side PIN verify endpoint (`api/pin.ts`) already exists — localStorage copy is now redundant.  
**Files:** `src/lib/pin.tsx`  
**AC:**  
- `storePin()` no longer writes combined hash to localStorage (only pushes to server)  
- `verifyPin()` only uses server endpoint; localStorage fallback removed  
- `getStoredPinHash()` deprecated — only used internally for legacy migration path  
- Existing users with legacy SHA-256 hashes are migrated on next login (migrate step already handles this)

---

### S1-3 · Block vault secrets from being sent to non-Anthropic providers
**Sev:** HIGH  
**Why:** `api/chat.ts` injects decrypted vault secrets into the system prompt and sends to OpenRouter/OpenAI — user secrets leave OpenBrain's control.  
**Files:** `api/chat.ts`, `src/lib/ai.ts`  
**AC:**  
- If `provider !== "anthropic"` and system prompt contains vault-sourced content, return a 400 with `{ error: "Vault content can only be used with Anthropic provider" }`  
- Frontend shows a clear message: "Switch to Anthropic to use vault content in chat"

---

### S1-4 · Upgrade cron auth to HMAC-signed requests (SEC-16)
**Sev:** HIGH  
**Why:** Static `CRON_SECRET` bearer token is replayable. HMAC with timestamp prevents replay attacks.  
**Files:** `api/cron/push.ts`  
**AC:**  
- Cron handler verifies `HMAC-SHA256(CRON_SECRET, timestamp)` where timestamp must be within 60s  
- Add Vercel IP allowlist `76.76.21.0/24` in `vercel.json` as a second layer  
- `CRON_SECRET` rotated after deploy

---

### S1-5 · Validate individual message structure in LLM proxy
**Sev:** MEDIUM  
**Why:** `messages` array passes through to Anthropic/OpenAI with no per-message validation. Image blocks or tool_use blocks are expensive and were not user-intended.  
**Files:** `api/llm.ts`  
**AC:**  
- Each message validated: `role` must be `"user"` or `"assistant"`, `content` must be string or array of text blocks only  
- Image blocks rejected with 400: `{ error: "Image content not permitted via proxy" }`  
- Tool_use/tool_result blocks rejected with 400

---

### S1-6 · Fix x-forwarded-for rate limit bypass
**Sev:** MEDIUM  
**Why:** Rate limiter takes `x-forwarded-for` at face value — a single attacker can forge this header to create unlimited virtual IPs and bypass rate limiting.  
**Files:** `api/_lib/rateLimit.ts`  
**AC:**  
- Use the **last** IP in the `x-forwarded-for` chain (closest verified hop) rather than the first  
- Add `x-real-ip` as fallback (Vercel sets this, it's harder to spoof)  
- Document the decision: "First hop is user-controlled; last hop is Vercel-edge-set"

---

### S1-7 · Encrypt learnings stored in localStorage
**Sev:** MEDIUM  
**Why:** `learningEngine.ts` stores user behavior patterns (decisions, original values, edits) in plaintext. Reveals user preferences to any XSS.  
**Files:** `src/lib/learningEngine.ts`  
**AC:**  
- Learnings either moved to server-side `user_ai_settings` JSONB column, OR encrypted client-side using the vault key if available  
- If vault not unlocked, learnings stored in sessionStorage only (not persisted)

---

### S1-8 · Add MIME type validation to file uploads
**Sev:** MEDIUM  
**Why:** `src/lib/fileParser.ts` checks file extension only. Malicious content in a renamed file won't be caught.  
**Files:** `src/lib/fileParser.ts`  
**AC:**  
- Read first 4 bytes and validate magic numbers for accepted types (PDF: `%PDF`, DOCX: `PK\x03\x04`, CSV: no magic but enforce text/* MIME)  
- Reject files where declared extension mismatches detected content type

---

### S1-9 · Brain API key hashing
**Sev:** MEDIUM  
**Why:** Brain API keys stored in plaintext in `brain_api_keys` table. If Supabase is ever breached, all keys exposed.  
**Files:** `api/brains.ts`, Supabase migration  
**AC:**  
- New keys hashed with bcrypt/argon2 before storage  
- Key shown in full only once at creation (copy prompt in UI)  
- Existing plaintext keys migrated at next use

---

### S1-10 · Set up CI/CD pipeline
**Sev:** HIGH (maintainability risk = security risk over time)  
**Why:** Zero automated gates on PRs. Regressions ship silently.  
**Files:** `.github/workflows/ci.yml` (new file)  
**AC:**  
- GitHub Actions workflow runs on every PR: `npm run typecheck && npm run lint && npm run test`  
- Build failure blocks merge  
- Optional: Vercel preview deployment comment on PR

---

## SPRINT 2 — Architecture & Code Quality
**Goal:** OpenBrain.tsx decomposed, TypeScript enforced, silent failures surfaced. Score target: Architecture 58 → 72, Code Quality 52 → 68.

---

### S2-1 · Complete OpenBrain.tsx decomposition (continue arch improvements worktree)
**Sev:** HIGH  
**Why:** At 21,500+ tokens with `@ts-nocheck`, the main component is a blast radius bomb. Every PR touching it risks breaking unrelated features. Architecture improvements are already in progress in a worktree.  
**Files:** `src/OpenBrain.tsx`, `src/context/EntriesContext.tsx`, `src/context/BrainContext.tsx`  
**AC:**  
- Chat state + handlers extracted to `src/context/ChatContext.tsx` or `src/hooks/useChat.ts`  
- Undo/delete state + handlers extracted to `src/hooks/useEntryActions.ts`  
- Nudge state moved to `src/hooks/useNudge.ts`  
- `OpenBrain.tsx` drops below 300 lines and acts only as a layout compositor  
- `@ts-nocheck` removed — all TypeScript errors fixed

---

### S2-2 · Create unified SearchStrategy interface (architecture_audit item 1)
**Sev:** MEDIUM  
**Why:** Three search mechanisms (`searchIndex.ts`, `chatContext.ts`, semantic pgvector) have no shared interface. Callers must know which to call. Adding a fourth breaks three files.  
**Files:** `src/lib/searchIndex.ts`, `src/lib/chatContext.ts`, `src/lib/search.ts` (new), `src/OpenBrain.tsx`  
**AC:**  
- `SearchStrategy` interface exported: `search(query: string, entries: Entry[], brainId?: string): Promise<ScoredEntry[]>`  
- `tokenSearch`, `keywordSearch`, `semanticSearch` all implement this interface  
- `OpenBrain.tsx` calls a single `search()` that routes internally  
- Existing test coverage passes

---

### S2-3 · Split aiFetch.ts into three focused modules (architecture_audit item 2)
**Sev:** MEDIUM  
**Why:** `aiFetch.ts` mixes 3 concerns — localStorage settings R/W, task→model routing, and embed header generation. 6 modules import it just to get headers.  
**Files:** `src/lib/aiFetch.ts` → split into `src/lib/aiConfig.ts`, `src/lib/aiHeaders.ts`, `src/lib/modelRouter.ts`  
**AC:**  
- `aiConfig.ts`: all localStorage R/W for AI settings (getUserApiKey, setUserProvider, etc.)  
- `aiHeaders.ts`: `getEmbedHeaders()`, `aiFetch()` wrapper  
- `modelRouter.ts`: `getModelForTask()`, `getUserModel()`, `callAI()` routing  
- All existing imports updated  
- No behaviour change

---

### S2-4 · Create EntryRepository abstraction (architecture_audit item 3)
**Sev:** MEDIUM  
**Why:** Entry save pipeline is shattered across 5 steps (OpenBrain.tsx → offlineQueue → useOfflineSync → /api/capture → cache). No single seam to test.  
**Files:** `src/lib/entryRepository.ts` (new), `src/OpenBrain.tsx`, `src/hooks/useOfflineSync.ts`  
**AC:**  
- `EntryRepository` class with `save(entry)`, `update(id, patch)`, `delete(id)`, `restore(id)` methods  
- Internally handles: optimistic update → queue offline op → sync when online → update cache  
- `OpenBrain.tsx` calls `repository.save()` instead of inline fetch + queue + cache sequence  
- Unit test: `EntryRepository` with mock backend passes save → sync → cache update flow

---

### S2-5 · Make learning engine injection explicit (architecture_audit item 4)
**Sev:** MEDIUM  
**Why:** `learningEngine.ts` silently appends to every AI system prompt in `ai.ts`. Callers have no visibility. If learnings corrupt, AI behaves mysteriously.  
**Files:** `src/lib/learningEngine.ts`, `src/lib/ai.ts`  
**AC:**  
- `callAI()` accepts an optional `withLearnings?: boolean` param (default `false`)  
- Only the chat handler passes `withLearnings: true`  
- System prompt injection is visible in the call site, not hidden in a shared util

---

### S2-6 · Create StorageAdapter (architecture_audit item 5)
**Sev:** MEDIUM  
**Why:** 64 direct `localStorage` accesses across 8 modules with hardcoded string keys. No migration path, no namespacing discipline, hard to test.  
**Files:** `src/lib/storage.ts` (new), `src/lib/aiFetch.ts`, `src/lib/learningEngine.ts`, `src/lib/entriesCache.ts`, `src/lib/offlineQueue.ts`  
**AC:**  
- `StorageAdapter` with typed `get<T>(key)`, `set(key, value)`, `remove(key)` methods  
- All hardcoded `localStorage.getItem/setItem` calls replaced with adapter calls  
- Adapter swappable to in-memory in tests (no fake-indexeddb needed for storage-dependent tests)  
- Key registry constant file prevents key typos

---

### S2-7 · Fix silent `.catch(() => {})` blocks (CODE-2)
**Sev:** MEDIUM  
**Why:** Data-loss failures are invisible to the user. Silent swallowing masks real bugs in production.  
**Files:** `src/OpenBrain.tsx` lines ~281, ~376, ~416, ~604  
**AC:**  
- Every catch on a user-visible operation calls `showError()` or `captureError()` from `src/lib/notifications.ts`  
- Every catch on background/fire-and-forget operations at minimum `console.error()`s  
- Zero remaining `catch(() => {})` or `catch { /* ignore */ }` on critical paths

---

### S2-8 · Fix stale closure and missing hook deps
**Sev:** MEDIUM  
**Files:** `src/OpenBrain.tsx`  
**Why:** `UndoToast` useEffect missing `duration` and `onDismiss` deps. `VirtualGrid` reads `window.innerWidth` without resize listener.  
**AC:**  
- `UndoToast` effect deps corrected or effect restructured to not need them  
- `VirtualGrid` uses `useWindowSize()` hook with resize event listener, or `ResizeObserver`  
- All `eslint-disable-line react-hooks/exhaustive-deps` have comments explaining why suppressed

---

### S2-9 · Remove `prop-types` dependency
**Sev:** LOW  
**Files:** `package.json`  
**Why:** Project is full TypeScript. `prop-types` is a dead dependency adding to bundle.  
**AC:** `prop-types` removed from `dependencies`. No runtime errors after removal.

---

### S2-10 · Update offlineSync deprecated API path
**Sev:** LOW  
**Files:** `src/hooks/useOfflineSync.ts:53`  
**Why:** `raw-capture` ops still call `/api/anthropic` which is now a rewrite alias. Works today but would break if the alias is ever removed.  
**AC:** `useOfflineSync.ts` calls `/api/llm?provider=anthropic` directly. The alias still exists so existing queued ops drain correctly.

---

## SPRINT 3 — Critical Bug Fixes
**Goal:** Fix data-loss and UX-breaking bugs. Items from MASTER.md critical section.

---

### S3-1 · Surface offline sync failures to user
**Sev:** CRITICAL  
**Why:** After 3 failed retries, operations are silently discarded. User loses data with no indication. Already in `failedOps` store — just needs UI.  
**Files:** `src/OpenBrain.tsx`, `src/views/SettingsView.tsx`  
**AC:**  
- Persistent banner shows when `failedOps.length > 0`: "X operations failed to sync — tap to review"  
- Settings → Sync section shows failed ops with: entry title, error, timestamp, "Retry" and "Discard" buttons  
- `clearFailedOps()` called on discard; retry re-queues the op

---

### S3-2 · Full account export
**Sev:** HIGH  
**Why:** No scheduled Supabase backups. No user-initiated export of all brains + vault keys. Critical for data portability (POPIA/GDPR requirement when platform opens).  
**Files:** `api/transfer.ts` (extend), `src/views/SettingsView.tsx`  
**AC:**  
- `GET /api/transfer?format=json&scope=full` exports all brains + all entries + all links as JSON  
- Export includes vault salt + verify token (user can re-import and re-unlock)  
- Export button in Settings → Data → "Export all data"  
- Vercel timeout handled: stream response or paginate internally

---

### S3-3 · Fix embedding provider mismatch warning
**Sev:** HIGH  
**Why:** Switching embedding providers mid-use creates incompatible vector spaces. Semantic search returns garbage silently.  
**Files:** `src/views/SettingsView.tsx`, `src/lib/aiFetch.ts`  
**AC:**  
- When user changes embed provider, show modal: "You have N embedded entries using [old provider]. Changing will break semantic search until you re-embed. Re-embed all? (costs ~$X)"  
- "Re-embed all" button calls `POST /api/embed` with all entry IDs  
- If user declines, warning icon on search bar until resolved

---

### S3-4 · Add metadata schema validation in capture
**Sev:** HIGH  
**Why:** Freeform JSONB metadata allows AI to output `phon` instead of `phone`, `due_date: "ASAP"`. Downstream features (reminders, cost tracking) break silently.  
**Files:** `api/capture.ts`  
**AC:**  
- Known field names normalised: `phon`/`phone_number` → `phone`, `dueDate`/`due` → `due_date`  
- Date fields validated: if value doesn't parse as ISO date, field is set to `null` with `console.warn`  
- Unknown fields preserved (not stripped) — flexible schema, just normalised

---

### S3-5 · Show persistent banner for failed saves
**Sev:** HIGH  
**Why:** `saveError` state set in OpenBrain.tsx but not consistently shown to user. Users don't know when a capture silently failed.  
**Files:** `src/OpenBrain.tsx`  
**AC:**  
- Any failed save shows a toast via `showError()` with the entry title and a "Retry" option  
- Toast auto-dismisses after 10s; error persists in `failedOps` (see S3-1)

---

### S3-6 · Vault TOCTOU fix
**Sev:** MEDIUM  
**Why:** Check-then-insert for vault setup has a time-of-check/time-of-use race. Two simultaneous requests could create duplicate vault rows.  
**Files:** `api/user-data.ts` (vault handler), Supabase migration  
**AC:**  
- `UNIQUE` constraint on `vault_keys(user_id)` in new migration  
- Insert uses `ON CONFLICT DO UPDATE` (upsert) instead of check-then-insert

---

### S3-7 · Fix capture prompt workspace field handling
**Sev:** LOW  
**Why:** CAPTURE prompt outputs `"workspace"` field but `api/capture.ts` ignores it. AI effort wasted; workspace assignment never happens.  
**Files:** `api/capture.ts`, `src/config/prompts.ts`  
**AC:**  
- Either: map `workspace` field to `brain_id` selection (if user has a workspace-labelled brain)  
- Or: remove `workspace` from the CAPTURE prompt entirely  
- No silent discard either way

---

## SPRINT 4 — Performance & Observability
**Goal:** Real-world performance visibility. No blocking perf issues. Score target: Performance 68 → 78.

---

### S4-1 · Add error observability (Sentry)
**Sev:** HIGH  
**Why:** Zero visibility into production errors. The first sign of a bug is a user complaint.  
**Files:** `src/main.tsx`, `src/ErrorBoundary.tsx`, `.env` / Vercel env vars  
**AC:**  
- Sentry SDK initialised in `main.tsx` with `VITE_SENTRY_DSN` env var  
- `ErrorBoundary` calls `Sentry.captureException(error)`  
- `captureError()` in `src/lib/notifications.ts` also reports to Sentry  
- Source maps uploaded on build (`vite-plugin-sentry` or `@sentry/vite-plugin`)  
- Verify: throw a test error, confirm it appears in Sentry dashboard

---

### S4-2 · Lazy-load Supabase SDK (PERF — initial bundle)
**Sev:** MEDIUM  
**Why:** Supabase SDK is ~200KB of the initial bundle. Only needed after auth check.  
**Files:** `src/lib/supabase.ts`, `src/App.tsx`  
**AC:**  
- `supabase.ts` exports a lazy-initialised client: `getSupabase()` returns the client, initialising on first call  
- Dynamic import used so the SDK chunk is separate from the main bundle  
- Lighthouse TTI improves by ≥500ms on a simulated 3G connection

---

### S4-3 · Debounce `findConnections` and add bulk import flag (PERF-6)
**Sev:** MEDIUM  
**Why:** Connection finder fires on every entry during Fill Brain bulk import, hammering the AI API with N calls.  
**Files:** `src/lib/connectionFinder.ts`, `src/OpenBrain.tsx` (or wherever Fill Brain is triggered)  
**AC:**  
- 5s debounce on `findConnections()` calls  
- `isBulkImporting` ref set to `true` during batch; `findConnections` no-ops while true  
- Single `findConnections` pass triggered after bulk import completes  
- AI API call count during 10-entry import drops from 10 to 1

---

### S4-4 · Add notification test button + quiet hours
**Sev:** MEDIUM  
**Why:** Users can't verify push notifications work. No quiet hours = late-night pings.  
**Files:** `src/views/SettingsView.tsx`, `src/components/NotificationSettings.tsx`  
**AC:**  
- "Send test notification" button in Notifications settings → triggers a push to current device  
- Quiet hours time picker (start/end) stored in `user_ai_settings`  
- Cron handler checks quiet hours before sending

---

### S4-5 · Add `@vercel/analytics` (already have speed-insights, add analytics)
**Sev:** LOW  
**Files:** `src/main.tsx`  
**AC:** Vercel Analytics dashboard shows page view and custom event data within 24h of deploy

---

## SPRINT 5 — UX Polish & Missing Features
**Goal:** Ship the missing UI pieces. Score target: UX/UI 78 → 86.

---

### S5-1 · Build per-task model picker UI in Settings
**Sev:** HIGH  
**Why:** Data layer (`getModelForTask`, `loadTaskModels`) and backend wiring are complete. The Settings UI is the only missing piece.  
**Files:** `src/views/SettingsView.tsx`  
**AC:**  
- Collapsible "Advanced: per-task models" section, visible only when `provider === "openrouter"`  
- Dropdowns for: Entry capture, Fill Brain questions, Image reading, Refine collection, Brain chat  
- Top option: "Same as global default" (saves `null`)  
- `vision` dropdown filters to image-capable models only  
- Price tier badges (`Free` / `Cheap` / `Normal` / `Expensive`) on all model dropdowns  
- Settings loaded from `user_ai_settings` on mount

---

### S5-2 · Accessibility audit pass
**Sev:** HIGH  
**Why:** Most icon-only buttons lack `aria-label`. No keyboard navigation for modals. WCAG AA is a baseline expectation for a PWA.  
**Files:** `src/OpenBrain.tsx`, `src/components/BottomNav.tsx`, `src/components/MobileHeader.tsx`, all views  
**AC:**  
- Every icon-only button has `aria-label`  
- All modals trap focus and return focus on close  
- `aria-live="polite"` region for toast/error notifications  
- All interactive elements have `focus-visible` ring styles  
- Screen reader test: VoiceOver/TalkBack can navigate capture flow without visual reference

---

### S5-3 · Mobile touch target audit
**Sev:** MEDIUM  
**Why:** Many buttons are below the 44px minimum touch target. Particularly bad on the bottom nav and action chips.  
**Files:** `src/components/BottomNav.tsx`, `src/components/MobileHeader.tsx`, `src/views/DetailModal.tsx`  
**AC:**  
- All interactive elements have `min-height: 44px` and `min-width: 44px` (or `p-3` equivalent)  
- Tap target audit using Chrome DevTools shows zero elements below 44×44

---

### S5-4 · View transitions between tabs
**Sev:** MEDIUM  
**Why:** Switching views feels abrupt on mobile. A 150ms cross-fade is the minimum UX baseline for a PWA.  
**Files:** `src/OpenBrain.tsx`  
**AC:**  
- CSS `@keyframes fade-in` + `animation: fade-in 150ms ease-out` applied on view mount  
- No layout shift during transition  
- Respects `prefers-reduced-motion`

---

### S5-5 · Add onboarding re-access
**Sev:** MEDIUM  
**Why:** Onboarding shown once, hidden forever. Users on a new device or who want a refresher have no way back.  
**Files:** `src/views/SettingsView.tsx`, `src/components/OnboardingModal.tsx`  
**AC:**  
- Settings → "Restart onboarding" button fires `window.dispatchEvent(new Event("openbrain:restart-onboarding"))`  
- Onboarding modal re-shows with brain-type selection intact

---

### S5-6 · "Who do I call?" / "What's open?" — improve chat quick-chips
**Sev:** LOW  
**Why:** Current 4 chips are static. Should reflect the user's actual brain type and recent entries.  
**Files:** `src/OpenBrain.tsx` (chat chips section)  
**AC:**  
- Chips dynamically generated based on entry types present in brain  
- Supplier brain: "Who do I call?", "What's my supplier's number?", "What's on order?"  
- Personal brain: "What's my ID number?", "When does X expire?", "Who should I call about Y?"  
- At most 4 chips, selected by frequency of that entry type

---

## SPRINT 6 — Intelligence & Search
**Goal:** Search actually learns from the user. Semantic search is the default. Score target: User Perspective 72 → 82.

---

### S6-1 · Hybrid search (keyword + semantic blended)
**Sev:** HIGH  
**Why:** Current search is token-based only. Semantic search exists (`/api/search`) but isn't used in the main search bar.  
**Files:** `src/lib/searchIndex.ts`, `src/OpenBrain.tsx`, `src/lib/search.ts` (from S2-2)  
**AC:**  
- Search bar results blend keyword score (weight 0.4) + semantic score (weight 0.6) when embeddings available  
- Falls back to keyword-only when offline or embeddings not set up  
- Result latency ≤300ms for keyword; ≤800ms for hybrid (semantic call runs in parallel)

---

### S6-2 · Click-Through Ranking (implicit feedback learning)
**Sev:** HIGH  
**Why:** Highest ROI learning signal. Which result the user actually opens reveals what's relevant — no explicit rating needed.  
**Files:** `src/lib/searchIndex.ts`, new Supabase table `user_interactions`  
**AC:**  
- On entry card click from search: log `{ user_id, entry_id, query, action: "view", timestamp }` to `user_interactions`  
- `scoreEntriesForQuery()` blends: `(semantic_score × 0.7) + (interaction_score × 0.3)`  
- Interaction score decays over 30 days (most recent click = 1.0, 30 days ago = 0.0)  
- Zero UI change — learning happens silently

---

### S6-3 · Query expansion for dead searches
**Sev:** HIGH  
**Why:** When search returns <3 results, the user is stuck. Query expansion using the semantic graph surfaces related content automatically.  
**Files:** `src/lib/searchIndex.ts`, `src/OpenBrain.tsx`  
**AC:**  
- If `results.length < 3`, pull semantic neighbors from pgvector graph (threshold 0.4)  
- Append neighbor tags to query and re-score  
- Show "Expanded search to: [tag1, tag2]" badge above results  
- User can dismiss expansion

---

### S6-4 · Fuzzy matching for search typos
**Sev:** MEDIUM  
**Why:** "Burget" returns nothing. Levenshtein distance-1 matching is standard in any search system.  
**Files:** `src/lib/searchIndex.ts`  
**AC:**  
- Token search allows 1-character edit distance for query terms >4 chars  
- Fuzzy matches scored at 0.7× exact matches  
- No new dependency needed (`fast-levenshtein` already in node_modules)

---

### S6-5 · Automatic link suggestions on entry create
**Sev:** MEDIUM  
**Why:** Users manually linking entries is 90% of the knowledge graph work. Semantic suggestions reduce this to accept/reject.  
**Files:** `src/views/DetailModal.tsx` (or QuickCapture post-save), `api/search.ts`  
**AC:**  
- After saving a new entry, run similarity search against existing entries (threshold 0.7)  
- Show top 3 suggestions: "This looks related to [X] — link it?"  
- Accept creates an entry_link; dismiss suppresses for this entry  
- Suggestion UI does not block the save flow

---

### S6-6 · Search result highlighting
**Sev:** MEDIUM  
**Why:** Users can't see why a result matched. Highlighting the matched terms builds trust in search.  
**Files:** `src/OpenBrain.tsx` (EntryCard), `src/lib/searchIndex.ts`  
**AC:**  
- `searchIndex` returns `matchedTerms[]` alongside results  
- `EntryCard` wraps matched terms in `<mark>` tags when rendered from search  
- Title + content both highlighted  
- No highlighting when search is empty (normal browse mode)

---

### S6-7 · Staleness detection
**Sev:** MEDIUM  
**Why:** Entries not updated in 6+ months may be outdated. Proactive flagging prevents stale knowledge from being trusted.  
**Files:** `src/OpenBrain.tsx`, `src/views/DetailModal.tsx`  
**AC:**  
- Entries with `updated_at` > 180 days show a subtle amber dot  
- DetailModal shows: "Last updated [date] — still accurate?"  
- "Mark as current" button updates `updated_at` timestamp without content change

---

### S6-8 · Knowledge graph traversal in chat (2-hop context)
**Sev:** MEDIUM  
**Why:** Chat currently includes only the top-N entries. When user asks about a supplier, their linked contacts/reminders are excluded.  
**Files:** `api/chat.ts` or `src/lib/chatContext.ts`  
**AC:**  
- When building chat context, for each top-5 entry, include 1-hop linked entry titles  
- Total context expands to top-5 entries + their direct links (max 15 additional)  
- System prompt token count validated to stay within model's context window  
- Chat responses noticeably more connected for entity-related questions

---

## SPRINT 7 — Scale & Platform Foundations
**Goal:** Architecture ready for 1,000 brains. Community Brain shipped. Items from strategic roadmap Phase 1.

---

### S7-1 · Community Brain — Phase 1 (join links + public discovery)
**Sev:** HIGH (strategic)  
**Why:** Communities lose institutional knowledge every time a committee rotates. Community Brain is permanent collective memory for groups.  
**Spec:** `docs/superpowers/specs/2026-04-03-community-brain-design.md`  
**Plan:** `docs/superpowers/plans/2026-04-03-community-brain.md`  
**AC:** Per spec document. Phase 1: community type, join link, member list.

---

### S7-2 · Agentic scheduled tasks (Vercel Cron)
**Sev:** HIGH (strategic)  
**Why:** The app is reactive. Proactive intelligence (expiry alerts, memory synthesis, gap analysis) requires scheduled agents.  
**Files:** `api/cron/` (new handlers), `vercel.json`  
**AC:**  
- Memory Synthesizer: weekly rewrite of `user_memory` from recent entries  
- Expiry Agent: 30/7/1-day push notifications for documents with `due_date`  
- Gap Analyst: weekly scan for common entry types missing from brain  
- All agents run via existing Vercel Cron + `api/cron/push.ts` pattern

---

### S7-3 · N+1 query fixes
**Sev:** MEDIUM  
**Why:** Batch embed runs N separate PATCH requests. Chat link query builds an OR filter per link ID.  
**Files:** `api/embed.ts`, `api/chat.ts`  
**AC:**  
- `api/embed.ts` batch embed uses single `PATCH /rest/v1/entries?id=in.(id1,id2,...)` with array body  
- `api/chat.ts` link query uses `.in()` filter, not N individual OR clauses  
- Both verified with Supabase explain — single query each

---

### S7-4 · Brain isolation enforcement (Scaling Architecture Phase 3)
**Sev:** MEDIUM (critical at 1,000 brains)  
**Why:** At scale, a single cross-brain leak is catastrophic. Currently relies on application-level checks.  
**Files:** Supabase RLS policies, `api/_lib/checkBrainAccess.ts`  
**AC:**  
- RLS enabled on ALL tables with `brain_id` column  
- Supabase policies enforce `brain_id` matches authenticated user's membership  
- Application-level `checkBrainAccess` kept as defence-in-depth, not sole guard  
- Isolation test: `SELECT * FROM entries WHERE brain_id = [other user's brain]` returns 0 rows via Supabase client

---

### S7-5 · AI provider routing unification (architecture_audit item 6)
**Sev:** MEDIUM  
**Why:** Adding a new AI provider requires touching 5+ places. Frontend routing and backend handlers are not in sync by contract.  
**Files:** `src/lib/ai.ts`, `api/llm.ts`, `vercel.json`  
**AC:**  
- Single `callAI({ provider, model, messages })` on frontend — no provider-specific branches  
- `api/llm.ts` handles all providers via `?provider=` param (already done for anthropic/openai/openrouter)  
- Frontend routing test: adding a new provider requires exactly 2 changes (config list + vercel.json rewrite)

---

### S7-6 · Entry versioning
**Sev:** MEDIUM (strategic)  
**Why:** Users have no recoverability for accidental edits. Brain API key hashing requires this pattern too.  
**Files:** Supabase migration (new `entry_versions` table), `api/entries.ts`  
**AC:**  
- `entry_versions(id, entry_id, content, metadata, saved_at)` table  
- On every PATCH, previous version written to `entry_versions`  
- `GET /api/entries?id=X&action=versions` returns version list  
- DetailModal "History" tab shows last 5 versions with restore button

---

## Quick Reference — Effort Summary

| Sprint | Items | Estimated Sessions | Score Delta |
|--------|-------|--------------------|-------------|
| Phase 0 | 6 manual actions | 1 hour (today) | Security: immediate risk resolved |
| Sprint 1 | 10 items | 3–4 sessions | Security: 62 → 80 |
| Sprint 2 | 10 items | 4–5 sessions | Arch: 58 → 72, Quality: 52 → 68 |
| Sprint 3 | 7 items | 2–3 sessions | User trust: data loss fixed |
| Sprint 4 | 5 items | 2 sessions | Performance: 68 → 78 |
| Sprint 5 | 6 items | 3 sessions | UX: 78 → 86 |
| Sprint 6 | 8 items | 4 sessions | Intelligence: qualitative leap |
| Sprint 7 | 6 items | 5–6 sessions | Scale: platform-ready |

**Projected overall score after all sprints: 82/100**

---

## What to Leave Alone

Per MASTER.md — these are working well and should not be touched without specific reason:

- Vault encryption (AES-256-GCM, non-extractable keys, PBKDF2 310k iterations, recovery key)
- Auth flow (Supabase JWT + verifyAuth + checkBrainAccess)
- Input validation on API routes (caps are correct)
- Offline-first architecture (IndexedDB + localStorage fallback)
- AI prompt design (structured, format-enforced)
- Multi-brain role-based access system
- Refine view (unique, well-designed feature)
