import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

// SEC-17: API Key Rotation Policy
// Rotate ANTHROPIC_API_KEY every 90 days. Last rotation: 2026-04-03
// Set up usage alerts in Anthropic console to catch unexpected spend.
// Key is stored in Vercel environment variables (never in code).

const ALLOWED_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 40))) return res.status(429).json({ error: "Too many requests" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

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
  const safeBody = {
    model: safeModel,
    max_tokens: max_tokens || 1000,
    messages,
  };
  if (system && typeof system === "string") safeBody.system = system.slice(0, 10000);

  // SEC-2: x-user-api-key is mandatory. No fallback to server key allowed.
  const apiKey = (req.headers["x-user-api-key"] || "").trim();
  if (!apiKey) return res.status(400).json({ error: "x-user-api-key header is required" });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(safeBody),
  });

  const data = await response.json();
  res.status(response.status).json(data);
}
