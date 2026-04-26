# Prompt Injection Protection

## Principles

1. **Never put user input in the system prompt** — keep system prompt server-side, append user messages separately
2. **Sanitize/escape user content** before passing to the LLM — strip role-spoofing patterns (`\nSystem:`, `\nAssistant:`) and markdown injection
3. **Output validation** — don't blindly execute or render LLM responses; always parse with try/catch
4. **Allowlist actions** — if the LLM can trigger side effects (save, delete), validate those actions server-side, not based on LLM output text
5. **Rate limit + max token caps** — cap max_tokens and message count server-side
6. **Don't expose raw system prompts** in error messages or responses

## Key principle

Treat LLM output as untrusted user input — never let it control auth, data access, or code execution without server-side validation.

## Current status in Everion

- System prompts are server-side in `src/config/prompts.ts` (not user-editable)
- `api/llm.ts` validates message structure: role must be user/assistant, content must be string, max 50 messages, max_tokens capped at 4096
- Rate limiting via Upstash Redis on all API endpoints
- JSON.parse calls wrapped in try/catch
- LLM responses are rendered as text, not executed
