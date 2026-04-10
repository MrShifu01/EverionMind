import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { sbHeaders, sbHeadersNoContent } from "./_lib/sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL;
const ENCRYPTED_PREFIX = "v1:";

// Vault entries are stored AES-256-GCM encrypted — server never sees plaintext.
// content and metadata must carry the "v1:{iv}:{cipher}" prefix when non-empty.
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") return handleGet(req, res, user);
  if (req.method === "POST") return handlePost(req, res, user);
  if (req.method === "DELETE") return handleDelete(req, res, user);
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(_req: ApiRequest, res: ApiResponse, user: any): Promise<void> {
  const r = await fetch(
    `${SB_URL}/rest/v1/vault_entries?user_id=eq.${user.id}&deleted_at=is.null&order=created_at.desc&select=id,title,content,metadata,tags,brain_id,created_at`,
    { headers: sbHeadersNoContent() },
  );
  if (!r.ok) return res.status(502).json({ error: "Database error" });
  const data = await r.json();
  return res.status(200).json(data);
}

async function handlePost(req: ApiRequest, res: ApiResponse, user: any): Promise<void> {
  const { title, content, metadata, tags, brain_id } = req.body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Title is required" });
  }
  // Enforce encrypted content — reject any plaintext attempt
  if (content && typeof content === "string" && content.length > 0 && !content.startsWith(ENCRYPTED_PREFIX)) {
    return res.status(400).json({ error: "content must be encrypted (v1: prefix required)" });
  }
  if (metadata && typeof metadata === "string" && metadata.length > 0 && !metadata.startsWith(ENCRYPTED_PREFIX)) {
    return res.status(400).json({ error: "metadata must be encrypted (v1: prefix required)" });
  }

  const insertBody: Record<string, any> = {
    user_id: user.id,
    title: title.trim().slice(0, 500),
    content: typeof content === "string" ? content.slice(0, 20000) : "",
    metadata: typeof metadata === "string" ? metadata.slice(0, 20000) : "",
    tags: Array.isArray(tags) ? tags.filter((t: any) => typeof t === "string").slice(0, 50) : [],
  };
  if (brain_id && typeof brain_id === "string") insertBody.brain_id = brain_id;

  const r = await fetch(`${SB_URL}/rest/v1/vault_entries`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify(insertBody),
  });

  if (!r.ok) {
    const err = await r.text().catch(() => "");
    console.error("[vault-entries:post]", r.status, err);
    return res.status(502).json({ error: err || "Database error" });
  }
  const rawData: any = await r.json();
  const inserted = Array.isArray(rawData) ? rawData[0] : rawData;
  return res.status(201).json({ id: inserted?.id });
}

async function handleDelete(req: ApiRequest, res: ApiResponse, user: any): Promise<void> {
  const { id } = req.query;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "id required" });

  // Soft delete — user_id check enforced by RLS and explicit filter
  const r = await fetch(
    `${SB_URL}/rest/v1/vault_entries?id=eq.${encodeURIComponent(id)}&user_id=eq.${user.id}`,
    {
      method: "PATCH",
      headers: sbHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    },
  );
  if (!r.ok) return res.status(502).json({ error: "Delete failed" });
  return res.status(200).json({ ok: true });
}
