import { authFetch } from "./authFetch";
import {
  getUserProvider,
  getUserModel,
  getUserApiKey,
  getOpenRouterKey,
  getOpenRouterModel,
  getModelForTask,
  getSimpleMode,
  SIMPLE_AI_MODEL,
  SIMPLE_VOICE_MODEL,
} from "./aiSettings";
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

export interface CallAIOptions {
  messages?: AIMessage[];
  system?: string;
  max_tokens?: number;
  memoryGuide?: string;
  task?: string;
  /** When provided, auto-injects user learnings into the system prompt */
  brainId?: string;
}

const SUPPORTED_PROVIDERS = ["anthropic", "openai", "openrouter"] as const;

function normalizeMessages(messages: AIMessage[], provider: string): AIMessage[] {
  if (provider === "anthropic") return messages;
  return messages.map((msg) => {
    if (!Array.isArray(msg.content)) return msg;
    return {
      ...msg,
      content: msg.content.map((block) => {
        if (block.type === "image" && block.source?.type === "base64") {
          return {
            type: "image_url",
            image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
          };
        }
        return block;
      }),
    };
  });
}

export async function callAI({
  messages = [],
  system,
  max_tokens,
  memoryGuide,
  task,
  brainId,
}: CallAIOptions = {}): Promise<Response> {
  const provider = getUserProvider();
  const safeProvider = (SUPPORTED_PROVIDERS as readonly string[]).includes(provider)
    ? provider
    : "anthropic";
  const endpoint = `/api/llm?provider=${safeProvider}`;

  let model: string;
  if (safeProvider === "openrouter") {
    if (getSimpleMode()) {
      // Simple mode: capture task uses voice model, everything else uses AI model
      model = task === "capture" ? SIMPLE_VOICE_MODEL : SIMPLE_AI_MODEL;
    } else {
      model =
        (task ? getModelForTask(task) : null) ||
        getOpenRouterModel() ||
        SIMPLE_AI_MODEL;
    }
  } else {
    model = getUserModel();
  }

  let userKey: string | null;
  if (safeProvider === "openrouter") {
    userKey = getOpenRouterKey();
  } else {
    userKey = getUserApiKey();
  }

  // Short-circuit: server requires X-User-Api-Key for all BYO providers.
  // Without a key we'd get a 400; return a clear 401 instead.
  if (!userKey) {
    return new Response(
      JSON.stringify({ error: "No API key configured. Add your key in Settings → Intelligence." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const fullSystem = buildSystemPrompt({ base: system, memoryGuide, brainId }) || undefined;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-User-Api-Key": userKey,
  };

  const res = await authFetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: normalizeMessages(messages, safeProvider),
      system: fullSystem,
      max_tokens,
    }),
  });

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
            provider: safeProvider,
            model,
          });
        }
      })
      .catch((err) => console.error("[ai] recordUsage (llm) failed", err));
  }

  return res;
}
