// ─────────────────────────────────────────────────────────────────────────────
// classifyPersona
//
// Single Gemini Flash call that decides whether an entry is durable, first-
// person personal context (worthy of being injected into every chat) or just
// a regular note/todo/event. Runs once per entry inside the enrichment
// pipeline; ~50 tokens out, sub-second latency.
//
// Conservative by design — we'd rather miss a borderline persona fact than
// pollute the system prompt with a one-off observation. The user can demote
// false positives or manually promote false negatives in the About You tab.
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GEMINI_MODEL = (process.env.GEMINI_PERSONA_CLASSIFIER_MODEL || "gemini-2.5-flash-lite").trim();

export type PersonaBucket = "identity" | "family" | "habit" | "preference" | "event";

export interface PersonaClassification {
  persona: boolean;
  bucket: PersonaBucket | null;
  confidence: number; // 0–1
  reason?: string;
}

const PROMPT = `You decide whether a captured entry is a durable, first-person fact about who the user is — their identity, family, lasting preferences, recurring habits, or notable life events. Such facts get injected into every future chat so the assistant "knows" the user without being told again.

Return JSON only: {"persona": boolean, "bucket": "identity"|"family"|"habit"|"preference"|"event"|null, "confidence": 0.0-1.0, "reason": string}

INCLUDE (persona = true):
- Family / pets / close people: "My wife Hannelie's birthday is Aug 14"
- Identity / role: "I am a software engineer at Smash Burger"
- Lasting preferences / aversions: "I don't eat mushrooms", "I drink only black coffee"
- Recurring habits: "I wake at 5:30 every day", "I never schedule meetings before 10am"
- Notable life events worth remembering long-term: "Got married Oct 4 2025", "Moved to Pretoria 2024"

EXCLUDE (persona = false):
- One-off events: "Gym session was tough today"
- Time-bound todos / deadlines: "Pay rent next Friday"
- Observations about the world: "Apple announced a new iPhone"
- Work tasks / project notes: "Need to fix bug in login flow"
- Recipes, documents, links — these are reference material, not personal context
- Anything ambiguous — when unsure, return persona=false

Confidence: 0.9+ for clear-cut cases, 0.7-0.9 for likely, below 0.7 for hesitant. Anything below 0.6 should already be persona=false.

Be ruthless. Most entries are NOT persona facts.`;

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

function tryParse(text: string): PersonaClassification | null {
  // Strip markdown fences if the model added them anyway.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const persona = parsed.persona === true;
  const bucket =
    persona && typeof parsed.bucket === "string" &&
    ["identity", "family", "habit", "preference", "event"].includes(parsed.bucket)
      ? (parsed.bucket as PersonaBucket)
      : null;
  const confidence =
    typeof parsed.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1
      ? parsed.confidence
      : 0;
  const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 160) : undefined;
  return { persona, bucket, confidence, reason };
}

export async function classifyPersona(args: {
  title: string;
  content: string;
  type: string;
  /** Existing tags — useful signal: things explicitly tagged #me / #personal lean persona */
  tags?: string[];
}): Promise<PersonaClassification | null> {
  // Skip obvious non-persona types up front — saves an LLM call.
  const skipTypes = new Set([
    "secret", "todo", "task", "reminder", "event", "document", "recipe",
    "finance", "place", "decision", "persona", // already classified
  ]);
  if (skipTypes.has(args.type)) return null;

  if (!GEMINI_API_KEY) return null;

  const tagHint = args.tags?.length
    ? `\nTags: ${args.tags.slice(0, 8).join(", ")}`
    : "";
  const userBlock = [
    `Title: ${(args.title || "").slice(0, 200)}`,
    `Content: ${(args.content || "").slice(0, 800)}`,
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
            maxOutputTokens: 200,
          },
        }),
      },
    );
    if (!r.ok) return null;
    const data: GeminiResponse = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return tryParse(text);
  } catch {
    return null;
  }
}
