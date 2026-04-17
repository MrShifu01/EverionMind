/**
 * POST /api/mcp — EverionMind MCP server (JSON-RPC 2.0 over HTTP)
 *
 * Authentication: Authorization: Bearer em_<raw_key>
 * The raw key is SHA-256 hashed and compared against user_api_keys.key_hash.
 *
 * Knowledge base tools:
 *   list_brains       — list the user's brains
 *   retrieve_memory   — full RAG retrieval (embed → vector → expand → graph boost)
 *   get_upcoming      — entries with due/deadline/expiry dates in the next N days
 *   get_entry         — fetch a single entry by ID
 *   create_entry      — create a new entry with embedding (use for "save this to Everion")
 *   search_entries    — low-level vector search (use retrieve_memory for best results)
 */
import { createHash, randomUUID } from "crypto";
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { generateEmbedding, buildEntryText } from "./_lib/generateEmbedding.js";
import { retrieveEntries } from "./_lib/retrievalCore.js";
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
    name: "list_brains",
    description: "List all brains (knowledge bases) for the authenticated user. Call this first to get brain IDs needed by other tools.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "retrieve_memory",
    description: "Full semantic retrieval from a brain. Uses embedding + vector search + keyword expansion + graph boost to return the most relevant entries with complete metadata. Use this when the user asks about something stored in their knowledge base.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language question or topic to search for" },
        brain_id: { type: "string", description: "Brain UUID to search (from list_brains)" },
        limit: { type: "number", description: "Max entries to return (1–50, default 15)" },
      },
      required: ["query", "brain_id"],
    },
  },
  {
    name: "get_upcoming",
    description: "Return entries with upcoming due dates, deadlines, expiry dates, or event dates. Use this when the user asks what is coming up, what is due soon, or what is expiring.",
    inputSchema: {
      type: "object",
      properties: {
        brain_id: { type: "string", description: "Brain UUID (from list_brains)" },
        days: { type: "number", description: "Look-ahead window in days (1–365, default 30)" },
      },
      required: ["brain_id"],
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
    description: "Save new information to the user's knowledge base. Use this when the user says things like 'add this to Everion', 'save this note', 'remember that', 'store this phone number', or 'add this idea to my memory'. Always call list_brains first to get the brain_id.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short descriptive title (max 200 chars)" },
        content: { type: "string", description: "Full content to store" },
        brain_id: { type: "string", description: "Brain UUID to save into (from list_brains)" },
        type: { type: "string", description: "Entry type: note, person, recipe, task, event, document, idea, contact. Defaults to note." },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags for categorisation" },
      },
      required: ["title", "content", "brain_id"],
    },
  },
  {
    name: "search_entries",
    description: "Low-level vector-only search. Prefer retrieve_memory for most queries — it has better coverage. Use this only when you need raw similarity scores.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language search query" },
        brain_id: { type: "string", description: "Brain UUID to search. Uses first brain if omitted." },
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
];

// ── Auth ──────────────────────────────────────────────────────────────────────

async function resolveUserFromKey(rawKey: string): Promise<{ userId: string; keyId: string } | null> {
  if (!rawKey.startsWith("em_")) return null;
  const hash = createHash("sha256").update(rawKey).digest("hex");

  const r = await fetch(
    `${SB_URL}/rest/v1/user_api_keys?key_hash=eq.${encodeURIComponent(hash)}&revoked_at=is.null&select=id,user_id&limit=1`,
    { headers: hdrs() },
  );
  if (!r.ok) return null;
  const rows: any[] = await r.json();
  if (!rows.length) return null;

  // Update last_used_at (fire and forget)
  fetch(
    `${SB_URL}/rest/v1/user_api_keys?id=eq.${encodeURIComponent(rows[0].id)}`,
    {
      method: "PATCH",
      headers: hdrs({ Prefer: "return=minimal" }),
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    },
  ).catch(() => {});

  return { userId: rows[0].user_id, keyId: rows[0].id };
}

// ── Tool implementations ──────────────────────────────────────────────────────

const DATE_FIELDS_MCP = ["due_date", "deadline", "expiry_date", "event_date"] as const;

async function retrieveMemory(userId: string, query: string, brainId: string, limit = 15): Promise<unknown> {
  const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
  if (!GEMINI_API_KEY) throw new Error("Embedding not configured on server");

  // Verify brain ownership
  const access = await fetch(
    `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brainId)}&owner_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
    { headers: hdrs() },
  );
  const owned: any[] = await access.json();
  if (!owned.length) throw new Error("Brain not found or access denied");

  const safeLimit = Math.min(Math.max(1, limit), 50);
  return retrieveEntries(query, brainId, GEMINI_API_KEY, safeLimit);
}

async function getUpcoming(userId: string, brainId: string, days = 30): Promise<unknown> {
  // Verify brain ownership
  const access = await fetch(
    `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brainId)}&owner_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
    { headers: hdrs() },
  );
  const owned: any[] = await access.json();
  if (!owned.length) throw new Error("Brain not found or access denied");

  const safeDays = Math.min(Math.max(1, days), 365);
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + safeDays * 86400000).toISOString().slice(0, 10);

  const fetches = await Promise.all(
    DATE_FIELDS_MCP.map(async (field) => {
      const params = new URLSearchParams({
        "brain_id": `eq.${brainId}`,
        "deleted_at": "is.null",
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

async function listBrains(userId: string): Promise<unknown> {
  const r = await fetch(
    `${SB_URL}/rest/v1/brains?owner_id=eq.${encodeURIComponent(userId)}&select=id,name,type,created_at&order=created_at.asc`,
    { headers: hdrs() },
  );
  if (!r.ok) throw new Error("Failed to fetch brains");
  return r.json();
}

async function searchEntries(userId: string, query: string, brainId?: string): Promise<unknown> {
  // Resolve brain_id — use provided or fall back to user's first brain
  let resolvedBrainId = brainId;
  if (!resolvedBrainId) {
    const br = await fetch(
      `${SB_URL}/rest/v1/brains?owner_id=eq.${encodeURIComponent(userId)}&select=id&order=created_at.asc&limit=1`,
      { headers: hdrs() },
    );
    const brains: any[] = await br.json();
    if (!brains.length) throw new Error("No brains found");
    resolvedBrainId = brains[0].id;
  }

  // Verify the user owns this brain
  const access = await fetch(
    `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(resolvedBrainId!)}&owner_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
    { headers: hdrs() },
  );
  const owned: any[] = await access.json();
  if (!owned.length) throw new Error("Brain not found or access denied");

  if (!GEMINI_API_KEY) throw new Error("Embedding not configured on server");

  const embedding = await generateEmbedding(query, GEMINI_API_KEY);
  if (!embedding) {
    // Fall back to keyword search
    const fallback = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(resolvedBrainId!)}&deleted_at=is.null&select=id,title,content,type,tags,created_at&limit=10`,
      { headers: hdrs() },
    );
    return fallback.json();
  }

  const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/match_entries`, {
    method: "POST",
    headers: hdrs(),
    body: JSON.stringify({
      query_embedding: embedding,
      match_threshold: 0.3,
      match_count: 10,
      filter_brain_id: resolvedBrainId,
    }),
  });
  if (!rpcRes.ok) throw new Error("Search failed");
  return rpcRes.json();
}

async function getEntry(userId: string, id: string): Promise<unknown> {
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=id,title,content,type,tags,metadata,created_at,updated_at,brain_id`,
    { headers: hdrs() },
  );
  if (!r.ok) throw new Error("Failed to fetch entry");
  const rows: any[] = await r.json();
  if (!rows.length) throw new Error("Entry not found");

  // Verify the entry belongs to a brain the user owns
  const brainCheck = await fetch(
    `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(rows[0].brain_id)}&owner_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
    { headers: hdrs() },
  );
  const owned: any[] = await brainCheck.json();
  if (!owned.length) throw new Error("Access denied");

  return rows[0];
}

async function createEntry(
  userId: string,
  title: string,
  content: string,
  brainId: string,
  type = "note",
  tags: string[] = [],
): Promise<unknown> {
  // Verify brain ownership
  const brainCheck = await fetch(
    `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brainId)}&owner_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
    { headers: hdrs() },
  );
  const owned: any[] = await brainCheck.json();
  if (!owned.length) throw new Error("Brain not found or access denied");

  const safeTitle = title.trim().slice(0, 200);
  const safeContent = content.slice(0, 10000);
  const safeType = type.trim().slice(0, 50).toLowerCase() || "note";
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
      brain_id: brainId,
      title: safeTitle,
      content: safeContent,
      type: safeType,
      tags: safeTags,
      embedding,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => String(r.status));
    throw new Error(`Failed to create entry: ${err}`);
  }
  const rows: any[] = await r.json();
  return rows[0];
}

async function updateEntry(
  userId: string,
  id: string,
  fields: { title?: string; content?: string; type?: string; tags?: string[] },
): Promise<unknown> {
  // Fetch entry to verify ownership via brain
  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=id,brain_id,title,content,tags&limit=1`,
    { headers: hdrs() },
  );
  if (!entryRes.ok) throw new Error("Failed to fetch entry");
  const rows: any[] = await entryRes.json();
  if (!rows.length) throw new Error("Entry not found");

  const brainCheck = await fetch(
    `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(rows[0].brain_id)}&owner_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
    { headers: hdrs() },
  );
  const owned: any[] = await brainCheck.json();
  if (!owned.length) throw new Error("Access denied");

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.title !== undefined) patch.title = fields.title.trim().slice(0, 200);
  if (fields.content !== undefined) patch.content = fields.content.slice(0, 10000);
  if (fields.type !== undefined) patch.type = fields.type.trim().slice(0, 50).toLowerCase();
  if (fields.tags !== undefined) patch.tags = fields.tags.slice(0, 20).map((t) => String(t).slice(0, 50));

  // Regenerate embedding if searchable fields changed
  if (GEMINI_API_KEY && (fields.title !== undefined || fields.content !== undefined || fields.tags !== undefined)) {
    const merged = {
      title: (patch.title ?? rows[0].title) as string,
      content: (patch.content ?? rows[0].content) as string,
      tags: (patch.tags ?? rows[0].tags ?? []) as string[],
    };
    const embedding = await generateEmbedding(buildEntryText(merged), GEMINI_API_KEY);
    if (embedding) patch.embedding = embedding;
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
  return updated[0];
}

async function deleteEntry(userId: string, id: string): Promise<unknown> {
  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=id,brain_id&limit=1`,
    { headers: hdrs() },
  );
  if (!entryRes.ok) throw new Error("Failed to fetch entry");
  const rows: any[] = await entryRes.json();
  if (!rows.length) throw new Error("Entry not found");

  const brainCheck = await fetch(
    `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(rows[0].brain_id)}&owner_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
    { headers: hdrs() },
  );
  const owned: any[] = await brainCheck.json();
  if (!owned.length) throw new Error("Access denied");

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

  // MCP over HTTP uses POST for all requests
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });

  // Auth
  const authHeader = (req.headers["authorization"] as string) || "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!rawKey) return res.status(401).json(jsonRpcErr(null, -32001, "Missing Authorization header"));

  const auth = await resolveUserFromKey(rawKey);
  if (!auth) return res.status(401).json(jsonRpcErr(null, -32001, "Invalid or revoked API key"));

  const { userId } = auth;
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

    try {
      let result: unknown;

      if (toolName === "list_brains") {
        result = await listBrains(userId);
      } else if (toolName === "retrieve_memory") {
        if (!args.query) return res.status(200).json(jsonRpcErr(id, -32602, "query is required"));
        if (!args.brain_id) return res.status(200).json(jsonRpcErr(id, -32602, "brain_id is required"));
        result = await retrieveMemory(userId, args.query, args.brain_id, args.limit);
      } else if (toolName === "get_upcoming") {
        if (!args.brain_id) return res.status(200).json(jsonRpcErr(id, -32602, "brain_id is required"));
        result = await getUpcoming(userId, args.brain_id, args.days);
      } else if (toolName === "search_entries") {
        if (!args.query) return res.status(200).json(jsonRpcErr(id, -32602, "query is required"));
        result = await searchEntries(userId, args.query, args.brain_id);
      } else if (toolName === "get_entry") {
        if (!args.id) return res.status(200).json(jsonRpcErr(id, -32602, "id is required"));
        result = await getEntry(userId, args.id);
      } else if (toolName === "create_entry") {
        if (!args.title || !args.content || !args.brain_id) {
          return res.status(200).json(jsonRpcErr(id, -32602, "title, content, and brain_id are required"));
        }
        result = await createEntry(userId, args.title, args.content, args.brain_id, args.type, args.tags);
      } else if (toolName === "update_entry") {
        if (!args.id) return res.status(200).json(jsonRpcErr(id, -32602, "id is required"));
        if (args.title === undefined && args.content === undefined && args.type === undefined && args.tags === undefined) {
          return res.status(200).json(jsonRpcErr(id, -32602, "At least one field to update is required"));
        }
        result = await updateEntry(userId, args.id, { title: args.title, content: args.content, type: args.type, tags: args.tags });
      } else if (toolName === "delete_entry") {
        if (!args.id) return res.status(200).json(jsonRpcErr(id, -32602, "id is required"));
        result = await deleteEntry(userId, args.id);
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
