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
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { resolveApiKey } from "./_lib/resolveApiKey.js";
import { checkBrainAccess, type BrainRole } from "./_lib/checkBrainAccess.js";
import { generateEmbedding, buildEntryText } from "./_lib/generateEmbedding.js";
import { retrieveEntries, rebuildConceptGraph } from "./_lib/retrievalCore.js";
import { getUpcomingEntries } from "./_lib/getUpcoming.js";
import { enrichInline } from "./_lib/enrich.js";
import { reserveIdempotency, finalizeIdempotency } from "./_lib/idempotency.js";
import { checkAndIncrement } from "./_lib/usage.js";
import { getReqId, createLogger } from "./_lib/logger.js";
import { mergeEntriesOneShot } from "./_lib/mergeEntries.js";
import { loadUserAiContext } from "./_lib/loadUserAiContext.js";
import { ApiError } from "./_lib/withAuth.js";
import { optionalBodyObject } from "./_lib/requestBody.js";
import { sbHeaders } from "./_lib/sbHeaders.js";
import { writeAuditLog } from "./_lib/auditLog.js";
const SB_URL = process.env.SUPABASE_URL!;
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();

const hdrs = sbHeaders;

type McpAuth = { userId: string; keyId: string; brainId: string };

function mcpTokenSecret(): string {
  const secret = process.env.MCP_ACCESS_TOKEN_SECRET || process.env.OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error("MCP_ACCESS_TOKEN_SECRET is required");
  }
  return secret;
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function signMcpAccessToken(auth: McpAuth): string {
  const payload = b64url(
    JSON.stringify({
      userId: auth.userId,
      keyId: auth.keyId,
      brainId: auth.brainId,
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    }),
  );
  const sig = createHmac("sha256", mcpTokenSecret()).update(payload).digest("base64url");
  return `mcp_${payload}.${sig}`;
}

async function verifyMcpAccessToken(token: string): Promise<McpAuth | null> {
  if (!token.startsWith("mcp_")) return null;
  const rest = token.slice(4);
  const dot = rest.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = rest.slice(0, dot);
  const sig = rest.slice(dot + 1);
  const expected = createHmac("sha256", mcpTokenSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let parsed: { userId?: unknown; keyId?: unknown; brainId?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof parsed.userId !== "string" ||
    typeof parsed.keyId !== "string" ||
    typeof parsed.brainId !== "string" ||
    typeof parsed.exp !== "number" ||
    parsed.exp < Math.floor(Date.now() / 1000)
  ) {
    return null;
  }
  // DB-backed revocation: signature + exp pass, but if the underlying
  // user_api_keys row was revoked or deleted, the token must not work.
  // Without this check, a leaked mcp_ token stays valid for 24h after
  // its em_ key is revoked.
  const keyRes = await fetch(
    `${SB_URL}/rest/v1/user_api_keys?id=eq.${encodeURIComponent(parsed.keyId)}&revoked_at=is.null&select=id,user_id&limit=1`,
    { headers: sbHeaders() },
  );
  if (!keyRes.ok) return null;
  const rows: any[] = await keyRes.json();
  if (!rows.length || rows[0].user_id !== parsed.userId) return null;
  return { userId: parsed.userId, keyId: parsed.keyId, brainId: parsed.brainId };
}

async function resolveMcpBearer(raw: string): Promise<McpAuth | null> {
  if (raw.startsWith("mcp_")) return verifyMcpAccessToken(raw);
  return resolveApiKey(raw);
}

// ── MCP tool definitions ──────────────────────────────────────────────────────

// brain_id parameter description, reused across tools that accept it
const BRAIN_ID_PARAM_DESC =
  "Optional brain UUID to target. If omitted, falls back to the API key's default brain — which may not be the user's personal brain. Call list_brains and confirm with the user before write tools when they have multiple brains.";

const TOOLS = [
  {
    name: "list_brains",
    description:
      "List every brain the API-key user can access (owned + member). Returns each brain's id, name, and role. **Call this first** any time you're about to create/update/delete an entry and the user has more than one brain — the default brain is whichever the API key resolves to and is often NOT the user's personal brain. Pass the chosen brain's id back via the brain_id parameter on the next tool call.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "retrieve_memory",
    description:
      "Full semantic retrieval from the user's brain. Returns importantMemories (canonical user-kept facts), entries (vector + ranked keyword results), and concepts. Prefer importantMemories for direct fact questions like ID numbers, phone numbers, dates, codes, and account details; use entries for broader context. Use this when the user asks about something stored in their knowledge base.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language question or topic to search for" },
        limit: { type: "number", description: "Max entries to return (1–50, default 15)" },
        brain_id: { type: "string", description: BRAIN_ID_PARAM_DESC },
      },
      required: ["query"],
    },
  },
  {
    name: "get_upcoming",
    description:
      "Return entries with upcoming due dates, deadlines, expiry dates, or event dates. Use this when the user asks what is coming up, what is due soon, or what is expiring.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Look-ahead window in days (1–365, default 30)" },
        brain_id: { type: "string", description: BRAIN_ID_PARAM_DESC },
      },
      required: [],
    },
  },
  {
    name: "get_entry",
    description: "Fetch a single entry by its UUID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Entry UUID" },
        brain_id: { type: "string", description: BRAIN_ID_PARAM_DESC },
      },
      required: ["id"],
    },
  },
  {
    name: "create_entry",
    description:
      "Save new information to the user's knowledge base. Use this when the user says things like 'add this to Everion', 'save this note', 'remember that', 'store this phone number', or 'add this idea to my memory'. **If the user has multiple brains, call list_brains FIRST and confirm with them which brain to save into** — the default brain is whichever the API key resolves to and is often NOT the user's personal brain. For Someday/Maybe items (no date, GTD-style 'maybe later' list — phrases like 'add to my someday list', 'add to someday', 'put this in someday', 'for someday', 'maybe later', 'no date'), pass type='someday'. To bulk-add a checklist into Someday, call create_entry once per item with type='someday'. **For dated tasks (anything that should appear in the user's Schedule view) you MUST set scheduled_for to YYYY-MM-DD** — putting the date only in content is not enough; the Schedule view filters on metadata. Use due_date for hard deadlines, deadline for legal/contract dates, event_date for calendar events.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short descriptive title (max 200 chars)" },
        content: { type: "string", description: "Full content to store" },
        type: {
          type: "string",
          description:
            "Entry type: note, person, recipe, task, todo, someday (no-date GTD inbox), event, document, idea, contact. Defaults to note. Use 'someday' for items the user wants to capture without committing to a date.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional tags for categorisation",
        },
        scheduled_for: {
          type: "string",
          description:
            "ISO date YYYY-MM-DD when the task/event should appear in the user's Schedule. Required for any dated task or event — the Schedule view does NOT parse content text. Shortcut for setting metadata.scheduled_for.",
        },
        due_date: {
          type: "string",
          description: "ISO date YYYY-MM-DD hard deadline. Shortcut for metadata.due_date.",
        },
        deadline: {
          type: "string",
          description:
            "ISO date YYYY-MM-DD legal/contract deadline. Shortcut for metadata.deadline.",
        },
        event_date: {
          type: "string",
          description:
            "ISO date YYYY-MM-DD calendar event date. Shortcut for metadata.event_date.",
        },
        metadata: {
          type: "object",
          description:
            "Free-form metadata merged onto the entry. Use this for less common keys (status, priority, location, url, contact_name, etc.). The four date shortcuts above take precedence if both are passed.",
        },
        brain_id: { type: "string", description: BRAIN_ID_PARAM_DESC },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "search_entries",
    description:
      "Low-level vector-only search. Prefer retrieve_memory for most queries — it has better coverage. Use this only when you need raw similarity scores.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language search query" },
        brain_id: { type: "string", description: BRAIN_ID_PARAM_DESC },
      },
      required: ["query"],
    },
  },
  {
    name: "update_entry",
    description:
      "Update an existing entry's title, content, tags, type, or metadata. Use this after the user approves a suggested edit, merge target, or data correction. Regenerates the embedding automatically when content changes. Use the date shortcuts (scheduled_for, due_date, deadline, event_date) to put a task on the user's Schedule view, or `metadata` for any other field.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Entry UUID to update" },
        title: { type: "string", description: "New title (optional)" },
        content: { type: "string", description: "New content (optional)" },
        type: { type: "string", description: "New entry type (optional)" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "New tags array (optional, replaces existing)",
        },
        scheduled_for: {
          type: "string",
          description:
            "ISO date YYYY-MM-DD when the task should appear on the Schedule. Sets metadata.scheduled_for.",
        },
        due_date: {
          type: "string",
          description: "ISO date YYYY-MM-DD hard deadline. Sets metadata.due_date.",
        },
        deadline: {
          type: "string",
          description: "ISO date YYYY-MM-DD legal/contract deadline. Sets metadata.deadline.",
        },
        event_date: {
          type: "string",
          description: "ISO date YYYY-MM-DD calendar event date. Sets metadata.event_date.",
        },
        metadata: {
          type: "object",
          description:
            "Free-form metadata to merge onto the entry. Existing keys are overwritten by supplied keys; keys not supplied are preserved.",
        },
        brain_id: { type: "string", description: BRAIN_ID_PARAM_DESC },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_entry",
    description:
      "Soft-delete an entry (moves it to trash, recoverable). Use this after the user approves removing a duplicate, stale, or merged entry.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Entry UUID to delete" },
        brain_id: { type: "string", description: BRAIN_ID_PARAM_DESC },
      },
      required: ["id"],
    },
  },
  {
    name: "merge_entries",
    description:
      "Combine 2-8 user-owned entries into a single LLM-synthesised entry, then soft-delete the sources. Useful for collapsing duplicates, consolidating related notes, or merging contact records. All entries must be in the same brain and none can be vault (type='secret'). Returns the merged row including its new id.",
    inputSchema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 8,
          description: "UUIDs of the entries to merge (2-8)",
        },
      },
      required: ["ids"],
    },
  },
];

// ── Tier / BYOK lookup ────────────────────────────────────────────────────────
//
// Tier is read from user_profiles.tier (single source of truth). BYOK
// presence is checked across the legacy user_ai_settings columns so MCP
// API-key calls inherit the same tier check the web UI uses.

async function getUserPlan(userId: string): Promise<{ tier: string; hasByok: boolean }> {
  const { tier, settings } = await loadUserAiContext(userId);
  return {
    tier,
    hasByok: !!(settings.anthropic_key || settings.gemini_key || settings.openai_key),
  };
}

// ── Tool implementations ──────────────────────────────────────────────────────

// Resolve which brain a tool call should target. If args.brain_id is set,
// validate the user has the required role and return it. Otherwise fall
// back to the API-key default brain. Throws ApiError on access denial so
// callers get a clean JSON-RPC error frame instead of a 500.
async function resolveTargetBrain(
  args: { brain_id?: unknown },
  defaultBrainId: string,
  userId: string,
  requiredRoles: BrainRole[] = ["owner", "member"],
): Promise<string> {
  const requested = typeof args.brain_id === "string" && args.brain_id ? args.brain_id : null;
  if (!requested) return defaultBrainId;
  const access = await checkBrainAccess(userId, requested);
  if (!access) {
    throw new ApiError(
      403,
      `No access to brain ${requested}. Call list_brains to see your brains.`,
    );
  }
  if (requiredRoles.length && !requiredRoles.includes(access.role)) {
    throw new ApiError(
      403,
      `This action requires ${requiredRoles.join(" or ")} role on the brain (you have ${access.role}).`,
    );
  }
  return requested;
}

async function listBrains(userId: string): Promise<unknown> {
  const ownedR = await fetch(
    `${SB_URL}/rest/v1/brains?owner_id=eq.${encodeURIComponent(userId)}&select=id,name&order=created_at.asc`,
    { headers: hdrs() },
  );
  const owned: any[] = ownedR.ok ? await ownedR.json() : [];
  const memberR = await fetch(
    `${SB_URL}/rest/v1/brain_members?user_id=eq.${encodeURIComponent(userId)}&select=role,brains(id,name)`,
    { headers: hdrs() },
  );
  const memberRows: any[] = memberR.ok ? await memberR.json() : [];
  const memberBrains = memberRows
    .filter((m) => m.brains && m.brains.id)
    .map((m) => ({ id: m.brains.id, name: m.brains.name, role: m.role as BrainRole }));
  const brains = [
    ...owned.map((b) => ({ id: b.id, name: b.name, role: "owner" as const })),
    ...memberBrains,
  ];
  return { brains, count: brains.length };
}

async function retrieveMemory(
  brainId: string,
  query: string,
  limit = 15,
  userId?: string,
  requestId?: string,
): Promise<unknown> {
  const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
  if (!GEMINI_API_KEY) throw new Error("Embedding not configured on server");

  const safeLimit = Math.min(Math.max(1, limit), 50);
  return retrieveEntries(query, brainId, GEMINI_API_KEY, safeLimit, {
    userId,
    requestId,
    brainId,
    surface: "mcp",
  });
}

async function getUpcoming(brainId: string, days = 30): Promise<unknown> {
  return getUpcomingEntries(brainId, days);
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

// AI is forbidden from writing these in enrich.ts; the API caller must
// supply them explicitly or they'll never be set. Mirrored from
// api/_lib/enrich.ts USER_OWNED_KEYS.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function sanitizeUserMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof k !== "string" || k.length > 60) continue;
    // Normalise stringable scalars and shallow arrays only — no nested objects
    // beyond one level so we don't accept arbitrary blobs.
    if (v == null) continue;
    if (typeof v === "string" && v.length <= 2000) out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === "string" || typeof x === "number"))
      out[k] = v.slice(0, 50);
    else if (typeof v === "object") {
      // one-level deep — useful for {duration_minutes:75} etc.
      try {
        const json = JSON.stringify(v);
        if (json.length <= 4000) out[k] = JSON.parse(json);
      } catch {
        /* skip */
      }
    }
  }
  return out;
}
function buildUserMetadata(args: Record<string, unknown>): Record<string, unknown> {
  const meta = sanitizeUserMetadata(args.metadata);
  for (const key of ["scheduled_for", "due_date", "deadline", "event_date"]) {
    const v = args[key];
    if (typeof v === "string" && ISO_DATE_RE.test(v)) meta[key] = v;
  }
  return meta;
}

async function createEntry(
  userId: string,
  brainId: string,
  title: string,
  content: string,
  type = "note",
  tags: string[] = [],
  metadata: Record<string, unknown> = {},
): Promise<unknown> {
  const resolvedBrainId = brainId;

  const safeTitle = title.trim().slice(0, 200);
  const safeContent = content.slice(0, 200_000);
  const safeType = type.trim().slice(0, 50).toLowerCase() || "note";
  if (safeType === "secret") {
    throw new Error(
      "Cannot create vault entries via MCP — use the in-app Vault to encrypt secrets",
    );
  }
  const safeTags = Array.isArray(tags) ? tags.slice(0, 20).map((t) => String(t).slice(0, 50)) : [];
  const safeMeta = metadata && Object.keys(metadata).length ? metadata : null;

  // Generate embedding
  let embedding: number[] | null = null;
  if (GEMINI_API_KEY) {
    embedding = await generateEmbedding(
      buildEntryText({ title: safeTitle, content: safeContent, tags: safeTags }),
      GEMINI_API_KEY,
    );
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
      ...(safeMeta ? { metadata: safeMeta } : {}),
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
  await rebuildConceptGraph(resolvedBrainId, userId);
  return rows[0];
}

async function updateEntry(
  brainId: string,
  id: string,
  callerUserId: string,
  fields: {
    title?: string;
    content?: string;
    type?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  },
): Promise<unknown> {
  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&select=id,user_id,title,content,tags,type,metadata&limit=1`,
    { headers: hdrs() },
  );
  if (!entryRes.ok) throw new Error("Failed to fetch entry");
  const rows: any[] = await entryRes.json();
  if (!rows.length) throw new Error("Entry not found");
  if (rows[0].type === "secret") throw new Error("Entry is locked in Vault — open the app to edit");
  // Cross-user gate: a brain member may only edit entries they authored.
  // Brain owners may edit any entry in their brain.
  if (rows[0].user_id !== callerUserId) {
    const access = await checkBrainAccess(callerUserId, brainId);
    if (access?.role !== "owner") {
      throw new ApiError(403, "Only the entry author or brain owner can edit this entry");
    }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.title !== undefined) patch.title = fields.title.trim().slice(0, 200);
  if (fields.content !== undefined) patch.content = fields.content.slice(0, 200_000);
  if (fields.type !== undefined) {
    const newType = fields.type.trim().slice(0, 50).toLowerCase();
    if (newType === "secret") {
      throw new Error(
        "Cannot retype an entry to 'secret' via MCP — move it through the in-app Vault flow",
      );
    }
    patch.type = newType;
  }
  if (fields.tags !== undefined)
    patch.tags = fields.tags.slice(0, 20).map((t) => String(t).slice(0, 50));
  if (fields.metadata && Object.keys(fields.metadata).length) {
    // Merge user-supplied metadata onto the existing row. The MCP caller
    // supplies authoritative values (date pickers, explicit corrections),
    // so the new keys override existing ones.
    patch.metadata = { ...(rows[0].metadata ?? {}), ...fields.metadata };
  }

  // Regenerate embedding if searchable fields changed
  if (
    GEMINI_API_KEY &&
    (fields.title !== undefined || fields.content !== undefined || fields.tags !== undefined)
  ) {
    const merged = {
      title: (patch.title ?? rows[0].title) as string,
      content: (patch.content ?? rows[0].content) as string,
      tags: (patch.tags ?? rows[0].tags ?? []) as string[],
    };
    const embedding = await generateEmbedding(buildEntryText(merged), GEMINI_API_KEY);
    if (embedding) patch.embedding = `[${embedding.join(",")}]`;
  }

  const r = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(brainId)}`,
    {
      method: "PATCH",
      headers: hdrs({ Prefer: "return=representation" }),
      body: JSON.stringify(patch),
    },
  );
  if (!r.ok) throw new Error(`Update failed: ${await r.text().catch(() => r.status)}`);
  const updated: any[] = await r.json();
  await rebuildConceptGraph(brainId, callerUserId);
  return updated[0];
}

async function deleteEntry(brainId: string, id: string, callerUserId: string): Promise<unknown> {
  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&select=id,user_id,type&limit=1`,
    { headers: hdrs() },
  );
  if (!entryRes.ok) throw new Error("Failed to fetch entry");
  const rows: any[] = await entryRes.json();
  if (!rows.length) throw new Error("Entry not found");
  if (rows[0].type === "secret")
    throw new Error("Entry is locked in Vault — open the app to delete");
  if (rows[0].user_id !== callerUserId) {
    const access = await checkBrainAccess(callerUserId, brainId);
    if (access?.role !== "owner") {
      throw new ApiError(403, "Only the entry author or brain owner can delete this entry");
    }
  }

  const r = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(brainId)}`,
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
  const MAX_TEXT_CHARS = 32 * 1024;
  const rawText = typeof content === "string" ? content : JSON.stringify(content) ?? "";
  const text =
    rawText.length > MAX_TEXT_CHARS
      ? `${rawText.slice(0, MAX_TEXT_CHARS)}\n\n[truncated: MCP tool result exceeded 32 KB]`
      : rawText;
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  const reqId = getReqId(req);
  res.setHeader("x-request-id", reqId);
  if (!(await rateLimit(req, 150, 60_000, "mcp-preauth"))) {
    return res.status(429).json({ error: "Too many requests" });
  }

  // OAuth discovery
  if (req.query._wk) {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
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

  // OAuth token endpoint — validate em_ key, mint a short-lived signed
  // mcp_ token (HMAC-signed payload, 24h TTL). Never echoes the raw em_
  // API key back as access_token; rotating MCP sessions doesn't require
  // rotating the underlying API key.
  if (req.query._oauth === "token") {
    const authHeader = (req.headers["authorization"] as string) || "";
    const key = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const auth = key ? await resolveApiKey(key) : null;
    if (!auth)
      return res
        .status(401)
        .json({ error: "invalid_client", error_description: "Invalid or missing API key" });
    return res
      .status(200)
      .json({ access_token: signMcpAccessToken(auth), token_type: "Bearer", expires_in: 86400 });
  }

  // OAuth dynamic client registration
  if (req.query._oauth === "register") {
    return res.status(201).json({
      client_id: "everion-mcp-client",
      grant_types: ["client_credentials"],
      token_endpoint_auth_method: "none",
    });
  }

  // OAuth authorize endpoint — not used for client_credentials but required by discovery spec
  if (req.query._oauth === "authorize") {
    return res.status(400).json({
      error: "unsupported_response_type",
      error_description: "Use client_credentials grant via the token endpoint",
    });
  }

  // MCP over HTTP uses POST for all requests
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Auth
  const authHeader = (req.headers["authorization"] as string) || "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!rawKey)
    return res.status(401).json(jsonRpcErr(null, -32001, "Missing Authorization header"));

  const auth = await resolveMcpBearer(rawKey);
  if (!auth) return res.status(401).json(jsonRpcErr(null, -32001, "Invalid or revoked API key"));

  const { userId, brainId, keyId } = auth;
  const mcpRateLimitKey = (name: string) => `mcp:${userId}:${keyId}:${name}`;
  if (!(await rateLimit(req, 30, 60_000, mcpRateLimitKey("global")))) {
    return res.status(429).json(jsonRpcErr(null, -32000, "Too many requests"));
  }
  const { jsonrpc, id, method, params } = optionalBodyObject(req.body);

  if (jsonrpc !== "2.0")
    return res.status(400).json(jsonRpcErr(id ?? null, -32600, "Invalid JSON-RPC version"));

  // ── initialize ──
  if (method === "initialize") {
    return res.status(200).json(
      jsonRpcOk(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "everionmind", version: "2.0.0" },
      }),
    );
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

      if (toolName === "list_brains") {
        result = await listBrains(userId);
      } else if (toolName === "retrieve_memory") {
        if (!args.query) return res.status(200).json(jsonRpcErr(id, -32602, "query is required"));
        const target = await resolveTargetBrain(args, brainId, userId, ["owner", "member", "viewer"]);
        result = await retrieveMemory(target, args.query, args.limit, userId, reqId);
      } else if (toolName === "get_upcoming") {
        const target = await resolveTargetBrain(args, brainId, userId, ["owner", "member", "viewer"]);
        result = await getUpcoming(target, args.days);
      } else if (toolName === "search_entries") {
        if (!args.query) return res.status(200).json(jsonRpcErr(id, -32602, "query is required"));
        const target = await resolveTargetBrain(args, brainId, userId, ["owner", "member", "viewer"]);
        result = await searchEntries(target, args.query);
      } else if (toolName === "get_entry") {
        if (!args.id) return res.status(200).json(jsonRpcErr(id, -32602, "id is required"));
        const target = await resolveTargetBrain(args, brainId, userId, ["owner", "member", "viewer"]);
        result = await getEntry(target, args.id);
      } else if (toolName === "create_entry") {
        if (!args.title || !args.content) {
          return res.status(200).json(jsonRpcErr(id, -32602, "title and content are required"));
        }
        if (!(await rateLimit(req, 10, 60_000, mcpRateLimitKey("create_entry")))) {
          return res
            .status(200)
            .json(jsonRpcErr(id, -32000, "Rate limit exceeded for create_entry (10/min)"));
        }
        // Quota check: count against monthly captures budget
        const { tier, hasByok } = await getUserPlan(userId);
        let quota: Awaited<ReturnType<typeof checkAndIncrement>>;
        try {
          quota = await checkAndIncrement(userId, "captures", tier, hasByok);
        } catch {
          return res
            .status(200)
            .json(jsonRpcErr(id, -32000, "Quota service unavailable — try again"));
        }
        if (!quota.allowed) {
          log.warn("quota_exceeded", { plan: tier, action: "captures" });
          return res
            .status(200)
            .json(jsonRpcErr(id, -32000, `Monthly capture limit reached (${tier} plan)`));
        }
        const iKey = req.headers["idempotency-key"] as string | undefined;
        if (iKey) {
          // reserve atomically — replay returns the prior entry, in_flight
          // means a peer is mid-insert (surface as transient so client retries).
          const reservation = await reserveIdempotency(userId, iKey);
          if (reservation.kind === "replay") {
            result = { id: reservation.entryId, idempotent_replay: true };
          } else if (reservation.kind === "in_flight") {
            return res
              .status(200)
              .json(jsonRpcErr(id, -32000, "Duplicate request in flight — retry shortly"));
          }
        }
        if (!result) {
          const target = await resolveTargetBrain(args, brainId, userId, ["owner", "member"]);
          const userMeta = buildUserMetadata(args);
          result = await createEntry(
            userId,
            target,
            args.title,
            args.content,
            args.type,
            args.tags,
            userMeta,
          );
          // AWAIT enrichInline so the MCP tool returns a fully-enriched
          // entry. Fire-and-forget on Vercel was getting killed before the
          // pipeline finished, leaving entries with red P/I/C chips.
          if ((result as any)?.id) {
            try {
              await enrichInline((result as any).id, userId);
            } catch (err) {
              console.error("[mcp:create_entry:enrich]", (result as any).id, err);
            }
          }
          if (iKey && (result as any)?.id)
            finalizeIdempotency(userId, iKey, (result as any).id).catch(() => {});
        }
        log.info("create_entry_ok", { entry_id: (result as any)?.id });
      } else if (toolName === "update_entry") {
        if (!args.id) return res.status(200).json(jsonRpcErr(id, -32602, "id is required"));
        const updateUserMeta = buildUserMetadata(args);
        const hasMetaUpdate = Object.keys(updateUserMeta).length > 0;
        if (
          args.title === undefined &&
          args.content === undefined &&
          args.type === undefined &&
          args.tags === undefined &&
          !hasMetaUpdate
        ) {
          return res
            .status(200)
            .json(jsonRpcErr(id, -32602, "At least one field to update is required"));
        }
        const updateTarget = await resolveTargetBrain(args, brainId, userId, ["owner", "member"]);
        result = await updateEntry(updateTarget, args.id, userId, {
          title: args.title,
          content: args.content,
          type: args.type,
          tags: args.tags,
          metadata: hasMetaUpdate ? updateUserMeta : undefined,
        });
        // AWAIT — see create_entry above for rationale.
        try {
          await enrichInline(args.id, userId);
        } catch (err) {
          console.error("[mcp:update_entry:enrich]", args.id, err);
        }
      } else if (toolName === "delete_entry") {
        if (!args.id) return res.status(200).json(jsonRpcErr(id, -32602, "id is required"));
        const deleteTarget = await resolveTargetBrain(args, brainId, userId, ["owner", "member"]);
        result = await deleteEntry(deleteTarget, args.id, userId);
      } else if (toolName === "merge_entries") {
        if (!Array.isArray(args.ids) || args.ids.length < 2 || args.ids.length > 8) {
          return res
            .status(200)
            .json(jsonRpcErr(id, -32602, "ids must be an array of 2-8 entry uuids"));
        }
        // Per-tool rate limit — merge is more expensive than create. The
        // daily quota gate inside mergeEntriesOneShot is the longer-horizon
        // cap.
        if (!(await rateLimit(req, 5, 60_000, mcpRateLimitKey("merge_entries")))) {
          return res
            .status(200)
            .json(jsonRpcErr(id, -32000, "Rate limit exceeded for merge_entries (5/min)"));
        }
        try {
          result = await mergeEntriesOneShot(userId, args.ids);
          log.info("merge_entries_ok", { merged_id: (result as any)?.merged_id });
        } catch (err: unknown) {
          if (err instanceof ApiError) {
            return res.status(200).json(jsonRpcErr(id, -32000, err.message));
          }
          throw err;
        }
      } else {
        return res.status(200).json(jsonRpcErr(id, -32601, `Unknown tool: ${toolName}`));
      }

      const resourceId =
        typeof args?.brain_id === "string" && args.brain_id ? args.brain_id : brainId;
      writeAuditLog({
        userId,
        action: "mcp_tool_call",
        resourceId,
        requestId: reqId,
        metadata: {
          tool: toolName,
          key_id: keyId,
          entry_id: typeof args.id === "string" ? args.id : undefined,
          result_id:
            result && typeof result === "object" && "id" in result
              ? (result as { id?: unknown }).id
              : undefined,
        },
      });
      return res.status(200).json(jsonRpcOk(id, mcpToolResult(result)));
    } catch (err: any) {
      return res.status(200).json(jsonRpcErr(id, -32603, err.message || "Internal error"));
    }
  }

  return res.status(200).json(jsonRpcErr(id ?? null, -32601, `Unknown method: ${method}`));
}
