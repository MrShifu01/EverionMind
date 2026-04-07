/**
 * POST /api/embed
 *
 * Two modes:
 *   Single:  { entry_id: "uuid" }           — embed one entry
 *   Batch:   { brain_id: "uuid", batch: true } — embed all unembedded entries in a brain
 *
 * Required headers:
 *   X-Embed-Provider: "openai" | "google"
 *   X-Embed-Key:      the user's embedding API key
 */
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { generateEmbedding, generateEmbeddingsBatch, buildEntryText } from "./_lib/generateEmbedding.js";
import { checkBrainAccess } from "./_lib/checkBrainAccess.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SB_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "apikey": SB_KEY!,
  "Authorization": `Bearer ${SB_KEY}`,
};

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 20))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const provider = ((req.headers["x-embed-provider"] as string) || "openai").toLowerCase();
  const apiKey = ((req.headers["x-embed-key"] as string) || "").trim();
  if (!apiKey) return res.status(400).json({ error: "X-Embed-Key header required" });
  if (!["openai", "google"].includes(provider)) return res.status(400).json({ error: "X-Embed-Provider must be openai or google" });

  const { entry_id, brain_id, batch, force } = req.body || {};

  // ── Single entry mode ──────────────────────────────────────────
  if (entry_id && !batch) {
    if (typeof entry_id !== "string" || entry_id.length > 100) return res.status(400).json({ error: "Invalid entry_id" });

    const entryRes = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry_id)}&select=id,title,content,tags,brain_id`,
      { headers: SB_HEADERS }
    );
    if (!entryRes.ok) return res.status(502).json({ error: "Database error" });
    const [entry]: any[] = await entryRes.json();
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    // Verify user is a member or owner of the entry's brain
    const access = await checkBrainAccess(user.id, entry.brain_id);
    if (!access) return res.status(403).json({ error: "Forbidden" });

    try {
      const embedding = await generateEmbedding(buildEntryText(entry), provider as "openai" | "google", apiKey);
      await fetch(
        `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry_id)}`,
        {
          method: "PATCH",
          headers: { ...SB_HEADERS, "Prefer": "return=minimal" },
          body: JSON.stringify({
            embedding: `[${embedding.join(",")}]`,
            embedded_at: new Date().toISOString(),
            embedding_provider: provider,
          }),
        }
      );
      return res.status(200).json({ ok: true });
    } catch (e: any) {
      console.error("[embed:single]", e.message);
      return res.status(502).json({ error: e.message });
    }
  }

  // ── Batch mode ─────────────────────────────────────────────────
  if (batch && brain_id) {
    if (typeof brain_id !== "string" || brain_id.length > 100) return res.status(400).json({ error: "Invalid brain_id" });

    // Verify user is a member or owner of this brain
    const access = await checkBrainAccess(user.id, brain_id);
    if (!access) return res.status(403).json({ error: "Forbidden" });

    // Fetch entries that need embedding
    // Limit to 5 per request to stay within Vercel Hobby 10s timeout
    const filter = force
      ? `brain_id=eq.${encodeURIComponent(brain_id)}`
      : `brain_id=eq.${encodeURIComponent(brain_id)}&or=(embedded_at.is.null,embedding_provider.neq.${encodeURIComponent(provider)})`;
    const entriesRes = await fetch(
      `${SB_URL}/rest/v1/entries?${filter}&select=id,title,content,tags&limit=5`,
      { headers: SB_HEADERS }
    );
    if (!entriesRes.ok) return res.status(502).json({ error: "Database error" });
    const entries: any[] = await entriesRes.json();
    if (!entries.length) return res.status(200).json({ processed: 0, failed: 0, remaining: 0 });

    // Count total remaining for progress tracking
    const countRes = await fetch(
      `${SB_URL}/rest/v1/entries?${filter}&select=id`,
      { headers: { ...SB_HEADERS, "Prefer": "count=exact" } }
    );
    const remaining = parseInt(countRes.headers.get("content-range")?.split("/")?.[1] || "0", 10);

    let processed = 0;
    let failed = 0;
    const texts = entries.map(buildEntryText);

    try {
      const embeddings = await generateEmbeddingsBatch(texts, provider as "openai" | "google", apiKey);

      await Promise.all(
        entries.map((entry: any, idx: number) =>
          fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry.id)}`, {
            method: "PATCH",
            headers: { ...SB_HEADERS, "Prefer": "return=minimal" },
            body: JSON.stringify({
              embedding: `[${embeddings[idx].join(",")}]`,
              embedded_at: new Date().toISOString(),
              embedding_provider: provider,
            }),
          }).then(async (r: Response) => {
            if (r.ok) { processed++; }
            else { const err = await r.text().catch(() => String(r.status)); console.error("[embed:patch]", entry.id, r.status, err); failed++; }
          }).catch((e: any) => { console.error("[embed:batch:patch]", entry.id, e.message); failed++; })
        )
      );
    } catch (e: any) {
      console.error("[embed:batch]", e.message);
      return res.status(502).json({ error: e.message });
    }

    return res.status(200).json({ processed, failed, remaining: remaining - processed });
  }

  return res.status(400).json({ error: "Provide either entry_id or { brain_id, batch: true }" });
}
