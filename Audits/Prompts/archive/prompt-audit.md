# EverionMind Prompt Audit — Full Coverage
**Date:** 2026-04-16
**Models targeted:** Gemini 2.5 Flash Lite + frontier (GPT-5, Opus 4+)
**Method:** Mock session — 69 test cases across all 23 prompts
**Source data:** `scripts/mock-prompt-audit/seed.json` (gitignored — local only)
**Run with:** `npm run audit:prompts`

---

## Summary

| Metric | Result |
|---|---|
| Prompts covered | 23 / 23 |
| Total test sessions | 69 |
| Distinct failure modes | 64 |
| Total failure occurrences | 107 |
| Suggestions generated | 34 (HIGH: 13, MED: 19, LOW: 2) |

**Top 5 failure modes across all prompts:**

| Failure mode | Count |
|---|---|
| `type_mismatch` | 18× |
| `phone_not_extracted` | 8× |
| `missing_split` | 5× |
| `full_text_not_stored` | 4× |
| `vague_rel_label` | 4× |

---

## Per-Prompt Failure Rates

| Prompt | Key metric | Result |
|---|---|---|
| CAPTURE | Type accuracy | 5/20 correct (25%) |
| CHAT | Thumbs-down | 5/5 — 5 distinct symptoms |
| QA_PARSE | Sessions with failures | 3/3 — type_mismatch dominant |
| FILL_BRAIN | Failures | generic(1) wrong_priority(1) already_answered(1) |
| ENTRY_AUDIT | False neg / pos / over-sug | 1 / 1 / 1 |
| NUDGE | Passing | 1/3 — JSON keys leaked, vague output |
| LINK_DISCOVERY | Quality | vague_rel(2) missed_link(2) trivial(1) |
| LINK_DISCOVERY_PAIRS | False pos / neg | 1 / 0 + 1 vague confirmed label |
| WEAK_LABEL_RENAME | Quality | still_vague(2) hallucinated(1) |
| DUPLICATE_NAMES | False pos / neg | 1 / 1 |
| CLUSTER_NAMING | Quality | generic_title(1) wrong_type(1) |
| COMBINED_AUDIT | Quality | bad_concepts(1) generic_gaps(1) missed_issues(1) |
| FILE_SPLIT | Split accuracy | missed_split(2) type_mismatch(1) full_text_missing(1) |
| CONNECTION_FINDER | Quality | trivial(1) missed_connections(2) |
| ENTRY_CONCEPTS | Concept labels | bad_labels(2) — 1/2 passing |
| INSIGHT | Quality | generic(1) no_cross_reference(1) |
| BATCH_CONCEPTS | Concept labels | bad_labels(2) |
| BATCH_LINKS | Quality | vague_labels(2) missed_links(1) |
| PLAN_QUERY | Quality | missing_entity(1) generic_expanded(1) |
| SUGGESTIONS | Mix compliance | no_deepen(1) generic(1) |
| MERGE | False neg / pos | 1 / 1 |
| WOW | Quality | generic(1) motivational_poster(1) |
| EXTRACT_FILE | Purity | added_commentary(1) |

---

## Cross-Cutting Patterns

### 1. Vague relationship labels — 4 prompts affected
LINK_DISCOVERY, BATCH_LINKS, CONNECTION_FINDER, and LINK_DISCOVERY_PAIRS all produce "relates to", "similar", "associated with". All four prompts have the same verb-phrase rule; none have a banlist. **One shared banlist addition fixes all four.**

### 2. Concept label quality — 3 prompts affected
ENTRY_CONCEPTS, BATCH_CONCEPTS, and COMBINED_AUDIT all violate the concept label rules (proper nouns, possessives, too-specific). COMBINED_AUDIT has the most detailed rules; the other two have minimal guidance. **Copy COMBINED_AUDIT's label rules verbatim into ENTRY_CONCEPTS and BATCH_CONCEPTS.**

### 3. Type-defaulting to "note" — 3 prompts affected
CAPTURE, QA_PARSE, and FILE_SPLIT all default to "note" when uncertain. Their type lists have diverged. **Sync type lists and extraction rules across all three.**

### 4. Generic output — 4 prompts affected
FILL_BRAIN, INSIGHT, SUGGESTIONS, and WOW all produce generic responses not tied to the user's actual data. **The fix is the same in all four:** require output to name a specific entry or concept from the provided input, with a bad/good example inline.

---

## Suggestions

### 🔴 HIGH Priority

---

**[01] CAPTURE › TYPE_RULES — missing type examples**

Evidence: 14× type_mismatch. Types absent from working examples: `place`, `account`, `procedure`, `ingredient`, `transaction`.

Add to TYPE_RULES:
```
- A named physical address or branch location → "place"
- A bank account or financial summary → "account"
- A step-by-step process or SOP → "procedure"
- A single ingredient with quantity/price → "ingredient"
- A financial payment or delivery receipt → "transaction"
- A driver's licence, passport, or expiring document → "document" (NOT "reminder")
```

Rewrite `note` definition:
> `"note" ONLY if the content is a free-form memo with no named entity, no date, no price, no phone number, and no identifiable category. If in doubt, pick specific.`

---

**[02] CAPTURE › EXTRACTION_RULES — phone/email critical callout**

Evidence: `phone_not_extracted` 5×, `email_not_extracted` 1×. Rule exists but ignored.

Add at the top of EXTRACTION_RULES:
```
CRITICAL: Any phone number found ANYWHERE in the input MUST go into metadata.phone.
Any email MUST go into metadata.email. Do not leave them in content only.
```

---

**[03] CAPTURE › TYPE_RULES — `secret` pre-check at top**

Evidence: 1× sensitive data (card numbers, PINs) classified as `note`.

Move to very top of TYPE_RULES:
```
SECURITY CHECK FIRST: if the input contains passwords, PINs, card numbers, bank
account numbers, API keys, or private keys → type MUST be "secret". No exceptions.
```

---

**[07] CHAT › SINGLE DATUM — add concrete example**

Evidence: 1× lookup answered with a paragraph. Rule says "ONLY the value" but ignored by weaker models.

Rewrite SINGLE DATUM rule:
```
SINGLE DATUM: your ENTIRE response is ONLY the value. No label. No sentence. No context.
Example: "what is John's number" → "082 111 3333". Nothing before, nothing after.
```

---

**[08] CHAT › ANALYTICAL — positive framing + failure example**

Evidence: 1× analytical query answered by listing stored data. Negative framing ("do NOT") ignored by weaker models.

Rewrite ANALYTICAL HARD RULE:
```
Analytical responses MUST ONLY contain insights the user could NOT derive by reading
their own entries. Ask yourself: "Would the user already know this?" If yes, cut it.
Bad:  "Your suppliers are Meaty Boy and FreshMeat."
Good: "Two suppliers overlap on brisket — concentration risk and pricing leverage."
```

---

**[11] QA_PARSE › `secret` type — add security pre-check**

Evidence: 1× password classified as `note` in QA_PARSE. The `secret` type is not mentioned in QA_PARSE at all.

Add:
```
Use "secret" for passwords, PINs, card numbers, API keys, or sensitive credentials.
```

---

**[13] ENTRY_AUDIT › false negatives — TYPE_MISMATCH and PHONE_FOUND**

Evidence: 1 session where obvious issues (named person as `note`, phone number in content) were not flagged.

Strengthen detection:
```
PHONE_FOUND check: scan content and title for any digit sequence resembling a phone
number (10 digits, or groups like "082 111 3333"). If found and metadata.phone is
empty, flag it. Confidence > 90% is trivially met for a visible phone number.
TYPE_MISMATCH: if a named person's entry is type "note", flag it.
```

---

**[16] NUDGE › prose-only output**

Evidence: 1× JSON keys leaked into nudge output (`entry_id`, `due_date` appearing verbatim).

Add a hard negative example:
```
NEVER output entry_id, due_date, type, metadata keys, or any field names.
Bad:  "entry_id: abc123, due_date: 2025-04-30: Pay Rand Water"
Good: "Your Rand Water payment is due 30 April — pay it before the end of the month."
```

---

**[18] LINK_DISCOVERY / BATCH_LINKS / CONNECTION_FINDER › vague rel labels**

Evidence: 4 vague labels across all three prompts ("relates to", "related", "similar", "associated with"). Same fix applies to all.

Add to all three prompts:
```
BANNED labels (never use): "relates to", "related", "similar", "connected",
"associated with", "linked to". If you can't name a specific relationship, omit the link.
```

---

**[24] COMBINED_AUDIT › CONCEPT LABEL RULES enforcement**

Evidence: 1 concept label used a proper noun. Rules are detailed but ignored by weaker models.

Add concrete examples inline:
```
Bad:  "John Smith's Phone Number", "Meaty Boy's Brisket", "Sarah's Role"
Good: "contact details", "meat sourcing", "staff roles"
Rule: no names, no apostrophes, no brand names, max 3 words.
```

---

**[26] FILE_SPLIT › splitting threshold too conservative**

Evidence: 2× file with multiple distinct records returned as a single entry (staff list of 3, two-recipe document).

Add:
```
Default to splitting. If you're unsure, split. A contact list of 3 people = 3 entries.
A document with 2 recipes = 2 entries. Only keep as one entry if the content is
genuinely a single indivisible record (one invoice, one SOP, one contract).
```

---

**[32] MERGE › fragmented contact detection + false positive guard**

Evidence: `false_negative` 1× (missed 3 fragmented person entries), `false_positive` 1× (two different locations merged).

Add:
```
FRAGMENTED CONTACT: if you see 2+ entries with the same person's name in the title
(e.g. "John Abrahams Phone", "John Abrahams ID", "John Abrahams Address"),
these are fragments of one contact and should be merged.
LOCATION GUARD: two entries representing different physical locations of the same brand
are NOT duplicates — they are distinct physical entities. Do not merge them.
```

---

**[33] WOW › generic motivational output**

Evidence: 1× wow response was motivational-poster generic with no reference to actual user data.

Add failure example inline:
```
Bad:  "You're building a great knowledge base! Keep it up."
Good: "Brisket is your single point of failure — two suppliers both cover it,
      and your Classic Burger depends entirely on it. A third supplier would de-risk this."
If you cannot find a genuine surprising connection, return {"wows":[]}
```

---

### 🟡 MED Priority

**[04] CAPTURE › EXTRACTION_RULES — move `full_text` rule to top**
The rule exists but is buried and ignored for recipes/procedures. Move it up; rewrite as `FULL TEXT RULE (do not skip)`.

**[05] CAPTURE › TYPE_RULES — reminder false positive guard**
Add one sentence: if input has urgency words but no specific date, classify as `note`, not `reminder`.

**[06] CAPTURE › SPLIT_RULES — entity vs fact clarification**
Replace "distinct facts" with "distinct real-world entities". Add negative example (name alias ≠ split).

**[09] CHAT › ANALYTICAL — add focus/prioritise trigger words**
Add `"prioritise"`, `"what to focus on"`, `"this week"`, `"what matters"` to analytical trigger list.

**[10] QA_PARSE › TYPE_RULES + SPLIT — align with CAPTURE**
QA_PARSE type list is shorter. Sync: add `supplier`, `account`, `procedure`, `ingredient`, `transaction`. Add split instruction for multiple people/businesses in one answer.

**[12] FILL_BRAIN › question specificity**
Add two rules: (1) question must reference a gap in existing entries, not repeat answered info; (2) stay within brain type scope.

**[14] ENTRY_AUDIT › false positives — confidence threshold**
Reinforce: a `note` entry about general business thoughts is NOT a TYPE_MISMATCH. Confidence must be > 90%, unambiguously.

**[15] ENTRY_AUDIT › max 2 suggestions per entry**
Weaker models return 3+. Rewrite as `HARD LIMIT: AT MOST 2 per entry. If 3+ issues found, pick the 2 most critical.`

**[17] NUDGE › actionability and length**
Rewrite as hard constraint: `EXACTLY 1-2 sentences. Each must name a specific action and specific item or date.`

**[19] CONNECTION_FINDER › same-type trivial links**
Add: two suppliers are not connected unless one supplies to the other.

**[20] CONNECTION_FINDER › missed obvious connections**
Add scanning instruction: for each existing entry, ask if the new entry supplies to / employs / applies at it.

**[21] WEAK_LABEL_RENAME › still-vague and hallucinated output**
Add: new label must be MORE specific than old. If unsure from entry content alone, omit. Do not guess.

**[22] DUPLICATE_NAMES › location guard + alias detection**
Add examples: same brand, different locations = NOT duplicate. Name aliases = IS duplicate.

**[25] COMBINED_AUDIT › KNOWLEDGE GAPS specificity**
Each gap question must reference something specific in the entry list. Generic questions not allowed.

**[27] ENTRY_CONCEPTS + BATCH_CONCEPTS › concept label rules**
Both prompts lack COMBINED_AUDIT's label rules. Copy them verbatim into both, with bad/good examples.

**[28] INSIGHT › generic output**
Add: insight MUST name a specific concept from `top_concepts` and explain how the new entry affects it.

**[29] PLAN_QUERY › entity extraction from role references**
Add: role references ("father", "mum") must be included in `entities[]`. Expand queries to include role variants.

**[31] SUGGESTIONS › MIX_RULE and DEEPEN grounding**
DEEPEN questions must name a specific entry and ask about a gap in it. Generic DEEPEN questions not allowed.

**[34] EXTRACT_FILE › commentary and disclaimers**
Add bad example: `"As an AI..."`, `"Please verify..."`, `"You may want to..."` are all banned. Output is extracted text only.

---

### 🟢 LOW Priority

**[23] CLUSTER_NAMING › generic title and wrong type**
`parentTitle` must be specific enough to distinguish from other clusters. `parentType` should match the majority type in the cluster.

**[30] PLAN_QUERY › expandedQueries too generic**
At least one expanded query must include the entity name or attribute directly.

---

## Implementation Order

| # | Change | File | Effort |
|---|---|---|---|
| 1 | `secret` pre-check at top of TYPE_RULES | `src/config/prompts.ts` CAPTURE | 2 min |
| 2 | Phone/email CRITICAL callout | `src/config/prompts.ts` CAPTURE | 2 min |
| 3 | Add missing type examples (place, account, procedure, ingredient, transaction) | `src/config/prompts.ts` CAPTURE | 5 min |
| 4 | Rewrite `note` definition to exclusionary | `src/config/prompts.ts` CAPTURE | 3 min |
| 5 | Move `full_text` rule to top of EXTRACTION_RULES | `src/config/prompts.ts` CAPTURE | 2 min |
| 6 | Add vague rel label banlist to all 4 link prompts | `src/config/prompts.ts` | 5 min |
| 7 | Copy COMBINED_AUDIT concept label rules to ENTRY_CONCEPTS + BATCH_CONCEPTS | `src/config/prompts.ts` | 5 min |
| 8 | Sync QA_PARSE type list with CAPTURE | `src/config/prompts.ts` | 5 min |
| 9 | CHAT SINGLE DATUM — add example | `api/_lib/prompts.ts` + `src/config/prompts.ts` | 3 min |
| 10 | CHAT ANALYTICAL — positive framing + bad/good example | `api/_lib/prompts.ts` + `src/config/prompts.ts` | 5 min |
| 11 | NUDGE — prose-only bad example | `src/config/prompts.ts` | 2 min |
| 12 | FILE_SPLIT — default-to-split instruction | `src/config/prompts.ts` | 2 min |
| 13 | MERGE — fragmented contact + location guard | `api/_lib/prompts.ts` | 3 min |
| 14 | WOW — generic failure example + empty fallback | `api/_lib/prompts.ts` | 3 min |
| 15 | ENTRY_AUDIT — phone scan instruction + max-2 hard limit | `src/config/prompts.ts` | 3 min |
| 16 | FILL_BRAIN — gap specificity + brain type scope rules | `src/config/prompts.ts` | 3 min |
| 17 | INSIGHT — require concept reference | `src/config/prompts.ts` | 2 min |
| 18 | SUGGESTIONS — DEEPEN grounding rule | `api/_lib/prompts.ts` | 2 min |
| 19 | Remaining MED items | both files | 15 min |

**Estimated net token increase:** < 200 tokens on CAPTURE, < 100 tokens on CHAT, < 50 tokens each on remaining prompts. No prompt should grow by more than 15%.

---

## Notes on Model Compatibility

- **Gemini 2.5 Flash Lite** struggles most with: negative constraints ("do NOT"), type selection under uncertainty, rules buried late in long prompts, and maintaining output purity (JSON keys leaking into prose). Fixes: positive framing, pre-checks, rule ordering, concrete bad/good examples.
- **Frontier models (Opus 4+, GPT-5)** follow existing rules more reliably but still hit `full_text_not_stored`, `false_split`, and concept label violations — structural issues not intelligence gaps.
- **Do not bloat prompts to fix weak model failures.** Every suggestion above is a reorder, a rewrite, or a single-sentence addition. The goal is precision, not volume.

---

## Swap Path — Real Data

Replace the `loadSeed()` call in `analyse.ts` with a Supabase loader:

```typescript
// Example: replace loadSeed() with this
async function loadFromSupabase(): Promise<SeedData> {
  const { data: entries } = await supabase
    .from("entries")
    .select("id, title, type, content, metadata, tags")
    .order("created_at", { ascending: false })
    .limit(100);
  // Map entries into SeedEntry shape, populate expected_* from ground truth
  // All analysis functions stay the same
}
```

The analysis functions take typed arrays — only the loader changes.
