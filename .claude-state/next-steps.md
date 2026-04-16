# Next Steps — 2026-04-16

## Immediate (do first)

1. **Set APP_URL in Vercel** — Dashboard → EverionMind project → Settings → Environment Variables → add `APP_URL=https://your-production-domain.com` (Production only). Without it, ask_everionmind routes to VERCEL_URL which may be a preview deployment. See `Audits/Manual/manual-tasks.md` M-11.

2. **Fix remaining OpenBrain references in prompts.ts** — Two occurrences not fixed this session:
   - `src/config/prompts.ts` line 62: `CHAT: \`You are OpenBrain, a sharp personal knowledge assistant\`` → change to EverionMind
   - `src/config/prompts.ts` line 244: `"separate, focused OpenBrain entries"` in FILE_SPLIT → change to EverionMind

## Soon (this milestone)

- **Sequential hydration on Feedback view** — User reported: whole page skeleton until all loads at once. Implement staggered reveal: fetch all data in parallel but render each section as its own data resolves. Use per-section loading state rather than one global flag. Find the feedback view at src/views/ or similar.

- **Clean up stale concept graph data** — Existing entries may still have instance-level concept labels (e.g. "father's South African ID Number"). Open each affected entry in DetailModal → Edit → click ✦ Rewrite to regenerate. Or build a bulk re-audit that runs COMBINED_AUDIT across all entries.

- **Verify MCP ask_everionmind end-to-end** — Connect Claude Desktop or another MCP client using an `em_` API key. Call ask_everionmind with a query that has a known answer. Confirm: (1) answer is correct, (2) no `[mcp] WARNING` in Vercel function logs, (3) submit_everionmind_feedback with 1/-1 both succeed.

## Deferred

- M-3 (Upstash Redis rate limiting) — in-memory rate limiter still live; see Audits/Manual/manual-tasks.md
- M-4 (Move API keys to Supabase Vault) — see Audits/Manual/manual-tasks.md
- M-10 (Staging environment) — see Audits/Manual/manual-tasks.md
- AI-models.md Phase 2+3 (per-task model routing) — deferred from prior sessions
- Full brain re-audit tooling — bulk concept rewrite for all entries in a brain

## Warnings

- ⚠️ APP_URL not set in Vercel — ask_everionmind will log a warning on every cold start and may route to wrong deployment. Verify by checking Vercel function logs after first MCP call.
- ⚠️ `src/config/prompts.ts` still has 2 "OpenBrain" occurrences (lines 62, 244) — grep to confirm: `grep -n "OpenBrain" src/config/prompts.ts`
- ⚠️ Existing concept graph data has stale instance-level labels — not auto-cleaned. Use ✦ Rewrite button per entry or build bulk re-audit.
- ⚠️ Pre-existing TS errors in DetailModal.tsx (BrainTypeIcon unused, setEditTags unused, editExtraBrainIds unused) — predate this session, not a regression.
