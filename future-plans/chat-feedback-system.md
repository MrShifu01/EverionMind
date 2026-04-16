# Chat Feedback System (Thumbs Up / Down)

## Goal
Add per-answer thumbs up/down to ask/chat, storing feedback in Supabase and using it to improve future answers via few-shot prompt injection.

## Design: Capture → Store → Apply

### 1. Capture — `src/views/AskView.tsx`
- Render thumbs up / thumbs down icons below each completed assistant message
- Appear after response finishes (not during streaming)
- One click locks in the rating (no undo needed for v1)

### 2. Store — new table + endpoint

New Supabase table:
```sql
CREATE TABLE chat_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id UUID NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('up', 'down')),
  created_at TIMESTAMPTZ DEFAULT now(),
  question_embedding vector(768)
);
```

New endpoint: `POST /api/chat-feedback`
- Accepts: `{ brain_id, question, answer, sentiment }`
- Generates embedding for `question` using Gemini embedding model
- Inserts row into `chat_feedback`

### 3. Apply — `api/chat.ts`

At the start of each request, run a pgvector similarity search:
```sql
SELECT question, answer
FROM chat_feedback
WHERE brain_id = $1 AND sentiment = 'up'
ORDER BY question_embedding <=> $embedding
LIMIT 3;
```

Inject top matches as few-shot examples into the system prompt:
```
Past answers the user found helpful:
Q: <similar question>
A: <its answer>
---
```

## Scope Estimate

| Piece | File | ~Size |
|---|---|---|
| DB migration | new `.sql` | 10 lines |
| Feedback endpoint | `api/chat-feedback.ts` | 30 lines |
| Few-shot injection | `api/chat.ts` | 20 lines |
| Thumb buttons | `src/views/AskView.tsx` | 30 lines |

## Deliberate Non-Goals (v1)
- No negative-feedback penalty (risk of over-correction)
- No cross-brain feedback leakage
- No analytics dashboard

## Notes
- Feedback is per-brain (isolated per user's knowledge base)
- Embeddings use existing Gemini 768-dim model already in the stack
- Chat is currently stateless — this adds the only persistence layer for chat interactions
