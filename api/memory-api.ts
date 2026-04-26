/**
 * POST /api/memory/retrieve  → semantic retrieval over user's brain
 * GET  /api/memory/upcoming  → entries with upcoming dates
 *
 * Routed via vercel.json rewrites:
 *   /api/memory/retrieve → /api/memory-api?action=retrieve
 *   /api/memory/upcoming → /api/memory-api?action=upcoming
 *
 * Auth: Authorization: Bearer <em_key>  OR  Authorization: Bearer <supabase_jwt>
 */
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { resolveApiKey } from "./_lib/resolveApiKey.js";
import { retrieveEntries } from "./_lib/retrievalCore.js";
import { getUpcomingEntries } from "./_lib/getUpcoming.js";
import { checkAndIncrement } from "./_lib/usage.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SB_HEADERS = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();

async function resolveUser(req: ApiRequest): Promise<{ userId: string; brainId: string } | null> {
  const authHeader = (req.headers.authorization as string) || "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (rawKey.startsWith("em_")) {
    const result = await resolveApiKey(rawKey);
    return result ? { userId: result.userId, brainId: result.brainId } : null;
  }

  const user = await verifyAuth(req);
  if (!user) return null;

  const brainRes = await fetch(
    `${SB_URL}/rest/v1/brains?owner_id=eq.${encodeURIComponent(user.id)}&select=id&limit=1`,
    { headers: SB_HEADERS },
  );
  if (!brainRes.ok) return null;
  const brains: any[] = await brainRes.json();
  if (!brains.length) return null;
  return { userId: user.id, brainId: brains[0].id };
}

async function handleRetrieve(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 20))) return res.status(429).json({ error: "Too many requests" });
  if (!GEMINI_API_KEY) return res.status(500).json({ error: "AI not configured" });

  const auth = await resolveUser(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const { query, limit } = req.body || {};
  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "query required" });
  }

  // Gate embedding cost against user quota
  const settingsRes = await fetch(
    `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(auth.userId)}&select=plan,anthropic_key,openai_key,gemini_key&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
  );
  const [settings] = settingsRes.ok ? await settingsRes.json() : [null];
  const plan = settings?.plan ?? "free";
  const hasByok = !!(settings?.anthropic_key || settings?.openai_key || settings?.gemini_key);
  let quota: Awaited<ReturnType<typeof checkAndIncrement>>;
  try {
    quota = await checkAndIncrement(auth.userId, "chats", plan, hasByok);
  } catch {
    return res.status(503).json({ error: "Quota service unavailable" });
  }
  if (!quota.allowed) {
    return res.status(429).json({ error: "Monthly retrieval limit reached" });
  }

  const safeLimit = Math.min(Math.max(1, parseInt(String(limit)) || 15), 50);
  try {
    const entries = await retrieveEntries(query.trim(), auth.brainId, GEMINI_API_KEY, safeLimit);
    return res.status(200).json({ entries });
  } catch (e: any) {
    return res.status(502).json({ error: e.message });
  }
}

async function handleUpcoming(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });

  const auth = await resolveUser(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const query = req.query as Record<string, string>;
  const days = parseInt(query.days) || 30;
  const result = await getUpcomingEntries(auth.brainId, days);
  return res.status(200).json(result);
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  const action = (req.query.action as string) ?? "";
  if (action === "retrieve") return handleRetrieve(req, res);
  if (action === "upcoming") return handleUpcoming(req, res);
  return res.status(400).json({ error: "action must be retrieve or upcoming" });
}
