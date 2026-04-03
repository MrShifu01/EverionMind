/**
 * callAI — unified AI call that routes to the right endpoint based on
 * the user's configured provider (anthropic | openai | openrouter).
 *
 * Usage:
 *   import { callAI } from "../lib/ai";
 *   const res = await callAI({ messages, system, max_tokens: 600 });
 *   const data = await res.json();
 *   const text = data.content?.[0]?.text;
 *
 * All three endpoints normalize their response to Anthropic shape:
 *   { content: [{ type: "text", text: "..." }] }
 */
import { authFetch } from "./authFetch";
import {
  getUserProvider,
  getUserModel,
  getUserApiKey,
  getOpenRouterKey,
  getOpenRouterModel,
} from "./aiFetch";

const ENDPOINT = {
  anthropic:   "/api/anthropic",
  openai:      "/api/openai",
  openrouter:  "/api/openrouter",
};

export async function callAI({ messages, system, max_tokens, memoryGuide } = {}) {
  const provider = getUserProvider();
  const endpoint = ENDPOINT[provider] ?? ENDPOINT.anthropic;

  // Pick model based on provider
  let model;
  if (provider === "openrouter") {
    model = getOpenRouterModel() || "google/gemini-2.0-flash-exp:free";
  } else {
    model = getUserModel();
  }

  // Pick key based on provider
  let userKey;
  if (provider === "openrouter") {
    userKey = getOpenRouterKey();
  } else {
    userKey = getUserApiKey();
  }

  // Inject memory guide into system prompt if provided
  const fullSystem = memoryGuide
    ? `[Classification Guide]\n${memoryGuide}\n\n[Task]\n${system || ""}`
    : system;

  const headers = {
    "Content-Type": "application/json",
    ...(userKey ? { "X-User-Api-Key": userKey } : {}),
  };

  return authFetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      system: fullSystem,
      max_tokens,
    }),
  });
}
