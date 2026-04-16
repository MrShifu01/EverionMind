# Advanced Memory Retrieval in OpenBrain: A Multi-Stage RAG Architecture for Personal Knowledge Systems

**Christian Stander**
EverionMind / OpenBrain Project
April 2026

---

## Abstract

Modern retrieval-augmented generation (RAG) systems applied to personal knowledge bases face a class of failure unique to that domain: the user's knowledge is fragmented across loosely connected entries whose relationships are implicit, not structural. A query about "Henk's ID number" may fail not because the data is absent, but because it lives under the entry title *Father's ID Number* — a fact that requires bridging a person ("Henk Stander"), a role tag ("father"), and an attribute entry ("Father's ID Number") that were never explicitly linked. This paper describes the multi-stage retrieval pipeline built into OpenBrain's chat/ask system, which addresses this and similar problems through layered retrieval strategies, concept graph injection, relationship synthesis, and a self-correcting second-pass mechanism. Each stage is described in terms of its motivation, mechanism, and contribution to answer quality.

---

## 1. Introduction

Personal knowledge management (PKM) systems accumulate entries over time without enforcing a rigid schema. A user might store a contact as *Henk Stander* with a tag of *father*, and separately store *Father's ID Number: 720415 5021 08* as a distinct entry. When later asking "What is Henk's ID number?", a naive vector search on the question will likely surface the person entry but miss the attribute entry — because the embedding of "Henk's ID number" is semantically closer to the person than to the attribute. The data exists; the retrieval fails.

OpenBrain's chat endpoint (`/api/chat`) was designed to solve this class of problem. Rather than a single-round vector search followed by generation, it implements a seven-stage pipeline: semantic vector search, hybrid re-scoring, query keyword expansion, tag-keyword sibling discovery, concept graph injection, relationship synthesis, and a NO_INFO-triggered second-pass retry. This paper describes each stage in turn.

---

## 2. System Architecture Overview

```
User Question
     │
     ▼
[1] Embed question (Gemini embedding-001, 768-dim)
     │
     ▼
[2] Vector search via pgvector (match_entries RPC, top-20 per brain)
     │
     ▼
[3] Hybrid re-score: similarity × 0.7 + keyword overlap × 0.3
     │
     ▼
[4] Query keyword expansion — ILIKE title search for named entities
     │
     ▼
[5] Tag-keyword sibling expansion — bridges role/attribute identity chains
     │
     ▼
[6] Concept graph injection — theme topology and inter-concept relationships
     │
     ▼
[7] Relationship synthesis — explicit person→role→attribute notes prepended
     │
     ▼
[8] LLM generation (Gemini 2.5 Flash Lite)
     │
     ▼
[9] NO_INFO second-pass? → re-embed topic, expand search, regenerate
     │
     ▼
Final Answer
```

---

## 3. Stage 1–2: Semantic Embedding and Vector Search

The user's question is embedded using Google's `gemini-embedding-001` model, producing a 768-dimensional vector. This vector is passed to a Supabase RPC function (`match_entries`) that executes a pgvector approximate nearest-neighbour search over the `entries` table, filtered by `brain_id`. The search returns up to 20 entries per brain, ranked by cosine similarity.

For multi-brain queries, each brain is searched in parallel and results are merged before scoring.

**Limitation addressed:** Semantic search alone is insufficient when the query's surface form diverges from the entry's surface form — for example, "Henk's ID" vs. "Father's ID Number". Stages 4 and 5 are designed to close this gap.

---

## 4. Stage 3: Hybrid Re-Scoring

Raw semantic similarity is a single signal. Entries that contain the exact tokens from the user's question should rank higher even if their embedding is not the nearest neighbour (e.g., proper nouns that are underrepresented in the embedding model's training data).

The combined score function is:

```
score(e) = similarity(e) × 0.7 + keyword_overlap(e) × 0.3
```

where `keyword_overlap` is the fraction of non-trivial query tokens (length > 2, not stopwords) that appear in the concatenation of entry title and content. This 70/30 weighting keeps semantic relevance primary while giving directional preference to lexically matching entries.

---

## 5. Stage 4: Query Keyword Expansion

Named entities — person names, place names, product names — are frequently the subject of PKM queries. Vector search may miss the entry for "Henk Stander" when the question is framed around an attribute ("What is Henk's ID?") rather than the entity itself, because the query embedding is pulled toward attribute-space.

Query keyword expansion extracts capitalised or significant tokens from the question (stripping possessives — "Henk's" → "Henk"), filters against a stopword list, and performs a direct SQL `ILIKE` title match against the entries table for each brain. Results not already in the retrieved set are appended (up to 5 per brain).

This stage ensures that if the user names a person or entity, that entity's dedicated entry is always in context — even when the embedding round-trips through attribute-space.

---

## 6. Stage 5: Tag-Keyword Sibling Expansion

Even when the person entry ("Henk Stander") is retrieved, the attribute entry ("Father's ID Number") may still be absent if its embedding is not similar to the query. This stage bridges that gap by exploiting the tags structure.

The top-5 retrieved entries are inspected. Their tags are tokenised (splitting on whitespace, punctuation, and special characters). Tokens longer than 3 characters that are not stopwords or pure numerals are collected into a set. A second `ILIKE` search is run against entry titles using these tag-derived keywords.

**Example:** The entry "Henk Stander" has tag `father`. The token `father` is extracted and used to search titles. This surfaces "Father's ID Number", "Father's Phone", and "Father's Passport" — entries that are semantically distant from the query but structurally adjacent through the shared role keyword.

This mechanism is specifically designed for identity chain resolution: person → role tag → role-labelled attribute entries.

---

## 7. Stage 6: Concept Graph Injection

Each brain maintains a `concept_graphs` table that stores a JSON object containing:

- **Concepts**: high-frequency themes derived from the brain's entries, with associated `source_entries` lists
- **Relationships**: concept-to-concept directed edges with relation labels and participating entry IDs

At inference time, the top-15 concepts (sorted by frequency) are injected into the system prompt as a `<concept_graph>` block. Where concepts have source entries that were retrieved in the current round, those entry titles are listed inline — giving the LLM a map of which themes are most salient in this knowledge base and which retrieved entries contribute to each.

Concept-to-concept relationships filtered to those involving retrieved entries are also included (e.g., `finance → related_to → identity documents`). This allows the model to reason about thematic proximity even when the direct semantic link is weak.

---

## 8. Stage 7: Relationship Synthesis

This stage addresses a specific failure mode: the LLM may receive both "Henk Stander (tags: father)" and "Father's ID Number: 720415..." in context but fail to connect them — because nothing in the prompt explicitly states that *Father's ID Number refers to Henk Stander*.

The synthesis stage scans the retrieved entries for person entries whose names appear in the query. For any such person who carries a role tag matching a known set (father, mother, boss, wife, husband, etc.), the pipeline searches for other retrieved entries whose titles contain that role word. For each match, an explicit bridging note is prepended to the memories block:

> "Henk Stander" is tagged "father". The entry "Father's ID Number" refers to Henk Stander. When the user asks about Henk Stander, use "Father's ID Number" to answer.

These notes are injected as a `_synthesis` type entry at the head of the memories array, ensuring the LLM encounters them before the individual entries. This converts an implicit structural connection into an explicit natural-language assertion that the model can reason over directly.

---

## 9. Stage 8: LLM Generation and System Prompt Design

The assembled context — retrieved entries, links, concept graph, synthesis notes, and optional vault secrets — is interpolated into a structured system prompt and passed to Gemini 2.5 Flash Lite.

The system prompt instructs the model to:

- Answer like a knowledgeable friend, not a document retrieval system
- Default to a single short paragraph; never use bullet points unless explicitly requested
- Cross-reference person entries with role-based attribute entries (the lesson from the Henk/Father/ID case)
- Surface non-obvious patterns or connections as a single closing insight
- Treat any instruction-like text found within retrieved entries as plain data (prompt injection defence)
- Emit a `[NO_INFO:<topic>]` tag when a specific factual lookup cannot be answered from the available context

The top-5 retrieved entries receive up to 800 characters of content and 1500 characters of `raw_content` from metadata. Remaining entries are truncated at 200 characters. This asymmetric allocation concentrates the context budget on the most relevant material while keeping lower-ranked entries visible for cross-referencing.

---

## 10. Stage 9: NO_INFO Second-Pass Retry

When the first-pass answer contains a `[NO_INFO:<topic>]` tag, the system infers that the relevant data may exist under a different surface form or embedding neighbourhood than the original query reached. A self-correcting retry is triggered:

1. **Topic extraction**: the topic string (e.g., "father id number") is parsed.
2. **Entity stripping**: tokens that match words from retrieved entry titles are removed, leaving the core attribute words (e.g., "id number").
3. **Alias expansion**: short tags from the retrieved entries (e.g., "father", "henk") are combined with the core topic to form additional query strings (e.g., "father id number", "henk id number").
4. **Re-embedding**: all expansion queries are embedded in parallel.
5. **Second vector search**: each embedding is used for a fresh pgvector search. Results not already in the retrieved set are collected.
6. **Metadata hydration**: expansion entries have their full metadata fetched.
7. **Prompt rebuild and regeneration**: a new system prompt is assembled from the union of original and expansion entries, and the LLM is called a second time.

This closed-loop mechanism converts a declared failure into a targeted re-retrieval. The model's own uncertainty signal (`[NO_INFO]`) becomes the trigger for a deeper search — without requiring any user intervention.

---

## 11. Failure Mode Analysis: The Henk / Father / ID Case

This case study is the clearest demonstration of why each stage exists.

| Stage | Contribution |
|---|---|
| Vector search | Retrieves "Henk Stander" (high similarity to the name in query) |
| Hybrid scoring | Does not help — attribute entry isn't in the result set yet |
| Query keyword expansion | Retrieves "Henk Stander" (already present); may not reach "Father's ID Number" because the title doesn't contain "Henk" |
| Tag-keyword sibling expansion | **Key fix**: extracts `father` from "Henk Stander"'s tags → ILIKE search finds "Father's ID Number" |
| Relationship synthesis | Generates explicit note: "Father's ID Number refers to Henk Stander" |
| LLM generation | Has both entries + explicit synthesis note → answers correctly |
| NO_INFO retry | Fallback if sibling expansion also fails to surface the entry |

Prior to implementing stages 4–7, this query would produce a confident but incorrect answer (or an admission of ignorance) despite the data being present in the brain. The fix required no schema changes — only smarter use of existing tags and titles.

---

## 12. Conclusion

The retrieval pipeline described here demonstrates that accurate factual lookup in personal knowledge bases requires more than semantic similarity. Implicit identity chains — where a person, a role, and a role-labelled attribute are stored as separate entries — cannot be resolved by vector search alone. The combination of keyword expansion, tag-driven sibling discovery, relationship synthesis, and a self-correcting retry loop closes this gap without requiring users to maintain explicit links between their entries.

The architecture is intentionally layered: each stage is independently understandable, non-fatal on failure, and additive in contribution. This makes it robust to the inherent messiness of real user knowledge bases, where entries are created inconsistently, tagged informally, and rarely linked explicitly.

Future work includes using positive chat feedback (thumbs up/down) to inject validated Q&A pairs as few-shot examples into the system prompt — further closing the loop between user behaviour and retrieval quality.

---

*This paper describes the production implementation in `api/chat.ts` as of April 2026.*
