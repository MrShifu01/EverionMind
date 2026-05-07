# Chat View Audit — 2026-05-07

> Evidence-based audit of `src/views/ChatView.tsx` and the chat surface (composer, message list, hook, markdown render, debug panel). Scope is the **client UI only** — server retrieval and `/api/llm` proxy live in their own audits.

## Verdict

**Chat ships as a one-shot request/response. No streaming, no cancel, no virtualization, no rate-limit surface.** The architecture is `POST /api/llm?action=chat → await res.json() → render`. That's fine for short replies and small histories, but every premise in the original brief that asked us to verify "stream cancel on unmount", "auto-scroll pauses on user-scroll", "tool-call status visible during call", "429 with countdown", "long-chat virtualization" — **none of those features exist**. They aren't broken; they're absent.

What does ship is solid in shape: vault-locked secrets render as titles only with an "Open Vault" CTA (no plaintext leak), markdown is hand-parsed (no `dangerouslySetInnerHTML`, no third-party HTML pipeline, so no XSS surface), tool-call chips render after the round-trip with friendly labels, action-confirm flow exists for destructive tools, copy/share buttons on every assistant message, and a 30-message rolling history limit is enforced before send. Empty state, no-memory state, and no-AI-key state each have a tailored panel.

**Severity-ranked findings: 1 HIGH (rate-limit silently shows "No response."), 4 MEDIUM, 7 LOW.** Pre-launch must-fix is the 429 path. Streaming + cancel + virtualization are MEDIUM upgrades that should land in the post-launch hardening sprint, not v1.

---

## Architecture overview

```
User types in <textarea>           ChatComposer.tsx (controlled input, Enter=send, Shift+Enter=newline)
         │
         ▼
ChatView.handleSend  ── trims, offline-guard via navigator.onLine, no-memory toast
         │
         ▼
useChat.send(message)             src/hooks/useChat.ts:62
   ├─ optimistic user msg push
   ├─ setLoading(true)
   ├─ slice history to last 30   HISTORY_LIMIT (line 28)
   ├─ inject learnings           getLearningsContext(brainId)
   │
   ▼
authFetch("/api/llm?action=chat", { method:"POST", body:JSON.stringify(...) })
   │   (no signal, no AbortController, no streaming Response.body reader)
   ▼
api/llm.ts:1150 → handleChat   ── one round-trip, full JSON body returned
   │
   ▼
res.json() → { reply, tool_calls, pending_action?, _debug }
   │
   ▼
setMessages([...prev, assistant])  ── single push, full content materialised
saveHistory(brainId, messages.slice(-100))   localStorage write
   │
   ▼
ChatMessageList.tsx renders     ── renderMarkdown(msg.content) plain prose
                                   ── tool_calls → chips with TOOL_LABELS
                                   ── lockedSecrets → "Open Vault" CTA
                                   ── copy / share / call / wa / email per message
                                   ── pending_action → confirm card
useEffect [messages, loading] → endRef.current.scrollIntoView({ behavior: "smooth" })
                                   ChatView.tsx:64-66 — fires on every messages mutation,
                                   ignores user scroll position
```

No SSE. No `Response.body.getReader()`. No `EventSource`. The function `useChat.send` awaits a single JSON body and pushes one assistant message. Confirm `grep` for `stream|SSE|ReadableStream|TextDecoder|EventSource|AbortController|signal|abort` in `src/hooks/useChat.ts` — zero matches.

---

## Stream-state table

The brief asked for `idle | streaming | error | cancelled`. Actual implementation has only three states and they're not stream states — they're **request states**.

| State | When | UI signal | Cancel? | Source |
|---|---|---|---|---|
| `idle` | `loading === false` and no `pendingAction` | composer enabled, send button live ember | n/a | `useChat.ts:51` |
| `loading` (analogous to "streaming" but isn't) | between `send()` call and `res.json()` resolve | thinking-dot + "thinking…" line, send button greyed, composer textarea **stays enabled** (only voice path disables) | **NO** — no Stop button, no AbortController | `ChatMessageList.tsx:399-422` + `useChat.ts:78` |
| `error` | `try/catch` swallows fetch rejection | injects assistant message `"Something went wrong. Please try again."` | n/a | `useChat.ts:131-140` |
| `cancelled` | **does not exist** | n/a | n/a | n/a |
| `pending_action` (confirm gate) | server returned `pending_action` for a destructive tool | Confirm/Cancel buttons in blood-wash card | yes — `cancel()` clears, no server call | `ChatMessageList.tsx:426-455` + `useChat.ts:147-156` |

There is no token-by-token render path. Every assistant message materialises atomically once the server returns the full body. The `loading` flag is the only intermediate state and it gates only the spinner + send-button disabled state, not partial content.

---

## What's solid

- **Vault-locked-secrets handling — no plaintext leak in chat.** `extractLockedSecrets` (ChatMessageList.tsx:128) reads `tool_calls[].result.lockedSecrets` and renders only `id` + `title` plus an "Open Vault" CTA inside a `<ul>`. No content field, no preview, no decrypt-in-chat. Backend filtering is the source of truth; the UI doesn't try to bypass it.
- **No `dangerouslySetInnerHTML` anywhere in the chat surface.** `renderMarkdown` (chatUtils.tsx:163) splits on `\n`, parses bullet lines, splits inline on `(\*\*[^*\n]+\*\*)` and uses React `<strong>` / `<a>` / `<span>`. URLs are matched via `RICH_PATTERN` (chatUtils.tsx:69) and rendered as `<a href={raw} target="_blank" rel="noopener noreferrer">`. No HTML string is ever fed to the DOM. **XSS surface is the regex-matched URL** — see F8.
- **Empty-state empty-state empty-state.** Three distinct screens for `aiAvailable === false` (ChatView.tsx:130-249, "Add a key OR See plans"), `noMemory === true` (ChatView.tsx:439-469, "Capture a thought" CTA), and zero-messages-with-memory (ChatView.tsx:470-535, suggestion chips derived from existing entries). All branded, none use OS-native UI.
- **History bounded at the boundary.** `historyForApi = nextMessages.slice(-HISTORY_LIMIT)` (useChat.ts:81-83) sends 30 messages max to the server. `saveHistory` slices to last 100 in localStorage (useChat.ts:43). Two different bounds for two different lifetimes — read it as "server cares about token budget, client cares about quota". No 200-message DOM blow-up risk here because `slice(-100)` caps the local store, but **at 100 messages the DOM still renders all 100 nodes** — see F4.
- **Pending-action confirm gate.** Tool-call requests for destructive ops (delete, large updates) come back with `pending_action: { tool, args, label }`. The UI shows a blood-wash card with Confirm + Cancel; only on Confirm does `confirm()` re-call `send(pendingMessage, true)` with `confirmed: true` set in body (useChat.ts:91). Server then bypasses the confirm-gate check. This is the right shape.
- **Funnel hygiene.** `trackFirstChat()` fires only on user-initiated sends (`!confirmed`), not on tool-call retries (useChat.ts:67-68). Same logic prevents double-counting in analytics.
- **Per-brain history isolation.** `loadHistory(brainId)` reads `chat_history_${brainId}` (useChat.ts:29-39). Brain switch in `useEffect` resets `messages` and `pendingAction`. No cross-brain leak.
- **Suggestions cache.** `derivePrompts(entries)` returns up to 4 prompts based on entry types (chatUtils.tsx:30-46), cached 24h in localStorage (chatUtils.tsx:5-28). `useEffect` deliberately omits `entries` from deps (ChatView.tsx:39) so prompts don't churn while the user is mid-typing. Comment explains why — readable next-engineer code.
- **Reduced-motion is honoured for the thinking dot.** Animation `design-breathe` (tokens.css:274) is cancelled inside `@media (prefers-reduced-motion: reduce)` at tokens.css:322 (`.mote, [data-ambient] { animation: none !important }`). **Verify**: the thinking dot at ChatMessageList.tsx:407 doesn't carry `.mote` or `[data-ambient]` — its inline `animation:` style is **NOT** caught by the reduced-motion override. See F11.
- **Voice + text composition.** `voiceLoading` disables the textarea while transcribing (ChatComposer.tsx:97). `handleSend` checks `voiceLoading` and bails (ChatView.tsx:70). No race between voice-finish and send.
- **Offline guard.** `navigator.onLine === false` shows a `sonner` toast and **keeps the typed text** so the user doesn't lose their thought when the connection comes back (ChatView.tsx:73-79). Right call.
- **Admin debug panel is admin-gated.** `isAdmin && adminPrefs.showChatDebug` (ChatMessageList.tsx:389). Provider, model, latency, rounds, tool args, tool results — all visible to admin only. Standard users see only the friendly tool-call chips.

---

## Findings

### F1 — 429 rate-limit silently shows "No response."
**Severity: HIGH** — pre-launch fix

`api/llm.ts:1168-1175` returns `429` with `{ error: "monthly_limit_reached", action, remaining: 0, upgrade_url }` for free-tier chat quota exhaustion. The hook does not check status:

`src/hooks/useChat.ts:99-130`:

```ts
const res = await authFetch("/api/llm?action=chat", { ... });
const data = await res.json();
if (data.pending_action) { ... }
else {
  const assistantMsg: ChatMessage = {
    role: "assistant",
    content: data.reply || "No response.",
    ...
  };
}
```

`data.reply` is undefined on the 429 body → assistant message text becomes literally `"No response."`. The user sees a generic dead-end message; **no upsell, no retry-after, no link to billing**. The server already sends `upgrade_url: "/settings?tab=billing"` and the rate-limit code, both ignored by the client.

Same hole exists for `503 quota_unavailable` (line 1145, 1166) and `402 no_ai_provider` (line 1153) — though `aiAvailable` gating upstream usually catches the 402 first.

**Fix shape** (no code change in this audit, but specifying):

```ts
if (!res.ok) {
  const err = data?.error;
  if (res.status === 429 && err === "monthly_limit_reached") {
    // assistant message: "Free chat limit reached. Upgrade to keep going." + Button to /settings?tab=billing
  } else if (res.status === 503 && err === "quota_unavailable") {
    // assistant message: "Hit a snag — try again in a few seconds."
  } else if (res.status === 402 && err === "no_ai_provider") {
    // route to ai settings
  } else {
    // generic error path
  }
  setLoading(false);
  return;
}
```

There's no `Retry-After` header on the 429 — the brief asked for "countdown mirror login-signup audit". Server doesn't supply one (free-tier monthly quotas reset at month boundary, not in seconds). The right UX here is **upgrade-prompt-with-link**, not a numeric countdown.

### F2 — No fetch cancellation. Stuck request hangs forever, can't unmount cleanly
**Severity: MEDIUM**

`src/hooks/useChat.ts:99` calls `authFetch` with no `signal: abortController.signal`. Consequences:

1. **No Stop button.** User cannot abort a slow chat. If the LLM takes 30s, they wait 30s.
2. **Unmount leaks.** If the user navigates away mid-request (e.g. back to capture, switch brains), the in-flight `await res.json()` resolves into `setMessages` / `setLoading(false)` on an unmounted component. React 18 swallows the warning, but the localStorage write at `saveHistory` line 116/129/139 still **runs against the old brainId**, attempting to persist a reply to a brain the user already switched away from.

Specifically: the `useEffect` at useChat.ts:55-60 only `setMessages(loadHistory(newBrainId))` — there's no abort on the previous brain's pending request. Sequence:

```
t=0  user on brain A, sends msg → fetch starts
t=1  user switches to brain B → useEffect fires, messages reset to brain B history, but brain A fetch still pending
t=2  brain A fetch resolves → setMessages([...nextMessages, assistantMsg])
                            → nextMessages was captured from closure = brain A messages
                            → setMessages overwrites brain B's display with brain A's history + new reply
                            → saveHistory(brainId=A, ...) — captured from closure too
```

Result: user sees brain A's reply pop up while looking at brain B. Localstorage for brain A gets the reply (correct) but the visible UI is corrupted until they switch brains again.

**Fix shape**: introduce `AbortController` per send, store `controllerRef`, abort on (a) brain change, (b) unmount, (c) explicit Stop button (which also adds the user-facing cancel feature).

### F3 — Auto-scroll fights the user
**Severity: MEDIUM**

`ChatView.tsx:64-66`:

```ts
useEffect(() => {
  endRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages, loading]);
```

This fires on **every** messages mutation and every `loading` flip. It does not check the scroll container's current position. If the user scrolls up to read an earlier reply and a new one streams in (n/a here, but also when a new user message gets pushed optimistically), the view jerks back to the bottom.

Severity is medium not high because:
- Without streaming, there are only two scroll triggers per turn (user msg push + assistant msg push), not 30.
- The scrolling is `behavior: "smooth"` so it's visible, not a snap-jolt.

But it still violates the "don't fight the user" rule. **Fix shape**: track `endRef`'s `IntersectionObserver` or compare `scrollHeight - scrollTop - clientHeight < threshold` before calling `scrollIntoView`. Pause auto-scroll when user has scrolled up.

### F4 — No virtualization. 100-message DOM, every action button rendered, every markdown re-rendered on every state change
**Severity: MEDIUM** — perf, post-launch

`saveHistory` caps storage at 100 messages (useChat.ts:43). `ChatMessageList.tsx:195-396` maps every message to a node. Each assistant message includes:

- `renderMarkdown(msg.content)` — re-runs on every render (no memoisation).
- 2 inline action buttons (copy, share) — always rendered.
- Conditional `phone`, `email`, `wa`, `email-link` chips — `firstPhone(msg.content)` + `firstEmail(msg.content)` re-execute regex on every render.
- Conditional `extractLockedSecrets(msg.tool_calls)` — re-runs on every render.
- Tool-call chips loop.
- Admin debug panel (admin only, but still mounts).

At 100 messages the DOM grows to ~1k nodes (10 per message conservatively). That's fine on desktop, marginal on a mid-range Android browser, especially during scroll. **Fix shape**: `react-window` or `@tanstack/react-virtual` once message count consistently exceeds 50. Memoise per-message rendering with `React.memo` keyed on `msg.ts` + `msg.content`. Cache `firstPhone` / `firstEmail` / `extractLockedSecrets` via `useMemo`.

### F5 — Tool-call chips render only AFTER the request completes. No "searching memory…" during the call
**Severity: MEDIUM** — UX

The brief asked: "Tool-call status visible (e.g. 'searching memory…') with loading state."

Actual: `tool_calls` is a property of the assistant message (`useChat.ts:124`). It's set when `data` arrives — i.e. **after** the round-trip is done. During `loading === true`, the only feedback is `"thinking…"` (ChatMessageList.tsx:420). The user never sees which tools are being invoked mid-call.

This is a direct consequence of the no-streaming architecture. The server does multiple tool rounds inside a single response; the client only learns about them once the final assistant message comes back.

**Fix shape**: streaming `/api/llm?action=chat` with SSE events `{ type: "tool_call_start", tool }`, `{ type: "tool_call_done" }`, `{ type: "token", text }`, `{ type: "done" }`. The server already does this internally for its multi-round tool-calling loop — just needs to be exposed to the wire. Big change. Post-launch.

### F6 — No copy / regenerate / edit on past assistant messages beyond the basic two
**Severity: LOW** — feature gap

The brief asked: "every assistant message has copy + regenerate".

Actual: copy yes (ChatMessageList.tsx:336-345). Share yes (line 346-355). Phone / email / wa as tap-to-action chips when matched. **No regenerate button.** No "edit and resend" on user messages.

Regenerate is genuinely useful when a tool call returned the wrong entry or the LLM hallucinated. Fix is non-trivial: needs server-side support for "use the same retrieval context, different generation seed". Post-launch.

### F7 — No code-block rendering, no language detection, no copy-on-block
**Severity: LOW** — content gap

The brief asked: "Code blocks have copy button + language label."

Actual: `renderMarkdown` (chatUtils.tsx:163) handles only headings (no), bold (`**...**` only — no `_..._` italic), bullet lists (`- ` or `* `), and inline links/phones/emails. No fenced code blocks. No backtick inline code. Triple-backtick content from the LLM renders as plain text including the literal backticks.

Severity is low because chat output is **prose-mode** (memory questions, summaries, reminders) — code blocks are rare in this product. But "summarise my recent links" + an LLM that thinks markdown will produce a list with some inline `code` formatting that renders badly.

**Fix shape**: import `react-markdown` + `rehype-highlight` and replace `renderMarkdown`. **But** that adds a `dangerouslySetInnerHTML` path under the hood — must include `rehype-sanitize` and an explicit allowlist. ~30KB gzipped. Worth it if code rendering becomes important; otherwise the current hand-rolled renderer is safer.

### F8 — Markdown URL regex matches anything starting `https?://[^\s<>]+` — open redirect surface in `<a>` href
**Severity: LOW** — XSS-adjacent

`chatUtils.tsx:69`:

```ts
const RICH_PATTERN = /(\+\d[\d\s-]{8,13}\d|\b0\d{9}\b|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|https?:\/\/[^\s<>]+)/g;
```

The URL alternation is `https?:\/\/[^\s<>]+` — anything that's not whitespace or angle brackets. A malicious entry the user once captured (or a tool-call result containing arbitrary text) could embed e.g. `https://evil.com/?steal=token`. The renderer wraps it as `<a href={raw} target="_blank" rel="noopener noreferrer">`.

`rel="noopener noreferrer"` is correctly set (chatUtils.tsx:101) — that closes the window-opener attack. The remaining surface:

- `javascript:` URLs — **blocked** because the regex requires `https?://`.
- Punycode / look-alike domains — not blocked. `https://еverion.com` (Cyrillic 'е') would render as a clickable link to a phishing site.
- Very long URLs that visually break out of the message bubble — minor cosmetic.

This is **LOW** because the only way a hostile URL enters the chat output is via the LLM hallucinating one or echoing one from the user's own entries. Both are user-controlled inputs already. No real attacker pathway. Note in security audit; no fix needed pre-launch.

### F9 — `key={i}` in messages map breaks if any message is ever spliced or edited
**Severity: LOW**

`ChatMessageList.tsx:200`: `<div key={i}>`. Messages are append-only today — `i` is stable. But if regenerate, edit, or delete ever ship (F6), index keys will reuse-and-corrupt component state (e.g. the per-message `copiedIdx` highlight).

**Fix shape**: `key={msg.ts + msg.role}` — `ts` is set at message-create time and never collides per role. Or add a `id` field.

### F10 — Brain switch leaves stale `pendingAction`'s message lost
**Severity: LOW**

`useChat.ts:55-60`:

```ts
useEffect(() => {
  if (!brainId) return;
  setMessages(loadHistory(brainId));
  setPendingAction(null);
}, [brainId]);
```

`pendingMessage` (the saved text used by `confirm()` to re-send) is **not cleared** when brain changes. If the user has a confirm-gate up on brain A, switches to brain B, switches back, the pendingAction is null but the pendingMessage from brain A is still in state. Next confirm-gate flow on brain B might pick it up if there's any `pendingAction && !pendingMessage` race. Trace shows `confirm()` requires both (line 148) so currently safe — but it's fragile.

**Fix shape**: also `setPendingMessage("")` in the brain-change effect.

### F11 — Thinking-dot animation does NOT respect `prefers-reduced-motion`
**Severity: LOW** — a11y

`ChatMessageList.tsx:407`:

```ts
<span aria-hidden="true" style={{ animation: "design-breathe 3.5s ease-in-out infinite" }} />
```

The `@media (prefers-reduced-motion: reduce)` block at `src/design/tokens.css:322-327` only matches `.mote, [data-ambient]` — neither class nor data attribute is set on the thinking dot. The animation continues regardless of user preference.

**Fix shape**: add `className="mote"` or `data-ambient` to the dot, or extend the reduced-motion media block. Same issue exists at `LoginScreen.tsx:241`, `Landing.tsx:709`, `captureIcons.tsx:154` — separate audit, but worth flagging.

### F12 — Citation rendering does not link tool-call results back to their source entries
**Severity: LOW** — feature gap

The brief asked: "Citations: rendered as inline links to `DetailModal`? Or footnote list? Click → focus the entry?"

Actual: tool-call chips show only a label (`"searched memory"`, `"fetched entry"`). The chip is **not clickable**. The result data is in `msg.tool_calls[i].result`, accessible only in the admin debug panel as a JSON dump. A normal user has no way to see "the assistant's claim came from entry X" or to click through to that entry.

The `lockedSecrets` block (ChatMessageList.tsx:275-333) is the only direct link to source — and it only fires when retrieval found vault-locked items. Non-locked retrieved entries leave no UI breadcrumb.

**Fix shape**: collect `(retrieve_memory|search_entries|get_entry).result.entries[]` across all tool calls in a message, dedupe by id, render as a footnote list under the assistant message (e.g. small chips: `"from: Title of entry"` → clicks open DetailModal). Server already returns enough metadata. Probably ~50 lines of UI code. Good post-launch polish.

---

## Vault-locked-secrets walkthrough

| Step | Behaviour | Location |
|---|---|---|
| User asks something that hits a vault-locked entry | server retrieval (out of scope) returns `lockedSecrets: [{id, title}]` instead of `entries: [{id, title, content}]` | `api/llm.ts → handleChat → retrieveMemory tool` |
| Client receives `tool_calls[i].result.lockedSecrets` | extracted by `extractLockedSecrets` | `ChatMessageList.tsx:128-141` |
| UI renders title-only list + Open Vault CTA | titles in `<ul>`, button calls `onOpenVault` → routes to `/vault` | `ChatMessageList.tsx:275-333` |
| LLM never sees the content | server filters before model context | (verify in retrieval audit) |
| Chat history persists locked-secrets list to localStorage | `lockedSecrets` is in `tool_calls.result`, which is on the message, which is saved | `useChat.ts:43` |
| Brain switch | new brain loads its own history; locked-secrets from previous brain not visible | `useChat.ts:55-60` |

**Verdict on vault path: clean.** Plaintext never leaves the server. Client UI clearly signals lock state. Open Vault CTA is the only escape hatch. No bug found in chat-side handling.

---

## Pre-launch checklist

| Item | Severity | Status | Owner |
|---|---|---|---|
| F1 — 429 surfaces upgrade-prompt instead of "No response." | HIGH | dev |
| F2 — AbortController per send + abort on brain change + abort on unmount | MEDIUM | dev |
| F3 — auto-scroll pauses when user scrolled up | MEDIUM | dev |
| F11 — thinking dot honours `prefers-reduced-motion` | LOW | dev |
| F10 — clear `pendingMessage` on brain change | LOW | dev |

Items deferred to post-launch hardening sprint (carry into `EML/LAUNCH_CHECKLIST.md` Tier P1/P2):

| Item | Severity | Notes |
|---|---|---|
| F4 — virtualize message list at >50 messages | MEDIUM | watch metric: median message count per active session |
| F5 — streaming `/api/llm?action=chat` + tool-call status during call | MEDIUM | requires server SSE support, biggest single UX upgrade |
| F6 — regenerate button | LOW | needs server "same retrieval, new generation" mode |
| F7 — code-block rendering with copy + language label | LOW | only if usage shows code in chat output |
| F12 — citation footnotes click → DetailModal | LOW | high-leverage trust feature for the "answers from memory" promise |

---

## Recommendations (priority)

1. **[HIGH] Fix F1.** ~30 lines in `useChat.ts`. Check `res.ok`, branch on `res.status` + `data.error`, render the right assistant message. Pre-launch — the rate-limit path is on the user's most-likely first paid moment.
2. **[MEDIUM] Fix F2 + F3 together.** AbortController + scroll-anchor logic land cleanly in the same hook + view-effect rewrite. ~80 lines. Pre-launch if there's a day, otherwise week-1 post-launch.
3. **[MEDIUM] Plan F5 (streaming) for a 2-week post-launch sprint.** The server-side multi-round tool loop already produces the right intermediate events — the work is wire-format (SSE) + client-side reader + tool-call-chip lifecycle (start → spinner → done). Pays back in perceived latency on every chat turn.
4. **[LOW] F11 + F10 + F9 are 5-minute fixes** — bundle into the next chat-touching commit.
5. **[LOW] F12 (citation footnotes)** is the single biggest trust-builder for the product's positioning. Schedule for post-launch week 3-4.
6. **[LOW] F7 (code blocks) only if telemetry shows code output is common.** Not worth the bundle weight pre-evidence.

---

## Method

- Read `src/views/ChatView.tsx` end-to-end (560 lines).
- Read `src/views/ChatComposer.tsx`, `src/views/ChatMessageList.tsx`, `src/views/ChatDebugPanel.tsx`, `src/views/chatUtils.tsx`, `src/hooks/useChat.ts` end-to-end.
- Cross-checked `api/llm.ts:1150-1180` for `action=chat` server contract — confirmed 429 / 503 / 402 paths and `pending_action` shape.
- Searched for `stream|SSE|ReadableStream|TextDecoder|EventSource|AbortController|signal|abort` across `src/hooks/useChat.ts` — zero matches, confirms no streaming / no cancel path.
- Cross-checked `src/design/tokens.css` `prefers-reduced-motion` block (line 322) against the thinking-dot animation usage at `ChatMessageList.tsx:407` — gap confirmed.
- Inspected `RICH_PATTERN` regex at `chatUtils.tsx:69` for XSS surface — only `https?://` URLs, no `javascript:` / `data:` paths possible.
- Inspected `extractLockedSecrets` at `ChatMessageList.tsx:128` — confirmed plaintext-never-rendered guarantee.
- Did not run the chat live; relied on code reading + server contract inference. Hard-numbers verification deferred to a chrome-devtools session before HIGH-severity fix lands.

**Audit kicked off by**: user request "do all those highest-leverage audits" on 2026-05-07.
