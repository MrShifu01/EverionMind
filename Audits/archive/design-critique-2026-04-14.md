# Design Critique — EverionMind
**Date:** 2026-04-14
**Screens reviewed:** `id.png` (Brain/Chat), `entry.png` (Entry Detail), `detail.png` (Entry Detail v2), `good example.png` (Document Detail)
**Scope:** Mobile UI — primary flows: querying knowledge via chat, viewing and navigating entries

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Chat response visible, but no typing indicator, no save/sync confirmation, enrichment status invisible |
| 2 | Match System / Real World | 3 | "Brains" metaphor works but unusual; "Insight:" prefix on titles is jargony; AI says "retrieved memories" |
| 3 | User Control and Freedom | 2 | Delete/Edit present in detail view; no visible undo; no way to clear chat conversation; no "discard" affordance |
| 4 | Consistency and Standards | 3 | Warm palette consistent throughout; entry layouts mirror each other; icon-only bottom nav vs. text tabs in chat creates minor inconsistency |
| 5 | Error Prevention | 2 | Delete likely has a confirmation (not visible in screenshots); no other visible guardrails or autosave indicators |
| 6 | Recognition Rather Than Recall | 2 | Icon-only bottom navigation (good example.png); connection list has no type labels — users must remember what each connection means |
| 7 | Flexibility and Efficiency | 1 | No keyboard shortcuts. Chat is the only visible query path. No bulk operations on entries. No quick-capture from within entry detail. |
| 8 | Aesthetic and Minimalist Design | 3 | Genuinely clean and warm — a real departure from AI slop baseline. Connection list is visually monotonous and breaks the calm. |
| 9 | Error Recovery | 2 | AI response when fact not found offers a phone number (DoHA) instead of guiding the user to add the missing fact |
| 10 | Help and Documentation | 1 | No help system visible. Chat greeting serves as pseudo-onboarding but disappears once conversation starts. No tooltips anywhere. |
| **Total** | | **21/40** | **Acceptable — significant improvements needed before users are fully at ease** |

---

## Anti-Patterns Verdict

**PASS — with two specific caveats.**

The palette is the real deal: warm cream surfaces, amber accent, no cyan, no purple gradient, no glassmorphism, no glow. The design correctly treats the user's content as the hero. This is not AI slop.

**The two tells that still read as generic:**

1. **The chat bubble pattern is borrowed from iMessage.** Rounded message cards, avatar left, user right — this is the visual grammar of social messaging. Everion is a trusted personal knowledge store. The chat metaphor is functional but the _visual language_ signals "chatbot" instead of "intelligent journal." Nothing in the aesthetic says "this is your second brain" vs. "this is a support ticket system."

2. **The connections list is a plain unstyled bullet list.** The app's core value proposition is relationships between ideas. The visual representation is a plain `<ul>`. This is the lowest-effort implementation of the most important concept in the product.

---

## Overall Impression

The warm palette direction is correct and meaningfully executed — this looks intentional, not generated. The chat interface (id.png) is the strongest screen: calm, warm, content-forward.

The entry detail screens are where the experience loses its character. They read like a notes app, not a knowledge system. The "Connections" section — which should be the most emotionally resonant part of the app ("look how your ideas link together") — is rendered as a plain text list. That's the single biggest opportunity.

The AI response behavior in the chat also needs attention: answering "your ID number is not available" and routing the user to a government phone number is not a trusted knowledge partner — it's a gap the product should turn into a "why not add it?" moment.

---

## What's Working

**1. The palette is genuinely warm and distinctive (id.png)**
Amber avatar, cream background, muted tan user bubble, warm tab underline — all consistent and human-feeling. Passes the AI slop test.

**2. Content-first layout in entry detail**
Minimal chrome. The entry title and description dominate. No competing UI noise. The design correctly steps back and lets the user's words be the focus.

**3. The tab metaphor in chat ("This brain / All brains") is clear and functional**
The amber underline active state is subtle and well-executed. Switching context between brains is a frequent action and it's been given appropriate prominence without being loud.

---

## Priority Issues

### [P1] The connections list is the product's biggest missed opportunity
**What:** The "Connections" section in every entry detail view is a flat bulleted list of plain text links. No type differentiation, no visual weight, no sense of relationship strength or direction. Anywhere from 8–15 items appear in a single undifferentiated column.

**Why it matters:** Connections _are_ the product. Everion's value is "your thoughts linked together." If the connections look like a Wikipedia references section, users will not feel the intelligence of the system. The emotional payoff — "look how this recipe connects to my suppliers and my ingredient notes" — is entirely absent from the current presentation.

**Fix:** Group connections by type (other recipes, documents, people, notes). Add a small type label or color indicator per connection. Consider showing 3 connections by default with "see all 12" expand. Even minimal visual differentiation (slightly different text color per type, or a small icon badge) transforms the perception from "list" to "knowledge graph."

**Suggested command:** `/delight` — this is a high-impact emotional moment that needs designed treatment, not just functional improvement.

---

### [P1] Icon-only bottom navigation (good example.png)
**What:** The bottom navigation bar in the document detail view appears to be icon-only — no text labels visible under the icons.

**Why it matters:** Jordan (first-timer) sees 4 icons and doesn't know what any of them do. Even Casey (distracted mobile user) has to remember what the second icon from the left means every time. The brand promise is "calm, intelligent, trusted" — unlabeled icons create small recurring friction that erodes trust.

**Fix:** Add text labels under all bottom nav icons. 4 words of text costs almost no space and eliminates the recall burden entirely. The labels can be small (10px, muted) — they just need to exist.

**Suggested command:** `/clarify` — label the navigation so recognition replaces recall.

---

### [P2] "Insight:" prefix on entry titles creates title hierarchy noise
**What:** Entry titles read as "Insight: Jalapeño Popper Burger" — the content type ("Insight") is prepended directly to the user's title text, making it part of the headline. The type badge also appears separately (e.g., "RECIPE" badge in the header area).

**Why it matters:** This double-labels the entry type — once as a prefix, once as a badge — while making the actual title harder to read at a glance. The user's title "Jalapeño Popper Burger" is the important text; "Insight:" is metadata that belongs in the badge, not the headline.

**Fix:** Remove the "Insight:" / type prefix from displayed titles. The type badge in the header does this job. The title should show only the user's actual title text. This also means what's stored may need a display-only formatting pass.

**Suggested command:** `/typeset` — clean up title rendering and the metadata/heading relationship throughout entry views.

---

### [P2] AI response language leaks system terminology
**What:** The AI response in the chat (id.png) says: "Your South African National Identity Card number is not available in the **retrieved memories**." The phrase "retrieved memories" is a system/RAG implementation detail. Additionally, the response routes the user to a government phone number — treating missing knowledge as a lookup failure rather than a capture opportunity.

**Why it matters:** The brand is "trusted and intelligent." An assistant that responds with system internals ("retrieved memories") and then tells you to call the government feels neither. It breaks the voice covenant.

**Fix (two parts):**
1. Rewrite the not-found response pattern: "You haven't saved your ID number yet. Want to add it?" — turns a failure state into a capture moment.
2. Audit all AI system prompts for language that leaks implementation (retrieved, indexed, memory store) and replace with user-facing language (remembered, saved, stored).

**Suggested command:** `/clarify` — rewrite the AI's voice and not-found response pattern.

---

### [P2] No visible path to create a new entry
**What:** None of the four screenshots show a compose/capture affordance — no floating action button, no "+" button, no prominent "New entry" trigger. The chat exists for querying. How a new user discovers they can add entries is unclear.

**Why it matters:** Casey (mobile user capturing a thought on the go) needs the capture action to be immediately obvious. If the primary capture path is buried, the app fails its core promise. The design context explicitly states "quick capture is the most prominent affordance."

**Fix:** Add a persistent, thumb-reachable capture button — ideally in the bottom nav area or as a floating action in the feed view. This should be the most prominent interactive element in the app.

**Suggested command:** `/onboard` — surface the capture action so the empty → first-entry journey is zero-friction.

---

## Cognitive Load Assessment

**Checklist results:**
- [x] Single focus — each screen has a clear focus ✓
- [ ] Chunking — 10+ connections in one unbroken list ✗
- [ ] Grouping — connections have no type grouping ✗
- [ ] Visual hierarchy — title weight too similar to body in detail views ✗
- [x] One thing at a time — screens are focused ✓
- [x] Minimal choices — limited options per screen ✓
- [x] Working memory — context preserved across screens ✓
- [ ] Progressive disclosure — all connections shown immediately ✗

**Failures: 4 items → Critical cognitive load in entry detail views.**

The chat UI (id.png) is low cognitive load. The entry detail views are where it breaks — specifically around the connection list. At 12+ connections with no grouping, the user must hold all connection types in working memory simultaneously to navigate them.

---

## Persona Red Flags

### Casey (Distracted Mobile User) — Primary Persona
Casey is on her phone, halfway through adding a thought, gets a call, comes back 5 minutes later.

**Red flags found:**
- **No visible capture affordance** in any screenshot. Casey opens the app to add a thought and doesn't know how. She won't look for it — she'll close the app.
- **Bottom nav icons are in the top section of the detail view** (good example.png shows them at the bottom, which is good) — but the Delete/Edit actions are in the top header, thumb-unreachable.
- **Chat input is at the bottom** (id.png) — correct, thumb-zone placement ✓
- **No state persistence signal** — if Casey gets interrupted mid-chat, there's no indication whether her conversation is saved.

**Risk level: High.** The app fails Casey at the most critical moment (capture intent) because the affordance isn't visible.

---

### Jordan (Confused First-Timer) — Secondary Persona
Jordan has never used a "second brain" tool. She opens the app expecting something like Notes.app.

**Red flags found:**
- **"This brain / All brains"** — Jordan doesn't know what a "brain" is in this context. The tab label assumes she's built the mental model already. "My notes / All notes" or "Here / Everywhere" would be clearer without losing the metaphor.
- **Icon-only bottom navigation** (good example.png) — Jordan sees 4 icons and taps randomly. No labels mean no orientation.
- **"Connections" section** — Jordan sees a list of other entries and doesn't understand why they're there or what "connections" means in this context. There's no explanatory text, no empty-state guidance.
- **The AI greeting ("Hey! Ask me about your memories")** is warm but doesn't tell Jordan how entries get into the system in the first place. She'll ask questions and get "not available" responses because she hasn't captured anything.

**Risk level: Medium-High.** Jordan will engage with the chat, get empty responses, and not understand what to do next.

---

### Thoughtful Professional (Project-Specific Persona) — "Marcus"
**Profile:** Knowledge worker who captures meeting notes, recipe experiments, supplier contacts, and personal documents. Uses the app as a searchable, intelligent second brain. Has 200+ entries and relies on connections to surface insights.

**Behaviors:**
- Searches for specific stored facts frequently ("what was that supplier's name?")
- Reviews entry connections to discover patterns ("what notes mention this ingredient?")
- Exports data periodically for backup

**Red flags found:**
- **Connection list at scale (200+ entries) will be overwhelming** with current flat list UI — no grouping, no search within connections, no filtering by type
- **Export/backup broken** — H-3 in the existing High audit confirms the export route returns 404. Marcus trusts this app with critical data, and silent backup failure is a trust-breaker.
- **No power-user query shortcuts** — Marcus has to type full natural language questions every time; there's no query history, no pinned frequent queries, no keyboard shortcut to focus the chat input

---

## Minor Observations

- The moon icon (dark mode toggle) in id.png is the only settings-adjacent UI visible in the chat. It's well-placed and unobtrusive, but its position next to the search icon makes it feel like part of the search header rather than a settings action.
- The amber send button in the chat input (id.png) is the only button that's amber-colored — which is correct (single accent principle). But it's quite small and the icon (arrow) is similarly sized to the input text. Slightly larger touch target recommended.
- The "Share" button at the bottom of entry.png is isolated from all other actions (which are at the top). Action placement is inconsistent: primary/destructive actions (Delete, Edit) are in the top header; secondary/share actions float at the bottom. This split will confuse users.
- The "E" avatar on AI responses (id.png) nicely signals which side is the AI. Consider whether "E" (for Everion) is clear — a user might read it as their own initial if their name starts with E.

---

## Phase 3: Questions Before Action Planning

Based on the findings above, three things need your direction:

**1. Connections list — how far do you want to go?**
The connections section is the biggest design gap. The fix ranges from minimal (add type labels + group by type) to significant (redesign as a visual relationship explorer with type icons, strength indicators, and expand/collapse). Which scope?
- **A) Minimal** — group by type, add small type label, show top 3 with expand
- **B) Significant** — new visual treatment (not a list), relationship-aware display

**2. Capture affordance — is it already built somewhere?**
No screenshot shows a compose/new entry button. Is this a known gap (the button exists in a different view not shown), or is the primary capture path currently the chat-based "capture" command? If the button exists, I don't need to flag it as a P2.

**3. Scope: all issues or priority cut?**
I found 5 ranked issues plus minor observations. Do you want to:
- **A) Top 3 only** — connections list, bottom nav labels, title prefix cleanup
- **B) All 5** — include AI response language and capture affordance too
- **C) Everything including minors** — full pass across all findings
