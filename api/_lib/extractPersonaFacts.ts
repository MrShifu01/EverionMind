// ─────────────────────────────────────────────────────────────────────────────
// extractPersonaFacts
//
// Single Gemini Flash call that reads one captured entry and returns ZERO or
// more durable, third-person facts about THE USER specifically. Most entries
// return [] — recipes, contact cards, work notes, one-off events, etc.
//
// Critical: the extractor is identity-aware. Before calling, the caller loads
// `loadExtractorContext(userId, brainId)` which fetches the user's name,
// pronouns, free-form context, and the facts they've already confirmed
// (manual / chat-tool / pinned). That context is injected into the prompt so
// the model can:
//   1. Distinguish facts about the USER from facts about other people whose
//      details happen to be in the same brain (a contact card for "Ruan,
//      shopfitter" must NOT become "User is a shopfitter").
//   2. Refuse to re-extract anything the user has already confirmed
//      (kills the duplicate-fact problem at the source).
//
// Each extracted fact becomes its own small `type='persona'` entry linked
// back to the source via `metadata.derived_from`. The source entry itself
// is never modified.
// ─────────────────────────────────────────────────────────────────────────────

import { sbHeaders } from "./sbHeaders.js";
import { callAI } from "./aiProvider.js";
import { resolveProviderForUser } from "./resolveProvider.js";

const SB_URL = (process.env.SUPABASE_URL || "").trim();

type PersonaBucket = "identity" | "family" | "habit" | "preference" | "event";

interface ExtractedFact {
  fact: string; // third-person, ≤200 chars
  bucket: PersonaBucket;
  confidence: number; // 0–1
  evidence?: string; // verbatim quote from the source (≤200 chars)
}

export interface ExtractorContext {
  userName: string; // preferred, falls back to full
  fullName: string; // formal full name
  pronouns: string;
  coreContext: string; // the free-form "About you" textarea
  confirmedFacts: string[]; // titles of manual / chat / pinned facts (capped)
  rejectedFacts: Array<{ title: string; reason: string | null }>; // recent N — concrete examples
  rejectedSummary: string | null; // LLM-distilled skip rules — bounded, long-term memory
}

const VALID_BUCKETS = new Set<PersonaBucket>([
  "identity",
  "family",
  "habit",
  "preference",
  "event",
]);
// Confidence floor — bumped from 0.7 to 0.85 because identity-bucket false
// positives ("User's name is Ruan") were the most damaging failure mode.
const MIN_FACT_CONFIDENCE = 0.85;
// Hard cap per entry. The hand-typed limit prevents runaway extraction on
// long journals / imports that mention many people in passing.
const MAX_FACTS_PER_ENTRY = 6;
// Cap for the "already confirmed" list — long enough to cover the average
// user's About You, short enough that it doesn't blow the prompt budget.
const MAX_CONFIRMED_IN_PROMPT = 50;
// Cap for SPECIFIC rejected facts — only the most recent few, kept for
// concreteness ("you literally rejected this last week"). The bulk of
// long-term learning lives in rejected_summary, an LLM-distilled set of
// 5-10 short skip rules that doesn't grow with rejection count.
const MAX_REJECTED_IN_PROMPT = 5;

// ── Prompt builder ──────────────────────────────────────────────────────────
//
// The user's identity is injected into the system prompt so every call has
// a definitive answer to "who is the user?". Without this, the model treats
// any "Person X is a Y" sentence in the entry as a candidate fact and
// rewrites it as "User is a Y" — which is exactly how a contact card for
// "Ruan, shopfitter" produced "User is a shopfitter" in the wild.

export function buildPrompt(ctx: ExtractorContext): string {
  const namePart = ctx.userName || ctx.fullName || "the user (no name set)";
  const aliasPart =
    ctx.userName && ctx.fullName && ctx.userName.toLowerCase() !== ctx.fullName.toLowerCase()
      ? ` (full name: ${ctx.fullName})`
      : "";
  const pronounPart = ctx.pronouns ? `\nPronouns: ${ctx.pronouns}` : "";

  // Core profile (free-form About You) — used as a stop-list, not just identity.
  // Without this, the extractor would happily reproduce "User runs X" from a
  // related entry even though the user already wrote "I run X" into their
  // About You.
  const coreProfileBlock = ctx.coreContext
    ? `\n\nUSER'S CORE PROFILE — anything stated or implied here is ALREADY KNOWN. NEVER extract a fact that overlaps with the content of this profile, even if rephrased:\n"""\n${ctx.coreContext.slice(0, 1000)}\n"""`
    : "";

  const confirmedBlock = ctx.confirmedFacts.length
    ? `\n\nFACTS THE USER HAS ALREADY CONFIRMED (NEVER re-extract any of these — even rephrased):\n${ctx.confirmedFacts
        .slice(0, MAX_CONFIRMED_IN_PROMPT)
        .map((f) => `  • ${f}`)
        .join("\n")}`
    : "";

  // Rejected patterns teach the model the user's personal definition of
  // "persona-worthy". Two parts:
  //   1. rejectedSummary — LLM-distilled rules. Bounded, generalizes well,
  //      doesn't grow with rejection count. Refreshed weekly.
  //   2. rejectedFacts (last 5) — concrete recent examples. Anchors the
  //      rules to literal, recent-memory cases the user just rejected.
  const rejectedSummaryBlock = ctx.rejectedSummary
    ? `\n\nREJECTED PATTERNS (rules the user has taught us — apply these as judgment, not as a literal stop-list):\n${ctx.rejectedSummary.slice(0, 1500)}`
    : "";

  const rejectedExamplesBlock = ctx.rejectedFacts.length
    ? `\n\nRECENT SPECIFIC REJECTIONS (the last few literal facts the user said are NOT them — never re-extract these or anything semantically similar):\n${ctx.rejectedFacts
        .slice(0, MAX_REJECTED_IN_PROMPT)
        .map(
          (r) => `  • "${r.title}"${r.reason ? ` — reason: "${r.reason.slice(0, 160)}"` : ""}`,
        )
        .join("\n")}`
    : "";

  const rejectedBlock = `${rejectedSummaryBlock}${rejectedExamplesBlock}`;

  return `You read a single captured entry and extract durable, third-person facts about WHO THE USER IS. Each extracted fact is injected into every future chat so the assistant "knows" the user without being told again.

THE USER:
Name: ${namePart}${aliasPart}${pronounPart}${coreProfileBlock}${confirmedBlock}${rejectedBlock}

ABSOLUTE RULES:
1. Only extract facts about THE USER named above — not about other people, not about the world.
2. If the entry is primarily about a DIFFERENT person (a contact card, a note about an employee, a friend's details, a supplier's record), return {"facts": []}. The presence of a name OTHER than the user's name is the strongest signal this is not about the user.
3. NEVER extract a fact that overlaps with the USER'S CORE PROFILE or with FACTS THE USER HAS ALREADY CONFIRMED — not even rephrased, not even a sub-fact, not even at higher specificity. If the entry only restates known info, return {"facts": []}.
4. NEVER extract a fact that matches the shape of any REJECTED PATTERN above. The user has personally defined what does and does not belong in their persona — respect that. If the entry resembles a rejected pattern in topic or framing, return {"facts": []} even if the surface words differ.
5. NEVER invent facts. If unsure, omit.
6. Each fact must be third person ("User…"), ≤200 characters, and durable (true today AND likely true in 3 months).

INCLUDE (only if clearly about THE USER):
- Identity / role: "User is a software engineer at Smash Burger"
- Family / pets: "User's wife is named Hannelie", "User has a dog named Max"
- Lasting preferences / aversions: "User doesn't eat mushrooms"
- Recurring habits: "User wakes at 5:30 every weekday"
- Notable life events: "User got married Oct 4 2025", "User moved to Pretoria in 2024"

EXCLUDE — return {"facts": []} for these:
- Entries about other people. Example entry "Ruan is a shopfitter, 16 Boschendal" → {"facts": []} (Ruan is not the user)
- Contact details for anyone other than the user. Example "Adriaan Stander, ID 5912…" → {"facts": []} (this is a contact)
- One-off events. "Met John for coffee at 3pm" → {"facts": []}
- Time-bound todos. "Pay rent next Friday" → {"facts": []}
- Reference material — recipes, bookmarks, work tasks → {"facts": []}
- World news, observations → {"facts": []}
- Anything you'd already find in the "WHAT THE USER HAS ALREADY CONFIRMED" list above → {"facts": []}

Confidence: only return facts you're ${MIN_FACT_CONFIDENCE * 100}%+ sure about. Below that threshold → omit.

Be RUTHLESS. Most entries return {"facts": []}. Better to miss a fact than to invent one or to mistake another person's details for the user's.

Return JSON only: {"facts": [ {"fact": string, "bucket": "identity"|"family"|"habit"|"preference"|"event", "confidence": 0.0-1.0, "evidence": string} ] }

If you do return facts, evidence is the verbatim quote from the entry that justifies the fact (≤200 chars).`;
}

// ── Context loader ──────────────────────────────────────────────────────────
//
// Pulled from user_personas (the singular core) plus active persona entries
// the user has confirmed (manual / chat-tool sources, or pinned). Auto-
// extracted facts (source='capture') are deliberately excluded — including
// them would amplify any prior hallucination by feeding it back to the model.

interface PersonaCoreRow {
  full_name: string | null;
  preferred_name: string | null;
  pronouns: string | null;
  context: string | null;
  enabled: boolean | null;
  rejected_summary: string | null;
}

interface PersonaEntryRow {
  title: string;
  metadata: Record<string, any> | null;
}

export async function loadExtractorContext(
  userId: string,
  brainId: string | null,
): Promise<ExtractorContext> {
  const empty: ExtractorContext = {
    userName: "",
    fullName: "",
    pronouns: "",
    coreContext: "",
    confirmedFacts: [],
    rejectedFacts: [],
    rejectedSummary: null,
  };
  if (!SB_URL || !userId) return empty;

  // Core (singular fields).
  let core: PersonaCoreRow | undefined;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/user_personas?user_id=eq.${encodeURIComponent(userId)}&select=full_name,preferred_name,pronouns,context,enabled,rejected_summary&limit=1`,
      { headers: sbHeaders() },
    );
    if (r.ok) {
      const rows = (await r.json()) as PersonaCoreRow[];
      core = rows[0];
    }
  } catch {
    /* empty core is fine */
  }

  // Confirmed facts: manual, chat-tool, or pinned. Capped server-side at 200
  // for safety; we cap further in the prompt.
  let confirmedFacts: string[] = [];
  let rejectedFacts: Array<{ title: string; reason: string | null }> = [];
  if (brainId) {
    try {
      // Single round-trip pulls everything we need: active confirmed-source
      // facts AND rejected ones. Caller-side filter below splits them.
      const r = await fetch(
        `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&brain_id=eq.${encodeURIComponent(brainId)}&type=eq.persona&deleted_at=is.null&select=title,metadata,updated_at&order=updated_at.desc&limit=300`,
        { headers: sbHeaders() },
      );
      if (r.ok) {
        const rows = (await r.json()) as PersonaEntryRow[];
        confirmedFacts = rows
          .filter((row) => {
            const meta = row.metadata ?? {};
            if (String(meta.status || "") !== "active") return false;
            const src = String(meta.source || "");
            // User-confirmed = manual settings entry, chat tool, or explicitly pinned.
            return (
              src === "manual" ||
              src === "chat" ||
              meta.pinned === true ||
              meta.skip_persona === true
            );
          })
          .map((row) => row.title?.trim())
          .filter((t): t is string => typeof t === "string" && t.length > 0)
          .slice(0, MAX_CONFIRMED_IN_PROMPT);
        rejectedFacts = rows
          .filter((row) => String(row.metadata?.status || "") === "rejected")
          .map((row) => ({
            title: (row.title || "").trim(),
            reason:
              typeof row.metadata?.rejected_reason === "string"
                ? row.metadata.rejected_reason.trim() || null
                : null,
          }))
          .filter((r) => r.title.length > 0)
          .slice(0, MAX_REJECTED_IN_PROMPT);
      }
    } catch {
      /* fall through */
    }
  }

  return {
    userName: (core?.preferred_name || "").trim(),
    fullName: (core?.full_name || "").trim(),
    pronouns: (core?.pronouns || "").trim(),
    coreContext: (core?.context || "").trim(),
    confirmedFacts,
    rejectedFacts,
    rejectedSummary: (core?.rejected_summary || "").trim() || null,
  };
}

// ── Parser ──────────────────────────────────────────────────────────────────

function tryParse(text: string): ExtractedFact[] {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  const arr: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.facts)
      ? parsed.facts
      : [];
  const out: ExtractedFact[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const fact = typeof item.fact === "string" ? item.fact.trim().slice(0, 200) : "";
    if (!fact) continue;
    const bucket = item.bucket as PersonaBucket;
    if (!VALID_BUCKETS.has(bucket)) continue;
    const confidence =
      typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1
        ? item.confidence
        : 0;
    if (confidence < MIN_FACT_CONFIDENCE) continue;
    const evidence =
      typeof item.evidence === "string" ? item.evidence.trim().slice(0, 200) : undefined;
    out.push({ fact, bucket, confidence, evidence });
    if (out.length >= MAX_FACTS_PER_ENTRY) break;
  }
  return out;
}

// ── Public ──────────────────────────────────────────────────────────────────

export async function extractPersonaFacts(args: {
  title: string;
  content: string;
  type: string;
  tags?: string[];
  context: ExtractorContext;
  userId: string;
}): Promise<ExtractedFact[]> {
  // Sanity guard — never extract from a persona entry itself.
  if (args.type === "persona" || args.type === "secret") return [];
  // (Per design: NO category skip list — let the prompt do the filtering.)

  const cfg = await resolveProviderForUser(args.userId);
  if (!cfg) return [];

  const tagHint = args.tags?.length ? `\nTags: ${args.tags.slice(0, 8).join(", ")}` : "";
  const userBlock = [
    `Type: ${args.type || "note"}`,
    `Title: ${(args.title || "").slice(0, 200)}`,
    `Content: ${(args.content || "").slice(0, 1500)}`,
    tagHint,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const text = await callAI(cfg, buildPrompt(args.context), userBlock, {
      maxTokens: 800,
      json: true,
    });
    return tryParse(text);
  } catch {
    return [];
  }
}
