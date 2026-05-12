/**
 * One-shot backfill: scan every entry for a user, run the deterministic
 * fact extractor (api/_lib/factExtraction.ts), and upsert the results
 * into important_memories.
 *
 * Idempotent — same entry + same field always produces the same
 * memory_key, so the active-key unique index (migration 062) rejects
 * dupes with 409 and we count those as "already exists, fine".
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/backfill-canonical-facts.ts <user_id>
 *
 * Or pass user_id via USER_ID env. Service-role key required (skips RLS,
 * scans across brains the user owns/can-access).
 */

import { extractFactsFromEntry, type ExtractedFact } from "../api/_lib/factExtraction.js";

const SB_URL = (process.env.SUPABASE_URL ?? "").trim();
const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const USER_ID = (process.argv[2] ?? process.env.USER_ID ?? "").trim();

if (!SB_URL || !SB_KEY) {
  console.error("✗ SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required (run with --env-file=.env.local)");
  process.exit(2);
}
if (!USER_ID) {
  console.error("✗ user_id required (pass as CLI arg or USER_ID env var)");
  process.exit(2);
}

const HDR = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

interface EntryRow {
  id: string;
  title: string;
  type: string | null;
  brain_id: string;
  metadata: Record<string, unknown> | null;
}

async function fetchAllEntries(userId: string): Promise<EntryRow[]> {
  const all: EntryRow[] = [];
  let offset = 0;
  const PAGE = 500;
  for (;;) {
    const r = await fetch(
      `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(
        userId,
      )}&deleted_at=is.null&type=neq.secret&select=id,title,type,brain_id,metadata&order=created_at.asc&limit=${PAGE}&offset=${offset}`,
      { headers: HDR },
    );
    if (!r.ok) throw new Error(`fetch entries page @ offset ${offset}: HTTP ${r.status}`);
    const rows = (await r.json()) as EntryRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function upsertFact(
  fact: ExtractedFact,
  userId: string,
  brainId: string,
): Promise<"inserted" | "exists" | "failed"> {
  const r = await fetch(`${SB_URL}/rest/v1/important_memories`, {
    method: "POST",
    headers: { ...HDR, Prefer: "return=minimal" },
    body: JSON.stringify({
      brain_id: brainId,
      user_id: userId,
      memory_key: fact.memory_key,
      title: fact.title,
      summary: fact.summary,
      memory_type: fact.memory_type,
      source_entry_ids: fact.source_entry_ids,
      created_by: "system",
      status: "active",
    }),
  });
  if (r.status === 409) return "exists";
  if (r.ok) return "inserted";
  console.error(`  upsert ${fact.memory_key} → HTTP ${r.status}: ${await r.text().catch(() => "")}`);
  return "failed";
}

async function main(): Promise<void> {
  console.log(`\nBackfill canonical facts — user ${USER_ID}\n`);
  const entries = await fetchAllEntries(USER_ID);
  console.log(`Found ${entries.length} entries to process\n`);

  let entriesProcessed = 0;
  let entriesWithFacts = 0;
  let factsTotal = 0;
  let inserted = 0;
  let exists = 0;
  let failed = 0;

  for (const entry of entries) {
    entriesProcessed++;
    const facts = extractFactsFromEntry(entry);
    if (facts.length === 0) continue;
    entriesWithFacts++;
    factsTotal += facts.length;
    for (const fact of facts) {
      const r = await upsertFact(fact, USER_ID, entry.brain_id);
      if (r === "inserted") inserted++;
      else if (r === "exists") exists++;
      else failed++;
    }
    if (entriesProcessed % 50 === 0 || entriesProcessed === entries.length) {
      console.log(
        `  ${entriesProcessed}/${entries.length}  (with-facts: ${entriesWithFacts}, new: ${inserted}, dup: ${exists}, fail: ${failed})`,
      );
    }
  }

  console.log(`\nDone.`);
  console.log(`  entries scanned:    ${entriesProcessed}`);
  console.log(`  entries with facts: ${entriesWithFacts}`);
  console.log(`  facts extracted:    ${factsTotal}`);
  console.log(`  newly inserted:     ${inserted}`);
  console.log(`  already exist:      ${exists}`);
  console.log(`  failed:             ${failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

void main();
