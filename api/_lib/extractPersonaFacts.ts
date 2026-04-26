// ─────────────────────────────────────────────────────────────────────────────
// extractPersonaFacts
//
// Single Gemini Flash call that reads one captured entry and pulls out ZERO
// or more short, third-person, durable facts about the user. Most entries
// return [] — a recipe, a meeting note, a contact card aren't persona facts.
//
// Each returned fact becomes its own small `type='persona'` entry linked back
// to the source via `metadata.derived_from`. The source entry itself is
// never modified — that's the whole point of this rewrite.
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GEMINI_MODEL = (process.env.GEMINI_PERSONA_EXTRACTOR_MODEL || "gemini-2.5-flash-lite").trim();

export type PersonaBucket = "identity" | "family" | "habit" | "preference" | "event";

export interface ExtractedFact {
  fact: string;          // third-person, ≤200 chars
  bucket: PersonaBucket;
  confidence: number;    // 0–1
  evidence?: string;     // the user's own words (≤200 chars), if useful
}

const PROMPT = `You read a single captured entry from someone's personal knowledge base and extract durable, first-person facts about WHO THE USER IS — their identity, family, lasting preferences, recurring habits, or notable life events. Each fact gets injected into every future chat so the assistant "knows" the user without being told again.

Return JSON only: {"facts": [ {"fact": string, "bucket": "identity"|"family"|"habit"|"preference"|"event", "confidence": 0.0-1.0, "evidence": string} ] }

Each fact MUST be:
- About the USER specifically (not the world, not other people unless they're family/close)
- Written in third person, starting with "User…" — e.g. "User wakes at 5:30 every weekday"
- Short — ≤200 characters
- Durable — true today AND likely true in 3 months

INCLUDE:
- Identity / role: "User is a software engineer at Smash Burger"
- Family / pets / close people: "User's wife is named Hannelie", "User has a dog named Max"
- Lasting preferences / aversions: "User doesn't eat mushrooms", "User drinks only black coffee"
- Recurring habits: "User wakes at 5:30 every weekday", "User never schedules meetings before 10am"
- Notable life events worth remembering long-term: "User got married Oct 4 2025", "User moved to Pretoria in 2024"

EXCLUDE — return [] for these. Most entries fall into this bucket.
- One-off events: "Gym session was tough today" → []
- Time-bound todos: "Pay rent next Friday" → []
- Reference material: contact cards (electrician, plumber), recipes, bookmarks, documents — all []
- Observations about the world: "Apple announced a new iPhone" → []
- Work tasks / project notes: "Need to fix bug in login flow" → []
- Anything ambiguous — when unsure, omit it

Confidence: 0.9+ for clear-cut, 0.7-0.9 for likely, below 0.7 → omit.

Be RUTHLESS. An entry with no persona facts returns {"facts": []}. Most entries return []. Better to miss a fact than invent one.

If you do return facts, evidence is the user's own words from the entry that justify the fact (verbatim quote ≤200 chars). Helps trace lineage.`;

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

const VALID_BUCKETS = new Set<PersonaBucket>(["identity", "family", "habit", "preference", "event"]);
const SKIP_TYPES = new Set([
  "secret", "todo", "task", "reminder", "event", "document", "recipe",
  "finance", "place", "decision", "persona", // already classified
]);

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
  const arr: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.facts) ? parsed.facts : [];
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
    if (confidence < 0.7) continue;
    const evidence = typeof item.evidence === "string" ? item.evidence.trim().slice(0, 200) : undefined;
    out.push({ fact, bucket, confidence, evidence });
    if (out.length >= 6) break; // hard cap per entry — prevents runaway extraction
  }
  return out;
}

export async function extractPersonaFacts(args: {
  title: string;
  content: string;
  type: string;
  tags?: string[];
}): Promise<ExtractedFact[]> {
  if (SKIP_TYPES.has(args.type)) return [];
  if (!GEMINI_API_KEY) return [];

  const tagHint = args.tags?.length ? `\nTags: ${args.tags.slice(0, 8).join(", ")}` : "";
  const userBlock = [
    `Title: ${(args.title || "").slice(0, 200)}`,
    `Content: ${(args.content || "").slice(0, 1500)}`,
    tagHint,
  ].filter(Boolean).join("\n");

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userBlock }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            maxOutputTokens: 800,
          },
        }),
      },
    );
    if (!r.ok) return [];
    const data: GeminiResponse = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return tryParse(text);
  } catch {
    return [];
  }
}
