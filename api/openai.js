import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

const ALLOWED_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1",
];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 40))) return res.status(429).json({ error: "Too many requests" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const userKey = (req.headers["x-user-api-key"] || "").trim();
  if (!userKey) return res.status(400).json({ error: "X-User-Api-Key header required for OpenAI calls" });

  const { model, messages, max_tokens, system } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }
  if (messages.length > 50) {
    return res.status(400).json({ error: "Too many messages" });
  }
  if (max_tokens !== undefined && (typeof max_tokens !== "number" || max_tokens < 1 || max_tokens > 4096)) {
    return res.status(400).json({ error: "Invalid max_tokens" });
  }

  const safeModel = ALLOWED_MODELS.includes(model) ? model : ALLOWED_MODELS[0];

  // Convert Anthropic-style system param to OpenAI messages format
  const oaiMessages = system
    ? [{ role: "system", content: system.slice(0, 10000) }, ...messages]
    : messages;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${userKey}`,
    },
    body: JSON.stringify({
      model: safeModel,
      max_tokens: max_tokens || 1000,
      messages: oaiMessages,
    }),
  });

  const data = await response.json();

  // Normalize OpenAI response to Anthropic shape so the frontend doesn't need to know the difference
  if (response.ok && data.choices?.[0]?.message?.content) {
    return res.status(200).json({
      content: [{ type: "text", text: data.choices[0].message.content }],
      model: safeModel,
    });
  }

  res.status(response.status).json(data);
}
