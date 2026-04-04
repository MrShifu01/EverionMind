import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 40))) return res.status(429).json({ error: "Too many requests" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const userKey = (req.headers["x-user-api-key"] || "").trim();
  if (!userKey) return res.status(400).json({ error: "X-User-Api-Key header required for OpenRouter calls" });

  const { model, messages, max_tokens, system } = req.body;

  const ALLOWED_MODELS = [
    "google/gemini-2.0-flash-exp:free",
    "anthropic/claude-3.5-haiku",
    "anthropic/claude-sonnet-4-5",
    "openai/gpt-4o-mini",
    "openai/gpt-4o",
    "meta-llama/llama-3.1-70b-instruct",
  ];
  if (model && !ALLOWED_MODELS.includes(model)) {
    return res.status(400).json({ error: "Model not allowed" });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }
  if (messages.length > 50) {
    return res.status(400).json({ error: "Too many messages" });
  }
  if (max_tokens !== undefined && (typeof max_tokens !== "number" || max_tokens < 1 || max_tokens > 4096)) {
    return res.status(400).json({ error: "Invalid max_tokens" });
  }

  // OpenRouter uses OpenAI-compatible format — system param becomes first message
  const orMessages = system
    ? [{ role: "system", content: system.slice(0, 10000) }, ...messages]
    : messages;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${userKey}`,
      "HTTP-Referer": "https://openbrain.app",
      "X-Title": "OpenBrain",
    },
    body: JSON.stringify({
      model: model || "google/gemini-2.0-flash-exp:free",
      max_tokens: max_tokens || 1000,
      messages: orMessages,
      route: "fallback",
    }),
  });

  const data = await response.json();

  // Normalize to Anthropic shape so the frontend doesn't need to know the difference
  if (response.ok && data.choices?.[0]?.message?.content) {
    return res.status(200).json({
      content: [{ type: "text", text: data.choices[0].message.content }],
      model: data.model || model,
    });
  }

  res.status(response.status).json(data);
}
