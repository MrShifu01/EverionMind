/**
 * POST /api/mcp — EverionMind MCP server (JSON-RPC 2.0 over HTTP)
 *
 * Authentication: Authorization: Bearer em_<raw_key>
 * The raw key is SHA-256 hashed and compared against user_api_keys.key_hash.
 *
 * Knowledge base tools:
 *   list_brains      — list the user's brains
 *   search_entries   — low-level semantic search within a brain
 *   get_entry        — fetch a single entry by ID
 *   create_entry     — create a new entry with embedding
 */
import { createHash, randomUUID } from "crypto";
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { generateEmbedding, buildEntryText } from "./_lib/generateEmbedding.js";
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
  // ── Knowledge base management ──────────────────────────────────────────────
  {
    name: "list_brains",
    description: "List all brains (knowledge bases) for the authenticated user.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "search_entries",
    description: "Semantic search across entries in a brain.",
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
    name: "get_entry",
    description: "Fetch a single entry by ID.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Entry UUID" } },
      required: ["id"],
    },
  },
  {
    name: "create_entry",
    description: "Create a new entry in a brain. Generates an embedding for semantic search.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Entry title (max 200 chars)" },
        content: { type: "string", description: "Entry content" },
        brain_id: { type: "string", description: "Brain UUID to save into" },
        type: { type: "string", description: "Entry type (e.g. note, person, recipe). Defaults to note." },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags" },
      },
      required: ["title", "content", "brain_id"],
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
