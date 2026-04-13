/**
 * GET  /api/graph?brain_id=UUID  — load concept graph for a brain
 * POST /api/graph                — save concept graph for a brain
 *
 * Body (POST): { brain_id: string, graph: { concepts: [...], relationships: [...] } }
 */
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { checkBrainAccess } from "./_lib/checkBrainAccess.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { sbHeaders, sbHeadersNoContent } from "./_lib/sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL;

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") return handleLoad(req, res, user);
  return handleSave(req, res, user);
}

async function handleLoad(req: ApiRequest, res: ApiResponse, user: any): Promise<void> {
  const brainId = req.query.brain_id as string;
  if (!brainId) return res.status(400).json({ error: "brain_id required" });

  const access = await checkBrainAccess(user.id, brainId);
  if (!access) return res.status(403).json({ error: "Forbidden" });

  const r = await fetch(
    `${SB_URL}/rest/v1/concept_graphs?brain_id=eq.${encodeURIComponent(brainId)}&select=graph,updated_at`,
    { headers: sbHeadersNoContent() },
  );
  if (!r.ok) return res.status(502).json({ error: "Database error" });

  const rows: any[] = await r.json();
  if (rows.length === 0) {
    return res.status(200).json({ graph: { concepts: [], relationships: [] }, updated_at: null });
  }
  return res.status(200).json(rows[0]);
}

async function handleSave(req: ApiRequest, res: ApiResponse, user: any): Promise<void> {
  const { brain_id, graph } = req.body || {};
  if (!brain_id || typeof brain_id !== "string") return res.status(400).json({ error: "brain_id required" });
  if (!graph || typeof graph !== "object") return res.status(400).json({ error: "graph required" });

  const access = await checkBrainAccess(user.id, brain_id);
  if (!access) return res.status(403).json({ error: "Forbidden" });

  // Validate graph shape loosely
  const safeGraph = {
    concepts: Array.isArray(graph.concepts) ? graph.concepts.slice(0, 500) : [],
    relationships: Array.isArray(graph.relationships) ? graph.relationships.slice(0, 500) : [],
  };

  // Upsert: insert or update on conflict
  const r = await fetch(`${SB_URL}/rest/v1/concept_graphs`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({
      brain_id,
      graph: safeGraph,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!r.ok) {
    const err = await r.text().catch(() => String(r.status));
    console.error("[graph:save]", r.status, err);
    return res.status(502).json({ error: "Failed to save graph" });
  }

  return res.status(200).json({ ok: true });
}
