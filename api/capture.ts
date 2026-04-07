import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { checkBrainAccess } from "./_lib/checkBrainAccess.js";
import { generateEmbedding, buildEntryText } from "./_lib/generateEmbedding.js";

const SB_URL = process.env.SUPABASE_URL;

const ALLOWED_TYPES = ["note", "person", "place", "idea", "contact", "document", "reminder", "color", "decision", "secret"];

// SEC-15: Whitelist allowed rel values
const ALLOWED_RELS = ['related', 'mentions', 'links-to', 'contradicts'];

// Dispatched via rewrite: /api/save-links → /api/capture?action=links
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (req.query.action === "links") return handleSaveLinks(req, res);
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
    p_type: ALLOWED_TYPES.includes(p_type) ? p_type : "note",
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

  const response = await fetch(`${SB_URL}/rest/v1/rpc/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY!,
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(safeBody),
  });

  const data: any = await response.json();

  // SEC-14: Fire-and-forget audit log write to Supabase
  if (response.ok && data?.id) {
    fetch(`${SB_URL}/rest/v1/audit_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        user_id: user.id,
        action: 'entry_capture',
        resource_id: data.id,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {}); // best-effort, never blocks
  }

  // If extra brain IDs provided, share the entry into those brains via entry_brains
  if (response.ok && data?.id && Array.isArray(p_extra_brain_ids) && p_extra_brain_ids.length > 0) {
    const extraIds = p_extra_brain_ids.filter((id: any) => typeof id === "string" && id !== p_brain_id);
    if (extraIds.length > 0) {
      const rows = extraIds.map((brain_id: string) => ({ entry_id: data.id, brain_id }));
      fetch(`${SB_URL}/rest/v1/entry_brains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY!,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Prefer": "resolution=ignore-duplicates",
        },
        body: JSON.stringify(rows),
      }).catch((err: any) => console.error('[capture:entry_brains] Failed to share entry to extra brains', err));
    }
  }

  // Auto-embed: if embed headers are present, embed the new entry (fire-and-forget)
  if (response.ok && data?.id) {
    const embedProvider = ((req.headers["x-embed-provider"] as string) || "").toLowerCase();
    const embedKey = ((req.headers["x-embed-key"] as string) || "").trim();
    if (embedKey && ["openai", "google"].includes(embedProvider)) {
      const entryForEmbed = { title: safeBody.p_title, content: safeBody.p_content, tags: safeBody.p_tags };
      generateEmbedding(buildEntryText(entryForEmbed), embedProvider as "openai" | "google", embedKey)
        .then((embedding: number[]) =>
          fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(data.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY!, "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Prefer": "return=minimal" },
            body: JSON.stringify({ embedding: `[${embedding.join(",")}]`, embedded_at: new Date().toISOString(), embedding_provider: embedProvider }),
          })
        )
        .catch((err: any) => console.error("[capture:auto-embed]", err.message));
    }
  }

  res.status(response.status).json(data);
}

// ── POST /api/save-links (rewritten to /api/capture?action=links) ──
async function handleSaveLinks(req: ApiRequest, res: ApiResponse): Promise<void> {
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
    headers: {
      "Content-Type": "application/json",
      "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY!,
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
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
