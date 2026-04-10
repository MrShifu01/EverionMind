/**
 * POST /api/search — Semantic search using pgvector cosine similarity.
 *   Returns { results, fallback: false } when embedding succeeds,
 *   or { fallback: true } when no embed key / empty query / RPC error.
 * GET  /api/search?brain_id=...&threshold=0.4 — Embedding similarity graph links.
 */
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { generateEmbedding } from "./_lib/generateEmbedding.js";
import { checkBrainAccess } from "./_lib/checkBrainAccess.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const THRESHOLD = parseFloat(process.env.SEARCH_THRESHOLD ?? "0.3");
const hdrs = (): Record<string, string> => ({ "Content-Type": "application/json", "apikey": SB_KEY!, "Authorization": `Bearer ${SB_KEY}` });

// S4-4: 5-minute in-memory cache for semantic search (per brain per query)
const _cache = new Map<string, { r: unknown; ts: number }>();
const _TTL = 5 * 60 * 1000;
function _getCached(k: string) { const e = _cache.get(k); return e && Date.now() - e.ts < _TTL ? e.r : null; }
function _setCache(k: string, r: unknown) { _cache.set(k, { r, ts: Date.now() }); }

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (req.method === "GET") return handleGraph(req, res);
  if (req.method === "POST") return handleSearch(req, res);
  return res.status(405).json({ error: "Method not allowed" });
}

// ── GET /api/search?brain_id=...&threshold=0.4 — similarity graph ──
async function handleGraph(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 10))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const brain_id = req.query.brain_id as string | undefined;
  if (!brain_id) return res.status(400).json({ error: "brain_id required" });

  const access = await checkBrainAccess(user.id, brain_id);
  if (!access) return res.status(403).json({ error: "Forbidden" });

  const threshold = parseFloat(req.query.threshold as string) || 0.4;

  // Check how many entries have embeddings
  const countRes = await fetch(
    `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain_id)}&embedding=not.is.null&select=id`,
    { headers: { ...hdrs(), "Prefer": "count=exact" } }
  );
  const embeddedCount = parseInt(countRes.headers.get("content-range")?.split("/")?.[1] || "0", 10);

  if (embeddedCount < 2) {
    return res.status(200).json({ links: [], embedded: embeddedCount, message: "Need at least 2 embedded entries" });
  }

  const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/build_similarity_graph`, {
    method: "POST",
    headers: hdrs(),
    body: JSON.stringify({ p_brain_id: brain_id, p_threshold: threshold }),
  });

  if (!rpcRes.ok) {
    const err = await rpcRes.text().catch(() => String(rpcRes.status));
    console.error("[graph:rpc]", err);
    return res.status(502).json({ error: `Graph RPC failed: ${err.slice(0, 200)}` });
  }

  const links: any[] = await rpcRes.json();
  return res.status(200).json({ links, embedded: embeddedCount });
}

// ── POST /api/search — semantic search ──
async function handleSearch(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 20))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { query, brain_id, limit = 20 } = req.body || {};

  // Empty / missing query → graceful fallback (client handles keyword search)
  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(200).json({ fallback: true });
  }
  if (query.length > 500) return res.status(400).json({ error: "Query too long" });

  const embedProvider = ((req.headers["x-embed-provider"] as string) || "google").toLowerCase();
  const embedKey = ((req.headers["x-embed-key"] as string) || "").trim() ||
    (embedProvider === "google" ? (process.env.GEMINI_API_KEY || "").trim() : "");

  // No embed key → graceful fallback
  if (!embedKey) return res.status(200).json({ fallback: true });

  const matchCount = Math.min(Number(limit) || 20, 50);

  // S4-4: check cache
  const cacheKey = `${brain_id}:${query.trim().toLowerCase()}`;
  const cached = _getCached(cacheKey);
  if (cached) return res.status(200).json(cached);

  try {
    const embedModel = ((req.headers["x-embed-model"] as string) || "").trim() || undefined;
    const embedding = await generateEmbedding(
      query.trim(),
      embedProvider as "openai" | "google" | "openrouter",
      embedKey,
      embedModel,
    );

    const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/match_entries`, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify({
        query_embedding: `[${embedding.join(",")}]`,
        p_brain_id: brain_id,
        match_count: matchCount,
      }),
    });

    if (!rpcRes.ok) return res.status(200).json({ fallback: true });

    const rows: any[] = await rpcRes.json();
    const results = rows.filter((r) => (r.similarity ?? 0) >= THRESHOLD);
    const payload = { results, fallback: false };
    _setCache(cacheKey, payload);
    res.setHeader("X-Embedding-Usage", JSON.stringify({
      provider: embedProvider,
      model: embedProvider === "google" ? "text-embedding-004" : "text-embedding-3-small",
      count: 1,
    }));
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json({ fallback: true });
  }
}
