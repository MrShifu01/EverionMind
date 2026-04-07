import { authFetch } from "./authFetch";
import {
  getUserProvider,
  getUserModel,
  getUserApiKey,
  getOpenRouterKey,
  getOpenRouterModel,
  getModelForTask,
} from "./aiFetch";
import { getLearningsContext } from "./learningEngine";

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

const ENDPOINT: Record<string, string> = {
  anthropic: "/api/anthropic",
  openai: "/api/openai",
  openrouter: "/api/openrouter",
};

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
  const endpoint = ENDPOINT[provider] ?? ENDPOINT.anthropic;

  let model: string;
  if (provider === "openrouter") {
    model =
      (task ? getModelForTask(task) : null) ||
      getOpenRouterModel() ||
      "google/gemini-2.0-flash-exp:free";
  } else {
    model = getUserModel();
  }

  let userKey: string | null;
  if (provider === "openrouter") {
    userKey = getOpenRouterKey();
  } else {
    userKey = getUserApiKey();
  }

  // Build system prompt: base → memory guide → user learnings
  let fullSystem = system || "";
  if (memoryGuide) {
    fullSystem = `[Classification Guide]\n${memoryGuide}\n\n[Task]\n${fullSystem}`;
  }
  if (brainId) {
    const learnings = getLearningsContext(brainId);
    if (learnings) {
      fullSystem = `${fullSystem}\n\n--- USER LEARNING CONTEXT ---\nThis user's past decisions reveal preferences. Adapt your output accordingly:\n${learnings}\n--- END LEARNING CONTEXT ---`;
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(userKey ? { "X-User-Api-Key": userKey } : {}),
  };

  return authFetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: normalizeMessages(messages, provider),
      system: fullSystem,
      max_tokens,
    }),
  });
}
