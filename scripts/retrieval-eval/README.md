# Retrieval eval

Real-data regression suite for `retrieveEntries` / `retrieveEntriesForUser`. Every
known retrieval failure becomes a fixture. The eval runs against the **production**
Supabase brain (because that's where the real data is) and asserts that each
fixture's expected entry titles appear in the returned results.

If a fixture fails, the change to retrieval is broken — do not ship.

## Run

```bash
npm run test:retrieval
```

This invokes `tsx --env-file=.env.local scripts/retrieval-eval/run.ts`. The env
file must define `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
`GEMINI_API_KEY`.

Exit code 0 if all fixtures pass, 1 if any fail, 2 if env is missing.

Cost per run: ~$0.0005 in Gemini embedding calls (one per fixture). Negligible.
Don't worry about running it often.

## Add a fixture

Every time a retrieval failure is reported (a user asks something obvious and
doesn't get the right entry), add it to `fixtures.ts`. Example:

```ts
{
  id: "person-cellphone",
  description: "Asking for someone's cell phone must surface their contact entry.",
  query: "what's Yolandi's cellphone",
  brainId: MY_BRAIN,
  expectTitles: ["Yolandi"],
},
```

`expectTitles` are case-insensitive regex patterns. Most fixtures just use plain
text (a regex with no metacharacters is fine). Use `|` for alternates:
`["Adriaan|Henk|Father"]` matches any of those words appearing in a title.

`minHits` (optional, defaults to `expectTitles.length`) controls how many of the
listed patterns must match. Use it when you want at-least-N-of-M semantics:

```ts
expectTitles: ["Landon", "Lesego", "Tshepang", "Benita", "Avela", "Teboho"],
minHits: 6,  // all six staff entries must surface
```

## How fixtures are interpreted

Each fixture runs `retrieveEntries(query, brainId, GEMINI_API_KEY, limit)`, then
matches each `expectTitles` pattern against the returned entries' titles. Any
matched pattern counts; ordering doesn't matter; one entry can match multiple
patterns.

The fixture passes if **matched count ≥ minHits**.

## What this catches

- Keyword-pass regressions (the AND-by-default `wfts` bug that triggered this
  whole audit).
- Hybrid-score weight changes that under-rank exact title matches.
- Vector-recall floor changes that drop low-similarity title hits.
- Tag-sibling expansion regressions.
- Tier 1 (`important_memories`) fast-path breakage once auto-fact-extraction
  is wired (phase 2 of the audit).

## What this does NOT catch

- The LLM's downstream synthesis (this only tests the retrieval layer).
- RLS — the eval runs as service role, so RLS bugs slip through. Add a
  separate RLS test suite if needed.
- Performance — fixture timings aren't asserted. Run the same query under
  a profiler if you need p95 numbers.

## Multi-user

Fixtures currently hard-code Christian Stander's brain IDs because he's the
sole pre-launch user. Before opening this eval to other accounts, refactor
the `Fixture` shape to take `brainId` via a per-suite resolver — one suite
per user with their own brains and expected data.
