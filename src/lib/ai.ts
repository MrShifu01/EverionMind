import { authFetch } from "./authFetch";
import { buildSystemPrompt } from "./systemPromptBuilder";
import { recordUsage, extractTokenUsage } from "./usageTracker";

interface AIMessage {
  role: string;
  content: string | AIContentBlock[];
}

interface AIContentBlock {
  type: string;
  text?: string;
  source?: { type: string; media_type: string; data: string };
  image_url?: { url: string };
}

interface CallAIOptions {
  messages?: AIMessage[];
  system?: string;
  max_tokens?: number;
  memoryGuide?: string;
  task?: string;
  /** When provided, auto-injects user learnings into the system prompt */
  brainId?: string;
}

export async function callAI({
  messages = [],
  system,
  max_tokens,
  memoryGuide,
  brainId,
}: CallAIOptions = {}): Promise<Response> {
  // Always use server-side Gemini — no user key sent so server routes to GEMINI_API_KEY
  const endpoint = `/api/llm?provider=google`;
  const model = "gemini-2.5-flash-lite";

  const fullSystem = buildSystemPrompt({ base: system, memoryGuide, brainId, withLearnings: true }) || undefined;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const ATTEMPT_TIMEOUT_MS = 25000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await authFetch(endpoint, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        system: fullSystem,
        max_tokens,
      }),
    });
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError") {
      return new Response(
        JSON.stringify({ error: "Request timed out. Check your connection or try again." }),
        { status: 504, headers: { "Content-Type": "application/json" } },
      );
    }
    throw err;
  }
  clearTimeout(timer);

  if (res.ok) {
    res
      .clone()
      .json()
      .then((body) => {
        const { inputTokens, outputTokens } = extractTokenUsage(body);
        if (inputTokens > 0 || outputTokens > 0) {
          recordUsage({
            date: new Date().toISOString().slice(0, 10),
            type: "llm",
            inputTokens,
            outputTokens,
            provider: "google",
            model,
          });
        }
      })
      .catch((err) => console.error("[ai] recordUsage (llm) failed", err));
  }

  return res!;
}
