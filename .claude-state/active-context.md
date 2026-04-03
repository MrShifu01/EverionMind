# Active Context — 2026-04-03
**Branch:** main | **Enhancement:** per-task AI models | **Project:** OpenBrain

## Session Summary
Designed and implemented per-task AI model selection. Spec written to AI-models.md (4 phases). Phase 1 (data layer) is fully complete and deployed to prod. Phases 2–3 are partially done — the routing layer is ready but task: params and the Settings UI were lost when a linter refactor overwrote the view files mid-session.

## Built This Session
- `AI-models.md` — full spec with pricing tier badges, vision filtering, 4-phase plan
- `supabase/migrations/007_task_models.sql` — 5 task columns on `user_ai_settings` (applied to prod)
- `src/lib/aiFetch.js` — `getModelForTask()`, `setModelForTask()`, `loadTaskModels()` helpers added
- `src/lib/ai.js` — `callAI()` accepts `task` param, resolves task-specific model for OpenRouter
- `supabase/functions/telegram-webhook/index.ts` — reads `model_chat` first before global model

## Current State
- Phase 1 complete and deployed
- Phase 2 incomplete: `task:` params NOT added to callAI() call sites (overwritten by linter)
- Phase 3 incomplete: Settings UI not added to OpenBrain.jsx (overwritten by linter)
- OpenBrain.jsx has `callAI` import + `PROMPTS.*` usage but zero `task:` params on any call
- SuggestionsView.jsx image upload hardcoded to `authFetch("/api/anthropic")` — NOT using callAI

## In-Flight Work
- Phase 2 + 3 from AI-models.md need to be completed next session

## Known Issues
- SuggestionsView.jsx ~line 168: image upload must be changed to `callAI({ task: "vision" })`
- All 8 callAI() call sites missing `task:` param

## Pipeline State
- **Last pipeline:** feature — 2026-04-03
- **Last scores:** composite 90/100
- **Open incidents:** none
