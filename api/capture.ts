import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { checkBrainAccess } from "./_lib/checkBrainAccess.js";
import { generateEmbedding, generateEmbeddingsBatch, buildEntryText } from "./_lib/generateEmbedding.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { sbHeaders, sbHeadersNoContent } from "./_lib/sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL;

// Entry types are flexible — the AI decides the best label.
// The only reserved type is "secret" (triggers E2E encryption).
// We sanitise the value but impose no whitelist.

// SEC-15: Whitelist allowed rel values
const ALLOWED_RELS = ['related', 'mentions', 'links-to', 'contradicts'];

// Dispatched via rewrite: /api/save-links → /api/capture?action=links
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (req.query.action === "links") return handleSaveLinks(req, res);
  if (req.query.action === "embed") return handleEmbed(req, res);
  return handleCapture(req, res);
}

// ── POST /api/capture ──
async function handleCapture(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { p_title, p_content, p_type, p_metadata, p_tags, p_brain_id, p_extra_brain_ids } = req.body;

  if (!p_title || typeof p_title !== "string" || p_title.trim().length === 0) {
    return res.status(400).json({ error: "Missing or invalid title" });
  }
  if (p_extra_brain_ids !== undefined && p_extra_brain_ids !== null) {
    if (!Array.isArray(p_extra_brain_ids)) {
      return res.status(400).json({ error: "p_extra_brain_ids must be an array" });
    }
    if (p_extra_brain_ids.length > 5) {
      return res.status(400).json({ error: "p_extra_brain_ids max 5 items" });
    }
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!p_extra_brain_ids.every((id: any) => typeof id === 'string' && uuidRe.test(id))) {
      return res.status(400).json({ error: "p_extra_brain_ids must contain valid UUIDs" });
    }
  }

  const safeBody: Record<string, any> = {
    p_title: p_title.trim().slice(0, 500),
    p_content: p_content ? String(p_content).slice(0, 10000) : "",
    p_type: typeof p_type === "string" && p_type.trim() ? p_type.trim().slice(0, 50).toLowerCase() : "note",
    p_metadata: p_metadata && typeof p_metadata === "object" && !Array.isArray(p_metadata) ? p_metadata : {},
    p_tags: Array.isArray(p_tags) ? p_tags.filter((t: any) => typeof t === "string").slice(0, 50) : [],
    p_user_id: user.id,
    ...(p_brain_id && typeof p_brain_id === "string" ? { p_brain_id } : {}),
  };

  // Verify user is a member/owner of each extra brain before inserting
  if (Array.isArray(p_extra_brain_ids) && p_extra_brain_ids.length > 0) {
    for (const brainId of p_extra_brain_ids) {
      if (typeof brainId !== "string") continue;
      const access = await checkBrainAccess(user.id, brainId);
      if (!access) {
        return res.status(403).json({ error: `Not a member of brain ${brainId}` });
      }
    }
  }

  // S3-4: URL deduplication — merge instead of duplicate when same URL exists
  const sourceUrl = safeBody.p_metadata?.source_url || safeBody.p_metadata?.url;
  if (sourceUrl && p_brain_id) {
    const dedupRes = await fetch(`${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(p_brain_id)}&select=id,metadata`, { headers: sbHeadersNoContent() });
    if (dedupRes.ok) {
      const existing: any[] = await dedupRes.json();
      const dupe = existing.find((e: any) => e.metadata?.source_url === sourceUrl || e.metadata?.url === sourceUrl);
      if (dupe) {
        const merged = { ...dupe.metadata, sources: [...(dupe.metadata?.sources || [sourceUrl]), sourceUrl] };
        await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(dupe.id)}`, { method: "PATCH", headers: sbHeaders({ Prefer: "return=representation" }), body: JSON.stringify({ metadata: merged }) });
        return res.status(200).json({ id: dupe.id, merged: true });
      }
    }
  }

  // Direct INSERT — avoids the capture() RPC whose signature drifted from the
  // live DB (missing p_user_id param). PostgREST returns the inserted row array.
  const insertBody: Record<string, any> = {
    user_id: safeBody.p_user_id,
    title: safeBody.p_title,
    content: safeBody.p_content,
    type: safeBody.p_type,
    metadata: safeBody.p_metadata,
    tags: safeBody.p_tags,
  };
  if (safeBody.p_brain_id) insertBody.brain_id = safeBody.p_brain_id;

  const response = await fetch(`${SB_URL}/rest/v1/entries`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify(insertBody),
  });

  const rawData: any = await response.json();
  // Normalise: PostgREST returns an array; downstream code expects { id }.
  const inserted = Array.isArray(rawData) ? rawData[0] : rawData;
  const data: any = inserted?.id ? { id: inserted.id } : rawData;

  // SEC-14: Fire-and-forget audit log write to Supabase
  if (response.ok && data?.id) {
    fetch(`${SB_URL}/rest/v1/audit_log`, {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        user_id: user.id,
        action: 'entry_capture',
        resource_id: data.id,
        timestamp: new Date().toISOString(),
      }),
    }).catch((err: any) => console.error('[capture:audit_log]', err.message)); // best-effort, never blocks
  }

  // If extra brain IDs provided, share the entry into those brains via entry_brains
  if (response.ok && data?.id && Array.isArray(p_extra_brain_ids) && p_extra_brain_ids.length > 0) {
    const extraIds = p_extra_brain_ids.filter((id: any) => typeof id === "string" && id !== p_brain_id);
    if (extraIds.length > 0) {
      const rows = extraIds.map((brain_id: string) => ({ entry_id: data.id, brain_id }));
      fetch(`${SB_URL}/rest/v1/entry_brains`, {
        method: "POST",
        headers: sbHeaders({ Prefer: "resolution=ignore-duplicates" }),
        body: JSON.stringify(rows),
      }).catch((err: any) => console.error('[capture:entry_brains] Failed to share entry to extra brains', err));
    }
  }

  // Auto-embed: if embed headers are present, embed the new entry BEFORE responding.
  // Must be awaited — on Vercel serverless, fire-and-forget promises are killed when
  // the function returns (see https://vercel.com/docs/functions — use waitUntil or await).
  // Previously this was .then()/.catch() which caused single-entry embeds to silently
  // vanish while batch embed still worked.
  if (response.ok && data?.id) {
    const embedProvider = ((req.headers["x-embed-provider"] as string) || "").toLowerCase();
    const embedKey = ((req.headers["x-embed-key"] as string) || "").trim();
    if (embedKey && ["openai", "google"].includes(embedProvider)) {
      const entryForEmbed = { title: safeBody.p_title, content: safeBody.p_content, tags: safeBody.p_tags };
      try {
        const embedding = await generateEmbedding(
          buildEntryText(entryForEmbed),
          embedProvider as "openai" | "google",
          embedKey,
        );
        const patchRes = await fetch(
          `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(data.id)}`,
          {
            method: "PATCH",
            headers: sbHeaders({ Prefer: "return=minimal" }),
            body: JSON.stringify({
              embedding: `[${embedding.join(",")}]`,
              embedded_at: new Date().toISOString(),
              embedding_provider: embedProvider,
            }),
          },
        );
        if (!patchRes.ok) {
          const err = await patchRes.text().catch(() => String(patchRes.status));
          console.error("[capture:auto-embed:patch]", patchRes.status, err);
        }
      } catch (err: any) {
        console.error("[capture:auto-embed]", err?.message || err);
      }
    }
  }

  res.status(response.status).json(data);
}

// ── POST /api/save-links (rewritten to /api/capture?action=links) ──
async function handleSaveLinks(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });
  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { links, brain_id } = req.body;
  if (!Array.isArray(links)) return res.status(400).json({ error: "links must be an array" });

  // Validate link structure and rel whitelist
  const valid = links.filter((l: any) => {
    if (!l.from || !l.to || !l.rel) return false;
    if (typeof l.from !== "string" || typeof l.to !== "string" || typeof l.rel !== "string") return false;
    if (!ALLOWED_RELS.includes(l.rel)) return false;
    return true;
  });

  if (valid.length === 0) {
    const hasInvalidRel = links.some((l: any) => l.rel && !ALLOWED_RELS.includes(l.rel));
    if (hasInvalidRel) {
      return res.status(400).json({ error: `rel must be one of: ${ALLOWED_RELS.join(', ')}` });
    }
    return res.status(400).json({ error: "No valid links" });
  }

  const response = await fetch(`${SB_URL}/rest/v1/rpc/save_links`, {
    method: "POST",
    headers: sbHeaders(),
    body: JSON.stringify({
      p_user_id: user.id,
      p_links: JSON.stringify(valid),
      ...(brain_id && typeof brain_id === "string" ? { p_brain_id: brain_id } : {}),
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "");
    console.log(`[save-links] RPC not available: ${err}`);
    return res.status(200).json({ ok: true, stored: "local-only", message: "Links saved locally. Create the save_links RPC in Supabase to enable server persistence." });
  }

  res.status(200).json({ ok: true, stored: "database", count: valid.length });
}

// ── POST /api/embed (rewritten to /api/capture?action=embed) ──
export async function handleEmbed(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 20))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const provider = ((req.headers["x-embed-provider"] as string) || "openai").toLowerCase();
  const apiKey = ((req.headers["x-embed-key"] as string) || "").trim();
  if (!apiKey) return res.status(400).json({ error: "X-Embed-Key header required" });
  if (!["openai", "google"].includes(provider)) return res.status(400).json({ error: "X-Embed-Provider must be openai or google" });

  const { entry_id, brain_id, batch, force } = req.body || {};

  if (entry_id && !batch) {
    if (typeof entry_id !== "string" || entry_id.length > 100) return res.status(400).json({ error: "Invalid entry_id" });
    const entryRes = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry_id)}&select=id,title,content,tags,brain_id`, { headers: sbHeadersNoContent() });
    if (!entryRes.ok) return res.status(502).json({ error: "Database error" });
    const [entry]: any[] = await entryRes.json();
    if (!entry) return res.status(404).json({ error: "Entry not found" });
    const access = await checkBrainAccess(user.id, entry.brain_id);
    if (!access) return res.status(403).json({ error: "Forbidden" });
    const MAX_ATTEMPTS = 3;
    let lastErr: any;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await new Promise<void>((resolve) => setTimeout(resolve, attempt * 2000));
      try {
        const embedding = await generateEmbedding(buildEntryText(entry), provider as "openai" | "google", apiKey);
        await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry_id)}`, {
          method: "PATCH",
          headers: sbHeaders({ Prefer: "return=minimal" }),
          body: JSON.stringify({ embedding: `[${embedding.join(",")}]`, embedded_at: new Date().toISOString(), embedding_provider: provider }),
        });
        return res.status(200).json({ ok: true });
      } catch (e: any) {
        lastErr = e;
        console.error(`[embed:single] attempt ${attempt + 1} failed:`, e.message);
      }
    }
    return res.status(502).json({ error: lastErr?.message ?? "Embedding failed" });
  }

  if (batch && brain_id) {
    if (typeof brain_id !== "string" || brain_id.length > 100) return res.status(400).json({ error: "Invalid brain_id" });
    const access = await checkBrainAccess(user.id, brain_id);
    if (!access) return res.status(403).json({ error: "Forbidden" });
    const filter = force
      ? `brain_id=eq.${encodeURIComponent(brain_id)}`
      : `brain_id=eq.${encodeURIComponent(brain_id)}&or=(embedded_at.is.null,embedding_provider.neq.${encodeURIComponent(provider)})`;
    const entriesRes = await fetch(`${SB_URL}/rest/v1/entries?${filter}&select=id,title,content,tags&limit=5`, { headers: sbHeadersNoContent() });
    if (!entriesRes.ok) return res.status(502).json({ error: "Database error" });
    const entries: any[] = await entriesRes.json();
    if (!entries.length) return res.status(200).json({ processed: 0, failed: 0, remaining: 0 });
    const countRes = await fetch(`${SB_URL}/rest/v1/entries?${filter}&select=id`, { headers: sbHeadersNoContent({ Prefer: "count=exact" }) });
    const remaining = parseInt(countRes.headers.get("content-range")?.split("/")?.[1] || "0", 10);
    let processed = 0;
    let failed = 0;
    const texts = entries.map(buildEntryText);
    try {
      const embeddings = await generateEmbeddingsBatch(texts, provider as "openai" | "google", apiKey);
      await Promise.all(entries.map((entry: any, idx: number) =>
        fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry.id)}`, {
          method: "PATCH",
          headers: sbHeaders({ Prefer: "return=minimal" }),
          body: JSON.stringify({ embedding: `[${embeddings[idx].join(",")}]`, embedded_at: new Date().toISOString(), embedding_provider: provider }),
        }).then(async (r: Response) => {
          if (r.ok) { processed++; }
          else { const err = await r.text().catch(() => String(r.status)); console.error("[embed:patch]", entry.id, r.status, err); failed++; }
        }).catch((e: any) => { console.error("[embed:batch:patch]", entry.id, e.message); failed++; })
      ));
    } catch (e: any) {
      console.error("[embed:batch]", e.message);
      return res.status(502).json({ error: e.message });
    }
    return res.status(200).json({ processed, failed, remaining: remaining - processed });
  }

  return res.status(400).json({ error: "Provide either entry_id or { brain_id, batch: true }" });
}
