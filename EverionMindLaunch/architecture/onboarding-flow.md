# Onboarding flow

Signup → first capture → first chat → first answer. Where activation breaks today and what's planned.

## Goal

> Within 60 seconds of arriving at the homepage, a new user has a memory in their brain and has asked Evara a question and gotten a useful answer.

This is the activation moment. Everything before it is friction; everything after it is retention.

## Current flow (post-signup)

1. **Sign-in screen** (`src/views/LoginScreen.tsx`)
   - Google OAuth (preferred — one click)
   - Email + password fallback
   - Outcome: Supabase session, `user_profiles` row auto-created, `My Brain` provisioned via `api/user-data.ts:805` if absent.

2. **Personal brain auto-provisioned** (server-side, on first sign-in)
   - `is_personal: true`, `name: "My Brain"`, `owner_id: user.id`
   - User never sees this happen.

3. **OnboardingModal** (`src/components/OnboardingModal.tsx`)
   - Shown to users with no entries.
   - Currently mostly informational. Doesn't yet ask "what's one thing you're afraid of forgetting?" (the spec from `marketing/seo-marketing-playbook.md` § 16).
   - Skippable.

4. **First capture** (CaptureSheet → entries table)
   - User types something or pastes content.
   - Server inserts the entry, kicks off enrichment (parse / insight / concepts / persona / embed) inline.
   - Visible chips on the entry card show enrichment progress (P / I / C / E).

5. **First chat** (ChatView)
   - User opens chat, asks a question.
   - Retrieval runs over the user's accessible brains via `match_entries_for_user` (migration 071).
   - LLM responds with sources.

6. **Settings → AI provider** (optional)
   - Users on free tier are routed to managed Gemini.
   - Pro/Max users can opt in to Anthropic, BYOK any of Gemini / OpenAI / Anthropic / OpenRouter.
   - Source: `api/_lib/resolveProvider.ts`.

## Where activation breaks today

| Friction point | Today's state | Fix |
|---|---|---|
| Empty-state ambiguity | "What is this app?" | OnboardingModal asks "what do you forget?" with 6 quick-pick options (expiry / document / family / reminder / note / other). Spec lives in `marketing/seo-marketing-playbook.md` § 16. |
| Capture → query gap | User captures but doesn't know to chat next | After first capture, a one-shot toast/CTA: "Now ask Evara about it." |
| Chat empty state | "Type a question…" | Pre-fill 3 example questions tied to the user's first capture (e.g. if they entered a date, suggest "When does X expire?"). |
| Settings overwhelm | 7 tabs visible immediately | Hide tabs that aren't relevant to a fresh user (Admin always; AI / Connections behind a "More" expander). |

## Activation tracking (analytics)

Every step in the funnel emits a PostHog event — see `Analytics/event-taxonomy.md` for the full list. The activation funnel is:

```
landing_page_view
  → signup_started
    → signup_completed
      → first_memory_created
        → first_ai_question_asked
          → first_ai_answer_viewed
```

North-star metric: % of `signup_completed` users who reach `first_ai_answer_viewed` within 7 days. Target ≥ 40%.

## Edge cases

- **OAuth state mismatch** — bad redirect URI or expired state cookie → message + retry button. Source: `api/_lib/oauthState.ts`.
- **First-capture timeout** — capture endpoint > 5s → show "still working" toast, don't block UI.
- **Enrichment fail** — Gemini 429 / 503 → entry saved without enrichment; chips render in "pending" state; cron retries on next firing.
- **Vault setup before capture** — user goes to Vault tab first → setup screen renders. Fine, but doesn't drive activation. Should we suggest capture instead? **Decision pending.**

## Implementation map

- Sign-in: `src/views/LoginScreen.tsx`
- Brain provisioning: `api/user-data.ts` (handleBrains POST path)
- Onboarding modal: `src/components/OnboardingModal.tsx`
- Capture: `src/views/CaptureSheet.tsx` + `api/capture.ts`
- Chat: `src/views/ChatView.tsx` + `api/llm.ts`
- First-run checklist hook: `src/hooks/useFirstRunChecklist.ts`

## References

- `marketing/seo-marketing-playbook.md` § 16 (onboarding strategy)
- `Analytics/event-taxonomy.md`
- `Analytics/north-star.md`
- `Specs/streak-counter.md` (drives habit loop after activation)
- `Specs/brain-feed-v0.md` (fills the home view once activation completes)
