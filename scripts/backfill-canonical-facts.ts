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
 *
 * --llm flag:
 *   tsx --env-file=.env.local scripts/backfill-canonical-facts.ts <user_id> --llm
 *
 * Adds an LLM pass after the deterministic walker. For every entry that
 * doesn't yet have `metadata.enrichment.llm_facts_extracted=true`, calls
 * Gemini Flash with SERVER_PROMPTS.LLM_FACT_EXTRACT and upserts any
 * qualifying facts as `created_by='system_llm'`. Skips secret / persona /
 * list types and short-content entries. Stamps the flag on the entry
 * regardless so the runtime pipeline doesn't re-run.
 *
 * Cost: ~$0.002 per LLM call (Gemini Flash). 275 entries ≈ $0.55. Trivial.
 */

import {
  extractFactsFromEntry,
  extractFactsFromProseCandidates,
  type ExtractedFact,
  type ProseFactCandidate,
} from "../api/_lib/factExtraction.js";
import { SERVER_PROMPTS } from "../api/_lib/prompts.js";

const SB_URL = (process.env.SUPABASE_URL ?? "").trim();
const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY ?? "").trim();
const args = process.argv.slice(2);
const RUN_LLM = args.includes("--llm");
const USER_ID = (args.find((a) => !a.startsWith("--")) ?? process.env.USER_ID ?? "").trim();

if (!SB_URL || !SB_KEY) {
  console.error("✗ SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required (run with --env-file=.env.local)");
  process.exit(2);
}
if (!USER_ID) {
  console.error("✗ user_id required (pass as CLI arg or USER_ID env var)");
  process.exit(2);
}
if (RUN_LLM && !GEMINI_API_KEY) {
  console.error("✗ GEMINI_API_KEY required when running with --llm");
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
  content: string | null;
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
      )}&deleted_at=is.null&type=neq.secret&select=id,title,content,type,brain_id,metadata&order=created_at.asc&limit=${PAGE}&offset=${offset}`,
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
  createdBy: "system" | "system_llm",
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
      created_by: createdBy,
      status: "active",
    }),
  });
  if (r.status === 409) {
    await refreshExistingFact(fact, userId, brainId, createdBy);
    return "exists";
  }
  if (r.ok) return "inserted";
  console.error(`  upsert ${fact.memory_key} → HTTP ${r.status}: ${await r.text().catch(() => "")}`);
  return "failed";
}

async function refreshExistingFact(
  fact: ExtractedFact,
  userId: string,
  brainId: string,
  createdBy: "system" | "system_llm",
): Promise<void> {
  const q = new URLSearchParams({
    user_id: `eq.${userId}`,
    brain_id: `eq.${brainId}`,
    memory_key: `eq.${fact.memory_key}`,
    status: "eq.active",
    select: "id,title,summary,source_entry_ids,created_by",
    limit: "1",
  });
  const r = await fetch(`${SB_URL}/rest/v1/important_memories?${q.toString()}`, { headers: HDR });
  if (!r.ok) return;
  const rows: Array<{
    id: string;
    title: string | null;
    summary: string | null;
    source_entry_ids: string[] | null;
    created_by: "user" | "system" | "system_llm" | null;
  }> = await r.json().catch(() => []);
  const row = rows[0];
  if (!row || row.created_by === "user") return;

  const mergedSources = Array.from(
    new Set([...(row.source_entry_ids ?? []), ...fact.source_entry_ids].filter(Boolean)),
  );
  const patch: Record<string, unknown> = {};
  if (row.title !== fact.title) patch.title = fact.title;
  if (row.summary !== fact.summary) patch.summary = fact.summary;
  if (JSON.stringify(row.source_entry_ids ?? []) !== JSON.stringify(mergedSources)) {
    patch.source_entry_ids = mergedSources;
  }
  if (row.created_by === "system_llm" && createdBy === "system") {
    patch.created_by = "system";
  }
  if (Object.keys(patch).length === 0) return;

  const patchRes = await fetch(
    `${SB_URL}/rest/v1/important_memories?id=eq.${encodeURIComponent(row.id)}`,
    {
      method: "PATCH",
      headers: { ...HDR, Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    },
  );
  if (!patchRes.ok) {
    console.error(`  refresh ${fact.memory_key} → HTTP ${patchRes.status}`);
  }
}

// ── LLM extraction pass (only when --llm flag set) ─────────────────────────

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const LLM_FACT_MIN_CONFIDENCE = 0.85;
const LLM_FACT_MIN_CONTENT_CHARS = 80;

function parseLLMJSON(raw: string): unknown {
  const text = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const match = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function callGeminiForFacts(entry: EntryRow): Promise<ProseFactCandidate[] | null> {
  const meta = entry.metadata ?? {};
  const fullText = typeof meta.full_text === "string" ? meta.full_text : "";
  const attachmentText = typeof meta.attachment_text === "string" ? meta.attachment_text : "";
  const parts: string[] = [];
  if (entry.title) parts.push(`Title: ${entry.title}`);
  if (entry.content) parts.push(`Content:\n${entry.content}`);
  if (fullText && (!entry.content || !entry.content.includes(fullText.slice(0, 100)))) {
    parts.push(`Full text:\n${fullText}`);
  }
  if (attachmentText) parts.push(`Attachment text:\n${attachmentText}`);
  const body = parts.join("\n\n").slice(0, 6000);
  if (!body || body.length < LLM_FACT_MIN_CONTENT_CHARS) return [];

  const userMsg = `Entry ID: ${entry.id}\n<entry>\nType: ${entry.type || "note"}\n${body}\n</entry>`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SERVER_PROMPTS.LLM_FACT_EXTRACT }] },
      contents: [{ role: "user", parts: [{ text: userMsg }] }],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 800,
        temperature: 0.2,
      },
    }),
  });
  if (!res.ok) {
    console.error(`  gemini ${entry.id} HTTP ${res.status}`);
    return null;
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) return [];
  const candidate = parseLLMJSON(text);
  const arr: unknown = Array.isArray(candidate)
    ? candidate
    : (candidate as { facts?: unknown } | null)?.facts;
  return Array.isArray(arr) ? (arr as ProseFactCandidate[]) : [];
}

async function stampLLMFlag(entry: EntryRow): Promise<void> {
  const meta = entry.metadata ?? {};
  const enr = (meta.enrichment ?? {}) as Record<string, unknown>;
  const nextMeta = { ...meta, enrichment: { ...enr, llm_facts_extracted: true } };
  await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry.id)}`,
    {
      method: "PATCH",
      headers: { ...HDR, Prefer: "return=minimal" },
      body: JSON.stringify({ metadata: nextMeta }),
    },
  ).catch((err: unknown) => console.error(`  flag stamp ${entry.id} failed`, err));
}

async function main(): Promise<void> {
  console.log(`\nBackfill canonical facts — user ${USER_ID}${RUN_LLM ? " (with --llm pass)" : ""}\n`);
  const entries = await fetchAllEntries(USER_ID);
  console.log(`Found ${entries.length} entries to process\n`);

  let entriesProcessed = 0;
  let entriesWithFacts = 0;
  let factsTotal = 0;
  let inserted = 0;
  let exists = 0;
  let failed = 0;

  let llmEntriesProcessed = 0;
  let llmEntriesSkipped = 0;
  let llmFactsTotal = 0;
  let llmInserted = 0;
  let llmExists = 0;
  let llmFailed = 0;

  for (const entry of entries) {
    entriesProcessed++;
    const facts = extractFactsFromEntry(entry);
    if (facts.length > 0) {
      entriesWithFacts++;
      factsTotal += facts.length;
      for (const fact of facts) {
        const r = await upsertFact(fact, USER_ID, entry.brain_id, "system");
        if (r === "inserted") inserted++;
        else if (r === "exists") exists++;
        else failed++;
      }
    }

    if (RUN_LLM) {
      const enr = ((entry.metadata ?? {}).enrichment ?? {}) as Record<string, unknown>;
      const alreadyDone = enr.llm_facts_extracted === true;
      const skipType =
        entry.type === "secret" || entry.type === "persona" || entry.type === "list";
      if (alreadyDone || skipType) {
        llmEntriesSkipped++;
      } else {
        llmEntriesProcessed++;
        const raw = await callGeminiForFacts(entry);
        if (raw !== null) {
          // Reuse the runtime gating: confidence floor, title shape,
          // memory_type normalisation, in-batch dedup, max 8.
          const cleanFacts = extractFactsFromProseCandidates(
            { id: entry.id, title: entry.title, type: entry.type, metadata: entry.metadata },
            raw,
            LLM_FACT_MIN_CONFIDENCE,
          );
          llmFactsTotal += cleanFacts.length;
          for (const fact of cleanFacts) {
            const r = await upsertFact(fact, USER_ID, entry.brain_id, "system_llm");
            if (r === "inserted") llmInserted++;
            else if (r === "exists") llmExists++;
            else llmFailed++;
          }
          // Stamp the flag even on empty extraction — empty is a real
          // answer and we don't want the runtime pipeline to retry.
          await stampLLMFlag(entry);
        }
      }
    }

    if (entriesProcessed % 25 === 0 || entriesProcessed === entries.length) {
      const llmTail = RUN_LLM
        ? `  | llm-processed: ${llmEntriesProcessed}, llm-facts: ${llmFactsTotal}, llm-new: ${llmInserted}`
        : "";
      console.log(
        `  ${entriesProcessed}/${entries.length}  (with-facts: ${entriesWithFacts}, new: ${inserted}, dup: ${exists}, fail: ${failed})${llmTail}`,
      );
    }
  }

  console.log(`\nDone.`);
  console.log(`  entries scanned:       ${entriesProcessed}`);
  console.log(`  entries with facts:    ${entriesWithFacts}`);
  console.log(`  deterministic facts:   ${factsTotal}`);
  console.log(`    inserted:            ${inserted}`);
  console.log(`    already exist:       ${exists}`);
  console.log(`    failed:              ${failed}`);
  if (RUN_LLM) {
    console.log(`  llm pass:`);
    console.log(`    entries processed: ${llmEntriesProcessed}`);
    console.log(`    entries skipped:   ${llmEntriesSkipped}`);
    console.log(`    facts extracted:   ${llmFactsTotal}`);
    console.log(`    inserted:          ${llmInserted}`);
    console.log(`    already exist:     ${llmExists}`);
    console.log(`    failed:            ${llmFailed}`);
  }

  process.exit(failed + llmFailed > 0 ? 1 : 0);
}

void main();
