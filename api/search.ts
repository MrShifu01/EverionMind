/**
 * POST /api/search — Semantic search using pgvector cosine similarity.
 *   Returns { results, fallback: false } when embedding succeeds,
 *   or { fallback: true } when no embed key / empty query / RPC error.
 * GET  /api/search?brain_id=...&threshold=0.4 — Embedding similarity graph links.
 */
import { withAuth, requireBrainAccess, ApiError, type HandlerContext } from "./_lib/withAuth.js";
import { generateEmbedding } from "./_lib/generateEmbedding.js";
import { sbHeaders } from "./_lib/sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL;
const THRESHOLD = parseFloat(process.env.SEARCH_THRESHOLD ?? "0.3");

// 5-minute in-memory cache for semantic search (per brain per query)
const _cache = new Map<string, { r: unknown; ts: number }>();
const _TTL = 5 * 60 * 1000;
function _getCached(k: string): unknown | null {
  const e = _cache.get(k);
  return e && Date.now() - e.ts < _TTL ? e.r : null;
}
function _setCache(k: string, r: unknown): void { _cache.set(k, { r, ts: Date.now() }); }

export default withAuth(
  {
    methods: ["GET", "POST"],
    rateLimit: (req) => (req.method === "GET" ? 10 : 20),
    cacheControl: "private, max-age=60",
  },
  async (ctx) => {
    if (ctx.req.method === "GET") return handleGraph(ctx);
    return handleSearch(ctx);
  },
);

// ── GET /api/search?brain_id=...&threshold=0.4 — similarity graph ──
async function handleGraph({ req, res, user }: HandlerContext): Promise<void> {
  const brain_id = req.query.brain_id as string | undefined;
  await requireBrainAccess(user.id, brain_id);

  const threshold = parseFloat(req.query.threshold as string) || 0.4;

  const countRes = await fetch(
    `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain_id!)}&embedding=not.is.null&type=neq.secret&select=id`,
    { headers: { ...sbHeaders(), "Prefer": "count=exact" } },
  );
  const embeddedCount = parseInt(countRes.headers.get("content-range")?.split("/")?.[1] || "0", 10);

  if (embeddedCount < 2) {
    res.status(200).json({ links: [], embedded: embeddedCount, message: "Need at least 2 embedded entries" });
    return;
  }

  const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/build_similarity_graph`, {
    method: "POST",
    headers: sbHeaders(),
    body: JSON.stringify({ p_brain_id: brain_id, p_threshold: threshold }),
  });

  if (!rpcRes.ok) {
    const err = await rpcRes.text().catch(() => String(rpcRes.status));
    console.error("[graph:rpc]", err);
    throw new ApiError(502, `Graph RPC failed: ${err.slice(0, 200)}`);
  }

  const links: any[] = await rpcRes.json();
  res.status(200).json({ links, embedded: embeddedCount });
}

// ── POST /api/search — semantic search ──
async function handleSearch({ req, res }: HandlerContext): Promise<void> {
  const { query, brain_id, limit = 20 } = req.body || {};

  if (!query || typeof query !== "string" || !query.trim()) {
    res.status(200).json({ fallback: true });
    return;
  }
  if (query.length > 500) throw new ApiError(400, "Query too long");

  const embedKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!embedKey) {
    res.status(200).json({ fallback: true });
    return;
  }

  const matchCount = Math.min(Number(limit) || 20, 50);
  const cacheKey = `${brain_id}:${query.trim().toLowerCase()}`;
  const cached = _getCached(cacheKey);
  if (cached) {
    res.status(200).json(cached);
    return;
  }

  try {
    const embedding = await generateEmbedding(query.trim(), embedKey);
    const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/match_entries`, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify({
        query_embedding: `[${embedding.join(",")}]`,
        p_brain_id: brain_id,
        match_count: matchCount,
      }),
    });

    if (!rpcRes.ok) {
      res.status(200).json({ fallback: true });
      return;
    }

    const rows: any[] = await rpcRes.json();
    const results = rows.filter((r) => (r.similarity ?? 0) >= THRESHOLD);
    const payload = { results, fallback: false };
    _setCache(cacheKey, payload);
    res.setHeader(
      "X-Embedding-Usage",
      JSON.stringify({ provider: "google", model: "gemini-embedding-001", count: 1 }),
    );
    res.status(200).json(payload);
  } catch {
    res.status(200).json({ fallback: true });
  }
}
