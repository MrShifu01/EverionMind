# Active Context — 2026-04-16
**Branch:** main | **Enhancement:** production | **Project:** EverionMind

## Session Summary
Upgraded the MCP server from a thin database wrapper to a multi-step reasoning agent, fixed concept graph quality by enforcing categorical theme-level labels, and added a per-entry concept rewrite button in the DetailModal edit view. All changes committed and pushed to main (4f4ee1b).

## Built This Session
- `api/mcp.ts` — Added ask_everionmind, submit_everionmind_feedback, debug_everionmind_retrieval tools; prompts/list + prompts/get; serverInfo.instructions with full system prompt; APP_URL startup warning log
- `api/chat.ts` — Renamed OpenBrain → EverionMind in CHAT_SYSTEM (both occurrences); added internal MCP bypass auth (x-internal-uid + service-role bearer key)
- `src/config/prompts.ts` — COMBINED_AUDIT TASK 4: added strict concept label rules (categorical only, no possessives, no proper nouns, max 3 words, good/bad examples)
- `src/lib/conceptGraph.ts` — Added sanitizeConceptLabel() post-processing; stored label is now the sanitized value
- `src/views/DetailModal.tsx` — Added Concepts section in edit mode with ✦ Rewrite button; calls /api/llm, strips old concepts, merges fresh ones live
- `Audits/Manual/manual-tasks.md` — Added M-11: set APP_URL env var in Vercel

## Current State
- All changes committed (4f4ee1b) and pushed to main — clean
- MCP is now a reasoning agent: ask_everionmind proxies to full /api/chat pipeline via internal HTTP with service-role bypass auth
- Concept graph will produce clean categorical concepts on future audit runs; existing stale concepts persist until entries are individually rewritten or a full re-audit runs
- DetailModal edit mode shows current concepts and has Rewrite button to fix individual entries on demand

## In-Flight Work
- *(none)* — everything committed and pushed

## Known Issues
- Existing concept graph entries may still have instance-level labels — cleared only via ✦ Rewrite button per entry or full brain re-audit
- APP_URL env var not yet set in Vercel — MCP falls back to VERCEL_PROJECT_PRODUCTION_URL; documented as M-11 in Audits/Manual/manual-tasks.md
- Pre-existing TS errors in DetailModal.tsx (unused imports/vars from prior sessions) — not introduced this session
- src/config/prompts.ts line 62 still references "OpenBrain" in CHAT prompt and line 244 in FILE_SPLIT — not fixed this session (user did not ask)

## Pipeline State
- **Last pipeline:** feature — 2026-04-16
- **Last scores:** no scores run this session
- **Open incidents:** none
