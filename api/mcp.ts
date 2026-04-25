/**
 * POST /api/mcp — EverionMind MCP server (JSON-RPC 2.0 over HTTP)
 *
 * Authentication: Authorization: Bearer em_<raw_key>
 * The raw key is SHA-256 hashed and compared against user_api_keys.key_hash.
 *
 * Knowledge base tools:
 *   retrieve_memory   — full RAG retrieval (embed → vector → expand → graph boost)
 *   get_upcoming      — entries with due/deadline/expiry dates in the next N days
 *   get_entry         — fetch a single entry by ID
 *   create_entry      — create a new entry with embedding (use for "save this to Everion")
 *   search_entries    — low-level vector search (use retrieve_memory for best results)
 */
import { randomUUID } from "crypto";
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { resolveApiKey } from "./_lib/resolveApiKey.js";
import { generateEmbedding, buildEntryText } from "./_lib/generateEmbedding.js";
import { retrieveEntries, rebuildConceptGraph } from "./_lib/retrievalCore.js";
import { scanGmailForUser, type GmailPreferences } from "./_lib/gmailScan.js";
import { enrichInline, enrichBrain } from "./_lib/enrich.js";
import { checkIdempotency, recordIdempotency } from "./_lib/idempotency.js";
import { checkAndIncrement } from "./_lib/usage.js";
import { getReqId, createLogger } from "./_lib/logger.js";
const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();

const hdrs = (extra: Record<string, string> = {}): Record<string, string> => ({
  "Content-Type": "application/json",
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  ...extra,
});

// ── MCP tool definitions ──────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "retrieve_memory",
    description: "Full semantic retrieval from the user's brain. Uses embedding + vector search + keyword expansion + graph boost to return the most relevant entries with complete metadata. Use this when the user asks about something stored in their knowledge base.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language question or topic to search for" },
        limit: { type: "number", description: "Max entries to return (1–50, default 15)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_upcoming",
    description: "Return entries with upcoming due dates, deadlines, expiry dates, or event dates. Use this when the user asks what is coming up, what is due soon, or what is expiring.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Look-ahead window in days (1–365, default 30)" },
      },
      required: [],
    },
  },
  {
    name: "get_entry",
    description: "Fetch a single entry by its UUID.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Entry UUID" } },
      required: ["id"],
    },
  },
  {
    name: "create_entry",
    description: "Save new information to the user's knowledge base. Use this when the user says things like 'add this to Everion', 'save this note', 'remember that', 'store this phone number', or 'add this idea to my memory'.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short descriptive title (max 200 chars)" },
        content: { type: "string", description: "Full content to store" },
        type: { type: "string", description: "Entry type: note, person, recipe, task, event, document, idea, contact. Defaults to note." },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags for categorisation" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "search_entries",
    description: "Low-level vector-only search. Prefer retrieve_memory for most queries — it has better coverage. Use this only when you need raw similarity scores.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "update_entry",
    description: "Update an existing entry's title, content, tags, or type. Use this after the user approves a suggested edit, merge target, or data correction. Regenerates the embedding automatically when content changes.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Entry UUID to update" },
        title: { type: "string", description: "New title (optional)" },
        content: { type: "string", description: "New content (optional)" },
        type: { type: "string", description: "New entry type (optional)" },
        tags: { type: "array", items: { type: "string" }, description: "New tags array (optional, replaces existing)" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_entry",
    description: "Soft-delete an entry (moves it to trash, recoverable). Use this after the user approves removing a duplicate, stale, or merged entry.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Entry UUID to delete" },
      },
      required: ["id"],
    },
  },
  {
    name: "gmail_sync",
    description: "Run a manual Gmail scan. Ingests high-signal threads (invoices, deadlines, appointments, signing requests, action items) from the user's Gmail and returns the newly-created entries. Honours the user's configured categories and ignore rules.",
    inputSchema: {
      type: "object",
      properties: {
        lookback_days: { type: "number", description: "Days to look back from now (1-30, default 7)" },
      },
      required: [],
    },
  },
  {
    name: "gmail_review_queue",
    description: "List recently-ingested Gmail entries pending user review, ranked by relevance_score. Use when the user asks what just came in from email or wants to triage new items.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max entries to return (1-50, default 20)" },
        since_hours: { type: "number", description: "Only include entries ingested in the last N hours (1-168, default 72)" },
      },
      required: [],
    },
  },
  {
    name: "gmail_contacts",
    description: "List the user's Gmail contacts ranked by interaction frequency. Each contact has interaction_count and last_interaction_at metadata. Use when the user asks who they talk to most or wants to find a specific correspondent.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max contacts to return (1-100, default 25)" },
      },
      required: [],
    },
  },
  {
    name: "gmail_ignore_pattern",
    description: "Add a natural-language rule to the user's Gmail ignore list. Future scans skip matching emails. Use after the user says things like 'stop importing emails from X' or 'don't scan newsletters'.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Natural-language rule, e.g. 'Ignore newsletters from substack.com'" },
      },
      required: ["pattern"],
    },
  },
];


// ── Plan / tier lookup ────────────────────────────────────────────────────────

async function getUserPlan(userId: string): Promise<{ plan: string; hasByok: boolean }> {
  const r = await fetch(
    `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(userId)}&select=plan,anthropic_key,gemini_key,openai_key&limit=1`,
    { headers: hdrs() },
  );
  if (!r.ok) return { plan: "starter", hasByok: false };
  const rows: any[] = await r.json();
  const row = rows[0] ?? {};
  return {
    plan: row.plan ?? "starter",
    hasByok: !!(row.anthropic_key || row.gemini_key || row.openai_key),
  };
}

// ── Tool implementations ──────────────────────────────────────────────────────

const DATE_FIELDS_MCP = ["due_date", "deadline", "expiry_date", "event_date"] as const;

async function retrieveMemory(brainId: string, query: string, limit = 15): Promise<unknown> {
  const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
  if (!GEMINI_API_KEY) throw new Error("Embedding not configured on server");

  const safeLimit = Math.min(Math.max(1, limit), 50);
  return retrieveEntries(query, brainId, GEMINI_API_KEY, safeLimit);
}

async function getUpcoming(brainId: string, days = 30): Promise<unknown> {
  const resolvedBrainId = brainId;
  const safeDays = Math.min(Math.max(1, days), 365);
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + safeDays * 86400000).toISOString().slice(0, 10);

  const fetches = await Promise.all(
    DATE_FIELDS_MCP.map(async (field) => {
      const params = new URLSearchParams({
        "brain_id": `eq.${resolvedBrainId}`,
        "deleted_at": "is.null",
        "type": "neq.secret",
        [`metadata->>${field}`]: `gte.${today}`,
        "select": "id,title,type,tags,content,metadata,created_at",
        "limit": "100",
      });
      const url = `${SB_URL}/rest/v1/entries?${params.toString()}&metadata->>${field}=lte.${future}`;
      const r = await fetch(url, { headers: hdrs() });
      if (!r.ok) return [];
      const rows: any[] = await r.json();
      return rows.map((e) => ({ ...e, _date_field: field }));
    }),
  );

  const seen = new Set<string>();
  const merged: any[] = [];
  for (const rows of fetches) {
    for (const row of rows) {
      if (!seen.has(row.id)) { seen.add(row.id); merged.push(row); }
    }
  }
  merged.sort((a, b) => {
    const aDate = DATE_FIELDS_MCP.map((f) => a.metadata?.[f]).filter(Boolean).sort()[0] ?? "9999";
    const bDate = DATE_FIELDS_MCP.map((f) => b.metadata?.[f]).filter(Boolean).sort()[0] ?? "9999";
    return aDate.localeCompare(bDate);
  });
  return { entries: merged, days: safeDays, from: today, to: future };
}

async function searchEntries(brainId: string, query: string): Promise<unknown> {

  if (!GEMINI_API_KEY) throw new Error("Embedding not configured on server");

  const embedding = await generateEmbedding(query, GEMINI_API_KEY);
  if (!embedding) {
    const fallback = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&type=neq.secret&select=id,title,content,type,tags,created_at&limit=10`,
      { headers: hdrs() },
    );
    return fallback.json();
  }

  const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/match_entries`, {
    method: "POST",
    headers: hdrs(),
    body: JSON.stringify({
      query_embedding: `[${embedding.join(",")}]`,
      p_brain_id: brainId,
      match_count: 10,
    }),
  });
  if (!rpcRes.ok) throw new Error("Search failed");
  return rpcRes.json();
}

async function getEntry(brainId: string, id: string): Promise<unknown> {
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&select=id,title,content,type,tags,metadata,created_at,updated_at,brain_id`,
    { headers: hdrs() },
  );
  if (!r.ok) throw new Error("Failed to fetch entry");
  const rows: any[] = await r.json();
  if (!rows.length) throw new Error("Entry not found");
  // Vault-typed entries are PIN-gated; MCP must not surface their content.
  if (rows[0].type === "secret") throw new Error("Entry is locked in Vault — open the app to view");
  return rows[0];
}

async function createEntry(
  userId: string,
  brainId: string,
  title: string,
  content: string,
  type = "note",
  tags: string[] = [],
): Promise<unknown> {
  const resolvedBrainId = brainId;

  const safeTitle = title.trim().slice(0, 200);
  const safeContent = content.slice(0, 200_000);
  const safeType = type.trim().slice(0, 50).toLowerCase() || "note";
  if (safeType === "secret") {
    throw new Error("Cannot create vault entries via MCP — use the in-app Vault to encrypt secrets");
  }
  const safeTags = Array.isArray(tags) ? tags.slice(0, 20).map((t) => String(t).slice(0, 50)) : [];

  // Generate embedding
  let embedding: number[] | null = null;
  if (GEMINI_API_KEY) {
    embedding = await generateEmbedding(buildEntryText({ title: safeTitle, content: safeContent, tags: safeTags }), GEMINI_API_KEY);
  }

  const id = (randomUUID as () => string)();
  const r = await fetch(`${SB_URL}/rest/v1/entries`, {
    method: "POST",
    headers: hdrs({ Prefer: "return=representation" }),
    body: JSON.stringify({
      id,
      user_id: userId,
      brain_id: resolvedBrainId,
      title: safeTitle,
      content: safeContent,
      type: safeType,
      tags: safeTags,
      embedding: embedding ? `[${embedding.join(",")}]` : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => String(r.status));
    throw new Error(`Failed to create entry: ${err}`);
  }
  const rows: any[] = await r.json();
  if (GEMINI_API_KEY) await rebuildConceptGraph(resolvedBrainId, GEMINI_API_KEY);
  return rows[0];
}

async function updateEntry(
  brainId: string,
  id: string,
  fields: { title?: string; content?: string; type?: string; tags?: string[] },
): Promise<unknown> {
  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&select=id,title,content,tags,type&limit=1`,
    { headers: hdrs() },
  );
  if (!entryRes.ok) throw new Error("Failed to fetch entry");
  const rows: any[] = await entryRes.json();
  if (!rows.length) throw new Error("Entry not found");
  if (rows[0].type === "secret") throw new Error("Entry is locked in Vault — open the app to edit");

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.title !== undefined) patch.title = fields.title.trim().slice(0, 200);
  if (fields.content !== undefined) patch.content = fields.content.slice(0, 200_000);
  if (fields.type !== undefined) {
    const newType = fields.type.trim().slice(0, 50).toLowerCase();
    if (newType === "secret") {
      throw new Error("Cannot retype an entry to 'secret' via MCP — move it through the in-app Vault flow");
    }
    patch.type = newType;
  }
  if (fields.tags !== undefined) patch.tags = fields.tags.slice(0, 20).map((t) => String(t).slice(0, 50));

  // Regenerate embedding if searchable fields changed
  if (GEMINI_API_KEY && (fields.title !== undefined || fields.content !== undefined || fields.tags !== undefined)) {
    const merged = {
      title: (patch.title ?? rows[0].title) as string,
      content: (patch.content ?? rows[0].content) as string,
      tags: (patch.tags ?? rows[0].tags ?? []) as string[],
    };
    const embedding = await generateEmbedding(buildEntryText(merged), GEMINI_API_KEY);
    if (embedding) patch.embedding = `[${embedding.join(",")}]`;
  }

  const r = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: hdrs({ Prefer: "return=representation" }),
      body: JSON.stringify(patch),
    },
  );
  if (!r.ok) throw new Error(`Update failed: ${await r.text().catch(() => r.status)}`);
  const updated: any[] = await r.json();
  if (GEMINI_API_KEY) await rebuildConceptGraph(brainId, GEMINI_API_KEY);
  return updated[0];
}

// ── Gmail tools ───────────────────────────────────────────────────────────────

async function gmailSync(userId: string, brainId: string, lookbackDays = 7): Promise<unknown> {
  const r = await fetch(
    `${SB_URL}/rest/v1/gmail_integrations?user_id=eq.${encodeURIComponent(userId)}&select=*`,
    { headers: hdrs() },
  );
  if (!r.ok) throw new Error("Failed to read Gmail integration");
  const rows: any[] = await r.json();
  if (!rows[0]) throw new Error("No Gmail integration connected for this user");
  const integ = rows[0];
  const days = Math.min(Math.max(1, lookbackDays), 30) as 1 | 7 | 30;
  const prefs: GmailPreferences = { ...(integ.preferences ?? {}), lookbackDays: days };
  const result = await scanGmailForUser({ ...integ, preferences: prefs }, true, brainId);
  return {
    created: result.created,
    sync_mode: result.debug.syncMode,
    threads_scanned: result.debug.threadsScanned,
    skipped_bulk: result.debug.skippedBulk,
    skipped_duplicates: result.debug.skippedDuplicates,
    skipped_low_score: result.debug.skippedLowScore,
    contacts_upserted: result.debug.contactsUpserted,
    entries: result.entries,
  };
}

async function gmailReviewQueue(userId: string, limit = 20, sinceHours = 72): Promise<unknown> {
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const safeHours = Math.min(Math.max(1, sinceHours), 168);
  const cutoff = new Date(Date.now() - safeHours * 3_600_000).toISOString();
  const url =
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}` +
    `&metadata->>source=eq.gmail` +
    `&deleted_at=is.null` +
    `&type=neq.contact` +
    `&created_at=gte.${cutoff}` +
    `&order=metadata->>relevance_score.desc.nullslast,created_at.desc` +
    `&limit=${safeLimit}` +
    `&select=id,title,content,type,tags,metadata,created_at`;
  const r = await fetch(url, { headers: hdrs() });
  if (!r.ok) throw new Error("Failed to fetch review queue");
  return { entries: await r.json(), since_hours: safeHours };
}

async function gmailContacts(userId: string, limit = 25): Promise<unknown> {
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const url =
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}` +
    `&type=eq.contact` +
    `&metadata->>source=eq.gmail` +
    `&deleted_at=is.null` +
    `&order=metadata->>interaction_count.desc.nullslast` +
    `&limit=${safeLimit}` +
    `&select=id,title,metadata,created_at`;
  const r = await fetch(url, { headers: hdrs() });
  if (!r.ok) throw new Error("Failed to fetch contacts");
  return { contacts: await r.json() };
}

async function gmailIgnorePattern(userId: string, pattern: string): Promise<unknown> {
  const trimmed = pattern.trim();
  if (!trimmed) throw new Error("pattern cannot be empty");
  const r = await fetch(
    `${SB_URL}/rest/v1/gmail_integrations?user_id=eq.${encodeURIComponent(userId)}&select=preferences`,
    { headers: hdrs() },
  );
  const rows: any[] = r.ok ? await r.json() : [];
  if (!rows[0]) throw new Error("No Gmail integration connected for this user");
  const prefs = rows[0].preferences ?? { categories: [], custom: "" };
  const existing = (prefs.custom ?? "").trim();
  const newCustom = existing ? `${existing}\n${trimmed}` : trimmed;
  const patchRes = await fetch(
    `${SB_URL}/rest/v1/gmail_integrations?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: hdrs(),
      body: JSON.stringify({ preferences: { ...prefs, custom: newCustom } }),
    },
  );
  if (!patchRes.ok) throw new Error("Failed to update preferences");
  return { ok: true, pattern: trimmed };
}

async function deleteEntry(brainId: string, id: string): Promise<unknown> {
  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&select=id,type&limit=1`,
    { headers: hdrs() },
  );
  if (!entryRes.ok) throw new Error("Failed to fetch entry");
  const rows: any[] = await entryRes.json();
  if (!rows.length) throw new Error("Entry not found");
  if (rows[0].type === "secret") throw new Error("Entry is locked in Vault — open the app to delete");

  const r = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: hdrs({ Prefer: "return=minimal" }),
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    },
  );
  if (!r.ok) throw new Error(`Delete failed: ${await r.text().catch(() => r.status)}`);
  return { id, deleted: true };
}

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────

function jsonRpcOk(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcErr(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function mcpToolResult(content: unknown) {
  return { content: [{ type: "text", text: typeof content === "string" ? content : JSON.stringify(content, null, 2) }] };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  const reqId = getReqId(req);
  res.setHeader("x-request-id", reqId);
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });

  // OAuth discovery
  if (req.query._wk) {
    return res.status(200).json({
      issuer: "https://everion.smashburgerbar.co.za",
      authorization_endpoint: "https://everion.smashburgerbar.co.za/authorize",
      token_endpoint: "https://everion.smashburgerbar.co.za/token",
      registration_endpoint: "https://everion.smashburgerbar.co.za/register",
      response_types_supported: ["token"],
      grant_types_supported: ["client_credentials"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  }

  // OAuth token endpoint — validate em_ key and echo it back as access token
  if (req.query._oauth === "token") {
    const authHeader = (req.headers["authorization"] as string) || "";
    const key = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const auth = key ? await resolveApiKey(key) : null;
    if (!auth) return res.status(401).json({ error: "invalid_client", error_description: "Invalid or missing API key" });
    return res.status(200).json({ access_token: key, token_type: "Bearer", expires_in: 86400 });
  }

  // OAuth dynamic client registration
  if (req.query._oauth === "register") {
    return res.status(201).json({ client_id: "everion-mcp-client", grant_types: ["client_credentials"], token_endpoint_auth_method: "none" });
  }

  // OAuth authorize endpoint — not used for client_credentials but required by discovery spec
  if (req.query._oauth === "authorize") {
    return res.status(400).json({ error: "unsupported_response_type", error_description: "Use client_credentials grant via the token endpoint" });
  }

  // MCP over HTTP uses POST for all requests
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Auth
  const authHeader = (req.headers["authorization"] as string) || "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!rawKey) return res.status(401).json(jsonRpcErr(null, -32001, "Missing Authorization header"));

  const auth = await resolveApiKey(rawKey);
  if (!auth) return res.status(401).json(jsonRpcErr(null, -32001, "Invalid or revoked API key"));

  const { userId, brainId } = auth;
  const { jsonrpc, id, method, params } = req.body || {};

  if (jsonrpc !== "2.0") return res.status(400).json(jsonRpcErr(id ?? null, -32600, "Invalid JSON-RPC version"));

  // ── initialize ──
  if (method === "initialize") {
    return res.status(200).json(jsonRpcOk(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "everionmind", version: "2.0.0" },
    }));
  }

  // ── tools/list ──
  if (method === "tools/list") {
    return res.status(200).json(jsonRpcOk(id, { tools: TOOLS }));
  }

  // ── tools/call ──
  if (method === "tools/call") {
    const toolName = params?.name as string;
    const args = params?.arguments || {};
    const log = createLogger(reqId, { user_id: userId, tool: toolName });

    try {
      let result: unknown;

      if (toolName === "retrieve_memory") {
        if (!args.query) return res.status(200).json(jsonRpcErr(id, -32602, "query is required"));
        result = await retrieveMemory(brainId, args.query, args.limit);
      } else if (toolName === "get_upcoming") {
        result = await getUpcoming(brainId, args.days);
      } else if (toolName === "search_entries") {
        if (!args.query) return res.status(200).json(jsonRpcErr(id, -32602, "query is required"));
        result = await searchEntries(brainId, args.query);
      } else if (toolName === "get_entry") {
        if (!args.id) return res.status(200).json(jsonRpcErr(id, -32602, "id is required"));
        result = await getEntry(brainId, args.id);
      } else if (toolName === "create_entry") {
        if (!args.title || !args.content) {
          return res.status(200).json(jsonRpcErr(id, -32602, "title and content are required"));
        }
        // Per-tool rate limit: 10 create_entry calls/min per IP
        if (!(await rateLimit(req, 10, 60_000, "create_entry"))) {
          return res.status(200).json(jsonRpcErr(id, -32000, "Rate limit exceeded for create_entry (10/min)"));
        }
        // Quota check: count against monthly captures budget
        const { plan, hasByok } = await getUserPlan(userId);
        let quota: Awaited<ReturnType<typeof checkAndIncrement>>;
        try {
          quota = await checkAndIncrement(userId, "captures", plan, hasByok);
        } catch {
          return res.status(200).json(jsonRpcErr(id, -32000, "Quota service unavailable — try again"));
        }
        if (!quota.allowed) {
          log.warn("quota_exceeded", { plan, action: "captures" });
          return res.status(200).json(jsonRpcErr(id, -32000, `Monthly capture limit reached (${plan} plan)`));
        }
        const iKey = req.headers["idempotency-key"] as string | undefined;
        if (iKey) {
          const existingId = await checkIdempotency(userId, iKey);
          if (existingId) { result = { id: existingId, idempotent_replay: true }; }
        }
        if (!result) {
          result = await createEntry(userId, brainId, args.title, args.content, args.type, args.tags);
          if ((result as any)?.id) enrichInline((result as any).id, userId).catch(() => {});
          if (iKey && (result as any)?.id) recordIdempotency(userId, iKey, (result as any).id).catch(() => {});
        }
        log.info("create_entry_ok", { entry_id: (result as any)?.id });
      } else if (toolName === "update_entry") {
        if (!args.id) return res.status(200).json(jsonRpcErr(id, -32602, "id is required"));
        if (args.title === undefined && args.content === undefined && args.type === undefined && args.tags === undefined) {
          return res.status(200).json(jsonRpcErr(id, -32602, "At least one field to update is required"));
        }
        result = await updateEntry(brainId, args.id, { title: args.title, content: args.content, type: args.type, tags: args.tags });
        enrichInline(args.id, userId).catch(() => {});
      } else if (toolName === "delete_entry") {
        if (!args.id) return res.status(200).json(jsonRpcErr(id, -32602, "id is required"));
        result = await deleteEntry(brainId, args.id);
      } else if (toolName === "gmail_sync") {
        // Per-tool rate limit: 5 gmail_sync calls/min per IP — prevents scan DoS
        if (!(await rateLimit(req, 5, 60_000, "gmail_sync"))) {
          return res.status(200).json(jsonRpcErr(id, -32000, "Rate limit exceeded for gmail_sync (5/min)"));
        }
        log.info("gmail_sync_start", { lookback_days: args.lookback_days });
        result = await gmailSync(userId, brainId, args.lookback_days);
        enrichBrain(userId, brainId, 10).catch(() => {});
        log.info("gmail_sync_ok", { created: (result as any)?.created });
      } else if (toolName === "gmail_review_queue") {
        result = await gmailReviewQueue(userId, args.limit, args.since_hours);
      } else if (toolName === "gmail_contacts") {
        result = await gmailContacts(userId, args.limit);
      } else if (toolName === "gmail_ignore_pattern") {
        if (!args.pattern) return res.status(200).json(jsonRpcErr(id, -32602, "pattern is required"));
        result = await gmailIgnorePattern(userId, args.pattern);
      } else {
        return res.status(200).json(jsonRpcErr(id, -32601, `Unknown tool: ${toolName}`));
      }

      return res.status(200).json(jsonRpcOk(id, mcpToolResult(result)));
    } catch (err: any) {
      return res.status(200).json(jsonRpcErr(id, -32603, err.message || "Internal error"));
    }
  }

  return res.status(200).json(jsonRpcErr(id ?? null, -32601, `Unknown method: ${method}`));
}
