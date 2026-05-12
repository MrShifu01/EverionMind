/**
 * Retrieval eval runner.
 *
 * Calls retrieveEntries() directly with each fixture's query + brain, then
 * checks that the expected title patterns appear in the returned entries.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/retrieval-eval/run.ts
 *
 * Or via npm:
 *   npm run test:retrieval
 *
 * Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY.
 *
 * Exit code 0 if all fixtures pass, 1 if any fail.
 */

// retrievalCore.ts reads process.env at module scope, so env must already be
// loaded before this import resolves. The --env-file flag on the tsx
// invocation handles that.
import { retrieveEntries } from "../../api/_lib/retrievalCore.js";
import { fixtures, type Fixture } from "./fixtures.js";

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY ?? "").trim();
if (!GEMINI_API_KEY) {
  console.error("✗ GEMINI_API_KEY env var required (run with --env-file=.env.local)");
  process.exit(2);
}
if (!process.env.SUPABASE_URL) {
  console.error("✗ SUPABASE_URL env var required");
  process.exit(2);
}

interface FixtureResult {
  fixture: Fixture;
  pass: boolean;
  hitCount: number;
  required: number;
  topTitles: string[];
  matched: string[];
  unmatched: string[];
  errMsg?: string;
}

async function runOne(f: Fixture): Promise<FixtureResult> {
  const required = f.minHits ?? f.expectTitles.length;
  try {
    const r = await retrieveEntries(f.query, f.brainId, GEMINI_API_KEY, f.limit ?? 15);
    const titles = r.entries.map((e) => e.title ?? "");
    const matched: string[] = [];
    const unmatched: string[] = [];
    for (const pattern of f.expectTitles) {
      const re = new RegExp(pattern, "i");
      if (titles.some((t) => re.test(t))) matched.push(pattern);
      else unmatched.push(pattern);
    }
    return {
      fixture: f,
      pass: matched.length >= required,
      hitCount: matched.length,
      required,
      topTitles: titles.slice(0, 8),
      matched,
      unmatched,
    };
  } catch (err) {
    return {
      fixture: f,
      pass: false,
      hitCount: 0,
      required,
      topTitles: [],
      matched: [],
      unmatched: f.expectTitles,
      errMsg: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<void> {
  console.log(`\nRetrieval eval — ${fixtures.length} fixtures\n`);

  const results: FixtureResult[] = [];
  for (const f of fixtures) {
    process.stdout.write(`  ${f.id.padEnd(32)} `);
    const result = await runOne(f);
    results.push(result);
    if (result.pass) {
      console.log(`PASS (${result.hitCount}/${result.required})`);
    } else if (result.errMsg) {
      console.log(`ERROR — ${result.errMsg}`);
    } else {
      console.log(`FAIL (${result.hitCount}/${result.required})`);
    }
  }

  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0) {
    console.log(`\nFailures:\n`);
    for (const r of failed) {
      console.log(`✗ ${r.fixture.id}`);
      console.log(`  query:       "${r.fixture.query}"`);
      console.log(`  why it matters: ${r.fixture.description}`);
      console.log(`  expected ${r.required} matches, got ${r.hitCount}`);
      if (r.unmatched.length > 0) {
        console.log(`  unmatched patterns:`);
        r.unmatched.forEach((p) => console.log(`    - /${p}/i`));
      }
      console.log(`  top retrieved titles:`);
      if (r.topTitles.length === 0) console.log(`    (none)`);
      else r.topTitles.forEach((t, i) => console.log(`    ${i + 1}. ${t || "(empty title)"}`));
      if (r.errMsg) console.log(`  error: ${r.errMsg}`);
      console.log();
    }
  }

  const passed = results.length - failed.length;
  const status = failed.length > 0 ? "FAILED" : "OK";
  console.log(
    `${status} — ${passed}/${results.length} passed${failed.length ? ` (${failed.length} failed)` : ""}\n`,
  );
  process.exit(failed.length > 0 ? 1 : 0);
}

void main();
