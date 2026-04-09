# User Concerns Audit

Full audit of the app from a user perspective. Covers gaps, bloat, UX snags, unnecessary features, over-complex workflows, and annoying functionality.

---

## CRITICAL — Blockers

### 1. Three redundant capture flows
**Files**: `src/components/QuickCapture.tsx` (1,500+ LOC), `src/components/CaptureSheet.tsx` (800+ LOC), `src/views/SuggestionsView.tsx`
- Quick Capture, CaptureSheet (FAB), and Fill Brain all do the same thing: take input → parse with AI → save as entry
- Massive code duplication across parsing, file upload, and voice transcription logic
- Users don't know which to use; the distinction is invisible

### 2. Onboarding is a product unto itself
**File**: `src/components/OnboardingModal.tsx` (557 lines)
- Forces 30 structured questions (personal ID, medical, legal, financial) before users can explore
- Multi-step modal (trust → use case → setup → start) feels like a SaaS signup form
- An `OnboardingChecklist.tsx` and `BrainTipCard.tsx` pile on after completion
- Questions are also culturally biased — SA phone format regex, provincial/insurance/tax structure — irrelevant to international users
- Users want to test before committing; all this friction causes abandonment

### 3. App is unusable without AI configuration
- Capture parsing, Suggestions, Refine, Chat, and Nudges all require a working AI key
- No graceful degradation (e.g., store raw text if no AI configured)
- Silent failures — user captures data, expects parsing, nothing happens
- Should show a clear "configure AI to continue" prompt rather than failing silently

---

## HIGH — Significant Friction

### 4. AI settings are intimidating
**File**: `src/components/settings/ProvidersTab.tsx`
- BYO keys for Anthropic, OpenAI, OpenRouter, Groq
- Separate embedding provider selection (OpenAI vs Google)
- Per-task model selection (capture, questions, refine, chat, vision) — 5+ independent settings
- No recommended path or sensible default highlighted
- Average user doesn't know what a model is, let alone which one to pick for each task

### 5. Multi-brain system is over-engineered for most users
**Files**: `src/components/BrainSwitcher.tsx`, `src/views/DetailModal.tsx`, `src/hooks/useBrain.ts`
- Personal / Family / Business brains, each entry shareable to multiple brains via junction table
- Requires extra DB queries everywhere (DetailModal loads `entry_brains` separately)
- For 95% of users, a single brain is sufficient
- Creates state complexity: race conditions on brain switch, stale flashes

### 6. Vault/encryption is too complex for its value
**File**: `src/views/VaultView.tsx`
- Setup flow (passphrase → confirm → recovery key), locked state with two unlock modes, separate recovery key display, PIN gate for sensitive chat queries
- 3 layers of auth for a feature most new users won't touch immediately
- PIN gate mid-chat breaks conversation context entirely
- Should be hidden/opt-in rather than a prominent nav item

### 7. Refine view is undiscovered
**File**: `src/views/RefineView.tsx`
- Finds type mismatches, missing data, split/merge suggestions, entry relationships
- Hidden behind a nav item called "Refine" — vague label, no indicator when there are issues waiting
- No proactive notification that suggestions exist
- Should be "Fix Issues" or integrated as a badge on entries

### 8. Search is weak and stranded in one view
**Files**: `src/OpenBrain.tsx` (lines 118–150)
- Search input only exists in the Grid view, inaccessible from Chat, Vault, Todos, etc.
- No filters by type, date, or tags from the search bar (they're separate UI elements)
- `searchAllBrains` toggle exists but is hidden
- Should be a Cmd+K omnisearch accessible from anywhere

---

## MEDIUM — Confusing But Functional

### 9. Settings order and organisation is wrong
**File**: `src/views/SettingsView.tsx`
- Default active tab is "Intelligence" (AI config) — least relevant for new users
- 6 tabs (Account, Intelligence, Brain, Notifications, Storage, Danger) with no logical grouping
- Danger tab requires scrolling to find
- No search within settings

### 10. Mobile navigation is fragmented
**Files**: `src/components/BottomNav.tsx`, `src/components/MobileMoreMenu.tsx`, `src/components/MobileHeader.tsx`
- Bottom nav has 5 items; Vault and Settings are buried in a "More" slide-out
- Todos not on bottom nav at all
- Brain switcher is in the header, not in the nav
- Important features are 2–3 taps away; no clear hierarchy

### 11. Entry type system is unconstrained
**File**: `src/types.ts` (EntryType = string)
- AI generates any string as a type — "person" and "Contact" are treated as different
- Grid filters enumerate all types found in data, creating an unbounded and inconsistent UI
- Some types won't have icons (resolved dynamically)
- No type guidance for users when capturing manually

### 12. Detail modal is overloaded
**File**: `src/views/DetailModal.tsx`
- Combines view, edit, delete, share to extra brains, relationships, and secret reveal
- Extra brains loading is async, causing jank on open
- Opens as a modal instead of a page — no context of the grid behind it
- Too many responsibilities in one place

### 13. Nudge system is too easy to dismiss
**File**: `src/hooks/useNudge.ts`
- Smart detection of expirations and incomplete entries, but surfaced as a small dismissible banner
- Stored in sessionStorage — reappears on every refresh even after user dismisses
- Should be a persistent notification or indicator, not a fragile banner

### 14. Fill Brain / SuggestionsView has an identity crisis
**File**: `src/views/SuggestionsView.tsx`
- Shows skipped onboarding questions, then AI-generated questions, plus photo/file/voice capture
- Three distinct capture modes in one view
- "Fill Brain" implies there's an emptiness to fill — misleading for ongoing use
- Indistinguishable from Quick Capture in terms of output

### 15. Workspace filter is invisible
**File**: `src/OpenBrain.tsx`, `src/lib/entryFilters.ts`
- Workspace can be "business", "personal", or "both" but there's no UI to change it
- Set via localStorage; hidden from users entirely
- Overlaps conceptually with the multi-brain system — one of these should go

### 16. Offline sync status is too noisy
**Files**: `src/components/DesktopSidebar.tsx`, `src/components/MobileHeader.tsx`
- "Offline", "Syncing X…", and error banners are constantly visible
- Sync state should only surface on actual failures, not as ambient status
- Creates visual anxiety for something that should "just work"

---

## LOW — Polish & Gaps

### 17. No data export
**File**: `src/components/BulkUploadModal.tsx` (import exists, no export counterpart)
- Users can bulk import but cannot bulk export
- No CSV/JSON/vCard export in Settings
- Feels like lock-in; undermines "your data, always" messaging

### 18. Duplicate detection exists but isn't surfaced
**File**: `src/lib/duplicateDetection.ts`
- Logic is built but not used in the Capture flow
- Not shown in Refine view either
- Users create duplicates unknowingly; search results become polluted

### 19. Learning engine is a black box
**Files**: `src/lib/learningEngine.ts`, `src/lib/feedbackLearning.ts`
- Tracks accept/reject decisions to improve suggestions
- No UI showing what was learned or how to reset/tune it
- Users don't know their actions are feeding a learning system — trust issue

### 20. Notification settings are half-built
**File**: `src/components/NotificationSettings.tsx`
- Tab exists in Settings
- No clear indication of what notifications will fire, when, or via what channel
- No test notification option
- Feels incomplete

### 21. Todos / calendar view is hidden and undiscovered
**File**: `src/views/TodoView.tsx` (420 lines)
- Sophisticated deadline tracking (overdue, today, tomorrow, this week, recurring)
- Hidden in the "More" menu on mobile
- Deadlines inferred from metadata rather than explicit fields — users don't know to capture them
- Should be a primary nav item or flagged in onboarding

### 22. Error messages are inconsistent
- Some errors are toasts, some are inline, some are in modals, some are console-only
- Messages are often technical ("HTTP 502 — Bad Gateway")
- No standard pattern for "what went wrong" + "what to do next"

### 23. Prompts are hardcoded — AI quality can't improve without a deploy
**File**: `src/config/prompts.ts`
- All AI prompts are baked into the build
- Improving AI output requires a code change + Vercel deployment
- No prompt versioning or A/B testing

### 24. Cache invalidation strategy is unclear
**Files**: `src/lib/entriesCache.ts`, `SearchIndex`, `localStorage`
- Entries, search index, and brain state are cached in multiple layers
- No clear invalidation on update — edits can look unsaved
- Brain switching can briefly show stale data

---

## Summary by Priority

| Priority | Count | Theme |
|----------|-------|-------|
| Critical | 3 | Consolidate capture, simplify onboarding, graceful AI fallback |
| High | 5 | AI setup, brain system, vault, search, refine discoverability |
| Medium | 8 | Nav, settings, types, modals, nudges, workspace, offline noise |
| Low | 7 | Export, duplicates, learning transparency, notifications, todos, errors, cache |
