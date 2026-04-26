# Everion

Personal memory assistant. Capture notes, suppliers, reminders, and ideas. Ask your AI to recall anything.

## Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Vite
- **Backend**: Vercel Functions (TypeScript)
- **Database**: Supabase (Postgres + pgvector for semantic search)
- **Auth**: Supabase Auth
- **AI**: Anthropic Claude / OpenAI / OpenRouter / Groq (BYO key)

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

## Environment variables

See `.env.example` for all required variables. Key ones:

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only) |
| `ANTHROPIC_API_KEY` | Default Anthropic key (users can override with BYO) |
| `UPSTASH_REDIS_REST_URL` | Distributed rate limiting (in-memory fallback if unset) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web push notifications |

## Commands

```bash
npm run dev          # Dev server
npm run build        # Production build
npm run typecheck    # TypeScript check
npm run lint         # ESLint
npm run test         # Vitest
npm run format       # Prettier
```

## Architecture

```
src/
  components/     UI components
  views/          Full-screen views (Chat, Todo, Trash, Refine, etc.)
  hooks/          Custom hooks (useOfflineSync, useChat, useBrain, etc.)
  lib/            Utilities (auth, crypto, offline queue, aiSettings)
  context/        React contexts (BrainContext, EntriesContext, ThemeContext)
api/
  _lib/           Shared server utilities (verifyAuth, rateLimit, etc.)
  chat.ts         RAG chat (pgvector semantic search + LLM)
  capture.ts      Entry capture + embedding
  entries.ts      CRUD, pagination, soft delete, restore
  llm.ts          LLM proxy (Anthropic / OpenAI / OpenRouter)
```

## Deployment

```bash
vercel deploy --prod
```

Set all env vars in the Vercel dashboard before deploying.
