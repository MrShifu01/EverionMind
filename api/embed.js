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
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { generateEmbedding, generateEmbeddingsBatch, buildEntryText } from "./_lib/generateEmbedding.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SB_KEY,
  "Authorization": `Bearer ${SB_KEY}`,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!rateLimit(req, 20)) return res.status(429).json({ error: "Too many requests" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const provider = (req.headers["x-embed-provider"] || "openai").toLowerCase();
  const apiKey = (req.headers["x-embed-key"] || "").trim();
  if (!apiKey) return res.status(400).json({ error: "X-Embed-Key header required" });
  if (!["openai", "google"].includes(provider)) return res.status(400).json({ error: "X-Embed-Provider must be openai or google" });

  const { entry_id, brain_id, batch } = req.body || {};

  // ── Single entry mode ──────────────────────────────────────────
  if (entry_id && !batch) {
    if (typeof entry_id !== "string" || entry_id.length > 100) return res.status(400).json({ error: "Invalid entry_id" });

    const entryRes = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry_id)}&select=id,title,content,tags,brain_id`,
      { headers: SB_HEADERS }
    );
    if (!entryRes.ok) return res.status(502).json({ error: "Database error" });
    const [entry] = await entryRes.json();
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    // Verify user is a member of the entry's brain
    const memberRes = await fetch(
      `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(entry.brain_id)}&user_id=eq.${encodeURIComponent(user.id)}&select=role`,
      { headers: SB_HEADERS }
    );
    const [member] = memberRes.ok ? await memberRes.json() : [];
    if (!member) return res.status(403).json({ error: "Forbidden" });

    try {
      const embedding = await generateEmbedding(buildEntryText(entry), provider, apiKey);
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
    } catch (e) {
      console.error("[embed:single]", e.message);
      return res.status(502).json({ error: e.message });
    }
  }

  // ── Batch mode ─────────────────────────────────────────────────
  if (batch && brain_id) {
    if (typeof brain_id !== "string" || brain_id.length > 100) return res.status(400).json({ error: "Invalid brain_id" });

    // Verify user is a member of this brain
    const memberRes = await fetch(
      `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brain_id)}&user_id=eq.${encodeURIComponent(user.id)}&select=role`,
      { headers: SB_HEADERS }
    );
    const [member] = memberRes.ok ? await memberRes.json() : [];
    if (!member) return res.status(403).json({ error: "Forbidden" });

    // Fetch entries that need embedding (missing or stale provider)
    const entriesRes = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain_id)}&select=id,title,content,tags&or=(embedded_at.is.null,embedding_provider.neq.${encodeURIComponent(provider)})&limit=200`,
      { headers: SB_HEADERS }
    );
    if (!entriesRes.ok) return res.status(502).json({ error: "Database error" });
    const entries = await entriesRes.json();
    if (!entries.length) return res.status(200).json({ processed: 0, skipped: 0 });

    // Process in chunks of 50
    const CHUNK = 50;
    let processed = 0;
    let failed = 0;

    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      const texts = chunk.map(buildEntryText);

      try {
        const embeddings = await generateEmbeddingsBatch(texts, provider, apiKey);

        // Parallel PATCH all entries in chunk
        await Promise.all(
          chunk.map((entry, idx) =>
            fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry.id)}`, {
              method: "PATCH",
              headers: { ...SB_HEADERS, "Prefer": "return=minimal" },
              body: JSON.stringify({
                embedding: `[${embeddings[idx].join(",")}]`,
                embedded_at: new Date().toISOString(),
                embedding_provider: provider,
              }),
            }).catch(e => { console.error("[embed:batch:patch]", entry.id, e.message); failed++; })
          )
        );
        processed += chunk.length - failed;
      } catch (e) {
        console.error("[embed:batch:chunk]", e.message);
        failed += chunk.length;
      }
    }

    return res.status(200).json({ processed, failed, total: entries.length });
  }

  return res.status(400).json({ error: "Provide either entry_id or { brain_id, batch: true }" });
}
