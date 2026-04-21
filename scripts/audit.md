# EverionMind Prompt Audit — Full Coverage (23 prompts)

**Run date:** 2026-04-20  
**Target models:** Gemini 2.5 Flash Lite + frontier (GPT-5, Opus 4+)  
**Sessions:** 69 | **Failures:** 107 | **Distinct failure modes:** 64

---

## Failure Rates At A Glance

| Prompt | Result |
|---|---|
| CAPTURE | 5/20 correct type (25% accuracy). Top failures: type_mismatch(14), phone_not_extracted(5), full_text_not_stored(3) |
| CHAT | 5/5 thumbs-down. Symptoms: verbose_for_lookup, regurgitation, list_overload, missed_fact_in_content, wrong_mode_lookup_for_analytical |
| QA_PARSE | 3/3 sessions with failures: type_mismatch(3), phone_not_extracted(2), price_not_extracted(1), missing_split(1), sensitive_data_untagged(1) |
| FILL_BRAIN | generic_question(1) wrong_priority(1) already_answered(1) |
| ENTRY_AUDIT | false_negatives(1) false_positives(1) over_suggestions(1) |
| NUDGE | 1/3 passing. Failures: contains_json_keys(1), exposes_metadata(1), too_vague(1), exceeds_two_sentences(1) |
| LINK_DISCOVERY | vague_rel_labels(2) missed_links(2) trivial_links(1) |
| LINK_DISCOVERY_PAIRS | false_positives(1) vague_confirmed_labels(1) |
| WEAK_LABEL_RENAME | still_vague_after_rename(2) hallucinated_label(1) |
| DUPLICATE_NAMES | false_positives(1) false_negatives(1) |
| CLUSTER_NAMING | generic_title(1) wrong_type(1) |
| COMBINED_AUDIT | bad_concept_labels(1) generic_gaps(1) missed_entry_issues(1) |
| FILE_SPLIT | missed_split(2) type_mismatch(1) full_text_missing(1) |
| CONNECTION_FINDER | trivial_links(1) missed_connections(2) |
| ENTRY_CONCEPTS | bad_concept_labels(2), passing 1/2 |
| INSIGHT | generic(1) no_cross_reference(1) |
| BATCH_CONCEPTS | bad_concept_labels(2) |
| BATCH_LINKS | vague_labels(2) missed_links(1) |
| PLAN_QUERY | missing_entity(1) generic_expanded_queries(1) |
| SUGGESTIONS | no_deepen_questions(1) generic_questions(1) |
| MERGE | false_negatives(1) false_positives(1) |
| WOW | generic(1) motivational_poster_tone(1) |
| EXTRACT_FILE | added_commentary_or_disclaimer(1) |

---

## Top 5 Failure Modes (cross-prompt)

| Failure mode | Count |
|---|---|
| type_mismatch | 18× |
| phone_not_extracted | 8× |
| missing_split | 5× |
| full_text_not_stored | 4× |
| vague_rel_label | 4× |

---

## 34 Improvement Suggestions

### 🔴 HIGH (13)

**[01] CAPTURE › TYPE_RULES — missing type examples**  
Evidence: 14× type_mismatch. Types absent from working examples: place, account, procedure, ingredient, transaction.  
Add to TYPE_RULES:
- A named physical address or branch location → "place"
- A bank account or financial summary → "account"
- A step-by-step process or SOP → "procedure"
- A single ingredient with quantity/price → "ingredient"
- A financial payment or delivery receipt → "transaction"
- A driver's licence, passport, or expiring document → "document" (NOT "reminder")

Rewrite "note" definition: `"note" ONLY if the content is a free-form memo with no named entity, no date, no price, no phone number, and no identifiable category. If in doubt, pick specific.`

---

**[02] CAPTURE › EXTRACTION_RULES — phone/email critical callout**  
Evidence: phone_not_extracted 5×, email_not_extracted 1×. Rule exists but ignored.  
Add at the top of EXTRACTION_RULES: `"CRITICAL: Any phone number found ANYWHERE in the input MUST go into metadata.phone. Any email MUST go into metadata.email. Do not leave them in content only."`

---

**[03] CAPTURE › TYPE_RULES — secret pre-check at top**  
Evidence: 1× sensitive data (card numbers, PINs) classified as "note".  
Move secret check to the very top of TYPE_RULES: `"SECURITY CHECK FIRST: if the input contains passwords, PINs, card numbers, bank account numbers, API keys, or private keys → type MUST be 'secret'. No exceptions."`

---

**[07] CHAT › SINGLE DATUM — add concrete example**  
Evidence: 1× lookup answered with a paragraph. Rule says "ONLY the value" but ignored by weaker models.  
Rewrite SINGLE DATUM rule: `"SINGLE DATUM: your ENTIRE response is ONLY the value. No label. No sentence. No context. Example: 'what is John's number' → '082 111 3333'. Nothing before, nothing after."`

---

**[08] CHAT › ANALYTICAL — positive framing + failure example**  
Evidence: 1× analytical query answered by listing stored data. Negative framing ("do NOT") ignored by weaker models.  
Rewrite ANALYTICAL HARD RULE:
> "Analytical responses MUST ONLY contain insights the user could NOT derive by reading their own entries. Ask yourself: 'Would the user already know this?' If yes, cut it.  
> Bad: 'Your suppliers are Meaty Boy and FreshMeat.'  
> Good: 'Two suppliers overlap on brisket — concentration risk and pricing leverage.'"

---

**[11] QA_PARSE › secret type — add security pre-check**  
Evidence: 1× password/credential classified as "note" in QA_PARSE.  
Add: `'Use "secret" for passwords, PINs, card numbers, API keys, or sensitive credentials.'`

---

**[13] ENTRY_AUDIT › false negatives — TYPE_MISMATCH and PHONE_FOUND detection**  
Evidence: 1 session where obvious issues were not flagged at all.  
Add: `"PHONE_FOUND check: scan the entire content and title for any digit sequence that looks like a phone number. If found and metadata.phone is empty, flag it."` and `"TYPE_MISMATCH: if a named person's entry is type 'note', flag it."`

---

**[16] NUDGE › prose-only output**  
Evidence: 1× JSON keys leaked into nudge output.  
Add hard negative example:
> "NEVER output entry_id, due_date, type, metadata keys, or any field names.  
> Bad: 'entry_id: abc123, due_date: 2025-04-30: Pay Rand Water'  
> Good: 'Your Rand Water payment is due 30 April — pay it before the end of the month.'"

---

**[18] LINK_DISCOVERY / BATCH_LINKS / CONNECTION_FINDER › vague rel labels**  
Evidence: 4 vague relationship labels across link-finding prompts.  
Add banlist to all three prompts: `"BANNED labels (never use): 'relates to', 'related', 'similar', 'connected', 'associated with', 'linked to'. If you can't name a specific relationship, omit the link."`

---

**[24] COMBINED_AUDIT › CONCEPT LABEL RULES enforcement**  
Evidence: 1 concept label violated the rules (proper nouns, possessives).  
Add inline bad/good examples:
> "Bad: 'John Smith's Phone Number', 'Meaty Boy's Brisket', 'Sarah's Role'  
> Good: 'contact details', 'meat sourcing', 'staff roles'  
> Rule: no names, no apostrophes, no brand names, max 3 words."

---

**[26] FILE_SPLIT › splitting threshold too conservative**  
Evidence: 2× file with multiple distinct records returned as a single entry.  
Add: `"Default to splitting. If you're unsure, split. A contact list of 3 people = 3 entries. Only keep as one entry if the content is genuinely a single indivisible record (one invoice, one SOP, one contract)."`

---

**[32] MERGE › fragmented contact detection + false positive guard**  
Evidence: false_negative 1× (missed 3 fragmented entries), false_positive 1× (two locations merged).  
Add:
> "FRAGMENTED CONTACT: if you see 2+ entries with the same person's name in the title, these are fragments and should be merged.  
> LOCATION GUARD: two entries representing different physical locations of the same brand are NOT duplicates."

---

**[33] WOW › generic motivational output**  
Evidence: 1× wow response was motivational-poster generic with no reference to actual user data.  
Add failure example:
> "Bad: 'You're building a great knowledge base! Keep it up.'  
> Good: 'Brisket is your single point of failure — two suppliers both cover it, and your Classic Burger depends entirely on it. A third supplier would de-risk this.'  
> If you cannot find a genuine surprising connection, return `{'wows':[]}`"

---

### 🟡 MED (19)

**[04] CAPTURE › EXTRACTION_RULES — full_text rule position** — Move to top; rewrite as hard rule for recipe/procedure/document types.

**[05] CAPTURE › TYPE_RULES — reminder false positive guard** — Add: reminder MUST have a date or day_of_week. "Soon" ≠ reminder.

**[06] CAPTURE › SPLIT_RULES — entity vs fact clarification** — Replace "distinct facts" with "distinct real-world entities". Don't split name aliases; DO split distinct people/addresses.

**[09] CHAT › ANALYTICAL — add focus/prioritise trigger words** — Add "prioritise", "what to focus on", "this week", "what matters". Heuristic: surface time-sensitive items first.

**[10] QA_PARSE › TYPE_RULES + SPLIT — align with CAPTURE** — Sync type list: add supplier, secret, account, procedure, ingredient, transaction. Add array-split instruction.

**[12] FILL_BRAIN › question specificity** — Question must reference a specific gap. Stay within brain type (no health goals for a business brain).

**[14] ENTRY_AUDIT › false positives — confidence threshold enforcement** — Only flag if confidence > 90%. "Business Thoughts" as note is NOT a type mismatch.

**[15] ENTRY_AUDIT › max 2 suggestions per entry** — Reinforce hard limit with explicit wording: "Never return 3 or more for one entry."

**[17] NUDGE › actionability and length** — "EXACTLY 1-2 sentences. Each sentence must name a specific action and a specific item or date."

**[19] CONNECTION_FINDER › same-type trivial links** — Don't connect entries just because they share a type.

**[20] CONNECTION_FINDER › missed obvious connections** — Add scanning instruction: for each existing entry, ask if the new entry supplies/employs/applies to it.

**[21] WEAK_LABEL_RENAME › still-vague output and hallucination** — New label must be MORE specific. If can't determine from content alone, omit. Don't guess.

**[22] DUPLICATE_NAMES › false positive / false negative balance** — Add examples: two locations = NOT duplicates. Name aliases = ARE duplicates.

**[25] COMBINED_AUDIT › KNOWLEDGE GAPS specificity** — Each gap question must reference something specific in the entry list.

**[27] ENTRY_CONCEPTS + BATCH_CONCEPTS › concept label rules** — Copy COMBINED_AUDIT's rules verbatim: max 3 words, no proper nouns, no possessives, categorical only.

**[28] INSIGHT › generic output** — Insight MUST name a specific concept from top_concepts and explain the connection.

**[29] PLAN_QUERY › entity extraction from role references** — Role references ("father", "mum") must be added to entities[]. Expand queries to include role + plausible name variants.

**[31] SUGGESTIONS › MIX_RULE and DEEPEN grounding** — Must include ≥1 DEEPEN question that names a specific entry. "What do you want to remember?" is banned.

**[34] EXTRACT_FILE › commentary and disclaimers** — Add bad/good example. No "As an AI...", "Please note...", or "Please verify...".

---

### 🟢 LOW (2)

**[23] CLUSTER_NAMING › generic title and wrong type** — parentTitle must be specific enough to distinguish from other clusters. "Business" is not valid.

**[30] PLAN_QUERY › expandedQueries too generic** — At least one variant must use the entity name directly.

---

## Cross-Cutting Patterns

1. **Vague rel labels** — appears in LINK_DISCOVERY, BATCH_LINKS, CONNECTION_FINDER, LINK_DISCOVERY_PAIRS. A shared banlist in all four prompts eliminates this class of failure.

2. **Concept label quality** — proper nouns/possessives appear in ENTRY_CONCEPTS, BATCH_CONCEPTS, COMBINED_AUDIT. Copy COMBINED_AUDIT's detailed rules verbatim into the other two.

3. **Type-defaulting to "note"** — CAPTURE, QA_PARSE, FILE_SPLIT share this failure but have diverged. Sync their type lists and extraction rules.

4. **Generic output** — dominant failure in FILL_BRAIN, INSIGHT, SUGGESTIONS, WOW. Fix is the same in all four: require output to name a specific entry/concept from the provided input, with inline bad/good examples.
