import type { ApiRequest } from "./_lib/types";
import { withAuth, requireBrainAccess, ApiError, type HandlerContext } from "./_lib/withAuth.js";
import { generateEmbedding, generateEmbeddingsBatch, buildEntryText } from "./_lib/generateEmbedding.js";
import { sbHeaders, sbHeadersNoContent } from "./_lib/sbHeaders.js";
import { computeCompletenessScore } from "./_lib/completeness.js";
import { detectAndStoreMerge } from "./_lib/mergeDetect.js";
import { checkAndIncrement } from "./_lib/usage.js";
import { enrichInline } from "./_lib/enrich.js";
import {
  reserveIdempotency,
  finalizeIdempotency,
  releaseIdempotency,
  normalizeIdempotencyKey,
  IdempotencyError,
} from "./_lib/idempotency.js";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

const SB_URL = process.env.SUPABASE_URL;
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const REL_PATTERN = /^[a-zA-Z0-9 _\-']{1,50}$/;

function rateLimitForCapture(req: ApiRequest): number {
  const action = req.query.action as string | undefined;
  if (action === "embed") return 120;
  return 30; // capture (default) + links
}

// Dispatched via rewrite: /api/save-links → /api/capture?action=links
export default withAuth(
  { methods: ["POST"], rateLimit: rateLimitForCapture, cacheControl: "no-store" },
  async (ctx) => {
    const action = ctx.req.query.action as string | undefined;
    if (action === "links") return handleSaveLinks(ctx);
    if (action === "embed") return handleEmbed(ctx);
    return handleCapture(ctx);
  },
);

async function updateStreak(userId: string): Promise<void> {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const authHdr = { apikey: svcKey, Authorization: `Bearer ${svcKey}` };
  const userRes = await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, { headers: authHdr });
  if (!userRes.ok) return;
  const userData = await userRes.json();
  const meta = userData.user_metadata || {};
  const today = new Date().toISOString().slice(0, 10);
  if (meta.last_capture_date === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const currentStreak = meta.last_capture_date === yesterday ? (meta.current_streak || 0) + 1 : 1;
  const longestStreak = Math.max(currentStreak, meta.longest_streak || 0);
  await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: { ...authHdr, "Content-Type": "application/json" },
    body: JSON.stringify({
      user_metadata: { ...meta, current_streak: currentStreak, longest_streak: longestStreak, last_capture_date: today },
    }),
  });
}

// ── POST /api/capture ──
async function handleCapture({ req, res, user, req_id }: HandlerContext): Promise<void> {
  const { p_title, p_content, p_type, p_metadata, p_tags, p_brain_id, p_extra_brain_ids } = req.body;

  if (!p_title || typeof p_title !== "string" || p_title.trim().length === 0) {
    throw new ApiError(400, "Missing or invalid title");
  }
  if (p_extra_brain_ids !== undefined && p_extra_brain_ids !== null) {
    if (!Array.isArray(p_extra_brain_ids)) throw new ApiError(400, "p_extra_brain_ids must be an array");
    if (p_extra_brain_ids.length > 5) throw new ApiError(400, "p_extra_brain_ids max 5 items");
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!p_extra_brain_ids.every((id: any) => typeof id === 'string' && uuidRe.test(id))) {
      throw new ApiError(400, "p_extra_brain_ids must contain valid UUIDs");
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

  if (p_brain_id && typeof p_brain_id === "string") {
    await requireBrainAccess(user.id, p_brain_id);
  }

  if (Array.isArray(p_extra_brain_ids) && p_extra_brain_ids.length > 0) {
    for (const brainId of p_extra_brain_ids) {
      if (typeof brainId !== "string") continue;
      await requireBrainAccess(user.id, brainId);
    }
  }

  // Idempotency — atomic reserve before insert closes the check-then-act race.
  let idempotencyKey: string | null;
  try {
    idempotencyKey = normalizeIdempotencyKey(req.headers["idempotency-key"]);
  } catch (e) {
    if (e instanceof IdempotencyError) throw new ApiError(e.status, e.publicMessage);
    throw e;
  }
  let reservationOwned = false;
  if (idempotencyKey) {
    const reserve = await reserveIdempotency(user.id, idempotencyKey);
    if (reserve.kind === "replay") {
      return void res.status(200).json({ id: reserve.entryId, idempotent_replay: true });
    }
    if (reserve.kind === "in_flight") {
      return void res.status(409).json({ error: "duplicate_in_flight", idempotent_replay: true });
    }
    reservationOwned = true;
  }

  try {
    await runCapture();
  } catch (err) {
    if (reservationOwned && idempotencyKey) {
      releaseIdempotency(user.id, idempotencyKey).catch(() => {});
    }
    throw err;
  }
  return;

  async function runCapture(): Promise<void> {

  // Usage gate: only applies to platform AI (managed provider)
  if (GEMINI_API_KEY) {
    const r = await fetch(
      `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(user.id)}&select=plan,anthropic_key,openai_key,gemini_key&limit=1`,
      { headers: sbHeaders() },
    );
    const [row] = r.ok ? await r.json() : [null];
    const plan: string = row?.plan ?? "free";
    const hasKey = !!(row?.anthropic_key || row?.openai_key || row?.gemini_key);
    let check: Awaited<ReturnType<typeof checkAndIncrement>>;
    try {
      check = await checkAndIncrement(user.id, "captures", plan, hasKey);
    } catch {
      return void res.status(503).json({ error: "quota_unavailable", retryAfter: 10 });
    }
    if (!check.allowed) {
      return void res.status(429).json({
        error: "monthly_limit_reached",
        action: "captures",
        remaining: 0,
        upgrade_url: "/settings?tab=billing",
      });
    }
  }

  // Validate source_url scheme — reject non-http(s) to prevent SSRF
  const rawSourceUrl = safeBody.p_metadata?.source_url || safeBody.p_metadata?.url;
  if (rawSourceUrl) {
    try {
      const parsed = new URL(String(rawSourceUrl));
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new ApiError(400, "source_url must use http or https scheme");
      }
    } catch (e: any) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(400, "source_url is not a valid URL");
    }
  }

  // URL deduplication — point query against the entries_user_source_url unique
  // index so this stays O(1) regardless of how many entries the user has.
  const sourceUrl = rawSourceUrl;
  if (sourceUrl) {
    const dedupRes = await fetch(
      `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(user.id)}&deleted_at=is.null&metadata->>source_url=eq.${encodeURIComponent(sourceUrl)}&select=id,metadata&limit=1`,
      { headers: sbHeadersNoContent() },
    );
    if (dedupRes.ok) {
      const [dupe]: any[] = await dedupRes.json();
      if (dupe?.id) {
        const merged = { ...dupe.metadata, sources: [...(dupe.metadata?.sources || []), sourceUrl] };
        await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(dupe.id)}`, { method: "PATCH", headers: sbHeaders({ Prefer: "return=representation" }), body: JSON.stringify({ metadata: merged }) });
        if (idempotencyKey) await finalizeIdempotency(user.id, idempotencyKey, dupe.id);
        res.status(200).json({ id: dupe.id, merged: true });
        return;
      }
    }
  }

  // §6: metadata JSONB size cap — reject before INSERT to avoid bloat / slow PATCHes
  if (JSON.stringify(safeBody.p_metadata).length > 64_000) {
    throw new ApiError(400, "metadata too large — max 64 KB");
  }

  // Auto-compute completeness score
  const cScore = computeCompletenessScore(safeBody.p_title, safeBody.p_content, safeBody.p_type, safeBody.p_tags, safeBody.p_metadata);
  safeBody.p_metadata = { ...safeBody.p_metadata, completeness_score: cScore };

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

  // P0 #9 race: unique index on (user_id, source_url) fires → look up the row
  // by the actual source_url (filtering by user_id alone returns a random entry).
  if (response.status === 409) {
    const conflictUrl = safeBody.p_metadata?.source_url || safeBody.p_metadata?.url;
    if (conflictUrl) {
      const dupeRes = await fetch(
        `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(user.id)}&deleted_at=is.null&metadata->>source_url=eq.${encodeURIComponent(String(conflictUrl))}&select=id&limit=1`,
        { headers: sbHeadersNoContent() },
      );
      const [existing] = dupeRes.ok ? await dupeRes.json() : [];
      if (existing?.id) {
        if (idempotencyKey) await finalizeIdempotency(user.id, idempotencyKey, existing.id);
        return void res.status(200).json({ id: existing.id, merged: true });
      }
    }
    if (idempotencyKey) await releaseIdempotency(user.id, idempotencyKey);
    return void res.status(409).json({ error: "duplicate_entry" });
  }

  const rawData: any = await response.json();
  const inserted = Array.isArray(rawData) ? rawData[0] : rawData;
  const data: any = inserted?.id ? { id: inserted.id } : rawData;

  // Attach the entry id to the previously-reserved idempotency slot.
  if (response.ok && data?.id && idempotencyKey) {
    finalizeIdempotency(user.id, idempotencyKey, data.id).catch(() => {});
  } else if (!response.ok && idempotencyKey) {
    releaseIdempotency(user.id, idempotencyKey).catch(() => {});
  }

  // Background merge detection (fire-and-forget)
  if (response.ok && data?.id) {
    detectAndStoreMerge(data.id, user.id).catch((err: any) =>
      console.error("[capture:merge-detect]", err?.message),
    );
  }

  // Audit log (fire-and-forget)
  if (response.ok && data?.id) {
    fetch(`${SB_URL}/rest/v1/audit_log`, {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        user_id: user.id,
        action: 'entry_capture',
        resource_id: data.id,
        request_id: req_id,
        timestamp: new Date().toISOString(),
      }),
    }).catch((err: any) => console.error('[capture:audit_log]', err.message));
  }

  // Run enrichment inline — Vercel kills the function as soon as we respond,
  // so a fire-and-forget Promise here would never complete. enrichInline runs
  // every step (parse, insight, concepts, embed) end-to-end, awaited.
  // capture has maxDuration: 30 in vercel.json which covers it.
  if (response.ok && data?.id) {
    await enrichInline(data.id, user.id).catch((err: any) =>
      console.error("[capture:enrich]", err?.message ?? err),
    );
  }

  updateStreak(user.id).catch((err) => console.error("[capture] streak update failed", err));
  res.status(response.status).json(data);
  }
}

// ── POST /api/save-links (rewritten to /api/capture?action=links) ──
async function handleSaveLinks({ req, res, user }: HandlerContext): Promise<void> {
  const { links, brain_id } = req.body;
  if (!Array.isArray(links)) throw new ApiError(400, "links must be an array");

  if (brain_id && typeof brain_id === "string") {
    await requireBrainAccess(user.id, brain_id);
  }

  const valid = links.filter((l: any) => {
    if (!l.from || !l.to || !l.rel) return false;
    if (typeof l.from !== "string" || typeof l.to !== "string" || typeof l.rel !== "string") return false;
    if (!REL_PATTERN.test(l.rel)) return false;
    return true;
  });

  if (valid.length === 0) {
    const hasInvalidRel = links.some((l: any) => l.rel && !REL_PATTERN.test(l.rel));
    if (hasInvalidRel) throw new ApiError(400, "rel must be 1-50 alphanumeric characters");
    throw new ApiError(400, "No valid links");
  }

  const rows = valid.map((l: any) => ({
    from: l.from,
    to: l.to,
    rel: l.rel,
    ...(brain_id && typeof brain_id === "string" ? { brain_id } : {}),
    user_id: user.id,
  }));
  const response = await fetch(`${SB_URL}/rest/v1/links`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "resolution=ignore-duplicates,return=minimal" }),
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "");
    console.error(`[save-links] Direct insert failed (${response.status}): ${err}`);
    const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/save_links`, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify({ p_user_id: user.id, p_links: JSON.stringify(valid), ...(brain_id ? { p_brain_id: brain_id } : {}) }),
    });
    if (!rpcRes.ok) {
      res.status(200).json({ ok: true, stored: "local-only", count: 0 });
      return;
    }
  }

  res.status(200).json({ ok: true, stored: "database", count: valid.length });
}

// ── POST /api/embed (rewritten to /api/capture?action=embed) ──
async function handleEmbed({ req, res, user }: HandlerContext): Promise<void> {
  const apiKey = GEMINI_API_KEY;
  if (!apiKey) throw new ApiError(500, "Embeddings not configured (missing GEMINI_API_KEY)");

  const { entry_id, brain_id, batch, force } = req.body || {};

  if (entry_id && !batch) {
    if (typeof entry_id !== "string" || entry_id.length > 100) throw new ApiError(400, "Invalid entry_id");
    const entryRes = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry_id)}&user_id=eq.${encodeURIComponent(user.id)}&select=id,title,content,tags,brain_id`, { headers: sbHeadersNoContent() });
    if (!entryRes.ok) throw new ApiError(502, "Database error");
    const [entry]: any[] = await entryRes.json();
    if (!entry) throw new ApiError(404, "Entry not found");
    await requireBrainAccess(user.id, entry.brain_id);

    const MAX_ATTEMPTS = 3;
    let lastErr: any;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await new Promise<void>((resolve) => setTimeout(resolve, attempt * 2000));
      try {
        const embedding = await generateEmbedding(buildEntryText(entry), apiKey);
        await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry_id)}`, {
          method: "PATCH",
          headers: sbHeaders({ Prefer: "return=minimal" }),
          body: JSON.stringify({ embedding: `[${embedding.join(",")}]`, embedded_at: new Date().toISOString(), embedding_provider: "google", embedding_status: "done" }),
        });
        res.status(200).json({ ok: true });
        return;
      } catch (e: any) {
        lastErr = e;
        console.error(`[embed:single] attempt ${attempt + 1} failed:`, e.message);
      }
    }
    throw new ApiError(502, lastErr?.message ?? "Embedding failed");
  }

  if (batch && brain_id) {
    if (typeof brain_id !== "string" || brain_id.length > 100) throw new ApiError(400, "Invalid brain_id");
    await requireBrainAccess(user.id, brain_id);

    // Audit #5: gate batch re-embeds against the user's monthly capture quota.
    // BYOK users still pass freely (checkAndIncrement short-circuits on hasByok).
    const settingsRes = await fetch(
      `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(user.id)}&select=plan,anthropic_key,openai_key,gemini_key&limit=1`,
      { headers: sbHeaders() },
    );
    const [settings] = settingsRes.ok ? await settingsRes.json() : [null];
    const plan: string = settings?.plan ?? "free";
    const hasKey = !!(settings?.anthropic_key || settings?.openai_key || settings?.gemini_key);
    let embedCheck: Awaited<ReturnType<typeof checkAndIncrement>>;
    try {
      embedCheck = await checkAndIncrement(user.id, "captures", plan, hasKey);
    } catch {
      throw new ApiError(503, "quota_unavailable");
    }
    if (!embedCheck.allowed) {
      res.status(429).json({
        error: "monthly_limit_reached",
        action: "captures",
        remaining: 0,
        upgrade_url: "/settings?tab=billing",
      });
      return;
    }

    const baseFilter = `brain_id=eq.${encodeURIComponent(brain_id)}&deleted_at=is.null`;
    const filter = force
      ? baseFilter
      : `${baseFilter}&or=(embedded_at.is.null,embedding_provider.neq.google)`;
    const entriesRes = await fetch(`${SB_URL}/rest/v1/entries?${filter}&select=id,title,content,tags&limit=25`, { headers: sbHeadersNoContent() });
    if (!entriesRes.ok) throw new ApiError(502, "Database error");
    const entries: any[] = await entriesRes.json();
    if (!entries.length) {
      res.status(200).json({ processed: 0, failed: 0, remaining: 0 });
      return;
    }
    let processed = 0;
    let failed = 0;
    const texts = entries.map(buildEntryText);
    try {
      const embeddings = await generateEmbeddingsBatch(texts, apiKey);
      await Promise.all(entries.map((entry: any, idx: number) =>
        fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry.id)}`, {
          method: "PATCH",
          headers: sbHeaders({ Prefer: "return=minimal" }),
          body: JSON.stringify({ embedding: `[${embeddings[idx].join(",")}]`, embedded_at: new Date().toISOString(), embedding_provider: "google", embedding_status: "done" }),
        }).then(async (r: Response) => {
          if (r.ok) { processed++; }
          else { const err = await r.text().catch(() => String(r.status)); console.error("[embed:patch]", entry.id, r.status, err); failed++; }
        }).catch((e: any) => { console.error("[embed:batch:patch]", entry.id, e.message); failed++; })
      ));
    } catch (e: any) {
      console.error("[embed:batch]", e.message);
      throw new ApiError(502, e.message);
    }
    const freshCountRes = await fetch(`${SB_URL}/rest/v1/entries?${filter}&select=id`, { headers: sbHeadersNoContent({ Prefer: "count=exact" }) });
    const freshRemaining = parseInt(freshCountRes.headers.get("content-range")?.split("/")?.[1] || "0", 10);
    res.status(200).json({ processed, failed, remaining: isNaN(freshRemaining) ? 0 : freshRemaining });
    return;
  }

  throw new ApiError(400, "Provide either entry_id or { brain_id, batch: true }");
}
